"""Procedural sky-body textures (Celestial.texture generator names) with transparency.

Generators (colors = palette list, dark -> light; seed = string):
  planet         banded/noisy sphere, terminator shading, atmosphere glow
  ringed_planet  planet with a tilted ring passing in front of / behind it
  gas_giant      strongly banded planet with a storm spot
  moon           grey cratered moon (colors tint it)
  sun            coloured sun disk with corona (draw additive for best results)
  twin_suns      two suns of different size/colour in one sprite
  nebula         soft multi-colour cloud
  aurora         wide band of hanging light curtains
  eye            a giant eye in the sky (iris colors[0..2], sclera colors[3] optional)
  comet          bright head with a long tail
  retro_sun      synthwave striped sun (colors top -> bottom)
  galaxy         spiral galaxy with star sprinkles
  black_hole     dark disc with glowing accretion ring
  shattered_moon moon broken into drifting chunks
"""
from __future__ import annotations

import math

import numpy as np
from PIL import Image

from gen.noise import fbm, rng


def _rgb(c):
    h = c.strip().lstrip("#")
    if len(h) == 3:
        h = "".join(ch * 2 for ch in h)
    if len(h) == 8:
        h = h[2:]
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], float)


def _ramp(colors, t):
    """Map t (0..1 array) through the palette."""
    cols = np.array([_rgb(c) for c in colors]) if colors else np.array([[128, 128, 128]], float)
    if len(cols) == 1:
        cols = np.stack([cols[0] * 0.5, cols[0], np.minimum(cols[0] * 1.4 + 30, 255)])
    t = np.clip(t, 0, 1) * (len(cols) - 1)
    i = np.clip(np.floor(t).astype(int), 0, len(cols) - 2)
    f = (t - i)[..., None]
    return cols[i] * (1 - f) + cols[i + 1] * f


def _quant(rgb, levels=24):
    return np.round(rgb / 255.0 * levels) / levels * 255.0


def _img(rgb, alpha):
    a = np.zeros(rgb.shape[:2] + (4,), float)
    a[..., :3] = np.clip(rgb, 0, 255)
    a[..., 3] = np.clip(alpha, 0, 1) * 255
    a[a[..., 3] < 4] = 0
    return Image.fromarray(a.astype(np.uint8), "RGBA")


def _grid(n):
    c = (np.arange(n) + 0.5) / n * 2 - 1
    X, Y = np.meshgrid(c, c)
    return X, Y


def _noise(n, cell, seed, octaves=4):
    return fbm(n, n, cell, seed, octaves=octaves)


def _sphere_shade(X, Y, r, light=(-0.6, -0.5)):
    rr = (X * X + Y * Y) / (r * r)
    z = np.sqrt(np.clip(1 - rr, 0, 1))
    nx, ny = X / r, Y / r
    lx, ly = light
    lz = math.sqrt(max(0.0, 1 - lx * lx - ly * ly))
    lam = np.clip(nx * lx + ny * ly + z * lz, 0, 1)
    return rr, z, lam


def planet(colors, seed="planet", size=96, bands=True, craters=False, atmosphere=True):
    n = size
    X, Y = _grid(n)
    r = 0.78
    rr, z, lam = _sphere_shade(X, Y, r)
    inside = rr <= 1
    R = rng(f"planet:{seed}")
    tilt = R.uniform(-0.5, 0.5)
    v = Y * math.cos(tilt) + X * math.sin(tilt)
    nz = _noise(n, max(4, n // 6), seed + ":n")
    nz2 = _noise(n, max(3, n // 12), seed + ":m", octaves=3)
    if bands:
        t = 0.5 + 0.35 * np.sin(v / r * (6 + R.uniform(0, 5)) + nz * 4) + 0.25 * (nz2 - 0.5)
    else:
        t = nz * 0.8 + nz2 * 0.4 - 0.1
    col = _ramp(colors, np.clip(t, 0, 1))
    if craters:
        for _ in range(int(10 + size / 10)):
            cx, cy = R.uniform(-0.6, 0.6), R.uniform(-0.6, 0.6)
            cr = R.uniform(0.04, 0.16)
            d = np.hypot(X - cx, Y - cy) / cr
            col *= np.where(d < 1, 0.78 + 0.18 * d, 1.0)[..., None]
            col *= np.where((d >= 1) & (d < 1.2), 1.12, 1.0)[..., None]
    shade = 0.18 + 0.95 * lam
    col = col * shade[..., None]
    alpha = inside.astype(float)
    if atmosphere:
        glow_col = _ramp(colors, np.ones_like(X) * 0.95)
        d = np.sqrt(rr) * r
        halo = np.clip(1 - (d - r) / 0.16, 0, 1) ** 2 * (d > r)
        rim = np.clip((np.sqrt(rr) - 0.82) / 0.18, 0, 1) * inside
        col = np.where(inside[..., None], col * (1 - 0.5 * rim[..., None]) + glow_col * 0.5 * rim[..., None], glow_col)
        alpha = np.maximum(alpha, halo * 0.75)
    return _img(_quant(col), alpha)


def gas_giant(colors, seed="gas", size=112):
    img = planet(colors, seed, size, bands=True)
    a = np.asarray(img, float).copy()
    n = size
    X, Y = _grid(n)
    R = rng(f"spot:{seed}")
    cx, cy = R.uniform(-0.3, 0.3), R.uniform(0.05, 0.35)
    d = ((X - cx) / 0.17) ** 2 + ((Y - cy) / 0.09) ** 2
    spot = (d < 1) & (a[..., 3] > 200)
    sc = _rgb(colors[-1] if colors else "#ffffff") * 0.9
    a[spot, :3] = a[spot, :3] * 0.4 + sc * 0.6 * np.clip(1.2 - d[spot], 0.3, 1)[..., None]
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "RGBA")


def ringed_planet(colors, seed="ringed", size=128):
    n = size
    body = np.asarray(planet(colors, seed, n, bands=True, atmosphere=False).resize((n, n)), float)
    # shrink the planet a bit inside a larger canvas
    canvas = np.zeros((n, n, 4), float)
    small = Image.fromarray(body.astype(np.uint8), "RGBA").resize((int(n * 0.62), int(n * 0.62)), Image.LANCZOS)
    off = (n - small.width) // 2
    canvas[off:off + small.height, off:off + small.width] = np.asarray(small, float)
    X, Y = _grid(n)
    R = rng(f"ring:{seed}")
    tilt = R.uniform(-0.45, -0.2)
    ca, sa = math.cos(tilt), math.sin(tilt)
    xr = X * ca - Y * sa
    yr = X * sa + Y * ca
    e = np.hypot(xr, yr / 0.28)
    ring = (e > 0.52) & (e < 0.95)
    bands = 0.6 + 0.4 * np.sin(e * 60 + R.uniform(0, 6))
    gap = (e > 0.70) & (e < 0.74)
    rcol = _ramp(colors[::-1] if colors else ["#ddccaa"], np.clip((e - 0.5) / 0.45, 0, 1)) * bands[..., None]
    ralpha = ring * (~gap) * (0.55 + 0.4 * bands)
    front = yr > 0   # lower half of the ring passes in front of the planet
    out = canvas.copy()
    behind = ring & ~front & (canvas[..., 3] < 10)
    out[behind, :3] = rcol[behind]
    out[behind, 3] = ralpha[behind] * 255
    fr = ring & front
    a = ralpha[fr][..., None]
    out[fr, :3] = canvas[fr, :3] * (1 - a) + rcol[fr] * a
    out[fr, 3] = np.maximum(canvas[fr, 3], ralpha[fr] * 255)
    rgb = _quant(out[..., :3])
    return _img(rgb, out[..., 3] / 255.0)


def moon(colors, seed="moon", size=64):
    cols = colors or ["#5a5a62", "#9a9aa4", "#d8d8e0"]
    return planet(cols, seed, size, bands=False, craters=True, atmosphere=False)


def sun(colors, seed="sun", size=96):
    n = size
    X, Y = _grid(n)
    d = np.hypot(X, Y)
    cols = colors or ["#ff8a00", "#ffd040", "#fff8d0"]
    core = d < 0.42
    t = np.clip(1 - d / 0.42, 0, 1)
    nz = _noise(n, max(3, n // 10), seed)
    col_core = _ramp(cols, 0.55 + 0.45 * t + 0.15 * (nz - 0.5))
    ang = np.arctan2(Y, X)
    R = rng(f"sun:{seed}")
    rays = 0.5 + 0.5 * np.sin(ang * R.integers(7, 13) + R.uniform(0, 6)) * np.sin(ang * 3 + 1)
    corona = np.clip(1 - (d - 0.42) / (0.55 + 0.1 * rays), 0, 1) ** 2.2 * (~core)
    col_cor = _ramp(cols, 0.3 + 0.4 * corona)
    col = np.where(core[..., None], col_core, col_cor)
    alpha = np.where(core, 1.0, corona * 0.9)
    return _img(_quant(col), alpha)


def twin_suns(colors, seed="twin", size=128):
    n = size
    a = np.asarray(sun(colors[:3] or ["#ff6a00", "#ffc040", "#fff0c0"], seed + "a", int(n * 0.62)), float)
    b_cols = colors[3:6] if len(colors) >= 6 else ["#2060ff", "#60b0ff", "#e0f0ff"]
    b = np.asarray(sun(b_cols, seed + "b", int(n * 0.42)), float)
    out = np.zeros((n, n, 4), float)
    out[0:a.shape[0], 0:a.shape[1]] = a
    oy, ox = n - b.shape[0] - 4, n - b.shape[1] - 2
    region = out[oy:oy + b.shape[0], ox:ox + b.shape[1]]
    ab = b[..., 3:4] / 255.0
    region[..., :3] = region[..., :3] * (1 - ab) + b[..., :3] * ab
    region[..., 3] = np.maximum(region[..., 3], b[..., 3])
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGBA")


def nebula(colors, seed="nebula", size=128):
    n = size
    X, Y = _grid(n)
    d = np.hypot(X * 0.9, Y * 1.2)
    n1 = _noise(n, n // 4, seed + ":a", octaves=5)
    n2 = _noise(n, n // 6, seed + ":b", octaves=4)
    dens = np.clip((n1 - 0.35) * 2.2 - d * 0.9 + 0.5, 0, 1)
    cols = colors or ["#30105a", "#a03cc0", "#ff80c0", "#ffe0f0"]
    col = _ramp(cols, np.clip(n2 * 0.9 + dens * 0.3, 0, 1))
    alpha = dens ** 1.3 * np.clip(1.15 - d, 0, 1) * 0.85
    R = rng(f"neb:{seed}")
    stars = R.random((n, n)) > 0.992
    col[stars] = 255
    alpha = np.where(stars, np.maximum(alpha, 0.9), alpha)
    return _img(_quant(col), alpha)


def aurora(colors, seed="aurora", size=128):
    w, h = size, size // 2
    xs = np.linspace(0, 1, w)
    ys = np.linspace(0, 1, h)
    X, Y = np.meshgrid(xs, ys)
    R = rng(f"aur:{seed}")
    wave = 0.35 + 0.12 * np.sin(X * 9 + R.uniform(0, 6)) + 0.06 * np.sin(X * 23 + R.uniform(0, 6))
    curt = np.clip(1 - np.abs(Y - wave) / 0.42, 0, 1)
    streak = 0.55 + 0.45 * np.sin(X * 140 + 3 * np.sin(X * 17)) ** 2
    fade_bottom = np.clip((Y - wave + 0.4) / 0.4, 0, 1)
    edge = np.clip(np.minimum(X, 1 - X) / 0.15, 0, 1)
    alpha = curt * streak * fade_bottom * edge * 0.8
    cols = colors or ["#20ff90", "#60ffd0", "#a060ff"]
    col = _ramp(cols, np.clip((Y - wave + 0.3) / 0.7, 0, 1))
    return _img(_quant(col), alpha)


def eye(colors, seed="eye", size=112):
    n = size
    X, Y = _grid(n)
    cols = colors or ["#1a6a2a", "#3cc060", "#b0ff80"]
    sclera_col = _rgb(cols[3]) if len(cols) > 3 else np.array([236, 228, 220.0])
    # almond eye shape
    shape = (np.abs(Y) < 0.5 * (1 - (X / 0.95) ** 2)) & (np.abs(X) < 0.95)
    d = np.hypot(X, Y)
    iris = d < 0.36
    pupil = np.hypot(X / 0.45, Y) < 0.13
    ang = np.arctan2(Y, X)
    R = rng(f"eye:{seed}")
    streak = 0.5 + 0.5 * np.sin(ang * 26 + _noise(n, max(3, n // 10), seed) * 6)
    icol = _ramp(cols[:3], np.clip(1 - d / 0.36 * 0.8 + 0.25 * streak - 0.1, 0, 1))
    col = np.zeros((n, n, 3)) + sclera_col
    # thin branching veins creeping in from the corners of the eye
    vmask = np.zeros((n, n), bool)
    for k in range(int(R.integers(5, 9))):
        side = -1 if k % 2 == 0 else 1
        x, y = side * R.uniform(0.6, 0.85), R.uniform(-0.18, 0.18)
        ang = math.atan2(-y, -x) + R.uniform(-0.5, 0.5)
        for _ in range(int(n * 0.25)):
            px, py = int((x + 1) / 2 * n), int((y + 1) / 2 * n)
            if 0 <= px < n and 0 <= py < n:
                vmask[py, px] = True
            ang += R.uniform(-0.35, 0.35)
            x += math.cos(ang) * 2.0 / n
            y += math.sin(ang) * 2.0 / n
            if math.hypot(x, y) < 0.42:
                break
    vmask &= shape & (d > 0.38)
    col[vmask] = [178, 34, 40]
    shade = np.clip(1 - (np.abs(Y) / (0.5 * (1 - (X / 0.95) ** 2) + 1e-6)) ** 4 * 0.45, 0.4, 1)
    col *= shade[..., None]
    col[iris] = icol[iris] * (0.85 + 0.15 * shade[iris][..., None])
    col[pupil] = [8, 8, 10]
    hl = np.hypot(X + 0.12, Y + 0.12) < 0.06
    col[hl] = [255, 255, 255]
    lid = (~shape) & (np.abs(Y) < 0.5 * (1 - (X / 0.95) ** 2) + 0.06) & (np.abs(X) < 1.0)
    col[lid] = _rgb(cols[0]) * 0.35
    alpha = (shape | lid).astype(float)
    return _img(_quant(col), alpha)


def comet(colors, seed="comet", size=128):
    n = size
    X, Y = _grid(n)
    cols = colors or ["#4080ff", "#a0d0ff", "#ffffff"]
    hx, hy = 0.55, -0.55
    dx, dy = X - hx, Y - hy
    along = -(dx - dy) / math.sqrt(2)          # tail towards bottom-left
    across = (dx + dy) / math.sqrt(2)
    tail = (along > 0) * np.clip(1 - np.abs(across) / (0.04 + along * 0.22), 0, 1) * np.clip(1 - along / 1.5, 0, 1)
    head = np.clip(1 - np.hypot(dx, dy) / 0.12, 0, 1)
    nz = _noise(n, max(3, n // 12), seed)
    alpha = np.clip(tail * (0.5 + 0.5 * nz) + head, 0, 1)
    col = _ramp(cols, np.clip(head * 1.2 + tail * 0.4, 0, 1))
    return _img(_quant(col), alpha)


def retro_sun(colors, seed="retro", size=112):
    n = size
    X, Y = _grid(n)
    cols = colors or ["#ffe040", "#ff8a30", "#ff2a8a", "#a020c0"]
    d = np.hypot(X, Y)
    disk = d < 0.9
    t = (Y + 0.9) / 1.8
    col = _ramp(cols, t)
    # stripes widen toward the bottom
    yy = (Y + 0.9) / 1.8
    stripe = np.zeros_like(Y, bool)
    k = 0
    pos = 0.52
    while pos < 1.0:
        width = 0.012 + 0.012 * k
        stripe |= (yy > pos) & (yy < pos + width)
        pos += width + 0.06
        k += 1
    alpha = (disk & ~stripe).astype(float)
    glow = np.clip(1 - (d - 0.9) / 0.1, 0, 1) * (d >= 0.9) * 0.5
    alpha = np.maximum(alpha, glow)
    return _img(_quant(col, 16), alpha)


def galaxy(colors, seed="galaxy", size=128):
    n = size
    X, Y = _grid(n)
    Yt = Y / 0.55
    r = np.hypot(X, Yt)
    th = np.arctan2(Yt, X)
    R = rng(f"gal:{seed}")
    arms = 2 + int(R.integers(0, 2))
    spiral = np.cos(arms * (th - np.log(r + 1e-3) * 3.2))
    nz = _noise(n, max(3, n // 10), seed)
    dens = np.clip(spiral * 0.5 + 0.5, 0, 1) ** 2 * np.clip(1 - r, 0, 1) * (0.6 + 0.6 * nz)
    core = np.clip(1 - r / 0.18, 0, 1) ** 1.5
    cols = colors or ["#3040a0", "#a080ff", "#ffe0c0"]
    col = _ramp(cols, np.clip(dens * 1.2 + core, 0, 1))
    alpha = np.clip(dens * 1.4 + core, 0, 1)
    stars = (R.random((n, n)) > 0.985) & (r < 0.95)
    col[stars] = 255
    alpha = np.where(stars, 1.0, alpha)
    return _img(_quant(col), alpha)


def black_hole(colors, seed="hole", size=112):
    n = size
    X, Y = _grid(n)
    Yt = Y / 0.35
    r = np.hypot(X, Yt)
    cols = colors or ["#ff5a00", "#ffb040", "#fff0d0"]
    disk = np.clip(1 - np.abs(r - 0.62) / 0.3, 0, 1)
    nz = _noise(n, max(3, n // 10), seed)
    col = _ramp(cols, np.clip(disk * (0.7 + 0.5 * nz), 0, 1))
    alpha = disk ** 1.2
    hole = np.hypot(X, Y) < 0.3
    ring = (np.hypot(X, Y) >= 0.3) & (np.hypot(X, Y) < 0.34)
    col[hole] = 0
    alpha = np.where(hole, 1.0, alpha)
    col[ring] = _ramp(cols, np.ones(ring.sum()))
    alpha = np.where(ring, 1.0, alpha)
    return _img(_quant(col), alpha)


def shattered_moon(colors, seed="shatter", size=112):
    base = np.asarray(moon(colors, seed, size), float)
    n = size
    R = rng(f"sh:{seed}")
    out = np.zeros_like(base)
    X, Y = _grid(n)
    ang = np.arctan2(Y, X)
    pieces = int(R.integers(5, 8))
    cuts = np.sort(R.uniform(-math.pi, math.pi, pieces))
    for i in range(pieces):
        a0, a1 = cuts[i], cuts[(i + 1) % pieces] + (2 * math.pi if i == pieces - 1 else 0)
        mid = (a0 + a1) / 2
        sel = ((ang - a0) % (2 * math.pi)) < ((a1 - a0) % (2 * math.pi))
        shift = R.uniform(2, 7)
        dx, dy = int(round(math.cos(mid) * shift)), int(round(math.sin(mid) * shift))
        piece = np.where(sel[..., None], base, 0)
        piece = np.roll(np.roll(piece, dy, 0), dx, 1)
        m = piece[..., 3] > 0
        out[m] = piece[m]
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGBA")


GENERATORS = {
    "planet": planet, "ringed_planet": ringed_planet, "gas_giant": gas_giant, "moon": moon, "sun": sun,
    "twin_suns": twin_suns, "nebula": nebula, "aurora": aurora, "eye": eye, "comet": comet, "retro_sun": retro_sun,
    "galaxy": galaxy, "black_hole": black_hole, "shattered_moon": shattered_moon,
}


def render(body):
    fn = GENERATORS.get(body.texture)
    if fn is None:
        raise KeyError(f"unknown sky body generator {body.texture!r}")
    return fn(list(body.colors), body.seed or body.texture)


def emit_sky(ctx, dim):
    """Write textures for dim.sky.bodies; returns DimensionInfo.sky entries."""
    from .common import NS, warn
    out = []
    for i, b in enumerate(dim.sky.bodies):
        try:
            img = render(b)
        except Exception as e:
            warn(f"{dim.id}: sky body {i} ({b.texture}) failed: {e}")
            continue
        name = f"{dim.id}_{i}"
        p = ctx.assets("textures", "environment", name + ".png")
        import os
        os.makedirs(os.path.dirname(p), exist_ok=True)
        img.save(p)
        out.append({"texture": f"{NS}:textures/environment/{name}.png", "size": float(b.size), "yaw": float(b.yaw),
                    "pitch": float(b.pitch), "roll": float(b.roll), "speed": float(b.speed), "alpha": float(b.alpha),
                    "additive": bool(b.additive)})
    return out
