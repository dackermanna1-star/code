"""Tiny pixel-art toolkit used by the Godforge texture generators.

Images are numpy uint8 arrays shaped (h, w, 4). Colours are (r, g, b, a) tuples or '#rrggbb' strings.
"""
import colorsys
import json
import math
import os
import random

import numpy as np
from PIL import Image


def hexc(c, a=255):
    if isinstance(c, tuple):
        return c if len(c) == 4 else (c[0], c[1], c[2], a)
    c = c.lstrip('#')
    return (int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16), a)


def lerp(c1, c2, t):
    c1, c2 = hexc(c1), hexc(c2)
    t = max(0.0, min(1.0, t))
    return tuple(int(round(c1[i] + (c2[i] - c1[i]) * t)) for i in range(4))


def ramp(stops, t):
    """stops: list of (t, colour) sorted by t."""
    t = max(0.0, min(1.0, t))
    for i in range(len(stops) - 1):
        t0, c0 = stops[i]
        t1, c1 = stops[i + 1]
        if t <= t1:
            return lerp(c0, c1, 0 if t1 == t0 else (t - t0) / (t1 - t0))
    return hexc(stops[-1][1])


def hsv(h, s, v, a=255):
    r, g, b = colorsys.hsv_to_rgb(h % 1.0, max(0, min(1, s)), max(0, min(1, v)))
    return (int(r * 255), int(g * 255), int(b * 255), a)


def scale(c, f):
    c = hexc(c)
    return (min(255, int(c[0] * f)), min(255, int(c[1] * f)), min(255, int(c[2] * f)), c[3])


def new(w, h):
    return np.zeros((h, w, 4), dtype=np.uint8)


def put(img, x, y, c):
    h, w = img.shape[:2]
    if 0 <= x < w and 0 <= y < h and c is not None:
        img[y, x] = hexc(c)


def blend(img, x, y, c):
    """Alpha-blend colour c over pixel."""
    h, w = img.shape[:2]
    if not (0 <= x < w and 0 <= y < h) or c is None:
        return
    c = hexc(c)
    a = c[3] / 255.0
    dst = img[y, x].astype(float)
    if dst[3] == 0:
        img[y, x] = c
        return
    out = dst.copy()
    out[:3] = dst[:3] * (1 - a) + np.array(c[:3]) * a
    out[3] = max(dst[3], c[3])
    img[y, x] = out.astype(np.uint8)


def fill_fn(img, fn):
    """fn(x, y) -> colour or None for every pixel."""
    h, w = img.shape[:2]
    for y in range(h):
        for x in range(w):
            c = fn(x, y)
            if c is not None:
                img[y, x] = hexc(c)


def diag(x, y, size=32):
    """Diagonal coordinates: a runs bottom-left (0) -> top-right (2*(size-1)), b is the across offset
    (negative = towards top-left, positive = towards bottom-right). a and b share parity."""
    return x - y + (size - 1), x + y - (size - 1)


def outline(img, colour, diagonal=False):
    h, w = img.shape[:2]
    alpha = img[:, :, 3] > 0
    out = img.copy()
    c = hexc(colour)
    for y in range(h):
        for x in range(w):
            if alpha[y, x]:
                continue
            nb = [(1, 0), (-1, 0), (0, 1), (0, -1)]
            if diagonal:
                nb += [(1, 1), (-1, -1), (1, -1), (-1, 1)]
            for dx, dy in nb:
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h and alpha[ny, nx]:
                    out[y, x] = c
                    break
    img[:] = out


def save(img, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    Image.fromarray(img, 'RGBA').save(path)


def save_anim(frames, path, frametime=2, interpolate=False):
    """Stack frames vertically and write the .mcmeta animation file."""
    stacked = np.concatenate(frames, axis=0)
    save(stacked, path)
    meta = {"animation": {"frametime": frametime}}
    if interpolate:
        meta["animation"]["interpolate"] = True
    with open(path + '.mcmeta', 'w') as f:
        json.dump(meta, f, indent=2)


def noise2(seed, w, h, octaves=3, base=4):
    """Smooth value noise in [0,1], tileable."""
    rng = np.random.default_rng(seed)
    acc = np.zeros((h, w))
    amp_total = 0
    amp = 1.0
    cells = base
    for _ in range(octaves):
        grid = rng.random((cells, cells))
        ys = np.arange(h) * cells / h
        xs = np.arange(w) * cells / w
        y0 = np.floor(ys).astype(int)
        x0 = np.floor(xs).astype(int)
        fy = ys - y0
        fx = xs - x0
        fy = fy * fy * (3 - 2 * fy)
        fx = fx * fx * (3 - 2 * fx)
        y1 = (y0 + 1) % cells
        x1 = (x0 + 1) % cells
        g00 = grid[np.ix_(y0 % cells, x0 % cells)]
        g01 = grid[np.ix_(y0 % cells, x1)]
        g10 = grid[np.ix_(y1, x0 % cells)]
        g11 = grid[np.ix_(y1, x1)]
        top = g00 * (1 - fx)[None, :] + g01 * fx[None, :]
        bot = g10 * (1 - fx)[None, :] + g11 * fx[None, :]
        acc += amp * (top * (1 - fy)[:, None] + bot * fy[:, None])
        amp_total += amp
        amp *= 0.5
        cells *= 2
    return acc / amp_total


def upscale(img, factor):
    return np.repeat(np.repeat(img, factor, axis=0), factor, axis=1)


def contact_sheet(images, path, factor=8, cols=6, bg=(40, 44, 52, 255)):
    tiles = [upscale(i, factor) for i in images]
    th = max(t.shape[0] for t in tiles)
    tw = max(t.shape[1] for t in tiles)
    rows = (len(tiles) + cols - 1) // cols
    sheet = np.zeros((rows * (th + 8) + 8, cols * (tw + 8) + 8, 4), dtype=np.uint8)
    sheet[:, :] = bg
    for i, t in enumerate(tiles):
        r, c = divmod(i, cols)
        y, x = 8 + r * (th + 8), 8 + c * (tw + 8)
        region = sheet[y:y + t.shape[0], x:x + t.shape[1]].astype(float)
        a = t[:, :, 3:4].astype(float) / 255.0
        region[:, :, :3] = region[:, :, :3] * (1 - a) + t[:, :, :3] * a
        sheet[y:y + t.shape[0], x:x + t.shape[1]] = region.astype(np.uint8)
    Image.fromarray(sheet, 'RGBA').save(path)


random_state = random.Random(1337)
