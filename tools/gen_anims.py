#!/usr/bin/env python3
"""Authors Visceral's animation clips from semantic key poses.

Run from the repository root:  python3 tools/gen_anims.py

Attack keys are written as *what the body is doing* (where the weapon hand points, where the
blade points, how the torso twists and leans, how the weight shifts) in entity space:
(right, up, forward). The arm Euler angles that realise each key are solved numerically
(tools/pose_helper.py) and written as clip JSON into
src/main/resources/assets/visceral/visceral_animations/. Those JSON files are the shipped
assets and can be hand-tuned or overridden by resource packs; this script just keeps the
authoring reproducible.

Conventions (see AnimClip.java): bone rotations are ModelPart Euler degrees [x, y, z, twist];
body x+ = bend forward, y+ = twist chest to the right; legs x- = forward; root rot =
[pitch forward, yaw left, roll right]; root pos = [right, up, forward] blocks; item channel =
[pitch (blade towards arm axis), roll (about arm)].
"""
import json
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from pose_helper import describe  # noqa: E402

OUT = os.path.join(os.path.dirname(__file__), "..", "src", "main", "resources", "assets", "visceral", "visceral_animations")
T = 0.05  # seconds per tick


# ---------------------------------------------------------------------------------------------
# Arm solver with continuity
# ---------------------------------------------------------------------------------------------

def _norm(v):
    v = np.array(v, float)
    n = np.linalg.norm(v)
    return v / n if n > 1e-9 else v


def solve_arm(hand, blade=None, body=(0, 0, 0), pitch=None, start=None):
    """Returns (x, y, z, twist, pitch) for an arm whose hand points along `hand` and held blade
    along `blade` (entity space), given the torso rotation `body` (Euler deg, local)."""
    ht = _norm(hand)
    bt = _norm(blade) if blade is not None else None

    def cost(p):
        x, y, z, tw, pt = p
        h, b = describe(x, y, z, tw, pt if pitch is None else pitch, 0, *body)
        c = 3 * np.sum((h - ht) ** 2)
        if bt is not None:
            c += np.sum((b - bt) ** 2)
        else:
            c += 1e-4 * (tw ** 2)
        # Prefer small, natural angles and continuity with the previous key.
        ref = start if start is not None else np.zeros(5)
        c += 2e-6 * float(np.sum((np.array(p) - ref) ** 2))
        return c

    def refine(p):
        c = cost(p)
        step = 16.0
        while step > 0.05:
            improved = False
            for i in range(5):
                if i == 4 and (pitch is not None or bt is None):
                    continue
                for s in (-step, step):
                    q = p.copy()
                    q[i] += s
                    cq = cost(q)
                    if cq < c:
                        c, p, improved = cq, q, True
            if not improved:
                step *= 0.5
        return c, p

    candidates = []
    if start is not None:
        candidates.append(refine(np.array(start, float)))
    rng = np.random.default_rng(1234)
    seeds = [np.array([rng.uniform(-200, 60), rng.uniform(-110, 110), rng.uniform(-80, 80), rng.uniform(-180, 180), rng.uniform(-90, 10)])
             for _ in range(160)]
    seeds.sort(key=cost)
    for s in seeds[:4]:
        candidates.append(refine(s))
    c, p = min(candidates, key=lambda cp: cp[0])
    if pitch is not None:
        p[4] = pitch
    if bt is None and pitch is None:
        p[4] = 0
    if c > 0.03:
        print(f"  warning: arm solve residual {c:.3f} for hand={hand} blade={blade} body={body}", file=sys.stderr)
    return [round(float(v), 1) for v in p]


# ---------------------------------------------------------------------------------------------
# Clip builder
# ---------------------------------------------------------------------------------------------

class Clip:
    def __init__(self, name, length, blend_in=0.05, blend_out=0.15, additive=("root",), pivot=None, loop=False):
        self.name = name
        self.length = round(length, 3)
        self.blend_in = blend_in
        self.blend_out = blend_out
        self.additive = list(additive)
        self.pivot = pivot
        self.loop = loop
        self.tracks = {}
        self.events = {}
        self._prev_arm = {}

    def _key(self, bone, chan, t, values, interp=None):
        k = [round(t, 3)] + [round(float(v), 2) for v in values]
        if interp:
            k.append(interp)
        self.tracks.setdefault(bone, {}).setdefault(chan, []).append(k)

    def key(self, t, body=None, head=None, rarm=None, larm=None, rleg=None, lleg=None, root=None, rootpos=None, interp=None,
            rarm_raw=None, larm_raw=None):
        """rarm/larm: dict(hand=..., blade=..., pitch=...) solved in the current body frame."""
        bodyrot = tuple(body) if body is not None else (0, 0, 0)
        if body is not None:
            self._key("body", "rot", t, body, interp)
        if head is not None:
            self._key("head", "rot", t, head, interp)
        for side, spec, raw in (("right", rarm, rarm_raw), ("left", larm, larm_raw)):
            bone = side + "_arm"
            if raw is not None:
                self._key(bone, "rot", t, raw, interp)
                continue
            if spec is None:
                continue
            sol = solve_arm(spec["hand"], spec.get("blade"), bodyrot, spec.get("pitch"), self._prev_arm.get(bone))
            self._prev_arm[bone] = np.array(sol)
            x, y, z, tw, pt = sol
            self._key(bone, "rot", t, [x, y, z, tw], interp)
            if spec.get("off") is not None:
                self._key(bone, "pos", t, list(spec["off"]), interp)
            if spec.get("blade") is not None or spec.get("pitch") is not None:
                self._key(side + "_item", "rot", t, [pt, 0, 0], interp)
        for bone, spec in (("right_leg", rleg), ("left_leg", lleg)):
            if spec is None:
                continue
            spec = list(spec)
            rot = spec[:3] + [0] * (3 - len(spec[:3]))
            self._key(bone, "rot", t, rot, interp)
            if len(spec) > 3:
                self._key(bone, "pos", t, [0, spec[3], 0], interp)
        if root is not None:
            self._key("root", "rot", t, root, interp)
        if rootpos is not None:
            self._key("root", "pos", t, rootpos, interp)
        return self

    def event(self, name, t):
        self.events[name] = round(t, 3)
        return self

    def write(self):
        bones = {}
        for bone, chans in self.tracks.items():
            bones[bone] = {c: sorted(v, key=lambda k: k[0]) for c, v in chans.items()}
        data = {"length": self.length, "blend_in": self.blend_in, "blend_out": self.blend_out}
        if self.loop:
            data["loop"] = True
        if self.pivot:
            data["root_pivot"] = self.pivot
        data["additive"] = self.additive
        if self.events:
            data["events"] = self.events
        data["bones"] = bones
        os.makedirs(OUT, exist_ok=True)
        with open(os.path.join(OUT, self.name + ".json"), "w") as f:
            json.dump(data, f, indent=1)
        print("wrote", self.name)


def timing(w, a, r):
    """Key times for a windup/active/recovery attack (ticks): start, cocked, impact, end, total."""
    return 0.0, w * T, (w + a * 0.5) * T, (w + a) * T, (w + a + r) * T


# Common guard poses ---------------------------------------------------------------------------
SWORD_GUARD_R = dict(hand=(0.25, -0.45, 0.85), blade=(0.05, 0.75, 0.65))
SWORD_GUARD_L = dict(hand=(-0.15, -0.75, 0.6))
FIST_GUARD_R = dict(hand=(-0.12, -0.62, 0.78), off=(0, 0.5, 1.2))
FIST_GUARD_L = dict(hand=(0.14, -0.5, 0.86), off=(0, 0, 0.6))
LEGS_STANCE = ((6, 0, 2), (-6, 0, -2))


def sword_slash_r(name="sword_slash_r", w=4, a=3, r=7, wide=1.0, legs=True):
    t0, tw, ti, te, tt = timing(w, a, r)
    c = Clip(name, tt, blend_in=0.04, blend_out=0.16)
    c.key(t0, body=(4, 0, 0), rarm=SWORD_GUARD_R, larm=SWORD_GUARD_L)
    c.key(tw, body=(2, 34 * wide, -4), rarm=dict(hand=(0.85, 0.4, -0.3), blade=(0.25, 0.35, -0.9)),
          larm=dict(hand=(-0.05, -0.35, 0.94)), root=(-2, 8, 0), rootpos=(0, 0, -0.04))
    c.key(ti, body=(8, 0, 2), rarm=dict(hand=(0.02, 0.05, 1.0), blade=(-0.55, -0.05, 0.83)),
          larm=dict(hand=(-0.55, -0.45, 0.7)), root=(3, 0, 0), rootpos=(0, -0.03, 0.12))
    c.key(te, body=(12, -36 * wide, 4), rarm=dict(hand=(-0.8, -0.25, 0.55), blade=(-0.85, -0.3, -0.2)),
          larm=dict(hand=(-0.6, -0.6, -0.5)), root=(4, -6, 0), rootpos=(0, -0.04, 0.16))
    c.key(te + 0.12, body=(10, -40 * wide, 4), rarm=dict(hand=(-0.7, -0.5, 0.45), blade=(-0.45, -0.55, -0.6)),
          larm=dict(hand=(-0.5, -0.7, -0.4)), root=(2, -6, 0), rootpos=(0, -0.03, 0.12))
    c.key(tt, body=(4, 0, 0), rarm=SWORD_GUARD_R, larm=SWORD_GUARD_L, root=(0, 0, 0), rootpos=(0, 0, 0))
    if legs:
        c.key(t0, rleg=LEGS_STANCE[0], lleg=LEGS_STANCE[1])
        c.key(tw, rleg=(14, 0, 4), lleg=(-10, 0, -3))
        c.key(te, rleg=(18, 0, 3), lleg=(-24, 0, -2, -1.0))
        c.key(tt, rleg=LEGS_STANCE[0], lleg=LEGS_STANCE[1])
    c.event("impact", ti)
    c.write()


def sword_slash_l():
    t0, tw, ti, te, tt = timing(3, 3, 7)
    c = Clip("sword_slash_l", tt, blend_in=0.04, blend_out=0.16)
    c.key(t0, body=(4, 0, 0), rarm=SWORD_GUARD_R, larm=SWORD_GUARD_L, rleg=LEGS_STANCE[0], lleg=LEGS_STANCE[1])
    c.key(tw, body=(8, -34, 3), rarm=dict(hand=(-0.75, -0.35, 0.5), blade=(-0.55, 0.05, -0.8)),
          larm=dict(hand=(-0.3, -0.8, -0.4)), root=(1, -6, 0), rleg=(-8, 0, 2), lleg=(12, 0, -2))
    c.key(ti, body=(4, 0, 0), rarm=dict(hand=(0.05, 0.12, 0.99), blade=(0.5, 0.2, 0.85)),
          larm=dict(hand=(-0.5, -0.6, 0.2)), root=(2, 0, 0), rootpos=(0, -0.02, 0.1))
    c.key(te, body=(-2, 32, -3), rarm=dict(hand=(0.8, 0.38, 0.45), blade=(0.7, 0.5, -0.25)),
          larm=dict(hand=(-0.55, -0.55, 0.6)), root=(0, 6, 0), rootpos=(0, 0, 0.12), rleg=(-16, 0, 3, -0.8), lleg=(14, 0, -3))
    c.key(te + 0.12, body=(0, 36, -3), rarm=dict(hand=(0.7, 0.25, 0.6), blade=(0.3, 0.75, -0.55)),
          larm=dict(hand=(-0.45, -0.7, 0.5)), root=(0, 5, 0), rootpos=(0, 0, 0.1))
    c.key(tt, body=(4, 0, 0), rarm=SWORD_GUARD_R, larm=SWORD_GUARD_L, root=(0, 0, 0), rootpos=(0, 0, 0),
          rleg=LEGS_STANCE[0], lleg=LEGS_STANCE[1])
    c.event("impact", ti)
    c.write()


def overhead(name, w, a, r, two_handed=False, finisher=False):
    t0, tw, ti, te, tt = timing(w, a, r)
    c = Clip(name, tt, blend_in=0.05, blend_out=0.18)
    guard_r = AXE_GUARD_R if two_handed else SWORD_GUARD_R
    guard_l = AXE_GUARD_L if two_handed else SWORD_GUARD_L
    c.key(t0, body=(4, 0, 0), rarm=guard_r, larm=guard_l, rleg=LEGS_STANCE[0], lleg=LEGS_STANCE[1])
    lift = dict(hand=(0.12, 0.96, -0.2), blade=(0.0, 0.15, -0.99))
    c.key(tw * 0.6, body=(-8, 6, 0), rarm=lift, larm=dict(hand=(0.02, 0.97, -0.1)) if two_handed else dict(hand=(-0.45, 0.4, 0.8)),
          root=(-4, 0, 0), rootpos=(0, 0.02, -0.06), rleg=(12, 0, 3), lleg=(-6, 0, -3))
    c.key(tw, body=(-12, 8, 0), rarm=dict(hand=(0.1, 0.9, -0.42), blade=(0.0, -0.2, -0.98)),
          larm=dict(hand=(0.0, 0.92, -0.38)) if two_handed else dict(hand=(-0.5, 0.35, 0.79)), root=(-6, 0, 0), rootpos=(0, 0.02, -0.08))
    c.key(ti, body=(14, 0, 0), rarm=dict(hand=(0.06, 0.55, 0.83), blade=(0.0, 0.62, 0.78)),
          larm=dict(hand=(-0.02, 0.5, 0.86)) if two_handed else dict(hand=(-0.55, -0.2, 0.8)), root=(4, 0, 0), rootpos=(0, -0.04, 0.12))
    down = (0.0, -0.65, 0.76) if not finisher else (0.0, -0.8, 0.6)
    c.key(te, body=(32 if not finisher else 40, -4, 0), rarm=dict(hand=(0.05, -0.38, 0.92), blade=down),
          larm=dict(hand=(-0.02, -0.42, 0.9)) if two_handed else dict(hand=(-0.55, -0.6, 0.55)), root=(6, 0, 0),
          rootpos=(0, -0.1 if finisher else -0.06, 0.2), rleg=(20, 0, 3, -0.8), lleg=(-26, 0, -3, -1.5))
    c.key(te + 0.15, body=(26, -4, 0), rarm=dict(hand=(0.05, -0.6, 0.8), blade=(0.0, -0.9, 0.42)),
          larm=dict(hand=(-0.02, -0.62, 0.78)) if two_handed else dict(hand=(-0.5, -0.7, 0.5)), root=(4, 0, 0), rootpos=(0, -0.06, 0.16))
    c.key(tt, body=(4, 0, 0), rarm=guard_r, larm=guard_l, root=(0, 0, 0), rootpos=(0, 0, 0), rleg=LEGS_STANCE[0], lleg=LEGS_STANCE[1])
    c.event("impact", ti)
    c.write()


def thrust(name, w, a, r, two_handed=False, low=False, big=False):
    t0, tw, ti, te, tt = timing(w, a, r)
    c = Clip(name, tt, blend_in=0.04, blend_out=0.16)
    guard_r = SPEAR_GUARD_R if two_handed else SWORD_GUARD_R
    guard_l = SPEAR_GUARD_L if two_handed else SWORD_GUARD_L
    dy = -0.25 if low else 0.0
    c.key(t0, body=(4, 0, 0), rarm=guard_r, larm=guard_l, rleg=LEGS_STANCE[0], lleg=LEGS_STANCE[1])
    c.key(tw, body=(0, 22, 0), rarm=dict(hand=(0.35, -0.75, -0.55), blade=(0.05, 0.05 + dy, 1.0)),
          larm=dict(hand=(0.05, -0.55, 0.83)) if two_handed else dict(hand=(-0.4, -0.25, 0.88)),
          root=(-3, 6, 0), rootpos=(0, -0.02, -0.08), rleg=(16, 0, 3), lleg=(-12, 0, -3))
    ext = (0.04, 0.0 + dy, 1.0)
    c.key(ti, body=(14, -12, 0), rarm=dict(hand=ext, blade=(0.0, dy, 1.0), pitch=-88),
          larm=dict(hand=(-0.02, -0.08 + dy, 1.0)) if two_handed else dict(hand=(-0.5, -0.65, -0.5)),
          root=(5, -4, 0), rootpos=(0, -0.05, 0.3 if big else 0.22), rleg=(24, 0, 3), lleg=(-32, 0, -3, -1.5))
    c.key(te, body=(18, -14, 0), rarm=dict(hand=ext, blade=(0.0, dy, 1.0), pitch=-88),
          larm=dict(hand=(-0.02, -0.08 + dy, 1.0)) if two_handed else dict(hand=(-0.5, -0.7, -0.45)),
          root=(6, -4, 0), rootpos=(0, -0.06, 0.38 if big else 0.28))
    c.key(te + 0.15, body=(10, -6, 0), rarm=dict(hand=(0.15, -0.35, 0.92), blade=(0.0, 0.1, 1.0), pitch=-60),
          larm=guard_l, root=(2, 0, 0), rootpos=(0, -0.02, 0.15))
    c.key(tt, body=(4, 0, 0), rarm=guard_r, larm=guard_l, root=(0, 0, 0), rootpos=(0, 0, 0), rleg=LEGS_STANCE[0], lleg=LEGS_STANCE[1])
    c.event("impact", ti)
    c.write()


AXE_GUARD_R = dict(hand=(0.18, -0.55, 0.82), blade=(-0.1, 0.7, 0.7))
AXE_GUARD_L = dict(hand=(0.05, -0.62, 0.78))
SPEAR_GUARD_R = dict(hand=(0.25, -0.75, 0.6), blade=(0.0, 0.1, 1.0))
SPEAR_GUARD_L = dict(hand=(-0.08, -0.45, 0.89))


def axe_chop(name="axe_chop", w=7, a=3, r=11, legs=True):
    t0, tw, ti, te, tt = timing(w, a, r)
    c = Clip(name, tt, blend_in=0.05, blend_out=0.2)
    c.key(t0, body=(4, 0, 0), rarm=AXE_GUARD_R, larm=AXE_GUARD_L)
    c.key(tw, body=(-6, 40, -6), rarm=dict(hand=(0.62, 0.72, -0.3), blade=(0.3, 0.25, -0.92)),
          larm=dict(hand=(0.5, 0.78, -0.2)), root=(-3, 10, 0), rootpos=(0, 0.01, -0.06))
    c.key(ti, body=(12, 6, 2), rarm=dict(hand=(0.3, 0.32, 0.9), blade=(-0.3, 0.45, 0.84)),
          larm=dict(hand=(0.22, 0.28, 0.93)), root=(4, 2, 0), rootpos=(0, -0.04, 0.14))
    c.key(te, body=(26, -32, 6), rarm=dict(hand=(-0.55, -0.5, 0.66), blade=(-0.6, -0.65, 0.35)),
          larm=dict(hand=(-0.48, -0.56, 0.67)), root=(6, -8, 0), rootpos=(0, -0.07, 0.2))
    c.key(te + 0.2, body=(20, -36, 6), rarm=dict(hand=(-0.6, -0.65, 0.45), blade=(-0.5, -0.8, -0.1)),
          larm=dict(hand=(-0.52, -0.7, 0.45)), root=(4, -8, 0), rootpos=(0, -0.05, 0.16))
    c.key(tt, body=(4, 0, 0), rarm=AXE_GUARD_R, larm=AXE_GUARD_L, root=(0, 0, 0), rootpos=(0, 0, 0))
    if legs:
        c.key(t0, rleg=LEGS_STANCE[0], lleg=LEGS_STANCE[1])
        c.key(tw, rleg=(16, 0, 5), lleg=(-10, 0, -4))
        c.key(te, rleg=(22, 0, 4), lleg=(-30, 0, -3, -1.5))
        c.key(tt, rleg=LEGS_STANCE[0], lleg=LEGS_STANCE[1])
    c.event("impact", ti)
    c.write()


def ground_finisher(name, w, a, r, two_handed):
    """Downward strike into a body lying in front of the feet."""
    t0, tw, ti, te, tt = timing(w, a, r)
    c = Clip(name, tt, blend_in=0.06, blend_out=0.2)
    guard_r = AXE_GUARD_R if two_handed else SWORD_GUARD_R
    guard_l = AXE_GUARD_L if two_handed else SWORD_GUARD_L
    c.key(t0, body=(4, 0, 0), rarm=guard_r, larm=guard_l, rleg=LEGS_STANCE[0], lleg=LEGS_STANCE[1], head=(0, 0, 0))
    c.key(tw, body=(-4, 0, 0), rarm=dict(hand=(0.05, 0.92, 0.38), blade=(0.0, -0.98, 0.18), pitch=None),
          larm=dict(hand=(-0.02, 0.92, 0.38)), root=(-2, 0, 0), rootpos=(0, 0.02, 0.0), rleg=(14, 0, 4), lleg=(-20, 0, -4),
          head=(20, 0, 0))
    c.key(ti, body=(30, 0, 0), rarm=dict(hand=(0.05, -0.2, 0.98), blade=(0.0, -0.98, 0.2)),
          larm=dict(hand=(-0.02, -0.2, 0.98)), root=(6, 0, 0), rootpos=(0, -0.18, 0.12), rleg=(22, 0, 4, -2.0), lleg=(-34, 0, -4, -2.5),
          head=(35, 0, 0))
    c.key(te, body=(34, 0, 0), rarm=dict(hand=(0.05, -0.62, 0.78), blade=(0.0, -0.99, 0.1)),
          larm=dict(hand=(-0.02, -0.62, 0.78)), root=(5, 0, 0), rootpos=(0, -0.22, 0.14), rleg=(24, 0, 4, -2.4), lleg=(-36, 0, -4, -2.6),
          head=(30, 0, 0))
    c.key(te + 0.25, body=(32, 0, 0), rarm=dict(hand=(0.05, -0.6, 0.8), blade=(0.0, -0.98, 0.15)),
          larm=dict(hand=(-0.02, -0.6, 0.8)), root=(5, 0, 0), rootpos=(0, -0.2, 0.13), head=(30, 0, 0))
    c.key(te + 0.4, body=(20, 0, 0), rarm=dict(hand=(0.1, -0.1, 0.99), blade=(0.0, -0.4, 0.92)),
          larm=dict(hand=(-0.02, -0.4, 0.9)), root=(3, 0, 0), rootpos=(0, -0.1, 0.06), head=(20, 0, 0))
    c.key(tt, body=(4, 0, 0), rarm=guard_r, larm=guard_l, root=(0, 0, 0), rootpos=(0, 0, 0), rleg=LEGS_STANCE[0], lleg=LEGS_STANCE[1],
          head=(0, 0, 0))
    c.event("impact", ti)
    c.write()


def spear_sweep():
    t0, tw, ti, te, tt = timing(6, 4, 9)
    c = Clip("spear_sweep", tt, blend_in=0.05, blend_out=0.18)
    c.key(t0, body=(4, 0, 0), rarm=SPEAR_GUARD_R, larm=SPEAR_GUARD_L, rleg=LEGS_STANCE[0], lleg=LEGS_STANCE[1])
    c.key(tw, body=(2, 40, -4), rarm=dict(hand=(0.75, -0.3, -0.55), blade=(0.6, 0.05, 0.8)),
          larm=dict(hand=(0.85, -0.25, 0.45)), root=(0, 10, 0), rleg=(14, 0, 4), lleg=(-10, 0, -4))
    c.key(ti, body=(8, 0, 0), rarm=dict(hand=(0.25, -0.4, 0.88), blade=(-0.6, -0.05, 0.8)),
          larm=dict(hand=(-0.15, -0.3, 0.94)), root=(3, 0, 0), rootpos=(0, -0.03, 0.08))
    c.key(te, body=(12, -38, 4), rarm=dict(hand=(-0.4, -0.45, 0.8), blade=(-0.95, -0.1, -0.2)),
          larm=dict(hand=(-0.85, -0.3, 0.42)), root=(4, -8, 0), rootpos=(0, -0.04, 0.1), rleg=(18, 0, 3), lleg=(-22, 0, -3, -1.0))
    c.key(tt, body=(4, 0, 0), rarm=SPEAR_GUARD_R, larm=SPEAR_GUARD_L, root=(0, 0, 0), rootpos=(0, 0, 0),
          rleg=LEGS_STANCE[0], lleg=LEGS_STANCE[1])
    c.event("impact", ti)
    c.write()


# --- Fists -----------------------------------------------------------------------------------

def jab():
    t0, tw, ti, te, tt = timing(2, 2, 4)
    c = Clip("fist_jab", tt, blend_in=0.03, blend_out=0.12)
    c.key(t0, body=(6, 0, 0), rarm=FIST_GUARD_R, larm=FIST_GUARD_L, rleg=(10, 0, 3), lleg=(-12, 0, -3))
    c.key(tw, body=(6, 6, 0), rarm=FIST_GUARD_R, larm=dict(hand=(0.1, -0.2, 0.97)), root=(1, 4, 0))
    c.key(ti, body=(10, 18, 0), rarm=FIST_GUARD_R, larm=dict(hand=(0.02, 0.1, 0.99), off=(0, -0.5, -3.0)), root=(3, 8, 0), rootpos=(0, -0.02, 0.06))
    c.key(te, body=(10, 18, 0), rarm=FIST_GUARD_R, larm=dict(hand=(0.02, 0.1, 0.99), off=(0, -0.5, -3.0)), root=(3, 8, 0), rootpos=(0, -0.02, 0.06))
    c.key(tt, body=(6, 0, 0), rarm=FIST_GUARD_R, larm=FIST_GUARD_L, root=(0, 0, 0), rootpos=(0, 0, 0), rleg=(10, 0, 3), lleg=(-12, 0, -3))
    c.event("impact", ti)
    c.write()


def cross():
    t0, tw, ti, te, tt = timing(3, 2, 5)
    c = Clip("fist_cross", tt, blend_in=0.03, blend_out=0.12)
    c.key(t0, body=(6, 0, 0), rarm=FIST_GUARD_R, larm=FIST_GUARD_L, rleg=(10, 0, 3), lleg=(-12, 0, -3))
    c.key(tw, body=(4, 10, 0), rarm=dict(hand=(0.15, -0.45, 0.88)), larm=FIST_GUARD_L, root=(0, 6, 0), rootpos=(0, 0, -0.03))
    c.key(ti, body=(12, -26, 0), rarm=dict(hand=(-0.08, 0.1, 0.99), off=(0, -0.5, -3.2)), larm=FIST_GUARD_L, root=(4, -10, 0),
          rootpos=(0, -0.03, 0.1), rleg=(18, 0, 3), lleg=(-16, 0, -3))
    c.key(te, body=(12, -26, 0), rarm=dict(hand=(-0.08, 0.1, 0.99), off=(0, -0.5, -3.2)), larm=FIST_GUARD_L, root=(4, -10, 0), rootpos=(0, -0.03, 0.1))
    c.key(tt, body=(6, 0, 0), rarm=FIST_GUARD_R, larm=FIST_GUARD_L, root=(0, 0, 0), rootpos=(0, 0, 0), rleg=(10, 0, 3), lleg=(-12, 0, -3))
    c.event("impact", ti)
    c.write()


def hook():
    t0, tw, ti, te, tt = timing(4, 3, 6)
    c = Clip("fist_hook", tt, blend_in=0.04, blend_out=0.14)
    c.key(t0, body=(6, 0, 0), rarm=FIST_GUARD_R, larm=FIST_GUARD_L, rleg=(10, 0, 3), lleg=(-12, 0, -3))
    c.key(tw, body=(6, -24, 0), rarm=FIST_GUARD_R, larm=dict(hand=(-0.92, 0.0, 0.38)), root=(0, -8, 0))
    c.key(ti, body=(10, 6, 0), rarm=FIST_GUARD_R, larm=dict(hand=(-0.35, 0.05, 0.93)), root=(2, 2, 0), rootpos=(0, -0.02, 0.05))
    c.key(te, body=(12, 30, 0), rarm=dict(hand=(-0.2, -0.4, 0.89)), larm=dict(hand=(0.55, 0.0, 0.83)), root=(3, 10, 0), rootpos=(0, -0.02, 0.06))
    c.key(tt, body=(6, 0, 0), rarm=FIST_GUARD_R, larm=FIST_GUARD_L, root=(0, 0, 0), rootpos=(0, 0, 0), rleg=(10, 0, 3), lleg=(-12, 0, -3))
    c.event("impact", ti)
    c.write()


def uppercut():
    t0, tw, ti, te, tt = timing(5, 3, 8)
    c = Clip("fist_uppercut", tt, blend_in=0.04, blend_out=0.16)
    c.key(t0, body=(6, 0, 0), rarm=FIST_GUARD_R, larm=FIST_GUARD_L, rleg=(10, 0, 3), lleg=(-12, 0, -3))
    c.key(tw, body=(16, 18, 0), rarm=dict(hand=(0.25, -0.95, 0.15)), larm=FIST_GUARD_L, root=(3, 6, 0), rootpos=(0, -0.12, 0),
          rleg=(14, 0, 3, -1.5), lleg=(-16, 0, -3, -1.5))
    c.key(ti, body=(0, -6, 0), rarm=dict(hand=(0.05, 0.25, 0.97)), larm=dict(hand=(0.25, -0.5, 0.83)), root=(0, -2, 0), rootpos=(0, 0, 0.06),
          rleg=(16, 0, 3), lleg=(-14, 0, -3))
    c.key(te, body=(-8, -14, 0), rarm=dict(hand=(0.02, 0.75, 0.66)), larm=dict(hand=(0.25, -0.5, 0.83)), root=(-3, -4, 0), rootpos=(0, 0.04, 0.08))
    c.key(tt, body=(6, 0, 0), rarm=FIST_GUARD_R, larm=FIST_GUARD_L, root=(0, 0, 0), rootpos=(0, 0, 0), rleg=(10, 0, 3), lleg=(-12, 0, -3))
    c.event("impact", ti)
    c.write()


def running_punch():
    t0, tw, ti, te, tt = timing(4, 3, 8)
    c = Clip("fist_running", tt, blend_in=0.04, blend_out=0.16)
    c.key(t0, body=(10, 0, 0), rarm=FIST_GUARD_R, larm=FIST_GUARD_L)
    c.key(tw, body=(4, 22, 0), rarm=dict(hand=(0.4, -0.3, -0.85)), larm=dict(hand=(0.1, -0.2, 0.97)), root=(-4, 8, 0), rootpos=(0, 0.12, 0))
    c.key(ti, body=(18, -24, 0), rarm=dict(hand=(-0.05, 0.08, 1.0), off=(0, -0.5, -3.0)), larm=dict(hand=(-0.2, -0.6, -0.75)), root=(8, -8, 0), rootpos=(0, 0.06, 0.2))
    c.key(te, body=(18, -24, 0), rarm=dict(hand=(-0.05, 0.05, 1.0), off=(0, -0.5, -3.0)), larm=dict(hand=(-0.2, -0.6, -0.75)), root=(8, -8, 0), rootpos=(0, 0.0, 0.22))
    c.key(tt, body=(10, 0, 0), rarm=FIST_GUARD_R, larm=FIST_GUARD_L, root=(0, 0, 0), rootpos=(0, 0, 0))
    c.event("impact", ti)
    c.write()


def haymaker():
    t0, tw, ti, te, tt = timing(7, 3, 10)
    c = Clip("fist_finisher", tt, blend_in=0.05, blend_out=0.18)
    c.key(t0, body=(6, 0, 0), rarm=FIST_GUARD_R, larm=FIST_GUARD_L, rleg=(10, 0, 3), lleg=(-12, 0, -3))
    c.key(tw, body=(-4, 42, -6), rarm=dict(hand=(0.8, 0.35, -0.48)), larm=dict(hand=(-0.2, -0.3, 0.93)), root=(-4, 12, 0),
          rootpos=(0, 0.0, -0.08), rleg=(18, 0, 4), lleg=(-8, 0, -3))
    c.key(ti, body=(12, 0, 0), rarm=dict(hand=(0.25, 0.25, 0.93)), larm=dict(hand=(-0.4, -0.6, 0.7)), root=(4, 0, 0), rootpos=(0, -0.03, 0.12))
    c.key(te, body=(24, -40, 6), rarm=dict(hand=(-0.8, -0.1, 0.6)), larm=dict(hand=(-0.4, -0.8, -0.4)), root=(6, -12, 0),
          rootpos=(0, -0.06, 0.18), rleg=(22, 0, 4), lleg=(-26, 0, -3, -1.0))
    c.key(tt, body=(6, 0, 0), rarm=FIST_GUARD_R, larm=FIST_GUARD_L, root=(0, 0, 0), rootpos=(0, 0, 0), rleg=(10, 0, 3), lleg=(-12, 0, -3))
    c.event("impact", ti)
    c.write()


# --- Legs ------------------------------------------------------------------------------------

def kick():
    t0, tw, ti, te, tt = timing(4, 3, 8)
    c = Clip("kick", tt, blend_in=0.04, blend_out=0.16, additive=["root"])
    bal_r = dict(hand=(0.7, -0.3, 0.4))
    bal_l = dict(hand=(-0.65, -0.25, 0.5))
    c.key(t0, body=(4, 0, 0), rleg=(0, 0, 2), lleg=(0, 0, -2), rarm=dict(hand=(0.15, -0.9, 0.3)), larm=dict(hand=(-0.15, -0.9, 0.3)))
    c.key(tw, body=(-6, 0, 0), rleg=(-78, 0, 4, -3.0), lleg=(6, 0, -2, -0.6), rarm=bal_r, larm=bal_l, root=(-3, 0, 0), rootpos=(0, -0.02, -0.04))
    c.key(ti, body=(-18, 0, 0), rleg=(-92, 0, 2, 0.0), lleg=(10, 0, -2, -0.4), rarm=dict(hand=(0.75, -0.2, -0.3)),
          larm=dict(hand=(-0.7, -0.15, 0.2)), root=(-8, 0, 0), rootpos=(0, 0.0, 0.14))
    c.key(te, body=(-20, 0, 0), rleg=(-94, 0, 2, 0.0), lleg=(12, 0, -2, -0.4), rarm=dict(hand=(0.75, -0.2, -0.3)),
          larm=dict(hand=(-0.7, -0.15, 0.2)), root=(-9, 0, 0), rootpos=(0, 0.0, 0.18))
    c.key(te + 0.12, body=(-8, 0, 0), rleg=(-55, 0, 3, -3.0), lleg=(6, 0, -2), rarm=bal_r, larm=bal_l, root=(-4, 0, 0), rootpos=(0, 0, 0.12))
    c.key(te + 0.25, body=(2, 0, 0), rleg=(-8, 0, 2), lleg=(4, 0, -2), rarm=dict(hand=(0.2, -0.85, 0.4)), larm=dict(hand=(-0.2, -0.85, 0.4)),
          root=(0, 0, 0), rootpos=(0, 0, 0.06))
    c.key(tt, body=(4, 0, 0), rleg=(0, 0, 2), lleg=(0, 0, -2), rarm=dict(hand=(0.15, -0.9, 0.3)), larm=dict(hand=(-0.15, -0.9, 0.3)),
          rootpos=(0, 0, 0))
    c.event("impact", ti)
    c.write()


def flying_kick():
    t0, tw, ti, te, tt = timing(4, 4, 11)
    c = Clip("kick_running", tt, blend_in=0.04, blend_out=0.18)
    c.key(t0, body=(10, 0, 0), rleg=(10, 0, 2), lleg=(-10, 0, -2), rarm=dict(hand=(0.2, -0.8, 0.55)), larm=dict(hand=(-0.2, -0.8, 0.55)))
    c.key(tw, body=(-10, 0, 0), rleg=(-60, 0, 4, -3.5), lleg=(-30, 0, -4, -3.0), rarm=dict(hand=(0.6, 0.2, -0.75)),
          larm=dict(hand=(-0.6, 0.2, -0.75)), root=(-6, 0, 0), rootpos=(0, 0.3, 0.05))
    c.key(ti, body=(-30, 0, 0), rleg=(-96, 0, 3), lleg=(-70, 0, -3, -1.0), rarm=dict(hand=(0.7, -0.2, -0.65)),
          larm=dict(hand=(-0.7, -0.2, -0.65)), root=(-14, 0, 0), rootpos=(0, 0.38, 0.25))
    c.key(te, body=(-30, 0, 0), rleg=(-98, 0, 3), lleg=(-72, 0, -3, -1.0), rarm=dict(hand=(0.7, -0.2, -0.65)),
          larm=dict(hand=(-0.7, -0.2, -0.65)), root=(-12, 0, 0), rootpos=(0, 0.25, 0.35))
    c.key(te + 0.15, body=(16, 0, 0), rleg=(-20, 0, 3, -2.5), lleg=(10, 0, -3, -2.5), rarm=dict(hand=(0.5, -0.6, 0.6)),
          larm=dict(hand=(-0.5, -0.6, 0.6)), root=(6, 0, 0), rootpos=(0, -0.15, 0.2))
    c.key(tt, body=(6, 0, 0), rleg=(4, 0, 2), lleg=(-4, 0, -2), rarm=dict(hand=(0.2, -0.85, 0.45)), larm=dict(hand=(-0.2, -0.85, 0.45)),
          root=(0, 0, 0), rootpos=(0, 0, 0))
    c.event("impact", ti)
    c.write()


def stomp():
    t0, tw, ti, te, tt = timing(5, 3, 7)
    c = Clip("stomp", tt, blend_in=0.05, blend_out=0.16)
    c.key(t0, body=(10, 0, 0), head=(20, 0, 0), rleg=(0, 0, 2), lleg=(0, 0, -2), rarm=dict(hand=(0.2, -0.85, 0.45)), larm=dict(hand=(-0.2, -0.85, 0.45)))
    c.key(tw, body=(4, 0, 0), head=(35, 0, 0), rleg=(-95, 0, 4, -4.0), lleg=(4, 0, -2), rarm=dict(hand=(0.75, -0.1, 0.4)),
          larm=dict(hand=(-0.75, -0.1, 0.4)), root=(-2, 0, 0), rootpos=(0, 0.04, 0))
    c.key(ti, body=(22, 0, 0), head=(45, 0, 0), rleg=(-26, 0, 3, -0.5), lleg=(10, 0, -2, -1.2), rarm=dict(hand=(0.6, -0.55, 0.45)),
          larm=dict(hand=(-0.6, -0.55, 0.45)), root=(4, 0, 0), rootpos=(0, -0.1, 0.12))
    c.key(te, body=(24, 0, 0), head=(45, 0, 0), rleg=(-28, 0, 3, -0.5), lleg=(12, 0, -2, -1.4), rarm=dict(hand=(0.6, -0.55, 0.45)),
          larm=dict(hand=(-0.6, -0.55, 0.45)), root=(4, 0, 0), rootpos=(0, -0.12, 0.14))
    c.key(tt, body=(8, 0, 0), head=(15, 0, 0), rleg=(0, 0, 2), lleg=(0, 0, -2), rarm=dict(hand=(0.2, -0.85, 0.45)), larm=dict(hand=(-0.2, -0.85, 0.45)),
          root=(0, 0, 0), rootpos=(0, 0, 0))
    c.event("impact", ti)
    c.write()


# --- Mobs ------------------------------------------------------------------------------------

def mob_clips():
    c = Clip("mob_windup", 0.7, blend_in=0.08, blend_out=0.2)
    c.key(0.0, body=(0, 0, 0), rarm=dict(hand=(0.1, -0.8, 0.6)))
    c.key(0.3, body=(-10, 18, 0), rarm=dict(hand=(0.35, 0.9, -0.25)), larm=dict(hand=(-0.3, -0.3, 0.9)), root=(-4, 4, 0))
    c.key(0.7, body=(-12, 20, 0), rarm=dict(hand=(0.35, 0.92, -0.2)), larm=dict(hand=(-0.3, -0.3, 0.9)), root=(-5, 4, 0))
    c.write()
    c = Clip("mob_strike", 0.55, blend_in=0.02, blend_out=0.2)
    c.key(0.0, body=(-12, 20, 0), rarm=dict(hand=(0.35, 0.92, -0.2)), larm=dict(hand=(-0.3, -0.3, 0.9)), root=(-5, 4, 0))
    c.key(0.1, body=(16, -10, 0), rarm=dict(hand=(0.05, -0.2, 0.98)), larm=dict(hand=(-0.4, -0.6, 0.6)), root=(5, -2, 0), rootpos=(0, 0, 0.1))
    c.key(0.2, body=(20, -14, 0), rarm=dict(hand=(-0.2, -0.6, 0.78)), larm=dict(hand=(-0.4, -0.7, 0.5)), root=(5, -2, 0), rootpos=(0, 0, 0.12))
    c.key(0.55, body=(0, 0, 0), rarm=dict(hand=(0.1, -0.8, 0.6)), larm=dict(hand=(-0.1, -0.9, 0.4)), root=(0, 0, 0), rootpos=(0, 0, 0))
    c.write()
    # Zombies keep vanilla's raised arms; these clips add to them.
    c = Clip("zombie_windup", 0.7, blend_in=0.08, blend_out=0.2, additive=["root", "right_arm", "left_arm"])
    c.key(0.0, body=(0, 0, 0), head=(0, 0, 0), rarm_raw=(0, 0, 0), larm_raw=(0, 0, 0))
    c.key(0.3, body=(-14, 0, 0), head=(-12, 0, 0), rarm_raw=(-45, 0, 8), larm_raw=(-45, 0, -8), root=(-5, 0, 0), rootpos=(0, 0, -0.05))
    c.key(0.7, body=(-16, 0, 0), head=(-14, 0, 0), rarm_raw=(-50, 0, 10), larm_raw=(-50, 0, -10), root=(-6, 0, 0), rootpos=(0, 0, -0.06))
    c.write()
    c = Clip("zombie_strike", 0.6, blend_in=0.02, blend_out=0.2, additive=["root", "right_arm", "left_arm"])
    c.key(0.0, body=(-16, 0, 0), head=(-14, 0, 0), rarm_raw=(-50, 0, 10), larm_raw=(-50, 0, -10), root=(-6, 0, 0), rootpos=(0, 0, -0.06))
    c.key(0.1, body=(22, 0, 0), head=(10, 0, 0), rarm_raw=(30, 0, -6), larm_raw=(30, 0, 6), root=(8, 0, 0), rootpos=(0, 0, 0.16))
    c.key(0.22, body=(26, 0, 0), head=(12, 0, 0), rarm_raw=(38, 0, -8), larm_raw=(38, 0, 8), root=(8, 0, 0), rootpos=(0, 0, 0.18))
    c.key(0.6, body=(0, 0, 0), head=(0, 0, 0), rarm_raw=(0, 0, 0), larm_raw=(0, 0, 0), root=(0, 0, 0), rootpos=(0, 0, 0))
    c.write()


# --- Knockdown recovery & crawling -----------------------------------------------------------
# Root rotations pivot at the hips here ("root_pivot": "hip"); the hips sit ~2px above the
# ground while lying (rootpos y = -(hip height) + 0.13 for a standard 0.75-block hip).

def getups():
    H = 0.75
    lie = -(H - 0.13)
    c = Clip("getup_back", 1.3, blend_in=0.0, blend_out=0.2, additive=[], pivot="hip")
    c.key(0.0, root=(-88, 0, 0), rootpos=(0, lie, 0), body=(0, 0, 0), head=(0, 0, 0), rarm_raw=(0, 0, 6), larm_raw=(0, 0, -6),
          rleg=(0, 0, 4), lleg=(0, 0, -4))
    c.key(0.3, root=(-62, 0, 0), rootpos=(0, lie + 0.02, 0), body=(-6, 0, 0), head=(20, 0, 0), rarm_raw=(42, 0, 14), larm_raw=(42, 0, -14),
          rleg=(-26, 0, 4), lleg=(-26, 0, -4))
    c.key(0.55, root=(-22, 0, 0), rootpos=(0, lie + 0.05, 0), body=(8, 0, 0), head=(10, 0, 0), rarm_raw=(-55, 0, 8), larm_raw=(-55, 0, -8),
          rleg=(-66, 0, 6), lleg=(-68, 0, -6))
    c.key(0.78, root=(18, 0, 0), rootpos=(0, -(H - 0.42), 0), body=(14, 0, 0), head=(-10, 0, 0), rarm_raw=(-45, 0, 10), larm_raw=(-30, 0, -10),
          rleg=(-70, 0, 4, -2.0), lleg=(30, 0, -4, -1.0))
    c.key(1.02, root=(10, 0, 0), rootpos=(0, -0.14, 0), body=(10, 0, 0), head=(-6, 0, 0), rarm_raw=(-20, 0, 8), larm_raw=(-14, 0, -8),
          rleg=(-30, 0, 3, -1.0), lleg=(10, 0, -3))
    c.key(1.3, root=(0, 0, 0), rootpos=(0, 0, 0), body=(0, 0, 0), head=(0, 0, 0), rarm_raw=(0, 0, 4), larm_raw=(0, 0, -4), rleg=(0, 0, 2), lleg=(0, 0, -2))
    c.write()

    c = Clip("getup_front", 1.3, blend_in=0.0, blend_out=0.2, additive=[], pivot="hip")
    c.key(0.0, root=(88, 0, 0), rootpos=(0, lie, 0), body=(0, 0, 0), head=(-30, 0, 0), rarm_raw=(-10, 0, 10), larm_raw=(-10, 0, -10),
          rleg=(0, 0, 4), lleg=(0, 0, -4))
    c.key(0.28, root=(74, 0, 0), rootpos=(0, lie + 0.08, 0), body=(-8, 0, 0), head=(-40, 0, 0), rarm_raw=(-88, 0, 12), larm_raw=(-88, 0, -12),
          rleg=(14, 0, 4), lleg=(14, 0, -4))
    c.key(0.55, root=(52, 0, 0), rootpos=(0, -(H - 0.38), 0), body=(6, 0, 0), head=(-30, 0, 0), rarm_raw=(-64, 0, 10), larm_raw=(-60, 0, -10),
          rleg=(-58, 0, 4, -1.5), lleg=(30, 0, -4))
    c.key(0.82, root=(28, 0, 0), rootpos=(0, -(H - 0.5), 0), body=(10, 0, 0), head=(-14, 0, 0), rarm_raw=(-28, 0, 8), larm_raw=(-30, 0, -8),
          rleg=(-40, 0, 4, -1.5), lleg=(10, 0, -4))
    c.key(1.05, root=(10, 0, 0), rootpos=(0, -0.12, 0), body=(6, 0, 0), head=(-4, 0, 0), rarm_raw=(-10, 0, 6), larm_raw=(-10, 0, -6),
          rleg=(-12, 0, 3, -0.5), lleg=(4, 0, -3))
    c.key(1.3, root=(0, 0, 0), rootpos=(0, 0, 0), body=(0, 0, 0), head=(0, 0, 0), rarm_raw=(0, 0, 4), larm_raw=(0, 0, -4), rleg=(0, 0, 2), lleg=(0, 0, -2))
    c.write()

    c = Clip("crawl", 1.2, blend_in=0.0, blend_out=0.25, additive=[], pivot="hip", loop=True)
    for i, t in enumerate((0.0, 0.3, 0.6, 0.9, 1.2)):
        phase = i % 4
        reach_r = phase in (0, 1)
        rx = -170 if phase == 0 else (-120 if phase == 1 else (-150 if phase == 2 else -175))
        lx = -150 if phase == 0 else (-175 if phase == 1 else (-170 if phase == 2 else -120))
        roll = (3 if reach_r else -3)
        c.key(t, root=(86, 0, roll), rootpos=(0, lie + 0.01, 0), body=(-4, 0, 0), head=(-62, 0, 0), rarm_raw=(rx, 0, 12), larm_raw=(lx, 0, -12),
              rleg=(4 if reach_r else -2, 0, 8 if reach_r else 3), lleg=(-2 if reach_r else 4, 0, -3 if reach_r else -8))
    c.write()

    c = Clip("crawl_grab", 0.6, blend_in=0.03, blend_out=0.2, additive=["root"], pivot="hip")
    c.key(0.0, rarm_raw=(-160, 0, 12), larm_raw=(-160, 0, -12), head=(-62, 0, 0))
    c.key(0.15, rarm_raw=(-135, 0, 6), larm_raw=(-130, 0, -6), head=(-70, 0, 0))
    c.key(0.6, rarm_raw=(-160, 0, 12), larm_raw=(-160, 0, -12), head=(-62, 0, 0))
    c.write()


def guards():
    """Static combat stances, blended in when locked on / fighting (loop, single key)."""
    specs = {
        "guard_sword": dict(body=(6, 10, 0), rarm=dict(hand=(0.3, -0.25, 0.92), blade=(-0.1, 0.8, 0.6)), larm=dict(hand=(-0.25, -0.55, 0.8)),
                            rleg=(12, 0, 4), lleg=(-12, 0, -4)),
        "guard_axe": dict(body=(8, 14, 0), rarm=dict(hand=(0.35, -0.5, 0.8), blade=(-0.2, 0.75, 0.6)), larm=dict(hand=(0.18, -0.4, 0.9)),
                          rleg=(14, 0, 4), lleg=(-12, 0, -4)),
        "guard_spear": dict(body=(6, 18, 0), rarm=dict(hand=(0.3, -0.75, 0.55), blade=(0.0, 0.15, 1.0)), larm=dict(hand=(0.0, -0.4, 0.92)),
                            rleg=(14, 0, 4), lleg=(-14, 0, -4)),
        "guard_fist": dict(body=(8, 12, 0), rarm=FIST_GUARD_R, larm=FIST_GUARD_L, rleg=(12, 0, 4),
                           lleg=(-14, 0, -4)),
    }
    for name, spec in specs.items():
        c = Clip(name, 1.0, blend_in=0.2, blend_out=0.3, additive=[], loop=True)
        c.key(0.0, **spec)
        c.write()


def finishers_ground():
    ground_finisher("sword_finisher_ground", 8, 3, 10, False)
    ground_finisher("axe_finisher_ground", 10, 3, 12, True)
    ground_finisher("mace_finisher_ground", 9, 3, 11, False)
    ground_finisher("spear_finisher_ground", 8, 3, 10, True)


def fists():
    jab()
    cross()
    hook()
    uppercut()
    running_punch()
    haymaker()



def main():
    only = set(sys.argv[1:])
    if only:
        for name in only:
            globals()[name]()
        return
    guards()
    sword_slash_r()
    sword_slash_r("sword_running", w=3, a=4, r=9, wide=1.15, legs=False)
    sword_slash_l()
    overhead("sword_overhead", 6, 3, 9)
    thrust("sword_thrust", 4, 3, 8)
    thrust("sword_finisher_stand", 6, 4, 12, big=True)
    ground_finisher("sword_finisher_ground", 8, 3, 10, False)
    axe_chop()
    axe_chop("axe_running", 5, 4, 12, legs=False)
    overhead("axe_overhead", 9, 3, 12, two_handed=True)
    overhead("axe_finisher_stand", 9, 3, 14, two_handed=True, finisher=True)
    ground_finisher("axe_finisher_ground", 10, 3, 12, True)
    sword_slash_r("mace_swing", w=6, a=3, r=9, wide=1.05)
    overhead("mace_overhead", 8, 3, 11)
    ground_finisher("mace_finisher_ground", 9, 3, 11, False)
    thrust("spear_thrust", 4, 3, 7, two_handed=True)
    thrust("spear_thrust_low", 3, 3, 7, two_handed=True, low=True)
    spear_sweep()
    ground_finisher("spear_finisher_ground", 8, 3, 10, True)
    jab()
    cross()
    hook()
    uppercut()
    running_punch()
    haymaker()
    kick()
    flying_kick()
    stomp()
    mob_clips()
    getups()


if __name__ == "__main__":
    main()
