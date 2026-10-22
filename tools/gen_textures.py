#!/usr/bin/env python3
"""Generates every texture of the Julius Juukulius mod.

Everything is drawn procedurally and deterministically (fixed seeds), so the art can be tweaked and rebuilt:

    python3 tools/gen_textures.py                 # writes into src/main/resources/assets/julius_juukulius
    python3 tools/gen_textures.py --sheet DIR     # also writes enlarged contact sheets for review

Requires numpy and Pillow. The outfit texture is painted from the cube layout parsed out of JuliusOutfitModel.java,
so the paint always lines up with the geometry.
"""
from __future__ import annotations

import argparse
import colorsys
import json
import math
import re
from pathlib import Path
from typing import Callable, Optional

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "src" / "main" / "resources" / "assets" / "julius_juukulius"
TEXTURES = ASSETS / "textures"
OUTFIT_MODEL = ROOT / "src" / "client" / "java" / "dev" / "juukulius" / "client" / "render" / "player" / "JuliusOutfitModel.java"

Color = tuple[int, int, int, int]
WRITTEN: list[Path] = []


def hexc(value: str, alpha: int = 255) -> Color:
    value = value.lstrip("#")
    return int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16), alpha


def rgb_of(value: int) -> tuple[float, float, float]:
    return ((value >> 16) & 0xFF) / 255.0, ((value >> 8) & 0xFF) / 255.0, (value & 0xFF) / 255.0


# Palette: purple hair, amber eyes, the white-and-royal-blue Royal Guard uniform with gold trim.
P: dict[str, Color] = {name: hexc(value) for name, value in {
    "skin": "F4D6C2", "skin_sh": "E6BDA6", "skin_dk": "CF9F8A", "mouth": "C98F84",
    "hair_dk": "3B2466", "hair_sh": "56388C", "hair": "7451B3", "hair_lt": "946FCC", "hair_hi": "B79AE6",
    "eye_w": "F6F3FA", "iris": "E0A33A", "brow": "4A2F7C",
    "white": "EDEFF6", "white_sh": "D2D6E3", "white_dk": "B3B9CC", "white_hi": "FFFFFF",
    "blue": "2C4DA4", "blue_dk": "1C326F", "blue_lt": "4B6FCB",
    "gold": "D8B254", "gold_dk": "A07B2A", "gold_lt": "F3DD93",
    "boot": "24253B", "boot_lt": "3B3D5E", "boot_dk": "15162A",
    "glove": "F5F6FB", "glove_sh": "D7DAE5",
    "leather": "232741", "leather_lt": "343A5C",
    "gem": "8F4FE0", "gem_lt": "C9A2FF", "gem_dk": "4E2391",
}.items()}

SPIRITS = [
    ("ia", 0xFF5A36, 0xFFC15A),
    ("kua", 0x3B8CFF, 0xB4E6FF),
    ("aro", 0x3FE07F, 0xD6FFE4),
    ("iku", 0xF2C230, 0xFFEBAA),
    ("in", 0xFFF3D8, 0xFFAA45),
    ("nes", 0x9A52FF, 0x2C0F4E),
]


# ------------------------------------------------------------------------------------------------ output


def write_png(relative: str, image: Image.Image, mcmeta: Optional[dict] = None) -> None:
    path = TEXTURES / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, optimize=True)
    WRITTEN.append(path)
    meta_path = path.with_name(path.name + ".mcmeta")
    if mcmeta is not None:
        meta_path.write_text(json.dumps(mcmeta, indent=2) + "\n")
    elif meta_path.exists():
        meta_path.unlink()


def rgba_image(rgb: np.ndarray, alpha: np.ndarray) -> Image.Image:
    """rgb: HxWx3 floats in [0, 1]; alpha: HxW floats in [0, 1]."""
    data = np.concatenate([np.clip(rgb, 0.0, 1.0), np.clip(alpha, 0.0, 1.0)[..., None]], axis=2)
    return Image.fromarray(np.round(data * 255.0).astype(np.uint8), "RGBA")


def white_image(alpha: np.ndarray, shade: Optional[np.ndarray] = None) -> Image.Image:
    """A white (or grey-shaded) texture whose shape lives in the alpha channel, for tinting by vertex colour."""
    if shade is None:
        shade = np.ones_like(alpha)
    rgb = np.repeat(shade[..., None], 3, axis=2)
    return rgba_image(rgb, alpha)


def effect_meta(clamp: bool) -> dict:
    return {"texture": {"blur": True, "clamp": clamp}}


# ------------------------------------------------------------------------------------------------ pixel canvas


class Canvas:
    def __init__(self, width: int, height: int) -> None:
        self.pixels = np.zeros((height, width, 4), dtype=np.uint8)

    @property
    def width(self) -> int:
        return self.pixels.shape[1]

    @property
    def height(self) -> int:
        return self.pixels.shape[0]

    def put(self, x: int, y: int, color: Optional[Color]) -> None:
        if color is not None and 0 <= x < self.width and 0 <= y < self.height:
            self.pixels[y, x] = color

    def rect(self, x: int, y: int, w: int, h: int, color: Color) -> None:
        for yy in range(y, y + h):
            for xx in range(x, x + w):
                self.put(xx, yy, color)

    def image(self) -> Image.Image:
        return Image.fromarray(self.pixels, "RGBA")


Painter = Callable[[str, int, int, int, int], Optional[Color]]
FACE_ORDER = ("right", "left", "top", "bottom", "back", "front")


def face_rects(u: float, v: float, w: float, h: float, d: float) -> dict[str, tuple[float, float, float, float]]:
    """Vanilla ModelPart cube UV layout (see ModelPart.Cube)."""
    return {
        "top": (u + d, v, w, d),
        "bottom": (u + d + w, v, w, d),
        "right": (u, v + d, d, h),
        "front": (u + d, v + d, w, h),
        "left": (u + d + w, v + d, d, h),
        "back": (u + 2 * d + w, v + d, w, h),
    }


def paint_box(canvas: Canvas, u: float, v: float, w: float, h: float, d: float, painter: Painter) -> None:
    """Paints each face of a cube as seen from outside.

    Painter coordinates: s runs left to right and t top to bottom as the face is seen from outside. On side faces of a
    standing part, t = 0 is the top. On the top and bottom faces, the last row is the front edge and s = 0 is the
    entity's right. On the back face, s = 0 is the entity's left.
    """
    for face in FACE_ORDER:
        x0, y0, fw, fh = face_rects(u, v, w, h, d)[face]
        if fw <= 0 or fh <= 0:
            continue

        px0, py0 = math.floor(x0 + 1e-6), math.floor(y0 + 1e-6)
        px1, py1 = math.ceil(x0 + fw - 1e-6), math.ceil(y0 + fh - 1e-6)
        cols, rows = px1 - px0, py1 - py0
        for py in range(py0, py1):
            for px in range(px0, px1):
                canvas.put(px, py, painter(face, px - px0, py - py0, cols, rows))


def char_map(rows: list[str], legend: dict[str, Optional[Color]]) -> Callable[[int, int], Optional[Color]]:
    def lookup(s: int, t: int) -> Optional[Color]:
        if 0 <= t < len(rows) and 0 <= s < len(rows[t]):
            return legend[rows[t][s]]
        return None

    return lookup


def mirror(rows: list[str]) -> list[str]:
    return [row[::-1] for row in rows]


# ------------------------------------------------------------------------------------------------ Julius skins

HAIR_LEGEND: dict[str, Optional[Color]] = {
    "H": P["hair"], "l": P["hair_lt"], "h": P["hair_hi"], "d": P["hair_sh"], "D": P["hair_dk"],
    "S": P["skin"], "N": P["skin_sh"], "c": P["skin_dk"], "B": P["brow"], "W": P["eye_w"], "I": P["iris"],
    "M": P["mouth"], ".": None,
}

HEAD = {
    "front": [
        "HHHHHHHH",
        "HlHHHHlH",
        "HHSSdSHH",
        "HBBSSBBH",
        "HWISSIWH",
        "HSSNNSSH",
        "dSSMMSSd",
        "cNSSSSNc",
    ],
    "right": [
        "HHHHlHHH",
        "HlHHHHHH",
        "HHHHHlHH",
        "HdHHHHHH",
        "HHHHHHHS",
        "dHHHHHSS",
        "DdHHHSSN",
        "DDdHcNNc",
    ],
    "back": [
        "HlHHlHHl",
        "HlHHlHdl",
        "HlHdlHdH",
        "HHHdHHdH",
        "dHHdHHdH",
        "dHdDHdDH",
        "DdDDdDDd",
        "DDdDDdDD",
    ],
    "top": [
        "HlHHlHHl",
        "HlHHlHHl",
        "HlHHlHHl",
        "HlHdlHHl",
        "HHHdHHlH",
        "HHHdHHlH",
        "HlHdHlHH",
        "HlHdHlHH",
    ],
    "bottom": [
        "DDDDDDDD",
        "DDDDDDDD",
        "dDDDDDDd",
        "dddddddd",
        "cNNNNNNc",
        "NNNNNNNN",
        "NNNNNNNN",
        "cNNNNNNc",
    ],
}
HEAD["left"] = mirror(HEAD["right"])

HAT = {
    "front": [
        "HHHHHHHH",
        "HH....HH",
        "H......H",
        "H......H",
        "d......d",
        "d......d",
        "........",
        "........",
    ],
    "right": [
        "HHHHHHHH",
        "HHlHHHHH",
        "HHHHHHHH",
        "HHHHHHHd",
        "HHHHHHd.",
        "dHHHHd..",
        "DdHHd...",
        "Dd......",
    ],
    "back": [
        "HlHHlHHl",
        "HlHHlHHl",
        "HHHdHHdH",
        "HHHdHHdH",
        "dHHdHHdH",
        "dHdDHdDd",
        "D.DD.DD.",
        "........",
    ],
    "top": [
        "lHHlHHlH",
        "lHHlHHlH",
        "HHlHHlHH",
        "HHlHdHHl",
        "HlHHdHlH",
        "HlHHdHlH",
        "HHlHdHHl",
        "HHlHdHHl",
    ],
    "bottom": ["........"] * 8,
}
HAT["left"] = mirror(HAT["right"])

UNIFORM_LEGEND: dict[str, Optional[Color]] = {
    "w": P["white"], "s": P["white_sh"], "k": P["white_dk"], "W": P["white_hi"], "B": P["blue"], "b": P["blue_dk"],
    "L": P["blue_lt"], "g": P["gold"], "G": P["gold_dk"], "y": P["gold_lt"], "e": P["leather"], "E": P["leather_lt"],
    "o": P["glove"], "O": P["glove_sh"], "x": P["boot"], "X": P["boot_lt"], "z": P["boot_dk"], ".": None,
}

BODY = {
    "front": [
        "wwwWWwww",
        "wwgWWgww",
        "wwgBygww",
        "wwgyBgww",
        "wwgBygww",
        "swgyBgws",
        "swgBBgws",
        "eeeEyeee",
        "eeeeyeee",
        "wwwBBwww",
        "swwBBwws",
        "gggBBggg",
    ],
    "right": ["wwss", "wwws", "wwws", "wwws", "wwws", "swws", "swws", "eeee", "eeee", "swws", "swws", "gGGg"],
    "back": [
        "wwwwwwww",
        "wwwsswww",
        "wwwswwww",
        "swwswwws",
        "swwswwws",
        "swwswwws",
        "sswswwss",
        "eeeeeeee",
        "eeeeeeee",
        "swwswwws",
        "sswswwss",
        "ggGggGgg",
    ],
    "top": ["wwwwwwww", "wwwwwwww", "wwwsswww", "wwwWWwww"],
    "bottom": ["ssssssss", "ssssssss", "ssssssss", "ssssssss"],
}
BODY["left"] = mirror(BODY["right"])

JACKET = {
    "front": [
        "........",
        "y.......",
        "y.......",
        ".y......",
        ".y......",
        "..y.....",
        "........",
        "........",
        "........",
        "........",
        "........",
        "........",
    ],
    "right": ["....", "...y", "....", "....", "....", "....", "....", "....", "....", "....", "....", "...."],
    "left": ["...."] * 12,
    "back": ["........"] * 12,
    "top": ["y.......", "y.......", "y.......", "y......."],
    "bottom": ["........"] * 4,
}


def arm_rows(width: int, outer_low: bool) -> dict[str, list[str]]:
    """Sleeve with gold cuff trim, blue cuff and white glove. outer_low: s = 0 of the front face is the outer side."""
    front = []
    for t in range(12):
        if t == 9:
            front.append("g" * width)
        elif t == 10:
            front.append("B" * width)
        elif t == 11:
            front.append("o" * width)
        else:
            row = ["w"] * width
            inner = width - 1 if outer_low else 0
            if t >= 3:
                row[inner] = "s"
            front.append("".join(row))

    outer = ["wwww", "wwww", "wwww", "wwww", "wwww", "wwww", "wwww", "wwww", "wwww", "gggg", "BbBB", "oooO"]
    inner_face = ["ssss", "ssss", "ssss", "ssss", "ssss", "ssss", "ssss", "ssss", "ssss", "GgGg", "bbbb", "OOOO"]
    back = []
    for t in range(12):
        if t == 9:
            back.append("G" * width)
        elif t == 10:
            back.append("b" * width)
        elif t == 11:
            back.append("O" * width)
        else:
            back.append("s" * width)

    top = ["w" * width] * 4
    bottom = ["O" * width] * 4
    if outer_low:
        return {"front": front, "right": outer, "left": inner_face, "back": back, "top": top, "bottom": bottom}

    return {"front": front, "right": inner_face, "left": mirror(outer), "back": back, "top": top, "bottom": bottom}


def leg_rows(outer_right: bool) -> dict[str, list[str]]:
    trousers_front = ["wwww", "wwww", "wsww", "wsww", "wsww", "wsww"]
    trousers_outer = ["wBww", "wBww", "wBww", "wBww", "wBww", "wBww"]
    trousers_inner = ["ssss"] * 6
    trousers_back = ["ssss"] * 6
    boot_front = ["gggg", "xXxx", "xXxx", "xXxx", "xxxx", "zzzz"]
    boot_side = ["gggg", "xxxx", "xxxx", "xxxx", "xxxx", "zzzz"]
    boot_back = ["GGGG", "xxxx", "xxxx", "xxxx", "xxxx", "zzzz"]
    outer = trousers_outer + boot_side
    inner = trousers_inner + boot_side
    rows = {
        "front": trousers_front + boot_front,
        "back": trousers_back + boot_back,
        "top": ["wwww"] * 4,
        "bottom": ["zzzz"] * 4,
    }
    if outer_right:
        rows["right"] = outer
        rows["left"] = inner
    else:
        rows["right"] = inner
        rows["left"] = mirror(outer)

    return rows


PANTS = {
    "front": ["...."] * 6 + ["gggg", "XXXX"] + ["...."] * 4,
    "back": ["...."] * 6 + ["GGGG", "XXXX"] + ["...."] * 4,
    "right": ["...."] * 6 + ["gggg", "XXXX"] + ["...."] * 4,
    "left": ["...."] * 6 + ["gggg", "XXXX"] + ["...."] * 4,
    "top": ["...."] * 4,
    "bottom": ["...."] * 4,
}


def rows_painter(faces: dict[str, list[str]], legend: dict[str, Optional[Color]]) -> Painter:
    maps = {face: char_map(rows, legend) for face, rows in faces.items()}

    def paint(face: str, s: int, t: int, cols: int, rows: int) -> Optional[Color]:
        return maps[face](s, t)

    return paint


def make_skin(slim: bool) -> Image.Image:
    canvas = Canvas(64, 64)
    arm = 3 if slim else 4
    paint_box(canvas, 0, 0, 8, 8, 8, rows_painter(HEAD, HAIR_LEGEND))
    paint_box(canvas, 32, 0, 8, 8, 8, rows_painter(HAT, HAIR_LEGEND))
    paint_box(canvas, 16, 16, 8, 12, 4, rows_painter(BODY, UNIFORM_LEGEND))
    paint_box(canvas, 16, 32, 8, 12, 4, rows_painter(JACKET, UNIFORM_LEGEND))
    paint_box(canvas, 40, 16, arm, 12, 4, rows_painter(arm_rows(arm, outer_low=True), UNIFORM_LEGEND))
    paint_box(canvas, 32, 48, arm, 12, 4, rows_painter(arm_rows(arm, outer_low=False), UNIFORM_LEGEND))
    paint_box(canvas, 0, 16, 4, 12, 4, rows_painter(leg_rows(outer_right=True), UNIFORM_LEGEND))
    paint_box(canvas, 16, 48, 4, 12, 4, rows_painter(leg_rows(outer_right=False), UNIFORM_LEGEND))
    paint_box(canvas, 0, 32, 4, 12, 4, rows_painter(PANTS, UNIFORM_LEGEND))
    paint_box(canvas, 0, 48, 4, 12, 4, rows_painter(PANTS, UNIFORM_LEGEND))
    return canvas.image()


# ------------------------------------------------------------------------------------------------ outfit


def parse_outfit_boxes() -> list[tuple[str, int, int, float, float, float]]:
    """Reads (name, u, v, width, height, depth) for every outfit cube, using the wide-arm variant sizes."""
    source = OUTFIT_MODEL.read_text()
    variables = {name: float(wide) for name, _slim, wide in
                 re.findall(r"float (\w+) = slim \? ([\d.]+)F : ([\d.]+)F;", source)}

    def number(token: str) -> float:
        token = token.strip()
        ternary = re.fullmatch(r"slim \? (-?[\d.]+)F : (-?[\d.]+)F", token)
        if ternary:
            return float(ternary.group(2))
        if token in variables:
            return variables[token]
        return float(token.rstrip("F"))

    boxes = []
    pattern = re.compile(r'addOrReplaceChild\("(\w+)",\s*CubeListBuilder\.create\(\)\.texOffs\((\d+),\s*(\d+)\)\.addBox\(([^)]*)\)')
    for match in pattern.finditer(source):
        name, u, v, args = match.group(1), int(match.group(2)), int(match.group(3)), match.group(4).split(",")
        if len(args) != 6:
            raise ValueError(f"Unexpected addBox arguments for {name}: {args}")
        w, h, d = (number(token) for token in args[3:6])
        boxes.append((name, u, v, w, h, d))

    if not boxes:
        raise ValueError("No outfit boxes found in " + str(OUTFIT_MODEL))
    return boxes


def hair_painter(face: str, s: int, t: int, cols: int, rows: int) -> Color:
    shade = t / max(1, rows - 1)
    if face == "top":
        return P["hair_lt"] if s % 2 == 0 else P["hair"]
    if face == "bottom":
        return P["hair_dk"]
    if shade > 0.8:
        return P["hair_dk"] if s % 2 == 0 else P["hair_sh"]
    if shade > 0.5:
        return P["hair_sh"] if (s + t) % 3 == 0 else P["hair"]
    if t == 0 and s % 2 == 1:
        return P["hair_hi"]
    return P["hair_lt"] if (s * 3 + t) % 5 == 0 else P["hair"]


def collar_painter(face: str, s: int, t: int, cols: int, rows: int) -> Color:
    if face == "top":
        return P["gold"]
    if face == "bottom":
        return P["blue_dk"]
    if t == 0:
        return P["gold_lt"] if s % 3 == 0 else P["gold"]
    return P["blue"] if t < rows - 1 else P["blue_dk"]


def coat_painter(lower: bool) -> Painter:
    def paint(face: str, s: int, t: int, cols: int, rows: int) -> Color:
        if face == "front":  # faces the body: lining
            if lower and t >= rows - 1:
                return P["gold_dk"]
            return P["blue"] if (s + t) % 7 else P["blue_lt"]
        if face == "back":  # outside
            if lower:
                if t >= rows - 1:
                    return P["gold"] if s % 2 == 0 else P["gold_lt"]
                if t == rows - 2:
                    return P["blue"]
                if t == rows - 3:
                    return P["gold_dk"]
            center = abs(s - (cols - 1) / 2.0) < 0.6
            if center:
                return P["white_sh"]
            if s == 0 or s == cols - 1:
                return P["gold"]
            if not lower and t == 0:
                return P["white_hi"]
            return P["white"] if (s + 2 * t) % 9 else P["white_sh"]
        if face == "bottom":
            return P["gold"] if lower else P["white_sh"]
        if face == "top":
            return P["white_hi"]
        return P["gold"]

    return paint


def flap_painter(face: str, s: int, t: int, cols: int, rows: int) -> Color:
    if face == "front":  # outside, facing forward
        if t >= rows - 1:
            return P["gold"]
        if t == rows - 2:
            return P["blue"]
        if s == 0 or s == cols - 1:
            return P["gold"]
        return P["white"] if t % 5 else P["white_sh"]
    if face == "back":
        return P["blue"] if t < rows - 1 else P["gold_dk"]
    if face in ("top", "bottom"):
        return P["gold"]
    return P["gold_dk"] if t % 2 else P["gold"]


def belt_painter(face: str, s: int, t: int, cols: int, rows: int) -> Color:
    if face == "front":
        middle = (cols - 1) / 2.0
        if abs(s - middle) <= 1.0:
            return P["gold_lt"] if t == 0 else P["gold"]
        return P["leather_lt"] if t == 0 else P["leather"]
    if face in ("right", "left"):
        return P["gold"] if s == cols // 2 and t == 0 else P["leather"]
    if face == "back":
        return P["leather"] if s % 4 else P["leather_lt"]
    return P["leather"]


def scabbard_painter(face: str, s: int, t: int, cols: int, rows: int) -> Color:
    if face == "top":
        return P["boot_dk"]
    if face == "bottom":
        return P["gold"]
    if t <= 1 or t >= rows - 2:
        return P["gold_lt"] if t in (0, rows - 1) else P["gold"]
    if t == rows // 2:
        return P["gold"]
    edge = s == 0 or s == cols - 1
    return P["blue_dk"] if edge else P["blue"]


def grip_painter(face: str, s: int, t: int, cols: int, rows: int) -> Color:
    if face in ("top", "bottom"):
        return P["gold"]
    return P["blue"] if (s + t) % 2 == 0 else P["white_sh"]


def guard_painter(face: str, s: int, t: int, cols: int, rows: int) -> Color:
    if face in ("front", "back") and abs(s - (cols - 1) / 2.0) < 0.6:
        return P["gem"]
    return P["gold_lt"] if t == 0 else P["gold"]


def pommel_painter(face: str, s: int, t: int, cols: int, rows: int) -> Color:
    if face in ("front", "back", "right", "left") and t == rows // 2 and 0 < s < cols - 1:
        return P["gem_lt"]
    return P["gold"] if (s + t) % 2 else P["gold_lt"]


def pauldron_painter(face: str, s: int, t: int, cols: int, rows: int) -> Color:
    if face == "top":
        if s == 0 or s == cols - 1 or t == 0 or t == rows - 1:
            return P["gold"]
        return P["white_hi"] if (s + t) % 4 == 0 else P["white"]
    if face == "bottom":
        return P["white_sh"]
    if t == 0:
        return P["gold_lt"]
    if t == rows - 1:
        return P["gold"] if s % 2 == 0 else P["gold_dk"]
    return P["white"] if (s + t) % 5 else P["white_sh"]


def cuff_painter(face: str, s: int, t: int, cols: int, rows: int) -> Color:
    if face in ("top", "bottom"):
        return P["gold_dk"]
    if t == 0 or t == rows - 1:
        return P["gold"] if s % 3 else P["gold_lt"]
    return P["blue"] if t % 2 else P["blue_lt"]


def outfit_painter(name: str) -> Painter:
    if name.startswith("hair"):
        return hair_painter
    if name.startswith("collar"):
        return collar_painter
    if name == "coat_upper":
        return coat_painter(lower=False)
    if name == "coat_lower":
        return coat_painter(lower=True)
    if name.startswith("flap"):
        return flap_painter
    if name == "belt":
        return belt_painter
    if name == "scabbard":
        return scabbard_painter
    if name == "hilt_grip":
        return grip_painter
    if name == "hilt_guard":
        return guard_painter
    if name == "hilt_pommel":
        return pommel_painter
    if name.startswith("pauldron"):
        return pauldron_painter
    if name.startswith("cuff"):
        return cuff_painter
    raise ValueError("No painter for outfit part " + name)


def make_outfit() -> Image.Image:
    canvas = Canvas(128, 64)
    for name, u, v, w, h, d in parse_outfit_boxes():
        paint_box(canvas, u, v, w, h, d, outfit_painter(name))
    return canvas.image()


# ------------------------------------------------------------------------------------------------ vector helpers


class Field:
    """A supersampled square drawing field with coordinates in [-1, 1] (y up)."""

    def __init__(self, size: int, ss: int = 4, height: Optional[int] = None) -> None:
        self.size = size
        self.height = height or size
        self.ss = ss
        xs = (np.arange(size * ss) + 0.5) / (size * ss) * 2.0 - 1.0
        ys = 1.0 - (np.arange(self.height * ss) + 0.5) / (self.height * ss) * 2.0
        self.x, self.y = np.meshgrid(xs, ys)
        self.aa = 2.0 / (size * ss)

    def down(self, value: np.ndarray) -> np.ndarray:
        ss = self.ss
        h, w = value.shape[0] // ss, value.shape[1] // ss
        return value.reshape(h, ss, w, ss).mean(axis=(1, 3))

    def radius(self) -> np.ndarray:
        return np.hypot(self.x, self.y)

    def angle(self) -> np.ndarray:
        return np.arctan2(self.y, self.x)


def stroke(d: np.ndarray, width: float, aa: float) -> np.ndarray:
    return np.clip(0.5 - (np.abs(d) - width / 2.0) / aa, 0.0, 1.0)


def fill(d: np.ndarray, aa: float) -> np.ndarray:
    return np.clip(0.5 - d / aa, 0.0, 1.0)


def sd_segment(x: np.ndarray, y: np.ndarray, a: tuple[float, float], b: tuple[float, float]) -> np.ndarray:
    pax, pay = x - a[0], y - a[1]
    bax, bay = b[0] - a[0], b[1] - a[1]
    length2 = bax * bax + bay * bay
    h = np.clip((pax * bax + pay * bay) / length2, 0.0, 1.0) if length2 > 0 else np.zeros_like(x)
    return np.hypot(pax - bax * h, pay - bay * h)


def sd_polyline(x: np.ndarray, y: np.ndarray, points: list[tuple[float, float]], closed: bool = False) -> np.ndarray:
    distance = np.full(x.shape, 1e9)
    count = len(points)
    edges = count if closed else count - 1
    for i in range(edges):
        distance = np.minimum(distance, sd_segment(x, y, points[i], points[(i + 1) % count]))
    return distance


def inside_polygon(x: np.ndarray, y: np.ndarray, points: list[tuple[float, float]]) -> np.ndarray:
    inside = np.zeros(x.shape, dtype=bool)
    count = len(points)
    for i in range(count):
        x0, y0 = points[i]
        x1, y1 = points[(i + 1) % count]
        crosses = ((y0 > y) != (y1 > y)) & (x < (x1 - x0) * (y - y0) / (y1 - y0 + 1e-12) + x0)
        inside ^= crosses
    return inside


def sd_polygon(x: np.ndarray, y: np.ndarray, points: list[tuple[float, float]]) -> np.ndarray:
    distance = sd_polyline(x, y, points, closed=True)
    return np.where(inside_polygon(x, y, points), -distance, distance)


def sd_circle(x: np.ndarray, y: np.ndarray, r: float, cx: float = 0.0, cy: float = 0.0) -> np.ndarray:
    return np.hypot(x - cx, y - cy) - r


def arc_points(cx: float, cy: float, r: float, a0: float, a1: float, steps: int = 48) -> list[tuple[float, float]]:
    return [(cx + r * math.cos(a0 + (a1 - a0) * i / steps), cy + r * math.sin(a0 + (a1 - a0) * i / steps)) for i in range(steps + 1)]


def teardrop(cx: float, cy: float, width: float, height: float, lean: float = 0.0, steps: int = 72) -> list[tuple[float, float]]:
    """A flame/drop outline pointing up: round bottom, sharp tip. lean bends the tip sideways."""
    points = []
    for i in range(steps):
        phi = 2.0 * math.pi * i / steps
        px = math.sin(phi) * math.sin(phi / 2.0) ** 1.4 * width
        py = math.cos(phi) * height
        tip = max(0.0, py / height)
        points.append((cx + px + lean * tip * tip * height, cy + py))
    return points


def blur(value: np.ndarray, radius: int, wrap: bool = False) -> np.ndarray:
    """Approximately gaussian blur (three box passes per axis)."""
    if radius <= 0:
        return value
    result = value.astype(np.float64)
    for axis in (0, 1):
        for _ in range(3):
            if wrap:
                padded = np.concatenate([np.take(result, range(-radius, 0), axis=axis), result,
                                         np.take(result, range(0, radius), axis=axis)], axis=axis)
            else:
                pad = [(0, 0), (0, 0)]
                pad[axis] = (radius, radius)
                padded = np.pad(result, pad, mode="edge")
            cumulative = np.cumsum(padded, axis=axis)
            zero_shape = list(cumulative.shape)
            zero_shape[axis] = 1
            cumulative = np.concatenate([np.zeros(zero_shape), cumulative], axis=axis)
            size = 2 * radius + 1
            n = result.shape[axis]
            upper = np.take(cumulative, range(size, size + n), axis=axis)
            lower = np.take(cumulative, range(0, n), axis=axis)
            result = (upper - lower) / size
    return result


def value_noise(width: int, height: int, cells: int, seed: int, wrap: bool = True) -> np.ndarray:
    """Smooth tileable value noise in [0, 1] with `cells` lattice cells across the image."""
    rng = np.random.default_rng(seed)
    cells_y = max(1, round(cells * height / width))
    lattice = rng.random((cells_y + 1, cells + 1))
    if wrap:
        lattice[-1, :] = lattice[0, :]
        lattice[:, -1] = lattice[:, 0]
    gx = np.linspace(0, cells, width, endpoint=False) + 0.5 * cells / width
    gy = np.linspace(0, cells_y, height, endpoint=False) + 0.5 * cells_y / height
    x0 = np.floor(gx).astype(int)
    y0 = np.floor(gy).astype(int)
    fx = gx - x0
    fy = gy - y0
    fx = fx * fx * (3 - 2 * fx)
    fy = fy * fy * (3 - 2 * fy)
    a = lattice[np.ix_(y0, x0)]
    b = lattice[np.ix_(y0, x0 + 1)]
    c = lattice[np.ix_(y0 + 1, x0)]
    d = lattice[np.ix_(y0 + 1, x0 + 1)]
    top = a + (b - a) * fx[None, :]
    bottom = c + (d - c) * fx[None, :]
    return top + (bottom - top) * fy[:, None]


def fbm(width: int, height: int, seed: int, octaves: int = 4, base: int = 4) -> np.ndarray:
    total = np.zeros((height, width))
    amplitude = 1.0
    norm = 0.0
    for octave in range(octaves):
        total += value_noise(width, height, base * 2 ** octave, seed + octave * 101) * amplitude
        norm += amplitude
        amplitude *= 0.5
    return total / norm


def smoothstep(e0: float, e1: float, x: np.ndarray) -> np.ndarray:
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


# ------------------------------------------------------------------------------------------------ effect textures


def tex_glow() -> Image.Image:
    f = Field(64, 2)
    r = f.radius()
    alpha = np.exp(-(r / 0.36) ** 2) * 0.85 + np.exp(-(r / 0.14) ** 2) * 0.15
    alpha *= np.clip(1.0 - r, 0.0, 1.0) ** 0.5
    return white_image(f.down(alpha / alpha.max()))


def tex_spark() -> Image.Image:
    f = Field(64, 4)
    x, y, r = f.x, f.y, f.radius()
    ray = lambda u, v, length, width: np.exp(-(v / width) ** 2) * np.clip(1.0 - np.abs(u) / length, 0.0, 1.0) ** 2.2
    rays = ray(x, y, 1.0, 0.035) + ray(y, x, 1.0, 0.035)
    d1 = (x + y) / math.sqrt(2.0)
    d2 = (x - y) / math.sqrt(2.0)
    rays += 0.55 * (ray(d1, d2, 0.55, 0.03) + ray(d2, d1, 0.55, 0.03))
    core = np.exp(-(r / 0.12) ** 2) + 0.35 * np.exp(-(r / 0.35) ** 2)
    alpha = np.clip(rays + core, 0.0, 1.0) * np.clip(1.0 - r, 0.0, 1.0)
    return white_image(f.down(alpha))


def tex_ring() -> Image.Image:
    f = Field(64, 4)
    r = f.radius()
    theta = f.angle()
    line = np.exp(-((r - 0.78) / 0.035) ** 2)
    halo = 0.45 * np.exp(-((r - 0.78) / 0.12) ** 2)
    inner = 0.12 * np.exp(-((r - 0.55) / 0.04) ** 2)
    beads = 0.75 + 0.25 * np.cos(theta * 6.0)
    alpha = np.clip((line + halo) * beads + inner, 0.0, 1.0) * np.clip((1.0 - r) / 0.08, 0.0, 1.0)
    return white_image(f.down(alpha))


def tex_shockwave() -> Image.Image:
    """Ring strip: u wraps around the ring (tileable), v runs from the outer edge (0) to the inner edge (1)."""
    width, height = 64, 32
    u = (np.arange(width) + 0.5) / width
    v = (np.arange(height) + 0.5) / height
    uu, vv = np.meshgrid(u, v)
    front = np.exp(-((vv - 0.16) / 0.06) ** 2)
    wake = 0.55 * np.exp(-np.clip(vv - 0.16, 0.0, None) / 0.3) * (vv > 0.16)
    ripple = 0.85 + 0.15 * np.cos(2 * math.pi * (3 * uu)) * np.cos(2 * math.pi * (5 * uu + 0.3))
    alpha = (front + wake) * ripple * smoothstep(0.0, 0.08, vv) * smoothstep(1.0, 0.75, vv)
    return white_image(np.clip(alpha, 0.0, 1.0))


def tex_trail() -> Image.Image:
    """Blade trail: v = 0 is the cutting edge (brightest), fading towards the hilt at v = 1. Uniform along u."""
    width, height = 16, 64
    v = (np.arange(height) + 0.5) / height
    edge = np.exp(-((v - 0.06) / 0.028) ** 2)
    body = 0.62 * np.exp(-np.clip(v - 0.06, 0.0, None) / 0.32)
    streaks = 0.82 + 0.18 * np.cos(2 * math.pi * v * 11.0) * smoothstep(0.1, 0.3, v)
    profile = np.clip((edge + body) * streaks * smoothstep(0.0, 0.035, v) * smoothstep(1.0, 0.8, v), 0.0, 1.0)
    alpha = np.repeat(profile[:, None], width, axis=1)
    return white_image(alpha)


def tex_beam() -> Image.Image:
    """Glow strip across u (bright centre line), uniform along v."""
    width, height = 32, 16
    u = (np.arange(width) + 0.5) / width
    core = np.exp(-((u - 0.5) / 0.07) ** 2)
    halo = 0.5 * np.exp(-((u - 0.5) / 0.22) ** 2)
    profile = np.clip((core + halo) * smoothstep(0.0, 0.12, u) * smoothstep(1.0, 0.88, u), 0.0, 1.0)
    alpha = np.repeat(profile[None, :], height, axis=0)
    return white_image(alpha)


def tex_crescent() -> Image.Image:
    """Crescent band: u along the arc (tapered ends), v across the band (bright centre)."""
    width, height = 64, 32
    u = (np.arange(width) + 0.5) / width
    v = (np.arange(height) + 0.5) / height
    uu, vv = np.meshgrid(u, v)
    core = np.exp(-((vv - 0.5) / 0.09) ** 2)
    halo = 0.42 * np.exp(-((vv - 0.5) / 0.26) ** 2)
    streak = 0.85 + 0.15 * np.cos(2 * math.pi * (uu * 7.0 + vv * 0.6))
    ends = np.sin(np.pi * uu) ** 0.5
    alpha = (core + halo) * streak * ends * smoothstep(0.0, 0.1, vv) * smoothstep(1.0, 0.9, vv)
    return white_image(np.clip(alpha, 0.0, 1.0))


def tex_vortex() -> Image.Image:
    """Swirling band texture; tileable along u, fading out at the bottom and top edges of v."""
    size = 64
    u = (np.arange(size) + 0.5) / size
    v = (np.arange(size) + 0.5) / size
    uu, vv = np.meshgrid(u, v)
    streak_a = (0.5 + 0.5 * np.cos(2 * math.pi * (3 * uu + 1.6 * vv))) ** 4
    streak_b = (0.5 + 0.5 * np.cos(2 * math.pi * (5 * uu + 2.4 * vv + 0.35))) ** 6
    noise = value_noise(size, size, 8, 17)
    alpha = (0.7 * streak_a + 0.5 * streak_b) * (0.6 + 0.6 * noise)
    alpha *= np.sin(np.pi * vv) ** 0.8
    return white_image(np.clip(alpha, 0.0, 1.0))


def tex_dome() -> Image.Image:
    """Tileable honeycomb with glowing edges for the Al Clauzeria barrier."""
    size = 64
    nx, ny = 4, 4
    points = []
    for j in range(ny):
        for i in range(nx):
            points.append(((i + 0.5 + 0.5 * (j % 2)) / nx, (j + 0.5) / ny))
    u = (np.arange(size) + 0.5) / size
    uu, vv = np.meshgrid(u, u)
    first = np.full(uu.shape, 9.0)
    second = np.full(uu.shape, 9.0)
    for px, py in points:
        for ox in (-1, 0, 1):
            for oy in (-1, 0, 1):
                d = np.hypot(uu - (px + ox), (vv - (py + oy)) * 0.866)
                second = np.where(d < first, first, np.minimum(second, d))
                first = np.minimum(first, d)
    edge = second - first
    lines = np.exp(-(edge / 0.018) ** 2)
    fill_glow = 0.16 + 0.1 * np.exp(-(first / 0.08) ** 2)
    return white_image(np.clip(lines + fill_glow, 0.0, 1.0))


def tex_smoke() -> Image.Image:
    size = 64
    noise = fbm(size, size, 31, octaves=4, base=3)
    f = Field(size, 1)
    r = f.radius()
    shape = smoothstep(0.95, 0.35, r + (noise - 0.5) * 0.5)
    alpha = np.clip(shape * (0.55 + 0.6 * noise), 0.0, 1.0)
    return white_image(alpha)


def rune_strokes(rng: np.random.Generator) -> list[tuple[tuple[float, float], tuple[float, float]]]:
    """A random rune made of 2-4 strokes between points of a 3x3 grid (local coordinates in [-0.5, 0.5])."""
    grid = [(gx * 0.5 - 0.5, gy * 0.5 - 0.5) for gy in range(3) for gx in range(3)]
    strokes = [((0.0, -0.5), (0.0, 0.5))] if rng.random() < 0.6 else []
    while len(strokes) < rng.integers(3, 5):
        a, b = rng.choice(9, 2, replace=False)
        p, q = grid[a], grid[b]
        if math.dist(p, q) > 0.45:
            strokes.append((p, q))
    return strokes


def draw_runes(f: Field, count: int, radius: float, size: float, width: float, seed: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
    distance = np.full(f.x.shape, 1e9)
    for k in range(count):
        theta = 2 * math.pi * k / count
        cx, cy = radius * math.cos(theta), radius * math.sin(theta)
        tx, ty = -math.sin(theta), math.cos(theta)
        rx, ry = math.cos(theta), math.sin(theta)
        for p, q in rune_strokes(rng):
            a = (cx + (p[0] * tx + p[1] * rx) * size, cy + (p[0] * ty + p[1] * ry) * size)
            b = (cx + (q[0] * tx + q[1] * rx) * size, cy + (q[0] * ty + q[1] * ry) * size)
            distance = np.minimum(distance, sd_segment(f.x, f.y, a, b))
    return stroke(distance, width, f.aa)


def with_halo(f: Field, lines: np.ndarray, radius: int, strength: float) -> np.ndarray:
    small = f.down(lines)
    return np.clip(small + strength * blur(small, radius), 0.0, 1.0)


def tex_circle_outer() -> Image.Image:
    f = Field(256, 4)
    r, theta = f.radius(), f.angle()
    lines = stroke(r - 0.972, 0.018, f.aa)
    lines = np.maximum(lines, stroke(r - 0.935, 0.011, f.aa))
    lines = np.maximum(lines, stroke(r - 0.835, 0.014, f.aa))
    ticks_minor = (np.abs(((theta / (2 * math.pi) * 72) % 1.0) - 0.5) > 0.47) & (r > 0.865) & (r < 0.905)
    ticks_major = (np.abs(((theta / (2 * math.pi) * 12) % 1.0) - 0.5) > 0.485) & (r > 0.85) & (r < 0.925)
    lines = np.maximum(lines, ticks_minor.astype(float) * 0.85)
    lines = np.maximum(lines, ticks_major.astype(float))
    for k in range(6):
        a = 2 * math.pi * k / 6 + math.pi / 6
        lines = np.maximum(lines, fill(sd_circle(f.x, f.y, 0.022, 0.957 * math.cos(a), 0.957 * math.sin(a)), f.aa))
    return white_image(with_halo(f, lines, 3, 0.55))


def tex_circle_inner() -> Image.Image:
    f = Field(256, 4)
    r = f.radius()
    star = 0.92
    tri_a = [(star * math.cos(a), star * math.sin(a)) for a in (0.0, 2 * math.pi / 3, 4 * math.pi / 3)]
    tri_b = [(star * math.cos(a), star * math.sin(a)) for a in (math.pi / 3, math.pi, 5 * math.pi / 3)]
    distance = np.minimum(sd_polyline(f.x, f.y, tri_a, closed=True), sd_polyline(f.x, f.y, tri_b, closed=True))
    lines = stroke(distance, 0.018, f.aa)
    lines = np.maximum(lines, stroke(r - star, 0.016, f.aa))
    hexagon = [(0.531 * math.cos(a), 0.557 * math.sin(a)) for a in (math.pi / 6 + k * math.pi / 3 for k in range(6))]
    lines = np.maximum(lines, stroke(sd_polyline(f.x, f.y, hexagon, closed=True), 0.013, f.aa))
    lines = np.maximum(lines, stroke(r - 0.44, 0.011, f.aa))
    lines = np.maximum(lines, stroke(r - 0.2, 0.013, f.aa))
    for k in range(6):
        a = k * math.pi / 3
        lines = np.maximum(lines, stroke(sd_circle(f.x, f.y, 0.055, star * math.cos(a), star * math.sin(a)), 0.015, f.aa))
        lines = np.maximum(lines, stroke(sd_segment(f.x, f.y, (0.21 * math.cos(a), 0.21 * math.sin(a)),
                                                    (0.43 * math.cos(a), 0.43 * math.sin(a))), 0.011, f.aa))
    lines = np.maximum(lines, fill(sd_circle(f.x, f.y, 0.05), f.aa))
    return white_image(with_halo(f, lines, 3, 0.6))


def tex_circle_glyphs() -> Image.Image:
    f = Field(256, 4)
    r = f.radius()
    lines = stroke(r - 0.98, 0.014, f.aa)
    lines = np.maximum(lines, stroke(r - 0.77, 0.014, f.aa))
    lines = np.maximum(lines, draw_runes(f, 30, 0.877, 0.13, 0.02, 7))
    return white_image(with_halo(f, lines, 2, 0.5))


def tex_rainbow_swirl() -> Image.Image:
    """Tileable rainbow streaks for the Al Cranvel aura (energy swirl render type: additive, dark = invisible)."""
    size = 64
    u = (np.arange(size) + 0.5) / size
    uu, vv = np.meshgrid(u, u)
    hue = (uu + vv * 2.0) % 1.0
    band = (0.5 + 0.5 * np.cos(2 * math.pi * (2 * uu - 3 * vv))) ** 3
    sparkle = (0.5 + 0.5 * np.cos(2 * math.pi * (5 * uu + 4 * vv))) ** 8
    brightness = np.clip(0.15 + 0.85 * band + 0.6 * sparkle, 0.0, 1.0) * (0.75 + 0.5 * value_noise(size, size, 4, 5))
    rgb = np.zeros((size, size, 3))
    for j in range(size):
        for i in range(size):
            rgb[j, i] = colorsys.hsv_to_rgb(hue[j, i], 0.7, 1.0)
    rgb *= np.clip(brightness, 0.0, 1.0)[..., None]
    return rgba_image(rgb, np.ones((size, size)))


def tex_spirit_core() -> Image.Image:
    f = Field(32, 8)
    x, y, r = f.x, f.y, f.radius()
    core = np.exp(-(r / 0.3) ** 2)
    cross = np.exp(-(y / 0.06) ** 2) * np.clip(1 - np.abs(x), 0, 1) ** 2 + np.exp(-(x / 0.06) ** 2) * np.clip(1 - np.abs(y), 0, 1) ** 2
    ring = 0.35 * np.exp(-((r - 0.62) / 0.06) ** 2)
    alpha = np.clip(core + 0.6 * cross + ring, 0.0, 1.0) * np.clip((1.0 - r) / 0.1, 0.0, 1.0)
    return white_image(f.down(alpha))


# Spirit glyphs, drawn as signed-distance shapes in [-1, 1].


def glyph_ia(f: Field) -> np.ndarray:
    x, y = f.x, f.y
    main = sd_polygon(x, y, teardrop(0.0, -0.08, 0.36, 0.62, lean=0.12))
    left = sd_polygon(x, y, teardrop(-0.34, -0.28, 0.2, 0.36, lean=-0.2))
    right = sd_polygon(x, y, teardrop(0.34, -0.28, 0.2, 0.36, lean=0.22))
    outer = np.minimum(main, np.minimum(left, right))
    inner = sd_polygon(x, y, teardrop(0.02, -0.26, 0.17, 0.3, lean=0.05))
    return np.maximum(stroke(outer, 0.11, f.aa), fill(inner, f.aa))


def glyph_kua(f: Field) -> np.ndarray:
    x, y = f.x, f.y
    drop = sd_polygon(x, y, teardrop(0.0, -0.12, 0.42, 0.66))
    shape = stroke(drop, 0.11, f.aa)
    for offset in (-0.2, 0.04):
        wave = [(t, offset + 0.07 * math.sin(t * 9.0)) for t in np.linspace(-0.26, 0.26, 40)]
        shape = np.maximum(shape, stroke(sd_polyline(x, y, wave), 0.08, f.aa) * (drop < -0.05))
    return shape


def glyph_aro(f: Field) -> np.ndarray:
    x, y = f.x, f.y
    spiral = []
    for i in range(160):
        t = i / 159.0
        angle = t * 2.6 * math.pi
        radius = 0.08 + 0.42 * t
        spiral.append((radius * math.cos(angle) - 0.05, radius * math.sin(angle) + 0.08))
    shape = stroke(sd_polyline(x, y, spiral), 0.1, f.aa)
    gust_a = [(t, -0.62 + 0.06 * math.sin(t * 5.0)) for t in np.linspace(-0.7, 0.45, 40)]
    gust_b = [(t, -0.42 + 0.05 * math.sin(t * 6.0 + 1.0)) for t in np.linspace(-0.2, 0.75, 40)]
    shape = np.maximum(shape, stroke(sd_polyline(x, y, gust_a), 0.08, f.aa))
    return np.maximum(shape, stroke(sd_polyline(x, y, gust_b), 0.08, f.aa))


def glyph_iku(f: Field) -> np.ndarray:
    x, y = f.x, f.y
    big = [(-0.62, -0.45), (-0.05, 0.62), (0.52, -0.45)]
    small = [(0.12, -0.45), (0.45, 0.12), (0.78, -0.45)]
    shape = stroke(sd_polyline(x, y, big, closed=False), 0.11, f.aa)
    shape = np.maximum(shape, stroke(sd_polyline(x, y, small, closed=False), 0.1, f.aa))
    shape = np.maximum(shape, stroke(sd_segment(x, y, (-0.78, -0.45), (0.82, -0.45)), 0.11, f.aa))
    crag = [(-0.27, 0.14), (-0.05, 0.3), (0.13, 0.12)]
    shape = np.maximum(shape, stroke(sd_polyline(x, y, crag), 0.08, f.aa))
    return np.maximum(shape, stroke(sd_segment(x, y, (-0.45, -0.68), (0.55, -0.68)), 0.08, f.aa))


def glyph_in(f: Field) -> np.ndarray:
    x, y = f.x, f.y
    shape = fill(sd_circle(x, y, 0.26), f.aa)
    shape = np.maximum(shape, stroke(sd_circle(x, y, 0.38), 0.06, f.aa))
    for k in range(8):
        a = k * math.pi / 4 + math.pi / 8
        length = 0.78 if k % 2 == 0 else 0.64
        shape = np.maximum(shape, stroke(sd_segment(x, y, (0.5 * math.cos(a), 0.5 * math.sin(a)),
                                                     (length * math.cos(a), length * math.sin(a))), 0.1, f.aa))
    return shape


def glyph_nes(f: Field) -> np.ndarray:
    x, y = f.x, f.y
    crescent = np.maximum(sd_circle(x, y, 0.6, -0.06, 0.0), -sd_circle(x, y, 0.5, 0.2, 0.14))
    shape = fill(crescent, f.aa)
    for cx, cy, s in ((0.42, -0.3, 0.13), (0.55, 0.38, 0.08)):
        star = []
        for k in range(8):
            radius = s if k % 2 == 0 else s * 0.35
            a = k * math.pi / 4 + math.pi / 2
            star.append((cx + radius * math.cos(a), cy + radius * math.sin(a)))
        shape = np.maximum(shape, fill(sd_polygon(x, y, star), f.aa))
    return shape


GLYPHS = {"ia": glyph_ia, "kua": glyph_kua, "aro": glyph_aro, "iku": glyph_iku, "in": glyph_in, "nes": glyph_nes}


def tex_spirit_glyph(name: str) -> Image.Image:
    f = Field(64, 4)
    r = f.radius()
    # Shrink the symbol a little inside its ring.
    inner = Field(64, 4)
    inner.x, inner.y = f.x / 0.72, f.y / 0.72
    inner.aa = f.aa / 0.72
    shape = GLYPHS[name](inner)
    ring = stroke(r - 0.9, 0.06, f.aa)
    lines = np.maximum(shape, ring)
    return white_image(with_halo(f, lines, 2, 0.45))


# ------------------------------------------------------------------------------------------------ particles


def particle_sparkle(size: int, rays: int, ray_width: float, core: float, seed: int, rotate: float = 0.0) -> Image.Image:
    f = Field(size, 8)
    r, theta = f.radius(), f.angle() + rotate
    spokes = np.abs(np.cos(theta * rays / 2.0)) ** (1.0 / ray_width)
    alpha = spokes * np.clip(1.0 - r, 0.0, 1.0) ** 2.5 + np.exp(-(r / core) ** 2)
    return white_image(f.down(np.clip(alpha, 0.0, 1.0)))


def particle_soft_dot(size: int, sigma: float, cross: float) -> Image.Image:
    f = Field(size, 8)
    x, y, r = f.x, f.y, f.radius()
    alpha = np.exp(-(r / sigma) ** 2)
    if cross > 0:
        alpha += cross * (np.exp(-(y / 0.08) ** 2) * np.clip(1 - np.abs(x), 0, 1) ** 3
                          + np.exp(-(x / 0.08) ** 2) * np.clip(1 - np.abs(y), 0, 1) ** 3)
    return white_image(f.down(np.clip(alpha, 0.0, 1.0)))


def particle_flame(frame: int, frames: int) -> Image.Image:
    """A flame tongue that kindles, flickers upwards and breaks into wisps over the frames."""
    size = 32
    f = Field(size, 4)
    t = frame / (frames - 1)
    noise = fbm(size * 4, size * 4, 900 + frame * 7, octaves=3, base=3)
    height = 0.42 + 0.42 * min(1.0, t * 2.0)
    width = 0.4 * (1.0 - 0.45 * t)
    lean = 0.12 * math.sin(frame * 1.9)
    base = -0.42 + 0.32 * t
    outer = sd_polygon(f.x, f.y, teardrop(0.0, base, width, height, lean=lean)) + (noise - 0.5) * (0.12 + 0.4 * t)
    inner = sd_polygon(f.x, f.y, teardrop(0.0, base - 0.08, width * 0.5, height * 0.55, lean=lean * 0.5)) + (noise - 0.5) * 0.15
    body = smoothstep(0.05, -0.12, outer)
    core = smoothstep(0.02, -0.16, inner)
    alpha = body * (0.45 + 0.55 * core) * (1.0 - 0.6 * t)
    return white_image(f.down(np.clip(alpha, 0.0, 1.0)))


def particle_droplet(index: int) -> Image.Image:
    canvas = Canvas(8, 8)
    shapes = [
        ["...o....", "...o....", "..ooo...", ".oooob..", ".oWoob..", ".ooobb..", "..bbb...", "........"],
        ["........", "...o....", "..ooo...", "..oWob..", "..ooob..", "...bb...", "........", "........"],
        ["........", "........", "...oo...", "..oWob..", "..obbb..", "...bb...", "........", "........"],
    ]
    legend = {"o": (214, 222, 235, 220), "b": (160, 172, 196, 230), "W": (255, 255, 255, 240), ".": None}
    lookup = char_map(shapes[index], legend)
    for y in range(8):
        for x in range(8):
            canvas.put(x, y, lookup(x, y))
    return canvas.image()


def particle_leaf(index: int) -> Image.Image:
    canvas = Canvas(8, 8)
    shapes = [
        ["........", ".....oo.", "...oooo.", "..oovoo.", ".oovoo..", ".ovoo...", "v.......", "........"],
        ["........", "...o....", "..ooo...", ".oovoo..", ".oovoo..", "..ovo...", "...v....", "...v...."],
        ["........", "..oo....", ".ooooo..", ".oovvoo.", "..ooooo.", "....oo..", "......v.", "........"],
        ["....o...", "...ooo..", "..oovo..", "..ovoo..", ".oovo...", ".ooo....", "..v.....", "........"],
    ]
    legend = {"o": (236, 240, 236, 255), "v": (176, 186, 176, 255), ".": None}
    lookup = char_map(shapes[index], legend)
    for y in range(8):
        for x in range(8):
            canvas.put(x, y, lookup(x, y))
    return canvas.image()


def particle_puff(frame: int, frames: int, seed: int, dark: bool) -> Image.Image:
    size = 32
    f = Field(size, 2)
    t = frame / (frames - 1)
    noise = fbm(size * 2, size * 2, seed, octaves=4, base=3)
    r = f.radius()
    radius = 0.45 + 0.45 * t
    wobble = (noise - 0.5) * (0.5 + 0.5 * t)
    shape = smoothstep(radius, radius * 0.45, r + wobble)
    if dark:
        swirl = 0.5 + 0.5 * np.sin(f.angle() * 3.0 + r * 9.0 - t * 4.0)
        alpha = shape * (0.45 + 0.55 * noise) * (0.55 + 0.45 * swirl) * (1.0 - 0.6 * t)
        shade = 0.16 + 0.18 * noise
    else:
        alpha = shape * (0.5 + 0.6 * noise) * (1.0 - 0.5 * t)
        shade = 0.78 + 0.22 * noise
    return white_image(f.down(np.clip(alpha, 0.0, 1.0)), f.down(np.clip(shade, 0.0, 1.0)))


def particle_streak(size: int, width: float, taper: float) -> Image.Image:
    f = Field(size, 8)
    x, y = f.x, f.y
    along = np.clip(1.0 - np.abs(x), 0.0, 1.0) ** taper
    alpha = np.exp(-(y / width) ** 2) * along
    return white_image(f.down(np.clip(alpha * 1.2, 0.0, 1.0)))


def particle_impact(frame: int) -> Image.Image:
    f = Field(32, 4)
    r, theta = f.radius(), f.angle()
    t = frame / 3.0
    spokes = np.abs(np.cos(theta * 4.0)) ** 24 + 0.6 * np.abs(np.cos(theta * 4.0 + math.pi / 4)) ** 30
    reach = 0.95 - 0.35 * t
    rays = spokes * np.clip(1.0 - r / reach, 0.0, 1.0) ** 1.5 * (1.0 - t)
    ring = np.exp(-((r - (0.3 + 0.55 * t)) / (0.05 + 0.04 * t)) ** 2) * (0.4 + 0.6 * t) * (1.0 - 0.5 * t)
    core = np.exp(-(r / (0.32 * (1.0 - 0.6 * t))) ** 2) * (1.0 - t)
    return white_image(f.down(np.clip(rays + ring + core, 0.0, 1.0)))


def particle_ring() -> Image.Image:
    f = Field(32, 8)
    r = f.radius()
    alpha = np.exp(-((r - 0.8) / 0.07) ** 2) + 0.25 * np.exp(-((r - 0.8) / 0.2) ** 2)
    return white_image(f.down(np.clip(alpha, 0.0, 1.0) * np.clip((1.0 - r) / 0.06, 0.0, 1.0)))


def write_particles() -> None:
    sets: dict[str, list[tuple[str, Image.Image]]] = {
        "glow_spark": [
            ("glow_spark_0", particle_soft_dot(16, 0.35, 0.0)),
            ("glow_spark_1", particle_sparkle(16, 4, 0.05, 0.22, 1)),
            ("glow_spark_2", particle_sparkle(16, 6, 0.04, 0.18, 2)),
            ("glow_spark_3", particle_sparkle(16, 4, 0.05, 0.22, 3, rotate=math.pi / 4)),
        ],
        "rainbow_spark": [
            ("rainbow_spark_0", particle_sparkle(16, 4, 0.04, 0.2, 4)),
            ("rainbow_spark_1", particle_sparkle(16, 8, 0.03, 0.16, 5)),
            ("rainbow_spark_2", particle_soft_dot(16, 0.3, 0.6)),
        ],
        "ember": [
            ("ember_0", particle_soft_dot(8, 0.4, 0.0)),
            ("ember_1", particle_soft_dot(8, 0.3, 0.3)),
            ("ember_2", particle_sparkle(8, 4, 0.06, 0.3, 6)),
        ],
        "flame": [(f"flame_{i}", particle_flame(i, 8)) for i in range(8)],
        "droplet": [(f"droplet_{i}", particle_droplet(i)) for i in range(3)],
        "wind_streak": [("wind_streak_0", particle_streak(16, 0.09, 1.2)), ("wind_streak_1", particle_streak(16, 0.06, 2.0))],
        "leaf": [(f"leaf_{i}", particle_leaf(i)) for i in range(4)],
        "dust_puff": [(f"dust_puff_{i}", particle_puff(i, 6, 300, dark=False)) for i in range(6)],
        "light_mote": [("light_mote_0", particle_soft_dot(16, 0.3, 0.45)), ("light_mote_1", particle_soft_dot(16, 0.42, 0.0))],
        "shadow_wisp": [(f"shadow_wisp_{i}", particle_puff(i, 6, 500, dark=True)) for i in range(6)],
        "impact_flash": [(f"impact_flash_{i}", particle_impact(i)) for i in range(4)],
        "ring": [("ring_0", particle_ring())],
        "slash_line": [("slash_line_0", particle_streak(16, 0.05, 1.6))],
    }
    particles_dir = ASSETS / "particles"
    particles_dir.mkdir(parents=True, exist_ok=True)
    for particle, sprites in sets.items():
        for name, image in sprites:
            write_png(f"particle/{name}.png", image)
        definition = {"textures": [f"julius_juukulius:{name}" for name, _ in sprites]}
        path = particles_dir / f"{particle}.json"
        path.write_text(json.dumps(definition, indent=2) + "\n")
        WRITTEN.append(path)


# ------------------------------------------------------------------------------------------------ entity / item


def tex_stone_spike() -> Image.Image:
    width, height = 48, 32
    noise = fbm(width, height, 77, octaves=3, base=6)
    cracks = value_noise(width, height, 12, 78)
    rng = np.random.default_rng(79)
    image = np.zeros((height, width, 4))
    base = np.array([0.42, 0.37, 0.33])
    light = np.array([0.6, 0.55, 0.48])
    for y in range(height):
        for x in range(width):
            n = noise[y, x]
            color = base + (light - base) * n
            if abs(cracks[y, x] - 0.5) < 0.035:
                color = np.array([1.0, 0.78, 0.25]) if rng.random() < 0.7 else np.array([0.95, 0.62, 0.15])
            elif rng.random() < 0.06:
                color = color * 0.82
            image[y, x, :3] = color
            image[y, x, 3] = 1.0
    return Image.fromarray(np.round(image * 255).astype(np.uint8), "RGBA")


def tex_sword() -> Image.Image:
    """32x32 sheet the sword model's faces sample from (see tools/gen_models.py for the UV map)."""
    canvas = Canvas(32, 32)
    steel = [hexc("F4F7FC"), hexc("E3E8F2"), hexc("CDD4E3"), hexc("B7C0D4")]
    # Blade faces (x 0..7): bright edges, a darker fuller down the centre.
    for y in range(32):
        for x in range(8):
            if x in (0, 7):
                color = steel[0]
            elif x in (3, 4):
                color = steel[3] if y % 6 else steel[2]
            elif x in (2, 5):
                color = steel[2]
            else:
                color = steel[1]
            canvas.put(x, y, color)
    # Edge strip (x 8..9)
    canvas.rect(8, 0, 2, 32, hexc("FFFFFF"))
    # Gold (x 10..15, y 0..7) with a highlight band
    for y in range(8):
        for x in range(10, 16):
            canvas.put(x, y, P["gold_lt"] if y < 2 else (P["gold"] if y < 6 else P["gold_dk"]))
    # Engraved gold (x 10..15, y 8..15)
    for y in range(8, 16):
        for x in range(10, 16):
            canvas.put(x, y, P["gold_dk"] if (x + y) % 3 == 0 else P["gold"])
    # Grip wrap (x 16..19, y 0..15)
    for y in range(16):
        for x in range(16, 20):
            canvas.put(x, y, P["white"] if (x + y) % 3 else P["blue"])
    # Gems
    canvas.rect(20, 0, 4, 4, P["gem"])
    canvas.put(20, 0, P["gem_lt"])
    canvas.put(21, 0, P["gem_lt"])
    canvas.put(20, 1, P["gem_lt"])
    canvas.rect(22, 2, 2, 2, P["gem_dk"])
    canvas.rect(20, 4, 4, 4, P["blue"])
    canvas.put(20, 4, P["blue_lt"])
    canvas.put(21, 4, P["blue_lt"])
    canvas.rect(22, 6, 2, 2, P["blue_dk"])
    # Dark inner (x 24..27, y 0..3)
    canvas.rect(24, 0, 4, 4, P["boot_dk"])
    # Ricasso steel (x 24..27, y 4..11)
    for y in range(4, 12):
        for x in range(24, 28):
            canvas.put(x, y, steel[1] if y % 3 else steel[2])
    return canvas.image()


def tex_sword_energy() -> tuple[Image.Image, dict]:
    """Animated translucent rainbow light flowing up the blade (Al Clarista)."""
    frames = 16
    size = 16
    sheet = np.zeros((size * frames, size, 4))
    u = (np.arange(size) + 0.5) / size
    v = (np.arange(size) + 0.5) / size
    uu, vv = np.meshgrid(u, v)
    for frame in range(frames):
        phase = frame / frames
        hue = (1.0 - vv + phase) % 1.0
        across = 0.35 + 0.65 * np.exp(-((uu - 0.5) / 0.3) ** 2)
        flow = 0.75 + 0.25 * np.cos(2 * math.pi * (vv * 2.0 + phase * 2.0))
        sparkle = (0.5 + 0.5 * np.cos(2 * math.pi * (vv * 4.0 + uu * 1.0 + phase * 4.0))) ** 12
        alpha = np.clip(across * flow * 0.62 + sparkle * 0.35, 0.0, 0.95)
        for y in range(size):
            for x in range(size):
                r, g, b = colorsys.hsv_to_rgb(hue[y, x], 0.55, 1.0)
                sheet[frame * size + y, x] = (r, g, b, alpha[y, x])
    image = Image.fromarray(np.round(sheet * 255).astype(np.uint8), "RGBA")
    return image, {"animation": {"frametime": 2, "interpolate": True}}


# ------------------------------------------------------------------------------------------------ GUI


def tinted_shape(shape: np.ndarray, rgb: tuple[float, float, float]) -> np.ndarray:
    out = np.zeros(shape.shape + (4,))
    out[..., 0], out[..., 1], out[..., 2] = rgb
    out[..., 3] = shape
    return out


def composite(dst: np.ndarray, src: np.ndarray, x: int, y: int) -> None:
    h, w = src.shape[:2]
    region = dst[y:y + h, x:x + w]
    a = src[..., 3:4]
    out_a = a + region[..., 3:4] * (1 - a)
    safe = np.where(out_a > 0, out_a, 1)
    region[..., :3] = (src[..., :3] * a + region[..., :3] * region[..., 3:4] * (1 - a)) / safe
    region[..., 3:4] = out_a


def icon_shape(draw: Callable[[Field], np.ndarray], size: int = 16) -> np.ndarray:
    f = Field(size, 8)
    shape = f.down(draw(f))
    return np.clip((shape - 0.15) / 0.6, 0.0, 1.0)


def icon_heavy(f: Field) -> np.ndarray:
    x, y = f.x, f.y
    blade = stroke(sd_segment(x, y, (0.0, 0.85), (0.0, -0.35)), 0.2, f.aa)
    guard = stroke(sd_segment(x, y, (-0.38, 0.45), (0.38, 0.45)), 0.16, f.aa)
    shape = np.maximum(blade, guard)
    for a in (-0.5, -0.15, 0.15, 0.5):
        shape = np.maximum(shape, stroke(sd_segment(x, y, (a * 0.9, -0.6), (a * 1.7, -0.92)), 0.12, f.aa))
    return np.maximum(shape, stroke(sd_segment(x, y, (-0.8, -0.55), (0.8, -0.55)), 0.1, f.aa))


def tex_hud_icons() -> Image.Image:
    sheet = np.zeros((64, 128, 4))
    for index, (name, _color, _accent) in enumerate(SPIRITS):
        glyph = icon_shape(GLYPHS[name])
        composite(sheet, tinted_shape(glyph, (1.0, 1.0, 1.0)), index * 16, 0)
    composite(sheet, tinted_shape(icon_shape(icon_heavy), (1.0, 1.0, 1.0)), 6 * 16, 0)

    # Al Clauzeria: the six spirit lights spiralling into one point.
    f = Field(16, 8)
    clauzeria = np.zeros((16, 16, 4))
    swirl = []
    for i in range(120):
        t = i / 119.0
        angle = t * 2.2 * math.pi
        swirl.append(((0.1 + 0.62 * t) * math.cos(angle), (0.1 + 0.62 * t) * math.sin(angle)))
    composite(clauzeria, tinted_shape(np.clip(f.down(stroke(sd_polyline(f.x, f.y, swirl), 0.12, f.aa)) * 1.3, 0, 1), (1.0, 1.0, 1.0)), 0, 0)
    for k, (_name, color, _accent) in enumerate(SPIRITS):
        a = k * math.pi / 3 + 0.4
        dot = f.down(fill(sd_circle(f.x, f.y, 0.17, 0.74 * math.cos(a), 0.74 * math.sin(a)), f.aa))
        composite(clauzeria, tinted_shape(np.clip(dot * 1.5, 0, 1), rgb_of(color)), 0, 0)
    composite(sheet, clauzeria, 7 * 16, 0)

    # Al Clarista: the six-coloured crescent wave.
    clarista = np.zeros((16, 16, 4))
    for k, (_name, color, _accent) in enumerate(SPIRITS):
        radius = 0.88 - k * 0.11
        arc = arc_points(-0.55, 0.0, radius, -1.05, 1.05)
        band = f.down(stroke(sd_polyline(f.x, f.y, arc), 0.12, f.aa))
        composite(clarista, tinted_shape(np.clip(band * 1.4, 0, 1), rgb_of(color)), 0, 0)
    composite(sheet, clarista, 0, 16)
    return rgba_image(sheet[..., :3], sheet[..., 3])


def tex_spirit_wheel() -> Image.Image:
    size = 160
    f = Field(size, 4)
    r, theta = f.radius(), f.angle()
    rgb = np.zeros(f.x.shape + (3,))
    alpha = np.zeros(f.x.shape)
    disc = fill(r - 0.97, f.aa)
    base_color = np.array([0.07, 0.055, 0.12])
    rgb[:] = base_color
    alpha = disc * (0.78 + 0.12 * (1 - r))
    # Sector washes in each spirit's colour behind its icon (icons at -90 degrees + k * 60 in screen space).
    for k, (_name, color, _accent) in enumerate(SPIRITS):
        screen_angle = math.radians(-90 + 60 * k)
        cx, cy = 0.775 * math.cos(screen_angle), -0.775 * math.sin(screen_angle)
        glow = np.exp(-(np.hypot(f.x - cx, f.y - cy) / 0.26) ** 2)
        rgb += np.array(rgb_of(color))[None, None, :] * glow[..., None] * 0.55
    lines = stroke(r - 0.955, 0.018, f.aa)
    lines = np.maximum(lines, stroke(r - 0.6, 0.012, f.aa))
    lines = np.maximum(lines, stroke(r - 0.36, 0.012, f.aa))
    for k in range(6):
        screen_angle = math.radians(-60 + 60 * k)
        a = (math.cos(screen_angle), -math.sin(screen_angle))
        lines = np.maximum(lines, stroke(sd_segment(f.x, f.y, (0.6 * a[0], 0.6 * a[1]), (0.955 * a[0], 0.955 * a[1])), 0.012, f.aa))
    star = 0.34
    tri_a = [(star * math.cos(a), star * math.sin(a)) for a in (math.pi / 2, math.pi / 2 + 2 * math.pi / 3, math.pi / 2 + 4 * math.pi / 3)]
    tri_b = [(star * math.cos(a), star * math.sin(a)) for a in (-math.pi / 2, -math.pi / 2 + 2 * math.pi / 3, -math.pi / 2 + 4 * math.pi / 3)]
    hexagram = np.minimum(sd_polyline(f.x, f.y, tri_a, closed=True), sd_polyline(f.x, f.y, tri_b, closed=True))
    faint = stroke(hexagram, 0.01, f.aa) * 0.45
    gold = np.array([0.86, 0.72, 0.42])
    rgb = rgb * (1 - lines[..., None]) + gold[None, None, :] * lines[..., None]
    rgb = rgb * (1 - faint[..., None]) + np.array([0.7, 0.62, 0.9])[None, None, :] * faint[..., None]
    alpha = np.maximum(alpha, np.maximum(lines, faint))
    return rgba_image(np.stack([f.down(rgb[..., c]) for c in range(3)], axis=2), f.down(alpha))


def tex_icon() -> Image.Image:
    size = 128
    f = Field(size, 4)
    r = f.radius()
    rgb = np.zeros(f.x.shape + (3,))
    inner = np.array([0.32, 0.2, 0.55])
    outer = np.array([0.08, 0.07, 0.2])
    blend = np.clip(r, 0, 1)[..., None]
    rgb[:] = inner * (1 - blend) + outer * blend
    alpha = fill(r - 0.96, f.aa)
    # Six spirit lights on a hexagram.
    star = 0.72
    for k, (_name, color, _accent) in enumerate(SPIRITS):
        a = math.pi / 2 - k * math.pi / 3
        cx, cy = star * math.cos(a), star * math.sin(a)
        glow = np.exp(-(np.hypot(f.x - cx, f.y - cy) / 0.12) ** 2)
        rgb += np.array(rgb_of(color))[None, None, :] * glow[..., None] * 0.9
    tri_a = [(star * math.cos(a), star * math.sin(a)) for a in (math.pi / 2, math.pi / 2 + 2 * math.pi / 3, math.pi / 2 + 4 * math.pi / 3)]
    tri_b = [(star * math.cos(a), star * math.sin(a)) for a in (-math.pi / 2, -math.pi / 2 + 2 * math.pi / 3, -math.pi / 2 + 4 * math.pi / 3)]
    hexagram = stroke(np.minimum(sd_polyline(f.x, f.y, tri_a, True), sd_polyline(f.x, f.y, tri_b, True)), 0.022, f.aa)
    hue = (np.arctan2(f.y, f.x) / (2 * math.pi)) % 1.0
    rainbow = np.stack(np.vectorize(lambda h: colorsys.hsv_to_rgb(h, 0.6, 1.0))(hue), axis=-1)
    rgb = rgb * (1 - hexagram[..., None]) + rainbow * hexagram[..., None]
    # The sword, point up.
    blade = sd_polygon(f.x, f.y, [(-0.07, -0.3), (0.07, -0.3), (0.07, 0.62), (0.0, 0.8), (-0.07, 0.62)])
    blade_mask = fill(blade, f.aa)
    edge_light = np.clip(0.75 + 0.25 * np.sign(-f.x), 0, 1)
    rgb = rgb * (1 - blade_mask[..., None]) + (np.array([0.93, 0.95, 1.0])[None, None, :] * edge_light[..., None]) * blade_mask[..., None]
    guard = fill(sd_polygon(f.x, f.y, [(-0.36, -0.3), (0.36, -0.3), (0.3, -0.39), (-0.3, -0.39)]), f.aa)
    grip = fill(sd_polygon(f.x, f.y, [(-0.045, -0.39), (0.045, -0.39), (0.045, -0.66), (-0.045, -0.66)]), f.aa)
    pommel = fill(sd_circle(f.x, f.y, 0.075, 0.0, -0.72), f.aa)
    gold = np.array([0.88, 0.72, 0.36])
    for mask, color in ((guard, gold), (grip, np.array([0.25, 0.32, 0.65])), (pommel, gold)):
        rgb = rgb * (1 - mask[..., None]) + color[None, None, :] * mask[..., None]
    gem = fill(sd_circle(f.x, f.y, 0.045, 0.0, -0.345), f.aa)
    rgb = rgb * (1 - gem[..., None]) + np.array([0.62, 0.36, 1.0])[None, None, :] * gem[..., None]
    ring = stroke(r - 0.94, 0.03, f.aa)
    rgb = rgb * (1 - ring[..., None]) + gold[None, None, :] * ring[..., None]
    image = rgba_image(np.stack([f.down(rgb[..., c]) for c in range(3)], axis=2), f.down(alpha))
    return image


# ------------------------------------------------------------------------------------------------ main


def contact_sheet(paths: list[Path], out: Path, scale: int = 4) -> None:
    images = []
    for path in paths:
        if path.suffix != ".png":
            continue
        image = Image.open(path).convert("RGBA")
        factor = max(1, min(scale, 256 // max(image.width, image.height, 1) or 1))
        images.append(image.resize((image.width * factor, image.height * factor), Image.NEAREST))
    if not images:
        return
    width = 1024
    x = y = row_height = 0
    placements = []
    for image in images:
        if x + image.width > width:
            x = 0
            y += row_height + 6
            row_height = 0
        placements.append((x, y))
        x += image.width + 6
        row_height = max(row_height, image.height)
    sheet = Image.new("RGBA", (width, y + row_height), (40, 40, 48, 255))
    checker = Image.new("RGBA", sheet.size, (60, 60, 70, 255))
    sheet.alpha_composite(checker)
    for image, position in zip(images, placements):
        sheet.alpha_composite(image, position)
    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--sheet", type=Path, help="write enlarged review sheets into this directory")
    args = parser.parse_args()

    write_png("entity/julius/julius_wide.png", make_skin(slim=False))
    write_png("entity/julius/julius_slim.png", make_skin(slim=True))
    write_png("entity/julius/outfit.png", make_outfit())
    write_png("entity/stone_spike.png", tex_stone_spike())

    write_png("item/house_juukulius_sword.png", tex_sword())
    energy, energy_meta = tex_sword_energy()
    write_png("item/house_juukulius_sword_energy.png", energy, energy_meta)

    effects = {
        "glow": (tex_glow, True), "spark": (tex_spark, True), "ring": (tex_ring, True), "shockwave": (tex_shockwave, False),
        "trail": (tex_trail, True), "beam": (tex_beam, True), "crescent": (tex_crescent, True), "vortex": (tex_vortex, False),
        "dome": (tex_dome, False), "smoke": (tex_smoke, True), "magic_circle_outer": (tex_circle_outer, True),
        "magic_circle_inner": (tex_circle_inner, True), "magic_circle_glyphs": (tex_circle_glyphs, True),
        "rainbow_swirl": (tex_rainbow_swirl, False), "spirit_core": (tex_spirit_core, True),
    }
    for name, (factory, clamp) in effects.items():
        write_png(f"effect/{name}.png", factory(), effect_meta(clamp))
    for name, _color, _accent in SPIRITS:
        write_png(f"effect/spirit_{name}.png", tex_spirit_glyph(name), effect_meta(True))

    write_particles()
    write_png("gui/hud_icons.png", tex_hud_icons())
    write_png("gui/spirit_wheel.png", tex_spirit_wheel())

    icon = tex_icon()
    icon_path = ASSETS / "icon.png"
    icon.save(icon_path, optimize=True)
    WRITTEN.append(icon_path)

    print(f"Wrote {len(WRITTEN)} files")
    if args.sheet:
        groups = {
            "characters": [p for p in WRITTEN if "/entity/" in str(p) or "/item/" in str(p)],
            "effects": [p for p in WRITTEN if "/effect/" in str(p)],
            "particles": [p for p in WRITTEN if "/particle/" in str(p)],
            "gui": [p for p in WRITTEN if "/gui/" in str(p) or p.name == "icon.png"],
        }
        for name, paths in groups.items():
            contact_sheet(paths, args.sheet / f"{name}.png", scale=8 if name in ("characters", "particles", "gui") else 4)


if __name__ == "__main__":
    main()
