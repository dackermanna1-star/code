"""Reusable material painters (wood, fabric, metal, stone, masonry, ...).

Every painter returns a fresh 16x16 :class:`Tex` unless a size is given.
"""
from __future__ import annotations

import math

from tex import Tex, mix, rgb, shade

# ----------------------------------------------------------------------------- palettes
WOODS = {
    'light': ('#C49A6C', '#A47A4E', '#D8B486'),
    'walnut': ('#6B4A33', '#4E3523', '#82593D'),
    'white_oak': ('#CDB89A', '#AE9A7C', '#DCCAB0'),
    'ebony': ('#3B2A22', '#281C16', '#4C372C'),
    'teak': ('#A0643A', '#7E4C2A', '#B8784A'),
    'gray': ('#9C948B', '#7F776E', '#B0A99F'),
}

PAINTS = {
    'white': '#ECEAE4', 'navy': '#2E3B55', 'sage': '#9AAE95', 'charcoal': '#3C3F43',
    'cream': '#E6DCC6', 'black': '#202124', 'gray': '#8A8D90',
}

FABRICS = {
    'gray': '#8E9196', 'charcoal': '#4A4D52', 'navy': '#34476B', 'beige': '#C8B79B',
    'cream': '#E3DCCB', 'emerald': '#2F6B57', 'terracotta': '#B76A4B', 'blush': '#D9A6A0',
    'mustard': '#C99A3A', 'teal': '#2F7A80', 'sky': '#8FB3CF', 'olive': '#7D7F4A',
}

METALS = {
    'steel': '#B8BCC0', 'chrome': '#D8DCE0', 'black': '#2C2D30', 'brass': '#C9A55A',
    'bronze': '#6E5440', 'white': '#E8E8E6', 'gunmetal': '#55595E',
}


# ----------------------------------------------------------------------------- organic
def wood(kind: str, name: str, vertical: bool = False, size: int = 16) -> Tex:
    base, dark, light = WOODS[kind]
    t = Tex(size, size, base, name)
    rng = t.rng
    # smooth random walk of tone per row gives long grain bands
    tone = 0.0
    for y in range(size):
        tone = tone * 0.6 + rng.normal(0, 0.05)
        t.scale_rect(0, y, size, y + 1, 1.0 + tone)
    # darker grain streaks that wander slightly
    for _ in range(size // 3):
        y = int(rng.integers(0, size))
        x = 0
        while x < size:
            run = int(rng.integers(3, 9))
            t.blend_rect(x, y, x + run, y + 1, dark, 0.55)
            x += run
            y = (y + int(rng.choice([-1, 0, 0, 1]))) % size
    for _ in range(size // 5):
        y = int(rng.integers(0, size))
        x0 = int(rng.integers(0, size))
        t.blend_rect(x0, y, x0 + int(rng.integers(2, 6)), y + 1, light, 0.5)
    t.noise(0.025)
    if vertical:
        t.rot90()
    return t


def fabric(color, name: str, size: int = 16) -> Tex:
    t = Tex(size, size, color, name)
    for y in range(size):
        for x in range(size):
            if (x + y) % 2 == 0:
                t._scale(x, y, 1.035)
            if (x * 3 + y * 5) % 7 == 0:
                t._scale(x, y, 0.965)
    t.noise(0.03)
    return t


def leather(color, name: str) -> Tex:
    t = Tex(16, 16, color, name)
    t.noise(0.05)
    rng = t.rng
    for _ in range(6):
        x, y = int(rng.integers(0, 16)), int(rng.integers(0, 16))
        t._scale(x, y, 1.15)
    return t


def paint(color, name: str, amount: float = 0.012) -> Tex:
    return Tex(16, 16, color, name).noise(amount)


def plastic(color, name: str) -> Tex:
    return Tex(16, 16, color, name).noise(0.01)


def brushed(color, name: str) -> Tex:
    t = Tex(16, 16, color, name)
    t.row_tones(0.035, smooth=1)
    t.noise(0.012)
    return t


def chrome(name: str) -> Tex:
    t = Tex(16, 16, '#D8DCE0', name)
    t.vgrad('#F4F6F8', '#9EA4AA')
    t.rect(0, 5, 16, 7, '#FAFBFC')
    t.rect(0, 11, 16, 12, '#B9BEC3')
    t.noise(0.01)
    return t


def stone_marble(base, vein, name: str, size: int = 16) -> Tex:
    t = Tex(size, size, base, name)
    t.noise(0.02)
    rng = t.rng
    for v in range(2):
        phase = rng.uniform(0, 6.28)
        slope = rng.uniform(-0.8, 0.8)
        off = rng.uniform(0, size)
        for x in range(size):
            y = off + slope * x + 1.6 * math.sin(x * 0.7 + phase)
            yy = int(round(y)) % size
            t.blend_rect(x, yy, x + 1, yy + 1, vein, 0.75 if v == 0 else 0.45)
            if rng.random() < 0.35:
                t.blend_rect(x, (yy + 1) % size, x + 1, (yy + 1) % size + 1, vein, 0.3)
    return t


def speckled(base, specks: list, density: float, name: str, noise: float = 0.03) -> Tex:
    t = Tex(16, 16, base, name)
    t.noise(noise)
    for color in specks:
        t.speckle(color, density / len(specks))
    return t


def terrazzo(name: str) -> Tex:
    t = Tex(16, 16, '#DDD8CF', name).noise(0.015)
    rng = t.rng
    chips = ['#8C8780', '#B85C3C', '#2F3438', '#C9B48A', '#F4F1EA', '#6B7F72']
    for _ in range(26):
        x, y = int(rng.integers(0, 16)), int(rng.integers(0, 16))
        c = chips[int(rng.integers(0, len(chips)))]
        t.px(x, y, c)
        if rng.random() < 0.4:
            t.px((x + 1) % 16, y, c)
    return t


# ----------------------------------------------------------------------------- masonry
def brick(brick_colors: list, mortar, name: str, rows: int = 4, brick_w: int = 8,
          soot: float = 0.0, mortar_noise: float = 0.04) -> Tex:
    """Running-bond brick. rows = number of brick courses per block."""
    t = Tex(16, 16, mortar, name)
    t.noise(mortar_noise)
    rng = t.rng
    course_h = 16 // rows
    for r in range(rows):
        y0 = r * course_h
        offset = 0 if r % 2 == 0 else brick_w // 2
        x = -offset
        while x < 16:
            color = brick_colors[int(rng.integers(0, len(brick_colors)))]
            tone = 1.0 + rng.normal(0, 0.05)
            c = shade(color, tone)
            t.rect(x, y0, x + brick_w - 1, y0 + course_h - 1, c)
            t.noise_rect(max(0, x), y0, min(16, x + brick_w - 1), y0 + course_h - 1, 0.045)
            # slight top highlight per brick
            t.scale_rect(max(0, x), y0, min(16, x + brick_w - 1), y0 + 1, 1.06)
            if soot > 0 and rng.random() < soot:
                t.scale_rect(max(0, x), y0, min(16, x + brick_w - 1), y0 + course_h - 1, 0.78)
            x += brick_w
    return t


def tile_grid(color, grout, name: str, tw: int = 4, th: int = 4, offset_rows: bool = False,
              tone: float = 0.03, colors: list | None = None) -> Tex:
    t = Tex(16, 16, grout, name)
    rng = t.rng
    rows = 16 // th
    for r in range(rows):
        off = (tw // 2) if (offset_rows and r % 2 == 1) else 0
        x = -off
        while x < 16:
            c = color if not colors else colors[int(rng.integers(0, len(colors)))]
            c = shade(c, 1.0 + rng.normal(0, tone))
            t.rect(x, r * th, x + tw - 1, r * th + th - 1, c)
            x += tw
    t.noise(0.012)
    return t


def lap_siding(color, name: str, boards: int = 4) -> Tex:
    t = Tex(16, 16, color, name)
    h = 16 // boards
    for b in range(boards):
        y0 = b * h
        t.vgrad(shade(color, 1.05), shade(color, 0.95), 0, y0, 16, y0 + h)
        t.hline(y0 + h - 1, shade(color, 0.72))
    t.col_tones(0.01, 1)
    t.noise(0.012)
    return t


def panel(color, name: str, seam_factor: float = 0.78, ties: bool = False) -> Tex:
    """Large architectural panel with reveal joints along the bottom/right edges."""
    t = Tex(16, 16, color, name)
    t.noise(0.018)
    t.hline(15, shade(color, seam_factor))
    t.vline(15, shade(color, seam_factor))
    t.hline(0, shade(color, 1.04), 0, 15)
    t.vline(0, shade(color, 1.04), 0, 15)
    if ties:
        for (x, y) in ((3, 3), (11, 3), (3, 11), (11, 11)):
            t.px(x, y, shade(color, 0.7))
    return t


def standing_seam(color, name: str) -> Tex:
    t = Tex(16, 16, color, name)
    t.noise(0.015)
    for x in (0, 8):
        t.vline(x, shade(color, 1.18))
        t.vline(x + 1, shade(color, 0.78))
    t.row_tones(0.01, 1)
    return t


def slats(color, gap, name: str, vertical: bool = True, width: int = 3) -> Tex:
    t = Tex(16, 16, color, name)
    rng = t.rng
    for i in range(0, 16, width + 1):
        c = shade(color, 1.0 + rng.normal(0, 0.06))
        if vertical:
            t.rect(i, 0, i + width, 16, c)
            t.vline(i + width, gap)
        else:
            t.rect(0, i, 16, i + width, c)
            t.hline(i + width, gap)
    t.noise(0.03)
    return t


def floor_boards(kind: str, name: str, board_h: int = 4) -> Tex:
    base, dark, light = WOODS[kind]
    t = Tex(16, 16, base, name)
    rng = t.rng
    for r in range(16 // board_h):
        y0 = r * board_h
        seam = int(rng.integers(2, 14))
        for seg, (x0, x1) in enumerate(((0, seam), (seam, 16))):
            c = shade(base, 1.0 + rng.normal(0, 0.06))
            t.rect(x0, y0, x1, y0 + board_h, c)
            for _ in range(2):
                gy = y0 + int(rng.integers(0, board_h - 1))
                gx = x0 + int(rng.integers(0, max(1, x1 - x0)))
                t.blend_rect(gx, gy, min(x1, gx + int(rng.integers(2, 6))), gy + 1, dark, 0.45)
            t.vline(x0, shade(c, 0.75), y0, y0 + board_h)
        t.hline(y0 + board_h - 1, shade(base, 0.72))
    t.noise(0.02)
    return t


def herringbone(kind: str, name: str) -> Tex:
    base, dark, light = WOODS[kind]
    t = Tex(16, 16, base, name)
    rng = t.rng
    # 2px wide planks, 8px long, alternating diagonals
    for y in range(16):
        for x in range(16):
            band = ((x // 2) + (y // 2)) % 8
            block = ((x // 2) - (y // 2)) // 4 % 2
            k = (band + block * 3) % 5
            t.px(x, y, shade(base, (0.9, 1.0, 1.06, 0.95, 1.02)[k]))
    t.noise(0.03)
    return t


def turf(name: str) -> Tex:
    t = Tex(16, 16, '#4E8A3A', name)
    t.noise(0.08, mono=False)
    t.speckle('#6FAE52', 0.12)
    t.speckle('#3B6E2C', 0.12)
    return t


def asphalt(name: str) -> Tex:
    t = Tex(16, 16, '#3A3B3D', name)
    t.noise(0.06)
    t.speckle('#5B5C5F', 0.08)
    t.speckle('#2A2B2D', 0.08)
    return t


def glass(color, alpha: int, name: str, streaks: bool = True) -> Tex:
    t = Tex(16, 16, color, name)
    t.alpha(alpha)
    if streaks:
        # two diagonal reflection streaks
        c = rgb(color)
        hi = (min(255, c[0] + 45), min(255, c[1] + 45), min(255, c[2] + 45), min(255, alpha + 40))
        for k in range(16):
            for x0, w in ((3, 2), (9, 1)):
                x = x0 + k // 2 - 4
                for dx in range(w):
                    xx = (x + dx) % 16
                    t.a[15 - k, xx] = hi
    return t
