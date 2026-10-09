"""H-13 Spectral Vale - a fog-drowned moor at eternal midnight, where the dead do not stay put."""
import numpy as np
from PIL import Image

from gen.content.dsl import *
from gen.noise import rng

# palette: midnight navy, moor grey-green, bone white, peat brown-violet, soulfire cyan
P_MOOR = ["#2a3430", "#36443c", "#445448", "#566656", "#6e7e6a"]
P_PEAT = ["#241e24", "#30282e", "#3e343a", "#4c4248"]
P_STONE = ["#3a404c", "#4a505c", "#5a606c", "#6c727e", "#80869a"]
P_DEADWOOD = ["#2c2a2e", "#3e3b40", "#545056", "#6e6a6e", "#8e8a8a"]
P_WITHERED = ["#2e2a24", "#423a2e", "#5a4e3c", "#706250", "#8a7c66"]
P_SOUL = ["#0e5a6a", "#18a0b0", "#40e0f0", "#a0fcff", "#e8ffff"]
P_HEATHER = ["#3a3448", "#4e4660", "#6a5e7c", "#8a7c9a"]


def _rgb(c):
    c = c.lstrip("#")
    return np.array([int(c[i:i + 2], 16) for i in (0, 2, 4)], float)


def gravestone(seed):
    """Weathered headstone: cold grey stone, an engraved cross and epitaph lines, lichen creeping up from the base."""
    from gen.textures import stone
    a = np.array(stone(P_STONE[1:], seed)).astype(float)
    R = rng(seed)
    dark = _rgb("#30343e")
    lite = _rgb("#8a90a0")
    # engraved cross (dark groove with a highlight on its lower-right edge)
    cross = [(x, 3) for x in range(5, 11)] + [(7, y) for y in range(1, 9)] + [(8, y) for y in range(1, 9)]
    cross += [(x, 4) for x in range(5, 11)]
    for x, y in cross:
        a[y, x, :3] = dark
    for x, y in cross:
        if (x + 1, y) not in cross and x + 1 < 16:
            a[y, x + 1, :3] = lite
        if (x, y + 1) not in cross and y + 1 < 16:
            a[y + 1, x, :3] = lite
    # epitaph scratches
    for yy in (11, 13):
        x0 = int(R.integers(2, 5))
        for x in range(x0, 16 - x0):
            if R.uniform() < 0.75:
                a[yy, x, :3] = dark * 1.15
    # lichen / moss at the base and a crack
    for x in range(16):
        h = int(R.integers(0, 4))
        for y in range(16 - h, 16):
            a[y, x, :3] = _rgb(["#3e5a44", "#4e6e50", "#5e7e58"][int(R.integers(0, 3))])
    cx = int(R.integers(2, 13))
    for y in range(6, 12):
        cx = int(np.clip(cx + R.integers(-1, 2), 0, 15))
        a[y, cx, :3] = dark * 0.8
    a[..., 3] = 255
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "RGBA")


def dead_twigs(seed):
    """Bare, crooked twigs on a transparent background - a leafless canopy that reads as dead branches."""
    R = rng(seed)
    a = np.zeros((16, 16, 4))
    cols = [_rgb(c) for c in ("#2a2628", "#3a3538", "#4e484a", "#6a6264")]
    for _ in range(7):
        x, y = float(R.uniform(0, 16)), float(R.uniform(0, 16))
        ang = R.uniform(0, 2 * np.pi)
        for step in range(int(R.integers(4, 9))):
            ix, iy = int(x) % 16, int(y) % 16
            a[iy, ix, :3] = cols[int(R.integers(0, 4))]
            a[iy, ix, 3] = 255
            if R.uniform() < 0.25:
                bx, by = (ix + int(R.choice([-1, 1]))) % 16, (iy - 1) % 16
                a[by, bx, :3] = cols[3]
                a[by, bx, 3] = 255
            ang += R.uniform(-0.9, 0.9)
            x += np.cos(ang)
            y += np.sin(ang)
    # a few clinging dead leaves
    for _ in range(4):
        x, y = int(R.integers(0, 16)), int(R.integers(0, 16))
        a[y, x, :3] = _rgb(["#5a4e3c", "#706250"][int(R.integers(0, 2))])
        a[y, x, 3] = 255
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "RGBA")


def soul_fissure(seed):
    """Black barrow stone split by glowing soulfire cracks."""
    from gen.textures import stone
    a = np.array(stone(["#16181e", "#20232a", "#2a2e36", "#363a44"], seed)).astype(float)
    R = rng(seed)
    glow = [_rgb(c) for c in P_SOUL]
    for _ in range(3):
        x, y = float(R.uniform(2, 14)), float(R.uniform(2, 14))
        ang = R.uniform(0, 2 * np.pi)
        for step in range(14):
            ix, iy = int(x) % 16, int(y) % 16
            a[iy, ix, :3] = glow[3]
            for dx, dy in ((1, 0), (0, 1), (-1, 0), (0, -1)):
                jx, jy = (ix + dx) % 16, (iy + dy) % 16
                if a[jy, jx, :3].mean() < 80:
                    a[jy, jx, :3] = glow[1]
            ang += R.uniform(-0.8, 0.8)
            x += np.cos(ang)
            y += np.sin(ang)
    a[7:9, 7:9, :3] = glow[4]
    a[..., 3] = 255
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "RGBA")


GRAVES = Patch(blocks=[("spectral_gravestone", 5), ("minecraft:mossy_stone_brick_wall", 2),
                       ("minecraft:cobblestone_wall", 1), ("minecraft:mossy_cobblestone_wall", 1)],
               count=2, tries=10, spread=5)

DEAD_TREE = Tree(log="spectral_deadwood_log", leaves="spectral_withered_leaves", shape="twisted", height=(7, 12),
                 decoration="spectral_ghost_moss")

DIMENSION = Dimension(
    id="spectral_vale",
    code="H-13",
    name="Spectral Vale",
    tagline="A moor where it is always midnight and never quiet",
    description=("A fog-drowned moor stuck at the stroke of midnight: dead trees claw at a huge pale moon, crooked "
                 "gravestones lean in rows nobody remembers planting, and soulfire hisses up through the bogs. "
                 "Will-o'-Wisps drift between the barrows and light your way - but the Bone Hounds hunt in packs, and "
                 "the Wraiths come from wherever the fog is thickest."),
    danger=4,
    color="#5ff0ff",
    terrain=Terrain(style="hills", stone="spectral_barrow_stone", sea_level=62, height=68, amplitude=15, scale=1.5,
                    roughness=0.14, deepslate="minecraft:deepslate",
                    params={"rivers": 0.3, "detail": 0.45, "biome_size": 240, "ceiling_block": "spectral_peat",
                            "cliff_block": "spectral_barrow_stone", "beach_block": "spectral_peat", "beach_height": 1}),
    sky=Sky(sky_color="#0c1220", fog_color="#283244", water_fog_color="#0a2028", fog_start=6, fog_end=64,
            cloud_color="#40202838", cloud_height=150, time="midnight", star_brightness=0.45, moon_phase="full_moon",
            ambient_light=0.16, sky_light_color="#8ab0d0",
            bodies=[Celestial("moon", ["#eef6ff", "#b8c8dc", "#6a7c94"], size=62, yaw=160, pitch=32, seed="vale-moon"),
                    Celestial("nebula", ["#0e5a6a", "#18a0b0", "#40e0f0", "#203048"], size=170, yaw=330, pitch=55,
                              alpha=0.35, additive=True, seed="vale-veil")]),
    blocks=[
        Block("spectral_moor_grass", "Moor Grass", "grass", {
            "top": tex("grass_top", P_MOOR, seed="vale-moor"),
            "side": tex("grass_side", P_MOOR, P_PEAT, seed="vale-moor-side"),
            "bottom": tex("dirt", P_PEAT, seed="vale-peat")}, hardness=0.6, sound="grass", map_color="color_gray"),
        Block("spectral_peat", "Grave Peat", "soil", {"all": tex("dirt", P_PEAT, seed="vale-peat")}, hardness=0.6,
              sound="mud", map_color="color_black"),
        Block("spectral_barrow_stone", "Barrow Stone", "stone", {"all": tex("rough_stone", P_STONE, seed="vale-stone")},
              hardness=1.6, map_color="color_gray"),
        Block("spectral_gravestone", "Gravestone", "stone", {"all": tex(gravestone, "vale-grave")}, hardness=2.0,
              map_color="stone"),
        Block("spectral_deadwood_log", "Deadwood Log", "log", {
            "side": tex("log_side", P_DEADWOOD, seed="vale-deadwood"),
            "end": tex("log_top", P_DEADWOOD, ["#5a5658", "#46424a"], seed="vale-deadwood-end")}, hardness=1.8,
              sound="wood", flammable=True, map_color="color_gray"),
        Block("spectral_withered_leaves", "Withered Branches", "leaves",
              {"all": tex(dead_twigs, "vale-withered")}, hardness=0.2, sound="grass",
              flammable=True, map_color="color_brown", particle="minecraft:white_ash"),
        Block("spectral_ghost_moss", "Ghost Moss", "hanging_plant",
              {"cross": tex("tendril", ["#5a8a90", "#90c8cc", "#d8fcff"], seed="vale-ghostmoss")}, hardness=0.0,
              sound="cave_vines", light=4, emissive=True),
        Block("spectral_ghostbloom", "Ghostbloom", "plant",
              {"cross": tex("flower", ["#2a3a3c", "#3a5054", "#4e6a6e"], P_SOUL[1:], seed="vale-bloom", shape="bell")},
              hardness=0.0, sound="grass", light=7, emissive=True, particle="minecraft:soul"),
        Block("spectral_heather", "Grave Heather", "plant", {"cross": tex("grass_tuft", P_HEATHER, seed="vale-heather")},
              hardness=0.0, sound="grass"),
        Block("spectral_soulfire_vent", "Soulfire Vent", "vent", {
            "top": tex(soul_fissure, "vale-fissure"),
            "side": tex("rough_stone", P_STONE, seed="vale-stone")}, hardness=1.5, sound="soul_soil",
              particle="minecraft:soul_fire_flame", light=9, emissive=True, effect="minecraft:slowness",
              effect_seconds=3, map_color="color_cyan"),
        Block("spectral_ghost_lily", "Ghost Lily", "lily",
              {"top": tex("lily_pad", ["#1a4a50", "#3a8a90", "#a0f0f0"], seed="vale-lily")}, hardness=0.0,
              sound="lily_pad", light=6, emissive=True, map_color="color_cyan"),
    ],
    items=[
        Item("spectral_ectoplasm", "Ectoplasm", tex("item_icon", "goo", ["#2a8a90", "#60e0e8", "#d0ffff"], seed="vale-ecto"),
             rarity="uncommon", lore="Cold, wobbly, and faintly humming a funeral march."),
        Item("spectral_wisp_essence", "Bottled Wisp", tex("item_icon", "bottle", P_SOUL[1:], seed="vale-wisp"),
             kind="food", food=Food(1, 0.2, always=True, fast=True,
                                    effects=[Effect("minecraft:night_vision", 90, 0), Effect("minecraft:glowing", 20, 0)]),
             lore="Drink the light. Try not to think about where it came from."),
        Item("spectral_hound_fang", "Hound Fang", tex("item_icon", "fang", ["#a8a090", "#d8d0b8", "#f8f4e8"],
                                                      seed="vale-fang"),
             lore="Still snaps shut on its own if you leave it on a table."),
    ],
    creatures=[
        Creature("wraith", "Wraith", "floater", ["#2a3442", "#4a5a6a", "#7ff8ff", "#a0ffff"], pattern="glow_lines",
                 size=1.3,
                 body={"kind": "ghost", "translucent": True, "arms": 2, "eye_style": "glow", "mouth": "open",
                       "body_h": 18, "body_w": 10, "claws": True, "horns": "none"},
                 behavior="hostile", health=28, damage=5, speed=0.28, armor=2, abilities=["blink", "glow_aura"],
                 on_hit=Effect("minecraft:wither", 4, 0), spawn_light="dark", fire_immune=True,
                 drops=[Drop("spectral_ectoplasm", 0, 2)], sounds="vex", pitch=0.55, xp=10, group=1, tracking=8,
                 description="A tattered shape of fog with burning eyes. Look away and it is suddenly closer."),
        Creature("bone_hound", "Bone Hound", "quadruped", ["#d8d0b8", "#8a8070", "#60f0ff", "#60f0ff"],
                 pattern="stripes", size=1.0,
                 body={"undead": True, "mouth": "fangs", "jaw": True, "ears": "pointy", "snout": 5, "leg_len": 8,
                       "leg_w": 2, "body_len": 14, "body_h": 7, "body_w": 7, "spikes": 5, "tail": 3, "tail_kind": "thin",
                       "eye_style": "glow", "claws": True},
                 behavior="hostile", health=20, damage=5, speed=0.33, abilities=["leap", "swarm"], spawn_light="dark",
                 drops=[Drop("minecraft:bone", 1, 3), Drop("spectral_hound_fang", 0, 1, chance=0.4)],
                 sounds="zoglin", pitch=1.25, xp=7, group=3,
                 description="A wolf that forgot to stay buried. Where one howls, three more are listening."),
        Creature("will_o_wisp", "Will-o'-Wisp", "floater", ["#7ff8ff", "#e0ffff", "#40c0e0", "#0a3a48"],
                 pattern="glow_lines", size=0.5,
                 body={"kind": "wisp", "motes": 6, "body_w": 6, "translucent": True, "eye_style": "cute"},
                 behavior="passive", health=6, speed=0.16, emissive=True, abilities=["glow_aura"],
                 ranged={"color": "#80f8ff"}, category="ambient",
                 drops=[Drop("spectral_wisp_essence", 0, 1)], sounds="allay", pitch=0.8, xp=2, group=3,
                 description="A lost little light. Stay near one and the dark gets easier to see through."),
    ],
    biomes=[
        Biome("spectral_barrow_moor", "Barrow Moor", top="spectral_moor_grass", under="spectral_peat",
              temperature=0.0, humidity=-0.2, elevation=0.15, grass_color="#445448", foliage_color="#5a4e3c",
              water_color="#2a4a58", water_fog_color="#0a2028",
              particles=[("minecraft:white_ash", 0.01), ("minecraft:soul", 0.0006)],
              ambient="wind_howl", music="minecraft:music.nether.soul_sand_valley",
              features=[
                  Patch(block="spectral_heather", count=6, tries=40),
                  Patch(block="spectral_ghostbloom", count=1, tries=10),
                  GRAVES,
                  Tree(log="spectral_deadwood_log", leaves="spectral_withered_leaves", shape="twisted",
                       height=(7, 12), decoration="spectral_ghost_moss", count=1, chance=2),
                  Structure(kind="ring", blocks={"main": "spectral_barrow_stone", "alt": "minecraft:mossy_cobblestone"},
                            size=(6, 9), params={"sink": 0.2, "thickness": 0.18}, chance=14),
                  Boulder(blocks=[("spectral_barrow_stone", 4), ("minecraft:mossy_cobblestone", 1)], radius=(1, 3),
                          squash=0.8, count=1, chance=3),
                  Patch(block="spectral_soulfire_vent", count=1, tries=3, chance=4),
              ],
              spawns=[Spawn("will_o_wisp", 10, (1, 3)), Spawn("bone_hound", 6, (2, 3)), Spawn("wraith", 4, (1, 1))]),
        Biome("spectral_soulfire_bog", "Soulfire Bog", top="spectral_peat", under="spectral_peat",
              temperature=0.5, humidity=0.65, elevation=-0.45, underwater="spectral_peat",
              grass_color="#36443c", water_color="#1e6a70", water_fog_color="#0a3038", fog_color="#18303a",
              surface_noise=[("spectral_moor_grass", 0.15)],
              particles=[("minecraft:soul_fire_flame", 0.0015), ("minecraft:soul", 0.002)],
              ambient="bubbling", music="minecraft:music.overworld.swamp",
              features=[
                  Patch(block="spectral_ghost_lily", where="water_surface", count=5, tries=32, max_depth=3),
                  Patch(block="spectral_soulfire_vent", count=2, tries=4),
                  Patch(block="spectral_ghostbloom", count=3, tries=16),
                  Patch(block="spectral_heather", count=3, tries=24),
                  Tree(log="spectral_deadwood_log", leaves="spectral_withered_leaves", shape="twisted",
                       height=(5, 8), decoration="spectral_ghost_moss", count=1, chance=3),
                  Patch(block="minecraft:soul_campfire", count=1, tries=2, chance=8),
              ],
              spawns=[Spawn("will_o_wisp", 16, (2, 4)), Spawn("wraith", 3, (1, 1)), Spawn("bone_hound", 2, (1, 2))]),
        Biome("spectral_bone_hollow", "Hollow of Bones", top="spectral_moor_grass", under="spectral_peat",
              temperature=-0.6, humidity=-0.6, elevation=0.2, grass_color="#566656", water_color="#2a4a58",
              fog_color="#262a30", surface_noise=[("minecraft:soul_soil", 0.3), ("minecraft:coarse_dirt", 0.45)],
              particles=[("minecraft:ash", 0.006), ("minecraft:soul", 0.001)],
              ambient="eerie_choir", music="minecraft:music.overworld.deep_dark",
              features=[
                  Patch(blocks=[("spectral_gravestone", 6), ("minecraft:mossy_stone_brick_wall", 2),
                                ("minecraft:cobblestone_wall", 1), ("minecraft:mossy_cobblestone_wall", 1)],
                        count=4, tries=14, spread=6),
                  Structure(kind="ribcage", blocks={"bone": "minecraft:bone_block", "spine": "minecraft:bone_block"},
                            size=(8, 13), chance=4),
                  Spire(blocks=[("minecraft:bone_block", 1)], height=(4, 8), radius=(1, 1), lean=0.6, count=1, chance=2),
                  Patch(block="spectral_heather", count=3, tries=24),
                  Patch(block="minecraft:soul_lantern", count=1, tries=2, chance=3),
                  DEAD_TREE,
              ],
              spawns=[Spawn("bone_hound", 10, (2, 4)), Spawn("wraith", 4, (1, 1)), Spawn("will_o_wisp", 4, (1, 2))]),
        Biome("spectral_wraithwood", "Wraithwood", top="spectral_moor_grass", under="spectral_peat",
              temperature=0.6, humidity=-0.5, elevation=0.3, grass_color="#3a4840", water_color="#2a4a58",
              fog_color="#141a24", fog_end=36,
              surface_noise=[("spectral_peat", 0.35)],
              particles=[("minecraft:white_ash", 0.014), ("minecraft:soul", 0.001)],
              ambient="eerie_choir", music="minecraft:music.overworld.deep_dark",
              features=[
                  Tree(log="spectral_deadwood_log", leaves="spectral_withered_leaves", shape="twisted",
                       height=(9, 15), decoration="spectral_ghost_moss", count=(2, 3)),
                  Tree(log="spectral_deadwood_log", leaves="minecraft:cobweb", shape="twisted", height=(6, 9), count=1,
                       chance=2),
                  Structure(kind="tendril", blocks={"main": "spectral_deadwood_log", "tip": "spectral_deadwood_log"},
                            size=(6, 10), params={"curl": 0.8, "thickness": 0.6}, chance=2),
                  Patch(block="spectral_ghostbloom", count=2, tries=12),
                  Patch(block="spectral_heather", count=2, tries=16),
                  Patch(block="minecraft:cobweb", count=1, tries=4),
                  GRAVES,
              ],
              spawns=[Spawn("wraith", 8, (1, 2)), Spawn("will_o_wisp", 6, (1, 2)), Spawn("bone_hound", 4, (2, 3))]),
    ],
    effects=[],
    ambient="wind_howl",
    music="minecraft:music.nether.soul_sand_valley",
    icon="portalgun:spectral_ectoplasm",
)
