"""T-1K Paradisia - a tropical paradise: palm islands, white sand, turquoise lagoons, coral and karst sea stacks."""
import math

import numpy as np
from PIL import Image

from gen.content.dsl import *
from gen.noise import fbm, rng

# palette: turquoise lagoon, white sand, palm green, hibiscus pink, coral orange, sunset gold
P_SAND = ["#d8ccb0", "#e8dec6", "#f2ead8", "#f8f4e8", "#fffdf6"]
P_PINK = ["#d8a0a0", "#e8b4b0", "#f2c8c0", "#f8dcd4", "#fff0ea"]
P_LIME = ["#8a8a80", "#a8a698", "#c4c0b0", "#dcd8c8", "#eeeade"]
P_GRASS = ["#1e6a2a", "#2a8a32", "#3aa83a", "#5cc44a", "#8ae060"]
P_LOAM = ["#4a3020", "#5e3c28", "#744a30", "#8a5a3a"]
P_BARK = ["#5a4430", "#7a5e40", "#9a7a54", "#b89a6c", "#d4b888"]
P_FROND = ["#1a6a24", "#2a8a2e", "#3caa38", "#62c84a", "#9ae070"]
P_HIBISCUS = ["#8a0a20", "#c8102e", "#ee2a4a", "#ff5a6a"]
P_MONSTERA = ["#0e3a1a", "#1e5a26", "#2a7a30", "#3e9a3a", "#6ac05a"]
P_PARADISE = ["#c04010", "#ff7a20", "#ffb030", "#ffe060"]
P_GLOW = ["#d8e8e0", "#e8f4ee", "#7af0ff", "#c0ffff"]
TURQUOISE = "#2fe0d0"


def _hex(c):
    c = c.lstrip("#")
    return np.array([int(c[i:i + 2], 16) for i in (0, 2, 4)], float)


def _img(a):
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "RGBA")


def palm_bark(pal, seed):
    """Palm trunk: stacked overlapping leaf-scar rings (dark lower lip, light upper edge), fibrous between."""
    cols = [_hex(c) for c in pal]
    n = fbm(16, 16, 4, seed, 2)
    a = np.zeros((16, 16, 4))
    a[..., 3] = 255
    for y in range(16):
        for x in range(16):
            ph = (y + (1 if (x // 4) % 2 else 0)) % 4
            v = [1, 2, 3, 2][ph] + (1 if n[y, x] > 0.62 else 0) - (1 if n[y, x] < 0.3 else 0)
            if ph == 0:
                v = 0
            a[y, x, :3] = cols[max(0, min(len(cols) - 1, v))]
    return _img(a)


def coconuts(seed):
    """A hanging bunch of three coconuts on short stalks (hanging plant sprite)."""
    a = np.zeros((16, 16, 4))
    shell = [_hex("#3a2412"), _hex("#5a3a1e"), _hex("#7a5430"), _hex("#9a7448")]
    stalk = _hex("#8a7a3a")
    for y in range(0, 4):
        for x in (7, 8):
            a[y, x, :3] = stalk
            a[y, x, 3] = 255
    for cx, cy in ((5.0, 7.5), (10.5, 7.0), (7.8, 11.2)):
        for y in range(16):
            for x in range(16):
                d = math.hypot((x - cx) / 3.0, (y - cy) / 3.1)
                if d < 1.0:
                    k = (x - cx) * -0.25 + (y - cy) * -0.3
                    i = int(max(0, min(3, round(1.6 + k - d))))
                    a[y, x, :3] = shell[i]
                    a[y, x, 3] = 255
        for dx, dy in ((-1, -2), (0, -2)):
            x, y = int(cx + dx), int(cy + dy)
            if 0 <= x < 16 and 0 <= y < 16:
                a[y, x, :3] = shell[0]
    return _img(a)


def seashells(seed):
    """A few scallop and cone shells lying in the sand (plant sprite, bottom anchored)."""
    a = np.zeros((16, 16, 4))
    R = rng(seed)
    shells = [((4, 13), "#f8d8c8", "#e09a8a"), ((11, 14), "#fff4e0", "#d8b890"), ((8, 11), "#ffe0f0", "#e8a0c0")]
    for (cx, cy), lite, dark in shells:
        L, D = _hex(lite), _hex(dark)
        for y in range(16):
            for x in range(16):
                dx, dy = x - cx, y - cy
                if dy <= 0.5 and math.hypot(dx, dy * 1.3) < 3.0:
                    ang = math.atan2(-dy, dx)
                    rib = int((ang + math.pi) / (math.pi / 6)) % 2
                    a[y, x, :3] = L if rib else D
                    a[y, x, 3] = 255
        a[min(15, cy + 1), cx - 1:cx + 2, :3] = D
        a[min(15, cy + 1), cx - 1:cx + 2, 3] = 255
    return _img(a)


def monstera(pal, seed, part="top"):
    """Split-leaf monstera: big glossy heart-shaped leaves with slits and holes on long stems (tall plant halves)."""
    cols = [_hex(c) for c in pal]
    a = np.zeros((16, 16, 4))
    stem = cols[1]
    if part == "top":
        leaves = [(5.0, 6.0, 4.6, -0.5), (11.0, 8.5, 4.0, 0.6), (8.5, 12.5, 3.2, 0.1)]
        stems = [(7, 16, 5, 9), (9, 16, 11, 11), (8, 16, 8, 14)]
    else:
        leaves = [(4.5, 7.0, 3.4, -0.7)]
        stems = [(7, 16, 7, 0), (9, 16, 9, 0), (8, 16, 5, 9), (6, 16, 7, 0)]
    for x0, y0, x1, y1 in stems:
        n = max(abs(x1 - x0), abs(y1 - y0)) + 1
        for i in range(n):
            t = i / max(1, n - 1)
            x, y = int(round(x0 + (x1 - x0) * t)), int(round(y0 + (y1 - y0) * t))
            if 0 <= x < 16 and 0 <= y < 16:
                a[y, x, :3] = stem
                a[y, x, 3] = 255
    for cx, cy, r, tilt in leaves:
        for y in range(16):
            for x in range(16):
                dx, dy = x - cx, y - cy
                rx = dx * math.cos(tilt) + dy * math.sin(tilt)
                ry = -dx * math.sin(tilt) + dy * math.cos(tilt)
                d = math.hypot(rx / r, ry / (r * 0.85))
                if d >= 1.0:
                    continue
                ang = math.atan2(ry, rx)
                # slits radiating from the midrib, a heart notch at the stem end
                if d > 0.45 and (int((ang + math.pi) / (math.pi / 5)) % 2 == 0) and abs(math.sin(ang * 5)) < 0.22:
                    continue
                if ry > 0 and abs(rx) < r * 0.18 and d > 0.7:
                    continue
                shade = 4 if (abs(rx) < 0.6) else (3 if rx < 0 else 2)
                if d > 0.82:
                    shade = 1
                a[y, x, :3] = cols[shade]
                a[y, x, 3] = 255
    return _img(a)


def glowsand(pal, seed):
    """Bioluminescent sand: pale sand with bright cyan plankton specks."""
    from gen.textures import sand
    a = np.asarray(sand(pal[:2] + ["#f4f8f4"], seed).convert("RGBA"), float).copy()
    R = rng(seed + ":p")
    for _ in range(9):
        x, y = int(R.integers(0, 16)), int(R.integers(0, 16))
        a[y, x, :3] = _hex(pal[3])
        a[(y + 1) % 16, x, :3] = _hex(pal[2])
    return _img(a)


SEA_STACK = Spire(where="underwater", blocks=[("paradisia_limestone", 6), ("minecraft:mossy_cobblestone", 1)],
                  cap="paradisia_palm_fronds", height=(22, 40), radius=(3, 6), lean=0.1, count=1, chance=4)
PALM = Tree(log="paradisia_palm_log", leaves="paradisia_palm_fronds", shape="palm", height=(6, 10),
            decoration="paradisia_coconuts", count=2)
REEF = [Vanilla(id="minecraft:warm_ocean_vegetation", where="underwater"),
        Vanilla(id="minecraft:seagrass_warm", where="underwater"),
        Vanilla(id="minecraft:sea_pickle", where="underwater")]

DIMENSION = Dimension(
    id="paradisia",
    code="T-1K",
    name="Paradisia",
    tagline="Sun, surf and absolutely no problems",
    description=("Islands of white and pink sand ringed by water so turquoise it looks fake, with leaning palms heavy "
                 "with coconuts and jungle hills full of hibiscus. Under the lagoons the coral reefs glow at night, and "
                 "great limestone sea stacks rise out of the shallows like green-crowned towers. Nothing here wants to "
                 "hurt you - though the Coconut Monkeys will absolutely steal your snacks."),
    danger=1,
    color=TURQUOISE,
    terrain=Terrain(style="islands", stone="paradisia_limestone", sea_level=63, height=66, amplitude=20, scale=1.15,
                    roughness=0.12, deepslate="minecraft:tuff",
                    params={"coverage": 0.55, "depth": 10, "island_height": 26, "beach_block": "paradisia_white_sand",
                            "beach_height": 3, "biome_size": 280, "cliffs": True, "cliff_block": "paradisia_limestone"}),
    sky=Sky(sky_color="#5ec4ff", fog_color="#b4ecff", water_fog_color="#3adce4", cloud_color="#f8ffffff",
            cloud_height=175, time="cycle", sunrise_color="#ffff7a50", sky_light_color="#fff8e8",
            bodies=[Celestial("moon", ["#b0c8e0", "#d8e8f4", "#ffffff"], size=16, yaw=200, pitch=40, alpha=0.55,
                              seed="paradisia-daymoon")]),
    blocks=[
        Block("paradisia_white_sand", "White Coral Sand", "sand", {"all": tex("sand", P_SAND, seed="paradisia-sand")},
              hardness=0.5, sound="sand", map_color="sand"),
        Block("paradisia_pink_sand", "Pink Sand", "sand", {"all": tex("sand", P_PINK, seed="paradisia-pink")},
              hardness=0.5, sound="sand", map_color="color_pink"),
        Block("paradisia_glowsand", "Glowing Sand", "sand", {"all": tex(glowsand, P_GLOW, "paradisia-glowsand")},
              hardness=0.5, sound="sand", light=7, map_color="color_light_blue"),
        Block("paradisia_limestone", "Karst Limestone", "stone", {"all": tex("rough_stone", P_LIME, seed="paradisia-lime")},
              hardness=1.4, sound="calcite", map_color="color_light_gray"),
        Block("paradisia_jungle_grass", "Island Grass", "grass", {
            "top": tex("grass_top", P_GRASS, seed="paradisia-grass"),
            "side": tex("grass_side", P_GRASS, P_LOAM, seed="paradisia-grass-side"),
            "bottom": tex("dirt", P_LOAM, seed="paradisia-loam")}, hardness=0.6, sound="grass", map_color="grass"),
        Block("paradisia_loam", "Island Loam", "soil", {"all": tex("dirt", P_LOAM, seed="paradisia-loam")}, hardness=0.5,
              sound="gravel", map_color="dirt"),
        Block("paradisia_palm_log", "Palm Log", "log", {
            "side": tex(palm_bark, P_BARK, "paradisia-bark"),
            "end": tex("log_top", P_BARK, ["#d8c090", "#b89a6c"], seed="paradisia-bark-end")}, hardness=1.8,
              sound="wood", map_color="wood", flammable=True),
        Block("paradisia_palm_fronds", "Palm Fronds", "leaves", {"all": tex("leaves", P_FROND, seed="paradisia-fronds",
                                                                            holes=0.35)},
              hardness=0.2, sound="leaves", map_color="plant", flammable=True),
        Block("paradisia_coconuts", "Coconut Bunch", "hanging_plant", {"cross": tex(coconuts, "paradisia-coconuts")},
              hardness=0.2, sound="wood", fruit="paradisia_coconut", map_color="color_brown"),
        Block("paradisia_hibiscus", "Hibiscus", "plant", {"cross": tex("flower", P_GRASS[:3], P_HIBISCUS,
                                                                        seed="paradisia-hibiscus", shape="star",
                                                                        center_hex="#ffe040")},
              hardness=0.0, sound="grass", map_color="color_pink"),
        Block("paradisia_bird_of_paradise", "Bird of Paradise", "plant", {"cross": tex("flower", P_GRASS[:3], P_PARADISE,
                                                                                        seed="paradisia-bop",
                                                                                        shape="tulip",
                                                                                        center_hex="#3060ff")},
              hardness=0.0, sound="grass", map_color="color_orange"),
        Block("paradisia_monstera", "Monstera", "tall_plant", {
            "bottom": tex(monstera, P_MONSTERA, "paradisia-monstera", part="bottom"),
            "top": tex(monstera, P_MONSTERA, "paradisia-monstera", part="top")}, hardness=0.0, sound="grass",
              map_color="plant"),
        Block("paradisia_seashells", "Seashells", "plant", {"cross": tex(seashells, "paradisia-shells")}, hardness=0.0,
              sound="coral", map_color="color_pink"),
    ],
    items=[
        Item("paradisia_coconut", "Coconut", tex("item_icon", "fruit", ["#3a2412", "#5a3a1e", "#9a7448"],
                                                 seed="paradisia-coconut", accent="#f4f0e0"),
             kind="food", food=Food(5, 0.6, effects=[Effect("minecraft:water_breathing", 45, 0),
                                                     Effect("minecraft:dolphins_grace", 20, 0)]),
             lore="Crack it on a rock, drink the inside, swim like a fish."),
        Item("paradisia_sea_glass", "Sea Glass", tex("item_icon", "gem", ["#2a9a8a", "#6ad8c8", "#c8fff4"],
                                                     seed="paradisia-seaglass"),
             rarity="uncommon", lore="A bottle, a thousand tides, and a crab with taste."),
    ],
    creatures=[
        Creature("coconut_monkey", "Coconut Monkey", "biped", ["#8a5a30", "#ead0a4", "#5a3418", "#1a0c04"],
                 pattern="plain", size=0.62,
                 body={"head": "box", "head_size": 1.35, "ears": "round", "snout": 2, "eye_style": "cute", "blush": True,
                       "mouth": "smile", "arms": 2, "arm_len": 14, "leg_len": 6, "fur": True, "tail": 4,
                       "tail_kind": "curl", "tail_len": 12},
                 behavior="passive", health=10, speed=0.3, tempt="paradisia_coconut", abilities=["climb", "leap"],
                 drops=[Drop("paradisia_coconut", 0, 1, chance=0.5), Drop("minecraft:cocoa_beans", 0, 1, chance=0.3)],
                 sounds="fox", pitch=1.4, xp=2, group=4,
                 description="Climbs the palms, juggles coconuts and will trade you anything for one."),
        Creature("beach_crab", "Beach Crab", "crawler", ["#e8502a", "#ffa070", "#fff4e0", "#101010"], pattern="spots",
                 size=0.6, body={"kind": "crab", "claws": True, "eyestalks": 2, "shell": True, "eye_style": "cute"},
                 behavior="passive", health=8, speed=0.22, armor=3, abilities=["shield"],
                 drops=[Drop("paradisia_sea_glass", 0, 1, chance=0.3), Drop("minecraft:bone_meal", 0, 1)],
                 sounds="armadillo", pitch=1.5, xp=2, group=4,
                 description="Waves its claws at the tide, sideways, all day long. Collects pretty glass."),
        Creature("parrotfish", "Parrotfish", "swimmer", ["#2ad0c0", "#ff6ab0", "#ffd040", "#101030"], pattern="scales",
                 size=0.75, body={"kind": "fish", "beak": True, "body_len": 12, "body_h": 7, "body_w": 4,
                                  "eye_style": "round"},
                 behavior="passive", health=6, speed=0.9,
                 drops=[Drop("minecraft:tropical_fish", 0, 1), Drop("paradisia_white_sand", 0, 2)],
                 sounds="tropical_fish", pitch=1.0, xp=1, group=5,
                 description="Nibbles the coral all day and leaves behind the whitest sand in the multiverse."),
    ],
    biomes=[
        Biome("paradisia_palm_shores", "Palm Shores", top="paradisia_white_sand", under="paradisia_white_sand",
              temperature=0.2, humidity=-0.2, elevation=-0.1, underwater="paradisia_white_sand", grass_color="#5cc44a",
              foliage_color="#3caa38", water_color="#44f2ec", water_fog_color="#3adce4",
              particles=[("minecraft:white_ash", 0.0006)], ambient="tidal_waves",
              music="minecraft:music.overworld.sparse_jungle",
              features=[
                  PALM,
                  Patch(block="paradisia_seashells", count=2, tries=10),
                  Patch(block="paradisia_hibiscus", count=1, tries=8, chance=2),
                  Patch(block="paradisia_monstera", count=1, tries=6, chance=2),
              ] + REEF,
              spawns=[Spawn("beach_crab", 12, (2, 4)), Spawn("coconut_monkey", 6, (1, 3)), Spawn("parrotfish", 8, (3, 5))]),
        Biome("paradisia_hibiscus_hills", "Hibiscus Highlands", top="paradisia_jungle_grass", under="paradisia_loam",
              temperature=0.4, humidity=0.6, elevation=0.5, grass_color="#3aa83a", foliage_color="#2a8a2e",
              water_color="#44f2ec", water_fog_color="#3adce4", particles=[("minecraft:cherry_leaves", 0.0004)],
              ambient="jungle_night", music="minecraft:music.overworld.jungle",
              features=[
                  Tree(log="paradisia_palm_log", leaves="paradisia_palm_fronds", shape="palm", height=(8, 13),
                       decoration="paradisia_coconuts", count=3),
                  Tree(log="minecraft:jungle_log", leaves="paradisia_palm_fronds", shape="jungle", height=(6, 10), count=1),
                  Patch(block="paradisia_monstera", count=4, tries=16),
                  Patch(block="paradisia_hibiscus", count=3, tries=16),
                  Patch(block="paradisia_bird_of_paradise", count=2, tries=12),
                  Vanilla(id="minecraft:spring_water"),
                  Lake(fluid="minecraft:water", border="paradisia_limestone", count=1, chance=8),
              ],
              spawns=[Spawn("coconut_monkey", 12, (2, 4)), Spawn("beach_crab", 2, (1, 2))]),
        Biome("paradisia_coral_lagoon", "Coral Lagoon", top="paradisia_white_sand", under="paradisia_white_sand",
              temperature=-0.3, humidity=0.2, elevation=-0.7, underwater="paradisia_white_sand", grass_color="#5cc44a",
              foliage_color="#3caa38", water_color="#40f0e8", water_fog_color="#34d4e0", ambient="tidal_waves",
              music="minecraft:music.under_water",
              features=[
                  SEA_STACK,
                  Structure(kind="arch", where="underwater", blocks={"main": "paradisia_limestone",
                                                                     "alt": "minecraft:mossy_cobblestone"},
                            size=(7, 11), count=1, chance=10),
                  Disk(block="paradisia_glowsand", replace=["paradisia_white_sand"], radius=(2, 4), where="underwater",
                       count=2),
              ] + REEF + [Vanilla(id="minecraft:warm_ocean_vegetation", where="underwater")],
              spawns=[Spawn("parrotfish", 14, (3, 6)), Spawn("beach_crab", 4, (1, 3))]),
        Biome("paradisia_pink_cove", "Pink Sand Cove", top="paradisia_pink_sand", under="paradisia_pink_sand",
              temperature=-0.6, humidity=-0.5, underwater="paradisia_pink_sand", grass_color="#6ad050",
              foliage_color="#4ab840", water_color="#50f4ee", water_fog_color="#3adce4", sky_color="#7acaff",
              particles=[("minecraft:cherry_leaves", 0.0003)], ambient="cozy_breeze",
              music="minecraft:music.overworld.cherry_grove",
              features=[
                  Tree(log="paradisia_palm_log", leaves="paradisia_palm_fronds", shape="palm", height=(5, 8),
                       decoration="paradisia_coconuts", count=1),
                  Patch(block="paradisia_seashells", count=3, tries=12),
                  Patch(block="paradisia_hibiscus", count=2, tries=8),
                  Boulder(blocks=[("paradisia_limestone", 3), ("minecraft:mossy_cobblestone", 1)], radius=(2, 3),
                          squash=0.8, count=1, chance=3),
                  SEA_STACK,
              ] + REEF,
              spawns=[Spawn("beach_crab", 14, (3, 5)), Spawn("parrotfish", 6, (2, 4)), Spawn("coconut_monkey", 3, (1, 2))]),
    ],
    effects=[],
    ambient="tidal_waves",
    music="minecraft:music.overworld.sparse_jungle",
    icon="portalgun:paradisia_coconut",
)
