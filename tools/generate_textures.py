#!/usr/bin/env python3
"""Procedurally generates every Visceral texture.

    python3 tools/generate_textures.py

Decal and wound atlases are grayscale + alpha: the mod tints them per blood type and age, so a
single texture serves red, green, purple... blood and all bruise colours. The screen overlay and the
icons are coloured. Everything is seeded and reproducible; tweak and rerun.
"""
import math
import os

import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src", "main", "resources", "assets", "visceral", "textures")


# --------------------------------------------------------------------------- noise and helpers

def value_noise(size, cells, rng):
    """Smooth value noise in [0, 1] of shape (size, size) with `cells` lattice cells per side."""
    grid = rng.random((cells + 2, cells + 2))
    coords = np.linspace(0, cells, size, endpoint=False)
    i = np.floor(coords).astype(int)
    f = coords - i
    f = f * f * (3 - 2 * f)
    y0 = grid[i][:, i] * (1 - f)[None, :] + grid[i][:, i + 1] * f[None, :]
    y1 = grid[i + 1][:, i] * (1 - f)[None, :] + grid[i + 1][:, i + 1] * f[None, :]
    return y0 * (1 - f)[:, None] + y1 * f[:, None]


def fbm(size, rng, base=4, octaves=5, persistence=0.5):
    total = np.zeros((size, size))
    amplitude = 1.0
    norm = 0.0
    cells = base
    for _ in range(octaves):
        total += value_noise(size, cells, rng) * amplitude
        norm += amplitude
        amplitude *= persistence
        cells *= 2
    return total / norm


def gaussian_kernel(sigma):
    radius = max(1, int(sigma * 3))
    x = np.arange(-radius, radius + 1)
    k = np.exp(-(x * x) / (2 * sigma * sigma))
    return k / k.sum()


def blur(img, sigma):
    if sigma <= 0:
        return img
    k = gaussian_kernel(sigma)
    pad = len(k) // 2
    padded = np.pad(img, pad, mode="edge")
    tmp = np.apply_along_axis(lambda m: np.convolve(m, k, mode="valid"), 1, padded)
    return np.apply_along_axis(lambda m: np.convolve(m, k, mode="valid"), 0, tmp)


def grid(size):
    y, x = np.mgrid[0:size, 0:size].astype(float)
    return (x + 0.5) / size, (y + 0.5) / size


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def blob_field(size, blobs):
    """Metaball field: blobs = [(cx, cy, r, weight)] in cell units."""
    x, y = grid(size)
    field = np.zeros((size, size))
    for cx, cy, r, w in blobs:
        d2 = ((x - cx) ** 2 + (y - cy) ** 2) / (r * r)
        field += w * np.exp(-d2 * 2.0)
    return field


def ellipse_field(size, cx, cy, rx, ry, angle=0.0):
    x, y = grid(size)
    c, s = math.cos(angle), math.sin(angle)
    dx, dy = x - cx, y - cy
    u = (dx * c + dy * s) / rx
    v = (-dx * s + dy * c) / ry
    return np.exp(-(u * u + v * v) * 2.0)


def edge_mask(size, margin=3):
    """Forces a transparent border so linear filtering never bleeds between atlas cells."""
    mask = np.ones((size, size))
    ramp = np.clip(np.arange(size) / margin, 0, 1)
    ramp = np.minimum(ramp, ramp[::-1])
    return mask * ramp[None, :] * ramp[:, None]


def to_rgba_gray(lum, alpha):
    lum = np.clip(lum, 0, 1)
    alpha = np.clip(alpha, 0, 1)
    rgba = np.zeros(lum.shape + (4,), dtype=np.uint8)
    value = (lum * 255).round().astype(np.uint8)
    rgba[..., 0] = value
    rgba[..., 1] = value
    rgba[..., 2] = value
    rgba[..., 3] = (alpha * 255).round().astype(np.uint8)
    # Premultiplied-looking edges: keep colour of fully transparent texels neutral.
    return rgba


def shade_liquid(alpha_shape, rng, size, rim=0.35, mottle=0.12):
    """Luminance for a liquid stain: slightly darker rim (coffee ring), soft mottling."""
    inner = blur(alpha_shape, size / 40.0)
    rim_band = np.clip(alpha_shape - inner * 1.05, 0, 1)
    noise = fbm(size, rng, base=6, octaves=4)
    lum = 0.92 - rim * smoothstep(0.0, 0.25, rim_band) - mottle * (noise - 0.5)
    return np.clip(lum, 0.35, 1.0)


# --------------------------------------------------------------------------- blood decal cells (128 px)

def splat(size, rng, satellites=10, spikes=7, core=0.24):
    blobs = []
    # Irregular core made from overlapping blobs.
    for _ in range(11):
        a = rng.random() * math.tau
        d = rng.random() * core * 0.75
        blobs.append((0.5 + math.cos(a) * d, 0.5 + math.sin(a) * d, core * (0.35 + rng.random() * 0.5), 1.0))
    # Spikes radiating outward.
    for _ in range(spikes):
        a = rng.random() * math.tau
        length = core * (1.2 + rng.random() * 0.9)
        steps = 6
        for k in range(steps):
            t = (k + 1) / steps
            r = core * 0.28 * (1 - t * 0.75)
            blobs.append((0.5 + math.cos(a) * length * t, 0.5 + math.sin(a) * length * t, r, 0.9))
    # Satellite droplets, smaller further out.
    for _ in range(satellites):
        a = rng.random() * math.tau
        d = core * (1.3 + rng.random() * 1.4)
        r = core * (0.05 + 0.12 * rng.random()) * (1.6 - d / (core * 2.7))
        blobs.append((0.5 + math.cos(a) * d, 0.5 + math.sin(a) * d, max(r, 0.012), 1.0))
    field = blob_field(size, blobs)
    noise = fbm(size, rng, base=8, octaves=4)
    field = field * (0.75 + 0.5 * noise)
    alpha = smoothstep(0.42, 0.52, field) * edge_mask(size)
    lum = shade_liquid(alpha, rng, size)
    return lum, alpha * 0.97


def spatter(size, rng):
    """Directional splash travelling towards +x: elongated stain, spines at the leading edge, drops thrown ahead."""
    x, y = grid(size)
    cx, cy = 0.36, 0.5
    field = ellipse_field(size, cx, cy, 0.21, 0.105, (rng.random() - 0.5) * 0.1) * 1.35
    # Spines on the leading edge.
    for k in range(9):
        a = (rng.random() - 0.5) * 1.6
        length = 0.08 + rng.random() * 0.12
        for step in range(5):
            t = (step + 1) / 5
            px = cx + 0.12 + math.cos(a) * length * t
            py = cy + math.sin(a) * length * t * 0.9
            field += ellipse_field(size, px, py, 0.018 * (1.3 - t), 0.011 * (1.3 - t), a) * 1.1
    # Droplets thrown in the direction of travel, more stretched the further they flew.
    for _ in range(18):
        px = cx + 0.18 + rng.random() * 0.42
        py = cy + (rng.random() - 0.5) * 0.45 * (px - cx)
        r = 0.006 + rng.random() * 0.02 * (1.2 - (px - cx))
        field += ellipse_field(size, px, py, r * (1.4 + (px - cx) * 3.0), r, (py - cy) * 1.5) * 1.3
    # A few drops kicked backwards.
    for _ in range(4):
        field += ellipse_field(size, cx - 0.2 - rng.random() * 0.1, cy + (rng.random() - 0.5) * 0.2, 0.012, 0.009) * 1.2
    noise = fbm(size, rng, base=8, octaves=4)
    field = field * (0.88 + 0.25 * noise)
    alpha = smoothstep(0.42, 0.52, field) * edge_mask(size)
    lum = shade_liquid(alpha, rng, size, rim=0.25)
    return lum, alpha * 0.96


def drop(size, rng, crown=False):
    x, y = grid(size)
    d = np.sqrt((x - 0.5) ** 2 + (y - 0.5) ** 2)
    angle = np.arctan2(y - 0.5, x - 0.5)
    radius = 0.3 + 0.012 * np.sin(angle * 7 + rng.random() * 6) + 0.008 * np.sin(angle * 13)
    if crown:
        radius = radius + 0.03 * np.clip(np.sin(angle * 11 + rng.random()), 0, 1) ** 4
    alpha = smoothstep(radius + 0.012, radius - 0.012, d)
    if crown:
        blobs = []
        for _ in range(9):
            a = rng.random() * math.tau
            r = 0.36 + rng.random() * 0.1
            blobs.append((0.5 + math.cos(a) * r, 0.5 + math.sin(a) * r, 0.012 + rng.random() * 0.015, 1.0))
        alpha = np.maximum(alpha, smoothstep(0.42, 0.52, blob_field(size, blobs)))
    alpha *= edge_mask(size)
    lum = 0.9 - 0.3 * smoothstep(radius - 0.06, radius, d) * (d < radius + 0.02)
    # Thick drops look darker in the middle with a small wet highlight.
    lum -= 0.12 * (1 - smoothstep(0.0, radius, d))
    highlight = np.exp(-(((x - 0.42) ** 2 + (y - 0.4) ** 2) / 0.004))
    lum += 0.18 * highlight
    return np.clip(lum, 0, 1), alpha * 0.97


def pool(size, rng):
    blobs = []
    for _ in range(14):
        a = rng.random() * math.tau
        d = rng.random() * 0.17
        blobs.append((0.5 + math.cos(a) * d, 0.5 + math.sin(a) * d, 0.2 + rng.random() * 0.1, 1.0))
    for _ in range(6):
        a = rng.random() * math.tau
        d = 0.28 + rng.random() * 0.08
        blobs.append((0.5 + math.cos(a) * d, 0.5 + math.sin(a) * d, 0.06 + rng.random() * 0.05, 1.0))
    field = blob_field(size, blobs)
    noise = fbm(size, rng, base=5, octaves=5)
    field = field * (0.9 + 0.2 * noise)
    alpha = smoothstep(0.5, 0.58, field) * edge_mask(size)
    depth = blur(alpha, size / 14.0)
    # Thin edges are lighter and more saturated, the thick centre dark.
    lum = 1.0 - 0.38 * smoothstep(0.3, 1.0, depth)
    lum -= 0.08 * (fbm(size, rng, base=10, octaves=3) - 0.5)
    # Faint glossy streaks.
    gloss = fbm(size, rng, base=3, octaves=3)
    lum += 0.12 * smoothstep(0.62, 0.8, gloss) * (depth > 0.6)
    return np.clip(lum, 0.3, 1.0), alpha * 0.96


def footprint(size, rng):
    """Bloody sole print, toes towards +x (the walking direction): fading, smudged, uneven."""
    x, y = grid(size)
    sole = ellipse_field(size, 0.6, 0.5, 0.17, 0.11) * 1.3
    heel = ellipse_field(size, 0.27, 0.5, 0.1, 0.085) * 1.3
    field = np.maximum(sole, heel)
    # Toes / tread marks.
    for k in range(4):
        field = np.maximum(field, ellipse_field(size, 0.8 + 0.015 * (k % 2), 0.36 + k * 0.09, 0.035, 0.03) * 1.2)
    tread = 0.75 + 0.25 * np.sin(x * 70 + np.sin(y * 20) * 2)
    noise = fbm(size, rng, base=7, octaves=4)
    field = field * tread * (0.55 + 0.7 * noise)
    alpha = smoothstep(0.35, 0.55, field) * edge_mask(size)
    lum = 0.85 + 0.15 * noise
    return lum, alpha * 0.9


def trail(size, rng):
    """Blood running down a wall: starts at the top, ends in a bead (texture v grows downwards)."""
    x, y = grid(size)
    alpha = np.zeros((size, size))
    streams = [(0.5, 0.92, 0.07)] + [(0.5 + (rng.random() - 0.5) * 0.4, 0.45 + rng.random() * 0.35, 0.035) for _ in range(2)]
    for cx, length, width in streams:
        wiggle = 0.008 * np.sin(y * 9 + rng.random() * 6) + 0.004 * np.sin(y * 23)
        w = width * (1 - 0.5 * np.clip(y / length, 0, 1))
        core = np.exp(-((x - cx - wiggle) ** 2) / (2 * (w * 0.5) ** 2)) * (y < length)
        bead = np.exp(-(((x - cx - 0.02 * math.sin(length * 18)) ** 2) + (y - length) ** 2) / (2 * (width * 0.7) ** 2))
        alpha = np.maximum(alpha, core)
        alpha = np.maximum(alpha, bead)
    top = ellipse_field(size, 0.5, 0.08, 0.2, 0.08)
    alpha = np.maximum(alpha, top)
    alpha = smoothstep(0.35, 0.6, alpha) * edge_mask(size)
    lum = 0.85 + 0.15 * fbm(size, rng, base=8, octaves=3)
    return lum, alpha * 0.92


def particle_drop(size, rng):
    """Teardrop: round head at the bottom of the cell (leading edge), tail fading upwards."""
    x, y = grid(size)
    head = np.exp(-(((x - 0.5) ** 2) + (y - 0.72) ** 2) / (2 * 0.12 ** 2))
    width = 0.1 * np.clip((y - 0.1) / 0.62, 0, 1)
    tail = np.exp(-((x - 0.5) ** 2) / (2 * np.maximum(width, 1e-3) ** 2 * 0.5)) * smoothstep(0.08, 0.7, y) * (y < 0.74)
    alpha = np.clip(np.maximum(head, tail * 0.85), 0, 1)
    alpha = smoothstep(0.2, 0.75, alpha) * edge_mask(size)
    lum = 0.85 + 0.25 * np.exp(-(((x - 0.45) ** 2) + (y - 0.68) ** 2) / (2 * 0.04 ** 2))
    return np.clip(lum, 0, 1), alpha


def mist(size, rng):
    x, y = grid(size)
    d = np.sqrt((x - 0.5) ** 2 + (y - 0.5) ** 2)
    noise = fbm(size, rng, base=4, octaves=5)
    alpha = np.exp(-(d * d) / (2 * 0.2 ** 2)) * (0.55 + 0.6 * noise)
    alpha = np.clip(alpha, 0, 1) * edge_mask(size, 8)
    lum = 0.85 + 0.15 * noise
    return lum, alpha * 0.85


def chip(size, rng):
    x, y = grid(size)
    pts = []
    n = 6 + int(rng.random() * 3)
    for k in range(n):
        a = k / n * math.tau + (rng.random() - 0.5) * 0.6
        r = 0.22 + rng.random() * 0.16
        pts.append((0.5 + math.cos(a) * r, 0.5 + math.sin(a) * r))
    inside = np.ones((size, size), dtype=bool)
    for k in range(n):
        x0, y0 = pts[k]
        x1, y1 = pts[(k + 1) % n]
        inside &= ((x1 - x0) * (y - y0) - (y1 - y0) * (x - x0)) >= 0
    alpha = blur(inside.astype(float), 0.8) * edge_mask(size)
    lum = 0.75 + 0.25 * (1 - y) - 0.15 * fbm(size, rng, base=6)
    return np.clip(lum, 0, 1), alpha


def spark(size, rng):
    x, y = grid(size)
    core = np.exp(-((x - 0.5) ** 2) / (2 * 0.035 ** 2)) * smoothstep(0.05, 0.8, y) * smoothstep(0.98, 0.85, y)
    glow = np.exp(-(((x - 0.5) ** 2) / (2 * 0.12 ** 2) + ((y - 0.8) ** 2) / (2 * 0.12 ** 2)))
    alpha = np.clip(core + glow * 0.5, 0, 1) * edge_mask(size)
    return np.ones((size, size)), alpha


def build_decal_atlas(path):
    cell = 128
    atlas = np.zeros((cell * 4, cell * 4, 4), dtype=np.uint8)
    rng = np.random.default_rng(1337)
    generators = [
        lambda: splat(cell, rng, satellites=10, spikes=7),
        lambda: splat(cell, rng, satellites=16, spikes=4, core=0.2),
        lambda: splat(cell, rng, satellites=6, spikes=11, core=0.22),
        lambda: splat(cell, rng, satellites=20, spikes=2, core=0.26),
        lambda: spatter(cell, rng),
        lambda: spatter(cell, rng),
        lambda: drop(cell, rng),
        lambda: drop(cell, rng, crown=True),
        lambda: pool(cell, rng),
        lambda: pool(cell, rng),
        lambda: footprint(cell, rng),
        lambda: trail(cell, rng),
        lambda: particle_drop(cell, rng),
        lambda: mist(cell, rng),
        lambda: chip(cell, rng),
        lambda: spark(cell, rng),
    ]
    for index, generator in enumerate(generators):
        lum, alpha = generator()
        cx, cy = index % 4, index // 4
        atlas[cy * cell:(cy + 1) * cell, cx * cell:(cx + 1) * cell] = to_rgba_gray(lum, alpha)
    save(atlas, path)


# --------------------------------------------------------------------------- wound cells (64 px)

def lens(size, cx, cy, length, thickness, angle=0.0, curve=0.0, rng=None, ragged=0.0):
    """Signed-ish depth of a lens shaped slit: 1 on the centre line, 0 at the lips."""
    x, y = grid(size)
    c, s = math.cos(angle), math.sin(angle)
    dx, dy = x - cx, y - cy
    u = dx * c + dy * s
    v = -dx * s + dy * c
    v = v - curve * (u / (length / 2)) ** 2 * length * 0.25
    t = np.clip(u / (length / 2), -1, 1)
    half = thickness / 2 * np.sqrt(np.clip(1 - t * t, 0, 1)) ** 0.9
    if rng is not None and ragged > 0:
        half = half * (1 + ragged * (value_noise(size, 12, rng) - 0.5))
    inside = (np.abs(u) < length / 2)
    depth = np.clip(1 - np.abs(v) / np.maximum(half, 1e-4), 0, 1) * inside
    return depth, half, u, v


def wound_slash(size, rng, length=0.8, thickness=0.11, curve=0.0, angle=0.0, ragged=0.35, smear_amount=0.5):
    depth, half, u, v = lens(size, 0.5, 0.5, length, thickness, angle, curve, rng, ragged)
    # Lips: bright band just outside the slit, then a soft smear.
    dist = np.abs(v) - half
    lips = np.exp(-np.clip(dist, 0, None) / 0.018) * (np.abs(u) < length / 2 * 1.02)
    smear_field = blur((depth > 0).astype(float), size / 14.0) * smear_amount
    alpha = np.clip(np.maximum.reduce([depth > 0.02, lips * 0.95, smear_field * 0.9]), 0, 1).astype(float)
    alpha = np.maximum(alpha, smear_field * 0.8)
    alpha = np.clip(alpha + depth, 0, 1)
    # Small droplets around the cut.
    blobs = []
    for _ in range(6):
        a = rng.random() * math.tau
        r = 0.15 + rng.random() * 0.25
        blobs.append((0.5 + math.cos(a) * r, 0.5 + math.sin(a) * r * 0.6, 0.015 + rng.random() * 0.015, 1.0))
    droplets = smoothstep(0.4, 0.55, blob_field(size, blobs))
    alpha = np.maximum(alpha, droplets * 0.9)
    lum = np.ones((size, size)) * 0.95
    lum = lum - 0.82 * smoothstep(0.0, 0.6, depth)  # deep and dark inside
    lum = lum - 0.15 * (fbm(size, rng, base=8, octaves=3) - 0.5)
    alpha *= edge_mask(size, 2)
    return np.clip(lum, 0.05, 1), np.clip(alpha, 0, 1)


def wound_gash(size, rng):
    depth, half, u, v = lens(size, 0.5, 0.5, 0.86, 0.3, 0.0, 0.08, rng, 0.45)
    flesh = fbm(size, rng, base=10, octaves=4)
    lum = 0.95 - 0.55 * smoothstep(0.0, 0.3, depth) - 0.3 * smoothstep(0.5, 1.0, depth) + 0.25 * (flesh - 0.5) * (depth > 0)
    dist = np.abs(v) - half
    lips = np.exp(-np.clip(dist, 0, None) / 0.03) * (np.abs(u) < 0.45)
    smear_field = blur((depth > 0).astype(float), size / 10.0)
    alpha = np.clip(np.maximum.reduce([(depth > 0).astype(float), lips, smear_field * 0.85]), 0, 1)
    alpha *= edge_mask(size, 2)
    return np.clip(lum, 0.05, 1), alpha


def wound_puncture(size, rng, radius=0.12, tear=False):
    x, y = grid(size)
    d = np.sqrt((x - 0.5) ** 2 + (y - 0.5) ** 2)
    if tear:
        d = np.sqrt(((x - 0.5) * 0.6) ** 2 + (y - 0.5) ** 2)
    hole = smoothstep(radius, radius * 0.5, d)
    ring = smoothstep(radius * 2.2, radius, d)
    bruise = smoothstep(radius * 3.5, radius, d) * 0.45
    alpha = np.clip(np.maximum.reduce([hole, ring * 0.95, bruise]), 0, 1) * edge_mask(size, 2)
    lum = 0.95 - 0.55 * ring - 0.4 * hole
    return np.clip(lum, 0.03, 1), alpha


def wound_bite(size, rng):
    x, y = grid(size)
    alpha = np.zeros((size, size))
    lum = np.ones((size, size)) * 0.95
    for jaw, sign in ((0.36, 1), (0.64, -1)):
        for k in range(5):
            t = (k - 2) / 2.0
            cx = 0.5 + t * 0.28
            cy = jaw + sign * 0.06 * t * t
            d = np.sqrt((x - cx) ** 2 + (y - cy) ** 2)
            r = 0.04 + 0.015 * (1 - abs(t))
            hole = smoothstep(r, r * 0.4, d)
            ring = smoothstep(r * 2.0, r, d)
            alpha = np.maximum(alpha, np.maximum(hole, ring * 0.9))
            lum = lum - 0.6 * hole
    bruise = ellipse_field(size, 0.5, 0.5, 0.36, 0.2) * 0.35
    alpha = np.maximum(alpha, bruise) * edge_mask(size, 2)
    return np.clip(lum, 0.05, 1), np.clip(alpha, 0, 1)


def wound_claw(size, rng):
    lum = np.ones((size, size))
    alpha = np.zeros((size, size))
    for offset in (-0.2, 0.0, 0.2):
        l, a = wound_slash(size, rng, length=0.78, thickness=0.06, curve=0.15, ragged=0.3, smear_amount=0.25)
        shift = int(offset * size)
        l = np.roll(l, shift, axis=0)
        a = np.roll(a, shift, axis=0)
        lum = np.minimum(lum, np.where(a > 0.05, l, 1))
        alpha = np.maximum(alpha, a)
    alpha *= edge_mask(size, 2)
    return lum, alpha


def wound_bruise(size, rng, lobes=1):
    field = np.zeros((size, size))
    for k in range(lobes):
        cx = 0.5 + (rng.random() - 0.5) * 0.25 * (lobes - 1)
        cy = 0.5 + (rng.random() - 0.5) * 0.25 * (lobes - 1)
        field = np.maximum(field, ellipse_field(size, cx, cy, 0.42 + rng.random() * 0.06, 0.32 + rng.random() * 0.06, rng.random() * math.pi))
    noise = fbm(size, rng, base=5, octaves=4)
    alpha = np.clip(field * (0.6 + 0.6 * noise), 0, 1)
    alpha = smoothstep(0.1, 0.8, alpha) * edge_mask(size, 4)
    lum = 0.85 + 0.15 * fbm(size, rng, base=9, octaves=3) - 0.2 * smoothstep(0.6, 1.0, alpha)
    return np.clip(lum, 0, 1), alpha * 0.9


def wound_burn(size, rng):
    x, y = grid(size)
    field = ellipse_field(size, 0.5, 0.5, 0.34, 0.3, rng.random() * math.pi)
    noise = fbm(size, rng, base=6, octaves=5)
    shape = field * (0.55 + 0.7 * noise)
    alpha = smoothstep(0.25, 0.45, shape)
    blister = smoothstep(0.18, 0.28, shape) - alpha
    crust = fbm(size, rng, base=14, octaves=3)
    lum = 0.15 + 0.45 * crust * alpha + 0.85 * np.clip(blister, 0, 1)
    alpha = np.clip(alpha + np.clip(blister, 0, 1) * 0.6, 0, 1) * edge_mask(size, 2)
    return np.clip(lum, 0, 1), alpha


def wound_crack(size, rng):
    canvas = np.zeros((size, size))

    def walk(px, py, angle, length, width, depth):
        steps = int(length * size)
        for _ in range(steps):
            angle += (rng.random() - 0.5) * 0.6
            px += math.cos(angle) / size
            py += math.sin(angle) / size
            ix, iy = int(px * size), int(py * size)
            if 1 <= ix < size - 1 and 1 <= iy < size - 1:
                canvas[iy, ix] = 1.0
                if width > 1:
                    canvas[iy, ix + 1] = 1.0
            if depth < 2 and rng.random() < 0.06:
                walk(px, py, angle + (rng.random() - 0.5) * 2.0, length * 0.4, 1, depth + 1)

    for k in range(4):
        walk(0.5, 0.5, k / 4 * math.tau + rng.random(), 0.35 + rng.random() * 0.12, 2, 0)
    alpha = np.clip(blur(canvas, 0.6) * 2.5, 0, 1) * edge_mask(size, 2)
    return np.ones((size, size)), alpha


def wound_scratch(size, rng):
    x, y = grid(size)
    alpha = np.zeros((size, size))
    for k in range(4):
        cy = 0.35 + k * 0.1 + (rng.random() - 0.5) * 0.05
        slope = (rng.random() - 0.5) * 0.2
        line = np.exp(-((y - cy - slope * (x - 0.5)) ** 2) / (2 * 0.008 ** 2))
        span = smoothstep(0.1 + rng.random() * 0.1, 0.3, x) * smoothstep(0.9 - rng.random() * 0.1, 0.7, x)
        alpha = np.maximum(alpha, line * span)
    return np.ones((size, size)), np.clip(alpha, 0, 1) * edge_mask(size, 2)


def wound_trickle(size, rng):
    x, y = grid(size)
    alpha = np.zeros((size, size))
    for cx, length, width in ((0.5, 0.9, 0.12), (0.38, 0.6, 0.06), (0.62, 0.72, 0.07)):
        wiggle = 0.012 * np.sin(y * 7 + rng.random() * 6)
        w = width * (1 - 0.45 * y)
        stream = np.exp(-((x - cx - wiggle) ** 2) / (2 * (w * 0.45) ** 2)) * (y < length) * smoothstep(0.0, 0.12, y)
        bead = np.exp(-(((x - cx - 0.03 * math.sin(length * 14)) ** 2) + (y - length) ** 2) / (2 * (width * 0.55) ** 2))
        alpha = np.maximum(alpha, np.maximum(stream, bead))
    alpha = smoothstep(0.25, 0.6, alpha) * edge_mask(size, 2)
    lum = 0.9 + 0.1 * fbm(size, rng, base=8, octaves=3)
    return lum, alpha


def wound_smear(size, rng):
    field = ellipse_field(size, 0.5, 0.5, 0.36, 0.26) * (0.6 + 0.6 * fbm(size, rng, base=6))
    alpha = smoothstep(0.3, 0.8, field) * edge_mask(size, 3)
    return np.ones((size, size)) * 0.9, alpha * 0.8


def build_wound_atlas(path):
    cell = 64
    atlas = np.zeros((cell * 4, cell * 4, 4), dtype=np.uint8)
    rng = np.random.default_rng(4242)
    generators = [
        lambda: wound_slash(cell, rng),
        lambda: wound_slash(cell, rng, length=0.72, thickness=0.13, curve=0.2, ragged=0.5),
        lambda: wound_gash(cell, rng),
        lambda: wound_puncture(cell, rng),
        lambda: wound_bite(cell, rng),
        lambda: wound_claw(cell, rng),
        lambda: wound_bruise(cell, rng, 1),
        lambda: wound_bruise(cell, rng, 2),
        lambda: wound_burn(cell, rng),
        lambda: wound_burn(cell, rng),
        lambda: wound_crack(cell, rng),
        lambda: wound_scratch(cell, rng),
        lambda: wound_trickle(cell, rng),
        lambda: wound_smear(cell, rng),
        lambda: wound_puncture(cell, rng, radius=0.09, tear=True),
        lambda: (np.ones((cell, cell)), np.zeros((cell, cell))),
    ]
    for index, generator in enumerate(generators):
        lum, alpha = generator()
        cx, cy = index % 4, index // 4
        atlas[cy * cell:(cy + 1) * cell, cx * cell:(cx + 1) * cell] = to_rgba_gray(lum, alpha)
    save(atlas, path)


# --------------------------------------------------------------------------- coloured textures

def build_screen_blood(path):
    size = 512
    rng = np.random.default_rng(99)
    x, y = grid(size)
    alpha = np.zeros((size, size))
    # Splats hugging the edges and corners.
    for _ in range(26):
        side = rng.integers(4)
        t = rng.random()
        inset = rng.random() * 0.08
        cx, cy = [(t, inset), (1 - inset, t), (t, 1 - inset), (inset, t)][side]
        lum, a = splat(160, rng, satellites=int(8 + rng.random() * 10), spikes=int(3 + rng.random() * 6), core=0.18 + rng.random() * 0.08)
        scale = int(size * (0.18 + rng.random() * 0.22))
        img = Image.fromarray((a * 255).astype(np.uint8)).resize((scale, scale), Image.BILINEAR)
        arr = np.asarray(img).astype(float) / 255.0
        x0 = int(cx * size - scale / 2)
        y0 = int(cy * size - scale / 2)
        xs, ys = max(0, x0), max(0, y0)
        xe, ye = min(size, x0 + scale), min(size, y0 + scale)
        alpha[ys:ye, xs:xe] = np.maximum(alpha[ys:ye, xs:xe], arr[ys - y0:ye - y0, xs - x0:xe - x0])
    # Runs from the top edge.
    for _ in range(9):
        cx = rng.random()
        length = 0.08 + rng.random() * 0.25
        width = 0.004 + rng.random() * 0.007
        run = np.exp(-((x - cx) ** 2) / (2 * width ** 2)) * (y < length)
        bead = np.exp(-(((x - cx) ** 2) + (y - length) ** 2) / (2 * (width * 1.6) ** 2))
        alpha = np.maximum(alpha, np.clip(run + bead, 0, 1))
    # Vignette: keep the centre of the screen clear.
    d = np.sqrt((x - 0.5) ** 2 + (y - 0.5) ** 2)
    alpha *= smoothstep(0.18, 0.5, d)
    noise = fbm(size, rng, base=6, octaves=4)
    depth = blur(alpha, 4)
    r = 0.55 - 0.25 * depth + 0.08 * (noise - 0.5)
    g = 0.02 + 0.02 * noise
    b = 0.02 + 0.015 * noise
    rgba = np.zeros((size, size, 4), dtype=np.uint8)
    rgba[..., 0] = (np.clip(r, 0, 1) * 255).astype(np.uint8)
    rgba[..., 1] = (np.clip(g, 0, 1) * 255).astype(np.uint8)
    rgba[..., 2] = (np.clip(b, 0, 1) * 255).astype(np.uint8)
    rgba[..., 3] = (np.clip(alpha * 0.92, 0, 1) * 255).astype(np.uint8)
    save(rgba, path)


DROP_ICON = [
    "........#.........",
    ".......#r#........",
    ".......#r#........",
    "......#rrr#.......",
    "......#rrr#.......",
    ".....#rrrrr#......",
    ".....#rhrrr#......",
    "....#rhrrrrr#.....",
    "....#rhrrrrr#.....",
    "...#rhrrrrrrr#....",
    "...#rrrrrrrrd#....",
    "...#rrrrrrrrd#....",
    "...#rrrrrrrdd#....",
    "....#rrrrrddd#....",
    "....#ddrrddd#.....",
    ".....##dddd##.....",
    ".......####.......",
    "..................",
]


def build_effect_icon(path):
    palette = {"#": (40, 0, 0, 255), "r": (176, 12, 12, 255), "h": (238, 120, 110, 255), "d": (110, 4, 4, 255), ".": (0, 0, 0, 0)}
    rgba = np.zeros((18, 18, 4), dtype=np.uint8)
    for yy, row in enumerate(DROP_ICON):
        for xx, ch in enumerate(row):
            rgba[yy, xx] = palette[ch]
    save(rgba, path)


def build_mod_icon(path):
    size = 128
    rng = np.random.default_rng(7)
    x, y = grid(size)
    background = np.stack([0.08 + 0.05 * fbm(size, rng, base=3)] * 3, axis=-1)
    lum, alpha = splat(size, rng, satellites=14, spikes=8, core=0.25)
    blood = np.stack([0.55 * lum + 0.05, 0.02 * lum, 0.02 * lum], axis=-1)
    image = background * (1 - alpha[..., None]) + blood * alpha[..., None]
    # Slash across the splat.
    depth, half, u, v = lens(size, 0.5, 0.5, 0.85, 0.07, -0.6)
    image = np.where((depth > 0)[..., None], image * 0.2, image)
    rgba = np.zeros((size, size, 4), dtype=np.uint8)
    rgba[..., :3] = (np.clip(image, 0, 1) * 255).astype(np.uint8)
    rgba[..., 3] = 255
    save(rgba, path)


def save(array, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    Image.fromarray(array, "RGBA").save(path, optimize=True)
    print("wrote", os.path.relpath(path))


if __name__ == "__main__":
    build_decal_atlas(os.path.join(ROOT, "decal", "blood.png"))
    build_wound_atlas(os.path.join(ROOT, "entity", "wounds.png"))
    build_screen_blood(os.path.join(ROOT, "gui", "screen_blood.png"))
    build_effect_icon(os.path.join(ROOT, "mob_effect", "bleeding.png"))
    build_mod_icon(os.path.join(ROOT, "..", "icon.png"))
