"""2D puppet rig for the two fighters.

A pose is a dict of ABSOLUTE limb angles in degrees, measured from straight
down (0) toward the facing direction (90 = pointing forward horizontally,
180 = straight up, -90 = pointing backward horizontally). Absolute angles make
poses easy to author and to interpolate.

Keys (side view; n = near/camera-side limb, f = far limb):
  lean            torso angle from vertical, + = toward facing (90 = horizontal flight)
  neck            head tilt relative to torso, + = chin down/forward
  ua_n fa_n       near upper arm / forearm
  ua_f fa_f       far  upper arm / forearm
  th_n sh_n       near thigh / shin   (knee bends when shin < thigh)
  th_f sh_f       far  thigh / shin
  hand_n hand_f   'fist' | 'open' | 'point' | 'sign' | 'claw'
In view='front' the same keys are used but n = screen-right limb, f = screen-left
limb, and angles are measured outward from straight down (90 = arm straight out).

Usage:
  pose = pose_at(t, [(0.0, 'idle'), (0.3, 'punch_wind', 'out'), (0.4, 'punch_extend', 'snap')])
  draw_fighter(fr, GOJO, pose, x=0, y=None, facing=1)   # y=None -> feet snapped to ground y=0
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

from engine import EASE, clamp, shade, mix_color, PAL


@dataclass
class Style:
    name: str
    spine: float
    neck: float
    head_r: float
    upper_arm: float
    forearm: float
    thigh: float
    shin: float
    foot: float
    w_chest: float
    w_waist: float
    w_ua: float
    w_fa: float
    w_th: float
    w_sh: float
    fist: float
    suit: tuple
    suit_hi: tuple
    skin: tuple
    hair: tuple
    accent: tuple
    rim: tuple


GOJO = Style(
    name="gojo", spine=0.56, neck=0.10, head_r=0.112,
    upper_arm=0.33, forearm=0.30, thigh=0.48, shin=0.47, foot=0.16,
    w_chest=0.34, w_waist=0.27, w_ua=0.085, w_fa=0.072, w_th=0.115, w_sh=0.085, fist=0.052,
    suit=(22, 24, 32), suit_hi=(44, 50, 70), skin=(240, 214, 196), hair=(238, 242, 250),
    accent=(10, 10, 14), rim=(150, 200, 255),
)

# Thragg (canon, see docs/01-research-dossier.md): ~198 cm, massively muscled,
# pale skin, close-cropped jet-black hair, thick black mustache, dark-brown
# eyes; Grand Regent uniform in white with crimson.
THRAGG = Style(
    name="thragg", spine=0.62, neck=0.11, head_r=0.125,
    upper_arm=0.35, forearm=0.32, thigh=0.50, shin=0.49, foot=0.18,
    w_chest=0.60, w_waist=0.40, w_ua=0.155, w_fa=0.128, w_th=0.175, w_sh=0.135, fist=0.076,
    suit=(214, 210, 206), suit_hi=(245, 242, 238), skin=(230, 208, 192), hair=(22, 20, 24),
    accent=(176, 28, 34), rim=(255, 170, 120),
)

# --------------------------------------------------------------------------
# pose library
# --------------------------------------------------------------------------
_B = dict(lean=0, neck=0, ua_n=4, fa_n=8, ua_f=-4, fa_f=4, th_n=4, sh_n=0, th_f=-4, sh_f=-2,
          hand_n="fist", hand_f="fist")


def _p(**kw):
    d = dict(_B)
    d.update(kw)
    return d


POSES = {
    # ---- shared / generic ---------------------------------------------
    "stand": _p(),
    "hover": _p(lean=4, ua_n=10, fa_n=14, ua_f=-6, fa_f=0, th_n=12, sh_n=-6, th_f=-6, sh_f=-22),
    "float_relaxed": _p(lean=2, ua_n=12, fa_n=-10, ua_f=-2, fa_f=-14, th_n=8, sh_n=-12, th_f=-4, sh_f=-26,
                        hand_n="open", hand_f="open"),
    "run": _p(lean=22, ua_n=-40, fa_n=40, ua_f=50, fa_f=110, th_n=50, sh_n=10, th_f=-30, sh_f=-90),
    "fly_forward": _p(lean=86, neck=-30, ua_n=92, fa_n=90, ua_f=-60, fa_f=-40, th_n=-84, sh_n=-92,
                      th_f=-96, sh_f=-110),
    "fly_cruise": _p(lean=80, neck=-28, ua_n=-70, fa_n=-80, ua_f=-76, fa_f=-86, th_n=-84, sh_n=-96,
                     th_f=-92, sh_f=-104),
    "fly_up": _p(lean=10, neck=-10, ua_n=170, fa_n=175, ua_f=-10, fa_f=-6, th_n=-6, sh_n=-14, th_f=-12, sh_f=-24),
    "dive": _p(lean=150, neck=-40, ua_n=160, fa_n=165, ua_f=120, fa_f=130, th_n=-160, sh_n=-170,
               th_f=-170, sh_f=-185),
    "land_crouch": _p(lean=38, neck=-12, ua_n=36, fa_n=12, ua_f=-30, fa_f=-10, th_n=96, sh_n=-10,
                      th_f=20, sh_f=-82),
    "rise": _p(lean=14, neck=-4, ua_n=14, fa_n=20, ua_f=-14, fa_f=0, th_n=36, sh_n=-8, th_f=-8, sh_f=-30),
    "recoil": _p(lean=-34, neck=-24, ua_n=64, fa_n=84, ua_f=40, fa_f=70, th_n=46, sh_n=34, th_f=24, sh_f=10,
                 hand_n="open", hand_f="open"),
    "tumble": _p(lean=-120, neck=-30, ua_n=150, fa_n=120, ua_f=100, fa_f=60, th_n=-60, sh_n=-20, th_f=-100,
                 sh_f=-140, hand_n="open", hand_f="open"),
    "slump_kneel": _p(lean=30, neck=34, ua_n=10, fa_n=-4, ua_f=0, fa_f=-6, th_n=90, sh_n=0, th_f=2, sh_f=-90,
                      hand_n="open", hand_f="open"),
    "kneel_fist_down": _p(lean=40, neck=-6, ua_n=40, fa_n=8, ua_f=-20, fa_f=-4, th_n=90, sh_n=0, th_f=2,
                          sh_f=-90),
    "fallen": _p(lean=-88, neck=4, ua_n=-70, fa_n=-96, ua_f=-110, fa_f=-120, th_n=86, sh_n=94, th_f=78,
                 sh_f=100, hand_n="open", hand_f="open"),
    "wipe_mouth": _p(lean=4, neck=8, ua_n=28, fa_n=158, ua_f=-6, fa_f=4, th_n=10, sh_n=4, th_f=-8, sh_f=-4),
    "tired": _p(lean=12, neck=12, ua_n=6, fa_n=2, ua_f=-2, fa_f=-4, th_n=14, sh_n=2, th_f=-10, sh_f=-6,
                hand_n="open", hand_f="open"),

    # ---- Thragg ---------------------------------------------------------
    "t_stand": _p(lean=2, ua_n=12, fa_n=8, ua_f=-10, fa_f=-6, th_n=10, sh_n=6, th_f=-10, sh_f=-6),
    "t_guard": _p(lean=10, neck=6, ua_n=40, fa_n=128, ua_f=26, fa_f=118, th_n=24, sh_n=-4, th_f=-20, sh_f=-26),
    "t_punch_wind": _p(lean=4, neck=4, ua_n=-46, fa_n=62, ua_f=56, fa_f=96, th_n=26, sh_n=-2, th_f=-24, sh_f=-30),
    "t_punch": _p(lean=24, neck=0, ua_n=93, fa_n=91, ua_f=-34, fa_f=58, th_n=44, sh_n=4, th_f=-38, sh_f=-48),
    "t_hook_wind": _p(lean=0, ua_n=-10, fa_n=100, ua_f=40, fa_f=120, th_n=20, sh_n=0, th_f=-20, sh_f=-24),
    "t_hook": _p(lean=16, ua_n=74, fa_n=132, ua_f=10, fa_f=96, th_n=34, sh_n=4, th_f=-26, sh_f=-36),
    "t_uppercut": _p(lean=4, ua_n=60, fa_n=168, ua_f=-20, fa_f=60, th_n=36, sh_n=10, th_f=-24, sh_f=-36),
    "t_knee": _p(lean=-8, neck=6, ua_n=60, fa_n=20, ua_f=-50, fa_f=-10, th_n=104, sh_n=-6, th_f=-6, sh_f=-6),
    "t_kick": _p(lean=-24, ua_n=40, fa_n=90, ua_f=-40, fa_f=0, th_n=96, sh_n=92, th_f=-6, sh_f=-8),
    "t_axe": _p(lean=20, neck=10, ua_n=170, fa_n=196, ua_f=150, fa_f=180, th_n=20, sh_n=-10, th_f=-20, sh_f=-40),
    "t_axe_down": _p(lean=40, neck=20, ua_n=110, fa_n=60, ua_f=100, fa_f=50, th_n=40, sh_n=-10, th_f=-30, sh_f=-60),
    "t_grab": _p(lean=26, neck=-4, ua_n=82, fa_n=96, ua_f=72, fa_f=100, th_n=40, sh_n=6, th_f=-34, sh_f=-46,
                 hand_n="claw", hand_f="claw"),
    "t_fly_punch": _p(lean=84, neck=-26, ua_n=90, fa_n=90, ua_f=-70, fa_f=-50, th_n=-82, sh_n=-94,
                      th_f=-98, sh_f=-112),
    "t_hover_ready": _p(lean=8, neck=4, ua_n=34, fa_n=110, ua_f=20, fa_f=96, th_n=16, sh_n=-10, th_f=-10, sh_f=-34),
    "t_tear": _p(lean=10, neck=0, ua_n=120, fa_n=150, ua_f=100, fa_f=130, th_n=30, sh_n=0, th_f=-24, sh_f=-30,
                 hand_n="claw", hand_f="claw"),
    "t_throw": _p(lean=30, neck=-4, ua_n=120, fa_n=110, ua_f=-30, fa_f=10, th_n=40, sh_n=0, th_f=-40, sh_f=-50,
                  hand_n="open"),

    # ---- Gojo -----------------------------------------------------------
    "g_idle": _p(lean=2, neck=-4, ua_n=14, fa_n=-22, ua_f=8, fa_f=-24, th_n=8, sh_n=4, th_f=-6, sh_f=-4,
                 hand_n="fist", hand_f="fist"),          # hands in pockets read
    "g_crouch_perch": _p(lean=24, neck=10, ua_n=40, fa_n=10, ua_f=30, fa_f=4, th_n=100, sh_n=-30, th_f=80,
                         sh_f=-50, hand_n="open", hand_f="open"),
    "g_point": _p(lean=4, neck=-2, ua_n=78, fa_n=92, ua_f=8, fa_f=-20, th_n=10, sh_n=4, th_f=-8, sh_f=-6,
                  hand_n="point", hand_f="fist"),
    "g_two_finger": _p(lean=2, neck=0, ua_n=40, fa_n=150, ua_f=8, fa_f=-20, th_n=8, sh_n=4, th_f=-6, sh_f=-4,
                       hand_n="sign", hand_f="fist"),     # fingers up near chest/face
    "g_guard": _p(lean=10, neck=4, ua_n=32, fa_n=118, ua_f=20, fa_f=100, th_n=22, sh_n=-4, th_f=-18, sh_f=-24,
                  hand_n="open", hand_f="open"),
    "g_jab": _p(lean=16, ua_n=88, fa_n=90, ua_f=26, fa_f=120, th_n=34, sh_n=2, th_f=-26, sh_f=-36),
    "g_palm": _p(lean=22, ua_n=90, fa_n=96, ua_f=-26, fa_f=40, th_n=42, sh_n=0, th_f=-34, sh_f=-44,
                 hand_n="open", hand_f="open"),
    "g_elbow": _p(lean=26, neck=-2, ua_n=70, fa_n=-60, ua_f=-20, fa_f=60, th_n=38, sh_n=0, th_f=-30, sh_f=-40),
    "g_knee": _p(lean=-4, ua_n=50, fa_n=110, ua_f=-30, fa_f=40, th_n=100, sh_n=-10, th_f=-4, sh_f=-4),
    "g_roundhouse": _p(lean=-30, neck=-6, ua_n=-30, fa_n=-10, ua_f=60, fa_f=100, th_n=104, sh_n=100, th_f=-4,
                       sh_f=-8, hand_n="open", hand_f="open"),
    "g_heel_drop": _p(lean=-6, ua_n=-20, fa_n=10, ua_f=40, fa_f=80, th_n=170, sh_n=176, th_f=0, sh_f=-4),
    "g_dodge_lean": _p(lean=-24, neck=-14, ua_n=10, fa_n=-20, ua_f=0, fa_f=-24, th_n=24, sh_n=10, th_f=-20,
                       sh_f=-14, hand_n="fist", hand_f="fist"),
    "g_slip": _p(lean=34, neck=20, ua_n=30, fa_n=100, ua_f=10, fa_f=90, th_n=60, sh_n=-20, th_f=-30, sh_f=-60,
                 hand_n="open", hand_f="open"),
    "g_blue": _p(lean=6, neck=-2, ua_n=84, fa_n=94, ua_f=6, fa_f=-12, th_n=14, sh_n=4, th_f=-10, sh_f=-8,
                 hand_n="point", hand_f="fist"),
    "g_red": _p(lean=18, neck=0, ua_n=90, fa_n=90, ua_f=-20, fa_f=20, th_n=36, sh_n=0, th_f=-30, sh_f=-40,
                hand_n="point", hand_f="fist"),
    "g_purple_prep": _p(lean=0, neck=4, ua_n=64, fa_n=110, ua_f=36, fa_f=72, th_n=10, sh_n=-10, th_f=-8, sh_f=-28,
                        hand_n="point", hand_f="point"),
    "g_purple_join": _p(lean=4, neck=4, ua_n=70, fa_n=96, ua_f=62, fa_f=94, th_n=10, sh_n=-10, th_f=-8, sh_f=-28,
                        hand_n="point", hand_f="point"),
    "g_purple_fire": _p(lean=10, neck=0, ua_n=90, fa_n=90, ua_f=-10, fa_f=30, th_n=18, sh_n=-6, th_f=-14,
                        sh_f=-34, hand_n="point", hand_f="open"),
    "g_domain_sign": _p(lean=2, neck=6, ua_n=36, fa_n=162, ua_f=6, fa_f=-6, th_n=10, sh_n=-6, th_f=-6, sh_f=-24,
                        hand_n="sign", hand_f="open"),
    "g_blindfold_pull": _p(lean=0, neck=-6, ua_n=44, fa_n=170, ua_f=6, fa_f=-14, th_n=8, sh_n=4, th_f=-6,
                           sh_f=-4, hand_n="claw", hand_f="fist"),
    "g_tired": _p(lean=10, neck=10, ua_n=6, fa_n=0, ua_f=-4, fa_f=-8, th_n=16, sh_n=0, th_f=-12, sh_f=-10,
                  hand_n="open", hand_f="open"),
    "g_fly_dash": _p(lean=70, neck=-20, ua_n=-50, fa_n=-40, ua_f=-60, fa_f=-50, th_n=-60, sh_n=-80, th_f=-80,
                     sh_f=-100, hand_n="open", hand_f="open"),

    # ---- front view (n = screen-right limb, f = screen-left limb) --------
    "front_stand": _p(lean=0, ua_n=10, fa_n=6, ua_f=10, fa_f=6, th_n=6, sh_n=4, th_f=6, sh_f=4),
    "front_power": _p(lean=0, ua_n=16, fa_n=10, ua_f=16, fa_f=10, th_n=12, sh_n=8, th_f=12, sh_f=8),
    "front_pockets": _p(lean=0, ua_n=14, fa_n=-20, ua_f=14, fa_f=-20, th_n=5, sh_n=3, th_f=6, sh_f=4),
    "front_hover": _p(lean=0, ua_n=18, fa_n=24, ua_f=18, fa_f=24, th_n=8, sh_n=-4, th_f=10, sh_f=-10),
    "front_arms_out": _p(lean=0, ua_n=70, fa_n=80, ua_f=70, fa_f=80, th_n=8, sh_n=4, th_f=8, sh_f=4,
                         hand_n="open", hand_f="open"),
    "front_sign": _p(lean=0, ua_n=30, fa_n=150, ua_f=12, fa_f=8, th_n=6, sh_n=4, th_f=6, sh_f=4,
                     hand_n="sign", hand_f="open"),
    "front_tired": _p(lean=0, neck=12, ua_n=8, fa_n=4, ua_f=8, fa_f=4, th_n=8, sh_n=2, th_f=8, sh_f=2,
                      hand_n="open", hand_f="open"),
}

_ANGLE_KEYS = ["lean", "neck", "ua_n", "fa_n", "ua_f", "fa_f", "th_n", "sh_n", "th_f", "sh_f"]


def blend(a: dict, b: dict, u: float) -> dict:
    out = {}
    for k in _ANGLE_KEYS:
        out[k] = a[k] + (b[k] - a[k]) * u
    out["hand_n"] = b["hand_n"] if u > 0.5 else a["hand_n"]
    out["hand_f"] = b["hand_f"] if u > 0.5 else a["hand_f"]
    return out


def P(name_or_dict, **over) -> dict:
    """Fetch a pose by name, optionally overriding keys: P('t_punch', lean=30)."""
    d = dict(POSES[name_or_dict]) if isinstance(name_or_dict, str) else dict(name_or_dict)
    d.update(over)
    return d


def pose_at(t: float, keys, ease: str = "inout") -> dict:
    """keys: [(time, pose_name_or_dict[, ease]), ...]."""
    def get(k):
        return P(k[1]) if isinstance(k[1], str) else k[1]
    if t <= keys[0][0]:
        return get(keys[0])
    for i in range(1, len(keys)):
        if t <= keys[i][0]:
            k0, k1 = keys[i - 1], keys[i]
            span = k1[0] - k0[0]
            u = 1.0 if span <= 0 else (t - k0[0]) / span
            e = EASE[k1[2] if len(k1) > 2 else ease]
            return blend(get(k0), get(k1), e(clamp(u)))
    return get(keys[-1])


# --------------------------------------------------------------------------
# skeleton solve
# --------------------------------------------------------------------------

def _dir(a_deg, facing, view):
    a = math.radians(a_deg)
    return (math.sin(a) * facing, -math.cos(a))


def solve(st: Style, pose: dict, x: float, y: float | None, facing: int = 1, scale: float = 1.0,
          view: str = "side", ground: float = 0.0):
    """Return dict of joint positions in world space."""
    s = scale
    lean = math.radians(pose["lean"])
    sd = (math.sin(lean) * facing, math.cos(lean))       # spine direction (pelvis -> chest)

    def build(px, py):
        J = {"pelvis": (px, py)}
        chest = (px + sd[0] * st.spine * s, py + sd[1] * st.spine * s)
        J["chest"] = chest
        na = lean + math.radians(pose["neck"])
        nd = (math.sin(na) * facing, math.cos(na))
        neck_top = (chest[0] + sd[0] * st.neck * s, chest[1] + sd[1] * st.neck * s)
        J["neck"] = neck_top
        J["head"] = (neck_top[0] + nd[0] * st.head_r * s * 0.95, neck_top[1] + nd[1] * st.head_r * s * 0.95)
        J["head_dir"] = nd
        sh = (chest[0] - sd[0] * 0.05 * s, chest[1] - sd[1] * 0.05 * s)
        if view == "front":
            off = st.w_chest * 0.5 * s
            perp = (sd[1], -sd[0])
            shoulders = {"n": (sh[0] + perp[0] * off, sh[1] + perp[1] * off),
                         "f": (sh[0] - perp[0] * off, sh[1] - perp[1] * off)}
            hipoff = st.w_waist * 0.32 * s
            hips = {"n": (px + perp[0] * hipoff, py + perp[1] * hipoff),
                    "f": (px - perp[0] * hipoff, py - perp[1] * hipoff)}
        else:
            shoulders = {"n": sh, "f": (sh[0] - facing * 0.02 * s, sh[1] + 0.01 * s)}
            hips = {"n": (px, py), "f": (px - facing * 0.03 * s, py + 0.01 * s)}
        for side in ("n", "f"):
            fac = facing if view == "side" else (1 if side == "n" else -1)
            sx, sy = shoulders[side]
            d1 = _dir(pose[f"ua_{side}"], fac, view)
            el = (sx + d1[0] * st.upper_arm * s, sy + d1[1] * st.upper_arm * s)
            d2 = _dir(pose[f"fa_{side}"], fac, view)
            wr = (el[0] + d2[0] * st.forearm * s, el[1] + d2[1] * st.forearm * s)
            J[f"sh_{side}"], J[f"el_{side}"], J[f"wr_{side}"] = (sx, sy), el, wr
            J[f"hand_dir_{side}"] = d2
            hx, hy = hips[side]
            d3 = _dir(pose[f"th_{side}"], fac, view)
            kn = (hx + d3[0] * st.thigh * s, hy + d3[1] * st.thigh * s)
            d4 = _dir(pose[f"sh_{side}"], fac, view)
            an = (kn[0] + d4[0] * st.shin * s, kn[1] + d4[1] * st.shin * s)
            if view == "front":
                toe = (an[0] + 0.03 * fac * s, an[1] - 0.02 * s)
            else:
                d5 = _dir(pose[f"sh_{side}"] + 90, fac, view)
                toe = (an[0] + d5[0] * st.foot * s, an[1] + d5[1] * st.foot * s)
            J[f"hip_{side}"], J[f"kn_{side}"], J[f"an_{side}"], J[f"toe_{side}"] = (hx, hy), kn, an, toe
        return J

    if y is None:
        J = build(x, 0.0)
        low = min(J["an_n"][1], J["an_f"][1], J["toe_n"][1], J["toe_f"][1], J["kn_n"][1] - 0.06 * s,
                  J["kn_f"][1] - 0.06 * s)
        J = build(x, ground - low + 0.03 * s)
    else:
        J = build(x, y)
    J["facing"] = facing
    J["scale"] = s
    J["view"] = view
    return J


# --------------------------------------------------------------------------
# drawing
# --------------------------------------------------------------------------

def _capsule(fr, a, b, w0, w1, color, dx=0.0, dy=0.0):
    ax, ay = a[0] + dx, a[1] + dy
    bx, by = b[0] + dx, b[1] + dy
    vx, vy = bx - ax, by - ay
    L = math.hypot(vx, vy) or 1e-6
    nx, ny = -vy / L, vx / L
    fr.poly([(ax + nx * w0 / 2, ay + ny * w0 / 2), (bx + nx * w1 / 2, by + ny * w1 / 2),
             (bx - nx * w1 / 2, by - ny * w1 / 2), (ax - nx * w0 / 2, ay - ny * w0 / 2)], color)
    fr.circle(ax, ay, w0 / 2, fill=color)
    fr.circle(bx, by, w1 / 2, fill=color)


def _hand(fr, st, J, side, kind, color, skin, s, dx=0.0, dy=0.0):
    wx, wy = J[f"wr_{side}"]
    d = J[f"hand_dir_{side}"]
    r = st.fist * s
    cx, cy = wx + d[0] * r * 0.9 + dx, wy + d[1] * r * 0.9 + dy
    if kind == "open":
        fr.ellipse(cx + d[0] * r * 0.4, cy + d[1] * r * 0.4, r * 0.85, r * 0.85, fill=skin)
    elif kind == "point":
        fr.circle(cx, cy, r * 0.85, fill=skin)
        fr.line([(cx, cy), (cx + d[0] * r * 2.4, cy + d[1] * r * 2.4)], skin, width_m=r * 0.5)
    elif kind == "sign":
        fr.circle(cx, cy, r * 0.85, fill=skin)
        up = (-d[1] * J["facing"], d[0] * J["facing"]) if False else (d[0], d[1])
        fr.line([(cx, cy), (cx + up[0] * r * 2.2 - 0.01, cy + up[1] * r * 2.2)], skin, width_m=r * 0.42)
        fr.line([(cx, cy), (cx + up[0] * r * 2.0 + 0.012, cy + up[1] * r * 2.0 + 0.01)], skin, width_m=r * 0.42)
    elif kind == "claw":
        fr.circle(cx, cy, r, fill=skin)
        for k in (-1, 0, 1):
            ang = math.atan2(d[1], d[0]) + k * 0.45
            fr.line([(cx, cy), (cx + math.cos(ang) * r * 1.7, cy + math.sin(ang) * r * 1.7)], skin,
                    width_m=r * 0.38)
    else:
        fr.circle(cx, cy, r, fill=skin)
    return cx, cy


def _stump(fr, st, J, side, s, dx=0.0, dy=0.0, rim=False):
    """Lost forearm: a short stump below the elbow, cauterised/raw end."""
    ex, ey = J[f"el_{side}"]
    d = J[f"hand_dir_{side}"]
    tip = (ex + d[0] * st.forearm * s * 0.25, ey + d[1] * st.forearm * s * 0.25)
    _capsule(fr, (ex, ey), tip, st.w_fa * s, st.w_fa * 0.9 * s, (20, 20, 26) if st.name == "gojo" else st.suit, dx, dy)
    if not rim:
        fr.circle(tip[0] + dx, tip[1] + dy, st.w_fa * 0.45 * s, fill=(120, 20, 26))


def _head(fr, st, J, s, colors, opts, dx=0.0, dy=0.0, rim=False):
    hx, hy = J["head"]
    hx += dx
    hy += dy
    f = J["facing"]
    r = st.head_r * s
    hd = J["head_dir"]                       # up-vector of the head
    fwd = (hd[1] * f, -hd[0] * f)            # face direction
    if J["view"] == "front":
        fwd = (0.0, 0.0)

    def at(u, v):                             # u along face direction, v along head up, in head radii
        return (hx + (fwd[0] * u + hd[0] * v) * r, hy + (fwd[1] * u + hd[1] * v) * r)

    skin, hair = colors["skin"], colors["hair"]
    # neck
    nx, ny = J["neck"]
    fr.line([(nx + dx, ny + dy), (hx, hy)], skin if not rim else colors["skin"], width_m=r * (1.1 if st.name == "thragg" else 0.8))
    if st.name == "gojo" and not rim:
        # high collar of the uniform
        cx, cy = J["neck"]
        fr.line([(cx + dx - hd[0] * r * 0.4, cy + dy - hd[1] * r * 0.4), (cx + dx + hd[0] * r * 0.3, cy + dy + hd[1] * r * 0.3)],
                colors["suit"], width_m=r * 1.25)
    fr.ellipse(hx, hy, r * 0.95, r * 1.05, fill=skin)
    if rim:
        # rim pass: hair silhouette only
        pass
    if st.name == "gojo":
        down = opts.get("hair_down", False)
        spikes = []
        n = 11
        for i in range(n + 1):
            a = math.radians(-40 + 250 * i / n)       # sweep from front-top over back
            rr = 1.18 if i % 2 == 0 else (1.55 if not down else 1.2)
            if down and i < 3:
                rr = 1.05
            ux, vy = math.cos(a), math.sin(a)
            spikes.append(at(ux * rr, vy * rr + (0.15 if not down else 0.0)))
        spikes.append(at(-0.9, -0.2))
        spikes.append(at(0.2, 0.25 if not down else -0.05))
        fr.poly(spikes, hair)
        if down:
            fr.poly([at(0.3, 0.6), at(1.05, 0.2), at(0.95, -0.25), at(0.55, 0.15)], hair)
        if not rim:
            eyes = opts.get("eyes", "blindfold")        # 'blindfold' | 'open' | 'glasses' | 'narrow'
            if eyes == "blindfold":
                fr.poly([at(1.02, 0.28), at(1.02, -0.02), at(-0.9, 0.05), at(-0.9, 0.35)], colors["accent"])
            elif eyes == "glasses":
                fr.poly([at(1.06, 0.18), at(1.06, -0.06), at(0.45, -0.06), at(0.45, 0.18)], colors["accent"])
            else:
                ex, ey = at(0.7, 0.08)
                er = r * (0.16 if eyes == "open" else 0.09)
                fr.ellipse(ex, ey, er * 1.3, er, fill=(235, 250, 255))
                fr.circle(ex + fwd[0] * er * 0.3, ey, er * 0.75, fill=(70, 200, 255))
                fr.glow_circle(ex, ey, er * 2.2, (40, 120, 200))
            smile = opts.get("mouth", "smirk")
            mx, my = at(0.85, -0.5)
            if smile == "smirk":
                fr.line([(mx - fwd[0] * r * 0.25, my + 0.006 * s), (mx, my - 0.004 * s), (mx + fwd[0] * r * 0.08, my + 0.012 * s)],
                        (120, 70, 70), width_m=r * 0.07)
            else:
                fr.line([(mx - fwd[0] * r * 0.25, my), (mx + fwd[0] * r * 0.05, my)], (120, 70, 70), width_m=r * 0.07)
    else:  # thragg
        # close-cropped black hair: a tight cap following the skull
        hairpts = [at(0.72, 0.5), at(0.45, 0.98), at(-0.1, 1.1), at(-0.7, 0.92), at(-1.0, 0.45),
                   at(-0.98, -0.05), at(-0.78, -0.12), at(-0.6, 0.4), at(0.2, 0.62)]
        fr.poly(hairpts, hair)
        if not rim:
            # brow ridge + eye slit
            fr.line([at(0.55, 0.32), at(1.0, 0.24)], (90, 70, 66), width_m=r * 0.14)
            ex, ey = at(0.8, 0.14)
            mood = opts.get("eyes", "cold")
            fr.ellipse(ex, ey, r * 0.12, r * (0.045 if mood == "cold" else 0.09), fill=(24, 20, 24))
            # mustache: thick, drooping past the mouth corners
            fr.poly([at(1.0, -0.22), at(0.98, -0.42), at(0.6, -0.7), at(0.45, -0.66), at(0.62, -0.38),
                     at(0.7, -0.22)], hair)
            fr.line([at(0.72, -0.58), at(0.96, -0.56)], (110, 60, 60), width_m=r * 0.06)
            # jaw
            fr.line([at(0.82, -0.86), at(0.2, -0.95)], shade(skin, 0.85), width_m=r * 0.08)
    if not rim:
        for inj in opts.get("injuries", []):
            if inj == "mouth_blood":
                mx, my = at(0.82, -0.6)
                fr.line([(mx, my), (mx - fwd[0] * r * 0.1, my - r * 0.45)], (150, 10, 18), width_m=r * 0.07)
            elif inj == "nosebleed":
                mx, my = at(0.95, -0.25)
                fr.line([(mx, my), (mx, my - r * 0.35)], (160, 10, 18), width_m=r * 0.06)
            elif inj == "brow_cut":
                bx, by = at(0.7, 0.42)
                fr.line([(bx - r * 0.2, by + r * 0.12), (bx + r * 0.15, by - r * 0.1)], (150, 10, 18), width_m=r * 0.07)
                fr.line([(bx, by), (bx, by - r * 0.5)], (140, 10, 18), width_m=r * 0.05)
            elif inj == "eye_blood":
                ex, ey = at(0.8, 0.1)
                fr.line([(ex, ey), (ex, ey - r * 0.5)], (150, 8, 16), width_m=r * 0.05)
            elif inj == "bruise":
                bx, by = at(0.6, -0.1)
                fr.ellipse(bx, by, r * 0.22, r * 0.18, fill=(150, 110, 140))
            elif inj == "lung_ruptured":
                mx, my = at(0.8, -0.62)
                fr.line([(mx, my), (mx - fwd[0] * r * 0.05, my - r * 0.6)], (190, 40, 50), width_m=r * 0.1)
            elif inj in ("ear_torn", "ear_blood"):
                ex, ey = at(-0.15, 0.0)
                fr.ellipse(ex, ey, r * 0.16, r * 0.2, fill=(130, 14, 22) if inj == "ear_torn" else None,
                           outline=(130, 14, 22), width=1)
                fr.line([(ex, ey), (ex, ey - r * 0.9)], (140, 10, 18), width_m=r * 0.06)
            elif inj == "cheek_cut":
                cx_, cy_ = at(0.55, -0.15)
                fr.line([(cx_ - r * 0.15, cy_ + r * 0.05), (cx_ + r * 0.12, cy_ - r * 0.04)], (170, 14, 22), width_m=r * 0.05)
                fr.line([(cx_, cy_), (cx_, cy_ - r * 0.3)], (150, 10, 18), width_m=r * 0.035)
            elif inj == "nosebleed_trace":
                mx, my = at(0.95, -0.25)
                fr.line([(mx, my), (mx, my - r * 0.25)], (110, 20, 26), width_m=r * 0.04)


def left_side(facing: int, view: str = "side") -> str:
    """Which rig side ('n' near / 'f' far) is the character's LEFT. Camera
    faces north: facing west (-1) shows the left side to camera."""
    if view == "front":
        return "n"          # front view: character's left is screen-right
    return "n" if facing == -1 else "f"


def draw_fighter(fr, st: Style, pose: dict, x: float, y: float | None = None, facing: int = 1,
                 scale: float = 1.0, view: str = "side", opts: dict | None = None, ground: float = 0.0,
                 silhouette=None, rim_dir=(0.6, 0.5), depth: float = 1.0):
    """Draw a fighter. opts:
       eyes:     gojo 'blindfold'|'open'|'glasses'|'narrow';  thragg 'cold'|'wide'
       hair_down (gojo), mouth 'smirk'|'flat'
       injuries: ['mouth_blood','nosebleed','brow_cut','eye_blood','bruise','torn_suit','purple_graze',
                  'burned_suit','bleeding_arm']
       rim:      False to disable rim light
    Returns the joint dict (useful for attaching effects to hands etc.)."""
    opts = opts or {}
    inj = set(opts.get("injuries", []))
    lost = left_side(facing, view) if "forearm_lost" in inj else None
    prev_depth = fr.depth
    fr.depth = depth
    J = solve(st, pose, x, y, facing, scale, view, ground)
    s = scale
    colors = dict(suit=st.suit, suit_hi=st.suit_hi, skin=st.skin, hair=st.hair, accent=st.accent)
    if silhouette is not None:
        colors = {k: silhouette for k in colors}

    def cape(cmap, dx=0.0, dy=0.0):
        """Thragg's crimson Grand Regent cape (entrance only; torn away by Red
        in Seq 3 -> opts['cape'] = 'full' | 'torn' | None)."""
        kind = opts.get("cape")
        if st.name != "thragg" or not kind:
            return
        sx, sy = J["sh_f"]
        cx, cy = J["chest"]
        f = J["facing"]
        wind = opts.get("cape_wind", (-0.6 * f, -0.2))          # direction the cape streams toward
        flutter = math.sin(fr.t * 9.0 + x) * 0.08
        L = (1.35 if kind == "full" else 0.55) * s
        bx, by = sx + wind[0] * L * 0.7 - f * 0.12 * s, sy - L * (1 - abs(wind[0]) * 0.5) + wind[1] * L * 0.3
        pts = [(cx + f * 0.05 * s + dx, cy + 0.02 * s + dy), (sx - f * 0.18 * s + dx, sy + 0.04 * s + dy),
               (bx - f * 0.25 * s + dx, by + flutter * s + dy)]
        if kind == "torn":
            for k in range(4):
                pts.append((bx + f * (0.05 - 0.09 * k) * s + dx, by + (0.12 if k % 2 else -0.04) * s + dy))
        pts.append((bx + f * 0.35 * s + dx, by - flutter * s * 0.5 + dy))
        col = cmap["accent"] if silhouette is None else cmap["accent"]
        fr.poly(pts, shade(col, 0.7) if silhouette is None else col)

    def body(cmap, dx=0.0, dy=0.0, rim=False):
        cape(cmap, dx, dy)
        far = {k: shade(v, 0.62) if k != "accent" else v for k, v in cmap.items()} if not rim and silhouette is None else cmap
        # far limbs
        _capsule(fr, J["hip_f"], J["kn_f"], st.w_th * s, st.w_th * 0.8 * s, far["suit"], dx, dy)
        _capsule(fr, J["kn_f"], J["an_f"], st.w_sh * s, st.w_sh * 0.8 * s, far["suit"], dx, dy)
        _capsule(fr, J["an_f"], J["toe_f"], st.w_sh * 0.7 * s, st.w_sh * 0.5 * s,
                 far["accent"] if st.name == "thragg" else far["suit"], dx, dy)
        _capsule(fr, J["sh_f"], J["el_f"], st.w_ua * s, st.w_fa * s, far["suit"], dx, dy)
        if lost != "f":
            _capsule(fr, J["el_f"], J["wr_f"], st.w_fa * s, st.w_fa * 0.85 * s,
                     far["suit"] if st.name == "gojo" else far["suit"], dx, dy)
            _hand(fr, st, J, "f", pose["hand_f"], None, far["skin"] if st.name == "gojo" else far["accent"], s, dx, dy)
        else:
            _stump(fr, st, J, "f", s, dx, dy, rim)
        # torso
        px, py = J["pelvis"]
        cx, cy = J["chest"]
        vx, vy = cx - px, cy - py
        L = math.hypot(vx, vy) or 1e-6
        nx, ny = -vy / L, vx / L
        wc, ww = st.w_chest * s / 2, st.w_waist * s / 2
        if J["view"] == "side":
            wc *= 0.86 if st.name == "thragg" else 0.72
        torso = [(px + nx * ww + dx, py + ny * ww + dy), (cx + nx * wc + dx, cy + ny * wc + dy),
                 (cx + vx / L * 0.06 * s - nx * wc * 0.2 + dx, cy + vy / L * 0.06 * s - ny * wc * 0.2 + dy),
                 (cx - nx * wc + dx, cy - ny * wc + dy), (px - nx * ww + dx, py - ny * ww + dy)]
        fr.poly(torso, cmap["suit"])
        if not rim and silhouette is None:
            if st.name == "thragg":
                # red Viltrumite accents: shoulder yoke + belt
                fr.poly([(cx + nx * wc + dx, cy + ny * wc + dy), (cx - nx * wc + dx, cy - ny * wc + dy),
                         (cx - nx * wc * 0.6 - vx / L * 0.16 * s + dx, cy - ny * wc * 0.6 - vy / L * 0.16 * s + dy),
                         (cx + nx * wc * 0.6 - vx / L * 0.16 * s + dx, cy + ny * wc * 0.6 - vy / L * 0.16 * s + dy)],
                        cmap["accent"])
                bx, by = px + vx * 0.12, py + vy * 0.12
                fr.line([(bx + nx * ww * 1.02, by + ny * ww * 1.02), (bx - nx * ww * 1.02, by - ny * ww * 1.02)],
                        cmap["accent"], width_m=0.06 * s)
                # short Grecian-style skirt (pteruges) over the hips
                sk = 0.2 * s
                fr.poly([(px + nx * ww * 1.05, py + ny * ww * 1.05), (px - nx * ww * 1.05, py - ny * ww * 1.05),
                         (px - nx * ww * 1.2 - vx / L * sk, py - ny * ww * 1.2 - vy / L * sk),
                         (px + nx * ww * 1.2 - vx / L * sk, py + ny * ww * 1.2 - vy / L * sk)], shade(cmap["suit"], 0.9))
                fr.line([(px + nx * ww * 1.2 - vx / L * sk, py + ny * ww * 1.2 - vy / L * sk),
                         (px - nx * ww * 1.2 - vx / L * sk, py - ny * ww * 1.2 - vy / L * sk)], cmap["accent"], width_m=0.025 * s)
                # circular Viltrum emblem on the chest
                ex, ey = cx - vx / L * 0.16 * s, cy - vy / L * 0.16 * s
                fr.circle(ex, ey, 0.06 * s, fill=cmap["accent"])
                for k in (-1, 0, 1):
                    fr.line([(ex + nx * 0.02 * k * s - vx / L * 0.05 * s, ey + ny * 0.02 * k * s - vy / L * 0.05 * s),
                             (ex + nx * 0.02 * k * s + vx / L * 0.05 * s, ey + ny * 0.02 * k * s + vy / L * 0.05 * s)],
                            cmap["suit_hi"], width_m=0.008 * s)
            else:
                # uniform front seam highlight
                fr.line([(px + dx, py + dy), (cx + dx, cy + dy)], cmap["suit_hi"], width_m=0.012 * s)
            for inj in opts.get("injuries", []):
                rng = fr.srng(f"inj{st.name}{inj}")
                if inj in ("torn_suit", "burned_suit"):
                    for k in range(5 if inj == "torn_suit" else 7):
                        u = rng.uniform(0.15, 0.85)
                        w = rng.uniform(-0.7, 0.7)
                        ox, oy = px + vx * u + nx * ww * w, py + vy * u + ny * ww * w
                        sz = rng.uniform(0.03, 0.07) * s
                        col = shade(cmap["skin"], 0.9) if inj == "torn_suit" else (40, 30, 30)
                        fr.poly([(ox - sz, oy), (ox, oy + sz * 1.4), (ox + sz * 0.9, oy - sz * 0.2),
                                 (ox + sz * 0.2, oy - sz * 1.1)], col)
                if inj in ("flank_flayed",) and J["view"] == "side":
                    side = left_side(J["facing"])
                    k = 1.0 if side == "n" else -0.6
                    fr.poly([(px + nx * ww * 0.9 * k, py + ny * ww * 0.9 * k),
                             (cx + nx * wc * 0.95 * k, cy + ny * wc * 0.95 * k),
                             (cx + nx * wc * 0.2 * k - vx * 0.15, cy + ny * wc * 0.2 * k - vy * 0.15),
                             (px + nx * ww * 0.1 * k + vx * 0.15, py + ny * ww * 0.1 * k + vy * 0.15)], (150, 30, 36))
                    fr.line([(px + nx * ww * 0.5 * k + vx * 0.2, py + ny * ww * 0.5 * k + vy * 0.2),
                             (cx + nx * wc * 0.5 * k - vx * 0.2, cy + ny * wc * 0.5 * k - vy * 0.2)], (210, 190, 180), width_m=0.012 * s)
                if inj in ("cracked_ribs", "chest_burn"):
                    fr.ellipse(cx - vx / L * 0.18 * s, cy - vy / L * 0.18 * s, 0.09 * s, 0.07 * s,
                               fill=(70, 40, 40) if inj == "chest_burn" else (120, 90, 120))
                if inj == "chest_destroyed":
                    fr.ellipse(cx - vx / L * 0.22 * s, cy - vy / L * 0.22 * s, 0.14 * s, 0.12 * s, fill=(60, 8, 14))
                    fr.glow_circle(cx - vx / L * 0.22 * s, cy - vy / L * 0.22 * s, 0.12 * s, (90, 20, 20))
                if inj == "jacket_torn_shoulder":
                    sxx, syy = J["sh_" + left_side(J["facing"])]
                    fr.poly([(sxx - 0.05 * s, syy), (sxx, syy + 0.06 * s), (sxx + 0.06 * s, syy - 0.02 * s),
                             (sxx, syy - 0.08 * s)], (110, 30, 36))
                if inj == "purple_graze":
                    # a scooped-out wound on the near shoulder/upper arm, edges cauterised
                    sx, sy = J["sh_n"]
                    fr.ellipse(sx, sy - 0.04 * s, 0.09 * s, 0.07 * s, fill=(70, 18, 30))
                    fr.ellipse(sx, sy - 0.04 * s, 0.07 * s, 0.05 * s, fill=(120, 30, 50))
                    fr.glow_circle(sx, sy - 0.04 * s, 0.06 * s, (60, 20, 80))
        # head
        _head(fr, st, J, s, cmap, opts, dx, dy, rim=rim or silhouette is not None)
        # near limbs
        _capsule(fr, J["hip_n"], J["kn_n"], st.w_th * s, st.w_th * 0.8 * s, cmap["suit"], dx, dy)
        _capsule(fr, J["kn_n"], J["an_n"], st.w_sh * s, st.w_sh * 0.8 * s, cmap["suit"], dx, dy)
        _capsule(fr, J["an_n"], J["toe_n"], st.w_sh * 0.7 * s, st.w_sh * 0.5 * s,
                 cmap["accent"] if st.name == "thragg" else cmap["suit"], dx, dy)
        _capsule(fr, J["sh_n"], J["el_n"], st.w_ua * s, st.w_fa * s, cmap["suit"], dx, dy)
        if lost != "n":
            _capsule(fr, J["el_n"], J["wr_n"], st.w_fa * s, st.w_fa * 0.85 * s, cmap["suit"], dx, dy)
            _hand(fr, st, J, "n", pose["hand_n"], None,
                  cmap["skin"] if st.name == "gojo" else cmap["accent"], s, dx, dy)
        else:
            _stump(fr, st, J, "n", s, dx, dy, rim)

    if opts.get("rim", True) and silhouette is None:
        rim_off = 0.018 * s
        rc = mix_color(st.rim, (255, 255, 255), 0.1)
        body({k: rc for k in colors}, rim_dir[0] * rim_off, rim_dir[1] * rim_off, rim=True)
    body(colors)
    fr.depth = prev_depth
    J["depth"] = depth
    return J


def hand_pos(J, side="n", ahead=0.06):
    wx, wy = J[f"wr_{side}"]
    d = J[f"hand_dir_{side}"]
    s = J["scale"]
    return (wx + d[0] * ahead * s, wy + d[1] * ahead * s)
