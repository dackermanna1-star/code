"""O-31 Harvestfall - eternal autumn evening under a giant harvest moon: maple forests, great pumpkins, cornfields."""
import math

import numpy as np
from PIL import Image

from gen.content.dsl import *
from gen.noise import fbm, rng

# ------------------------------------------------------------------------------------------------ palette
# maple crimson / pumpkin orange / harvest gold / bark brown / dusk violet
P_GRASS = ["#6a6a2a", "#7e7a32", "#94883c", "#aa9848", "#c0aa5a"]       # sun-dried autumn turf
P_LOAM = ["#3a2618", "#4a3220", "#5a3e2a", "#6c4c34"]
P_STONE = ["#5e5650", "#6e6660", "#7e7670", "#908882", "#a49c94"]
P_BARK = ["#2e1e16", "#3e2a1e", "#4e3626", "#604430"]
P_CRIMSON = ["#6a1410", "#8e2016", "#b0321e", "#d04a26", "#ea6a34"]
P_AMBER = ["#9a4a10", "#c06a16", "#e08a20", "#f2b030", "#ffd060"]
P_RUSSET = ["#4a2a18", "#6a3a20", "#8a5028", "#a86a36"]
P_PUMPKIN = ["#a04a08", "#c4600c", "#e07a14", "#f09a2a", "#ffc060"]
P_CORN = ["#4a6a24", "#5e8030", "#7a9a3c", "#a0b050", "#d8c868"]
P_EMBER = ["#6a1a08", "#b03a10", "#f06a20", "#ffa040", "#ffe080"]
LEAF_COLS = ["#b0321e", "#d04a26", "#e08a20", "#f2b030", "#8a5028"]


def _hex(c):
    c = c.lstrip("#")
    return np.array([int(c[i:i + 2], 16) for i in (0, 2, 4)], float)


def _ramp(cols, t):
    t = np.clip(t, 0, 0.999) * (len(cols) - 1)
    i = t.astype(int)
    f = (t - i)[..., None]
    c = np.array([_hex(x) for x in cols])
    return c[i] * (1 - f) + c[np.minimum(i + 1, len(cols) - 1)] * f


def _img(rgb, alpha=None):
    a = np.full(rgb.shape[:2] + (1,), 255.0) if alpha is None else alpha[..., None]
    return Image.fromarray(np.clip(np.round(np.concatenate([rgb, a], -1)), 0, 255).astype(np.uint8), "RGBA")


def _leaf(out, x, y, col, R, size=2):
    """Stamp one tiny fallen leaf (a 2-3px diamond with a darker stem pixel) into an RGBA array (wraps)."""
    c = _hex(col)
    shape = [(0, 0), (1, 0), (0, 1), (1, 1)] if size == 2 else [(1, 0), (0, 1), (1, 1), (2, 1), (1, 2)]
    if R.uniform() < 0.5:
        shape = [(b, a) for a, b in shape]
    for dx, dy in shape:
        xi, yi = (x + dx) % 16, (y + dy) % 16
        out[yi, xi, :3] = c * R.uniform(0.85, 1.1)
        out[yi, xi, 3] = 255
    sx, sy = (x + 2 + (size == 3)) % 16, (y + 2 + (size == 3)) % 16
    out[sy, sx, :3] = c * 0.55
    out[sy, sx, 3] = 255


def leaf_litter(cols, seed, count=26):
    """A thick pile of fallen leaves (opaque: a dark russet leaf mat with bright red/orange/gold leaves on top)."""
    out = np.zeros((16, 16, 4), float)
    R = rng(seed)
    base = fbm(16, 16, 4, seed + ":base", 2)
    out[..., :3] = _ramp(["#3e2414", "#5a3418", "#7a4a20"], base)
    out[..., 3] = 255
    for _ in range(count):
        _leaf(out, int(R.integers(0, 16)), int(R.integers(0, 16)), cols[int(R.integers(0, len(cols)))], R,
              size=int(R.choice([2, 3])))
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGBA")


def leafy_turf(base, cols, seed, count=4):
    """Grass top with a few fallen leaves lying on it."""
    a = np.asarray(base.convert("RGBA"), float).copy()
    R = rng(seed + ":leaves")
    for _ in range(count):
        _leaf(a, int(R.integers(0, 16)), int(R.integers(0, 16)), cols[int(R.integers(0, len(cols)))], R, size=2)
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "RGBA")


def pumpkin_rind(pal, seed):
    """Giant pumpkin skin: deep vertical ribs (dark grooves every 4px, lit ridges) with a waxy mottled sheen."""
    yy, xx = np.mgrid[0:16, 0:16]
    n = fbm(16, 16, 4, seed, 2)
    rib = np.abs(((xx + 0.5) % 4) - 2.0) / 2.0          # 1 at groove, 0 at ridge centre
    t = 0.85 - rib * 0.55 + (n - 0.5) * 0.25 + np.sin(yy * 0.4) * 0.03
    rgb = _ramp(pal, t)
    groove = (xx % 4) == 3
    rgb[groove] = _hex(pal[0]) * 0.9
    R = rng(seed + ":fleck")
    for _ in range(5):
        x, y = int(R.integers(0, 16)), int(R.integers(0, 16))
        if not groove[y, x]:
            rgb[y, x] = _hex(pal[4])
    return _img(rgb)


def corn_top(leaf_pal, seed):
    """Upper half of a corn stalk: arching leaves and a golden tassel, with one ripe cob tucked in."""
    out = np.zeros((16, 16, 4), float)
    R = rng(seed)
    cols = [_hex(c) for c in leaf_pal]
    x0 = 7 + int(R.integers(0, 2))
    for y in range(3, 16):
        out[y, x0, :3] = cols[2]
        out[y, x0, 3] = 255
    for (yb, d) in ((13, -1), (9, 1), (6, -1)):         # arching leaves
        x, y = x0, yb
        for k in range(6):
            x += d
            y += -1 if k < 2 else (0 if k < 4 else 1)
            if 0 <= x < 16 and 0 <= y < 16:
                out[y, x, :3] = cols[1 + (k % 2)]
                out[y, x, 3] = 255
    for (dx, dy) in ((0, 0), (-1, 1), (1, 1), (0, 1), (-2, 2), (2, 2), (0, 2)):   # tassel
        out[dy, x0 + dx, :3] = _hex("#e8c860")
        out[dy, x0 + dx, 3] = 255
    for y in range(9, 14):                                # the cob
        out[y, x0 + 1, :3] = _hex("#f0c840") if y % 2 else _hex("#d8a830")
        out[y, x0 + 1, 3] = 255
    out[9, x0 + 2, :3] = cols[1]
    out[9, x0 + 2, 3] = 255
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGBA")


# ------------------------------------------------------------------------------------------------ features
ELDER_MAPLE = GiantPlant(stem="harvestfall_maple_log", head="harvestfall_crimson_leaves", shape="puff", height=(13, 20),
                         radius=(5, 7), stem_width=2, bend=0.2, decoration="harvestfall_amber_leaves", count=1, chance=3)
GREAT_PUMPKIN = Boulder(blocks=[("harvestfall_great_pumpkin", 1)], radius=(3, 5), squash=0.72, count=1, chance=4)
PUMPKINS = Patch(blocks=[("minecraft:pumpkin", 5), ("minecraft:carved_pumpkin", 1), ("minecraft:jack_o_lantern", 1)],
                 count=1, tries=10, spread=5)
LITTER = Patch(blocks=[("minecraft:leaf_litter", 5), ("harvestfall_leaf_litter", 1)], count=5, tries=32, spread=7)
EMBERCAPS = Patch(block="harvestfall_ember_cap", count=2, tries=16)

DIMENSION = Dimension(
    id="harvestfall",
    code="O-31",
    name="Harvestfall",
    tagline="Eternal autumn under the harvest moon",
    description=("The sun is always setting on Harvestfall, and an enormous orange moon is always rising. Maple "
                 "forests burn crimson and gold, leaves drift down forever, and pumpkins grow as big as cottages in the "
                 "fields. Squirrels hoard acorns and crows watch from every branch. Stay out of the cornfields at dusk: "
                 "the Scarecrows there are not holding still."),
    danger=2,
    color="#e07a14",
    terrain=Terrain(style="hills", stone="harvestfall_stone", sea_level=58, height=75, amplitude=17, scale=1.15,
                    roughness=0.18, deepslate="minecraft:deepslate",
                    params={"rivers": 0.35, "detail": 0.4, "biome_size": 280}),
    sky=Sky(sky_color="#7a5a9a", fog_color="#d88a4a", water_fog_color="#3a2a40", fog_start=36, fog_end=180,
            cloud_color="#c0ffb070", cloud_height=170, time=12500, sunrise_color="#ffff8030", ambient_light=0.08,
            sky_light_color="#ffd0a0",
            bodies=[Celestial("moon", ["#ff9a3a", "#ffc070", "#fff0d0"], size=110, yaw=270, pitch=16, roll=8,
                              seed="harvest-moon"),
                    Celestial("moon", ["#e0d0e8"], size=16, yaw=300, pitch=40, alpha=0.6, seed="harvest-small-moon")]),
    blocks=[
        Block("harvestfall_grass", "Autumn Turf", "grass", {
            "top": tex(leafy_turf, tex("grass_top", P_GRASS, seed="harvest-grass"), LEAF_COLS, "harvest-grass", 3),
            "side": tex("grass_side", P_GRASS, P_LOAM, seed="harvest-grass"),
            "bottom": tex("dirt", P_LOAM, seed="harvest-loam")}, hardness=0.6, sound="grass", map_color="color_yellow"),
        Block("harvestfall_loam", "Harvest Loam", "soil", {"all": tex("dirt", P_LOAM, seed="harvest-loam")}, hardness=0.5,
              sound="rooted_dirt", map_color="dirt"),
        Block("harvestfall_stone", "Hearthstone", "stone", {"all": tex("stone", P_STONE, seed="harvest-stone")},
              hardness=1.5, map_color="stone"),
        Block("harvestfall_maple_log", "Maple Log", "log", {
            "side": tex("log_side", P_BARK, seed="harvest-bark"),
            "end": tex("log_top", P_BARK, ["#c08a5a", "#a87448"], seed="harvest-bark-end")}, hardness=2.0, sound="wood",
              map_color="color_brown", flammable=True),
        Block("harvestfall_crimson_leaves", "Crimson Maple Leaves", "leaves", {
            "all": tex("leaves", P_CRIMSON, seed="harvest-crimson", holes=0.22)}, hardness=0.2, sound="leaves",
              map_color="color_red", flammable=True, drop="harvestfall_acorn"),
        Block("harvestfall_amber_leaves", "Amber Maple Leaves", "leaves", {
            "all": tex("leaves", P_AMBER, seed="harvest-amber", holes=0.22)}, hardness=0.2, sound="leaves",
              map_color="color_orange", flammable=True, drop="harvestfall_acorn"),
        Block("harvestfall_russet_leaves", "Russet Leaves", "leaves", {
            "all": tex("leaves", P_RUSSET, seed="harvest-russet", holes=0.5)}, hardness=0.2, sound="leaves",
              map_color="color_brown", flammable=True),
        Block("harvestfall_leaf_litter", "Leaf Pile", "carpet", {"all": tex(leaf_litter, LEAF_COLS, "harvest-litter")},
              hardness=0.0, sound="leaf_litter", map_color="color_orange", flammable=True),
        Block("harvestfall_great_pumpkin", "Great Pumpkin Rind", "solid", {
            "all": tex(pumpkin_rind, P_PUMPKIN, "harvest-rind")}, hardness=1.0, sound="wood", tool="axe",
              map_color="color_orange"),
        Block("harvestfall_corn_stalk", "Corn Stalk", "tall_plant", {
            "bottom": tex("tall_plant_bottom", P_CORN, seed="harvest-corn"),
            "top": tex(corn_top, P_CORN, "harvest-corn-top")}, hardness=0.0, sound="crop", fruit="harvestfall_sweetcorn",
              drop_count=(1, 2), map_color="color_yellow"),
        Block("harvestfall_ember_cap", "Ember Cap", "plant", {
            "cross": tex("mushroom_sprite", P_EMBER, ["#c8a888", "#e0c8a8", "#f0e0c8"], seed="harvest-ember",
                         shape="cluster")}, hardness=0.0, sound="fungus", light=7, emissive=True,
              particle="minecraft:small_flame", map_color="color_orange"),
        Block("harvestfall_goldenrod", "Goldenrod", "tall_plant", {
            "bottom": tex("tall_plant_bottom", ["#4a5a24", "#5e7030", "#7a8a3c", "#98a04a"], seed="harvest-rod"),
            "top": tex("flower", ["#4a5a24", "#5e7030", "#7a8a3c"], ["#d8a020", "#f0c030", "#ffe060"], seed="harvest-rod",
                       shape="bell")}, hardness=0.0, sound="grass", map_color="color_yellow"),
    ],
    items=[
        Item("harvestfall_candy_corn", "Candy Corn", tex("item_icon", "candy", ["#f0f0e0", "#f0a020", "#f06010"],
                                                         seed="harvest-candycorn"),
             kind="food", food=Food(2, 0.2, always=True, fast=True, effects=[Effect("minecraft:speed", 20, 1)]),
             lore="Found stuffed in a scarecrow's pockets. Nobody knows who put it there."),
        Item("harvestfall_acorn", "Golden Acorn", tex("item_icon", "seed", ["#7a4a1a", "#c08a30", "#f0c860"],
                                                      seed="harvest-acorn"),
             kind="food", food=Food(1, 0.4, fast=True), lore="Squirrels will follow you anywhere for one of these."),
        Item("harvestfall_sweetcorn", "Sweetcorn", tex("item_icon", "fruit", ["#c09010", "#f0c840", "#fff0a0"],
                                                       seed="harvest-sweetcorn"),
             kind="food", food=Food(5, 0.6, effects=[Effect("minecraft:saturation", 1, 0, chance=0.3)]),
             lore="Sweet enough to eat raw, warm from the evening sun."),
    ],
    creatures=[
        Creature("scarecrow", "Scarecrow", "biped", ["#8a6a3e", "#e8801a", "#b8560e", "#ffd040", "#4a3020"],
                 pattern="patches", size=1.12,
                 body={"thin": True, "stance": "hunched", "head": "pumpkin", "head_size": 1.1, "arms": 2, "arm_len": 13,
                       "leg_len": 13, "torso_w": 8, "torso_h": 11, "torso_d": 4, "eye_style": "glow", "eyes": 2,
                       "mouth": "grin", "claws": True},
                 behavior="hostile", health=26, damage=4, speed=0.24, armor=2, abilities=["leap"],
                 on_hit=Effect("minecraft:slowness", 3), fire_immune=False,
                 drops=[Drop("harvestfall_candy_corn", 1, 3), Drop("minecraft:wheat", 0, 2),
                        Drop("minecraft:pumpkin_seeds", 0, 2)],
                 sounds="skeleton", pitch=0.6, xp=6, group=2,
                 description="Stuffed with straw and something else. Its grin is carved, its eyes are not."),
        Creature("acorn_squirrel", "Acorn Squirrel", "quadruped", ["#b8602a", "#f0d8b0", "#6a3418", "#100808", "#e08a40"],
                 pattern="gradient", size=0.42,
                 body={"leg_len": 4, "body_len": 9, "body_h": 6, "body_w": 6, "head_size": 1.25, "ears": "pointy",
                       "tail": 5, "tail_len": 3, "tail_kind": "curl", "eye_style": "cute", "eye_size": 2, "snout": 1,
                       "fur": True},
                 behavior="skittish", health=6, speed=0.34, abilities=["climb"], tempt="harvestfall_acorn",
                 drops=[Drop("harvestfall_acorn", 0, 2)],
                 sounds="fox", pitch=1.7, xp=1, group=3,
                 description="Collects acorns, buries them, forgets them, and blames you."),
        Creature("crow", "Crow", "flyer", ["#1a1a26", "#34344a", "#3a3020", "#c0c0d0", "#4a3a6a"],
                 pattern="gradient", size=0.6, glow_eyes=False,
                 body={"kind": "bird", "beak": 3, "wing_span": 11, "body_len": 8, "tail": 2, "tail_kind": "feather",
                       "eye_style": "round", "legs": 2},
                 behavior="passive", health=6, speed=0.28,
                 drops=[Drop("minecraft:feather", 0, 2)],
                 sounds="parrot", pitch=0.5, xp=1, group=4,
                 description="Sits on scarecrows. Not afraid of them. Should be."),
    ],
    biomes=[
        Biome("harvestfall_crimson_maplewood", "Crimson Maplewood", top="harvestfall_grass", under="harvestfall_loam",
              temperature=0.0, humidity=0.4, elevation=0.2, grass_color="#94883c", foliage_color="#b0321e",
              water_color="#4a6a8a", water_fog_color="#2a3040",
              particles=[("dust:#d04a26:1.0", 0.004), ("dust:#f2b030:0.8", 0.002)], ambient="cozy_breeze",
              music="minecraft:music.overworld.old_growth_taiga",
              features=[
                  ELDER_MAPLE,
                  Tree(log="harvestfall_maple_log", leaves="harvestfall_crimson_leaves", shape="fancy", height=(7, 11),
                       count=3),
                  Tree(log="harvestfall_maple_log", leaves="harvestfall_amber_leaves", shape="oak", height=(5, 7), count=1),
                  LITTER,
                  Patch(blocks=[("minecraft:leaf_litter", 3), ("minecraft:short_grass", 2), ("minecraft:fern", 1)],
                        count=3, tries=24),
                  EMBERCAPS,
                  PUMPKINS,
              ],
              spawns=[Spawn("acorn_squirrel", 14, (2, 4)), Spawn("crow", 8, (2, 4)), Spawn("scarecrow", 2, (1, 1))]),
        Biome("harvestfall_amber_grove", "Amber Grove", top="harvestfall_grass", under="harvestfall_loam",
              temperature=0.6, humidity=-0.2, elevation=0.0, grass_color="#aa9848", foliage_color="#e08a20",
              water_color="#4a6a8a", water_fog_color="#2a3040",
              particles=[("dust:#f2b030:1.0", 0.004), ("minecraft:white_ash", 0.002)], ambient="cozy_breeze",
              music="minecraft:music.overworld.forest",
              features=[
                  Tree(log="harvestfall_maple_log", leaves="harvestfall_amber_leaves", shape="fancy", height=(6, 10),
                       count=2),
                  Tree(log="minecraft:birch_log", leaves="harvestfall_amber_leaves", shape="birch", height=(5, 8), count=2),
                  Patch(block="harvestfall_goldenrod", count=2, tries=12, spread=4),
                  LITTER,
                  Patch(blocks=[("minecraft:short_grass", 4), ("minecraft:sweet_berry_bush", 1)], count=2, tries=24),
              ],
              spawns=[Spawn("acorn_squirrel", 12, (2, 4)), Spawn("crow", 6, (1, 3)), Spawn("scarecrow", 1, (1, 1))]),
        Biome("harvestfall_pumpkin_fields", "Pumpkin Fields", top="harvestfall_grass", under="harvestfall_loam",
              temperature=-0.6, humidity=-0.5, elevation=-0.1, grass_color="#c0aa5a", foliage_color="#e08a20",
              water_color="#4a6a8a", water_fog_color="#2a3040", fog_color="#e09858",
              particles=[("minecraft:white_ash", 0.003), ("dust:#e07a14:0.7", 0.002)], ambient="wind_howl",
              music="minecraft:music.overworld.meadow",
              features=[
                  GREAT_PUMPKIN,
                  Patch(block="harvestfall_corn_stalk", count=10, tries=64, spread=8),
                  PUMPKINS,
                  Patch(blocks=[("minecraft:pumpkin", 4), ("minecraft:jack_o_lantern", 1)], count=2, tries=12),
                  Vanilla(id="minecraft:pile_hay"),
                  Patch(blocks=[("harvestfall_goldenrod", 1), ("minecraft:short_grass", 4)], count=2, tries=20),
                  Tree(log="harvestfall_maple_log", leaves="harvestfall_crimson_leaves", shape="oak", height=(5, 7),
                       count=1, chance=3),
              ],
              spawns=[Spawn("crow", 12, (3, 5)), Spawn("scarecrow", 5, (1, 2)), Spawn("acorn_squirrel", 4, (1, 2))]),
        Biome("harvestfall_gloomhollow", "Gloomhollow", top="harvestfall_loam", under="harvestfall_loam",
              temperature=-0.3, humidity=0.9, elevation=0.4, grass_color="#6a6a2a", foliage_color="#6a3a20",
              water_color="#2a3a4a", water_fog_color="#1a2028", fog_color="#6a4a5a", fog_end=90,
              particles=[("minecraft:ash", 0.006), ("minecraft:small_flame", 0.0006)], ambient="eerie_choir",
              music="minecraft:music.overworld.deep_dark",
              surface_noise=[("harvestfall_grass", 0.45)],
              features=[
                  Tree(log="harvestfall_maple_log", leaves="harvestfall_russet_leaves", shape="twisted", height=(6, 10),
                       count=3),
                  Tree(log="minecraft:dark_oak_log", leaves="harvestfall_russet_leaves", shape="dark_oak", height=(6, 8),
                       count=1),
                  Patch(block="harvestfall_ember_cap", count=4, tries=24),
                  LITTER,
                  Patch(block="minecraft:cobweb", count=1, tries=6),
                  Patch(block="minecraft:jack_o_lantern", count=1, tries=4, chance=2),
              ],
              spawns=[Spawn("crow", 12, (3, 6)), Spawn("scarecrow", 4, (1, 2))]),
    ],
    effects=[],
    ambient="cozy_breeze",
    music="minecraft:music.overworld.old_growth_taiga",
    icon="portalgun:harvestfall_candy_corn",
)
