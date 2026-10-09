"""A-97 Aviary Spires - stone spires a hundred blocks tall rise out of a sea of cloud; giant birds nest on top."""
import numpy as np
from PIL import Image

from gen.content.dsl import *
from gen.noise import fbm, rng

# ------------------------------------------------------------------------------------------------ palette
# slate blue rock / mist white / sage moss / straw nest / sky-egg blue / dawn pink
P_GRASS = ["#4a6a4a", "#5a7e56", "#6c9462", "#82aa72", "#9cc088"]
P_LOAM = ["#3a3a40", "#4a4a52", "#5a5a64", "#6c6c76"]
P_ROCK = ["#4a5468", "#5a6478", "#6a768a", "#7e8a9e", "#96a2b4"]
P_BAND = ["#7e8a9e", "#8a96aa", "#96a2b4"]
P_CLOUD = ["#c4ccd8", "#d8e0ea", "#ecf0f6", "#ffffff"]
P_TWIG = ["#6a4a2a", "#7e5a34", "#94703e", "#aa8448", "#c4a060"]
P_EGG = ["#6aa8c8", "#8ac4dc", "#aad8ea", "#cceaf4"]
P_WINDLEAF = ["#2e5a50", "#3e7062", "#528874", "#6ca088", "#8cbca0"]
P_PLUME = ["#8a8270", "#a8a088", "#c8c0a8", "#e6e0cc", "#fbf8ee"]
P_BLOSSOM = ["#c05a7a", "#e07a98", "#f4a0b8", "#ffd0dc"]
P_ICE = ["#6a9ad0", "#9ac4f0", "#c8e4ff", "#f0f8ff"]
DAWN = "#f4a0b8"


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


def strata(pal, band_pal, seed):
    """Wind-carved sedimentary rock: wavy horizontal beds, pale bands of limestone and thin dark partings."""
    yy, xx = np.mgrid[0:16, 0:16]
    n = fbm(16, 16, 4, seed, 3)
    wave = np.sin(xx * np.pi / 8 + 0.7) * 0.6
    bed = (yy + wave + (n - 0.5) * 2.0)
    t = 0.45 + (n - 0.5) * 0.6 + np.sin(bed * np.pi / 4) * 0.12
    rgb = _ramp(pal, np.round(t * 6) / 6)
    pale = (np.abs(((bed + 16) % 8) - 2.5) < 0.9)
    rgb[pale] = _ramp(band_pal, n[pale])
    parting = np.abs(((bed + 16) % 8) - 6.2) < 0.45
    rgb[parting] = _hex(pal[0]) * 0.92
    return _img(rgb)


def woven_twigs(pal, seed):
    """Giant nest material: a criss-cross weave of sticks, with dark gaps and pale straw strands."""
    yy, xx = np.mgrid[0:16, 0:16]
    R = rng(seed)
    n = fbm(16, 16, 4, seed, 2)
    rgb = np.tile(_hex(pal[0]) * 0.85, (16, 16, 1))
    for k in range(7):
        d = R.choice([1, -1])
        off = R.uniform(0, 16)
        w = R.uniform(0.9, 1.6)
        s = ((xx * d + yy * 0.55 * (1 if k % 2 else -1) + off) % 16)
        m = np.abs(s - 8) < w
        shade = 0.35 + 0.5 * (1 - np.abs(s - 8) / w) + (n - 0.5) * 0.3
        rgb[m] = _ramp(pal, shade)[m]
    for _ in range(5):
        x, y = int(R.integers(0, 16)), int(R.integers(0, 16))
        for j in range(3):
            rgb[(y + j) % 16, (x + j) % 16] = _hex(pal[4])
    return _img(rgb)


def speckled_egg(pal, seed):
    """Sky-blue eggshell with brown speckles and a soft highlight."""
    yy, xx = np.mgrid[0:16, 0:16]
    n = fbm(16, 16, 6, seed, 2)
    rgb = _ramp(pal, 0.35 + n * 0.45 + ((16 - yy - xx) / 32.0) * 0.25)
    R = rng(seed + ":sp")
    for _ in range(14):
        x, y = int(R.integers(0, 16)), int(R.integers(0, 16))
        rgb[y, x] = _hex("#5a3a24") if R.uniform() < 0.6 else _hex("#8a6a4a")
    return _img(rgb)


def updraft_top(pal, seed):
    """A wind-hole in the rock: concentric pale rings of scoured stone around a dark throat with swirl lines."""
    yy, xx = np.mgrid[0:16, 0:16]
    base = np.asarray(strata(P_ROCK, P_BAND, seed), float)[..., :3]
    dx, dy = xx - 7.5, yy - 7.5
    d = np.hypot(dx, dy)
    ang = np.arctan2(dy, dx)
    swirl = (np.sin(ang * 3 + d * 1.2) > 0.6) & (d < 6.5) & (d > 2.4)
    rgb = base.copy()
    rgb[d < 6.8] = _ramp(pal, np.clip(1 - d / 7, 0, 1) * 0.6 + 0.2)[d < 6.8]
    rgb[swirl] = _hex(pal[-1])
    rgb[d < 2.4] = _hex("#1c2230")
    return _img(rgb)


# ------------------------------------------------------------------------------------------------ features
# The floor of the world is a sea of cloud (beach rule, see terrain params) and every biome shares it; features
# meant for the spire summits use where="cave_floor" with a y band above the floor: the placement scans down at
# most 16 blocks for ground, so they only ever land on the summits (and big floating rocks).
TOP = (112, 178)
GIANT_NEST = Structure(kind="nest", blocks={"main": "aviary_nest_twigs", "egg": "aviary_sky_egg"}, size=(6, 9),
                       params={"twigs": 1.3}, where="cave_floor", y=TOP, count=2)
SMALL_NEST = Structure(kind="nest", blocks={"main": "aviary_nest_twigs", "egg": "aviary_sky_egg"}, size=(3, 4),
                       params={"twigs": 0.8, "eggs": 1}, where="cave_floor", y=TOP, count=2)
WIND_TREE = GiantPlant(stem="minecraft:birch_log", head="aviary_windleaf", shape="umbrella", height=(6, 10), radius=(3, 5),
                       bend=0.65, where="cave_floor", y=TOP, count=2)
IVY = Patch(block="aviary_cliff_ivy", where="air", y=(64, 165), count=14, tries=12)
FLOAT_ROCKS = Boulder(blocks=[("aviary_stratastone", 5), ("aviary_cliff_grass", 1)], radius=(2, 4), squash=0.7,
                      where="air", y=(95, 175), count=1, chance=4)
# down on the cloud sea: billows of cloud and lone stone needles
CLOUD_BILLOW = Boulder(blocks=[("aviary_cloudbank", 1)], radius=(3, 6), squash=0.5, where="cave_floor", y=(42, 64),
                       count=1, chance=2)
NEEDLE = Spire(blocks=[("aviary_stratastone", 1)], tip="aviary_wind_crystal", height=(8, 18), radius=(1, 3), lean=0.2,
               where="cave_floor", y=(42, 64), count=1, chance=3)


def summit(block=None, blocks=None, count=3, tries=24, spread=6):
    """A plant patch that only grows on the spire summits."""
    return Patch(block=block or "", blocks=blocks, where="cave_floor", y=TOP, count=count, tries=tries, spread=spread)


DIMENSION = Dimension(
    id="aviary",
    code="A-97",
    name="Aviary Spires",
    tagline="Spires above a sea of cloud, where the giant birds nest",
    description=("Stone spires a hundred blocks tall rise out of a soft white sea of cloud, catching the pink light of "
                 "a dawn that never quite ends. Their summits are crowned with nests the size of houses, full of "
                 "sky-blue eggs and fluffy Nestlings - and watched over by the Rocs, who do not like visitors near "
                 "their young. Fall off and the clouds will catch you. Probably."),
    danger=3,
    color=DAWN,
    terrain=Terrain(style="pillars", stone="aviary_stratastone", fluid="minecraft:water", sea_level=44, height=50,
                    amplitude=12, scale=1.0, roughness=0.32, deepslate="minecraft:deepslate",
                    params={"coverage": 0.3, "pillar_height": 112, "pillar_size": 1.55, "round": True,
                            "cliff_block": "aviary_stratastone", "ceiling_block": "aviary_stratastone",
                            "floating_debris": 0.35, "biome_size": 260,
                            # the whole low floor (y 41-60) is cloud: the sea of fog
                            "beach_block": "aviary_cloudbank", "beach_height": 16}),
    sky=Sky(sky_color="#9cc4ec", fog_color="#e6edf5", water_fog_color="#a8c0d8", fog_start=24, fog_end=150,
            cloud_color="#e6ffffff", cloud_height=172, time=600, sunrise_color="#ddffa8c0", sky_light_color="#fff0f0",
            ambient_light=0.05,
            bodies=[Celestial("gas_giant", ["#b8a8d0", "#d8c8e8", "#f4e8f8"], size=120, yaw=200, pitch=28, roll=10,
                              alpha=0.7, seed="aviary-giant"),
                    Celestial("moon", ["#f0e0e8", "#fff8fa"], size=18, yaw=150, pitch=50, alpha=0.6,
                              seed="aviary-moon")]),
    blocks=[
        Block("aviary_cliff_grass", "Cliff Grass", "grass", {
            "top": tex("grass_top", P_GRASS, seed="aviary-grass"),
            "side": tex("grass_side", P_GRASS, P_LOAM, seed="aviary-grass"),
            "bottom": tex("dirt", P_LOAM, seed="aviary-loam")}, hardness=0.6, sound="grass", map_color="grass"),
        Block("aviary_loam", "Spire Loam", "soil", {"all": tex("dirt", P_LOAM, seed="aviary-loam")}, hardness=0.5,
              sound="rooted_dirt", map_color="color_gray"),
        Block("aviary_stratastone", "Stratastone", "stone", {"all": tex(strata, P_ROCK, P_BAND, "aviary-strata")},
              hardness=1.5, map_color="color_light_blue"),
        Block("aviary_cloudbank", "Cloudbank", "slime", {"all": tex("cloud", P_CLOUD, seed="aviary-cloud")}, hardness=0.3,
              sound="wool", tool="hoe", map_color="snow", friction=0.7),
        Block("aviary_nest_twigs", "Woven Nest", "solid", {"all": tex(woven_twigs, P_TWIG, "aviary-nest")}, hardness=0.8,
              sound="azalea", tool="axe", map_color="color_brown", flammable=True),
        Block("aviary_sky_egg", "Sky Egg Shell", "solid", {"all": tex(speckled_egg, P_EGG, "aviary-egg")}, hardness=0.6,
              sound="calcite", tool="pickaxe", map_color="color_light_blue"),
        Block("aviary_windleaf", "Windleaf", "leaves", {"all": tex("leaves", P_WINDLEAF, seed="aviary-windleaf", holes=0.3)},
              hardness=0.2, sound="azalea_leaves", map_color="color_cyan", flammable=True),
        Block("aviary_feather_grass", "Feather Grass", "tall_plant", {
            "bottom": tex("tall_plant_bottom", P_PLUME, seed="aviary-plume"),
            "top": tex("reeds", P_PLUME, seed="aviary-plume", head_hex="#fbf8ee")}, hardness=0.0, sound="grass",
              map_color="wool"),
        Block("aviary_cliff_blossom", "Cliff Blossom", "plant", {
            "cross": tex("flower", ["#3a5a3a", "#4a7048", "#5e8a58"], P_BLOSSOM, seed="aviary-blossom", shape="bell",
                         center_hex="#fff0a0")}, hardness=0.0, sound="grass", fruit="aviary_cloudberry",
              map_color="color_pink"),
        Block("aviary_cliff_ivy", "Cliff Ivy", "vine", {"face": tex("vine_overlay", ["#4a7a4a", "#5e9256", "#76aa66", "#92c47c"], seed="aviary-ivy")},
              hardness=0.2, sound="vine", map_color="color_green"),
        Block("aviary_updraft_vent", "Updraft Hole", "vent", {
            "top": tex(updraft_top, P_BAND + ["#ffffff"], "aviary-updraft"),
            "side": tex(strata, P_ROCK, P_BAND, "aviary-strata")}, hardness=1.5, tool="pickaxe",
              particle="minecraft:cloud", effect="minecraft:levitation", effect_seconds=2, effect_amplifier=3,
              map_color="color_light_blue"),
        Block("aviary_wind_crystal", "Wind Crystal", "crystal_cluster", {
            "cross": tex("crystal_shard_sprite", P_ICE, seed="aviary-crystal")}, hardness=1.0, sound="amethyst_cluster",
              light=8, emissive=True, map_color="color_light_blue"),
    ],
    items=[
        Item("aviary_roc_feather", "Roc Feather", tex("item_icon", "feather", ["#4a3c30", "#8a7660", "#e8dcc0"],
                                                      seed="aviary-roc-feather", accent="#e0a030"),
             rarity="rare", lore="Hold it up in a strong wind and your feet start getting ideas."),
        Item("aviary_cloudberry", "Cloudberry", tex("item_icon", "berry", ["#d8a0b8", "#f4c8d8", "#fff4f8"],
                                                    seed="aviary-cloudberry", accent="#6a9a62"),
             kind="food", food=Food(3, 0.4, always=True, fast=True,
                                    effects=[Effect("minecraft:slow_falling", 20, 0), Effect("minecraft:jump_boost", 20, 1)]),
             lore="Weighs less than nothing. Eat two and hold on to something."),
    ],
    creatures=[
        Creature("roc", "Roc", "flyer", ["#6a5646", "#e8dcc0", "#e0a030", "#ffcc30", "#3a2e24"], pattern="gradient",
                 size=2.7,
                 body={"kind": "bird", "wing_span": 22, "wing_w": 8, "body_len": 14, "body_w": 8, "body_h": 8,
                       "beak": 4, "hooked": True, "crest": True, "tail": 3, "tail_kind": "fan", "legs": 2,
                       "claws": True, "eye_style": "angry", "brows": True},
                 behavior="neutral", health=80, damage=9, speed=0.34, armor=4, abilities=["charge"],
                 drops=[Drop("aviary_roc_feather", 1, 2), Drop("minecraft:feather", 2, 5)],
                 sounds="phantom", pitch=0.55, xp=20, group=1, tracking=10,
                 description="Wingspan of a house, temper of a kettle. It only attacks if you go near the nest."),
        Creature("nestling", "Nestling", "biped", ["#f4dc7a", "#fff4c8", "#f08a30", "#1a1a1a"], pattern="plain",
                 size=0.55,
                 body={"stance": "raptor", "leg_len": 4, "leg_w": 2, "body_len": 8, "body_w": 8, "body_h": 8, "neck": 1,
                       "beak": 2, "arms": 0, "tail": 1, "tail_kind": "fan", "head_size": 1.35, "eye_style": "cute",
                       "crest": True, "blush": True},
                 behavior="passive", health=6, speed=0.2, tempt="minecraft:wheat_seeds",
                 drops=[Drop("minecraft:feather", 0, 1)], sounds="chicken", pitch=1.7, xp=1, group=3,
                 description="Mostly beak and fluff. Its mother is very, very large."),
        Creature("cliff_diver", "Cliff Diver", "flyer", ["#f4f4f0", "#2a2e3a", "#f08a30", "#101010", "#e8c8a0"],
                 pattern="gradient", size=0.8,
                 body={"kind": "bird", "wing_span": 16, "wing_w": 4, "body_len": 10, "body_w": 5, "body_h": 5, "beak": 4,
                       "tail": 2, "tail_kind": "feather", "legs": 2, "eye_style": "round"},
                 behavior="passive", health=10, speed=0.32,
                 drops=[Drop("minecraft:feather", 0, 2)], sounds="parrot", pitch=0.8, xp=2, group=4,
                 description="Folds its wings and drops a hundred blocks into the cloud sea, for fun."),
    ],
    biomes=[
        Biome("aviary_nest_crowns", "Nest Crowns", top="aviary_cliff_grass", under="aviary_loam",
              temperature=0.35, humidity=-0.15,
              grass_color="#6c9462", foliage_color="#528874", water_color="#c8dcec", water_fog_color="#a8c0d8",
              particles=[("minecraft:white_ash", 0.002), ("dust:#fff0f4:0.8", 0.002)], ambient="wind_howl",
              music="minecraft:music.overworld.stony_peaks",
              features=[
                  GIANT_NEST,
                  WIND_TREE,
                  summit(blocks=[("aviary_feather_grass", 1), ("minecraft:short_grass", 5)], count=4),
                  summit("aviary_cliff_blossom", count=1, tries=10, spread=4),
                  IVY,
                  FLOAT_ROCKS,
                  CLOUD_BILLOW,
                  # the bones of a Roc that fell into the cloud sea
                  Structure(kind="ribcage", blocks={"bone": "minecraft:bone_block", "spine": "minecraft:bone_block"},
                            size=(6, 9), where="cave_floor", y=(42, 64), count=1, chance=16),
              ],
              spawns=[Spawn("nestling", 10, (2, 3)), Spawn("roc", 3, (1, 1)), Spawn("cliff_diver", 5, (1, 3))]),
        Biome("aviary_windswept_spires", "Windswept Spires", top="aviary_cliff_grass", under="aviary_stratastone",
              temperature=-0.6, humidity=-0.4,
              grass_color="#82aa72", foliage_color="#3e7062", water_color="#c8dcec", water_fog_color="#a8c0d8",
              fog_color="#dde6f2", particles=[("minecraft:cloud", 0.0006), ("minecraft:white_ash", 0.004)],
              ambient="wind_howl", music="minecraft:music.overworld.frozen_peaks",
              surface_noise=[("aviary_stratastone", 0.2)],
              features=[
                  summit("aviary_updraft_vent", count=2, tries=6, spread=4),
                  CrystalCluster(block="minecraft:calcite", small="aviary_wind_crystal", size=(3, 6), where="cave_floor",
                                 y=TOP, count=1),
                  summit("aviary_wind_crystal", count=2, tries=8),
                  summit("aviary_feather_grass", count=2, tries=12, spread=5),
                  SMALL_NEST,
                  IVY,
                  FLOAT_ROCKS,
                  NEEDLE,
              ],
              spawns=[Spawn("cliff_diver", 12, (2, 4)), Spawn("roc", 2, (1, 1))]),
        Biome("aviary_bloom_ledges", "Bloom Ledges", top="aviary_cliff_grass", under="aviary_loam",
              temperature=0.5, humidity=0.7,
              grass_color="#5a7e56", foliage_color="#e07a98", water_color="#c8dcec", water_fog_color="#a8c0d8",
              particles=[("minecraft:cherry_leaves", 0.003), ("dust:#ffd0dc:0.7", 0.002)], ambient="cozy_breeze",
              music="minecraft:music.overworld.cherry_grove",
              features=[
                  GiantPlant(stem="minecraft:birch_log", head="minecraft:cherry_leaves", shape="puff", height=(5, 8),
                             radius=(3, 4), bend=0.4, where="cave_floor", y=TOP, count=2),
                  summit("aviary_cliff_blossom", count=5, tries=32),
                  summit(blocks=[("minecraft:pink_petals", 2), ("minecraft:short_grass", 3)], count=3),
                  SMALL_NEST,
                  IVY,
                  CLOUD_BILLOW,
              ],
              spawns=[Spawn("nestling", 8, (2, 3)), Spawn("cliff_diver", 8, (2, 3))]),
        Biome("aviary_hanging_gardens", "Hanging Gardens", top="aviary_cliff_grass", under="aviary_loam",
              temperature=-0.35, humidity=0.65,
              grass_color="#4a8a52", foliage_color="#4a8a52", water_color="#c8dcec", water_fog_color="#a8c0d8",
              fog_color="#e0ece6", particles=[("minecraft:spore_blossom_air", 0.003), ("dust:#c8f0d0:0.8", 0.002)],
              ambient="cozy_breeze", music="minecraft:music.overworld.lush_caves",
              features=[
                  GiantPlant(stem="minecraft:birch_log", head="minecraft:flowering_azalea_leaves", shape="dome",
                             height=(4, 7), radius=(3, 4), bend=0.3, where="cave_floor", y=TOP, count=2),
                  summit(blocks=[("minecraft:moss_carpet", 3), ("aviary_cliff_blossom", 1), ("minecraft:fern", 2)],
                         count=4),
                  Patch(block="aviary_cliff_ivy", where="air", y=(60, 170), count=30, tries=16),
                  Patch(block="minecraft:hanging_roots", where="cave_ceiling", y=(60, 170), count=2, tries=12),
                  SMALL_NEST,
                  NEEDLE,
              ],
              spawns=[Spawn("nestling", 8, (2, 3)), Spawn("cliff_diver", 6, (1, 3)), Spawn("roc", 1, (1, 1))]),
    ],
    effects=["floaty"],
    ambient="wind_howl",
    music="minecraft:music.overworld.stony_peaks",
    icon="portalgun:aviary_roc_feather",
)
