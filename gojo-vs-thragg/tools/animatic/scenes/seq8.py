"""Sequence 8 - THE VERDICT (S8-01 .. S8-04). Four real-time shots, 240 frames.

  S8-01  overhead plan, crane-down 26 m -> 16 m: the dust veil strips away west,
         nearest layer first; Thragg on his back under the toppled mast, chest
         smoking; Gojo on the crater's western shoulder, his long faint shadow
         reaching Thragg's boots.
  S8-02  ground-level CU on the crater floor: one agonal breath (rise f12-26,
         fall f26-34), then stillness; an ash fleck lands at f44 unanswered.
  S8-03  the push-in (MS -> MCU): RCT seals the stump (f4-20), the nosebleed
         stops and is wiped (f24-30), the blindfold goes back up (f36-50),
         the hair springs (f50-56), a tired smile, "Told you." (f68).
  S8-04  locked worm's-eye wide: he turns his back on the crater toward the lit
         city, hand into pocket, weight on one leg. The film's last frame.

Geography (shot list staging): the camera faces north (S8-01 looks straight
down with north at frame top), west = screen-left. Gojo x=-6 on the crater's
western shoulder; Thragg x=-2 on his back on the pit floor (boots x=-3, head
x=-1, ~1 m below grade); the toppled mast lies from its torn base x=-7.6 to its
sheared top x=-1.4, ~1.5 m north of the fighters' line.

Rig sides: Gojo facing east shows his RIGHT side (his left arm, lost at the
elbow, is the far limb); facing west (S8-04 end) shows his LEFT side, so the
empty sleeve is on the camera side.

Timing: beats are authored against the nominal lengths in NOM and scaled by
fr.n / NOM (T()), and key moments are read from the shot's own sfx cues
(cue()), so every shot still works if its length changes by a few frames.

Local workarounds (shared modules untouched):
  * env has no plan view: S8-01 projects its own ground plate through the
    engine's depth (d = (camera height - h) / camera height), so tall things
    lean outward from frame centre like a real overhead lens.
  * env.city_street cannot make the S8-04 worm's-eye (the horizon is fixed at
    frame centre and the skyline layers / final-crater smoke column are scaled
    for wides): S8-04 paints its own backdrop and ground and keeps env.sky
    colours, env.toppled_mast and env.light_shafts.
  * rig front view collapses Gojo's hair and blindfold to a line (the head
    polygons only use the facing vector): head_front() redraws them.
  * rig has no 'stump_sealed' look (the stump is always drawn raw):
    sealed_cap() paints the healed end over it.
  * rig front view puts 'jacket_torn_shoulder' on his RIGHT shoulder (it uses
    left_side(facing) without the view): S8-04 paints it on the left there.
  * inserts has only an upright 3/4 Thragg portrait; laid on its back it reads
    as a face turned to the lens. S8-02 draws thragg_profile(), a profile
    variant in inserts.Local with the same design and palette.

Deliberate deviations from the shot list's animatic hints:
  * S8-01 Gojo's top-down footprint is drawn 1.25x (heights true) so a 0.5 m
    wide man reads from 16-26 m up; Thragg is drawn true size.
  * S8-02 follows the staging prose (frame ~1.6 m wide, cavity centre-left,
    head right): zoom 1200 centred x=-1.52 rather than the note's zoom 700 at
    x=-1.9, which would put the cavity right of centre.
  * S8-04's 10-degree tilt-up is a constant screen offset (Cam.shake used as a
    pitch, never animated) so the horizon sits in the lower third.
"""
from __future__ import annotations

import math
import random
from dataclasses import replace

from PIL import Image, ImageChops, ImageDraw, ImageFilter

import scenes.common as C
from engine import Cam, kf, clamp, EASE, lerp, mix_color, shade, smoothstep, PAL, FPS, OUT_W, OUT_H
import env
import fx
import inserts
import rig
from rig import GOJO, THRAGG, P, pose_at, draw_fighter, hand_pos

SEQ = 8

NOM = {"S8-01": 44, "S8-02": 52, "S8-03": 96, "S8-04": 48}

# world anchors (shot list staging)
GOJO_X = -6.0
THRAGG_X = -2.0
MAST_X0, MAST_X1 = -7.6, -1.4
CRATER_C, CRATER_R = -4.0, 8.0          # the whole crater (apron + pit)
PIT_C, PIT_R = -2.1, 3.95               # the deep pit Thragg lies in (Gojo stands on its western lip)


# =============================================================================
# timing helpers
# =============================================================================

def T(fr, f):
    """Nominal frame f of this shot -> seconds (scaled to the shot's real length)."""
    return f * fr.n / NOM.get(fr.shot["id"], fr.n) / FPS


def cue(fr, name, nth=0, default=0):
    """Time (s) of the nth sfx cue `name` of this shot (key moments live there)."""
    hits = sorted(s["at"] for s in (fr.shot.get("sfx") or []) if s.get("cue") == name)
    if len(hits) > nth:
        return hits[nth] / FPS
    return T(fr, default)


def seg(t, t0, t1, ease="inout"):
    if t1 <= t0:
        return 1.0 if t >= t1 else 0.0
    return EASE[ease](clamp((t - t0) / (t1 - t0)))


def on2(fr):
    """Shot time held on twos (character animation)."""
    return (fr.f - fr.f % 2) / FPS


def gzoom(t, t0, t1, z0, z1, ease="linear"):
    """Zoom interpolated geometrically (a constant-rate push reads as constant)."""
    u = seg(t, t0, t1, ease)
    return math.exp(math.log(z0) + (math.log(z1) - math.log(z0)) * u)


def injuries(fr, who, changes=None):
    """Injury set from the ledger: the previous shot's continuity_out, with each
    tag this shot adds / heals switching at changes[tag] seconds (default: the
    last frame, so the cut always matches the next shot)."""
    sid = fr.shot["id"]
    a = set(C.state_in(sid, who).get("injuries") or [])
    b = set(C.state_out(sid, who).get("injuries") or [])
    changes = changes or {}
    last = fr.f >= fr.n - 1
    out = set(a & b)
    for tag in b - a:
        if last or fr.t >= changes.get(tag, 1e9):
            out.add(tag)
    for tag in a - b:
        if not (last or fr.t >= changes.get(tag, 1e9)):
            out.add(tag)
    return out


# =============================================================================
# compositing helpers
# =============================================================================

def capture(fr, fn):
    """Run fn() drawing into a fresh RGBA layer instead of the frame."""
    base, base_draw = fr.img, fr.draw
    layer = Image.new("RGBA", (fr.W, fr.H), (0, 0, 0, 0))
    fr.img, fr.draw = layer, ImageDraw.Draw(layer)
    try:
        res = fn()
    finally:
        fr.img, fr.draw = base, base_draw
    return layer, res


def paste(fr, layer, blur=0.0, alpha=1.0, offset=(0, 0)):
    if blur > 0.25:
        layer = layer.filter(ImageFilter.GaussianBlur(blur * fr.ss))
    if alpha < 0.999:
        layer.putalpha(layer.getchannel("A").point(lambda v, k=alpha: int(v * k)))
    fr.img.paste(layer, (int(offset[0] * fr.ss), int(offset[1] * fr.ss)), layer)


def blur_frame(fr, radius):
    if radius > 0.25:
        fr.img = fr.img.filter(ImageFilter.GaussianBlur(radius * fr.ss))
        fr.draw = ImageDraw.Draw(fr.img)


def rim_silhouette(fr, layer, rim, off=(-3.0, -2.0), alpha=1.0):
    """Paste a figure layer with a warm rim: the figure's own shape in `rim`
    colour, offset toward the light, under the figure itself."""
    a = layer.getchannel("A")
    if alpha < 0.999:
        a = a.point(lambda v, k=alpha: int(v * k))
    ra = ImageChops.offset(a, int(off[0] * fr.ss), int(off[1] * fr.ss))
    ra = ImageChops.subtract(ra, a)
    fr.img.paste(Image.new("RGB", a.size, rim), (0, 0), ra)
    fr.img.paste(layer, (0, 0), layer)


class Soft:
    """Low-resolution RGBA accumulator for big soft shapes (dust veils, light
    pools, haze). Each add() draws an alpha mask with fn(draw, w, h) (0..1
    screen units scaled by w, h), blurs it and composites it in `color`."""

    def __init__(self, fr, div=8):
        self.fr = fr
        self.w, self.h = max(8, fr.W // div), max(8, fr.H // div)
        self.acc = Image.new("RGBA", (self.w, self.h), (0, 0, 0, 0))

    def add(self, fn, color, blur=0.02):
        m = Image.new("L", (self.w, self.h), 0)
        fn(ImageDraw.Draw(m), self.w, self.h)
        if blur > 0:
            m = m.filter(ImageFilter.GaussianBlur(max(0.5, blur * self.h)))
        lay = Image.new("RGBA", (self.w, self.h), tuple(color[:3]) + (0,))
        lay.putalpha(m)
        self.acc = Image.alpha_composite(self.acc, lay)

    def commit(self):
        big = self.acc.resize((self.fr.W, self.fr.H), Image.BILINEAR)
        self.fr.img.paste(big.convert("RGB"), (0, 0), big.getchannel("A"))


def px2u(fr, p):
    return (p[0] / fr.W, p[1] / fr.H)


def mul(c, k):
    """Multiplicative brightness (engine.shade(k > 1) blends toward white)."""
    return tuple(int(clamp(x * k, 0, 255)) for x in c[:3])


def field(fr, fn, color, box=(0.0, 0.0, 1.0, 1.0), res=(192, 108)):
    """Smooth screen-space light/haze: fn(u, v) -> opacity 0..1 evaluated on a
    coarse grid over box (u0, v0, u1, v1), upscaled bilinearly and composited
    in `color`. For gradients that must not band."""
    u0, v0, u1, v1 = box
    w, h = res
    m = Image.new("L", (w, h))
    px = m.load()
    for j in range(h):
        v = v0 + (v1 - v0) * (j + 0.5) / h
        for i in range(w):
            u = u0 + (u1 - u0) * (i + 0.5) / w
            px[i, j] = int(255 * clamp(fn(u, v)))
    X0, Y0, X1, Y1 = int(u0 * fr.W), int(v0 * fr.H), int(u1 * fr.W), int(v1 * fr.H)
    if X1 - X0 < 1 or Y1 - Y0 < 1:
        return
    m = m.resize((X1 - X0, Y1 - Y0), Image.BILINEAR)
    fr.img.paste(Image.new("RGB", m.size, tuple(color[:3])), (X0, Y0), m)


def vgrad(fr, stops, v0=0.0, v1=1.0):
    """Smooth vertical gradient (no banding) between screen v0..v1.
    stops: [(v, colour), ...] in screen v, sorted."""
    n = 256
    col = Image.new("RGB", (1, n))
    px = col.load()
    for i in range(n):
        v = v0 + (v1 - v0) * i / (n - 1)
        c = stops[0][1]
        for k in range(1, len(stops)):
            if v <= stops[k][0]:
                a, b = stops[k - 1], stops[k]
                c = mix_color(a[1], b[1], clamp((v - a[0]) / max(1e-6, b[0] - a[0])))
                break
            c = stops[k][1]
        px[0, i] = tuple(c)
    Y0, Y1 = int(v0 * fr.H), int(v1 * fr.H)
    fr.img.paste(col.resize((fr.W, max(1, Y1 - Y0)), Image.BILINEAR), (0, Y0))


# =============================================================================
# S8-01  overhead plan
# =============================================================================
H_START, H_END = 26.0, 16.0
PLAN_ZOOM = 72.0                  # px/m on the ground at 26 m (shot list: zoom 72 -> 117)
PLAN_C = (-3.0, 0.15)             # frame centre over the crater (x, north)
BURST = (-4.6, 0.0)               # origin of the radial starburst: just west of the crater's centre
MAST_PLAN = ((-7.6, 1.55, 0.18), (-1.4, 1.45, 0.02))   # (x, north, height) base -> sheared top
TH_BODY_H = -0.80                 # top surface of Thragg's body (floor ~ -1.05)
CHEST = (-1.62, 0.02)


class Plan:
    """Straight-down projection with north at frame top. A point at height h
    is d = (Hc - h) / Hc as far from the lens as the ground, so the engine's
    own depth projection gives true overhead perspective."""

    def __init__(self, fr, Hc):
        self.fr, self.Hc = fr, Hc
        fr.cam = Cam(x=PLAN_C[0], y=PLAN_C[1], zoom=PLAN_ZOOM * H_START / Hc)

    def d(self, h):
        return max(0.06, (self.Hc - h) / self.Hc)

    def P(self, x, z, h=0.0):
        return self.fr.P(x, z, self.d(h))

    def poly(self, pts, fill, h=0.0):
        self.fr.poly(pts, fill, d=self.d(h))

    def ell(self, x, z, rx, rz, fill, h=0.0):
        self.fr.ellipse(x, z, rx, rz, fill=fill, d=self.d(h))

    def circle(self, x, z, r, fill, h=0.0):
        self.fr.circle(x, z, r, fill=fill, d=self.d(h))

    def line(self, pts, fill, w, h=0.0):
        self.fr.line(pts, fill, width_m=w, d=self.d(h))

    def seg3(self, a, b, w, fill):
        """Segment between two 3D points (x, z, h) - e.g. an arm hanging down."""
        pa, pb = self.P(*a), self.P(*b)
        wd = self.fr.S(w, self.d(0.5 * (a[2] + b[2])))
        self.fr.draw.line([pa, pb], fill=fill, width=max(1, int(wd)))
        r = wd / 2
        for p in (pa, pb):
            self.fr.draw.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r], fill=fill)


def _harm(seed, n=4, amp=0.06):
    rng = random.Random(seed)
    return [(k, amp * rng.uniform(0.3, 1.0) / k ** 0.6, rng.uniform(0, math.tau)) for k in range(2, 2 + n)]


def _noise(a, harm):
    return sum(A * math.sin(k * a + ph) for (k, A, ph) in harm)


def _rot_rect(cx, cz, L, W, ang):
    c, s = math.cos(ang), math.sin(ang)
    out = []
    for (u, v) in ((-L / 2, -W / 2), (L / 2, -W / 2), (L / 2, W / 2), (-L / 2, W / 2)):
        out.append((cx + u * c - v * s, cz + u * s + v * c))
    return out


def plan_ground(pl, fr, lit=1.0):
    """The ground plate seen from above: road, markings, the final crater with
    its western apron (shoulder) and deep pit, the internal Red's radial
    starburst, split slabs, flattened lamp posts, cars flung outward."""
    asph = shade((52, 49, 56), lit)
    fr.draw.rectangle([0, 0, fr.W, fr.H], fill=asph)
    # wide, faint tonal variation of the asphalt (patches)
    rng = random.Random("s8plan_patch")
    for i in range(26):
        x, z = rng.uniform(-30, 20), rng.uniform(-14, 14)
        pl.ell(x, z, rng.uniform(1.5, 5.0), rng.uniform(1.0, 3.0), shade(asph, rng.uniform(0.9, 1.08)))
    # sidewalks beyond the curbs (only at the very top/bottom of the widest frame)
    for sgn in (1, -1):
        pl.poly([(-60, sgn * 9.2), (60, sgn * 9.2), (60, sgn * 16), (-60, sgn * 16)], shade((74, 72, 78), lit))
        pl.line([(-60, sgn * 9.2), (60, sgn * 9.2)], shade((96, 94, 98), lit), 0.25)
    # lane markings: dashed lanes and the centre line
    x = -42.0
    while x < 30:
        for zz in (-3.6, 3.6):
            pl.poly([(x, zz - 0.07), (x + 3, zz - 0.07), (x + 3, zz + 0.07), (x, zz + 0.07)], shade((150, 140, 112), lit * 0.75))
        x += 6
    for zz in (-0.12, 0.12):
        pl.line([(-42, zz), (30, zz)], shade((160, 140, 70), lit * 0.6), 0.09)
    # crosswalks (zebra across the E-W road) either side of the intersection
    for cx in (-9.0, 9.0):
        for k in range(15):
            zz = -8.4 + k * 1.2
            pl.poly([(cx - 2.5, zz - 0.25), (cx + 2.5, zz - 0.25), (cx + 2.5, zz + 0.25), (cx - 2.5, zz + 0.25)],
                    shade((172, 166, 150), lit * 0.68))
    # pale ejecta rays of pulverised asphalt (the starburst read from 20 m up)
    rng = random.Random("s8plan_rays")
    ray = Soft(fr, div=4)

    def rays(dr, w, h):
        for i in range(30):
            a = i * math.tau / 30 + rng.uniform(-0.05, 0.05)
            L = rng.uniform(12, 26)
            wd = rng.uniform(0.05, 0.12)
            p0 = px2u(fr, pl.P(BURST[0] + math.cos(a) * 6.5, BURST[1] + math.sin(a) * 6.5))
            p1 = px2u(fr, pl.P(BURST[0] + math.cos(a - wd) * L, BURST[1] + math.sin(a - wd) * L))
            p2 = px2u(fr, pl.P(BURST[0] + math.cos(a + wd) * L, BURST[1] + math.sin(a + wd) * L))
            dr.polygon([(p0[0] * w, p0[1] * h), (p1[0] * w, p1[1] * h), (p2[0] * w, p2[1] * h)],
                       fill=int(rng.uniform(30, 60)))
    ray.add(rays, shade((186, 176, 164), lit), blur=0.006)
    ray.commit()
    # apron (the broad shattered shoulder) with a lifted lip
    harm = _harm("s8apron")
    lip, apron = [], []
    for i in range(96):
        a = i * math.tau / 96
        r = CRATER_R * (1 + _noise(a, harm))
        lip.append((CRATER_C + math.cos(a) * r * 1.07, math.sin(a) * r * 1.07))
        apron.append((CRATER_C + math.cos(a) * r, math.sin(a) * r))
    pl.poly(lip, shade((70, 66, 70), lit), h=0.15)
    pl.poly(apron, shade((44, 41, 46), lit), h=-0.1)
    # the starburst: radial splits in the asphalt from just west of the centre
    rng = random.Random("s8plan_burst")
    dark = shade((16, 14, 18), lit)
    for i in range(30):
        a = i * math.tau / 30 + rng.uniform(-0.07, 0.07)
        r0, r1 = rng.uniform(2.0, 5.0), rng.uniform(10, 21)
        pts = []
        for j in range(7):
            r = r0 + (r1 - r0) * j / 6
            aa = a + rng.uniform(-0.035, 0.035)
            pts.append((BURST[0] + math.cos(aa) * r, BURST[1] + math.sin(aa) * r))
        pl.line(pts, dark, rng.uniform(0.03, 0.075))
        if rng.random() < 0.5:     # a forked branch
            j = rng.randint(2, 4)
            bx, bz = pts[j]
            ab = a + rng.choice((-1, 1)) * rng.uniform(0.25, 0.5)
            L = rng.uniform(1.5, 4.0)
            pl.line([(bx, bz), (bx + math.cos(ab) * L, bz + math.sin(ab) * L)], dark, 0.03)
    # split slabs heaved up around the rim; their inner edges catch the west light when they face it
    rng = random.Random("s8plan_slabs")
    a = 0.0
    while a < math.tau:
        a += rng.uniform(0.07, 0.24)
        if rng.random() < 0.25:
            continue
        r0 = CRATER_R * (1 + _noise(a, harm)) * rng.uniform(0.84, 1.02)
        r1 = r0 + rng.uniform(0.6, 2.2)
        da = rng.uniform(0.025, 0.07)
        q = [(CRATER_C + math.cos(a - da) * r0, math.sin(a - da) * r0),
             (CRATER_C + math.cos(a + da * 1.1) * r0 * 1.01, math.sin(a + da * 1.1) * r0 * 1.01),
             (CRATER_C + math.cos(a + da) * r1, math.sin(a + da) * r1),
             (CRATER_C + math.cos(a - da * 0.8) * r1, math.sin(a - da * 0.8) * r1)]
        pl.poly(q, shade((56, 53, 60), lit * rng.uniform(0.85, 1.1)), h=0.2)
        lit_edge = clamp(math.cos(a) * 0.9 + 0.1)
        ec = mix_color(shade((34, 32, 38), lit), shade((150, 112, 84), lit), lit_edge * 0.75)
        pl.line([q[0], q[1]], ec, 0.08, h=0.3)
    # the deep pit, centred east of the apron: rings sloping to the floor, the
    # east inner slope (facing the low west light) lit, the west slope in shade
    pharm = _harm("s8pit", amp=0.05)
    NR, NS = 10, 44
    rings = []
    for j in range(NR + 1):
        q = 1 - j / NR
        cx = PIT_C + 0.15 * (1 - q)
        R = PIT_R * max(0.04, q ** 0.85)
        h = -1.05 * (1 - q ** 1.7)
        rings.append((q, cx, R, h))
    for j in range(NR):
        q0, cx0, R0, h0 = rings[j]
        q1, cx1, R1, h1 = rings[j + 1]
        base = mix_color(shade((19, 16, 20), lit), shade((44, 40, 46), lit), q0 ** 0.9)
        for k in range(NS):
            a0, a1 = k * math.tau / NS, (k + 1) * math.tau / NS
            am = 0.5 * (a0 + a1)
            kk = 1 + 0.38 * math.cos(am) * (0.25 + 0.75 * q0)
            col = mul(base, max(0.4, kk))
            r00, r01 = R0 * (1 + _noise(a0, pharm)), R0 * (1 + _noise(a1, pharm))
            r10, r11 = R1 * (1 + _noise(a0, pharm)), R1 * (1 + _noise(a1, pharm))
            pts = [pl.P(cx0 + math.cos(a0) * r00, math.sin(a0) * r00, h0),
                   pl.P(cx0 + math.cos(a1) * r01, math.sin(a1) * r01, h0),
                   pl.P(cx1 + math.cos(a1) * r11, math.sin(a1) * r11, h1),
                   pl.P(cx1 + math.cos(a0) * r10, math.sin(a0) * r10, h1)]
            fr.draw.polygon(pts, fill=col)
    # the pit's rim: the east lip catches the low west light, the west lip throws its shadow in
    q0, cx0, R0, h0 = rings[0]
    for k in range(NS):
        a0, a1 = k * math.tau / NS, (k + 1) * math.tau / NS
        c = math.cos(0.5 * (a0 + a1))
        p0 = (cx0 + math.cos(a0) * R0 * (1 + _noise(a0, pharm)), math.sin(a0) * R0 * (1 + _noise(a0, pharm)))
        p1 = (cx0 + math.cos(a1) * R0 * (1 + _noise(a1, pharm)), math.sin(a1) * R0 * (1 + _noise(a1, pharm)))
        if c > 0.1:
            pl.line([p0, p1], mul(shade((176, 128, 92), lit), 0.55 + 0.45 * c), 0.09, h=0.02)
        elif c < -0.2:
            pl.line([p0, p1], shade((10, 8, 12), lit), 0.16, h=-0.05)
    # rubble chunks on the apron and the pit floor
    rng = random.Random("s8plan_rubble")
    for i in range(150):
        a = rng.uniform(0, math.tau)
        r = rng.uniform(0.5, 1.0) ** 0.6 * CRATER_R * 1.25
        x, z = BURST[0] + math.cos(a) * r, BURST[1] + math.sin(a) * r
        dp = math.hypot(x - PIT_C, z)
        h = -1.0 * clamp(1 - dp / PIT_R) if dp < PIT_R else 0.0
        s = rng.uniform(0.08, 0.32) * (0.6 if r > CRATER_R else 1.0)
        ang = a + rng.uniform(-0.4, 0.4)
        pts = _rot_rect(x, z, s * 1.8, s, ang)
        pl.poly(pts, shade((66, 62, 66), lit * rng.uniform(0.7, 1.25)), h=h + 0.05)
        if math.cos(a) > 0.2:
            pl.line([pts[0], pts[3]], shade((150, 112, 84), lit), 0.03, h=h + 0.08)
    # lamp posts flattened outward, bases torn up
    for (bx, bz) in ((-14.6, 6.9), (5.4, -6.7), (-13.2, -7.1), (6.6, 7.2)):
        a = math.atan2(bz - BURST[1], bx - BURST[0])
        ex, ez = bx + math.cos(a) * 6.0, bz + math.sin(a) * 6.0
        pl.poly(_rot_rect(bx, bz, 0.7, 0.7, a + 0.3), shade((84, 82, 86), lit), h=0.05)
        pl.line([(bx + 0.1, bz + 0.15), (ex + 0.1, ez + 0.15)], shade((14, 12, 16), lit), 0.2)   # shadow
        pl.line([(bx, bz), (ex, ez)], shade((64, 68, 76), lit), 0.16, h=0.1)
        pl.poly(_rot_rect(ex, ez, 0.75, 0.32, a), shade((36, 36, 40), lit), h=0.15)
        pl.line([(bx, bz), (ex, ez)], shade((130, 130, 136), lit), 0.04, h=0.17)
    # two cars flung to the edges: one overturned, one spun on its wheels
    for (cx, cz, ang, col, over) in ((-15.6, -4.4, 0.62, (70, 40, 40), True), (8.6, 4.4, -0.38, (54, 64, 76), False)):
        pl.poly(_rot_rect(cx + 0.25, cz - 0.2, 4.5, 1.9, ang), shade((14, 12, 16), lit))       # shadow
        if over:
            pl.poly(_rot_rect(cx, cz, 4.4, 1.8, ang), shade((36, 34, 36), lit), h=1.3)
            for (u, v) in ((-1.35, -0.75), (1.35, -0.75), (1.35, 0.75), (-1.35, 0.75)):
                wx = cx + u * math.cos(ang) - v * math.sin(ang)
                wz = cz + u * math.sin(ang) + v * math.cos(ang)
                pl.ell(wx, wz, 0.34, 0.16, shade((12, 12, 14), lit), h=1.45)
            pl.line([_rot_rect(cx, cz, 3.6, 0.0, ang)[0], _rot_rect(cx, cz, 3.6, 0.0, ang)[1]],
                    shade((60, 56, 56), lit), 0.12, h=1.4)
        else:
            pl.poly(_rot_rect(cx, cz, 4.4, 1.8, ang), shade(col, lit), h=1.2)
            pl.poly(_rot_rect(cx - 0.2 * math.cos(ang), cz - 0.2 * math.sin(ang), 2.0, 1.5, ang),
                    shade(mix_color(col, (20, 20, 26), 0.5), lit), h=1.45)
            pl.poly(_rot_rect(cx + 0.75 * math.cos(ang), cz + 0.75 * math.sin(ang), 0.5, 1.45, ang),
                    shade((110, 128, 146), lit * 0.55), h=1.4)
    return asph


def plan_mast(pl, fr, settle=0.0, lit=1.0):
    """The toppled traffic-light mast: bare (its arm was sheared in Seq 2), torn
    up from its footing on the west rim, the sheared top over the pit."""
    (x0, z0, h0), (x1, z1, h1) = MAST_PLAN
    h1 -= settle
    pole = shade((62, 66, 76), lit)
    # long east shadow on the ground (low sun in the west)
    img, dr = fr.layer()
    sh = [pl.P(x0 + 0.3, z0 - 0.16, 0.0), pl.P(x1 + 0.9, z1 - 0.16, -0.6)]
    dr.line(sh, fill=(6, 4, 8, 70), width=max(1, int(fr.S(0.26))))
    fr.merge(img)
    # torn footing: tilted concrete block + bolts + ripped cable
    pl.poly(_rot_rect(x0 - 0.35, z0 + 0.05, 1.0, 0.85, 0.35), shade((96, 92, 92), lit), h=0.3)
    pl.poly(_rot_rect(x0 - 0.35, z0 + 0.05, 0.8, 0.65, 0.35), shade((72, 70, 72), lit), h=0.35)
    for (bx, bz) in ((-0.2, -0.2), (0.2, -0.2), (0.2, 0.2), (-0.2, 0.2)):
        pl.circle(x0 - 0.35 + bx, z0 + 0.05 + bz, 0.035, shade((150, 140, 120), lit), h=0.4)
    pl.line([(x0 - 0.2, z0 + 0.1), (x0 - 0.9, z0 + 0.6), (x0 - 1.3, z0 + 0.5)], shade((20, 20, 24), lit), 0.04, h=0.3)
    # the pole: drawn as a run of short segments so its height (perspective) varies along it
    N = 14
    pts = [pl.P(lerp(x0, x1, i / N), lerp(z0, z1, i / N), lerp(h0, h1, i / N)) for i in range(N + 1)]
    w = fr.S(0.24, pl.d(0.1))
    fr.draw.line(pts, fill=pole, width=max(1, int(w)), joint="curve")
    hi = [pl.P(lerp(x0, x1, i / N), lerp(z0, z1, i / N) + 0.05, lerp(h0, h1, i / N) + 0.12) for i in range(N + 1)]
    fr.draw.line(hi, fill=shade((120, 120, 128), lit), width=max(1, int(w * 0.28)))
    # the sheared top: a bright torn lip
    ex, ez = x1, z1
    pl.poly([(ex - 0.05, ez - 0.14), (ex + 0.12, ez - 0.05), (ex + 0.05, ez + 0.06), (ex + 0.14, ez + 0.13),
             (ex - 0.04, ez + 0.13)], shade((168, 160, 150), lit), h=h1 + 0.12)


def thragg_plan(pl, fr, inj, cape_on=True, lit=1.0):
    """Thragg on his back seen from straight above: head east, boots west, the
    right arm flung north toward the mast, the left stump and flayed flank to
    the south, the shredded cape spread under him, the chest a charred cavity.
    A held cel: nothing here moves."""
    h = TH_BODY_H
    suit = shade((206, 200, 196), lit)
    suit_sh = shade((150, 144, 142), lit)
    crim = shade((168, 28, 34), lit)
    skin = shade((214, 194, 180), lit)
    # the shredded cape spread under him
    rng = random.Random("s8cape")
    charm = _harm("s8capeh", n=5, amp=0.1)
    notches = {5, 6, 13, 21, 22, 27}
    cape = []
    for i in range(34):
        a = math.pi * 0.5 + i * math.pi / 33          # from north, round the west, to south
        rr = 1 + _noise(a * 2.0, charm)
        if i in notches:
            rr *= rng.uniform(0.7, 0.8)
        cape.append((-1.95 + math.cos(a) * 0.98 * rr, math.sin(a) * 0.84 * rr))
    cape = [(-1.38, 0.62)] + cape + [(-1.38, -0.62)]
    if cape_on:
        pl.poly(cape, shade((112, 20, 28), lit), h=h - 0.2)
    for k in range(5 if cape_on else 0):     # folds
        a = math.pi * 0.62 + k * 0.42
        pl.line([(-1.9, 0.0), (-1.95 + math.cos(a) * 0.9, math.sin(a) * 0.78)], shade((84, 14, 20), lit), 0.04, h=h - 0.18)
    # legs + crimson boots (toes up)
    for sz in (1, -1):
        pl.line([(-2.12, 0.11 * sz), (-2.55, 0.14 * sz), (-2.90, 0.17 * sz)], suit, 0.17, h=h - 0.08)
        pl.line([(-2.12, 0.12 * sz), (-2.88, 0.18 * sz)], suit_sh, 0.04, h=h - 0.06)
        pl.ell(-2.98, 0.18 * sz, 0.1, 0.075, crim, h=h - 0.02)
    # right arm flung north (fist in the crimson glove), toward the mast
    pl.line([(-1.42, 0.31), (-1.36, 0.68), (-1.24, 0.98)], suit, 0.15, h=h - 0.08)
    pl.circle(-1.21, 1.05, 0.08, crim, h=h - 0.06)
    # left arm: the stump at mid-forearm (Seq 5), cauterised end
    if "forearm_lost" in inj:
        pl.line([(-1.42, -0.31), (-1.6, -0.58), (-1.67, -0.7)], suit, 0.15, h=h - 0.08)
        pl.circle(-1.68, -0.72, 0.065, shade((70, 18, 20), lit), h=h - 0.05)
        pl.circle(-1.68, -0.72, 0.04, shade((40, 14, 14), lit), h=h - 0.04)
    else:
        pl.line([(-1.42, -0.31), (-1.6, -0.58), (-1.62, -0.98)], suit, 0.15, h=h - 0.08)
        pl.circle(-1.62, -1.04, 0.08, crim, h=h - 0.06)
    # torso, crimson shoulder yoke and belt
    torso = [(-1.33, 0.30), (-1.40, 0.35), (-1.62, 0.33), (-1.85, 0.27), (-2.02, 0.21), (-2.15, 0.22),
             (-2.15, -0.22), (-2.02, -0.21), (-1.85, -0.27), (-1.62, -0.33), (-1.40, -0.35), (-1.33, -0.30)]
    pl.poly(torso, suit, h=h)
    pl.poly([(-1.33, 0.30), (-1.40, 0.35), (-1.48, 0.34), (-1.48, -0.34), (-1.40, -0.35), (-1.33, -0.30)], crim, h=h + 0.01)
    pl.line([(-2.03, 0.22), (-2.03, -0.22)], crim, 0.04, h=h + 0.01)
    if "torn_suit" in inj:
        r2 = random.Random("s8torn")
        for k in range(6):
            x, z = r2.uniform(-2.05, -1.5), r2.uniform(-0.2, 0.25)
            pl.poly(_rot_rect(x, z, 0.07, 0.04, r2.uniform(0, 3)), skin, h=h + 0.01)
    if "flank_flayed" in inj:
        pl.poly([(-1.52, -0.34), (-1.86, -0.27), (-2.04, -0.22), (-2.0, -0.15), (-1.8, -0.19), (-1.56, -0.25)],
                shade((150, 30, 36), lit), h=h + 0.01)
        for k in range(4):
            x = -1.6 - k * 0.1
            pl.line([(x, -0.31 + k * 0.02), (x - 0.03, -0.22 + k * 0.015)], shade((210, 190, 180), lit), 0.012, h=h + 0.02)
    # neck + head (crown east, face up)
    pl.line([(-1.36, 0.0), (-1.2, 0.0)], skin, 0.19, h=h - 0.02)
    pl.ell(-1.05, 0.0, 0.125, 0.105, shade((24, 22, 26), lit), h=h - 0.02)           # close-cropped hair cap
    pl.ell(-1.095, 0.0, 0.1, 0.092, skin, h=h)
    dk = shade((30, 26, 28), lit)
    for sz in (1, -1):
        pl.line([(-1.04, 0.06 * sz), (-1.045, 0.02 * sz)], dk, 0.012, h=h + 0.01)        # brows
        pl.circle(-1.065, 0.038 * sz, 0.01, dk, h=h + 0.01)                              # open eyes
    pl.poly([(-1.118, 0.06), (-1.15, 0.065), (-1.16, 0.0), (-1.15, -0.065), (-1.118, -0.06), (-1.135, 0.0)],
            shade((74, 68, 66), lit), h=h + 0.01)                                         # dusty mustache
    if "mouth_blood" in inj:
        pl.line([(-1.155, -0.03), (-1.14, -0.09)], shade((140, 12, 20), lit), 0.014, h=h + 0.01)
    if "ear_torn" in inj:
        pl.ell(-1.08, -0.106, 0.03, 0.02, shade((130, 16, 22), lit), h=h - 0.01)
        pl.line([(-1.08, -0.11), (-1.12, -0.19), (-1.2, -0.22)], shade((120, 10, 18), lit), 0.016, h=h - 0.03)
    # the chest: a dark, charred cavity (no anatomy)
    if "chest_destroyed" in inj:
        cx, cz = CHEST
        r3 = random.Random("s8cav")
        ring = [(cx + math.cos(a) * 0.17 * r3.uniform(0.85, 1.12), cz + math.sin(a) * 0.15 * r3.uniform(0.85, 1.12))
                for a in [i * math.tau / 16 for i in range(16)]]
        pl.poly(ring, shade((58, 36, 30), lit), h=h + 0.005)
        hole = [(cx + math.cos(a) * 0.11 * r3.uniform(0.8, 1.1), cz + math.sin(a) * 0.1 * r3.uniform(0.8, 1.1))
                for a in [i * math.tau / 12 for i in range(12)]]
        pl.poly(hole, shade((14, 6, 8), lit), h=h - 0.1)


class _ScaledPlan:
    """Plan proxy that scales a figure's footprint about its own position
    (heights untouched) - an animatic readability cheat for a 0.5 m wide man
    seen from 16-26 m up."""

    def __init__(self, pl, ox, oz, k):
        self.pl, self.ox, self.oz, self.k = pl, ox, oz, k

    def _p(self, x, z):
        return (self.ox + (x - self.ox) * self.k, self.oz + (z - self.oz) * self.k)

    def ell(self, x, z, rx, rz, fill, h=0.0):
        self.pl.ell(*self._p(x, z), rx * self.k, rz * self.k, fill, h)

    def circle(self, x, z, r, fill, h=0.0):
        self.pl.circle(*self._p(x, z), r * self.k, fill, h)

    def line(self, pts, fill, w, h=0.0):
        self.pl.line([self._p(*q) for q in pts], fill, w * self.k, h)

    def poly(self, pts, fill, h=0.0):
        self.pl.poly([self._p(*q) for q in pts], fill, h)

    def seg3(self, a, b, w, fill):
        self.pl.seg3(self._p(a[0], a[1]) + (a[2],), self._p(b[0], b[1]) + (b[2],), w * self.k, fill)


GOJO_PLAN_K = 1.25


def gojo_plan(pl, fr, t2, inj, lit=1.0, hair_down=True):
    """Gojo from straight above, stacked by height so perspective leans him
    outward from frame centre: shoes, the hanging right hand, the stump, the
    shoulders (one slow breath), the blindfold band at his neck, the loose
    white hair stirring west in the east wind."""
    x, z = GOJO_X, 0.0
    pl = _ScaledPlan(pl, x, z, GOJO_PLAN_K)
    suit = shade((24, 26, 34), lit)
    suit_hi = shade((54, 58, 76), lit)
    skin = shade((226, 200, 184), lit)
    hair = shade((236, 238, 246), lit)
    breath = 0.5 - 0.5 * math.cos(t2 / 2.0 * math.tau)          # 24 in, 24 out (on twos)
    # shoes (toes east)
    for sz in (0.105, -0.105):
        pl.ell(x + 0.12, z + sz, 0.14, 0.05, shade((14, 14, 18), lit), h=0.05)
    # hips
    pl.ell(x, z, 0.11, 0.165, suit, h=0.95)
    # right arm hanging (south side), hand at the thigh
    pl.seg3((x + 0.0, z - 0.215, 1.45), (x + 0.03, z - 0.255, 1.12), 0.085, suit)
    pl.seg3((x + 0.03, z - 0.255, 1.12), (x + 0.05, z - 0.26, 0.86), 0.075, suit)
    pl.circle(x + 0.06, z - 0.26, 0.045, skin, h=0.82)
    # left arm (north side): ends at the elbow - the raw stump
    pl.seg3((x + 0.0, z + 0.215, 1.45), (x + 0.05, z + 0.265, 1.13), 0.085, suit)
    stump_col = (150, 24, 32) if "stump_sealed" not in inj else (226, 190, 176)
    pl.circle(x + 0.06, z + 0.27, 0.038, shade(stump_col, lit), h=1.1)
    # torso + shoulders (breathing)
    pl.ell(x - 0.01, z, 0.12, 0.19, suit, h=1.25)
    hs = 1.47 + 0.02 * breath
    pl.ell(x - 0.005, z, 0.125, 0.235 * (1 + 0.025 * breath), suit, h=hs)
    pl.line([(x - 0.115, z - 0.19), (x - 0.125, z + 0.19)], shade((206, 140, 92), lit), 0.03, h=hs + 0.01)   # warm west rim
    if "jacket_torn_shoulder" in inj:
        pl.poly([(x - 0.06, z + 0.15), (x + 0.07, z + 0.14), (x + 0.08, z + 0.23), (x - 0.03, z + 0.25)],
                shade((96, 22, 30), lit), h=hs + 0.01)
        pl.line([(x - 0.03, z + 0.17), (x + 0.05, z + 0.2)], shade((140, 30, 38), lit), 0.015, h=hs + 0.02)
    # the blindfold, pulled down: a dark band round the neck, mostly hidden under the hair
    pl.ell(x + 0.02, z, 0.075, 0.085, shade((8, 8, 12), lit), h=1.6)
    # head: the face tilted down toward Thragg shows a sliver of skin on the east side
    pl.ell(x + 0.035, z, 0.085, 0.08, skin, h=1.72)
    hx = x - 0.012 - 0.004 * breath
    if hair_down:      # blindfold off: the hair falls loose
        pl.ell(hx, z, 0.1, 0.1, hair, h=1.86)
        pl.ell(hx - 0.02, z + 0.02, 0.06, 0.05, shade((206, 208, 222), lit), h=1.88)
    else:              # blindfold on: the spikes, seen from above as a star
        pl.poly([(hx + math.cos(a) * (0.13 if i % 2 == 0 else 0.07), z + math.sin(a) * (0.13 if i % 2 == 0 else 0.07))
                 for i, a in enumerate([j * math.tau / 14 for j in range(14)])], hair, h=1.9)
    # loose strands stirring west in the east wind (on twos)
    rng = random.Random("s8strands")
    for i in range(6):
        zz = z + rng.uniform(-0.08, 0.08)
        L = rng.uniform(0.07, 0.13)
        wob = 0.03 * math.sin(t2 * rng.uniform(5, 8) + i * 1.7)
        pl.line([(hx - 0.08, zz), (hx - 0.08 - L * 0.5, zz + wob * 0.5), (hx - 0.08 - L, zz + wob)], hair, 0.012, h=1.86)


def chest_smoke(pl, fr, t, strength=1.0, salt="s8smk"):
    """The thin thread of smoke rising from Thragg's chest straight up at the
    lens: it rises toward the camera (grows and leans outward with height) and
    the east wind bends it west. On ones."""
    if strength <= 0:
        return
    img, dr = fr.layer()
    rng = random.Random(salt)
    cx, cz = CHEST
    n = 46
    for i in range(n):
        ph = (i / n + t * 0.55) % 1.0                    # each puff's age along the thread
        hh = TH_BODY_H + ph * 9.0
        x = cx - 0.55 * ph ** 1.3 * 3.2 + 0.05 * math.sin(t * 3.1 + i * 0.9)
        z = cz + 0.18 * math.sin(ph * 7.0 + t * 1.7 + rng.uniform(0, 1))
        r = 0.03 + 0.42 * ph ** 1.2
        a = int(185 * strength * (1 - ph) ** 1.3 * rng.uniform(0.6, 1.0))
        X, Y = pl.P(x, z, hh)
        R = fr.S(r, pl.d(hh))
        c = mix_color((150, 142, 140), (206, 196, 188), ph)
        dr.ellipse([X - R, Y - R, X + R, Y + R], fill=c + (a,))
    paste(fr, img, blur=1.2)


def dust_veil(fr, f, n):
    """The Red's dust veil, multiplane: four layers drifting west at different
    speeds; the east wind strips each away from the east edge, nearest layer
    first. ~70% at f0, ~10% by f30, nearly clear after."""
    k = n / 44.0
    layers = [  # (salt, start, end, alpha, drift speed (frame widths/s), blob size)
        ("v0", 0 * k, 12 * k, 0.33, 0.34, 0.17),
        ("v1", 2 * k, 18 * k, 0.31, 0.22, 0.19),
        ("v2", 5 * k, 24 * k, 0.29, 0.14, 0.21),
        ("v3", 9 * k, 30 * k, 0.27, 0.08, 0.24),
    ]
    sv = Soft(fr, div=8)
    tt = f / FPS
    for (salt, s0, s1, alpha, speed, size) in layers:
        u = seg(f, s0, s1, "inout")
        edge = 1.35 - 1.95 * u                       # the stripped (east) edge sweeps west
        if edge < -0.45:
            continue
        drift = speed * tt

        def draw(dr, w, h, salt=salt, edge=edge, drift=drift, alpha=alpha, size=size):
            rng = random.Random("s8veil" + salt)
            blobs = []
            for i in range(44):
                bu = rng.uniform(-0.3, 1.4) - drift
                bv = rng.uniform(-0.15, 1.15)
                kk = clamp((edge + 0.12 - bu) / 0.3)
                if kk <= 0:
                    continue
                rw = rng.uniform(0.7, 1.4) * size
                rh = rw * rng.uniform(0.55, 0.9) * w / h
                blobs.append((alpha * kk * rng.uniform(0.75, 1.0), bu, bv, rw, rh))
            blobs.sort()
            for (a, bu, bv, rw, rh) in blobs:
                dr.ellipse([(bu - rw) * w, (bv - rh * 0.5) * h, (bu + rw) * w, (bv + rh * 0.5) * h], fill=int(255 * a))
        sv.add(draw, (206, 198, 188), blur=0.05)
    # the residual haze that settles out
    res = 0.10 * (1 - seg(f, 14 * k, 30 * k, "inout")) + 0.03 * (1 - seg(f, 30 * k, 44 * k, "out"))
    if res > 0.004:
        sv.add(lambda dr, w, h: dr.rectangle([0, 0, w, h], fill=int(255 * res)), (200, 190, 180), blur=0)
    sv.commit()


def s8_01(fr):
    t, f = fr.t, fr.f
    t2 = on2(fr)
    Hc = kf(t, [(0.0, H_START), (fr.dur, H_END)], "inout")      # eased crane-down, no rotation, no shake
    pl = Plan(fr, Hc)
    go = C.opts(fr, "gojo")
    ginj = set(go["injuries"])
    to = C.opts(fr, "thragg")
    tinj = set(to["injuries"])
    plan_ground(pl, fr)
    # Gojo's long faint shadow, laid east by the shaft, its head touching Thragg's boots
    img, dr = fr.layer()
    sh = [(GOJO_X + 0.08, 0.12), (GOJO_X + 0.08, -0.12), (-4.7, -0.15), (-4.35, -0.24), (-3.55, -0.22),
          (-3.3, -0.1), (-3.06, -0.07), (-3.06, 0.07), (-3.3, 0.1), (-3.55, 0.2), (-4.35, 0.25), (-4.7, 0.15)]
    dr.polygon([pl.P(x, z, -0.25 * clamp((GOJO_X + 0.1 - x) / -2.8)) for x, z in sh], fill=(6, 4, 8, 92))
    paste(fr, img, blur=2.0)
    thragg_plan(pl, fr, tinj, cape_on=bool(to.get("cape")))
    # the mast settles a centimetre on the rubble at the metal groan
    t_groan = cue(fr, "metal_groan", 0, 22)
    plan_mast(pl, fr, settle=0.01 * seg(t, t_groan, t_groan + T(fr, 3), "out"))
    if t >= t_groan:
        if t - t_groan < 0.5:
            fx.dust_cloud(fr, MAST_PLAN[1][0], MAST_PLAN[1][1] - 0.1, (t - t_groan) * 2.2, r=0.3, n=8, rise=0.0,
                          ground=False, alpha=46, salt="s8groan", d=pl.d(0.0))
    chest_smoke(pl, fr, t)
    gojo_plan(pl, fr, t2, ginj, hair_down=go.get("hair_down", True))
    # light: the warm shaft through the torn deck pools over Gojo and the west of the crater;
    # the rest of the frame sits in the dusk shadow of the storm deck
    lt = Soft(fr, div=6)
    pool = [(-30, -3.1), (-1.0, -2.6), (1.2, -0.9), (1.4, 1.2), (-0.6, 3.1), (-30, 3.7)]

    def dim(dr, w, h):
        dr.rectangle([0, 0, w, h], fill=int(255 * 0.4))
        dr.polygon([(px2u(fr, pl.P(x, z))[0] * w, px2u(fr, pl.P(x, z))[1] * h) for x, z in pool], fill=0)
    lt.add(dim, (10, 8, 16), blur=0.06)

    def warm(dr, w, h):
        dr.polygon([(px2u(fr, pl.P(x, z))[0] * w, px2u(fr, pl.P(x, z))[1] * h) for x, z in pool], fill=int(255 * 0.2))
    lt.add(warm, (255, 186, 120), blur=0.05)
    lt.commit()
    # settling grit glinting in the shaft
    rng = random.Random("s8grit")
    clear = seg(f, T(fr, 10), T(fr, 32), "inout")
    for i in range(70):
        x, z = rng.uniform(-14, 0.5), rng.uniform(-2.8, 3.2)
        hh = (rng.uniform(1.0, 9.0) - t * rng.uniform(0.4, 0.9)) % 9.0 + 0.3
        tw = math.sin(t * rng.uniform(9, 16) + rng.uniform(0, math.tau))
        if tw < 0.55:
            continue
        X, Y = pl.P(x, z, hh)
        c = shade((255, 222, 170), (0.5 + 0.5 * tw) * (0.35 + 0.65 * clear))
        r = max(1.0, 1.3 * fr.ss)
        fr.draw.ellipse([X - r, Y - r, X + r, Y + r], fill=c)
        if tw > 0.9:
            fr.glow.ellipse([X - 3 * r, Y - 3 * r, X + 3 * r, Y + 3 * r], fill=shade((120, 90, 60), clear))
    dust_veil(fr, f, fr.n)
    fr.vignette = 0.45


# =============================================================================
# S8-02  CU on the crater floor: the last breath
# =============================================================================
CU2_X = -1.52                    # frame centre: cavity centre-left, head right (frame ~1.6 m wide)
CU2_Y = -0.80
CU2_ZOOM = 1200.0
TH2_HEAD = (-1.03, -0.86)        # head centre (face up, crown east)
TH2_HEAD_M = 0.29                # crown-to-chin
CAV2 = (-1.61, -0.695)           # the cavity on the top of the chest


def cu2_backdrop(fr, t, lit=1.0):
    """Shallow-focus plate behind the body: the dusty air beyond the north rim,
    the pit's far wall, the toppled mast soft across the top, the floor."""
    H = fr.H
    top, low = shade((64, 54, 62), lit), shade((156, 116, 92), lit)
    for i in range(30):
        v0 = i / 30 * 0.4
        fr.s_rect(0, v0, 1, v0 + 0.4 / 30 + 0.002, mix_color(top, low, (i / 29) ** 1.3))
    # a light shaft through the dust
    img, dr = fr.layer()
    dr.polygon([(0.05 * fr.W, 0), (0.22 * fr.W, 0), (0.42 * fr.W, 0.42 * H), (0.2 * fr.W, 0.42 * H)],
               fill=(255, 196, 140, 38))
    fr.merge(img)
    # the pit's far wall and the north rim (broken slabs against the haze)
    rng = random.Random("s8cu2wall")
    wall = [(0, 0.33 * H)]
    u = 0.0
    while u < 1.02:
        wall.append((u * fr.W, (0.30 + rng.uniform(-0.03, 0.03)) * H))
        u += rng.uniform(0.04, 0.09)
    wall += [(fr.W, 0.62 * H), (0, 0.62 * H)]
    fr.draw.polygon(wall, fill=shade((44, 38, 42), lit))
    for i in range(14):
        u, v = rng.uniform(0, 1), rng.uniform(0.27, 0.33)
        w, h = rng.uniform(0.03, 0.08), rng.uniform(0.015, 0.04)
        fr.s_poly([(u, v), (u + w * 0.6, v - h), (u + w, v - h * 0.3), (u + w * 0.9, v + 0.01), (u, v + 0.01)],
                  shade((70, 62, 64), lit * rng.uniform(0.8, 1.2)))
    for i in range(10):     # strata of the wall, catching the warm light
        v = rng.uniform(0.34, 0.58)
        fr.s_line([(rng.uniform(-0.1, 0.5), v), (rng.uniform(0.5, 1.1), v + rng.uniform(-0.02, 0.02))],
                  shade((76, 62, 58), lit), width=rng.uniform(2, 5))
    # the floor behind and in front of him
    fr.s_rect(0, 0.6, 1, 1, shade((48, 42, 44), lit))
    for i in range(60):
        u, v = rng.uniform(0, 1), rng.uniform(0.6, 1.0)
        s = rng.uniform(0.004, 0.02) * (0.5 + v)
        fr.s_poly([(u - s, v), (u, v - s * 0.8), (u + s * 1.2, v - s * 0.2), (u + s * 0.6, v + s * 0.4)],
                  shade((70, 64, 64), lit * rng.uniform(0.6, 1.3)))
    blur_frame(fr, 5.0)
    # the toppled mast, soft and dark across the top of frame (1.5 m beyond him)
    img2, dr2 = fr.layer()
    a = fr.P(-7.6, 0.25, 1.94)
    b = fr.P(-1.4, 0.0, 1.94)
    w = fr.S(0.24, 1.94)
    dr2.line([a, b], fill=(26, 26, 32, 255), width=int(w))
    dr2.polygon([(b[0], b[1] - w * 0.5), (b[0] + w * 0.25, b[1] - w * 0.2), (b[0] + w * 0.1, b[1] + w * 0.1),
                 (b[0] + w * 0.3, b[1] + w * 0.5), (b[0], b[1] + w * 0.5)], fill=(26, 26, 32, 255))
    dr2.line([(a[0], a[1] - w * 0.38), (b[0], b[1] - w * 0.38)], fill=(110, 86, 74, 255), width=int(w * 0.12))
    paste(fr, img2, blur=14.0)


def thragg_cu_body(fr, breath, slack, inj, cape_on=True, lit=1.0):
    """Thragg's torso in profile on the crater floor (side-on, lens a little
    above him): the destroyed chest, the left stump and flayed flank on the
    camera side, the shredded cape under him."""
    lift = 0.024 * breath
    flo = -1.02

    def top_y(x):
        # chest top contour + the breath lift (strongest over the ribcage)
        y = (-0.785 + 0.11 * smoothstep(-2.45, -1.62, x) - 0.02 * smoothstep(-1.5, -1.36, x)
             - 0.07 * smoothstep(-1.36, -1.26, x))
        w = smoothstep(-2.1, -1.75, x) * (1 - smoothstep(-1.42, -1.3, x))
        return y + lift * w
    suit = shade((204, 198, 192), lit)
    suit_mid = shade((168, 160, 158), lit)
    suit_lo = shade((128, 120, 122), lit)
    crim = shade((150, 24, 30), lit)
    skin = shade((206, 184, 172), lit)
    # the cape under him, spread on the floor toward the lens: torn, uneven tatters
    rng = random.Random("s8cu2cape")
    cape = [(-2.7, flo + 0.03)]
    x = -2.7 if cape_on else -1.0
    while x < -1.1:
        w = rng.uniform(0.05, 0.16)
        cape.append((x + w * 0.3, flo - rng.uniform(0.02, 0.05)))
        if rng.random() < 0.45:      # a hanging tatter
            cape.append((x + w * 0.5, flo - rng.uniform(0.06, 0.1)))
        cape.append((x + w * 0.8, flo - rng.uniform(0.015, 0.04)))
        x += w
    cape.append((-1.1, flo + 0.03))
    if cape_on:
        fr.poly(cape, shade((96, 18, 24), lit))
    for i in range(7 if cape_on else 0):
        x0 = rng.uniform(-2.6, -1.25)
        fr.line([(x0, flo + 0.01), (x0 + rng.uniform(-0.05, 0.05), flo - 0.04)], shade((66, 10, 16), lit), width_m=0.006)
    # neck down from the jaw to the shoulders (the head is drawn on top)
    fr.poly([(-1.31, -0.86), (-1.13, -0.84), (-1.12, -0.99), (-1.31, flo)], mul(skin, 0.86))
    fr.poly([(-1.31, -0.94), (-1.12, -0.95), (-1.12, -0.99), (-1.31, flo)], mul(skin, 0.72))
    # torso (back flat on the floor), shaded: lit top surface -> the camera-side flank in shade
    xs = [-2.6 + i * 0.02 for i in range(int((-1.26 + 2.6) / 0.02) + 1)]
    body = ([(-2.6, flo)] + [(x, top_y(x)) for x in xs] +
            [(-1.235, -0.875), (-1.225, -0.93), (-1.235, -0.98), (-1.26, flo)])
    fr.poly(body, suit_lo)
    fr.poly([(x, top_y(x) - 0.002) for x in xs] + [(x, top_y(x) - 0.13) for x in reversed(xs)], suit_mid)
    fr.poly([(x, top_y(x) - 0.004) for x in xs] + [(x, top_y(x) - 0.045) for x in reversed(xs)], suit)
    # crimson shoulder yoke
    yk = [x for x in xs if x > -1.48]
    fr.poly([(x, top_y(x) - 0.003) for x in yk] + [(x, top_y(x) - 0.065) for x in reversed(yk)], crim)
    # torn suit
    r2 = random.Random("s8cu2torn")
    for k in range(4 if "torn_suit" in inj else 0):
        x, y = r2.uniform(-2.4, -1.95), r2.uniform(-0.86, -0.8)
        s = r2.uniform(0.01, 0.02)
        fr.poly([(x - s, y), (x, y + s * 1.3), (x + s, y - s * 0.2), (x + s * 0.2, y - s)], skin)
    # flayed left flank: a raw patch low on the camera side (restrained, no anatomy)
    fl = [(-2.6, flo + 0.035), (-2.38, flo + 0.03), (-2.15, flo + 0.04), (-1.9, flo + 0.05), (-1.84, flo + 0.075),
          (-1.95, flo + 0.09), (-2.2, flo + 0.085), (-2.42, flo + 0.095), (-2.6, flo + 0.09)]
    flayed = "flank_flayed" in inj
    if flayed:
        fr.poly(fl, shade((104, 32, 36), lit))
    for k in range(6 if flayed else 0):
        x = r2.uniform(-2.55, -1.95)
        fr.ellipse(x, flo + r2.uniform(0.05, 0.075), r2.uniform(0.02, 0.045), 0.01, fill=shade((72, 18, 22), lit))
    for k in range(3 if flayed else 0):
        x = -2.35 + k * 0.17
        fr.line([(x, flo + 0.045), (x + 0.02, flo + 0.08)], shade((150, 128, 124), lit), width_m=0.004)
    # the chest cavity: charred rim, dark hole, seen from a little above (lifts with the breath)
    cx, cy = CAV2[0], top_y(CAV2[0]) - 0.004
    r3 = random.Random("s8cu2cav")
    destroyed = "chest_destroyed" in inj
    rim = [(cx + math.cos(a) * 0.135 * r3.uniform(0.85, 1.12), cy + math.sin(a) * 0.042 * r3.uniform(0.8, 1.35))
           for a in [i * math.tau / 22 for i in range(22)]]
    if destroyed:
        fr.poly(rim, shade((46, 30, 28), lit))
    hole = [(cx + math.cos(a) * 0.095 * r3.uniform(0.85, 1.05), cy - 0.006 + math.sin(a) * 0.026 * r3.uniform(0.8, 1.2))
            for a in [i * math.tau / 14 for i in range(14)]]
    if destroyed:
        fr.poly(hole, shade((10, 4, 6), lit))
    for k in range(9 if destroyed else 0):    # charred flakes lifting off the edge
        a = r3.uniform(0, math.tau)
        px, py = cx + math.cos(a) * 0.13, cy + math.sin(a) * 0.04
        s = r3.uniform(0.008, 0.016)
        fr.poly([(px - s, py), (px, py + s), (px + s, py - s * 0.3)], shade((26, 18, 18), lit))
    # the left arm on the camera side: upper arm along his flank, ending in the cauterised stump
    sh_, el = (-1.37, -0.905), (-1.73, -0.94)
    fr.circle(sh_[0], sh_[1], 0.088, suit_mid)
    fr.poly([(sh_[0], sh_[1] + 0.075), (el[0], el[1] + 0.06), (el[0], el[1] - 0.062), (sh_[0], sh_[1] - 0.08)], suit_mid)
    fr.poly([(sh_[0], sh_[1] + 0.075), (el[0], el[1] + 0.06), (el[0], el[1] + 0.03), (sh_[0], sh_[1] + 0.04)], suit)
    fr.poly([(sh_[0], sh_[1] - 0.05), (el[0], el[1] - 0.035), (el[0], el[1] - 0.062), (sh_[0], sh_[1] - 0.08)], suit_lo)
    if "forearm_lost" in inj:       # Seq 5: the forearm torn away by the Purple's shell, the stump cauterised
        cap = [(el[0], el[1] + 0.062), (el[0] - 0.03, el[1] + 0.045), (el[0] - 0.045, el[1] + 0.005),
               (el[0] - 0.035, el[1] - 0.04), (el[0], el[1] - 0.064)]
        fr.poly(cap, shade((52, 26, 24), lit))
        fr.ellipse(el[0] - 0.022, el[1] - 0.002, 0.014, 0.034, fill=shade((96, 26, 28), lit))
    else:
        fr.line([el, (el[0] - 0.3, el[1] - 0.01)], suit_mid, width_m=0.12)
    return cx, cy


def thragg_profile(L, inj, slack=0.0, ash_k=0.0, lit=1.0):
    """Thragg's head in PROFILE, in the inserts.Local drawing system and the
    inserts.thragg_face design (square heavy jaw, close-cropped jet-black hair,
    thick drooping mustache, heavy brow, dark-brown eyes). inserts only has an
    upright 3/4 portrait; laid on its back it reads as a face turned to the
    lens, not eyes on the sky. Design coords: facing +x, y down; the caller's
    Local (flip -1, rot 90) lays it face-up with the crown screen-right, so
    gravity (screen-down) is design -x."""
    skin = shade(THRAGG.skin, lit)
    sk_sh = shade(THRAGG.skin, 0.74 * lit)
    hair = THRAGG.hair
    gap = 0.035 * slack
    # thick neck (continues into the torso drawn in world space)
    L.poly([(-0.42, 0.2), (0.16, 0.6), (0.2, 1.3), (-0.48, 1.3)], mul(skin, 0.86))
    L.poly([(-0.42, 0.2), (-0.12, 0.42), (-0.16, 1.3), (-0.48, 1.3)], sk_sh)
    # skull + face silhouette
    head = [(-0.52, -0.42), (-0.4, -0.66), (-0.12, -0.78), (0.18, -0.74), (0.38, -0.6), (0.46, -0.4), (0.5, -0.25),
            (0.56, -0.19), (0.48, -0.12), (0.5, -0.05), (0.6, 0.1), (0.66, 0.17), (0.57, 0.22), (0.53, 0.25),
            (0.53, 0.38), (0.51, 0.44 + gap), (0.53, 0.58 + gap), (0.48, 0.7 + gap), (0.3, 0.75 + gap),
            (0.02, 0.64), (-0.22, 0.5), (-0.42, 0.3), (-0.56, 0.0)]
    L.poly(head, skin)
    # shading: cheek hollow, jaw underside, temple
    L.poly([(-0.22, 0.5), (0.02, 0.64), (0.3, 0.75 + gap), (0.36, 0.62 + gap), (0.1, 0.5), (-0.1, 0.38)], sk_sh)
    L.poly([(0.1, 0.06), (0.36, 0.1), (0.42, 0.3), (0.2, 0.36), (0.06, 0.24)], mul(skin, 0.9))
    # close-cropped hair: a tight cap, square hairline, down to the ear
    L.poly([(0.32, -0.56), (0.18, -0.745), (-0.12, -0.79), (-0.41, -0.67), (-0.54, -0.42), (-0.57, -0.02),
            (-0.44, 0.14), (-0.34, -0.06), (-0.26, -0.3), (0.0, -0.47), (0.2, -0.5)], hair)
    for k in range(8):
        a = -0.4 + k * 0.1
        L.line([(a, -0.76 + abs(a + 0.1) * 0.15), (a + 0.04, -0.62 + abs(a) * 0.1)], shade(hair, 1.7), 0.006)
    # heavy brow + the open eye staring along the face (up at the torn sky); no blink, ever
    L.poly([(0.24, -0.21), (0.53, -0.23), (0.55, -0.17), (0.27, -0.15)], hair)
    L.poly([(0.3, -0.115), (0.44, -0.135), (0.48, -0.095), (0.33, -0.07)], (220, 212, 210))
    L.ell(0.43, -0.105, 0.03, 0.028, fill=(56, 36, 28))
    L.ell(0.435, -0.105, 0.014, 0.014, fill=(12, 8, 10))
    L.line([(0.29, -0.12), (0.45, -0.14), (0.49, -0.1)], sk_sh, 0.014)            # upper lid
    L.poly([(0.55, -0.135), (0.585, -0.13), (0.575, -0.105)], (210, 202, 200))     # a sliver of the far eye
    # dried blood tear from the outer corner, run back toward the ear (gravity = -x)
    if "eye_blood" in inj:
        L.line([(0.3, -0.09), (0.16, -0.07), (0.0, -0.06)], (120, 10, 18), 0.016)
    # nose + nostril; dried blood from the nostril back over the cheek
    L.line([(0.5, -0.05), (0.62, 0.12)], mul(skin, 0.85), 0.012)
    L.ell(0.53, 0.2, 0.025, 0.015, fill=(90, 50, 50))
    if "nosebleed" in inj:
        L.line([(0.52, 0.21), (0.42, 0.17), (0.32, 0.17)], (120, 10, 18), 0.014)
    # the thick drooping mustache, greyed with dust
    L.poly([(0.58, 0.22), (0.44, 0.24), (0.28, 0.27), (0.21, 0.36), (0.22, 0.56), (0.31, 0.57), (0.33, 0.42),
            (0.43, 0.36), (0.55, 0.33)], hair)
    r = random.Random("s8prof_must")
    for i in range(34):
        x, y = r.uniform(0.24, 0.56), r.uniform(0.25, 0.54)
        L.ell(x, y, 0.009, 0.007, fill=(100, 94, 92))
    # mouth: set, then the jaw slackens a few millimetres on the fall
    L.poly([(0.36, 0.41), (0.53, 0.4), (0.52, 0.43 + gap), (0.37, 0.43 + gap * 0.6)], (58, 22, 26))
    # froth (ruptured lung) and blood at the lips; blood from the corner runs back toward the floor
    if "mouth_blood" in inj:
        L.line([(0.38, 0.44), (0.22, 0.5), (0.05, 0.52)], (138, 12, 20), 0.022)
    for i in range(8 if "lung_ruptured" in inj else 0):
        L.ell(0.4 + r.uniform(-0.03, 0.12), 0.42 + r.uniform(-0.01, 0.04), 0.014, 0.012, fill=(232, 212, 212))
    # torn left ear (camera side) and the blood running from it down his neck to the floor
    L.poly([(-0.12, -0.14), (-0.22, -0.16), (-0.29, -0.06), (-0.28, 0.06), (-0.22, 0.12), (-0.16, 0.06),
            (-0.2, 0.0), (-0.13, -0.04)], (176, 140, 130))
    if "ear_torn" in inj:
        L.poly([(-0.2, -0.15), (-0.29, -0.06), (-0.24, -0.02), (-0.2, -0.09)], (126, 16, 22))
    if "ear_blood" in inj:
        L.line([(-0.24, 0.06), (-0.38, 0.3), (-0.5, 0.62)], (118, 8, 16), 0.03)
    # the ash fleck: drifts down and settles on his cheek below the left eye - nothing answers it
    if ash_k > 0:
        ax, ay = lerp(1.6, 0.27, ash_k), lerp(-0.3, 0.02, ash_k)
        L.poly([(ax - 0.022, ay), (ax, ay - 0.015), (ax + 0.025, ay + 0.004), (ax + 0.004, ay + 0.018)], (178, 174, 170))


def thragg_cu_head(fr, slack, ash_k, inj, lit=1.0):
    """The head, face up, crown east: thragg_profile() in an inserts.Local laid
    on its back (flip -1, rot 90)."""
    hx, hy = fr.P(*TH2_HEAD)
    s = TH2_HEAD_M * fr.cam.zoom / (1.5 * 540.0)
    L = inserts.Local(fr, hx / fr.W, hy / fr.H, s, 90.0, -1)
    thragg_profile(L, inj, slack, ash_k, lit)
    return L


def cu2_smoke(fr, t, cx, cy, puff, thin):
    """Smoke curling up out of the cavity (on ones); a puff on the exhale, then
    a thinner thread."""
    img, dr = fr.layer()
    rng = random.Random("s8cu2smk")
    n = 40
    for i in range(n):
        ph = (i / n + t * 0.42) % 1.0
        y = cy + ph * 0.9
        x = cx + 0.02 * math.sin(ph * 9 + t * 2.3 + i) - 0.18 * ph ** 1.5 + 0.03 * math.sin(t * 1.3)
        r = (0.012 + 0.07 * ph) * (1 - 0.45 * thin)
        a = int(120 * (1 - ph) ** 1.3 * (1 - 0.5 * thin) * rng.uniform(0.6, 1.0))
        X, Y = fr.P(x, y)
        R = fr.S(r)
        dr.ellipse([X - R, Y - R * 1.3, X + R, Y + R * 1.3], fill=(168, 158, 154, a))
    if puff > 0:   # the small puff the exhale pushes out of the wound
        for i in range(8):
            a2 = rng.uniform(-0.6, 0.6) + math.pi / 2
            rr = 0.03 + 0.12 * puff
            X, Y = fr.P(cx + math.cos(a2) * rr * 0.8, cy + 0.02 + math.sin(a2) * rr)
            R = fr.S(0.04 + 0.05 * puff)
            dr.ellipse([X - R, Y - R, X + R, Y + R], fill=(176, 166, 160, int(110 * (1 - puff) ** 0.7)))
    paste(fr, img, blur=3.0)


def s8_02(fr):
    t = fr.t
    t2 = on2(fr)
    t_in = cue(fr, "breath", 0, 12)                       # the last inhale (f12)
    t_peak = t_in + T(fr, 14)                             # slow, laboured rise (14 frames)
    t_out = cue(fr, "breath", 1, 28)                      # the exhale (f28): the bubble breaks
    t_fall0, t_fall1 = t_peak, t_peak + T(fr, 8)          # the fall, quicker (8 frames)
    zoom = gzoom(t, T(fr, 12), fr.dur, CU2_ZOOM, CU2_ZOOM * 1.03, "smooth")   # barely felt 3% creep
    fr.cam = Cam(x=CU2_X, y=CU2_Y, zoom=zoom)
    cu2_backdrop(fr, t)
    # breath on twos: up slow, down fast; after f34 nothing on the body moves
    if t2 < t_peak:
        breath = seg(t2, t_in, t_peak, "inout")
    else:
        breath = 1 - seg(t2, t_fall0, t_fall1, "in")
    slack = seg(t2, t_fall0, t_fall1, "out")
    to = C.opts(fr, "thragg")
    tinj = set(to["injuries"])
    cx, cy = thragg_cu_body(fr, breath, slack, tinj, cape_on=bool(to.get("cape")))
    L = thragg_cu_head(fr, slack, ash_k=seg(t, T(fr, 36), T(fr, 44), "out"), inj=tinj)
    # the bubble at the near corner of the mouth: swells f16-26, breaks on the exhale
    t_b0, t_b1 = t_in + T(fr, 4), t_peak
    if t_b0 <= t < t_out:
        r = 0.012 + 0.05 * seg(t2, t_b0, t_b1, "out")
        L.ell(0.4, 0.45, r, r, fill=(226, 206, 206), outline=(150, 40, 46), width=1.5)
        L.ell(0.4 + r * 0.3, 0.45 - r * 0.35, r * 0.25, r * 0.2, fill=(250, 245, 245))
    elif t_out <= t < t_out + T(fr, 3):
        for k in range(6):
            a = k * math.tau / 6
            L.line([(0.4 + math.cos(a) * 0.03, 0.45 + math.sin(a) * 0.03),
                    (0.4 + math.cos(a) * 0.07, 0.45 + math.sin(a) * 0.07)], (220, 190, 190), 0.008)
    puff = seg(t, t_fall0, t_fall0 + T(fr, 4), "out") if t < t_fall0 + T(fr, 6) else 0.0
    cu2_smoke(fr, t, cx, cy, puff, thin=seg(t, T(fr, 34), fr.dur, "inout"))
    # foreground grit, out of focus
    img, dr = fr.layer()
    rng = random.Random("s8cu2fg")
    for i in range(12):
        u, v = rng.uniform(0, 1), rng.uniform(0.86, 1.04)
        r = rng.uniform(0.02, 0.05) * fr.H
        dr.ellipse([u * fr.W - r * 1.5, v * fr.H - r, u * fr.W + r * 1.5, v * fr.H + r], fill=(30, 26, 28, 200))
    paste(fr, img, blur=10.0)
    fr.vignette = 0.55


# =============================================================================
# S8-03  the push-in: RCT, the wipe, the blindfold, "Told you."
# =============================================================================
NECK_PIV = (-0.05, 0.62)          # head pivot (design units of inserts.gojo_face; y down)
BAND_COLLAR = [(-0.44, 0.55), (0.36, 0.5), (0.4, 0.62), (-0.46, 0.68)]
BAND_EYES = [(-0.6, -0.28), (0.52, -0.3), (0.52, -0.06), (-0.55, -0.02)]
SPIKES = [(-0.62, -0.25), (-0.95, -0.55), (-0.62, -0.62), (-0.92, -0.98), (-0.45, -0.82), (-0.55, -1.32),
          (-0.2, -0.95), (-0.12, -1.42), (0.08, -1.0), (0.32, -1.36), (0.3, -0.92), (0.62, -1.18), (0.45, -0.74),
          (0.78, -0.82), (0.5, -0.5), (0.58, -0.3)]


def rot_about(p, piv, deg):
    """Rotate design point p about piv; positive = clockwise on screen (y down),
    matching inserts.Local."""
    a = math.radians(deg)
    c, s = math.cos(a), math.sin(a)
    x, y = p[0] - piv[0], p[1] - piv[1]
    return (piv[0] + x * c - y * s, piv[1] + x * s + y * c)


def card_backdrop(fr, v_h, t, lit=1.0, salt="s803bg"):
    """Painted plate behind the push-in (camera facing north-west, long lens):
    storm deck above, the last warm band low on the horizon, the lit city low at
    screen-left across the river, the ruins and smoke to the right; then blurred."""
    top, mid, low = shade((26, 26, 42), lit), shade((80, 60, 80), lit), shade((196, 116, 78), lit)
    vgrad(fr, [(0.0, top), (v_h - 0.2, mid), (v_h, low), (1.0, low)])
    fr.soft_circle(0.1, v_h - 0.03, 0.34, shade((120, 58, 26), lit), world=False)
    # the torn storm deck
    rng = random.Random(salt + "deck")
    for i in range(26):
        u = rng.uniform(-0.2, 1.2) - t * 0.004
        v = rng.uniform(-0.05, 0.22)
        rw, rh = rng.uniform(0.12, 0.28), rng.uniform(0.04, 0.08)
        c = mix_color(shade((40, 38, 56), lit), shade((120, 84, 90), lit), rng.uniform(0, 0.4) + (0.3 if u < 0.4 else 0))
        fr.s_poly([(u - rw, v), (u - rw * 0.5, v - rh), (u + rw * 0.4, v - rh * 1.1), (u + rw, v), (u + rw * 0.5, v + rh),
                   (u - rw * 0.4, v + rh * 0.9)], c)
    # ruins and smoke to the right
    for i in range(9):
        u0 = 0.52 + i * 0.06 + rng.uniform(-0.02, 0.02)
        w = rng.uniform(0.03, 0.06)
        top_v = v_h - rng.uniform(0.08, 0.3)
        col = shade((36, 34, 48), lit * rng.uniform(0.85, 1.1))
        fr.s_poly([(u0, v_h + 0.02), (u0, top_v + 0.02), (u0 + w * 0.4, top_v), (u0 + w * 0.7, top_v + 0.03),
                   (u0 + w, top_v + 0.01), (u0 + w, v_h + 0.02)], col)
    img, dr = fr.layer()
    for k in range(2):
        sx = 0.7 + k * 0.17
        for j in range(14):
            ph = (j / 14 + t * 0.025 + k * 0.4) % 1.0
            u, v = sx - ph * 0.16, v_h - 0.18 - ph * 0.5
            r = (0.025 + ph * 0.07) * fr.H
            c = mix_color(shade((74, 62, 66), lit), mid, ph * 0.5)
            dr.ellipse([u * fr.W - r * 1.3, v * fr.H - r, u * fr.W + r * 1.3, v * fr.H + r],
                       fill=c + (int(110 * (1 - ph) ** 0.8),))
    paste(fr, img, blur=22)
    # the lit city low at screen-left
    x = -0.02
    while x < 0.4:
        w = rng.uniform(0.012, 0.03)
        top_v = v_h - rng.uniform(0.012, 0.07)
        fr.s_rect(x, top_v, x + w, v_h + 0.03, shade((40, 36, 52), lit))
        x += w + rng.uniform(0.0, 0.004)
    fr.s_rect(0, v_h + 0.025, 1, 1.0, shade((34, 30, 38), lit))
    blur_frame(fr, 9.0)
    # bokeh of the lit city's warm windows (defocused)
    img, dr = fr.layer()
    for i in range(70):
        u = rng.uniform(0.0, 0.4) ** 1.15
        v = v_h - rng.uniform(0.0, 0.06)
        r = rng.uniform(0.005, 0.012) * fr.H
        c = mix_color(PAL["window_lit"], (255, 230, 180), rng.random() * 0.5)
        dr.ellipse([u * fr.W - r, v * fr.H - r, u * fr.W + r, v * fr.H + r], fill=c + (int(rng.uniform(90, 200)),))
    paste(fr, img, blur=1.0)
    fr.soft_circle(0.14, v_h - 0.02, 0.12, shade((90, 56, 24), lit), world=False)


def dust_motes(fr, t, n=36, salt="motes", warm_u=(0.0, 0.5), fall=0.004, size=(0.0015, 0.004)):
    """Dust motes drifting through the warm light (screen space)."""
    rng = random.Random(salt)
    img, dr = fr.layer()
    for i in range(n):
        u = (rng.uniform(-0.1, 1.1) - t * rng.uniform(0.004, 0.012)) % 1.2 - 0.1
        v = (rng.uniform(0, 1) + t * fall * rng.uniform(0.5, 1.5)) % 1.0
        r = rng.uniform(*size) * fr.H
        warm = 1.0 if warm_u[0] <= u <= warm_u[1] else 0.45
        a = int(rng.uniform(90, 200) * warm)
        dr.ellipse([u * fr.W - r, v * fr.H - r, u * fr.W + r, v * fr.H + r], fill=(255, 214, 170, a))
    paste(fr, img, blur=0.6)


def gojo_bust(fr, Lb, lift, seal, t, inj):
    """Shoulders, torso and the far (left) arm ending at the elbow, in the
    design units of inserts.gojo_face (front three-quarter, facing screen-right)."""
    suit = GOJO.suit
    rim = (196, 132, 92)
    # torso
    Lb.poly([(-0.48, 0.66), (-1.2, 0.86), (-1.58, 1.2), (-1.66, 2.4), (-1.52, 4.8), (1.08, 4.8), (1.2, 2.4),
             (1.3, 1.18), (1.06, 0.86), (0.44, 0.6)], suit)
    Lb.line([(0.04, 0.72), (0.14, 4.8)], GOJO.suit_hi, 0.02)
    for k in range(4):   # buttons
        Lb.ell(0.07 + k * 0.022, 1.25 + k * 0.85, 0.035, 0.035, fill=(70, 74, 90))
    # warm rim along the west (screen-left) shoulder and flank
    Lb.line([(-0.48, 0.67), (-1.2, 0.87), (-1.57, 1.2), (-1.65, 2.4), (-1.52, 4.8)], rim, 0.04)
    if "jacket_torn_shoulder" in inj:
        Lb.poly([(0.62, 0.8), (1.02, 0.86), (1.24, 1.12), (1.06, 1.38), (0.7, 1.22)], (64, 16, 22))
        Lb.poly([(0.72, 0.9), (0.98, 0.94), (1.1, 1.12), (0.92, 1.24), (0.74, 1.12)], (124, 28, 34))
        Lb.line([(0.66, 0.84), (0.8, 1.0), (0.7, 1.14)], (40, 10, 14), 0.02)
    # far (left) arm: the sleeve ends at the elbow, torn; lifted a few cm for the RCT
    sh, el = FAR_SH, far_elbow(lift)
    sleeve = mix_color(suit, GOJO.suit_hi, 0.35)
    Lb.line([sh, el], (8, 8, 12), 0.5)
    Lb.ell(el[0], el[1], 0.25, 0.25, fill=(8, 8, 12))
    Lb.line([sh, el], sleeve, 0.42)
    Lb.ell(el[0], el[1], 0.21, 0.21, fill=sleeve)
    # stump end: turns toward the lens as he lifts it
    ex, ey = stump_end(lift)
    ey -= 0.05
    for k in range(5):       # torn sleeve edge
        a = k / 4 * math.pi
        Lb.line([(ex - 0.2 * math.cos(a), ey - 0.03), (ex - 0.2 * math.cos(a) + 0.02, ey + 0.07 + 0.03 * (k % 2))],
                sleeve, 0.05)
    raw = (150, 26, 34)
    sealed = (232, 196, 182)
    rx = 0.15
    ry = lerp(0.06, 0.12, lift)
    Lb.ell(ex, ey + 0.05, rx, ry, fill=mix_color(raw, sealed, seal))
    if seal < 0.98:
        Lb.ell(ex, ey + 0.05, rx * 0.55 * (1 - seal), ry * 0.55 * (1 - seal), fill=(90, 10, 18))
    if seal > 0.3:   # the first faint swell of regrowth under the new skin
        sw = (seal - 0.3) / 0.7
        Lb.ell(ex + 0.01, ey + 0.05 + ry * 0.5, rx * 0.5 * sw, ry * 0.6 * sw + 0.01, fill=(244, 214, 202))
    return Lb.p(ex, ey + 0.05)


def gojo_hand(Lh_or_b, hx, hy, ang, s=1.0, thumb=0.0, skin=None):
    """Gojo's right hand (back of the hand toward the lens) at design (hx, hy)."""
    skin = skin or GOJO.skin
    L = Lh_or_b
    c, sn = math.cos(ang), math.sin(ang)

    def q(u, v):
        return (hx + (u * c - v * sn) * s, hy + (u * sn + v * c) * s)
    L.poly([q(-0.12, -0.12), q(0.16, -0.14), q(0.24, 0.0), q(0.18, 0.14), q(-0.1, 0.13), q(-0.16, 0.0)], skin)
    for k in range(3):
        L.line([q(0.16, -0.1 + k * 0.08), q(0.3, -0.1 + k * 0.08)], skin, 0.07 * s)
    L.line([q(0.18, -0.1), q(0.18, 0.12)], shade(skin, 0.75), 0.012 * s)
    L.line([q(-0.04, -0.12), q(lerp(0.0, 0.12, thumb), lerp(-0.26, -0.2, thumb))], skin, 0.075 * s)


def s8_03(fr):
    t = fr.t
    t2 = on2(fr)
    # key moments (from the sfx cues)
    t_rct = cue(fr, "rct_heal", 0, 4)                    # f4: the shimmer at the stump
    t_rct1 = t_rct + T(fr, 16)                           # 16 frames of RCT
    t_wipe = cue(fr, "cloth", 0, 24)                     # f24-30: the wipe
    t_wipe1 = t_wipe + T(fr, 6)
    t_pull = cue(fr, "cloth", 1, 40)                     # f40-50: blindfold drawn up
    t_seat = cue(fr, "cloth", 2, 50)                     # f50: it seats; hair springs (f50-56)
    t_hook = t_pull - T(fr, 4)                           # f36: thumb hooks the cloth
    t_line = T(fr, 68)                                   # "Told you." (dialogue at_frame)
    for dl in fr.shot.get("dialogue") or []:
        t_line = dl.get("at_frame", 68) / FPS
    t_line1 = t_line + T(fr, 18)
    t_out = cue(fr, "breath", 0, 88)
    inj = injuries(fr, "gojo", {"stump_sealed": t_rct1, "nosebleed": t_wipe1, "nosebleed_trace": t_wipe1})
    # camera: constant slow push from waist-up to head-and-shoulders, rising to eye level (never eases out)
    s = gzoom(t, 0.0, fr.dur, 0.27, 0.54, "linear")
    u = t / fr.dur
    cu, cv = lerp(0.395, 0.42, u), lerp(0.30, 0.43, u)
    v_h = lerp(0.64, 0.56, u)
    card_backdrop(fr, v_h, C.tg(fr))
    dust_motes(fr, C.tg(fr), n=40, salt="s803motes", warm_u=(0.0, 0.45))
    # --- character (on twos) ---
    lift = seg(t2, t_rct - T(fr, 2), t_rct + T(fr, 4), "inout") * (1 - seg(t2, t_rct1, t_rct1 + T(fr, 6), "inout"))
    seal = seg(t2, t_rct, t_rct1, "inout")
    breath_out = seg(t2, t_out - T(fr, 2), t_out + T(fr, 6), "inout")
    # head: bowed toward the crater; glances down at the stump; lifts a little for the blindfold
    rot = kf(t2, [(0.0, 10.0), (t_rct, 10.0), (t_rct + T(fr, 4), 17.0), (t_rct1 - T(fr, 2), 17.0), (t_rct1 + T(fr, 4), 10.0),
                  (t_hook, 8.0), (t_pull + T(fr, 4), 3.0), (t_seat + T(fr, 6), 7.0)])
    dy = 0.04 * breath_out
    Lb = inserts.Local(fr, cu, cv + dy * 0.5 * s, s, 0.0, 1)
    gojo_bust(fr, Lb, lift, seal, t, inj)
    if t_rct <= t < t_rct1 + T(fr, 3):
        # RCT (VFX bible 8): soft warm-white shimmer at the wound, knitting inward; no green, no sparkles
        ep = gojo_stump_px(fr, Lb, lift)
        wx, wy = (ep[0] / fr.ss - OUT_W / 2) / 1080.0, -(ep[1] / fr.ss - OUT_H / 2) / 1080.0
        keep = fr.cam
        fr.cam = Cam(0.0, 0.0, 1080.0)
        fx.rct_heal(fr, wx, wy, -0.2 + (t - t_rct) / max(1e-6, t_rct1 - t_rct) * 1.2, r=0.028 * s / 0.3)
        fr.cam = keep
    hc = rot_about((0.0, 0.0), NECK_PIV, rot)
    hcu, hcv = (Lb.p(*hc)[0] / fr.W, Lb.p(*hc)[1] / fr.H)
    Lh = inserts.Local(fr, hcu, hcv, s, rot, 1)
    # blindfold / hair / eyes state, from the ledger: the eyes this shot starts with (the
    # previous continuity_out) and ends with; the blindfold goes up on screen only if the
    # ledger says it does
    eyes_in = C.opts(fr, "gojo", switch=1e9)["eyes"]
    eyes_out = C.opts(fr, "gojo", switch=0.0)["eyes"]
    covers = eyes_in != "blindfold" and eyes_out == "blindfold"
    band_u = seg(t2, t_pull, t_seat, "inout") if covers else (1.0 if eyes_in == "blindfold" else 0.0)
    spring = kf(t2, [(t_seat, 0.55), (t_seat + T(fr, 2), 0.86), (t_seat + T(fr, 4), 1.1), (t_seat + T(fr, 6), 1.0)])
    seated_full = (t2 >= t_seat + T(fr, 6)) if covers else eyes_in == "blindfold"
    smile = seg(t2, T(fr, 56), T(fr, 68), "inout")
    if seated_full:
        inserts.gojo_face(fr, hcu, hcv, s, expr="cold", eyes="blindfold", injuries=(), rot=rot, flip=1, t=t)
    else:
        covering = band_u > 0.7
        inserts.gojo_face(fr, hcu, hcv, s, expr="cold", eyes="open", injuries=(), rot=rot, flip=1, t=t,
                          eye_glow=0.0 if covering else 0.3)
        if eyes_in == "narrow":
            narrow_eyes(Lh, t)
    # cheek cut (left cheekbone, just below the cloth's edge)
    if "cheek_cut" in inj:
        Lh.line([(0.43, 0.03), (0.5, -0.0)], (170, 16, 24), 0.018)
        Lh.line([(0.47, 0.015), (0.465, 0.08)], (140, 10, 18), 0.01)
    # the nosebleed: still running, stops (f20), wiped by the wrist (f24-30) to a dried smear
    wipe_u = seg(t2, t_wipe, t_wipe1, "inout")
    if "nosebleed" in inj and wipe_u < 0.45:
        run = 0.36 + 0.06 * seg(t2, 0.0, T(fr, 20), "out")
        Lh.line([(0.37, 0.22), (0.355, 0.3), (0.36, run)], (170, 12, 22), 0.026)
        Lh.ell(0.36, run, 0.017, 0.02, fill=(160, 10, 20))
    else:
        Lh.line([(0.37, 0.22), (0.355, 0.27)], (116, 26, 30), 0.014)
        Lh.line([(0.34, 0.27), (0.22, 0.29), (0.12, 0.28)], (196, 150, 140), 0.016)  # the dried smear (faint)
    # the blindfold: hanging at the collar, then drawn up over the nose to the eyes
    if not seated_full:
        band = [lerp(a, b, band_u) for a, b in zip(BAND_COLLAR, BAND_EYES)]
        Lh.poly(band, GOJO.accent)
        Lh.line([band[0], band[1]], (40, 40, 52), 0.01)
        if band_u < 0.05:   # its loose tail at the collar
            Lh.line([(-0.4, 0.62), (-0.5, 0.78), (-0.46, 0.9)], GOJO.accent, 0.05)
        if covers and t2 >= t_seat:
            k = spring
            Lh.poly([(x, -0.3 + (y + 0.3) * k) for x, y in SPIKES], GOJO.hair)
            Lh.poly([(-0.62, -0.25), (-0.92, -0.3 - 0.68 * k), (-0.45, -0.3 - 0.52 * k), (-0.3, -0.5)], shade(GOJO.hair, 0.78))
    # mouth: flat -> a faint tired smile at one corner; "Told you." barely voiced
    if smile > 0:
        Lh.line([(0.22, 0.375), (0.27, 0.37 - 0.012 * smile), (0.31, 0.365 - 0.04 * smile)], (130, 76, 76), 0.022)
    talk = 0.0
    if t_line <= t < t_line1:
        tl = t - t_line
        talk = max(0.0, math.sin(tl / (t_line1 - t_line) * math.pi * 3)) * 0.8
    if talk > 0.05:
        Lh.ell(0.14, 0.385, 0.06, 0.008 + 0.012 * talk, fill=(70, 30, 34))
    # --- the right (near) arm: hanging / the wipe / the hook and pull / down ---
    gojo_near_arm(fr, Lb, Lh, rot, t2, t_wipe, t_wipe1, t_hook, t_pull, t_seat, band_u)
    fr.vignette = 0.42


FAR_SH = (1.18, 1.16)


def far_elbow(lift):
    return (lerp(1.66, 1.5, lift), lerp(3.15, 2.75, lift))


def stump_end(lift):
    el = far_elbow(lift)
    return (el[0] + lerp(0.04, -0.06, lift), el[1] + 0.21)


def gojo_stump_px(fr, Lb, lift):
    return Lb.p(*stump_end(lift))


def narrow_eyes(Lh, t):
    """Six Eyes narrowed and bloodshot (lids over gojo_face's open eyes)."""
    skin = GOJO.skin
    for ex, sz in ((0.3, 1.0), (-0.12, 0.85)):
        ey = -0.15
        w = 0.15 * sz
        # bloodshot: the whites either side of the iris run red
        for k in (-1, 1):
            Lh.line([(ex + k * 0.115 * sz, ey + 0.002), (ex + k * 0.06 * sz, ey + 0.004)], (214, 92, 100), 0.014)
            Lh.line([(ex + k * 0.1 * sz, ey - 0.008), (ex + k * 0.07 * sz, ey + 0.006)], (176, 40, 52), 0.006)
        Lh.poly([(ex - w, ey - 0.12), (ex + w, ey - 0.13), (ex + w, ey - 0.022 * sz), (ex - w, ey - 0.018 * sz)], skin)
        Lh.poly([(ex - w, ey + 0.026 * sz), (ex + w, ey + 0.022 * sz), (ex + w, ey + 0.1), (ex - w, ey + 0.1)], skin)
        Lh.line([(ex - 0.13 * sz, ey - 0.02 * sz), (ex + 0.13 * sz, ey - 0.026 * sz)], (60, 50, 56), 0.012)
        Lh.line([(ex - 0.13 * sz, ey - 0.024 * sz), (ex + 0.14 * sz, ey - 0.03 * sz)], GOJO.hair, 0.008)


def gojo_near_arm(fr, Lb, Lh, rot, t2, t_wipe, t_wipe1, t_hook, t_pull, t_seat, band_u):
    """Gojo's right arm, the camera-side arm. Design points of the head are
    converted into body design coords (rot_about the neck pivot)."""
    def h2b(p):
        return rot_about(p, NECK_PIV, rot)
    sh = (-1.42, 1.22)
    rest_w, rest_e = (-1.54, 5.25), (-1.64, 3.3)
    # wipe: back of the wrist passes under the nose, toward his right (screen-left)
    w_a, w_b = h2b((0.62, 0.3)), h2b((-0.3, 0.34))
    e_w = (-0.95, 2.0)
    # hook at the collar, then up with the band to the eyes
    w_hook, w_seat = h2b((0.02, 1.05)), h2b((0.02, 0.32))
    e_hook, e_seat = (-1.05, 2.45), (-0.95, 1.75)
    up_w = seg(t2, t_wipe - 0.17, t_wipe, "out")
    pass_u = seg(t2, t_wipe, t_wipe1, "inout")
    down_w = seg(t2, t_wipe1, t_wipe1 + 0.17, "in")
    up_h = seg(t2, t_hook - 0.17, t_hook, "out")
    down_h = seg(t2, t_seat + 0.04, t_seat + 0.42, "inout")
    hand_ang = 0.0
    thumb = 0.0
    if t2 < t_hook - 0.17:
        if up_w <= 0 or down_w >= 1:
            w, e = rest_w, rest_e
            mode = "rest"
        else:
            wipe_w = lerp(w_a, w_b, pass_u)
            if down_w > 0:
                w, e = lerp(wipe_w, rest_w, down_w), lerp(e_w, rest_e, down_w)
            else:
                w, e = lerp(rest_w, wipe_w, up_w), lerp(rest_e, e_w, up_w)
            mode = "wipe"
            hand_ang = math.radians(-8)
    else:
        if down_h <= 0:
            if t2 < t_pull:
                w, e = lerp(rest_w, w_hook, up_h), lerp(rest_e, e_hook, up_h)
            else:
                w, e = lerp(w_hook, w_seat, band_u), lerp(e_hook, e_seat, band_u)
            mode = "pull"
            thumb = 1.0
        else:
            w, e = lerp(w_seat, rest_w, down_h), lerp(e_seat, rest_e, down_h)
            mode = "down"
    sleeve = mix_color(GOJO.suit, GOJO.suit_hi, 0.3)
    for col, wd in (((8, 8, 12), 0.08), (sleeve, 0.0)):
        Lb.line([sh, e], col, 0.42 + wd)
        Lb.ell(e[0], e[1], 0.2 + wd / 2, 0.2 + wd / 2, fill=col)
        Lb.line([e, w], col, 0.36 + wd)
    Lb.line([(sh[0] - 0.17, sh[1] + 0.1), (e[0] - 0.19, e[1])], (176, 118, 84), 0.03)     # west rim
    if mode == "rest":
        return
    # cuff + hand
    dx, dy = w[0] - e[0], w[1] - e[1]
    L = math.hypot(dx, dy) or 1e-6
    ang = math.atan2(dy, dx)
    Lb.line([(w[0] - dx / L * 0.08, w[1] - dy / L * 0.08), w], (34, 36, 46), 0.38)
    if mode == "wipe":
        gojo_hand(Lb, w[0] + math.cos(ang) * 0.22, w[1] + math.sin(ang) * 0.22, ang + hand_ang, s=1.0)
    elif mode == "pull":
        gojo_hand(Lb, w[0] + math.cos(ang) * 0.2, w[1] + math.sin(ang) * 0.2 - 0.05, ang, s=1.0, thumb=thumb)
    else:
        gojo_hand(Lb, w[0] + math.cos(ang) * 0.22, w[1] + math.sin(ang) * 0.22, ang, s=1.0)


# =============================================================================
# S8-04  the last image: worm's-eye, locked; he turns to the lit city
# =============================================================================
WE_CAM_X = -3.5
WE_LENS_Y = 0.5                  # lens 0.5 m off the asphalt
WE_ZOOM = 125.0
WE_HORIZON_V = 0.665             # the 10-degree tilt-up puts the horizon in the lower third
GOJO_DUSK = replace(GOJO, suit=(15, 16, 22), suit_hi=(32, 32, 42), skin=(150, 122, 112), hair=(150, 144, 156),
                    accent=(6, 6, 9), rim=(255, 186, 130))


def we_cam(fr):
    # the tilt-up is a constant screen offset (pitch), not a shake: the horizon
    # (lens height at infinity) sits low in frame; the camera never moves.
    off = (WE_HORIZON_V - 0.5) * OUT_H
    fr.cam = Cam(x=WE_CAM_X, y=WE_LENS_Y, zoom=WE_ZOOM, shake=(0.0, off))


def we_backdrop(fr, t, state, lit=1.0):
    """Low-angle backdrop (screen space): storm deck, the last band of sunset
    low at screen-left over the lit, untouched city across the river; the ruined
    eastern towers with the clean-cut Purple scar and smoke columns at right."""
    vh = WE_HORIZON_V
    top, mid, low = shade((22, 24, 40), lit), shade((76, 58, 78), lit), shade((214, 124, 76), lit)
    vgrad(fr, [(0.0, top), (0.4, mid), (vh - 0.03, low), (1.0, low)])
    # the last band of sunset: brightest low at screen-left, fading east and up
    field(fr, lambda u, v: 0.85 * math.exp(-((v - (vh - 0.01)) / 0.075) ** 2) * (1 - 0.75 * smoothstep(0.05, 0.85, u)),
          shade((255, 178, 108), lit), box=(0.0, vh - 0.3, 1.0, vh + 0.02), res=(96, 48))
    field(fr, lambda u, v: 0.45 * smoothstep(0.45, 0.95, u) * smoothstep(0.25, vh, v), shade((44, 36, 58), lit),
          box=(0.4, 0.25, 1.0, vh + 0.02), res=(64, 48))
    fr.soft_circle(0.12, vh - 0.02, 0.36, shade((130, 66, 28), lit), world=False)
    fr.soft_circle(0.1, vh - 0.01, 0.12, shade((150, 92, 44), lit), world=False)
    # the torn storm deck: dark underside, ragged, lit at the tear (upper left)
    img, dr = fr.layer()
    rng = random.Random("s8weDeck")
    for i in range(70):
        u = rng.uniform(-0.25, 1.25) - t * 0.003 * rng.uniform(0.6, 1.4)
        v = rng.uniform(-0.06, 0.3) * (0.55 if u < 0.38 else 1.0)
        if u < 0.36 and v > 0.1:
            continue          # the tear the light comes through
        rw, rh = rng.uniform(0.06, 0.16), rng.uniform(0.025, 0.06)
        c = mix_color(shade((34, 32, 48), lit), shade((140, 92, 88), lit),
                      clamp(rng.uniform(0, 0.25) + (0.5 if u < 0.5 else 0.0) * (1 - v / 0.3)))
        dr.ellipse([(u - rw) * fr.W, (v - rh) * fr.H, (u + rw) * fr.W, (v + rh) * fr.H],
                   fill=c + (int(rng.uniform(170, 240)),))
    paste(fr, img, blur=10)
    # the ruined eastern towers + the Purple scar (a clean channel, descending east)
    rng = random.Random("s8weEast")
    x = 0.52
    while x < 1.04:
        w = rng.uniform(0.026, 0.05)
        hgt = rng.uniform(0.13, 0.32)
        tv = vh - hgt
        col = shade((30, 30, 44), lit * rng.uniform(0.85, 1.1))
        cut = vh - 0.2 - (x - 0.62) * 0.1
        scar = "purple_scar" in state and 0.62 < x < 0.9 and tv < cut
        if scar:
            fr.s_poly([(x, vh + 0.01), (x, cut), (x + w, cut + w * 0.1), (x + w, vh + 0.01)], col)
            fr.s_line([(x, cut), (x + w, cut + w * 0.1)], shade((176, 150, 186), lit * 0.8), width=2.0)
        else:
            pts = [(x, vh + 0.01), (x, tv)]
            for j in range(4):   # broken, jagged tops
                pts.append((x + w * (j + 1) / 5, tv + rng.uniform(0.0, 0.035)))
            pts += [(x + w, tv + rng.uniform(0.0, 0.03)), (x + w, vh + 0.01)]
            fr.s_poly(pts, col)
        for j in range(int(hgt / 0.02)):          # a few dead windows
            if rng.random() < 0.14:
                wv = vh - 0.01 - j * 0.02
                if not scar or wv > cut + 0.01:
                    fr.s_rect(x + w * 0.2, wv - 0.006, x + w * 0.45, wv, shade((70, 56, 50), lit))
        x += w + rng.uniform(0.002, 0.012)
    # the lit, untouched city across the river: low and dense on the left horizon
    rng = random.Random("s8weCity")
    x = -0.01
    while x < 0.47:
        w = rng.uniform(0.008, 0.022)
        hf = rng.uniform(0.15, 1.0) ** 1.4
        tv = vh - 0.006 - hf * 0.055 * (1.2 - x)
        col = shade(mix_color((40, 34, 50), (82, 58, 66), rng.uniform(0, 0.4)), lit)
        fr.s_rect(x, tv, x + w, vh + 0.01, col)
        cols = max(1, int(w / 0.0035))
        rows = max(1, int((vh - tv) / 0.006))
        for i in range(cols):
            for j in range(rows):
                if rng.random() < 0.55:
                    wu = x + (i + 0.25) * w / cols
                    wv = tv + (j + 0.4) * (vh - tv) / rows
                    c = mix_color(PAL["window_lit"], (255, 232, 176), rng.random() * 0.5)
                    fr.s_rect(wu, wv, wu + w / cols * 0.5, wv + 0.0026, shade(c, lit * rng.uniform(0.7, 1.05)))
        x += w + rng.uniform(0.0, 0.003)
    fr.soft_circle(0.18, vh - 0.01, 0.08, shade((80, 56, 24), lit), world=False)
    # the river: a glint line under the lit city
    for i in range(16):
        u = rng.uniform(0.0, 0.46)
        fr.s_line([(u, vh + 0.004), (u + rng.uniform(0.01, 0.04), vh + 0.004)], shade((236, 170, 110), lit * 0.8), width=1.5)
    # smoke columns over the eastern damage, rising from the ruins and bent west by the wind
    img, dr = fr.layer()
    for k, sx in enumerate((0.64, 0.8, 0.95)):
        for j in range(18):
            ph = (j / 18 + t * 0.02 + k * 0.37) % 1.0
            u = sx - ph * 0.2 - 0.02 * math.sin(ph * 4 + k)
            v = vh - 0.2 - ph * 0.42
            r = (0.012 + ph * 0.06) * fr.H
            c = mix_color((70, 60, 64), (104, 84, 94), ph)
            dr.ellipse([u * fr.W - r * 1.4, v * fr.H - r, u * fr.W + r * 1.4, v * fr.H + r],
                       fill=c + (int(120 * (1 - ph) ** 0.9),))
    paste(fr, img, blur=14)


def we_ground(fr, lit=1.0):
    """The street from the worm's-eye: the asphalt runs from the horizon to the
    lens; the crater's near rim, a ridge of heaved slabs 4-8 m away, fills the
    lower part of the frame and hides the pit floor (and Thragg)."""
    vh = WE_HORIZON_V
    # asphalt plane: lit warm far away, dark near the lens
    for i in range(24):
        v0 = vh + (1 - vh) * i / 24
        fr.s_rect(0, v0, 1, v0 + (1 - vh) / 24 + 0.002, mix_color(shade((78, 64, 62), lit), shade((26, 24, 30), lit), (i / 23) ** 0.7))
    # the far curb and sidewalk
    for d, c in ((1.9, (96, 84, 80)), (1.75, (60, 54, 58))):
        fr.line([(-60, 0.12), (60, 0.12)], shade(c, lit), width_m=0.12, d=d)
    # cross-street curbs converging on the horizon, the east crosswalk
    for xx in (-8.0, 8.0):
        fr.draw.line([fr.P(xx, 0, 0.35), fr.P(xx, 0, 3.0)], fill=shade((96, 90, 88), lit), width=max(1, int(2 * fr.ss)))
    for k in range(7):
        d = 0.5 + k * 0.17
        fr.line([(7.0, 0), (11.5, 0)], shade((150, 142, 126), lit * 0.65), width_m=0.16 * d, d=d)
    # the apron/shoulder of the crater at grade, just beyond: broken slabs, a dark band where the pit is
    rng = random.Random("s8weApron")
    pit = [fr.P(-6.0, -0.05, 1.12), fr.P(-4.0, -0.1, 1.5), fr.P(0.0, -0.1, 1.55), fr.P(1.9, -0.05, 1.12),
           fr.P(1.6, 0.0, 1.0), fr.P(-5.6, 0.0, 1.0)]
    fr.draw.polygon(pit, fill=shade((18, 16, 20), lit))
    for i in range(26):
        x = rng.uniform(-12.5, 4.5)
        d = rng.uniform(1.0, 1.7)
        s = rng.uniform(0.2, 0.6)
        h = rng.uniform(0.05, 0.25)
        fr.poly([(x - s, 0), (x - s * 0.4, h), (x + s * 0.6, h * 0.8), (x + s, 0)], shade((44, 40, 46), lit * rng.uniform(0.8, 1.3)), d=d)


def we_near_rim(fr, lit=1.0):
    """The near rim: broken asphalt heaved up on the circle of the crater
    (centre x=-4, r=8), 4-12 m from the lens. Low, jagged, tilted slabs; the
    west-facing edges catch the sunset. It hides the pit floor (and Thragg)."""
    rng = random.Random("s8weRim")
    slabs = []
    x = -12.6
    while x < 4.6:
        z = -math.sqrt(max(0.0, CRATER_R ** 2 - (x - CRATER_C) ** 2))
        d = max(0.34, (12.0 + z) / 12.0) * rng.uniform(0.95, 1.08)
        west = x < -6.8
        hgt = rng.uniform(0.06, 0.22) * (0.5 if west else 1.0)
        w = rng.uniform(0.25, 0.7)
        slabs.append((d, x, hgt, w, rng.uniform(-0.4, 0.4), rng.uniform(0.75, 1.15), rng.random()))
        x += rng.uniform(0.22, 0.55)
    slabs.sort(reverse=True)            # far first
    for (d, x, hgt, w, tilt, k, sd) in slabs:
        r2 = random.Random(sd)
        top = [(x - w * 0.5 + tilt * hgt * 0.5, hgt * r2.uniform(0.5, 0.9))]
        for j in range(1, 4):
            top.append((x - w * 0.5 + w * j / 4 + tilt * hgt, hgt * r2.uniform(0.7, 1.1)))
        top.append((x + w * 0.5 + tilt * hgt * 0.3, hgt * r2.uniform(0.3, 0.7)))
        pts = [(x - w * 0.55, -0.03)] + top + [(x + w * 0.55, -0.03)]
        fr.poly(pts, shade((30, 28, 34), lit * k), d=d)
        fr.line(top[:2], shade((150, 100, 72), lit * k), width_m=0.025, d=d)               # west edge lit
        fr.line(top[1:], shade((62, 54, 56), lit * k), width_m=0.016, d=d)
    # loose grit on the asphalt right in front of the lens
    for i in range(50):
        u, v = rng.uniform(0, 1), rng.uniform(0.84, 1.0)
        s = rng.uniform(0.002, 0.007)
        fr.s_poly([(u - s, v), (u, v - s), (u + s, v + s * 0.3)], shade((66, 58, 58), lit * rng.uniform(0.6, 1.2)))


def we_smoke_thread(fr, t):
    """Thin thread of smoke from where Thragg lies hidden (x=-2), rising from
    behind the near rim and bending west in the wind. On ones."""
    img, dr = fr.layer()
    rng = random.Random("s8weSmk")
    n = 120
    for i in range(n):
        ph = (i / n + t * 0.3) % 1.0
        y = -0.4 + ph * 8.5
        yy = max(0.0, y)
        x = THRAGG_X - 0.05 * yy ** 1.7 + (0.06 + 0.25 * ph) * math.sin(ph * 7 + t * 1.4)
        r = 0.045 + 0.14 * ph
        a = int(150 * (1 - ph) ** 1.1 * rng.uniform(0.6, 1.0))
        X, Y = fr.P(x, y, 1.05)
        R = fr.S(r, 1.05)
        dr.ellipse([X - R, Y - R * 1.3, X + R, Y + R * 1.3], fill=(158, 142, 144, a))
    paste(fr, img, blur=2.0)


def sealed_cap(fr, J, side, d=1.0, col=(224, 186, 170)):
    """The healed stump end (rig draws every stump raw): pale new skin."""
    prev = fr.depth
    fr.depth = d
    ex, ey = J[f"el_{side}"]
    dv = J[f"hand_dir_{side}"]
    s = J["scale"]
    tip = (ex + dv[0] * GOJO.forearm * s * 0.25, ey + dv[1] * GOJO.forearm * s * 0.25)
    fr.circle(tip[0], tip[1], GOJO.w_fa * 0.48 * s, fill=col)
    fr.depth = prev


def head_front(fr, J, st, look=0.0, d=1.0):
    """Gojo's head in the rig's FRONT view (the rig collapses hair and
    blindfold there): spiky crown, blindfold band, mouth. look -1..1 turns
    the face toward screen-left / right (head turning last)."""
    prev = fr.depth
    fr.depth = d
    hx, hy = J["head"]
    r = st.head_r * J["scale"]
    fr.ellipse(hx, hy, r * 0.92, r * 1.04, fill=st.skin)
    pts = []
    n = 13
    for i in range(n + 1):
        a = math.radians(-20 + 220 * i / n)
        rr = 1.12 if i % 2 == 0 else 1.6
        pts.append((hx + math.cos(a) * r * rr * 1.05 + look * r * 0.1, hy + 0.12 * r + math.sin(a) * r * rr))
    pts.append((hx - r * 0.95, hy - r * 0.1))
    pts.append((hx + r * 0.95, hy - r * 0.1))
    fr.poly(pts, st.hair)
    fr.poly([(hx - r * 0.98, hy + r * 0.3), (hx + r * 0.98, hy + r * 0.3), (hx + r * 0.98, hy + r * 0.02),
             (hx - r * 0.98, hy + r * 0.02)], st.accent)
    fr.line([(hx - r * 0.25 + look * r * 0.3, hy - r * 0.55), (hx + r * 0.2 + look * r * 0.3, hy - r * 0.57)],
            (90, 60, 60), width_m=r * 0.07)
    fr.depth = prev


# poses (facing east = +1: near = RIGHT arm; facing west = -1: near = LEFT, the stump)
G4_LOOK = P("g_tired", lean=4, neck=16, ua_n=6, fa_n=2, ua_f=-4, fa_f=-6, th_n=10, sh_n=2, th_f=-8, sh_f=-8)
G4_RAISE = P(G4_LOOK, lean=1, neck=4)
G4_FRONT = P("front_tired", neck=4, ua_n=8, fa_n=4, ua_f=10, fa_f=6, th_n=6, sh_n=3, th_f=4, sh_f=2)
G4_STEP = P(G4_FRONT, th_n=14, sh_n=6, th_f=2, sh_f=0)
G4_W0 = P("g_tired", lean=2, neck=2, ua_n=22, fa_n=16, ua_f=-4, fa_f=-6, th_n=14, sh_n=4, th_f=-10, sh_f=-10)
G4_POCKET = P(G4_W0, ua_f=-12, fa_f=16, hand_f="fist")
G4_HIP = P(G4_POCKET, lean=-3, neck=7, ua_n=26, fa_n=20, th_n=18, sh_n=-2, th_f=-4, sh_f=-5)


def s8_04(fr):
    t = fr.t
    t2 = on2(fr)
    st = C.state(SEQ)
    we_cam(fr)
    we_backdrop(fr, C.tg(fr), st)
    env.light_shafts(fr, st, strength=0.3)
    we_ground(fr)
    # the toppled mast, low across the frame (env), seen beyond the near rim
    env.toppled_mast(fr)
    we_smoke_thread(fr, t)
    we_near_rim(fr)
    # --- Gojo: the turn (f0-12), pocket (f10-18), the weight settles (f14-20), hold ---
    o = C.opts(fr, "gojo")
    inj = set(o["injuries"])
    t_step = cue(fr, "footstep", 0, 8)
    t_pocket = cue(fr, "cloth", 0, 14)
    hem = 0.04 * math.sin(C.tg(fr) * 7.0)

    def draw():
        if t2 < t_step - T(fr, 3):                                # facing the crater, the head comes up
            pose = pose_at(t2, [(0.0, G4_LOOK), (t_step - T(fr, 4), G4_RAISE, "inout")])
            J = draw_fighter(fr, GOJO_DUSK, pose, GOJO_X, None, 1, opts=dict(o, rim=False))
            return J, 1, "side"
        if t2 < t_step + T(fr, 2):                                # through the camera: hips, shoulders, then head
            pose = G4_FRONT if t2 < t_step else G4_STEP
            # rig front view puts the torn shoulder on the wrong side: paint it on his LEFT (screen-right) here
            of = dict(o, rim=False, injuries=[i for i in o["injuries"] if i != "jacket_torn_shoulder"])
            J = draw_fighter(fr, GOJO_DUSK, pose, GOJO_X, None, 1, view="front", opts=of)
            if "jacket_torn_shoulder" in inj:
                sx, sy = J["sh_n"]
                fr.poly([(sx - 0.05, sy), (sx, sy + 0.05), (sx + 0.05, sy - 0.02), (sx, sy - 0.08)], (100, 28, 34))
            head_front(fr, J, GOJO_DUSK, look=0.6 if t2 < t_step else -0.3)
            return J, 0, "front"
        pose = pose_at(t2, [(t_step + T(fr, 2), G4_W0), (t_pocket - T(fr, 2), G4_W0),
                            (t_pocket + T(fr, 4), G4_POCKET, "inout"), (T(fr, 20), G4_HIP, "inout")])
        J = draw_fighter(fr, GOJO_DUSK, pose, GOJO_X, None, -1, opts=dict(o, rim=False))
        # the right hand rides in the trouser pocket, on the far side of his hip: paint it out
        pk = seg(t2, t_pocket - T(fr, 2), t_pocket + T(fr, 2), "inout")
        if pk > 0.5:
            hx, hy = hand_pos(J, "f", GOJO.fist * 0.9)
            fr.circle(hx, hy, GOJO.fist * 1.2, fill=GOJO_DUSK.suit)
        # the near (left) upper arm, nearest the lens, a shade lighter than the body so the
        # empty sleeve reads against the torso; its blunt cuff catches the rim light
        sx, sy = J["sh_n"]
        ex, ey = J["el_n"]
        dv = J["hand_dir_n"]
        tip = (ex + dv[0] * GOJO.forearm * 0.25, ey + dv[1] * GOJO.forearm * 0.25)
        fr.line([(sx, sy), (ex, ey), tip], (36, 36, 48), width_m=GOJO.w_ua * 0.95)
        fr.circle(tip[0], tip[1], GOJO.w_fa * 0.5, fill=(36, 36, 48))
        fr.line([(tip[0] - 0.035, tip[1] - 0.01), (tip[0] + 0.03, tip[1] - 0.02)], (210, 150, 104), width_m=0.014)
        return J, -1, "side"
    lay, (J, facing, view) = capture(fr, draw)
    rim_silhouette(fr, lay, (255, 178, 118), off=(-3.0, -2.0))
    side = rig.left_side(facing if facing else 1, view)
    if "stump_sealed" in inj and "forearm_lost" in inj:
        # the empty sleeve ends at the elbow: a blunt cuff (the healed end is inside it)
        sealed_cap(fr, J, side, col=GOJO_DUSK.suit)
    if view == "side" and facing == -1:
        # jacket hem stirred by the east wind (the tail at his back lifts and flicks west)
        px, py = J["pelvis"]
        fr.poly([(px + 0.1, py + 0.06), (px + 0.15 + hem, py - 0.12 + hem * 0.5), (px + 0.02, py - 0.1),
                 (px - 0.02, py + 0.06)], GOJO_DUSK.suit)
        # a few strands of hair lifting west
        hx, hy = J["head"]
        for k in range(3):
            wob = 0.025 * math.sin(C.tg(fr) * 6 + k * 2.1)
            fr.line([(hx + 0.03 - k * 0.04, hy + 0.15), (hx - 0.04 - k * 0.04, hy + 0.2 + wob)],
                    GOJO_DUSK.hair, width_m=0.014)
    dust_motes(fr, C.tg(fr), n=50, salt="s804motes", warm_u=(0.0, 0.55), fall=0.02, size=(0.001, 0.003))
    fr.vignette = 0.5


SHOTS = {
    "S8-01": s8_01,
    "S8-02": s8_02,
    "S8-03": s8_03,
    "S8-04": s8_04,
}
