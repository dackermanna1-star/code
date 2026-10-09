"""A-23 Mesa Rift - banded red-rock canyons, hoodoo forests and turquoise rivers under a wide golden sky."""
import numpy as np
from PIL import Image

from gen import textures as T
from gen.content.dsl import *
from gen.noise import rng

P_RED = ["#5e2416", "#7e321e", "#9c4428", "#b85834", "#cc6e44"]
P_ORANGE = ["#8e441e", "#ac5a28", "#c67236", "#da8c4a", "#e8a862"]
P_CREAM = ["#a88a68", "#bfa07c", "#d2b690", "#e2caa6", "#efdcbc"]
P_SHALE = ["#34222c", "#46303a", "#5a3e48", "#6e4e58", "#82606a"]
P_SAGE = ["#45553a", "#5f7048", "#7a8c5a", "#97a870", "#b2c08a"]
P_REDSAND = ["#8e4426", "#a85432", "#bc663c", "#cc7a4a", "#da925c"]
P_DIRT = ["#5a2a1c", "#6e3624", "#82442e", "#965638"]
P_TURQ = ["#14605e", "#22908a", "#38b8ae", "#6ad8cc", "#a8f0e4"]
P_JUNIPER = ["#2a4a44", "#3a625a", "#4e7c70", "#6a9888", "#8ab4a2"]
P_BARK = ["#4a3a30", "#5e4a3c", "#72604e", "#8a7660"]
P_SUN = ["#a8501a", "#e08a2a", "#ffc050", "#fff0a0"]


def _hex(c):
    c = c.lstrip("#")
    return np.array([int(c[i:i + 2], 16) for i in (0, 2, 4)], float)


def _img(a):
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "RGBA")


def strata(pals, seed):
    """Sedimentary rock: horizontal beds of the given palettes, each bed grainy with darker bedding lines,
    the bed boundaries wobbling by a pixel."""
    R = rng(seed)
    a = np.zeros((16, 16, 4), float)
    a[..., 3] = 255
    base = [np.array(T.stone(p, f"{seed}:{i}").convert("RGBA"), float) for i, p in enumerate(pals)]
    a[:] = base[0]
    y = 0
    k = int(R.integers(0, len(pals)))
    bounds = []
    while y < 16:
        h = int(R.integers(3, 7))
        bounds.append((y, min(16, y + h), k))
        y += h
        k = (k + 1 + int(R.integers(0, max(1, len(pals) - 1)))) % len(pals)
    wob = np.round(np.sin(np.arange(16) * R.uniform(0.3, 0.6) + R.uniform(0, 6)) * 0.7).astype(int)
    for x in range(16):
        for (y0, y1, k) in bounds:
            for yy in range(y0, y1):
                ys = min(15, max(0, yy + wob[x]))
                a[ys, x] = base[k][ys, x]
            ys = min(15, max(0, y1 - 1 + wob[x]))
            a[ys, x, :3] = a[ys, x, :3] * 0.82
    return _img(a)


def cracked_clay(pal, seed):
    """Sun-baked mud: flat plates separated by dark polygonal cracks."""
    from gen.noise import worley
    R = rng(seed)
    cols = [_hex(c) for c in pal]
    f1, f2 = worley(16, 16, 6, seed)
    n = R.random((16, 16))
    a = np.zeros((16, 16, 4), float)
    a[..., 3] = 255
    a[..., :3] = cols[2]
    a[n < 0.25, :3] = cols[1]
    a[n > 0.85, :3] = cols[3]
    edge = (f2 - f1) < 0.16
    a[edge, :3] = cols[0]
    lit = np.roll(edge, -1, axis=0) & ~edge
    a[lit, :3] = cols[4]
    return _img(a)


def speckled_egg(pal, seed):
    """A single big speckled egg sitting on the ground (cross sprite)."""
    R = rng(seed)
    a = np.zeros((16, 16, 4), float)
    yy, xx = np.mgrid[0:16, 0:16]
    cx, cy = 7.5, 10.0
    ry = np.where(yy < cy, 5.6, 4.6)
    d = ((xx - cx) / 4.2) ** 2 + ((yy - cy) / ry) ** 2
    m = d < 1.0
    cols = [_hex(c) for c in pal]
    shade = np.clip(((xx - cx) * 0.6 + (yy - cy) * 0.4) / 5 + 0.5, 0, 1)
    idx = np.clip((1 - shade) * 3, 0, 2.99).astype(int)
    for i in range(3):
        a[m & (idx == i), :3] = cols[i + 1]
    a[m, 3] = 255
    sp = m & (R.random((16, 16)) < 0.13)
    a[sp, :3] = cols[0]
    edge = m & ~(np.roll(m, 1, 0) & np.roll(m, -1, 0) & np.roll(m, 1, 1) & np.roll(m, -1, 1))
    a[edge, :3] = cols[0] * 0.8
    return _img(a)


HOODOO = Spire(blocks=[("mesa_rift_redrock", 4), ("mesa_rift_orange_rock", 2), ("mesa_rift_bandstone", 1)],
               cap="mesa_rift_caprock", height=(9, 20), radius=(1, 2), lean=0.08, count=2)
ARCH = Structure(kind="arch", blocks={"main": "mesa_rift_redrock", "alt": "mesa_rift_orange_rock"}, size=(7, 12),
                 params={"height": 1.3}, count=1, chance=6)
JUNIPER = Tree(log="mesa_rift_juniper_log", leaves="mesa_rift_juniper_leaves", shape="acacia", height=(4, 7), count=1)


def _bands():
    """Horizontal strata in the canyon walls: thin ore-veins confined to narrow y windows."""
    out = []
    for (blk, y0, y1) in (("mesa_rift_shale", 47, 50), ("mesa_rift_bandstone", 57, 59), ("mesa_rift_orange_rock", 64, 67),
                          ("mesa_rift_bandstone", 73, 74), ("mesa_rift_orange_rock", 80, 83),
                          ("mesa_rift_bandstone", 89, 91), ("mesa_rift_shale", 96, 97)):
        out.append(Ore(block=blk, replace=["mesa_rift_redrock"], size=48, count=12, y=(y0, y1)))
    return out


BANDS = _bands()

DIMENSION = Dimension(
    id="mesa_rift",
    code="A-23",
    name="Mesa Rift",
    tagline="Red-rock canyons under a wide golden sky",
    description=("A sun-baked world of striped red cliffs cut by deep canyons, with turquoise rivers winding along "
                 "their floors. Hoodoos stand in silent crowds, stone arches span the badlands and condors nest on "
                 "the painted bluffs. Rock lizards bask everywhere - but listen for the rattle before you step over "
                 "a ledge."),
    danger=2,
    color="#c4603a",
    terrain=Terrain(style="canyons", stone="mesa_rift_redrock", sea_level=54, height=98, amplitude=28, scale=1.25,
                    roughness=0.12, deepslate="mesa_rift_shale",
                    params={"depth": 50, "width": 0.5, "step": 6, "biome_size": 300, "cliffs": True,
                            "beach_block": "mesa_rift_red_sand", "beach_height": 2,
                            "ceiling_block": "mesa_rift_redrock"}),
    sky=Sky(sky_color="#5aa6dc", fog_color="#f0bc8a", water_fog_color="#105a58", fog_start=80, fog_end=300,
            cloud_color="#c0fff4e4", cloud_height=230, time="afternoon",
            sky_light_color="#fff0d8",
            bodies=[Celestial("moon", ["#c8b8b0", "#e8dcd4", "#fff8f0"], size=26, yaw=160, pitch=40, alpha=0.75,
                              seed="mesa-daymoon"),
                    Celestial("planet", ["#b8603a", "#e0a070", "#f4d8b0"], size=48, yaw=95, pitch=18, alpha=0.6,
                              seed="mesa-redgiant")]),
    blocks=[
        Block("mesa_rift_redrock", "Redrock", "stone", {"all": tex("terracotta", P_RED, seed="mesa-redrock")},
              hardness=1.4, sound="stone", map_color="terracotta_red"),
        Block("mesa_rift_orange_rock", "Sunset Sandstone", "stone",
              {"all": tex(strata, [P_ORANGE, P_RED], "mesa-orange")}, hardness=1.2, map_color="color_orange"),
        Block("mesa_rift_bandstone", "Bandstone", "stone",
              {"all": tex(strata, [P_CREAM, P_ORANGE, P_CREAM], "mesa-band")}, hardness=1.2,
              map_color="terracotta_white"),
        Block("mesa_rift_shale", "Plum Shale", "stone", {"all": tex(strata, [P_SHALE, P_SHALE[1:] + ["#946e78"]],
                                                                    "mesa-shale")},
              hardness=1.8, sound="deepslate", map_color="terracotta_purple"),
        Block("mesa_rift_caprock", "Caprock", "stone", {"all": tex("rough_stone", P_CREAM, seed="mesa-cap")},
              hardness=2.0, map_color="terracotta_white"),
        Block("mesa_rift_red_sand", "Rift Sand", "sand", {"all": tex("sand", P_REDSAND, seed="mesa-sand")},
              hardness=0.5, sound="sand", map_color="color_orange"),
        Block("mesa_rift_scrub_grass", "Scrub Grass", "grass", {
            "top": tex("grass_top", P_SAGE, seed="mesa-scrub"),
            "side": tex("grass_side", P_SAGE, P_DIRT, seed="mesa-scrub"),
            "bottom": tex("dirt", P_DIRT, seed="mesa-dirt")}, hardness=0.6, map_color="terracotta_green"),
        Block("mesa_rift_red_dirt", "Red Dirt", "soil", {"all": tex("dirt", P_DIRT, seed="mesa-dirt")}, hardness=0.5,
              sound="gravel", map_color="terracotta_red"),
        Block("mesa_rift_cracked_clay", "Cracked Clay", "soil",
              {"all": tex(cracked_clay, ["#4a2216", "#a85a3a", "#bc6e48", "#cc8458", "#dc9c6c"], "mesa-clay")},
              hardness=0.7, sound="packed_mud", map_color="terracotta_orange"),
        Block("mesa_rift_juniper_log", "Juniper Log", "log", {
            "side": tex("log_side", P_BARK, seed="mesa-juniper"),
            "end": tex("log_top", P_BARK, ["#c8a070", "#a88050"], seed="mesa-juniper-top")}, hardness=2.0,
              sound="wood", map_color="color_brown", flammable=True),
        Block("mesa_rift_juniper_leaves", "Juniper Leaves", "leaves",
              {"all": tex("leaves", P_JUNIPER, seed="mesa-juniper-leaves", holes=0.3)}, hardness=0.2, sound="azalea_leaves",
              map_color="color_cyan", flammable=True),
        Block("mesa_rift_sagebrush", "Sagebrush", "plant", {"cross": tex("thorn_bush", P_SAGE, seed="mesa-sage")},
              hardness=0.0, sound="grass", flammable=True),
        Block("mesa_rift_desert_bloom", "Rift Bloom", "plant",
              {"cross": tex("flower", P_SAGE, ["#a02a4a", "#d0406a", "#f070a0", "#ffb0d0"], "mesa-bloom", shape="star",
                            center_hex="#ffd040")},
              hardness=0.0, sound="grass", fruit="mesa_rift_prickly_pear"),
        Block("mesa_rift_turquoise_ore", "Turquoise Vein", "ore",
              {"all": tex("ore", tex("terracotta", P_RED, seed="mesa-redrock"), P_TURQ, seed="mesa-turq")},
              hardness=2.6, drop="mesa_rift_turquoise", drop_count=(1, 2), xp=(2, 5), map_color="terracotta_red"),
        Block("mesa_rift_sunstone", "Sunstone Cluster", "crystal_cluster",
              {"cross": tex("crystal_shard_sprite", P_SUN, seed="mesa-sunstone")}, hardness=1.0, sound="amethyst_cluster",
              light=10, emissive=True, map_color="color_orange"),
        Block("mesa_rift_condor_egg", "Condor Egg", "plant",
              {"cross": tex(speckled_egg, ["#6a5040", "#d8c8b0", "#ece0cc", "#fff8ea"], "mesa-egg")}, hardness=0.3,
              sound="decorated_pot"),
    ],
    items=[
        Item("mesa_rift_turquoise", "Rift Turquoise", tex("item_icon", "gem", P_TURQ, seed="mesa-turq-gem"),
             rarity="uncommon", lore="The colour of the river, if the river were very old and very patient."),
        Item("mesa_rift_prickly_pear", "Prickly Pear", tex("item_icon", "fruit", ["#6a1a3a", "#a02a5a", "#d0407a",
                                                                                   "#f070a0"],
                                                         seed="mesa-pear", accent="#7a9a4a"),
             kind="food", food=Food(4, 0.5, effects=[Effect("minecraft:fire_resistance", 20, 0),
                                                     Effect("minecraft:speed", 15, 0)]),
             lore="Sweet, cool, and only slightly stabby."),
        Item("mesa_rift_rattle", "Serpent Rattle", tex("item_icon", "shell", ["#4a2a14", "#8a5a30", "#c8985a",
                                                                               "#ead0a0"], seed="mesa-rattle"),
             lore="Shake it and every lizard on the mesa freezes."),
    ],
    creatures=[
        Creature("rattle_serpent", "Rattle Serpent", "serpent", ["#b07a44", "#5a3418", "#e8c890", "#ffd040"],
                 pattern="checker", size=0.95,
                 body={"head": "snake", "segments": 7, "seg_w": 4, "seg_len": 5, "taper": 0.6, "rattle": True,
                       "hood": True, "eye_style": "slit", "mouth": "fangs", "head_w": 6},
                 behavior="hostile", health=14, damage=3, speed=0.26, on_hit=Effect("minecraft:poison", 5),
                 abilities=["leap"], drops=[Drop("mesa_rift_rattle", 0, 1, chance=0.6)], sounds="silverfish",
                 pitch=0.6, xp=5, group=1,
                 description="Coils in the shade of the hoodoos. It always rattles first - it is only polite."),
        Creature("rock_lizard", "Rock Lizard", "quadruped", ["#d06a34", "#7a3a1e", "#38b8ae", "#101010"],
                 pattern="spots", size=0.7,
                 body={"stance": "low", "leg_len": 3, "leg_w": 2, "body_len": 13, "body_h": 5, "body_w": 7,
                       "snout": 3, "spikes": 5, "plates": True, "crest": True, "tail": 3, "tail_len": 4,
                       "ears": "none", "eye_style": "round", "head_size": 0.9},
                 behavior="passive", health=10, speed=0.27, tempt="minecraft:spider_eye",
                 drops=[Drop("minecraft:leather", 0, 1)], sounds="armadillo", pitch=1.2, xp=2, group=4,
                 description="Spends all day basking on warm rock, doing push-ups at anyone who walks by."),
        Creature("canyon_condor", "Canyon Condor", "flyer", ["#1e1a1c", "#f0ece4", "#e07a4a", "#100808"],
                 pattern="patches", size=1.5,
                 body={"kind": "bird", "beak": 4, "hooked": True, "neck": 2, "fluffy": True, "wing_span": 20,
                       "wing_w": 7, "tail": 1, "tail_kind": "fan", "head_size": 0.85},
                 behavior="passive", health=16, speed=0.22,
                 drops=[Drop("minecraft:feather", 1, 4)], sounds="parrot", pitch=0.5, xp=3, group=2,
                 description="Rides the canyon updrafts for hours without a single flap of its enormous wings."),
    ],
    biomes=[
        Biome("mesa_rift_sage_mesa", "Sage Mesa", top="mesa_rift_scrub_grass", under="mesa_rift_red_dirt",
              temperature=-0.4, humidity=0.4, elevation=0.5, grass_color="#7a8c5a", foliage_color="#4e7c70",
              water_color="#3ac0bc", water_fog_color="#105a58", ambient="cozy_breeze",
              music="minecraft:music.overworld.badlands",
              features=BANDS + [
                  JUNIPER,
                  Patch(block="mesa_rift_sagebrush", count=4, tries=24),
                  Patch(block="minecraft:short_dry_grass", count=3, tries=24),
                  Patch(block="mesa_rift_desert_bloom", count=1, tries=12),
                  Boulder(blocks=[("mesa_rift_caprock", 2), ("mesa_rift_redrock", 3)], radius=(1, 2), squash=0.7,
                          count=1, chance=3),
                  Ore(block="mesa_rift_turquoise_ore", replace=["mesa_rift_redrock"], size=6, count=4, y=(30, 100)),
              ],
              spawns=[Spawn("rock_lizard", 12, (2, 4)), Spawn("canyon_condor", 4, (1, 2)),
                      Spawn("rattle_serpent", 2, (1, 1))]),
        Biome("mesa_rift_hoodoo_badlands", "Hoodoo Badlands", top="mesa_rift_red_sand", under="mesa_rift_orange_rock",
              temperature=0.6, humidity=-0.4, elevation=0.2, grass_color="#97a870", water_color="#3ac0bc",
              water_fog_color="#105a58", particles=[("minecraft:dust_plume", 0.0015)], ambient="wind_howl",
              music="minecraft:music.overworld.badlands",
              surface_noise=[("mesa_rift_cracked_clay", 0.55)],
              features=BANDS + [
                  HOODOO,
                  ARCH,
                  Vanilla(id="minecraft:patch_cactus_desert", count=1),
                  Patch(block="minecraft:tall_dry_grass", count=2, tries=16),
                  Patch(block="mesa_rift_sagebrush", count=1, tries=12),
                  Ore(block="mesa_rift_turquoise_ore", replace=["mesa_rift_redrock"], size=6, count=4, y=(30, 100)),
              ],
              spawns=[Spawn("rock_lizard", 10, (2, 4)), Spawn("rattle_serpent", 5, (1, 1)),
                      Spawn("canyon_condor", 3, (1, 2))]),
        Biome("mesa_rift_rift_floor", "Rift Floor", top="mesa_rift_red_sand", under="mesa_rift_red_sand",
              temperature=0.1, humidity=0.1, elevation=-0.8, underwater="mesa_rift_red_sand",
              grass_color="#97a870", foliage_color="#6a9888", water_color="#2ed0c4", water_fog_color="#0e6a64",
              fog_color="#e8b080", particles=[("minecraft:white_ash", 0.002)], ambient="cozy_breeze",
              music="minecraft:music.overworld.desert", surface_noise=[("mesa_rift_cracked_clay", 0.35)],
              features=BANDS + [
                  Tree(log="mesa_rift_juniper_log", leaves="mesa_rift_juniper_leaves", shape="bush",
                       height=(2, 3), count=1),
                  Patch(block="minecraft:short_dry_grass", count=4, tries=24),
                  Patch(block="mesa_rift_desert_bloom", count=2, tries=16),
                  Vanilla(id="minecraft:patch_cactus_desert", count=1),
                  Patch(block="mesa_rift_sunstone", count=3, where="cave_floor"),
                  Patch(block="mesa_rift_sunstone", count=2, where="cave_ceiling"),
                  Ore(block="mesa_rift_turquoise_ore", replace=["mesa_rift_redrock"], size=8, count=8, y=(20, 70)),
              ],
              spawns=[Spawn("rock_lizard", 12, (2, 5)), Spawn("rattle_serpent", 3, (1, 1)),
                      Spawn("canyon_condor", 2, (1, 1))]),
        Biome("mesa_rift_painted_bluffs", "Painted Bluffs", top="mesa_rift_bandstone", under="mesa_rift_orange_rock",
              temperature=-0.6, humidity=-0.6, elevation=0.4, grass_color="#97a870", water_color="#3ac0bc",
              water_fog_color="#105a58", fog_color="#f4c8a0", sky_color="#64aee0", ambient="wind_howl",
              music="minecraft:music.overworld.badlands",
              surface_noise=[("mesa_rift_shale", 0.5), ("mesa_rift_red_sand", -0.45)],
              features=BANDS + [
                  Structure(kind="nest", blocks={"main": "mesa_rift_juniper_log", "egg": "mesa_rift_condor_egg"},
                            size=(3, 5), count=1, chance=3),
                  Spire(blocks=[("mesa_rift_bandstone", 2), ("mesa_rift_shale", 1)], cap="mesa_rift_caprock",
                        height=(6, 12), radius=(1, 2), count=1),
                  ARCH,
                  Patch(block="minecraft:short_dry_grass", count=2, tries=16),
                  Patch(block="mesa_rift_desert_bloom", count=1, tries=12),
              ],
              spawns=[Spawn("canyon_condor", 8, (1, 3)), Spawn("rock_lizard", 8, (2, 3)),
                      Spawn("rattle_serpent", 2, (1, 1))]),
    ],
    effects=[],
    ambient="wind_howl",
    music="minecraft:music.overworld.badlands",
    icon="portalgun:mesa_rift_turquoise",
)
