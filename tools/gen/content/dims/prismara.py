"""K-22 Prismara - an endless crystal cavern lit only by the glow of its own crystals."""
from gen.content.dsl import *

# ------------------------------------------------------------------------------------------------ palette
P_STONE = ["#221d42", "#2c2652", "#373063", "#433b76", "#524a8c"]      # indigo bedrock
P_SLATE = ["#0e0c1a", "#161326", "#1f1a33", "#2a2342", "#362d52"]      # near-black slate
P_MOSS = ["#0f4a52", "#136470", "#1a8290", "#29a7b2", "#4fd0d0"]       # glimmer moss
P_SAND = ["#6d6aa8", "#8a86c4", "#a9a5dc", "#cbc8f0", "#ecebff"]       # crystal sand
P_CYAN = ["#0d6a8a", "#16a0c4", "#2fd3f0", "#8af2ff", "#e6fdff"]
P_MAGENTA = ["#7a1268", "#ad1d93", "#e03ac0", "#ff7ae0", "#ffe0f8"]
P_GOLD = ["#8a5a10", "#c08a20", "#f0c040", "#ffe48a", "#fff8e0"]
P_LAMP = ["#2a2050", "#5a48a0", "#8ad8ff", "#c8f4ff", "#ffffff"]

CYAN_SPIRE = Spire(blocks=[("prismara_cyan_crystal", 5), ("prismara_stone", 1)], tip="prismara_lamp",
                   height=(10, 26), radius=(2, 4), lean=0.15, count=1)
MAGENTA_SPIRE = Spire(blocks=[("prismara_magenta_crystal", 5), ("prismara_slate", 1)], tip="prismara_magenta_crystal",
                      height=(12, 30), radius=(2, 4), lean=0.2, count=1)

DIMENSION = Dimension(
    id="prismara",
    code="K-22",
    name="Prismara",
    tagline="Crystal caverns that glow in every colour",
    description=("A sunless world of vast caverns where crystal spires the size of towers glow cyan and magenta "
                 "and still prism lakes mirror them. Shimmer Moths drift between the lamps and Geode Golems sleep "
                 "in the vaults. Listen for clicking: Crystal Crawlers hunt in the darker hollows, and the shard "
                 "fields cut deep."),
    danger=3,
    color="#2fd3f0",
    terrain=Terrain(style="caves", stone="prismara_stone", sea_level=34, height=72, amplitude=24, roughness=0.3,
                    ores=True, params={"openness": 0.62, "pillars": 0.35, "shelves": 0.4, "springs": 10,
                                       "biome_size": 260}),
    sky=Sky(sky_color="#120c26", fog_color="#241848", water_fog_color="#0c3a52", fog_start=16, fog_end=150,
            cloud_color=None, skybox="none", has_skylight=False, ambient_light=0.32, time="midnight"),
    blocks=[
        Block("prismara_stone", "Prismstone", "stone", {"all": tex("stone", P_STONE, seed="prismara-stone")},
              hardness=1.5, map_color="color_blue"),
        Block("prismara_slate", "Umbral Slate", "stone", {"all": tex("rough_stone", P_SLATE, seed="prismara-slate")},
              hardness=2.5, sound="deepslate", map_color="color_black"),
        Block("prismara_glimmer_moss", "Glimmer Moss", "grass", {
            "top": tex("moss", P_MOSS, seed="prismara-moss"),
            "side": tex("grass_side", P_MOSS, P_STONE, seed="prismara-moss-side"),
            "bottom": tex("stone", P_STONE, seed="prismara-stone")}, hardness=1.0, sound="moss", light=3,
              map_color="color_cyan"),
        Block("prismara_crystal_sand", "Crystal Sand", "sand", {"all": tex("salt", P_SAND, seed="prismara-sand")},
              hardness=0.5, sound="sand", map_color="color_light_blue"),
        Block("prismara_cyan_crystal", "Cyan Prism Crystal", "crystal_block", {
            "all": tex("crystal", P_CYAN, seed="prismara-cyan", shards=8)}, hardness=1.5, sound="amethyst", light=11,
              emissive=True, map_color="color_cyan"),
        Block("prismara_magenta_crystal", "Magenta Prism Crystal", "crystal_block", {
            "all": tex("crystal", P_MAGENTA, seed="prismara-magenta", shards=8)}, hardness=1.5, sound="amethyst",
              light=11, emissive=True, map_color="color_magenta"),
        Block("prismara_cyan_shard", "Cyan Shard Cluster", "crystal_cluster", {
            "cross": tex("crystal_shard_sprite", P_CYAN, seed="prismara-cyan-shard", count=4)}, hardness=0.5,
              sound="amethyst_cluster", light=7, emissive=True, map_color="color_cyan"),
        Block("prismara_magenta_shard", "Magenta Shard Cluster", "crystal_cluster", {
            "cross": tex("crystal_shard_sprite", P_MAGENTA, seed="prismara-magenta-shard", count=3)}, hardness=0.5,
              sound="amethyst_cluster", light=7, emissive=True, map_color="color_magenta"),
        Block("prismara_lamp", "Prism Lamp", "glow", {"all": tex("lamp", P_LAMP, seed="prismara-lamp", style="orb")},
              hardness=0.8, sound="glass", light=15, emissive=True, map_color="color_light_blue"),
        Block("prismara_glowbulb", "Prism Glowbulb", "hanging_plant", {
            "cross": tex("bulb", ["#1d1938", "#302956", "#5a48a0"], ["#8af2ff", "#e6fdff", "#ffffff"],
                         seed="prismara-bulb")}, hardness=0.0, sound="cave_vines", light=12, emissive=True),
        Block("prismara_shard_floor", "Shard Field", "hazard", {
            "all": tex("ore", tex("stone", P_SLATE, seed="prismara-slate-b"), P_MAGENTA, seed="prismara-shardfloor",
                       clusters=7)}, hardness=2.0, sound="amethyst", damage=2.0, damage_type="cactus", light=4,
              map_color="color_purple"),
        Block("prismara_prism_ore", "Prism Ore", "ore", {
            "all": tex("ore", tex("stone", P_STONE, seed="prismara-stone"), ["#ff7ae0", "#ffe48a", "#8af2ff", "#ffffff"],
                       seed="prismara-ore")}, hardness=3.0, drop="prismara_prism_shard", drop_count=(1, 3), xp=(2, 5),
              light=5, map_color="color_blue"),
    ],
    items=[
        Item("prismara_prism_shard", "Prism Shard", tex("item_icon", "shard", ["#e03ac0", "#ff7ae0", "#8af2ff", "#ffffff"],
                                                         seed="prismara-shard"),
             rarity="uncommon", lore="Splits torchlight into seven colours and one that has no name."),
        Item("prismara_geode_heart", "Geode Heart", tex("item_icon", "core", P_MAGENTA, seed="prismara-heart"),
             rarity="rare", glint=True, lore="Still warm. Still beating, very slowly."),
        Item("prismara_crawler_leg", "Crystal Crawler Leg", tex("item_icon", "meat_raw", ["#304060", "#5ad8ff", "#c0f6ff"],
                                                                 seed="prismara-leg"),
             kind="food", food=Food(4, 0.5, effects=[Effect("minecraft:night_vision", 45, 0),
                                                     Effect("minecraft:glowing", 45, 0)]),
             lore="Crunchy outside, luminous inside. You will glow for a while."),
    ],
    creatures=[
        Creature("crystal_crawler", "Crystal Crawler", "crawler", ["#2e3a66", "#3fc8f0", "#c0f6ff", "#ff40c0", "#e03ac0"],
                 pattern="crystal", size=1.15,
                 body={"kind": "spider", "crystals": 5, "leg_len": 12, "eyes": 6, "eye_style": "glow", "mandibles": True,
                       "glow_tips": True, "spikes": 3},
                 behavior="hostile", attack="melee", health=22, damage=5, speed=0.3, armor=4,
                 abilities=["climb", "leap"], on_hit=Effect("minecraft:slowness", 3, 1), spawn_light="dark",
                 drops=[Drop("prismara_crawler_leg", 0, 2), Drop("prismara_prism_shard", 0, 1, chance=0.5)],
                 sounds="spider", pitch=1.35, xp=8, group=2,
                 description="A spider grown half out of crystal. The shards on its back chime as it runs."),
        Creature("geode_golem", "Geode Golem", "golem", ["#4a4560", "#6a5a90", "#e03ac0", "#2fd3f0", "#ff7ae0"],
                 pattern="veins", size=1.4,
                 body={"crystals": 7, "shoulders": True, "head_size": 0.85, "eye_style": "glow", "core": True,
                       "arm_w": 5, "spikes": 0},
                 behavior="neutral", attack="melee", health=80, damage=10, speed=0.18, armor=8, abilities=["regen"],
                 drops=[Drop("prismara_geode_heart", 0, 1, chance=0.35), Drop("minecraft:amethyst_shard", 2, 5)],
                 sounds="iron_golem", pitch=0.7, xp=15, group=1,
                 description="A walking geode. Crack it open and it closes up again - unless you crack it hard enough."),
        Creature("shimmer_moth", "Shimmer Moth", "flyer", ["#8a7aff", "#5af0ff", "#ff9ae8", "#202048", "#ffffff"],
                 pattern="glow_lines", size=1.2,
                 body={"kind": "moth", "antennae": 4, "fluffy": True, "eye_style": "compound"},
                 behavior="passive", health=6, speed=0.22, emissive=True, abilities=["glow_aura"],
                 drops=[Drop("minecraft:glowstone_dust", 0, 2), Drop("prismara_prism_shard", 0, 1, chance=0.15)],
                 sounds="allay", pitch=1.5, xp=2, group=3,
                 description="Its wings scatter crystal light into tiny rainbows. Drawn to lamps, harmless."),
    ],
    biomes=[
        Biome("cyan_hollows", "Cyan Hollows", top="prismara_glimmer_moss", under="prismara_stone", temperature=0.0,
              humidity=0.5, water_color="#3ae4ff", water_fog_color="#0c4a66", fog_color="#14304c",
              particles=[("minecraft:glow", 0.004), ("dust:#8af2ff:0.8", 0.006)], ambient="crystal_chimes",
              music="minecraft:music.overworld.lush_caves",
              features=[
                  CYAN_SPIRE,
                  Spire(blocks=[("prismara_stone", 3), ("prismara_cyan_crystal", 1)], tip="prismara_lamp", height=(6, 16),
                        radius=(1, 3), hanging=True, where="cave_ceiling", count=2),
                  CrystalCluster(block="prismara_cyan_crystal", small="prismara_cyan_shard", size=(3, 7), count=2),
                  CrystalCluster(block="prismara_cyan_crystal", small="prismara_cyan_shard", size=(2, 5),
                                 where="cave_ceiling", count=2),
                  Patch(block="prismara_cyan_shard", count=4, tries=24),
                  Patch(block="prismara_glowbulb", where="cave_ceiling", count=5, tries=24),
                  Ore(block="prismara_prism_ore", size=6, count=3, where="anywhere", y=(4, 200)),
              ],
              spawns=[Spawn("shimmer_moth", 12, (2, 4)), Spawn("crystal_crawler", 5, (1, 2)),
                      Spawn("geode_golem", 2, (1, 1))]),
        Biome("magenta_depths", "Magenta Depths", top="prismara_slate", under="prismara_slate", stone="prismara_slate",
              temperature=0.9, humidity=-0.3, water_color="#e05ad0", water_fog_color="#4a0c40", fog_color="#2e0c30",
              fog_end=110, particles=[("dust:#ff7ae0:0.9", 0.008), ("minecraft:reverse_portal", 0.002)],
              ambient="eerie_choir", music="minecraft:music.overworld.deep_dark",
              surface_noise=[("prismara_shard_floor", 0.55)],
              features=[
                  MAGENTA_SPIRE,
                  Spire(blocks=[("prismara_magenta_crystal", 2), ("prismara_slate", 3)], tip="prismara_magenta_crystal",
                        height=(8, 22), radius=(2, 3), hanging=True, where="cave_ceiling", count=2),
                  CrystalCluster(block="prismara_magenta_crystal", small="prismara_magenta_shard", size=(4, 8), count=2),
                  Patch(block="prismara_magenta_shard", count=5, tries=24),
                  Patch(block="prismara_magenta_shard", where="cave_ceiling", count=3, tries=16),
                  Geode(outer="prismara_slate", middle="prismara_stone", inner="prismara_magenta_crystal",
                        crystals=["prismara_magenta_shard"], count=1, chance=5, where="anywhere", y=(10, 200)),
              ],
              spawns=[Spawn("crystal_crawler", 10, (1, 3)), Spawn("shimmer_moth", 3, (1, 2)),
                      Spawn("geode_golem", 2, (1, 1))]),
        Biome("prism_shallows", "Prism Shallows", top="prismara_crystal_sand", under="prismara_stone",
              temperature=-0.9, humidity=0.2, underwater="prismara_crystal_sand", water_color="#5af0ff",
              water_fog_color="#1a6a8a", fog_color="#1c2a50",
              particles=[("minecraft:end_rod", 0.002), ("dust:#ffffff:0.6", 0.005)], ambient="crystal_chimes",
              music="minecraft:music.overworld.dripstone_caves",
              features=[
                  Lake(fluid="minecraft:water", border="prismara_cyan_crystal", count=1, chance=2),
                  CrystalCluster(block="prismara_cyan_crystal", small="prismara_cyan_shard", size=(3, 6), count=1),
                  CrystalCluster(block="prismara_magenta_crystal", small="prismara_magenta_shard", size=(3, 6), count=1),
                  Spire(blocks=[("prismara_crystal_sand", 1), ("prismara_stone", 2)], tip="prismara_lamp",
                        height=(5, 12), radius=(1, 2), count=1),
                  Patch(block="prismara_glowbulb", where="cave_ceiling", count=6, tries=24),
                  Patch(blocks=[("prismara_cyan_shard", 1), ("prismara_magenta_shard", 1)], where="underwater",
                        count=3, tries=16),
              ],
              spawns=[Spawn("shimmer_moth", 14, (2, 5)), Spawn("geode_golem", 2, (1, 1)),
                      Spawn("crystal_crawler", 3, (1, 1))]),
        Biome("geode_vaults", "Geode Vaults", top="prismara_slate", under="prismara_slate", temperature=0.2,
              humidity=-1.0, water_color="#c08aff", water_fog_color="#3a1a5a", fog_color="#261a3a",
              particles=[("dust:#f0c040:0.7", 0.004), ("minecraft:wax_on", 0.001)], ambient="alien_hum",
              surface_noise=[("minecraft:calcite", 0.55), ("prismara_glimmer_moss", 0.35)],
              music="minecraft:music.overworld.dripstone_caves",
              features=[
                  Geode(outer="prismara_slate", middle="prismara_stone", inner="prismara_cyan_crystal",
                        crystals=["prismara_cyan_shard"], count=1, chance=2, where="anywhere", y=(10, 200)),
                  Geode(outer="prismara_slate", middle="prismara_stone", inner="minecraft:amethyst_block",
                        budding="minecraft:budding_amethyst", crystals=["minecraft:amethyst_cluster"], count=1, chance=4,
                        where="anywhere", y=(10, 200)),
                  Boulder(blocks=[("prismara_cyan_crystal", 1), ("prismara_magenta_crystal", 1), ("minecraft:amethyst_block", 1)],
                          radius=(2, 4), count=1),
                  CrystalCluster(block="minecraft:amethyst_block", small="minecraft:amethyst_cluster", size=(3, 6), count=1),
                  Patch(block="prismara_glowbulb", where="cave_ceiling", count=3, tries=16),
                  Ore(block="prismara_prism_ore", size=8, count=5, where="anywhere", y=(4, 200)),
              ],
              spawns=[Spawn("geode_golem", 6, (1, 1)), Spawn("crystal_crawler", 6, (1, 2)),
                      Spawn("shimmer_moth", 6, (1, 3))]),
    ],
    effects=[],
    ambient="crystal_chimes",
    music="minecraft:music.overworld.lush_caves",
    platform="prismara_stone",
    icon="portalgun:prismara_prism_shard",
)
