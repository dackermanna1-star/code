"""J-8 Sakura Heights - terraced hills under eternal cherry blossom, bamboo groves, koi ponds and drifting lanterns."""
import math

import numpy as np
from PIL import Image

from gen.content.dsl import *
from gen.noise import fbm, rng

# ------------------------------------------------------------------------------------------------ palette
# blossom pink / fresh spring green / dark cherry bark / vermilion lacquer / misty white / pond teal
P_GRASS = ["#4a8a3a", "#5a9e44", "#6cb250", "#82c460", "#a0d47a"]
P_SOIL = ["#4a3628", "#5a4432", "#6c523e", "#7e624c"]
P_SLATE = ["#5a6070", "#6a7080", "#7a8090", "#8c92a0", "#a0a6b2"]
P_BARK = ["#3a2224", "#4a2c2e", "#5c3a3a", "#704a48"]
P_BLOSSOM = ["#d86890", "#ec88aa", "#f6a8c2", "#fcc8d8", "#ffe4ee"]
P_WHITE = ["#d8c8d8", "#e8dce8", "#f6eef4", "#fff8fc", "#ffffff"]
P_VERMILION = ["#8a1a10", "#a82416", "#c8341e", "#e04a2a"]
P_PAPER = ["#c06020", "#f0a040", "#ffd890", "#fff4d8"]
PETALS = ["#f6a8c2", "#fcc8d8", "#ffe4ee", "#ec88aa"]


def _hex(c):
    c = c.lstrip("#")
    return np.array([int(c[i:i + 2], 16) for i in (0, 2, 4)], float)


def _arr(img):
    return np.asarray(img.convert("RGBA"), float).copy()


def _img(a):
    return Image.fromarray(np.clip(np.round(a), 0, 255).astype(np.uint8), "RGBA")


def _petal(a, x, y, col, R):
    """A 2px petal with a paler tip pixel (wraps)."""
    c = _hex(col)
    d = [(1, 0), (0, 1), (1, 1), (-1, 0)][int(R.integers(0, 4))]
    a[y % 16, x % 16, :3] = c
    a[y % 16, x % 16, 3] = 255
    a[(y + d[1]) % 16, (x + d[0]) % 16, :3] = np.minimum(c * 1.08 + 12, 255)
    a[(y + d[1]) % 16, (x + d[0]) % 16, 3] = 255


def petal_strewn(base, cols, seed, count=4):
    """Any texture with a few fallen blossom petals on it."""
    a = _arr(base)
    R = rng(seed + ":petals")
    for _ in range(count):
        _petal(a, int(R.integers(0, 16)), int(R.integers(0, 16)), cols[int(R.integers(0, len(cols)))], R)
    return _img(a)


def petal_carpet(cols, seed, count=40):
    """A thick drift of fallen petals (opaque: pale blush base densely covered in petals)."""
    a = np.zeros((16, 16, 4), float)
    base = fbm(16, 16, 4, seed + ":base", 2)
    for y in range(16):
        for x in range(16):
            a[y, x, :3] = _hex(cols[2]) * (0.9 + base[y, x] * 0.12)
            a[y, x, 3] = 255
    R = rng(seed)
    n = fbm(16, 16, 8, seed, 2)
    tries = 0
    placed = 0
    while placed < count and tries < 400:
        tries += 1
        x, y = int(R.integers(0, 16)), int(R.integers(0, 16))
        if n[y, x] < 0.45 and R.uniform() < 0.7:
            continue
        _petal(a, x, y, cols[int(R.integers(0, len(cols)))], R)
        placed += 1
    return _img(a)


def floating_petals(cols, seed):
    """Petals floating on a pond (top view), a ring of tiny ripples around the thickest drift."""
    a = np.zeros((16, 16, 4), float)
    R = rng(seed)
    cx, cy = R.uniform(5, 11), R.uniform(5, 11)
    for _ in range(14):
        r, t = abs(R.normal(0, 3.2)), R.uniform(0, 2 * math.pi)
        _petal(a, int(cx + r * math.cos(t)), int(cy + r * math.sin(t)), cols[int(R.integers(0, len(cols)))], R)
    for k in range(20):
        t = k / 20 * 2 * math.pi
        x, y = int(round(cx + 6.5 * math.cos(t))) % 16, int(round(cy + 6.5 * math.sin(t))) % 16
        if a[y, x, 3] == 0 and k % 3:
            a[y, x] = [220, 240, 250, 90]
    return _img(a)


def shoji_lamp(pal, frame_hex, seed):
    """Paper lantern panel: glowing warm paper behind a dark wooden lattice (shoji grid)."""
    yy, xx = np.mgrid[0:16, 0:16]
    n = fbm(16, 16, 4, seed, 2)
    r = np.hypot(xx - 7.5, yy - 7.5) / 10.6
    cols = np.array([_hex(c) for c in pal])
    t = np.clip(1.0 - r + (n - 0.5) * 0.2, 0, 0.999) * (len(pal) - 1)
    i = t.astype(int)
    f = (t - i)[..., None]
    rgb = cols[i] * (1 - f) + cols[np.minimum(i + 1, len(pal) - 1)] * f
    frame = _hex(frame_hex)
    lattice = (xx % 5 == 0) | (yy % 5 == 0) | (xx == 15) | (yy == 15)
    rgb[lattice] = frame
    a = np.concatenate([rgb, np.full((16, 16, 1), 255.0)], -1)
    return _img(a)


def lacquer(pal, seed):
    """Vermilion-lacquered wood: smooth glossy red boards with a black-lacquered band at the top and bottom."""
    yy, xx = np.mgrid[0:16, 0:16]
    n = fbm(16, 16, 4, seed, 2)
    cols = np.array([_hex(c) for c in pal])
    t = np.clip(0.55 + (n - 0.5) * 0.35 + (xx % 8 == 0) * -0.25, 0, 0.999) * (len(pal) - 1)
    rgb = cols[t.astype(int)]
    seam = (xx % 8 == 7)
    rgb[seam] = cols[0] * 0.8
    band = (yy < 2) | (yy > 13)
    rgb[band] = _hex("#1a1214") + (n[band, None] * 18)
    gloss = (xx == 2) & (yy > 3) & (yy < 12)
    rgb[gloss] = np.minimum(cols[-1] * 1.2, 255)
    a = np.concatenate([rgb, np.full((16, 16, 1), 255.0)], -1)
    return _img(a)


# ------------------------------------------------------------------------------------------------ features
GREAT_SAKURA = GiantPlant(stem="sakura_log", head="sakura_blossom_leaves", shape="puff", height=(12, 18), radius=(6, 8),
                          stem_width=2, bend=0.45, decoration="sakura_hanging_blossom", count=1, chance=3)
CHERRY = Tree(log="sakura_log", leaves="sakura_blossom_leaves", shape="cherry", height=(5, 8), count=2)
SPIRIT_GATE = Structure(kind="arch", blocks={"main": "sakura_vermilion_wood", "alt": "sakura_vermilion_wood"},
                        size=(5, 8), params={"height": 1.5, "thickness": 0.9}, count=1, chance=8)
STONE_LANTERN = Spire(blocks=[("sakura_slate", 1)], cap="sakura_paper_lamp", height=(3, 4), radius=(1, 1), count=1,
                      chance=3)
PETAL_CARPET = Patch(blocks=[("minecraft:pink_petals", 4), ("sakura_petal_carpet", 1)], count=4, tries=32, spread=6)
POND_PETALS = Patch(block="sakura_floating_petals", where="water_surface", count=4, tries=32, max_depth=0)

DIMENSION = Dimension(
    id="sakura",
    code="J-8",
    name="Sakura Heights",
    tagline="Cherry-blossom terraces where it is always spring",
    description=("Green terraces climb into the mist, every step crowned with cherry trees in full bloom and petals "
                 "drifting on the breeze. Bamboo groves creak in the valleys, koi circle in still ponds beneath "
                 "vermilion spirit gates, and paper lanterns float by themselves at dusk. The white Spirit Foxes are "
                 "gentle - unless you are not."),
    danger=1,
    color="#f6a8c2",
    terrain=Terrain(style="terraces", stone="sakura_slate", sea_level=62, height=76, amplitude=16, scale=1.45,
                    roughness=0.08, deepslate="minecraft:deepslate",
                    params={"step": 4, "smoothness": 0.22, "rivers": 0.4, "biome_size": 260,
                            "cliff_block": "sakura_mossy_slate", "cliffs": True}),
    sky=Sky(sky_color="#a8d0f0", fog_color="#f8dce6", water_fog_color="#2a7a80", fog_start=40, fog_end=200,
            cloud_color="#f0fff0f4", cloud_height=200, time=2000, sunrise_color="#ffffc0d0", ambient_light=0.04,
            bodies=[Celestial("moon", ["#fff4f8"], size=12, yaw=120, pitch=40, alpha=0.35, seed="sakura-daymoon"),
                    Celestial("sun", ["#ffc8d8", "#ffe8f0", "#ffffff"], size=34, yaw=250, pitch=55, alpha=0.35,
                              additive=True, seed="sakura-halo")]),
    blocks=[
        Block("sakura_grass", "Spring Grass", "grass", {
            "top": tex(petal_strewn, tex("grass_top", P_GRASS, seed="sakura-grass"), PETALS, "sakura-grass", 3),
            "side": tex("grass_side", P_GRASS, P_SOIL, seed="sakura-grass"),
            "bottom": tex("dirt", P_SOIL, seed="sakura-soil")}, hardness=0.6, sound="grass", map_color="grass"),
        Block("sakura_soil", "Terrace Soil", "soil", {"all": tex("dirt", P_SOIL, seed="sakura-soil")}, hardness=0.5,
              sound="gravel", map_color="dirt"),
        Block("sakura_slate", "Mist Slate", "stone", {"all": tex("stone", P_SLATE, seed="sakura-slate")}, hardness=1.5,
              sound="deepslate", map_color="color_gray"),
        Block("sakura_mossy_slate", "Mossy Slate", "stone", {
            "all": tex("rough_stone", ["#4a6050", "#5a7060", "#6a8070", "#7e9284", "#94a698"], seed="sakura-mossy")},
              hardness=1.5, sound="deepslate", map_color="color_gray"),
        Block("sakura_log", "Sakura Log", "log", {
            "side": tex("log_side", P_BARK, seed="sakura-bark"),
            "end": tex("log_top", P_BARK, ["#e8b0b8", "#c88a94"], seed="sakura-bark-end")}, hardness=2.0, sound="cherry_wood",
              map_color="color_brown", flammable=True),
        Block("sakura_blossom_leaves", "Sakura Blossoms", "leaves", {
            "all": tex("leaves", P_BLOSSOM, seed="sakura-blossom", holes=0.2)}, hardness=0.2, sound="cherry_leaves",
              particle="minecraft:cherry_leaves", map_color="color_pink", flammable=True),
        Block("sakura_moonblossom_leaves", "Moonblossoms", "leaves", {
            "all": tex("leaves", P_WHITE, seed="sakura-moonblossom", holes=0.2)}, hardness=0.2, sound="cherry_leaves",
              particle="minecraft:cherry_leaves", light=3, map_color="snow", flammable=True),
        Block("sakura_hanging_blossom", "Blossom Strand", "hanging_plant", {
            "cross": tex("vine_overlay", ["#d86890", "#f6a8c2", "#ffe4ee"], seed="sakura-strand")}, hardness=0.0,
              sound="cherry_leaves", map_color="color_pink"),
        Block("sakura_petal_carpet", "Petal Drift", "carpet", {"all": tex(petal_carpet, PETALS, "sakura-petals")},
              hardness=0.0, sound="pink_petals", map_color="color_pink", flammable=True),
        Block("sakura_floating_petals", "Pond Petals", "lily", {"top": tex(floating_petals, PETALS, "sakura-pondpetals")},
              hardness=0.0, sound="pink_petals", map_color="color_pink"),
        Block("sakura_vermilion_wood", "Vermilion Lacquer", "planks", {"all": tex(lacquer, P_VERMILION, "sakura-lacquer")},
              hardness=2.0, sound="cherry_wood", map_color="color_red", flammable=True),
        Block("sakura_paper_lamp", "Shoji Lamp", "glow", {"all": tex(shoji_lamp, P_PAPER, "#2a1a14", "sakura-shoji")},
              hardness=0.6, sound="bamboo_wood", light=14, emissive=True, tool="axe", map_color="color_orange"),
        Block("sakura_iris", "Pond Iris", "plant", {
            "cross": tex("flower", ["#3a6a30", "#4a8a3a", "#62a04a"], ["#5a3aa0", "#7a5ac8", "#a888e8"], seed="sakura-iris",
                         shape="tulip", center_hex="#ffd040")}, hardness=0.0, sound="grass", map_color="color_purple"),
    ],
    items=[
        Item("sakura_mochi", "Sakura Mochi", tex("item_icon", "candy", ["#d86890", "#fcc8d8", "#ffffff"], seed="sakura-mochi"),
             kind="food", food=Food(5, 0.7, effects=[Effect("minecraft:regeneration", 8, 0), Effect("minecraft:luck", 60, 0)]),
             lore="Left as an offering. The lantern did not mind sharing."),
        Item("sakura_fox_tuft", "Spirit Fox Tuft", tex("item_icon", "feather", ["#c8c0d8", "#fff8fc", "#ffd0e0"],
                                                       seed="sakura-tuft"),
             rarity="rare", glint=True, lore="Warm to the touch, and it smells faintly of blossoms and rain."),
        Item("sakura_lantern_ember", "Lantern Ember", tex("item_icon", "orb", ["#c04010", "#f09030", "#ffe0a0"],
                                                          seed="sakura-ember"),
             lore="A little flame that has forgotten how to burn things."),
    ],
    creatures=[
        Creature("spirit_fox", "Spirit Fox", "quadruped", ["#fbf6f8", "#ffc4da", "#ff7aa8", "#ff4a90", "#ffd0e0"],
                 pattern="gradient", size=0.85,
                 body={"leg_len": 7, "leg_w": 2, "body_len": 13, "body_h": 7, "body_w": 7, "neck": 3, "neck_angle": 30,
                       "ears": "pointy", "snout": 4, "tail": 2, "tail_len": 7, "tail_kind": "bushy", "eye_style": "slit",
                       "eye_size": 2, "glow_tips": True, "fur": True, "head_size": 1.05},
                 behavior="neutral", health=24, damage=5, speed=0.33, abilities=["blink"],
                 on_hit=Effect("minecraft:levitation", 1.5), glow_eyes=True,
                 drops=[Drop("sakura_fox_tuft", 0, 1, chance=0.35)],
                 sounds="fox", pitch=1.05, xp=6, group=2,
                 description="White as mist, with glowing markings like brush strokes. Do not make it angry."),
        Creature("koi", "Koi", "swimmer", ["#fff8f0", "#f06a20", "#1a1a1a", "#101010", "#ffd040"],
                 pattern="patches", size=0.7,
                 body={"kind": "koi", "body_len": 12, "fins": True},
                 behavior="passive", health=6, speed=0.5, category="water_ambient",
                 drops=[Drop("minecraft:salmon", 0, 1, cooked="minecraft:cooked_salmon")],
                 sounds="tropical_fish", pitch=1.0, xp=1, group=5,
                 description="Ancient, patient, and very spoiled. It expects you to bring bread."),
        Creature("paper_lantern", "Paper Lantern", "floater", ["#d8341e", "#ffd080", "#f0c040", "#2a1008", "#1a1214"],
                 pattern="stripes", size=0.9,
                 body={"kind": "lantern", "tentacles": 1, "tentacle_len": 6, "body_w": 9, "body_h": 11, "body_d": 9,
                       "eye_style": "sleepy", "mouth": "smile", "blush": True},
                 behavior="passive", health=8, speed=0.08, emissive=True, abilities=["glow_aura"],
                 drops=[Drop("sakura_mochi", 0, 1, chance=0.6), Drop("sakura_lantern_ember", 0, 1, chance=0.5)],
                 sounds="allay", pitch=0.8, xp=2, group=3, tracking=10,
                 description="A festival lantern that wandered off on its own. Its glow lets you see in the dark."),
    ],
    biomes=[
        Biome("sakura_blossom_terraces", "Blossom Terraces", top="sakura_grass", under="sakura_soil",
              temperature=0.0, humidity=0.0, elevation=0.2, grass_color="#6cb250", foliage_color="#f6a8c2",
              water_color="#5ab8b0", water_fog_color="#2a7a80",
              particles=[("minecraft:cherry_leaves", 0.012)], ambient="cozy_breeze",
              music="minecraft:music.overworld.cherry_grove",
              features=[
                  GREAT_SAKURA, CHERRY,
                  PETAL_CARPET,
                  STONE_LANTERN,
                  Patch(blocks=[("minecraft:short_grass", 5), ("minecraft:pink_petals", 2), ("minecraft:azure_bluet", 1)],
                        count=4, tries=32),
                  SPIRIT_GATE,
              ],
              spawns=[Spawn("spirit_fox", 6, (1, 2)), Spawn("paper_lantern", 6, (1, 3))]),
        Biome("sakura_bamboo_grove", "Whispering Bamboo", top="sakura_grass", under="sakura_soil",
              temperature=0.8, humidity=0.6, elevation=0.0, grass_color="#5a9e44", foliage_color="#82c460",
              water_color="#4aa890", water_fog_color="#245a50", fog_color="#d8ecd8", fog_end=110,
              particles=[("minecraft:cherry_leaves", 0.002), ("dust:#c8f0a0:0.6", 0.002)], ambient="wind_howl",
              music="minecraft:music.overworld.bamboo_jungle",
              features=[
                  Vanilla(id="minecraft:bamboo"),
                  Vanilla(id="minecraft:bamboo_light"),
                  Patch(blocks=[("minecraft:fern", 3), ("minecraft:large_fern", 1), ("minecraft:short_grass", 3)],
                        count=4, tries=32),
                  STONE_LANTERN,
                  Tree(log="sakura_log", leaves="sakura_blossom_leaves", shape="cherry", height=(5, 7), count=1, chance=3),
              ],
              spawns=[Spawn("spirit_fox", 8, (1, 2)), Spawn("paper_lantern", 3, (1, 2))]),
        Biome("sakura_koi_gardens", "Koi Gardens", top="sakura_grass", under="sakura_soil", underwater="minecraft:gravel",
              temperature=-0.4, humidity=0.7, elevation=-0.6, grass_color="#62ac4c", foliage_color="#f6a8c2",
              water_color="#3ec0b4", water_fog_color="#1e7a78",
              particles=[("minecraft:cherry_leaves", 0.006), ("minecraft:firefly", 0.001)], ambient="bubbling",
              music="minecraft:music.overworld.cherry_grove",
              features=[
                  Lake(fluid="minecraft:water", border="sakura_mossy_slate", count=1, chance=2),
                  POND_PETALS,
                  Patch(blocks=[("minecraft:lily_pad", 2), ("sakura_floating_petals", 3)], where="water_surface", count=3,
                        tries=24, max_depth=3),
                  Patch(block="sakura_iris", count=3, tries=24),
                  SPIRIT_GATE,
                  CHERRY,
                  STONE_LANTERN,
                  Boulder(blocks=[("sakura_mossy_slate", 3), ("sakura_slate", 1)], radius=(1, 2), squash=0.7, count=1),
              ],
              spawns=[Spawn("koi", 16, (3, 6)), Spawn("paper_lantern", 6, (2, 3)), Spawn("spirit_fox", 3, (1, 1))]),
        Biome("sakura_moonblossom_heights", "Moonblossom Heights", top="sakura_grass", under="sakura_soil",
              temperature=-0.6, humidity=-0.6, elevation=0.8, grass_color="#7ab866", foliage_color="#fff8fc",
              water_color="#5ab8b0", water_fog_color="#2a7a80", fog_color="#f4eef4", sky_color="#b8d4f0",
              particles=[("minecraft:cherry_leaves", 0.006), ("minecraft:end_rod", 0.0006)], ambient="crystal_chimes",
              music="minecraft:music.overworld.grove",
              features=[
                  GiantPlant(stem="sakura_log", head="sakura_moonblossom_leaves", shape="puff", height=(12, 17),
                             radius=(5, 7), stem_width=2, bend=0.5, decoration="sakura_blossom_leaves", count=1, chance=2),
                  Tree(log="sakura_log", leaves="sakura_moonblossom_leaves", shape="cherry", height=(5, 8), count=2),
                  Structure(kind="arch", blocks={"main": "sakura_vermilion_wood"}, size=(6, 9),
                            params={"height": 1.6, "thickness": 0.9}, count=1, chance=4),
                  STONE_LANTERN,
                  PETAL_CARPET,
              ],
              spawns=[Spawn("paper_lantern", 8, (2, 3)), Spawn("spirit_fox", 6, (1, 2))]),
    ],
    effects=[],
    ambient="cozy_breeze",
    music="minecraft:music.overworld.cherry_grove",
    icon="portalgun:sakura_mochi",
)
