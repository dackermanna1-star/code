"""Small procedural pixel-art toolkit used to paint every texture in the mod.

All textures are generated deterministically (seeded by name) so the asset set can be
rebuilt at any time with ``python3 tools/assetgen/generate.py``.
"""
from __future__ import annotations

import hashlib
import math
import os

import numpy as np
from PIL import Image


def rgb(value) -> tuple:
    """Accepts '#rrggbb', (r, g, b) or (r, g, b, a) and returns an RGBA tuple."""
    if isinstance(value, str):
        value = value.lstrip('#')
        r, g, b = int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16)
        return (r, g, b, 255)
    if len(value) == 3:
        return (value[0], value[1], value[2], 255)
    return tuple(value)


def shade(color, factor: float) -> tuple:
    c = rgb(color)
    return (clamp(c[0] * factor), clamp(c[1] * factor), clamp(c[2] * factor), c[3])


def mix(a, b, t: float) -> tuple:
    ca, cb = rgb(a), rgb(b)
    return tuple(clamp(ca[i] + (cb[i] - ca[i]) * t) for i in range(4))


def clamp(v) -> int:
    return int(max(0, min(255, round(v))))


def rng_for(name: str) -> np.random.Generator:
    digest = hashlib.md5(name.encode('utf-8')).hexdigest()
    return np.random.default_rng(int(digest[:12], 16))


class Tex:
    """A mutable RGBA image stored as a float array (h, w, 4)."""

    def __init__(self, w: int = 16, h: int = 16, color=(0, 0, 0, 0), name: str = 'tex'):
        self.w, self.h = w, h
        self.a = np.zeros((h, w, 4), dtype=np.float64)
        self.a[...] = rgb(color)
        self.rng = rng_for(name)
        self.name = name

    # ------------------------------------------------------------------ basics
    def copy(self, name: str | None = None) -> 'Tex':
        t = Tex(self.w, self.h, name=name or self.name)
        t.a = self.a.copy()
        return t

    def fill(self, color) -> 'Tex':
        self.a[...] = rgb(color)
        return self

    def px(self, x: int, y: int, color) -> 'Tex':
        if 0 <= x < self.w and 0 <= y < self.h:
            self.a[y, x] = rgb(color)
        return self

    def rect(self, x0: int, y0: int, x1: int, y1: int, color) -> 'Tex':
        """Fills [x0, x1) x [y0, y1)."""
        x0, x1 = max(0, x0), min(self.w, x1)
        y0, y1 = max(0, y0), min(self.h, y1)
        if x0 < x1 and y0 < y1:
            self.a[y0:y1, x0:x1] = rgb(color)
        return self

    def frame(self, x0: int, y0: int, x1: int, y1: int, color) -> 'Tex':
        """1px outline of the rectangle [x0, x1) x [y0, y1)."""
        self.rect(x0, y0, x1, y0 + 1, color)
        self.rect(x0, y1 - 1, x1, y1, color)
        self.rect(x0, y0, x0 + 1, y1, color)
        self.rect(x1 - 1, y0, x1, y1, color)
        return self

    def hline(self, y: int, color, x0: int = 0, x1: int | None = None) -> 'Tex':
        return self.rect(x0, y, self.w if x1 is None else x1, y + 1, color)

    def vline(self, x: int, color, y0: int = 0, y1: int | None = None) -> 'Tex':
        return self.rect(x, y0, x + 1, self.h if y1 is None else y1, color)

    def bevel(self, x0: int, y0: int, x1: int, y1: int, light: float = 1.12, dark: float = 0.82) -> 'Tex':
        """Lightens the top/left edge and darkens the bottom/right edge of a rectangle."""
        for x in range(max(0, x0), min(self.w, x1)):
            self._scale(x, y0, light)
            self._scale(x, y1 - 1, dark)
        for y in range(max(0, y0 + 1), min(self.h, y1 - 1)):
            self._scale(x0, y, light)
            self._scale(x1 - 1, y, dark)
        return self

    def inset(self, x0: int, y0: int, x1: int, y1: int, light: float = 1.1, dark: float = 0.84) -> 'Tex':
        """Opposite of bevel: a recessed panel."""
        return self.bevel(x0, y0, x1, y1, dark, light)

    def _scale(self, x: int, y: int, f: float) -> None:
        if 0 <= x < self.w and 0 <= y < self.h:
            self.a[y, x, :3] = np.clip(self.a[y, x, :3] * f, 0, 255)

    def scale_rect(self, x0: int, y0: int, x1: int, y1: int, f: float) -> 'Tex':
        x0, x1 = max(0, x0), min(self.w, x1)
        y0, y1 = max(0, y0), min(self.h, y1)
        self.a[y0:y1, x0:x1, :3] = np.clip(self.a[y0:y1, x0:x1, :3] * f, 0, 255)
        return self

    def alpha(self, value: int, x0: int = 0, y0: int = 0, x1: int | None = None, y1: int | None = None) -> 'Tex':
        x1 = self.w if x1 is None else x1
        y1 = self.h if y1 is None else y1
        self.a[y0:y1, x0:x1, 3] = value
        return self

    # ------------------------------------------------------------------ texture
    def noise(self, amount: float = 0.04, mono: bool = True) -> 'Tex':
        if mono:
            n = self.rng.normal(0.0, amount, (self.h, self.w, 1))
        else:
            n = self.rng.normal(0.0, amount, (self.h, self.w, 3))
        mask = self.a[..., 3:4] > 0
        self.a[..., :3] = np.where(mask, np.clip(self.a[..., :3] * (1.0 + n), 0, 255), self.a[..., :3])
        return self

    def noise_rect(self, x0, y0, x1, y1, amount=0.04) -> 'Tex':
        n = self.rng.normal(0.0, amount, (y1 - y0, x1 - x0, 1))
        self.a[y0:y1, x0:x1, :3] = np.clip(self.a[y0:y1, x0:x1, :3] * (1.0 + n), 0, 255)
        return self

    def row_tones(self, amount: float = 0.05, smooth: int = 2) -> 'Tex':
        """Horizontal streaks (brushed metal, wood grain)."""
        tones = self.rng.normal(0.0, amount, self.h)
        if smooth > 1:
            k = np.ones(smooth) / smooth
            tones = np.convolve(np.concatenate([tones[-smooth:], tones, tones[:smooth]]), k, 'same')[smooth:-smooth]
        self.a[..., :3] = np.clip(self.a[..., :3] * (1.0 + tones[:, None, None]), 0, 255)
        return self

    def col_tones(self, amount: float = 0.05, smooth: int = 2) -> 'Tex':
        tones = self.rng.normal(0.0, amount, self.w)
        if smooth > 1:
            k = np.ones(smooth) / smooth
            tones = np.convolve(np.concatenate([tones[-smooth:], tones, tones[:smooth]]), k, 'same')[smooth:-smooth]
        self.a[..., :3] = np.clip(self.a[..., :3] * (1.0 + tones[None, :, None]), 0, 255)
        return self

    def vgrad(self, top, bottom, x0=0, y0=0, x1=None, y1=None) -> 'Tex':
        x1 = self.w if x1 is None else x1
        y1 = self.h if y1 is None else y1
        ct, cb = np.array(rgb(top), dtype=float), np.array(rgb(bottom), dtype=float)
        n = max(1, y1 - y0 - 1)
        for i, y in enumerate(range(y0, y1)):
            self.a[y, x0:x1] = ct + (cb - ct) * (i / n)
        return self

    def hgrad(self, left, right, x0=0, y0=0, x1=None, y1=None) -> 'Tex':
        x1 = self.w if x1 is None else x1
        y1 = self.h if y1 is None else y1
        cl, cr = np.array(rgb(left), dtype=float), np.array(rgb(right), dtype=float)
        n = max(1, x1 - x0 - 1)
        for i, x in enumerate(range(x0, x1)):
            self.a[y0:y1, x] = cl + (cr - cl) * (i / n)
        return self

    def speckle(self, color, density: float, x0=0, y0=0, x1=None, y1=None) -> 'Tex':
        x1 = self.w if x1 is None else x1
        y1 = self.h if y1 is None else y1
        c = rgb(color)
        for y in range(y0, y1):
            for x in range(x0, x1):
                if self.rng.random() < density:
                    self.a[y, x] = c
        return self

    def blend_rect(self, x0, y0, x1, y1, color, t: float) -> 'Tex':
        c = np.array(rgb(color), dtype=float)
        x0, x1 = max(0, x0), min(self.w, x1)
        y0, y1 = max(0, y0), min(self.h, y1)
        self.a[y0:y1, x0:x1, :3] = self.a[y0:y1, x0:x1, :3] * (1 - t) + c[:3] * t
        return self

    def paste(self, other: 'Tex', x: int, y: int) -> 'Tex':
        for yy in range(other.h):
            for xx in range(other.w):
                px = other.a[yy, xx]
                if px[3] > 0 and 0 <= x + xx < self.w and 0 <= y + yy < self.h:
                    if px[3] >= 255:
                        self.a[y + yy, x + xx] = px
                    else:
                        t = px[3] / 255.0
                        self.a[y + yy, x + xx, :3] = self.a[y + yy, x + xx, :3] * (1 - t) + px[:3] * t
        return self

    def circle(self, cx: float, cy: float, r: float, color, fill: bool = True) -> 'Tex':
        c = rgb(color)
        for y in range(self.h):
            for x in range(self.w):
                d = math.hypot(x + 0.5 - cx, y + 0.5 - cy)
                if (fill and d <= r) or (not fill and r - 0.75 <= d <= r + 0.25):
                    self.a[y, x] = c
        return self

    def flip_h(self) -> 'Tex':
        self.a = self.a[:, ::-1].copy()
        return self

    def flip_v(self) -> 'Tex':
        self.a = self.a[::-1].copy()
        return self

    def rot90(self) -> 'Tex':
        self.a = np.rot90(self.a, 1).copy()
        self.h, self.w = self.a.shape[0], self.a.shape[1]
        return self

    def image(self) -> Image.Image:
        return Image.fromarray(np.clip(np.round(self.a), 0, 255).astype(np.uint8), 'RGBA')

    def save(self, path: str) -> None:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        self.image().save(path, optimize=True)


def stack_frames(frames: list[Tex], name: str) -> Tex:
    """Stacks frames vertically for an animated texture strip."""
    w, h = frames[0].w, frames[0].h
    out = Tex(w, h * len(frames), name=name)
    for i, f in enumerate(frames):
        out.a[i * h:(i + 1) * h] = f.a
    return out


# ---------------------------------------------------------------------- pixel font
# 3x5 pixel font used for tiny labels on textures (EXIT signs, floor buttons, etc.)
FONT_3X5 = {
    'A': ['010', '101', '111', '101', '101'], 'B': ['110', '101', '110', '101', '110'],
    'C': ['011', '100', '100', '100', '011'], 'D': ['110', '101', '101', '101', '110'],
    'E': ['111', '100', '110', '100', '111'], 'F': ['111', '100', '110', '100', '100'],
    'G': ['011', '100', '101', '101', '011'], 'H': ['101', '101', '111', '101', '101'],
    'I': ['111', '010', '010', '010', '111'], 'J': ['001', '001', '001', '101', '010'],
    'K': ['101', '101', '110', '101', '101'], 'L': ['100', '100', '100', '100', '111'],
    'M': ['101', '111', '111', '101', '101'], 'N': ['110', '101', '101', '101', '101'],
    'O': ['010', '101', '101', '101', '010'], 'P': ['110', '101', '110', '100', '100'],
    'Q': ['010', '101', '101', '110', '011'], 'R': ['110', '101', '110', '101', '101'],
    'S': ['011', '100', '010', '001', '110'], 'T': ['111', '010', '010', '010', '010'],
    'U': ['101', '101', '101', '101', '111'], 'V': ['101', '101', '101', '101', '010'],
    'W': ['101', '101', '111', '111', '101'], 'X': ['101', '101', '010', '101', '101'],
    'Y': ['101', '101', '010', '010', '010'], 'Z': ['111', '001', '010', '100', '111'],
    '0': ['111', '101', '101', '101', '111'], '1': ['010', '110', '010', '010', '111'],
    '2': ['110', '001', '010', '100', '111'], '3': ['110', '001', '010', '001', '110'],
    '4': ['101', '101', '111', '001', '001'], '5': ['111', '100', '110', '001', '110'],
    '6': ['011', '100', '111', '101', '111'], '7': ['111', '001', '010', '010', '010'],
    '8': ['111', '101', '111', '101', '111'], '9': ['111', '101', '111', '001', '110'],
    ' ': ['000', '000', '000', '000', '000'], '-': ['000', '000', '111', '000', '000'],
    '>': ['100', '010', '001', '010', '100'], '<': ['001', '010', '100', '010', '001'],
    '+': ['000', '010', '111', '010', '000'], '.': ['000', '000', '000', '000', '010'],
}


def text_width(text: str) -> int:
    return len(text) * 4 - 1 if text else 0


def draw_text(t: Tex, text: str, x: int, y: int, color) -> Tex:
    for i, ch in enumerate(text.upper()):
        glyph = FONT_3X5.get(ch, FONT_3X5[' '])
        for gy, row in enumerate(glyph):
            for gx, bit in enumerate(row):
                if bit == '1':
                    t.px(x + i * 4 + gx, y + gy, color)
    return t
