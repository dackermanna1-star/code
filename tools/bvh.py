"""Minimal BVH reader with forward kinematics (numpy)."""
import numpy as np


def _rot(axis, deg):
    a = np.radians(deg)
    c, s = np.cos(a), np.sin(a)
    n = a.shape[0]
    R = np.zeros((n, 3, 3))
    if axis == "X":
        R[:, 0, 0] = 1; R[:, 1, 1] = c; R[:, 1, 2] = -s; R[:, 2, 1] = s; R[:, 2, 2] = c
    elif axis == "Y":
        R[:, 1, 1] = 1; R[:, 0, 0] = c; R[:, 0, 2] = s; R[:, 2, 0] = -s; R[:, 2, 2] = c
    else:
        R[:, 2, 2] = 1; R[:, 0, 0] = c; R[:, 0, 1] = -s; R[:, 1, 0] = s; R[:, 1, 1] = c
    return R


class BVH:
    def __init__(self, path):
        self.names, self.parents, self.offsets, self.channels = [], [], [], []
        lines = open(path).read().split("\n")
        stack = []
        i = 0
        while i < len(lines):
            t = lines[i].strip().split()
            i += 1
            if not t:
                continue
            if t[0] in ("ROOT", "JOINT"):
                self.names.append(t[1])
                self.parents.append(stack[-1] if stack else -1)
                stack.append(len(self.names) - 1)
                self.channels.append([])
                self.offsets.append(None)
            elif t[0] == "End":
                stack.append(None)
            elif t[0] == "OFFSET":
                if stack[-1] is not None:
                    self.offsets[stack[-1]] = [float(x) for x in t[1:4]]
            elif t[0] == "CHANNELS":
                self.channels[stack[-1]] = t[2:]
            elif t[0] == "}":
                stack.pop()
            elif t[0] == "MOTION":
                break
        self.frames = int(lines[i].split()[1])
        self.dt = float(lines[i + 1].split()[2])
        data = []
        for l in lines[i + 2:]:
            if l.strip():
                data.append([float(x) for x in l.split()])
        self.data = np.array(data)
        self.offsets = np.array(self.offsets)

    def fk(self, scale=0.01):
        """Global rotations (F,J,3,3) and positions (F,J,3) in metres."""
        F, J = len(self.data), len(self.names)
        R = np.zeros((F, J, 3, 3))
        P = np.zeros((F, J, 3))
        col = 0
        local_R, local_P = [], []
        for j in range(J):
            ch = self.channels[j]
            pos = np.tile(self.offsets[j], (F, 1)).astype(float)
            rot = np.tile(np.eye(3), (F, 1, 1))
            for c in ch:
                v = self.data[:, col]
                col += 1
                if c.endswith("position"):
                    pos[:, "XYZ".index(c[0])] = v
                else:
                    rot = rot @ _rot(c[0], v)
            local_R.append(rot)
            local_P.append(pos)
        for j in range(J):
            p = self.parents[j]
            if p < 0:
                R[:, j] = local_R[j]
                P[:, j] = local_P[j]
            else:
                R[:, j] = R[:, p] @ local_R[j]
                P[:, j] = P[:, p] + np.einsum("fij,fj->fi", R[:, p], local_P[j])
        return R, P * scale

    def index(self, name):
        return self.names.index(name)
