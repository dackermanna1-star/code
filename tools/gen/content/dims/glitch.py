"""ERR-0R The Glitch - a corrupted world: missing textures, floating cubes, TV static and random teleports."""
import numpy as np
from PIL import Image

from gen.content.dsl import *
from gen.noise import rng

MAGENTA, BLACK, CYAN, LIME, WHITE = "#ff00ff", "#000000", "#00ffff", "#20ff60", "#ffffff"
P_GRASS = ["#2a6a1e", "#3a8a24", "#4ea82c", "#6cc43a", "#94dc58"]
P_DIRT = ["#4a3020", "#5e3e28", "#745034", "#8a6442"]
P_NULL = ["#0c0612", "#160c20", "#20122e", "#2c1a3e", "#3a2450"]
P_LOG = ["#3a2a18", "#54402a", "#6c5436", "#86704a"]
P_LEAF = ["#1e5a18", "#2a7a20", "#3a9a2c", "#58b844"]


def _rgb(c):
    c = c.lstrip("#")
    return np.array([int(c[i:i + 2], 16) for i in (0, 2, 4)], float)


def corrupt(img, seed, amount=0.5, keep_alpha=False):
    """Data corruption: shifted scanlines, RGB channel split, missing-texture squares and dead pixels."""
    R = rng(seed)
    a = np.array(img.convert("RGBA")).astype(float)
    # horizontal scanline tears
    for _ in range(int(2 + amount * 4)):
        y0 = int(R.integers(0, 15))
        h = int(R.integers(1, 3))
        a[y0:y0 + h] = np.roll(a[y0:y0 + h], int(R.integers(-5, 6)), axis=1)
    # chromatic split: red channel slides one way, blue the other
    a[..., 0] = np.roll(a[..., 0], 1, axis=1)
    a[..., 2] = np.roll(a[..., 2], -1, axis=1)
    # a missing-texture square
    if R.random() < 0.35 + amount * 0.6:
        x0, y0, s = int(R.integers(0, 12)), int(R.integers(0, 12)), int(R.choice([2, 4]))
        for yy in range(s):
            for xx in range(s):
                c = MAGENTA if ((xx * 2 // s + yy * 2 // s) % 2 == 0) else BLACK
                if keep_alpha and a[y0 + yy, x0 + xx, 3] == 0:
                    continue
                a[y0 + yy, x0 + xx, :3] = _rgb(c)
                a[y0 + yy, x0 + xx, 3] = 255
    # stuck pixels
    for _ in range(int(1 + amount * 5)):
        x, y = int(R.integers(0, 16)), int(R.integers(0, 16))
        a[y, x, :3] = _rgb(str(R.choice([MAGENTA, CYAN, LIME, WHITE])))
        if not keep_alpha or a[y, x, 3] > 0:
            a[y, x, 3] = 255
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "RGBA")


def pixelate(img, seed, k=2):
    """Downsample to a chunky 8-bit sprite, then sprinkle a couple of wrong-coloured pixels."""
    small = img.convert("RGBA").resize((16 // k, 16 // k), Image.NEAREST)
    big = small.resize((16, 16), Image.NEAREST)
    a = np.array(big).astype(float)
    R = rng(seed)
    solid = np.argwhere(a[..., 3] > 0)
    for _ in range(2):
        if len(solid):
            y, x = solid[int(R.integers(0, len(solid)))]
            y, x = (y // k) * k, (x // k) * k
            a[y:y + k, x:x + k, :3] = _rgb(str(R.choice([MAGENTA, CYAN])))
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "RGBA")


def null_stone(seed):
    """Near-black stone crossed by thin scanlines and an occasional cyan bit-flip."""
    from gen.textures import stone
    a = np.array(stone(P_NULL, seed)).astype(float)
    a[::4, :, :3] *= 0.6
    R = rng(seed)
    for _ in range(3):
        y = int(R.integers(0, 16))
        x0 = int(R.integers(0, 12))
        a[y, x0:x0 + int(R.integers(2, 5)), :3] = _rgb(str(R.choice(["#2a1a4a", "#4a1a5a", "#103a4a"])))
    x, y = int(R.integers(0, 16)), int(R.integers(0, 16))
    a[y, x, :3] = _rgb(CYAN)
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "RGBA")


def error_glyph(seed, frame=0):
    """Blinking 'error' panel: black screen, magenta frame, a cyan '?' that flickers."""
    a = np.zeros((16, 16, 4), float)
    a[..., 3] = 255
    a[..., :3] = _rgb("#08000c")
    a[0, :, :3] = a[15, :, :3] = a[:, 0, :3] = a[:, 15, :3] = _rgb(MAGENTA)
    q = ["..XXXX..", ".X....X.", "......X.", ".....X..", "....X...", "....X...", "........", "....X..."]
    on = frame % 4 != 3
    col = _rgb(CYAN) if on else _rgb("#204050")
    for y, row in enumerate(q):
        for x, ch in enumerate(row):
            if ch == "X":
                a[4 + y, 4 + x, :3] = col
    R = rng(f"{seed}:{frame}")
    y = int(R.integers(1, 15))
    a[y, 1:15, :3] = a[y, 1:15, :3] * 0.4 + _rgb(MAGENTA) * 0.6 * (frame % 2)
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "RGBA")


DATA_SPIRE = Spire(blocks=[("glitch_missing_block", 6), ("minecraft:bookshelf", 1), ("minecraft:purpur_block", 1),
                           ("minecraft:prismarine", 1), ("minecraft:sponge", 1), ("minecraft:end_stone", 1),
                           ("minecraft:oak_planks", 1), ("minecraft:bricks", 1)],
                   tip="glitch_dead_pixel", height=(14, 30), radius=(2, 4), lean=0.15, count=1, chance=3)

DIMENSION = Dimension(
    id="glitch",
    code="ERR-0R",
    name="The Glitch",
    tagline="Reality.exe has stopped responding",
    description=("A corrupted save file of a world: magenta-and-black missing textures, cubes of terrain hanging in "
                 "the air, fields of humming TV static and grass that renders one tile to the left. Space itself "
                 "skips here - expect to be teleported a few blocks without warning. The Corrupted Cows are harmless; "
                 "the Pixel Wraiths and the hungry Missingno are not."),
    danger=4,
    color="#ff00ff",
    terrain=Terrain(style="cubes", stone="glitch_null_stone", sea_level=56, height=68, amplitude=16, roughness=0.0,
                    caves=False, ores=False,
                    params={"step": 6, "cell_size": 34, "min_size": 3, "max_size": 9, "probability": 0.55,
                            "floating": True, "y_min": 88, "y_max": 150, "cliff_block": "glitch_missing_block",
                            "ceiling_block": "glitch_missing_block", "biome_size": 240}),
    sky=Sky(sky_color="#2a0036", fog_color="#30103c", water_fog_color="#003a40", fog_start=36, fog_end=170,
            cloud_color="#ccff00ff", cloud_height=200, time="day", skybox="end", star_brightness=0.0,
            sky_light_color="#f0d8ff",
            bodies=[Celestial("shattered_moon", [MAGENTA, "#200020", CYAN, WHITE], size=64, yaw=190, pitch=40, roll=20,
                              seed="glitch-moon"),
                    Celestial("black_hole", ["#000000", MAGENTA, CYAN], size=46, yaw=30, pitch=62, speed=12,
                              seed="glitch-hole"),
                    Celestial("planet", [LIME, "#004010", BLACK], size=18, yaw=300, pitch=25, seed="glitch-pixelplanet")]),
    blocks=[
        Block("glitch_missing_block", "Missing Texture", "stone", {"all": tex("missing_texture")}, hardness=1.5,
              sound="deepslate", map_color="color_magenta"),
        Block("glitch_null_stone", "Null Stone", "stone", {"all": tex(null_stone, "glitch-null")}, hardness=1.5,
              sound="deepslate", map_color="color_black"),
        Block("glitch_corrupt_grass", "Corrupted Grass", "grass", {
            "top": tex(corrupt, tex("grass_top", P_GRASS, seed="glitch-grass"), "glitch-grass-c", 0.55),
            "side": tex(corrupt, tex("grass_side", P_GRASS, P_DIRT, seed="glitch-grass-s"), "glitch-grass-sc", 0.4),
            "bottom": tex(corrupt, tex("dirt", P_DIRT, seed="glitch-dirt"), "glitch-dirt-c", 0.3)},
              hardness=0.6, sound="grass", map_color="grass"),
        Block("glitch_corrupt_dirt", "Corrupted Dirt", "soil",
              {"all": tex(corrupt, tex("dirt", P_DIRT, seed="glitch-dirt"), "glitch-dirt-c", 0.3)},
              hardness=0.5, sound="gravel", map_color="dirt"),
        Block("glitch_corrupt_log", "Corrupted Log", "log", {
            "side": tex(corrupt, tex("log_side", P_LOG, seed="glitch-log"), "glitch-log-c", 0.45),
            "end": tex("log_top", P_LOG, ["#a08860", "#8a7450"], seed="glitch-log-top")},
              hardness=1.8, sound="wood", map_color="wood"),
        Block("glitch_corrupt_leaves", "Corrupted Leaves", "leaves",
              {"all": tex(corrupt, tex("leaves", P_LEAF, seed="glitch-leaves"), "glitch-leaves-c", 0.7, True)},
              hardness=0.2, sound="grass", map_color="plant"),
        Block("glitch_static_block", "TV Static", "glow", {"all": tex("static_noise", seed="glitch-static", frames=8,
                                                                    frametime=1)},
              hardness=1.0, sound="glass", light=9, emissive=True, map_color="color_light_gray"),
        Block("glitch_dead_pixel", "Dead Pixel Cluster", "glow", {"all": tex("pixel_glitch", "glitch-pixel")},
              hardness=1.0, sound="glass", light=13, emissive=True, map_color="color_cyan"),
        Block("glitch_wireframe", "Unrendered Chunk", "solid", {"all": tex("neon_grid", "#04000a", CYAN, "glitch-wire")},
              hardness=1.2, sound="glass", tool="pickaxe", light=3, emissive=True, map_color="color_black"),
        Block("glitch_error_panel", "Error Panel", "hazard", {"all": tex(error_glyph, "glitch-err", frames=8, frametime=4)},
              hardness=1.0, sound="glass", light=7, emissive=True, damage=1, damage_type="magic",
              effect="minecraft:nausea", effect_seconds=4, map_color="color_magenta"),
        Block("glitch_error_shard", "Error Shard", "crystal_cluster",
              {"cross": tex("crystal_shard_sprite", ["#600060", MAGENTA, "#ff80ff", CYAN], seed="glitch-shard")},
              hardness=0.5, sound="amethyst_cluster", light=8, emissive=True),
        Block("glitch_pixel_bush", "Pixel Bush", "plant",
              {"cross": tex(pixelate, tex("berry_bush", P_LEAF, MAGENTA, seed="glitch-bush"), "glitch-bush-p")},
              hardness=0.0, sound="grass"),
        Block("glitch_pixel_flower", "8-Bit Flower", "plant",
              {"cross": tex(pixelate, tex("flower", P_LEAF, [CYAN, "#80ffff", WHITE], seed="glitch-flower",
                                          shape="star"), "glitch-flower-p")},
              hardness=0.0, sound="grass", light=4),
        Block("glitch_loose_cable", "Loose Cable", "hanging_plant",
              {"cross": tex("wire_sprite", ["#202020", "#404040", MAGENTA, CYAN], seed="glitch-cable")},
              hardness=0.0, sound="chain", particle="minecraft:electric_spark"),
    ],
    items=[
        Item("glitch_corrupted_beef", "Corrupted Beef", tex(corrupt, tex("item_icon", "meat_raw",
                                                                         ["#802040", "#c04060", "#ff80a0"],
                                                                         seed="glitch-beef"), "glitch-beef-c", 0.4, True),
             kind="food", food=Food(5, 0.5, effects=[Effect("minecraft:speed", 15, 1, 0.4),
                                                     Effect("minecraft:levitation", 3, 0, 0.25),
                                                     Effect("minecraft:nausea", 8, 0, 0.35)]),
             lore="Tastes like beef.png failed to load."),
        Item("glitch_stray_byte", "Stray Byte", tex("item_icon", "chip", ["#003040", "#00a0b0", CYAN, WHITE],
                                                    seed="glitch-byte", accent=MAGENTA),
             rarity="uncommon", lore="01110000 01101111 01101011 01100101"),
        Item("glitch_missing_fragment", "Missing Fragment", tex("item_icon", "shard", [BLACK, "#600060", MAGENTA,
                                                                                     "#ff80ff"], seed="glitch-frag"),
             rarity="epic", glint=True, lore="Item name not found. Item lore not found. Item not f"),
    ],
    creatures=[
        Creature("missingno", "Missingno", "blob", [MAGENTA, BLACK, CYAN, WHITE, "#600060"], pattern="checker",
                 size=1.4,
                 body={"shape": "cube", "blob_size": 13, "eye_style": "glow", "eyes": 3, "eye_size": 2,
                       "mouth": "maw", "core": True, "spikes": 5, "feet": True, "eyestalks": 1},
                 behavior="hostile", movement="hopping", health=34, damage=6, speed=0.3, armor=4,
                 abilities=["teleport", "blink", "split"], on_hit=Effect("minecraft:nausea", 6, 0),
                 drops=[Drop("glitch_missing_fragment", 0, 1, 0.5), Drop("glitch_stray_byte", 1, 3)],
                 sounds="enderman", pitch=1.7, xp=14, group=1, tracking=8,
                 description="An entity that should not exist, made of the texture that failed to load. It jumps "
                             "between frames to reach you."),
        Creature("pixel_wraith", "Pixel Wraith", "floater", [BLACK, CYAN, WHITE, CYAN, MAGENTA], pattern="checker",
                 size=1.35,
                 body={"kind": "ghost", "arms": 2, "translucent": True, "body_w": 10, "body_h": 12, "body_d": 8, "eye_style": "glow", "eyes": 2, "eye_size": 2,
                       "mouth": "open"},
                 behavior="hostile", attack="ranged", health=20, damage=3, speed=0.3,
                 ranged={"color": CYAN, "damage": 4, "effect": Effect("minecraft:blindness", 3), "cooldown": 55,
                         "speed": 1.1, "size": 0.25, "particle": "minecraft:electric_spark"},
                 abilities=["blink"], emissive=True,
                 drops=[Drop("glitch_stray_byte", 0, 2)],
                 sounds="vex", pitch=0.5, xp=10, group=2,
                 description="A low-resolution ghost that flickers between pixels and fires bursts of cyan static."),
        Creature("corrupted_cow", "Corrupted Cow", "quadruped", ["#ffffff", MAGENTA, BLACK, CYAN, "#20ff60"],
                 pattern="patches", size=1.0,
                 body={"horns": "small", "snout": 3, "ears": "floppy", "hooves": True, "tail": 2, "tail_kind": "thin",
                       "eyes": 3, "eye_style": "round", "mouth": "frown", "leg_len": 7, "body_len": 15, "body_h": 9},
                 behavior="passive", health=10, speed=0.2, tempt="minecraft:wheat",
                 drops=[Drop("glitch_corrupted_beef", 1, 3), Drop("minecraft:leather", 0, 2)],
                 sounds="cow", pitch=0.55, xp=2, group=4,
                 description="Mostly a cow. Three eyes, a moo played at half speed and a hide that never finished "
                             "loading."),
    ],
    biomes=[
        Biome("glitch_corrupted_pasture", "Corrupted Pasture", top="glitch_corrupt_grass", under="glitch_corrupt_dirt",
              temperature=0.1, humidity=0.1, elevation=0.0, grass_color="#4ea82c", foliage_color="#3a9a2c",
              water_color="#3f76e4", water_fog_color="#103060", sky_color="#3a0a4a",
              particles=[("dust:#ff00ff:1.0", 0.002), ("dust:#00ffff:1.0", 0.002)], ambient="glitch_noise",
              music="minecraft:music.game",
              features=[
                  Tree(log="glitch_corrupt_log", leaves="glitch_corrupt_leaves", shape="oak", height=(4, 6), count=1),
                  Patch(block="glitch_pixel_bush", count=3, tries=16),
                  Patch(block="glitch_pixel_flower", count=3, tries=16),
                  Structure(kind="cuboids", blocks={"main": "glitch_corrupt_grass", "alt": "glitch_corrupt_dirt",
                                                    "trim": "glitch_missing_block"}, size=(3, 6),
                            params={"float": 8, "scatter": 4}, chance=4),
              ],
              spawns=[Spawn("corrupted_cow", 14, (2, 4)), Spawn("missingno", 2, (1, 1)), Spawn("pixel_wraith", 2, (1, 1))]),
        Biome("glitch_missing_fields", "Missing Fields", top="glitch_missing_block", under="glitch_null_stone",
              temperature=-0.7, humidity=0.6, elevation=0.2, grass_color="#ff00ff", water_color="#ff00ff",
              water_fog_color="#400040", fog_color="#3a0a3a", particles=[("dust:#ff00ff:1.4", 0.004)],
              ambient="glitch_noise", music="minecraft:music_disc.13",
              features=[
                  DATA_SPIRE,
                  Structure(kind="cuboids", blocks={"main": "glitch_missing_block", "alt": "glitch_static_block",
                                                    "trim": "glitch_dead_pixel"}, size=(4, 8),
                            params={"float": 6, "scatter": 6}, chance=3),
                  CrystalCluster(block="glitch_dead_pixel", small="glitch_error_shard", size=(3, 6), count=1, chance=3),
                  Patch(block="glitch_error_shard", count=2, tries=12),
              ],
              spawns=[Spawn("missingno", 6, (1, 1)), Spawn("corrupted_cow", 4, (1, 2)), Spawn("pixel_wraith", 3, (1, 1))]),
        Biome("glitch_static_wastes", "Static Wastes", top="glitch_null_stone", under="glitch_null_stone",
              temperature=0.0, humidity=-0.6, elevation=0.4, grass_color="#808080", water_color="#c0c0c0",
              water_fog_color="#303030", fog_color="#4a4a52", fog_end=100, sky_color="#3a3a42",
              surface_noise=[("glitch_static_block", 0.55), ("glitch_error_panel", 0.8)],
              particles=[("minecraft:white_ash", 0.03), ("minecraft:electric_spark", 0.002)], ambient="glitch_noise",
              music="minecraft:music_disc.11",
              features=[
                  Structure(kind="monolith", blocks={"main": "glitch_static_block"}, size=(8, 16), chance=3),
                  Structure(kind="monolith", blocks={"main": "glitch_error_panel"}, size=(5, 9), params={"float": 5},
                            chance=6),
                  Patch(block="glitch_loose_cable", count=4, where="cave_ceiling"),
                  Patch(block="glitch_error_shard", count=1, tries=8),
              ],
              spawns=[Spawn("pixel_wraith", 8, (1, 2)), Spawn("missingno", 2, (1, 1))]),
        Biome("glitch_unrendered", "Unrendered Zone", top="glitch_wireframe", under="glitch_null_stone",
              temperature=0.5, humidity=-0.4, elevation=-0.5, grass_color="#00ffff", water_color="#00e0ff",
              water_fog_color="#002a30", fog_color="#06060c", sky_color="#000000", fog_end=130,
              particles=[("dust:#00ffff:0.8", 0.004)], ambient="dark_void", music="minecraft:music.end",
              features=[
                  Structure(kind="cuboids", blocks={"main": "glitch_wireframe", "alt": "glitch_null_stone",
                                                    "trim": "glitch_dead_pixel"}, size=(4, 8),
                            params={"float": 10, "scatter": 8}, chance=2),
                  CrystalCluster(block="glitch_dead_pixel", small="glitch_error_shard", size=(2, 5), count=1, chance=4),
                  Patch(block="glitch_loose_cable", count=3, where="cave_ceiling"),
              ],
              spawns=[Spawn("pixel_wraith", 5, (1, 2)), Spawn("corrupted_cow", 3, (1, 2)), Spawn("missingno", 2, (1, 1))]),
    ],
    effects=["glitch"],
    ambient="glitch_noise",
    music="minecraft:music_disc.13",
    platform="glitch_wireframe",
    icon="portalgun:glitch_missing_fragment",
)
