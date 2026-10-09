"""N-21 Saltara - blinding white salt flats crazed with polygons, rose-pink brine lakes and halite crystal gardens."""
import math

import numpy as np
from PIL import Image

from gen.content.dsl import *
from gen.noise import fbm, rng

# ------------------------------------------------------------------------------------------------ palette
# salt white / blush pink / rose lake / pale sky cyan / warm sand beige
P_SALT = ["#d8d2cc", "#e6e1db", "#f0ece7", "#f8f6f2", "#ffffff"]
P_PACKED = ["#c8beb4", "#d6cec4", "#e2dbd2", "#eee8e0"]
P_ROCK = ["#b8aca4", "#c8bcb4", "#d6ccc4", "#e4dcd4", "#f0eae4"]
P_ROSE = ["#c0607a", "#d27890", "#e292a6", "#eeb0c0", "#f8d0da"]
P_HALITE = ["#e0d0dc", "#f2e8ee", "#fbf6f8", "#ffffff", "#ffe6f0"]
P_GLOW = ["#e06080", "#f08aa0", "#ffb4c4", "#ffdae2", "#ffffff"]
P_SILVER = ["#6a8a8a", "#86a6a2", "#a4c0ba", "#c4d8d0"]
P_SAMPHIRE = ["#a03a50", "#c85a6e", "#e07e8e", "#f4a8b4"]


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


def _voronoi(seed, n):
    """Tileable Voronoi on the 16x16 tile: (F1 index, F2-F1 edge distance)."""
    R = rng(seed)
    pts = R.uniform(0, 16, (n, 2))
    yy, xx = np.mgrid[0:16, 0:16] + 0.5
    best = np.full((16, 16), 1e9)
    second = np.full((16, 16), 1e9)
    idx = np.zeros((16, 16), int)
    for i, (px, py) in enumerate(pts):
        for ox in (-16, 0, 16):
            for oy in (-16, 0, 16):
                d = np.hypot(xx - px - ox, yy - py - oy)
                closer = d < best
                second = np.where(closer, best, np.minimum(second, d))
                idx = np.where(closer, i, idx)
                best = np.where(closer, d, best)
    return idx, second - best


def salt_polygons(pal, seed, cells=5):
    """The famous salt-flat crust: bright flat polygons outlined by thin raised ridges (white crest, grey shadow)."""
    idx, _ = _voronoi(seed, cells)
    n = fbm(16, 16, 4, seed + ":n", 2)
    R = rng(seed + ":tone")
    tone = R.uniform(0.45, 0.75, 64)[idx % 64]
    rgb = _ramp(pal, tone + (n - 0.5) * 0.2)
    right = np.roll(idx, -1, axis=1)
    down = np.roll(idx, -1, axis=0)
    ridge = (idx != right) | (idx != down)
    rgb[ridge] = _hex(pal[4])
    sh = np.roll(ridge, 1, axis=0) & ~ridge
    rgb[sh] = _hex(pal[0])
    sh2 = np.roll(ridge, 1, axis=1) & ~ridge & ~sh
    rgb[sh2] = rgb[sh2] * 0.95
    for _ in range(4):
        x, y = int(R.integers(0, 16)), int(R.integers(0, 16))
        if not ridge[y, x]:
            rgb[y, x] = _hex(pal[1])
    return _img(rgb)


def salt_strata(pal, crust_pal, seed):
    """Side of the crust: a bright polygon-ridged lip over thin pink-and-white evaporite layers."""
    n = fbm(16, 16, 4, seed, 2)
    yy = np.mgrid[0:16, 0:16][0]
    band = (yy + (n * 3).astype(int)) % 5
    t = 0.35 + band / 10.0 + (n - 0.5) * 0.2
    rgb = _ramp(pal, t)
    pink = band == 2
    rgb[pink] = rgb[pink] * 0.75 + _hex("#f0b8c4") * 0.25
    lip = yy < 3 + (n[0:1, :] * 2).astype(int)
    rgb[lip] = _ramp(crust_pal, 0.7 + n * 0.3)[lip]
    edge = (yy == 3 + (n[0:1, :] * 2).astype(int)).repeat(1, 0)
    rgb[edge] = rgb[edge] * 0.86
    return _img(rgb)


def salt_raft(pal, seed):
    """A thin floating raft of salt crystals (top view) - hoppered cubes with soft edges."""
    out = np.zeros((16, 16, 4), float)
    R = rng(seed)
    for _ in range(int(R.integers(5, 8))):
        s = int(R.integers(3, 6))
        x, y = int(R.integers(1, 15 - s)), int(R.integers(1, 15 - s))
        for i in range(s):
            for j in range(s):
                edgev = min(i, j, s - 1 - i, s - 1 - j)
                c = _hex(pal[4 if edgev == 0 and (i == 0 or j == 0) else (2 if edgev == 0 else 3 - (edgev % 2))])
                out[y + i, x + j, :3] = c
                out[y + i, x + j, 3] = 255
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGBA")


# ------------------------------------------------------------------------------------------------ features
HALITE_GIANT = CrystalCluster(block="saltara_halite", small="saltara_halite_shard", size=(7, 13), count=1, chance=4)
HALITE_SMALL = CrystalCluster(block="saltara_halite", small="saltara_halite_shard", size=(3, 6), count=1, chance=2)
SALT_CHIMNEY = Spire(blocks=[("saltara_salt_rock", 4), ("saltara_rose_salt", 1)], tip="saltara_glow_halite",
                     cap="saltara_halite", height=(7, 15), radius=(1, 3), lean=0.1, count=1, chance=3)
SALT_ARCH = Structure(kind="arch", blocks={"main": "saltara_salt_rock", "alt": "saltara_rose_salt"}, size=(7, 12),
                      params={"height": 1.15}, count=1, chance=10)
SALT_RAFTS = Patch(block="saltara_salt_raft", where="water_surface", count=3, tries=24, max_depth=0)

DIMENSION = Dimension(
    id="saltara",
    code="N-21",
    name="Saltara",
    tagline="Blinding salt flats and rose-pink lakes",
    description=("A perfectly flat white world under a perfectly blue sky - bring sunglasses. The salt crust cracks "
                 "into endless polygons, brine lakes glow rose pink, and halite crystals the size of houses grow "
                 "wherever the brine springs bubble up. Long-legged Stiltbirds wade the lakes, Salt Crabs scuttle over "
                 "the crust and Brine Shrimp tint the water. Nothing here wants to hurt you; the sun might."),
    danger=1,
    color="#f6b8c8",
    terrain=Terrain(style="flat", stone="saltara_salt_rock", sea_level=63, height=65, amplitude=1.6, scale=1.4,
                    roughness=0.0, caves=False, deepslate="minecraft:calcite",
                    params={"ponds": 0.42, "biome_size": 380}),
    sky=Sky(sky_color="#7cc4f0", fog_color="#fbf4ee", water_fog_color="#e07a96", fog_start=80, fog_end=340,
            cloud_color="#80ffffff", cloud_height=220, time="noon", sky_light_color="#fff8f0",
            bodies=[Celestial("planet", ["#e890a8", "#f8c8d4", "#fff0f4"], size=20, yaw=150, pitch=24, roll=10,
                              alpha=0.45, seed="saltara-pinkworld"),
                    Celestial("moon", ["#ffffff"], size=18, yaw=210, pitch=30, alpha=0.4, seed="saltara-daymoon")]),
    blocks=[
        Block("saltara_salt_crust", "Salt Crust", "grass", {
            "top": tex(salt_polygons, P_SALT, "sc-a", 6),
            "side": tex(salt_strata, P_PACKED, P_SALT, "saltara-crust-side"),
            "bottom": tex("salt", P_PACKED, seed="saltara-packed")}, hardness=0.8, sound="calcite", tool="shovel",
              map_color="snow"),
        Block("saltara_packed_salt", "Packed Salt", "soil", {"all": tex("salt", P_PACKED, seed="saltara-packed")},
              hardness=0.7, sound="calcite", map_color="snow"),
        Block("saltara_salt_rock", "Salt Rock", "stone", {"all": tex("salt", P_ROCK, seed="saltara-rock")}, hardness=1.2,
              sound="calcite", map_color="quartz"),
        Block("saltara_rose_salt", "Rose Salt", "stone", {"all": tex("salt", P_ROSE, seed="saltara-rose")}, hardness=1.2,
              sound="calcite", map_color="color_pink"),
        Block("saltara_halite", "Halite", "crystal_block", {"all": tex("crystal", P_HALITE, seed="saltara-halite", shards=6)},
              hardness=1.0, sound="amethyst", light=4, map_color="snow"),
        Block("saltara_glow_halite", "Rose Halite Lamp", "glow", {"all": tex("lamp", P_GLOW, seed="saltara-glow",
                                                                               style="orb")},
              hardness=0.8, sound="amethyst", light=13, emissive=True, map_color="color_pink"),
        Block("saltara_halite_shard", "Halite Shard", "crystal_cluster", {
            "cross": tex("crystal_shard_sprite", P_HALITE, seed="saltara-shard", count=3)}, hardness=0.4,
              sound="amethyst_cluster", light=3, fruit="saltara_rock_salt", drop_count=(1, 2), map_color="snow"),
        Block("saltara_brine_spring", "Brine Spring", "vent", {
            "top": tex("salt", P_ROSE, seed="saltara-spring"),
            "side": tex("salt", P_ROCK, seed="saltara-rock2")}, hardness=1.2, sound="calcite",
              particle="minecraft:cloud", map_color="color_pink"),
        Block("saltara_saltbush", "Saltbush", "plant", {"cross": tex("fern", P_SILVER, seed="saltara-saltbush")},
              hardness=0.0, sound="grass", map_color="color_light_gray"),
        Block("saltara_rose_samphire", "Rose Samphire", "plant", {"cross": tex("coral_fan", P_SAMPHIRE,
                                                                                 seed="saltara-samphire")},
              hardness=0.0, sound="grass", map_color="color_pink"),
        Block("saltara_salt_lily", "Salt Lily", "plant", {
            "cross": tex("flower", P_SILVER, ["#f4dce4", "#fff4f8", "#ffffff"], seed="saltara-lily", shape="star",
                         center_hex="#f08aa0")}, hardness=0.0, sound="grass", light=2, map_color="snow"),
        Block("saltara_salt_raft", "Salt Raft", "lily", {"top": tex(salt_raft, P_SALT, "saltara-raft")}, hardness=0.0,
              sound="calcite", map_color="snow"),
    ],
    items=[
        Item("saltara_rock_salt", "Rock Salt", tex("item_icon", "crystal", P_HALITE, seed="saltara-rocksalt"),
             lore="A perfect cube, every time. Saltara is very particular."),
        Item("saltara_brine_shrimp", "Brine Shrimp", tex("item_icon", "meat_raw", ["#c04a60", "#f08aa0", "#ffd0dc"],
                                                         seed="saltara-shrimp"),
             kind="food", food=Food(2, 0.3, fast=True, effects=[Effect("minecraft:dolphins_grace", 20, 0)]),
             lore="Stiltbirds eat thousands a day. That is why Stiltbirds are pink."),
        Item("saltara_pink_plume", "Stiltbird Plume", tex("item_icon", "feather", ["#e07a96", "#f6b8c8", "#fff0f4"],
                                                          seed="saltara-plume"),
             rarity="uncommon", lore="Light enough to float on brine. Pink enough to be suspicious."),
    ],
    creatures=[
        Creature("stiltbird", "Stiltbird", "biped", ["#f49ab4", "#ffe4ec", "#2a1a20", "#1a1010", "#ff6a8a"],
                 pattern="gradient", size=1.1,
                 body={"stance": "raptor", "leg_len": 24, "leg_w": 1, "body_len": 10, "body_w": 7, "body_h": 7, "neck": 13,
                       "neck_angle": 70, "beak": 5, "hooked": True, "arms": 0, "tail": 1, "tail_kind": "fan",
                       "head_size": 0.75, "eye_style": "round", "eyes": 2, "crest": False},
                 behavior="passive", health=12, speed=0.26, tempt="saltara_brine_shrimp",
                 drops=[Drop("saltara_pink_plume", 0, 2), Drop("minecraft:feather", 0, 1)],
                 sounds="parrot", pitch=0.75, xp=3, group=6,
                 description="A pink wader on legs twice your height. It stands on one of them for hours."),
        Creature("salt_crab", "Salt Crab", "crawler", ["#f6eee8", "#f0a8b8", "#ffffff", "#201418", "#d8c8d0"],
                 pattern="speckle", size=0.7,
                 body={"kind": "crab", "legs": 3, "claws": True, "crystals": 3, "shell": True, "eyestalks": 2,
                       "body_w": 10, "body_h": 4, "body_len": 8},
                 behavior="passive", health=10, speed=0.22, armor=3, abilities=["shield"],
                 drops=[Drop("saltara_rock_salt", 1, 3)],
                 sounds="armadillo", pitch=1.3, xp=2, group=4,
                 description="Grows salt crystals on its shell and polishes them every morning."),
        Creature("brine_shrimp", "Brine Shrimp", "swimmer", ["#f07a94", "#ffc0d0", "#ffffff", "#200810"],
                 pattern="stripes", size=0.4,
                 body={"kind": "shrimp", "antennae": 5, "translucent": True, "body_len": 10},
                 behavior="passive", health=3, speed=0.5, category="water_ambient",
                 drops=[Drop("saltara_brine_shrimp", 1, 2)],
                 sounds="tropical_fish", pitch=1.5, xp=1, group=8,
                 description="Tiny, pink and countless. The lakes are pink because of them."),
    ],
    biomes=[
        Biome("saltara_blinding_flats", "Blinding Flats", top="saltara_salt_crust", under="saltara_packed_salt",
              underwater="saltara_rose_salt", temperature=0.0, humidity=0.0, elevation=0.2,
              grass_color="#c4d8d0", foliage_color="#a4c0ba", water_color="#f08aa0", water_fog_color="#e07a96",
              particles=[("minecraft:white_ash", 0.006), ("dust:#ffffff:0.6", 0.002)], ambient="wind_howl",
              music="minecraft:music.overworld.desert",
              features=[
                  HALITE_SMALL,
                  Patch(block="saltara_salt_lily", count=1, tries=8, chance=2),
                  Patch(block="saltara_saltbush", count=1, tries=6, chance=2),
                  SALT_ARCH,
                  SALT_RAFTS,
              ],
              spawns=[Spawn("salt_crab", 10, (2, 4)), Spawn("stiltbird", 3, (1, 2)), Spawn("brine_shrimp", 6, (3, 6))]),
        Biome("saltara_rose_lakes", "Rose Lakes", top="saltara_salt_crust", under="saltara_packed_salt",
              underwater="saltara_rose_salt", temperature=0.3, humidity=0.7, elevation=-0.7,
              grass_color="#d8a8b8", foliage_color="#e07e8e", water_color="#f27896", water_fog_color="#d0607e",
              fog_color="#fbe8ec", particles=[("dust:#f8b4c4:0.9", 0.003), ("minecraft:white_ash", 0.002)],
              ambient="tidal_waves", music="minecraft:music.overworld.cherry_grove",
              surface_noise=[("saltara_rose_salt", 0.55)],
              features=[
                  SALT_RAFTS,
                  Patch(block="saltara_salt_raft", where="water_surface", count=4, tries=32, max_depth=0),
                  Patch(blocks=[("saltara_rose_samphire", 3), ("saltara_salt_lily", 1)], count=3, tries=24),
                  HALITE_SMALL,
              ],
              spawns=[Spawn("stiltbird", 14, (3, 7)), Spawn("brine_shrimp", 16, (4, 8)), Spawn("salt_crab", 4, (1, 3))]),
        Biome("saltara_halite_gardens", "Halite Gardens", top="saltara_salt_crust", under="saltara_packed_salt",
              underwater="saltara_rose_salt", temperature=-0.7, humidity=-0.3, elevation=0.3,
              grass_color="#c4d8d0", foliage_color="#a4c0ba", water_color="#f08aa0", water_fog_color="#e07a96",
              particles=[("minecraft:end_rod", 0.0008), ("dust:#fff4f8:0.7", 0.004)], ambient="crystal_chimes",
              music="minecraft:music.overworld.snowy_slopes",
              surface_noise=[("saltara_salt_rock", 0.6)],
              features=[
                  HALITE_GIANT,
                  CrystalCluster(block="saltara_halite", small="saltara_halite_shard", size=(4, 8), count=1),
                  SALT_CHIMNEY,
                  Patch(block="saltara_halite_shard", count=3, tries=16),
                  Patch(block="saltara_salt_lily", count=2, tries=12),
                  SALT_ARCH,
              ],
              spawns=[Spawn("salt_crab", 14, (2, 5)), Spawn("stiltbird", 2, (1, 2))]),
        Biome("saltara_brine_springs", "Brine Springs", top="saltara_salt_crust", under="saltara_packed_salt",
              underwater="saltara_rose_salt", temperature=0.75, humidity=-0.6, elevation=0.1,
              grass_color="#d0c0b8", foliage_color="#c85a6e", water_color="#ee7090", water_fog_color="#d0607e",
              fog_color="#f6eee8", particles=[("minecraft:cloud", 0.0015), ("minecraft:white_ash", 0.004)],
              ambient="bubbling", music="minecraft:music.overworld.badlands",
              surface_noise=[("saltara_rose_salt", 0.5)],
              features=[
                  Structure(kind="geyser", blocks={"vent": "saltara_brine_spring", "mound": "saltara_rose_salt"},
                            size=(4, 8), params={"pools": 1, "height": 1.2}, count=1, chance=2),
                  SALT_CHIMNEY,
                  Spire(blocks=[("saltara_rose_salt", 3), ("saltara_salt_rock", 2)], cap="saltara_salt_crust",
                        height=(4, 8), radius=(1, 2), count=2),
                  Patch(block="saltara_brine_spring", count=1, tries=4),
                  Patch(block="saltara_rose_samphire", count=2, tries=16),
                  HALITE_SMALL,
              ],
              spawns=[Spawn("salt_crab", 10, (2, 4)), Spawn("stiltbird", 6, (2, 4)), Spawn("brine_shrimp", 8, (3, 6))]),
    ],
    effects=[],
    ambient="wind_howl",
    music="minecraft:music.overworld.desert",
    icon="portalgun:saltara_rock_salt",
)
