#!/usr/bin/env python3
"""Design aid for animation clips: prints where an arm (hand) and its held blade point for
ModelPart-style Euler angles, using exactly the conventions of Visceral's pose system.

Model space: +x = entity's left, +y = down, -z = forward. Output is in entity space
(right, up, forward). Arm rotation = Rz(z) Ry(y) Rx(x) Ry(twist); the torso (body) rotation is
applied on top. Held items: blade along item +y, item frame = Rx(-90) Ry(180) of the arm frame,
then the clip's item roll (about item z) and pitch (about item x).

usage: python3 tools/pose_helper.py x y z [twist] [itemPitch] [itemRoll] [bodyX bodyY bodyZ]
"""
import math
import sys

import numpy as np


def rx(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])


def ry(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])


def rz(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])


def d(v):
    return math.radians(v)


def part(x, y, z, twist=0.0):
    return rz(d(z)) @ ry(d(y)) @ rx(d(x)) @ ry(d(twist))


def to_entity(v):
    return np.array([-v[0], -v[1], -v[2]])


def _mm(a, b):
    return tuple(tuple(sum(a[i][k] * b[k][j] for k in range(3)) for j in range(3)) for i in range(3))


def _rx(a):
    c, s = math.cos(a), math.sin(a)
    return ((1, 0, 0), (0, c, -s), (0, s, c))


def _ry(a):
    c, s = math.cos(a), math.sin(a)
    return ((c, 0, s), (0, 1, 0), (-s, 0, c))


def _rz(a):
    c, s = math.cos(a), math.sin(a)
    return ((c, -s, 0), (s, c, 0), (0, 0, 1))


def _part(x, y, z, twist=0.0):
    m = _mm(_rz(math.radians(z)), _ry(math.radians(y)))
    m = _mm(m, _rx(math.radians(x)))
    if twist:
        m = _mm(m, _ry(math.radians(twist)))
    return m


_ITEM_BASE = _mm(_rx(math.radians(-90)), _ry(math.radians(180)))


def describe(x, y, z, twist=0, pitch=0, roll=0, bx=0, by=0, bz=0):
    """Hand and blade directions in entity space (right, up, forward) as numpy arrays."""
    arm = _mm(_part(bx, by, bz), _part(x, y, z, twist))
    item = _ITEM_BASE
    if roll:
        item = _mm(item, _rz(math.radians(roll)))
    if pitch:
        item = _mm(item, _rx(math.radians(pitch)))
    full = _mm(arm, item)
    hand = np.array([-arm[0][1], -arm[1][1], -arm[2][1]])
    blade = np.array([-full[0][1], -full[1][1], -full[2][1]])
    return hand, blade


def fmt(v):
    return "right=%+.2f up=%+.2f fwd=%+.2f" % tuple(v)


if __name__ == "__main__":
    vals = [float(a) for a in sys.argv[1:]]
    vals += [0.0] * (9 - len(vals))
    x, y, z, tw, pitch, roll, bx, by, bz = vals[:9]
    hand, blade = describe(x, y, z, tw, pitch, roll, bx, by, bz)
    print("hand :", fmt(hand))
    print("blade:", fmt(blade))


def solve(hand_target, blade_target, pitch=None, body=(0, 0, 0), seed=0, iters=6000, prefer=(0, 0, 0, 0)):
    """Finds arm Euler angles (x, y, z, twist[, pitch]) whose hand/blade directions match the
    targets (entity space, normalised). Random search plus local refinement; a weak prior keeps
    angles small and close to {@code prefer}."""
    rng = np.random.default_rng(seed)
    ht = np.array(hand_target, float)
    ht /= np.linalg.norm(ht)
    bt = np.array(blade_target, float)
    bt /= np.linalg.norm(bt)

    def cost(p):
        x, y, z, tw, pt = p
        hand, blade = describe(x, y, z, tw, pt if pitch is None else pitch, 0, *body)
        c = np.sum((hand - ht) ** 2) * 3 + np.sum((blade - bt) ** 2)
        c += 1e-6 * ((x - prefer[0]) ** 2 + (y - prefer[1]) ** 2 + (z - prefer[2]) ** 2 + 0.3 * (tw - prefer[3]) ** 2)
        return c

    best = None
    for _ in range(iters):
        p = np.array([rng.uniform(-200, 60), rng.uniform(-120, 120), rng.uniform(-90, 90), rng.uniform(-180, 180), rng.uniform(-100, 20)])
        c = cost(p)
        if best is None or c < best[0]:
            best = (c, p)
    c, p = best
    step = 20.0
    while step > 0.05:
        improved = False
        for i in range(5):
            for s in (-step, step):
                q = p.copy()
                q[i] += s
                cq = cost(q)
                if cq < c:
                    c, p, improved = cq, q, True
        if not improved:
            step *= 0.5
    if pitch is not None:
        p[4] = pitch
    return c, [round(float(v), 1) for v in p]
