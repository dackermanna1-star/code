"""Shared helpers for procedural pixel-art / effect texture generation.

Only depends on numpy + Pillow.  Every texture is an RGBA uint8 numpy array of
shape (H, W, 4).  Fully transparent pixels are always written as (0,0,0,0) so the
textures are safe for additive ("eyes"/"lightning") blending.
"""
from __future__ import annotations

import math
import os
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

REPO = Path(__file__).resolve().parents[2]
ASSETS = REPO / "src/main/resources/assets/jjkshowdown"
TEX = ASSETS / "textures"
SCRATCH = Path(os.environ.get(
    "JJK_SCRATCH",
    "/tmp/claude-0/-home-user-code/aede0ecb-3953-5b1e-8826-3459fd05f354/scratchpad/assetwork"))


# --------------------------------------------------------------------------- io
def new(w: int, h: int) -> np.ndarray:
    return np.zeros((h, w, 4), dtype=np.uint8)


def clean(img: np.ndarray) -> np.ndarray:
    """Zero the colour of fully transparent pixels."""
    img = img.copy()
    img[img[..., 3] == 0] = 0
    return img


def save(img: np.ndarray, rel: str, root: Path = TEX) -> Path:
    path = root / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(clean(img), "RGBA").save(path, optimize=True)
    return path


def save_mcmeta(rel_png: str, frametime: int, interpolate: bool = True) -> Path:
    path = TEX / (rel_png + ".mcmeta")
    path.write_text('{\n  "animation": {\n    "frametime": %d,\n    "interpolate": %s\n  }\n}\n'
                    % (frametime, "true" if interpolate else "false"))
    return path


# ----------------------------------------------------------------------- colour
def rgb(h: str) -> tuple:
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def lerp(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(len(a)))


def from_float(rgbf: np.ndarray, alpha: np.ndarray | None = None, premultiply=False) -> np.ndarray:
    """rgbf: (H,W,3) floats 0..1 ; alpha: (H,W) 0..1."""
    h, w = rgbf.shape[:2]
    if alpha is None:
        alpha = np.ones((h, w))
    alpha = np.clip(alpha, 0, 1)
    c = np.clip(rgbf, 0, 1)
    if premultiply:
        c = c * alpha[..., None]
    out = np.zeros((h, w, 4), np.uint8)
    out[..., :3] = np.round(c * 255).astype(np.uint8)
    out[..., 3] = np.round(alpha * 255).astype(np.uint8)
    return clean(out)


def quantize_alpha(a: np.ndarray, levels: int) -> np.ndarray:
    return np.round(np.clip(a, 0, 1) * (levels - 1)) / (levels - 1)


def ramp_lookup(v: np.ndarray, ramp: list, thresholds=None) -> np.ndarray:
    """Map scalar field v (0..1) onto a discrete colour ramp (list of RGB, dark->light)."""
    n = len(ramp)
    if thresholds is None:
        idx = np.clip((v * n).astype(int), 0, n - 1)
    else:
        idx = np.digitize(v, thresholds)
        idx = np.clip(idx, 0, n - 1)
    pal = np.array(ramp, dtype=np.uint8)
    return pal[idx]


# ------------------------------------------------------------------------ noise
def _fade(t):
    return t * t * t * (t * (t * 6 - 15) + 10)


def value_noise(w, h, cells_x, cells_y, seed=0, periodic=True):
    """Smooth value noise on a (h, w) grid with cells_x * cells_y lattice; tileable."""
    rng = np.random.default_rng(seed)
    lat = rng.random((cells_y + 1, cells_x + 1))
    if periodic:
        lat[-1, :] = lat[0, :]
        lat[:, -1] = lat[:, 0]
    ys = (np.arange(h) + 0.5) / h * cells_y
    xs = (np.arange(w) + 0.5) / w * cells_x
    yi = np.floor(ys).astype(int)
    xi = np.floor(xs).astype(int)
    yf = _fade(ys - yi)[:, None]
    xf = _fade(xs - xi)[None, :]
    a = lat[yi][:, xi]
    b = lat[yi][:, xi + 1]
    c = lat[yi + 1][:, xi]
    d = lat[yi + 1][:, xi + 1]
    top = a + (b - a) * xf
    bot = c + (d - c) * xf
    return top + (bot - top) * yf


def fbm(w, h, base_cells=4, octaves=4, seed=0, gain=0.5, aspect=1.0):
    total = np.zeros((h, w))
    amp = 1.0
    norm = 0.0
    for o in range(octaves):
        cx = max(1, int(round(base_cells * (2 ** o) * aspect)))
        cy = max(1, base_cells * (2 ** o))
        total += amp * value_noise(w, h, cx, cy, seed=seed + o * 101)
        norm += amp
        amp *= gain
    return total / norm


# ---------------------------------------------------------------------- geometry
def grid(w, h, cx=None, cy=None):
    """Return pixel-centre coordinate grids (x, y) relative to centre."""
    if cx is None:
        cx = w / 2
    if cy is None:
        cy = h / 2
    ys, xs = np.mgrid[0:h, 0:w].astype(float)
    return xs + 0.5 - cx, ys + 0.5 - cy


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def ss_mask(w, h, fn, ss=4):
    """Supersampled coverage mask. fn(x, y) -> bool array, coords in pixel units (0..w)."""
    ys, xs = np.mgrid[0:h * ss, 0:w * ss].astype(float)
    xs = (xs + 0.5) / ss
    ys = (ys + 0.5) / ss
    m = fn(xs, ys).astype(float)
    return m.reshape(h, ss, w, ss).mean(axis=(1, 3))


def poly_mask(w, h, pts, ss=4):
    im = Image.new("L", (w * ss, h * ss), 0)
    ImageDraw.Draw(im).polygon([(x * ss, y * ss) for x, y in pts], fill=255)
    a = np.asarray(im, dtype=float) / 255
    return a.reshape(h, ss, w, ss).mean(axis=(1, 3))


def hard(mask, thr=0.5):
    return (mask >= thr).astype(float)


def line_pixels(x0, y0, x1, y1):
    """Bresenham line, returns list of (x, y)."""
    pts = []
    dx = abs(x1 - x0)
    dy = -abs(y1 - y0)
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


# --------------------------------------------------------------- pixel painting
def put(img, x, y, color, alpha=255):
    h, w = img.shape[:2]
    if 0 <= x < w and 0 <= y < h:
        if color is None:
            img[y, x] = 0
        else:
            img[y, x, :3] = color[:3]
            img[y, x, 3] = color[3] if len(color) > 3 else alpha


def paint_ascii(img, x0, y0, rows, legend):
    """Paint ascii-art rows; legend maps char -> RGB/RGBA tuple or None (transparent).
    The char ' ' or '.' means 'leave unchanged'."""
    for j, row in enumerate(rows):
        for i, ch in enumerate(row):
            if ch in " .":
                continue
            put(img, x0 + i, y0 + j, legend[ch])


def outline(img, color, diagonal=False):
    """Add a 1px outline of `color` around opaque pixels (outside)."""
    a = img[..., 3] > 0
    grow = np.zeros_like(a)
    grow[1:, :] |= a[:-1, :]
    grow[:-1, :] |= a[1:, :]
    grow[:, 1:] |= a[:, :-1]
    grow[:, :-1] |= a[:, 1:]
    if diagonal:
        grow[1:, 1:] |= a[:-1, :-1]
        grow[:-1, :-1] |= a[1:, 1:]
        grow[1:, :-1] |= a[:-1, 1:]
        grow[:-1, 1:] |= a[1:, :-1]
    ring = grow & ~a
    out = img.copy()
    out[ring, :3] = color[:3]
    out[ring, 3] = 255 if len(color) < 4 else color[3]
    return out


def composite(dst, src):
    """Standard alpha-over of src onto dst (both uint8 RGBA, straight alpha)."""
    sa = src[..., 3:4].astype(float) / 255
    da = dst[..., 3:4].astype(float) / 255
    oa = sa + da * (1 - sa)
    oc = np.where(oa > 0, (src[..., :3] * sa + dst[..., :3] * da * (1 - sa)) / np.maximum(oa, 1e-6), 0)
    out = np.zeros_like(dst)
    out[..., :3] = np.round(oc).astype(np.uint8)
    out[..., 3] = np.round(oa[..., 0] * 255).astype(np.uint8)
    return out


def add_glow_float(rgbf, alpha, color, mask, radius, strength=1.0):
    """Blur `mask` with a cheap separable box blur (3 passes) and add as glow."""
    g = blur(mask, radius)
    rgbf += np.asarray(color)[None, None, :] * (g * strength)[..., None]
    alpha[:] = np.maximum(alpha, np.clip(g * strength, 0, 1))
    return rgbf, alpha


def blur(a, radius, wrap=False):
    """Approximate gaussian blur via 3 box blurs (numpy, edge clamp or wrap)."""
    r = int(max(1, round(radius)))
    out = a.astype(float)
    for _ in range(3):
        out = _box1d(out, r, 0, wrap)
        out = _box1d(out, r, 1, wrap)
    return out


def _box1d(a, r, axis, wrap):
    n = a.shape[axis]
    if wrap:
        pad = np.concatenate([np.take(a, range(n - r, n), axis=axis), a,
                              np.take(a, range(0, r + 1), axis=axis)], axis=axis)
    else:
        first = np.take(a, [0], axis=axis)
        last = np.take(a, [n - 1], axis=axis)
        pad = np.concatenate([np.repeat(first, r, axis=axis), a, np.repeat(last, r + 1, axis=axis)], axis=axis)
    c = np.cumsum(pad, axis=axis)
    hi = np.take(c, range(2 * r + 1, 2 * r + 1 + n), axis=axis)
    lo = np.take(c, range(0, n), axis=axis)
    return (hi - lo) / (2 * r + 1)


# ------------------------------------------------------------------- previews
def upscale(img, k=8):
    return np.repeat(np.repeat(img, k, axis=0), k, axis=1)


def checker(w, h, s=8, c1=(54, 54, 60), c2=(70, 70, 78)):
    ys, xs = np.mgrid[0:h, 0:w]
    m = ((xs // s + ys // s) % 2).astype(bool)
    out = np.zeros((h, w, 4), np.uint8)
    out[..., 3] = 255
    out[m, :3] = c1
    out[~m, :3] = c2
    return out


def on_bg(img, bg=None, k=8, s=8):
    big = upscale(img, k)
    if bg is None:
        bg = checker(big.shape[1], big.shape[0], s * 2)
    return composite(bg, big)


def contact_sheet(items, out_path, k=8, cols=6, pad=12, label_h=14, bg=(30, 30, 36), max_w=2000):
    """items: list of (label, rgba ndarray). Upscales each by k (or less if huge)."""
    from PIL import ImageFont
    tiles = []
    for label, img in items:
        kk = k
        while img.shape[1] * kk > max_w // max(1, min(cols, len(items))) * 2 and kk > 1:
            kk //= 2
        t = on_bg(img, k=kk)
        tiles.append((label, t))
    cols = min(cols, len(tiles))
    rows = math.ceil(len(tiles) / cols)
    cw = max(t.shape[1] for _, t in tiles) + pad
    ch = max(t.shape[0] for _, t in tiles) + pad + label_h
    sheet = Image.new("RGBA", (cols * cw + pad, rows * ch + pad), bg + (255,))
    d = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()
    for n, (label, t) in enumerate(tiles):
        x = pad + (n % cols) * cw
        y = pad + (n // cols) * ch
        sheet.paste(Image.fromarray(t, "RGBA"), (x, y + label_h))
        d.text((x, y), label, fill=(230, 230, 230, 255), font=font)
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out_path)
    return out_path
