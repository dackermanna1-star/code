"""Minimal Acclaim ASF/AMC reader + forward kinematics for the CMU motion-capture database.

Positions come out in metres in the CMU world frame (Y up). For every frame `fk()` returns, per
bone, the world position of the bone's end and its world rotation relative to the bind pose.
"""
import math
import numpy as np

UNIT = (1.0 / 0.45) * 0.0254  # CMU length units -> metres


def euler_xyz(rx, ry, rz):
    """Static-axis XYZ Euler (degrees) -> matrix = Rz @ Ry @ Rx (the Acclaim convention)."""
    x, y, z = math.radians(rx), math.radians(ry), math.radians(rz)
    cx, sx, cy, sy, cz, sz = math.cos(x), math.sin(x), math.cos(y), math.sin(y), math.cos(z), math.sin(z)
    Rx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])
    Ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    Rz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    return Rz @ Ry @ Rx


class Bone:
    def __init__(self, name):
        self.name = name
        self.direction = np.zeros(3)
        self.length = 0.0
        self.axis = (0.0, 0.0, 0.0)
        self.dofs = []
        self.parent = None
        self.children = []
        self.C = np.eye(3)
        self.Cinv = np.eye(3)


def read_asf(path):
    bones = {'root': Bone('root')}
    lines = [l.strip() for l in open(path, encoding='latin-1')]
    i = 0
    section = None
    cur = None
    while i < len(lines):
        l = lines[i]
        i += 1
        if not l or l.startswith('#'):
            continue
        if l.startswith(':'):
            section = l.split()[0]
            continue
        if section == ':bonedata':
            t = l.split()
            if t[0] == 'begin':
                cur = None
            elif t[0] == 'name':
                cur = Bone(t[1])
                bones[t[1]] = cur
            elif t[0] == 'direction':
                cur.direction = np.array([float(v) for v in t[1:4]])
            elif t[0] == 'length':
                cur.length = float(t[1]) * UNIT
            elif t[0] == 'axis':
                cur.axis = tuple(float(v) for v in t[1:4])
            elif t[0] == 'dof':
                cur.dofs = [d.lower() for d in t[1:]]
        elif section == ':hierarchy':
            t = l.split()
            if t[0] in ('begin', 'end'):
                continue
            p = bones[t[0]]
            for c in t[1:]:
                bones[c].parent = p
                p.children.append(bones[c])
    for b in bones.values():
        b.C = euler_xyz(*b.axis)
        b.Cinv = b.C.T
    return bones


def read_amc(path):
    frames = []
    cur = None
    for l in open(path, encoding='latin-1'):
        l = l.strip()
        if not l or l.startswith('#') or l.startswith(':'):
            continue
        t = l.split()
        if t[0].isdigit() and len(t) == 1:
            cur = {}
            frames.append(cur)
            continue
        if cur is not None:
            cur[t[0]] = [float(v) for v in t[1:]]
    return frames


def fk(bones, frame):
    """World end positions (m) and world rotations (relative to bind) for one AMC frame."""
    pos, rot = {}, {}
    r = frame['root']
    pos['root'] = np.array(r[0:3]) * UNIT
    rot['root'] = euler_xyz(r[3], r[4], r[5])

    def walk(b):
        for c in b.children:
            vals = frame.get(c.name, [])
            d = {'rx': 0.0, 'ry': 0.0, 'rz': 0.0}
            for k, v in zip(c.dofs, vals):
                d[k] = v
            M = euler_xyz(d['rx'], d['ry'], d['rz'])
            R = rot[b.name] @ c.C @ M @ c.Cinv
            rot[c.name] = R
            pos[c.name] = pos[b.name] + c.length * (R @ c.direction)
            walk(c)

    walk(bones['root'])
    return pos, rot
