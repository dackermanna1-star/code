"""Paints entity textures in 3D: every texel of every face is mapped back to its point on the
model, and a per-species shader decides its colour from position, surface normal and body part.
Patterns therefore run continuously across boxes (zebra stripes, giraffe patches, rosettes) and
respect anatomy (pale bellies, dark legs, masks).
"""
import math

import numpy as np
from PIL import Image


def rgb(hexstr):
    if not isinstance(hexstr, str):
        return np.asarray(hexstr, dtype=float)
    s = hexstr.lstrip('#')
    return np.array([int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16)], dtype=float)


class Samples:
    """Texels of one face: texture coordinates, model-space positions (pixels, y down, ground at
    y=24, head towards -z, left at +x) and normals, plus the part and box tag they belong to."""

    def __init__(self, u, v, pos, nrm, part, path, tag, face):
        self.u, self.v = u, v
        self.pos = pos
        self.nrm = nrm
        self.part = part
        self.path = path
        self.tag = tag
        self.face = face
        self.n = len(u)

    @property
    def x(self):
        return self.pos[:, 0]

    @property
    def y(self):
        return self.pos[:, 1]

    @property
    def z(self):
        return self.pos[:, 2]

    @property
    def height(self):
        """Height above the ground in pixels."""
        return 24.0 - self.pos[:, 1]

    def full(self, c):
        return np.tile(np.asarray(c, dtype=float), (self.n, 1))

    def is_part(self, *names):
        return any(nm in self.path for nm in names)


def rasterize(quad, tex_w, tex_h):
    """Texels covered by a quad with axis-aligned uv rectangle; returns (u, v, positions, normals)."""
    verts = quad['verts']
    us = [vt[3] for vt in verts]
    vs = [vt[4] for vt in verts]
    u0, u1, v0, v1 = min(us), max(us), min(vs), max(vs)
    iu0, iu1 = int(round(u0)), int(round(u1))
    iv0, iv1 = int(round(v0)), int(round(v1))
    if iu1 <= iu0 or iv1 <= iv0:
        return None

    def corner(cu, cv):
        best = min(verts, key=lambda vt: abs(vt[3] - cu) + abs(vt[4] - cv))
        return np.array(best[:3])

    p00, p10, p01, p11 = corner(u0, v0), corner(u1, v0), corner(u0, v1), corner(u1, v1)
    uu, vv = np.meshgrid(np.arange(iu0, iu1), np.arange(iv0, iv1))
    uu = uu.ravel()
    vv = vv.ravel()
    keep = (uu >= 0) & (uu < tex_w) & (vv >= 0) & (vv < tex_h)
    uu, vv = uu[keep], vv[keep]
    s = ((uu + 0.5) - u0) / (u1 - u0)
    t = ((vv + 0.5) - v0) / (v1 - v0)
    s = s[:, None]
    t = t[:, None]
    pos = (p00 * (1 - s) * (1 - t) + p10 * s * (1 - t) + p01 * (1 - s) * t + p11 * s * t)
    nrm = np.tile(np.asarray(quad['normal'], dtype=float), (len(uu), 1))
    return uu, vv, pos, nrm


def paint(quads, tex_w, tex_h, shader, outline=False):
    img = np.zeros((tex_h, tex_w, 4), dtype=np.uint8)
    for q in quads:
        r = rasterize(q, tex_w, tex_h)
        if r is None:
            continue
        uu, vv, pos, nrm = r
        smp = Samples(uu, vv, pos, nrm, q['part'], tuple(q.get('path', (q['part'],))), q.get('tag'), q.get('face'))
        col = shader(smp)
        if col.shape[1] == 3:
            col = np.concatenate([col, np.full((len(uu), 1), 255.0)], axis=1)
        img[vv, uu] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    return img


def save(img, path):
    Image.fromarray(img, 'RGBA').save(path)


# ---------------------------------------------------------------------------- noise

def _hash3(ix, iy, iz, seed):
    h = (ix.astype(np.int64) * 73856093) ^ (iy.astype(np.int64) * 19349663) ^ (iz.astype(np.int64) * 83492791) ^ (seed * 2654435761)
    h = (h ^ (h >> 13)) * 1274126177
    h = h ^ (h >> 16)
    return (h & 0xFFFFFF) / float(0xFFFFFF)


def vnoise(pos, scale, seed=0):
    """Smooth 3D value noise in [0, 1] with features about `scale` pixels apart."""
    p = pos / scale
    i = np.floor(p)
    fr = p - i
    fr = fr * fr * (3 - 2 * fr)
    ix, iy, iz = i[:, 0].astype(np.int64), i[:, 1].astype(np.int64), i[:, 2].astype(np.int64)
    out = 0
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                w = (fr[:, 0] if dx else 1 - fr[:, 0]) * (fr[:, 1] if dy else 1 - fr[:, 1]) * (fr[:, 2] if dz else 1 - fr[:, 2])
                out = out + w * _hash3(ix + dx, iy + dy, iz + dz, seed)
    return out


def fbm(pos, scale, seed=0, octaves=3):
    total, amp, norm = 0, 1.0, 0
    for o in range(octaves):
        total = total + amp * vnoise(pos, scale / (2 ** o), seed + o * 101)
        norm += amp
        amp *= 0.5
    return total / norm


def grain(smp, seed=0):
    """Per-texel jitter in [-1, 1] for fur and skin texture."""
    return _hash3(np.round(smp.u).astype(np.int64), np.round(smp.v).astype(np.int64), np.zeros(smp.n, dtype=np.int64), seed) * 2 - 1


def worley(pos, scale, seed=0, jitter=0.85):
    """Cellular noise: distance to nearest and second nearest feature point (in cell units) and
    the id of the nearest cell."""
    p = pos / scale
    i = np.floor(p).astype(np.int64)
    best1 = np.full(len(p), 1e9)
    best2 = np.full(len(p), 1e9)
    ident = np.zeros(len(p))
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for dz in (-1, 0, 1):
                cx, cy, cz = i[:, 0] + dx, i[:, 1] + dy, i[:, 2] + dz
                fx = cx + 0.5 + (_hash3(cx, cy, cz, seed) - 0.5) * jitter
                fy = cy + 0.5 + (_hash3(cx, cy, cz, seed + 7) - 0.5) * jitter
                fz = cz + 0.5 + (_hash3(cx, cy, cz, seed + 13) - 0.5) * jitter
                d = np.sqrt((p[:, 0] - fx) ** 2 + (p[:, 1] - fy) ** 2 + (p[:, 2] - fz) ** 2)
                closer = d < best1
                best2 = np.where(closer, best1, np.minimum(best2, d))
                ident = np.where(closer, _hash3(cx, cy, cz, seed + 29), ident)
                best1 = np.where(closer, d, best1)
    return best1, best2, ident


# ---------------------------------------------------------------------------- colour helpers

def mix(a, b, t):
    t = np.clip(np.asarray(t, dtype=float), 0, 1)
    if t.ndim == 1:
        t = t[:, None]
    return a * (1 - t) + b * t


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def ramp(t, *stops):
    """Piecewise linear colour ramp; stops are (position, '#hex')."""
    t = np.clip(np.asarray(t, dtype=float), stops[0][0], stops[-1][0])
    out = np.zeros((len(t), 3))
    for (p0, c0), (p1, c1) in zip(stops, stops[1:]):
        m = (t >= p0) & (t <= p1)
        k = ((t[m] - p0) / max(1e-9, p1 - p0))[:, None]
        out[m] = rgb(c0) * (1 - k) + rgb(c1) * k
    return out


def shade(col, factor):
    f = np.asarray(factor, dtype=float)
    if f.ndim == 1:
        f = f[:, None]
    return col * f


def fur(col, smp, amount=0.06, seed=0):
    """Pixel-level fur/skin variation, plus a touch of darkening on downward-facing surfaces."""
    g = grain(smp, seed)
    down = np.clip(smp.nrm[:, 1], 0, 1)
    return shade(col, 1.0 + g * amount - down * 0.06)


def spots(pos, scale, size, seed=0, jitter=0.9):
    """1 inside round spots of radius `size` (cell units), 0 outside."""
    d1, _, _ = worley(pos, scale, seed, jitter)
    return (d1 < size).astype(float)


def rosettes(pos, scale, seed=0):
    """Leopard-style rosettes: dark broken rings, a slightly darker centre, solid spots in between."""
    d1, d2, ident = worley(pos, scale, seed, 0.75)
    ring = (d1 > 0.26) & (d1 < 0.4)
    broken = vnoise(pos, scale * 0.35, seed + 3) > 0.33
    small = worley(pos, scale * 0.5, seed + 11, 0.9)[0] < 0.16
    return ring & broken, (d1 < 0.26), small & ~(d1 < 0.42)
