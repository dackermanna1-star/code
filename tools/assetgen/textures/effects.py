"""Direct (non-atlased) effect textures (ASSET_SPEC 3.5). RGBA, drawn additively / translucent.

muzzle_front_0..2  64x64  head-on star-burst: white-hot core -> yellow -> orange, jagged petals
muzzle_side_0..2   64x32  side view flash cone, muzzle on the left pointing right
tracer             16x64  vertical glowing streak, bright head at the top fading downwards
These are soft by design (anti-aliased via 4x4 supersampling) with fully transparent borders.
"""
from __future__ import annotations

import numpy as np

from texlib import TAU, ramp, rng, save, supersample

FLASH_STOPS = [
    (0.00, (255, 70, 10, 0)),
    (0.10, (255, 96, 18, 70)),
    (0.28, (255, 146, 34, 175)),
    (0.50, (255, 196, 66, 230)),
    (0.70, (255, 232, 136, 250)),
    (0.86, (255, 250, 214, 255)),
    (1.00, (255, 255, 255, 255)),
]


def muzzle_front(idx):
    g = rng(701 + idx)
    n = [5, 6, 4][idx]
    ph = g.uniform(0, TAU)
    lens = g.uniform(0.75, 1.0, size=n)
    jag_coeffs = [(k, g.uniform(-1, 1) / (k ** 0.7), g.uniform(0, TAU)) for k in range(6, 22)]
    inner_ph = ph + np.pi / n

    def fn(X, Y):
        dx, dy = X - 32, Y - 32
        r = np.hypot(dx, dy)
        th = np.arctan2(dy, dx)
        rel = (th - ph) % TAU
        petal_idx = np.floor(rel / (TAU / n) + 0.5).astype(int) % n
        p = np.abs(np.cos(n * (th - ph) / 2)) ** 4
        jag = np.zeros_like(th)
        for k, a, phi in jag_coeffs:
            jag += a * np.cos(k * th + phi)
        R1 = 6.5 + 22.5 * p * lens[petal_idx] + 1.8 * jag
        p2 = np.abs(np.cos(n * (th - inner_ph) / 2)) ** 3
        R2 = 6.0 + 9.0 * p2 + 1.2 * jag
        R = np.maximum(np.maximum(R1, R2), 3.0)
        t = np.clip(1 - r / R, 0, 1)
        inten = t ** 0.85
        core = np.exp(-(r ** 2) / (2 * 4.2 ** 2))
        inten = np.clip(np.maximum(inten * 0.92, core) + 0.12 * core, 0, 1)
        # fine streaks inside petals
        streak = 0.06 * np.cos(31 * th + idx) * t
        inten = np.clip(inten + streak, 0, 1)
        col = ramp(inten, FLASH_STOPS)
        # soft outer halo, faint
        halo = np.clip(1 - r / 30.0, 0, 1) ** 2.2 * 55
        col[..., 3] = np.maximum(col[..., 3], halo)
        edge = np.clip((31.5 - np.maximum(np.abs(dx), np.abs(dy))) / 2.0, 0, 1)
        col[..., 3] *= edge
        return col

    return supersample(fn, 64, 64, 4)


def muzzle_side(idx):
    g = rng(711 + idx)
    um = [0.36, 0.30, 0.42][idx]
    wmax = [10.5, 11.5, 9.5][idx]
    tip = [0.93, 0.86, 0.97][idx]
    top_n = [(k, g.uniform(-1, 1) / k ** 0.6, g.uniform(0, TAU)) for k in range(3, 14)]
    bot_n = [(k, g.uniform(-1, 1) / k ** 0.6, g.uniform(0, TAU)) for k in range(3, 14)]
    lobes = [(g.uniform(0.08, 0.16), s * g.uniform(0.55, 0.85), g.uniform(10, 16)) for s in (-1, 1)]

    def profile(u):
        rise = np.clip(u / um, 0, 1) ** 0.55
        fall = np.clip((tip - u) / (tip - um), 0, 1) ** 0.9
        w = np.where(u < um, 2.6 + (wmax - 2.6) * rise, wmax * fall)
        return w

    def fn(X, Y):
        u = X / 64.0
        v = Y - 16.0
        w = profile(u)
        nt = np.zeros_like(u)
        nb = np.zeros_like(u)
        for k, a, phi in top_n:
            nt += a * np.cos(TAU * k * u + phi)
        for k, a, phi in bot_n:
            nb += a * np.cos(TAU * k * u + phi)
        wt = np.maximum(w * (1 + 0.32 * nt), 0.01)
        wb = np.maximum(w * (1 + 0.32 * nb), 0.01)
        ws = np.where(v < 0, wt, wb)
        t = np.clip(1 - np.abs(v) / ws, 0, 1)
        along = np.clip(1.15 - u * 0.95, 0, 1)
        inten = (t ** 0.8) * along
        core = np.exp(-(v ** 2) / (2 * (0.30 * np.maximum(w, 1.5)) ** 2)) * np.clip(1 - u / (tip * 0.8), 0, 1)
        inten = np.maximum(inten, core * 1.05)
        # side jets near the muzzle
        for uc, slope, ln in lobes:
            x0 = uc * 64
            dx = X - x0
            ax = dx / np.sqrt(1 + slope ** 2) + v * slope / np.sqrt(1 + slope ** 2)
            perp = (v - dx * slope) / np.sqrt(1 + slope ** 2)
            lw = 2.6 * np.clip(1 - ax / ln, 0, 1) * np.clip(ax / 3 + 0.3, 0, 1)
            lt = np.clip(1 - np.abs(perp) / np.maximum(lw, 0.01), 0, 1) * (ax > -1) * np.clip(1 - ax / ln, 0, 1)
            inten = np.maximum(inten, lt ** 0.8 * 0.8)
        # muzzle hot spot
        hot = np.exp(-(((X - 2.5) / 4.0) ** 2 + (v / 3.0) ** 2))
        inten = np.clip(np.maximum(inten, hot), 0, 1)
        col = ramp(inten, FLASH_STOPS)
        halo = np.exp(-(v ** 2) / (2 * (w * 0.9 + 2) ** 2)) * np.clip(1 - u / tip, 0, 1) * 45
        col[..., 3] = np.maximum(col[..., 3], halo)
        # keep borders transparent (fade right & top/bottom); left edge is the muzzle
        edge = np.clip((63.5 - X) / 3, 0, 1) * np.clip((15.5 - np.abs(v)) / 2, 0, 1) * np.clip(X / 1.5, 0, 1)
        col[..., 3] *= edge
        return col

    return supersample(fn, 64, 32, 4)


def tracer():
    def fn(X, Y):
        dx = X - 8.0
        head = 3.0
        along = np.where(Y < head, np.clip(Y / head, 0, 1) ** 0.6, np.clip(1 - (Y - head) / (64 - head), 0, 1) ** 1.4)
        taper = 1 - 0.55 * np.clip((Y - head) / 60, 0, 1)  # streak narrows toward the tail
        core = np.exp(-(dx ** 2) / (2 * (0.9 * taper) ** 2))
        glow = np.exp(-(dx ** 2) / (2 * (2.6 * taper) ** 2)) * 0.55
        outer = np.exp(-(dx ** 2) / (2 * (4.5 * taper) ** 2)) * 0.18
        inten = np.clip((core + glow + outer) * along, 0, 1)
        mixc = np.clip(core / (core + glow + outer + 1e-6), 0, 1)
        col = np.zeros(X.shape + (4,))
        warm = np.array([255, 150, 50], float)
        hot = np.array([255, 250, 225], float)
        for ch in range(3):
            col[..., ch] = warm[ch] + (hot[ch] - warm[ch]) * mixc
        col[..., 3] = inten * 255
        col[..., 3] *= np.clip((7.9 - np.abs(dx)) / 1.5, 0, 1)
        return col

    return supersample(fn, 16, 64, 4)


def generate():
    out = []
    for i in range(3):
        save(f"effect/muzzle_front_{i}", muzzle_front(i), (64, 64))
        save(f"effect/muzzle_side_{i}", muzzle_side(i), (64, 32))
        out += [f"effect/muzzle_front_{i}", f"effect/muzzle_side_{i}"]
    save("effect/tracer", tracer(), (16, 64))
    out.append("effect/tracer")
    return out
