"""V-0 Shattered Realm - the floating wreckage of a world that broke apart, adrift in a violet void."""
import math

import numpy as np
from PIL import Image

from gen.content.dsl import *
from gen.noise import fbm, rng

# ------------------------------------------------------------------------------------------------ palette
# void violet / obsidian black / rift magenta / ashen lavender ruin stone / pale cyan starlight
P_VOID = ["#1a0f26", "#24152f", "#2e1b3c", "#3a2449", "#4a2f5a"]          # voidstone
P_MOSS = ["#2a1a40", "#3a2458", "#4a2f70", "#5e3a8a", "#7a4aa8"]          # riftmoss
P_DUST = ["#382c48", "#46385a", "#56466c", "#685a80"]                     # void dust
P_RUIN = ["#6e6680", "#857c98", "#9c94ae", "#b4adc4", "#ccc6da"]          # ashen ruin bricks
P_OBSID = ["#0c0812", "#16101f", "#22182e", "#33244a", "#5a3a80"]         # rift obsidian
P_RIFT = ["#7a1a8a", "#b02cc0", "#e040f0", "#ff7aff", "#ffd0ff"]          # rift crystal
P_PETRI = ["#3e3848", "#544c60", "#6a6278", "#827a90"]                    # petrified bark
P_CRYLEAF = ["#3a2470", "#5a34a0", "#7a4ad0", "#a070f0", "#d0b0ff"]       # crystal leaves
P_STAR = ["#6ad8ff", "#c0f0ff", "#ffffff"]


def _hex(c):
    c = c.lstrip("#")
    return np.array([int(c[i:i + 2], 16) for i in (0, 2, 4)], float)


def _arr(img):
    return np.asarray(img.convert("RGBA"), float).copy()


def _img(a):
    return Image.fromarray(np.clip(np.round(a), 0, 255).astype(np.uint8), "RGBA")


def starry(base, star_pal, seed, stars=5):
    """The void seeps into the stone: a few tiny cold star specks (1px, some with a 4-point glint)."""
    a = _arr(base)
    cols = [_hex(c) for c in star_pal]
    R = rng(seed + ":stars")
    for k in range(stars):
        x, y = int(R.integers(1, 15)), int(R.integers(1, 15))
        c = cols[int(R.integers(0, len(cols)))]
        a[y, x, :3] = c
        if k % 3 == 0:
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                a[y + dy, x + dx, :3] = a[y + dy, x + dx, :3] * 0.5 + c * 0.35
    return _img(a)


def rift_cracks(base, glow_pal, seed, cracks=2):
    """Jagged glowing fissures (bright core, darker magenta rim) zig-zagging across a texture."""
    a = _arr(base)
    cols = [_hex(c) for c in glow_pal]
    R = rng(seed + ":cracks")
    for k in range(cracks):
        x, y = float(R.integers(0, 16)), float(R.integers(0, 16))
        ang = R.uniform(0, 2 * math.pi)
        for step in range(int(R.integers(10, 18))):
            xi, yi = int(round(x)) % 16, int(round(y)) % 16
            a[yi, xi, :3] = cols[3] if step % 4 else cols[4]
            for dx, dy in ((1, 0), (0, 1)):
                nx, ny = (xi + dx) % 16, (yi + dy) % 16
                if not np.allclose(a[ny, nx, :3], cols[3]) and not np.allclose(a[ny, nx, :3], cols[4]):
                    a[ny, nx, :3] = a[ny, nx, :3] * 0.4 + cols[1] * 0.6
            ang += R.choice([-1.0, 1.0]) * R.uniform(0.4, 1.1)
            x += math.cos(ang)
            y += math.sin(ang)
    return _img(a)


def void_bloom(pal, seed):
    """A star-shaped void flower on a thin dark stalk: petals of rift light around a cold white core."""
    out = np.zeros((16, 16, 4), float)
    cols = [_hex(c) for c in pal]
    R = rng(seed)
    stem = _hex("#2a1a40")
    sx = 8
    for y in range(8, 16):
        xx = sx + (1 if (y % 5 == 0 and y < 14) else 0)
        out[y, xx, :3] = stem
        out[y, xx, 3] = 255
    for lx, ly, d in ((sx - 1, 12, -1), (sx + 1, 10, 1)):          # two small leaves
        out[ly, lx, :3] = _hex("#4a2f70")
        out[ly, lx, 3] = 255
        out[ly - 1, lx + d, :3] = _hex("#5e3a8a")
        out[ly - 1, lx + d, 3] = 255
    cx, cy = 8, 5
    yy, xx = np.mgrid[0:16, 0:16]
    ang = np.arctan2(yy - cy, xx - cx)
    r = np.hypot(xx - cx, yy - cy)
    petals = 5
    phase = R.uniform(0, math.pi)
    reach = 2.2 + 2.6 * np.abs(np.cos((ang + phase) * petals / 2)) ** 3
    m = (r <= reach) & (yy <= 10)
    shade = np.clip(r / 5.0, 0, 0.999)
    idx = (3 - shade * 3).astype(int)
    for i in range(4):
        sel = m & (idx == i)
        out[sel, :3] = cols[i + 1]
        out[sel, 3] = 255
    out[cy, cx, :3] = _hex("#ffffff")
    out[cy, cx, 3] = 255
    return _img(out)


# ------------------------------------------------------------------------------------------------ features
# every island fragment hangs over nothing: obsidian roots, glowing rift shards and void tendrils underneath
UNDERSIDE = [
    Spire(blocks=[("shattered_rift_obsidian", 4), ("shattered_voidstone", 3)], tip="shattered_rift_crystal",
          height=(10, 26), radius=(2, 4), lean=0.35, hanging=True, where="cave_ceiling", count=2),
    CrystalCluster(block="shattered_rift_crystal", small="shattered_rift_shard", size=(2, 5), where="cave_ceiling", count=1),
    Patch(block="shattered_void_tendrils", where="cave_ceiling", count=5, tries=32),
]
# the signature landmark: colossal obsidian shards rammed into the islands at crazy angles
GREAT_SHARD = Spire(blocks=[("shattered_rift_obsidian", 6), ("minecraft:crying_obsidian", 1)], tip="shattered_rift_crystal",
                    height=(24, 42), radius=(3, 5), lean=0.55, count=1, chance=3)
SMALL_SHARDS = Spire(blocks=[("shattered_rift_obsidian", 5), ("shattered_voidstone", 1)], tip="shattered_rift_crystal",
                     height=(6, 14), radius=(1, 2), lean=0.7, count=2)
# floating debris drifting in the void between the islands
VOID_DEBRIS = Boulder(blocks=[("shattered_voidstone", 5), ("shattered_rift_obsidian", 2), ("shattered_ruin_bricks", 2)],
                      radius=(2, 4), squash=0.8, where="air", y=(60, 190), count=1, chance=2)
# floating ruins: tumbled masonry blocks with a cloud of loose bricks orbiting them
FLOATING_RUIN = Structure(kind="cuboids", blocks={"main": "shattered_ruin_bricks", "alt": "shattered_riftscarred_bricks"},
                          size=(5, 9), params={"float": 7, "scatter": 5}, count=1, chance=5)
BROKEN_ARCH = Structure(kind="arch", blocks={"main": "shattered_ruin_bricks", "alt": "shattered_riftscarred_bricks"},
                        size=(6, 11), params={"height": 1.3}, count=1, chance=4)
HOVER_MONOLITH = Structure(kind="monolith", blocks={"main": "shattered_rift_obsidian"}, size=(12, 20),
                           params={"float": 5}, count=1, chance=9)

DIMENSION = Dimension(
    id="shattered",
    code="V-0",
    name="Shattered Realm",
    tagline="The broken pieces of a world, adrift in the void",
    description=("Something cracked this world like an egg: what remains are islands of torn earth drifting in an "
                 "endless violet void, pierced by obsidian shards the size of towers and littered with the floating "
                 "ruins of whoever lived here. Rift crystals glow in the cracks and Void Jellies drift between the "
                 "fragments - their gel will save you from a long fall. Rift Stalkers step out of thin air and Shard "
                 "Wraiths hurl splinters of the broken sky; one bad step and the void takes you."),
    danger=4,
    color="#c040ff",
    terrain=Terrain(style="sky_islands", stone="shattered_voidstone", fluid="minecraft:air", sea_level=-64, height=118,
                    amplitude=14, roughness=0.55, caves=False, ores=True, deepslate=None,
                    params={"layers": 3, "coverage": 0.2, "thickness": 44, "spacing": 52, "island_size": 0.8,
                            "debris": 0.85, "springs": 0, "biome_size": 260,
                            "cliff_block": "shattered_voidstone", "ceiling_block": "shattered_voidstone"}),
    sky=Sky(sky_color="#1e0f36", fog_color="#2a1446", fog_start=40, fog_end=200, cloud_color=None, time="midnight",
            skybox="end", star_brightness=1.0, ambient_light=0.32, sky_light_color="#d0a8ff",
            bodies=[
                Celestial("shattered_moon", ["#4a3a6a", "#a890d0", "#f0e0ff", "#ff7aff"], size=95, yaw=200, pitch=38,
                          roll=12, speed=2, seed="shattered-moon"),
                Celestial("nebula", ["#2a0a40", "#8a20b0", "#e040f0", "#ffd0ff"], size=220, yaw=30, pitch=50,
                          alpha=0.55, additive=True, seed="shattered-rift-nebula"),
                Celestial("black_hole", ["#000000", "#5a1a8a", "#ff7aff", "#ffffff"], size=40, yaw=320, pitch=22,
                          roll=-25, alpha=0.9, seed="shattered-rift-eye"),
            ]),
    blocks=[
        Block("shattered_riftmoss", "Riftmoss", "grass", {
            "top": tex(starry, tex("grass_top", P_MOSS, seed="shattered-moss"), ["#ff7aff", "#e040f0"], "shattered-moss", 3),
            "side": tex("grass_side", P_MOSS, P_DUST, seed="shattered-moss"),
            "bottom": tex("dirt", P_DUST, seed="shattered-dust")}, hardness=0.7, sound="moss", map_color="color_purple"),
        Block("shattered_void_dust", "Void Dust", "soil", {"all": tex("ash", P_DUST, seed="shattered-dust")}, hardness=0.5,
              sound="sand", map_color="color_gray"),
        Block("shattered_voidstone", "Voidstone", "stone", {
            "all": tex(starry, tex("stone", P_VOID, seed="shattered-voidstone"), P_STAR, "shattered-voidstone", 5)},
              hardness=2.0, resistance=8.0, sound="deepslate", map_color="color_black"),
        Block("shattered_rift_obsidian", "Rift Obsidian", "stone", {
            "all": tex("obsidian_like", P_OBSID, seed="shattered-obsidian")}, hardness=8.0, resistance=600.0,
              sound="basalt", map_color="color_black"),
        Block("shattered_ruin_bricks", "Ashen Ruin Bricks", "stone", {
            "all": tex("bricks", P_RUIN, seed="shattered-ruin", mortar="dark")}, hardness=2.0, resistance=6.0,
              sound="deepslate_bricks", map_color="color_light_gray"),
        Block("shattered_riftscarred_bricks", "Riftscarred Bricks", "stone", {
            "all": tex(rift_cracks, tex("bricks", P_RUIN, seed="shattered-ruin2", mortar="dark"), P_RIFT, "shattered-scar", 2)},
              hardness=2.0, resistance=6.0, sound="deepslate_bricks", light=5, map_color="color_magenta"),
        Block("shattered_rift_crystal", "Rift Crystal", "crystal_block", {
            "all": tex("crystal", P_RIFT, seed="shattered-rift", shards=8)}, hardness=1.5, sound="amethyst", light=13,
              emissive=True, map_color="color_magenta"),
        Block("shattered_rift_shard", "Rift Shard", "crystal_cluster", {
            "cross": tex("crystal_shard_sprite", P_RIFT, seed="shattered-shard", count=3)}, hardness=0.5,
              sound="amethyst_cluster", light=9, emissive=True, map_color="color_magenta"),
        Block("shattered_petrified_log", "Petrified Wood", "log", {
            "side": tex("log_side", P_PETRI, seed="shattered-petri"),
            "end": tex("log_top", P_PETRI, ["#9a92a8", "#7a7290"], seed="shattered-petri-end")}, hardness=3.0,
              sound="tuff", tool="pickaxe", map_color="color_gray"),
        Block("shattered_crystal_leaves", "Amethyst Foliage", "leaves", {
            "all": tex("leaves", P_CRYLEAF, seed="shattered-leaves", holes=0.35)}, hardness=0.3, sound="amethyst_cluster",
              light=4, map_color="color_purple"),
        Block("shattered_void_bloom", "Void Bloom", "plant", {"cross": tex(void_bloom, P_RIFT, "shattered-bloom")},
              hardness=0.0, sound="spore_blossom", light=7, emissive=True, particle="minecraft:reverse_portal",
              map_color="color_magenta"),
        Block("shattered_void_tendrils", "Void Tendrils", "hanging_plant", {
            "cross": tex("tendril", ["#1a0f26", "#4a2f70", "#c040f0"], seed="shattered-tendril")}, hardness=0.0,
              sound="weeping_vines", light=3, map_color="color_purple"),
        Block("shattered_rift_fissure", "Rift Fissure", "vent", {
            "top": tex(rift_cracks, tex("obsidian_like", P_OBSID, seed="shattered-fissure"), P_RIFT, "shattered-fissure", 3),
            "side": tex("stone", P_VOID, seed="shattered-voidstone2")}, hardness=3.0, sound="deepslate",
              particle="minecraft:reverse_portal", effect="minecraft:levitation", effect_seconds=1.5, effect_amplifier=1,
              light=6, map_color="color_magenta"),
    ],
    items=[
        Item("shattered_void_gel", "Void Jelly Gel", tex("item_icon", "jelly", ["#2a3a8a", "#5a7ae0", "#b0e0ff"],
                                                         seed="shattered-gel"),
             kind="food", food=Food(3, 0.4, always=True, fast=True,
                                    effects=[Effect("minecraft:slow_falling", 45, 0), Effect("minecraft:night_vision", 45, 0)]),
             rarity="uncommon", lore="Eat it before the jump. It remembers what falling gently felt like."),
        Item("shattered_wraith_splinter", "Wraith Splinter", tex("item_icon", "shard", P_RIFT, seed="shattered-splinter"),
             lore="A sliver of the broken sky. It hums in the key of the void."),
        Item("shattered_rift_heart", "Rift Heart", tex("item_icon", "core", ["#1a0a2a", "#8a20b0", "#e040f0", "#ffd0ff"],
                                                       seed="shattered-heart"),
             rarity="epic", glint=True, lore="Still beating. Every beat is a tiny tear in the world."),
    ],
    creatures=[
        Creature("rift_stalker", "Rift Stalker", "biped", ["#120a1c", "#2e1b46", "#ff3df0", "#ffb0ff", "#5a2a8a"],
                 pattern="veins", size=1.3,
                 body={"thin": True, "arms": 2, "arm_len": 19, "leg_len": 17, "torso_w": 7, "torso_h": 11, "torso_d": 4,
                       "head": "long", "head_size": 0.9, "eyes": 1, "eye_size": 3, "eye_style": "glow", "mouth": "none",
                       "claws": True, "core": True, "crystals": 4, "spikes": 4, "stance": "hunched"},
                 behavior="hostile", health=44, damage=8, speed=0.31, armor=4, abilities=["teleport", "blink"],
                 on_hit=Effect("minecraft:darkness", 5), spawn_light="dark",
                 drops=[Drop("shattered_rift_heart", 0, 1, chance=0.18), Drop("minecraft:ender_pearl", 0, 1, chance=0.5),
                        Drop("minecraft:obsidian", 0, 1, chance=0.3)],
                 sounds="enderman", pitch=0.55, xp=14, group=1, tracking=8,
                 description="It steps out of a crack in the air behind you. Its single eye is the colour of the rifts."),
        Creature("shard_wraith", "Shard Wraith", "floater", ["#8a70c0", "#c8b0f0", "#ff5af0", "#ffe0ff", "#e0d0ff"],
                 pattern="crystal", size=1.15,
                 body={"kind": "ghost", "translucent": True, "arms": 2, "spikes": 5, "crystals": 3, "eye_style": "glow",
                       "eyes": 2, "mouth": "open", "body_w": 9, "body_h": 12, "body_d": 6},
                 behavior="hostile", attack="ranged", health=24, damage=4, speed=0.28, abilities=["blink"],
                 ranged={"color": "#ff7aff", "damage": 4, "count": 3, "spread": 0.25, "cooldown": 55, "speed": 1.3,
                         "size": 0.3, "particle": "minecraft:reverse_portal", "effect": Effect("minecraft:slowness", 3)},
                 spawn_light="dark", emissive=False,
                 drops=[Drop("shattered_wraith_splinter", 1, 2), Drop("minecraft:amethyst_shard", 0, 2)],
                 sounds="vex", pitch=0.5, xp=10, group=2,
                 description="A ghost made of the sky's broken glass. It throws pieces of itself - and they hurt."),
        Creature("void_jelly", "Void Jelly", "floater", ["#2a3a8a", "#6a8ae8", "#c0f0ff", "#0a0a20", "#e040f0"],
                 pattern="glow_lines", size=1.35,
                 body={"kind": "jelly", "translucent": True, "tentacles": 10, "tentacle_len": 16, "bell_w": 14,
                       "bell_h": 9, "eye_style": "sleepy", "blush": False},
                 behavior="passive", health=14, speed=0.1, emissive=True, abilities=["glow_aura"],
                 drops=[Drop("shattered_void_gel", 1, 2), Drop("minecraft:phantom_membrane", 0, 1, chance=0.3)],
                 sounds="squid", pitch=0.7, xp=4, group=3, tracking=10,
                 description="A drifting lantern of the void. Its light helps lost travellers see the next island."),
    ],
    biomes=[
        Biome("shattered_fractured_expanse", "Fractured Expanse", top="shattered_riftmoss", under="shattered_void_dust",
              temperature=0.0, humidity=0.0, grass_color="#5e3a8a", foliage_color="#7a4ad0",
              water_color="#5a3aa0", water_fog_color="#1a0a30",
              particles=[("minecraft:reverse_portal", 0.006), ("dust:#e040f0:0.8", 0.003)], ambient="dark_void",
              music="minecraft:music.end",
              surface_noise=[("shattered_void_dust", 0.55)],
              features=[
                  GREAT_SHARD, SMALL_SHARDS,
                  Tree(log="shattered_petrified_log", leaves="shattered_crystal_leaves", shape="twisted", height=(5, 9),
                       count=1, chance=2),
                  Patch(block="shattered_void_bloom", count=3, tries=16),
                  Patch(blocks=[("shattered_rift_shard", 1)], count=1, tries=8),
                  BROKEN_ARCH,
                  VOID_DEBRIS,
                  *UNDERSIDE,
              ],
              spawns=[Spawn("void_jelly", 10, (1, 3)), Spawn("rift_stalker", 3, (1, 1)), Spawn("shard_wraith", 3, (1, 2))]),
        Biome("shattered_ruined_citadel", "Ruined Citadel", top="shattered_void_dust", under="shattered_void_dust",
              temperature=0.75, humidity=-0.5, grass_color="#4a2f70", foliage_color="#7a4ad0",
              fog_color="#30203c", particles=[("minecraft:ash", 0.01), ("minecraft:reverse_portal", 0.003)],
              ambient="eerie_choir", music="minecraft:music_disc.11",
              surface_noise=[("shattered_ruin_bricks", 0.62), ("shattered_riftmoss", 0.35)],
              features=[
                  Structure(kind="cuboids", blocks={"main": "shattered_ruin_bricks", "alt": "shattered_riftscarred_bricks"},
                            size=(6, 11), params={"scatter": 3}, count=1, chance=3),
                  FLOATING_RUIN,
                  Structure(kind="arch", blocks={"main": "shattered_ruin_bricks", "alt": "shattered_riftscarred_bricks"},
                            size=(7, 12), params={"height": 1.4}, count=1, chance=2),
                  HOVER_MONOLITH,
                  Boulder(blocks=[("shattered_ruin_bricks", 3), ("shattered_riftscarred_bricks", 1)], radius=(1, 2),
                          squash=0.7, count=2),
                  Patch(block="shattered_void_bloom", count=1, tries=8),
                  VOID_DEBRIS,
                  *UNDERSIDE,
              ],
              spawns=[Spawn("rift_stalker", 5, (1, 1)), Spawn("shard_wraith", 3, (1, 1)), Spawn("void_jelly", 6, (1, 2))]),
        Biome("shattered_rift_scar", "Rift Scar", top="shattered_rift_obsidian", under="shattered_voidstone",
              temperature=-0.7, humidity=0.4, grass_color="#7a4aa8", foliage_color="#e040f0", fog_color="#3a1050",
              fog_end=140, particles=[("minecraft:portal", 0.03), ("dust:#ff7aff:1.0", 0.006)], ambient="cosmic_drone",
              music="minecraft:music.end",
              surface_noise=[("shattered_voidstone", 0.4)],
              features=[
                  CrystalCluster(block="shattered_rift_crystal", small="shattered_rift_shard", size=(5, 11), count=1),
                  Patch(block="shattered_rift_fissure", count=2, tries=6),
                  Patch(block="shattered_rift_shard", count=3, tries=16),
                  Spire(blocks=[("shattered_rift_crystal", 1), ("shattered_rift_obsidian", 3)], tip="shattered_rift_crystal",
                        height=(12, 24), radius=(1, 3), lean=0.45, count=1, chance=2),
                  GREAT_SHARD,
                  VOID_DEBRIS,
                  *UNDERSIDE,
              ],
              spawns=[Spawn("shard_wraith", 6, (1, 2)), Spawn("void_jelly", 6, (1, 2)), Spawn("rift_stalker", 2, (1, 1))]),
        Biome("shattered_withered_grove", "Withered Grove", top="shattered_riftmoss", under="shattered_void_dust",
              temperature=0.1, humidity=-0.95, grass_color="#4a2f70", foliage_color="#a070f0",
              particles=[("minecraft:end_rod", 0.0015), ("dust:#a070f0:0.7", 0.004)], ambient="alien_hum",
              music="minecraft:music.end",
              features=[
                  Tree(log="shattered_petrified_log", leaves="shattered_crystal_leaves", shape="twisted", height=(6, 11),
                       count=3),
                  GiantPlant(stem="shattered_petrified_log", head="shattered_crystal_leaves", shape="puff", height=(9, 15),
                             radius=(3, 5), decoration="shattered_void_tendrils", bend=0.35, count=1, chance=2),
                  Patch(block="shattered_void_bloom", count=5, tries=24),
                  SMALL_SHARDS,
                  *UNDERSIDE,
              ],
              spawns=[Spawn("void_jelly", 14, (2, 3)), Spawn("rift_stalker", 2, (1, 1))]),
    ],
    effects=["floaty"],
    platform="shattered_rift_obsidian",
    ambient="dark_void",
    music="minecraft:music.end",
    icon="portalgun:shattered_rift_heart",
)
