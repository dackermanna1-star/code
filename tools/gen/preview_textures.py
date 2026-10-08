"""Render contact sheets of every generator in gen.textures.

Usage (from tools/):
    python3 -m gen.preview_textures [OUT_DIR] [name-filter ...]

Full blocks are shown tiled 3x3 (to check seams), sprites/items single on a
checkerboard; everything is upscaled with nearest-neighbour and labelled.

Groups (pass any of them to restrict the run): blocks, terrain, plants, items, misc, stats.

``stats`` writes ``tex_stats.png`` and prints a table with, per block, the wrap-edge vs
interior neighbour difference, the low-frequency energy ratio (|k| <= 1.5), the 8x8
quadrant-mean std and the luminance std; for the terrain blocks the same numbers over 12 seeds
and several real palettes with a PASS/FAIL verdict (low-frequency ratio <= 0.06 and quadrant
std <= 3 for the median seed, <= 0.09 / 4.5 for the worst); and per sprite / item kind the
number of distinct alpha masks over 12 seeds (mirror images counted once).
``--strict`` makes the run exit with status 1 when a terrain block FAILs.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from . import textures as T

DEFAULT_OUT = Path(os.environ.get(
    "TEXTURE_PREVIEW_DIR", "/tmp/claude-0/-home-user-code/ffde1e93-947b-5042-9ce8-22860616ebef/scratchpad/assets"))

# ---------------------------------------------------------------- palettes
GREY = ["#3f3f44", "#5a5a60", "#76767c", "#8f8f94", "#a9a9ad"]
BROWN = ["#3b2a1e", "#5a3f2b", "#7a5639", "#96704c", "#b08b62"]
PURPLE = ["#2a1438", "#47225c", "#6a3685", "#8f54a8", "#b77fcc", "#d8b0e6"]
GREEN = ["#2e5a1c", "#3f7a26", "#56982f", "#73b33c", "#93cc55"]
TEAL = ["#0d3b46", "#16606a", "#22908f", "#3fc2b3", "#8bead9", "#d9fff6"]
ORANGE = ["#4a140c", "#7a2412", "#ab3c17", "#d5621e", "#f08f34", "#ffc266"]
SAND = ["#a8915e", "#c2ab73", "#d6c48c", "#e6d6a3"]
SNOW = ["#9fb3c8", "#c6d4e3", "#e4edf5", "#fafcff"]
WOOD = ["#4d3219", "#6b4a2a", "#8a6338", "#a87d48", "#c49a5e"]
BARK = ["#2b1d12", "#3f2b1a", "#563c24", "#6e4e30"]
PINK = ["#5a1a2c", "#8c2f45", "#c04d63", "#e07a8a", "#f6aab2"]
VEIN = ["#3a0a18", "#6b1630", "#94263f"]
RED = ["#5c0e0e", "#8e1a17", "#c22b22", "#e04a32", "#f2775a"]
BLUEP = ["#101a3a", "#1d2f66", "#2d4b9a", "#4672cc", "#7aa3ee", "#c4dcff"]
YELLOW = ["#7a4a08", "#b0700f", "#d99a1c", "#f2c23a", "#ffe07a"]
CREAM = ["#9c8d74", "#bcae93", "#d8ccb3", "#eee6d3"]
BONE = ["#8f8670", "#b3aa90", "#d1c9b0", "#e9e3cf", "#faf7ec"]
ICE = ["#4f7fb8", "#79a6d6", "#a9cdee", "#d6ecff"]
CHOC = ["#2a140a", "#3f2010", "#5a3018", "#764224", "#93582f"]
COOKIE = ["#7a4a22", "#9c6631", "#ba8545", "#d4a35d", "#e6c07c"]
DARKOBS = ["#0c0812", "#170f24", "#2a1a40", "#45306a", "#6d4fa0"]
CARPET = ["#3a1020", "#a02a3a", "#e3b04b", "#1f4d7a", "#f2e6c8"]
THREE = ["#2b1d14", "#6b4a33", "#c49a6c"]
EIGHT = ["#140c1c", "#2c1838", "#45285a", "#62407a", "#835c9a", "#a67dba", "#c9a3d8", "#ecd2f2"]
LIME = ["#1b8433", "#4fae49", "#7ac653", "#97cd59", "#cbe368"]
CYAN = ["#0a2a3a", "#0f4f63", "#168196", "#2dbcc9", "#8af0f0"]
METAL = ["#2f3338", "#4a5057", "#68707a", "#8a939c", "#b4bcc4"]
RUST = ["#3a1a0c", "#6b2e12", "#9a4a1c", "#c46a2a", "#de9a52"]
WHITE = ["#b8b8c0", "#d0d0d8", "#e6e6ee", "#f8f8ff"]

# full block faces: (name, [(label, thunk), (label, thunk)])
BLOCKS = [
    ("stone", lambda: [T.stone(GREY, "a"), T.stone(PURPLE, "b")]),
    ("rough_stone", lambda: [T.rough_stone(GREY, "a"), T.rough_stone(TEAL, "b")]),
    ("dirt", lambda: [T.dirt(BROWN, "a"), T.dirt(THREE, "b")]),
    ("sand", lambda: [T.sand(SAND, "a"), T.sand(PINK, "b")]),
    ("gravel", lambda: [T.gravel(GREY, "a"), T.gravel(BROWN, "b")]),
    ("grass_top", lambda: [T.grass_top(GREEN, "a"), T.grass_top(TEAL, "b")]),
    ("grass_side", lambda: [T.grass_side(GREEN, BROWN, "a"), T.grass_side(PURPLE, GREY, "b")]),
    ("moss", lambda: [T.moss(GREEN, "a"), T.moss(ORANGE, "b")]),
    ("snow", lambda: [T.snow(SNOW, "a"), T.snow(PINK[2:] + ["#fff0f4"], "b")]),
    ("ash", lambda: [T.ash(GREY, "a"), T.ash(EIGHT, "b")]),
    ("log_side", lambda: [T.log_side(BARK, "a"), T.log_side(PURPLE, "b")]),
    ("log_top", lambda: [T.log_top(BARK, WOOD, "a"), T.log_top(PURPLE, TEAL, "b")]),
    ("planks", lambda: [T.planks(WOOD, "a"), T.planks(TEAL, "b")]),
    ("leaves", lambda: [T.leaves(GREEN, "a"), T.leaves(PINK, "b", holes=0.15)]),
    ("mushroom_cap", lambda: [T.mushroom_cap(RED, "a"), T.mushroom_cap(BROWN, "b", spots_pal=[])]),
    ("mushroom_cap sporewood", lambda: [T.mushroom_cap(P_CAP, "tealcap", spots_pal=["#b8fff0", "#e8fffa"]),
                                        T.mushroom_cap(P_CAP2, "violetcap", spots_pal=["#ffd0ff", "#fff0ff"])]),
    ("mushroom_stem", lambda: [T.mushroom_stem(CREAM, "a"), T.mushroom_stem(BONE, "b")]),
    ("crystal", lambda: [T.crystal(TEAL, "a"), T.crystal(PURPLE, "b")]),
    ("glass", lambda: [T.glass(ICE, "a"), T.glass(LIME, "b")]),
    ("ore", lambda: [T.ore(T.stone(GREY, "s"), TEAL, "a"), T.ore(T.stone(PURPLE, "s"), YELLOW, "b")]),
    ("lamp cross/orb", lambda: [T.lamp(YELLOW, "a", "cross"), T.lamp(CYAN, "b", "orb")]),
    ("lamp grid", lambda: [T.lamp(LIME, "a", "grid"), T.lamp(PINK, "b", "grid")]),
    ("bricks", lambda: [T.bricks(RED, "a"), T.bricks(GREY, "b", mortar="light")]),
    ("tiles", lambda: [T.tiles(BLUEP, "a"), T.tiles(CREAM, "b", size=4)]),
    ("metal", lambda: [T.metal(METAL, "a"), T.metal(YELLOW, "b")]),
    ("rust", lambda: [T.rust(RUST, "a"), T.rust(THREE, "b")]),
    ("circuit", lambda: [T.circuit(["#0b2a14", "#123d1d", "#1a5228", "#226633"], YELLOW, "a"),
                         T.circuit(BLUEP[:4], CYAN, "b")]),
    ("flesh", lambda: [T.flesh(PINK, VEIN, "a"), T.flesh(ORANGE, PURPLE[:3], "b")]),
    ("goo", lambda: [T.goo(LIME, "a"), T.goo(PURPLE, "b")]),
    ("wool", lambda: [T.wool(WHITE, "a"), T.wool(BLUEP, "b")]),
    ("toy_brick", lambda: [T.toy_brick("#d22b2b", "a"), T.toy_brick("#2b6fd2", "b")]),
    ("neon_grid", lambda: [T.neon_grid("#0d0b1f", "#ff3cf0", "a"), T.neon_grid("#06141a", "#38f5ff", "b")]),
    ("checker / missing", lambda: [T.checker("#222222", "#eeeeee"), T.missing_texture()]),
    ("checker 3 / 6 (snapped)", lambda: [T.checker("#222222", "#eeeeee", 3), T.checker("#d22b2b", "#f0e0c0", 6)]),
    ("tiles 6 / candy 3 (fit 16)", lambda: [T.tiles(TEAL, "c", size=6), T.candy_stripe("#5bd0ff", "#ffe2f2", "c", 3)]),
    ("cheese", lambda: [T.cheese(YELLOW, "a"), T.cheese(CREAM, "b")]),
    ("honeycomb", lambda: [T.honeycomb(YELLOW, "a"), T.honeycomb(PURPLE, "b")]),
    ("wax", lambda: [T.wax(YELLOW, "a"), T.wax(PINK, "b")]),
    ("scales", lambda: [T.scales(GREEN, "a"), T.scales(TEAL, "b")]),
    ("bone", lambda: [T.bone(BONE, "a"), T.bone(CREAM, "b")]),
    ("ice", lambda: [T.ice(ICE, "a"), T.ice(PURPLE[2:], "b")]),
    ("cloud", lambda: [T.cloud(WHITE, "a"), T.cloud(PINK[2:] + ["#fff0f4"], "b")]),
    ("sketch", lambda: [T.sketch("a"), T.sketch("b", ink="#1a2a6c", paper="#fffbe8")]),
    ("coral", lambda: [T.coral(PINK, "a"), T.coral(CYAN, "b")]),
    ("salt", lambda: [T.salt(WHITE, "a"), T.salt(PINK[2:] + ["#fff0f4"], "b")]),
    ("obsidian_like", lambda: [T.obsidian_like(DARKOBS, "a"), T.obsidian_like(["#060a0a", "#0c1818", "#14302c", "#1f5045", "#3a8a6a"], "b")]),
    ("carpet_pattern", lambda: [T.carpet_pattern(CARPET, "a"), T.carpet_pattern(TEAL, "c")]),
    ("candy_stripe", lambda: [T.candy_stripe("#e8333b", "#f8f4f0", "a"), T.candy_stripe("#5bd0ff", "#ffe2f2", "b")]),
    ("frosting", lambda: [T.frosting(PINK[2:] + ["#ffe0e8"], "a"), T.frosting(CREAM, "b", sprinkles=False)]),
    ("chocolate", lambda: [T.chocolate(CHOC, "a"), T.chocolate(COOKIE, "b")]),
    ("cookie", lambda: [T.cookie(COOKIE, "a"), T.cookie(SAND, "b")]),
    ("cardboard", lambda: [T.cardboard(["#7a5a34", "#98744a", "#b08b5c", "#c4a274"], "a"), T.cardboard(GREY, "b")]),
    ("sponge", lambda: [T.sponge(YELLOW, "a"), T.sponge(PINK, "b")]),
    ("slime_block", lambda: [T.slime_block(LIME, "a"), T.slime_block(PINK, "b")]),
    ("plastic", lambda: [T.plastic("#e8c22a", "a"), T.plastic("#3ab06a", "b")]),
    ("static / glitch", lambda: [T.static_noise("a"), T.pixel_glitch("b")]),
    ("velvet", lambda: [T.velvet(RED, "a"), T.velvet(PURPLE, "b")]),
    ("marble", lambda: [T.marble(WHITE, "a"), T.marble(["#1a1a1e", "#2c2c32", "#45454c", "#6a6a72", "#d8c27a"][::1], "b")]),
    ("basalt_side", lambda: [T.basalt_side(GREY, "a"), T.basalt_side(DARKOBS, "b")]),
    ("basalt_top", lambda: [T.basalt_top(GREY, "a"), T.basalt_top(DARKOBS, "b")]),
    ("clay", lambda: [T.clay(["#8e94a4", "#a0a6b5", "#adb3c2", "#bcc1cf"], "a"), T.clay(PINK, "b")]),
    ("terracotta", lambda: [T.terracotta(["#7d4630", "#93543a", "#a0603f", "#ad6c4a"], "a"), T.terracotta(TEAL, "b")]),
    ("rainbow_bands", lambda: [T.rainbow_bands("a"), T.rainbow_bands("b", horizontal=False)]),
    ("3-col / 8-col", lambda: [T.stone(THREE, "x"), T.rough_stone(EIGHT, "y")]),
]

PLANTS = [
    ("grass_tuft", lambda: [T.grass_tuft(GREEN, "a"), T.grass_tuft(TEAL, "b")]),
    ("tall_plant b/t", lambda: [_stack(T.tall_plant_top(GREEN, "a"), T.tall_plant_bottom(GREEN, "a")),
                                _stack(T.tall_plant_top(PURPLE, "b"), T.tall_plant_bottom(PURPLE, "b"))]),
    ("flower daisy/tulip", lambda: [T.flower(GREEN, ["#d8d0c0", "#efe9dc", "#ffffff"], "a", "daisy", "#f2c23a"),
                                    T.flower(GREEN, RED, "b", "tulip")]),
    ("flower bell/star", lambda: [T.flower(GREEN, BLUEP[2:], "a", "bell"), T.flower(TEAL, YELLOW, "b", "star")]),
    ("flower orb/spiral", lambda: [T.flower(PURPLE, CYAN, "a", "orb"), T.flower(GREEN, PINK, "b", "spiral")]),
    ("mushroom dome/flat", lambda: [T.mushroom_sprite(RED, CREAM, "a", "dome"), T.mushroom_sprite(BROWN, CREAM, "b", "flat")]),
    ("mushroom tall/cluster", lambda: [T.mushroom_sprite(PURPLE, BONE, "a", "tall"), T.mushroom_sprite(CYAN, CREAM, "b", "cluster")]),
    ("cluster c/d", lambda: [T.mushroom_sprite(RED, CREAM, "c", "cluster"), T.mushroom_sprite(P_CAP, CREAM, "d", "cluster")]),
    ("sprout", lambda: [T.sprout(GREEN, "a"), T.sprout(PINK, "b")]),
    ("fern", lambda: [T.fern(GREEN, "a"), T.fern(TEAL, "b")]),
    ("crystal_shard_sprite", lambda: [T.crystal_shard_sprite(PURPLE, "a"), T.crystal_shard_sprite(TEAL, "b", count=2)]),
    ("coral_fan", lambda: [T.coral_fan(PINK, "a"), T.coral_fan(YELLOW, "b")]),
    ("reeds", lambda: [T.reeds(GREEN, "a"), T.reeds(SAND, "b")]),
    ("thorn_bush", lambda: [T.thorn_bush(BARK, "a"), T.thorn_bush(PURPLE, "b")]),
    ("eyeball_plant", lambda: [T.eyeball_plant(GREEN, "#f4efe6", "#2d8bd6", "a"), T.eyeball_plant(PURPLE, "#ffe9e0", "#d6262d", "b")]),
    ("bulb", lambda: [T.bulb(GREEN, CYAN, "a"), T.bulb(PURPLE, YELLOW, "b")]),
    ("bulb c/d", lambda: [T.bulb(TEAL, ORANGE, "c"), T.bulb(GREEN, PINK, "d")]),
    ("lollipop_plant", lambda: [T.lollipop_plant("#f0ece2", ["#e8333b", "#f8f4f0"], "a"), T.lollipop_plant("#f0ece2", ["#5bd0ff", "#c58bff", "#ffffff"], "b")]),
    ("cactus_sprite", lambda: [T.cactus_sprite(GREEN, "a"), T.cactus_sprite(TEAL, "b")]),
    ("puffball", lambda: [T.puffball(CREAM, "a"), T.puffball(PURPLE, "b")]),
    ("puffball sporewood", lambda: [T.puffball(["#8a7aa0", "#b3a3c8", "#d8ccec"], "puff"), T.puffball(RED, "c")]),
    ("tendril", lambda: [T.tendril(GREEN, "a"), T.tendril(PINK, "b")]),
    ("vine_overlay", lambda: [T.vine_overlay(GREEN, "a"), T.vine_overlay(PURPLE, "b")]),
    ("lily_pad", lambda: [T.lily_pad(GREEN, "a"), T.lily_pad(PINK, "b")]),
    ("sapling", lambda: [T.sapling(BARK, GREEN, "a"), T.sapling(PURPLE, TEAL, "b")]),
    ("berry_bush", lambda: [T.berry_bush(GREEN, "#d6262d", "a"), T.berry_bush(TEAL, "#ffd34e", "b")]),
    ("bone_sprite", lambda: [T.bone_sprite(BONE, "a"), T.bone_sprite(CREAM, "b")]),
    ("bone_sprite c/d", lambda: [T.bone_sprite(BONE, "c"), T.bone_sprite(WHITE, "d")]),
    ("gear_sprite", lambda: [T.gear_sprite(METAL, "a"), T.gear_sprite(YELLOW, "b")]),
    ("wire_sprite", lambda: [T.wire_sprite(RED, "a"), T.wire_sprite(CYAN, "b")]),
]

ITEM_KINDS = T.ITEM_KINDS  # single source of truth: new kinds are previewed automatically

ITEM_PALS = {
    "meat_raw": (PINK, None), "meat_cooked": (CHOC[1:] + ["#b07040"], None), "gem": (TEAL, None),
    "orb": (PURPLE, None), "shard": (CYAN, None), "goo": (LIME, None), "feather": (WHITE, None),
    "scale": (GREEN, None), "fang": (BONE, None), "eyeball": (WHITE, "#d6262d"), "spore": (ORANGE, None),
    "dust": (RED, None), "bone": (BONE, None), "shell": (PINK, None), "fruit": (RED, "#3f7a26"),
    "berry": (BLUEP, "#3f7a26"), "jelly": (PINK, None), "horn": (BONE, None), "core": (ORANGE, None),
    "ingot": (YELLOW, None), "crystal": (PURPLE, None), "leaf": (GREEN, None), "seed": (COOKIE, None),
    "mushroom": (RED, None), "candy": (PINK, "#f8f4f0"), "slice": (RED, "#3f7a26"), "cheese": (YELLOW, None),
    "bottle": (CYAN, None), "egg": (CREAM, "#7a5639"), "chip": (METAL, "#ffd34e"), "bolt": (METAL, None),
    "star": (YELLOW, None), "coin": (YELLOW, None), "flower": (PINK, "#ffd34e"), "tentacle": (PURPLE, None),
    "wing": (GREY, None), "petal": (PINK, None), "pearl": (WHITE, None), "rod": (ORANGE, None),
    "gear": (METAL, None),
}

ALT_PALS = [TEAL, ORANGE, PURPLE, GREEN, BLUEP, RED]
DEFAULT_ITEM_PAL = (GREEN, None)

# real palettes from the sporewood dimension (dark, low-saturation terrain)
P_MOSS = ["#1d3b3a", "#245048", "#2f6b5a", "#3f8a6c", "#58a982"]
P_SOIL = ["#2a1f2e", "#3a2b3d", "#4b3a4e", "#5d4a5f"]
P_ROCK = ["#2b2d3a", "#3a3d4d", "#4a4e60", "#5c6074", "#6f7488"]
P_CAP = ["#1a6f7a", "#1f8a92", "#28a8aa", "#3fc9c0", "#7ff0dc"]
P_CAP2 = ["#6a2a7a", "#86339a", "#a443b6", "#c264d0", "#e39af0"]


def _stack(top, bottom):
    im = Image.new("RGBA", (16, 32), (0, 0, 0, 0))
    im.paste(top, (0, 0))
    im.paste(bottom, (0, 16))
    return im


def _font(size=14, mono=False):
    name = "DejaVuSansMono.ttf" if mono else "DejaVuSans.ttf"
    for p in ("/usr/share/fonts/truetype/dejavu/" + name, "/usr/share/fonts/dejavu/" + name):
        try:
            return ImageFont.truetype(p, size)
        except OSError:
            pass
    return ImageFont.load_default()


def _checker_bg(w, h, a=(104, 128, 160), b=(118, 142, 174), cell=8):
    im = Image.new("RGBA", (w, h), a + (255,))
    d = ImageDraw.Draw(im)
    for y in range(0, h, cell):
        for x in range(0, w, cell):
            if (x // cell + y // cell) % 2:
                d.rectangle([x, y, x + cell - 1, y + cell - 1], fill=b + (255,))
    return im


def tile3(img, scale, n=3):
    w, h = img.size
    big = Image.new("RGBA", (w * n, h * n), (0, 0, 0, 0))
    for j in range(n):
        for i in range(n):
            big.paste(img, (i * w, j * h))
    big = big.resize((w * n * scale, h * n * scale), Image.NEAREST)
    bg = _checker_bg(*big.size, cell=12)
    bg.alpha_composite(big)
    return bg


def single(img, scale, bg=True):
    big = img.resize((img.size[0] * scale, img.size[1] * scale), Image.NEAREST)
    if not bg:
        return big
    out = _checker_bg(*big.size, cell=scale * 2)
    out.alpha_composite(big)
    return out


def _fit_label(d, label, width, size=15):
    """Font + text that fit ``width`` px: shrink the font down to 10px, then truncate with '..'."""
    for sz in range(size, 9, -1):
        font = _font(sz)
        if d.textlength(label, font=font) <= width:
            return font, label
    font = _font(10)
    while label and d.textlength(label + "..", font=font) > width:
        label = label[:-1]
    return font, label + ".."


def sheet(cells, cols, path, title):
    """cells: list of (label, image).  Labels are shrunk / truncated to the cell width."""
    tfont = _font(22)
    pad, lab = 10, 20
    cw = max(c[1].size[0] for c in cells)
    ch = max(c[1].size[1] for c in cells)
    rows = (len(cells) + cols - 1) // cols
    W = cols * (cw + pad) + pad
    H = 40 + rows * (ch + lab + pad) + pad
    im = Image.new("RGBA", (W, H), (36, 36, 40, 255))
    d = ImageDraw.Draw(im)
    d.text((pad, 8), title, fill=(240, 240, 240), font=tfont)
    for k, (label, c) in enumerate(cells):
        x = pad + (k % cols) * (cw + pad)
        y = 40 + (k // cols) * (ch + lab + pad)
        font, text = _fit_label(d, label, cw)
        d.text((x, y), text, fill=(225, 225, 210), font=font)
        im.alpha_composite(c, (x, y + lab))
    path.parent.mkdir(parents=True, exist_ok=True)
    im.convert("RGB").save(path)
    return path


def _match(name, filters):
    return not filters or any(f in name for f in filters)


def render_blocks(out, filters, per_sheet=18, scale=5):
    cells = []
    for name, fn in BLOCKS:
        if not _match(name, filters):
            continue
        a, b = fn()
        cells.append((name + " A", tile3(a, scale)))
        cells.append((name + " B", tile3(b, scale)))
    paths = []
    for i in range(0, len(cells), per_sheet):
        paths.append(sheet(cells[i:i + per_sheet], 6, out / f"tex_blocks_{i // per_sheet + 1}.png",
                           f"Full blocks (3x3 tiled) {i // per_sheet + 1}"))
    return paths


# terrain blocks that cover most of every dimension: (name, generator, [palettes]) -- checked by
# the stats group and shown 6x6 in tex_terrain.png (large areas show any 16px repetition)
TERRAIN = [
    ("stone", T.stone, [GREY, PURPLE, P_ROCK]),
    ("dirt", T.dirt, [BROWN, P_SOIL, THREE]),
    ("grass_top", T.grass_top, [GREEN, P_MOSS, TEAL]),
    ("moss", T.moss, [GREEN, ORANGE]),
    ("ash", T.ash, [GREY, EIGHT]),
    ("obsidian_like", T.obsidian_like, [DARKOBS, ["#060a0a", "#0c1818", "#14302c", "#1f5045", "#3a8a6a"]]),
    ("bone", T.bone, [BONE, CREAM]),
    ("goo", T.goo, [LIME, PURPLE]),
    ("wax", T.wax, [YELLOW, PINK]),
    ("sand", T.sand, [SAND, PINK]),
    ("snow", T.snow, [SNOW]),
    ("clay", T.clay, [PINK]),
    ("terracotta", T.terracotta, [TEAL, ["#7d4630", "#93543a", "#a0603f", "#ad6c4a"]]),
    ("mushroom_stem", T.mushroom_stem, [CREAM]),
]
TERRAIN_LIMITS = dict(lf=0.06, quad=3.0, lf_worst=0.09, quad_worst=4.5)


def render_terrain(out, filters, scale=3):
    cells = []
    for name, fn, pals in TERRAIN:
        if not _match(name, filters):
            continue
        for k, p in enumerate(pals[:2]):
            cells.append((f"{name} {'AB'[k]} 6x6", tile3(fn(p, f"t{k}"), scale, n=6)))
    if not cells:
        return []
    return [sheet(cells, 6, out / "tex_terrain.png", "Terrain blocks tiled 6x6 (look for a 16px grid)")]


def render_plants(out, filters, scale=8):
    cells = []
    for name, fn in PLANTS:
        if not _match(name, filters):
            continue
        for k, im in enumerate(fn()):
            cells.append((f"{name} {'AB'[k]}", single(im, scale)))
    if not cells:
        return []
    paths = []
    per = 24
    for i in range(0, len(cells), per):
        paths.append(sheet(cells[i:i + per], 8, out / f"tex_plants_{i // per + 1}.png",
                           f"Plant sprites {i // per + 1}"))
    return paths


def render_items(out, filters, scale=8):
    cells = []
    for n, kind in enumerate(ITEM_KINDS):
        if not _match(kind, filters) and not _match("item", filters):
            continue
        p, acc = ITEM_PALS.get(kind, DEFAULT_ITEM_PAL)
        cells.append((kind, single(T.item_icon(kind, p, "a", accent=acc), scale)))
        alt = ALT_PALS[(n * 5 + 3) % len(ALT_PALS)]
        cells.append((kind + " alt", single(T.item_icon(kind, alt, "b"), scale)))
    if not cells:
        return []
    paths = []
    per = 40
    for i in range(0, len(cells), per):
        paths.append(sheet(cells[i:i + per], 10, out / f"tex_items_{i // per + 1}.png",
                           f"Item icons {i // per + 1}"))
    return paths


def render_misc(out, filters, scale=8):
    cells = []
    if _match("bottle", filters) or _match("misc", filters):
        cells.append(("portal_fluid_bottle", single(T.portal_fluid_bottle("a"), scale)))
        for i, f in enumerate(T.portal_fluid_frames("a")):
            if i % 2 == 0:
                cells.append((f"fluid frame {i}", single(f, scale)))
    if _match("egg", filters) or _match("misc", filters):
        for (b, s, sd) in [("#3d7a2a", "#1f2a14", "a"), ("#e8e2d6", "#c22b22", "b"),
                           ("#6a3685", "#38f5ff", "c"), ("#e8c22a", "#4a2a0a", "d"),
                           ("#202020", "#ff3cf0", "e"), ("#f4f4f4", "#151515", "f")]:
            cells.append((f"spawn_egg {sd}", single(T.spawn_egg(b, s, sd), scale)))
    if _match("gun", filters) or _match("misc", filters):
        for name in ("gun_body", "gun_dark", "gun_screen", "gun_button"):
            cells.append((name, single(getattr(T, name)("a"), scale)))
        for text in ("42", "C-137", "D-99"):
            cells.append((f"gun_screen {text!r}", single(T.gun_screen("a", text), scale)))
        for i, f in enumerate(T.gun_canister_frames("a")):
            if i % 2 == 0:
                cells.append((f"canister {i}", single(f, scale)))
        cells.append(("gun_body 3x3", tile3(T.gun_body("a"), 3)))
    if _match("helpers", filters) or _match("misc", filters):
        st = T.stone(GREY, "h")
        cells.append(("tint(stone,#4fae49,.6)", single(T.tint(st, "#4fae49", 0.6), scale)))
        cells.append(("shift(BROWN,200,1.4)", single(T.stone(T.shift(BROWN, 200, 1.4), "h"), scale)))
        cells.append(('pal("#30304a",..) 3 cols', single(T.stone(T.pal("#30304a", "#55557a", "#8080a8"), "p"), scale)))
        strip, meta = T.animated(T.portal_fluid_frames("a"))
        cells.append((f"animated strip interp={meta['animation']['interpolate']}",
                      single(strip.crop((0, 0, 16, 16)), scale)))
    if not cells:
        return []
    return [sheet(cells, 8, out / "tex_misc.png", "Bottles, eggs, gun parts, helpers")]


# ---------------------------------------------------------------- stats / automated checks

def _lum(img):
    a = np.asarray(img.convert("RGBA"), float)[:16, :16]
    return 0.299 * a[..., 0] + 0.587 * a[..., 1] + 0.114 * a[..., 2]


def lowfreq_ratio(img):
    """Share of (mean-free) luminance energy at the lowest non-zero frequencies, |k| <= 1.5
    (structure at the scale of the whole tile, which repeats as a visible 16px grid)."""
    L = _lum(img)
    L = L - L.mean()
    P = np.abs(np.fft.fft2(L)) ** 2
    k = np.fft.fftfreq(16) * 16
    K = np.hypot(k[None, :], k[:, None])
    tot = P[K > 0].sum()
    return float(P[(K > 0) & (K <= 1.5)].sum() / tot) if tot > 0 else 0.0


def quad_std(img):
    """Std of the four 8x8 quadrant mean luminances (a light/dark half repeats every 16px)."""
    L = _lum(img)
    return float(np.std([L[:8, :8].mean(), L[:8, 8:].mean(), L[8:, :8].mean(), L[8:, 8:].mean()]))


def lum_std(img):
    return float(_lum(img).std())


def wrap_diff(img):
    """(wrap-edge diff, mean interior diff, max interior diff): mean |dL| between the last and
    first column/row vs between neighbouring interior columns/rows.  A seam shows up as a
    wrap diff above every interior one."""
    L = _lum(img)
    cols = np.abs(np.diff(L, axis=1)).mean(0)
    rows = np.abs(np.diff(L, axis=0)).mean(1)
    wrap = max(np.abs(L[:, -1] - L[:, 0]).mean(), np.abs(L[-1, :] - L[0, :]).mean())
    inner = np.concatenate([cols, rows])
    return float(wrap), float(inner.mean()), float(inner.max())


def mask_variety(fn, seeds=tuple("abcdefghijkl")):
    """Number of distinct alpha masks over ``seeds`` (a mask and its mirror image count once)."""
    keys = set()
    for s in seeds:
        m = np.asarray(fn(s).convert("RGBA"))[..., 3] > 0
        keys.add(min(m.tobytes(), np.fliplr(m).tobytes()))
    return len(keys)


SPRITE_VARIETY = [
    ("grass_tuft", lambda s: T.grass_tuft(GREEN, s)), ("flower daisy", lambda s: T.flower(GREEN, PINK, s, "daisy")),
    ("flower tulip", lambda s: T.flower(GREEN, RED, s, "tulip")), ("flower bell", lambda s: T.flower(GREEN, BLUEP[2:], s, "bell")),
    ("flower star", lambda s: T.flower(GREEN, YELLOW, s, "star")), ("flower orb", lambda s: T.flower(GREEN, CYAN, s, "orb")),
    ("flower spiral", lambda s: T.flower(GREEN, PINK, s, "spiral")),
    ("mushroom dome", lambda s: T.mushroom_sprite(RED, CREAM, s, "dome")),
    ("mushroom flat", lambda s: T.mushroom_sprite(BROWN, CREAM, s, "flat")),
    ("mushroom tall", lambda s: T.mushroom_sprite(PURPLE, BONE, s, "tall")),
    ("mushroom cluster", lambda s: T.mushroom_sprite(CYAN, CREAM, s, "cluster")),
    ("sprout", lambda s: T.sprout(GREEN, s)), ("fern", lambda s: T.fern(GREEN, s)),
    ("crystal_shard_sprite", lambda s: T.crystal_shard_sprite(PURPLE, s)), ("coral_fan", lambda s: T.coral_fan(PINK, s)),
    ("reeds", lambda s: T.reeds(GREEN, s)), ("thorn_bush", lambda s: T.thorn_bush(BARK, s)),
    ("eyeball_plant", lambda s: T.eyeball_plant(GREEN, "#f4efe6", "#2d8bd6", s)), ("bulb", lambda s: T.bulb(GREEN, CYAN, s)),
    ("lollipop_plant", lambda s: T.lollipop_plant("#f0ece2", ["#e8333b", "#f8f4f0"], s)),
    ("cactus_sprite", lambda s: T.cactus_sprite(GREEN, s)), ("puffball", lambda s: T.puffball(CREAM, s)),
    ("tendril", lambda s: T.tendril(GREEN, s)), ("vine_overlay", lambda s: T.vine_overlay(GREEN, s)),
    ("lily_pad", lambda s: T.lily_pad(GREEN, s)), ("sapling", lambda s: T.sapling(BARK, GREEN, s)),
    ("berry_bush", lambda s: T.berry_bush(GREEN, "#d6262d", s)), ("bone_sprite", lambda s: T.bone_sprite(BONE, s)),
    ("gear_sprite", lambda s: T.gear_sprite(METAL, s)), ("wire_sprite", lambda s: T.wire_sprite(RED, s)),
]
# faces drawn as one framed panel (bevelled border) on purpose: the wrap edge is a frame, not a seam
FRAMED = ("glass", "metal", "rust", "toy_brick", "lamp", "neon_grid", "sketch", "slime_block", "carpet_pattern")
# kinds whose outline is a circle / box by design: few distinct masks is expected
ROUND_KINDS = {"orb", "coin", "eyeball", "pearl", "core", "chip", "bottle", "gear", "egg", "jelly", "cheese", "ingot"}


def collect_stats(seeds=tuple(f"s{i}" for i in range(12))):
    """Compute all stats; returns (block_rows, terrain_rows, variety_rows, failures)."""
    block_rows = []
    for name, fn in BLOCKS:
        for k, im in enumerate(fn()):
            w, mi, mx = wrap_diff(im)
            block_rows.append((f"{name} {'AB'[k]}", w, mi, mx, lowfreq_ratio(im), quad_std(im), lum_std(im)))
    terrain_rows, failures = [], []
    lim = TERRAIN_LIMITS
    for name, fn, pals in TERRAIN:
        for p in pals:
            st = np.array([(lowfreq_ratio(im), quad_std(im), lum_std(im)) for im in (fn(p, s) for s in seeds)])
            med, worst = np.median(st, 0), st.max(0)
            ok = med[0] <= lim["lf"] and med[1] <= lim["quad"] and worst[0] <= lim["lf_worst"] \
                and worst[1] <= lim["quad_worst"]
            row = (f"{name} {p[0]}", med[0], worst[0], med[1], worst[1], med[2], "PASS" if ok else "FAIL")
            terrain_rows.append(row)
            if not ok:
                failures.append(row)
    variety_rows = [(name, mask_variety(fn), name in ()) for name, fn in SPRITE_VARIETY]
    for kind in ITEM_KINDS:
        variety_rows.append((f"item {kind}", mask_variety(lambda s, k=kind: T.item_icon(k, GREEN, s)), kind in ROUND_KINDS))
    return block_rows, terrain_rows, variety_rows, failures


def render_stats(out, filters):
    block_rows, terrain_rows, variety_rows, failures = collect_stats()
    lines = ["BLOCKS (one seed per variant)",
             f"{'block':30s} {'wrap':>6s} {'in.mean':>7s} {'in.max':>7s} {'lowfreq':>8s} {'quadstd':>8s} {'lumstd':>7s}"]
    for (n, w, mi, mx, lf, q, sd) in block_rows:
        framed = any(n.startswith(f) for f in FRAMED)
        flag = "  SEAM?" if w > mx + 8 and not framed else ("  (framed)" if w > mx + 8 else "")
        lines.append(f"{n[:30]:30s} {w:6.1f} {mi:7.1f} {mx:7.1f} {lf:8.3f} {q:8.2f} {sd:7.1f}{flag}")
    lim = TERRAIN_LIMITS
    lines += ["", "TERRAIN over 12 seeds",
              f"  limits: lowfreq med<={lim['lf']} worst<={lim['lf_worst']}; "
              f"quadstd med<={lim['quad']} worst<={lim['quad_worst']}",
              f"{'block palette':30s} {'lf med':>7s} {'lf max':>7s} {'q med':>6s} {'q max':>6s} {'lumstd':>7s}"]
    for (n, lfm, lfx, qm, qx, sd, verdict) in terrain_rows:
        lines.append(f"{n[:30]:30s} {lfm:7.3f} {lfx:7.3f} {qm:6.2f} {qx:6.2f} {sd:7.1f}  {verdict}")
    lines += ["", "MASK VARIETY (distinct alpha masks over 12 seeds; mirror images count once)"]
    for (n, v, round_) in variety_rows:
        note = " (round/boxy by design)" if round_ else ("  LOW" if v < 6 else "")
        lines.append(f"{n[:30]:30s} {v:3d}{note}")
    text = "\n".join(lines)
    print(text)
    font = _font(12, mono=True)
    lh = 15
    cols = 3
    per = (len(lines) + cols - 1) // cols
    colw = int(max(font.getlength(ln) for ln in lines)) + 24
    W, H = cols * colw + 20, per * lh + 50
    im = Image.new("RGB", (W, H), (30, 30, 34))
    d = ImageDraw.Draw(im)
    d.text((10, 8), f"Texture stats - terrain failures: {len(failures)}", fill=(240, 240, 240), font=_font(20))
    for i, ln in enumerate(lines):
        c, r = divmod(i, per)
        col = (255, 120, 110) if ("FAIL" in ln or "SEAM?" in ln or ln.endswith("LOW")) else (220, 220, 210)
        d.text((10 + c * colw, 40 + r * lh), ln, fill=col, font=font)
    path = out / "tex_stats.png"
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path)
    return [path], failures


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    strict = "--strict" in argv
    argv = [a for a in argv if a != "--strict"]
    out = DEFAULT_OUT
    if argv and ("/" in argv[0]):
        out = Path(argv.pop(0))
    filters = argv
    paths = []
    groups = {"blocks": render_blocks, "terrain": render_terrain, "plants": render_plants, "items": render_items,
              "misc": render_misc}
    chosen = [g for g in list(groups) + ["stats"] if g in filters]
    filters = [f for f in filters if f not in groups and f != "stats"]
    for g, fn in groups.items():
        if chosen and g not in chosen:
            continue
        paths += fn(out, filters)
    failures = []
    if not chosen or "stats" in chosen:
        p, failures = render_stats(out, filters)
        paths += p
    for p in paths:
        print(p)
    if failures:
        print(f"{len(failures)} terrain block/palette combination(s) FAIL the tiling checks")
        if strict:
            sys.exit(1)
    return paths


if __name__ == "__main__":
    main()
