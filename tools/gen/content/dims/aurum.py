"""Au-79 Aurum - a world made of gold: gilded mountains, gold-leaf forests, gem flowers and the greed that guards them."""
import numpy as np
from PIL import Image

import gen.textures as T
from gen.content.dsl import *
from gen.noise import fbm, rng

# ------------------------------------------------------------------------------------------------ palette
# bright gold / deep amber / ivory / ruby / sapphire  (+ tarnish brown for the wastes)
P_GRASS = ["#8a6414", "#a87c1c", "#c49626", "#dcb038", "#f0cc58"]
P_SOIL = ["#4a3214", "#5e401a", "#725020", "#88622a"]
P_STONE = ["#5a4626", "#6c5630", "#80683a", "#957c48", "#ab9258"]
P_VEIN = ["#c08a18", "#f0c030", "#ffe070", "#fff6c8"]
P_GILT = ["#9a6a10", "#c48e1a", "#e8b42a", "#ffd850", "#fff2b0"]
P_SAND = ["#b88a2a", "#cc9e36", "#dcb24a", "#ecc862"]
P_BARK = ["#b88a4a", "#cca060", "#dcb878", "#ecd09a"]
P_RINGS = ["#e8b42a", "#c48e1a"]
P_LEAF = ["#a06c0c", "#cc9418", "#f0bc2a", "#ffdc5a", "#fff4b8"]
P_RUBY = ["#6a0a24", "#a8163a", "#e02c58", "#ff7a98", "#ffd0dc"]
P_SAPPHIRE = ["#0c1e6a", "#1a3aa8", "#2e66e0", "#78a8ff", "#d0e4ff"]
P_STEM = ["#6a5a18", "#8a7a28", "#aa9a3a"]
P_CRYSTAL = ["#a87010", "#e8b42a", "#ffe070", "#fff8d8"]
GOLD = "#f0c030"


def _hex(c):
    c = c.lstrip("#")
    return np.array([int(c[i:i + 2], 16) for i in (0, 2, 4)], float)


def gilded_veins(base, vein_pal, seed, width=0.11):
    """Stone shot through with thin, flowing gold veins (a noise-warped diagonal seam) and a few nugget flecks."""
    a = np.asarray(base.convert("RGBA"), float).copy()
    yy, xx = np.mgrid[0:16, 0:16]
    n = fbm(16, 16, 8, seed + ":v1", 2)
    cols = [_hex(c) for c in vein_pal]
    # one tileable seam running diagonally across the block (period 16 in x and y), warped by the noise
    u = np.sin((xx + yy) * 2 * np.pi / 16 + (n - 0.5) * 5.0)
    d = np.abs(u)
    vein = d <= np.percentile(d, width * 100)
    lit = ((xx * 3 + yy) % 5) == 0
    a[vein, :3] = cols[1]
    a[vein & lit, :3] = cols[2]
    # dark rim under each vein pixel so it reads as inlaid
    below = np.roll(vein, 1, axis=0) & ~vein
    a[below, :3] = a[below, :3] * 0.72
    R = rng(seed + ":fleck")
    for _ in range(3):
        x, y = int(R.integers(0, 16)), int(R.integers(0, 16))
        a[y, x, :3] = cols[3]
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "RGBA")


def gold_leaf(pal, seed):
    """Hammered gold-leaf crust: irregular overlapping leaf flakes with bright creased edges and sparkle points."""
    cols = np.array([_hex(c) for c in pal])
    R = rng(seed)
    out = np.zeros((16, 16, 3))
    idx = np.full((16, 16), 2.0)
    yy, xx = np.mgrid[0:16, 0:16]
    for _ in range(9):
        cx, cy = R.uniform(0, 16), R.uniform(0, 16)
        rw, rh = R.uniform(3, 6), R.uniform(2.5, 5)
        dx = np.minimum(np.abs(xx - cx), 16 - np.abs(xx - cx))
        dy = np.minimum(np.abs(yy - cy), 16 - np.abs(yy - cy))
        d = (dx / rw) ** 2 + (dy / rh) ** 2
        shade = R.choice([1.6, 2.2, 2.8, 3.2])
        idx = np.where(d < 1.0, shade + (1 - d) * 0.6, idx)
        edge = (d > 0.78) & (d < 1.0)
        idx = np.where(edge, 3.9, idx)
    n = fbm(16, 16, 4, seed + ":n", 2)
    idx = np.clip(idx + (n - 0.5) * 0.8, 0, 4.0)
    i = np.clip(np.round(idx).astype(int), 0, 4)
    out = cols[i]
    for _ in range(4):
        x, y = int(R.integers(0, 16)), int(R.integers(0, 16))
        out[y, x] = np.minimum(cols[4] * 1.05 + 10, 255)
    a = np.concatenate([out, np.full((16, 16, 1), 255.0)], -1)
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "RGBA")


def coin_drift(pal, seed, coins=18):
    """Heaps of gold coins lying flat on a bed of gold dust."""
    cols = [_hex(c) for c in pal]
    R = rng(seed)
    out = np.zeros((16, 16, 4))
    yy, xx = np.mgrid[0:16, 0:16]
    # opaque bed of gold dust under the coins (a cutout carpet would cull the top face of the block below it)
    n = fbm(16, 16, 4, seed + ":dust", 2)
    out[..., :3] = cols[0][None, None, :] * (0.75 + 0.35 * n[..., None])
    out[..., 3] = 255
    for _ in range(coins):
        cx, cy = R.uniform(1.5, 14.5), R.uniform(1.5, 14.5)
        r = R.uniform(1.2, 1.9)
        d = np.hypot(xx + 0.5 - cx, yy + 0.5 - cy)
        m = d < r
        out[m, :3] = cols[2]
        out[m & (d > r - 0.8), :3] = cols[1]                       # milled rim
        hi = m & ((xx + 0.5 - cx) + (yy + 0.5 - cy) < -r * 0.5)
        out[hi, :3] = cols[3]
        out[m, 3] = 255
        cxi, cyi = int(cx), int(cy)
        if 0 <= cxi < 16 and 0 <= cyi < 16:
            out[cyi, cxi, :3] = cols[1]                            # stamped face
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGBA")


def gem_flower(stem_pal, gem_pal, seed, facets=4):
    """A cut gemstone blooming on a gold wire stem, with two leaf-shaped gold petals."""
    out = np.zeros((16, 16, 4))
    cols = [_hex(c) for c in gem_pal]
    sc = [_hex(c) for c in stem_pal]
    R = rng(seed)
    x0 = 7 + int(R.integers(0, 2))
    for y in range(7, 16):
        out[y, x0, :3] = sc[1]
        out[y, x0, 3] = 255
    for (dx, y) in ((-1, 12), (-2, 11), (-3, 11), (1, 10), (2, 9), (3, 9)):
        out[y, x0 + dx, :3] = sc[2] if abs(dx) < 3 else sc[0]
        out[y, x0 + dx, 3] = 255
    # brilliant cut gem: crown (top trapezoid) + pavilion (bottom triangle)
    cy = 5
    rows = [(-3, 2), (-2, 3), (-1, 4), (0, 4), (1, 3), (2, 2), (3, 1), (4, 0)]
    for dy, hw in rows:
        y = cy + dy
        for dx in range(-hw, hw + 1):
            x = x0 + dx
            if not (0 <= x < 16 and 0 <= y < 16):
                continue
            if dy < 0:
                k = 3 if dx < 0 else (2 if dx == 0 else 1)
                if dy == -3:
                    k = 4 if dx <= 0 else 3
            else:
                k = 2 if dx < 0 else 1
                if dx == -1 and dy == 0:
                    k = 4
            if abs(dx) == hw:
                k = max(0, k - 1)
            out[y, x, :3] = cols[k]
            out[y, x, 3] = 255
    out[cy - 2, x0 - 1, :3] = cols[4]
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGBA")


# ------------------------------------------------------------------------------------------------ features
GOLDEN_GIANT = GiantPlant(stem="aurum_goldwood_log", head="aurum_gold_leaves", shape="puff", height=(16, 24), radius=(6, 8),
                          stem_width=2, bend=0.15, count=1, chance=5)
RING_OF_GREED = Structure(kind="ring", blocks={"main": "aurum_gilt", "alt": "aurum_gilded_stone"}, size=(8, 12),
                          params={"thickness": 0.17, "sink": 0.18}, count=1, chance=4)
GOLD_SPRAY = CrystalCluster(block="aurum_gilt", small="aurum_gold_crystal", size=(5, 10), count=1, chance=3)
HOARD = Boulder(blocks=[("aurum_gilt", 10), ("minecraft:raw_gold_block", 1), ("minecraft:gold_block", 1)], radius=(2, 3),
                squash=0.55, count=1, chance=7)
COINS = Patch(block="aurum_coin_drift", count=2, tries=24, spread=5)
GEM_FLOWERS = Patch(blocks=[("aurum_ruby_bloom", 3), ("aurum_sapphire_bloom", 2)], count=3, tries=24, spread=6)
SMALL_CRYSTALS = Patch(block="aurum_gold_crystal", count=2, tries=16, spread=5)

DIMENSION = Dimension(
    id="aurum",
    code="Au-79",
    name="Aurum",
    tagline="Everything here is gold. Everything.",
    description=("A world of gilded mountains under a honey-colored sky: the stone is veined with gold, the trees "
                 "wear gold leaf and the meadows bloom with rubies and sapphires. Giant golden rings stand on the "
                 "peaks and coins drift in the valleys like fallen leaves. Mind the Midas Golems that guard the "
                 "summits - and never open a treasure chest you did not place yourself."),
    danger=4,
    color=GOLD,
    terrain=Terrain(style="mountains", stone="aurum_gilded_stone", sea_level=62, height=80, amplitude=50, scale=1.05,
                    roughness=0.28, deepslate="minecraft:blackstone",
                    params={"coverage": 0.55, "peaks": 0.7, "rivers": 0.22, "peak_block": "aurum_gilt", "peak_y": 124,
                            "beach_block": "aurum_gold_sand", "beach_height": 2, "cliff_block": "aurum_gilded_stone",
                            "ceiling_block": "aurum_gilded_stone", "biome_size": 300}),
    sky=Sky(sky_color="#6a4aa0", fog_color="#e8b88a", water_fog_color="#6a4a10", fog_start=70, fog_end=320,
            cloud_color="#ccffd890", cloud_height=210, time=10800, sunrise_color="#ccffb040", sky_light_color="#ffe2a0",
            ambient_light=0.06,
            bodies=[Celestial("ringed_planet", ["#9a6a10", "#f0c030", "#fff2b0"], size=84, yaw=150, pitch=38, roll=-12,
                              seed="aurum-ringworld"),
                    Celestial("moon", ["#f4e0b0", "#fff6dc"], size=22, yaw=200, pitch=62, alpha=0.75, seed="aurum-pale-moon")]),
    blocks=[
        Block("aurum_gilded_grass", "Gilded Grass", "grass", {
            "top": tex("grass_top", P_GRASS, seed="aurum-grass"),
            "side": tex("grass_side", P_GRASS, P_SOIL, seed="aurum-grass"),
            "bottom": tex("dirt", P_SOIL, seed="aurum-soil")}, hardness=0.6, sound="grass", map_color="gold"),
        Block("aurum_ochre_soil", "Ochre Soil", "soil", {"all": tex("dirt", P_SOIL, seed="aurum-soil")}, hardness=0.5,
              sound="rooted_dirt", map_color="color_brown"),
        Block("aurum_gilded_stone", "Gilded Stone", "stone", {
            "all": tex(gilded_veins, tex("stone", P_STONE, seed="aurum-stone"), P_VEIN, "aurum-stone")},
              hardness=1.8, resistance=7, map_color="terracotta_yellow"),
        Block("aurum_gilt", "Gold Leaf Crust", "solid", {"all": tex(gold_leaf, P_GILT, "aurum-gilt")}, hardness=1.5,
              sound="metal", tool="pickaxe", map_color="gold"),
        Block("aurum_gold_sand", "Gold Sand", "sand", {"all": tex("sand", P_SAND, seed="aurum-sand")}, hardness=0.5,
              sound="sand", map_color="gold"),
        Block("aurum_goldwood_log", "Goldwood Log", "log", {
            "side": tex("log_side", P_BARK, seed="aurum-bark"),
            "end": tex("log_top", P_BARK, P_RINGS, seed="aurum-bark-end")}, hardness=2.0, sound="wood",
              map_color="sand", flammable=True),
        Block("aurum_gold_leaves", "Gold Leaves", "leaves", {"all": tex("leaves", P_LEAF, seed="aurum-leaf", holes=0.2)},
              hardness=0.2, sound="cherry_leaves", map_color="gold", drop="aurum_midas_fig", drop_count=(0, 1),
              particle="minecraft:wax_on"),
        Block("aurum_ruby_bloom", "Ruby Bloom", "plant", {"cross": tex(gem_flower, P_STEM + ["#e8c050"], P_RUBY, "aurum-ruby")},
              hardness=0.0, sound="amethyst_cluster", light=4, map_color="color_red"),
        Block("aurum_sapphire_bloom", "Sapphire Bloom", "plant", {
            "cross": tex(gem_flower, P_STEM + ["#e8c050"], P_SAPPHIRE, "aurum-sapphire")}, hardness=0.0,
              sound="amethyst_cluster", light=4, map_color="color_blue"),
        Block("aurum_gem_ore", "Greedstone Ore", "ore", {
            "all": tex("ore", tex(gilded_veins, tex("stone", P_STONE, seed="aurum-stone"), P_VEIN, "aurum-stone"),
                       P_RUBY[1:], seed="aurum-gem-ore")}, hardness=3.0, drop="aurum_greed_gem", drop_count=(1, 1),
              xp=(3, 7), map_color="terracotta_yellow"),
        Block("aurum_gold_crystal", "Gold Crystal", "crystal_cluster", {
            "cross": tex("crystal_shard_sprite", P_CRYSTAL, seed="aurum-crystal")}, hardness=1.0, sound="amethyst_cluster",
              light=9, emissive=True, map_color="gold"),
        Block("aurum_coin_drift", "Coin Drift", "carpet", {"all": tex(coin_drift, P_GILT, "aurum-coins")}, hardness=0.1,
              sound="chain", map_color="gold", drop="minecraft:gold_nugget", drop_count=(0, 1)),
    ],
    items=[
        Item("aurum_greed_gem", "Greed Gem", tex("item_icon", "gem", P_RUBY, seed="aurum-greed", accent="#ffd850"),
             rarity="rare", glint=True, lore="Everybody wants one. That is the whole problem."),
        Item("aurum_midas_fig", "Midas Fig", tex("item_icon", "fruit", P_GILT, seed="aurum-fig", accent="#6a8a20"),
             kind="food", food=Food(4, 0.9, effects=[Effect("minecraft:absorption", 40, 1),
                                                     Effect("minecraft:slowness", 6, 0)]),
             lore="Heavy as a coin purse. Sweet as getting away with it."),
        Item("aurum_midas_heart", "Midas Heart", tex("item_icon", "core", P_GILT, seed="aurum-heart", accent="#e02c58"),
             rarity="epic", glint=True, stack=16, lore="Still warm. Still counting."),
    ],
    creatures=[
        Creature("midas_golem", "Midas Golem", "golem", ["#d8a020", "#7a5010", "#fff0a0", "#ff3050", "#ffd850"],
                 pattern="veins", size=1.45,
                 body={"shoulders": True, "crystals": 5, "core": True, "horns": "small", "head_size": 0.85,
                       "eye_style": "glow", "brows": True, "mouth": "frown", "arm_w": 5, "torso_w": 15},
                 behavior="neutral", health=110, damage=12, speed=0.22, armor=12, abilities=["shield", "regen"],
                 on_hit=Effect("minecraft:slowness", 5, 2),
                 drops=[Drop("minecraft:gold_ingot", 2, 6), Drop("aurum_midas_heart", 0, 1, chance=0.35),
                        Drop("aurum_greed_gem", 0, 2)],
                 sounds="iron_golem", pitch=0.7, xp=24, group=1,
                 description="It was a treasure hunter once. Touch its gold and you will slow down too."),
        Creature("treasure_mimic", "Treasure Mimic", "blob", ["#e8b42a", "#6a3e18", "#ffe080", "#ff2a3a", "#4a2a10"],
                 pattern="gradient", size=1.0,
                 body={"shape": "box", "blob_size": 12, "eye_style": "angry", "eyes": 2, "mouth": "fangs"},
                 behavior="hostile", health=34, damage=7, speed=0.3, armor=4, abilities=["leap"],
                 movement="hopping", on_hit=Effect("minecraft:hunger", 8, 1),
                 drops=[Drop("minecraft:gold_nugget", 3, 9), Drop("aurum_greed_gem", 0, 1, chance=0.4),
                        Drop("minecraft:emerald", 0, 2)],
                 sounds="ravager", pitch=1.6, xp=10, group=1,
                 description="Gold trim, iron lock, and a tongue. The tongue is the giveaway."),
        Creature("goldbug", "Goldbug", "crawler", ["#1e5a3a", "#f0c030", "#fff4b0", "#101010", "#7ad8a0"],
                 pattern="speckle", size=0.55,
                 body={"kind": "beetle", "shell": True, "antennae": 3, "legs": 3, "leg_len": 4, "eye_style": "cute"},
                 behavior="passive", health=6, speed=0.2, tempt="portalgun:aurum_ruby_bloom",
                 drops=[Drop("minecraft:gold_nugget", 1, 3)],
                 sounds="silverfish", pitch=1.8, xp=2, group=4,
                 description="Eats gold dust, sneezes gold flakes. Nobody has ever caught one without falling over."),
    ],
    biomes=[
        Biome("aurum_gilded_vale", "Gilded Vale", top="aurum_gilded_grass", under="aurum_ochre_soil",
              temperature=0.2, humidity=0.4, elevation=-0.15, underwater="aurum_gold_sand",
              grass_color="#c49626", foliage_color="#f0bc2a", water_color="#e8b42a", water_fog_color="#6a4a10",
              particles=[("dust:#ffd850:0.7", 0.004), ("minecraft:wax_on", 0.0015)], ambient="crystal_chimes",
              music="minecraft:music.overworld.meadow",
              features=[
                  GOLDEN_GIANT,
                  Tree(log="aurum_goldwood_log", leaves="aurum_gold_leaves", shape="fancy", height=(8, 12), count=1, chance=2),
                  Tree(log="aurum_goldwood_log", leaves="aurum_gold_leaves", shape="birch", height=(5, 8), count=1, chance=2),
                  GEM_FLOWERS,
                  COINS,
                  Patch(blocks=[("minecraft:short_grass", 4), ("minecraft:fern", 1)], count=3, tries=24),
              ],
              spawns=[Spawn("goldbug", 14, (2, 4)), Spawn("midas_golem", 1, (1, 1)), Spawn("treasure_mimic", 1, (1, 1))]),
        Biome("aurum_gem_meadows", "Gem Meadows", top="aurum_gilded_grass", under="aurum_ochre_soil",
              temperature=-0.55, humidity=-0.1, elevation=-0.35, underwater="aurum_gold_sand",
              grass_color="#dcb038", foliage_color="#ffdc5a", water_color="#f0c030", water_fog_color="#7a5a14",
              particles=[("dust:#ff7a98:0.6", 0.002), ("dust:#78a8ff:0.6", 0.002), ("dust:#ffd850:0.6", 0.003)],
              ambient="crystal_chimes", music="minecraft:music.overworld.flower_forest",
              features=[
                  Patch(blocks=[("aurum_ruby_bloom", 3), ("aurum_sapphire_bloom", 3)], count=7, tries=48, spread=8),
                  SMALL_CRYSTALS,
                  COINS,
                  Tree(log="aurum_goldwood_log", leaves="aurum_gold_leaves", shape="oak", height=(4, 6), count=1, chance=5),
                  Boulder(blocks=[("aurum_gilded_stone", 4), ("aurum_gilt", 1)], radius=(1, 2), count=1, chance=3),
              ],
              spawns=[Spawn("goldbug", 18, (3, 5)), Spawn("treasure_mimic", 1, (1, 1))]),
        Biome("aurum_hoard_peaks", "Hoard Peaks", top="aurum_gilded_stone", under="aurum_gilded_stone",
              temperature=0.0, humidity=0.0, elevation=0.75,
              grass_color="#dcb038", foliage_color="#f0bc2a", water_color="#e8b42a", water_fog_color="#6a4a10",
              fog_color="#f0c8a0", particles=[("minecraft:wax_on", 0.004), ("dust:#fff2b0:0.9", 0.003)],
              ambient="wind_howl", music="minecraft:music.overworld.jagged_peaks",
              surface_noise=[("aurum_gilt", 0.35)],
              features=[
                  RING_OF_GREED,
                  GOLD_SPRAY,
                  HOARD,
                  Patch(block="aurum_coin_drift", count=3, tries=32, spread=6),
                  SMALL_CRYSTALS,
                  Ore(block="aurum_gem_ore", size=5, count=4, y=(60, 200)),
              ],
              spawns=[Spawn("treasure_mimic", 6, (1, 1)), Spawn("midas_golem", 3, (1, 1)), Spawn("goldbug", 4, (1, 2))]),
        Biome("aurum_tarnished_wastes", "Tarnished Wastes", top="aurum_ochre_soil", under="aurum_ochre_soil",
              temperature=0.85, humidity=-0.7, elevation=0.1, underwater="aurum_gold_sand",
              grass_color="#8a6414", foliage_color="#a06c0c", water_color="#9a7a3a", water_fog_color="#3a2a10",
              sky_color="#c8925a", fog_color="#b88a50", fog_end=150,
              particles=[("minecraft:ash", 0.006), ("dust:#c08a18:0.8", 0.002)], ambient="eerie_choir",
              music="minecraft:music.overworld.badlands",
              surface_noise=[("aurum_gold_sand", 0.3), ("aurum_gilded_grass", 0.62)],
              features=[
                  Spire(blocks=[("aurum_gilded_stone", 4), ("aurum_ochre_soil", 1)], cap="aurum_gilt", height=(6, 14),
                        radius=(1, 3), lean=0.15, count=1),
                  Tree(log="aurum_goldwood_log", leaves="aurum_gold_leaves", shape="twisted", height=(5, 8), count=1, chance=3),
                  Patch(block="minecraft:dead_bush", count=3, tries=16),
                  Patch(block="aurum_coin_drift", count=1, tries=16),
                  HOARD,
              ],
              spawns=[Spawn("midas_golem", 4, (1, 1)), Spawn("treasure_mimic", 4, (1, 1)), Spawn("goldbug", 8, (1, 3))]),
    ],
    effects=[],
    ambient="crystal_chimes",
    music="minecraft:music.overworld.meadow",
    icon="portalgun:aurum_greed_gem",
)
