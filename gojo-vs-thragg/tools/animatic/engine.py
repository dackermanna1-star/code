"""Core of the animatic renderer: camera, per-frame drawing context, keyframing,
compositing helpers.

Coordinate conventions
----------------------
* World space is 2D, in metres, y pointing UP. Street level is y = 0.
* A Cam maps world -> screen. `zoom` is screen pixels per metre at 1920x1080
  output (it is multiplied by the supersample factor internally), so a camera
  with zoom=200 frames roughly a 9.6 m wide slice of the world.
* Depth: every world primitive takes `d` (default fr.depth = 1, the fighters'
  plane). Something at d=4 moves 4x slower and looks 4x smaller, which gives
  parallax and perspective (ground lines of far layers converge on the
  camera height) for free. Foreground elements use d < 1.

Every shot function receives one `Frame` and draws into it. Nothing in a shot
function may depend on wall-clock time or global randomness: use `fr.rng`
(seeded from shot id + frame) so renders are deterministic and frames can be
rendered out of order in parallel workers.
"""
from __future__ import annotations

import math
import random
from dataclasses import dataclass, field

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

FPS = 24
OUT_W, OUT_H = 1920, 1080

FONT_DIR = "/usr/share/fonts/opentype/inter/"


def font(size: int, weight: str = "Medium") -> ImageFont.FreeTypeFont:
    try:
        return ImageFont.truetype(f"{FONT_DIR}Inter-{weight}.otf", size)
    except OSError:
        return ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", size)


# --------------------------------------------------------------------------
# easing + keyframes
# --------------------------------------------------------------------------

def clamp(v, lo=0.0, hi=1.0):
    return lo if v < lo else hi if v > hi else v


def lerp(a, b, u):
    if isinstance(a, (tuple, list)):
        return type(a)(lerp(x, y, u) for x, y in zip(a, b))
    return a + (b - a) * u


EASE = {
    "linear": lambda u: u,
    "in": lambda u: u * u * u,
    "out": lambda u: 1 - (1 - u) ** 3,
    "inout": lambda u: 4 * u * u * u if u < 0.5 else 1 - (-2 * u + 2) ** 3 / 2,
    # snap: anticipation-free, very fast start - for strikes / acceleration
    "snap": lambda u: 1 - (1 - u) ** 6,
    # slam: slow start, violent finish - for impacts
    "slam": lambda u: u ** 5,
    "hold": lambda u: 0.0,
    "step": lambda u: 1.0 if u >= 1 else 0.0,
    "smooth": lambda u: u * u * (3 - 2 * u),
}


def kf(t: float, keys, ease: str = "inout"):
    """Keyframe interpolation.

    keys: list of (time, value) or (time, value, ease_name) sorted by time.
    The ease on a key applies to the segment that ENDS at that key.
    Values may be numbers or tuples. Before the first key / after the last key
    the value is held.
    """
    if t <= keys[0][0]:
        return keys[0][1]
    for i in range(1, len(keys)):
        k1 = keys[i]
        if t <= k1[0]:
            k0 = keys[i - 1]
            span = k1[0] - k0[0]
            u = 1.0 if span <= 0 else (t - k0[0]) / span
            e = EASE[k1[2] if len(k1) > 2 else ease]
            return lerp(k0[1], k1[1], e(clamp(u)))
    return keys[-1][1]


def smoothstep(e0, e1, x):
    u = clamp((x - e0) / (e1 - e0)) if e1 != e0 else (1.0 if x >= e1 else 0.0)
    return u * u * (3 - 2 * u)


def pulse(t, t0, attack, release):
    """0 -> 1 -> 0 envelope peaking at t0+attack."""
    if t < t0:
        return 0.0
    if t < t0 + attack:
        return (t - t0) / attack if attack > 0 else 1.0
    return max(0.0, 1.0 - (t - t0 - attack) / release) if release > 0 else 0.0


def mix_color(a, b, u):
    return tuple(int(round(x + (y - x) * u)) for x, y in zip(a, b))


def shade(c, k):
    """k < 1 darkens, k > 1 brightens toward white."""
    if k <= 1:
        return tuple(int(x * k) for x in c[:3])
    return tuple(int(x + (255 - x) * (k - 1)) for x in c[:3])


# --------------------------------------------------------------------------
# camera
# --------------------------------------------------------------------------

@dataclass
class Cam:
    x: float = 0.0          # world point at screen centre
    y: float = 1.5
    zoom: float = 120.0     # px per metre at 1080p output
    rot: float = 0.0        # roll, degrees (positive = counter-clockwise)
    shake: tuple = (0.0, 0.0)  # screen-space offset in 1080p px


class Frame:
    """Drawing context for one output frame (supersampled)."""

    def __init__(self, shot: dict, f: int, ss: float = 2.0, seed_extra: str = ""):
        self.shot = shot
        self.f = f                                   # frame index inside shot
        self.n = shot["frames"]                      # frames in shot
        self.t = f / FPS                             # seconds inside shot
        self.dur = self.n / FPS
        self.u = f / max(1, self.n - 1)              # 0..1 progress
        self.gf = shot["start_frame"] + f            # global frame number
        self.ss = ss
        self.W = int(OUT_W * ss)
        self.H = int(OUT_H * ss)
        self.img = Image.new("RGB", (self.W, self.H), (0, 0, 0))
        self.draw = ImageDraw.Draw(self.img)
        self.glow_img = None                         # lazily created additive light layer
        self.soft_img = None                         # additive light, composited ONLY blurred
        self.cam = Cam()
        self.depth = 1.0                              # default depth for world drawing
        self.rng = random.Random(f"{shot['id']}:{f}:{seed_extra}")
        self.post = []                                # list of (name, params) post effects
        self.flash = 0.0                              # white impact flash 0..1
        self.invert = 0.0                             # impact-frame inversion 0..1
        self.tint = None                              # (r,g,b,amount)
        self.blur_dir = None                          # (dx, dy) px motion smear
        self.vignette = 0.35
        self.letterbox = 0.0                          # 0..1 extra cinemascope bars
        self.caption_extra = None

    # -- helpers ----------------------------------------------------------
    def srng(self, salt) -> random.Random:
        """A random stream stable across the whole shot (not per frame)."""
        return random.Random(f"{self.shot['id']}:{salt}")

    @property
    def ppm(self) -> float:
        return self.cam.zoom * self.ss

    def P(self, x, y, d=None):
        """world -> supersampled pixel. d = depth (1 = subject plane where the
        fighters normally are; 3 = three times further away: moves and appears
        3x smaller; values < 1 are foreground). Defaults to fr.depth."""
        d = self.depth if d is None else d
        c = self.cam
        dx = (x - c.x) * c.zoom * self.ss / d
        dy = -(y - c.y) * c.zoom * self.ss / d
        if c.rot:
            a = math.radians(c.rot)
            dx, dy = dx * math.cos(a) + dy * math.sin(a), -dx * math.sin(a) + dy * math.cos(a)
        return (self.W / 2 + dx + c.shake[0] * self.ss, self.H / 2 + dy + c.shake[1] * self.ss)

    def S(self, metres: float, d=None) -> float:
        d = self.depth if d is None else d
        return metres * self.cam.zoom * self.ss / d

    def pts(self, pts, d=None):
        return [self.P(x, y, d) for x, y in pts]

    # -- primitives in world space ---------------------------------------
    def poly(self, pts, fill, d=None, outline=None, width=0):
        if len(pts) >= 3:
            self.draw.polygon(self.pts(pts, d), fill=fill, outline=outline,
                              width=int(width * self.ss) if width else 0)

    def circle(self, x, y, r, fill=None, d=None, outline=None, width=1):
        px, py = self.P(x, y, d)
        rr = self.S(r, d)
        self.draw.ellipse([px - rr, py - rr, px + rr, py + rr], fill=fill, outline=outline,
                          width=max(1, int(width * self.ss)))

    def ellipse(self, x, y, rx, ry, fill=None, outline=None, width=1, d=None):
        px, py = self.P(x, y, d)
        self.draw.ellipse([px - self.S(rx, d), py - self.S(ry, d), px + self.S(rx, d), py + self.S(ry, d)],
                          fill=fill, outline=outline, width=max(1, int(width * self.ss)))

    def line(self, pts, fill, width_m=None, width_px=None, d=None):
        w = int(self.S(width_m, d)) if width_m is not None else int((width_px or 2) * self.ss)
        self.draw.line(self.pts(pts, d), fill=fill, width=max(1, w), joint="curve")

    def rect(self, x0, y0, x1, y1, fill, d=None):
        self.poly([(x0, y0), (x1, y0), (x1, y1), (x0, y1)], fill, d)

    # -- screen space (0..1 normalised, origin top-left) -----------------
    def sp(self, u, v):
        return (u * self.W, v * self.H)

    def s_poly(self, pts, fill):
        self.draw.polygon([self.sp(u, v) for u, v in pts], fill=fill)

    def s_rect(self, u0, v0, u1, v1, fill):
        self.draw.rectangle([u0 * self.W, v0 * self.H, u1 * self.W, v1 * self.H], fill=fill)

    def s_circle(self, u, v, r, fill=None, outline=None, width=1):
        """r is a fraction of frame HEIGHT."""
        x, y = self.sp(u, v)
        rr = r * self.H
        self.draw.ellipse([x - rr, y - rr, x + rr, y + rr], fill=fill, outline=outline,
                          width=max(1, int(width * self.ss)))

    def s_line(self, pts, fill, width=2):
        self.draw.line([self.sp(u, v) for u, v in pts], fill=fill, width=max(1, int(width * self.ss)))

    # -- additive light layer ---------------------------------------------
    @property
    def glow(self) -> ImageDraw.ImageDraw:
        """ImageDraw onto an additive light layer (black = no light). The layer
        is blurred and screened onto the frame at composite time."""
        if self.glow_img is None:
            self.glow_img = Image.new("RGB", (self.W, self.H), (0, 0, 0))
            self._glow_draw = ImageDraw.Draw(self.glow_img)
        return self._glow_draw

    @property
    def soft(self) -> ImageDraw.ImageDraw:
        if self.soft_img is None:
            self.soft_img = Image.new("RGB", (self.W // 4, self.H // 4), (0, 0, 0))
            self._soft_draw = ImageDraw.Draw(self.soft_img)
        return self._soft_draw

    def soft_circle(self, x, y, r, color, world=True, d=None):
        """Large diffuse light (sun haze, explosions' bloom). Drawn at 1/4 res."""
        if world:
            px, py = self.P(x, y, d)
            rr = self.S(r, d)
        else:
            px, py = self.sp(x, y)
            rr = r * self.H
        self.soft.ellipse([(px - rr) / 4, (py - rr) / 4, (px + rr) / 4, (py + rr) / 4], fill=color)

    def glow_circle(self, x, y, r, color, world=True, d=None):
        g = self.glow
        if world:
            px, py = self.P(x, y, d)
            rr = self.S(r, d)
        else:
            px, py = self.sp(x, y)
            rr = r * self.H
        g.ellipse([px - rr, py - rr, px + rr, py + rr], fill=color)

    def glow_line(self, pts, color, width_px=6, world=True, d=None):
        p = self.pts(pts, d) if world else [self.sp(u, v) for u, v in pts]
        self.glow.line(p, fill=color, width=max(1, int(width_px * self.ss)))

    def glow_poly(self, pts, color, world=True, d=None):
        p = self.pts(pts, d) if world else [self.sp(u, v) for u, v in pts]
        if len(p) >= 3:
            self.glow.polygon(p, fill=color)

    # -- composite --------------------------------------------------------
    def layer(self):
        """Start an RGBA overlay (for translucent drawing). Returns (img, draw);
        call fr.merge(img) when done."""
        im = Image.new("RGBA", (self.W, self.H), (0, 0, 0, 0))
        return im, ImageDraw.Draw(im)

    def merge(self, im: Image.Image):
        self.img.paste(im, (0, 0), im)

    def finish(self) -> Image.Image:
        img = self.img
        if self.glow_img is not None:
            small = self.glow_img.resize((self.W // 8, self.H // 8), Image.BILINEAR)
            soft = small.filter(ImageFilter.GaussianBlur(5)).resize((self.W, self.H), Image.BILINEAR)
            wide = small.filter(ImageFilter.GaussianBlur(18)).resize((self.W, self.H), Image.BILINEAR)
            img = ImageChops.screen(img, self.glow_img)
            img = ImageChops.screen(img, soft)
            img = ImageChops.screen(img, wide)
        if self.soft_img is not None:
            s = self.soft_img.filter(ImageFilter.GaussianBlur(self.soft_img.size[1] / 14))
            img = ImageChops.screen(img, s.resize((self.W, self.H), Image.BILINEAR))
        img = img.resize((OUT_W, OUT_H), Image.LANCZOS) if self.ss != 1 else img
        if self.blur_dir:
            img = motion_smear(img, *self.blur_dir)
        arr = np.asarray(img).astype(np.float32)
        for p in self.post:
            if p[0] in ("lens", "ring"):
                arr = _warp(arr, *p)
        if self.tint:
            r, g, b, a = self.tint
            arr = arr * (1 - a) + np.array([r, g, b], np.float32) * a * (arr.mean(axis=2, keepdims=True) / 255 * 0.6 + 0.4)
        if self.vignette:
            arr *= _vignette_mask(self.vignette)[..., None]
        if self.flash > 0:
            arr = arr + (255 - arr) * clamp(self.flash)
        if self.invert > 0:
            inv = 255 - arr
            # anime impact frame: high-contrast inverted, crushed to 2 tones
            lum = inv.mean(axis=2, keepdims=True)
            two = np.where(lum > 110, 245.0, 12.0)
            two = np.repeat(two, 3, axis=2)
            two[..., 0] = np.minimum(255, two[..., 0] * 1.0)
            arr = arr * (1 - self.invert) + two * self.invert
        if self.letterbox > 0:
            bar = int(OUT_H * 0.12 * clamp(self.letterbox))
            if bar:
                arr[:bar] = 0
                arr[-bar:] = 0
        arr = np.clip(arr, 0, 255).astype(np.uint8)
        return Image.fromarray(arr)


def _warp(arr, kind, cx, cy, R, k, t):
    """Screen-space refraction in output pixels.
    lens k>0: rippling refraction (Infinity / heat);  k<0: pinch toward the
    centre (Blue's gravitational lensing).  ring: displacement only in a band
    at radius R (shockwave front)."""
    H, W = arr.shape[:2]
    if R < 2 or abs(k) < 1e-3:
        return arr
    pad = R * (1.15 if kind == "ring" else 1.0)
    x0, x1 = int(max(0, cx - pad)), int(min(W, cx + pad))
    y0, y1 = int(max(0, cy - pad)), int(min(H, cy + pad))
    if x1 - x0 < 2 or y1 - y0 < 2:
        return arr
    yy, xx = np.mgrid[y0:y1, x0:x1].astype(np.float32)
    dx, dy = xx - cx, yy - cy
    r = np.sqrt(dx * dx + dy * dy) + 1e-3
    if kind == "lens":
        q = np.clip(r / R, 0, 1)
        if k > 0:
            f = 1 + k * np.sin(q * math.pi * 3 - t * 5) * (1 - q) ** 1.5
        else:
            f = 1 + (-k) * (1 - q) ** 2 * 1.6
    else:
        band = np.exp(-((r - R) / (0.08 * R + 4)) ** 2)
        f = 1 - k * 0.08 * band
    sx = np.clip(cx + dx * f, 0, W - 1).astype(np.int32)
    sy = np.clip(cy + dy * f, 0, H - 1).astype(np.int32)
    out = arr.copy()
    out[y0:y1, x0:x1] = arr[sy, sx]
    return out


_VIG = {}


def _vignette_mask(strength):
    key = round(strength, 3)
    if key not in _VIG:
        yy, xx = np.mgrid[0:OUT_H, 0:OUT_W].astype(np.float32)
        nx = (xx - OUT_W / 2) / (OUT_W / 2)
        ny = (yy - OUT_H / 2) / (OUT_H / 2)
        d = np.sqrt(nx * nx * 0.8 + ny * ny)
        _VIG[key] = np.clip(1 - strength * np.clip(d - 0.45, 0, None) ** 1.6, 0, 1).astype(np.float32)
    return _VIG[key]


def motion_smear(img: Image.Image, dx: float, dy: float, taps: int = 6) -> Image.Image:
    """Directional smear (dx, dy in output px) - cheap stand-in for motion blur."""
    if abs(dx) < 1 and abs(dy) < 1:
        return img
    acc = np.asarray(img).astype(np.float32)
    base = acc.copy()
    for i in range(1, taps):
        k = i / (taps - 1)
        sh = np.roll(base, (int(dy * k), int(dx * k)), axis=(0, 1))
        acc += sh
    return Image.fromarray(np.clip(acc / taps, 0, 255).astype(np.uint8))


# --------------------------------------------------------------------------
# palette (shared so every shot grades consistently)
# --------------------------------------------------------------------------

PAL = {
    "sky_top": (24, 26, 44),
    "sky_mid": (74, 58, 78),
    "sky_low": (176, 104, 74),       # dusk glow under the storm deck
    "cloud": (46, 44, 62),
    "cloud_lit": (120, 86, 92),
    "bldg_far": (38, 38, 54),
    "bldg_mid": (30, 30, 42),
    "bldg_near": (20, 21, 30),
    "window_lit": (226, 170, 104),
    "street": (40, 38, 44),
    "street_line": (150, 140, 110),
    "concrete": (92, 88, 90),
    "concrete_dark": (54, 52, 58),
    "dust": (150, 128, 110),
    "glass": (170, 200, 220),
    "blue": (70, 170, 255),
    "blue_core": (220, 245, 255),
    "red": (255, 40, 50),
    "red_core": (255, 220, 200),
    "purple": (170, 70, 255),
    "purple_core": (245, 225, 255),
    "rim_warm": (255, 170, 110),
    "rim_cool": (130, 190, 255),
}
