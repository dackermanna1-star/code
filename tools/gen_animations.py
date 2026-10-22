#!/usr/bin/env python3
"""Generates Julius's keyframed action clips into assets/julius_juukulius/julius_animations/.

    python3 tools/gen_animations.py

Clip format (read by AnimClip.java): rotations in degrees, positions in pixels, times in seconds.

Bone conventions (all signs as seen by the character):
  * head/body/arms/legs: x > 0 tilts forward/down (arms and legs: x < 0 swings the limb forward and up), y > 0 turns
    towards the right, z > 0 tilts the top towards the left (right arm: z > 0 lifts it outwards; left arm: z < 0).
    Arm rotations are relative to the chest: the arms follow any torso rotation a clip adds.
  * root: whole body around the feet. rotation x leans forward, y turns right, z leans left;
    position x right, y up, z forward.
  * item: the held sword relative to the hand. x > 0 tips the blade up towards the shoulder, x = -90 lines it up with
    the arm (a thrust); z > 0 swings it inwards around the arm.
  * fp_main / fp_off: first-person sword hand / casting hand offsets (x right, y up, z towards the camera).
Bones listed in "override" replace the stance pose; the others are added on top of it.
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "src" / "main" / "resources" / "assets" / "julius_juukulius" / "julius_animations"

STANCE_RIGHT = (-22, -6, 5)
STANCE_LEFT = (27, 10, 17)


def k(t, x, y, z, ease=None):
    key = [round(t, 3), round(x, 2), round(y, 2), round(z, 2)]
    if ease:
        key.append(ease)
    return key


def clip(length, bones, override=(), blend_in=0.06, blend_out=0.15, trail=None, offhand=False):
    data = {"length": length, "blend_in": blend_in, "blend_out": blend_out}
    if override:
        data["override"] = list(override)
    if trail:
        data["trail"] = trail
    if offhand:
        data["first_person_offhand"] = True
    data["bones"] = bones
    return data


CLIPS = {}

# ------------------------------------------------------------------------------------------------ sword combo

# 1: diagonal cut from high right to low left. Impact at 0.15 s; the next cut may chain from 0.2 s.
CLIPS["slash_1"] = clip(0.4, blend_in=0.04, blend_out=0.14, override=("right_arm", "left_arm"), trail=[[0.06, 0.21, "cool"]], bones={
    "right_arm": {"rotation": [k(0, *STANCE_RIGHT), k(0.07, -158, 28, 28, "out_quad"), k(0.15, -54, -40, -10, "in_quad"),
                               k(0.22, -30, -50, -16, "out_cubic"), k(0.4, -30, -46, -14, "in_out_sine")]},
    "left_arm": {"rotation": [k(0, *STANCE_LEFT), k(0.07, -24, 4, -26, "out_quad"), k(0.15, 14, 2, -34, "in_quad"),
                              k(0.4, 18, 4, -22, "out_sine")]},
    "body": {"rotation": [k(0, 0, 0, 0), k(0.07, -3, 26, 0, "out_quad"), k(0.15, 6, -20, 0, "in_quad"), k(0.22, 8, -26, 0, "out_cubic"),
                          k(0.4, 6, -22, 0, "in_out_sine")]},
    "head": {"rotation": [k(0, 0, 0, 0), k(0.07, 0, -18, 0, "out_quad"), k(0.15, 3, 14, 0, "in_quad"), k(0.22, 4, 18, 0, "out_cubic"),
                          k(0.4, 3, 15, 0)]},
    "right_leg": {"rotation": [k(0, 0, 0, 0), k(0.07, 4, 0, 0), k(0.15, -16, 0, 2, "in_quad"), k(0.4, -12, 0, 2)]},
    "left_leg": {"rotation": [k(0, 0, 0, 0), k(0.15, 12, 0, -2, "in_quad"), k(0.4, 9, 0, -2)]},
    "root": {"rotation": [k(0, 0, 0, 0), k(0.07, -2, 0, 0), k(0.15, 5, 0, 0, "in_quad"), k(0.4, 4, 0, 0)],
             "position": [k(0, 0, 0, 0), k(0.15, 0, -0.6, 1.0, "in_quad"), k(0.4, 0, -0.4, 0.8)]},
    "item": {"rotation": [k(0, 0, 0, 0), k(0.07, -38, 0, 0, "out_quad"), k(0.15, -70, 0, 0, "in_quad"), k(0.22, -62, 0, 0),
                          k(0.4, -56, 0, 0)]},
    "fp_main": {"rotation": [k(0, 0, 0, 0), k(0.07, 18, -8, -38, "out_quad"), k(0.15, -46, 28, 58, "in_quad"), k(0.22, -56, 32, 68, "out_cubic"),
                             k(0.4, -48, 28, 60)],
                "position": [k(0, 0, 0, 0), k(0.07, 2, 3, 1, "out_quad"), k(0.15, -6, -3, -2, "in_quad"), k(0.22, -8, -5, -1, "out_cubic"),
                             k(0.4, -7, -4, 0)]},
})

# 2: rising backhand from low left to high right.
CLIPS["slash_2"] = clip(0.4, blend_in=0.05, blend_out=0.14, override=("right_arm", "left_arm"), trail=[[0.06, 0.21, "warm"]], bones={
    "right_arm": {"rotation": [k(0, -30, -46, -14), k(0.06, -24, -64, -20, "out_quad"), k(0.15, -128, 34, 24, "in_quad"),
                               k(0.22, -150, 44, 34, "out_cubic"), k(0.4, -142, 40, 30, "in_out_sine")]},
    "left_arm": {"rotation": [k(0, 18, 4, -22), k(0.06, 14, 0, -30), k(0.15, -32, 0, -42, "in_quad"), k(0.4, -22, 0, -30, "out_sine")]},
    "body": {"rotation": [k(0, 6, -22, 0), k(0.06, 8, -30, 0, "out_quad"), k(0.15, -3, 24, 0, "in_quad"), k(0.22, -4, 30, 0, "out_cubic"),
                          k(0.4, -3, 26, 0, "in_out_sine")]},
    "head": {"rotation": [k(0, 3, 15, 0), k(0.06, 4, 20, 0), k(0.15, -4, -16, 0, "in_quad"), k(0.4, -3, -18, 0)]},
    "right_leg": {"rotation": [k(0, -12, 0, 2), k(0.15, -4, 0, 2, "in_quad"), k(0.4, -2, 0, 2)]},
    "left_leg": {"rotation": [k(0, 9, 0, -2), k(0.15, -8, 0, -2, "in_quad"), k(0.4, -6, 0, -2)]},
    "root": {"rotation": [k(0, 4, 0, 0), k(0.06, 6, 0, 0), k(0.15, -3, 0, 0, "in_quad"), k(0.4, -2, 0, 0)],
             "position": [k(0, 0, -0.4, 0.8), k(0.06, 0, -0.8, 0.8), k(0.15, 0, 0.4, 1.4, "in_quad"), k(0.4, 0, 0, 1.0)]},
    "item": {"rotation": [k(0, -56, 0, 0), k(0.06, -62, 0, 0), k(0.15, -40, 0, 0, "in_quad"), k(0.4, -34, 0, 0)]},
    "fp_main": {"rotation": [k(0, -48, 28, 60), k(0.06, -56, 32, 66, "out_quad"), k(0.15, 22, -12, -42, "in_quad"), k(0.22, 30, -16, -50, "out_cubic"),
                             k(0.4, 24, -12, -44)],
                "position": [k(0, -7, -4, 0), k(0.06, -8, -6, 0, "out_quad"), k(0.15, 4, 4, -2, "in_quad"), k(0.22, 5, 5, -1, "out_cubic"),
                             k(0.4, 4, 4, 0)]},
})

# 3: the finisher, a leaping spin cut. Impact at 0.25 s.
CLIPS["slash_3"] = clip(0.65, blend_in=0.05, blend_out=0.2, override=("right_arm", "left_arm"), trail=[[0.1, 0.4, "wide"]], bones={
    "right_arm": {"rotation": [k(0, -70, 36, 20), k(0.08, -86, 72, 12, "out_quad"), k(0.25, -90, 18, 4, "in_out_sine"),
                               k(0.38, -88, -32, -2, "out_sine"), k(0.5, -70, -42, -6, "out_cubic"), k(0.65, -62, -38, -6)]},
    "left_arm": {"rotation": [k(0, -10, 0, -30), k(0.08, -40, 0, -50, "out_quad"), k(0.25, -70, 0, -78), k(0.45, -45, 0, -55),
                              k(0.65, -10, 0, -30, "out_sine")]},
    "body": {"rotation": [k(0, 0, 10, 0), k(0.08, 0, 24, 0, "out_quad"), k(0.25, 6, -4, 0), k(0.38, 8, -22, 0, "out_sine"),
                          k(0.65, 6, -18, 0)]},
    "right_leg": {"rotation": [k(0, 0, 0, 0), k(0.08, -8, 0, 8), k(0.2, -24, 0, 12), k(0.4, -20, 0, 8, "out_quad"), k(0.65, -10, 0, 4)]},
    "left_leg": {"rotation": [k(0, 0, 0, 0), k(0.08, 6, 0, -8), k(0.2, 18, 0, -10), k(0.4, 14, 0, -8, "out_quad"), k(0.65, 6, 0, -4)]},
    "root": {"rotation": [k(0, 0, 0, 0), k(0.08, 0, 24, 0, "out_quad"), k(0.3, 7, -330, 0, "in_out_sine"), k(0.38, 8, -360, 0, "out_cubic"),
                          k(0.381, 8, 0, 0, "step"), k(0.65, 3, 0, 0, "in_out_sine")],
             "position": [k(0, 0, 0, 0), k(0.08, 0, -0.5, 0), k(0.18, 0, 2.5, 2.0, "out_quad"), k(0.32, 0, 0, 3.0, "in_quad"),
                          k(0.4, 0, -1.6, 3.0, "out_quad"), k(0.65, 0, -0.5, 1.5, "in_out_sine")]},
    "item": {"rotation": [k(0, -40, 0, 0), k(0.08, -70, 0, 0), k(0.25, -82, 0, 0), k(0.5, -70, 0, 0), k(0.65, -60, 0, 0)]},
    "fp_main": {"rotation": [k(0, 20, -10, -40), k(0.08, 10, -40, -70, "out_quad"), k(0.18, -10, 0, -85, "in_quad"), k(0.3, -20, 60, -80, "out_cubic"),
                             k(0.45, -30, 50, -40, "out_sine"), k(0.65, -20, 30, -10, "in_out_sine")],
                "position": [k(0, 3, 3, 0), k(0.08, 8, 1, 0, "out_quad"), k(0.18, 2, -1, -3, "in_quad"), k(0.3, -9, -2, -2, "out_cubic"),
                             k(0.45, -7, -3, 0), k(0.65, -3, -1, 0, "in_out_sine")]},
})

# Heavy strike: a two-handed overhead cleave. Impact at 0.35 s.
CLIPS["heavy_strike"] = clip(0.7, blend_in=0.06, blend_out=0.2, override=("right_arm", "left_arm"), trail=[[0.28, 0.42, "wide"]], bones={
    "right_arm": {"rotation": [k(0, *STANCE_RIGHT), k(0.22, -172, -14, 6, "out_cubic"), k(0.3, -176, -12, 6, "in_out_sine"),
                               k(0.36, -58, -10, 0, "in_quart"), k(0.45, -42, -8, 0, "out_cubic"), k(0.7, -40, -8, 0)]},
    "left_arm": {"rotation": [k(0, *STANCE_LEFT), k(0.22, -166, 20, -4, "out_cubic"), k(0.3, -170, 18, -4), k(0.36, -56, 22, 0, "in_quart"),
                              k(0.45, -42, 20, 0, "out_cubic"), k(0.7, -40, 18, 0)]},
    "body": {"rotation": [k(0, 0, 0, 0), k(0.22, -9, 0, 0, "out_cubic"), k(0.3, -10, 0, 0), k(0.36, 16, 0, 0, "in_quart"), k(0.7, 12, 0, 0)]},
    "head": {"rotation": [k(0, 0, 0, 0), k(0.22, -14, 0, 0, "out_cubic"), k(0.36, 8, 0, 0, "in_quart"), k(0.7, 4, 0, 0)]},
    "right_leg": {"rotation": [k(0, 0, 0, 0), k(0.22, 6, 0, 0), k(0.36, -34, 0, 3, "in_quart"), k(0.7, -28, 0, 3)]},
    "left_leg": {"rotation": [k(0, 0, 0, 0), k(0.22, -4, 0, 0), k(0.36, 24, 0, -3, "in_quart"), k(0.7, 20, 0, -3)]},
    "root": {"rotation": [k(0, 0, 0, 0), k(0.22, -4, 0, 0, "out_cubic"), k(0.36, 12, 0, 0, "in_quart"), k(0.7, 7, 0, 0)],
             "position": [k(0, 0, 0, 0), k(0.22, 0, 1.0, -1.0, "out_cubic"), k(0.36, 0, -3.2, 3.2, "in_quart"), k(0.7, 0, -1.8, 2.2)]},
    "item": {"rotation": [k(0, 0, 0, 0), k(0.22, -8, 0, 0, "out_cubic"), k(0.36, -78, 0, 0, "in_quart"), k(0.7, -72, 0, 0)]},
    "fp_main": {"rotation": [k(0, 0, 0, 0), k(0.22, 40, 0, -10, "out_cubic"), k(0.3, 44, 0, -10), k(0.36, -70, 0, 6, "in_quart"),
                             k(0.45, -62, 0, 4, "out_cubic"), k(0.7, -55, 0, 4)],
                "position": [k(0, 0, 0, 0), k(0.22, -2, 7, 3, "out_cubic"), k(0.3, -2, 8, 3), k(0.36, -3, -6, -3, "in_quart"),
                             k(0.7, -3, -5, -2)]},
})

# Releasing the charged Al Clarista: a wide horizontal sweep that launches the rainbow crescent.
CLIPS["charge_release"] = clip(0.5, blend_in=0.03, blend_out=0.2, override=("right_arm", "left_arm"), trail=[[0.02, 0.17, "wide"]], bones={
    "right_arm": {"rotation": [k(0, -88, 40, 14), k(0.04, -94, 70, 18, "out_quad"), k(0.12, -86, -58, -8, "in_quad"),
                               k(0.2, -80, -74, -14, "out_cubic"), k(0.5, -70, -62, -10, "in_out_sine")]},
    "left_arm": {"rotation": [k(0, -60, -36, -4), k(0.04, -50, -20, -20), k(0.12, -30, 0, -52, "in_quad"), k(0.5, -18, 0, -36)]},
    "body": {"rotation": [k(0, -2, 12, 0), k(0.04, -2, 30, 0, "out_quad"), k(0.12, 6, -34, 0, "in_quad"), k(0.5, 4, -28, 0)]},
    "head": {"rotation": [k(0, 0, -10, 0), k(0.04, 0, -24, 0), k(0.12, 2, 26, 0, "in_quad"), k(0.5, 2, 22, 0)]},
    "right_leg": {"rotation": [k(0, -6, 0, 3), k(0.12, -22, 0, 4, "in_quad"), k(0.5, -16, 0, 3)]},
    "left_leg": {"rotation": [k(0, 4, 0, -3), k(0.12, 16, 0, -3, "in_quad"), k(0.5, 12, 0, -3)]},
    "root": {"rotation": [k(0, 2, 0, 0), k(0.12, 7, 0, 0, "in_quad"), k(0.5, 4, 0, 0)],
             "position": [k(0, 0, -0.6, 0), k(0.12, 0, -1.2, 2.2, "in_quad"), k(0.5, 0, -0.8, 1.4)]},
    "item": {"rotation": [k(0, -40, 0, 0), k(0.04, -60, 0, 0), k(0.12, -84, 0, 0, "in_quad"), k(0.5, -70, 0, 0)]},
    "fp_main": {"rotation": [k(0, 18, 12, 0), k(0.04, 10, -30, -50, "out_quad"), k(0.12, -20, 55, -75, "in_quad"), k(0.2, -24, 62, -70, "out_cubic"),
                             k(0.5, -18, 40, -40, "in_out_sine")],
                "position": [k(0, -1.6, 1.2, 0), k(0.04, 6, 1, 0, "out_quad"), k(0.12, -8, -1, -3, "in_quad"), k(0.2, -10, -2, -2),
                             k(0.5, -6, -2, 0, "in_out_sine")]},
})

# Al Clauzeria: the knight's salute while the six spirits gather on the blade, then the thrust that releases them (0.7 s).
CLIPS["al_clauzeria"] = clip(1.3, blend_in=0.1, blend_out=0.3, override=("right_arm", "left_arm"), trail=[[0.62, 0.82, "rainbow"]], bones={
    "right_arm": {"rotation": [k(0, *STANCE_RIGHT), k(0.25, -104, -34, -4, "out_cubic"), k(0.5, -108, -32, -4, "in_out_sine"),
                               k(0.62, -66, 52, 8, "in_out_quad"), k(0.7, -92, -4, 0, "in_quart"), k(1.0, -90, -2, 0, "out_sine"),
                               k(1.3, -60, -4, 2, "in_out_sine")]},
    "left_arm": {"rotation": [k(0, *STANCE_LEFT), k(0.25, -24, 0, -48, "out_cubic"), k(0.5, -30, 0, -54), k(0.62, -40, 0, -40),
                              k(0.7, 10, 0, -48, "in_quart"), k(1.3, 15, 0, -30)]},
    "body": {"rotation": [k(0, 0, 0, 0), k(0.25, -3, 0, 0, "out_cubic"), k(0.5, -4, 0, 0), k(0.62, 0, 28, 0, "in_out_quad"),
                          k(0.7, 6, -18, 0, "in_quart"), k(1.0, 6, -14, 0), k(1.3, 2, -6, 0)]},
    "head": {"rotation": [k(0, 0, 0, 0), k(0.25, 6, 0, 0, "out_cubic"), k(0.5, 4, 0, 0), k(0.62, 0, -20, 0), k(0.7, 2, 14, 0, "in_quart"),
                          k(1.3, 0, 4, 0)]},
    "right_leg": {"rotation": [k(0, 0, 0, 0), k(0.62, 6, 0, 0), k(0.7, -32, 0, 2, "in_quart"), k(1.0, -30, 0, 2), k(1.3, -10, 0, 0)]},
    "left_leg": {"rotation": [k(0, 0, 0, 0), k(0.62, -4, 0, 0), k(0.7, 26, 0, -2, "in_quart"), k(1.0, 24, 0, -2), k(1.3, 8, 0, 0)]},
    "root": {"rotation": [k(0, 0, 0, 0), k(0.5, 0, 0, 0), k(0.62, -3, 0, 0), k(0.7, 10, 0, 0, "in_quart"), k(1.0, 8, 0, 0), k(1.3, 2, 0, 0)],
             "position": [k(0, 0, 0, 0), k(0.25, 0, 0.6, 0, "out_cubic"), k(0.5, 0, 0.8, 0), k(0.62, 0, 0, -1.5, "in_out_quad"),
                          k(0.7, 0, -2.4, 4.6, "in_quart"), k(1.0, 0, -2.0, 4.0), k(1.3, 0, -0.5, 1.0, "in_out_sine")]},
    "item": {"rotation": [k(0, 0, 0, 0), k(0.25, -2, 0, 22, "out_cubic"), k(0.5, -2, 0, 22), k(0.62, -40, 0, 0), k(0.7, -92, 0, 0, "in_quart"),
                          k(1.0, -90, 0, 0), k(1.3, -50, 0, 0)]},
    "fp_main": {"rotation": [k(0, 0, 0, 0), k(0.25, 30, 30, -20, "out_cubic"), k(0.5, 32, 30, -20), k(0.62, 30, -10, 0, "in_out_quad"),
                             k(0.7, -62, 0, 10, "in_quart"), k(1.0, -60, 0, 10), k(1.3, -20, 0, 4, "in_out_sine")],
                "position": [k(0, 0, 0, 0), k(0.25, -5, 3, 2, "out_cubic"), k(0.5, -5, 3, 2), k(0.62, 2, -1, 5, "in_out_quad"),
                             k(0.7, -3, 0, -7, "in_quart"), k(1.0, -3, 0, -6), k(1.3, -1, 0, -2, "in_out_sine")]},
})

# ------------------------------------------------------------------------------------------------ Al Cranvel


CLIPS["cranvel_activate"] = clip(1.5, blend_in=0.1, blend_out=0.3, override=("right_arm", "left_arm"), trail=[[0.8, 0.96, "wide"]], bones={
    "right_arm": {"rotation": [k(0, *STANCE_RIGHT), k(0.35, -174, -6, 4, "out_cubic"), k(0.8, -176, -4, 4, "in_out_sine"),
                               k(0.92, -34, -4, 0, "in_quart"), k(1.2, -32, -4, 0), k(1.5, -26, -4, 2, "in_out_sine")]},
    "left_arm": {"rotation": [k(0, *STANCE_LEFT), k(0.35, -40, 0, -68, "out_cubic"), k(0.8, -46, 0, -74), k(0.92, -30, 30, -10, "in_quart"),
                              k(1.2, -28, 28, -8), k(1.5, 10, 10, 10, "in_out_sine")]},
    "body": {"rotation": [k(0, 0, 0, 0), k(0.35, -8, 0, 0, "out_cubic"), k(0.8, -10, 0, 0), k(0.92, 14, 0, 0, "in_quart"), k(1.2, 12, 0, 0),
                          k(1.5, 3, 0, 0)]},
    "head": {"rotation": [k(0, 0, 0, 0), k(0.35, -24, 0, 0, "out_cubic"), k(0.8, -28, 0, 0), k(0.92, 10, 0, 0, "in_quart"), k(1.5, 0, 0, 0)]},
    "right_leg": {"rotation": [k(0, 0, 0, 0), k(0.8, 0, 0, 4), k(0.92, -40, 0, 4, "in_quart"), k(1.2, -38, 0, 4), k(1.5, -6, 0, 0)]},
    "left_leg": {"rotation": [k(0, 0, 0, 0), k(0.8, 0, 0, -4), k(0.92, 42, 0, -4, "in_quart"), k(1.2, 40, 0, -4), k(1.5, 6, 0, 0)]},
    "root": {"rotation": [k(0, 0, 0, 0), k(0.35, -3, 0, 0), k(0.8, -3, 0, 0), k(0.92, 10, 0, 0, "in_quart"), k(1.2, 9, 0, 0), k(1.5, 2, 0, 0)],
             "position": [k(0, 0, 0, 0), k(0.35, 0, 1.2, 0, "out_cubic"), k(0.8, 0, 2.0, 0, "in_out_sine"), k(0.92, 0, -4.4, 2.0, "in_quart"),
                          k(1.2, 0, -4.0, 2.0), k(1.5, 0, -0.8, 0.5, "in_out_sine")]},
    "item": {"rotation": [k(0, 0, 0, 0), k(0.35, -78, 0, 0, "out_cubic"), k(0.8, -80, 0, 0), k(0.92, -64, 0, 0, "in_quart"), k(1.2, -64, 0, 0),
                          k(1.5, -30, 0, 0)]},
    "fp_main": {"rotation": [k(0, 0, 0, 0), k(0.35, 55, 0, -10, "out_cubic"), k(0.8, 58, 0, -10), k(0.92, -75, 0, 4, "in_quart"),
                             k(1.2, -72, 0, 4), k(1.5, -20, 0, 0, "in_out_sine")],
                "position": [k(0, 0, 0, 0), k(0.35, -3, 9, 3, "out_cubic"), k(0.8, -3, 10, 3), k(0.92, -3, -7, -3, "in_quart"),
                             k(1.2, -3, -6, -3), k(1.5, -1, -2, 0, "in_out_sine")]},
})

CLIPS["cranvel_end"] = clip(0.8, blend_in=0.12, blend_out=0.3, override=("right_arm",), bones={
    "right_arm": {"rotation": [k(0, *STANCE_RIGHT), k(0.3, -8, -4, 6, "out_cubic"), k(0.55, -10, -4, 6), k(0.8, -18, -6, 5, "in_out_sine")]},
    "body": {"rotation": [k(0, 0, 0, 0), k(0.3, 8, 0, 0, "out_cubic"), k(0.55, 7, 0, 0), k(0.8, 0, 0, 0, "in_out_sine")]},
    "head": {"rotation": [k(0, 0, 0, 0), k(0.3, 16, 0, 0, "out_cubic"), k(0.55, 14, 0, 0), k(0.8, 0, 0, 0, "in_out_sine")]},
    "root": {"position": [k(0, 0, 0, 0), k(0.3, 0, -1.0, 0, "out_cubic"), k(0.8, 0, 0, 0, "in_out_sine")]},
    "item": {"rotation": [k(0, 0, 0, 0), k(0.3, -70, 0, 0, "out_cubic"), k(0.55, -72, 0, 0), k(0.8, -20, 0, 0, "in_out_sine")]},
    "fp_main": {"rotation": [k(0, 0, 0, 0), k(0.3, -30, 0, 0, "out_cubic"), k(0.55, -32, 0, 0), k(0.8, 0, 0, 0, "in_out_sine")],
                "position": [k(0, 0, 0, 0), k(0.3, 0, -4, 0, "out_cubic"), k(0.55, 0, -4, 0), k(0.8, 0, 0, 0, "in_out_sine")]},
})

# ------------------------------------------------------------------------------------------------ transformation


CLIPS["transform"] = clip(1.2, blend_in=0.1, blend_out=0.4, override=("right_arm", "left_arm"), bones={
    "right_arm": {"rotation": [k(0, 0, 0, 5), k(0.28, -68, -58, 0, "out_cubic"), k(0.55, -70, -60, 0, "in_out_sine"),
                               k(0.75, -38, 0, 66, "out_back"), k(1.2, -30, 0, 50, "in_out_sine")]},
    "left_arm": {"rotation": [k(0, 0, 0, -5), k(0.28, 4, 0, -8, "out_cubic"), k(0.55, 2, 0, -8), k(0.75, -38, 0, -66, "out_back"),
                              k(1.2, -30, 0, -50, "in_out_sine")]},
    "body": {"rotation": [k(0, 0, 0, 0), k(0.28, 4, 0, 0, "out_cubic"), k(0.55, 4, 0, 0), k(0.75, -6, 0, 0, "out_back"), k(1.2, -3, 0, 0)]},
    "head": {"rotation": [k(0, 0, 0, 0), k(0.28, 14, 0, 0, "out_cubic"), k(0.55, 12, 0, 0), k(0.75, -12, 0, 0, "out_back"), k(1.2, -4, 0, 0)]},
    "root": {"position": [k(0, 0, 0, 0), k(0.28, 0, 0.3, 0), k(0.55, 0, 0.6, 0), k(0.75, 0, 1.6, 0, "out_back"), k(1.2, 0, 0.4, 0, "in_out_sine")]},
    "item": {"rotation": [k(0, 0, 0, 0), k(0.28, -70, 0, 0, "out_cubic"), k(0.55, -70, 0, 0), k(0.75, 0, 0, 0, "out_back")]},
    "fp_main": {"rotation": [k(0, 0, 0, 0), k(0.28, -30, 20, 0, "out_cubic"), k(0.55, -32, 20, 0), k(0.75, 10, -10, -20, "out_back"),
                             k(1.2, 0, 0, 0, "in_out_sine")],
                "position": [k(0, 0, 0, 0), k(0.28, -4, -2, 0, "out_cubic"), k(0.55, -4, -2, 0), k(0.75, 4, 1, 0, "out_back"),
                             k(1.2, 0, 0, 0, "in_out_sine")]},
})

CLIPS["revert"] = clip(0.7, blend_in=0.08, blend_out=0.25, override=("right_arm", "left_arm"), bones={
    "right_arm": {"rotation": [k(0, *STANCE_RIGHT), k(0.25, -62, -56, 0, "out_cubic"), k(0.45, -62, -56, 0), k(0.7, -20, -10, 5, "in_out_sine")]},
    "left_arm": {"rotation": [k(0, *STANCE_LEFT), k(0.25, 10, 0, -6, "out_cubic"), k(0.7, 2, 0, -4)]},
    "body": {"rotation": [k(0, 0, 0, 0), k(0.25, 20, 0, 0, "out_cubic"), k(0.45, 18, 0, 0), k(0.7, 0, 0, 0, "in_out_sine")]},
    "head": {"rotation": [k(0, 0, 0, 0), k(0.25, 14, 0, 0, "out_cubic"), k(0.45, 12, 0, 0), k(0.7, 0, 0, 0, "in_out_sine")]},
    "root": {"rotation": [k(0, 0, 0, 0), k(0.25, 4, 0, 0, "out_cubic"), k(0.7, 0, 0, 0, "in_out_sine")]},
    "fp_main": {"position": [k(0, 0, 0, 0), k(0.25, 0, -3, 0, "out_cubic"), k(0.7, 0, 0, 0, "in_out_sine")]},
})

# ------------------------------------------------------------------------------------------------ spirits


CLIPS["spirits_summon"] = clip(0.5, blend_in=0.05, blend_out=0.2, override=("left_arm",), offhand=True, bones={
    "left_arm": {"rotation": [k(0, *STANCE_LEFT), k(0.14, -142, 18, -22, "out_back"), k(0.3, -138, 16, -20), k(0.5, -40, 0, -10, "in_out_sine")]},
    "body": {"rotation": [k(0, 0, 0, 0), k(0.14, -3, 10, 0, "out_back"), k(0.5, 0, 0, 0)]},
    "head": {"rotation": [k(0, 0, 0, 0), k(0.14, -12, 0, 0, "out_back"), k(0.5, 0, 0, 0)]},
    "fp_off": {"rotation": [k(0, 0, 0, 0), k(0.14, -40, 0, 0, "out_back"), k(0.3, -38, 0, 0), k(0.5, -10, 0, 0)],
               "position": [k(0, 0, 0, 0), k(0.14, 0, 5, -3, "out_back"), k(0.3, 0, 5, -3), k(0.5, 0, 1, 0)]},
})

CLIPS["spirits_dismiss"] = clip(0.5, blend_in=0.05, blend_out=0.2, override=("left_arm",), offhand=True, bones={
    "left_arm": {"rotation": [k(0, *STANCE_LEFT), k(0.1, -64, 0, -58, "out_quad"), k(0.28, -70, 48, 0, "in_out_quad"), k(0.5, -40, 30, 0)]},
    "body": {"rotation": [k(0, 0, 0, 0), k(0.1, 0, -8, 0), k(0.28, 4, 8, 0, "in_out_quad"), k(0.5, 0, 0, 0)]},
    "head": {"rotation": [k(0, 0, 0, 0), k(0.28, 10, 0, 0, "in_out_quad"), k(0.5, 0, 0, 0)]},
    "fp_off": {"rotation": [k(0, 0, 0, 0), k(0.1, -20, 0, -30, "out_quad"), k(0.28, -10, 30, 10, "in_out_quad"), k(0.5, 0, 10, 0)],
               "position": [k(0, 0, 0, 0), k(0.1, -4, 3, -2, "out_quad"), k(0.28, 5, 1, 0, "in_out_quad"), k(0.5, 2, 0, 0)]},
})

CLIPS["spirit_select"] = clip(0.4, blend_in=0.04, blend_out=0.16, override=("left_arm",), offhand=True, bones={
    "left_arm": {"rotation": [k(0, *STANCE_LEFT), k(0.12, -62, 12, -22, "out_back"), k(0.24, -58, 10, -20), k(0.4, -10, 4, -6)]},
    "head": {"rotation": [k(0, 0, 0, 0), k(0.12, 4, -8, 0, "out_back"), k(0.4, 0, 0, 0)]},
    "fp_off": {"rotation": [k(0, 0, 0, 0), k(0.12, -20, 0, 10, "out_back"), k(0.24, -18, 0, 8), k(0.4, 0, 0, 0)],
               "position": [k(0, 0, 0, 0), k(0.12, 0, 3, -1, "out_back"), k(0.4, 0, 0, 0)]},
})

# ------------------------------------------------------------------------------------------------ spirit arts (cast from the left hand)


CLIPS["cast_forward"] = clip(0.45, blend_in=0.03, blend_out=0.2, override=("right_arm", "left_arm"), offhand=True, bones={
    "left_arm": {"rotation": [k(0, *STANCE_LEFT), k(0.07, -94, 12, 2, "out_cubic"), k(0.24, -90, 10, 0), k(0.45, -40, 6, -6, "in_out_sine")]},
    "right_arm": {"rotation": [k(0, *STANCE_RIGHT), k(0.07, -8, 12, 16, "out_cubic"), k(0.45, -16, 4, 10)]},
    "body": {"rotation": [k(0, 0, 0, 0), k(0.07, 2, 18, 0, "out_cubic"), k(0.24, 2, 16, 0), k(0.45, 0, 6, 0)]},
    "head": {"rotation": [k(0, 0, 0, 0), k(0.07, 0, -16, 0, "out_cubic"), k(0.24, 0, -14, 0), k(0.45, 0, -5, 0)]},
    "right_leg": {"rotation": [k(0, 0, 0, 0), k(0.07, 8, 0, 0), k(0.45, 4, 0, 0)]},
    "left_leg": {"rotation": [k(0, 0, 0, 0), k(0.07, -14, 0, 0), k(0.45, -6, 0, 0)]},
    "root": {"position": [k(0, 0, 0, 0), k(0.07, 0, -0.4, 0.6, "out_cubic"), k(0.45, 0, 0, 0.2)]},
    "item": {"rotation": [k(0, 0, 0, 0), k(0.07, 20, 0, 0, "out_cubic"), k(0.45, 8, 0, 0)]},
    "fp_off": {"rotation": [k(0, 0, 0, 0), k(0.07, -12, 0, 0, "out_cubic"), k(0.24, -10, 0, 0), k(0.45, 0, 0, 0)],
               "position": [k(0, 0, 0, 0), k(0.07, 2, 3, -6, "out_cubic"), k(0.24, 2, 3, -5), k(0.45, 0, 1, 0)]},
    "fp_main": {"position": [k(0, 0, 0, 0), k(0.07, 1, -2, 1, "out_cubic"), k(0.45, 0, 0, 0)]},
})

CLIPS["cast_self"] = clip(0.65, blend_in=0.05, blend_out=0.22, override=("left_arm",), offhand=True, bones={
    "left_arm": {"rotation": [k(0, *STANCE_LEFT), k(0.16, -64, 44, 2, "out_cubic"), k(0.3, -66, 46, 2), k(0.42, -52, -6, -58, "out_back"),
                              k(0.65, -30, 0, -40, "in_out_sine")]},
    "body": {"rotation": [k(0, 0, 0, 0), k(0.16, 4, 6, 0, "out_cubic"), k(0.42, -6, 0, 0, "out_back"), k(0.65, -2, 0, 0)]},
    "head": {"rotation": [k(0, 0, 0, 0), k(0.16, 10, 0, 0, "out_cubic"), k(0.3, 8, 0, 0), k(0.42, -12, 0, 0, "out_back"), k(0.65, -4, 0, 0)]},
    "root": {"position": [k(0, 0, 0, 0), k(0.42, 0, 0.8, 0, "out_back"), k(0.65, 0, 0.2, 0)]},
    "fp_off": {"rotation": [k(0, 0, 0, 0), k(0.16, -10, 30, 20, "out_cubic"), k(0.3, -10, 32, 20), k(0.42, -30, -20, -20, "out_back"),
                            k(0.65, -10, 0, 0)],
               "position": [k(0, 0, 0, 0), k(0.16, 5, 1, 0, "out_cubic"), k(0.3, 5, 1, 0), k(0.42, -3, 4, -2, "out_back"), k(0.65, 0, 1, 0)]},
})

CLIPS["cast_ground"] = clip(0.65, blend_in=0.04, blend_out=0.22, override=("right_arm", "left_arm"), offhand=True, bones={
    "left_arm": {"rotation": [k(0, *STANCE_LEFT), k(0.06, -120, 10, -10, "out_quad"), k(0.14, -42, 12, -6, "in_quad"), k(0.34, -40, 12, -6),
                              k(0.65, -10, 6, -6, "in_out_sine")]},
    "right_arm": {"rotation": [k(0, *STANCE_RIGHT), k(0.14, 18, 0, 34, "out_quad"), k(0.34, 16, 0, 32), k(0.65, -10, -4, 10)]},
    "body": {"rotation": [k(0, 0, 0, 0), k(0.06, -4, 8, 0), k(0.14, 12, 10, 0, "in_quad"), k(0.34, 12, 10, 0), k(0.65, 2, 2, 0)]},
    "head": {"rotation": [k(0, 0, 0, 0), k(0.14, 12, -8, 0, "in_quad"), k(0.34, 10, -8, 0), k(0.65, 0, 0, 0)]},
    "right_leg": {"rotation": [k(0, 0, 0, 0), k(0.14, -38, 0, 4, "in_quad"), k(0.34, -36, 0, 4), k(0.65, -6, 0, 0)]},
    "left_leg": {"rotation": [k(0, 0, 0, 0), k(0.14, 30, 0, -4, "in_quad"), k(0.34, 28, 0, -4), k(0.65, 4, 0, 0)]},
    "root": {"rotation": [k(0, 0, 0, 0), k(0.06, -3, 0, 0), k(0.14, 14, 0, 0, "in_quad"), k(0.34, 13, 0, 0), k(0.65, 2, 0, 0, "in_out_sine")],
             "position": [k(0, 0, 0, 0), k(0.06, 0, 0.8, 0), k(0.14, 0, -4.2, 1.5, "in_quad"), k(0.34, 0, -4.0, 1.5),
                          k(0.65, 0, -0.6, 0.3, "in_out_sine")]},
    "item": {"rotation": [k(0, 0, 0, 0), k(0.14, 30, 0, 0, "out_quad"), k(0.65, 6, 0, 0)]},
    "fp_off": {"rotation": [k(0, 0, 0, 0), k(0.06, -40, 0, 0, "out_quad"), k(0.14, 40, 0, 0, "in_quad"), k(0.34, 38, 0, 0), k(0.65, 0, 0, 0)],
               "position": [k(0, 0, 0, 0), k(0.06, 1, 4, -1, "out_quad"), k(0.14, 1, -6, -4, "in_quad"), k(0.34, 1, -6, -4), k(0.65, 0, 0, 0)]},
    "fp_main": {"position": [k(0, 0, 0, 0), k(0.14, 1, -4, 1, "in_quad"), k(0.34, 1, -4, 1), k(0.65, 0, 0, 0)]},
})

# El Fura: the left hand gathers the wind across the body and flings it outwards.
CLIPS["cast_sweep"] = clip(0.65, blend_in=0.04, blend_out=0.22, override=("right_arm", "left_arm"), offhand=True, bones={
    "left_arm": {"rotation": [k(0, *STANCE_LEFT), k(0.09, -86, 64, 0, "out_quad"), k(0.22, -84, -46, -34, "in_out_quad"),
                              k(0.38, -80, -50, -40), k(0.65, -30, -10, -20, "in_out_sine")]},
    "right_arm": {"rotation": [k(0, *STANCE_RIGHT), k(0.09, -20, -10, 10), k(0.22, -10, 8, 26, "in_out_quad"), k(0.65, -16, 0, 10)]},
    "body": {"rotation": [k(0, 0, 0, 0), k(0.09, 0, 26, 0, "out_quad"), k(0.22, 2, -22, 0, "in_out_quad"), k(0.38, 2, -24, 0), k(0.65, 0, -6, 0)]},
    "head": {"rotation": [k(0, 0, 0, 0), k(0.09, 0, -20, 0, "out_quad"), k(0.22, 0, 18, 0, "in_out_quad"), k(0.65, 0, 4, 0)]},
    "left_leg": {"rotation": [k(0, 0, 0, 0), k(0.22, -16, 0, -6, "in_out_quad"), k(0.65, -4, 0, 0)]},
    "root": {"position": [k(0, 0, 0, 0), k(0.09, 0, -0.6, -0.5), k(0.22, 0, -0.4, 1.2, "in_out_quad"), k(0.65, 0, 0, 0.3)]},
    "fp_off": {"rotation": [k(0, 0, 0, 0), k(0.09, -20, 40, 10, "out_quad"), k(0.22, -20, -50, -10, "in_out_quad"), k(0.38, -18, -52, -10),
                            k(0.65, 0, 0, 0)],
               "position": [k(0, 0, 0, 0), k(0.09, 8, 2, 0, "out_quad"), k(0.22, -4, 3, -5, "in_out_quad"), k(0.38, -5, 3, -5), k(0.65, 0, 0, 0)]},
})

CLIPS["gale_step"] = clip(0.42, blend_in=0.03, blend_out=0.18, override=("right_arm", "left_arm"), trail=[[0.02, 0.32, "cool"]], bones={
    "right_arm": {"rotation": [k(0, *STANCE_RIGHT), k(0.06, 34, 8, 22, "out_quad"), k(0.3, 32, 8, 20), k(0.42, 0, 0, 10, "in_out_sine")]},
    "left_arm": {"rotation": [k(0, *STANCE_LEFT), k(0.06, 44, 0, -16, "out_quad"), k(0.3, 42, 0, -14), k(0.42, 20, 0, -8)]},
    "body": {"rotation": [k(0, 0, 0, 0), k(0.06, 8, 0, 0, "out_quad"), k(0.3, 8, 0, 0), k(0.42, 2, 0, 0)]},
    "head": {"rotation": [k(0, 0, 0, 0), k(0.06, -16, 0, 0, "out_quad"), k(0.3, -14, 0, 0), k(0.42, -4, 0, 0)]},
    "right_leg": {"rotation": [k(0, 0, 0, 0), k(0.06, -44, 0, 0, "out_quad"), k(0.3, -40, 0, 0), k(0.42, -8, 0, 0)]},
    "left_leg": {"rotation": [k(0, 0, 0, 0), k(0.06, 36, 0, 0, "out_quad"), k(0.3, 34, 0, 0), k(0.42, 6, 0, 0)]},
    "root": {"rotation": [k(0, 0, 0, 0), k(0.06, 28, 0, 0, "out_quad"), k(0.3, 26, 0, 0), k(0.42, 6, 0, 0, "in_out_sine")],
             "position": [k(0, 0, 0, 0), k(0.06, 0, -1.2, 0, "out_quad"), k(0.3, 0, -1.0, 0), k(0.42, 0, 0, 0)]},
    "item": {"rotation": [k(0, 0, 0, 0), k(0.06, 50, 0, 0, "out_quad"), k(0.3, 48, 0, 0), k(0.42, 10, 0, 0)]},
    "fp_main": {"rotation": [k(0, 0, 0, 0), k(0.06, 30, 0, 0, "out_quad"), k(0.3, 28, 0, 0), k(0.42, 0, 0, 0)],
                "position": [k(0, 0, 0, 0), k(0.06, 1, -4, 2, "out_quad"), k(0.3, 1, -4, 2), k(0.42, 0, 0, 0)]},
})

# Ul Gora: Ia's fire and Aro's wind, both hands raising the spiralling firestorm.
CLIPS["ul_gora"] = clip(0.9, blend_in=0.05, blend_out=0.3, override=("right_arm", "left_arm"), offhand=True, bones={
    "right_arm": {"rotation": [k(0, *STANCE_RIGHT), k(0.05, 10, 0, 30, "out_quad"), k(0.15, -122, -14, 10, "in_out_quad"),
                               k(0.3, -112, 6, 22, "smooth"), k(0.45, -126, -10, 8, "smooth"), k(0.6, -116, 4, 18, "smooth"),
                               k(0.9, -40, -6, 6, "in_out_sine")]},
    "left_arm": {"rotation": [k(0, *STANCE_LEFT), k(0.05, 10, 0, -30, "out_quad"), k(0.15, -122, 14, -10, "in_out_quad"),
                              k(0.3, -126, 10, -8, "smooth"), k(0.45, -112, -6, -22, "smooth"), k(0.6, -124, 8, -10, "smooth"),
                              k(0.9, -20, 6, -10, "in_out_sine")]},
    "body": {"rotation": [k(0, 0, 0, 0), k(0.05, 6, 0, 0), k(0.15, -8, 0, 0, "in_out_quad"), k(0.6, -6, 0, 0), k(0.9, 0, 0, 0)]},
    "head": {"rotation": [k(0, 0, 0, 0), k(0.05, 6, 0, 0), k(0.15, -14, 0, 0, "in_out_quad"), k(0.6, -12, 0, 0), k(0.9, 0, 0, 0)]},
    "root": {"position": [k(0, 0, 0, 0), k(0.05, 0, -1.2, 0), k(0.15, 0, 0.8, 0.8, "in_out_quad"), k(0.6, 0, 0.6, 0.6), k(0.9, 0, 0, 0)]},
    "item": {"rotation": [k(0, 0, 0, 0), k(0.15, -60, 0, 0, "in_out_quad"), k(0.6, -58, 0, 0), k(0.9, -10, 0, 0)]},
    "fp_off": {"rotation": [k(0, 0, 0, 0), k(0.05, 20, 0, 0, "out_quad"), k(0.15, -45, 0, 10, "in_out_quad"), k(0.3, -40, 0, -10, "smooth"),
                            k(0.45, -46, 0, 12, "smooth"), k(0.6, -40, 0, -8, "smooth"), k(0.9, 0, 0, 0, "in_out_sine")],
               "position": [k(0, 0, 0, 0), k(0.05, 0, -3, 0, "out_quad"), k(0.15, 2, 6, -4, "in_out_quad"), k(0.6, 2, 6, -4), k(0.9, 0, 0, 0)]},
    "fp_main": {"rotation": [k(0, 0, 0, 0), k(0.15, -40, 0, 0, "in_out_quad"), k(0.6, -38, 0, 0), k(0.9, 0, 0, 0, "in_out_sine")],
                "position": [k(0, 0, 0, 0), k(0.15, -1, 5, -2, "in_out_quad"), k(0.6, -1, 5, -2), k(0.9, 0, 0, 0, "in_out_sine")]},
})


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, data in CLIPS.items():
        for bone, channels in data["bones"].items():
            for channel, keys in channels.items():
                times = [key[0] for key in keys]
                if times != sorted(times):
                    raise SystemExit(f"{name}/{bone}/{channel}: keyframes out of order")
                if times[-1] > data["length"] + 1e-6:
                    raise SystemExit(f"{name}/{bone}/{channel}: keyframe after the clip ends")
        (OUT / f"{name}.json").write_text(json.dumps(data, indent=1) + "\n")
    print(f"wrote {len(CLIPS)} clips to {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
