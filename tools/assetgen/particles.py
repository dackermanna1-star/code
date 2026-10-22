"""Procedural particle textures: smoke, fireballs, flames, sparks, embers, flashes, shockwave rings, dust, debris."""
import numpy as np

from .common import fbm, grid, rgba_from, save_rgba, smoothstep, write_json


def blobs(size, rng, count, spread, rmin, rmax):
    xx, yy = grid(size)
    shape = np.zeros((size, size))
    for _ in range(count):
        cx, cy = rng.normal(0.0, spread, 2)
        r = rng.uniform(rmin, rmax)
        shape = np.maximum(shape, np.exp(-((xx - cx) ** 2 + (yy - cy) ** 2) / (2 * r * r)))
    return shape


def edge_falloff(size, power=2.0, reach=0.98):
    xx, yy = grid(size)
    r = np.sqrt(xx ** 2 + yy ** 2)
    return np.clip(1.0 - (r / reach) ** power, 0.0, 1.0)


def smoke(seed, size=64):
    rng = np.random.default_rng(seed)
    xx, yy = grid(size)
    shape = blobs(size, rng, rng.integers(5, 9), 0.2, 0.22, 0.42)
    detail = fbm(size, rng, octaves=5, base=3)
    fine = fbm(size, rng, octaves=3, base=8)
    density = shape * (0.5 + 0.5 * detail) * edge_falloff(size, 2.0, 0.97)
    alpha = smoothstep(0.06, 0.62, density) * (0.85 + 0.15 * fine)
    # Lit from above: lighter top, darker underside, gives each puff volume.
    shade = 0.82 - 0.16 * yy - 0.06 * xx + 0.12 * (detail - 0.5) + 0.06 * (fine - 0.5)
    return rgba_from(np.clip(shade, 0.45, 1.0), alpha)


def dust(seed, size=64):
    rng = np.random.default_rng(seed)
    xx, yy = grid(size)
    shape = blobs(size, rng, rng.integers(4, 7), 0.25, 0.2, 0.38)
    detail = fbm(size, rng, octaves=4, base=4)
    grain = rng.random((size, size))
    density = shape * (0.45 + 0.55 * detail) * edge_falloff(size, 2.0, 0.97)
    alpha = smoothstep(0.08, 0.7, density) * (0.7 + 0.3 * grain)
    shade = 0.85 - 0.12 * yy + 0.1 * (detail - 0.5)
    return rgba_from(np.clip(shade, 0.5, 1.0), alpha)


def fireball(frame, frames=8, size=64, seed=100):
    """Frame 0 is a dense, white-hot ball; later frames are cooler, broken-up and billowing."""
    t = frame / (frames - 1)
    rng = np.random.default_rng(seed + frame)
    xx, yy = grid(size)
    r = np.sqrt(xx ** 2 + yy ** 2)
    shape = blobs(size, rng, 7, 0.16 + 0.08 * t, 0.26, 0.42)
    turbulence = fbm(size, rng, octaves=5, base=3)
    density = shape * (0.55 + 0.45 * turbulence) * edge_falloff(size, 2.0, 0.97)
    threshold = 0.05 + 0.25 * t
    alpha = smoothstep(threshold, threshold + 0.35, density)
    core = np.exp(-(r ** 2) / (0.18 + 0.1 * (1 - t)))
    lum = 0.45 + 0.55 * core * (1.0 - 0.6 * t) + 0.25 * (turbulence - 0.5)
    lum *= 1.0 - 0.25 * t
    return rgba_from(np.clip(lum, 0.2, 1.0), alpha)


def flame(frame, frames=8, size=32, seed=200):
    """A turbulent tongue of flame: noise stretched upward and thresholded inside a teardrop envelope. Later
    frames are thinner and more broken as the flame dies."""
    t = frame / (frames - 1)
    rng = np.random.default_rng(seed + frame * 7)
    xx, yy = grid(size)
    v = (1.0 - yy) / 2.0  # 0 at bottom, 1 at top
    big = fbm(size * 2, rng, octaves=5, base=4)
    rows = slice(frame * 3, frame * 3 + size)
    n = big[rows, ::2][:size, :size]
    width = 0.78 * (1.0 - v) ** 0.75 * (1.0 - 0.25 * t) + 0.06
    sway = (n - 0.5) * 0.45 * v
    envelope = np.clip(1.0 - (np.abs(xx - sway) / width) ** 2, 0.0, 1.0)
    envelope *= smoothstep(0.0, 0.1, v) * np.clip(1.0 - v ** 2.5, 0.0, 1.0)
    density = envelope * (0.45 + 1.0 * n) - v * (0.18 + 0.25 * t)
    alpha = smoothstep(0.12, 0.42, density)
    lum = 0.55 + 0.45 * envelope * (1.0 - v) + 0.1 * (n - 0.5)
    return rgba_from(np.clip(lum, 0.3, 1.0), alpha)


def radial(size, sharpness, core=1.0):
    xx, yy = grid(size)
    r2 = xx ** 2 + yy ** 2
    return np.exp(-r2 * sharpness) * core * edge_falloff(size, 2.0, 1.0)


def flash(size=64):
    xx, yy = grid(size)
    r = np.sqrt(xx ** 2 + yy ** 2)
    angle = np.arctan2(yy, xx)
    rays = (np.cos(angle * 6.0) * 0.5 + 0.5) ** 6 * np.exp(-r * 2.2) * 0.45
    glow = np.exp(-(r ** 2) * 5.0) + 0.35 * np.exp(-(r ** 2) * 1.6)
    a = np.clip(glow + rays, 0, 1) * edge_falloff(size, 2.0, 1.0)
    return rgba_from(np.ones_like(a), a)


def shockwave(size=64):
    xx, yy = grid(size)
    r = np.sqrt(xx ** 2 + yy ** 2)
    ring = np.exp(-(((r - 0.84) / 0.07) ** 2))
    inner = 0.18 * np.exp(-(((r - 0.62) / 0.22) ** 2))
    a = np.clip(ring + inner, 0, 1) * (r < 0.99)
    return rgba_from(np.ones_like(a), a)


def muzzle(seed, size=32):
    rng = np.random.default_rng(seed)
    xx, yy = grid(size)
    r = np.sqrt(xx ** 2 + yy ** 2)
    angle = np.arctan2(yy, xx) + rng.uniform(0, np.pi)
    spikes = rng.integers(4, 7)
    star = (np.abs(np.cos(angle * spikes / 2.0)) ** 14) * np.clip(1.0 - r, 0, 1) ** 1.2
    core = np.exp(-(r ** 2) * 9.0)
    a = np.clip(core + star * 0.9, 0, 1) * edge_falloff(size, 2.0, 1.0)
    lum = np.clip(0.75 + 0.25 * core, 0, 1)
    return rgba_from(lum, a)


def debris(seed, size=16):
    rng = np.random.default_rng(seed)
    xx, yy = grid(size)
    sides = rng.integers(5, 8)
    angles = np.sort(rng.uniform(0, 2 * np.pi, sides))
    radii = rng.uniform(0.45, 0.85, sides)
    inside = np.zeros((size, size), bool)
    pa = np.arctan2(yy, xx) % (2 * np.pi)
    pr = np.sqrt(xx ** 2 + yy ** 2)
    for i in range(size):
        for j in range(size):
            k = np.searchsorted(angles, pa[i, j]) % sides
            k0 = (k - 1) % sides
            a0, a1 = angles[k0], angles[k]
            span = (a1 - a0) % (2 * np.pi) or 2 * np.pi
            f = ((pa[i, j] - a0) % (2 * np.pi)) / span
            inside[i, j] = pr[i, j] < radii[k0] * (1 - f) + radii[k] * f
    lum = 0.7 - 0.25 * yy + 0.15 * (rng.random((size, size)) - 0.5)
    return rgba_from(np.clip(lum, 0.3, 1.0), inside.astype(float))


def generate():
    sets = {}

    def emit(name, images):
        names = []
        for i, img in enumerate(images):
            tex = name if len(images) == 1 else f"{name}_{i}"
            save_rgba(f"textures/particle/{tex}.png", img)
            names.append(f"ordnance:{tex}")
        sets[name] = names

    emit("smoke", [smoke(10 + i) for i in range(8)])
    emit("dust", [dust(40 + i) for i in range(4)])
    emit("fireball", [fireball(i) for i in range(8)])
    emit("flame", [flame(i) for i in range(8)])
    emit("spark", [rgba_from(np.ones((16, 16)), radial(16, 9.0))])
    emit("ember", [rgba_from(np.ones((16, 16)), radial(16, 5.0))])
    emit("glow", [rgba_from(np.ones((32, 32)), radial(32, 3.2))])
    emit("flash", [flash()])
    emit("shockwave", [shockwave()])
    emit("muzzle_flash", [muzzle(70 + i) for i in range(2)])
    emit("debris", [debris(80 + i) for i in range(4)])
    for name, textures in sets.items():
        write_json(f"particles/{name}.json", {"textures": textures})
    return sets
