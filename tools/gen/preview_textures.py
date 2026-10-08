"""Render contact sheets of every generator in gen.textures.

Usage (from tools/):
    python3 -m gen.preview_textures [OUT_DIR] [name-filter ...]

Full blocks are shown tiled 3x3 (to check seams), sprites/items single on a
checkerboard; everything is upscaled with nearest-neighbour and labelled.
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from . import textures as T

DEFAULT_OUT = Path("/tmp/claude-0/-home-user-code/ffde1e93-947b-5042-9ce8-22860616ebef/scratchpad/assets")

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
    ("sprout", lambda: [T.sprout(GREEN, "a"), T.sprout(PINK, "b")]),
    ("fern", lambda: [T.fern(GREEN, "a"), T.fern(TEAL, "b")]),
    ("crystal_shard_sprite", lambda: [T.crystal_shard_sprite(PURPLE, "a"), T.crystal_shard_sprite(TEAL, "b", count=2)]),
    ("coral_fan", lambda: [T.coral_fan(PINK, "a"), T.coral_fan(YELLOW, "b")]),
    ("reeds", lambda: [T.reeds(GREEN, "a"), T.reeds(SAND, "b")]),
    ("thorn_bush", lambda: [T.thorn_bush(BARK, "a"), T.thorn_bush(PURPLE, "b")]),
    ("eyeball_plant", lambda: [T.eyeball_plant(GREEN, "#f4efe6", "#2d8bd6", "a"), T.eyeball_plant(PURPLE, "#ffe9e0", "#d6262d", "b")]),
    ("bulb", lambda: [T.bulb(GREEN, CYAN, "a"), T.bulb(PURPLE, YELLOW, "b")]),
    ("lollipop_plant", lambda: [T.lollipop_plant("#f0ece2", ["#e8333b", "#f8f4f0"], "a"), T.lollipop_plant("#f0ece2", ["#5bd0ff", "#c58bff", "#ffffff"], "b")]),
    ("cactus_sprite", lambda: [T.cactus_sprite(GREEN, "a"), T.cactus_sprite(TEAL, "b")]),
    ("puffball", lambda: [T.puffball(CREAM, "a"), T.puffball(PURPLE, "b")]),
    ("tendril", lambda: [T.tendril(GREEN, "a"), T.tendril(PINK, "b")]),
    ("vine_overlay", lambda: [T.vine_overlay(GREEN, "a"), T.vine_overlay(PURPLE, "b")]),
    ("lily_pad", lambda: [T.lily_pad(GREEN, "a"), T.lily_pad(PINK, "b")]),
    ("sapling", lambda: [T.sapling(BARK, GREEN, "a"), T.sapling(PURPLE, TEAL, "b")]),
    ("berry_bush", lambda: [T.berry_bush(GREEN, "#d6262d", "a"), T.berry_bush(TEAL, "#ffd34e", "b")]),
    ("bone_sprite", lambda: [T.bone_sprite(BONE, "a"), T.bone_sprite(CREAM, "b")]),
    ("gear_sprite", lambda: [T.gear_sprite(METAL, "a"), T.gear_sprite(YELLOW, "b")]),
    ("wire_sprite", lambda: [T.wire_sprite(RED, "a"), T.wire_sprite(CYAN, "b")]),
]

ITEM_KINDS = ["meat_raw", "meat_cooked", "gem", "orb", "shard", "goo", "feather", "scale", "fang",
              "eyeball", "spore", "dust", "bone", "shell", "fruit", "berry", "jelly", "horn", "core",
              "ingot", "crystal", "leaf", "seed", "mushroom", "candy", "slice", "cheese", "bottle", "egg",
              "chip", "bolt", "star", "coin", "flower", "tentacle", "wing", "petal", "pearl", "rod", "gear"]

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


def _stack(top, bottom):
    im = Image.new("RGBA", (16, 32), (0, 0, 0, 0))
    im.paste(top, (0, 0))
    im.paste(bottom, (0, 16))
    return im


def _font(size=14):
    for p in ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
              "/usr/share/fonts/dejavu/DejaVuSans.ttf"):
        try:
            return ImageFont.truetype(p, size)
        except OSError:
            pass
    return ImageFont.load_default()


def _checker_bg(w, h, a=(120, 140, 120), b=(140, 160, 140), cell=8):
    im = Image.new("RGBA", (w, h), a + (255,))
    d = ImageDraw.Draw(im)
    for y in range(0, h, cell):
        for x in range(0, w, cell):
            if (x // cell + y // cell) % 2:
                d.rectangle([x, y, x + cell - 1, y + cell - 1], fill=b + (255,))
    return im


def tile3(img, scale):
    w, h = img.size
    big = Image.new("RGBA", (w * 3, h * 3), (0, 0, 0, 0))
    for j in range(3):
        for i in range(3):
            big.paste(img, (i * w, j * h))
    big = big.resize((w * 3 * scale, h * 3 * scale), Image.NEAREST)
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


def sheet(cells, cols, path, title):
    """cells: list of (label, image)."""
    font = _font(15)
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
        d.text((x, y), label, fill=(225, 225, 210), font=font)
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
    for kind in ITEM_KINDS:
        if not _match(kind, filters) and not _match("item", filters):
            continue
        p, acc = ITEM_PALS[kind]
        cells.append((kind, single(T.item_icon(kind, p, "a", accent=acc), scale)))
        alt = ALT_PALS[ITEM_KINDS.index(kind) % len(ALT_PALS)]
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
            cells.append((f"fluid frame {i}", single(f, scale)))
    if _match("egg", filters) or _match("misc", filters):
        for (b, s, sd) in [("#3d7a2a", "#1f2a14", "a"), ("#e8e2d6", "#c22b22", "b"),
                           ("#6a3685", "#38f5ff", "c"), ("#e8c22a", "#4a2a0a", "d")]:
            cells.append((f"spawn_egg {sd}", single(T.spawn_egg(b, s, sd), scale)))
    if _match("gun", filters) or _match("misc", filters):
        for name in ("gun_body", "gun_dark", "gun_screen", "gun_button"):
            cells.append((name, single(getattr(T, name)("a"), scale)))
        for i, f in enumerate(T.gun_canister_frames("a")):
            cells.append((f"canister {i}", single(f, scale)))
        cells.append(("gun_body 3x3", tile3(T.gun_body("a"), 3)))
    if _match("helpers", filters) or _match("misc", filters):
        st = T.stone(GREY, "h")
        cells.append(("tint(stone,#4fae49,.6)", single(T.tint(st, "#4fae49", 0.6), scale)))
        cells.append(("shift(GREY,hue 200,sat 3)", single(T.stone(T.shift(GREY, 200, 3), "h"), scale)))
        strip, meta = T.animated(T.portal_fluid_frames("a"))
        cells.append(("animated strip", single(strip.crop((0, 0, 16, 16)), scale)))
    if not cells:
        return []
    return [sheet(cells, 8, out / "tex_misc.png", "Bottles, eggs, gun parts, helpers")]


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    out = DEFAULT_OUT
    if argv and ("/" in argv[0]):
        out = Path(argv.pop(0))
    filters = argv
    paths = []
    groups = {"blocks": render_blocks, "plants": render_plants, "items": render_items, "misc": render_misc}
    chosen = [g for g in groups if g in filters]
    filters = [f for f in filters if f not in groups]
    for g, fn in groups.items():
        if chosen and g not in chosen:
            continue
        paths += fn(out, filters)
    for p in paths:
        print(p)
    return paths


if __name__ == "__main__":
    main()
