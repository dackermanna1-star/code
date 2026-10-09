"""B-1CK Brickton - a world snapped together from studded plastic toy bricks in bright primary colors."""
import numpy as np
from PIL import Image

import gen.textures as T
from gen.content.dsl import *
from gen.noise import rng

# ------------------------------------------------------------------------------------------------ palette
RED = "#d42a2a"
BLUE = "#1f5fd0"
YELLOW = "#f4c41c"
GREEN = "#2a9a3a"
LEAF = "#1f7a32"
WHITE = "#eeeee8"
GRAY = "#8c9096"
BROWN = "#6a4428"
TRANS_BLUE = "#5ab0ff"


def _hex(c):
    c = c.lstrip("#")
    return np.array([int(c[i:i + 2], 16) for i in (0, 2, 4)], float)


def _shade(c, k):
    return np.clip(_hex(c) * k, 0, 255)


def _img(rgb, alpha=None):
    a = np.full(rgb.shape[:2] + (1,), 255.0) if alpha is None else alpha[..., None]
    return Image.fromarray(np.clip(np.round(np.concatenate([rgb, a], -1)), 0, 255).astype(np.uint8), "RGBA")


def brick_side(color, seed):
    """Side of a toy brick: glossy flat plastic, a lit top lip, the dark seam where it clicks onto the brick below,
    and a soft diagonal sheen."""
    yy, xx = np.mgrid[0:16, 0:16]
    R = rng(seed)
    rgb = np.tile(_hex(color), (16, 16, 1))
    sheen = ((xx + yy) % 23 < 3) & (yy > 2) & (yy < 13)
    rgb[sheen] = _shade(color, 1.1)
    rgb[yy == 0] = _shade(color, 1.22)
    rgb[yy == 1] = _shade(color, 1.08)
    rgb[yy == 14] = _shade(color, 0.82)
    rgb[yy == 15] = _shade(color, 0.55)
    rgb[(xx == 15) & (yy < 15)] = _shade(color, 0.9)
    rgb[(xx == 0) & (yy < 15)] = _shade(color, 1.06)
    for _ in range(2):                                    # a few faint scuffs
        x, y = int(R.integers(2, 14)), int(R.integers(3, 13))
        rgb[y, x] = _shade(color, 0.94)
    return _img(rgb)


def brick_bottom(color, seed):
    """Underside of a toy brick: a hollow tube in the middle of a shadowed cavity."""
    yy, xx = np.mgrid[0:16, 0:16]
    rgb = np.tile(_shade(color, 0.62), (16, 16, 1))
    edge = (xx < 2) | (yy < 2) | (xx > 13) | (yy > 13)
    rgb[edge] = _shade(color, 0.92)
    d = np.hypot(xx - 7.5, yy - 7.5)
    rgb[(d < 4.2) & (d > 2.6)] = _shade(color, 0.85)
    rgb[d <= 2.6] = _shade(color, 0.4)
    return _img(rgb)


def trans_brick(color, seed):
    """A transparent-colored toy brick: tinted see-through plastic with a bright stud outline and edges."""
    yy, xx = np.mgrid[0:16, 0:16]
    rgb = np.tile(_hex(color), (16, 16, 1))
    a = np.full((16, 16), 120.0)
    edge = (xx == 0) | (yy == 0) | (xx == 15) | (yy == 15)
    rgb[edge] = _shade(color, 1.25)
    a[edge] = 230
    d = np.hypot(xx + 0.5 - 8, yy + 0.5 - 7.4)
    ring = (d < 4.3) & (d > 3.2)
    rgb[ring] = _shade(color, 1.3)
    a[ring] = 210
    for (x, y) in ((6, 5), (5, 6), (7, 5), (2, 2), (3, 2), (2, 3)):
        rgb[y, x] = [255, 255, 255]
        a[y, x] = 240
    return _img(rgb, a)


def light_brick(color, seed):
    """A light-up brick: warm glowing plastic, brighter at the stud, with a frosted rim."""
    yy, xx = np.mgrid[0:16, 0:16]
    d = np.hypot(xx + 0.5 - 8, yy + 0.5 - 7.6)
    t = np.clip(1.0 - d / 11.0, 0, 1)
    rgb = _hex(color)[None, None, :] * (0.8 + 0.25 * t[..., None]) + 255 * 0.35 * t[..., None] ** 2
    edge = (xx == 0) | (yy == 0) | (xx == 15) | (yy == 15)
    rgb[edge] = _shade(color, 0.85)
    ring = (d < 4.3) & (d > 3.3)
    rgb[ring] = np.minimum(_hex(color) * 1.1 + 40, 255)
    rgb[d < 1.5] = [255, 255, 240]
    return _img(rgb)


def brick_pile(colors, seed):
    """A floor littered with loose toy bricks of every color (1x2 and 1x1 plates seen from above)."""
    yy, xx = np.mgrid[0:16, 0:16]
    R = rng(seed)
    rgb = np.tile(_hex(GRAY) * 0.75, (16, 16, 1))
    occ = np.zeros((16, 16), bool)
    for _ in range(40):
        w, h = (4, 2) if R.uniform() < 0.5 else (2, 4)
        if R.uniform() < 0.35:
            w, h = 2, 2
        x, y = int(R.integers(0, 17 - w)), int(R.integers(0, 17 - h))
        if occ[y:y + h, x:x + w].any():
            continue
        occ[y:y + h, x:x + w] = True
        c = colors[int(R.integers(0, len(colors)))]
        rgb[y:y + h, x:x + w] = _hex(c)
        rgb[y + h - 1, x:x + w] = _shade(c, 0.7)
        rgb[y:y + h, x + w - 1] = _shade(c, 0.78)
        for sy in range(y, y + h - 1, 2):                 # studs: one lit pixel per 2x2 cell
            for sx in range(x, x + w - 1, 2):
                rgb[sy, sx] = np.minimum(_hex(c) * 1.3 + 25, 255)
    return _img(rgb)


def toy_flower(petal, center, seed):
    """A snap-on plastic flower: round five-dot petal head on a stiff green plastic stem with two flat leaves."""
    out = np.zeros((16, 16, 4))
    x0 = 7
    g = _hex(GREEN)
    for y in range(8, 16):
        out[y, x0:x0 + 2, :3] = g
        out[y, x0 + 1, :3] = g * 0.8
        out[y, x0:x0 + 2, 3] = 255
    for (x, y, w) in ((3, 11, 4), (9, 10, 4)):
        out[y:y + 2, x:x + w, :3] = g * 1.08
        out[y + 1, x:x + w, :3] = g * 0.8
        out[y:y + 2, x:x + w, 3] = 255
    yy, xx = np.mgrid[0:16, 0:16]
    cx, cy = 8.0, 5.0
    for ang in range(5):
        a = ang * 2 * np.pi / 5 - np.pi / 2
        px, py = cx + np.cos(a) * 2.9, cy + np.sin(a) * 2.9
        m = np.hypot(xx + 0.5 - px, yy + 0.5 - py) < 1.9
        out[m, :3] = _hex(petal)
        out[m & ((xx + 0.5 - px) + (yy + 0.5 - py) < -0.8), :3] = np.minimum(_hex(petal) * 1.25 + 20, 255)
        out[m, 3] = 255
    m = np.hypot(xx + 0.5 - cx, yy + 0.5 - cy) < 1.6
    out[m, :3] = _hex(center)
    out[m, 3] = 255
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGBA")


def brick_icon(color, seed):
    """Inventory icon: a single 2x1 toy brick seen from the front-top, two studs on top."""
    out = np.zeros((16, 16, 4))
    c = _hex(color)
    out[7:13, 1:15, :3] = c                     # front face
    out[5:7, 2:16, :3] = np.minimum(c * 1.25 + 20, 255)   # top face
    out[7:13, 14:15, :3] = c * 0.7
    out[12, 1:15, :3] = c * 0.6
    for sx in (4, 10):                          # studs
        out[3:5, sx:sx + 3, :3] = np.minimum(c * 1.1 + 10, 255)
        out[3, sx:sx + 1, :3] = np.minimum(c * 1.4 + 40, 255)
        out[4, sx + 2, :3] = c * 0.75
        out[3:5, sx:sx + 3, 3] = 255
    out[5:13, 1:16, 3] = 255
    out[5, 1, 3] = 0
    out[12, 15, 3] = 0
    out[7, 1:14, :3] = np.minimum(c * 1.1, 255)
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGBA")


def _brick(bid, name, color, map_color, **kw):
    """A studded toy brick block (top = stud, sides = smooth plastic with a click seam, bottom = tube)."""
    return Block(bid, name, "grass", {"top": tex("toy_brick", color, seed=bid),
                                      "side": tex(brick_side, color, bid),
                                      "bottom": tex(brick_bottom, color, bid)},
                 hardness=kw.pop("hardness", 1.0), sound=kw.pop("sound", "bamboo_wood"), tool=kw.pop("tool", "pickaxe"),
                 map_color=map_color, **kw)


# ------------------------------------------------------------------------------------------------ features
TOY_TREE_ROUND = GiantPlant(stem="brickton_brown_brick", head="brickton_leaf_brick", shape="sphere", height=(5, 8),
                            radius=(2, 3), count=1)
TOY_TREE_PINE = GiantPlant(stem="brickton_brown_brick", head="brickton_leaf_brick", shape="cone", height=(7, 11),
                           radius=(3, 4), count=1, chance=2)
TOY_HOUSE = Structure(kind="cuboids", blocks={"main": "brickton_red_brick", "alt": "brickton_white_brick",
                                              "trim": "brickton_yellow_brick"}, size=(5, 8), count=1, chance=4)
TOWER = Structure(kind="cuboids", blocks={"main": "brickton_blue_brick", "alt": "brickton_yellow_brick",
                                          "trim": "brickton_white_brick"}, size=(8, 12), params={"count": 4},
                  count=1, chance=6)
FLOATING_BUILD = Structure(kind="cuboids", blocks={"main": "brickton_yellow_brick", "alt": "brickton_red_brick",
                                                   "trim": "brickton_blue_brick"}, size=(4, 7),
                           params={"float": 14, "scatter": 4}, count=1, chance=8)
FLOWERS = Patch(blocks=[("brickton_toy_flower", 4), ("minecraft:cornflower", 1)], count=3, tries=24, spread=6)
PILE = Patch(block="brickton_brick_pile", count=1, tries=4, spread=3, chance=2)

DIMENSION = Dimension(
    id="brickton",
    code="B-1CK",
    name="Brickton",
    tagline="Snapped together, one stud at a time",
    description=("A whole world built from studded plastic toy bricks: red mesas, blue bays, yellow flats and green "
                 "baseplate meadows, with giant cubes floating overhead where somebody forgot to finish building. "
                 "Block Dogs bound along the studs and the Brick Golems keep things tidy. Watch out for Brick Raiders "
                 "lobbing bricks from the ramparts - and never, ever step on a loose brick barefoot."),
    danger=2,
    color=RED,
    terrain=Terrain(style="cubes", stone="brickton_gray_brick", sea_level=56, height=66, amplitude=14, roughness=0.0,
                    caves=False, ores=False,
                    params={"step": 4, "cell_size": 42, "min_size": 3, "max_size": 8, "probability": 0.32,
                            "floating": True, "y_min": 96, "y_max": 150, "biome_size": 260}),
    sky=Sky(sky_color="#5cbcff", fog_color="#c4e8ff", water_fog_color="#1a50a0", fog_start=90, fog_end=340,
            cloud_color="#ffffffff", cloud_height=190, time="noon", sky_light_color="#fffaf0", ambient_light=0.05,
            bodies=[Celestial("ringed_planet", [RED, YELLOW, BLUE], size=60, yaw=200, pitch=28, roll=14,
                              seed="brickton-toy-planet"),
                    Celestial("planet", [GREEN, "#6ad070", "#c0ffc0"], size=24, yaw=230, pitch=50, seed="brickton-green")]),
    blocks=[
        _brick("brickton_green_plate", "Green Baseplate", GREEN, "color_green"),
        _brick("brickton_red_brick", "Red Toy Brick", RED, "color_red"),
        _brick("brickton_blue_brick", "Blue Toy Brick", BLUE, "color_blue"),
        _brick("brickton_yellow_brick", "Yellow Toy Brick", YELLOW, "color_yellow"),
        _brick("brickton_white_brick", "White Toy Brick", WHITE, "snow"),
        _brick("brickton_gray_brick", "Gray Toy Brick", GRAY, "color_light_gray", hardness=1.5),
        _brick("brickton_brown_brick", "Brown Toy Brick", BROWN, "color_brown"),
        _brick("brickton_leaf_brick", "Leaf Brick", LEAF, "plant"),
        Block("brickton_light_brick", "Light Brick", "glow", {"all": tex(light_brick, "#ffd040", "brickton-light")},
              hardness=0.8, sound="bamboo_wood", tool="pickaxe", light=15, map_color="color_yellow"),
        Block("brickton_glass_brick", "Clear Blue Brick", "glass", {"all": tex(trans_brick, TRANS_BLUE, "brickton-glass")},
              hardness=0.8, sound="glass", tool="pickaxe", map_color="color_light_blue"),
        Block("brickton_brick_pile", "Loose Bricks", "hazard", {
            "all": tex(brick_pile, [RED, BLUE, YELLOW, WHITE, GREEN], "brickton-pile")}, hardness=0.6,
              sound="bamboo_wood", tool="pickaxe", damage=1.0, damage_type="cactus", drop="brickton_loose_brick",
              drop_count=(1, 3), map_color="color_red"),
        Block("brickton_toy_flower", "Snap Flower", "plant", {"cross": tex(toy_flower, RED, YELLOW, "brickton-flower")},
              hardness=0.0, sound="bamboo_wood", map_color="color_red"),
    ],
    items=[
        Item("brickton_loose_brick", "Loose Brick", tex(brick_icon, RED, "brickton-loose"),
             lore="The most dangerous object in the multiverse to step on barefoot."),
        Item("brickton_power_stud", "Power Stud", tex("item_icon", "coin", ["#a08010", YELLOW, "#fff4a0"],
                                                       seed="brickton-stud", accent=BLUE),
             rarity="rare", glint=True, lore="Click."),
        Item("brickton_snap_sandwich", "Snap-On Sandwich", tex("item_icon", "slice", [YELLOW, "#ffe070", "#fff8d0"],
                                                                seed="brickton-sandwich", accent=GREEN),
             kind="food", food=Food(6, 0.6, effects=[Effect("minecraft:haste", 45, 1)]),
             lore="Bread, cheese, lettuce, bread. Clicks together. Builds character."),
    ],
    creatures=[
        Creature("brick_golem", "Brick Golem", "golem", [RED, YELLOW, BLUE, "#ffffff", WHITE], pattern="checker",
                 size=1.4, glow_eyes=False,
                 body={"shoulders": True, "core": True, "nose": False, "head_size": 1.05, "eye_style": "round",
                       "mouth": "smile", "brows": True, "torso_w": 14, "arm_w": 5, "leg_w": 5},
                 behavior="neutral", health=90, damage=10, speed=0.24, armor=8, abilities=["shield"],
                 drops=[Drop("brickton_loose_brick", 2, 6), Drop("brickton_power_stud", 0, 1, chance=0.4)],
                 sounds="iron_golem", pitch=1.35, xp=15, group=1,
                 description="Built from the spare parts of a hundred sets. Keeps the meadows tidy and the Raiders out."),
        Creature("block_dog", "Block Dog", "quadruped", [WHITE, "#2a2a2e", RED, "#101010"], pattern="spots",
                 size=0.75, glow_eyes=False,
                 body={"ears": "floppy", "snout": 3, "tail": 1, "tail_kind": "thin", "leg_len": 6, "leg_w": 3,
                       "body_len": 12, "body_h": 8, "body_w": 8, "eye_style": "cute", "mouth": "smile", "head_size": 1.15},
                 behavior="passive", health=14, speed=0.3, tempt="minecraft:bone",
                 drops=[Drop("brickton_loose_brick", 0, 1)], sounds="fox", pitch=0.85, xp=2, group=3,
                 description="Square, loyal and very good. Fetches bricks you did not throw."),
        Creature("brick_raider", "Brick Raider", "biped", [YELLOW, "#2a2a2e", RED, "#101010", "#8a1a1a"],
                 pattern="gradient", size=1.0, glow_eyes=False,
                 body={"head": "box", "head_size": 1.15, "crest": True, "eye_style": "angry", "brows": True,
                       "mouth": "grin", "torso_w": 9, "torso_h": 10, "leg_len": 10, "arm_len": 10},
                 behavior="hostile", attack="ranged", health=20, damage=3, speed=0.26,
                 ranged={"color": RED, "damage": 3, "cooldown": 45, "speed": 0.9, "gravity": True, "size": 0.25},
                 drops=[Drop("brickton_loose_brick", 1, 3), Drop("brickton_snap_sandwich", 0, 1, chance=0.35),
                        Drop("brickton_power_stud", 0, 1, chance=0.05)],
                 sounds="pillager", pitch=1.25, xp=6, group=3,
                 description="Painted-on scowl, snap-on helmet, an endless supply of bricks to throw."),
    ],
    biomes=[
        Biome("brickton_green_baseplate", "Green Baseplate", top="brickton_green_plate", under="brickton_white_brick",
              temperature=0.0, humidity=0.3, stone="brickton_gray_brick", underwater="brickton_blue_brick",
              grass_color="#3aaa4a", foliage_color="#2a9a3a", water_color="#2f86f0", water_fog_color="#1a50a0",
              particles=[], ambient="cozy_breeze", music="minecraft:music.creative",
              features=[
                  TOY_TREE_ROUND,
                  TOY_TREE_PINE,
                  FLOWERS,
                  TOY_HOUSE,
                  FLOATING_BUILD,
              ],
              spawns=[Spawn("block_dog", 14, (2, 3)), Spawn("brick_golem", 2, (1, 1)), Spawn("brick_raider", 2, (1, 2))]),
        Biome("brickton_redbrick_mesas", "Redbrick Mesas", top="brickton_red_brick", under="brickton_red_brick",
              temperature=0.6, humidity=-0.2, elevation=0.35, stone="brickton_red_brick",
              underwater="brickton_blue_brick",
              grass_color="#3aaa4a", foliage_color="#2a9a3a", water_color="#2f86f0", water_fog_color="#1a50a0",
              ambient="clockwork", music="minecraft:music.overworld.badlands",
              surface_noise=[("brickton_white_brick", 0.55)],
              features=[
                  TOWER,
                  Structure(kind="monolith", blocks={"main": "brickton_yellow_brick"}, size=(5, 9), count=1, chance=5),
                  TOY_TREE_PINE,
                  PILE,
                  Patch(block="brickton_light_brick", count=1, tries=4, chance=2),
              ],
              spawns=[Spawn("brick_golem", 4, (1, 1)), Spawn("brick_raider", 5, (1, 3)), Spawn("block_dog", 6, (1, 2))]),
        Biome("brickton_yellow_flats", "Yellow Flats", top="brickton_yellow_brick", under="brickton_white_brick",
              temperature=0.8, humidity=-0.7, stone="brickton_yellow_brick", underwater="brickton_blue_brick",
              grass_color="#3aaa4a", foliage_color="#2a9a3a", water_color="#2f86f0", water_fog_color="#1a50a0",
              ambient="clockwork", music="minecraft:music.game",
              surface_noise=[("brickton_brick_pile", 0.72), ("brickton_red_brick", 0.6)],
              features=[
                  PILE,
                  Structure(kind="cuboids", blocks={"main": "brickton_gray_brick", "alt": "brickton_red_brick",
                                                    "trim": "brickton_light_brick"}, size=(4, 7), count=1, chance=3),
                  Patch(block="brickton_light_brick", count=1, tries=6),
                  Patch(block="brickton_toy_flower", count=1, tries=8, chance=2),
              ],
              spawns=[Spawn("brick_raider", 8, (2, 3)), Spawn("block_dog", 6, (1, 2))]),
        Biome("brickton_blue_bay", "Blue Bay", top="brickton_blue_brick", under="brickton_white_brick",
              temperature=-0.4, humidity=0.7, elevation=-0.4, stone="brickton_white_brick",
              underwater="brickton_blue_brick",
              grass_color="#3aaa4a", foliage_color="#2a9a3a", water_color="#3a9cff", water_fog_color="#1a60b0",
              ambient="tidal_waves", music="minecraft:music.overworld.lush_caves",
              surface_noise=[("brickton_green_plate", 0.4)],
              features=[
                  Structure(kind="arch", blocks={"main": "brickton_glass_brick", "alt": "brickton_blue_brick"},
                            size=(5, 9), count=1, chance=4),
                  FLOWERS,
                  TOY_TREE_ROUND,
                  Patch(block="brickton_glass_brick", count=1, tries=6, chance=2),
              ],
              spawns=[Spawn("block_dog", 12, (2, 4)), Spawn("brick_golem", 2, (1, 1))]),
    ],
    effects=[],
    ambient="cozy_breeze",
    music="minecraft:music.creative",
    icon="portalgun:brickton_power_stud",
)
