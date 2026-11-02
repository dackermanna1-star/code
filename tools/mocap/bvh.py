"""Minimal BVH reader + forward kinematics.

`read_bvh(path)` returns the joint hierarchy and the frames; `fk_bvh(...)` gives, per frame, the
world position (metres) and world rotation matrix of every joint (and of each End Site, keyed
'<joint>_end').
"""
import math
import numpy as np


def _rot(axis, deg):
    a = math.radians(deg)
    c, s = math.cos(a), math.sin(a)
    if axis == 'X':
        return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])
    if axis == 'Y':
        return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])


class Joint:
    def __init__(self, name, parent):
        self.name = name
        self.parent = parent
        self.offset = np.zeros(3)
        self.channels = []
        self.children = []
        self.end = None  # End Site offset


def read_bvh(path, unit=0.01):
    """unit: metres per BVH length unit (ACCAD and most BVH files are in centimetres)."""
    tokens = open(path, encoding='latin-1').read().split()
    i = 0
    joints = []
    stack = []
    cur = None
    while tokens[i] != 'MOTION':
        t = tokens[i]
        if t in ('ROOT', 'JOINT'):
            cur = Joint(tokens[i + 1], stack[-1] if stack else None)
            if cur.parent:
                cur.parent.children.append(cur)
            joints.append(cur)
            i += 2
        elif t == 'End':
            # End Site { OFFSET x y z }
            j = stack[-1]
            k = tokens.index('OFFSET', i)
            j.end = np.array([float(tokens[k + 1]), float(tokens[k + 2]), float(tokens[k + 3])]) * unit
            i = tokens.index('}', k) + 1
        elif t == '{':
            stack.append(cur)
            i += 1
        elif t == '}':
            stack.pop()
            cur = stack[-1] if stack else None
            i += 1
        elif t == 'OFFSET':
            cur.offset = np.array([float(tokens[i + 1]), float(tokens[i + 2]), float(tokens[i + 3])]) * unit
            i += 4
        elif t == 'CHANNELS':
            n = int(tokens[i + 1])
            cur.channels = tokens[i + 2:i + 2 + n]
            i += 2 + n
        else:
            i += 1
    i += 1  # MOTION
    assert tokens[i] == 'Frames:'
    nf = int(tokens[i + 1])
    assert tokens[i + 2] == 'Frame' and tokens[i + 3] == 'Time:'
    ft = float(tokens[i + 4])
    vals = np.array([float(x) for x in tokens[i + 5:]])
    nch = sum(len(j.channels) for j in joints)
    frames = vals[:nf * nch].reshape(nf, nch)
    return joints, frames, ft, unit


def fk_bvh(joints, frame, unit):
    """World positions and rotations for one frame."""
    pos, rot = {}, {}
    k = 0
    for j in joints:
        R = np.eye(3)
        p = np.zeros(3)
        for ch in j.channels:
            v = frame[k]
            k += 1
            if ch.endswith('position'):
                p['XYZ'.index(ch[0])] = v * unit
            else:
                R = R @ _rot(ch[0], v)
        if j.parent is None:
            pos[j.name] = p if any(c.endswith('position') for c in j.channels) else j.offset.copy()
            rot[j.name] = R
        else:
            pr = rot[j.parent.name]
            pos[j.name] = pos[j.parent.name] + pr @ j.offset
            rot[j.name] = pr @ R
        if j.end is not None:
            pos[j.name + '_end'] = pos[j.name] + rot[j.name] @ j.end
    return pos, rot
