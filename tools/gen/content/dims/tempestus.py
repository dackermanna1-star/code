"""Z-88 Tempestus - a world of perpetual storm: charged black crags, lightning and crackling static fields."""
import math

import numpy as np
from PIL import Image

from gen.content.dsl import *
from gen.noise import fbm, rng

# ------------------------------------------------------------------------------------------------ palette
# near-black charged rock, storm slate, electric cyan, ozone violet and a flash of sulphur yellow
P_STONE = ["#1c2030", "#262a3c", "#30364a", "#3c425a", "#4a516c"]
P_CRAG = ["#101219", "#181b26", "#222634", "#2c3144", "#383e54"]
P_GRASS = ["#2a3c44", "#334a50", "#3e5a5c", "#4a6c68", "#5a8078"]
P_SOIL = ["#26262e", "#2e2e38", "#383844", "#444452"]
P_SAND = ["#3a3a4a", "#4a4a5c", "#5c5c70", "#6e6e84", "#8484a0"]
P_STORM = ["#1a3a8a", "#2a6ad0", "#4aa8ff", "#8fdcff", "#e0f8ff"]
P_FULG = ["#3a3448", "#544a62", "#706482", "#9284a6", "#b8acc8"]
ARC = "#9fe8ff"
ARC_HOT = "#f0ffff"


# ------------------------------------------------------------------------------------------------ helpers
def _hex(c):
    c = c.lstrip("#")
    return np.array([int(c[i:i + 2], 16) for i in (0, 2, 4)], float)


def _arr(img):
    return np.asarray(img.convert("RGBA"), float).copy()


def _img(a):
    return Image.fromarray(np.clip(np.round(a), 0, 255).astype(np.uint8), "RGBA")


def _bolt(a, R, x, y, length, col, k=1.0, branch=0.3, wrap=True, depth=0):
    """A jagged lightning path that may fork."""
    ang = R.uniform(0, 2 * math.pi)
    for s in range(length):
        xi, yi = int(round(x)), int(round(y))
        if wrap:
            xi, yi = xi % 16, yi % 16
        if 0 <= xi < 16 and 0 <= yi < 16:
            a[yi, xi, :3] = a[yi, xi, :3] * (1 - k) + _hex(col) * k
            a[yi, xi, 3] = max(a[yi, xi, 3], 255 * k)
        ang += R.choice([-0.9, -0.5, 0.5, 0.9])
        x += math.cos(ang)
        y += math.sin(ang)
        if depth < 2 and R.random() < branch / 4:
            _bolt(a, R, x, y, max(2, length // 3), col, k * 0.8, branch * 0.5, wrap, depth + 1)


# ------------------------------------------------------------------------------------------------ block textures
def cracked(base, col, seed, bolts=2, k=0.55):
    """Charged stone: faint branching discharge scars over a base texture."""
    a = _arr(base)
    R = rng(seed + ":crack")
    for _ in range(bolts):
        _bolt(a, R, R.uniform(0, 16), R.uniform(0, 16), int(R.integers(6, 11)), col, k)
    return _img(a)


def glinting(base, seed, density=0.03, col=ARC):
    a = _arr(base)
    R = rng(seed + ":glint")
    m = R.random((16, 16)) < density
    a[m, :3] = a[m, :3] * 0.3 + _hex(col) * 0.7
    return _img(a)


def static_field(seed, frame=0):
    """Scorched ground under a crawling web of live electric arcs (animated: the arcs move every frame)."""
    a = np.zeros((16, 16, 4), float)
    a[..., 3] = 255
    n = fbm(16, 16, 4, seed, 2)
    cols = np.array([_hex(c) for c in P_CRAG])
    a[..., :3] = cols[np.clip((n * 4).astype(int), 0, 4)]
    R = rng(f"{seed}:arc{frame}")
    for _ in range(3):
        _bolt(a, R, R.uniform(0, 16), R.uniform(0, 16), int(R.integers(7, 13)), ARC, 0.9, 0.6)
    for _ in range(2):
        x, y = int(R.integers(0, 16)), int(R.integers(0, 16))
        a[y, x, :3] = _hex(ARC_HOT)
    return _img(a)


def vent_top(seed):
    """A blackened discharge vent: a glowing mouth ringed by scorched rock and radiating arcs."""
    a = np.zeros((16, 16, 4), float)
    a[..., 3] = 255
    n = fbm(16, 16, 4, seed, 2)
    cols = np.array([_hex(c) for c in P_CRAG])
    a[..., :3] = cols[np.clip((n * 4).astype(int), 0, 4)]
    yy, xx = np.mgrid[0:16, 0:16]
    d = np.hypot(xx - 7.5, yy - 7.5)
    a[d < 3.2, :3] = _hex("#4aa8ff")
    a[d < 2.0, :3] = _hex(ARC)
    a[d < 1.0, :3] = _hex(ARC_HOT)
    rim = (d >= 3.2) & (d < 4.3)
    a[rim, :3] = _hex("#0a0a10")
    R = rng(seed + ":rays")
    for i in range(5):
        ang = i * 2 * math.pi / 5 + R.uniform(-0.3, 0.3)
        x, y = 7.5 + 4.3 * math.cos(ang), 7.5 + 4.3 * math.sin(ang)
        for s in range(4):
            xi, yi = int(round(x)), int(round(y))
            if 0 <= xi < 16 and 0 <= yi < 16:
                a[yi, xi, :3] = _hex(ARC)
            ang += R.choice([-0.6, 0.6])
            x += math.cos(ang)
            y += math.sin(ang)
    return _img(a)


def fulgurite(seed):
    """Lightning-fused sand glass: glossy violet-grey tubes with bright fused seams."""
    from gen import textures as T
    base = T.basalt_side(P_FULG, seed)
    return cracked(base, "#e8dcff", seed, bolts=2, k=0.45)


# ------------------------------------------------------------------------------------------------ features
STORM_SPIRE = Spire(blocks=[("tempest_crag", 4), ("tempest_stone", 2), ("tempest_fulgurite", 1)], tip="tempest_stormglass",
                    height=(20, 40), radius=(2, 4), lean=0.35, count=1)
STORM_HALO = Structure(kind="ring", blocks={"main": "minecraft:oxidized_cut_copper", "alt": "minecraft:weathered_cut_copper"},
                       size=(6, 9), params={"float": 7, "thickness": 0.11, "sink": 0.0}, count=1, chance=6)
FULGURITE = Spire(blocks=[("tempest_fulgurite", 1)], tip="tempest_spark_cluster", height=(4, 10), radius=(1, 1), lean=0.4,
                  count=2)

DIMENSION = Dimension(
    id="tempestus",
    code="Z-88",
    name="Tempestus",
    tagline="The storm never ends here",
    description=("A planet trapped inside a hurricane that has been raging for a million years. Lightning hammers "
                 "the black crags every few heartbeats, copper halos hum in mid-air and whole fields crackle with "
                 "static that will bite through your boots. Storm Elementals hurl ball lightning from the clouds and "
                 "Thunderbirds guard the peaks - only the Static Slugs seem to enjoy it."),
    danger=4,
    color="#4aa8ff",
    terrain=Terrain(style="mountains", stone="tempest_stone", sea_level=52, height=84, amplitude=55, scale=0.85,
                    roughness=0.5, deepslate="minecraft:deepslate",
                    params={"coverage": 0.62, "peaks": 0.85, "rivers": 0.15, "biome_size": 260, "cliffs": True,
                            "cliff_block": "tempest_crag", "peak_block": "tempest_crag", "peak_y": 150}),
    sky=Sky(sky_color="#2a3048", fog_color="#363d52", water_fog_color="#0a1220", fog_start=20, fog_end=140,
            cloud_color="#ff1a1c28", cloud_height=168, time="afternoon", sky_light_factor=0.8,
            sky_light_color="#8fa0d0", ambient_light=0.1, star_brightness=0.0,
            bodies=[Celestial("galaxy", ["#101422", "#2a3048", "#4a5878", "#8fdcff", "#e0f8ff"], size=260, yaw=0, pitch=89,
                              roll=0, speed=18, alpha=0.85, seed="tempest-eye"),
                    Celestial("nebula", ["#1a3a8a", "#4aa8ff", "#8fdcff", "#c0a0ff"], size=180, yaw=130, pitch=30,
                              alpha=0.35, additive=True, seed="tempest-flash"),
                    Celestial("nebula", ["#2a1a5a", "#6a4ac0", "#8fdcff", "#ffffff"], size=160, yaw=290, pitch=22,
                              alpha=0.3, additive=True, seed="tempest-flash2")]),
    blocks=[
        Block("tempest_stone", "Stormrock", "stone", {"all": tex(cracked, tex("stone", P_STONE, seed="tempest-stone"), "#3a4a78",
                                                                 "tempest-stone")},
              hardness=1.8, resistance=8, map_color="color_black"),
        Block("tempest_crag", "Charged Crag", "stone", {"all": tex(cracked, tex("basalt_side", P_CRAG, seed="tempest-crag"),
                                                                   "#2a5aa0", "tempest-crag", 1, 0.6)},
              hardness=2.2, resistance=9, sound="basalt", map_color="color_black"),
        Block("tempest_storm_grass", "Stormgrass", "grass", {
            "top": tex("grass_top", P_GRASS, seed="tempest-grass"),
            "side": tex("grass_side", P_GRASS, P_SOIL, seed="tempest-grass"),
            "bottom": tex("dirt", P_SOIL, seed="tempest-soil")}, hardness=0.6, sound="grass", map_color="color_cyan"),
        Block("tempest_soil", "Ozone Soil", "soil", {"all": tex("dirt", P_SOIL, seed="tempest-soil")}, hardness=0.5,
              sound="gravel", map_color="color_gray"),
        Block("tempest_static_sand", "Static Sand", "sand", {"all": tex(glinting, tex("sand", P_SAND, seed="tempest-sand"),
                                                                        "tempest-sand", 0.04)},
              hardness=0.5, sound="sand", map_color="color_light_gray", particle="minecraft:electric_spark"),
        Block("tempest_static_field", "Static Field", "hazard", {"all": tex(static_field, "tempest-field", frames=6, frametime=2)},
              hardness=1.2, sound="basalt", damage=1.0, damage_type="lightning", light=6, emissive=True,
              particle="minecraft:electric_spark", map_color="color_blue"),
        Block("tempest_fulgurite", "Fulgurite", "stone", {"all": tex(fulgurite, "tempest-fulgurite")}, hardness=1.4,
              sound="glass", map_color="color_purple"),
        Block("tempest_stormglass", "Stormglass", "crystal_block", {"all": tex("crystal", P_STORM, seed="tempest-stormglass")},
              hardness=1.5, sound="amethyst", light=13, emissive=True, map_color="color_light_blue"),
        Block("tempest_spark_cluster", "Spark Cluster", "crystal_cluster", {"cross": tex("crystal_shard_sprite", P_STORM,
                                                                                         seed="tempest-sparks")},
              hardness=0.6, sound="amethyst_cluster", light=8, emissive=True, map_color="color_light_blue"),
        Block("tempest_thunder_vent", "Thunder Vent", "vent", {"top": tex(vent_top, "tempest-vent"),
                                                               "side": tex(cracked, tex("basalt_side", P_CRAG, seed="tempest-crag"),
                                                                           "#2a5aa0", "tempest-crag", 1, 0.6)},
              hardness=2.0, sound="basalt", light=9, particle="minecraft:electric_spark", effect="minecraft:glowing",
              effect_seconds=10, map_color="color_light_blue"),
        Block("tempest_scorched_shrub", "Scorched Shrub", "plant", {"cross": tex("thorn_bush", ["#0e0e14", "#1e1e28", "#3a3a48", "#5a5a6a"],
                                                                                 seed="tempest-shrub")},
              hardness=0.0, sound="grass", map_color="color_black"),
        Block("tempest_stormbloom", "Stormbloom", "plant", {"cross": tex("flower", ["#1e2a34", "#2e4448", "#46665e"], P_STORM,
                                                                         seed="tempest-bloom", shape="star", center_hex=ARC_HOT)},
              hardness=0.0, sound="grass", light=7, emissive=True, map_color="color_light_blue"),
    ],
    items=[
        Item("tempest_storm_core", "Storm Core", tex("item_icon", "core", ["#1a3a8a", "#4aa8ff", "#e0f8ff"], seed="tempest-core"),
             rarity="rare", glint=True, lore="Crackles when you shake it. Do not shake it."),
        Item("tempest_thunder_feather", "Thunder Feather", tex("item_icon", "feather", ["#1e2a4a", "#ffd23a", "#fff6c0"],
                                                               seed="tempest-feather"),
             rarity="uncommon", lore="Smells of ozone. Your hair stands up when you hold it."),
        Item("tempest_slug_jelly", "Static Jelly", tex("item_icon", "jelly", ["#2a6ad0", "#8fdcff", "#ffe040"], seed="tempest-jelly"),
             kind="food", food=Food(3, 0.4, fast=True, effects=[Effect("minecraft:speed", 20, 1), Effect("minecraft:haste", 20, 0)]),
             lore="Tastes like licking a battery. Gets you moving, though."),
    ],
    creatures=[
        Creature("storm_elemental", "Storm Elemental", "floater", ["#2a2e44", "#454c6c", "#8fdcff", "#e0ffff"],
                 pattern="glow_lines", size=1.2,
                 body={"kind": "ghost", "arms": 2, "body_w": 14, "body_h": 12, "body_d": 12, "eye_style": "glow",
                       "eye_size": 2, "mouth": "open", "horns": "twin", "tentacles": 3},
                 behavior="hostile", attack="ranged",
                 ranged={"color": "#9fe8ff", "damage": 5, "cooldown": 45, "speed": 1.3, "homing": 0.25, "size": 0.4,
                         "particle": "minecraft:electric_spark", "effect": Effect("minecraft:slowness", 3, 0)},
                 health=40, damage=4, speed=0.18, armor=4, abilities=["blink"], spawn_light="any",
                 drops=[Drop("tempest_storm_core", 0, 1, 0.35), Drop("minecraft:glowstone_dust", 0, 2)], sounds="breeze",
                 pitch=0.6, xp=12, group=1, tracking=8,
                 description="A thundercloud with a temper and two glowing eyes. It throws ball lightning."),
        Creature("thunderbird", "Thunderbird", "flyer", ["#1e2a4a", "#ffd23a", "#9fe8ff", "#ffffff"], pattern="stripes",
                 size=1.7,
                 body={"kind": "bird", "wing_span": 16, "crest": True, "beak": 3, "hooked": True, "tail": 2, "tail_kind": "fan",
                       "glow_tips": True, "eye_style": "angry"},
                 behavior="neutral", health=30, damage=6, speed=0.32, on_hit=Effect("minecraft:weakness", 4, 0),
                 drops=[Drop("tempest_thunder_feather", 0, 2), Drop("minecraft:feather", 1, 2)], sounds="phantom", pitch=0.8,
                 xp=8, group=2,
                 description="Rides the storm front with crackling wingtips. Leave its peaks alone."),
        Creature("static_slug", "Static Slug", "snail", ["#3a5aa0", "#ffe040", "#80ffff", "#101010"], pattern="glow_lines",
                 size=0.85, body={"shell_kind": "cone", "crystals": True, "eye_style": "cute", "eyestalks": 2},
                 behavior="passive", health=12, speed=0.08, abilities=["thorns"], tempt="tempest_stormbloom",
                 drops=[Drop("tempest_slug_jelly", 1, 2)], sounds="slime", pitch=1.3, xp=2, group=3,
                 description="Feeds on static. Pet it and your hair will stand on end - hit it and you get the rest."),
    ],
    biomes=[
        Biome("tempest_charged_crags", "Charged Crags", top="tempest_crag", under="tempest_stone", temperature=0.0,
              humidity=0.0, elevation=0.7, grass_color="#2e4448", foliage_color="#26363e", water_color="#1a2a4a",
              water_fog_color="#0a1220", particles=[("minecraft:electric_spark", 0.006), ("minecraft:ash", 0.01)],
              ambient="wind_howl", music="minecraft:music.nether.basalt_deltas",
              features=[
                  STORM_SPIRE,
                  STORM_HALO,
                  CrystalCluster(block="tempest_stormglass", small="tempest_spark_cluster", size=(3, 6), count=1, chance=3),
                  Patch(block="tempest_scorched_shrub", count=2, tries=12),
                  Boulder(blocks=[("tempest_crag", 3), ("tempest_fulgurite", 1)], radius=(2, 3), count=1, chance=3),
              ],
              spawns=[Spawn("storm_elemental", 6, (1, 1)), Spawn("thunderbird", 6, (1, 2)), Spawn("static_slug", 3, (1, 2))]),
        Biome("tempest_static_fields", "Static Fields", top="tempest_static_sand", under="tempest_soil", temperature=0.6,
              humidity=-0.5, elevation=-0.1, underwater="tempest_static_sand", grass_color="#385452",
              foliage_color="#26363e", water_color="#1a3a6a", water_fog_color="#0a1830", fog_color="#2a3048",
              particles=[("minecraft:electric_spark", 0.03), ("dust:#9fe8ff:0.6", 0.004)], ambient="electric_buzz",
              music="minecraft:music.end",
              surface_noise=[("tempest_static_field", 0.62)],
              features=[
                  FULGURITE,
                  Patch(block="tempest_thunder_vent", count=1, tries=4),
                  Patch(block="tempest_stormbloom", count=3, tries=16),
                  Patch(block="tempest_spark_cluster", count=2, tries=12),
                  CrystalCluster(block="tempest_stormglass", small="tempest_spark_cluster", size=(2, 5), count=1, chance=2),
                  STORM_HALO,
              ],
              spawns=[Spawn("static_slug", 10, (2, 3)), Spawn("storm_elemental", 5, (1, 1)), Spawn("thunderbird", 2, (1, 1))]),
        Biome("tempest_rainlash_moor", "Rainlash Moor", top="tempest_storm_grass", under="tempest_soil", temperature=-0.5,
              humidity=0.5, elevation=0.1, grass_color="#2e4448", foliage_color="#26363e", water_color="#1a2a4a",
              water_fog_color="#0a1220", fog_color="#2a3040", fog_end=90,
              particles=[("minecraft:ash", 0.02), ("dust:#9fb0d0:0.5", 0.004)], ambient="wind_howl",
              music="minecraft:music.overworld.old_growth_taiga",
              surface_noise=[("tempest_soil", 0.5)],
              features=[
                  Patch(block="tempest_scorched_shrub", count=5, tries=24),
                  Patch(block="tempest_stormbloom", count=2, tries=16),
                  Patch(block="minecraft:short_grass", count=6, tries=32),
                  Spire(blocks=[("tempest_fulgurite", 1)], tip="tempest_spark_cluster", height=(3, 7), radius=(1, 1),
                        lean=0.5, count=1),
                  Boulder(blocks=[("tempest_stone", 3), ("tempest_crag", 1)], radius=(1, 3), count=1, chance=2),
                  STORM_HALO,
              ],
              spawns=[Spawn("static_slug", 8, (1, 3)), Spawn("thunderbird", 5, (1, 2)), Spawn("storm_elemental", 3, (1, 1))]),
        Biome("tempest_stormwater_basin", "Stormwater Basin", top="tempest_soil", under="tempest_soil", temperature=0.3,
              humidity=0.8, elevation=-0.65, underwater="tempest_static_sand", grass_color="#26363e", foliage_color="#26363e",
              water_color="#14284a", water_fog_color="#06101e", fog_color="#1e2436",
              particles=[("minecraft:electric_spark", 0.008), ("minecraft:ash", 0.008)], ambient="tidal_waves",
              music="minecraft:music.under_water",
              surface_noise=[("tempest_storm_grass", 0.4)],
              features=[
                  Spire(blocks=[("tempest_stormglass", 1), ("tempest_fulgurite", 2)], tip="tempest_spark_cluster",
                        height=(5, 12), radius=(1, 2), where="underwater", count=1, chance=2),
                  Patch(block="tempest_stormbloom", count=2, tries=16),
                  Patch(block="tempest_scorched_shrub", count=2, tries=12),
                  Vanilla(id="minecraft:seagrass_cold"),
              ],
              spawns=[Spawn("static_slug", 8, (1, 2)), Spawn("storm_elemental", 3, (1, 1))]),
    ],
    effects=["lightning"],
    ambient="wind_howl",
    music="minecraft:music.nether.basalt_deltas",
    icon="portalgun:tempest_storm_core",
)
