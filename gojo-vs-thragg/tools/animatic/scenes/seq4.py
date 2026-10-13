"""Sequence 4 - VILTRUMITE FURY (S4-01 .. S4-20).

Thragg's assault from every angle (above, below, the blind flank, out of the
dust), the slow-hand test, the dust trick and Gojo's big Blue, the roof
strike that tears the storm deck, the pull into the unfinished tower (the
motivated screen-direction flip: from S4-12 on Thragg is WEST / screen-left
and attacks left -> right), Infinity OFF as bait, the collarbone, the
point-blank Red, RCT in open sky, and the smile that fades.

Timing: beats are authored against the nominal shot lengths in NOM and scaled
by fr.n / NOM (T()), so every shot still works if its length changes by a few
frames. Contact frames are read from the shot's own sfx cues (cue()).

Persistent seq-4 damage (Blue heap blasted, corner facades turned to dust,
geyser hole, roof crater, torn storm deck, gutted tower) is keyed to the
GLOBAL frame of the event (since()), so every shot shows exactly the damage
that has happened before it.
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
from rig import GOJO, THRAGG, P, pose_at, draw_fighter, hand_pos, solve

SEQ = 4

NOM = {"S4-01": 30, "S4-02": 56, "S4-03": 58, "S4-04": 96, "S4-05": 40, "S4-06": 44, "S4-07": 60,
       "S4-08": 24, "S4-09": 50, "S4-10": 60, "S4-11": 24, "S4-12": 72, "S4-13": 46, "S4-14": 34,
       "S4-15": 40, "S4-16": 40, "S4-17": 60, "S4-18": 60, "S4-19": 46, "S4-20": 20}


# =============================================================================
# timing helpers
# =============================================================================

def _k(shot):
    return shot["frames"] / NOM.get(shot["id"], shot["frames"])


def T(fr, f):
    """Nominal frame f of this shot -> seconds (scaled to the real length)."""
    return f * _k(fr.shot) / FPS


def cue(fr, name, nth=0, default=0):
    """Time (s) of the nth sfx cue `name` (contact frames live there)."""
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


def since(fr, sid, f):
    """Seconds since nominal frame f of shot sid (negative = not yet)."""
    s = _shot(sid)
    return (fr.gf - (s["start_frame"] + f * _k(s))) / FPS


def seg(t, t0, t1, ease="inout"):
    if t1 <= t0:
        return 1.0 if t >= t1 else 0.0
    return EASE[ease](clamp((t - t0) / (t1 - t0)))


def on2(fr):
    return (fr.f - fr.f % 2) / FPS


def catmull(keys, t):
    """Catmull-Rom through [(time, (x, y, ...)), ...]; held outside."""
    if t <= keys[0][0]:
        return tuple(keys[0][1])
    for i in range(1, len(keys)):
        if t <= keys[i][0]:
            t0, p1 = keys[i - 1]
            t1, p2 = keys[i]
            p0 = keys[max(0, i - 2)][1]
            p3 = keys[min(len(keys) - 1, i + 1)][1]
            u = clamp((t - t0) / max(1e-6, t1 - t0))
            u2, u3 = u * u, u * u * u
            return tuple(0.5 * ((2 * p1[j]) + (-p0[j] + p2[j]) * u + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * u2
                                + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * u3) for j in range(len(p1)))
    return tuple(keys[-1][1])


def zkf(t, keys):
    """Zoom keyframes interpolated geometrically (constant-rate push)."""
    return math.exp(kf(t, [(k[0], math.log(k[1])) + tuple(k[2:]) for k in keys]))


def stall_gap(t, t_launch, t_stall, g0, g_end=0.01, crawl=5.0):
    """Remaining gap (m) of a blow entering Infinity (VFX bible): 80% of the gap
    by t_stall (2 frames), +15% over the next 6 frames, then a Zeno crawl toward
    g_end that never arrives."""
    span = g0 - g_end
    if t <= t_launch:
        return g0
    if t < t_stall:
        return g0 - 0.8 * span * (t - t_launch) / max(1e-6, t_stall - t_launch)
    t6 = t_stall + 6 / FPS
    if t < t6:
        return g_end + span * (0.2 - 0.15 * EASE["out"]((t - t_stall) / (6 / FPS)))
    return g_end + fx.zeno(0.05 * span, t - t6, rate=crawl)


def shake2(t, t0, amp, frames):
    return C.shake(t, t0, amp, dur=frames / FPS)


# =============================================================================
# rig helpers
# =============================================================================

LIMBS = ["ua_n", "fa_n", "ua_f", "fa_f", "th_n", "sh_n", "th_f", "sh_f"]
TIP = {"fist": 1.9, "open": 2.15, "point": 3.3, "sign": 3.1, "claw": 2.6}
HALO = (120, 150, 196)


def swap_arms(p):
    q = dict(p)
    for a, b in (("ua_n", "ua_f"), ("fa_n", "fa_f"), ("hand_n", "hand_f")):
        q[a], q[b] = p[b], p[a]
    return q


def rot_pose(p, r):
    """Rotate the whole body by r degrees (toward facing = forward pitch)."""
    q = dict(p)
    q["lean"] = p["lean"] + r
    for k in LIMBS:
        q[k] = p[k] - r
    return q


def rig_angle(dx, dy, facing):
    return math.degrees(math.atan2(dx * facing, -dy))


def reach(st, pose, x, y, facing, side, target, scale=1.0, ground=0.0, elbow="down"):
    """Pose with arm `side` solved (2-bone IK) so the hand's leading edge lands
    on `target` (world, same depth as the fighter)."""
    J = solve(st, pose, x, y, facing, scale, "side", ground)
    sx, sy = J[f"sh_{side}"]
    la, lb = st.upper_arm * scale, st.forearm * scale
    hl = TIP.get(pose.get(f"hand_{side}", "fist"), 1.9) * st.fist * scale
    tx, ty = target
    D0 = math.hypot(tx - sx, ty - sy) or 1e-6
    ux, uy = (tx - sx) / D0, (ty - sy) / D0
    best = None
    for _ in range(2):
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


def tip_pos(J, side, st, kind=None):
    wx, wy = J[f"wr_{side}"]
    d = J[f"hand_dir_{side}"]
    k = TIP.get(kind or "fist", 1.9) * st.fist * J["scale"]
    return (wx + d[0] * k, wy + d[1] * k)


def head_at(J, st, u, v):
    hx, hy = J["head"]
    r = st.head_r * J["scale"]
    f = J["facing"]
    hd = J["head_dir"]
    fwd = (hd[1] * f, -hd[0] * f)
    return (hx + (fwd[0] * u + hd[0] * v) * r, hy + (fwd[1] * u + hd[1] * v) * r)


def collar_front(J):
    """Front of Gojo's high collar (where grabs at the collar stall)."""
    nx, ny = J["neck"]
    f = J["facing"]
    return (nx + f * 0.075 * J["scale"], ny - 0.04 * J["scale"])


def chest_front(J, st=GOJO, up=0.0):
    cx, cy = J["chest"]
    f = J["facing"]
    k = 0.86 if st.name == "thragg" else 0.72
    return (cx + f * st.w_chest * k * 0.5 * J["scale"], cy - 0.1 * J["scale"] + up)


def at_d(fr, x, y, d):
    """A screen-equivalent (d = 1) point -> layer coordinates at depth d."""
    c = fr.cam
    return (c.x + (x - c.x) * d, c.y + (y - c.y) * d)


def gojo(fr, pose, x, sole=0.0, facing=1, y=None, depth=1.0, halo=0.0, scale=1.0, switch=None, view="side",
         **kw):
    o = C.opts(fr, "gojo", switch=switch, **kw)
    if halo > 0:
        off = halo / fr.cam.zoom * depth
        for dx, dy in ((off, 0), (-off, 0), (0, off), (0, -off)):
            if y is None:
                draw_fighter(fr, GOJO, pose, x + dx, None, facing, scale=scale, view=view, opts=o,
                             ground=sole + dy, depth=depth, silhouette=HALO)
            else:
                draw_fighter(fr, GOJO, pose, x + dx, y + dy, facing, scale=scale, view=view, opts=o,
                             depth=depth, silhouette=HALO)
    if y is None:
        return draw_fighter(fr, GOJO, pose, x, None, facing, scale=scale, view=view, opts=o, ground=sole, depth=depth)
    return draw_fighter(fr, GOJO, pose, x, y, facing, scale=scale, view=view, opts=o, depth=depth)


def thragg(fr, pose, x, y=None, facing=-1, sole=0.0, depth=1.0, scale=1.0, switch=None, halo=0.0,
           halo_col=(40, 34, 40), **kw):
    o = C.opts(fr, "thragg", switch=switch, **kw)
    if halo > 0:
        off = halo / fr.cam.zoom * depth
        for dx, dy in ((off, 0), (-off, 0), (0, off), (0, -off)):
            if y is None:
                draw_fighter(fr, THRAGG, pose, x + dx, None, facing, scale=scale, opts=o, ground=sole + dy,
                             depth=depth, silhouette=halo_col)
            else:
                draw_fighter(fr, THRAGG, pose, x + dx, y + dy, facing, scale=scale, opts=o, depth=depth,
                             silhouette=halo_col)
    if y is None:
        return draw_fighter(fr, THRAGG, pose, x, None, facing, scale=scale, opts=o, ground=sole, depth=depth)
    return draw_fighter(fr, THRAGG, pose, x, y, facing, scale=scale, opts=o, depth=depth)


# ---- Gojo poses (facing east: near = RIGHT arm) ------------------------------
G_LOOSE = P("g_idle", ua_n=6, fa_n=2, ua_f=-4, fa_f=-3, hand_n="open", hand_f="open")
G_STEP = P(G_LOOSE, th_n=52, sh_n=-6, th_f=-10, sh_f=-16)
G_TWO = P(G_LOOSE, ua_n=40, fa_n=150, hand_n="sign")
G_TWO_FWD = P(G_LOOSE, ua_n=58, fa_n=118, hand_n="sign")
G_OVER = P(G_LOOSE, neck=-14, ua_n=172, fa_n=176, hand_n="sign")
G_FLING = P(G_LOOSE, lean=8, neck=-2, ua_n=88, fa_n=90, hand_n="sign", th_n=16, sh_n=4, th_f=-12, sh_f=-10)
G_FLICK_L = P(G_LOOSE, ua_f=52, fa_f=104, hand_f="sign")
G_SWAY = P(G_LOOSE, lean=-13, neck=-8, th_n=2, sh_n=2, th_f=-12, sh_f=-10)
G_RISE = P("float_relaxed", lean=8, neck=-10)
G_DASH = P("g_fly_dash", lean=58, neck=-14)
G_TUMBLE = P("tumble")

# ---- Thragg poses ------------------------------------------------------------
LEGS_AIR = dict(th_n=22, sh_n=-62, th_f=-4, sh_f=-86)
T_CROUCH = P("land_crouch", lean=30, neck=-16, ua_n=44, fa_n=76, ua_f=14, fa_f=66)
T_SQUASH = P(T_CROUCH, lean=46, neck=-4, th_n=114, sh_n=-24, th_f=44, sh_f=-104, ua_n=24, fa_n=44, ua_f=-10,
             fa_f=30)
T_UP = P("fly_up", neck=-24, ua_n=176, fa_n=180, ua_f=-24, fa_f=-14, th_n=-10, sh_n=-26, th_f=-22, sh_f=-40)
T_HOVER = P("t_hover_ready", **LEGS_AIR)
T_STILL = P("t_stand", lean=4, ua_n=10, fa_n=14, ua_f=-6, fa_f=0, hand_n="fist", hand_f="fist", **LEGS_AIR)
T_COIL = P("t_hover_ready", lean=22, neck=-8, ua_n=30, fa_n=120, ua_f=10, fa_f=110, th_n=70, sh_n=-40, th_f=50,
           sh_f=-80)
T_FLYW = P("t_fly_punch", lean=82)


def legs_air(p):
    q = dict(p)
    q.update(LEGS_AIR)
    return q


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
    c = fr.cam
    return (c.x + (u * OUT_W - OUT_W / 2) * d / c.zoom, c.y - (v * OUT_H - OUT_H / 2) * d / c.zoom)


def w2s(fr, x, y, d=1.0):
    px, py = fr.P(x, y, d)
    return px / fr.W, py / fr.H


def shards(fr, pts, t, salt, size=0.03, d=None, col=(96, 92, 96), jit=0.0015):
    """Fragments hanging in the air: irregular chips with a 1-2 mm jitter and
    no net drift (Infinity's dangerous fragments)."""
    rng = fr.srng(salt)
    for i, (x, y) in enumerate(pts):
        jx = math.sin(t * 31 + i * 1.7) * jit
        jy = math.cos(t * 27 + i * 2.3) * jit
        s = size * rng.uniform(0.5, 1.3)
        a0 = rng.uniform(0, math.tau)
        poly = [(x + jx + math.cos(a0 + k * 2.1 + rng.uniform(-0.3, 0.3)) * s * rng.uniform(0.6, 1.0),
                 y + jy + math.sin(a0 + k * 2.1 + rng.uniform(-0.3, 0.3)) * s * rng.uniform(0.6, 1.0))
                for k in range(3)]
        fr.poly(poly, shade(col, rng.uniform(0.6, 1.5)), d=d)


def motes(fr, t, x0, x1, y0, y1, n=40, salt="motes", d=1.0, col=(200, 180, 150), vx=-0.25, size=0.012,
          alpha=150):
    """Harmless drifting dust in the light (passes freely through Infinity)."""
    rng = fr.srng(salt)
    img, dr = fr.layer()
    W = x1 - x0
    for i in range(n):
        x = x0 + ((rng.random() * W + vx * t * rng.uniform(0.6, 1.4)) % W)
        y = y0 + rng.random() * (y1 - y0) + 0.05 * math.sin(t * 1.3 + i)
        X, Y = fr.P(x, y, d)
        R = max(1.0, fr.S(size * rng.uniform(0.5, 1.5), d))
        dr.ellipse([X - R, Y - R, X + R, Y + R], fill=col + (int(alpha * rng.uniform(0.4, 1.0)),))
    fr.merge(img)


def murk(fr, k, t, clear=None, col=(132, 114, 100), salt="murk", tex=True):
    """Screen-filling dust (visibility two metres). k = opacity 0..1.
    clear=(u, v, R) punches a soft radial hole (R in frame heights)."""
    if k <= 0.01:
        return
    img, dr = fr.layer()
    a = int(225 * clamp(k))
    dr.rectangle([0, 0, fr.W, fr.H], fill=col + (a,))
    if tex:
        rng = fr.srng(salt)
        for i in range(26):
            u = (rng.random() + t * 0.03 * (0.5 + rng.random())) % 1.3 - 0.15
            v = rng.random()
            r = rng.uniform(0.08, 0.22)
            c = shade(col, rng.uniform(0.8, 1.15))
            dr.ellipse([(u - r * 1.6) * fr.W, (v - r) * fr.H, (u + r * 1.6) * fr.W, (v + r) * fr.H],
                       fill=c + (int(a * rng.uniform(0.85, 1.0)),))
    if clear is not None:
        cu, cv, R = clear
        steps = 9
        for i in range(steps):
            rr = R * (1.25 - i * 0.06)
            aa = int(a * (1 - (i + 1) / steps))
            X, Y, RR = cu * fr.W, cv * fr.H, rr * fr.H
            dr.ellipse([X - RR, Y - RR, X + RR, Y + RR], fill=col + (aa,))
    fr.merge(img)


def dust_band(fr, x0, x1, y, h, t, salt="band", d=1.0, alpha=120, col=None):
    """A ground-hugging rolling dust front from x0 to x1."""
    if x1 <= x0:
        return
    rng = fr.srng(salt)
    col = col or PAL["dust"]
    img, dr = fr.layer()
    n = int(8 + (x1 - x0) / 1.2)
    for i in range(n):
        x = x0 + (x1 - x0) * (i + rng.random()) / n
        r = h * rng.uniform(0.6, 1.2)
        yy = y + r * 0.5 + 0.2 * math.sin(t * 3 + i)
        X, Y = fr.P(x, yy, d)
        R = fr.S(r, d)
        dr.ellipse([X - R * 1.3, Y - R * 0.8, X + R * 1.3, Y + R * 0.8],
                   fill=shade(col, rng.uniform(0.75, 1.1)) + (int(alpha * rng.uniform(0.6, 1.0)),))
    fr.merge(img)


def gojo_brow(fr, J, k=0.0, d=None):
    """Gojo's white eyebrow on the rig head; k 0..1 = raised."""
    a = head_at(J, GOJO, 0.42, 0.36 + 0.16 * k)
    b = head_at(J, GOJO, 0.98, 0.32 + 0.28 * k)
    fr.line([a, b], GOJO.hair, width_m=GOJO.head_r * J["scale"] * 0.12, d=d)


def gojo_pain(fr, J, k=1.0, d=None):
    """Pain on the rig head: eye flared wide, teeth set."""
    if k <= 0:
        return
    r = GOJO.head_r * J["scale"]
    ex, ey = head_at(J, GOJO, 0.7, 0.1)
    fr.ellipse(ex, ey, r * 0.24, r * 0.2, fill=(240, 250, 255), d=d)
    fr.circle(ex + J["facing"] * r * 0.04, ey, r * 0.1, fill=(60, 190, 255), d=d)
    fr.circle(ex + J["facing"] * r * 0.04, ey, r * 0.045, fill=(10, 20, 40), d=d)
    a = head_at(J, GOJO, 0.55, -0.52)
    b = head_at(J, GOJO, 1.0, -0.5)
    fr.line([a, b], (60, 26, 30), width_m=r * 0.16, d=d)
    fr.line([a, b], (240, 240, 236), width_m=r * 0.07, d=d)
    bx, by = head_at(J, GOJO, 0.8, 0.42)
    fr.line([head_at(J, GOJO, 0.45, 0.48), head_at(J, GOJO, 1.0, 0.36)], GOJO.hair, width_m=r * 0.12, d=d)


def thragg_eye(fr, J, look=(0.0, 0.0), brow=0.6, d=None):
    """Thragg's cold eye on the rig head with a gaze direction (for zooms)."""
    r = THRAGG.head_r * J["scale"]
    ex, ey = head_at(J, THRAGG, 0.8, 0.14)
    fr.ellipse(ex, ey, r * 0.15, r * 0.08, fill=(222, 214, 214), d=d)
    fr.circle(ex + look[0] * r * 0.06, ey + look[1] * r * 0.035, r * 0.055, fill=(24, 16, 18), d=d)
    fr.line([head_at(J, THRAGG, 0.45, 0.38), head_at(J, THRAGG, 1.02, 0.24 - 0.06 * brow)], (40, 30, 30),
            width_m=r * (0.12 + 0.06 * brow), d=d)


def smoke_trail(fr, pts, t, salt="smk", d=None, width=0.5, col=(70, 64, 70), alpha=150):
    if len(pts) < 2:
        return
    rng = fr.srng(salt)
    img, dr = fr.layer()
    n = len(pts)
    for i, (x, y) in enumerate(pts):
        age = 1 - i / (n - 1)
        r = width * (0.4 + 1.6 * age)
        X, Y = fr.P(x + rng.uniform(-0.2, 0.2) * width, y + age * width * 1.5, d)
        R = fr.S(r, d)
        dr.ellipse([X - R, Y - R, X + R, Y + R], fill=shade(col, 0.8 + 0.4 * age) + (int(alpha * (1 - 0.7 * age)),))
    fr.merge(img)


# =============================================================================
# persistent geography + damage
# =============================================================================

def _seq2():
    try:
        import scenes.seq2 as S2
        return S2
    except Exception:  # noqa: BLE001
        return None


HEAP_X = (4.0, 11.0)
GEYSER_X = 5.0
EB_D = 1.15                                     # east block (Seq 3's Red tunnel) at the far side of the avenue
EB = [(21.0, 37.0, 34.0), (42.0, 58.0, 44.0), (59.5, 78.0, 40.0)]
RED_TAN = math.tan(math.radians(12.0))
NE = dict(d=1.8, x0=13.0, x1=40.0, h=40.0)       # north-east corner block (upstage)
SE = dict(d=0.7, x0=10.0, x1=26.0, h=30.0)       # south-east corner block (foreground)
OFFICE = dict(x0=22.0, x1=40.0, roof=48.0)       # 14-storey north-side office block (S4-09)
CRATER_ROOF_X = 32.0


def red_axis_y(x):
    return 1.4 + (x + 3.4) * RED_TAN


def heap(fr, lit=1.0, state="intact"):
    """Seq 3's Blue heap of compacted cars, lamp posts and the mast arm at
    x = +4..+11 (crest stripped east by the Red, west face blown open).
    state 'blasted' (after S4-05 f28): wrecks scattered across the avenue,
    the geyser hole at x = +5."""
    rng = random.Random("s4heap")
    if state == "intact":
        x0, x1 = HEAP_X
        pts = [(x0 - 0.4, 0.0)]
        for k in range(1, 12):
            u = k / 12
            x = x0 + (x1 - x0) * u
            h = 3.1 * math.sin(math.pi * u) ** 0.7 + rng.uniform(-0.25, 0.25)
            if 0.45 < u < 0.75:
                h = min(h, 2.9)                       # crest stripped flat by the Red
            pts.append((x, max(0.3, h)))
        pts.append((x1 + 0.5, 0.0))
        fr.poly(pts, shade((44, 42, 48), lit))
        cols = [(110, 40, 38), (60, 74, 92), (150, 150, 146), (88, 84, 70), (40, 52, 46), (120, 110, 90)]
        for i in range(16):
            cx = rng.uniform(x0 + 0.6, x1 - 0.6)
            top = max(p[1] for p in pts if abs(p[0] - cx) < 0.8) if any(abs(p[0] - cx) < 0.8 for p in pts) else 1.5
            cy = rng.uniform(0.3, max(0.5, top - 0.5))
            w, h = rng.uniform(0.8, 1.9), rng.uniform(0.35, 0.8)
            a = rng.uniform(-0.8, 0.8)
            ca, sa = math.cos(a), math.sin(a)
            quad = [(cx + ca * dx - sa * dy, cy + sa * dx + ca * dy) for dx, dy in
                    ((-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2))]
            fr.poly(quad, shade(rng.choice(cols), lit * rng.uniform(0.6, 0.95)))
            if rng.random() < 0.4:
                fr.circle(cx + ca * w * 0.3, cy + sa * w * 0.3, 0.22, fill=shade((16, 16, 18), lit))
        for i in range(5):
            bx = rng.uniform(x0 + 1, x1 - 1)
            a = rng.uniform(0.3, 2.8)
            L = rng.uniform(1.5, 3.2)
            fr.line([(bx, 1.4), (bx + math.cos(a) * L, 1.4 + math.sin(a) * L * 0.6)], shade((70, 72, 80), lit),
                    width_m=0.12)
        # west face blown open (Thragg burst out of it in S3-08)
        fr.poly([(x0 - 0.1, 0.0), (x0 + 0.2, 1.6), (x0 + 1.0, 2.1), (x0 + 1.6, 1.2), (x0 + 1.3, 0.0)],
                shade((14, 13, 16), lit))
        return
    # ---- blasted: the geyser hole and the scattered wrecks ---------------------
    fr.ellipse(GEYSER_X, -0.04, 3.3, 0.42, fill=shade(PAL["concrete_dark"], lit * 0.9))
    fr.ellipse(GEYSER_X, -0.08, 2.7, 0.3, fill=shade((12, 10, 14), lit))
    for k in range(12):
        a = rng.uniform(0, math.pi * 2)
        L = rng.uniform(3.5, 7.0)
        fr.line([(GEYSER_X + math.cos(a) * 3.0, -math.sin(a) * 0.3),
                 (GEYSER_X + math.cos(a) * L, -math.sin(a) * L * 0.12)], shade((16, 14, 16), lit), width_m=0.06)
    fr.poly([(8.0, 0.0), (8.4, 0.9), (9.6, 1.3), (10.8, 0.8), (11.3, 0.0)], shade((44, 42, 48), lit))
    cols = [(110, 40, 38), (60, 74, 92), (150, 150, 146), (88, 84, 70), (40, 52, 46)]
    for i in range(9):
        wx = rng.choice([rng.uniform(-14, -6), rng.uniform(12, 30), rng.uniform(1, 3)])
        w, h = rng.uniform(1.6, 3.2), rng.uniform(0.5, 1.0)
        a = rng.uniform(-0.5, 0.5)
        cy = h * 0.5
        ca, sa = math.cos(a), math.sin(a)
        quad = [(wx + ca * dx - sa * dy, cy + sa * dx + ca * dy) for dx, dy in
                ((-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2))]
        fr.poly(quad, shade(rng.choice(cols), lit * 0.75), d=rng.uniform(1.05, 1.5))


def corner_ne(fr, lit=1.0, state="intact", t_hit=None, contact=None):
    """North-east corner block (upstage right of the intersection, d = 1.8).
    'intact' / 'hit' (disintegrating from contact, t_hit s ago) / 'smashed'."""
    d, x0, x1, h = NE["d"], NE["x0"], NE["x1"], NE["h"]
    col = shade(mix_color(PAL["bldg_near"], (70, 66, 78), 0.4), lit)
    if state == "smashed":
        # facade gone: the bare frame of slabs and columns, a rubble skirt
        fr.rect(x0, -1, x1, h * 0.8, shade((22, 22, 30), lit), d=d)
        for k in range(1, int(h * 0.8 / 4.2)):
            fr.line([(x0, k * 4.2), (x1 - (k % 3) * 2.0, k * 4.2)], shade((92, 88, 90), lit), width_m=0.45, d=d)
        for cx in [x0 + i * (x1 - x0) / 5 for i in range(6)]:
            fr.line([(cx, 0), (cx, h * 0.8 - (cx * 7 % 5))], shade((80, 78, 82), lit), width_m=0.5, d=d)
        rng = random.Random("nerub")
        for i in range(14):
            rx = rng.uniform(x0 - 2, x1 + 2)
            s = rng.uniform(1.0, 3.0)
            fr.poly([(rx - s, 0), (rx, s * 1.1), (rx + s, 0)], shade((90, 86, 84), lit * rng.uniform(0.7, 1.0)), d=d)
        return
    fr.rect(x0, -1, x1, h, col, d=d)
    rng = random.Random("ne")
    for k in range(1, int(h / 4.2)):
        for j in range(int((x1 - x0) / 3.0)):
            wx = x0 + 0.6 + j * 3.0
            c = (12, 12, 18) if rng.random() < 0.3 else shade(mix_color(col, (40, 50, 70), 0.5), lit)
            fr.rect(wx, k * 4.2 - 3.4, wx + 2.2, k * 4.2 - 0.8, c, d=d)
    fr.line([(x0, 0), (x0, h)], shade(mix_color(col, PAL["rim_warm"], 0.45), lit), width_m=0.6, d=d)
    if state == "hit" and t_hit is not None and contact is not None:
        cx, cy = contact
        R = 3.0 + 26.0 * EASE["out"](clamp(t_hit / 0.9))
        # the face does not break, it disintegrates: a spreading ragged hole
        pts = []
        for k in range(16):
            a = k * math.tau / 16
            rr = R * (0.75 + 0.35 * random.Random(f"neh{k}").random())
            pts.append((cx + math.cos(a) * rr * 0.8, max(-1.0, cy + math.sin(a) * rr)))
        fr.poly(pts, shade((20, 20, 28), lit), d=d)


def corner_se(fr, lit=1.0, state="intact", t_hit=None, contact=None):
    """South-east corner block, foreground right (d = 0.7)."""
    d, x0, x1, h = SE["d"], SE["x0"], SE["x1"], SE["h"]
    col = shade(mix_color(PAL["bldg_near"], (60, 58, 70), 0.3), lit * 0.9)
    if state == "smashed":
        rng = random.Random("serub")
        for i in range(10):
            rx = rng.uniform(x0 - 1, x1 + 2)
            s = rng.uniform(0.8, 2.4)
            fr.poly([(rx - s, -0.5), (rx, s), (rx + s, -0.5)], shade((70, 66, 66), lit * rng.uniform(0.6, 0.9)), d=d)
        fr.line([(x0 + 0.5, -0.5), (x0 + 0.8, 7.0)], shade((60, 60, 64), lit), width_m=0.5, d=d)
        return
    fr.rect(x0, -3, x1, h, col, d=d)
    for k in range(1, int(h / 4.2)):
        fr.line([(x0, k * 4.2), (x1, k * 4.2)], shade(col, 0.7), width_m=0.4, d=d)
    fr.line([(x0, -3), (x0, h)], shade(mix_color(col, PAL["rim_warm"], 0.5), lit), width_m=0.5, d=d)
    if state == "hit" and t_hit is not None and contact is not None:
        cx, cy = contact
        R = 2.0 + 20.0 * EASE["out"](clamp(t_hit / 0.9))
        pts = []
        for k in range(16):
            a = k * math.tau / 16
            rr = R * (0.75 + 0.35 * random.Random(f"seh{k}").random())
            pts.append((cx + math.cos(a) * rr * 0.7, cy + math.sin(a) * rr))
        fr.poly(pts, shade((26, 24, 30), lit), d=d)


# windows popped along Thragg's S4-01 climb, in east-block layer coordinates
_POPS = [(56.2, 16.5), (54.6, 19.5), (52.7, 22.6), (51.0, 25.3), (49.0, 27.8), (46.6, 30.6), (44.2, 33.0),
         (35.6, 30.2), (33.4, 31.7), (31.0, 32.6)]


def east_block(fr, lit=1.0, launch_t=None, pops=1.0, dust=0.0):
    """The three east-block buildings with Seq 3's Red tunnel (holes along the
    12-degree axis), the third one slumped from the 4th floor down over its
    rubble mouth (Thragg's crater). launch_t: seconds since S4-01's launch."""
    d = EB_D
    rng = random.Random("eb")
    for i, (x0, x1, h) in enumerate(EB):
        col = shade(mix_color(PAL["bldg_near"], (64, 62, 76), 0.25 + 0.1 * i), lit)
        sag = 0.0
        if i == 2:
            base = 9.0
            sag = 0.0
            if launch_t is not None and launch_t > 0:
                sag = 1.2 * EASE["out"](clamp(launch_t / 0.4))
            # upper part slumped down onto the crushed floors, slight lean
            top = h - 6.0 - sag
            fr.poly([(x0, base - sag), (x1, base - 1.0 - sag), (x1, top - 1.0), (x0, top)], col, d=d)
            for k in range(1, 8):
                yy = base - sag + k * 4.2
                if yy < top - 1:
                    fr.line([(x0, yy), (x1, yy - 1.0)], shade(col, 0.72), width_m=0.4, d=d)
            # crushed floors + rubble mouth
            fr.poly([(x0 - 2.5, 0), (x0 - 0.5, 5.5), (x0 + 3, base - sag + 0.4), (x1 - 2, base - 1.2 - sag),
                     (x1 + 2.0, 0)], shade((70, 66, 66), lit), d=d)
            for k in range(18):
                rx = rng.uniform(x0 - 2, x1 + 1)
                s = rng.uniform(0.4, 1.6)
                ry = rng.uniform(0, 6)
                fr.poly([(rx - s, ry), (rx, ry + s), (rx + s * 0.8, ry - s * 0.3)],
                        shade((96, 92, 90), lit * rng.uniform(0.6, 1.0)), d=d)
            mx = 64.6
            fr.poly([(mx - 2.6, 0), (mx - 2.0, 2.4), (mx - 0.4, 3.1), (mx + 1.6, 2.6), (mx + 2.4, 0)],
                    shade((12, 11, 14), lit), d=d)
        else:
            fr.rect(x0, -1, x1, h, col, d=d)
            for k in range(1, int(h / 4.2)):
                for j in range(int((x1 - x0) / 3.2)):
                    wx = x0 + 0.5 + j * 3.2
                    c = shade(mix_color(col, (36, 44, 62), 0.55), lit)
                    fr.rect(wx, k * 4.2 - 3.3, wx + 2.3, k * 4.2 - 0.9, c, d=d)
        fr.line([(x0, 0), (x0, h - (6.0 + sag if i == 2 else 0))], shade(mix_color(col, PAL["rim_warm"], 0.4), lit),
                width_m=0.5, d=d)
        # Red tunnel holes along the axis (punched through the west wall and out the east)
        if i < 2:
            ya = red_axis_y(x0 - 1.0)
            for xx, ww in ((x0, 3.4), (x1 - 2.6, 2.6)):
                fr.poly([(xx - 0.4, ya - 1.6), (xx + ww * 0.5, ya - 2.1), (xx + ww, ya - 1.2), (xx + ww + 0.3, ya + 1.5),
                         (xx + ww * 0.4, ya + 2.2), (xx - 0.3, ya + 1.4)], shade((10, 10, 14), lit), d=d)
            fr.line([(x0 + 3.0, ya + 0.3), (x1 - 2.6, ya + 0.3 + (x1 - x0 - 5.6) * RED_TAN)],
                    shade((26, 24, 30), lit), width_m=0.35, d=d)
    # windows popped along the S4-01 climb
    if pops > 0:
        for k, (wx, wy) in enumerate(_POPS):
            if k / len(_POPS) <= pops:
                fr.rect(wx - 1.1, wy - 1.1, wx + 1.1, wy + 1.1, shade((10, 10, 14), lit), d=d)
    if dust > 0:
        img, dr = fr.layer()
        for k in range(8):
            X, Y = fr.P(64.6 + k * 0.3, 1.5 + k * 1.4, d)
            R = fr.S(2.0 + k * 0.8, d)
            dr.ellipse([X - R, Y - R, X + R, Y + R], fill=PAL["dust"] + (int(60 * dust),))
        fr.merge(img)


def seq4_damage(fr):
    """Which seq-4 damage exists at this global frame."""
    return dict(
        heap="blasted" if since(fr, "S4-05", 28) >= 0 else "intact",
        ne="smashed" if since(fr, "S4-05", 14) >= 0 else "intact",
        se="smashed" if since(fr, "S4-05", 22) >= 0 else "intact",
        pops=clamp((since(fr, "S4-01", 12) + 0.05) / (9 / FPS)),
        torn=since(fr, "S4-10", 30) >= 0,
        roof=since(fr, "S4-09", 30) >= 0,
        gutted=since(fr, "S4-16", 4) >= 0,
    )


def street_bg(fr, lit=1.0, extra=(), ne=None, heap_state=None, east=True, launch_t=None, eb_dust=0.0):
    """C.stage(fr, 4, 'street') - the same env layers in the same order - with
    Seq 1-2's storefront row and blown windows, and Seq 3-4's damage on top:
    the east block's Red tunnel, the NE corner, the Blue heap."""
    dmg = seq4_damage(fr)
    flags = set(extra)
    if dmg["torn"]:
        flags.add("clouds_torn")
    st = C.state(SEQ, *flags)
    tg = C.tg(fr)
    env.sky(fr, lit)
    env.clouds(fr, tg, lit=lit)
    env.river(fr, lit)
    env.skyline(fr, st, layers=(0, 1, 2, 3), lit=lit)
    env.smoke_columns(fr, tg, st, lit)
    env.light_shafts(fr, st)
    S2 = _seq2()
    if S2 is not None:
        try:
            S2.windows_blown(fr, -40.0, 2.0, "wwest", origin=-6.0, reveal=1.0, lit=lit)
            S2.windows_blown(fr, 5.0, 44.0, "weast", origin=-6.0, reveal=1.0, lit=lit)
            S2.storefront_row(fr, lit)
        except Exception:  # noqa: BLE001
            pass
    env.street(fr, st, lit, show_gantry=True)
    ne_state = ne or dmg["ne"]
    if ne_state != "none":
        corner_ne(fr, lit, ne_state)
    if east:
        east_block(fr, lit, launch_t=launch_t, pops=dmg["pops"], dust=eb_dust)
    heap(fr, lit, heap_state or dmg["heap"])
    return st


def district(fr, lit=1.0, gap=(-34.0, 21.0)):
    """Rows of rooftops between the camera and the skyline for the high wides
    (open_sky only draws the far skyline band). The avenue stays open."""
    sky = PAL["sky_mid"]
    for row, d in enumerate((2.1, 1.6, 1.25)):
        rng = random.Random(f"s4dist{row}")
        x = -700.0
        haze = clamp((d - 0.85) / 1.25) * 0.35
        while x < 900.0:
            w = rng.uniform(14, 42)
            h = rng.uniform(14, 50)
            col = shade(mix_color(shade(PAL["bldg_near"], rng.uniform(0.85, 1.25)), sky, haze), lit)
            fr.rect(x, -60, x + w, h, col, d=d)
            fr.line([(x, 0), (x, h)], shade(mix_color(col, PAL["rim_warm"], 0.3), lit), width_m=0.8, d=d)
            for _ in range(int(w * h / 200)):
                wx, wy = rng.uniform(x + 1, x + w - 2), rng.uniform(3, h - 3)
                fr.rect(wx, wy, wx + 1.4, wy + 1.2, shade(mix_color(PAL["window_lit"], col, 0.55), lit), d=d)
            x += w + rng.uniform(2, 8)


def office_block(fr, lit=1.0, crater=0.0):
    """The 14-storey north-side office block (roof x = +22..+40, y = 48) with
    the S4-09 crater at x = +32 once it exists (crater 0..1)."""
    o = OFFICE
    env.rooftops(fr, o["roof"], o["x0"], o["x1"], lit=lit)
    body = shade((34, 34, 46), lit)
    for k in range(1, 12):
        y = o["roof"] - k * 4.2
        fr.line([(o["x0"], y), (o["x1"], y)], shade(body, 0.75), width_m=0.35)
    rng = random.Random("office")
    for k in range(1, 12):
        for j in range(5):
            wx = o["x0"] + 0.8 + j * 3.4
            wy = o["roof"] - k * 4.2 + 0.8
            c = shade(mix_color(PAL["window_lit"], body, rng.uniform(0.4, 0.85)), lit) if rng.random() < 0.25 \
                else shade((18, 18, 26), lit)
            fr.rect(wx, wy, wx + 2.4, wy + 2.6, c)
    fr.line([(o["x0"], 0), (o["x0"], o["roof"] + 1)], shade(mix_color(body, PAL["rim_warm"], 0.5), lit), width_m=0.4)
    if crater > 0:
        cx, ry = CRATER_ROOF_X, o["roof"]
        w = 3.6 * crater
        fr.poly([(cx - w, ry + 1.0), (cx - w * 0.6, ry - 1.4 * crater), (cx, ry - 2.2 * crater),
                 (cx + w * 0.7, ry - 1.2 * crater), (cx + w, ry + 1.0)], shade((10, 10, 14), lit))
        rng = random.Random("rcrack")
        for k in range(7):
            x1 = cx - rng.uniform(1, 9.5) * crater if k < 5 else cx + rng.uniform(1, 6) * crater
            fr.line([(cx + (x1 - cx) * 0.3, ry + 1.0), ((cx + x1) / 2, ry + 1.0 + rng.uniform(-0.15, 0.15)),
                     (x1, ry + 1.0)], shade((14, 12, 16), lit), width_m=0.12)
        for k in range(8):
            rx = cx + rng.uniform(-w, w)
            s = rng.uniform(0.3, 0.8)
            fr.poly([(rx - s, ry + 1), (rx, ry + 1 + s), (rx + s, ry + 1)], shade((90, 88, 92), lit))


def deck_band(fr, y0, salt="deck", tear=None, lit=1.0, alpha=240):
    """The storm deck seen from below, in world space (d = 1) from y0 up.
    tear=(cx, cy, rx, ry, u) opens a ragged hole showing warm evening sky."""
    img, dr = fr.layer()
    rng = random.Random(salt)
    for i in range(70):
        x = rng.uniform(-700, 900) - C.tg(fr) * 1.0
        y = y0 + rng.uniform(0, 160)
        w, h = rng.uniform(40, 120), rng.uniform(14, 40)
        X, Y = fr.P(x, y)
        c = mix_color(PAL["cloud"], PAL["cloud_lit"], clamp((60 - x) / 500) * 0.7)
        dr.ellipse([X - fr.S(w), Y - fr.S(h), X + fr.S(w), Y + fr.S(h)], fill=shade(c, lit) + (alpha,))
    fr.merge(img)
    if tear is not None:
        cx, cy, rx, ry, u = tear
        if u > 0:
            pts = []
            rr = random.Random(salt + "tear")
            for k in range(28):
                a = k * math.tau / 28 + 0.6 * u
                j = rr.uniform(0.7, 1.15)
                pts.append((cx + math.cos(a) * rx * u * j, cy + math.sin(a) * ry * u * j))
            fr.poly(pts, shade((214, 150, 104), lit))
            inner = [(cx + (x - cx) * 0.7, cy + (y - cy) * 0.6 + ry * 0.12 * u) for x, y in pts]
            fr.poly(inner, shade((246, 196, 138), lit))
            fr.glow_poly(inner, (90, 60, 30))
            # churning lip of the hole, wheeling outward
            for k in range(14):
                a = k * math.tau / 14 + u * 2.2
                fr.ellipse(cx + math.cos(a) * rx * u * 1.05, cy + math.sin(a) * ry * u * 1.05, rx * 0.12, ry * 0.18,
                           fill=shade(PAL["cloud"], lit * 1.1))


# =============================================================================
# S4-01  WS low: Thragg explodes up out of the rubble - not at Gojo, but up
# =============================================================================

def _s401_path(fr):
    return [(T(fr, 7), (60.0, 0.4)), (T(fr, 10), (52.0, 14.0)), (T(fr, 16), (38.0, 32.0)), (T(fr, 22), (24.0, 44.0)),
            (T(fr, 28), (10.0, 52.0)), (T(fr, 34), (-3.0, 56.0))]


def s4_01(fr):
    t = fr.t
    tl = cue(fr, "accel_burst", 0, 7)           # launch f7
    ta = tl - 1 / FPS                            # the one compressed anticipation frame (f6)
    tb = cue(fr, "sonic_boom", 0, 12)
    cy = kf(t, [(tl, 10.0), (tl + T(fr, 6), 18.0)])
    fr.cam = Cam(28.0, cy, 25.0)
    street_bg(fr, launch_t=(t - tl), eb_dust=1.0 if t < tl else clamp(1 - (t - tl) * 2))
    # dust still sifting out of the tunnel mouth (f0-5)
    fx.dust_cloud(fr, 64.6, 0.5, 1.2 + t, r=3.2, salt="sift", d=EB_D, alpha=70)
    path = _s401_path(fr)
    # ---- Gojo, small, mid-street; head tilts up on 2s to keep the climb ---------
    tilt = seg(on2(fr), tl + T(fr, 4), tl + T(fr, 14))
    gojo(fr, P(G_LOOSE, neck=-4 - 14 * tilt), -4.0, 0.0, 1, halo=2.0, mouth="flat")
    # ---- Thragg -------------------------------------------------------------------
    if t < ta:
        J = thragg(fr, T_CROUCH, 60.0, None, -1, cape_wind=(0.5, 0.1 + 0.1 * math.sin(t * 8)))
    elif t < tl:
        J = thragg(fr, T_SQUASH, 60.0, None, -1, cape_wind=(0.2, -0.4))
    else:
        x, y = catmull(path, t)
        x2, y2 = catmull(path, t + 0.02)
        vx, vy = x2 - x, y2 - y
        lean = clamp(math.degrees(math.atan2(-vx, vy)), 10, 70)
        J = thragg(fr, P(T_UP, lean=lean), x, y, -1, cape_wind=(0.25, -1.0))
        # vapour cone off the shoulders (f7-9), speed lines f8-10 only
        if t - tl < T(fr, 3):
            L = math.hypot(vx, vy) or 1
            fx.sonic_boom(fr, x + vx / L * 1.0, y + 1.4 + vy / L * 1.0, t - tl, vx, vy, size=2.6)
        if T(fr, 1) <= t - tl <= T(fr, 3.5):
            fx.speed_lines(fr, 0.8, direction=(-0.45, -0.9), salt="s401")
        tail = [catmull(path, max(tl, t - k * 0.03)) for k in range(8, -1, -1)]
        fx.trail(fr, [(px, py + 1.0) for px, py in tail], width_m=1.6, alpha=90)
    # ---- launch: rubble ring blasts outward, dust ring rolls west -------------------
    if t >= tl:
        fx.debris(fr, 60.0, 0.6, t - tl, n=40, speed=20, spread=math.pi * 0.95, angle=math.pi / 2,
                  size=(0.15, 0.8), salt="ring", g=9.8, ground=0.0)
        fx.shockwave(fr, 60.0, 0.2, t - tl, r_max=14, dur=0.5, ground=True, width=3)
        front = 60.0 - 27.0 * EASE["out"](clamp((t - tl) / 1.4)) * 1.4
        dust_band(fr, front, 63.0, 0.0, 2.2 + 1.2 * clamp((t - tl) * 2), t, salt="rollw", alpha=110)
    if t >= tb:
        bx, by = catmull(path, tb)
        fx.sonic_boom(fr, bx, by + 1.0, t - tb, -0.6, 0.8, size=5.0)
    # windows popping in sequence along the climb (from the boom on)
    for k, (wx, wy) in enumerate(_POPS):
        tp = tb + 0.04 + k * 0.035
        if t >= tp:
            px, py = wx, wy
            fx.glass_shatter(fr, px - 1.0, py - 1.0, px + 1.0, py + 1.0, t - tp, n=8, outward=-1.0 if k < 7 else 1.0,
                             salt=f"pop{k}", d=EB_D)


# =============================================================================
# S4-02  MWS high angle: the grab from above hangs; the passing backfist drags
# =============================================================================

def high_ground(fr, lit=1.0, heap_on=True):
    """The intersection seen steeply from above. The rig stays a side view, so
    the ground is mapped to world y = 0.87 * (metres north of the fighters'
    line): the asphalt fills the frame behind the figures."""
    fr.draw.rectangle([0, 0, fr.W, fr.H], fill=shade((44, 42, 48), lit))
    K = 0.87
    # lane dashes and the centre line
    for z in (-3.4, 3.4):
        x = math.floor((fr.cam.x - 40) / 6) * 6
        while x < fr.cam.x + 40:
            fr.rect(x, z * K - 0.06, x + 3, z * K + 0.06, shade(PAL["street_line"], lit * 0.7))
            x += 6
    fr.rect(fr.cam.x - 40, 1.3 * K - 0.05, fr.cam.x + 40, 1.3 * K + 0.05, shade((150, 120, 60), lit * 0.7))
    fr.rect(fr.cam.x - 40, 1.6 * K - 0.05, fr.cam.x + 40, 1.6 * K + 0.05, shade((150, 120, 60), lit * 0.7))
    # zebra crossings at x = -9 and +9
    for cx in (-9.0, 9.0):
        for k in range(-7, 8):
            z = k * 0.9
            fr.rect(cx - 2.4, z * K - 0.22, cx + 2.4, z * K + 0.22, shade((150, 146, 132), lit * 0.75))
    # landing crater at x = 0
    fr.ellipse(0.0, 0.0, 3.4, 3.4 * K, fill=shade(PAL["concrete"], lit * 0.75))
    fr.ellipse(0.0, -0.2, 2.7, 2.6 * K, fill=shade((18, 16, 20), lit))
    rng = random.Random("hgcr")
    for k in range(16):
        a = rng.uniform(0, math.tau)
        L = rng.uniform(4.5, 8.0)
        fr.line([(math.cos(a) * 3.3, math.sin(a) * 3.3 * K), (math.cos(a + 0.1) * L * 0.6, math.sin(a + 0.1) * L * 0.6 * K),
                 (math.cos(a) * L, math.sin(a) * L * K)], shade((16, 14, 16), lit), width_m=0.05)
    # north sidewalk + building bases at the top
    fr.rect(fr.cam.x - 60, 8.0 * K, fr.cam.x + 60, 9.5 * K, shade(PAL["concrete_dark"], lit * 1.2))
    fr.rect(fr.cam.x - 60, 9.5 * K, fr.cam.x + 60, 30, shade(PAL["bldg_near"], lit))
    # the heap, from above: car roofs and steel
    if heap_on:
        fr.ellipse(7.5, 0.5, 4.0, 2.6, fill=shade((48, 46, 52), lit))
        cols = [(110, 40, 38), (60, 74, 92), (150, 150, 146), (88, 84, 70)]
        for i in range(12):
            cx, cz = rng.uniform(4.5, 10.5), rng.uniform(-1.2, 2.0)
            w, h = rng.uniform(1.2, 2.0), rng.uniform(0.6, 1.0)
            a = rng.uniform(-1, 1)
            ca, sa = math.cos(a), math.sin(a)
            fr.poly([(cx + ca * dx - sa * dy, cz * K + sa * dx + ca * dy) for dx, dy in
                     ((-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2))],
                    shade(rng.choice(cols), lit * 0.8))
    # loose paper and grit
    for i in range(30):
        px, pz = rng.uniform(-14, 14), rng.uniform(-6, 7)
        fr.rect(px, pz * K, px + 0.18, pz * K + 0.12, shade((170, 164, 150), lit * rng.uniform(0.4, 0.8)))


def s4_02(fr):
    t = fr.t
    t_dive = T(fr, 0)
    t_last = T(fr, 6)                                      # last gap: 80% in 2 frames
    t_stall = cue(fr, "infinity_stop", 0, 8)
    t_hand = T(fr, 16)                                     # Gojo's fingers start to rise
    t_kick = cue(fr, "accel_burst", 0, 17)
    t_bf = cue(fr, "infinity_stop", 1, 22)                 # backfist drags at the ribs
    t_free = t_bf + T(fr, 3)
    t_blue = cue(fr, "blue", 0, 26)
    t_clear = T(fr, 34)
    t_exit = T(fr, 40)
    t_snap = T(fr, 30)
    cx = kf(t, [(t_snap, -2.0), (t_snap + T(fr, 3), 1.6, "out")])
    fr.cam = Cam(cx, 1.5, 110)
    high_ground(fr)
    # ---- Gojo (on 2s, totally still except the hand) -----------------------------
    t2 = on2(fr)
    gp = pose_at(t2, [(t_hand, G_LOOSE), (t_hand + T(fr, 8), G_TWO, "out"), (t_blue + T(fr, 14), G_TWO),
                      (t_blue + T(fr, 24), G_LOOSE, "inout")])
    Jg0 = solve(GOJO, gp, -4.0, None, 1, 1.0, "side", 0.0)
    collar = collar_front(Jg0)
    ribs = (chest_front(Jg0)[0] + 0.02, Jg0["chest"][1] - 0.32)
    # Gojo's shadow, and Thragg's shadow growing on the asphalt as he plunges
    fr.ellipse(-4.0, 0.0, 0.35, 0.16, fill=(28, 26, 32))
    if t < t_stall:
        k = seg(t, 0, t_stall, "in")
        fr.ellipse(-3.7, 0.05, 0.4 + 0.5 * k, 0.2 + 0.25 * k, fill=(30, 28, 34))
    # dust ring flattened outward around the shoes by the side lobes (f8-9 on)
    if t >= t_stall:
        u = EASE["out"](clamp((t - t_stall) / 0.35))
        img, dr = fr.layer()
        for k in range(26):
            a = k * math.tau / 26
            rr = 0.5 + 1.5 * u + 0.15 * math.sin(k * 3.1)
            X, Y = fr.P(-4.0 + math.cos(a) * rr, math.sin(a) * rr * 0.6)
            R = fr.S(0.28)
            dr.ellipse([X - R, Y - R * 0.6, X + R, Y + R * 0.6], fill=PAL["dust"] + (int(90 * (1 - 0.4 * u)),))
        fr.merge(img)
        rng = fr.srng("paper")
        for k in range(10):
            a = rng.uniform(0, math.tau)
            rr = (0.6 + rng.uniform(0.8, 1.8) * u)
            px, py = -4.0 + math.cos(a) * rr, math.sin(a) * rr * 0.6
            fr.poly([(px, py), (px + 0.2, py + 0.05), (px + 0.16, py + 0.17), (px - 0.03, py + 0.12)],
                    (196, 190, 176))
    # ---- Thragg -------------------------------------------------------------------
    TG = P("dive", lean=172, neck=-24, ua_f=-160, fa_f=-150, th_n=-176, sh_n=-188, th_f=-168, sh_f=-196,
           hand_n="claw")
    TPASS = P("t_fly_punch", lean=62, neck=-16, ua_f=40, fa_f=110, th_n=-60, sh_n=-90, th_f=-80, sh_f=-110,
              hand_n="fist")
    behind = False
    J = None
    if t < t_kick:
        # dive: from past the lens (huge) to the collar; 80% of the last gap in 2 frames, then a crawl
        g = stall_gap(t, t_last, t_stall, 1.6, 0.02, crawl=4.0)
        ax, ay = 0.34, 0.94
        hand = (collar[0] + ax * g, collar[1] + ay * g)
        push = 0.05 * seg(t, t_stall, t_stall + T(fr, 7), "out")       # the body keeps driving: elbow bunches
        body = (hand[0] + 0.30 - push * 0.3, hand[1] + 1.30 - push)
        if t < t_last:
            u = seg(t, t_dive, t_last, "in")
            sc = lerp(2.2, 1.0, u)
            far = (body[0] + 0.6, body[1] + 7.0)
            bx, by = lerp(far[0], body[0], u), lerp(far[1], body[1], u)
            pose = P(TG, ua_n=8, fa_n=4)
            J = thragg(fr, pose, bx, by, 1, scale=sc, cape_wind=(0.0, 1.0))
            fx.trail(fr, [(bx + 0.1 * k, by + 1.5 + 1.2 * k) for k in range(6, -1, -1)], width_m=1.2, alpha=80)
        else:
            pose = reach(THRAGG, TG, body[0], body[1], 1, "n", hand, elbow="up")
            J = thragg(fr, pose, body[0], body[1], 1, cape_wind=(0.0, 1.0))
    else:
        # kick off the air: swing past the downstage flank, backfist trailing at the ribs
        path = [(t_kick, (-3.45, 3.1)), (t_kick + T(fr, 2), (-3.1, 2.2)), (t_bf, (-3.2, 0.75)),
                (t_free, (-2.7, 0.7)), (t_blue + T(fr, 2), (-1.4, 1.0)), (t_blue + T(fr, 5), (0.8, 2.2)),
                (t_clear, (3.0, 3.0)), (t_clear + T(fr, 3), (8.5, 4.2)), (t_exit, (20.0, 6.0)),
                (t_exit + T(fr, 6), (40.0, 8.0))]
        bx, by = catmull(path, t)
        lean_k = seg(t, t_kick, t_bf - T(fr, 1), "out")
        base = pose_at(t, [(t_kick, TG), (t_bf - T(fr, 1), TPASS, "out")])
        if t < t_bf:
            # winding the backfist across the body (near = right arm, facing east)
            base = P(base, ua_n=lerp(30, 120, lean_k), fa_n=lerp(20, 150, lean_k), hand_n="fist")
            J = thragg(fr, base, bx, by, 1)
        elif t < t_free:
            gap = stall_gap(t, t_bf - 2 / FPS, t_bf, 0.35, 0.03, crawl=6.0)
            fist = (ribs[0] + gap, ribs[1])
            pose = reach(THRAGG, P(TPASS, hand_n="fist"), bx, by, 1, "n", fist, elbow="up")
            J = thragg(fr, pose, bx, by, 1)
            C.infinity_stop(fr, J, (ribs[0] - 0.05, ribs[1]), t - t_bf, side="n", r=0.6)
            fx.trail(fr, [(fist[0] + 0.25 * k, fist[1] + 0.02 * k) for k in range(5, -1, -1)], width_m=0.2, alpha=60)
        else:
            # torn free by his own momentum; then burning against the Blue's pull
            k = seg(t, t_free, t_free + T(fr, 2), "out")
            roll = 18 * math.sin((t - t_blue) * 14) * seg(t, t_blue, t_blue + T(fr, 3)) * (1 - seg(t, t_clear, t_clear + T(fr, 2)))
            pose = P(TPASS, ua_n=lerp(-90, -60, k), fa_n=lerp(-95, -40, k), lean=62 + roll)
            if t > t_clear:
                pose = pose_at(t, [(t_clear, pose), (t_clear + T(fr, 3), P("t_fly_punch", lean=84), "out")])
            J = thragg(fr, pose, bx, by, 1)
            if t > t_clear - T(fr, 2):
                tail = [catmull(path, max(t_kick, t - kk * 0.03)) for kk in range(7, -1, -1)]
                fx.trail(fr, [(px, py + 0.4) for px, py in tail], width_m=1.0, alpha=90)
    # ---- Gojo drawn after the dive (Thragg's dive is upstage of the collar) / before the pass (downstage)
    Jg = gojo(fr, gp, -4.0, 0.0, 1, halo=1.0, mouth="flat")
    if t >= t_kick and J is not None and t < t_free + T(fr, 1):
        # the pass is downstage (camera side): redraw him over Gojo
        bx, by = catmull([(t_kick, (-3.45, 3.1)), (t_kick + T(fr, 2), (-3.1, 2.2)), (t_bf, (-3.2, 0.75)),
                          (t_free, (-2.7, 0.7)), (t_blue + T(fr, 2), (-1.4, 1.0))], t)
        if t < t_bf:
            lean_k = seg(t, t_kick, t_bf - T(fr, 1), "out")
            base = pose_at(t, [(t_kick, TG), (t_bf - T(fr, 1), TPASS, "out")])
            base = P(base, ua_n=lerp(30, 120, lean_k), fa_n=lerp(20, 150, lean_k), hand_n="fist")
            J = thragg(fr, base, bx, by, 1)
        else:
            gap = stall_gap(t, t_bf - 2 / FPS, t_bf, 0.35, 0.03, crawl=6.0)
            fist = (ribs[0] + gap, ribs[1])
            pose = reach(THRAGG, P(TPASS, hand_n="fist"), bx, by, 1, "n", fist, elbow="up")
            J = thragg(fr, pose, bx, by, 1)
    # ---- Infinity on the grab: refraction, grit halo over the shoulders, no flash --
    if t_stall - T(fr, 1) <= t < t_kick + T(fr, 2):
        ts = max(0.0, t - t_stall)
        k = clamp(ts / 0.1)
        fx.infinity(fr, collar[0], collar[1] + 0.05, r=0.55, strength=0.4 + 0.5 * k, t=t)
        if ts < 0.3:
            hx, hy = tip_pos(J, "n", THRAGG, "claw") if t < t_kick else collar
            fx.impact(fr, hx, hy, ts, kind="blocked", dirx=-0.34, diry=-0.94)
        shards(fr, [(-4.0 + math.cos(a) * 0.36, 1.62 + math.sin(a) * 0.16) for a in
                    [i * math.tau / 22 for i in range(22)]], t, "halo", size=0.016, col=(150, 140, 126))
        fx.suspended_dust(fr, collar[0] + 0.01, collar[1] + 0.02, collar[0] + 0.06, collar[1] + 0.14, n=16, t=t,
                          salt="gapgrab", size=0.006)
    # ---- Blue: light grit first, nothing heavy nearby ------------------------------
    bxp, byp = -2.5, 2.8
    if t_blue <= t < t_clear + T(fr, 1):
        tb = t - t_blue
        fx.blue(fr, bxp, byp, tb, r=0.3 * (1 - 0.6 * seg(t, t_clear - T(fr, 2), t_clear + T(fr, 1))), streaks=40,
                salt="b402")
        rng = fr.srng("grit")
        for i in range(36):
            a = rng.uniform(0, math.tau)
            p0 = (bxp + math.cos(a) * rng.uniform(2, 5), byp + math.sin(a) * rng.uniform(1.5, 3.5))
            x, y, u = fx.pull(p0, (bxp, byp), tb, mass=0.2, strength=1.4)
            if u < 0.97:
                fr.line([(x, y), (x + (bxp - x) * 0.12, y + (byp - y) * 0.12)], (190, 176, 150), width_px=2)
    if t >= t_clear:
        # it collapses into a fist-sized clot of grit that drops and bounces
        tt = t - t_clear
        y = byp - 0.5 * 9.8 * tt * tt
        if y < 0.08:
            tf = math.sqrt(2 * (byp - 0.08) / 9.8)
            tb2 = tt - tf
            y = 0.08 + max(0.0, 2.2 * tb2 - 0.5 * 9.8 * tb2 * tb2)
        fr.circle(bxp + 0.25 * tt, y, 0.06, fill=(92, 86, 80))
        fr.circle(bxp + 0.25 * tt - 0.02, y + 0.02, 0.03, fill=(130, 122, 110))


# =============================================================================
# S4-03  WS worm's-eye: the feint, the grab from below, the blind flank
# =============================================================================

def s4_03(fr):
    t = fr.t
    t_skim = cue(fr, "flyby", 0, 6)
    t_grab0 = T(fr, 13)
    t_grab = cue(fr, "infinity_stop", 0, 15)
    t_hook = cue(fr, "whoosh", 0, 23)
    t_flick = cue(fr, "cloth", 0, 28)
    t_break = cue(fr, "accel_burst", 0, 29)
    t_blue = cue(fr, "blue", 0, 32)
    t_pan = T(fr, 30)
    t_zoom = T(fr, 40)
    t_zoom1 = T(fr, 46)
    cx = kf(t, [(t_pan, 1.0), (t_pan + T(fr, 4), 5.0)])
    u = seg(t, t_zoom, t_zoom1, "inout")
    zoom = math.exp(lerp(math.log(60.0), math.log(330.0), u))
    fr.cam = Cam(lerp(cx, 16.0, u), lerp(3.0, 10.75, u), zoom)
    street_bg(fr)
    # flattened lamp post on the asphalt, dragged toward the Blue (mass 3)
    lp0 = (5.5, 0.15)
    lpx, lpy = lp0
    bend = 0.0
    if t >= t_blue:
        x, y, pu = fx.pull(lp0, (0.0, 5.0), t - t_blue, mass=3.0, strength=1.0)
        lpx = lp0[0] - (lp0[0] - 1.2) * pu
        bend = pu
    fr.line([(lpx, 0.15), (lpx + 3.2, 0.2 + 0.0), (lpx + 4.2 - 0.6 * bend, 0.3 + 1.2 * bend)], (72, 74, 82),
            width_m=0.16)
    # ---- Gojo steps up onto the air ------------------------------------------------
    sole = 3.0 * seg(t, 0, T(fr, 8), "inout")
    t2 = on2(fr)
    gp = pose_at(t, [(0, G_LOOSE), (T(fr, 3), G_STEP), (T(fr, 8), G_LOOSE)])
    sway = seg(t, t_hook, t_hook + T(fr, 1), "out") * (1 - seg(t, t_hook + T(fr, 5), t_hook + T(fr, 12)))
    gp = pose_at(sway, [(0, gp), (1, G_SWAY)])
    flick = seg(t, t_flick - T(fr, 1), t_flick, "out") * (1 - seg(t, t_flick + T(fr, 6), t_flick + T(fr, 12)))
    if flick > 0:
        gp = pose_at(flick, [(0, gp), (1, P(gp, ua_f=52, fa_f=104, hand_f="sign"))])
    Jg0 = solve(GOJO, gp, -4.0, None, 1, 1.0, "side", sole)
    throat = (Jg0["neck"][0] + 0.06, Jg0["neck"][1] - 0.06)
    # ---- Thragg ---------------------------------------------------------------------
    T_SKIM = P("t_fly_punch", lean=84, ua_n=-70, fa_n=-80, ua_f=-76, fa_f=-86)
    T_RISE = P("fly_up", lean=-6, neck=10, ua_n=150, fa_n=165, ua_f=-20, fa_f=10, hand_n="open",
               th_n=-10, sh_n=-30, th_f=-20, sh_f=-50)
    T_HOOKW = legs_air(P("t_hook_wind", lean=-8, ua_n=-30, fa_n=96, ua_f=40, fa_f=120))
    T_HOOKX = legs_air(P("t_hook", lean=20, ua_n=86, fa_n=140))
    draw_after = True
    if t < t_grab0:
        path = [(t_skim, (17.0, 0.8)), (T(fr, 8), (7.0, 0.85)), (T(fr, 11), (-0.5, 0.7)), (t_grab0, (-3.5, 0.6))]
        x, y = catmull(path, t)
        dip = math.sin(clamp((t - T(fr, 8)) / max(1e-6, T(fr, 11) - T(fr, 8))) * math.pi)
        pose = P(T_SKIM, lean=84 + 16 * dip, neck=-28 + 20 * dip)
        if t >= t_skim - T(fr, 1):
            J = thragg(fr, pose, x, y, -1)
            fx.speed_lines(fr, 0.7, direction=(-1, 0), salt="s403")
            fx.trail(fr, [catmull(path, max(t_skim, t - k * 0.03)) for k in range(7, -1, -1)], width_m=0.7, alpha=80)
        J = None
        draw_after = False
    elif t < t_grab + T(fr, 2):
        # from below: the rising open left hand at the throat (fingers spread)
        g = stall_gap(t, t_grab0, t_grab, 1.9, 0.03, crawl=5.0)
        hand = (throat[0] + 0.12 * g / 1.9, throat[1] - g)
        body = (hand[0] + 0.32, hand[1] - 1.05)
        pose = reach(THRAGG, T_RISE, body[0], body[1], -1, "n", hand, elbow="down")
        J = ("pose", pose, body)
    elif t < t_hook - T(fr, 1):
        # rolls round the upstage (far) flank, behind him in the haze
        k = seg(t, t_grab + T(fr, 2), t_hook - T(fr, 1), "inout")
        bx, by = lerp(-3.55, -3.0, k), lerp(3.55, 3.95, k)
        pose = pose_at(k, [(0, T_RISE), (1, T_HOOKW)])
        J = ("pose", pose, (bx, by))
        draw_after = False
    elif t < t_break:
        # left hook from upstage at the temple; Gojo sways; a clean miss
        k = seg(t, t_hook - T(fr, 1), t_hook + T(fr, 1), "out")
        pose = pose_at(k, [(0, T_HOOKW), (1, T_HOOKX)])
        if t > t_flick:
            pose = P(pose, neck=12)                   # his eyes drop to the hand
        J = ("pose", pose, (-3.0 + 0.3 * k, 3.95))
        draw_after = False
    else:
        path = [(t_break, (-2.7, 3.95)), (t_break + T(fr, 3), (2.0, 6.4)), (t_break + T(fr, 7), (10.0, 9.2)),
                (t_break + T(fr, 11), (15.0, 10.1)), (t_break + T(fr, 15), (16.0, 10.0))]
        x, y = catmull(path, t)
        plant = t_break + T(fr, 11)
        if t < plant:
            pose = P("t_fly_punch", lean=50, neck=-14)
            J = ("pose", pose, (x, y), 1)
        else:
            pose = P(T_HOVER, neck=14)
            J = ("pose", pose, (x, y), -1)
        draw_after = False
    if isinstance(J, tuple) and not draw_after:
        fac = J[3] if len(J) > 3 else -1
        Jt = thragg(fr, J[1], J[2][0], J[2][1], fac)
    # Blue point on empty air (after Thragg has gone)
    if t >= t_blue:
        tb = t - t_blue
        fade = 1 - seg(t, t_blue + T(fr, 12), t_blue + T(fr, 16))
        if fade > 0:
            fx.blue(fr, 0.0, 5.0, tb, r=0.35 * fade, streaks=40, salt="b403")
            rng = fr.srng("grit403")
            for i in range(30):
                a = rng.uniform(math.pi * 1.1, math.pi * 1.9)
                p0 = (rng.uniform(-6, 7), rng.uniform(0.05, 0.4))
                x, y, pu = fx.pull(p0, (0.0, 5.0), tb, mass=0.2, strength=1.2)
                if pu < 0.97:
                    fr.line([(x, y), (x + (0 - x) * 0.1, y + (5 - y) * 0.1)], (180, 170, 150), width_px=2)
    Jg = gojo(fr, gp, -4.0, sole, 1, halo=1.4, mouth="flat")
    if isinstance(J, tuple) and draw_after:
        Jt = thragg(fr, J[1], J[2][0], J[2][1], -1)
    # ---- Infinity on the throat grab: gravel sheet hanging under the jaw ----------
    if t_grab - T(fr, 1) <= t < t_hook:
        ts = max(0.0, t - t_grab)
        hx, hy = tip_pos(Jt, "n", THRAGG, "open") if draw_after else throat
        fx.infinity(fr, throat[0], throat[1] + 0.05, r=0.5, strength=0.4 + 0.5 * clamp(ts / 0.1), t=t)
        if ts < 0.3 and draw_after:
            fx.impact(fr, hx, hy, ts, kind="blocked", dirx=0, diry=1)
        rng = fr.srng("gravel")
        pts = [(throat[0] + rng.uniform(-0.25, 0.15), throat[1] - rng.uniform(0.05, 0.16)) for _ in range(24)]
        shards(fr, pts, t, "grav", size=0.02, col=(110, 104, 100))
    # air smear on the missed hook (f23-24)
    if t_hook - T(fr, 1) <= t < t_hook + T(fr, 2):
        a = 1 - seg(t, t_hook, t_hook + T(fr, 2))
        fx.trail(fr, [(-2.6 + (-3.95 + 2.6) * k / 6, 4.95 - 0.12 * math.sin(k / 6 * math.pi)) for k in range(7)],
                 width_m=0.35, alpha=int(140 * a))
    if t >= t_zoom1 - T(fr, 2):
        thragg_eye(fr, Jt, look=(-0.6, 0.9), brow=0.8)


# =============================================================================
# S4-04  MS two-shot: the slow-hand test
# =============================================================================

def s4_04(fr):
    t = fr.t
    t_set = T(fr, 30)
    t62 = T(fr, 62)
    t_stall = cue(fr, "infinity_stop", 0, 64)
    t_brow = T(fr, 70)
    t_smile = T(fr, 76)
    t_look = T(fr, 76)
    t_back = cue(fr, "cloth", 0, 88)
    u = seg(t, 0, fr.dur, "inout")
    fr.cam = Cam(lerp(-1.5, -3.4, u), lerp(3.8, 4.6, u), math.exp(lerp(math.log(120), math.log(320), u)))
    street_bg(fr)
    motes(fr, t, -12, 6, 1.5, 8, n=70, salt="m404", vx=-0.3, alpha=110)
    # ---- Gojo: unbothered; eyebrow on 2s, the smile a one-drawing change --------------
    t2 = on2(fr)
    Jg = gojo(fr, G_LOOSE, -4.0, 3.0, 1, mouth="smirk" if t2 >= t_smile else "flat")
    gojo_brow(fr, Jg, seg(t2, t_brow, t_brow + T(fr, 8), "out"))
    collar = collar_front(Jg)
    # ---- Thragg: descends, then drifts in at walking pace, constant velocity ---------
    v = 1.8
    k8 = 8.0
    g62 = 0.04 + v / k8
    if t < t62:
        gap = g62 + v * (t62 - t)
    else:
        gap = 0.04 + (g62 - 0.04) * math.exp(-k8 * (t - t62))
    if t >= t_back:
        gap += 0.30 * seg(t, t_back, t_back + T(fr, 7), "inout")
    hand = (collar[0] + gap, collar[1] + 0.02)
    R = (collar[0] + g62) - (-2.9)
    body_x = hand[0] - R
    if t < t_set:
        k = seg(t, 0, t_set, "out")
        bx = lerp(16.0, -0.5, k)
        sole = lerp(10.0, 3.0, k)
        bx = min(bx, body_x) if t > t_set - 0.1 else bx
    else:
        bx = -0.5 + (body_x - (-0.5)) * 1.0 if t < t62 else body_x
        # constant drift x(t) = -0.5 - v (t - t_set) until the hand takes over
        bx = max(body_x, -0.5 - v * (t - t_set)) if t < t62 else body_x
        sole = 3.0
    arm_k = seg(t, T(fr, 22), T(fr, 36), "inout")
    neck = 0.0
    if t >= t_stall:
        neck = 14 * seg(t, t_stall, t_stall + T(fr, 6)) * (1 - seg(t, t_look, t_look + T(fr, 10)))
    base = P(T_STILL, neck=neck, hand_f="open")
    Js = solve(THRAGG, base, bx, None, -1, 1.0, "side", sole)
    if arm_k > 0:
        reach_pose = reach(THRAGG, base, bx, None, -1, "f", hand, ground=sole)
        pose = pose_at(arm_k, [(0, base), (1, reach_pose)])
    else:
        pose = base
    J = thragg(fr, pose, bx, None, -1, sole=sole)
    # the only cue: a faint refraction ripple at the fingertips (no disc, no grit)
    if t >= t62:
        tip = tip_pos(J, "f", THRAGG, "open")
        s = 0.25 * clamp((t - t62) / 0.2)
        fx.infinity(fr, tip[0] - 0.02, tip[1], r=0.18, strength=s, t=t)
    motes(fr, t, -6, 2, 3.5, 6.5, n=24, salt="m404b", vx=-0.2, alpha=90, size=0.008)


# =============================================================================
# S4-05  WS static: deny the eyes - two facades and the street turned to dust
# =============================================================================

def s4_05(fr):
    t = fr.t
    t_go = cue(fr, "accel_burst", 0, 0)
    t1 = cue(fr, "punch_heavy", 0, 8)
    t2 = cue(fr, "punch_heavy", 1, 16)
    t3 = cue(fr, "punch_heavy", 2, 28)
    t_hang = cue(fr, "infinity_stop", 0, 31)
    sh = (0.0, 0.0)
    for tc, amp, nf in ((t1, 9.0, 4), (t2, 9.0, 4), (t3, 15.0, 6)):
        s = shake2(t, tc, amp, nf)
        sh = (sh[0] + s[0], sh[1] + s[1])
    fr.cam = Cam(6.0, 8.0, 32.0, shake=sh)
    ne_state = "hit" if t >= t1 else "intact"
    street_bg(fr, ne="none", heap_state="blasted" if t >= t3 else "intact")
    # NE corner: drawn here so its face can disintegrate from the contact point
    ne_contact = at_d(fr, 10.0, 8.0, NE["d"])
    corner_ne(fr, 1.0, ne_state, t - t1, ne_contact)
    if t >= t1:
        fx.dust_cloud(fr, ne_contact[0], ne_contact[1] - 4, t - t1, r=14.0, n=26, salt="aval1", d=NE["d"],
                      alpha=150, ground=False, rise=-2.0)
        fx.debris(fr, ne_contact[0], ne_contact[1], t - t1, n=26, speed=7, spread=1.6, angle=-math.pi / 2 - 0.4,
                  size=(0.4, 1.4), salt="nedeb", d=NE["d"], g=9.8)
        fx.dust_cloud(fr, ne_contact[0] + 4, 0.0, t - t1 - 0.3, r=12.0, salt="aval1g", d=NE["d"], alpha=140)
    # ---- Gojo: on air, still, head tracking -------------------------------------------
    Jg = gojo(fr, P(G_LOOSE, neck=-4), -4.0, 3.0, 1, halo=1.6, mouth="flat")
    # ---- Thragg ---------------------------------------------------------------------
    keys = [(t_go, (-2.9, 3.9, 1.0)), (T(fr, 4), (2.5, 6.4, 1.3)), (t1, (9.3, 8.0, 1.8)), (T(fr, 10), (9.2, 7.6, 1.55)),
            (T(fr, 12), (6.5, 6.6, 1.05)), (T(fr, 14), (9.3, 6.3, 0.8)), (t2, (11.2, 6.0, 0.7)),
            (T(fr, 18), (7.0, 3.5, 0.9)), (T(fr, 20), (5.3, 1.9, 1.0))]
    T_SMEAR = P("t_fly_punch", lean=64, neck=-18)
    T_SHOULDER = P("t_punch", lean=44, neck=6, ua_n=96, fa_n=-24, ua_f=-30, fa_f=40, **LEGS_AIR)
    T_HAMMER_W = legs_air(P("t_axe", lean=4))
    T_HAMMER = legs_air(P("t_axe_down", lean=48))
    T_LOAD = swap_arms(P("t_punch_wind", lean=34, neck=10, ua_n=-70, fa_n=40, th_n=80, sh_n=-20, th_f=-10,
                         sh_f=-80))
    T_DOWN = swap_arms(P("t_punch", lean=62, neck=8, ua_n=150, fa_n=150, th_n=70, sh_n=-10, th_f=-20, sh_f=-90))
    fg_thragg = False
    if t < T(fr, 20):
        x, y, d = catmull(keys, t)
        if t < t1 - T(fr, 1):
            pose, fac = T_SMEAR, 1
        elif t < t1 + T(fr, 2):
            pose, fac = T_SHOULDER, 1
        elif t < t2 - T(fr, 2):
            pose, fac = P(T_SMEAR, lean=40), 1
        elif t < t2 + T(fr, 2):
            pose, fac = pose_at(t, [(t2 - T(fr, 2), T_HAMMER_W), (t2, T_HAMMER, "snap")]), 1
        else:
            pose, fac = P("dive", lean=150), -1
        lx, ly = at_d(fr, x, y, d)
        if d < 0.95:
            fg_thragg = (pose, lx, ly, fac, d)
        else:
            thragg(fr, pose, lx, ly, fac, depth=d)
            if t < t2 - T(fr, 2):
                tail = [catmull(keys, max(t_go, t - k * 0.03)) for k in range(6, -1, -1)]
                fx.trail(fr, [at_d(fr, px, py, pd) for px, py, pd in tail], width_m=1.2, alpha=80)
    else:
        # on the heap's west slope: hips load (f20-27), then the straight right down
        pose = pose_at(t, [(T(fr, 20), P(T_LOAD, lean=20)), (t3 - T(fr, 1), T_LOAD), (t3, T_DOWN, "snap")])
        J = thragg(fr, pose, 5.6, None, -1, sole=0.9 if t < t3 else 0.4)
    if t >= t1 and t - t1 < 0.6:
        fx.impact(fr, ne_contact[0], ne_contact[1], t - t1, kind="heavy", d=NE["d"], salt="i1")
    # ---- the street punch: geyser of wrecks, asphalt and sub-base -----------------------
    if t >= t3:
        tt = t - t3
        fx.impact(fr, GEYSER_X, 0.3, tt, kind="heavy", salt="i3")
        fx.cracks(fr, GEYSER_X, 0.0, 6.0 * clamp(tt / 0.2), n=10, salt="ck405")
        fx.debris(fr, GEYSER_X, 0.5, tt, n=60, speed=25, spread=0.9, angle=math.pi / 2, size=(0.2, 1.1),
                  salt="geyser", g=9.8)
        fx.debris(fr, GEYSER_X + 2, 1.0, tt, n=14, speed=16, spread=1.8, angle=math.pi / 2, size=(0.7, 1.6),
                  color=(90, 60, 56), salt="wrecks", g=9.8)
        img, dr = fr.layer()
        hcol = min(30.0, 30 * EASE["out"](clamp(tt / 0.6)))
        for k in range(12):
            yy = hcol * k / 11
            X, Y = fr.P(GEYSER_X + math.sin(k * 1.7) * 0.8, yy)
            R = fr.S(1.6 + yy * 0.18)
            dr.ellipse([X - R, Y - R, X + R, Y + R], fill=PAL["dust"] + (150,))
        fr.merge(img)
        fx.dust_cloud(fr, GEYSER_X, 0.0, tt, r=10.0, n=24, salt="g405", alpha=150)
        # chunks flung toward Gojo hang short of him, then the dust closes over everything
        if t >= t_hang - T(fr, 2):
            th = t - (t_hang - T(fr, 2))
            rng = fr.srng("fling")
            pts = []
            for i in range(14):
                tgt = (-4.0 + 0.42 + rng.uniform(0, 0.35), 3.0 + rng.uniform(0.5, 1.7))
                p0 = (tgt[0] + 3.0, tgt[1] + rng.uniform(-0.5, 0.5))
                rem = fx.zeno(1.0, th, rate=10.0)
                pts.append((tgt[0] + (p0[0] - tgt[0]) * rem, tgt[1] + (p0[1] - tgt[1]) * rem))
            shards(fr, pts, t, "fl405", size=0.14, col=(96, 90, 92), jit=0.01)
            fx.infinity(fr, Jg["chest"][0], Jg["chest"][1], r=1.0, strength=0.6, t=t)
    if fg_thragg:
        pose, lx, ly, fac, d = fg_thragg
        thragg(fr, pose, lx, ly, fac, depth=d)
    # ---- SE corner (foreground right) + its dust wall across the near curb ------------
    se_contact = at_d(fr, 12.0, 6.0, SE["d"])
    corner_se(fr, 1.0, "hit" if t >= t2 else "intact", t - t2, se_contact)
    if t >= t2:
        if t - t2 < 0.6:
            fx.impact(fr, se_contact[0], se_contact[1], t - t2, kind="heavy", d=SE["d"], salt="i2")
        fx.dust_cloud(fr, se_contact[0], se_contact[1] - 3, t - t2, r=10.0, n=22, salt="aval2", d=SE["d"], alpha=150,
                      ground=False, rise=-3.0)
        fx.dust_cloud(fr, se_contact[0] - 2, -0.5, t - t2 - 0.15, r=12.0, n=22, salt="aval2g", d=SE["d"], alpha=160)
    # ---- the three dust masses meet and swallow the intersection ------------------------
    if t >= t3:
        k = seg(t, t3 + T(fr, 1), fr.dur - T(fr, 1), "in")
        hold_gojo = 1 - seg(t, T(fr, 34), T(fr, 38))
        murk(fr, k * (1 - 0.35 * hold_gojo), t, salt="m405")
        if hold_gojo > 0:
            gojo(fr, P(G_LOOSE, neck=-4), -4.0, 3.0, 1, halo=1.2, mouth="flat") if hold_gojo > 0.5 else None


# =============================================================================
# S4-06  CU: a fist from the murk stops an inch from his ear; he never saw it
# =============================================================================

def gojo_gaze(fr, cu, cv, s, gx=0.0, gy=0.0, flip=1, glow=1.0):
    """Repaint gojo_face's eyes with a gaze offset (gx, gy in -1..1)."""
    L = inserts.Local(fr, cu, cv, s, 0.0, flip)
    for ex, sz in ((0.3, 1.0), (-0.12, 0.85)):
        ey = -0.15
        L.ell(ex, ey, 0.12 * sz, 0.07 * sz, fill=(240, 252, 255))
        ix, iy = ex + 0.01 + gx * 0.05 * sz, ey + gy * 0.02 * sz
        L.ell(ix, iy, 0.065 * sz, 0.065 * sz, fill=(60, 190, 255))
        L.ell(ix, iy, 0.03 * sz, 0.03 * sz, fill=(200, 240, 255))
        L.glow(ix, iy, 0.18 * sz * glow, (40, 130, 220))
        L.line([(ex - 0.13 * sz, ey - 0.06), (ex + 0.13 * sz, ey - 0.08)], GOJO.hair, 0.014)


def s4_06(fr):
    t = fr.t
    t_burst = cue(fr, "whoosh", 0, 22)
    t_stall = cue(fr, "infinity_stop", 0, 24)
    t_eyes = cue(fr, "breath", 0, 26)
    t_back = cue(fr, "cloth", 0, 36)
    fr.cam = Cam(0.0, 0.0, 1080.0)
    inserts._bg(fr, (70, 60, 58), (128, 108, 92), bokeh=False)
    # layered dust: far layer + the Six Eyes' pale haze smear (where, not what)
    for layer, (sp, a, sz) in enumerate(((0.012, 120, 0.3), (0.025, 90, 0.22))):
        img, dr = fr.layer()
        rng = fr.srng(f"dl{layer}")
        for i in range(14):
            u = (rng.random() - t * sp * (1 + rng.random())) % 1.4 - 0.2
            v = rng.random()
            r = rng.uniform(0.6, 1.2) * sz
            dr.ellipse([(u - r) * fr.W, (v - r * 0.5) * fr.H, (u + r) * fr.W, (v + r * 0.5) * fr.H],
                       fill=shade((150, 128, 110), rng.uniform(0.8, 1.1)) + (a,))
        fr.merge(img)
        if layer == 0:
            fade = 1 - seg(t, T(fr, 14), T(fr, 20))
            if fade > 0:
                hu = 0.8 + 0.06 * seg(t, 0, T(fr, 20), "linear")
                fr.soft_circle(hu, 0.42, 0.13, shade((70, 90, 110), fade), world=False)
                fr.soft_circle(hu + 0.02, 0.45, 0.07, shade((90, 110, 130), fade), world=False)
    # ---- Gojo: right profile (faces screen-right), eyes searching the murk ------------
    cu, cv, s = 0.36, 0.56, 0.86
    inserts.gojo_face(fr, cu, cv, s, expr="focused", eyes="open", t=t)
    if t < t_eyes:
        scan = math.sin(t * 2.2) * 0.35
        gx, gy = 0.9, -0.55 + scan * 0.6
    else:
        k = seg(t, t_eyes, t_eyes + T(fr, 3), "out")
        gx, gy = lerp(0.9, 1.0, k), lerp(-0.4, 0.8, k)
    gojo_gaze(fr, cu, cv, s, gx, gy)
    # ---- the fist ---------------------------------------------------------------------
    # stall point: 2.5 cm (about 100 px at this scale) off the side of his head
    stop_u = 0.60
    if t >= t_burst:
        g = stall_gap(t, t_burst, t_stall, 0.55, 0.0, crawl=5.0)
        if t >= t_back:
            g += 0.6 * seg(t, t_back, t_back + T(fr, 7), "in")
        fu = stop_u + g
        fv = 0.47
        inserts.thragg_fist(fr, fu, fv, 0.5, rot=-6, flip=-1)
        if t >= t_stall - 1 / FPS and t < t_back + T(fr, 3):
            ts = max(0.0, t - t_stall)
            # compressed-air disc ahead of the knuckles (no flash), refraction in the gap
            kx = fu * fr.W - 0.46 * 0.5 * fr.H * 0.5
            img, dr = fr.layer()
            for k in range(3):
                rr = (0.05 + k * 0.025 + 0.01 * math.sin(t * 9 + k)) * fr.H
                dr.ellipse([kx - rr * 0.22 - k * 6 * fr.ss, fv * fr.H - rr, kx + rr * 0.22 - k * 6 * fr.ss, fv * fr.H + rr],
                           outline=(225, 235, 245, int(150 - 35 * k)), width=max(1, int(2 * fr.ss)))
            fr.merge(img)
            wx, wy = s2w(fr, (kx / fr.W) - 0.03, fv)
            fx.infinity(fr, wx, wy, r=0.14, strength=0.35 + 0.5 * clamp(ts / 0.1), t=t)
            # grit carried in the fist's wake hangs and jitters
            rng = fr.srng("wake")
            for i in range(26):
                pu = kx / fr.W + rng.uniform(-0.005, 0.12)
                pv = fv + rng.uniform(-0.09, 0.09)
                j = 0.0012 * math.sin(t * 40 + i)
                fr.s_circle(pu + j, pv - j, rng.uniform(0.0015, 0.004), fill=shade((90, 80, 70), rng.uniform(0.7, 1.3)))
        if t < t_stall:
            fr.blur_dir = (-18, 0)
    # near dust layer drifting across the lens (thin: it never buries him)
    img, dr = fr.layer()
    rng = fr.srng("near")
    for i in range(6):
        u = (rng.random() - t * 0.05) % 1.6 - 0.3
        v = rng.random()
        r = rng.uniform(0.18, 0.3)
        dr.ellipse([(u - r) * fr.W, (v - r * 0.4) * fr.H, (u + r) * fr.W, (v + r * 0.4) * fr.H],
                   fill=(160, 138, 118, 46))
    fr.merge(img)


# =============================================================================
# S4-07  WS low: the big Blue vacuums the dust into a ball - and he throws it
# =============================================================================

def s4_07(fr):
    t = fr.t
    t_blue = cue(fr, "blue", 0, 6)
    t_heavy = cue(fr, "metal_groan", 0, 20)
    t_reveal = T(fr, 24)
    t_lock = T(fr, 36)
    t_snap = cue(fr, "whoosh", 0, 38)
    t_fly = T(fr, 44)
    cx = kf(t, [(t_snap, 2.0), (t_snap + T(fr, 10), 8.0)])
    fr.cam = Cam(cx, 7.0, 40.0)
    street_bg(fr)
    bp0 = (-4.0, 11.0)
    # the point: the ball goes where the point goes
    if t < t_snap:
        bp = bp0
    else:
        bp = catmull([(t_snap, bp0), (t_fly, (2.0, 8.0)), (T(fr, 52), (10.0, 8.0)), (T(fr, 59), (13.0, 8.0)),
                      (T(fr, 66), (16.0, 8.0))], t)
    # ---- Thragg, revealed coiled 20 m east when the air clears ---------------------
    Jt = thragg(fr, P(T_COIL, neck=6 if t > t_snap else 0), 16.0, 6.0, -1)
    # ---- Gojo: right hand straight overhead, then the two fingers snap forward -----------
    gp = pose_at(t, [(0, G_LOOSE), (T(fr, 5), G_OVER, "out"), (t_snap, G_OVER), (t_snap + T(fr, 3), G_FLING, "snap")])
    if t_lock <= t < t_snap:
        gp = P(gp, neck=-10)
    Jg = gojo(fr, gp, -4.0, 3.0, 1, halo=1.6, mouth="flat")
    # ---- debris pulled by mass, straight lines, never a swirl ---------------------------
    rng = fr.srng("pull407")
    ball_r = 2.0 * seg(t, t_blue + T(fr, 8), T(fr, 34), "out")
    if t >= t_blue:
        tb = t - t_blue
        # glass (0.6), facade chunks (1.5), lamp post (3), car door (4)
        groups = [(0.6, 18, (170, 200, 220), (0.06, 0.16), ((-20, 20), (2, 18))),
                  (1.5, 12, (96, 92, 92), (0.25, 0.6), ((8, 16), (1, 12))),
                  ]
        for mass, n, col, sz, ((xa, xb), (ya, yb)) in groups:
            for i in range(n):
                p0 = (rng.uniform(xa, xb), rng.uniform(ya, yb))
                x, y, u = fx.pull(p0, bp0, tb, t_start=(t_heavy - t_blue) * (mass / 1.5) * 0.6, mass=mass,
                                  strength=0.9)
                if u >= 0.98 or t >= t_snap:
                    continue
                s = rng.uniform(*sz)
                fr.poly([(x - s, y), (x, y + s * 0.8), (x + s, y - s * 0.3)], shade(col, rng.uniform(0.7, 1.2)))
                if u > 0.05:
                    fr.line([(x, y), (x - (bp0[0] - x) * 0.08, y - (bp0[1] - y) * 0.08)], shade(col, 0.7), width_px=2)
        # lamp post: bends toward the point, then flies in
        lp = (-13.0, 0.2)
        x, y, u = fx.pull(lp, bp0, tb, t_start=(t_heavy - t_blue) - 0.12 * 3.0 + 0.1, mass=3.0, strength=0.9)
        if u < 0.98 and t < t_snap:
            bend = clamp(tb * 1.5)
            fr.line([(x, y), (x + 2.0, y + 1.2 * bend + 0.1), (x + 3.6, y + 2.6 * bend + 0.2)], (74, 76, 84), width_m=0.18)
        # car door wrenched off a wreck
        cd = (9.0, 0.9)
        x, y, u = fx.pull(cd, bp0, tb, t_start=(t_heavy - t_blue) - 0.12 * 4.0 + 0.2, mass=4.0, strength=0.9)
        if u < 0.98 and t < t_snap:
            a = tb * 2.0
            fr.poly([(x + math.cos(a) * 0.6, y + math.sin(a) * 0.6), (x + math.cos(a + 1.3) * 0.5, y + math.sin(a + 1.3) * 0.5),
                     (x + math.cos(a + 3.1) * 0.6, y + math.sin(a + 3.1) * 0.6), (x + math.cos(a + 4.5) * 0.5, y + math.sin(a + 4.5) * 0.5)],
                    (60, 74, 92))
    # ---- the murk and its radial clearing wipe outward from the point -------------------
    R = 0.0
    if t >= t_blue:
        R = 1.6 * EASE["in"](clamp((t - t_blue) / max(1e-6, (T(fr, 26) - t_blue))))
    k_murk = 0.88 if R < 1.5 else 0.88 * (1 - seg(t, T(fr, 24), T(fr, 30)))
    if k_murk > 0.01:
        cu, cv = w2s(fr, *bp0)
        murk(fr, k_murk, t, clear=(cu, cv, R) if R > 0 else None, salt="m407")
        if t < t_blue + T(fr, 2):
            gojo(fr, gp, -4.0, 3.0, 1, halo=1.6, mouth="flat") if False else None
    # dust streaming in along straight lines (first, lightest)
    if t_blue <= t < T(fr, 26):
        tb = t - t_blue
        img, dr = fr.layer()
        rr = fr.srng("dust407")
        for i in range(90):
            a = rr.uniform(0, math.tau)
            dist = rr.uniform(3, 30)
            ph = (rr.random() + tb * 1.6) % 1.0
            dd = dist * (1 - ph) ** 1.5 + ball_r
            x0, y0 = bp0[0] + math.cos(a) * dd, bp0[1] + math.sin(a) * dd
            x1, y1 = bp0[0] + math.cos(a) * (dd + 1.0 + 2.5 * ph), bp0[1] + math.sin(a) * (dd + 1.0 + 2.5 * ph)
            dr.line([fr.P(x0, y0), fr.P(x1, y1)], fill=(176, 156, 136, 150), width=max(1, int(3 * fr.ss)))
        fr.merge(img)
    # ---- the ball: dense churning rubble, 4 m across, grinding on itself ------------------
    if t >= t_blue:
        if ball_r > 0.1:
            rb = fr.srng("ball")
            for i in range(70):
                a = rb.uniform(0, math.tau) + t * rb.uniform(1.0, 3.0) * (1 if i % 2 else -1)
                rr = ball_r * math.sqrt(rb.random())
                x, y = bp[0] + math.cos(a) * rr, bp[1] + math.sin(a) * rr * 0.95
                s = rb.uniform(0.2, 0.55) * clamp(ball_r / 2.0 + 0.3)
                ang = rb.uniform(0, 6) + t * 4
                col = rb.choice([(96, 92, 92), (70, 66, 70), (120, 112, 100), (60, 74, 92), (150, 170, 190)])
                fr.poly([(x + math.cos(ang + k * 2.1) * s, y + math.sin(ang + k * 2.1) * s) for k in range(3)],
                        shade(col, rb.uniform(0.7, 1.1)))
        fx.blue(fr, bp[0], bp[1], t - t_blue, r=0.5 * (0.7 if ball_r > 1 else 1.0), streaks=50, salt="b407")
        if t >= t_snap:
            tail = [catmull([(t_snap, bp0), (t_fly, (2.0, 8.0)), (T(fr, 52), (10.0, 8.0)), (T(fr, 59), (13.0, 8.0)),
                             (T(fr, 66), (16.0, 8.0))], max(t_snap, t - k * 0.04)) for k in range(8, -1, -1)]
            fx.trail(fr, tail, width_m=3.6, alpha=70)
            fx.debris(fr, bp[0] - 1.5, bp[1], (t - t_snap) % 0.4, n=8, speed=3, spread=1.5, angle=math.pi,
                      size=(0.05, 0.15), salt=f"shed{int((t - t_snap) / 0.4)}", g=9.8)


# =============================================================================
# S4-08  MS profile: Thragg punches straight through it - hit and run
# =============================================================================

def s4_08(fr):
    t = fr.t
    tc = cue(fr, "punch_heavy", 0, 6)
    t_exit = cue(fr, "accel_burst", 0, 14)
    fr.cam = Cam(15.0, 6.5, 150.0, shake=shake2(t, tc, 11.0, 5))
    street_bg(fr)
    cy = 6.2
    T_SET = legs_air(swap_arms(P("t_punch_wind", lean=-4, neck=6)))
    T_HIT = legs_air(swap_arms(P("t_punch", lean=30, neck=-4)))
    T_THRU = legs_air(swap_arms(P("t_punch", lean=40, neck=-10, ua_n=-20, fa_n=40)))
    T_PEEL = P("fly_up", lean=-30, neck=-20)
    # ---- the ball arrives from screen-left ---------------------------------------------
    if t < tc:
        bxc = lerp(8.2, 12.6, seg(t, 0, tc, "linear"))
        rb = fr.srng("ball")
        for i in range(90):
            a = rb.uniform(0, math.tau) + t * rb.uniform(1.0, 3.0) * (1 if i % 2 else -1)
            rr = 2.0 * math.sqrt(rb.random())
            x, y = bxc + math.cos(a) * rr, cy + math.sin(a) * rr * 0.95
            s = rb.uniform(0.2, 0.5)
            ang = rb.uniform(0, 6) + t * 4
            col = rb.choice([(96, 92, 92), (70, 66, 70), (120, 112, 100), (60, 74, 92), (150, 170, 190)])
            fr.poly([(x + math.cos(ang + k * 2.1) * s, y + math.sin(ang + k * 2.1) * s) for k in range(3)],
                    shade(col, rb.uniform(0.7, 1.1)))
        fx.speed_lines(fr, 0.6, direction=(1, 0), salt="s408")
    # ---- Thragg ---------------------------------------------------------------------
    if t < tc:
        pose = pose_at(t, [(0, P(T_SET, lean=4)), (tc - T(fr, 1), T_SET), (tc, T_HIT, "snap")])
        x, y = 16.0, 5.6
    elif t < t_exit:
        k = seg(t, tc, t_exit, "out")
        pose = pose_at(k, [(0, T_HIT), (0.5, T_THRU), (1, P(T_THRU, lean=20))])
        x, y = lerp(16.0, 14.0, k), lerp(5.6, 6.6, k)
    else:
        k = seg(t, t_exit, fr.dur + T(fr, 2), "in")
        pose = pose_at(k, [(0, P(T_THRU, lean=20)), (0.3, T_PEEL)])
        x, y = lerp(14.0, 22.0, k), lerp(6.6, 20.0, k)
    fac = -1 if t < t_exit + T(fr, 2) else 1
    J = thragg(fr, pose, x, y, fac)
    if t >= tc:
        tt = t - tc
        kx, ky = tip_pos(J, "n", THRAGG) if t < t_exit else (14.4, cy)
        if tt < T(fr, 2):
            fr.invert = 1.0 if tt < 1.5 / FPS else 0.0
        fx.impact(fr, 14.4, cy, tt, kind="heavy", dirx=-1, salt="i408")
        # the compacted rubble bursts into a cone of shrapnel spraying back west (at Gojo)
        fx.debris(fr, 14.2, cy, tt, n=50, speed=24, spread=1.3, angle=math.pi + 0.05, size=(0.12, 0.5), salt="cone",
                  g=4.0, drag=0.2)
        fx.glass_shatter(fr, 13.6, cy - 1.0, 14.4, cy + 1.0, tt, n=26, outward=-2.5, salt="g408")
        # the car door tumbling west
        dx, dy = 14.0 - 14 * tt, cy + 0.5 + 2 * tt - 2 * tt * tt
        a = tt * 9
        fr.poly([(dx + math.cos(a) * 0.7, dy + math.sin(a) * 0.5), (dx + math.cos(a + 1.4) * 0.6, dy + math.sin(a + 1.4) * 0.6),
                 (dx + math.cos(a + 3.1) * 0.7, dy + math.sin(a + 3.1) * 0.5), (dx + math.cos(a + 4.6) * 0.6, dy + math.sin(a + 4.6) * 0.6)],
                (60, 74, 92))
        # the near half of the ball still breaking around his fist and shoulder
        if tt < T(fr, 6):
            rb = fr.srng("shell")
            for i in range(30):
                a = rb.uniform(math.pi * 0.4, math.pi * 1.6)
                rr = 1.2 + tt * rb.uniform(6, 14)
                x0, y0 = 14.0 + math.cos(a) * rr, cy + math.sin(a) * rr
                s = rb.uniform(0.15, 0.4)
                fr.poly([(x0 - s, y0), (x0, y0 + s), (x0 + s, y0 - s * 0.3)], shade((96, 92, 92), rb.uniform(0.7, 1.1)))
        # grit sheeting off his shoulders as he flies through
        if T(fr, 2) <= tt < T(fr, 12):
            sx, sy = J["sh_n"]
            rng = fr.srng("sheet")
            for i in range(20):
                ph = (rng.random() + tt * 3) % 1.0
                fr.line([(sx + ph * 1.2, sy + rng.uniform(-0.3, 0.3)), (sx + ph * 1.2 + 0.25, sy + rng.uniform(-0.3, 0.3))],
                        (170, 160, 140), width_px=2)
    if t_exit <= t < t_exit + T(fr, 3):
        fx.speed_lines(fr, 0.9, direction=(0.5, -1.0), salt="s408b")


# =============================================================================
# S4-09  MWS craning up: the haymaker hits the roof beside him, the blast parts
# =============================================================================

def s4_09(fr):
    t = fr.t
    t_drop = cue(fr, "debris_rain", 0, 4)
    t_rise = T(fr, 4)
    t_land = cue(fr, "footstep", 0, 17)
    t_plant = T(fr, 18)
    t_fall = T(fr, 28)
    tc = cue(fr, "impact_massive", 0, 30)
    t_meet = cue(fr, "infinity_stop", 0, 33)
    u = seg(t, t_rise, t_land, "inout")
    fr.cam = Cam(lerp(-4.0, 28.0, u), lerp(4.2, 57.0, u), math.exp(lerp(math.log(90), math.log(34), u)),
                 shake=shake2(t, tc, 15.0, 6))
    dmg_crater = seg(t, tc, tc + T(fr, 3), "out")
    street_bg(fr)
    env.unfinished_tower(fr, lit=1.0)
    office_block(fr, crater=dmg_crater)
    # ---- Gojo --------------------------------------------------------------------------
    gx = lerp(-4.0, 24.0, u)
    gs = lerp(3.0, OFFICE["roof"] + 1.0, u)
    gp = G_LOOSE if (t < t_rise or t >= t_land) else pose_at(u, [(0, G_RISE), (0.85, G_RISE), (1.0, G_LOOSE)])
    Jg = gojo(fr, gp, gx, gs, 1, halo=1.2 if u > 0.5 else 0.6, mouth="flat")
    # shrapnel shell hanging short of his chest and face, then simply dropping (f4)
    rng = fr.srng("shell409")
    pts = []
    for i in range(30):
        a = rng.uniform(-1.2, 1.2)
        rr = rng.uniform(0.75, 1.05)
        p = (-4.0 + 0.12 + math.cos(a) * rr * 0.5 + 0.3, 3.0 + 1.25 + math.sin(a) * rr)
        if t >= t_drop:
            tt = t - t_drop
            p = (p[0] + 0.3 * tt, p[1] - 0.5 * 9.8 * tt * tt)
        if p[1] > 0.0:
            pts.append(p)
    shards(fr, pts, t, "sh409", size=0.07, col=(100, 96, 96), jit=0.004 if t < t_drop else 0.0)
    if t < t_drop:
        fx.infinity(fr, -3.75, 4.3, r=0.9, strength=0.5, t=t)
    # ---- Thragg: plant on the air, longest anticipation of the sequence, the drop -----
    T_PLANT = legs_air(swap_arms(P("t_punch_wind", lean=-6, neck=10)))
    T_COCK = legs_air(swap_arms(P("t_punch_wind", lean=-22, neck=14, ua_n=-130, fa_n=-80, ua_f=60, fa_f=110)))
    T_DROPP = swap_arms(P("dive", lean=150, neck=-10, ua_n=190, fa_n=190, ua_f=120, fa_f=140))
    T_HIT = swap_arms(P("dive", lean=120, neck=-6, ua_n=150, fa_n=150, ua_f=100, fa_f=120, th_n=-110, sh_n=-130,
                        th_f=-120, sh_f=-150))
    if t >= t_plant - T(fr, 2):
        if t < t_plant:
            k = seg(t, t_plant - T(fr, 2), t_plant, "out")
            x, y = lerp(48.0, 34.0, k), lerp(80.0, 70.0, k)
            pose = P("t_fly_punch", lean=50)
        elif t < t_fall:
            k = seg(t, t_plant, t_fall, "inout")
            x, y = 34.0, 70.0
            pose = pose_at(k, [(0, T_PLANT), (0.3, T_COCK), (1, P(T_COCK, lean=-28, ua_n=-140))])
        elif t < tc:
            k = seg(t, t_fall, tc, "in")
            x, y = lerp(34.0, 32.6, k), lerp(70.0, 50.3, k)
            pose = pose_at(k, [(0, T_DROPP), (1, T_HIT)])
        else:
            x, y = 32.6, 50.0
            pose = T_HIT
        cw = {"cape_wind": (0.4, 1.0)} if t >= t_fall else {}
        J = thragg(fr, pose, x, y, -1, **cw)
        if t_fall <= t < tc + T(fr, 1):
            fx.trail(fr, [(x + 0.1 * k, y + 3.0 * k) for k in range(6, -1, -1)], width_m=1.4, alpha=110)
    # ---- the roof strike: crater, cracks to the parapet, the pressure dome --------------
    if t >= tc:
        tt = t - tc
        fx.impact(fr, CRATER_ROOF_X, OFFICE["roof"] + 1.0, tt, kind="massive", salt="m409")
        fr.flash = 0.6 * pulse(t, tc, 0.01, 0.12)
        if tt < 1.5 / FPS:
            fr.invert = 0.85
        r = kf(tt, [(0, 0.0), (t_meet - tc, 8.0), (fr.dur - tc, 40.0)], "out")
        a = 1 - clamp(tt / (fr.dur - tc + 0.1))
        fr.ellipse(CRATER_ROOF_X, OFFICE["roof"] + 1.0, r, r * 0.75, outline=shade((230, 230, 240), a), width=4)
        px, py = fr.P(CRATER_ROOF_X, OFFICE["roof"] + 1.0)
        fr.post.append(("ring", px / fr.ss, py / fr.ss, fr.S(r) / fr.ss, 0.8 * a, tt))
        fx.dust_cloud(fr, CRATER_ROOF_X, OFFICE["roof"] + 1.0, tt, r=12.0, n=24, salt="d409", alpha=130)
        # debris riding the dome front; around Gojo it bends like water round a stone
        rng = fr.srng("dome")
        gcx, gcy = Jg["chest"]
        hold = clamp((t - t_meet) / 0.3)
        for i in range(70):
            a0 = rng.uniform(0.05, math.pi * 0.95)
            rr = r * rng.uniform(0.93, 1.03)
            x, y = CRATER_ROOF_X + math.cos(a0) * rr, OFFICE["roof"] + 1.0 + math.sin(a0) * rr * 0.75
            dxg, dyg = x - gcx, y - gcy
            dist = math.hypot(dxg, dyg)
            if dist < 1.3 and x > gcx - 1.3:
                # parting: pushed out to the boundary a hand's breadth off him, streaming round
                ang = math.atan2(dyg, dxg)
                side = 1 if dyg >= 0 else -1
                ang = ang + side * hold * 1.4
                x, y = gcx + math.cos(ang) * 0.95, gcy + math.sin(ang) * 1.15
            s = rng.uniform(0.06, 0.2)
            fr.poly([(x - s, y), (x, y + s), (x + s, y - s * 0.4)], shade((110, 106, 104), rng.uniform(0.7, 1.2)))
        if t >= t_meet - T(fr, 1):
            fx.infinity(fr, gcx, gcy, r=1.3, strength=0.7, t=t)


# =============================================================================
# S4-10  EWS from 450 m: one ring, one column, one tear
# =============================================================================

def s4_10(fr):
    t = fr.t
    tc = 0.0
    t_tear = cue(fr, "thunder_distant", 0, 30)
    t_light = T(fr, 42)
    cy = kf(t, [(0, 150.0), (fr.dur, 200.0)], "inout")
    fr.cam = Cam(20.0, cy, 3.5, shake=shake2(t, tc, 5.0, 4))
    extra = ("clouds_torn",) if t >= t_light else ()
    st = C.state(SEQ, *extra)
    tg = C.tg(fr)
    env.sky(fr, 1.0)
    env.clouds(fr, tg)
    env.river(fr)
    env.skyline(fr, st, layers=(0, 1, 2, 3))
    R = kf(t, [(0, 0.0), (T(fr, 6), 60.0), (T(fr, 18), 200.0), (T(fr, 30), 400.0)], "linear")
    if t > T(fr, 30):
        R = 400.0 + 120 * (t - T(fr, 30))
    ring_a = 1 - seg(t, T(fr, 26), T(fr, 40))
    # blown windows: glitter as the ring passes each block, then dark
    for li in (2, 3):
        depth = env._LAYERS[li][0]
        for b in env._buildings(li):
            xe = fr.cam.x + ((b["x0"] + b["x1"]) / 2 - fr.cam.x) / depth
            dist = abs(xe - 32.0)
            if dist > 420 or dist > R:
                continue
            tp = dist / max(1.0, R) * t
            age = t - (T(fr, 30) * dist / 400.0)
            rng = random.Random(f"w410{b['seed']}")
            for k in range(6):
                wx = rng.uniform(b["x0"] + 1, b["x1"] - 1)
                wy = rng.uniform(4, b["h"] * 0.8)
                if 0 <= age < 0.5:
                    fr.glow_circle(wx, wy, 2.5, shade((200, 225, 255), 1 - age / 0.5), d=depth)
                fr.rect(wx - 1.2, wy - 1.2, wx + 1.2, wy + 1.2, (12, 12, 18), d=depth)
    unf_blow = clamp((t - T(fr, 6)) / (T(fr, 24) - T(fr, 6)))
    env.unfinished_tower(fr)
    # the tower's lower curtain wall pops floor by floor as the ring passes
    for k in range(int(28 * unf_blow)):
        y = 4.2 * (k + 1)
        if k % 3 != 1:
            fr.rect(80, y, 110, y + 3.85, (16, 16, 22))
            if (unf_blow * 28 - k) < 2:
                fr.glow_circle(95, y + 2, 9, (120, 150, 190))
    district(fr)
    office_block(fr, crater=1.0)
    smoke = clamp(t / 1.0)
    # ---- the ring of compressed air rolling over the roofs --------------------------
    if ring_a > 0 and R > 1:
        fr.ellipse(32.0, 48.0, R, R * 0.22, outline=shade((235, 235, 245), ring_a), width=3)
        fr.ellipse(32.0, 48.0, R * 0.96, R * 0.2, outline=shade((180, 180, 200), ring_a * 0.6), width=6)
        px, py = fr.P(32.0, 48.0)
        fr.post.append(("ring", px / fr.ss, py / fr.ss, fr.S(R) / fr.ss, 0.7 * ring_a, t))
        # water tanks and antennas torn off at the front
        rng = fr.srng("tanks")
        for i in range(24):
            tx = rng.uniform(-260, 300)
            if abs(tx - 32) < R - 3 and abs(tx - 32) > 10:
                ta = t - T(fr, 30) * abs(tx - 32) / 400.0
                if 0 < ta < 1.2:
                    p = fx.ballistic((tx, 50 + rng.uniform(0, 20)), (math.copysign(18, tx - 32), 12), ta, g=9.8)
                    fr.rect(p[0] - 2, p[1] - 2, p[0] + 2, p[1] + 2.5, (70, 58, 46))
    # ---- the vertical lobe: a column of compressed air punching into the deck -------
    deck_y = 300.0
    col_k = seg(t, T(fr, 12), T(fr, 30), "out")
    if col_k > 0:
        top = 48 + (deck_y + 40 - 48) * col_k
        img, dr = fr.layer()
        for k in range(16):
            yy = 48 + (top - 48) * k / 15
            X, Y = fr.P(32.0 + math.sin(k * 1.3 + t * 3) * 3, yy)
            R2 = fr.S(10 + 6 * k / 15)
            dr.ellipse([X - R2, Y - R2 * 0.6, X + R2, Y + R2 * 0.6], fill=(220, 214, 220, 70))
        fr.merge(img)
        px, py = fr.P(32.0, (48 + top) / 2)
        fr.post.append(("lens", px / fr.ss, py / fr.ss, fr.S((top - 48) / 2) / fr.ss, 0.08, t))
    tear_u = seg(t, t_tear, T(fr, 46), "out")
    deck_band(fr, deck_y, salt="deck410", tear=(50.0, deck_y + 40, 150.0, 34.0, tear_u) if tear_u > 0 else None)
    if t >= t_light:
        env.light_shafts(fr, st, strength=seg(t, t_light, fr.dur))
    # ---- impact flash, and tiny Gojo in his calm pocket ------------------------------
    if t < 0.3:
        fr.glow_circle(32.0, 49.0, 14 * (1 - t / 0.3), (255, 240, 220))
        fr.flash = 0.25 * (1 - t / 0.2) if t < 0.2 else 0.0
    fx.dust_cloud(fr, 32.0, 48.0, t, r=40.0, n=20, salt="d410", alpha=110)
    fr.circle(24.0, 49.5, 5.0, outline=(200, 220, 240), width=1)
    gojo(fr, G_LOOSE, 24.0, OFFICE["roof"] + 1.0, 1, halo=1.5, scale=1.8)
    thragg(fr, P("kneel_fist_down"), 32.0, None, -1, sole=OFFICE["roof"] - 1.0, scale=1.8)


# =============================================================================
# S4-11  MCU: the decision look - and the self-pull over Thragg's head
# =============================================================================

def s4_11(fr):
    t = fr.t
    t_flick = cue(fr, "cloth", 0, 18)
    t_blue = cue(fr, "blue", 0, 20)
    t_go = cue(fr, "whoosh", 0, 21)
    # background plate: roof deck, Thragg climbing out of his crater, the tower beyond
    fr.cam = Cam(24.3, 55.0, 20.0)
    st = C.state(SEQ, "clouds_torn")
    tg = C.tg(fr)

    def plate():
        env.sky(fr)
        env.clouds(fr, tg)
        env.skyline(fr, st, layers=(0, 1, 2, 3))
        env.unfinished_tower(fr, d=4.0, x0=24.3 + 107.5 * 1.0, x1=24.3 + 107.5 + 30.0)
        if t >= t_blue:
            fx.blue(fr, 24.3 + 107.5 + 2.0, 122.0, t - t_blue, r=0.9, streaks=20, salt="b411", d=4.0)
        district(fr)
        office_block(fr, crater=1.0)
        turn = seg(t, t_go + T(fr, 1), t_go + T(fr, 2), "out")
        rise = seg(t, 0, fr.dur, "out")
        pose = P(T_HOVER, neck=8) if turn < 0.5 else P(T_HOVER, neck=-12)
        thragg(fr, pose, 32.0, None, -1 if turn < 0.5 else 1, sole=OFFICE["roof"] + 0.3 + 1.6 * rise)
    soft_draw(fr, plate, radius=3.0)
    env.light_shafts(fr, st, strength=1.0)
    # the parapet edge, foreground
    fr.s_poly([(0, 0.9), (1, 0.86), (1, 1), (0, 1)], (52, 50, 58))
    fr.s_line([(0, 0.9), (1, 0.86)], (90, 86, 92), width=3)
    # ---- Gojo --------------------------------------------------------------------------
    if t < t_go:
        cu = 0.32
        inserts.gojo_face(fr, cu, 0.5, 0.78, expr="focused", eyes="open", injuries=(), t=t)
        # eyes: Thragg (low, near) -> the tower (far, up) -> back to Thragg, held
        look = kf(t, [(0, (0.6, 0.6)), (T(fr, 5), (0.6, 0.6)), (T(fr, 8), (1.0, -0.8)), (T(fr, 12), (1.0, -0.8)),
                      (T(fr, 15), (0.6, 0.6))])
        gojo_gaze(fr, cu, 0.5, 0.78, look[0], look[1])
        if t >= t_flick:
            k = seg(t, t_flick, t_flick + T(fr, 2), "out")
            inserts.gojo_hand_sign(fr, 0.56 + 0.06 * k, 0.86 - 0.14 * k, 0.32, sign="point", rot=70 * k + 10)
    elif t < t_go + T(fr, 1.5):
        # the smear frame: he is gone screen-right, over Thragg's head
        inserts.gojo_face(fr, 0.62, 0.48, 0.78, expr="focused", eyes="open", t=t)
        fr.blur_dir = (160, -14)
    # gravel at his feet tugged after him
    if t >= t_go:
        tt = t - t_go
        rng = fr.srng("grav411")
        for i in range(24):
            u0 = rng.uniform(0.15, 0.45)
            v0 = rng.uniform(0.88, 0.97)
            uu = u0 + tt * rng.uniform(1.0, 2.5)
            fr.s_line([(uu, v0), (uu - 0.03, v0 + 0.004)], (150, 140, 130), width=2)


# =============================================================================
# S4-12  EWS lateral track: the pull into the tower, and Thragg through its flank
# =============================================================================

COLS = [80.0, 87.5, 95.0, 102.5, 110.0]
F29 = 121.8


def tower_front(fr, front_x, t_front, lit=1.0, entry_torn=0.0):
    """Floors 28-30 of the unfinished tower's south face: glass bays, the
    scaffold/tarp bay of Gojo's entry, and Thragg's destruction front."""
    rng = random.Random("tf")
    for fl in (28, 29, 30):
        y = fl * 4.2
        for i in range(4):
            x0, x1 = COLS[i] + 0.5, COLS[i + 1] - 0.5
            if fl == 29 and i == 0:
                # unglazed bay hung with tarps and scaffold (Gojo's entry)
                for k in range(5):
                    xx = x0 + k * (x1 - x0) / 4
                    fr.line([(xx, y), (xx, y + 3.85)], shade((150, 120, 60), lit), width_m=0.08)
                fr.line([(x0, y + 1.9), (x1, y + 1.9)], shade((150, 120, 60), lit), width_m=0.08)
                if entry_torn < 1:
                    fr.poly([(x0, y + 3.8), (x1, y + 3.8), (x1 - 1.0 * entry_torn, y + 0.4), (x0 + 0.5, y + 0.6)],
                            shade((60, 80, 110), lit * 0.9))
                else:
                    for k in range(4):
                        xx = x0 + rng.uniform(0, x1 - x0)
                        fr.poly([(xx, y + 3.8), (xx + 0.5, y + 3.8), (xx + 0.2, y + rng.uniform(1.5, 3.0))],
                                shade((60, 80, 110), lit * 0.8))
                continue
            burst = fl == 29 and front_x > x0 - 0.5
            if burst:
                fr.rect(x0, y, x1, y + 3.85, shade((12, 12, 18), lit))
            else:
                fr.rect(x0, y + 0.1, x1, y + 3.8, shade((60, 80, 100), lit))
                for j in range(1, 4):
                    xx = x0 + j * (x1 - x0) / 4
                    fr.line([(xx, y), (xx, y + 3.85)], shade((90, 110, 130), lit), width_m=0.1)
    # buckled columns behind the front (they fold outward, toward camera)
    for cx in COLS[:3]:
        if front_x > cx + 0.5:
            fr.line([(cx, F29), (cx + 0.9, F29 + 1.9), (cx, F29 + 3.85)], shade((70, 70, 76), lit), width_m=1.0)


def s4_12(fr):
    t = fr.t
    t_arrive = T(fr, 10)
    t_launch = cue(fr, "accel_burst", 0, 4)
    t_boom = cue(fr, "sonic_boom", 0, 6)
    t_hit = cue(fr, "glass_shatter", 0, 14)
    t_col = cue(fr, "metal_snap", 1, 26)
    t_push = T(fr, 60)
    # Thragg's destruction front along floor 29
    if t < t_hit:
        tfx = None
    else:
        tfx = kf(t, [(t_hit, 80.0), (t_col, 87.5, "out"), (fr.dur, 93.0, "out")])
    # camera: track Gojo's pull, then the destruction front at frame centre, then push in
    if t < T(fr, 16):
        k = seg(t, 0, T(fr, 16), "inout")
        cam_x, cam_y, zoom = lerp(40.0, 82.0, k), lerp(90.0, 118.0, k), zkf(t, [(0, 9.0), (T(fr, 16), 22.0)])
    else:
        fx_ = tfx if tfx is not None else 80.0
        cam_x = lerp(82.0, fx_, seg(t, T(fr, 16), T(fr, 22)))
        cam_y = lerp(118.0, 122.5, seg(t, T(fr, 16), T(fr, 30)))
        zoom = zkf(t, [(T(fr, 16), 22.0), (T(fr, 40), 30.0), (t_push, 30.0), (fr.dur, 80.0)])
    fr.cam = Cam(cam_x, cam_y, zoom)
    C.stage(fr, SEQ, "sky", extra=("clouds_torn",))
    district(fr)
    office_block(fr, crater=1.0)
    entry_torn = seg(t, t_arrive - T(fr, 1), t_arrive + T(fr, 1))
    tower_front(fr, tfx if tfx is not None else 0.0, t, entry_torn=entry_torn)
    # ---- Gojo: dead-straight line to the waiting point, through the tarps --------------
    g0, g1 = (34.0, 61.0), (80.5, F29 + 1.0)
    if t < t_arrive:
        k = seg(t, 0, t_arrive, "in")
        gx, gy = lerp(g0[0], g1[0], k), lerp(g0[1], g1[1], k)
        fx.blue(fr, 81.0, F29 + 1.8, t + 0.5, r=0.3, streaks=24, salt="b412")
        ang = math.degrees(math.atan2(g1[0] - g0[0], g1[1] - g0[1]))
        gojo(fr, P(G_DASH, lean=ang * 0.7), gx, None, 1, y=gy, halo=1.5, mouth="flat")
        tail = [(lerp(g0[0], g1[0], seg(max(0, t - kk * 0.03), 0, t_arrive, "in")),
                 lerp(g0[1], g1[1], seg(max(0, t - kk * 0.03), 0, t_arrive, "in"))) for kk in range(8, -1, -1)]
        fx.trail(fr, tail, width_m=1.6, alpha=90)
    # ---- Thragg: launch, then through the flank and down the floor --------------------
    t0 = (32.0, 52.0)
    if t >= t_launch - T(fr, 1):
        if t < t_launch:
            thragg(fr, T_SQUASH, t0[0], None, -1, sole=48.0)
        elif t < t_hit:
            k = seg(t, t_launch, t_hit, "in")
            x, y = lerp(t0[0], 79.0, k), lerp(t0[1], F29 + 1.0, k)
            ang = math.degrees(math.atan2(79.0 - t0[0], F29 + 1.0 - t0[1]))
            thragg(fr, P("t_fly_punch", lean=ang), x, y, 1, halo=1.0)
            tail = [(lerp(t0[0], 79.0, seg(max(t_launch, t - kk * 0.03), t_launch, t_hit, "in")),
                     lerp(t0[1], F29 + 1.0, seg(max(t_launch, t - kk * 0.03), t_launch, t_hit, "in"))) for kk in range(8, -1, -1)]
            fx.trail(fr, tail, width_m=2.0, alpha=100)
            if t >= t_boom:
                fx.sonic_boom(fr, lerp(t0[0], 79.0, seg(t_boom, t_launch, t_hit, "in")),
                              lerp(t0[1], F29 + 1.0, seg(t_boom, t_launch, t_hit, "in")), t - t_boom, 1, 1.4, size=5)
        else:
            pose = P("t_fly_punch", lean=70, neck=-20, ua_n=60, fa_n=10)       # shoulder first, ploughing
            thragg(fr, pose, tfx - 1.0, F29 + 0.9, 1, halo=1.0)
            tt = t - t_hit
            # concrete spits, whipping rebar, glass bursting outward along the floor
            fx.debris(fr, tfx, F29 + 2.0, tt % 0.35, n=16, speed=9, spread=1.6, angle=math.pi * 0.55,
                      size=(0.1, 0.45), salt=f"pl{int(tt / 0.35)}", g=9.8)
            fx.glass_shatter(fr, tfx - 1.0, F29 + 0.3, tfx + 1.5, F29 + 3.6, tt % 0.3, n=20, outward=0.6,
                             salt=f"gl{int(tt / 0.3)}")
            fx.dust_cloud(fr, tfx - 2.0, F29 + 1.0, tt, r=4.0, n=14, salt="pdust", alpha=90, ground=False)
            if t >= t_col:
                fx.debris(fr, 87.5, F29 + 2.0, t - t_col, n=20, speed=12, spread=1.2, angle=math.pi * 0.5,
                          size=(0.2, 0.6), salt="col", g=9.8)
            if t < t_hit + 0.4:
                fx.impact(fr, 80.0, F29 + 2.0, tt, kind="heavy", salt="i412")
                fx.glass_shatter(fr, 79.0, F29 - 4.0, 81.0, F29 + 8.0, tt, n=40, outward=-1.0, salt="flank")
    # ---- the push in through the burst bay -------------------------------------------
    if t >= t_push:
        k = seg(t, t_push, fr.dur, "in")
        if k > 0.55:
            a = clamp((k - 0.55) / 0.3)
            img, dr = fr.layer()
            dr.rectangle([0, 0, fr.W, fr.H], fill=(24, 24, 34, int(255 * a)))
            fr.merge(img)


# =============================================================================
# S4-13  WS inside floor 29: Infinity OFF - the chips simply fall
# =============================================================================

def interior(fr, lit=1.0, broken=0.6):
    """Floor 29 inside the tower, with the open east bays (sky) and light shafts."""
    env.tower_interior(fr, F29, lit=lit, broken=broken)
    # the open east bays behind Gojo: evening sky through the slabs
    for k in (-1, 0, 1):
        y = F29 + k * 4.2
        fr.rect(103.0, y + 0.05, 116.0, y + 3.8, shade((170, 110, 84), lit), d=1.25)
        fr.rect(103.0, y + 2.6, 116.0, y + 3.8, shade((120, 84, 80), lit), d=1.25)
        for cx in (102.5, 110.0):
            fr.rect(cx - 0.4, y, cx + 0.4, y + 3.85, shade((60, 58, 62), lit), d=1.2)
    img, dr = fr.layer()
    for k, (x0, w) in enumerate(((104.0, 0.9), (106.5, 1.3), (109.0, 0.8))):
        p = [fr.P(x0, F29 + 4.0), fr.P(x0 + w, F29 + 4.0), fr.P(x0 + w - 4.5, F29), fr.P(x0 - 5.5, F29)]
        dr.polygon(p, fill=(255, 196, 140, 34))
    fr.merge(img)


def s4_13(fr):
    t = fr.t
    t_col = cue(fr, "concrete_break", 0, 2)
    t_stop = cue(fr, "land_heavy", 0, 8)
    t_shed = cue(fr, "debris_rain", 0, 12) - T(fr, 2)
    t_breath = cue(fr, "breath", 0, 18)
    t_off = T(fr, 22)
    t_tap = cue(fr, "cloth", 0, 26)
    fr.cam = Cam(100.0, 123.5, zkf(t, [(0, 70.0), (fr.dur, 110.0)]))
    interior(fr)
    # ceiling cracks over the path of his passage
    ceil = F29 + 4.2 - 0.35
    rng = random.Random("ceilck")
    for k in range(9):
        x0 = rng.uniform(92, 106)
        fr.line([(x0, ceil), (x0 + rng.uniform(-1.5, 1.5), ceil - 0.02)], (30, 30, 36), width_m=0.06)
    # the last column at x = +95 (fighters' plane), torn through f0-2
    if t < t_col:
        fr.rect(94.6, F29, 95.4, ceil, (88, 86, 88))
    else:
        tt = t - t_col
        fr.poly([(94.6, ceil), (95.4, ceil), (95.3, ceil - 1.0), (94.9, ceil - 1.4), (94.6, ceil - 0.8)], (88, 86, 88))
        fr.poly([(94.6, F29), (95.4, F29), (95.4, F29 + 0.9), (95.0, F29 + 0.6), (94.6, F29 + 1.1)], (88, 86, 88))
        fx.debris(fr, 95.0, F29 + 1.8, tt, n=36, speed=8, spread=2.2, angle=0.2, size=(0.06, 0.3), salt="c413",
                  g=9.8, ground=F29)
        fx.dust_cloud(fr, 95.0, F29, tt, r=3.0, n=14, salt="d413", alpha=110)
        if tt < 0.3:
            fx.impact(fr, 95.0, F29 + 1.8, tt, kind="heavy", salt="i413")
    # ---- Thragg: tears through, skids eight metres from Gojo, a held cel -----------------
    T_SKID = P("t_guard", lean=-14, neck=4, ua_n=30, fa_n=100, ua_f=20, fa_f=90, th_n=46, sh_n=30, th_f=-30,
               sh_f=-50)
    T_SQUARE = P("t_stand", lean=6, neck=4, ua_n=16, fa_n=24, ua_f=-6, fa_f=10)
    if t < t_col:
        tx = lerp(91.5, 95.0, seg(t, 0, t_col, "linear"))
        pose = P("t_fly_punch", lean=60, ua_n=60, fa_n=10)
        Jt = thragg(fr, pose, tx, F29 + 0.9, 1)
    else:
        tx = lerp(95.0, 96.0, seg(t, t_col, t_stop, "out"))
        pose = pose_at(t, [(t_col, T_SKID), (t_stop, T_SKID), (t_stop + T(fr, 4), T_SQUARE, "out")])
        eyes_down = seg(t, t_tap - T(fr, 3), t_tap + T(fr, 2)) * (1 - seg(t, T(fr, 36), T(fr, 42)))
        Jt = thragg(fr, P(pose, neck=pose["neck"] + 16 * eyes_down), tx, None, 1, sole=F29)
        # boots carving two grooves
        g = clamp((t - t_col) / max(1e-6, t_stop - t_col))
        fr.line([(95.1, F29 + 0.01), (95.1 + 0.9 * g, F29 + 0.01)], (40, 38, 42), width_m=0.05)
        fr.line([(95.0, F29 - 0.03), (95.0 + 0.8 * g, F29 - 0.03)], (40, 38, 42), width_m=0.05)
    # ---- Gojo: hands loose; one out-breath; Infinity OFF ----------------------------
    breath = pulse(t, t_breath, T(fr, 2), T(fr, 4))
    gp = P(G_LOOSE, lean=2 - 2 * breath, neck=-2 + 3 * breath)
    Jg = gojo(fr, gp, 104.0, F29, -1, mouth="flat")
    # chips shed by the cracked ceiling: slow and hang over his hair and shoulders (ON),
    # then simply fall (OFF); one taps his left sleeve and bounces
    rng = fr.srng("chips")
    head = Jg["head"]
    sh = Jg["sh_n"]
    chips = []
    for i in range(16):
        hx = 104.0 + rng.uniform(-0.3, 0.3)
        hang_y = (head[1] + 0.2 + rng.uniform(0.0, 0.1)) if abs(hx - 104.0) < 0.16 else (sh[1] + 0.12 + rng.uniform(0, 0.08))
        t0 = t_shed + rng.uniform(0, T(fr, 6))
        chips.append((hx, hang_y, t0))
    for i, (hx, hang_y, t0) in enumerate(chips):
        if t < t0:
            continue
        fall_t = t - t0
        y_free = ceil - 0.5 * 9.8 * fall_t * fall_t
        if t < t_off:
            # Infinity: each one slows above him and hangs, jittering
            d0 = ceil - hang_y
            rem = fx.zeno(1.0, fall_t, rate=6.0)
            y = hang_y + d0 * rem
            y = max(y, y_free) if y_free > hang_y else y
            j = 0.004 * math.sin(t * 37 + i)
            shards(fr, [(hx + j, y)], t, f"chip{i}", size=0.025, col=(120, 116, 112))
        else:
            tt = t - t_off
            y = hang_y - 0.5 * 9.8 * tt * tt
            x = hx
            if i == 0:
                # the one that taps the left sleeve (near arm) at f26 and bounces off
                el = Jg["el_n"]
                xs, ys = el[0] + 0.03, el[1] + 0.06
                if t < t_tap:
                    k = seg(t, t_off, t_tap, "in")
                    x, y = lerp(hx, xs, k), lerp(hang_y, ys, k)
                else:
                    tb = t - t_tap
                    x = xs + 0.6 * tb
                    y = ys + 0.9 * tb - 0.5 * 9.8 * tb * tb
                    if y < F29 + 0.02:
                        y = F29 + 0.02
            elif y < F29 + 0.02:
                y = F29 + 0.02
            shards(fr, [(x, y)], t, f"chip{i}", size=0.025, col=(120, 116, 112), jit=0.0)
    if t_shed <= t < t_off:
        fx.infinity(fr, 104.0, head[1], r=0.55, strength=0.3, t=t)
    elif t_off <= t < t_off + T(fr, 2):
        fx.infinity(fr, 104.0, head[1], r=0.55, strength=0.3 * (1 - seg(t, t_off, t_off + T(fr, 2))), t=t)
    motes(fr, t, 96, 112, F29 + 0.5, F29 + 3.6, n=40, salt="m413", vx=-0.4, alpha=90)


# =============================================================================
# S4-14  MS low: he does not let go - the collarbone, and the spear-hand
# =============================================================================

def s4_14(fr):
    t = fr.t
    t_go = cue(fr, "accel_burst", 0, 6)
    t_grip = cue(fr, "grab", 0, 8)
    t_snap = cue(fr, "punch_heavy", 0, 12)
    t_chamber = T(fr, 14)
    t_spear = cue(fr, "whoosh", 0, 26)
    cam_x = kf(t, [(t_go, 99.8), (t_go + T(fr, 2), 103.4, "inout")])
    fr.cam = Cam(cam_x, 123.0, 190.0, shake=shake2(t, t_snap, 9.0, 4))
    if t_go <= t < t_go + T(fr, 2):
        fr.blur_dir = (60, 0)
    interior(fr)
    # ---- Gojo (Infinity off) ---------------------------------------------------------
    drop = seg(t, t_snap, t_snap + T(fr, 2), "snap")
    gp = P(G_LOOSE, lean=2 + 8 * drop, neck=-2 + 10 * drop, th_n=8 + 10 * drop, sh_n=4 - 8 * drop,
           ua_n=6 - 4 * drop, fa_n=2 - 6 * drop)
    Jg0 = solve(GOJO, gp, 104.0, None, -1, 1.0, "side", F29 - 0.04 * drop)
    shoulder = (Jg0["sh_n"][0] - 0.01, Jg0["sh_n"][1] + 0.05 - 0.05 * drop)
    heart = chest_front(Jg0)
    # ---- Thragg ------------------------------------------------------------------------
    T_COILX = P("t_guard", lean=24, neck=0, ua_n=40, fa_n=100, ua_f=10, fa_f=80, th_n=70, sh_n=-10, th_f=-20,
                sh_f=-70)
    T_LUNGE = P("t_grab", lean=30, hand_n="claw", hand_f="open", ua_f=-30, fa_f=40)
    T_CHAMBER = P(T_LUNGE, ua_f=-50, fa_f=80, hand_f="point", lean=24)
    if t < t_go:
        sq = seg(t, 0, t_go, "in")
        J = thragg(fr, P(T_COILX, lean=24 + 8 * sq, th_n=70 + 20 * sq), 96.0, None, 1, sole=F29)
    elif t < t_grip:
        k = seg(t, t_go, t_grip, "snap")
        x = lerp(96.0, 103.0, k)
        J = thragg(fr, P("t_fly_punch", lean=60, ua_n=80, fa_n=88, hand_n="claw"), x, F29 + 1.0, 1)
        fx.trail(fr, [(x - 0.8 * kk, F29 + 1.4) for kk in range(6, -1, -1)], width_m=1.0, alpha=100)
    else:
        if t < t_chamber:
            base = T_LUNGE
        elif t < t_spear:
            base = pose_at(t, [(t_chamber, T_LUNGE), (t_spear - T(fr, 2), T_CHAMBER, "out")])
        else:
            base = T_CHAMBER
        base = P(base, lean=base["lean"] + 4 * drop)
        pose = reach(THRAGG, base, 103.0, None, 1, "n", (shoulder[0] + 0.05, shoulder[1] - 0.04), ground=F29,
                     elbow="down")
        if t >= t_spear:
            g = lerp(0.6, 0.15, seg(t, t_spear, fr.dur, "snap"))
            pose = reach(THRAGG, P(pose, hand_f="point"), 103.0, None, 1, "f", (heart[0] - g, heart[1]), ground=F29)
        J = None
    Jg = gojo(fr, gp, 104.0, F29 - 0.04 * drop, -1, switch=t_snap, mouth="flat")
    if t >= t_snap:
        gojo_pain(fr, Jg, 1.0)
        # blood blooms through the dark fabric at the shoulder
        b = seg(t, t_snap, t_snap + T(fr, 8), "out")
        sx, sy = Jg["sh_n"]
        fr.ellipse(sx, sy - 0.03, 0.05 + 0.06 * b, 0.05 + 0.08 * b, fill=(96, 14, 22))
        fr.ellipse(sx + 0.01, sy, 0.03 + 0.03 * b, 0.03 + 0.04 * b, fill=(130, 22, 30))
    if t >= t_grip:
        J = thragg(fr, pose, 103.0, None, 1, sole=F29)
        if t - t_grip < 0.15:
            fx.impact(fr, shoulder[0], shoulder[1], t - t_grip, kind="light", salt="grip")
        # fingers sinking into the jacket
        hx, hy = tip_pos(J, "n", THRAGG, "claw")
        fr.line([(hx - 0.04, hy + 0.02), (hx + 0.03, hy - 0.04)], (60, 14, 18), width_m=0.012)


# =============================================================================
# S4-15  CU: Infinity back at high output - the grip pried open, two fingers on the sternum
# =============================================================================

def pried_hand(fr, base, lifts, off=0.0, lit=1.0):
    """Thragg's gloved right hand clamped over Gojo's left shoulder, drawn by
    finger so the swelling space can pry them open one at a time.
    lifts = [index, middle, ring, little, thumb] 0..1."""
    glove = THRAGG.accent
    bx, by = base[0], base[1] + off
    fr.ellipse(bx, by, 0.055, 0.04, fill=shade(glove, 0.95 * lit))
    for i, lift in enumerate(lifts[:4]):
        root = (bx + 0.02 + i * 0.005, by + 0.02 - i * 0.017)
        a = math.radians(-55 + 95 * lift)
        tip = (root[0] + math.cos(a) * 0.075, root[1] + math.sin(a) * 0.075)
        mid = (root[0] + math.cos(a + 0.35 * (1 - lift)) * 0.045, root[1] + math.sin(a + 0.35 * (1 - lift)) * 0.045)
        fr.line([root, mid, tip], shade(glove, (1.1 - i * 0.06) * lit), width_m=0.021)
    lift = lifts[4]
    a = math.radians(-100 + 80 * lift)
    root = (bx - 0.035, by - 0.01)
    fr.line([root, (root[0] + math.cos(a) * 0.06, root[1] + math.sin(a) * 0.06)], shade(glove, 0.8 * lit), width_m=0.024)


def s4_15(fr):
    t = fr.t
    t_up = cue(fr, "infinity_stop", 0, 2)
    t_pry = [T(fr, 8), T(fr, 13), T(fr, 17), T(fr, 20), T(fr, 24)]
    t_free = T(fr, 26)
    t_fing = T(fr, 28)
    t_touch = T(fr, 34)
    t_red = cue(fr, "red_charge", 0, 34)
    u = seg(t, t_fing, fr.dur, "inout")
    fr.cam = Cam(lerp(103.7, 103.45, u), lerp(123.2, 123.3, u), math.exp(lerp(math.log(500), math.log(900), u)))
    interior(fr)
    # ---- Gojo: shoulder low and bloody; Infinity re-raised at high output -----------------
    gp = P(G_LOOSE, lean=8, neck=6, th_n=14, sh_n=-2, ua_n=2, fa_n=-4)
    Jg0 = solve(GOJO, gp, 104.0, None, -1, 1.0, "side", F29 - 0.04)
    heart = chest_front(Jg0)
    shoulder = (Jg0["sh_n"][0] - 0.01, Jg0["sh_n"][1])
    # ---- Thragg: grip arm + spear-hand -------------------------------------------------
    T_CH = P("t_grab", lean=28, hand_n="claw", hand_f="point", ua_f=60, fa_f=90)
    Js0 = solve(THRAGG, T_CH, 103.0, None, 1, 1.0, "side", F29)
    sternum = chest_front(Js0, THRAGG, up=0.02)
    g = stall_gap(t, -2 / FPS, t_up, 0.15, 0.03, crawl=6.0)
    g = 0.15 if t < t_up - 2 / FPS else max(g, 0.03)
    if t < t_up:
        g = lerp(0.15, 0.15 - 0.8 * 0.12, seg(t, t_up - 2 / FPS, t_up))
    spear = (heart[0] - g, heart[1])
    push = 0.03 * seg(t, t_up, t_up + T(fr, 8), "out")
    pose = reach(THRAGG, T_CH, 103.0 + push, None, 1, "f", spear, ground=F29)
    off = 0.04 * seg(t, t_pry[4], t_free, "out")
    grip = (shoulder[0] + 0.02, shoulder[1] + 0.05)
    pose = reach(THRAGG, pose, 103.0 + push, None, 1, "n", (grip[0] - 0.05, grip[1] + off), ground=F29)
    Jt = thragg(fr, pose, 103.0 + push, None, 1, sole=F29)
    # Gojo's right hand rises between Thragg's arms; two fingers on the sternum
    k = seg(t, t_fing, t_touch, "out")
    if k > 0:
        gp2 = reach(GOJO, P(gp, hand_f="sign"), 104.0, None, -1, "f", lerp((Jg0["wr_f"][0], Jg0["wr_f"][1]),
                                                                       (sternum[0] + 0.01, sternum[1]), k),
                    ground=F29 - 0.04)
    else:
        gp2 = gp
    Jg = gojo(fr, gp2, 104.0, F29 - 0.04, -1, mouth="flat")
    gojo_pain(fr, Jg, 0.5)
    sx, sy = Jg["sh_n"]
    fr.ellipse(sx, sy - 0.03, 0.11, 0.13, fill=(96, 14, 22))
    fr.ellipse(sx + 0.01, sy, 0.06, 0.07, fill=(130, 22, 30))
    # the near forearm + the hand drawn over his shoulder, pried open finger by finger
    el = Jt["el_n"]
    lifts = [seg(t, tp - T(fr, 2), tp + T(fr, 1), "out") for tp in t_pry]
    fr.line([el, (grip[0] - 0.06, grip[1] + off)], THRAGG.suit, width_m=THRAGG.w_fa)
    pried_hand(fr, grip, lifts, off)
    # ---- high output: refraction swells (no shell), grit skids outward -------------------
    if t >= t_up - 1 / FPS:
        ts = max(0.0, t - t_up)
        fx.infinity(fr, Jg["chest"][0], Jg["chest"][1], r=0.75, strength=1.0, t=t)
        fx.infinity(fr, sx, sy, r=0.3, strength=0.8, t=t + 1.3)
        if ts < 0.3:
            fx.impact(fr, spear[0], spear[1], ts, kind="blocked", dirx=1)
        rng = fr.srng("skid")
        for i in range(30):
            a = rng.uniform(-math.pi, math.pi)
            rr = 0.3 + ts * rng.uniform(1.5, 3.0)
            px, py = Jg["chest"][0] + math.cos(a) * rr, Jg["chest"][1] + math.sin(a) * rr * 0.6
            fr.line([(px, py), (px + math.cos(a) * 0.04, py + math.sin(a) * 0.024)], (150, 140, 130), width_px=2)
        fx.suspended_dust(fr, spear[0] + 0.005, spear[1] - 0.03, heart[0] - 0.004, spear[1] + 0.03, n=10, t=t,
                          salt="spg", size=0.003)
    # ---- Red: a tight crimson point jittering at the fingertips -------------------------
    if t >= t_red:
        tip = tip_pos(Jg, "f", GOJO, "sign")
        fx.red_charge(fr, tip[0] - 0.01, tip[1], t - t_red, r=0.025)


# =============================================================================
# S4-16  EWS exterior: the point-blank Red guts three floors and fires him west
# =============================================================================

def crane(fr, ang, drop=0.0, lit=1.0, d=1.0):
    """The yellow tower crane (as env.unfinished_tower draws it) rotated by
    ang degrees about its base (negative = toppling east)."""
    px, py = 94.0, 176.0
    a = math.radians(ang)

    def R(x, y):
        dx, dy = x - px, y - py
        return (px + dx * math.cos(a) - dy * math.sin(a), py + dx * math.sin(a) + dy * math.cos(a) - drop)
    yel = shade((180, 140, 40), lit)
    fr.poly([R(92, 176), R(94, 176), R(94, 198), R(92, 198)], yel, d=d)
    fr.line([R(50, 197), R(130, 197)], yel, width_m=1.0, d=d)
    fr.line([R(93, 204), R(50, 197)], shade((150, 120, 40), lit), width_m=0.3, d=d)
    fr.line([R(93, 204), R(130, 197)], shade((150, 120, 40), lit), width_m=0.3, d=d)


def s4_16(fr):
    t = fr.t
    t_blow = T(fr, 2)
    t_crane = cue(fr, "metal_groan", 0, 16) - T(fr, 2)
    t_smoke = T(fr, 20)
    fr.cam = Cam(95.0, 140.0, 7.0, shake=shake2(t, 0.0, 16.0, 8))
    gut = t >= T(fr, 8)
    st = C.state(SEQ, "clouds_torn", *(("smoke",) if t >= t_smoke else ()))
    tg = C.tg(fr)
    env.sky(fr)
    env.clouds(fr, tg)
    env.river(fr)
    env.skyline(fr, st, layers=(0, 1, 2, 3))
    env.smoke_columns(fr, tg, st)
    env.light_shafts(fr, st)
    district(fr)
    env.unfinished_tower(fr, gutted=gut)
    if not gut:
        # the floors failing along the cone's axis
        k = seg(t, t_blow, T(fr, 8))
        fr.rect(80 - 1, 120.0, 80 + 30 * k, 132.6, (14, 14, 20))
    # crane: lurches, mast buckles, the whole crane topples east off the roof
    if t < t_crane:
        crane(fr, 0.0)
    else:
        k = seg(t, t_crane, fr.dur + T(fr, 6), "in")
        crane(fr, -95.0 * k, drop=40 * k * k)
    # ---- the Red cone fires west along floor 29 ---------------------------------------
    ox, oy = 103.5, 123.3
    fx.red_release(fr, ox, oy, -1.0, 0.18, t, length=40.0, width=6.0)
    # three-floor blowout venting WEST along the axis; the east face sheds glass only
    if t >= t_blow:
        tt = t - t_blow
        fx.debris(fr, 80.0, 126.0, tt, n=70, speed=40, spread=0.55, angle=math.pi - 0.15, size=(0.6, 2.2),
                  salt="blow", g=9.8, drag=0.3)
        fx.glass_shatter(fr, 79.0, 120.0, 81.0, 133.0, tt, n=50, outward=-6.0, salt="wglass")
        fx.glass_shatter(fr, 109.0, 120.0, 111.0, 133.0, tt, n=26, outward=1.0, salt="eglass")
        fx.dust_cloud(fr, 74.0, 126.0, tt, r=16.0, n=20, salt="blowd", alpha=120, ground=False)
    if t >= t_smoke:
        img, dr = fr.layer()
        h = 30 * seg(t, t_smoke, fr.dur + 1.0, "out")
        for k in range(10):
            yy = 128 + h * k / 9
            X, Y = fr.P(84 - k * 1.2 + math.sin(k + t) * 2, yy)
            R = fr.S(5 + k * 0.8)
            dr.ellipse([X - R, Y - R, X + R, Y + R], fill=(40, 36, 40, 150))
        fr.merge(img)
    # ---- Thragg on the axis, tumbling up and west, smoke from his chest ---------------
    tk = [(0.0, (103.0, 123.3)), (T(fr, 6), (80.0, 130.0)), (T(fr, 20), (64.0, 142.0)), (T(fr, 39), (60.0, 146.0)),
          (T(fr, 45), (59.0, 147.0))]
    x, y = catmull(tk, t)
    tail = [catmull(tk, max(0.0, t - k * 0.05)) for k in range(10, -1, -1)]
    smoke_trail(fr, tail, t, salt="ts416", width=1.2)
    thragg(fr, rot_pose(P("tumble"), -260 * t), x, y, -1, scale=2.0, halo=1.5, switch=T(fr, 1))
    # ---- Gojo: his own push-off throws him out of the east face, tumbling end over end --
    gk = [(0.0, (104.0, 122.8)), (T(fr, 2), (108.0, 123.5)), (T(fr, 6), (111.0, 126.0)), (T(fr, 20), (118.0, 138.0)),
          (T(fr, 39), (122.0, 144.0)), (T(fr, 45), (122.6, 144.5))]
    gx, gy = catmull(gk, t)
    gojo(fr, rot_pose(G_TUMBLE, 300 * t), gx, None, 1, y=gy, scale=2.0, halo=2.0, mouth="flat")
    # the falling debris around him parts and streams past; nothing touches him
    rng = fr.srng("part416")
    for i in range(10):
        a = rng.uniform(0, math.tau) + t * 2
        rr = 3.2 + 0.4 * math.sin(t * 5 + i)
        px, py = gx + math.cos(a) * rr, gy + math.sin(a) * rr - (t * 6 % 4)
        fr.poly([(px - 0.6, py), (px, py + 0.6), (px + 0.6, py - 0.2)], (100, 96, 96))


# =============================================================================
# S4-17  OTS past Thragg: he stabilises first and watches RCT knit the bone
# =============================================================================

def s4_17(fr):
    t = fr.t
    t_plant = cue(fr, "accel_burst", 0, 10)
    t_right = T(fr, 26)
    t_heal = cue(fr, "rct_heal", 0, 30)
    t_healed = T(fr, 48)
    t_roll = cue(fr, "cloth", 0, 50) - T(fr, 2)
    zoom = zkf(t, [(t_right, 40.0), (t_right + T(fr, 26), 90.0)])
    gpos = catmull([(0.0, (122.0, 144.0)), (t_right, (121.2, 146.5)), (T(fr, 34), (120.0, 150.0)),
                    (fr.dur, (120.0, 150.0))], t)
    fr.cam = Cam(lerp(116.0, 118.6, seg(t, t_right, t_right + T(fr, 26))), lerp(147.5, 150.9, seg(t, 0, T(fr, 34))),
                 zoom)
    C.stage(fr, SEQ, "sky", extra=("tower_gutted", "clouds_torn", "smoke"))
    # ---- Gojo, middle distance --------------------------------------------------------
    if t < t_right:
        pose = rot_pose(G_TUMBLE, -280 * t)
        Jg = gojo(fr, pose, gpos[0], None, -1, y=gpos[1] + 0.9, halo=1.4, mouth="flat")
    else:
        base = P(G_LOOSE, lean=4, neck=4)
        shoulder_low = 1 - seg(t, t_heal, t_healed, "inout")
        if t >= t_heal - T(fr, 2):
            Jb = solve(GOJO, base, gpos[0], None, -1, 1.0, "side", gpos[1])
            tgt = (Jb["sh_n"][0] - 0.02, Jb["sh_n"][1] - 0.02)
            lay = seg(t, t_heal - T(fr, 2), t_heal, "out") * (1 - seg(t, t_healed, t_healed + T(fr, 3)))
            base = pose_at(lay, [(0, base), (1, reach(GOJO, P(base, hand_f="open"), gpos[0], None, -1, "f", tgt,
                                                    ground=gpos[1]))])
        if t >= t_roll:
            r = math.sin(clamp((t - t_roll) / T(fr, 8)) * math.pi)
            base = P(base, ua_n=base["ua_n"] - 40 * r, fa_n=base["fa_n"] - 30 * r)
        base = P(base, neck=base["neck"] + 6 * shoulder_low, lean=base["lean"] + 5 * shoulder_low)
        Jg = gojo(fr, base, gpos[0], gpos[1], -1, halo=1.4, switch=t_healed, mouth="flat")
        if t_heal <= t < t_healed + T(fr, 4):
            sx, sy = Jg["sh_n"]
            fx.rct_heal(fr, sx, sy, (t - t_heal) * 0.8 / max(0.1, t_healed - t_heal), r=0.16)
    # ---- Thragg, soft foreground left: tumbling in, then the plant; then not a muscle ---
    def fg():
        d = 0.16 * zoom / 40.0 * (40.0 / zoom) ** 0.15
        u = kf(t, [(0, 0.02), (t_plant, 0.14, "out")])
        v = kf(t, [(0, 0.3), (t_plant, 0.62, "out")])
        x, y = s2w(fr, u, v, d)
        if t < t_plant:
            pose = rot_pose(P("tumble"), 200 * t)
        else:
            pose = pose_at(t, [(t_plant, rot_pose(P(T_STILL), 30)), (t_plant + T(fr, 3), T_STILL, "out")])
        J = thragg(fr, pose, x, y, 1, depth=d, switch=None)
        cx, cy = J["chest"]
        rng = fr.srng("tsmk")
        img, dr = fr.layer()
        for k in range(8):
            ph = (rng.random() + t * 0.6) % 1.0
            X, Y = fr.P(cx + 0.3 + ph * 0.6, cy + ph * 1.2, d)
            R = fr.S(0.12 + ph * 0.3, d)
            dr.ellipse([X - R, Y - R, X + R, Y + R], fill=(80, 74, 78, int(140 * (1 - ph))))
        fr.merge(img)
    soft_draw(fr, fg, radius=6.0)


# =============================================================================
# S4-18  CU Thragg: "So. It is a choice."
# =============================================================================

def thragg_mouth(fr, cu, cv, s, open_k, flip=1):
    if open_k <= 0.05:
        return
    L = inserts.Local(fr, cu, cv, s, 0.0, flip)
    L.poly([(0.08, 0.42), (0.4, 0.405), (0.38, 0.42 + 0.06 * open_k), (0.1, 0.43 + 0.065 * open_k)], (54, 20, 24))


def thragg_gaze(fr, cu, cv, s, gy, expr_h=0.035, flip=1):
    L = inserts.Local(fr, cu, cv, s, 0.0, flip)
    for ex in (0.34, -0.06):
        L.ell(ex, -0.13, 0.1, expr_h + 0.01, fill=(220, 214, 214))
        L.ell(ex + 0.02, -0.13 + gy * 0.02, 0.035, expr_h + 0.005, fill=(26, 18, 22))


def _syll(t, spans):
    k = 0.0
    for a, b in spans:
        if a <= t <= b:
            u = (t - a) / max(1e-6, b - a)
            k = max(k, math.sin(u * math.pi))
    return k


def s4_18(fr):
    t = fr.t
    dl = (fr.shot.get("dialogue") or [{}])[0]
    a0 = dl.get("at_frame", 4)
    st = C.state(SEQ, "tower_gutted", "clouds_torn", "smoke")
    fr.cam = Cam(70.0, 151.8 + 6.0, 26.0)
    tg = C.tg(fr)

    def plate():
        env.sky(fr)
        env.clouds(fr, tg)
        env.skyline(fr, st, layers=(0, 1, 2, 3))
        env.smoke_columns(fr, tg, st)
        district(fr)
        gojo(fr, G_LOOSE, 70.0 + 0.36 * 1920 / 26.0, None, -1, y=151.0, mouth="flat")
    soft_draw(fr, plate, radius=4.0)
    env.light_shafts(fr, st, strength=0.9)
    # ---- the face: warm rim, split lip; stillness; an imperceptible push-in -----------
    s = 0.9 + 0.04 * fr.u
    cu, cv = 0.42, 0.5
    inj = [i for i in C.opts(fr, "thragg")["injuries"] if i in ("mouth_blood", "brow_cut", "eye_blood", "bruise")]
    # cape rags lifting in the wind behind the shoulder
    L = inserts.Local(fr, cu, cv, s, 0.0, 1)
    fl = math.sin(t * 7) * 0.05
    L.poly([(-0.9, 0.95), (-1.25, 0.6 + fl), (-1.4, 0.75 - fl), (-1.55, 0.55 + fl), (-1.5, 1.0), (-1.1, 1.3)],
           shade(THRAGG.accent, 0.7))
    inserts.thragg_face(fr, cu, cv, s, expr="analytical", injuries=inj, flip=1, t=t)
    # the scorched chest at the bottom of frame, still smoking
    L.poly([(-0.5, 1.02), (0.4, 0.98), (0.6, 1.4), (-0.7, 1.4)], (60, 44, 44))
    L.ell(-0.05, 1.18, 0.38, 0.12, fill=(34, 24, 26))
    L.ell(0.05, 1.12, 0.18, 0.05, fill=(110, 40, 30))
    img, dr = fr.layer()
    rng = fr.srng("wisp")
    for i in range(10):
        ph = (rng.random() + t * 0.35) % 1.0
        x, y = L.p(-0.2 + rng.uniform(-0.3, 0.4) + ph * 0.3, 1.1 - ph * 0.9)
        R = (0.02 + ph * 0.06) * fr.H
        dr.ellipse([x - R, y - R, x + R, y + R], fill=(90, 84, 88, int(110 * (1 - ph))))
    fr.merge(img)
    # one slow eye travel down Gojo's distant figure and back up (f36-59)
    gy = 0.9 * math.sin(clamp((t - T(fr, 36)) / max(1e-6, fr.dur - T(fr, 36))) * math.pi)
    thragg_gaze(fr, cu, cv, s, gy)
    # lip-sync: "So." f4-12, pause, "It is a choice." f23-58
    open_k = _syll(t, [(T(fr, a0), T(fr, a0 + 8)), (T(fr, 23), T(fr, 28)), (T(fr, 29), T(fr, 34)),
                       (T(fr, 35), T(fr, 39)), (T(fr, 40), T(fr, 52))])
    thragg_mouth(fr, cu, cv, s, open_k * 0.8)
    # guarded, shallow breathing over the cracked ribs
    fr.cam = Cam(0, 0, 1080)


# =============================================================================
# S4-19  CU Gojo: the smile fades
# =============================================================================

def s4_19(fr):
    t = fr.t
    st = C.state(SEQ, "tower_gutted", "clouds_torn", "smoke")
    fr.cam = Cam(112.0, 151.7 + 4.0, 26.0)
    tg = C.tg(fr)
    t_square = T(fr, 20)

    def plate():
        env.sky(fr)
        env.clouds(fr, tg)
        env.skyline(fr, st, layers=(0, 1, 2, 3))
        env.smoke_columns(fr, tg, st)
        district(fr)
        k = seg(t, t_square, fr.dur, "inout")
        pose = pose_at(k, [(0, P(T_STILL, lean=2)), (1, P("t_guard", lean=12, neck=18, **LEGS_AIR))])
        thragg(fr, pose, 112.0 - 0.3 * 1920 / 26.0, None, 1, sole=148.8)
    soft_draw(fr, plate, radius=4.0)
    env.light_shafts(fr, st, strength=0.9)
    # ---- the face, in the right third, looking screen-left -------------------------------
    cu, cv, s = 0.66, 0.54, 0.86
    t12, t19, t26, t36 = T(fr, 12), T(fr, 19), T(fr, 26), T(fr, 36)
    if t < t12:
        expr = "smirk"
    elif t < t19:
        expr = "neutral"
    else:
        expr = "serious"
    glow = 1.0 + 0.35 * seg(t, t36, t36 + T(fr, 6))
    wind = 0.08 * math.sin(t * 6.0) + 0.06
    inserts.gojo_face(fr, cu, cv, s, expr=expr, eyes="open", flip=-1, t=t, eye_glow=glow, hair_wind=wind)
    # the eyes stop being amused and simply look (f26): irises steady, level
    if t >= t26:
        gojo_gaze(fr, cu, cv, s, 0.55, 0.0, flip=-1, glow=glow)
    else:
        gojo_gaze(fr, cu, cv, s, 0.55, 0.25, flip=-1, glow=glow)
    # the bloodstained tear at the left shoulder at the bottom of frame
    L = inserts.Local(fr, cu, cv, s, 0.0, -1)
    L.poly([(-0.5, 0.98), (-0.2, 0.9), (-0.05, 1.1), (-0.25, 1.3), (-0.6, 1.25)], (70, 18, 24))
    L.poly([(-0.42, 1.02), (-0.24, 0.98), (-0.14, 1.12), (-0.3, 1.2)], (120, 26, 32))
    L.line([(-0.46, 1.0), (-0.2, 1.24)], (40, 14, 18), 0.01)


# =============================================================================
# S4-20  WS side-on at 150 m: twelve frames of stillness, then he launches
# =============================================================================

def s4_20(fr):
    t = fr.t
    t_ant = T(fr, 12)
    t_go = cue(fr, "accel_burst", 0, 13)
    fr.cam = Cam(90.0, 150.0, 22.0, shake=shake2(t, t_go, 7.0, 4))
    C.stage(fr, SEQ, "sky", extra=("tower_gutted", "clouds_torn", "smoke"))
    # smoke column below shoved sideways by the pressure
    push = 6.0 * seg(t, t_go, t_go + T(fr, 6), "out")
    img, dr = fr.layer()
    for k in range(12):
        yy = 122 + k * 2.6
        X, Y = fr.P(84 + push * (k / 11) + math.sin(k + C.tg(fr)) * 1.0, yy)
        R = fr.S(2.4 + k * 0.35)
        dr.ellipse([X - R, Y - R, X + R, Y + R], fill=(46, 42, 46, 150))
    fr.merge(img)
    # Gojo, 58 m east, facing him, hands at his sides
    gojo(fr, G_LOOSE, 120.0, None, -1, y=150.0 + 0.98, halo=1.6, mouth="flat")
    # Thragg: squared, smoke from the chest; one compressed frame; launch; a streak
    T_SQ = P("t_guard", lean=10, neck=10, **LEGS_AIR)
    if t < t_ant:
        J = thragg(fr, T_SQ, 62.0, 150.0, 1)
        cx, cy = J["chest"]
        smoke_trail(fr, [(cx - 0.3 - 0.2 * k, cy + 0.3 * k) for k in range(6, -1, -1)], t, salt="s420", width=0.25,
                    alpha=110)
    elif t < t_go:
        thragg(fr, P(T_SQ, lean=26, neck=16, th_n=60, sh_n=-60, ua_n=10, fa_n=60, ua_f=0, fa_f=40), 62.0, 149.6, 1)
    else:
        k = seg(t, t_go, T(fr, 19), "in")
        x_eq = lerp(62.0, 90.0, k)
        d = 1.0 - 0.18 * math.sin(clamp((x_eq - 62.0) / 58.0) * math.pi)
        lx, ly = at_d(fr, x_eq, 150.0, d)
        thragg(fr, P("t_fly_punch", lean=84), lx, ly, 1, depth=d)
        tail = []
        for kk in range(8, -1, -1):
            kk2 = seg(max(t_go, t - kk * 0.03), t_go, T(fr, 19), "in")
            xe = lerp(62.0, 90.0, kk2)
            de = 1.0 - 0.18 * math.sin(clamp((xe - 62.0) / 58.0) * math.pi)
            tail.append(at_d(fr, xe, 150.3, de))
        fx.trail(fr, tail, width_m=1.6, alpha=110)
        fx.sonic_boom(fr, 62.5, 150.4, t - t_go, 1, 0, size=4.0)
        if t >= t_go + T(fr, 1):
            fx.speed_lines(fr, 0.8, direction=(1, 0), salt="s420")


SHOTS = {
    "S4-01": s4_01, "S4-02": s4_02, "S4-03": s4_03, "S4-04": s4_04, "S4-05": s4_05,
    "S4-06": s4_06, "S4-07": s4_07, "S4-08": s4_08, "S4-09": s4_09, "S4-10": s4_10,
    "S4-11": s4_11, "S4-12": s4_12, "S4-13": s4_13, "S4-14": s4_14, "S4-15": s4_15,
    "S4-16": s4_16, "S4-17": s4_17, "S4-18": s4_18, "S4-19": s4_19, "S4-20": s4_20,
}
