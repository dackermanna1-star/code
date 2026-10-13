"""Sequence 5 - HOLLOW PURPLE (S5-01 .. S5-14).

Seq 4 ended with Gojo EAST of Thragg in open sky, so the sequence opens with
screen direction reversed (S5-01, S5-02). Gojo relocates west over Thragg in
S5-03 and from there on the film's standard holds: Gojo screen-left, Thragg
screen-right, Thragg attacks right -> left.

Purple is built in readable stages: two separate techniques (S5-05, S5-06),
the world reacting (S5-07), the cost in Gojo's eyes (S5-08); Thragg reads that
Gojo needs TIME and launches down the line (S5-09); release, corkscrew, the
shell takes the left forearm (S5-10); the stalled counter and the wake
(S5-11); the clean channel through four eastern towers (S5-12); aftermath
(S5-13, S5-14). Everything plays in real time (no slow motion).

Timing: beats are authored against the nominal shot lengths in NOM and scaled
by fr.n / NOM (T()), so every shot still works if its length changes by a
few frames. Contact frames are read from the shot's own sfx cues (cue()).
"""
from __future__ import annotations

import math
import random

from PIL import Image, ImageDraw, ImageFilter

import scenes.common as C
from engine import Cam, kf, clamp, EASE, lerp, mix_color, shade, PAL, FPS, OUT_W, OUT_H
import env
import fx
import inserts
import rig
from rig import GOJO, THRAGG, P, pose_at, draw_fighter, hand_pos, solve

SEQ = 5

NOM = {"S5-01": 40, "S5-02": 60, "S5-03": 64, "S5-04": 30, "S5-05": 56, "S5-06": 60, "S5-07": 64,
       "S5-08": 50, "S5-09": 50, "S5-10": 28, "S5-11": 50, "S5-12": 112, "S5-13": 76, "S5-14": 100}

# Gojo's pelvis at the Purple position: head ~201.7, hands ~201.2 (S5-06 / S5-08)
G_X, G_Y = -20.0, 200.95
# Thragg's perch above the unfinished tower's west end (S5-02 .. S5-09)
T_X, T_Y = 82.0, 180.0
# the firing line: from Gojo (x=-20, y=200) through Thragg (x=+82, y=180)
SLOPE = -20.0 / 102.0


def line_y(x):
    return 200.0 + SLOPE * (x + 20.0)


# =============================================================================
# timing helpers
# =============================================================================

def _k(shot):
    return shot["frames"] / NOM.get(shot["id"], shot["frames"])


def T(fr, f):
    """Nominal frame f of this shot -> seconds (scaled to the real length)."""
    return f * _k(fr.shot) / FPS


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
    """Zoom keyframes interpolated geometrically (constant-rate push/pull)."""
    return math.exp(kf(t, [(k[0], math.log(k[1])) + tuple(k[2:]) for k in keys]))


def shake_n(t, t0, amp, frames):
    return C.shake(t, t0, amp, dur=frames / FPS)


# =============================================================================
# rig helpers
# =============================================================================
LIMBS = ["ua_n", "fa_n", "ua_f", "fa_f", "th_n", "sh_n", "th_f", "sh_f"]
HALO_G = (150, 190, 236)
HALO_T = (36, 30, 38)


def rot_pose(p, r):
    """Rotate the whole figure rigidly by r degrees toward its facing."""
    q = dict(p)
    q["lean"] = p["lean"] + r
    for k in LIMBS:
        q[k] = p[k] - r
    return q


def swap_sides(p):
    q = dict(p)
    for a, b in (("ua_n", "ua_f"), ("fa_n", "fa_f"), ("th_n", "th_f"), ("sh_n", "sh_f"), ("hand_n", "hand_f")):
        q[a], q[b] = p[b], p[a]
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


def ribs_point(J, st, down=0.24, out=0.05):
    sd, front = frame_dirs(J)
    cx, cy = J["chest"]
    s = J["scale"]
    return (cx - sd[0] * down * s + front[0] * out * s, cy - sd[1] * down * s + front[1] * out * s)


def _draw(fr, st, pose, x, y, facing, o, depth, scale, view, halo, halo_col):
    if halo > 0:
        off = halo / fr.cam.zoom * depth
        for dx, dy in ((off, 0), (-off, 0), (0, off), (0, -off)):
            draw_fighter(fr, st, pose, x + dx, y + dy, facing, scale=scale, view=view, opts=o, depth=depth,
                         silhouette=halo_col)
    return draw_fighter(fr, st, pose, x, y, facing, scale=scale, view=view, opts=o, depth=depth)


def gojo(fr, pose, x, y, facing=1, depth=1.0, scale=1.0, halo=0.0, switch=None, view="side", **kw):
    kw.setdefault("mouth", "flat")
    o = C.opts(fr, "gojo", switch=switch, **kw)
    return _draw(fr, GOJO, pose, x, y, facing, o, depth, scale, view, halo, HALO_G)


def thragg(fr, pose, x, y, facing=-1, depth=1.0, scale=1.0, halo=0.0, switch=None, **kw):
    o = C.opts(fr, "thragg", switch=switch, **kw)
    return _draw(fr, THRAGG, pose, x, y, facing, o, depth, scale, "side", halo, HALO_T)


def thragg_head_turned(fr, J, look=-1, **kw):
    """Redraw Thragg's head facing the other way (an over-the-shoulder glance)."""
    Jh = dict(J)
    hd = J["head_dir"]
    Jh["facing"] = -J["facing"]
    Jh["head_dir"] = (-hd[0], hd[1])
    o = C.opts(fr, "thragg", **kw)
    colors = dict(suit=THRAGG.suit, suit_hi=THRAGG.suit_hi, skin=THRAGG.skin, hair=THRAGG.hair, accent=THRAGG.accent)
    prev = fr.depth
    fr.depth = J.get("depth", 1.0)
    rig._head(fr, THRAGG, Jh, J["scale"], colors, o)
    fr.depth = prev


# ---- Gojo poses -------------------------------------------------------------
G_LOOSE = P("g_idle", ua_n=6, fa_n=2, ua_f=-4, fa_f=-3, hand_n="open", hand_f="open",
            th_n=8, sh_n=-12, th_f=-4, sh_f=-24)
G_ARMS_OUT = P(G_LOOSE, lean=4, neck=0, ua_n=90, fa_n=90, ua_f=86, fa_f=89, hand_n="open", hand_f="open")
G_YANK = P(G_LOOSE, lean=-14, neck=-8, ua_n=-26, fa_n=-18, ua_f=-32, fa_f=-24, th_n=-4, sh_n=-8, th_f=-7,
           sh_f=-12)
G_GLIDE = P(G_LOOSE, lean=22, neck=-8, ua_n=-12, fa_n=-8, ua_f=-16, fa_f=-12, th_n=-14, sh_n=-26, th_f=-22,
            sh_f=-34)

# ---- Thragg poses (legs hanging in the air) ---------------------------------
LEGS_AIR = dict(th_n=14, sh_n=-18, th_f=-6, sh_f=-30)
T_STILL = P("t_stand", lean=3, neck=4, ua_n=10, fa_n=14, ua_f=-6, fa_f=0, **LEGS_AIR)
T_FLY = P("t_fly_punch", lean=76, neck=-22, ua_n=40, fa_n=80, ua_f=50, fa_f=100, th_n=-62, sh_n=-90, th_f=-78,
          sh_f=-108)
T_WIND = P("t_fly_punch", lean=60, neck=-14, ua_n=-36, fa_n=150, ua_f=64, fa_f=120, th_n=-40, sh_n=-80, th_f=-64,
           sh_f=-106)
T_CROSS = P("t_fly_punch", lean=74, neck=-18, ua_n=97, fa_n=93, ua_f=-34, fa_f=20, th_n=-58, sh_n=-90, th_f=-76,
            sh_f=-108)
T_PLANT = P("t_stand", lean=-40, neck=-50, ua_n=10, fa_n=100, ua_f=34, fa_f=46, th_n=34, sh_n=4, th_f=12, sh_f=-16,
            hand_n="open", hand_f="open")


# =============================================================================
# drawing helpers
# =============================================================================

def soft_draw(fr, fn, radius=2.0, alpha=1.0, offset=(0.0, 0.0)):
    """Draw fn() into its own layer, blur it (shallow depth of field) and
    composite (optionally shifted by offset px at 1080p, e.g. camera shake)."""
    base, base_draw = fr.img, fr.draw
    layer = Image.new("RGBA", (fr.W, fr.H), (0, 0, 0, 0))
    fr.img, fr.draw = layer, ImageDraw.Draw(layer)
    try:
        res = fn()
    finally:
        fr.img, fr.draw = base, base_draw
    if radius > 0.2:
        layer = layer.filter(ImageFilter.GaussianBlur(radius * fr.ss))
    if alpha < 1.0:
        a = layer.getchannel("A").point(lambda v: int(v * alpha))
        layer.putalpha(a)
    base.paste(layer, (int(offset[0] * fr.ss), int(offset[1] * fr.ss)), layer)
    return res


def s2w(fr, u, v, d=1.0):
    c = fr.cam
    return (c.x + (u * OUT_W - OUT_W / 2) * d / c.zoom, c.y - (v * OUT_H - OUT_H / 2) * d / c.zoom)


def w2s(fr, x, y, d=1.0):
    px, py = fr.P(x, y, d)
    return px / fr.W, py / fr.H


def smoke_soft(fr, tg, state, alpha=110, lit=1.0):
    """env.smoke_columns, but translucent (the d=1 column from the gutted tower
    otherwise paints the whole frame flat at the fighters' altitude)."""
    if "smoke" not in state:
        return
    sources = [(40, 1.9), (55, 3.0), (95, 1.0)]
    if "purple_scar" in state:
        sources += [(200, 3.0), (320, 5.0), (140, 3.0)]
    img, dr = fr.layer()
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
            dr.ellipse([X - R, Y - R, X + R, Y + R], fill=c + (int(alpha * (1 - 0.55 * age)),))
    fr.merge(img)


def sky_plate(fr, extra=(), lit=1.0, smoke_alpha=95, tower_d=1.0, haze=0.0, layers=(0, 1, 2, 3), tower=True,
              shafts=1.0, blur=0.0, plate_cam=None, city_lit=1.0):
    """High-altitude backdrop with the sequence's damage state. haze pushes
    the skyline back (aerial perspective); blur softens it (long lens).
    plate_cam: draw the backdrop through a wider camera (a background plate
    for tight shots at altitude, where the engine's 1/d parallax would blow
    the distant skyline up into giant blocks)."""
    st = C.state(SEQ, *extra)
    tg = C.tg(fr)
    shot_cam = fr.cam
    if plate_cam is not None:
        fr.cam = plate_cam
    try:
        env.sky(fr, lit)
        env.clouds(fr, tg, lit=lit)

        def city():
            env.river(fr, lit)
            env.skyline(fr, st, layers=layers, lit=lit * city_lit, haze=haze)
            if plate_cam is not None and tower:
                env.unfinished_tower(fr, lit=lit, gutted="tower_gutted" in st, d=tower_d)
            if plate_cam is not None:
                smoke_soft(fr, tg, st, smoke_alpha, lit)
        if blur > 0:
            soft_draw(fr, city, radius=blur)
        else:
            city()
    finally:
        fr.cam = shot_cam
    if plate_cam is None:
        if tower:
            env.unfinished_tower(fr, lit=lit, gutted="tower_gutted" in st, d=tower_d)
        smoke_soft(fr, tg, st, smoke_alpha, lit)
    env.light_shafts(fr, st, strength=shafts)
    return st


GF_BITES = 3672 + 21      # mean global frame of the Purple's bites through the towers (S5-12 f0-42)


def afterglow(fr):
    """Violet afterglow on the channel's cut edges: fades over ~6.5 s from the
    bites, i.e. nearly gone by the end of S5-13 (VFX bible: 'a few seconds')."""
    if fr.gf < GF_BITES - 21:
        return 0.0
    return clamp(1 - (fr.gf - GF_BITES) / (6.5 * FPS))


def chip_poly(x, y, s, rot, n=4, rng=None):
    pts = []
    for k in range(n):
        a = rot + k * math.tau / n + (rng.uniform(-0.3, 0.3) if rng else 0)
        rr = s * (rng.uniform(0.6, 1.0) if rng else 0.8)
        pts.append((x + math.cos(a) * rr, y + math.sin(a) * rr))
    return pts


def debris_field(fr, t, x0, x1, y0, y1, n=30, d=1.0, salt="deb", drift=(-0.3, -0.4), size=(0.08, 0.3),
                 cull=None, glint=True, lit=1.0):
    """Floating Seq 4 debris (concrete chips, glass, tarp scraps) drifting
    slowly and tumbling. cull(x, y) -> True skips a piece."""
    rng = fr.srng(salt)
    for i in range(n):
        kind = ("chip", "chip", "glass", "tarp")[i % 4]
        bx, by = rng.uniform(x0, x1), rng.uniform(y0, y1)
        vx = drift[0] * rng.uniform(0.4, 1.6)
        vy = drift[1] * rng.uniform(0.4, 1.6)
        s = rng.uniform(*size)
        spin = rng.uniform(-2.5, 2.5)
        rot0 = rng.uniform(0, math.tau)
        sh = rng.uniform(0.7, 1.15)
        x, y = bx + vx * t, by + vy * t
        if cull is not None and cull(x, y):
            continue
        rot = rot0 + spin * t
        if kind == "chip":
            fr.poly(chip_poly(x, y, s, rot, 5, random.Random(i)), shade(PAL["concrete"], 0.75 * sh * lit), d=d)
        elif kind == "glass":
            g = 0.55 + 0.45 * abs(math.sin(t * 3 + i)) if glint else 0.7
            fr.poly(chip_poly(x, y, s * 0.8, rot, 3, random.Random(i)), shade(PAL["glass"], g * lit), d=d)
        else:
            c, sn = math.cos(rot), math.sin(rot)
            w, h = s * 1.4, s * 0.35 * (0.4 + 0.6 * abs(math.sin(t * 4 + i)))
            pts = [(x + c * w - sn * h, y + sn * w + c * h), (x - c * w - sn * h, y - sn * w + c * h),
                   (x - c * w + sn * h, y - sn * w - c * h), (x + c * w + sn * h, y + sn * w - c * h)]
            fr.poly(pts, shade((70, 92, 120) if i % 8 == 3 else (150, 90, 50), 0.8 * sh * lit), d=d)


def specks(fr, t, n=40, salt="specks", col=(150, 130, 120), drift=(-0.01, 0.006), size=(0.0015, 0.004),
           alpha=200):
    """Screen-space drifting debris specks (for close-ups)."""
    rng = fr.srng(salt)
    img, dr = fr.layer()
    for i in range(n):
        u = (rng.random() + drift[0] * t * rng.uniform(0.5, 1.5)) % 1.0
        v = (rng.random() + drift[1] * t * rng.uniform(0.5, 1.5)) % 1.0
        r = rng.uniform(*size) * fr.H
        a = int(alpha * rng.uniform(0.4, 1.0))
        dr.ellipse([u * fr.W - r, v * fr.H - r, u * fr.W + r, v * fr.H + r], fill=col + (a,))
    fr.merge(img)


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


def radial_shade(fr, X, Y, R, col, a_max, steps=14):
    """Soft radial darkening/tint centred on pixel (X, Y), radius R px: stacked
    discs whose combined opacity reaches a_max at the centre, 0 at the rim."""
    if a_max <= 0 or R <= 1:
        return
    a1 = 1 - (1 - min(0.99, a_max / 255.0)) ** (1.0 / steps)
    img, dr = fr.layer()
    for i in range(steps):
        rr = R * (1 - i / steps)
        dr.ellipse([X - rr, Y - rr, X + rr, Y + rr], fill=col + (max(1, int(255 * a1)),))
    fr.merge(img)


def arc_bolt(fr, a, b, rng, width_px=2.0, jag=0.12, n=7, col=(210, 170, 255), d=None):
    """A violet-white tension arc between points a and b (world)."""
    L = math.hypot(b[0] - a[0], b[1] - a[1]) or 1e-6
    nx, ny = -(b[1] - a[1]) / L, (b[0] - a[0]) / L
    pts = [a]
    for j in range(1, n):
        u = j / n
        o = rng.uniform(-1, 1) * jag * L * math.sin(u * math.pi)
        pts.append((a[0] + (b[0] - a[0]) * u + nx * o, a[1] + (b[1] - a[1]) * u + ny * o))
    pts.append(b)
    fr.glow_line(pts, col, width_px=width_px * 3, d=d)
    fr.line(pts, (250, 240, 255), width_px=max(1, width_px * 0.6), d=d)


# ---- insert helpers ---------------------------------------------------------

def gojo_eyes(fr, cu, cv, s, gx=0.0, gy=0.0, flip=1, glow=1.0, veins=0.0, pupil=0.0, iris=1.0, refl=None,
              lid=0.0, salt="veins"):
    """Repaint gojo_face's eyes: gaze (gx, gy in -1..1), bloodshot veins (0..1),
    a small dark pupil (0..1 = how tight/visible), reflections [(dx, dy, col)]."""
    L = inserts.Local(fr, cu, cv, s, 0.0, flip)
    rng = random.Random(salt)
    for ei, (ex, sz) in enumerate(((0.3, 1.0), (-0.12, 0.85))):
        ey = -0.15
        rx, ry = 0.12 * sz, 0.07 * sz * (1 - 0.25 * lid)
        L.ell(ex, ey, rx, ry, fill=(240, 252, 255))
        if veins > 0:
            for j in range(9):
                side = 1 if j % 2 else -1
                start = rng.uniform(0.0, 0.45)
                k = clamp((veins - start) / max(1e-3, 1 - start))
                y0 = ey + rng.uniform(-0.55, 0.55) * ry
                x0 = ex + side * rx * math.sqrt(max(0.0, 1 - ((y0 - ey) / ry) ** 2)) * 0.96
                ln = rx * rng.uniform(0.35, 0.62) * k
                if ln <= 0.002:
                    continue
                pts = [(x0, y0)]
                wig = rng.uniform(0, 6)
                for q in range(1, 6):
                    u = q / 5
                    pts.append((x0 - side * ln * u, y0 + math.sin(u * 4 + wig) * ry * 0.1 + (ey - y0) * 0.25 * u))
                L.line(pts, (196, 46, 58), 0.0034 * sz)
                if k > 0.5:
                    m = pts[2]
                    L.line([m, (m[0] - side * ln * 0.25, m[1] + (0.25 if j % 3 else -0.25) * ry)], (205, 70, 80),
                           0.0024 * sz)
        ix, iy = ex + 0.01 + gx * 0.05 * sz, ey + gy * 0.02 * sz
        L.ell(ix, iy, 0.065 * sz * iris, 0.065 * sz * iris, fill=(60, 190, 255))
        L.ell(ix, iy, 0.045 * sz * iris, 0.045 * sz * iris, fill=(110, 215, 255))
        if pupil > 0:
            L.ell(ix, iy, 0.022 * sz * (1.25 - 0.45 * pupil), 0.022 * sz * (1.25 - 0.45 * pupil),
                  fill=mix_color((90, 170, 220), (14, 40, 70), pupil))
        L.ell(ix - 0.018 * sz, iy - 0.018 * sz, 0.012 * sz, 0.012 * sz, fill=(235, 250, 255))
        if refl:
            for dx, dy, col in refl:
                L.ell(ix + dx * sz, iy + dy * sz, 0.009 * sz, 0.009 * sz, fill=col)
        L.glow(ix, iy, 0.18 * sz * glow, (40, 130, 220))
        if lid > 0:
            L.poly([(ex - rx * 1.1, ey - ry * 1.15), (ex + rx * 1.1, ey - ry * 1.25), (ex + rx * 1.1, ey - ry * (1.25 - lid)),
                    (ex - rx * 1.1, ey - ry * (1.15 - lid))], shade(GOJO.skin, 0.9))
        L.line([(ex - 0.13 * sz, ey - ry * 0.85), (ex + 0.13 * sz, ey - ry * 1.15)], GOJO.hair, 0.014)


def thragg_eyes(fr, cu, cv, s, flip=-1, open_h=0.035, gx=0.0, gy=0.0, refl=None, wide=False):
    """Repaint thragg_face's eyes with a gaze offset and lid opening."""
    L = inserts.Local(fr, cu, cv, s, 0.0, flip)
    for ex in (0.34, -0.06):
        L.ell(ex, -0.13, 0.1, open_h + 0.01, fill=(220, 214, 214))
        ix, iy = ex + 0.02 + gx * 0.035, -0.13 + gy * min(0.02, open_h * 0.5)
        L.ell(ix, iy, 0.035, open_h + 0.005, fill=(40, 24, 22))
        L.ell(ix, iy, 0.018, min(0.018, open_h * 0.6), fill=(10, 6, 8))
        if refl:
            for dx, dy, col in refl:
                L.ell(ix + dx, iy + dy, 0.007, 0.007, fill=col)


def neck_blindfold(L, y=0.62):
    """Gojo's blindfold pulled down around his neck (insert coords)."""
    L.poly([(-0.34, y - 0.02), (0.26, y - 0.06), (0.3, y + 0.04), (-0.36, y + 0.09)], GOJO.accent)
    L.line([(-0.34, y + 0.0), (0.27, y - 0.04)], (40, 40, 52), 0.008)


def plate_bg(fr, top=(26, 24, 38), bottom=(74, 54, 60), smoke=True, salt="plate", t=0.0, warm_side=-1):
    """Soft storm-dusk background for close-ups: gradient, a smoke column, haze."""
    inserts._bg(fr, top, bottom, bokeh=False)
    rng = fr.srng(salt)
    img, dr = fr.layer()
    # warm low sun haze on the west side
    wu = 0.05 if warm_side < 0 else 0.95
    for k in range(6):
        r = (0.9 - k * 0.12) * fr.H
        dr.ellipse([wu * fr.W - r, 0.85 * fr.H - r, wu * fr.W + r, 0.85 * fr.H + r],
                   fill=(150, 86, 60, 16))
    if smoke:
        su = rng.uniform(0.62, 0.8) if warm_side < 0 else rng.uniform(0.2, 0.38)
        for k in range(14):
            age = (k / 14 + t * 0.05) % 1.0
            u = su + math.sin(age * 4 + 1) * 0.04 - age * 0.12
            v = 1.1 - age * 1.3
            r = (0.08 + age * 0.22) * fr.H
            dr.ellipse([u * fr.W - r, v * fr.H - r, u * fr.W + r, v * fr.H + r],
                       fill=(46, 40, 48, int(150 * (1 - 0.5 * age))))
    fr.merge(img)


WS_SCALE = 1.5           # animatic readability: figures drawn 1.5x in the 80 m wide shot

# =============================================================================
# S5-01  WS 155 m up, side-on: Gojo yanks himself straight up on a Blue point;
#        Thragg's renewed cross at the head hits air; he plants beneath.
# =============================================================================

def _s501_thragg(fr, t, t_cross, t_plant, body_cross):
    """Thragg's world position (pelvis), depth, pose for S5-01."""
    t5 = T(fr, 5)
    t14, t17 = T(fr, 14), T(fr, 17)
    if t < t_cross:
        u = t / max(1e-6, t_cross)
        x = lerp(95.0, body_cross[0], u)
        y = lerp(150.0, body_cross[1], u)
        d = lerp(50.0 / 70.0, 1.0, seg(t, 0.0, T(fr, 4), "inout"))
        pose = pose_at(t, [(0.0, T_FLY), (t5, T_WIND, "out"), (t_cross, T_CROSS, "snap")])
        return x, y, d, pose
    if t < t_plant:
        u = seg(t, t_cross, t_plant, "out")
        x = lerp(body_cross[0], 125.0, u)
        y = lerp(body_cross[1], 152.2, u)
        pose = pose_at(t, [(t_cross, T_CROSS), (t_plant, P(T_CROSS, ua_n=84, fa_n=70, lean=70))])
        return x, y, 1.0, pose
    # plant on the air: the body rotates first, the trajectory follows
    x = kf(t, [(t_plant, 125.0), (t14, 125.5, "out"), (t17, 124.0, "inout")])
    y = kf(t, [(t_plant, 152.2), (t14, 152.7, "out"), (t17, 153.0, "inout")])
    rot = seg(t, t_plant, t14, "out")
    base = pose_at(rot, [(0.0, P(T_CROSS, ua_n=84, fa_n=70, lean=70)), (1.0, T_PLANT)])
    return x, y, 1.0, base


def s5_01(fr):
    t = fr.t
    t_flick = T(fr, 1)
    t_blue = cue(fr, "blue", 0, 2)
    t_yank = cue(fr, "whoosh", 0, 4)
    t_cross = cue(fr, "whoosh", 1, 6)
    t_plant = cue(fr, "accel_burst", 0, 12)
    t_arrive = T(fr, 16)
    t_breath = T(fr, 20)
    # ---- camera: locked f0-3, then a fast 12-frame tilt/boom following the yank
    uc = seg(t, T(fr, 3), T(fr, 16), "inout")
    fr.cam = Cam(lerp(112.0, 118.0, uc), lerp(152.0, 166.0, uc), lerp(24.0, 22.0, uc))
    sky_plate(fr, tower_d=1.25, smoke_alpha=80, haze=0.55, blur=2.5, city_lit=0.72)
    # drifting Seq 4 debris from the tower's gutting, mid-ground
    debris_field(fr, C.tg(fr) - 130.0, 92.0, 150.0, 140.0, 196.0, n=46, d=1.45, salt="s501deb",
                 drift=(-0.5, -0.9), size=(0.15, 0.55))
    BP = (121.0, 184.0)
    # ---- the Blue point: snaps open at f2, winks out on arrival (f16)
    if t_blue <= t < t_arrive + T(fr, 2):
        k_in = seg(t, t_blue, t_blue + T(fr, 1), "out")
        k_out = 1 - seg(t, t_arrive, t_arrive + T(fr, 2), "in")
        k = k_in * k_out
        if k > 0.02:
            fx.blue(fr, BP[0], BP[1], t - t_blue, r=0.42 * (0.4 + 0.6 * k), strength=k, streaks=26, salt="s501b")
    # while the camera is still locked the point is above frame: its light spills in
    bxs, bys = fr.P(BP[0], BP[1])
    if t_blue <= t < t_arrive and bys < 0:
        k = seg(t, t_blue, t_blue + T(fr, 1), "out")
        fr.glow_circle(bxs / fr.W, -0.02, 0.1, shade((60, 130, 255), k), world=False)
        fr.soft_circle(bxs / fr.W, 0.0, 0.35, shade((40, 90, 200), k), world=False)
    # light dust and grit stream up into the point first (f3), in straight lines
    if t_blue <= t < t_arrive + T(fr, 1):
        rng = fr.srng("s501pull")
        for i in range(60):
            a = rng.uniform(0, math.tau)
            rr = rng.uniform(1.0, 9.0)
            p0 = (120.0 + math.cos(a) * rr, 151.0 + math.sin(a) * rr * 0.8 + rng.uniform(0, 12))
            mass = rng.uniform(0.05, 0.5)
            x1, y1, u1 = fx.pull(p0, BP, t, t_start=t_blue, mass=mass, strength=1.4)
            x0, y0, u0 = fx.pull(p0, BP, t - 1.5 / FPS, t_start=t_blue, mass=mass, strength=1.4)
            if u1 >= 0.995 or u1 <= 0.0:
                continue
            fr.line([(x0, y0), (x1, y1)], shade(PAL["dust"], 0.9 + 0.3 * u1), width_px=1.5 + 1.5 * u1)
    # ---- Gojo: the flick, the yank (on 1s), the hang (on 2s), looking down
    tg_ = t if t < T(fr, 10) else on2(fr)
    gy = lerp(150.95, 182.0, seg(tg_, t_yank, t_arrive, "out"))
    gx = lerp(120.0, 121.0, seg(tg_, t_yank, t_arrive, "out"))
    if t < t_yank:
        flick = seg(t, t_flick, t_flick + T(fr, 2), "snap")
        gpose = pose_at(flick, [(0.0, G_LOOSE), (1.0, P(G_LOOSE, ua_f=150, fa_f=176, hand_f="sign"))])
    elif t < t_arrive:
        gpose = pose_at(tg_, [(t_yank, P(G_LOOSE, ua_f=150, fa_f=176, hand_f="sign")),
                              (t_yank + T(fr, 3), G_YANK, "out"), (t_arrive, P(G_YANK, lean=-6, neck=10))])
    else:
        gpose = pose_at(tg_, [(t_arrive, P(G_YANK, lean=-6, neck=10)),
                              (t_arrive + T(fr, 8), P(G_LOOSE, lean=24, neck=64), "inout")])
    if t_yank <= t < t_arrive:
        fx.trail(fr, [(gx, lerp(150.95, gy, k / 6.0) + 0.2) for k in range(7)], width_m=0.5, alpha=70)
    gojo(fr, gpose, gx, gy, -1, halo=1.6, scale=WS_SCALE)
    # ---- Thragg: the charge, the cross through empty air, the plant -------------
    Jc = solve(THRAGG, T_CROSS, 0.0, 0.0, 1, WS_SCALE)
    hx, hy = hand_pos(Jc, "n")
    FIST = (120.0, 151.7)
    body_cross = (FIST[0] - hx, FIST[1] - hy)
    x, y, d, pose = _s501_thragg(fr, t, t_cross, t_plant, body_cross)
    breath = 0.0
    if t >= T(fr, 17):
        tb = on2(fr)
        breath = math.sin(max(0.0, tb - t_breath) * math.tau / T(fr, 18)) if tb >= t_breath else 0.0
        pose = P(pose, lean=pose["lean"] + 2.5 * breath, neck=pose["neck"] - 2 * breath)
    if t >= t_plant:
        Jb = solve(THRAGG, pose, x, y + 0.04 * breath, 1, WS_SCALE)
        clamp_k = seg(t, t_plant + T(fr, 2), T(fr, 17), "inout")
        pose = pose_at(clamp_k, [(0.0, pose), (1.0, reach(THRAGG, P(pose, hand_n="open"), x, y + 0.04 * breath, 1, "n",
                                                          ribs_point(Jb, THRAGG), scale=WS_SCALE))])
    if t < t_cross + T(fr, 1):
        # speed: an afterimage streak + the cape remnant streaming flat behind him
        trail = []
        for kk in range(8, -1, -1):
            tt = max(0.0, t - kk * 0.035)
            xx, yy, dd, _ = _s501_thragg(fr, tt, t_cross, t_plant, body_cross)
            px_, py_ = fr.P(xx, yy + 0.35, dd)
            trail.append(s2w(fr, px_ / fr.W, py_ / fr.H))
        fx.trail(fr, trail, width_m=1.5, alpha=95)
    J = thragg(fr, pose, x, y + 0.04 * breath, 1, depth=d, halo=1.4, scale=WS_SCALE,
               cape_wind=(-1.0, 0.1) if t < t_plant + T(fr, 3) else (-0.5, -0.4))
    # f6: CONTACT WITH NOTHING - a cone of displaced air peels off the knuckles
    if t_cross - 0.5 / FPS <= t < t_cross + T(fr, 7):
        tc = t - t_cross
        a = 1 - clamp(tc / T(fr, 7))
        fx_, fy_ = hand_pos(J, "n")
        img, dr = fr.layer()
        L = 1.2 + 4.5 * EASE["out"](clamp(tc / T(fr, 4)))
        w = 0.4 + 1.6 * EASE["out"](clamp(tc / T(fr, 4)))
        cone = [(fx_, fy_), (fx_ + L, fy_ + w), (fx_ + L * 1.08, fy_), (fx_ + L, fy_ - w)]
        dr.polygon(fr.pts(cone), fill=(225, 232, 245, int(120 * a)))
        fr.merge(img)
        for k in (-1, 1):
            fr.line([(fx_ + 0.2, fy_ + 0.15 * k), (fx_ + L * 0.6, fy_ + w * 0.8 * k), (fx_ + L * 0.95, fy_ + w * 1.3 * k)],
                    shade((230, 236, 246), a), width_px=2)
    # f12-17: the plant on the air - a vapour ring puffs off him
    if t_plant <= t < t_plant + T(fr, 10):
        tp = t - t_plant
        cx, cy = J["chest"]
        fx.shockwave(fr, cx - 0.2, cy, tp, r_max=3.2, dur=T(fr, 9), color=(225, 230, 240), width=3)
        fx.dust_cloud(fr, cx, cy, tp, r=1.6, n=12, color=(214, 218, 228), rise=0.0, salt="s501puff", ground=False,
                      alpha=90)



# =============================================================================
# S5-02  OTS, long lens over Gojo's right shoulder: Thragg drifts until the lit
#        city sits exactly behind him; rack focus to the lights and back.
# =============================================================================

def lit_city(fr, u0, u1, v_base, v_top, salt="litcity", lit=1.0):
    """The lit, living city across the river, on the horizon (screen space)."""
    rng = random.Random(salt)
    x = u0
    while x < u1:
        w = rng.uniform(0.010, 0.030)
        hf = rng.uniform(0.15, 1.0) ** 1.3
        top = v_base - hf * (v_base - v_top)
        col = shade(mix_color((40, 36, 52), (90, 64, 70), rng.uniform(0.0, 0.45)), lit * rng.uniform(0.85, 1.1))
        if rng.random() < 0.25:
            fr.s_poly([(x, top), (x + w * 0.5, top - 0.02 * hf), (x + w, top), (x + w, v_base + 0.02), (x, v_base + 0.02)],
                      col)
        else:
            fr.s_rect(x, top, x + w, v_base + 0.02, col)
        cols = max(2, int(w / 0.0034))
        rows = max(2, int((v_base - top) / 0.0062))
        for i in range(cols):
            for j in range(rows):
                if rng.random() < 0.6:
                    wu = x + (i + 0.2) * w / cols
                    wv = top + (j + 0.35) * (v_base - top) / rows
                    c = mix_color(PAL["window_lit"], (255, 228, 170), rng.random() * 0.5)
                    fr.s_rect(wu, wv, wu + w / cols * 0.55, wv + 0.0028, shade(c, lit * rng.uniform(0.65, 1.05)))
        x += w + rng.uniform(0.0, 0.004)


def storm_top(fr, v1=0.26, t=0.0, salt="stormtop", lit=1.0, warm_u=None):
    """Underside of the storm deck across the top of a level shot (screen space)."""
    rng = random.Random(salt)
    img, dr = fr.layer()
    for i in range(34):
        u = (rng.uniform(-0.2, 1.2) - t * 0.004 * rng.uniform(0.5, 1.5))
        v = rng.uniform(-0.05, v1)
        rw, rh = rng.uniform(0.12, 0.3), rng.uniform(0.04, 0.09)
        c = mix_color(PAL["cloud"], PAL["cloud_lit"], clamp(rng.uniform(0, 0.5) + (0.3 if warm_u is not None and abs(u - warm_u) < 0.25 else 0)))
        dr.ellipse([(u - rw) * fr.W, (v - rh) * fr.H, (u + rw) * fr.W, (v + rh) * fr.H],
                   fill=shade(c, lit * rng.uniform(0.8, 1.05)) + (int(rng.uniform(150, 235)),))
    fr.merge(img)


def ots_shoulder(fr, turn, flick):
    """Gojo's right shoulder, white hair and collar: a soft dark mass at the
    right edge. turn 0 = still looking down, 1 = level; flick shifts the cheek."""
    dx, dy = 0.035 * (1 - turn), 0.08 * (1 - turn)
    coat = (14, 15, 22)
    fr.s_poly([(0.79 + dx, 1.05), (0.81 + dx, 0.84 + dy), (0.855 + dx, 0.70 + dy), (0.915 + dx, 0.61 + dy),
               (0.97, 0.585 + dy), (1.05, 0.58 + dy), (1.05, 1.05)], coat)
    # high collar edge catching the warm rim from the west
    fr.s_line([(0.81 + dx, 0.84 + dy), (0.855 + dx, 0.70 + dy), (0.915 + dx, 0.61 + dy)], (120, 84, 70), width=5)
    # cheek sliver (shadowed skin), shifts a hair as the eyes flick
    cx = 0.935 + dx - 0.006 * flick
    fr.s_poly([(cx, 0.36 + dy), (cx - 0.012, 0.45 + dy), (cx + 0.012, 0.56 + dy), (1.05, 0.56 + dy), (1.05, 0.34 + dy)],
              (168, 134, 124))
    # loose white hair, warm-rimmed
    hair = [(0.915 + dx, -0.05), (0.895 + dx, 0.05 + dy), (0.9 + dx, 0.13 + dy), (0.885 + dx, 0.2 + dy),
            (0.905 + dx, 0.27 + dy), (0.9 + dx, 0.34 + dy), (0.93 + dx, 0.4 + dy), (0.945 + dx, 0.36 + dy),
            (0.96, 0.43 + dy), (1.05, 0.42 + dy), (1.05, -0.05)]
    fr.s_poly(hair, (226, 222, 228))
    fr.s_poly([(0.915 + dx, -0.05), (0.895 + dx, 0.05 + dy), (0.9 + dx, 0.13 + dy), (0.925 + dx, 0.1 + dy),
               (0.935 + dx, -0.05)], (250, 214, 186))


def s5_02(fr):
    t = fr.t
    t2 = on2(fr)
    zoom = zkf(t, [(0.0, 70.0), (fr.dur, 90.0)])
    fr.cam = Cam(0.0, 0.0, zoom)
    t38, t40, t50, t52 = T(fr, 38), T(fr, 40), T(fr, 50), T(fr, 52)
    city_blur = kf(t, [(t38, 6.0), (t40, 0.0), (t50, 0.0), (t52, 6.0)])
    th_blur = kf(t, [(t38, 0.0), (t40, 4.0), (t50, 4.0), (t52, 0.0)])
    # ---- plate: storm sky toward the sunset, the lit city across the river ----
    env.sky(fr)

    def far():
        storm_top(fr, 0.24, C.tg(fr), salt="s502deck", warm_u=0.15)
        img, dr = fr.layer()
        for k in range(7):
            r = (0.55 - k * 0.07) * fr.H
            dr.ellipse([0.3 * fr.W - r * 1.6, 0.66 * fr.H - r * 0.5, 0.3 * fr.W + r * 1.6, 0.66 * fr.H + r * 0.5],
                       fill=(200, 120, 80, 14))
        fr.merge(img)
        # the band of lit towers, centre-left; dark, dead towers further right
        lit_city(fr, -0.02, 0.66, 0.79, 0.44, salt="s502lit")
        rng = random.Random("s502dark")
        x = 0.66
        while x < 1.05:
            w = rng.uniform(0.015, 0.04)
            top = 0.79 - rng.uniform(0.08, 0.3)
            fr.s_rect(x, top, x + w, 0.81, shade((34, 32, 44), rng.uniform(0.85, 1.1)))
            x += w + rng.uniform(0.002, 0.01)
        # river with the sunset on it
        fr.s_rect(-0.02, 0.79, 1.02, 0.9, (58, 52, 66))
        rng = random.Random("s502riv")
        for k in range(26):
            u = rng.uniform(0.0, 0.8)
            v = rng.uniform(0.80, 0.885)
            ph = (t * 0.4 + rng.random()) % 1.0
            fr.s_line([(u, v), (u + rng.uniform(0.02, 0.06), v)], shade((220, 160, 112), 0.4 + 0.5 * math.sin(ph * math.pi)),
                      width=2)
        fr.s_rect(-0.02, 0.9, 1.02, 1.02, (34, 32, 42))
        fr.soft_circle(0.3, 0.62, 0.25, (70, 44, 24), world=False)
    soft_draw(fr, far, radius=city_blur)
    # faint long-lens heat shimmer above the distant river
    fr.post.append(("lens", 0.32 * OUT_W, 0.78 * OUT_H, 260.0, 0.025, t))
    # smoke columns at the edges of frame
    img, dr = fr.layer()
    for (su, sk) in ((0.04, 0.0), (0.74, 1.3)):
        for k in range(10):
            age = (k / 10 + C.tg(fr) * 0.03) % 1.0
            u = su + math.sin(age * 4 + sk) * 0.03 - age * 0.06
            v = 1.0 - age * 1.2
            r = (0.07 + age * 0.12) * fr.H
            dr.ellipse([u * fr.W - r, v * fr.H - r, u * fr.W + r, v * fr.H + r], fill=(44, 38, 46, int(120 * (1 - age))))
    fr.merge(img)
    soft_draw(fr, lambda: None, radius=0)
    # ---- Thragg: drifts west and up through the debris, unhurried (on 2s) ----
    path = [(0.0, (0.90, 1.06)), (T(fr, 6), (0.86, 0.95)), (T(fr, 16), (0.75, 0.77)), (T(fr, 32), (0.56, 0.635)),
            (T(fr, 36), (0.49, 0.62)), (T(fr, 44), (0.415, 0.565)), (fr.dur, (0.415, 0.565))]
    u, v = catmull(path, t2)
    breath = math.sin(t2 * math.tau / T(fr, 20))
    d = lerp(0.82, 1.0, seg(t2, 0.0, T(fr, 44), "out"))
    tx, ty = s2w(fr, u, v)
    tx, ty = fr.cam.x + (tx - fr.cam.x) * d, fr.cam.y + (ty - fr.cam.y) * d
    ty += 0.03 * breath

    def mid():
        debris_field(fr, C.tg(fr) - 133.0, -14.0, 14.0, -7.0, 7.0, n=34, d=1.0, salt="s502deb", drift=(-0.25, -0.15),
                     size=(0.04, 0.16))
        base = P(T_STILL, lean=3 + 1.5 * breath, neck=2, ua_f=-8 - 3 * breath, fa_f=-2, hand_n="open")
        Jb = solve(THRAGG, base, tx, ty, 1)
        pose = reach(THRAGG, base, tx, ty, 1, "n", ribs_point(Jb, THRAGG))
        J = thragg(fr, pose, tx, ty, 1, depth=d, cape_wind=(-0.5 + 0.15 * math.sin(t * 2), -0.35))
        if T(fr, 30) <= t2 < T(fr, 36):
            thragg_head_turned(fr, J)
        return J
    soft_draw(fr, mid, radius=th_blur)
    # near debris, always soft
    soft_draw(fr, lambda: debris_field(fr, C.tg(fr) - 133.0, -9.0, 9.0, -5.0, 5.0, n=8, d=0.45, salt="s502near",
                                       drift=(-0.12, -0.05), size=(0.03, 0.08)), radius=5.0)
    # ---- Gojo's shoulder: foreground, out of focus ----------------------------
    turn = seg(t2, 0.0, T(fr, 14), "inout")
    flick = math.sin(clamp((t - T(fr, 40)) / max(1e-6, T(fr, 10))) * math.pi)
    soft_draw(fr, lambda: ots_shoulder(fr, turn, flick), radius=9.0)


# =============================================================================
# S5-03  EWS from a drone 650 m south: Gojo flies up and over Thragg to the
#        west and settles between him and the lit city. Thragg only rotates.
# =============================================================================
READ_SCALE_EWS = 3.0     # animatic readability: figures drawn 3x in the extreme wides


def s5_03(fr):
    t = fr.t
    t2 = on2(fr)
    fr.cam = Cam(45.0, 170.0, 5.0)
    sky_plate(fr, smoke_alpha=110)
    # drifting debris specks around Thragg
    debris_field(fr, C.tg(fr) - 134.0, 60.0, 104.0, 160.0, 200.0, n=40, d=1.0, salt="s503deb", drift=(-0.6, -1.2),
                 size=(0.3, 0.9))
    keys = [(0.0, (121.0, 182.0)), (T(fr, 8), (121.0, 186.0)), (T(fr, 22), (82.0, 207.0)), (T(fr, 32), (40.0, 214.0)),
            (T(fr, 48), (-20.0, 200.0)), (fr.dur, (-20.0, 200.0))]
    gx, gy = catmull(keys, t2)
    if t2 < T(fr, 8):
        gp, gf = G_LOOSE, -1
    elif t2 < T(fr, 48):
        gp, gf = pose_at(t2, [(T(fr, 8), G_LOOSE), (T(fr, 14), G_GLIDE), (T(fr, 42), G_GLIDE),
                              (T(fr, 48), P(G_LOOSE, lean=6))]), -1
    else:
        gp = P(G_LOOSE, lean=2)
        gf = -1 if t2 < T(fr, 54) else 1
    s = READ_SCALE_EWS
    # Thragg: rotation only - faces east, looks up as Gojo passes overhead, then west
    if t2 < T(fr, 24):
        tf = 1
        tp = P(T_STILL, neck=-10 - 40 * seg(t2, T(fr, 10), T(fr, 22)), lean=3 - 8 * seg(t2, T(fr, 10), T(fr, 22)))
    else:
        tf = -1
        tp = P(T_STILL, neck=-50 + 50 * seg(t2, T(fr, 24), T(fr, 40)), lean=-5 + 8 * seg(t2, T(fr, 24), T(fr, 40)))
    thragg(fr, P(tp, ua_n=12, fa_n=105, hand_n="open") if tf == 1 else P(tp, ua_f=12, fa_f=105, hand_f="open"),
           82.0, 180.0, tf, scale=s, halo=1.4)
    gojo(fr, gp, gx, gy, gf, scale=s, halo=1.6)


# =============================================================================
# S5-04  CU Thragg, 3/4 front, facing screen-left: eyes from Gojo to the
#        lights behind him and back. He protects the city.
# =============================================================================

def thragg_cu_extras(fr, cu, cv, s, flip, t, ribs_hand=1.0, hand_grip=1.0, cape_lift=0.0, violet=0.0):
    """Things inserts.thragg_face doesn't draw: torn uniform at the right
    shoulder and chest, the scorched burn, the hand on the ribs, cape rags."""
    L = inserts.Local(fr, cu, cv, s, 0.0, flip)
    fl = math.sin(t * 6) * 0.05
    # cape rags behind the far shoulder
    L.poly([(-0.95, 0.95), (-1.3, 0.62 - cape_lift * 0.3 + fl), (-1.42, 0.78 - cape_lift * 0.25 - fl),
            (-1.6, 0.56 - cape_lift * 0.35 + fl), (-1.55, 1.05), (-1.1, 1.35)], shade(THRAGG.accent, 0.7))
    return L


def thragg_cu_body(L, t, burn=True):
    # torn uniform at the right shoulder and chest, the scorched burn below
    L.poly([(-0.55, 1.0), (-0.2, 0.93), (-0.05, 1.1), (-0.3, 1.32), (-0.7, 1.28)], shade(THRAGG.skin, 0.8))
    L.line([(-0.6, 1.0), (-0.42, 1.1), (-0.5, 1.22), (-0.3, 1.3)], (130, 120, 116), 0.012)
    if burn:
        L.ell(0.15, 1.2, 0.3, 0.1, fill=(52, 34, 34))
        L.ell(0.2, 1.16, 0.14, 0.04, fill=(120, 46, 34))


def thragg_hand_ribs(L, grip=1.0, y0=1.18):
    """His right hand (the far side, screen-right of the chest) pressed to the
    cracked ribs at the bottom of frame; grip < 1 eases it a little."""
    g = THRAGG.accent
    e = 0.04 * (1 - grip)
    L.poly([(-0.42, y0 + 0.3), (-0.36, y0 - 0.02 + e), (-0.56, y0 - 0.1 + e), (-0.86, y0 - 0.06), (-0.92, y0 + 0.3)], g)
    for k in range(4):
        x = -0.44 - k * 0.1
        L.line([(x, y0 - 0.06 + e), (x + 0.03, y0 + 0.06)], shade(g, 0.6), 0.012)
    L.line([(-0.36, y0 - 0.02 + e), (-0.3, y0 + 0.1)], shade(g, 0.75), 0.03)


def s5_04(fr):
    t = fr.t
    t2 = on2(fr)
    fr.cam = Cam(0.0, 0.0, 1080.0)
    plate_bg(fr, (24, 22, 36), (66, 50, 58), smoke=True, salt="s504", t=C.tg(fr), warm_side=-1)
    soft_draw(fr, lambda: specks(fr, C.tg(fr), n=30, salt="s504sp", col=(120, 104, 100), size=(0.002, 0.006)),
              radius=2.0)
    s = 0.8 * (1 + 0.04 * fr.u)
    # breath slows from a 20- to a 28-frame cycle
    f0 = fr.f / _k(fr.shot)
    ph = 0.0
    for q in range(int(f0 // 2) * 2):
        ph += 1.0 / lerp(20.0, 28.0, q / 30.0)
    breath = math.sin(ph * math.tau)
    cu, cv = 0.56, 0.42 + 0.004 * breath
    flip = -1
    L = thragg_cu_extras(fr, cu, cv, s, flip, t)
    inserts.thragg_face(fr, cu, cv, s, expr="analytical", injuries=["mouth_blood"], flip=flip, t=t)
    thragg_cu_body(L, t)
    # warm rim on the cheekbone and mustache from screen-left
    L.line([(0.5, -0.4), (0.56, -0.05), (0.55, 0.3), (0.42, 0.62)], (255, 176, 120), 0.012)
    # eyes: up-left to Gojo, a dip to the lights behind him (f6-10), back up
    dip = seg(t2, T(fr, 6), T(fr, 8), "out") * (1 - seg(t2, T(fr, 8), T(fr, 10), "inout"))
    gy = -0.9 + 1.5 * dip
    city = [(0.012, 0.012 - 0.004 * dip, (255, 200, 130))] if dip > 0.3 else [(0.012, 0.01, (230, 190, 140))]
    thragg_eyes(fr, cu, cv, s, flip, open_h=0.03 - 0.004 * seg(t2, T(fr, 12), T(fr, 22)), gx=0.8, gy=gy, refl=city)
    grip = 1.0 - 0.6 * seg(t2, T(fr, 16), T(fr, 28))
    thragg_hand_ribs(L, grip)



# =============================================================================
# S5-05  MS, low angle: silence. Gojo raises both hands; Blue ignites at the
#        left palm and pulls, Red at the right fingertips jitters and repels.
# =============================================================================

def deck_overhead(fr, t, gap=(0.7, 0.16, 0.2, 0.1), salt="deck5", lit=1.0, shafts=True):
    """The torn storm deck seen from below, behind a low-angle shot (screen space)."""
    top, bot = (20, 20, 34), (70, 52, 62)
    for i in range(24):
        fr.s_rect(0, i / 24, 1, (i + 1) / 24 + 0.002, shade(mix_color(top, bot, (i / 23) ** 1.3), lit))
    gu, gv, gr, gh = gap
    rng = random.Random(salt + "gap")
    pts, inner = [], []
    for k in range(30):
        a = k * math.tau / 30
        j = rng.uniform(0.75, 1.2)
        pts.append((gu + math.cos(a) * gr * j, gv + math.sin(a) * gh * j))
        inner.append((gu + math.cos(a) * gr * j * 0.62, gv + math.sin(a) * gh * j * 0.55 + 0.01))
    fr.s_poly(pts, shade((170, 118, 96), lit))
    fr.s_poly(inner, shade((214, 160, 118), lit))
    img, dr = fr.layer()
    rng = random.Random(salt)
    for i in range(40):
        u = rng.uniform(-0.2, 1.2) - t * 0.006 * rng.uniform(0.5, 1.5)
        v = rng.uniform(-0.1, 0.75)
        if math.hypot((u - gu) / gr, (v - gv) / gh) < 1.05:
            continue
        rw, rh = rng.uniform(0.1, 0.28), rng.uniform(0.04, 0.1)
        c = mix_color(PAL["cloud"], PAL["cloud_lit"], clamp(0.7 - math.hypot(u - gu, v - gv)))
        dr.ellipse([(u - rw) * fr.W, (v - rh) * fr.H, (u + rw) * fr.W, (v + rh) * fr.H],
                   fill=shade(c, lit * rng.uniform(0.75, 1.05)) + (int(rng.uniform(120, 220)),))
    if shafts:
        for k, (o, w) in enumerate(((-0.12, 0.03), (-0.03, 0.05), (0.07, 0.035))):
            sway = 0.01 * math.sin(t * 0.5 + k)
            x0 = gu + o + sway
            dr.polygon([(x0 * fr.W, gv * fr.H), ((x0 + w) * fr.W, gv * fr.H),
                        ((x0 + w * 2.5 - 0.18) * fr.W, 1.0 * fr.H), ((x0 - 0.18) * fr.W, 1.0 * fr.H)],
                       fill=(255, 196, 140, 22))
    fr.merge(img)


G_HOVER = P("float_relaxed", lean=1, neck=0, ua_n=6, fa_n=2, ua_f=-4, fa_f=-3, hand_n="open", hand_f="open")


def purple_hands(fr, k, t, base=G_HOVER, tremor=0.0, sep=1.0):
    """Gojo at the Purple position with the hands raised k (0 = at his sides,
    1 = chest height, palms facing): far (LEFT) hand upper-left, near (RIGHT)
    hand lower-right. Returns (pose, blue_point, red_point)."""
    J0 = solve(GOJO, base, G_X, G_Y, 1)
    cx, cy = J0["chest"]
    hb0, hr0 = hand_pos(J0, "f"), hand_pos(J0, "n")
    tb = (cx + 0.32 + 0.08 * (1 - sep), cy - 0.14 - 0.06 * (1 - sep))
    tr = (cx + 0.6 - 0.12 * (1 - sep), cy - 0.44 + 0.14 * (1 - sep))
    tb = (lerp(hb0[0], tb[0], k), lerp(hb0[1], tb[1], k))
    tr = (lerp(hr0[0], tr[0], k) + tremor * 0.012, lerp(hr0[1], tr[1], k) + tremor * 0.008)
    pose = reach(GOJO, base, G_X, G_Y, 1, "f", tb)
    pose = reach(GOJO, pose, G_X, G_Y, 1, "n", tr)
    J = solve(GOJO, pose, G_X, G_Y, 1)
    bpt = hand_pos(J, "f", ahead=0.1)
    rpt = hand_pos(J, "n", ahead=0.13)
    return pose, bpt, rpt


def s5_05(fr):
    t = fr.t
    t2 = on2(fr)
    t_blue = cue(fr, "blue", 0, 16)
    t_red = cue(fr, "red_charge", 0, 30)
    t_swell = T(fr, 36)
    zoom = 285.0 * (1 + 0.03 * fr.u)
    fr.cam = Cam(-19.45, 201.0, zoom)
    soft_draw(fr, lambda: deck_overhead(fr, C.tg(fr), salt="s505"), radius=7.0)
    soft_draw(fr, lambda: specks(fr, C.tg(fr), n=26, salt="s505sp", col=(140, 120, 110), size=(0.002, 0.005)),
              radius=1.5)
    k = seg(t2, T(fr, 4), T(fr, 16), "inout")
    trem = (fr.rng.uniform(-1, 1) if t >= t_red else 0.0)
    pose, B, R = purple_hands(fr, k, t2 if t < t_blue else t, tremor=trem)
    # ---- the dust field: light things arrive first, Red flings the same dust away
    rng = fr.srng("s505dust")
    pulses = [t_swell + i * T(fr, 5) for i in range(5)] if t >= t_swell else []
    for i in range(110):
        kind = "dust" if i < 84 else ("glass" if i < 104 else "dustr")
        bx = rng.uniform(-23.2, -16.0)
        by = rng.uniform(199.4, 203.4)
        mass = {"dust": 0.15, "glass": 0.6, "dustr": 0.15}[kind]
        t0 = (t_blue + rng.uniform(0, 1.3)) if kind == "dust" else (T(fr, 22) - 0.072 + rng.uniform(0, 0.6))
        p = (bx - 0.25 * t, by + 0.05 * math.sin(t + i))
        u_pull = 0.0
        if kind != "dustr" and t >= t0:
            p0 = (bx - 0.25 * t0, by + 0.05 * math.sin(t0 + i))
            x, y, u_pull = fx.pull(p0, B, t, t_start=t0, mass=mass, strength=1.2)
            if u_pull >= 0.98:
                continue
            p = (x, y)
        if t >= t_swell:
            dxr, dyr = p[0] - R[0], p[1] - R[1]
            dist = math.hypot(dxr, dyr) or 1e-3
            if dist < 1.3 and (kind == "dustr" or u_pull < 0.3):
                push = sum(0.45 * (1 - math.exp(-(t - tp) * 16)) for tp in pulses if t >= tp) / (0.6 + dist * 1.5)
                p = (p[0] + dxr / dist * push, p[1] + dyr / dist * push)
        if kind == "glass":
            g = 0.6 + 0.4 * abs(math.sin(t * 7 + i))
            fr.poly(chip_poly(p[0], p[1], 0.025, t * 3 + i, 3, random.Random(i)), shade(PAL["glass"], g))
        else:
            if u_pull > 0.05:
                q = fx.pull(p0, B, t - 1.0 / FPS, t_start=t0, mass=mass, strength=1.2)
                fr.line([(q[0], q[1]), p], shade(PAL["dust"], 0.8 + 0.4 * u_pull), width_px=1.5 + 2 * u_pull)
            else:
                fr.circle(p[0], p[1], 0.012, fill=shade(PAL["dust"], 0.8))
    # f30: a fist-sized concrete chip starts sliding toward Blue, slower
    if t >= T(fr, 30) - 0.17:
        c0 = (-21.6, 202.6)
        x, y, u = fx.pull(c0, B, t, t_start=T(fr, 30) - 0.17, mass=1.4, strength=0.8)
        if u < 0.97:
            fr.poly(chip_poly(x, y, 0.06, 0.3 + t, 5, random.Random(5)), shade(PAL["concrete"], 0.9))
    else:
        fr.poly(chip_poly(-21.6, 202.6 + 0.03 * math.sin(t), 0.06, 0.3, 5, random.Random(5)), shade(PAL["concrete"], 0.9))
    gojo(fr, pose, G_X, G_Y, 1)
    # ---- Blue at the left palm (f16) --------------------------------------------
    if t >= t_blue:
        kb = seg(t, t_blue, t_blue + T(fr, 2), "out")
        fx.blue(fr, B[0], B[1], t - t_blue, r=0.085 * (0.5 + 0.5 * kb), strength=0.8 * kb, streaks=40, salt="s505b")
    # ---- Red at the right fingertips (f30): jitter, then swell and repel --------
    if t >= t_red:
        if t < t_swell:
            j = 0.03
            fx.red_charge(fr, R[0] + fr.rng.uniform(-j, j), R[1] + fr.rng.uniform(-j, j), t, r=0.032, strength=0.7)
        else:
            rr = lerp(0.032, 0.095, seg(t, t_swell, T(fr, 44), "out"))
            fx.red_charge(fr, R[0], R[1], t, r=rr, strength=0.6)
            for tp in pulses:
                if 0 <= t - tp < 0.25:
                    fx.shockwave(fr, R[0], R[1], t - tp, r_max=0.9, dur=0.22, color=(255, 120, 110), width=2)


# =============================================================================
# S5-06  INSERT on the hands: two opposite forces in one pair of hands. They
#        close; violet arcs crackle in the gap, faster and faster. No fusion.
# =============================================================================

def draw_hand(fr, wrist, ang, size=0.1, fingers="open", col=None, sleeve_from=None, sleeve_w=0.085):
    """A stylised hand in world space. ang = direction the fingers point (rad)."""
    skin = col or GOJO.skin
    shd = shade(skin, 0.8)
    ux, uy = math.cos(ang), math.sin(ang)
    nx, ny = -uy, ux
    if sleeve_from is not None:
        sx, sy = sleeve_from
        L = math.hypot(wrist[0] - sx, wrist[1] - sy) or 1e-6
        ax, ay = -(wrist[1] - sy) / L, (wrist[0] - sx) / L
        w0, w1 = sleeve_w * 1.25, sleeve_w
        fr.poly([(sx + ax * w0, sy + ay * w0), (wrist[0] + ax * w1, wrist[1] + ay * w1),
                 (wrist[0] - ax * w1, wrist[1] - ay * w1), (sx - ax * w0, sy - ay * w0)], GOJO.suit)
        fr.line([(sx + ax * w0 * 0.8, sy + ay * w0 * 0.8), (wrist[0] + ax * w1 * 0.8, wrist[1] + ay * w1 * 0.8)],
                GOJO.suit_hi, width_m=0.008)
    wx, wy = wrist
    p = size
    palm = [(wx + nx * p * 0.42, wy + ny * p * 0.42), (wx + ux * p * 0.95 + nx * p * 0.5, wy + uy * p * 0.95 + ny * p * 0.5),
            (wx + ux * p * 1.05 - nx * p * 0.45, wy + uy * p * 1.05 - ny * p * 0.45),
            (wx - nx * p * 0.4, wy - ny * p * 0.4)]
    fr.poly(palm, skin)
    fr.poly([palm[2], palm[3], (wx + ux * p * 0.4 - nx * p * 0.2, wy + uy * p * 0.4 - ny * p * 0.2)], shd)
    tips = []
    for j, o in enumerate((0.36, 0.12, -0.12, -0.34)):
        bx, by = wx + ux * p * 0.98 + nx * p * o, wy + uy * p * 0.98 + ny * p * o
        if fingers == "point" and j > 0:
            L = p * 0.35
            ex, ey = bx + ux * L * 0.5 - nx * p * 0.12, by + uy * L * 0.5 - ny * p * 0.12
        else:
            L = p * (0.78 if j in (1, 2) else 0.66)
            ex, ey = bx + ux * L, by + uy * L
        fr.line([(bx, by), (ex, ey)], skin if j < 2 else shd, width_m=p * 0.2)
        fr.circle(ex, ey, p * 0.1, fill=skin if j < 2 else shd)
        tips.append((ex, ey))
    tx, ty = wx + nx * p * 0.5 + ux * p * 0.3, wy + ny * p * 0.5 + uy * p * 0.3
    fr.line([(wx + nx * p * 0.3, wy + ny * p * 0.3), (tx, ty), (tx + ux * p * 0.35, ty + uy * p * 0.35)], skin,
            width_m=p * 0.22)
    return tips


ARC_FRAMES = (28, 34, 38, 41, 43, 45, 47, 49, 51, 53, 55, 57, 59)


def s5_06(fr):
    t = fr.t
    zoom = 900.0 * (1 + 0.06 * seg(t, T(fr, 20), fr.dur, "inout"))
    fr.cam = Cam(-19.6, 201.2, zoom)
    mid = (-19.6, 201.2)
    sep = kf(t, [(T(fr, 20), 1.0), (T(fr, 40), 0.38, "inout"), (fr.dur, 0.25, "out")])
    a = math.radians(-28.0)
    ux, uy = math.cos(a), math.sin(a)
    B = (mid[0] - ux * sep / 2, mid[1] - uy * sep / 2)
    R = (mid[0] + ux * sep / 2, mid[1] + uy * sep / 2)

    # ---- soft background: Gojo's chest and chin behind the hands ----------------
    def back():
        inserts._bg(fr, (26, 24, 38), (74, 54, 62), bokeh=False)
        fr.s_poly([(-0.05, 1.05), (-0.05, 0.12), (0.12, 0.05), (0.3, 0.1), (0.46, 0.24), (0.56, 0.5), (0.6, 1.05)],
                  (16, 17, 24))
        fr.s_poly([(0.02, -0.05), (0.04, 0.08), (0.14, 0.13), (0.27, 0.1), (0.3, -0.05)], (190, 160, 148))
        fr.s_poly([(0.03, 0.09), (0.15, 0.15), (0.29, 0.12), (0.3, 0.17), (0.14, 0.2), (0.02, 0.15)], GOJO.accent)
        fr.s_line([(0.12, 0.05), (0.3, 0.1), (0.46, 0.24), (0.56, 0.5)], (110, 90, 100), width=6)
    soft_draw(fr, back, radius=12.0)
    # ---- arms and hands, perfectly steady (on 2s) -------------------------------
    hb_ang = math.atan2(R[1] - B[1], R[0] - B[0]) - 0.9
    wb = (B[0] - math.cos(hb_ang) * 0.2 - 0.05, B[1] - math.sin(hb_ang) * 0.2 + 0.06)
    draw_hand(fr, wb, hb_ang, size=0.1, fingers="open", sleeve_from=(wb[0] - 0.55, wb[1] + 0.45))
    hr_ang = math.atan2(B[1] - R[1], B[0] - R[0])
    wr = (R[0] - math.cos(hr_ang) * 0.2, R[1] - math.sin(hr_ang) * 0.2 - 0.02)
    tips = draw_hand(fr, wr, hr_ang, size=0.095, fingers="point", sleeve_from=(wr[0] - 0.3, wr[1] - 0.7))
    rpt = (tips[0][0] + math.cos(hr_ang) * 0.04, tips[0][1] + math.sin(hr_ang) * 0.04)
    R = rpt
    # ---- the thread of dust and glass between them -------------------------------
    rng = fr.srng("s506thread")
    L = math.hypot(R[0] - B[0], R[1] - B[1]) or 1e-6
    ex, ey = (R[0] - B[0]) / L, (R[1] - B[1]) / L
    nx, ny = -ey, ex
    for i in range(70):
        ph = (rng.random() + t * rng.uniform(0.5, 0.9)) % 1.0
        side = rng.uniform(-1, 1)
        g = i % 7 == 0
        if i % 3 == 0:
            # near Red: shoved back out in jittering pulses
            pulse_ph = ((t + rng.random() * 0.2) % (T(fr, 5))) / T(fr, 5)
            s_ = 0.62 + 0.3 * pulse_ph ** 0.5 + rng.uniform(-0.05, 0.05)
            o = side * (0.05 + 0.12 * pulse_ph) + fr.rng.uniform(-0.006, 0.006)
        elif i % 3 == 1:
            # toward Blue: smooth, accelerating, straight
            s_ = 0.58 * (1 - ph) ** 2
            o = side * 0.06 * (1 - ph)
        else:
            # the middle: stalled, shredding
            s_ = rng.uniform(0.42, 0.62)
            o = side * 0.05 + fr.rng.uniform(-0.01, 0.01)
        x, y = B[0] + ex * L * s_ + nx * o, B[1] + ey * L * s_ + ny * o
        if g:
            fr.poly(chip_poly(x, y, 0.008, t * 5 + i, 3, random.Random(i)), shade(PAL["glass"], 0.7 + 0.3 * math.sin(t * 9 + i)))
        else:
            fr.circle(x, y, 0.0035 + 0.003 * rng.random(), fill=shade(PAL["dust"], 0.85 + 0.3 * rng.random()))
    # vibrating chips caught between the orbs (f40-60)
    if t >= T(fr, 40):
        for j in range(5):
            r2 = random.Random(j)
            s_ = 0.4 + 0.2 * r2.random()
            o = r2.uniform(-0.04, 0.04)
            x = B[0] + ex * L * s_ + nx * o + fr.rng.uniform(-0.004, 0.004)
            y = B[1] + ey * L * s_ + ny * o + fr.rng.uniform(-0.004, 0.004)
            fr.poly(chip_poly(x, y, 0.012, r2.uniform(0, 6), 5, r2), shade(PAL["concrete"], 0.8))
    # ---- the two techniques, each with its own behaviour -------------------------
    fx.blue(fr, B[0], B[1], t + 1.0, r=0.07, strength=0.4, streaks=50, salt="s506b")
    fx.red_charge(fr, R[0], R[1], t, r=0.05, strength=0.5)
    per = T(fr, 5)
    tp = t - (t % per)
    if t - tp < 0.2:
        fx.shockwave(fr, R[0], R[1], t - tp, r_max=0.28, dur=0.2, color=(255, 130, 120), width=2)
    # interference: the background bulges away from Red as the hands close
    kq = seg(t, T(fr, 20), T(fr, 40))
    if kq > 0:
        px, py = fr.P(R[0], R[1])
        fr.post.append(("lens", px / fr.ss, py / fr.ss, fr.S(0.3) / fr.ss, 0.05 * kq, t))
    # ---- tension arcs: every 6 frames, then every 2 ------------------------------
    fn = fr.f / _k(fr.shot)
    for af in ARC_FRAMES:
        if af <= fn < af + 2:
            r2 = random.Random(f"arc{af}{int(fn)}")
            for q in range(1 + (af >= 41)):
                a0 = (B[0] + ex * 0.09 + r2.uniform(-0.02, 0.02), B[1] + ey * 0.09 + r2.uniform(-0.03, 0.03))
                a1 = (R[0] - ex * 0.06 + r2.uniform(-0.02, 0.02), R[1] - ey * 0.06 + r2.uniform(-0.03, 0.03))
                arc_bolt(fr, a0, a1, r2, width_px=2.4, jag=0.12)


# =============================================================================
# S5-07  EWS from street level, looking straight up: the world reacts. The sky
#        darkens around his hands, light bends toward one point, debris trembles.
# =============================================================================

def s5_07(fr):
    t = fr.t
    roll = 2.0 * fr.u
    fr.cam = Cam(30.0, 150.0, 6.0, rot=roll)
    W, H = fr.W, fr.H
    ar = math.radians(roll)
    ca, sa = math.cos(ar), math.sin(ar)

    def sp(u, v):
        dx, dy = (u - 0.5) * W, (v - 0.5) * H
        return (W / 2 + dx * ca + dy * sa, H / 2 - dx * sa + dy * ca)

    FX, FY = fr.P(-19.6, 201.2)
    fu, fv = FX / W, FY / H
    k_dark = seg(t, 0.0, T(fr, 20), "inout")
    k_bend = seg(t, T(fr, 10), T(fr, 40), "inout")
    k_vib = seg(t, T(fr, 16), T(fr, 24), "inout") * (1 - 0.3 * seg(t, T(fr, 50), fr.dur))
    tg = C.tg(fr)

    # ---- sky: dark zenith, the torn storm deck overhead with its warm gap -------
    def sky():
        top, bot = (16, 16, 30), (100, 70, 74)
        for i in range(30):
            fr.draw.polygon([sp(-0.3, i / 30 - 0.05), sp(1.3, i / 30 - 0.05), sp(1.3, (i + 1) / 30 - 0.04),
                             sp(-0.3, (i + 1) / 30 - 0.04)], fill=mix_color(top, bot, (i / 29) ** 1.3))
        rng = random.Random("s507gap")
        gap = []
        for k in range(32):
            a = k * math.tau / 32
            j = rng.uniform(0.75, 1.2)
            gap.append((0.53 + math.cos(a) * 0.17 * j, 0.07 + math.sin(a) * 0.08 * j))
        fr.draw.polygon([sp(*q) for q in gap], fill=(178, 124, 98))
        fr.draw.polygon([sp(0.53 + (q[0] - 0.53) * 0.6, 0.075 + (q[1] - 0.07) * 0.5) for q in gap], fill=(220, 166, 122))
        img, dr = fr.layer()
        rng = random.Random("s507deck")
        for i in range(50):
            u = rng.uniform(-0.25, 1.25) - tg * 0.003
            v = rng.uniform(-0.12, 0.34)
            if math.hypot((u - 0.53) / 0.17, (v - 0.07) / 0.08) < 1.05:
                continue
            rw, rh = rng.uniform(0.08, 0.22), rng.uniform(0.03, 0.07)
            c = mix_color(PAL["cloud"], PAL["cloud_lit"], clamp(0.65 - math.hypot(u - 0.53, v - 0.07) * 1.3))
            X, Y = sp(u, v)
            dr.ellipse([X - rw * W, Y - rh * H, X + rw * W, Y + rh * H], fill=c + (int(rng.uniform(150, 230)),))
        fr.merge(img)
    soft_draw(fr, sky, radius=2.5)
    # ---- local darkening: a bruise-violet pall spreads around the hands ---------
    radial_shade(fr, FX, FY, (0.1 + 0.36 * k_dark) * H, (24, 6, 40), 235 * k_dark, steps=16)
    # ---- light shafts through the gap: they curve toward the focal point ----------
    img, dr = fr.layer()
    for k, (o, w) in enumerate(((-0.13, 0.022), (-0.07, 0.035), (0.0, 0.028), (0.08, 0.04))):
        left, right = [], []
        for q in range(15):
            v = 0.08 + q * 0.07
            u0 = 0.53 + o + (v - 0.08) * (0.05 + 0.06 * k)
            row = []
            for uq in (u0, u0 + w * (1 + (v - 0.08) * 1.6)):
                dx, dy = fu - uq, fv - v
                dd = math.hypot(dx, dy) + 1e-3
                pullk = k_bend * 0.2 * math.exp(-dd * 2.0) * min(1.0, dd / 0.06)
                row.append(sp(uq + dx / dd * pullk, v + dy / dd * pullk * 0.7))
            left.append(row[0])
            right.append(row[1])
        dr.polygon(left + right[::-1], fill=(255, 196, 140, 30))
    fr.merge(img)
    # ---- the towers lean in toward the top of frame (looking straight up) ---------
    VPu, VPv = 0.5, -0.9

    def edge(ub, v):
        return VPu + (ub - VPu) * (v - VPv) / (1.08 - VPv)

    def wob(u, v):
        """Heat-haze ripple of outlines near the focal point (lensing, not a swirl)."""
        dd = math.hypot(u - fu, (v - fv) * 0.7)
        a = k_bend * 0.007 * math.exp(-dd * 3.5)
        return u + a * math.sin(v * 80 + t * 18), v

    towers = [  # base u0, u1, top v, colour, kind  (far to near)
        (0.22, 0.66, 0.7, (56, 46, 58), "far"),
        (0.04, 0.26, 0.42, (40, 36, 50), "west"),
        (0.6, 0.86, 0.375, (50, 50, 60), "gutted"),
        (0.4, 0.62, 0.64, (44, 40, 52), "east"),
        (-0.7, 0.07, -0.08, (22, 22, 32), "west"),
        (0.92, 1.8, -0.08, (24, 24, 34), "east"),
    ]
    beam_tip = None
    for ti, (b0, b1, vt, col, kind) in enumerate(towers):
        rngt = random.Random(f"s507t{ti}")
        poly = [sp(*wob(edge(b0, 1.08 - (1.08 - vt) * q / 10), 1.08 - (1.08 - vt) * q / 10)) for q in range(11)]
        for q in range(1, 7):
            uu = lerp(edge(b0, vt), edge(b1, vt), q / 7)
            poly.append(sp(*wob(uu, vt - (rngt.uniform(-0.004, 0.018) if kind not in ("gutted",) else 0.0))))
        poly += [sp(*wob(edge(b1, vt + (1.08 - vt) * q / 10), vt + (1.08 - vt) * q / 10)) for q in range(11)]
        fr.draw.polygon(poly, fill=col)
        nfl = 22 if kind != "far" else 10
        for q in range(1, nfl):
            v = vt + (1.08 - vt) * (q / nfl) ** 1.5
            fr.draw.line([sp(edge(b0, v), v), sp(edge(b1, v), v)], fill=shade(col, 0.72 if kind != "gutted" else 1.22),
                         width=max(1, int(2 * fr.ss)))
            if kind in ("west", "east"):
                for wq in range(6):
                    if rngt.random() < 0.3:
                        uu = lerp(edge(b0, v), edge(b1, v), rngt.uniform(0.05, 0.9))
                        ww = (edge(b1, v) - edge(b0, v)) * rngt.uniform(0.03, 0.08)
                        hh = 0.008 + 0.025 * (q / nfl) ** 1.5
                        fr.draw.polygon([sp(uu, v), sp(uu + ww, v), sp(uu + ww * 0.9, v + hh), sp(uu + 0.1 * ww, v + hh)],
                                        fill=(10, 10, 16))
        rim_b = b1 if kind == "west" else b0
        fr.draw.line([sp(edge(rim_b, 1.08), 1.08), sp(edge(rim_b, max(vt, -0.1)), max(vt, -0.1))],
                     fill=mix_color(col, PAL["rim_warm"], 0.5), width=max(1, int(3 * fr.ss)))
        if kind == "gutted":
            for q in range(5):
                ub = lerp(b0, b1, q / 4)
                fr.draw.line([sp(edge(ub, 1.08), 1.08), sp(edge(ub, vt), vt)], fill=shade(col, 1.35),
                             width=max(1, int(5 * fr.ss)))
            # the three gutted floors, and the steel beam dangling from them
            g0, g1 = vt + 0.05, vt + 0.1
            fr.draw.polygon([sp(edge(b0, g0), g0), sp(edge(b1, g0), g0), sp(edge(b1, g1), g1), sp(edge(b0, g1), g1)],
                            fill=(12, 12, 18))
            bx = lerp(edge(b0, g1), edge(b1, g1), 0.36)
            sw = 0.003 * math.sin(t * 1.7) + k_vib * fr.rng.uniform(-0.004, 0.004)
            beam_tip = (bx + sw + 0.006, g1 + 0.11)
            fr.draw.line([sp(bx, g1), sp(*beam_tip)], fill=(120, 76, 56), width=max(2, int(7 * fr.ss)))
        # loose chips and glass hanging off the broken edges: they tremble
        if kind in ("west", "east", "gutted"):
            for q in range(14):
                v = max(vt, -0.05) + rngt.uniform(0.02, 0.5) * (1.08 - max(vt, -0.05))
                side = b1 if kind == "west" else b0
                uu = edge(side, v) + (0.005 if side == b1 else -0.005) * (-1 if kind == "west" else 1)
                j = k_vib * 0.003
                X, Y = sp(uu + fr.rng.uniform(-j, j), v + fr.rng.uniform(-j, j))
                rr = rngt.uniform(2.0, 5.5) * fr.ss
                fr.draw.polygon([(X - rr, Y), (X, Y - rr * 0.8), (X + rr, Y + rr * 0.3)],
                                fill=shade(PAL["glass"] if q % 3 == 0 else PAL["concrete"], 0.75))
    # ---- f40: a cracked pane slips out of a facade and falls ----------------------
    t_pane = cue(fr, "glass_shatter", 0, 40)
    pu0, pv0 = edge(0.62, 0.72) - 0.012, 0.72
    if t >= t_pane - T(fr, 6) and t < t_pane:
        X, Y = sp(pu0, pv0)
        fr.draw.line([(X - 8 * fr.ss, Y - 10 * fr.ss), (X + 6 * fr.ss, Y + 9 * fr.ss)], fill=(220, 230, 240), width=2)
    if t >= t_pane:
        tp = t - t_pane
        pu, pv = pu0 - 0.04 * tp, pv0 + 0.7 * tp * tp
        sz = 0.014 * (1 + 2.0 * tp)
        rot = tp * 5
        pts = [(pu + math.cos(rot + q * 1.6) * sz * 0.55, pv + math.sin(rot + q * 1.6) * sz) for q in range(4)]
        fr.draw.polygon([sp(*q) for q in pts], fill=shade(PAL["glass"], 0.75 + 0.25 * math.sin(tp * 20)))
    # ---- foreground asphalt: the dust shivers into ripples ----------------------
    fr.draw.polygon([sp(-0.3, 0.875), sp(1.3, 0.895), sp(1.3, 1.3), sp(-0.3, 1.3)], fill=(34, 32, 38))
    rng = random.Random("s507ck")
    for q in range(10):
        u = rng.uniform(0, 1)
        fr.draw.line([sp(u, 0.89), sp(u + rng.uniform(-0.05, 0.05), 0.92), sp(u + rng.uniform(-0.08, 0.08), 0.96)],
                     fill=(16, 14, 18), width=max(1, int(2 * fr.ss)))
    img, dr = fr.layer()
    for q in range(8):
        rr = 0.04 + q * 0.045 + ((t * 0.12) % 0.045)
        a = int(110 * k_vib * (1 - q / 8))
        X, Y = sp(0.45, 0.96)
        dr.arc([X - rr * W, Y - rr * H * 0.22, X + rr * W, Y + rr * H * 0.22], 180, 360,
               fill=(178, 158, 132, a), width=max(1, int(2 * fr.ss)))
    rng = random.Random("s507dust")
    for q in range(80):
        u, v = rng.uniform(0, 1), rng.uniform(0.89, 0.94)
        j = k_vib * 0.003
        X, Y = sp(u + fr.rng.uniform(-j, j), v + fr.rng.uniform(-j, j) * 0.5)
        r = rng.uniform(1.0, 3.0) * fr.ss
        dr.ellipse([X - r, Y - r * 0.6, X + r, Y + r * 0.6], fill=(160, 140, 120, 160))
    fr.merge(img)
    # ---- the two fighters, tiny and high: Gojo upper left, Thragg upper right ---
    gp, _, _ = purple_hands(fr, 1.0, t, sep=0.4)
    gojo(fr, gp, G_X, G_Y, 1, scale=READ_SCALE_EWS, halo=1.6)
    thragg(fr, P(T_STILL, ua_f=12, fa_f=100, hand_f="open"), T_X, T_Y, -1, scale=READ_SCALE_EWS, halo=1.4)
    # the focal point: two tiny lights and a violet halo at his hands
    fr.glow_circle(-18.6, 201.6, 1.6, (70, 30, 110))
    fr.glow_circle(-19.0, 202.2, 0.7, (40, 100, 230))
    fr.glow_circle(-18.2, 201.0, 0.7, (210, 30, 40))
    fr.post.append(("lens", FX / fr.ss, FY / fr.ss, 0.3 * OUT_H, -0.14 * k_bend, t))


# =============================================================================
# S5-08  ECU Gojo: absolute stillness. Blue light on one side of his face, red
#        on the other; red threads creep into the whites of his eyes.
# =============================================================================

def face_washes(fr, k_conv, flick, bottom_violet=0.0, strength=1.0):
    """Split blue/red light across a face close-up (screen space): blue from
    screen-left, red from screen-right, sliding together as k_conv -> 1.
    Drawn small, blurred and scaled up so the light has no edges."""
    w, h = max(8, fr.W // 16), max(8, fr.H // 16)
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    dr = ImageDraw.Draw(im)
    for i in range(w):
        u = i / w
        reach_ = 0.5 + 0.3 * k_conv
        ab = clamp(1 - u / reach_) ** 1.3 * (70 + 25 * flick) * strength
        ar = clamp(1 - (1 - u) / reach_) ** 1.3 * (70 + 25 * (1 - flick)) * strength
        if ab >= 1:
            dr.line([(i, 0), (i, h)], fill=(70, 140, 255, int(ab)))
        if ar >= 1:
            # alpha-over: combine the red on top of the blue column
            c = im.getpixel((i, 0))
            a0 = c[3] / 255.0
            a1 = ar / 255.0
            a = a1 + a0 * (1 - a1)
            col = tuple(int((255 * a1 * rc + c[k] * a0 * (1 - a1)) / max(1e-6, a) / 255)
                        for k, rc in enumerate((255, 60, 76)))
            dr.line([(i, 0), (i, h)], fill=col + (int(255 * a),))
    if bottom_violet > 0:
        for j in range(h // 3):
            v = 1 - j / h
            a = int(130 * bottom_violet * (1 - j / (h / 3)) ** 1.5)
            row = int(v * h) - 1
            for i in range(w):
                c = im.getpixel((i, row))
                a0, a1 = c[3] / 255.0, a / 255.0
                aa = a1 + a0 * (1 - a1)
                col = tuple(int((vc * a1 + c[k] * a0 * (1 - a1)) / max(1e-6, aa)) for k, vc in enumerate((170, 80, 255)))
                im.putpixel((i, row), col + (int(255 * aa),))
    im = im.filter(ImageFilter.GaussianBlur(1.5)).resize((fr.W, fr.H), Image.BILINEAR)
    fr.img.paste(im, (0, 0), im)


def hair_strands(fr, cu, cv, s, t, k_pull=1.0, flip=1, salt="strands"):
    """Loose white strands drawn toward the Blue (left) and pushed by the Red (right)."""
    L = inserts.Local(fr, cu, cv, s, 0.0, flip)
    rng = random.Random(salt)
    for j in range(12):
        x0 = rng.uniform(-0.6, 0.6)
        y0 = rng.uniform(-0.95, -0.55)
        side = -1 if x0 < 0.05 else 1
        ph = math.sin(t * rng.uniform(5, 9) + j) * 0.5 + 0.5
        dx = side * (0.08 + 0.1 * ph) * k_pull
        dy = rng.uniform(0.1, 0.3)
        L.line([(x0, y0), (x0 + dx * 0.5, y0 + dy * 0.5), (x0 + dx, y0 + dy - 0.05 * ph)], GOJO.hair, 0.012)


def s5_08(fr):
    t = fr.t
    fr.cam = Cam(0.0, 0.0, 1080.0)
    plate_bg(fr, (24, 22, 36), (50, 40, 60), smoke=False, salt="s508")
    s = 2.6
    cu, cv = 0.427, 0.63
    flick = 0.5 + 0.5 * math.sin(t * 31) * math.sin(t * 13)
    k_conv = seg(t, T(fr, 34), fr.dur, "inout")
    inserts.gojo_face(fr, cu, cv, s, expr="focused", eyes="open", flip=1, t=t, eye_glow=0.12,
                      hair_wind=0.04 * math.sin(t * 8))
    hair_strands(fr, cu, cv, s, t, salt="s508h")
    veins = seg(t, T(fr, 18), T(fr, 34), "inout")
    refl = [(-0.02, 0.006, (130, 200, 255)), (0.022, 0.012, (255, 110, 110))]
    gojo_eyes(fr, cu, cv, s, gx=0.15, gy=0.1, flip=1, glow=0.12, veins=veins, refl=refl, salt="s508v")
    face_washes(fr, k_conv, flick, bottom_violet=seg(t, T(fr, 34), fr.dur, "in"))
    # the arcs crackling below frame flicker the light
    if (fr.f // 2) % 3 == 0:
        fr.flash = 0.03


# =============================================================================
# S5-09  CU Thragg: for the first time the man needs TIME. Recognition becomes
#        decision; anticipation; one compressed frame; gone down the line.
# =============================================================================

def s5_09(fr):
    t = fr.t
    t2 = on2(fr) if fr.f / _k(fr.shot) < 37 else t
    t_go = cue(fr, "accel_burst", 0, 47)
    t_comp = t_go - T(fr, 1)
    sh = shake_n(t, t_go, 10.0, 3)
    fr.cam = Cam(82.0, 181.6, 380.0, shake=sh)
    soft_draw(fr, lambda: plate_bg(fr, (24, 22, 38), (64, 50, 62), smoke=True, salt="s509", t=C.tg(fr),
                                   warm_side=-1), radius=0, offset=sh)
    # the distant violet charge, off screen-left, flickers on everything
    flk = 0.75 + 0.25 * math.sin(t * 23) * math.sin(t * 7)
    soft_draw(fr, lambda: specks(fr, C.tg(fr), n=34, salt="s509sp", col=(120, 104, 100), size=(0.002, 0.006)),
              radius=2.0, offset=sh)
    if t < t_go:
        k_ant = seg(t, T(fr, 37), T(fr, 45), "inout")
        rot = -14.0 * k_ant
        s = 0.86 * (1 + 0.05 * k_ant)
        cu, cv = 0.56 - 0.04 * k_ant, 0.42 + 0.03 * k_ant
        if t >= t_comp:
            rot, s, cu, cv = -24.0, 0.9, 0.5, 0.47
        flip = -1
        L = inserts.Local(fr, cu, cv, s, rot, flip)
        lift = seg(t2, T(fr, 30), T(fr, 36), "out")
        fl = math.sin(t * 6) * 0.05
        L.poly([(-0.95, 0.95), (-1.3, 0.62 - lift * 0.35 + fl), (-1.42, 0.78 - lift * 0.3 - fl),
                (-1.6, 0.56 - lift * 0.4 + fl), (-1.55, 1.05), (-1.1, 1.35)], shade(THRAGG.accent, 0.7))
        inserts.thragg_face(fr, cu, cv, s, expr="analytical", injuries=["mouth_blood"], flip=flip, t=t, rot=rot)
        thragg_cu_body(L, t)
        # eyes narrow (f0-8): the recognition
        oh = lerp(0.035, 0.02, seg(t2, 0.0, T(fr, 8), "inout"))
        if t >= T(fr, 37):
            oh = 0.026
        thragg_eyes_rot(fr, cu, cv, s, rot, flip, oh, gx=1.0, gy=-0.4,
                        refl=[(0.012, 0.006, (190, 120, 255))])
        # the right hand leaves the ribs and closes into a fist (f30-36)
        kf_ = seg(t2, T(fr, 30), T(fr, 36), "inout")
        g = THRAGG.accent
        hx, hy = lerp(-0.6, -0.15, kf_), lerp(1.32, 1.12, kf_)
        if kf_ < 0.5:
            thragg_hand_ribs_at(L, hx, hy, open_k=1.0)
        else:
            L.poly([(hx - 0.16, hy - 0.12), (hx + 0.12, hy - 0.14), (hx + 0.18, hy + 0.1), (hx - 0.14, hy + 0.14)], g)
            for q in range(4):
                L.line([(hx - 0.1 + q * 0.07, hy - 0.13), (hx - 0.1 + q * 0.07, hy - 0.04)], shade(g, 0.6), 0.012)
        # violet flicker from the charge, on the side of his face toward Gojo
        img, dr = fr.layer()
        front = [(0.04, 0.74), (0.34, 0.68), (0.52, 0.42), (0.56, 0.0), (0.52, -0.46), (0.22, -0.62), (0.14, 0.0)]
        dr.polygon([L.p(*q) for q in front], fill=(150, 70, 255, int(46 * flk)))
        dr.polygon([L.p(*q) for q in [(0.3, 0.7), (0.52, 0.42), (0.56, 0.0), (0.52, -0.46), (0.4, -0.5), (0.44, 0.0)]],
                   fill=(170, 100, 255, int(40 * flk)))
        fr.merge(img)
        L.line([(0.52, -0.46), (0.57, 0.0), (0.53, 0.42)], shade((200, 150, 255), 0.6 + 0.4 * flk), 0.012)
    else:
        # gone in a single frame: a vapour cone tears off where he was, the
        # drifting debris is blasted outward in a ring
        tg_ = t - t_go
        x0, y0 = 81.95, 181.65
        dirx, diry = -1.0, 0.19
        fx.sonic_boom(fr, x0 - 0.1, y0 + 0.02, tg_, dirx, diry, size=0.42)
        fx.shockwave(fr, x0, y0, tg_, r_max=1.5, dur=0.4, color=(230, 232, 240), width=3)
        fx.debris(fr, x0, y0, tg_, n=36, speed=16.0, spread=math.tau, angle=0.0, size=(0.01, 0.04), g=0.0, drag=1.2,
                  salt="s509ring")
        fx.dust_cloud(fr, x0, y0, tg_, r=0.8, n=14, color=(210, 214, 224), rise=0.0, salt="s509puff", ground=False,
                      alpha=90)
        fx.speed_lines(fr, 0.6 * (1 - clamp(tg_ / 0.12)), direction=(-1, 0.19), salt="s509sl")


def thragg_eyes_rot(fr, cu, cv, s, rot, flip, open_h, gx=0.0, gy=0.0, refl=None):
    L = inserts.Local(fr, cu, cv, s, rot, flip)
    for ex in (0.34, -0.06):
        L.ell(ex, -0.13, 0.1, open_h + 0.01, fill=(220, 214, 214))
        ix, iy = ex + 0.02 + gx * 0.035, -0.13 + gy * min(0.02, open_h * 0.5)
        L.ell(ix, iy, 0.035, open_h + 0.005, fill=(40, 24, 22))
        L.ell(ix, iy, 0.018, min(0.018, open_h * 0.6), fill=(10, 6, 8))
        if refl:
            for dx, dy, col in refl:
                L.ell(ix + dx, iy + dy, 0.007, 0.007, fill=col)


def thragg_hand_ribs_at(L, hx, hy, open_k=1.0):
    g = THRAGG.accent
    L.poly([(hx - 0.2, hy + 0.2), (hx - 0.24, hy - 0.04), (hx - 0.02, hy - 0.1), (hx + 0.24, hy - 0.06), (hx + 0.3, hy + 0.2)], g)
    for k in range(4):
        x = hx - 0.16 + k * 0.1
        L.line([(x, hy - 0.06), (x - 0.03, hy + 0.05)], shade(g, 0.6), 0.012)



# =============================================================================
# S5-10  CU -> swing out along the trajectory: white-out, release, the sphere
#        surges down the line; Thragg corkscrews off the core; the shell takes
#        his trailing left forearm (f12); the wake flays his flank and ear.
# =============================================================================
T_ROLL = P("t_fly_punch", lean=84, neck=-20, ua_n=-140, fa_n=-150, ua_f=70, fa_f=112, th_n=-82, sh_n=-96, th_f=-98,
           sh_f=-112, hand_n="open")
R_PURPLE = 5.0


def roll_pose(state, toward=(0.7, 0.7)):
    """Thragg mid-corkscrew. state 0 = belly down (facing west), 1 = belly up.
    His trailing LEFT arm always reaches back/up toward the sphere."""
    if state == 0:
        p, f, side = dict(T_ROLL), -1, "n"
    else:
        p, f, side = swap_sides(rot_pose(T_ROLL, 180)), 1, "f"
        p["hand_f"] = "open"
    a = rig_angle(toward[0], toward[1], f)
    p[f"ua_{side}"] = a - 12
    p[f"fa_{side}"] = a + 4
    return p, f


def purple_sphere(fr, x, y, R, t, d=None, lens=0.1, strength=0.38):
    fx.purple_orb(fr, x, y, R, t, strength=strength, d=d)
    if fr.post and fr.post[-1][0] == "lens":
        k = list(fr.post[-1])
        k[4] = lens
        fr.post[-1] = tuple(k)


def wake_band(fr, x0, y0, x1, y1, R, t, salt="wake", alpha=80, grit=60, d=None):
    """The displacement wake: violet-black turbulence packed with grit,
    streaming after the sphere along the line (x0,y0) -> (x1,y1)."""
    L = math.hypot(x1 - x0, y1 - y0)
    if L < 0.1:
        return
    ux, uy = (x1 - x0) / L, (y1 - y0) / L
    nx, ny = -uy, ux
    img, dr = fr.layer()
    rng = fr.srng(salt)
    for i in range(26):
        s_ = rng.random()
        o = rng.uniform(-0.85, 0.85) * R * (0.4 + 0.6 * s_)
        cx, cy = x0 + ux * L * s_ + nx * o, y0 + uy * L * s_ + ny * o
        X, Y = fr.P(cx, cy, d)
        rr = fr.S(R * rng.uniform(0.25, 0.5) * (0.5 + 0.5 * s_), d)
        c = mix_color((26, 10, 40), (90, 40, 130), rng.random() * 0.5)
        dr.ellipse([X - rr * 1.6, Y - rr, X + rr * 1.6, Y + rr], fill=c + (int(alpha * rng.uniform(0.5, 1.0)),))
    fr.merge(img)
    for i in range(grit):
        s_ = (rng.random() + t * rng.uniform(2.0, 4.0)) % 1.0
        o = rng.uniform(-0.8, 0.8) * R * (0.4 + 0.6 * s_)
        cx, cy = x0 + ux * L * s_ + nx * o, y0 + uy * L * s_ + ny * o
        ln = rng.uniform(0.4, 1.4)
        fr.line([(cx, cy), (cx + ux * ln, cy + uy * ln)], shade((200, 180, 220), rng.uniform(0.5, 1.0)), width_px=2, d=d)


def s5_10(fr):
    t = fr.t
    fn = fr.f / _k(fr.shot)
    t_white = cue(fr, "purple_charge", 0, 2)
    t_rel = cue(fr, "purple_release", 0, 4)
    t_roll = cue(fr, "whoosh", 0, 10)
    t_hit = cue(fr, "shockwave", 0, 12)
    if t < t_rel:
        # ---- CU: the eyes flick right down the line; the hands snap together
        fr.cam = Cam(0.0, 0.0, 1080.0)
        plate_bg(fr, (24, 22, 36), (50, 40, 60), smoke=False, salt="s510")
        s, cu, cv = 1.55, 0.44, 0.6
        inserts.gojo_face(fr, cu, cv, s, expr="focused", eyes="open", flip=1, t=t, eye_glow=0.25)
        gx = 0.85 if fn >= 1 else 0.2
        gojo_eyes(fr, cu, cv, s, gx=gx, gy=0.15, flip=1, glow=0.25, veins=1.0, salt="s508v",
                  refl=[(-0.01, 0.01, (220, 180, 255))])
        snap = seg(t, T(fr, 1), T(fr, 2), "snap")
        face_washes(fr, 0.6 + 0.4 * snap, 0.5, bottom_violet=0.6 + 0.4 * snap)
        fr.glow_circle(0.5, 1.12, 0.1 + 0.08 * snap, (110, 60, 170), world=False)
        if t >= t_white:
            # TWO-FRAME WHITE-OUT at the meeting point
            fr.flash = 1.0 if fn < t_white * FPS / _k(fr.shot) + 1 else 0.88
            fr.tint = (235, 225, 255, 0.15)
        return
    # ---- the swing: off his face, round his shoulder, out along the trajectory
    zk = [(t_rel, 900.0), (T(fr, 6), 240.0, "out"), (T(fr, 12), 70.0, "inout"), (T(fr, 27), 55.0, "inout")]
    xk = [(t_rel, -19.8), (T(fr, 6), -17.6, "out"), (T(fr, 12), -5.0, "inout"), (T(fr, 27), 3.0, "inout")]
    yk = [(t_rel, 201.7), (T(fr, 6), 200.8, "out"), (T(fr, 12), 196.0, "inout"), (T(fr, 27), 195.0, "inout")]
    zoom, cx, cy = zkf(t, zk), kf(t, xk), kf(t, yk)
    fr.cam = Cam(cx, cy, zoom)
    sky_plate(fr, tower=False, haze=0.45, blur=2.0, smoke_alpha=70, shafts=0.7,
              plate_cam=Cam(40.0 + 0.6 * (cx + 20.0), cy, 16.0))
    if T(fr, 5) <= t < T(fr, 11):
        vx = (kf(t, xk) - kf(t - 1 / FPS, xk)) * zoom
        fr.blur_dir = (clamp(vx * 0.5, -36, 36), 0.0)
    xs = kf(t, [(t_rel, -14.0), (t_hit, -2.0, "out"), (T(fr, 27), 12.0, "in")])
    ys = line_y(xs)
    s_line = xs
    # ---- drifting debris: in the path it simply ceases; at the edges it is
    #      wrenched in after the sphere
    rng = fr.srng("s510deb")
    for i in range(70):
        bx, by = rng.uniform(-24.0, 22.0), rng.uniform(186.0, 206.0)
        x, y = bx - 0.3 * t, by - 0.2 * t
        perp = abs((y - line_y(x)) * math.cos(math.atan(SLOPE)))
        if x < s_line and t >= t_rel:
            if perp < R_PURPLE:
                continue
            if perp < R_PURPLE * 1.8:
                k = clamp((s_line - x) / 6.0) * (1 - (perp - R_PURPLE) / (0.8 * R_PURPLE))
                ly = line_y(x)
                y = y + (ly - y) * 0.5 * k
                x = x + 3.5 * k
        kind = i % 3
        sz = rng.uniform(0.08, 0.25)
        if kind == 2:
            fr.poly(chip_poly(x, y, sz * 0.8, t * 3 + i, 3, random.Random(i)), shade(PAL["glass"], 0.6 + 0.4 * abs(math.sin(t * 5 + i))))
        else:
            fr.poly(chip_poly(x, y, sz, t * 2 + i, 5, random.Random(i)), shade(PAL["concrete"], 0.7))
    # ---- the wake behind the sphere, and the sphere -------------------------------
    hands = (G_X + 0.65, G_Y + 0.45)
    wake_band(fr, hands[0] + 0.5, line_y(hands[0] + 0.5), xs - R_PURPLE * 0.4, ys, R_PURPLE * 0.9, t, salt="s510w",
              alpha=70 if t < t_hit else 95)
    born = seg(t, t_rel, t_rel + 1.0 / FPS, "out")
    purple_sphere(fr, xs, ys, R_PURPLE * (0.85 + 0.15 * born), t, lens=0.08)
    if t < t_rel + 0.5 / FPS:
        fr.glow_circle(hands[0] + 0.4, hands[1], 0.5, (120, 80, 170))
    # ---- Gojo: arms extended east from the release --------------------------------
    gojo(fr, P(G_ARMS_OUT, lean=6), G_X, G_Y, 1)
    # ---- Thragg: up the line, corkscrew (rotation f10, trajectory f11), contact f12
    if fn >= 8:
        TK = [(T(fr, 8), (12.0, 194.2)), (T(fr, 9), (6.0, 194.6)), (t_roll, (2.0, 194.0)), (T(fr, 11), (-0.6, 192.0)),
              (t_hit, (-3.0, 191.0)), (T(fr, 15), (-6.4, 193.2)), (T(fr, 18), (-9.0, 196.0)), (T(fr, 22), (-13.0, 198.0)),
              (T(fr, 27), (-16.5, 199.0))]
        tx, ty = catmull(TK, t)
        if t < t_roll:
            pose, tf = P(T_ROLL, ua_n=-60, fa_n=-70, ua_f=-50, fa_f=-60), -1
        else:
            st = int((fn - 10) // 1) % 3
            st = 0 if st == 0 else 1
            pose, tf = roll_pose(st, toward=((xs - tx), (ys - ty)) if t < t_hit + 1 / FPS else (0.7, 0.4))
        if t < t_hit + 2 / FPS:
            trail = [catmull(TK, max(T(fr, 8), t - k * 0.02)) for k in range(8, -1, -1)]
            fx.trail(fr, [(x_, y_ + 0.3) for x_, y_ in trail], width_m=1.4, alpha=100)
        if t >= t_roll:
            # corkscrew vapour: a helix wound round his path
            pts = []
            for k in range(24):
                tt = t - k * 0.012
                if tt < t_roll:
                    break
                px_, py_ = catmull(TK, tt)
                ph = (tt - t_roll) * 40.0
                pts.append((px_ + 0.9, py_ + 0.3 + math.sin(ph) * 0.9))
            if len(pts) > 2:
                fr.line(pts[::-1], (230, 232, 244), width_px=2)
        J = thragg(fr, pose, tx, ty, tf, switch=t_hit)
        if t_hit <= t < t_hit + 8 / FPS:
            th = t - t_hit
            # the stump sears black, smoking; a ribbon of blood mist dragged into the wake
            side = "n" if tf == -1 else "f"
            ex_, ey_ = J[f"el_{side}"]
            smoke_trail(fr, [(ex_ + 0.35 * k, ey_ + 0.12 * k) for k in range(6, -1, -1)], t, salt="s510stump", width=0.18,
                        col=(60, 50, 56), alpha=140)
        if t >= t_hit:
            rngb = fr.srng("s510blood")
            for k in range(36):
                te = t_hit + rngb.uniform(0, 8) / FPS
                if te > t:
                    continue
                ex_, ey_ = catmull(TK, te)
                age = t - te
                bx_ = ex_ + 0.2 + age * rngb.uniform(9, 16)
                by_ = ey_ + 0.4 + age * rngb.uniform(-1, 2.5) + rngb.uniform(-0.3, 0.3)
                fr.circle(bx_, by_, 0.05 + 0.04 * rngb.random(), fill=(130, 10, 20))
    # ---- f12: CONTACT - the shell takes the trailing left forearm -----------------
    if t_hit <= t < t_hit + 5 / FPS:
        th = t - t_hit
        cpt = (-2.6, 191.9)
        a = 1 - clamp(th / (3.0 / FPS))
        if a > 0:
            fr.glow_circle(cpt[0] + 0.3, cpt[1] + 0.3, 0.6 * a + 0.2, shade((200, 160, 255), a))
            fr.circle(cpt[0] + 0.3, cpt[1] + 0.3, 0.22 * a + 0.04, fill=(250, 240, 255))
        # the lost hand and half-forearm, dragged into the wake and gone
        if th < 4 / FPS:
            fxp, fyp = cpt[0] + th * 30.0, cpt[1] + 0.6 + th * 8.0
            ang = th * 30.0
            ca_, sa_ = math.cos(ang), math.sin(ang)
            Lh = 0.2
            p0 = (fxp - ca_ * Lh, fyp - sa_ * Lh)
            p1 = (fxp + ca_ * Lh, fyp + sa_ * Lh)
            fr.line([p0, p1], THRAGG.suit, width_m=0.12)
            fr.circle(p1[0], p1[1], 0.08, fill=THRAGG.accent)
            fr.circle(p0[0], p0[1], 0.06, fill=(30, 20, 20))
        if th < 1.0 / FPS:
            fr.flash = 0.18



# =============================================================================
# S5-11  MS side-on: still spinning, Thragg drives an inverted hook up into
#        Gojo's right floating ribs. It stalls in Infinity. The wake rips him
#        away down the line.
# =============================================================================
T_INV = P("t_stand", lean=200, neck=18, ua_n=150, fa_n=150, ua_f=110, fa_f=128, th_n=160, sh_n=140, th_f=148,
          sh_f=122, hand_n="fist", hand_f="fist")


def stall_gap(t, t_launch, t_stall, g0, g_end=0.01, crawl=5.0):
    """Remaining gap (m) of a blow entering Infinity (VFX bible): 80% of the gap
    in 2 frames, 15% more over the next 6, then a Zeno crawl that never arrives."""
    span = g0 - g_end
    if t <= t_launch:
        return g0
    if t < t_stall:
        return g0 - 0.8 * span * (t - t_launch) / max(1e-6, t_stall - t_launch)
    t6 = t_stall + 6 / FPS
    if t < t6:
        return g_end + span * (0.2 - 0.15 * EASE["out"]((t - t_stall) / (6 / FPS)))
    return g_end + fx.zeno(0.05 * span, t - t6, rate=crawl)


def s5_11(fr):
    t = fr.t
    fn = fr.f / _k(fr.shot)
    t_stall = cue(fr, "infinity_stop", 0, 5)
    t_roar = cue(fr, "wind_gust", 0, 18)
    t_rip = cue(fr, "flyby", 0, 20)
    t_launch = t_stall - 2 / FPS
    cx = kf(t, [(T(fr, 22), -19.0), (T(fr, 28), -15.0, "inout"), (T(fr, 36), -19.5, "inout")])
    cy = kf(t, [(T(fr, 22), 200.5), (T(fr, 28), 198.0, "inout"), (T(fr, 36), 200.8, "inout")])
    fr.cam = Cam(cx, cy, 150.0)
    sky_plate(fr, tower=False, haze=0.45, blur=2.0, smoke_alpha=70, shafts=0.8,
              plate_cam=Cam(36.0 + 0.4 * (cx + 19.0), cy, 16.0))
    # the sphere, far down the line to the east-north-east: a violet point
    fr.glow_circle(cx + 9.0, cy - 1.6, 1.4, (90, 40, 140))
    fr.circle(cx + 9.0, cy - 1.6, 0.18, fill=(200, 160, 255))
    # ---- Gojo: a held cel, arms out, eyes down the line ---------------------------
    gpose = P(G_ARMS_OUT, lean=6)
    Jg0 = solve(GOJO, gpose, G_X, G_Y, 1)
    px_, py_ = Jg0["pelvis"]
    surface = (px_ + 0.115, py_ + 0.3)           # the black jacket over the right floating ribs
    # ---- the wake streams past and parts round him (f18 on) -----------------------
    if t >= t_roar - 2 / FPS:
        kw = seg(t, t_roar - 2 / FPS, t_rip, "out") * (1 - 0.5 * seg(t, T(fr, 40), fr.dur))
        rng = fr.srng("s511wake")
        for i in range(70):
            y0 = cy + rng.uniform(-4.5, 4.5)
            ph = (rng.random() + t * rng.uniform(1.4, 2.6)) % 1.0
            x0 = cx - 8.0 + 16.0 * ph
            pts = []
            for q in range(6):
                xx = x0 + q * 0.5
                yy = y0 + SLOPE * q * 0.5
                dxg, dyg = xx - px_, yy - (py_ + 0.4)
                dd = math.hypot(dxg, dyg)
                if dd < 1.25:
                    push = (1.25 - dd) * 1.1
                    yy += (dyg / (dd + 1e-3)) * push
                pts.append((xx, yy))
            c = mix_color((40, 16, 60), (170, 130, 210), rng.random())
            fr.line(pts, shade(c, kw), width_px=2 + 2 * rng.random())
    gojo(fr, gpose, G_X, G_Y, 1)
    # ---- Thragg (nearer the camera than Gojo's body) ---------------------------------
    shoulder_c = (surface[0] + 0.6, surface[1] - 0.42)       # where his shoulder is at contact
    lean = T_INV["lean"]
    sd = (math.sin(math.radians(lean)), math.cos(math.radians(lean)))
    pel_c = (shoulder_c[0] - sd[0] * (THRAGG.spine - 0.05), shoulder_c[1] - sd[1] * (THRAGG.spine - 0.05))
    J = None
    if t < t_rip:
        if t < t_launch:
            u = t / max(1e-6, t_launch)
            px = lerp(-15.0, pel_c[0] + 0.5, EASE["out"](u))
            py = lerp(197.6, pel_c[1] - 0.3, EASE["out"](u))
            spin = 70.0 * (1 - u)
            wind = seg(t, 0.0, T(fr, 4), "inout")
            pose = rot_pose(P(T_INV, ua_n=220, fa_n=250), spin * 0.3)
            pose = pose_at(wind, [(0.0, rot_pose(T_INV, spin)), (1.0, pose)])
            fist = None
        else:
            gap = stall_gap(t, t_launch, t_stall, 0.42, 0.01)
            press = 1 - math.exp(-6.0 * max(0.0, t - t_stall))
            px = pel_c[0] - 0.13 * press + (0.5 * (1 - clamp((t - t_launch) / (t_stall - t_launch))) if t < t_stall else 0)
            py = pel_c[1] + 0.05 * press - (0.3 * (1 - clamp((t - t_launch) / (t_stall - t_launch))) if t < t_stall else 0)
            dirx, diry = 0.82, -0.57
            fist = (surface[0] + dirx * gap, surface[1] + diry * gap)
            base = P(T_INV, neck=18 + 16 * press, ua_f=130 + 10 * press)
            pose = reach(THRAGG, base, px, py, 1, "n", fist)
        J = thragg(fr, pose, px, py, 1)
        side_l = "f"
        ex_, ey_ = J[f"el_{side_l}"]
        smoke_trail(fr, [(ex_ + 0.25 * k, ey_ + 0.18 * k) for k in range(6, -1, -1)], t, salt="s511stump", width=0.1,
                    col=(64, 56, 60), alpha=130)
        if fist is not None and t >= t_stall - 0.5 / FPS:
            C.infinity_stop(fr, J, surface, t - t_stall, side="n", r=0.75, gap=0.012)
    else:
        # f20: the wake takes him like a hand - down and east, end over end
        tr = t - t_rip
        u = clamp(tr / (T(fr, 30) - t_rip))
        px = lerp(pel_c[0] - 0.13, 5.0, EASE["in"](u) * 0.6 + 0.4 * u)
        py = lerp(pel_c[1] + 0.05, 190.0, u ** 1.3)
        pose = rot_pose(P(T_INV, ua_n=120, fa_n=60, neck=30), -tr * 900.0)
        if fn < 22:
            for k in range(1, 4):
                tt = max(0.0, tr - k * 0.02)
                uu = clamp(tt / (T(fr, 30) - t_rip))
                xx = lerp(pel_c[0] - 0.13, 5.0, EASE["in"](uu) * 0.6 + 0.4 * uu)
                yy = lerp(pel_c[1] + 0.05, 190.0, uu ** 1.3)
                draw_fighter(fr, THRAGG, rot_pose(P(T_INV, ua_n=120, fa_n=60), -tt * 900.0), xx, yy, 1,
                             opts=C.opts(fr, "thragg"), silhouette=mix_color((214, 210, 206), (90, 60, 110), 0.3 + 0.2 * k))
            fx.trail(fr, [(lerp(pel_c[0], px, q / 6), lerp(pel_c[1], py, q / 6)) for q in range(7)], width_m=1.6,
                     alpha=120)
        thragg(fr, pose, px, py, 1)
    # ---- blood droplets and grit flung at speed hang in the gap (f5-34), then drop
    rng = fr.srng("s511drops")
    t_fling = T(fr, 3)
    t_drop = T(fr, 34)
    ux, uy = 0.82, -0.57                      # from the jacket toward Thragg
    if t >= t_fling:
        for i in range(20):
            a = math.atan2(uy, ux) + rng.uniform(-1.0, 1.0)
            dist = rng.uniform(0.025, 0.2)
            hang = (surface[0] + math.cos(a) * dist, surface[1] + math.sin(a) * dist)
            start = (hang[0] + 0.6 + rng.uniform(-0.2, 0.3), hang[1] - 0.5 + rng.uniform(-0.3, 0.3))
            k = min(1.0, math.exp(-9.0 * max(0.0, t - t_fling - rng.uniform(0, 2) / FPS)))
            x = hang[0] + (start[0] - hang[0]) * k + math.sin(t * 29 + i) * 0.0015
            y = hang[1] + (start[1] - hang[1]) * k + math.cos(t * 23 + i) * 0.0015
            if t > t_drop:
                td = t - t_drop - rng.uniform(0, 3) / FPS
                if td > 0:
                    y -= 4.9 * td * td
                    x += 0.4 * td
            if i % 3 == 0:
                fr.poly(chip_poly(x, y, 0.014, i, 3, random.Random(i)), (120, 114, 110))
            else:
                fr.circle(x, y, 0.01 + 0.007 * rng.random(), fill=(130, 8, 20))


# =============================================================================
# S5-12  EWS from the south: the Purple carries on through four empty eastern
#        towers (clean bites, tops sliding) and gouges a trench down the street.
#        Gojo, tiny, upper left. Nothing west of him is touched.
# =============================================================================
HEROES = [  # four empty towers in the d=5 skyline band; the sphere enters them at f0, f14, f28, f42
    dict(x0=62.0, x1=118.0, h=292.0),
    dict(x0=194.0, x1=248.0, h=276.0),
    dict(x0=326.0, x1=380.0, h=262.0),
    dict(x0=458.0, x1=514.0, h=270.0),
]
D_BAND = 5.0
R_BAND = 35.0      # the sphere's radius in the d=5 band (the env scar is ~70 m tall)


def band_cut(x):
    """Bottom/top of the clean channel through the d=5 band (env.SCAR geometry)."""
    u = clamp((x - env.SCAR["x0"]) / (env.SCAR["x1"] - env.SCAR["x0"]))
    lo = env.SCAR["y0"] + 30 * (1 - u)
    return lo, lo + (env.SCAR["y1"] - env.SCAR["y0"])


def _facade(fr, x0, x1, y0, y1, col, depth, lit=1.0, rng=None, windows=0.12):
    if y1 <= y0:
        return
    fr.poly([(x0, y0), (x1, y0), (x1, y1), (x0, y1)], col, d=depth)
    fh = fr.S(4.2, depth)
    if fh > 2.0:
        band = shade(col, 0.78)
        k = math.ceil(y0 / 4.2)
        y = k * 4.2
        step = 1 if fh > 6 else 2
        while y < y1 - 1:
            fr.line([(x0 + 0.6, y), (x1 - 0.6, y)], band, width_m=0.5 * step, d=depth)
            y += 4.2 * step
    fr.line([(x0, y0), (x0, y1)], shade(mix_color(col, PAL["rim_warm"], 0.45), lit), width_m=1.6 if depth >= 4 else 0.6,
            d=depth)


def bitten_building(fr, b, depth, li, t, t_bite, xs, lit=1.0, haze=0.0, glow_k=1.0):
    """One skyline building through the Purple's pass: intact, being bitten
    (the region behind the sphere's centre erased), then a stump with a
    glowing cut edge and a top section that collapses under gravity."""
    col = mix_color(b["col"], PAL["sky_mid"], clamp(0.35 - li * 0.08 + haze))
    col = shade(col, lit)
    x0, x1, h = b["x0"], b["x1"], b["h"]
    xc = 0.5 * (x0 + x1)
    # cut band at this building (layer coords at this depth)
    x5 = 250.0 + (xc - 250.0) * D_BAND / depth
    lo5, hi5 = band_cut(x5)
    lo = 110.0 + (lo5 - 110.0) * depth / D_BAND
    hi = 110.0 + (hi5 - 110.0) * depth / D_BAND
    xs_l = 250.0 + (xs - 250.0) * depth / D_BAND      # sphere centre in this layer's coords
    if lo >= h or t < t_bite - 3 / FPS or xs_l < x0:
        _facade(fr, x0, x1, -2, h, col, depth, lit)
        return None
    # lower part (always stands)
    _facade(fr, x0, x1, -2, lo, col, depth, lit)
    cut_x = min(x1, xs_l)
    # uncut middle ahead of the sphere
    if cut_x < x1:
        _facade(fr, cut_x, x1, lo, min(h, hi), col, depth, lit)
    top_h = h - hi
    sever = xs_l >= x1
    top = None
    if top_h > 0.5:
        if not sever:
            _facade(fr, x0, x1, hi, h, col, depth, lit)
        else:
            top = (x0, x1, hi, h, col)
    # glowing cut edge, fading (afterglow)
    glow = glow_k
    if glow > 0:
        gc = shade((190, 120, 255), 0.4 + 0.6 * glow)
        fr.line([(x0, lo), (cut_x, lo)], gc, width_m=1.4, d=depth)
        if top_h > 0.5 and not sever:
            fr.line([(x0, hi), (cut_x, hi)], gc, width_m=1.4, d=depth)
        fr.glow_line([(x0, lo), (cut_x, lo)], shade((120, 50, 200), glow), width_px=6, d=depth)
    return top


def draw_top(fr, top, depth, ang_deg, drop, slide=0.0, pivot="east"):
    x0, x1, y0, y1, col = top
    px = x1 if pivot == "east" else x0
    py = y0
    a = math.radians(ang_deg)
    ca, sa = math.cos(a), math.sin(a)

    def rot(x, y):
        dx, dy = x - px, y - py
        return (px + dx * ca - dy * sa + slide, py + dx * sa + dy * ca - drop)
    fr.poly([rot(x0, y0), rot(x1, y0), rot(x1, y1), rot(x0, y1)], col, d=depth)
    y = y0 + 4.2
    while y < y1:
        fr.line([rot(x0 + 0.6, y), rot(x1 - 0.6, y)], shade(col, 0.78), width_m=0.6, d=depth)
        y += 8.4
    fr.line([rot(x0, y0), rot(x1, y0)], (110, 70, 150), width_m=1.0, d=depth)


def district_rows(fr, lit=1.0, salt="s5dist"):
    """Rows of rooftops between the camera and the skyline for the high wides
    (open_sky only draws the far skyline band), plus the ground beneath them."""
    sky = PAL["sky_mid"]
    fr.poly([(-3000, 0.0), (3000, 0.0), (3000, -400), (-3000, -400)], shade((26, 24, 32), lit), d=0.9)
    for row, d in enumerate((2.1, 1.6, 1.25)):
        rng = random.Random(f"{salt}{row}")
        x_lo = fr.cam.x - (OUT_W / 2) / fr.cam.zoom * d - 50
        x_hi = fr.cam.x + (OUT_W / 2) / fr.cam.zoom * d + 50
        x = -800.0
        haze = clamp((d - 0.85) / 1.25) * 0.35
        while x < 1400.0:
            w = rng.uniform(14, 42)
            h = rng.uniform(14, 50)
            shd = rng.uniform(0.85, 1.25)
            nwin = []
            for _ in range(int(w * h / 200)):
                nwin.append((rng.uniform(x + 1, x + w - 2), rng.uniform(3, h - 3)))
            if x + w > x_lo and x < x_hi:
                col = shade(mix_color(shade(PAL["bldg_near"], shd), sky, haze), lit)
                fr.rect(x, -80, x + w, h, col, d=d)
                fr.line([(x, 0), (x, h)], shade(mix_color(col, PAL["rim_warm"], 0.3), lit), width_m=0.8, d=d)
                for wx, wy in nwin:
                    fr.rect(wx, wy, wx + 1.4, wy + 1.2, shade(mix_color((24, 22, 30), col, 0.4), lit), d=d)
            x += w + rng.uniform(2, 8)


def s5_12(fr):
    t = fr.t
    t_push0, t_push1 = T(fr, 50), T(fr, 62)
    up = seg(t, t_push0, t_push1, "inout")
    fr.cam = Cam(lerp(250.0, 268.0, up), lerp(110.0, 106.0, up), lerp(3.4, 3.85, up))
    t_ground = cue(fr, "impact_massive", 0, 80)
    t_end = T(fr, 104)
    st = C.state(SEQ)
    tg = C.tg(fr)
    # ---- the sphere's path through the d=5 band (layer coords) --------------------
    # it enters tower k (front edge touching its west face) at frame 14k
    t42 = T(fr, 42)
    v_band = (HEROES[1]["x0"] - HEROES[0]["x0"]) / T(fr, 14)
    x_start = HEROES[0]["x0"] - R_BAND
    xB = x_start + v_band * t42
    if t <= t42:
        xs = x_start + v_band * t
        ys = 0.5 * sum(band_cut(xs))
        Rs = R_BAND
    elif t <= t_ground:
        u = (t - t42) / (t_ground - t42)
        xs = xB + v_band * (t - t42) * (1 - 0.3 * u)
        y42 = 0.5 * sum(band_cut(xB))
        ys = y42 * (1 - u ** 1.5) + R_BAND * 0.3 * u
        Rs = R_BAND * (1 - 0.25 * u)
    else:
        u = clamp((t - t_ground) / (t_end - t_ground))
        x80 = xB + v_band * (t_ground - t42) * 0.85
        xs = x80 + 230.0 * EASE["out"](u)
        ys = R_BAND * 0.3 * (1 - u)
        Rs = R_BAND * 0.75 * (1 - u)
    x80 = xB + v_band * (t_ground - t42) * 0.85

    def bite_time(xc5):
        if xc5 <= xB:
            return (xc5 - x_start) / v_band
        return t42 + (xc5 - xB) / v_band
    # ---- plate ------------------------------------------------------------------------
    env.sky(fr)
    env.clouds(fr, tg)
    env.river(fr)
    env.skyline(fr, st, layers=(0,))
    tops = []
    for li in (1, 2):
        depth = env._LAYERS[li][0]
        x_lo = fr.cam.x - (fr.W / fr.ss / 2) / fr.cam.zoom * depth - 60
        x_hi = fr.cam.x + (fr.W / fr.ss / 2) / fr.cam.zoom * depth + 60
        sx0, sx1 = env.SCAR["x0"] * depth / D_BAND, env.SCAR["x1"] * depth / D_BAND
        rest = []
        for b in env._buildings(li):
            if b["x1"] < x_lo or b["x0"] > x_hi:
                continue
            if b["x1"] < sx0 or b["x0"] > sx1:
                rest.append(b)
                continue
            xc5 = 250.0 + (0.5 * (b["x0"] + b["x1"]) - 250.0) * D_BAND / depth
            tb = bite_time(xc5)
            top = bitten_building(fr, b, depth, li, t, tb, xs if t <= t42 else 1e9, lit=1.0, glow_k=afterglow(fr))
            if top is not None:
                tf = t - tb
                drop = 9.8 * 1.6 * tf * tf
                if drop < 160:
                    tops.append((top, depth, -6.0 * tf, drop, 0.0))
        # the rest of the layer, untouched: env draws exactly these (cull by x)
        _draw_rest(fr, li, rest, st)
    # the four hero towers (empty, dark), drawn over the band
    hero_tops = []
    for hi_, H in enumerate(HEROES):
        b = dict(x0=H["x0"], x1=H["x1"], h=H["h"], col=(24, 22, 32))
        tb = bite_time(H["x0"])
        top = bitten_building(fr, b, D_BAND, 2, t, tb, xs if t <= t42 + 0.5 else 1e9, lit=1.0, glow_k=afterglow(fr))
        if top is not None:
            hero_tops.append((hi_, top, tb))
    for (top, depth, ang, drop, sl) in tops:
        draw_top(fr, top, depth, ang, drop, sl)
    # tops: crown 1 leans east and drops (f30-70); 2 slides off its stump (f50-90);
    # 3 settles crookedly; 4 topples behind the others
    for hi_, top, tb in hero_tops:
        if hi_ == 0:
            u = seg(t, T(fr, 30), T(fr, 70), "in")
            draw_top(fr, top, D_BAND, -55.0 * u ** 1.4, 120.0 * u ** 2.2) if u < 0.999 else None
        elif hi_ == 1:
            u = seg(t, T(fr, 50), T(fr, 90), "in")
            draw_top(fr, top, D_BAND, -14.0 * u, 110.0 * u ** 2, slide=26.0 * u) if u < 0.999 else None
        elif hi_ == 2:
            u = seg(t, T(fr, 40), T(fr, 58), "out")
            draw_top(fr, top, D_BAND, -8.0 * u, 6.0 * u)
        else:
            u = seg(t, T(fr, 60), T(fr, 100), "in")
            draw_top(fr, top, D_BAND, 60.0 * u ** 1.5, 130.0 * u ** 2, pivot="west") if u < 0.999 else None
    # ---- the sphere: a violet point with a corona, receding ---------------------
    if t < t_end:
        purple_sphere(fr, xs, ys, max(4.0, Rs), t, d=D_BAND, lens=0.04, strength=0.75)
        # edge rubble wrenched into the wake behind it
        rng = fr.srng("s512rub")
        for k in range(16):
            back = rng.uniform(5, 60)
            o = rng.choice((-1, 1)) * rng.uniform(0.9, 1.3) * Rs
            ph = (rng.random() + t * 2.5) % 1.0
            bx = xs - back * (1 - ph)
            by = ys + o * (1 - 0.6 * ph)
            fr.poly(chip_poly(bx, by, 2.0, k + t * 4, 4, random.Random(k)), shade(PAL["concrete"], 0.7), d=D_BAND)
    # ---- the street trench (f80-104): a clean half-pipe, flipped cars ---------------
    if t >= t_ground:
        tt = t - t_ground
        tx1 = min(xs, x80 + 230.0)
        fr.poly([(x80, 1.0), (tx1, 1.0), (tx1, -6.0), (x80, -6.0)], (14, 10, 20), d=D_BAND)
        gk = afterglow(fr) * 0 + clamp(1 - (t - t_ground) / 3.0)
        fr.line([(x80, 1.0), (tx1, 1.0)], shade((190, 120, 255), 0.4 + 0.6 * gk), width_m=2.0, d=D_BAND)
        fr.glow_line([(x80, 1.0), (tx1, 1.0)], shade((120, 50, 200), gk), width_px=8, d=D_BAND)
        fx.dust_cloud(fr, xs, 2.0, tt, r=90.0, n=16, color=(120, 104, 100), rise=8.0, salt="s512tr", ground=True,
                      d=D_BAND, alpha=140)
        rng = fr.srng("s512cars")
        for k in range(6):
            cx0 = x80 + rng.uniform(0, 200)
            if cx0 > xs:
                continue
            p = fx.ballistic((cx0, 2.0), (rng.uniform(10, 30), rng.uniform(20, 45)), max(0.0, t - (t_ground + (cx0 - x80) / 300)),
                             g=30.0)
            fr.poly(chip_poly(p[0], max(0.0, p[1]), 3.0, k + tt * 6, 4, random.Random(k)), (70, 60, 64), d=D_BAND)
    env.skyline(fr, st, layers=(3,))
    district_rows(fr)
    env.unfinished_tower(fr, gutted=True)
    smoke_soft(fr, tg, st, alpha=110)
    # ---- dust boils up from each collapse and the trench, drifting west -------------
    for hi_, H in enumerate(HEROES):
        tcol = T(fr, (30, 50, 40, 60)[hi_]) + T(fr, 10)
        if t >= tcol:
            lo5, _ = band_cut(0.5 * (H["x0"] + H["x1"]))
            fx.dust_cloud(fr, 0.5 * (H["x0"] + H["x1"]) - (t - tcol) * 8.0, lo5 - 30.0, (t - tcol) * 0.6, r=110.0,
                          n=18, color=(124, 110, 106), rise=45.0, salt=f"s512d{hi_}", ground=False, d=D_BAND, alpha=165)
    if t >= t_ground + T(fr, 4):
        fx.dust_cloud(fr, 0.5 * (x80 + min(xs, x80 + 230.0)), 10.0, (t - t_ground - T(fr, 4)) * 0.7, r=150.0, n=20,
                      color=(118, 104, 100), rise=50.0, salt="s512d5", ground=False, d=D_BAND, alpha=160)
    env.light_shafts(fr, st)
    # the erased path in the air from his hands: faint violet afterglow, fading
    ag = clamp(1 - t / 3.0)
    if ag > 0:
        hx, hy = G_X + 0.7 * READ_SCALE_EWS, G_Y + 0.45 * READ_SCALE_EWS
        X0, Y0 = fr.P(hx, hy)
        X1, Y1 = fr.P(HEROES[0]["x0"], 0.5 * sum(band_cut(HEROES[0]["x0"])), D_BAND)
        img, dr = fr.layer()
        n = 24
        for k in range(n):
            u0, u1 = k / n, (k + 1) / n
            w = (6 + 26 * u0) * fr.ss
            dr.line([(X0 + (X1 - X0) * u0, Y0 + (Y1 - Y0) * u0), (X0 + (X1 - X0) * u1, Y0 + (Y1 - Y0) * u1)],
                    fill=(150, 90, 230, int(70 * ag)), width=int(w))
        fr.merge(img)
    # ---- Gojo, a held silhouette at the origin, arms still out --------------------
    gojo(fr, P(G_ARMS_OUT, lean=6), G_X, G_Y, 1, scale=READ_SCALE_EWS, halo=1.6)


def _draw_rest(fr, li, rest, st, lit=1.0, haze=0.0):
    """A local copy of env.skyline's per-building drawing, for a subset of one
    layer's buildings (the ones the Purple does not touch)."""
    depth = env._LAYERS[li][0]
    for b in rest:
        col = mix_color(b["col"], PAL["sky_mid"], clamp(0.35 - li * 0.08 + haze))
        col = shade(col, lit)
        x0, x1, h = b["x0"], b["x1"], b["h"]
        pts = [(x0, -2), (x0, h), (x1, h), (x1, -2)]
        if b["top"] == "step":
            pts = [(x0, -2), (x0, h * 0.86), (x0 + (x1 - x0) * 0.25, h * 0.86), (x0 + (x1 - x0) * 0.25, h),
                   (x1 - (x1 - x0) * 0.25, h), (x1 - (x1 - x0) * 0.25, h * 0.86), (x1, h * 0.86), (x1, -2)]
        elif b["top"] == "spire":
            m = (x0 + x1) / 2
            pts = [(x0, -2), (x0, h), (m - 1, h + h * 0.12), (m + 1, h + h * 0.12), (x1, h), (x1, -2)]
        elif b["top"] == "slant":
            pts = [(x0, -2), (x0, h), (x1, h * 0.9), (x1, -2)]
        fr.poly(pts, col, d=depth)
        rng = random.Random(b["seed"])
        fh = fr.S(4.2, depth)
        if fh > 2.5:
            band = shade(col, 0.78)
            mull = shade(col, 1.16)
            step = 1 if fh > 6 else 2 if fh > 3.5 else 3
            floors = int(h / 4.2)
            top_y = h * (0.86 if b["top"] == "step" else 0.9 if b["top"] == "slant" else 1.0)
            for k in range(1, floors, step):
                y = k * 4.2
                if y < top_y - 1:
                    fr.line([(x0 + 0.6, y), (x1 - 0.6, y)], band, width_m=0.5 * step, d=depth)
            cw = 3.0 if fr.S(3.0, depth) > 5 else 6.0
            nc = int((x1 - x0) / cw)
            for k in range(1, nc):
                xx = x0 + k * (x1 - x0) / nc
                fr.line([(xx, 0), (xx, top_y - 0.8)], mull, width_m=0.25 * (cw / 3), d=depth)
            lit_city = depth >= 5.0 and x1 < env.LIT_CITY_X * depth / 8.0
            nlit = int(floors * (x1 - x0) / 10 * b["wd"] * (0.9 if lit_city else 0.12))
            for _ in range(nlit):
                wx = x0 + rng.randint(0, max(0, nc - 1)) * (x1 - x0) / max(1, nc)
                wy = rng.randint(2, max(2, floors - 2)) * 4.2
                if wy > top_y - 4:
                    continue
                c = mix_color(PAL["window_lit"], col, rng.uniform(0.0, 0.25) if lit_city else rng.uniform(0.25, 0.7))
                fr.rect(wx + 0.3, wy - 3.6, wx + (x1 - x0) / max(1, nc) - 0.3, wy - 0.6, shade(c, lit), d=depth)
        fr.line([(x0, 0), (x0, h * 0.86 if b["top"] == "step" else h)],
                shade(mix_color(col, PAL["rim_warm"], 0.35), lit), width_m=0.6, d=depth)


# =============================================================================
# S5-13  MWS: through the dust, Thragg rises one-armed, flayed and bleeding,
#        listing in the air. He spits blood, lifts his eyes to Gojo; the
#        remaining hand closes. No longer amused.
# =============================================================================

def sheared_stumps(fr, t, glow_k, lit=1.0):
    """The channel's sheared towers standing in depth behind him: clean cut
    tops with the fading violet afterglow on the edges."""
    for (x0, x1, top, d) in ((-60.0, 10.0, 104.0, 8.0), (60.0, 130.0, 96.0, 8.5), (180.0, 250.0, 88.0, 9.0),
                             (300.0, 380.0, 80.0, 9.5)):
        col = shade(mix_color((24, 22, 32), PAL["sky_mid"], 0.2), lit)
        _facade(fr, x0, x1, -2.0, top, col, d, lit)
        fr.line([(x0, top), (x1, top - 3.0)], shade((190, 120, 255), 0.3 + 0.7 * glow_k), width_m=2.0, d=d)
        if glow_k > 0.05:
            fr.glow_line([(x0, top), (x1, top - 3.0)], shade((120, 50, 200), glow_k), width_px=10, d=d)


def plume(fr, t, k, cy, salt="plume", violet=0.5, d=1.6, x0=40.0, x1=120.0, top=None):
    """Purple's dust and smoke plume churning across frame, lit violet from
    within by the fading afterglow, drifting west."""
    if k <= 0.01:
        return
    rng = fr.srng(salt)
    img, dr = fr.layer()
    for i in range(46):
        bx = rng.uniform(x0, x1)
        by = rng.uniform(cy - 14.0, (top if top is not None else cy) + rng.uniform(-2, 2))
        x = bx - t * rng.uniform(1.5, 3.0)
        y = by + math.sin(t * 0.7 + i) * 0.4
        X, Y = fr.P(x, y, d)
        R = fr.S(rng.uniform(2.0, 5.5), d)
        c = mix_color((112, 98, 96), (120, 70, 160), violet * rng.random() * 0.8)
        dr.ellipse([X - R * 1.3, Y - R, X + R * 1.3, Y + R], fill=shade(c, rng.uniform(0.7, 1.05)) + (int(200 * k * rng.uniform(0.6, 1.0)),))
    fr.merge(img)


def s5_13(fr):
    t = fr.t
    t2 = on2(fr)
    t_rise0, t_rise1 = T(fr, 20), T(fr, 44)
    t_spit = cue(fr, "blood_spit", 0, 48)
    zoom = zkf(t, [(0.0, 76.0), (t_rise0, 76.0), (t_rise1, 112.0, "inout"), (fr.dur, 134.0, "inout")])
    cxm = kf(t, [(0.0, 75.0), (t_rise1, 70.0, "inout")])
    cym = kf(t, [(0.0, 131.0), (T(fr, 26), 130.5), (t_rise1, 140.4, "inout")])
    fr.cam = Cam(cxm, cym, zoom)
    st = C.state(SEQ, "purple_scar")
    tg = C.tg(fr)
    glow_k = afterglow(fr)

    def back():
        env.sky(fr)
        env.clouds(fr, tg)
        env.skyline(fr, st, layers=(0, 1, 2), haze=0.25)
        smoke_soft(fr, tg, st, alpha=120)
    sky_plate_k = Cam(cxm, cym, 26.0)
    shot_cam = fr.cam
    fr.cam = sky_plate_k
    soft_draw(fr, back, radius=2.5)
    soft_draw(fr, lambda: sheared_stumps(fr, t, glow_k), radius=2.0)
    fr.cam = shot_cam
    env.light_shafts(fr, st, strength=0.7)
    # the plume behind and around him; heavy at first, thinning as he rises out
    k_dust = 1.0 - 0.55 * seg(t, t_rise0, t_rise1 + T(fr, 10))
    plume(fr, t + tg * 0.1, k_dust, 128.0, salt="s513back", violet=0.6 * glow_k + 0.15, d=1.5, x0=40, x1=120, top=134.0)
    # ---- Thragg rises out of the plume, listing; two sharp corrections ----------
    path = [(0.0, (85.0, 112.0)), (t_rise0, (85.0, 118.0)), (T(fr, 32), (77.0, 131.0)), (t_rise1, (70.0, 140.0)),
            (fr.dur, (70.0, 140.0))]
    tx, ty = catmull(path, t2)
    settle = seg(t2, t_rise1, T(fr, 50), "out")
    ty -= 0.25 * (1 - settle) * math.sin(clamp((t2 - t_rise1) / max(1e-6, T(fr, 6))) * math.pi)

    def list_angle(tt):
        a = 17.0
        for tc in (T(fr, 30), T(fr, 38)):
            if tt >= tc:
                a = lerp(17.0, 6.0, seg(tt, tc, tc + T(fr, 2), "snap"))
                a = lerp(a, 17.0, seg(tt, tc + T(fr, 2), tc + T(fr, 8), "inout"))
        a = lerp(a, 13.0, seg(tt, t_rise1, fr.dur))
        return a
    ang = list_angle(t2 if fr.f / _k(fr.shot) < 28 else t)
    breath = math.sin(t2 * math.tau / T(fr, 24))
    look = seg(t2, T(fr, 50), T(fr, 58), "inout")
    fist = seg(t2, T(fr, 60), T(fr, 70), "inout")
    base = P(T_STILL, lean=4 + 1.5 * breath, neck=6 - 34 * look, ua_n=34, fa_n=40, ua_f=14, fa_f=30 + 40 * fist,
             hand_f="fist" if fist > 0.5 else "open", th_n=10, sh_n=-24, th_f=-8, sh_f=-34)
    pose = rot_pose(base, -ang)
    J = thragg(fr, pose, tx, ty + 0.02 * breath, -1)
    # the cauterised stump: a thin thread of smoke; blood down his neck and flank
    ex_, ey_ = J["el_n"]
    smoke_trail(fr, [(ex_ + 0.2 * k - 0.05 * k * k, ey_ + 0.25 * k) for k in range(7, -1, -1)], t, salt="s513stump",
                width=0.06, col=(80, 74, 80), alpha=130)
    fr.line([head_at(J, THRAGG, -0.2, -0.05), head_at(J, THRAGG, -0.25, -0.9), (J["chest"][0] + 0.06, J["chest"][1] - 0.2)],
            (130, 10, 20), width_m=0.014)
    for q in range(3):
        drip = (t * 1.3 + q * 0.33) % 1.0
        fr.circle(J["pelvis"][0] - 0.05 + 0.04 * q, J["pelvis"][1] - 0.1 - drip * 0.9, 0.012, fill=(120, 8, 18))
    # f48: he spits blood
    if t >= t_spit:
        mx, my = head_at(J, THRAGG, 0.85, -0.6)
        fx.blood(fr, mx, my, t - t_spit, n=8, dirx=-1.0, salt="s513spit")
    # foreground wisps of the plume
    plume(fr, t + tg * 0.1, 0.55 * k_dust, cym - 4.0, salt="s513front", violet=0.4 * glow_k, d=0.8, x0=cxm - 14,
          x1=cxm + 14, top=cym - 3.0)


# =============================================================================
# S5-14  MCU Gojo: hands lowered, deliberate breaths, two fingers to the
#        temple - a faint RCT shimmer - and the eyes clear (the red stays).
# =============================================================================

def two_finger_hand(fr, L, x, y, ang=-1.2, s=1.0):
    """Gojo's right hand, index and middle fingers extended together (insert coords)."""
    skin, sh = GOJO.skin, shade(GOJO.skin, 0.8)
    ca, sa = math.cos(ang), math.sin(ang)

    def p(u, v):
        return (x + (u * ca - v * sa) * s, y + (u * sa + v * ca) * s)
    L.poly([p(-0.12, -0.1), p(0.12, -0.1), p(0.16, 0.14), p(-0.14, 0.16)], skin)
    L.poly([p(-0.06, -0.12), p(0.03, -0.12), p(0.03, -0.42), p(-0.06, -0.41)], skin)
    L.poly([p(0.04, -0.12), p(0.12, -0.11), p(0.12, -0.38), p(0.04, -0.4)], shade(skin, 0.95))
    L.line([p(0.035, -0.12), p(0.035, -0.4)], sh, 0.006)
    L.ell(*p(0.15, 0.04), 0.05 * s, 0.06 * s, fill=sh)
    L.poly([p(-0.14, 0.16), p(0.16, 0.14), p(0.2, 0.5), p(-0.2, 0.5)], GOJO.suit)


def s5_14(fr):
    t = fr.t
    t2 = on2(fr)
    t_rct = cue(fr, "rct_heal", 0, 56)
    fr.cam = Cam(0.0, 0.0, 1080.0)

    def back():
        plate_bg(fr, (26, 24, 38), (72, 54, 62), smoke=True, salt="s514", t=C.tg(fr), warm_side=-1)
        img, dr = fr.layer()
        rng = fr.srng("s514dust")
        for i in range(18):
            u = (rng.random() - C.tg(fr) * 0.006 * rng.uniform(0.5, 1.5)) % 1.3 - 0.15
            v = rng.uniform(0.3, 1.0)
            r = rng.uniform(0.06, 0.16) * fr.H
            dr.ellipse([u * fr.W - r * 1.4, v * fr.H - r, u * fr.W + r * 1.4, v * fr.H + r],
                       fill=(104, 92, 92, int(rng.uniform(40, 90))))
        fr.merge(img)
    soft_draw(fr, back, radius=4.0)
    # breath: 24 frames in, 24 out (f20-50 twice); the push-in from f60
    bph = clamp((t2 - T(fr, 20)) / T(fr, 48)) if t2 >= T(fr, 20) else 0.0
    breath = math.sin(bph * math.tau * 1.0 - math.pi / 2) * 0.5 + 0.5 if t2 < T(fr, 68) else 0.0
    s = 0.86 * (1 + 0.05 * seg(t, T(fr, 60), fr.dur, "inout"))
    cu, cv = 0.46, 0.43 - 0.012 * breath
    L = inserts.Local(fr, cu, cv, s, 0.0, 1)
    # shoulders and the arms coming down (f0-20)
    low = seg(t2, 0.0, T(fr, 20), "inout")
    L.poly([(-1.25, 1.45), (-1.1, 0.95 - 0.02 * breath), (-0.45, 0.72 - 0.02 * breath), (0.42, 0.7 - 0.02 * breath),
            (1.05, 0.9 - 0.02 * breath), (1.25, 1.45)], GOJO.suit)
    for side in (-1, 1):
        sx, sy = (0.95, 0.95) if side > 0 else (-1.0, 1.0)
        ex, ey = sx + 0.5 * (1 - low) + 0.1, sy + 0.1 + 0.5 * low
        L.line([(sx, sy), (ex, ey)], GOJO.suit, 0.2)
    # jacket torn and bloodstained at the LEFT shoulder (far side, screen-right)
    L.poly([(0.55, 0.78), (0.82, 0.8), (0.95, 0.98), (0.78, 1.12), (0.52, 1.0)], (70, 18, 24))
    L.poly([(0.6, 0.84), (0.78, 0.86), (0.86, 0.98), (0.72, 1.04)], (120, 26, 32))
    inserts.gojo_face(fr, cu, cv, s, expr="serious", eyes="open", flip=1, t=t, eye_glow=0.35, hair_wind=0.03)
    neck_blindfold(L)
    # eyes: strained glaze, then RCT; they clear (focus), the red veins remain
    clear = seg(t2, T(fr, 72), T(fr, 84), "out")
    gx = lerp(0.1, 0.0, clear) + 0.55 * seg(t2, T(fr, 84), T(fr, 92), "inout")
    gy = 0.05 + 0.55 * seg(t2, T(fr, 84), T(fr, 92), "inout")
    gojo_eyes(fr, cu, cv, s, gx=gx, gy=gy, flip=1, glow=0.35 + 0.15 * clear, veins=1.0, pupil=clear,
              iris=1.06 - 0.08 * clear, lid=0.25 * (1 - clear), salt="s508v")
    if clear < 1:
        # the glaze of strain: a dull film over the eyes
        img, dr = fr.layer()
        for ex, sz in ((0.3, 1.0), (-0.12, 0.85)):
            X, Y = L.p(ex, -0.15)
            rx, ry = 0.12 * sz * 0.5 * fr.H * s, 0.07 * sz * 0.5 * fr.H * s
            dr.ellipse([X - rx, Y - ry, X + rx, Y + ry], fill=(200, 200, 210, int(70 * (1 - clear))))
        fr.merge(img)
    # f50-56: two fingers to the right temple; held through the shimmer; lowered f84
    up = seg(t2, T(fr, 50), T(fr, 56), "inout") * (1 - seg(t2, T(fr, 84), T(fr, 92), "inout"))
    if up > 0.01:
        tx, ty = -0.5, -0.3
        hx, hy = lerp(-0.6, tx, up), lerp(1.6, ty + 0.45, up)
        two_finger_hand(fr, L, hx, hy, ang=-0.25, s=1.0)
    # RCT: a faint warm-white shimmer under the skin at the temple, 16 frames
    if t_rct <= t < t_rct + T(fr, 18):
        X, Y = L.p(-0.44, -0.3)
        wx, wy = (X / fr.ss - OUT_W / 2) / 1080.0, -(Y / fr.ss - OUT_H / 2) / 1080.0
        u = (t - t_rct) / T(fr, 16)
        fx.rct_heal(fr, wx, wy, -0.2 + 1.2 * u, r=0.07)


SHOTS = {
    "S5-01": s5_01, "S5-02": s5_02, "S5-03": s5_03, "S5-04": s5_04, "S5-05": s5_05, "S5-06": s5_06,
    "S5-07": s5_07, "S5-08": s5_08, "S5-09": s5_09, "S5-10": s5_10, "S5-11": s5_11, "S5-12": s5_12,
    "S5-13": s5_13, "S5-14": s5_14,
}
