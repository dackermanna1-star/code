"""S-2B The Sketchbook - a monochrome world drawn in pencil and ink on notebook paper."""
import math

import numpy as np
from PIL import Image

from gen.content import sky_art
from gen.content.dsl import *
from gen.noise import fbm, rng

# ------------------------------------------------------------------------------------------------ palette
PAPER = "#f4f1ea"
PAPER_SHADE = "#e4e0d6"
PENCIL = "#8a8a86"
GRAPHITE = "#4a4a48"
INK = "#1c1c1e"
RULE_BLUE = "#9fb8dc"
ERASER = ["#c86a7e", "#e08a9c", "#f0a8b6", "#fac8d0"]


# ------------------------------------------------------------------------------------------------ helpers
def _hex(c):
    c = c.lstrip("#")
    return np.array([int(c[i:i + 2], 16) for i in (0, 2, 4)], float)


def _img(a):
    return Image.fromarray(np.clip(np.round(a), 0, 255).astype(np.uint8), "RGBA")


def _paper(seed, base=PAPER, grain=0.06):
    """Paper with a soft fibre grain."""
    a = np.zeros((16, 16, 4), float)
    a[..., 3] = 255
    n = fbm(16, 16, 4, seed + ":paper", 2) - 0.5
    w = rng(seed + ":fibre").random((16, 16)) - 0.5
    a[..., :3] = _hex(base) * (1 + grain * n[..., None] + grain * 0.6 * w[..., None])
    return a


def _put(a, x, y, col, k=1.0):
    if 0 <= x < 16 and 0 <= y < 16:
        a[y, x, :3] = a[y, x, :3] * (1 - k) + _hex(col) * k
        a[y, x, 3] = 255


def _hatch(a, R, col, x0, y0, n, ln, k=0.7, slope=1):
    for i in range(n):
        for j in range(ln):
            _put(a, x0 + i * 2 + j, y0 - slope * j, col, k)


# ------------------------------------------------------------------------------------------------ block textures
def ruled_paper(seed, hatch=0.0, rules=True):
    """Notebook paper: faint blue rules every 4 px (tiles seamlessly across the ground), pencil grass strokes."""
    a = _paper(seed)
    if rules:
        for y in (3, 7, 11, 15):
            for x in range(16):
                _put(a, x, y, RULE_BLUE, 0.55)
    R = rng(seed + ":strokes")
    # little pencil tick-strokes, like quick grass marks
    for _ in range(int(R.integers(3, 6))):
        x, y = int(R.integers(0, 15)), int(R.integers(1, 15))
        _put(a, x, y, PENCIL, 0.8)
        _put(a, x + 1, y - 1, PENCIL, 0.6)
    if hatch > 0:
        for _ in range(int(3 + hatch * 6)):
            x, y = int(R.integers(0, 14)), int(R.integers(2, 16))
            _hatch(a, R, GRAPHITE, x, y, int(R.integers(2, 4)), 3, 0.35 + 0.3 * hatch)
    return _img(a)


def paper_side(seed, hatch=0.0):
    """Side of a paper turf block: blank paper below, an inked top edge with drooping pencil grass."""
    a = _paper(seed + ":side", PAPER)
    R = rng(seed + ":side")
    for x in range(16):
        _put(a, x, 0, INK, 0.9)
        d = int(R.integers(1, 4))
        for y in range(1, d + 1):
            _put(a, x, y, GRAPHITE if (x + y) % 3 else PENCIL, 0.55 + hatch * 0.3)
    for _ in range(3):
        x, y = int(R.integers(0, 14)), int(R.integers(7, 14))
        _put(a, x, y, PENCIL, 0.5)
        _put(a, x + 1, y, PENCIL, 0.5)
    return _img(a)


def crosshatch(seed, base=PAPER_SHADE, density=0.5, outline=True, ink=INK):
    """Graphite crosshatching in patches, block outlined in ink like a drawn cube."""
    a = _paper(seed, base)
    R = rng(seed + ":ch")
    n = fbm(16, 16, 5, seed + ":tone", 2)
    yy, xx = np.mgrid[0:16, 0:16]
    d1 = ((xx + yy) % 3 == 0) & (n > 1.0 - 0.6 * density)
    d2 = ((xx - yy) % 3 == 0) & (n > 1.0 - 0.4 * density)
    a[d1, :3] = a[d1, :3] * 0.45 + _hex(GRAPHITE) * 0.55
    a[d2, :3] = a[d2, :3] * 0.4 + _hex(GRAPHITE) * 0.6
    if outline:
        e = np.minimum(np.minimum(xx, yy), np.minimum(15 - xx, 15 - yy))
        a[e == 0, :3] = _hex(ink)
        wob = R.random((16, 16)) < 0.18
        a[(e == 1) & wob, :3] = _hex(GRAPHITE)
    return _img(a)


def pencil_bark(seed):
    """Tree trunk as a pencil drawing: two inked edges, wavy vertical bark hatching."""
    a = _paper(seed)
    R = rng(seed + ":bark")
    for x in (0, 15):
        for y in range(16):
            _put(a, x, y, INK, 0.95)
    for k in range(4):
        x = 2.5 + k * 3.2 + R.uniform(-0.6, 0.6)
        for y in range(16):
            if R.random() < 0.85:
                _put(a, int(round(x + 0.6 * math.sin(y * 0.7 + k * 2))), y, GRAPHITE if k % 2 else PENCIL, 0.75)
    for _ in range(2):
        x, y = int(R.integers(3, 12)), int(R.integers(2, 13))
        for dx, dy in ((0, 0), (1, 0), (0, 1), (1, 1), (-1, 0), (2, 1)):
            _put(a, x + dx, y + dy, INK, 0.6)   # knots
    return _img(a)


def rings_doodle(seed):
    """Log end drawn as concentric ink rings on paper."""
    a = _paper(seed)
    yy, xx = np.mgrid[0:16, 0:16]
    d = np.hypot(xx - 7.5, yy - 7.5)
    for r in (2.2, 4.6, 7.0):
        m = np.abs(d - r) < 0.55
        a[m, :3] = a[m, :3] * 0.3 + _hex(GRAPHITE) * 0.7
    e = np.minimum(np.minimum(xx, yy), np.minimum(15 - xx, 15 - yy))
    a[e == 0, :3] = _hex(INK)
    return _img(a)


def scribble_leaves(seed):
    """Foliage drawn as looping pencil scribbles over paper, with gaps."""
    a = _paper(seed, PAPER)
    R = rng(seed + ":scr")
    alpha = np.full((16, 16), 255.0)
    holes = rng(seed + ":holes").random((16, 16)) < 0.16
    alpha[holes] = 0
    for k in range(4):
        cx, cy = R.uniform(2, 14), R.uniform(2, 14)
        r = R.uniform(1.6, 3.2)
        ph = R.uniform(0, 6.28)
        for t in np.linspace(0, 2 * math.pi * 1.6, 28):
            rr = r * (0.75 + 0.25 * math.sin(3 * t + ph))
            x, y = int(round(cx + rr * math.cos(t + ph))) % 16, int(round(cy + rr * math.sin(t + ph))) % 16
            a[y, x, :3] = _hex(PENCIL if k % 2 else GRAPHITE)
            alpha[y, x] = 255
    a[..., 3] = alpha
    return _img(a)


def doodle_flower(seed, petals=6):
    """A daisy drawn in ink outline on a single-stroke stem (cross sprite)."""
    a = np.zeros((16, 16, 4), float)
    R = rng(seed)
    cx, cy = 7.5 + R.choice([-1, 0, 1]), 5.0
    for y in range(int(cy) + 2, 16):
        _put(a, int(round(cx + 0.6 * math.sin(y * 0.5))), y, INK)
    lx = int(round(cx + 0.6 * math.sin(11 * 0.5)))
    for dx in (1, 2):
        _put(a, lx + dx, 12 - dx + 1, INK)        # one leaf stroke
    for i in range(petals):
        ang = i * 2 * math.pi / petals + R.uniform(-0.15, 0.15)
        for rr in np.linspace(1.4, 3.6, 8):
            for side in (-0.35, 0.35):
                x = cx + rr * math.cos(ang + side * (1 - rr / 4.2))
                y = cy + rr * math.sin(ang + side * (1 - rr / 4.2))
                _put(a, int(round(x)), int(round(y)), INK)
    # white fill inside the head so it reads as paper-white petals
    yy, xx = np.mgrid[0:16, 0:16]
    inside = (np.hypot(xx - cx, yy - cy) < 3.3) & (a[..., 3] == 0)
    a[inside, :3] = _hex(PAPER)
    a[inside, 3] = 255
    core = np.hypot(xx - cx, yy - cy) < 1.2
    a[core, :3] = _hex(GRAPHITE)
    a[core, 3] = 255
    return _img(a)


def scribble_grass(seed):
    """Pencil grass: a fan of quick upward strokes."""
    a = np.zeros((16, 16, 4), float)
    R = rng(seed)
    for k in range(6):
        x0 = 3 + k * 2 + R.uniform(-0.6, 0.6)
        h = int(R.integers(6, 13))
        lean = R.uniform(-0.35, 0.35)
        for j in range(h):
            _put(a, int(round(x0 + lean * j)), 15 - j, GRAPHITE if k % 2 else INK)
    return _img(a)


def ink_blot(seed):
    """Wet black ink with a glossy highlight swirl."""
    a = np.zeros((16, 16, 4), float)
    a[..., 3] = 255
    n = fbm(16, 16, 6, seed, 3)
    a[..., :3] = _hex(INK) * (0.75 + 0.5 * n[..., None])
    yy, xx = np.mgrid[0:16, 0:16]
    t = np.arctan2(yy - 7.5, xx - 7.5)
    d = np.hypot(xx - 7.5, yy - 7.5)
    swirl = np.abs(np.sin(t * 1.0 + d * 0.55)) > 0.97
    a[swirl & (d < 7), :3] = _hex("#5a5a64")
    a[(xx == 4) & (yy == 4), :3] = _hex("#9a9aa6")
    return _img(a)


def crumpled(seed):
    """Crumpled paper: crease lines with a lit side and a shadow side."""
    a = _paper(seed, PAPER)
    R = rng(seed + ":crease")
    for _ in range(5):
        x, y = R.uniform(0, 16), R.uniform(0, 16)
        ang = R.uniform(0, 2 * math.pi)
        for s in range(int(R.integers(5, 12))):
            xi, yi = int(x) % 16, int(y) % 16
            a[yi, xi, :3] = _hex("#b8b4aa")
            a[(yi + 1) % 16, xi, :3] = np.minimum(a[(yi + 1) % 16, xi, :3] * 1.04, 255)
            ang += R.uniform(-0.5, 0.5)
            x += math.cos(ang)
            y += math.sin(ang)
    n = fbm(16, 16, 4, seed + ":fold", 2)
    a[..., :3] *= (0.9 + 0.12 * n[..., None])
    return _img(a)


def pencil_side(seed):
    """Giant pencil shaft: three shaded hexagon facets separated by ink lines."""
    a = np.zeros((16, 16, 4), float)
    a[..., 3] = 255
    shades = ["#d8d6d0", "#b4b2ac", "#8c8a86"]
    for x in range(16):
        f = min(2, x // 5) if x < 15 else 2
        a[:, x, :3] = _hex(shades[f])
    for x in (0, 5, 10, 15):
        a[:, x, :3] = _hex(INK)
    n = rng(seed).random((16, 16)) < 0.08
    a[n, :3] *= 0.92
    return _img(a)


def pencil_end(seed):
    """Pencil cross-section: hexagonal wood around a graphite core."""
    a = _paper(seed, "#e8dcc0")
    yy, xx = np.mgrid[0:16, 0:16]
    d = np.maximum(np.abs(xx - 7.5) * 0.87 + np.abs(yy - 7.5) * 0.5, np.abs(yy - 7.5))
    a[d > 7.2, :3] = _hex(INK)
    a[(d > 6.0) & (d <= 7.2), :3] = _hex("#b4b2ac")
    core = np.hypot(xx - 7.5, yy - 7.5) < 2.6
    a[core, :3] = _hex(GRAPHITE)
    a[np.hypot(xx - 6.5, yy - 6.5) < 0.8, :3] = _hex("#7a7a78")
    return _img(a)


def shaved_wood(seed):
    """Sharpened pencil wood: pale shavings with grey grain strokes."""
    a = _paper(seed, "#e6dcc6", 0.08)
    R = rng(seed + ":grain")
    for _ in range(7):
        x, y = int(R.integers(0, 16)), int(R.integers(0, 16))
        for j in range(int(R.integers(3, 7))):
            _put(a, (x + j // 2) % 16, (y + j) % 16, "#a89c84", 0.7)
    return _img(a)


def eraser(seed):
    """Pink eraser rubber, smudged grey where it has been used."""
    a = np.zeros((16, 16, 4), float)
    a[..., 3] = 255
    n = fbm(16, 16, 4, seed, 2)
    cols = [_hex(c) for c in ERASER]
    idx = np.clip((n * 4).astype(int), 0, 3)
    a[..., :3] = np.array(cols)[idx]
    R = rng(seed + ":smudge").random((16, 16))
    smudge = (R < 0.12)
    a[smudge, :3] = a[smudge, :3] * 0.7 + _hex("#8a8a8a") * 0.3
    return _img(a)


# ------------------------------------------------------------------------------------------------ sky doodles
def _sky_canvas(n):
    return np.zeros((n, n, 4), float)


def _sky_line(a, x0, y0, x1, y1, col, w=1.6):
    n = a.shape[0]
    steps = int(max(abs(x1 - x0), abs(y1 - y0)) * 2) + 2
    for t in np.linspace(0, 1, steps):
        x, y = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
        for dx in range(-2, 3):
            for dy in range(-2, 3):
                xi, yi = int(round(x + dx)), int(round(y + dy))
                if 0 <= xi < n and 0 <= yi < n and math.hypot(xi - x, yi - y) <= w:
                    a[yi, xi, :3] = col
                    a[yi, xi, 3] = 255


def doodle_sun(colors, seed="sun", size=96):
    """A child's drawing of the sun: wobbly ink circle, scribble shading, uneven rays."""
    n = size
    a = _sky_canvas(n)
    ink = _hex(colors[0] if colors else INK)
    fill = _hex(colors[1] if len(colors) > 1 else PAPER)
    R = rng("doodlesun:" + seed)
    c = n / 2
    r0 = n * 0.24
    yy, xx = np.mgrid[0:n, 0:n]
    inside = np.hypot(xx - c, yy - c) < r0
    a[inside, :3] = fill
    a[inside, 3] = 255
    hatch = inside & (((xx + yy) % 6) == 0) & (xx + yy > n * 1.02)
    a[hatch, :3] = ink * 0.6 + fill * 0.4
    pts = []
    for t in np.linspace(0, 2 * math.pi * 1.05, 60):
        rr = r0 * (1 + 0.04 * math.sin(5 * t + 1))
        pts.append((c + rr * math.cos(t), c + rr * math.sin(t)))
    for p, q in zip(pts, pts[1:]):
        _sky_line(a, p[0], p[1], q[0], q[1], ink)
    k = int(R.integers(9, 13))
    for i in range(k):
        ang = i * 2 * math.pi / k + R.uniform(-0.12, 0.12)
        r1, r2 = r0 * 1.25, r0 * R.uniform(1.65, 1.95)
        _sky_line(a, c + r1 * math.cos(ang), c + r1 * math.sin(ang), c + r2 * math.cos(ang), c + r2 * math.sin(ang), ink)
    return _img(a)


def doodle_cloud(colors, seed="cloud", size=128):
    """A scribbled cloud: bumpy ink outline over paper-white fill, a little hatching underneath."""
    n = size
    a = _sky_canvas(n)
    ink = _hex(colors[0] if colors else INK)
    fill = _hex(colors[1] if len(colors) > 1 else "#ffffff")
    R = rng("doodlecloud:" + seed)
    yy, xx = np.mgrid[0:n, 0:n]
    blobs = []
    k = int(R.integers(4, 6))
    for i in range(k):
        bx = n * (0.2 + 0.6 * i / (k - 1)) + R.uniform(-4, 4)
        by = n * 0.55 - R.uniform(0, n * 0.12) * (1 - abs(i - (k - 1) / 2) / k)
        br = n * R.uniform(0.11, 0.17)
        blobs.append((bx, by, br))
    inside = np.zeros((n, n), bool)
    for bx, by, br in blobs:
        inside |= np.hypot(xx - bx, yy - by) < br
    inside &= yy < n * 0.66
    a[inside, :3] = fill
    a[inside, 3] = 235
    # outline = boundary of the union
    edge = inside & ~(np.roll(inside, 1, 0) & np.roll(inside, -1, 0) & np.roll(inside, 1, 1) & np.roll(inside, -1, 1))
    for _ in range(1):
        edge |= np.roll(edge, 1, 1) & inside
    a[edge, :3] = ink
    a[edge, 3] = 255
    return _img(a)


sky_art.GENERATORS.setdefault("sketchbook_sun", doodle_sun)
sky_art.GENERATORS.setdefault("sketchbook_cloud", doodle_cloud)

# ------------------------------------------------------------------------------------------------ features
GIANT_PENCIL = GiantPlant(stem="sketchbook_pencil", head="sketchbook_shaved_wood", shape="cone", height=(16, 30), radius=(2, 2),
                          decoration="sketchbook_graphite", stem_width=2, count=1, chance=4)
PAPER_BALL = Boulder(blocks=[("sketchbook_crumpled_paper", 1)], radius=(2, 4), squash=0.95, count=1, chance=3)
SCRIBBLE_OAK = Tree(log="sketchbook_log", leaves="sketchbook_leaves", shape="oak", height=(4, 7), count=1)
SCRIBBLE_FANCY = Tree(log="sketchbook_log", leaves="sketchbook_leaves", shape="fancy", height=(8, 13), count=1)

DIMENSION = Dimension(
    id="sketchbook",
    code="S-2B",
    name="The Sketchbook",
    tagline="A world still being drawn in pencil",
    description=("Everything here is drawn: ruled-paper meadows, crosshatched forests, a doodled sun and ink-blot "
                 "lakes as black as a fountain pen. Wander far enough and the world fades into blank paper, where "
                 "giant pencils stand waiting to finish it. Doodle Dogs will follow anyone with paper and Paper "
                 "Cranes glide overhead, but the Scribble Beast is an angry tangle of ink that bites."),
    danger=2,
    color="#d8d4ca",
    terrain=Terrain(style="hills", stone="sketchbook_graphite", sea_level=60, height=74, amplitude=18, scale=1.35,
                    roughness=0.12, deepslate=None, ores=False,
                    params={"rivers": 0.5, "detail": 0.25, "biome_size": 300, "cliffs": True,
                            "cliff_block": "sketchbook_graphite", "beach_block": "sketchbook_paper", "beach_height": 1}),
    sky=Sky(sky_color="#ebe8e0", fog_color="#f4f1ea", water_fog_color="#08080a", fog_start=30, fog_end=150,
            cloud_color=None, time="noon", star_brightness=0.0,
            bodies=[Celestial("sketchbook_sun", [INK, "#fbfaf6"], size=60, yaw=210, pitch=62, seed="sketch-sun"),
                    Celestial("sketchbook_cloud", [GRAPHITE, "#ffffff"], size=46, yaw=20, pitch=30, speed=4, seed="c1"),
                    Celestial("sketchbook_cloud", [GRAPHITE, "#ffffff"], size=56, yaw=110, pitch=24, speed=4, seed="c2"),
                    Celestial("sketchbook_cloud", [GRAPHITE, "#ffffff"], size=40, yaw=160, pitch=44, speed=4, seed="c3"),
                    Celestial("sketchbook_cloud", [GRAPHITE, "#ffffff"], size=50, yaw=280, pitch=27, speed=4, seed="c4"),
                    Celestial("sketchbook_cloud", [GRAPHITE, "#ffffff"], size=38, yaw=330, pitch=50, speed=4, seed="c5")]),
    blocks=[
        Block("sketchbook_ruled_paper", "Ruled Paper Turf", "grass", {
            "top": tex(ruled_paper, "sketch-ruled"),
            "side": tex(paper_side, "sketch-ruled"),
            "bottom": tex(crosshatch, "sketch-paper", PAPER, 0.0, False)}, hardness=0.5, sound="wool",
              map_color="snow"),
        Block("sketchbook_hatched_turf", "Crosshatched Turf", "grass", {
            "top": tex(ruled_paper, "sketch-hatched", 1.0, False),
            "side": tex(paper_side, "sketch-hatched", 1.0),
            "bottom": tex(crosshatch, "sketch-paper", PAPER, 0.0, False)}, hardness=0.5, sound="wool",
              map_color="color_light_gray"),
        Block("sketchbook_paper", "Blank Paper", "soil", {"all": tex(crosshatch, "sketch-paper", PAPER, 0.0, False)},
              hardness=0.4, sound="wool", map_color="snow"),
        Block("sketchbook_graphite", "Graphite Rock", "stone", {"all": tex(crosshatch, "sketch-graphite", "#d8d4ca", 0.8)},
              hardness=1.5, sound="stone", map_color="color_gray"),
        Block("sketchbook_log", "Sketched Log", "log", {"side": tex(pencil_bark, "sketch-bark"), "end": tex(rings_doodle, "sketch-rings")},
              hardness=2.0, sound="wood", map_color="snow", flammable=True),
        Block("sketchbook_leaves", "Scribble Leaves", "leaves", {"all": tex(scribble_leaves, "sketch-leaves")}, hardness=0.2,
              sound="azalea_leaves", map_color="color_light_gray", flammable=True, drop="sketchbook_doodled_apple"),
        Block("sketchbook_doodle_flower", "Doodle Daisy", "plant", {"cross": tex(doodle_flower, "sketch-daisy")},
              hardness=0.0, sound="grass", map_color="snow"),
        Block("sketchbook_scribble_grass", "Scribble Grass", "plant", {"cross": tex(scribble_grass, "sketch-grass")},
              hardness=0.0, sound="grass", map_color="color_gray"),
        Block("sketchbook_ink_blot", "Ink Blot", "sticky", {"all": tex(ink_blot, "sketch-ink")}, hardness=0.6, sound="honey",
              map_color="color_black", speed=0.5, jump=0.6),
        Block("sketchbook_crumpled_paper", "Crumpled Paper", "solid", {"all": tex(crumpled, "sketch-crumple")}, hardness=0.4,
              sound="wool", tool="axe", map_color="snow", flammable=True),
        Block("sketchbook_pencil", "Giant Pencil", "log", {"side": tex(pencil_side, "sketch-pencil"), "end": tex(pencil_end, "sketch-pencil-end")},
              hardness=2.0, sound="wood", map_color="color_light_gray"),
        Block("sketchbook_shaved_wood", "Sharpened Wood", "planks", {"all": tex(shaved_wood, "sketch-shaved")}, hardness=1.5,
              sound="wood", map_color="sand", flammable=True),
        Block("sketchbook_eraser", "Eraser Rubber", "solid", {"all": tex(eraser, "sketch-eraser")}, hardness=0.8, sound="slime",
              tool="shovel", bounce=0.6, map_color="color_pink"),
    ],
    items=[
        Item("sketchbook_living_ink", "Living Ink", tex("item_icon", "goo", ["#0c0c0e", "#2a2a2e", "#6a6a72"], seed="sketch-ink-item"),
             rarity="uncommon", lore="It keeps trying to finish a drawing you cannot see."),
        Item("sketchbook_doodled_apple", "Doodled Apple", tex("item_icon", "fruit", ["#3a3a3a", "#9a9a96", "#e8e6e0", "#ffffff"],
                                                              seed="sketch-apple"),
             kind="food", food=Food(4, 0.3, effects=[Effect("minecraft:speed", 10, 0)]),
             lore="Two lines and a leaf. Surprisingly crunchy."),
    ],
    creatures=[
        Creature("scribble_beast", "Scribble Beast", "quadruped", ["#1c1c1e", "#4a4a48", "#f4f1ea", "#ffffff"],
                 pattern="stripes", size=1.25,
                 body={"leg_len": 9, "leg_w": 3, "body_len": 15, "body_h": 9, "body_w": 10, "fur": True, "mane": True,
                       "spikes": 7, "jaw": True, "mouth": "fangs", "eye_style": "glow", "eye_size": 2, "eyes": 3,
                       "horns": "curved", "claws": True, "tail": 3, "tail_kind": "spade", "ears": "pointy", "snout": 3},
                 behavior="hostile", health=26, damage=5, speed=0.3, abilities=["ink", "charge"],
                 on_hit=Effect("minecraft:blindness", 2, 0), spawn_light="any",
                 drops=[Drop("sketchbook_living_ink", 0, 2), Drop("minecraft:ink_sac", 0, 1)], sounds="hoglin", pitch=1.35,
                 xp=8, group=1,
                 description="An angry tangle of ink that was never finished. It squirts itself at you when hurt."),
        Creature("doodle_dog", "Doodle Dog", "quadruped", ["#faf8f2", "#1c1c1e", "#d8d4ca", "#101010"], pattern="spots",
                 size=0.8,
                 body={"leg_len": 6, "body_len": 12, "body_h": 8, "body_w": 8, "ears": "floppy", "snout": 3, "tail": 2,
                       "tail_kind": "curl", "eye_style": "cute", "mouth": "smile", "head_size": 1.2, "blush": False},
                 behavior="passive", health=12, speed=0.27, tempt="minecraft:paper",
                 drops=[Drop("minecraft:paper", 1, 3), Drop("minecraft:bone", 0, 1, 0.5)], sounds="fox", pitch=0.9, xp=2,
                 group=3,
                 description="Drawn in about four seconds and very happy about it. Loves paper."),
        Creature("paper_crane", "Paper Crane", "flyer", ["#f4f1ea", "#d8e2f0", "#9fb8dc", "#1c1c1e"], pattern="plain",
                 size=0.9,
                 body={"kind": "crane", "wing_kind": "paper", "neck": 6, "beak": 4, "tail": 1, "tail_kind": "fan",
                       "eye_style": "round"},
                 behavior="passive", health=6, speed=0.22,
                 drops=[Drop("minecraft:paper", 1, 2), Drop("minecraft:feather", 0, 1)], sounds="parrot", pitch=1.1, xp=2,
                 group=3,
                 description="Folded from a single page of ruled paper. Nobody remembers folding it."),
    ],
    biomes=[
        Biome("sketchbook_ruled_meadows", "Ruled Meadows", top="sketchbook_ruled_paper", under="sketchbook_paper",
              temperature=0.0, humidity=0.0, grass_color="#8a8a86", foliage_color="#8a8a86", water_color="#141416",
              water_fog_color="#08080a", particles=[("dust:#4a4a48:0.5", 0.002)], ambient="cozy_breeze",
              music="minecraft:music.overworld.meadow",
              features=[
                  SCRIBBLE_OAK,
                  Patch(block="sketchbook_doodle_flower", count=4, tries=24),
                  Patch(block="sketchbook_scribble_grass", count=6, tries=32),
                  PAPER_BALL,
                  Boulder(blocks=[("sketchbook_graphite", 1)], radius=(1, 2), count=1, chance=4),
              ],
              spawns=[Spawn("doodle_dog", 12, (2, 4)), Spawn("paper_crane", 8, (2, 3)), Spawn("scribble_beast", 3, (1, 1))]),
        Biome("sketchbook_crosshatch_woods", "Crosshatch Woods", top="sketchbook_hatched_turf", under="sketchbook_paper",
              temperature=-0.3, humidity=0.65, grass_color="#5a5a58", foliage_color="#5a5a58", water_color="#141416",
              water_fog_color="#08080a", fog_color="#d8d4ca", fog_end=90, particles=[("dust:#1c1c1e:0.5", 0.004)],
              ambient="eerie_choir", music="minecraft:music.overworld.forest",
              features=[
                  Tree(log="sketchbook_log", leaves="sketchbook_leaves", shape="fancy", height=(9, 15), count=3),
                  Tree(log="sketchbook_log", leaves="sketchbook_leaves", shape="oak", height=(5, 8), count=3),
                  Tree(log="sketchbook_log", leaves="sketchbook_leaves", shape="bush", height=(1, 2), count=2),
                  Patch(block="sketchbook_scribble_grass", count=8, tries=32),
                  Patch(block="sketchbook_doodle_flower", count=1, tries=8),
              ],
              spawns=[Spawn("scribble_beast", 6, (1, 2)), Spawn("doodle_dog", 6, (1, 3)), Spawn("paper_crane", 3, (1, 2))]),
        Biome("sketchbook_ink_marsh", "Ink Marsh", top="sketchbook_ruled_paper", under="sketchbook_paper",
              temperature=0.4, humidity=0.5, elevation=-0.6, underwater="sketchbook_ink_blot", grass_color="#5a5a58",
              water_color="#0c0c0e", water_fog_color="#040406", fog_color="#cfcac0",
              particles=[("minecraft:squid_ink", 0.003), ("dust:#1c1c1e:0.7", 0.004)], ambient="bubbling",
              music="minecraft:music.overworld.swamp",
              surface_noise=[("sketchbook_ink_blot", 0.55)],
              features=[
                  Lake(fluid="minecraft:water", border="sketchbook_ink_blot", count=1, chance=2),
                  Patch(block="sketchbook_scribble_grass", count=6, tries=32),
                  Tree(log="sketchbook_log", leaves="sketchbook_leaves", shape="bush", height=(1, 2), count=1),
                  Boulder(blocks=[("sketchbook_ink_blot", 1)], radius=(1, 2), squash=0.4, count=1, chance=2),
              ],
              spawns=[Spawn("paper_crane", 12, (2, 4)), Spawn("doodle_dog", 4, (1, 2)), Spawn("scribble_beast", 3, (1, 1))]),
        Biome("sketchbook_blank_margins", "Blank Margins", top="sketchbook_paper", under="sketchbook_paper",
              temperature=0.7, humidity=-0.6, grass_color="#b4b2ac", water_color="#141416", water_fog_color="#08080a",
              fog_color="#fbfaf6", fog_end=80, particles=[("minecraft:white_ash", 0.01)],
              ambient="wind_howl", music="minecraft:music.overworld.snowy_slopes",
              features=[
                  GIANT_PENCIL,
                  Structure(kind="ring", blocks={"main": "sketchbook_graphite", "alt": "sketchbook_graphite"}, size=(5, 8),
                            params={"sink": 0.45, "thickness": 0.12}, count=1, chance=5),
                  Boulder(blocks=[("sketchbook_eraser", 1)], radius=(2, 3), squash=0.7, count=1, chance=5),
                  Boulder(blocks=[("sketchbook_crumpled_paper", 1)], radius=(2, 5), count=1, chance=2),
                  Patch(block="sketchbook_scribble_grass", count=1, tries=8),
              ],
              spawns=[Spawn("scribble_beast", 5, (1, 1)), Spawn("paper_crane", 4, (1, 2)), Spawn("doodle_dog", 3, (1, 2))]),
    ],
    effects=[],
    ambient="cozy_breeze",
    music="minecraft:music.overworld.meadow",
    icon="portalgun:sketchbook_living_ink",
)
