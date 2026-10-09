"""A-11 Aerolith - an endless sky of floating meadow islands, waterfalls pouring into the blue."""
from gen.content.dsl import *

# ------------------------------------------------------------------------------------------------ palette
P_GRASS = ["#3a9a4a", "#4fb85a", "#6cd068", "#94e47e", "#c4f5a4"]      # spring meadow
P_SOIL = ["#5a4030", "#6e5038", "#846448", "#9a7a5a"]
P_STONE = ["#8a879e", "#a3a0b6", "#bcbacc", "#d4d2e0", "#ebeaf3"]      # pale skystone
P_CLOUD = ["#c8d8f0", "#dde8f8", "#eef4ff", "#ffffff"]
P_BARK = ["#9a9488", "#b4ae9f", "#cdc8b8", "#e6e1d2"]                  # silver skyroot bark
P_GOLDLEAF = ["#d89a1a", "#efb92c", "#ffd451", "#ffe88a", "#fff6c8"]
P_SUN = ["#c07a10", "#e8a820", "#ffd040", "#ffee90", "#fffbe0"]
P_FEATHER = ["#7ab07a", "#a8d4a0", "#d6efcc", "#f6fff0"]

UNDERSIDE = [
    # rock roots hanging under every island, sunstone geodes glittering in them, roots dangling into the void
    Spire(blocks=[("aerolith_stone", 4), ("aerolith_soil", 1)], tip="aerolith_sunstone", height=(8, 22), radius=(2, 4),
          hanging=True, where="cave_ceiling", count=2),
    CrystalCluster(block="aerolith_sunstone", small="aerolith_sunstone_shard", size=(2, 5), where="cave_ceiling", count=1),
    Patch(block="aerolith_hanging_roots", where="cave_ceiling", count=6, tries=32),
]

DIMENSION = Dimension(
    id="aerolith",
    code="A-11",
    name="Aerolith",
    tagline="Meadow islands adrift in an endless sky",
    description=("Grassy islands float in tiers above a bottomless blue, spilling waterfalls into the clouds below. "
                 "Sky Whales graze the air with gardens on their backs and Puffbirds nest in golden skyroots. "
                 "Gravity is gentle here - but at night the Zephyr Wisps come out, and their gusts throw you off "
                 "the edge."),
    danger=2,
    color="#6fc0ff",
    terrain=Terrain(style="sky_islands", stone="aerolith_stone", fluid="minecraft:air", sea_level=-64, height=112,
                    amplitude=12, roughness=0.25, caves=False, ores=True,
                    params={"layers": 3, "coverage": 0.34, "thickness": 34, "spacing": 58, "island_size": 1.25,
                            "debris": 0.45, "springs": 28, "biome_size": 300}),
    sky=Sky(sky_color="#62b4ff", fog_color="#cfe8ff", cloud_color="#f8ffffff", cloud_height=96,
            sunrise_color="#ffffb060", time="cycle", star_brightness=0.8,
            bodies=[Celestial("moon", ["#d8e4ff"], size=46, yaw=150, pitch=40, alpha=0.55, seed="aero-daymoon"),
                    Celestial("ringed_planet", ["#5a8ad0", "#a8c8f0", "#f0f6ff"], size=60, yaw=300, pitch=22, roll=-18,
                              alpha=0.8, seed="aero-giant")]),
    blocks=[
        Block("aerolith_grass", "Skymeadow Grass", "grass", {
            "top": tex("grass_top", P_GRASS, seed="aero-grass"),
            "side": tex("grass_side", P_GRASS, P_SOIL, seed="aero-grass"),
            "bottom": tex("dirt", P_SOIL, seed="aero-soil")}, hardness=0.6, sound="grass", map_color="grass"),
        Block("aerolith_soil", "Sky Loam", "soil", {"all": tex("dirt", P_SOIL, seed="aero-soil")}, hardness=0.5,
              sound="gravel", map_color="dirt"),
        Block("aerolith_stone", "Skystone", "stone", {"all": tex("stone", P_STONE, seed="aero-stone")}, hardness=1.5,
              sound="calcite", map_color="quartz"),
        Block("aerolith_cloud", "Solid Cloud", "solid", {"all": tex("cloud", P_CLOUD, seed="aero-cloud")}, hardness=0.2,
              sound="powder_snow", tool="shovel", bounce=0.6, map_color="snow"),
        Block("aerolith_skyroot_log", "Skyroot Log", "log", {
            "side": tex("log_side", P_BARK, seed="aero-bark"),
            "end": tex("log_top", P_BARK, ["#efe6c8", "#d8cca8"], seed="aero-bark-top")}, hardness=2.0, sound="wood",
              map_color="wool", flammable=True),
        Block("aerolith_goldleaf", "Skyroot Goldleaf", "leaves", {"all": tex("leaves", P_GOLDLEAF, seed="aero-leaf")},
              hardness=0.2, sound="azalea_leaves", map_color="gold", flammable=True),
        Block("aerolith_cloudberry_bush", "Cloudberry Bush", "plant", {
            "cross": tex("berry_bush", P_GRASS, "#f0f4ff", seed="aero-berry")}, hardness=0.0, sound="sweet_berry_bush",
              fruit="aerolith_cloudberry", map_color="grass"),
        Block("aerolith_feathergrass", "Feathergrass", "tall_plant", {
            "bottom": tex("tall_plant_bottom", P_FEATHER, seed="aero-feather"),
            "top": tex("tall_plant_top", P_FEATHER, seed="aero-feather")}, hardness=0.0, sound="grass", map_color="grass"),
        Block("aerolith_hanging_roots", "Sky Roots", "hanging_plant", {
            "cross": tex("tendril", ["#5a4030", "#846448", "#c4a878"], seed="aero-roots")}, hardness=0.0,
              sound="hanging_roots"),
        Block("aerolith_sunstone", "Sunstone", "crystal_block", {"all": tex("crystal", P_SUN, seed="aero-sun", shards=7)},
              hardness=1.5, sound="amethyst", light=12, emissive=True, map_color="gold"),
        Block("aerolith_sunstone_shard", "Sunstone Shard", "crystal_cluster", {
            "cross": tex("crystal_shard_sprite", P_SUN, seed="aero-sunshard", count=3)}, hardness=0.5,
              sound="amethyst_cluster", light=8, emissive=True),
        Block("aerolith_updraft", "Updraft Vent", "vent", {
            "top": tex("lamp", ["#6a7a9a", "#a3a0b6", "#dde8f8", "#ffffff"], seed="aero-vent", style="grid"),
            "side": tex("stone", P_STONE, seed="aero-stone-v")}, hardness=1.5, sound="calcite",
              particle="minecraft:cloud", effect="minecraft:levitation", effect_seconds=1.5, effect_amplifier=4,
              map_color="snow"),
    ],
    items=[
        Item("aerolith_cloudberry", "Cloudberry", tex("item_icon", "berry", ["#c8d8f0", "#eef4ff", "#ffffff"],
                                                      seed="aero-cberry"),
             kind="food", food=Food(3, 0.5, fast=True, effects=[Effect("minecraft:slow_falling", 20, 0)]),
             lore="Light as air. Eat one before you jump, not after."),
        Item("aerolith_puff_feather", "Puff Feather", tex("item_icon", "feather", ["#ffb030", "#ffd060", "#fff4d0"],
                                                          seed="aero-pfeather"),
             lore="So light it falls upward on windy days."),
        Item("aerolith_sky_pearl", "Sky Whale Pearl", tex("item_icon", "pearl", ["#5a86c8", "#a8c8f0", "#ffffff"],
                                                          seed="aero-pearl"),
             rarity="rare", glint=True, lore="Hold it to your ear: you can hear a whale singing far above."),
    ],
    creatures=[
        Creature("sky_whale", "Sky Whale", "floater", ["#4f7fc4", "#e6f0ff", "#ffd86a", "#0e1c38", "#8ab4e8"],
                 pattern="speckle", size=2.6,
                 body={"kind": "whale", "garden": True, "fin_top": True, "eye_style": "sleepy", "mouth": "smile"},
                 behavior="passive", health=90, speed=0.07, armor=2,
                 drops=[Drop("aerolith_sky_pearl", 0, 1, chance=0.3), Drop("minecraft:cod", 2, 5, cooked="minecraft:cooked_cod")],
                 sounds="happy_ghast", pitch=0.55, xp=12, group=1, tracking=10,
                 description="A gentle giant that swims through the open sky. Moss and flowers grow on its back."),
        Creature("puffbird", "Puffbird", "flyer", ["#ffc23a", "#fff4dc", "#ff7030", "#1a1010", "#ff9ab0"],
                 pattern="plain", size=0.75,
                 body={"kind": "bird", "fluffy": True, "crest": True, "body_w": 7, "body_h": 7, "body_len": 7,
                       "wing_span": 6, "eye_style": "cute", "blush": True, "tail": 1, "tail_kind": "fan"},
                 behavior="passive", health=6, speed=0.24, tempt="aerolith_cloudberry",
                 drops=[Drop("aerolith_puff_feather", 0, 2), Drop("minecraft:feather", 0, 1)],
                 sounds="parrot", pitch=1.35, xp=2, group=4,
                 description="A ball of golden down with wings. Puffbirds nest in skyroots and adore cloudberries."),
        Creature("zephyr_wisp", "Zephyr Wisp", "floater", ["#cfeaff", "#8ec8ff", "#ffffff", "#2a7aff", "#e8f8ff"],
                 pattern="glow_lines", size=1.0,
                 body={"kind": "cloud", "body_w": 14, "eye_style": "angry", "mouth": "open"},
                 behavior="hostile", attack="ranged", health=16, damage=2, speed=0.3, emissive=True,
                 abilities=["blink"], spawn_light="dark",
                 ranged={"color": "#e0f6ff", "damage": 2, "knockback": 2.6, "cooldown": 45, "speed": 1.1, "size": 0.45,
                         "particle": "minecraft:cloud"},
                 drops=[Drop("aerolith_puff_feather", 0, 1), Drop("minecraft:breeze_rod", 0, 1, chance=0.25)],
                 sounds="breeze", pitch=1.3, xp=6, group=2,
                 description="A knot of angry night wind. It does not hurt much - it just pushes you off the island."),
    ],
    biomes=[
        Biome("skymeadow", "Skymeadow", top="aerolith_grass", under="aerolith_soil", temperature=0.81, humidity=-0.44,
              grass_color="#6cd068", foliage_color="#ffd451", water_color="#4ab8ff", water_fog_color="#1a6ab0",
              particles=[("minecraft:white_ash", 0.002)], ambient="cozy_breeze", music="minecraft:music.overworld.meadow",
              features=[
                  Patch(blocks=[("aerolith_feathergrass", 3), ("minecraft:short_grass", 4), ("minecraft:oxeye_daisy", 1),
                                ("minecraft:cornflower", 1), ("minecraft:lily_of_the_valley", 1)], count=6, tries=32),
                  Patch(block="aerolith_cloudberry_bush", count=1, tries=12),
                  Lake(fluid="minecraft:water", border="aerolith_stone", count=1, chance=4),
                  Tree(log="aerolith_skyroot_log", leaves="aerolith_goldleaf", shape="fancy", height=(6, 10), count=1,
                       chance=3),
                  Boulder(blocks=[("aerolith_cloud", 1)], radius=(3, 7), squash=0.4, where="air", count=1, chance=2),
                  *UNDERSIDE,
              ],
              spawns=[Spawn("puffbird", 10, (2, 4)), Spawn("sky_whale", 2, (1, 1)), Spawn("zephyr_wisp", 4, (1, 2))]),
        Biome("skyroot_grove", "Skyroot Grove", top="aerolith_grass", under="aerolith_soil", temperature=-0.68,
              humidity=0.28, grass_color="#5ac060", foliage_color="#ffd451", water_color="#4ab8ff",
              particles=[("minecraft:cherry_leaves", 0.004)], ambient="cozy_breeze",
              music="minecraft:music.overworld.forest",
              features=[
                  Tree(log="aerolith_skyroot_log", leaves="aerolith_goldleaf", shape="fancy", height=(8, 13), count=3),
                  Tree(log="aerolith_skyroot_log", leaves="aerolith_goldleaf", shape="bush", height=(1, 2), count=1),
                  Structure(kind="nest", blocks={"main": "aerolith_skyroot_log", "egg": "aerolith_cloud"}, size=(4, 6),
                            chance=6),
                  Patch(block="aerolith_cloudberry_bush", count=2, tries=16),
                  Patch(blocks=[("minecraft:short_grass", 3), ("aerolith_feathergrass", 1)], count=3, tries=24),
                  *UNDERSIDE,
              ],
              spawns=[Spawn("puffbird", 14, (3, 5)), Spawn("sky_whale", 1, (1, 1)), Spawn("zephyr_wisp", 3, (1, 1))]),
        Biome("cloudtop_reaches", "Cloudtop Reaches", top="aerolith_cloud", under="aerolith_cloud", temperature=0.73,
              humidity=0.93, grass_color="#94e47e", water_color="#8ad0ff", fog_color="#e8f4ff",
              particles=[("minecraft:cloud", 0.0015), ("minecraft:white_ash", 0.004)], ambient="wind_howl",
              music="minecraft:music.overworld.snowy_slopes",
              features=[
                  Patch(block="aerolith_updraft", count=1, tries=4),
                  Boulder(blocks=[("aerolith_cloud", 1)], radius=(2, 5), squash=0.6, count=1),
                  Boulder(blocks=[("aerolith_cloud", 1)], radius=(4, 8), squash=0.35, where="air", count=1),
                  Patch(block="aerolith_cloudberry_bush", count=1, tries=8),
                  *UNDERSIDE,
              ],
              spawns=[Spawn("sky_whale", 4, (1, 1)), Spawn("zephyr_wisp", 6, (1, 2)), Spawn("puffbird", 4, (1, 2))]),
        Biome("windswept_crags", "Windswept Crags", top="aerolith_stone", under="aerolith_stone", temperature=-0.84,
              humidity=-0.04, grass_color="#94e47e", water_color="#4ab8ff", surface_noise=[("aerolith_grass", 0.3)],
              particles=[("minecraft:white_ash", 0.006)], ambient="wind_howl",
              music="minecraft:music.overworld.stony_peaks",
              features=[
                  Spire(blocks=[("aerolith_stone", 5), ("aerolith_sunstone", 1)], height=(8, 20), radius=(1, 3), lean=0.45,
                        count=1),
                  Structure(kind="arch", blocks={"main": "aerolith_stone", "alt": "aerolith_grass"}, size=(5, 9), chance=5),
                  Structure(kind="ring", blocks={"main": "aerolith_stone", "alt": "aerolith_sunstone"}, size=(5, 8),
                            params={"float": 6}, chance=10),
                  Patch(block="aerolith_updraft", count=1, tries=3, chance=2),
                  Patch(blocks=[("aerolith_feathergrass", 1), ("minecraft:short_grass", 2)], count=2, tries=16),
                  *UNDERSIDE,
              ],
              spawns=[Spawn("zephyr_wisp", 8, (1, 2)), Spawn("puffbird", 4, (1, 2))]),
    ],
    effects=["floaty"],
    ambient="cozy_breeze",
    music="minecraft:music.overworld.meadow",
    platform="aerolith_cloud",
    icon="portalgun:aerolith_sky_pearl",
)
