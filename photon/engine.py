"""Image engine for Photon: layers, blend modes, brushes, shapes and filters.

Layers hold straight (non-premultiplied) RGBA float32 arrays in 0..1.
Everything here is independent of the GUI so it can also be scripted.
"""

import math

import numpy as np
from PIL import Image, ImageDraw

BLEND_MODES = ["normal", "multiply", "screen", "overlay", "soft light", "add"]
SUPERSAMPLE = 4


def hex_rgb(c):
    """'#rrggbb' or (r, g, b) in 0..255 -> float array of 3."""
    if isinstance(c, str):
        c = c.lstrip("#")
        c = tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))
    return np.array(c[:3], dtype=np.float32) / 255.0


class Layer:
    def __init__(self, w, h, name="Layer", mode="normal", opacity=1.0, clip=False):
        self.name = name
        self.mode = mode
        self.opacity = opacity
        self.clip = clip  # clip to the nearest unclipped layer below
        self.visible = True
        self.px = np.zeros((h, w, 4), dtype=np.float32)

    # ---- painting primitives -------------------------------------------------

    def paint(self, color, mask, opacity=1.0, lock_alpha=False):
        """Paint `color` (rgb or HxWx3 array) through a 0..1 coverage mask."""
        a = np.clip(mask, 0, 1)[..., None] * opacity
        rgb = color if isinstance(color, np.ndarray) and color.ndim == 3 else hex_rgb(color)
        if lock_alpha:
            self.px[..., :3] = self.px[..., :3] * (1 - a) + rgb * a
            return
        src_a = a
        dst_a = self.px[..., 3:4]
        out_a = src_a + dst_a * (1 - src_a)
        safe = np.where(out_a > 1e-6, out_a, 1)
        self.px[..., :3] = (rgb * src_a + self.px[..., :3] * dst_a * (1 - src_a)) / safe
        self.px[..., 3:4] = out_a

    def erase(self, mask, opacity=1.0):
        self.px[..., 3] *= 1 - np.clip(mask, 0, 1) * opacity

    def blur(self, radius):
        if radius <= 0:
            return
        # blur premultiplied colour so transparent edges do not go dark
        a = self.px[..., 3:4]
        pre = np.concatenate([self.px[..., :3] * a, a], axis=2)
        out = np.stack([_blur_channel(pre[..., i], radius) for i in range(4)], axis=2)
        alpha = out[..., 3:4]
        self.px[..., :3] = np.where(alpha > 1e-5, out[..., :3] / np.maximum(alpha, 1e-5), 0)
        self.px[..., 3:4] = alpha

    def adjust(self, hue=0.0, saturation=1.0, brightness=1.0):
        """Shift hue (degrees), scale saturation and brightness."""
        img = Image.fromarray((np.clip(self.px[..., :3], 0, 1) * 255).astype(np.uint8)).convert("HSV")
        hsv = np.asarray(img).astype(np.float32)
        hsv[..., 0] = (hsv[..., 0] + hue / 360 * 255) % 255
        hsv[..., 1] = np.clip(hsv[..., 1] * saturation, 0, 255)
        hsv[..., 2] = np.clip(hsv[..., 2] * brightness, 0, 255)
        rgb = Image.fromarray(hsv.astype(np.uint8), "HSV").convert("RGB")
        self.px[..., :3] = np.asarray(rgb).astype(np.float32) / 255


def _blur_channel(ch, radius):
    """Gaussian-like blur: three box blurs along each axis."""
    out = ch.astype(np.float32)
    # box width that gives roughly the requested sigma after three passes
    r = max(int(round(math.sqrt(12 * radius * radius / 3 + 1) / 2)), 1)
    for axis in (0, 1):
        for _ in range(3):
            out = _box(out, r, axis)
    return out


def _box(a, r, axis):
    pad = [(0, 0), (0, 0)]
    pad[axis] = (r + 1, r)
    p = np.pad(a, pad, mode="edge")
    c = np.cumsum(p, axis=axis, dtype=np.float64)
    n = a.shape[axis]
    hi = np.take(c, np.arange(2 * r + 1, 2 * r + 1 + n), axis=axis)
    lo = np.take(c, np.arange(0, n), axis=axis)
    return ((hi - lo) / (2 * r + 1)).astype(np.float32)


# ---- masks -------------------------------------------------------------------

def polygon_mask(w, h, points, feather=0.0):
    """Anti-aliased coverage mask for a polygon (doc coordinates)."""
    m = np.zeros((h, w), dtype=np.float32)
    if len(points) < 3:
        return m
    # rasterise only the bounding box, supersampled for smooth edges
    pad = int(feather * 3) + 2
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    x0, x1 = max(int(min(xs)) - pad, 0), min(int(max(xs)) + pad + 1, w)
    y0, y1 = max(int(min(ys)) - pad, 0), min(int(max(ys)) + pad + 1, h)
    if x0 >= x1 or y0 >= y1:
        return m
    s = SUPERSAMPLE
    img = Image.new("L", ((x1 - x0) * s, (y1 - y0) * s), 0)
    ImageDraw.Draw(img).polygon([((x - x0) * s, (y - y0) * s) for x, y in points], fill=255)
    img = img.resize((x1 - x0, y1 - y0), Image.LANCZOS)
    m[y0:y1, x0:x1] = np.asarray(img, dtype=np.float32) / 255
    return _blur_channel(m, feather) if feather > 0 else m


def ellipse_mask(w, h, cx, cy, rx, ry, feather=0.0):
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    d = np.sqrt(((xx + 0.5 - cx) / rx) ** 2 + ((yy + 0.5 - cy) / ry) ** 2)
    edge = max(feather / max(min(rx, ry), 1), 1.0 / max(min(rx, ry), 1))
    return np.clip((1 - d) / edge + 0.5, 0, 1)


def linear_gradient(w, h, p0, p1, stops):
    """HxWx3 colour field along p0->p1. stops: [(t, '#hex'), ...]."""
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    dx, dy = p1[0] - p0[0], p1[1] - p0[1]
    t = ((xx - p0[0]) * dx + (yy - p0[1]) * dy) / max(dx * dx + dy * dy, 1e-6)
    return _ramp(np.clip(t, 0, 1), stops)


def radial_gradient(w, h, center, radius, stops):
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    t = np.sqrt((xx - center[0]) ** 2 + (yy - center[1]) ** 2) / max(radius, 1e-6)
    return _ramp(np.clip(t, 0, 1), stops)


def _ramp(t, stops):
    ts = np.array([s[0] for s in stops], dtype=np.float32)
    cols = np.stack([hex_rgb(s[1]) for s in stops])
    out = np.empty(t.shape + (3,), dtype=np.float32)
    for i in range(3):
        out[..., i] = np.interp(t, ts, cols[:, i])
    return out


# ---- brush -------------------------------------------------------------------

def stroke_mask(w, h, points, size, hardness=0.8, taper=(0.0, 0.0), pressure=None, spacing=0.15):
    """Coverage mask of a soft round brush dragged through `points`.

    taper: fraction of the stroke length that thins in at the start/end.
    pressure: optional list of per-point size multipliers.
    """
    mask = np.zeros((h, w), dtype=np.float32)
    if not points:
        return mask
    pts = np.array(points, dtype=np.float32)
    press = np.ones(len(pts), dtype=np.float32) if pressure is None else np.array(pressure, dtype=np.float32)
    seglen = np.r_[0, np.cumsum(np.hypot(*np.diff(pts, axis=0).T))]
    total = seglen[-1]
    d = 0.0
    while True:
        x = np.interp(d, seglen, pts[:, 0])
        y = np.interp(d, seglen, pts[:, 1])
        p = np.interp(d, seglen, press)
        t = d / total if total > 0 else 0.5
        f = 1.0
        if taper[0] > 0 and t < taper[0]:
            f = min(f, t / taper[0])
        if taper[1] > 0 and t > 1 - taper[1]:
            f = min(f, (1 - t) / taper[1])
        r = max(size * p * (0.15 + 0.85 * f) / 2, 0.4)
        _dab(mask, x, y, r, hardness)
        if d >= total:
            break
        # space dabs by the current radius so thin tapered ends stay solid
        d = min(d + max(2 * r * spacing, 0.5), total)
    return mask


def _dab(mask, x, y, r, hardness):
    h, w = mask.shape
    x0, x1 = int(max(x - r - 2, 0)), int(min(x + r + 3, w))
    y0, y1 = int(max(y - r - 2, 0)), int(min(y + r + 3, h))
    if x0 >= x1 or y0 >= y1:
        return
    yy, xx = np.mgrid[y0:y1, x0:x1].astype(np.float32)
    d = np.hypot(xx + 0.5 - x, yy + 0.5 - y)
    inner = r * hardness
    soft = np.clip((r - d) / max(r - inner, 0.75), 0, 1)
    soft = soft * soft * (3 - 2 * soft)  # smoothstep falloff
    np.maximum(mask[y0:y1, x0:x1], soft, out=mask[y0:y1, x0:x1])


# ---- curves ------------------------------------------------------------------

def bezier(p0, p1, p2, p3=None, n=32):
    """Quadratic (3 points) or cubic (4 points) Bezier sampled as a list."""
    out = []
    for i in range(n + 1):
        t = i / n
        u = 1 - t
        if p3 is None:
            x = u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0]
            y = u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]
        else:
            x = u ** 3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t ** 3 * p3[0]
            y = u ** 3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t ** 3 * p3[1]
        out.append((x, y))
    return out


def path(start, *segments, n=24):
    """Chain cubic segments: path(p0, (c1, c2, p1), (c1, c2, p2), ...)."""
    pts = [start]
    cur = start
    for c1, c2, end in segments:
        pts += bezier(cur, c1, c2, end, n)[1:]
        cur = end
    return pts


# ---- document ----------------------------------------------------------------

class Document:
    def __init__(self, w, h, background="#ffffff"):
        self.w, self.h = w, h
        self.layers = []
        bg = self.add_layer("Background")
        if background:
            bg.px[..., :3] = hex_rgb(background)
            bg.px[..., 3] = 1

    def add_layer(self, name="Layer", mode="normal", opacity=1.0, clip=False, index=None):
        layer = Layer(self.w, self.h, name, mode, opacity, clip)
        if index is None:
            self.layers.append(layer)
        else:
            self.layers.insert(index, layer)
        return layer

    def composite(self):
        out = np.zeros((self.h, self.w, 3), dtype=np.float32)
        out_a = np.zeros((self.h, self.w, 1), dtype=np.float32)
        base_alpha = None
        for layer in self.layers:
            if not layer.clip:
                base_alpha = layer.px[..., 3:4] if layer.visible else np.zeros_like(out_a)
            if not layer.visible or layer.opacity <= 0:
                continue
            a = layer.px[..., 3:4] * layer.opacity
            if layer.clip and base_alpha is not None:
                a = a * base_alpha
            src = layer.px[..., :3]
            blended = blend(layer.mode, out, src)
            # where nothing is below, a blend mode acts like normal
            blended = blended * out_a + src * (1 - out_a)
            out = out * (1 - a) + blended * a
            out_a = a + out_a * (1 - a)
        return np.clip(out, 0, 1)

    def to_image(self):
        return Image.fromarray((self.composite() * 255 + 0.5).astype(np.uint8), "RGB")

    def bloom(self, threshold=0.7, radius=30, strength=0.6, name="Bloom"):
        """Add a screen layer holding a blurred glow of the bright areas."""
        comp = self.composite()
        lum = comp @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
        k = np.clip((lum - threshold) / max(1 - threshold, 1e-3), 0, 1)[..., None]
        layer = self.add_layer(name, mode="screen", opacity=strength)
        layer.px[..., :3] = comp
        layer.px[..., 3:4] = k
        layer.blur(radius)
        return layer


def blend(mode, b, s):
    if mode == "multiply":
        return b * s
    if mode == "screen":
        return 1 - (1 - b) * (1 - s)
    if mode == "overlay":
        return np.where(b < 0.5, 2 * b * s, 1 - 2 * (1 - b) * (1 - s))
    if mode == "soft light":
        return (1 - 2 * s) * b * b + 2 * s * b
    if mode == "add":
        return np.clip(b + s, 0, 1)
    return s


def flip_x(points, w):
    return [(w - x, y) for x, y in points]


def lerp(a, b, t):
    return a + (b - a) * t


def distance(a, b):
    return math.hypot(a[0] - b[0], a[1] - b[1])
