"""Small deterministic noise helpers (numpy) used by the texture/sound generators."""
import numpy as np


def rng(seed):
    return np.random.default_rng(abs(hash_str(seed)) % (2**32) if isinstance(seed, str) else seed)


def hash_str(s):
    h = 2166136261
    for ch in s.encode("utf-8"):
        h ^= ch
        h = (h * 16777619) & 0xFFFFFFFF
    return h


def value_noise(w, h, cell, seed, tile=True):
    """Smooth value noise in [0,1], tileable when tile=True."""
    r = rng(seed)
    gw = max(1, int(np.ceil(w / cell)))
    gh = max(1, int(np.ceil(h / cell)))
    grid = r.random((gh + 1, gw + 1))
    if tile:
        grid[-1, :] = grid[0, :]
        grid[:, -1] = grid[:, 0]
    ys = np.arange(h) / cell
    xs = np.arange(w) / cell
    y0 = np.floor(ys).astype(int)
    x0 = np.floor(xs).astype(int)
    fy = ys - y0
    fx = xs - x0
    fy = fy * fy * (3 - 2 * fy)
    fx = fx * fx * (3 - 2 * fx)
    y1 = np.minimum(y0 + 1, gh)
    x1 = np.minimum(x0 + 1, gw)
    a = grid[np.ix_(y0, x0)]
    b = grid[np.ix_(y0, x1)]
    c = grid[np.ix_(y1, x0)]
    d = grid[np.ix_(y1, x1)]
    top = a + (b - a) * fx[None, :]
    bot = c + (d - c) * fx[None, :]
    return top + (bot - top) * fy[:, None]


def fbm(w, h, cell, seed, octaves=3, persistence=0.5, tile=True):
    total = np.zeros((h, w))
    amp = 1.0
    norm = 0.0
    for o in range(octaves):
        c = max(1, cell / (2 ** o))
        total += value_noise(w, h, c, f"{seed}:{o}", tile) * amp
        norm += amp
        amp *= persistence
    return total / norm


def white(w, h, seed):
    return rng(seed).random((h, w))


def worley(w, h, points, seed, tile=True):
    """Distance to nearest feature point (normalized ~0..1). Tileable."""
    r = rng(seed)
    pts = r.random((points, 2)) * [w, h]
    yy, xx = np.mgrid[0:h, 0:w]
    best = np.full((h, w), 1e9)
    second = np.full((h, w), 1e9)
    offs = [(0, 0)]
    if tile:
        offs = [(dx, dy) for dx in (-w, 0, w) for dy in (-h, 0, h)]
    for px, py in pts:
        for dx, dy in offs:
            d = np.hypot(xx - (px + dx), yy - (py + dy))
            m = d < best
            second = np.where(m, best, np.minimum(second, d))
            best = np.where(m, d, best)
    scale = np.sqrt(w * h / points)
    return best / scale, second / scale
