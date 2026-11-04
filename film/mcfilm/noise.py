"""Vectorised value-noise / fBm helpers (pure numpy, deterministic)."""
import numpy as np

_M = 0xFFFFFFFF


def _hash(*ints, seed=0):
    h = np.int64(seed) * 0x9E3779B1 + 0x85EBCA6B
    h = np.full(np.broadcast(*ints).shape, h, dtype=np.int64)
    primes = (0x27D4EB2F, 0x165667B1, 0x1B873593)
    for a, p in zip(ints, primes):
        h = (h ^ (np.asarray(a, dtype=np.int64) * p)) & _M
        h = ((h ^ (h >> 15)) * 0x2C1B3C6D) & _M
        h = ((h ^ (h >> 12)) * 0x297A2D39) & _M
    h = h ^ (h >> 15)
    return (h & 0xFFFFFF) / float(0xFFFFFF)


def hash01(*ints, seed=0):
    return _hash(*ints, seed=seed)


def _fade(t):
    return t * t * (3.0 - 2.0 * t)


def value2(x, y, seed=0):
    x = np.asarray(x, dtype=np.float64)
    y = np.asarray(y, dtype=np.float64)
    xi = np.floor(x).astype(np.int64)
    yi = np.floor(y).astype(np.int64)
    fx = _fade(x - xi)
    fy = _fade(y - yi)
    a = _hash(xi, yi, seed=seed)
    b = _hash(xi + 1, yi, seed=seed)
    c = _hash(xi, yi + 1, seed=seed)
    d = _hash(xi + 1, yi + 1, seed=seed)
    return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy


def value3(x, y, z, seed=0):
    x = np.asarray(x, dtype=np.float64)
    y = np.asarray(y, dtype=np.float64)
    z = np.asarray(z, dtype=np.float64)
    xi, yi, zi = (np.floor(v).astype(np.int64) for v in (x, y, z))
    fx, fy, fz = _fade(x - xi), _fade(y - yi), _fade(z - zi)
    out = 0.0
    for dx in (0, 1):
        wx = fx if dx else 1 - fx
        for dy in (0, 1):
            wy = fy if dy else 1 - fy
            for dz in (0, 1):
                wz = fz if dz else 1 - fz
                out = out + _hash(xi + dx, yi + dy, zi + dz, seed=seed) * wx * wy * wz
    return out


def fbm2(x, y, octaves=5, scale=64.0, seed=0, lac=2.0, gain=0.5):
    amp, freq, tot, norm = 1.0, 1.0 / scale, 0.0, 0.0
    for o in range(octaves):
        tot = tot + amp * value2(x * freq, y * freq, seed=seed + 101 * o)
        norm += amp
        amp *= gain
        freq *= lac
    return tot / norm


def fbm3(x, y, z, octaves=4, scale=32.0, seed=0, lac=2.0, gain=0.5):
    amp, freq, tot, norm = 1.0, 1.0 / scale, 0.0, 0.0
    for o in range(octaves):
        tot = tot + amp * value3(x * freq, y * freq, z * freq, seed=seed + 131 * o)
        norm += amp
        amp *= gain
        freq *= lac
    return tot / norm


def ridged2(x, y, octaves=5, scale=64.0, seed=0):
    amp, freq, tot, norm = 1.0, 1.0 / scale, 0.0, 0.0
    for o in range(octaves):
        n = value2(x * freq, y * freq, seed=seed + 77 * o)
        tot = tot + amp * (1.0 - np.abs(2 * n - 1))
        norm += amp
        amp *= 0.5
        freq *= 2.0
    return tot / norm


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)
