"""P-3 Orbitas - tiny planets floating in starry space under a ringed gas giant."""
from gen.content.dsl import *

# palette: deep space indigo, star teal grass, magma orange, comet ice cyan, stardust gold, gas giant cream
P_GRASS = ["#1a5a5a", "#227a6e", "#2e9a7e", "#46ba8a", "#7ad8a0"]
P_SOIL = ["#2a1e3a", "#3a2a4a", "#4a3858", "#5a4668"]
P_ROCK = ["#3a3644", "#4a4656", "#5c5868", "#6e6a7a", "#827e8e"]
P_ICE = ["#6ab0d8", "#8ac8e8", "#aadcf4", "#d0f0ff"]
P_SNOW = ["#8a9cc8", "#a8b8e0", "#c8d4f0", "#eef4ff"]
P_GOLD = ["#8a5a10", "#c08a20", "#f0c040", "#ffe68a", "#fffae0"]
P_BARK = ["#3a2a3a", "#4e3a48", "#644a5a", "#7a5c6c"]
P_CANOPY = ["#2a4a6a", "#3a6a8a", "#4e8aa8", "#70b0c8"]
STARDUST = "#ffd860"
SPACE = "#06041a"


def _hex(c):
    c = c.lstrip("#")
    return [int(c[i:i + 2], 16) for i in (0, 2, 4)]


def _star_grass(pal, seed):
    """Teal grass top sprinkled with a few tiny bright star flecks."""
    import numpy as np
    from PIL import Image
    from gen.noise import rng
    from gen.textures import grass_top
    a = np.asarray(grass_top(pal, seed).convert("RGBA"), float).copy()
    r = rng(seed + ":stars")
    for k in range(4):
        x, y = int(r.integers(0, 16)), int(r.integers(0, 16))
        a[y, x, :3] = [255, 250, 210] if k % 2 else [210, 255, 250]
    return Image.fromarray(a.clip(0, 255).astype("uint8"), "RGBA")


def _magma_crust(seed, frames=1):
    """Black crust plates split by glowing orange cracks that slowly pulse."""
    import math
    import numpy as np
    from PIL import Image
    from gen.noise import rng
    r = rng(seed)
    pts = r.random((9, 2)) * 16
    dark = [np.array(_hex(c), float) for c in ("#1a1214", "#2a1e1e", "#3a2a26", "#4a3630")]
    hot = [np.array(_hex(c), float) for c in ("#a02a08", "#ff6a10", "#ffc040", "#fff0a0")]
    f1 = np.zeros((16, 16))
    f2 = np.zeros((16, 16))
    for y in range(16):
        for x in range(16):
            ds = []
            for px, py in pts:
                for ox in (-16, 0, 16):
                    for oy in (-16, 0, 16):
                        ds.append(math.hypot(x + 0.5 - px - ox, y + 0.5 - py - oy))
            ds.sort()
            f1[y, x], f2[y, x] = ds[0], ds[1]
    edge = f2 - f1
    grain = r.random((16, 16))
    out = []
    n = max(1, frames)
    for k in range(n):
        pulse = 0.5 + 0.5 * math.sin(2 * math.pi * k / n)
        a = np.zeros((16, 16, 4))
        a[..., 3] = 255
        for y in range(16):
            for x in range(16):
                if edge[y, x] < 1.1:
                    t = 1 - edge[y, x] / 1.1
                    i = min(3, int(t * 2.2 + pulse * 1.2))
                    a[y, x, :3] = hot[i]
                else:
                    i = min(3, int(grain[y, x] * 2 + (1 - min(1, f1[y, x] / 6)) * 1.6))
                    a[y, x, :3] = dark[i]
        out.append(Image.fromarray(a.clip(0, 255).astype("uint8"), "RGBA"))
    return out if frames > 1 else out[0]


DIMENSION = Dimension(
    id="orbitas",
    code="P-3",
    name="Orbitas",
    tagline="A thousand tiny worlds, one giant sky",
    description=("Space, but cosy: hundreds of tiny planets hang in the starry dark, each one its own little world - "
                 "grassy ones with baobab trees, molten ones with cracked glowing crusts, icy ones bristling with comet "
                 "spikes, and bare asteroids studded with stardust ore. The air is thin and gravity is gentle, so you "
                 "can almost jump between them. Void Rays glide past like ships; Comet Imps pelt you with ice. Do not "
                 "miss the jump."),
    danger=3,
    color=STARDUST,
    terrain=Terrain(style="planetoids", stone="orbitas_asteroid_rock", fluid="minecraft:air", sea_level=-63, height=100,
                    amplitude=30, roughness=0.15, caves=False, bedrock_floor=False, ores=True,
                    params={"cell_size": 46, "min_radius": 6, "max_radius": 16, "probability": 0.78, "y_min": 70,
                            "y_max": 140, "shape": "sphere", "biome_size": 150}),
    sky=Sky(sky_color=SPACE, fog_color="#0c0828", fog_start=110, fog_end=360, cloud_color=None, time="midnight",
            star_brightness=1.0, ambient_light=0.5, sky_light_color="#c8c0ff",
            bodies=[
                Celestial("ringed_planet", ["#6a3a1a", "#d08a4a", "#f4d8a0", "#fff4e0"], size=105, yaw=160, pitch=40,
                          roll=-18, seed="orbitas-giant"),
                Celestial("nebula", ["#1a0a40", "#6a2ab0", "#40c0d0", "#e0f0ff"], size=160, yaw=320, pitch=55, alpha=0.5,
                          additive=True, seed="orbitas-nebula"),
                Celestial("galaxy", ["#100a30", "#8a6ad0", "#fff0d0"], size=60, yaw=60, pitch=25, roll=30, alpha=0.8,
                          additive=True, seed="orbitas-galaxy"),
                Celestial("comet", ["#4080ff", "#a0e0ff", "#ffffff"], size=60, yaw=250, pitch=65, roll=40, speed=20,
                          additive=True, seed="orbitas-comet"),
                Celestial("planet", ["#1a3a6a", "#4a8ad0", "#c0e8ff"], size=26, yaw=20, pitch=72, seed="orbitas-blue"),
            ]),
    blocks=[
        Block("orbitas_star_grass", "Star Grass", "grass", {
            "top": tex(_star_grass, P_GRASS, "orbitas-grass"),
            "side": tex("grass_side", P_GRASS, P_SOIL, seed="orbitas-grass"),
            "bottom": tex("dirt", P_SOIL, seed="orbitas-soil")}, hardness=0.6, sound="grass", map_color="color_cyan"),
        Block("orbitas_planet_soil", "Planet Soil", "soil", {"all": tex("dirt", P_SOIL, seed="orbitas-soil")}, hardness=0.5,
              sound="gravel", map_color="color_purple"),
        Block("orbitas_asteroid_rock", "Asteroid Rock", "stone", {"all": tex("stone", P_ROCK, seed="orbitas-rock")},
              hardness=1.5, map_color="stone"),
        Block("orbitas_magma_crust", "Magma Crust", "hazard", {"all": tex(_magma_crust, "orbitas-magma", frames=12,
                                                                         frametime=4)},
              hardness=1.2, sound="basalt", light=9, emissive=True, damage=1.0, damage_type="hot_floor",
              tool="pickaxe", map_color="nether"),
        Block("orbitas_comet_ice", "Comet Ice", "ice", {"all": tex("ice", P_ICE, seed="orbitas-ice")}, hardness=0.6,
              sound="glass", friction=0.98, light=2, map_color="ice"),
        Block("orbitas_comet_snow", "Comet Snow", "soil", {"all": tex("snow", P_SNOW, seed="orbitas-snow")}, hardness=0.3,
              sound="snow", map_color="snow"),
        Block("orbitas_stardust_ore", "Stardust Ore", "ore",
              {"all": tex("ore", tex("stone", P_ROCK, seed="orbitas-rock"), P_GOLD[1:], seed="orbitas-stardust")},
              hardness=3.0, light=6, emissive=True, drop="orbitas_stardust", drop_count=(1, 3), xp=(2, 6),
              map_color="gold"),
        Block("orbitas_star_crystal", "Star Crystal", "crystal_block", {"all": tex("crystal", P_GOLD, seed="orbitas-crystal")},
              hardness=1.5, light=12, emissive=True, map_color="gold"),
        Block("orbitas_star_cluster", "Star Cluster", "crystal_cluster",
              {"cross": tex("crystal_shard_sprite", P_GOLD, seed="orbitas-cluster", count=3)}, hardness=0.5, light=9,
              emissive=True, sound="amethyst_cluster"),
        Block("orbitas_baobab_log", "Baobab Log", "log", {
            "side": tex("log_side", P_BARK, seed="orbitas-bark"),
            "end": tex("log_top", P_BARK, ["#a08090", "#c0a0b0"], seed="orbitas-bark-end")}, hardness=2.0, sound="wood",
              flammable=True, map_color="color_purple"),
        Block("orbitas_baobab_leaves", "Baobab Canopy", "leaves", {"all": tex("leaves", P_CANOPY, seed="orbitas-canopy",
                                                                             holes=0.2)},
              hardness=0.2, sound="leaves", map_color="color_blue"),
        Block("orbitas_starfruit_bush", "Starfruit Bush", "plant",
              {"cross": tex("berry_bush", P_GRASS, STARDUST, seed="orbitas-bush")}, hardness=0.0, sound="sweet_berry_bush",
              light=4, fruit="orbitas_starfruit"),
    ],
    items=[
        Item("orbitas_starfruit", "Starfruit", tex("item_icon", "star", P_GOLD[1:], seed="orbitas-starfruit"), kind="food",
             food=Food(4, 0.5, always=True, effects=[Effect("minecraft:slow_falling", 30, 0),
                                                     Effect("minecraft:jump_boost", 30, 1)]),
             lore="Tastes like a wish. Eat one before you jump."),
        Item("orbitas_stardust", "Stardust", tex("item_icon", "dust", P_GOLD[1:], seed="orbitas-dust"), rarity="uncommon",
             glint=True, lore="Swept up from the floor of the universe."),
        Item("orbitas_comet_shard", "Comet Shard", tex("item_icon", "shard", ["#2a4a8a", "#9af0ff", "#ffffff"],
                                                       seed="orbitas-shard"),
             rarity="uncommon", lore="Still cold enough to burn."),
    ],
    creatures=[
        Creature("void_ray", "Void Ray", "swimmer", ["#3a3a9a", "#6a5ad0", "#9af0ff", "#ffffff"], pattern="glow_lines",
                 size=2.6, body={"kind": "ray", "wing_span": 20, "body_len": 14},
                 behavior="passive", health=40, speed=0.16, armor=2, movement="flying", placement="air",
                 category="creature", abilities=["glow_aura"],
                 drops=[Drop("orbitas_stardust", 1, 3), Drop("minecraft:phantom_membrane", 0, 1)],
                 sounds="dolphin", pitch=0.5, xp=6, group=2, tracking=12,
                 description="Glides between the worldlets on wings full of stars, filtering stardust from the dark."),
        Creature("planet_grazer", "Planet Grazer", "quadruped", ["#8a7ad0", "#ece4ff", STARDUST, "#202040"],
                 pattern="spots", size=1.1,
                 body={"fur": True, "hump": True, "horns": "small", "ears": "floppy", "leg_len": 6, "leg_w": 3,
                       "body_len": 15, "body_h": 10, "body_w": 12, "head_size": 1.1, "snout": 3, "eye_style": "cute",
                       "tail": 1, "tail_kind": "puff", "antennae": 2, "glow_tips": True},
                 behavior="passive", health=22, speed=0.2, tempt="orbitas_starfruit",
                 drops=[Drop("minecraft:leather", 0, 2), Drop("orbitas_starfruit", 0, 1, chance=0.4)],
                 sounds="cow", pitch=0.8, xp=3, group=3,
                 description="Eats one planet's grass bare, then floats patiently to the next."),
        Creature("comet_imp", "Comet Imp", "flyer", ["#2a4a9a", "#9af0ff", "#ffffff", "#ffe060"], pattern="glow_lines",
                 size=0.8,
                 body={"kind": "dragon", "wing_span": 9, "body_len": 7, "horns": "small", "tail": 3, "tail_kind": "flame",
                       "eye_style": "angry", "mouth": "grin"},
                 behavior="hostile", attack="ranged", health=14, damage=3, speed=0.3,
                 ranged={"color": "#a0f0ff", "damage": 3, "effect": Effect("minecraft:slowness", 3, 0), "cooldown": 55,
                         "speed": 1.0, "particle": "minecraft:snowflake"},
                 fire_immune=True, emissive=True,
                 drops=[Drop("orbitas_comet_shard", 0, 1, chance=0.6), Drop("minecraft:snowball", 0, 2)],
                 sounds="breeze", pitch=1.4, xp=7, group=2,
                 description="Rides the tails of comets and throws the leftovers at anything that can fall."),
    ],
    biomes=[
        Biome("orbitas_verdant_worldlets", "Verdant Worldlets", top="orbitas_star_grass", under="orbitas_planet_soil",
              temperature=0.0, humidity=0.6, grass_color="#2e9a7e", foliage_color="#4e8aa8", water_color="#4a8ad0",
              particles=[("minecraft:end_rod", 0.0008), ("dust:#7ad8a0:0.6", 0.002)], ambient="cosmic_drone",
              features=[
                  GiantPlant(stem="orbitas_baobab_log", head="orbitas_baobab_leaves", shape="umbrella", height=(5, 9),
                             radius=(3, 5), stem_width=2, count=1, chance=2),
                  GiantPlant(stem="orbitas_baobab_log", head="orbitas_baobab_leaves", shape="puff", height=(4, 6),
                             radius=(2, 3), stem_width=1, count=1, chance=2),
                  Patch(block="orbitas_starfruit_bush", count=2, tries=10),
                  Patch(blocks=[("minecraft:short_grass", 6), ("minecraft:blue_orchid", 1), ("minecraft:allium", 1)],
                        count=3, tries=16),
              ],
              spawns=[Spawn("planet_grazer", 10, (2, 3)), Spawn("void_ray", 4, (1, 2)), Spawn("comet_imp", 2, (1, 1))]),
        Biome("orbitas_molten_worldlets", "Molten Worldlets", top="orbitas_magma_crust", under="minecraft:blackstone",
              stone="minecraft:basalt", temperature=0.8, humidity=-0.4, grass_color="#5a3a2a", foliage_color="#8a4a2a",
              water_color="#4a8ad0", particles=[("minecraft:lava", 0.002), ("minecraft:small_flame", 0.004)],
              ambient="volcanic_rumble",
              features=[
                  Spire(blocks=[("minecraft:blackstone", 2), ("minecraft:basalt", 1)], tip="minecraft:magma_block",
                        height=(4, 10), radius=(1, 2), lean=0.3, count=1, chance=2),
                  Boulder(blocks=[("minecraft:obsidian", 2), ("minecraft:crying_obsidian", 1)], radius=(1, 2), count=1,
                          chance=3),
              ],
              spawns=[Spawn("comet_imp", 4, (1, 2)), Spawn("void_ray", 3, (1, 1))]),
        Biome("orbitas_frost_worldlets", "Frost Worldlets", top="orbitas_comet_snow", under="orbitas_comet_ice",
              stone="minecraft:packed_ice", temperature=-0.8, humidity=0.2, grass_color="#aadcf4", foliage_color="#8ac8e8",
              water_color="#8ac8e8", snowy=True, particles=[("minecraft:snowflake", 0.002)], ambient="wind_howl",
              features=[
                  Spire(blocks=[("orbitas_comet_ice", 3), ("minecraft:packed_ice", 1)], tip="orbitas_comet_ice",
                        height=(6, 15), radius=(1, 2), lean=0.2, count=2),
                  CrystalCluster(block="orbitas_comet_ice", size=(3, 6), count=1, chance=3),
              ],
              spawns=[Spawn("comet_imp", 4, (1, 2)), Spawn("void_ray", 4, (1, 2)), Spawn("planet_grazer", 3, (1, 2))]),
        Biome("orbitas_ore_asteroids", "Ore Asteroids", top="orbitas_asteroid_rock", under="orbitas_asteroid_rock",
              temperature=0.3, humidity=-0.8, grass_color="#5c5868", foliage_color="#827e8e", water_color="#4a8ad0",
              particles=[("dust:#ffd860:0.7", 0.003), ("minecraft:end_rod", 0.0006)], ambient="crystal_chimes",
              surface_noise=[("orbitas_stardust_ore", 0.72), ("minecraft:cobblestone", 0.5)],
              features=[
                  CrystalCluster(block="orbitas_star_crystal", small="orbitas_star_cluster", size=(3, 6), count=1),
                  Patch(block="orbitas_star_cluster", count=2, tries=8),
                  Ore(block="orbitas_stardust_ore", size=7, count=10, y=(40, 170)),
                  Ore(block="minecraft:iron_ore", size=8, count=8, y=(40, 170)),
                  Ore(block="minecraft:gold_ore", size=6, count=4, y=(40, 170)),
              ],
              spawns=[Spawn("void_ray", 5, (1, 2)), Spawn("comet_imp", 3, (1, 2))]),
    ],
    effects=["floaty"],
    music="minecraft:music.creative",
    ambient="cosmic_drone",
    platform="orbitas_asteroid_rock",
    icon="portalgun:orbitas_stardust",
)
