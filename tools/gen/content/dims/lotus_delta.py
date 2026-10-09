"""M-27 Lotus Delta - a warm, misty river delta of giant lily pads and lotus blossoms."""
import math

import numpy as np
from PIL import Image

from gen.content.dsl import *
from gen.noise import fbm, rng

# ------------------------------------------------------------------------------------------------ palette
# jade green / lotus pink / warm cream mist / teal water / pollen gold
P_GRASS = ["#3f7a3a", "#4f9046", "#62a652", "#7abb62", "#9ccf7a"]
P_SILT = ["#4a4034", "#5a4e40", "#6a5e4e", "#7c705e"]
P_STONE = ["#7a7a66", "#8c8c76", "#9e9e88", "#b2b29c", "#c6c6b0"]      # pale river stone
P_PAD = ["#2f6a34", "#3a7e3e", "#4a924a", "#5ea65a", "#8ac878"]
P_PETAL = ["#c84a78", "#e06a92", "#f08aa8", "#f8b4c8", "#ffe0ea"]
P_GOLD = ["#c08a20", "#e0a830", "#f0c060", "#ffe090", "#fff6d0"]
P_STALK = ["#4a7a3a", "#5a8e46", "#6ea056", "#86b46a"]
P_WILLOW = ["#5a5040", "#6e6450", "#847a64", "#9a9078"]
P_WLEAF = ["#5a8a3a", "#6ea04a", "#86b45a", "#a0c870", "#c0dc90"]
P_REED = ["#6a7a3a", "#82924a", "#9aaa5e", "#b8c478"]


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


def pad_surface(pal, seed):
    """The top of a giant lily pad: waxy green with soft mottling, branching pale veins and dew beads."""
    n = fbm(16, 16, 8, seed, 3)
    q = np.floor((0.35 + n * 0.5) * 4) / 4
    rgb = _ramp(pal[:4], q)
    R = rng(seed + ":veins")
    vein = _hex(pal[4])
    for k in range(2):
        x = float(R.integers(0, 16))
        y = 0.0 if k == 0 else float(R.integers(0, 16))
        horiz = k == 1
        for s in range(16):
            xi, yi = (int(x) % 16, s) if not horiz else (s, int(y) % 16)
            rgb[yi, xi] = rgb[yi, xi] * 0.35 + vein * 0.65
            if s % 5 == 2:     # side branch
                for b in range(1, 3):
                    bx, by = ((xi + b) % 16, (yi - b) % 16) if not horiz else ((xi - b) % 16, (yi + b) % 16)
                    rgb[by, bx] = rgb[by, bx] * 0.55 + vein * 0.45
            if horiz:
                y += R.uniform(-0.45, 0.45)
            else:
                x += R.uniform(-0.45, 0.45)
    for _ in range(3):
        dx, dy = int(R.integers(0, 16)), int(R.integers(0, 16))
        rgb[dy, dx] = np.array([230.0, 250, 240])
    return _img(rgb)


def petal_block(pal, seed):
    """Lotus petal flesh: long vertical petals, deep pink at the base fading to pale tips, fine darker veins."""
    yy, xx = np.mgrid[0:16, 0:16]
    R = rng(seed)
    off = R.uniform(0, 1)
    col = ((xx + off * 4) % 4) / 3.0                     # 4px petal columns
    edge = np.abs(col - 0.5) * 2                           # 0 in the petal middle, 1 at the seam
    t = 1.0 - (yy / 15.0) * 0.75 - edge * 0.25 + (fbm(16, 16, 4, seed, 2) - 0.5) * 0.25
    rgb = _ramp(pal, t)
    seam = edge > 0.8
    rgb[seam] = rgb[seam] * 0.78
    vein = (np.abs(col - 0.5) < 0.12) & (yy % 3 != 0)
    rgb[vein] = rgb[vein] * 0.92 + _hex(pal[0]) * 0.08
    return _img(rgb)


def lotus_heart(pal, seed):
    """A glowing lotus seed head: golden disc dotted with darker seed pits and a bright pollen ring."""
    n = fbm(16, 16, 4, seed, 2)
    rgb = _ramp(pal, 0.45 + n * 0.4)
    R = rng(seed + ":pits")
    for y in range(2, 16, 4):
        for x in range(2 + (y // 4) % 2 * 2, 16, 4):
            px, py = (x + int(R.integers(-1, 2))) % 16, (y + int(R.integers(-1, 2))) % 16
            rgb[py, px] = _hex(pal[0]) * 0.8
            rgb[(py + 1) % 16, px] = _hex(pal[1])
            rgb[(py - 1) % 16, px] = _hex(pal[4])
    return _img(rgb)


def lotus_lily(pad_pal, petal_pal, seed):
    """Floating pad (top view) with a small pink lotus blooming in its middle."""
    out = np.zeros((16, 16, 4), float)
    yy, xx = np.mgrid[0:16, 0:16]
    r = np.hypot(xx - 7.5, yy - 7.5)
    ang = np.arctan2(yy - 7.5, xx - 7.5)
    pad = (r < 7.6) & ~((np.abs(ang - 0.6) < 0.22) & (r > 1.5))
    n = fbm(16, 16, 4, seed, 2)
    out[pad, :3] = _ramp(pad_pal[:4], 0.3 + n * 0.5 + (r / 8.0) * 0.2)[pad]
    rim = pad & (r > 6.6)
    out[rim, :3] = _hex(pad_pal[0])
    out[pad, 3] = 255
    pet = [_hex(c) for c in petal_pal]
    petals = 8
    reach = 2.0 + 2.2 * np.abs(np.cos(ang * petals / 2)) ** 2
    fl = r <= reach
    shade = np.clip(r / reach, 0, 0.999)
    out[fl, :3] = np.array([pet[4], pet[3], pet[2], pet[1]])[(shade * 4).astype(int)][fl]
    out[fl, 3] = 255
    out[7:9, 7:9, :3] = _hex("#ffd860")
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGBA")


# ------------------------------------------------------------------------------------------------ features
GIANT_PAD = Structure(kind="lily_pad", blocks={"pad": "lotus_giant_pad", "flower": "lotus_petal_block"}, size=(6, 12),
                      params={"notch": 20, "flowers": 2}, where="water_surface", count=1, chance=2)
GIANT_LOTUS = GiantPlant(stem="lotus_stalk", head="lotus_petal_block", shape="flower", height=(7, 13), radius=(4, 6),
                         decoration="lotus_heart", bend=0.25, count=1, chance=3)
WILLOW = Tree(log="lotus_willow_log", leaves="lotus_willow_leaves", shape="twisted", height=(6, 10),
              decoration="lotus_willow_moss", count=1)
LILIES = Patch(blocks=[("lotus_lily", 3), ("minecraft:lily_pad", 2)], where="water_surface", count=5, tries=32, max_depth=4)
REEDS = Patch(block="lotus_reeds", count=4, tries=32, spread=6)
FLOWERS = Patch(blocks=[("minecraft:short_grass", 6), ("minecraft:pink_tulip", 1), ("minecraft:blue_orchid", 1),
                        ("minecraft:wildflowers", 2)], count=4, tries=32)

DIMENSION = Dimension(
    id="lotus_delta",
    code="M-27",
    name="Lotus Delta",
    tagline="A warm, misty delta of giant lily pads",
    description=("A slow golden morning that never ends, over a maze of shallow channels and reed islands. Lily pads "
                 "here are big enough to camp on, and lotus blossoms taller than a house glow softly at their hearts. "
                 "Lily Toads sing from the pads while Dragonflies zip through the mist. Only the Mud Crocs spoil the "
                 "calm - watch the muddy shallows for a pair of yellow eyes."),
    danger=1,
    color="#f08aa8",
    terrain=Terrain(style="islands", stone="lotus_riverstone", sea_level=63, height=64, amplitude=5, scale=0.85,
                    roughness=0.03, caves=False, deepslate="minecraft:deepslate",
                    params={"coverage": 0.36, "depth": 4, "island_height": 5, "biome_size": 220, "cliffs": False}),
    sky=Sky(sky_color="#9fc8e8", fog_color="#f2dcb8", water_fog_color="#3a8a78", fog_start=16, fog_end=120,
            cloud_color="#e0fff0e0", cloud_height=150, time=1200, sunrise_color="#ffe0a060", ambient_light=0.05,
            bodies=[Celestial("sun", ["#ffd080", "#fff0c0", "#ffffff"], size=70, yaw=270, pitch=14, alpha=0.75,
                              seed="lotus-sun"),
                    Celestial("moon", ["#f8e8f0"], size=14, yaw=110, pitch=30, alpha=0.35, seed="lotus-daymoon")]),
    blocks=[
        Block("lotus_marsh_grass", "Marsh Grass", "grass", {
            "top": tex("grass_top", P_GRASS, seed="lotus-grass"),
            "side": tex("grass_side", P_GRASS, P_SILT, seed="lotus-grass"),
            "bottom": tex("dirt", P_SILT, seed="lotus-silt")}, hardness=0.6, sound="grass", map_color="grass"),
        Block("lotus_silt", "Delta Silt", "soil", {"all": tex("clay", P_SILT, seed="lotus-silt")}, hardness=0.5,
              sound="mud", map_color="dirt"),
        Block("lotus_riverstone", "Riverstone", "stone", {"all": tex("stone", P_STONE, seed="lotus-stone")}, hardness=1.5,
              sound="tuff", map_color="sand"),
        Block("lotus_giant_pad", "Giant Lily Pad", "solid", {"all": tex(pad_surface, P_PAD, "lotus-pad")}, hardness=0.4,
              sound="big_dripleaf", tool="axe", map_color="plant", flammable=True),
        Block("lotus_petal_block", "Lotus Petal", "solid", {"all": tex(petal_block, P_PETAL, "lotus-petal")}, hardness=0.3,
              sound="flowering_azalea", tool="hoe", light=3, map_color="color_pink", flammable=True),
        Block("lotus_heart", "Lotus Heart", "glow", {"all": tex(lotus_heart, P_GOLD, "lotus-heart")}, hardness=0.4,
              sound="shroomlight", light=14, emissive=True, map_color="gold", tool="hoe"),
        Block("lotus_stalk", "Lotus Stalk", "log", {
            "side": tex("log_side", P_STALK, seed="lotus-stalk"),
            "end": tex("log_top", P_STALK, ["#c0dca0", "#a0c480"], seed="lotus-stalk-end")}, hardness=1.0,
              sound="stem", map_color="plant"),
        Block("lotus_willow_log", "Delta Willow Log", "log", {
            "side": tex("log_side", P_WILLOW, seed="lotus-willow"),
            "end": tex("log_top", P_WILLOW, ["#d8c8a0", "#bca884"], seed="lotus-willow-end")}, hardness=2.0, sound="wood",
              map_color="wood", flammable=True),
        Block("lotus_willow_leaves", "Delta Willow Leaves", "leaves", {
            "all": tex("leaves", P_WLEAF, seed="lotus-wleaf", holes=0.3)}, hardness=0.2, sound="azalea_leaves",
              map_color="plant", flammable=True),
        Block("lotus_willow_moss", "Willow Curtain", "hanging_plant", {
            "cross": tex("vine_overlay", ["#4a7a30", "#6ea04a", "#a0c870"], seed="lotus-curtain")}, hardness=0.0,
              sound="vine", map_color="plant"),
        Block("lotus_lily", "Lotus Lily", "lily", {"top": tex(lotus_lily, P_PAD, P_PETAL, "lotus-lily")}, hardness=0.0,
              sound="lily_pad", light=4, fruit="lotus_root", drop_count=(1, 1), map_color="color_pink"),
        Block("lotus_reeds", "Delta Reeds", "tall_plant", {
            "bottom": tex("tall_plant_bottom", P_REED, seed="lotus-reeds"),
            "top": tex("reeds", P_REED, seed="lotus-reeds", head_hex="#7a4a2a")}, hardness=0.0, sound="grass",
              map_color="plant", flammable=True),
    ],
    items=[
        Item("lotus_root", "Lotus Root", tex("item_icon", "fruit", ["#a07a60", "#d8b8a0", "#f8e8d8"], seed="lotus-root"),
             kind="food", food=Food(5, 0.6, effects=[Effect("minecraft:regeneration", 6, 0)]),
             lore="Crunchy, sweet, and full of little tunnels."),
        Item("lotus_croc_scale", "Mud Croc Scute", tex("item_icon", "scale", ["#3a3a20", "#6a6a3a", "#a8a070"],
                                                         seed="lotus-scute"),
             lore="Thick as a roof tile. The croc did not give it up willingly."),
        Item("lotus_dragonfly_wing", "Dragonfly Wing", tex("item_icon", "wing", ["#2a8aa0", "#80e0f0", "#e0ffff"],
                                                            seed="lotus-wing"),
             rarity="uncommon", lore="Shimmers green, then blue, then a colour you have no name for."),
    ],
    creatures=[
        Creature("mud_croc", "Mud Croc", "quadruped", ["#4e5230", "#a8a070", "#c8c078", "#ffd030", "#36381e"],
                 pattern="scales", size=1.15,
                 body={"stance": "low", "ears": "none", "leg_len": 3, "leg_w": 3, "body_len": 20, "body_h": 6, "body_w": 10,
                       "snout": 7, "jaw": True, "mouth": "fangs", "spikes": 7, "plates": True, "tail": 3, "tail_len": 5,
                       "eye_style": "slit", "eye_size": 2, "head_size": 0.85, "claws": True},
                 behavior="hostile", health=22, damage=4, speed=0.21, armor=4, abilities=["charge"],
                 movement="amphibious", placement="ground",
                 drops=[Drop("lotus_croc_scale", 0, 2), Drop("minecraft:leather", 0, 1)],
                 sounds="hoglin", pitch=0.65, xp=6, group=1,
                 description="It lies in the silt looking like a log. Logs do not have yellow eyes."),
        Creature("lily_toad", "Lily Toad", "hopper", ["#4f9a52", "#d8f0a0", "#f08aa8", "#1a2010", "#2f6a34"],
                 pattern="spots", size=0.75,
                 body={"kind": "frog", "throat_sac": True, "body_w": 9, "body_h": 6, "body_len": 9, "eye_style": "cute",
                       "eye_size": 2, "mouth": "smile", "blush": True, "cap": True},
                 behavior="passive", health=8, speed=0.24, tempt="lotus_root", movement="amphibious",
                 drops=[Drop("minecraft:lily_pad", 0, 1), Drop("minecraft:slime_ball", 0, 1, chance=0.3)],
                 sounds="frog", pitch=1.2, xp=2, group=4,
                 description="Wears a lotus bloom like a hat and sings to it every evening."),
        Creature("dragonfly", "Dragonfly", "flyer", ["#1aa0b0", "#2a5aa0", "#a0ffe0", "#30e090", "#e0ffff"],
                 pattern="stripes", size=0.6,
                 body={"kind": "insect", "wings": 2, "wing_kind": "insect", "wing_span": 12, "wing_w": 3, "body_len": 16,
                       "body_w": 3, "body_h": 3, "tail": 3, "tail_kind": "thin", "eyes": 2, "eye_size": 3,
                       "eye_style": "compound", "legs": 3},
                 behavior="passive", health=4, speed=0.34,
                 drops=[Drop("lotus_dragonfly_wing", 0, 1, chance=0.5)],
                 sounds="bee", pitch=1.6, xp=1, group=3,
                 description="A living sliver of rainbow that hovers, darts and hovers again."),
    ],
    biomes=[
        Biome("lotus_shallows", "Lotus Shallows", top="lotus_marsh_grass", under="lotus_silt", underwater="lotus_silt",
              temperature=0.0, humidity=0.4, elevation=-0.9, grass_color="#62a652", foliage_color="#7abb62",
              water_color="#4ab8a0", water_fog_color="#2a6a60",
              particles=[("dust:#fff0d0:1.2", 0.004), ("minecraft:cherry_leaves", 0.001)], ambient="bubbling",
              music="minecraft:music.overworld.lush_caves",
              features=[
                  GIANT_PAD,
                  Structure(kind="lily_pad", blocks={"pad": "lotus_giant_pad"}, size=(3, 5), where="water_surface",
                            count=1),
                  LILIES,
                  Patch(block="lotus_lily", where="water_surface", count=3, tries=24, max_depth=3),
                  Vanilla(id="minecraft:seagrass_swamp"),
                  REEDS,
              ],
              spawns=[Spawn("lily_toad", 14, (2, 4)), Spawn("dragonfly", 10, (2, 3)), Spawn("mud_croc", 2, (1, 1))]),
        Biome("lotus_reed_marsh", "Reed Marsh", top="lotus_marsh_grass", under="lotus_silt", underwater="lotus_silt",
              temperature=0.6, humidity=0.3, elevation=0.0, grass_color="#7a9a4a", foliage_color="#9aaa5e",
              water_color="#5aa890", water_fog_color="#2e6050", fog_color="#e8d8b0",
              particles=[("minecraft:white_ash", 0.004), ("minecraft:firefly", 0.002)], ambient="jungle_night",
              music="minecraft:music.overworld.swamp",
              surface_noise=[("lotus_silt", 0.45)],
              features=[
                  Patch(block="lotus_reeds", count=12, tries=48, spread=8),
                  Patch(blocks=[("minecraft:short_grass", 4), ("minecraft:tall_grass", 2), ("minecraft:firefly_bush", 1)],
                        count=4, tries=32),
                  LILIES,
                  Disk(block="lotus_silt", replace=["lotus_marsh_grass"], radius=(2, 4), count=1),
                  Vanilla(id="minecraft:seagrass_swamp"),
              ],
              spawns=[Spawn("dragonfly", 12, (2, 4)), Spawn("lily_toad", 8, (2, 3)), Spawn("mud_croc", 3, (1, 1))]),
        Biome("lotus_willow_isles", "Willow Isles", top="lotus_marsh_grass", under="lotus_silt", underwater="lotus_silt",
              temperature=-0.6, humidity=-0.2, elevation=0.4, grass_color="#5a9040", foliage_color="#86b45a",
              water_color="#3aa090", water_fog_color="#245a50",
              particles=[("minecraft:firefly", 0.004), ("dust:#fff0d0:1.0", 0.002)], ambient="cozy_breeze",
              music="minecraft:music.overworld.forest",
              features=[
                  WILLOW,
                  Tree(log="lotus_willow_log", leaves="lotus_willow_leaves", shape="dark_oak", height=(6, 8),
                       decoration="lotus_willow_moss", count=1, chance=2),
                  FLOWERS,
                  Patch(block="minecraft:firefly_bush", count=1, tries=12),
                  REEDS,
                  LILIES,
              ],
              spawns=[Spawn("lily_toad", 10, (2, 3)), Spawn("dragonfly", 8, (1, 3))]),
        Biome("lotus_bloom_banks", "Bloom Banks", top="lotus_marsh_grass", under="lotus_silt", underwater="lotus_silt",
              temperature=0.5, humidity=-0.6, elevation=0.5, grass_color="#7abb62", foliage_color="#f08aa8",
              water_color="#4ab8a0", water_fog_color="#2a6a60", fog_color="#f6dcc8",
              particles=[("minecraft:cherry_leaves", 0.006), ("dust:#ffd060:0.8", 0.002)], ambient="cozy_breeze",
              music="minecraft:music.overworld.meadow",
              features=[
                  GiantPlant(stem="lotus_stalk", head="lotus_petal_block", shape="flower", height=(8, 15), radius=(4, 7),
                             decoration="lotus_heart", bend=0.3, count=1),
                  GiantPlant(stem="lotus_stalk", head="lotus_petal_block", shape="flower", height=(3, 5), radius=(2, 3),
                             decoration="lotus_heart", count=1),
                  Patch(blocks=[("minecraft:pink_petals", 3), ("minecraft:pink_tulip", 1), ("minecraft:short_grass", 4)],
                        count=5, tries=32),
                  LILIES,
              ],
              spawns=[Spawn("lily_toad", 10, (2, 4)), Spawn("dragonfly", 10, (2, 3))]),
    ],
    effects=[],
    ambient="cozy_breeze",
    music="minecraft:music.overworld.lush_caves",
    icon="portalgun:lotus_root",
)
