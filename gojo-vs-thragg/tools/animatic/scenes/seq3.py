"""Sequence 3 - THE SORCERER TAKES CONTROL (S3-01 .. S3-15).

Gojo acts for the first time.  E1 (S3-01..03) a Blue beside Thragg turns the
street into a debris storm; E2 (S3-04..07) the self-pull through the wall,
palm + elbow, the one-way grip and the throw under the Blue; E3 (S3-08..10)
the eruption, the Six Eyes POV and the instinctive dodge; E4 (S3-11..12) the
point-blank Red and its straight tunnel through three east facades;
aftermath (S3-13..15) "Now we're fighting." / the blindfold comes down.

Screen direction: Gojo screen-left, Thragg screen-right.  Gojo's attacks
travel left -> right, Thragg's right -> left.  The one crossing is the
self-pull (S3-04); Gojo's descent west in S3-07 restores it.

Timing: beats are authored against the nominal shot lengths in NOM and
rescaled to the real length with T(); contact frames are read from the
shot's own sfx cues with cue(), so they sit exactly on the sound.

World model (metres, the camera always looks north):
  * Gojo's soles at y = 6.2 on empty air at x = -6 (same as Seq 2), later on
    the street.  Thragg's height in the shot list is read as his FEET while
    he is level with Gojo; the rig is drawn by the pelvis.
  * Blue point B = (7, 22), 5 m upstage of the fighters' plane.  For a camera
    D metres south of the plane it is drawn at depth d = (D + 5) / D.
  * Every object dragged into the Blue in S3-02 is one PIECE of the compacted
    mass: the same pieces churn in the ball (S3-02..07), slump into the heap
    (S3-07) and are flung out of its west face (S3-08).
  * East block: three facades at x = 20, 40, 58 in the fighters' plane
    (EAST).  The Red axis rises 12 deg from Gojo's fingertips and punches them
    at y = 6.4, 10.6, 14.5.
  * Persistent damage (Seq-2 aftermath, the heap, the tunnel) is a pure
    function of the GLOBAL frame keyed to the shot list's event frames
    (ev / since), so every shot shows the same state.

Local helpers (no shared module is touched):
  * mirror() + thragg(look=...) - Thragg's head turned the other way from his
    body (burning east with his head turned west): the rig mirrored.
  * windows_blown / street_hole / lamp posts - same look as seq2's aftermath.
  * soft_draw / blur_img / focus_rack - depth of field for close shots.
  * gojo_cu() - Gojo close-up with blindfold-pull and hair-fall controls
    (inserts.gojo_face has no in-between states).
"""
from __future__ import annotations

import math
import random
from dataclasses import replace

from PIL import Image, ImageDraw, ImageFilter

import scenes.common as C
from engine import Cam, kf, pulse, clamp, EASE, lerp, mix_color, shade, smoothstep, PAL, FPS, OUT_W, OUT_H
import env
import fx
import inserts
import rig
from rig import GOJO, THRAGG, P, draw_fighter, solve

SEQ = 3

NOM = {"S3-01": 48, "S3-02": 72, "S3-03": 96, "S3-04": 28, "S3-05": 54, "S3-06": 44, "S3-07": 66,
       "S3-08": 72, "S3-09": 14, "S3-10": 24, "S3-11": 50, "S3-12": 92, "S3-13": 52, "S3-14": 80,
       "S3-15": 48}

TAU = math.tau


# =============================================================================
# timing
# =============================================================================

def _k(shot):
    return shot["frames"] / NOM.get(shot["id"], shot["frames"])


def T(fr, f):
    """Nominal frame f of this shot -> seconds, rescaled to the real length."""
    return f * _k(fr.shot) / FPS


def cue(fr, name, nth=0, default=0):
    """Seconds of the nth sfx cue `name` in this shot (contact frames live
    there); falls back to the nominal frame `default`."""
    hits = sorted(s["at"] for s in (fr.shot.get("sfx") or []) if s.get("cue") == name)
    if len(hits) > nth:
        return hits[nth] / FPS
    return T(fr, default)


def on2(fr):
    return (fr.f - fr.f % 2) / FPS


def seg(t, t0, t1, ease="inout"):
    return EASE[ease](clamp((t - t0) / max(1e-6, t1 - t0)))


_BY_ID = None


def _shot(sid):
    global _BY_ID
    if _BY_ID is None:
        _BY_ID = {s["id"]: s for s in C.shotlist()["shots"]}
    return _BY_ID[sid]


def ev(sid, f):
    s = _shot(sid)
    return s["start_frame"] + f * _k(s)


def since(fr, sid, f):
    """Seconds since nominal frame f of shot sid (negative = not yet)."""
    return (fr.gf - ev(sid, f)) / FPS


# =============================================================================
# geometry
# =============================================================================

def s2w(fr, u, v, d=1.0, cam=None):
    c = cam or fr.cam
    return (c.x + (u * OUT_W - OUT_W / 2) * d / c.zoom, c.y - (v * OUT_H - OUT_H / 2) * d / c.zoom)


def w2s(fr, x, y, d=1.0, cam=None):
    c = cam or fr.cam
    return (0.5 + (x - c.x) * c.zoom / d / OUT_W, 0.5 - (y - c.y) * c.zoom / d / OUT_H)


def proj(fr, x, y, d):
    """Layer coords at depth d -> the point on the fighters' plane that lands
    on the same pixel."""
    c = fr.cam
    return (c.x + (x - c.x) / d, c.y + (y - c.y) / d)


def unproj(fr, X, Y, d):
    c = fr.cam
    return (c.x + (X - c.x) * d, c.y + (Y - c.y) * d)


def dB(D):
    """Depth of the Blue point (5 m upstage) for a camera D m south."""
    return (D + 5.0) / D


def _rot(px, py, a):
    c, s = math.cos(a), math.sin(a)
    return (px * c - py * s, px * s + py * c)


def _xf(pts, cx, cy, ang_deg, s=1.0):
    a = math.radians(ang_deg)
    out = []
    for px, py in pts:
        rx, ry = _rot(px * s, py * s, a)
        out.append((cx + rx, cy + ry))
    return out


def _ang(vx, vy, facing):
    """Rig absolute angle of a limb direction vector."""
    return math.degrees(math.atan2(vx * facing, -vy))


def ik_arm(J, side, target, st, elbow_down=True):
    """(ua, fa) rig angles putting the WRIST of `side` on target."""
    S = J[f"sh_{side}"]
    s = J["scale"]
    L1, L2 = st.upper_arm * s, st.forearm * s
    dx, dy = target[0] - S[0], target[1] - S[1]
    D = max(1e-4, min(math.hypot(dx, dy), L1 + L2 - 1e-4))
    base = math.atan2(dy, dx)
    th = math.acos(clamp((L1 * L1 + D * D - L2 * L2) / (2 * L1 * D), -1.0, 1.0))
    best = None
    for b in (1, -1):
        ea = base + b * th
        E = (S[0] + L1 * math.cos(ea), S[1] + L1 * math.sin(ea))
        if best is None or ((E[1] < best[1]) == elbow_down):
            best = E
    E = best
    W = (S[0] + D * math.cos(base), S[1] + D * math.sin(base))
    f = J["facing"]
    return _ang(E[0] - S[0], E[1] - S[1], f), _ang(W[0] - E[0], W[1] - E[1], f)


def place(st, pose, facing, getter, target, scale=1.0, view="side"):
    """Pelvis position that puts getter(J) on target."""
    J0 = solve(st, pose, 0.0, 0.0, facing, scale, view)
    ex, ey = getter(J0)
    return target[0] - ex, target[1] - ey


def hand_c(J, side, st):
    wx, wy = J[f"wr_{side}"]
    d = J[f"hand_dir_{side}"]
    r = st.fist * J["scale"]
    return (wx + d[0] * r * 0.9, wy + d[1] * r * 0.9)


def tip(J, side, st, k=2.2):
    """Fingertips of a 'sign'/'point' hand (or the knuckles of a fist, k=1)."""
    cx, cy = hand_c(J, side, st)
    d = J[f"hand_dir_{side}"]
    r = st.fist * J["scale"]
    return (cx + d[0] * r * k, cy + d[1] * r * k)


def face_pt(J, st=GOJO, up=0.0, fwd_k=1.0):
    hx, hy = J["head"]
    r = st.head_r * J["scale"]
    f = J["facing"]
    hd = J["head_dir"]
    fwd = (hd[1] * f, -hd[0] * f)
    return (hx + fwd[0] * fwd_k * r + hd[0] * up * r, hy + fwd[1] * fwd_k * r + hd[1] * up * r)


def torso_pt(J, st, u=0.5, side=1.0):
    """Point on the torso outline: u along pelvis->chest, side=+1 front
    (toward facing), -1 back."""
    px, py = J["pelvis"]
    cx, cy = J["chest"]
    vx, vy = cx - px, cy - py
    L = math.hypot(vx, vy) or 1e-6
    f = J["facing"]
    nx, ny = vy / L * f, -vx / L * f          # unit normal pointing toward the facing side
    ww = st.w_waist * J["scale"] / 2
    wc = st.w_chest * J["scale"] / 2 * (0.86 if st.name == "thragg" else 0.72)
    w = lerp(ww, wc, u)
    return (px + vx * u + nx * w * side, py + vy * u + ny * w * side)


# =============================================================================
# image helpers
# =============================================================================

def blur_img(fr, r):
    fr.img = fr.img.filter(ImageFilter.GaussianBlur(r * fr.ss))
    fr.draw = ImageDraw.Draw(fr.img)


def soft_draw(fr, fn, radius=2.0, alpha=1.0):
    """Draw fn() into its own layer, blur it (shallow depth of field) and
    composite.  Returns fn's result."""
    base, base_draw = fr.img, fr.draw
    layer = Image.new("RGBA", (fr.W, fr.H), (0, 0, 0, 0))
    fr.img, fr.draw = layer, ImageDraw.Draw(layer)
    try:
        res = fn()
    finally:
        fr.img, fr.draw = base, base_draw
    if radius > 0:
        layer = layer.filter(ImageFilter.GaussianBlur(radius * fr.ss))
    if alpha < 1.0:
        a = layer.getchannel("A").point(lambda v: int(v * alpha))
        layer.putalpha(a)
    base.paste(layer, (0, 0), layer)
    return res


def focus_rack(fr, u, v, rx, ry, blur):
    """Defocus everything outside an ellipse (screen units) by `blur` px."""
    if blur < 0.3:
        return
    W, H = fr.W, fr.H
    bl = fr.img.filter(ImageFilter.GaussianBlur(blur * fr.ss))
    q = 4
    m = Image.new("L", (W // q, H // q), 255)
    dm = ImageDraw.Draw(m)
    dm.ellipse([(u - rx) * W / q, (v - ry) * H / q, (u + rx) * W / q, (v + ry) * H / q], fill=0)
    m = m.filter(ImageFilter.GaussianBlur(ry * H / q * 0.45)).resize((W, H), Image.BILINEAR)
    fr.img = Image.composite(bl, fr.img, m)
    fr.draw = ImageDraw.Draw(fr.img)


def alpha_poly(fr, pts, col, a, d=None):
    img, dr = fr.layer()
    dr.polygon(fr.pts(pts, d), fill=tuple(col) + (int(clamp(a, 0, 1) * 255),))
    fr.merge(img)


# =============================================================================
# fighters
# =============================================================================

RIM_W = (-0.6, 0.5)                                  # dusk key from screen-left: rim on the west edge
GOJO_W = replace(GOJO, rim=(255, 196, 150))          # warm sunset rim on Gojo's hair and collar
ANG = ("lean", "neck", "ua_n", "fa_n", "ua_f", "fa_f", "th_n", "sh_n", "th_f", "sh_f")


def mirror(p, neck=None):
    """Same skeleton drawn with the opposite facing: with facing flipped the
    body is unchanged but the HEAD looks the other way."""
    q = dict(p)
    for k in ANG:
        q[k] = -p[k]
    if neck is not None:
        q["neck"] = neck
    return q


def gojo(fr, pose, x, y=None, facing=1, ground=0.0, depth=1.0, switch=None, view="side", scale=1.0,
         silhouette=None, **extra):
    o = C.opts(fr, "gojo", switch, **extra)
    return draw_fighter(fr, GOJO_W, pose, x, y, facing, scale=scale, view=view, opts=o, ground=ground,
                        rim_dir=RIM_W, depth=depth, silhouette=silhouette)


def thragg(fr, pose, x, y=None, facing=-1, depth=1.0, switch=None, look=None, look_neck=None, ground=0.0,
           scale=1.0, silhouette=None, **extra):
    """look = the direction his HEAD faces when it differs from the body."""
    o = C.opts(fr, "thragg", switch, **extra)
    if look is not None and look != facing:
        pose = mirror(pose, look_neck)
        facing = -facing
    return draw_fighter(fr, THRAGG, pose, x, y, facing, scale=scale, opts=o, rim_dir=RIM_W, depth=depth,
                        ground=ground, silhouette=silhouette)


def thragg_damage(fr, J, opts, d=None):
    """Legible versions of the Red's damage for closer shots (tags come from
    the continuity ledger via C.opts): the uniform torn open across the right
    shoulder/chest and the split lip."""
    inj = set(opts.get("injuries", []))
    s = J["scale"]
    if "torn_suit" in inj:
        px, py = J["pelvis"]
        cx, cy = J["chest"]
        vx, vy = cx - px, cy - py
        L = math.hypot(vx, vy) or 1e-6
        ux, uy = vx / L, vy / L
        nx, ny = -uy, ux
        sx, sy = J["sh_n"]
        rng = random.Random("tornsuit")
        pts = []
        for k in range(9):
            a = k / 8
            ox = lerp(-0.2, 0.22, a) * s
            oy = (0.06 if k % 2 else -0.03) * s + rng.uniform(-0.02, 0.02) * s
            pts.append((sx - ux * (0.04 + oy) * 1.0 + nx * ox * 0.6, sy - uy * (0.04 + oy) + ny * ox * 0.6))
        pts += [(cx - ux * 0.3 * s + nx * 0.12 * s, cy - uy * 0.3 * s + ny * 0.12 * s),
                (cx - ux * 0.34 * s - nx * 0.1 * s, cy - uy * 0.34 * s - ny * 0.1 * s)]
        fr.poly(pts, shade(THRAGG.skin, 0.88), d=d)
        for k in range(4):
            a = k / 3
            bx = sx + nx * lerp(-0.12, 0.12, a) * s - ux * 0.05 * s
            by = sy + ny * lerp(-0.12, 0.12, a) * s - uy * 0.05 * s
            fr.line([(bx, by), (bx - ux * 0.09 * s + nx * 0.02 * s, by - uy * 0.09 * s + ny * 0.02 * s)],
                    shade(THRAGG.suit, 0.8), width_m=0.018 * s, d=d)
        fr.line([(sx - ux * 0.12 * s, sy - uy * 0.12 * s), (cx - ux * 0.28 * s, cy - uy * 0.28 * s)], (150, 30, 34),
                width_m=0.012 * s, d=d)
    if "mouth_blood" in inj:
        mx, my = face_pt(J, THRAGG, up=-0.55, fwd_k=0.82)
        fr.line([(mx, my), (mx, my - 0.07 * s)], (160, 10, 18), width_m=0.014 * s, d=d)


# ---- Gojo poses (facing east: near = RIGHT arm) -----------------------------
G_POCKETS = P("g_idle", neck=-14)
G_OUT = P("g_idle", neck=-14, ua_n=6, fa_n=2, hand_n="open")
G_TWO_UP = P("g_idle", neck=-12, ua_n=96, fa_n=124, hand_n="sign")
G_LOOSE = P("g_idle", ua_n=5, fa_n=0, hand_n="open", ua_f=-3, fa_f=-2, hand_f="open")
G_FLOAT = P("float_relaxed", ua_n=6, fa_n=-4, ua_f=-4, fa_f=-8)
G_FIRE = P("g_red", lean=6, ua_n=88, fa_n=86, ua_f=-8, fa_f=-4, hand_n="sign", hand_f="open",
           th_n=28, sh_n=4, th_f=-22, sh_f=-30)

# ---- Thragg poses -----------------------------------------------------------
T_HOVER = P("t_stand", lean=2, neck=8, ua_n=8, fa_n=4, ua_f=-6, fa_f=-2, th_n=6, sh_n=-4, th_f=-6, sh_f=-14)
T_TUG = P(T_HOVER, lean=14, neck=12, ua_n=18, fa_n=14, ua_f=4, fa_f=10, th_n=-6, sh_n=-20, th_f=-16, sh_f=-30)
# facing EAST, burning up-east away from the pull; right arm (near) trailing toward the Blue
T_BURN = P("hover", lean=44, neck=-12, ua_n=-78, fa_n=-64, ua_f=66, fa_f=98, th_n=-24, sh_n=-46,
           th_f=-40, sh_f=-68, hand_n="open", hand_f="fist")
T_BURN_UP = P(T_BURN, lean=24, neck=-4, th_n=-14, sh_n=-30, th_f=-26, sh_f=-50)
T_HOLD = P(T_BURN_UP, lean=14, ua_n=-64, fa_n=-50)          # holding position against the pull


# =============================================================================
# the street: Seq-2 aftermath (same look as seq2.aftermath) + Seq-3 state
# =============================================================================

RING_X = -6.5
POLE = (58, 62, 70)
POSTS = [(x, d) for d in (0.92, 2.05) for x in (-18.0, -10.0, 6.0, 14.0, 22.0)]
PULLED_X = (-10.0, 6.0, 14.0, 22.0)
SLAB_X = (7.0, 10.0)
CARS = [(-10.0, 1.25, (70, 74, 82)), (-2.0, 1.5, (96, 40, 36)), (6.0, 1.12, (60, 72, 58)),
        (14.0, 1.35, (150, 146, 136)), (19.0, 1.7, (40, 52, 78))]


def windows_blown(fr, x0, x1, salt, origin, lit=1.0, max_floor=7):
    depth = env._LAYERS[3][0]
    hole = shade((12, 12, 18), lit)
    edge = shade(PAL["glass"], lit * 0.7)
    for b in env._buildings(3):
        if b["x1"] < x0 or b["x0"] > x1:
            continue
        nc = max(1, int((b["x1"] - b["x0"]) / 3.0))
        cw = (b["x1"] - b["x0"]) / nc
        rng = random.Random(f"{salt}{b['seed']}")
        floors = min(int(b["h"] / 4.2) - 1, max_floor)
        for k in range(1, floors):
            for c in range(nc):
                wx = b["x0"] + c * cw
                hit = rng.random()
                if wx < x0 or wx + cw > x1 or hit > 0.62:
                    continue
                wy = k * 4.2
                fr.rect(wx + 0.35, wy + 0.65, wx + cw - 0.35, wy + 3.55, hole, d=depth)
                for j in range(3):
                    gx = wx + 0.35 + (cw - 0.7) * (j + rng.random()) / 3
                    fr.poly([(gx - 0.25, wy + 0.65), (gx + 0.25, wy + 0.65), (gx, wy + 0.65 + rng.uniform(0.4, 1.1))],
                            edge, d=depth)


def street_hole(fr, lit=1.0):
    x0, x1 = SLAB_X
    fr.ellipse((x0 + x1) / 2, -0.02, (x1 - x0) / 2 + 0.25, 0.32, fill=shade(PAL["concrete_dark"], lit * 0.9))
    fr.ellipse((x0 + x1) / 2, -0.06, (x1 - x0) / 2, 0.22, fill=shade((14, 12, 16), lit))
    rng = random.Random("hole")
    for k in range(9):
        cx = rng.uniform(x0 - 0.3, x1 + 0.3)
        s = rng.uniform(0.12, 0.3)
        fr.poly([(cx - s, 0.02), (cx, s * 0.9), (cx + s, 0.04)], shade(PAL["street"], lit * rng.uniform(0.9, 1.4)))


def ground_cracks(fr, x, r, salt, d=1.0, n=10, lit=1.0, y=0.0, width=0.05):
    rng = random.Random(salt)
    for k in range(n):
        a = rng.uniform(0, TAU)
        L = r * rng.uniform(0.5, 1.0)
        pts = [(x, y)]
        for j in range(1, 4):
            a += rng.uniform(-0.3, 0.3)
            pts.append((x + math.cos(a) * L * j / 3, y - math.sin(a) * L * j / 3 * 0.12))
        fr.line(pts, shade((14, 12, 16), lit), width_m=width, d=d)


# ---- prop shapes (all drawn about their centre, rotated, scaled) ------------
CAR_BODY = [(-2.2, -0.6), (-2.2, 0.05), (-1.2, 0.15), (-0.7, 0.6), (1.0, 0.6), (1.6, 0.1), (2.2, 0.0), (2.2, -0.6)]
CAR_WIN = [(-0.5, 0.15), (-0.4, 0.5), (0.9, 0.5), (1.3, 0.15)]


def car_shape(fr, cx, cy, ang, col, d=None, s=1.0, lit=1.0, crush=0.0):
    k = 1 - 0.4 * crush
    fr.poly(_xf([(x, y * k) for x, y in CAR_BODY], cx, cy, ang, s), shade(col, lit), d=d)
    fr.poly(_xf([(x, y * k) for x, y in CAR_WIN], cx, cy, ang, s), shade((120, 140, 160), lit * 0.6), d=d)
    for wx in (-1.3, 1.3):
        p = _xf([(wx, -0.55 * k)], cx, cy, ang, s)[0]
        fr.circle(p[0], p[1], 0.33 * s, fill=shade((14, 14, 16), lit), d=d)


def post_shape(fr, bx, by, phi, d=None, s=1.0, lit=1.0, base=True):
    """Street lamp as a rod from its base along angle phi (rad), 7.7 m."""
    col = shade((66, 68, 76), lit)
    ux, uy = math.cos(phi), math.sin(phi)
    kx, ky = bx + ux * 1.3 * s, by + uy * 1.3 * s
    a2 = phi + 0.06
    tx, ty = kx + math.cos(a2) * 6.4 * s, ky + math.sin(a2) * 6.4 * s
    fr.line([(bx, by), (kx, ky)], col, width_m=0.2 * s, d=d)
    fr.line([(kx, ky), (tx, ty)], col, width_m=0.15 * s, d=d)
    nx, ny = -math.sin(a2), math.cos(a2)
    ax, ay = tx + nx * 1.1 * s - math.cos(a2) * 0.4 * s, ty + ny * 1.1 * s - math.sin(a2) * 0.4 * s
    fr.line([(tx, ty), (ax, ay)], col, width_m=0.12 * s, d=d)
    fr.poly([(ax, ay), (ax + nx * 0.2 * s + math.cos(a2) * 0.4 * s, ay + ny * 0.2 * s + math.sin(a2) * 0.4 * s),
             (ax + math.cos(a2) * 0.5 * s, ay + math.sin(a2) * 0.5 * s)], shade((150, 140, 110), lit), d=d)
    if base:
        fr.rect(bx - 0.22 * s, by, bx + 0.22 * s, by + 0.35 * s, col, d=d)


ARM_ROD = [(-2.75, -0.08), (-0.85, 0.1), (2.75, -0.1)]


def arm_shape(fr, cx, cy, ang, d=None, s=1.0, lit=1.0):
    col = shade(POLE, lit)
    fr.line(_xf(ARM_ROD, cx, cy, ang, s), col, width_m=0.15 * s, d=d)
    fr.poly(_xf([(2.75, -0.15), (3.6, -0.1), (3.62, 0.38), (2.8, 0.36)], cx, cy, ang, s), shade((30, 32, 36), lit), d=d)
    for k, c in enumerate([(70, 20, 20), (70, 60, 20), (20, 70, 30)]):
        p = _xf([(2.95 + k * 0.24, 0.12)], cx, cy, ang, s)[0]
        fr.circle(p[0], p[1], 0.09 * s, fill=c, d=d)
    fr.poly(_xf([(-2.95, -0.2), (-2.6, -0.18), (-2.65, 0.12), (-2.93, 0.1)], cx, cy, ang, s),
            shade((120, 120, 124), lit), d=d)


def slab_shape(fr, cx, cy, ang, d=None, s=1.0, lit=1.0, L=3.0, th=0.55):
    body = [(-L / 2, -th / 2), (L / 2, -th / 2), (L / 2, th / 2), (-L / 2, th / 2)]
    fr.poly(_xf(body, cx, cy, ang, s), shade(PAL["concrete"], lit * 0.8), d=d)
    skin = [(-L / 2, th / 2 - th * 0.3), (L / 2, th / 2 - th * 0.3), (L / 2, th / 2), (-L / 2, th / 2)]
    fr.poly(_xf(skin, cx, cy, ang, s), shade(PAL["street"], lit * 1.1), d=d)
    fr.line(_xf([(-0.5, th / 2 - 0.02), (0.5, th / 2 - 0.02)], cx, cy, ang, s), shade(PAL["street_line"], lit),
            width_m=0.06 * s, d=d)


def chunk_shape(fr, cx, cy, ang, size, col, d=None, seed=0, lit=1.0):
    rng = random.Random(seed)
    pts = []
    for k in range(5):
        a = math.radians(ang) + k * TAU / 5 + rng.uniform(-0.35, 0.35)
        r = size * rng.uniform(0.55, 1.0)
        pts.append((cx + math.cos(a) * r, cy + math.sin(a) * r))
    fr.poly(pts, shade(col, lit), d=d)


def piece(fr, pc, x, y, ang, s, d=None, lit=1.0):
    k = pc["kind"]
    if k == "car":
        car_shape(fr, x, y, ang, pc["col"], d, s, lit, crush=pc.get("crush", 0.0))
    elif k == "post":
        a = math.radians(ang)
        post_shape(fr, x - math.cos(a) * 3.85 * s, y - math.sin(a) * 3.85 * s, a, d, s, lit, base=False)
    elif k == "arm":
        arm_shape(fr, x, y, ang, d, s, lit)
    elif k == "slab":
        slab_shape(fr, x, y, ang, d, s, lit, L=pc["L"], th=0.5)
    else:
        chunk_shape(fr, x, y, ang, pc["size"] * s, pc["col"], d, pc["seed"], lit)


# ---- the pieces: street props -> ball -> heap -> flung ----------------------

def heap_h(x, crest=3.2):
    u = (x - 7.5) / 3.6
    return crest * max(0.0, 1 - u * u) ** 0.75


def _make_pieces():
    rng = random.Random("s3-pieces")
    out = []
    lift = {6.0: 38, 14.0: 38, -2.0: 44, 19.0: 44, -10.0: 50}
    heap_cars = [(5.1, 0.95, 16), (6.5, 1.75, -12), (7.6, 2.62, 5), (9.0, 1.45, 22), (10.2, 0.7, -28)]
    for j, (cx, cd, col) in enumerate(CARS):
        hx, hy, ha = heap_cars[j]
        out.append(dict(kind="car", col=col, src=(cx, 0.85, cd, 0.0), go=lift[cx], pre=34, mass=2.6, strength=2.4,
                        ball_s=0.46, heap=(hx, hy, ha, 0.7), crush=0.3))
    heap_posts = [(5.6, 1.7, 128), (9.7, 1.5, 40), (8.3, 2.5, 70), (4.7, 0.6, 160), (10.6, 0.5, 20),
                  (6.9, 2.6, 105), (8.9, 2.1, 58), (5.2, 1.3, 140)]
    j = 0
    for x, d in POSTS:
        if x not in PULLED_X:
            continue
        sign = 1 if x > RING_X else -1
        hx, hy, ha = heap_posts[j]
        out.append(dict(kind="post", src=(x, 0.0, d, 0.0 if sign > 0 else math.pi), sign=sign,
                        go=36 if x in (6.0, 14.0) else 40, pre=26, mass=1.8, strength=2.0, ball_s=0.4,
                        heap=(hx, hy, ha, 0.42)))
        j += 1
    out.append(dict(kind="arm", src=(-2.75, 0.2, 1.0, 0.0), go=46, pre=40, mass=1.8, strength=2.0, ball_s=0.5,
                    heap=(6.1, 2.15, -24, 0.66)))
    slabs = [(-6.25, 0.3, 1.0, 6, 1.45, 22), (-4.75, 0.28, 1.0, -9, 1.5, 26)]
    for k in range(6):
        slabs.append((7.2 + k * 0.5, 0.15, 1.0 + 0.12 * (k % 3), 0, rng.uniform(1.0, 1.6), 18 + k * 2.6))
    heap_slabs = [(4.6, 0.35, 20), (10.5, 0.3, -18), (6.0, 0.9, -35), (8.2, 1.0, 30), (7.1, 1.3, 8),
                  (9.6, 0.65, -50), (5.5, 0.4, 60), (8.6, 0.35, 0)]
    for k, (x, y, d, a, L, go) in enumerate(slabs):
        hx, hy, ha = heap_slabs[k]
        out.append(dict(kind="slab", src=(x, y, d, a), go=go, pre=go - 4, mass=1.2, strength=1.6, ball_s=0.7,
                        heap=(hx, hy, ha, 0.85), L=L))
    for k in range(24):
        x = rng.uniform(-14, 24)
        d = rng.uniform(0.95, 1.9)
        hx = rng.uniform(4.2, 10.8)
        hy = heap_h(hx) * rng.uniform(0.15, 0.95)
        col = rng.choice([PAL["concrete"], PAL["street"], (80, 76, 72), (110, 104, 98), (60, 60, 66)])
        out.append(dict(kind="chunk", src=(x, rng.uniform(0.05, 0.3), d, rng.uniform(0, 360)), go=rng.uniform(18, 54),
                        pre=None, mass=0.8, strength=1.4, ball_s=1.0, heap=(hx, hy, rng.uniform(0, 360), 1.15),
                        size=rng.uniform(0.25, 0.6), col=col, seed=k))
    for i, pc in enumerate(out):
        pc["i"] = i
        pc.setdefault("seed", 100 + i)
        pc.setdefault("col", PAL["concrete"])
        pc.setdefault("size", 0.4)
        # slot in the compacted ball around the core (r in m, spin rad/s)
        pc["ba"] = rng.uniform(0, TAU)
        pc["br"] = 1.15 + 1.75 * math.sqrt(rng.random())
        pc["bw"] = rng.uniform(0.15, 0.4) * rng.choice((-1, 1))
        pc["bang"] = rng.uniform(0, 360)
        pc["bspin"] = rng.uniform(-25, 25)
        # arrival in S3-02 (nominal seconds): fx.pull's own timing
        t_go = pc["go"] / FPS
        pc["t_go"] = t_go
        pc["arrive"] = t_go + 0.12 * pc["mass"] + (0.55 + 0.35 * pc["mass"]) / pc["strength"]
        hx, hy = pc["heap"][0], pc["heap"][1]
        pc["west"] = hx < 6.3 and hy < 2.3
        pc["crest"] = hy > 2.35
        pc["settle_delay"] = rng.uniform(0.0, 0.14)
        pc["settle_dur"] = rng.uniform(0.28, 0.5) * (1.3 if pc["kind"] == "car" else 1.0)
        # S3-08 eruption: west-face pieces flung out (rest positions on the street)
        if pc["west"]:
            heavy = pc["kind"] in ("car", "post", "slab", "arm")
            pc["fling_to"] = (rng.uniform(1.0, 3.2) if heavy else rng.uniform(-0.5, 3.0), 0.25 if heavy else 0.1)
            pc["fling_d"] = 1.3 if heavy else 1.0
            pc["fling_T"] = rng.uniform(0.55, 0.85) if heavy else 0.5
            pc["fling_h"] = rng.uniform(2.0, 4.0) if heavy else 1.0
    # the two big pieces that bounce past him on either side (one in front, one behind)
    past = [pc for pc in out if pc["west"] and pc["kind"] in ("car", "slab")][:2]
    for pc, (xx, dd) in zip(past, ((-9.0, 0.86), (-10.5, 1.32))):
        pc["fling_to"] = (xx, 0.3)
        pc["fling_d"] = dd
        pc["fling_T"] = 0.9
        pc["fling_h"] = 1.3
    out.sort(key=lambda p: (p["kind"] == "chunk", p["heap"][1]))
    return out


PIECES = _make_pieces()


def ball_pos(pc, cx, cy, tg, scale=1.0, squash=0.0):
    a = pc["ba"] + tg * pc["bw"]
    r = pc["br"] * (1 + 0.05 * math.sin(tg * 3.1 + pc["i"])) * scale
    return (cx + math.cos(a) * r, cy + math.sin(a) * r * (1 - squash)), pc["bang"] + tg * pc["bspin"]


def draw_ball(fr, cx, cy, d=None, tg=None, fill_t=None, scale=1.0, squash=0.0, lit=1.0, skip=None):
    """The compacted mass churning around the Blue core (pieces only)."""
    tg = C.tg(fr) if tg is None else tg
    for pc in PIECES:
        if fill_t is not None and fill_t < pc["arrive"]:
            continue
        if skip and skip(pc):
            continue
        (x, y), ang = ball_pos(pc, cx, cy, tg, scale, squash)
        piece(fr, pc, x, y, ang, pc["ball_s"] * scale, d, lit)


def mass(fr, x, y, t, d, strength=1.0, fill_t=None, scale=1.0, squash=0.0, bx=None, by=None, r=0.55, lit=1.0):
    """Blue + its compacted mass: a translucent grit cloud, the Blue (core,
    lensing ring, bright edge), the pieces packed in a ring around it."""
    tg = C.tg(fr)
    k = 1.0 if fill_t is None else clamp((fill_t - 1.6) / 1.2)
    if k > 0:
        img, dr = fr.layer()
        X, Y = fr.P(x, y, d)
        R = fr.S(2.7 * scale, d)
        dr.ellipse([X - R, Y - R * (1 - squash), X + R, Y + R * (1 - squash)], fill=(44, 40, 44, int(150 * k)))
        fr.merge(img)
    bx = x if bx is None else bx
    by = y if by is None else by
    if strength > 0:
        blue_point(fr, bx, by, t, d, strength, r=r)
    draw_ball(fr, x, y, d, tg, fill_t, scale, squash, lit)


def heap_state(fr):
    return dict(settle=since(fr, "S3-07", 22), crest_shift=since(fr, "S3-08", 40), bulge=since(fr, "S3-08", 46),
                erupt=since(fr, "S3-08", 53), stripped=since(fr, "S3-11", 8))


def heap(fr, lit=1.0, d=None, ball_c=(7.5, 2.7)):
    """The Blue heap mid-street (x = 4..11, crest 3.2 m) in whatever state the
    global frame says: slumping (S3-07 f22-36), the crest car shifting
    (S3-08 f40), the west face bulging (f46) and blown open (f53), the crest
    stripped east by the Red (S3-11 f8)."""
    st = heap_state(fr)
    if st["settle"] < 0:
        return
    tg = C.tg(fr)
    erupted = st["erupt"] >= 0
    stripped = st["stripped"] >= 0
    crest = 2.55 if stripped else 3.2
    bulge = clamp(st["bulge"] / (6 / FPS)) if 0 <= st["bulge"] and not erupted else 0.0
    # rubble mound under the pieces
    pts = [(3.7, 0.0)]
    for k in range(25):
        x = 3.7 + k * (11.3 - 3.7) / 24
        h = min(heap_h(x), crest) * 0.92
        if erupted and x < 6.2:
            h *= 0.35 + 0.65 * clamp((x - 4.0) / 2.2)
        pts.append((x, h))
    pts.append((11.3, 0.0))
    if st["settle"] < 0.45:
        k = clamp(st["settle"] / 0.45)
        pts = [(x, y * k) for x, y in pts]
    fr.poly(pts, shade((52, 48, 50), lit), d=d)
    if erupted:
        # the hole he came out of: a dark mouth in the west face
        fr.poly([(4.2, 0.0), (4.35, 0.7), (4.15, 1.05), (4.6, 1.3), (4.8, 1.7), (5.2, 1.55), (5.55, 1.85), (5.8, 1.3),
                 (6.1, 1.0), (5.95, 0.4), (6.15, 0.0)], shade((30, 26, 30), lit), d=d)
    for pc in PIECES:
        hx, hy, ha, hs = pc["heap"]
        if stripped and pc["crest"]:
            continue
        if erupted and pc["west"]:
            continue
        if st["settle"] < 0.6:
            # slumping out of the ball: gravity on y, a late bounce, cars rock
            u = clamp((st["settle"] - pc["settle_delay"]) / pc["settle_dur"])
            (bx, by), bang = ball_pos(pc, ball_c[0], ball_c[1], tg, 1.0, 0.18)
            x = lerp(bx, hx, EASE["out"](u))
            y = lerp(by, hy, EASE["in"](u))
            ang = lerp(bang, ha, EASE["out"](u))
            s = lerp(pc["ball_s"], hs, u)
        else:
            x, y, ang, s = hx, hy, ha, hs
        if 0 < st["settle"] < 0.9 and pc["kind"] == "car":
            ang += 6 * math.sin(st["settle"] * 18) * math.exp(-st["settle"] * 4)
        if pc["crest"] and pc["kind"] == "car" and st["crest_shift"] >= 0 and not stripped:
            k = seg(st["crest_shift"], 0, 0.3, "out")
            ang += 5 * k
            x += 0.12 * k
        if pc["west"] and bulge > 0:
            x -= 0.25 * bulge
            y += 0.12 * bulge * math.sin(pc["i"])
            ang += 8 * bulge * (1 if pc["i"] % 2 else -1)
        piece(fr, pc, x, y, ang, s, d, lit)
    if erupted:
        # what was blown out of the west face: arcs, a bounce, then rest on the street
        te = st["erupt"]
        for pc in PIECES:
            if not pc["west"]:
                continue
            hx, hy, ha, hs = pc["heap"]
            tx, ty = pc["fling_to"]
            Tf = pc["fling_T"]
            u = clamp(te / Tf)
            x = lerp(hx, tx, EASE["out"](u))
            y = lerp(hy, ty, u) + pc["fling_h"] * 4 * u * (1 - u)
            if te > Tf:
                b = te - Tf
                y += 0.6 * pc["fling_h"] * 0.25 * max(0.0, math.sin(min(math.pi, b * 7))) * math.exp(-b * 2)
            ang = ha + 260 * EASE["out"](u) * (1 if pc["i"] % 2 else -1)
            dd = lerp(1.0, pc["fling_d"], u) if d is None else d
            piece(fr, pc, x, y, ang, hs, dd, lit)


# ---- the street in Seq 3 ----------------------------------------------------

def street_props(fr, lit=1.0):
    """The props the Blue drags away in S3-02 - only before it."""
    for x, d in POSTS:
        if x in PULLED_X:
            post_shape(fr, x, 0.08, 0.0 if x > RING_X else math.pi, d, 1.0, lit)
    for pc in PIECES:
        if pc["kind"] == "car":
            x, y, d, a = pc["src"]
            car_shape(fr, x, y, a, pc["col"], d, 1.0, lit)
    arm_shape(fr, -2.75, 0.2, 0.0, None, 1.0, lit)
    for x, y, a, L in ((-6.25, 0.3, 6, 1.45), (-4.75, 0.28, -9, 1.5)):
        slab_shape(fr, x, y, a, None, 1.0, lit, L=L, th=0.5)


def stage(fr, lit=1.0, gantry=True, props=None, extra=()):
    flags = set(extra)
    if since(fr, "S3-12", 10) >= 0:
        flags.add("east_smash")
    st = C.stage(fr, SEQ, "street", extra=tuple(flags), lit=lit, gantry_on=gantry)
    windows_blown(fr, -40.0, 2.0, "wwest", -6.0, lit)
    windows_blown(fr, 5.0, 44.0, "weast", -6.0, lit)
    street_hole(fr, lit)
    pulled = since(fr, "S3-02", 0) >= 0
    for x, d in POSTS:
        if x in PULLED_X and pulled:
            # torn-out base left in the sidewalk
            fr.rect(x - 0.22, 0.0, x + 0.22, 0.25, shade((66, 68, 76), lit), d=d)
            fr.line([(x - 0.1, 0.25), (x + 0.05, 0.42)], shade((120, 120, 124), lit), width_m=0.05, d=d)
        elif x not in PULLED_X:
            post_shape(fr, x, 0.08, 0.0 if x > RING_X else math.pi, d, 1.0, lit)
    if props if props is not None else not pulled:
        street_props(fr, lit)
    if since(fr, "S3-07", 14) >= 0:
        # Thragg's impact crater under the heap
        fr.ellipse(8.0, -0.05, 2.4, 0.36, fill=shade(PAL["concrete_dark"], lit))
        ground_cracks(fr, 8.0, 6.0, "s3crater", n=12, lit=lit)
    return st


def lit_city(fr, k=1.0):
    """Warm glow and speckle of the lit city across the river (screen-left)."""
    fr.soft_circle(0.02, 0.56, 0.35, shade((140, 80, 40), 0.7 * k), world=False)
    rng = fr.srng("litcity")
    for i in range(70):
        u = rng.uniform(0.0, 0.2) ** 1.3
        v = rng.uniform(0.47, 0.56)
        fr.s_rect(u, v, u + 0.0025, v + 0.003, shade(PAL["window_lit"], k * rng.uniform(0.5, 1.0)))


# =============================================================================
# the east block (three facades the Red punches through)
# =============================================================================

EAST = [(20.0, 33.0, 30.0), (40.0, 52.0, 36.0), (58.0, 72.0, 42.0)]
RED_O = (-3.4, 1.4)
RED_A = math.radians(12.0)
RED_U = (math.cos(RED_A), math.sin(RED_A))
HIT_F = (2, 6, 10)


def red_y(x):
    return RED_O[1] + (x - RED_O[0]) * math.tan(RED_A)


def b3_fail(fr):
    """0..4: how many of the third building's floors have slumped (S3-12 f14-50,
    staggered, on 2s)."""
    s = since(fr, "S3-12", 14)
    if s < 0:
        return 0.0
    s = math.floor(s * 12) / 12
    return clamp(s / (36 / FPS)) * 4


def building(fr, i, lit=1.0, d=None):
    x0, x1, h = EAST[i]
    rng = random.Random(f"east{i}")
    body = shade((40, 40, 54), lit)
    band = shade((30, 30, 42), lit)
    glass = shade((26, 30, 44), lit)
    sag = 0.0
    if i == 2:
        sag = 0.9 * clamp(b3_fail(fr) / 4)
    top = [(x0, h), (x0 + 6, h - sag * 0.6), (x0 + 8, h - sag), (x1, h)]
    fr.poly([(x0, 0)] + top + [(x1, 0)], body, d=d)
    fr.rect(x0 - 0.3, h - 0.4 - sag * 0.5, x1 + 0.3, h + 0.6 - sag * 0.2, shade((50, 50, 64), lit), d=d)
    nb = int((x1 - x0) / 3.0)
    floors = int(h / 4.2)
    for fl in range(floors):
        y = fl * 4.2
        for c in range(nb):
            wx = x0 + 0.35 + c * (x1 - x0) / nb
            ww = (x1 - x0) / nb - 0.7
            r = rng.random()
            col = glass if r > 0.05 else shade(mix_color(PAL["window_lit"], glass, 0.7), lit)
            fr.rect(wx, y + 0.9, wx + ww, y + 3.7, col, d=d)
        fr.line([(x0, y), (x1, y)], band, width_m=0.45, d=d)
    fr.line([(x0, 0), (x0, h)], shade(mix_color(body, PAL["rim_warm"], 0.4), lit), width_m=0.5, d=d)
    # Red tunnel: entry notch (west wall), blown windows along the line, exit notch (east wall)
    s_hit = since(fr, "S3-12", HIT_F[i])
    if s_hit >= 0:
        dark = shade((10, 10, 14), lit)
        ye, yx = red_y(x0), red_y(x1)
        span = (x1 - x0) if i < 2 else 7.0
        xend = x0 + span
        yend = red_y(xend)
        rr = random.Random(f"tun{i}")
        top_pts, bot_pts = [], []
        for k in range(9):
            u = k / 8
            x = x0 + span * u
            y = red_y(x)
            top_pts.append((x, y + 1.5 + rr.uniform(-0.5, 0.6)))
            bot_pts.append((x, y - 1.4 - rr.uniform(-0.5, 0.6)))
        fr.poly([(x0 - 0.2, ye - 1.9)] + bot_pts + [(xend + (0.3 if i < 2 else 0), yend)] + top_pts[::-1] +
                [(x0 - 0.2, ye + 2.1)], dark, d=d)
        # cracks radiating from the punch holes
        for (cx, cy) in ((x0, ye), (xend, yend)):
            for k in range(7):
                a = rr.uniform(0, TAU)
                L = rr.uniform(2.0, 4.5)
                fr.line([(cx, cy), (cx + math.cos(a) * L * 0.5, cy + math.sin(a) * L * 0.5 + 0.3),
                         (cx + math.cos(a) * L, cy + math.sin(a) * L)], shade((18, 18, 24), lit), width_m=0.18, d=d)
    if i == 2:
        nf = b3_fail(fr)
        if nf > 0:
            # floors slumping from the 4th down: the punched bays become one dark cavity
            ytop = 16.8 - sag
            ybot = max(0.0, 16.8 - nf * 4.2)
            cav = [(58.4, ybot), (58.3, ytop - 0.6), (60.0, ytop), (62.5, ytop - 0.4), (65.6, ytop + 0.2),
                   (66.0, ybot + 0.5), (66.2, ybot)]
            fr.poly(cav, shade((12, 11, 15), lit), d=d)
            for k in range(4):
                if nf > k:
                    u = clamp(nf - k)
                    y0 = 16.8 - k * 4.2
                    yy = lerp(y0, 1.0 + 0.6 * (3 - k), EASE["in"](u))
                    a = lerp(0, (-18, 14, -9, 22)[k], u)
                    slab_shape(fr, 62.2 + 0.3 * k, yy, a, d, 1.0, lit * 0.8, L=7.6, th=0.45)
            # lobby rubble pile
            pile = [(57.6, 0.0), (58.4, 1.4), (59.6, 2.4), (61.0, 2.8), (62.8, 2.5), (64.6, 1.9), (66.4, 0.8), (67.0, 0.0)]
            k = clamp(nf / 2)
            fr.poly([(x, y * k) for x, y in pile], shade((70, 66, 66), lit), d=d)


def east_block(fr, lit=1.0, d=None):
    for i in range(3):
        building(fr, i, lit, d)


def dust_curtain(fr, x, y_top, t, width=3.0, salt="dcur", d=None, alpha=110, rate=1.0, drop=None):
    """Grey dust pouring from a hole and spilling down to the street."""
    if t < 0:
        return
    rng = random.Random(salt)
    img, dr = fr.layer()
    drop = y_top if drop is None else drop
    k = clamp(t / 0.6)
    for i in range(26):
        ph = (rng.random() + t * rate * rng.uniform(0.18, 0.35)) % 1.0
        y = y_top - drop * ph ** 1.4
        if y < 0:
            y = 0.2
        x_ = x + rng.uniform(-0.5, 0.5) * width + ph * width * 0.6 * rng.uniform(-1, 1)
        r = width * (0.35 + 0.8 * ph) * rng.uniform(0.6, 1.1)
        X, Y = fr.P(x_, y, d)
        R = fr.S(r, d)
        c = shade(PAL["dust"], rng.uniform(0.62, 0.82))
        dr.ellipse([X - R, Y - R * 0.8, X + R, Y + R * 0.8], fill=c + (int(alpha * k * (1 - ph * 0.6)),))
    fr.merge(img)


# =============================================================================
# technique pieces
# =============================================================================

def impact_k(fr, x, y, ts, kind="light", k=0.4, **kw):
    """fx.impact at k x its size: drawn at depth 1/k, re-anchored on (x, y)."""
    dd = 1.0 / k
    X, Y = unproj(fr, x, y, dd)
    fx.impact(fr, X, Y, ts, kind=kind, d=dd, **kw)


def dimple(fr, x, y, ts, r0=0.4, d=None):
    """Blue at impact: a tight inward ring (0.4 m -> 0 over 3 frames) with a
    little air and dust sucked toward the contact point; never a flash."""
    u = ts / (3 / FPS)
    if not (0 <= u < 1):
        return
    rr = r0 * (1 - u)
    fr.circle(x, y, max(0.01, rr), outline=(170, 210, 255), width=2, d=d)
    rng = fr.srng(f"dimple{x:.2f}")
    for i in range(14):
        a = rng.uniform(0, TAU)
        r = rr * rng.uniform(0.9, 1.6)
        fr.line([(x + math.cos(a) * r, y + math.sin(a) * r),
                 (x + math.cos(a) * r * 0.7, y + math.sin(a) * r * 0.7)], shade(PAL["dust"], 1.1), width_px=2, d=d)
    px, py = fr.P(x, y, d)
    fr.post.append(("lens", px / fr.ss, py / fr.ss, fr.S(r0 * 1.6, d) / fr.ss, -0.3 * (1 - u), fr.t))


def pinprick(fr, x, y, k, d=None):
    """The self-pull target: a pin-prick of lensed space, no core, a 1-px blue
    ring (must not read as a second Blue orb)."""
    if k <= 0:
        return
    px, py = fr.P(x, y, d)
    fr.post.append(("lens", px / fr.ss, py / fr.ss, fr.S(0.9, d) / fr.ss, -0.35 * k, fr.t))
    fr.circle(x, y, 0.12, outline=shade((110, 180, 255), k), width=1, d=d)


def bend(fr, u, v, R_px, k, t):
    """Pre-Blue: colourless screen-space pinch (no glow)."""
    if R_px < 2 or k <= 0:
        return
    fr.post.append(("lens", u * OUT_W, v * OUT_H, R_px, -k, t))


def blue_point(fr, x, y, t, d, strength=1.0, r=0.8):
    fx.blue(fr, x, y, t, r=r, strength=strength, streaks=60, d=d)


def stream(fr, target_uv, t, n=90, region=((-0.15, 0.55), (-0.25, 0.05)), depths=(0.6, 2.4), salt="st",
           skip=None, k_density=1.0, big=0.15, period=(0.7, 1.6), lit=1.0):
    """Debris flowing in straight, accelerating lines toward the Blue (screen
    space target), light pieces faster than heavy ones.  skip(u, v) hides
    pieces (a gap in the wall)."""
    rng = random.Random(salt)
    tu, tv = target_uv
    for i in range(n):
        su = rng.uniform(*region[0])
        sv = rng.uniform(*region[1])
        heavy = rng.random() < big
        per = rng.uniform(*period) * (1.6 if heavy else 1.0)
        ph = rng.random()
        dd = rng.uniform(*depths)
        kind = rng.random()
        seed = rng.random()
        if rng.random() > k_density:
            continue
        u = ((t / per) + ph) % 1.0
        e = u * u
        pu, pv = lerp(su, tu, e), lerp(sv, tv, e)
        if skip and skip(pu, pv):
            continue
        x, y = s2w(fr, pu, pv, dd)
        L = math.hypot(tu - su, tv - sv) or 1e-6
        dx, dy = (tu - su) / L, -(tv - sv) / L
        ang = math.degrees(math.atan2(dy, dx))
        if heavy:
            if kind < 0.4:
                car_shape(fr, x, y, ang + 30 * math.sin(t * 3 + i), (70 + int(seed * 80), 60, 64), dd, 0.5, lit)
            elif kind < 0.7:
                slab_shape(fr, x, y, ang + t * 90 * (seed - 0.5), dd, 0.8, lit, L=2.2, th=0.45)
            else:
                post_shape(fr, x, y, math.radians(ang), dd, 0.5, lit, base=False)
        else:
            sz = 0.08 + 0.3 * seed
            if kind < 0.35:
                gl = 0.7 + 0.5 * math.sin(t * 25 + i)
                fr.poly([(x, y), (x + sz * 0.8, y + sz * 0.3), (x + sz * 0.2, y + sz)], shade(PAL["glass"], gl), d=dd)
            else:
                chunk_shape(fr, x, y, t * 200 * (seed - 0.5), sz, shade(PAL["concrete"], 0.7 + 0.5 * seed), dd, i, lit)
            # streak behind (speed)
            fr.line([(x, y), (x - dx * sz * 4 * (0.3 + e), y - dy * sz * 4 * (0.3 + e))],
                    shade(PAL["dust"], 0.8 * lit), width_px=1 + int(2 * seed), d=dd)


def cape_shreds(fr, t0, origin, t, n=14, salt="shred", d=None):
    """Crimson ribbons torn off on the Red's release frame, fluttering down."""
    if t < t0:
        return
    rng = random.Random(salt)
    tt = t - t0
    for i in range(n):
        vx = rng.uniform(2, 14)
        vy = rng.uniform(-1, 3)
        x = origin[0] + vx * (1 - math.exp(-3 * tt)) / 3 + 0.3 * math.sin(tt * 4 + i)
        y = origin[1] + vy * (1 - math.exp(-3 * tt)) / 3 - 0.55 * tt + rng.uniform(-0.6, 0.6)
        a = tt * rng.uniform(3, 8) + i
        L = rng.uniform(0.25, 0.6)
        w = rng.uniform(0.06, 0.12)
        pts = [(x, y), (x + math.cos(a) * L, y + math.sin(a) * L * 0.6),
               (x + math.cos(a) * L + w, y + math.sin(a) * L * 0.6 - w), (x + w, y - w * 1.4)]
        fr.poly(pts, shade(THRAGG.accent, rng.uniform(0.55, 0.85)), d=d)


# =============================================================================
# S3-01  MS low angle: two fingers rise; the scenery beside Thragg bends
# =============================================================================

GX0, GSOLE0 = -6.0, 6.2


def lookup_plate(fr, lit=1.0, cam_env=None, blur=1.2):
    """Low-angle backdrop: the street set seen by a camera tilted up (drawn
    with a wider, higher plate camera), softened."""
    real = fr.cam
    fr.cam = cam_env
    C.stage(fr, SEQ, "street", lit=lit, gantry_on=False)
    windows_blown(fr, -40.0, 2.0, "wwest", -6.0, lit)
    windows_blown(fr, 5.0, 44.0, "weast", -6.0, lit)
    fr.cam = real
    if blur:
        blur_img(fr, blur)


def s3_01(fr):
    t, dur = fr.t, fr.dur
    ta = on2(fr)
    t_lock = T(fr, 26)
    t_bend = cue(fr, "blue", 0, 30) - T(fr, 2)
    zoom = 470.0 * (1 + 0.04 * seg(t, T(fr, 20), dur, "inout"))
    # Gojo framed at screen-left; the push-in is anchored on his raised hand
    A = (-5.55, 7.6)
    Au = (0.43, 0.38)
    fr.cam = Cam(A[0] - (Au[0] - 0.5) * OUT_W / zoom, A[1] + (Au[1] - 0.5) * OUT_H / zoom, zoom)
    lookup_plate(fr, cam_env=Cam(-2.0, 62.0, 30.0), blur=1.4)
    env.gantry(fr, env.GANTRY_X, sheared=True)
    # ---- Thragg: small, soft, high in frame-right; rock-still, only his cape moves
    dT = 7.0
    tx, ty = s2w(fr, 0.79, 0.16, dT)
    soft_draw(fr, lambda: thragg(fr, T_HOVER, tx, ty, -1, depth=dT, cape_wind=(0.5, -0.3)), radius=1.3)
    # ---- the bend: colourless pinch beside (left of and below) Thragg
    bu, bv = 0.715, 0.29
    if t >= t_bend:
        g = seg(t, t_bend, dur, "out")
        bend(fr, bu, bv, 0.065 * OUT_W * g, 0.24 * g, t)
    # ---- Gojo: hands in pockets, chin up; the right hand slides out (f8-16) and rises (f16-26)
    p_out = seg(ta, T(fr, 8), T(fr, 16), "inout")
    p_up = seg(ta, T(fr, 16), t_lock, "out")
    pose = rig.blend(rig.blend(G_POCKETS, G_OUT, p_out), G_TWO_UP, p_up)
    J = gojo(fr, pose, GX0, None, 1, ground=GSOLE0)
    # ambient dust drifting across the intersection
    rng = fr.srng("amb")
    for i in range(26):
        x = -9 + ((rng.uniform(0, 12) + C.tg(fr) * rng.uniform(0.3, 0.8)) % 12)
        y = 5.6 + rng.uniform(0, 3.5) + 0.1 * math.sin(C.tg(fr) + i)
        fr.circle(x, y, 0.008 + 0.01 * rng.random(), fill=shade(PAL["dust"], 1.1), d=rng.uniform(0.8, 1.6))


# =============================================================================
# S3-02  EWS from street level: the Blue - everything comes up, lightest first
# =============================================================================

def _thragg_tug(t, t8, t12, dur):
    """Thragg's hover (12, 30) tugged to (11.5, 29.5) over S3-02."""
    k = seg(t, t12, dur, "out")
    return lerp(12.0, 11.5, k), lerp(30.0, 29.5, k)


def s3_02(fr):
    t, dur = fr.t, fr.dur
    D = 40.0
    dBl = dB(D)
    fr.cam = Cam(3.0, kf(t, [(T(fr, 30), 15.0), (dur, 15.9)]), 31.0)
    stage(fr, props=False)
    tg = C.tg(fr)
    form = seg(t, 0, T(fr, 4), "out")
    Bp = proj(fr, 7.0, 22.0, dBl)
    tn = t / _k(fr.shot)                     # nominal seconds: piece schedules are authored in S3-02 frames

    # ---- lamp posts at x = -18 stay flat; mast pole shudders (overlay) ----
    if T(fr, 12) <= t <= T(fr, 60):
        fr.line([(-7.0, 0.0), (-7.0 + 0.07 * math.sin(t * 47), 6.4)], POLE, width_m=0.2)

    # ---- dust & paper (f4-14), glass (f10-24): fx.pull, straight lines -------
    rng = fr.srng("dust")
    for i in range(110):
        x0, y0, d0 = rng.uniform(-15, 25), rng.uniform(0.0, 1.4), rng.uniform(0.9, 2.2)
        ts = T(fr, 4) + rng.random() * T(fr, 8)
        paper = i % 6 == 0
        X0, Y0 = proj(fr, x0, y0, d0)
        x, y, u = fx.pull((X0, Y0), Bp, t, ts, mass=0.1, strength=1.3)
        if u >= 1 or t < ts:
            if t < ts and not paper:
                continue
            if u >= 1:
                continue
        if paper:
            a = t * 9 + i
            fr.poly([(x + math.cos(a) * 0.25, y + math.sin(a) * 0.15), (x - math.sin(a) * 0.2, y + math.cos(a) * 0.2),
                     (x - math.cos(a) * 0.25, y - math.sin(a) * 0.15)], (225, 220, 210))
        else:
            fr.circle(x, y, 0.06, fill=shade(PAL["dust"], 1.05))
        if 0.05 < u < 1:
            L_ = math.hypot(X0 - x, Y0 - y) or 1
            fr.line([(x, y), (x + (X0 - x) / L_ * 1.2 * u, y + (Y0 - y) / L_ * 1.2 * u)], shade(PAL["dust"], 0.8),
                    width_px=1)
    rng = fr.srng("glass")
    for i in range(70):
        x0, y0 = rng.uniform(-40, 44), rng.uniform(4.0, 28.0)
        X0, Y0 = proj(fr, x0, y0, 2.8)
        ts = T(fr, 10) + rng.random() * T(fr, 10)
        if t < ts:
            continue
        x, y, u = fx.pull((X0, Y0), Bp, t, ts, mass=0.3, strength=1.3)
        if u >= 1:
            continue
        g = 0.7 + 0.5 * math.sin(t * 30 + i)
        fr.poly([(x, y), (x + 0.3, y + 0.12), (x + 0.1, y + 0.35)], shade(PAL["glass"], g))
        L_ = math.hypot(X0 - x, Y0 - y) or 1
        fr.line([(x, y), (x + (X0 - x) / L_ * 1.5 * u, y + (Y0 - y) / L_ * 1.5 * u)], shade(PAL["glass"], 0.6),
                width_px=1)

    # ---- the heavy props: peel / drag / slide, then a straight pull ----------
    def bpos(pc):
        (bx, by), _ = ball_pos(pc, Bp[0], Bp[1], tg, 1.0 / dBl)
        return bx, by
    for pc in PIECES:
        x0, y0, d0, a0 = pc["src"]
        X0, Y0 = proj(fr, x0, y0, d0)
        s0 = 1.0 / d0
        if tn >= pc["arrive"]:
            continue
        pre = pc["pre"] / FPS if pc["pre"] is not None else None
        go = pc["t_go"]
        ang = math.degrees(a0) if pc["kind"] == "post" else a0
        dx = 0.0
        if pre is not None and tn >= pre:
            k = clamp((tn - pre) / max(1e-3, go - pre))
            toward = 1 if Bp[0] > X0 else -1
            if pc["kind"] == "car":
                dx = toward * 1.6 * k * k
                ang = toward * 26 * EASE["in"](k)          # tips onto two wheels toward the point
            elif pc["kind"] == "post":
                dx = toward * 0.5 * k
                aim = math.degrees(math.atan2(Bp[1] - Y0, Bp[0] - X0))
                ang = lerp(ang, aim, 0.3 * EASE["in"](k)) if abs(aim - ang) < 180 else ang
            elif pc["kind"] == "slab":
                ang = a0 + toward * 38 * EASE["out"](k)    # asphalt peels up in the pull direction
            elif pc["kind"] == "arm":
                dx = toward * 1.0 * k
        if tn < go:
            X, Y, s = X0 + dx * s0, Y0, s0
            if pc["kind"] == "post":
                rad = math.radians(ang)
                post_shape(fr, X, Y + 0.08 * s, rad, None, s)
                continue
            if pc["kind"] == "car":
                # tipping about the downstream wheels
                Y = Y0 + abs(math.sin(math.radians(ang))) * 1.1 * s
            if pc["kind"] == "slab" and pre is not None and tn >= pre:
                Y = Y0 + 0.4 * abs(math.sin(math.radians(ang))) * s
            piece(fr, pc, X, Y, ang, s, None)
            continue
        tgt = bpos(pc)
        x, y, u = fx.pull((X0 + dx * s0, Y0), tgt, tn, go, mass=pc["mass"], strength=pc["strength"])
        s = lerp(s0, pc["ball_s"] / dBl, u)
        aa = lerp(ang, pc["bang"], u) if pc["kind"] != "post" else lerp(
            ang, math.degrees(math.atan2(tgt[1] - Y0, tgt[0] - X0)), min(1.0, u * 3))
        if u > 0.04:
            xp, yp, _ = fx.pull((X0 + dx * s0, Y0), tgt, tn - 0.07, go, mass=pc["mass"], strength=pc["strength"])
            fx.trail(fr, [(lerp(xp, x, k / 4), lerp(yp, y, k / 4)) for k in range(5)], width_m=0.9 * s, alpha=60,
                     color=(200, 190, 180))
        piece(fr, pc, x, y, aa, s, None)

    # ---- the mass compacting around the core, then the Blue on top ----------
    if t >= T(fr, 30):
        stream(fr, w2s(fr, *Bp), tg, n=int(70 * seg(t, T(fr, 30), T(fr, 44))), region=((0.1, 0.9), (0.72, 1.0)),
               depths=(0.95, 1.6), salt="s302late", big=0.0, period=(0.6, 1.2))
    if t < T(fr, 4):
        # the bend collapsing into the focal point
        u, v = w2s(fr, 7.0, 22.0, dBl)
        bend(fr, u, v, lerp(0.06 * OUT_W, 40, form), 0.16 + 0.1 * form, t)
    mass(fr, 7.0, 22.0, t, dBl, strength=form, fill_t=tn, r=0.6 * (0.3 + 0.7 * form))

    # ---- Thragg upper right: cape snaps to the point (f8), body tilts (f12) ---
    t8, t12 = T(fr, 8), T(fr, 12)
    tx, ty = _thragg_tug(t, t8, t12, dur)
    tilt = seg(t, t12 - T(fr, 2), t12 + T(fr, 2), "out")
    pose = rig.blend(T_HOVER, T_TUG, tilt)
    snap = seg(t, t8 - 1 / FPS, t8 + 1 / FPS, "out")
    wind = (lerp(0.5, -0.53, snap), lerp(-0.3, -0.85, snap))
    thragg(fr, pose, tx, ty, -1, cape_wind=wind)
    # ---- Gojo small at left: still, fingers raised --------------------------
    gojo(fr, G_TWO_UP, GX0, None, 1, ground=GSOLE0)


# =============================================================================
# S3-03  MS tracking: the tangential burn; the arc; the wall; "he can move me"
# =============================================================================

def _arc(fr, t):
    k = seg(t, 0, T(fr, 60), "inout")
    a = math.radians(lerp(59.0, 45.0, k))
    r = lerp(8.75, 5.66, k)
    return 7.0 + r * math.cos(a), 22.0 + r * math.sin(a)


def _s303_thragg(fr, t):
    """(pose, x, y, facing, look, look_neck, wind) of Thragg at time t."""
    x, y = _arc(fr, t)
    t6, t9, t12 = T(fr, 6), T(fr, 9), T(fr, 12)
    to_b = (7.0 - x, 22.0 - y)
    L = math.hypot(*to_b)
    wind = (to_b[0] / L, to_b[1] / L)
    if t < t9:
        k = seg(t, 0, t6, "inout")
        pose = P(T_TUG, lean=lerp(14, 24, k), neck=12)
        if t >= t6:
            pose = P(pose, lean=lerp(24, -8, seg(t, t6, t9, "in")))
        return pose, x, y, -1, None, None, wind
    pose = dict(T_BURN)
    # corrections: a roll (f18), a shoulder hitch (f27), a dip (f36)
    r = pulse(t, T(fr, 17), 2 / FPS, 5 / FPS)
    h = pulse(t, T(fr, 26), 2 / FPS, 5 / FPS)
    dp = pulse(t, T(fr, 35), 2 / FPS, 6 / FPS)
    pose["lean"] += 10 * r - 6 * dp
    pose["ua_f"] += 22 * h
    pose["neck"] += -8 * h
    pose["th_n"] += 20 * dp
    pose["th_f"] += 26 * dp
    y -= 0.35 * dp
    # settle into the hold, more upright, for the MCU
    pose = rig.blend(pose, T_HOLD, seg(t, T(fr, 50), T(fr, 66)))
    ln = -6.0
    if t >= T(fr, 64):
        ln = kf(t, [(T(fr, 66), -6.0), (T(fr, 72), 34.0, "inout"), (T(fr, 78), 34.0), (T(fr, 84), -4.0, "inout")])
    return pose, x, y, 1, -1, ln, wind


def _s303_cam(fr, t):
    pose, x, y, facing, look, ln, _ = _s303_thragg(fr, t)
    J = solve(THRAGG, mirror(pose, ln) if look else pose, x, y, -facing if look else facing)
    push = seg(t, T(fr, 60), T(fr, 86), "inout")
    zoom = lerp(125.0, 360.0, push) * (1 + 0.04 * seg(t, T(fr, 86), fr.dur))
    # the track lags his slide (he drifts down-left in frame, so the curved drag
    # reads against the skyline), then locks on for the push-in to his face
    x0, y0 = _arc(fr, 0.0)
    track = lerp(0.45, 1.0, push)
    cx = x0 + (J["chest"][0] - x0) * track
    cy = y0 + 0.45 + (J["chest"][1] - y0 - 0.45) * track
    ax = lerp(cx, J["head"][0], push)
    ay = lerp(cy, J["head"][1], push)
    su, sv = lerp(0.62, 0.6, push), lerp(0.4, 0.42, push)
    return Cam(ax - (su - 0.5) * OUT_W / zoom, ay + (sv - 0.5) * OUT_H / zoom, zoom), J


def s3_03(fr):
    t, dur = fr.t, fr.dur
    tg = C.tg(fr)
    fr.cam, J0 = _s303_cam(fr, t)
    stage(fr)
    dBl = 1.83
    cam0, _ = _s303_cam(fr, 0.0)
    B = s2w(fr, -0.03, 1.06, dBl, cam0)
    bu, bv = w2s(fr, B[0], B[1], dBl)
    # the compacted mass and the Blue's lensing at the lower-left edge
    mass(fr, B[0], B[1], t, dBl, r=0.6)
    pose, x, y, facing, look, ln, wind = _s303_thragg(fr, t)
    head_uv = w2s(fr, *J0["head"])
    # the stream: thickening into a wall f40-60; a gap f50-53 shows Gojo far down-left
    wall = seg(t, T(fr, 40), T(fr, 60))
    g_on = T(fr, 50) <= t < T(fr, 54)
    G_UV = (0.13, 0.84)

    def gap(u, v):
        if not g_on:
            return False
        # band around the sight line from Thragg's head to Gojo
        ax, ay = head_uv
        bx_, by_ = G_UV
        vx, vy = (bx_ - ax) * 1.78, by_ - ay
        wx, wy = (u - ax) * 1.78, v - ay
        L2 = vx * vx + vy * vy
        k = clamp((wx * vx + wy * vy) / L2)
        dx_, dy_ = wx - vx * k, wy - vy * k
        return k > 0.15 and dx_ * dx_ + dy_ * dy_ < 0.012
    if g_on:
        dG = 2.4
        gx, gy = s2w(fr, G_UV[0], G_UV[1], dG)
        soft_draw(fr, lambda: gojo(fr, G_TWO_UP, gx, gy, 1, depth=dG), radius=0.6)
    region = ((-0.2, lerp(0.42, 0.5, wall)), (-0.3, 0.05))
    stream(fr, (bu, bv), tg, n=int(80 + 80 * wall), region=region, depths=(0.7, 2.6), salt="s303",
           skip=gap, big=0.12 + 0.25 * wall)
    stream(fr, (bu, bv), tg + 0.37, n=int(90 * wall), region=((-0.25, 0.05), (-0.1, 0.75)), depths=(1.1, 2.4),
           salt="s303wall", skip=gap, big=0.55, period=(1.0, 1.8))
    # ---- Thragg ----------------------------------------------------------------
    if T(fr, 9) - 0.5 / FPS <= t < T(fr, 10) - 0.5 / FPS:
        fr.blur_dir = (14, -10)            # the snap rotation: one smeared frame
    J = thragg(fr, pose, x, y, facing, look=look, look_neck=ln, cape_wind=(wind[0], wind[1]))
    t12 = cue(fr, "accel_burst", 0, 12)
    if t >= t12 - 0.5 / FPS:
        sx, sy = J["chest"]
        fx.sonic_boom(fr, sx + 0.3, sy + 0.3, t - t12, dirx=0.75, diry=0.66, size=1.0)
    # thrust wash under his boots while he burns
    if t >= t12:
        ax_, ay_ = J["an_n"]
        for k in range(5):
            fr.glow_line([(ax_, ay_), (ax_ - 0.5 - 0.3 * k + 0.1 * math.sin(t * 40 + k), ay_ - 0.45 - 0.2 * k)],
                         (60, 60, 70), width_px=3)
    # ---- the near misses: sedan past his face (f18), lamp post behind him (f27),
    #      slab cartwheeling under his feet (f36)
    hx, hy = J["head"]
    t18, t27, t36 = cue(fr, "flyby", 0, 18), cue(fr, "whoosh", 0, 27), cue(fr, "flyby", 1, 36)
    if abs(t - t18) < 3 / FPS:
        u = (t - t18) / (3 / FPS)
        dd = 0.62
        P0 = (hx + 0.6 - 2.6 * (u + 1), hy + 3.3 - 1.9 * (u + 1))
        X, Y = unproj(fr, P0[0], P0[1], dd)
        fx.trail(fr, [unproj(fr, P0[0] + 0.9 * k, P0[1] + 0.66 * k, dd) for k in range(4, -1, -1)], width_m=1.2,
                 alpha=70, d=dd, color=(220, 200, 200))
        car_shape(fr, X, Y, -35 + 90 * u, (128, 34, 30), dd, 1.0)
    if abs(t - t27) < 3 / FPS:
        u = (t - t27) / (3 / FPS)
        dd = 1.5
        X, Y = unproj(fr, hx + 2.0 - 3.2 * (u + 1), hy + 1.0 - 1.8 * (u + 1), dd)
        post_shape(fr, X, Y, math.radians(212), dd, 0.9, base=False)
    if abs(t - t36) < 3 / FPS:
        u = (t - t36) / (3 / FPS)
        ax_, ay_ = J["an_n"]
        dd = 0.9
        X, Y = unproj(fr, ax_ + 1.5 - 2.4 * (u + 1), ay_ - 0.7 - 0.8 * (u + 1), dd)
        slab_shape(fr, X, Y, 140 * u, dd, 1.0, L=2.4, th=0.5)


# =============================================================================
# S3-04  WS: the self-pull - a dead-straight line through the stream
# =============================================================================

G_TRAVEL = P("float_relaxed", lean=6, ua_n=-6, fa_n=-14, ua_f=-12, fa_f=-18, th_n=4, sh_n=-10, th_f=-6, sh_f=-20)
TX4, TY4 = 11.0, 26.0          # Thragg's pelvis (feet at 25)
GX1, GSOLE1 = 9.8, 25.0        # Gojo's stop: 1.2 m behind Thragg's back


def s3_04(fr):
    t, dur = fr.t, fr.dur
    tg = C.tg(fr)
    t5 = cue(fr, "blue", 0, 5)
    t6 = cue(fr, "whoosh", 0, 6)
    t11 = cue(fr, "cloth", 0, 11)
    # camera: whips 6 deg screen-right (f7-12, 1-frame lag) and settles
    wx = kf(t, [(t6 + 1 / FPS, 0.0), (t11 + 0.5 / FPS, 3.4, "out"), (t11 + 3 / FPS, 3.0, "inout")])
    wy = kf(t, [(t6 + 1 / FPS, 0.0), (t11 + 0.5 / FPS, 1.4, "out"), (t11 + 3 / FPS, 1.2, "inout")])
    fr.cam = Cam(3.5 + wx, 16.5 + wy, 45.0)
    if t6 + 1 / FPS < t < t11 + 1 / FPS:
        fr.blur_dir = (-10, 4)
    stage(fr)
    dBl = dB(30.0)
    Bp = proj(fr, 7.0, 22.0, dBl)
    Bp = (Bp[0] + 0.9, Bp[1] - 1.8)
    Bl = unproj(fr, Bp[0], Bp[1], dBl)
    mass(fr, Bl[0], Bl[1], t, dBl, scale=0.85, r=0.6)
    # ---- Gojo's line --------------------------------------------------------
    G0 = (GX0, GSOLE0)
    G1 = (GX1, GSOLE1)

    def gpos(tt):
        k = 0.0 if tt <= t6 else 1.0 if tt >= t11 else ((tt - t6) / (t11 - t6)) ** 1.35
        return lerp(G0[0], G1[0], k), lerp(G0[1], G1[1], k), k
    gx, gy, gk = gpos(t)
    gc = (gx + 0.05, gy + 1.0)                   # his body centre
    # ---- the stream with its Gojo-shaped tunnel -----------------------------
    tun_w = 0.75 * (1 - seg(t, t11 + 1 / FPS, T(fr, 28), "out")) if t > t6 else 0.0
    rng = fr.srng("s304")
    Bu = w2s(fr, *Bp)
    A = (G0[0] + 0.05, G0[1] + 1.0)
    for i in range(170):
        ang = rng.uniform(math.radians(150), math.radians(345))
        r0 = rng.uniform(8, 26)
        per = rng.uniform(0.9, 2.0)
        ph = rng.random()
        dd = rng.uniform(0.85, 1.25)
        sz = rng.uniform(0.07, 0.3)
        kind = rng.random()
        u = ((tg / per) + ph) % 1.0
        dist = r0 * (1 - u) ** 2 + 2.6
        X = Bp[0] + math.cos(ang) * dist
        Y = Bp[1] + math.sin(ang) * dist
        if Y < 0.2:
            continue
        held = False
        if tun_w > 0:
            # distance to the traversed part of his line
            vx, vy = gc[0] - A[0], gc[1] - A[1]
            L2 = vx * vx + vy * vy + 1e-9
            k = clamp(((X - A[0]) * vx + (Y - A[1]) * vy) / L2)
            px_, py_ = A[0] + vx * k, A[1] + vy * k
            ox, oy = X - px_, Y - py_
            dd_ = math.hypot(ox, oy)
            w = tun_w
            if dd_ < w:
                # hangs a hand's width out (fx.zeno on the last 0.15 m), then resumes
                hold = w - 0.15 + fx.zeno(0.15, 2 / FPS, rate=6.0)
                if dd_ < 1e-4:
                    ox, oy, dd_ = 0.0, 1.0, 1.0
                X, Y = px_ + ox / dd_ * hold, py_ + oy / dd_ * hold
                held = True
        x_, y_ = X, Y
        if kind < 0.3:
            fr.poly([(x_, y_), (x_ + sz * 0.8, y_ + sz * 0.3), (x_ + sz * 0.2, y_ + sz)],
                    shade(PAL["glass"], 0.8 + 0.4 * math.sin(tg * 25 + i)))
        elif kind < 0.92:
            chunk_shape(fr, x_, y_, tg * 180 * (kind - 0.5), sz, shade(PAL["concrete"], 0.6 + 0.5 * kind), None, i)
        else:
            car_shape(fr, x_, y_, math.degrees(ang) + tg * 40, (80, 70, 70), None, 0.3)
        if not held:
            ux_, uy_ = math.cos(ang), math.sin(ang)
            fr.line([(x_, y_), (x_ + ux_ * sz * 3, y_ + uy_ * sz * 3)], shade(PAL["dust"], 0.75), width_px=1)
    # ---- the pin-prick 1 m west of Thragg's back (f0-11) --------------------
    pk = seg(t, T(fr, 1), t5, "out") * (1 - seg(t, t11 - 0.5 / FPS, t11 + 0.5 / FPS))
    flick = 0.65 + 0.35 * math.sin(t * 50) if t < t5 else 1.0
    pinprick(fr, 10.0, 26.3, pk * flick)
    # ---- Thragg: burning east, head turned west into the debris -------------
    thragg(fr, T_HOLD, TX4, TY4, 1, look=-1, look_neck=-6, cape_wind=(-0.6, -0.75))
    # ---- Gojo: twitch (f0-5), the yank (f6-11), dead stop -------------------
    if t < t6:
        tw = pulse(t, T(fr, 2), 2 / FPS, 3 / FPS)
        pose = P(G_TWO_UP, fa_n=G_TWO_UP["fa_n"] - 12 * tw, ua_n=G_TWO_UP["ua_n"] + 4 * tw)
        gojo(fr, pose, GX0, None, 1, ground=GSOLE0)
    else:
        if t < t11 + 0.5 / FPS:
            # smear: white with a thin blue edge, straight back along the line
            pts = []
            for k in range(7):
                tt = max(t6, t - (6 - k) * 0.6 / FPS)
                x_, y_, _ = gpos(tt)
                pts.append((x_ + 0.05, y_ + 1.0))
            fx.trail(fr, [(x_, y_ - 0.12) for x_, y_ in pts], color=(90, 160, 255), width_m=1.4, alpha=110)
            fx.trail(fr, pts, color=(245, 248, 255), width_m=1.2, alpha=170)
        pose = rig.blend(G_TWO_UP, G_TRAVEL, seg(t, t6, t6 + 2 / FPS)) if t < t11 else rig.blend(
            G_TRAVEL, G_LOOSE, seg(t, t11, t11 + 4 / FPS))
        J = gojo(fr, pose, gx, None, 1, ground=gy)
        if t6 <= t < t11 + 3 / FPS:
            fx.infinity(fr, gc[0], gc[1], r=0.9, strength=0.5, t=t)


# =============================================================================
# S3-05  MS: palm with Blue at impact (f6), rising elbow (f20) - barely matter
# =============================================================================

G_PALM_WIND = P("g_idle", lean=-4, neck=0, ua_n=10, fa_n=30, ua_f=-36, fa_f=40, hand_f="open", hand_n="fist",
                th_n=22, sh_n=-6, th_f=-14, sh_f=-24)
G_PALM = P("g_palm", lean=18, ua_n=-20, fa_n=30, ua_f=88, fa_f=92, hand_f="open", hand_n="fist",
           th_n=30, sh_n=0, th_f=-26, sh_f=-34)
G_ELBOW_WIND = P(G_PALM, lean=4, ua_n=30, fa_n=-80, ua_f=30, fa_f=60, th_n=34, sh_n=-4)
G_ELBOW = P("g_elbow", lean=24, neck=-4, ua_n=106, fa_n=-44, ua_f=-20, fa_f=40, hand_n="fist", hand_f="open",
            th_n=36, sh_n=0, th_f=-30, sh_f=-40)
G_FLEX_OPEN = P(G_LOOSE, ua_f=-8, fa_f=8, hand_f="open")
G_FLEX_CLOSED = P(G_LOOSE, ua_f=-8, fa_f=8, hand_f="fist")
T_STRUCK = P(T_HOLD, lean=19)
T_TWIST = P(T_HOLD, lean=-6, ua_n=-30, fa_n=-10)
T_TURNED = P(T_HOVER, lean=6, neck=4, ua_n=20, fa_n=40, ua_f=10, fa_f=30, th_n=10, sh_n=-10, th_f=-10, sh_f=-26)


def s3_05(fr):
    t, dur = fr.t, fr.dur
    ta = on2(fr)
    t6 = cue(fr, "punch_light", 0, 6)
    t20 = cue(fr, "punch_light", 1, 20)
    sh = C.shake(t, t20, amp=3.0, dur=4 / FPS, freq=60)
    fr.cam = Cam(10.45, 26.3, 240.0, shake=sh)
    # background: street far below, the Blue mass lower-left (5 m upstage), out of focus
    stage(fr)
    dBl = dB(5.0)
    tg = C.tg(fr)

    def bg():
        mass(fr, 7.0, 22.0, t, dBl, strength=0.55, scale=0.9, r=0.55)
        Bp = w2s(fr, 7.0, 22.0, dBl)
        stream(fr, Bp, tg, n=60, region=((-0.1, 1.1), (-0.3, 0.2)), depths=(2.2, 3.5), salt="s305", big=0.1)
    soft_draw(fr, bg, radius=2.2)
    # ---- Thragg: burning east; struck (f6) - gives 5 cm; head wrenches round
    #      (f9-19); elbow (f20) turns the jaw back; shoved 0.3 m east, turns to face him
    give = 0.05 * pulse(t, t6, 1 / FPS, 6 / FPS)
    shove = 0.3 * seg(t, t20, t20 + 5 / FPS, "out")
    tx, ty = TX4 + give + shove, TY4
    t_turn = t20 + 3 / FPS
    if t < t_turn:
        pose = rig.blend(T_HOLD, T_STRUCK, pulse(t, t6, 1 / FPS, 8 / FPS))
        # wrenching round toward his right, head first: the torso twists back over his hips
        pose = rig.blend(pose, T_TWIST, seg(t, T(fr, 9), t20 - 1 / FPS))
        if t < T(fr, 9):
            look, ln = None, None
        elif t < t20:
            look, ln = -1, lerp(-10, 4, seg(t, T(fr, 9), t20))
        else:
            look, ln = None, None          # the elbow turns the jaw back the way it came
            pose = P(pose, neck=-22)
        JT = solve(THRAGG, mirror(pose, ln) if look else pose, tx, ty, -1 if look else 1)
    else:
        pose = rig.blend(P(T_TURNED, neck=-16), P(T_TURNED, neck=4), seg(t, t_turn, T(fr, 30)))
        tilt = seg(ta, T(fr, 40), T(fr, 48))
        pose = P(pose, neck=pose["neck"] + 7 * tilt)
        look, ln = None, None
        JT = solve(THRAGG, pose, tx, ty, -1)
    # ---- Gojo: anticipation (sink, hips, palm back), palm, step through, elbow
    if t < t6:
        k = seg(t, 0, t6 - 1 / FPS, "out")
        gp = rig.blend(G_LOOSE, G_PALM_WIND, k)
        sink = 0.1 * k
    elif t < t6 + 7 / FPS:
        gp = rig.blend(G_PALM, G_ELBOW_WIND, seg(t, t6 + 2 / FPS, t6 + 7 / FPS))
        sink = 0.1
    elif t < t20:
        gp = rig.blend(G_ELBOW_WIND, P(G_ELBOW, ua_n=60, fa_n=-90), seg(t, T(fr, 13), t20 - 1 / FPS, "in"))
        sink = 0.1 * (1 - seg(t, T(fr, 13), t20))
    elif t < t20 + 9 / FPS:
        gp = rig.blend(G_ELBOW, G_LOOSE, seg(t, t20 + 2 / FPS, t20 + 9 / FPS))
        sink = 0.0
    else:
        flex = seg(ta, T(fr, 33), T(fr, 37)) * (1 - seg(ta, T(fr, 41), T(fr, 45)))
        gp = rig.blend(G_FLEX_OPEN, G_FLEX_CLOSED, flex) if ta >= T(fr, 33) else G_LOOSE
        sink = 0.0
    # contact geometry: the palm on his back ribs at f6, the elbow on his jaw at f20
    if t < t6 + 7 / FPS:
        back = torso_pt(JT, THRAGG, 0.35, -1.0)
        gx, _ = place(GOJO, G_PALM, 1, lambda J: hand_c(J, "f", GOJO), back)
        gx += 0.03
    else:
        # the jaw as it comes round toward him (head facing west at the contact)
        JJ = solve(THRAGG, mirror(T_TWIST, 4), TX4 + give, ty, -1)
        jaw = face_pt(JJ, THRAGG, up=-0.7, fwd_k=0.5)
        gx1, py1 = place(GOJO, G_ELBOW, 1, lambda J: J["el_n"], (jaw[0] - 0.06, jaw[1]))
        # he rises a little on the air as he steps through, so the elbow meets the jaw
        py0 = solve(GOJO, G_ELBOW, 0.0, None, 1, ground=GSOLE1)["pelvis"][1]
        lift = max(0.0, py1 - py0) * seg(t, T(fr, 13), t20 - 1 / FPS) * (1 - seg(t, t20 + 3 / FPS, t20 + 10 / FPS))
        sink -= lift
        gx = lerp(gx1, GX1 - 0.05, seg(t, t20 + 2 / FPS, t20 + 9 / FPS, "out"))
        if t < t20:
            gx0, _ = place(GOJO, G_PALM, 1, lambda J: hand_c(J, "f", GOJO), torso_pt(JT, THRAGG, 0.35, -1.0))
            gx = lerp(gx0 + 0.03, gx1, seg(t, T(fr, 13), t20 - 1 / FPS))
    mouth = "flat" if ta >= T(fr, 42) else "smirk"
    thragg(fr, pose, tx, ty, 1 if (t < t_turn) else -1, look=look, look_neck=ln,
           cape_wind=(-0.6, -0.75) if t < t_turn else (0.55, -0.6))
    J = gojo(fr, gp, gx, None, 1, ground=GSOLE1 - sink, mouth=mouth)
    # ---- contacts: Blue-at-impact dimple + light star (six streaks) ----------
    if t >= t6:
        cx, cy = hand_c(J, "f", GOJO) if t < t6 + 3 / FPS else torso_pt(JT, THRAGG, 0.35, -1.0)
        dimple(fr, cx, cy, t - t6)
        impact_k(fr, cx, cy, t - t6, kind="light", k=0.32, salt="palm")
    if t >= t20:
        if t < t20 + 3 / FPS:
            ex, ey = J["el_n"]
            dimple(fr, ex + 0.06, ey, t - t20)
        impact_k(fr, J["el_n"][0] + 0.05, J["el_n"][1], t - t20, kind="light", k=0.32, salt="elbow")


# =============================================================================
# S3-06  CU: he can touch me; I cannot touch him
# =============================================================================

T_GRAB_BASE = P("t_grab", lean=22, neck=0, th_n=12, sh_n=-14, th_f=-18, sh_f=-34)


def _grip_overlay(fr, wrist, fdir, k=1.0):
    """Gojo's pale fingers sinking into the crimson glove around the wrist."""
    ux, uy = fdir
    nx, ny = -uy, ux
    skin = GOJO.skin
    sh_ = shade(skin, 0.8)
    for j in range(4):
        o = (j - 1.5) * 0.024
        cx, cy = wrist[0] + ux * o, wrist[1] + uy * o
        a = (cx + nx * 0.06, cy + ny * 0.06)
        b = (cx - nx * 0.055, cy - ny * 0.055)
        fr.line([a, (cx + nx * 0.01 + ux * 0.004, cy + ny * 0.01 + uy * 0.004), b], skin, width_m=0.02)
        fr.line([(b[0] - ux * 0.008, b[1] - uy * 0.008), (b[0] + nx * 0.01, b[1] + ny * 0.01)], sh_, width_m=0.006)
    # thumb over the top
    fr.line([(wrist[0] - ux * 0.05 + nx * 0.06, wrist[1] - uy * 0.05 + ny * 0.06),
             (wrist[0] + ux * 0.01 + nx * 0.065, wrist[1] + uy * 0.01 + ny * 0.065)], skin, width_m=0.024)
    # the glove dimpling under the grip
    fr.line([(wrist[0] - ux * 0.06 - nx * 0.06, wrist[1] - uy * 0.06 - ny * 0.06),
             (wrist[0] + ux * 0.06 - nx * 0.06, wrist[1] + uy * 0.06 - ny * 0.06)], shade(THRAGG.accent, 0.5),
            width_m=0.006)


def _claw(fr, c, ang, s=1.0):
    """Crimson-gloved claw (fingers forward along ang)."""
    col = THRAGG.accent
    fr.circle(c[0], c[1], 0.06 * s, fill=col)
    for k in (-1.2, -0.4, 0.4, 1.2):
        a = ang + k * 0.22
        p1 = (c[0] + math.cos(a) * 0.075 * s, c[1] + math.sin(a) * 0.075 * s)
        p2 = (p1[0] + math.cos(a - 0.5 * k * 0.3 - 0.35) * 0.06 * s, p1[1] + math.sin(a - 0.35) * 0.06 * s)
        fr.line([(c[0], c[1]), p1, p2], col, width_m=0.024 * s)
    fr.line([(c[0], c[1]), (c[0] + math.cos(ang - 1.3) * 0.07 * s, c[1] + math.sin(ang - 1.3) * 0.07 * s)], col,
            width_m=0.026 * s)


def _t_eye(fr, JT, gaze, wide=0.0):
    """Thragg's near eye with a pupil (for the saccades)."""
    hx, hy = JT["head"]
    r = THRAGG.head_r * JT["scale"]
    f = JT["facing"]
    hd = JT["head_dir"]
    fwd = (hd[1] * f, -hd[0] * f)
    ex, ey = hx + (fwd[0] * 0.78 + hd[0] * 0.14) * r, hy + (fwd[1] * 0.78 + hd[1] * 0.14) * r
    fr.ellipse(ex, ey, r * 0.15, r * (0.065 + 0.04 * wide), fill=(225, 220, 218))
    px = ex + (fwd[0] * gaze[0] + hd[0] * gaze[1]) * r * 0.07
    py = ey + (fwd[1] * gaze[0] + hd[1] * gaze[1]) * r * 0.07
    fr.circle(px, py, r * 0.05, fill=(26, 18, 20))
    fr.line([(ex - fwd[0] * r * 0.16, ey + r * 0.09), (ex + fwd[0] * r * 0.17, ey + r * 0.1)], THRAGG.hair,
            width_m=r * 0.05)


def s3_06(fr):
    t, dur = fr.t, fr.dur
    t4 = cue(fr, "grab", 0, 4)
    t12 = cue(fr, "infinity_stop", 0, 12)
    t10 = t12 - 2 / FPS
    fr.cam = Cam(10.32, 26.36, 640.0)
    # backdrop: facades far below and behind, very soft
    stage(fr)
    blur_img(fr, 9.0)
    tg = C.tg(fr)
    soft_draw(fr, lambda: stream(fr, w2s(fr, *proj(fr, 7.0, 22.0, dB(5.0))), tg, n=30,
                                 region=((-0.1, 0.6), (-0.3, 0.0)), depths=(2.5, 4.0), salt="s306"), radius=5)
    # ---- bodies: Gojo east at 9.8 (soles 25), Thragg west, cheated to arm's reach
    GJ0 = solve(GOJO, G_LOOSE, GX1, None, 1, ground=GSOLE1)
    throat = (GJ0["neck"][0] + 0.07, GJ0["neck"][1] - 0.02)
    push = 0.03 * seg(t, t12, t12 + 0.6)
    tpose = P(T_GRAB_BASE, lean=22 + 4 * seg(t, t12, t12 + 0.5) + 6 * pulse(t, 0, 2 / FPS, 2 / FPS))
    TX, TY = 10.86 - push, 26.02
    JT0 = solve(THRAGG, tpose, TX, TY, -1)
    # right hand (far): flashes in for the collar at f4 and is caught at x = 10.4
    grip = (10.22, 26.2)
    if t < t4:
        k = seg(t, 0, t4, "in")
        wr_f = (lerp(JT0["sh_f"][0] + 0.12, grip[0], k), lerp(JT0["sh_f"][1] - 0.32, grip[1], k))
    else:
        wr_f = grip
    ua_f, fa_f = ik_arm(JT0, "f", wr_f, THRAGG)
    # left hand (near): loads (f6-9), drives (f10), decelerates to 3 cm from the
    # throat (80% in 2 frames, 15% more in 4, then a Zeno crawl).  Solved for the
    # claw's FINGERTIPS, so the 3 cm gap is exact.
    TIPL = 0.22
    tgt = (throat[0] + 0.03, throat[1])
    rest = (JT0["sh_n"][0] + 0.1, JT0["sh_n"][1] - 0.7)
    load = (JT0["sh_n"][0] - 0.02, JT0["sh_n"][1] - 0.2)
    if t < T(fr, 6):
        tp = rest
    elif t < t10:
        k = seg(t, T(fr, 6), t10)
        tp = (lerp(rest[0], load[0], k), lerp(rest[1], load[1], k))
    else:
        g0 = 1.0
        if t < t12:
            g = 1 - 0.8 * (t - t10) / (t12 - t10)
        elif t < t12 + 4 / FPS:
            g = 0.2 - 0.15 * EASE["out"]((t - t12) / (4 / FPS))
        else:
            g = fx.zeno(0.05, t - t12 - 4 / FPS, rate=4.0)
        tp = (lerp(tgt[0], load[0], g), lerp(tgt[1], load[1], g))
    sh = JT0["sh_n"]
    dv = (tp[0] - sh[0], tp[1] - sh[1])
    L_ = math.hypot(*dv) or 1.0
    hd = (dv[0] / L_, dv[1] / L_)
    for _ in range(2):
        wr_n = (tp[0] - hd[0] * TIPL, tp[1] - hd[1] * TIPL)
        ua_n, fa_n = ik_arm(JT0, "n", wr_n, THRAGG)
        a_ = math.radians(fa_n)
        hd = (math.sin(a_) * -1, -math.cos(a_))
    tpose = P(tpose, ua_f=ua_f, fa_f=fa_f, ua_n=ua_n, fa_n=fa_n, hand_f="open", hand_n="claw")
    # Gojo's left hand (far) closes on the wrist on the grab frame
    gp = dict(G_LOOSE)
    if t >= t4:
        gua, gfa = ik_arm(GJ0, "f", (grip[0] - 0.06, grip[1] + 0.005), GOJO)
        gp = P(gp, ua_f=gua, fa_f=gfa, hand_f="fist")
    GJ = gojo(fr, gp, GX1, None, 1, ground=GSOLE1)
    JT = thragg(fr, tpose, TX, TY, -1, eyes="cold")
    if t >= t4:
        fdir = JT["hand_dir_f"]
        _grip_overlay(fr, (grip[0] + fdir[0] * 0.02, grip[1] + fdir[1] * 0.02), fdir)
        if t < t4 + 2 / FPS:
            for k in range(5):
                fr.line([(grip[0] - 0.1 - 0.05 * k, grip[1] - 0.12 + 0.03 * k), (grip[0] - 0.3 - 0.05 * k, grip[1] - 0.3 + 0.03 * k)],
                        (240, 240, 245), width_px=2)
    # the claw (overdrawn larger for the insert)
    cdir = JT["hand_dir_n"]
    ca = math.atan2(cdir[1], cdir[0])
    cc = hand_c(JT, "n", THRAGG)
    _claw(fr, cc, ca, 1.25)
    # ---- Infinity in the 3 cm gap: grit + a glass sliver hanging, jittering
    if t >= t10:
        tips_x = tp[0]
        k = clamp((t - t10) / 0.1)
        fx.infinity(fr, throat[0] + 0.015, throat[1], r=0.09, strength=0.35 + 0.4 * k, t=t)
        fx.suspended_dust(fr, throat[0] + 0.004, throat[1] - 0.05, max(throat[0] + 0.01, tips_x - 0.004),
                          throat[1] + 0.05, n=26, t=t, salt="gap", size=0.0045)
        j = 0.0016 * math.sin(t * 40)
        gx_, gy_ = (throat[0] + tips_x) / 2 + j, throat[1] + 0.012 - j
        fr.poly([(gx_ - 0.004, gy_ - 0.012), (gx_ + 0.006, gy_ + 0.014), (gx_ + 0.002, gy_ + 0.016)],
                shade(PAL["glass"], 1.2))
        if t >= t12:
            impact_k(fr, tips_x + 0.01, throat[1], t - t12, kind="blocked", k=0.22, dirx=-1)
    # ---- Thragg's eyes: two saccades (f24, f34) wrist -> hand -> wrist
    gz = (0.2, -0.9)
    if t >= T(fr, 24):
        gz = (1.0, -0.35)
    if t >= T(fr, 34):
        gz = (0.2, -0.9)
    _t_eye(fr, JT, gz)
    # ---- focus rack: grip (f4) -> stalled hand (f14) -> his eyes (f22)
    gu = w2s(fr, *grip)
    hu = w2s(fr, throat[0] + 0.1, throat[1])
    eu = w2s(fr, *JT["head"])
    a = seg(t, T(fr, 8), T(fr, 14))
    b = seg(t, T(fr, 18), T(fr, 22))
    fu = lerp(lerp(gu[0], hu[0], a), eu[0], b)
    fv = lerp(lerp(gu[1], hu[1], a), eu[1], b)
    focus_rack(fr, fu, fv, 0.2, 0.2, 2.6)


# =============================================================================
# S3-07  WS high: the wrist throw, the anchor drop, the release, the walk down
# =============================================================================

T_THROWN = P("dive", lean=175, neck=-30, ua_n=170, fa_n=175, ua_f=150, fa_f=160)
T_PINNED = P("fallen", lean=-150, neck=10)
G_THROW_WIND = P("g_idle", lean=10, ua_n=60, fa_n=40, ua_f=70, fa_f=88, hand_n="open", hand_f="fist",
                 th_n=24, sh_n=-4, th_f=-18, sh_f=-28)
G_THROW = P(G_THROW_WIND, lean=24, ua_n=30, fa_n=-10, ua_f=40, fa_f=10)
G_POINT_DOWN = P("g_idle", lean=8, ua_n=36, fa_n=26, hand_n="sign", ua_f=-4, fa_f=-6, hand_f="open")
G_STEP_A = P("g_idle", lean=-2, ua_n=4, fa_n=-6, ua_f=-6, fa_f=-10, hand_n="open", hand_f="open",
             th_n=18, sh_n=-4, th_f=-16, sh_f=-30)
G_STEP_B = P(G_STEP_A, th_n=-14, sh_n=-26, th_f=16, sh_f=0)


def s3_07(fr):
    t, dur = fr.t, fr.dur
    tg = C.tg(fr)
    t6 = cue(fr, "whoosh", 0, 6)
    t14 = cue(fr, "crack_ground", 0, 14)
    t15 = cue(fr, "blue", 0, 15) - 1 / FPS
    t20 = cue(fr, "metal_groan", 0, 20)
    t22 = T(fr, 22)
    t24 = cue(fr, "debris_rain", 0, 24)
    sh = C.shake(t, t14, amp=8.0, dur=5 / FPS, freq=55)
    pan = seg(t, T(fr, 30), dur, "inout")
    fr.cam = Cam(lerp(5.6, 1.6, pan), lerp(12.5, 6.0, pan), lerp(36.0, 52.0, pan), shake=sh)
    stage(fr)
    D = 25.0
    dBl = dB(D)
    # ---- the Blue and its mass: dives after him (f14-19), lands (f20), released (f22)
    if t < t15:
        Bx, By, Bd = 7.0, 22.0, dBl
    else:
        k = seg(t, t15, t20 - 1 / FPS, "in")
        Bx, By, Bd = lerp(7.0, 7.5, k), lerp(22.0, 2.0, k), lerp(dBl, 1.0, k)
    if t < t22:
        lag = 1.5 / FPS
        if t < t15 + lag:
            mx, my, md = 7.0, 22.0, dBl
        else:
            k = seg(t - lag, t15, t20 - 1 / FPS, "in")
            mx, my, md = lerp(7.0, 7.5, k), lerp(22.0, 2.7, k), lerp(dBl, 1.0, k)
        squash = 0.18 * seg(t, t20 - 1 / FPS, t20 + 1 / FPS)
        c = fr.cam
        bx_, by_ = c.x + (Bx - c.x) * md / Bd, c.y + (By - c.y) * md / Bd
        mass(fr, mx, my, t, md, squash=squash, bx=bx_, by=by_, r=0.6)
        if t < t15:
            Bp = proj(fr, 7.0, 22.0, dBl)
            stream(fr, w2s(fr, *Bp), tg, n=60, region=((-0.1, 1.1), (0.75, 1.1)), depths=(0.9, 1.6), salt="s307",
                   big=0.08)
    else:
        heap(fr)
        if t < t22 + 2 / FPS:
            # the lensing snaps back: a last ring of space releasing
            fx.shockwave(fr, 7.5, 2.7, t - t22, r_max=5.0, dur=0.12, width=2, color=(150, 190, 240))
    # ---- impact + dust ------------------------------------------------------
    if t >= t14:
        ts = t - t14
        fx.impact(fr, 8.0, 0.3, ts, kind="heavy", dirx=0, diry=-1, salt="s307imp")
        fx.shockwave(fr, 8.0, 0.05, ts, r_max=9.0, dur=0.4, ground=True, width=4)
        fx.debris(fr, 8.0, 0.3, ts, n=22, speed=9.0, spread=2.2, angle=math.pi / 2, size=(0.1, 0.4), ground=0.0,
                  salt="s307deb")
        fx.dust_cloud(fr, 8.0, 0.2, ts, r=5.0, n=16, alpha=70, salt="s307dc")
    if t >= t20:
        fx.dust_cloud(fr, 7.5, 0.3, t - t20, r=9.0, n=26, rise=0.5, alpha=62, salt="s307ring")
    if t >= t24:
        fx.debris(fr, 7.5, 9.0, t - t24, n=24, speed=3.0, spread=TAU, angle=math.pi / 2, size=(0.04, 0.14),
                  g=9.8, ground=0.0, salt="rain", color=(150, 144, 138))
    # ---- Thragg: folded over the wrist (f6), driven head-first 25 m (f6-13), slams (f14)
    TX, TY = 11.3, 26.0
    if t < t6:
        tw = seg(t, 0, t6, "in")
        pose = P(T_TURNED, lean=6 + 30 * tw, ua_f=60 + 40 * tw, fa_f=90)
        JT = thragg(fr, pose, TX - 0.1 * tw, TY, -1, cape_wind=(0.55, -0.6))
    elif t < t14:
        k = (t - t6) / (t14 - t6)
        e = EASE["in"](k) * 0.85 + 0.15 * k
        x, y = lerp(TX - 0.3, 8.0, e), lerp(TY + 0.4, 1.0, e)
        flip = seg(t, t6, t6 + 2 / FPS, "out")
        pose = rig.blend(P(T_TURNED, lean=60), T_THROWN, flip)
        if t > t6 + 1 / FPS:
            pts = [(lerp(TX - 0.3, x, j / 6), lerp(TY + 0.4, y, j / 6) + 0.3) for j in range(7)]
            fx.trail(fr, pts, color=(255, 255, 255), width_m=1.0, alpha=120)
            fx.trail(fr, [(px_ + 0.15, py_ + 0.6) for px_, py_ in pts[:5]], color=(190, 30, 40), width_m=0.5, alpha=110)
        JT = thragg(fr, pose, x, y, -1, cape_wind=(0.1, 1.0))
    elif t < t20 + 1 / FPS:
        JT = thragg(fr, T_PINNED, 8.0, 0.55, -1, cape_wind=(0.8, 0.2))
    # ---- Gojo ---------------------------------------------------------------
    t2 = on2(fr)
    if t < t6:
        gp = rig.blend(G_LOOSE, G_THROW_WIND, seg(t, 0, t6 - 1 / FPS))
        gx, gs = GX1, GSOLE1
    elif t < t14:
        gp = rig.blend(G_THROW_WIND, G_THROW, seg(t, t6, T(fr, 8), "out"))
        gx, gs = GX1 - 0.2 * seg(t, t6, T(fr, 10)), GSOLE1 - 0.6 * seg(t, t6, T(fr, 12))
    elif t < t24:
        gp = rig.blend(G_THROW, G_POINT_DOWN, seg(t, t14, t15 + 1 / FPS, "out"))
        if t >= t22:
            gp = rig.blend(G_POINT_DOWN, G_LOOSE, seg(t, t22, t24))
        gx, gs = GX1 - 0.2, GSOLE1 - 0.6
    else:
        k = seg(t2, t24, dur + 1 / FPS, "inout")
        gx = lerp(GX1 - 0.2, -4.6, k)
        gs = lerp(GSOLE1 - 0.6, 0.2, k)
        step = math.sin((t2 - t24) / (dur - t24) * math.pi * 7)
        gp = rig.blend(G_STEP_A, G_STEP_B, 0.5 + 0.5 * step)
    gojo(fr, gp, gx, None, 1, ground=gs)


# =============================================================================
# S3-08  MWS knee height: touch down; is that all? - the eruption hangs short
# =============================================================================

T_CROUCH = P("land_crouch", lean=34, neck=-18, ua_n=40, fa_n=16, ua_f=-26, fa_f=-6, th_n=92, sh_n=-8,
             th_f=22, sh_f=-80)
G_WALK_A = P("g_idle", lean=2, neck=8, ua_n=2, fa_n=-4, ua_f=-4, fa_f=-6, hand_n="open", hand_f="open",
             th_n=20, sh_n=4, th_f=-16, sh_f=-24)
G_WALK_B = P(G_WALK_A, th_n=-16, sh_n=-24, th_f=20, sh_f=4)
G_TILT = P(G_LOOSE, neck=10)


def s3_08(fr):
    t, dur = fr.t, fr.dur
    t2 = on2(fr)
    t6 = cue(fr, "footstep", 0, 6)
    t14 = cue(fr, "footstep", 1, 14)
    t22 = cue(fr, "footstep", 2, 22)
    t53 = cue(fr, "concrete_break", 0, 53)
    t57 = cue(fr, "infinity_stop", 0, 57)
    sh = C.shake(t, t53, amp=10.0, dur=6 / FPS, freq=50)
    fr.cam = Cam(1.5, 2.5, 95.0, shake=sh)
    stage(fr)
    lit_city(fr)
    # ---- the heap (west face bulging f46-52, blown open f53) -----------------
    heap(fr)
    if t >= t53:
        te = t - t53
        fx.dust_cloud(fr, 5.0, 1.2, te, r=4.0, n=18, ground=False, rise=0.5, alpha=110, salt="erupt")
        fx.debris(fr, 5.0, 1.4, te, n=16, speed=8.0, spread=1.6, angle=math.radians(130), size=(0.08, 0.3),
                  ground=0.0, salt="erdeb")
    # ---- Gojo: drops the last metre (f0-6), two easy steps east (f8-22), head tilted
    if t2 < t6:
        k = seg(t2, 0, t6, "out")
        gx, gs = lerp(-4.6, -5.0, k), lerp(1.2, 0.0, EASE["in"](k) * 0.4 + 0.6 * k)
        gp = rig.blend(G_STEP_A, P(G_LOOSE, th_n=14, sh_n=-6), k)
    elif t2 < t22:
        k = seg(t2, T(fr, 8), t22, "inout")
        gx, gs = lerp(-5.0, -3.5, k), 0.0
        ph = seg(t2, T(fr, 8), t14) if t2 < t14 else 1 - seg(t2, t14, t22)
        gp = rig.blend(G_WALK_A, G_WALK_B, ph) if T(fr, 8) <= t2 else G_LOOSE
    else:
        gx, gs = -3.5, 0.0
        gp = rig.blend(G_LOOSE, G_TILT, seg(t2, t22, t22 + 6 / FPS))
    GJ = gojo(fr, gp, gx, None, 1, ground=gs)
    # ---- Thragg: out of the west face (f53), crouched on the slope, eyes locked
    if t >= t53:
        te = t - t53
        k = seg(te, 0, 3 / FPS, "out")
        tx = lerp(4.6, 5.0, k)
        pose = rig.blend(P(T_CROUCH, lean=50, neck=-30), T_CROUCH, k)
        breathe = 0.015 * math.sin(te * 5)
        JT = thragg(fr, P(pose, lean=pose["lean"] + 3 * breathe * 40), tx, None, -1, ground=0.8, cape_wind=(0.7, 0.4))
        # a car door sliding off his back
        if te < 0.9:
            u = seg(te, 0.1, 0.9, "in")
            bx, by = JT["chest"]
            fr.poly(_xf([(-0.55, -0.4), (0.55, -0.4), (0.6, 0.35), (-0.5, 0.4)], bx + 0.35 + 0.9 * u, by + 0.15 - 1.2 * u,
                        -20 - 60 * u), (96, 40, 36))
        # dust pouring off his shoulders
        rng = fr.srng("tdust")
        for i in range(24):
            ph = (rng.random() + te * 0.9) % 1.0
            sx, sy = JT["sh_n"]
            fr.circle(sx + rng.uniform(-0.3, 0.3) + 0.2 * ph, sy - ph * 1.3, 0.02 + 0.02 * ph,
                      fill=shade(PAL["dust"], 0.9 + 0.2 * rng.random()))
    # ---- the fragments flung west at him: decelerate and hang a hand's width short
    if t >= t53:
        te = t - t53
        tstall = t57 - t53
        face = face_pt(GJ, GOJO)
        front = GJ["chest"][0] + 0.2
        rng = fr.srng("frag")
        for i in range(44):
            hy = rng.uniform(0.25, 1.95)
            ox = rng.uniform(0.1, 0.28)                    # hang distance from his front (arc)
            arc = 0.18 * ((hy - 1.05) / 0.9) ** 2
            hx = front + ox + arc
            sx0, sy0 = rng.uniform(4.6, 5.4), rng.uniform(0.6, 2.0)
            kind = rng.random()
            sz = rng.uniform(0.05, 0.11) if kind > 0.15 else 0.11
            if te < tstall:
                u = te / tstall
                x = lerp(sx0, hx + 0.6, u)
                y = lerp(sy0, hy, u)
                fr.line([(x, y), (x + 0.6, y + (sy0 - hy) * 0.06)], shade(PAL["dust"], 0.9), width_px=1)
            else:
                rem = fx.zeno(0.6, te - tstall, rate=7.0)
                j = 0.004 * math.sin(t * 37 + i)
                x, y = hx + rem + j, hy + j * 0.6
            if kind < 0.15:
                # a wing mirror
                fr.poly([(x, y), (x + 0.12, y + 0.02), (x + 0.1, y + 0.09), (x + 0.01, y + 0.08)], (40, 40, 44))
                fr.poly([(x + 0.02, y + 0.015), (x + 0.1, y + 0.025), (x + 0.09, y + 0.07)], shade(PAL["glass"], 0.9))
            elif kind < 0.45:
                fr.poly([(x, y), (x + sz, y + sz * 0.4), (x + sz * 0.3, y + sz)], shade(PAL["glass"], 1.1))
            else:
                chunk_shape(fr, x, y, i * 40, sz, shade(PAL["concrete"], 0.7 + 0.4 * rng.random()), None, i)
        if te >= tstall - 1 / FPS:
            k = clamp((te - tstall) / 0.1)
            fx.infinity(fr, face[0] + 0.1, 1.05, r=1.1, strength=0.35 + 0.35 * k * math.exp(-max(0, te - tstall) * 1.5),
                        t=t)
            fx.impact(fr, front + 0.2, 1.2, te - tstall, kind="blocked", dirx=-1)


# =============================================================================
# S3-09  POV: Six Eyes - location, no intent
# =============================================================================

def s3_09(fr):
    t = fr.t
    t9 = cue(fr, "accel_burst", 0, 9)
    t2 = cue(fr, "heartbeat", 0, 2)
    fr.cam = Cam(0.8, 1.5, 110.0)
    W, H = fr.W, fr.H
    fr.draw.rectangle([0, 0, W, H], fill=(6, 10, 30))
    reveal = smoothstep(0.0, T(fr, 2), t)
    hb = pulse(t, t2, 2 / FPS, 8 / FPS)
    gone = t >= t9
    close = t >= t9 + 1 / FPS
    # where the dense mass is (screen) and how big
    if not close:
        cu_, cv_ = w2s(fr, 5.0, 1.6)
        rx, ry = 0.06, 0.14
    else:
        cu_, cv_ = 0.74, 0.5
        rx, ry = 0.3, 0.6
    img, dr = fr.layer()
    # contour lines of the street and heap (energy currents), bunching round the mass
    flow = (C.tg(fr) * 0.6) % 1.0
    for i in range(40):
        v0 = (i + 0.5) / 40
        pts = []
        for j in range(61):
            u = j / 60
            du, dv = (u - cu_) * 1.78, v0 - cv_
            env_ = math.exp(-0.5 * (du / (rx * 1.78)) ** 2)
            a_ = abs(dv) / ry
            push_v = (1 if dv >= 0 else -1) * ry * env_ * 1.05 / (a_ + 1.05)
            if gone and not close:
                push_v *= 0.0
            # the street's horizon and the heap's mound shape the lines
            hv = 0.0
            if not close:
                hx_, hy_ = s2w(fr, u, v0)
                if 3.8 < hx_ < 11.2 and v0 > 0.45:
                    hv = -0.02 * math.sin((hx_ - 3.8) / 7.4 * math.pi)
            wav = 0.004 * math.sin(u * 14 + i + t * 3)
            pts.append((u * W, (v0 + push_v + hv + wav) * H))
        dense = math.exp(-((v0 - cv_) / (ry * 1.2)) ** 2) if not (gone and not close) else 0.0
        col = mix_color((50, 100, 190), (150, 210, 255), dense)
        dr.line(pts, fill=col + (int((60 + 110 * dense) * reveal),), width=max(1, int((1 + 1.2 * dense) * fr.ss)),
                joint="curve")
        for k in range(4):
            jj = int(((k / 4 + flow + i * 0.13) % 1.0) * 59)
            dr.line([pts[60 - jj], pts[max(0, 60 - jj - 1)]], fill=(200, 235, 255, int(140 * reveal)),
                    width=max(1, int(2.5 * fr.ss)))
    fr.merge(img)
    # the heap's outline as contour rings (until he fills the frame)
    if not close:
        for kk, off in enumerate((0.0, 0.25, 0.5)):
            pts = [(3.7 - off, 0.0)] + [(x, heap_h(x, 2.55) + off) for x in [3.7 + q * 0.37 for q in range(21)]] + [(11.3 + off, 0.0)]
            fr.line(pts, (90 + 30 * kk, 160, 240), width_px=1.5)
    # the mass: dense, dark, lines compressing at its edges; civilian-level haze, flat
    fl = random.Random(f"haze{fr.f // 2}").uniform(0.5, 0.9)
    if not gone:
        def haze(J0, scale_px):
            img, dr = fr.layer()
            for key in ("head", "chest", "pelvis", "kn_n", "kn_f", "el_n", "el_f"):
                X, Y = fr.P(*J0[key], d=J0.get("depth", 1.0))
                R = fr.S(0.28, J0.get("depth", 1.0))
                dr.ellipse([X - R, Y - R * 1.2, X + R, Y + R * 1.2], fill=(120, 170, 230, int(26 * fl * reveal)))
            fr.merge(img)
        J0 = solve(THRAGG, T_CROUCH, 5.0, None, -1, ground=0.8)
        haze(J0, 1)
        draw_fighter(fr, THRAGG, T_CROUCH, 5.0, None, -1, ground=0.8, opts={"cape": "full"}, silhouette=(3, 4, 12))
    elif not close:
        # one-frame launch smear: the mass is simply gone from the slope
        img, dr = fr.layer()
        a = fr.P(5.0, 1.3)
        b = fr.P(-1.0, 1.0)
        dr.polygon([(a[0], a[1] - 60 * fr.ss), (b[0], b[1] - 10 * fr.ss), (b[0], b[1] + 10 * fr.ss), (a[0], a[1] + 60 * fr.ss)],
                   fill=(3, 4, 12, 170))
        fr.merge(img)
    else:
        # f10-13: at arm's length, filling the right half; the fist already swinging in
        k = seg(t, t9 + 1 / FPS, fr.dur, "out")
        dC = lerp(0.26, 0.2, k)
        pose = P("t_hook", lean=20, neck=0, ua_f=lerp(-20, 70, k), fa_f=lerp(60, 110, k), ua_n=20, fa_n=100,
                 th_n=20, sh_n=-10, th_f=-20, sh_f=-34)
        px, py = s2w(fr, 0.8, 0.62, dC)
        J0 = solve(THRAGG, pose, px, py, -1)
        img, dr = fr.layer()
        for key in ("head", "chest", "pelvis", "el_f", "wr_f"):
            X, Y = fr.P(*J0[key], d=dC)
            R = fr.S(0.3, dC)
            dr.ellipse([X - R, Y - R * 1.2, X + R, Y + R * 1.2], fill=(120, 170, 230, int(22 * fl)))
        fr.merge(img)
        draw_fighter(fr, THRAGG, pose, px, py, -1, opts={"cape": "full"}, silhouette=(3, 4, 12), depth=dC)
    # blindfold weave dissolving f0-1 (rhyme with S1-06)
    weave = 1 - smoothstep(0.0, T(fr, 2), t)
    if weave > 0:
        img, dr = fr.layer()
        dr.rectangle([0, 0, W, H], fill=(4, 4, 8, int(235 * weave)))
        step = int(18 * fr.ss)
        for x in range(0, W, step):
            dr.line([(x, 0), (x, H)], fill=(30, 30, 40, int(200 * weave)), width=max(1, int(5 * fr.ss)))
        for y in range(0, H, step):
            dr.line([(0, y), (W, y)], fill=(22, 22, 30, int(200 * weave)), width=max(1, int(4 * fr.ss)))
        fr.merge(img)
    if gone and not close:
        fr.blur_dir = (-40, 0)
    fr.vignette = 0.75 + 0.1 * hb


# =============================================================================
# S3-10  MCU two-shot: the zero-wind-up hook; he dodges anyway
# =============================================================================

T_HK0 = P("t_hook_wind", lean=10, neck=2, ua_n=30, fa_n=110, ua_f=-36, fa_f=60, th_n=12, sh_n=-14, th_f=-18,
          sh_f=-34, hand_f="fist")
T_HK1 = P(T_HK0, lean=24, ua_f=86, fa_f=94, ua_n=0, fa_n=80)
T_HK2 = P(T_HK0, lean=34, neck=-2, ua_f=96, fa_f=100, ua_n=-14, fa_n=64)
G_DODGE0 = P(G_LOOSE, lean=-6, neck=-2, th_f=-2, sh_f=-20)
G_DODGE = P("g_dodge_lean", lean=-26, neck=-10, ua_n=10, fa_n=-16, ua_f=-6, fa_f=-20, hand_n="open",
            hand_f="open", th_n=20, sh_n=4, th_f=-26, sh_f=-30)
G_SIDE_ON = P(G_DODGE, lean=-10, neck=-4)
G_TWO_CHEST = P("g_red", lean=2, neck=-2, ua_n=84, fa_n=90, hand_n="sign", ua_f=-10, fa_f=-6, hand_f="open",
                th_n=24, sh_n=2, th_f=-22, sh_f=-30)


def _t_hover_ground(pose, x, feet=0.3):
    return solve(THRAGG, pose, x, None, -1, ground=feet)["pelvis"][1]


def s3_10(fr):
    t, dur = fr.t, fr.dur
    t4 = cue(fr, "whoosh", 0, 4)
    t16 = cue(fr, "footstep", 0, 16)
    whip = 0.22 if abs(t - t4) < 0.5 / FPS else 0.0
    fr.cam = Cam(-3.0 - whip, 1.6, 260.0)
    if whip:
        fr.blur_dir = (18, 0)
    stage(fr)
    heap(fr)
    # ---- Gojo: late reflex (f0), pivot on the ball of the left foot (f5-16),
    #      the hand rises and swings round (f16-23)
    if t < t4 + 1 / FPS:
        gp = rig.blend(G_LOOSE, G_DODGE0, seg(t, 0, t4))
        gx = -3.5
    elif t < t16:
        gp = rig.blend(G_DODGE0, G_DODGE, seg(t, t4, t4 + 4 / FPS, "out"))
        gp = rig.blend(gp, G_SIDE_ON, seg(t, T(fr, 10), t16))
        gx = lerp(-3.5, -4.0, seg(t, t4, t16, "out"))
    else:
        gp = rig.blend(G_SIDE_ON, G_TWO_CHEST, seg(t, t16, T(fr, 23), "out"))
        gx = -4.0
    GJ0 = solve(GOJO, gp, gx, None, 1)
    jaw0 = face_pt(solve(GOJO, G_DODGE0, -3.5, None, 1), GOJO, up=-0.55)
    # ---- Thragg: hip-led hook, no shoulder load; the fist passes 2.5 cm off the jaw at f4
    if t < t4:
        pose = rig.blend(T_HK0, T_HK1, EASE["in"](clamp(t / t4)))
    elif t < T(fr, 8):
        pose = rig.blend(T_HK1, T_HK2, seg(t, t4, T(fr, 8), "out"))
    else:
        pose = T_HK2
    x4, _ = place(THRAGG, T_HK1, -1, lambda J: tip(J, "f", THRAGG, 1.0), (jaw0[0] - 0.025, jaw0[1]))
    x8, _ = place(THRAGG, T_HK2, -1, lambda J: tip(J, "f", THRAGG, 1.0), (-3.6, jaw0[1] - 0.05))
    if t < t4:
        tx = lerp(-2.3, x4, EASE["in"](clamp(t / t4)))
    else:
        tx = lerp(x4, x8, seg(t, t4, T(fr, 8), "out"))
    ty = _t_hover_ground(pose, tx, 0.3)
    wide = T(fr, 6) <= t < T(fr, 13)
    # ---- pressure wake: dust fan torn off the asphalt behind him, parting round him
    if t >= t4:
        ts = t - t4
        fx.dust_cloud(fr, -5.0, 0.15, ts, r=2.2, n=14, rise=0.3, alpha=80, salt="wake")
        fx.debris(fr, -3.7, 1.6, ts, n=14, speed=6, spread=0.8, angle=math.radians(185), size=(0.01, 0.03),
                  g=2.0, salt="wakegrit", color=(170, 160, 150))
    GJ = gojo(fr, gp, gx, None, 1)
    JT = thragg(fr, pose, tx, ty, -1, eyes="wide" if wide else "cold")
    if wide:
        _t_eye(fr, JT, (0.6, -0.6) if t < T(fr, 9) else (0.9, -0.3), wide=0.8)
    if abs(t - t4) <= 1.5 / FPS:
        fp = tip(JT, "f", THRAGG, 1.0)
        fx.trail(fr, [(fp[0] + 0.9 - 0.15 * k, fp[1] + 0.25 - 0.04 * k) for k in range(7)], width_m=0.22, alpha=130,
                 color=(250, 230, 230))
    # grit stalling beside his cheek: Infinity is still up - the dodge was instinct
    if t >= t4 + 1 / FPS:
        f = face_pt(GJ, GOJO)
        fx.infinity(fr, f[0], f[1], r=0.35, strength=0.45 * math.exp(-(t - t4) * 2.0), t=t)
        fx.suspended_dust(fr, f[0] + 0.05, f[1] - 0.14, f[0] + 0.15, f[1] + 0.05, n=22, t=t, salt="cheek",
                          size=0.006, color=(190, 180, 170))


# =============================================================================
# S3-11  MS knee height: point-blank Red
# =============================================================================

T_THROWN_BACK = P("recoil", lean=-60, neck=-30, ua_n=110, fa_n=140, ua_f=80, fa_f=120, th_n=60, sh_n=40,
                  th_f=40, sh_f=20)


def chest_front(J, st=THRAGG, u=0.75):
    return torso_pt(J, st, u, 1.0)


def s3_11(fr):
    t, dur = fr.t, fr.dur
    t2 = on2(fr)
    t6 = cue(fr, "red_release", 0, 6)
    t8 = cue(fr, "metal_snap", 0, 8)
    sh = C.shake(t, t6, amp=14.0, dur=8 / FPS, freq=48)
    fr.cam = Cam(-1.0, 2.0, 120.0, shake=sh)
    stage(fr)
    heap(fr)
    # ---- Gojo: side-on, arm out, two fingers; lowers it f38-50 (on 2s)
    low = seg(t2, T(fr, 38), dur, "inout")
    gp = rig.blend(G_TWO_CHEST, G_LOOSE, low)
    GJ = gojo(fr, gp, -4.0, None, 1)
    ftip = tip(GJ, "n", GOJO)
    # ---- Thragg: overextended, chest 2 cm off the fingertips; hurled east at f6
    if t < t6:
        tx0, _ = place(THRAGG, T_HK2, -1, lambda J: chest_front(J), (ftip[0] + 0.02, ftip[1]))
        ty0 = _t_hover_ground(T_HK2, tx0, 0.3)
        JT = thragg(fr, T_HK2, tx0, ty0, -1)
        fx.red_charge(fr, ftip[0], ftip[1], t, r=0.06 + 0.02 * seg(t, 0, t6))
    else:
        ts = t - t6
        tx0, _ = place(THRAGG, T_HK2, -1, lambda J: chest_front(J), (ftip[0] + 0.02, ftip[1]))
        ty0 = _t_hover_ground(T_HK2, tx0, 0.3)
        dist = 5.0 * ts * FPS
        x, y = tx0 + RED_U[0] * dist, ty0 + RED_U[1] * dist
        fx.red_release(fr, ftip[0], ftip[1], RED_U[0], RED_U[1], ts, length=16.0, width=2.0)
        if x < 12:
            pts = [(tx0 + RED_U[0] * dist * k / 6, ty0 + RED_U[1] * dist * k / 6) for k in range(7)]
            fx.trail(fr, pts, color=(255, 230, 220), width_m=1.3, alpha=150)
            fx.trail(fr, [(px_, py_ - 0.2) for px_, py_ in pts], color=(200, 30, 40), width_m=0.6, alpha=120)
            JT = thragg(fr, T_THROWN_BACK, x, y, -1, switch=t6, cape_wind=(1.0, 0.1))
            thragg_damage(fr, JT, C.opts(fr, "thragg", t6))
        cape_shreds(fr, t6, (tx0 + 0.2, ty0 + 0.5), t, n=16, salt="s311shreds")
        if t >= t8:
            # heels clip the heap's crest: glass and panels sprayed east along the axis
            fx.debris(fr, 7.4, 3.1, t - t8, n=18, speed=16, spread=0.5, angle=RED_A + 0.1, size=(0.06, 0.25),
                      salt="crest", g=4.0)
            fx.glass_shatter(fr, 6.8, 2.8, 7.8, 3.4, t - t8, n=26, outward=3.0, salt="crestglass")


# =============================================================================
# S3-12  EWS high: three facades, one straight rising line
# =============================================================================

def _red_x(fr, t):
    """Thragg's x along the Red axis (S3-12 re-picks the flight at S3-11 f8)."""
    return kf(t, [(0.0, 8.0), (T(fr, 2), 20.0, "linear"), (T(fr, 6), 40.0, "linear"), (T(fr, 10), 58.0, "linear"),
                  (T(fr, 12), 60.0, "out")])


def s3_12(fr):
    t, dur = fr.t, fr.dur
    t2 = on2(fr)
    push = 1 + 0.05 * seg(t, T(fr, 20), dur, "inout")
    z = 24.5 * push
    A = (44.0, 11.0)
    A0 = (0.5 + (A[0] - 31.0) * 24.5 / OUT_W, 0.5 - (A[1] - 18.0) * 24.5 / OUT_H)
    fr.cam = Cam(A[0] - (A0[0] - 0.5) * OUT_W / z, A[1] + (A0[1] - 0.5) * OUT_H / z, z)
    stage(fr)
    heap(fr)
    east_block(fr)
    hits = [cue(fr, "concrete_break", 0, 2), cue(fr, "concrete_break", 1, 6), cue(fr, "impact_massive", 0, 10)]
    # ---- the body: visible only between the facades, a fading crimson glow behind
    x = _red_x(fr, t)
    y = red_y(x)
    inside = any(b[0] - 0.5 < x < b[1] + 0.5 for b in EAST[:2]) or x >= 58.0
    if t < T(fr, 12):
        trail_x0 = max(8.0, x - 26.0)
        pts = [(lerp(trail_x0, x, k / 8), red_y(lerp(trail_x0, x, k / 8))) for k in range(9)]
        fx.trail(fr, pts, color=(220, 40, 50), width_m=1.2, alpha=150)
        fr.glow_line(pts, (150, 20, 30), width_px=8)
    if not inside:
        thragg(fr, T_THROWN_BACK, x, y, -1, cape_wind=(1.0, 0.1), scale=1.0)
    # a fading crimson line hanging along the path after he is buried
    if t >= T(fr, 10):
        fade = 1 - seg(t, T(fr, 10), T(fr, 40))
        if fade > 0:
            fr.glow_line([(8.0, red_y(8.0)), (58.0, red_y(58.0))], shade((150, 20, 30), fade * 0.6), width_px=5)
    # ---- each punch: a directional burst blowing OUT of the far face along the axis
    for i, th in enumerate(hits):
        if t < th:
            continue
        ts = t - th
        x0, x1, h = EAST[i]
        xo = x1 if i < 2 else x0 + 1.0
        yo = red_y(xo)
        fx.debris(fr, xo, yo, ts, n=26, speed=14.0, spread=0.7, angle=RED_A, size=(0.2, 0.8), g=9.8, ground=0.0,
                  salt=f"burst{i}")
        fx.glass_shatter(fr, xo - 1.0, yo - 1.5, xo + 0.5, yo + 1.5, ts, n=30, outward=2.0, salt=f"bg{i}")
        fx.dust_cloud(fr, xo, yo, ts, r=4.0 if i < 2 else 7.0, n=14, ground=False, rise=0.3, alpha=90,
                      salt=f"bd{i}")
        if i == 2 and ts < 1.2:
            fx.impact(fr, 58.5, red_y(58.5), ts, kind="massive", salt="s312m")
        # dust pours from the holes and spills to the street in curtains
        dust_curtain(fr, x0 + 0.5, red_y(x0) - 1.0, ts - 0.4, width=3.5, salt=f"cur{i}a", alpha=90)
        if i < 2:
            dust_curtain(fr, x1 - 0.5, red_y(x1) - 1.0, ts - 0.4, width=3.5, salt=f"cur{i}b", alpha=90)
    # floors slumping in the third building (staggered dust bursts) + glass rain along the line
    if t >= T(fr, 14):
        for k in range(4):
            tk = T(fr, 14 + 9 * k)
            if t >= tk:
                fx.dust_cloud(fr, 62.0, 16.8 - 4.2 * k, t - tk, r=4.5, n=10, ground=False, rise=-0.6, alpha=80,
                              salt=f"slump{k}")
        dust_curtain(fr, 62.0, 14.0, t - T(fr, 14), width=6.0, salt="lobby", alpha=110, rate=0.8)
        fx.dust_cloud(fr, 62.0, 0.5, t - T(fr, 20), r=10.0, n=22, rise=0.5, alpha=95, salt="lobbydust")
    tgl = cue(fr, "glass_shatter", 0, 24)
    if t >= tgl:
        for i in range(3):
            x0, x1, h = EAST[i]
            fx.glass_shatter(fr, x0, red_y(x0), x1, red_y(x1) + 1, t - tgl, n=18, outward=0.3, salt=f"rain{i}")
    # ---- Gojo, tiny at lower-left, holds the firing pose; lowers it f30-42
    low = seg(t2, T(fr, 30), T(fr, 42), "inout")
    gojo(fr, rig.blend(G_TWO_CHEST, G_LOOSE, low), -4.0, None, 1)


# =============================================================================
# S3-13  WS low: he simply stands up through it
# =============================================================================

T_BURIED = P("slump_kneel", lean=60, neck=30, ua_n=20, fa_n=10, ua_f=10, fa_f=0)
T_RISE = P("rise", lean=20, neck=18, ua_n=10, fa_n=6, ua_f=-6, fa_f=-4)
T_UP = P("t_stand", lean=2, neck=4, ua_n=8, fa_n=6, ua_f=-8, fa_f=-4)
T_STEP = P(T_UP, th_n=26, sh_n=10, th_f=-14, sh_f=-20)


def s3_13(fr):
    t, dur = fr.t, fr.dur
    t2 = on2(fr)
    zoom = 150.0
    fr.cam = Cam(59.8, 2.75 + 0.15 * seg(t, T(fr, 20), dur), zoom)
    stage(fr)
    east_block(fr)
    # inside the slumped lobby: slab ends and rebar, dust still pouring from above
    rng = random.Random("lobby13")
    for k in range(5):
        cx, cy, a = 59.0 + k * 1.6, 2.4 + rng.uniform(-0.4, 0.9), rng.uniform(-35, 35)
        slab_shape(fr, cx, cy, a, None, 1.0, 0.75, L=3.0, th=0.4)
        # rebar bristling from the broken slab ends
        for end in (-1, 1):
            ex = cx + end * 1.5 * math.cos(math.radians(a))
            ey = cy + end * 1.5 * math.sin(math.radians(a))
            for j in range(3):
                q = math.radians(a) + (0 if end > 0 else math.pi) + rng.uniform(-0.5, 0.5)
                L_ = rng.uniform(0.25, 0.5)
                fr.line([(ex, ey + 0.1 * (j - 1)), (ex + math.cos(q) * L_, ey + 0.1 * (j - 1) + math.sin(q) * L_)],
                        (120, 74, 56), width_m=0.035)
    dust_curtain(fr, 61.5, 11.0, C.tg(fr) - 10, width=4.0, salt="pour13", alpha=70, rate=0.7)
    # ---- Thragg: buried (f0-12), rubble shifts (f12-20), he simply rises (f20-38,
    #      on 2s), steps onto the crest and turns his head west (f38-52)
    shift = seg(t, T(fr, 12), T(fr, 20))
    up = seg(t2, T(fr, 20), T(fr, 38), "inout")
    step = seg(t2, T(fr, 38), T(fr, 46), "inout")
    pose = rig.blend(rig.blend(T_BURIED, T_RISE, clamp(up * 2)), T_UP, clamp(up * 2 - 1))
    pose = rig.blend(pose, T_STEP, step * (1 - seg(t2, T(fr, 46), T(fr, 50))))
    look = seg(t2, T(fr, 42), T(fr, 50))
    pose = P(pose, neck=lerp(pose["neck"], -2, look))
    feet = lerp(-0.4, 0.0, up) + 0.95 * step
    tx = 60.2 - 0.6 * step
    JT = thragg(fr, pose, tx, None, -1, ground=feet, cape_wind=(0.6, -0.4))
    if up > 0.2:
        thragg_damage(fr, JT, C.opts(fr, "thragg"))
        # concrete dust streaming off him
        rng2 = fr.srng("off13")
        img, dr = fr.layer()
        for i in range(40):
            ph = (rng2.random() + t * 0.8) % 1.0
            sx, sy = JT["sh_n"] if i % 2 else JT["sh_f"]
            X, Y = fr.P(sx + rng2.uniform(-0.25, 0.25) + 0.15 * ph, sy - ph * 1.7)
            R = fr.S(0.012 + 0.03 * ph)
            dr.ellipse([X - R, Y - R, X + R, Y + R], fill=shade(PAL["dust"], 1.0) + (int(150 * (1 - ph)),))
        fr.merge(img)
    # slabs sliding off his back and shoulders as he comes up
    if T(fr, 20) <= t < T(fr, 36):
        u = seg(t, T(fr, 20), T(fr, 36), "in")
        bx, by = JT["chest"]
        slab_shape(fr, bx + 0.6 + 0.9 * u, by + 0.3 - 1.6 * u, -25 - 50 * u, None, 0.8, 0.9, L=2.4, th=0.4)
    # the front of the rubble (hides him while he is under it); shifts at f12-20
    h = 1.05
    pile = [(55.8, -0.8), (56.6, 0.3), (57.8, 0.7), (59.0, h + 0.12 * shift), (60.0, h - 0.05), (61.2, h + 0.05),
            (62.6, 0.85), (64.6, 0.5), (66.8, 0.2), (68.5, -0.8)]
    fr.poly(pile, shade((76, 72, 72), 1.0))
    for k in range(12):
        cx = 56.8 + k * 0.95
        cy = 0.35 + 0.3 * math.sin(k * 1.7) + (0.3 if 58.5 < cx < 61.8 else 0.0)
        ang = k * 33 + (14 * shift if k in (3, 4) else 0)
        chunk_shape(fr, cx, cy, ang, 0.32, shade(PAL["concrete"], 0.8), None, 300 + k)
    fx.dust_cloud(fr, 61.0, 0.4, 1.4 + t * 0.4, r=6.0, n=14, rise=0.3, alpha=50, salt="lobbyhaze")


# =============================================================================
# S3-14  CU: the glove, his own blood, "Now we're fighting."
# =============================================================================

def _thragg_cu_bg(fr, t):
    inserts._bg(fr, (30, 26, 34), (96, 74, 64), bokeh=False)
    # soft slab silhouettes of the slumped lobby and the warm rim light from the west
    fr.s_poly([(0.0, 1.0), (0.0, 0.66), (0.18, 0.6), (0.33, 0.7), (0.38, 1.0)], (46, 40, 44))
    fr.s_poly([(0.7, 1.0), (0.76, 0.58), (1.0, 0.5), (1.0, 1.0)], (40, 36, 40))
    fr.s_poly([(0.02, 0.18), (0.3, 0.12), (0.31, 0.2), (0.03, 0.27)], (60, 54, 56))
    fr.soft_circle(0.05, 0.3, 0.5, (90, 52, 30), world=False)
    blur_img(fr, 10)
    rng = fr.srng("cudust")
    for i in range(60):
        u = (rng.random() + t * rng.uniform(0.005, 0.02)) % 1.0
        v = (rng.random() + t * rng.uniform(0.01, 0.03)) % 1.0
        b = 0.6 + 0.6 * (1 - u)
        fr.s_circle(u, v, rng.uniform(0.0015, 0.004), fill=shade(PAL["dust"], b))


def _jaw(t, t0, length, words=4):
    if not (t0 <= t < t0 + length):
        return 0.0
    u = (t - t0) / length * words
    k = u - math.floor(u)
    amp = (0.8, 0.6, 1.0, 0.45)[int(math.floor(u)) % 4]
    return amp * max(0.0, math.sin(min(1.0, k / 0.8) * math.pi))


def _glove(fr, L, x, y, rot, smear=0.0):
    """Back of Thragg's crimson glove (local coords), sleeve going off-frame."""
    g = THRAGG.accent
    a = math.radians(rot)

    def R(px, py):
        return (x + px * math.cos(a) - py * math.sin(a), y + px * math.sin(a) + py * math.cos(a))
    L.poly([R(-0.12, 0.18), R(0.14, 0.2), R(0.2, 1.4), R(-0.22, 1.4)], THRAGG.suit)
    L.poly([R(-0.13, 0.12), R(0.15, 0.14), R(0.17, 0.3), R(-0.15, 0.28)], g)
    L.poly([R(-0.2, -0.24), R(0.16, -0.28), R(0.24, -0.08), R(0.2, 0.18), R(-0.16, 0.2), R(-0.24, -0.04)], g)
    for k in range(4):
        L.ell(*R(-0.16 + k * 0.11, -0.25), 0.055, 0.045, fill=shade(g, 1.15))
    L.line([R(-0.1, -0.12), R(0.14, -0.14)], shade(g, 0.6), 0.012)
    if smear > 0:
        L.line([R(-0.14, -0.06), R(0.02, -0.1), R(0.16, -0.08)], (90, 6, 14), 0.05 * smear)
        L.line([R(-0.08, -0.08), R(0.08, -0.1)], (200, 60, 70), 0.012 * smear)


def s3_14(fr):
    t, dur = fr.t, fr.dur
    ta = on2(fr)
    dl = (fr.shot.get("dialogue") or [{}])[0]
    t_line = dl.get("at_frame", 40) / FPS
    t_len = dl.get("frames", 34) / FPS
    _thragg_cu_bg(fr, t)
    s = 1.0 * (1 + 0.08 * seg(t, T(fr, 40), dur, "inout"))
    cu, cv = 0.55, 0.5
    o = C.opts(fr, "thragg")
    inj = list(o["injuries"])
    t_wipe = T(fr, 10)
    wiped = ta >= t_wipe
    if ta < T(fr, 34):
        expr = "analytical"
    elif ta < T(fr, 72):
        expr = "smile"
    else:
        expr = "resolve"
    face_inj = [i for i in inj if not (wiped and i == "mouth_blood")]
    # torn uniform + the rag of the cape on the far shoulder (behind the face)
    L = inserts.Local(fr, cu, cv, s, 0.0, -1)
    inserts.thragg_face(fr, cu=cu, cv=cv, s=s, expr=expr, injuries=face_inj, flip=-1, t=t)
    if o.get("cape") == "torn":
        L.poly([(-0.95, 0.92), (-0.75, 0.94), (-0.8, 1.3), (-0.88, 1.18), (-0.92, 1.42), (-1.02, 1.2), (-1.08, 1.4)],
               shade(THRAGG.accent, 0.7))
    if "torn_suit" in inj:
        L.poly([(-0.6, 0.97), (-0.3, 0.94), (-0.22, 1.08), (-0.35, 1.2), (-0.28, 1.4), (-0.68, 1.4), (-0.72, 1.14)],
               shade(THRAGG.skin, 0.85))
        for k in range(4):
            L.line([(-0.62 + k * 0.1, 0.96), (-0.6 + k * 0.1, 1.06 + 0.03 * k)], shade(THRAGG.suit, 0.75), 0.012)
    # eyes: on the glove (f16-34), rising west (f34-40) and holding
    if ta < T(fr, 16):
        gz = (0.0, 0.0)
    elif ta < T(fr, 34):
        gz = (-0.05, 0.022)
    else:
        gz = (lerp(-0.05, 0.035, seg(ta, T(fr, 34), T(fr, 40))), lerp(0.022, 0.0, seg(ta, T(fr, 34), T(fr, 40))))
    oh = {"analytical": 0.035, "smile": 0.022, "resolve": 0.03}[expr]
    for ex in (0.34, -0.06):
        L.ell(ex, -0.13, 0.1, oh + 0.01, fill=(220, 214, 214))
        L.ell(ex + 0.02 + gz[0], -0.13 + gz[1], 0.035, oh + 0.005, fill=(26, 18, 22))
    # faint smile: one corner of the mustache lifts
    sm = seg(ta, T(fr, 34), T(fr, 40)) * (1 - seg(ta, T(fr, 70), T(fr, 78)))
    if sm > 0:
        L.line([(0.4, 0.4), (0.5, 0.4 - 0.05 * sm)], (110, 50, 50), 0.018)
    # lip-sync "Now we're fighting." (on 2s)
    j = _jaw(ta, t_line, t_len)
    if j > 0:
        L.poly([(0.08, 0.42), (0.4, 0.41), (0.36, 0.42 + 0.07 * j), (0.12, 0.43 + 0.07 * j)], (50, 18, 22))
    # the split lip persists after the wipe; a fresh bead returns at f52
    if wiped and "mouth_blood" in inj:
        L.line([(0.36, 0.43), (0.42, 0.47)], (160, 12, 22), 0.016)
        bead = seg(t, T(fr, 52), T(fr, 58), "out")
        if bead > 0:
            L.ell(0.41, 0.5 + 0.02 * bead, 0.012 + 0.008 * bead, 0.014 + 0.01 * bead, fill=(150, 8, 18))
    # the glove: wipe (f0-16, one slow stroke), lowered to look at (f16-34), out (f34-40)
    if ta < T(fr, 16):
        k = seg(ta, 0, T(fr, 16), "inout")
        gx = kf(k, [(0.0, 0.62), (0.35, 0.4), (0.8, -0.05), (1.0, -0.2)])
        gy = kf(k, [(0.0, 1.2), (0.35, 0.5), (0.8, 0.46), (1.0, 0.8)])
        _glove(fr, L, gx, gy, kf(k, [(0.0, -20), (1.0, 25)]), smear=seg(k, 0.4, 0.8))
    elif ta < T(fr, 40):
        k = seg(ta, T(fr, 16), T(fr, 22), "out") * (1 - seg(ta, T(fr, 34), T(fr, 40), "in"))
        _glove(fr, L, lerp(-0.2, -0.52, k), lerp(1.45, 0.74, k), 15 + 25 * k, smear=1.0)
    fr.vignette = 0.5


# =============================================================================
# S3-15  MCU: the blindfold comes down
# =============================================================================

SPIKES = [(-0.62, -0.25), (-0.95, -0.55), (-0.62, -0.62), (-0.92, -0.98), (-0.45, -0.82), (-0.55, -1.32),
          (-0.2, -0.95), (-0.12, -1.42), (0.08, -1.0), (0.32, -1.36), (0.3, -0.92), (0.62, -1.18), (0.45, -0.74),
          (0.78, -0.82), (0.5, -0.5), (0.58, -0.3)]
HAIR_DOWN = [(-0.66, -0.2), (-0.88, -0.6), (-0.6, -0.9), (-0.2, -1.05), (0.3, -0.98), (0.64, -0.7), (0.62, -0.38),
             (0.52, -0.1), (0.4, -0.3), (0.3, -0.05), (0.16, -0.32), (0.04, -0.08), (-0.1, -0.34), (-0.3, -0.06),
             (-0.4, -0.3)]


def gojo_cu(fr, cu, cv, s, band=0.0, hair_u=0.0, smirk=1.0, brow=0.0, hand=0.0, eyes_lit=1.0, injuries=()):
    """Gojo 3/4 close-up (after inserts.gojo_face) with in-between states:
    band 0 = blindfold over the eyes .. 1 = around his neck; hair_u 0 = held
    up in spikes .. 1 = fallen loose (may overshoot for the settle);
    smirk 1 = full .. 0 = flat; hand 0..1 = two fingers hooked in the band."""
    L = inserts.Local(fr, cu, cv, s, 0.0, 1)
    skin, shadow = GOJO.skin, shade(GOJO.skin, 0.8)
    hair, hair_sh = GOJO.hair, shade(GOJO.hair, 0.78)
    suit = GOJO.suit
    L.poly([(-0.28, 0.55), (0.22, 0.55), (0.3, 1.2), (-0.4, 1.2)], skin)
    L.poly([(-0.55, 0.7), (0.5, 0.62), (0.62, 1.3), (-0.7, 1.3)], suit)
    L.poly([(-0.42, 0.62), (0.36, 0.56), (0.42, 0.85), (-0.48, 0.92)], shade(suit, 1.3))
    face = [(-0.5, -0.35), (-0.45, 0.15), (-0.3, 0.45), (0.0, 0.66), (0.22, 0.62), (0.42, 0.34), (0.5, 0.0),
            (0.48, -0.4), (0.0, -0.62), (-0.4, -0.58)]
    L.poly(face, skin)
    L.poly([(-0.5, -0.35), (-0.45, 0.15), (-0.3, 0.45), (0.0, 0.66), (-0.12, 0.3), (-0.3, -0.1)], shadow)
    my = 0.38
    L.line([(0.02, my + 0.02 * smirk), (0.18, my), (0.3, my - 0.05 * smirk - 0.01)], (140, 80, 80), 0.022)
    L.line([(0.38, 0.0), (0.44, 0.16), (0.36, 0.2)], shade(skin, 0.7), 0.015)
    # eyes (under the band until it slides off): vivid blue, white lashes, no glow
    for ex, sz in ((0.3, 1.0), (-0.12, 0.85)):
        ey = -0.15
        L.ell(ex, ey, 0.12 * sz, 0.07 * sz, fill=(240, 252, 255))
        L.ell(ex + 0.01, ey, 0.065 * sz, 0.065 * sz, fill=mix_color((60, 190, 255), (110, 215, 255), eyes_lit))
        L.ell(ex + 0.01, ey, 0.03 * sz, 0.03 * sz, fill=(215, 245, 255))
        L.ell(ex - 0.02, ey - 0.025, 0.014 * sz, 0.012 * sz, fill=(255, 255, 255))
        L.line([(ex - 0.13 * sz, ey - 0.06), (ex + 0.13 * sz, ey - 0.08)], hair, 0.014)
    # hair: spikes droop toward the loose shape, then the fringe falls over the brow
    hu = hair_u
    if hu < 0.5:
        k = hu / 0.5
        pts = [(x, lerp(y, max(y, -1.02), k)) for x, y in SPIKES]
        L.poly(pts, hair)
        L.poly([(-0.62, -0.25), (-0.92, lerp(-0.98, -0.8, k)), (-0.45, -0.82), (-0.3, -0.5)], hair_sh)
    else:
        k = (hu - 0.5) / 0.5            # 0..1 (+ overshoot)
        drop = lerp(-0.14, 0.0, k)
        pts = [(x, y + (drop if y > -0.4 else 0.0)) for x, y in HAIR_DOWN]
        L.poly(pts, hair)
        L.poly([(-0.66, -0.2), (-0.88, -0.6), (-0.6, -0.9), (-0.45, -0.4)], hair_sh)
        # re-draw the uncovered eyes over the fringe tips
        for ex, sz in ((0.3, 1.0), (-0.12, 0.85)):
            if k > 0.6:
                L.ell(ex + 0.01, -0.15, 0.065 * sz, 0.06 * sz, fill=mix_color((60, 190, 255), (110, 215, 255), eyes_lit))
                L.ell(ex + 0.01, -0.15, 0.03 * sz, 0.03 * sz, fill=(215, 245, 255))
                L.ell(ex - 0.02, -0.175, 0.014 * sz, 0.012 * sz, fill=(255, 255, 255))
    if brow > 0:
        L.line([(0.14, -0.32 + 0.02 * (1 - brow)), (0.46, -0.3)], hair, 0.02 * brow)
    # the blindfold band: over the eyes -> drawn down the face -> slack round the neck
    b = clamp(band)
    if b < 0.85:
        dy = b / 0.85 * 0.86
        L.poly([(-0.6, -0.28 + dy), (0.52, -0.3 + dy), (0.52, -0.06 + dy), (-0.55, -0.02 + dy)], GOJO.accent)
        L.line([(-0.55, -0.27 + dy), (0.5, -0.29 + dy)], (40, 40, 50), 0.01)
    else:
        k = (b - 0.85) / 0.15
        L.poly([(-0.5, 0.56), (0.3, 0.52), (0.5, 0.62 + 0.04 * k), (0.4, 0.8 + 0.04 * k), (-0.1, 0.84 + 0.06 * k),
                (-0.55, 0.78)], GOJO.accent)
        L.line([(-0.45, 0.62), (0.38, 0.6)], (40, 40, 50), 0.01)
    # two fingers hooked in the band
    if hand > 0:
        # his right hand from below-right, two fingers hooked over the band's top edge
        dy = min(b, 0.85) / 0.85 * 0.86
        hx, hy = 0.46, -0.3 + dy
        hy += lerp(1.5, 0.0, clamp(hand))
        hs = shade(skin, 0.93)
        edge = shade(skin, 0.6)
        palm = [(hx - 0.12, hy + 0.16), (hx + 0.14, hy + 0.12), (hx + 0.26, hy + 0.5), (hx + 0.42, hy + 1.7),
                (hx + 0.02, hy + 1.7), (hx - 0.14, hy + 0.5)]
        L.poly([(hx + 0.2, hy + 0.55), (hx + 0.46, hy + 1.7), (hx + 0.8, hy + 1.7), (hx + 0.5, hy + 0.5)], suit)
        L.poly(palm, hs)
        L.line(palm + [palm[0]], edge, 0.012)
        for ox in (-0.07, 0.05):
            L.line([(hx + ox, hy + 0.2), (hx + ox - 0.01, hy - 0.03), (hx + ox - 0.07, hy + 0.02)], edge, 0.064)
            L.line([(hx + ox, hy + 0.2), (hx + ox - 0.01, hy - 0.03), (hx + ox - 0.07, hy + 0.02)], hs, 0.046)


def s3_15(fr):
    t, dur = fr.t, fr.dur
    ta = on2(fr)
    t16 = cue(fr, "cloth", 0, 16)
    o = C.opts(fr, "gojo", switch=T(fr, 24))
    # background: the street at dusk, soft; the tunnel and its dust at screen-right
    inserts._bg(fr, (28, 26, 42), (120, 82, 70), bokeh=False)
    fr.soft_circle(0.0, 0.45, 0.45, (110, 60, 34), world=False)
    fr.s_poly([(0.66, 0.0), (0.78, 0.0), (0.8, 1.0), (0.66, 1.0)], (46, 44, 58))
    fr.s_poly([(0.8, 0.0), (1.0, 0.0), (1.0, 1.0), (0.82, 1.0)], (40, 40, 52))
    fr.s_poly([(0.82, 0.44), (0.97, 0.36), (0.98, 0.5), (0.83, 0.58)], (16, 16, 22))
    rng = fr.srng("dust15")
    for i in range(14):
        ph = (rng.random() + t * 0.12) % 1.0
        fr.s_circle(0.84 + rng.uniform(0, 0.12) + 0.03 * ph, 0.48 + 0.4 * ph, 0.05 + 0.06 * ph,
                    fill=mix_color((96, 84, 80), (150, 130, 112), rng.random() * (1 - ph)))
    fr.s_circle(0.895, 0.53, 0.012, fill=(200, 196, 192))
    fr.s_circle(0.895, 0.505, 0.006, fill=(230, 220, 210))
    fr.s_rect(0.889, 0.515, 0.901, 0.53, (150, 30, 36))
    blur_img(fr, 8)
    # the acting, on 2s
    smirk = lerp(1.0, 0.45, seg(ta, 0, T(fr, 10)))
    brow = seg(ta, T(fr, 2), T(fr, 10))
    hand = seg(ta, T(fr, 10), t16, "out") * (1 - seg(ta, T(fr, 26), T(fr, 32), "in"))
    band = seg(ta, t16, T(fr, 26), "inout")
    if o["eyes"] == "open":
        band = max(band, 1.0) if ta >= T(fr, 26) else band
    # hair falls on 1s over 4 frames, with a small settle
    hair_u = kf(t, [(T(fr, 24), 0.0), (T(fr, 25), 0.35, "linear"), (T(fr, 26), 0.75, "linear"),
                    (T(fr, 27), 1.08, "out"), (T(fr, 28), 1.0, "inout")])
    if not o["hair_down"] and t < T(fr, 24):
        hair_u = 0.0
    lit = seg(t, T(fr, 26), T(fr, 32))
    gojo_cu(fr, 0.42, 0.56, 1.0, band=band, hair_u=hair_u, smirk=smirk, brow=brow, hand=hand, eyes_lit=lit,
            injuries=o["injuries"])
    fr.vignette = 0.5


SHOTS = {
    "S3-01": s3_01,
    "S3-02": s3_02,
    "S3-03": s3_03,
    "S3-04": s3_04,
    "S3-05": s3_05,
    "S3-06": s3_06,
    "S3-07": s3_07,
    "S3-08": s3_08,
    "S3-09": s3_09,
    "S3-10": s3_10,
    "S3-11": s3_11,
    "S3-12": s3_12,
    "S3-13": s3_13,
    "S3-14": s3_14,
    "S3-15": s3_15,
}
