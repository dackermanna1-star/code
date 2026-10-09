"""Z-18 Snackrealm - a savoury food world of bread hills, holey cheese cliffs and fizzy soda springs."""
import math

import numpy as np
from PIL import Image

from gen.content import sky_art
from gen.content.dsl import *
from gen.noise import fbm, rng

# ------------------------------------------------------------------------------------------------ palette
P_CRUST = ["#7a3e12", "#9a5418", "#b86e22", "#d08a34", "#e6a84e"]       # baked crust
P_CRUMB = ["#d8b878", "#e6c890", "#f0d8a8", "#f8e8c4", "#fff4dc"]       # soft crumb
P_CHEESE = ["#d89a10", "#eab424", "#f6cc3a", "#ffe066", "#fff09a"]      # swiss cheese
P_PIZZA = ["#e08a14", "#f0a824", "#f8c03a", "#ffd65a"]                  # melted mozzarella
P_PEPPERONI = ["#6a1408", "#9a2410", "#c03a1a", "#d85a30"]
P_BROC = ["#1a4a14", "#24661c", "#2e8226", "#44a034", "#6cc04a"]
P_STALK = ["#6a9a3a", "#86b44c", "#a2c866", "#c0dc8a"]
P_FOAM = ["#e8dcc4", "#f4ead6", "#fbf5e8", "#ffffff"]
P_COLA = ["#2a1006", "#401a0a", "#5a2810", "#743818"]
P_PRETZEL = ["#4a200a", "#6a3010", "#8a4416", "#a65c20", "#c47a34"]
SALT = "#fbf8f0"


# ------------------------------------------------------------------------------------------------ helpers
def _hex(c):
    c = c.lstrip("#")
    return np.array([int(c[i:i + 2], 16) for i in (0, 2, 4)], float)


def _ramp(pal, t):
    cols = np.array([_hex(c) for c in pal])
    t = np.clip(t, 0, 1) * (len(cols) - 1)
    i = np.clip(np.floor(t).astype(int), 0, len(cols) - 2)
    f = (t - i)[..., None]
    return cols[i] * (1 - f) + cols[i + 1] * f


def _q(v, n):
    return np.round(np.clip(v, 0, 1) * (n - 1)) / (n - 1)


def _img(rgb, alpha=None):
    a = np.zeros(rgb.shape[:2] + (4,), np.uint8)
    a[..., :3] = np.clip(np.round(rgb), 0, 255)
    a[..., 3] = 255 if alpha is None else alpha
    return Image.fromarray(a, "RGBA")


def _discs(R, n, rmin, rmax, min_d):
    pts = []
    for _ in range(200):
        if len(pts) >= n:
            break
        x, y, r = R.uniform(0, 16), R.uniform(0, 16), R.uniform(rmin, rmax)
        ok = True
        for (px, py, pr) in pts:
            dx = min(abs(x - px), 16 - abs(x - px))
            dy = min(abs(y - py), 16 - abs(y - py))
            if math.hypot(dx, dy) < r + pr + min_d:
                ok = False
                break
        if ok:
            pts.append((x, y, r))
    return pts


def _wrapdist(xx, yy, x, y):
    dx = np.minimum(np.abs(xx - x), 16 - np.abs(xx - x))
    dy = np.minimum(np.abs(yy - y), 16 - np.abs(yy - y))
    return np.hypot(dx, dy), (xx - x), (yy - y)


# ------------------------------------------------------------------------------------------------ block textures
def crust_top(seed, herbs=False):
    """Golden baked crust: browned bake spots, a dusting of flour, (optionally) green herb flecks."""
    n = fbm(16, 16, 5, seed, 3)
    w = rng(seed + ":w").random((16, 16))
    rgb = _ramp(P_CRUST, _q(0.35 + 0.55 * n + 0.15 * (w - 0.5), 5))
    flour = w > 0.94
    rgb[flour] = rgb[flour] * 0.35 + _hex("#fff4dc") * 0.65
    if herbs:
        R = rng(seed + ":herb")
        for _ in range(9):
            x, y = int(R.integers(0, 16)), int(R.integers(0, 16))
            rgb[y, x] = _hex(["#3a7a22", "#5aa032", "#2a5a18"][int(R.integers(0, 3))])
            if R.random() < 0.5:
                rgb[y, (x + 1) % 16] = _hex("#3a7a22")
    return _img(rgb)


def crumb(seed):
    """Soft bread crumb: an open, airy pore structure."""
    from gen import textures as T
    return T.sponge(P_CRUMB, seed)


def crust_side(seed, herbs=False):
    """Loaf side: a wavy band of crust over the pale crumb."""
    top = np.asarray(crust_top(seed, herbs).convert("RGBA"), float)
    body = np.asarray(crumb(seed + ":crumb").convert("RGBA"), float)
    out = body.copy()
    depth = 3 + np.round(fbm(16, 1, 4, seed + ":d", 2)[0] * 2).astype(int)
    for x in range(16):
        d = int(depth[x])
        out[:d, x] = top[:d, x]
        out[d, x, :3] = out[d, x, :3] * 0.8 + _hex(P_CRUST[3]) * 0.2
    return _img(out[..., :3])


def pizza_top(seed):
    """Melted mozzarella with pepperoni slices (seamless) and a few basil flecks."""
    n = fbm(16, 16, 5, seed, 3)
    rgb = _ramp(P_PIZZA, _q(0.25 + 0.7 * n, 4))
    yy, xx = np.mgrid[0:16, 0:16]
    R = rng(seed + ":pep")
    for (x, y, r) in _discs(R, 3, 2.3, 3.0, 1.0):
        d, dx, dy = _wrapdist(xx, yy, x, y)
        m = d < r
        tone = 0.45 + 0.35 * fbm(16, 16, 3, seed + f":{x:.1f}", 2)
        rgb[m] = _ramp(P_PEPPERONI, _q(tone, 4))[m]
        rim = (d >= r - 0.9) & m
        rgb[rim] = rgb[rim] * 0.78
        hi = m & (d < r * 0.5) & ((dx + dy) < -0.5)
        rgb[hi] = rgb[hi] * 0.7 + _hex("#f07a50") * 0.3
        fat = m & (rng(seed + f":fat{x:.2f}").random((16, 16)) > 0.9)
        rgb[fat] = _hex("#e8907a")
    for _ in range(3):
        x, y = int(R.integers(0, 16)), int(R.integers(0, 16))
        rgb[y, x] = _hex("#2e7a22")
    return _img(rgb)


def broccoli_floret(seed):
    """Bumpy floret clusters: rounded buds with lit tops and dark crevices."""
    yy, xx = np.mgrid[0:16, 0:16]
    rgb = np.zeros((16, 16, 3))
    rgb[:] = _hex(P_BROC[0])
    R = rng(seed)
    best = np.full((16, 16), 9.0)
    for (x, y, r) in _discs(R, 14, 1.4, 2.4, -0.6):
        d, dx, dy = _wrapdist(xx, yy, x, y)
        m = (d < r) & (d / r < best)
        best = np.where(m, d / r, best)
        lit = np.clip(0.65 - 0.35 * (dx + dy) / r - 0.45 * d / r, 0, 1)
        rgb[m] = _ramp(P_BROC, _q(lit, 5))[m]
    dots = rng(seed + ":bud").random((16, 16)) > 0.9
    rgb[dots] = rgb[dots] * 0.85
    return _img(rgb)


def soda_top(seed, frame=0):
    """Dark fizzing cola with foam bubbles drifting around the vent mouth (animated)."""
    n = fbm(16, 16, 4, seed, 2)
    rgb = _ramp(P_COLA, _q(0.3 + 0.6 * n, 4))
    yy, xx = np.mgrid[0:16, 0:16]
    R = rng(seed + ":b")
    for i in range(10):
        bx = (R.uniform(0, 16) + frame * R.uniform(0.3, 0.9)) % 16
        by = (R.uniform(0, 16) - frame * R.uniform(0.6, 1.4)) % 16
        r = R.uniform(0.6, 1.5)
        d, dx, dy = _wrapdist(xx, yy, bx, by)
        ring = (d < r + 0.5) & (d > r - 0.6)
        rgb[ring] = _hex("#f4ead6")
        rgb[(d < 0.6) & (r > 1.0)] = _hex("#a06030")
    ring = np.abs(np.hypot(xx - 7.5, yy - 7.5) - 6.6) < 0.8
    rgb[ring] = rgb[ring] * 0.4 + _hex(P_FOAM[2]) * 0.6
    return _img(rgb)


def foam(seed):
    """Sticky soda foam: a crowd of small bubbles."""
    yy, xx = np.mgrid[0:16, 0:16]
    rgb = np.zeros((16, 16, 3))
    rgb[:] = _hex(P_FOAM[1])
    R = rng(seed)
    for (x, y, r) in _discs(R, 22, 0.9, 2.0, -0.3):
        d, dx, dy = _wrapdist(xx, yy, x, y)
        m = d < r
        lit = np.clip(0.75 - 0.3 * (dx + dy) / r, 0, 1)
        rgb[m] = _ramp(P_FOAM, _q(lit, 4))[m]
        rim = m & (d > r - 0.6)
        rgb[rim] = rgb[rim] * 0.9
        rgb[m & (dx < -0.2) & (dy < -0.2) & (d < r * 0.45)] = 255
    rgb = rgb * 0.97 + _hex("#e0b070") * 0.03
    return _img(rgb)


def pretzel(seed):
    """Glossy baked pretzel dough with coarse salt crystals."""
    n = fbm(16, 16, 5, seed, 3)
    yy, xx = np.mgrid[0:16, 0:16]
    gloss = 0.5 + 0.5 * np.sin((xx * 0.6 + yy * 0.9) + n * 4)
    rgb = _ramp(P_PRETZEL, _q(0.25 + 0.45 * n + 0.3 * gloss, 5))
    R = rng(seed + ":salt")
    for _ in range(10):
        x, y = int(R.integers(0, 16)), int(R.integers(0, 16))
        rgb[y, x] = _hex(SALT)
        if R.random() < 0.6:
            rgb[y, (x + 1) % 16] = _hex("#e0dccc")
        if R.random() < 0.4:
            rgb[(y + 1) % 16, x] = _hex("#cfc8b4")
    return _img(rgb)


def meatball_rock(seed):
    """Lumpy seasoned meat with tomato sauce glaze and herb flecks."""
    n = fbm(16, 16, 6, seed, 3)
    w = rng(seed + ":w").random((16, 16))
    rgb = _ramp(["#3a1a0c", "#5a2a14", "#7a3e1e", "#9a5430"], _q(0.3 + 0.6 * n + 0.2 * (w - 0.5), 4))
    sauce = fbm(16, 16, 3, seed + ":sauce", 2) > 0.62
    rgb[sauce] = rgb[sauce] * 0.4 + _hex("#c0301a") * 0.6
    rgb[w > 0.95] = _hex("#3a6a1a")
    return _img(rgb)


# ------------------------------------------------------------------------------------------------ sky art
def _sky_img(rgb, alpha):
    a = np.zeros(rgb.shape[:2] + (4,), np.uint8)
    a[..., :3] = np.clip(np.round(rgb), 0, 255)
    a[..., 3] = np.clip(np.round(alpha * 255), 0, 255)
    return Image.fromarray(a, "RGBA")


def fried_egg(colors, seed="egg", size=112):
    """The Snackrealm sun: a giant fried egg - wobbly glossy white, a domed golden yolk."""
    n = size
    yy, xx = np.mgrid[0:n, 0:n] / (n / 2.0) - 1.0
    ang = np.arctan2(yy, xx)
    R = rng("egg:" + seed)
    wob = 0.82 + 0.08 * np.sin(ang * 3 + R.uniform(0, 6)) + 0.05 * np.sin(ang * 7 + R.uniform(0, 6))
    d = np.hypot(xx, yy)
    white = d < wob
    rgb = np.zeros((n, n, 3))
    rgb[:] = _hex("#fffaf0")
    edge = white & (d > wob - 0.08)
    rgb[edge] = _hex("#f0d8b0")
    yc = np.hypot(xx + 0.08, yy + 0.05)
    yolk = yc < 0.36
    t = np.clip(1 - yc / 0.36, 0, 1)
    rgb[yolk] = _ramp(["#e08a00", "#ffb000", "#ffd040", "#fff0a0"], 0.35 + 0.5 * t)[yolk]
    shine = np.hypot(xx + 0.2, yy + 0.18) < 0.08
    rgb[shine] = 255
    glow = np.clip(1 - (d - wob) / 0.25, 0, 1) * (~white) * 0.35
    alpha = np.where(white, 1.0, glow)
    rgb[~white] = _hex("#fff0c0")
    return _sky_img(rgb, alpha)


def pizza_planet(colors, seed="pizza", size=112):
    """A whole pizza hanging in the sky like a moon."""
    n = size
    yy, xx = np.mgrid[0:n, 0:n] / (n / 2.0) - 1.0
    d = np.hypot(xx, yy)
    disc = d < 0.95
    nz = fbm(n, n, max(4, n // 12), seed, 3)
    rgb = _ramp(P_PIZZA, 0.3 + 0.6 * nz)
    crust = disc & (d > 0.8)
    rgb[crust] = _ramp(P_CRUST, 0.4 + 0.5 * nz)[crust]
    R = rng("pizza:" + seed)
    for _ in range(9):
        a, r = R.uniform(0, 6.28), R.uniform(0.0, 0.62)
        px, py = r * math.cos(a), r * math.sin(a)
        m = np.hypot(xx - px, yy - py) < 0.13
        rgb[m & disc] = _ramp(P_PEPPERONI, 0.5 + 0.3 * nz)[m & disc]
    for k in range(4):   # slice cuts
        a = k * math.pi / 4
        cut = np.abs(xx * math.sin(a) - yy * math.cos(a)) < 0.012
        rgb[cut & disc & ~crust] = rgb[cut & disc & ~crust] * 0.75
    shade = np.clip(1.0 - 0.35 * (xx + yy + 0.6), 0.6, 1.1)
    rgb = rgb * shade[..., None]
    return _sky_img(rgb, disc.astype(float))


sky_art.GENERATORS.setdefault("snackrealm_egg", fried_egg)
sky_art.GENERATORS.setdefault("snackrealm_pizza", pizza_planet)

# ------------------------------------------------------------------------------------------------ features
GIANT_BROCCOLI = GiantPlant(stem="snack_broccoli_stalk", head="snack_broccoli_floret", shape="puff", height=(9, 16),
                            radius=(5, 7), stem_width=3, bend=0.1, count=1)
BROCCOLI = GiantPlant(stem="snack_broccoli_stalk", head="snack_broccoli_floret", shape="puff", height=(4, 8), radius=(2, 4),
                      stem_width=1, bend=0.2, count=2)
PRETZEL_ARCH = Structure(kind="arch", blocks={"main": "snack_pretzel", "alt": "snack_pretzel"}, size=(5, 9),
                         params={"height": 1.2, "thickness": 1.4}, count=1, chance=6)
BAGEL = Structure(kind="ring", blocks={"main": "snack_bread_crust", "alt": "snack_crumb"}, size=(5, 8),
                  params={"thickness": 0.42, "sink": 0.25}, count=1, chance=8)

DIMENSION = Dimension(
    id="snackrealm",
    code="Z-18",
    name="Snackrealm",
    tagline="Bread hills, cheese cliffs and fizzy soda springs",
    description=("A world that smells like a bakery: rolling bread-crust hills, swiss-cheese cliffs riddled with "
                 "holes, pepperoni plains and broccoli trees as big as oaks, all under a fried-egg sun. Soda springs "
                 "fizz and spout and the sea is cola. Cheese Mice nibble everything; the Meatballs are grumpy but "
                 "small, and splitting them only makes more meatballs."),
    danger=1,
    color="#f6cc3a",
    terrain=Terrain(style="sponge", stone="snack_cheese", sea_level=60, height=77, amplitude=22, scale=1.15,
                    roughness=0.15, caves=True, ores=False, deepslate=None,
                    params={"holes": 0.6, "hole_size": 1.25, "biome_size": 280, "cliffs": True, "cliff_block": "snack_cheese",
                            "beach_block": "snack_soda_foam", "beach_height": 1}),
    sky=Sky(sky_color="#f2bd78", fog_color="#ffdcae", water_fog_color="#3a1806", fog_start=40, fog_end=220,
            cloud_color="#f0fff4e0", cloud_height=180, time="afternoon", sunrise_color="#ffff9040",
            bodies=[Celestial("snackrealm_egg", [], size=58, yaw=250, pitch=50, roll=15, seed="snack-egg"),
                    Celestial("snackrealm_pizza", [], size=46, yaw=60, pitch=30, roll=-20, speed=2, seed="snack-pizza")]),
    blocks=[
        Block("snack_bread_crust", "Bread Crust", "grass", {
            "top": tex(crust_top, "snack-crust"), "side": tex(crust_side, "snack-crust"), "bottom": tex(crumb, "snack-crumb")},
              hardness=0.6, sound="wool", tool="shovel", map_color="color_orange", flammable=True),
        Block("snack_herb_crust", "Herbed Crust", "grass", {
            "top": tex(crust_top, "snack-herb", True), "side": tex(crust_side, "snack-herb", True),
            "bottom": tex(crumb, "snack-crumb")}, hardness=0.6, sound="wool", tool="shovel", map_color="color_orange"),
        Block("snack_crumb", "Bread Crumb", "soil", {"all": tex(crumb, "snack-crumb")}, hardness=0.5, sound="wool",
              map_color="sand", bounce=0.25),
        Block("snack_cheese", "Swiss Cheese", "stone", {"all": tex("cheese", P_CHEESE, seed="snack-cheese")}, hardness=1.0,
              sound="mud", map_color="color_yellow"),
        Block("snack_pizza", "Pizza Crust", "grass", {
            "top": tex(pizza_top, "snack-pizza"), "side": tex(crust_side, "snack-pizza-side"), "bottom": tex(crumb, "snack-crumb")},
              hardness=0.6, sound="honey", tool="shovel", map_color="color_red"),
        Block("snack_broccoli_stalk", "Broccoli Stalk", "log", {
            "side": tex("log_side", P_STALK, seed="snack-stalk"),
            "end": tex("log_top", P_STALK, ["#d8ecb0", "#c0dc8a", "#a2c866"], seed="snack-stalk-end")},
              hardness=1.0, sound="stem", map_color="color_light_green"),
        Block("snack_broccoli_floret", "Broccoli Floret", "mushroom_cap", {"all": tex(broccoli_floret, "snack-floret")},
              hardness=0.4, sound="azalea_leaves", map_color="color_green"),
        Block("snack_soda_vent", "Soda Spring", "vent", {
            "top": tex(soda_top, "snack-soda", frames=8, frametime=3), "side": tex(foam, "snack-foam")},
              hardness=0.8, sound="honey", particle="minecraft:bubble_pop", effect="minecraft:speed", effect_seconds=8,
              effect_amplifier=1, map_color="color_brown"),
        Block("snack_soda_foam", "Soda Foam", "soil", {"all": tex(foam, "snack-foam")}, hardness=0.3, sound="snow",
              map_color="snow", bounce=0.5),
        Block("snack_pretzel", "Pretzel Dough", "solid", {"all": tex(pretzel, "snack-pretzel")}, hardness=1.2, sound="wood",
              tool="axe", map_color="color_brown"),
        Block("snack_meatball_rock", "Meatball Rock", "solid", {"all": tex(meatball_rock, "snack-meat")}, hardness=1.0,
              sound="mud", tool="shovel", map_color="color_brown"),
        Block("snack_olive_sprig", "Cocktail Olive", "plant", {"cross": tex("lollipop_plant", "#e0c08a",
                                                                            ["#2a4a10", "#4a7a1a", "#6a9a2a", "#c03a1a"],
                                                                            seed="snack-olive")},
              hardness=0.0, sound="grass", map_color="color_green"),
        Block("snack_lettuce", "Lettuce Frill", "plant", {"cross": tex("coral_fan", ["#3a8a2a", "#5aaa3a", "#8acc5a", "#c0e88a"],
                                                                       seed="snack-lettuce")},
              hardness=0.0, sound="grass", map_color="color_light_green"),
    ],
    items=[
        Item("snack_meatball_bite", "Meatball", tex("item_icon", "meat_cooked", ["#3a1a0c", "#6a3018", "#9a5430", "#c0301a"],
                                                    seed="snack-meatball"),
             kind="food", food=Food(6, 0.7, effects=[Effect("minecraft:absorption", 20, 0)]),
             lore="Still rolling around a bit. Perfectly seasoned."),
        Item("snack_cheese_wedge", "Cheese Wedge", tex("item_icon", "cheese", P_CHEESE, seed="snack-wedge"), kind="food",
             food=Food(3, 0.5, fast=True, effects=[Effect("minecraft:regeneration", 4, 0)]),
             lore="Aged to perfection by a very proud mouse."),
        Item("snack_pretzel_twist", "Pretzel Twist", tex("item_icon", "candy", P_PRETZEL, seed="snack-pretzel-item"), kind="food",
             food=Food(4, 0.5, effects=[Effect("minecraft:speed", 15, 0)]),
             lore="Salt rush! Shed by a Pretzel Snake. It doesn't mind."),
    ],
    creatures=[
        Creature("meatball", "Meatball", "blob", ["#7a3a1e", "#4e2412", "#d0402a", "#ffffff"], pattern="speckle", size=0.85,
                 body={"shape": "round", "blob_size": 11, "eye_style": "angry", "eye_size": 2, "brows": True, "mouth": "grin",
                       "feet": True},
                 behavior="hostile", movement="hopping", health=12, damage=2, speed=0.3, abilities=["split"],
                 spawn_light="any", drops=[Drop("snack_meatball_bite", 0, 2)], sounds="slime", pitch=0.7, xp=3, group=3,
                 description="A grumpy meatball in a hurry. Hit it hard enough and you get two smaller grumpy meatballs."),
        Creature("cheese_mouse", "Cheese Mouse", "crawler", ["#ffd23a", "#b8800c", "#ff9ab0", "#101010"], pattern="spots",
                 size=0.6,
                 body={"kind": "rat", "ears": "round", "whiskers": True, "tail": 3, "tail_kind": "thin", "eye_style": "cute",
                       "blush": True, "head_size": 1.25, "mouth": "smile"},
                 behavior="passive", health=6, speed=0.3, tempt="snack_cheese",
                 drops=[Drop("snack_cheese_wedge", 1, 2)], sounds="rabbit", pitch=1.4, xp=1, group=5,
                 description="Made of cheese, eats cheese, does not see the problem."),
        Creature("pretzel_snake", "Pretzel Snake", "serpent", ["#8a4a1a", "#5e2e0c", "#fbf8f0", "#1a1008"], pattern="speckle",
                 size=1.1,
                 body={"head": "snake", "segments": 9, "seg_w": 7, "seg_len": 5, "taper": 0.6, "ringed": True,
                       "eye_style": "cute", "mouth": "smile", "head_w": 7},
                 behavior="neutral", health=18, damage=3, speed=0.24,
                 drops=[Drop("snack_pretzel_twist", 1, 2)], sounds="silverfish", pitch=0.6, xp=4, group=2,
                 description="A twisty, salty serpent. Leave it alone and it will leave you alone, mostly."),
    ],
    biomes=[
        Biome("snack_breadloaf_hills", "Breadloaf Hills", top="snack_bread_crust", under="snack_crumb", temperature=0.0,
              humidity=0.0, grass_color="#b86e22", foliage_color="#44a034", water_color="#8a4a1a", water_fog_color="#3a1806",
              particles=[("dust:#fff4dc:0.6", 0.002)], ambient="cozy_breeze", music="minecraft:music.overworld.meadow",
              features=[
                  BROCCOLI,
                  PRETZEL_ARCH,
                  BAGEL,
                  Patch(block="snack_olive_sprig", count=1, tries=8),
                  Patch(block="snack_lettuce", count=4, tries=24),
                  Boulder(blocks=[("snack_cheese", 1)], radius=(2, 3), count=1, chance=3),
              ],
              spawns=[Spawn("cheese_mouse", 10, (2, 3)), Spawn("meatball", 4, (1, 2)), Spawn("pretzel_snake", 3, (1, 1))]),
        Biome("snack_broccoli_grove", "Broccoli Grove", top="snack_herb_crust", under="snack_crumb", temperature=-0.5,
              humidity=0.55, grass_color="#5aa032", foliage_color="#44a034", water_color="#8a4a1a",
              water_fog_color="#3a1806", fog_color="#e8dca0", particles=[("dust:#6cc04a:0.6", 0.002)],
              ambient="cozy_breeze", music="minecraft:music.overworld.forest",
              features=[
                  GIANT_BROCCOLI,
                  BROCCOLI,
                  GiantPlant(stem="snack_broccoli_stalk", head="snack_broccoli_floret", shape="puff", height=(3, 5),
                             radius=(1, 2), count=2),
                  Patch(block="snack_lettuce", count=8, tries=32),
                  Patch(block="snack_olive_sprig", count=1, tries=8),
              ],
              spawns=[Spawn("cheese_mouse", 9, (2, 3)), Spawn("pretzel_snake", 4, (1, 2)), Spawn("meatball", 2, (1, 1))]),
        Biome("snack_pepperoni_plains", "Pepperoni Plains", top="snack_pizza", under="snack_crumb", temperature=0.6,
              humidity=-0.5, grass_color="#f0a824", foliage_color="#44a034", water_color="#8a4a1a",
              water_fog_color="#3a1806", fog_color="#ffd29a", particles=[("minecraft:white_smoke", 0.0015)],
              ambient="sizzle_toxic", music="minecraft:music.overworld.badlands",
              features=[
                  Boulder(blocks=[("snack_meatball_rock", 1)], radius=(2, 4), squash=0.9, count=1, chance=2),
                  Patch(block="snack_olive_sprig", count=1, tries=10),
                  BROCCOLI,
                  Structure(kind="ring", blocks={"main": "snack_pretzel", "alt": "snack_pretzel"}, size=(4, 6),
                            params={"thickness": 0.3, "sink": 0.1, "flat": 1}, count=1, chance=7),
              ],
              spawns=[Spawn("meatball", 8, (2, 3)), Spawn("cheese_mouse", 8, (1, 3)), Spawn("pretzel_snake", 2, (1, 1))]),
        Biome("snack_soda_springs", "Soda Springs", top="snack_soda_foam", under="snack_crumb", temperature=0.3,
              humidity=0.8, elevation=-0.5, underwater="snack_crumb", grass_color="#e6a84e", foliage_color="#44a034",
              water_color="#6a3412", water_fog_color="#2a1006", fog_color="#f4e0c0",
              particles=[("minecraft:bubble_pop", 0.01), ("minecraft:splash", 0.004)], ambient="bubbling",
              music="minecraft:music.overworld.swamp",
              surface_noise=[("snack_bread_crust", 0.35)],
              features=[
                  Structure(kind="geyser", blocks={"vent": "snack_soda_vent", "mound": "snack_soda_foam"}, size=(4, 7),
                            params={"pools": 1, "height": 1.0}, count=1, chance=2),
                  Patch(block="snack_soda_vent", count=1, tries=4),
                  Patch(block="snack_lettuce", count=3, tries=16),
                  BROCCOLI,
              ],
              spawns=[Spawn("pretzel_snake", 8, (1, 2)), Spawn("cheese_mouse", 8, (2, 3)), Spawn("meatball", 2, (1, 2))]),
    ],
    effects=[],
    ambient="cozy_breeze",
    music="minecraft:music.overworld.meadow",
    icon="portalgun:snack_cheese_wedge",
)
