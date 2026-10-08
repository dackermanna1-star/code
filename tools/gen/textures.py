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

__all__ = [
    "pal", "shift", "tint", "save", "animated", "save_animated", "stone", "rough_stone", "dirt",
    "sand", "gravel", "grass_top", "grass_side", "moss", "snow", "ash", "log_side", "log_top",
    "planks", "leaves", "mushroom_cap", "mushroom_stem", "crystal", "glass", "ore", "lamp",
    "bricks", "tiles", "metal", "rust", "circuit", "flesh", "goo", "wool", "toy_brick",
    "neon_grid", "checker", "missing_texture", "cheese", "honeycomb", "wax", "scales", "bone",
    "ice", "cloud", "sketch", "coral", "salt", "obsidian_like", "carpet_pattern",
    "candy_stripe", "frosting", "chocolate", "cookie", "cardboard", "sponge", "slime_block",
    "plastic", "static_noise", "pixel_glitch", "velvet", "marble", "basalt_side", "basalt_top",
    "clay", "terracotta", "rainbow_bands", "grass_tuft", "tall_plant_bottom", "tall_plant_top",
    "flower", "mushroom_sprite", "sprout", "fern", "crystal_shard_sprite", "coral_fan", "reeds",
    "thorn_bush", "eyeball_plant", "bulb", "lollipop_plant", "cactus_sprite", "puffball",
    "tendril", "vine_overlay", "lily_pad", "sapling", "berry_bush", "bone_sprite",
    "gear_sprite", "wire_sprite", "item_icon", "portal_fluid_bottle", "portal_fluid_frames",
    "spawn_egg", "gun_body", "gun_dark", "gun_screen", "gun_button", "gun_canister_frames",
    "ITEM_KINDS", "PORTAL_PALETTE", "PORTAL_FLUID",
]

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


def animated(frames, frametime=None, interpolate=None):
    """Stack frames into a vertical strip; returns (strip, mcmeta_dict).

    ``frametime`` / ``interpolate`` default to what the generator stored in the first frame's
    ``info`` (``"frametime"``, ``"interpolate"``), else 2 / True.  Strips with small discrete
    moving details (bubbles, sparks) or per-frame noise -- ``gun_canister_frames``,
    ``portal_fluid_frames`` and ``static_noise`` strips -- must use ``interpolate=False``:
    interpolation cross-fades those details (they blink instead of moving).  Those generators
    tag their frames accordingly, so ``animated(frames)`` does the right thing."""
    info = getattr(frames[0], "info", {}) or {}
    if frametime is None:
        frametime = info.get("frametime", 2)
    if interpolate is None:
        interpolate = info.get("interpolate", True)
    w, h = frames[0].size
    strip = Image.new("RGBA", (w, h * len(frames)), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        strip.paste(f.convert("RGBA"), (0, i * h))
    return strip, {"animation": {"frametime": int(frametime), "interpolate": bool(interpolate)}}


def save_animated(frames, path, frametime=None, interpolate=None):
    """Write ``path`` (strip png) and ``path + '.mcmeta'`` (see ``animated`` for the defaults)."""
    strip, meta = animated(frames, frametime, interpolate)
    p = save(strip, path)
    Path(str(p) + ".mcmeta").write_text(json.dumps(meta, indent=2) + "\n")
    return p


def _tag_frames(frames, frametime=2, interpolate=False):
    for f in frames:
        f.info["frametime"] = frametime
        f.info["interpolate"] = interpolate
    return frames


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


def _chunky(ids, base, noise, top=5):
    """Shared shading for chunk/pebble textures: 1px dark joints on the bottom/right
    of every region, highlight on its top/left, a soft shadow just above the joint."""
    eu, el, ed, er = _edges(ids)
    idx = base[ids].copy()
    # interior specks never reach the top shade (no stray near-white pixels); only the
    # top/left bevel does
    idx = np.where(noise > 0.84, np.minimum(idx + 1, top - 1), idx)
    idx = np.where(noise < 0.12, idx - 1, idx)
    idx = np.where(eu | el, idx + 1, idx)
    near = (ids != _roll(ids, -2, 0)) | (ids != _roll(ids, 0, -2))
    idx = np.where(near & ~(eu | el), idx - 1, idx)
    idx = np.clip(idx, 1, top)
    idx = np.where(ed | er, 0, idx)
    return idx


def _contour(t, ax=0.0, ay=0.0):
    """1px contour lines where floor(t) changes between neighbours.

    ``t(x+16, y) == t + ax`` and ``t(x, y+16) == t + ay`` (integers) keep it seamless."""
    xx, yy = _grid()
    b = np.floor(t)
    right = np.floor(_roll(t, 0, -1) + np.where(xx == S - 1, ax, 0))
    down = np.floor(_roll(t, -1, 0) + np.where(yy == S - 1, ay, 0))
    return (b != right) | (b != down)


# ---- tile-safe terrain noise --------------------------------------------------------------------
#
# A 16px block repeats every 16px, so any structure at the scale of the whole tile (value noise
# with 8px+ cells, a 4px lattice with a big weight, a sine with period 16...) shows up as a grid
# of identical blobs/stripes over a field of blocks.  Terrain fields are therefore built from
# 1-4px features, high-passed (the |k| <= 1.5 Fourier terms are removed) and quantized with
# per-quadrant balanced ranks so every 8x8 quadrant gets the same shade histogram.

_KF = np.fft.fftfreq(S) * S
_KMAG = np.hypot(_KF[None, :], _KF[:, None])


def _wrap_blur(f, k):
    """Box blur with a ``k`` x ``k`` window that wraps around the tile edges."""
    out = np.zeros_like(np.asarray(f, float))
    for dy in range(k):
        for dx in range(k):
            out += np.roll(f, (dy - k // 2, dx - k // 2), (0, 1))
    return out / (k * k)


def _hipass(f, amt=0.92, kmax=1.5):
    """Remove ``amt`` of the tile-scale energy (0 < |k| <= kmax) from a 16x16 field."""
    f = np.asarray(f, float)
    if f.shape != (S, S):
        return f - amt * _wrap_blur(f, 8)
    F = np.fft.fft2(f)
    F[(_KMAG > 0) & (_KMAG <= kmax)] *= (1.0 - amt)
    return np.real(np.fft.ifft2(F))


def _nrm(f):
    f = np.asarray(f, float)
    sd = f.std()
    return (f - f.mean()) / (sd if sd > 1e-9 else 1.0)


def _grain(seed, w4=0.12, w2=0.4, w1=0.25, ww=0.45, ax=1.0, ay=1.0, hp=0.92, extra=()):
    """Zero-mean tileable terrain field made of small (1-4px) features.

    ``w4``/``w2``/``w1`` weight value noise with 4px / 2px / 1px cells (stretched by ``ax``/``ay``
    for streaky materials), ``ww`` weights white noise, ``extra`` adds (cell_x, cell_y, weight)
    octaves.  Keep ``w4`` <= ~0.15: a 4px lattice is only 4x4 cells per tile and reads as a
    repeating pattern when it dominates.  The result is high-passed (see ``_hipass``)."""
    f = ww * _nrm(_white(seed + ":gw"))
    for k, (cx, cy, w) in enumerate([(4 * ax, 4 * ay, w4), (2 * ax, 2 * ay, w2),
                                     (max(1, ax), max(1, ay), w1)] + list(extra)):
        if w:
            f = f + w * _nrm(_vn(cx, cy, f"{seed}:g{k}"))
    return _hipass(f, hp)


def _blevels(field, weights):
    """``_levels`` done separately in each 8x8 quadrant: every quadrant gets the same shade
    histogram, so no quadrant of the tile is lighter/darker than another (no 16px grid)."""
    out = np.zeros(np.shape(field), int)
    xx, yy = _grid()
    for qy in (0, 1):
        for qx in (0, 1):
            m = (xx // 8 == qx) & (yy // 8 == qy)
            out[m] = _levels(field, weights, m)[m]
    return out


def _declash(idx, top, bottom=0, k=1):
    """Pull top-shade pixels that touch a ``bottom``-or-darker pixel (8-neighbourhood,
    wrapping) down by ``k`` so isolated bright specks never sit next to the darkest shade."""
    idx = np.asarray(idx).copy()
    near_dark = np.zeros(idx.shape, bool)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if dx or dy:
                near_dark |= _roll(idx, dy, dx) <= bottom
    return np.where((idx >= top) & near_dark, idx - k, idx)


def _stroke(idx, x, y, ang, ln, val, under=None):
    """Short 1px stroke of length ``ln`` at angle ``ang`` (degrees) written into ``idx`` (wraps).
    ``under`` (optional) is written one pixel below each point (a soft shadow / highlight)."""
    a = math.radians(ang)
    x1 = x + math.cos(a) * (ln - 1)
    y1 = y - math.sin(a) * (ln - 1)
    pts = _line_pts(x, y, x1, y1)
    for (px, py) in pts:
        _wput(idx, px, py, val)
    if under is not None:
        for (px, py) in pts:
            if idx[(py + 1) % idx.shape[0], px % idx.shape[1]] not in (val,):
                _wput(idx, px, py + 1, under)
    return pts


def _spread_pts(R, n, min_d, size=S, tries=200, avoid=()):
    """``n`` random points in a wrapping ``size`` tile at least ``min_d`` apart (wrapped distance)."""
    pts = list(avoid)
    out = []
    for _ in range(tries):
        if len(out) >= n:
            break
        p = (R.random() * size, R.random() * size)
        ok = True
        for q in pts:
            dx = abs(p[0] - q[0])
            dy = abs(p[1] - q[1])
            dx, dy = min(dx, size - dx), min(dy, size - dy)
            if dx * dx + dy * dy < min_d * min_d:
                ok = False
                break
        if ok:
            pts.append(p)
            out.append(p)
    return out


# =========================================================================
#  full block faces (tileable)
# =========================================================================


LAMP_STYLES = ("cross", "orb", "grid")
BRICK_MORTARS = ("dark", "light")
FLOWER_SHAPES = ("daisy", "tulip", "bell", "star", "orb", "spiral")
MUSHROOM_SHAPES = ("dome", "flat", "tall", "cluster")


def _check_opt(fn, arg, value, valid):
    """Raise ValueError (naming the valid options) for an unknown option string."""
    if value not in valid:
        raise ValueError(f"{fn}(): unknown {arg} {value!r}; expected one of {list(valid)}")


def stone(pal, seed, flecks=True):
    """Vanilla-like stone: fine low-contrast horizontal streaks and clumps (no tile-scale blobs)
    with a few short strokes of varied angle and shade."""
    r = _ramp(pal, 5, 0.12, 0.86)
    f = _grain(seed, w4=0, w2=0, w1=0, ww=0.3, extra=[(5, 1, 0.45), (3, 1, 0.3), (2, 2, 0.15)])
    idx = _blevels(f, [0.03, 0.19, 0.56, 0.19, 0.03])
    if flecks:
        R = _R(seed, "fl")
        for (x, y) in _spread_pts(R, int(R.integers(2, 5)), 5.5):
            ang = float(R.choice([0, 0, 0, 14, -14, 27, -27]))
            ln = int(R.integers(2, 4))
            _stroke(idx, int(x), int(y), ang, ln, 1 if R.random() < 0.6 else 3)
    return _render(_declash(idx, 4), r)


def rough_stone(pal, seed):
    """Cobblestone-like chunks with dark 1px joints and bevelled top-left edges."""
    r = _xramp(pal, 5, dark=1, hi=0.88)  # 6 shades, 0 = joint
    c = _cells(3, 3, seed, jitter=0.9, extra=2)
    R = _R(seed, "c")
    base = R.choice([2, 2, 3, 3, 4], c["n"])
    idx = _chunky(c["ids"], base, _white(seed + ":n"))
    return _render(idx, r)


def dirt(pal, seed):
    """Vanilla dirt: fine brown speckle with tiny clumps and a few 2px pebbles."""
    r = _ramp(pal, 5, 0.08, 0.9)
    f = _grain(seed, w4=0.06, w2=0.18, w1=0.32, ww=0.65)
    idx = _blevels(f, [0.06, 0.22, 0.44, 0.22, 0.06])
    R = _R(seed, "p")
    for (x, y) in _spread_pts(R, int(R.integers(3, 6)), 5.0):
        x, y = int(x), int(y)
        if R.random() < 0.5:
            _wput(idx, x, y, 3)
            _wput(idx, x + 1, y, 2)
            _wput(idx, x, y + 1, 1)
        else:
            _wput(idx, x, y, 1)
            _wput(idx, x + 1, y, 0 if R.random() < 0.5 else 1)
    return _render(_declash(idx, 4), r)


def sand(pal, seed):
    """Fine speckled sand: two main shades with sparse light/dark grains."""
    r = _ramp(pal, 5, 0.05, 0.92)
    f = _grain(seed, w4=0.05, w2=0.14, w1=0.2, ww=0.8)
    idx = _blevels(f, [0.04, 0.2, 0.46, 0.24, 0.06])
    return _render(_declash(idx, 4), r)


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
    """Grass block top coloured directly: dense fine green speckle, a few blade strokes."""
    r = _ramp(pal, 5, 0.15, 0.85)
    f = _grain(seed, w4=0.05, w2=0.16, w1=0.3, ww=0.7)
    idx = _blevels(f, [0.05, 0.22, 0.44, 0.22, 0.07])
    # short blade strokes: a light pixel above a darker one
    R = _R(seed, "bl")
    for (x, y) in _spread_pts(R, 9, 3.2):
        _wput(idx, int(x), int(y), 3)
        _wput(idx, int(x), int(y) + 1, 1)
    return _render(_declash(idx, 4), r)


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
    """Clumpy moss: small round tufts (lit top-left) with darker gaps."""
    r = _ramp(pal, 5, 0.05, 0.9)
    c = _cells(5, 5, seed + ":c", jitter=0.9, extra=3)
    bump = 1 - np.clip(c["d1"] / 2.4, 0, 1)
    lit = np.clip((-c["dx"] - c["dy"]) / 2.5, -1, 1)
    f = 0.42 * _nrm(bump) + 0.3 * _nrm(lit) + 0.45 * _nrm(_white(seed + ":w")) + 0.15 * _nrm(_vn(2, 2, seed + ":a"))
    f = _hipass(f)
    idx = _blevels(f, [0.06, 0.2, 0.42, 0.24, 0.08])
    return _render(_declash(idx, 4), r)


def snow(pal, seed):
    """Bright clean snow: two light shades with sparse 1px cool specks."""
    r = _ramp(pal, 4, 0.45, 1.0)
    f = _grain(seed, w4=0.06, w2=0.3, w1=0.25, ww=0.6, ax=1.4, ay=0.8)
    idx = _blevels(f, [0.0, 0.03, 0.37, 0.6])
    R = _R(seed, "sp")
    for (x, y) in _spread_pts(R, int(R.integers(2, 5)), 5.0):
        _wput(idx, int(x), int(y), 1)
    return _render(idx, r)


def ash(pal, seed):
    """Powdery grey ash: soft fine grain with darker flakes and pale drifts."""
    r = _ramp(pal, 5, 0.1, 0.85)
    f = _grain(seed, w4=0.1, w2=0.36, w1=0.28, ww=0.55, ax=1.3, ay=0.8)
    idx = _blevels(f, [0.04, 0.2, 0.5, 0.21, 0.05])
    R = _R(seed, "fl")
    for (x, y) in _spread_pts(R, 4, 4.5):
        x, y = int(x), int(y)
        _wput(idx, x, y, 0)
        _wput(idx, x + 1, y, 1)
        if R.random() < 0.5:
            _wput(idx, x - 1, y - 1, 3)
    return _render(_declash(idx, 4), r)


def log_side(pal, seed):
    """Bark with vertical streaks / furrows (tileable both ways)."""
    r = _ramp(pal, 5, 0.0, 0.92)
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
    f = 0.5 * _nrm(col[None, :] + np.zeros((S, S))) + 0.35 * _nrm(_vn(2, 6, seed + ":v")) \
        + 0.3 * _nrm(_white(seed + ":w"))
    idx = _blevels(_hipass(f, 0.85), [0.12, 0.24, 0.32, 0.22, 0.1])
    # dark furrow lines that break occasionally
    for _ in range(3):
        x = int(R.integers(0, S))
        y = int(R.integers(0, S))
        ln = int(R.integers(4, 10))
        for k in range(ln):
            _wput(idx, x, y + k, 0)
    return _render(_declash(idx, 4, k=2), r)


def log_top(bark_pal, ring_pal, seed):
    """Log end: concentric rings (square-ish, noisy) inside a bark border."""
    rr = _ramp(ring_pal, 4, 0.0, 0.8)
    br = _ramp(bark_pal, 4, 0.0, 0.9)
    xx, yy = _grid()
    dx, dy = xx - 7.5, yy - 7.5
    d = 0.55 * np.maximum(np.abs(dx), np.abs(dy)) + 0.45 * np.hypot(dx, dy)
    d = d + 0.9 * (_vn(4, 4, seed + ":w", offset=True) - 0.5)
    ring = np.floor(d / 1.75).astype(int)
    idx = np.where(ring % 2 == 0, 2, 1)
    idx = np.where((ring % 2 == 0) & (_white(seed + ":r") > 0.8), 3, idx)
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
    r = _ramp(pal, 5, 0.0, 0.86)
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
    ``spots_pal=[]`` -> no spots (brown-mushroom style).

    2-4 small spots of varied shape (1x2, 2x2, plus, round) spread apart in wrapped space,
    shaded partly toward the cap colour so they do not read as pure white."""
    r = _ramp(pal, 5, 0.1, 0.85)
    f = _grain(seed, w4=0.1, w2=0.42, w1=0.25, ww=0.4)
    idx = _blevels(f, [0.03, 0.2, 0.52, 0.2, 0.05])
    out = _arr(_render(_declash(idx, 4), r))
    if spots_pal is not None and len(spots_pal) == 0:
        return _img(out)
    cap = r[3]
    if spots_pal is None:
        light = _rgb(_palette(pal)[-1])[:3]
        base = [_mix(light, [235, 228, 214], 0.5), _mix(light, [250, 246, 236], 0.7),
                _mix(light, [255, 253, 248], 0.85)]
    else:
        base = list(_ramp(spots_pal, 3))
    # shade the spot ramp partly toward the cap so spots sit *on* the cap
    sp = np.array([_mix(base[0], cap, 0.4), _mix(base[1], cap, 0.15), base[2]])
    R = _R(seed, "spots")
    shapes = {
        "dot2": [(0, 0), (1, 0)],
        "dotv": [(0, 0), (0, 1)],
        "sq": [(0, 0), (1, 0), (0, 1), (1, 1)],
        "plus": [(1, 0), (0, 1), (1, 1), (2, 1), (1, 2)],
        "round": [(1, 0), (2, 0), (0, 1), (1, 1), (2, 1), (3, 1), (1, 2), (2, 2)],
        "one": [(0, 0)],
    }
    names = ["dot2", "dotv", "sq", "sq", "plus", "plus", "round"]
    n = int(R.integers(2, 5))
    for (cx, cy) in _spread_pts(R, n, 5.5):
        shp = shapes[names[int(R.integers(0, len(names)))]]
        x0, y0 = int(cx), int(cy)
        xs = [p[0] for p in shp]
        ys = [p[1] for p in shp]
        for (ddx, ddy) in shp:
            # light from the top-left: brightest on the upper-left pixels of the spot
            t = (ddx - min(xs)) + (ddy - min(ys))
            span = max(1, (max(xs) - min(xs)) + (max(ys) - min(ys)))
            k = 2 if t <= span * 0.34 else (1 if t <= span * 0.75 else 0)
            out[(y0 + ddy) % S, (x0 + ddx) % S, :3] = sp[k]
        # a darker contact shadow under the spot
        for (ddx, ddy) in shp:
            X, Y = (x0 + ddx) % S, (y0 + ddy + 1) % S
            if (ddx, ddy + 1) not in shp:
                out[Y, X, :3] = _mix(out[Y, X, :3], r[0], 0.35)
    return _img(out)


def mushroom_stem(pal, seed):
    """Pale stem: fine, soft vertical fibres."""
    r = _ramp(pal, 4, 0.05, 0.85)
    f = _grain(seed, w4=0, w2=0, w1=0, ww=0.45, extra=[(1, 4, 0.42), (2, 3, 0.18), (1, 2, 0.22)])
    idx = _blevels(f, [0.08, 0.3, 0.44, 0.18])
    return _render(_declash(idx, 3), r)


def crystal(pal, seed, shards=7):
    """Faceted crystal: overlapping diagonal shards with bright highlight edges."""
    r = _xramp(pal, 5, light=1)  # 6 shades, 5 = edge highlight
    xx, yy = _grid()
    X, Y = xx + 0.5, yy + 0.5
    f = _grain(seed + ":bg", w4=0.12, w2=0.4, w1=0.25, ww=0.45)
    idx = _blevels(f, [0.5, 0.35, 0.15])  # background 0..2
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
    """Irregular ore clusters (4-9px, several shades, dark rims) spread over ``stone_img``."""
    base = _arr(stone_img.resize((S, S), Image.NEAREST))
    r = _xramp(ore_pal, 4, dark=1, light=1)  # 6 shades
    R = _R(seed, "ore")
    n = int(clusters or R.integers(4, 7))
    blob = np.zeros((S, S), bool)
    shade = np.zeros((S, S), int)
    for (cx, cy) in _spread_pts(R, n, 5.2 if n <= 5 else 4.4):
        size = int(R.integers(4, 10))
        # random growth with a per-cluster stretch -> irregular, non-stamp shapes
        sx, sy = R.uniform(0.6, 1.6), R.uniform(0.6, 1.6)
        pts = [(int(cx), int(cy))]
        pset = set(pts)
        while len(pts) < size:
            px, py = pts[int(R.integers(0, len(pts)))]
            ddx, ddy = [(1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, 1)][int(R.integers(0, 6))]
            q = (px + ddx, py + ddy)
            if q in pset:
                continue
            if math.hypot((q[0] + 0.5 - cx) / sx, (q[1] + 0.5 - cy) / sy) > 2.4:
                continue
            pts.append(q)
            pset.add(q)
        tone = int(R.integers(0, 2))
        for (px, py) in pts:
            X, Y = px % S, py % S
            blob[Y, X] = True
            shade[Y, X] = tone
    m = blob
    up, left = _roll(m, 1, 0), _roll(m, 0, 1)
    down, right = _roll(m, -1, 0), _roll(m, 0, -1)
    w = _white(seed + ":k")
    k = 2 + shade + (w > 0.6)  # 2..4 interior, varied per cluster
    k = np.where(~up & ~left, 5, np.where(~up | ~left, np.maximum(k, 4) if R.random() < 0.5 else k + 1, k))
    k = np.where((~down | ~right) & up & left, np.minimum(k, 2), k)
    k = np.where(~down & ~right & up & left, 1, k)
    k = np.clip(k, 1, 5)
    out = base.copy()
    out[m, :3] = r[k[m]]
    # dark rim hugging the bottom/right outside of each cluster
    rim = ~m & (_roll(m, 1, 0) | _roll(m, 0, 1))
    out[rim, :3] = _mix(base[rim, :3], r[0], 0.55)
    return _img(out)


def lamp(pal, seed, style="cross"):
    """Light block: dark frame, glowing core (style: cross | orb | grid)."""
    _check_opt("lamp", "style", style, LAMP_STYLES)
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
    """Running-bond bricks (8x3 + 1px mortar), bevelled, per-brick variation.
    ``mortar``: dark | light."""
    _check_opt("bricks", "mortar", mortar, BRICK_MORTARS)
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
    """Glazed square tiles with grout lines, bevel and a gloss glint.  ``size`` is snapped to a
    divisor of 16 (2, 4, 8, 16) so every tile on the face has the same size."""
    size = _snap_div(size, (2, 4, 8, 16))
    r = _xramp(pal, 4, light=1, hi=0.9)
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
    """Corroded metal: a riveted metal plate (``metal``) eaten by patchy orange rust with
    dark pits and short rust runs dripping down.  ``pal`` is the rust palette (dark->light);
    the bare metal is a desaturated, darker version of it."""
    r = _ramp(pal, 5, 0.0, 0.92)
    metal_pal = shift(pal, 0, 0.18, 0.85)
    out = _arr(metal(metal_pal, seed + ":m"))
    # patch mask: medium-scale clumps (no tile-scale blob) covering ~55% of the plate
    f = _grain(seed + ":p", w4=0.15, w2=0.6, w1=0.2, ww=0.15)
    xx, yy = _grid()
    frame = (np.minimum(np.minimum(xx, yy), np.minimum(S - 1 - xx, S - 1 - yy)) == 0)
    cover = (_blevels(f, [0.56, 0.44]) == 1) & ~(frame & (_white(seed + ":fr") < 0.7))
    shade = _blevels(_grain(seed + ":s", w4=0.1, w2=0.45, w1=0.25, ww=0.35), [0.12, 0.3, 0.38, 0.2])  # 0..3
    edge = cover & ~(_roll(cover, 1, 0) & _roll(cover, -1, 0) & _roll(cover, 0, 1) & _roll(cover, 0, -1))
    k = np.where(edge, np.maximum(shade, 2), shade + 1)  # flaky lighter rim
    out[cover, :3] = r[np.clip(k[cover], 0, 4)]
    R = _R(seed, "pit")
    # pits: dark core with a lit lower-right lip
    for (x, y) in _spread_pts(R, int(R.integers(4, 7)), 3.5):
        x, y = int(x), int(y)
        out[y % S, x % S, :3] = _mix(r[0], [0, 0, 0], 0.35)
        out[(y + 1) % S, (x + 1) % S, :3] = r[3]
    # rust runs: 3-6px vertical streaks below some patches
    for _ in range(int(R.integers(2, 4))):
        x, y = (int(v) for v in R.integers(0, S, 2))
        for kk in range(int(R.integers(3, 7))):
            out[(y + kk) % S, x % S, :3] = r[1 if kk % 3 else 2]
    return _img(out)


def circuit(bg_pal, trace_pal, seed):
    """Circuit board: noisy substrate, wrapping traces with pads, and a chip."""
    bg = _ramp(bg_pal, 4)
    tr = _xramp(trace_pal, 3, light=1)
    f = _grain(seed, w4=0.1, w2=0.35, w1=0.25, ww=0.5)
    bidx = _blevels(f, [0.08, 0.5, 0.34, 0.08])
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
    chip_col = _mix(_darker(bg[0], 0.5), [18, 18, 22], 0.5)
    out[chip, :3] = chip_col
    top = chip & (~_roll(chip, 1, 0) | ~_roll(chip, 0, 1))
    out[top, :3] = _mix(chip_col, [150, 150, 160], 0.35)
    for x in range(cx, cx + cw):
        if (x - cx) % 2 == 0:
            out[(cy - 1) % S, x % S, :3] = tr[3]
            out[(cy + ch) % S, x % S, :3] = tr[2]
    out[(cy + 1) % S, (cx + 1) % S, :3] = _mix(chip_col, tr[3], 0.6)
    return _img(out)


def flesh(pal, vein_pal, seed):
    """Fleshy bulging cells with wet highlights, crossed by 1px branching veins."""
    r = _xramp(pal, 5, light=1, lo=0.22, hi=0.9)
    v = _ramp(vein_pal, 3)
    c = _cells(4, 4, seed + ":c", jitter=1.0, extra=2)
    edge = c["d2"] - c["d1"]
    bulge = 1 - np.clip(c["d1"] / 3.4, 0, 1)
    light = np.clip((-c["dx"] - c["dy"]) / 4, -1, 1)
    f = _hipass(0.5 * _nrm(bulge) + 0.32 * _nrm(light) + 0.28 * _nrm(_white(seed + ":w")))
    idx = _blevels(f, [0.06, 0.22, 0.38, 0.24, 0.1])
    idx = np.where(edge < 0.5, np.maximum(idx - 1, 0), idx)  # soft creases between cells
    out = _arr(_render(idx, r))
    # branching veins: random walks that wrap, each spawning short side branches
    R = _R(seed, "veins")
    vein = np.zeros((S, S), int)  # 0 none, 1 thin (light vein), 2 main (dark vein)

    def walk(x, y, ang, n, kind, depth):
        for i in range(n):
            ang += R.uniform(-0.55, 0.55)
            x += math.cos(ang)
            y += math.sin(ang)
            X, Y = int(math.floor(x)) % S, int(math.floor(y)) % S
            vein[Y, X] = max(vein[Y, X], kind)
            if depth < 2 and R.random() < 0.16:
                walk(x, y, ang + R.choice([-1, 1]) * R.uniform(0.7, 1.2), int(R.integers(2, 5)), 1, depth + 1)

    for (sx, sy) in _spread_pts(R, 2, 7.0):
        walk(sx, sy, R.uniform(0, math.tau), int(R.integers(12, 18)), 2, 0)
    main = vein == 2
    thin = vein == 1
    # veins must read against any flesh tone: pull them toward the vein palette's dark end and
    # keep at least ~45 luminance below the flesh they cross
    flesh_l = _lum(out[..., :3])
    vdark = np.array(v[0], float)
    vmid = np.array(v[1], float)
    out[main, :3] = np.where((flesh_l[main] - _lum(vdark) < 45)[:, None], _mix(vdark, [0, 0, 0], 0.4), vdark)
    out[thin, :3] = np.where((flesh_l[thin] - _lum(vmid) < 30)[:, None], vdark, vmid)
    # a lit edge on the vein (raised), top-left of each main vein pixel
    lit = ~main & ~thin & _roll(main, -1, 0)
    out[lit, :3] = _mix(out[lit, :3], v[2], 0.55)
    # wet highlights up-left of the cell centres
    for (px, py) in c["pts"]:
        hx, hy = int(px - 1.2) % S, int(py - 1.2) % S
        if vein[hy, hx] == 0 and edge[hy, hx] > 0.8:
            out[hy, hx, :3] = r[5]
            if vein[hy, (hx + 1) % S] == 0:
                out[hy, (hx + 1) % S, :3] = r[4]
    return _img(out)


def goo(pal, seed, alpha=200):
    """Semi-translucent goo with smooth fine swirls (period 8, never tile-sized) and a couple of
    ringed bubbles."""
    r = _xramp(pal, 4, light=1, hi=0.9)
    xx, yy = _grid()
    w = _grain(seed + ":w", w4=0.15, w2=0.5, w1=0.15, ww=0.0)
    s = np.sin((xx + yy) * 2 * math.pi / 8 + 1.3 * _nrm(w))
    f = _hipass(0.85 * _nrm(s) + 0.15 * _nrm(_white(seed + ":n")))
    idx = _blevels(f, [0.2, 0.45, 0.25, 0.1])
    out = _arr(_render(idx, r))
    out[..., 3] = alpha - 20 + 40 * idx / 3
    R = _R(seed, "b")
    for (cx, cy) in _spread_pts(R, int(R.integers(2, 4)), 7.0):
        rad = 1.5 + R.random() * 0.9
        for (x, y) in _disc_pts(cx, cy, rad):
            dd = math.hypot(x + 0.5 - cx, y + 0.5 - cy)
            X, Y = x % S, y % S
            # ring lit on the lower right, shadowed upper left, darker core: the bubble's mean
            # brightness matches the goo around it (no light/dark quadrant -> no 16px grid)
            if dd > rad - 0.95:
                lit = (x + 0.5 - cx) + (y + 0.5 - cy) > 0
                out[Y, X, :3] = r[3] if lit else r[0]
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


def _snap_div(v, choices=(1, 2, 4, 8, 16)):
    """Snap a period to the nearest divisor of the 16px tile (log scale) so it wraps cleanly."""
    v = max(1.0, float(v))
    return min(choices, key=lambda c: (abs(math.log2(c) - math.log2(v)), c))


def checker(a_hex, b_hex, size=4):
    """Flat checkerboard of two colours (``size`` px squares).  ``size`` is snapped to a divisor
    of 16 (1, 2, 4, 8, 16) so the board tiles without a seam."""
    size = _snap_div(size)
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
    f = _grain(seed, w4=0.1, w2=0.4, w1=0.25, ww=0.45)
    idx = 2 + _blevels(f, [0.15, 0.65, 0.2])  # 2..4
    R = _R(seed, "h")
    for (cx, cy) in _spread_pts(R, int(R.integers(3, 6)), 5.0):
        rad = 0.9 + R.random() * 1.3
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
    """Smooth waxy surface: gentle fine mottling with glossy flecks."""
    r = _ramp(pal, 4, 0.25, 0.85)
    f = _grain(seed, w4=0.12, w2=0.5, w1=0.25, ww=0.2)
    idx = _blevels(f, [0.1, 0.4, 0.4, 0.1])
    R = _R(seed, "g")
    for (x, y) in _spread_pts(R, 3, 5.5):
        x, y = int(x), int(y)
        _wput(idx, x, y, 3)
        _wput(idx, x + 1, y, 3)
        _wput(idx, x, y + 1, 2)
    return _render(_declash(idx, 3), r)


def scales(pal, seed):
    """Overlapping rows of round scales; each scale's rounded bottom edge is outlined."""
    r = _xramp(pal, 4, dark=1, light=1, hi=0.85)  # 6
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
    idx = np.where(n > 0.88, np.minimum(idx + 1, 4), idx)
    idx = np.where(tq > 0.72, 2, idx)
    idx = np.where(tq > 0.86, 1, idx)
    idx = np.where(under, 2, idx)
    idx = np.where(under & (tdx > 0), 1, idx)
    idx = np.where((tq > 0.86) & (tdy > ry * 0.55), 0, idx)
    return _render(np.clip(idx, 0, 5), r)


def bone(pal, seed):
    """Bone block side: pale bone with soft lengthwise (vertical) ridges and a few pores."""
    r = _ramp(pal, 5, 0.3, 0.97)
    R = _R(seed, "ridges")
    # column profile: 3-5px ridges, lit on the left edge, shaded on the right edge
    col = np.zeros(S)
    x = int(R.integers(0, 4))
    while x < S + 4:
        w = int(R.integers(3, 6))
        for k in range(w):
            u = k / max(1, w - 1)
            col[(x + k) % S] = 0.6 - 1.2 * abs(u - 0.35)
        x += w
    f = 0.62 * _nrm(col[None, :] + np.zeros((S, S))) + 0.28 * _nrm(_vn(1, 5, seed + ":f")) \
        + 0.22 * _nrm(_white(seed + ":w"))
    idx = _blevels(_hipass(f, 0.6), [0.03, 0.17, 0.42, 0.3, 0.08])
    for (px, py) in _spread_pts(R, int(R.integers(3, 6)), 4.5):
        x, y = int(px), int(py)
        _wput(idx, x, y, 0)
        _wput(idx, x, y + 1, 1)
        _wput(idx, x + 1, y + 1, 3)
    return _render(_declash(idx, 4), r)


def ice(pal, seed, alpha=(185, 228)):
    """Translucent ice with white cracks and diagonal light streaks."""
    r = _xramp(pal, 4, light=1)
    xx, yy = _grid()
    f = _grain(seed, w4=0.12, w2=0.45, w1=0.25, ww=0.4)
    idx = 1 + _blevels(f, [0.25, 0.5, 0.25])  # 1..3
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
    f = _grain(seed, w4=0.1, w2=0.42, w1=0.25, ww=0.42)
    idx = 1 + _blevels(f, [0.15, 0.45, 0.3, 0.1])  # 1..4
    R = _R(seed, "p")
    for (px, py) in _spread_pts(R, int(R.integers(8, 12)), 3.6):
        x, y = int(px), int(py)
        _wput(idx, x, y, 0)
        _wput(idx, x - 1, y - 1, 5 if R.random() < 0.5 else 4)
        _wput(idx, x - 1, y, 4)
        _wput(idx, x, y - 1, 4)
        _wput(idx, x + 1, y, 1)
        _wput(idx, x, y + 1, 1)
    return _render(idx, r)


def salt(pal, seed):
    """Packed cubic salt crystals with lit tops and shaded sides."""
    r = _ramp(pal, 5)
    c = _cells(4, 4, seed + ":c", jitter=1.0, extra=3)
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
    """Very dark glassy stone with faint lighter flaky patches and rare glints."""
    r = _ramp(pal, 5)
    f = _grain(seed + ":r", w4=0.15, w2=0.6, w1=0.25, ww=0.1)
    idx = _blevels(f, [0.36, 0.32, 0.2, 0.09, 0.03])
    R = _R(seed, "gl")
    for (x, y) in _spread_pts(R, 2, 6.0):
        _wput(idx, int(x), int(y), 4)
        _wput(idx, int(x) + 1, int(y) - 1, 3)
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
    """Glossy diagonal candy stripes.  The stripe pair count per tile is rounded to an integer
    (``round(16 / (2 * width))``) so stripes of any ``width`` wrap seamlessly; when 2*width does
    not divide 16 the bands differ by at most 1px."""
    ra = _color_ramp(a_hex, 4, spread=0.7)
    rb = _color_ramp(b_hex, 4, spread=0.7)
    xx, yy = _grid()
    nb = 2 * max(1, int(round(S / (2 * max(1.0, float(width))))))  # bands per 16 diagonal px
    t = (xx + yy) % S
    band = (t * nb) // S
    start = -((-band * S) // nb)  # first diagonal coordinate of each band (ceil)
    end = -((-(band + 1) * S) // nb) - 1
    out = np.zeros((S, S, 4))
    out[..., 3] = 255
    n = _white(seed + ":n")
    for y in range(S):
        for x in range(S):
            rr = ra if band[y, x] % 2 == 0 else rb
            k = 2
            if t[y, x] == start[y, x]:
                k = 3
            elif t[y, x] == end[y, x] and end[y, x] > start[y, x]:
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
    f = _grain(seed, w4=0.1, w2=0.4, w1=0.25, ww=0.45)
    idx = 1 + _blevels(f, [0.12, 0.33, 0.4, 0.15])  # 1..4
    chip = _darker(_darker(r[0], 0.7), 0.75)
    chip_hi = _mix(r[0], chip, 0.4)
    out = _arr(_render(idx, r))
    R = _R(seed, "c")
    for (fx, fy) in _spread_pts(R, int(R.integers(4, 6)), 5.0):
        x, y = int(fx), int(fy)
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
    """Corrugated cardboard: hard vertical flute lines every 2-3px, fibres, and a crease or a
    strip of packing tape."""
    r = _ramp(pal, 4, 0.1, 0.9)
    R = _R(seed, "f")
    f = _grain(seed, w4=0.05, w2=0.2, w1=0.25, ww=0.6)
    idx = 1 + _blevels(f, [0.15, 0.7, 0.15])  # 1..3
    # flutes: alternate 2 / 3 px spacing so the pattern still wraps on 16px (3+3+2+3+3+2 = 16)
    period = [3, 3, 2, 3, 3, 2]
    off = int(R.integers(0, S))
    x = 0
    for p in period:
        col = (x + off) % S
        idx[:, col] = 0
        idx[:, (col + 1) % S] = np.minimum(idx[:, (col + 1) % S] + 1, 3)
        x += p
    if R.random() < 0.5:
        # horizontal crease: dark line with a lit edge under it
        y = int(R.integers(3, 13))
        idx[y, :] = 0
        idx[(y + 1) % S, :] = 3
    else:
        # strip of shiny packing tape (lighter, flutes faint through it)
        y = int(R.integers(2, 10))
        tape = _mix(_lighter(r[3], 0.45), [236, 220, 170], 0.35)
        out = _arr(_render(idx, r))
        for yy in range(y, y + 4):
            for xx in range(S):
                base = out[yy, xx, :3]
                out[yy, xx, :3] = _mix(base, tape, 0.72 if idx[yy, xx] else 0.55)
        out[y, :, :3] = _mix(out[y, :, :3], [255, 250, 230], 0.25)
        out[y + 3, :, :3] = _mix(out[y + 3, :, :3], [0, 0, 0], 0.2)
        return _img(out)
    return _render(idx, r)


def sponge(pal, seed):
    """Porous sponge: round pores of varied size with lit lower rims."""
    r = _ramp(pal, 5)
    R = _R(seed, "s")
    f = _grain(seed, w4=0.1, w2=0.4, w1=0.25, ww=0.45)
    idx = 2 + _blevels(f, [0.2, 0.55, 0.25])  # 2..4
    for (cx, cy) in _spread_pts(R, 12, 3.4):
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
    """TV static: random greys with a couple of brighter / darker scanlines.

    Animate by generating ``frame=0..n-1`` and stacking them with ``animated(frames,
    interpolate=False)`` -- interpolating per-frame noise just produces a grey blur.  The
    returned image is tagged so ``animated(frames)`` already uses ``interpolate=False``."""
    g = np.array([[16, 16, 18], [64, 64, 68], [118, 118, 122], [178, 178, 182], [236, 236, 238]], float)
    R = _R(seed, f"st{frame}")
    w = R.random((S, S))
    rows = R.random(S)
    w = w + np.where(rows > 0.85, 0.25, 0)[:, None] - np.where(rows < 0.12, 0.25, 0)[:, None]
    idx = _levels(w, [0.18, 0.24, 0.24, 0.2, 0.14])
    return _tag_frames([_render(idx, g)], 1, False)[0]


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


def marble(pal, seed):
    """Polished marble: light base with thin meandering diagonal veins."""
    r = _ramp(pal, 5)
    xx, yy = _grid()
    t = 2 * ((xx + yy * 0.5) / 16 + 1.4 * _fbm2(8, 8, seed + ":t", 3))
    vein = _contour(t, 2, 1)
    base = _grain(seed + ":b", w4=0.14, w2=0.55, w1=0.2, ww=0.25)
    idx = 2 + _blevels(base, [0.3, 0.58, 0.12])  # 2..4, the top shade only in small clumps
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
    """Smooth clay: very low contrast fine mottling, a few specks."""
    r = _ramp(pal, 4, 0.3, 0.78)
    f = _grain(seed, w4=0.1, w2=0.3, w1=0.25, ww=0.5)
    idx = _blevels(f, [0.05, 0.43, 0.45, 0.07])
    return _render(_declash(idx, 3), r)


def terracotta(pal, seed):
    """Flat fired clay with subtle fine mottling (no bright specks)."""
    r = _ramp(pal, 4, 0.3, 0.68)
    f = _grain(seed, w4=0.1, w2=0.42, w1=0.25, ww=0.35)
    idx = _blevels(f, [0.05, 0.47, 0.43, 0.05])
    return _render(_declash(idx, 3, bottom=1), r)


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


# =========================================================================
#  sprite helpers
# =========================================================================


class _Cv:
    """Tiny RGBA float canvas for sprites."""

    def __init__(self, w=S, h=S):
        self.w, self.h = w, h
        self.a = np.zeros((h, w, 4))

    def _map(self, x, y):
        """Canonical pixel -> canvas pixel (applies the active item transform, if any)."""
        x, y = int(math.floor(x)), int(math.floor(y))
        if _XF is not None and (self.w, self.h) == (S, S):
            fx, fy = _XF.fwd(x + 0.5, y + 0.5)
            x, y = int(math.floor(fx)), int(math.floor(fy))
        return x, y

    def px(self, x, y, c, alpha=255):
        x, y = self._map(x, y)
        if 0 <= x < self.w and 0 <= y < self.h:
            self.a[y, x, :3] = np.asarray(c, float)[:3]
            self.a[y, x, 3] = alpha

    def has(self, x, y):
        x, y = self._map(x, y)
        return 0 <= x < self.w and 0 <= y < self.h and self.a[y, x, 3] > 0

    def line(self, x0, y0, x1, y1, c, alpha=255):
        for (x, y) in _line_pts(math.floor(x0), math.floor(y0), math.floor(x1), math.floor(y1)):
            self.px(x, y, c, alpha)

    def fill(self, mask, c, alpha=255):
        c = np.asarray(c, float)
        if c.ndim == 1:
            self.a[mask, :3] = c[:3]
        else:
            self.a[mask, :3] = c[mask][..., :3]
        self.a[mask, 3] = alpha if np.ndim(alpha) == 0 else alpha[mask]

    def paint(self, mask, idx, ramp, alpha=255):
        """Fill ``mask`` with ramp colours chosen by the index array ``idx``."""
        ramp = np.asarray(ramp, float)
        ii = np.clip(idx, 0, len(ramp) - 1)
        self.a[mask, :3] = ramp[ii[mask]][..., :3]
        self.a[mask, 3] = alpha if np.ndim(alpha) == 0 else alpha[mask]

    def over(self, other):
        """Composite another canvas on top of this one (binary alpha wins)."""
        m = other.a[..., 3] > 0
        self.a[m] = other.a[m]
        return self

    @property
    def mask(self):
        return self.a[..., 3] > 0

    def img(self):
        return _img(self.a)


class _Xform:
    """Canonical -> image affine transform (mirror, rotation, scale, shift about a centre) used
    to vary item icon shapes per seed.  While one is active (``_XF``), ``_mgrid`` returns
    canonical coordinates for every image pixel and ``_Cv.px`` maps canonical pixels to the
    image, so every shape helper follows the transform automatically."""

    def __init__(self, ang=0.0, scale=1.0, mirror=False, dx=0.0, dy=0.0, cx=8.0, cy=8.0):
        self.cx, self.cy, self.dx, self.dy = cx, cy, dx, dy
        self.mx = -1.0 if mirror else 1.0
        c, s_ = math.cos(ang) * scale, math.sin(ang) * scale
        # image = centre + shift + M @ (canonical - centre),  M = rot*scale @ diag(mx, 1)
        self.m = np.array([[c * self.mx, -s_], [s_ * self.mx, c]])
        self.mi = np.linalg.inv(self.m)

    def fwd(self, x, y):
        u, v = x - self.cx, y - self.cy
        return (self.cx + self.dx + self.m[0, 0] * u + self.m[0, 1] * v,
                self.cy + self.dy + self.m[1, 0] * u + self.m[1, 1] * v)

    def inv(self, X, Y):
        u, v = X - self.cx - self.dx, Y - self.cy - self.dy
        return (self.cx + self.mi[0, 0] * u + self.mi[0, 1] * v,
                self.cy + self.mi[1, 0] * u + self.mi[1, 1] * v)

    def vec_inv(self, vx, vy):
        """Image-space direction -> canonical direction (for keeping the light top-left)."""
        return self.mi[0, 0] * vx + self.mi[0, 1] * vy, self.mi[1, 0] * vx + self.mi[1, 1] * vy


_XF = None  # active _Xform while an item icon is drawn


def _mgrid(w=S, h=S):
    yy, xx = np.mgrid[0:h, 0:w]
    X, Y = xx + 0.5, yy + 0.5
    if _XF is not None and (w, h) == (S, S):
        return _XF.inv(X, Y)
    return X, Y


def _igrid():
    """Image-space pixel centres (ignores the item transform)."""
    yy, xx = np.mgrid[0:S, 0:S]
    return xx + 0.5, yy + 0.5


def _ellipse(cx, cy, rx, ry, w=S, h=S):
    X, Y = _mgrid(w, h)
    return ((X - cx) / rx) ** 2 + ((Y - cy) / ry) ** 2 <= 1.0


def _poly(pts, w=S, h=S):
    """Mask of pixels whose centre lies inside polygon ``pts``."""
    X, Y = _mgrid(w, h)
    inside = np.zeros((h, w), bool)
    n = len(pts)
    for i in range(n):
        x0, y0 = pts[i]
        x1, y1 = pts[(i + 1) % n]
        cond = ((y0 > Y) != (y1 > Y))
        with np.errstate(divide="ignore", invalid="ignore"):
            xint = (x1 - x0) * (Y - y0) / ((y1 - y0) if y1 != y0 else 1e-9) + x0
        inside ^= cond & (X < xint)
    return inside


def _thick(pts_list, w=S, h=S, rad=0.75):
    """Mask of a thick polyline (distance to segments < rad)."""
    X, Y = _mgrid(w, h)
    m = np.zeros((h, w), bool)
    for (x0, y0), (x1, y1) in zip(pts_list[:-1], pts_list[1:]):
        dx, dy = x1 - x0, y1 - y0
        L2 = dx * dx + dy * dy or 1e-9
        t = np.clip(((X - x0) * dx + (Y - y0) * dy) / L2, 0, 1)
        d = np.hypot(X - (x0 + t * dx), Y - (y0 + t * dy))
        m |= d < rad
    return m


def _dist_in(mask, cap=8):
    """Steps of 4-neighbour erosion until each pixel disappears (edge pixels = 1)."""
    d = np.zeros(mask.shape)
    cur = mask.copy()
    k = 0
    while cur.any() and k < cap:
        k += 1
        d[cur] = k
        p = np.pad(cur, 1)
        cur = p[1:-1, 1:-1] & p[:-2, 1:-1] & p[2:, 1:-1] & p[1:-1, :-2] & p[1:-1, 2:]
    return d


def _shade(mask, light=(-1.0, -1.1), depth=2.5, nz=0.55, flat=0.0):
    """Pseudo-3D lighting of an arbitrary mask: 0 (dark) .. 1 (lit), top-left light."""
    d = _dist_in(mask)
    h = np.sqrt(np.minimum(d, depth) / depth)
    p = np.pad(h, 1)
    gx = (p[1:-1, 2:] - p[1:-1, :-2]) / 2
    gy = (p[2:, 1:-1] - p[:-2, 1:-1]) / 2
    nx, ny = -gx, -gy
    nn = np.sqrt(nx * nx + ny * ny + nz * nz)
    lx, ly = light
    lz = 1.0
    ln = math.sqrt(lx * lx + ly * ly + lz * lz)
    dot = (nx * lx + ny * ly + nz * lz) / (nn * ln)
    s = np.clip(0.5 + 0.5 * dot + flat, 0, 1)
    return np.where(mask, s, 0)


def _sphere(cx, cy, rad, w=S, h=S, light=(-0.55, -0.65, 0.55)):
    """(mask, shade 0..1) for a lit sphere/disc."""
    X, Y = _mgrid(w, h)
    dx, dy = (X - cx) / rad, (Y - cy) / rad
    r2 = dx * dx + dy * dy
    m = r2 <= 1.0
    nz = np.sqrt(np.clip(1 - r2, 0, 1))
    L = np.array(light, float)
    if _XF is not None and (w, h) == (S, S):  # keep the light top-left in image space
        lx, ly = _XF.vec_inv(L[0], L[1])
        n0 = math.hypot(L[0], L[1]) / max(1e-9, math.hypot(lx, ly))
        L[0], L[1] = lx * n0, ly * n0
    L /= np.linalg.norm(L)
    s = np.clip(dx * L[0] + dy * L[1] + nz * L[2], 0, 1)
    return m, np.where(m, s, 0)


def _outline(cv, k=0.45, color=None, diag=False):
    """Add a 1px darker outline outside the opaque pixels (vanilla item style)."""
    a = cv.a
    m = a[..., 3] > 0
    acc = np.zeros(a.shape[:2] + (3,))
    cnt = np.zeros(a.shape[:2])
    offs = [(-1, 0), (1, 0), (0, -1), (0, 1)]
    if diag:
        offs += [(-1, -1), (1, 1), (-1, 1), (1, -1)]
    for dy, dx in offs:
        sm = np.zeros_like(m)
        sc = np.zeros_like(acc)
        ys = slice(max(0, dy), a.shape[0] + min(0, dy))
        yd = slice(max(0, -dy), a.shape[0] + min(0, -dy))
        xs = slice(max(0, dx), a.shape[1] + min(0, dx))
        xd = slice(max(0, -dx), a.shape[1] + min(0, -dx))
        sm[yd, xd] = m[ys, xs]
        sc[yd, xd] = a[ys, xs, :3]
        acc += sc * sm[..., None]
        cnt += sm
    ring = (cnt > 0) & ~m
    for y, x in zip(*np.nonzero(ring)):
        if color is not None:
            c = _rgb(color)[:3]
        else:
            c = _darker(acc[y, x] / cnt[y, x], k)
        a[y, x, :3] = c
        a[y, x, 3] = 255
    return cv


def _inner_outline(cv, k=0.5):
    """Darken the opaque pixels that touch transparency (outline drawn inside)."""
    a = cv.a
    m = a[..., 3] > 0
    p = np.pad(m, 1)
    edge = m & ~(p[:-2, 1:-1] & p[2:, 1:-1] & p[1:-1, :-2] & p[1:-1, 2:])
    for y, x in zip(*np.nonzero(edge)):
        a[y, x, :3] = _darker(a[y, x, :3], k)
    return cv


def _curve(x0, y0, x1, y1, bend=0.0, steps=24):
    """Quadratic curve points from (x0,y0) to (x1,y1); ``bend`` offsets the control point."""
    mx, my = (x0 + x1) / 2, (y0 + y1) / 2
    dx, dy = x1 - x0, y1 - y0
    L = math.hypot(dx, dy) or 1
    cx, cy = mx - dy / L * bend, my + dx / L * bend
    pts = []
    for i in range(steps + 1):
        t = i / steps
        x = (1 - t) ** 2 * x0 + 2 * (1 - t) * t * cx + t * t * x1
        y = (1 - t) ** 2 * y0 + 2 * (1 - t) * t * cy + t * t * y1
        pts.append((x, y))
    return pts


def _plot(cv, pts, color_fn):
    """Plot a sequence of float points as 1px pixels (8-connected, no doubled corners)."""
    last = None
    out = []
    for i, (x, y) in enumerate(pts):
        p = (int(math.floor(x)), int(math.floor(y)))
        if p == last:
            continue
        if last is not None and abs(p[0] - last[0]) > 1 or last is not None and abs(p[1] - last[1]) > 1:
            for q in _line_pts(last[0], last[1], p[0], p[1])[1:-1]:
                out.append((q, i / max(1, len(pts) - 1)))
        out.append((p, i / max(1, len(pts) - 1)))
        last = p
    # remove L-corners: if a, b, c where a and c are diagonal neighbours, drop b
    clean = []
    for j, item in enumerate(out):
        if 0 < j < len(out) - 1:
            (ax, ay), _ = clean[-1] if clean else out[j - 1]
            (cx, cy), _ = out[j + 1]
            if abs(ax - cx) == 1 and abs(ay - cy) == 1:
                continue
        clean.append(item)
    for (p, t) in clean:
        c = color_fn(t)
        if c is not None:
            cv.px(p[0], p[1], c)
    return [p for p, _ in clean]


# =========================================================================
#  plant / cross sprites (16x16, transparent, bottom anchored)
# =========================================================================


def grass_tuft(pal, seed):
    """Short grass: a fan of 1px blades, darker at the base, light tips."""
    r = _ramp(pal, 5, 0.0, 0.85)  # near-white palette tops stay for tiny tips only
    cv = _Cv()
    R = _R(seed, "t")
    nb = int(R.integers(7, 10))
    blades = []
    for i in range(nb):
        x0 = 2.5 + i * (10.5 / (nb - 1)) + R.uniform(-0.6, 0.6)
        centre = 1 - abs(x0 - 8) / 7
        h = 5 + centre * 7 + R.uniform(-1.5, 2.5)
        lean = (x0 - 8) / 6 * R.uniform(1.0, 3.0) + R.uniform(-1, 1)
        shade = int(R.integers(0, 2))
        blades.append((shade, x0, h, lean))
    blades.sort(key=lambda b: b[0])
    for shade, x0, h, lean in blades:
        pts = [(x0 + lean * (k / 20) ** 1.7, 15.5 - h * k / 20) for k in range(21)]

        def col(t, shade=shade):
            k = 0 + shade if t < 0.25 else (1 + shade if t < 0.55 else (2 + shade if t < 0.85 else 3 + shade))
            return r[min(4, k)]
        _plot(cv, pts, col)
    return cv.img()


def _tall_plant(pal, seed):
    r = _ramp(pal, 5, 0.0, 0.85)
    cv = _Cv(S, 2 * S)
    R = _R(seed, "tall")
    blades = []
    for i in range(int(R.integers(4, 6))):  # long blades reaching into the top half
        x0 = 4 + i * 2.2 + R.uniform(-0.8, 0.8)
        h = R.uniform(20, 29)
        lean = (x0 - 8) / 4 * R.uniform(1, 3) + R.uniform(-1.5, 1.5)
        blades.append((int(R.integers(0, 2)), x0, h, lean))
    for i in range(int(R.integers(4, 7))):  # short blades at the base
        x0 = 2.5 + R.uniform(0, 11)
        h = R.uniform(5, 12)
        lean = (x0 - 8) / 3 + R.uniform(-1, 1)
        blades.append((0, x0, h, lean))
    blades.sort(key=lambda b: b[0])
    for shade, x0, h, lean in blades:
        pts = [(x0 + lean * (k / 40) ** 1.6, 31.5 - h * k / 40) for k in range(41)]

        def col(t, shade=shade, h=h):
            ht = (h * t) / 29
            k = 0 + shade if ht < 0.15 else (1 + shade if ht < 0.45 else (2 + shade if ht < 0.8 else 3 + shade))
            return r[min(4, k)]
        _plot(cv, pts, col)
    # a couple of side leaves on the long blades
    for shade, x0, h, lean in blades[:3]:
        y = 31 - int(h * 0.45)
        x = x0 + lean * 0.45 ** 1.6
        d = 1 if lean >= 0 else -1
        cv.px(x + d, y - 1, r[2])
        cv.px(x + 2 * d, y - 2, r[3])
    return cv


def tall_plant_bottom(pal, seed):
    """Lower half of a two-block tall plant (pairs with ``tall_plant_top`` for the same seed)."""
    cv = _tall_plant(pal, seed)
    return _img(cv.a[S:])


def tall_plant_top(pal, seed):
    """Upper half of a two-block tall plant (pairs with ``tall_plant_bottom``)."""
    cv = _tall_plant(pal, seed)
    return _img(cv.a[:S])


def _stem(cv, r, x0, top, seed, sway=0.8, leaves=2):
    """1px stem from the bottom row to y=top, with small leaves. Returns the stem points."""
    R = _R(seed, "stem")
    ph = R.uniform(0, math.tau)
    pts = [(x0 + sway * math.sin(ph + k * 0.35), 15.5 - k * (15.5 - top) / 30) for k in range(31)]

    def col(t):
        return r[1] if t < 0.5 else r[2]
    drawn = _plot(cv, pts, col)
    if leaves:
        ys = [12, 9][:leaves]
        sides = [-1, 1] if R.random() < 0.5 else [1, -1]
        for y, sd in zip(ys, sides):
            if y <= top + 2:
                continue
            sx = [p[0] for p in drawn if p[1] == y]
            if not sx:
                continue
            sx = sx[0]
            cv.px(sx + sd, y - 1, r[2])
            cv.px(sx + 2 * sd, y - 1, r[3])
            cv.px(sx + 2 * sd, y - 2, r[3])
            cv.px(sx + sd, y, r[1])
    return drawn


def flower(stem_pal, petal_pal, seed, shape="daisy", center_hex=None):
    """Flower on a 1px stem. shape: daisy | tulip | bell | star | orb | spiral."""
    _check_opt("flower", "shape", shape, FLOWER_SHAPES)
    sr = _ramp(stem_pal, 4)
    pr = _xramp(petal_pal, 4, light=1)  # 5 shades
    R = _R(seed, "fl")
    cv = _Cv()
    cx = 7.5 + R.choice([-0.5, 0.0, 0.5])
    hy = 5.5 + R.uniform(-0.5, 1.0)
    plum = _lum(pr[2])
    if center_hex is not None:
        cc = _color_ramp(center_hex, 3, spread=0.8)
    else:
        cc = _color_ramp("#f0c040" if plum > 150 else _hex(_lighter(pr[3], 0.5)), 3, spread=0.8)
    head = _Cv()
    X, Y = _mgrid()
    if shape == "tulip":
        _stem(cv, sr, cx, hy + 2, seed)
        ix = int(cx)
        top = int(hy) - 2
        rows = [(-2, 2), (-2, 2), (-2, 2), (-1, 1)]
        for j, (a, b) in enumerate(rows):
            for x in range(ix + a, ix + b + 1):
                k = 3 if x < ix else (2 if x == ix else 1)
                if j == 0:
                    k = min(4, k + 1)
                head.px(x, top + 1 + j, pr[k])
        for x in (ix - 2, ix, ix + 2):
            head.px(x, top, pr[4 if x <= ix else 3])
        head.px(ix - 1, top + 2, pr[4])
        head.px(ix + 1, top + 4, pr[0])
    elif shape == "bell":
        # a nodding stem: arches over at the top, 1-3 bells hang from the arch and side twigs
        side = int(R.choice([-1, 1]))
        sx = int(cx) - side + int(R.integers(-1, 2))
        top = int(hy) - 2 + int(R.integers(-1, 2))
        for y in range(top + 1, 16):
            cv.px(sx, y, sr[1] if y > 11 else sr[2])
        reach = int(R.integers(2, 4))
        arch = [(sx, top + 1)] + [(sx + i * side, top) for i in range(1, reach)] + [(sx + reach * side, top + 1)]
        for (x, y) in arch:
            cv.px(x, y, sr[2])
        hangs = [(sx + reach * side, top + 2)]
        nb = int(R.choice([1, 2, 2, 3]))
        used = set()
        for b in range(nb - 1):
            sd = -side if b == 0 else side
            for _ in range(6):
                by_ = int(R.integers(top + 4, 12))
                if by_ not in used and by_ - 1 not in used and by_ + 1 not in used:
                    break
            used.add(by_)
            ln = int(R.integers(2, 4))
            twig = [(sx + sd, by_)] + [(sx + i * sd, by_ - 1) for i in range(2, ln + 1)] + [(sx + (ln + 1) * sd, by_)]
            for (x, y) in twig:
                cv.px(x, y, sr[2])
            hangs.append((sx + (ln + 1) * sd, by_ + 1))
        # a leaf low on the stem
        ly = int(R.integers(11, 14))
        lsd = int(R.choice([-1, 1]))
        cv.px(sx + lsd, ly, sr[2])
        cv.px(sx + 2 * lsd, ly - 1, sr[3])
        for k, (bx, by) in enumerate(hangs):
            big = k == 0 or R.random() < 0.4
            rows = [(0, 1), (-1, 2), (-1, 2), (-2, 3)] if big else [(0, 1), (-1, 2), (-1, 2)]
            bx = bx if side > 0 else bx - 1
            for j, (a, b) in enumerate(rows):
                for x in range(bx + a, bx + b + 1):
                    rel = (x - bx - 0.5) / 2.5
                    kk = 3 if rel < -0.2 else (2 if rel < 0.4 else 1)
                    if j == len(rows) - 1 and a < x - bx < b:
                        kk = 0
                    head.px(x, by + j, pr[kk])
            head.px(bx, by, pr[4])
            head.px(bx - 1, by + 1, pr[4])
    elif shape == "star":
        _stem(cv, sr, cx, hy + 2, seed)
        pts = []
        rot = R.uniform(-0.2, 0.2)
        for k in range(10):
            a = -math.pi / 2 + rot + k * math.pi / 5
            rad = 4.6 if k % 2 == 0 else 2.0
            pts.append((cx + 0.5 + rad * math.cos(a), hy + 0.3 + rad * math.sin(a)))
        m = _poly(pts)
        s = _shade(m, depth=1.5)
        head.paint(m, 1 + _quant(s, 4), pr)
        head.px(cx, hy, cc[2])
    elif shape == "orb":
        _stem(cv, sr, cx, hy + 3, seed, leaves=1)
        m, s = _sphere(cx + 0.5, hy, 3.3)
        head.paint(m, 1 + _quant(s, 4), pr)
        head.px(cx - 1, hy - 2, [255, 255, 255])
        head.px(cx - 2, hy - 1, pr[4])
        _outline(head, 0.62)
        head.px(cx + 4, hy - 4, pr[4])
        head.px(cx - 4, hy + 3, pr[3])
    elif shape == "spiral":
        _stem(cv, sr, cx, hy + 3, seed, leaves=2)
        ccx, ccy = cx + 0.5, hy
        dx, dy = X - ccx, Y - ccy
        d = np.hypot(dx, dy)
        th = np.arctan2(dy, dx)
        m = d < 4.2
        k = (th / math.tau + d / 2.3) % 1.0
        lit = (-dx - dy) / 6
        idx = np.where(k < 0.62, np.clip(np.round(2.5 + lit * 1.5), 1, 4), 0).astype(int)
        idx = np.where(d < 1.0, 4, idx)
        head.paint(m, idx, pr)
        _outline(head, 0.62)
    else:  # daisy
        _stem(cv, sr, cx, hy + 2, seed)
        ccx, ccy = cx + 0.5, hy + 0.5
        dx, dy = X - ccx, Y - ccy
        d = np.hypot(dx, dy)
        ang = np.arctan2(dy, dx)
        npet = int(R.choice([5, 6, 8]))
        petal = (np.cos(ang * npet + R.uniform(0, 1)) * 0.9 + 3.0)
        m = (d < petal) & (d > 0.5)
        lit = (-dx - dy) / (d + 1e-6)
        idx = np.where(lit > 0.3, 4, np.where(lit < -0.5, 2, 3))
        idx = np.where(d > petal - 0.9, idx - 1, idx)
        head.paint(m, idx, pr)
        cm = d < 1.3
        head.paint(cm, np.where(dx + dy < 0, 2, 1), cc)
    if shape == "star":
        _outline(head, 0.62)
    cv.over(head)
    return cv.img()


def mushroom_sprite(cap_pal, stem_pal, seed, shape="dome", spots=None):
    """Small mushroom(s). shape: dome | flat | tall | cluster.

    The seed varies cap sizes, stem heights, positions and lean; ``cluster`` grows 2-3 caps of
    different heights and ``tall`` sometimes gets a small second cone."""
    _check_opt("mushroom_sprite", "shape", shape, MUSHROOM_SHAPES)
    cr = _xramp(cap_pal, 4, dark=1, light=1, hi=0.9)  # 6
    sr = _ramp(stem_pal, 4)
    R = _R(seed, "m")
    cv = _Cv()
    spots = (shape in ("dome", "cluster")) if spots is None else spots
    spot_col = _mix(_lighter(cr[4], 0.7), [255, 255, 250], 0.5)

    def one(cx, base_y, cap_w, cap_h, stem_h, stem_w=2, kind="dome", lean=0.0):
        layer = _Cv()
        stop = base_y - stem_h
        for y in range(int(stop), int(base_y) + 1):
            t = (base_y - y) / max(1, stem_h)
            for i in range(stem_w):
                x = int(cx - stem_w / 2 + 0.5 + lean * t) + i
                k = 3 if i == 0 else (1 if i == stem_w - 1 else 2)
                if y == int(base_y):
                    k = max(0, k - 1)
                layer.px(x, y, sr[k])
        cx = cx + lean
        if kind == "flat":
            m = _ellipse(cx, stop - cap_h * 0.3, cap_w / 2, cap_h * 0.8) & (_mgrid()[1] < stop + 0.5)
        elif kind == "cone":
            pts = [(cx - cap_w / 2, stop + 0.6), (cx, stop - cap_h), (cx + cap_w / 2, stop + 0.6)]
            m = _poly(pts) | _ellipse(cx, stop - 0.2, cap_w / 2, 1.2)
        else:
            m = _ellipse(cx, stop + 0.4, cap_w / 2, cap_h) & (_mgrid()[1] < stop + 0.9)
        s = _shade(m, depth=2.0)
        idx = 1 + _quant(s, 5)
        Y = _mgrid()[1]
        under = m & (Y > stop - 0.1)
        idx = np.where(under, 1, idx)
        layer.paint(m, idx, cr)
        if spots and kind == "dome" and cap_w >= 5:
            cand = [(cx - cap_w * 0.22, stop - cap_h * 0.55), (cx + cap_w * 0.2, stop - cap_h * 0.3),
                    (cx + cap_w * 0.02, stop - cap_h * 0.85), (cx - cap_w * 0.36, stop - cap_h * 0.15),
                    (cx + cap_w * 0.34, stop - cap_h * 0.6)]
            R.shuffle(cand)
            for (sx, sy) in cand[: int(R.integers(2, 4))]:
                if m[int(sy) % S, int(sx) % S]:
                    layer.px(sx, sy, spot_col)
        _inner_outline(layer, 0.75)
        cv.over(layer)
        return m

    if shape == "flat":
        one(7.5 + R.uniform(-0.5, 0.5), 15, int(R.integers(10, 14)), R.uniform(2.0, 2.8), int(R.integers(5, 9)),
            2, "flat", R.choice([-1.0, 0.0, 1.0]))
    elif shape == "tall":
        if R.random() < 0.45:  # a small companion cone behind
            sd = R.choice([-1, 1])
            one(7.5 + sd * R.uniform(3.5, 4.5), 15, int(R.integers(3, 5)), R.uniform(2.4, 3.4), int(R.integers(3, 6)),
                1, "cone")
        one(7.5 + R.uniform(-1, 1), 15, int(R.integers(5, 9)), R.uniform(4.0, 6.5), int(R.integers(6, 11)), 2, "cone",
            R.choice([-1.0, 0.0, 0.0, 1.0]))
    elif shape == "cluster":
        n = int(R.choice([2, 3, 3]))
        slots = sorted(R.choice([4.0, 6.5, 9.0, 11.5], n, replace=False))
        big = int(R.integers(0, n))
        caps = []
        for i, x in enumerate(slots):
            stem_h = int(R.integers(5, 9)) if i == big else int(R.integers(2, 6))
            w = int(R.integers(6, 9)) if i == big else int(R.integers(4, 7))
            caps.append((stem_h, x + R.uniform(-0.5, 0.5), w))
        caps.sort(key=lambda c: -c[0])  # tallest at the back
        for (stem_h, x, w) in caps:
            one(x, 15, w, max(2.0, w * R.uniform(0.42, 0.58)), stem_h, 2 if w >= 5 else 1, "dome")
    else:
        one(7.5 + R.choice([-0.5, 0.5]), 15, int(R.integers(8, 13)), R.uniform(3.6, 5.0), int(R.integers(3, 7)), 2,
            "dome")
    return cv.img()


def sprout(pal, seed):
    """Tiny seedling: a short (possibly curved) stem with two rounded leaves of varied size, and
    sometimes a bud or a second smaller sprout."""
    r = _xramp(pal, 4, light=1, hi=0.85)
    R = _R(seed, "s")
    cv = _Cv()

    def one(x, h, lw, rw, bend, droop):
        pts = [(x + 0.5 + bend * (k / 12) ** 2, 15.5 - h * k / 12) for k in range(13)]
        drawn = _plot(cv, pts, lambda t: r[1] if t < 0.35 else r[2])
        tx, ty = drawn[-1]
        # leaves: rows of a rounded lens on each side, the lit side up
        for sd, w in ((-1, lw), (1, rw)):
            for i in range(1, w + 1):
                lift = 1 if i > 1 else 0
                yy = ty - lift + (droop if i == w else 0)
                k = 3 if sd < 0 else 2
                cv.px(tx + sd * i, yy, r[k])
                if 1 < i < w:
                    cv.px(tx + sd * i, yy + 1, r[k - 1])
                if i == w - 1 and w >= 3:
                    cv.px(tx + sd * i, yy - 1, r[k + 1])
        cv.px(tx, ty - 1, r[3])
        return tx, ty

    x = 7 + int(R.integers(-1, 2))
    h = int(R.integers(3, 8))
    tx, ty = one(x, h, int(R.integers(2, 5)), int(R.integers(2, 5)), R.uniform(-1.5, 1.5), int(R.integers(0, 2)))
    if R.random() < 0.4:
        cv.px(tx, ty - 2, r[4])  # a pale bud
    if R.random() < 0.45:
        sd = R.choice([-1, 1])
        one(x + sd * int(R.integers(4, 6)), int(R.integers(2, 4)), 2, 2, 0.0, 0)
    # soil crumbs
    cv.px(x - 1, 15, r[0])
    cv.px(x + 1, 15, r[0])
    return cv.img()


def fern(pal, seed):
    """Fern: arching fronds with alternating leaflets."""
    r = _ramp(pal, 5, 0.0, 0.85)
    R = _R(seed, "f")
    cv = _Cv()
    n = int(R.integers(4, 6))
    fronds = []
    for i in range(n):
        ang = math.radians(-90 + (i - (n - 1) / 2) * (110 / max(1, n - 1)) + R.uniform(-8, 8))
        ln = R.uniform(9, 13) * (1 - 0.25 * abs(i - (n - 1) / 2) / max(1, n / 2))
        fronds.append((abs(i - (n - 1) / 2), ang, ln))
    fronds.sort(key=lambda f: -f[0])
    for _, ang, ln in fronds:
        x0, y0 = 7.5 + R.uniform(-0.5, 0.5), 15.5
        x1 = x0 + math.cos(ang) * ln
        y1 = y0 + math.sin(ang) * ln
        bend = -2.0 * math.cos(ang)
        pts = _curve(x0, y0, x1, y1, bend=bend, steps=30)
        drawn = _plot(cv, pts, lambda t: r[1] if t < 0.3 else (r[2] if t < 0.8 else r[3]))
        # leaflets on both sides, alternating
        for j, (px, py) in enumerate(drawn):
            if j < 2 or j % 2:
                continue
            t = j / max(1, len(drawn))
            nx, ny = -math.sin(ang), math.cos(ang)
            side = 1 if (j // 2) % 2 else -1
            lx, ly = px + round(nx * side), py + round(ny * side) - (1 if side < 0 else 0)
            if not cv.has(lx, ly):
                cv.px(lx, ly, r[3] if t > 0.4 else r[2])
            if t < 0.7 and not cv.has(lx + round(nx * side), ly + round(ny * side)):
                cv.px(lx + round(nx * side), ly + round(ny * side), r[4] if t > 0.4 else r[3])
    return cv.img()


def crystal_shard_sprite(pal, seed, count=3):
    """Cluster of pointed crystal prisms growing from the bottom."""
    r = _xramp(pal, 4, dark=1, light=1)  # 6
    R = _R(seed, "c")
    cv = _Cv()
    shards = []
    for i in range(count):
        if i == 0:
            x, h, w, tilt = 7.5, R.uniform(11, 14), 5, R.uniform(-0.15, 0.15)
        else:
            side = -1 if i % 2 else 1
            x = 7.5 + side * R.uniform(3.5, 5)
            h = R.uniform(5, 9)
            w = 3 + (R.random() < 0.4) * 2
            tilt = side * R.uniform(0.25, 0.55)
        shards.append((0 if i == 0 else 1, x, h, w, tilt))
    shards.sort(key=lambda s: s[0])
    for _, x, h, w, tilt in shards:
        hw = w / 2
        local = [(-hw, 0), (-hw, -h + hw * 1.2), (0, -h), (hw, -h + hw * 1.2), (hw, 0)]
        ca, sa = math.cos(tilt), math.sin(tilt)
        pts = [(x + px * ca - py * sa, 16 + px * sa + py * ca) for (px, py) in local]
        m = _poly(pts)
        X, Y = _mgrid()
        # local coordinate across the shard
        u = (X - x) * ca + (Y - 16) * sa
        idx = np.where(u < -hw * 0.35, 4, np.where(u > hw * 0.3, 2, 3))
        idx = np.where(np.abs(u + hw * 0.35) < 0.5, 5, idx)
        layer = _Cv()
        layer.paint(m, idx, r)
        _inner_outline(layer, 0.55)
        tipx, tipy = pts[2]
        layer.px(tipx, tipy + 0.6, r[5])
        cv.over(layer)
    return cv.img()


def coral_fan(pal, seed):
    """Sea fan: forking branches spreading from the base, joined by a sparse lace."""
    r = _xramp(pal, 4, light=1, hi=0.85)
    R = _R(seed, "cf")
    cv = _Cv()
    ox, oy = 7.5 + R.uniform(-0.5, 0.5), 15.5
    n = int(R.integers(5, 7))
    tips = []
    for i in range(n):
        a = -math.pi / 2 + (i - (n - 1) / 2) * (2.4 / (n - 1)) + R.uniform(-0.1, 0.1)
        ln = R.uniform(9, 12)
        mx, my = ox + math.cos(a) * ln * 0.45, oy + math.sin(a) * ln * 0.45
        _plot(cv, _curve(ox, oy, mx, my, bend=R.uniform(-1, 1), steps=12),
              lambda t: r[1] if t < 0.5 else r[2])
        for fork in (-0.28, 0.28):
            b = a + fork + R.uniform(-0.1, 0.1)
            ex = mx + math.cos(b) * ln * 0.55
            ey = my + math.sin(b) * ln * 0.55
            _plot(cv, _curve(mx, my, ex, ey, bend=R.uniform(-1, 1), steps=12),
                  lambda t: r[2] if t < 0.6 else r[3])
            tips.append((ex, ey))
    # lace: short connections between neighbouring branches
    X, Y = _mgrid()
    d = np.hypot(X - ox, Y - oy)
    m = cv.mask
    for y in range(S):
        for x in range(1, S - 1):
            if not m[y, x] and m[y, x - 1] and d[y, x] > 4 and (x + y) % 2 == 0:
                if any(m[y, x + k] for k in range(1, 3) if x + k < S):
                    cv.px(x, y, r[3] if d[y, x] > 8 else r[2])
    for (ex, ey) in tips:
        cv.px(ex, ey, r[4])
    return cv.img()


def reeds(pal, seed, head_hex="#6b4226"):
    """Reeds / cattails: thin segmented stalks, long leaves, a few seed heads."""
    r = _ramp(pal, 5, 0.0, 0.85)
    hr = _color_ramp(head_hex, 4, spread=0.9)
    R = _R(seed, "r")
    cv = _Cv()
    n = int(R.integers(3, 5))
    xs = sorted(R.choice(np.arange(3, 13), n, replace=False))
    for i, x0 in enumerate(xs):
        h = R.uniform(9, 15)
        lean = R.uniform(-1.5, 1.5)
        pts = [(x0 + 0.5 + lean * (k / 20) ** 2, 15.5 - h * k / 20) for k in range(21)]
        drawn = _plot(cv, pts, lambda t: r[1] if t < 0.3 else (r[2] if t < 0.75 else r[3]))
        for j, (px, py) in enumerate(drawn):
            if j and j % 4 == 0:
                cv.px(px, py, r[0])
        top = drawn[-1]
        if R.random() < 0.55:
            hx, hy = top[0], top[1] + 1
            for yy_ in range(hy, hy + 4):
                cv.px(hx, yy_, hr[1])
                cv.px(hx + 1, yy_, hr[0])
            cv.px(hx, hy, hr[3])
            cv.px(hx, hy + 1, hr[2])
            cv.px(hx, hy - 1, r[3])
    # long thin leaves arching from the base
    for k in range(int(R.integers(2, 4))):
        x0 = R.uniform(4, 12)
        sd = -1 if x0 > 8 else 1
        pts = _curve(x0, 15.5, x0 + sd * R.uniform(3, 5), 15.5 - R.uniform(7, 11), bend=sd * 1.5)
        _plot(cv, pts, lambda t: r[2] if t < 0.6 else r[4])
    return cv.img()


def thorn_bush(pal, seed):
    """Tangle of thin branching stems bristling with sharp thorns."""
    r = _xramp(pal, 4, light=1, hi=0.8)
    R = _R(seed, "tb")
    cv = _Cv()
    segs = []

    def branch(x, y, ang, ln, depth):
        x1, y1 = x + math.cos(ang) * ln, y + math.sin(ang) * ln
        segs.append((x, y, x1, y1, depth))
        if depth < 2:
            for k in range(2):
                branch(x1, y1, ang + (-1 if k else 1) * R.uniform(0.35, 0.8), ln * R.uniform(0.6, 0.8), depth + 1)

    for k in range(3):
        branch(7.5 + (k - 1) * 2 + R.uniform(-1, 1), 15.5, -math.pi / 2 + (k - 1) * 0.5 + R.uniform(-0.2, 0.2),
               R.uniform(4, 6), 0)
    thorns = []
    for (x0, y0, x1, y1, dp) in segs:
        pts = _curve(x0, y0, x1, y1, bend=R.uniform(-0.8, 0.8), steps=12)
        drawn = _plot(cv, pts, lambda t, dp=dp: r[min(3, dp + (1 if t > 0.5 else 0))])
        ang = math.atan2(y1 - y0, x1 - x0)
        for j, (px, py) in enumerate(drawn):
            if j and j % 2 == 0 and R.random() < 0.7:
                sdv = 1 if (j // 2) % 2 else -1
                nx, ny = -math.sin(ang) * sdv, math.cos(ang) * sdv
                thorns.append((px + round(nx), py + round(ny) - 1))
    for (tx, ty) in thorns:
        if not cv.has(tx, ty):
            cv.px(tx, ty, r[4])
    return cv.img()


def eyeball_plant(stem_pal, eye_hex, iris_hex, seed):
    """A stalk topped with a staring eyeball (iris, pupil, glint)."""
    sr = _ramp(stem_pal, 4)
    er = _color_ramp(eye_hex, 4, spread=0.6)
    ir = _color_ramp(iris_hex, 4, spread=0.9)
    R = _R(seed, "e")
    cv = _Cv()
    ex, ey, rad = 7.5 + R.choice([-0.5, 0.5]), 5.0, 3.7
    pts = _curve(ex + R.choice([-2, 2]), 15.5, ex, ey + 3, bend=R.uniform(-2, 2))
    drawn = _plot(cv, pts, lambda t: sr[1] if t < 0.5 else sr[2])
    for j, (px, py) in enumerate(drawn):
        if py in (12, 10):
            sd = -1 if py == 12 else 1
            cv.px(px + sd, py - 1, sr[2])
            cv.px(px + 2 * sd, py - 1, sr[3])
            cv.px(px + 2 * sd, py - 2, sr[3])
    m, s = _sphere(ex, ey, rad)
    head = _Cv()
    head.paint(m, 1 + _quant(s, 3), er)
    look = (R.uniform(-0.8, 0.8), R.uniform(-0.3, 0.6))
    im_, _ = _sphere(ex + look[0], ey + look[1], 1.9)
    im_ &= m
    X, Y = _mgrid()
    iidx = np.where((X - ex - look[0]) + (Y - ey - look[1]) < 0, 2, 1)
    head.paint(im_, iidx, ir)
    head.px(ex + look[0], ey + look[1], [12, 8, 10])
    head.px(ex + look[0] - 1, ey + look[1] - 1, [255, 255, 255])
    # blood veins
    vein = _mix(er[1], [190, 30, 40], 0.6)
    head.px(ex + rad - 1.2, ey + 0.5, vein)
    head.px(ex - rad + 0.6, ey + 1.2, vein)
    _outline(head, 0.5)
    cv.over(head)
    return cv.img()


def bulb(stem_pal, glow_pal, seed):
    """Arching stem with 1-3 glowing bulbs, each hanging from the stem on its own short stalk."""
    sr = _ramp(stem_pal, 4)
    gr = _xramp(glow_pal, 4, light=1, hi=0.9)
    R = _R(seed, "b")
    cv = _Cv()
    side = int(R.choice([-1, 1]))
    x0 = 7.5 - side * R.uniform(1.0, 3.0)
    tipx, tipy = 7.5 + side * R.uniform(2.0, 4.0), R.uniform(2.5, 5.0)
    pts = _curve(x0, 15.5, tipx, tipy, bend=-side * R.uniform(2.0, 3.5))
    stem = _plot(cv, pts, lambda t: sr[1] if t < 0.5 else sr[2])
    lx = int(x0)
    cv.px(lx - side, 12, sr[2])
    cv.px(lx - 2 * side, 11, sr[3])
    # hanging points: the stem tip plus 0-2 side twigs
    hangs = [(stem[-1][0] + side, stem[-1][1] + 1, R.uniform(2.0, 2.6), int(R.integers(1, 3)))]
    n_extra = int(R.choice([0, 1, 1, 2]))
    for i in range(n_extra):
        j = int(len(stem) * (0.45 + 0.2 * i + R.uniform(-0.05, 0.05)))
        px, py = stem[min(j, len(stem) - 1)]
        sd = -side if i == 0 else side
        ln = int(R.integers(2, 4))
        twig = _plot(cv, _curve(px, py, px + sd * ln, py - 1, bend=0.6 * sd, steps=8), lambda t: sr[2])
        ex, ey = twig[-1]
        hangs.append((ex + sd, ey + 1, R.uniform(1.4, 1.9), int(R.integers(1, 3))))
    bulbs = []
    for (hx, hy, br, stalk) in hangs:
        b = (hx + 0.5, hy + stalk + br - 0.1, br)
        if any(math.hypot(b[0] - o[0], b[1] - o[1]) < b[2] + o[2] + 0.6 for o in bulbs) or b[1] + br > 15.8:
            continue  # keep bulbs apart (and above the ground)
        for k in range(stalk):  # the visible stalk the bulb hangs from
            cv.px(hx, hy + k, sr[2])
        bulbs.append(b)
    for (bx, by, br) in bulbs:
        m, s = _sphere(bx, by, br)
        layer = _Cv()
        layer.paint(m, 1 + _quant(s * 1.1, 4), gr)
        layer.px(bx - br * 0.45, by - br * 0.45, gr[4])
        _outline(layer, 0.55)
        cv.over(layer)
    return cv.img()


def lollipop_plant(stick_hex, candy_pal, seed):
    """Candy plant: a stick topped with a swirled lollipop disc (seed varies height, size,
    swirl, lean) and sometimes a smaller second lollipop."""
    stick = _color_ramp(stick_hex, 3, spread=0.6)
    cols = [_rgb(c)[:3] for c in _palette(candy_pal)]
    R = _R(seed, "l")
    cv = _Cv()

    def one(cx, cy, rad, twist, phase):
        sx = int(round(cx - 0.5))
        for y in range(int(cy + rad * 0.5), 16):
            cv.px(sx, y, stick[2])
            if rad > 3:
                cv.px(sx + 1, y, stick[1])
        X, Y = _mgrid()
        dx, dy = X - cx, Y - cy
        d = np.hypot(dx, dy)
        th = np.arctan2(dy, dx)
        m = d < rad
        k = np.floor(((th / math.tau) * 2 * twist + d / 2.4 + phase) % len(cols)).astype(int) % len(cols)
        light = (-dx - dy) / (rad * 1.4)
        head = _Cv()
        for i, c in enumerate(cols):
            rr = _color_ramp(_hex(c), 4, spread=0.6)
            sh = np.clip(np.floor(2 + light * 1.6), 0, 3).astype(int)
            head.paint(m & (k == i), sh, rr)
        head.px(cx - rad * 0.45, cy - rad * 0.6, [255, 255, 255])
        if rad > 3.5:
            head.px(cx - rad * 0.65, cy - rad * 0.4, [255, 255, 255])
        _outline(head, 0.6)
        cv.over(head)

    second = R.random() < 0.4
    sd = R.choice([-1, 1])
    main_x = 7.5 + (sd * R.uniform(1.0, 2.0) if second else R.uniform(-1.0, 1.0))
    rad = R.uniform(3.4, 4.8) if not second else R.uniform(3.2, 4.0)
    cy = R.uniform(4.4, 7.0)
    if second:
        one(main_x - sd * R.uniform(4.5, 5.5), R.uniform(9.0, 10.5), R.uniform(2.0, 2.6),
            R.choice([-1, 1]), R.random())
    one(main_x, cy, rad, R.choice([-1, 1]), R.random())
    return cv.img()


def cactus_sprite(pal, seed):
    """Small cactus: ribbed column with an arm or two and light spines.  The body is shaded in
    the lower ~75% of the palette; the lightest colour is kept for the sparse spines."""
    body = _xramp(pal, 4, dark=1, lo=0.0, hi=0.72)  # 0 dark .. 4
    spine = _xramp(pal, 2, lo=0.85, hi=1.0)[-1]
    R = _R(seed, "c")
    cv = _Cv()
    top = int(R.integers(2, 6))
    cxl = 5 + int(R.integers(0, 2))  # body spans cxl+1 .. cxl+4
    m = np.zeros((S, S), bool)
    X, Y = _mgrid()
    m |= (X > cxl) & (X < cxl + 5) & (Y > top + 1) & (Y < 16)
    m |= _ellipse(cxl + 2.5, top + 2.2, 2.5, 2.0)
    arms = [-1, 1] if R.random() < 0.5 else [R.choice([-1, 1])]
    for sd in arms:
        ay = top + int(R.integers(4, 8))
        ah = int(R.integers(2, 5))
        if sd < 0:
            ax0 = cxl - 3
            m |= (X > ax0) & (X < cxl + 1) & (Y > ay) & (Y < ay + 2)
            m |= (X > ax0) & (X < ax0 + 2.5) & (Y > ay - ah) & (Y < ay + 2)
            m |= _ellipse(ax0 + 1.0, ay - ah + 0.6, 1.0, 1.0)
        else:
            ax1 = cxl + 8
            m |= (X > cxl + 4) & (X < ax1) & (Y > ay) & (Y < ay + 2)
            m |= (X > ax1 - 2.5) & (X < ax1) & (Y > ay - ah) & (Y < ay + 2)
            m |= _ellipse(ax1 - 1.0, ay - ah + 0.6, 1.0, 1.0)
    s = _shade(m, depth=2.0)
    idx = 1 + _quant(s, 4)  # 1..4
    xx, yy = _grid()
    rib = (xx == cxl + 2) & (yy > top + 1)
    idx = np.where(rib, np.maximum(idx - 1, 1), idx)  # ribs are grooves (darker), not highlights
    cv.paint(m, idx, body)
    _inner_outline(cv, 0.7)
    for (x, y) in zip(*np.nonzero(m.T)):
        if (x * 3 + y * 5) % 7 == 0 and R.random() < 0.45 and _dist_in(m)[y, x] <= 2:
            cv.px(x, y, spine)
    if R.random() < 0.5:
        fl = _color_ramp(R.choice(["#f06ea0", "#ffd34e", "#ff8a4c"]), 3)
        cv.px(cxl + 2, top, fl[1])
        cv.px(cxl + 3, top, fl[2])
    return cv.img()


def puffball(pal, seed):
    """Puffball fungi: round balls pinched into a short stalk at the base, with a lighter top,
    small warts / pores and a tiny opening on top (so they do not read as rocks)."""
    r = _xramp(pal, 4, dark=1, light=1)
    R = _R(seed, "p")
    cv = _Cv()
    sd = R.choice([-1, 1])
    balls = [(7.5 + sd * R.uniform(0.5, 1.8), R.uniform(3.7, 4.6))]
    if R.random() < 0.75:
        balls.append((7.5 - sd * R.uniform(4.0, 5.0), R.uniform(2.0, 2.7)))
    if R.random() < 0.4:
        balls.append((7.5 + sd * R.uniform(5.0, 6.0), R.uniform(1.4, 1.8)))
    for (bx, br) in sorted(balls, key=lambda b: -b[1]):
        ry = br * 0.9
        stalk = 2.4 if br > 3 else 1.4
        by = 15.5 - stalk - ry
        X, Y = _mgrid()
        # ball + pinched base (a short, narrower stalk)
        m = _ellipse(bx, by, br, ry)
        base = (np.abs(X - bx) < np.maximum(0.8, br * 0.36 + 0.6 * (Y > 15))) & (Y > by) & (Y < 16)
        m |= base
        dy = (Y - by) / ry
        s = _shade(m, depth=2.5)
        idx = 1 + _quant(np.clip(s * 0.62 + 0.3 * (-dy) + 0.18, 0, 0.999), 4)  # lighter top
        idx = np.where(base & ~_ellipse(bx, by, br, ry), np.minimum(idx, 2), idx)
        n = _white(f"{seed}:pore{bx:.1f}")
        inner = _dist_in(m) > 1
        X0 = np.floor(X).astype(int)
        Y0 = np.floor(Y).astype(int)
        lattice = ((X0 + 2 * Y0) % 4 == 0) & (Y0 % 2 == 0)
        idx = np.where(inner & (dy > 0.1) & (n > 0.75), np.maximum(idx - 1, 1), idx)  # pores below
        idx = np.where(inner & (dy < 0.1) & lattice & (n < 0.75), np.minimum(idx + 1, 5), idx)  # warts
        layer = _Cv()
        layer.paint(m, idx, r)
        if br > 2.4:  # tiny opening (the spore pore) on top
            ox, oy = int(bx), int(by - ry + 1.2)
            layer.px(ox, oy, r[1])
            layer.px(ox - 1, oy, r[5])
        _outline(layer, 0.55)
        cv.over(layer)
    return cv.img()


def tendril(pal, seed):
    """Curling tendrils rising from the ground, each ending in a spiral curl."""
    r = _ramp(pal, 5, 0.0, 0.88)
    R = _R(seed, "t")
    cv = _Cv()
    n = int(R.integers(2, 4))
    for i in range(n):
        x0 = 4.5 + i * (7 / max(1, n - 1)) + R.uniform(-0.8, 0.8)
        h = R.uniform(6, 10) if i != n // 2 else R.uniform(9, 11)
        ph = R.uniform(0, math.tau)
        pts = [(x0 + 1.2 * math.sin(ph + k / 30 * 3.0), 15.5 - h * k / 30) for k in range(31)]
        ex, ey = pts[-1]
        sd = 1 if x0 < 8 else -1
        rad = R.uniform(2.4, 3.0)
        cxs, cys = ex + sd * rad, ey
        a0 = math.pi if sd > 0 else 0.0
        for k in range(1, 41):
            a = a0 - sd * k / 40 * 1.75 * math.pi
            rr = rad * (1 - k / 40 * 0.7)
            pts.append((cxs + rr * math.cos(a), cys + rr * math.sin(a)))
        drawn = _plot(cv, pts, lambda t: r[1] if t < 0.25 else (r[2] if t < 0.55 else (r[3] if t < 0.85 else r[4])))
        # thicken the lower stalk
        for (px, py) in drawn:
            if py >= 13:
                cv.px(px + 1, py, r[0])
    return cv.img()


def vine_overlay(pal, seed):
    """Sparse hanging vine strands with leaves on transparent (tiles both ways)."""
    r = _ramp(pal, 5, 0.0, 0.85)
    R = _R(seed, "v")
    cv = _Cv()
    n = int(R.integers(2, 4))
    xs = (np.arange(n) * (S / n) + R.uniform(0, S / n, n)).tolist()
    for x0 in xs:
        ph = R.uniform(0, math.tau)
        amp = R.uniform(0.8, 1.8)
        pts = []
        for y in range(S):
            x = x0 + amp * math.sin(ph + y / S * math.tau)
            pts.append((int(math.floor(x)) % S, y))
        last = None
        for (x, y) in pts:
            cv.px(x, y, r[1] if y % 5 else r[0])
            if last is not None and abs(x - last) > 1:
                cv.px((x + last) // 2, y, r[1])
            last = x
        for y in range(int(R.integers(0, 4)), S, 4):
            x = pts[y][0]
            sd = 1 if (y // 4) % 2 else -1
            cv.px((x + sd) % S, y, r[3])
            cv.px((x + 2 * sd) % S, y, r[2])
            cv.px((x + sd) % S, (y + 1) % S, r[2])
            cv.px((x + 2 * sd) % S, (y - 1) % S, r[4])
    return cv.img()


def lily_pad(pal, seed):
    """Top-down floating pad with a notch, radial veins and a darker rim."""
    r = _ramp(pal, 5, 0.0, 0.85)
    R = _R(seed, "lp")
    X, Y = _mgrid()
    cx, cy = 8.0, 8.0
    dx, dy = X - cx, Y - cy
    d = np.hypot(dx, dy)
    th = np.arctan2(dy, dx)
    notch = R.uniform(-math.pi, math.pi)
    dth = np.abs((th - notch + math.pi) % math.tau - math.pi)
    edge = 7.2 + 0.4 * np.sin(th * 5 + R.uniform(0, 6))
    m = (d < edge) & ~((dth < 0.32) & (d > 1.2))
    vein = (np.abs(((th + math.pi) * 7 / math.pi) % 2 - 1) < 0.18) & (d > 1.5) & (d < edge - 1.3)
    idx = np.where(dx + dy < 0, 3, 2)
    idx = np.where(_white(seed + ":n") > 0.82, idx + 1, idx)
    idx = np.where(vein, 4, idx)
    idx = np.where(d > edge - 1.1, 1, idx)
    idx = np.where((d > edge - 1.1) & (dx + dy > 2), 0, idx)
    cv = _Cv()
    cv.paint(m, idx, r)
    return cv.img()


def sapling(trunk_pal, leaf_pal, seed):
    """Young tree: thin trunk and a clumpy leafy crown with a few gaps."""
    tr = _ramp(trunk_pal, 4)
    lr = _xramp(leaf_pal, 4, light=1, hi=0.8)
    R = _R(seed, "sp")
    cv = _Cv()
    tx = 7 + int(R.integers(0, 2))
    for y in range(7, 16):
        cv.px(tx, y, tr[2])
        if y > 12:
            cv.px(tx + 1, y, tr[1])
    cv.px(tx - 1, 10, tr[2])
    cv.px(tx - 2, 9, tr[2])
    cv.px(tx + 1, 9, tr[1])
    cv.px(tx + 2, 8, tr[1])
    crown = np.zeros((S, S), bool)
    for _ in range(5):
        crown |= _ellipse(tx + 0.5 + R.uniform(-3, 3), 5 + R.uniform(-2.5, 2.5), R.uniform(2, 3.4), R.uniform(1.8, 2.8))
    crown &= _white(seed + ":h") > 0.12
    s = _shade(crown, depth=2.0)
    idx = _quant(s * 0.85 + 0.15 * _white(seed + ":n"), 5)
    leaves_cv = _Cv()
    leaves_cv.paint(crown, idx, lr)
    cv.over(leaves_cv)
    return cv.img()


def berry_bush(leaf_pal, berry_hex, seed):
    """Round leafy bush dotted with glossy berries."""
    lr = _xramp(leaf_pal, 4, light=1, hi=0.8)
    br = _color_ramp(berry_hex, 4, spread=0.9)
    R = _R(seed, "bb")
    cv = _Cv()
    m = np.zeros((S, S), bool)
    for k, (x, y, rx, ry) in enumerate([(7.5, 10.8, 6.5, 5.4), (5, 7.5, 3.5, 3.2), (10.5, 7, 3.5, 3.5), (7.8, 5.5, 3, 2.5)]):
        dy = R.uniform(0, 0.6) if k == 0 else R.uniform(-0.8, 0.8)
        m |= _ellipse(x + R.uniform(-0.8, 0.8), y + dy, rx, ry)
    m &= _mgrid()[1] < 16
    edge = (_dist_in(m) <= 1) & (_mgrid()[1] < 15)
    m &= ~(edge & (_white(seed + ":h") > 0.6))
    s = _shade(m, depth=3.0)
    idx = _quant(np.clip(s * 0.8 + 0.25 * _white(seed + ":n"), 0, 0.999), 5)
    cv.paint(m, idx, lr)
    placed = []
    for _ in range(40):
        if len(placed) >= int(R.integers(5, 8)):
            break
        x, y = int(R.integers(2, 13)), int(R.integers(3, 14))
        if not m[y, x] or not m[y + 1, x + 1] or any(abs(x - a) + abs(y - b) < 3 for a, b in placed):
            continue
        placed.append((x, y))
        cv.px(x, y, br[3])
        cv.px(x + 1, y, br[2])
        cv.px(x, y + 1, br[1])
        cv.px(x + 1, y + 1, br[0])
    return cv.img()


def bone_sprite(pal, seed):
    """A bone jutting from the ground at a seed-chosen angle and length, sometimes with a
    second smaller bone or a fragment beside it."""
    r = _xramp(pal, 4, dark=1, hi=0.92)
    R = _R(seed, "bn")
    cv = _Cv()

    def one(x0, y0, ang, ln, knob):
        x1, y1 = x0 + math.cos(ang) * ln, y0 + math.sin(ang) * ln
        m = _thick([(x0, y0), (x1, y1)], rad=knob * 0.62)
        px_, py_ = -math.sin(ang), math.cos(ang)
        m |= _ellipse(x1 + px_ * knob * 0.85, y1 + py_ * knob * 0.85, knob, knob)
        m |= _ellipse(x1 - px_ * knob * 0.85, y1 - py_ * knob * 0.85, knob, knob)
        layer = _Cv()
        layer.paint(m, 2 + _quant(_shade(m, depth=1.8), 3), r)
        cv.over(layer)

    sd = R.choice([-1, 1])
    lean = R.uniform(0.12, 0.55)
    ang = -math.pi / 2 + sd * lean
    ln = R.uniform(8.5, 12.0)
    one(7.5 - sd * R.uniform(1.0, 2.5), 16.5, ang, ln, R.uniform(1.6, 2.0))
    extra = R.random()
    if extra < 0.45:  # a second, shorter bone leaning the other way
        one(7.5 + sd * R.uniform(3.5, 5.0), 16.5, -math.pi / 2 - sd * R.uniform(0.3, 0.8), R.uniform(4.5, 6.5),
            R.uniform(1.2, 1.5))
    elif extra < 0.85:  # a broken fragment lying on the ground
        fx = 7.5 + sd * R.uniform(4.0, 5.2)
        frag = _thick([(fx - 1.8, 15.2), (fx + 1.2, 14.4 + R.uniform(-0.4, 0.4))], rad=0.7) | \
            _ellipse(fx + 1.6, 14.0, 1.1, 1.1)
        fr = _Cv()
        fr.paint(frag, 2 + _quant(_shade(frag, depth=1.2), 3), r)
        cv.over(fr)
    _outline(cv, 0.5)
    return cv.img()


def _gear_mask(cx, cy, r_out, r_in, teeth, hole, rot=0.0, w=S, h=S):
    X, Y = _mgrid(w, h)
    dx, dy = X - cx, Y - cy
    d = np.hypot(dx, dy)
    th = np.arctan2(dy, dx) + rot
    tooth = (np.cos(th * teeth) > 0.1)
    m = (d < r_in) | ((d < r_out) & tooth)
    m &= d >= hole
    return m, d


def gear_sprite(pal, seed):
    """A cog standing on the ground (bottom teeth touch the bottom row)."""
    r = _xramp(pal, 4, dark=1, light=1)
    R = _R(seed, "g")
    cv = _Cv()
    cx, cy = 8.0, 9.0
    m, d = _gear_mask(cx, cy, 7.0, 5.2, int(R.choice([8, 10])), 1.6, R.uniform(0, 1))
    s = _shade(m, depth=1.5)
    idx = 1 + _quant(s, 4)
    idx = np.where((d > 2.3) & (d < 3.3), np.maximum(idx - 1, 1), idx)
    cv.paint(m, idx, r)
    _inner_outline(cv, 0.6)
    return cv.img()


def wire_sprite(pal, seed):
    """Loose cables sprouting from the ground with bare copper tips and a spark."""
    r = _ramp(pal, 5)
    R = _R(seed, "w")
    cv = _Cv()
    copper = _color_ramp("#d9873a", 3, spread=0.8)
    n = int(R.integers(2, 4))
    tips = []
    for i in range(n):
        x0 = 4 + i * (8 / max(1, n - 1)) + R.uniform(-1, 1)
        x1 = x0 + R.uniform(-5, 5)
        y1 = R.uniform(2, 8)
        pts = _curve(x0, 15.5, x1, y1, bend=R.uniform(-4, 4))
        drawn = _plot(cv, pts, lambda t: r[1] if t < 0.4 else (r[2] if t < 0.8 else r[3]))
        tips.append(drawn[-1])
        # cable sheen
        for j, (px, py) in enumerate(drawn):
            if j % 5 == 2:
                cv.px(px, py, r[4])
    for (tx, ty) in tips:
        cv.px(tx, ty - 1, copper[2])
        cv.px(tx + 1, ty - 1, copper[1])
    sx, sy = tips[0]
    for (dx, dy, c) in ((0, -3, [255, 255, 210]), (-1, -3, [255, 230, 120]), (1, -3, [255, 230, 120]),
                        (0, -4, [255, 230, 120]), (0, -2, [255, 230, 120])):
        cv.px(sx + dx, sy + dy, c)
    return cv.img()


# =========================================================================
#  item icons (16x16, transparent, 1px darker outline)
# =========================================================================


def _rellipse(cx, cy, rx, ry, ang, w=S, h=S):
    X, Y = _mgrid(w, h)
    ca, sa = math.cos(ang), math.sin(ang)
    u = (X - cx) * ca + (Y - cy) * sa
    v = -(X - cx) * sa + (Y - cy) * ca
    return (u / rx) ** 2 + (v / ry) ** 2 <= 1.0


def _lens(x0, y0, x1, y1, width):
    """Pointed leaf/lens shape between two points with max half-width ``width``."""
    X, Y = _mgrid()
    L = math.hypot(x1 - x0, y1 - y0)
    ux, uy = (x1 - x0) / L, (y1 - y0) / L
    u = (X - x0) * ux + (Y - y0) * uy
    v = -(X - x0) * uy + (Y - y0) * ux
    t = u / L
    half = width * np.sin(np.clip(t, 0, 1) * math.pi) ** 0.8
    return (t >= 0) & (t <= 1) & (np.abs(v) <= half + 0.15), u, v


def _fill(cv, mask, r, lo=1, hi=5, depth=2.0, bias=0.0, s=None):
    if s is None:
        s = _shade(mask, depth=depth)
    idx = lo + _quant(np.clip(s + bias, 0, 0.999), hi - lo + 1)
    cv.paint(mask, idx, r)
    return idx


def _acc(accent, default):
    return _rgb(accent if accent is not None else default)[:3]


def _hit(m, x, y):
    """Is canonical pixel (x, y) inside image-space mask ``m``? (follows the item transform)"""
    x, y = int(math.floor(x)), int(math.floor(y))
    if _XF is not None:
        fx, fy = _XF.fwd(x + 0.5, y + 0.5)
        x, y = int(math.floor(fx)), int(math.floor(fy))
    return 0 <= x < S and 0 <= y < S and bool(m[y, x])


def _spec(cv, m, hot, warm=None, depth=2, bias=1.1):
    """Specular glint on the upper-left interior of ``m``, placed in image space so it stays
    top-left whatever transform (mirror/rotation) the shape was drawn with."""
    X, Y = _igrid()
    d = _dist_in(m)
    cand = m & (d >= depth)
    if not cand.any():
        cand = m & (d >= 1)
        if not cand.any():
            return None
    score = np.where(cand, X + Y * bias, 1e9)
    y, x = np.unravel_index(np.argmin(score), score.shape)
    cv.a[y, x, :3] = np.asarray(hot, float)[:3]
    if warm is not None:
        for (ny, nx) in ((y, x + 1), (y + 1, x)):
            if 0 <= nx < S and 0 <= ny < S and cand[ny, nx]:
                cv.a[ny, nx, :3] = np.asarray(warm, float)[:3]
    return x, y


def _jag(R, n, amp):
    """``n`` random offsets in [-amp, amp] (jagged / broken edges)."""
    return [R.uniform(-amp, amp) for _ in range(n)]


def _catmull(pts, steps=10):
    """Catmull-Rom spline through ``pts`` (list of (x, y)); returns dense points."""
    P = [pts[0]] + list(pts) + [pts[-1]]
    out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for k in range(steps):
            t = k / steps
            t2, t3 = t * t, t * t * t
            out.append(tuple(0.5 * ((2 * p1[j]) + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2
                                    + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3) for j in (0, 1)))
    out.append(tuple(pts[-1]))
    return out


def _it_meat(cv, r, R, accent, cooked=False):
    ang = R.uniform(-0.72, -0.38)
    rx, ry = R.uniform(5.5, 6.3), R.uniform(3.9, 4.7)
    cx, cy = 8.6 + R.uniform(-0.4, 0.4), 7.6 + R.uniform(-0.4, 0.4)
    ca, sa = math.cos(ang), math.sin(ang)
    m = _rellipse(cx, cy, rx, ry, ang)
    if R.random() < 0.6:  # a bite out of the upper edge
        t = R.uniform(-0.3, 0.5)
        m &= ~_ellipse(cx + ca * rx * t + sa * ry * 1.05, cy + sa * rx * t - ca * ry * 1.05, 1.7, 1.5)
    # bone end sticking out of the lower-left
    b0 = (cx - ca * rx * 0.55, cy - sa * rx * 0.55)
    b1 = (cx - ca * (rx + 1.4), cy - sa * (rx + 1.4))
    bone = _thick([b0, b1], rad=0.85) | _ellipse(b1[0] - sa * 1.0, b1[1] + ca * 1.0, 1.15, 1.15) \
        | _ellipse(b1[0] + sa * 1.0, b1[1] - ca * 1.0, 1.15, 1.15)
    bone &= ~m
    _fill(cv, m, r, 1, 4, depth=2.5)
    bc = _color_ramp("#efe7d2", 3, spread=0.55)
    cv.paint(bone, 1 + _quant(_shade(bone, depth=1.2), 2), bc)
    inner = _dist_in(m) > 1
    X, Y = _mgrid()
    if cooked:
        off = R.uniform(0, 3.5)
        gap = R.uniform(3.2, 4.2)
        u = (X - Y) - off
        lines = m & inner & (np.abs(((u + 40) % gap) - gap / 2) < 0.5)
        cv.paint(lines, np.full((S, S), 0), r)
    else:
        fat = _acc(accent, _hex(_mix(r[5], [255, 244, 240], 0.6)))
        for _ in range(2):
            t0 = R.uniform(-0.6, 0.5)
            ox, oy = cx + ca * rx * t0, cy + sa * rx * t0
            pts = _curve(ox - 2.2, oy + 1.6 * R.choice([-1, 1]), ox + 2.6, oy - 1.2, bend=R.uniform(-1.5, 1.5), steps=14)
            for (x, y) in pts:
                if _hit(m & inner, x, y):
                    cv.px(x, y, fat)
    _spec(cv, m, r[5], depth=2)


def _it_gem(cv, r, R, accent):
    cut = ("brilliant", "step", "pear")[int(R.integers(0, 3))]
    X, Y = _mgrid()
    if cut == "step":
        a, b = R.uniform(2.5, 3.5), R.uniform(2.3, 3.0)
        pts = [(2.5 + a - 1, 2.5), (13.5 - a + 1, 2.5), (13.5, 2.5 + b), (13.5, 13.5 - b), (13.5 - a + 1, 13.5),
               (2.5 + a - 1, 13.5), (2.5, 13.5 - b), (2.5, 2.5 + b)]
        m = _poly(pts)
        table = (X > 5.2) & (X < 10.8) & (Y > 5.0) & (Y < 11.0)
        d = np.stack([Y - 2.5, X - 2.5, 13.5 - Y, 13.5 - X])  # top, left, bottom, right bands
        band = np.argmin(d, axis=0)
        idx = np.array([5, 4, 1, 2])[band]
        idx = np.where(table, 3, idx)
        idx = np.where(table & (X + Y < 13), 4, idx)
        cv.paint(m, idx, r)
    elif cut == "pear":
        m = _ellipse(8.0, 9.6, 5.0, 4.6) | _poly([(3.6, 8.2), (8.0, 1.8), (12.4, 8.2)])
        th = np.arctan2(Y - 9.0, X - 8.0)
        sector = np.floor(((th + math.pi) / (math.pi / 3)) % 6).astype(int)
        idx = np.array([4, 4, 5, 3, 2, 2])[sector]
        idx = np.where(np.hypot(X - 8, Y - 9.0) < 2.0, 3, idx)
        cv.paint(m, idx, r)
    else:
        w = R.uniform(-0.6, 0.6)
        ch = R.uniform(5.8, 7.2)
        pts = [(2.5 + w, ch), (5.5, 2.5), (10.5, 2.5), (13.5 - w, ch), (8.0 + R.uniform(-0.5, 0.5), 14.0)]
        m = _poly(pts)
        idx = np.full((S, S), 3)
        crown = Y < ch
        idx = np.where(crown & (X < 5.5), 4, idx)
        idx = np.where(crown & (X >= 5.5) & (X < 10.5), 5, idx)
        idx = np.where(crown & (X >= 10.5), 3, idx)
        idx = np.where(crown & (Y < 4) & (X >= 5.5) & (X < 10.5), 4, idx)
        idx = np.where(~crown & (X < 6), 3, idx)
        idx = np.where(~crown & (X >= 6) & (X < 10), 2, idx)
        idx = np.where(~crown & (X >= 10), 1, idx)
        idx = np.where((np.abs(Y - ch) < 0.5), np.maximum(idx - 1, 1), idx)
        cv.paint(m, idx, r)
    _spec(cv, m, [255, 255, 255], r[5], depth=2)


def _it_orb(cv, r, R, accent, rad=None, cx=8.0, cy=8.0):
    rad = R.uniform(5.2, 5.9) if rad is None else rad
    m, s = _sphere(cx, cy, rad)
    idx = 1 + _quant(s, 5)
    X, Y = _mgrid()
    rim = m & (np.hypot(X - cx, Y - cy) > rad - 1.2) & ((X - cx) + (Y - cy) > 2)
    idx = np.where(rim, np.minimum(idx + 1, 3), idx)
    style = int(R.integers(0, 3))
    if style == 1:  # swirling inner band
        th = np.arctan2(Y - cy, X - cx)
        d = np.hypot(X - cx, Y - cy)
        band = m & (np.abs(((th / math.tau + d / (rad * 1.3) + R.random()) % 1.0) - 0.5) < 0.1) & (d < rad - 1.2)
        idx = np.where(band, np.maximum(idx - 1, 1), idx)
    elif style == 2:  # glowing core
        a = R.uniform(0, math.tau)
        core = np.hypot(X - cx - 1.2 * math.cos(a), Y - cy - 1.2 * math.sin(a)) < 1.6
        idx = np.where(core & m, 5, idx)
    cv.paint(m, idx, r)
    _spec(cv, m, [255, 255, 255], r[5], depth=2)


def _it_shard(cv, r, R, accent):
    """Jagged triangular crystal fragment with a broken base edge and two facets."""
    tip = (13.6 + R.uniform(-0.4, 0.2), 2.0 + R.uniform(-0.2, 0.6))
    A = (2.2 + R.uniform(0, 0.8), 7.4 + R.uniform(-0.6, 1.4))
    B = (8.2 + R.uniform(-0.6, 1.4), 13.9 + R.uniform(-0.4, 0.1))
    base = []
    n = int(R.integers(3, 5))
    ex, ey = B[0] - A[0], B[1] - A[1]
    L = math.hypot(ex, ey)
    nx_, ny_ = -ey / L, ex / L  # points away from the tip (outward)
    for i in range(1, n + 1):
        t = i / (n + 1) + R.uniform(-0.05, 0.05)
        o = (1.0 if i % 2 else -0.8) * R.uniform(0.6, 1.3)
        base.append((A[0] + ex * t + nx_ * o, A[1] + ey * t + ny_ * o))
    kt = R.uniform(0.35, 0.65)
    K = (B[0] + (tip[0] - B[0]) * kt + R.uniform(0.2, 0.8), B[1] + (tip[1] - B[1]) * kt + R.uniform(0.0, 0.5))
    pts = [tip, A] + base + [B, K]
    m = _poly(pts)
    X, Y = _mgrid()
    P = base[len(base) // 2]
    side = (X - tip[0]) * (P[1] - tip[1]) - (Y - tip[1]) * (P[0] - tip[0])
    dist = np.abs(side) / math.hypot(P[0] - tip[0], P[1] - tip[1])
    idx = np.where(side > 0, 4, 2)
    idx = np.where((side > 0) & (dist > 2.2), 3, idx)
    idx = np.where(dist < 0.55, 5, idx)
    cv.paint(m, idx, r)
    d = _dist_in(m)
    cv.a[m & (d <= 1) & (side < 0), :3] = r[1]
    _spec(cv, m, [255, 255, 255], depth=1)


def _it_goo(cv, r, R, accent):
    """Slime ball sagging into short drips (plus a falling droplet), with a glossy highlight."""
    cx, cy = 8.0 + R.uniform(-0.4, 0.4), 7.4 + R.uniform(-0.4, 0.4)
    rx, ry = R.uniform(5.5, 6.1), R.uniform(4.2, 4.8)
    m = _rellipse(cx, cy, rx, ry, R.uniform(-0.1, 0.1))
    xs = R.choice([-3.4, -2.2, 1.8, 3.2], 2, replace=False)
    drops = []
    for k, dx in enumerate(xs):
        x = cx + dx
        ln = R.uniform(1.2, 2.6)
        top = cy + ry * math.sqrt(max(0.0, 1 - (dx / rx) ** 2)) - 0.8
        m |= _thick([(x, top), (x, top + ln)], rad=0.95)
        m |= _ellipse(x, top + ln + 0.2, 1.25, 1.2)
        drops.append((x, top + ln + 0.2))
    if R.random() < 0.7:
        x, y = drops[int(R.integers(0, 2))]
        if y + 2.8 < 15.0:
            m |= _ellipse(x + 0.2, y + 2.6, 0.75, 0.85)
    s = _shade(m, depth=2.8)
    cv.paint(m, 1 + _quant(s, 4), r)
    for _ in range(int(R.integers(1, 3))):  # trapped bubbles
        bx, by = cx + R.uniform(-1.5, 3.0), cy + R.uniform(-0.5, 2.0)
        if _hit(m, bx, by) and _hit(m, bx + 1, by + 1):
            cv.px(bx, by, r[4])
            cv.px(bx + 1, by + 1, r[2])
    hp = _spec(cv, m, r[5], r[5], depth=2)
    if hp:
        hx, hy = hp
        for (x, y) in ((hx + 2, hy - 1), (hx + 3, hy - 1), (hx - 1, hy + 2)):
            if 0 <= x < S and 0 <= y < S and m[y, x] and _dist_in(m)[y, x] > 1:
                cv.a[y, x, :3] = r[4]


def _it_feather(cv, r, R, accent):
    """Long narrow vane on a quill that sticks out past the vane at the base, with barb notches."""
    x0, y0 = 2.0 + R.uniform(0, 0.6), 14.2
    x1, y1 = 13.4, 2.4 + R.uniform(-0.3, 0.6)
    bend = R.uniform(-1.4, 1.4)
    quill = _curve(x0, y0, x1, y1, bend=bend, steps=40)
    X, Y = _mgrid()
    t0 = R.uniform(0.2, 0.27)  # bare quill below the vane
    wl, wr = R.uniform(2.5, 3.1), R.uniform(1.7, 2.4)
    if R.random() < 0.5:
        wl, wr = wr, wl
    # distance along / across the (curved) quill: nearest quill sample per pixel
    P = np.array(quill)
    dxs = X[None] - P[:, 0, None, None]
    dys = Y[None] - P[:, 1, None, None]
    dist = np.hypot(dxs, dys)
    j = np.argmin(dist, axis=0)
    t = j / (len(P) - 1)
    tx = np.gradient(P[:, 0])[j]
    ty = np.gradient(P[:, 1])[j]
    v = (np.take_along_axis(dxs, j[None], 0)[0] * ty - np.take_along_axis(dys, j[None], 0)[0] * tx) / \
        (np.hypot(tx, ty) + 1e-9)
    tt = np.clip((t - t0) / (1 - t0), 0, 1)
    prof = np.sin(np.clip(tt, 0, 1) * math.pi) ** 0.55 * (0.55 + 0.45 * (1 - tt))
    half = np.where(v < 0, wl, wr) * prof
    vane = (t > t0) & (np.abs(v) <= half + 0.2) & (dist.min(0) < 4.5)
    # barb notches: thin V cuts from the edge toward the quill
    for _ in range(int(R.integers(2, 4))):
        tn = R.uniform(0.35, 0.85)
        sd = R.choice([-1, 1])
        cut = (np.abs(t - tn) < 0.018 + 0.03 * np.abs(v) / 3.0) & (np.sign(v) == sd) & (np.abs(v) > 0.9)
        vane &= ~cut
    idx = np.where(v < 0, 4, 3)
    idx = np.where(np.abs(v) > half * 0.7, idx - 1, idx)
    cv.paint(vane, idx, r)
    # down fluff near the vane base
    for k in range(int(R.integers(1, 3))):
        qx, qy = quill[int(len(quill) * (t0 + 0.04))]
        sd = 1 if k % 2 else -1
        cv.px(qx - 1 + sd, qy + 1 + k, r[2])
    # the quill (rachis): light inside the vane, darker bare shaft
    _plot(cv, quill, lambda t: r[1] if t < t0 else (r[5] if t < 0.92 else None))


def _it_scale(cv, r, R, accent):
    """Armour scale: a smooth pointed shield plate with ridged growth rows (arcs parallel to its
    rounded top edge) and a lit rim."""
    w = R.uniform(5.2, 6.0)
    top = R.uniform(2.2, 3.0)
    tipy = R.uniform(13.9, 14.6)
    X, Y = _mgrid()
    ry = 3.4
    m = _ellipse(8.0, top + ry, w, ry) & (Y < top + ry + 0.2)
    m |= _poly([(8.0 - w, top + ry - 0.2), (8.0 + w, top + ry - 0.2), (8.0, tipy)])
    s = _shade(m, depth=2.5)
    idx = 2 + _quant(s, 3)  # 2..4
    # distance below the top edge (constant along arcs parallel to it)
    edge_y = top + ry - ry * np.sqrt(np.clip(1 - ((X - 8.0) / w) ** 2, 0, 1))
    below = Y - edge_y
    gap = R.uniform(2.6, 3.2)
    nrow = int(R.integers(2, 4))
    for k in range(1, nrow + 1):
        line = m & (np.abs(below - k * gap) < 0.5) & (_dist_in(m) > 1)
        lit = m & (np.abs(below - k * gap - 1.0) < 0.5) & (_dist_in(m) > 1)
        idx = np.where(line, 1, idx)
        idx = np.where(lit, np.minimum(idx + 1, 5), idx)
    rim = m & (below < 1.0) & (X < 8.0 + w * 0.4)
    idx = np.where(rim, 5, idx)
    cv.paint(m, idx, r)


def _it_fang(cv, r, R, accent):
    """Curved tooth hanging from a strip of gum."""
    ln = R.uniform(10.0, 12.0)
    bend = R.uniform(1.0, 3.2) * R.choice([-1, 1])
    root_w = R.uniform(2.8, 3.6)
    spine = _curve(8.0, 3.0, 8.0 + bend * 0.6, 3.0 + ln, bend=bend, steps=30)
    m = np.zeros((S, S), bool)
    for i, (x, y) in enumerate(spine):
        t = i / (len(spine) - 1)
        rr = root_w * (1 - t) ** 0.9 + 0.35
        m |= _ellipse(x, y, rr, 0.9)
    _fill(cv, m, r, 2, 5, depth=2.0)
    gum = _acc(accent, "#b8404a")
    gr = _color_ramp(_hex(gum), 3)
    gw = int(root_w + 1.5)
    for x in range(8 - gw, 8 + gw + 1):
        cv.px(x, 2, gr[1])
        cv.px(x, 3, gr[2] if x < 8 else gr[1])
    _spec(cv, m, r[5], depth=1)


def _it_eyeball(cv, r, R, accent):
    m, s = _sphere(8.0, 8.0, R.uniform(5.3, 5.8))
    cv.paint(m, 2 + _quant(s, 4), r)
    ic = _color_ramp(_hex(_acc(accent, "#2d8bd6")), 4)
    lx, ly = R.uniform(-1.6, 1.6), R.uniform(-1.2, 1.4)
    ir = R.uniform(2.3, 3.0)
    im_, s2 = _sphere(8.0 + lx, 8.0 + ly, ir)
    X, Y = _mgrid()
    cv.paint(im_ & m, np.where((X - 8 - lx) + (Y - 8 - ly) < 0, 2, 1), ic)
    px, py = 8.0 + lx, 8.0 + ly
    if R.random() < 0.35:  # slit pupil
        for k in (-1, 0, 1):
            cv.px(px, py + k, [14, 10, 12])
    else:
        cv.px(px, py, [14, 10, 12])
        cv.px(px, py + 1, [14, 10, 12])
    vein = _mix(r[3], [190, 40, 50], 0.6)
    for _ in range(int(R.integers(3, 6))):
        a = R.uniform(0, math.tau)
        for k in (4.6, 3.8):
            x, y = 8 + k * math.cos(a), 8 + k * math.sin(a)
            if _hit(m, x, y) and not _hit(im_, x, y):
                cv.px(x, y, vein)
            a += R.uniform(-0.3, 0.3)
    _spec(cv, m, [255, 255, 255], depth=2)


def _it_spore(cv, r, R, accent):
    rad = R.uniform(3.8, 4.5)
    m = _ellipse(8.0, 8.0, rad, rad)
    n = int(R.choice([6, 7, 8, 9]))
    a0 = R.uniform(0, 1)
    for k in range(n):
        a = a0 + k * math.tau / n + R.uniform(-0.2, 0.2)
        ln = R.uniform(5.6, 6.6)
        m |= _thick([(8 + (rad - 0.6) * math.cos(a), 8 + (rad - 0.6) * math.sin(a)),
                     (8 + ln * math.cos(a), 8 + ln * math.sin(a))], rad=0.6)
    _fill(cv, m, r, 1, 4, depth=2.0)
    for _ in range(int(R.integers(3, 6))):
        x, y = 8 + R.uniform(-2.5, 2.5), 8 + R.uniform(-2.5, 2.5)
        if _hit(m, x, y):
            cv.px(x, y, r[5] if R.random() < 0.5 else r[1])


def _it_dust(cv, r, R, accent):
    """A small pile of glittering powder (a mound ~9px wide, centred in the slot)."""
    X, Y = _mgrid()
    cx = 8.0 + R.uniform(-0.5, 0.5)
    base = R.uniform(12.2, 12.8)
    rx, ry = R.uniform(4.4, 5.0), R.uniform(6.0, 7.0)
    peak = R.uniform(-0.8, 0.8)
    mound = _ellipse(cx + peak * np.clip((base - Y) / ry, 0, 1), base, rx, ry) & (Y < base + 0.2)
    mound |= _ellipse(cx, base - 0.2, rx + 0.5, 1.4) & (Y < base + 0.7)
    w = R.random((S, S))
    s = _shade(mound, depth=3.0)
    idx = 2 + _quant(np.clip(s * 0.7 + 0.3 * w, 0, 0.999), 3)
    idx = np.where((w > 0.86) & (_dist_in(mound) > 1), 5, idx)
    cv.paint(mound, idx, r)
    for _ in range(int(R.integers(3, 6))):  # loose grains and sparkles around the pile
        side = R.choice([-1, 1])
        x = cx + side * (rx + R.uniform(1.0, 2.2))
        y = base + 0.5 - R.uniform(0, 3.0)
        cv.px(x, y, r[int(R.integers(3, 6))])


def _it_bone(cv, r, R, accent):
    ln = R.uniform(4.3, 5.4)
    k = R.uniform(1.5, 1.9)
    ang = -math.pi / 4 + R.uniform(-0.25, 0.25)
    c, s_ = math.cos(ang), math.sin(ang)
    a = (8.0 - c * ln, 8.0 - s_ * ln)
    b = (8.0 + c * ln, 8.0 + s_ * ln)
    m = _thick([a, b], rad=R.uniform(0.95, 1.25))
    for (px, py), sg in ((a, -1), (b, 1)):
        m |= _ellipse(px + sg * c * 0.6 - s_ * 1.2, py + sg * s_ * 0.6 + c * 1.2, k, k)
        m |= _ellipse(px + sg * c * 0.6 + s_ * 1.2, py + sg * s_ * 0.6 - c * 1.2, k, k)
    _fill(cv, m, r, 2, 5, depth=1.6)


def _it_shell(cv, r, R, accent):
    """Scallop shell: a ribbed fan with a wavy rim and two small 'ears' at the hinge."""
    X, Y = _mgrid()
    cx, cy = 8.0, R.uniform(12.8, 13.3)
    sy = R.uniform(1.1, 1.22)  # a little taller than a half disc
    d = np.hypot(X - cx, (Y - cy) / sy)
    th = np.arctan2((Y - cy) / sy, X - cx)  # -pi..0 is the upper half
    nrib = int(R.integers(7, 11))
    rad = R.uniform(6.7, 7.1)
    spread = R.uniform(0.18, 0.32)  # angle cut on each side
    span = math.pi - 2 * spread
    f = ((-th) - spread) / span  # 0..1 across the fan
    edge = rad + 0.5 * np.cos(f * nrib * math.tau)
    m = (d < edge) & (f >= 0) & (f <= 1)
    ear = R.uniform(2.4, 3.2)
    m |= (np.abs(X - cx) < ear) & (Y > cy - 1.6) & (Y < cy + 1.2)
    rib = np.abs((f * nrib) % 1.0 - 0.5) > 0.32
    idx = np.where(rib, 2, 4)
    idx = np.where(X < cx - 1, idx + 1, idx)
    idx = np.where(d < 3, idx - 1, idx)
    gr = (np.abs(d - rad * 0.55) < 0.45) & (f > 0.05) & (f < 0.95)  # a growth ring
    idx = np.where(gr, np.maximum(idx - 1, 1), idx)
    cv.paint(m, np.clip(idx, 1, 5), r)


def _it_fruit(cv, r, R, accent):
    kind = int(R.integers(0, 3))
    if kind == 0:  # apple: two lobes
        m = _ellipse(6.5, 9.0, 4.6, 4.8) | _ellipse(9.5, 9.0, 4.6, 4.8)
        m &= ~_ellipse(8.0, 3.6, 1.2, 1.2)
        top = 4
    elif kind == 1:  # pear
        m = _ellipse(8.0, 10.2, 4.8, 4.2) | _ellipse(8.0, 6.0, 2.9, 3.2)
        top = 3
    else:  # round citrus with a navel dimple
        m = _ellipse(8.0, 8.8, 5.4, 5.2)
        top = 4
    _fill(cv, m, r, 1, 4, depth=3.0)
    _spec(cv, m, r[5], r[5], depth=2)
    stem = _color_ramp("#6b4226", 3)
    sb = R.choice([-1, 1])
    cv.px(8, top, stem[1])
    cv.px(8, top - 1, stem[2])
    cv.px(8 + (sb if R.random() < 0.5 else 0), top - 2, stem[2])
    lf = _color_ramp(_hex(_acc(accent, "#4f9a2c")), 3)
    ls = R.choice([-1, 1])
    for (x, y, k) in ((1, -2, 2), (2, -2, 2), (2, -1, 1), (3, -2, 1), (1, -1, 1)):
        cv.px(8 + ls * x, top + y, lf[k])


def _it_berry(cv, r, R, accent):
    layouts = [((5.5, 10.5), (10.5, 10.5), (8.0, 6.5)),
               ((5.0, 11.0), (9.0, 11.5), (11.0, 7.5), (6.8, 7.0)),
               ((8.0, 11.2), (5.0, 8.0), (11.0, 8.0)),
               ((4.8, 9.6), (8.0, 11.6), (11.2, 9.6), (8.0, 7.0))]
    lay = layouts[int(R.integers(0, len(layouts)))]
    rad = 2.9 if len(lay) == 3 else 2.5
    for (cx, cy) in lay:
        cx, cy = cx + R.uniform(-0.3, 0.3), cy + R.uniform(-0.3, 0.3)
        m, s = _sphere(cx, cy, rad + R.uniform(-0.2, 0.2))
        layer = _Cv()
        layer.paint(m, 1 + _quant(s, 4), r)
        _spec(layer, m, [255, 255, 255], depth=1)
        cv.over(layer)
    lf = _color_ramp(_hex(_acc(accent, "#4f9a2c")), 3)
    top = min(y for _, y in lay) - rad - 0.2
    ls = R.choice([-1, 1])
    cv.px(8, top, lf[1])
    cv.px(8 + ls, top - 1, lf[2])
    cv.px(8 + 2 * ls, top - 1, lf[2])
    cv.px(8 - ls, top - 1, lf[1])


def _it_jelly(cv, r, R, accent):
    X, Y = _mgrid()
    x0, x1 = 2.5 + R.uniform(0, 1.0), 13.5 - R.uniform(0, 1.0)
    y0, y1 = 4.5 + R.uniform(0, 1.2), 13.5 - R.uniform(0, 0.6)
    m = (X > x0) & (X < x1) & (Y > y0) & (Y < y1)
    m &= ~(((X < x0 + 1) | (X > x1 - 1)) & ((Y < y0 + 1) | (Y > y1 - 1)))
    m |= _ellipse((x0 + x1) / 2, y0 + 0.3, (x1 - x0) / 2 - 0.5, 1.4)
    if R.random() < 0.6:  # a wobbly drip down one side
        dx = R.uniform(x0 + 1.5, x1 - 2.5)
        m |= _ellipse(dx, y1 + 0.2, 1.1, 1.3)
    idx = np.full((S, S), 3)
    idx = np.where(Y < y0 + 2.5, 4, idx)
    idx = np.where(X > x1 - 2.5, 2, idx)
    idx = np.where(Y > y1 - 2, 2, idx)
    cv.paint(m, idx, r)
    for _ in range(int(R.integers(2, 4))):  # suspended bubbles
        bx, by = R.uniform(x0 + 2, x1 - 3), R.uniform(y0 + 3, y1 - 2.5)
        cv.px(bx, by, r[5])
        cv.px(bx + 1, by + 1, r[4])
    _spec(cv, m, r[5], r[5], depth=1)


def _it_horn(cv, r, R, accent):
    bend = -R.uniform(2.5, 5.0)
    pts = _curve(3.5 + R.uniform(-0.5, 0.5), 13.0, 12.5, 2.5 + R.uniform(-0.3, 1.0), bend=bend, steps=40)
    base_w = R.uniform(2.3, 2.9)
    m = np.zeros((S, S), bool)
    for i, (x, y) in enumerate(pts):
        rad = base_w * (1 - i / len(pts)) + 0.5
        m |= _ellipse(x, y, rad, rad)
    s = _shade(m, depth=1.8)
    idx = 1 + _quant(s, 4)
    X, Y = _mgrid()
    gap = R.uniform(2.6, 3.4)
    ring = (np.abs(((X + Y) % gap) - gap / 2) < 0.45) & (X + Y < 14 + R.uniform(-1, 2))
    idx = np.where(ring, np.maximum(idx - 1, 1), idx)
    cv.paint(m, idx, r)
    tip = pts[-1]
    cv.px(tip[0], tip[1], r[5])


def _it_core(cv, r, R, accent):
    rad = R.uniform(4.0, 4.7)
    m, s = _sphere(8.0, 8.0, rad)
    X, Y = _mgrid()
    d = np.hypot(X - 8, Y - 8)
    idx = np.where(d < 1.8, 5, np.where(d < 3.2, 4, 3))
    idx = np.where((s < 0.35) & (d > 2.5), 2, idx)
    cv.paint(m, idx, r)
    cv.px(8, 7, [255, 255, 255])
    ring_c = _color_ramp(_hex(_acc(accent, "#9aa3ad")), 4)
    tilt = R.uniform(-0.8, -0.35) * R.choice([1, -1])
    flat = R.uniform(2.2, 3.0)
    ring = _rellipse(8.0, 8.0, 7.0, flat, tilt) & ~_rellipse(8.0, 8.0, 5.6, flat - 1.2, tilt)
    front = ring & ((Y - 8) * math.cos(tilt) - (X - 8) * math.sin(tilt) > -0.5)
    back = ring & ~front & ~m
    cv.paint(back, np.full((S, S), 1), ring_c)
    cv.paint(front, np.where(X < 8, 3, 2), ring_c)


def _it_ingot(cv, r, R, accent):
    L = R.uniform(-1.0, 0.6)
    H = R.uniform(-0.6, 0.6)
    top = _poly([(2.5, 8.5 + H), (5.5, 5.0 + H), (13.5 + L, 5.0 + H), (11.0 + L, 8.5 + H)])
    front = _poly([(2.0, 8.5 + H), (11.0 + L, 8.5 + H), (11.0 + L, 12.0), (2.0, 12.0)])
    side = _poly([(11.0 + L, 8.5 + H), (13.5 + L, 5.0 + H), (14.0 + L, 5.0 + H), (14.0 + L, 9.0), (11.0 + L, 12.0)])
    cv.paint(front, np.full((S, S), 3), r)
    cv.paint(side, np.full((S, S), 2), r)
    cv.paint(top, np.full((S, S), 4), r)
    for x in range(5, int(13 + L)):
        cv.px(x, 5 + H, r[5])
    cv.px(3, 8 + H, r[5])
    cv.px(4, 7 + H, r[5])
    for x in range(3, int(11 + L)):
        cv.px(x, 11, r[2])
    if R.random() < 0.5:  # stamped mark on the top face
        mx = R.uniform(6, 9)
        cv.px(mx, 6.5 + H, r[3])
        cv.px(mx + 1, 6.5 + H, r[3])
    else:
        cv.px(4, 9 + H, r[4])
        cv.px(5, 9 + H, r[4])


def _it_crystal(cv, r, R, accent):
    n = int(R.choice([2, 2, 3]))
    specs = [(8.5 + R.uniform(-0.5, 0.5), 5, R.uniform(1.5, 3.0), R.uniform(-0.1, 0.12))]
    specs.append((4.8 + R.uniform(-0.4, 0.4), 3, R.uniform(5.5, 8.0), R.uniform(-0.45, -0.2)))
    if n == 3:
        specs.append((11.8 + R.uniform(-0.3, 0.3), 3, R.uniform(7.5, 9.5), R.uniform(0.2, 0.45)))
    for (cx, w, top, tilt) in sorted(specs, key=lambda q: q[1]):
        base = 14
        hw = w / 2
        local = [(-hw, 0), (-hw, -(base - top) + hw * 1.3), (0, -(base - top)), (hw, -(base - top) + hw * 1.3), (hw, 0)]
        ca, sa = math.cos(tilt), math.sin(tilt)
        pts = [(cx + px * ca - py * sa, base + px * sa + py * ca) for (px, py) in local]
        m = _poly(pts)
        X, Y = _mgrid()
        u = (X - cx) * ca + (Y - base) * sa
        idx = np.where(u < -hw * 0.3, 4, np.where(u > hw * 0.3, 2, 3))
        idx = np.where(np.abs(u + hw * 0.3) < 0.5, 5, idx)
        layer = _Cv()
        layer.paint(m, idx, r)
        if w > 3:
            _outline(layer, 0.5)
        cv.over(layer)


def _it_leaf(cv, r, R, accent):
    """Broad ovate leaf (widest near its base) on a short stalk, with paired side veins."""
    x0, y0 = 4.2 + R.uniform(-0.4, 0.4), 11.8 + R.uniform(-0.4, 0.4)
    x1, y1 = 13.4, 2.6 + R.uniform(-0.3, 0.5)
    X, Y = _mgrid()
    L = math.hypot(x1 - x0, y1 - y0)
    ux, uy = (x1 - x0) / L, (y1 - y0) / L
    u = (X - x0) * ux + (Y - y0) * uy
    v = -(X - x0) * uy + (Y - y0) * ux
    t = u / L
    wmax = R.uniform(4.0, 4.8)
    half = wmax * np.clip(np.sin(np.clip(t, 0, 1) * math.pi) ** 0.7 * (1.15 - 0.5 * t), 0, 1)
    m = (t >= 0) & (t <= 1) & (np.abs(v) <= half + 0.15)
    if R.random() < 0.5:  # serrated edge
        m &= ~((np.abs(v) > half - 0.6) & (((u * 1.4) % 2.0) < 0.7) & (t > 0.15) & (t < 0.9))
    idx = np.where(v < 0, 4, 3)
    idx = np.where(np.abs(v) > half - 1.0, idx - 1, idx)
    mid = np.abs(v) < 0.5
    gap = R.uniform(2.6, 3.4)
    side = (np.abs(((u - np.abs(v) * 1.1) % gap) - gap / 2) < 0.42) & (np.abs(v) < half - 1.0) & (t > 0.1)
    idx = np.where(mid | side, np.where(v < 0, 5, 2), idx)
    cv.paint(m, idx, r)
    # stalk
    for k in range(1, 4):
        cv.px(x0 - ux * k, y0 - uy * k, r[1] if k > 1 else r[2])


def _it_seed(cv, r, R, accent):
    n = int(R.choice([2, 3, 3, 4]))
    spots = [(5.0, 6.5), (10.5, 5.5), (7.5, 11.0), (11.5, 10.5)]
    R.shuffle(spots)
    striped = R.random() < 0.5
    for (cx, cy) in spots[:n]:
        a = R.uniform(-0.9, 0.9)
        m = _rellipse(cx + R.uniform(-0.5, 0.5), cy + R.uniform(-0.5, 0.5), R.uniform(2.2, 2.7), R.uniform(1.4, 1.8), a)
        layer = _Cv()
        _fill(layer, m, r, 1, 4, depth=1.5)
        if striped:
            X, Y = _mgrid()
            st = m & (np.abs(((X - cx) * math.cos(a) + (Y - cy) * math.sin(a)) % 2.0 - 1.0) < 0.35) & (_dist_in(m) > 1)
            layer.a[st, :3] = r[1]
        _spec(layer, m, r[5], depth=1)
        _outline(layer, 0.45)
        cv.over(layer)


def _it_mushroom(cv, r, R, accent):
    stem = _color_ramp(_hex(_acc(None, "#e6dcc8")), 4, spread=0.6)
    sh = int(R.integers(8, 11))
    for y in range(sh, 15):
        cv.px(6, y, stem[3])
        cv.px(7, y, stem[2])
        cv.px(8, y, stem[2])
        cv.px(9, y, stem[1])
    X, Y = _mgrid()
    cw = R.uniform(5.8, 6.8)
    chh = R.uniform(5.0, 6.6)
    if R.random() < 0.3:  # conical cap
        cap = _poly([(8 - cw, sh + 0.2), (8.0, sh - chh - 0.5), (8 + cw, sh + 0.2)]) & (Y < sh)
    else:
        cap = _ellipse(8.0, sh, cw, chh) & (Y < sh)
    _fill(cv, cap, r, 1, 4, depth=2.5)
    for x in range(int(8 - cw + 1), int(8 + cw)):
        cv.px(x, sh - 1, r[1])
    spot = _acc(accent, _hex(_mix(_lighter(r[4], 0.8), [255, 255, 255], 0.5)))
    cand = [(5, sh - 4), (6, sh - 4), (9, sh - 5), (11, sh - 3), (7, sh - 2), (4, sh - 2), (10, sh - 2), (8, sh - 6)]
    R.shuffle(cand)
    for (x, y) in cand[: int(R.integers(3, 6))]:
        if _hit(cap & (_dist_in(cap) > 1), x, y):
            cv.px(x, y, spot)


def _it_candy(cv, r, R, accent):
    body = _rellipse(8.0, 8.0, R.uniform(3.4, 4.1), R.uniform(2.7, 3.2), -0.785)
    stripe = _acc(accent, "#ffffff")
    X, Y = _mgrid()
    s = _shade(body, depth=2.0)
    idx = 1 + _quant(s, 4)
    cv.paint(body, idx, r)
    gap = float(R.choice([3.0, 4.0]))
    band = body & (np.abs(((X + Y + R.uniform(0, gap)) % gap) - gap / 2) < 0.5)
    cv.a[band, :3] = _mix(stripe, cv.a[band, :3], 0.25)
    wr = _xramp([_hex(_darker(r[3], 0.9)), _hex(r[3]), _hex(r[4])], 3)
    big = R.uniform(2.0, 2.8)
    for (sx, sy, d) in ((4.0, 12.0, -1), (12.0, 4.0, 1)):
        bow = _poly([(sx - d * 1.0, sy + d * 1.0), (sx + d * big, sy + d * 0.5), (sx - d * 0.5, sy - d * big)])
        bow |= _ellipse(sx + d * 0.3, sy - d * 0.3, 1.0, 1.0)
        cv.paint(bow & ~body, np.where(X + Y < 16, 2, 1), wr)


def _it_slice(cv, r, R, accent):
    X, Y = _mgrid()
    cx, cy = 8.0, R.uniform(3.4, 4.6)
    rad = R.uniform(7.2, 7.8)
    d = np.hypot(X - cx, Y - cy)
    m = (d < rad) & (Y > cy + 0.5)
    rind = _color_ramp(_hex(_acc(accent, "#3f9a2c")), 4)
    idx = np.where(d < 3, 4, 3)
    idx = np.where(X > cx + 2, idx - 1, idx)
    cv.paint(m, idx, r)
    band = m & (d > rad - 1.4)
    cv.paint(band, np.where(d > rad - 0.7, 1, 2), rind)
    pale = m & (d > rad - 2.2) & (d <= rad - 1.4)
    cv.a[pale, :3] = _mix(cv.a[pale, :3], [250, 240, 220], 0.5)
    for _ in range(int(R.integers(4, 7))):
        a = R.uniform(0.35, math.pi - 0.35)
        dd = R.uniform(2.0, rad - 2.8)
        x, y = cx + dd * math.cos(a), cy + dd * math.sin(a)
        if _hit(m, x, y):
            cv.px(x, y, [30, 20, 18])


def _it_cheese(cv, r, R, accent):
    tip = R.uniform(3.4, 5.0)
    bot = R.uniform(12.4, 13.4)
    top = _poly([(2.0, 7.5), (13.5, tip), (14.0, 7.5)])
    front = _poly([(2.0, 7.5), (14.0, 7.5), (14.0, bot), (2.0, bot)])
    cv.paint(front, np.full((S, S), 3), r)
    cv.paint(top, np.full((S, S), 5), r)
    for x in range(2, 15):
        cv.px(x, 7, r[4])
    holes = [(5, 10, 1.2), (10.5, 11, 1.4), (12, 9, 0.8), (7.5, 11.5, 0.9), (4, 12, 0.7)]
    R.shuffle(holes)
    for (x, y, rad) in holes[: int(R.integers(2, 4))]:
        for (px, py) in _disc_pts(x, y, rad):
            if 8 <= py < bot - 0.5:
                cv.px(px, py, r[1])
        cv.px(x - 1, y - 1, r[2])
    hx = R.uniform(9, 12)
    cv.px(hx, 6, r[3])
    cv.px(hx + 1, 6, r[3])


def _bottle(cv, liquid_ramp, glass=None, cork=None, fill_top=7.5, swirl=None, flask=False):
    """Vanilla potion silhouette: neck + round body, ``liquid_ramp`` 5 shades."""
    glass = np.array([[200, 214, 220], [228, 236, 240], [252, 254, 255]], float) if glass is None else glass
    cork = _color_ramp(cork or "#9c6b3f", 3)
    X, Y = _mgrid()
    if flask:  # conical lab flask
        body = _poly([(7.0, 5.0), (9.0, 5.0), (13.4, 13.6), (2.6, 13.6)]) | _ellipse(8.0, 13.0, 5.2, 1.4)
        body &= Y < 14.5
    else:
        body = _ellipse(8.0, 10.0, 5.4, 4.8)
    neck = (X > 6) & (X < 10) & (Y > 2) & (Y < 6.5)
    lip = (X > 5) & (X < 11) & (Y > 3) & (Y < 4.2)
    m = body | neck | lip
    cv.paint(m, np.full((S, S), 0), glass)
    cv.a[m, 3] = 255
    inner = body & (_dist_in(body) > 1)
    liquid = inner & (Y > fill_top)
    if swirl is None:
        s = _shade(body, depth=3.0)
        idx = 1 + _quant(s, 3)
    else:
        idx = swirl
    cv.paint(liquid, idx, liquid_ramp)
    surf = liquid & ~_roll(liquid, 1, 0)
    cv.paint(surf, np.full((S, S), 4), liquid_ramp)
    air = inner & ~liquid
    cv.a[air, :3] = _mix(glass[0], liquid_ramp[2], 0.25)
    # glass highlights and cork
    for (x, y) in ((4, 9), (4, 10), (5, 8)):
        if _hit(body, x, y):
            cv.px(x, y, glass[2])
    for y in (1, 2):
        for x in (6, 7, 8, 9):
            cv.px(x, y, cork[1] if x > 7 else cork[2])
    cv.px(7, 1, cork[2])


def _it_bottle(cv, r, R, accent):
    _bottle(cv, r[1:6], cork=accent, fill_top=R.uniform(6.5, 9.5), flask=R.random() < 0.35)
    for _ in range(int(R.integers(1, 3))):
        cv.px(R.uniform(6, 10), R.uniform(10, 13), r[5])


def _egg_mask(cx=8.0, cy=8.6, rx=5.2, ry=6.4, p=2.4):
    """Rounded egg silhouette (narrower top) used by spawn eggs and the egg icon."""
    X, Y = _mgrid()
    t = np.clip((Y - (cy - ry)) / (2 * ry), 0, 1)
    rxx = rx * (0.72 + 0.28 * np.sqrt(t))
    return np.abs((X - cx) / rxx) ** p + np.abs((Y - cy) / ry) ** p <= 1


_EGG_SPOT_SHAPES = [
    [(0, 0)], [(0, 0), (1, 0)], [(0, 0), (0, 1)], [(0, 0), (1, 0), (0, 1), (1, 1)],
    [(0, 0), (1, 0), (1, 1)], [(1, 0), (0, 1), (1, 1), (2, 1)], [(0, 0), (1, 0), (2, 0), (1, 1)],
]
_EGG_SPOT_W = [0.16, 0.18, 0.14, 0.2, 0.12, 0.1, 0.1]


def _egg_spots(R, inner, n, cx=8.0, cy=8.6, tries=160):
    """Place ``n`` small spots of mixed shape at jittered random positions inside ``inner``.

    Spots keep a 1px gap from each other, and a spot is rejected when it would form a
    left/right mirrored pair with an existing one in the upper half of the egg (two spots at
    the same height either side of the centre line read as a pair of eyes -> a face)."""
    spots = np.zeros(inner.shape, bool)
    centres = []
    w = np.array(_EGG_SPOT_W) / sum(_EGG_SPOT_W)
    for _ in range(tries):
        if len(centres) >= n:
            break
        shp = _EGG_SPOT_SHAPES[int(R.choice(len(_EGG_SPOT_SHAPES), p=w))]
        x0, y0 = int(R.integers(2, 14)), int(R.integers(2, 15))
        cells = [(x0 + dx, y0 + dy) for (dx, dy) in shp]
        if not all(0 <= x < S and 0 <= y < S and inner[y, x] for (x, y) in cells):
            continue
        if any(spots[max(0, y - 1):y + 2, max(0, x - 1):x + 2].any() for (x, y) in cells):
            continue
        sx = np.mean([c[0] for c in cells]) + 0.5
        sy = np.mean([c[1] for c in cells]) + 0.5
        face = False
        for (ox, oy) in centres:
            if min(sy, oy) < cy + 1.0 and abs(sy - oy) <= 1.6 and (sx - cx) * (ox - cx) < 0 \
                    and abs((sx - cx) + (ox - cx)) <= 2.0:
                face = True
                break
        if face:
            continue
        for (x, y) in cells:
            spots[y, x] = True
        centres.append((sx, sy))
    return spots


def _it_egg(cv, r, R, accent):
    m = _egg_mask(8.0, 8.4, R.uniform(5.0, 5.5), R.uniform(6.0, 6.4), p=2.05)
    _fill(cv, m, r, 1, 4, depth=3.0)
    if accent is not None:
        sc = _color_ramp(_hex(_acc(accent, "#000")), 3)
        spots = _egg_spots(R, _dist_in(m) >= 2, int(R.integers(4, 7)), cy=8.3)
        X, Y = _igrid()
        cv.a[spots, :3] = np.where(((X + Y) % 2 < 1)[spots][:, None], sc[1], sc[0])
    _spec(cv, m, r[5], r[5], depth=2)


def _it_chip(cv, r, R, accent):
    pin = np.array([[120, 124, 130], [176, 182, 188], [226, 230, 234]], float)
    step = int(R.choice([2, 2, 3]))
    for k in range(4, 12, step):
        for (x, y) in ((k, 2), (k, 3), (k, 12), (k, 13), (2, k), (3, k), (12, k), (13, k)):
            cv.px(x, y, pin[2] if (x in (2, 3) or y in (2, 3)) else pin[1])
    X, Y = _mgrid()
    body = (X > 4) & (X < 12) & (Y > 4) & (Y < 12)
    idx = np.full((S, S), 1)
    idx = np.where((Y < 6) | (X < 6), 2, idx)
    cv.paint(body, idx, r)
    glow = _color_ramp(_hex(_acc(accent, "#38f5ff")), 3)
    gx, gy = 7 + int(R.integers(-1, 2)), 7 + int(R.integers(-1, 2))
    if R.random() < 0.5:
        for (x, y, k) in ((gx, gy, 2), (gx + 1, gy, 1), (gx, gy + 1, 1), (gx + 1, gy + 1, 0)):
            cv.px(x, y, glow[k])
    else:  # a little lit trace
        for i in range(3):
            cv.px(6 + i, gy, glow[2 - (i == 2)])
        cv.px(8, gy + 1, glow[1])
        cv.px(8, gy + 2, glow[0])
    cv.px(5, 5, r[4])


def _it_bolt(cv, r, R, accent):
    """Hex-head bolt with a long threaded shank and a pointed end."""
    X, Y = _mgrid()
    hw = R.uniform(2.8, 3.3)
    sl = R.uniform(13.0, 14.0)
    sw = R.uniform(1.1, 1.4)
    head_bot = 5.0
    shank = (np.abs(X - 8.0) < sw) & (Y > head_bot) & (Y < sl)
    shank |= _poly([(8.0 - sw, sl - 0.2), (8.0 + sw, sl - 0.2), (8.0, sl + 1.4)])
    thread = ((Y + (X - 8.0) * 0.5) % 2.0) < 1.0
    sidx = np.where(thread, 4, 2)
    sidx = np.where((X > 8.6) & thread, 3, sidx)
    cv.paint(shank, sidx, r)
    topf = _poly([(8 - hw, 2.6), (8 - hw / 2, 1.5), (8 + hw / 2, 1.5), (8 + hw, 2.6), (8 + hw / 2, 3.7), (8 - hw / 2, 3.7)])
    front = _poly([(8 - hw, 2.6), (8 + hw, 2.6), (8 + hw, head_bot), (8 + hw / 2, head_bot + 0.9),
                   (8 - hw / 2, head_bot + 0.9), (8 - hw, head_bot)]) & ~topf
    fidx = np.where(X < 8 - hw / 2, 4, np.where(X < 8 + hw / 2, 3, 2))
    cv.paint(front, fidx, r)
    cv.paint(topf, np.where(X < 8.5, 5, 4), r)
    if R.random() < 0.45:  # a nut part way down the shank
        ny = R.uniform(9.0, 11.0)
        nut = (np.abs(X - 8.0) < sw + 1.3) & (Y > ny) & (Y < ny + 1.8)
        cv.paint(nut, np.where(X < 8, 4, 2), r)


def _it_star(cv, r, R, accent):
    pts = []
    rot = R.uniform(-0.25, 0.25)
    inner = R.uniform(2.6, 3.3)
    for k in range(10):
        a = -math.pi / 2 + rot + k * math.pi / 5
        rad = 7.0 if k % 2 == 0 else inner
        pts.append((8.0 + rad * math.cos(a), 8.6 + rad * math.sin(a)))
    m = _poly(pts)
    _fill(cv, m, r, 2, 5, depth=2.0)
    _spec(cv, m, [255, 255, 255], depth=2)


def _it_coin(cv, r, R, accent):
    m, s = _sphere(8.0, 8.0, 6.0)
    X, Y = _mgrid()
    d = np.hypot(X - 8, Y - 8)
    idx = np.where(d > 4.6, np.where((X - 8) + (Y - 8) < 0, 5, 2), 3)
    idx = np.where((d > 3.6) & (d <= 4.6), np.where((X - 8) + (Y - 8) < 0, 2, 4), idx)
    cv.paint(m, idx, r)
    emb = int(R.integers(0, 3))
    if emb == 0:  # embossed star
        pts = []
        for k in range(10):
            a = -math.pi / 2 + k * math.pi / 5
            rad = 2.8 if k % 2 == 0 else 1.2
            pts.append((8.0 + rad * math.cos(a), 8.2 + rad * math.sin(a)))
        st = _poly(pts)
    elif emb == 1:  # square hole (cash coin)
        st = (np.abs(X - 8) < 1.6) & (np.abs(Y - 8) < 1.6)
        cv.paint(st, np.full((S, S), 1), r)
        st = ((np.abs(X - 8) < 2.6) & (np.abs(Y - 8) < 2.6)) & ~st & ((X - 8) + (Y - 8) > 0)
    else:  # embossed ring / gem dot
        st = (d < 2.4) & (d > 1.2)
    cv.paint(st, np.where(X + Y < 16, 5, 4), r)
    _spec(cv, m, [255, 255, 255], depth=1)


def _it_flower(cv, r, R, accent):
    cc = _color_ramp(_hex(_acc(accent, "#f2c23a")), 3)
    stem = _color_ramp("#4f9a2c", 3)
    for (x, y) in ((8, 10), (8, 11), (7, 12), (7, 13), (7, 14)):
        cv.px(x, y, stem[1])
    ls = R.choice([-1, 1])
    cv.px(8 + ls, 12, stem[2])
    cv.px(8 + 2 * ls, 11, stem[2])
    X, Y = _mgrid()
    cx, cy = 8.0, 6.0
    dx, dy = X - cx, Y - cy
    d = np.hypot(dx, dy)
    ang = np.arctan2(dy, dx)
    npet = int(R.choice([4, 5, 5, 6]))
    petal = np.cos(ang * npet + R.uniform(0, math.tau)) * R.uniform(1.0, 1.5) + R.uniform(3.6, 4.2)
    m = d < petal
    idx = np.where(dx + dy < -1, 5, np.where(dx + dy > 2, 3, 4))
    idx = np.where(d > petal - 1, idx - 1, idx)
    cv.paint(m, idx, r)
    cv.paint(d < R.uniform(1.3, 1.9), np.where(dx + dy < 0, 2, 1), cc)


def _it_tentacle(cv, r, R, accent):
    """Tapering tentacle rising from the lower left and curling into an open loop at its tip,
    with pale suction cups along its inner side."""
    j = lambda a, s=0.45: a + R.uniform(-s, s)  # noqa: E731
    ctrl = [(j(3.2), 13.0), (j(4.2), 10.2), (j(6.2), 6.8), (j(9.0), 4.2), (12.2, j(3.2, 0.3)), (13.4, j(5.4, 0.3)),
            (13.0, 8.2), (11.2, 9.2), (9.8, 7.8), (10.6, 6.2)]
    pts = _catmull(ctrl, 8)
    w0 = R.uniform(2.0, 2.4)
    m = np.zeros((S, S), bool)
    radii = []
    n = len(pts)
    for i, (px, py) in enumerate(pts):
        t = i / (n - 1)
        rad = w0 * (1 - t) ** 1.4 + 0.45
        radii.append(rad)
        m |= _ellipse(px, py, rad, rad)
    _fill(cv, m, r, 1, 4, depth=1.8)
    suck = _color_ramp(_hex(_acc(accent, _hex(_lighter(r[4], 0.5)))), 3)
    gap = int(R.integers(5, 7))
    for i in range(2, int(n * 0.62), gap):
        px, py = pts[i]
        qx, qy = pts[i + 1]
        tx, ty = qx - px, qy - py
        Lt = math.hypot(tx, ty) or 1
        nx_, ny_ = -ty / Lt, tx / Lt  # right of the heading = inside of the clockwise curl
        off = radii[i] * 0.55
        sx, sy = px + nx_ * off, py + ny_ * off
        if _hit(m & (_dist_in(m) > 1), sx, sy):
            cv.px(sx, sy, suck[2])


def _it_wing(cv, r, R, accent):
    """Spread wing: an arm along the top with coverts and separated, swept-back primary
    feathers hanging from it (or, for some seeds, a bat-like membrane wing)."""
    X, Y = _mgrid()
    if R.random() < 0.65:
        S0 = (1.8 + R.uniform(-0.3, 0.3), 5.8 + R.uniform(-0.5, 0.5))
        T0 = (14.0, 2.0 + R.uniform(0, 0.8))
        ax, ay = T0[0] - S0[0], T0[1] - S0[1]
        dl = math.radians(R.uniform(-28, -16))  # feathers sweep back toward the body
        dx_, dy_ = math.sin(dl), math.cos(dl)
        det = ax * dy_ - ay * dx_
        px_, py_ = X - S0[0], Y - S0[1]
        u = (px_ * dy_ - py_ * dx_) / det
        v = (ax * py_ - ay * px_) / det
        v = v + 1.2 * np.sin(np.clip(u, 0, 1) * math.pi)  # arched leading edge
        nf = int(R.integers(4, 6))
        uf = 0.22
        fid = np.full((S, S), -1)
        depth = np.full((S, S), 2.6 + 1.4 * u)  # covert depth
        for k in range(nf):
            a, b = uf + (1 - uf) * k / nf, uf + (1 - uf) * (k + 1) / nf
            c = (a + b) / 2
            Dk = 6.4 + 4.4 * (k / max(1, nf - 1)) ** 0.8 + R.uniform(-0.4, 0.4)
            tipd = Dk - 2.4 * np.abs(u - c) / ((b - a) / 2)  # pointed feather tip
            sel = (u >= a) & (u < b)
            fid = np.where(sel, k, fid)
            depth = np.where(sel, np.maximum(depth, tipd), depth)
        m = (u >= 0) & (u <= 1.0) & (v >= -0.7) & (v <= depth)
        cov = m & (v <= 2.4 + 1.2 * u)
        idx = np.where(fid % 2 == 0, 3, 2)
        idx = np.where(cov, 4, idx)
        idx = np.where(m & (np.abs(v - (2.4 + 1.2 * u)) < 0.5), 3, idx)  # covert row edge
        idx = np.where(v < 0.5, 5, idx)  # lit leading edge
        sep = m & ~cov & (fid != _roll(fid, 0, -1))
        idx = np.where(sep, 1, idx)
        cv.paint(m, idx, r)
    else:
        J = (3.4 + R.uniform(-0.4, 0.4), 3.6 + R.uniform(-0.4, 0.4))
        nf = 4
        a0, a1 = math.radians(R.uniform(0, 8)), math.radians(R.uniform(84, 92))
        tips = []
        for k in range(nf):
            a = a0 + (a1 - a0) * k / (nf - 1)
            ln = R.uniform(10.5, 12.0) - (0.8 if 0 < k < nf - 1 else 0)
            tips.append((J[0] + math.cos(a) * ln, J[1] + math.sin(a) * ln))
        m = _poly([J] + tips)
        for a_, b_ in zip(tips[:-1], tips[1:]):
            mx, my = (a_[0] + b_[0]) / 2, (a_[1] + b_[1]) / 2
            seg = math.hypot(b_[0] - a_[0], b_[1] - a_[1])
            ox, oy = mx - J[0], my - J[1]
            ol = math.hypot(ox, oy) or 1
            m &= ~_ellipse(mx + ox / ol * seg * 0.35, my + oy / ol * seg * 0.35, seg * 0.52, seg * 0.52)
        d = np.hypot(X - J[0], Y - J[1])
        cv.paint(m, np.where(d < 6, 3, 2), r)
        for tp in tips:
            cv.paint(_thick([J, tp], rad=0.55), np.full((S, S), 4), r)
        cv.paint(_ellipse(J[0] + 0.6, J[1] + 0.6, 1.6, 1.6), np.full((S, S), 5), r)


def _it_petal(cv, r, R, accent):
    """Flower petal: rounded, notched outer end narrowing to a pale base (no veins, no stalk)."""
    X, Y = _mgrid()
    w = R.uniform(4.0, 4.9)
    cy = R.uniform(6.4, 7.4)
    m = _ellipse(8.0, cy, w, R.uniform(4.6, 5.3))
    m |= _poly([(8.0 - w * 0.75, cy + 2.0), (8.0 + w * 0.75, cy + 2.0), (8.0, 14.6)])
    notch = R.uniform(1.6, 2.6)
    m &= ~_poly([(8.0 - notch * 0.6, 1.0), (8.0 + notch * 0.6, 1.0), (8.0, 1.0 + notch + 0.6)])
    # gradient: pale base -> saturated outer end, lit on the left
    t = np.clip((14.5 - Y) / 12.5, 0, 1)
    idx = np.where(t < 0.3, 5, np.where(t < 0.55, 4, 3))
    idx = np.where((X > 8.0 + w * 0.35) & (t > 0.3), idx - 1, idx)
    idx = np.where((X < 8.0 - w * 0.4) & (t > 0.3), np.minimum(idx + 1, 5), idx)
    cv.paint(m, np.clip(idx, 1, 5), r)
    # a faint crease down the middle
    for y in range(int(cy), 13):
        if _hit(m & (_dist_in(m) > 1), 8, y):
            cv.px(8, y, r[3] if y < 10 else r[4])


def _it_pearl(cv, r, R, accent):
    rad = R.uniform(4.9, 5.4)
    cx, cy = 8.0 + R.uniform(-0.3, 0.3), 8.4 + R.uniform(-0.3, 0.3)
    m, s = _sphere(cx, cy, rad)
    cv.paint(m, 2 + _quant(s, 4), r)
    X, Y = _igrid()
    tint_c = _mix(r[3], [200, 170, 230] if R.random() < 0.5 else [170, 210, 230], 0.45)
    a = R.uniform(0.3, 1.2)
    luster = m & (np.abs(np.hypot(X - 8 - 1.2 * math.cos(a), Y - 8.4 - 1.2 * math.sin(a)) - rad * 0.75) < 0.5) & \
        ((X - 8) + (Y - 8.4) > 1.5)
    cv.a[luster, :3] = tint_c
    _spec(cv, m, [255, 255, 255], r[5], depth=2)


def _it_rod(cv, r, R, accent):
    ln = R.uniform(6.6, 7.4)
    ang = -math.pi / 4 + R.uniform(-0.12, 0.12)
    c, s_ = math.cos(ang), math.sin(ang)
    a = (8.0 - c * ln, 8.0 - s_ * ln)
    b = (8.0 + c * ln, 8.0 + s_ * ln)
    m = _thick([a, b], rad=R.uniform(1.0, 1.3))
    X, Y = _mgrid()
    gap = R.uniform(3.4, 4.6)
    u = (X - 8.0) * c + (Y - 8.0) * s_
    v = -(X - 8.0) * s_ + (Y - 8.0) * c
    seg = (np.abs((u + 20) % gap) < 0.8)
    idx = np.where(v < 0, 4, 3)
    idx = np.where(seg, 2, idx)
    cv.paint(m, idx, r)
    for (px, py) in (b,):
        cap = _ellipse(px, py, 1.5, 1.5)
        cv.paint(cap, np.where(X + Y < px + py, 5, 4), r)


def _it_gear(cv, r, R, accent):
    teeth = int(R.choice([6, 8, 8, 10]))
    m, d = _gear_mask(8.0, 8.0, R.uniform(6.3, 6.8), R.uniform(4.6, 5.1), teeth, R.uniform(1.4, 2.1), R.uniform(0, 1))
    s = _shade(m, depth=1.5)
    idx = 1 + _quant(s, 5)
    idx = np.where((d > 2.3) & (d < 3.2), np.maximum(idx - 1, 1), idx)
    cv.paint(m, idx, r)


def _it_meat_raw(cv, r, R, accent):
    _it_meat(cv, r, R, accent, cooked=False)


def _it_meat_cooked(cv, r, R, accent):
    _it_meat(cv, r, R, accent, cooked=True)


ITEM_KINDS = ["meat_raw", "meat_cooked", "gem", "orb", "shard", "goo", "feather", "scale", "fang",
              "eyeball", "spore", "dust", "bone", "shell", "fruit", "berry", "jelly", "horn", "core",
              "ingot", "crystal", "leaf", "seed", "mushroom", "candy", "slice", "cheese", "bottle", "egg",
              "chip", "bolt", "star", "coin", "flower", "tentacle", "wing", "petal", "pearl", "rod", "gear"]


# kind -> (max rotation in degrees, min scale, may mirror, extra lean in degrees)
_ITEM_JITTER = {
    "meat_raw": (12, 0.92, True, 0), "meat_cooked": (12, 0.92, True, 0), "gem": (0, 0.9, False, 0),
    "orb": (0, 0.92, False, 0), "shard": (12, 0.9, True, 0), "goo": (6, 0.92, True, 0),
    "feather": (10, 0.92, True, 0), "scale": (14, 0.88, True, 0), "fang": (10, 0.92, True, 0),
    "eyeball": (0, 0.92, False, 0), "spore": (20, 0.92, False, 0), "dust": (0, 0.92, True, 0),
    "bone": (10, 0.92, True, 0), "shell": (8, 0.9, False, 0), "fruit": (10, 0.92, True, 0),
    "berry": (10, 0.92, True, 0), "jelly": (0, 0.92, False, 0), "horn": (10, 0.92, True, 0),
    "core": (0, 0.92, False, 0), "ingot": (0, 0.94, False, 0), "crystal": (6, 0.92, True, 0),
    "leaf": (10, 0.92, True, 0), "seed": (12, 0.94, True, 0), "mushroom": (6, 0.94, True, 0),
    "candy": (10, 0.94, True, 0), "slice": (14, 0.94, True, 0), "cheese": (0, 0.94, True, 0),
    "bottle": (0, 0.97, False, 0), "egg": (8, 0.94, False, 0), "chip": (0, 0.94, False, 0),
    "bolt": (6, 0.92, True, 16), "star": (8, 0.92, False, 0), "coin": (0, 0.94, False, 0),
    "flower": (10, 0.94, True, 0), "tentacle": (8, 0.92, True, 0), "wing": (8, 0.92, True, 0),
    "petal": (14, 0.9, True, 28), "pearl": (0, 0.97, False, 0), "rod": (8, 0.94, True, 0),
    "gear": (0, 0.94, False, 0),
}


def item_icon(kind, pal, seed, accent=None):
    """16x16 item icon of ``kind`` (see ITEM_KINDS) coloured by ``pal`` with a darker outline.

    ``accent`` (hex) colours a secondary detail: fat marbling, iris, leaf, cork, rind, spots...
    The seed varies the shape of every kind: proportions, lean, mirroring (for asymmetric kinds)
    and the positions of notches, spots and other details, so two dimensions using the same
    kind get different icons, not just a different palette.
    """
    global _XF
    if kind not in ITEM_KINDS:
        raise ValueError(f"unknown item kind {kind!r}; expected one of {ITEM_KINDS}")
    r = _xramp(pal, 5, light=1)  # 6 shades
    rot, smin, mir, lean = _ITEM_JITTER.get(kind, (6, 0.94, False, 0))
    J = _R(seed, "itemxf:" + kind)
    mirror = bool(mir and J.random() < 0.5)
    ang = math.radians(J.uniform(-rot, rot) + lean * (-1 if mirror else 1))
    scale = J.uniform(smin, 1.0)
    prev = _XF
    try:
        for attempt in range(4):
            _XF = _Xform(ang=ang, scale=scale, mirror=mirror, cy=8.5)
            R = _R(seed, "item:" + kind)
            cv = _Cv()
            globals()["_it_" + kind](cv, r, R, accent)
            m = cv.mask
            # keep a 1px margin for the outline
            if not (m[0].any() or m[-1].any() or m[:, 0].any() or m[:, -1].any()):
                break
            scale *= 0.93
    finally:
        _XF = prev
    _outline(cv, 0.45)
    return cv.img()


# =========================================================================
#  portal fluid bottle, spawn eggs
# =========================================================================


# portal colours (sampled from the reference portal art)
PORTAL_PALETTE = ["#1b8433", "#4fae49", "#7ac653", "#97cd59", "#cbe368"]
PORTAL_FLUID = ["#2e8a2c", "#5ec83a", "#7ed443", "#9be04a", "#d4f58c"]


def _portal_liquid_idx(phase, seed):
    """Swirling shade indices (1..4) for the bottle liquid at a given phase (radians).
    Bands step two shades (1 <-> 3) across the whole liquid so the swirl reads clearly."""
    X, Y = _mgrid()
    cx, cy = 8.0, 10.2
    dx, dy = X - cx, Y - cy
    d = np.hypot(dx, dy)
    th = np.arctan2(dy, dx)
    band = np.sin(2 * th + d * 1.1 - phase)
    idx = np.where(band > 0.35, 3, np.where(band > -0.35, 2, 1))
    idx = np.where(d < 1.3, 4, idx)
    idx = np.where((dx + dy < -4.5), np.minimum(idx + 1, 4), idx)
    return idx


def _portal_bottle(seed, t):
    """Portal fluid bottle at loop position ``t`` in [0, 1) (shared by the static icon and the
    animation so the static bottle equals frame 0)."""
    lr = np.array([_rgb(c)[:3] for c in PORTAL_FLUID])
    cv = _Cv()
    _bottle(cv, lr, cork="#8a6a4a", fill_top=6.5, swirl=_portal_liquid_idx(t * math.tau, seed))
    body = _ellipse(8.0, 10.0, 5.4, 4.8)
    inner = body & (_dist_in(body) > 1)
    R = _R(seed, "pff")
    spark = _rgb("#f0fbcf")[:3]
    # three bubbles rising 1px per frame-step (one 6px rise per loop), never interpolated
    for k in range(3):
        bx = R.uniform(5.5, 10.5)
        off = R.uniform(0, 1)
        u = (off + t) % 1.0
        by = 13.5 - u * 6.0
        x, y = int(bx + 0.8 * math.sin(u * 6)), int(by)
        if inner[y, x] and y > 7:
            cv.px(x, y, spark)
    _outline(cv, 0.5)
    return cv.img()


def portal_fluid_bottle(seed, phase=0.0):
    """Glass potion bottle filled with glowing lime portal fluid (``phase`` in radians;
    ``phase=0`` is identical to ``portal_fluid_frames(seed)[0]``)."""
    return _portal_bottle(seed, (phase / math.tau) % 1.0)


def portal_fluid_frames(seed, n=16):
    """``n`` frames of the portal fluid bottle with the liquid swirling (loops seamlessly).
    Tagged for ``interpolate=False`` (see ``animated``)."""
    return _tag_frames([_portal_bottle(seed, f / n) for f in range(n)], 2, False)


def spawn_egg(base_hex, spot_hex, seed):
    """Spawn egg icon (vanilla silhouette) in ``base_hex`` with 4-7 ``spot_hex`` spots of mixed
    size at seed-jittered positions (mirrored pairs that would read as a face are rejected)."""
    br = _color_ramp(base_hex, 5, spread=0.85)
    sr = _color_ramp(spot_hex, 4, spread=0.85)
    R = _R(seed, "egg")
    cv = _Cv()
    m = _egg_mask()
    s = _shade(m, depth=3.0)
    bidx = _quant(np.clip(s * 1.05, 0, 0.999), 5)
    cv.paint(m, bidx, br)
    inner = _dist_in(m) >= 2
    spots = _egg_spots(R, inner, int(R.integers(4, 8)))
    sidx = np.clip(np.round(s * 3), 0, 3).astype(int)
    up = _roll(spots, 1, 0)
    left = _roll(spots, 0, 1)
    sidx = np.where(spots & (~up | ~left), np.minimum(sidx + 1, 3), sidx)
    cv.paint(spots, sidx, sr)
    _spec(cv, m, _lighter(br[4], 0.5), br[4], depth=2)
    base_l = _lum(_rgb(base_hex)[:3])
    if base_l < 40:
        # very dark egg: a darkened outline would vanish into the body, so light the rim
        X, Y = _igrid()
        rim = m & (_dist_in(m) == 1) & ((X - 8) + (Y - 8.6) > -2)
        cv.a[rim, :3] = _mix(cv.a[rim, :3], _lighter(br[3], 0.35), 0.55)
        _outline(cv, color="#050506")
    else:
        _outline(cv, 0.42)
    return cv.img()


# =========================================================================
#  portal gun parts (textures for the 3D JSON gun model)
# =========================================================================


def gun_body(seed):
    """Light grey / white body panels with subtle seams and a couple of screws."""
    r = np.array([_rgb(c)[:3] for c in ["#9aa1a7", "#b9bfc4", "#cdd2d6", "#d9dde0", "#e8ebed", "#f6f8f9"]])
    xx, yy = _grid()
    f = 0.6 * _vn(8, 4, seed + ":a") + 0.4 * _white(seed + ":w")
    idx = 2 + _levels(f, [0.12, 0.66, 0.22])  # 2..4
    # panel seams
    idx = np.where(yy == 5, 1, idx)
    idx = np.where(yy == 6, 5, idx)
    idx = np.where((xx == 10) & (yy > 6), 1, idx)
    idx = np.where((xx == 11) & (yy > 6), 5, idx)
    idx = np.where(yy == 0, 5, idx)
    idx = np.where(yy == S - 1, 1, idx)
    # sheen streak
    idx = np.where(((xx + yy) % 16 == 3) & (yy < 5), 5, idx)
    for (x, y) in ((2, 2), (13, 9), (2, 12)):
        idx[y, x] = 0
        idx[y - 1, x - 1] = 5
    return _render(idx, r)


def gun_dark(seed):
    """Grey handle / trim with horizontal grip ridges."""
    r = np.array([_rgb(c)[:3] for c in ["#33373b", "#464a4f", "#585d62", "#6b7075", "#81868b", "#9a9fa4"]])
    xx, yy = _grid()
    f = 0.5 * _vn(8, 2, seed + ":a") + 0.5 * _white(seed + ":w")
    idx = 2 + _levels(f, [0.2, 0.6, 0.2])  # 2..4
    ridge = (yy % 4)
    idx = np.where(ridge == 0, 4, idx)
    idx = np.where(ridge == 3, 1, idx)
    idx = np.where((ridge == 0) & (xx % 8 == 0), 5, idx)
    return _render(idx, r)


_FONT3x5 = {
    "0": ["111", "101", "101", "101", "111"], "1": ["010", "110", "010", "010", "111"],
    "2": ["111", "001", "111", "100", "111"], "3": ["111", "001", "011", "001", "111"],
    "4": ["101", "101", "111", "001", "001"], "5": ["111", "100", "111", "001", "111"],
    "6": ["111", "100", "111", "101", "111"], "7": ["111", "001", "010", "010", "010"],
    "8": ["111", "101", "111", "101", "111"], "9": ["111", "101", "111", "001", "111"],
    "A": ["010", "101", "111", "101", "101"], "B": ["110", "101", "110", "101", "110"],
    "C": ["111", "100", "100", "100", "111"], "D": ["110", "101", "101", "101", "110"],
    "E": ["111", "100", "110", "100", "111"], "F": ["111", "100", "110", "100", "100"],
    "G": ["011", "100", "101", "101", "011"], "H": ["101", "101", "111", "101", "101"],
    "I": ["111", "010", "010", "010", "111"], "J": ["001", "001", "001", "101", "010"],
    "K": ["101", "101", "110", "101", "101"], "L": ["100", "100", "100", "100", "111"],
    "M": ["101", "111", "111", "101", "101"], "N": ["110", "101", "101", "101", "101"],
    "O": ["010", "101", "101", "101", "010"], "P": ["110", "101", "110", "100", "100"],
    "Q": ["010", "101", "101", "110", "011"], "R": ["110", "101", "110", "101", "101"],
    "S": ["011", "100", "010", "001", "110"], "T": ["111", "010", "010", "010", "010"],
    "U": ["101", "101", "101", "101", "111"], "V": ["101", "101", "101", "101", "010"],
    "W": ["101", "101", "111", "111", "101"], "X": ["101", "101", "010", "101", "101"],
    "Y": ["101", "101", "010", "010", "010"], "Z": ["111", "001", "010", "100", "111"],
    "-": ["000", "000", "111", "000", "000"], " ": ["000", "000", "000", "000", "000"],
    ".": ["000", "000", "000", "000", "010"], ":": ["000", "010", "000", "010", "000"],
    "!": ["010", "010", "010", "000", "010"], "?": ["110", "001", "010", "000", "010"],
    "/": ["001", "001", "010", "100", "100"], "+": ["000", "010", "111", "010", "000"],
}


def _glyphs(text):
    """Validate ``text`` for the 3x5 screen font and split it into at most two lines of <= 3
    characters.  Raises ValueError for unknown characters or text longer than 6 characters."""
    t = str(text).upper()
    bad = sorted({ch for ch in t if ch not in _FONT3x5})
    if bad:
        raise ValueError(f"gun_screen(): no glyph for {bad}; supported: {''.join(sorted(_FONT3x5))!r}")
    if len(t) > 6:
        raise ValueError(f"gun_screen(): text {text!r} is too long (max 3 characters per line, 2 lines)")
    if len(t) <= 3:
        return [t] if t else []
    for sep in ("-", " "):  # prefer breaking after a separator: "C-137" -> "C-" / "137"
        k = t.find(sep)
        if 0 <= k:
            a, b = t[:k + 1].rstrip(), t[k + 1:].lstrip()
            if 0 < len(a) <= 3 and 0 < len(b) <= 3:
                return [a, b]
    h = (len(t) + 1) // 2
    return [t[:h], t[h:]]


def gun_screen(seed, text="137"):
    """Dark bezel with a glowing orange-red display (scanlines + up to 2 lines of 3x5 text).

    ``text``: digits, A-Z and ``- . : ! ? / +``; up to 3 characters on one line (with a small
    level meter under it) or up to 6 on two lines (split after a ``-``/space when possible).
    Text is centred on the screen with at least 1px of screen on every side."""
    lines = _glyphs(text)
    bezel = np.array([_rgb(c)[:3] for c in ["#1c1e21", "#2a2d31", "#3a3e43", "#4b5056"]])
    disp = np.array([_rgb(c)[:3] for c in ["#a8341a", "#d84a20", "#ff6a2a", "#ff9a5a", "#ffd2a8"]])
    out = np.zeros((S, S, 4))
    out[..., 3] = 255
    xx, yy = _grid()
    out[..., :3] = bezel[1]
    out[(yy == 0) | (xx == 0), :3] = bezel[3]
    out[(yy == S - 1) | (xx == S - 1), :3] = bezel[0]
    screen = (xx >= 1) & (xx <= 14) & (yy >= 1) & (yy <= 14)
    out[screen, :3] = disp[2]
    out[screen & (yy % 2 == 0), :3] = disp[1]  # scanlines
    out[screen & ((yy == 1) | (yy == 14)), :3] = disp[0]  # dim top / bottom rows
    out[screen & (xx == 1) & (yy <= 2), :3] = disp[0]
    rows0 = [4] if len(lines) == 1 else [2, 8]
    for line, y0 in zip(lines, rows0):
        w = len(line) * 4 - 1
        x0 = 1 + (14 - w) // 2  # centred in the 14px screen (>= 1px margin each side)
        for i, ch in enumerate(line):
            for gy, row in enumerate(_FONT3x5[ch]):
                for gx, bit in enumerate(row):
                    if bit == "1":
                        out[y0 + gy, x0 + i * 4 + gx, :3] = disp[4]
    if len(lines) <= 1:
        # little level meter under the readout
        R = _R(seed, "meter")
        lvl = 4 + int(R.integers(3, 7))
        for x in range(3, 13):
            out[11, x, :3] = disp[3] if x < lvl else disp[0]
    return _img(out)


def gun_button(seed):
    """Round glowing green light set in a grey bezel."""
    out = _arr(gun_dark(seed + ":bg"))
    g = np.array([_rgb(c)[:3] for c in ["#14501c", "#1f8a2a", "#3fc23a", "#7ee860", "#c8ff9e", "#ffffff"]])
    X, Y = _mgrid()
    d = np.hypot(X - 8, Y - 8)
    ring = (d < 6.6) & (d >= 5.4)
    out[ring, :3] = np.where(((X - 8) + (Y - 8) < 0)[ring][:, None], _rgb("#2c3034")[:3], _rgb("#8a9095")[:3])
    m, s = _sphere(8.0, 8.0, 5.4)
    idx = 1 + _quant(np.clip(s * 0.7 + 0.35 * (1 - d / 5.4), 0, 0.999), 4)
    out[m, :3] = g[idx[m]]
    out[5, 6, :3] = g[5]
    out[6, 5, :3] = g[4]
    out[5, 7, :3] = g[4]
    return _img(out)


def gun_canister_frames(seed, n=16):
    """``n`` frames of bright green fluid swirling in a glass canister (seamless loop).

    Bubbles rise exactly 1px per frame (16 frames = one 16px rise) and the strip is tagged
    ``interpolate=False`` so they move instead of cross-fading (see ``animated``)."""
    pal_ = np.array([_rgb(c)[:3] for c in PORTAL_PALETTE])
    white_ = np.array([247, 252, 235], float)
    glass_hi = np.array([235, 250, 230], float)
    xx, yy = _grid()
    R = _R(seed, "can")
    bubbles = [(int(R.integers(3, 13)), int(R.integers(0, S)), int(R.choice([1, 1, 2]))) for _ in range(5)]
    warp = _vn(4, 4, seed + ":w")
    frames = []
    for f in range(n):
        ph = f / n * math.tau
        band = np.sin((xx * 0.8 + yy) * math.tau / 16 * 2 - ph + 1.6 * warp) \
            + 0.5 * np.sin((xx - yy) * math.tau / 16 + ph)
        idx = np.where(band > 0.9, 3, np.where(band > 0.1, 2, np.where(band > -0.8, 1, 0)))
        out = np.zeros((S, S, 4))
        out[..., 3] = 255
        out[..., :3] = pal_[idx]
        # cylinder shading: darker at the sides
        out[(xx <= 1) | (xx >= 14), :3] *= 0.8
        # bubbles rising 1px per frame (S px per loop when n == S)
        for (bx, off, size) in bubbles:
            by = int((off - f * S / n) % S)
            out[by, bx, :3] = white_
            if size > 1:
                out[by, (bx + 1) % S, :3] = white_
                out[(by + 1) % S, bx, :3] = white_ * 0.9
        # glass highlight streaks
        out[:, 3, :3] = out[:, 3, :3] * 0.4 + glass_hi * 0.6
        out[:, 4, :3] = out[:, 4, :3] * 0.75 + glass_hi * 0.25
        out[:, 12, :3] = out[:, 12, :3] * 0.7 + pal_[4] * 0.3
        out[:, 0, :3] = pal_[0] * 0.8
        out[:, S - 1, :3] = pal_[0] * 0.8
        frames.append(_img(out))
    return _tag_frames(frames, 2, False)
