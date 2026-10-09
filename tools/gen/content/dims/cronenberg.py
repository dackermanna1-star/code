"""C-137C Cronenberg World - a planet that mutated into one continuous, breathing body."""
import math

import numpy as np
from PIL import Image

from gen.content.dsl import *
from gen.noise import fbm, rng

# ------------------------------------------------------------------------------------------------ palette
P_FLESH = ["#7a2e3a", "#a44852", "#c4646a", "#dc8682", "#f0aa9e"]
P_VEIN = ["#3a0614", "#6a1026", "#9a1e36"]
P_MEAT = ["#3e1418", "#561e22", "#6e2a2c", "#863a38"]
P_GRISTLE = ["#2e2026", "#3e2c32", "#503a3e", "#644c4e", "#7a6260"]
P_BONE = ["#a89878", "#c4b694", "#dcd0b0", "#eee6cc", "#faf6e6"]
P_BILE = ["#5a6a08", "#7f9412", "#a8c022", "#cfe048", "#f0ff98"]
P_SINEW = ["#4a0e1e", "#6e1a2e", "#922840", "#b83c52", "#d8607a"]


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


def _q(v, n):
    return np.round(np.clip(v, 0, 1) * (n - 1)) / (n - 1)


def eyeball_block(sclera, vein_pal, iris_pal, seed):
    """Veiny sclera with one big staring iris per face (a sphere of these = a cluster of eyes)."""
    yy, xx = np.mgrid[0:16, 0:16]
    n = fbm(16, 16, 4, seed, 2)
    rgb = _ramp(sclera, _q(0.55 + 0.35 * n, 4))
    # wandering veins
    R = rng(seed + ":v")
    for _ in range(4):
        x, y = float(R.integers(0, 16)), float(R.choice([0, 15]))
        ang = R.uniform(0, 2 * math.pi)
        for _s in range(9):
            xi, yi = int(x) % 16, int(y) % 16
            rgb[yi, xi] = _hex(vein_pal[1])
            ang += R.uniform(-0.8, 0.8)
            x += math.cos(ang)
            y += math.sin(ang) + (0.8 if yi < 8 else -0.8)
    jx, jy = R.uniform(-1.2, 1.2), R.uniform(-1.2, 1.2)
    d = np.hypot(xx - 7.5 - jx, yy - 7.5 - jy)
    iris = d < 4.6
    rgb[iris] = _ramp(iris_pal, _q(1.0 - d[iris] / 4.6 * 0.8 + 0.12 * n[iris], 4))
    rgb[(d >= 4.6) & (d < 5.4)] = rgb[(d >= 4.6) & (d < 5.4)] * 0.62
    rgb[d < 2.0] = _hex("#0a0408")
    hx, hy = int(round(7.5 + jx - 1.6)), int(round(7.5 + jy - 1.6))
    rgb[hy % 16, hx % 16] = 255
    rgb[(hy + 1) % 16, hx % 16] = 230
    return _img(rgb)


def pustule_flesh(flesh_pal, vein_pal, pus_pal, seed):
    """Flesh covered in swollen yellow-green pustules with glossy tops."""
    from gen import textures as T
    base = np.asarray(T.flesh(flesh_pal, vein_pal, seed + ":f").convert("RGBA"), float)[..., :3]
    yy, xx = np.mgrid[0:16, 0:16]
    R = rng(seed + ":p")
    for _ in range(int(R.integers(4, 6))):
        cx, cy, r = R.uniform(0, 16), R.uniform(0, 16), R.uniform(1.8, 3.2)
        dx = (xx - cx + 8) % 16 - 8
        dy = (yy - cy + 8) % 16 - 8
        d = np.hypot(dx, dy)
        m = d < r
        base[(d >= r) & (d < r + 0.9)] *= 0.55
        t = 1.0 - d / r + 0.25 * (-dx - dy) / r
        base[m] = _ramp(pus_pal, _q(0.35 + 0.55 * t[m], 5))
        hi = m & (np.abs(dx + r * 0.35) < 0.6) & (np.abs(dy + r * 0.35) < 0.6)
        base[hi] = 255
    return _img(base)


def orifice(flesh_pal, vein_pal, bile_pal, seed):
    """Puckered fleshy vent with a bile-green throat (vent top)."""
    from gen import textures as T
    base = np.asarray(T.flesh(flesh_pal, vein_pal, seed + ":f").convert("RGBA"), float)[..., :3]
    yy, xx = np.mgrid[0:16, 0:16]
    dx, dy = xx - 7.5, yy - 7.5
    d = np.hypot(dx, dy)
    ang = np.arctan2(dy, dx)
    fold = np.sin(ang * 7) * 0.6
    lip = (d > 3.2 + fold) & (d < 6.2 + fold)
    base[lip] = _ramp(flesh_pal, _q(0.85 - (d[lip] - 3.5) / 4 + 0.15 * np.cos(ang[lip] * 7), 5))
    ring = (d >= 6.2 + fold) & (d < 7.0 + fold)
    base[ring] *= 0.6
    throat = d <= 3.2 + fold
    base[throat] = _ramp(bile_pal, _q(d[throat] / 4.0, 5))
    base[d < 1.3] = _hex("#1a2004")
    return _img(base)


def marrow_end(bone_pal, seed):
    """Bone cross-section: ivory rim, spongy bone, red marrow core."""
    yy, xx = np.mgrid[0:16, 0:16]
    d = np.maximum(np.abs(xx - 7.5), np.abs(yy - 7.5)) * 0.55 + np.hypot(xx - 7.5, yy - 7.5) * 0.45
    n = rng(seed).random((16, 16))
    rgb = _ramp(bone_pal, _q(0.95 - d / 9.0 + 0.15 * n, 5))
    spongy = (d < 5.2) & (d > 3.2)
    rgb[spongy & (n > 0.55)] *= 0.72
    core = d <= 3.2
    rgb[core] = _ramp(["#5a0a16", "#8a1a28", "#b83040", "#d85a5a"], _q(1 - d[core] / 3.4 + 0.2 * n[core], 4))
    edge = (xx == 0) | (yy == 0) | (xx == 15) | (yy == 15)
    rgb[edge] *= 0.8
    return _img(rgb)


# ------------------------------------------------------------------------------------------------ dimension
DIMENSION = Dimension(
    id="cronenberg",
    code="C-137C",
    name="Cronenberg World",
    tagline="Everything here is alive. Everything here is wrong.",
    description=("A planet that mutated into one continuous body: hills of pulsing flesh, forests of bone, eyes "
                 "growing on stalks and a sea of dark ichor under a sky with an eye in it. The Cronenbergs that "
                 "used to be people roam in packs, Flesh Crawlers skitter through the veins, and the Gut Worms "
                 "only bite if you step on them. Do not stay after dark - it is always nearly dark."),
    danger=4,
    color="#c4646a",
    terrain=Terrain(style="blobs", stone="cronen_gristle", sea_level=58, height=70, amplitude=20, scale=1.1,
                    roughness=0.3, caves=True, ores=False,
                    params={"blobbiness": 0.85, "floating": 0.35, "squash": 0.85, "springs": 5,
                            "ceiling_block": "cronen_meat", "cliff_block": "cronen_meat", "biome_size": 280}),
    sky=Sky(sky_color="#8a5440", fog_color="#6a3428", water_fog_color="#2a0408", fog_start=12, fog_end=120,
            cloud_color="#c0804838", cloud_height=150, time="dusk", sunrise_color="#ff8a3a60", star_brightness=0.2,
            ambient_light=0.06,
            bodies=[Celestial("eye", ["#3a7a18", "#88c838", "#e8ff80", "#f0d0c0"], size=95, yaw=170, pitch=38, seed="cronen-eye"),
                    Celestial("moon", ["#c06070"], size=30, yaw=300, pitch=55, roll=10,
                              seed="cronen-meatmoon")]),
    blocks=[
        Block("cronen_flesh", "Living Flesh", "grass", {
            "top": tex("flesh", P_FLESH, P_VEIN, seed="cronen-flesh"),
            "side": tex("grass_side", P_FLESH, P_MEAT, seed="cronen-flesh-side"),
            "bottom": tex("flesh", P_MEAT, P_VEIN, seed="cronen-meat")}, hardness=0.8, sound="mud",
              map_color="color_pink"),
        Block("cronen_meat", "Raw Meat", "soil", {"all": tex("flesh", P_MEAT, P_VEIN, seed="cronen-meat")}, hardness=0.7,
              sound="mud", map_color="crimson_nylium"),
        Block("cronen_gristle", "Gristle", "stone", {"all": tex("rough_stone", P_GRISTLE, seed="cronen-gristle")},
              hardness=1.6, sound="mud_bricks", map_color="terracotta_brown"),
        Block("cronen_bone_log", "Bone Trunk", "log", {
            "side": tex("bone", P_BONE, seed="cronen-bone"),
            "end": tex(marrow_end, P_BONE, "cronen-marrow")}, hardness=2.0, sound="bone_block", tool="pickaxe",
              map_color="sand"),
        Block("cronen_sinew_leaves", "Sinew Canopy", "leaves", {"all": tex("leaves", P_SINEW, seed="cronen-sinew", holes=0.35)},
              hardness=0.3, sound="nether_wart", map_color="color_red"),
        Block("cronen_eyeball_block", "Eyeball Cluster", "solid", {
            "all": tex(eyeball_block, ["#c8b4a4", "#e0d0c4", "#f2e8de", "#fff8f0"], P_VEIN,
                       ["#1e4a0a", "#3a7a18", "#88c838", "#d8ff70"], "cronen-eyeball")}, hardness=0.6, sound="slime",
              tool="hoe", map_color="terracotta_white"),
        Block("cronen_eyestalk", "Eyestalk", "plant", {
            "cross": tex("eyeball_plant", P_FLESH, "#f2e8de", "#58a020", seed="cronen-eyestalk")}, hardness=0.0,
              sound="slime", map_color="color_pink"),
        Block("cronen_tooth", "Erupting Teeth", "crystal_cluster", {
            "cross": tex("crystal_shard_sprite", P_BONE, seed="cronen-tooth", count=3)}, hardness=0.8,
              sound="bone_block", map_color="sand"),
        Block("cronen_pustule", "Pustule Flesh", "hazard", {
            "all": tex(pustule_flesh, P_FLESH, P_VEIN, P_BILE, "cronen-pustule")}, hardness=0.6, sound="slime",
              damage=1.0, damage_type="generic", effect="minecraft:poison", effect_seconds=3, tool="shovel",
              map_color="color_yellow"),
        Block("cronen_bile_vent", "Bile Sphincter", "vent", {
            "top": tex(orifice, P_FLESH, P_VEIN, P_BILE, "cronen-orifice"),
            "side": tex("flesh", P_FLESH, P_VEIN, seed="cronen-flesh-v")}, hardness=1.0, sound="mud",
              particle="minecraft:sneeze", effect="minecraft:nausea", effect_seconds=6, tool="shovel",
              map_color="color_light_green"),
        Block("cronen_bile_bulb", "Bile Bulb", "hanging_plant", {
            "cross": tex("bulb", P_SINEW, P_BILE, seed="cronen-bulb")}, hardness=0.0, sound="cave_vines", light=10,
              emissive=True),
        Block("cronen_veins", "Creeping Veins", "vine", {"face": tex("vine_overlay", P_SINEW, seed="cronen-veins")},
              hardness=0.2, sound="nether_wart", map_color="color_red"),
    ],
    items=[
        Item("cronen_mystery_meat", "Mystery Meat", tex("item_icon", "meat_raw", P_FLESH, seed="cronen-mmeat"), kind="food",
             food=Food(5, 0.5, effects=[Effect("minecraft:strength", 30, 0), Effect("minecraft:nausea", 8, 0, chance=0.6)]),
             lore="It was probably somebody. Tastes like chicken anyway."),
        Item("cronen_watching_eye", "Watching Eye", tex("item_icon", "eyeball", ["#f2e8de", "#58a020", "#1e4a0a"],
                                                         seed="cronen-eyeitem"),
             rarity="uncommon", lore="Still blinks when nobody looks at it."),
        Item("cronen_gut_string", "Gut String", tex("item_icon", "tentacle", ["#b05a68", "#e0909a", "#f0c0c8"],
                                                    seed="cronen-gut"),
             lore="Like string, but worse in every measurable way."),
    ],
    creatures=[
        Creature("cronenberg", "Cronenberg", "biped", ["#d4907e", "#8a3a44", "#f0d8a0", "#c8ff40", "#5a1420"],
                 pattern="veins", size=1.25,
                 body={"bulky": True, "stance": "hunched", "arms": 6, "arm_len": 12, "eyes": 5, "eye_style": "angry",
                       "mouth": "maw", "jaw": True, "head_size": 1.3, "claws": True, "eyestalks": 3},
                 behavior="hostile", attack="melee", health=34, damage=6, speed=0.27, armor=2,
                 abilities=["charge"], on_hit=Effect("minecraft:nausea", 5, 0), spawn_light="dark",
                 drops=[Drop("cronen_mystery_meat", 0, 2, cooked="minecraft:cooked_beef"),
                        Drop("cronen_watching_eye", 0, 1, chance=0.25)],
                 sounds="zombie", pitch=0.65, xp=10, group=3,
                 description="It used to be a person. Now it is several, and none of them are happy about it."),
        Creature("flesh_crawler", "Flesh Crawler", "crawler", ["#b0525a", "#6e2a2c", "#f0d8a0", "#ffe040", "#3a0614"],
                 pattern="veins", size=0.9,
                 body={"kind": "centipede", "segments": 7, "legs": 2, "leg_len": 5, "eyes": 4, "eye_style": "slit",
                       "mandibles": True, "spikes": 0},
                 behavior="hostile", attack="melee", health=12, damage=3, speed=0.34,
                 abilities=["leap", "climb"], on_hit=Effect("minecraft:hunger", 8, 1), spawn_light="dark",
                 drops=[Drop("cronen_mystery_meat", 0, 1, cooked="minecraft:cooked_beef"), Drop("minecraft:string", 0, 2)],
                 sounds="silverfish", pitch=0.7, xp=5, group=3,
                 description="A strip of muscle with too many legs. It drops from the overhangs onto your face."),
        Creature("gut_worm", "Gut Worm", "serpent", ["#e0909a", "#a84a5a", "#f6c8cc", "#1a0a10", "#7a2a3a"],
                 pattern="rings", size=1.5,
                 body={"head": "worm", "segments": 9, "seg_w": 6, "seg_len": 6, "taper": 0.55, "ringed": True,
                       "mouth": "maw", "jaw": True},
                 behavior="neutral", attack="melee", health=30, damage=5, speed=0.22, abilities=["burrow"],
                 drops=[Drop("cronen_gut_string", 1, 3), Drop("cronen_mystery_meat", 0, 1, cooked="minecraft:cooked_beef")],
                 sounds="ravager", pitch=1.4, xp=7, group=2,
                 description="A free-roaming intestine as long as a boat. It minds its own business - mostly digestion."),
    ],
    biomes=[
        Biome("flesh_plains", "Flesh Plains", top="cronen_flesh", under="cronen_meat", temperature=-0.83, humidity=-0.35, elevation=0.0,
              underwater="cronen_meat", grass_color="#c4646a", foliage_color="#922840", water_color="#6a0a18",
              water_fog_color="#2a0408", particles=[("dust:#8a1a28:1.0", 0.006), ("minecraft:crimson_spore", 0.004)],
              ambient="wet_squelch", music="minecraft:music.nether.crimson_forest",
              surface_noise=[("cronen_pustule", 0.78)],
              features=[
                  GiantPlant(stem="cronen_meat", head="cronen_eyeball_block", shape="sphere", height=(8, 14),
                             radius=(2, 3), stem_width=1, bend=0.35, count=1, chance=2),
                  Structure(kind="tendril", blocks={"main": "cronen_flesh", "tip": "cronen_eyeball_block"}, size=(8, 14),
                            params={"curl": 0.7}, count=1, chance=3),
                  Patch(block="cronen_eyestalk", count=5, tries=24),
                  Patch(blocks=[("minecraft:crimson_roots", 3), ("minecraft:nether_sprouts", 2)], count=4, tries=32),
                  Patch(block="cronen_veins", count=3, where="cave_ceiling"),
                  Patch(block="cronen_bile_bulb", count=2, where="cave_ceiling", tries=16),
              ],
              spawns=[Spawn("cronenberg", 8, (1, 3)), Spawn("flesh_crawler", 5, (1, 2)), Spawn("gut_worm", 6, (1, 2))]),
        Biome("bone_thicket", "Bone Thicket", top="cronen_meat", under="cronen_meat", temperature=-0.05, humidity=-0.42, elevation=0.0,
              underwater="cronen_gristle", grass_color="#863a38", foliage_color="#922840", water_color="#6a0a18",
              water_fog_color="#2a0408", particles=[("minecraft:white_ash", 0.006)], ambient="eerie_choir",
              music="minecraft:music.nether.soul_sand_valley", surface_noise=[("cronen_flesh", 0.35)],
              features=[
                  Tree(log="cronen_bone_log", leaves="cronen_sinew_leaves", shape="twisted", height=(7, 12), count=2,
                       decoration="cronen_bile_bulb"),
                  Tree(log="cronen_bone_log", leaves="cronen_sinew_leaves", shape="dark_oak", height=(6, 9), count=1),
                  Structure(kind="ribcage", blocks={"bone": "minecraft:bone_block", "spine": "cronen_bone_log"},
                            size=(8, 13), count=1, chance=3),
                  Patch(block="cronen_tooth", count=3, tries=16),
                  Patch(blocks=[("minecraft:crimson_roots", 2), ("cronen_eyestalk", 1)], count=2, tries=16),
              ],
              spawns=[Spawn("cronenberg", 6, (1, 2)), Spawn("flesh_crawler", 8, (2, 3)), Spawn("gut_worm", 3, (1, 1))]),
        Biome("bile_marsh", "Bile Marsh", top="cronen_meat", under="cronen_meat", temperature=-0.18, humidity=0.41,
              elevation=-0.6, underwater="cronen_gristle", grass_color="#a8c022", foliage_color="#7f9412",
              water_color="#8a9a14", water_fog_color="#2a3404", fog_color="#4a4a20", fog_end=80,
              particles=[("minecraft:sneeze", 0.004), ("dust:#a8c022:1.2", 0.006)], ambient="sizzle_toxic",
              music="minecraft:music.overworld.swamp", surface_noise=[("cronen_pustule", 0.4)],
              features=[
                  Patch(block="cronen_bile_vent", count=2, tries=6),
                  Boulder(blocks=[("cronen_pustule", 2), ("cronen_flesh", 3)], radius=(2, 4), squash=0.6, count=1),
                  Patch(block="cronen_eyestalk", count=2, tries=16),
                  Patch(block="cronen_bile_bulb", count=4, where="cave_ceiling", tries=16),
                  Lake(fluid="minecraft:water", border="cronen_pustule", count=1, chance=3),
              ],
              spawns=[Spawn("gut_worm", 10, (1, 2)), Spawn("flesh_crawler", 6, (1, 3)), Spawn("cronenberg", 3, (1, 1))]),
        Biome("molar_ridges", "Molar Ridges", top="cronen_gristle", under="cronen_gristle", temperature=0.64,
              humidity=0.18, elevation=0.7, underwater="cronen_gristle", grass_color="#c4646a",
              water_color="#6a0a18", water_fog_color="#2a0408", particles=[("minecraft:ash", 0.006)],
              ambient="volcanic_rumble", music="minecraft:music.nether.basalt_deltas",
              surface_noise=[("cronen_flesh", 0.5)],
              features=[
                  Spire(blocks=[("minecraft:bone_block", 5), ("cronen_bone_log", 1)], height=(7, 16), radius=(1, 3),
                        lean=0.35, count=2),
                  CrystalCluster(block="minecraft:bone_block", small="cronen_tooth", size=(3, 7), count=1),
                  Patch(block="cronen_tooth", count=4, tries=20),
                  Patch(block="cronen_veins", count=4, tries=20),
              ],
              spawns=[Spawn("cronenberg", 8, (2, 3)), Spawn("flesh_crawler", 4, (1, 2))]),
    ],
    effects=[],
    ambient="wet_squelch",
    music="minecraft:music.nether.crimson_forest",
    platform="cronen_gristle",
    icon="portalgun:cronen_watching_eye",
)
