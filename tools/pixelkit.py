"""Tiny pixel-art toolkit for generating 16x16 Minecraft-style textures procedurally.

Everything works on numpy RGBA arrays of shape (H, W, 4), dtype uint8. Noise is tileable so
block textures repeat seamlessly.
"""
import math

import numpy as np

SIZE = 16


def hexc(s, a=255):
    s = s.lstrip('#')
    return np.array([int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16), a], dtype=np.uint8)


def palette(*colors):
    return np.array([hexc(c) for c in colors], dtype=np.uint8)


def blank(w=SIZE, h=SIZE):
    return np.zeros((h, w, 4), dtype=np.uint8)


def solid(color, w=SIZE, h=SIZE):
    img = np.zeros((h, w, 4), dtype=np.uint8)
    img[:, :] = hexc(color) if isinstance(color, str) else color
    return img


def rng(seed):
    return np.random.default_rng(seed)


def _cubic(t):
    return t * t * (3 - 2 * t)


def value_noise(seed, cells_x, cells_y=None, w=SIZE, h=SIZE):
    """Tileable smooth value noise in [0, 1] with the given number of lattice cells per tile."""
    cells_y = cells_y or cells_x
    r = rng(seed)
    lattice = r.random((cells_y, cells_x))
    out = np.zeros((h, w))
    for y in range(h):
        fy = (y + 0.5) / h * cells_y
        y0 = int(math.floor(fy - 0.5)) % cells_y
        ty = _cubic((fy - 0.5) - math.floor(fy - 0.5))
        y1 = (y0 + 1) % cells_y
        for x in range(w):
            fx = (x + 0.5) / w * cells_x
            x0 = int(math.floor(fx - 0.5)) % cells_x
            tx = _cubic((fx - 0.5) - math.floor(fx - 0.5))
            x1 = (x0 + 1) % cells_x
            a = lattice[y0, x0] * (1 - tx) + lattice[y0, x1] * tx
            b = lattice[y1, x0] * (1 - tx) + lattice[y1, x1] * tx
            out[y, x] = a * (1 - ty) + b * ty
    return out


def fbm(seed, layers=((2, 0.45), (4, 0.3), (8, 0.15), (16, 0.1)), w=SIZE, h=SIZE, stretch=(1, 1)):
    """Sum of tileable value-noise octaves, normalised to [0, 1]. stretch=(sx, sy) elongates."""
    total = np.zeros((h, w))
    norm = 0.0
    for i, (cells, weight) in enumerate(layers):
        cx = max(1, int(round(cells / stretch[0])))
        cy = max(1, int(round(cells / stretch[1])))
        total += value_noise(seed * 31 + i * 7 + 1, cx, cy, w, h) * weight
        norm += weight
    total /= norm
    lo, hi = total.min(), total.max()
    return (total - lo) / (hi - lo + 1e-9)


def white(seed, w=SIZE, h=SIZE):
    return rng(seed).random((h, w))


def quantize(values, pal):
    idx = np.clip((values * len(pal)).astype(int), 0, len(pal) - 1)
    return pal[idx]


def shade(color, factor):
    c = color.astype(float)
    c[:3] = np.clip(c[:3] * factor, 0, 255)
    return c.astype(np.uint8)


def mix(c1, c2, t):
    return (c1.astype(float) * (1 - t) + c2.astype(float) * t).astype(np.uint8)


def put(img, x, y, color):
    h, w = img.shape[:2]
    if 0 <= x < w and 0 <= y < h:
        img[y, x] = color


def put_wrap(img, x, y, color):
    h, w = img.shape[:2]
    img[y % h, x % w] = color


def line(img, x0, y0, x1, y1, color, wrap=False):
    n = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
    for i in range(n + 1):
        t = i / max(1, n)
        x = int(round(x0 + (x1 - x0) * t))
        y = int(round(y0 + (y1 - y0) * t))
        (put_wrap if wrap else put)(img, x, y, color)


def blade(img, x, height, lean, colors, base_y=15, wobble=0.0, seed=0, width=1):
    """A grass blade rising from the bottom row. colors: list from base (dark) to tip (light)."""
    r = rng(seed)
    pts = []
    for i in range(height):
        t = i / max(1, height - 1)
        px = x + lean * (t ** 1.6) + wobble * math.sin(t * 3.0 + r.random() * 6)
        pts.append((int(round(px)), base_y - i, t))
    for (px, py, t) in pts:
        ci = min(len(colors) - 1, int(t * len(colors)))
        put(img, px, py, colors[ci])
        if width > 1 and t < 0.35:
            put(img, px + 1, py, colors[max(0, ci - 1)])
    return pts


def disc(img, cx, cy, r, color, wrap=False):
    for y in range(int(cy - r - 1), int(cy + r + 2)):
        for x in range(int(cx - r - 1), int(cx + r + 2)):
            if (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r:
                (put_wrap if wrap else put)(img, x, y, color)


def fill_transparent_rgb(img, color):
    """Give fully transparent pixels a dark RGB so 'fast' leaf rendering looks right."""
    mask = img[:, :, 3] == 0
    c = hexc(color) if isinstance(color, str) else color
    img[mask, 0] = c[0]
    img[mask, 1] = c[1]
    img[mask, 2] = c[2]
    return img


def outline_darken(img, factor=0.75):
    """Darken opaque pixels that border transparency, for crisper sprite edges."""
    h, w = img.shape[:2]
    out = img.copy()
    for y in range(h):
        for x in range(w):
            if img[y, x, 3] == 0:
                continue
            edge = False
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h and img[ny, nx, 3] == 0:
                    edge = True
            if edge:
                out[y, x] = shade(img[y, x], factor)
    return out


def to_image(arr):
    from PIL import Image
    return Image.fromarray(arr, 'RGBA')


def save(arr, path):
    import os
    os.makedirs(os.path.dirname(path), exist_ok=True)
    to_image(arr).save(path)
