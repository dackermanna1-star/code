"""B-77 Lumina - a bioluminescent jungle under an eternal night sky."""
import math

import numpy as np
from PIL import Image

from gen.content.dsl import *
from gen.noise import fbm, rng

# ------------------------------------------------------------------------------------------------ palette
# deep teal/indigo darkness lit by three glow colours: cyan, magenta and lime
P_MOSS = ["#081f24", "#0c2c30", "#113c3c", "#175046", "#1f6652"]
P_SOIL = ["#140f1e", "#1c1528", "#251c34", "#302440"]
P_ROCK = ["#10162a", "#161e36", "#1e2844", "#283454", "#334066"]
P_BARK = ["#120f1a", "#1b1624", "#251e30", "#30283c", "#3b3248"]
P_LEAF = ["#06201c", "#0a2c26", "#103c32", "#164c3e", "#1e5e4a"]
P_GLOWLEAF = ["#4a1260", "#7a1f8c", "#b02cb4", "#e04ad0", "#ff8ae6"]
P_PETAL = ["#5a1070", "#9a20a8", "#d83cc8", "#ff6ad8", "#ffc0f2"]
P_CYAN = ["#0a5a62", "#109a9a", "#2ad8cc", "#6ff8ea", "#d0fff8"]
P_LIME = ["#2a5a10", "#5a9a1a", "#9ae03a", "#c8ff6a", "#f0ffc0"]
GLOW_CYAN = "#5ff5e6"
GLOW_MAGENTA = "#ff5fd2"
GLOW_LIME = "#b6ff5a"


# ------------------------------------------------------------------------------------------------ custom textures
def _hex(c):
    c = c.lstrip("#")
    return np.array([int(c[i:i + 2], 16) for i in (0, 2, 4)], float)


def _arr(img):
    return np.asarray(img.convert("RGBA"), float).copy()


def _img(a):
    return Image.fromarray(np.clip(np.round(a), 0, 255).astype(np.uint8), "RGBA")


def glints(base, colors, seed, density=0.035):
    """Sprinkle single bright bioluminescent pixels (with a dim halo pixel) over an opaque texture."""
    a = _arr(base)
    R = rng(seed + ":glint")
    cols = [_hex(c) for c in colors]
    for y in range(16):
        for x in range(16):
            if a[y, x, 3] > 0 and R.random() < density:
                c = cols[int(R.integers(0, len(cols)))]
                a[y, x, :3] = c
                nx, ny = (x + 1) % 16, y
                if a[ny, nx, 3] > 0:
                    a[ny, nx, :3] = a[ny, nx, :3] * 0.5 + c * 0.35
    return _img(a)


def vein_bark(base, glow_hex, seed, veins=2):
    """Dark bark with thin wandering glowing sap veins running up the trunk."""
    a = _arr(base)
    g = _hex(glow_hex)
    R = rng(seed + ":vein")
    for v in range(veins):
        x = float(R.integers(1, 15))
        for y in range(16):
            xi = int(round(x)) % 16
            a[y, xi, :3] = g
            # soft halo
            for dx in (-1, 1):
                xx = (xi + dx) % 16
                a[y, xx, :3] = a[y, xx, :3] * 0.6 + g * 0.25
            x += R.choice([-1, 0, 0, 1]) * 0.6
    return _img(a)


def glow_vines(pal, seed):
    """Hanging strands of glowing vine with bright beads, on a transparent face."""
    out = np.zeros((16, 16, 4), float)
    cols = [_hex(c) for c in pal]
    R = rng(seed)
    for k in range(5):
        x = 1.5 + k * 3.0 + R.uniform(-0.8, 0.8)
        length = int(R.integers(8, 16))
        for y in range(length):
            xi = int(round(x + 0.7 * math.sin(y * 0.6 + k))) % 16
            shade = cols[1 + (y + k) % 2]
            out[y, xi, :3] = shade
            out[y, xi, 3] = 255
            if R.random() < 0.22:
                out[y, xi, :3] = cols[-1]
        # bright bead at the end
        yi = min(15, length)
        xi = int(round(x + 0.7 * math.sin(yi * 0.6 + k))) % 16
        out[min(15, yi), xi, :3] = cols[-1]
        out[min(15, yi), xi, 3] = 255
    return _img(out)


def lumen_crystal(pal, seed):
    """Faceted glowing crystal block: bright cores, dark facet lines."""
    from gen import textures as T
    base = _arr(T.crystal(pal, seed))
    n = fbm(16, 16, 4, seed + ":p", 2)
    base[..., :3] = np.clip(base[..., :3] * (0.9 + 0.3 * n[..., None]), 0, 255)
    return _img(base)


# ------------------------------------------------------------------------------------------------ features
MOONBLOOM = GiantPlant(stem="lumina_bloom_stem", head="lumina_bloom_petal", shape="flower", height=(9, 16), radius=(4, 6),
                       decoration="lumina_lumen_crystal", stem_width=1, bend=0.35, count=1)
LANTERN_TREE = Tree(log="lumina_log", leaves="lumina_leaves", shape="mega_jungle", height=(16, 26),
                    decoration="lumina_bulb", count=1)
JUNGLE_TREE = Tree(log="lumina_log", leaves="lumina_leaves", shape="jungle", height=(6, 11), decoration="lumina_glowvine",
                   count=3)
GLOW_BUSH = Tree(log="lumina_log", leaves="lumina_glowleaf", shape="bush", height=(1, 2), count=2)

DIMENSION = Dimension(
    id="lumina",
    code="B-77",
    name="Lumina",
    tagline="A jungle that glows in an endless night",
    description=("A jungle where the sun never rose and every living thing learned to make its own light: cyan sap "
                 "veins, lantern bulbs and magenta Moonblooms taller than houses. Glow Frogs sing in luminous "
                 "lagoons and Lantern Bugs drift like slow sparks. Keep to the light - the Lumi Panther hunts where "
                 "the glow runs out, and you will only see its eyes."),
    danger=3,
    color="#5ff5e6",
    terrain=Terrain(style="hills", stone="lumina_stone", sea_level=60, height=77, amplitude=22, scale=1.0,
                    roughness=0.3, deepslate="minecraft:deepslate",
                    params={"rivers": 0.65, "detail": 0.45, "biome_size": 260, "beach_block": "lumina_soil",
                            "beach_height": 1}),
    sky=Sky(sky_color="#050a1c", fog_color="#0a1828", water_fog_color="#063a40", fog_start=18, fog_end=120,
            cloud_color="#55402a7a", cloud_height=210, time="midnight", star_brightness=1.0, ambient_light=0.1,
            moon_phase="full_moon",
            bodies=[Celestial("nebula", ["#0a2a5a", "#1fa8b0", "#5ff5e6", "#ff5fd2"], size=170, yaw=200, pitch=50,
                              roll=20, alpha=0.6, additive=True, seed="lumina-nebula"),
                    Celestial("planet", ["#1a4a20", "#4aa83a", "#b6ff5a", "#f0ffc0"], size=34, yaw=60, pitch=38,
                              roll=-10, seed="lumina-glowmoon"),
                    Celestial("moon", ["#3a2a5a", "#8a6ac0", "#e8d0ff"], size=14, yaw=95, pitch=55, seed="lumina-moonlet")]),
    blocks=[
        Block("lumina_moss", "Glowmoss", "grass", {
            "top": tex(glints, tex("grass_top", P_MOSS, seed="lumina-moss"), [GLOW_CYAN, "#9ffff4", GLOW_LIME], "lumina-moss"),
            "side": tex("grass_side", P_MOSS, P_SOIL, seed="lumina-moss"),
            "bottom": tex("dirt", P_SOIL, seed="lumina-soil")}, hardness=0.6, sound="moss", map_color="color_cyan"),
        Block("lumina_soil", "Nightloam", "soil", {"all": tex("dirt", P_SOIL, seed="lumina-soil")}, hardness=0.5,
              sound="rooted_dirt", map_color="color_purple"),
        Block("lumina_stone", "Duskstone", "stone", {"all": tex(glints, tex("stone", P_ROCK, seed="lumina-rock"),
                                                                 ["#3e8ab0", "#4a5aa0"], "lumina-rock", 0.02)},
              hardness=1.5, map_color="color_blue"),
        Block("lumina_log", "Glowvein Log", "log", {
            "side": tex(vein_bark, tex("log_side", P_BARK, seed="lumina-bark"), GLOW_CYAN, "lumina-bark"),
            "end": tex("log_top", P_BARK, ["#2a2236", "#1e1828", GLOW_CYAN], seed="lumina-bark-top")},
              hardness=2.0, sound="wood", light=3, map_color="color_black", flammable=True),
        Block("lumina_leaves", "Nightleaf", "leaves", {"all": tex(glints, tex("leaves", P_LEAF, seed="lumina-leaf"),
                                                                    [GLOW_CYAN, GLOW_LIME], "lumina-leaf", 0.02)},
              hardness=0.2, sound="azalea_leaves", map_color="color_green", flammable=True),
        Block("lumina_glowleaf", "Glowleaf", "leaves", {"all": tex("leaves", P_GLOWLEAF, seed="lumina-glowleaf", holes=0.18)},
              hardness=0.2, sound="azalea_leaves", light=10, emissive=True, map_color="color_magenta", flammable=True),
        Block("lumina_glowvine", "Glowvine", "hanging_plant", {"cross": tex(glow_vines, P_CYAN, "lumina-vine")},
              hardness=0.0, sound="cave_vines", light=8, emissive=True, map_color="color_cyan"),
        Block("lumina_bulb", "Lantern Bulb", "hanging_plant", {"cross": tex("bulb", P_BARK, ["#ff9a2a", "#ffc040", "#ffe680", "#fffbe0"],
                                                                            seed="lumina-bulb")},
              hardness=0.0, sound="shroomlight", light=14, emissive=True, fruit="lumina_lumen_fruit", drop_count=(1, 2),
              map_color="color_orange"),
        Block("lumina_lantern_flower", "Lanternbell", "tall_plant", {
            "bottom": tex("tall_plant_bottom", ["#0c3a30", "#145040", "#1e6a52", "#2a8a66"], seed="lumina-bell"),
            "top": tex("flower", ["#0c3a30", "#145040", "#1e6a52", "#2a8a66"], P_CYAN, seed="lumina-bell-top", shape="bell",
                       center_hex="#e0fff8")}, hardness=0.0, sound="grass", light=9, emissive=True, map_color="color_cyan"),
        Block("lumina_bloom_stem", "Moonbloom Stalk", "log", {
            "side": tex(vein_bark, tex("log_side", ["#0c2a20", "#123a2c", "#1a4c38", "#226044"], seed="lumina-stalk"),
                        GLOW_LIME, "lumina-stalk", 3),
            "end": tex("log_top", ["#0c2a20", "#1a4c38", "#226044"], ["#2a7050", "#1a4c38", GLOW_LIME], seed="lumina-stalk-top")},
              hardness=1.0, sound="stem", light=4, map_color="color_green"),
        Block("lumina_bloom_petal", "Moonbloom Petal", "mushroom_cap", {"all": tex("velvet", P_PETAL, seed="lumina-petal")},
              hardness=0.3, sound="wool", light=12, emissive=True, map_color="color_magenta"),
        Block("lumina_lumen_crystal", "Lumen Crystal", "crystal_block", {"all": tex(lumen_crystal, P_CYAN, "lumina-crystal")},
              hardness=1.2, sound="amethyst", light=15, emissive=True, map_color="diamond"),
        Block("lumina_lily", "Glow Lily", "lily", {"top": tex("lily_pad", ["#0a4040", "#16807a", GLOW_CYAN, "#d0fff8"],
                                                              seed="lumina-lily")},
              hardness=0.0, sound="lily_pad", light=7, emissive=True, map_color="color_cyan"),
    ],
    items=[
        Item("lumina_lumen_fruit", "Lumen Fruit", tex("item_icon", "fruit", ["#a85a10", "#ff9a2a", "#ffc040", "#fff0b0"],
                                                      seed="lumina-fruit"),
             kind="food", food=Food(4, 0.5, effects=[Effect("minecraft:night_vision", 60, 0)]),
             lore="Eat one and the dark stops being dark for a while."),
        Item("lumina_panther_fang", "Lumi Panther Fang", tex("item_icon", "fang", ["#3a4a6a", "#a0e8ff", "#e8fffc"],
                                                             seed="lumina-fang"),
             rarity="uncommon", lore="Still faintly glowing. So is the bite mark."),
        Item("lumina_lantern_dust", "Lantern Dust", tex("item_icon", "dust", ["#a05a10", "#ffb030", "#fff0a0"], seed="lumina-dust"),
             lore="Shaken from a Lantern Bug. It glows for weeks."),
    ],
    creatures=[
        Creature("lumi_panther", "Lumi Panther", "quadruped", ["#161a3a", "#0b0d22", "#5ff5e6", "#7ffff0"],
                 pattern="glow_lines", size=1.15,
                 body={"leg_len": 8, "leg_w": 3, "body_len": 17, "body_h": 7, "body_w": 8, "neck": 2, "ears": "pointy",
                       "whiskers": True, "eye_style": "slit", "eye_size": 2, "mouth": "fangs", "snout": 2, "head_size": 0.9,
                       "claws": True, "tail": 3, "tail_len": 5, "tail_kind": "curl", "glow_tips": True, "belly": True},
                 behavior="hostile", health=30, damage=6, speed=0.33, armor=2, abilities=["leap", "blink"],
                 spawn_light="dark", drops=[Drop("lumina_panther_fang", 0, 1, 0.6), Drop("minecraft:leather", 0, 2)],
                 sounds="cat", pitch=0.55, xp=10, group=1,
                 description="A shadow with glowing stripes. By the time you see the stripes, it is already leaping."),
        Creature("glow_frog", "Glow Frog", "hopper", ["#1a7a5a", "#b6ff5a", "#ff5fd2", "#101018"], pattern="spots",
                 size=0.7, emissive=False,
                 body={"kind": "frog", "throat_sac": True, "eye_style": "cute", "eye_size": 3, "blush": True, "mouth": "smile",
                       "glow_tips": True},
                 behavior="passive", health=8, speed=0.22, tempt="lumina_lumen_fruit",
                 drops=[Drop("minecraft:slime_ball", 0, 1, 0.5), Drop("minecraft:glow_ink_sac", 0, 1, 0.4)],
                 sounds="frog", pitch=1.3, xp=2, group=4,
                 description="Its throat sac lights up when it sings, and it sings all night long."),
        Creature("lantern_bug", "Lantern Bug", "flyer", ["#ffb030", "#3a2614", "#fff3b0", "#101010"], pattern="glow_lines",
                 size=0.45, emissive=True,
                 body={"kind": "insect", "wings": 1, "wing_kind": "insect", "antennae": 2, "glow_tips": True, "body_len": 7,
                       "eye_style": "compound"},
                 behavior="passive", category="ambient", health=4, speed=0.2, abilities=["glow_aura"],
                 drops=[Drop("lumina_lantern_dust", 0, 1, 0.8)], sounds="allay", pitch=1.6, xp=1, group=6,
                 description="A drifting spark with wings. Swarms of them light the jungle paths."),
    ],
    biomes=[
        Biome("lumina_lantern_canopy", "Lantern Canopy", top="lumina_moss", under="lumina_soil", temperature=0.35,
              humidity=0.55, elevation=0.15, grass_color="#164c40", foliage_color="#1e5e4a", water_color="#1a8a9a",
              water_fog_color="#063a40", particles=[("minecraft:firefly", 0.012), ("dust:#5ff5e6:0.7", 0.004)],
              ambient="jungle_night", music="minecraft:music.overworld.bamboo_jungle",
              features=[
                  LANTERN_TREE,
                  JUNGLE_TREE,
                  GLOW_BUSH,
                  Patch(block="minecraft:short_grass", count=6, tries=32),
                  Patch(block="minecraft:fern", count=4, tries=24),
                  Patch(block="minecraft:firefly_bush", count=2, tries=12),
                  Patch(block="lumina_lantern_flower", count=1, tries=10),
                  Patch(block="lumina_glowvine", count=4, where="cave_ceiling"),
                  Vanilla(id="minecraft:glow_lichen"),
              ],
              spawns=[Spawn("glow_frog", 8, (2, 3)), Spawn("lantern_bug", 12, (3, 5)), Spawn("lumi_panther", 3, (1, 1))]),
        Biome("lumina_moonbloom_glade", "Moonbloom Glade", top="lumina_moss", under="lumina_soil", temperature=-0.35,
              humidity=-0.25, elevation=0.0, grass_color="#1f6652", foliage_color="#1e5e4a", water_color="#2ad8cc",
              water_fog_color="#0a5a5a", particles=[("minecraft:firefly", 0.02), ("minecraft:end_rod", 0.0015)],
              ambient="crystal_chimes", music="minecraft:music.overworld.lush_caves",
              features=[
                  MOONBLOOM,
                  GiantPlant(stem="lumina_bloom_stem", head="lumina_glowleaf", shape="tuft", height=(3, 6), radius=(2, 3),
                             count=1, chance=2),
                  Tree(log="lumina_log", leaves="lumina_leaves", shape="jungle", height=(5, 8), decoration="lumina_bulb",
                       count=1, chance=2),
                  GLOW_BUSH,
                  Patch(block="lumina_lantern_flower", count=4, tries=24),
                  Patch(block="minecraft:short_grass", count=8, tries=32),
                  Patch(block="minecraft:firefly_bush", count=3, tries=16),
                  CrystalCluster(block="lumina_lumen_crystal", size=(3, 6), count=1, chance=5),
              ],
              spawns=[Spawn("glow_frog", 10, (2, 4)), Spawn("lantern_bug", 14, (4, 6)), Spawn("lumi_panther", 2, (1, 1))]),
        Biome("lumina_glowing_lagoon", "Glowing Lagoon", top="lumina_moss", under="lumina_soil", temperature=0.6,
              humidity=0.1, elevation=-0.7, underwater="lumina_soil", grass_color="#1b6a58", foliage_color="#1e5e4a",
              water_color="#26e8d8", water_fog_color="#0c6a68", fog_color="#0c2232",
              particles=[("minecraft:glow", 0.004), ("minecraft:firefly", 0.015)], ambient="bubbling",
              music="minecraft:music.overworld.swamp",
              surface_noise=[("lumina_soil", 0.45)],
              features=[
                  Patch(block="lumina_lily", where="water_surface", count=8, tries=32, max_depth=4),
                  Vanilla(id="minecraft:sea_pickle"),
                  Vanilla(id="minecraft:seagrass_warm"),
                  Spire(blocks=[("lumina_lumen_crystal", 2), ("lumina_stone", 3)], tip="lumina_lumen_crystal",
                        height=(5, 11), radius=(1, 2), lean=0.3, where="underwater", count=1, chance=2),
                  Patch(block="minecraft:firefly_bush", count=3, tries=16),
                  Patch(block="lumina_lantern_flower", count=2, tries=16),
                  Tree(log="lumina_log", leaves="lumina_leaves", shape="jungle", height=(5, 9), decoration="lumina_glowvine",
                       count=1, chance=2),
              ],
              spawns=[Spawn("glow_frog", 16, (2, 5)), Spawn("lantern_bug", 10, (3, 5))]),
        Biome("lumina_shadow_thicket", "Shadow Thicket", top="lumina_soil", under="lumina_soil", temperature=-0.6,
              humidity=0.7, elevation=0.25, grass_color="#0c2c30", foliage_color="#0a2c26", water_color="#14405a",
              water_fog_color="#04161e", fog_color="#04080f", fog_end=56, sky_color="#03060f",
              particles=[("minecraft:firefly", 0.003), ("minecraft:ash", 0.004)], ambient="eerie_choir",
              music="minecraft:music.overworld.deep_dark",
              surface_noise=[("lumina_moss", 0.2)],
              features=[
                  Tree(log="lumina_log", leaves="lumina_leaves", shape="dark_oak", height=(6, 9), count=6),
                  Tree(log="lumina_log", leaves="lumina_leaves", shape="mega_jungle", height=(14, 20), count=1, chance=2),
                  Patch(block="minecraft:fern", count=6, tries=24),
                  Patch(block="lumina_bulb", count=1, tries=6, where="cave_ceiling"),
                  Boulder(blocks=[("lumina_stone", 4), ("minecraft:mossy_cobblestone", 1)], radius=(1, 3), count=1, chance=3),
              ],
              spawns=[Spawn("lumi_panther", 7, (1, 2)), Spawn("lantern_bug", 4, (2, 3)), Spawn("glow_frog", 2, (1, 2))]),
    ],
    effects=[],
    ambient="jungle_night",
    music="minecraft:music.overworld.bamboo_jungle",
    icon="portalgun:lumina_lumen_fruit",
)
