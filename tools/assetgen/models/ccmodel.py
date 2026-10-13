"""
CaliberCraft model DSL and JSON writer.

Model space: 1 unit = 1 model pixel. Minecraft allows element coordinates in [-16, 32].
Weapons point their muzzle toward -Z, the bore axis runs along x = 8.

A Weapon is a set of named Parts (cuboid lists). Some parts are animated in first person
(magazine, slide, bolt...), some have selectable variants (barrel, stock, magazine) driven by
attachments. Every box carries a material *role*; skins bind roles to textures.
"""
from __future__ import annotations

import copy
import json
import math
import os
from dataclasses import dataclass, field

ROLES = ("receiver", "furniture", "metal", "detail", "accent", "mag", "brass", "shell")
FACES = ("north", "south", "east", "west", "up", "down")
MAX_SEG = 16.0  # faces larger than this are split so texel density stays uniform


@dataclass
class Box:
    frm: tuple
    to: tuple
    role: str
    rot: dict | None = None  # {"origin": (x,y,z), "x": deg, "y": deg, "z": deg} or {"origin", "axis", "angle"}
    glow: bool = False  # accent element that glows on emissive skins
    faces: tuple = FACES
    texture: str | None = None  # fixed texture id instead of a role (attachments)
    emission: int = 0  # fixed light emission (attachments: reticle dots)

    def __post_init__(self):
        f = [min(a, b) for a, b in zip(self.frm, self.to)]
        t = [max(a, b) for a, b in zip(self.frm, self.to)]
        self.frm, self.to = tuple(float(v) for v in f), tuple(float(v) for v in t)
        if self.texture is None and self.role not in ROLES:
            raise ValueError(f"unknown role {self.role}")

    def translated(self, d):
        b = copy.deepcopy(self)
        b.frm = tuple(a + o for a, o in zip(self.frm, d))
        b.to = tuple(a + o for a, o in zip(self.to, d))
        if b.rot is not None:
            b.rot = dict(b.rot)
            b.rot["origin"] = tuple(a + o for a, o in zip(self.rot["origin"], d))
        return b


class Part:
    def __init__(self, name: str, animated: bool = False, in_world: bool = True):
        self.name = name
        self.animated = animated
        self.in_world = in_world  # rendered in the full (third person / GUI) model
        self.boxes: list[Box] = []

    def box(self, frm, to, role, rot=None, glow=False, faces=FACES, **kw):
        self.boxes.append(Box(tuple(frm), tuple(to), role, rot=rot, glow=glow, faces=faces, **kw))
        return self

    # Convenience helpers -------------------------------------------------------------------
    def cbox(self, center, size, role, **kw):
        """Box from center + size."""
        c, s = center, size
        return self.box((c[0] - s[0] / 2, c[1] - s[1] / 2, c[2] - s[2] / 2),
                        (c[0] + s[0] / 2, c[1] + s[1] / 2, c[2] + s[2] / 2), role, **kw)

    def rod(self, x, y, z0, z1, d, role, **kw):
        """Square-section rod along Z centred on (x, y), diameter d."""
        return self.box((x - d / 2, y - d / 2, z0), (x + d / 2, y + d / 2, z1), role, **kw)

    def octo_rod(self, x, y, z0, z1, d, role, **kw):
        """Rounder-looking rod: square + 45deg-rotated square (reads as a cylinder)."""
        self.rod(x, y, z0, z1, d, role, **kw)
        r = d * 0.42
        self.box((x - r, y - r, z0), (x + r, y + r, z1), role,
                 rot={"origin": (x, y, (z0 + z1) / 2), "axis": "z", "angle": 45}, **kw)
        return self

    def extend(self, other: "Part", offset=(0, 0, 0)):
        for b in other.boxes:
            self.boxes.append(b.translated(offset))
        return self

    def bounds(self):
        if not self.boxes:
            return None
        lo = [min(b.frm[i] for b in self.boxes) for i in range(3)]
        hi = [max(b.to[i] for b in self.boxes) for i in range(3)]
        return lo, hi


class Weapon:
    """Geometry + metadata for one weapon."""

    def __init__(self, wid: str, category: str):
        self.id = wid
        self.category = category  # pistol, revolver, smg, rifle, shotgun, sniper, lmg
        self.parts: dict[str, Part] = {}
        # slot -> {variant id ("default" or attachment id) -> Part}
        self.variants: dict[str, dict[str, Part]] = {}
        self.points: dict[str, tuple] = {}
        self.anim: dict[str, dict] = {}
        self.mounts: dict[str, tuple] = {}
        self.muzzle_by_barrel: dict[str, tuple] = {}
        self.iron_sight_y: float | None = None
        self.iron_sight_z: float | None = None
        self.slots: dict[str, list[str]] = {}
        self.standard: dict[str, str] = {}  # role -> texture for the "standard" skin
        # Variant slots whose geometry is static in first person (e.g. a shotgun's tube extension).
        self.static_variant_slots: set[str] = set()

    def part(self, name, animated=False, in_world=True) -> Part:
        p = self.parts.get(name)
        if p is None:
            p = self.parts[name] = Part(name, animated, in_world)
        return p

    def variant(self, slot: str, vid: str) -> Part:
        """Variant geometry for slot 'barrel', 'stock' or 'magazine'. vid = 'default' or attachment id."""
        d = self.variants.setdefault(slot, {})
        if vid not in d:
            d[vid] = Part(f"{slot}_{vid.split(':')[-1]}", animated=(slot == "magazine"))
        return d[vid]

    def all_parts(self):
        for p in self.parts.values():
            yield p
        for vs in self.variants.values():
            for p in vs.values():
                yield p


@dataclass
class Attachment:
    """Attachment geometry in mount-local space (see attachments.py for mount conventions)."""
    id: str  # e.g. calibercraft:red_dot
    slot: str
    part: Part
    sight_height: float | None = None  # optics: eye-line height above mount
    length: float = 0.0  # muzzle devices: extension beyond the muzzle
    standalone_offset: tuple = (8, 8, 8)  # placement for the stand-alone item model


# --------------------------------------------------------------------------------------------
# JSON generation
# --------------------------------------------------------------------------------------------

def _r(v):
    v = round(float(v), 4)
    return int(v) if v == int(v) else v


def _split_box(b: Box):
    """Split along any axis longer than MAX_SEG. Returns list of (box, hidden_faces)."""
    segs = [(b, set())]
    for axis, (neg_face, pos_face) in enumerate((("west", "east"), ("down", "up"), ("north", "south"))):
        out = []
        for sb, hidden in segs:
            length = sb.to[axis] - sb.frm[axis]
            if length <= MAX_SEG + 1e-6:
                out.append((sb, hidden))
                continue
            n = math.ceil(length / MAX_SEG - 1e-6)
            step = length / n
            for i in range(n):
                nb = copy.deepcopy(sb)
                f, t = list(sb.frm), list(sb.to)
                f[axis] = sb.frm[axis] + step * i
                t[axis] = sb.frm[axis] + step * (i + 1)
                nb.frm, nb.to = tuple(f), tuple(t)
                h = set(hidden)
                if i > 0:
                    h.add(neg_face)
                if i < n - 1:
                    h.add(pos_face)
                out.append((nb, h))
        segs = out
    return segs


def _wrap(start, size):
    """Map a face extent to a [0,16] UV window keeping world-space continuity where possible."""
    u0 = start % 16.0
    if u0 + size > 16.0 + 1e-6:
        u0 = max(0.0, 16.0 - size)
    return u0, u0 + size


def _face_uv(face, f, t):
    fx, fy, fz = f
    tx, ty, tz = t
    if face == "north":
        u = _wrap(16 - tx, tx - fx); v = _wrap(16 - ty, ty - fy)
    elif face == "south":
        u = _wrap(fx, tx - fx); v = _wrap(16 - ty, ty - fy)
    elif face == "east":
        u = _wrap(16 - tz, tz - fz); v = _wrap(16 - ty, ty - fy)
    elif face == "west":
        u = _wrap(fz, tz - fz); v = _wrap(16 - ty, ty - fy)
    elif face == "up":
        u = _wrap(fx, tx - fx); v = _wrap(fz, tz - fz)
    else:  # down
        u = _wrap(fx, tx - fx); v = _wrap(16 - tz, tz - fz)
    return [_r(u[0]), _r(v[0]), _r(u[1]), _r(v[1])]


def element_json(b: Box, glow_mode: bool):
    elements = []
    for sb, hidden in _split_box(b):
        for i in range(3):
            if sb.frm[i] < -16 or sb.to[i] > 32:
                raise ValueError(f"box out of model bounds: {sb.frm} {sb.to}")
        faces = {}
        for face in sb.faces:
            if face in hidden:
                continue
            tex = sb.texture if sb.texture is not None else "#" + sb.role
            faces[face] = {"uv": _face_uv(face, sb.frm, sb.to), "texture": tex}
        if not faces:
            continue
        e = {"from": [_r(v) for v in sb.frm], "to": [_r(v) for v in sb.to], "faces": faces}
        if sb.rot is not None:
            rot = {"origin": [_r(v) for v in sb.rot["origin"]]}
            if "axis" in sb.rot:
                rot["axis"] = sb.rot["axis"]
                rot["angle"] = _r(sb.rot["angle"])
            else:
                for k in ("x", "y", "z"):
                    rot[k] = _r(sb.rot.get(k, 0))
            e["rotation"] = rot
        emission = sb.emission
        if glow_mode and sb.glow:
            emission = 15
        if emission:
            e["light_emission"] = int(emission)
        elements.append(e)
    return elements


def part_model_json(part: Part, glow_mode=False, textures=None, display=None):
    elements = []
    for b in part.boxes:
        elements.extend(element_json(b, glow_mode))
    m = {}
    if textures:
        m["textures"] = textures
    m["elements"] = elements
    if display:
        m["display"] = display
    return m


def part_has_glow(part: Part):
    return any(b.glow for b in part.boxes)


class Writer:
    """Collects files and writes them with stable formatting; tracks what it wrote."""

    def __init__(self, root):
        self.root = root
        self.files: set[str] = set()

    def json(self, rel, obj):
        path = os.path.join(self.root, rel)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        text = json.dumps(obj, separators=(",", ":"))
        if len(text) < 3000:
            text = json.dumps(obj, indent=2)
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(text + "\n")
        self.files.add(rel)
