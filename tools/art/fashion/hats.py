"""3D hat & accessory models (head slot). See hatkit.py for the coordinate system.

Run via build_all.py. Every hat writes:
  models/item/clothing/<id>.json          3D model (head/hand/ground/frame transforms)
  textures/item/clothing/hat/<id>.png     its unwrapped skin (+ extra textures, e.g. the animated propeller)
"""
import math

from PIL import Image, ImageDraw

from hatkit import Box, Hat, mirror_x
from lib import hash01, jitter, mix, rgb, shade, with_alpha
from materials import fabric, fluffy, gem, knit, metal, stripes_diag

SIDES = ("north", "south", "east", "west")
NO_DOWN = SIDES + ("up",)


def ring(r_out, thick, y0, y1, paint, name):
    """Four walls forming a square ring (outer half-size r_out) — open in the middle, e.g. a crown band."""
    r_in = r_out - thick
    return [
        Box((-r_out, y0, -r_out), (r_out, y1, -r_in), paint, name=name + "_n"),
        Box((-r_out, y0, r_in), (r_out, y1, r_out), paint, name=name + "_s"),
        Box((-r_out, y0, -r_in), (-r_in, y1, r_in), paint, faces=("west", "east", "up", "down"), name=name + "_w"),
        Box((r_in, y0, -r_in), (r_out, y1, r_in), paint, faces=("west", "east", "up", "down"), name=name + "_e"),
    ]


def sprite_lookup(rows, palette, cx, top, scale=1.0):
    """Returns f(x, y) -> colour or None for a pixel sprite placed on a vertical plane (x right = wearer's left
    as seen from the front, i.e. sprite column 0 is at the largest x)."""
    w = len(rows[0])

    def f(x, y):
        col = int(math.floor((cx + w * scale / 2 - x) / scale))
        row = int(math.floor((top - y) / scale))
        if 0 <= row < len(rows) and 0 <= col < w:
            ch = rows[row][col]
            if ch != ".":
                return palette[ch]
        return None
    return f


# =============================================================================================== top hat
def top_hat():
    felt = rgb("#2e2a35")
    satin = rgb("#a3202e")

    def crown(t):
        if 8.75 <= t.y < 10.25 and t.side:
            c = satin if t.y >= 9.0 else shade(satin, 0.78)
            if 9.75 <= t.y < 10.25:
                c = mix(satin, rgb("#ff9a9a"), 0.3)
            return jitter(c, 0.03, t.x, t.y, t.z)
        c = fabric(felt, var=0.05, edge=1.0)(t)
        if t.side:
            sheen = 0.5 + 0.5 * math.cos((t.x + t.z) * 0.9)
            c = shade(c, 0.94 + 0.2 * sheen)
            if t.y > 15.75:
                c = shade(c, 1.12)
        if t.face == "up":
            c = shade(c, 1.15 if (t.i + t.j) % 5 else 1.02)
        return c

    def brim(t):
        c = fabric(felt, var=0.04, edge=0.85)(t)
        if t.face == "up":
            return shade(c, 1.12)
        if t.face == "down":
            return jitter(rgb("#4a2433"), 0.04, t.x, t.z)
        return c

    def card(t):
        if t.i in (0, t.w - 1) and t.j == 0:
            return rgb("#d9cfb8")
        if t.j == 1 and t.i == 0:
            return rgb("#c0303c")
        return rgb("#f4ecd8")

    boxes = [
        Box((-6, 8, -6), (6, 8.75, 6), brim, name="brim"),
        Box((-6.6, 8.75, -2.5), (-6, 9.5, 2.5), brim, faces=NO_DOWN, name="brim_curl_l"),
        Box((6, 8.75, -2.5), (6.6, 9.5, 2.5), brim, faces=NO_DOWN, name="brim_curl_r"),
        Box((-3.75, 8.75, -3.75), (3.75, 16.5, 3.75), crown, name="crown"),
        Box((-3.95, 15.75, -3.95), (3.95, 16.6, 3.95), crown, faces=SIDES + ("up", "down"), name="crown_lip"),
        Box((3.95, 9.6, -1.2), (3.95, 12.2, 0.6), card, faces=("east", "west"),
            rot={"axis": "x", "angle": -14, "origin": (3.95, 9.6, 0)}, name="card"),
    ]
    return Hat("top_hat", boxes)


# =============================================================================================== cowboy hat
def cowboy_hat():
    leather = rgb("#946035")
    band_c = rgb("#3b2414")

    def hide(t):
        c = fabric(leather, var=0.07, edge=0.82, seed=3)(t)
        if t.face == "up" and t.w > 4 and t.h > 4 and (t.i in (1, t.w - 2) or t.j in (1, t.h - 2)) and (t.i + t.j) % 2 == 0:
            c = shade(c, 1.28)  # stitching along the brim edge
        if t.face == "down":
            c = shade(c, 0.85)
        return c

    def crown(t):
        if t.side and t.y < 9.9:
            return jitter(band_c, 0.05, t.x, t.y, t.z)
        c = fabric(leather, var=0.07, edge=1.0, seed=4)(t)
        if t.side:
            c = shade(c, 1.0 + 0.06 * math.sin(t.y * 1.7))
        return c

    def band(t):
        if t.side and t.j == 0:
            return shade(band_c, 1.35)
        return jitter(band_c, 0.06, t.x, t.y, t.z)

    def concho(t):
        return gem("#d4d8de")(t)

    brim_side = Box((5, 8, -6), (8.6, 8.75, 6), hide, rot={"axis": "z", "angle": 30, "origin": (5, 8.375, 0)}, name="brim_r")
    boxes = [
        Box((-5, 8, -7.5), (5, 8.75, 7.5), hide, name="brim_mid"),
        brim_side, mirror_x(brim_side, name="brim_l"),
        Box((-4, 8, -9.2), (4, 8.75, -7.5), hide, rot={"axis": "x", "angle": -14, "origin": (0, 8.375, -7.5)}, name="brim_front"),
        Box((-4, 8, 7.5), (4, 8.75, 9.2), hide, rot={"axis": "x", "angle": 14, "origin": (0, 8.375, 7.5)}, name="brim_back"),
        Box((-4.25, 8.75, -4.75), (4.25, 12.9, 4.75), crown, name="crown"),
        Box((-4.0, 12.9, -3.6), (-0.45, 13.6, 4.5), crown, faces=NO_DOWN, name="ridge_l"),
        Box((0.45, 12.9, -3.6), (4.0, 13.6, 4.5), crown, faces=NO_DOWN, name="ridge_r"),
        Box((-0.45, 12.9, -2.0), (0.45, 13.15, 4.2), crown, faces=NO_DOWN, name="crease"),
        Box((-4.42, 8.75, -4.92), (4.42, 9.95, 4.92), band, faces=SIDES + ("up",), name="band"),
        Box((1.4, 8.85, -5.12), (2.6, 9.85, -4.92), concho, faces=("north", "up", "east", "west"), name="concho"),
    ]
    return Hat("cowboy_hat", boxes)


# =============================================================================================== caps
def _cap_boxes(main, dark, visor_paint, logo_face, logo, back_visor=False, flat=False):
    def shell(t):
        c = fabric(main, var=0.05, edge=1.0, seed=7)(t)
        if t.side:
            # panel seams
            if t.face in ("north", "south") and t.i in (t.w // 2,) and t.w > 6:
                c = shade(c, 0.8)
            if t.j == t.h - 1:
                c = shade(c, 0.78)
        if t.face == logo_face and logo:
            lc = logo(t.x, t.y)
            if lc:
                return lc
        if t.face == ("north" if back_visor else "south") and t.side and abs(t.x) < 1.5 and t.y < 7.6:
            # adjustable strap opening
            if t.y < 7.0:
                return rgb("#151515") if abs(t.x) < 1.0 else shade(dark, 0.7)
            return shade(dark, 0.85)
        return c

    def top(t):
        c = fabric(main, var=0.05, edge=1.0, seed=8)(t)
        if t.face == "up" and (abs(t.x) < 0.5 or abs(t.z) < 0.5):
            c = shade(c, 0.82)
        return c

    vz0, vz1 = (4.6, 9.0) if back_visor else (-8.8, -4.6)
    tilt = 0 if flat else (-12 if not back_visor else 12)
    vo = (0, 7.2, 4.6 if back_visor else -4.6)
    boxes = [
        Box((-4.6, 6.6, -4.6), (4.6, 8.8, 4.6), shell, name="shell"),
        Box((-4.1, 8.8, -4.1), (4.1, 9.5, 4.1), top, faces=NO_DOWN, name="crown"),
        Box((-0.6, 9.5, -0.6), (0.6, 10.0, 0.6), lambda t: shade(main, 0.75), faces=NO_DOWN, name="button"),
    ]
    if back_visor:
        mid = Box((-3.2, 6.6, 4.6), (3.2, 7.15, 9.2), visor_paint, name="visor")
        side_r = Box((3.2, 6.6, 4.6), (4.2, 7.15, 8.4), visor_paint, name="visor_r")
    else:
        mid = Box((-3.2, 6.6, -9.2), (3.2, 7.15, -4.6), visor_paint, name="visor")
        side_r = Box((3.2, 6.6, -8.4), (4.2, 7.15, -4.6), visor_paint, name="visor_r")
    if tilt:
        rot = {"axis": "x", "angle": tilt, "origin": vo}
        mid.rot = rot
        side_r.rot = dict(rot)
    boxes += [mid, side_r, mirror_x(side_r, name="visor_l")]
    return boxes


def baseball_cap():
    main = rgb("#c9262f")
    dark = rgb("#8a1720")
    logo = sprite_lookup([
        ".w.",
        "wgw",
        ".w.",
    ], {"w": rgb("#f6f2ea"), "g": rgb("#3fd16b")}, 0.0, 8.6)

    def visor(t):
        if t.face == "down":
            return jitter(rgb("#2d6b3a"), 0.04, t.x, t.z)  # classic green under-visor
        c = fabric(main, var=0.04, edge=0.85, seed=9)(t)
        if t.face == "up" and t.j % 2 == 0 and (t.i in (1, t.w - 2)):
            c = shade(c, 1.2)  # stitch lines
        return c
    return Hat("baseball_cap", _cap_boxes(main, dark, visor, "north", logo))


def snapback_cap():
    main = rgb("#2b4fa8")
    dark = rgb("#1b3270")
    creeper = sprite_lookup([
        "gggg",
        "kggk",
        "gkkg",
        "gkkg",
    ], {"g": rgb("#5fd35a"), "k": rgb("#10240f")}, 0.0, 8.7)

    def visor(t):
        if t.face == "down":
            return jitter(rgb("#3e9e48"), 0.04, t.x, t.z)
        c = fabric(rgb("#1d2c55"), var=0.04, edge=0.85, seed=10)(t)
        if t.face == "up" and t.box.name == "visor":
            # round gold size sticker
            if (t.x - 1.5) ** 2 + (t.z - 7.0) ** 2 < 1.1:
                return mix(rgb("#f6d24a"), rgb("#ffffff"), 0.3 if t.x > 1.5 else 0.0)
        return c
    return Hat("snapback_cap", _cap_boxes(main, dark, visor, "south", creeper, back_visor=True, flat=True))


# =============================================================================================== beanie
def beanie():
    wool = rgb("#1f8f8a")
    cream = rgb("#efe4c8")
    body_knit = knit(wool, rib=False, seed=11)
    stripe_knit = knit(cream, rib=False, seed=12)

    def body(t):
        if 7.4 <= t.y < 8.3 and t.side:
            return stripe_knit(t)
        return body_knit(t)

    pom = fluffy("#f3ead2", seed=13)
    boxes = [
        Box((-4.95, 5.2, -4.95), (4.95, 6.9, 4.95), knit(shade(wool, 0.9), rib=True, seed=14), name="cuff"),
        Box((-4.7, 6.9, -4.7), (4.7, 9.1, 4.7), body, faces=NO_DOWN, name="body"),
        Box((-4.2, 9.1, -4.2), (4.2, 9.85, 4.2), body, faces=NO_DOWN, name="top"),
        Box((-3.2, 9.85, -3.2), (3.2, 10.3, 3.2), body, faces=NO_DOWN, name="top2"),
        Box((-1.6, 10.4, -1.2), (1.6, 13.0, 1.2), pom, name="pom_a"),
        Box((-1.2, 10.4, -1.6), (1.2, 13.0, 1.6), pom, faces=("north", "south", "up"), name="pom_b"),
        Box((-1.2, 10.15, -1.2), (1.2, 13.35, 1.2), pom, faces=("up", "down"), name="pom_c"),
    ]
    return Hat("beanie", boxes)


# =============================================================================================== party hat
def party_hat():
    base = rgb("#e0338f")
    stripe = rgb("#ffd23f")
    dot = rgb("#46d4f5")

    def cone(t):
        ang = math.atan2(t.z, t.x) / math.tau * 6.0
        band_v = t.y * 0.55 + ang
        c = stripe if int(math.floor(band_v)) % 2 == 0 else base
        if c is base and hash01(round(t.x * 2), round(t.y * 2), round(t.z * 2), 5) > 0.93:
            c = dot
        return jitter(c, 0.04, t.x, t.y, t.z)

    rot = {"axis": "z", "angle": -9, "origin": (0, 8, 0)}
    boxes = []
    n = 13
    step = 0.75
    for k in range(n):
        w = 3.7 * (1 - k / (n + 0.8))
        boxes.append(Box((-w, 8 + k * step, -w), (w, 8 + (k + 1) * step, w), cone,
                         faces=NO_DOWN if k else SIDES + ("up", "down"), rot=dict(rot), name="cone%d" % k))
    tinsel = fluffy("#ffcf33", seed=15)
    top = 8 + n * step
    boxes += [
        Box((-1.1, top - 0.2, -0.8), (1.1, top + 1.8, 0.8), tinsel, rot=dict(rot), name="pom_a"),
        Box((-0.8, top - 0.2, -1.1), (0.8, top + 1.8, 1.1), tinsel, faces=("north", "south"), rot=dict(rot), name="pom_b"),
        Box((-3.8, 7.6, -3.8), (3.8, 8.0, 3.8), lambda t: jitter(rgb("#ffd23f"), 0.06, t.x, t.z), faces=SIDES + ("down",),
            rot=dict(rot), name="rim"),
    ]
    return Hat("party_hat", boxes)


# =============================================================================================== chef hat
def chef_hat():
    white = rgb("#f6f6f1")

    def band(t):
        c = jitter(white, 0.025, t.x, t.y, t.z)
        if t.side and t.i % 2 == 1:
            c = shade(c, 0.93)
        if t.side and t.j == t.h - 1:
            c = shade(c, 0.86)
        return c

    def puff(t):
        c = jitter(white, 0.03, t.x, t.y, t.z)
        if t.side:
            phase = (t.x if t.face in ("north", "south") else t.z) * 1.15
            c = shade(c, 0.9 + 0.1 * math.cos(phase))
            if t.j == t.h - 1:
                c = shade(c, 0.82)
        if t.face == "up":
            c = shade(c, 1.0 - 0.05 * ((t.i // 2 + t.j // 2) % 2))
        if t.face == "down":
            c = shade(c, 0.8)
        return c

    boxes = [
        Box((-4.75, 6.4, -4.75), (4.75, 9.4, 4.75), band, faces=NO_DOWN, name="band"),
        Box((-5.6, 9.4, -5.6), (5.6, 14.4, 5.6), puff, name="puff"),
        Box((-5.0, 14.4, -5.0), (5.0, 15.2, 5.0), puff, faces=NO_DOWN, name="puff_top"),
        Box((-3.6, 15.2, -3.6), (3.6, 15.7, 3.6), puff, faces=NO_DOWN, name="puff_top2"),
    ]
    return Hat("chef_hat", boxes)


# =============================================================================================== wizard hat
def wizard_hat():
    cloth = rgb("#30307e")
    gold = rgb("#ffd447")
    stars = []
    for k in range(34):
        ang = hash01(k, 1) * math.tau
        y = 9.6 + hash01(k, 2) * 9.5
        stars.append((ang, y, k))
    big_stars = [(-0.9, 12.6), (2.2, 15.4)]  # (x, y) on the front of the cone
    moon = sprite_lookup([
        ".mm.",
        "m...",
        "m...",
        ".mm.",
    ], {"m": rgb("#e6ecf5")}, 2.1, 11.6)

    def star_at(t):
        frame = getattr(t, "frame", 0)
        if t.face == "north":
            for sx, sy in big_stars:
                dx, dy = abs(t.x - sx), abs(t.y - sy)
                if (dx < 0.5 and dy < 1.3) or (dx < 1.5 and dy < 0.45):
                    return mix(gold, rgb("#ffffff"), 0.45 if (dx < 0.5 and dy < 0.45) else 0.0)
            m = moon(t.x, t.y)
            if m:
                return m
        ang = math.atan2(t.z, t.x)
        r = max(1.0, math.hypot(t.x, t.z))
        for sa, sy, k in stars:
            da = (ang - sa + math.pi) % math.tau - math.pi
            if abs(da * r) < 0.5 and abs(t.y - sy) < 0.5:
                phase = (k + frame) % 4
                if phase == 0:
                    return rgb("#ffffff")
                if phase == 3:
                    return None
                return gold
        return None

    def cone(t):
        if t.side:
            s = star_at(t)
            if s:
                return s
        c = fabric(cloth, var=0.06, edge=1.0, seed=16)(t)
        if t.side:
            c = shade(c, 0.95 + 0.1 * math.cos(math.atan2(t.z, t.x) * 3))
        if t.face == "up":
            c = shade(c, 1.12)
        return c

    def band(t):
        if t.face == "north" and abs(t.x) < 1.1:
            return gem("#ffd447")(t) if abs(t.x) > 0.4 or t.j in (0, t.h - 1) else rgb("#4a2d12")
        return jitter(rgb("#5b2a8a"), 0.05, t.x, t.y, t.z)

    def brim(t):
        c = fabric(cloth, var=0.06, edge=0.85, seed=17)(t)
        if t.face == "up" and hash01(round(t.x * 2), round(t.z * 2), 3) > 0.95:
            return gold
        if t.face == "down":
            return shade(rgb("#24245e"), 1.0)
        return c

    boxes = [
        Box((-5, 8, -7.5), (5, 8.6, 7.5), brim, name="brim_mid"),
        Box((-7.5, 8, -5), (-5, 8.6, 5), brim, name="brim_l"),
        Box((5, 8, -5), (7.5, 8.6, 5), brim, name="brim_r"),
    ]
    for sx in (-1, 1):
        for sz in (-1, 1):
            x0, x1 = sorted((sx * 5, sx * 6.6))
            z0, z1 = sorted((sz * 5, sz * 6.6))
            boxes.append(Box((x0, 8, z0), (x1, 8.6, z1), brim, name="brim_c%d%d" % (sx, sz)))
    boxes.append(Box((-4.45, 8.6, -4.45), (4.45, 9.8, 4.45), band, faces=SIDES + ("up",), name="band"))
    # cone: straight for a while, then the tip droops backwards along a curved path
    base_y, base_z = 9.8, 0.0
    heading = 0.0
    n = 10
    for k in range(n):
        w = 4.1 * (1 - k / (n + 0.4))
        h = 1.3
        rot = None
        if heading:
            rot = {"axis": "x", "angle": heading, "origin": (0, base_y, base_z)}
        boxes.append(Box((-w, base_y, base_z - w), (w, base_y + h, base_z + w), cone, faces=NO_DOWN, rot=rot,
                         name="cone%d" % k))
        rad = math.radians(heading)
        base_y += h * math.cos(rad)
        base_z += h * math.sin(rad)
        if k >= 5:
            heading += 17
    return Hat("wizard_hat", boxes, frames=4, frametime=6)


# =============================================================================================== golden crown
def golden_crown():
    gold = rgb("#f6b92e")
    gold_paint = metal(gold, light=1.3, dark=0.66, seed=18)

    def band(t):
        c = gold_paint(t)
        if t.side and t.j == 0:
            c = mix(gold, rgb("#fff3b0"), 0.55)
        elif t.side and t.j == t.h - 1:
            c = shade(gold, 0.62)
        return c

    def velvet(t):
        c = fabric(rgb("#a3122a"), var=0.08, edge=1.0, seed=19)(t)
        if t.face == "up" and (t.i + t.j) % 3 == 0:
            c = shade(c, 1.15)
        return c

    def ermine(t):
        c = jitter(rgb("#f4f1ea"), 0.04, t.x, t.y, t.z)
        if (round(t.x * 2) + round(t.z * 2)) % 5 == 0 and t.face != "down":
            c = rgb("#1c1c1c")  # little black ermine tails
        return c

    boxes = ring(4.9, 0.55, 7.6, 10.1, band, "band")
    boxes += ring(5.05, 0.15, 7.45, 8.05, ermine, "ermine")
    boxes.append(Box((-4.3, 8.0, -4.3), (4.3, 9.7, 4.3), velvet, faces=NO_DOWN, name="velvet"))
    boxes.append(Box((-3.2, 9.7, -3.2), (3.2, 10.4, 3.2), velvet, faces=NO_DOWN, name="velvet_top"))
    boxes.append(Box((-0.7, 10.4, -0.7), (0.7, 11.3, 0.7), gem("#f6b92e"), faces=NO_DOWN, name="orb"))
    boxes.append(Box((-0.3, 11.3, -0.3), (0.3, 12.7, 0.3), gold_paint, faces=NO_DOWN, name="cross_v"))
    boxes.append(Box((-0.85, 11.8, -0.25), (0.85, 12.3, 0.25), gold_paint, faces=SIDES + ("up", "down"), name="cross_h"))

    pearl = gem("#f4f0ea")
    # tines: three stacked tiers that narrow to a point, topped with a pearl (a ruby on the front centre)
    for sx, sz in ((0, -1), (0, 1), (-1, 0), (1, 0), (-1, -1), (1, -1), (-1, 1), (1, 1)):
        corner = sx != 0 and sz != 0
        cx, cz = sx * 4.62, sz * 4.62
        tiers = ((1.0, 1.1), (0.62, 1.0), (0.3, 0.8)) if not corner else ((0.55, 0.9), (0.32, 0.8))
        y = 10.1
        for k, (hw, h) in enumerate(tiers):
            hx = hw if sx == 0 else 0.275
            hz = hw if sz == 0 else 0.275
            if corner:
                hx = hz = hw * 0.6
            boxes.append(Box((cx - hx, y, cz - hz), (cx + hx, y + h, cz + hz), gold_paint, faces=NO_DOWN, name="tine"))
            y += h
        ball = 0.62 if (sx, sz) == (0, -1) else 0.42
        paint = gem("#e0283c") if (sx, sz) == (0, -1) else pearl
        boxes.append(Box((cx - ball, y, cz - ball), (cx + ball, y + 2 * ball, cz + ball), paint, density=2, name="ball"))
    jewels = [
        ((-0.75, 8.25, -5.2), (0.75, 9.55, -4.9), "#2fd66b"),
        ((-3.4, 8.5, -5.1), (-2.3, 9.3, -4.9), "#2e6fe0"),
        ((2.3, 8.5, -5.1), (3.4, 9.3, -4.9), "#2e6fe0"),
        ((-0.65, 8.3, 4.9), (0.65, 9.5, 5.15), "#2fd66b"),
        ((-5.15, 8.3, -0.65), (-4.9, 9.5, 0.65), "#e0283c"),
        ((4.9, 8.3, -0.65), (5.15, 9.5, 0.65), "#e0283c"),
    ]
    for frm, to, col in jewels:
        boxes.append(Box(frm, to, gem(col), density=2, name="jewel"))
    return Hat("golden_crown", boxes)


# =============================================================================================== flower crown
def flower_crown():
    vine = rgb("#3f8f3a")

    def vine_paint(t):
        c = jitter(vine, 0.12, t.x, t.y, t.z)
        if (t.i + t.j) % 3 == 0:
            c = shade(c, 0.8)
        return c

    boxes = ring(4.85, 0.5, 7.9, 8.6, vine_paint, "vine")
    flowers = [
        ("#e33b3b", "#2b1a10"),   # poppy
        ("#ffd83b", "#f29516"),   # dandelion
        ("#4f7df0", "#1d2d6b"),   # cornflower
        ("#f7f7f2", "#f2c12e"),   # oxeye daisy
        ("#f48bb6", "#fff0a0"),   # pink tulip
        ("#b46ae8", "#5a2a8a"),   # allium
    ]
    spots = []
    r = 4.6
    for k in range(14):
        a = k / 14.0 * math.tau + 0.2
        # walk along the square ring perimeter instead of a circle
        x, z = math.cos(a), math.sin(a)
        m = max(abs(x), abs(z))
        spots.append((x / m * r, z / m * r))
    for k, (x, z) in enumerate(spots):
        petal, centre = flowers[(k * 5) % len(flowers)]
        big = 0.95 if k % 3 else 1.15
        y0 = 8.35
        petal_c = rgb(petal)

        def petal_paint(t, petal_c=petal_c, cx=x, cz=z):
            c = jitter(petal_c, 0.06, t.x, t.y, t.z)
            if t.face == "up" and ((t.x - cx) * (t.z - cz) > 0):
                c = shade(c, 1.1)
            if t.side:
                c = shade(c, 0.88)
            return c

        rot = {"axis": "y", "angle": 45 if k % 2 else 0, "origin": (x, y0, z)}
        boxes.append(Box((x - big, y0, z - big), (x + big, y0 + 0.55, z + big), petal_paint, density=2, rot=rot, name="petals"))
        boxes.append(Box((x - big * 0.42, y0 + 0.55, z - big * 0.42), (x + big * 0.42, y0 + 0.95, z + big * 0.42),
                         gem(centre), faces=NO_DOWN, density=2, rot=dict(rot), name="centre"))
        # a leaf poking out between flowers
        if k % 2 == 0:
            leaf_rot = {"axis": "y", "angle": -math.degrees(math.atan2(z, x)) + 25, "origin": (x, 8.2, z)}
            boxes.append(Box((x, 8.05, z - 0.35), (x + 1.9, 8.3, z + 0.35), lambda t: jitter(rgb("#5fb83f"), 0.1, t.x, t.z),
                             faces=("up", "down", "east"), density=2, rot=leaf_rot, name="leaf"))
    return Hat("flower_crown", boxes)


# =============================================================================================== pirate hat
def pirate_hat():
    felt = rgb("#1f1b22")
    gold = rgb("#d8a93a")
    skull = sprite_lookup([
        "w.......w",
        ".w.WWW.w.",
        "..WWWWW..",
        "..WkWkW..",
        "..WWWWW..",
        "...WkW...",
        "..w.W.w..",
        ".w.....w.",
        "w.......w",
    ], {"W": rgb("#f2efe4"), "w": rgb("#d9d4c4"), "k": rgb("#1a1414")}, 0.0, 12.9, scale=0.75)

    def flap(t):
        c = fabric(felt, var=0.05, edge=1.0, seed=21)(t)
        if t.face == "north":
            s = skull(t.x, t.y)
            if s:
                return s
        if t.side and t.j == 0 and t.box.name.startswith("front"):
            return metal(gold, seed=22)(t)
        if t.face == "up" and t.box.name.startswith("front"):
            return metal(gold, seed=23)(t)
        if t.face in ("east", "west") and t.box.name.startswith("front"):
            return shade(gold, 0.85)
        return c

    def back(t):
        c = fabric(felt, var=0.05, edge=1.0, seed=24)(t)
        if (t.side and t.j == 0) or t.face == "up":
            return shade(gold, 0.9)
        return c

    crown = fabric(felt, var=0.06, edge=0.9, seed=25)
    boxes = [
        Box((-4.65, 7.0, -4.65), (4.65, 10.8, 4.65), crown, faces=NO_DOWN, name="crown"),
        Box((-4.0, 10.8, -4.0), (4.0, 11.6, 4.0), crown, faces=NO_DOWN, name="crown_top"),
    ]
    front_rot = {"axis": "x", "angle": 12, "origin": (0, 7.0, -5.3)}
    for (x, y0, y1) in ((7.6, 6.8, 10.4), (6.6, 10.4, 11.9), (4.6, 11.9, 13.1), (2.2, 13.1, 13.8)):
        boxes.append(Box((-x, y0, -5.75), (x, y1, -4.9), flap, faces=SIDES + ("up", "down"), rot=dict(front_rot), name="front"))
    back_rot = {"axis": "x", "angle": -14, "origin": (0, 7.0, 5.3)}
    for (x, y0, y1) in ((7.2, 6.8, 9.6), (5.8, 9.6, 11.0), (3.4, 11.0, 12.0)):
        boxes.append(Box((-x, y0, 4.9), (x, y1, 5.7), back, faces=SIDES + ("up", "down"), rot=dict(back_rot), name="back"))
    return Hat("pirate_hat", boxes)


# =============================================================================================== viking helmet
def viking_helmet():
    steel = rgb("#a2abb5")
    steel_paint = metal(steel, light=1.25, dark=0.68, seed=26)
    bronze = rgb("#b98a3a")

    def rim(t):
        c = metal(bronze, light=1.25, dark=0.7, seed=27)(t)
        if t.side and t.j == t.h // 2 and t.i % 3 == 1:
            return mix(bronze, rgb("#fff2c0"), 0.6)  # rivets
        return c

    boxes = [
        Box((-4.75, 6.3, -4.75), (4.75, 9.0, 4.75), steel_paint, faces=NO_DOWN, name="dome"),
        Box((-4.0, 9.0, -4.0), (4.0, 9.9, 4.0), steel_paint, faces=NO_DOWN, name="dome2"),
        Box((-2.6, 9.9, -2.6), (2.6, 10.5, 2.6), steel_paint, faces=NO_DOWN, name="dome3"),
        Box((-0.55, 9.0, -4.2), (0.55, 10.75, 4.2), rim, faces=NO_DOWN, name="ridge"),
        Box((-4.98, 5.9, -4.98), (4.98, 7.0, 4.98), rim, name="rim"),
        Box((-0.6, 3.5, -5.3), (0.6, 7.0, -4.98), steel_paint, name="nose"),
    ]
    horn_c = rgb("#efe6cf")

    def horn(t):
        k = int(t.box.name[-1])
        c = mix(horn_c, rgb("#9c8c6c"), max(0.0, (k - 1) / 3.5))
        c = jitter(c, 0.05, t.x, t.y, t.z)
        if t.side and t.j % 2 == 0:
            c = shade(c, 0.93)  # growth rings
        if k == 0:
            return jitter(rgb("#6b4524"), 0.06, t.x, t.y, t.z) if t.i % 3 else shade(rgb("#6b4524"), 1.25)
        return c

    px, py = 4.6, 7.4
    heading = 8.0
    for k, (length, thick) in enumerate(((1.4, 2.0), (1.8, 1.75), (1.7, 1.45), (1.5, 1.15), (1.3, 0.85))):
        b = Box((px, py - thick / 2, -thick / 2), (px + length + 0.3, py + thick / 2, thick / 2), horn,
                rot={"axis": "z", "angle": heading, "origin": (px, py, 0)}, name="horn%d" % k)
        boxes.append(b)
        boxes.append(mirror_x(b, name="horn%d" % k))
        rad = math.radians(heading)
        px += math.cos(rad) * length
        py += math.sin(rad) * length
        heading += 22 if k else 14
    return Hat("viking_helmet", boxes)


# =============================================================================================== propeller cap
def _propeller_frames(size=32, frames=8):
    img = Image.new("RGBA", (size, size * frames), (0, 0, 0, 0))
    for f in range(frames):
        frame = Image.new("RGBA", (size * 4, size * 4), (0, 0, 0, 0))
        d = ImageDraw.Draw(frame)
        c = size * 2
        base = f / frames * math.pi
        # motion blur trail
        for trail in range(1, 5):
            a = base - trail * 0.12
            alpha = 70 - trail * 15
            for blade, col in ((0, (226, 59, 59)), (math.pi, (47, 111, 224))):
                ang = a + blade
                tip = (c + math.cos(ang) * c * 0.92, c + math.sin(ang) * c * 0.92)
                d.line([(c, c), tip], fill=(*col, alpha), width=int(size * 0.55))
        for blade, col in ((0, (226, 59, 59)), (math.pi, (47, 111, 224))):
            ang = base + blade
            tip = (c + math.cos(ang) * c * 0.92, c + math.sin(ang) * c * 0.92)
            d.line([(c, c), tip], fill=(*col, 255), width=int(size * 0.6))
            mid = (c + math.cos(ang) * c * 0.5 - math.sin(ang) * size * 0.12,
                   c + math.sin(ang) * c * 0.5 + math.cos(ang) * size * 0.12)
            d.line([(c, c), mid], fill=(255, 255, 255, 110), width=int(size * 0.14))
        small = frame.resize((size, size), Image.NEAREST)
        # quantize alpha so it stays crisp
        px = small.load()
        for y in range(size):
            for x in range(size):
                r, g, b, a = px[x, y]
                px[x, y] = (r, g, b, 0 if a < 30 else (255 if a > 200 else 120))
        img.paste(small, (0, f * size))
    return img


def propeller_cap():
    colours = [rgb("#e23b3b"), rgb("#ffd23f"), rgb("#2f6fe0"), rgb("#3fbf4f")]

    def panels(t):
        a = math.atan2(t.z, t.x) + math.pi / 4
        q = int(((a % math.tau) / math.tau) * 4) % 4
        c = jitter(colours[q], 0.05, t.x, t.y, t.z)
        if t.side and t.j == t.h - 1:
            c = shade(c, 0.8)
        return c

    def visor(t):
        c = fabric(rgb("#e23b3b"), var=0.04, edge=0.85, seed=28)(t)
        return shade(c, 0.8) if t.face == "down" else c

    def silver(t):
        return metal(rgb("#c9ced6"), seed=29)(t)

    boxes = [
        Box((-4.65, 6.8, -4.65), (4.65, 9.0, 4.65), panels, faces=NO_DOWN + ("down",), name="dome"),
        Box((-3.9, 9.0, -3.9), (3.9, 9.7, 3.9), panels, faces=NO_DOWN, name="dome2"),
        Box((-2.4, 9.7, -2.4), (2.4, 10.1, 2.4), panels, faces=NO_DOWN, name="dome3"),
        Box((-3.5, 6.8, -7.3), (3.5, 7.3, -4.65), visor, rot={"axis": "x", "angle": -8, "origin": (0, 7.3, -4.65)}, name="visor"),
        Box((-0.35, 10.1, -0.35), (0.35, 11.6, 0.35), silver, faces=SIDES, name="stem"),
        Box((-0.75, 11.6, -0.75), (0.75, 12.3, 0.75), lambda t: gem("#ffd23f")(t), name="hub"),
        Box((-6.2, 11.95, -6.2), (6.2, 11.95, 6.2), "#prop", faces=("up", "down"), name="blades"),
    ]
    frames = 8
    return Hat("propeller_cap", boxes,
               extra_textures={"prop": (_propeller_frames(32, frames), {"animation": {"frametime": 1}})})


# =============================================================================================== sunglasses
def sunglasses():
    gold = rgb("#e9b949")
    frame_paint = metal(gold, light=1.3, dark=0.75, seed=30)
    # 14 x 10 lens mask; column 0 = outer edge, column 13 = nose side.  F = frame, L = lens
    mask = [
        ".FFFFFFFFFFFF.",
        "FLLLLLLLLLLLLF",
        "FLLLLLLLLLLLLF",
        "FLLLLLLLLLLLF.",
        "FLLLLLLLLLLLF.",
        "FLLLLLLLLLLF..",
        ".FLLLLLLLLLF..",
        ".FLLLLLLLLF...",
        "..FLLLLLLF....",
        "...FFFFFF.....",
    ]

    def lens(t):
        if t.face not in ("north", "south"):
            return frame_paint(t)
        i = t.i
        mirrored = t.box.name.endswith("_mirror")
        if (t.face == "north") == mirrored:
            i = t.w - 1 - i
        ch = mask[t.j][i]
        if ch == ".":
            return None
        if ch == "F":
            return frame_paint(t)
        v = t.j / 9.0
        c = mix(rgb("#2a2350", 228), rgb("#d9733f", 228), min(1.0, v * 1.2))
        g = i + t.j * 0.8
        if 3.0 <= g < 4.6 or 6.0 <= g < 6.9:
            c = mix(c, rgb("#ffffff", 240), 0.5)
        return c

    lens_r = Box((0.45, 2.4, -5.02), (3.95, 4.9, -4.82), lens, faces=("north", "south"), density=4, name="lens_r")
    temple_r = Box((4.55, 4.35, -4.9), (4.78, 4.7, 1.2), frame_paint, faces=SIDES + ("up", "down"), density=2, name="temple_r")
    hinge_r = Box((3.9, 4.3, -5.05), (4.78, 4.85, -4.8), frame_paint, density=2, name="hinge_r")
    boxes = [
        lens_r, mirror_x(lens_r),
        Box((-3.5, 4.82, -5.08), (3.5, 5.1, -4.85), frame_paint, density=2, name="brow_bar"),
        Box((-0.6, 4.05, -5.06), (0.6, 4.3, -4.86), frame_paint, density=2, name="bridge"),
        temple_r, mirror_x(temple_r),
        hinge_r, mirror_x(hinge_r),
    ]
    return Hat("sunglasses", boxes)


# =============================================================================================== nerd glasses
def nerd_glasses():
    black = rgb("#1b1a1d")

    def frame(t):
        c = jitter(black, 0.08, t.x, t.y, t.z)
        if t.face == "up" or (t.face == "north" and t.j == 0):
            c = shade(rgb("#4a474f"), 1.0)
        return c

    def lens(t):
        c = rgb("#bfe6ff", 70)
        g = (t.fu + t.fv) * 6
        if 1.4 < g < 2.2:
            c = rgb("#ffffff", 150)
        return c

    def tape(t):
        c = jitter(rgb("#f3f0e6"), 0.04, t.x, t.y, t.z)
        if t.side and t.j % 2 == 1:
            c = shade(c, 0.9)
        return c

    z0, z1 = -5.05, -4.65
    right = [
        Box((0.4, 4.55, z0), (3.95, 5.1, z1), frame, density=2, name="top_r"),
        Box((0.4, 2.15, z0), (3.95, 2.65, z1), frame, density=2, name="bottom_r"),
        Box((0.4, 2.65, z0), (0.9, 4.55, z1), frame, faces=SIDES, density=2, name="inner_r"),
        Box((3.45, 2.65, z0), (3.95, 4.55, z1), frame, faces=SIDES, density=2, name="outer_r"),
        Box((0.9, 2.65, -4.88), (3.45, 4.55, -4.86), lens, faces=("north", "south"), density=2, name="lens_r"),
        Box((3.95, 4.2, z0), (4.75, 4.75, z1), frame, density=2, name="hinge_r"),
        Box((4.5, 4.25, z1), (4.75, 4.7, 1.3), frame, faces=SIDES + ("up", "down"), density=2, name="temple_r"),
    ]
    boxes = []
    for b in right:
        boxes += [b, mirror_x(b)]
    boxes.append(Box((-0.4, 3.8, -5.0), (0.4, 4.4, -4.7), frame, density=2, name="bridge"))
    boxes.append(Box((-0.55, 3.55, -5.15), (0.55, 4.65, -4.62), tape, density=4, name="tape"))
    return Hat("nerd_glasses", boxes)


# =============================================================================================== headphones
def headphones():
    red = rgb("#d8263a")
    shell_paint = fabric(red, var=0.03, edge=0.8, seed=31)
    black = rgb("#1e1e23")
    pad = fabric(black, var=0.08, edge=0.85, seed=32)
    def shell(t):
        if t.face in ("east", "west"):
            # the logo sits on the outer face of each cup
            u = t.i - (t.w - 3) // 2
            v = t.j - (t.h - 5) // 2
            if 0 <= u < 3 and 0 <= v < 5:
                ch = ["w..", "w..", "www", "w.w", "www"][v][u if t.face == "east" else 2 - u]
                if ch == "w":
                    return rgb("#f6f6f6")
        return shell_paint(t)

    def band(t):
        c = shell_paint(t)
        if t.face == "down":
            return pad(t)
        return c

    def silver(t):
        return metal(rgb("#cfd3da"), seed=33)(t)

    corner_r = Box((3.2, 8.2, -0.85), (4.9, 8.9, 0.85), band, rot={"axis": "z", "angle": -42, "origin": (3.55, 8.55, 0)},
                   name="corner_r")
    right = [
        Box((4.62, 5.4, -0.75), (5.32, 7.9, 0.75), band, name="side_r"),
        corner_r,
        Box((4.55, 2.1, -2.05), (5.35, 6.0, 2.05), pad, name="cushion_r"),
        Box((5.35, 2.4, -1.75), (6.55, 5.7, 1.75), shell, name="cup_r"),
        Box((5.95, 5.6, -0.45), (6.35, 6.6, 0.45), silver, name="yoke_r"),
    ]
    boxes = [Box((-3.6, 8.6, -0.85), (3.6, 9.3, 0.85), band, name="band_top")]
    for b in right:
        boxes += [b, mirror_x(b, name=b.name.replace("_r", "_l"))]
    return Hat("headphones", boxes)


ALL = [top_hat, cowboy_hat, baseball_cap, snapback_cap, beanie, party_hat, chef_hat, wizard_hat, golden_crown,
       flower_crown, pirate_hat, viking_helmet, propeller_cap, sunglasses, nerd_glasses, headphones]


def build(only=None):
    for fn in ALL:
        if only and fn.__name__ not in only:
            continue
        fn().build()
