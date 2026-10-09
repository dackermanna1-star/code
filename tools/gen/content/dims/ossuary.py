"""B-13 Ossuary - a bone desert under an amber sky, littered with the ribcages of things that were too big to die."""
from dataclasses import replace

import numpy as np
from PIL import Image

from gen import textures as T
from gen.content.dsl import *
from gen.noise import rng

P_BONE = ["#7a6c56", "#a89a7e", "#cbbf9f", "#e4d9bc", "#f6efdc"]
P_SAND = ["#b8ab92", "#cfc3a8", "#e0d6bd", "#ece4cf", "#f6f1e2"]
P_SANDSTONE = ["#8e7c62", "#a6937a", "#bba98e", "#cfbea2"]
P_ROCK = ["#4a3c30", "#5e4c3c", "#74604c", "#8a745c", "#9e8a70"]
P_MARROW = ["#7a2a20", "#a8442e", "#cc6a44", "#e49a62", "#f2c88a"]
P_ASH = ["#3e3834", "#524a44", "#686058", "#7e766c", "#958c80"]
P_PHOS = ["#3a6a4a", "#6ab88a", "#a8f0c0", "#e0fff0"]


def _hex(c):
    c = c.lstrip("#")
    return np.array([int(c[i:i + 2], 16) for i in (0, 2, 4)], float)


def _arr(img):
    return np.array(img.convert("RGBA"), float)


def _img(a):
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "RGBA")


def bone_sand(pal, bone_pal, seed):
    """Pale dune sand with a few tiny bone chips (lit top edge, shadow below)."""
    a = _arr(T.sand(pal, seed))
    R = rng(seed + ":chips")
    hi, mid, sh = _hex(bone_pal[4]), _hex(bone_pal[3]), _hex(pal[0])
    for _ in range(int(R.integers(2, 4))):
        x, y = int(R.integers(1, 13)), int(R.integers(1, 14))
        ln = int(R.integers(2, 4))
        for k in range(ln):
            a[y, (x + k) % 16, :3] = hi if k == 0 else mid
            a[(y + 1) % 16, (x + k) % 16, :3] = sh
        if R.random() < 0.5:  # knobbly end
            a[(y - 1) % 16, (x + ln - 1) % 16, :3] = mid
    return _img(a)


def fossil_rock(pal, bone_pal, seed):
    """Umber rock with embedded fossil fragments: a curved rib and a vertebra disc."""
    a = _arr(T.stone(pal, seed))
    R = rng(seed + ":fossil")
    b1, b2, b3 = _hex(bone_pal[2]), _hex(bone_pal[3]), _hex(bone_pal[1])
    dark = _hex(pal[0])
    # curved rib
    cx, cy, r = R.uniform(4, 11), R.uniform(12, 16), R.uniform(7, 10)
    yy, xx = np.mgrid[0:16, 0:16]
    d = np.hypot(xx - cx, yy - cy)
    rib = (np.abs(d - r) < 0.8) & (yy < cy - 2) & (xx > cx - r * 0.8) & (xx < cx + r * 0.6)
    a[rib, :3] = b2
    rib_sh = np.roll(rib, 1, axis=0) & ~rib
    a[rib_sh, :3] = dark
    # vertebra
    vx, vy = int(R.integers(2, 13)), int(R.integers(2, 6))
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            a[(vy + dy) % 16, (vx + dx) % 16, :3] = b1 if (dx, dy) != (0, 0) else b3
    a[(vy - 1) % 16, (vx - 1) % 16, :3] = b2
    a[(vy + 2) % 16, vx % 16, :3] = dark
    return _img(a)


def skull_face(pal, glow, seed):
    """A carved bone skull face: brow ridge, two deep sockets with an ember glow, nasal notch, a row of teeth."""
    a = _arr(T.bone(pal, seed))
    dark = np.array([28, 18, 14], float)
    shade = _hex(pal[0])
    g1, g2 = _hex(glow[0]), _hex(glow[1])
    yy, xx = np.mgrid[0:16, 0:16]
    for ex in (4.5, 10.5):
        d = np.hypot((xx - ex) / 2.3, (yy - 6.0) / 2.0)
        a[d < 1.25, :3] = shade
        a[d < 1.0, :3] = dark
        a[d < 0.42, :3] = g1
        a[(np.abs(xx - ex) < 0.6) & (np.abs(yy - 6.0) < 0.6), :3] = g2
    # brow ridge highlight
    a[3, 2:7, :3] = _hex(pal[4])
    a[3, 9:14, :3] = _hex(pal[4])
    # nasal notch
    for y, w in ((9, 0), (10, 1), (11, 1)):
        a[y, 7 - w:9 + w, :3] = dark
    # teeth
    a[13, 3:13, :3] = dark
    for x in range(3, 13):
        a[12, x, :3] = _hex(pal[4]) if x % 2 else _hex(pal[3])
        a[14, x, :3] = _hex(pal[3]) if x % 2 else shade
    a[15, 3:13, :3] = shade
    return _img(a)


def bone_end(bone_pal, marrow_pal, seed):
    """Cross-section of a giant bone: thick cortical ring around a spongy red-orange marrow core."""
    a = np.zeros((16, 16, 4), float)
    a[..., 3] = 255
    R = rng(seed)
    yy, xx = np.mgrid[0:16, 0:16]
    d = np.hypot(xx - 7.5, yy - 7.5) + (R.random((16, 16)) - 0.5) * 0.6
    cort = [_hex(c) for c in bone_pal]
    mar = [_hex(c) for c in marrow_pal]
    a[..., :3] = cort[3]
    a[d > 6.6, :3] = cort[2]
    a[d > 7.6, :3] = cort[1]
    ring = (d > 4.6) & (d < 5.3)
    a[ring, :3] = cort[4]
    core = d < 4.6
    n = R.random((16, 16))
    a[core, :3] = mar[2]
    a[core & (n < 0.35), :3] = mar[1]
    a[core & (n > 0.8), :3] = mar[3]
    a[(d < 4.6) & (d > 3.9), :3] = mar[0]
    return _img(a)


TOTEM = Spire(blocks=[("minecraft:bone_block", 3), ("ossuary_giant_bone", 1)], tip="ossuary_skull", height=(5, 9),
              radius=(1, 1), lean=0.05, count=1, chance=5)
COLOSSUS = Structure(kind="ribcage", blocks={"bone": "ossuary_giant_bone", "spine": "minecraft:bone_block"},
                     size=(11, 15), params={"skull": 1, "height": 1.1}, count=1, chance=3)

DIMENSION = Dimension(
    id="ossuary",
    code="B-13",
    name="Ossuary",
    tagline="A bone desert where giants came to die",
    description=("Endless dunes of bleached bone-sand under a sour amber sky and a cracked, skull-white moon. "
                 "Ribcages of colossal beasts arch out of the Colossus Graveyard, skull totems mark the old trails "
                 "and the Marrow Flats bubble red and sticky. Vultures circle patiently - something long and "
                 "rattling swims beneath the sand, and after dark the skulls start to crawl."),
    danger=4,
    color="#e4d9bc",
    terrain=Terrain(style="dunes", stone="ossuary_fossil_rock", sea_level=50, height=76, amplitude=16, scale=1.1,
                    roughness=0.04, deepslate="minecraft:deepslate",
                    params={"wavelength": 72, "direction": 20, "dune_height": 17, "cross": 0.35, "biome_size": 340,
                            "cliff_block": "ossuary_dust_sandstone", "ceiling_block": "ossuary_dust_sandstone",
                            "beach_block": "ossuary_marrow_crust", "beach_height": 1}),
    sky=Sky(sky_color="#c98e5c", fog_color="#e2b585", water_fog_color="#5a1e14", fog_start=40, fog_end=210,
            cloud_color="#50f0d8b0", cloud_height=210, time="afternoon",
            sky_light_color="#ffe0b0",
            bodies=[Celestial("shattered_moon", ["#9a8e74", "#d8ccb0", "#f6efdc", "#3a2a20"], size=74, yaw=200,
                              pitch=34, roll=12, seed="ossuary-skullmoon"),
                    Celestial("moon", ["#7a5a4a", "#b08a70", "#d8b494"], size=14, yaw=230, pitch=48,
                              seed="ossuary-tooth")]),
    blocks=[
        Block("ossuary_bone_sand", "Bone Sand", "sand", {"all": tex(bone_sand, P_SAND, P_BONE, "ossuary-sand")},
              hardness=0.5, sound="sand", map_color="sand"),
        Block("ossuary_dust_sandstone", "Bone-Dust Sandstone", "stone",
              {"all": tex("terracotta", P_SANDSTONE, seed="ossuary-sandstone")}, hardness=0.9, sound="calcite",
              map_color="sand"),
        Block("ossuary_fossil_rock", "Fossil Rock", "stone", {"all": tex(fossil_rock, P_ROCK, P_BONE, "ossuary-rock")},
              hardness=1.6, sound="tuff", map_color="color_brown"),
        Block("ossuary_giant_bone", "Colossus Bone", "log", {
            "side": tex("bone", P_BONE, seed="ossuary-bone"),
            "end": tex(bone_end, P_BONE, P_MARROW, "ossuary-bone-end")}, hardness=2.0, sound="bone", tool="pickaxe",
              map_color="sand"),
        Block("ossuary_skull", "Watching Skull", "solid", {"all": tex(skull_face, P_BONE, ["#ff6a20", "#ffe080"],
                                                                       "ossuary-skull")},
              hardness=1.5, sound="bone", tool="pickaxe", light=6, map_color="sand"),
        Block("ossuary_marrow_crust", "Marrow Crust", "soil", {"all": tex("sponge", P_MARROW[1:], seed="ossuary-crust")},
              hardness=0.6, sound="mud", map_color="color_orange"),
        Block("ossuary_marrow_pool", "Marrow Mire", "sticky", {"all": tex("goo", P_MARROW, seed="ossuary-mire", alpha=255)},
              hardness=0.5, sound="honey", tool="shovel", map_color="color_red", speed=0.4, jump=0.5),
        Block("ossuary_ash", "Charnel Ash", "soil", {"all": tex("ash", P_ASH, seed="ossuary-ash")}, hardness=0.5,
              sound="sand", map_color="color_gray"),
        Block("ossuary_bone_thistle", "Bone Thistle", "plant", {"cross": tex("bone_sprite", P_BONE, seed="ossuary-thistle")},
              hardness=0.0, sound="bone"),
        Block("ossuary_marrow_bloom", "Marrow Bloom", "plant",
              {"cross": tex("flower", ["#5a4a3a", "#7a6450", "#9a8268"], P_MARROW, "ossuary-bloom", shape="bell",
                            center_hex="#f6efdc")},
              hardness=0.0, sound="grass", fruit="ossuary_bone_marrow", drop_count=(1, 1)),
        Block("ossuary_phosphor_shard", "Phosphor Bone", "crystal_cluster",
              {"cross": tex("crystal_shard_sprite", P_PHOS, seed="ossuary-phos")}, hardness=0.6, sound="bone",
              light=9, emissive=True, map_color="color_light_green"),
        Block("ossuary_dust_vent", "Bone-Dust Fumarole", "vent", {
            "top": tex("rough_stone", P_ROCK, seed="ossuary-vent"),
            "side": tex(fossil_rock, P_ROCK, P_BONE, "ossuary-vent-side")}, hardness=1.2, sound="tuff",
              particle="minecraft:white_ash", effect="minecraft:weakness", effect_seconds=5, map_color="color_brown"),
    ],
    items=[
        Item("ossuary_bone_marrow", "Bone Marrow", tex("item_icon", "slice", P_MARROW, seed="ossuary-marrow",
                                                       accent="#f6efdc"),
             kind="food", food=Food(6, 0.9, effects=[Effect("minecraft:resistance", 30, 0),
                                                     Effect("minecraft:nausea", 6, 0, chance=0.35)]),
             lore="Rich, buttery, and none of your business whose it was."),
        Item("ossuary_serpent_vertebra", "Serpent Vertebra", tex("item_icon", "bone", P_BONE, seed="ossuary-vert",
                                                                 accent="#ff6a20"),
             rarity="uncommon", lore="Still rattles faintly when the others are near."),
    ],
    creatures=[
        Creature("bone_serpent", "Bone Serpent", "serpent", ["#e4d9bc", "#5e4c3c", "#ff6a20", "#ff4010"],
                 pattern="rings", size=1.55,
                 body={"head": "dragon", "segments": 10, "seg_w": 7, "seg_len": 6, "taper": 0.5, "ridge": True,
                       "spikes": 8, "undead": True, "jaw": True, "eye_style": "glow", "mouth": "fangs",
                       "horns": "curved", "head_w": 9, "head_len": 10, "belly": False},
                 behavior="hostile", health=44, damage=7, speed=0.3, armor=4, abilities=["burrow", "charge"],
                 on_hit=Effect("minecraft:wither", 4), drops=[Drop("ossuary_serpent_vertebra", 1, 2),
                                                             Drop("minecraft:bone", 2, 5)],
                 sounds="skeleton", pitch=0.5, xp=15, group=1,
                 description="A rattling spine of a hundred vertebrae that swims through the dunes like water."),
        Creature("skull_crawler", "Skull Crawler", "crawler", ["#e4d9bc", "#7a6c56", "#3a2a20", "#ff6a20"],
                 pattern="plain", size=0.8,
                 body={"kind": "spider", "legs": 3, "leg_len": 9, "head_size": 2.2, "body_len": 4, "body_w": 5,
                       "body_h": 4, "eye_style": "glow", "eyes": 2, "eye_size": 2, "mouth": "fangs", "undead": True,
                       "belly": False},
                 behavior="hostile", health=14, damage=4, speed=0.33, abilities=["leap"], spawn_light="dark",
                 drops=[Drop("minecraft:bone", 1, 3), Drop("minecraft:bone_meal", 0, 2)],
                 sounds="skeleton", pitch=1.45, xp=6, group=3,
                 description="A skull that grew finger-bone legs. They come out after dark, in clattering packs."),
        Creature("ossuary_vulture", "Vulture", "flyer", ["#3a2c26", "#6a5648", "#d8857a", "#140c0a", "#e4d9bc"],
                 pattern="gradient", size=0.95,
                 body={"kind": "bird", "beak": 3, "hooked": True, "neck": 3, "fluffy": True, "wing_span": 15,
                       "tail": 1, "tail_kind": "fan", "head_size": 0.8, "eye_style": "sleepy"},
                 behavior="passive", health=10, speed=0.24,
                 drops=[Drop("minecraft:feather", 1, 3), Drop("minecraft:rotten_flesh", 0, 1)],
                 sounds="parrot", pitch=0.55, xp=2, group=3,
                 description="Bald, patient and polite. It is only waiting to see how your day turns out."),
    ],
    biomes=[
        Biome("ossuary_bleached_dunes", "Bleached Dunes", top="ossuary_bone_sand", under="ossuary_dust_sandstone",
              temperature=0.0, humidity=-0.2, elevation=0.1, water_color="#a85a40", water_fog_color="#5a1e14",
              particles=[("minecraft:white_ash", 0.004)], ambient="wind_howl", music="minecraft:music.overworld.desert",
              features=[
                  replace(COLOSSUS, chance=8),
                  TOTEM,
                  Patch(block="ossuary_bone_thistle", count=2, tries=16),
                  Boulder(blocks=[("ossuary_dust_sandstone", 4), ("ossuary_skull", 1)], radius=(1, 2), squash=0.7,
                          count=1, chance=4),
              ],
              spawns=[Spawn("ossuary_vulture", 10, (1, 3)), Spawn("skull_crawler", 5, (2, 3)),
                      Spawn("bone_serpent", 3, (1, 1))]),
        Biome("ossuary_colossus_graveyard", "Colossus Graveyard", top="ossuary_bone_sand", under="ossuary_dust_sandstone",
              temperature=0.6, humidity=0.4, elevation=0.2, water_color="#a85a40", water_fog_color="#5a1e14",
              fog_color="#d8a878", particles=[("minecraft:white_ash", 0.006)], ambient="eerie_choir",
              music="minecraft:music.nether.soul_sand_valley", surface_noise=[("minecraft:bone_block", 0.82)],
              features=[
                  COLOSSUS,
                  Structure(kind="arch", blocks={"main": "ossuary_giant_bone", "alt": "minecraft:bone_block"},
                            size=(6, 10), params={"height": 1.5}, count=1, chance=4),
                  Spire(blocks=[("minecraft:bone_block", 1)], tip="ossuary_giant_bone", height=(10, 18),
                        radius=(1, 2), lean=0.7, count=1, chance=2),
                  replace(TOTEM, chance=3),
                  Boulder(blocks=[("ossuary_fossil_rock", 5), ("ossuary_skull", 1)], radius=(2, 4), squash=0.8,
                          count=1, chance=2),
                  CrystalCluster(block="ossuary_phosphor_shard", small="ossuary_phosphor_shard", size=(2, 4),
                                 count=1, chance=2),
                  Patch(block="ossuary_bone_thistle", count=3, tries=20),
                  Patch(block="ossuary_phosphor_shard", count=4, where="cave_floor"),
              ],
              spawns=[Spawn("bone_serpent", 5, (1, 1)), Spawn("skull_crawler", 6, (2, 4)),
                      Spawn("ossuary_vulture", 8, (2, 4))]),
        Biome("ossuary_marrow_flats", "Marrow Flats", top="ossuary_marrow_crust", under="ossuary_dust_sandstone",
              temperature=-0.35, humidity=0.6, elevation=-0.4, underwater="ossuary_marrow_crust",
              water_color="#c0583e", water_fog_color="#6a2216", fog_color="#e0a07a", sky_color="#cf8a64",
              particles=[("minecraft:falling_nectar", 0.004)], ambient="wet_squelch",
              music="minecraft:music.overworld.swamp", surface_noise=[("ossuary_marrow_pool", 0.5)],
              features=[
                  Lake(fluid="minecraft:water", border="ossuary_marrow_pool", count=1, chance=3),
                  Patch(block="ossuary_marrow_bloom", count=4, tries=24),
                  Patch(block="ossuary_bone_thistle", count=1, tries=10),
                  replace(COLOSSUS, chance=10, size=(9, 12)),
                  Disk(block="ossuary_marrow_pool", replace=["ossuary_marrow_crust"], radius=(2, 4), count=1),
              ],
              spawns=[Spawn("ossuary_vulture", 12, (2, 4)), Spawn("skull_crawler", 2, (1, 2)),
                      Spawn("bone_serpent", 2, (1, 1))]),
        Biome("ossuary_charnel_barrens", "Charnel Barrens", top="ossuary_ash", under="ossuary_fossil_rock",
              temperature=-0.95, humidity=-0.95, elevation=0.4, water_color="#6a5a50", water_fog_color="#2a201c",
              fog_color="#9a8270", sky_color="#a07a5c", fog_end=140,
              particles=[("minecraft:ash", 0.03), ("minecraft:white_ash", 0.01)], ambient="volcanic_rumble",
              music="minecraft:music.nether.basalt_deltas", surface_noise=[("ossuary_bone_sand", 0.6)],
              features=[
                  Patch(block="ossuary_dust_vent", count=1, tries=4),
                  Spire(blocks=[("ossuary_fossil_rock", 3), ("ossuary_dust_sandstone", 1)], tip="ossuary_skull",
                        height=(7, 15), radius=(1, 3), lean=0.15, count=1, chance=2),
                  Boulder(blocks=[("ossuary_fossil_rock", 4), ("ossuary_ash", 1)], radius=(2, 3), count=1, chance=2),
                  replace(TOTEM, chance=3),
                  Patch(block="ossuary_bone_thistle", count=1, tries=10),
              ],
              spawns=[Spawn("skull_crawler", 6, (2, 4)), Spawn("bone_serpent", 3, (1, 1)),
                      Spawn("ossuary_vulture", 4, (1, 2))]),
    ],
    effects=["heat"],
    ambient="wind_howl",
    music="minecraft:music.overworld.desert",
    icon="portalgun:ossuary_serpent_vertebra",
)
