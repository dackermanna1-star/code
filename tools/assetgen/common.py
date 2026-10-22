"""Shared paths and image helpers for the Ordnance asset generator."""
import json
import os

import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
RESOURCES = os.path.join(ROOT, "src", "main", "resources")
ASSETS = os.path.join(RESOURCES, "assets", "ordnance")
DATA = os.path.join(RESOURCES, "data")


def path(*parts):
    p = os.path.join(*parts)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    return p


def write_json(rel_path, obj, base=ASSETS):
    with open(path(base, rel_path), "w", encoding="utf-8") as f:
        json.dump(obj, f, indent=2, ensure_ascii=False)
        f.write("\n")


def save_rgba(rel_path, rgba, base=ASSETS):
    """rgba: float array HxWx4 in 0..1."""
    arr = np.clip(rgba * 255.0 + 0.5, 0, 255).astype(np.uint8)
    Image.fromarray(arr, "RGBA").save(path(base, rel_path))


def grid(size):
    """Pixel-centre coordinates in -1..1 (x right, y down)."""
    c = (np.arange(size) + 0.5) / size * 2.0 - 1.0
    yy, xx = np.meshgrid(c, c, indexing="ij")
    return xx, yy


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def value_noise(size, cells, rng):
    """Smooth value noise in 0..1 sampled on a size x size grid with `cells` lattice cells."""
    lattice = rng.random((cells + 2, cells + 2))
    coords = np.arange(size) / size * cells
    i0 = np.floor(coords).astype(int)
    f = coords - i0
    f = f * f * (3 - 2 * f)
    y0, x0 = np.meshgrid(i0, i0, indexing="ij")
    fy, fx = np.meshgrid(f, f, indexing="ij")
    a = lattice[y0, x0]
    b = lattice[y0, x0 + 1]
    c = lattice[y0 + 1, x0]
    d = lattice[y0 + 1, x0 + 1]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def fbm(size, rng, octaves=5, base=3, persistence=0.55):
    total = np.zeros((size, size))
    amp = 1.0
    norm = 0.0
    cells = base
    for _ in range(octaves):
        total += value_noise(size, cells, rng) * amp
        norm += amp
        amp *= persistence
        cells *= 2
    return total / norm


def rgba_from(lum, alpha, tint=(1.0, 1.0, 1.0)):
    h, w = lum.shape
    out = np.zeros((h, w, 4))
    for i in range(3):
        out[..., i] = np.clip(lum * tint[i], 0, 1)
    out[..., 3] = np.clip(alpha, 0, 1)
    return out


def hex_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))
