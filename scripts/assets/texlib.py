"""Image helpers for the texture pipeline (numpy + Pillow only).

Conventions
-----------
* Arrays are float32. Colour arrays are HxWx3 in [0, 1].
* Normal maps are stored OpenGL style (+X right, +Y up = towards the top of the
  image, +Z out of the surface); encoded as rgb = n * 0.5 + 0.5.
* Everything that filters is periodic (wraps around), so seamless inputs stay
  seamless.
"""
import numpy as np
from PIL import Image

# --------------------------------------------------------------------------- io


def load_rgb(path):
    im = Image.open(path)
    im.draft("RGB", im.size)
    return np.asarray(im.convert("RGB"), dtype=np.float32) / 255.0


def load_gray(path):
    im = Image.open(path)
    if im.mode in ("I;16", "I;16B", "I"):
        a = np.asarray(im, dtype=np.float32)
        return a / (65535.0 if a.max() > 255 else 255.0)
    return np.asarray(im.convert("L"), dtype=np.float32) / 255.0


def save_rgb(path, rgb, quality=90):
    a = np.clip(np.round(rgb * 255.0), 0, 255).astype(np.uint8)
    # 4:4:4 chroma: subsampling would wreck normal-map X/Y and small colour detail
    Image.fromarray(a, "RGB").save(path, "JPEG", quality=quality, subsampling=0, optimize=True)


def save_gray(path, g, quality=90):
    a = np.clip(np.round(g * 255.0), 0, 255).astype(np.uint8)
    Image.fromarray(a, "L").save(path, "JPEG", quality=quality, optimize=True)


# ------------------------------------------------------------------ colour space


def srgb_to_linear(c):
    c = np.clip(c, 0.0, 1.0)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4).astype(np.float32)


def linear_to_srgb(c):
    c = np.clip(c, 0.0, 1.0)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055).astype(np.float32)


def luminance(lin):
    return lin[..., 0] * 0.2126 + lin[..., 1] * 0.7152 + lin[..., 2] * 0.0722


# ------------------------------------------------------------- geometry / tiling


def tile_near_square(a):
    """Repeat a seamless texture along its short side so its aspect is as close to 1:1
    as possible (the remaining anisotropy is removed by the resize)."""
    h, w = a.shape[:2]
    if h == w:
        return a
    if w > h:
        n = max(1, int(round(w / h)))
        return np.concatenate([a] * n, axis=0) if n > 1 else a
    n = max(1, int(round(h / w)))
    return np.concatenate([a] * n, axis=1) if n > 1 else a


def rot90_rgb(a, k):
    return np.ascontiguousarray(np.rot90(a, k)) if k % 4 else a


def rot90_normal(n, k):
    """Rotate a decoded normal field (HxWx3, GL convention) by k*90deg CCW,
    rotating the tangent-space vectors together with the pixels."""
    k %= 4
    if not k:
        return n
    out = np.ascontiguousarray(np.rot90(n, k)).copy()
    x, y = out[..., 0].copy(), out[..., 1].copy()
    for _ in range(k):  # CCW 90: (x, y) -> (-y, x)
        x, y = -y, x
    out[..., 0], out[..., 1] = x, y
    return out


def resize_wrap(a, size):
    """Lanczos-resize a periodic 2D float array (any aspect) to size x size without
    edge seams: pad by whole periods-compatible amounts, resize, crop."""
    import math
    h, w = a.shape
    if h == size and w == size:
        return a.astype(np.float32)

    def pads(n):
        g = math.gcd(n, size)
        k_src, k_dst = n // g, size // g
        m = max(1, math.ceil(12 / k_dst))
        return k_src * m, k_dst * m

    psx, pdx = pads(w)
    psy, pdy = pads(h)
    p = np.pad(a, ((psy, psy), (psx, psx)), mode="wrap").astype(np.float32)
    r = np.asarray(Image.fromarray(p, "F").resize((size + 2 * pdx, size + 2 * pdy), Image.LANCZOS),
                   dtype=np.float32)
    return r[pdy:pdy + size, pdx:pdx + size]


def resize_rgb_linear(srgb, size):
    """Downscale an sRGB image in linear light (keeps fine-detail brightness)."""
    lin = srgb_to_linear(srgb)
    out = np.stack([resize_wrap(lin[..., i], size) for i in range(3)], -1)
    return linear_to_srgb(np.clip(out, 0, 1))


def decode_normal(rgb, directx=False):
    n = rgb * 2.0 - 1.0
    if directx:
        n[..., 1] *= -1.0  # DirectX (+Y down) -> OpenGL (+Y up)
    return normalize(n)


def encode_normal(n):
    return np.clip(n * 0.5 + 0.5, 0, 1)


def normalize(n):
    l = np.sqrt(np.sum(n * n, axis=-1, keepdims=True))
    return (n / np.maximum(l, 1e-6)).astype(np.float32)


def resize_normal(n, size):
    h, w = n.shape[:2]
    out = np.stack([resize_wrap(n[..., i], size) for i in range(3)], -1)
    # anisotropic resampling changes slopes: x stretched by h/w relative to y
    if h != w:
        out[..., 0] *= w / h
    out[..., 2] = np.maximum(out[..., 2], 1e-3)
    return normalize(out)


def normal_strength(n, s):
    if s == 1.0:
        return n
    m = n.copy()
    m[..., 0] *= s
    m[..., 1] *= s
    m[..., 2] = np.maximum(m[..., 2], 1e-3)
    return normalize(m)


def height_to_normal(h, strength=1.0):
    """Periodic central differences -> GL normal. strength = slope multiplier in
    'height units per pixel' (h is usually 0..1)."""
    dx = (np.roll(h, -1, axis=1) - np.roll(h, 1, axis=1)) * 0.5
    dy_up = (np.roll(h, 1, axis=0) - np.roll(h, -1, axis=0)) * 0.5
    n = np.stack([-dx * strength, -dy_up * strength, np.ones_like(h)], -1)
    return normalize(n)


def combine_normals(a, b):
    """Whiteout blend of two GL normal fields."""
    n = np.stack([a[..., 0] + b[..., 0], a[..., 1] + b[..., 1], a[..., 2] * b[..., 2]], -1)
    return normalize(n)


# ---------------------------------------------------------------- periodic filters


def _freq(size):
    f = np.fft.fftfreq(size).astype(np.float32)
    return f[None, :], f[:, None]  # fx (columns), fy (rows)


def blur_wrap(a, sigma):
    """Periodic Gaussian blur (sigma in px) of a 2D array via FFT."""
    if sigma <= 0:
        return a
    h, w = a.shape
    fx = np.fft.fftfreq(w)[None, :]
    fy = np.fft.fftfreq(h)[:, None]
    g = np.exp(-2 * (np.pi * sigma) ** 2 * (fx ** 2 + fy ** 2))
    return np.real(np.fft.ifft2(np.fft.fft2(a) * g)).astype(np.float32)


def flatten_lowfreq(lin_rgb, sigma, strength):
    """Remove large-scale brightness blotches (they make tiling obvious).
    strength 0 = untouched, 1 = fully flattened luminance at scale > sigma."""
    if strength <= 0:
        return lin_rgb
    L = np.maximum(luminance(lin_rgb), 1e-4)
    B = np.maximum(blur_wrap(L, sigma), 1e-4)
    factor = (B.mean() / B) ** strength
    return np.clip(lin_rgb * factor[..., None], 0, 1)


def flatten_gray(g, sigma, strength):
    if strength <= 0:
        return g
    B = blur_wrap(g, sigma)
    return g - (B - B.mean()) * strength


def desaturate(lin_rgb, amount):
    if amount <= 0:
        return lin_rgb
    L = luminance(lin_rgb)[..., None]
    return lin_rgb * (1 - amount) + L * amount


def set_mean_luma(lin_rgb, target):
    m = float(luminance(lin_rgb).mean())
    return np.clip(lin_rgb * (target / max(m, 1e-5)), 0, 1)


def tint_to(lin_rgb, rgb_lin_target):
    """Move the mean colour to rgb_lin_target while keeping per-pixel variation."""
    mean = lin_rgb.reshape(-1, 3).mean(0)
    return np.clip(lin_rgb * (np.asarray(rgb_lin_target, np.float32) / np.maximum(mean, 1e-5)), 0, 1)


def contrast_luma(lin_rgb, k):
    """Scale luminance deviation around its mean by k (in linear light)."""
    if k == 1.0:
        return lin_rgb
    L = np.maximum(luminance(lin_rgb), 1e-5)
    m = L.mean()
    L2 = np.maximum(m + (L - m) * k, 1e-5)
    return np.clip(lin_rgb * (L2 / L)[..., None], 0, 1)


def remap(g, lo, hi):
    """Linearly remap g so its 1st..99th percentile spans lo..hi."""
    a, b = np.percentile(g, [1, 99])
    if b - a < 1e-4:
        return np.full_like(g, (lo + hi) / 2)
    return np.clip(lo + (g - a) / (b - a) * (hi - lo), 0, 1)


# ----------------------------------------------------------------- periodic noise


def spectral_noise(size, beta=2.0, seed=0, aniso=(1.0, 1.0), fmin=0.0, fmax=0.5):
    """Tileable 1/f^beta noise, zero mean, unit std.
    aniso=(ax, ay): ax > ay stretches features along X (U), i.e. streaks along U."""
    rng = np.random.default_rng(seed)
    wn = rng.standard_normal((size, size)).astype(np.float32)
    fx = np.fft.fftfreq(size)[None, :] * aniso[0]
    fy = np.fft.fftfreq(size)[:, None] * aniso[1]
    f = np.sqrt(fx ** 2 + fy ** 2)
    f[0, 0] = 1.0
    amp = 1.0 / np.power(f, beta / 2.0)
    raw_f = np.sqrt((np.fft.fftfreq(size)[None, :]) ** 2 + (np.fft.fftfreq(size)[:, None]) ** 2)
    amp[(raw_f < fmin) | (raw_f > fmax)] = 0
    amp[0, 0] = 0
    out = np.real(np.fft.ifft2(np.fft.fft2(wn) * amp)).astype(np.float32)
    s = out.std()
    return out / s if s > 0 else out


def worley(size, n_points, seed=0, jitter=1.0):
    """Tileable Worley (cellular) noise: returns (F1, F2) distances in px."""
    rng = np.random.default_rng(seed)
    g = int(np.ceil(np.sqrt(n_points)))
    cell = size / g
    pts = []
    for gy in range(g):
        for gx in range(g):
            pts.append(((gx + 0.5 + (rng.random() - 0.5) * jitter) * cell,
                        (gy + 0.5 + (rng.random() - 0.5) * jitter) * cell))
    pts = np.array(pts, np.float32)
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    f1 = np.full((size, size), 1e9, np.float32)
    f2 = np.full((size, size), 1e9, np.float32)
    for px, py in pts:
        dx = np.abs(xx - px)
        dx = np.minimum(dx, size - dx)
        dy = np.abs(yy - py)
        dy = np.minimum(dy, size - dy)
        d = np.sqrt(dx * dx + dy * dy)
        f2 = np.where(d < f1, f1, np.minimum(f2, d))
        f1 = np.minimum(f1, d)
    return f1, f2


def norm01(a):
    lo, hi = float(a.min()), float(a.max())
    return (a - lo) / (hi - lo) if hi > lo else np.zeros_like(a)


def fix_seams(a, band=24, sigma=6.0):
    """Remove the low-frequency part of any wrap-around discontinuity by spreading a
    smooth correction ramp over `band` px on both sides of each edge. Works on HxW or
    HxWxC arrays; leaves already-seamless images (almost) untouched."""
    a = a.astype(np.float32).copy()
    squeeze = a.ndim == 2
    if squeeze:
        a = a[..., None]
    h, w, c = a.shape
    x = np.arange(w, dtype=np.float32)
    wl = np.clip(1 - x / band, 0, 1)
    wr = np.clip(1 - (w - 1 - x) / band, 0, 1)
    y = np.arange(h, dtype=np.float32)
    wt = np.clip(1 - y / band, 0, 1)
    wb = np.clip(1 - (h - 1 - y) / band, 0, 1)

    def smooth1d(v):
        f = np.fft.fftfreq(v.shape[0])
        g = np.exp(-2 * (np.pi * sigma) ** 2 * f ** 2)
        return np.real(np.fft.ifft(np.fft.fft(v, axis=0) * g[:, None], axis=0))

    for _ in range(2):
        d = smooth1d(a[:, 0, :] - a[:, -1, :])          # (h, c) jump across the left/right edge
        a -= (d[:, None, :] / 2) * wl[None, :, None]
        a += (d[:, None, :] / 2) * wr[None, :, None]
        d = smooth1d(a[0, :, :] - a[-1, :, :])          # (w, c) jump across the top/bottom edge
        a -= (d[None, :, :] / 2) * wt[:, None, None]
        a += (d[None, :, :] / 2) * wb[:, None, None]
    return a[..., 0] if squeeze else a


def seam_score(a):
    """Ratio of wrap-edge discontinuity to typical neighbour difference (~1 = seamless)."""
    a = a.astype(np.float32)
    if a.ndim == 3:
        a = a.mean(-1)
    inner_x = np.abs(np.diff(a, axis=1)).mean()
    inner_y = np.abs(np.diff(a, axis=0)).mean()
    edge_x = np.abs(a[:, 0] - a[:, -1]).mean()
    edge_y = np.abs(a[0, :] - a[-1, :]).mean()
    return max(edge_x / max(inner_x, 1e-6), edge_y / max(inner_y, 1e-6))
