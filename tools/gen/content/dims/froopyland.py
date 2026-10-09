"""C-500A Froopyland - a pastel candy paradise of frosting hills, gumdrop groves and chocolate rivers."""
import math
from dataclasses import replace

import numpy as np
from PIL import Image

from gen.content.dsl import *
from gen.noise import fbm, rng

# ------------------------------------------------------------------------------------------------ palette
P_FROST = ["#e8679c", "#f585b4", "#ffa6c9", "#ffc8de", "#ffe6f0"]      # strawberry frosting
P_MINT = ["#5cc9a7", "#78dcb9", "#98ecc9", "#bdf6dc", "#e0fff0"]       # mint frosting
P_CAKE = ["#c98a45", "#dca25a", "#ecbd76", "#f8d79c"]                  # sponge cake
P_FUDGE = ["#3a1d10", "#4f2a17", "#663821", "#7d4a2d", "#94603e"]      # fudge rock
P_SUGAR = ["#eadccb", "#f5eadb", "#fff6ea", "#ffffff"]                 # sugar sand
P_COTTON = ["#ff8cc6", "#ffa8d4", "#ffc4e2", "#ffdcee", "#fff2f8"]     # cotton candy
P_GUM = ["#c0163a", "#e02a50", "#ff4d6d", "#ff8296", "#ffc0cb"]        # cherry gumdrop
P_ROCKCANDY = ["#7fb4ff", "#a6cbff", "#d2b8ff", "#f3d4ff", "#ffffff"]  # rock candy
SPRINKLES = ["#ff5d73", "#ffd34e", "#5bd0ff", "#7ee081", "#c58bff", "#ffffff"]


# ------------------------------------------------------------------------------------------------ custom textures
def _hex(c):
    c = c.lstrip("#")
    return np.array([int(c[i:i + 2], 16) for i in (0, 2, 4)], float)


def _ramp(pal, t):
    cols = np.array([_hex(c) for c in pal])
    t = np.clip(t, 0, 1) * (len(cols) - 1)
    i = np.clip(np.floor(t).astype(int), 0, len(cols) - 2)
    f = (t - i)[..., None]
    return cols[i] * (1 - f) + cols[i + 1] * f


def _img(rgb, alpha=None):
    a = np.zeros(rgb.shape[:2] + (4,), np.uint8)
    a[..., :3] = np.clip(np.round(rgb), 0, 255)
    a[..., 3] = 255 if alpha is None else alpha
    return Image.fromarray(a, "RGBA")


def _quant(v, n):
    return np.round(np.clip(v, 0, 1) * (n - 1)) / (n - 1)


def sprinkle_sand(pal, seed, density=0.16):
    """Fine sugar sand dotted with rainbow sprinkles (1x2 / 2x1 dashes)."""
    n = fbm(16, 16, 4, seed + ":s", 2) * 0.55 + rng(seed + ":w").random((16, 16)) * 0.45
    rgb = _ramp(pal, _quant(n, 4))
    R = rng(seed + ":sp")
    for i in range(4):
        for j in range(4):
            if R.random() > density * 5:
                continue
            x, y = i * 4 + int(R.integers(0, 3)), j * 4 + int(R.integers(0, 3))
            col = _hex(SPRINKLES[int(R.integers(0, len(SPRINKLES)))])
            rgb[y % 16, x % 16] = col
            if R.random() < 0.5:
                rgb[(y + 1) % 16, x % 16] = col * 0.82
            else:
                rgb[y % 16, (x + 1) % 16] = col * 0.82
    return _img(rgb)


def frosting_side(frost_pal, cake_pal, seed):
    """Cake side with a thick glossy frosting layer dripping down over it."""
    from gen import textures as T
    cake = np.asarray(T.sponge(cake_pal, seed + ":cake").convert("RGBA"), float)
    top = np.asarray(T.frosting(frost_pal, seed + ":top", sprinkles=True).convert("RGBA"), float)
    out = cake.copy()
    R = rng(seed + ":drip")
    depth = 3 + np.round(fbm(16, 1, 4, seed + ":d", 2)[0] * 3).astype(int)
    for x in range(16):
        d = int(depth[x])
        if R.random() < 0.22:
            d += int(R.integers(2, 6))          # long drips
        d = min(d, 12)
        out[:d, x] = top[:d, x]
        out[d - 1, x, :3] = _hex(frost_pal[1])   # drip rim shading
        if d < 16:
            out[d, x, :3] = out[d, x, :3] * 0.72  # shadow under the drip
    out[0, :, :3] = np.minimum(out[0, :, :3] * 1.08, 255)
    return _img(out[..., :3])


def candy_swirl(colors, seed, turns=2.2, arms=None):
    """Spiral lollipop swirl (any number of colours), glossy highlight top-left."""
    arms = arms or len(colors)
    yy, xx = np.mgrid[0:16, 0:16]
    dx, dy = xx - 7.5, yy - 7.5
    r = np.hypot(dx, dy)
    ang = np.arctan2(dy, dx)
    off = rng(seed).random() * 2 * math.pi
    t = ((ang + off) / (2 * math.pi) * arms + r / 16.0 * turns * arms) % arms
    idx = np.floor(t).astype(int) % len(colors)
    cols = np.array([_hex(c) for c in colors])
    rgb = cols[idx]
    edge = (t % 1.0)
    rgb = rgb * (0.86 + 0.14 * np.sin(edge * math.pi))[..., None]
    shine = np.clip(1.0 - np.hypot(xx - 4.5, yy - 4.0) / 3.2, 0, 1)
    rgb = rgb + (255 - rgb) * (shine[..., None] * 0.6)
    return _img(rgb)


def candy_cane_end(seed):
    return candy_swirl(["#e8263f", "#fff6f6"], seed, turns=1.4, arms=4)


def gumdrop(pal, seed):
    """Translucent jelly with a crust of sugar crystals."""
    n = fbm(16, 16, 6, seed, 3)
    yy, xx = np.mgrid[0:16, 0:16]
    t = 0.35 + 0.45 * n - 0.15 * (yy / 15.0) + 0.1 * (xx / 15.0)
    rgb = _ramp(pal, _quant(t, 5))
    alpha = np.full((16, 16), 215, np.uint8)
    R = rng(seed + ":sugar").random((16, 16))
    sugar = R > 0.86
    rgb[sugar] = rgb[sugar] * 0.35 + 255 * 0.65
    alpha[sugar] = 250
    edge = (xx == 0) | (yy == 0) | (xx == 15) | (yy == 15)
    rgb[edge] = rgb[edge] * 0.85
    alpha[edge] = 235
    return _img(rgb, alpha)


# ------------------------------------------------------------------------------------------------ dimension
GUMDROP_TREES = [
    GiantPlant(stem="froopy_candy_cane", head="froopy_gumdrop", shape="dome", height=(5, 9), radius=(3, 4), count=1),
    GiantPlant(stem="froopy_candy_cane", head="minecraft:slime_block", shape="dome", height=(4, 8), radius=(2, 4), count=1),
    GiantPlant(stem="froopy_candy_cane", head="minecraft:honey_block", shape="sphere", height=(4, 7), radius=(2, 3), count=1,
               chance=2),
]

DIMENSION = Dimension(
    id="froopyland",
    code="C-500A",
    name="Froopyland",
    tagline="Frosting hills, gumdrop trees and rivers of chocolate",
    description=("A sugar-coated paradise of pink frosting hills, gumdrop groves and giant swirl lollipops, cut "
                 "by slow rivers of chocolate. Gummy bears wobble across the meadows and Lollicorns graze the mint "
                 "frosting. Mind the Jawbreakers on the rock candy ridges - they bounce harder than they look."),
    danger=1,
    color="#ff8fc8",
    terrain=Terrain(style="hills", stone="froopy_fudge_stone", sea_level=60, height=76, amplitude=13, scale=1.7,
                    roughness=0.04, caves=True, ores=False,
                    params={"rivers": 0.7, "detail": 0.12, "beach_block": "froopy_sprinkle_sand", "beach_height": 1,
                            "biome_size": 300, "springs": 4}),
    sky=Sky(sky_color="#9fd9ff", fog_color="#ffd9ee", water_fog_color="#3b1c0c", cloud_color="#f0ffe6f4",
            cloud_height=150, time="day",
            bodies=[Celestial("ringed_planet", ["#ff8cc6", "#ffe1a8", "#a8f0d8", "#ffffff"], size=48, yaw=200, pitch=40,
                              roll=-12, seed="froopy-candyplanet"),
                    Celestial("moon", ["#d8c4ff"], size=22, yaw=95, pitch=48, roll=20,
                              seed="froopy-ringlet")]),
    blocks=[
        Block("froopy_frosting", "Strawberry Frosting", "grass", {
            "top": tex("frosting", P_FROST, seed="froopy-frost"),
            "side": tex(frosting_side, P_FROST, P_CAKE, "froopy-frost-side"),
            "bottom": tex("sponge", P_CAKE, seed="froopy-cake")}, hardness=0.5, sound="snow", map_color="color_pink"),
        Block("froopy_mint_frosting", "Mint Frosting", "grass", {
            "top": tex("frosting", P_MINT, seed="froopy-mint"),
            "side": tex(frosting_side, P_MINT, P_CAKE, "froopy-mint-side"),
            "bottom": tex("sponge", P_CAKE, seed="froopy-cake")}, hardness=0.5, sound="snow", map_color="emerald"),
        Block("froopy_cake", "Sponge Cake", "soil", {"all": tex("sponge", P_CAKE, seed="froopy-cake")}, hardness=0.5,
              sound="wool", map_color="sand"),
        Block("froopy_fudge_stone", "Fudge Stone", "stone", {"all": tex("chocolate", P_FUDGE, seed="froopy-fudge")},
              hardness=1.2, sound="mud_bricks", map_color="color_brown"),
        Block("froopy_sprinkle_sand", "Sprinkle Sand", "sand", {"all": tex(sprinkle_sand, P_SUGAR, "froopy-sprinkles")},
              hardness=0.5, sound="sand", map_color="snow"),
        Block("froopy_candy_cane", "Candy Cane Log", "log", {
            "side": tex("candy_stripe", "#e8263f", "#fff6f6", seed="froopy-cane", width=3),
            "end": tex(candy_cane_end, "froopy-cane-end")}, hardness=1.5, sound="bone", map_color="color_red"),
        Block("froopy_gumdrop", "Cherry Gumdrop", "slime", {"all": tex(gumdrop, P_GUM, "froopy-gumdrop")},
              hardness=0.3, sound="honey", map_color="color_red", bounce=0.7),
        Block("froopy_lollipop_swirl", "Lollipop Swirl", "solid", {
            "all": tex(candy_swirl, ["#ff3f8e", "#fff0f8", "#b46bff", "#fff0f8"], "froopy-swirl", turns=1.6)},
              hardness=0.8, sound="glass", tool="pickaxe", map_color="color_magenta"),
        Block("froopy_cotton_candy", "Cotton Candy", "solid", {"all": tex("cloud", P_COTTON, seed="froopy-cotton")},
              hardness=0.2, sound="wool", tool="hoe", map_color="color_pink", bounce=0.55, flammable=True),
        Block("froopy_lollipop", "Lollipop Flower", "plant", {
            "cross": tex("lollipop_plant", "#fff4f4", ["#ff5d9e", "#ff9cc8", "#fff1f8"], seed="froopy-lolli")},
              hardness=0.0, sound="cherry_sapling", map_color="color_pink"),
        Block("froopy_rock_candy", "Rock Candy Sprout", "crystal_cluster", {
            "cross": tex("crystal_shard_sprite", P_ROCKCANDY, seed="froopy-rc-sprout", count=4)},
              hardness=0.3, sound="amethyst_cluster", light=6, emissive=True, map_color="color_light_blue"),
        Block("froopy_rock_candy_block", "Rock Candy", "crystal_block", {
            "all": tex("crystal", P_ROCKCANDY, seed="froopy-rockcandy", shards=8)},
              hardness=1.0, sound="amethyst", light=9, emissive=True, map_color="color_light_blue"),
    ],
    items=[
        Item("froopy_gummy", "Gummy Chunk", tex("item_icon", "jelly", P_GUM, seed="froopy-gummy"), kind="food",
             food=Food(3, 0.4, fast=True, effects=[Effect("minecraft:jump_boost", 20, 1)]),
             lore="Still wobbling. So are your knees."),
        Item("froopy_horn_candy", "Lollicorn Horn Candy", tex("item_icon", "horn", ["#ff7ad9", "#ffd0f0", "#7af0ff"],
                                                              seed="froopy-horn"),
             kind="food", rarity="uncommon", glint=True,
             food=Food(6, 0.8, always=True, effects=[Effect("minecraft:regeneration", 8, 1), Effect("minecraft:speed", 30, 0)]),
             lore="Shed every spring. Tastes like a rainbow's aftertaste."),
        Item("froopy_jawbreaker_shard", "Jawbreaker Shard", tex("item_icon", "candy", ["#ff3060", "#ffffff", "#3080ff"],
                                                                  seed="froopy-jaw"),
             kind="food", food=Food(2, 1.2, effects=[Effect("minecraft:resistance", 30, 0)]),
             lore="Do not bite. Suck patiently for roughly three weeks."),
    ],
    creatures=[
        Creature("gummy_bear", "Gummy Bear", "quadruped", ["#ff3d5a", "#ff9fb0", "#ffe46b", "#3a0a14"],
                 pattern="plain", size=0.8,
                 body={"translucent": True, "ears": "round", "leg_len": 5, "leg_w": 4, "body_len": 10, "body_h": 10,
                       "body_w": 10, "head_size": 1.4, "snout": 2, "eye_style": "cute", "eye_size": 2, "mouth": "smile",
                       "blush": True, "tail": 0, "belly": True},
                 behavior="passive", health=10, speed=0.2, tempt="minecraft:sugar",
                 drops=[Drop("froopy_gummy", 1, 2)], sounds="panda", pitch=1.6, xp=2, group=4,
                 description="A wobbly, translucent bear made of cherry gelatin. Follows anyone carrying sugar."),
        Creature("lollicorn", "Lollicorn", "quadruped", ["#fff4fb", "#ff7ad9", "#7af0ff", "#5a2a8a", "#ffd34e"],
                 pattern="patches", size=1.0,
                 body={"horns": "unicorn", "mane": True, "neck": 7, "neck_angle": 55, "leg_len": 11, "leg_w": 3,
                       "body_len": 14, "body_h": 8, "hooves": True, "tail": 3, "tail_kind": "bushy", "ears": "pointy",
                       "eye_style": "cute", "blush": True, "glow_tips": True},
                 behavior="passive", health=20, speed=0.3, tempt="minecraft:sugar",
                 drops=[Drop("froopy_horn_candy", 0, 1, chance=0.35), Drop("minecraft:sugar", 1, 3)],
                 sounds="horse", pitch=1.4, xp=3, group=3,
                 description="A candy-striped pony whose horn is a sugar spiral. It regrows the horn every spring."),
        Creature("jawbreaker", "Jawbreaker", "blob", ["#3a7dff", "#ff3d7a", "#ffe14d", "#101010", "#ffffff"],
                 pattern="gradient", size=0.75,
                 body={"shape": "round", "blob_size": 12, "eye_style": "angry", "brows": True, "mouth": "fangs"},
                 behavior="hostile", attack="melee", movement="hopping", abilities=["leap"], health=12, damage=3,
                 speed=0.32, armor=4, category="monster",
                 drops=[Drop("froopy_jawbreaker_shard", 0, 2), Drop("minecraft:sugar", 0, 2)],
                 sounds="slime", pitch=1.5, xp=5, group=2,
                 description="A layered hard candy with a grudge. It bounces at you jaw-first."),
    ],
    biomes=[
        Biome("frosting_meadows", "Frosting Meadows", top="froopy_frosting", under="froopy_cake", temperature=0.1,
              humidity=-0.5, elevation=0.0, underwater="froopy_fudge_stone", grass_color="#ffa6c9", foliage_color="#ff9cc8",
              water_color="#6e3a1c", water_fog_color="#3b1c0c", particles=[("dust:#ffd0ea:1.0", 0.004)],
              ambient="candy_chime", music="minecraft:music.overworld.cherry_grove",
              features=[
                  Patch(block="froopy_lollipop", count=4, tries=24),
                  Patch(blocks=[("minecraft:pink_tulip", 3), ("minecraft:allium", 2), ("minecraft:oxeye_daisy", 2),
                                ("minecraft:cornflower", 2)], count=2, tries=20),
                  Patch(block="minecraft:pink_petals", count=2, tries=16),
                  GiantPlant(stem="froopy_candy_cane", head="froopy_lollipop_swirl", shape="sphere", height=(9, 14),
                             radius=(3, 4), count=1, chance=3),
                  replace(GUMDROP_TREES[0], chance=3),
                  Boulder(blocks=[("froopy_cotton_candy", 1)], radius=(3, 6), squash=0.45, where="air", count=1, chance=5),
                  Structure(kind="arch", blocks={"main": "froopy_lollipop_swirl", "alt": "froopy_rock_candy_block"},
                            size=(6, 10), chance=24),
              ],
              spawns=[Spawn("gummy_bear", 12, (2, 4)), Spawn("lollicorn", 8, (1, 3))]),
        Biome("gumdrop_grove", "Gumdrop Grove", top="froopy_mint_frosting", under="froopy_cake", temperature=-0.9,
              humidity=-0.1, elevation=0.1, underwater="froopy_fudge_stone", grass_color="#98ecc9", foliage_color="#78dcb9",
              water_color="#6e3a1c", water_fog_color="#3b1c0c", particles=[("dust:#c8ffe6:0.9", 0.004)],
              ambient="candy_chime", music="minecraft:music.overworld.flower_forest",
              features=[
                  *GUMDROP_TREES,
                  replace(GUMDROP_TREES[0], count=2),
                  GiantPlant(stem="froopy_candy_cane", head="froopy_lollipop_swirl", shape="sphere", height=(11, 16),
                             radius=(3, 5), count=1, chance=2),
                  Patch(block="froopy_lollipop", count=3, tries=16),
                  Patch(blocks=[("minecraft:allium", 1), ("minecraft:pink_tulip", 1)], count=1, tries=12),
              ],
              spawns=[Spawn("gummy_bear", 14, (3, 5)), Spawn("lollicorn", 4, (1, 2))]),
        Biome("rock_candy_ridge", "Rock Candy Ridge", top="froopy_sprinkle_sand", under="froopy_cake", temperature=0.2,
              humidity=0.8, elevation=0.8, underwater="froopy_fudge_stone", grass_color="#ffe6f0",
              water_color="#6e3a1c", water_fog_color="#3b1c0c", particles=[("minecraft:end_rod", 0.0015)],
              ambient="crystal_chimes", music="minecraft:music.overworld.meadow",
              surface_noise=[("froopy_frosting", 0.45)],
              features=[
                  Spire(blocks=[("froopy_rock_candy_block", 1)], tip="froopy_rock_candy", height=(7, 16), radius=(1, 2),
                        lean=0.25, count=1, chance=2),
                  CrystalCluster(block="froopy_rock_candy_block", small="froopy_rock_candy", size=(3, 6), count=1),
                  Patch(block="froopy_rock_candy", count=3, tries=16),
                  Boulder(blocks=[("froopy_fudge_stone", 3), ("froopy_cake", 1)], radius=(2, 3), count=1, chance=3),
                  Patch(block="froopy_lollipop", count=1, tries=8),
              ],
              spawns=[Spawn("jawbreaker", 6, (1, 2)), Spawn("lollicorn", 6, (1, 2)), Spawn("gummy_bear", 4, (1, 2))]),
        Biome("cotton_candy_shores", "Cotton Candy Shores", top="froopy_sprinkle_sand", under="froopy_cake",
              temperature=-0.8, humidity=0.4, elevation=-0.7, underwater="froopy_fudge_stone", grass_color="#ffc8de",
              water_color="#6e3a1c", water_fog_color="#3b1c0c", particles=[("minecraft:cherry_leaves", 0.003)],
              ambient="cozy_breeze", music="minecraft:music.overworld.cherry_grove",
              features=[
                  Boulder(blocks=[("froopy_cotton_candy", 1)], radius=(2, 4), squash=0.7, count=1, chance=2),
                  Boulder(blocks=[("froopy_cotton_candy", 1)], radius=(3, 7), squash=0.4, where="air", count=1, chance=2),
                  Patch(block="froopy_lollipop", count=2, tries=12),
                  replace(GUMDROP_TREES[1], chance=4),
              ],
              spawns=[Spawn("gummy_bear", 10, (2, 4)), Spawn("jawbreaker", 2, (1, 1))]),
    ],
    effects=[],
    ambient="candy_chime",
    music="minecraft:music.overworld.cherry_grove",
    icon="portalgun:froopy_gummy",
)
