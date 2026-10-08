"""Texture generators the content pipeline needs that gen.textures (owned by another team) may not provide (yet).

common.render_tex looks a generator up in gen.textures first and falls back to this module, so everything here
is a safety net: clean 16x16 pixel art with the same calling conventions (palette lists dark -> light, seed str).
"""
from __future__ import annotations

import math

import numpy as np
from PIL import Image

from gen.noise import fbm, rng

S = 16


def _rgb(c):
    h = c.strip().lstrip("#")
    if len(h) == 3:
        h = "".join(ch * 2 for ch in h)
    if len(h) == 6:
        h += "ff"
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4, 6)], float)


def _pal(p, n):
    """Resample palette p (list of hex) to n colours (dark -> light)."""
    cols = [_rgb(c) for c in p] if p else [_rgb("#808080")]
    if len(cols) == 1:
        cols = [cols[0] * 0.6, cols[0], np.minimum(cols[0] * 1.3, 255)]
    out = []
    for i in range(n):
        t = i / max(1, n - 1) * (len(cols) - 1)
        a = int(math.floor(t))
        b = min(a + 1, len(cols) - 1)
        f = t - a
        c = cols[a] * (1 - f) + cols[b] * f
        c[3] = 255
        out.append(c)
    return out


def _img(a):
    return Image.fromarray(np.clip(np.round(a), 0, 255).astype(np.uint8), "RGBA")


def pulse_frames(img, frames, amount=0.18):
    """Turn a static texture into a softly pulsing animation (brightness wave + subtle shimmer)."""
    base = np.asarray(img.convert("RGBA"), float)
    h, w = base.shape[:2]
    out = []
    yy, xx = np.mgrid[0:h, 0:w]
    for i in range(frames):
        ph = 2 * math.pi * i / frames
        wave = 1.0 + amount * np.sin(ph + (xx + yy) * 0.35)
        a = base.copy()
        a[..., :3] = np.clip(a[..., :3] * wave[..., None], 0, 255)
        out.append(_img(a))
    return out


def _outline(mask):
    """Pixels just outside mask (4-neighbourhood)."""
    m = mask.astype(bool)
    o = np.zeros_like(m)
    o[1:, :] |= m[:-1, :]
    o[:-1, :] |= m[1:, :]
    o[:, 1:] |= m[:, :-1]
    o[:, :-1] |= m[:, 1:]
    return o & ~m


def _shade_mask(mask, cols, seed, light=(-1, -1)):
    """Shade a filled mask with a palette using distance-to-edge + light direction + noise."""
    h, w = mask.shape
    yy, xx = np.mgrid[0:h, 0:w]
    ys, xs = np.nonzero(mask)
    if len(xs) == 0:
        return np.zeros((h, w, 4))
    cx, cy = xs.mean(), ys.mean()
    rx = max(1.0, (xs.max() - xs.min()) / 2 + 0.5)
    ry = max(1.0, (ys.max() - ys.min()) / 2 + 0.5)
    nx = (xx - cx) / rx
    ny = (yy - cy) / ry
    lit = -(nx * light[0] + ny * light[1]) * 0.5 + 0.5 - 0.35 * (nx * nx + ny * ny)
    n = fbm(w, h, 4, seed + ":sh", octaves=2) - 0.5
    t = np.clip(lit + n * 0.35, 0, 1)
    idx = np.clip((t * len(cols)).astype(int), 0, len(cols) - 1)
    out = np.zeros((h, w, 4))
    for i, c in enumerate(cols):
        out[(idx == i) & mask] = c
    return out


def _finish(fill, mask, outline_col):
    out = fill.copy()
    ol = _outline(mask)
    out[ol] = outline_col
    out[~(mask | ol)] = 0
    return _img(out)


def _ellipse(cx, cy, rx, ry):
    yy, xx = np.mgrid[0:S, 0:S]
    return ((xx + 0.5 - cx) / rx) ** 2 + ((yy + 0.5 - cy) / ry) ** 2 <= 1.0


def _poly(pts):
    yy, xx = np.mgrid[0:S, 0:S]
    px, py = xx + 0.5, yy + 0.5
    inside = np.zeros((S, S), bool)
    n = len(pts)
    for i in range(n):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % n]
        cond = ((y1 > py) != (y2 > py)) & (px < (x2 - x1) * (py - y1) / ((y2 - y1) + 1e-9) + x1)
        inside ^= cond
    return inside


def _line(x0, y0, x1, y1, width=1.0):
    yy, xx = np.mgrid[0:S, 0:S]
    px, py = xx + 0.5, yy + 0.5
    dx, dy = x1 - x0, y1 - y0
    L2 = dx * dx + dy * dy + 1e-9
    t = np.clip(((px - x0) * dx + (py - y0) * dy) / L2, 0, 1)
    d = np.hypot(px - (x0 + t * dx), py - (y0 + t * dy))
    return d <= width / 2 + 0.25


_SHAPES = {}


def _shape(name):
    def deco(f):
        _SHAPES[name] = f
        return f
    return deco


@_shape("gem")
def _gem(r):
    return _poly([(8, 1.5), (14, 6), (8, 14.5), (2, 6)])


@_shape("crystal")
def _crystal(r):
    return _poly([(9, 1), (12, 4), (10, 15), (6, 15), (4, 5)])


@_shape("shard")
def _shard(r):
    return _poly([(11, 1), (13, 3), (7, 15), (4, 13)])


@_shape("orb")
def _orb(r):
    return _ellipse(8, 8.5, 5.6, 5.6)


@_shape("pearl")
def _pearl(r):
    return _ellipse(8, 8.5, 5, 5)


@_shape("egg")
def _egg(r):
    yy, xx = np.mgrid[0:S, 0:S]
    y = (yy + 0.5 - 8.5)
    rx = 4.6 - 0.12 * (y)  # wider at the bottom
    return ((xx + 0.5 - 8) / np.maximum(rx, 1)) ** 2 + (y / 6.4) ** 2 <= 1.0


@_shape("spore")
def _spore(r):
    m = _ellipse(8, 8.5, 4.5, 4.5)
    for a in range(8):
        ang = a * math.pi / 4 + 0.3
        m |= _line(8, 8.5, 8 + math.cos(ang) * 7, 8.5 + math.sin(ang) * 7, 1.0) & _ellipse(8, 8.5, 7.2, 7.2)
    return m


@_shape("mushroom")
def _mushroom(r):
    cap = _ellipse(8, 7, 6.5, 4.5) & (np.mgrid[0:S, 0:S][0] < 9)
    stem = _poly([(6.5, 8), (9.5, 8), (10, 14.5), (6, 14.5)])
    return cap | stem


@_shape("fruit")
def _fruit(r):
    return _ellipse(8, 9, 5.6, 5.4) | _line(8, 2, 9, 5, 1.2)


@_shape("berry")
def _berry(r):
    return _ellipse(6, 10, 3.2, 3.2) | _ellipse(10.5, 9, 3.2, 3.2) | _ellipse(8, 5.5, 3, 3)


@_shape("meat")
def _meat(r):
    return _ellipse(9, 7.5, 5.5, 4.5) | _line(3, 13, 7, 9, 2.2)


@_shape("bone")
def _bone(r):
    return (_line(4, 12, 12, 4, 2.4) | _ellipse(3.5, 11, 1.8, 1.8) | _ellipse(5, 12.8, 1.8, 1.8)
            | _ellipse(11, 3.2, 1.8, 1.8) | _ellipse(12.8, 5, 1.8, 1.8))


@_shape("fang")
def _fang(r):
    return _poly([(4, 2), (12, 2), (9, 15), (8, 15)])


@_shape("claw")
def _claw(r):
    yy, xx = np.mgrid[0:S, 0:S]
    d = np.hypot(xx + 0.5 - 2, yy + 0.5 - 14)
    return (d > 7) & (d < 12.5) & (xx > 1) & (yy < 14) & (xx + yy > 9)


@_shape("horn")
def _horn(r):
    return _poly([(3, 14), (7, 14), (13, 2), (11, 2), (5, 10)])


@_shape("scale")
def _scale(r):
    return _ellipse(8, 7, 6, 6.5) & (np.mgrid[0:S, 0:S][0] < 14)


@_shape("feather")
def _feather(r):
    return _poly([(12, 1), (14, 3), (6, 12), (4, 10)]) | _line(3, 14, 6, 11, 1.0)


@_shape("leaf")
def _leaf(r):
    return _poly([(13, 2), (12, 9), (6, 13), (3, 13), (4, 8), (9, 3)])


@_shape("seed")
def _seed(r):
    return _ellipse(8, 8.5, 3.6, 5.6)


@_shape("goo")
def _goo(r):
    return _ellipse(8, 10, 6, 4.5) | _ellipse(8, 6.5, 3.5, 3.5)


@_shape("dust")
def _dust(r):
    m = np.zeros((S, S), bool)
    for i in range(9):
        x, y = 3 + r.random() * 10, 4 + r.random() * 9
        m |= _ellipse(x, y, 1.3 + r.random() * 1.4, 1.2 + r.random() * 1.2)
    return m


@_shape("ingot")
def _ingot(r):
    return _poly([(2, 10), (5, 5), (14, 5), (14, 7), (11, 12), (2, 12)])


@_shape("coin")
def _coin(r):
    return _ellipse(8, 8.5, 6, 6)


@_shape("eye")
def _eye(r):
    return _ellipse(8, 8.5, 6.2, 6.2)


@_shape("slab")
def _slab(r):
    return _poly([(2, 6), (14, 4), (14, 11), (2, 13)])


@_shape("chunk")
def _chunk(r):
    return _poly([(3, 6), (8, 2), (13, 5), (13, 11), (8, 14), (3, 11)])


@_shape("vial")
def _vial(r):
    return _ellipse(8, 10.5, 4.5, 4.5) | _poly([(6.5, 2), (9.5, 2), (9.5, 7), (6.5, 7)])


@_shape("candy")
def _candy(r):
    return _ellipse(8, 8, 4, 4) | _poly([(1, 5), (5, 7), (5, 9), (1, 11)]) | _poly([(15, 5), (11, 7), (11, 9), (15, 11)])


@_shape("gear")
def _gear(r):
    yy, xx = np.mgrid[0:S, 0:S]
    a = np.arctan2(yy + 0.5 - 8, xx + 0.5 - 8)
    d = np.hypot(yy + 0.5 - 8, xx + 0.5 - 8)
    rad = 5.2 + 1.6 * (np.cos(a * 8) > 0.2)
    return (d <= rad) & (d > 1.6)


@_shape("tentacle")
def _tentacle(r):
    m = np.zeros((S, S), bool)
    for i in range(12):
        t = i / 11
        x = 4 + t * 8 + math.sin(t * 6) * 2
        y = 14 - t * 12
        m |= _ellipse(x, y, 2.2 - t * 1.4, 2.2 - t * 1.4)
    return m


def item_icon(kind, pal, seed, **_):
    """Fallback item icon: a shaded silhouette chosen by ``kind`` with a dark outline and a highlight."""
    r = rng(f"icon:{kind}:{seed}")
    f = _SHAPES.get(kind)
    if f is None:
        keys = sorted(_SHAPES)
        f = _SHAPES[keys[sum(map(ord, kind)) % len(keys)]]
    mask = f(r)
    cols = _pal(pal, 5)
    fill = _shade_mask(mask, cols[1:], f"{kind}:{seed}")
    # highlight sparkle
    ys, xs = np.nonzero(mask)
    if len(xs):
        hx, hy = int(xs.min() + (xs.max() - xs.min()) * 0.3), int(ys.min() + (ys.max() - ys.min()) * 0.3)
        if mask[hy, hx]:
            fill[hy, hx] = np.minimum(cols[-1] * 1.15 + 20, 255)
            fill[hy, hx][3] = 255
    if kind == "eye" and len(xs):
        pupil = _ellipse(8, 8.5, 2.2, 2.6)
        fill[pupil & mask] = _rgb("#101010")
    if kind in ("spore", "berry", "mushroom") and len(xs):
        for _ in range(3):
            x, y = int(r.integers(4, 12)), int(r.integers(3, 8))
            if mask[y, x]:
                fill[y, x] = np.minimum(cols[-1] + 40, 255)
    outline = cols[0] * 0.55
    outline[3] = 255
    return _finish(fill, mask, outline)


def spawn_egg(base_hex, spot_hex, seed, **_):
    """Fallback spawn egg: vanilla-like egg with spots."""
    r = rng(f"egg:{seed}")
    mask = _egg(r)
    base = _rgb(base_hex)
    cols = [base * 0.62, base * 0.8, base, np.minimum(base * 1.18 + 12, 255)]
    for c in cols:
        c[3] = 255
    fill = _shade_mask(mask, cols, f"egg:{seed}")
    spot = _rgb(spot_hex)
    for _ in range(6):
        x, y = r.random() * 8 + 4, r.random() * 9 + 4
        m = _ellipse(x, y, 1.1 + r.random(), 1.0 + r.random() * 0.8) & mask
        fill[m] = spot
    outline = base * 0.4
    outline[3] = 255
    return _finish(fill, mask, outline)


def flat(hex_color, seed="", noise=0.06):
    """Almost flat colour block (UI-ish worlds like the White Room)."""
    c = _rgb(hex_color)
    n = (fbm(S, S, 4, f"flat:{seed}", octaves=2) - 0.5) * 2 * noise
    a = np.zeros((S, S, 4))
    a[..., :3] = np.clip(c[:3] * (1 + n[..., None]), 0, 255)
    a[..., 3] = 255
    return _img(a)


def noise_block(pal, seed, cell=4):
    """Generic quantized-noise block face (fallback for anything missing)."""
    cols = _pal(pal, 5)
    n = fbm(S, S, cell, f"nb:{seed}", octaves=3)
    n = (n - n.min()) / max(1e-6, n.max() - n.min())
    idx = np.clip((n * len(cols)).astype(int), 0, len(cols) - 1)
    a = np.zeros((S, S, 4))
    for i, c in enumerate(cols):
        a[idx == i] = c
    return _img(a)
