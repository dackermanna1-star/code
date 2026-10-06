"""Equipment textures (64x32 classic armor layout) + equipment asset JSON for every garment.

Writes:
  equipment/<id>.json
  textures/entity/equipment/humanoid/<id>.png            (tops: body + arms; shoes: leg boxes)
  textures/entity/equipment/humanoid_leggings/<id>.png   (pants: legs + waist rows of the body box)

Armor meshes in 1.21.11: CHEST = body + arms, LEGS = body + legs (humanoid_leggings), FEET = legs only (humanoid).
Face coordinates used by painters: i = column (0 = left edge as seen when looking at that face), j = row (0 = top).
For the front face, column 0 is on the wearer's right. Sides wrap around: right side -> front -> left side -> back.
"""
import math

from PIL import Image

from lib import NS, hash01, jitter, mix, rgb, shade, write_json, write_png

TRANSPARENT = None


class Canvas:
    """A 64x32 armor texture with helpers that address box faces by part + face name."""
    PARTS = {
        # name: (u, v, w, h, d)
        "head": (0, 0, 8, 8, 8),
        "body": (16, 16, 8, 12, 4),
        "arm": (40, 16, 4, 12, 4),
        "leg": (0, 16, 4, 12, 4),
    }

    def __init__(self):
        self.img = Image.new("RGBA", (64, 32), (0, 0, 0, 0))
        self.px = self.img.load()

    @staticmethod
    def faces(part):
        u, v, w, h, d = Canvas.PARTS[part]
        return {
            "top": (u + d, v, w, d),
            "bottom": (u + d + w, v, w, d),
            "right": (u, v + d, d, h),
            "front": (u + d, v + d, w, h),
            "left": (u + d + w, v + d, d, h),
            "back": (u + 2 * d + w, v + d, w, h),
        }

    def paint(self, part, painter, faces=None):
        """painter(face, i, j, w, h) -> RGBA tuple or None."""
        for face, (x, y, w, h) in self.faces(part).items():
            if faces and face not in faces:
                continue
            for j in range(h):
                for i in range(w):
                    c = painter(face, i, j, w, h)
                    if c is not None:
                        self.px[x + i, y + j] = c if len(c) == 4 else (*c, 255)


def around(face, i, w):
    """Horizontal coordinate that wraps continuously around a box (right -> front -> left -> back)."""
    order = {"right": 0, "front": 1, "left": 2, "back": 3}
    return order.get(face, 0) * 100 + i


def cloth(base, var=0.06, seed=0):
    base = rgb(base) if isinstance(base, str) else base

    def f(face, i, j, w, h):
        c = jitter(base, var, around(face, i, w), j, seed)
        if face == "top":
            c = shade(c, 1.08)
        elif face == "bottom":
            c = shade(c, 0.78)
        return c
    return f


def twill(base, seed=0):
    """Denim: diagonal twill lines + faded highlights."""
    base = rgb(base) if isinstance(base, str) else base

    def f(face, i, j, w, h):
        a = around(face, i, w)
        c = shade(base, 1.06 if (a + j) % 3 == 0 else 0.97)
        c = jitter(c, 0.05, a, j, seed)
        if hash01(a, j, seed, 9) > 0.9:
            c = mix(c, rgb("#c8d8f0"), 0.25)  # wash specks
        if face == "bottom":
            c = shade(c, 0.8)
        return c
    return f


# =============================================================================================== tops
def hoodie():
    """Greyscale base (tinted by the dye colour, default charcoal) + untinted overlay (drawstrings)."""
    base = Canvas()
    g = rgb("#e6e6e6")
    fab = cloth(g, var=0.035, seed=1)

    def torso(face, i, j, w, h):
        c = fab(face, i, j, w, h)
        if face == "front":
            if j == 0 and 2 <= i <= 5:
                return shade(g, 0.55)                      # neck opening
            if j <= 1 and (i in (1, 6) or (j == 1 and i in (2, 5))):
                return shade(g, 1.05)                      # hood rim around the neck
            if 6 <= j <= 9 and 1 <= i <= 6:                # kangaroo pocket
                if j == 6 or i in (1, 6):
                    return shade(g, 0.72)
                return shade(c, 0.94)
        if face == "back":
            # the hood hanging down the back
            if j <= 4 and 1 <= i <= 6:
                edge = j == 4 or i in (1, 6) or (j == 3 and i in (2, 5))
                if j == 4 and i in (1, 6):
                    return c
                return shade(g, 0.74) if edge else shade(c, 1.04)
        if j == h - 1 and face in ("front", "back", "left", "right"):
            return shade(g, 0.78 if i % 2 else 0.7)       # ribbed hem
        return c

    def sleeve(face, i, j, w, h):
        c = fab(face, i, j, w, h)
        if j >= h - 2 and face not in ("top", "bottom"):
            return shade(g, 0.8 if i % 2 else 0.72)       # ribbed cuff
        if face in ("right", "left") and j > 1 and i == 1:
            return shade(c, 0.93)                          # seam
        return c

    base.paint("body", torso)
    base.paint("arm", sleeve)

    over = Canvas()

    def strings(face, i, j, w, h):
        if face == "front" and i in (2, 5) and 1 <= j <= 5:
            return rgb("#c9c9c9") if j == 5 else rgb("#f6f6f6")
        return None

    over.paint("body", strings)
    return {"humanoid": [base.img, over.img]}


def _tee(base_colour, front_art, collar, sleeve_rows=4, hem=None, mottled=False, seed=0):
    cv = Canvas()
    base = rgb(base_colour)
    hem = rgb(hem) if hem else shade(base, 0.8)
    collar = rgb(collar) if collar else shade(base, 0.75)

    def fab(face, i, j, w, h):
        c = cloth(base, var=0.05, seed=seed)(face, i, j, w, h)
        if mottled:
            r = hash01(around(face, i, w), j, seed, 3)
            if r > 0.82:
                c = shade(base, 1.18)
            elif r < 0.15:
                c = shade(base, 0.82)
        return c

    def torso(face, i, j, w, h):
        if face == "front":
            if j == 0 and 2 <= i <= 5:
                return collar
            art = front_art(i, j)
            if art:
                return art
        if face == "back" and j == 0 and 2 <= i <= 5:
            return collar
        if j == h - 1 and face not in ("top", "bottom"):
            return hem
        return fab(face, i, j, w, h)

    def sleeve(face, i, j, w, h):
        if face == "bottom":
            return None
        if face != "top" and j >= sleeve_rows:
            return None
        if face != "top" and j == sleeve_rows - 1:
            return hem
        return fab(face, i, j, w, h)

    cv.paint("body", torso)
    cv.paint("arm", sleeve)
    return {"humanoid": [cv.img]}


def creeper_tee():
    face = [
        "........",
        "........",
        ".xx..xx.",
        ".xx..xx.",
        "...xx...",
        "..xxxx..",
        "..xxxx..",
        "..x..x..",
    ]

    def art(i, j):
        r = j - 1
        if 0 <= r < len(face) and face[r][i] == "x":
            return rgb("#16301a") if (i + r) % 3 else rgb("#22422a")
        return None
    return _tee("#5fbf4a", art, "#3f8f33", mottled=True, seed=2)


def emerald_tee():
    art_rows = [
        "........",
        "........",
        ".i.rr.rr",
        ".i.rRrrr",
        ".i..rrr.",
        ".i...r..",
        "........",
        "...GG...",
        "..GggE..",
        "..gggE..",
        "...EE...",
    ]
    pal = {"i": rgb("#222222"), "r": rgb("#e0283c"), "R": rgb("#ff8a96"), "G": rgb("#a8ffcb"),
           "g": rgb("#2fbf5f"), "E": rgb("#17803c")}

    def art(i, j):
        if j < len(art_rows):
            ch = art_rows[j][i]
            if ch != ".":
                return pal[ch]
        return None
    return _tee("#f2f2ee", art, "#2fbf5f", hem="#2fbf5f", seed=3)


def hawaiian_shirt():
    cv = Canvas()
    base = rgb("#f07a2a")
    petals = [rgb("#ff4f8a"), rgb("#e8283c"), rgb("#ffe14a")]
    leaf_a, leaf_b = rgb("#1f7a44"), rgb("#3fae66")

    def pattern(face, i, j, w, h, seed):
        a = around(face, i, w)
        cell_x, cell_y = a // 4, j // 4
        lx, ly = a % 4, j % 4
        ox = int(hash01(cell_x, cell_y, seed, 7) * 2)
        oy = int(hash01(cell_x, cell_y, seed, 8) * 2)
        dx, dy = lx - ox, ly - oy
        kind = hash01(cell_x, cell_y, seed, 2)
        if kind < 0.5:  # hibiscus: plus-shaped petals around a centre
            col = petals[int(hash01(cell_x, cell_y, seed, 3) * 3)]
            if (dx, dy) == (1, 1):
                return rgb("#fff3c0") if col == petals[2] else rgb("#ffd23f")
            if (dx == 1 and 0 <= dy <= 2) or (dy == 1 and 0 <= dx <= 2):
                return col
        elif kind < 0.8:  # leaf sprig
            if (dx, dy) in ((0, 0), (1, 1)):
                return leaf_a
            if (dx, dy) == (1, 0):
                return leaf_b
        c = jitter(base, 0.05, a, j, seed)
        if face == "bottom":
            c = shade(c, 0.8)
        return c

    def torso(face, i, j, w, h):
        if face == "front":
            if (j == 0 and 2 <= i <= 5) or (j == 1 and 3 <= i <= 4):
                return None                     # open collar shows the chest
            if (j <= 1 and i in (1, 6)) or (j == 2 and i in (2, 5)):
                return rgb("#fff3e0")          # collar points
            if i == 4 and j in (4, 7, 10):
                return rgb("#fff3e0")          # buttons
        if j == h - 1 and face not in ("top", "bottom"):
            return shade(base, 0.82)
        return pattern(face, i, j, w, h, 4)

    def sleeve(face, i, j, w, h):
        if face == "bottom" or (face != "top" and j >= 5):
            return None
        if face != "top" and j == 4:
            return shade(base, 0.82)
        return pattern(face, i, j, w, h, 5)

    cv.paint("body", torso)
    cv.paint("arm", sleeve)
    return {"humanoid": [cv.img]}


def denim_jacket():
    cv = Canvas()
    blue = rgb("#3c64a8")
    den = twill(blue, seed=6)
    stitch = rgb("#d8a050")
    brass = rgb("#d8a93a")
    shirt = rgb("#f2f2ec")

    def torso(face, i, j, w, h):
        c = den(face, i, j, w, h)
        if face == "front":
            if 3 <= i <= 4:
                if j == 0:
                    return shade(shirt, 0.8)
                return jitter(shirt, 0.03, i, j)              # white tee underneath
            if j <= 2 and i in (1, 2, 5, 6):                   # big collar
                if (j == 2 and i in (1, 6)):
                    return c
                return shade(mix(blue, rgb("#86aee6"), 0.35), 1.0 if i in (2, 5) else 0.92)
            if j in (3, 4) and i in (0, 1, 6, 7):              # chest pocket flaps
                if j == 3:
                    return shade(blue, 0.78)
                return brass if i in (1, 6) else c
            if i in (2, 5) and j in (6, 8):                    # buttons along the opening
                return brass
            if i in (2, 5):
                return shade(c, 0.85)
            if j == h - 1:
                return shade(blue, 0.75) if i % 3 else stitch
        if face == "back":
            if j == 3:
                return shade(blue, 0.78)                             # yoke seam
            if j == 4 and i in (0, 2, 5, 7):
                return mix(shade(blue, 0.9), stitch, 0.45)           # stitching under the yoke
            if j >= 5 and i in (1, 6) and j < h - 1:
                return shade(c, 0.9)
            if j == h - 1:
                return shade(blue, 0.75)
        if face in ("left", "right") and j == h - 1:
            return shade(blue, 0.75)
        return c

    def sleeve(face, i, j, w, h):
        c = den(face, i, j, w, h)
        if face == "bottom":
            return shade(blue, 0.7)
        if j >= h - 2 and face != "top":
            if face == "front" and j == h - 2 and i == 1:
                return brass
            return shade(blue, 0.8)
        if face == "back" and i == 1 and 0 < j < h - 2:
            return shade(c, 0.9)
        return c

    cv.paint("body", torso)
    cv.paint("arm", sleeve)
    return {"humanoid": [cv.img]}


def tuxedo_jacket():
    cv = Canvas()
    black = rgb("#1c1b22")
    satin = rgb("#34323f")
    shirt = rgb("#fbfbf8")
    tux = cloth(black, var=0.04, seed=7)

    def torso(face, i, j, w, h):
        c = tux(face, i, j, w, h)
        if face == "front":
            # white shirt "V" that narrows towards the waist
            half = {0: 2, 1: 2, 2: 2, 3: 1, 4: 1, 5: 1, 6: 0, 7: 0}.get(j, -1)
            if half >= 0 and 3 - half <= i <= 4 + half:
                if j == 1 and 2 <= i <= 5:
                    return rgb("#0d0d10") if i in (2, 5) or j == 1 else shirt     # bow tie
                if j == 0 and i in (3, 4):
                    return rgb("#e8e8e2")
                if i in (3, 4) and j in (3, 5):
                    return rgb("#202024")                                          # shirt studs
                return shirt
            # satin lapels hugging the V
            if half >= 0 and (i == 3 - half - 1 or i == 4 + half + 1):
                return mix(satin, rgb("#5a5868"), 0.25 if i < 4 else 0.0)
            if j == 3 and i == 6:
                return rgb("#d8263a")      # red pocket square
            if j == 8 and i in (3, 4):
                return rgb("#3e3b48") if i == 3 else c   # single button
            if j >= 9 and i in (3, 4):
                return shade(c, 0.8)       # jacket opening below the button
        if face == "back" and j >= 8 and i in (3, 4):
            return shade(c, 0.7 if i == 4 else 0.9)      # centre vent
        return c

    def sleeve(face, i, j, w, h):
        c = tux(face, i, j, w, h)
        if face == "bottom":
            return shirt
        if j == h - 1 and face != "top":
            return shirt                   # shirt cuffs peeking out
        if j == h - 2 and face == "front" and i == 2:
            return rgb("#e9b949")          # cufflink
        return c

    cv.paint("body", torso)
    cv.paint("arm", sleeve)
    return {"humanoid": [cv.img]}


# =============================================================================================== bottoms
def jeans():
    cv = Canvas()
    blue = rgb("#3a5a96")
    den = twill(blue, seed=8)
    stitch = rgb("#d8a050")
    brass = rgb("#d8a93a")

    def legs(face, i, j, w, h):
        c = den(face, i, j, w, h)
        if face == "top":
            return shade(blue, 0.9)
        if 4 <= j <= 7 and face == "front":
            c = mix(c, rgb("#9ab8e6"), 0.18 + (0.1 if i in (1, 2) else 0))  # faded knees
        if face == "front" and j <= 2 and i == 0 and j >= 1:
            return shade(blue, 0.7)                                         # front pocket opening
        if face == "back" and 1 <= j <= 3 and 1 <= i <= 2:
            return stitch if j == 1 or (j == 3 and i == 1) else shade(c, 0.92)   # back pocket
        if face == "right" and i == 2 and 0 < j < h - 1:
            return stitch if j % 2 else shade(c, 0.9)                       # outseam
        if j == h - 1 and face not in ("top", "bottom"):
            return shade(mix(blue, rgb("#86aee6"), 0.3), 0.95)             # rolled hem
        if face == "bottom":
            return shade(blue, 0.6)
        return c

    def waist(face, i, j, w, h):
        if face in ("top", "bottom"):
            return None
        if j < h - 2:
            return None
        belt = rgb("#6b4523")
        if face == "front" and j == h - 2 and i in (3, 4):
            return brass if i == 3 else shade(brass, 0.8)
        if j == h - 2:
            return jitter(belt, 0.06, around(face, i, w), j) if (around(face, i, w) % 5) else shade(belt, 0.7)
        c = den(face, i, j, w, h)
        if face == "front" and i in (3, 4):
            return shade(c, 0.85)
        return c

    cv.paint("leg", legs)
    cv.paint("body", waist)
    return {"humanoid_leggings": [cv.img]}


def cargo_shorts():
    cv = Canvas()
    khaki = rgb("#b8a46a")
    fab = cloth(khaki, var=0.05, seed=9)
    length = 7

    def legs(face, i, j, w, h):
        if face == "bottom" or (face != "top" and j >= length):
            return None
        c = fab(face, i, j, w, h)
        if face != "top" and j == length - 1:
            return shade(khaki, 0.78)                             # hem
        if face == "right" and 2 <= j <= 5:                       # big cargo pocket on the outside
            if j == 2:
                return shade(khaki, 0.7)                          # flap
            if j == 3 and i == 1:
                return rgb("#5a4a2a")                             # snap
            return shade(c, 0.9) if i in (0, 3) else c
        if face == "front" and j == 0 and i == 0:
            return shade(khaki, 0.7)
        return c

    def waist(face, i, j, w, h):
        if face in ("top", "bottom") or j < h - 1:
            return None
        if face == "front" and i in (3, 4):
            return rgb("#5a4a2a") if i == 3 else shade(khaki, 0.8)
        return shade(khaki, 0.85)

    cv.paint("leg", legs)
    cv.paint("body", waist)
    return {"humanoid_leggings": [cv.img]}


def sweatpants():
    cv = Canvas()
    grey = rgb("#8c8c94")

    def heather(face, i, j, w, h):
        a = around(face, i, w)
        r = hash01(a, j, 10)
        c = shade(grey, 0.9 + 0.22 * r)
        if face == "top":
            c = shade(c, 1.05)
        return c

    def legs(face, i, j, w, h):
        if face == "bottom":
            return shade(grey, 0.6)
        if face != "top" and j >= h - 2:
            return shade(grey, 0.72 if i % 2 else 0.64)          # elastic cuffs
        if face == "right" and i in (1, 2) and face != "top":
            return rgb("#f0f0f0") if i == 1 else rgb("#d8d8dc")   # side stripes
        if face == "front" and j <= 1 and i == 3:
            return rgb("#f6f6f6") if j == 0 else rgb("#d0d0d0")   # drawstring ends hanging down
        return heather(face, i, j, w, h)

    def waist(face, i, j, w, h):
        if face in ("top", "bottom") or j < h - 2:
            return None
        if face == "front" and i in (3, 4) and j == h - 2:
            return rgb("#f6f6f6")
        return shade(grey, 0.75 if (around(face, i, w) % 2) else 0.68)

    cv.paint("leg", legs)
    cv.paint("body", waist)
    return {"humanoid_leggings": [cv.img]}


# =============================================================================================== shoes
def sneakers():
    cv = Canvas()
    white = rgb("#f8f8f8")
    red = rgb("#e0283c")
    sole = rgb("#c4c4cc")

    def feet(face, i, j, w, h):
        if face == "top":
            return None
        if face == "bottom":
            return shade(sole, 0.75) if (i + j) % 2 else sole     # tread
        if j < 7:
            return None
        if j == 7:
            return rgb("#ffffff") if face != "back" else rgb("#f0f0f0")     # crew socks
        if j == 8 and face in ("right", "left", "back"):
            return rgb("#e8e8ec")
        if j == h - 1:
            return sole if (face != "front" or i % 3) else shade(sole, 0.85)
        if face == "front":
            if j == 8:
                return rgb("#d8d8de") if i in (0, 3) else rgb("#ffffff")      # tongue
            if j == 9:
                return rgb("#b8b8c2") if i in (1, 2) else rgb("#f2f2f2")      # laces
            return white
        if face == "right" and j in (9, 10):                       # stripe on the outer side
            if (j == 10 and i <= 2) or (j == 9 and 1 <= i <= 3):
                return red
        if face == "back" and j in (9, 10) and i in (1, 2):
            return red                                             # heel tab
        return jitter(white, 0.02, face == "left", i, j)

    cv.paint("leg", feet)
    return {"humanoid": [cv.img]}


def cowboy_boots():
    cv = Canvas()
    leather = rgb("#7a4a24")
    tan = rgb("#b98250")
    fab = cloth(leather, var=0.07, seed=11)

    def feet(face, i, j, w, h):
        if face == "top":
            return None
        if face == "bottom":
            return shade(leather, 0.5)
        if j < 4:
            return None
        if j == 4:
            if face in ("left", "right") and i in (1, 2):
                return shade(leather, 0.65)       # pull-on tabs
            return shade(leather, 0.78)
        if j == h - 1:
            return rgb("#2e1a0b")                  # sole
        if face == "back" and j >= h - 3:
            if j == h - 2 and i in (0, 3):
                return rgb("#d4d8de")              # spurs
            return shade(leather, 0.62)            # heel
        c = fab(face, i, j, w, h)
        # decorative stitching swirls on the shaft
        if face in ("front", "right", "left") and 5 <= j <= 7:
            if (j == 5 and i in (1, 2)) or (j in (6, 7) and i in (0, 3)):
                return mix(c, tan, 0.7)
        if face == "front" and j == h - 2:
            return shade(c, 1.15)                  # toe shine
        return c

    cv.paint("leg", feet)
    return {"humanoid": [cv.img]}


def bunny_slippers():
    cv = Canvas()
    pink = rgb("#f7a8c8")

    def fluff(face, i, j, seed):
        r = hash01(i, j, seed, face == "back")
        return shade(pink, 0.92 + 0.18 * r)

    def feet(face, i, j, w, h):
        if face == "top":
            return None
        if face == "bottom":
            return rgb("#ffffff") if (i + j) % 2 else rgb("#f0e6ea")
        if face == "front":
            if j in (6, 7):
                if i in (0, 3):
                    return rgb("#ffd1e3") if j == 6 else pink       # floppy ears
                return None
            if j < 6:
                return None
            if j == 9 and i in (0, 3):
                return rgb("#2a1a20")                                # eyes
            if j == 10 and i in (1, 2):
                return rgb("#ff5a8a")                                # nose
            if j == 11:
                return rgb("#ffffff")
            return fluff(face, i, j, 12)
        if j < 8:
            return None
        if j == h - 1:
            return rgb("#ffffff")
        if face == "back" and j in (9, 10) and i in (1, 2):
            return rgb("#ffffff")                                    # cotton tail
        return fluff(face, i, j, 13)

    cv.paint("leg", feet)
    return {"humanoid": [cv.img]}


HOODIE_UNDYED = 0x2C2B33

GARMENTS = [hoodie, creeper_tee, emerald_tee, denim_jacket, tuxedo_jacket, hawaiian_shirt,
            jeans, cargo_shorts, sweatpants, sneakers, cowboy_boots, bunny_slippers]


def build():
    out = {}
    for fn in GARMENTS:
        item_id = fn.__name__
        layers = fn()
        asset = {"layers": {}}
        for layer_type, images in layers.items():
            entries = []
            for k, img in enumerate(images):
                name = item_id if k == 0 else "%s_overlay" % item_id
                write_png(img, "textures", "entity", "equipment", layer_type, name + ".png")
                entry = {"texture": NS + ":" + name}
                if item_id == "hoodie" and k == 0:
                    entry["dyeable"] = {"color_when_undyed": HOODIE_UNDYED}
                entries.append(entry)
            asset["layers"][layer_type] = entries
        write_json(asset, "equipment", item_id + ".json")
        out[item_id] = layers
    return out
