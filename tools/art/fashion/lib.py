"""Shared helpers for the LaptopCraft fashion art generators.

Everything here is deterministic so re-running the generators reproduces byte-identical assets.
"""
import json
import math
import os

from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
ASSETS = os.path.join(ROOT, "src", "main", "resources", "assets", "laptopcraft")
DATA = os.path.join(ROOT, "src", "main", "resources", "data")
NS = "laptopcraft"


# --------------------------------------------------------------------------------------------- colours

def rgb(h, a=255):
    """'#rrggbb' -> (r, g, b, a)."""
    h = h.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


def clamp8(v):
    return max(0, min(255, int(round(v))))


def shade(c, f):
    """Multiply the RGB part of colour c by f (keeps alpha)."""
    return (clamp8(c[0] * f), clamp8(c[1] * f), clamp8(c[2] * f), c[3] if len(c) > 3 else 255)


def mix(a, b, t):
    """Linear blend from a to b (t = 0..1)."""
    a = a if len(a) == 4 else (*a, 255)
    b = b if len(b) == 4 else (*b, 255)
    return tuple(clamp8(a[i] + (b[i] - a[i]) * t) for i in range(4))


def with_alpha(c, a):
    return (c[0], c[1], c[2], a)


def hash01(*vals):
    """Deterministic pseudo random number in [0, 1) from any numbers."""
    h = 2166136261
    for v in vals:
        iv = int(round(v * 64)) & 0xFFFFFFFF
        for shift in (0, 8, 16, 24):
            h ^= (iv >> shift) & 0xFF
            h = (h * 16777619) & 0xFFFFFFFF
    h ^= h >> 13
    h = (h * 0x5BD1E995) & 0xFFFFFFFF
    h ^= h >> 15
    return (h & 0xFFFFFF) / float(0x1000000)


def jitter(c, amount, *seed):
    """Small brightness noise so flat colours look like fabric instead of plastic."""
    if amount <= 0:
        return c
    return shade(c, 1.0 + (hash01(*seed) - 0.5) * 2 * amount)


# --------------------------------------------------------------------------------------------- files

def write_png(img, *parts):
    path = os.path.join(ASSETS, *parts)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, optimize=True)
    return path


def write_json(obj, *parts, base=None):
    path = os.path.join(base or ASSETS, *parts)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, indent=2, ensure_ascii=False)
        f.write("\n")
    return path


def r4(v):
    """Round model numbers so the JSON stays tidy."""
    v = round(v, 4)
    return int(v) if v == int(v) else v


# --------------------------------------------------------------------------------------------- pixel grids

def grid_image(rows, palette, size=None):
    """Build an RGBA image from a list of equal-length strings; '.' or ' ' = transparent."""
    h = len(rows)
    w = len(rows[0])
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    px = img.load()
    for y, row in enumerate(rows):
        if len(row) != w:
            raise ValueError("ragged row %d (%d != %d): %r" % (y, len(row), w, row))
        for x, ch in enumerate(row):
            if ch in ". ":
                continue
            if ch not in palette:
                raise KeyError("colour %r not in palette (row %d)" % (ch, y))
            c = palette[ch]
            px[x, y] = c if isinstance(c, tuple) else rgb(c)
    if size and img.size != size:
        raise ValueError("expected %s got %s" % (size, img.size))
    return img


def upscale(img, k):
    return img.resize((img.width * k, img.height * k), Image.NEAREST)


# --------------------------------------------------------------------------------------------- geometry

def rot_matrix(rot):
    """3x3 rotation matrix for an element rotation dict (single axis or Euler XYZ as in 1.21.11)."""
    def rx(a):
        c, s = math.cos(a), math.sin(a)
        return [[1, 0, 0], [0, c, -s], [0, s, c]]

    def ry(a):
        c, s = math.cos(a), math.sin(a)
        return [[c, 0, s], [0, 1, 0], [-s, 0, c]]

    def rz(a):
        c, s = math.cos(a), math.sin(a)
        return [[c, -s, 0], [s, c, 0], [0, 0, 1]]

    def mul(a, b):
        return [[sum(a[i][k] * b[k][j] for k in range(3)) for j in range(3)] for i in range(3)]

    if "axis" in rot:
        a = math.radians(rot["angle"])
        return {"x": rx, "y": ry, "z": rz}[rot["axis"]](a)
    # Matrix4f.rotationZYX(z, y, x) = Rz * Ry * Rx
    return mul(mul(rz(math.radians(rot.get("z", 0))), ry(math.radians(rot.get("y", 0)))), rx(math.radians(rot.get("x", 0))))


def apply_rot(p, rot):
    if not rot:
        return p
    m = rot_matrix(rot)
    o = rot["origin"]
    d = [p[i] - o[i] for i in range(3)]
    return tuple(o[i] + sum(m[i][k] * d[k] for k in range(3)) for i in range(3))
