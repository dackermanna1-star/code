"""P-1US Plushland - a stuffed-toy world: felt hills stitched together, yarn trees, button flowers, giant balls of wool."""
import math

import numpy as np
from PIL import Image

from gen.content.dsl import *
from gen.noise import fbm, rng, white

# ------------------------------------------------------------------------------------------------ palette
# felt mint green / bubblegum pink / cotton cream / baby blue / lilac / button yellow
P_FELT = ["#5aa070", "#6cb47e", "#7ec68e", "#94d6a0", "#aee4b6"]
P_LILAC = ["#8a78b8", "#9c8acc", "#b09edc", "#c4b4e8", "#d8ccf2"]
P_STUFF = ["#d8ccbc", "#e6dccc", "#f2eade", "#fbf6ee", "#ffffff"]
P_BATT = ["#b8aec8", "#c8bed6", "#d6cee2", "#e4deee", "#f2eef8"]
P_YARN_BROWN = ["#7a4a2a", "#965c34", "#b07040", "#c88a54", "#dca46c"]
P_PINK = ["#d0608a", "#e27a9e", "#f094b4", "#f8b0c8", "#ffd0de"]
P_MINT = ["#4aa898", "#5cbcaa", "#74ceba", "#90dcca", "#b4ecdc"]
P_CUSHION = ["#c06a9a", "#d684b0", "#e8a0c6", "#f4bcd8", "#ffd8ea"]
P_BALL_BLUE = ["#4a78c0", "#5e8ed4", "#78a6e4", "#96bef0", "#bcd6f8"]
P_STAR = ["#f0a020", "#ffc840", "#ffe070", "#fff4b0", "#ffffff"]
THREAD = "#fff4e8"
PINK = "#f094b4"


def _hex(c):
    c = c.lstrip("#")
    return np.array([int(c[i:i + 2], 16) for i in (0, 2, 4)], float)


def _ramp(cols, t):
    t = np.clip(t, 0, 0.999) * (len(cols) - 1)
    i = t.astype(int)
    f = (t - i)[..., None]
    c = np.array([_hex(x) for x in cols])
    return c[i] * (1 - f) + c[np.minimum(i + 1, len(cols) - 1)] * f


def _img(rgb, alpha=None):
    a = np.full(rgb.shape[:2] + (1,), 255.0) if alpha is None else alpha[..., None]
    return Image.fromarray(np.clip(np.round(np.concatenate([rgb, a], -1)), 0, 255).astype(np.uint8), "RGBA")


def _felt(pal, seed):
    """Soft fuzzy felt: low-contrast fibre noise, quantised to the palette."""
    n = fbm(16, 16, 4, seed, 3) * 0.6 + white(16, 16, seed + ":w") * 0.4
    return _ramp(pal, np.round((0.25 + n * 0.55) * 8) / 8)


def felt_patch(pal, seed, thread=THREAD):
    """A felt square with a dashed running stitch along two edges (tiles into a stitched quilt of patches)."""
    rgb = _felt(pal, seed)
    yy, xx = np.mgrid[0:16, 0:16]
    seam = (xx == 0) | (yy == 0)
    rgb[seam] = _hex(pal[1]) * 0.97                                  # the seam groove
    st = ((yy == 1) & (xx % 4 < 2)) | ((xx == 1) & (yy % 4 < 2))     # running stitch beside it
    st &= ~((xx < 2) & (yy < 2))
    rgb[st] = _hex(thread)
    return _img(rgb)


def felt_side(top_pal, stuff_pal, seed, thread=THREAD):
    """Felt skin over cotton stuffing: felt on the upper third, a stitched hem, puffy stuffing below."""
    rgb = _ramp(stuff_pal, 0.3 + fbm(16, 16, 3, seed + ":s", 3) * 0.6)
    yy, xx = np.mgrid[0:16, 0:16]
    felt = _felt(top_pal, seed)
    hem = 5 + (np.sin(xx * 0.9 + 1.3) > 0.6).astype(int)
    m = yy < hem
    rgb[m] = felt[m]
    edge = yy == hem
    rgb[edge] = _hex(top_pal[0]) * 0.85
    st = (yy == 3) & (xx % 4 < 2)
    rgb[st] = _hex(thread)
    return _img(rgb)


def quilted(pal, seed, step=8, tuft=None):
    """Quilted padding: puffy diamonds separated by sunken stitch lines (optionally a button tuft at each crossing)."""
    yy, xx = np.mgrid[0:16, 0:16]
    u = ((xx + yy) % step) / step
    v = ((xx - yy) % step) / step
    puff = np.sin(u * np.pi) * np.sin(v * np.pi)
    n = fbm(16, 16, 4, seed, 2)
    t = 0.2 + puff * 0.65 + (n - 0.5) * 0.18
    rgb = _ramp(pal, np.round(t * 8) / 8)
    line = (((xx + yy) % step) == 0) | (((xx - yy) % step) == 0)
    rgb[line] = _hex(pal[0]) * 0.9
    if tuft:
        for cx, cy in ((0, 0), (8, 8), (0, 8), (8, 0)):
            if ((cx + cy) % step == 0) and ((cx - cy) % step == 0):
                rgb[cy % 16, cx % 16] = _hex(tuft)
    return _img(rgb)


def yarn_wrap(pal, seed, angle=0.45):
    """Yarn wound around a trunk: parallel slanted 2px strands with a twist highlight and dark gaps."""
    yy, xx = np.mgrid[0:16, 0:16]
    s = (yy + xx * angle) % 3.0
    twist = np.sin((xx - yy * angle) * 1.4) * 0.5 + 0.5
    t = np.where(s < 2.2, 0.35 + twist * 0.5, 0.05)
    t = t + (fbm(16, 16, 4, seed, 2) - 0.5) * 0.15
    return _img(_ramp(pal, np.round(t * 8) / 8))


def yarn_end(pal, seed):
    """End of a yarn-wrapped log: a coiled spiral of yarn."""
    yy, xx = np.mgrid[0:16, 0:16]
    dx, dy = xx - 7.5, yy - 7.5
    r = np.hypot(dx, dy)
    a = np.arctan2(dy, dx) / (2 * np.pi)
    s = (r + a * 2.4) % 2.4
    t = np.where(s < 1.6, 0.45 + 0.4 * np.sin(s / 1.6 * np.pi), 0.08)
    return _img(_ramp(pal, np.round(t * 8) / 8))


def knitted(pal, seed):
    """Knitted wool: columns of interlocking V stitches (stockinette) - the pom-pom foliage of yarn trees."""
    yy, xx = np.mgrid[0:16, 0:16]
    col = xx // 4
    lx = xx % 4
    ly = (yy + (col % 2)) % 4
    # each stitch is a V: two slanted 2px legs
    leg = ((lx == 0) & (ly >= 1)) | ((lx == 1) & (ly <= 2)) | ((lx == 2) & (ly <= 2)) | ((lx == 3) & (ly >= 1))
    t = np.where(leg, 0.55 + 0.3 * (ly == 1), 0.12)
    t = np.where(leg & ((lx == 1) | (lx == 2)) & (ly == 0), 0.85, t)
    t = t + (fbm(16, 16, 4, seed, 2) - 0.5) * 0.18
    return _img(_ramp(pal, np.round(t * 8) / 8))


def yarn_ball(pal, seed):
    """Surface of a giant ball of wool: bands of strands wound at three different angles, crossing over each other."""
    yy, xx = np.mgrid[0:16, 0:16]
    R = rng(seed)
    t = np.full((16, 16), 0.1)
    for k, ang in enumerate((0.3, 1.25, 2.3)):
        u = xx * math.cos(ang) + yy * math.sin(ang) + R.uniform(0, 16)
        band = (np.floor(u / 6) % 2 == k % 2)
        strand = (u % 2.0) < 1.4
        t = np.where(band & strand, 0.4 + 0.15 * k + 0.25 * ((u % 2.0) < 0.6), t)
    t = t + (fbm(16, 16, 4, seed + ":n", 2) - 0.5) * 0.12
    return _img(_ramp(pal, np.round(t * 8) / 8))


def button_flower(stem_hex, button_pal, seed):
    """A big sewing button on a fuzzy pipe-cleaner stem with two felt leaves."""
    out = np.zeros((16, 16, 4))
    R = rng(seed)
    x0 = 7 + int(R.integers(0, 2))
    stem = _hex(stem_hex)
    for y in range(8, 16):
        out[y, x0, :3] = stem * (1.1 if y % 2 else 0.9)
        out[y, x0, 3] = 255
    for (dx, y) in ((-1, 12), (-2, 12), (-3, 11), (1, 10), (2, 10), (3, 9)):
        out[y, x0 + dx, :3] = stem * (1.15 if abs(dx) < 3 else 0.85)
        out[y, x0 + dx, 3] = 255
    cols = [_hex(c) for c in button_pal]
    yy, xx = np.mgrid[0:16, 0:16]
    cx, cy = x0 + 0.5, 5.0
    d = np.hypot(xx + 0.5 - cx, yy + 0.5 - cy)
    disc = d < 4.6
    out[disc, :3] = cols[2]
    out[disc & (d > 3.4), :3] = cols[1]                                 # raised rim
    out[disc & (d > 3.4) & ((xx + yy) < cx + cy - 2), :3] = cols[3]      # lit rim
    out[disc, 3] = 255
    for hx, hy in ((-1, -1), (1, -1), (-1, 1), (1, 1)):                # four thread holes
        out[int(cy + hy * 1.0), int(cx + hx * 1.0 - (0 if hx > 0 else 1)), :3] = cols[0] * 0.5
    out[int(cy) - 2, int(cx) - 2, :3] = cols[3] * 1.05
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGBA")


def patchwork(colors, seed, thread=THREAD):
    """Four felt patches of different colors sewn together with cross stitches along the seams."""
    rgb = np.zeros((16, 16, 3))
    yy, xx = np.mgrid[0:16, 0:16]
    for q, pal in enumerate(colors[:4]):
        m = ((xx >= 8) == bool(q & 1)) & ((yy >= 8) == bool(q & 2))
        rgb[m] = _felt(pal, f"{seed}:{q}")[m]
    seam = (xx % 8 == 0) | (yy % 8 == 0)
    rgb[seam] = rgb[seam] * 0.8
    cross = (((xx % 8 == 1) | (xx % 8 == 7)) & (yy % 3 == 1)) | (((yy % 8 == 1) | (yy % 8 == 7)) & (xx % 3 == 1))
    rgb[cross] = _hex(thread)
    return _img(rgb)


def star_light(pal, seed):
    """A soft nightlight: a five-pointed felt star glowing on a pale cushion."""
    yy, xx = np.mgrid[0:16, 0:16]
    dx, dy = xx + 0.5 - 8, yy + 0.5 - 8.4
    r = np.hypot(dx, dy)
    a = np.arctan2(dy, dx) + np.pi / 2
    star_r = 3.2 + 3.6 * (0.5 + 0.5 * np.cos(a * 5)) ** 2.2
    m = r < star_r
    rgb = _ramp(pal[2:], np.clip(0.6 - r / 20, 0, 1))
    rgb[~m] = _ramp(pal[:3], 0.55 + (fbm(16, 16, 4, seed, 2)[~m] - 0.5) * 0.3)
    rgb[m & (r < 2.2)] = _hex(pal[-1])
    edge = m & (r > star_r - 1.0)
    rgb[edge] = _hex(pal[1])
    return _img(rgb)


# ------------------------------------------------------------------------------------------------ features
GIANT_YARN_TREE = GiantPlant(stem="plush_yarn_log", head="plush_pink_yarn", shape="puff", height=(12, 18), radius=(5, 7),
                             stem_width=2, bend=0.25, decoration="plush_mint_yarn", count=1, chance=4)
YARN_BALLS = Boulder(blocks=[("plush_yarn_ball", 1)], radius=(3, 6), squash=1.0, count=1, chance=4)
CUSHIONS = Boulder(blocks=[("plush_cushion", 1)], radius=(3, 6), squash=0.42, count=1, chance=3)
BUTTONS = Patch(blocks=[("plush_button_flower", 3), ("minecraft:pink_tulip", 1), ("minecraft:cornflower", 1)], count=4,
                tries=32, spread=7)

DIMENSION = Dimension(
    id="plushland",
    code="P-1US",
    name="Plushland",
    tagline="Everything is soft. Everything is stitched.",
    description=("A world sewn together from felt and stuffing: the hills are mint-green felt patches, the trees are "
                 "knitted pom-poms on yarn-wrapped trunks and the meadows grow buttons instead of flowers. Giant balls "
                 "of wool lie in the downs and the pillow hills are soft enough to bounce on. Plush Bears and Yarn "
                 "Cats will happily follow you home; the Button Spiders only mind if you poke them."),
    danger=1,
    color=PINK,
    terrain=Terrain(style="hills", stone="plush_batting", sea_level=60, height=74, amplitude=14, scale=1.9,
                    roughness=0.0, caves=False, ores=False, deepslate="plush_stuffing",
                    params={"rivers": 0.35, "detail": 0.12, "biome_size": 300, "beach_block": "plush_stuffing",
                            "beach_height": 1, "cliffs": False, "ceiling_block": "plush_stuffing"}),
    sky=Sky(sky_color="#a8d4fa", fog_color="#fbe2ee", water_fog_color="#5a9ad0", fog_start=70, fog_end=280,
            cloud_color="#ffffffff", cloud_height=168, time=2200, sunrise_color="#88ffc0e0", sky_light_color="#fff4f8",
            ambient_light=0.1,
            bodies=[Celestial("planet", ["#f094b4", "#f8b0c8", "#ffe0ea"], size=64, yaw=140, pitch=42, roll=-18,
                              seed="plush-toy-planet"),
                    Celestial("planet", ["#78a6e4", "#bcd6f8", "#ffffff"], size=26, yaw=210, pitch=60, seed="plush-blue")]),
    blocks=[
        Block("plush_felt_grass", "Felt Turf", "grass", {
            "top": tex(felt_patch, P_FELT, "plush-felt"),
            "side": tex(felt_side, P_FELT, P_STUFF, "plush-felt"),
            "bottom": tex("wool", P_STUFF, seed="plush-stuffing")}, hardness=0.5, sound="wool", map_color="color_light_green"),
        Block("plush_lilac_felt", "Lilac Felt", "grass", {
            "top": tex(felt_patch, P_LILAC, "plush-lilac"),
            "side": tex(felt_side, P_LILAC, P_STUFF, "plush-lilac"),
            "bottom": tex("wool", P_STUFF, seed="plush-stuffing")}, hardness=0.5, sound="wool", map_color="color_purple"),
        Block("plush_stuffing", "Cotton Stuffing", "soil", {"all": tex("wool", P_STUFF, seed="plush-stuffing")},
              hardness=0.4, sound="wool", tool="hoe", map_color="wool"),
        Block("plush_batting", "Quilted Batting", "solid", {"all": tex(quilted, P_BATT, "plush-batting")}, hardness=0.8,
              sound="wool", tool="hoe", map_color="color_light_gray"),
        Block("plush_yarn_log", "Yarn-Wrapped Trunk", "log", {
            "side": tex(yarn_wrap, P_YARN_BROWN, "plush-yarn-log"),
            "end": tex(yarn_end, P_YARN_BROWN, "plush-yarn-end")}, hardness=1.0, sound="wool", map_color="color_brown",
              flammable=True),
        Block("plush_pink_yarn", "Pink Pom-Pom", "leaves", {"all": tex(knitted, P_PINK, "plush-pink")}, hardness=0.2,
              sound="wool", map_color="color_pink", flammable=True, drop="minecraft:string", drop_count=(0, 1)),
        Block("plush_mint_yarn", "Mint Pom-Pom", "leaves", {"all": tex(knitted, P_MINT, "plush-mint")}, hardness=0.2,
              sound="wool", map_color="color_cyan", flammable=True, drop="minecraft:string", drop_count=(0, 1)),
        Block("plush_button_flower", "Button Flower", "plant", {
            "cross": tex(button_flower, "#5aa070", ["#a03050", "#d04a6a", "#f07a90", "#ffc0cc"], "plush-button")},
              hardness=0.0, sound="wool", fruit="plush_button", map_color="color_red"),
        Block("plush_cushion", "Bouncy Cushion", "slime", {"all": tex(quilted, P_CUSHION, "plush-cushion", 8, "#fff4b0")},
              hardness=0.4, sound="wool", tool="hoe", map_color="color_pink", friction=0.65),
        Block("plush_yarn_ball", "Giant Yarn", "solid", {"all": tex(yarn_ball, P_BALL_BLUE, "plush-ball")}, hardness=0.6,
              sound="wool", tool="hoe", map_color="color_light_blue", flammable=True),
        Block("plush_patchwork", "Patchwork Felt", "grass", {
            "top": tex(patchwork, [P_FELT, P_PINK, ["#e0b040", "#ecc050", "#f6d470", "#fbe498", "#fff2c0"], P_BALL_BLUE],
                       "plush-patch"),
            "side": tex(felt_side, P_PINK, P_STUFF, "plush-patch"),
            "bottom": tex("wool", P_STUFF, seed="plush-stuffing")}, hardness=0.5, sound="wool", map_color="color_yellow"),
        Block("plush_star_light", "Star Nightlight", "glow", {"all": tex(star_light, P_STAR, "plush-star")}, hardness=0.4,
              sound="wool", tool="hoe", light=14, map_color="color_yellow"),
    ],
    items=[
        Item("plush_fluff", "Teddy Fluff", tex("item_icon", "dust", P_STUFF, seed="plush-fluff"), lore=(
            "Premium unbleached teddy stuffing. Smells faintly of bedtime.")),
        Item("plush_button", "Lucky Button", tex("item_icon", "coin", ["#a03050", "#d04a6a", "#f07a90", "#ffc0cc"],
                                                 seed="plush-lucky-button"),
             rarity="uncommon", lore="Four holes. Endless possibilities."),
        Item("plush_felt_cookie", "Felt Cookie", tex("item_icon", "candy", ["#b07040", "#dca46c", "#ffe0b0"],
                                                     seed="plush-cookie", accent=PINK),
             kind="food", food=Food(3, 0.6, always=True, fast=True,
                                    effects=[Effect("minecraft:regeneration", 6, 0), Effect("minecraft:slow_falling", 10, 0)]),
             lore="Made of felt. Tastes like cookie anyway. Nobody asks how."),
    ],
    creatures=[
        Creature("plush_bear", "Plush Bear", "biped", ["#c8925a", "#f6e2c4", "#f48aa0", "#1a1010", "#8a5a34"],
                 pattern="patches", size=0.85, glow_eyes=False,
                 body={"bulky": True, "ears": "round", "snout": 2, "eye_style": "round", "eye_size": 2, "mouth": "smile",
                       "blush": True, "head_size": 1.3, "leg_len": 6, "arm_len": 8, "torso_w": 10, "torso_h": 10},
                 behavior="passive", health=20, speed=0.24, tempt="minecraft:honey_bottle",
                 drops=[Drop("plush_fluff", 1, 3), Drop("plush_felt_cookie", 0, 1, chance=0.5)],
                 sounds="panda", pitch=1.3, xp=3, group=3,
                 description="Hugs anything that stands still long enough. Has one ear sewn on slightly crooked."),
        Creature("yarn_cat", "Yarn Cat", "quadruped", ["#f0a050", "#ffe0b8", "#e05a7a", "#2a1a10"], pattern="stripes",
                 size=0.6, glow_eyes=False,
                 body={"ears": "pointy", "tail": 3, "tail_len": 4, "tail_kind": "curl", "whiskers": True, "snout": 1,
                       "leg_len": 5, "body_len": 11, "body_h": 7, "body_w": 7, "eye_style": "cute", "mouth": "smile",
                       "head_size": 1.2},
                 behavior="passive", health=10, speed=0.3, tempt="minecraft:string",
                 drops=[Drop("minecraft:string", 1, 3)], sounds="cat", pitch=1.15, xp=2, group=3,
                 description="Knitted from a single unbroken strand. Do NOT pull the loose end."),
        Creature("button_spider", "Button Spider", "crawler", ["#6a58a0", "#f4c040", "#e86a8a", "#1a1424", "#f0eef8"],
                 pattern="spots", size=0.7, glow_eyes=False,
                 body={"kind": "spider", "legs": 4, "leg_len": 9, "eyes": 2, "eye_size": 4, "eye_style": "cute",
                       "mouth": "smile", "body_h": 6},
                 behavior="neutral", health=14, damage=3, speed=0.28, abilities=["climb"],
                 drops=[Drop("minecraft:string", 1, 2), Drop("plush_button", 0, 1, chance=0.5)],
                 sounds="spider", pitch=1.5, xp=4, group=2,
                 description="Its eyes are buttons and its legs are pipe cleaners. It bites, but only a little."),
    ],
    biomes=[
        Biome("plush_felt_meadows", "Felt Meadows", top="plush_felt_grass", under="plush_stuffing",
              temperature=0.0, humidity=0.0, underwater="plush_stuffing",
              grass_color="#7ec68e", foliage_color="#f094b4", water_color="#78bcf0", water_fog_color="#5a9ad0",
              particles=[("dust:#ffffff:1.2", 0.003), ("dust:#ffd0de:0.9", 0.002)], ambient="cozy_breeze",
              music="minecraft:music.overworld.meadow",
              features=[
                  BUTTONS,
                  Tree(log="plush_yarn_log", leaves="plush_pink_yarn", shape="oak", height=(4, 6), count=1, chance=2),
                  Tree(log="plush_yarn_log", leaves="plush_mint_yarn", shape="oak", height=(4, 6), count=1, chance=3),
                  YARN_BALLS,
                  Patch(block="minecraft:short_grass", count=2, tries=16),
              ],
              spawns=[Spawn("plush_bear", 12, (2, 3)), Spawn("yarn_cat", 10, (1, 3)), Spawn("button_spider", 2, (1, 1))]),
        Biome("plush_yarnwood", "Yarnwood", top="plush_felt_grass", under="plush_stuffing",
              temperature=-0.3, humidity=0.65, underwater="plush_stuffing",
              grass_color="#6cb47e", foliage_color="#74ceba", water_color="#78bcf0", water_fog_color="#5a9ad0",
              particles=[("dust:#90dcca:0.9", 0.003), ("dust:#f8b0c8:0.9", 0.003)], ambient="cozy_breeze",
              music="minecraft:music.overworld.cherry_grove",
              features=[
                  GIANT_YARN_TREE,
                  GiantPlant(stem="plush_yarn_log", head="plush_mint_yarn", shape="sphere", height=(6, 9), radius=(3, 4),
                             count=2, bend=0.15),
                  GiantPlant(stem="plush_yarn_log", head="plush_pink_yarn", shape="sphere", height=(5, 8), radius=(2, 3),
                             count=2),
                  Patch(block="plush_button_flower", count=2, tries=16),
              ],
              spawns=[Spawn("yarn_cat", 12, (2, 3)), Spawn("plush_bear", 6, (1, 2)), Spawn("button_spider", 4, (1, 2))]),
        Biome("plush_quilted_downs", "Quilted Downs", top="plush_patchwork", under="plush_stuffing",
              temperature=0.65, humidity=-0.5, underwater="plush_stuffing",
              grass_color="#94d6a0", foliage_color="#f094b4", water_color="#78bcf0", water_fog_color="#5a9ad0",
              particles=[("dust:#fff2c0:1.0", 0.003)], ambient="cozy_breeze", music="minecraft:music.overworld.flower_forest",
              surface_noise=[("plush_felt_grass", 0.15)],
              features=[
                  Boulder(blocks=[("plush_yarn_ball", 1)], radius=(4, 7), squash=1.0, count=1, chance=2),
                  Boulder(blocks=[("plush_cushion", 1)], radius=(2, 4), squash=0.45, count=1, chance=3),
                  BUTTONS,
                  Tree(log="plush_yarn_log", leaves="plush_pink_yarn", shape="oak", height=(4, 5), count=1, chance=3),
              ],
              spawns=[Spawn("plush_bear", 14, (2, 4)), Spawn("yarn_cat", 6, (1, 2))]),
        Biome("plush_pillow_heights", "Pillow Heights", top="plush_lilac_felt", under="plush_stuffing",
              temperature=-0.5, humidity=-0.4, elevation=0.55, underwater="plush_stuffing",
              grass_color="#b09edc", foliage_color="#d8ccf2", water_color="#9ac8f4", water_fog_color="#6a9ad0",
              sky_color="#b8c8fa", particles=[("dust:#d8ccf2:1.2", 0.004), ("minecraft:end_rod", 0.0006)],
              ambient="candy_chime", music="minecraft:music.overworld.grove",
              features=[
                  CUSHIONS,
                  GiantPlant(stem="plush_yarn_log", head="plush_star_light", shape="sphere", height=(5, 8), radius=(1, 1),
                             count=1, chance=2),
                  Patch(block="plush_button_flower", count=1, tries=12),
                  Tree(log="plush_yarn_log", leaves="plush_mint_yarn", shape="oak", height=(4, 6), count=1, chance=3),
              ],
              spawns=[Spawn("plush_bear", 8, (1, 3)), Spawn("button_spider", 4, (1, 2)), Spawn("yarn_cat", 4, (1, 2))]),
    ],
    effects=[],
    ambient="cozy_breeze",
    music="minecraft:music.overworld.meadow",
    icon="portalgun:plush_felt_cookie",
)
