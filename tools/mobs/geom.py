"""Model geometry for the custom animals: a tiny DSL of parts and boxes that mirrors Minecraft's
model layers (pixel units, y down, ground at y=24, head towards -z, left side at +x), with

* the exact box-UV face layout and part transforms Minecraft uses, so that every texel of a
  texture can be mapped to its point on the 3D model for painting,
* automatic packing of the boxes into a texture atlas, and
* Java code generation of the matching LayerDefinition.
"""
import math

import numpy as np


class Box:
    def __init__(self, x, y, z, w, h, d, inflate=0.0, tag=None):
        self.origin = (float(x), float(y), float(z))
        self.size = (int(w), int(h), int(d))
        assert (w, h, d) == self.size, 'box sizes must be whole pixels: %r' % ((w, h, d),)
        self.inflate = float(inflate)
        self.tag = tag
        self.uv = None


class Part:
    def __init__(self, name, pivot=(0, 0, 0), rot=(0, 0, 0)):
        self.name = name
        self.pivot = tuple(float(v) for v in pivot)
        self.rot = tuple(float(v) for v in rot)
        self.boxes = []
        self.children = []

    def box(self, x, y, z, w, h, d, inflate=0.0, tag=None):
        self.boxes.append(Box(x, y, z, w, h, d, inflate, tag))
        return self

    def child(self, name, pivot=(0, 0, 0), rot=(0, 0, 0)):
        part = Part(name, pivot, rot)
        self.children.append(part)
        return part

    def walk(self, path=()):
        here = path + (self.name,)
        yield self, here
        for c in self.children:
            yield from c.walk(here)


class Model:
    def __init__(self, name):
        self.name = name
        self.root = Part('root')
        self.tex_w = self.tex_h = 0

    def part(self, name, pivot=(0, 0, 0), rot=(0, 0, 0)):
        return self.root.child(name, pivot, rot)

    def parts(self):
        return [(p, path[1:]) for p, path in self.root.walk() if p is not self.root]

    def find(self, name):
        for p, path in self.parts():
            if p.name == name:
                return p, path
        raise KeyError(name)

    def world(self, name, point):
        """Model-space position of a point given in the local frame of the named part."""
        _, path = self.find(name)
        m = np.eye(4)
        node = self.root
        for nm in path:
            node = next(c for c in node.children if c.name == nm)
            m = m @ transform(node.pivot, node.rot)
        return np.array(apply(m, point))

    # ------------------------------------------------------------------ uv packing
    def pack(self, sizes=((64, 32), (64, 64), (128, 64), (128, 128), (256, 128), (256, 256))):
        boxes = [b for p, _ in self.parts() for b in p.boxes]
        need = [(b, 2 * (b.size[2] + b.size[0]), b.size[2] + b.size[1]) for b in boxes]
        need.sort(key=lambda t: (-t[2], -t[1]))
        for tw, th in sizes:
            x = y = row = 0
            placed = []
            ok = True
            for b, w, h in need:
                if w > tw:
                    ok = False
                    break
                if x + w > tw:
                    x = 0
                    y += row
                    row = 0
                if y + h > th:
                    ok = False
                    break
                placed.append((b, x, y))
                x += w
                row = max(row, h)
            if ok:
                for b, u, v in placed:
                    b.uv = (u, v)
                self.tex_w, self.tex_h = tw, th
                return
        raise ValueError('model %s does not fit any texture size' % self.name)

    # ------------------------------------------------------------------ geometry
    def quads(self):
        """All faces as dicts with 4 vertices (model-space pixel xyz, texel uv), normal, part name and
        box tag, in the same layout Minecraft uses."""
        out = []

        def rec(part, matrix, path):
            m = matrix @ transform(part.pivot, part.rot)
            for b in part.boxes:
                for q in box_quads(b):
                    verts = [(*apply(m, v[:3]), v[3], v[4]) for v in q['verts']]
                    n = m[:3, :3] @ np.array(q['normal'])
                    out.append({'verts': verts, 'normal': tuple(n), 'part': part.name, 'path': path + (part.name,),
                                'tag': b.tag, 'face': q['face']})
            for c in part.children:
                rec(c, m, path + (part.name,))

        for c in self.root.children:
            rec(c, np.eye(4), ())
        return out

    # ------------------------------------------------------------------ java
    def java(self, method):
        lines = ['\tpublic static LayerDefinition %s() {' % method,
                 '\t\tMeshDefinition mesh = new MeshDefinition();',
                 '\t\tPartDefinition root = mesh.getRoot();']
        counter = [0]

        def rec(part, parent_var):
            counter[0] += 1
            var = 'p%d' % counter[0]
            cubes = 'CubeListBuilder.create()'
            for b in part.boxes:
                x, y, z = b.origin
                w, h, d = b.size
                if b.inflate:
                    cubes += '.texOffs(%d, %d).addBox(%sF, %sF, %sF, %sF, %sF, %sF, new CubeDeformation(%sF))' % (
                        b.uv[0], b.uv[1], f(x), f(y), f(z), f(w), f(h), f(d), f(b.inflate))
                else:
                    cubes += '.texOffs(%d, %d).addBox(%sF, %sF, %sF, %sF, %sF, %sF)' % (
                        b.uv[0], b.uv[1], f(x), f(y), f(z), f(w), f(h), f(d))
            px, py, pz = part.pivot
            rx, ry, rz = part.rot
            if rx or ry or rz:
                pose = 'PartPose.offsetAndRotation(%sF, %sF, %sF, %sF, %sF, %sF)' % (f(px), f(py), f(pz), f(rx), f(ry), f(rz))
            else:
                pose = 'PartPose.offset(%sF, %sF, %sF)' % (f(px), f(py), f(pz))
            decl = '\t\tPartDefinition %s = ' % var if part.children else '\t\t'
            lines.append('%s%s.addOrReplaceChild("%s", %s, %s);' % (decl, parent_var, part.name, cubes, pose))
            for c in part.children:
                rec(c, var)

        for c in self.root.children:
            rec(c, 'root')
        lines.append('\t\treturn LayerDefinition.create(mesh, %d, %d);' % (self.tex_w, self.tex_h))
        lines.append('\t}')
        return '\n'.join(lines)


def f(v):
    s = ('%.4f' % v).rstrip('0').rstrip('.')
    return '0.0' if s in ('', '-0') else (s if '.' in s else s + '.0')


def transform(pivot, rot):
    """Matrix of ModelPart.translateAndRotate: translate, then rotate with Quaternionf.rotationZYX."""
    t = np.eye(4)
    t[:3, 3] = pivot
    rx, ry, rz = rot
    cx, sx, cy, sy, cz, sz = math.cos(rx), math.sin(rx), math.cos(ry), math.sin(ry), math.cos(rz), math.sin(rz)
    mx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])
    my = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    mz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    r = np.eye(4)
    r[:3, :3] = mz @ my @ mx
    return t @ r


def apply(m, p):
    v = m @ np.array([p[0], p[1], p[2], 1.0])
    return (float(v[0]), float(v[1]), float(v[2]))


def box_quads(b):
    """The six faces of a box exactly as ModelPart.Cube builds them (vertex positions in pixels,
    texture coordinates in texels)."""
    x0, y0, z0 = b.origin
    w, h, d = b.size
    g = b.inflate
    fx, fy, fz = x0 - g, y0 - g, z0 - g
    sx, sy, sz = x0 + w + g, y0 + h + g, z0 + d + g
    v1, v2, v3, v4 = (fx, fy, fz), (sx, fy, fz), (sx, sy, fz), (fx, sy, fz)
    v5, v6, v7, v8 = (fx, fy, sz), (sx, fy, sz), (sx, sy, sz), (fx, sy, sz)
    i, j = b.uv
    U = [i, i + d, i + d + w, i + d + w + w, i + d + w + d, i + d + w + d + w]
    V = [j, j + d, j + d + h]
    faces = [
        ('down', [v6, v5, v1, v2], U[1], V[0], U[2], V[1], (0, -1, 0)),
        ('up', [v3, v4, v8, v7], U[2], V[1], U[3], V[0], (0, 1, 0)),
        ('west', [v1, v5, v8, v4], U[0], V[1], U[1], V[2], (-1, 0, 0)),
        ('north', [v2, v1, v4, v3], U[1], V[1], U[2], V[2], (0, 0, -1)),
        ('east', [v6, v2, v3, v7], U[2], V[1], U[4], V[2], (1, 0, 0)),
        ('south', [v5, v6, v7, v8], U[4], V[1], U[5], V[2], (0, 0, 1)),
    ]
    out = []
    for name, vs, ua, va, ub, vb, normal in faces:
        uvs = [(ub, va), (ua, va), (ua, vb), (ub, vb)]
        out.append({'face': name, 'normal': normal, 'verts': [(*vs[k], uvs[k][0], uvs[k][1]) for k in range(4)]})
    return out
