"""Tiny model DSL: furniture is described as boxes in a north-facing template.

Conventions
-----------
* Units are model pixels (0..16 per block). Templates face NORTH: the "front" of a piece of
  furniture is the low-Z side, its back is the high-Z side (against a wall to the south).
* Every box names a texture *variable*; concrete block models bind variables to textures,
  so one template serves every colour variant (just like vanilla ``template_*`` models).
* Boxes flagged ``collide`` contribute to the collision/outline shape exported for Java.
"""
from __future__ import annotations

import copy

FACES = ('north', 'south', 'east', 'west', 'up', 'down')


class Box:
    __slots__ = ('frm', 'to', 'tex', 'faces', 'skip', 'uv', 'rot', 'collide', 'shade', 'tint')

    def __init__(self, frm, to, tex, faces=None, skip=(), uv=None, rot=None, collide=True, shade=True, tint=None):
        self.frm = [float(v) for v in frm]
        self.to = [float(v) for v in to]
        self.tex = tex
        self.faces = dict(faces or {})
        self.skip = set(skip)
        self.uv = dict(uv or {})
        self.rot = rot
        self.collide = collide
        self.shade = shade
        self.tint = tint

    def moved(self, dx=0.0, dy=0.0, dz=0.0) -> 'Box':
        b = copy.deepcopy(self)
        b.frm = [self.frm[0] + dx, self.frm[1] + dy, self.frm[2] + dz]
        b.to = [self.to[0] + dx, self.to[1] + dy, self.to[2] + dz]
        if b.rot:
            o = b.rot['origin']
            b.rot = dict(b.rot, origin=[o[0] + dx, o[1] + dy, o[2] + dz])
        return b

    def mirrored_x(self) -> 'Box':
        """Mirror across the x=8 plane (used to derive right-handed variants)."""
        b = copy.deepcopy(self)
        b.frm[0], b.to[0] = 16 - self.to[0], 16 - self.frm[0]
        if 'east' in self.faces or 'west' in self.faces:
            e, w = self.faces.get('east'), self.faces.get('west')
            b.faces.pop('east', None)
            b.faces.pop('west', None)
            if e is not None:
                b.faces['west'] = e
            if w is not None:
                b.faces['east'] = w
        b.skip = {('west' if f == 'east' else 'east' if f == 'west' else f) for f in self.skip}
        if b.rot:
            o = b.rot['origin']
            angle = b.rot['angle']
            axis = b.rot['axis']
            b.rot = dict(b.rot, origin=[16 - o[0], o[1], o[2]], angle=(-angle if axis in ('y', 'z') else angle))
        return b


def box(x1, y1, z1, x2, y2, z2, tex, **kw) -> Box:
    return Box((x1, y1, z1), (x2, y2, z2), tex, **kw)


def _proj(face, frm, to):
    x1, y1, z1 = frm
    x2, y2, z2 = to
    if face == 'north':
        return [16 - x2, 16 - y2, 16 - x1, 16 - y1]
    if face == 'south':
        return [x1, 16 - y2, x2, 16 - y1]
    if face == 'west':
        return [z1, 16 - y2, z2, 16 - y1]
    if face == 'east':
        return [16 - z2, 16 - y2, 16 - z1, 16 - y1]
    if face == 'up':
        return [x1, z1, x2, z2]
    return [x1, 16 - z2, x2, 16 - z1]


def _fit(a, b):
    """Keep a UV interval inside 0..16 (shift when it fits, otherwise squash)."""
    span = b - a
    if span > 16:
        return 0.0, 16.0
    if a < 0:
        return 0.0, span
    if b > 16:
        return 16.0 - span, 16.0
    return a, b


def element_json(b: Box) -> dict:
    faces = {}
    for f in FACES:
        if f in b.skip:
            continue
        tex = b.faces.get(f, b.tex)
        if tex is None:
            continue
        if f in b.uv:
            uv = b.uv[f]
            if uv == 'full':
                uv = [0, 0, 16, 16]
        else:
            u1, v1, u2, v2 = _proj(f, b.frm, b.to)
            u1, u2 = _fit(u1, u2)
            v1, v2 = _fit(v1, v2)
            uv = [u1, v1, u2, v2]
        face = {'uv': [_num(v) for v in uv], 'texture': '#' + tex}
        if b.rot is None:
            if (f == 'north' and b.frm[2] <= 0) or (f == 'south' and b.to[2] >= 16) or \
                    (f == 'west' and b.frm[0] <= 0) or (f == 'east' and b.to[0] >= 16) or \
                    (f == 'down' and b.frm[1] <= 0) or (f == 'up' and b.to[1] >= 16):
                face['cullface'] = f
        if b.tint is not None:
            face['tintindex'] = b.tint
        faces[f] = face
    el = {'from': [_num(v) for v in b.frm], 'to': [_num(v) for v in b.to], 'faces': faces}
    if b.rot:
        r = {'origin': [_num(v) for v in b.rot['origin']], 'axis': b.rot['axis'], 'angle': b.rot['angle']}
        if b.rot.get('rescale'):
            r['rescale'] = True
        el['rotation'] = r
    if not b.shade:
        el['shade'] = False
    return el


def _num(v):
    v = round(float(v), 4)
    return int(v) if v == int(v) else v


def template_json(boxes: list, display: dict | None = None, ao: bool = True) -> dict:
    out = {'parent': 'minecraft:block/block'}
    if not ao:
        out['ambientocclusion'] = False
    out['elements'] = [element_json(b) for b in boxes]
    if display:
        out['display'] = display
    return out


def collision_boxes(boxes: list) -> list:
    """Collision boxes clamped to the block, in north orientation."""
    out = []
    for b in boxes:
        if not b.collide or b.rot is not None:
            continue
        x1, y1, z1 = (max(0.0, min(16.0, v)) for v in b.frm)
        x2, y2, z2 = (max(0.0, min(16.0, v)) for v in b.to)
        if x2 - x1 < 0.5 or y2 - y1 < 0.5 or z2 - z1 < 0.5:
            continue
        out.append([_num(x1), _num(y1), _num(z1), _num(x2), _num(y2), _num(z2)])
    return out


# Display transforms for merged two-block item models.
TALL_ITEM_DISPLAY = {
    'gui': {'rotation': [30, 225, 0], 'translation': [0, -3.5, 0], 'scale': [0.4, 0.4, 0.4]},
    'ground': {'rotation': [0, 0, 0], 'translation': [0, 3, 0], 'scale': [0.2, 0.2, 0.2]},
    'fixed': {'rotation': [0, 0, 0], 'translation': [0, -4, 0], 'scale': [0.35, 0.35, 0.35]},
    'thirdperson_righthand': {'rotation': [75, 45, 0], 'translation': [0, 0, 0], 'scale': [0.25, 0.25, 0.25]},
    'firstperson_righthand': {'rotation': [0, 45, 0], 'translation': [0, -2, 0], 'scale': [0.25, 0.25, 0.25]},
    'firstperson_lefthand': {'rotation': [0, 225, 0], 'translation': [0, -2, 0], 'scale': [0.25, 0.25, 0.25]},
}

LONG_ITEM_DISPLAY = {
    'gui': {'rotation': [30, 160, 0], 'translation': [1.5, 0, 0], 'scale': [0.38, 0.38, 0.38]},
    'ground': {'rotation': [0, 0, 0], 'translation': [0, 3, 0], 'scale': [0.2, 0.2, 0.2]},
    'fixed': {'rotation': [0, 0, 0], 'translation': [0, 0, -4], 'scale': [0.35, 0.35, 0.35]},
    'thirdperson_righthand': {'rotation': [75, 45, 0], 'translation': [0, 0, 0], 'scale': [0.25, 0.25, 0.25]},
    'firstperson_righthand': {'rotation': [0, 45, 0], 'translation': [0, 0, 0], 'scale': [0.25, 0.25, 0.25]},
    'firstperson_lefthand': {'rotation': [0, 225, 0], 'translation': [0, 0, 0], 'scale': [0.25, 0.25, 0.25]},
}

WIDE_ITEM_DISPLAY = {
    'gui': {'rotation': [30, 205, 0], 'translation': [0, 0, 0], 'scale': [0.42, 0.42, 0.42]},
    'ground': {'rotation': [0, 0, 0], 'translation': [0, 3, 0], 'scale': [0.2, 0.2, 0.2]},
    'fixed': {'rotation': [0, 180, 0], 'translation': [0, 0, 0], 'scale': [0.4, 0.4, 0.4]},
    'thirdperson_righthand': {'rotation': [75, 45, 0], 'translation': [0, 0, 0], 'scale': [0.3, 0.3, 0.3]},
    'firstperson_righthand': {'rotation': [0, 45, 0], 'translation': [0, 0, 0], 'scale': [0.3, 0.3, 0.3]},
    'firstperson_lefthand': {'rotation': [0, 225, 0], 'translation': [0, 0, 0], 'scale': [0.3, 0.3, 0.3]},
}
