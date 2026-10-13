"""Environments: one consistent city, one consistent dusk.

WORLD GEOGRAPHY (metres along x on the fighters' plane, d = 1). The camera
always looks NORTH, so west = screen-left and east = screen-right in every
shot. Gojo is screen-left, Thragg screen-right; Thragg attacks right->left.
  far west   across a river ~3 km away: a LIT, populated city; the sun sets
             behind it (warm rim light comes from screen-left in every shot)
  x =  -7    the traffic-light mast on the WEST corner, top y = 6.4, its arm
             reaching EAST over the intersection (Gojo's perch, Seq 1)
  x =   0    centre of the intersection (Thragg's landing crater)
  x = +20..+60  east block: Red throws Thragg east through three facades (Seq 3)
  x = +80..+110 the unfinished tower, 176 m (gutted in Seq 4, crane down)
  east skyline: Hollow Purple's clean channel through four towers (Seq 5)
  x ~ -4     final crater at the west corner, the mast toppled (Seq 7)

DAMAGE STATE flags (pass a set to the draw functions):
  'landing_crater'  Thragg's landing crater + radial cracks at x=0 (Seq 1 on)
  'mast_sheared'    the mast's arm sheared off (Seq 2 on)
  'east_smash'      Red's tunnel through three east-block facades (Seq 3 on)
  'tower_gutted'    unfinished tower gutted on three floors, crane down (Seq 4 on)
  'clouds_torn'     the storm deck torn open by Seq 4's shockwave -> light shafts
  'purple_scar'     the channel through the eastern towers (Seq 5 on)
  'smoke'           smoke columns rising from damaged areas
  'final_crater'    big crater at the west corner, mast toppled (Seq 7 on)
`STATE[seq]` gives the damage set at the START of each sequence.
"""
from __future__ import annotations

import math
import random

from engine import PAL, clamp, mix_color, shade, smoothstep

_S4 = {"landing_crater", "mast_sheared", "east_smash"}
STATE = {
    1: set(),
    2: {"landing_crater"},
    3: {"landing_crater", "mast_sheared"},
    4: set(_S4),
    5: _S4 | {"tower_gutted", "clouds_torn", "smoke"},
    6: _S4 | {"tower_gutted", "clouds_torn", "purple_scar", "smoke"},
    7: _S4 | {"tower_gutted", "clouds_torn", "purple_scar", "smoke"},
    8: _S4 | {"tower_gutted", "clouds_torn", "purple_scar", "smoke", "final_crater"},
}

# purple scar: a band through the EASTERN towers (skyline layer coords at d=5)
SCAR = dict(x0=60.0, x1=520.0, y0=70.0, y1=140.0)
# the lit city: everything west of this (layer coords at d=8) is the populated city
LIT_CITY_X = -260.0
GANTRY_X = -7.0


# --------------------------------------------------------------------------
# sky
# --------------------------------------------------------------------------

def sky(fr, light: float = 1.0, lightning: float = 0.0, darken: float = 0.0):
    """Full-frame storm-dusk sky. Gradient is anchored to the camera's view of
    the horizon so it stays consistent when the camera cranes up/down."""
    H, W = fr.H, fr.W
    # horizon screen-y: where y = 0 at infinite depth sits (camera height)
    hy = H / 2 + fr.cam.y * 0.0
    top, mid, low = PAL["sky_top"], PAL["sky_mid"], PAL["sky_low"]
    if darken:
        top, mid, low = shade(top, 1 - darken), shade(mid, 1 - darken), shade(low, 1 - darken * 0.8)
    if lightning:
        top, mid = mix_color(top, (170, 170, 210), lightning * 0.6), mix_color(mid, (200, 190, 220), lightning * 0.5)
    # camera pitch proxy: higher camera -> horizon lower on screen
    tilt = clamp(fr.cam.y / 400.0, -0.3, 0.6)
    bands = 48
    for i in range(bands):
        v0, v1 = i / bands, (i + 1) / bands
        vv = v0 - tilt * 0.6
        if vv < 0.45:
            c = mix_color(top, mid, clamp(vv / 0.45))
        else:
            c = mix_color(mid, low, clamp((vv - 0.45) / 0.45))
        c = shade(c, light) if light != 1 else c
        fr.s_rect(0, v0, 1, v1 + 0.002, c)
    # low sun glow behind the cloud deck, screen-left (west)
    sun_u = 0.08 - fr.cam.x / 8000.0
    fr.soft_circle(sun_u, 0.74 - tilt * 0.55, 0.42, mix_color((0, 0, 0), (110, 52, 26), light * 0.8), world=False)
    fr.soft_circle(sun_u, 0.74 - tilt * 0.55, 0.16, mix_color((0, 0, 0), (150, 80, 40), light * 0.6), world=False)


def clouds(fr, t_global: float, density: float = 1.0, lit: float = 1.0, d: float = 40.0):
    """Two parallax decks of storm cloud drifting east->west slowly."""
    for deck, (depth, yb, col, n) in enumerate([(d * 1.6, 520, PAL["cloud"], 18), (d, 380, PAL["cloud_lit"], 14)]):
        rng = random.Random(f"cloud{deck}")
        span = 9000
        for i in range(int(n * density)):
            cx = rng.uniform(-span, span) - t_global * (3.0 + deck * 2)
            cx = ((cx + span) % (2 * span)) - span
            cy = yb + rng.uniform(-60, 120)
            w = rng.uniform(380, 900)
            h = rng.uniform(40, 110)
            c = shade(col, 0.75 + 0.3 * lit) if deck else col
            for k in range(5):
                ox = rng.uniform(-w * 0.5, w * 0.5)
                oy = rng.uniform(-h * 0.3, h * 0.4)
                fr.ellipse(cx + ox, cy + oy, w * rng.uniform(0.3, 0.55), h * rng.uniform(0.5, 1.0),
                           fill=shade(c, rng.uniform(0.85, 1.1)), d=depth)


# --------------------------------------------------------------------------
# skyline
# --------------------------------------------------------------------------
_LAYERS = [  # depth, x-span (layer metres), height range, colour, window density
    (14.0, 3600, (120, 380), PAL["bldg_far"], 0.25),
    (8.0, 2200, (90, 300), shade(PAL["bldg_far"], 0.92), 0.35),
    (5.0, 1500, (60, 240), PAL["bldg_mid"], 0.5),
    (2.8, 760, (30, 140), PAL["bldg_near"], 0.6),     # street-facing block behind the far curb (d=2.4)
]
_CACHE = {}


def _buildings(li):
    if li in _CACHE:
        return _CACHE[li]
    depth, span, (h0, h1), col, wd = _LAYERS[li]
    rng = random.Random(f"skyline{li}")
    out = []
    x = -span
    while x < span:
        w = rng.uniform(16, 46) * (1 + li * 0.05)
        h = rng.uniform(h0, h1)
        if rng.random() < 0.15:
            h *= 1.35
        top = rng.choice(["flat", "flat", "flat", "step", "spire", "slant"])
        out.append(dict(x0=x, x1=x + w, h=h, top=top, col=shade(col, rng.uniform(0.85, 1.12)),
                        seed=rng.random(), wd=wd))
        x += w + rng.uniform(1, 10)
    _CACHE[li] = out
    return out


def _scarred(b, d):
    """Does this building intersect the Hollow Purple scar? (only mid layers)"""
    if d not in (5.0, 8.0):
        return None
    sx0, sx1 = SCAR["x0"] * d / 5.0, SCAR["x1"] * d / 5.0
    if b["x1"] < sx0 or b["x0"] > sx1:
        return None
    # scar is a slightly descending channel (shot travelled down-west to east)
    u = (0.5 * (b["x0"] + b["x1"]) - sx0) / (sx1 - sx0)
    y0 = SCAR["y0"] + 30 * (1 - u)
    y1 = SCAR["y1"] + 30 * (1 - u)
    return (y0, y1)


def skyline(fr, state=frozenset(), layers=(0, 1, 2, 3), lit: float = 1.0, haze: float = 0.0):
    for li in layers:
        depth = _LAYERS[li][0]
        # cull to view
        x_lo = fr.cam.x - (fr.W / fr.ss / 2) / fr.cam.zoom * depth - 60
        x_hi = fr.cam.x + (fr.W / fr.ss / 2) / fr.cam.zoom * depth + 60
        fog = mix_color((0, 0, 0), PAL["sky_mid"], clamp(0.18 + li * -0.04 + haze))
        for b in _buildings(li):
            if b["x1"] < x_lo or b["x0"] > x_hi:
                continue
            col = mix_color(b["col"], PAL["sky_mid"], clamp(0.35 - li * 0.08 + haze))
            col = shade(col, lit)
            x0, x1, h = b["x0"], b["x1"], b["h"]
            scar = _scarred(b, depth) if "purple_scar" in state else None
            pts = [(x0, -2), (x0, h), (x1, h), (x1, -2)]
            if b["top"] == "step":
                pts = [(x0, -2), (x0, h * 0.86), (x0 + (x1 - x0) * 0.25, h * 0.86), (x0 + (x1 - x0) * 0.25, h),
                       (x1 - (x1 - x0) * 0.25, h), (x1 - (x1 - x0) * 0.25, h * 0.86), (x1, h * 0.86), (x1, -2)]
            elif b["top"] == "spire":
                m = (x0 + x1) / 2
                pts = [(x0, -2), (x0, h), (m - 1, h + h * 0.12), (m + 1, h + h * 0.12), (x1, h), (x1, -2)]
            elif b["top"] == "slant":
                pts = [(x0, -2), (x0, h), (x1, h * 0.9), (x1, -2)]
            if scar and scar[0] < h:
                lo, hi = scar
                fr.poly([(x0, -2), (x0, lo), (x1, lo - 4), (x1, -2)], col, d=depth)
                if hi < h:
                    # floating top section is gone - the scar erased the middle; tops collapsed
                    pass
                # glowing cut edge
                fr.line([(x0, lo), (x1, lo - 4)], (90, 40, 110), width_m=1.6, d=depth)
                continue
            fr.poly(pts, col, d=depth)
            # facade: floor slabs + mullions as a grid, warm dusk rim on the
            # west (sun-side) edge, a few windows catching the light
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
                lit_city = depth >= 5.0 and x1 < LIT_CITY_X * depth / 8.0
                nlit = int(floors * (x1 - x0) / 10 * b["wd"] * (0.9 if lit_city else 0.12))
                for _ in range(nlit):
                    wx = x0 + rng.randint(0, max(0, nc - 1)) * (x1 - x0) / max(1, nc)
                    wy = rng.randint(2, max(2, floors - 2)) * 4.2
                    if wy > top_y - 4:
                        continue
                    c = mix_color(PAL["window_lit"], col, rng.uniform(0.0, 0.25) if lit_city else rng.uniform(0.25, 0.7))
                    fr.rect(wx + 0.3, wy - 3.6, wx + (x1 - x0) / max(1, nc) - 0.3, wy - 0.6, shade(c, lit), d=depth)
                if lit_city and fr.S(4.2, depth) <= 2.5:
                    # too far for floor detail: a warm speckle of lights instead
                    for _ in range(int((x1 - x0) * h / 400)):
                        wx = rng.uniform(x0 + 1, x1 - 1)
                        wy = rng.uniform(4, h - 4)
                        fr.rect(wx, wy, wx + 1.6, wy + 1.4, shade(PAL["window_lit"], lit * rng.uniform(0.7, 1.0)), d=depth)
            fr.line([(x0, 0), (x0, h * 0.86 if b["top"] == "step" else h)], shade(mix_color(col, PAL["rim_warm"], 0.35), lit),
                    width_m=0.6, d=depth)
            if "east_smash" in state and li == 3 and 40 < x0 < 170:
                # punched-through facade: a dark ragged hole at street height
                hx = (x0 + x1) / 2
                fr.poly([(hx - 7, 3), (hx - 5, 12), (hx + 1, 14), (hx + 6, 10), (hx + 7, 2), (hx, 0.5)],
                        (10, 10, 14), d=depth)
        # aerial haze between layers
        if li < 3:
            fr.s_rect(0, 0, 1, 1, None) if False else None


def smoke_columns(fr, t_global, state, lit=1.0):
    if "smoke" not in state:
        return
    sources = [(40, 1.9), (55, 3.0), (95, 1.0)]
    if "purple_scar" in state:
        sources += [(200, 3.0), (320, 5.0), (140, 3.0)]
    if "final_crater" in state:
        sources += [(-4, 1.2)]
    for i, (sx, d) in enumerate(sources):
        rng = random.Random(f"smoke{i}")
        for k in range(16):
            age = (t_global * 0.12 + k / 16) % 1.0
            y = age * 220
            x = sx + math.sin(age * 5 + i) * 12 + age * 60
            r = 8 + age * 40
            c = mix_color((60, 54, 60), PAL["sky_mid"], age * 0.7)
            fr.circle(x, y, r, fill=shade(c, lit), d=d)


# --------------------------------------------------------------------------
# street level
# --------------------------------------------------------------------------

def street(fr, state=frozenset(), lit: float = 1.0, show_gantry: bool = True, gantry_x: float = GANTRY_X):
    """Road plane from the far curb (d=2.4) to the camera, lane markings,
    crosswalk, abandoned cars, the traffic-light gantry."""
    road = shade(PAL["street"], lit)
    far_l, far_r = fr.P(-4000, 0, 2.4), fr.P(4000, 0, 2.4)
    fr.draw.polygon([(0, far_l[1]), (fr.W, far_r[1]), (fr.W, fr.H), (0, fr.H)], fill=road)
    # far sidewalk strip
    fr.poly([(-4000, 0), (4000, 0), (4000, 0.3), (-4000, 0.3)], shade(PAL["concrete_dark"], lit), d=2.4)
    # lane dashes at two depths
    for d in (1.25, 1.75):
        x = math.floor((fr.cam.x - 200) / 6) * 6
        while x < fr.cam.x + 200:
            fr.poly([(x, 0), (x + 3, 0), (x + 3, 0.02), (x, 0.02)], shade(PAL["street_line"], lit * 0.8), d=d)
            fr.line([(x, 0), (x + 3, 0)], shade(PAL["street_line"], lit * 0.7), width_m=0.12, d=d)
            x += 6
    # crosswalk stripes either side of the intersection
    for cx in (-9.0, 9.0):
        for k in range(6):
            d0 = 1.05 + k * 0.2
            fr.line([(cx - 2.5, 0), (cx + 2.5, 0)], shade((180, 175, 160), lit * 0.75), width_m=0.18, d=d0)
    # abandoned cars
    for (cx, d, col) in [(-17.0, 1.5, (70, 40, 40)), (21.0, 1.8, (50, 60, 70)), (-31.0, 2.1, (60, 62, 58)),
                         (36.0, 1.3, (80, 76, 60))]:
        c = shade(col, lit)
        fr.poly([(cx - 2.2, 0.25), (cx - 2.2, 0.9), (cx - 1.2, 1.0), (cx - 0.7, 1.45), (cx + 1.0, 1.45),
                 (cx + 1.6, 0.95), (cx + 2.2, 0.85), (cx + 2.2, 0.25)], c, d=d)
        fr.poly([(cx - 0.5, 1.0), (cx - 0.4, 1.35), (cx + 0.9, 1.35), (cx + 1.3, 1.0)], shade((120, 140, 160), lit * 0.6), d=d)
        fr.circle(cx - 1.3, 0.3, 0.33, fill=(14, 14, 16), d=d)
        fr.circle(cx + 1.3, 0.3, 0.33, fill=(14, 14, 16), d=d)
    if "landing_crater" in state:
        crater(fr, 0.0, 3.2, lit)
    if "final_crater" in state:
        crater(fr, -4.0, 8.0, lit, deep=True)
    if show_gantry:
        if "final_crater" in state:
            toppled_mast(fr, lit)
        else:
            gantry(fr, gantry_x, sheared="mast_sheared" in state, lit=lit)


def crater(fr, x, r, lit=1.0, deep=False):
    rng = random.Random(f"crater{x}{r}")
    rim = shade(PAL["concrete"], lit * 0.8)
    pit = shade((20, 18, 22), lit)
    # draw as stacked ellipses on the ground plane: near edge at d<1, far edge at d>1
    fr.ellipse(x, -0.05, r, r * 0.16, fill=rim)
    fr.ellipse(x, -0.08 - (0.25 if deep else 0.1), r * 0.82, r * 0.12, fill=pit)
    # radial cracks
    for k in range(14):
        a = rng.uniform(0, math.pi * 2)
        L = r * rng.uniform(1.3, 2.6)
        pts = [(x + math.cos(a) * r * 0.9, -math.sin(a) * r * 0.13)]
        for j in range(1, 4):
            ll = L * j / 3
            pts.append((x + math.cos(a + rng.uniform(-0.15, 0.15)) * ll, -math.sin(a) * ll * 0.14))
        fr.line(pts, shade((16, 14, 16), lit), width_m=0.05 + 0.03 * (deep))
    # chunks of upturned asphalt
    for k in range(10 if not deep else 22):
        a = rng.uniform(0, math.pi * 2)
        rr = r * rng.uniform(0.85, 1.25)
        cx, cy = x + math.cos(a) * rr, -math.sin(a) * rr * 0.14 + 0.1
        s = rng.uniform(0.15, 0.5) * (1.6 if deep else 1)
        fr.poly([(cx - s, cy), (cx - s * 0.3, cy + s * 0.9), (cx + s * 0.8, cy + s * 0.4), (cx + s * 0.6, cy - 0.05)],
                shade(PAL["street"], lit * rng.uniform(0.8, 1.3)))


def gantry(fr, x=GANTRY_X, sheared=False, lit=1.0):
    """Traffic-light pole on the WEST corner + mast arm reaching EAST over the
    intersection. sheared=True: the arm is gone (Seq 2 on), a torn stub left."""
    pole = shade((58, 62, 70), lit)
    top = 6.4
    fr.line([(x, 0), (x, top)], pole, width_m=0.22)
    if sheared:
        fr.line([(x, top - 0.2), (x + 0.9, top - 0.35)], pole, width_m=0.14)
        fr.poly([(x + 0.9, top - 0.25), (x + 1.1, top - 0.5), (x + 0.85, top - 0.45)], shade((150, 150, 150), lit))
    else:
        arm = [(x, top - 0.2), (x + 5.5, top - 0.2)]
        fr.line(arm, pole, width_m=0.14)
        lx, ly = arm[-1]
        fr.rect(lx - 0.25, ly - 1.1, lx + 0.25, ly - 0.05, shade((30, 32, 36), lit))
        for k, c in enumerate([(70, 20, 20), (70, 60, 20), (20, 70, 30)]):
            fr.circle(lx, ly - 0.25 - k * 0.32, 0.11, fill=c)
    fr.rect(x - 0.18, top, x + 0.18, top + 0.08, pole)


def toppled_mast(fr, lit=1.0):
    """After Seq 7: the west-corner mast lies across the new crater."""
    pole = shade((58, 62, 70), lit)
    fr.line([(GANTRY_X - 0.6, 0.1), (GANTRY_X + 5.6, 0.45)], pole, width_m=0.22, d=1.15)
    fr.line([(GANTRY_X - 0.6, 0.1), (GANTRY_X - 0.9, 0.0)], pole, width_m=0.26, d=1.15)


def river(fr, lit=1.0):
    """Glimmer of the river in front of the lit city (far west, visible in
    wides and aerials)."""
    for d, w in ((6.0, 0.6), (9.0, 0.5)):
        x0, x1 = -4000.0, LIT_CITY_X * d / 8.0 + 40
        fr.poly([(x0, -1), (x1, -1), (x1, 1.5), (x0, 1.5)], shade((60, 56, 70), lit), d=d)
        for k in range(14):
            xx = x0 + (x1 - x0) * k / 14 + (fr.gf % 48) * 0.6
            fr.line([(xx, 0.5), (xx + 30, 0.5)], shade((200, 150, 110), lit * w), width_m=0.6, d=d)


def light_shafts(fr, state, strength=1.0):
    """Shafts of evening light through the torn storm deck (Seq 4 on)."""
    if "clouds_torn" not in state or strength <= 0:
        return
    img, dr = fr.layer()
    for k, (u, w) in enumerate(((0.22, 0.05), (0.38, 0.08), (0.55, 0.04), (0.7, 0.06))):
        sway = 0.01 * math.sin(fr.gf / 48 + k)
        dr.polygon([((u + sway) * fr.W, 0), ((u + w + sway) * fr.W, 0), ((u + w * 2.4 + 0.12) * fr.W, fr.H),
                    ((u + 0.12) * fr.W, fr.H)], fill=(255, 190, 130, int(26 * strength)))
    fr.merge(img)


def rooftops(fr, roof_y: float, x0: float, x1: float, lit=1.0, details=True):
    """A rooftop surface (d=1) from x0 to x1 at height roof_y with parapet and
    clutter. The building body is drawn down to the bottom of frame."""
    body = shade((34, 34, 46), lit)
    fr.poly([(x0, roof_y), (x1, roof_y), (x1, roof_y - 400), (x0, roof_y - 400)], body)
    fr.poly([(x0, roof_y), (x1, roof_y), (x1, roof_y + 1.0), (x0, roof_y + 1.0)], shade((60, 58, 66), lit))
    if details:
        rng = random.Random(f"roof{x0}{roof_y}")
        x = x0 + 3
        while x < x1 - 4:
            kind = rng.choice(["ac", "ac", "tank", "vent", "none"])
            if kind == "ac":
                fr.rect(x, roof_y + 1, x + 2.2, roof_y + 2.4, shade((80, 82, 88), lit))
            elif kind == "tank":
                fr.rect(x, roof_y + 1, x + 0.3, roof_y + 4, shade((60, 50, 40), lit))
                fr.rect(x + 2.4, roof_y + 1, x + 2.7, roof_y + 4, shade((60, 50, 40), lit))
                fr.poly([(x - 0.3, roof_y + 4), (x + 3, roof_y + 4), (x + 3, roof_y + 7.5), (x + 1.35, roof_y + 8.6),
                         (x - 0.3, roof_y + 7.5)], shade((90, 70, 52), lit))
            elif kind == "vent":
                fr.rect(x, roof_y + 1, x + 0.6, roof_y + 2.0, shade((100, 100, 104), lit))
            x += rng.uniform(4, 9)


def tower_interior(fr, floor_y: float, lit=1.0, broken: float = 0.0, x0=80.0, x1=110.0):
    """Inside the unfinished tower: exposed slabs every 4.2 m, columns, rebar,
    half-installed curtain wall. `broken` 0..1 = how much has been smashed."""
    back = shade((40, 40, 50), lit)
    fr.draw.rectangle([0, 0, fr.W, fr.H], fill=shade((24, 24, 34), lit))
    # view out through missing curtain wall: skyline + sky glimpses
    rng = random.Random("tower")
    base = math.floor(floor_y / 4.2) * 4.2
    for k in range(-3, 5):
        y = base + k * 4.2
        # slab
        fr.poly([(x0 - 20, y - 0.35), (x1 + 20, y - 0.35), (x1 + 20, y), (x0 - 20, y)], shade((96, 92, 92), lit), d=1.2)
        fr.poly([(x0 - 20, y - 0.35), (x1 + 20, y - 0.35), (x1 + 20, y), (x0 - 20, y)], shade((110, 106, 104), lit))
        # columns
        for cx in [x0 + i * 7.5 for i in range(5)]:
            fr.rect(cx - 0.4, y, cx + 0.4, y + 3.85, shade((84, 82, 84), lit), d=1.2)
        # rebar
        for j in range(6):
            rx = rng.uniform(x0, x1)
            fr.line([(rx, y), (rx + rng.uniform(-0.3, 0.3), y + rng.uniform(0.4, 1.2))], (120, 70, 50), width_m=0.03)
    if broken > 0:
        # broken slab edges hanging
        for k in range(int(10 * broken)):
            bx = rng.uniform(x0, x1)
            by = base + rng.randint(-2, 3) * 4.2
            fr.poly([(bx, by), (bx + 1.5, by - 0.3), (bx + 2.2, by - 1.8), (bx + 0.4, by - 1.2)], shade((70, 68, 70), lit))


def open_sky(fr, t_global, state, lit=1.0, lightning=0.0, haze=0.0):
    """High-altitude backdrop: sky, clouds, the whole skyline below (lit city
    and river to the west), the unfinished tower, smoke."""
    sky(fr, lit, lightning)
    clouds(fr, t_global, lit=lit)
    river(fr, lit)
    skyline(fr, state, layers=(0, 1, 2, 3), lit=lit, haze=haze)
    unfinished_tower(fr, lit=lit, gutted="tower_gutted" in state)
    smoke_columns(fr, t_global, state, lit)
    light_shafts(fr, state)


def city_street(fr, t_global, state, lit=1.0, lightning=0.0, gantry_on=True, haze=0.0):
    """Standard street-level backdrop at the intersection."""
    sky(fr, lit, lightning)
    clouds(fr, t_global, lit=lit)
    river(fr, lit)
    skyline(fr, state, layers=(0, 1, 2, 3), lit=lit, haze=haze)
    smoke_columns(fr, t_global, state, lit)
    light_shafts(fr, state)
    street(fr, state, lit, show_gantry=gantry_on)


def unfinished_tower(fr, lit=1.0, collapse_u: float = 0.0, x0: float = 80.0, x1: float = 110.0,
                     height: float = 176.0, d: float = 1.0, broken_at: float = 84.0, gutted: bool = False,
                     gut_y: float = 120.0):
    """The unfinished 42-storey tower east of the intersection (x 80..110 on
    the fighters' plane). collapse_u: 0 intact, 0..1 upper section toppling
    (east, away from camera-left), 1 = collapsed stump with rubble pile."""
    core = shade((70, 70, 78), lit)
    slab = shade((120, 116, 112), lit)
    glass = shade((60, 80, 100), lit)
    top = height if collapse_u <= 0 else broken_at
    # columns + slabs of the standing part
    for i in range(5):
        cx = x0 + i * (x1 - x0) / 4
        fr.rect(cx - 0.5, 0, cx + 0.5, top, core, d=d)
    y = 4.2
    k = 0
    while y < top:
        fr.rect(x0 - 0.6, y - 0.35, x1 + 0.6, y, slab, d=d)
        if k % 3 != 1 and y < top * 0.7:   # curtain wall only installed on the lower floors
            fr.rect(x0, y, x1, y + 3.85, glass, d=d)
            for j in range(1, 8):
                xx = x0 + j * (x1 - x0) / 8
                fr.line([(xx, y), (xx, y + 3.85)], shade(glass, 1.4), width_m=0.12, d=d)
        y += 4.2
        k += 1
    if gutted:
        # three floors blown out by Seq 4's point-blank Red; crane gone
        fr.rect(x0 - 1, gut_y, x1 + 1, gut_y + 12.6, (14, 14, 20), d=d)
        rng = random.Random("gut")
        for j in range(18):
            gx = rng.uniform(x0, x1)
            gy = gut_y + rng.choice([0, 12.6])
            fr.poly([(gx, gy), (gx + 1.8, gy + rng.uniform(-2, 2)), (gx + 0.6, gy + rng.uniform(-3, 3))],
                    shade((90, 86, 86), lit), d=d)
        return
    if collapse_u <= 0:
        # tower crane on top
        fr.rect(x0 + 12, height, x0 + 14, height + 22, shade((180, 140, 40), lit), d=d)
        fr.line([(x0 - 30, height + 21), (x0 + 50, height + 21)], shade((180, 140, 40), lit), width_m=1.0, d=d)
        fr.line([(x0 + 13, height + 28), (x0 - 30, height + 21)], shade((150, 120, 40), lit), width_m=0.3, d=d)
        fr.line([(x0 + 13, height + 28), (x0 + 50, height + 21)], shade((150, 120, 40), lit), width_m=0.3, d=d)
    else:
        # jagged break line
        rng = random.Random("towerbreak")
        pts = [(x0 - 0.6, broken_at)]
        for j in range(1, 9):
            pts.append((x0 + j * (x1 - x0) / 9, broken_at + rng.uniform(-3, 5)))
        pts.append((x1 + 0.6, broken_at))
        pts += [(x1 + 0.6, broken_at - 4), (x0 - 0.6, broken_at - 4)]
        fr.poly(pts, shade((90, 86, 86), lit), d=d)
        for j in range(12):
            rx = x0 + rng.uniform(0, x1 - x0)
            fr.line([(rx, broken_at), (rx + rng.uniform(-2, 2), broken_at + rng.uniform(2, 7))], (120, 70, 50),
                    width_m=0.15, d=d)
        if collapse_u < 1:
            # the upper section mid-topple: rotates about the east edge and falls
            ang = math.radians(-70 * collapse_u ** 1.6)
            drop = 60 * collapse_u ** 2
            px, py = x1, broken_at
            def rot(x, y):
                dx, dy = x - px, y - py
                return (px + dx * math.cos(ang) - dy * math.sin(ang), py + dx * math.sin(ang) + dy * math.cos(ang) - drop)
            fr.poly([rot(x0, broken_at), rot(x1, broken_at), rot(x1, height), rot(x0, height)], shade((80, 78, 84), lit), d=d)
            for yy in range(int(broken_at + 4), int(height), 8):
                fr.line([rot(x0, yy), rot(x1, yy)], slab, width_m=0.5, d=d)
        else:
            # rubble mound at the foot
            for j in range(40):
                rx = x0 - 10 + rng.uniform(0, x1 - x0 + 40)
                ry = rng.uniform(0, 14) * (1 - abs(rx - (x0 + x1) / 2 - 10) / 40)
                s = rng.uniform(1.5, 5)
                fr.poly([(rx - s, max(0, ry - s)), (rx, ry + s), (rx + s, max(0, ry - s * 0.4))],
                        shade((96, 92, 90), lit * rng.uniform(0.7, 1.1)), d=d)
