"""V-9 Pyroclast - a volcanic hellscape of obsidian spires, ash fall and rivers of lava."""
from gen.content.dsl import *

# palette: obsidian black, basalt grey, ash, ember orange, magma red, sulfur yellow
P_BASALT = ["#16121a", "#221c22", "#2e272c", "#3c3438", "#4c4448"]
P_ASH = ["#2e2b30", "#3c393e", "#4c484e", "#5c585e", "#6e6a70"]
P_CINDER = ["#1a0e10", "#2c1814", "#44221a", "#5e3222", "#7a4630"]
P_OBSIDIAN = ["#08050a", "#140c14", "#22121e", "#3a1a2a", "#ff6a1a"]
P_SULFUR = ["#a89a20", "#c8b828", "#e0d038", "#f0e060", "#fff49a"]
P_EMBER = ["#5a0e06", "#a8240c", "#e8501a", "#ff8a2a", "#ffd870"]
P_OPAL = ["#7a1a0a", "#c8401a", "#ff7a2a", "#ffc04a", "#fff0b0"]


def _magma_crust(crust, glow, seed, frames=1):
    """Dark basalt plates split by glowing lava cracks; the cracks breathe when animated."""
    import math
    import numpy as np
    from PIL import Image
    from gen.noise import fbm, worley
    from gen.textures import pal as P

    def rgb(c):
        return np.array([int(c[i:i + 2], 16) for i in (1, 3, 5)], float)
    cr = [rgb(c) for c in P(crust)]
    gl = [rgb(c) for c in P(glow)]
    f1, f2 = worley(16, 16, 7, seed)
    edge = f2 - f1                                # ~0 on the cracks between plates
    n = fbm(16, 16, 5, seed + ":n", 2)
    out = []
    for fi in range(max(1, frames)):
        ph = 2 * math.pi * fi / max(1, frames)
        a = np.zeros((16, 16, 4))
        for y in range(16):
            for x in range(16):
                e = edge[y, x] + 0.12 * (n[y, x] - 0.5)
                if e < 0.13:
                    k = 0.7 + 0.3 * math.sin(ph + (x + y) * 0.4)
                    i = int(round((len(gl) - 1) * max(0.0, min(1.0, k - e * 2.2))))
                    a[y, x, :3] = gl[i]
                elif e < 0.22:
                    a[y, x, :3] = gl[0] * 0.75 + cr[0] * 0.25
                else:
                    v = f1[y, x] * 0.8 + n[y, x] * 0.5
                    i = int(max(0, min(len(cr) - 1, round(v * (len(cr) - 1)))))
                    a[y, x, :3] = cr[i]
                a[y, x, 3] = 255
        out.append(Image.fromarray(np.clip(a, 0, 255).astype("uint8"), "RGBA"))
    return out if frames > 1 else out[0]


def _sulfur_vent_top(pal, rim, seed):
    """Crusted yellow sulfur with a dark smoking throat in the middle."""
    import numpy as np
    from PIL import Image
    from gen.textures import clay, pal as P
    base = np.asarray(clay(pal, seed).convert("RGBA"), float).copy()
    cols = [np.array([int(c[i:i + 2], 16) for i in (1, 3, 5)], float) for c in P(rim)]
    yy, xx = np.mgrid[0:16, 0:16]
    d = np.hypot(xx - 7.5, yy - 7.5)
    base[d < 5.2, :3] = cols[2]
    base[d < 4.0, :3] = cols[1]
    base[d < 2.6, :3] = cols[0]
    return Image.fromarray(base.astype("uint8"), "RGBA")


DIMENSION = Dimension(
    id="pyroclast",
    code="V-9",
    name="Pyroclast",
    tagline="Ash falls like snow on a world that never cooled",
    description=("A volcanic hellscape under a shattered moon: black basalt ranges, obsidian spires, magma fields "
                 "that crack and glow underfoot and lava rivers that drain into a sea of fire. Ash never stops "
                 "falling and the heat gnaws at you. The Magma Tripods are calm until provoked - the Cinder Imps "
                 "and Ash Crawlers never are."),
    danger=5,
    color="#ff6a1a",
    terrain=Terrain(style="mountains", stone="pyroclast_basalt", fluid="minecraft:lava", sea_level=46, height=68,
                    amplitude=58, roughness=0.2, deepslate="minecraft:blackstone",
                    params={"coverage": 0.62, "peaks": 0.85, "rivers": 0.3, "cliff_block": "pyroclast_basalt",
                            "peak_block": "pyroclast_ash", "peak_y": 150, "beach_block": "pyroclast_cinder",
                            "beach_height": 2, "biome_size": 260}),
    sky=Sky(sky_color="#2a0e0a", fog_color="#3a1812", fog_start=12, fog_end=120, cloud_color="#c0281818",
            cloud_height=150, time="dusk", sunrise_color="#ffff3a10", star_brightness=0.15, ambient_light=0.1,
            sky_light_color="#ffb090",
            bodies=[
                Celestial("shattered_moon", ["#4a3a3a", "#2a2020", "#ff5a14"], size=70, yaw=110, pitch=48, roll=18,
                          seed="pyro-moon"),
                Celestial("sun", ["#ffb070", "#ff4a14", "#801000"], size=60, yaw=265, pitch=12, alpha=0.85,
                          seed="pyro-sun"),
                Celestial("comet", ["#ffb070", "#ffffff", "#ff4a14"], size=60, yaw=40, pitch=60, roll=35, speed=6,
                          alpha=0.8, additive=True, seed="pyro-meteor"),
            ]),
    blocks=[
        Block("pyroclast_basalt", "Pyroclast Basalt", "stone", {"all": tex("rough_stone", P_BASALT[:4], seed="pyro-basalt")},
              hardness=1.8, resistance=8, sound="basalt", map_color="color_black"),
        Block("pyroclast_ash", "Volcanic Ash", "soil", {"all": tex("ash", P_ASH, seed="pyro-ash")}, hardness=0.5,
              sound="sand", map_color="color_gray"),
        Block("pyroclast_cinder", "Cinder Gravel", "soil", {"all": tex("gravel", P_CINDER, seed="pyro-cinder")},
              hardness=0.6, sound="gravel", map_color="terracotta_black"),
        Block("pyroclast_magma_crust", "Magma Crust", "hazard",
              {"all": tex(_magma_crust, P_BASALT[:4], P_EMBER, "pyro-crust", frames=12, frametime=3)},
              hardness=1.2, light=9, emissive=True, damage=1.5, damage_type="hot_floor", map_color="nether",
              sound="basalt", particle="minecraft:lava"),
        Block("pyroclast_obsidian", "Ember Obsidian", "stone", {"all": tex("obsidian_like", P_OBSIDIAN, seed="pyro-obsidian")},
              hardness=25, resistance=1200, sound="stone", map_color="color_black"),
        Block("pyroclast_sulfur_crust", "Sulfur Crust", "solid", {"all": tex("clay", P_SULFUR, seed="pyro-sulfur")},
              hardness=0.8, sound="calcite", map_color="color_yellow"),
        Block("pyroclast_sulfur_vent", "Sulfur Fumarole", "vent", {
            "top": tex(_sulfur_vent_top, P_SULFUR, ["#1a1006", "#3a2a0a", "#8a6a10"], "pyro-vent"),
            "side": tex("clay", P_SULFUR, seed="pyro-vent-side")},
              hardness=1.0, light=4, particle="minecraft:campfire_cosy_smoke", effect="minecraft:poison",
              effect_seconds=3, map_color="color_yellow"),
        Block("pyroclast_cinderbloom", "Cinderbloom", "plant",
              {"cross": tex("flower", ["#1a1012", "#3a2420", "#5a3a2a"], P_EMBER[1:], seed="pyro-bloom", shape="star",
                            center_hex="#fff0a0")},
              hardness=0.0, sound="nether_sprouts", light=7, emissive=True, fruit="pyroclast_cinder_pepper",
              particle="minecraft:small_flame"),
        Block("pyroclast_ember_crystal", "Ember Crystal", "crystal_cluster",
              {"cross": tex("crystal_shard_sprite", P_OPAL, seed="pyro-emcrystal", count=3)}, hardness=1.0, light=10,
              emissive=True, sound="amethyst_cluster"),
        Block("pyroclast_fire_opal_ore", "Fire Opal Ore", "ore",
              {"all": tex("ore", tex("rough_stone", P_BASALT[:4], seed="pyro-basalt"), P_OPAL, seed="pyro-opalore")},
              hardness=3.0, light=5, drop="pyroclast_fire_opal", drop_count=(1, 2), xp=(3, 7), map_color="color_black"),
    ],
    items=[
        Item("pyroclast_fire_opal", "Fire Opal", tex("item_icon", "gem", P_OPAL, seed="pyro-opal"), rarity="uncommon",
             lore="There is a tiny storm of fire trapped inside."),
        Item("pyroclast_cinder_pepper", "Cinder Pepper", tex("item_icon", "fruit", P_EMBER, seed="pyro-pepper"),
             kind="food", food=Food(3, 0.4, always=True, fast=True,
                                    effects=[Effect("minecraft:fire_resistance", 45, 0)]),
             lore="Eat one and the lava feels like a warm bath. For a while."),
        Item("pyroclast_magma_core", "Magma Core", tex("item_icon", "core", ["#3a0a04", "#ff5a14", "#ffe070"],
                                                       seed="pyro-core"),
             rarity="rare", glint=True, lore="It beats like a heart. A very hot heart."),
    ],
    creatures=[
        Creature("magma_tripod", "Magma Tripod", "tripod", ["#2a1a18", "#c84a14", "#ffb030", "#ff7a1a", "#ffd23a"],
                 pattern="glow_lines", size=1.7,
                 body={"legs": 3, "leg_len": 26, "dome": "dome", "dome_w": 18, "dome_h": 11, "eyes": 1, "eye_size": 3,
                       "eye_style": "glow", "lights": 6, "tentacles": 3},
                 behavior="neutral", attack="ranged", health=90, damage=9, armor=8, speed=0.22,
                 ranged={"color": "#ff6a1a", "damage": 6, "fire": 4, "cooldown": 70, "gravity": True, "size": 0.45,
                         "speed": 0.9, "particle": "minecraft:lava"},
                 abilities=["fire_trail"], fire_immune=True,
                 drops=[Drop("pyroclast_magma_core", 0, 1, chance=0.35), Drop("minecraft:magma_cream", 1, 3)],
                 sounds="strider", pitch=0.45, xp=25, group=1, tracking=10,
                 description="A walking volcano vent on three stilt legs. It wades through lava to drink. Leave it be."),
        Creature("cinder_imp", "Cinder Imp", "flyer", ["#3a1010", "#ff5020", "#ffd040", "#fff070"],
                 pattern="glow_lines", size=0.9,
                 body={"kind": "bat", "wing_span": 10, "horns": "curved", "tail": 2, "tail_kind": "spade",
                       "eye_style": "angry", "mouth": "grin", "ears": "pointy"},
                 behavior="hostile", attack="ranged", health=14, damage=3, speed=0.3,
                 ranged={"color": "#ff7020", "damage": 4, "fire": 3, "cooldown": 55, "speed": 1.1, "size": 0.25},
                 fire_immune=True, emissive=True,
                 drops=[Drop("pyroclast_fire_opal", 0, 1, chance=0.3), Drop("minecraft:blaze_powder", 0, 1)],
                 sounds="blaze", pitch=1.6, xp=8, group=3,
                 description="A cackling ember with wings. It throws pieces of itself at you."),
        Creature("ash_crawler", "Ash Crawler", "crawler", ["#3a3638", "#6a6266", "#ff7a2a", "#ffb040"],
                 pattern="speckle", size=1.1,
                 body={"kind": "centipede", "segments": 8, "mandibles": True, "antennae": 4, "eye_style": "glow",
                       "eyes": 4, "glow_tips": True, "spikes": 3},
                 behavior="hostile", health=20, damage=5, speed=0.3, armor=2, abilities=["burrow"],
                 on_hit=Effect("minecraft:blindness", 3, 0), fire_immune=True,
                 drops=[Drop("pyroclast_cinder_pepper", 0, 1, chance=0.4), Drop("minecraft:gunpowder", 0, 2)],
                 sounds="silverfish", pitch=0.55, xp=7, group=2,
                 description="Lies under the ash with only its glowing feelers showing. Bites, then blinds."),
    ],
    biomes=[
        Biome("pyroclast_ashfall", "Ashfall Slopes", top="pyroclast_ash", under="pyroclast_cinder", temperature=0.0,
              humidity=0.3, grass_color="#5a565c", foliage_color="#4a4448", water_color="#3a3a3a",
              fog_color="#34201c", fog_end=100,
              particles=[("minecraft:ash", 0.09), ("minecraft:white_ash", 0.025)], ambient="volcanic_rumble",
              features=[
                  Spire(blocks=[("pyroclast_obsidian", 5), ("minecraft:crying_obsidian", 1)], tip="pyroclast_magma_crust",
                        height=(14, 34), radius=(2, 4), lean=0.12, count=1, chance=2),
                  Boulder(blocks=[("pyroclast_basalt", 3), ("pyroclast_obsidian", 1), ("pyroclast_magma_crust", 1)],
                          radius=(1, 3), count=1, chance=2),
                  Patch(block="pyroclast_cinderbloom", count=1, tries=10, chance=2),
                  Vanilla(id="minecraft:patch_dead_bush_2"),
                  Ore(block="pyroclast_fire_opal_ore", size=5, count=4, y=(-40, 90)),
              ],
              spawns=[Spawn("ash_crawler", 8, (1, 2)), Spawn("magma_tripod", 3, (1, 1)), Spawn("cinder_imp", 3, (1, 2))]),
        Biome("pyroclast_magma_fields", "Magma Fields", top="pyroclast_cinder", under="pyroclast_basalt",
              temperature=0.8, humidity=-0.1, elevation=-0.5, grass_color="#5e3222", water_color="#3a1a10",
              fog_color="#4a180c", fog_end=110, sky_color="#3a1008",
              particles=[("minecraft:lava", 0.003), ("minecraft:ash", 0.03), ("minecraft:small_flame", 0.002)],
              ambient="volcanic_rumble",
              surface_noise=[("pyroclast_magma_crust", 0.35)],
              features=[
                  Spire(blocks=[("pyroclast_basalt", 5), ("pyroclast_magma_crust", 1), ("pyroclast_obsidian", 1)],
                        tip="pyroclast_magma_crust", height=(12, 22), radius=(5, 8), count=1, chance=4),
                  Lake(fluid="minecraft:lava", border="pyroclast_magma_crust", chance=4),
                  Vanilla(id="minecraft:small_basalt_columns"),
                  Boulder(blocks=[("pyroclast_obsidian", 2), ("pyroclast_magma_crust", 2)], radius=(1, 2), count=1),
                  Patch(block="pyroclast_ember_crystal", count=1, tries=8, chance=2),
                  Ore(block="pyroclast_fire_opal_ore", size=6, count=6, y=(-40, 90)),
              ],
              spawns=[Spawn("magma_tripod", 5, (1, 1)), Spawn("cinder_imp", 5, (1, 3)), Spawn("ash_crawler", 4, (1, 2))]),
        Biome("pyroclast_sulfur_flats", "Sulfur Flats", top="pyroclast_ash", under="pyroclast_cinder",
              temperature=-0.8, humidity=-0.8, elevation=-0.2, grass_color="#b8901a", water_color="#8a8a20",
              fog_color="#3a2c1a", fog_end=90, sky_color="#3a2010",
              particles=[("dust:#ffd23a:1.2", 0.008), ("minecraft:white_ash", 0.02)], ambient="sizzle_toxic",
              surface_noise=[("pyroclast_sulfur_crust", 0.2), ("pyroclast_cinder", -0.5)],
              features=[
                  Structure(kind="geyser", blocks={"vent": "pyroclast_sulfur_vent", "mound": "pyroclast_basalt"},
                            size=(4, 8), count=1),
                  Boulder(blocks=[("pyroclast_basalt", 3), ("pyroclast_sulfur_crust", 1)], radius=(1, 2), count=1, chance=2),
                  Patch(block="pyroclast_cinderbloom", count=1, tries=6, chance=3),
              ],
              spawns=[Spawn("ash_crawler", 6, (1, 3)), Spawn("cinder_imp", 2, (1, 2)), Spawn("magma_tripod", 2, (1, 1))]),
        Biome("pyroclast_obsidian_crags", "Obsidian Crags", top="pyroclast_basalt", under="pyroclast_basalt",
              temperature=0.3, humidity=0.7, elevation=0.8, grass_color="#2e272c", water_color="#2a1a1a",
              fog_color="#2a1414", particles=[("minecraft:ash", 0.05), ("minecraft:falling_lava", 0.001)],
              ambient="volcanic_rumble", surface_noise=[("pyroclast_obsidian", 0.55), ("pyroclast_ash", 0.3)],
              features=[
                  Spire(blocks=[("pyroclast_obsidian", 6), ("minecraft:crying_obsidian", 1)], tip="pyroclast_magma_crust",
                        height=(18, 40), radius=(2, 4), lean=0.2, count=2),
                  CrystalCluster(block="pyroclast_obsidian", small="pyroclast_ember_crystal", size=(3, 6), count=1, chance=2),
                  Patch(block="pyroclast_ember_crystal", count=2, tries=10),
                  Ore(block="pyroclast_fire_opal_ore", size=6, count=8, y=(-40, 160)),
              ],
              spawns=[Spawn("cinder_imp", 6, (2, 3)), Spawn("ash_crawler", 3, (1, 2))]),
    ],
    effects=["heat"],
    music="minecraft:music.nether.basalt_deltas",
    ambient="volcanic_rumble",
    icon="portalgun:pyroclast_fire_opal",
)
