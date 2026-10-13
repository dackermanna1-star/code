"""
Quick software preview of weapon geometry (orthographic, flat-shaded, painter's algorithm).
Used while designing weapons; images go to a scratch directory, never into the mod.
"""
from __future__ import annotations

import math
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from ccmodel import Part
from skins import NS, skin_textures

HERE = os.path.dirname(os.path.abspath(__file__))
TEX_ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", "src", "main", "resources", "assets", NS, "textures"))

FALLBACK = {
    "receiver": (40, 42, 46), "furniture": (28, 28, 30), "metal": (70, 72, 76), "detail": (22, 22, 24),
    "accent": (90, 92, 98), "mag": (34, 34, 36), "brass": (200, 160, 70), "shell": (170, 30, 30),
}
_cache: dict[str, tuple] = {}


def tex_color(tex_id, role):
    if tex_id in _cache:
        return _cache[tex_id]
    col = FALLBACK.get(role, (120, 120, 120))
    if tex_id and ":" in tex_id:
        ns, path = tex_id.split(":", 1)
        f = os.path.join(TEX_ROOT, path + ".png")
        if os.path.exists(f):
            im = np.asarray(Image.open(f).convert("RGBA"), dtype=float)
            im = im[: im.shape[1]]  # first frame of animated strips
            a = im[..., 3:4] / 255.0
            if a.sum() > 0:
                col = tuple(int(v) for v in (im[..., :3] * a).sum(axis=(0, 1)) / a.sum())
    _cache[tex_id] = col
    return col


def _rot_matrix(rot):
    if rot is None:
        return None, None
    o = np.array(rot["origin"], dtype=float)
    if "axis" in rot:
        a = math.radians(rot["angle"])
        c, s = math.cos(a), math.sin(a)
        m = {"x": [[1, 0, 0], [0, c, -s], [0, s, c]],
             "y": [[c, 0, s], [0, 1, 0], [-s, 0, c]],
             "z": [[c, -s, 0], [s, c, 0], [0, 0, 1]]}[rot["axis"]]
        return np.array(m), o
    x, y, z = (math.radians(rot.get(k, 0)) for k in ("x", "y", "z"))
    rx = np.array([[1, 0, 0], [0, math.cos(x), -math.sin(x)], [0, math.sin(x), math.cos(x)]])
    ry = np.array([[math.cos(y), 0, math.sin(y)], [0, 1, 0], [-math.sin(y), 0, math.cos(y)]])
    rz = np.array([[math.cos(z), -math.sin(z), 0], [math.sin(z), math.cos(z), 0], [0, 0, 1]])
    return rz @ ry @ rx, o  # JOML rotationZYX(z, y, x)


FACE_IDX = {  # corner indices (bit0=x, bit1=y, bit2=z) and outward normal
    "west": ([0, 2, 6, 4], (-1, 0, 0)), "east": ([1, 5, 7, 3], (1, 0, 0)),
    "down": ([0, 4, 5, 1], (0, -1, 0)), "up": ([2, 3, 7, 6], (0, 1, 0)),
    "north": ([0, 1, 3, 2], (0, 0, -1)), "south": ([4, 6, 7, 5], (0, 0, 1)),
}


def _faces(boxes, textures):
    out = []
    for b in boxes:
        f, t = np.array(b.frm), np.array(b.to)
        corners = np.array([[(t if i & 1 else f)[0], (t if i & 2 else f)[1], (t if i & 4 else f)[2]] for i in range(8)])
        m, o = _rot_matrix(b.rot)
        if m is not None:
            corners = (corners - o) @ m.T + o
        tex_id = b.texture or textures.get(b.role)
        col = tex_color(tex_id, b.role)
        for name in b.faces:
            idx, n = FACE_IDX[name]
            normal = np.array(n, dtype=float)
            if m is not None:
                normal = m @ normal
            out.append((corners[idx], normal, col, b.emission or (b.glow and 0)))
    return out


def render(boxes, textures, yaw, pitch, scale, size):
    """Render boxes; yaw/pitch in degrees. Camera looks along -Z of view space."""
    cy, sy = math.cos(math.radians(yaw)), math.sin(math.radians(yaw))
    cp, sp = math.cos(math.radians(pitch)), math.sin(math.radians(pitch))
    ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    rx = np.array([[1, 0, 0], [0, cp, -sp], [0, sp, cp]])
    view = rx @ ry
    light = np.array([0.4, 0.8, 0.45]); light /= np.linalg.norm(light)
    faces = []
    for quad, normal, col, emis in _faces(boxes, textures):
        v = (quad - 8.0) @ view.T
        nv = view @ normal
        if nv[2] <= 1e-6:
            continue  # back face
        shade = 0.45 + 0.55 * max(0.0, float(normal @ light)) if not emis else 1.0
        faces.append((v[:, 2].mean(), v, tuple(int(min(255, c * shade)) for c in col)))
    faces.sort(key=lambda f: f[0])
    img = Image.new("RGBA", size, (190, 205, 215, 255))
    d = ImageDraw.Draw(img)
    if not faces:
        return img
    allp = np.concatenate([v for _, v, _ in faces])
    lo, hi = allp.min(axis=0), allp.max(axis=0)
    scale = min(scale, (size[0] - 20) / max(1e-3, hi[0] - lo[0]), (size[1] - 30) / max(1e-3, hi[1] - lo[1]))
    mid = (lo + hi) / 2
    cx, cy0 = size[0] / 2 - mid[0] * scale, size[1] / 2 + 8 + mid[1] * scale
    for _, v, col in faces:
        pts = [(cx + p[0] * scale, cy0 - p[1] * scale) for p in v]
        d.polygon(pts, fill=col, outline=tuple(max(0, c - 25) for c in col))
    return img


def _weapon_boxes(weapon, atts, loadout):
    boxes = []
    for p in weapon.parts.values():
        if p.in_world:
            boxes.extend(p.boxes)
    for slot, variants in weapon.variants.items():
        v = variants.get(loadout.get(slot, "default")) or variants.get("default")
        if v:
            boxes.extend(v.boxes)
    for slot in ("optic", "muzzle", "grip", "tactical", "charm"):
        aid = loadout.get(slot)
        if aid:
            if slot == "muzzle":
                mount = weapon.muzzle_by_barrel.get(loadout.get("barrel", "default"), weapon.muzzle_by_barrel["default"])
            else:
                mount = weapon.mounts[slot]
            boxes.extend(b.translated(mount) for b in atts[aid].part.boxes)
    return boxes


def render_weapon(weapon, atts, out_dir):
    tex = skin_textures("standard", weapon)
    full = {s: (weapon.slots.get(s) or [None])[0] for s in ("optic", "muzzle", "grip", "tactical", "charm")}
    for slot, variants in weapon.variants.items():
        keys = [k for k in variants if k != "default"]
        if keys:
            full[slot] = keys[0]
    views = [
        ("right side (stock)", _weapon_boxes(weapon, atts, {}), -90, 0),
        ("right side (first attachment of every slot)", _weapon_boxes(weapon, atts, full), -90, 0),
        ("top", _weapon_boxes(weapon, atts, {}), -90, 90),
        ("3/4 front-right", _weapon_boxes(weapon, atts, {}), -125, 22),
        ("left side", _weapon_boxes(weapon, atts, {}), 90, 0),
    ]
    tiles = []
    for label, boxes, yaw, pitch in views:
        im = render(boxes, tex, yaw, pitch, 14, (760, 440))
        ImageDraw.Draw(im).text((8, 6), f"{weapon.id}: {label}", fill=(0, 0, 0, 255))
        tiles.append(im)
    # skins strip
    for skin in ("woodland", "worn", "neon"):
        im = render(_weapon_boxes(weapon, atts, {}), skin_textures(skin, weapon), -90, 0, 7, (380, 220))
        ImageDraw.Draw(im).text((6, 4), skin, fill=(0, 0, 0, 255))
        tiles.append(im)
    sheet = Image.new("RGBA", (760 * 2, 440 * 3 + 220), (255, 255, 255, 255))
    for i, im in enumerate(tiles[:5]):
        sheet.paste(im, ((i % 2) * 760, (i // 2) * 440))
    for i, im in enumerate(tiles[5:]):
        sheet.paste(im, (760 + (i % 2) * 380, 880 + (i // 2) * 220))
    path = os.path.join(out_dir, f"{weapon.id}.png")
    sheet.save(path)
    return path


def render_attachments(atts, out_dir):
    cols = 6
    tiles = []
    for aid, a in atts.items():
        boxes = [b.translated((8, 8, 8)) for b in a.part.boxes]
        im = render(boxes, {}, -125, 22, 18, (260, 200))
        ImageDraw.Draw(im).text((4, 4), aid.split(":")[1], fill=(0, 0, 0, 255))
        tiles.append(im)
    rows = math.ceil(len(tiles) / cols)
    sheet = Image.new("RGBA", (260 * cols, 200 * rows), (255, 255, 255, 255))
    for i, im in enumerate(tiles):
        sheet.paste(im, ((i % cols) * 260, (i // cols) * 200))
    path = os.path.join(out_dir, "attachments.png")
    sheet.save(path)
    return path
