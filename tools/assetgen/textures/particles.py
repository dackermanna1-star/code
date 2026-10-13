"""Particle sprites (ASSET_SPEC 3.4).

smoke_0..3   16x16  soft grey puffs, growing and fading frame to frame
spark_0..1    8x8   bright yellow-orange star / streak
bullet_hole_0..2 16x16  dark crater, lighter cracked rim, transparent background (decal)
casing_brass  8x8   ejected brass casing
casing_shell  8x8   ejected red shotgun hull
impact_flash 16x16  short bright burst
"""
from __future__ import annotations

import math

import numpy as np

from texlib import TAU, grid_sprite, rng, save, smoothstep


def quant(a, levels):
    return np.round(a * (levels - 1)) / (levels - 1)


def smoke(frame, seed=601):
    g = rng(seed)  # same seed for every frame: the puff keeps its shape while it grows
    blobs = [(g.uniform(-1, 1), g.uniform(-1, 1), g.uniform(0.55, 1.0)) for _ in range(6)]
    grow = [0.50, 0.68, 0.85, 1.0][frame]
    dens = [0.92, 0.80, 0.62, 0.42][frame]
    R = 6.6 * grow
    n2 = rng(seed + 10 + frame)
    tex = n2.random((16, 16))
    yy, xx = np.mgrid[0:16, 0:16] + 0.5
    d = np.zeros((16, 16))
    for bx, by, br in blobs:
        cx = 8 + bx * R * 0.45
        cy = 8 + by * R * 0.45
        r = R * 0.62 * br
        d = np.maximum(d, 1 - np.hypot(xx - cx, yy - cy) / max(r, 0.5))
    core = 1 - np.hypot(xx - 8, yy - 8) / R
    density = np.clip(np.maximum(d, core) * 1.5, 0, 1)
    # ragged, broken-up edges in later frames
    density = density * (1 - (tex - 0.5) * (0.25 + 0.25 * frame))
    alpha = quant(np.clip(smoothstep(0.05, 0.75, density), 0, 1) * dens, 7)
    # lit from top-left: lighter top-left, greyer bottom-right
    light = np.clip(0.5 + ((8 - xx) + (8 - yy)) / (R * 2.2), 0, 1)
    shade = quant(np.clip(0.35 + 0.45 * light + 0.2 * density, 0, 1), 5)
    grey = 150 + shade * 92
    rgb = np.stack([grey, grey, grey + 4], axis=-1)
    out = np.zeros((16, 16, 4))
    out[..., :3] = np.clip(rgb, 0, 255)
    out[..., 3] = alpha * 255
    out[alpha <= 0] = 0
    return out


SPARK_PAL = {"W": "#fffbe8", "Y": "#ffe36a", "O": "#ffaa2a", "R": "#ff6a1a",
             "o": (255, 170, 42, 150), "r": (255, 106, 26, 110), "y": (255, 227, 106, 170)}
SPARK_0 = [
    "...r....",
    "...O....",
    ".o.Y.o..",
    "rOYWYOr.",
    ".o.Y.o..",
    "...O....",
    "...r....",
    "........",
]
SPARK_1 = [
    "........",
    "......YW",
    ".....yYY",
    "....oO..",
    "...oO...",
    "..rO....",
    ".r......",
    "r.......",
]


def bullet_hole(idx):
    g = rng(611 + idx)
    r0 = [2.3, 2.0, 2.6][idx]
    rim = r0 + 1.4
    yy, xx = np.mgrid[0:16, 0:16] + 0.5
    cx, cy = 8 + g.uniform(-0.3, 0.3), 8 + g.uniform(-0.3, 0.3)
    dx, dy = xx - cx, yy - cy
    r = np.hypot(dx, dy)
    th = np.arctan2(dy, dx)
    # angular roughness
    k = np.zeros_like(th)
    for f in range(2, 7):
        k += g.uniform(-0.25, 0.25) / f * 2 * np.cos(f * th + g.uniform(0, TAU))
    rr = r / (1 + k * 0.5)
    out = np.zeros((16, 16, 4))
    noise = g.random((16, 16))
    # outer chipped rim: lighter fragments
    outer = (rr > rim - 0.2) & (rr < rim + 1.6) & (noise > 0.35)
    out[outer] = (120, 114, 106, 150)
    lite = outer & (noise > 0.75)
    out[lite] = (160, 154, 146, 185)
    # cracks: radial jagged lines
    n_cracks = [5, 4, 6][idx]
    for i in range(n_cracks):
        a = TAU * i / n_cracks + g.uniform(-0.4, 0.4)
        length = g.uniform(rim + 1.2, 7.3)
        x, y = cx + math.cos(a) * (r0 + 0.5), cy + math.sin(a) * (r0 + 0.5)
        steps = int(length * 2)
        for s_ in range(steps):
            a += g.uniform(-0.35, 0.35)
            x += math.cos(a) * 0.5
            y += math.sin(a) * 0.5
            if math.hypot(x - cx, y - cy) > length:
                break
            xi, yi = int(x), int(y)
            if 0 <= xi < 16 and 0 <= yi < 16:
                fade = 1 - math.hypot(x - cx, y - cy) / (length + 1)
                out[yi, xi] = (34, 31, 28, int(150 + 90 * fade))
    # scorched dark ring + crater
    ring = rr < rim
    out[ring] = (52, 48, 44, 235)
    ring2 = rr < r0 + 0.6
    out[ring2] = (30, 28, 26, 250)
    crater = rr < r0
    out[crater] = (14, 12, 11, 255)
    # inner lip highlight on the lower-right (light from top-left falls inside the crater)
    lip = (rr >= r0 - 0.2) & (rr < r0 + 0.8) & (dx + dy > 1.2)
    out[lip] = (88, 82, 76, 245)
    out[(r < 1.0)] = (6, 5, 5, 255)
    return out


CASING_BRASS = [
    "........",
    ".....KK.",
    "....KphK",
    "...KpBhK",
    "..KpBdK.",
    ".KrBdK..",
    ".KrrK...",
    "..KK....",
]
CASING_SHELL = [
    "........",
    ".....KK.",
    "....KxQK",
    "...KxXQK",
    "..KxXzK.",
    ".KpBzK..",
    ".KrrK...",
    "..KK....",
]
CASE_PAL = {"K": "#3a2a12", "r": "#9c7426", "p": "#fff0b8", "b": "#f0cd72", "B": "#cfa043", "d": "#a87a2a",
            "h": "#3a2810", "x": "#e5524a", "X": "#b8262a", "z": "#7c1418", "Q": "#6a1015"}


def impact_flash():
    """Pixel star burst: crisp rays over a soft warm halo."""
    g = rng(631)
    yy, xx = np.mgrid[0:16, 0:16] + 0.5
    r = np.hypot(xx - 8, yy - 8)
    out = np.zeros((16, 16, 4))
    halo = np.clip(1 - r / 6.0, 0, 1) ** 1.6
    out[..., :3] = (255, 150, 50)
    out[..., 3] = halo * 150
    cols = [(255, 255, 245, 255), (255, 246, 190, 255), (255, 222, 110, 245), (255, 186, 60, 225),
            (255, 145, 40, 190), (250, 105, 30, 150), (240, 80, 25, 105), (230, 70, 20, 70)]
    for i in range(8):
        a = TAU * i / 8 + g.uniform(-0.12, 0.12) + 0.2
        ln = (7.4 if i % 2 == 0 else 4.6) + g.uniform(-0.8, 0.6)
        steps = int(ln * 3)
        for s_ in range(steps + 1):
            d = ln * s_ / steps
            x, y = 8 + math.cos(a) * d, 8 + math.sin(a) * d
            xi, yi = int(math.floor(x)), int(math.floor(y))
            if 0 <= xi < 16 and 0 <= yi < 16:
                c = cols[min(len(cols) - 1, int(d * len(cols) / 8.0))]
                if c[3] > out[yi, xi, 3] or d < 2:
                    out[yi, xi] = c
    core = r < 1.6
    out[core] = (255, 255, 250, 255)
    ring = (r >= 1.6) & (r < 2.6) & (out[..., 3] < 240)
    out[ring] = (255, 236, 160, 240)
    return out


def generate():
    out = []
    for i in range(4):
        save(f"particle/smoke_{i}", smoke(i), (16, 16))
        out.append(f"particle/smoke_{i}")
    save("particle/spark_0", grid_sprite(SPARK_0, SPARK_PAL), (8, 8))
    save("particle/spark_1", grid_sprite(SPARK_1, SPARK_PAL), (8, 8))
    out += ["particle/spark_0", "particle/spark_1"]
    for i in range(3):
        save(f"particle/bullet_hole_{i}", bullet_hole(i), (16, 16))
        out.append(f"particle/bullet_hole_{i}")
    save("particle/casing_brass", grid_sprite(CASING_BRASS, CASE_PAL), (8, 8))
    save("particle/casing_shell", grid_sprite(CASING_SHELL, CASE_PAL), (8, 8))
    save("particle/impact_flash", impact_flash(), (16, 16))
    out += ["particle/casing_brass", "particle/casing_shell", "particle/impact_flash"]
    return out
