"""E-7 Eventide - the blue hour that never ends: violet meadows, blue-leaved silverbark forests, fireflies and
moonpools under an enormous rising moon."""
from dataclasses import replace

import numpy as np
from PIL import Image

from gen import textures as T
from gen.content.dsl import *
from gen.noise import rng

P_GRASS = ["#44347a", "#5a4598", "#7258b4", "#8a70cc", "#a68ce0"]
P_SOIL = ["#261f34", "#322a44", "#3f3656", "#4d4468"]
P_SLATE = ["#2a3044", "#384058", "#48526c", "#5a6684", "#6e7a98"]
P_BARK = ["#7c80a0", "#9a9ebc", "#b8bcd6", "#d4d6ec", "#eceef8"]
P_LEAVES = ["#1a2a66", "#243c8a", "#3252ae", "#466ccc", "#6488e2"]
P_STARLEAF = ["#1c5a8a", "#2c86ba", "#4cb4e0", "#86dcf8", "#cff6ff"]
P_MOON = ["#8aa4d4", "#a8c0ec", "#c8daf8", "#e6f0ff", "#ffffff"]
P_BELL = ["#4a2278", "#6a34a4", "#8e50cc", "#b47ae6", "#dab2f8"]
P_STEM = ["#24304a", "#344466", "#465a82"]


def _hex(c):
    c = c.lstrip("#")
    return np.array([int(c[i:i + 2], 16) for i in (0, 2, 4)], float)


def moonstone(pal, seed):
    """Milky moonstone: soft pale marble with a cool blue adularescent sheen drifting diagonally."""
    a = np.array(T.marble(pal, seed).convert("RGBA"), float)
    R = rng(seed)
    yy, xx = np.mgrid[0:16, 0:16]
    sheen = np.sin((xx + yy) * 0.45 + R.uniform(0, 6)) * 0.5 + 0.5
    blue = np.array([150, 200, 255], float)
    a[..., :3] = a[..., :3] * (1 - 0.28 * sheen[..., None]) + blue * 0.28 * sheen[..., None]
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "RGBA")


ELDER = GiantPlant(stem="eventide_silverbark_log", head="eventide_bluewood_leaves", shape="puff", height=(20, 28),
                   radius=(6, 8), stem_width=2, bend=0.1, decoration="eventide_starleaf", count=1, chance=4)
BLUEWOOD = Tree(log="eventide_silverbark_log", leaves="eventide_bluewood_leaves", shape="fancy", height=(7, 12),
                decoration="eventide_gloamvine", count=4)
STARWOOD = Tree(log="eventide_silverbark_log", leaves="eventide_starleaf", shape="birch", height=(6, 9), count=1)
MOONGATE = Structure(kind="arch", blocks={"main": "eventide_slate", "alt": "eventide_moonstone"}, size=(4, 6),
                     params={"height": 1.6, "thickness": 1.2}, count=1, chance=7)
MOONPOOL = Lake(fluid="minecraft:water", border="eventide_moonstone", count=1, chance=5)

DIMENSION = Dimension(
    id="eventide",
    code="E-7",
    name="Eventide",
    tagline="The blue hour that never ends",
    description=("The sun set here a thousand years ago and the sky never finished darkening. Violet meadows hum "
                 "with fireflies, silverbark forests hold up canopies of blue leaves, and moonpools glow under a "
                 "moon too big for the sky. Moonfoxes and owls are friendly enough - just give the antlered Shade "
                 "Stags the right of way."),
    danger=2,
    color="#6488e2",
    terrain=Terrain(style="hills", stone="eventide_slate", sea_level=60, height=71, amplitude=18, scale=1.35,
                    roughness=0.16, deepslate="minecraft:deepslate",
                    params={"rivers": 0.45, "detail": 0.35, "biome_size": 280, "ceiling_block": "eventide_soil",
                            "cliff_block": "eventide_slate", "beach_block": "eventide_soil", "beach_height": 1}),
    sky=Sky(sky_color="#3c4cb8", fog_color="#5a4a9e", water_fog_color="#1a2a5a", fog_start=30, fog_end=170,
            cloud_color="#80b090e0", cloud_height=200, time=13300, sunrise_color="#c05a8acc", star_brightness=0.85,
            ambient_light=0.2, sky_light_color="#b0b8ff",
            bodies=[Celestial("moon", ["#a8b4e0", "#d8e0fa", "#ffffff"], size=72, yaw=180, pitch=16, roll=8,
                              seed="eventide-greatmoon"),
                    Celestial("moon", ["#8a6aa8", "#c0a0d8", "#f0e0ff"], size=22, yaw=150, pitch=38,
                              seed="eventide-littlemoon"),
                    Celestial("comet", ["#a0c8ff", "#ffffff", "#d0a0ff"], size=60, yaw=250, pitch=55, roll=-30,
                              alpha=0.7, additive=True, seed="eventide-comet")]),
    blocks=[
        Block("eventide_grass", "Duskgrass", "grass", {
            "top": tex("grass_top", P_GRASS, seed="eventide-grass"),
            "side": tex("grass_side", P_GRASS, P_SOIL, seed="eventide-grass"),
            "bottom": tex("dirt", P_SOIL, seed="eventide-soil")}, hardness=0.6, sound="grass",
              map_color="color_purple"),
        Block("eventide_soil", "Gloaming Soil", "soil", {"all": tex("dirt", P_SOIL, seed="eventide-soil")},
              hardness=0.5, sound="gravel", map_color="terracotta_blue"),
        Block("eventide_slate", "Twilight Slate", "stone", {"all": tex("stone", P_SLATE, seed="eventide-slate")},
              hardness=1.5, sound="deepslate", map_color="color_blue"),
        Block("eventide_silverbark_log", "Silverbark Log", "log", {
            "side": tex("log_side", P_BARK, seed="eventide-bark"),
            "end": tex("log_top", P_BARK, ["#c8cce6", "#9ea2c0"], seed="eventide-bark-top")}, hardness=2.0,
              sound="wood", map_color="color_light_gray", flammable=True),
        Block("eventide_bluewood_leaves", "Bluewood Leaves", "leaves",
              {"all": tex("leaves", P_LEAVES, seed="eventide-leaves", holes=0.22)}, hardness=0.2, sound="azalea_leaves",
              map_color="color_blue", flammable=True),
        Block("eventide_starleaf", "Starleaf", "leaves", {"all": tex("leaves", P_STARLEAF, seed="eventide-starleaf",
                                                                     holes=0.3)},
              hardness=0.2, sound="azalea_leaves", light=8, emissive=True, map_color="color_light_blue"),
        Block("eventide_moonstone", "Moonstone", "glow", {"all": tex(moonstone, P_MOON, "eventide-moonstone")},
              hardness=1.2, sound="calcite", light=13, emissive=True, tool="pickaxe", map_color="color_light_blue"),
        Block("eventide_moonbloom", "Moonbloom", "plant",
              {"cross": tex("flower", P_STEM, P_MOON, "eventide-moonbloom", shape="orb", center_hex="#80b0ff")},
              hardness=0.0, sound="grass", light=6, emissive=True, fruit="eventide_moonpetal"),
        Block("eventide_duskbell", "Duskbell", "tall_plant", {
            "bottom": tex("tall_plant_bottom", P_STEM, seed="eventide-duskbell"),
            "top": tex("flower", P_STEM, P_BELL, "eventide-duskbell-top", shape="bell", center_hex="#ffe080")},
              hardness=0.0, sound="grass"),
        Block("eventide_gloamvine", "Gloamvine", "hanging_plant",
              {"cross": tex("tendril", ["#3a2a7a", "#6a4ab8", "#a080e8", "#d8c8ff"], seed="eventide-gloamvine")},
              hardness=0.0, sound="cave_vines", light=4),
        Block("eventide_moon_lily", "Moon Lily", "lily",
              {"top": tex("lily_pad", ["#1a3a6a", "#2c5a9a", "#8ac0f0"], seed="eventide-lily")}, hardness=0.0,
              sound="lily_pad", light=7, emissive=True, map_color="color_light_blue"),
        Block("eventide_starshard", "Fallen Starshard", "crystal_cluster",
              {"cross": tex("crystal_shard_sprite", ["#4a6ac8", "#90b8ff", "#e0f0ff", "#ffffff"],
                            seed="eventide-starshard")},
              hardness=1.0, sound="amethyst_cluster", light=11, emissive=True, map_color="color_light_blue"),
    ],
    items=[
        Item("eventide_moonpetal", "Moonpetal", tex("item_icon", "petal", P_MOON, seed="eventide-petal",
                                                    accent="#80b0ff"),
             kind="food", food=Food(2, 0.6, always=True, fast=True,
                                    effects=[Effect("minecraft:night_vision", 45, 0),
                                             Effect("minecraft:jump_boost", 20, 1)]),
             lore="Tastes like the last minute of a sunset."),
        Item("eventide_shade_antler", "Shade Antler", tex("item_icon", "horn", ["#1e1e3e", "#3a3a6a", "#70e0ff",
                                                                                 "#c0f8ff"], seed="eventide-antler"),
             rarity="uncommon", glint=True, lore="Its tips still glow, as if it remembers the stag."),
        Item("eventide_moonfox_tuft", "Moonfox Tuft", tex("item_icon", "feather", ["#6a80c8", "#a8b8e8", "#d8dcf0",
                                                                                   "#ffffff"], seed="eventide-tuft"),
             lore="Impossibly soft. Shed, not taken - moonfoxes leave them for friends."),
    ],
    creatures=[
        Creature("shade_stag", "Shade Stag", "quadruped", ["#1c1c3c", "#34346a", "#70e0ff", "#a8f8ff"],
                 pattern="glow_lines", size=1.35,
                 body={"horns": "antlers", "glow_tips": True, "leg_len": 12, "leg_w": 2, "neck": 6, "neck_angle": 45,
                       "hooves": True, "tail": 1, "tail_kind": "puff", "ears": "pointy", "eye_style": "glow",
                       "body_len": 14, "body_w": 8, "body_h": 8, "snout": 3},
                 behavior="neutral", health=30, damage=6, speed=0.3, abilities=["charge"],
                 drops=[Drop("eventide_shade_antler", 0, 1, chance=0.5), Drop("minecraft:leather", 0, 2)],
                 sounds="goat", pitch=0.65, xp=6, group=3,
                 description="A stag woven from the last light of evening. It lets you watch - but never touch."),
        Creature("moonfox", "Moonfox", "quadruped", ["#8c9ce0", "#f2f4ff", "#bfe8ff", "#1a2850"],
                 pattern="plain", size=0.6,
                 body={"ears": "pointy", "snout": 3, "tail": 2, "tail_kind": "bushy", "glow_tips": True,
                       "leg_len": 6, "body_len": 11, "body_h": 5, "body_w": 5, "eye_style": "cute", "whiskers": True,
                       "head_size": 1.0},
                 behavior="passive", health=10, speed=0.3, tempt="minecraft:sweet_berries",
                 drops=[Drop("eventide_moonfox_tuft", 0, 1, chance=0.6)], sounds="fox", pitch=1.15, xp=2, group=3,
                 description="Follows travellers at a polite distance, tail tip glowing like a tiny lantern."),
        Creature("twilight_owl", "Twilight Owl", "flyer", ["#4e3e66", "#c8b8dc", "#7a6a94", "#ffcc40"],
                 pattern="speckle", size=0.75,
                 body={"kind": "bird", "eye_size": 3, "eye_style": "round", "ears": "pointy", "brows": True,
                       "fluffy": True, "beak": 1, "hooked": True, "wing_span": 11, "tail": 1, "tail_kind": "fan",
                       "head_size": 1.35},
                 behavior="passive", health=8, speed=0.22, drops=[Drop("minecraft:feather", 1, 2)],
                 sounds="parrot", pitch=0.7, xp=2, group=2,
                 description="Asks 'who?' all evening long. Nobody has ever given it a satisfying answer."),
    ],
    biomes=[
        Biome("eventide_bluewood", "Bluewood", top="eventide_grass", under="eventide_soil", temperature=0.0,
              humidity=0.55, grass_color="#5c4494", foliage_color="#3252ae", water_color="#4a7ae0",
              water_fog_color="#1a2a5a", particles=[("minecraft:firefly", 0.01)], ambient="jungle_night",
              music="minecraft:music.overworld.forest",
              features=[
                  ELDER,
                  BLUEWOOD,
                  replace(STARWOOD, count=1, chance=2),
                  Patch(block="minecraft:firefly_bush", count=2, tries=12),
                  Patch(block="eventide_moonbloom", count=2, tries=16),
                  Patch(block="minecraft:fern", count=2, tries=16),
                  Patch(block="eventide_gloamvine", count=2, where="cave_ceiling"),
              ],
              spawns=[Spawn("moonfox", 8, (1, 3)), Spawn("shade_stag", 6, (1, 3)), Spawn("twilight_owl", 6, (1, 2))]),
        Biome("eventide_violet_meadow", "Violet Meadows", top="eventide_grass", under="eventide_soil",
              temperature=0.6, humidity=-0.3, grass_color="#7458b0", foliage_color="#466ccc", water_color="#4a7ae0",
              water_fog_color="#1a2a5a", particles=[("minecraft:firefly", 0.016)], ambient="cozy_breeze",
              music="minecraft:music.overworld.meadow",
              features=[
                  Patch(block="eventide_duskbell", count=5, tries=24),
                  Patch(block="eventide_moonbloom", count=4, tries=24),
                  Patch(block="minecraft:firefly_bush", count=1, tries=8),
                  Patch(block="minecraft:short_grass", count=3, tries=24),
                  MOONGATE,
                  replace(BLUEWOOD, count=1, chance=3),
                  Boulder(blocks=[("eventide_slate", 4), ("eventide_moonstone", 1)], radius=(1, 2), squash=0.8,
                          count=1, chance=5),
              ],
              spawns=[Spawn("moonfox", 10, (2, 4)), Spawn("shade_stag", 8, (2, 3)), Spawn("twilight_owl", 2, (1, 1))]),
        Biome("eventide_moonpool_fen", "Moonpool Fen", top="eventide_grass", under="eventide_soil",
              temperature=-0.4, humidity=0.85, elevation=-0.5, underwater="eventide_moonstone",
              grass_color="#463478", foliage_color="#243c8a", water_color="#8ad8ff", water_fog_color="#2a6aa0",
              fog_color="#4a5aa8", particles=[("minecraft:firefly", 0.02), ("minecraft:glow", 0.002)],
              ambient="crystal_chimes", music="minecraft:music.overworld.lush_caves",
              surface_noise=[("eventide_soil", 0.55)],
              features=[
                  MOONPOOL,
                  Patch(block="eventide_moon_lily", where="water_surface", count=5, tries=24, max_depth=3),
                  Tree(log="eventide_silverbark_log", leaves="eventide_bluewood_leaves", shape="oak", height=(4, 6),
                       decoration="eventide_gloamvine", count=2),
                  Patch(block="minecraft:firefly_bush", count=3, tries=16),
                  Patch(block="eventide_moonbloom", count=2, tries=12),
              ],
              spawns=[Spawn("twilight_owl", 8, (1, 3)), Spawn("moonfox", 5, (1, 2)), Spawn("shade_stag", 2, (1, 1))]),
        Biome("eventide_starfall_heights", "Starfall Heights", top="eventide_grass", under="eventide_soil",
              temperature=-0.6, humidity=-0.5, elevation=0.6, stone="eventide_slate", grass_color="#5c4494",
              foliage_color="#4cb4e0", water_color="#4a7ae0", water_fog_color="#1a2a5a",
              particles=[("minecraft:end_rod", 0.0015)], ambient="crystal_chimes",
              music="minecraft:music.overworld.grove", surface_noise=[("eventide_slate", 0.5)],
              features=[
                  replace(STARWOOD, count=2),
                  CrystalCluster(block="eventide_starshard", small="eventide_starshard", size=(2, 4), count=1, chance=2),
                  Patch(block="eventide_starshard", count=1, tries=6),
                  Spire(blocks=[("eventide_slate", 5), ("eventide_moonstone", 1)], tip="eventide_moonstone",
                        height=(5, 10), radius=(1, 1), count=1, chance=3),
                  Patch(block="eventide_starshard", count=3, where="cave_floor"),
                  Patch(block="eventide_moonbloom", count=1, tries=10),
              ],
              spawns=[Spawn("shade_stag", 8, (1, 3)), Spawn("twilight_owl", 4, (1, 2)), Spawn("moonfox", 4, (1, 2))]),
    ],
    effects=[],
    ambient="jungle_night",
    music="minecraft:music.overworld.meadow",
    icon="portalgun:eventide_moonpetal",
)
