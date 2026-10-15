"""Shared numpy/Pillow helpers for texture processing (seam-preserving resize, normal handling, JPEG output)."""
import math
import numpy as np
from PIL import Image, ImageFile

Image.MAX_IMAGE_PIXELS = None
ImageFile.MAXBLOCK = 1 << 26  # progressive+optimize JPEG needs the whole image in one block


def load(path):
    """Load an image as float32 HxWxC in 0..1 (handles 8/16-bit PNG and JPEG)."""
    im = Image.open(path)
    if im.mode in ('I;16', 'I;16B', 'I;16L', 'I'):
        a = np.asarray(im, dtype=np.float32)
        a = a / (65535.0 if a.max() > 255 else 255.0)
        return a[..., None]
    if im.mode == 'F':
        return np.asarray(im, dtype=np.float32)[..., None]
    if im.mode == 'P':
        im = im.convert('RGBA')
    if im.mode not in ('L', 'RGB', 'RGBA', 'LA'):
        im = im.convert('RGB')
    a = np.asarray(im)
    if a.dtype == np.uint16:
        a = a.astype(np.float32) / 65535.0
    else:
        a = a.astype(np.float32) / 255.0
    if a.ndim == 2:
        a = a[..., None]
    return a


def load_gray(path):
    """Single channel (first channel of grey maps stored as RGB)."""
    return load(path)[..., :1]


def _resize_plane(p, w, h, resample):
    return np.asarray(Image.fromarray(p.astype(np.float32), 'F').resize((w, h), resample), dtype=np.float32)


def resize(a, size, resample=Image.LANCZOS, wrap=True):
    """Resize HxWxC float array to `size` (int or (w,h)) keeping tileability.

    Integer down-factors with BOX are exact block means; otherwise the image is wrap-padded before filtering
    so the kernel sees the opposite edge, then the padding is cropped."""
    H, W, C = a.shape
    tw, th = (size, size) if isinstance(size, int) else size
    if (W, H) == (tw, th):
        return a.copy()
    fx, fy = W / tw, H / th
    if resample == Image.BOX and fx == int(fx) and fy == int(fy):
        fx, fy = int(fx), int(fy)
        return a.reshape(th, fy, tw, fx, C).mean(axis=(1, 3))
    if not wrap:
        return np.stack([_resize_plane(a[..., c], tw, th, resample) for c in range(C)], -1)
    # pad by whole output pixels so the crop is exact
    po = 8
    px, py = int(round(po * fx)), int(round(po * fy))
    ap = np.pad(a, ((py, py), (px, px), (0, 0)), mode='wrap')
    out = np.stack([_resize_plane(ap[..., c], tw + 2 * po, th + 2 * po, resample) for c in range(C)], -1)
    return out[po:po + th, po:po + tw]


def normal_decode(a):
    n = a[..., :3] * 2.0 - 1.0
    return n


def normal_encode(n):
    n = n / np.maximum(np.linalg.norm(n, axis=-1, keepdims=True), 1e-6)
    n[..., 2] = np.maximum(n[..., 2], 0.0)
    n = n / np.maximum(np.linalg.norm(n, axis=-1, keepdims=True), 1e-6)
    return n * 0.5 + 0.5


def resize_normal(a, size):
    n = normal_decode(a)
    H = a.shape[0]
    tw = size if isinstance(size, int) else size[0]
    if a.shape[1] % tw == 0 and H % (size if isinstance(size, int) else size[1]) == 0:
        n = resize(n, size, Image.BOX)
    else:
        n = resize(n, size, Image.LANCZOS)
    return normal_encode(n)


def normal_from_height(h, strength):
    """Tangent-space OpenGL normal (+Y up = +V) from a periodic height field in 0..1. strength: px-scale slope gain."""
    h = h[..., 0] if h.ndim == 3 else h
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5 * strength
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5 * strength
    # image row index grows downward = -V, so +V slope is -dy
    n = np.stack([-dx, dy, np.ones_like(h)], -1)
    return normal_encode(n)


def gauss_blur_periodic(x, sigma):
    """Periodic Gaussian blur via FFT (2D, single channel)."""
    H, W = x.shape
    fy = np.fft.fftfreq(H)[:, None]
    fx = np.fft.fftfreq(W)[None, :]
    g = np.exp(-2 * (math.pi ** 2) * (sigma ** 2) * (fx ** 2 + fy ** 2))
    return np.real(np.fft.ifft2(np.fft.fft2(x) * g)).astype(np.float32)


def cavity_ao(h, strength=1.0):
    """Cheap tileable AO from height: how far a point sits below its blurred neighbourhood (multi-scale)."""
    h = h[..., 0] if h.ndim == 3 else h
    lo, hi = np.percentile(h, [1, 99])
    hn = np.clip((h - lo) / max(hi - lo, 1e-4), 0, 1)
    S = h.shape[0] / 1024.0
    occ = np.zeros_like(hn)
    for sig, w in [(2 * S, 0.5), (8 * S, 0.35), (24 * S, 0.15)]:
        occ += w * np.maximum(gauss_blur_periodic(hn, sig) - hn, 0)
    ao = 1.0 - np.clip(occ * 3.0 * strength, 0, 0.85)
    return ao[..., None].astype(np.float32)


def to_u8(a):
    return (np.clip(a, 0, 1) * 255.0 + 0.5).astype(np.uint8)


def save_jpg(a, path, quality=88, subsampling=2):
    a = to_u8(a)
    if a.ndim == 3 and a.shape[2] == 1:
        a = a[..., 0]
    im = Image.fromarray(a)
    im.save(path, 'JPEG', quality=quality, subsampling=subsampling if im.mode == 'RGB' else 0,
            optimize=True, progressive=True)


def save_png(a, path):
    a = to_u8(a)
    if a.ndim == 3 and a.shape[2] == 1:
        a = a[..., 0]
    Image.fromarray(a).save(path, 'PNG', optimize=True)


def rgb_to_hsv_adjust(rgb, sat=1.0, gain=1.0, gamma=1.0, hue_shift_deg=0.0, tint=None):
    """Simple sRGB-space albedo tweak: saturation scale around luma, gain, gamma, hue rotation, tint multiply."""
    a = rgb.copy()
    if hue_shift_deg:
        th = math.radians(hue_shift_deg)
        c, s = math.cos(th), math.sin(th)
        k = 1 / 3.0
        sq = math.sqrt(k)
        m = np.array([[c + (1 - c) * k, k * (1 - c) - sq * s, k * (1 - c) + sq * s],
                      [k * (1 - c) + sq * s, c + k * (1 - c), k * (1 - c) - sq * s],
                      [k * (1 - c) - sq * s, k * (1 - c) + sq * s, c + k * (1 - c)]], np.float32)
        a = a @ m.T
    if sat != 1.0:
        y = (a * np.array([0.2126, 0.7152, 0.0722], np.float32)).sum(-1, keepdims=True)
        a = y + (a - y) * sat
    if gamma != 1.0:
        a = np.clip(a, 0, 1) ** gamma
    a = a * gain
    if tint is not None:
        a = a * np.array(tint, np.float32)
    return np.clip(a, 0, 1)


def edge_seam_error(a):
    """Mean abs difference across the wrap seam vs. typical neighbour difference (≈1.0 means seamless)."""
    a = a.astype(np.float32)
    inner = np.abs(a[:, 1:] - a[:, :-1]).mean() + np.abs(a[1:] - a[:-1]).mean()
    seam = np.abs(a[:, 0] - a[:, -1]).mean() + np.abs(a[0] - a[-1]).mean()
    return float(seam / max(inner, 1e-6))
