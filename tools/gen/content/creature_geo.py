"""Creature geometry primitives (module C): parts, cuboids, transforms, UV packing and JSON export.

Coordinate system = vanilla entity model space, in model pixels (1/16 block):
  * x to the creature's side, y DOWN, z BACKWARD (the creature looks toward -z),
  * the ground is y = 24 (vanilla ``translate(0, -1.501, 0)``),
  * a part's ``pivot`` is relative to its parent's pivot, in the parent's (rotated) frame,
  * a cube's ``origin`` is relative to its part's pivot, in the part's frame,
  * rotations are radians, applied like ``ModelPart`` (``rotationZYX(z, y, x)`` = Rz*Ry*Rx).

The geometry JSON written for the client (assets/portalgun/geometry/<id>.json)::

    {"texture": [w, h], "scale": s, "archetype": "...", "translucent": bool,
     "parts": [{"name", "pivot": [x,y,z], "rot": [rx,ry,rz],
                "cubes": [{"o": [x,y,z], "s": [w,h,d], "uv": [u,v], "inflate": f, "mirror": false}],
                "anims": [{"kind", "axis", "amp", "speed", "phase", ...}],
                "children": [...]}]}
"""
from __future__ import annotations

import math

import numpy as np


# --------------------------------------------------------------------------------------------- primitives
class Cube:
    __slots__ = ("origin", "size", "mat", "inflate", "face", "pattern", "uv", "part", "nohit", "shade", "tag")

    def __init__(self, origin, size, mat="body", inflate=0.0, face=None, pattern=True, nohit=False, shade=True, tag=None):
        self.origin = tuple(float(v) for v in origin)
        self.size = tuple(max(0, int(round(v))) for v in size)
        self.mat = mat
        self.inflate = float(inflate)
        self.face = face          # dict describing features painted on the front (-z) face (eyes, mouth...)
        self.pattern = pattern    # apply the creature's body pattern
        self.nohit = nohit        # ignored when computing the hitbox (wings, tails, antennae, tentacles)
        self.shade = shade
        self.tag = tag
        self.uv = None
        self.part = None


class Part:
    _counter = 0

    def __init__(self, name, pivot=(0, 0, 0), rot=(0, 0, 0), nohit=False):
        self.name = name
        self.pivot = tuple(float(v) for v in pivot)
        self.rot = tuple(float(v) for v in rot)
        self.cubes: list[Cube] = []
        self.children: list[Part] = []
        self.anims: list[dict] = []
        self.parent = None
        self.nohit = nohit

    # building
    def box(self, x, y, z, w, h, d, mat="body", **kw):
        c = Cube((x, y, z), (w, h, d), mat, **kw)
        if self.nohit:
            c.nohit = True
        c.part = self
        self.cubes.append(c)
        return c

    def cbox(self, cx, cy, cz, w, h, d, mat="body", **kw):
        """Box centred on (cx, cy, cz) (rounded so integer sizes stay on the pixel grid)."""
        return self.box(cx - w / 2.0, cy - h / 2.0, cz - d / 2.0, w, h, d, mat, **kw)

    def child(self, name, pivot=(0, 0, 0), rot=(0, 0, 0), nohit=None):
        p = Part(name, pivot, rot, self.nohit if nohit is None else nohit)
        p.parent = self
        self.children.append(p)
        return p

    def anim(self, kind, axis="x", amp=0.5, speed=1.0, phase=0.0, **extra):
        a = {"kind": kind, "axis": axis, "amp": round(float(amp), 4), "speed": round(float(speed), 4),
             "phase": round(float(phase), 4)}
        for k, v in extra.items():
            a[k] = round(float(v), 4) if isinstance(v, (int, float)) and not isinstance(v, bool) else v
        self.anims.append(a)
        return self

    def walk(self):
        yield self
        for c in self.children:
            yield from c.walk()


# --------------------------------------------------------------------------------------------- transforms
def rot_matrix(rx, ry, rz):
    cx, sx = math.cos(rx), math.sin(rx)
    cy, sy = math.cos(ry), math.sin(ry)
    cz, sz = math.cos(rz), math.sin(rz)
    Rx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])
    Ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    Rz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    return Rz @ Ry @ Rx


def part_matrix(part):
    """4x4 transform from the part's local frame to root model space."""
    M = np.eye(4)
    chain = []
    p = part
    while p is not None:
        chain.append(p)
        p = p.parent
    for q in reversed(chain):
        T = np.eye(4)
        T[:3, :3] = rot_matrix(*q.rot)
        T[:3, 3] = q.pivot
        M = M @ T
    return M


def cube_corners(c: Cube):
    x0, y0, z0 = c.origin
    w, h, d = c.size
    i = c.inflate
    xs = (x0 - i, x0 + w + i)
    ys = (y0 - i, y0 + h + i)
    zs = (z0 - i, z0 + d + i)
    return np.array([[x, y, z, 1.0] for x in xs for y in ys for z in zs])


def all_cubes(root):
    for p in root.walk():
        for c in p.cubes:
            yield p, c


def bounds(root, include_nohit=True):
    lo = np.array([1e9] * 3)
    hi = np.array([-1e9] * 3)
    any_ = False
    for p, c in all_cubes(root):
        if not include_nohit and (c.nohit or p.nohit):
            continue
        pts = (part_matrix(p) @ cube_corners(c).T).T[:, :3]
        lo = np.minimum(lo, pts.min(0))
        hi = np.maximum(hi, pts.max(0))
        any_ = True
    if not any_:
        return np.zeros(3), np.zeros(3)
    return lo, hi


def ground(root, y=24.0):
    """Shift every top-level part so the lowest point of the model touches y (the ground)."""
    lo, hi = bounds(root)
    dy = y - hi[1]
    if abs(dy) > 1e-6:
        for ch in root.children:
            ch.pivot = (ch.pivot[0], ch.pivot[1] + dy, ch.pivot[2])


# --------------------------------------------------------------------------------------------- UV packing
def uv_rect(c: Cube):
    w, h, d = c.size
    return 2 * (d + w), d + h


def pack_uv(root, max_size=512):
    """Shelf-pack every cube's box-UV net. Returns (tex_w, tex_h). Sets cube.uv."""
    cubes = [c for _, c in all_cubes(root)]
    rects = [(uv_rect(c), c) for c in cubes]
    need_w = max([r[0][0] for r in rects] + [16])
    area = sum((rw + 1) * (rh + 1) for (rw, rh), _ in rects)
    order = sorted(rects, key=lambda r: (-r[0][1], -r[0][0]))
    for W in (64, 128, 256, 512):
        if W < need_w or W * W * 2 < area:
            continue
        x = y = shelf_h = 0
        placed = []
        ok = True
        for (rw, rh), c in order:
            if rw == 0 or rh == 0:
                placed.append((c, (0, 0)))
                continue
            if x + rw > W:
                x = 0
                y += shelf_h
                shelf_h = 0
            placed.append((c, (x, y)))
            x += rw
            shelf_h = max(shelf_h, rh)
        total_h = y + shelf_h
        H = 16
        while H < total_h:
            H *= 2
        if H > W * 2 or H > max_size:
            ok = False
        if ok:
            for c, uv in placed:
                c.uv = uv
            return W, H
    raise ValueError("creature geometry too large for a 512px texture")


# --------------------------------------------------------------------------------------------- face texel geometry
FACES = ("top", "bottom", "west", "north", "east", "south")


def face_rects(c: Cube):
    """face -> (u, v, fw, fh) texture rectangles (vanilla box UV layout)."""
    u0, v0 = c.uv
    w, h, d = c.size
    return {
        "top": (u0 + d, v0, w, d),
        "bottom": (u0 + d + w, v0, w, d),
        "west": (u0, v0 + d, d, h),
        "north": (u0 + d, v0 + d, w, h),
        "east": (u0 + d + w, v0 + d, d, h),
        "south": (u0 + 2 * d + w, v0 + d, w, h),
    }


def face_local_points(c: Cube, face):
    """Local (part frame) 3D positions of every texel centre of a face -> array (fh, fw, 3)."""
    x0, y0, z0 = c.origin
    w, h, d = c.size
    if face in ("top", "bottom"):
        fw, fh = w, d
        i = np.arange(fw)[None, :] + 0.5
        j = np.arange(fh)[:, None] + 0.5
        X = x0 + i + 0 * j
        Z = z0 + d - j + 0 * i
        Y = np.full_like(X, y0 if face == "top" else y0 + h)
    elif face in ("west", "east"):
        fw, fh = d, h
        i = np.arange(fw)[None, :] + 0.5
        j = np.arange(fh)[:, None] + 0.5
        Z = (z0 + d - i if face == "west" else z0 + i) + 0 * j
        Y = y0 + j + 0 * i
        X = np.full_like(Z, x0 if face == "west" else x0 + w)
    else:
        fw, fh = w, h
        i = np.arange(fw)[None, :] + 0.5
        j = np.arange(fh)[:, None] + 0.5
        X = (x0 + i if face == "north" else x0 + w - i) + 0 * j
        Y = y0 + j + 0 * i
        Z = np.full_like(X, z0 if face == "north" else z0 + d)
    return np.stack([X, Y, Z], -1)


FACE_NORMALS = {"top": (0, -1, 0), "bottom": (0, 1, 0), "west": (-1, 0, 0), "east": (1, 0, 0),
                "north": (0, 0, -1), "south": (0, 0, 1)}


# --------------------------------------------------------------------------------------------- export
def _r(v, n=4):
    return round(float(v), n)


def part_json(p: Part):
    out = {"name": p.name, "pivot": [_r(v, 3) for v in p.pivot]}
    if any(abs(v) > 1e-6 for v in p.rot):
        out["rot"] = [_r(v) for v in p.rot]
    cubes = []
    for c in p.cubes:
        cj = {"o": [_r(v, 3) for v in c.origin], "s": list(c.size), "uv": list(c.uv)}
        if c.inflate:
            cj["inflate"] = _r(c.inflate, 3)
        cubes.append(cj)
    if cubes:
        out["cubes"] = cubes
    if p.anims:
        out["anims"] = p.anims
    if p.children:
        out["children"] = [part_json(ch) for ch in p.children]
    return out


def geometry_json(root, tex_w, tex_h, **meta):
    j = {"texture": [tex_w, tex_h]}
    j.update(meta)
    j["parts"] = [part_json(ch) for ch in root.children]
    return j


def unique_names(root):
    seen = {}
    for p in root.walk():
        if p is root:
            continue
        n = p.name
        if n in seen:
            seen[n] += 1
            p.name = f"{n}_{seen[n]}"
        else:
            seen[n] = 0
