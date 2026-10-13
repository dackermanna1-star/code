"""Sequence 7 - THE FINAL EXCHANGE (S7-01 .. S7-18).

Seq 6 ends with the domain spent and both men in mid-air at the west corner.
Burnout (R9): from S7-01 f0 there is no Limitless - Gojo FALLS, skids, and
there is no refraction anywhere until the repair completes in S7-14.

  S7-01..03  the same real second from three angles: both drop; Thragg on one knee
  S7-04      the decision: hand to the temple, stops, lowers - finish by hand
  S7-05..06  the walk in / Thragg's will (doubled sight converging, fingers dig in)
  S7-07..09  the low lunge misses, a shard cuts the cheek, Thragg reads the blood;
             Gojo starts the brain repair (nosebleed)
  S7-10..11  rising straight parried by the reinforced forearm; Thragg tears it off
  S7-12      Thragg charges, no guard; Gojo's hand drops low, two fingers out
  S7-13..15  THE slow motion (~17x): the repair completes, Infinity resumes,
             near fragments stop dead, the fist stalls 1 cm from the eye (the
             S2-02 composition), two fingers slide into the Purple-flayed flank
  S7-16      Red inside the chest, aimed down and east; the mix cuts to silence
  S7-17      the silent shockwave seen from high above; the mast topples
  S7-18      the wide silhouette through the dust

Screen direction: Gojo screen-left facing right; Thragg screen-right attacking
right to left. Rig sides: Gojo facing east shows his RIGHT side (near = right
arm, far = left arm, lost from S7-11). Thragg facing west shows his LEFT side
(near = the stump + flayed flank + torn ear; far = his only, right, arm).

Timing: beats are authored against the nominal shot lengths in NOM and scaled
by fr.n / NOM (T()), so each shot still works if its length changes by a few
frames; contact frames are read from the shot's own sfx cues (cue()).
The concrete fragments kicked up by Thragg's push-off (S7-12 f9) run on one
REAL-time clock across S7-12..S7-16 (frag_clock), so their arcs stay
continuous through the slow motion and the near ones stop when Infinity
resumes (S7-14 f16).
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

SEQ = 7

NOM = {"S7-01": 40, "S7-02": 28, "S7-03": 28, "S7-04": 34, "S7-05": 66, "S7-06": 44, "S7-07": 20,
       "S7-08": 12, "S7-09": 44, "S7-10": 22, "S7-11": 22, "S7-12": 24, "S7-13": 56, "S7-14": 40,
       "S7-15": 72, "S7-16": 18, "S7-17": 30, "S7-18": 120}

# story ("real") time covered by each shot of the final rush (shot list action maps)
REAL = {"S7-12": (5.80, 6.00), "S7-13": (6.00, 6.13), "S7-14": (6.13, 6.23), "S7-15": (6.23, 6.40),
        "S7-16": (6.40, 7.15)}
PUSH_OFF_REAL = 5.80 + 0.20 * 9 / 24          # S7-12 f9: the slab bursts under Thragg's foot
INF_BACK_REAL = 6.13 + 0.10 * 16 / 40         # S7-14 f16: Infinity resumes

# world anchors (shot list staging)
MAST_X = -7.0
FIST_CRATER_X = -3.3
BLAST = (-5.15, 1.3)                          # Red's release point inside Thragg's chest


# =============================================================================
# timing helpers
# =============================================================================

def T(fr, f):
    """Nominal frame f of this shot -> seconds (scaled to the shot's real length)."""
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


def real_time(fr):
    a, b = REAL[fr.shot["id"]]
    return a + (b - a) * fr.f / fr.n


def fall_u(t, t0, t1):
    """0..1 progress of a free fall from rest (gravity: distance ~ t^2)."""
    return clamp((t - t0) / (t1 - t0)) ** 2 if t1 > t0 else 1.0


# =============================================================================
# rig helpers
# =============================================================================
LIMBS = ["ua_n", "fa_n", "ua_f", "fa_f", "th_n", "sh_n", "th_f", "sh_f"]
RIM_W = (-0.6, 0.5)                                   # dusk key from screen-left: rim on the west edge
GOJO_W = replace(GOJO, rim=(255, 196, 150))           # warm sunset rim on Gojo's hair and collar
THRAGG_W = replace(THRAGG, rim=(255, 180, 130))


def rig_angle(dx, dy, facing):
    return math.degrees(math.atan2(dx * facing, -dy))


def reach(st, pose, x, y, facing, side, target, scale=1.0, elbow="down"):
    """Pose with arm `side` solved (2-bone IK) so the hand lands on `target`.
    (x, y) is the PELVIS (as passed to solve)."""
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


def straight(st, pose, x, y, facing, side, target, ext=0.94):
    """A straight punch seen in profile: the arm stays (nearly) straight along
    the shoulder->fist line and is FORESHORTENED (the bend happens in depth),
    instead of folding up/down in the picture plane. Returns (pose, style)."""
    J = solve(st, pose, x, y, facing, 1.0, "side")
    sx, sy = J[f"sh_{side}"]
    d = math.hypot(target[0] - sx, target[1] - sy) - 0.95 * st.fist
    k = clamp(d / ((st.upper_arm + st.forearm) * ext), 0.35, 1.0)
    st2 = replace(st, upper_arm=st.upper_arm * k, forearm=st.forearm * k)
    return reach(st2, pose, x, y, facing, side, target, elbow="down"), st2


def ground_pelvis(st, pose, facing=1, scale=1.0):
    """Pelvis height when the pose's lowest point is snapped to the street."""
    return solve(st, pose, 0.0, None, facing, scale, "side")["pelvis"][1]


def soles_offset(st, pose, facing=1, scale=1.0):
    """Pelvis height above the lowest foot point for this pose."""
    J = solve(st, pose, 0.0, 0.0, facing, scale, "side")
    return -min(J["an_n"][1], J["an_f"][1], J["toe_n"][1], J["toe_f"][1])


def head_at(J, st, u, v):
    """Point on the rig head: u along the face direction, v along the head's up (head radii)."""
    hx, hy = J["head"]
    r = st.head_r * J["scale"]
    f = J["facing"]
    hd = J["head_dir"]
    fwd = (hd[1] * f, -hd[0] * f)
    return (hx + (fwd[0] * u + hd[0] * v) * r, hy + (fwd[1] * u + hd[1] * v) * r)


def torso_pt(J, along, out):
    """Point on the torso: `along` 0 (pelvis) .. 1 (chest), `out` metres toward the front."""
    px, py = J["pelvis"]
    cx, cy = J["chest"]
    L = math.hypot(cx - px, cy - py) or 1e-6
    sd = ((cx - px) / L, (cy - py) / L)
    f = J["facing"]
    front = (sd[1] * f, -sd[0] * f)
    s = J["scale"]
    return (px + (cx - px) * along + front[0] * out * s, py + (cy - py) * along + front[1] * out * s)


def gopts(fr, switch=None, profile=False, **kw):
    """Gojo's rig opts from the ledger. profile=True: the camera sees his RIGHT
    side, so the cut on his LEFT cheek is out of view (S7-15's note)."""
    kw.setdefault("mouth", "flat")
    o = C.opts(fr, "gojo", switch=switch, **kw)
    if profile:
        o["injuries"] = [i for i in o["injuries"] if i != "cheek_cut"]
    return o


def topts(fr, switch=None, **kw):
    return C.opts(fr, "thragg", switch=switch, **kw)


def gojo(fr, pose, x, y=None, facing=1, depth=1.0, scale=1.0, switch=None, profile=True, opts=None,
         blindfold_lift=0.0, bloody=True, view="side", **kw):
    o = opts or gopts(fr, switch=switch, profile=profile, **kw)
    J = draw_fighter(fr, GOJO_W, pose, x, y, facing, scale=scale, view=view, opts=o, depth=depth, rim_dir=RIM_W)
    if view == "side":
        neck_band(fr, J, lift=blindfold_lift, d=depth)
        if bloody:
            bloody_hand(fr, J, d=depth)
    return J


def thragg(fr, pose, x, y=None, facing=-1, depth=1.0, scale=1.0, switch=None, opts=None, style=None, **kw):
    o = opts or topts(fr, switch=switch, **kw)
    return draw_fighter(fr, style or THRAGG_W, pose, x, y, facing, scale=scale, opts=o, depth=depth,
                        rim_dir=RIM_W)


def neck_band(fr, J, lift=0.0, d=1.0):
    """Gojo's blindfold pulled down around his neck; its loose tail lifts on a drop."""
    prev = fr.depth
    fr.depth = d
    s = J["scale"]
    nx, ny = J["neck"]
    cx, cy = J["chest"]
    f = J["facing"]
    a = (nx + (cx - nx) * 0.15, ny + (cy - ny) * 0.15)
    fr.line([(a[0] - f * 0.06 * s, a[1] + 0.01 * s), (a[0] + f * 0.07 * s, a[1] - 0.012 * s)], GOJO.accent,
            width_m=0.045 * s)
    # tail at the back of the neck
    tl = 0.16 * s
    ang = math.radians(-100 + 150 * clamp(lift))        # hangs down -> streams up on the drop
    tx, ty = a[0] - f * 0.06 * s, a[1]
    fr.line([(tx, ty), (tx - f * math.cos(math.radians(30)) * 0.05 * s, ty),
             (tx + f * math.cos(ang) * tl * -1, ty + math.sin(ang) * tl)], GOJO.accent, width_m=0.03 * s)
    fr.depth = prev


def bloody_hand(fr, J, d=1.0):
    """Gojo's right (near) hand wet to the wrist with Thragg's blood (Seq 6 continuity)."""
    prev = fr.depth
    fr.depth = d
    ex, ey = J["el_n"]
    wx, wy = J["wr_n"]
    s = J["scale"]
    mx, my = lerp(ex, wx, 0.6), lerp(ey, wy, 0.6)
    fr.line([(mx, my), (wx, wy)], (110, 12, 20), width_m=GOJO.w_fa * 0.8 * s)
    hx, hy = hand_pos(J, "n", 0.035)
    fr.circle(hx, hy, GOJO.fist * 0.75 * s, fill=(126, 14, 22))
    fr.depth = prev


def stump_blood(fr, J, t, side="f", d=1.0, n=4, salt="stb", spray=0.0):
    """Drips falling from Gojo's raw stump (left elbow)."""
    prev = fr.depth
    fr.depth = d
    ex, ey = J[f"el_{side}"]
    dvec = J[f"hand_dir_{side}"]
    s = J["scale"]
    tip = (ex + dvec[0] * GOJO.forearm * s * 0.25, ey + dvec[1] * GOJO.forearm * s * 0.25)
    fr.circle(tip[0], tip[1], GOJO.w_fa * 0.5 * s, fill=(150, 16, 26))
    rng = fr.srng(salt)
    for i in range(n):
        ph = (t * rng.uniform(1.4, 2.2) + rng.random()) % 1.0
        fr.circle(tip[0] + rng.uniform(-0.02, 0.02), tip[1] - ph * ph * 1.1, 0.012 * s, fill=(140, 10, 20))
    fr.depth = prev


def open_flank(fr, J, k=1.0, d=1.0, glow=0.0, entry=None):
    """The Purple-flayed left flank turned toward Gojo: raw tissue and exposed,
    broken ribs (drawn over the rig's flank patch). entry = (along, out) of
    the two fingers / Red's light."""
    if k <= 0.02:
        return
    prev = fr.depth
    fr.depth = d
    s = J["scale"]
    pts = [torso_pt(J, al, ou * (0.5 + 0.5 * k)) for (al, ou) in
           ((0.14, 0.08), (0.32, 0.15), (0.62, 0.18), (0.86, 0.12), (0.9, -0.03), (0.62, -0.07), (0.3, -0.05),
            (0.15, -0.01))]
    fr.poly(pts, (150, 30, 36))
    for j in range(5):
        al = 0.36 + j * 0.105
        a = torso_pt(J, al, -0.03)
        m = torso_pt(J, al + 0.012, 0.07 * (0.5 + 0.5 * k))
        b = torso_pt(J, al - 0.03 + (0.02 if j == 2 else 0.0), 0.15 * (0.5 + 0.5 * k))
        if j in (1, 2):      # two broken ribs (S6-10)
            b = torso_pt(J, al - 0.06, 0.1 * (0.5 + 0.5 * k))
        fr.line([a, m, b], (226, 206, 196), width_m=0.02 * s)
        fr.line([torso_pt(J, al - 0.05, -0.01), torso_pt(J, al - 0.07, 0.13 * (0.5 + 0.5 * k))], (84, 10, 18),
                width_m=0.011 * s)
    if entry is not None:
        wx, wy = torso_pt(J, *entry)
        fr.ellipse(wx, wy, 0.05 * s, 0.065 * s, fill=(70, 4, 12))
        if glow > 0:
            fr.glow_circle(wx, wy, 0.07 * s * (0.6 + 0.4 * glow), shade((230, 30, 40), 0.7 * glow))
            fr.ellipse(wx, wy, 0.04 * s, 0.05 * s, fill=mix_color((70, 4, 12), (255, 90, 80), glow))
    fr.depth = prev


# ---- poses: Gojo (facing east; near = RIGHT arm, far = LEFT arm) ------------
G_STAND = P("g_tired", lean=6, neck=4, ua_n=8, fa_n=4, ua_f=-4, fa_f=-6, th_n=10, sh_n=2, th_f=-8, sh_f=-8)
G_FALL = P("stand", lean=2, neck=-14, ua_n=58, fa_n=96, ua_f=40, fa_f=82, th_n=18, sh_n=-6, th_f=-6, sh_f=-24,
           hand_n="open", hand_f="open")
G_LAND = P("stand", lean=34, neck=-22, ua_n=40, fa_n=70, ua_f=26, fa_f=50, th_n=82, sh_n=-36, th_f=50, sh_f=-62,
           hand_n="open", hand_f="open")
G_CATCH = P(G_LAND, lean=26, neck=-14, ua_n=118, fa_n=150, ua_f=10, fa_f=30, th_n=66, sh_n=-26, th_f=40,
            sh_f=-56)
G_HALF = P("stand", lean=20, neck=-14, ua_n=14, fa_n=30, ua_f=6, fa_f=20, th_n=52, sh_n=-22, th_f=30, sh_f=-42,
           hand_n="open", hand_f="open")
G_WALK = P(G_STAND, lean=8, neck=2)
G_BRACE = P(G_STAND, lean=-6, neck=-4, ua_n=20, fa_n=40, ua_f=-14, fa_f=4, th_n=26, sh_n=10, th_f=-18, sh_f=-14,
            hand_n="open", hand_f="open")
G_GUARD = P(G_STAND, lean=2, neck=0, ua_n=16, fa_n=30, ua_f=40, fa_f=150, th_n=18, sh_n=4, th_f=-16, sh_f=-20,
            hand_n="open", hand_f="fist")
G_PARRY = P(G_GUARD, lean=-6, neck=-6, ua_f=78, fa_f=176, th_n=12, sh_n=2, th_f=-24, sh_f=-26)
G_LOCK = P(G_PARRY, lean=-10, neck=-4, ua_f=76, fa_f=124, th_n=20, sh_n=8, th_f=-22, sh_f=-26)
G_PULL = P(G_LOCK, lean=-20, neck=-8, ua_f=70, fa_f=100, ua_n=-20, fa_n=10, th_n=34, sh_n=22, th_f=-6, sh_f=-14)
G_RECOIL = P("stand", lean=-26, neck=-12, ua_n=60, fa_n=100, ua_f=10, fa_f=30, th_n=40, sh_n=34, th_f=18,
             sh_f=10, hand_n="open", hand_f="open")
G_SKID = P(G_RECOIL, lean=-14, neck=-6, ua_n=24, fa_n=44, th_n=34, sh_n=26, th_f=8, sh_f=0)
G_PLANT = P(G_STAND, lean=4, neck=-2, ua_n=6, fa_n=34, ua_f=10, fa_f=12, th_n=22, sh_n=4, th_f=-18, sh_f=-20,
            hand_n="sign", hand_f="open")
G_RISE_HAND = P(G_PLANT, lean=8, ua_n=30, fa_n=74)
G_THRUST = P(G_PLANT, lean=12, neck=-2, ua_n=60, fa_n=82, th_n=26, sh_n=2, th_f=-22, sh_f=-24)
G_AFTER = P(G_PLANT, lean=3, neck=0, ua_n=10, fa_n=8, hand_n="open")

# ---- poses: Thragg (facing west; near = LEFT stump, far = RIGHT arm) ----------
T_KNEEL = P("slump_kneel", lean=34, neck=24, ua_n=14, fa_n=6, ua_f=30, fa_f=20, th_n=88, sh_n=0, th_f=10,
            sh_f=-112, hand_n="open", hand_f="open")          # down on the RIGHT (far) knee
T_KNEEL_HAND = P(T_KNEEL, lean=60, neck=-22, th_f=30, sh_f=-110, th_n=88, sh_n=0)   # only hand planted ahead
T_KNEEL_UP = P(T_KNEEL, lean=26, neck=6)
T_FALLING = P("t_stand", lean=24, neck=10, ua_n=30, fa_n=40, ua_f=70, fa_f=90, th_n=30, sh_n=-10, th_f=-10,
              sh_f=-40, hand_f="claw")
T_RISE_TRY = P(T_KNEEL_HAND, lean=50, neck=-10, th_n=60, sh_n=-40, th_f=40, sh_f=-60)
T_SLIP = P(T_KNEEL_HAND, lean=64, neck=26, th_n=92, sh_n=2, th_f=-24, sh_f=-104)
T_COIL = P(T_KNEEL_HAND, lean=64, neck=-34, th_n=70, sh_n=-36, th_f=20, sh_f=-95)
T_COMPRESS = P(T_COIL, lean=70, neck=-40, th_n=76, sh_n=-40, th_f=26, sh_f=-96)
T_LUNGE = P("t_stand", lean=74, neck=-36, ua_n=-50, fa_n=-40, ua_f=96, fa_f=92, th_n=-40, sh_n=-60, th_f=-76,
            sh_f=-96, hand_f="fist")
T_CRASH = P("t_stand", lean=62, neck=-32, ua_n=-30, fa_n=-10, ua_f=124, fa_f=158, th_n=96, sh_n=-10, th_f=30,
            sh_f=-84, hand_f="fist")
T_UNCOIL = P(T_CRASH, lean=40, neck=-20, ua_f=60, fa_f=40, th_n=80, sh_n=-6, th_f=0, sh_f=-60)
T_RISING = P("t_stand", lean=16, neck=-10, ua_n=30, fa_n=50, ua_f=118, fa_f=112, th_n=40, sh_n=0, th_f=-26,
             sh_f=-34, hand_f="fist")
T_GRIP = P(T_RISING, lean=12, neck=-6, ua_f=110, fa_f=96, hand_f="claw")
T_TEAR = P(T_GRIP, lean=-18, neck=4, ua_n=60, fa_n=80, ua_f=40, fa_f=20, th_n=30, sh_n=10, th_f=-30, sh_f=-30)
T_HOLD = P(T_TEAR, lean=-4, neck=2, ua_f=20, fa_f=10, th_n=20, sh_n=4, th_f=-20, sh_f=-24, hand_f="claw")
T_STEP = P("t_stand", lean=20, neck=-6, ua_n=20, fa_n=30, ua_f=-40, fa_f=40, th_n=60, sh_n=10, th_f=-20,
           sh_f=-40, hand_f="fist")
T_DRAW = P("t_stand", lean=28, neck=-12, ua_n=-10, fa_n=10, ua_f=-70, fa_f=40, th_n=48, sh_n=6, th_f=-44,
           sh_f=-60, hand_f="fist")
T_DRIVE = P(T_DRAW, lean=26, neck=-14, ua_f=40, fa_f=90, th_n=40, sh_n=4, th_f=-44, sh_f=-62)
T_STRAIGHT = P("t_stand", lean=22, neck=-10, ua_n=-50, fa_n=-30, ua_f=90, fa_f=90, th_n=34, sh_n=4, th_f=-40,
               sh_f=-56, hand_f="fist")
T_STALL = P(T_STRAIGHT, lean=26, neck=-10, ua_f=96, fa_f=84)
T_BLAST = P("t_stand", lean=-58, neck=-40, ua_n=40, fa_n=80, ua_f=110, fa_f=140, th_n=60, sh_n=40, th_f=20,
            sh_f=-10, hand_f="open")
T_BACK = P("fallen", lean=-90, neck=6, ua_n=-80, fa_n=-100, ua_f=-150, fa_f=-160, th_n=84, sh_n=96, th_f=76,
           sh_f=92, hand_n="open", hand_f="open")


# =============================================================================
# compositing helpers
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


def blur_rgba(layer, r):
    """Gaussian blur of an RGBA layer in premultiplied space (no dark fringes)."""
    arr = np.asarray(layer).astype(np.float32)
    a = arr[..., 3:4] / 255.0
    pm = np.concatenate([arr[..., :3] * a, arr[..., 3:4]], axis=2)
    pm = Image.fromarray(np.clip(pm, 0, 255).astype(np.uint8), "RGBA").filter(ImageFilter.GaussianBlur(r))
    b = np.asarray(pm).astype(np.float32)
    a2 = b[..., 3:4] / 255.0
    rgb = b[..., :3] / np.maximum(a2, 1.0 / 255.0)
    out = np.concatenate([np.clip(rgb, 0, 255), b[..., 3:4]], axis=2)
    return Image.fromarray(out.astype(np.uint8), "RGBA")


def paste(fr, layer, blur=0.0, alpha=1.0, offset=(0, 0)):
    if blur > 0.25:
        bb = layer.getchannel("A").getbbox()
        if bb is None:
            return
        pad = int(3 * blur * fr.ss) + 2
        bb = (max(0, bb[0] - pad), max(0, bb[1] - pad), min(layer.width, bb[2] + pad), min(layer.height, bb[3] + pad))
        sub = blur_rgba(layer.crop(bb), blur * fr.ss)
        layer = Image.new("RGBA", layer.size, (0, 0, 0, 0))
        layer.paste(sub, bb[:2])
    if alpha < 0.999:
        a = layer.getchannel("A").point(lambda v, k=alpha: int(v * k))
        layer.putalpha(a)
    fr.img.paste(layer, (int(offset[0] * fr.ss), int(offset[1] * fr.ss)), layer)


def soft_draw(fr, fn, radius=2.0, alpha=1.0):
    layer, res = capture(fr, fn)
    paste(fr, layer, radius, alpha)
    return res


def silhouette(fr, layer, fill, rim=None, rim_off=(-3.0, -2.0), alpha=1.0):
    """Composite the shape of `layer` as a flat silhouette with an offset rim."""
    a = layer.getchannel("A")
    if alpha < 0.999:
        a = a.point(lambda v, k=alpha: int(v * k))
    if rim is not None:
        ra = ImageChops.offset(a, int(rim_off[0] * fr.ss), int(rim_off[1] * fr.ss))
        fr.img.paste(Image.new("RGB", a.size, rim), (0, 0), ra)
    fr.img.paste(Image.new("RGB", a.size, fill), (0, 0), a)


def bake_glow(fr):
    """Composite the additive glow layer into the frame now (as Frame.finish()
    would) and clear it, so whatever is drawn afterwards sits on top of it."""
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
    if fr.soft_img is None:
        return
    s = fr.soft_img.filter(ImageFilter.GaussianBlur(fr.soft_img.size[1] / 14))
    fr.img = ImageChops.screen(fr.img, s.resize((fr.W, fr.H), Image.BILINEAR))
    fr.draw = ImageDraw.Draw(fr.img)
    fr.soft_img = None


def bake(fr):
    bake_glow(fr)
    bake_soft(fr)


def blur_frame(fr, radius):
    if radius > 0.25:
        fr.img = fr.img.filter(ImageFilter.GaussianBlur(radius * fr.ss))
        fr.draw = ImageDraw.Draw(fr.img)


def plate(fr, cam, blur=6.0, lit=1.0, extra=(), dim=0.0, gantry_on=True):
    """A defocused street plate behind a close-up: the real location (same
    damage state, same dusk) rendered with `cam`, then blurred."""
    keep = fr.cam
    fr.cam = cam
    C.stage(fr, SEQ, "street", extra=extra, lit=lit, gantry_on=gantry_on)
    bake(fr)
    blur_frame(fr, blur)
    if dim > 0:
        img, dr = fr.layer()
        dr.rectangle([0, 0, fr.W, fr.H], fill=(10, 8, 14, int(255 * dim)))
        fr.merge(img)
    fr.cam = keep


def s2w(fr, u, v, d=1.0):
    c = fr.cam
    return (c.x + (u * OUT_W - OUT_W / 2) * d / c.zoom, c.y - (v * OUT_H - OUT_H / 2) * d / c.zoom)


def w2s(fr, x, y, d=1.0):
    px, py = fr.P(x, y, d)
    return px / fr.W, py / fr.H


def specks(fr, t, n=40, salt="specks", col=(196, 170, 140), drift=(0.01, -0.004), size=(0.0012, 0.0035),
           alpha=200, region=(0, 0, 1, 1)):
    """Screen-space drifting dust motes (close-ups): harmless dust drifting
    west to east through the light."""
    rng = fr.srng(salt)
    img, dr = fr.layer()
    u0, v0, u1, v1 = region
    for i in range(n):
        u = u0 + ((rng.random() + drift[0] * t * rng.uniform(0.5, 1.5)) % 1.0) * (u1 - u0)
        v = v0 + ((rng.random() + drift[1] * t * rng.uniform(0.5, 1.5)) % 1.0) * (v1 - v0)
        r = rng.uniform(*size) * fr.H
        a = int(alpha * rng.uniform(0.35, 1.0))
        dr.ellipse([u * fr.W - r, v * fr.H - r, u * fr.W + r, v * fr.H + r], fill=col + (a,))
    fr.merge(img)


def world_dust(fr, x0, x1, y0, y1, n=120, salt="wdust", d=1.0, drift=0.22, size_px=1.6, alpha=170,
               col=(236, 204, 160), settle=0.0, clock=None):
    """Dust hanging in the evening light, anchored in the WORLD and drifting
    slowly west -> east on the global clock, so overlapping angles match.
    clock: override (the slow motion runs the dust on the story clock)."""
    tg = C.tg(fr) if clock is None else clock
    rng = random.Random(f"s7{salt}")
    img, dr = fr.layer()
    span = x1 - x0
    for i in range(n):
        x = x0 + ((rng.random() * span + tg * drift * rng.uniform(0.6, 1.4)) % span)
        y = y0 + rng.random() * (y1 - y0) + 0.08 * math.sin(tg * 0.7 + i) - settle * rng.uniform(0.2, 1.0)
        if y < 0.02:
            continue
        X, Y = fr.P(x, y, d)
        if not (-4 < X < fr.W + 4 and -4 < Y < fr.H + 4):
            continue
        r = size_px * fr.ss * rng.uniform(0.6, 1.4)
        dr.ellipse([X - r, Y - r, X + r, Y + r], fill=col + (int(alpha * rng.uniform(0.4, 1.0)),))
    fr.merge(img)


def embers(fr, t, t_end, n=60, x_rng=(-18, 14), y_rng=(0.5, 12), salt="emb", d_rng=(1.0, 2.0)):
    """The last luminous specks of the void winking out like embers (on 1s)."""
    if t >= t_end:
        return
    rng = random.Random(f"s7{salt}")
    flick = random.Random(f"{salt}{fr.f}")
    for i in range(n):
        x, y = rng.uniform(*x_rng), rng.uniform(*y_rng)
        d = rng.uniform(*d_rng)
        die = rng.uniform(0.15, 1.0) * t_end
        if t >= die:
            continue
        k = (1 - t / die) * flick.uniform(0.55, 1.0)
        col = mix_color((120, 170, 255), (240, 250, 255), rng.random())
        fr.glow_circle(x, y, 0.12 * d * (0.5 + k), shade(col, k * 0.8), d=d)
        X, Y = fr.P(x, y, d)
        r = fr.ss * (1.0 + 1.2 * k)
        fr.draw.ellipse([X - r, Y - r, X + r, Y + r], fill=shade(col, 0.5 + 0.5 * k))


def shaft(fr, x_top, x_bot, w_top, w_bot, y_top=40.0, alpha=30, d=1.0, col=(255, 196, 140)):
    """An extra volumetric shaft of evening light (world space), slanting down
    from upper screen-left like env.light_shafts."""
    img, dr = fr.layer()
    pts = [fr.P(x_top - w_top / 2, y_top, d), fr.P(x_top + w_top / 2, y_top, d),
           fr.P(x_bot + w_bot / 2, 0.0, d), fr.P(x_bot - w_bot / 2, 0.0, d)]
    dr.polygon(pts, fill=col + (int(alpha),))
    fr.merge(img)


def grooves(fr, x_from, x_to, k, n=4, d=1.0):
    """Claw grooves dragged in the asphalt (k = 0..1 of the drag)."""
    if k <= 0:
        return
    xe = lerp(x_from, x_to, k)
    for j in range(n):
        y = 0.012 + j * 0.018
        fr.line([(x_from + 0.02 * j, y), (xe, y + 0.004)], (14, 12, 16), width_m=0.018, d=d)


def fist_crater(fr, x=FIST_CRATER_X, k=1.0, d=1.0):
    """The fresh fist-crater on the landing crater's west rim (S7-07 on)."""
    if k <= 0:
        return
    rng = random.Random("s7fistcrater")
    r = 0.55 * k
    fr.ellipse(x, -0.01, r, r * 0.22, fill=shade(PAL["concrete"], 0.72), d=d)
    fr.ellipse(x, -0.03, r * 0.72, r * 0.14, fill=(18, 16, 20), d=d)
    for j in range(7):
        a = rng.uniform(0, math.tau)
        cx, cy = x + math.cos(a) * r * 1.05, -math.sin(a) * r * 0.2 + 0.03
        s = rng.uniform(0.06, 0.16) * k
        fr.poly([(cx - s, cy), (cx - s * 0.2, cy + s * 0.9), (cx + s * 0.8, cy + s * 0.3), (cx + s * 0.5, cy - 0.03)],
                shade(PAL["street"], rng.uniform(0.9, 1.4)), d=d)
    for j in range(8):
        a = rng.uniform(0, math.pi * 2)
        L = r * rng.uniform(1.4, 2.6)
        fr.line([(x + math.cos(a) * r * 0.8, -math.sin(a) * r * 0.16), (x + math.cos(a) * L, -math.sin(a) * L * 0.18)],
                (16, 14, 16), width_m=0.025, d=d)


def headless(fr, fn, st):
    """Draw a rig figure with its head masked out (when an insert face is
    drawn in its place at insert scale)."""
    layer, J = capture(fr, fn)
    hx, hy = J["head"]
    X, Y = fr.P(hx, hy, J.get("depth", 1.0))
    R = fr.S(st.head_r * 1.9, J.get("depth", 1.0))
    mask = Image.new("L", layer.size, 255)
    ImageDraw.Draw(mask).ellipse([X - R, Y - R * 1.05, X + R, Y + R * 1.05], fill=0)
    layer.putalpha(ImageChops.multiply(layer.getchannel("A"), mask))
    fr.img.paste(layer, (0, 0), layer)
    return J


def gojo_eye(fr, L, ex, ey, sz, lid=0.0, gaze=(0.0, 0.0), veins=0.9, glow=1.0, salt="gv", skin_patch=True,
             reflect=0.0):
    """Gojo's bare eye over gojo_face (insert coords): almond sclera with
    bloodshot veins, crystalline blue iris clipped by the lids, pupil, glint,
    white lashes. lid 0..1 narrows the eye. reflect>0: a dark knuckle shape
    reflected in the iris."""
    rx, ry = 0.125 * sz, 0.072 * sz
    ry_u = ry * (1 - 0.6 * lid)
    ry_l = ry * (1 - 0.25 * lid)
    if skin_patch:
        L.ell(ex, ey + 0.01 * sz, rx * 1.35, ry * 1.55, fill=GOJO.skin)
    n = 16
    up = [(ex + rx * math.cos(math.pi * (1 - k / n)), ey - ry_u * math.sin(math.pi * (1 - k / n))) for k in range(n + 1)]
    lo = [(ex + rx * math.cos(math.pi * k / n), ey + ry_l * math.sin(math.pi * k / n)) for k in range(n + 1)]
    almond = up + lo[1:-1]
    L.poly(almond, (236, 236, 240))
    rng = random.Random(salt)
    if veins > 0:
        for j in range(12):
            side = 1 if j % 2 else -1
            y0 = ey + rng.uniform(-0.4, 0.5) * ry_l
            x0 = ex + side * rx * 0.94
            ln = rx * rng.uniform(0.25, 0.5) * veins
            pts = [(x0, y0)]
            wig = rng.uniform(0, 6)
            for q in range(1, 6):
                u = q / 5
                pts.append((x0 - side * ln * u, y0 + math.sin(u * 4 + wig) * ry * 0.1 + (ey - y0) * 0.25 * u))
            L.line(pts, (196, 52, 64), 0.0045 * sz)
    ix, iy = ex + 0.012 * sz + gaze[0] * 0.045 * sz, ey + gaze[1] * 0.022 * sz
    ir = 0.066 * sz
    apts = [L.p(px, py) for px, py in almond]
    bx0 = int(max(0, min(p[0] for p in apts) - 4))
    by0 = int(max(0, min(p[1] for p in apts) - 4))
    bx1 = int(min(fr.W, max(p[0] for p in apts) + 4))
    by1 = int(min(fr.H, max(p[1] for p in apts) + 4))
    if bx1 - bx0 < 2 or by1 - by0 < 2:
        return
    layer = Image.new("RGBA", (bx1 - bx0, by1 - by0), (0, 0, 0, 0))
    dr = ImageDraw.Draw(layer)
    X, Y = L.p(ix, iy)
    X, Y = X - bx0, Y - by0
    R = ir * 0.5 * fr.H * L.s
    dr.ellipse([X - R, Y - R, X + R, Y + R], fill=(28, 128, 222, 255))
    dr.ellipse([X - R * 0.86, Y - R * 0.86, X + R * 0.86, Y + R * 0.86], fill=(66, 192, 255, 255))
    for k in range(40):
        a = k * math.tau / 40 + 0.13
        col = (186, 240, 255, 200) if k % 2 else (36, 150, 236, 220)
        dr.line([(X + math.cos(a) * R * 0.3, Y + math.sin(a) * R * 0.3), (X + math.cos(a) * R * 0.9, Y + math.sin(a) * R * 0.9)],
                fill=col, width=max(1, int(R * 0.03)))
    dr.ellipse([X - R, Y - R, X + R, Y + R], outline=(14, 70, 140, 255), width=max(1, int(R * 0.05)))
    pr = R * 0.26
    dr.ellipse([X - pr, Y - pr, X + pr, Y + pr], fill=(10, 34, 70, 255))
    if reflect > 0:
        # the approaching knuckles, tiny and dark, curved over the iris
        kx, ky = X + R * 0.35, Y - R * 0.05
        kw = R * 0.5 * reflect
        dr.rounded_rectangle([kx - kw * 0.5, ky - kw * 0.45, kx + kw * 0.5, ky + kw * 0.45], radius=max(1, int(kw * 0.2)),
                             fill=(70, 18, 26, int(200 * min(1, reflect))))
    gx, gy = X - R * 0.32, Y - R * 0.34
    dr.ellipse([gx - R * 0.13, gy - R * 0.1, gx + R * 0.13, gy + R * 0.1], fill=(250, 254, 255, 255))
    mask = Image.new("L", layer.size, 0)
    ImageDraw.Draw(mask).polygon([(p[0] - bx0, p[1] - by0) for p in apts], fill=255)
    layer.putalpha(ImageChops.multiply(layer.getchannel("A"), mask))
    fr.img.paste(layer, (bx0, by0), layer)
    if glow > 0.01:
        L.glow(ix, iy, 0.07 * sz, shade((30, 110, 210), 0.45 * glow))
    L.line(up, shade(GOJO.skin, 0.45), 0.009 * sz)
    for k in range(13):
        a = math.pi * (1 - (k + 0.5) / 13)
        px, py = ex + rx * math.cos(a), ey - ry_u * math.sin(a)
        col = mix_color(GOJO.hair, (255, 196, 140), 0.55 if k < 4 else 0.0)
        ln = 0.032 * sz * (0.6 + 0.4 * math.sin(a))
        L.line([(px, py), (px + ln * math.cos(a) * 0.7 - 0.004 * sz, py - ln)], col, 0.0032 * sz)
    L.line(lo, shade(GOJO.skin, 0.7), 0.0035 * sz)


def gojo_cu(fr, cu, cv, s, inj, lid=0.3, gaze=(0.6, 0.0), expr="serious", rot=0.0, cut=0.0, nose=0.0,
            shimmer=0.0, flare=0.0, t=0.0, reflect=0.0, glow=1.0):
    """Gojo's close-up portrait (3/4, facing screen-right) with Seq 7's state:
    eyes bare, narrowed and bloodshot; hair loose; blindfold at his neck; the
    torn, bloodstained left (far) shoulder. cut 0..1 = how far the cheek cut
    has opened/bled, nose 0..1 = nosebleed run, shimmer = RCT at the temple."""
    base_inj = [i for i in inj if i not in ("nosebleed",)]
    inserts.gojo_face(fr, cu, cv, s, expr=expr, eyes="open", injuries=base_inj, rot=rot, flip=1, eye_glow=0.0)
    L = inserts.Local(fr, cu, cv, s, rot, 1)
    # blindfold around the neck, torn far (left) shoulder with blood
    L.poly([(-0.36, 0.6), (0.26, 0.55), (0.3, 0.66), (-0.38, 0.72)], GOJO.accent)
    L.line([(-0.36, 0.62), (0.27, 0.57)], (40, 40, 52), 0.008)
    L.poly([(0.44, 0.76), (0.5, 0.72), (0.55, 0.78), (0.6, 0.73), (0.66, 0.86), (0.6, 0.98), (0.55, 0.9),
            (0.49, 1.0), (0.45, 0.88)], (70, 20, 26))
    L.poly([(0.5, 0.8), (0.58, 0.79), (0.6, 0.88), (0.53, 0.9)], (120, 34, 40))
    L.line([(0.45, 0.77), (0.5, 0.73), (0.55, 0.79), (0.6, 0.74)], (150, 140, 150), 0.006)
    # eyes: narrowed, bloodshot, looking screen-right
    for ex, sz, sl in ((0.3, 1.0, "a"), (-0.12, 0.85, "b")):
        gojo_eye(fr, L, ex, -0.15, sz, lid=lid, gaze=gaze, salt=f"gv{sl}", reflect=reflect if sl == "a" else 0.0,
                 glow=glow)
    # brows drawn down
    L.line([(0.14, -0.31 + 0.02 * lid), (0.46, -0.29 + 0.03 * lid)], GOJO.hair, 0.022)
    L.line([(-0.26, -0.3 + 0.02 * lid), (0.0, -0.31 + 0.03 * lid)], GOJO.hair, 0.02)
    if flare > 0:
        L.ell(0.39, 0.19, 0.03 + 0.012 * flare, 0.016 + 0.008 * flare, fill=shade(GOJO.skin, 0.55))
    if "cheek_cut" in inj and cut > 0:
        # far (left) cheekbone, out beyond the nose: a thin line, then beads, then a short run
        k = clamp(cut)
        x0, y0, x1, y1 = 0.43, 0.0, 0.51, -0.05
        L.line([(x0, y0), (lerp(x0, x1, min(1, k * 2)), lerp(y0, y1, min(1, k * 2)))], (170, 14, 24), 0.01)
        if k > 0.4:
            for j in range(3):
                bx = lerp(x0, x1, 0.2 + 0.3 * j)
                L.ell(bx, lerp(y0, y1, 0.2 + 0.3 * j) + 0.01, 0.006, 0.008 * (k - 0.3) / 0.7 + 0.002, fill=(150, 8, 18))
        if k > 0.7:
            L.line([(0.47, -0.015), (0.475, 0.0 + 0.07 * (k - 0.7) / 0.3)], (140, 8, 16), 0.006)
    if nose > 0:
        k = clamp(nose)
        L.ell(0.37, 0.215, 0.015, 0.01, fill=(150, 10, 20))
        L.line([(0.37, 0.22), (0.366, 0.22 + 0.15 * k)], (160, 12, 22), 0.013)
    if shimmer > 0:
        # RCT: soft warm-white under the skin at the near temple, no green, no sparkles
        L.glow(-0.34, -0.26, 0.08, shade((255, 232, 196), 0.28 * shimmer))
        X, Y = L.p(-0.34, -0.26)
        R = 0.07 * 0.5 * fr.H * L.s
        img, dr = fr.layer()
        dr.ellipse([X - R, Y - R * 0.7, X + R, Y + R * 0.7], fill=(255, 248, 232, int(70 * shimmer)))
        fr.merge(img)
    return L


def gojo_hand_insert(fr, L, x, y, rot, size=1.0, spread=0.0, curl=0.0, blood=True):
    """Gojo's right hand in insert coords of `L` (palm centre at (x, y)), index
    and middle fingers extended (rot = degrees, 0 = fingers up)."""
    px, py = L.p(x, y)
    H = inserts.Local(fr, px / fr.W, py / fr.H, L.s * 0.55 * size, rot, 1)
    skin = GOJO.skin
    dark = shade(skin, 0.78)
    H.poly([(-0.42, 0.9), (0.32, 0.9), (0.44, 2.4), (-0.6, 2.4)], GOJO.suit)
    H.poly([(-0.36, 0.04), (0.26, 0.0), (0.34, 0.5), (0.12, 0.96), (-0.34, 0.96), (-0.44, 0.45)], skin)
    H.poly([(-0.36, 0.04), (-0.44, 0.45), (-0.34, 0.96), (-0.22, 0.5)], dark)
    H.ell(0.22, 0.16, 0.13, 0.1, fill=dark)
    H.ell(0.24, 0.36, 0.12, 0.09, fill=dark)

    def finger(base, tip, w, col):
        bx, by = base
        tx, ty = tip
        dx, dy = tx - bx, ty - by
        Ln = math.hypot(dx, dy) or 1e-6
        nx, ny = -dy / Ln * w / 2, dx / Ln * w / 2
        H.poly([(bx + nx, by + ny), (tx + nx * 0.85, ty + ny * 0.85), (tx - nx * 0.85, ty - ny * 0.85), (bx - nx, by - ny)],
               col)
        H.ell(tx, ty, w * 0.43, w * 0.43, fill=col)
    c = clamp(curl)
    idx_tip = (lerp(-0.22 - 0.1 * spread, -0.18, c), lerp(-0.92, -0.35, c))
    mid_tip = (lerp(0.04 + 0.1 * spread, 0.02, c), lerp(-1.02, -0.4, c))
    finger((-0.2, 0.06), idx_tip, 0.16, shade(skin, 0.92))
    finger((0.03, 0.04), mid_tip, 0.165, skin)
    H.poly([(-0.4, 0.42), (-0.12, 0.2), (0.18, 0.26), (0.16, 0.36), (-0.1, 0.36), (-0.36, 0.56)], skin)
    if blood:
        # Thragg's blood to the wrist (Seq 6), drying dark in streaks
        bc = (132, 34, 40)
        H.poly([(-0.36, 0.62), (0.3, 0.56), (0.24, 0.72), (0.12, 0.96), (-0.34, 0.96)], mix_color(skin, bc, 0.7))
        H.line([(-0.12, 0.08), (-0.16, 0.5)], bc, 0.045)
        H.line([(0.08, 0.06), (0.12, 0.36)], bc, 0.035)
        H.line([(-0.3, 0.98), (0.2, 0.96)], (96, 18, 26), 0.06)
    return H.p(*lerp(idx_tip, mid_tip, 0.5))


# =============================================================================
# S7-01  EWS: the city returns; burnout - both simply drop
# =============================================================================

def s7_01(fr):
    t, dur = fr.t, fr.dur
    t15, t19, t28 = T(fr, 15), T(fr, 19), T(fr, 28)
    fr.cam = Cam(-2.0, kf(t, [(0, 8.0), (dur, 7.92)], "linear"), 26.0)
    C.stage(fr, SEQ, "street")
    shaft(fr, 4.0, -9.0, 5.0, 9.0, alpha=18)
    world_dust(fr, -40, 36, 0.4, 24, n=170, salt="dust01", size_px=1.3, alpha=150)
    embers(fr, t, T(fr, 8), n=70)
    # ---- Thragg: the Blue pin is gone; drops heavy and crooked onto one knee (f15)
    tq = t if t < t15 + T(fr, 4) else on2(fr)
    p0 = (1.12, 1.72)
    pg = ground_pelvis(THRAGG, T_KNEEL, -1)
    if tq < t15:
        u = fall_u(tq, 0.0, t15)
        pose = pose_at(u, [(0, P(T_FALLING, lean=30)), (0.7, P(T_FALLING, lean=34, th_n=60, sh_n=-6)),
                           (1.0, P(T_KNEEL, lean=36, neck=34), "in")])
        J = thragg(fr, pose, lerp(p0[0], 1.0, u), lerp(p0[1], pg, u))
    else:
        k = seg(tq, t15, t15 + T(fr, 6), "out")
        k2 = seg(tq, t15 + T(fr, 4), t15 + T(fr, 10), "inout")
        heave = math.sin((tq - t15) * math.tau / 0.9)
        base = pose_at(k, [(0, P(T_KNEEL, lean=40, neck=36)), (1, P(T_KNEEL, lean=36, neck=26))])
        base = pose_at(k2, [(0, base), (1, P(T_KNEEL_HAND, lean=58 + 2 * heave, neck=22))])
        pel = solve(THRAGG, base, 1.0, None, -1)["pelvis"]
        pose = reach(THRAGG, P(base, hand_f="open"), pel[0], pel[1], -1, "f", (0.6, lerp(0.4, 0.04, k2)))
        J = thragg(fr, pose, 1.0, None)
        fx.dust_cloud(fr, 0.85, 0.05, t - t15, r=1.1, n=10, alpha=95, salt="p15", rise=0.4)
    # ---- Gojo: falls like anyone else, lands f19, skids east to x=-6.6 by f28
    if t < t19:
        u = fall_u(t, 0.0, t19)
        feet = 3.0 * (1 - u)
        pose = pose_at(u, [(0, G_FALL), (0.75, P(G_FALL, th_n=26, sh_n=4)), (1.0, G_LAND, "in")])
        gojo(fr, pose, -7.0, feet + soles_offset(GOJO, pose), blindfold_lift=1.0)
    else:
        tq = t if t < t28 else on2(fr)
        gx = kf(tq, [(t19, -7.0), (t28, -6.6, "out")])
        pose = pose_at(tq, [(t19, G_LAND), (t19 + T(fr, 5), G_CATCH, "out"), (t28 + T(fr, 4), G_HALF)])
        gojo(fr, pose, gx, None, blindfold_lift=1 - seg(t, t19, t19 + T(fr, 6)))
        fx.dust_cloud(fr, -6.9, 0.05, t - t19, r=0.9, n=9, alpha=90, salt="p19", rise=0.35)
    fr.vignette = 0.4


# =============================================================================
# S7-02  MS from the asphalt: Gojo's shoes hit and skid - no Limitless
# =============================================================================

def s7_02(fr):
    t, dur = fr.t, fr.dur
    t8 = cue(fr, "footstep", 0, 8)
    t12 = cue(fr, "cloth", 0, 12)
    t17, t20 = T(fr, 17), T(fr, 20)
    cx = kf(t, [(0, -6.8), (t17, -6.66), (dur, -6.32, "inout")])
    cy = kf(t, [(0, 0.55), (t17, 0.62), (dur, 1.42, "inout")])
    zoom = zkf(t, [(0, 240.0), (t17, 270.0), (dur, 500.0, "inout")])
    fr.cam = Cam(cx, cy, zoom)
    C.stage(fr, SEQ, "street")
    world_dust(fr, -12, -2, 0.1, 5, n=60, salt="dust02", size_px=1.8, alpha=130)
    # on 1s for the drop and the skid, 2s for the settle
    tq = t if t < t17 else on2(fr)
    if tq < t8:
        # already falling fast when he enters the frame from above
        ta = 0.75
        u = ((tq + ta) ** 2 - ta ** 2) / ((t8 + ta) ** 2 - ta ** 2)
        feet = 3.0 * (1 - u)
        pose = pose_at(tq / t8, [(0, G_FALL), (0.8, P(G_FALL, th_n=24, sh_n=2)), (1.0, G_LAND, "in")])
        J = gojo(fr, pose, -7.0, feet + soles_offset(GOJO, pose), blindfold_lift=1.0)
    else:
        gx = kf(tq, [(t8, -7.0), (t17, -6.6, "out")])
        heave = math.sin((tq - t17) * math.tau / 0.55) if tq > t17 else 0.0
        half = P(G_HALF, lean=G_HALF["lean"] + 3 * heave, neck=-12 + 2 * heave)
        pose = pose_at(tq, [(t8, G_LAND), (t12, P(G_LAND, lean=40, neck=-24), "out"), (t12 + T(fr, 4), G_CATCH, "snap"),
                            (t20 + T(fr, 2), P(G_CATCH, ua_n=60, fa_n=80)), (t20 + T(fr, 6), half)])
        J = gojo(fr, pose, gx, None, blindfold_lift=1 - seg(t, t8, t8 + T(fr, 8)))
        # skid: grit spitting east off the soles, two scrape marks on the asphalt
        if t < t17 + T(fr, 4):
            fx.dust_cloud(fr, gx + 0.15, 0.02, t - t8, r=0.45, n=8, alpha=80, salt="skid", rise=0.2)
            fx.debris(fr, -6.95, 0.03, t - t8, n=14, speed=2.6, spread=0.9, angle=math.radians(25),
                      size=(0.008, 0.02), color=(70, 66, 70), salt="grit02", ground=0.0)
        fr.line([(-7.05, 0.004), (gx - 0.05, 0.004)], (22, 20, 24), width_m=0.012)
        fr.line([(-7.0, -0.012), (gx + 0.02, -0.012)], (22, 20, 24), width_m=0.01)
    fr.vignette = 0.42


# =============================================================================
# S7-03  MS low: Thragg crashes onto one knee - one-armed, flayed, bleeding
# =============================================================================

def thragg_froth(fr, J, t, k=1.0):
    """Frothy blood bubbling at the mouth with each wet breath (ruptured lung)."""
    mx, my = head_at(J, THRAGG, 0.86, -0.62)
    s = J["scale"]
    rng = fr.srng("froth")
    for i in range(5):
        ph = (t * rng.uniform(0.9, 1.4) + rng.random()) % 1.0
        r = 0.006 * s * (0.4 + 1.4 * ph) * k
        if ph > 0.9:
            continue
        fr.circle(mx + rng.uniform(-0.02, 0.02), my + rng.uniform(-0.015, 0.01), r, fill=(214, 150, 158))
    fr.line([(mx, my), (mx + 0.005, my - 0.06 * s)], (170, 30, 40), width_m=0.012 * s)


def s7_03(fr):
    t, dur = fr.t, fr.dur
    t6 = cue(fr, "punch_light", 0, 6)
    t9 = T(fr, 9)
    fr.cam = Cam(0.82, 0.74, 380.0)
    C.stage(fr, SEQ, "street")
    world_dust(fr, -3, 5, 0.1, 4, n=50, salt="dust03", size_px=1.8, alpha=120)
    pg = ground_pelvis(THRAGG, T_KNEEL, -1)
    tq = t if t < t9 else on2(fr)
    if tq < t6:
        u = fall_u(tq, -0.25, t6)
        u0 = fall_u(0, -0.25, t6)
        u = (u - u0) / (1 - u0)
        pose = pose_at(u, [(0, P(T_FALLING, lean=32, neck=20)), (0.6, P(T_FALLING, lean=34, th_n=64, sh_n=-4)),
                           (1.0, P(T_KNEEL, lean=38, neck=34), "in")])
        J = thragg(fr, pose, 1.0, pg + 1.25 * (1 - u))
    else:
        k = seg(tq, t6, t9, "out")
        heave = math.sin((tq - t6) * math.tau / 0.85)
        lift = seg(tq, t9, dur, "inout")
        base = pose_at(k, [(0, P(T_KNEEL, lean=42, neck=38)),
                           (1, P(T_KNEEL_HAND, lean=58 + 2.2 * heave, neck=26 - 12 * lift + 1.5 * heave))])
        # the only hand slaps down flat at x=+0.6 (f6-9) and trembles there
        pel = solve(THRAGG, base, 1.0, None, -1)["pelvis"]
        trem = 0.0 if tq < t9 else 0.011 * (1 if (fr.f // 2) % 2 else -1)
        hx = lerp(0.68, 0.6, k) + trem
        hy = lerp(0.45, 0.04, k)
        pose = reach(THRAGG, P(base, hand_f="open"), pel[0], pel[1], -1, "f", (hx, hy))
        J = thragg(fr, pose, 1.0, None)
        kx = J["kn_f"][0]
        if t < t6 + T(fr, 10):
            fx.impact(fr, kx, 0.02, t - t6, kind="light", salt="knee03")
        fx.cracks(fr, kx, 0.0, 0.5 * seg(t, t6, t6 + T(fr, 2), "out") + 0.01, n=6, salt="kc03", width=0.02)
        fx.dust_cloud(fr, kx, 0.02, t - t6, r=0.55, n=10, alpha=100, salt="kd03", rise=0.3)
        thragg_froth(fr, J, t)
    fr.vignette = 0.42


# =============================================================================
# S7-04  CU: the hand rises to the temple, stops, lowers. He'll finish it by hand.
# =============================================================================

def s7_04(fr):
    t, dur = fr.t, fr.dur
    t9 = cue(fr, "cloth", 0, 9)
    t21 = cue(fr, "cloth", 1, 21)
    t8, t14, t16, t20, t26 = T(fr, 8), T(fr, 14), T(fr, 16), T(fr, 20), T(fr, 26)
    tq = on2(fr)                                        # Gojo on 2s
    plate(fr, Cam(-9.0, 2.6, 120.0), blur=7.0, dim=0.08)
    fr.cam = Cam(-6.5, 1.7, 520.0 * (1 + 0.03 * seg(t, t14, dur)))
    shaft(fr, -5.0, -7.6, 0.6, 1.4, y_top=6.0, alpha=34)
    specks(fr, t, n=46, salt="mote04", size=(0.0015, 0.004), alpha=170)
    push = 1 + 0.03 * seg(t, t14, dur, "inout")
    rise = seg(tq, 0.0, t8, "out")
    cu = 0.5 + (0.39 - 0.5) * push
    cv = 0.5 + (0.53 + 0.32 * (1 - rise) - 0.5) * push
    s = 0.8 * push
    inj = gopts(fr)["injuries"]
    lid = 0.25 + 0.55 * seg(tq, t16, t20 + T(fr, 2), "inout")
    flare = pulse(tq, 0.0, T(fr, 3), T(fr, 6)) + 0.6 * pulse(tq, T(fr, 22), T(fr, 3), T(fr, 6))
    L = gojo_cu(fr, cu, cv, s, inj, lid=lid, gaze=(0.7, 0.05), flare=flare)
    # the right hand: rises and flexes (nothing happens - no hum, no ripple),
    # drifts to the temple with two fingers out, stops short, lowers decisively
    if t8 <= tq < t26 + T(fr, 2):
        hx = kf(tq, [(t8, -0.95), (t14, -0.86), (t20, -0.66), (t21, -0.68), (t26, -1.0, "in")])
        hy = kf(tq, [(t8, 1.75), (t14, 0.62, "out"), (t20, 0.12), (t21, 0.16), (t26, 1.9, "in")])
        rot = kf(tq, [(t8, 10.0), (t14, 18.0), (t20, 34.0), (t26, 20.0)])
        flex = 0.5 + 0.5 * math.sin((tq - t8) * 22) if tq < t14 else 0.0
        gojo_hand_insert(fr, L, hx, hy, rot, size=1.05, spread=0.35 * flex, curl=0.45 * flex)
    fr.vignette = 0.5


# =============================================================================
# S7-05  WS: the walk in; Thragg claws the asphalt and cannot rise
# =============================================================================

TH_F, TH_R = 19.0, -17.0          # thigh angles at heel strike (front) / toe-off (rear)


def _walk_legs(phi, amp=1.0):
    """(stance thigh, stance shin, swing thigh, swing shin) at step phase phi 0..1."""
    tf, tr = TH_F * amp, TH_R * amp
    th_a = lerp(tf, tr, phi)
    sh_a = th_a - lerp(4, 16, phi) * amp
    sm = EASE["smooth"](phi)
    th_b = lerp(tr, tf, sm)
    sh_b = th_b - lerp(16, 4, phi) * amp - 42 * amp * math.sin(math.pi * phi)
    return th_a, sh_a, th_b, sh_b


def _leg_dx(st, th, sh):
    return st.thigh * math.sin(math.radians(th)) + st.shin * math.sin(math.radians(sh))


def walk(st, t, contacts, x_first, base, facing=1, amp=1.0):
    """Pose + pelvis x for a planted-foot walk. contacts = times of heel strikes;
    x_first = pelvis x at the first contact. The stance foot never slides."""
    tf, tr = TH_F * amp, TH_R * amp
    step_len = _leg_dx(st, tf, tf - 4 * amp) - _leg_dx(st, tr, tr - 16 * amp)
    if len(contacts) > 1:
        period = (contacts[-1] - contacts[0]) / (len(contacts) - 1)
    else:
        period = 0.6
    k = math.floor((t - contacts[0]) / period)
    phi = (t - contacts[0]) / period - k
    th_a, sh_a, th_b, sh_b = _walk_legs(phi, amp)
    plant = x_first + _leg_dx(st, tf, tf - 4 * amp) * facing + k * step_len * facing
    x = plant - _leg_dx(st, th_a, sh_a) * facing
    near_stance = (k % 2 == 0)
    q = dict(base)
    if near_stance:
        q.update(th_n=th_a, sh_n=sh_a, th_f=th_b, sh_f=sh_b)
    else:
        q.update(th_f=th_a, sh_f=sh_a, th_n=th_b, sh_n=sh_b)
    swing = q["th_n"] - (q["th_f"])
    q["ua_n"] = base["ua_n"] - 0.45 * swing * amp
    q["fa_n"] = q["ua_n"] + 10
    q["ua_f"] = base["ua_f"] + 0.45 * swing * amp
    q["fa_f"] = q["ua_f"] + 12
    q["lean"] = base["lean"] + 1.5 * math.cos(phi * math.tau)
    return q, x


def s7_05(fr):
    t, dur = fr.t, fr.dur
    steps = [s["at"] / FPS for s in fr.shot.get("sfx", []) if s.get("cue") == "footstep"] or \
        [T(fr, 4), T(fr, 20), T(fr, 36), T(fr, 52)]
    t30, t44 = T(fr, 30), T(fr, 44)
    fr.cam = Cam(kf(t, [(0, -3.2), (dur, -1.7)], "linear"), 1.6, 75.0)
    C.stage(fr, SEQ, "street")
    shaft(fr, 6.0, -1.6, 2.2, 3.2, y_top=30, alpha=26)
    world_dust(fr, -14, 8, 0.2, 9, n=120, salt="dust05", size_px=1.5,
               alpha=int(110 + 60 * seg(t, T(fr, 20), dur)))
    # ---- Thragg (screen-right): tries to rise, slips, claws, head jerks
    tq = on2(fr)
    t_rise0, t_rise1, t_slip = T(fr, 10), T(fr, 20), T(fr, 24)
    jerk = pulse(t, T(fr, 44), T(fr, 2), T(fr, 4)) + pulse(t, T(fr, 56), T(fr, 2), T(fr, 3))
    tt = t if (T(fr, 20) <= t < T(fr, 30) or jerk > 0) else tq    # 1s for the slip and the jerks
    kneel = P(T_KNEEL_HAND, neck=8)
    base = pose_at(tt, [(0, kneel), (t_rise0, kneel), (t_rise1, T_RISE_TRY, "inout"),
                        (t_slip, T_SLIP, "snap"), (t30, kneel, "out")])
    base = P(base, neck=base["neck"] - 34 * jerk, lean=base["lean"] - 6 * jerk)
    pel = solve(THRAGG, base, 1.0, None, -1)["pelvis"]
    drag = seg(tq, t30, t44, "inout")
    hand = (lerp(0.6, 0.4, drag), 0.04 if (tq < t_rise0 + T(fr, 4) or tq >= T(fr, 26)) else 0.5)
    pose = reach(THRAGG, P(base, hand_f="claw"), pel[0], pel[1], -1, "f", hand)
    grooves(fr, 0.6, 0.4, drag)
    thragg(fr, pose, 1.0, None)
    if T(fr, 30) <= t < T(fr, 46):
        fx.debris(fr, hand[0] + 0.05, 0.03, t - T(fr, 30), n=8, speed=1.2, spread=1.4, angle=math.radians(60),
                  size=(0.012, 0.03), color=(60, 56, 60), salt="claw05", ground=0.0)
    # ---- Gojo: four measured strides east, x -6.5 -> -3.9
    tg = on2(fr)
    base_g = P(G_WALK, ua_n=2, fa_n=6, hand_n="open", hand_f="open")
    x_first = -6.5 + 0.15
    q, gx = walk(GOJO, tg, steps, x_first, base_g, amp=0.93)
    gojo(fr, q, gx, None)
    fr.vignette = 0.4



def impact_scaled(fr, x, y, t, kind="heavy", k=0.35, salt="imp", dirx=1.0):
    """fx.impact drawn at k x its size around (x, y) (for tight shots, where a
    tier's metre-sized star would bury the contact)."""
    c = fr.cam
    fr.cam = Cam(x - (x - c.x) / k, y - (y - c.y) / k, c.zoom * k, c.rot, c.shake)
    try:
        fx.impact(fr, x, y, t, kind=kind, salt=salt, dirx=dirx)
    finally:
        fr.cam = c


# =============================================================================
# the push-off fragments: one real-time clock across S7-12 .. S7-16
# =============================================================================
GRAV = 9.8
GOJO_LINE = (-6.0, 0.05, 1.98)          # x, y0, y1 of Gojo's body at the west corner
_FRAGS = None


def frag_list():
    """Concrete fragments burst up by Thragg's push-off (S7-12 f9). Hero
    fragments are aimed to be passing beside Gojo's jaw, eye, neck, head and
    leg just as Infinity resumes (S7-14 f16): from there each decelerates on a
    Zeno curve toward its rest point and hangs, jittering. The rest fly on."""
    global _FRAGS
    if _FRAGS is not None:
        return _FRAGS
    rng = random.Random("s7frags")
    tau_inf = INF_BACK_REAL - PUSH_OFF_REAL
    out = []
    heroes = [((-5.79, 1.70), (-5.957, 1.752), 0.012),    # beside his cheek, in the gap (S7-14's hero)
              ((-5.80, 1.80), (-5.962, 1.79), 0.006),     # grit in the gap at the eye line
              ((-5.75, 1.62), (-5.93, 1.69), 0.016),      # by the jaw
              ((-5.72, 1.86), (-5.925, 1.91), 0.011),     # above the knuckles' line
              ((-5.78, 1.46), (-5.88, 1.47), 0.04),       # by the neck
              ((-5.74, 2.0), (-5.86, 1.98), 0.03),        # by the crown
              ((-5.70, 0.80), (-5.86, 0.78), 0.035),      # by the knee
              ((-5.76, 1.30), (-5.9, 1.33), 0.022)]       # at the collarbone
    for (pi, rest, sz) in heroes:
        x0, y0 = -3.3 + rng.uniform(-0.12, 0.08), 0.06
        vx = (pi[0] - x0) / tau_inf
        vy = (pi[1] - y0 + 0.5 * GRAV * tau_inf ** 2) / tau_inf
        out.append(dict(x0=x0, y0=y0, vx=vx, vy=vy, s=sz, a0=rng.uniform(0, 6.3), spin=rng.uniform(-14, 14),
                        hero=True, rest=rest, shade=rng.uniform(0.7, 1.15)))
    for i in range(30):
        x0, y0 = -3.3 + rng.uniform(-0.35, 0.3), 0.04
        vx, vy = rng.uniform(-6.0, -0.4), rng.uniform(1.6, 6.8)
        out.append(dict(x0=x0, y0=y0, vx=vx, vy=vy, s=rng.uniform(0.015, 0.07), a0=rng.uniform(0, 6.3),
                        spin=rng.uniform(-16, 16), hero=False, rest=None, shade=rng.uniform(0.7, 1.15)))
    _FRAGS = out
    return out


def _free(fg, tau):
    x = fg["x0"] + fg["vx"] * tau
    y = fg["y0"] + fg["vy"] * tau - 0.5 * GRAV * tau * tau
    return x, max(y, fg["s"] * 0.5)


def _dist_gojo(x, y):
    gx, y0, y1 = GOJO_LINE
    dy = 0.0 if y0 <= y <= y1 else min(abs(y - y0), abs(y - y1))
    return math.hypot(x - gx, dy)


def frag_pos(fg, tau, infinity_on=True, zone=0.42, r_min=0.11, rate=55.0):
    """Position, rotation and 'stalled' factor of a fragment at real-time
    clock tau (s since the push-off). With Infinity on (from S7-14 f16) a
    fragment that comes within `zone` of Gojo decelerates on a Zeno curve
    and never arrives; the far ones keep their arcs."""
    tau_inf = INF_BACK_REAL - PUSH_OFF_REAL
    ang = fg["a0"] + fg["spin"] * tau
    if not infinity_on or tau <= tau_inf:
        x, y = _free(fg, tau)
        return x, y, ang, 0.0
    if fg["rest"] is not None:
        x0, y0 = _free(fg, tau_inf)
        vx, vy = fg["vx"], fg["vy"] - GRAV * tau_inf
        rx, ry = fg["rest"]
        dist = math.hypot(rx - x0, ry - y0) or 1e-6
        r = min(rate, math.hypot(vx, vy) / dist)
        k = 1 - math.exp(-r * (tau - tau_inf))
        ang = fg["a0"] + fg["spin"] * (tau_inf + k / r)
        return x0 + (rx - x0) * k, y0 + (ry - y0) * k, ang, k
    t_in = None
    tt = tau_inf
    while tt <= tau + 1e-9:
        x, y = _free(fg, tt)
        if _dist_gojo(x, y) < zone and fg["vx"] < 0:
            t_in = tt
            break
        tt += 0.004
    if t_in is None:
        x, y = _free(fg, tau)
        return x, y, ang, 0.0
    x0, y0 = _free(fg, t_in)
    vx, vy = fg["vx"], fg["vy"] - GRAV * t_in
    sp = math.hypot(vx, vy) or 1e-6
    ux, uy = vx / sp, vy / sp
    d0 = _dist_gojo(x0, y0)
    travel = max(0.0, d0 - r_min) * 0.9
    r = min(rate, sp / max(travel, 1e-3))
    k = 1 - math.exp(-r * (tau - t_in))
    x, y = x0 + ux * travel * k, y0 + uy * travel * k
    ang = fg["a0"] + fg["spin"] * (t_in + k / r)
    return x, y, ang, k


def draw_frag(fr, x, y, ang, size, col_k=1.0, d=1.0, jitter=0.0, salt=0):
    if jitter > 0:
        jr = random.Random(f"fj{salt}:{fr.f}")
        x += jr.uniform(-jitter, jitter)
        y += jr.uniform(-jitter, jitter)
    pts = []
    for k in range(5):
        a = ang + k * math.tau / 5 + (0.3 if k % 2 else 0.0)
        rr = size * (1.0 if k % 2 == 0 else 0.62)
        pts.append((x + math.cos(a) * rr, y + math.sin(a) * rr * 0.8))
    fr.poly(pts, shade(PAL["concrete"], 0.78 * col_k), d=d)
    fr.line(pts[:2], shade(PAL["rim_warm"], 0.8 * col_k), width_px=1.2, d=d)


def draw_frags(fr, tau, infinity_on=False, d=1.0, size_k=1.0, only=None, jitter_px=1.2):
    """All push-off fragments at clock tau (world, d=1). Returns positions."""
    if tau < 0:
        return []
    out = []
    jit = jitter_px / max(1.0, fr.cam.zoom)
    for i, fg in enumerate(frag_list()):
        if only == "hero" and not fg["hero"]:
            continue
        x, y, ang, k = frag_pos(fg, tau, infinity_on)
        draw_frag(fr, x, y, ang, fg["s"] * size_k, fg["shade"], d=d, jitter=jit if k > 0.9 else 0.0, salt=i)
        out.append((x, y, k, fg))
    return out


def frag_clock(fr):
    return real_time(fr) - PUSH_OFF_REAL


# =============================================================================
# S7-06  OTS over Thragg's left shoulder: doubled sight converges; fingers dig in
# =============================================================================
FG_D = 0.3                       # Thragg's foreground plane (OTS; 4.5 m from Gojo, camera 1.2 m behind him)


def thragg_eye_fg(fr, J, d, t, blown=1.0, stars=0.0, tears=1.0, scale=0.3):
    """An enlarged, swimming left eye on the foreground rig head: blown pupil,
    blood tears, void starlight after-images flickering in the iris only."""
    prev = fr.depth
    fr.depth = d
    r = THRAGG.head_r * J["scale"]
    ex, ey = head_at(J, THRAGG, 0.74, 0.14)
    rx, ry = r * scale, r * scale * 0.52
    fr.ellipse(ex, ey, rx, ry, fill=(214, 190, 188))
    for k in range(4):
        a = k * 0.8 + 0.4
        fr.line([(ex - rx * 0.9 * math.cos(a), ey + ry * 0.5 * math.sin(a)), (ex - rx * 0.4, ey)], (190, 60, 70),
                width_px=1)
    sw = 0.12 * rx * math.sin(t * 11)
    ir = ry * 0.95
    fr.circle(ex - rx * 0.25 + sw, ey, ir, fill=(70, 44, 32))
    fr.circle(ex - rx * 0.25 + sw, ey, ir * (0.45 + 0.4 * blown), fill=(8, 6, 8))
    if stars > 0:
        rng = random.Random(f"st{fr.f}")
        for i in range(9):
            a, rr = rng.uniform(0, math.tau), rng.uniform(0.1, 0.9) * ir
            fr.circle(ex - rx * 0.25 + sw + math.cos(a) * rr, ey + math.sin(a) * rr, ir * 0.09,
                      fill=mix_color((150, 200, 255), (255, 255, 255), rng.random()))
        fr.glow_circle(ex - rx * 0.25 + sw, ey, ir * 1.4, shade((90, 140, 255), 0.7 * stars))
    fr.circle(ex - rx * 0.45, ey + ry * 0.3, ir * 0.18, fill=(255, 255, 255))
    if tears > 0:
        fr.line([(ex - rx * 0.9, ey - ry * 0.2), (ex - rx * 0.95, ey - ry * 0.2 - r * 0.9 * tears)], (150, 8, 18),
                width_m=r * 0.07)
        fr.line([(ex + rx * 0.8, ey - ry * 0.3), (ex + rx * 0.9, ey - ry * 0.3 - r * 0.6 * tears)], (140, 8, 16),
                width_m=r * 0.05)
    fr.line([(ex - rx, ey + ry * 0.2), (ex, ey + ry * 1.25), (ex + rx, ey + ry * 0.5)], (60, 40, 40), width_m=r * 0.06)
    fr.depth = prev


def s7_06(fr):
    t, dur = fr.t, fr.dur
    t14, t18, t30, t34, t38 = T(fr, 14), T(fr, 18), T(fr, 30), T(fr, 34), T(fr, 38)
    t20 = cue(fr, "footstep", 0, 20)
    fr.cam = Cam(-1.6, 0.8, 160.0)
    # ---- background plane: the street and Gojo walking in (doubled sight)
    C.stage(fr, SEQ, "street")
    world_dust(fr, -8, 3, 0.2, 5, n=70, salt="dust06", size_px=1.6, alpha=120)
    tq = on2(fr)
    period = T(fr, 40)
    q, gx = walk(GOJO, tq, [t20 - period, t20], -4.11, P(G_WALK, hand_n="open", hand_f="open"), amp=0.62)
    layer, _ = capture(fr, lambda: gojo(fr, q, gx, None))
    sep = 14.0 * (1 - seg(t, t14, t30, "inout"))
    if sep > 0.5:
        paste(fr, layer, alpha=0.62, offset=(-sep / 2, 0))
        paste(fr, layer, alpha=0.62, offset=(sep / 2, 0))
    else:
        paste(fr, layer)
    bake(fr)
    b_bg = kf(t, [(0, 7.0), (t14, 7.0), (t18, 0.0, "inout"), (t30, 0.0), (t34, 5.0, "inout")])
    blur_frame(fr, b_bg)
    # ---- foreground: Thragg's head, torn ear, stump; his planted hand
    b_fg = kf(t, [(0, 0.0), (t14, 0.0), (t18, 6.0, "inout"), (t30, 6.0), (t34, 1.2, "inout")])
    coil = seg(t, t38, dur, "in") if t >= t38 else 0.0           # 1s for the coil
    heave = math.sin(tq * math.tau / 0.85)
    base = P(T_KNEEL_HAND, lean=56 + 2 * heave, neck=-20 + 2 * heave)
    base = pose_at(coil, [(0, base), (1, P(T_COIL, neck=-26))])
    dxh = solve(THRAGG, base, 0.0, None, -1)
    x_head = fr.cam.x + (0.8 * OUT_W - OUT_W / 2) * FG_D / fr.cam.zoom
    px = x_head - (dxh["head"][0] - dxh["pelvis"][0])
    pel = solve(THRAGG, base, px, None, -1)["pelvis"]
    sink = seg(t, t30, t34 + T(fr, 2), "out")
    trem = 0.0 if t >= t34 else 0.006 * (1 if (fr.f // 2) % 2 else -1)
    hand = (px - 0.5 + trem, 0.03 - 0.05 * sink)
    pose = reach(THRAGG, P(base, hand_f="claw"), pel[0], pel[1], -1, "f", hand)
    o = topts(fr)

    def fg():
        J = thragg(fr, pose, px, None, depth=FG_D, opts=o)
        stars = 1.0 if (T(fr, 4) <= t < T(fr, 6) or T(fr, 10) <= t < T(fr, 11) + 1e-6) else 0.0
        thragg_eye_fg(fr, J, FG_D, t, blown=1.0, stars=stars)
        # the fingers sink to the second knuckle: asphalt over the tips, crumbs
        if sink > 0:
            fr.rect(hand[0] - 0.13, -0.12, hand[0] + 0.1, 0.0, PAL["street"], d=FG_D)
            fr.line([(hand[0] - 0.12, 0.0), (hand[0] + 0.12, 0.0)], (18, 16, 20), width_m=0.012, d=FG_D)
            fx.debris(fr, hand[0], 0.01, t - t30, n=10, speed=0.9, spread=2.2, angle=math.radians(90),
                      size=(0.006, 0.016), color=(66, 62, 66), salt="crumb06", ground=0.0, d=FG_D)
        return J
    layer, J = capture(fr, fg)
    paste(fr, layer, blur=b_fg)
    fr.vignette = 0.5


# =============================================================================
# S7-07  WS knee height: the low lunge, a hand's breadth off, craters the asphalt
# =============================================================================

def s7_07(fr):
    t, dur = fr.t, fr.dur
    t2 = cue(fr, "accel_burst", 0, 2)
    t12 = cue(fr, "punch_heavy", 0, 12)
    t3, t5 = T(fr, 3), T(fr, 5)
    fr.cam = Cam(-1.5, 1.0, 95.0, shake=C.shake(t, t12, amp=13.0, dur=T(fr, 4)))
    C.stage(fr, SEQ, "street")
    world_dust(fr, -10, 7, 0.2, 7, n=90, salt="dust07", size_px=1.5, alpha=120)
    fist_crater(fr, FIST_CRATER_X, seg(t, t12, t12 + T(fr, 2), "out") if t >= t12 else 0.0)
    # ---- Gojo: standing where the walk left him; the reflexive weight shift comes late (2s)
    tq = on2(fr)
    gx = kf(tq, [(t12, -3.5), (t12 + T(fr, 6), -3.7, "out")])
    gpose = pose_at(tq, [(t12, P(G_STAND, lean=8, th_n=14, sh_n=4, th_f=-12, sh_f=-14)),
                         (t12 + T(fr, 4), G_BRACE, "out"), (dur, P(G_BRACE, lean=-4))])
    gojo(fr, gpose, gx, None)
    # ---- Thragg: compressed anticipation, the low ground-skimming lunge, CONTACT f12
    if t < t2:
        J = thragg(fr, P(T_COMPRESS, lean=58), 1.0, None)
    elif t < t12:
        u = (t - t2) / (t12 - t2)
        travel = EASE["snap"](clamp((t - t2) / (T(fr, 10))))
        bx = lerp(1.0, -2.5, travel)
        by = kf(t, [(t2, 0.55), (t5, 0.82), (t12, 0.62)])
        pose = pose_at(u, [(0, P(T_LUNGE, lean=62)), (0.25, T_LUNGE), (1.0, P(T_LUNGE, lean=70, neck=-30))])
        # the fist drives at Gojo's centre, lists low and north: into the asphalt
        fx_ = kf(t, [(t2, bx - 0.9), (t12, FIST_CRATER_X)])
        fy_ = kf(t, [(t2, 0.9), (t2 + 0.6 * (t12 - t2), 0.75), (t12, 0.02, "in")])
        pose = reach(THRAGG, pose, bx, by, -1, "f", (min(fx_, bx - 0.55), fy_))
        J = thragg(fr, pose, bx, by)
        if t3 <= t < t5 + 1e-6:          # the 2-frame smear
            fr.blur_dir = (-46.0, 0.0)
            fx.speed_lines(fr, 0.8, direction=(-1.0, 0.0), salt="s707")
        fx.trail(fr, [(lerp(1.0, bx, k / 6), by + 0.35) for k in range(7)], width_m=0.7, alpha=70)
        fx.dust_cloud(fr, 0.9, 0.05, t - t2, r=1.2, n=10, alpha=80, salt="launch07")
    else:
        hold = t < t12 + T(fr, 2)
        k = 0.0 if hold else seg(t, t12 + T(fr, 2), dur, "out")
        bx = lerp(-2.55, -2.6, k)
        base = pose_at(k, [(0, P(T_CRASH, lean=66, neck=-34)), (1, P(T_CRASH, lean=58, neck=-26))])
        pel = solve(THRAGG, base, bx, None, -1)["pelvis"]
        pose = reach(THRAGG, base, pel[0], pel[1], -1, "f", (FIST_CRATER_X, -0.06))
        J = thragg(fr, pose, bx, None)
        fx.dust_cloud(fr, 0.9, 0.05, t - t2, r=1.2, n=10, alpha=80, salt="launch07")
    if t >= t12:
        te = t - t12
        if te < 0.4:
            impact_scaled(fr, FIST_CRATER_X, 0.05, te, kind="heavy", k=0.3, salt="i07")
        fx.debris(fr, FIST_CRATER_X, 0.05, te, n=22, speed=8.0, spread=1.3, angle=math.radians(100),
                  size=(0.05, 0.22), color=(64, 60, 66), salt="slab07", g=9.8)
        # dagger shards rising past Gojo's head
        rng = fr.srng("dag07")
        for i in range(7):
            a = math.radians(rng.uniform(92, 112))
            sp = rng.uniform(9, 14)
            x, y = fx.ballistic((FIST_CRATER_X + rng.uniform(-0.1, 0.1), 0.1), (math.cos(a) * sp, math.sin(a) * sp), te)
            L = rng.uniform(0.18, 0.32)
            fr.poly([(x, y + L), (x - 0.035, y), (x + 0.035, y)], (36, 34, 40))
        fx.dust_cloud(fr, FIST_CRATER_X, 0.02, te, r=2.2, n=16, alpha=110, salt="ring07")
    fr.vignette = 0.42


# =============================================================================
# S7-08  ECU: the shard does not hang. It cuts his cheek.
# =============================================================================

def s7_08(fr):
    t, dur = fr.t, fr.dur
    t1 = cue(fr, "whoosh", 0, 1)
    t3 = cue(fr, "punch_light", 0, 3)
    t6, t8 = T(fr, 6), T(fr, 8)
    plate(fr, Cam(-6.0, 2.0, 160.0), blur=9.0, dim=0.06)
    fr.cam = Cam(-3.7, 1.85, 1100.0)
    # dust and grit of the spray drifting up past him
    specks(fr, t, n=60, salt="spray08", col=(120, 108, 100), drift=(0.0, -0.06), size=(0.002, 0.006), alpha=190)
    snap = seg(t, t3, t3 + T(fr, 3), "snap")
    rot = lerp(4.0, -3.0, snap)
    cu, cv, s = lerp(0.46, 0.43, snap), 0.5, 1.25
    inj = gopts(fr, switch=t3)["injuries"]
    cut = 0.0 if t < t3 else 0.35 + 0.65 * seg(t, t3, dur, "out")
    L = gojo_cu(fr, cu, cv, s, inj, lid=0.55, gaze=(0.8, 0.0), expr="strain" if t >= t3 else "serious", rot=rot,
                cut=cut)
    # the shard: lower screen-right -> across the far cheekbone -> on, no deceleration at all
    p_hit = L.p(0.43, -0.03)
    hu, hv = p_hit[0] / fr.W, p_hit[1] / fr.H
    k = (t + 1.0 / FPS) / (t3 + 1.0 / FPS)
    su, sv = lerp(0.98, hu, k), lerp(1.12, hv, k)
    if k < 1.9:
        tail = 0.26
        img, dr = fr.layer()
        a = math.atan2(hv - 1.12, hu - 0.98)
        tipx, tipy = su * fr.W, sv * fr.H
        bx, by = tipx - math.cos(a) * tail * fr.H, tipy - math.sin(a) * tail * fr.H
        nx, ny = -math.sin(a) * 0.012 * fr.H, math.cos(a) * 0.012 * fr.H
        dr.polygon([(bx + nx * 3, by + ny * 3), (tipx, tipy), (bx - nx * 3, by - ny * 3)], fill=(170, 165, 170, 80))
        sl = 0.11 * fr.H
        dr.polygon([(tipx - math.cos(a) * sl + nx * 1.6, tipy - math.sin(a) * sl + ny * 1.6), (tipx, tipy),
                    (tipx - math.cos(a) * sl - nx * 1.6, tipy - math.sin(a) * sl - ny * 1.6)], fill=(24, 22, 28, 255))
        dr.line([(tipx - math.cos(a) * sl + nx * 1.6, tipy - math.sin(a) * sl + ny * 1.6), (tipx, tipy)],
                fill=(200, 170, 140, 255), width=max(1, int(2 * fr.ss)))
        fr.merge(img)
    if t3 <= t < t3 + 1.0 / FPS:
        # the impact frame: no white-out, a hard line of light along the cut
        x0, y0 = L.p(0.3, 0.04)
        x1, y1 = L.p(0.56, -0.09)
        fr.glow.line([(x0, y0), (x1, y1)], fill=(255, 240, 220), width=max(1, int(5 * fr.ss)))
        fr.draw.line([(x0, y0), (x1, y1)], fill=(255, 250, 240), width=max(1, int(3 * fr.ss)))
    if t >= t8:
        # a single droplet flicks off into the dust
        te = t - t8
        dx, dy = L.p(0.5 + te * 0.9, -0.04 + te * 0.4 + 2.2 * te * te)
        fr.draw.ellipse([dx - 5 * fr.ss, dy - 6 * fr.ss, dx + 5 * fr.ss, dy + 6 * fr.ss], fill=(150, 10, 20))
    fr.vignette = 0.5


# =============================================================================
# S7-09  CU low angle: Thragg sees the blood. Gojo starts the repair; his nose bleeds.
# =============================================================================

def thragg_eyes_cu(fr, L, gaze, pupils=(0.85, 0.3), agree=0.0, t=0.0, tears=1.0):
    """Thragg's eyes over thragg_face (insert coords): unequal pupils (left
    blown, right pinned) that converge on one fixation as the lag drains out."""
    for j, ex in enumerate((0.34, -0.06)):
        L.ell(ex, -0.13, 0.11, 0.055, fill=(222, 206, 204))
        for v in range(3):
            L.line([(ex - 0.1, -0.13 + 0.02 * (v - 1)), (ex - 0.05, -0.13 + 0.01 * (v - 1))], (196, 70, 78), 0.004)
        lag = (1 - agree) * (0.25 if j else -0.2)
        gx, gy = gaze[0] + lag * math.sin(t * 6 + j), gaze[1] + lag * 0.4 * math.cos(t * 5 + j)
        ix, iy = ex + 0.045 * gx, -0.13 + 0.02 * gy
        L.ell(ix, iy, 0.04, 0.04, fill=(70, 44, 30))
        pr = 0.034 * (pupils[0] if j else pupils[1])
        L.ell(ix, iy, pr, pr, fill=(8, 6, 8))
        L.ell(ix - 0.012, iy - 0.014, 0.008, 0.007, fill=(255, 255, 255))
        L.line([(ex - 0.11, -0.13), (ex - 0.04, -0.19), (ex + 0.06, -0.19), (ex + 0.11, -0.14)], (60, 40, 40), 0.012)
        if tears > 0:
            L.line([(ex - 0.08, -0.1), (ex - 0.09, -0.1 + 0.26 * tears)], (150, 6, 16), 0.012)


def s7_09(fr):
    t, dur = fr.t, fr.dur
    t2, t4, t6, t24, t28 = T(fr, 2), T(fr, 4), T(fr, 6), T(fr, 24), T(fr, 28)
    t26 = cue(fr, "breath", 0, 26)
    t32, t44 = T(fr, 32), T(fr, 44)
    tq = on2(fr)
    # low angle: torn cloud deck, light shafts, the top of the mast pole
    plate(fr, Cam(-6.0, 9.0, 70.0), blur=6.0, dim=0.05)
    fr.cam = Cam(-3.1, 1.4, 330.0)
    specks(fr, t, n=36, salt="mote09", size=(0.0015, 0.004), alpha=150)
    b_g = kf(t, [(0, 0.0), (t2, 0.0), (t6, 5.0, "inout"), (t24, 5.0), (t28, 0.0, "inout")])
    b_t = kf(t, [(0, 7.0), (t2, 7.0), (t6, 0.0, "inout"), (t24, 0.0), (t28, 7.0, "inout")])
    # ---- Gojo, standing over him: sharp low-angle MCU, upper screen-left, looking down-right
    inj = gopts(fr, switch=t32)["injuries"]
    twitch = 1.0 if t26 <= t < t26 + T(fr, 2) else 0.0
    shimmer = 0.0 if t < t26 else 0.55 + 0.45 * math.sin((fr.f - 26) * math.tau / 4)
    nose = seg(tq, t32, t44, "linear") if t >= t32 else 0.0

    def g():
        L = gojo_cu(fr, 0.33, 0.37, 0.6, inj, lid=0.5, gaze=(0.55, 0.7), rot=13.0, cut=1.0, nose=nose,
                    shimmer=shimmer)
        if twitch:
            L.line([(-0.42, -0.24), (-0.34, -0.3)], shade(GOJO.skin, 0.7), 0.012)
        return L
    layer, _ = capture(fr, g)
    paste(fr, layer, blur=b_g)
    bake_glow(fr)
    # ---- Thragg: eye and cheek filling the soft lower right foreground, looking up-left
    look = kf(t, [(0, (0.6, 0.8)), (t4, (0.6, 0.8)), (T(fr, 8), (0.3, 1.0), "snap"), (T(fr, 14), (-0.8, -0.9), "inout")])
    agree = seg(t, T(fr, 10), T(fr, 20), "inout")
    ti = topts(fr)["injuries"]

    def th():
        inserts.thragg_face(fr, 0.8, 0.8, 1.1, expr="fury", injuries=[i for i in ti if i != "eye_blood"],
                            rot=-16.0, flip=-1)
        L = inserts.Local(fr, 0.8, 0.8, 1.1, -16.0, -1)
        thragg_eyes_cu(fr, L, look, agree=agree, t=t)
        # torn ear, blood from it
        L.poly([(-0.6, -0.22), (-0.5, -0.26), (-0.46, -0.06), (-0.5, 0.12), (-0.6, 0.06)], shade(THRAGG.skin, 0.85))
        L.poly([(-0.6, -0.22), (-0.52, -0.24), (-0.55, -0.12), (-0.62, -0.1)], (110, 16, 24))
        L.line([(-0.53, 0.08), (-0.54, 0.5), (-0.52, 0.7)], (150, 10, 20), 0.014)
    layer, _ = capture(fr, th)
    paste(fr, layer, blur=b_t)
    # ---- a drop of Gojo's blood flicks past the lens (f0-4)
    if t < t4 + 1.0 / FPS:
        k = t / t4
        u, v = lerp(0.46, 0.7, k), lerp(0.34, 0.95, k * k)
        img, dr = fr.layer()
        R = 0.035 * fr.H
        dr.ellipse([u * fr.W - R, v * fr.H - R * 1.3, u * fr.W + R, v * fr.H + R * 1.3], fill=(150, 12, 24, 210))
        fr.merge(img)
    fr.vignette = 0.5


# =============================================================================
# S7-10  MS: the rising straight at the temple; the reinforced forearm knocks it wide
# =============================================================================

def reinforce(fr, J, side="f", k=1.0, t=0.0):
    """Cursed-energy reinforcement: a thin DARK shimmer running along the
    sleeve (no aura, no glow)."""
    if k <= 0:
        return
    el, wr = J[f"el_{side}"], J[f"wr_{side}"]
    img, dr = fr.layer()
    for j in range(3):
        o = 0.012 * math.sin(t * 40 + j * 2)
        pts = [fr.P(lerp(el[0], wr[0], u) + o, lerp(el[1], wr[1], u) + o * 0.5) for u in (0.0, 0.35, 0.7, 1.0)]
        dr.line(pts, fill=(10, 8, 20, int(150 * k)), width=max(1, int(2.4 * fr.ss)))
    fr.merge(img)


def s7_10(fr):
    t, dur = fr.t, fr.dur
    t4 = cue(fr, "whoosh", 0, 4)
    t7 = cue(fr, "punch_heavy", 0, 7)
    t11 = cue(fr, "grab", 0, 11)
    t3, t5, t8, t13 = T(fr, 3), T(fr, 5), T(fr, 8), T(fr, 13)
    # 4-frame whip-tilt following the rise, then a locked profile two-shot
    cy = kf(t, [(0, 0.8), (T(fr, 4), 1.4, "out")])
    fr.cam = Cam(-3.3, cy, 230.0, shake=C.shake(t, t7, amp=9.0, dur=T(fr, 3)))
    if t < T(fr, 4):
        fr.blur_dir = (0.0, 26.0 * (1 - t / T(fr, 4)))
    C.stage(fr, SEQ, "street")
    fist_crater(fr)
    world_dust(fr, -6, -1, 0.2, 3.5, n=50, salt="dust10", size_px=1.8, alpha=110)
    # ---- Gojo: economical parry, forearm vertical, elbow tucked, a small step back
    gx = kf(t, [(0, -3.9), (t7 + T(fr, 2), -3.95)])
    gpose = pose_at(t, [(0, P(G_STAND, lean=4)), (t3, G_GUARD), (t7, G_PARRY, "snap"), (t13, G_LOCK, "inout")])
    G = gojo(fr, gpose, gx, None)
    reinforce(fr, G, "f", seg(t, t3, t5) * (1 - 0.3 * seg(t, t13, dur)), t)
    # ---- Thragg: hip-first rise out of the crouch, one arm, the stump swinging out
    tx = kf(t, [(0, -2.6), (t5, -2.75), (t8, -2.9, "out")])
    base = pose_at(t, [(0, P(T_UNCOIL, lean=50, neck=-24)), (t4, P(T_UNCOIL, lean=34, ua_n=60, fa_n=70), "inout"),
                       (t7, P(T_RISING, ua_n=70, fa_n=90), "snap"), (t13, P(T_GRIP, ua_n=40), "inout")])
    pel = solve(THRAGG, base, tx, None, -1)["pelvis"]
    head = (-3.85, 1.85)
    if t < t4:
        target = (tx - 0.45, 0.8)
        hand_kind = "fist"
    elif t < t7:
        u = (t - t4) / (t7 - t4)
        target = (lerp(tx - 0.5, -3.66, EASE["snap"](u)), lerp(1.1, 1.86, EASE["snap"](u)))
        hand_kind = "fist"
    elif t < t8 + 1e-6:
        target = (-3.7, 1.92)          # impact hold: wrist met forearm
        hand_kind = "fist"
    elif t < t11:
        u = (t - t8) / (t11 - t8)
        target = (lerp(-3.86, -3.66, u), lerp(2.04, 1.62, u))     # knocked wide past the ear, opens, clamps
        hand_kind = "open"
    else:
        target = (-3.64 + 0.006 * math.sin(fr.f * 2.1), 1.6)
        hand_kind = "claw"
    pose = reach(THRAGG, P(base, hand_f=hand_kind), pel[0], pel[1], -1, "f", target)
    J = thragg(fr, pose, tx, None)
    if t >= t7:
        if t - t7 < 0.35:
            impact_scaled(fr, -3.66, 1.9, t - t7, kind="heavy", k=0.14, salt="i10")
        fx.debris(fr, -3.66, 1.88, t - t7, n=14, speed=3.0, spread=2.4, angle=math.radians(110), size=(0.006, 0.02),
                  color=(90, 86, 90), salt="grit10", g=6.0)
    fr.vignette = 0.42


# =============================================================================
# S7-11  MCU low: Thragg tears the forearm off at the elbow
# =============================================================================

def severed_forearm(fr, J_t, t_since, d=1.0):
    """Gojo's torn-off left forearm in Thragg's grip (or falling from it)."""
    hx, hy = hand_pos(J_t, "f", 0.02)
    ang = math.radians(200 - 20 * clamp(t_since * 2))
    L = GOJO.forearm
    ex, ey = hx + math.cos(ang) * L * 0.45, hy + math.sin(ang) * L * 0.45
    wx, wy = hx - math.cos(ang) * L * 0.55, hy - math.sin(ang) * L * 0.55
    fr.line([(ex, ey), (wx, wy)], (236, 214, 200), width_m=GOJO.w_fa * 1.35)
    fr.line([(ex, ey), (wx, wy)], GOJO.suit, width_m=GOJO.w_fa)
    fr.circle(wx - math.cos(ang) * 0.04, wy - math.sin(ang) * 0.04, GOJO.fist * 0.9, fill=GOJO.skin)
    fr.circle(ex, ey, GOJO.w_fa * 0.5, fill=(150, 16, 26))
    fr.circle(hx, hy, THRAGG.fist * 0.95, fill=shade(THRAGG.accent, 0.8))


def s7_11(fr):
    t, dur = fr.t, fr.dur
    t2 = cue(fr, "grab", 0, 2)
    t9 = cue(fr, "punch_heavy", 0, 9)
    t16 = cue(fr, "footstep", 0, 16)
    t6, t14 = T(fr, 6), T(fr, 14)
    drift = (0.03 * math.sin(t * 3.1), 0.02 * math.sin(t * 2.3 + 1))
    zoom = zkf(t, [(0, 400.0), (t9, 390.0), (dur, 270.0, "out")])
    cxw = kf(t, [(0, -3.55), (t9, -3.6), (dur, -4.15, "out")])
    fr.cam = Cam(cxw + drift[0], 1.5 + drift[1], zoom, shake=C.shake(t, t9, amp=12.0, dur=T(fr, 3)))
    C.stage(fr, SEQ, "street")
    fist_crater(fr)
    world_dust(fr, -7, -1, 0.2, 3.5, n=50, salt="dust11", size_px=1.8, alpha=110)
    hold = t9 <= t < t9 + 1.0 / FPS            # 1-frame impact hold
    te = t - t9
    # ---- Gojo: pulls against the grip, then the recoil flings him west on his heels
    if t < t9:
        gx = kf(t, [(0, -3.9), (t6, -3.92), (t9, -3.97)])
        gpose = pose_at(t, [(0, G_LOCK), (t6, G_LOCK), (T(fr, 8), G_PULL, "inout")])
    else:
        gx = -3.97 if hold else kf(t, [(t9 + 1.0 / FPS, -3.97), (dur, -5.2, "out")])
        gpose = pose_at(t, [(t9, G_PULL), (T(fr, 11), G_RECOIL, "snap"), (dur, G_SKID, "inout")])
    G = gojo(fr, gpose, gx, None, switch=t9)
    shimmer = 0.55 + 0.45 * math.sin(fr.f * math.tau / 4)
    hx_, hy_ = head_at(G, GOJO, -0.4, 0.3)
    fr.glow_circle(hx_, hy_, 0.05, shade((255, 236, 205), 0.6 * shimmer))
    if t >= t9:
        stump_blood(fr, G, t, "f", n=5, salt="st11")
    # ---- Thragg: grip crushes, the whole hips twist, one arm
    tx = kf(t, [(0, -3.0), (t9, -2.95), (dur, -3.0)])
    base = pose_at(t, [(0, T_GRIP), (t6, P(T_GRIP, lean=6, th_n=36), "inout"), (t9, T_TEAR, "snap"),
                       (dur, T_HOLD, "out")])
    pel = solve(THRAGG, base, tx, None, -1)["pelvis"]
    if t < t9:
        tgt = (lerp(-3.5, -3.56, seg(t, t6, t9)), 1.6)
        pose = reach(THRAGG, P(base, hand_f="claw"), pel[0], pel[1], -1, "f", tgt)
        J = thragg(fr, pose, tx, None)
        # the sleeve folding in under the fingers
        fr.line([(tgt[0] - 0.05, tgt[1] + 0.05), (tgt[0] + 0.05, tgt[1] - 0.05)], (12, 12, 18), width_m=0.012)
    else:
        k = 0.0 if hold else seg(t, t9 + 1.0 / FPS, t14, "out")
        tgt = (lerp(-3.56, -3.32, k), lerp(1.6, 1.5, k))
        pose = reach(THRAGG, P(base, hand_f="fist"), pel[0], pel[1], -1, "f", tgt)
        J = thragg(fr, pose, tx, None)
        severed_forearm(fr, J, te)
        fx.blood(fr, -3.62, 1.6, te, n=16, dirx=-1.0, salt="spray11")
        fx.blood(fr, -3.62, 1.6, te, n=10, dirx=1.0, salt="spray11b")
    if hold:
        fr.invert = 0.0
        fr.flash = 0.12
    fr.vignette = 0.45


# =============================================================================
# S7-12  WS low: Thragg drops the arm and charges, no guard; Gojo's hand drops low
# =============================================================================

def falling_forearm(fr, x, y, ang):
    L = GOJO.forearm
    ex, ey = x + math.cos(ang) * L * 0.5, y + math.sin(ang) * L * 0.5
    wx, wy = x - math.cos(ang) * L * 0.5, y - math.sin(ang) * L * 0.5
    fr.line([(ex, ey), (wx, wy)], GOJO.suit, width_m=GOJO.w_fa)
    fr.circle(wx - math.cos(ang) * 0.04, wy - math.sin(ang) * 0.04, GOJO.fist * 0.9, fill=GOJO.skin)
    fr.circle(ex, ey, GOJO.w_fa * 0.5, fill=(150, 16, 26))


def s7_12(fr):
    t, dur = fr.t, fr.dur
    t7 = cue(fr, "footstep", 0, 7)
    t9 = cue(fr, "accel_burst", 0, 9)
    t3, t6, t8, t16 = T(fr, 3), T(fr, 6), T(fr, 8), T(fr, 16)
    fr.cam = Cam(-4.8, 1.3, 110.0 * (1 + 0.03 * fr.u))
    C.stage(fr, SEQ, "street")
    fist_crater(fr)
    world_dust(fr, -10, 1, 0.2, 6, n=80, salt="dust12", size_px=1.6, alpha=120)
    # ---- Gojo: the skid's last 0.8 m to the foot of the mast; heels catch (f7) and plant
    tq = t if t >= t8 else on2(fr)
    gx = kf(tq, [(0, -5.2), (t7, -6.0, "out")])
    gpose = pose_at(tq, [(0, G_SKID), (t7, P(G_SKID, lean=-6)), (t8, G_PLANT, "out")])
    G = gojo(fr, gpose, gx, None)
    stump_blood(fr, G, t, "f", n=4, salt="st12")
    # ---- Thragg: lets the forearm go, steps into the broken slab, drives off (f9)
    tau = frag_clock(fr)
    if t < t9:
        tx = kf(t, [(0, -3.0), (t3, -3.0), (t8, -3.2, "inout")])
        pose = pose_at(t, [(0, T_HOLD), (t3, P(T_STEP, ua_f=10, fa_f=20, hand_f="open")),
                           (t8, P(T_STEP, lean=26, th_n=70, sh_n=-6, th_f=-30, sh_f=-60), "in")])
        J = thragg(fr, pose, tx, None)
    else:
        u = (t - t9) / max(1e-6, dur - t9)
        tx = kf(t, [(t9, -3.2), (t16, -4.05, "snap"), (dur, -4.4)])
        ty = kf(t, [(t9, 0.0), (t16, 0.18), (dur, 0.2)])
        pose = pose_at(t, [(t9, P(T_DRAW, lean=30)), (t16, T_DRAW, "out"), (dur, T_DRIVE, "in")])
        sole = soles_offset(THRAGG, pose, -1)
        J = thragg(fr, pose, tx, ty + sole)
        open_flank(fr, J, k=seg(t, t16, dur), d=1.0)
    # the forearm, let go: still falling past his hip at the cut
    if t >= T(fr, 2):
        tf = t - T(fr, 2)
        falling_forearm(fr, -3.25 - 0.1 * tf, 1.2 - 0.5 * GRAV * 0.35 * tf * tf, math.radians(200 + 160 * tf))
    if t >= t9:
        fx.dust_cloud(fr, -3.3, 0.04, t - t9, r=1.4, n=12, alpha=100, salt="push12")
        fx.debris(fr, -3.3, 0.04, t - t9, n=8, speed=3.5, spread=1.6, angle=math.radians(95), size=(0.04, 0.12),
                  color=(64, 60, 66), salt="slab12")
    draw_frags(fr, tau)
    fr.vignette = 0.42



def slow_clock(fr):
    """Dust/smoke clock through the slow motion: S7-13 f0 on the global clock,
    then advancing at the story's real-time rate (~17x slower)."""
    start = 5184 / 24.0                      # S7-13 f0 (global seconds)
    return start + (real_time(fr) - REAL["S7-13"][0])


def place_local(fr, s, rot, flip, local_pt, world_pt):
    """(cu, cv) for an insert drawn with inserts.Local(fr, cu, cv, s, rot, flip)
    so that its local point `local_pt` lands on world point `world_pt`."""
    L = inserts.Local(fr, 0.0, 0.0, s, rot, flip)
    dx, dy = L.p(*local_pt)
    PX, PY = fr.P(*world_pt)
    return (PX - dx) / fr.W, (PY - dy) / fr.H


def ins_scale(fr, m_per_unit):
    """Insert scale s so that one local unit = m_per_unit metres at fr.cam.zoom."""
    return m_per_unit * fr.cam.zoom / (0.5 * OUT_H)


# =============================================================================
# S7-13  MWS from the asphalt, exact profile: THE slow motion begins
# =============================================================================

def thragg_tears_back(fr, J, k=1.0):
    """Blood tears streaming BACK off his eyes with the forward drive."""
    s = J["scale"]
    ex, ey = head_at(J, THRAGG, 0.72, 0.12)
    f = J["facing"]
    for j in range(2):
        fr.line([(ex, ey - 0.01 * j), (ex - f * 0.09 * k * s, ey + 0.02 - 0.02 * j), (ex - f * 0.17 * k * s, ey + 0.035)],
                (150, 8, 18), width_m=0.012 * s)


def s7_13(fr):
    t, dur = fr.t, fr.dur
    u = fr.f / fr.n
    tau = frag_clock(fr)
    sc = slow_clock(fr)
    fr.cam = Cam(-5.3, 1.25, zkf(t, [(0, 215.0), (dur, 228.0)]))
    C.stage(fr, SEQ, "street")
    fist_crater(fr)
    shaft(fr, -3.0, -6.4, 0.8, 1.6, y_top=12, alpha=24)
    world_dust(fr, -9, -1, 0.2, 4, n=90, salt="dust13", size_px=1.7, alpha=130, clock=sc)
    # ---- Gojo: upright, retreating no further; two fingers coming up and forward at his hip
    g = seg(t, 0.0, dur, "inout")
    gpose = pose_at(g, [(0, G_PLANT), (1, G_RISE_HAND)])
    G = gojo(fr, gpose, -6.0, None)
    stump_blood(fr, G, sc * 0.4, "f", n=5, salt="st13")
    # droplets from his nose drifting down through the shaft
    nx_, ny_ = head_at(G, GOJO, 0.95, -0.3)
    rng = fr.srng("nd13")
    for i in range(4):
        ph = (rng.random() + (sc - 216.0) * 0.6) % 1.0
        fr.circle(nx_ + 0.02 * i, ny_ - 0.15 - ph * 1.2, 0.011, fill=(150, 10, 20))
    # ---- Thragg: whole body behind the straight, rear toe off the ground, no guard
    bx = lerp(-4.4, -4.8, u)
    fist = (lerp(-4.72, -5.6, u), lerp(1.5, 1.78, EASE["out"](u)))
    base = pose_at(u, [(0, T_DRIVE), (0.5, P(T_STRAIGHT, lean=24)), (1, T_STRAIGHT)])
    sole = soles_offset(THRAGG, base, -1)
    pose, st = straight(THRAGG_W, P(base, hand_f="fist"), bx, 0.2 + sole, -1, "f", fist)
    J = thragg(fr, pose, bx, 0.2 + sole, style=st)
    open_flank(fr, J, k=1.0)
    thragg_tears_back(fr, J)
    fx.trail(fr, [(fist[0] + 0.5 - 0.08 * k, fist[1] - 0.01 * k) for k in range(7)], width_m=0.12, alpha=60)
    draw_frags(fr, tau)
    fr.vignette = 0.45


# =============================================================================
# S7-14  ECU 3/4: the repair completes; a fragment stops dead. Infinity is back.
# =============================================================================
EYE14 = (-6.0, 1.8)


def far_frags(fr, sc, n=14, salt="ff", d_rng=(2.2, 4.0), x_rng=(-7.6, -4.4), y_rng=(1.2, 2.6), size=(0.02, 0.06)):
    """Fragments further back, still tumbling in slow motion (contrast)."""
    rng = random.Random(f"s7{salt}")
    for i in range(n):
        d = rng.uniform(*d_rng)
        x0, y0 = rng.uniform(*x_rng), rng.uniform(*y_rng)
        vx, vy = rng.uniform(-0.5, 0.2), rng.uniform(-0.1, 0.25)
        tt = (sc - 216.0)
        draw_frag(fr, x0 + vx * tt, y0 + vy * tt, rng.uniform(0, 6) + rng.uniform(-3, 3) * tt, rng.uniform(*size),
                  0.8, d=d)


def s7_14(fr):
    t, dur = fr.t, fr.dur
    t14 = cue(fr, "rct_heal", 0, 14)
    t15, t16, t18 = T(fr, 15), T(fr, 16), T(fr, 18)
    tau = frag_clock(fr)
    sc = slow_clock(fr)
    K = 4200.0
    # background: the west corner behind his head, defocused; the light shaft behind him
    plate(fr, Cam(-8.0, 2.4, 260.0), blur=11.0, dim=0.1)
    fr.cam = Cam(-5.95, 1.8, K)
    img, dr = fr.layer()
    dr.polygon([(0.05 * fr.W, 0), (0.2 * fr.W, 0), (0.48 * fr.W, fr.H), (0.3 * fr.W, fr.H)], fill=(255, 196, 140, 34))
    fr.merge(img)
    layer, _ = capture(fr, lambda: far_frags(fr, sc, salt="ff14", x_rng=(-6.3, -5.5), y_rng=(1.65, 2.0),
                                             size=(0.008, 0.02)))
    paste(fr, layer, blur=4.0)
    # ---- Gojo's face, life-size at this lens; near eye on EYE14
    s = ins_scale(fr, 0.16)
    cu, cv = place_local(fr, s, 0.0, 1, (0.3, -0.15), EYE14)
    inj = gopts(fr)["injuries"]
    front = EYE14[0] + 0.035             # the front of his face (the gap is measured from here)
    xf = kf(t, [(0, front + 0.4), (t16, front + 0.1, "linear")]) if t < t16 else \
        front + 0.1 - 0.05 * (1 - math.exp(-5.0 * (t - t16)))
    reflect = clamp((front + 0.4 - xf) / 0.3 + 0.3)
    lid = 0.45 + 0.25 * seg(t, 0.0, t14, "inout")
    shimmer = 0.0 if t >= t15 else 0.55 + 0.45 * math.sin(fr.f * math.tau / 4)
    L = gojo_cu(fr, cu, cv, s, inj, lid=lid, gaze=(0.85, 0.0), cut=1.0, nose=1.0, shimmer=shimmer, reflect=reflect,
                glow=1.0)
    # the repair completes: a fresh pulse from the left nostril, droplets lifting slowly
    if t >= t14:
        te = (sc - slow_clock_at("S7-14", t14 * FPS))
        rng = fr.srng("spurt14")
        for i in range(7):
            vx, vy = rng.uniform(0.2, 0.9), rng.uniform(0.4, 1.4)
            px = 0.37 + vx * te * 1.6
            py = 0.24 - vy * te * 1.6 + 6.0 * te * te
            L.ell(px, py, 0.008, 0.009, fill=(160, 12, 22))
        L.ell(0.37, 0.228, 0.018, 0.014, fill=(150, 8, 18))
    # ---- the near fragments: one stops dead beside his cheek and jitters
    draw_frags(fr, tau, infinity_on=True, only="hero", jitter_px=2.0)
    # ---- Infinity resumes on its own: refraction in front of his face, strongest on the fist side
    if t >= t16:
        k = seg(t, t16, t16 + T(fr, 10), "out")
        fx.infinity(fr, -5.9, 1.8, r=0.1, strength=0.35 + 0.65 * k, t=t)
    # ---- the fist: a huge soft shape from screen-right, slowing from f16
    s_f = ins_scale(fr, 0.17)
    cuf, cvf = place_local(fr, s_f, -3.0, -1, (0.46, -0.02), (xf, 1.81))
    layer, _ = capture(fr, lambda: inserts.thragg_fist(fr, cuf, cvf, s_f, rot=-3.0, flip=-1))
    paste(fr, layer, blur=9.0)
    fr.vignette = 0.55


def slow_clock_at(sid, f):
    """slow_clock() value at frame f of shot sid."""
    a, b = REAL[sid]
    n = NOM[sid]
    for sh in C.shotlist()["shots"]:
        if sh["id"] == sid:
            n = sh["frames"]
            break
    return 5184 / 24.0 + (a + (b - a) * f / n - REAL["S7-13"][0])


# =============================================================================
# S7-15  ECU exact profile (the S2-02 composition), then the tilt down to the flank
# =============================================================================
FACE15 = -6.0                    # world x of the front of Gojo's face (the eye line)
EYE_Y = 1.8
K15_0, K15_1 = 3712.0, 1500.0    # insert scale (S2-02's face at s=1.1) -> the flank framing


def gap_shards(fr, x0, x1, y, t, salt="gs15", n=18, spread=0.03):
    """Grit and shards hanging in the gap and loosely around the knuckles:
    individual 1-2 px jitter, zero net drift (S2-02's grammar)."""
    rng = fr.srng(salt)
    for i in range(n):
        if i < 7:
            x = x0 + (x1 - x0) * rng.uniform(0.15, 0.85)
            yy = y + rng.uniform(-spread, spread)
        else:
            x = x1 + rng.uniform(0.0, 0.07)
            yy = y + rng.choice((-1, 1)) * rng.uniform(0.04, 0.11)
        jr = random.Random(f"{salt}{i}:{fr.f}")
        j = 1.4 / fr.cam.zoom
        x += jr.uniform(-j, j)
        yy += jr.uniform(-j, j)
        sz = rng.uniform(0.0015, 0.0045)
        a = rng.uniform(0, 6)
        fr.poly([(x + math.cos(a + k * 2.1) * sz, yy + math.sin(a + k * 2.1) * sz) for k in range(3)],
                shade(PAL["concrete"], rng.uniform(0.5, 0.9)))


def s7_15(fr):
    t, dur = fr.t, fr.dur
    t12 = cue(fr, "infinity_stop", 0, 12)
    t52 = cue(fr, "grab", 0, 52)
    t60 = cue(fr, "red_charge", 0, 60)
    t36, t48, t58 = T(fr, 36), T(fr, 48), T(fr, 58)
    tau = frag_clock(fr)
    sc = slow_clock(fr)
    m = seg(t, t36, t58, "inout")                              # the tilt/crane down the arm
    K = K15_0 * (K15_1 / K15_0) ** m
    push = 1 + 0.02 * seg(t, 0.0, t36)
    cx = lerp(-5.986, -5.42, m)
    cy = lerp(EYE_Y, 1.36, m)
    # background: defocused street, moving at parallax with the crane
    plate(fr, Cam(-6.6 + (cx + 6.0) * 0.4, 2.0 + (cy - EYE_Y) * 0.4, 380.0), blur=12.0, dim=0.12)
    fr.cam = Cam(cx, cy, K * push)
    # ---- the fist: covers the last centimetres, then crawls; the stall at f12 (no flash)
    if t < t12:
        xf = FACE15 + 0.01 + fx.zeno(0.04, t, rate=2.2 / max(t12, 1e-3) * 3)
        xf = lerp(FACE15 + 0.05, xf, clamp(t / t12) ** 0.35)
    else:
        xf = FACE15 + 0.01 + 0.0006 * math.exp(-4.0 * (t - t12))
    trem = 0.0006 * math.sin(t * 61) if t >= t12 else 0.0
    fist_pt = (xf + trem, EYE_Y)
    # ---- Thragg's body (rig), his arm reaching the fist; the shoulder bunches after the stall
    bunch = seg(t, t12, t36, "out")
    sh_target = (-5.29 - 0.03 * bunch, 1.63 + 0.01 * bunch)
    base = P(T_STALL, lean=22 + 4 * bunch)
    J0 = solve(THRAGG, base, 0.0, 0.0, -1)
    pel = (sh_target[0] - J0["sh_f"][0], sh_target[1] - J0["sh_f"][1])
    wrist = (fist_pt[0] + 0.12, fist_pt[1] - 0.005)
    pose = reach(THRAGG, P(base, hand_f="fist"), pel[0], pel[1], -1, "f", wrist, elbow="up")
    o = topts(fr)
    J = thragg(fr, pose, pel[0], pel[1], opts=o, style=replace(THRAGG_W, fist=0.02))
    entry = (0.6, 0.15)
    glow = 0.0 if t < t60 else 0.6 + 0.4 * random.Random(fr.f).random()
    open_flank(fr, J, k=1.0, entry=entry, glow=glow)
    wx, wy = torso_pt(J, *entry)
    # the forearm as one clean lit capsule into the insert fist
    el = J["el_f"]
    fr.line([el, wrist], THRAGG.suit, width_m=THRAGG.w_fa)
    fr.line([J["sh_f"], el], shade(THRAGG.suit, 0.9), width_m=THRAGG.w_ua)
    # ---- Gojo: body (rig) with the right arm sliding two fingers into the wound
    gpose = P(G_THRUST, lean=10)
    gJ0 = solve(GOJO, gpose, 0.0, None, 1)
    gpx = -6.083 - (gJ0["head"][0] - gJ0["pelvis"][0])
    gJ0 = solve(GOJO, gpose, gpx, None, 1)
    hand_t = kf(t, [(0, (-5.72, 0.98)), (t36, (-5.72, 0.98)), (t48, (wx - 0.12, wy - 0.05), "inout"),
                    (T(fr, 60), (wx - 0.035, wy - 0.01), "inout")])
    gpose = reach(GOJO, P(gpose, hand_n="sign"), gJ0["pelvis"][0], gJ0["pelvis"][1], 1, "n", hand_t)
    go = gopts(fr, profile=True)
    go.update(eyes="blindfold")         # (head is masked out: no eye glow)
    G = headless(fr, lambda: gojo(fr, gpose, gpx, None, opts=go), GOJO)
    if t >= t48:
        # the wound's near lip closes over the fingertips: they are inside
        k = seg(t, t48, T(fr, 60), "inout")
        fr.ellipse(wx + 0.01, wy, 0.03 + 0.012 * k, 0.05, fill=(150, 30, 36))
        fr.ellipse(wx + 0.012, wy, 0.018, 0.035, fill=(70, 4, 12))
    if t >= t60:
        fx.red_charge(fr, wx + 0.02, wy, t - t60, r=0.012, strength=0.8)
        fr.glow_circle(wx + 0.02, wy, 0.07, shade((200, 20, 30), 0.25 + 0.15 * glow))
    # ---- Gojo's face: the S2-02 key, eye bare, narrowed, blood under the nose
    s_g = ins_scale(fr, 0.16)
    cu, cv = place_local(fr, s_g, 0.0, 1, (0.52, -0.15), (FACE15, EYE_Y))
    inj = [i for i in gopts(fr)["injuries"] if i != "cheek_cut"]      # the cut is on his far cheek
    gojo_cu(fr, cu, cv, s_g, inj, lid=0.62, gaze=(0.9, 0.0), nose=1.0)
    # ---- the gap: hanging grit and fragments, refraction only in the gap, the air ripple at the knuckles
    gap_shards(fr, FACE15, xf, EYE_Y, t)
    draw_frags(fr, tau, infinity_on=True, only="hero", jitter_px=1.5)
    if t >= t12 - 2.0 / FPS:
        ts = max(0.0, t - t12)
        fx.infinity(fr, FACE15 + 0.006, EYE_Y, r=0.025, strength=0.9, t=t)
        if ts < 0.5:
            c = fr.cam
            fr.cam = Cam(c.x, c.y, c.zoom * 0.08, c.rot, c.shake)
            fx.impact(fr, xf, EYE_Y, ts, kind="blocked", dirx=-1.0)
            fr.cam = c
    s_f = ins_scale(fr, 0.128)
    cuf, cvf = place_local(fr, s_f, -4.0, -1, (0.46, -0.02), fist_pt)
    inserts.thragg_fist(fr, cuf, cvf, s_f, rot=-4.0, flip=-1)
    fr.vignette = 0.5


# =============================================================================
# S7-16  MS low profile: Red, inside the chest. Silence on the impact frame.
# =============================================================================
RED_DIR = (math.cos(math.radians(-30)), math.sin(math.radians(-30)))     # down and EAST, away from the lit city


def final_crater(fr, x, r, lit=1.0, d=1.0):
    """The new crater at the west corner, growing (deterministic, scale-stable)."""
    if r <= 0.05:
        return
    rng = random.Random("s7finalcrater")
    fr.ellipse(x, -0.05, r, r * 0.16, fill=shade(PAL["concrete"], lit * 0.72), d=d)
    fr.ellipse(x, -0.33 * (r / 8.0), r * 0.84, r * 0.12, fill=shade((18, 16, 20), lit), d=d)
    for k in range(18):
        a = rng.uniform(0, math.tau)
        L = r * rng.uniform(1.25, 2.3)
        pts = [(x + math.cos(a) * r * 0.9, -math.sin(a) * r * 0.13)]
        for j in range(1, 4):
            ll = L * j / 3
            pts.append((x + math.cos(a + rng.uniform(-0.12, 0.12)) * ll, -math.sin(a) * ll * 0.14))
        fr.line(pts, shade((16, 14, 16), lit), width_m=0.06, d=d)
    for k in range(24):
        a = rng.uniform(0, math.tau)
        rr = r * rng.uniform(0.86, 1.2)
        cx, cy = x + math.cos(a) * rr, -math.sin(a) * rr * 0.14 + 0.1
        sz = rng.uniform(0.2, 0.7) * (r / 8.0) ** 0.5
        fr.poly([(cx - sz, cy), (cx - sz * 0.3, cy + sz * 0.9), (cx + sz * 0.8, cy + sz * 0.4), (cx + sz * 0.6, cy - 0.05)],
                shade(PAL["street"], lit * rng.uniform(0.8, 1.3)), d=d)


def blast_tongue(fr, k=1.0, gx=-6.0, x_end=-12.0, lit=1.0):
    """The blast-shadow tongue of intact asphalt under Gojo's feet, running
    west to the crater rim (Infinity held the backwash)."""
    if k <= 0:
        return
    xe = lerp(gx - 0.6, x_end, k)
    fr.poly([(gx + 0.45, 0.0), (gx, 0.1), (xe, 0.22), (xe, -0.3), (gx, -0.12)], shade(PAL["street"], lit * 1.05))
    fr.line([(gx + 0.45, 0.0), (gx, 0.1), (xe, 0.22)], shade(PAL["concrete"], lit * 0.6), width_m=0.04)


def s7_16(fr):
    t, dur = fr.t, fr.dur
    t3 = cue(fr, "final_impact", 0, 3)
    t4, t8, t10, t18 = T(fr, 4), T(fr, 8), T(fr, 10), dur
    tau = frag_clock(fr)
    fr.cam = Cam(-4.6, 1.2, 120.0, shake=C.shake(t, t3, amp=16.0, dur=T(fr, 8)))
    C.stage(fr, SEQ, "street", gantry_on=False)
    ck = seg(t, t8, t18, "out") if t >= t8 else 0.0
    if ck < 0.35:
        fist_crater(fr)
    final_crater(fr, -4.0, 8.0 * ck)
    blast_tongue(fr, ck)
    env.gantry(fr, MAST_X, sheared=True)                  # still standing - for now
    te = t - t3
    # ---- Gojo: unmoved, a held cel on 2s; only the bloodied hand withdraws to his side
    tq = on2(fr)
    gk = seg(tq, t3, t10, "inout") if t >= t3 else 0.0
    gpose0 = P(G_THRUST, lean=10)
    gJ0 = solve(GOJO, gpose0, -6.0, None, 1)
    hand = (lerp(BLAST[0] - 0.05, -5.82, gk), lerp(BLAST[1] - 0.02, 0.95, gk))
    gpose = reach(GOJO, P(pose_at(gk, [(0, gpose0), (1, G_AFTER)]), hand_n="sign" if gk < 0.5 else "open"),
                  gJ0["pelvis"][0], gJ0["pelvis"][1], 1, "n", hand)
    G = gojo(fr, gpose, -6.0, None)
    stump_blood(fr, G, t, "f", n=4, salt="st16")
    # ---- Thragg: the stalled lunge -> hurled down and east -> on his back, ploughing east
    o = topts(fr, switch=t3)
    if t < t4:
        base = P(T_STALL, lean=34)
        sh0 = solve(THRAGG, base, 0.0, 0.0, -1)["sh_f"]
        pel = (-5.32 - sh0[0], 1.64 - sh0[1])
        pose = reach(THRAGG, P(base, hand_f="fist"), pel[0], pel[1], -1, "f", (-5.88, 1.8), elbow="up")
        J = thragg(fr, pose, pel[0], pel[1], opts=o)
        open_flank(fr, J, k=1.0, entry=(0.6, 0.15), glow=0.9 if t < t3 else 1.0)
    elif t < t10:
        u = (t - t4) / (t10 - t4)
        px = lerp(-4.9, -4.0, EASE["out"](u))
        py = lerp(1.05, 0.25, EASE["in"](u))
        base = pose_at(u, [(0, T_BLAST), (0.6, P(T_BLAST, lean=-80)), (1.0, T_BACK)])
        if t < t4 + 1.0 / FPS:      # the fist hangs in the air a frame before following
            base = reach(THRAGG, P(base, hand_f="fist"), px, py, -1, "f", (-5.88, 1.8))
        J = thragg(fr, base, px, py, opts=o)
    else:
        px = kf(t, [(t10, -4.0), (t18, -3.0, "out")])
        J = thragg(fr, T_BACK, px, None, opts=o)
        fx.debris(fr, px + 0.4, 0.1, t - t10, n=14, speed=4.0, spread=1.2, angle=math.radians(70),
                  size=(0.06, 0.25), color=(64, 60, 66), salt="plough16")
    if t >= t3:
        cx_, cy_ = J["chest"]
        for i in range(4):          # smoke rising off the blasted chest
            ph = (te * 0.9 + i / 4) % 1.0
            fx.dust_cloud(fr, cx_, cy_ + ph * 0.6, 0.3, r=0.2 + 0.2 * ph, n=3, color=(70, 64, 66), salt=f"sm{i}",
                          alpha=int(90 * (1 - ph)))
    # ---- Red: the crimson point jitters inside the ribs, then detonates INSIDE the chest
    if t < t3:
        fx.red_charge(fr, BLAST[0], BLAST[1], t, r=0.05, strength=0.9)
    else:
        if t3 <= t < t3 + 1.0 / FPS:
            fr.invert = 1.0
        fx.red_release(fr, BLAST[0], BLAST[1], RED_DIR[0], RED_DIR[1], te * 1.8, length=5.0, width=1.4)
        # pressure front flowing AROUND Gojo; chunks thrown back at him hang short of him
        fx.infinity(fr, -6.0, 1.1, r=1.0, strength=0.45 * (1 - clamp(te / 0.6)), t=t)
        rng = fr.srng("back16")
        for i in range(10):
            a = rng.uniform(-0.5, 0.6)
            r_stop = rng.uniform(0.45, 0.75)
            r0 = 1.3 + rng.uniform(0, 0.6)
            rr = r_stop + (r0 - r_stop) * math.exp(-7.0 * te)
            draw_frag(fr, -6.0 + math.cos(a) * rr, 1.1 + math.sin(a) * rr * 1.2, rng.uniform(0, 6) + te * 2,
                      rng.uniform(0.04, 0.1), 0.9, jitter=0.006 if te > 0.3 else 0.0, salt=100 + i)
        fx.dust_cloud(fr, -3.6, 0.05, te, r=4.0, n=18, alpha=110, salt="erupt16")
        fx.shockwave(fr, -3.9, 0.0, te - 0.1, r_max=12.0, dur=0.9, ground=True, color=(220, 190, 170))
        fx.debris(fr, -3.8, 0.1, t - t8, n=26, speed=7.0, spread=2.2, angle=math.radians(80), size=(0.08, 0.35),
                  color=(70, 66, 70), salt="erupt16d")
    draw_frags(fr, tau, infinity_on=True, only="hero", jitter_px=1.2)
    fr.vignette = 0.42



# =============================================================================
# S7-17  EWS from 90 m up: the shockwave crosses the intersection in silence
# =============================================================================

class Proj:
    """A simple perspective camera for the high, steep view (x east, y up,
    z north). Still facing north: west is screen-left."""

    def __init__(self, fr, cam=(-3.0, 90.0, -50.0), target=(-3.0, 0.0, 1.0), F=2250.0):
        self.fr = fr
        self.C = cam
        fx_, fy_, fz_ = (target[0] - cam[0], target[1] - cam[1], target[2] - cam[2])
        L = math.sqrt(fx_ * fx_ + fy_ * fy_ + fz_ * fz_)
        self.f = (fx_ / L, fy_ / L, fz_ / L)
        self.r = (1.0, 0.0, 0.0)
        f = self.f
        self.u = (0.0, f[2], -f[1])                   # camera up = forward x right
        self.F = F * fr.ss

    def p(self, x, y, z):
        d = (x - self.C[0], y - self.C[1], z - self.C[2])
        zc = d[0] * self.f[0] + d[1] * self.f[1] + d[2] * self.f[2]
        xc = d[0] * self.r[0] + d[1] * self.r[1] + d[2] * self.r[2]
        yc = d[0] * self.u[0] + d[1] * self.u[1] + d[2] * self.u[2]
        zc = max(zc, 0.5)
        return (self.fr.W / 2 + self.F * xc / zc, self.fr.H / 2 - self.F * yc / zc)

    def scale(self, x, y, z):
        """px per metre at a world point (for sizes)."""
        a = self.p(x, y, z)
        b = self.p(x + 1.0, y, z)
        return abs(b[0] - a[0])

    def gpoly(self, pts, fill, y=0.0, dr=None):
        (dr or self.fr.draw).polygon([self.p(x, y, z) for x, z in pts], fill=fill)

    def ring(self, cx, cz, r, n=64, y=0.0):
        return [self.p(cx + math.cos(a) * r, y, cz + math.sin(a) * r) for a in (k * math.tau / n for k in range(n))]


def _box(P3, dr, x0, x1, z0, z1, h, col, lit=1.0):
    """An extruded building block: south facade + roof (camera is south, above)."""
    roof = [P3.p(x0, h, z0), P3.p(x1, h, z0), P3.p(x1, h, z1), P3.p(x0, h, z1)]
    face = [P3.p(x0, 0, z0), P3.p(x1, 0, z0), P3.p(x1, h, z0), P3.p(x0, h, z0)]
    dr.polygon(face, fill=shade(col, 0.8 * lit))
    if x1 < -2:
        side = [P3.p(x1, 0, z0), P3.p(x1, 0, z1), P3.p(x1, h, z1), P3.p(x1, h, z0)]
        dr.polygon(side, fill=shade(col, 0.6 * lit))
    elif x0 > -4:
        side = [P3.p(x0, 0, z0), P3.p(x0, 0, z1), P3.p(x0, h, z1), P3.p(x0, h, z0)]
        dr.polygon(side, fill=shade(mix_color(col, PAL["rim_warm"], 0.25), 0.9 * lit))
    dr.polygon(roof, fill=shade(mix_color(col, PAL["rim_warm"], 0.12), 1.0 * lit))


_BLOCKS = None


def blocks17():
    global _BLOCKS
    if _BLOCKS is None:
        rng = random.Random("s7blocks")
        out = []
        for (xa, xb, za, zb) in ((-80, -12, 5, 50), (12, 80, 5, 50), (-12, 12, 30, 60)):
            x = xa
            while x < xb:
                w = rng.uniform(9, 18)
                out.append((x, min(xb, x + w), za + rng.uniform(0, 3), zb, rng.uniform(16, 46),
                            shade((52, 50, 62), rng.uniform(0.85, 1.15))))
                x += w + rng.uniform(0.5, 2)
        _BLOCKS = out
    return _BLOCKS


def s7_17(fr):
    t, dur = fr.t, fr.dur
    t6, t12, t18, t26 = T(fr, 6), T(fr, 12), T(fr, 18), T(fr, 26)
    P3 = Proj(fr)
    dr = fr.draw
    BX, BZ = -4.0, 0.0
    R = lerp(8.5, 40.0, EASE["out"](clamp(t / dur)))               # the pressure ring
    # ---- ground: avenue (E-W), cross street (N-S), corners, markings
    dr.rectangle([0, 0, fr.W, fr.H], fill=shade(PAL["street"], 0.95))
    side = PAL["concrete_dark"]
    P3.gpoly([(-200, 3.0), (-7.2, 3.0), (-7.2, 60), (-200, 60)], side)
    P3.gpoly([(7.2, 3.0), (200, 3.0), (200, 60), (7.2, 60)], side)
    P3.gpoly([(-200, -16), (200, -16), (200, -80), (-200, -80)], side)
    for xx in range(-90, 91, 6):
        if abs(xx) > 9:
            P3.gpoly([(xx, -6.6), (xx + 3, -6.6), (xx + 3, -6.3), (xx, -6.3)], shade(PAL["street_line"], 0.75))
    for k in range(6):
        for cx in (-10.5, 10.5):
            z0 = -14 + k * 2.6
            P3.gpoly([(cx - 1.6, z0), (cx + 1.6, z0), (cx + 1.6, z0 + 1.2), (cx - 1.6, z0 + 1.2)],
                     shade((180, 175, 160), 0.6))
    # ---- the landing crater (x=0) and the new crater (x=-4, ~16 m), rims merging
    for (cx, r, pit) in ((0.0, 3.4, 0.82), (BX, 8.0, 0.86)):
        dr.polygon(P3.ring(cx, 0.0, r * 1.08), fill=shade(PAL["concrete"], 0.6))
        dr.polygon(P3.ring(cx, 0.0, r * pit), fill=(20, 18, 22))
    rng = random.Random("s7c17")
    for k in range(26):
        a = rng.uniform(0, math.tau)
        L = 8.0 * rng.uniform(1.15, 2.2)
        pts = [P3.p(BX + math.cos(a) * 8.0, 0, math.sin(a) * 8.0)]
        for j in range(1, 4):
            aa = a + rng.uniform(-0.1, 0.1)
            pts.append(P3.p(BX + math.cos(aa) * (8 + (L - 8) * j / 3), 0, math.sin(aa) * (8 + (L - 8) * j / 3)))
        dr.line(pts, fill=(18, 16, 20), width=max(1, int(2 * fr.ss)))
    # ---- the blast-shadow tongue of intact asphalt behind Gojo (west), the front parted around him
    tongue = [(-5.6, 0.0), (-6.0, 0.55), (-8.0, 1.6), (-11.0, 2.2), (-12.3, 0.0), (-11.0, -2.2), (-8.0, -1.6),
              (-6.0, -0.55)]
    P3.gpoly(tongue, shade(PAL["street"], 1.05))
    # ---- the pressure ring: dust torus hugging the ground + a thin crimson leading edge (gone by f12)
    img, ld = fr.layer()
    for j in range(6):
        rr = R - j * 0.9
        if rr <= 8.6:
            continue
        a = int(95 * (1 - j / 6) * (1 - 0.45 * clamp(t / dur)))
        ld.line(P3.ring(BX, BZ, rr, n=96) + [P3.ring(BX, BZ, rr, n=96)[0]], fill=(186, 160, 136, a),
                width=max(1, int(P3.scale(BX, 0, 0) * 1.8)))
    edge = 1 - clamp(t / t12)
    if edge > 0:
        ld.line(P3.ring(BX, BZ, R + 0.6, n=96) + [P3.ring(BX, BZ, R + 0.6, n=96)[0]],
                fill=(255, 60, 60, int(220 * edge)), width=max(1, int(3 * fr.ss)))
    fr.merge(img)
    # ---- crater-rim slabs thrown off in every direction
    rng = fr.srng("slabs17")
    for i in range(40):
        a = rng.uniform(0, math.tau)
        sp = rng.uniform(6, 16)
        vy = rng.uniform(4, 10)
        tt = t - rng.uniform(0.0, 0.08)
        if tt < 0:
            continue
        rr = 8.0 + sp * tt
        y = max(0.0, vy * tt - 4.9 * tt * tt)
        X, Y = P3.p(BX + math.cos(a) * rr, y, math.sin(a) * rr)
        sz = P3.scale(BX, 0, 0) * rng.uniform(0.3, 0.9)
        dr.polygon([(X - sz, Y), (X, Y - sz * 0.8), (X + sz * 0.9, Y + sz * 0.2), (X + sz * 0.2, Y + sz * 0.7)],
                   fill=shade(PAL["concrete"], rng.uniform(0.6, 1.0)))
    # ---- cars and lamp posts flung outward as the front passes
    for i, (cx, cz, col) in enumerate(((-17.0, -4.0, (70, 40, 40)), (21.0, -7.0, (50, 60, 70)), (-31.0, -10.0, (60, 62, 58)),
                                       (26.0, 1.5, (80, 76, 60)), (-22.0, 1.0, (64, 58, 70)), (2.0, -12.5, (58, 52, 50)))):
        dist = math.hypot(cx - BX, cz - BZ)
        ang = math.atan2(cz - BZ, cx - BX)
        tp = max(0.0, R - dist) / 18.0
        push = 7.0 * (1 - math.exp(-3.0 * tp)) if R > dist else 0.0
        hop = max(0.0, 2.5 * math.sin(min(math.pi, tp * 4))) if R > dist else 0.0
        x, z = cx + math.cos(ang) * push, cz + math.sin(ang) * push
        rot = ang + (tp * 3.0 if R > dist else 0.0) + 0.3 * i
        c, sn = math.cos(rot), math.sin(rot)
        pts = [(x + c * dx - sn * dz, z + sn * dx + c * dz) for dx, dz in ((-2.2, -0.9), (2.2, -0.9), (2.2, 0.9), (-2.2, 0.9))]
        dr.polygon([P3.p(px, 0.0, pz) for px, pz in pts], fill=(14, 12, 16))
        dr.polygon([P3.p(px, 1.2 + hop, pz) for px, pz in pts], fill=col)
    for i, lx in enumerate(range(-46, 47, 15)):
        for lz in (-15.0, 3.6):
            dist = math.hypot(lx - BX, lz - BZ)
            ang = math.atan2(lz - BZ, lx - BX)
            tp = max(0.0, R - dist) / 12.0
            tilt = min(math.pi / 2, tp * 6) if R > dist else 0.0
            top = (lx + math.cos(ang) * 7 * math.sin(tilt), 7 * math.cos(tilt), lz + math.sin(ang) * 7 * math.sin(tilt))
            dr.line([P3.p(lx, 0, lz), P3.p(*top)], fill=(40, 42, 50), width=max(1, int(2.2 * fr.ss)))
    # ---- Thragg: on his back at x=-2 beneath where the mast will land; smoke from his chest
    dr.polygon([P3.p(x, 0.3, z) for x, z in ((-3.0, -0.25), (-1.2, -0.25), (-1.2, 0.25), (-3.0, 0.25))],
               fill=(196, 190, 186))
    dr.polygon([P3.p(x, 0.32, z) for x, z in ((-2.2, -0.2), (-1.85, -0.2), (-1.85, 0.2), (-2.2, 0.2))], fill=(60, 10, 16))
    for k in range(6):
        ph = (t * 0.6 + k / 6) % 1.0
        X, Y = P3.p(-2.0, 0.6 + ph * 7.0, 0.0)
        rr = P3.scale(-2, 0, 0) * (0.3 + 0.8 * ph)
        dr.ellipse([X - rr, Y - rr, X + rr, Y + rr], fill=mix_color((70, 64, 66), PAL["street"], ph))
    # ---- Gojo: a tiny dark vertical on the tongue; the chunks flying at him hang in a ring
    gb, gt = P3.p(-6.0, 0.0, 0.0), P3.p(-6.0, 1.9, 0.0)
    w = max(2.0, P3.scale(-6, 0, 0) * 0.45)
    dr.line([gb, gt], fill=(14, 14, 20), width=int(w))
    hx, hy = P3.p(-6.0, 1.85, 0.0)
    dr.ellipse([hx - w * 0.6, hy - w * 0.6, hx + w * 0.6, hy + w * 0.6], fill=(236, 240, 248))
    rng = fr.srng("ringchunks17")
    for i in range(14):
        a = rng.uniform(-1.4, 1.4)
        r_stop = rng.uniform(0.7, 1.2)
        r0 = 6.0
        rr = r_stop + (r0 - r_stop) * math.exp(-6.0 * t)
        jx = random.Random(f"j{i}:{fr.f}").uniform(-0.03, 0.03) if t > 0.4 else 0.0
        X, Y = P3.p(-6.0 + math.cos(a) * rr + jx, rng.uniform(0.4, 2.2), math.sin(a) * rr)
        sz = P3.scale(-6, 0, 0) * rng.uniform(0.15, 0.3)
        dr.polygon([(X - sz, Y), (X, Y - sz), (X + sz, Y), (X, Y + sz)], fill=shade(PAL["concrete"], 0.8))
    # ---- the mast: kicked up (f6), a half-turn spin through the dust, crashes across the crater (f18-26)
    base0 = (MAST_X, 0.0, 0.8)
    if t < t6:
        a_pitch, yaw, lift, bx = 90.0, 180.0, 0.0, MAST_X
    else:
        u = clamp((t - t6) / (t26 - t6))
        a_pitch = lerp(90.0, 2.0, EASE["smooth"](u) ** 1.3)
        yaw = lerp(180.0, 360.0, EASE["inout"](u))
        lift = 2.2 * math.sin(math.pi * min(1.0, u * 1.15))
        bx = lerp(MAST_X, MAST_X - 0.6, EASE["out"](u))
    L = 6.4 if t < t6 else 6.2
    pr, yr = math.radians(a_pitch), math.radians(yaw)
    top = (bx + math.cos(pr) * math.cos(yr) * L, lift + math.sin(pr) * L, 0.8 + math.cos(pr) * math.sin(yr) * L)
    b3 = (bx, lift + (0.3 if t >= t26 else 0.0), 0.8)
    if t >= t26:
        top = (-1.4, 0.45, 0.8)
        b3 = (MAST_X - 0.6, 0.1, 0.8)
    wpx = max(3, int(P3.scale(-4, 0, 0) * 0.42))
    dr.line([P3.p(*b3), P3.p(*top)], fill=(12, 12, 16), width=wpx + int(2 * fr.ss))
    dr.line([P3.p(*b3), P3.p(*top)], fill=(150, 154, 166), width=wpx)
    if t >= t18 and t < t26 + T(fr, 3):
        fx_k = clamp((t - t18) / 0.3)
        X, Y = P3.p(-2.5, 0.3, 0.8)
        rr = P3.scale(-2.5, 0, 0) * (1.0 + 3.0 * fx_k)
        img, ld = fr.layer()
        ld.ellipse([X - rr * 1.6, Y - rr * 0.7, X + rr * 1.6, Y + rr * 0.7], fill=(160, 140, 120, int(110 * (1 - fx_k))))
        fr.merge(img)
    # ---- the north blocks: facades ripple out in a ring of blown windows
    img, ld = fr.layer()
    for (x0, x1, z0, z1, h, col) in sorted(blocks17(), key=lambda b: -b[2]):
        _box(P3, ld, x0, x1, z0, z1, h, col)
        dist = math.hypot((x0 + x1) / 2 - BX, z0 - BZ)
        rngw = random.Random(f"w{x0:.1f}")
        for wv in range(int((x1 - x0) / 3)):
            for hv in range(int(h / 4)):
                wx, wy = x0 + 1.0 + wv * 3.0, 2.0 + hv * 4.0
                d_w = math.hypot(wx - BX, z0 - BZ)
                blown = R > d_w
                c = (24, 22, 30) if blown else mix_color((70, 72, 90), PAL["window_lit"], 0.18 if rngw.random() < 0.3 else 0.0)
                q = [P3.p(wx, wy, z0 - 0.05), P3.p(wx + 1.6, wy, z0 - 0.05), P3.p(wx + 1.6, wy + 2.2, z0 - 0.05),
                     P3.p(wx, wy + 2.2, z0 - 0.05)]
                ld.polygon(q, fill=c)
                if blown and R - d_w < 6.0:
                    X, Y = q[0]
                    for g in range(3):
                        gx_ = X + (R - d_w) * rngw.uniform(-2, 2) * fr.ss
                        gy_ = Y + (R - d_w) * rngw.uniform(0.5, 3) * fr.ss
                        ld.ellipse([gx_ - 1.5 * fr.ss, gy_ - 1.5 * fr.ss, gx_ + 1.5 * fr.ss, gy_ + 1.5 * fr.ss],
                                   fill=(200, 220, 240, 220))
    fr.merge(img)
    # ---- evening light raking from the west; the dust rolls in (f26-30)
    img, ld = fr.layer()
    for (u0, w) in ((0.05, 0.06), (0.24, 0.09), (0.47, 0.05)):
        ld.polygon([(u0 * fr.W, 0), ((u0 + w) * fr.W, 0), ((u0 + w + 0.18) * fr.W, fr.H), ((u0 + 0.18) * fr.W, fr.H)],
                   fill=(255, 196, 140, 13))
    haze = seg(t, t26 - T(fr, 4), dur, "in")
    if haze > 0:
        ld.rectangle([0, 0, fr.W, fr.H], fill=(150, 128, 108, int(70 * haze)))
    fr.merge(img)
    fr.vignette = 0.45


# =============================================================================
# S7-18  WS from street level: one figure standing, one shape in the crater. Silence.
# =============================================================================
G_FRONT = P("front_tired", lean=0, neck=6, ua_n=22, fa_n=14, ua_f=13, fa_f=6, th_n=6, sh_n=2, th_f=9, sh_f=3)


def s7_18(fr):
    t, dur = fr.t, fr.dur
    t40, t60, t90 = T(fr, 40), T(fr, 60), T(fr, 90)
    settle = seg(t, t60, dur, "inout")
    fr.cam = Cam(-4.0, 2.5, 70.0)
    C.stage(fr, SEQ, "street", extra=("final_crater",))
    bake_soft(fr)
    blast_tongue(fr, 1.0)
    # ---- the backlit dust wall, lit gold by the shafts from screen-left (thinner at the ground)
    img, ld = fr.layer()
    v_ground = fr.P(0, 0)[1] / fr.H
    for i in range(30):
        v0, v1 = i / 30, (i + 1) / 30
        dense = 1.0 - 0.55 * smoothstep(v_ground - 0.12, v_ground + 0.02, v0)
        a = int((95 + 45 * (1 - abs(v0 - 0.45) / 0.55)) * dense * (1 - 0.3 * settle))
        ld.rectangle([0, v0 * fr.H, fr.W, v1 * fr.H + 2], fill=mix_color((206, 156, 100), (150, 118, 96), v0) + (a,))
    fr.merge(img)
    env.light_shafts(fr, C.state(SEQ), strength=2.2)
    shaft(fr, -9.0, -6.6, 3.0, 2.0, y_top=30, alpha=40)
    world_dust(fr, -18, 10, 0.2, 9, n=170, salt="dust18", size_px=1.6, alpha=170, settle=0.8 * settle,
               col=(250, 214, 160))
    # the toppled mast: the long diagonal across the crater, its upper end over Thragg
    m0, m1 = (env.GANTRY_X - 0.6, 0.1), (env.GANTRY_X + 5.6, 0.45)
    fr.line([m0, m1], (22, 22, 28), width_m=0.26, d=1.15)
    fr.line([(m0[0], m0[1] + 0.05), (m1[0], m1[1] + 0.05)], (150, 120, 96), width_m=0.05, d=1.15)
    # ---- Thragg: dark shape on his back in the crater, beneath the mast; smoke from the chest
    lay, J = capture(fr, lambda: thragg(fr, T_BACK, -2.0, None))
    silhouette(fr, lay, (34, 28, 30), rim=(150, 110, 90), rim_off=(-1.5, -1.0))
    cx_, cy_ = J["chest"]
    rng = fr.srng("smoke18")
    img, ld = fr.layer()
    for k in range(10):
        ph = (t * 0.25 + k / 10) % 1.0
        x = cx_ + 0.15 * math.sin(ph * 6 + k) + ph * 0.4
        y = cy_ + 0.1 + ph * 3.2
        X, Y = fr.P(x, y)
        R = fr.S(0.08 + 0.35 * ph)
        ld.ellipse([X - R, Y - R, X + R, Y + R], fill=(60, 54, 58, int(150 * (1 - ph))))
    fr.merge(img)
    # ---- Gojo: one dark figure, three-quarter to camera; the stump reads on the crater side
    breath = pulse(t, t40, 0.4, 0.8) + pulse(t, t90, 0.4, 0.8)
    pose = P(G_FRONT, neck=6 - 3 * breath, ua_n=22 + 2 * breath, ua_f=13 + 2 * breath)
    o = gopts(fr)
    o["eyes"] = "blindfold"            # a silhouette: no Six Eyes glow leaking through the shape
    lay, G = capture(fr, lambda: draw_fighter(fr, GOJO_W, pose, -6.0, None, 1, view="front", opts=o))
    silhouette(fr, lay, (16, 14, 20), rim=(255, 196, 140), rim_off=(-2.2, -1.4))
    # chunks hanging a hand's breadth above his head and shoulders (Infinity): micro-jitter only
    rng = fr.srng("hang18")
    for i in range(6):
        x = -6.0 + rng.uniform(-0.45, 0.45)
        y = rng.uniform(2.02, 2.3)
        draw_frag(fr, x, y, rng.uniform(0, 6), rng.uniform(0.03, 0.07), 0.55, jitter=0.004, salt=300 + i)
    # dust drifting past and around him (harmless dust reaches him)
    world_dust(fr, -8, -4, 0.2, 3.2, n=40, salt="dust18b", size_px=1.4, alpha=150, settle=0.5 * settle,
               col=(250, 220, 170))
    fr.vignette = 0.5

SHOTS = {
    "S7-01": s7_01,
    "S7-02": s7_02,
    "S7-03": s7_03,
    "S7-04": s7_04,
    "S7-05": s7_05,
    "S7-06": s7_06,
    "S7-07": s7_07,
    "S7-08": s7_08,
    "S7-09": s7_09,
    "S7-10": s7_10,
    "S7-11": s7_11,
    "S7-12": s7_12,
    "S7-13": s7_13,
    "S7-14": s7_14,
    "S7-15": s7_15,
    "S7-16": s7_16,
    "S7-17": s7_17,
    "S7-18": s7_18,
}
