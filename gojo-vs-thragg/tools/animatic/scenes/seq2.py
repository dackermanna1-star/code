"""Sequence 2 - THE FIRST IMPACT (S2-01 .. S2-15).

Thragg's experiments against Infinity. Every blow decelerates without end
(80% of the gap in 2 frames, +15% over 6, then a Zeno crawl to 1 cm); the
only real contacts are the steel mast arm (S2-06) and the street (S2-11).
Gojo never defends: Infinity is automatic. His only motions are acting
beats (head tilt, weight shift, pinch, the turn in S2-13 and back in S2-15).

Screen direction: Gojo screen-left, Thragg screen-right, strikes travel
right -> left. The one motivated reversal is S2-13/S2-14 (dive from the
west), restored by Thragg's backward withdrawal in S2-15.

Timing: action beats are authored against the nominal shot lengths in NOM
and scaled by fr.n / NOM (T()), so the shots still work if a few frames
change. Contact frames are read from each shot's own sfx cues (cue()), so
they stay exactly on the shot list.

Damage that persists across shots (blown windows, sheared/fallen mast arm,
lamp posts, the torn-up slab and its hole) is drawn by aftermath() as a
pure function of the GLOBAL frame, keyed to the shot list's event frames.
"""
from __future__ import annotations

import math
import random

from PIL import Image, ImageDraw, ImageFilter

import scenes.common as C
from engine import Cam, kf, pulse, clamp, EASE, lerp, mix_color, shade, PAL, FPS, OUT_W, OUT_H
import env
import fx
import inserts
import rig
from rig import GOJO, THRAGG, P, draw_fighter, solve

SEQ = 2

# nominal shot lengths the beats below were authored against
NOM = {"S2-01": 22, "S2-02": 34, "S2-03": 88, "S2-04": 34, "S2-05": 30, "S2-06": 56, "S2-07": 36,
       "S2-08": 40, "S2-09": 32, "S2-10": 36, "S2-11": 84, "S2-12": 48, "S2-13": 60, "S2-14": 36,
       "S2-15": 84}


# =============================================================================
# timing helpers
# =============================================================================

def _k(shot):
    return shot["frames"] / NOM.get(shot["id"], shot["frames"])


def T(fr, f):
    """Nominal frame number of this shot -> seconds (scaled to the real length)."""
    return f * _k(fr.shot) / FPS


def cue(fr, name, nth=0, default=0):
    """Time (s) of the nth sfx cue `name` in this shot (contact frames live
    there); falls back to the nominal frame `default`."""
    hits = sorted(s["at"] for s in (fr.shot.get("sfx") or []) if s.get("cue") == name)
    if len(hits) > nth:
        return hits[nth] / FPS
    return T(fr, default)


_BY_ID = None


def _shot(sid):
    global _BY_ID
    if _BY_ID is None:
        _BY_ID = {s["id"]: s for s in C.shotlist()["shots"]}
    return _BY_ID[sid]


def ev(sid, f):
    """Global frame of nominal frame f of shot sid."""
    s = _shot(sid)
    return s["start_frame"] + f * _k(s)


def since(fr, sid, f):
    """Seconds since nominal frame f of shot sid (negative = not yet)."""
    return (fr.gf - ev(sid, f)) / FPS


def stall_gap(t, t_launch, t_stall, g0, g_end=0.01, crawl=5.0):
    """Remaining gap (m) of a blow entering Infinity, per the VFX bible:
    80% of the gap covered by t_stall (2 frames after launch), +15% over the
    next 6 frames, then a Zeno crawl toward g_end (1 cm) that never arrives."""
    span = g0 - g_end
    if t <= t_launch:
        return g0
    if t < t_stall:
        return g0 - 0.8 * span * (t - t_launch) / max(1e-6, t_stall - t_launch)
    t6 = t_stall + 6 / FPS
    if t < t6:
        return g_end + span * (0.2 - 0.15 * EASE["out"]((t - t_stall) / (6 / FPS)))
    return g_end + fx.zeno(0.05 * span, t - t6, rate=crawl)


def post_gap(t, t_stall, g_stall, g_end=0.01, crawl=5.0):
    """Gap after a stall that began with `g_stall` metres left."""
    g0 = g_end + (g_stall - g_end) / 0.2
    return stall_gap(max(t, t_stall), t_stall - 2 / FPS, t_stall, g0, g_end, crawl)


def on2(fr):
    """Shot time held on 2s (for Gojo's acting)."""
    return (fr.f - fr.f % 2) / FPS


# =============================================================================
# rig helpers
# =============================================================================

def swap_arms(p):
    q = dict(p)
    for a, b in (("ua_n", "ua_f"), ("fa_n", "fa_f"), ("hand_n", "hand_f")):
        q[a], q[b] = p[b], p[a]
    return q


def swap_legs(p):
    q = dict(p)
    for a, b in (("th_n", "th_f"), ("sh_n", "sh_f")):
        q[a], q[b] = p[b], p[a]
    return q


def fist_c(J, side, st=THRAGG):
    wx, wy = J[f"wr_{side}"]
    d = J[f"hand_dir_{side}"]
    r = st.fist * J["scale"]
    return (wx + d[0] * r * 0.9, wy + d[1] * r * 0.9)


def knuckle(J, side, st=THRAGG):
    cx, cy = fist_c(J, side, st)
    d = J[f"hand_dir_{side}"]
    r = st.fist * J["scale"]
    return (cx + d[0] * r, cy + d[1] * r)


def kneecap(J, side, st=THRAGG):
    hx, hy = J[f"hip_{side}"]
    kx, ky = J[f"kn_{side}"]
    L = math.hypot(kx - hx, ky - hy) or 1.0
    w = st.w_th * 0.45 * J["scale"]
    return (kx + (kx - hx) / L * w, ky + (ky - hy) / L * w)


def place(st, pose, facing, getter, target, scale=1.0):
    """Pelvis position that puts getter(J) (a fist, knee, heel...) on target."""
    J0 = solve(st, pose, 0.0, 0.0, facing, scale)
    ex, ey = getter(J0)
    return target[0] - ex, target[1] - ey


def face_pt(J, up=0.15, st=GOJO, fwd_k=1.18):
    """Front of Gojo's blindfold (the point every head strike stalls at)."""
    hx, hy = J["head"]
    r = st.head_r * J["scale"]
    f = J["facing"]
    hd = J["head_dir"]
    fwd = (hd[1] * f, -hd[0] * f)
    return (hx + fwd[0] * fwd_k * r + hd[0] * up * r, hy + fwd[1] * fwd_k * r + hd[1] * up * r)


def chest_front(J, y, st=GOJO):
    """x of the front of Gojo's jacket at height y."""
    f = J["facing"]
    return J["chest"][0] + f * st.w_chest * 0.72 * 0.5 * J["scale"]


def gopts(fr, **kw):
    return C.opts(fr, "gojo", **kw)


def topts(fr, **kw):
    return C.opts(fr, "thragg", **kw)


GSOLE = 6.2      # Gojo's soles: the mast arm's top, then the same height on empty air (no drop)
GX = -6.0


HALO = (120, 150, 196)


def gojo(fr, pose, facing=1, x=GX, sole=GSOLE, view="side", depth=1.0, halo=0.0, scale=1.0, **kw):
    """Gojo with his feet on `sole`. halo (px) draws a cool rim silhouette
    behind him so the black uniform reads against the dark facades in wides."""
    if halo > 0:
        o = halo / fr.cam.zoom * depth
        for dx, dy in ((o, 0), (-o, 0), (0, o), (0, -o), (o * 0.7, o * 0.7), (-o * 0.7, o * 0.7)):
            draw_fighter(fr, GOJO, pose, x + dx, None, facing, view=view, scale=scale, opts=gopts(fr, **kw),
                         ground=sole + dy, depth=depth, silhouette=HALO)
    return draw_fighter(fr, GOJO, pose, x, None, facing, view=view, scale=scale, opts=gopts(fr, **kw), ground=sole,
                        depth=depth)


def thragg(fr, pose, x, y, facing=-1, depth=1.0, view="side", **kw):
    return draw_fighter(fr, THRAGG, pose, x, y, facing, view=view, opts=topts(fr, **kw), depth=depth)


# ---- Gojo poses -------------------------------------------------------------
G_POCKETS = P("g_idle")                                                   # both hands in pockets
G_LOOSE = P("g_idle", ua_n=5, fa_n=0, hand_n="open")                      # right hand out, loose
G_WEIGHT = P(G_LOOSE, th_f=-1, sh_f=-15, th_n=6, sh_n=6)                  # weight on the right leg
G_PINCH = P("g_idle", ua_n=46, fa_n=166, hand_n="open")                   # right hand up beside the fist
# facing WEST the right hand is the far one
G_LOOSE_W = P("g_idle", ua_f=5, fa_f=0, hand_f="open")
G_FRONT = P("front_pockets", ua_f=9, fa_f=4, hand_f="open")               # mid-turn, facing camera

# ---- Thragg poses (facing WEST unless noted: near = LEFT side) -------------
# airborne: knees bent and feet trailing, so a Viltrumite hover never reads as standing on the arm
LEGS_AIR = dict(th_n=22, sh_n=-62, th_f=-4, sh_f=-86)
T_STALL_R = swap_arms(P("t_punch", lean=22, neck=-2, **LEGS_AIR))
T_STALL_R_C = P(T_STALL_R, lean=27, ua_f=99, fa_f=86)                     # compressed behind the fist
T_FLY = swap_arms(P("t_fly_punch", lean=36, neck=-20, ua_n=144, fa_n=144, ua_f=-40, fa_f=10,
                    th_n=-30, sh_n=-44, th_f=-40, sh_f=-58))
T_GUARD = P("t_guard", **LEGS_AIR)
T_HOOK_WIND = P("t_hook_wind", lean=-8, neck=4, ua_n=-26, fa_n=96, ua_f=40, fa_f=128, **LEGS_AIR)
T_HOOK = P("t_hook", lean=16, neck=2, ua_n=80, fa_n=128, ua_f=34, fa_f=126, hand_n="fist", **LEGS_AIR)
T_HOOK_C = P(T_HOOK, lean=21, ua_n=88, fa_n=140)
T_KNEE_WIND = swap_legs(P("t_knee", lean=10, neck=6, ua_n=50, fa_n=110, ua_f=30, fa_f=100,
                          th_n=-30, sh_n=-70, th_f=20, sh_f=-20))
T_KNEE = swap_legs(P("t_knee", lean=-4, neck=8, ua_n=18, fa_n=150, ua_f=4, fa_f=140,
                     th_n=106, sh_n=-4, th_f=-10, sh_f=-30))
T_KNEE_C = P(T_KNEE, lean=4, neck=10)


# =============================================================================
# drawing helpers
# =============================================================================

def soft_draw(fr, fn, radius=2.0, alpha=1.0):
    """Draw fn() into its own layer, blur it (shallow depth of field) and
    composite. Returns fn's result."""
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


def s2w(fr, u, v, d=1.0):
    """Screen (0..1) -> layer coordinates at depth d for the current camera."""
    c = fr.cam
    return (c.x + (u * OUT_W - OUT_W / 2) * d / c.zoom, c.y - (v * OUT_H - OUT_H / 2) * d / c.zoom)


def w2s(fr, x, y, d=1.0):
    px, py = fr.P(x, y, d)
    return px / fr.W, py / fr.H


def shards(fr, pts, t, salt, size=0.03, d=None, col=(96, 92, 96)):
    """Asphalt shards hanging in the air: irregular chips with a 1-2 mm
    jitter and no net drift (Infinity's dangerous fragments)."""
    rng = fr.srng(salt)
    for i, (x, y) in enumerate(pts):
        jx = math.sin(t * 31 + i * 1.7) * 0.0015
        jy = math.cos(t * 27 + i * 2.3) * 0.0015
        s = size * rng.uniform(0.5, 1.3)
        a0 = rng.uniform(0, math.tau)
        poly = [(x + jx + math.cos(a0 + k * 2.1 + rng.uniform(-0.3, 0.3)) * s * rng.uniform(0.6, 1.0),
                 y + jy + math.sin(a0 + k * 2.1 + rng.uniform(-0.3, 0.3)) * s * rng.uniform(0.6, 1.0))
                for k in range(3)]
        fr.poly(poly, shade(col, rng.uniform(0.6, 1.5)), d=d)


RIPPLE = 0.3       # s: fx.impact('blocked') fades its rings toward BLACK, so stop drawing them before that reads


def inf_stop(fr, J, gojo_xy, t_since, side="n", r=0.85, gap=0.05):
    """C.infinity_stop, except that after RIPPLE seconds the compressed-air
    ripple is dropped (its fade goes dark) and only the refraction and the
    hanging grit remain - drawn exactly as infinity_stop draws them."""
    if t_since < RIPPLE:
        C.infinity_stop(fr, J, gojo_xy, t_since, side=side, r=r, gap=gap)
        return
    hx, hy = rig.hand_pos(J, side)
    fx.infinity(fr, gojo_xy[0], gojo_xy[1], r=r, strength=1.0, t=fr.t)
    x0, x1 = sorted((hx, gojo_xy[0]))
    fx.suspended_dust(fr, x0 + gap, hy - 0.12, x1 - gap, hy + 0.12, n=46, t=fr.t, salt=f"inf{side}")


def stall_cues(fr, gojo_pt, lead_pt, t_since, salt, r=0.7, dirx=None, gap_cloud=0.22, n_dust=30,
               strength=1.0, d=None):
    """Infinity cues for a blow (knee, heel, slab...) without a hand to hand
    to C.infinity_stop: refraction around the target, compressed-air ripple
    at the leading point (no flash), grit hanging between them - never on
    Gojo's side of the target point."""
    k = clamp(t_since / 0.1)
    fx.infinity(fr, gojo_pt[0], gojo_pt[1], r=r, strength=(0.4 + 0.6 * k) * strength, t=fr.t, d=d)
    if dirx is None:
        dirx = 1 if gojo_pt[0] > lead_pt[0] else -1
    if t_since < RIPPLE:
        fx.impact(fr, lead_pt[0], lead_pt[1], t_since, kind="blocked", dirx=dirx, d=d)
    x0, x1 = sorted((gojo_pt[0], lead_pt[0]))
    fx.suspended_dust(fr, x0 + 0.004, min(gojo_pt[1], lead_pt[1]) - gap_cloud * 0.5,
                      max(x1, x0 + 0.02), max(gojo_pt[1], lead_pt[1]) + gap_cloud * 0.5,
                      n=n_dust, t=fr.t, salt=salt, d=d)


def thragg_brow(fr, J, k=1.0, d=None):
    """Hardened brow (hostility micro-acting) over the rig head."""
    hx, hy = J["head"]
    r = THRAGG.head_r * J["scale"]
    f = J["facing"]
    hd = J["head_dir"]
    fwd = (hd[1] * f, -hd[0] * f)

    def at(u, v):
        return (hx + (fwd[0] * u + hd[0] * v) * r, hy + (fwd[1] * u + hd[1] * v) * r)
    fr.line([at(0.45, 0.42), at(1.02, 0.2 - 0.06 * k)], (40, 30, 30), width_m=r * (0.12 + 0.08 * k), d=d)


def gojo_front_head(fr, J, mouth="smirk", d=None):
    """Workaround: rig._head collapses hair/blindfold to a line in view='front'
    (fwd=(0,0)), so the front-facing Gojo gets his head drawn here."""
    hx, hy = J["head"]
    r = GOJO.head_r * J["scale"]
    fr.ellipse(hx, hy, r * 0.95, r * 1.05, fill=GOJO.skin, d=d)
    sp = []
    for i in range(15):
        a = math.radians(-15 + 210 * i / 14)
        rr = 1.18 if i % 2 == 0 else 1.6
        sp.append((hx + math.cos(a) * rr * r, hy + math.sin(a) * rr * r + 0.2 * r))
    sp += [(hx - 0.95 * r, hy + 0.1 * r), (hx + 0.95 * r, hy + 0.1 * r)]
    fr.poly(sp, GOJO.hair, d=d)
    fr.poly([(hx - 1.0 * r, hy + 0.32 * r), (hx + 1.0 * r, hy + 0.32 * r), (hx + 0.98 * r, hy + 0.02 * r),
             (hx - 0.98 * r, hy + 0.02 * r)], GOJO.accent, d=d)
    if mouth == "smirk":
        fr.line([(hx - 0.25 * r, hy - 0.5 * r), (hx + 0.1 * r, hy - 0.52 * r), (hx + 0.28 * r, hy - 0.44 * r)],
                (120, 70, 70), width_m=r * 0.08, d=d)


def gojo_mouth(fr, J, open_k):
    """Mouth shape for dialogue on the rig head (open_k 0..1)."""
    if open_k <= 0.05:
        return
    hx, hy = J["head"]
    r = GOJO.head_r * J["scale"]
    f = J["facing"]
    hd = J["head_dir"]
    fwd = (hd[1] * f, -hd[0] * f)
    mx = hx + (fwd[0] * 0.78 + hd[0] * -0.5) * r
    my = hy + (fwd[1] * 0.78 + hd[1] * -0.5) * r
    fr.ellipse(mx, my, r * 0.14, r * 0.12 * open_k, fill=(70, 30, 34))


# ---- persistent seq-2 damage ------------------------------------------------
RING_X = -6.5                         # centre of S2-14's boom ring
POSTS = [(x, d) for d in (0.92, 2.05) for x in (-18.0, -10.0, 6.0, 14.0, 22.0)]
ARM_PTS = [(0.0, 0.0), (2.0, 0.0), (5.5, 0.0)]       # env.gantry's arm: x -7 .. -1.5 (kink at x=-5)
POLE = (58, 62, 70)


def windows_blown(fr, x0, x1, salt, origin, reveal=1.0, lit=1.0, max_floor=7):
    """Ring of blown-out windows on the street-facing block (skyline layer 3,
    d=2.8). Windows burst outward from `origin` (layer x) as reveal 0 -> 1."""
    depth = env._LAYERS[3][0]
    if reveal <= 0:
        return
    span = max(abs(x0 - origin), abs(x1 - origin)) + 12
    hole = shade((12, 12, 18), lit)
    edge = shade(PAL["glass"], lit * 0.42)
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
                dist = abs(wx + cw / 2 - origin) + k * 2.5
                if dist > reveal * span:
                    continue
                wy = k * 4.2
                fr.rect(wx + 0.35, wy + 0.65, wx + cw - 0.35, wy + 3.55, hole, d=depth)
                # a jagged tooth of glass left in the frame
                if rng.random() < 0.6:
                    gx = wx + 0.5 + (cw - 1.0) * rng.random()
                    top = rng.random() < 0.5
                    y0 = wy + (3.55 if top else 0.65)
                    fr.poly([(gx - 0.2, y0), (gx + 0.2, y0), (gx + rng.uniform(-0.1, 0.1),
                             y0 + (-1 if top else 1) * rng.uniform(0.3, 0.8))], edge, d=depth)


def lamp_post(fr, x, d, s, lit=1.0):
    """Street lamp at (x, curb depth d). s = seconds since S2-14's ring reached
    it (<0 standing). It kinks (2-frame anticipation), then folds flat OUTWARD."""
    sign = 1 if x > RING_X else -1
    if s is None or s < 0:
        a1, a2 = 0.0, 0.0
    else:
        bend = clamp(s / (2 / FPS))
        fall = EASE["in"](clamp((s - 2 / FPS) / 0.2))
        a1 = 86.0 * fall
        a2 = 16.0 * bend * (1 - 0.7 * fall)

    def R(px, py, ang):
        a = math.radians(ang)
        return (px * math.cos(a) + sign * py * math.sin(a), py * math.cos(a) - sign * px * math.sin(a))
    k = R(0, 1.3, a1)
    kx, ky = x + k[0], k[1]
    tp = R(0, 6.4, a1 + a2)
    tx, ty = kx + tp[0], ky + tp[1]
    am = R(-sign * 1.4, 0.3, a1 + a2)
    axx, ayy = tx + am[0], ty + am[1]
    col = shade((66, 68, 76), lit)
    fr.line([(x, 0.0), (kx, ky)], col, width_m=0.2, d=d)
    fr.line([(kx, ky), (tx, ty), (axx, ayy)], col, width_m=0.15, d=d)
    hd = R(-sign * 0.25, -0.18, a1 + a2)
    fr.poly([(axx, ayy), (axx + hd[0], ayy + hd[1]), (axx + hd[0] * 1.6, ayy + hd[1] * 0.4)],
            shade((150, 140, 110), lit), d=d)
    fr.rect(x - 0.22, 0.0, x + 0.22, 0.35, col, d=d)


def ground_cracks(fr, x, r, salt, d=1.0, n=10, lit=1.0, y=0.0):
    """Radial cracks ON THE GROUND (fx.cracks draws in the picture plane, so
    ground cracks are flattened here the same way env.crater does)."""
    rng = random.Random(salt)
    for k in range(n):
        a = rng.uniform(0, math.tau)
        L = r * rng.uniform(0.5, 1.0)
        pts = [(x, y)]
        for j in range(1, 4):
            a += rng.uniform(-0.3, 0.3)
            pts.append((x + math.cos(a) * L * j / 3, y - math.sin(a) * L * j / 3 * 0.12))
        fr.line(pts, shade((14, 12, 16), lit), width_m=0.05, d=d)


def draw_arm(fr, root, ang, kink, head_swing=0.0, lit=1.0, d=None):
    """The mast arm as a rigid (kinked) bar: root point, rotation (deg, + =
    counter-clockwise), V-kink depth (m) at 2 m from the root."""
    a = math.radians(ang)
    loc = [(0.0, 0.0), (2.0, -kink), (5.5, -0.15 * kink)]
    pts = [(root[0] + px * math.cos(a) - py * math.sin(a), root[1] + px * math.sin(a) + py * math.cos(a))
           for px, py in loc]
    col = shade(POLE, lit)
    fr.line(pts, col, width_m=0.14, d=d)
    # bolted root plate, torn
    fr.poly([(pts[0][0] - 0.1, pts[0][1] - 0.12), (pts[0][0] + 0.15, pts[0][1] - 0.15),
             (pts[0][0] + 0.12, pts[0][1] + 0.14), (pts[0][0] - 0.08, pts[0][1] + 0.1)],
            shade((120, 120, 124), lit), d=d)
    # traffic-light head hanging from the far end, swinging
    ex, ey = pts[-1]
    sw = math.radians(head_swing) + a
    dx, dy = math.sin(sw), -math.cos(sw)
    hx, hy = ex + dx * 0.6, ey + dy * 0.6
    nx, ny = -dy, dx
    fr.poly([(ex + nx * 0.25, ey + ny * 0.25), (ex - nx * 0.25, ey - ny * 0.25),
             (ex - nx * 0.25 + dx * 1.1, ey - ny * 0.25 + dy * 1.1), (ex + nx * 0.25 + dx * 1.1, ey + ny * 0.25 + dy * 1.1)],
            shade((30, 32, 36), lit), d=d)
    for kk, c in enumerate([(70, 20, 20), (70, 60, 20), (20, 70, 30)]):
        fr.circle(ex + dx * (0.25 + kk * 0.32), ey + dy * (0.25 + kk * 0.32), 0.11, fill=c, d=d)
    return pts


def fallen_arm(fr, dx=0.0, lit=1.0):
    """The sheared arm lying across the street (S2-06 f50 on)."""
    col = shade(POLE, lit)
    pts = [(-6.5 + dx, 0.12), (-4.6 + dx, 0.3), (-1.0 + dx, 0.1)]
    fr.line(pts, col, width_m=0.15)
    fr.poly([(-1.0 + dx, 0.0), (-0.2 + dx, 0.05), (-0.15 + dx, 0.5), (-0.95 + dx, 0.48)], shade((30, 32, 36), lit))
    fr.poly([(-6.7 + dx, 0.0), (-6.35 + dx, 0.02), (-6.4 + dx, 0.32), (-6.68 + dx, 0.3)], shade((120, 120, 124), lit))


SLAB_X = (7.0, 10.0)        # torn-up street slab (S2-11)


def street_hole(fr, lit=1.0):
    x0, x1 = SLAB_X
    fr.ellipse((x0 + x1) / 2, -0.02, (x1 - x0) / 2 + 0.25, 0.32, fill=shade(PAL["concrete_dark"], lit * 0.9))
    fr.ellipse((x0 + x1) / 2, -0.06, (x1 - x0) / 2, 0.22, fill=shade((14, 12, 16), lit))
    rng = random.Random("hole")
    for k in range(9):
        cx = rng.uniform(x0 - 0.3, x1 + 0.3)
        s = rng.uniform(0.12, 0.3)
        fr.poly([(cx - s, 0.02), (cx, s * 0.9), (cx + s, 0.04)], shade(PAL["street"], lit * rng.uniform(0.9, 1.4)))
    # torn cable ends
    fr.line([(x0 + 0.8, 0.0), (x0 + 1.0, 0.35), (x0 + 1.3, 0.3)], (40, 40, 44), width_m=0.04)


def slab_poly(cx, cy, ang, L=3.0, th=0.55):
    a = math.radians(ang)
    ux, uy = math.cos(a), math.sin(a)
    nx, ny = -uy, ux
    return [(cx - ux * L / 2 - nx * th / 2, cy - uy * L / 2 - ny * th / 2),
            (cx + ux * L / 2 - nx * th / 2, cy + uy * L / 2 - ny * th / 2),
            (cx + ux * L / 2 + nx * th / 2, cy + uy * L / 2 + ny * th / 2),
            (cx - ux * L / 2 + nx * th / 2, cy - uy * L / 2 + ny * th / 2)]


def draw_slab(fr, cx, cy, ang, lit=1.0, L=3.0, th=0.55, d=None, top_side=1):
    """A 3 m slab of asphalt over road base, seen in side view with a hint of
    its top face (pseudo-3D). ang 0 = lying flat, 90 = standing up."""
    a = math.radians(ang)
    ux, uy = math.cos(a), math.sin(a)
    nx, ny = -uy * top_side, ux * top_side
    # top face (asphalt surface with a lane marking), skewed into depth
    off = (0.22, 0.28)
    base = slab_poly(cx, cy, ang, L, th)
    top_a, top_b = (base[3], base[2]) if top_side > 0 else (base[0], base[1])
    face = [top_a, top_b, (top_b[0] + off[0], top_b[1] + off[1]), (top_a[0] + off[0], top_a[1] + off[1])]
    fr.poly(face, shade(PAL["street"], lit * 1.25), d=d)
    mx, my = (top_a[0] + top_b[0]) / 2 + off[0] * 0.5, (top_a[1] + top_b[1]) / 2 + off[1] * 0.5
    fr.line([(mx - ux * 0.5, my - uy * 0.5), (mx + ux * 0.5, my + uy * 0.5)], shade(PAL["street_line"], lit),
            width_m=0.07, d=d)
    # body: road base (concrete) with the asphalt skin on the top side
    fr.poly(base, shade(PAL["concrete"], lit * 1.08), d=d)
    fr.line([base[0], base[1], base[2], base[3], base[0]], shade(PAL["concrete"], lit * 1.45), width_m=0.04, d=d)
    skin = slab_poly(cx + nx * th * 0.36, cy + ny * th * 0.36, ang, L, th * 0.28)
    fr.poly(skin, shade(PAL["street"], lit * 0.9), d=d)
    rng = random.Random("slabtex")
    for k in range(7):
        u = rng.uniform(-0.45, 0.45)
        v = rng.uniform(-0.4, 0.1)
        px, py = cx + ux * L * u + nx * th * v, cy + uy * L * u + ny * th * v
        fr.circle(px, py, 0.04, fill=shade(PAL["concrete_dark"], lit), d=d)
    return base


def broken_slab(fr, lit=1.0):
    """The slab after S2-11 f82: broken in two on the street beneath Gojo."""
    draw_slab(fr, -6.25, 0.3, 6, lit, L=1.45, th=0.5)
    draw_slab(fr, -4.75, 0.28, -9, lit, L=1.5, th=0.5)


def aftermath(fr, lit=1.0, skip=()):
    """Every bit of seq-2 damage that has happened before this global frame."""
    # ring of blown windows: west side (S2-01 side lobes) then east (S2-14)
    if "win_west" not in skip:
        windows_blown(fr, -40.0, 2.0, "wwest", origin=-6.0, reveal=clamp(since(fr, "S2-01", 6) / (8 / FPS)), lit=lit)
    if "win_east" not in skip:
        windows_blown(fr, 5.0, 44.0, "weast", origin=-6.0, reveal=clamp(since(fr, "S2-14", 4) / (10 / FPS)), lit=lit)
    if since(fr, "S2-11", 22) >= 0:
        street_hole(fr, lit)
    if since(fr, "S2-06", 50) >= 0 and "arm" not in skip:
        fallen_arm(fr, dx=1.0 * EASE["out"](clamp(since(fr, "S2-14", 4) / 0.35)), lit=lit)
    if since(fr, "S2-11", 82) >= 0 and "slab" not in skip:
        broken_slab(fr, lit)
    if "posts" not in skip:
        for x, d in POSTS:
            dist = math.hypot(x - RING_X, (d - 1.0) * 10.0)
            f0 = 3 + 9 * clamp((dist - 3.0) / 26.0)
            lamp_post(fr, x, d, since(fr, "S2-14", f0), lit)


def _seq1():
    """Seq 1's module, for its north-side storefront row (continuity across
    the S1-10 / S2-01 cut). Guarded: if it is missing or broken, seq 2 simply
    renders without the row."""
    try:
        import scenes.seq1 as S1
        return S1 if hasattr(S1, "storefronts") else None
    except Exception:  # noqa: BLE001
        return None


def storefront_row(fr, lit=1.0):
    S1 = _seq1()
    if S1 is None:
        return
    try:
        S1.storefronts(fr, "burst", 0.0, lit)
        # S2-01's side lobes blow out the panes Seq 1 left intact around the west corner
        d = S1.STORE_D
        for i, (x0, x1) in enumerate(S1.STORES):
            cx = 0.5 * (x0 + x1)
            if S1.pane_burst_f(cx) is not None or not (-30.0 < cx < 4.0):
                continue
            if since(fr, "S2-01", 6 + 0.25 * abs(cx + 6.0)) < 0:
                continue
            fr.rect(x0, 0.4, x1, 3.4, shade((17, 17, 23), lit), d=d)
            fr.rect(x0 + 0.3, 0.4, x1 - 0.3, 1.0, shade((25, 25, 31), lit), d=d)
            rng = random.Random(f"s2pane{i}")
            g = shade((62, 72, 88), lit * 1.2)
            for k in range(rng.randint(2, 3)):
                xa = rng.uniform(x0, x1 - 0.4)
                w = rng.uniform(0.2, 0.6)
                fr.poly([(xa, 3.4), (xa + w, 3.4), (xa + w * rng.uniform(0.2, 0.8), 3.4 - rng.uniform(0.3, 1.1))], g, d=d)
            for k in range(6):
                gx = rng.uniform(x0, x1)
                fr.rect(gx, 0.26, gx + 0.14, 0.33, shade(PAL["glass"], rng.uniform(0.55, 0.95)), d=d)
    except Exception:  # noqa: BLE001
        return


def street(fr, extra=(), lit=1.0, gantry=True, skip=(), blur=0.0):
    """C.stage(fr, 2, 'street') - same layers, same order - with the north
    storefront row slotted between skyline and street, the persistent seq-2
    damage on top, and an optional depth-of-field blur for tight shots."""
    flags = set(extra)
    if since(fr, "S2-06", 29) >= 0:
        flags.add("mast_sheared")
    st = C.state(SEQ, *flags)
    tg = C.tg(fr)
    env.sky(fr, lit)
    env.clouds(fr, tg, lit=lit)
    env.river(fr, lit)
    env.skyline(fr, st, layers=(0, 1, 2, 3), lit=lit)
    env.smoke_columns(fr, tg, st, lit)
    env.light_shafts(fr, st)
    if "win_west" not in skip:
        windows_blown(fr, -40.0, 2.0, "wwest", origin=-6.0, reveal=clamp(since(fr, "S2-01", 6) / (8 / FPS)), lit=lit)
    if "win_east" not in skip:
        windows_blown(fr, 5.0, 44.0, "weast", origin=-6.0, reveal=clamp(since(fr, "S2-14", 4) / (10 / FPS)), lit=lit)
    storefront_row(fr, lit)
    env.street(fr, st, lit, show_gantry=gantry)
    aftermath(fr, lit, tuple(skip) + ("win_west", "win_east"))
    if blur > 0:
        fr.img = fr.img.filter(ImageFilter.GaussianBlur(blur * fr.ss))
        fr.draw = ImageDraw.Draw(fr.img)
    return st


def lookup_bg(fr, steep=0.6, lit=1.0, west_blown=True):
    """Worm's-eye backdrop for the cameras on the asphalt tilted up (S2-05,
    S2-09): storm sky with the deck overhead, and the corner facades rising
    from both frame edges and converging on a vanishing point above frame
    (the west corner's windows blown). The engine camera cannot tilt, so the
    facades are drawn in screen space; the mast is drawn in world space."""
    env.sky(fr, light=0.9 * lit)
    tg = C.tg(fr)
    img, dr = fr.layer()
    rng = random.Random("deck")
    for i in range(18):
        u = (rng.uniform(-0.2, 1.2) - tg * 0.004 * (1 + i % 3)) % 1.4 - 0.2
        v = rng.uniform(-0.12, 0.45) * (0.6 + 0.6 * steep)
        w, h = rng.uniform(0.22, 0.45), rng.uniform(0.06, 0.14)
        c = mix_color(PAL["cloud"], PAL["cloud_lit"], clamp(0.75 - u) * 0.8)
        dr.ellipse([(u - w) * fr.W, (v - h) * fr.H, (u + w) * fr.W, (v + h) * fr.H], fill=shade(c, lit) + (205,))
    fr.merge(img)
    vp = (0.5, -0.35 - 0.9 * (1 - steep))

    def f(h):                                  # equal floors shrink toward the vanishing point
        return 1 - 1 / (1 + h * 1.15)

    for side in (-1, 1):
        b_in = (0.5 + side * (0.31 - 0.07 * steep), 1.06)
        b_out = (0.5 + side * 1.4, 1.06)
        roof = 2.2 if side < 0 else 2.6

        def Pt(sx, h):
            bx, by = lerp(b_out[0], b_in[0], sx), lerp(b_out[1], b_in[1], sx)
            k = f(h)
            return (bx + (vp[0] - bx) * k, by + (vp[1] - by) * k)
        col = shade(mix_color(PAL["bldg_near"], (84, 76, 88) if side < 0 else (66, 66, 80), 0.42), lit)
        fr.s_poly([Pt(0, 0), Pt(1, 0), Pt(1, roof), Pt(0, roof)], col)
        fr.s_line([Pt(1, 0), Pt(1, roof)], shade(mix_color(col, PAL["rim_warm"], 0.45 if side < 0 else 0.2), lit),
                  width=3)
        fr.s_line([Pt(0, roof), Pt(1, roof)], shade(col, 1.3), width=2)
        rngw = random.Random(f"look{side}")
        dh, ncol = 0.16, 9
        for i in range(int(roof / dh)):
            h0, h1 = i * dh + 0.035, (i + 1) * dh - 0.02
            for j in range(ncol):
                s0, s1 = j / ncol + 0.018, (j + 1) / ncol - 0.018
                if s1 < 0.45:
                    continue                    # off-frame part of the facade
                q = [Pt(s0, h0), Pt(s1, h0), Pt(s1, h1), Pt(s0, h1)]
                r = rngw.random()
                if side < 0 and west_blown and i < 7 and r < 0.6:
                    fr.s_poly(q, (9, 9, 14))
                elif r < 0.12:
                    fr.s_poly(q, shade(mix_color(PAL["window_lit"], col, 0.45), lit))
                else:
                    fr.s_poly(q, shade(mix_color(col, (24, 30, 44), 0.55), lit))


# =============================================================================
# S2-01  WS: the straight right crosses the gap and slows without end
# =============================================================================

def s2_01(fr):
    t = fr.t
    t_arm = T(fr, 2)
    t_stall = cue(fr, "infinity_stop", 0, 4)
    t_glass = cue(fr, "glass_shatter", 0, 8)
    t_whip = T(fr, 4)
    # camera: wide on the launch, a 4-frame whip-tilt up-left, then locked on the pair
    u = EASE["inout"](clamp(t / t_whip))
    fr.cam = Cam(lerp(-3.0, -5.5, u), lerp(4.0, 7.0, u), 30.0 * (70.0 / 30.0) ** u)
    if 0 < t < t_whip:
        k = math.sin(math.pi * t / t_whip)
        fr.blur_dir = (-22 * k, 30 * k)
    street(fr)

    # the shock's side lobes flow AROUND him and blow out the windows behind, in a staggered ring
    t0 = t_glass - T(fr, 2)
    for k, (x0, x1, df) in enumerate([(-9.0, -3.5, 0), (-3.5, 0.5, 1), (-15.0, -9.0, 2), (0.5, 4.0, 3),
                                      (-21.0, -15.0, 4)]):
        fx.glass_shatter(fr, x0, 4.5, x1, 16.0, t - t0 - T(fr, df * 1.6), n=22, outward=-1 if x1 < -6 else 1,
                         salt=f"g201{k}", d=2.8)
        fx.glass_shatter(fr, x0, 0.6, x1, 3.3, t - t0 - T(fr, df * 1.6), n=12, outward=-1 if x1 < -6 else 1,
                         salt=f"g201s{k}", d=2.4)

    # Gojo: a held cel. Nothing moves, not even his hair.
    G = gojo(fr, G_POCKETS, halo=1.5)
    F = face_pt(G)

    # Thragg's knuckles: launch line from the crater to arm's length, then the stall
    A = (F[0] + 0.9, F[1] - 0.04)                    # arm's length at f2
    L0 = (-0.4, 1.6)                                  # leaving the crater (S1-10's cut)
    if t < t_arm:
        s = kf(t, [(0.0, 0.30), (T(fr, 1), 0.66), (t_arm, 1.0)], "linear")
        kn = (lerp(L0[0], A[0], s), lerp(L0[1], A[1], s))
        pose = rig.blend(T_FLY, T_STALL_R, EASE["in"](clamp(t / t_arm)))
        wind = (0.95, -0.35)
    else:
        g = stall_gap(t, t_arm, t_stall, 0.9)
        kn = (F[0] + g, F[1] - 0.04 * clamp(g / 0.9))
        comp = EASE["out"](clamp((t - t_stall) / 0.3))
        pose = rig.blend(T_STALL_R, T_STALL_R_C, comp)
        # the cape keeps travelling and wraps forward over his shoulders
        wind = kf(t, [(t_stall, (0.95, -0.35)), (t_stall + 0.35, (-0.5, 2.6))], "out")
    px, py = place(THRAGG, pose, -1, lambda J: knuckle(J, "f"), kn)

    # launch smear: trail from the crater + speed lines + vapour cone (f0-2 only)
    if t < T(fr, 3):
        fx.trail(fr, [(lerp(0.3, px, k / 7), lerp(0.6, py + 0.2, k / 7)) for k in range(8)], width_m=1.1, alpha=120)
        fx.speed_lines(fr, 0.9 * (1 - clamp((t - t_arm) / (1 / FPS))), direction=(-0.6, -0.8), salt="s201")
    if t > t_stall:
        # the air shoved ahead of the fist spills around him and on to the facades behind
        fx.dust_cloud(fr, F[0] - 1.8, F[1] - 0.9, t - t_stall, r=1.3, n=10, ground=False, rise=0.2, alpha=55,
                      salt="lobe")
    J = thragg(fr, pose, px, py, -1, cape_wind=wind)
    if t < T(fr, 3):
        cx, cy = J["chest"]
        fx.sonic_boom(fr, cx - 0.1, cy + 0.1, t, dirx=-0.6, diry=0.8, size=0.85)

    # asphalt shards that rode the shock ahead of him: they decelerate too and hang
    rng = fr.srng("ride")
    pts = []
    kn_arm = (A[0], A[1])
    for i in range(16):
        ahead = (-rng.uniform(0.12, 0.6), rng.uniform(-0.3, 0.3))
        hang = (F[0] + 0.004 + 0.32 * rng.random() ** 2, F[1] + rng.uniform(-0.2, 0.2))
        if t < t_arm:
            p = (kn[0] + ahead[0] * 0.6, kn[1] + ahead[1])
        else:
            p0 = (kn_arm[0] + ahead[0] * 0.6, kn_arm[1] + ahead[1])
            e = math.exp(-11.0 * (t - t_arm))
            p = (hang[0] + (p0[0] - hang[0]) * e, hang[1] + (p0[1] - hang[1]) * e)
        pts.append((max(F[0] + 0.004, p[0]), p[1]))
    shards(fr, pts, t, "s201sh", size=0.05)

    if t >= t_stall - 1 / FPS:
        inf_stop(fr, J, F, t - t_stall, side="f", r=0.75, gap=0.0)


# =============================================================================
# S2-02  ECU insert: the fist hangs 1 cm from the blindfold (KEY PLANT)
# =============================================================================

def s2_02(fr):
    t, dur = fr.t, fr.dur
    push = 1 + 0.02 * clamp(t / dur)
    fr.cam = Cam(-6.0, 7.95, 1400.0 * push)
    W, H = fr.W, fr.H
    # out-of-focus west-corner facades behind them (blown windows = dark bokeh)
    inserts._bg(fr, (32, 30, 44), (96, 66, 64))
    rngb = fr.srng("ecu_bg")
    for i in range(7):
        u, v = rngb.random(), rngb.uniform(0.05, 0.95)
        fr.s_circle(u, v, rngb.uniform(0.04, 0.08), fill=(22, 20, 30))

    s_g, s_f = 1.1 * push, 0.88 * push
    k_g, k_f = 0.5 * H * s_g, 0.5 * H * s_f
    gap1, gap0 = 0.016, 0.03                         # fraction of frame width (1 cm, read at insert scale)
    tc = min(t, T(fr, 20))                           # creeps f0-20, then everything hangs
    g = gap1 + fx.zeno(gap0 - gap1, tc, rate=5.0)
    ug = 0.475
    ug_s = 0.5 + (ug - 0.5) * push
    uf_s = 0.5 + (ug + g - 0.5) * push
    cu_g = (ug_s * W - 0.52 * k_g) / W
    cv_g = 0.5 + 0.1 * push
    gi = gopts(fr)["injuries"]
    inserts.gojo_face(fr, cu_g, cv_g, s_g, expr="smirk", eyes="blindfold", injuries=gi, flip=1)
    blind_v = (cv_g * H - 0.17 * k_g) / H
    # the fist: trembling with full Viltrumite drive, gaining almost nothing
    trem = (0.0012 + 0.001 * (T(fr, 6) <= t < T(fr, 12))) * (1.0 if t < T(fr, 20) else 0.4)
    jx = math.sin(t * 61) * trem
    jy = math.cos(t * 47) * trem * 1.6
    cu_f = (uf_s * W + 0.46 * k_f) / W + jx
    cv_f = blind_v + 0.01 + jy
    inserts.thragg_fist(fr, cu_f, cv_f, s_f, rot=-4, flip=-1, injuries=topts(fr)["injuries"])
    if T(fr, 5) <= t < T(fr, 14):     # knuckle ridges tense (glove creak)
        L = inserts.Local(fr, cu_f, cv_f, s_f, -4, -1)
        for kk in range(4):
            y = -0.36 + kk * 0.2
            L.line([(0.2, y + 0.04), (0.4, y + 0.02)], shade(THRAGG.accent, 1.5), 0.01)

    # shards in the gap and loosely around the knuckles: they jitter and never get closer
    face_x, _ = s2w(fr, ug_s, blind_v)
    fist_x, cy = s2w(fr, uf_s, blind_v)
    rng = fr.srng("gapsh")
    pts = []
    for i in range(18):
        if i < 6:
            x = face_x + (fist_x - face_x) * rng.uniform(0.2, 0.8)
            y = cy + rng.uniform(-0.03, 0.03)
        else:
            x = fist_x + rng.uniform(-0.004, 0.09)
            y = cy + rng.choice((-1, 1)) * rng.uniform(0.085, 0.16)
        pts.append((x, y))
    shards(fr, pts, t, "s202", size=0.0042)
    fx.suspended_dust(fr, face_x + 0.0015, cy - 0.04, fist_x - 0.0015, cy + 0.04, n=10, t=t, salt="gapd",
                      size=0.0016)
    # refraction only inside the gap, strongest at the fist
    fx.infinity(fr, face_x + (fist_x - face_x) * 0.7, cy, r=0.03, strength=0.9, t=t)


# =============================================================================
# S2-03  OTS over Thragg's left shoulder: "That's close. For you."
# =============================================================================

def _depth_arm(fr, sh_px, fist_xy, w_sh, flex=0.0, sleeve=None):
    """Thragg's arm reaching from a FOREGROUND shoulder (supersampled px) to
    a fist on the fighters' plane: a tapered sleeve plus the crimson glove."""
    fpx, fpy = fr.P(*fist_xy)
    r = fr.S(THRAGG.fist)
    sx, sy = sh_px
    vx, vy = fpx - sx, fpy - sy
    Ln = math.hypot(vx, vy) or 1
    nx, ny = -vy / Ln, vx / Ln
    ex, ey = sx + vx * 0.5 + nx * 0.06 * Ln, sy + vy * 0.5 + ny * 0.06 * Ln      # elbow, slightly bent
    w_el = (w_sh + r * 1.5) * 0.5
    col = sleeve or shade(THRAGG.suit, 0.82)
    d = fr.draw
    for (ax, ay, aw), (bx, by, bw) in (((sx, sy, w_sh), (ex, ey, w_el)), ((ex, ey, w_el), (fpx, fpy, r * 1.5))):
        ux, uy = bx - ax, by - ay
        L2 = math.hypot(ux, uy) or 1
        mx, my = -uy / L2, ux / L2
        d.polygon([(ax + mx * aw / 2, ay + my * aw / 2), (bx + mx * bw / 2, by + my * bw / 2),
                   (bx - mx * bw / 2, by - my * bw / 2), (ax - mx * aw / 2, ay - my * aw / 2)], fill=col)
        d.ellipse([bx - bw / 2, by - bw / 2, bx + bw / 2, by + bw / 2], fill=col)
    # glove cuff + fist
    fr.draw.ellipse([fpx - r * 1.05, fpy - r * 1.05, fpx + r * 1.05, fpy + r * 1.05], fill=THRAGG.accent)
    k = 1.0 + 0.08 * flex
    for j in range(4):
        yy = fpy - r * 0.75 + j * r * 0.5
        fr.draw.ellipse([fpx - r * 1.0, yy - r * 0.22 * k, fpx - r * 0.55, yy + r * 0.22 * k],
                        fill=shade(THRAGG.accent, 1.15 + 0.25 * flex))
    return fpx, fpy


def s2_03(fr):
    t, dur = fr.t, fr.dur
    zoom = kf(t, [(0, 260.0), (dur, 290.0)], "linear")       # very slow push-in
    fr.cam = Cam(-5.05, 7.72, zoom)
    street(fr, blur=2.2)

    # ---- Gojo acting, on 2s: incline at the knuckles, chin up to Thragg's eyes, the pinch, the line
    t2 = on2(fr)
    neck = kf(t2, [(0, -4), (T(fr, 16), 7, "inout"), (T(fr, 18), 7), (T(fr, 32), -13, "inout")])
    hand = kf(t2, [(T(fr, 28), 0.0), (T(fr, 36), 1.0, "inout"), (T(fr, 72), 1.0), (T(fr, 84), 0.0, "inout")])
    rest = G_LOOSE if t2 > T(fr, 72) else G_POCKETS
    pose = rig.blend(P(rest, neck=neck), P(G_PINCH, neck=neck), hand)
    G = gojo(fr, pose)
    F = face_pt(G)
    # dialogue: "That's close. ... For you." (mouth on 2s, half-beat pause after 'close')
    dl = (fr.shot.get("dialogue") or [{}])[0]
    a0 = dl.get("at_frame", 36)
    fl = fr.f - fr.f % 2
    mouth = 0.0
    for w0, w1 in ((0, 7), (8, 15), (22, 30), (31, 38)):          # frames after at_frame
        if w0 <= fl - a0 < w1:
            mouth = 0.6 + 0.4 * ((fl // 2) % 2)
    gojo_mouth(fr, G, mouth)
    if hand > 0.35:
        # the pinch: thumb and forefinger almost shut - a 1 cm gap - held up beside the fist
        wx, wy = rig.hand_pos(G, "n", 0.07)
        gap = 0.012 + 0.03 * (1 - clamp((hand - 0.35) / 0.65))
        fr.line([(wx, wy), (wx + 0.035, wy + 0.075)], GOJO.skin, width_m=0.018)
        fr.line([(wx + 0.01, wy - 0.01), (wx + 0.05, wy + 0.075 - gap - 0.012)], shade(GOJO.skin, 0.9),
                width_m=0.018)

    # ---- the stalled right fist, locked exactly where S2-02 left it, shards still hanging
    fist = (F[0] + 0.01 + THRAGG.fist, F[1] - 0.005)
    flex = pulse(t, T(fr, 60), T(fr, 3), T(fr, 6))
    rng = fr.srng("s203sh")
    pts = [(F[0] + 0.003 + 0.004 * rng.random(), F[1] + rng.uniform(-0.05, 0.05)) for _ in range(4)]
    pts += [(fist[0] + rng.uniform(-0.04, 0.16), fist[1] + rng.choice((-1, 1)) * rng.uniform(0.09, 0.2))
            for _ in range(9)]
    fx.infinity(fr, F[0] + 0.006, F[1], r=0.06, strength=0.45, t=t)        # faint, in the gap only

    # ---- Thragg in the soft screen-right foreground (we are behind his LEFT shoulder)
    dF = 0.24
    c0 = Cam(-5.05, 7.72, 260.0)
    hx = c0.x + (0.835 * OUT_W - OUT_W / 2) * dF / c0.zoom
    hy = c0.y - (0.36 * OUT_H - OUT_H / 2) * dF / c0.zoom
    # only his eyes and fingers move: eyes drop to the knuckles (f44-62), the jaw sets (f68-88)
    tneck = kf(t, [(T(fr, 44), 2), (T(fr, 52), 15, "out"), (T(fr, 62), 15), (T(fr, 72), 4, "inout")])
    tpose = P("t_stand", lean=4, neck=tneck, ua_n=6, fa_n=10, ua_f=6, fa_f=8)
    J0 = solve(THRAGG, tpose, 0, 0, -1)
    px, py = hx - J0["head"][0], hy - J0["head"][1]
    # his right arm: from the far shoulder (hidden behind his head) across frame to the fist
    sh_far = fr.P(px + J0["sh_f"][0] - 0.03, py + J0["sh_f"][1] + 0.03, dF)
    _depth_arm(fr, sh_far, fist, fr.S(THRAGG.w_ua, dF) * 0.85, flex=flex)
    shards(fr, pts, t, "s203", size=0.014)

    def fg():
        J = draw_fighter(fr, THRAGG, tpose, px, py, -1, opts=topts(fr, cape_wind=(0.9, 0.2)), depth=dF)
        thragg_brow(fr, J, k=clamp((t - T(fr, 68)) / T(fr, 12)), d=dF)
        return J
    soft_draw(fr, fg, radius=4.0)


# =============================================================================
# S2-04  MS: left hook to the temple
# =============================================================================

def s2_04(fr):
    t = fr.t
    t_stall = cue(fr, "infinity_stop", 0, 11)
    t_launch = t_stall - 2 / FPS
    cx = kf(t, [(T(fr, 4), -4.8), (T(fr, 15), -5.7)], "inout")       # 2 m lateral track left with the arc
    fr.cam = Cam(cx, 7.4, 150.0)
    street(fr, blur=1.3)

    # Gojo: right hand loose; tilts his head TOWARD the stalled fist (f14-26, on 2s)
    t2 = on2(fr)
    neck = kf(t2, [(T(fr, 14), -4), (T(fr, 26), 3, "inout")])
    G = gojo(fr, P(G_LOOSE, neck=neck))
    hx, hy = G["head"]
    ang = math.radians(30)
    dirv = (math.cos(ang), math.sin(ang))
    rr = GOJO.head_r * 1.66 + 0.01 + THRAGG.fist
    target = (hx + dirv[0] * rr, hy + dirv[1] * rr)          # 1 cm off the right temple
    g_st = 0.07

    # body placement from the stall pose; before the stall the arm swings in by FK
    B = place(THRAGG, T_HOOK, -1, lambda J: fist_c(J, "n"), (target[0] + dirv[0] * g_st, target[1] + dirv[1] * g_st))
    Bprev = place(THRAGG, T_STALL_R_C, -1, lambda J: knuckle(J, "f"), (face_pt(G)[0] + 0.01, face_pt(G)[1] - 0.005))
    if t < t_stall:
        pose = rig.pose_at(t, [(0, T_STALL_R_C), (T(fr, 4), T_GUARD, "snap"), (T(fr, 9), T_HOOK_WIND, "inout"),
                                          (t_launch, T_HOOK_WIND), (t_stall, T_HOOK, "snap")])
        u = EASE["inout"](clamp(t / T(fr, 9)))
        px, py = lerp(Bprev[0], B[0], u), lerp(Bprev[1], B[1], u)
    else:
        g = post_gap(t, t_stall, g_st)
        pose = rig.blend(T_HOOK, T_HOOK_C, EASE["out"](clamp((t - t_stall) / 0.3)))
        px, py = place(THRAGG, pose, -1, lambda J: fist_c(J, "n"),
                       (target[0] + dirv[0] * (g - 0.01), target[1] + dirv[1] * (g - 0.01)))
    # grit swept up by the arc: hangs along the last of the swing path
    if t >= t_launch:
        arc = []
        for k in range(9):
            tt = t_launch + (t_stall - t_launch) * (0.15 + 0.85 * k / 8)
            pk = rig.pose_at(tt, [(t_launch, T_HOOK_WIND), (t_stall, T_HOOK, "snap")])
            Jk = solve(THRAGG, pk, B[0], B[1], -1)
            arc.append(fist_c(Jk, "n"))
        rng = fr.srng("arcgrit")
        pts = [(x + rng.uniform(-0.05, 0.05), y + 0.1 + rng.uniform(-0.04, 0.04)) for (x, y) in arc
               for _ in range(2)]
        hang = clamp((t - t_launch) / (3 / FPS))
        pts = [(p[0], p[1] - 0.25 * (1 - hang)) for p in pts]
        shards(fr, pts, t, "s204", size=0.03)
    J = thragg(fr, pose, px, py, -1, cape_wind=(0.8, -0.1) if t < t_stall else (0.4, 0.3))
    if t >= t_stall - 1 / FPS:
        inf_stop(fr, J, (hx + dirv[0] * GOJO.head_r * 1.2, hy + dirv[1] * GOJO.head_r * 1.2), t - t_stall,
                 side="n", r=0.6, gap=0.0)


# =============================================================================
# S2-05  MWS worm's-eye: the knee to the ribs
# =============================================================================

def s2_05(fr):
    t = fr.t
    t_stall = cue(fr, "infinity_stop", 0, 7)
    t_launch = t_stall - 1 / FPS - T(fr, 1)
    drift = 0.18 * EASE["inout"](clamp((t - T(fr, 6)) / (3 / FPS)))
    fr.cam = Cam(-5.5 + drift, 6.8, 90.0)
    lookup_bg(fr, steep=0.6)
    env.gantry(fr, env.GANTRY_X, sheared=False)

    # Gojo: shifts his weight left foot -> right foot (f10-26 on 2s); nothing else
    t2 = on2(fr)
    w = EASE["inout"](clamp((t2 - T(fr, 10)) / T(fr, 16)))
    G = gojo(fr, rig.blend(G_LOOSE, G_WEIGHT, w))
    ry = 7.2
    rib = (chest_front(G, ry) + 0.0, ry)
    g_st = 0.08
    target = (rib[0] + 0.01 + g_st, rib[1])
    B = place(THRAGG, T_KNEE, -1, lambda J: kneecap(J, "f"), target)
    if t < t_stall:
        pose = rig.pose_at(t, [(0, T_HOOK_C), (T(fr, 5), T_KNEE_WIND, "out"), (t_launch, T_KNEE_WIND),
                               (t_stall, T_KNEE, "snap")])
        Bw = (B[0] + 0.15, B[1] - 0.25)
        px, py = lerp(Bw[0], B[0], EASE["snap"](clamp((t - t_launch) / (t_stall - t_launch)))), \
            lerp(Bw[1], B[1], EASE["snap"](clamp((t - t_launch) / (t_stall - t_launch))))
        if t < T(fr, 5):
            px, py = lerp(B[0] + 0.05, Bw[0], EASE["out"](t / T(fr, 5))), lerp(B[1] + 0.5, Bw[1], EASE["out"](t / T(fr, 5)))
    else:
        g = post_gap(t, t_stall, g_st)
        pose = rig.blend(T_KNEE, T_KNEE_C, EASE["out"](clamp((t - t_stall) / 0.4)))
        px, py = place(THRAGG, pose, -1, lambda J: kneecap(J, "f"), (rib[0] + g, rib[1]))
    J = thragg(fr, pose, px, py, -1, cape_wind=(0.9, 0.5) if t >= t_stall else (0.6, -0.2))
    if t >= t_stall - 1 / FPS:
        kc = kneecap(J, "f")
        stall_cues(fr, rib, kc, t - t_stall, "s205", r=0.55, gap_cloud=0.12, n_dust=12)
        # paint flakes and grit hanging in a loose cluster under the knee
        rng = fr.srng("flakes")
        pts = [(rib[0] + 0.01 + rng.uniform(0, 0.3), kc[1] - rng.uniform(0.06, 0.35)) for _ in range(12)]
        shards(fr, pts, t, "s205f", size=0.028, col=(110, 112, 120))


# =============================================================================
# S2-06  WS: low kick stalls; the spinning sweep shears the mast arm
# =============================================================================

T_SINK = P("t_hover_ready", lean=12, neck=6, ua_n=40, fa_n=112, ua_f=26, fa_f=100,
           th_n=60, sh_n=-30, th_f=36, sh_f=-60)
T_LOWKICK = swap_legs(P("t_kick", lean=-22, neck=6, ua_n=44, fa_n=100, ua_f=10, fa_f=90,
                        th_n=82, sh_n=86, th_f=20, sh_f=-50))
T_LOWKICK_C = P(T_LOWKICK, lean=-16)
T_PLANT = P("t_hover_ready", lean=34, neck=-4, ua_n=60, fa_n=90, ua_f=-40, fa_f=-10,
            th_n=70, sh_n=-20, th_f=-30, sh_f=-80)
T_SPIN = P("t_hover_ready", lean=44, neck=-10, ua_n=80, fa_n=100, ua_f=-60, fa_f=-40,
           th_n=40, sh_n=-60, th_f=-60, sh_f=-110)
T_SWEEP0 = P("t_kick", lean=24, neck=-6, ua_n=70, fa_n=60, ua_f=-50, fa_f=-30,
             th_n=-60, sh_n=-80, th_f=60, sh_f=-40)
T_SWEEP1 = P("t_kick", lean=-38, neck=10, ua_n=60, fa_n=40, ua_f=-70, fa_f=-40,
             th_n=74, sh_n=82, th_f=10, sh_f=-70)


def s2_06(fr):
    t, dur = fr.t, fr.dur
    t_kick = cue(fr, "infinity_stop", 0, 8)
    t_hit = cue(fr, "metal_snap", 0, 26)
    t_ank = cue(fr, "infinity_stop", 1, 28)
    t_tear = cue(fr, "metal_groan", 0, 30)
    t_land = cue(fr, "concrete_break", 0, 50)
    t_fall = t_tear + T(fr, 1)
    # camera: profile two-shot incl. the whole arm; tilt down with the fall; settle on Gojo
    cx = kf(t, [(t_fall, -3.4), (t_land, -3.4), (dur, -4.6, "inout")])
    cy = kf(t, [(t_fall, 4.6), (t_land, 3.2, "inout"), (dur, 5.2, "inout")])
    sh = C.shake(t, t_hit, amp=10.0, dur=4 / FPS)
    fr.cam = Cam(cx, cy, 66.0, shake=sh)
    street(fr, gantry=t < t_hit, skip=("arm",) if t < t_land else ())
    if t >= t_hit:
        env.gantry(fr, env.GANTRY_X, sheared=True)

    # ---- the mast arm: kinks at f26, tears off its root plate f28-32, falls, lands f50
    if t < t_land and t >= t_hit:
        kink = 0.55 * EASE["out"](clamp((t - t_hit) / (2 / FPS)))
        if t < t_fall:
            root, ang, swing = (-7.0, 6.2), -4.0 * clamp((t - t_hit) / (3 / FPS)), 18 * math.sin((t - t_hit) * 20)
        else:
            u = clamp((t - t_fall) / (t_land - t_fall))
            root = (lerp(-7.0, -6.5, u), lerp(6.2, 0.15, u * u))
            ang = -4.0 + 26.0 * math.sin(math.pi * u) - 4.0 * u
            swing = 40 * math.sin((t - t_fall) * 9) * (1 - u)
            kink = lerp(kink, 0.22, u)
        draw_arm(fr, root, ang, kink, swing)
    if t >= t_land:
        ground_cracks(fr, -4.0, 2.8, "armcr", n=12)
        fx.debris(fr, -3.8, 0.3, t - t_land, n=22, speed=5.0, spread=2.2, size=(0.06, 0.25), salt="armdeb",
                  ground=0.0)
        fx.dust_cloud(fr, -3.8, 0.1, t - t_land, r=3.2, n=18, salt="armdust")

    # ---- Gojo: weight on one leg; absolutely still from f26 except the head tilt (f34-46, 2s)
    t2 = on2(fr)
    neck = kf(t2, [(T(fr, 34), -4), (T(fr, 46), 12, "inout")])
    G = gojo(fr, P(G_WEIGHT, neck=neck), halo=1.5)
    kn = G["kn_f"]                                     # his LEFT knee (far side)
    knee_t = (kn[0] + GOJO.w_sh * 0.5 + 0.01 + THRAGG.w_sh * 0.4, kn[1])
    toe = max(G["toe_n"][0], G["toe_f"][0])
    ankle_t = (toe + 0.01 + 0.06, GSOLE + 0.09)
    hit_pt = (-5.0, 6.27)

    # ---- Thragg
    def heel(J):
        return J["an_n"]
    t_l0 = t_kick - 2 / FPS
    g_st = 0.07
    Bk = place(THRAGG, T_LOWKICK, -1, lambda J: J["an_f"], (knee_t[0] + g_st, knee_t[1]))
    Bs = place(THRAGG, T_SWEEP1, -1, heel, hit_pt)
    facing = -1
    if t < t_kick:
        pose = rig.pose_at(t, [(0, P(T_KNEE_C)), (T(fr, 6), T_SINK, "inout"), (t_l0, T_SINK), (t_kick, T_LOWKICK, "snap")])
        u = EASE["inout"](clamp(t / T(fr, 6)))
        px, py = lerp(Bk[0] + 0.1, Bk[0], u), lerp(Bk[1] + 0.9, Bk[1], u)
    elif t < T(fr, 9):
        g = post_gap(t, t_kick, g_st)
        pose = rig.blend(T_LOWKICK, T_LOWKICK_C, EASE["out"](clamp((t - t_kick) / 0.3)))
        px, py = place(THRAGG, pose, -1, lambda J: J["an_f"], (knee_t[0] + g, knee_t[1]))
    elif t < T(fr, 20):
        # plant on the air and spin: the body turns first, the leg path follows
        u = (t - T(fr, 9)) / (T(fr, 20) - T(fr, 9))
        pose = rig.pose_at(t, [(T(fr, 9), T_LOWKICK_C), (T(fr, 12), T_PLANT, "out"), (T(fr, 15), T_SPIN, "inout"),
                               (T(fr, 20), T_SWEEP0, "inout")])
        facing = 1 if T(fr, 13) <= t < T(fr, 17) else -1
        B9 = place(THRAGG, T_LOWKICK_C, -1, lambda J: J["an_f"], (knee_t[0] + 0.012, knee_t[1]))
        px, py = lerp(B9[0], Bs[0] + 0.3, EASE["inout"](u)), lerp(B9[1], Bs[1] + 0.1, EASE["inout"](u))
    elif t < t_hit:
        pose = rig.pose_at(t, [(T(fr, 20), T_SWEEP0), (t_hit, T_SWEEP1, "snap")])
        u = EASE["snap"](clamp((t - T(fr, 20)) / (t_hit - T(fr, 20))))
        px, py = lerp(Bs[0] + 0.3, Bs[0], u), lerp(Bs[1] + 0.1, Bs[1], u)
    else:
        # through the steel: the heel's arc carries on to the ankles and stalls
        g0 = hit_pt[0] - ankle_t[0]
        g = stall_gap(t, t_hit, t_ank, g0)
        pose = T_SWEEP1
        hy = lerp(ankle_t[1], hit_pt[1], clamp(g / g0))
        px, py = place(THRAGG, pose, -1, heel, (ankle_t[0] + g - 0.01, hy))
    if T(fr, 11) <= t < T(fr, 20):
        fx.trail(fr, [(px + 0.8 * math.cos(a), py + 0.2 + 0.35 * math.sin(a)) for a in
                      [(t * 30 - k * 0.5) for k in range(7)][::-1]], width_m=0.5, alpha=80)
    J = thragg(fr, pose, px, py, facing, cape_wind=(0.8, 0.6) if T(fr, 9) <= t < t_hit else (0.6, -0.1))

    if t_kick - 1 / FPS <= t < T(fr, 18):
        stall_cues(fr, (knee_t[0] - THRAGG.w_sh * 0.4 - 0.01, knee_t[1]), J["an_f"], t - t_kick, "s206k",
                   r=0.5, gap_cloud=0.15, n_dust=10)
    if t_hit <= t < t_hit + 0.3:
        # heavy tier on the STEEL (star, rings, spray) - drawn a step back in depth so the
        # star stays on the arm and never reads as a hit on Gojo
        dI = 3.0
        c = fr.cam
        fx.impact(fr, c.x + (hit_pt[0] - c.x) * dI, c.y + (hit_pt[1] - c.y) * dI, t - t_hit, kind="heavy",
                  dirx=-1, salt="armhit", d=dI)
        # sparks off the steel (real contact)
        rng = fr.srng("sparks")
        for i in range(18):
            a = rng.uniform(-0.3, math.pi + 0.3)
            sp = rng.uniform(4, 11)
            tt = t - t_hit
            if tt > 0.5:
                break
            p0 = fx.ballistic(hit_pt, (math.cos(a) * sp, math.sin(a) * sp), tt, g=9.8)
            p1 = fx.ballistic(hit_pt, (math.cos(a) * sp, math.sin(a) * sp), max(0, tt - 0.03), g=9.8)
            fr.glow_line([p1, p0], shade((255, 190, 90), 1 - tt * 2), width_px=3)
    if t_tear <= t < t_tear + 0.35:
        # the bolted root plate tears: a shriek of sparks at the pole
        rng = fr.srng("rootsp")
        tt = t - t_tear
        for i in range(10):
            a = rng.uniform(-0.6, math.pi * 0.6)
            sp = rng.uniform(2, 6)
            p0 = fx.ballistic((-6.95, 6.2), (math.cos(a) * sp, math.sin(a) * sp), tt, g=9.8)
            p1 = fx.ballistic((-6.95, 6.2), (math.cos(a) * sp, math.sin(a) * sp), max(0, tt - 0.03), g=9.8)
            fr.glow_line([p1, p0], shade((255, 180, 90), 1 - tt * 2.6), width_px=2)
    if t >= t_ank - 1 / FPS:
        stall_cues(fr, (toe + 0.005, ankle_t[1]), J["an_n"], t - t_ank, "s206a", r=0.45, gap_cloud=0.1, n_dust=10)


# =============================================================================
# S2-07  CU tilt: shoes on empty air -> his face
# =============================================================================

def s2_07(fr):
    t = fr.t
    t0, t1 = T(fr, 6), T(fr, 18)
    u = EASE["inout"](clamp((t - t0) / (t1 - t0)))
    zoom = 300.0 * (980.0 / 300.0) ** EASE["in"](u)
    fr.cam = Cam(-6.0 + 0.06 * u, lerp(6.35, 7.9, u), zoom)
    if 0 < u < 1:
        fr.blur_dir = (0, 10 * math.sin(math.pi * u))
    street(fr)
    # dust boiling up off the fallen arm, far below (seen through the gap at the start)
    if u < 0.7:
        img, dr = fr.layer()
        rng = random.Random("s207dust")
        for i in range(22):
            ph = (rng.random() + C.tg(fr) * 0.35 * rng.uniform(0.6, 1.2)) % 1.0
            x = rng.uniform(-9.5, -2.5)
            y = 3.6 + ph * 2.4
            r = 0.3 + ph * 0.6
            X, Y = fr.P(x, y, 1.6)
            R = fr.S(r, 1.6)
            dr.ellipse([X - R, Y - R * 0.7, X + R, Y + R * 0.7], fill=PAL["dust"] + (int(90 * (1 - ph) * (1 - u)),))
        fr.merge(img)
    # the weight shift: hip drops 2 cm, one knee softens (f18-30, 2s)
    t2 = on2(fr)
    w = EASE["inout"](clamp((t2 - T(fr, 18)) / T(fr, 12)))
    G = gojo(fr, rig.blend(P(G_WEIGHT, th_f=-4, sh_f=-6), P(G_WEIGHT, th_f=4, sh_f=-24, th_n=4, sh_n=4), w))
    # CU on the face: the portrait takes over the rig head as the tilt arrives
    if u > 0.55:
        hx, hy = G["head"]
        px, py = fr.P(hx, hy)
        r_px = fr.S(GOJO.head_r)
        s = r_px / (0.25 * fr.H) * 1.02
        a = clamp((u - 0.55) / 0.3)
        soft_draw(fr, lambda: inserts.gojo_face(fr, px / fr.W, (py + r_px * 0.08) / fr.H, s, expr="smirk",
                                                eyes="blindfold", injuries=gopts(fr)["injuries"], flip=1),
                  radius=0.0, alpha=a)


# =============================================================================
# S2-08  MS: the feint gets nothing; the real hook comes from the blind flank
# =============================================================================

T_HOVER_GUARD = P("t_guard", **LEGS_AIR)
T_JAB_HALF = swap_arms(P("t_punch", lean=18, neck=0, ua_n=-30, fa_n=70, ua_f=-20, fa_f=60, **LEGS_AIR))
T_JAB_HALF = P(T_JAB_HALF, ua_f=80, fa_f=74)
T_SLIDE = P("t_hover_ready", lean=20, neck=4, ua_n=-34, fa_n=-20, ua_f=-14, fa_f=-6,
            th_n=34, sh_n=-40, th_f=-14, sh_f=-76)


def thragg_back(fr, J, d, t, k=1.0):
    """Thragg from BEHIND (the rig only draws profiles): his cape covers the
    back from the shoulders to the knees, and we see the back of his head."""
    sx, sy = J["sh_n"]
    hx, hy = J["head"]
    pl = J["pelvis"]
    r = THRAGG.head_r
    sway = 0.06 * math.sin(t * 7.0)
    cape = [(sx + 0.3, sy + 0.08), (sx - 0.3, sy + 0.06), (pl[0] - 0.42, pl[1] - 0.62 + sway),
            (pl[0] + 0.1, pl[1] - 0.72), (pl[0] + 0.55, pl[1] - 0.6 - sway)]
    fr.poly(cape, shade(THRAGG.accent, 0.5 + 0.08 * k), d=d)
    fr.line([(sx - 0.05, sy + 0.02), (pl[0] - 0.12, pl[1] - 0.55)], shade(THRAGG.accent, 0.38), width_m=0.03, d=d)
    fr.poly([(sx + 0.3, sy + 0.08), (sx - 0.3, sy + 0.06), (sx - 0.24, sy - 0.1), (sx + 0.24, sy - 0.08)],
            THRAGG.accent, d=d)
    fr.line([(J["neck"][0], J["neck"][1]), (hx, hy)], THRAGG.skin, width_m=r * 1.2, d=d)
    fr.ellipse(hx, hy, r * 0.98, r * 1.05, fill=THRAGG.skin, d=d)
    fr.ellipse(hx, hy + 0.02, r * 0.95, r * 0.95, fill=THRAGG.hair, d=d)
    fr.ellipse(hx - r * 0.92, hy - 0.01, r * 0.16, r * 0.24, fill=shade(THRAGG.skin, 0.85), d=d)   # ear


def s2_08(fr):
    t = fr.t
    t_stall = cue(fr, "infinity_stop", 0, 20)
    t_feint = T(fr, 5)
    fr.cam = Cam(-5.25, 7.15, 170.0)
    street(fr, blur=1.3)
    G = gojo(fr, G_WEIGHT)                     # a held cel: he does nothing at all, keeps 'looking' east
    sp_y = 7.42
    sp = (chest_front(G, sp_y), sp_y)          # zip line at the solar plexus

    # ---- f0-5 the feint: a committed jab that dies at half extension on f5, snapped back
    B0 = place(THRAGG, T_HOVER_GUARD, -1, lambda J: J["head"], (-4.8, 8.3))
    if t < T(fr, 6):
        pose = rig.pose_at(t, [(0, T_HOVER_GUARD), (T(fr, 3), T_JAB_HALF, "snap"), (t_feint, T_JAB_HALF),
                               (T(fr, 6), T_HOVER_GUARD, "snap")])
        thragg(fr, pose, B0[0], B0[1], -1, cape_wind=(0.6, -0.1))
        return
    # ---- f6-14 drops a level and slides round his right flank TOWARD the camera
    dF = 0.78                                  # 0.9 m nearer the lens (camera 4 m south)
    u = EASE["inout"](clamp((t - T(fr, 6)) / T(fr, 8)))
    d = lerp(1.0, dF, u)
    B1 = (-4.62, 6.62)                         # cheated 0.5 m east of the staging so the stall stays readable
    px, py = lerp(B0[0], B1[0], u), lerp(B0[1], B1[1], u) - 0.12 * math.sin(math.pi * u)
    pose = rig.blend(T_HOVER_GUARD, T_SLIDE, u)
    wind = (0.9, 0.3)
    # grit flicked up by the slide (it ends up hanging beside the fist)
    if u < 1:
        fx.speed_lines(fr, 0.35 * math.sin(math.pi * u), direction=(-1.0, 0.1), salt="slide")
    J = thragg(fr, pose, px, py, -1, depth=d, cape_wind=wind)
    k = clamp((u - 0.45) / 0.4)
    if k > 0:
        thragg_back(fr, J, d, t, k)            # his broad back and cape fill the right foreground
    # ---- f15-19 the real strike: left shovel hook up into the solar plexus; f20 STALL
    fist_end = (sp[0] + 0.01 + THRAGG.fist, sp[1] - 0.02)
    sh_px = fr.P(J["sh_n"][0] + 0.12, J["sh_n"][1] - 0.04, d)
    t_l = t_stall - T(fr, 5)
    up = (0.55, -0.45)                         # rising: the fist travels up-and-in
    if t >= t_l:
        if t < t_stall:
            uu = EASE["snap"](clamp((t - t_l) / (t_stall - t_l)))
            low = s2w(fr, *w2s(fr, J["pelvis"][0] - 0.1, J["pelvis"][1] - 0.2, d))
            near = (fist_end[0] + up[0] * 0.1, fist_end[1] + up[1] * 0.1)
            fist = (lerp(low[0], near[0], uu), lerp(low[1], near[1], uu))
        else:
            g = post_gap(t, t_stall, 0.1)
            fist = (fist_end[0] + up[0] * (g - 0.01), fist_end[1] + up[1] * (g - 0.01))
        _depth_arm(fr, sh_px, fist, fr.S(THRAGG.w_ua, d) * 0.95, sleeve=shade(THRAGG.suit, 0.92))
        if t >= t_stall - 1 / FPS:
            stall_cues(fr, sp, (fist[0] - THRAGG.fist, fist[1]), t - t_stall, "s208", r=0.5, gap_cloud=0.16,
                       n_dust=12, strength=0.7)
            rng = fr.srng("slidegrit")
            shards(fr, [(sp[0] + 0.006 + rng.uniform(0, 0.1), fist[1] + rng.uniform(-0.28, 0.22)) for _ in range(9)],
                   t, "s208g", size=0.022)
    elif u > 0.3:
        # anticipation: left shoulder dips, the fist cocked low by his hip
        lo = fr.P(J["pelvis"][0] - 0.34, J["pelvis"][1] + 0.08, d)
        fr.draw.line([sh_px, lo], fill=shade(THRAGG.suit, 0.92), width=int(fr.S(THRAGG.w_ua, d)))
        rr = fr.S(THRAGG.fist, d)
        fr.draw.ellipse([lo[0] - rr, lo[1] - rr, lo[0] + rr, lo[1] + rr], fill=THRAGG.accent)


# =============================================================================
# S2-09  WS worm's-eye: straight up, inverted, hammer-fist at the crown
# =============================================================================

T_RISE = P("fly_up", lean=4, neck=-20, ua_n=150, fa_n=170, ua_f=-20, fa_f=-10)
T_INV_WIND = P("t_stand", lean=176, neck=-30, ua_n=168, fa_n=176, ua_f=150, fa_f=120,
               th_n=178, sh_n=176, th_f=170, sh_f=150)
T_INV_HIT = P(T_INV_WIND, lean=178, ua_n=4, fa_n=2, ua_f=120, fa_f=100)
T_INV_HIT_C = P(T_INV_HIT, lean=184, ua_n=14, fa_n=-8)


def s2_09(fr):
    t = fr.t
    t_stall = cue(fr, "infinity_stop", 0, 16)
    t_hit0 = t_stall - 2 / FPS
    fr.cam = Cam(-6.0, 8.5, 70.0)
    lookup_bg(fr, steep=0.85)
    env.gantry(fr, env.GANTRY_X, sheared=True)
    G = gojo(fr, G_WEIGHT)                     # doesn't look up
    hx, hy = G["head"]
    crown = (hx - 0.01, hy + GOJO.head_r * 1.72)    # top of the hair spikes
    target = (crown[0] + 0.015, crown[1] + 0.01 + THRAGG.fist)
    g_st = 0.1
    B = place(THRAGG, T_INV_HIT, 1, lambda J: fist_c(J, "n"), (target[0], target[1] + g_st))
    launch = (-5.4, 6.0)
    if t < T(fr, 1):
        pose = P("t_hover_ready", lean=-6, th_n=40, sh_n=-30)
        px, py = place(THRAGG, pose, -1, lambda J: J["pelvis"], (launch[0], launch[1] + 1.0))
        J = thragg(fr, pose, px, py, -1)
        return
    if t < T(fr, 6):
        u = EASE["out"](clamp((t - T(fr, 1)) / T(fr, 5)))
        pose = T_RISE
        px, py = lerp(launch[0], -5.95, u), lerp(launch[1] + 1.0, 9.6, u)
        facing = -1
    elif t < t_hit0:
        u = EASE["inout"](clamp((t - T(fr, 6)) / (T(fr, 13) - T(fr, 6))))
        pose = rig.blend(T_RISE, T_INV_WIND, u)
        facing = 1
        Bw = place(THRAGG, T_INV_WIND, 1, lambda J: J["pelvis"], (B[0], B[1] + 0.25))
        px, py = lerp(-5.95, Bw[0], u), lerp(9.6, Bw[1], u)
    elif t < t_stall:
        pose = rig.pose_at(t, [(t_hit0, T_INV_WIND), (t_stall, T_INV_HIT, "snap")])
        facing = 1
        Bw = place(THRAGG, T_INV_WIND, 1, lambda J: J["pelvis"], (B[0], B[1] + 0.25))
        uu = (t - t_hit0) / (t_stall - t_hit0)
        px, py = lerp(Bw[0], B[0], uu), lerp(Bw[1], B[1], uu)
    else:
        g = post_gap(t, t_stall, g_st)
        pose = rig.blend(T_INV_HIT, T_INV_HIT_C, EASE["out"](clamp((t - t_stall) / 0.3)))
        facing = 1
        px, py = place(THRAGG, pose, facing, lambda J: fist_c(J, "n"), (target[0], target[1] + g - 0.01))
    # vapour puff where he was
    fx.dust_cloud(fr, launch[0], launch[1] + 1.0, t - T(fr, 1), r=0.7, n=10, ground=False, rise=0.0,
                  color=(225, 230, 240), alpha=120, salt="puff")
    if T(fr, 1) <= t < T(fr, 6):
        fx.speed_lines(fr, 0.6, direction=(0, -1), salt="s209")
        fx.trail(fr, [(launch[0] + (px - launch[0]) * k / 6, launch[1] + 1.0 + (py - launch[1] - 1.0) * k / 6)
                      for k in range(7)], width_m=0.7, alpha=100)
    J = thragg(fr, pose, px, py, facing, cape_wind=(0.0, -1.0) if facing == 1 else (0.2, -0.6))
    if t >= t_stall - 1 / FPS:
        fc = fist_c(J, "n")
        bottom = (fc[0], fc[1] - THRAGG.fist)
        fx.infinity(fr, crown[0], crown[1], r=0.55, strength=0.4 + 0.6 * clamp((t - t_stall) / 0.1), t=t)
        if t - t_stall < RIPPLE:
            fx.impact(fr, bottom[0], bottom[1], t - t_stall, kind="blocked", dirx=0, diry=-1)
        # a flat layer of the grit that fell with him, hanging above the crown
        rng = fr.srng("crowngrit")
        shards(fr, [(crown[0] + rng.uniform(-0.32, 0.32), crown[1] + 0.012 + rng.uniform(0, 0.03)) for _ in range(14)],
               t, "s209g", size=0.03)
        # downward pressure spills sideways through the airborne dust (no flash)
        fx.shockwave(fr, crown[0], crown[1] + 0.05, t - t_stall, r_max=3.6, dur=0.6, ground=True,
                     color=(200, 196, 190), width=3)
        rngd = fr.srng("airdust")
        for i in range(26):
            x0 = crown[0] + rngd.uniform(-2.5, 2.5)
            y0 = crown[1] + rngd.uniform(-0.6, 0.8)
            push = math.copysign(1.0, x0 - crown[0]) * 1.4 * (1 - math.exp(-3 * (t - t_stall)))
            fr.circle(x0 + push * math.exp(-abs(x0 - crown[0]) * 0.5), y0, 0.03, fill=PAL["dust"])


# =============================================================================
# S2-10  ECU: Thragg's eyes - confusion hardens into analysis
# =============================================================================

def _thragg_eyes(fr, h, look=(0.0, 0.0), brow=0.0, rot=0.0, cv=0.5, cu=0.5, s=1.0):
    """thragg_eyes_ecu with continuous lid opening, gaze and brow (the
    shared insert only takes a mood name), three-quarter facing screen-left."""
    L = inserts.Local(fr, cu, cv, s, rot)
    skin = THRAGG.skin
    L.poly([(-4, -3), (4, -3), (4, 3), (-4, 3)], shade(skin, 0.62))
    L.poly([(-4, -0.62 + brow), (4, -0.66 + brow), (4, -0.3), (-4, -0.26)], shade(skin, 0.45))
    L.poly([(-4, -3), (4, -3), (4, -0.7 + brow), (-4, -0.66 + brow)], skin)
    L.poly([(-0.1, -0.4), (0.1, -0.4), (0.16, 0.9), (-0.2, 0.95)], shade(skin, 0.57))      # nose bridge (shadow side)
    L.line([(0.08, -0.38), (0.15, 0.9)], shade(skin, 0.75), 0.02)
    for ex, sx in ((-0.7, 0.8), (0.75, 1.0)):                    # far eye (screen-left) foreshortened
        by = brow * (1.4 if ex > 0 else 1.2)
        L.poly([(ex - 0.55 * sx, -0.42 + by), (ex + 0.5 * sx, -0.5 + by * 1.3), (ex + 0.52 * sx, -0.36 + by * 1.3),
                (ex - 0.5 * sx, -0.3 + by)], THRAGG.hair)
        hh = max(0.004, h)
        L.poly([(ex - 0.5 * sx, 0.0), (ex - 0.2 * sx, -hh), (ex + 0.25 * sx, -hh * 1.1), (ex + 0.5 * sx, -0.02),
                (ex + 0.2 * sx, hh * 0.6), (ex - 0.2 * sx, hh * 0.7)], (228, 222, 220))
        if h > 0.03:
            ix = ex + (0.05 + look[0] * 0.22) * sx
            iy = -0.02 + look[1] * min(0.07, h * 0.5)
            L.ell(ix, iy, 0.15 * sx, min(0.15, h * 0.95), fill=(64, 40, 28))
            L.ell(ix, iy, 0.07 * sx, min(0.07, h * 0.6), fill=(12, 8, 10))
            L.ell(ix - 0.07 * sx, iy - 0.05, 0.025, min(0.02, h * 0.3), fill=(255, 255, 255))
        # upper lid line
        L.line([(ex - 0.5 * sx, -0.01), (ex - 0.2 * sx, -hh - 0.01), (ex + 0.25 * sx, -hh * 1.1 - 0.01),
                (ex + 0.5 * sx, -0.03)], shade(skin, 0.4), 0.025)


def s2_10(fr):
    t = fr.t
    # f0-6: the face swings up into frame as he half-rolls upright, then settles
    u = EASE["out"](clamp(t / T(fr, 6)))
    rot = lerp(-34.0, 0.0, u)
    cv = lerp(0.95, 0.5, u)
    inserts._bg(fr, (26, 24, 36), (70, 52, 58), bokeh=False)
    # f6-18 confusion: widen a hair; flick to Gojo (down-left), to his own fist, back; one blink
    tf = t
    h = kf(tf, [(T(fr, 6), 0.1), (T(fr, 9), 0.135, "out"), (T(fr, 18), 0.135), (T(fr, 22), 0.13),
                (T(fr, 32), 0.085, "inout")])
    blink = pulse(tf, T(fr, 13), 1.5 / FPS, 1.5 / FPS)
    h = h * (1 - blink)
    look = (0.0, 0.0)
    for (fa, fb, lk) in ((6, 9, (-0.9, 0.6)), (9, 13, (0.5, 0.9)), (15, 36, (-0.9, 0.55))):
        if T(fr, fa) <= tf:
            look = lk
    if tf < T(fr, 6):
        look = (-0.4, 0.3)
    brow = kf(tf, [(T(fr, 22), 0.0), (T(fr, 32), 0.05, "inout")])
    _thragg_eyes(fr, h, look, brow, rot, cv, 0.5, 1.0)


# =============================================================================
# S2-11  WS: four tonnes of street - it slows, hangs, and simply drops
# =============================================================================

T_DROP = P("hover", lean=-8, neck=10, ua_n=30, fa_n=40, ua_f=20, fa_f=30, th_n=10, sh_n=-10, th_f=-6, sh_f=-20)
T_LAND = P("land_crouch", lean=30, neck=-6, ua_n=40, fa_n=30, ua_f=20, fa_f=10)
T_DIG = P("land_crouch", lean=62, neck=-20, ua_n=26, fa_n=6, ua_f=14, fa_f=0, th_n=100, sh_n=-20, th_f=60, sh_f=-70,
          hand_n="claw", hand_f="claw")
T_HEAVE = P("t_tear", lean=-6, neck=-14, ua_n=150, fa_n=170, ua_f=140, fa_f=160, th_n=24, sh_n=0, th_f=-20, sh_f=-20)
T_OVER = P(T_HEAVE, lean=-18, ua_n=170, fa_n=200, ua_f=165, fa_f=195)
T_THROW = P("t_throw", lean=34, neck=-6, ua_n=112, fa_n=102, ua_f=100, fa_f=96, th_n=46, sh_n=6, th_f=-40, sh_f=-56,
            hand_n="open", hand_f="open")


def s2_11(fr):
    t, dur = fr.t, fr.dur
    t_land = cue(fr, "land_heavy", 0, 8)
    t_dig = cue(fr, "crack_ground", 0, 12)
    t_tear = cue(fr, "concrete_break", 0, 22)
    t_rel = cue(fr, "whoosh", 0, 36)
    t_stall = cue(fr, "infinity_stop", 0, 38)
    t_hit = cue(fr, "concrete_break", 1, 82)
    t_drop = T(fr, 56)
    # camera: wide; push-in toward Gojo as the slab flies; slight tilt down with the drop
    cx = kf(t, [(t_rel - T(fr, 2), 1.0), (t_stall + T(fr, 18), -3.0, "inout")])
    cy = kf(t, [(t_rel - T(fr, 2), 3.0), (t_stall + T(fr, 18), 4.2, "inout"), (t_hit, 3.2, "inout")])
    zm = kf(t, [(t_rel - T(fr, 2), 45.0), (t_stall + T(fr, 18), 60.0, "inout")])
    fr.cam = Cam(cx, cy, zm)
    street(fr, skip=("slab",) if t < t_hit else ())

    # ---- Gojo: watches it come (head inclined), then follows it down (f56-82, 2s)
    t2 = on2(fr)
    neck = kf(t2, [(t_rel, -4), (t_stall, 6, "out"), (t_drop, 6), (t_hit, 26, "in")])
    G = gojo(fr, P(G_WEIGHT, neck=neck), halo=1.5)
    jy = 7.3
    jacket = chest_front(G, jy)

    # ---- the slab
    th = 0.55
    hang_c = (jacket + 0.01 + th / 2, jy)
    rel_c = (6.9, 3.0)
    if t_tear - T(fr, 8) <= t < t_hit:
        if t < t_tear:
            # the street bulges around his wrists
            k = clamp((t - (t_tear - T(fr, 8))) / T(fr, 8))
            fr.ellipse(8.5, 0.0, 1.8, 0.12 + 0.18 * k, fill=shade(PAL["street"], 1.15))
            cpos, ang = (8.5, 0.05 + 0.15 * k), 0.0
            draw = False
        elif t < T(fr, 30):
            k = EASE["inout"](clamp((t - t_tear) / (T(fr, 30) - t_tear)))
            cpos = (lerp(8.5, 8.0, k), lerp(0.15, 3.3, k))
            ang = -30.0 * (1 - k)
            draw = True
        elif t < t_rel:
            # pivots with it overhead (anticipation), cocking it back toward the release point
            k = EASE["inout"](clamp((t - T(fr, 30)) / (t_rel - T(fr, 30))))
            cpos = (lerp(8.0, rel_c[0], k * k), lerp(3.3, rel_c[1], k))
            ang = 8.0 * math.sin(k * math.pi)
            draw = True
        elif t < t_drop:
            g0 = math.hypot(hang_c[0] - rel_c[0], hang_c[1] - rel_c[1])
            g = stall_gap(t, t_rel, t_stall, g0, g_end=0.0, crawl=6.0)
            u = 1 - g / g0
            cpos = (lerp(rel_c[0], hang_c[0], u), lerp(rel_c[1], hang_c[1], u))
            ang = lerp(0.0, 90.0, EASE["out"](clamp((t - t_rel) / (t_stall + T(fr, 4) - t_rel))))
            draw = True
        else:
            # momentum spent: gravity takes it, straight down past his shoes
            tt = t - t_drop
            cy0 = hang_c[1] - 0.5 * 9.8 * tt * tt * (1.0 if t_hit - t_drop > 1.0 else (1.083 / (t_hit - t_drop)) ** 2)
            cpos = (hang_c[0] + 0.05 * tt, max(1.55, cy0))
            ang = 90.0 - 10.0 * clamp(tt / (t_hit - t_drop))
            draw = True
        if draw:
            # broken cable and gravel trailing from the torn underside
            base = draw_slab(fr, cpos[0], cpos[1], ang, th=th)
            if t < t_stall + T(fr, 6):
                fr.line([base[0], (base[0][0] + 0.2, base[0][1] - 0.6), (base[0][0] + 0.5, base[0][1] - 0.8)],
                        (36, 36, 40), width_m=0.05)
            if t_tear <= t < t_rel + T(fr, 4):
                fx.debris(fr, 8.5, 0.3, t - t_tear, n=26, speed=4.5, spread=2.4, size=(0.05, 0.18),
                          color=PAL["concrete_dark"], salt="tear", ground=0.0)
            if t >= t_stall - 1 / FPS and t < t_drop + T(fr, 6):
                lead = (cpos[0] - th / 2, cpos[1])
                stall_cues(fr, (jacket, jy), lead, t - t_stall, "s211", r=1.1, gap_cloud=1.6, n_dust=26,
                           strength=1.0 if t < t_drop else 0.6)
                # a skin of gravel thrown off the leading edge, hanging between slab and jacket
                rng = fr.srng("skin")
                pts = []
                for i in range(22):
                    fpos = rng.uniform(0.15, 0.95)
                    pts.append((jacket + 0.004 + (lead[0] - jacket) * fpos, cpos[1] + rng.uniform(-1.4, 1.4)))
                shards(fr, pts, t, "s211g", size=0.045)
    if t >= t_hit:
        fx.dust_cloud(fr, -5.5, 0.2, t - t_hit, r=3.0, n=18, salt="slabdust")
        fx.debris(fr, -5.5, 0.4, t - t_hit, n=20, speed=5.5, spread=2.4, size=(0.05, 0.22), salt="slabdeb", ground=0.0)
        fx.shockwave(fr, -5.5, 0.05, t - t_hit, r_max=5.0, dur=0.4, ground=True, color=(200, 190, 175))

    # ---- Thragg: drop, land, dig, heave, pivot, throw
    land_x = 8.0
    if t < t_land:
        u = clamp(t / t_land)
        pose = rig.blend(P("t_hover_ready"), T_DROP, EASE["out"](u))
        J0 = solve(THRAGG, T_LAND, 0, None, -1)
        p0 = (-4.5, 8.5)
        p1 = (land_x, J0["pelvis"][1] + 0.2)
        px, py = lerp(p0[0], p1[0], EASE["inout"](u)), lerp(p0[1], p1[1], EASE["in"](u))
        J = thragg(fr, pose, px, py, -1, cape_wind=(0.2, 1.4))
    else:
        keys = [(t_land, T_LAND), (t_dig, T_DIG, "out"), (t_tear, T_DIG), (T(fr, 30), T_HEAVE, "inout"),
                (T(fr, 35), T_OVER, "inout"), (t_rel, T_THROW, "snap")]
        pose = rig.pose_at(t, keys)
        J = thragg(fr, pose, land_x + (0.6 if t >= t_tear else 0.0) * EASE["inout"](clamp((t - t_tear) / 0.3)), None,
                   -1, cape_wind=(0.6, -0.2) if t < t_rel else (0.9, 0.3))
        if t < t_land + 0.6:
            fx.dust_cloud(fr, land_x, 0.05, t - t_land, r=2.2, n=14, salt="landring")
            fx.shockwave(fr, land_x, 0.02, t - t_land, r_max=4.0, dur=0.35, ground=True)
        ground_cracks(fr, land_x, 1.6, "landcr", n=8)
        if t >= t_dig and t < t_tear:
            hx_, hy_ = rig.hand_pos(J, "n")
            ground_cracks(fr, hx_, 0.9, "handcr", n=7, y=0.0)


# =============================================================================
# S2-12  EWS: the 300 m loop through the storm deck
# =============================================================================

_LOOP = [(-1, (8.0, 0.5)), (1, (8.0, 2.0)), (3, (90.0, 44.0)), (8, (300.0, 62.0)), (11, (342.0, 140.0)),
         (16, (352.0, 330.0)), (22, (300.0, 395.0)), (30, (140.0, 380.0)), (44, (-250.0, 384.0)),
         (48, (-282.0, 318.0)), (52, (-300.0, 250.0))]


def _loop_pos(fr, t):
    keys = [(T(fr, f), p) for f, p in _LOOP]
    # Catmull-Rom through the keys (one continuous clean hook)
    for i in range(1, len(keys)):
        if t <= keys[i][0]:
            t0, p1 = keys[i - 1]
            t1, p2 = keys[i]
            p0 = keys[max(0, i - 2)][1]
            p3 = keys[min(len(keys) - 1, i + 1)][1]
            u = clamp((t - t0) / max(1e-6, t1 - t0))
            u2, u3 = u * u, u * u * u
            return tuple(0.5 * ((2 * p1[j]) + (-p0[j] + p2[j]) * u + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * u2 +
                                (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * u3) for j in range(2))
    return keys[-1][1]


def district(fr, lit=1.0):
    """The district seen from the high wide (S2-12): rows of rooftops between
    the camera and the skyline (open_sky only draws the far skyline band).
    The intersection stays open so tiny Gojo is visible on his corner."""
    sky = PAL["sky_mid"]
    for row, d in enumerate((2.1, 1.6, 1.25, 1.0, 0.85)):
        rng = random.Random(f"dist{row}")
        x = -700.0
        haze = clamp((d - 0.85) / 1.25) * 0.35
        while x < 800.0:
            w = rng.uniform(14, 42)
            h = rng.uniform(12, 30 if d < 1.1 else 55)
            if d <= 1.25 and x + w > -34 and x < 30:      # the avenue / intersection canyon
                x = 30 + rng.uniform(0, 4)
                continue
            col = shade(mix_color(shade(PAL["bldg_near"], rng.uniform(0.85, 1.25)), sky, haze), lit)
            fr.rect(x, -40, x + w, h, col, d=d)
            fr.line([(x, 0), (x, h)], shade(mix_color(col, PAL["rim_warm"], 0.3), lit), width_m=0.8, d=d)
            for _ in range(int(w * h / 180)):
                wx, wy = rng.uniform(x + 1, x + w - 2), rng.uniform(3, h - 3)
                fr.rect(wx, wy, wx + 1.4, wy + 1.2, shade(mix_color(PAL["window_lit"], col, 0.45), lit), d=d)
            x += w + rng.uniform(2, 8)
    # the street in the canyon, with the crater and the fallen arm too small to read
    fr.rect(-34, -2, 30, 0.3, shade(PAL["street"], lit), d=1.0)


def s2_12(fr):
    t = fr.t
    t_go = T(fr, 1)
    fr.cam = Cam(60.0, 176.0, 2.45)
    C.stage(fr, SEQ, "sky", extra=("mast_sheared",))
    district(fr)
    # the storm deck across the top of frame (the loop runs inside it)
    deck_y = 330.0
    img, dr = fr.layer()
    rng = random.Random("deck12")
    for i in range(40):
        x = rng.uniform(-420, 520) - C.tg(fr) * 1.5
        y = deck_y + rng.uniform(10, 110)
        w, h = rng.uniform(40, 110), rng.uniform(14, 34)
        X, Y = fr.P(x, y)
        c = mix_color(PAL["cloud"], PAL["cloud_lit"], clamp((80 - x) / 400) * 0.7)
        dr.ellipse([X - fr.S(w), Y - fr.S(h), X + fr.S(w), Y + fr.S(h)], fill=c + (235,))
    fr.merge(img)
    # path so far
    pts = []
    n = 60
    t_now = max(0.0, t)
    for k in range(n + 1):
        tt = t_go + (t_now - t_go) * k / n
        if t_now > t_go:
            pts.append(_loop_pos(fr, tt))
    head = _loop_pos(fr, t_now) if t_now > t_go else (8.0, 0.5)
    # the furrow in the deck: lit from inside, healing behind him
    for k in range(1, len(pts)):
        (x0, y0), (x1, y1) = pts[k - 1], pts[k]
        if y1 < deck_y - 5:
            continue
        age = (t_now - (t_go + (t_now - t_go) * k / n))
        heal = clamp(1 - age / 0.9)
        if heal <= 0:
            continue
        fr.line([(x0, y0), (x1, y1)], shade((24, 22, 34), 1.0), width_m=10 * heal + 2)
        fr.glow_line([(x0, y0), (x1, y1)], shade((150, 130, 170), heal * 0.6), width_px=4)
    # sheet lightning flickering inside the furrow (twice, on the thunder cue)
    tl = cue(fr, "thunder_distant", 0, 24)
    flash = max(pulse(t, tl - 2 / FPS, 0.02, 0.08), 0.7 * pulse(t, tl + 1 / FPS, 0.02, 0.12))
    if flash > 0 and len(pts) > 2:
        for k in range(3):
            lx, ly = _loop_pos(fr, tl - (0.1 + 0.12 * k))
            fr.glow_circle(lx, ly + 12, 22 - 5 * k, shade((170, 165, 220), flash * (1 - 0.25 * k)))
        fr.soft_circle(lx, ly, 70, shade((90, 85, 130), flash))
    # vapour trail: one continuous hook (outside the deck)
    if len(pts) > 2:
        fx.trail(fr, pts, width_m=4.5, alpha=120)
    # launch: boom ring off the street; windows along the avenue burst in sequence
    if t >= t_go:
        fx.sonic_boom(fr, 8.0, 3.0, t - t_go, dirx=1, diry=0.4, size=16)
        fx.shockwave(fr, 8.0, 0.5, t - t_go, r_max=70, dur=0.5, ground=True, width=3)
        for i in range(26):
            wx = 14 + i * 11.5
            hx, _ = head
            tb = t_go + T(fr, 7) * (wx - 8) / 292.0
            if t >= tb and t < tb + 0.8:
                a = 1 - (t - tb) / 0.8
                rr = random.Random(f"aw{i}")
                for j in range(3):
                    gx, gy = wx + rr.uniform(-4, 4), rr.uniform(12, 50) + (t - tb) * 6
                    fr.glow_circle(gx + (t - tb) * rr.uniform(-6, 6), gy, 1.6, shade((190, 220, 255), a))
    # Thragg: a speck at the head of the trail (one anticipation frame at f0)
    if t < t_go:
        J = thragg(fr, T_LAND, 8.0, None, -1)
        fr.glow_circle(8.0, 1.0, 2.5, (60, 50, 50))
    elif head[1] < deck_y - 2 and head[0] > -270:
        fr.circle(head[0], head[1], 1.8, fill=(240, 236, 236))
        fr.circle(head[0], head[1], 0.9, fill=THRAGG.accent)
    # Gojo, tiny, on air at the west corner, still facing east (pole beside him)
    fr.line([(-7.0, 0.0), (-7.0, 6.4)], shade(POLE, 1.2), width_m=0.6)
    gojo(fr, G_POCKETS, halo=1.2, scale=1.6)


# =============================================================================
# S2-13  MCU low angle: he turns to the sunset before the dive arrives
# =============================================================================

T_DIVE = P("t_fly_punch", lean=127, neck=-34, ua_n=53, fa_n=53, ua_f=-110, fa_f=-120,
           th_n=-127, sh_n=-134, th_f=-140, sh_f=-150)
T_DIVE_C = P(T_DIVE, ua_n=60, fa_n=44, lean=131)
T_DIVE_BACK = P(T_DIVE_C, ua_n=40, fa_n=150, lean=118)
D_DIR = (0.8, -0.6)                    # dive direction (down-east)


def gojo_turning(fr, phase, neck=0.0):
    """phase 0 = facing east, 1 = facing west (via a front view).  Drawn on 2s."""
    if phase < 0.33:
        pose = P(G_LOOSE, neck=neck)
        return gojo(fr, pose, 1), 1
    if phase < 0.67:
        J = gojo(fr, G_FRONT, 1, view="front")
        gojo_front_head(fr, J)
        return J, 0
    pose = P(G_LOOSE_W, neck=neck)
    return gojo(fr, pose, -1), -1


def s2_13(fr):
    t = fr.t
    t_stall = cue(fr, "infinity_stop", 0, 40)
    t_arm = t_stall - 2 / FPS
    t_spk = T(fr, 22)
    fr.cam = Cam(-6.3, 8.0, 200.0)                   # rock steady
    street(fr, blur=1.3)
    # ---- background torrent behind Gojo (screen-left to right) after the arrival
    if t >= t_stall:
        k = clamp(1 - (t - t_stall) / 0.9)
        fx.speed_lines(fr, 0.9 * k + 0.2, direction=(1.0, 0.05), salt="torrent", color=(200, 180, 160))
        rng = fr.srng("paper")
        for i in range(30):
            sp = rng.uniform(14, 30)
            x = -12 + ((t - t_stall) * sp + rng.uniform(0, 14)) % 16
            y = 5.4 + rng.uniform(0, 5)
            if rng.random() < 0.4:
                a = t * rng.uniform(5, 12) + i
                fr.poly([(x + math.cos(a) * 0.12, y + math.sin(a) * 0.08), (x - math.sin(a) * 0.1, y + math.cos(a) * 0.1),
                         (x - math.cos(a) * 0.12, y - math.sin(a) * 0.08)], (225, 220, 210), d=1.6)
            else:
                fr.circle(x, y, 0.05, fill=PAL["dust"], d=1.4)
        fx.dust_cloud(fr, -6.0, 6.0, t - t_stall, r=2.6, n=14, ground=False, rise=0.6, alpha=70, salt="torr", d=1.5)

    # ---- Gojo: the turn to his right, east -> west-south-west (f8-30, on 2s)
    t2 = on2(fr)
    phase = EASE["inout"](clamp((t2 - T(fr, 8)) / T(fr, 22)))
    neck = -12 * clamp((t2 - T(fr, 24)) / T(fr, 6))
    gojo_turning(fr, phase, neck)
    # where his face will be once he has turned (the dive is aimed there)
    F = face_pt(solve(GOJO, P(G_LOOSE_W, neck=-12), GX, None, -1, ground=GSOLE))

    # ---- Thragg's dive from high in the west (a speck in the orange cloud, growing fast)
    if t >= t_spk:
        g_arm = 0.9
        tgt = (F[0] - 0.01, F[1] + 0.02)
        if t < t_arm:
            u = clamp((t - t_spk) / (t_arm - t_spk))
            d = lerp(55.0, 1.0, u)
            # screen start: upper-left in the cloud; layer coords along a straight 3D line
            S0 = s2w(fr, 0.1, 0.05, 55.0)
            kn_arm = (tgt[0] - D_DIR[0] * g_arm, tgt[1] - D_DIR[1] * g_arm)
            X = lerp(S0[0], kn_arm[0], u)
            Y = lerp(S0[1], kn_arm[1], u)
            pose = T_DIVE
            px, py = place(THRAGG, pose, 1, lambda J: knuckle(J, "n"), (X, Y))
            if d < 6:
                bx_, by_ = px + 0.3, py + 0.3
                fx.trail(fr, [(bx_ - D_DIR[0] * k * 0.6 * d, by_ - D_DIR[1] * k * 0.6 * d) for k in range(5, -1, -1)],
                         width_m=0.35, alpha=70, d=d)
            J = thragg(fr, pose, px, py, 1, depth=d, cape_wind=(-0.9, 0.5))
            cx_, cy_ = J["chest"]
            kx, ky = knuckle(J, "n")
            fx.sonic_boom(fr, kx, ky, 0.15 + 0.06 * math.sin(t * 40), dirx=D_DIR[0], diry=D_DIR[1],
                          size=0.7, d=d)
        else:
            g = stall_gap(t, t_arm, t_stall, g_arm)
            comp = EASE["out"](clamp((t - t_stall) / 0.3))
            pose = rig.blend(T_DIVE, T_DIVE_C, comp)
            kn = (tgt[0] - D_DIR[0] * (g - 0.01), tgt[1] - D_DIR[1] * (g - 0.01))
            px, py = place(THRAGG, pose, 1, lambda J: knuckle(J, "n"), kn)
            if t < t_stall + 1 / FPS:
                bx_, by_ = px + 0.3, py + 0.3
                fx.trail(fr, [(bx_ - D_DIR[0] * k * 0.7, by_ - D_DIR[1] * k * 0.7) for k in range(6, -1, -1)],
                         width_m=0.4, alpha=80)
            wind = kf(t, [(t_stall, (-0.9, 0.5)), (t_stall + 0.3, (0.6, 2.4))], "out")
            J = thragg(fr, pose, px, py, 1, cape_wind=wind)
            if t >= t_stall - 1 / FPS:
                kx, ky = knuckle(J, "n")
                fx.sonic_boom(fr, kx, ky, (t - t_stall) * 1.6, dirx=D_DIR[0], diry=D_DIR[1], size=0.75)
                inf_stop(fr, J, F, t - t_stall, side="n", r=0.75, gap=0.0)
                rng = fr.srng("dive_sh")
                shards(fr, [(F[0] - 0.004 - 0.32 * rng.random() ** 2, F[1] + rng.uniform(-0.2, 0.2)) for _ in range(16)],
                       t, "s213sh", size=0.035)


# =============================================================================
# S2-14  WS: the boom's ring flattens the lamp posts; in the middle nothing moved
# =============================================================================

def s2_14(fr):
    t = fr.t
    t_ring = cue(fr, "shockwave", 0, 2)
    t_back = T(fr, 28)
    sh = C.shake(t, t_ring, amp=8.0, dur=4 / FPS)
    fr.cam = Cam(4.0, 8.0, 26.0, shake=sh)
    street(fr)
    # boom ring: air ring off the pair, then the footprint racing over the asphalt
    fx.shockwave(fr, RING_X, 7.0, t + 1 / FPS, r_max=9.0, dur=0.3, width=4)
    if t >= t_ring:
        tr = t - t_ring
        fx.shockwave(fr, RING_X, 0.05, tr + 0.04, r_max=30.0, dur=10 / FPS, ground=True, width=6)
        fx.dust_cloud(fr, RING_X, 0.1, tr, r=13.0, n=30, rise=0.4, alpha=95, salt="ringdust")
        # windows EAST of Gojo burst in a sweeping ring (completing it)
        for k in range(6):
            x0 = 6 + k * 6
            fx.glass_shatter(fr, x0, 4.0, x0 + 6, 26.0, t - T(fr, 6 + k * 1.4), n=22, outward=1,
                             salt=f"g214{k}", d=2.8)
        # grit and paper settling
        fx.debris(fr, RING_X + 4, 0.2, tr, n=26, speed=7.0, spread=1.4, angle=math.radians(40), size=(0.04, 0.12),
                  color=(200, 196, 186), salt="paper", ground=0.0, drag=1.4)
    # ---- the pair at upper-left: held cels until f28; then he draws the fist back
    G = gojo(fr, P(G_LOOSE_W, neck=-12), -1, halo=1.5)
    F = face_pt(G)
    tgt = (F[0] - 0.01, F[1] + 0.02)
    back = EASE["in"](clamp((t - t_back) / (fr.dur - t_back + 0.25)))
    pose = rig.blend(T_DIVE_C, T_DIVE_BACK, back)
    g = 0.0105 + 0.32 * back
    px, py = place(THRAGG, T_DIVE_C, 1, lambda J: knuckle(J, "n"), (tgt[0] - D_DIR[0] * g, tgt[1] - D_DIR[1] * g))
    J = thragg(fr, pose, px - 0.25 * back, py + 0.1 * back, 1, cape_wind=(0.6, 2.0))
    fx.infinity(fr, F[0], F[1], r=0.7, strength=0.5 * (1 - back), t=t)


# =============================================================================
# S2-15  OTS high: withdrawal to 30 m; growing hostility
# =============================================================================

T_OVERHEAD = P("t_hover_ready", lean=58, neck=36, ua_n=30, fa_n=80, ua_f=10, fa_f=60, th_n=-20, sh_n=-60,
               th_f=-40, sh_f=-90)
T_BACKOFF = P("t_hover_ready", lean=-10, neck=6, ua_n=24, fa_n=70, ua_f=10, fa_f=60, th_n=6, sh_n=-16,
              th_f=-10, sh_f=-36)
T_HOVER_STILL = P("t_stand", lean=2, neck=8, ua_n=8, fa_n=4, ua_f=-6, fa_f=-2, th_n=6, sh_n=-4, th_f=-6, sh_f=-14)


def s2_15(fr):
    t, dur = fr.t, fr.dur
    t_over = T(fr, 6)
    t12, t26, t40 = T(fr, 12), T(fr, 26), T(fr, 40)
    z0 = 29.0
    c0 = (0.5, 13.5)
    # final foreground hover: head on screen, depth (he is 3 m from the lens)
    dF = 0.05
    head_F = (0.8, 0.26)
    # push-in (12% over the last 44 frames) anchored on his face
    pk = EASE["inout"](clamp((t - t40) / (dur - t40)))
    zoom = z0 * (1 + 0.12 * pk)
    A = (0.74, 0.3)
    ax = c0[0] + (A[0] * OUT_W - OUT_W / 2) / z0
    ay = c0[1] - (A[1] * OUT_H - OUT_H / 2) / z0
    fr.cam = Cam(ax - (A[0] * OUT_W - OUT_W / 2) / zoom, ay + (A[1] * OUT_H - OUT_H / 2) / zoom, zoom)
    street(fr)
    # dust settling over the intersection; distant sheet lightning in the deck
    fx.dust_cloud(fr, 0.0, 0.3, 2.0 + t * 0.3, r=14.0, n=16, rise=0.2, alpha=40, salt="settle")
    fl = pulse(t, cue(fr, "thunder_distant", 0, 66) - T(fr, 2), 0.04, 0.3)
    if fl > 0:
        fr.soft_circle(0.25, 0.08, 0.3, shade((120, 110, 160), fl), world=False)

    # ---- Gojo: turns back to face east tracking him up (f18-40), right hand to pocket (f36-48)
    t2 = on2(fr)
    phase = 1 - EASE["inout"](clamp((t2 - T(fr, 18)) / T(fr, 22)))
    hp = EASE["inout"](clamp((t2 - T(fr, 36)) / T(fr, 12)))
    if phase >= 0.67:
        G = gojo(fr, P(G_LOOSE_W, neck=-14 * (1 - clamp((t2 - T(fr, 10)) / T(fr, 8)))), -1, halo=1.5)
    elif phase >= 0.33:
        G = gojo(fr, G_FRONT, 1, view="front", halo=1.5)
        gojo_front_head(fr, G)
    else:
        G = gojo(fr, rig.blend(P(G_LOOSE, neck=-16), P(G_POCKETS, neck=-16), hp), 1, halo=1.5)

    # ---- Thragg: rise over him (pivot through facing-down), back away to the foreground
    F = face_pt(solve(GOJO, P(G_LOOSE_W, neck=-12), GX, None, -1, ground=GSOLE))
    p_stall = place(THRAGG, T_DIVE_BACK, 1, lambda J: knuckle(J, "n"),
                    (F[0] - 0.01 - D_DIR[0] * 0.33, F[1] + 0.02 - D_DIR[1] * 0.33))
    over = (-5.7, 10.6)
    p12 = (-4.0, 12.0)
    if t < t12:
        if t < t_over:
            u = EASE["inout"](t / t_over)
            pose = rig.blend(T_DIVE_BACK, P(T_OVERHEAD, neck=30), u)
            facing = 1
            pos = (lerp(p_stall[0], over[0], u), lerp(p_stall[1], over[1], u))
        else:
            u = EASE["out"]((t - t_over) / (t12 - t_over))
            pose = rig.blend(P(T_OVERHEAD, lean=60), T_BACKOFF, u)
            facing = -1
            pos = (lerp(over[0], p12[0], u), lerp(over[1], p12[1], u))
        if T(fr, 2) <= t < T(fr, 10):
            fx.trail(fr, [(lerp(p_stall[0], pos[0], k / 6), lerp(p_stall[1], pos[1], k / 6) + 0.5) for k in range(7)],
                     width_m=0.8, alpha=70)
        J = thragg(fr, pose, pos[0], pos[1], facing, cape_wind=(0.5, -0.8) if facing > 0 else (-0.6, 0.4))
        return
    # backing away toward the lens: depth 1 -> dF, decelerating into a dead hover (never turns his back)
    u = EASE["out"](clamp((t - t12) / (t26 - t12)))
    d = 1.0 / lerp(1.0, 1.0 / dF, u ** 1.5)
    s12 = w2s(fr, p12[0], p12[1])
    # final screen position scales with the push-in about the anchor
    sF = (A[0] + (head_F[0] - A[0]) * zoom / z0, A[1] + (head_F[1] - A[1]) * zoom / z0)
    su = (lerp(s12[0], sF[0], u), lerp(s12[1], sF[1], u))
    pose = rig.blend(T_BACKOFF, T_HOVER_STILL, EASE["inout"](clamp((t - t12) / (t40 - t12))))
    nk = kf(t, [(T(fr, 44), 8.0), (T(fr, 56), 13.0, "inout")])
    pose = P(pose, neck=nk if t > T(fr, 44) else pose["neck"])
    hx, hy = s2w(fr, su[0], su[1], d)
    J0 = solve(THRAGG, pose, 0, 0, -1)
    px, py = hx - J0["head"][0], hy - J0["head"][1]
    wind = kf(t, [(t12, (-0.6, 0.5)), (t26, (-0.9, 1.6), "out"), (t40, (0.55, -0.15), "inout")])
    J = thragg(fr, pose, px, py, -1, depth=d, cape_wind=wind)
    if t > T(fr, 40):
        thragg_brow(fr, J, k=EASE["inout"](clamp((t - T(fr, 44)) / T(fr, 30))), d=d)
    if T(fr, 51) <= t < T(fr, 55):     # one hard exhale through the nose: nostril flare
        hd = J["head_dir"]
        r = THRAGG.head_r
        nx_ = J["head"][0] - (hd[1]) * r * 0.95
        fr.circle(nx_, J["head"][1] - r * 0.2, r * 0.07, fill=(60, 30, 30), d=d)


SHOTS = {
    "S2-01": s2_01,
    "S2-02": s2_02,
    "S2-03": s2_03,
    "S2-04": s2_04,
    "S2-05": s2_05,
    "S2-06": s2_06,
    "S2-07": s2_07,
    "S2-08": s2_08,
    "S2-09": s2_09,
    "S2-10": s2_10,
    "S2-11": s2_11,
    "S2-12": s2_12,
    "S2-13": s2_13,
    "S2-14": s2_14,
    "S2-15": s2_15,
}
