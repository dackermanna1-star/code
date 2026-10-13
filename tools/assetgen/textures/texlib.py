"""Shared helpers for the CaliberCraft procedural texture generator.

Everything here is deterministic: callers pass an explicit seed / numpy Generator.
No external images are ever loaded - every pixel is computed.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

REPO_ROOT = Path(__file__).resolve().parents[3]
TEX_ROOT = REPO_ROOT / "src/main/resources/assets/calibercraft/textures"

# Every texture written in this run: rel path -> (w, h). Used for validation / contact sheet.
WRITTEN: dict[str, tuple[int, int]] = {}


# ---------------------------------------------------------------------------
# colour helpers
# ---------------------------------------------------------------------------

def hx(c: str, a: int = 255) -> tuple[int, int, int, int]:
    """'#rrggbb' -> (r, g, b, a)."""
    c = c.lstrip("#")
    return (int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16), a)


def rgbf(c: str) -> np.ndarray:
    return np.array(hx(c)[:3], dtype=np.float64)


def lerp(a, b, t):
    return a + (b - a) * t


def shade(col, f: float):
    """Multiply an RGB(A) tuple's colour by f (alpha kept)."""
    r, g, b = (max(0, min(255, int(round(v * f)))) for v in col[:3])
    return (r, g, b, col[3] if len(col) > 3 else 255)


def mix(c1, c2, t: float):
    return tuple(int(round(c1[i] + (c2[i] - c1[i]) * t)) for i in range(3)) + (255,)


# ---------------------------------------------------------------------------
# tileable (toroidal) noise
# ---------------------------------------------------------------------------

def rng(seed: int) -> np.random.Generator:
    return np.random.default_rng(seed)


def value_noise(h: int, w: int, cells_y: int, cells_x: int, g: np.random.Generator) -> np.ndarray:
    """Smooth value noise in [0,1] that wraps seamlessly on an h x w torus."""
    grid = g.random((cells_y, cells_x))
    ys = np.arange(h) * cells_y / h
    xs = np.arange(w) * cells_x / w
    y0 = np.floor(ys).astype(int)
    x0 = np.floor(xs).astype(int)
    fy = ys - y0
    fx = xs - x0
    sy = fy * fy * (3 - 2 * fy)
    sx = fx * fx * (3 - 2 * fx)
    y1 = (y0 + 1) % cells_y
    x1 = (x0 + 1) % cells_x
    y0 %= cells_y
    x0 %= cells_x
    a = grid[np.ix_(y0, x0)]
    b = grid[np.ix_(y0, x1)]
    c = grid[np.ix_(y1, x0)]
    d = grid[np.ix_(y1, x1)]
    top = a + (b - a) * sx[None, :]
    bot = c + (d - c) * sx[None, :]
    return top + (bot - top) * sy[:, None]


def fbm(h: int, w: int, g: np.random.Generator, cells: int = 2, octaves: int = 4,
        persistence: float = 0.5, stretch_x: float = 1.0, stretch_y: float = 1.0) -> np.ndarray:
    """Fractal tileable noise normalised to [0,1].

    stretch_* < 1 lowers the frequency along that axis (e.g. stretch_x=0.25 -> features long in x).
    Cell counts are kept integer so the result always tiles.
    """
    total = np.zeros((h, w))
    amp = 1.0
    norm = 0.0
    c = cells
    for _ in range(octaves):
        cy = max(1, min(h, int(round(c * stretch_y))))
        cx = max(1, min(w, int(round(c * stretch_x))))
        total += amp * value_noise(h, w, cy, cx, g)
        norm += amp
        amp *= persistence
        c *= 2
    total /= norm
    return normalize(total)


def normalize(a: np.ndarray) -> np.ndarray:
    lo, hi = float(a.min()), float(a.max())
    if hi - lo < 1e-9:
        return np.zeros_like(a)
    return (a - lo) / (hi - lo)


def blur_wrap(a: np.ndarray, sigma: float, sigma_x: float | None = None) -> np.ndarray:
    """Gaussian blur on a torus (FFT), optionally anisotropic."""
    sx = sigma if sigma_x is None else sigma_x
    h, w = a.shape
    ky = np.fft.fftfreq(h)[:, None]
    kx = np.fft.fftfreq(w)[None, :]
    filt = np.exp(-2 * (np.pi ** 2) * ((sigma ** 2) * ky ** 2 + (sx ** 2) * kx ** 2))
    return np.real(np.fft.ifft2(np.fft.fft2(a) * filt))


def torus_dist(h: int, w: int, cy: float, cx: float) -> np.ndarray:
    ys = np.arange(h)[:, None] + 0.5
    xs = np.arange(w)[None, :] + 0.5
    dy = np.abs(ys - cy)
    dx = np.abs(xs - cx)
    dy = np.minimum(dy, h - dy)
    dx = np.minimum(dx, w - dx)
    return np.sqrt(dy * dy + dx * dx)


def wrap_line(mask: np.ndarray, x0: int, y0: int, x1: int, y1: int, value=1.0):
    """Bresenham line drawn on a torus (coordinates wrap)."""
    h, w = mask.shape[:2]
    dx = abs(x1 - x0)
    dy = -abs(y1 - y0)
    sx = 1 if x0 < x1 else -1
    sy = 1 if y0 < y1 else -1
    err = dx + dy
    x, y = x0, y0
    pts = []
    while True:
        mask[y % h, x % w] = value
        pts.append((x % w, y % h))
        if x == x1 and y == y1:
            break
        e2 = 2 * err
        if e2 >= dy:
            err += dy
            x += sx
        if e2 <= dx:
            err += dx
            y += sy
    return pts


def wrap_polyline(mask: np.ndarray, pts, value=1.0):
    out = []
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        out += wrap_line(mask, x0, y0, x1, y1, value)
    return out


def palette_map(field: np.ndarray, colors) -> np.ndarray:
    """Quantise a [0,1] field onto a dark->light palette list ('#hex' strings). Returns HxWx3 uint8."""
    pal = np.array([hx(c)[:3] for c in colors], dtype=np.uint8)
    n = len(colors)
    idx = np.clip(np.rint(np.clip(field, 0, 1) * (n - 1)), 0, n - 1).astype(int)
    return pal[idx]


def ramp(field: np.ndarray, stops) -> np.ndarray:
    """Continuous gradient. stops: list of (pos, '#hex' or (r,g,b[,a])). Returns HxWxC float."""
    pos = np.array([s[0] for s in stops], dtype=np.float64)
    cols = []
    for s in stops:
        c = s[1]
        if isinstance(c, str):
            c = hx(c)
        if len(c) == 3:
            c = tuple(c) + (255,)
        cols.append(c)
    cols = np.array(cols, dtype=np.float64)
    f = np.clip(field, pos[0], pos[-1])
    out = np.zeros(field.shape + (4,))
    for ch in range(4):
        out[..., ch] = np.interp(f, pos, cols[:, ch])
    return out


def to_rgba(rgb: np.ndarray, alpha: np.ndarray | None = None) -> np.ndarray:
    rgb = np.clip(np.rint(rgb), 0, 255).astype(np.uint8)
    h, w = rgb.shape[:2]
    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[..., :3] = rgb[..., :3]
    if alpha is None:
        out[..., 3] = 255 if rgb.shape[2] == 3 else rgb[..., 3]
    else:
        out[..., 3] = np.clip(np.rint(alpha), 0, 255).astype(np.uint8)
    return out


# ---------------------------------------------------------------------------
# pixel-art helpers
# ---------------------------------------------------------------------------

def grid_sprite(rows, palette: dict) -> np.ndarray:
    """Build RGBA from a list of equal-length strings. '.' or ' ' = transparent."""
    h = len(rows)
    w = max(len(r) for r in rows)
    arr = np.zeros((h, w, 4), dtype=np.uint8)
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch in ". ":
                continue
            if ch not in palette:
                raise KeyError(f"palette missing {ch!r} in row {y}: {row}")
            col = palette[ch]
            if isinstance(col, str):
                col = hx(col)
            arr[y, x] = col
    return arr


def outline(arr: np.ndarray, color=None, diagonal: bool = False, darken: float = 0.32,
            pad: int = 0) -> np.ndarray:
    """Add a 1px outline around opaque pixels.

    color=None -> each outline pixel is a heavily darkened average of its opaque neighbours
    (the modern vanilla look, outline tinted by the material it surrounds).
    pad -> grow the canvas by this many pixels on every side first.
    """
    a = arr.copy()
    if pad:
        a = np.pad(a, ((pad, pad), (pad, pad), (0, 0)))
    h, w = a.shape[:2]
    mask = a[..., 3] > 0
    offs = [(-1, 0), (1, 0), (0, -1), (0, 1)]
    if diagonal:
        offs += [(-1, -1), (-1, 1), (1, -1), (1, 1)]
    acc = np.zeros((h, w, 3))
    cnt = np.zeros((h, w))
    for dy, dx in offs:
        sh = np.zeros_like(mask)
        src = np.zeros((h, w, 3))
        ys = slice(max(0, dy), h + min(0, dy))
        yd = slice(max(0, -dy), h + min(0, -dy))
        xs = slice(max(0, dx), w + min(0, dx))
        xd = slice(max(0, -dx), w + min(0, -dx))
        sh[yd, xd] = mask[ys, xs]
        src[yd, xd] = a[ys, xs, :3]
        acc += src * sh[..., None]
        cnt += sh
    ring = (cnt > 0) & ~mask
    if color is None:
        col = acc[ring] / cnt[ring][:, None] * darken
        a[ring, :3] = np.clip(np.rint(col), 0, 255).astype(np.uint8)
        a[ring, 3] = 255
    else:
        if isinstance(color, str):
            color = hx(color)
        a[ring] = color
    return a


def paste(dst: np.ndarray, src: np.ndarray, x: int, y: int):
    """Alpha-over paste of src at (x, y) (pixel-art friendly: opaque pixels replace)."""
    h, w = src.shape[:2]
    H, W = dst.shape[:2]
    for yy in range(h):
        ty = y + yy
        if not 0 <= ty < H:
            continue
        for xx in range(w):
            tx = x + xx
            if not 0 <= tx < W:
                continue
            s = src[yy, xx]
            if s[3] == 0:
                continue
            if s[3] == 255:
                dst[ty, tx] = s
            else:
                sa = s[3] / 255.0
                da = dst[ty, tx, 3] / 255.0
                oa = sa + da * (1 - sa)
                if oa <= 0:
                    continue
                rgb = (s[:3] * sa + dst[ty, tx, :3] * da * (1 - sa)) / oa
                dst[ty, tx, :3] = np.clip(np.rint(rgb), 0, 255)
                dst[ty, tx, 3] = int(round(oa * 255))


class Canvas:
    """Tiny boolean-mask canvas used to compose pixel icons from primitives."""

    def __init__(self, w: int, h: int):
        self.w, self.h = w, h
        self.img = Image.new("L", (w, h), 0)
        self.d = ImageDraw.Draw(self.img)

    def rect(self, x0, y0, x1, y1, v=255):
        self.d.rectangle([x0, y0, x1, y1], fill=v)
        return self

    def poly(self, pts, v=255):
        self.d.polygon(pts, fill=v)
        return self

    def line(self, pts, v=255, width=1):
        self.d.line(pts, fill=v, width=width)
        return self

    def ellipse(self, x0, y0, x1, y1, v=255):
        self.d.ellipse([x0, y0, x1, y1], fill=v)
        return self

    def px(self, x, y, v=255):
        self.d.point((x, y), fill=v)
        return self

    @property
    def mask(self) -> np.ndarray:
        return np.array(self.img) > 127


def bevel_fill(mask: np.ndarray, base, hi, lo, hi2=None, lo2=None) -> np.ndarray:
    """Fill a mask with base colour, lighting pixels on the top/left edge and shading the bottom/right."""
    h, w = mask.shape
    out = np.zeros((h, w, 4), dtype=np.uint8)

    def c(v):
        return np.array(hx(v) if isinstance(v, str) else v, dtype=np.uint8)

    out[mask] = c(base)

    def nb(dy, dx):
        sh = np.zeros_like(mask)
        ys = slice(max(0, dy), h + min(0, dy))
        yd = slice(max(0, -dy), h + min(0, -dy))
        xs = slice(max(0, dx), w + min(0, dx))
        xd = slice(max(0, -dx), w + min(0, -dx))
        sh[yd, xd] = mask[ys, xs]
        return sh

    up, left, down, right = nb(-1, 0), nb(0, -1), nb(1, 0), nb(0, 1)
    lo_m = mask & (~down | ~right)
    hi_m = mask & (~up | ~left) & ~lo_m
    out[lo_m] = c(lo)
    out[hi_m] = c(hi)
    if lo2 is not None:
        lo2_m = mask & ~down & ~right
        out[lo2_m] = c(lo2)
    if hi2 is not None:
        hi2_m = mask & ~up & ~left
        out[hi2_m] = c(hi2)
    return out


def layer(dst: np.ndarray, src: np.ndarray):
    """Opaque-over composite of RGBA arrays of the same size."""
    m = src[..., 3] > 0
    dst[m] = src[m]
    return dst


def scale_nearest(arr: np.ndarray, k: int) -> np.ndarray:
    return arr.repeat(k, axis=0).repeat(k, axis=1)


def supersample(fn, w: int, h: int, ss: int = 4) -> np.ndarray:
    """Evaluate fn(xs, ys) (float pixel-centre coordinates) at ss x ss subsamples per pixel and box-filter.

    fn must return an (H, W, 4) float array of *premultiplied-friendly* RGBA in 0..255 (alpha straight).
    """
    ys = (np.arange(h * ss) + 0.5) / ss
    xs = (np.arange(w * ss) + 0.5) / ss
    X, Y = np.meshgrid(xs, ys)
    rgba = fn(X, Y)
    a = rgba[..., 3:4] / 255.0
    pre = rgba[..., :3] * a
    pre = pre.reshape(h, ss, w, ss, 3).mean(axis=(1, 3))
    al = a.reshape(h, ss, w, ss, 1).mean(axis=(1, 3))
    rgb = np.where(al > 1e-6, pre / np.maximum(al, 1e-6), 0)
    out = np.concatenate([rgb, al * 255], axis=2)
    return out


# ---------------------------------------------------------------------------
# output
# ---------------------------------------------------------------------------

def save(rel: str, arr, size: tuple[int, int] | None = None):
    """Save texture at textures/<rel>.png; asserts exact size."""
    if isinstance(arr, Image.Image):
        img = arr
    else:
        a = np.asarray(arr)
        if a.dtype != np.uint8:
            a = np.clip(np.rint(a), 0, 255).astype(np.uint8)
        if a.ndim == 2:
            img = Image.fromarray(a, "L").convert("RGBA")
        elif a.shape[2] == 3:
            img = Image.fromarray(a, "RGB").convert("RGBA")
        else:
            img = Image.fromarray(a, "RGBA")
    if img.mode != "RGBA":
        img = img.convert("RGBA")
    if size is not None and img.size != tuple(size):
        raise ValueError(f"{rel}: expected {size}, got {img.size}")
    path = TEX_ROOT / f"{rel}.png"
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, optimize=True)
    WRITTEN[rel] = img.size
    return path


def save_mcmeta(rel: str, data: dict):
    path = TEX_ROOT / f"{rel}.png.mcmeta"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2) + "\n")
    return path


def frames_to_strip(frames) -> np.ndarray:
    return np.concatenate(frames, axis=0)


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


TAU = 2 * math.pi
