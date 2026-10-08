"""Portal swirl textures modelled on the classic green interdimensional portal.

Produces layered RGBA textures that the portal renderer stacks and spins:
  portal_core  - the full disc: dark/mid green spiral arms, light center, lime rim
  portal_swirl - translucent spiral arms that rotate faster than the core
  portal_rim   - the wobbly lime rim with white foam bubbles (transparent middle)
  portal_glow  - soft additive halo
"""
import math

import numpy as np
from PIL import Image

from .noise import fbm, rng

# Palette sampled from the reference artwork.
CENTER = np.array([0x8E, 0xC3, 0x4F])
LIGHT = np.array([0x97, 0xCD, 0x59])
MID = np.array([0x4F, 0xAE, 0x49])
MID2 = np.array([0x7A, 0xC6, 0x53])
DARK = np.array([0x1B, 0x84, 0x33])
DARKER = np.array([0x16, 0x74, 0x20])
RIM = np.array([0xCB, 0xE3, 0x68])
RIM_LIGHT = np.array([0xD0, 0xF6, 0x7C])
RIM_STREAK = np.array([0x7D, 0xB3, 0x48])
FOAM = np.array([0xF7, 0xFC, 0xEB])


def _lerp(a, b, t):
    t = np.clip(t, 0, 1)[..., None]
    return a * (1 - t) + b * t


def _polar(size, seed, wobble=1.0):
    yy, xx = np.mgrid[0:size, 0:size].astype(float)
    c = (size - 1) / 2
    dx = (xx - c) / c
    dy = (yy - c) / c
    r = np.hypot(dx, dy)
    th = np.arctan2(dy, dx)
    rr = rng(seed)
    ph = rr.random(4) * math.tau
    edge = 0.9 * (1 + wobble * (0.035 * np.sin(5 * th + ph[0]) + 0.025 * np.sin(9 * th + ph[1])
                                 + 0.018 * np.sin(14 * th + ph[2]) + 0.012 * np.sin(23 * th + ph[3])))
    rho = r / edge
    return r, th, rho


def _alpha_edge(rho, soft=0.025):
    return np.clip((1.0 - rho) / soft, 0, 1)


def portal_core(size=256, seed="portal-core"):
    r, th, rho = _polar(size, seed)
    warp = fbm(size, size, size / 6, seed + "w", octaves=3, tile=False) - 0.5
    # Archimedean spiral bands (3 arms) winding toward the center
    s = 3 * th + 15.0 * rho + 4.0 * warp
    band = 0.5 + 0.5 * np.sin(s)
    band2 = 0.5 + 0.5 * np.sin(2 * th + 23.0 * rho + 6.0 * warp + 1.3)
    col = _lerp(DARK, MID, band)
    col = _lerp(col, DARKER, np.clip((band2 - 0.78) * 4, 0, 1) * 0.8)
    col = _lerp(col, MID2, np.clip((band - 0.82) * 5, 0, 1))
    # lighter center
    col = _lerp(col, LIGHT, np.clip(1 - rho / 0.22, 0, 1))
    col = _lerp(col, CENTER, np.clip(1 - rho / 0.12, 0, 1))
    # rim
    rim_t = np.clip((rho - 0.66) / 0.08, 0, 1)
    rim_band = 0.5 + 0.5 * np.sin(4 * th + 30.0 * rho + 5.0 * warp)
    rim_col = _lerp(RIM, RIM_LIGHT, rim_band * 0.6)
    rim_col = _lerp(rim_col, RIM_STREAK, np.clip((rim_band - 0.8) * 4, 0, 1) * 0.7)
    col = _lerp(col, rim_col, rim_t)
    col = _add_foam(col, rho, th, size, seed, density=1.0)
    a = _alpha_edge(rho)
    return _to_image(col, a)


def portal_swirl(size=256, seed="portal-swirl"):
    r, th, rho = _polar(size, seed, wobble=0.6)
    warp = fbm(size, size, size / 5, seed + "w", octaves=3, tile=False) - 0.5
    s = 3 * th + 18.0 * rho + 5.0 * warp
    band = 0.5 + 0.5 * np.sin(s)
    a = np.clip((band - 0.55) * 3.0, 0, 1) * 0.75
    a *= np.clip((0.70 - rho) / 0.12, 0, 1)
    a *= np.clip(rho / 0.10, 0, 1)
    col = _lerp(DARKER, DARK, band)
    return _to_image(col, a)


def portal_rim(size=256, seed="portal-rim"):
    r, th, rho = _polar(size, seed, wobble=1.4)
    warp = fbm(size, size, size / 6, seed + "w", octaves=3, tile=False) - 0.5
    rim_band = 0.5 + 0.5 * np.sin(5 * th + 28.0 * rho + 6.0 * warp)
    col = _lerp(RIM, RIM_LIGHT, rim_band * 0.7)
    col = _lerp(col, RIM_STREAK, np.clip((rim_band - 0.75) * 4, 0, 1) * 0.8)
    a = _alpha_edge(rho, 0.03) * np.clip((rho - 0.70) / 0.06, 0, 1)
    col, a = _add_foam(col, rho, th, size, seed, density=1.6, alpha=a)
    return _to_image(col, a)


def portal_glow(size=128):
    yy, xx = np.mgrid[0:size, 0:size].astype(float)
    c = (size - 1) / 2
    r = np.hypot(xx - c, yy - c) / c
    a = np.clip(1 - r, 0, 1) ** 2.2
    col = np.zeros((size, size, 3)) + np.array([0x9C, 0xF0, 0x5A])
    return _to_image(col, a)


def portal_spark(size=16):
    """Particle sprite: a soft four-point twinkle."""
    yy, xx = np.mgrid[0:size, 0:size].astype(float)
    c = (size - 1) / 2
    dx, dy = np.abs(xx - c), np.abs(yy - c)
    core = np.clip(1 - np.hypot(dx, dy) / (size * 0.28), 0, 1)
    cross = np.clip(1 - np.minimum(dx, dy) / 1.2, 0, 1) * np.clip(1 - np.maximum(dx, dy) / (size * 0.5), 0, 1)
    a = np.clip(core + cross * 0.8, 0, 1)
    col = _lerp(np.array([0xB8, 0xF5, 0x6A]), np.array([0xFF, 0xFF, 0xF0]), core)
    return _to_image(col, a)


def _add_foam(col, rho, th, size, seed, density=1.0, alpha=None):
    rr = rng(seed + "foam")
    n = int(70 * density)
    yy, xx = np.mgrid[0:size, 0:size].astype(float)
    c = (size - 1) / 2
    out = col.copy()
    out_a = None if alpha is None else alpha.copy()
    for _ in range(n):
        t = rr.random() * math.tau
        rad = 0.78 + rr.random() * 0.17
        br = (0.9 * rad) * c
        px = c + math.cos(t) * br
        py = c + math.sin(t) * br
        pr = size / 256 * (1.6 + rr.random() * 3.2)
        d = np.hypot(xx - px, yy - py)
        m = np.clip((pr - d) / 1.0, 0, 1)
        out = _lerp(out, FOAM, m)
        if out_a is not None:
            out_a = np.maximum(out_a, m * (rho < 1.02))
    if alpha is None:
        return out
    return out, out_a


def _to_image(col, a):
    rgba = np.zeros(col.shape[:2] + (4,), dtype=np.uint8)
    rgba[..., :3] = np.clip(col, 0, 255).astype(np.uint8)
    rgba[..., 3] = np.clip(a * 255, 0, 255).astype(np.uint8)
    return Image.fromarray(rgba, "RGBA")


def write_all(tex_dir):
    import os
    os.makedirs(os.path.join(tex_dir, "entity", "portal"), exist_ok=True)
    os.makedirs(os.path.join(tex_dir, "particle"), exist_ok=True)
    portal_core().save(os.path.join(tex_dir, "entity", "portal", "core.png"))
    portal_swirl().save(os.path.join(tex_dir, "entity", "portal", "swirl.png"))
    portal_rim().save(os.path.join(tex_dir, "entity", "portal", "rim.png"))
    portal_glow().save(os.path.join(tex_dir, "entity", "portal", "glow.png"))
    portal_spark().save(os.path.join(tex_dir, "particle", "portal_spark.png"))
