#!/usr/bin/env python3
"""Procedurally generates every texture shipped with Visceral.

Run from the repository root:  python3 tools/gen_textures.py
Requires Pillow and numpy. Output is deterministic (fixed seeds), so the
committed PNGs can always be regenerated or tweaked here instead of by hand.

Particle and decal textures are mostly greyscale so they can be tinted at
runtime per blood type (red / dark / green / purple / bone).
"""
import math
import os

import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), "..", "src", "main", "resources", "assets", "visceral", "textures")


def save(img, *path):
    out = os.path.join(ROOT, *path)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    img.save(out)


def value_noise(size, scale, rng):
    """Smooth value noise in [0,1] (bilinear interpolated lattice)."""
    cells = max(2, int(size / scale) + 2)
    lattice = rng.random((cells, cells))
    ys, xs = np.mgrid[0:size, 0:size].astype(np.float64) / scale
    x0 = np.floor(xs).astype(int)
    y0 = np.floor(ys).astype(int)
    fx = xs - x0
    fy = ys - y0
    fx = fx * fx * (3 - 2 * fx)
    fy = fy * fy * (3 - 2 * fy)
    a = lattice[y0 % cells, x0 % cells]
    b = lattice[y0 % cells, (x0 + 1) % cells]
    c = lattice[(y0 + 1) % cells, x0 % cells]
    d = lattice[(y0 + 1) % cells, (x0 + 1) % cells]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def fbm(size, rng, octaves=4, base=8.0):
    total = np.zeros((size, size))
    amp = 1.0
    norm = 0.0
    scale = base
    for _ in range(octaves):
        total += value_noise(size, scale, rng) * amp
        norm += amp
        amp *= 0.5
        scale /= 2.0
        scale = max(scale, 1.0)
    return total / norm


def blob_mask(size, rng, blobs, radius_range, spread):
    ys, xs = np.mgrid[0:size, 0:size].astype(np.float64)
    c = (size - 1) / 2.0
    mask = np.zeros((size, size))
    for _ in range(blobs):
        ang = rng.random() * math.tau
        dist = rng.random() ** 1.5 * spread * size
        bx = c + math.cos(ang) * dist
        by = c + math.sin(ang) * dist
        r = rng.uniform(*radius_range) * size
        d = np.sqrt((xs - bx) ** 2 + (ys - by) ** 2)
        mask = np.maximum(mask, np.clip(1.0 - d / r, 0, 1))
    return mask


def to_rgba(lum, alpha):
    lum = np.clip(lum, 0, 1)
    alpha = np.clip(alpha, 0, 1)
    arr = np.zeros(lum.shape + (4,), dtype=np.uint8)
    v = (lum * 255).astype(np.uint8)
    arr[..., 0] = v
    arr[..., 1] = v
    arr[..., 2] = v
    arr[..., 3] = (alpha * 255).astype(np.uint8)
    return Image.fromarray(arr, "RGBA")


def colored(rgb_lum_fn, alpha):
    arr = np.zeros(alpha.shape + (4,), dtype=np.uint8)
    r, g, b = rgb_lum_fn
    arr[..., 0] = np.clip(r * 255, 0, 255).astype(np.uint8)
    arr[..., 1] = np.clip(g * 255, 0, 255).astype(np.uint8)
    arr[..., 2] = np.clip(b * 255, 0, 255).astype(np.uint8)
    arr[..., 3] = np.clip(alpha * 255, 0, 255).astype(np.uint8)
    return Image.fromarray(arr, "RGBA")


def gen_particles():
    # Droplets: small glossy round/elongated drops (8x8), tinted at runtime.
    for i in range(4):
        rng = np.random.default_rng(100 + i)
        size = 8
        ys, xs = np.mgrid[0:size, 0:size].astype(np.float64)
        c = 3.5
        rx = 2.2 + rng.random() * 1.2
        ry = 2.2 + rng.random() * 1.6
        d = np.sqrt(((xs - c) / rx) ** 2 + ((ys - c) / ry) ** 2)
        alpha = (d < 1.0).astype(float)
        lum = 0.55 + 0.45 * np.clip(1 - d, 0, 1)
        # specular highlight
        hl = np.sqrt((xs - (c - 1)) ** 2 + (ys - (c - 1)) ** 2) < 0.8
        lum[hl] = 1.0
        save(to_rgba(lum, alpha), "particle", f"blood_drop_{i}.png")

    # Mist: soft noisy puffs (16x16).
    for i in range(4):
        rng = np.random.default_rng(200 + i)
        size = 16
        ys, xs = np.mgrid[0:size, 0:size].astype(np.float64)
        c = 7.5
        d = np.sqrt((xs - c) ** 2 + (ys - c) ** 2) / 8.0
        n = fbm(size, rng, 3, 6.0)
        alpha = np.clip((1 - d) * 1.4 - 0.25 + (n - 0.5) * 0.8, 0, 1) * 0.85
        lum = 0.75 + 0.25 * n
        save(to_rgba(lum, alpha), "particle", f"blood_mist_{i}.png")

    # Bone chips / dust for skeletons (full colour, not tinted).
    for i in range(3):
        rng = np.random.default_rng(300 + i)
        size = 8
        alpha = np.zeros((size, size))
        pts = rng.integers(1, 7, size=(5, 2))
        for (x, y) in pts:
            alpha[max(0, y - 1):y + 1, max(0, x - 1):x + 1] = 1.0
        lum = 0.8 + rng.random((size, size)) * 0.2
        rgb = (lum * 0.95, lum * 0.93, lum * 0.85)
        save(colored(rgb, alpha), "particle", f"bone_chip_{i}.png")


def gen_decals():
    # Splatters (64x64), greyscale, tinted at runtime.
    for i in range(4):
        rng = np.random.default_rng(400 + i)
        size = 64
        core = blob_mask(size, rng, 9, (0.10, 0.22), 0.18)
        droplets = blob_mask(size, rng, 26, (0.015, 0.045), 0.46)
        ys, xs = np.mgrid[0:size, 0:size].astype(np.float64)
        # radial streaks
        streak = np.zeros((size, size))
        c = (size - 1) / 2
        ang = np.arctan2(ys - c, xs - c)
        rad = np.sqrt((xs - c) ** 2 + (ys - c) ** 2) / size
        for _ in range(5):
            a0 = rng.random() * math.tau
            width = 0.05 + rng.random() * 0.06
            length = 0.25 + rng.random() * 0.2
            da = np.abs((ang - a0 + math.pi) % math.tau - math.pi)
            streak = np.maximum(streak, ((da < width * (1 - rad / length)) & (rad < length)).astype(float))
        n = fbm(size, rng, 4, 16.0)
        m = np.maximum(np.maximum(core, droplets * 1.2), streak * 0.9)
        alpha = np.clip((m - 0.05) * 3.0 + (n - 0.5) * 0.4, 0, 1)
        alpha = np.where(alpha > 0.12, np.clip(alpha * 1.2, 0, 0.96), 0)
        lum = 0.62 + 0.25 * n + 0.13 * core
        save(to_rgba(lum, alpha), "decal", f"blood_splat_{i}.png")

    # Pool (64x64): one smooth irregular puddle with a glossy rim.
    rng = np.random.default_rng(500)
    size = 64
    ys, xs = np.mgrid[0:size, 0:size].astype(np.float64)
    c = (size - 1) / 2
    ang = np.arctan2(ys - c, xs - c)
    wobble = 0.36 + 0.06 * np.sin(ang * 3 + 1.0) + 0.04 * np.sin(ang * 5 + 2.0) + 0.03 * np.sin(ang * 9)
    rad = np.sqrt((xs - c) ** 2 + (ys - c) ** 2) / size
    inside = rad < wobble
    edge = np.clip((wobble - rad) * 25, 0, 1)
    n = fbm(size, rng, 3, 12.0)
    alpha = edge * 0.93
    lum = 0.55 + 0.2 * n + 0.25 * np.clip(1 - (wobble - rad) * 30, 0, 1) * inside
    save(to_rgba(lum, alpha), "decal", "blood_pool.png")


def gen_wounds():
    """Wound overlays (16x16) in full colour. Drawn on entity model faces."""
    size = 16
    ys, xs = np.mgrid[0:size, 0:size].astype(np.float64)
    c = 7.5

    # Cut: a slanted laceration with dark core, red edges and a drip.
    rng = np.random.default_rng(600)
    t = (xs - c) * math.cos(0.6) + (ys - c) * math.sin(0.6)
    nrm = -(xs - c) * math.sin(0.6) + (ys - c) * math.cos(0.6)
    along = np.abs(t) < 6.5
    width = 1.6 * np.clip(1 - np.abs(t) / 6.8, 0, 1) + 0.3
    core = (np.abs(nrm) < width * 0.45) & along
    rim = (np.abs(nrm) < width) & along
    drip = (np.abs(xs - 9) < 0.8) & (ys > 8) & (ys < 14)
    alpha = np.zeros((size, size))
    alpha[rim] = 0.95
    alpha[drip] = 0.85
    r = np.where(core, 0.22, 0.55) + rng.random((size, size)) * 0.06
    g = np.where(core, 0.02, 0.05)
    b = np.where(core, 0.02, 0.04)
    save(colored((r, g, b), alpha), "entity", "wound", "cut.png")

    # Stab: round puncture with a darker centre.
    d = np.sqrt((xs - c) ** 2 + (ys - c) ** 2)
    alpha = np.clip(1 - (d - 2.6) / 1.4, 0, 1) * 0.95
    drip = (np.abs(xs - 8) < 0.8) & (ys > 9) & (ys < 15)
    alpha = np.maximum(alpha, drip * 0.8)
    r = np.where(d < 1.6, 0.15, 0.5)
    g = np.where(d < 1.6, 0.01, 0.04)
    b = np.where(d < 1.6, 0.01, 0.04)
    save(colored((r, g, b), alpha), "entity", "wound", "stab.png")

    # Bruise: soft purple/red blotch for blunt damage.
    rng = np.random.default_rng(601)
    n = fbm(size, rng, 3, 5.0)
    alpha = np.clip((1 - d / 7.0) * 1.1 + (n - 0.5) * 0.5, 0, 1) * 0.6
    r = 0.33 + 0.1 * n
    g = 0.10 + 0.05 * n
    b = 0.22 + 0.08 * n
    save(colored((r, g, b), alpha), "entity", "wound", "bruise.png")

    # Gore: exposed flesh with blood rim (used when gore level is high).
    rng = np.random.default_rng(602)
    n = fbm(size, rng, 3, 4.0)
    shape = np.clip((1 - d / 6.8) + (n - 0.5) * 0.6, 0, 1)
    alpha = (shape > 0.18).astype(float) * 0.97
    flesh = shape > 0.45
    r = np.where(flesh, 0.62 + 0.15 * n, 0.42)
    g = np.where(flesh, 0.18 + 0.08 * n, 0.02)
    b = np.where(flesh, 0.17 + 0.05 * n, 0.03)
    save(colored((r, g, b), alpha), "entity", "wound", "gore.png")

    # Stump cap: drawn over the joint of a severed part.
    alpha = (d < 7.2).astype(float)
    ring = (d > 4.5)
    bone = d < 1.8
    r = np.where(bone, 0.9, np.where(ring, 0.45, 0.62))
    g = np.where(bone, 0.86, np.where(ring, 0.03, 0.16))
    b = np.where(bone, 0.78, np.where(ring, 0.03, 0.15))
    save(colored((r, g, b), alpha), "entity", "wound", "stump.png")


def gen_hud():
    # Lock-on reticle (32x32): four corner brackets plus a centre dot.
    size = 32
    alpha = np.zeros((size, size))
    for (sx, sy) in ((0, 0), (1, 0), (0, 1), (1, 1)):
        x0 = 2 if sx == 0 else size - 10
        y0 = 2 if sy == 0 else size - 10
        hx = slice(x0, x0 + 8)
        vy = slice(y0, y0 + 8)
        yline = y0 if sy == 0 else y0 + 7
        xline = x0 if sx == 0 else x0 + 7
        alpha[yline:yline + 2, hx] = 1
        alpha[vy, xline:xline + 2] = 1
    alpha[15:17, 15:17] = 1
    lum = np.ones((size, size))
    save(to_rgba(lum, alpha), "gui", "lock_on.png")


def gen_icon():
    size = 128
    rng = np.random.default_rng(700)
    ys, xs = np.mgrid[0:size, 0:size].astype(np.float64)
    c = (size - 1) / 2
    n = fbm(size, rng, 4, 24.0)
    bg_r = 0.10 + 0.05 * n
    bg_g = 0.09 + 0.04 * n
    bg_b = 0.10 + 0.05 * n
    splat = blob_mask(size, rng, 12, (0.08, 0.18), 0.22)
    drops = blob_mask(size, rng, 30, (0.01, 0.03), 0.45)
    m = np.clip(np.maximum(splat, drops) * 3 - 0.2, 0, 1)
    r = bg_r * (1 - m) + (0.55 + 0.2 * n) * m
    g = bg_g * (1 - m) + 0.03 * m
    b = bg_b * (1 - m) + 0.04 * m
    # A diagonal blade silhouette across the splatter.
    t = (xs - c) * math.cos(-0.785) + (ys - c) * math.sin(-0.785)
    nrm = -(xs - c) * math.sin(-0.785) + (ys - c) * math.cos(-0.785)
    blade = (np.abs(nrm) < 4.5 - np.clip(t - 30, 0, 10) * 0.45) & (t > -38) & (t < 40)
    guard = (np.abs(t + 38) < 3) & (np.abs(nrm) < 13)
    grip = (t < -38) & (t > -54) & (np.abs(nrm) < 2.8)
    steel = blade
    r = np.where(steel, 0.80 + 0.1 * (nrm > 0), r)
    g = np.where(steel, 0.82 + 0.1 * (nrm > 0), g)
    b = np.where(steel, 0.86 + 0.1 * (nrm > 0), b)
    dark = guard | grip
    r = np.where(dark, 0.25, r)
    g = np.where(dark, 0.18, g)
    b = np.where(dark, 0.12, b)
    corner = np.minimum(np.minimum(xs, size - 1 - xs), np.minimum(ys, size - 1 - ys))
    alpha = np.clip(corner / 2.0, 0, 1)
    arr = np.zeros((size, size, 4), dtype=np.uint8)
    arr[..., 0] = np.clip(r * 255, 0, 255)
    arr[..., 1] = np.clip(g * 255, 0, 255)
    arr[..., 2] = np.clip(b * 255, 0, 255)
    arr[..., 3] = np.clip(alpha * 255, 0, 255)
    out = os.path.join(ROOT, "..", "icon.png")
    Image.fromarray(arr, "RGBA").save(out)


if __name__ == "__main__":
    gen_particles()
    gen_decals()
    gen_wounds()
    gen_hud()
    gen_icon()
    print("textures written to", os.path.normpath(ROOT))
