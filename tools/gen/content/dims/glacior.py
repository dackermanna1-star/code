"""F-12 Glacior - a frozen mountain world beneath a permanent aurora."""
from gen.content.dsl import *

# palette: night navy, glacier blue, ice white, frost cyan, aurora green, aurora violet
P_SNOW = ["#b8cce4", "#cddcef", "#e0eaf7", "#eef4fc", "#ffffff"]
P_PERMAFROST = ["#3a4250", "#4a5464", "#5c6878", "#707c8c"]
P_STONE = ["#22304a", "#2e3e5c", "#3c4e6e", "#4e6284", "#62789c"]
P_GLACIER = ["#2a64a8", "#3a7cc4", "#5a9ad8", "#8ac0f0", "#c0e4ff"]
P_AURORA = ["#106a5a", "#20b088", "#50ffb0", "#a0ffe0", "#e0d0ff"]
P_FROST = ["#4a8ad0", "#7ab8f0", "#b0e0ff", "#e8f8ff"]
P_PINE_BARK = ["#2a2a3a", "#3a3a4e", "#4c4c62", "#5e5e76"]
P_NEEDLES = ["#1a3a4a", "#245468", "#2e6e84", "#4a8ea4", "#8ac4d4"]


def _icicle(pal, seed):
    """Cross sprite of 2-3 icicles hanging from the top edge, tapering to sharp points."""
    import numpy as np
    from PIL import Image
    from gen.noise import rng
    from gen.textures import pal as P
    cols = [np.array([int(c[i:i + 2], 16) for i in (1, 3, 5)] + [255], float) for c in P(pal)]
    r = rng(seed)
    a = np.zeros((16, 16, 4))
    xs = [3 + int(r.integers(0, 2)), 7 + int(r.integers(0, 2)), 11 + int(r.integers(0, 2))]
    lens = [9 + int(r.integers(0, 4)), 13 + int(r.integers(0, 3)), 7 + int(r.integers(0, 4))]
    for x0, ln in zip(xs, lens):
        for y in range(ln):
            w = 3 if y < ln * 0.35 else (2 if y < ln * 0.75 else 1)
            for dx in range(w):
                x = x0 + dx - (w // 2)
                if 0 <= x < 16:
                    shade = 1 + (1 if dx == 0 else 0) + (1 if y < 3 else 0)
                    a[y, x] = cols[min(len(cols) - 1, shade)]
            if y < ln - 1 and w > 1:
                a[y, max(0, x0 - (w // 2))] = cols[-1]       # bright highlight down the left edge
        a[0, max(0, x0 - 2):min(16, x0 + 3)] = cols[1]
    return Image.fromarray(a.astype("uint8"), "RGBA")


DIMENSION = Dimension(
    id="glacior",
    code="F-12",
    name="Glacior",
    tagline="Frozen peaks under a sky that never stops dancing",
    description=("An ice age that never ended: glacier-walled mountains, a frozen sea locked under pack ice, and "
                 "blue ice caverns full of humming crystals, all under a green-and-violet aurora that never fades. "
                 "Snow Hoppers bound through the frostpine woods. Ice Beetles lurk where the glaciers crack, and the "
                 "Frost Yeti does not like being followed."),
    danger=3,
    color="#8ac0f0",
    terrain=Terrain(style="mountains", stone="glacior_glacier_ice", sea_level=63, height=80, amplitude=52,
                    roughness=0.32, deepslate="glacior_bluestone",
                    params={"coverage": 0.6, "peaks": 0.75, "rivers": 0.15,
                            "peak_block": "minecraft:snow_block", "peak_y": 125, "ceiling_block": "minecraft:packed_ice",
                            "beach_block": "minecraft:gravel", "beach_height": 1, "biome_size": 300}),
    sky=Sky(sky_color="#0a1838", fog_color="#1c3460", water_fog_color="#0a2a50", fog_start=40, fog_end=220,
            cloud_color="#556a9ad8", cloud_height=210, time="night", star_brightness=1.0, moon_phase="full_moon",
            ambient_light=0.2, sky_light_color="#a0c8ff",
            bodies=[
                Celestial("aurora", ["#40ffa0", "#40c0ff", "#c060ff"], size=190, yaw=180, pitch=38, alpha=0.95,
                          additive=True, seed="glacior-aurora1"),
                Celestial("aurora", ["#60ff80", "#30e0c0", "#5080ff"], size=150, yaw=40, pitch=55, roll=20, alpha=0.85,
                          additive=True, speed=3, seed="glacior-aurora2"),
                Celestial("aurora", ["#c060ff", "#ff60c0", "#40c0ff"], size=140, yaw=290, pitch=30, roll=-15,
                          alpha=0.7, additive=True, seed="glacior-aurora3"),
                Celestial("moon", ["#e8f4ff", "#a0b8d8", "#506080"], size=34, yaw=120, pitch=58, seed="glacior-moon"),
            ]),
    blocks=[
        Block("glacior_snowcap", "Packed Snow", "grass", {
            "top": tex("snow", P_SNOW, seed="glacior-snow"),
            "side": tex("grass_side", P_SNOW, P_PERMAFROST, seed="glacior-snowside"),
            "bottom": tex("dirt", P_PERMAFROST, seed="glacior-permafrost")}, hardness=0.6, sound="snow",
              map_color="snow"),
        Block("glacior_permafrost", "Permafrost", "soil", {"all": tex("dirt", P_PERMAFROST, seed="glacior-permafrost")},
              hardness=0.9, sound="gravel", map_color="color_gray"),
        Block("glacior_bluestone", "Bluestone", "stone", {"all": tex("stone", P_STONE, seed="glacior-stone")},
              hardness=1.5, map_color="color_blue"),
        Block("glacior_glacier_ice", "Glacier Ice", "solid", {"all": tex("ice", P_GLACIER, seed="glacior-glacier",
                                                                          alpha=(255, 255))},
              hardness=0.8, sound="glass", friction=0.8, map_color="ice", tool="pickaxe"),
        Block("glacior_aurora_ice", "Auroral Ice", "glow",
              {"all": tex("crystal", P_AURORA, seed="glacior-aurora-ice", frames=10, frametime=4)},
              hardness=0.8, sound="glass", light=13, emissive=True, friction=0.98, map_color="color_light_green"),
        Block("glacior_frost_crystal", "Frost Crystal", "crystal_cluster",
              {"cross": tex("crystal_shard_sprite", P_FROST, seed="glacior-frostcrystal", count=3)},
              hardness=0.6, light=8, emissive=True, sound="amethyst_cluster"),
        Block("glacior_icicle", "Icicle", "hanging_plant", {"cross": tex(_icicle, P_FROST, "glacior-icicle")},
              hardness=0.2, sound="glass", light=3),
        Block("glacior_frostbloom", "Frostbloom", "plant",
              {"cross": tex("flower", ["#2a4a6a", "#3a6a8a", "#5a8aaa"], ["#80c0ff", "#c0e8ff", "#ffffff"],
                            seed="glacior-bloom", shape="bell")},
              hardness=0.0, sound="grass", light=5, emissive=True, fruit="glacior_snowberry",
              particle="minecraft:snowflake"),
        Block("glacior_snowgrass", "Snowgrass", "plant",
              {"cross": tex("grass_tuft", ["#5a7a90", "#7a9ab0", "#a0bcd0", "#d0e4f0"], seed="glacior-snowgrass")},
              hardness=0.0, sound="grass"),
        Block("glacior_frostpine_log", "Frostpine Log", "log", {
            "side": tex("log_side", P_PINE_BARK, seed="glacior-pine"),
            "end": tex("log_top", P_PINE_BARK, ["#8a9ab0", "#b0c0d4"], seed="glacior-pine-end")}, hardness=2.0,
              sound="wood", flammable=True, map_color="color_gray"),
        Block("glacior_frostpine_needles", "Frostpine Needles", "leaves",
              {"all": tex("leaves", P_NEEDLES, seed="glacior-needles", holes=0.2)}, hardness=0.2, sound="grass",
              flammable=True, map_color="color_cyan", particle="minecraft:snowflake"),
    ],
    items=[
        Item("glacior_yeti_fur", "Yeti Fur", tex("item_icon", "feather", ["#9ab0c8", "#e8f0f8", "#ffffff"],
                                                 seed="glacior-fur"),
             rarity="uncommon", lore="Impossibly warm. Smells faintly of peppermint."),
        Item("glacior_snowberry", "Snowberry", tex("item_icon", "berry", ["#3a7cc4", "#8ac0f0", "#e8f8ff"],
                                                   seed="glacior-berry"),
             kind="food", food=Food(2, 0.3, always=True, fast=True,
                                    effects=[Effect("minecraft:jump_boost", 30, 1), Effect("minecraft:speed", 15, 0)]),
             lore="Crunchy, fizzy, and it makes your feet bouncy."),
        Item("glacior_frost_carapace", "Frost Carapace", tex("item_icon", "shell", P_GLACIER[1:], seed="glacior-shell"),
             lore="Cold enough to keep a drink chilled for a week."),
    ],
    creatures=[
        Creature("frost_yeti", "Frost Yeti", "biped", ["#f2f6fc", "#a8c8e8", "#3a90e8", "#40e0ff", "#203858"],
                 pattern="patches", size=1.7,
                 body={"bulky": True, "fur": True, "horns": "ram", "mouth": "tusks", "brows": True, "head_size": 0.95,
                       "claws": True, "ears": "round", "eye_style": "angry", "stance": "hunched", "arm_len": 15,
                       "crystals": 3},
                 behavior="neutral", health=70, damage=9, armor=4, speed=0.27, abilities=["leap", "regen"],
                 on_hit=Effect("minecraft:slowness", 4, 1), tempt="glacior_snowberry",
                 drops=[Drop("glacior_yeti_fur", 1, 3), Drop("glacior_snowberry", 0, 2)],
                 sounds="polar_bear", pitch=0.6, xp=20, group=1, tracking=10,
                 description="A shaggy mountain of fur and frost. Mostly gentle - unless you follow it home."),
        Creature("ice_beetle", "Ice Beetle", "crawler", ["#2a5a9a", "#a8e0ff", "#eef8ff", "#50ffb0"],
                 pattern="crystal", size=0.9,
                 body={"kind": "beetle", "shell": True, "crystals": 3, "horns": "small", "mandibles": True,
                       "eye_style": "glow", "antennae": 3},
                 behavior="hostile", health=18, damage=4, armor=6, speed=0.27, abilities=["shield"],
                 on_hit=Effect("minecraft:slowness", 4, 0), spawn_light="dark",
                 drops=[Drop("glacior_frost_carapace", 0, 1, chance=0.6), Drop("minecraft:snowball", 0, 3)],
                 sounds="silverfish", pitch=0.8, xp=6, group=3,
                 description="It looks like a chunk of the glacier until it skitters toward you."),
        Creature("snow_hopper", "Snow Hopper", "hopper", ["#f4f8ff", "#c8d8ec", "#80c0ff", "#203050", "#ffb0c8"],
                 pattern="speckle", size=0.75,
                 body={"kind": "rabbit", "ears": "bunny", "fur": True, "tail": 1, "tail_kind": "puff",
                       "eye_style": "cute", "blush": True, "whiskers": True, "leg_len": 6},
                 behavior="passive", health=8, speed=0.32, tempt="glacior_snowberry",
                 drops=[Drop("glacior_snowberry", 0, 1), Drop("minecraft:rabbit_hide", 0, 1)],
                 sounds="rabbit", pitch=1.2, xp=2, group=4,
                 description="A snowball with feet. Herds of them bound through the drifts after snowberries."),
    ],
    biomes=[
        Biome("glacior_glacier_fields", "Glacier Fields", top="glacior_snowcap", under="glacior_glacier_ice",
              temperature=-0.2, humidity=-0.2, elevation=0.2, snowy=True, precipitation=True,
              grass_color="#a0bcd0", foliage_color="#4a8ea4", water_color="#3a7cc4", water_fog_color="#0a2a50",
              particles=[("minecraft:snowflake", 0.012)], ambient="wind_howl",
              features=[
                  Spire(blocks=[("glacior_glacier_ice", 4), ("minecraft:packed_ice", 2), ("minecraft:blue_ice", 1)],
                        tip="glacior_aurora_ice", height=(10, 28), radius=(1, 3), lean=0.08, count=1),
                  Boulder(blocks=[("minecraft:snow_block", 3), ("glacior_glacier_ice", 1)], radius=(2, 3), squash=0.5,
                          count=1, chance=2),
                  Patch(block="glacior_snowgrass", count=2, tries=16),
                  Patch(block="glacior_frostbloom", count=1, tries=8, chance=2),
                  Spire(where="cave_ceiling", hanging=True, blocks=[("minecraft:blue_ice", 2), ("glacior_glacier_ice", 1)],
                        height=(4, 10), radius=(1, 2), count=2),
                  Patch(where="cave_ceiling", block="glacior_icicle", count=4, tries=24),
                  CrystalCluster(where="cave_floor", block="glacior_aurora_ice", small="glacior_frost_crystal",
                                 size=(3, 6), count=1),
                  Ore(block="minecraft:blue_ice", size=12, count=4, y=(-50, 60)),
                  Ore(block="glacior_bluestone", size=32, count=5, y=(0, 160)),
              ],
              spawns=[Spawn("snow_hopper", 10, (2, 4)), Spawn("ice_beetle", 5, (1, 3)), Spawn("frost_yeti", 2, (1, 1))]),
        Biome("glacior_frostpine_taiga", "Frostpine Taiga", top="glacior_snowcap", under="glacior_permafrost",
              temperature=0.5, humidity=0.6, elevation=-0.1, snowy=True, precipitation=True,
              grass_color="#7a9ab0", foliage_color="#2e6e84", water_color="#3a7cc4",
              particles=[("minecraft:snowflake", 0.02)], ambient="wind_howl",
              music="minecraft:music.overworld.snowy_slopes",
              features=[
                  Tree(log="glacior_frostpine_log", leaves="glacior_frostpine_needles", shape="spruce", height=(8, 14),
                       count=4),
                  Patch(block="glacior_frostbloom", count=2, tries=16),
                  Patch(block="glacior_snowgrass", count=4, tries=24),
                  Boulder(blocks=[("glacior_bluestone", 3), ("minecraft:snow_block", 1)], radius=(1, 2), count=1, chance=3),
                  Patch(where="cave_ceiling", block="glacior_icicle", count=3, tries=24),
                  Ore(block="minecraft:blue_ice", size=10, count=3, y=(-50, 60)),
                  Ore(block="glacior_bluestone", size=32, count=5, y=(0, 160)),
              ],
              spawns=[Spawn("snow_hopper", 14, (2, 5)), Spawn("frost_yeti", 3, (1, 1)), Spawn("ice_beetle", 2, (1, 2))]),
        Biome("glacior_frozen_sea", "Frozen Sea", top="minecraft:snow_block", under="minecraft:packed_ice",
              underwater="minecraft:gravel", temperature=0.0, humidity=0.2, elevation=-0.9, snowy=True,
              precipitation=True, grass_color="#a0bcd0", water_color="#2a5aa0", water_fog_color="#081e40",
              particles=[("minecraft:snowflake", 0.015)], ambient="wind_howl",
              features=[
                  Vanilla(id="minecraft:iceberg_packed"),
                  Vanilla(id="minecraft:iceberg_blue"),
                  Spire(blocks=[("minecraft:packed_ice", 3), ("minecraft:blue_ice", 1)], tip="glacior_aurora_ice",
                        height=(6, 14), radius=(1, 2), count=1, chance=3),
                  Patch(where="underwater", block="glacior_frost_crystal", count=2, tries=12),
              ],
              spawns=[Spawn("snow_hopper", 6, (1, 3)), Spawn("ice_beetle", 3, (1, 2))]),
        Biome("glacior_aurora_peaks", "Aurora Peaks", top="glacior_snowcap", under="glacior_glacier_ice",
              stone="glacior_bluestone", temperature=-0.7, humidity=0.4, elevation=0.9, snowy=True,
              precipitation=True, grass_color="#a0bcd0", water_color="#3a7cc4", fog_color="#2a3a70",
              particles=[("minecraft:snowflake", 0.03), ("dust:#50ffb0:0.8", 0.002)], ambient="crystal_chimes",
              music="minecraft:music.overworld.frozen_peaks",
              features=[
                  CrystalCluster(block="glacior_aurora_ice", small="glacior_frost_crystal", size=(4, 8), count=1,
                                 chance=2),
                  Spire(blocks=[("glacior_glacier_ice", 3), ("minecraft:blue_ice", 2)], tip="glacior_aurora_ice",
                        height=(14, 32), radius=(2, 3), lean=0.15, count=1, chance=2),
                  Patch(block="glacior_frost_crystal", count=2, tries=12),
                  Patch(where="cave_ceiling", block="glacior_icicle", count=4, tries=24),
                  Ore(block="minecraft:blue_ice", size=14, count=5, y=(-50, 140)),
                  Ore(block="glacior_bluestone", size=32, count=4, y=(0, 200)),
              ],
              spawns=[Spawn("ice_beetle", 6, (1, 3)), Spawn("frost_yeti", 4, (1, 1)), Spawn("snow_hopper", 3, (1, 2))]),
    ],
    effects=[],
    music="minecraft:music.overworld.frozen_peaks",
    ambient="wind_howl",
    icon="portalgun:glacior_snowberry",
)
