"""16x16 spawn egg textures: an egg shaded from the top left, in the animal's colours and with a
pattern that recalls its coat."""
import math

import numpy as np
from PIL import Image

from mobs.paint import rgb


def egg(base, accent, pattern, seed_name):
    seed = sum(ord(c) * (i + 1) for i, c in enumerate(seed_name))
    r = np.random.default_rng(seed)
    img = np.zeros((16, 16, 4), dtype=float)
    b, a = rgb(base), rgb(accent)
    cx, cy = 7.5, 8.6
    inside = np.zeros((16, 16), dtype=bool)
    coords = {}
    for y in range(16):
        for x in range(16):
            dx = (x + 0.5 - (cx + 0.5)) / 5.0
            ry = 6.9 if y + 0.5 < cy + 0.5 else 5.9
            dy = (y + 0.5 - (cy + 0.5)) / ry
            d = dx * dx + dy * dy
            if d <= 1.0:
                inside[y, x] = True
                coords[(x, y)] = (dx, dy, d)
    for (x, y), (dx, dy, d) in coords.items():
        u, v = (x - 3) / 10.0, (y - 1) / 14.0
        c = b.copy()
        if pattern == 'stripes':
            if math.sin((x * 1.0 + 0.35 * y) * 1.55) > 0.15:
                c = a
        elif pattern == 'patches':
            rr = np.random.default_rng(seed + 7)
            pts = rr.random((9, 2)) * [10, 14] + [3, 1]
            dd = np.sort(np.hypot(pts[:, 0] - x, pts[:, 1] - y))
            c = b if dd[1] - dd[0] < 0.9 else a
        elif pattern == 'rosettes':
            rr = np.random.default_rng(seed + 9)
            pts = rr.random((7, 2)) * [10, 14] + [3, 1]
            dd = np.hypot(pts[:, 0] - x, pts[:, 1] - y).min()
            if 0.9 < dd < 1.6:
                c = a
        elif pattern == 'band':
            if 0.52 < v < 0.64:
                c = a
            elif v >= 0.64:
                c = rgb('#EEE8DC')
        elif pattern == 'bands':
            if math.sin(x * 1.7 + r.random() * 0.4) > 0.55:
                c = b * 0.6 + a * 0.4
        elif pattern == 'belly':
            if v > 0.62:
                c = a
        elif pattern == 'mane':
            if v < 0.45:
                c = a * (0.8 + 0.2 * r.random()) + b * 0.0
        elif pattern in ('tips', 'tip'):
            if v > (0.7 if pattern == 'tips' else 0.78):
                c = a
        elif pattern == 'scutes':
            if v > 0.68:
                c = a
            elif (x + (y // 2)) % 3 == 0 and y % 2 == 0:
                c = b * 0.7
        elif pattern == 'cap':
            if v < 0.3:
                c = a
        elif pattern == 'bill':
            if 0.25 < v < 0.5 and u < 0.75:
                c = a
            elif 0.15 < v <= 0.25 and u < 0.6:
                c = rgb('#F2EEDC')
        elif pattern == 'back':
            if v < 0.4:
                c = a
        elif pattern == 'muzzle':
            if v > 0.62:
                c = a
        elif pattern == 'stripe':
            if abs(x - 7.5) < 1.0:
                c = a
            elif v > 0.75:
                c = a
        elif pattern == 'humps':
            if v < 0.35 and (abs(x - 5.5) < 1.6 or abs(x - 10) < 1.6):
                c = a
        elif pattern == 'wrinkles':
            if y % 3 == 0 and r.random() < 0.7:
                c = a
        shade = 1.0 + 0.28 * (-dx * 0.6 - dy * 0.8) - 0.18 * max(0.0, d - 0.55)
        c = np.clip(c * shade + (r.random() - 0.5) * 10, 0, 255)
        img[y, x, :3] = c
        img[y, x, 3] = 255
    # outline: darkened rim pixels
    out = img.copy()
    for y in range(16):
        for x in range(16):
            if not inside[y, x]:
                continue
            edge = any(not (0 <= x + ox < 16 and 0 <= y + oy < 16 and inside[y + oy, x + ox]) for ox, oy in ((1, 0), (-1, 0), (0, 1), (0, -1)))
            if edge:
                out[y, x, :3] = img[y, x, :3] * 0.55
    # highlight
    for (x, y) in ((5, 4), (5, 5), (6, 4)):
        if inside[y, x]:
            out[y, x, :3] = np.clip(out[y, x, :3] * 1.25 + 30, 0, 255)
    return Image.fromarray(np.round(out).astype(np.uint8), 'RGBA')
