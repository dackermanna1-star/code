"""Procedural 16x16 pixel-art texture library (vanilla Minecraft style).

Every generator takes a ``seed`` string (all randomness is derived from it via
``gen.noise.rng`` so output is deterministic across runs) and returns a
``PIL.Image`` in RGBA mode.

Palettes are lists of hex strings ordered dark -> light, e.g.
``["#2b1d14", "#4a3222", "#6b4a33", "#8c6447"]``.  Any 3..8 colour palette
works: generators resample it to the number of shades they need (picking
colours from the palette when it is long enough, interpolating otherwise) and
quantize to that limited set, so the result stays crisp and pixel-arty.

Sections:
  * helpers           pal, shift, tint, save, animated, save_animated
  * full block faces  tileable (noise wraps around the edges)
  * plant sprites     16x16 transparent, bottom anchored like vanilla flowers
  * item icons        16x16 transparent with a 1px darker outline
  * portal gun parts  textures for the 3D JSON gun model
"""
from __future__ import annotations

import colorsys
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image

from .noise import rng

S = 16

# =========================================================================
#  colour helpers
# =========================================================================


def _rgb(c):
    """Hex string / tuple -> float array (r, g, b, a) in 0..255."""
    if isinstance(c, str):
        h = c.strip().lstrip("#")
        if len(h) in (3, 4):
            h = "".join(ch * 2 for ch in h)
        if len(h) == 6:
            h += "ff"
        if len(h) != 8:
            raise ValueError(f"bad colour {c!r}")
        return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4, 6)], float)
    a = np.array(c, float).ravel()
    if a.size == 3:
        a = np.append(a, 255.0)
    return a


def _hex(c):
    a = np.clip(np.round(np.asarray(c, float)), 0, 255).astype(int)
    s = "#%02x%02x%02x" % tuple(int(v) for v in a[:3])
    if a.size > 3 and a[3] != 255:
        s += "%02x" % int(a[3])
    return s


def _is_num(v):
    return isinstance(v, (int, float, np.integer, np.floating))


def pal(*colors):
    """Build a palette (list of '#rrggbb' strings).

    ``pal("#111", "#555", "#999")`` or ``pal(["#111", "#555"])``; tuples work too.
    """
    if len(colors) == 1 and isinstance(colors[0], (list, tuple)) and colors[0] \
            and not _is_num(colors[0][0]):
        colors = tuple(colors[0])
    return [_hex(_rgb(c)) for c in colors]


_palette = pal  # alias usable inside functions whose parameter is called `pal`


def _hsv(c):
    c = np.asarray(c, float)
    return colorsys.rgb_to_hsv(*(np.clip(c[:3], 0, 255) / 255.0))


def _from_hsv(h, s, v):
    return np.array(colorsys.hsv_to_rgb(h % 1.0, min(1, max(0, s)), min(1, max(0, v)))) * 255.0


def _adj(c, dh=0.0, ds=1.0, dv=1.0, add_s=0.0):
    h, s, v = _hsv(c)
    return _from_hsv(h + dh / 360.0, s * ds + add_s, v * dv)


def shift(palette, hue_deg=0, sat=1, val=1):
    """Return a new palette with hue rotated by ``hue_deg`` and S/V scaled."""
    out = []
    for c in _palette(palette):
        rgba = _rgb(c)
        rgb = _adj(rgba, hue_deg, sat, val)
        out.append(_hex(np.append(rgb, rgba[3])))
    return out


def _hue_toward(h, target, amt):
    d = ((target - h + 0.5) % 1.0) - 0.5
    return (h + d * amt) % 1.0


def _darker(c, k=0.6, hue=0.06):
    """Darker shade with a slight hue shift toward blue/purple (pixel-art style)."""
    h, s, v = _hsv(c)
    if s > 0.08:
        h = _hue_toward(h, 0.70, hue)
    return _from_hsv(h, min(1.0, s * 1.08 + 0.06 * (1 - k)), v * k)


def _lighter(c, k=0.35, hue=0.05):
    """Lighter shade with a slight hue shift toward yellow, blended toward white."""
    h, s, v = _hsv(c)
    if s > 0.08:
        h = _hue_toward(h, 0.15, hue)
    base = _from_hsv(h, s * (1 - 0.6 * k), min(1.0, v + (1 - v) * k + 0.08 * k))
    return base


def _mix(a, b, t):
    a = np.asarray(a, float)
    b = np.asarray(b, float)
    n = min(a.shape[-1], b.shape[-1])
    return a[..., :n] * (1 - t) + b[..., :n] * t


def _ramp(p, n, lo=0.0, hi=1.0):
    """Resample palette ``p`` to ``n`` RGB shades (n, 3) dark->light.

    ``lo``/``hi`` select a sub-range of the palette (0 = darkest, 1 = lightest) for
    low-contrast materials.  Palette colours are picked directly when there are
    enough of them in range, otherwise neighbours are interpolated.
    """
    cols = np.array([_rgb(c)[:3] for c in _palette(p)], float)
    m = len(cols)
    if m == 0:
        raise ValueError("empty palette")
    if m == 1:
        return _color_ramp(cols[0], n)
    t = (lo + np.linspace(0, 1, n) * (hi - lo)) * (m - 1)
    picks = np.round(t).astype(int)
    if len(np.unique(picks)) == n and np.all(np.abs(picks - t) <= 0.5 + 1e-9):
        return cols[picks]
    i0 = np.clip(np.floor(t).astype(int), 0, m - 1)
    i1 = np.minimum(i0 + 1, m - 1)
    f = (t - i0)[:, None]
    return cols[i0] * (1 - f) + cols[i1] * f


def _xramp(p, n, dark=0, light=0, lo=0.0, hi=1.0):
    """Ramp with extra extrapolated darker / lighter shades on either end."""
    r = list(_ramp(p, n, lo, hi))
    for i in range(dark):
        r.insert(0, _darker(r[0], 0.72))
    for i in range(light):
        r.append(_lighter(r[-1], 0.38))
    return np.array(r)


def _color_ramp(c, n=6, spread=1.0):
    """Ramp of ``n`` shades built around a single colour (it sits at ~60%)."""
    c = _rgb(c)[:3]
    out = []
    mid = round((n - 1) * 0.6)
    for i in range(n):
        if i < mid:
            k = 1 - spread * 0.17 * (mid - i)
            out.append(_darker(c, max(0.15, k), hue=0.04 * (mid - i) * spread))
        elif i == mid:
            out.append(c.copy())
        else:
            out.append(_lighter(c, min(0.9, spread * 0.22 * (i - mid)), hue=0.03 * (i - mid) * spread))
    return np.array(out)


def _lum(c):
    c = np.asarray(c, float)
    return 0.299 * c[..., 0] + 0.587 * c[..., 1] + 0.114 * c[..., 2]


# =========================================================================
#  public helpers
# =========================================================================


def tint(img, hex, amount=0.5):
    """Colourise ``img`` toward ``hex`` (luminance-preserving), keeping alpha."""
    a = np.asarray(img.convert("RGBA"), float).copy()
    col = _rgb(hex)[:3]
    lum = _lum(a[..., :3])[..., None]
    target = lum / max(1.0, _lum(col)) * col
    a[..., :3] = a[..., :3] * (1 - amount) + np.clip(target, 0, 255) * amount
    return _img(a)


def save(img, path):
    """Save ``img`` to ``path`` creating parent directories."""
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    img.save(p)
    return p


def animated(frames, frametime=2, interpolate=True):
    """Stack frames into a vertical strip; returns (strip, mcmeta_dict)."""
    w, h = frames[0].size
    strip = Image.new("RGBA", (w, h * len(frames)), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        strip.paste(f.convert("RGBA"), (0, i * h))
    return strip, {"animation": {"frametime": int(frametime), "interpolate": bool(interpolate)}}


def save_animated(frames, path, frametime=2, interpolate=True):
    """Write ``path`` (strip png) and ``path + '.mcmeta'``."""
    strip, meta = animated(frames, frametime, interpolate)
    p = save(strip, path)
    Path(str(p) + ".mcmeta").write_text(json.dumps(meta, indent=2) + "\n")
    return p


# =========================================================================
#  array / noise utilities
# =========================================================================


def _img(arr):
    a = np.clip(np.round(np.asarray(arr, float)), 0, 255).astype(np.uint8)
    if a.shape[-1] == 3:
        a = np.concatenate([a, np.full(a.shape[:2] + (1,), 255, np.uint8)], -1)
    return Image.fromarray(a, "RGBA")


def _arr(img):
    return np.asarray(img.convert("RGBA"), float).copy()


def _render(idx, colors, alpha=None):
    """Index map (-1 = transparent) + colour table -> RGBA image."""
    idx = np.asarray(idx)
    cols = np.asarray(colors, float)
    ci = np.clip(idx, 0, len(cols) - 1)
    out = np.zeros(idx.shape + (4,), float)
    out[..., :3] = cols[ci][..., :3]
    if cols.shape[1] > 3:
        out[..., 3] = cols[ci][..., 3]
    else:
        out[..., 3] = 255
    if alpha is not None:
        out[..., 3] = alpha
    out[idx < 0] = 0
    return _img(out)


def _R(seed, tag=""):
    return rng(f"{seed}:{tag}")


def _white(seed, size=(S, S)):
    return rng(seed).random((size[1], size[0]))


def _vn(cx, cy, seed, size=(S, S), offset=True):
    """Tileable value noise with (possibly anisotropic) cell size cx x cy."""
    w, h = size
    gw = max(1, int(round(w / max(1, cx))))
    gh = max(1, int(round(h / max(1, cy))))
    r = rng(seed)
    grid = r.random((gh, gw))
    ox = r.random() * (w / gw) if offset else 0.0
    oy = r.random() * (h / gh) if offset else 0.0
    xs = (np.arange(w) + ox) / (w / gw)
    ys = (np.arange(h) + oy) / (h / gh)
    x0 = np.floor(xs).astype(int)
    y0 = np.floor(ys).astype(int)
    fx = xs - x0
    fy = ys - y0
    fx = fx * fx * (3 - 2 * fx)
    fy = fy * fy * (3 - 2 * fy)
    x1 = (x0 + 1) % gw
    y1 = (y0 + 1) % gh
    x0 %= gw
    y0 %= gh
    a = grid[np.ix_(y0, x0)]
    b = grid[np.ix_(y0, x1)]
    c = grid[np.ix_(y1, x0)]
    d = grid[np.ix_(y1, x1)]
    top = a + (b - a) * fx[None, :]
    bot = c + (d - c) * fx[None, :]
    return top + (bot - top) * fy[:, None]


def _fbm2(cx, cy, seed, octaves=3, pers=0.5, size=(S, S)):
    tot = np.zeros((size[1], size[0]))
    amp, norm = 1.0, 0.0
    for o in range(octaves):
        tot += _vn(max(1, cx / 2 ** o), max(1, cy / 2 ** o), f"{seed}:{o}", size) * amp
        norm += amp
        amp *= pers
    return tot / norm


def _norm(f):
    f = np.asarray(f, float)
    lo, hi = f.min(), f.max()
    return (f - lo) / (hi - lo) if hi > lo else np.zeros_like(f)


def _levels(field, weights, mask=None):
    """Rank-quantize ``field`` into len(weights) levels with those proportions."""
    w = np.asarray(weights, float)
    w = w / w.sum()
    cuts = np.cumsum(w)[:-1]
    field = np.asarray(field, float)
    out = np.full(field.shape, -1, int)
    sel = np.ones(field.shape, bool) if mask is None else np.asarray(mask, bool)
    vals = field[sel]
    if vals.size == 0:
        return out
    order = np.argsort(vals, kind="stable")
    ranks = np.empty(vals.size, int)
    ranks[order] = np.arange(vals.size)
    q = (ranks + 0.5) / vals.size
    out[sel] = np.searchsorted(cuts, q)
    return out


def _quant(t, n):
    """Threshold-quantize t in [0,1] to 0..n-1."""
    return np.clip(np.floor(np.asarray(t, float) * n), 0, n - 1).astype(int)


def _roll(a, dy, dx):
    return np.roll(a, (dy, dx), (0, 1))


def _cells(gx, gy, seed, jitter=0.8, size=(S, S), extra=0, aspect=1.0):
    """Tileable jittered-grid Voronoi. Returns dict(ids, d1, d2, dx, dy, pts)."""
    w, h = size
    r = rng(seed)
    pts = []
    for j in range(gy):
        for i in range(gx):
            pts.append([(i + 0.5 + (r.random() - 0.5) * jitter) * w / gx,
                        (j + 0.5 + (r.random() - 0.5) * jitter) * h / gy])
    for _ in range(extra):
        pts.append([r.random() * w, r.random() * h])
    pts = np.array(pts)
    yy, xx = np.mgrid[0:h, 0:w] + 0.5
    dx = (xx[None] - pts[:, 0, None, None] + w / 2) % w - w / 2
    dy = (yy[None] - pts[:, 1, None, None] + h / 2) % h - h / 2
    d = np.hypot(dx, dy * aspect)
    order = np.argsort(d, axis=0, kind="stable")
    take = lambda arr, k: np.take_along_axis(arr, order[k:k + 1], 0)[0]  # noqa: E731
    return dict(ids=order[0], d1=take(d, 0), d2=take(d, 1), dx=take(dx, 0), dy=take(dy, 0),
                pts=pts, n=len(pts), id2=order[1])


def _edges(ids):
    """Booleans: neighbour above / left / below / right belongs to another region (wrapping)."""
    up = ids != _roll(ids, 1, 0)
    left = ids != _roll(ids, 0, 1)
    down = ids != _roll(ids, -1, 0)
    right = ids != _roll(ids, 0, -1)
    return up, left, down, right


def _wput(idx, x, y, v):
    idx[int(y) % idx.shape[0], int(x) % idx.shape[1]] = v


def _line_pts(x0, y0, x1, y1):
    """Bresenham line points (inclusive)."""
    x0, y0, x1, y1 = int(round(x0)), int(round(y0)), int(round(x1)), int(round(y1))
    pts = []
    dx, dy = abs(x1 - x0), -abs(y1 - y0)
    sx = 1 if x0 < x1 else -1
    sy = 1 if y0 < y1 else -1
    err = dx + dy
    while True:
        pts.append((x0, y0))
        if x0 == x1 and y0 == y1:
            break
        e2 = 2 * err
        if e2 >= dy:
            err += dy
            x0 += sx
        if e2 <= dx:
            err += dx
            y0 += sy
    return pts


def _disc_pts(cx, cy, r):
    pts = []
    for y in range(int(math.floor(cy - r)) - 1, int(math.ceil(cy + r)) + 2):
        for x in range(int(math.floor(cx - r)) - 1, int(math.ceil(cx + r)) + 2):
            if (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r:
                pts.append((x, y))
    return pts


def _grid():
    yy, xx = np.mgrid[0:S, 0:S]
    return xx, yy


def _bevel(idx, ids, up=1, down=-1, lo=0, hi=None):
    """Lighten pixels on the top/left edge of regions and darken bottom/right ones."""
    eu, el, ed, er = _edges(ids)
    out = idx.copy()
    out = np.where(eu | el, out + up, out)
    out = np.where((ed | er) & ~(eu | el), out + down, out)
    return np.clip(out, lo, hi if hi is not None else out.max())


# =========================================================================
#  full block faces (tileable)
# =========================================================================


def stone(pal, seed, flecks=True):
    """Vanilla-like stone: soft clumpy greys with a few short dark/light streaks."""
    r = _ramp(pal, 5)
    f = 0.55 * _fbm2(8, 4, seed + ":a", 2) + 0.25 * _vn(4, 2, seed + ":b") + 0.4 * _white(seed + ":w")
    idx = _levels(f, [0.04, 0.17, 0.5, 0.22, 0.07])
    if flecks:
        R = _R(seed, "fl")
        for _ in range(int(R.integers(2, 4))):
            x, y = (int(v) for v in R.integers(0, S, 2))
            ln = int(R.integers(2, 4))
            for k in range(ln):
                _wput(idx, x + k, y, 1 if k == ln - 1 else 0)
            _wput(idx, x + 1, y + 1, 3)
    return _render(idx, r)


def rough_stone(pal, seed):
    """Cobblestone-like chunks with dark 1px joints and bevelled top-left edges."""
    r = _xramp(pal, 5, dark=1)  # 6 shades, 0 = joint
    c = _cells(3, 3, seed, jitter=0.9, extra=2)
    R = _R(seed, "c")
    base = R.choice([2, 2, 3, 3, 4], c["n"])
    idx = _chunky(c["ids"], base, _white(seed + ":n"))
    return _render(idx, r)


def dirt(pal, seed):
    """Vanilla dirt: brown speckle with small clumps, a few pebbles."""
    r = _ramp(pal, 5)
    f = 0.45 * _vn(4, 4, seed + ":a") + 0.2 * _vn(2, 2, seed + ":b") + 0.45 * _white(seed + ":w")
    idx = _levels(f, [0.1, 0.25, 0.35, 0.22, 0.08])
    R = _R(seed, "p")
    for _ in range(int(R.integers(2, 4))):
        x, y = (int(v) for v in R.integers(0, S, 2))
        _wput(idx, x, y, 4)
        _wput(idx, x + 1, y, 3)
        _wput(idx, x, y + 1, 1)
        _wput(idx, x + 1, y + 1, 0)
    return _render(idx, r)


def sand(pal, seed):
    """Fine speckled sand: two main shades with sparse light/dark grains."""
    r = _ramp(pal, 5)
    f = 0.25 * _vn(4, 4, seed + ":a") + 0.75 * _white(seed + ":w")
    idx = _levels(f, [0.04, 0.2, 0.46, 0.24, 0.06])
    return _render(idx, r)


def gravel(pal, seed):
    """Loose pebbles of varied shade, each with a highlight and a dark rim."""
    r = _xramp(pal, 5, dark=1)
    c = _cells(4, 4, seed, jitter=1.0, extra=2)
    R = _R(seed, "g")
    base = R.choice([1, 2, 2, 3, 3, 4], c["n"])
    ids = c["ids"]
    eu, el, ed, er = _edges(ids)
    n = _white(seed + ":n")
    idx = base[ids].copy()
    idx = np.where(n > 0.85, idx + 1, idx)
    idx = np.where(eu | el, idx + 1, idx)
    idx = np.where(eu & el, idx + 1, idx)
    idx = np.clip(idx, 1, 5)
    joint = ed | er
    idx = np.where(joint, np.maximum(base[ids] - 2, 0), idx)
    idx = np.where(ed & er, 0, idx)
    return _render(idx, r)


def grass_top(pal, seed):
    """Grass block top coloured directly: dense green speckle with soft clumps."""
    r = _ramp(pal, 5)
    f = 0.35 * _vn(4, 4, seed + ":a") + 0.15 * _vn(2, 2, seed + ":b") + 0.6 * _white(seed + ":w")
    idx = _levels(f, [0.08, 0.24, 0.36, 0.22, 0.1])
    # short blade strokes: a light pixel above a dark one
    R = _R(seed, "bl")
    for _ in range(10):
        x, y = (int(v) for v in R.integers(0, S, 2))
        _wput(idx, x, y, 4)
        _wput(idx, x, y + 1, 1)
    return _render(idx, r)


def _fringe_depths(seed, lo=2, hi=4, w=S):
    R = _R(seed, "fringe")
    d = np.zeros(w, int)
    cur = int(R.integers(lo, hi + 1))
    for x in range(w):
        step = R.choice([-1, 0, 0, 1, 1, -1, 2, -2])
        cur = int(np.clip(cur + step, lo, hi))
        d[x] = cur
    # occasional single-pixel drip, vanilla style
    for _ in range(2):
        x = int(R.integers(0, w))
        d[x] = min(hi + 1, d[x] + 1)
    # make it wrap smoothly
    if abs(d[0] - d[-1]) > 1:
        d[-1] = (d[0] + d[-2]) // 2
    return d


def grass_side(top_pal, soil_pal, seed):
    """Soil with a jagged overhanging grass fringe (2-4px) along the top."""
    soil = _arr(dirt(soil_pal, seed + ":soil"))
    top = _ramp(top_pal, 5)
    d = _fringe_depths(seed)
    f = 0.5 * _white(seed + ":gw") + 0.5 * _vn(4, 2, seed + ":ga")
    gi = _levels(f, [0.15, 0.3, 0.35, 0.2])  # 0..3 -> shades 1..4
    out = soil.copy()
    for x in range(S):
        for y in range(d[x]):
            k = gi[y, x] + 1
            if y == d[x] - 1:
                k = min(k, 1) if (x + y) % 2 == 0 else max(0, k - 2)
            out[y, x, :3] = top[k]
        # soft shadow on the soil right under the fringe
        y = d[x]
        if y < S:
            out[y, x, :3] = _mix(out[y, x, :3], top[0] * 0.55, 0.45)
    return _img(out)


def moss(pal, seed):
    """Clumpy moss: lighter tufts with dark gaps."""
    r = _ramp(pal, 5)
    c = _cells(4, 4, seed + ":c", jitter=1.0)
    bump = 1 - np.clip(c["d1"] / 3.2, 0, 1)
    f = 0.45 * bump + 0.3 * _vn(4, 4, seed + ":a") + 0.35 * _white(seed + ":w")
    f += 0.18 * np.clip((-c["dx"] - c["dy"]) / 3, -1, 1)
    idx = _levels(f, [0.1, 0.2, 0.32, 0.26, 0.12])
    return _render(idx, r)


def snow(pal, seed):
    """Bright snow: mostly light shades with faint cool specks."""
    r = _ramp(pal, 4)
    f = 0.45 * _vn(4, 4, seed + ":a") + 0.55 * _white(seed + ":w")
    idx = _levels(f, [0.04, 0.16, 0.42, 0.38])
    return _render(idx, r)


def ash(pal, seed):
    """Powdery grey ash with darker flakes and pale drifts."""
    r = _ramp(pal, 5)
    f = 0.45 * _fbm2(8, 8, seed + ":a", 2) + 0.55 * _white(seed + ":w")
    idx = _levels(f, [0.06, 0.2, 0.4, 0.26, 0.08])
    R = _R(seed, "fl")
    for _ in range(4):
        x, y = (int(v) for v in R.integers(0, S, 2))
        _wput(idx, x, y, 0)
        _wput(idx, x + 1, y, 1)
    return _render(idx, r)


def log_side(pal, seed):
    """Bark with vertical streaks / furrows (tileable both ways)."""
    r = _ramp(pal, 5)
    R = _R(seed, "cols")
    col = np.zeros(S)
    x = 0
    ridge = R.random()
    # per-column ridge/furrow profile
    while x < S:
        wdt = int(R.integers(2, 5))
        for k in range(wdt):
            if x + k < S:
                col[x + k] = ridge + (0.25 if k == 0 else 0) - (0.3 if k == wdt - 1 else 0)
        ridge = 0.55 + R.random() * 0.45 if ridge < 0.6 else R.random() * 0.5
        x += wdt
    f = 0.5 * col[None, :] + 0.35 * _vn(2, 8, seed + ":v") + 0.25 * _white(seed + ":w")
    idx = _levels(f, [0.12, 0.24, 0.32, 0.22, 0.1])
    # dark furrow lines that break occasionally
    for _ in range(3):
        x = int(R.integers(0, S))
        y = int(R.integers(0, S))
        ln = int(R.integers(4, 10))
        for k in range(ln):
            _wput(idx, x, y + k, 0)
    return _render(idx, r)


def log_top(bark_pal, ring_pal, seed):
    """Log end: concentric rings (square-ish, noisy) inside a bark border."""
    rr = _ramp(ring_pal, 4)
    br = _ramp(bark_pal, 4)
    xx, yy = _grid()
    dx, dy = xx - 7.5, yy - 7.5
    d = 0.55 * np.maximum(np.abs(dx), np.abs(dy)) + 0.45 * np.hypot(dx, dy)
    d = d + 0.9 * (_vn(4, 4, seed + ":w", offset=True) - 0.5)
    ring = np.floor(d / 1.75).astype(int)
    idx = np.where(ring % 2 == 0, 2, 1)
    idx = np.where((ring % 2 == 0) & (_white(seed + ":r") > 0.75), 3, idx)
    idx = np.where(d < 1.2, 0, idx)
    out = _render(idx, rr)
    a = _arr(out)
    # bark border: always 1px, sometimes 2px
    R = _R(seed, "b")
    for x in range(S):
        for y in range(S):
            e = min(x, y, S - 1 - x, S - 1 - y)
            if e == 0 or (e == 1 and R.random() < 0.28):
                k = int(R.integers(0, 4)) if e == 0 else int(R.integers(0, 2))
                a[y, x, :3] = br[k]
    return _img(a)


def planks(pal, seed):
    """Four 4px boards with grain, dark seams and staggered end joints."""
    r = _ramp(pal, 5)
    grain = 0.55 * _vn(8, 1, seed + ":g") + 0.25 * _vn(4, 1, seed + ":h") + 0.3 * _white(seed + ":w")
    idx = _levels(grain, [0.08, 0.3, 0.42, 0.2]) + 1  # 1..4
    xx, yy = _grid()
    R = _R(seed, "p")
    joints = [int(R.integers(0, S)) for _ in range(4)]
    joints[1] = (joints[0] + 8 + int(R.integers(-2, 3))) % S
    joints[3] = (joints[2] + 8 + int(R.integers(-2, 3))) % S
    for b in range(4):
        y0 = b * 4
        idx[y0 + 3, :] = 0
        idx[y0, :] = np.maximum(idx[y0, :], 2)
        j = joints[b]
        idx[y0:y0 + 3, j] = 0
        idx[y0:y0 + 3, (j + 1) % S] = np.minimum(idx[y0:y0 + 3, (j + 1) % S] + 1, 4)
    # a couple of grain knots
    for _ in range(2):
        b = int(R.integers(0, 4))
        x = int(R.integers(0, S))
        idx[b * 4 + 1, x] = 0
        idx[b * 4 + 1, (x + 1) % S] = 1
    return _render(idx, r)


def leaves(pal, seed, holes=0.25):
    """Leaf clusters with transparent cut-out holes (fraction ``holes``)."""
    r = _ramp(pal, 5)
    c = _cells(4, 4, seed + ":c", jitter=1.0, extra=2)
    sh = np.clip((-c["dx"] - c["dy"]) / 3.0, -1, 1)
    f = 0.45 * sh - 0.35 * np.clip(c["d1"] / 3, 0, 1) + 0.5 * _white(seed + ":w")
    idx = _levels(f, [0.12, 0.22, 0.32, 0.22, 0.12])
    eu, el, ed, er = _edges(c["ids"])
    idx = np.where(ed | er, np.maximum(idx - 1, 0), idx)
    if holes > 0:
        hf = 0.55 * np.clip(c["d1"] / 3.5, 0, 1) + 0.25 * (ed | er) + 0.45 * _white(seed + ":h")
        hm = _levels(hf, [1 - holes, holes]) == 1
        idx = np.where(hm, -1, idx)
    return _render(idx, r)


def mushroom_cap(pal, seed, spots_pal=None):
    """Mushroom block cap; ``spots_pal`` None -> pale spots derived from the palette,
    ``spots_pal=[]`` -> no spots (brown-mushroom style)."""
    r = _ramp(pal, 5)
    f = 0.5 * _vn(4, 4, seed + ":a") + 0.5 * _white(seed + ":w")
    idx = _levels(f, [0.08, 0.22, 0.42, 0.2, 0.08])
    out = _arr(_render(idx, r))
    if spots_pal is None:
        light = _rgb(_palette(pal)[-1])[:3]
        sp = np.array([_mix(light, [235, 228, 214], 0.55), _mix(light, [255, 252, 244], 0.8),
                       [255, 255, 255]])
    elif len(spots_pal) == 0:
        return _img(out)
    else:
        sp = _ramp(spots_pal, 3)
    R = _R(seed, "spots")
    # stratified spot placement so they spread evenly when tiled
    cells = [(i, j) for i in range(3) for j in range(3)]
    R.shuffle(cells)
    for (i, j) in cells[: int(R.integers(4, 6))]:
        cx = (i + 0.2 + R.random() * 0.6) * S / 3
        cy = (j + 0.2 + R.random() * 0.6) * S / 3
        rad = 1.3 + R.random() * 1.0
        for (x, y) in _disc_pts(cx, cy, rad):
            k = 1
            if (x + 0.5 - cx) + (y + 0.5 - cy) < -rad * 0.5:
                k = 2
            elif (x + 0.5 - cx) + (y + 0.5 - cy) > rad * 0.6:
                k = 0
            out[y % S, x % S, :3] = sp[k]
    return _img(out)


def mushroom_stem(pal, seed):
    """Pale stem: vertical fibres."""
    r = _ramp(pal, 4)
    f = 0.55 * _vn(1, 8, seed + ":v") + 0.25 * _vn(2, 4, seed + ":u") + 0.3 * _white(seed + ":w")
    idx = _levels(f, [0.1, 0.3, 0.4, 0.2])
    return _render(idx, r)


def crystal(pal, seed, shards=7):
    """Faceted crystal: overlapping diagonal shards with bright highlight edges."""
    r = _xramp(pal, 5, light=1)  # 6 shades, 5 = edge highlight
    xx, yy = _grid()
    X, Y = xx + 0.5, yy + 0.5
    f = 0.5 * _vn(4, 4, seed + ":bg") + 0.5 * _white(seed + ":w")
    idx = _levels(f, [0.5, 0.35, 0.15])  # background 0..2
    R = _R(seed, "s")
    for s in range(shards):
        cx, cy = R.random() * S, R.random() * S
        ang = math.radians(R.uniform(35, 65) if R.random() < 0.75 else R.uniform(110, 145))
        ux, uy = math.cos(ang), -math.sin(ang)  # axis pointing "up"
        vx, vy = -uy, ux
        length = R.uniform(9, 15)
        half_w = R.uniform(1.6, 2.6)
        for ox in (-S, 0, S):
            for oy in (-S, 0, S):
                dx, dy = X - (cx + ox), Y - (cy + oy)
                u = dx * ux + dy * uy
                v = dx * vx + dy * vy
                tip = length / 2
                wid = np.where(u > tip - half_w * 1.6, half_w * (tip - u) / (half_w * 1.6), half_w)
                inside = (u > -tip) & (u < tip) & (np.abs(v) < wid)
                face = np.where(v < -wid * 0.2, 3, np.where(v > wid * 0.35, 1, 2))
                face = np.where(v < -wid + 0.9, 4, face)  # lit edge
                face = np.where((u > tip - 1.6) & (v < 0.5), 5, face)  # bright tip
                face = np.where(np.abs(v + wid * 0.2) < 0.45, 5, face) if s % 3 == 0 else face
                idx = np.where(inside, face, idx)
    for _ in range(2):
        x, y = (int(v_) for v_ in R.integers(0, S, 2))
        _wput(idx, x, y, 5)
    return _render(np.clip(idx, 0, 5), r)


def glass(pal, seed, inner_alpha=44):
    """Mostly transparent pane with an opaque frame and a diagonal light streak."""
    r = _xramp(pal, 4, light=1)
    xx, yy = _grid()
    out = np.zeros((S, S, 4))
    out[..., :3] = r[2]
    out[..., 3] = inner_alpha
    edge = (xx == 0) | (yy == 0) | (xx == S - 1) | (yy == S - 1)
    R = _R(seed, "g")
    fr = np.where((xx == 0) | (yy == 0), 3, 1)
    fr = np.where(((xx + yy) % 5 == 0) & edge, 4, fr)
    for y in range(S):
        for x in range(S):
            if edge[y, x]:
                out[y, x, :3] = r[fr[y, x]]
                out[y, x, 3] = 255
    # inner frame shadow
    inner = ((xx == 1) | (yy == 1)) & ~edge
    out[inner, 3] = inner_alpha + 18
    # streaks
    s0 = int(R.integers(3, 6))
    for k, (ln, off) in enumerate([(4, s0), (2, s0 + 3)]):
        for i in range(ln):
            x = 2 + i + (off - 3)
            y = off - i + 1
            if 1 < x < S - 1 and 1 < y < S - 1:
                out[y, x, :3] = r[4]
                out[y, x, 3] = 150 - 30 * k
    # opposite corner glint
    out[S - 4, S - 3, :3] = r[3]
    out[S - 4, S - 3, 3] = 110
    out[S - 3, S - 4, :3] = r[3]
    out[S - 3, S - 4, 3] = 110
    return _img(out)


def ore(stone_img, ore_pal, seed, clusters=None):
    """Compact shaded ore clusters with dark rims placed over ``stone_img``."""
    base = _arr(stone_img.resize((S, S), Image.NEAREST))
    r = _xramp(ore_pal, 4, dark=1, light=1)  # 6 shades
    R = _R(seed, "ore")
    n = int(clusters or R.integers(3, 5))
    cells = [(i, j) for i in range(3) for j in range(3)]
    R.shuffle(cells)
    blob = np.zeros((S, S), bool)
    for (i, j) in cells[:n]:
        cx = (i + 0.3 + R.random() * 0.4) * S / 3
        cy = (j + 0.3 + R.random() * 0.4) * S / 3
        size = int(R.integers(6, 11))
        pts = {(int(cx), int(cy))}
        while len(pts) < size:
            cand = set()
            for (px, py) in pts:
                for ddx, ddy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    q = (px + ddx, py + ddy)
                    if q not in pts:
                        cand.add(q)
            cand = sorted(cand)
            score = [math.hypot(qx + 0.5 - cx, qy + 0.5 - cy) + R.random() * 1.6 for (qx, qy) in cand]
            pts.add(cand[int(np.argmin(score))])
        for (px, py) in pts:
            blob[py % S, px % S] = True
    m = blob
    up, left = _roll(m, 1, 0), _roll(m, 0, 1)
    down, right = _roll(m, -1, 0), _roll(m, 0, -1)
    w = _white(seed + ":k")
    k = np.where(w > 0.5, 3, 2)
    k = np.where(~up | ~left, 4, k)
    k = np.where(~up & ~left, 5, k)
    k = np.where((~down | ~right) & up & left, 2, k)
    k = np.where(~down & ~right & up & left, 1, k)
    out = base.copy()
    out[m, :3] = r[k[m]]
    # dark rim hugging the bottom/right outside of each cluster
    rim = ~m & (_roll(m, 1, 0) | _roll(m, 0, 1))
    out[rim, :3] = _mix(base[rim, :3], r[0], 0.6)
    return _img(out)


def lamp(pal, seed, style="cross"):
    """Light block: dark frame, glowing core (style: cross | orb | grid)."""
    r = _xramp(pal, 5, light=1)  # 6 shades
    xx, yy = _grid()
    dx, dy = np.abs(xx - 7.5), np.abs(yy - 7.5)
    n = _white(seed + ":n")
    if style == "orb":
        d = np.hypot(dx, dy)
        t = 1 - d / 8.5 + 0.08 * (n - 0.5)
        idx = 1 + _quant(np.clip(t, 0, 0.999), 5)
        idx = np.where(d < 1.6, 5, idx)
    elif style == "grid":
        cellx, celly = xx % 8, yy % 8
        ex = np.minimum(cellx, 7 - cellx)
        ey = np.minimum(celly, 7 - celly)
        e = np.minimum(ex, ey)
        idx = np.choose(np.clip(e, 0, 3), [1, 3, 4, 4])
        idx = np.where((ex >= 2) & (ey >= 2) & (cellx + celly < 7), 5, idx)
        idx = np.where((cellx == 0) | (celly == 0), 1, idx)
        idx = np.where(((cellx == 0) | (celly == 0)) & (n > 0.6), 2, idx)
    else:  # cross
        arm = np.minimum(dx, dy)
        t = 1 - arm / 4.5 - np.maximum(dx, dy) / 22 + 0.1 * (n - 0.5)
        idx = 1 + _quant(np.clip(t, 0, 0.999), 5)
        idx = np.where(np.maximum(dx, dy) < 1.5, 5, idx)
    e = np.minimum(np.minimum(xx, yy), np.minimum(S - 1 - xx, S - 1 - yy))
    idx = np.where(e == 0, 0, idx)
    idx = np.where((e == 1), np.minimum(idx, 2), idx)
    corner = (np.minimum(xx, S - 1 - xx) < 2) & (np.minimum(yy, S - 1 - yy) < 2)
    idx = np.where(corner & (e == 1), 1, idx)
    return _render(np.clip(idx, 0, 5), r)


def bricks(pal, seed, mortar="dark"):
    """Running-bond bricks (8x3 + 1px mortar), bevelled, per-brick variation."""
    r = _ramp(pal, 5)
    xx, yy = _grid()
    row = yy // 4
    bx = (xx + (row % 2) * 4) // 8
    ids = row * 4 + bx % 2
    R = _R(seed, "b")
    base = R.choice([1, 2, 2, 3], 16)
    idx = base[ids].copy()
    n = _white(seed + ":n")
    idx = np.where(n > 0.8, idx + 1, idx)
    idx = np.where(n < 0.12, idx - 1, idx)
    ry = yy % 4
    rx = (xx + (row % 2) * 4) % 8
    idx = np.where(ry == 0, idx + 1, idx)
    idx = np.where((rx == 0) & (ry > 0), idx + 1, idx)
    idx = np.where(ry == 2, idx - 1, idx)
    idx = np.clip(idx, 1, 4)
    mrt = (ry == 3) | (rx == 7)
    if mortar == "light":
        mr = np.array([_mix(r[-1], [200, 196, 190], 0.6), _mix(r[-1], [170, 166, 160], 0.6)])
        out = _arr(_render(idx, r))
        out[mrt, :3] = mr[(n[mrt] > 0.5).astype(int)]
        return _img(out)
    idx = np.where(mrt, 0, idx)
    return _render(idx, r)


def tiles(pal, seed, size=8):
    """Glazed square tiles with grout lines, bevel and a gloss glint."""
    r = _xramp(pal, 4, light=1)
    xx, yy = _grid()
    tx, ty = xx % size, yy % size
    ids = (yy // size) * 8 + xx // size
    R = _R(seed, "t")
    base = R.choice([2, 2, 2, 3], 64)
    idx = base[ids].copy()
    n = _white(seed + ":n")
    idx = np.where(n > 0.9, idx + 1, idx)
    idx = np.where(n < 0.06, idx - 1, idx)
    idx = np.where((ty == 0) | (tx == 0), 3, idx)
    idx = np.where((ty == size - 2) | (tx == size - 2), 1, idx)
    idx = np.where(((ty == 0) & (tx == size - 2)) | ((tx == 0) & (ty == size - 2)), 2, idx)
    if size >= 6:
        idx = np.where((tx == 2) & (ty == 1) | (tx == 1) & (ty == 2) | (tx == 1) & (ty == 1), 4, idx)
    idx = np.where((tx == size - 1) | (ty == size - 1), 0, idx)
    return _render(np.clip(idx, 0, 4), r)


def metal(pal, seed):
    """Riveted metal plate (one per block face) with bevel and brushed streaks."""
    r = _xramp(pal, 5, light=1)
    xx, yy = _grid()
    idx = np.full((S, S), 3)
    R = _R(seed, "m")
    for _ in range(9):  # brushed streaks
        x, y = int(R.integers(0, S)), int(R.integers(1, S - 2))
        k = 2 if R.random() < 0.6 else 4
        for i in range(int(R.integers(3, 7))):
            _wput(idx, x + i, y, k)
    if R.random() < 0.5:  # optional horizontal centre seam
        idx = np.where(yy == 7, 1, idx)
        idx = np.where(yy == 8, 4, idx)
    idx = np.where((yy == 0) | (xx == 0), 4, idx)
    idx = np.where((yy == S - 2) | (xx == S - 2), np.minimum(idx, 2), idx)
    idx = np.where((yy == S - 1) | (xx == S - 1), 0, idx)
    idx = np.where(((yy == S - 1) & (xx == 0)) | ((yy == 0) & (xx == S - 1)), 1, idx)
    for (x0, y0) in ((2, 2), (12, 2), (2, 12), (12, 12)):
        idx[y0, x0] = 5
        idx[y0, x0 + 1] = 3
        idx[y0 + 1, x0] = 3
        idx[y0 + 1, x0 + 1] = 1
    return _render(np.clip(idx, 0, 5), r)


def rust(pal, seed):
    """Corroded metal: blotchy flaking patches with dark pits and rust runs."""
    r = _ramp(pal, 5)
    f = 0.5 * _fbm2(8, 8, seed + ":a", 3) + 0.2 * _vn(2, 8, seed + ":run") + 0.3 * _white(seed + ":w")
    idx = _levels(f, [0.08, 0.22, 0.36, 0.24, 0.1])
    R = _R(seed, "pit")
    for _ in range(4):
        x, y = (int(v) for v in R.integers(0, S, 2))
        _wput(idx, x, y, 0)
        _wput(idx, x + 1, y, 1)
        _wput(idx, x, y - 1, 4)
    return _render(idx, r)


def circuit(bg_pal, trace_pal, seed):
    """Circuit board: noisy substrate, wrapping traces with pads, and a chip."""
    bg = _ramp(bg_pal, 4)
    tr = _xramp(trace_pal, 3, light=1)
    f = 0.5 * _vn(4, 4, seed + ":a") + 0.5 * _white(seed + ":w")
    bidx = _levels(f, [0.08, 0.5, 0.34, 0.08])
    occ = np.zeros((S, S), bool)
    tidx = np.full((S, S), -1)
    R = _R(seed, "tr")
    # chip
    cw, ch = int(R.integers(4, 6)), int(R.integers(3, 5))
    cx, cy = int(R.integers(0, S)), int(R.integers(0, S))
    chip = np.zeros((S, S), bool)
    for y in range(cy - 1, cy + ch + 1):
        for x in range(cx - 1, cx + cw + 1):
            occ[y % S, x % S] = True
    for y in range(cy, cy + ch):
        for x in range(cx, cx + cw):
            chip[y % S, x % S] = True
    dirs = [(1, 0), (0, 1), (-1, 0), (0, -1)]
    for t in range(7):
        for _attempt in range(20):
            x, y = (int(v) for v in R.integers(0, S, 2))
            if not occ[y % S, x % S]:
                break
        else:
            continue
        d = int(R.integers(0, 4))
        length = int(R.integers(6, 16))
        path = [(x, y)]
        for step in range(length):
            if R.random() < 0.22:
                d = (d + (1 if R.random() < 0.5 else 3)) % 4
            ddx, ddy = dirs[d]
            nx, ny = x + ddx, y + ddy
            px, py = -ddy, ddx
            if occ[ny % S, nx % S] or occ[(ny + py) % S, (nx + px) % S] or \
                    occ[(ny - py) % S, (nx - px) % S]:
                break
            x, y = nx, ny
            path.append((x, y))
        if len(path) < 4:
            continue
        for (x, y) in path:
            tidx[y % S, x % S] = 1
        for (x, y) in path:
            occ[y % S, x % S] = True
        # pads at both ends
        for (x, y) in (path[0], path[-1]):
            tidx[y % S, x % S] = 3
            for ddx, ddy in dirs:
                if tidx[(y + ddy) % S, (x + ddx) % S] < 0 and not chip[(y + ddy) % S, (x + ddx) % S]:
                    tidx[(y + ddy) % S, (x + ddx) % S] = 2
                    occ[(y + ddy) % S, (x + ddx) % S] = True
    out = _arr(_render(bidx, bg))
    m = tidx >= 0
    out[m, :3] = tr[tidx[m]]
    # trace shadow
    sh = ~m & _roll(m, 1, 0) & ~chip
    out[sh, :3] = _mix(out[sh, :3], [0, 0, 0], 0.35)
    # chip body with pins
    chip_col = _darker(bg[0], 0.45)
    out[chip, :3] = chip_col
    top = chip & ~_roll(chip, 1, 0)
    out[top, :3] = _mix(chip_col, bg[2], 0.4)
    for y in range(cy, cy + ch):
        for x in (cx - 1, cx + cw):
            if (y - cy) % 2 == 0:
                out[y % S, x % S, :3] = tr[2]
    out[(cy + 1) % S, (cx + 1) % S, :3] = _mix(chip_col, tr[3], 0.5)
    return _img(out)


def flesh(pal, vein_pal, seed):
    """Fleshy bulging cells separated by worley veins, with wet highlights."""
    r = _xramp(pal, 5, light=1)
    v = _ramp(vein_pal, 3)
    c = _cells(3, 3, seed + ":c", jitter=1.0, extra=2)
    edge = c["d2"] - c["d1"]
    bulge = 1 - np.clip(c["d1"] / 4.5, 0, 1)
    light = np.clip((-c["dx"] - c["dy"]) / 5, -1, 1)
    f = 0.55 * bulge + 0.3 * light + 0.25 * _white(seed + ":w")
    idx = _levels(f, [0.12, 0.24, 0.3, 0.24, 0.1])
    out = _arr(_render(idx, r))
    vm = edge < 1.1
    vk = np.where(edge < 0.45, 0, np.where(edge < 0.8, 1, 2))
    out[vm, :3] = v[vk[vm]]
    # wet highlights up-left of the cell centres
    for (px, py) in c["pts"]:
        hx, hy = int(px - 1.6) % S, int(py - 1.6) % S
        if not vm[hy, hx]:
            out[hy, hx, :3] = r[5]
            out[hy, (hx + 1) % S, :3] = r[4]
    return _img(out)


def goo(pal, seed, alpha=200):
    """Semi-translucent goo with soft swirls and ringed bubbles."""
    r = _xramp(pal, 4, light=1)
    xx, yy = _grid()
    w = _fbm2(8, 8, seed + ":w", 2)
    s = np.sin((xx + yy) * 2 * math.pi / 16 + 5 * w) * 0.5 + 0.5
    f = 0.75 * s + 0.25 * _white(seed + ":n")
    idx = _levels(f, [0.25, 0.4, 0.25, 0.1])
    out = _arr(_render(idx, r))
    out[..., 3] = alpha - 20 + 40 * idx / 3
    R = _R(seed, "b")
    cells = [(0, 0), (1, 1), (0, 1), (1, 0)]
    for (i, j) in cells[: int(R.integers(2, 4))]:
        cx = (i + 0.3 + R.random() * 0.4) * 8
        cy = (j + 0.3 + R.random() * 0.4) * 8
        rad = 1.4 + R.random() * 1.0
        for (x, y) in _disc_pts(cx, cy, rad):
            dd = math.hypot(x + 0.5 - cx, y + 0.5 - cy)
            X, Y = x % S, y % S
            if dd > rad - 0.95:
                lit = (x + 0.5 - cx) + (y + 0.5 - cy) > 0
                out[Y, X, :3] = r[3] if lit else r[2]
                out[Y, X, 3] = min(255, alpha + 30)
            else:
                out[Y, X, :3] = r[1]
                out[Y, X, 3] = alpha - 60
        hx, hy = int(cx - rad * 0.45), int(cy - rad * 0.45)
        out[hy % S, hx % S, :3] = r[4]
        out[hy % S, hx % S, 3] = 250
    return _img(out)


def wool(pal, seed):
    """Soft woolly fibre noise (low contrast)."""
    r = _ramp(pal, 4, 0.25, 0.8)
    xx, yy = _grid()
    f = 0.35 * _vn(2, 2, seed + ":a") + 0.55 * _white(seed + ":w") + 0.12 * (((xx + 2 * yy) % 4) == 0)
    idx = _levels(f, [0.1, 0.38, 0.4, 0.12])
    return _render(idx, r)


def toy_brick(hex_color, seed):
    """Plastic toy block with a single round stud and glossy highlight."""
    r = _color_ramp(hex_color, 6)
    xx, yy = _grid()
    n = _white(seed + ":n")
    idx = np.full((S, S), 3)
    idx = np.where(n > 0.95, 4, idx)
    idx = np.where((yy == 0) | (xx == 0), 4, idx)
    idx = np.where((yy == S - 1) | (xx == S - 1), 1, idx)
    idx = np.where(((yy == S - 1) & (xx == 0)) | ((xx == S - 1) & (yy == 0)), 2, idx)
    X, Y = xx + 0.5, yy + 0.5
    cx, cy, rad = 8.0, 7.4, 4.2
    top = np.hypot(X - cx, Y - cy) < rad
    side = (np.hypot(X - cx, Y - cy - 1.4) < rad) & ~top
    shadow = (np.hypot(X - cx - 1.0, Y - cy - 2.2) < rad + 0.3) & ~top & ~side
    idx = np.where(shadow, 2, idx)
    idx = np.where(side, 1, idx)
    # stud top: lit rim upper-left, flat centre
    dxx, dyy = X - cx, Y - cy
    d = np.hypot(dxx, dyy)
    rim = top & (d > rad - 1.1)
    lit = (-dxx - dyy) / (d + 1e-6)
    idx = np.where(top, 3, idx)
    idx = np.where(rim & (lit > 0.3), 4, idx)
    idx = np.where(rim & (lit < -0.5), 2, idx)
    for (x, y) in ((6, 5), (5, 6), (7, 5)):
        idx[y, x] = 5
    return _render(idx, r)


def neon_grid(bg_hex, line_hex, seed):
    """Dark face with glowing 1px lines along the borders (forms a grid when tiled)."""
    bg = _color_ramp(bg_hex, 4, spread=0.6)
    ln = _rgb(line_hex)[:3]
    xx, yy = _grid()
    n = _white(seed + ":n")
    idx = np.where(n > 0.85, 2, np.where(n < 0.1, 0, 1))
    out = _arr(_render(idx, bg))
    e = np.minimum(np.minimum(xx, yy), np.minimum(S - 1 - xx, S - 1 - yy))
    glow1 = _mix(bg[1], ln, 0.38)
    glow2 = _mix(bg[1], ln, 0.14)
    out[e == 2, :3] = _mix(out[e == 2, :3], glow2, 0.8)
    out[e == 1, :3] = glow1
    out[e == 0, :3] = ln
    hot = _lighter(ln, 0.6)
    corner = ((xx == 0) | (xx == S - 1)) & ((yy == 0) | (yy == S - 1))
    out[corner, :3] = hot
    # faint midline accent dots
    for k in (7, 8):
        out[k, 0, :3] = hot
        out[0, k, :3] = hot
        out[k, S - 1, :3] = hot
        out[S - 1, k, :3] = hot
    return _img(out)


def checker(a_hex, b_hex, size=4):
    """Flat checkerboard of two colours (``size`` px squares)."""
    xx, yy = _grid()
    m = ((xx // size) + (yy // size)) % 2 == 0
    out = np.zeros((S, S, 4))
    out[m] = _rgb(a_hex)
    out[~m] = _rgb(b_hex)
    return _img(out)


def missing_texture():
    """The classic magenta / black missing texture."""
    return checker("#f800f8", "#000000", 8)


def cheese(pal, seed):
    """Cheese with round concave holes (shadowed upper-left inside, lit lower rim)."""
    r = _xramp(pal, 4, dark=1, lo=0.15)  # 0 = deep hole
    f = 0.55 * _vn(4, 4, seed + ":a") + 0.45 * _white(seed + ":w")
    idx = 2 + _levels(f, [0.15, 0.65, 0.2])  # 2..4
    R = _R(seed, "h")
    cells = [(i, j) for i in range(3) for j in range(3)]
    R.shuffle(cells)
    for (i, j) in cells[: int(R.integers(4, 6))]:
        cx = (i + 0.25 + R.random() * 0.5) * S / 3
        cy = (j + 0.25 + R.random() * 0.5) * S / 3
        rad = 1.1 + R.random() * 1.4
        for (x, y) in _disc_pts(cx, cy, rad + 1.0):
            dx, dy = x + 0.5 - cx, y + 0.5 - cy
            dd = math.hypot(dx, dy)
            X, Y = x % S, y % S
            if dd <= rad:
                idx[Y, X] = 0 if (dx + dy) < rad * 0.6 else 1
            elif dx + dy > 0.8 and dd <= rad + 0.9:
                idx[Y, X] = 4
            elif dx + dy < -0.8 and dd <= rad + 0.9:
                idx[Y, X] = min(idx[Y, X], 2)
    return _render(idx, r)


def honeycomb(pal, seed):
    """Hexagonal cells with dark walls and glossy honey interiors."""
    r = _xramp(pal, 5, light=1)
    xx, yy = _grid()
    centers = []
    for j in range(2):
        for i in range(2):
            centers.append((i * 8 + (j % 2) * 4 + 4, j * 8 + 4))
    pts = np.array(centers, float)
    X = xx + 0.5
    Y = yy + 0.5
    dx = (X[None] - pts[:, 0, None, None] + 8) % 16 - 8
    dy = (Y[None] - pts[:, 1, None, None] + 8) % 16 - 8
    # hex metric (pointy-top hexes)
    d = np.maximum(np.abs(dx) * 0.866 + np.abs(dy) * 0.5, np.abs(dy))
    order = np.argsort(d, axis=0, kind="stable")
    d1 = np.take_along_axis(d, order[:1], 0)[0]
    d2 = np.take_along_axis(d, order[1:2], 0)[0]
    ndx = np.take_along_axis(dx, order[:1], 0)[0]
    ndy = np.take_along_axis(dy, order[:1], 0)[0]
    edge = d2 - d1
    n = _white(seed + ":n")
    idx = np.full((S, S), 3)
    idx = np.where(ndy < -1.5, 2, idx)  # shadowed top inside the cell
    idx = np.where((ndy > 1) | ((ndx > 1.5) & (ndy > -1)), 4, idx)
    idx = np.where(n > 0.9, idx + 1, idx)
    idx = np.where((edge < 1.3), 1, idx)
    idx = np.where((edge < 0.6), 0, idx)
    for (cx, cy) in centers:
        _wput(idx, cx - 2, cy - 1, 5)
        _wput(idx, cx - 1, cy - 2, 5)
    return _render(np.clip(idx, 0, 5), r)


def wax(pal, seed):
    """Smooth waxy surface: gentle mottling with glossy flecks."""
    r = _ramp(pal, 4, 0.2, 0.9)
    f = 0.8 * _fbm2(8, 8, seed + ":a", 2) + 0.2 * _white(seed + ":w")
    idx = _levels(f, [0.12, 0.4, 0.38, 0.1])
    R = _R(seed, "g")
    for _ in range(3):
        x, y = (int(v) for v in R.integers(0, S, 2))
        _wput(idx, x, y, 3)
        _wput(idx, x + 1, y, 3)
        _wput(idx, x, y + 1, 2)
    return _render(idx, r)


def scales(pal, seed):
    """Overlapping rows of round scales; each scale's rounded bottom edge is outlined."""
    r = _xramp(pal, 4, dark=1, light=1)  # 6
    xx, yy = _grid()
    X, Y = xx + 0.5, yy + 0.5
    rx, ry = 4.6, 6.2
    owner = np.full((S, S), 99)
    tdx = np.zeros((S, S))
    tdy = np.zeros((S, S))
    tq = np.zeros((S, S))
    # upper rows are drawn last (on top) so each scale shows its rounded lower part
    for row in range(5, -2, -1):
        cy = row * 4
        for col in range(-1, 3):
            cx = col * 8 + (row % 2) * 4 + 4
            for ox in (-16, 0, 16):
                for oy in (-16, 0, 16):
                    dx = X - (cx + ox)
                    dy = Y - (cy + oy)
                    q = np.hypot(dx / rx, dy / ry)
                    inside = (q < 1) & (dy >= 0)
                    owner = np.where(inside, (row % 4) * 4 + col % 2, owner)
                    tdx = np.where(inside, dx, tdx)
                    tdy = np.where(inside, dy, tdy)
                    tq = np.where(inside, q, tq)
    n = _white(seed + ":n")
    under = owner != _roll(owner, 1, 0)  # just below the scale above -> in its shadow
    idx = np.full((S, S), 3)
    idx = np.where(tdx < -1.0, 4, idx)
    idx = np.where(n > 0.88, idx + 1, idx)
    idx = np.where(tq > 0.72, 2, idx)
    idx = np.where(tq > 0.86, 1, idx)
    idx = np.where(under, 2, idx)
    idx = np.where(under & (tdx > 0), 1, idx)
    idx = np.where((tq > 0.86) & (tdy > ry * 0.55), 0, idx)
    return _render(np.clip(idx, 0, 5), r)


def bone(pal, seed):
    """Bone block side: pale fibrous bone with porous pits."""
    r = _ramp(pal, 5, 0.1, 1.0)
    f = 0.5 * _vn(8, 2, seed + ":a") + 0.25 * _vn(4, 1, seed + ":b") + 0.3 * _white(seed + ":w")
    idx = _levels(f, [0.05, 0.15, 0.35, 0.33, 0.12])
    R = _R(seed, "p")
    cells = [(i, j) for i in range(4) for j in range(4)]
    R.shuffle(cells)
    for (i, j) in cells[:6]:
        x, y = i * 4 + int(R.integers(0, 3)), j * 4 + int(R.integers(0, 3))
        _wput(idx, x, y, 0)
        _wput(idx, x + 1, y, 1)
        _wput(idx, x, y + 1, 4)
        _wput(idx, x + 1, y + 1, 4)
    return _render(idx, r)


def ice(pal, seed, alpha=(185, 228)):
    """Translucent ice with white cracks and diagonal light streaks."""
    r = _xramp(pal, 4, light=1)
    xx, yy = _grid()
    f = 0.5 * _fbm2(8, 8, seed + ":a", 2) + 0.5 * _white(seed + ":w")
    idx = 1 + _levels(f, [0.25, 0.5, 0.25])  # 1..3
    streak = ((xx + yy) % 16 < 2) | ((xx + yy + 7) % 16 == 0)
    idx = np.where(streak, np.minimum(idx + 1, 3), idx)
    R = _R(seed, "c")
    for _ in range(2):
        x, y = (float(v) for v in R.integers(0, S, 2))
        ang = R.random() * math.tau
        for k in range(int(R.integers(5, 9))):
            _wput(idx, round(x), round(y), 4)
            _wput(idx, round(x) + 1, round(y) + 1, 0)
            ang += (R.random() - 0.5) * 1.2
            x += math.cos(ang)
            y += math.sin(ang)
    a = alpha[0] + (alpha[1] - alpha[0]) * (idx / 4.0)
    a = np.where(idx == 4, 240, a)
    return _render(idx, r, alpha=a)


def cloud(pal, seed):
    """Puffy cloud: rounded billows lit from the top-left."""
    r = _ramp(pal, 5)
    c = _cells(3, 3, seed + ":c", jitter=1.0, extra=3)
    lit = (-c["dx"] * 0.6 - c["dy"]) / 4.0
    f = 0.55 * lit + 0.35 * (1 - np.clip(c["d1"] / 4, 0, 1)) + 0.15 * _white(seed + ":w")
    idx = _levels(f, [0.08, 0.16, 0.26, 0.3, 0.2])
    edge = c["d2"] - c["d1"]
    eu, el, ed, er = _edges(c["ids"])
    idx = np.where((edge < 0.9) & (c["dy"] > 0), np.maximum(idx - 1, 0), idx)
    return _render(idx, r)


def sketch(seed, ink="#222222", paper="#f4f1ea"):
    """Paper with patches of pencil hatching and a dark hand-drawn outline border."""
    ik = _rgb(ink)[:3]
    p = _rgb(paper)[:3]
    xx, yy = _grid()
    n = _white(seed + ":n")
    out = np.zeros((S, S, 4))
    out[..., 3] = 255
    out[..., :3] = p
    out[n < 0.1, :3] = _mix(p, ik, 0.07)
    pencil = _mix(p, ik, 0.38)
    dark = _mix(p, ik, 0.58)
    R = _R(seed, "h")
    for patch in range(int(R.integers(2, 4))):
        px, py = int(R.integers(2, 10)), int(R.integers(3, 11))
        w = int(R.integers(4, 8))
        for k in range(0, w, 3):
            ln = int(R.integers(3, 6))
            for i in range(ln):
                x, y = px + k + i, py + 2 - i
                if 1 < x < S - 2 and 1 < y < S - 2:
                    out[y, x, :3] = pencil
        if R.random() < 0.45:
            for k in range(1, w, 3):
                for i in range(3):
                    x, y = px + k + i, py - 1 + i
                    if 1 < x < S - 2 and 1 < y < S - 2:
                        out[y, x, :3] = dark
    e = np.minimum(np.minimum(xx, yy), np.minimum(S - 1 - xx, S - 1 - yy))
    out[e == 0, :3] = ik
    for y in range(S):
        for x in range(S):
            if e[y, x] == 1 and R.random() < 0.2:
                out[y, x, :3] = _mix(p, ik, 0.7)
    return _img(out)


def coral(pal, seed):
    """Coral block: bumpy surface dotted with polyp pores."""
    r = _xramp(pal, 4, dark=1, light=1, lo=0.15, hi=0.85)
    f = 0.55 * _vn(4, 4, seed + ":a") + 0.45 * _white(seed + ":w")
    idx = 1 + _levels(f, [0.15, 0.45, 0.3, 0.1])  # 1..4
    c = _cells(3, 3, seed + ":p", jitter=0.9, extra=3)
    for (px, py) in c["pts"]:
        x, y = int(px), int(py)
        _wput(idx, x, y, 0)
        _wput(idx, x - 1, y - 1, 5)
        _wput(idx, x - 1, y, 4)
        _wput(idx, x, y - 1, 4)
        _wput(idx, x + 1, y, 1)
        _wput(idx, x, y + 1, 1)
    return _render(idx, r)


def salt(pal, seed):
    """Packed cubic salt crystals with lit tops and shaded sides."""
    r = _ramp(pal, 5)
    c = _cells(4, 4, seed + ":c", jitter=0.7, extra=1)
    R = _R(seed, "s")
    base = R.choice([2, 3, 3, 4], c["n"])
    idx = base[c["ids"]].copy()
    eu, el, ed, er = _edges(c["ids"])
    idx = np.where(eu | el, np.minimum(idx + 1, 4), idx)
    idx = np.where(ed | er, idx - 2, idx)
    idx = np.where((c["d2"] - c["d1"]) < 0.4, 0, idx)
    idx = np.where(_white(seed + ":w") > 0.9, 4, idx)
    return _render(np.clip(idx, 0, 4), r)


def obsidian_like(pal, seed):
    """Very dark glassy stone with faint lighter streaks and glints."""
    r = _ramp(pal, 5)
    f = _fbm2(8, 8, seed + ":a", 3)
    ridge = 1 - np.abs(f - 0.5) * 2
    g = 0.65 * ridge + 0.35 * _white(seed + ":w")
    idx = _levels(g, [0.38, 0.3, 0.18, 0.1, 0.04])
    return _render(idx, r)


def carpet_pattern(pal, seed):
    """Woven rug with a seed-chosen geometric motif using the palette's colours."""
    cols = np.array([_rgb(c)[:3] for c in _palette(pal)])
    m = len(cols)
    xx, yy = _grid()
    R = _R(seed, "m")
    motif = int(R.integers(0, 4))
    dx, dy = np.abs(xx - 7.5), np.abs(yy - 7.5)
    if motif == 0:  # concentric diamond
        v = ((dx + dy) // 2).astype(int)
    elif motif == 1:  # stepped squares
        v = (np.maximum(dx, dy) // 2).astype(int)
    elif motif == 2:  # zig-zag rows
        v = ((yy + np.abs((xx % 8) - 3.5)) // 3).astype(int)
    else:  # cross + diamond
        v = np.where(np.minimum(dx, dy) < 1.5, 0, ((dx + dy) // 3).astype(int) + 1)
    order = R.permutation(m)
    k = order[v % m]
    out = cols[k].copy()
    # woven fuzz: darken some pixels slightly
    n = _white(seed + ":n")
    out = np.where((n > 0.82)[..., None], out * 0.86, out)
    border = (xx == 0) | (yy == 0) | (xx == S - 1) | (yy == S - 1)
    out[border] = cols[0]
    inner = ((xx == 1) | (yy == 1) | (xx == S - 2) | (yy == S - 2)) & ~border
    out[inner & ((xx + yy) % 2 == 0)] = cols[min(m - 1, 2)]
    return _img(out)


def candy_stripe(a_hex, b_hex, seed, width=4):
    """Glossy diagonal candy stripes."""
    ra = _color_ramp(a_hex, 4, spread=0.7)
    rb = _color_ramp(b_hex, 4, spread=0.7)
    xx, yy = _grid()
    u = (xx + yy) % (2 * width)
    out = np.zeros((S, S, 4))
    out[..., 3] = 255
    n = _white(seed + ":n")
    for y in range(S):
        for x in range(S):
            rr = ra if u[y, x] < width else rb
            pos = u[y, x] % width
            k = 2
            if pos == 0:
                k = 3
            elif pos == width - 1:
                k = 1
            if n[y, x] > 0.93:
                k = min(3, k + 1)
            out[y, x, :3] = rr[k]
    return _img(out)


_SPRINKLES = ["#ff5d73", "#ffd34e", "#5bd0ff", "#7ee081", "#c58bff", "#ffffff"]


def frosting(pal, seed, sprinkles=True):
    """Glossy swirled icing, optionally with colourful sprinkles."""
    r = _ramp(pal, 4)
    xx, yy = _grid()
    w = _fbm2(8, 8, seed + ":w", 2)
    s = np.sin(yy * 2 * math.pi / 8 + 4 * w + np.sin(xx * 2 * math.pi / 16) * 1.2)
    idx = _quant((s * 0.5 + 0.5) * 0.85 + 0.15 * _white(seed + ":n"), 4)
    out = _arr(_render(idx, r))
    if sprinkles:
        R = _R(seed, "sp")
        cells = [(i, j) for i in range(4) for j in range(4)]
        for (i, j) in cells:
            if R.random() < 0.55:
                continue
            x = i * 4 + int(R.integers(0, 3))
            y = j * 4 + int(R.integers(0, 3))
            col = _rgb(_SPRINKLES[int(R.integers(0, len(_SPRINKLES)))])[:3]
            out[y % S, x % S, :3] = col
            if R.random() < 0.5:
                out[(y + 1) % S, (x + 1) % S, :3] = _darker(col, 0.8)
            else:
                out[y % S, (x + 1) % S, :3] = _darker(col, 0.8)
    return _img(out)


def chocolate(pal, seed):
    """Chocolate bar: 2x2 raised, bevelled segments."""
    r = _ramp(pal, 5)
    xx, yy = _grid()
    tx, ty = xx % 8, yy % 8
    n = _white(seed + ":n")
    idx = np.full((S, S), 2)
    idx = np.where(n > 0.92, 3, idx)
    idx = np.where((tx == 0) | (ty == 0), 4, idx)
    idx = np.where(((tx == 1) | (ty == 1)) & (tx < 7) & (ty < 7), 3, idx)
    idx = np.where((tx == 6) | (ty == 6), 1, idx)
    idx = np.where(((tx == 6) & (ty == 0)) | ((ty == 6) & (tx == 0)), 2, idx)
    idx = np.where((tx == 7) | (ty == 7), 0, idx)
    return _render(idx, r)


def cookie(pal, seed):
    """Baked cookie dough with cracks and dark chocolate chips."""
    r = _ramp(pal, 5)
    f = 0.5 * _vn(4, 4, seed + ":a") + 0.5 * _white(seed + ":w")
    idx = 1 + _levels(f, [0.12, 0.33, 0.4, 0.15])  # 1..4
    chip = _darker(_darker(r[0], 0.7), 0.75)
    chip_hi = _mix(r[0], chip, 0.4)
    out_idx = idx
    out = _arr(_render(out_idx, r))
    R = _R(seed, "c")
    cells = [(i, j) for i in range(3) for j in range(3)]
    R.shuffle(cells)
    for (i, j) in cells[:5]:
        x = int((i + 0.2 + R.random() * 0.6) * S / 3)
        y = int((j + 0.2 + R.random() * 0.6) * S / 3)
        shape = [(0, 0), (1, 0), (0, 1), (1, 1)] if R.random() < 0.6 else [(0, 0), (1, 0), (0, 1)]
        for (ddx, ddy) in shape:
            out[(y + ddy) % S, (x + ddx) % S, :3] = chip
        out[y % S, x % S, :3] = chip_hi
    # cracks
    for _ in range(2):
        x, y = (int(v) for v in R.integers(0, S, 2))
        for k in range(3):
            out[(y + (k if R.random() < 0.5 else 0)) % S, (x + k) % S, :3] = r[0]
    return _img(out)


def cardboard(pal, seed):
    """Corrugated cardboard: faint vertical ribs, fibres and a crease."""
    r = _ramp(pal, 4, 0.1, 0.9)
    xx, yy = _grid()
    rib = ((xx % 4) == 0) * 0.45 + ((xx % 4) == 1) * 0.2
    f = 0.4 * rib + 0.3 * _vn(8, 4, seed + ":a") + 0.3 * _white(seed + ":w")
    idx = _levels(f, [0.06, 0.46, 0.38, 0.1])
    R = _R(seed, "f")
    for _ in range(3):
        x, y = (int(v) for v in R.integers(0, S, 2))
        _wput(idx, x, y, 0)
        _wput(idx, x + 1, y, 1)
    return _render(idx, r)


def sponge(pal, seed):
    """Porous sponge: round pores of varied size with lit lower rims."""
    r = _ramp(pal, 5)
    R = _R(seed, "s")
    f = 0.5 * _vn(4, 4, seed + ":a") + 0.5 * _white(seed + ":w")
    idx = 2 + _levels(f, [0.2, 0.55, 0.25])  # 2..4
    cells = [(i, j) for i in range(4) for j in range(4)]
    R.shuffle(cells)
    for (i, j) in cells[:11]:
        cx = (i + 0.2 + R.random() * 0.6) * 4
        cy = (j + 0.2 + R.random() * 0.6) * 4
        rad = 0.7 + R.random() * 1.1
        for (x, y) in _disc_pts(cx, cy, rad + 0.9):
            dx, dy = x + 0.5 - cx, y + 0.5 - cy
            dd = math.hypot(dx, dy)
            X, Y = x % S, y % S
            if dd <= rad:
                idx[Y, X] = 0 if dx + dy < 0.4 else 1
            elif dx + dy > 0.6:
                idx[Y, X] = 4
    return _render(idx, r)


def slime_block(pal, seed):
    """Translucent slime block: outer jelly shell with a denser inner cube."""
    r = _xramp(pal, 4, light=1)
    xx, yy = _grid()
    n = _white(seed + ":n")
    e = np.minimum(np.minimum(xx, yy), np.minimum(S - 1 - xx, S - 1 - yy))
    idx = np.where(n > 0.7, 2, 1)
    a = np.full((S, S), 165.0)
    idx = np.where(e == 0, 0, idx)
    a = np.where(e == 0, 215, a)
    inner = (xx >= 3) & (xx <= 12) & (yy >= 3) & (yy <= 12)
    ie = np.minimum(np.minimum(xx - 3, yy - 3), np.minimum(12 - xx, 12 - yy))
    idx = np.where(inner, 2, idx)
    idx = np.where(inner & (ie == 0) & ((xx == 3) | (yy == 3)), 3, idx)
    idx = np.where(inner & (ie == 0) & ((xx == 12) | (yy == 12)), 1, idx)
    a = np.where(inner, 230, a)
    # highlights
    for (x, y, k) in [(1, 1, 4), (2, 1, 3), (1, 2, 3), (4, 4, 4), (5, 4, 4), (4, 5, 4), (10, 10, 3)]:
        idx[y, x] = k
    return _render(idx, r, alpha=a)


def plastic(hex_color, seed):
    """Smooth plastic: flat colour, a few faint marks and a soft diagonal sheen."""
    r = _color_ramp(hex_color, 5, spread=0.4)
    xx, yy = _grid()
    idx = np.full((S, S), 2)
    R = _R(seed, "s")
    for _ in range(4):
        x, y = (int(v) for v in R.integers(0, S, 2))
        _wput(idx, x, y, 1)
        if R.random() < 0.5:
            _wput(idx, x + 1, y, 1)
    u = (xx + yy) % 16
    idx = np.where((u == 3) | (u == 4), 3, idx)
    idx = np.where(u == 3, 4, idx)
    idx = np.where(u == 6, 3, idx)
    return _render(idx, r)


def static_noise(seed, frame=0):
    """TV static: random greys with a couple of brighter / darker scanlines."""
    g = np.array([[16, 16, 18], [64, 64, 68], [118, 118, 122], [178, 178, 182], [236, 236, 238]], float)
    R = _R(seed, f"st{frame}")
    w = R.random((S, S))
    rows = R.random(S)
    w = w + np.where(rows > 0.85, 0.25, 0)[:, None] - np.where(rows < 0.12, 0.25, 0)[:, None]
    idx = _levels(w, [0.18, 0.24, 0.24, 0.2, 0.14])
    return _render(idx, g)


_GLITCH = ["#000000", "#ff00ff", "#00ffff", "#00ff66", "#ffffff", "#2b0b3a", "#ff2b4e", "#1a1aff"]


def pixel_glitch(seed):
    """Corrupted-pixel glitch: displaced colour bars and blocky noise."""
    cols = np.array([_rgb(c)[:3] for c in _GLITCH])
    R = _R(seed, "g")
    out = np.zeros((S, S, 3))
    out[:] = cols[5]
    base = _white(seed + ":w")
    out[base > 0.7] = cols[0]
    for _ in range(9):
        w = int(R.integers(2, 9))
        h = int(R.integers(1, 4))
        x, y = (int(v) for v in R.integers(0, S, 2))
        c = cols[int(R.integers(0, len(cols)))]
        for yy in range(y, y + h):
            for xx in range(x, x + w):
                out[yy % S, xx % S] = c
    # horizontal displacement of a few rows (wraps)
    for _ in range(3):
        y = int(R.integers(0, S))
        out[y] = np.roll(out[y], int(R.integers(-5, 6)), 0)
    # rgb split pixels
    for _ in range(6):
        x, y = (int(v) for v in R.integers(0, S, 2))
        out[y % S, x % S] = cols[1]
        out[y % S, (x + 1) % S] = cols[2]
    return _img(out)


def velvet(pal, seed):
    """Plush velvet: deep shades with a soft directional sheen and crushed spots."""
    r = _ramp(pal, 5)
    xx, yy = _grid()
    sheen = 0.5 + 0.5 * np.sin((xx * 1 + yy * 2) * 2 * math.pi / 16 + 2.5 * _vn(8, 8, seed + ":w"))
    f = 0.6 * sheen + 0.2 * _vn(4, 4, seed + ":a") + 0.25 * _white(seed + ":n")
    idx = _levels(f, [0.18, 0.3, 0.27, 0.17, 0.08])
    return _render(idx, r)


def _contour(t, ax=0.0, ay=0.0):
    """1px contour lines where floor(t) changes between neighbours.

    ``t(x+16, y) == t + ax`` and ``t(x, y+16) == t + ay`` (integers) keep it seamless."""
    xx, yy = _grid()
    b = np.floor(t)
    right = np.floor(_roll(t, 0, -1) + np.where(xx == S - 1, ax, 0))
    down = np.floor(_roll(t, -1, 0) + np.where(yy == S - 1, ay, 0))
    return (b != right) | (b != down)


def marble(pal, seed):
    """Polished marble: light base with thin meandering diagonal veins."""
    r = _ramp(pal, 5)
    xx, yy = _grid()
    t = 2 * ((xx + yy * 0.5) / 16 + 1.4 * _fbm2(8, 8, seed + ":t", 3))
    vein = _contour(t, 2, 1)
    base = 0.6 * _vn(8, 8, seed + ":b") + 0.4 * _white(seed + ":w")
    idx = 2 + _levels(base, [0.25, 0.5, 0.25])  # 2..4
    near = _roll(vein, 0, 1) | _roll(vein, 1, 0)
    idx = np.where(near & ~vein, np.minimum(idx, 2), idx)
    idx = np.where(vein, 1, idx)
    t2 = 2 * ((xx * 0.5 - yy) / 16 + 1.2 * _fbm2(8, 8, seed + ":t2", 3))
    v2 = _contour(t2, 1, -2)
    idx = np.where(v2 & vein, 0, idx)
    idx = np.where(v2 & ~vein & (_white(seed + ":v2") > 0.3), np.minimum(idx, 2), idx)
    return _render(idx, r)


def basalt_side(pal, seed):
    """Basalt side: vertical columns with lit left edges and dark grooves."""
    r = _ramp(pal, 5)
    R = _R(seed, "c")
    widths = []
    while sum(widths) < S:
        widths.append(int(R.integers(3, 6)))
    widths[-1] -= sum(widths) - S
    if widths[-1] < 2:
        widths[-2] += widths[-1]
        widths.pop()
    idx = np.zeros((S, S), int)
    v = _vn(2, 8, seed + ":v")
    w = _white(seed + ":w")
    x = 0
    for k, wd in enumerate(widths):
        base = int(R.integers(2, 4))
        for i in range(wd):
            col = np.full(S, base)
            col = np.where(v[:, x] > 0.62, col + 1, col)
            col = np.where(w[:, x] > 0.88, col + 1, col)
            col = np.where(w[:, x] < 0.1, col - 1, col)
            if i == 0:
                col = np.maximum(col, 3) + (w[:, x] > 0.5)
            if i == wd - 2:
                col = np.minimum(col, 2)
            if i == wd - 1:
                col = np.where(w[:, x] > 0.8, 1, 0)
            idx[:, x] = col
            x += 1
    return _render(np.clip(idx, 0, 4), r)


def basalt_top(pal, seed):
    """Basalt top: polygonal column ends with dark rims and lighter cores."""
    r = _ramp(pal, 5)
    c = _cells(3, 3, seed + ":c", jitter=0.9)
    edge = c["d2"] - c["d1"]
    ring = np.floor(c["d1"] / 1.6).astype(int)
    idx = np.where(ring % 2 == 0, 3, 2)
    idx = np.where(c["d1"] < 1.0, 4, idx)
    idx = np.where(_white(seed + ":w") > 0.88, idx + 1, idx)
    idx = np.where(edge < 1.2, 1, idx)
    idx = np.where(edge < 0.55, 0, idx)
    return _render(np.clip(idx, 0, 4), r)


def clay(pal, seed):
    """Smooth clay: very low contrast mottling, a few specks."""
    r = _ramp(pal, 4, 0.2, 0.85)
    f = 0.55 * _vn(4, 4, seed + ":a") + 0.45 * _white(seed + ":w")
    idx = _levels(f, [0.06, 0.4, 0.46, 0.08])
    return _render(idx, r)


def terracotta(pal, seed):
    """Flat fired clay with subtle mottling."""
    r = _ramp(pal, 4, 0.3, 0.7)
    f = 0.7 * _vn(8, 4, seed + ":a") + 0.3 * _white(seed + ":w")
    idx = _levels(f, [0.06, 0.46, 0.42, 0.06])
    return _render(idx, r)


_RAINBOW = ["#e8333b", "#f6872d", "#f9d33a", "#56c13f", "#3a8ee8", "#8a4fd6"]


def rainbow_bands(seed, horizontal=True):
    """Six rainbow bands with subtle shimmer (horizontal rows by default)."""
    widths = [3, 3, 2, 3, 2, 3]
    out = np.zeros((S, S, 3))
    n = _white(seed + ":n")
    pos = 0
    for k, wd in enumerate(widths):
        base = _rgb(_RAINBOW[k])[:3]
        rr = [_darker(base, 0.85), base, _lighter(base, 0.3)]
        for i in range(wd):
            line = np.where(n[pos] > 0.8, 2, np.where(n[pos] < 0.15, 0, 1))
            if i == 0:
                line = np.where(n[pos] > 0.4, 2, 1)
            out[pos] = np.array(rr)[line]
            pos += 1
    if not horizontal:
        out = out.transpose(1, 0, 2)
    return _img(out)


def _chunky(ids, base, noise, top=5):
    """Shared shading for chunk/pebble textures: 1px dark joints on the bottom/right
    of every region, highlight on its top/left, a soft shadow just above the joint."""
    eu, el, ed, er = _edges(ids)
    idx = base[ids].copy()
    idx = np.where(noise > 0.84, idx + 1, idx)
    idx = np.where(noise < 0.12, idx - 1, idx)
    idx = np.where(eu | el, idx + 1, idx)
    near = (ids != _roll(ids, -2, 0)) | (ids != _roll(ids, 0, -2))
    idx = np.where(near & ~(eu | el), idx - 1, idx)
    idx = np.clip(idx, 1, top)
    idx = np.where(ed | er, 0, idx)
    return idx


# ---- END OF BLOCKS ----
