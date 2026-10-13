"""Sequence 6 - UNLIMITED VOID (S6-01 .. S6-14).

Seq 5 left both fighters ~200 m up over the Purple channel, Gojo west
(screen-left), Thragg east (screen-right). Thragg backs into Purple's dust
plume (S6-01); the Six Eyes read only a faint haze in it (S6-02); he breaks
low and west for the lit city and Gojo teleports into his line (S6-03,
S6-04). Silence, one hand sign (S6-05), and the domain closes on the first
frame of Thragg's lunge (S6-06).

From S6-06 f0 the sequence plays in PERCEPTION TIME (~2.0 s of real time as
~20 s of screen, not slow motion): Thragg frozen and sinking (S6-07, S6-08),
the Blue pin that turns his torso (S6-09), three one-frame touches and the
spear-hand that wakes him (S6-10), the grab that stalls in Infinity and the
flood slamming back (S6-11), Gojo's decision (S6-12). S6-13 is the overlapping
objective-time cutaway: a silent black dome for exactly 2.0 s. S6-14 brings
the city back as the void peels away; the Blue winks out on the last frame.

Timing: beats are authored against the nominal shot lengths in NOM and scaled
by fr.n / NOM (T()), so every shot still works if its length changes by a few
frames. Contact frames are read from the shot's own sfx cues (cue()).
"""
from __future__ import annotations

import math
import random
from dataclasses import replace

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter

import scenes.common as C
from engine import Cam, kf, pulse, clamp, EASE, lerp, mix_color, shade, smoothstep, PAL, FPS, OUT_W, OUT_H
import env
import fx
import inserts
import rig
from rig import GOJO, THRAGG, P, pose_at, draw_fighter, hand_pos, solve

SEQ = 6

NOM = {"S6-01": 72, "S6-02": 52, "S6-03": 40, "S6-04": 32, "S6-05": 56, "S6-06": 64, "S6-07": 44,
       "S6-08": 46, "S6-09": 52, "S6-10": 66, "S6-11": 50, "S6-12": 120, "S6-13": 60, "S6-14": 86}

_STARTS = {}


def start_gf(sid):
    if not _STARTS:
        for s in C.shotlist()["shots"]:
            _STARTS[s["id"]] = s["start_frame"]
    return _STARTS.get(sid, 0)


# =============================================================================
# timing helpers
# =============================================================================

def T(fr, f):
    """Nominal frame f of this shot -> seconds (scaled to the real length)."""
    return f * fr.n / NOM.get(fr.shot["id"], fr.n) / FPS


def cue(fr, name, nth=0, default=0):
    """Time (s) of the nth sfx cue `name` of this shot (contact frames live there)."""
    hits = sorted(s["at"] for s in (fr.shot.get("sfx") or []) if s.get("cue") == name)
    if len(hits) > nth:
        return hits[nth] / FPS
    return T(fr, default)


def seg(t, t0, t1, ease="inout"):
    if t1 <= t0:
        return 1.0 if t >= t1 else 0.0
    return EASE[ease](clamp((t - t0) / (t1 - t0)))


def on2(fr):
    """Shot time held on twos."""
    return (fr.f - fr.f % 2) / FPS


def zkf(t, keys):
    """Zoom keyframes interpolated geometrically (constant-rate push/pull)."""
    return math.exp(kf(t, [(k[0], math.log(k[1])) + tuple(k[2:]) for k in keys]))


def plume_time(fr):
    """Seconds since S6-01 f0: the dust plume drifts continuously across S6-01..03."""
    return (fr.gf - start_gf("S6-01")) / FPS


def void_time(fr):
    """Seconds since the barrier closed (S6-06 f0): keeps the void continuous."""
    return (fr.gf - start_gf("S6-06")) / FPS


# =============================================================================
# rig helpers
# =============================================================================
LIMBS = ["ua_n", "fa_n", "ua_f", "fa_f", "th_n", "sh_n", "th_f", "sh_f"]
RIM_W = (-0.6, 0.5)                                   # dusk key from screen-left: rim on the west edge
GOJO_W = replace(GOJO, rim=(255, 196, 150))           # warm sunset rim on Gojo's hair and collar
# inside the domain the only light is the void's cold blue-white glow, keyed from screen-left
GOJO_V = replace(GOJO, rim=(196, 228, 255), suit=(18, 22, 36), suit_hi=(56, 70, 108), skin=(218, 216, 230),
                 hair=(228, 238, 255))
THRAGG_V = replace(THRAGG, rim=(196, 228, 255), suit=(170, 178, 200), suit_hi=(212, 220, 240),
                   skin=(198, 194, 208), hair=(14, 14, 22), accent=(146, 26, 40))
# Gojo hovers "beside the sheared mast pole" at the west corner (x = -7 in the
# shot list). In this side-on stage the pole is drawn at x = -7 itself, so his
# figure is set 0.6 m east of it to read as beside it rather than impaled on it.
G_CORNER_X = -6.4
HALO_G = (150, 190, 236)
HALO_T = (40, 32, 40)
HALO_V = (90, 140, 220)


def rot_pose(p, r):
    """Rotate the whole figure rigidly by r degrees toward its facing."""
    q = dict(p)
    q["lean"] = p["lean"] + r
    for k in LIMBS:
        q[k] = p[k] - r
    return q


def rig_angle(dx, dy, facing):
    return math.degrees(math.atan2(dx * facing, -dy))


def reach(st, pose, x, y, facing, side, target, scale=1.0, elbow="down"):
    """Pose with arm `side` solved (2-bone IK) so the hand lands on `target`."""
    J = solve(st, pose, x, y, facing, scale, "side")
    sx, sy = J[f"sh_{side}"]
    la, lb = st.upper_arm * scale, st.forearm * scale
    hl = 0.95 * st.fist * scale
    tx, ty = target
    D0 = math.hypot(tx - sx, ty - sy) or 1e-6
    ux, uy = (tx - sx) / D0, (ty - sy) / D0
    best = None
    for _ in range(4):
        wx, wy = tx - ux * hl, ty - uy * hl
        D = math.hypot(wx - sx, wy - sy)
        Dc = clamp(D, abs(la - lb) + 1e-3, la + lb - 1e-4)
        base = math.atan2(wy - sy, wx - sx)
        A = math.acos(clamp((la * la + Dc * Dc - lb * lb) / (2 * la * Dc), -1, 1))
        cands = []
        for sgn in (1, -1):
            a1 = base + sgn * A
            ex, ey = sx + la * math.cos(a1), sy + la * math.sin(a1)
            a2 = math.atan2(wy - ey, wx - ex)
            cands.append((ey, a1, a2))
        cands.sort()
        ey, a1, a2 = cands[0] if elbow == "down" else cands[-1]
        best = (a1, a2)
        ux, uy = math.cos(a2), math.sin(a2)
    q = dict(pose)
    q[f"ua_{side}"] = rig_angle(math.cos(best[0]), math.sin(best[0]), facing)
    q[f"fa_{side}"] = rig_angle(math.cos(best[1]), math.sin(best[1]), facing)
    return q


def head_at(J, st, u, v):
    """Point on the rig head: u along the face direction, v along the head's up (head radii)."""
    hx, hy = J["head"]
    r = st.head_r * J["scale"]
    f = J["facing"]
    hd = J["head_dir"]
    fwd = (hd[1] * f, -hd[0] * f)
    return (hx + (fwd[0] * u + hd[0] * v) * r, hy + (fwd[1] * u + hd[1] * v) * r)


def frame_dirs(J):
    """(spine unit vector pelvis->chest, front unit vector) of a solved figure."""
    px, py = J["pelvis"]
    cx, cy = J["chest"]
    L = math.hypot(cx - px, cy - py) or 1e-6
    sd = ((cx - px) / L, (cy - py) / L)
    f = J["facing"]
    front = (sd[1] * f, -sd[0] * f)
    return sd, front


def torso_pt(J, st, along, out):
    """Point on the torso: `along` 0 (pelvis) .. 1 (chest), `out` metres toward the front."""
    _, front = frame_dirs(J)
    px, py = J["pelvis"]
    cx, cy = J["chest"]
    s = J["scale"]
    return (px + (cx - px) * along + front[0] * out * s, py + (cy - py) * along + front[1] * out * s)


def soles_offset(st, pose, facing=1, scale=1.0):
    """Pelvis height above the lowest foot point for this pose."""
    J = solve(st, pose, 0.0, 0.0, facing, scale, "side")
    return -min(J["an_n"][1], J["an_f"][1], J["toe_n"][1], J["toe_f"][1])


def pelvis_for_torso(st, pose, tx, ty, facing, scale=1.0):
    """Pelvis position that puts the torso centre at (tx, ty)."""
    lean = math.radians(pose["lean"])
    k = 0.5 * st.spine * scale
    return tx - math.sin(lean) * facing * k, ty - math.cos(lean) * k


def _draw(fr, st, pose, x, y, facing, o, depth, scale, halo, halo_col, rim_dir=RIM_W):
    if halo > 0:
        off = halo / fr.cam.zoom * depth
        for dx, dy in ((off, 0), (-off, 0), (0, off), (0, -off)):
            draw_fighter(fr, st, pose, x + dx, y + dy, facing, scale=scale, opts=o, depth=depth,
                         silhouette=halo_col)
    return draw_fighter(fr, st, pose, x, y, facing, scale=scale, opts=o, depth=depth, rim_dir=rim_dir)


def gojo(fr, pose, x, y, facing=1, depth=1.0, scale=1.0, void=False, halo=0.0, switch=None, style=None, **kw):
    kw.setdefault("mouth", "flat")
    o = C.opts(fr, "gojo", switch=switch, **kw)
    st = style or (GOJO_V if void else GOJO_W)
    return _draw(fr, st, pose, x, y, facing, o, depth, scale, halo, HALO_V if void else HALO_G)


def thragg(fr, pose, x, y, facing=-1, depth=1.0, scale=1.0, void=False, halo=0.0, switch=None, style=None, **kw):
    o = C.opts(fr, "thragg", switch=switch, **kw)
    st = style or (THRAGG_V if void else THRAGG)
    return _draw(fr, st, pose, x, y, facing, o, depth, scale, halo, HALO_V if void else HALO_T)


def thragg_turned_style(turn, void=True):
    """The Blue twists his torso ~50 deg toward camera/Gojo: in profile the
    chest reads wider as the flank swings open."""
    base = THRAGG_V if void else THRAGG
    return replace(base, w_chest=base.w_chest * (1 + 0.24 * turn), w_waist=base.w_waist * (1 + 0.16 * turn))


# ---- poses ------------------------------------------------------------------
LEGS_HANG = dict(th_n=10, sh_n=-16, th_f=-8, sh_f=-30)
G_HOVER = P("g_idle", lean=3, neck=0, ua_n=8, fa_n=2, ua_f=-4, fa_f=-6, hand_n="open", hand_f="open", **LEGS_HANG)
G_SIGN = P(G_HOVER, ua_n=34, fa_n=160, hand_n="sign")
G_GLIDE = P(G_HOVER, lean=22, neck=-6, ua_n=-10, fa_n=-6, ua_f=-16, fa_f=-12, th_n=-14, sh_n=-26, th_f=-22,
            sh_f=-34)
G_POINT2 = P(G_HOVER, lean=6, ua_n=84, fa_n=92, hand_n="point")
G_SET = P(G_HOVER, lean=10, neck=2, ua_n=20, fa_n=34, ua_f=-10, fa_f=10, th_n=20, sh_n=-12, th_f=-4, sh_f=-26)
G_SPEAR_WIND = P(G_SET, lean=2, neck=0, ua_n=-50, fa_n=40, hand_n="point", ua_f=40, fa_f=110, th_n=26, sh_n=-10)
G_SPEAR = P(G_SET, lean=22, neck=-4, ua_n=88, fa_n=90, hand_n="point", ua_f=-30, fa_f=10, th_n=34, sh_n=-6,
            th_f=-14, sh_f=-34)
G_TIRED = P(G_HOVER, lean=9, neck=8, ua_n=6, fa_n=0, ua_f=-4, fa_f=-6)

T_HANG = P("t_stand", lean=4, neck=2, ua_n=16, fa_n=24, ua_f=-6, fa_f=2, hand_f="open",
           th_n=14, sh_n=-18, th_f=-6, sh_f=-30)
T_CROUCH = P(T_HANG, lean=10, neck=12, ua_n=22, fa_n=40, th_n=30, sh_n=-20, th_f=6, sh_f=-34)
T_BACKUP = P(T_HANG, lean=-8, neck=6, th_n=28, sh_n=4, th_f=10, sh_f=-14)
T_FLY = P("t_fly_punch", lean=78, neck=-24, ua_n=40, fa_n=80, ua_f=60, fa_f=96, th_n=-64, sh_n=-92, th_f=-80,
          sh_f=-110, hand_f="fist")
T_BRAKE = P("t_stand", lean=-36, neck=-40, ua_n=20, fa_n=110, ua_f=60, fa_f=70, th_n=62, sh_n=22, th_f=40,
            sh_f=-4, hand_f="open")
T_COIL = P(T_HANG, lean=16, neck=10, ua_n=26, fa_n=118, ua_f=-78, fa_f=40, hand_f="open",
           th_n=66, sh_n=-14, th_f=50, sh_f=-34)
T_COMPRESS = P(T_COIL, lean=22, neck=14, th_n=78, sh_n=-20, th_f=60, sh_f=-40)
T_LUNGE = P(T_HANG, lean=50, neck=-22, ua_n=-34, fa_n=-24, ua_f=-150, fa_f=40, hand_f="open",
            th_n=-18, sh_n=-52, th_f=-46, sh_f=-84)


def t_reaching(base, J_target, x, y, scale=1.0):
    """T_LUNGE with the right (far) hand reaching toward a world point."""
    return reach(THRAGG, P(base, hand_f="claw"), x, y, -1, "f", J_target, scale=scale, elbow="down")


# =============================================================================
# drawing helpers
# =============================================================================

def capture(fr, fn):
    """Run fn() drawing into a fresh RGBA layer instead of the frame. Returns (layer, result)."""
    base, base_draw = fr.img, fr.draw
    layer = Image.new("RGBA", (fr.W, fr.H), (0, 0, 0, 0))
    fr.img, fr.draw = layer, ImageDraw.Draw(layer)
    try:
        res = fn()
    finally:
        fr.img, fr.draw = base, base_draw
    return layer, res


def paste(fr, layer, blur=0.0, alpha=1.0):
    if blur > 0.25:
        layer = layer.filter(ImageFilter.GaussianBlur(blur * fr.ss))
    if alpha < 0.999:
        a = layer.getchannel("A").point(lambda v, k=alpha: int(v * k))
        layer.putalpha(a)
    fr.img.paste(layer, (0, 0), layer)


def soft_draw(fr, fn, radius=2.0, alpha=1.0):
    layer, res = capture(fr, fn)
    paste(fr, layer, radius, alpha)
    return res


def tint_layer(layer, mul=(0.82, 0.9, 1.08), add=(0, 4, 16)):
    arr = np.asarray(layer).astype(np.float32)
    arr[..., 0] = arr[..., 0] * mul[0] + add[0]
    arr[..., 1] = arr[..., 1] * mul[1] + add[1]
    arr[..., 2] = arr[..., 2] * mul[2] + add[2]
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGBA")


def silhouette(fr, layer, fill, rim=None, rim_off=(-3.0, -2.0), blur=0.0, alpha=1.0):
    """Composite the shape of `layer` as a flat silhouette with an offset rim."""
    a = layer.getchannel("A")
    if blur > 0.25:
        a = a.filter(ImageFilter.GaussianBlur(blur * fr.ss))
    if alpha < 0.999:
        a = a.point(lambda v, k=alpha: int(v * k))
    if rim is not None:
        ra = ImageChops.offset(a, int(rim_off[0] * fr.ss), int(rim_off[1] * fr.ss))
        fr.img.paste(Image.new("RGB", a.size, rim), (0, 0), ra)
    fr.img.paste(Image.new("RGB", a.size, fill), (0, 0), a)


def bake_glow(fr):
    """Composite the additive glow layer into the frame NOW (exactly as
    Frame.finish() would) and clear it, so subjects drawn afterwards sit on
    top of the light instead of under it. fx.domain_void puts its spiral,
    streams and vanishing-point glow in fr.glow; unbaked, they would be
    screened over the fighters' faces and bodies at finish()."""
    if fr.glow_img is None:
        return
    W, H = fr.W, fr.H
    g = fr.glow_img
    small = g.resize((W // 8, H // 8), Image.BILINEAR)
    soft = small.filter(ImageFilter.GaussianBlur(5)).resize((W, H), Image.BILINEAR)
    wide = small.filter(ImageFilter.GaussianBlur(18)).resize((W, H), Image.BILINEAR)
    img = ImageChops.screen(fr.img, g)
    img = ImageChops.screen(img, soft)
    img = ImageChops.screen(img, wide)
    fr.img = img
    fr.draw = ImageDraw.Draw(img)
    fr.glow_img = None


def bake_soft(fr):
    """Same for the 1/4-res soft haze layer (env.sky's sun glow), so a
    foreground silhouette drawn afterwards is not washed out by it."""
    if fr.soft_img is None:
        return
    s = fr.soft_img.filter(ImageFilter.GaussianBlur(fr.soft_img.size[1] / 14))
    fr.img = ImageChops.screen(fr.img, s.resize((fr.W, fr.H), Image.BILINEAR))
    fr.draw = ImageDraw.Draw(fr.img)
    fr.soft_img = None


def bake(fr):
    bake_glow(fr)
    bake_soft(fr)


def impact_scaled(fr, x, y, t, kind="light", k=0.3, salt="imp", dirx=1.0):
    """fx.impact drawn at k x its size, centred on (x, y) (for close shots,
    where the tier's metre-sized star would cover the whole contact)."""
    c = fr.cam
    fr.cam = Cam(x - (x - c.x) / k, y - (y - c.y) / k, c.zoom * k, c.rot, c.shake)
    try:
        fx.impact(fr, x, y, t, kind=kind, salt=salt, dirx=dirx)
    finally:
        fr.cam = c


def sign_hand(L, form=1.0, skin=None, sleeve=None, dark=None):
    """Gojo's right hand for the domain sign, insert coords (fingers up):
    index and middle extended; form 0 = side by side, 1 = the middle finger
    crossed over the index (canon one-hand sign), tips ending close together."""
    skin = skin or GOJO.skin
    sleeve = sleeve or GOJO.suit
    dark = dark or shade(skin, 0.78)
    L.poly([(-0.44, 0.92), (0.32, 0.92), (0.42, 1.8), (-0.62, 1.8)], sleeve)
    L.poly([(-0.36, 0.04), (0.26, 0.0), (0.34, 0.5), (0.12, 0.96), (-0.34, 0.96), (-0.44, 0.45)], skin)
    L.poly([(-0.36, 0.04), (-0.44, 0.45), (-0.34, 0.96), (-0.22, 0.5)], dark)
    # ring + little fingers curled into the palm
    L.ell(0.22, 0.16, 0.13, 0.1, fill=dark)
    L.ell(0.24, 0.36, 0.12, 0.09, fill=dark)

    def finger(base, tip, w, col):
        bx, by = base
        tx, ty = tip
        dx, dy = tx - bx, ty - by
        Ln = math.hypot(dx, dy) or 1e-6
        nx, ny = -dy / Ln * w / 2, dx / Ln * w / 2
        L.poly([(bx + nx, by + ny), (tx + nx * 0.85, ty + ny * 0.85), (tx - nx * 0.85, ty - ny * 0.85),
                (bx - nx, by - ny)], col)
        L.ell(tx, ty, w * 0.43, w * 0.43, fill=col)
    f = clamp(form)
    idx_tip = (lerp(-0.2, 0.0, f), lerp(-0.92, -0.88, f))
    mid_tip = (lerp(0.04, -0.15, f), lerp(-1.04, -0.97, f))
    finger((-0.2, 0.06), idx_tip, 0.16, shade(skin, 0.9))
    finger((0.03, 0.04), mid_tip, 0.165, skin)
    if f > 0.5:
        mx, my = lerp(0.03, mid_tip[0], 0.55), lerp(0.04, mid_tip[1], 0.55)
        L.line([(mx - 0.07, my + 0.02), (mx + 0.07, my - 0.01)], dark, 0.012)
    # thumb pinning the curled fingers
    L.poly([(-0.4, 0.42), (-0.12, 0.2), (0.18, 0.26), (0.16, 0.36), (-0.1, 0.36), (-0.36, 0.56)], skin)
    L.line([(-0.12, 0.27), (0.14, 0.31)], dark, 0.01)
    return L.p(*lerp(idx_tip, mid_tip, 0.5))


def s2w(fr, u, v, d=1.0):
    c = fr.cam
    return (c.x + (u * OUT_W - OUT_W / 2) * d / c.zoom, c.y - (v * OUT_H - OUT_H / 2) * d / c.zoom)


def w2s(fr, x, y, d=1.0):
    px, py = fr.P(x, y, d)
    return px / fr.W, py / fr.H


def specks(fr, t, n=40, salt="specks", col=(150, 130, 120), drift=(-0.01, 0.006), size=(0.0015, 0.004),
           alpha=200):
    """Screen-space drifting dust specks (close-ups)."""
    rng = fr.srng(salt)
    img, dr = fr.layer()
    for i in range(n):
        u = (rng.random() + drift[0] * t * rng.uniform(0.5, 1.5)) % 1.0
        v = (rng.random() + drift[1] * t * rng.uniform(0.5, 1.5)) % 1.0
        r = rng.uniform(*size) * fr.H
        a = int(alpha * rng.uniform(0.4, 1.0))
        dr.ellipse([u * fr.W - r, v * fr.H - r, u * fr.W + r, v * fr.H + r], fill=col + (a,))
    fr.merge(img)


def radial_shade(fr, X, Y, R, col, a_max, steps=12):
    if a_max <= 0 or R <= 1:
        return
    img, dr = fr.layer()
    for i in range(steps):
        k = 1 - i / steps
        rr = R * k
        a = int(a_max * (1 - k) ** 0.9 / steps * 2.2) if i else int(a_max / steps)
        dr.ellipse([X - rr, Y - rr, X + rr, Y + rr], fill=col + (min(255, a),))
    fr.merge(img)


def smoke_soft(fr, tg, state, alpha=110, lit=1.0):
    """env.smoke_columns, but translucent (the d=1 column from the gutted tower
    otherwise paints the whole frame flat at the fighters' altitude)."""
    if "smoke" not in state:
        return
    sources = [(40, 1.9), (55, 3.0), (95, 1.0)]
    if "purple_scar" in state:
        sources += [(200, 3.0), (320, 5.0), (140, 3.0)]
    sm = []
    for i, (sx, d) in enumerate(sources):
        for k in range(16):
            age = (tg * 0.12 + k / 16) % 1.0
            y = age * 220
            x = sx + math.sin(age * 5 + i) * 12 + age * 60
            r = 8 + age * 40
            c = shade(mix_color((60, 54, 60), PAL["sky_mid"], age * 0.7), lit)
            X, Y = fr.P(x, y, d)
            R = fr.S(r, d)
            if X + R < 0 or X - R > fr.W or Y + R < 0 or Y - R > fr.H:
                continue
            sm.append((X, Y, R, R, c, alpha * 0.6 * (1 - 0.55 * age)))
    soft_blobs(fr, sm, 2.0)


def purple_afterglow(fr, fade):
    """Violet afterglow on the cut edges of Purple's channel (skyline layers d=5, 8)."""
    if fade <= 0.01:
        return
    for d in (5.0, 8.0):
        x0, x1 = env.SCAR["x0"] * d / 5.0, env.SCAR["x1"] * d / 5.0
        pts_lo = [(x0 + (x1 - x0) * k / 12, env.SCAR["y0"] + 30 * (1 - k / 12) - 2) for k in range(13)]
        fr.glow_line(pts_lo, shade((120, 50, 190), fade), width_px=7, d=d)


def sky_plate(fr, lit=1.0, smoke_alpha=95, tower_d=1.0, haze=0.0, blur=0.0, shafts=1.0, glow=0.22):
    """High-altitude backdrop with Seq 6's damage state."""
    st = C.state(SEQ)
    tg = C.tg(fr)
    env.sky(fr, lit)
    env.clouds(fr, tg, lit=lit)

    def city():
        env.river(fr, lit)
        env.skyline(fr, st, layers=(0, 1, 2, 3), lit=lit, haze=haze)
    if blur > 0:
        soft_draw(fr, city, radius=blur)
    else:
        city()
    purple_afterglow(fr, glow)
    env.unfinished_tower(fr, lit=lit, gutted=True, d=tower_d)
    smoke_soft(fr, tg, st, smoke_alpha, lit)
    env.light_shafts(fr, st, strength=shafts)
    return st


# ---- the Purple dust plume ---------------------------------------------------
_PLUME = None


def plume_blobs():
    """Deterministic volumetric blob model of Purple's dust plume (world metres,
    x=+50..+130, y=165..260 at S6-01 f0; z = depth offset, + = behind)."""
    global _PLUME
    if _PLUME is not None:
        return _PLUME
    rng = random.Random("s6-plume")
    out = []
    for i in range(120):
        x = rng.uniform(54, 126)
        hu = rng.random() ** 1.25
        y = 172 + hu * 78
        # narrower toward the crown, a flat dense belly underneath
        half = 40 * (1 - 0.45 * hu)
        if abs(x - 90) > half:
            x = 90 + math.copysign(half * rng.uniform(0.6, 1.0), x - 90)
        r = rng.uniform(8, 17) * (1.15 - 0.35 * hu)
        out.append(dict(x=x, y=y, z=rng.uniform(-1, 1), r=r, ph=rng.uniform(0, math.tau),
                        sh=rng.uniform(0.82, 1.12), a=rng.uniform(0.75, 1.0)))
    # the belly: a band of heavier puffs along the underside
    for i in range(26):
        x = 56 + i * 2.8 + rng.uniform(-1.5, 1.5)
        out.append(dict(x=x, y=rng.uniform(166, 174), z=rng.uniform(-1, 1), r=rng.uniform(7, 11),
                        ph=rng.uniform(0, math.tau), sh=rng.uniform(0.62, 0.82), a=rng.uniform(0.85, 1.0)))
    out.sort(key=lambda b: -b["z"])
    _PLUME = out
    return out


def plume_state(b, tt, tear=None):
    """Animated blob (x, y, r) at plume time tt: drifting west 2 m/s, churning;
    `tear` = (x, y, t_since, R): blobs shoved away from a burst point."""
    x = b["x"] - 2.0 * tt + math.sin(tt * 0.45 + b["ph"]) * 1.6
    y = b["y"] + math.cos(tt * 0.33 + b["ph"] * 1.3) * 1.1
    r = b["r"] * (1 + 0.06 * math.sin(tt * 0.7 + b["ph"]))
    if tear is not None:
        tx, ty, ts, R = tear
        if ts > 0:
            dx, dy = x - tx, y - ty
            dd = math.hypot(dx, dy) or 1e-6
            if dd < R:
                k = (1 - dd / R) * EASE["out"](clamp(ts / 0.5))
                x += dx / dd * k * R * 0.55
                y += dy / dd * k * R * 0.55
                r *= 1 - 0.3 * k
    return x, y, r


def plume_color(b, y, lit=1.0):
    hu = clamp((y - 165) / 95)
    base = mix_color((70, 60, 62), (132, 112, 98), 0.25 + 0.6 * hu)
    return shade(base, b["sh"] * lit)


def soft_blobs(fr, blobs, blur=2.5):
    """Translucent ellipses that ACCUMULATE (blended draw on a copy of the
    frame), then pasted back through a softened coverage mask. (Drawing
    translucent shapes into one fr.layer() replaces pixels instead of
    blending, which turns a volumetric mass into a stack of hard discs.)
    blobs: [(X, Y, Rx, Ry, (r, g, b), alpha 0..255)] in pixels."""
    if not blobs:
        return
    canvas = fr.img.copy()
    dr = ImageDraw.Draw(canvas, "RGBA")
    mask = Image.new("L", (fr.W, fr.H), 0)
    md = ImageDraw.Draw(mask)
    for X, Y, rx, ry, c, a in blobs:
        dr.ellipse([X - rx, Y - ry, X + rx, Y + ry], fill=tuple(c) + (int(a),))
        md.ellipse([X - rx, Y - ry, X + rx, Y + ry], fill=255)
    if blur > 0.25:
        canvas = canvas.filter(ImageFilter.GaussianBlur(blur * fr.ss))
        mask = mask.filter(ImageFilter.GaussianBlur(blur * fr.ss))
    fr.img.paste(canvas, (0, 0), mask)


def draw_plume(fr, tt, zsel=None, alpha=1.0, tear=None, d=1.0, lit=1.0, blur=2.5):
    """The plume in the engine's side-on world. zsel: 'back' (z>=0) / 'front' (z<0) / None."""
    out = []
    for b in plume_blobs():
        if zsel == "back" and b["z"] < 0:
            continue
        if zsel == "front" and b["z"] >= 0:
            continue
        x, y, r = plume_state(b, tt, tear)
        X, Y = fr.P(x, y, d)
        R = fr.S(r, d)
        if X + R < 0 or X - R > fr.W or Y + R < 0 or Y - R > fr.H:
            continue
        c = plume_color(b, y, lit)
        out.append((X, Y, R, R * 0.86, c, 120 * b["a"] * alpha))
        # warm west-side (sunset) lick on the upper puffs
        if y > 190:
            out.append((X - R * 0.5, Y - R * 0.35, R * 0.45, R * 0.45, (150, 104, 80), 36 * b["a"] * alpha))
    soft_blobs(fr, out, blur)


def blood_ribbons(fr, J, t, d=1.0, length=3.5, n_pts=7, width_px=1.6, wind=(1.0, 0.15), salt="rib"):
    """Blood ribbons streaming downwind from the flank, ear and stump."""
    rng = fr.srng(salt)
    srcs = [torso_pt(J, THRAGG, 0.5, 0.05), head_at(J, THRAGG, -0.2, 0.0), J["el_n"]]
    for i, (sx, sy) in enumerate(srcs):
        L = length * rng.uniform(0.6, 1.0)
        pts = []
        for k in range(n_pts):
            u = k / (n_pts - 1)
            wob = math.sin(t * 7 + u * 5 + i * 2) * 0.12 * L * u
            pts.append((sx + wind[0] * L * u, sy + wind[1] * L * u + wob - 0.3 * L * u * u))
        fr.line(pts, (150, 14, 22), width_px=width_px, d=d)


# =============================================================================
# eye / face insert helpers
# =============================================================================

def neck_blindfold(L, y=0.62):
    """Gojo's blindfold pulled down around his neck (insert coords)."""
    L.poly([(-0.34, y - 0.02), (0.26, y - 0.06), (0.3, y + 0.04), (-0.36, y + 0.09)], GOJO.accent)
    L.line([(-0.34, y + 0.0), (0.27, y - 0.04)], (40, 40, 52), 0.008)


def jacket_tear(L):
    """Torn, bloodstained left shoulder of the uniform (far side in 3/4)."""
    L.poly([(-0.62, 0.86), (-0.42, 0.8), (-0.36, 0.98), (-0.5, 1.08), (-0.66, 1.0)], (92, 26, 32))
    L.line([(-0.6, 0.88), (-0.44, 0.84), (-0.4, 0.96)], (150, 40, 46), 0.01)


def _almond(ex, ey, rx, ry_u, ry_l, n=16):
    up = [(ex + rx * math.cos(math.pi * (1 - k / n)), ey - ry_u * math.sin(math.pi * (1 - k / n))) for k in range(n + 1)]
    lo = [(ex + rx * math.cos(math.pi * k / n), ey + ry_l * math.sin(math.pi * k / n)) for k in range(n + 1)]
    return up, lo


def six_eyes_field(dr, X, Y, R, t, k, coil=0.0, snap=0.0, gone=0.0, salt="sef"):
    """What the Six Eyes read in the plume, played across the iris (S1-06's
    grammar): a navy field of faint flowing contour lines that crowd and bend
    around a dense man-shaped mass wrapped in a faint, flickering haze.
    coil 0..1 tightens the haze; snap 0..1 fires it down-left (a bright streak)."""
    if k <= 0.01:
        return
    dr.ellipse([X - R, Y - R, X + R, Y + R], fill=(8, 22, 62, int(120 * k)))
    mx, my = X + 0.5 * R, Y - 0.24 * R
    # after the snap, the mass has gone down-left
    sx = lerp(mx, X - 0.62 * R, EASE["out"](snap))
    sy = lerp(my, Y + 0.5 * R, EASE["out"](snap))
    rx, ry = 0.17 * R * (1 - 0.25 * coil), 0.3 * R * (1 - 0.15 * coil)
    flow = (t * 0.7) % 1.0
    N = 15
    for i in range(N):
        v0 = -1.05 + 2.1 * (i + 0.5) / N
        pts = []
        for j in range(41):
            u = -1.1 + 2.2 * j / 40
            du, dv = (X + u * R - sx) / R, (Y + v0 * R - sy) / R
            env_ = math.exp(-0.5 * (du / (rx / R * 1.6)) ** 2)
            a_ = abs(dv) / (ry / R)
            push = (1 if dv >= 0 else -1) * (ry / R) * env_ * 1.1 / (a_ + 1.1)
            wav = 0.012 * math.sin(u * 9 + i + t * 3)
            pts.append((X + u * R, Y + (v0 + push + wav) * R))
        dense = math.exp(-((Y + v0 * R - sy) / (ry * 1.6)) ** 2)
        col = mix_color((46, 96, 190), (130, 190, 255), dense)
        dr.line(pts, fill=col + (int((70 + 110 * dense) * k),), width=max(1, int(R * 0.008 + dense * R * 0.006)))
        for q in range(3):
            jj = int(((q / 3 + flow + i * 0.17) % 1.0) * 39)
            dr.line([pts[40 - jj], pts[max(0, 40 - jj - 1)]], fill=(190, 228, 255, int(110 * k)),
                    width=max(1, int(R * 0.012)))
    # the haze: civilian-level, thin, flickering
    fl = random.Random(f"{salt}{int(t * 12)}").uniform(0.5, 1.0)
    for s_, a_ in ((1.6, 18), (1.3, 26), (1.08, 34)):
        hr = s_ * (1 - 0.35 * coil)
        dr.ellipse([sx - rx * hr, sy - ry * hr, sx + rx * hr, sy + ry * hr],
                   fill=(140, 190, 245, int(a_ * fl * k * (1 + 0.8 * coil) * (1 - gone))))
    # the dense mass (man-shaped)
    mk = k * (1 - gone)
    if mk > 0.02:
        dr.ellipse([sx - rx * 0.55, sy - ry * 0.5, sx + rx * 0.55, sy + ry * 0.75], fill=(4, 10, 30, int(200 * mk)))
        dr.ellipse([sx - rx * 0.3, sy - ry * 0.98, sx + rx * 0.3, sy - ry * 0.55], fill=(4, 10, 30, int(200 * mk)))
    if coil > 0.05 and snap <= 0:
        # the coil: the haze winds tight around the mass
        pts = []
        for j in range(30):
            a = j * 0.5 + t * 6
            rr = rx * (1.2 - 0.8 * j / 30) * (1 - 0.3 * coil)
            pts.append((sx + math.cos(a) * rr, sy + math.sin(a) * rr * 1.5))
        dr.line(pts, fill=(170, 210, 255, int(120 * coil * k)), width=max(1, int(R * 0.01)))
    if 0 < snap < 1.6:
        # THE streak: the only bright mark, down and west
        a = clamp(1.6 - snap)
        x0, y0 = mx + 0.05 * R, my - 0.02 * R
        x1, y1 = X - 1.05 * R, Y + 0.86 * R
        head = clamp(snap)
        hx, hy = lerp(x0, x1, head), lerp(y0, y1, head)
        dr.line([(x0, y0), (hx, hy)], fill=(160, 210, 255, int(90 * a * k)), width=max(1, int(R * 0.12)))
        dr.line([(x0, y0), (hx, hy)], fill=(200, 232, 255, int(150 * a * k)), width=max(1, int(R * 0.06)))
        dr.line([(x0, y0), (hx, hy)], fill=(255, 255, 255, int(255 * a * k)), width=max(1, int(R * 0.022)))


def gojo_eye(fr, L, ex, ey, sz, lid=0.0, gaze=(0.0, 0.0), veins=0.8, glow=1.0, salt="gv", field=None,
             skin_patch=True):
    """Gojo's eye drawn over gojo_face (insert coords): almond sclera with
    bloodshot veins, crystalline blue iris (clipped by the lids), pupil,
    glint, white lashes. lid 0..1 narrows the eye. field = dict for
    six_eyes_field() inside the iris."""
    rx, ry = 0.125 * sz, 0.072 * sz
    ry_u = ry * (1 - 0.55 * lid)
    ry_l = ry * (1 - 0.18 * lid)
    if skin_patch:
        L.ell(ex, ey, rx * 1.06, ry * 1.2, fill=GOJO.skin)
    up, lo = _almond(ex, ey, rx, ry_u, ry_l)
    almond = up + lo[1:-1]
    L.poly(almond, (238, 246, 252))
    rng = random.Random(salt)
    if veins > 0:
        for j in range(12):
            side = 1 if j % 2 else -1
            y0 = ey + rng.uniform(-0.5, 0.6) * ry_l
            x0 = ex + side * rx * 0.94
            ln = rx * rng.uniform(0.25, 0.5) * veins
            pts = [(x0, y0)]
            wig = rng.uniform(0, 6)
            for q in range(1, 6):
                u = q / 5
                pts.append((x0 - side * ln * u, y0 + math.sin(u * 4 + wig) * ry * 0.1 + (ey - y0) * 0.25 * u))
            L.line(pts, (196, 52, 64), 0.0019 * sz)
            if j % 3 == 0:
                m = pts[2]
                L.line([m, (m[0] - side * ln * 0.3, m[1] + 0.25 * ry)], (205, 80, 90), 0.0013 * sz)
    # iris layer, clipped by the lids
    ix, iy = ex + 0.012 * sz + gaze[0] * 0.045 * sz, ey + gaze[1] * 0.022 * sz
    ir = 0.066 * sz
    canvas = Image.new("RGB", (fr.W, fr.H), (0, 0, 0))
    dr = ImageDraw.Draw(canvas, "RGBA")
    X, Y = L.p(ix, iy)
    R = ir * 0.5 * fr.H * L.s
    dr.ellipse([X - R, Y - R, X + R, Y + R], fill=(28, 128, 222))
    dr.ellipse([X - R * 0.86, Y - R * 0.86, X + R * 0.86, Y + R * 0.86], fill=(66, 192, 255))
    for k in range(40):
        a = k * math.tau / 40 + 0.13
        r0, r1 = R * 0.3, R * 0.9
        col = (150, 226, 255, 170) if k % 2 else (30, 140, 230, 220)
        dr.line([(X + math.cos(a) * r0, Y + math.sin(a) * r0), (X + math.cos(a) * r1, Y + math.sin(a) * r1)],
                fill=col, width=max(1, int(R * 0.014)))
    dr.ellipse([X - R, Y - R, X + R, Y + R], outline=(14, 70, 140), width=max(1, int(R * 0.05)))
    if field is not None:
        six_eyes_field(dr, X, Y, R * 0.9, **field)
    pr = R * 0.26
    dr.ellipse([X - pr, Y - pr, X + pr, Y + pr], fill=(10, 34, 70))
    gx, gy = X - R * 0.32, Y - R * 0.34
    dr.ellipse([gx - R * 0.13, gy - R * 0.1, gx + R * 0.13, gy + R * 0.1], fill=(250, 254, 255))
    mask = Image.new("L", (fr.W, fr.H), 0)
    ImageDraw.Draw(mask).polygon([L.p(px, py) for px, py in almond], fill=255)
    disc = Image.new("L", (fr.W, fr.H), 0)
    ImageDraw.Draw(disc).ellipse([X - R, Y - R, X + R, Y + R], fill=255)
    fr.img.paste(canvas, (0, 0), ImageChops.multiply(mask, disc))
    if glow > 0.01:
        L.glow(ix, iy, 0.16 * sz, shade((30, 110, 210), glow))
    # upper lid line + white lashes (warm rim from screen-left)
    L.line(up, shade(GOJO.skin, 0.5), 0.008 * sz)
    for k in range(13):
        a = math.pi * (1 - (k + 0.5) / 13)
        px, py = ex + rx * math.cos(a), ey - ry_u * math.sin(a)
        col = mix_color(GOJO.hair, (255, 196, 140), 0.55 if k < 4 else 0.0)
        ln = 0.032 * sz * (0.6 + 0.4 * math.sin(a))
        L.line([(px, py), (px + ln * math.cos(a) * 0.7 - 0.004 * sz, py - ln)], col, 0.0032 * sz)
    L.line(lo, shade(GOJO.skin, 0.72), 0.0035 * sz)


def thragg_eye_detail(fr, L, ex, ey, open_h=0.05, pupil=0.35, gaze=(0.0, 0.0), streaks=1.0, t=0.0, frozen=False,
                      cloud=0.0, salt="te", rx=0.11):
    """A detailed Thragg eye in insert coords: dark-brown iris, pupil of
    variable size (0..1 of the iris), light streaks pouring INTO the pupil
    from every direction (information, not Blue's pull), clouding."""
    L.ell(ex, ey, rx, open_h + 0.012, fill=(214, 206, 206))
    ix, iy = ex + 0.02 + gaze[0] * 0.03, ey + gaze[1] * 0.012
    ir = min(0.042, open_h + 0.008)
    L.ell(ix, iy, ir, ir, fill=(70, 44, 30))
    L.ell(ix, iy, ir * 0.62, ir * 0.62, fill=(46, 28, 20))
    pr = ir * clamp(pupil, 0.08, 0.95)
    L.ell(ix, iy, pr, pr, fill=(8, 6, 8))
    if cloud > 0:
        img, dr = fr.layer()
        X, Y = L.p(ix, iy)
        RR = ir * 0.5 * fr.H * L.s
        dr.ellipse([X - RR, Y - RR, X + RR, Y + RR], fill=(200, 214, 236, int(110 * cloud)))
        fr.merge(img)
    if streaks > 0:
        rng = random.Random(salt)
        phase_t = t
        for i in range(40):
            a = rng.uniform(0, math.tau)
            sp = rng.uniform(0.8, 1.6)
            z = (rng.random() + phase_t * sp * 1.8) % 1.0
            r0 = ir * (4.2 - 3.8 * z)
            r1 = max(pr * 0.4, r0 - ir * (0.5 + 0.5 * z))
            col = mix_color((120, 180, 255), (255, 255, 255), rng.random() * 0.6)
            p0 = (ix + math.cos(a) * r0, iy + math.sin(a) * r0 * 0.75)
            p1 = (ix + math.cos(a) * r1, iy + math.sin(a) * r1 * 0.75)
            X0, Y0 = L.p(*p0)
            X1, Y1 = L.p(*p1)
            fr.glow.line([(X0, Y0), (X1, Y1)], fill=shade(col, streaks * (0.4 + 0.6 * z) * (0.5 if frozen else 1.0)),
                         width=max(1, int(fr.ss * (1.5 + 1.5 * z))))
            fr.draw.line([(X0, Y0), (X1, Y1)], fill=mix_color((40, 30, 30), col, streaks * (0.6 if frozen else 0.9)),
                         width=max(1, int(fr.ss * 1.2)))
    L.ell(ix - ir * 0.35, iy - ir * 0.35, ir * 0.18, ir * 0.14, fill=(250, 250, 255))
    L.line([(ex - rx, ey - 0.004), (ex - rx * 0.3, ey - open_h - 0.014), (ex + rx * 0.6, ey - open_h - 0.016),
            (ex + rx, ey - 0.006)], (60, 40, 40), 0.012)


def thragg_ear(L, injured=True, blood=0.0):
    """His torn left ear at the back of the head (insert coords, before flip)."""
    L.poly([(-0.6, -0.22), (-0.5, -0.26), (-0.46, -0.06), (-0.5, 0.12), (-0.6, 0.06)], shade(THRAGG.skin, 0.85))
    if injured:
        L.poly([(-0.6, -0.22), (-0.52, -0.24), (-0.55, -0.12), (-0.62, -0.1)], (110, 16, 24))
        L.line([(-0.58, -0.2), (-0.53, -0.08)], (150, 14, 22), 0.012)
    if blood > 0:
        L.line([(-0.53, 0.08), (-0.54, 0.08 + 0.5 * blood), (-0.52, 0.1 + 0.62 * blood)], (150, 10, 20), 0.014)


def plate_bg(fr, top=(26, 24, 38), bottom=(74, 54, 60), warm_side=-1):
    inserts._bg(fr, top, bottom, bokeh=False)
    img, dr = fr.layer()
    wu = 0.05 if warm_side < 0 else 0.95
    for k in range(6):
        r = (0.9 - k * 0.12) * fr.H
        dr.ellipse([wu * fr.W - r, 0.85 * fr.H - r, wu * fr.W + r, 0.85 * fr.H + r], fill=(150, 86, 60, 16))
    fr.merge(img)


def void_bg(fr, intensity=1.0, info=1.0, center=(0.5, 0.5), t_off=0.0, blur=0.0, rate=1.0):
    """Unlimited Void interior as the plate: fx.domain_void, its glow baked in
    (so it stays BEHIND the fighters), optionally defocused."""
    tv = void_time(fr) * rate + t_off
    fx.domain_void(fr, tv, intensity=intensity, center=center, info=info)
    bake_glow(fr)
    if blur > 0.25:
        fr.img = fr.img.filter(ImageFilter.GaussianBlur(blur * fr.ss))
        fr.draw = ImageDraw.Draw(fr.img)


def void_stars(fr, t, n=120, d_rng=(1.3, 4.0), x_rng=(-10, 10), y_rng=(-6, 12), salt="vs", col=(200, 220, 255)):
    """World-locked star specks at several depths: they rise past as the
    camera sinks with a falling body (parallax)."""
    rng = fr.srng(salt)
    for i in range(n):
        d = rng.uniform(*d_rng)
        x = rng.uniform(*x_rng)
        y = rng.uniform(*y_rng)
        X, Y = fr.P(x, y, d)
        if not (-10 < X < fr.W + 10 and -10 < Y < fr.H + 10):
            continue
        r = max(1.0, fr.ss * rng.uniform(0.8, 2.2) / d * 1.5)
        b = rng.uniform(0.4, 1.0)
        fr.draw.ellipse([X - r, Y - r, X + r, Y + r], fill=shade(col, b))


def info_wash(fr, J, st, t, k=1.0, n=40, salt="wash", d=1.0):
    """Streams of luminous information washing over a body (glow dashes)."""
    rng = fr.srng(salt)
    cx, cy = J["chest"]
    for i in range(n):
        a = rng.uniform(0, math.tau)
        z = (rng.random() + t * rng.uniform(0.8, 1.6)) % 1.0
        r0 = 0.1 + z * 1.4
        r1 = r0 + 0.08 + 0.2 * z
        oy = rng.uniform(-0.9, 0.5)
        p0 = (cx + math.cos(a) * r0, cy + oy + math.sin(a) * r0 * 0.6)
        p1 = (cx + math.cos(a) * r1, cy + oy + math.sin(a) * r1 * 0.6)
        col = mix_color((80, 160, 255), (255, 255, 255), rng.random() * 0.6)
        fr.glow_line([p0, p1], shade(col, k * (0.3 + 0.7 * z)), width_px=1 + 2 * z, d=d)


def open_flank(fr, J, st, turn, d=1.0, wound=None, lung=0.0):
    """The flayed left flank swung open toward Gojo by the Blue's turn: raw
    tissue with exposed ribs. wound = (u_along, out) of the spear-hand entry."""
    if turn <= 0.02:
        return
    prev = fr.depth
    fr.depth = d
    s = J["scale"]
    k = clamp(turn)
    pts = []
    for (al, ou) in ((0.12, 0.10), (0.30, 0.17), (0.62, 0.20), (0.86, 0.14), (0.9, -0.02), (0.62, -0.06),
                     (0.3, -0.04), (0.14, 0.0)):
        pts.append(torso_pt(J, st, al, ou * (0.55 + 0.55 * k)))
    fr.poly(pts, (146, 28, 34))
    for j in range(5):
        al = 0.34 + j * 0.11
        a = torso_pt(J, st, al, -0.02 * (0.6 + 0.4 * k))
        b = torso_pt(J, st, al - 0.03, 0.17 * (0.55 + 0.55 * k))
        m = torso_pt(J, st, al + 0.012, 0.08 * (0.55 + 0.55 * k))
        fr.line([a, m, b], (226, 206, 196), width_m=0.022 * s)
        fr.line([torso_pt(J, st, al - 0.05, 0.0), torso_pt(J, st, al - 0.07, 0.15 * (0.55 + 0.55 * k))],
                (84, 10, 18), width_m=0.012 * s)
    if wound is not None:
        wx, wy = torso_pt(J, st, *wound)
        fr.ellipse(wx, wy, 0.06 * s, 0.075 * s, fill=(70, 4, 12))
    if lung > 0:
        wx, wy = torso_pt(J, st, 0.62, 0.12)
        fr.ellipse(wx, wy, 0.05 * s * lung, 0.04 * s * lung, fill=(200, 120, 130))
    fr.depth = prev


def bloody_hand(fr, J, d=1.0):
    """Gojo's right (near) hand and wrist wet with Thragg's blood."""
    prev = fr.depth
    fr.depth = d
    ex, ey = J["el_n"]
    wx, wy = J["wr_n"]
    s = J["scale"]
    mx, my = lerp(ex, wx, 0.55), lerp(ey, wy, 0.55)
    fr.line([(mx, my), (wx, wy)], (120, 10, 20), width_m=GOJO.w_fa * 0.85 * s)
    hx, hy = hand_pos(J, "n", 0.04)
    fr.circle(hx, hy, GOJO.fist * 0.9 * s, fill=(132, 12, 22))
    fr.line([(hx, hy), (hx, hy - 0.06 * s)], (120, 8, 18), width_m=0.012 * s)
    fr.depth = prev


# =============================================================================
# S6-01  EWS: the pause after Purple; Thragg backs up into the dust plume
# =============================================================================

def _s601_thragg(fr, t):
    """Torso centre, pose, alpha for S6-01 (Thragg on 2s hovering, 1s climbing)."""
    t18, t24, t62 = T(fr, 18), T(fr, 24), T(fr, 62)
    tq = t if t >= t24 else on2(fr)
    u = seg(tq, t24, t62, "out")
    tx = lerp(70.0, 82.0, u)
    ty = lerp(140.0, 178.0, seg(tq, t24, t62, "inout") * 0.35 + u * 0.65)
    # the list: a slow 8-degree roll, two corrective trims (torn ear) on the climb
    lst = 8.0 * seg(tq, 0.0, T(fr, 10), "inout") - 5.0 * seg(tq, T(fr, 12), T(fr, 16), "inout")
    lst += 7.0 * pulse(tq, T(fr, 32), T(fr, 3), T(fr, 5)) - 6.0 * pulse(tq, T(fr, 44), T(fr, 3), T(fr, 5))
    breath = math.sin(tq * math.tau / T(fr, 14))
    pose = P(T_HANG, neck=2 + 3 * breath)
    # head turns past Gojo toward the lit city, then back (a few degrees)
    look = pulse(tq, T(fr, 4), T(fr, 5), T(fr, 7))
    pose["neck"] += 9 * look
    if tq >= t18:
        a = seg(tq, t18, T(fr, 23), "in") * (1 - seg(tq, t24, T(fr, 30), "out"))
        pose = pose_at(a, [(0.0, pose), (1.0, P(T_CROUCH, neck=16))])
        ty -= 0.25 * a
    if tq >= t24:
        pose = pose_at(seg(tq, t24, T(fr, 34), "out"), [(0.0, pose), (1.0, P(T_BACKUP, neck=6 + 2 * breath))])
    pose = rot_pose(pose, -lst)
    return tx, ty, pose


READ_SCALE_EWS = 3.0     # animatic readability: figures drawn 3x in the extreme wides (as Seq 5)


def s6_01(fr):
    t = fr.t
    tt = plume_time(fr)
    # locked-off extreme wide; a slow 6 m drift east and a slight tilt up follow the climb
    cx = lerp(28.0, 34.0, seg(t, 0.0, fr.dur, "inout"))
    cy = lerp(172.0, 176.0, seg(t, T(fr, 22), T(fr, 66), "inout"))
    fr.cam = Cam(cx, cy, 12.0)
    sky_plate(fr, smoke_alpha=85, glow=lerp(0.3, 0.2, fr.u))
    # the lit city glowing on the far-left horizon
    fr.soft_circle(0.02, 0.78, 0.22, (120, 70, 36), world=False)
    # Purple's plume: the back of it first
    draw_plume(fr, tt, "back")
    # Gojo: a near-held cel, tiny on screen-left; only his head tracks
    tx, ty, tpose = _s601_thragg(fr, t)
    gpose = P(G_HOVER, neck=-2 + 6 * seg(on2(fr), T(fr, 24), T(fr, 60), "inout") * -1)
    S = READ_SCALE_EWS
    gp = soles_offset(GOJO_W, gpose, scale=S)
    gojo(fr, gpose, -20.0, 200.0 + gp, 1, halo=1.6, scale=S)
    # Thragg: rises up and back into the plume's belly, still facing Gojo
    k_hide = seg(t, T(fr, 52), T(fr, 62), "in")
    px, py = pelvis_for_torso(THRAGG, tpose, tx, ty, -1, scale=S)

    def body():
        J = thragg(fr, tpose, px, py, -1, halo=1.4, scale=S, cape_wind=(0.9, 0.05))
        blood_ribbons(fr, J, t, length=7.0, width_px=2.0)
        return J
    if k_hide < 0.01:
        J = body()
    else:
        J = soft_draw(fr, body, radius=1.0 + 2.0 * k_hide, alpha=1 - k_hide)
        # the shredded cape is the last thing to vanish
        k_cape = 1 - seg(t, T(fr, 56), T(fr, 62), "in")
        if k_cape > 0:
            sx, sy = J["sh_f"]
            img, dr = fr.layer()
            pts = [fr.P(sx, sy), fr.P(sx + 3.6, sy - 1.4), fr.P(sx + 2.6, sy - 0.3), fr.P(sx + 4.2, sy + 0.3)]
            dr.polygon(pts, fill=(170, 30, 38, int(230 * k_cape)))
            fr.merge(img)
    if T(fr, 23) <= t < T(fr, 30):
        # a short chuff of displaced air under him as he climbs
        fx.dust_cloud(fr, 70.0, 138.6, t - T(fr, 24), r=1.6, n=10, color=(200, 200, 210), rise=-0.5,
                      salt="chuff", ground=False, alpha=90)
    # the front of the plume swallows him
    draw_plume(fr, tt, "front", alpha=0.55 + 0.45 * k_hide)
    # grit sifting from the plume's belly
    if t >= T(fr, 36):
        rng = fr.srng("grit")
        for i in range(70):
            x0 = rng.uniform(58, 122) - 2.0 * tt
            ph = rng.random()
            fall = ((t - T(fr, 36)) * rng.uniform(4, 8) + ph * 40) % 40
            y = 166 - fall
            X, Y = fr.P(x0, y)
            fr.draw.ellipse([X - fr.ss, Y - fr.ss, X + fr.ss, Y + fr.ss], fill=(120, 104, 94))
    fr.vignette = 0.45


# =============================================================================
# S6-02  MCU -> ECU: the Six Eyes read only a faint haze in the dust
# =============================================================================

def s6_02(fr):
    t = fr.t
    tt = plume_time(fr)
    tq = on2(fr)
    t14, t20, t22, t36 = T(fr, 14), T(fr, 20), T(fr, 22), T(fr, 36)
    t44 = cue(fr, "accel_burst", 0, 44)
    # ---- background: storm dusk, the plume soft and churning screen-right
    plate_bg(fr, (30, 26, 40), (92, 66, 66))
    img, dr = fr.layer()
    rng = random.Random("s602plume")
    for i in range(34):
        u = 0.62 + rng.uniform(-0.1, 0.42) - 0.004 * tt
        v = rng.uniform(0.05, 0.92)
        r = rng.uniform(0.1, 0.24) * fr.H
        u += 0.01 * math.sin(tt * 0.5 + i)
        c = mix_color((78, 66, 66), (140, 116, 100), rng.random() * 0.8)
        dr.ellipse([u * fr.W - r, v * fr.H - r * 0.85, u * fr.W + r, v * fr.H + r * 0.85], fill=c + (150,))
    fr.merge(img)
    soft = fr.img.filter(ImageFilter.GaussianBlur(10 * fr.ss))
    fr.img.paste(soft)
    fr.draw = ImageDraw.Draw(fr.img)
    # ---- push-in: hold the MCU f0-20, ease into an ECU of the near eye by f36
    w = seg(t, t20, t36, "inout")
    s = math.exp(lerp(math.log(0.78), math.log(9.5), w))
    breath = 0.006 * math.sin(tq * math.tau / T(fr, 30)) * (1 - w)
    cu0, cv0 = 0.36, 0.52 + breath
    E0 = (cu0 * fr.W + 0.3 * 0.5 * fr.H * 0.78, cv0 * fr.H - 0.15 * 0.5 * fr.H * 0.78)
    E1 = (0.5 * fr.W, 0.5 * fr.H)
    ew = w ** 0.6
    Ex, Ey = lerp(E0[0], E1[0], ew), lerp(E0[1], E1[1], ew)
    cu = (Ex - 0.3 * 0.5 * fr.H * s) / fr.W
    cv = (Ey + 0.15 * 0.5 * fr.H * s) / fr.H
    inj = C.opts(fr, "gojo", switch=t22)["injuries"]
    inserts.gojo_face(fr, cu, cv, s, expr="focused" if t >= t14 else "serious", eyes="open",
                      injuries=[i for i in inj if i in ("nosebleed", "mouth_blood")], t=t, eye_glow=0.0,
                      hair_wind=0.03 * math.sin(tq * 2.3))
    L = inserts.Local(fr, cu, cv, s, 0.0, 1)
    neck_blindfold(L)
    jacket_tear(L)
    lid = 0.08 + 0.62 * seg(t, t14, t20, "inout")
    # what plays across the iris (f36-44), the snap (f44-46), the pupil flick after
    k_field = seg(t, t36 - T(fr, 2), T(fr, 38), "inout") * (1 - 0.6 * seg(t, T(fr, 48), T(fr, 52), "inout"))
    coil = seg(t, T(fr, 39), t44, "in")
    snap = clamp((t - t44) / max(1e-6, T(fr, 2)))
    gone = seg(t, t44 + T(fr, 2), t44 + T(fr, 6), "inout")
    flick = seg(t, t44 + T(fr, 2), t44 + T(fr, 4), "snap")
    gaze = (lerp(0.35, -0.75, flick), lerp(0.1, 0.65, flick))
    field = dict(t=t, k=k_field, coil=coil, snap=snap if t >= t44 else 0.0, gone=gone, salt="s602f")
    if s > 2.5:
        # at ECU scale the insert's hair-strand tips hanging below the eye read as a stray
        # white wedge: let the cheek cover them
        L.ell(0.3, -0.03, 0.17, 0.05, fill=GOJO.skin)
    for ex, sz, fld in ((-0.12, 0.85, None), (0.3, 1.0, field)):
        gojo_eye(fr, L, ex, -0.15, sz, lid=lid, gaze=gaze, veins=0.85, salt=f"s602v{ex}", field=fld,
                 glow=clamp(0.45 / s))
    if w > 0.5:
        # specular glint and warm rim on the white lashes (ECU)
        fr.soft_circle(0.03, 0.4, 0.25, (60, 30, 14), world=False)
    fr.vignette = 0.45 + 0.25 * w


# =============================================================================
# S6-03  OTS high over Gojo's shoulder: the break for the lit city; teleport
# =============================================================================
# The engine's cameras cannot tilt, so this aerial is drawn through a small
# pinhole camera (yawed north-west, pitched down) over a box model of the
# district: the avenue runs west from the intersection and recedes to the
# far-left horizon, across the river, into the lit city - the line's end point.

def river_x(z):
    return -330.0 - 0.36 * z


RIVER_W = 190.0


class Pin:
    def __init__(self, fr, eye, yaw, pitch, F, cy=0.5):
        self.ex, self.ey, self.ez = eye
        self.cyw, self.syw = math.cos(math.radians(yaw)), math.sin(math.radians(yaw))
        self.cp, self.sp = math.cos(math.radians(pitch)), math.sin(math.radians(pitch))
        self.F = F * fr.ss
        self.cx, self.cy = fr.W / 2, fr.H * cy
        self.horizon = self.cy - self.F * self.sp / self.cp

    def cam(self, x, y, z):
        dx, dy, dz = x - self.ex, y - self.ey, z - self.ez
        xr = dx * self.cyw - dz * self.syw
        zr = dx * self.syw + dz * self.cyw
        zc = zr * self.cp - dy * self.sp
        yc = dy * self.cp + zr * self.sp
        return xr, yc, zc

    def zc(self, x, y, z):
        return self.cam(x, y, z)[2]

    def __call__(self, x, y, z):
        xr, yc, zc = self.cam(x, y, z)
        zc = max(1.0, zc)
        return (self.cx + self.F * xr / zc, self.cy - self.F * yc / zc)

    def scale(self, r, x, y, z):
        return self.F * r / max(1.0, self.zc(x, y, z))


S603_EYE = (100.0, 240.0, -250.0)
S603_YAW, S603_PITCH, S603_F = -35.0, 25.0, 800.0

_CITY6 = None


def _city6():
    """Deterministic box model of the district for the S6-03 aerial."""
    global _CITY6
    if _CITY6 is not None:
        return _CITY6
    rng = random.Random("s6-city")
    boxes = []

    def add(x0, x1, z0, z1, h, kind, cut=None):
        boxes.append(dict(x0=x0, x1=x1, z0=z0, z1=z1, h=h, kind=kind, cut=cut, seed=rng.random()))

    def cells(lo, hi, pitch, street, start):
        out, k = [], 0
        while start + k * pitch < max(hi, -lo):
            a0 = start + k * pitch
            if a0 < hi:
                out.append((a0, a0 + pitch - street))
            if -a0 > lo:
                out.append((-(a0 + pitch - street), -a0))
            k += 1
        return sorted(out)
    # Purple's four eastern towers (cut clean by the channel, tops gone)
    scar = [(150, 190, 40, 80, 230), (215, 250, 60, 95, 210), (280, 322, 30, 66, 250), (350, 392, 70, 110, 220)]
    for (x0, x1, z0, z1, h) in scar:
        cut = 200.0 - 20.0 / 102.0 * (0.5 * (x0 + x1) + 20.0) - 14
        add(x0, x1, z0, z1, h, "scar", cut)
    for (z0, z1) in cells(-500, 2400, 78.0, 16.0, 16.0):
        for (x0, x1) in cells(-2600, 1400, 78.0, 16.0, 20.0):
            cxx, czz = 0.5 * (x0 + x1), 0.5 * (z0 + z1)
            if 70 <= x1 and x0 <= 120 and 0 < z0 < 60:
                continue
            if any(x1 > s[0] - 6 and x0 < s[1] + 6 and z1 > s[2] - 6 and z0 < s[3] + 6 for s in scar):
                continue
            if x1 > river_x(czz) - RIVER_W and x0 < river_x(czz):
                continue
            lit = cxx < river_x(czz) - RIVER_W
            r = math.hypot(cxx, czz)
            k = rng.randint(1, 3)
            w = (x1 - x0) / k
            for j in range(k):
                if lit:
                    hh = rng.uniform(30, 170)
                elif czz < 0:
                    hh = rng.uniform(8, 26)
                elif r < 200:
                    hh = rng.uniform(16, 50)
                else:
                    hh = rng.uniform(24, 110) * (1.5 if rng.random() < 0.15 else 1)
                add(x0 + j * w + 1.5, x0 + (j + 1) * w - 1.5, z0 + rng.uniform(0, 6), z1 - rng.uniform(0, 6), hh,
                    "lit" if lit else "dark")
    for (z0, z1) in cells(2400, 6000, 160.0, 30.0, 2400.0):
        for (x0, x1) in cells(-6000, 3000, 160.0, 30.0, 10.0):
            cxx, czz = 0.5 * (x0 + x1), 0.5 * (z0 + z1)
            if x1 > river_x(czz) - RIVER_W and x0 < river_x(czz):
                continue
            lit = cxx < river_x(czz) - RIVER_W
            add(x0, x1, z0, z1, rng.uniform(40, 260 if lit else 180), "lit" if lit else "dark")
    _CITY6 = boxes
    return boxes


def _haze3(c, dist):
    return mix_color(c, (84, 64, 82), clamp(dist / 4200.0) * 0.85)


def _box6(fr, pj, b, dist, t, burst=None):
    x0, x1, z0, z1, h = b["x0"], b["x1"], b["z0"], b["z1"], b["h"]
    if b["kind"] == "scar":
        h = b["cut"]
    lit = b["kind"] == "lit"
    rng = random.Random(b["seed"])
    base = (30, 30, 42) if not lit else (36, 32, 44)
    south = _haze3(shade(base, rng.uniform(0.85, 1.15)), dist)
    top = _haze3(mix_color(base, (90, 84, 104), 0.45), dist)
    west = _haze3(mix_color(base, (160, 92, 70), 0.38), dist)
    east = _haze3(shade(base, 0.85), dist)
    d = fr.draw
    p = pj
    if pj.ex < x0:
        d.polygon([p(x0, 0, z0), p(x0, h, z0), p(x0, h, z1), p(x0, 0, z1)], fill=west)
    elif pj.ex > x1:
        d.polygon([p(x1, 0, z0), p(x1, h, z0), p(x1, h, z1), p(x1, 0, z1)], fill=east)
    s_face = [p(x0, 0, z0), p(x1, 0, z0), p(x1, h, z0), p(x0, h, z0)]
    d.polygon(s_face, fill=south)
    if pj.ey > h:
        d.polygon([p(x0, h, z0), p(x1, h, z0), p(x1, h, z1), p(x0, h, z1)], fill=top)
    if b["kind"] == "scar":
        # the clean cut: violet afterglow on the edges, fading
        col = (150, 70, 230)
        fr.glow_line([p(x0, h, z0), p(x1, h, z0), p(x1, h, z1)], shade(col, 0.55), width_px=4)
        d.line([p(x0, h, z0), p(x1, h, z0)], fill=(196, 150, 255), width=max(1, int(fr.ss * 1.5)))
        return
    (ax, ay), (bx, by), _, (dx_, dy_) = s_face
    wpx, hpx = abs(bx - ax), abs(ay - dy_)
    if wpx < 5 * fr.ss or hpx < 5 * fr.ss:
        return
    floors = max(1, int(h / 4.2))
    cols = max(1, int((x1 - x0) / 3.2))
    if wpx / cols < 2.5 * fr.ss or hpx / floors < 2.5 * fr.ss:
        if lit:
            for _ in range(min(70, int(floors * cols * 0.16))):
                u, v = rng.random(), rng.uniform(0.05, 0.95)
                px = ax + (bx - ax) * u
                py = ay + (dy_ - ay) * v
                r = max(1, int(0.9 * fr.ss))
                d.rectangle([px, py, px + r, py + r], fill=_haze3(PAL["window_lit"], dist * 0.5))
        return
    p_lit = 0.55 if lit else 0.01
    for i in range(floors):
        v0, v1 = (i + 0.25) / floors, (i + 0.75) / floors
        for j in range(cols):
            r = rng.random()
            if not lit and r > 0.4:
                continue
            u0, u1 = (j + 0.2) / cols, (j + 0.8) / cols
            if r < p_lit:
                c = _haze3(PAL["window_lit"], dist * 0.5)
            else:
                c = _haze3((24, 26, 36), dist)
                if burst is not None:
                    # the last intact windows: glinting until his path bursts them
                    xw = x0 + (x1 - x0) * (j + 0.5) / cols
                    tb = burst(xw)
                    if t < tb:
                        c = _haze3((92, 110, 132), dist)
                    elif t < tb + 0.08:
                        c = (230, 240, 255)
                    else:
                        c = (8, 8, 12)
            p0 = (ax + (bx - ax) * u0 + (dx_ - ax) * v0, ay + (by - ay) * u0 + (dy_ - ay) * v0)
            p1 = (ax + (bx - ax) * u1 + (dx_ - ax) * v1, ay + (by - ay) * u1 + (dy_ - ay) * v1)
            d.rectangle([min(p0[0], p1[0]), min(p0[1], p1[1]), max(p0[0], p1[0]), max(p0[1], p1[1])], fill=c)


def _unfinished6(fr, pj, dist):
    x0, x1, z0, H = 80.0, 110.0, 18.0, 176.0
    d = fr.draw
    core = _haze3((70, 70, 78), dist)
    slab = _haze3((120, 116, 112), dist)
    glass = _haze3((44, 52, 66), dist)
    d.polygon([pj(x0, 0, z0), pj(x1, 0, z0), pj(x1, H * 0.62, z0), pj(x0, H * 0.62, z0)], fill=glass)
    for i in range(5):
        cx = x0 + i * (x1 - x0) / 4
        d.line([pj(cx, 0, z0), pj(cx, H, z0)], fill=core, width=max(1, int(fr.ss * 2)))
    y = 4.2
    while y < H:
        d.line([pj(x0 - 0.6, y, z0), pj(x1 + 0.6, y, z0)], fill=slab, width=max(1, int(fr.ss * 1.5)))
        y += 8.4
    d.polygon([pj(x0, 120, z0), pj(x1, 120, z0), pj(x1, 132.6, z0), pj(x0, 132.6, z0)], fill=(14, 14, 20))


def _aerial_sky6(fr, pj):
    W = fr.W
    hz = pj.horizon
    top, mid, low = PAL["sky_top"], PAL["sky_mid"], PAL["sky_low"]
    n = 24
    for i in range(n):
        v0, v1 = hz * i / n, hz * (i + 1) / n + 2
        c = mix_color(top, mid, i / (n - 1)) if i < n * 0.6 else mix_color(mid, low, (i - n * 0.6) / (n * 0.4))
        fr.draw.rectangle([0, v0, W, v1], fill=c)
    fr.soft_circle(0.03, hz / fr.H, 0.24, (130, 62, 26), world=False)
    fr.soft_circle(0.02, hz / fr.H, 0.08, (180, 96, 44), world=False)
    for i in range(6):
        fr.draw.rectangle([0, hz - (i + 1) * 3 * fr.ss, fr.W * (0.42 - i * 0.06), hz - i * 3 * fr.ss],
                          fill=mix_color(low, (230, 130, 70), 0.5 - i * 0.07))
    # the torn cloud deck overhead
    img, dr = fr.layer()
    rng = random.Random("deck6")
    for i in range(180):
        z = pj.ez + 200 + 6000 * rng.random() ** 2.0
        x = pj.ex + rng.uniform(-1.6, 1.0) * (z - pj.ez)
        X, Y = pj(x, 460.0, z)
        rx = pj.scale(rng.uniform(140, 380), x, 460.0, z)
        ry = rx * 0.15
        if Y + ry < 0 or Y - ry > hz + 4 or X + rx < 0 or X - rx > W:
            continue
        far = clamp((z - pj.ez) / 5000.0)
        c = mix_color((32, 30, 46), (96, 72, 88), far * 0.9)
        dr.ellipse([X - rx, Y - ry, X + rx, Y + ry], fill=c + (int(140 - 70 * far),))
    fr.merge(img)


def _aerial_ground6(fr, pj, t):
    d = fr.draw
    W, H = fr.W, fr.H
    d.rectangle([0, pj.horizon, W, H], fill=(34, 32, 42))
    # the river, with the sunset in it
    Lp, Rp = [], []
    zs = [-200 + (8000 + 200) * (k / 34) ** 2 for k in range(35)]
    for z in zs:
        Lp.append(pj(river_x(z) - RIVER_W, 0, z))
        Rp.append(pj(river_x(z), 0, z))
    d.polygon(Lp + Rp[::-1], fill=(48, 40, 58))
    rng = random.Random("glints6")
    for k in range(80):
        z = -100 + 6000 * rng.random() ** 2
        x = river_x(z) - RIVER_W * rng.uniform(0.15, 0.85)
        wl = rng.uniform(10, 30)
        d.line([pj(x, 0, z), pj(x + wl, 0, z)], fill=mix_color((48, 40, 58), (230, 150, 96), rng.uniform(0.4, 0.9)),
               width=max(1, int(fr.ss)))
    # the lit city: street lights west of the river
    for k in range(900):
        z = -300 + 6000 * rng.random() ** 1.5
        x = river_x(z) - RIVER_W - rng.uniform(10, 3200)
        px, py = pj(x, 0, z)
        if 0 <= px < W and pj.horizon <= py < H:
            r = max(1, int(fr.ss * 1.4))
            d.rectangle([px, py, px + r, py + r], fill=mix_color(PAL["window_lit"], (60, 50, 60), rng.uniform(0, 0.4)))
    # block plinths, the avenue (z -16..16) and the boulevard (x -20..20)
    lw = max(1, int(fr.ss))
    for zz in (-6.0, 6.0):
        x = -1400.0
        while x < 600:
            if abs(x) > 22:
                d.line([pj(x, 0, zz), pj(x + 3, 0, zz)], fill=(104, 98, 86), width=lw)
            x += 9
    for xx in (-7.0, 7.0):
        z = -200.0
        while z < 800:
            if abs(z) > 18:
                d.line([pj(xx, 0, z), pj(xx, 0, z + 3)], fill=(104, 98, 86), width=lw)
            z += 9
    for xs in (-24.0, 24.0):
        for k in range(12):
            z = -13 + k * 2.4
            d.line([pj(xs - 3, 0, z), pj(xs + 3, 0, z)], fill=(140, 136, 124), width=max(1, int(fr.ss * 1.4)))
    # the landing crater at the centre; Purple's trench running east
    cr = [pj(math.cos(a) * 3.4, 0, math.sin(a) * 3.4) for a in [i * math.tau / 24 for i in range(24)]]
    d.polygon(cr, fill=(16, 14, 18))
    d.polygon([pj(130, 0, 14), pj(900, 0, 40), pj(900, 0, 56), pj(130, 0, 22)], fill=(20, 16, 24))
    fr.glow_line([pj(130, 0, 14), pj(900, 0, 40)], (60, 26, 90), width_px=3)


def _plume3d(fr, pj, tt, tear=None, alpha=1.0):
    blobs = []
    for b in plume_blobs():
        x, y, r = plume_state(b, tt, tear)
        z = b["z"] * 18.0
        blobs.append((pj.zc(x, y, z), x, y, z, r, b))
    blobs.sort(key=lambda q: -q[0])
    out = []
    for zc, x, y, z, r, b in blobs:
        X, Y = pj(x, y, z)
        R = pj.scale(r, x, y, z)
        c = plume_color(b, y)
        out.append((X, Y, R, R * 0.86, c, 120 * b["a"] * alpha))
        if y > 190:
            out.append((X - R * 0.5, Y - R * 0.35, R * 0.45, R * 0.45, (156, 108, 82), 34 * alpha))
    soft_blobs(fr, out, 2.0)


def _s603_path(fr, t):
    """Thragg's world position (x, y) in S6-03: the burst, the hard curve, the level run."""
    t4, t30 = cue(fr, "sonic_boom", 0, 4), T(fr, 30)
    if t < t4:
        return None
    if t <= t30:
        u = (t - t4) / (t30 - t4)
        e = EASE["inout"](u) * 0.35 + u * 0.65
        # quadratic Bezier: burst -> hard curve -> level just above the street
        p0, p1, p2 = (70.0, 165.0), (58.0, 18.0), (44.0, 7.0)
        x = (1 - e) ** 2 * p0[0] + 2 * (1 - e) * e * p1[0] + e * e * p2[0]
        y = (1 - e) ** 2 * p0[1] + 2 * (1 - e) * e * p1[1] + e * e * p2[1]
        return x, y
    return 44.0 - (t - t30) * 26.0, 6.0


def _gojo_back(fr, cu, cv, s, turn, lift, k=1.0, part="body"):
    """Gojo's right shoulder, collar and loose white hair from behind and
    above (screen space, frame-height units around (cu, cv)). turn > 0 =
    head turned down-left; lift = toward the lit city. k < 1 compresses
    everything toward its centre (the teleport)."""
    H = fr.H
    ox, oy = 0.1, -0.12                                  # compression centre

    def P_(x, y):
        x = ox + (x - ox) * k
        y = oy + (y - oy) * k
        return ((cu * fr.W / H + x * s) * H, (cv + y * s) * H)
    d = fr.draw
    if part == "body":
        d.polygon([P_(-0.62, 0.4), P_(-0.5, 0.06), P_(-0.24, -0.07), P_(0.08, -0.06), P_(0.34, 0.06),
                   P_(0.55, 0.24), P_(0.66, 0.4)], fill=(255, 255, 255))
        d.polygon([P_(-0.04, -0.04), P_(0.0, -0.21), P_(0.21, -0.22), P_(0.25, -0.03)], fill=(255, 255, 255))
        return
    hx, hy = 0.12 - 0.05 * turn + 0.02 * lift, -0.37 + 0.03 * turn - 0.05 * lift
    a0 = math.radians(-14 * turn + 10 * lift)
    pts = []
    for i in range(40):
        a = i * math.tau / 40
        rr = 0.15 * (1.0 + 0.04 * math.sin(i * 2.7) + 0.025 * math.sin(i * 5.3))
        pts.append(P_(hx + math.cos(a + a0) * rr, hy + math.sin(a + a0) * rr * 1.08))
    d.polygon(pts, fill=(255, 255, 255))


def _gojo_back_detail(fr, cu, cv, s, turn, lift, k):
    H = fr.H
    ox, oy = 0.1, -0.12

    def P_(x, y):
        x = ox + (x - ox) * k
        y = oy + (y - oy) * k
        return ((cu * fr.W / H + x * s) * H, (cv + y * s) * H)
    hx, hy = 0.12 - 0.05 * turn + 0.02 * lift, -0.37 + 0.03 * turn - 0.05 * lift
    img, dr = fr.layer()
    pts = [P_(hx + math.cos(a) * 0.15, hy + math.sin(a) * 0.162) for a in [math.radians(-70 + 9 * i) for i in range(17)]]
    dr.polygon(pts + [P_(hx + 0.02, hy)], fill=(90, 92, 112, 70))
    fr.merge(img)


def s6_03(fr):
    t = fr.t
    tt = plume_time(fr)
    t4 = cue(fr, "sonic_boom", 0, 4)
    t30 = cue(fr, "teleport", 0, 30)
    t26 = t30 - T(fr, 4)
    pj = Pin(fr, S603_EYE, S603_YAW, S603_PITCH, S603_F)
    fr.cam = Cam(0.0, 100.0, 4.0)
    _aerial_sky6(fr, pj)
    _aerial_ground6(fr, pj, t)
    img, dr = fr.layer()
    hz = pj.horizon
    for i in range(8):
        dr.rectangle([0, hz + i * fr.H * 0.012, fr.W, hz + (i + 1) * fr.H * 0.012], fill=(124, 88, 96, int(70 * (1 - i / 8))))
    fr.merge(img)
    env.light_shafts(fr, C.state(SEQ), strength=0.8)

    def burst(xw):
        # windows along the east block burst in sequence beneath his path (f12-22)
        return T(fr, 12) + (64.0 - xw) / 40.0 * T(fr, 10)
    boxes = []
    for b in _city6():
        cxx, czz = 0.5 * (b["x0"] + b["x1"]), 0.5 * (b["z0"] + b["z1"])
        if pj.zc(cxx, 0, czz) < 20:
            continue
        px, py = pj(cxx, 0, czz)
        if px < -0.6 * fr.W or px > 1.6 * fr.W or py < pj.horizon - 10:
            continue
        dist = math.hypot(cxx - pj.ex, czz - pj.ez)
        boxes.append((dist, b))
    boxes.append((math.hypot(95 - pj.ex, 33 - pj.ez), None))
    boxes.sort(key=lambda q: -q[0])
    for dist, b in boxes:
        if b is None:
            _unfinished6(fr, pj, dist)
            continue
        east_block = b["kind"] == "dark" and 18 < b["x0"] < 72 and 14 < b["z0"] < 60
        _box6(fr, pj, b, dist, t, burst if east_block else None)
    # smoke columns rising from the eastern district
    sm = []
    for i, (sx, sz) in enumerate(((170, 60), (240, 80), (300, 50), (380, 90), (120, 30))):
        for k in range(14):
            age = (C.tg(fr) * 0.08 + k / 14) % 1.0
            x, y, z = sx + age * 40 + math.sin(age * 5 + i) * 6, age * 160, sz
            X, Y = pj(x, y, z)
            R = pj.scale(6 + age * 26, x, y, z)
            sm.append((X, Y, R, R, (58, 52, 58), 70 * (1 - 0.6 * age)))
    soft_blobs(fr, sm, 2.0)
    # ---- the plume: the belly bulges f0-3, Thragg bursts out of it on f4
    bulge = seg(t, 0.0, t4, "in")
    tear = (70.0, 168.0, t - t4, 26.0)
    _plume3d(fr, pj, tt, tear=tear if t >= t4 else None)
    if t < t4 + T(fr, 1):
        X, Y = pj(70.0, 166.0 - 2.0 * bulge, 0.0)
        R = pj.scale(8 + 6 * bulge, 70, 166, 0)
        img, dr = fr.layer()
        dr.ellipse([X - R, Y - R * 0.7, X + R, Y + R * 0.7], fill=(96, 82, 78, int(200 * bulge)))
        fr.merge(img)
    pos = _s603_path(fr, t)
    if pos is not None:
        # dust torn out of the plume along the first part of the path
        trail = []
        for kk in range(16, -1, -1):
            p_ = _s603_path(fr, max(t4, t - kk * 0.03))
            if p_ is not None:
                trail.append(pj(p_[0], p_[1], 0.0))
        if len(trail) >= 2:
            img, dr = fr.layer()
            n = len(trail)
            for i in range(n - 1):
                w = (1.5 + 11.0 * (i / n) ** 1.4) * fr.ss
                dr.line([trail[i], trail[i + 1]], fill=(240, 238, 250, int(50 + 170 * i / n)), width=int(w))
            fr.merge(img)
            fr.glow.line(trail[-8:], fill=(150, 140, 175), width=int(10 * fr.ss))
        X, Y = pj(pos[0], pos[1], 0.0)
        r = 5.0 * fr.ss
        fr.draw.ellipse([X - r * 1.4, Y - r, X + r * 1.4, Y + r], fill=(246, 242, 238))
        fr.draw.ellipse([X - r * 0.4, Y - r * 0.9, X + r * 1.3, Y + r * 0.2], fill=(200, 30, 40))
        fr.glow.ellipse([X - r * 4, Y - r * 4, X + r * 4, Y + r * 4], fill=(150, 120, 140))
        if t >= t30:
            # racing low over the street: wake of dust off the asphalt
            for kk in range(10):
                xx = pos[0] + 2 + kk * 3.0
                A = pj(xx, 0.5, 0.0)
                rr = pj.scale(1.2 + kk * 0.5, xx, 0, 0)
                img, dr = fr.layer()
                dr.ellipse([A[0] - rr, A[1] - rr * 0.5, A[0] + rr, A[1] + rr * 0.5], fill=(150, 130, 116, 70 - kk * 6))
                fr.merge(img)
    # vapour cone + boom ring at the burst
    if t4 <= t < t4 + 0.5:
        ts = t - t4
        X, Y = pj(70.0, 163.0, 0.0)
        a = 1 - clamp(ts / 0.45)
        R = pj.scale(4 + ts * 70, 70, 163, 0)
        img, dr = fr.layer()
        dr.ellipse([X - R, Y - R * 0.45, X + R, Y + R * 0.45], outline=(236, 240, 250, int(220 * a)),
                   width=max(1, int(3 * fr.ss)))
        A = pj(64.0, 140.0, 0.0)
        dr.polygon([(X - R * 0.5, Y - R * 0.1), (X + R * 0.5, Y - R * 0.1), A], fill=(236, 240, 250, int(140 * a)))
        fr.merge(img)
    # glass bursting outward from the east block's south faces
    tb0 = T(fr, 12)
    if tb0 <= t < tb0 + T(fr, 18):
        rng = fr.srng("panes")
        for i in range(90):
            xw = rng.uniform(26, 64)
            yw = rng.uniform(4, 30)
            zw = rng.uniform(17, 22)
            ts = t - burst(xw)
            if ts < 0 or ts > 0.7:
                continue
            p_ = (xw + rng.uniform(-1, 1) * ts * 4, yw - 4.9 * ts * ts + rng.uniform(0, 2) * ts, zw - ts * rng.uniform(6, 14))
            X, Y = pj(*p_)
            r = max(1.0, 1.2 * fr.ss)
            g = 0.6 + 0.4 * math.sin(t * 30 + i)
            fr.draw.rectangle([X - r, Y - r, X + r, Y + r], fill=shade(PAL["glass"], g))
    # ---- Gojo in the foreground: tracks, decides, folds away
    bake(fr)
    tq = on2(fr)
    turn = seg(tq, T(fr, 8), T(fr, 22), "inout")
    lift = pulse(tq, T(fr, 22), T(fr, 2), T(fr, 2))
    kc = 1.0
    if t >= t26:
        kc = 1 - seg(t, t26, t30, "in")
    CUg, CVg, Sg = 0.08, 0.98, 0.66
    if t < t30 - 1e-6:
        body, _ = capture(fr, lambda: _gojo_back(fr, CUg, CVg, Sg, turn, lift, kc, "body"))
        silhouette(fr, body, (54, 54, 70), rim=(240, 172, 124), rim_off=(-5, -6), blur=1.5)
        hair, _ = capture(fr, lambda: _gojo_back(fr, CUg, CVg, Sg, turn, lift, kc, "hair"))
        silhouette(fr, hair, (176, 178, 194), rim=(255, 220, 184), rim_off=(-5, -5), blur=1.5)
        # strands catching the light; the side away from the sunset in shadow
        _gojo_back_detail(fr, CUg, CVg, Sg, turn, lift, kc)
        if t >= t26:
            # space folds in around him: the background lenses toward his centre
            X, Y = (CUg + 0.1 * Sg * OUT_H / OUT_W) * OUT_W, (CVg - 0.12 * Sg) * OUT_H
            fr.post.append(("lens", X, Y, 420 * (0.5 + 0.5 * kc), -0.4 * (1 - kc), t))
    else:
        ts = t - t30
        X, Y = (CUg + 0.1 * Sg * OUT_H / OUT_W) * fr.W, (CVg - 0.12 * Sg) * fr.H
        a = 1 - clamp(ts / T(fr, 6))
        if a > 0:
            # one frame of empty air, a thin implosion ring, a puff of displaced air
            img, dr = fr.layer()
            rr = (0.05 + 0.12 * (1 - EASE["out"](clamp(ts / T(fr, 4))))) * fr.H
            dr.ellipse([X - rr, Y - rr, X + rr, Y + rr], outline=(210, 220, 240, int(160 * a)),
                       width=max(1, int(1.5 * fr.ss)))
            for k in range(7):
                ang = k * math.tau / 7 + 0.3
                rp = (0.03 + 0.06 * clamp(ts / T(fr, 6))) * fr.H
                pr = 0.035 * fr.H
                dr.ellipse([X + math.cos(ang) * rp - pr, Y + math.sin(ang) * rp - pr * 0.7,
                            X + math.cos(ang) * rp + pr, Y + math.sin(ang) * rp + pr * 0.7],
                           fill=(170, 160, 170, int(40 * a)))
            fr.merge(img)
    fr.vignette = 0.5


# =============================================================================
# S6-04  WS low: Gojo is simply there; Thragg plants on the air 8 m out
# =============================================================================

def _s604_thragg(fr, t):
    t1, t3, t8, t18 = T(fr, 1), T(fr, 3), T(fr, 8), T(fr, 18)
    xs = [(0, 36.0), (1, 27.0), (2, 18.0), (3, 12.5), (4, 8.4), (5, 5.3), (6, 3.1), (7, 1.7), (8, 1.0)]
    if t < t8:
        x = kf(t, [(T(fr, f), v, "linear") for f, v in xs])
        y = kf(t, [(t1, 5.05), (t8, 4.5, "out")])
    else:
        tq = on2(fr)
        x = 1.0 + 0.12 * math.sin((tq - t8) * 9) * (1 - seg(tq, t8, t18, "out"))
        y = 4.5 + 0.08 * math.sin((tq - t8) * 7) * (1 - seg(tq, t8, T(fr, 24), "out"))
    # rotation leads (f3-5), the trajectory follows (f5-8)
    rot = seg(t, t3, T(fr, 5), "out")
    pose = pose_at(rot, [(0.0, T_FLY), (1.0, T_BRAKE)])
    if t >= T(fr, 6):
        tq = on2(fr) if t >= t8 else t
        settle = seg(tq, T(fr, 7), t18, "inout")
        pose = pose_at(settle, [(0.0, T_BRAKE), (1.0, T_HANG)])
        # the plant costs him: the torn ear makes him wobble and list; trims once, twice
        lst = 12 * math.sin((tq - T(fr, 6)) * 11) * (1 - seg(tq, T(fr, 6), T(fr, 22), "out"))
        lst += 6 * seg(tq, T(fr, 10), T(fr, 14), "inout") - 4 * seg(tq, T(fr, 15), T(fr, 19), "inout")
        pose = rot_pose(pose, lst)
    return x, y, pose


def s6_04(fr):
    t = fr.t
    t_arr = cue(fr, "teleport", 0, 0)
    t_shock = cue(fr, "shockwave", 0, 4)
    t_stop = cue(fr, "infinity_stop", 0, 7)
    t_hand = cue(fr, "cloth", 0, 18)
    fr.cam = Cam(-1.4, 4.1, 52.0)
    C.stage(fr, SEQ, "street")
    tx, ty, tpose = _s604_thragg(fr, t)
    # ---- Gojo: simply there. A held cel; the right hand begins to rise from f18 (on 2s)
    tq = on2(fr)
    rise = seg(tq, t_hand, fr.dur + T(fr, 6), "out")
    gpose = pose_at(rise, [(0.0, G_HOVER), (1.0, P(G_HOVER, ua_n=30, fa_n=128, hand_n="open"))])
    g_off = soles_offset(GOJO_W, G_HOVER)
    gx, gy = G_CORNER_X, 3.0 + g_off
    Jg = solve(GOJO, gpose, gx, gy, 1)
    gc = Jg["chest"]
    # side lobes of the braking shock flow around him and lift the corner's dust behind him
    if t >= t_stop:
        fx.dust_cloud(fr, gx - 3.0, 0.05, t - t_stop, r=2.6, n=16, salt="lobe1", alpha=90)
        fx.dust_cloud(fr, gx - 1.5, 0.05, t - t_stop - T(fr, 2), r=1.8, n=10, salt="lobe2", alpha=70)
    gojo(fr, gpose, gx, gy, 1)
    # teleport arrival: a faint outward ring of displaced air
    if t < t_arr + 0.4:
        fx.shockwave(fr, gc[0], gc[1] - 0.3, t - t_arr, r_max=2.2, dur=0.35, color=(150, 160, 176), width=2)
    # ---- Thragg: the streak, the hard plant, the wobble
    px, py = pelvis_for_torso(THRAGG, tpose, tx, ty, -1)
    if t < T(fr, 5):
        trail = [(tx + 2.6 * k, ty + 0.05 * k) for k in range(6, -1, -1)]
        fx.trail(fr, trail, width_m=1.0, alpha=110)
        fx.speed_lines(fr, 0.5, direction=(-1, 0), salt="s604sl")
    cw = (-1.0, 0.25) if T(fr, 3) <= t < T(fr, 12) else (0.9, 0.0)
    thragg(fr, tpose, px, py, -1, cape_wind=cw)
    if T(fr, 3) <= t < T(fr, 10):
        # the vapour cone collapses forward off him
        ts = t - T(fr, 3)
        fx.sonic_boom(fr, tx - 0.6 - 5.0 * ts, ty + 0.1, ts, dirx=1.0, diry=0.0, size=0.9)
    if t >= t_shock:
        ts = t - t_shock
        # a fan of grit blasted off the street under the plant
        fx.debris(fr, tx + 0.5, 0.1, ts, n=34, speed=9.0, spread=1.1, angle=math.radians(118), size=(0.03, 0.1),
                  color=(110, 104, 100), salt="s604grit", drag=0.8, ground=0.0)
        fx.dust_cloud(fr, tx, 0.05, ts, r=2.4, n=14, salt="s604dust", alpha=80)
        # the braking shock rolls on ahead of him (a pressure front) ...
        R_stop = max(0.5, tx - gx - 0.45)
        R = R_stop * EASE["out"](clamp(ts / max(1e-6, t_stop - t_shock)))
        a = 1 - clamp((ts - (t_stop - t_shock)) / 0.3)
        if a > 0 and R > 0.3:
            X, Y = fr.P(tx, ty)
            RR = fr.S(R)
            img, dr = fr.layer()
            for k, w in ((0, 3), (1, 1)):
                rr = RR * (1 - 0.05 * k)
                dr.arc([X - rr, Y - rr * 0.8, X + rr, Y + rr * 0.8], 150, 210, fill=(226, 230, 240, int(150 * a)),
                       width=max(1, int(w * fr.ss)))
            fr.merge(img)
            fr.post.append(("ring", X / fr.ss, Y / fr.ss, RR / fr.ss, 0.5 * a, t))
    # ... and stalls in the space around Gojo: grit hangs a hand's width short, jittering
    if t >= t_shock:
        rng = fr.srng("stall")
        k_inf = seg(t, t_stop - T(fr, 1), t_stop + T(fr, 1), "out") * (1 - seg(t, T(fr, 20), fr.dur, "inout") * 0.6)
        fx.infinity(fr, gc[0] + 0.1, gc[1] - 0.2, r=1.25, strength=0.5 * k_inf, t=t)
        for i in range(46):
            yy = rng.uniform(gy - 0.95, gy + 0.85)
            x0 = rng.uniform(4.0, 9.0) + gx
            x_stop = gx + 0.28 + rng.uniform(0.06, 0.16)
            t_reach = t_stop + rng.uniform(-T(fr, 1), T(fr, 1))
            if t < t_reach:
                u = clamp((t - t_shock) / max(1e-6, t_reach - t_shock))
                x = lerp(x0, x_stop + 0.5, EASE["out"](u))
            else:
                x = x_stop + fx.zeno(0.5, t - t_reach, rate=6.0)
            x += math.sin(t * 40 + i) * 0.006
            yj = yy + math.cos(t * 37 + i * 1.3) * 0.006
            sz = rng.uniform(0.03, 0.065)
            ang = rng.uniform(0, math.tau)
            fr.poly([(x + math.cos(ang + q * 2.1) * sz, yj + math.sin(ang + q * 2.1) * sz) for q in range(3)],
                    shade((176, 164, 150), rng.uniform(0.8, 1.25)))
        if t >= t_stop:
            fx.impact(fr, gx + 0.45, gc[1] - 0.3, t - t_stop, kind="blocked", dirx=-1.0)
    fr.vignette = 0.4


# =============================================================================
# S6-05  OTS low over Gojo's right shoulder: the sign; Thragg coils and lunges
# =============================================================================

def _s605_thragg(fr, t):
    t36, t52, t53 = T(fr, 36), T(fr, 52), T(fr, 53)
    tq = on2(fr) if t < t36 else t
    x, y = 1.0, 4.5
    pose = P(T_HANG, neck=8 + 4 * seg(tq, T(fr, 6), T(fr, 14), "inout"))
    lst = 3.0 * math.sin(tq * 5) * (1 - seg(tq, 0.0, T(fr, 20), "out"))
    pose = rot_pose(pose, lst)
    if t >= t36:
        c = seg(t, t36, t52, "inout")
        pose = pose_at(c, [(0.0, pose), (1.0, T_COIL)])
        y -= 0.22 * c
    if t >= t52 - 1e-6:
        pose = T_COMPRESS
        y = 4.5 - 0.3
    if t >= t53 - 1e-6:
        pose = T_LUNGE
        y = 4.5 - 0.2
        x = 1.0 - 0.3 * seg(t, t53, fr.dur, "in")
    return x, y, pose


def s6_05(fr):
    t = fr.t
    t53 = T(fr, 53)
    z = lerp(200.0, 206.0, seg(t, 0.0, fr.dur, "linear"))
    fr.cam = Cam(-0.54, 4.65, z)
    C.stage(fr, SEQ, "street", gantry_on=False)
    # ambient dust drifting slowly (real time; not an Infinity cue)
    rng = fr.srng("amb")
    for i in range(50):
        d = rng.uniform(0.7, 2.0)
        x = rng.uniform(-6, 8) - t * rng.uniform(0.1, 0.3)
        y = rng.uniform(1.5, 8.5) + math.sin(t * 0.8 + i) * 0.05
        X, Y = fr.P(x, y, d)
        r = fr.ss * rng.uniform(0.8, 2.0) / d
        fr.draw.ellipse([X - r, Y - r, X + r, Y + r], fill=(178, 156, 136))
    # ---- Thragg, 8 m beyond the sign: finishes trimming, reads the hand, coils, fires
    tx, ty, tpose = _s605_thragg(fr, t)
    px, py = pelvis_for_torso(THRAGG, tpose, tx, ty, -1)
    lift = seg(t, T(fr, 36), T(fr, 52), "inout")
    J = thragg(fr, tpose, px, py, -1, cape_wind=(0.6 + 0.2 * lift, -0.1 + 0.9 * lift))
    if t >= t53 - 1e-6:
        # first wisp of vapour at his shoulders
        ts = t - t53
        sx, sy = J["sh_n"]
        img, dr = fr.layer()
        for k in range(5):
            X, Y = fr.P(sx + 0.25 + k * 0.12 + ts * 2, sy + 0.05 * math.sin(k * 2))
            R = fr.S(0.08 + 0.03 * k)
            dr.ellipse([X - R, Y - R * 0.6, X + R, Y + R * 0.6], fill=(236, 240, 248, 110 - 15 * k))
        fr.merge(img)
    # ---- Gojo's foreground: jaw, collar, shoulder, and the sign (sharp silhouettes)
    bake(fr)
    tq = on2(fr)
    breath = 0.008 * math.sin(max(0.0, tq - T(fr, 6)) * math.tau / T(fr, 40)) if tq < T(fr, 46) else 0.0
    rise = seg(t, 0.0, T(fr, 4), "out")
    form = seg(t, T(fr, 4), T(fr, 6), "snap")

    def Q(pts):
        return [(u * fr.H, v * fr.H) for u, v in pts]

    def fg_body():
        d = fr.draw
        hx, hy = 0.02, 0.34 + breath
        # back of the head / jaw line, cut by the left frame edge
        d.polygon(Q([(hx - 0.3, hy - 0.3), (hx + 0.1, hy - 0.32), (hx + 0.2, hy - 0.18), (hx + 0.21, hy - 0.02),
                     (hx + 0.25, hy + 0.06), (hx + 0.22, hy + 0.12), (hx + 0.2, hy + 0.2), (hx + 0.12, hy + 0.27),
                     (hx - 0.3, hy + 0.3)]), fill=(255, 255, 255))
        # neck, high collar, shoulder
        d.polygon(Q([(-0.1, hy + 0.2), (hx + 0.15, hy + 0.2), (hx + 0.22, hy + 0.42), (0.42, 0.84 + breath),
                     (0.6, 1.02), (-0.1, 1.02)]), fill=(255, 255, 255))

    def fg_hair():
        d = fr.draw
        hx, hy = 0.02, 0.34 + breath
        pts = [(hx - 0.3, hy - 0.44), (hx + 0.06, hy - 0.46), (hx + 0.2, hy - 0.36), (hx + 0.25, hy - 0.22),
               (hx + 0.2, hy - 0.2), (hx + 0.23, hy - 0.1), (hx + 0.16, hy - 0.14), (hx + 0.14, hy - 0.02),
               (hx + 0.08, hy - 0.1), (hx - 0.3, hy - 0.06)]
        d.polygon(Q(pts), fill=(255, 255, 255))
    body, _ = capture(fr, fg_body)
    silhouette(fr, body, (24, 22, 30), rim=(236, 160, 110), rim_off=(-4, -3))
    hair, _ = capture(fr, fg_hair)
    silhouette(fr, hair, (104, 104, 118), rim=(255, 200, 150), rim_off=(-4, -3))
    # the sign hand, rising into place (f0-4) and formed by f6: one hand, middle over index
    hcv = lerp(0.86, 0.47, rise) + breath * 0.5

    def hand():
        L = inserts.Local(fr, 0.31, hcv, 0.3, 5.0)
        sign_hand(L, form)
    hl, _ = capture(fr, hand)
    silhouette(fr, hl, (34, 30, 38), rim=(255, 186, 124), rim_off=(-3, -2))
    fr.vignette = 0.45


# =============================================================================
# S6-06  ECU sign -> black sphere -> the void, pull back to two tiny figures
# =============================================================================

def s6_06(fr):
    t = fr.t
    t8 = cue(fr, "domain_bed", 0, 8)
    t24, t30, t34 = T(fr, 24), T(fr, 30), T(fr, 34)
    SIGN_C, S_HAND = (0.36, 0.6), 0.62
    if t < t24 + T(fr, 1):
        # ---- ECU of the crossed fingers in profile, from the south; the dusk
        #      street soft behind, Thragg's lunging silhouette screen-right
        fr.cam = Cam(-4.4, 4.7, 120.0)

        def bg():
            C.stage(fr, SEQ, "street", gantry_on=True)
            thragg(fr, T_LUNGE, *pelvis_for_torso(THRAGG, T_LUNGE, 0.7, 4.1, -1), -1, cape_wind=(1.0, 0.4))
        soft_draw(fr, bg, radius=5.0)
        bake(fr)
        L = inserts.Local(fr, SIGN_C[0], SIGN_C[1], S_HAND, 4.0)
        tip = sign_hand(L, 1.0)
        # f0: the snap - a bead of absolute black at the crossed fingertips
        bx, by = tip[0], tip[1] - 0.012 * fr.H
        r = 0.009 * fr.H
        fr.draw.ellipse([bx - r, by - r, bx + r, by + r], fill=(0, 0, 0))
        if t >= t8:
            # the sphere erupts from the sign: 16-frame ease-out (fast start)
            u = clamp((t - t8) / max(1e-6, t24 - t8))
            u_in = EASE["out"](u) ** (1 / 3.0)
            fx.domain_transition(fr, u_in, center=(bx / fr.W, by / fr.H))
        fr.vignette = 0.5
        return
    # ---- inside: pure black, then the void ignites; the long pull-back
    if t < t30:
        fr.draw.rectangle([0, 0, fr.W, fr.H], fill=(0, 0, 0))
        fr.vignette = 0.0
        return
    k_in = seg(t, t30, T(fr, 36), "out")
    info = seg(t, T(fr, 32), T(fr, 40), "inout")
    void_bg(fr, intensity=k_in, info=info, center=(0.5, 0.28))
    if t < t34:
        return
    u = seg(t, t34, fr.dur, "out")
    zoom = math.exp(lerp(math.log(700.0), math.log(28.0), u))
    cx = lerp(-6.0, -2.7, seg(t, t34, fr.dur, "inout"))
    cy = lerp(4.8, 4.2, seg(t, t34, fr.dur, "inout"))
    fr.cam = Cam(cx, cy, zoom)
    vis = seg(t, t34, t34 + T(fr, 4), "inout")
    tq = on2(fr)
    g_off = soles_offset(GOJO, G_SIGN)
    halo = 1.4 if zoom < 60 else 0.0
    gpose = P(G_SIGN, lean=G_SIGN["lean"] + 1.0 * math.sin(tq * 2))

    def figs():
        if zoom < 80:
            for (x, y) in ((G_CORNER_X, 4.0), (1.0, 4.1)):
                fr.glow_circle(x, y, 12.0 / zoom, (26, 46, 90))
        thragg(fr, T_LUNGE, *pelvis_for_torso(THRAGG, T_LUNGE, 1.0, 4.1, -1), -1, void=True, halo=halo,
               cape_wind=(1.0, 0.4))
        gojo(fr, gpose, G_CORNER_X, 3.0 + g_off, 1, void=True, halo=halo)
    soft_draw(fr, figs, radius=0.0, alpha=vis)
    fr.vignette = 0.35


# =============================================================================
# S6-07  worm's-eye beneath Thragg: frozen, huge, helpless, falling
# =============================================================================

def s6_07(fr):
    t = fr.t
    u = clamp(t / fr.dur)
    ty = 4.1 - 0.7 * (0.35 * u + 0.65 * u * u)
    zoom = 420.0
    fr.cam = Cam(0.36, ty - 0.21, zoom, rot=-4.0)
    void_bg(fr, center=(0.3, lerp(0.85, 0.12, u)))
    void_stars(fr, t, n=160, d_rng=(1.2, 3.5), x_rng=(-6, 7), y_rng=(-2, 9), salt="s607st")
    # Gojo, tiny on screen-left (8 m west: further from this lens), watching
    tq = on2(fr)
    breath = math.sin(tq * math.tau / T(fr, 30)) * seg(tq, T(fr, 10), T(fr, 34), "inout")
    gpose = P(G_SIGN, lean=G_SIGN["lean"] + 2 * breath, ua_n=24, fa_n=120)
    g_off = soles_offset(GOJO, gpose)
    gojo(fr, gpose, G_CORNER_X, 3.0 + g_off, 1, depth=4.0, void=True)
    # Thragg: a fully held cel; only the void rising past shows the fall
    px, py = pelvis_for_torso(THRAGG, T_LUNGE, 1.0, ty, -1)
    J = thragg(fr, T_LUNGE, px, py, -1, void=True, scale=1.06, cape_wind=(1.0, 0.4))
    # blood droplets from the flank, frozen in the air (falling with him)
    rng = fr.srng("s607bl")
    fx0, fy0 = torso_pt(J, THRAGG_V, 0.45, 0.1)
    for i in range(14):
        ox, oy = rng.uniform(-0.4, 0.15), rng.uniform(-0.5, 0.1)
        rr = rng.uniform(0.008, 0.02)
        fr.circle(fx0 + ox, fy0 + oy, rr, fill=(150, 12, 24))
    info_wash(fr, J, THRAGG_V, t, k=0.9, n=60, salt="s607w")
    fr.vignette = 0.5


# =============================================================================
# S6-08  ECU: his pupils flood; rack focus to a dust speck; every speck replays its history
# =============================================================================

def _speck_history(fr, X, Y, R, t, k, salt):
    """A dust speck unfolding into facets that stream its history (tiny abstract
    silhouettes and colour fields on 1s): pour, tyres, the crater, Purple's violet."""
    rng = random.Random(salt)
    img, dr = fr.layer()
    nf = 7
    pts = []
    for j in range(nf):
        a = j * math.tau / nf + rng.uniform(-0.2, 0.2)
        pts.append((X + math.cos(a) * R * rng.uniform(0.8, 1.0), Y + math.sin(a) * R * rng.uniform(0.8, 1.0)))
    dr.polygon(pts, fill=(120, 116, 112, 255))
    if k > 0.02:
        pal = [(70, 70, 76), (40, 40, 44), (200, 140, 90), (60, 60, 70), (24, 20, 26), (170, 90, 255), (220, 200, 160)]
        fi = int(t * 24)
        for j in range(nf):
            a0, a1 = pts[j], pts[(j + 1) % nf]
            c = pal[(fi + j * 3 + rng.randint(0, 6)) % len(pal)]
            dr.polygon([(X, Y), a0, a1], fill=c + (int(230 * k),))
            # a tiny silhouette in the facet (a tyre, a figure, a crack)
            mx, my = (X + a0[0] + a1[0]) / 3, (Y + a0[1] + a1[1]) / 3
            q = (fi + j) % 3
            rr = R * 0.12
            if q == 0:
                dr.ellipse([mx - rr, my - rr, mx + rr, my + rr], outline=(240, 240, 250, int(200 * k)),
                           width=max(1, int(fr.ss)))
            elif q == 1:
                dr.line([(mx - rr, my + rr), (mx, my - rr), (mx + rr, my + rr)], fill=(250, 250, 255, int(200 * k)),
                        width=max(1, int(fr.ss)))
            else:
                dr.rectangle([mx - rr * 0.4, my - rr, mx + rr * 0.4, my + rr], fill=(255, 255, 255, int(160 * k)))
        dr.polygon(pts, outline=(220, 236, 255, int(220 * k)), width=max(1, int(fr.ss * 1.2)))
    fr.merge(img)
    if k > 0.02:
        fr.glow.ellipse([X - R * 1.2, Y - R * 1.2, X + R * 1.2, Y + R * 1.2], fill=shade((70, 110, 200), 0.35 * k))


def s6_08(fr):
    t = fr.t
    t20, t28 = T(fr, 20), T(fr, 28)
    rack = seg(t, t20, t28, "inout")
    sink = clamp(t / fr.dur)
    # the void behind, soft (bokeh); its streams rise past as the camera sinks with him
    void_bg(fr, center=(0.12, lerp(0.85, 0.1, sink)), blur=4.0)
    CU, CV, S = 0.68, 0.64, 3.4
    inj = C.opts(fr, "thragg")["injuries"]

    def face():
        inserts.thragg_face(fr, CU, CV, S, expr="analytical", injuries=[i for i in inj if i in ("mouth_blood",)],
                            flip=-1)
        L = inserts.Local(fr, CU, CV, S, 0.0, -1)
        # heavy black brows: the near one half-lifted, frozen mid-travel
        L.poly([(0.16, -0.29), (0.36, -0.35), (0.54, -0.34), (0.52, -0.31), (0.36, -0.315), (0.18, -0.265)],
               THRAGG.hair)
        L.poly([(-0.22, -0.245), (-0.06, -0.265), (0.1, -0.25), (0.09, -0.225), (-0.06, -0.235), (-0.21, -0.22)],
               THRAGG.hair)
        # a twitch under the far eye, held mid-travel; a nostril half-flared
        L.line([(-0.16, -0.03), (-0.06, 0.0), (0.03, -0.02)], shade(THRAGG.skin, 0.66), 0.01)
        L.ell(-0.07, -0.015, 0.05, 0.01, fill=shade(THRAGG.skin, 0.82))
        L.ell(0.46, 0.165, 0.032, 0.016, fill=(120, 74, 70))
        for ex, pupil in ((0.34, 0.4), (-0.06, 0.4)):
            thragg_eye_detail(fr, L, ex, -0.13, open_h=0.05, pupil=pupil, streaks=1.0, t=t, salt=f"s608{ex}",
                              rx=0.1)
    layer, _ = capture(fr, face)
    paste(fr, tint_layer(layer, (0.86, 0.92, 1.06), (0, 2, 12)), blur=rack * 7.0)
    # the speck: kicked up by his plant, falling with him, 0.45 m in front of his eye
    X, Y = 0.19 * fr.W, 0.66 * fr.H
    unf = seg(t, t28, T(fr, 36), "out")
    R = (0.012 + 0.07 * unf) * fr.H
    k_hist = seg(t, t28, T(fr, 32), "inout")
    sp_layer, _ = capture(fr, lambda: _speck_history(fr, X, Y, R, t, k_hist, "s608sp"))
    paste(fr, sp_layer, blur=(1 - rack) * 6.0)
    # ... then every speck in frame does the same, until the frame saturates
    if t >= T(fr, 34):
        rng = fr.srng("s608many")
        n_on = int(60 * seg(t, T(fr, 34), fr.dur, "in"))
        for i in range(60):
            u, v = rng.random(), rng.random()
            if i >= n_on or (abs(u - 0.19) < 0.07 and abs(v - 0.66) < 0.1):
                continue
            rr = rng.uniform(0.008, 0.03) * fr.H
            _speck_history(fr, u * fr.W, v * fr.H, rr, t + i * 0.13, 0.9, f"s608m{i}")
        sat = seg(t, T(fr, 38), fr.dur, "in")
        if sat > 0:
            img, dr = fr.layer()
            dr.rectangle([0, 0, fr.W, fr.H], fill=(180, 210, 255, int(90 * sat)))
            fr.merge(img)
    fr.vignette = 0.6


# =============================================================================
# S6-09  CU -> profile MS: a Blue pins him and turns his torso; Gojo glides in
# =============================================================================
BLUE_PT = (1.5, 2.4)
G_STRIKE_X = -0.25                 # Gojo's hover point a step from the flank (soles y = 0.6)
G_DART = 0.2                       # each touch / the thrust darts him this far in
G_STRIKE_SOLES = 0.6


def _s609_thragg_state(fr, t):
    """Thragg's torso y, turn amount 0..1 (S6-09)."""
    t6 = cue(fr, "blue", 0, 6)
    ty = 2.2 - 0.2 * seg(t, 0.0, t6 + T(fr, 8), "out")
    turn = seg(t, T(fr, 12), T(fr, 30), "inout")
    return ty, turn


def thragg_turned_pose(turn, base=None):
    """The pin draws his right shoulder back: rigid-body rotation, head locked."""
    b = base or T_LUNGE
    p = rot_pose(b, -14 * turn)
    p["neck"] = b["neck"] + 16 * turn
    return p


def s6_09(fr):
    t = fr.t
    t6 = cue(fr, "blue", 0, 6)
    t10, t14 = T(fr, 10), T(fr, 14)
    tq = on2(fr)
    ty, turn = _s609_thragg_state(fr, t)
    # Gojo glides east and down (on 2s), arriving a step from the flank
    gu = seg(tq, t10, T(fr, 32), "inout")
    gx = lerp(G_CORNER_X, G_STRIKE_X, gu)
    gsoles = lerp(3.0, G_STRIKE_SOLES, seg(tq, t10, T(fr, 32), "inout"))
    if gu < 0.02:
        gpose = pose_at(seg(t, T(fr, 4), T(fr, 8), "out"), [(0.0, G_SIGN), (1.0, G_POINT2)])
    else:
        gpose = pose_at(gu, [(0.0, G_POINT2), (0.3, G_GLIDE), (0.85, G_GLIDE), (1.0, G_SET)])
    g_off = soles_offset(GOJO, gpose)
    # ---- camera: CU f0-10, then dolly back and truck east to a profile MS
    cu_k = 1 - seg(t, t10, t14, "inout")
    # the dolly-back widens faster than the glide, so Thragg enters frame-right early
    wz = seg(t, t10, T(fr, 30), "out")
    wc = seg(t, t10, T(fr, 34), "inout")
    zoom = math.exp(lerp(math.log(700.0), math.log(300.0), wz))
    g_head_y = gsoles + g_off + 0.85
    cx = lerp(gx + 0.15, 0.55, wc)
    cy = lerp(g_head_y, 2.05, wc)
    fr.cam = Cam(cx, cy, zoom)
    void_bg(fr, center=(0.5, 0.16))
    if cu_k < 0.999:
        def world():
            # the Blue: low output, a pin rather than a crushing pull
            kb = seg(t, t6, t6 + T(fr, 3), "out")
            if kb > 0:
                fx.blue(fr, BLUE_PT[0], BLUE_PT[1], t - t6, r=0.11 * (0.4 + 0.6 * kb), strength=0.75 * kb,
                        streaks=34, salt="s609b")
            st = thragg_turned_style(turn)
            pose = thragg_turned_pose(turn)
            px, py = pelvis_for_torso(st, pose, 1.0, ty, -1)
            cw = (1.0, 0.4) if t < T(fr, 18) else (1.2, 0.9)
            J = thragg(fr, pose, px, py, -1, void=True, style=st, cape_wind=cw)
            open_flank(fr, J, st, turn)
            # light things first: dust specks, then blood droplets, on straight lines into the core
            if t >= t6:
                rng = fr.srng("s609pull")
                for i in range(70):
                    mass = 0.15 if i < 40 else 0.45
                    a = rng.uniform(0, math.tau)
                    rr = rng.uniform(0.4, 2.2)
                    p0 = (BLUE_PT[0] + math.cos(a) * rr, BLUE_PT[1] + math.sin(a) * rr)
                    if i >= 40:
                        fx0, fy0 = torso_pt(J, st, rng.uniform(0.2, 0.7), rng.uniform(-0.1, 0.2))
                        p0 = (fx0 + rng.uniform(-0.3, 0.2), fy0 + rng.uniform(-0.3, 0.3))
                    x1, y1, u1 = fx.pull(p0, BLUE_PT, t, t_start=t6, mass=mass, strength=1.0)
                    x0, y0, _ = fx.pull(p0, BLUE_PT, t - 1.5 / FPS, t_start=t6, mass=mass, strength=1.0)
                    if u1 >= 0.995:
                        continue
                    col = (150, 14, 26) if i >= 40 else (190, 200, 230)
                    if u1 > 0.01:
                        fr.line([(x0, y0), (x1, y1)], col, width_px=1.5 + 2 * u1)
                    else:
                        fr.circle(x1, y1, 0.012, fill=col)
            info_wash(fr, J, st, t, k=0.5, n=26, salt="s609w")
            gojo(fr, gpose, gx, gsoles + g_off, 1, void=True)
            if gu > 0.05:
                fx.trail(fr, [(lerp(G_CORNER_X, gx, k / 6) - 0.1, lerp(4.0, gsoles + 1.0, k / 6)) for k in range(7)],
                         width_m=0.35, alpha=50, color=(170, 200, 255))
        layer, _ = capture(fr, world)
        paste(fr, layer, alpha=1 - cu_k)
    if cu_k > 0.001:
        def cu():
            inserts.gojo_face(fr, 0.42, 0.55, 0.95, expr="focused", eyes="open", t=t, eye_glow=0.0)
            L = inserts.Local(fr, 0.42, 0.55, 0.95, 0.0, 1)
            neck_blindfold(L)
            jacket_tear(L)
            for ex, sz in ((-0.12, 0.85), (0.3, 1.0)):
                gojo_eye(fr, L, ex, -0.15, sz, lid=0.7, gaze=(0.3, 0.05), veins=0.9, salt=f"s609v{ex}", glow=0.4)
            # two fingers of his right hand lift into frame, pointing past camera screen-right
            lift = seg(t, T(fr, 4), T(fr, 8), "out")
            if lift > 0:
                hv = lerp(1.2, 0.78, lift)
                Lh = inserts.Local(fr, 0.74, hv, 0.5, -78.0, 1)
                Lh.poly([(-0.5, 0.9), (0.25, 0.9), (0.38, 1.6), (-0.7, 1.6)], GOJO.suit)
                Lh.poly([(-0.36, 0.0), (0.22, -0.04), (0.3, 0.55), (0.06, 0.92), (-0.34, 0.9), (-0.42, 0.4)], GOJO.skin)
                Lh.poly([(-0.3, 0.02), (-0.16, -0.02), (-0.14, -1.0), (-0.28, -0.98)], GOJO.skin)
                Lh.poly([(-0.1, 0.0), (0.04, -0.02), (0.08, -0.92), (-0.06, -0.94)], shade(GOJO.skin, 0.94))
        layer, _ = capture(fr, cu)
        layer = tint_layer(layer, (0.8, 0.88, 1.1), (0, 4, 18))
        paste(fr, layer, alpha=cu_k)
        if t >= t6:
            # the Blue forms off-screen right: its cold light catches his cheek
            kb = seg(t, t6, t6 + T(fr, 3), "out")
            fr.soft_circle(1.04, 0.5, 0.35, shade((40, 90, 200), kb), world=False)
    fr.vignette = 0.45


# =============================================================================
# S6-10  MCU two-shot: three one-frame touches; the spear-hand wakes him
# =============================================================================

def _s610(fr, t):
    """Shared state for S6-10: Thragg's pose/position, contact times."""
    c1 = cue(fr, "punch_light", 0, 4)
    c2 = cue(fr, "punch_light", 1, 9)
    c3 = cue(fr, "punch_light", 2, 14)
    c4 = cue(fr, "punch_heavy", 0, 23)
    c5 = cue(fr, "punch_heavy", 1, 32)
    c6 = cue(fr, "blood_spit", 0, 38)
    return c1, c2, c3, c4, c5, c6


def s6_10(fr):
    t = fr.t
    f1 = 1.0 / FPS
    c1, c2, c3, c4, c5, c6 = _s610(fr, t)
    t26, t38, t44 = T(fr, 26), T(fr, 38), T(fr, 44)
    shake = C.shake(t, c4, 6.0, dur=2 * f1)
    fr.cam = Cam(0.5, 2.05, 350.0, shake=shake)
    void_bg(fr, center=(0.5, 0.13), info=1.0 if t < c4 else 0.6)
    # ---- Thragg: pinned, turned; the corkscrew on reflex (f26-38)
    cork = seg(t, t26, t38, "out")
    twist = math.sin(clamp((t - t26) / max(1e-6, t38 - t26)) * math.pi) * (1 - cork * 0.4)
    st = thragg_turned_style(1.0 - 0.25 * cork)
    base = thragg_turned_pose(1.0)
    # touch one: the cocked right elbow is snapped up and out of the line
    el_up = seg(t, c1, c1 + f1, "linear")
    base = P(base, ua_f=base["ua_f"] - 22 * el_up, fa_f=base["fa_f"] + 50 * el_up)
    # touch two: the hip squared (the heart now behind the open ribs)
    base = rot_pose(base, -4 * seg(t, c2, c2 + f1, "linear"))
    pose = rot_pose(base, 12 * twist - 4 * cork)
    roll = 0.1 * cork
    # his right hand begins to rise (f44-66)
    if t >= t44:
        r_up = seg(t, t44, fr.dur, "inout")
        pose = P(pose, ua_f=pose["ua_f"] + 30 * r_up, fa_f=pose["fa_f"] + 40 * r_up, hand_f="claw")
    tpx, tpy = pelvis_for_torso(st, pose, 1.0 + roll, 2.0, -1)
    Jt = solve(st, pose, tpx, tpy, -1)
    # contact targets: the elbow up by his head, the hip, the gap between two exposed ribs
    J0 = solve(st, base, *pelvis_for_torso(st, base, 1.0, 2.0, -1), -1)
    elbow = Jt["el_f"]
    hip = torso_pt(J0, st, 0.1, 0.22)
    rib_gap = torso_pt(J0, st, 0.62, 0.17)
    entry = rib_gap                               # the spear-hand's line (fixed: the arm is locked)
    # ---- Gojo: 4-frame wind-up / ONE-frame contact, x3; then the spear-hand (f15-22 / f23)
    g_off = soles_offset(GOJO, G_SET)
    gy = G_STRIKE_SOLES + g_off
    gx = G_STRIKE_X
    gpose = G_SET
    wind = 4 * f1
    for (c, target, side, hk) in ((c1, elbow, "f", "open"), (c2, hip, "n", "point"), (c3, rib_gap, "n", "point")):
        if c - wind <= t < c + f1:
            if t >= c - 1e-6:
                gx = G_STRIKE_X + G_DART
                gpose = reach(GOJO, P(G_SET, lean=18, **{f"hand_{side}": hk}), gx, gy, 1, side, target,
                              elbow="down")
            else:
                w = seg(t, c - wind, c - f1, "inout")
                cock = P(G_SET, lean=4, **{f"ua_{side}": -36, f"fa_{side}": 70, f"hand_{side}": hk})
                gpose = pose_at(w, [(0.0, G_SET), (1.0, cock)])
                gx = G_STRIKE_X - 0.05 * w
    t15 = c3 + f1
    if t >= t15:
        # 8 frames of anticipation: the spear-hand draws back, shoulder and hip wind
        a = seg(t, t15, c4 - f1, "inout")
        gpose = pose_at(a, [(0.0, G_SET), (1.0, G_SPEAR_WIND)])
        gx = G_STRIKE_X - 0.1 * a
    if t >= c4 - 1e-6:
        # CONTACT: wrist-deep; the arm stays straight and locked, the twist does not turn him
        gx = G_STRIKE_X + G_DART
        gpose = reach(GOJO, P(G_SPEAR, hand_n="point"), gx, gy, 1, "n", (entry[0] + 0.14, entry[1] - 0.02))
    G = None

    def draw_gojo():
        return gojo(fr, gpose, gx, gy, 1, void=True)
    # the Blue, still glowing behind his right shoulder
    fx.blue(fr, BLUE_PT[0] + roll, BLUE_PT[1], t + 1.2, r=0.1, strength=0.7, streaks=26, salt="s610b")
    if t < c4:
        G = draw_gojo()
        J = thragg(fr, pose, tpx, tpy, -1, void=True, style=st, eyes="cold", cape_wind=(1.2, 0.9))
        open_flank(fr, J, st, 1.0)
    else:
        G = draw_gojo()
        J = thragg(fr, pose, tpx, tpy, -1, void=True, style=st, eyes="wide", switch=c6, cape_wind=(1.2, 0.9))
        open_flank(fr, J, st, 1.0, wound=(0.62, 0.17), lung=seg(t, T(fr, 35), T(fr, 38), "out"))
        # the arm, locked, entering the rib gap (the hand is inside him)
        ex, ey = G["el_n"]
        fr.line([(ex, ey), entry], GOJO_V.suit, width_m=GOJO.w_fa * 1.0)
        fr.line([(lerp(ex, entry[0], 0.7), lerp(ey, entry[1], 0.7)), entry], (120, 10, 20), width_m=GOJO.w_fa * 0.9)
        # blood burst from the flank wound, droplets hanging (perception time)
        rng = fr.srng("s610burst")
        ts = t - c4
        for i in range(40):
            a = rng.uniform(math.pi * 0.45, math.pi * 1.4)
            sp = rng.uniform(0.15, 0.8)
            dd = sp * (1 - math.exp(-ts * 2.2))
            fr.circle(entry[0] + math.cos(a) * dd, entry[1] + math.sin(a) * dd * 0.8 - 0.05 * ts,
                      rng.uniform(0.008, 0.02), fill=(150, 10, 22))
        if t >= c5:
            # two ribs snap
            for k in range(2):
                p_ = torso_pt(J, st, 0.5 + 0.1 * k, 0.12)
                fr.line([(p_[0] - 0.04, p_[1] + 0.03), (p_[0] + 0.01, p_[1] - 0.01), (p_[0] - 0.02, p_[1] - 0.05)],
                        (250, 240, 230), width_px=3)
            impact_scaled(fr, entry[0] + 0.05, entry[1] + 0.12, t - c5, kind="light", k=0.3, salt="s610rib")
        if t >= c6:
            # frothy blood bursts from the mouth; droplets hang
            mx, my = head_at(J, st, 0.85, -0.6)
            rng = fr.srng("s610froth")
            ts = t - c6
            for i in range(30):
                a = rng.uniform(math.pi * 0.7, math.pi * 1.25)
                sp = rng.uniform(0.1, 0.5)
                dd = sp * (1 - math.exp(-ts * 2.5))
                col = (196, 60, 76) if i % 3 else (230, 170, 180)
                fr.circle(mx + math.cos(a) * dd, my + math.sin(a) * dd * 0.6 - 0.03 * ts, rng.uniform(0.007, 0.018),
                          fill=col)
    # contact frames: a small pop at each touch
    for (c, target) in ((c1, elbow), (c2, hip), (c3, rib_gap)):
        if c - 1e-6 <= t < c + f1:
            impact_scaled(fr, target[0], target[1], 0.01, kind="light", k=0.22, salt=f"s610t{c}")
    # ---- Thragg's eye: the streaks pour in; each touch freezes them for ONE frame;
    #      from the spear-hand they stop, the clouding stays, the eye drags onto Gojo's
    ex_, ey_ = head_at(J, st, 0.78, 0.14)
    gxh, gyh = head_at(G, GOJO_V, 0.7, 0.08)
    awake = t >= c4 - 1e-6
    strobe = any(c - 1e-6 <= t < c + f1 for c in (c1, c2, c3))
    r_eye = THRAGG.head_r * 0.22
    fr.ellipse(ex_, ey_, r_eye * 1.3, r_eye * (0.9 if awake else 0.6), fill=(222, 216, 216))
    if awake:
        drag = seg(t, c4 + f1, c4 + 5 * f1, "out")
        dx, dy = gxh - ex_, gyh - ey_
        L_ = math.hypot(dx, dy) or 1
        ix, iy = ex_ + dx / L_ * r_eye * 0.5 * drag, ey_ + dy / L_ * r_eye * 0.3 * drag
    else:
        ix, iy = ex_ + 0.003, ey_
    fr.circle(ix, iy, r_eye * 0.55, fill=(40, 26, 22))
    fr.circle(ix, iy, r_eye * 0.3, fill=(6, 4, 6))
    if awake:
        fr.circle(ix, iy, r_eye * 0.6, fill=None, outline=(200, 214, 236), width=1)
        img, dr = fr.layer()
        X, Y = fr.P(ix, iy)
        R = fr.S(r_eye * 0.7)
        dr.ellipse([X - R, Y - R, X + R, Y + R], fill=(210, 224, 245, 80))
        fr.merge(img)
    else:
        rng = fr.srng("s610str")
        ts = (c1 if strobe and t < c2 else c2 if strobe and t < c3 else c3 if strobe else t) - (f1 if strobe else 0)
        for i in range(34):
            a = rng.uniform(0, math.tau)
            z = (rng.random() + ts * rng.uniform(0.9, 1.6) * 1.6) % 1.0
            r0 = 0.04 + 0.26 * (1 - z)
            r1 = max(0.012, r0 - 0.05 - 0.04 * z)
            col = mix_color((120, 180, 255), (255, 255, 255), rng.random() * 0.6)
            k = 0.45 if strobe else 1.0
            fr.glow_line([(ex_ + math.cos(a) * r0, ey_ + math.sin(a) * r0),
                          (ex_ + math.cos(a) * r1, ey_ + math.sin(a) * r1)], shade(col, k * (0.4 + 0.6 * z)),
                         width_px=1 + 1.5 * z)
            fr.line([(ex_ + math.cos(a) * r0, ey_ + math.sin(a) * r0), (ex_ + math.cos(a) * r1, ey_ + math.sin(a) * r1)],
                    shade(col, 0.8 if not strobe else 1.0), width_px=1)
        if strobe:
            fr.circle(ex_, ey_, 0.06, fill=None, outline=(255, 255, 255), width=2)
    if abs(t - c4) < 0.5 * f1:
        fr.invert = 1.0                   # impact frame: f23 only
    fr.vignette = 0.45


# =============================================================================
# S6-11  OTS over Thragg's right shoulder: the grab stalls 1 cm short; the flood slams back
# =============================================================================
THROAT = (-0.2, 2.2)


def s6_11(fr):
    t = fr.t
    f1 = 1.0 / FPS
    t3 = cue(fr, "infinity_stop", 0, 3)
    t22 = cue(fr, "cloth", 0, 22)
    t28 = cue(fr, "domain_bed", 0, 28)
    t10 = T(fr, 10)
    zoom = lerp(560.0, 470.0, seg(t, 0.0, fr.dur, "inout"))
    fr.cam = Cam(0.25, 2.12, zoom)
    void_bg(fr, center=(0.6, 0.12), blur=1.5, info=0.8 if t < t28 else 1.0)
    # ---- Gojo (sharp, MCU): holds Thragg's eyes; withdraws the spear-hand f22-28; drifts back a metre
    tq = on2(fr)
    wd = seg(tq, t22, t28, "inout")
    drift = seg(tq, t28, fr.dur, "inout")
    gx = lerp(G_STRIKE_X + G_DART, -1.3, drift)
    g_off = soles_offset(GOJO, G_SET)
    gy = G_STRIKE_SOLES + g_off
    arm_in = reach(GOJO, P(G_SPEAR, hand_n="point"), G_STRIKE_X + G_DART, gy, 1, "n", (1.0, 2.05))
    gpose = pose_at(wd, [(0.0, arm_in), (1.0, P(G_SET, hand_n="open"))])
    G = gojo(fr, gpose, gx, gy, 1, void=True)
    if wd > 0.6:
        bloody_hand(fr, G)
    # the arc of blood beads left frozen in the air behind the withdrawn hand
    if t >= t22:
        rng = fr.srng("s611arc")
        for i in range(26):
            u = i / 25
            if u > wd + 0.05:
                continue
            x = lerp(1.0, 0.25, u) + rng.uniform(-0.03, 0.03)
            y = 2.05 + math.sin(u * math.pi) * 0.12 + rng.uniform(-0.03, 0.03)
            fr.circle(x, y, rng.uniform(0.006, 0.014), fill=(150, 10, 22))
    # the hand's frozen target (world): where his throat was
    gx0 = G_STRIKE_X + G_DART
    G0 = solve(GOJO, arm_in, gx0, gy, 1)
    TH = (G0["neck"][0] + 0.08, G0["neck"][1] - 0.03)
    # ---- the grab: 80% of the gap in 2 frames, 15% more over f3-9, then it crawls and hangs
    if t < t3:
        g = 0.8 * EASE["out"](clamp(t / max(1e-6, T(fr, 2))))
    elif t < t10:
        g = 0.8 + 0.15 * EASE["out"](clamp((t - t3) / max(1e-6, t10 - t3)))
    else:
        g = 0.95 + 0.045 * (1 - math.exp(-3.0 * (t - t10)))
    if t >= t28:
        g = 0.95 + 0.045 * (1 - math.exp(-3.0 * (t28 - t10)))       # the hand stops trying; locked
    # hand path in screen space: from the foreground shoulder to 1 cm short of the throat
    TX, TY = w2s(fr, *TH)
    S0 = (0.98, 0.86)
    gap = 0.012
    HX, HY = lerp(S0[0], TX + gap * 1.8, g), lerp(S0[1], TY + gap * 0.4, g)
    trem = 0.0
    if t10 <= t < t28:
        trem = 0.0025 * math.sin(t * 90) + 0.0015 * math.sin(t * 143)
    # ---- Infinity: refraction around the throat, compressed-air ripple, blood beads hanging
    k_inf = seg(t, t3 - f1, t3 + f1, "out") * (1 - 0.5 * seg(t, t28, fr.dur, "inout"))
    tw = s2w(fr, TX, TY)
    hw = s2w(fr, HX, HY)
    if k_inf > 0:
        fx.infinity(fr, tw[0], tw[1], r=0.32, strength=0.55 * k_inf, t=t)
        if t >= t3:
            impact_scaled(fr, hw[0] - 0.02, hw[1], (t - t3) % 0.45, kind="blocked", k=0.28, salt="s611blk",
                          dirx=-1.0)
        rng = fr.srng("s611beads")
        for i in range(12):
            bx = hw[0] - rng.uniform(0.0, 0.03) + math.sin(t * 40 + i) * 0.002
            by = hw[1] + rng.uniform(-0.05, 0.05) + math.cos(t * 33 + i) * 0.002
            fr.circle(bx, by, rng.uniform(0.004, 0.009), fill=(150, 10, 22))
        fx.suspended_dust(fr, hw[0] - 0.05, hw[1] - 0.05, tw[0] + 0.02, hw[1] + 0.05, n=18, t=t, salt="s611d",
                          size=0.004, color=(200, 210, 230))
    # ---- Thragg's foreground: shoulder, ear, the rising right arm (soft); hand sharp
    def fg_body():
        d = fr.draw
        W, H = fr.W, fr.H
        # the massive right shoulder (white suit), crimson yoke along its top
        d.polygon([(0.7 * W, 1.02 * H), (0.74 * W, 0.7 * H), (0.8 * W, 0.56 * H), (0.88 * W, 0.47 * H),
                   (0.96 * W, 0.43 * H), (1.02 * W, 0.42 * H), (1.02 * W, 1.02 * H)], fill=THRAGG_V.suit)
        d.polygon([(0.79 * W, 0.575 * H), (0.88 * W, 0.47 * H), (0.96 * W, 0.43 * H), (1.02 * W, 0.42 * H),
                   (1.02 * W, 0.52 * H), (0.93 * W, 0.53 * H), (0.84 * W, 0.6 * H)], fill=THRAGG_V.accent)
        # thick neck, the back of the head (close-cropped black hair), the right ear
        hy = 0.08 * H
        d.polygon([(0.87 * W, 0.48 * H), (0.885 * W, 0.3 * H), (1.02 * W, 0.28 * H), (1.02 * W, 0.46 * H)],
                  fill=shade(THRAGG_V.skin, 0.85))
        d.ellipse([0.86 * W, -0.02 * H + hy, 1.06 * W, 0.36 * H + hy], fill=THRAGG_V.skin)
        d.ellipse([0.852 * W, -0.1 * H + hy, 1.08 * W, 0.27 * H + hy], fill=THRAGG_V.hair)
        d.ellipse([0.862 * W, 0.15 * H + hy, 0.886 * W, 0.26 * H + hy], fill=shade(THRAGG_V.skin, 0.9))
        d.arc([0.866 * W, 0.165 * H + hy, 0.882 * W, 0.245 * H + hy], 100, 260, fill=shade(THRAGG_V.skin, 0.62),
              width=max(1, int(3 * fr.ss)))
    body, _ = capture(fr, fg_body)
    paste(fr, body, blur=7.0)

    def fg_arm():
        d = fr.draw
        W, H = fr.W, fr.H
        hx, hy = (HX + trem) * W, (HY + trem * 0.6) * H
        sx, sy = 0.9 * W, 0.62 * H
        ex, ey = lerp(sx, hx, 0.5) + 0.02 * W, lerp(sy, hy, 0.5) + 0.07 * H
        # upper arm (wide, near) -> forearm (tapering away): foreshortened
        d.polygon([(sx - 0.07 * H, sy - 0.1 * H), (ex - 0.03 * H, ey - 0.055 * H), (ex + 0.02 * H, ey + 0.06 * H),
                   (sx + 0.08 * H, sy + 0.12 * H)], fill=THRAGG_V.suit)
        d.polygon([(ex - 0.03 * H, ey - 0.05 * H), (hx + 0.02 * H, hy - 0.022 * H), (hx + 0.024 * H, hy + 0.024 * H),
                   (ex + 0.03 * H, ey + 0.055 * H)], fill=shade(THRAGG_V.suit, 0.92))
    arm, _ = capture(fr, fg_arm)
    paste(fr, arm, blur=2.5)
    # the hand: crimson glove, fingers hooked for the windpipe (in focus)
    hx, hy = (HX + trem) * fr.W, (HY + trem * 0.6) * fr.H
    r = 0.028 * fr.H
    fr.draw.ellipse([hx - r * 0.2, hy - r, hx + r * 1.6, hy + r], fill=THRAGG_V.accent)
    for k in (-1, 0, 1):
        a = math.pi + k * 0.45
        fr.draw.line([(hx, hy + k * r * 0.4), (hx + math.cos(a) * r * 1.5, hy + k * r * 0.5 + math.sin(a) * r * 0.6)],
                     fill=shade(THRAGG_V.accent, 1.1), width=max(1, int(r * 0.45)))
    # ---- f28: the flood slams back in ONE frame: streams pour into his head again
    if t >= t28:
        rng = fr.srng("s611flood")
        HXh, HYh = 0.96 * fr.W, 0.2 * fr.H
        for i in range(60):
            a = rng.uniform(math.pi * 0.5, math.pi * 1.5)
            z = (rng.random() + t * rng.uniform(1.0, 1.8)) % 1.0
            r0 = (0.05 + 0.4 * (1 - z)) * fr.H
            r1 = max(0.02 * fr.H, r0 - (0.03 + 0.04 * z) * fr.H)
            col = mix_color((120, 180, 255), (255, 255, 255), rng.random() * 0.6)
            fr.glow.line([(HXh + math.cos(a) * r0, HYh + math.sin(a) * r0),
                          (HXh + math.cos(a) * r1, HYh + math.sin(a) * r1)], fill=shade(col, 0.5 + 0.5 * z),
                         width=max(1, int(fr.ss * 2)))
    # the Blue behind his shoulder, out of focus in the foreground
    fx.blue(fr, *s2w(fr, 0.965, 0.34, 0.6), t + 2.0, r=0.03, strength=0.45, streaks=10, salt="s611b", d=0.6)
    fr.vignette = 0.5


# =============================================================================
# S6-12  CU on Thragg; rack to Gojo, who decides; rack back to a bleeding blank face
# =============================================================================

def s6_12(fr):
    t = fr.t
    f1 = 1.0 / FPS
    r1 = seg(t, T(fr, 40), T(fr, 50), "inout")
    r2 = seg(t, T(fr, 100), T(fr, 110), "inout")
    focus_bg = r1 * (1 - r2)                  # 0 = Thragg sharp, 1 = Gojo sharp
    tq = on2(fr)
    # ---- the void, soft
    void_bg(fr, center=(0.3, 0.14), blur=5.0)
    # ---- Gojo in the background (screen-left): breathing hard, the hand, the jaw, the drift back
    drift = seg(tq, T(fr, 96), fr.dur, "inout")
    gxw = lerp(-1.3, -7.0, drift)
    gsoles = lerp(0.6, 3.0, drift)
    dg = lerp(1.5, 3.9, drift)
    fr.cam = Cam(0.4, 2.3, 380.0)
    heave = math.sin(tq * math.tau / T(fr, 26))
    look = seg(tq, T(fr, 54), T(fr, 62), "inout") * (1 - seg(tq, T(fr, 88), T(fr, 96), "inout"))
    flex = seg(tq, T(fr, 64), T(fr, 68), "inout") * (1 - seg(tq, T(fr, 74), T(fr, 78), "inout"))
    gpose = P(G_TIRED, lean=G_TIRED["lean"] + 4 * heave, neck=G_TIRED["neck"] + 4 * heave + 30 * look,
              ua_n=8 + 22 * look, fa_n=4 + 100 * look, hand_n="fist" if flex > 0.5 else "open")
    g_off = soles_offset(GOJO, gpose)

    def back():
        G = gojo(fr, gpose, gxw, gsoles + g_off, 1, depth=dg, void=True, mouth="flat")
        bloody_hand(fr, G, d=dg)
        return G
    gl, G = capture(fr, back)
    paste(fr, gl, blur=lerp(6.0, 0.0, focus_bg))
    # ---- Thragg's face (screen-right CU) + the frozen hand reaching into frame-centre
    blood = seg(t, T(fr, 52), T(fr, 98), "inout")            # runs only while out of focus
    pupils = seg(t, T(fr, 20), T(fr, 30), "inout")
    hb = max(pulse(t, cue(fr, "heartbeat", k, 2 + 32 * k), 2 * f1, 8 * f1) for k in range(3))
    CU_, CV_, S_ = 0.76, 0.52, 1.05
    inj = C.opts(fr, "thragg", switch=T(fr, 75))["injuries"]

    def face():
        # the frozen right arm, reaching across to frame-centre for a throat that is gone
        d = fr.draw
        W, H = fr.W, fr.H
        hx, hy = 0.42 * W, 0.6 * H
        d.polygon([(0.74 * W, 1.05 * H), (0.6 * W, 0.78 * H), (hx + 0.03 * H, hy - 0.035 * H),
                   (hx + 0.045 * H, hy + 0.045 * H), (0.66 * W, 0.88 * H), (0.84 * W, 1.05 * H)], fill=THRAGG_V.suit)
        r = 0.04 * H
        d.ellipse([hx - r * 0.3, hy - r, hx + r * 1.5, hy + r], fill=THRAGG_V.accent)
        for k in (-1, 0, 1):
            a = math.pi + k * 0.4
            d.line([(hx, hy + k * r * 0.4), (hx + math.cos(a) * r * 1.4, hy + k * r * 0.5 + math.sin(a) * r * 0.6)],
                   fill=shade(THRAGG_V.accent, 1.1), width=max(1, int(r * 0.45)))
        inserts.thragg_face(fr, CU_, CV_, S_, expr="analytical",
                            injuries=[i for i in inj if i in ("mouth_blood", "nosebleed", "eye_blood")], flip=-1)
        L = inserts.Local(fr, CU_, CV_, S_, 0.0, -1)
        thragg_ear(L, True, blood=0.3 + 0.7 * blood)
        # frozen half-snarl and frothy blood at the lips
        L.poly([(0.08, 0.4), (0.4, 0.38), (0.38, 0.47), (0.1, 0.48)], (64, 24, 26))
        L.line([(0.1, 0.405), (0.38, 0.39)], (232, 226, 214), 0.014)
        for k in range(6):
            L.ell(0.12 + k * 0.05, 0.47 + 0.01 * (k % 2), 0.018, 0.014, fill=(214, 120, 130))
        # pupils: left blown wide, right a pinpoint, both blank; the streaks keep pouring in
        for ex, p_w in ((0.34, lerp(0.38, 0.08, pupils)), (-0.06, lerp(0.38, 0.97, pupils))):
            thragg_eye_detail(fr, L, ex, -0.13, open_h=0.045, pupil=p_w, streaks=1.0, t=t, salt=f"s612{ex}")
        # blood: beads at the nostrils, ear and tear ducts; streaks advanced only out of focus
        for (bx, by) in ((0.47, 0.2), (0.24, -0.1), (-0.17, -0.1)):
            L.ell(bx, by, 0.016, 0.016, fill=(160, 10, 22))
            if blood > 0:
                L.line([(bx, by), (bx - 0.005, by + 0.32 * blood)], (150, 8, 18), 0.016)
        # a barely visible irregular pulse at the temple
        if hb > 0:
            L.ell(0.12, -0.48, 0.05 * (0.6 + 0.4 * hb), 0.03, fill=shade(THRAGG.skin, 0.94 + 0.04 * hb))
    fl, _ = capture(fr, face)
    fl = tint_layer(fl, (0.86, 0.92, 1.06), (0, 2, 12))
    paste(fr, fl, blur=lerp(0.0, 9.0, focus_bg))
    fr.vignette = 0.55


# =============================================================================
# S6-13  EWS outside, real time: a silent black dome for exactly 2.0 s; it thins
# =============================================================================
DOME_X, DOME_R = -4.0, 13.0


def _dome(fr, t, thin):
    """fx.domain_dome clipped at the asphalt (a hemisphere), thinning from the crown."""
    gimg, gdraw = getattr(fr, "glow_img", None), getattr(fr, "_glow_draw", None)
    fr.glow_img = Image.new("RGB", (fr.W, fr.H), (0, 0, 0))
    fr._glow_draw = ImageDraw.Draw(fr.glow_img)
    try:
        layer, _ = capture(fr, lambda: fx.domain_dome(fr, DOME_X, 0.0, DOME_R, u=1.0, t=t))
        glow = fr.glow_img
    finally:
        fr.glow_img, fr._glow_draw = gimg, gdraw
    base_y = int(fr.P(0.0, 0.0)[1])
    mask = Image.new("L", (fr.W, fr.H), 255)
    ImageDraw.Draw(mask).rectangle([0, base_y, fr.W, fr.H], fill=0)
    if thin > 0:
        top_y = fr.P(0.0, DOME_R)[1]
        front = lerp(top_y - 0.1 * (base_y - top_y), base_y, EASE["out"](thin))
        arr = np.asarray(mask).astype(np.float32)
        yy = np.arange(fr.H, dtype=np.float32)[:, None]
        band = (base_y - top_y) * 0.35
        k = np.clip((front - yy) / band + 0.5, 0, 1)
        rng = np.random.default_rng(int(fr.f // 2) + 7)
        noise = rng.random((24, 40)).astype(np.float32)
        nimg = Image.fromarray((noise * 255).astype(np.uint8)).resize((fr.W, fr.H), Image.BILINEAR)
        n = np.asarray(nimg).astype(np.float32) / 255.0
        alpha = 1 - 0.4 * np.clip(k * (0.7 + 0.6 * n), 0, 1)
        mask = Image.fromarray(np.clip(arr * alpha, 0, 255).astype(np.uint8))
    layer.putalpha(ImageChops.multiply(layer.getchannel("A"), mask))
    fr.img.paste(layer, (0, 0), layer)
    # fx.domain_dome's halo is a FILLED glow disc (R x 1.06): screened three
    # times at finish() it would turn the "perfectly black" dome mid-blue. Keep
    # only the thin ring outside the barrier, at half strength.
    cx_, cy_ = fr.P(DOME_X, 0.0)
    Rpx = fr.S(DOME_R)
    ring = Image.new("L", (fr.W, fr.H), 0)
    ImageDraw.Draw(ring).ellipse([cx_ - Rpx * 1.07, cy_ - Rpx * 1.07, cx_ + Rpx * 1.07, cy_ + Rpx * 1.07], fill=128)
    ImageDraw.Draw(ring).ellipse([cx_ - Rpx * 0.995, cy_ - Rpx * 0.995, cx_ + Rpx * 0.995, cy_ + Rpx * 0.995], fill=0)
    gm = Image.new("RGB", (fr.W, fr.H), (0, 0, 0))
    gm.paste(glow, (0, 0), ImageChops.multiply(mask, ring))
    fr.glow_img = ImageChops.add(fr.glow_img, gm) if fr.glow_img is not None else gm
    fr._glow_draw = ImageDraw.Draw(fr.glow_img)
    # the hair-thin line of cold blue light where it meets the asphalt
    flick = 1.0 if thin <= 0 else 0.6 + 0.4 * random.Random(fr.f).random()
    fr.line([(DOME_X - DOME_R, 0.0), (DOME_X + DOME_R, 0.0)], shade((150, 210, 255), flick), width_px=1.5)
    fr.glow_line([(DOME_X - DOME_R, 0.0), (DOME_X + DOME_R, 0.0)], shade((60, 120, 220), flick), width_px=5)


def s6_13(fr):
    t = fr.t
    t48 = T(fr, 48)
    fr.cam = Cam(-2.0, 8.0, 22.0)
    C.stage(fr, SEQ, "street")
    # wind: dust and paper sliding east -> west, around the dome's curve
    rng = fr.srng("s613wind")
    behind = []
    for i in range(90):
        sp = rng.uniform(5.0, 11.0)
        x = (rng.uniform(-50, 50) - sp * (t + 2.0)) % 100 - 48
        y0 = rng.uniform(0.05, 1.6)
        dz = rng.choice([0.85, 0.92, 1.0, 1.0, 1.1])
        dx = x - DOME_X
        y = y0
        if dz >= 1.0 and abs(dx) < DOME_R + 0.6:
            y = max(y0, math.sqrt(max(0.0, (DOME_R + 0.4) ** 2 - dx * dx)) * (0.15 + 0.85 * (y0 / 1.6)))
        paper = i % 6 == 0
        behind.append((dz, x, y, paper, i))
    for dz, x, y, paper, i in behind:
        if dz < 1.0:
            continue
        _wind_bit(fr, x, y, dz, paper, i, t)
    thin = seg(t, t48, fr.dur, "inout")
    _dome(fr, t, thin)
    for dz, x, y, paper, i in behind:
        if dz >= 1.0:
            continue
        _wind_bit(fr, x, y, dz, paper, i, t)
    fr.vignette = 0.4


def _wind_bit(fr, x, y, dz, paper, i, t):
    if paper:
        tq = math.floor(t * 12) / 12.0
        a = tq * 7 + i
        s = 0.22
        pts = [(x + math.cos(a) * s, y + 0.12 + math.sin(a) * s * 0.4), (x - math.cos(a) * s, y + 0.12 - math.sin(a) * s * 0.4),
               (x - math.cos(a) * s + 0.05, y - 0.05), (x + math.cos(a) * s + 0.05, y + 0.02)]
        fr.poly(pts, (222, 218, 206), d=dz)
    else:
        X, Y = fr.P(x, y, dz)
        r = max(1.0, fr.ss * 1.4 / dz)
        fr.draw.ellipse([X - r, Y - r, X + r, Y + r], fill=(176, 156, 136))


# =============================================================================
# S6-14  WS: the void peels back from the edges; dusk returns; the Blue winks out
# =============================================================================

def _void_mask(fr, prog):
    """Organic, asymmetric edge-inward erosion of the void (never a clean iris).
    Returns (mask L image 0..255, burn-edge L image)."""
    w, h = 192, 108
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    u, v = xx / (w - 1), yy / (h - 1)
    # distance from the frame edge, biased: it eats faster from the left (the dusk key) and the top
    edge = np.minimum.reduce([u * 0.8, (1 - u) * 1.15, v * 0.9, (1 - v) * 1.2]) * 2.0
    rng = np.random.default_rng(1234)
    noise = np.zeros((h, w), np.float32)
    for oct_, amp in ((6, 0.5), (14, 0.3), (30, 0.15)):
        g = rng.random((oct_ * 9 // 16 + 2, oct_ + 2)).astype(np.float32)
        gi = Image.fromarray((g * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC)
        noise += amp * (np.asarray(gi).astype(np.float32) / 255.0)
    field = edge * 0.78 + noise * 0.42
    thr = prog * 1.25
    soft = 0.03
    m = np.clip((field - thr) / soft, 0, 1)
    burn = np.clip(1 - np.abs(field - thr - 0.012) / 0.018, 0, 1) * (prog > 0.001) * (1 - 0.6 * prog)
    mi = Image.fromarray((m * 255).astype(np.uint8)).resize((fr.W, fr.H), Image.BILINEAR)
    bi = Image.fromarray((burn * 255).astype(np.uint8)).resize((fr.W, fr.H), Image.BILINEAR)
    return mi, bi


def s6_14(fr):
    t = fr.t
    f1 = 1.0 / FPS
    t84 = cue(fr, "domain_close", 0, 84)
    t85 = t84 + f1
    fr.cam = Cam(-3.0, 3.5, 90.0)
    C.stage(fr, SEQ, "street")
    bake(fr)                         # the dusk haze belongs to the street, under the void
    # ---- the void, dissolving from its edges inward (f12-85)
    prog = seg(t, T(fr, 12), t84, "in") ** 0.8 if t < t85 - 1e-6 else 1.0
    # the information streams slow (f0-20): integrate a falling rate 1 -> 0.15
    t20 = T(fr, 20)
    if t < t20:
        slow_t = t - 0.425 * t * t / t20
    else:
        slow_t = t20 * 0.575 + (t - t20) * 0.15
    if prog < 0.999:
        vl, _ = capture(fr, lambda: fx.domain_void(fr, void_time(fr) - t + slow_t, intensity=lerp(1.0, 0.6, prog),
                                                   center=(0.5, 0.2), info=lerp(1.0, 0.25, seg(t, 0.0, T(fr, 20)))))
        # glow drawn by domain_void lands in fr.glow: dim it with the void's extent below
        mask, burn = _void_mask(fr, prog)
        vl.putalpha(mask)
        fr.img.paste(vl, (0, 0), vl)
        # burning-film edge: warm light where the void peels back
        edge = Image.new("RGB", (fr.W, fr.H), (255, 150, 80))
        fr.img.paste(edge, (0, 0), burn.point(lambda v: int(v * 0.6)))
        if fr.glow_img is not None:
            gm = mask.point(lambda v: v)
            fr.glow_img = Image.composite(fr.glow_img, Image.new("RGB", (fr.W, fr.H), (0, 0, 0)), gm)
            fr._glow_draw = ImageDraw.Draw(fr.glow_img)
        fr.glow.bitmap((0, 0), burn.point(lambda v: 255 if v > 160 else 0).convert("1"), fill=(90, 44, 14))
    # dust hanging in the returning light
    if prog > 0.3:
        rng = fr.srng("s614dust")
        for i in range(60):
            x = rng.uniform(-13, 7)
            y = rng.uniform(0.3, 8) + math.sin(t * 0.7 + i) * 0.05
            X, Y = fr.P(x, y)
            r = fr.ss * rng.uniform(0.8, 1.6)
            fr.draw.ellipse([X - r, Y - r, X + r, Y + r], fill=(196, 170, 140))
    # ---- the fighters, held; Gojo breathing hard; Thragg does not move
    tq = on2(fr)
    heave = math.sin(tq * math.tau / T(fr, 24))
    gpose = P(G_TIRED, lean=G_TIRED["lean"] + 6 + 3 * heave, neck=G_TIRED["neck"] - 4 + 3 * heave,
              th_n=16, sh_n=-10)
    g_off = soles_offset(GOJO, gpose)
    tpose = t_reaching(thragg_turned_pose(1.0), (-0.2, 2.2), *pelvis_for_torso(THRAGG, thragg_turned_pose(1.0),
                                                                                1.0, 2.0, -1))
    tp = pelvis_for_torso(THRAGG, tpose, 1.0, 2.0, -1)
    light = prog

    def figs(void):
        st = thragg_turned_style(1.0, void=void)
        G = gojo(fr, gpose, -7.0, 3.0 + g_off, 1, void=void)
        bloody_hand(fr, G)
        J = thragg(fr, tpose, tp[0], tp[1], -1, void=void, style=st, cape_wind=(1.2, 0.6))
        open_flank(fr, J, st, 1.0, wound=(0.62, 0.17))
        return J
    # the Blue behind his shoulder: gutters on 1s, a dying pinpoint, winks out on f85
    if t < t85 - 1e-6:
        gut = seg(t, T(fr, 30), t84, "in")
        fl = 0.6 + 0.4 * random.Random(fr.f * 7 + 3).random() if t >= T(fr, 30) else 1.0
        fx.blue(fr, BLUE_PT[0], BLUE_PT[1], t + 3.0, r=lerp(0.1, 0.022, gut) * fl, strength=lerp(0.7, 0.35, gut) * fl,
                streaks=int(lerp(26, 4, gut)), salt="s614b")
    figs(void=False)
    if light < 0.999:
        vl, _ = capture(fr, lambda: figs(void=True))
        paste(fr, vl, alpha=1 - light)
    if t84 <= t < t85 - 1e-6:
        # the reversed shatter: the last shards of the void collapse inward
        rng = fr.srng("s614shard")
        for i in range(40):
            a = rng.uniform(0, math.tau)
            rr = rng.uniform(0.4, 0.62) * fr.H
            X, Y = fr.W / 2 + math.cos(a) * rr * 1.6, fr.H / 2 + math.sin(a) * rr
            s = rng.uniform(0.01, 0.03) * fr.H
            fr.draw.polygon([(X, Y - s), (X + s * 0.6, Y), (X, Y + s * 0.8), (X - s * 0.5, Y)], fill=(8, 10, 22))
            fr.draw.line([(X, Y - s), (X + s * 0.6, Y)], fill=(150, 200, 255), width=max(1, int(fr.ss)))
    fr.vignette = 0.4


SHOTS = {
    "S6-01": s6_01,
    "S6-02": s6_02,
    "S6-03": s6_03,
    "S6-04": s6_04,
    "S6-05": s6_05,
    "S6-06": s6_06,
    "S6-07": s6_07,
    "S6-08": s6_08,
    "S6-09": s6_09,
    "S6-10": s6_10,
    "S6-11": s6_11,
    "S6-12": s6_12,
    "S6-13": s6_13,
    "S6-14": s6_14,
}
