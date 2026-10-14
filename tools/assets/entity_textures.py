#!/usr/bin/env python3
"""Reproducible generator for Abyssal Descent entity textures and armor equipment layers.

Paints every entity texture (and its emissive layer) into
``src/main/resources/assets/abyssal_descent/textures/entity/``. Each texture is painted per cube face
using Minecraft's box-UV layout, mostly as hand-placed ASCII pixel art on top of tonal base fills.

    python3 tools/assets/entity_textures.py                 # write all textures
    python3 tools/assets/entity_textures.py --preview DIR   # also write UV sheets + 3D model renders

Box UV layout for ``texOffs(u, v)`` and size (w, h, d), rects are [x0, x1) x [y0, y1):
    top    (u+d,     v)   (u+d+w,    v+d)    rows: back -> front, cols: creature right -> left
    bottom (u+d+w,   v)   (u+d+2w,   v+d)    rows: back -> front, cols: creature right -> left
    right  (u,       v+d) (u+d,      v+d+h)  cols: back -> front   (creature's own right, -X)
    front  (u+d,     v+d) (u+d+w,    v+d+h)  cols: right -> left
    left   (u+d+w,   v+d) (u+2d+w,   v+d+h)  cols: front -> back   (creature's own left, +X)
    back   (u+2d+w,  v+d) (u+2d+2w,  v+d+h)  cols: left -> right
The four side faces (right, front, left, back) form one continuous strip around the cube, which
``Box.strip`` exposes so bands and seams wrap without breaks.
"""
from __future__ import annotations

import argparse
import math
import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "src", "main", "resources", "assets", "abyssal_descent", "textures", "entity")


# ----------------------------------------------------------------------------------------------
# Palettes (index 0 = darkest)
# ----------------------------------------------------------------------------------------------
def C(h: str, a: int = 255):
	h = h.lstrip("#")
	return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


def pal(*hexes):
	return [C(h) for h in hexes]


BONE = pal("#3b3326", "#7d6f55", "#a8987a", "#cbbd9c", "#e9dfc6")
IRON = pal("#24262b", "#3f434b", "#5f646d", "#858a93", "#b4b8bf")
RUST = pal("#4a2a1a", "#7a4426", "#a5602f")
SOUL = pal("#2f8fb8", "#56d8ff", "#b8f4ff", "#ffffff")
FLESH = pal("#2f3a2a", "#4b5a3f", "#6b7a55", "#8a9670")
CLOTH = pal("#1c1820", "#2f2a36", "#46404f", "#625b6e")
VIOLET = pal("#5a3a7a", "#8a5ab0")
LEATHER = pal("#2b1d14", "#4a3022", "#6b4632", "#8a5e40")
GOLD = pal("#8a6418", "#c9962a", "#f2c94c")
GHOUL = pal("#3a3442", "#5a5266", "#7a7088", "#9a90a8")

# Supporting tones
VOID = C("#0f0e12")          # eye sockets / deep holes
SHADOW = C("#1a181d")         # very dark recess
LINEN = pal("#3f3c33", "#6a6555", "#918b77", "#b8b19a")    # stained burial linen
OLDBONE = pal("#33291b", "#6e5e40", "#968360", "#b8a57c", "#d6c69c")   # yellowed bone (archer)
PALEBONE = pal("#433c30", "#8a806a", "#b5aa90", "#d6ccb2", "#f1ead6")  # pale heavy bone (shieldbearer)
TABARD_RED = pal("#2a1410", "#45201a", "#642e22", "#83412d")
KNIGHT_CLOTH = pal("#0f1410", "#18201a", "#243026", "#334234")      # green-black tabard
BLACKSTEEL = pal("#0d0e11", "#17181c", "#24262b", "#3a3d44", "#5c606a")
HORN = pal("#141110", "#221d19", "#352d26", "#4c4136", "#6a5c4a")
MOUTH = pal("#1a0c10", "#3a1820", "#5c2a32")
CLAW = pal("#0c0b0e", "#19171c", "#2c2930", "#46424c")
TEETH = pal("#6e6248", "#a39472", "#cfc196")
SKIN = pal("#3a2418", "#5e3c28", "#82563a", "#a3714c")   # weathered merchant skin
BEARD = pal("#4a4744", "#77736c", "#a29d93", "#cfcac0")
TUNIC = pal("#2e1512", "#4a211a", "#6a3222", "#88452c")
AMBER = pal("#c9962a", "#ffcf5a")
GHOUL_EYE = pal("#c8ff60", "#f0ffb0")
TRANSPARENT = (0, 0, 0, 0)


def shift(mat, idx, d=0):
	return mat[max(0, min(len(mat) - 1, idx + d))]


# ----------------------------------------------------------------------------------------------
# Texture + box UV helpers
# ----------------------------------------------------------------------------------------------
class Tex:
	def __init__(self, w: int, h: int):
		self.w, self.h = w, h
		self.a = np.zeros((h, w, 4), np.uint8)

	def set(self, x, y, c):
		if 0 <= x < self.w and 0 <= y < self.h and c is not None:
			self.a[y, x] = c

	def get(self, x, y):
		return tuple(int(v) for v in self.a[y, x])

	def copy(self):
		t = Tex(self.w, self.h)
		t.a = self.a.copy()
		return t

	def save(self, rel):
		path = os.path.join(OUT, rel)
		os.makedirs(os.path.dirname(path), exist_ok=True)
		Image.fromarray(self.a, "RGBA").save(path)
		return path


FACE_NAMES = ("top", "bottom", "right", "front", "left", "back")


class Face:
	"""A face rect of a box, addressed in face-local pixel coordinates (i = column, j = row)."""

	def __init__(self, tex: Tex, x0, y0, w, h, name):
		self.tex, self.x0, self.y0, self.w, self.h, self.name = tex, x0, y0, w, h, name

	def set(self, i, j, c):
		if 0 <= i < self.w and 0 <= j < self.h and c is not None:
			self.tex.set(self.x0 + i, self.y0 + j, c)

	def get(self, i, j):
		return self.tex.get(self.x0 + i, self.y0 + j)

	def clear(self, i, j):
		if 0 <= i < self.w and 0 <= j < self.h:
			self.tex.a[self.y0 + j, self.x0 + i] = 0

	def fill(self, c):
		for j in range(self.h):
			for i in range(self.w):
				self.set(i, j, c)

	def rect(self, i0, j0, i1, j1, c):
		"""Fill [i0, i1) x [j0, j1)."""
		for j in range(j0, j1):
			for i in range(i0, i1):
				self.set(i, j, c)

	def each(self, fn):
		"""fn(i, j) -> colour or None (skip)."""
		for j in range(self.h):
			for i in range(self.w):
				c = fn(i, j)
				if c is not None:
					self.set(i, j, c)

	def art(self, rows, legend, ox=0, oy=0):
		for j, row in enumerate(rows):
			for i, ch in enumerate(row):
				if ch == ".":
					continue
				if ch == "_":
					self.clear(ox + i, oy + j)
					continue
				if ch not in legend:
					raise KeyError(f"char {ch!r} missing from legend (face {self.name})")
				self.set(ox + i, oy + j, legend[ch])

	def mirror_of(self, other: "Face"):
		"""Copy another face of the same size, flipped horizontally (for planes' back sides)."""
		for j in range(self.h):
			for i in range(self.w):
				x, y = other.x0 + (other.w - 1 - i), other.y0 + j
				self.tex.a[self.y0 + j, self.x0 + i] = other.tex.a[y, x]


class Box:
	def __init__(self, u, v, w, h, d, name=""):
		self.u, self.v, self.w, self.h, self.d, self.name = u, v, w, h, d, name

	def rect(self, f):
		u, v, w, h, d = self.u, self.v, self.w, self.h, self.d
		return {
			"top": (u + d, v, w, d),
			"bottom": (u + d + w, v, w, d),
			"right": (u, v + d, d, h),
			"front": (u + d, v + d, w, h),
			"left": (u + d + w, v + d, d, h),
			"back": (u + 2 * d + w, v + d, w, h),
		}[f]

	def rects(self):
		out = []
		for f in FACE_NAMES:
			x0, y0, w, h = self.rect(f)
			if w > 0 and h > 0:
				out.append((f, x0, y0, w, h))
		return out

	def face(self, tex, f) -> Face:
		x0, y0, w, h = self.rect(f)
		return Face(tex, x0, y0, w, h, f)

	def strip(self, tex) -> Face:
		"""The four side faces as one continuous strip: right | front | left | back."""
		return Face(tex, self.u, self.v + self.d, 2 * (self.w + self.d), self.h, "strip")

	def strip_face_of(self, i):
		"""Which side face a strip column belongs to, and the face-local column."""
		d, w = self.d, self.w
		if i < d:
			return "right", i
		if i < d + w:
			return "front", i - d
		if i < 2 * d + w:
			return "left", i - d - w
		return "back", i - 2 * d - w

	def fill(self, tex, mat, base, offsets=None):
		"""Flat tonal fill with per-face lighting offsets (top lit, back/bottom darker)."""
		offs = {"top": 1, "front": 0, "right": 0, "left": 0, "back": -1, "bottom": -1}
		if offsets:
			offs.update(offsets)
		for f in FACE_NAMES:
			F = self.face(tex, f)
			F.fill(shift(mat, base, offs[f]))


def L(main=None, a=None, A=None, p=None, **extra):
	"""Build an art legend: digits -> main palette, a.. -> second, A.. -> third, p.. -> fourth."""
	leg = {"K": VOID, "k": SHADOW, "W": C("#ffffff")}
	for mat, keys in ((main, "0123456789"), (a, "abcdefgh"), (A, "ABCDEFGH"), (p, "pqrstuvw")):
		if mat:
			for k, c in zip(keys, mat):
				leg[k] = c
	leg.update(extra)
	return leg


# ----------------------------------------------------------------------------------------------
# Small procedural helpers (deterministic; used sparingly under hand-placed art)
# ----------------------------------------------------------------------------------------------
def vgrad(F: Face, mat, base, top_boost=1, bottom_drop=1, edge=0.25):
	"""Fill with a gentle vertical gradient: top rows one tone lighter, bottom rows one tone darker."""
	h = F.h
	for j in range(h):
		t = j / max(1, h - 1)
		d = 0
		if t < edge:
			d = top_boost
		elif t > 1 - edge:
			d = -bottom_drop
		for i in range(F.w):
			F.set(i, j, shift(mat, base, d))


def tones(F: Face, mat, rows):
	"""Paint from rows of tone digits ('.' skip, '_' clear)."""
	F.art(rows, {str(k): c for k, c in enumerate(mat)})


# ----------------------------------------------------------------------------------------------
# Model descriptions (mirror the Java LayerDefinitions; used for the box list and the previews)
# ----------------------------------------------------------------------------------------------
class Cube:
	def __init__(self, u, v, x, y, z, w, h, d, mirror=False, grow=0.0, name=""):
		self.u, self.v, self.x, self.y, self.z = u, v, x, y, z
		self.w, self.h, self.d, self.mirror, self.grow, self.name = w, h, d, mirror, grow, name

	@property
	def box(self):
		return Box(self.u, self.v, self.w, self.h, self.d, self.name)


class Part:
	def __init__(self, name, offset=(0, 0, 0), rot=(0, 0, 0), cubes=(), children=()):
		self.name, self.offset, self.rot = name, offset, rot
		self.cubes, self.children = list(cubes), list(children)


def humanoid(arm_w=4, arm_x=-3, leg_w=4, grow=0.0, hat_grow=0.5, arms_forward=False, parts=None):
	"""HumanoidModel / SkeletonModel mesh. arm_w=2 gives the skeleton's thin limbs."""
	g = grow
	ax = arm_x if arm_w == 4 else -1
	lx = -2 if leg_w == 4 else -1
	ld = leg_w
	arm_rot = (-math.pi / 2, 0, 0) if arms_forward else (0, 0, 0)
	leg_off = 1.9 if leg_w == 4 else 2.0
	all_parts = {
		"head": Part("head", (0, 0, 0), cubes=[Cube(0, 0, -4, -8, -4, 8, 8, 8, grow=g, name="head")]),
		"hat": Part("hat", (0, 0, 0), cubes=[Cube(32, 0, -4, -8, -4, 8, 8, 8, grow=g + hat_grow, name="hat")]),
		"body": Part("body", (0, 0, 0), cubes=[Cube(16, 16, -4, 0, -2, 8, 12, 4, grow=g, name="body")]),
		"right_arm": Part("right_arm", (-5, 2, 0), arm_rot,
			cubes=[Cube(40, 16, ax, -2, -arm_w / 2, arm_w, 12, arm_w, grow=g, name="arm")]),
		"left_arm": Part("left_arm", (5, 2, 0), arm_rot,
			cubes=[Cube(40, 16, -1 if arm_w == 2 else -1, -2, -arm_w / 2, arm_w, 12, arm_w, mirror=True, grow=g, name="arm")]),
		"right_leg": Part("right_leg", (-leg_off, 12, 0),
			cubes=[Cube(0, 16, lx, 0, -ld / 2, leg_w, 12, ld, grow=g, name="leg")]),
		"left_leg": Part("left_leg", (leg_off, 12, 0),
			cubes=[Cube(0, 16, lx, 0, -ld / 2, leg_w, 12, ld, mirror=True, grow=g, name="leg")]),
	}
	keys = parts or list(all_parts)
	return Part("root", children=[all_parts[k] for k in keys])


def crypt_ghoul_model():
	return Part("root", children=[
		Part("body", (0, 14, 1), (0.95, 0, 0), cubes=[
			Cube(0, 20, -3.5, -11, -2.5, 7, 11, 5, name="body"),
			Cube(24, 20, -0.5, -10, 2.5, 1, 9, 2, name="spine")], children=[
			Part("head", (0, -11, 0), (-0.95, 0, 0), cubes=[
				Cube(0, 0, -3, -5, -5, 6, 5, 6, name="head"),
				Cube(24, 0, -2, -3.5, -8, 4, 3, 3, name="snout")], children=[
				Part("jaw", (0, -0.5, -2), cubes=[Cube(24, 8, -2, 0, -5.5, 4, 1, 5, name="jaw")])]),
			Part("left_arm", (4, -9, 0), (-0.75, 0, -0.1), cubes=[Cube(32, 20, -1, -1, -1, 2, 15, 2, name="l_arm")], children=[
				Part("left_claw", (0, 14, 0), cubes=[Cube(48, 20, -1.5, 0, -2.5, 3, 2, 4, name="l_claw")])]),
			Part("right_arm", (-4, -9, 0), (-0.75, 0, 0.1), cubes=[Cube(40, 20, -1, -1, -1, 2, 15, 2, name="r_arm")], children=[
				Part("right_claw", (0, 14, 0), cubes=[Cube(48, 26, -1.5, 0, -2.5, 3, 2, 4, name="r_claw")])]),
		]),
		Part("left_leg", (2, 14, 1), cubes=[Cube(0, 40, -1.5, 0, -1.5, 3, 10, 3, name="l_leg")]),
		Part("right_leg", (-2, 14, 1), cubes=[Cube(12, 40, -1.5, 0, -1.5, 3, 10, 3, name="r_leg")]),
	])


def wailing_skull_model():
	return Part("root", children=[
		Part("skull", (0, 18, 0), cubes=[Cube(0, 0, -4, -8, -4, 8, 8, 8, name="skull")], children=[
			Part("jaw", (0, -0.5, 2), cubes=[Cube(32, 0, -3, 0, -6, 6, 2, 6, name="jaw")]),
			Part("flames", (0, -8, 0), children=[
				Part("flame_a", rot=(0, 0.785, 0), cubes=[Cube(32, 8, -5, -8, 0, 10, 8, 0, name="flame")]),
				Part("flame_b", rot=(0, -0.785, 0), cubes=[Cube(32, 8, -5, -8, 0, 10, 8, 0, name="flame")])]),
			Part("spine1", (0, 0, 2.5), cubes=[Cube(0, 16, -1, 0, -1, 2, 2, 2, name="v1")], children=[
				Part("spine2", (0, 2, 0.6), cubes=[Cube(8, 16, -1, 0, -1, 2, 2, 2, name="v2")], children=[
					Part("spine3", (0, 2, 0.6), cubes=[Cube(16, 16, -0.5, 0, -0.5, 1, 2, 1, name="v3")])])]),
		]),
	])


def barrow_knight_model():
	sword = Part("sword", (0, 11, 0), (2.0, 0, 0), cubes=[
		Cube(80, 0, -1, -3, -1, 2, 5, 2, name="grip"),
		Cube(80, 10, -1.5, 2, -1.5, 3, 2, 3, name="pommel"),
		Cube(88, 0, -1, -5, -4, 2, 2, 8, name="guard"),
		Cube(110, 0, -0.5, -27, -2, 1, 22, 4, name="blade")])
	return Part("root", children=[
		Part("torso", (0, 10, 0), cubes=[Cube(0, 18, -5, -13, -3, 10, 13, 6, name="torso")], children=[
			Part("tabard", (0, -1, -3.2), cubes=[Cube(40, 37, -4, 0, 0, 8, 10, 0, name="tabard")]),
			Part("head", (0, -13, 0), cubes=[Cube(0, 0, -4.5, -9, -4.5, 9, 9, 9, name="helm")], children=[
				Part("horn_left", (4, -6, 0), (0, 0, 0.55), cubes=[Cube(36, 0, 0, -5, -1, 2, 5, 2, name="horn_l")]),
				Part("horn_right", (-4, -6, 0), (0, 0, -0.55), cubes=[Cube(44, 0, -2, -5, -1, 2, 5, 2, name="horn_r")])]),
			Part("left_pauldron", (4.5, -11, 0), (0, 0, -0.15), cubes=[Cube(52, 0, -1, -3, -3.5, 6, 5, 7, name="pauldron")]),
			Part("right_pauldron", (-4.5, -11, 0), (0, 0, 0.15), cubes=[Cube(52, 0, -5, -3, -3.5, 6, 5, 7, mirror=True, name="pauldron")]),
			Part("left_arm", (6.5, -10.5, 0), cubes=[Cube(32, 18, -2, -1, -2, 4, 13, 4, name="l_arm")]),
			Part("right_arm", (-6.5, -10.5, 0), cubes=[Cube(48, 18, -2, -1, -2, 4, 13, 4, name="r_arm")], children=[sword]),
		]),
		Part("left_leg", (2.6, 10, 0), cubes=[Cube(0, 37, -2.5, 0, -2.5, 5, 14, 5, name="l_leg")]),
		Part("right_leg", (-2.6, 10, 0), cubes=[Cube(20, 37, -2.5, 0, -2.5, 5, 14, 5, name="r_leg")]),
	])


def hollow_warden_model():
	sword = Part("sword", (0, 15, 0), (2.2, 0, 0), cubes=[
		Cube(100, 0, -1, -3, -1, 2, 6, 2, name="grip"),
		Cube(108, 0, -1.5, 3, -1.5, 3, 2, 3, name="pommel"),
		Cube(100, 8, -1, -5, -4, 2, 2, 8, name="guard"),
		Cube(118, 20, -0.5, -37, -2, 1, 32, 4, name="blade")])
	head = Part("head", (0, -14, -0.5), cubes=[
		Cube(0, 0, -4, -9, -4, 8, 9, 8, name="skull"),
		Cube(32, 0, -5, -10.5, -5, 10, 4, 10, name="crown")], children=[
		Part("jaw", (0, -1, 2), cubes=[Cube(0, 17, -3, 0, -6, 6, 2, 6, name="jaw")]),
		Part("horn_left", (4, -9.5, 0), (0, 0, 0.45), cubes=[Cube(72, 0, 0, -5, -1, 2, 5, 2, name="horn_l")]),
		Part("horn_right", (-4, -9.5, 0), (0, 0, -0.45), cubes=[Cube(80, 0, -2, -5, -1, 2, 5, 2, name="horn_r")])])
	torso = Part("torso", (0, -2, 0), cubes=[Cube(0, 32, -6, -14, -3.5, 12, 14, 7, name="torso")], children=[
		head,
		Part("left_pauldron", (5, -12, 0), (0, 0, -0.12), cubes=[Cube(64, 16, -1.5, -3, -4, 7, 5, 8, name="pauldron")]),
		Part("right_pauldron", (-5, -12, 0), (0, 0, 0.12), cubes=[Cube(64, 16, -5.5, -3, -4, 7, 5, 8, mirror=True, name="pauldron")]),
		Part("left_arm", (8, -11, 0), cubes=[Cube(0, 64, -2, -1, -2, 4, 18, 4, name="l_arm")]),
		Part("right_arm", (-8, -11, 0), cubes=[Cube(16, 64, -2, -1, -2, 4, 18, 4, name="r_arm")], children=[sword]),
		Part("cloak", (0, -13, 3.6), (0.08, 0, 0), cubes=[Cube(72, 64, -7, 0, 0, 14, 30, 1, name="cloak")]),
	])
	return Part("root", children=[
		Part("hips", (0, 2, 0), cubes=[Cube(40, 32, -5, -2, -3, 10, 4, 6, name="hips")], children=[torso]),
		Part("left_leg", (3, 2, 0), cubes=[Cube(32, 64, -2.5, 0, -2.5, 5, 22, 5, name="l_leg")]),
		Part("right_leg", (-3, 2, 0), cubes=[Cube(52, 64, -2.5, 0, -2.5, 5, 22, 5, name="r_leg")]),
	])


def model_cubes(part: Part):
	out = []
	for c in part.cubes:
		out.append(c)
	for ch in part.children:
		out.extend(model_cubes(ch))
	return out


# ----------------------------------------------------------------------------------------------
# Preview: UV contact sheets and a tiny orthographic rasterizer for the real model hierarchy
# ----------------------------------------------------------------------------------------------
FACE_COLOURS = {"top": (255, 230, 60), "bottom": (255, 140, 40), "right": (255, 60, 60),
	"front": (80, 255, 80), "left": (60, 200, 255), "back": (255, 80, 255)}


def _rx(a):
	c, s = math.cos(a), math.sin(a)
	return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])


def _ry(a):
	c, s = math.cos(a), math.sin(a)
	return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])


def _rz(a):
	c, s = math.cos(a), math.sin(a)
	return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])


def _collect_polys(part, M, t, layer, out):
	R = M[:3, :3]
	T = np.eye(4)
	T[:3, 3] = part.offset
	Rm = np.eye(4)
	Rm[:3, :3] = _rz(part.rot[2]) @ _ry(part.rot[1]) @ _rx(part.rot[0])
	M2 = M @ T @ Rm
	for c in part.cubes:
		g = c.grow
		x0, y0, z0 = c.x - g, c.y - g, c.z - g
		x1, y1, z1 = c.x + c.w + g, c.y + c.h + g, c.z + c.d + g
		if c.mirror:
			x0, x1 = x1, x0
		v = {
			"v7": (x0, y0, z0), "v": (x1, y0, z0), "v1": (x1, y1, z0), "v2": (x0, y1, z0),
			"v3": (x0, y0, z1), "v4": (x1, y0, z1), "v5": (x1, y1, z1), "v6": (x0, y1, z1)}
		u, vv, w, h, d = c.u, c.v, c.w, c.h, c.d
		f4, f5, f6, f7 = u, u + d, u + d + w, u + d + w + w
		f8, f9 = u + d + w + d, u + d + w + d + w
		f10, f11, f12 = vv, vv + d, vv + d + h
		polys = [
			(("v4", "v3", "v7", "v"), f5, f10, f6, f11, (0, -1, 0)),
			(("v1", "v2", "v6", "v5"), f6, f11, f7, f10, (0, 1, 0)),
			(("v7", "v3", "v6", "v2"), f4, f11, f5, f12, (-1, 0, 0)),
			(("v", "v7", "v2", "v1"), f5, f11, f6, f12, (0, 0, -1)),
			(("v4", "v", "v1", "v5"), f6, f11, f8, f12, (1, 0, 0)),
			(("v3", "v4", "v5", "v6"), f8, f11, f9, f12, (0, 0, 1)),
		]
		for names, u1, v1, u2, v2, n in polys:
			if u1 == u2 or v1 == v2:
				continue
			pts = []
			for nm in names:
				p = np.array([*v[nm], 1.0])
				pts.append((M2 @ p)[:3])
			nn = np.array(n, float)
			if c.mirror:
				nn[0] *= -1
			nn = M2[:3, :3] @ nn
			# vertex[1] -> (u1, v1), vertex[0] -> (u2, v1), vertex[2] -> (u1, v2)
			out.append((pts[1], pts[0] - pts[1], pts[2] - pts[1], (u1, v1, u2, v2), nn, t, layer))
	for ch in part.children:
		_collect_polys(ch, M2, t, layer, out)


def render_models(layers, yaw=0.0, pitch=0.0, scale=8, nocull=True, light=True):
	"""layers: list of (Part, Tex, glowTex|None). Returns (lit RGBA image, dark RGBA image)."""
	polys = []
	for li, (model, tex, glow) in enumerate(layers):
		_collect_polys(model, np.eye(4), tex, li, polys)
	V = _rx(-pitch) @ _ry(yaw)
	tp = []
	for (o, eu, ev, uv, n, t, li) in polys:
		tp.append((V @ o, V @ eu, V @ ev, uv, V @ n, t, li))
	allp = []
	for o, eu, ev, *_ in tp:
		allp += [o, o + eu, o + ev, o + eu + ev]
	allp = np.array(allp)
	mn, mx = allp.min(0), allp.max(0)
	pad = 2
	W = int(math.ceil((mx[0] - mn[0]) * scale)) + 2 * pad
	H = int(math.ceil((mx[1] - mn[1]) * scale)) + 2 * pad
	zbuf = np.full((H, W), np.inf)
	col = np.zeros((H, W, 4), np.float64)
	hit_l = np.full((H, W), -1, int)
	hit_u = np.zeros((H, W), int)
	hit_v = np.zeros((H, W), int)
	ldir = np.array([0.35, -0.75, -0.55])
	ldir /= np.linalg.norm(ldir)
	ys, xs = np.mgrid[0:H, 0:W]
	px = (xs + 0.5 - pad) / scale + mn[0]
	py = (ys + 0.5 - pad) / scale + mn[1]
	for (o, eu, ev, (u1, v1, u2, v2), n, t, li) in tp:
		front = n[2] < 0
		if not front and not nocull:
			continue
		det = eu[0] * ev[1] - eu[1] * ev[0]
		if abs(det) < 1e-6:
			continue
		corners = np.array([o, o + eu, o + ev, o + eu + ev])
		x0 = max(0, int(((corners[:, 0].min() - mn[0]) * scale) + pad) - 1)
		x1 = min(W, int(((corners[:, 0].max() - mn[0]) * scale) + pad) + 2)
		y0 = max(0, int(((corners[:, 1].min() - mn[1]) * scale) + pad) - 1)
		y1 = min(H, int(((corners[:, 1].max() - mn[1]) * scale) + pad) + 2)
		if x0 >= x1 or y0 >= y1:
			continue
		qx = px[y0:y1, x0:x1] - o[0]
		qy = py[y0:y1, x0:x1] - o[1]
		s = (qx * ev[1] - qy * ev[0]) / det
		tt = (eu[0] * qy - eu[1] * qx) / det
		inside = (s >= 0) & (s < 1) & (tt >= 0) & (tt < 1)
		if not inside.any():
			continue
		z = o[2] + s * eu[2] + tt * ev[2] + (0 if front else 0.01)
		uu = u1 + s * (u2 - u1)
		vv = v1 + tt * (v2 - v1)
		iu = np.where(u2 > u1, np.floor(uu), np.ceil(uu) - 1).astype(int)
		iv = np.where(v2 > v1, np.floor(vv), np.ceil(vv) - 1).astype(int)
		iu = np.clip(iu, 0, t.w - 1)
		iv = np.clip(iv, 0, t.h - 1)
		texel = t.a[iv, iu]
		ok = inside & (texel[..., 3] > 0) & (z < zbuf[y0:y1, x0:x1])
		if not ok.any():
			continue
		nn = n if front else -n
		nn = nn / (np.linalg.norm(nn) + 1e-9)
		shade = 0.5 + 0.5 * max(0.0, float(-nn @ ldir)) if light else 1.0
		zb = zbuf[y0:y1, x0:x1]
		zb[ok] = z[ok]
		cb = col[y0:y1, x0:x1]
		cb[ok, :3] = texel[ok, :3] * shade
		cb[ok, 3] = 255
		hit_l[y0:y1, x0:x1][ok] = li
		hit_u[y0:y1, x0:x1][ok] = iu[ok]
		hit_v[y0:y1, x0:x1][ok] = iv[ok]
	lit = col.copy()
	dark = col.copy()
	dark[..., :3] *= 0.28
	for li, (model, tex, glow) in enumerate(layers):
		if glow is None:
			continue
		m = hit_l == li
		g = glow.a[hit_v, hit_u]
		gm = m & (g[..., 3] > 0)
		for img in (lit, dark):
			a = g[..., 3:4] / 255.0
			img[gm, :3] = img[gm, :3] * (1 - a[gm]) + g[gm, :3] * a[gm]
	return (Image.fromarray(lit.clip(0, 255).astype(np.uint8), "RGBA"),
		Image.fromarray(dark.clip(0, 255).astype(np.uint8), "RGBA"))


def uv_sheet(tex: Tex, boxes, scale=8, label=""):
	from PIL import ImageDraw
	w, h = tex.w * scale, tex.h * scale
	bg = np.zeros((h, w, 3), np.uint8)
	yy, xx = np.mgrid[0:h, 0:w]
	checker = ((xx // scale + yy // scale) % 2).astype(bool)
	bg[:] = (52, 52, 58)
	bg[checker] = (66, 66, 74)
	im = Image.fromarray(bg, "RGB").convert("RGBA")
	big = Image.fromarray(tex.a, "RGBA").resize((w, h), Image.NEAREST)
	im.alpha_composite(big)
	dr = ImageDraw.Draw(im)
	seen = set()
	for b in boxes:
		for f, x0, y0, fw, fh in b.rects():
			dr.rectangle([x0 * scale, y0 * scale, (x0 + fw) * scale - 1, (y0 + fh) * scale - 1],
				outline=FACE_COLOURS[f] + (200,), width=1)
		key = (b.u, b.v)
		if key not in seen:
			seen.add(key)
			dr.text((b.u * scale + 2, b.v * scale + 1), b.name, fill=(255, 255, 255, 230))
	if label:
		dr.text((4, h - 12), label, fill=(255, 255, 0, 255))
	return im


def _row_grid(rows, bgc=(36, 36, 42, 255), gap=8):
	W = max(sum(im.width for im in r) + gap * (len(r) + 1) for r in rows)
	H = sum(max(im.height for im in r) + gap for r in rows) + gap
	out = Image.new("RGBA", (W, H), bgc)
	y = gap
	for r in rows:
		x = gap
		for im in r:
			out.alpha_composite(im, (x, y))
			x += im.width + gap
		y += max(im.height for im in r) + gap
	return out


def compose_preview(name, sheets, renders, outdir, per_row=5):
	"""Writes entity_sheet_<name>.png (UV sheets) and entity_views_<name>.png (model renders)."""
	path = os.path.join(outdir, f"entity_sheet_{name}.png")
	_row_grid([sheets]).save(path)
	if renders:
		rows = [renders[i:i + per_row] for i in range(0, len(renders), per_row)]
		_row_grid(rows).save(os.path.join(outdir, f"entity_views_{name}.png"))
	return path


def standard_renders(layers, scale=8, views=None):
	views = views or [(0, 0), (-0.6, 0.25), (-math.pi / 2, 0), (math.pi, 0), (math.pi - 0.6, 0.25)]
	lit, dark = [], []
	for yaw, pitch in views:
		a, b = render_models(layers, yaw, pitch, scale)
		lit.append(a)
		dark.append(b)
	return lit + dark


# ----------------------------------------------------------------------------------------------
# Shared humanoid box sets
# ----------------------------------------------------------------------------------------------
HUM_HEAD = Box(0, 0, 8, 8, 8, "head")
HUM_HAT = Box(32, 0, 8, 8, 8, "hat")
HUM_BODY = Box(16, 16, 8, 12, 4, "body")
HUM_ARM = Box(40, 16, 4, 12, 4, "arm")
HUM_LEG = Box(0, 16, 4, 12, 4, "leg")
SKEL_ARM = Box(40, 16, 2, 12, 2, "arm")
SKEL_LEG = Box(0, 16, 2, 12, 2, "leg")
HUMANOID_BOXES = [HUM_HEAD, HUM_HAT, HUM_BODY, HUM_ARM, HUM_LEG]
SKELETON_BOXES = [HUM_HEAD, HUM_HAT, HUM_BODY, SKEL_ARM, SKEL_LEG]


def wrap_bands(F: Face, box: Box, rows, mat, base, pitch=4, width=2, slope=1, phase=0, gaps=()):
	"""Diagonal spiral wrappings around a limb strip (continuous across faces)."""
	for j in rows:
		for i in range(F.w):
			k = (j + (i // 2) * slope + phase) % pitch
			if k < width and (i, j) not in gaps:
				face, _ = box.strip_face_of(i)
				d = 1 if k == 0 else 0
				if face == "back":
					d -= 1
				F.set(i, j, shift(mat, base, d))


# ----------------------------------------------------------------------------------------------
# 1. Risen (zombie layout, 64x64)
# ----------------------------------------------------------------------------------------------
def paint_risen():
	t = Tex(64, 64)
	lg = L(FLESH, a=BONE, A=LINEN, x=C("#232b20"))
	H = HUM_HEAD
	H.fill(t, FLESH, 1)
	H.face(t, "front").art([
		"23333222",
		"2ed33221",
		"12222211",
		"1KK21KK0",
		"0KK10KK0",
		"21xKKx10",
		"1dcKdcK0",
		"0xcdbcx0",
	], lg)
	# right side (back -> front)
	H.face(t, "right").art([
		"11122222",
		"01122332",
		"01112222",
		"00111122",
		"0011xK12",
		"00111x11",
		"00111111",
		"x0011100",
	], lg)
	# left side (front -> back): torn temple showing skull
	H.face(t, "left").art([
		"22322111",
		"2cdd2111",
		"2cdec111",
		"1bccb011",
		"21bb1Kx0",
		"1111x100",
		"11111000",
		"0011100x",
	], lg)
	H.face(t, "top").art([
		"00110100",
		"01121110",
		"11222211",
		"1223dd21",
		"122cde21",
		"12233221",
		"12233321",
		"12333322",
	], lg)
	H.face(t, "back").art([
		"10011001",
		"01111110",
		"11211211",
		"11111111",
		"01111110",
		"01101110",
		"00111100",
		"x000000x",
	], lg)
	H.face(t, "bottom").art([
		"00000000",
		"0xxxxxx0",
		"0x0000x0",
		"0x0000x0",
		"0x0000x0",
		"00000000",
		"01111110",
		"01111110",
	], lg)

	# Hat: tattered burial-shroud hood scraps (linen), mostly transparent
	T = HUM_HAT
	lgh = L(LINEN)
	T.face(t, "top").art([
		"_011211_",
		"01122110",
		"1122211_",
		"_12221__",
		"__121___",
		"___1____",
		"________",
		"________",
	], lgh)
	T.face(t, "back").art([
		"11212110",
		"01111100",
		"0111010_",
		"_01_010_",
		"_0__0_0_",
		"____0___",
		"________",
		"________",
	], lgh)
	T.face(t, "right").art([
		"1111____",
		"0110____",
		"010_____",
		"00______",
		"0_______",
		"0_______",
		"________",
		"________",
	], lgh)
	T.face(t, "left").art([
		"____1111",
		"_____110",
		"______10",
		"______00",
		"_______0",
		"________",
		"________",
		"________",
	], lgh)
	T.face(t, "front").art([
		"________",
		"________",
		"________",
		"________",
		"________",
		"________",
		"________",
		"________",
	], lgh)

	# Body: ribs torn open on the right breast, burial linen sash + waist wrapping
	B = HUM_BODY
	B.fill(t, FLESH, 1)
	B.face(t, "front").art([
		"23332BCD",
		"2x332CDB",
		"xdccxBCA",
		"xKKKCBA1",
		"xdccBCA1",
		"xKKBCA21",
		"1xBCA211",
		"1BCA2111",
		"ACDCCDCB",
		"ABCBBCBA",
		"AA_AAA_A",
		"_A__A___",
	], lg)
	B.face(t, "right").art([
		"1232",
		"1222",
		"0121",
		"1232",
		"0121",
		"0122",
		"0011",
		"0111",
		"BCDC",
		"ABCB",
		"A_AA",
		"__A_",
	], lg)
	B.face(t, "left").art([
		"CD21",
		"BCB1",
		"ABC0",
		"1AB0",
		"2110",
		"1110",
		"0110",
		"0100",
		"CDCB",
		"BCBA",
		"AA_A",
		"_A__",
	], lg)
	B.face(t, "back").art([
		"1112DC11",
		"112DCA11",
		"01DCAc10",
		"0CBA1b10",
		"CBA10c10",
		"BA110b00",
		"A11bc110",
		"0110b100",
		"BCDCCDCB",
		"ABCBBCBA",
		"A_AAA_AA",
		"__A___A_",
	], lg)
	B.face(t, "top").art([
		"11122DC1",
		"22222DC1",
		"12333CD1",
		"23332CD2",
	], lg)
	B.face(t, "bottom").art([
		"AABBABBA",
		"A000000A",
		"A000000A",
		"ABBABBBA",
	], lg)

	# Arm (mirrored for the left): flesh, linen wrap on the upper arm, exposed ulna, bony hand
	A = HUM_ARM
	A.fill(t, FLESH, 1)
	A.strip(t).art([
		"1222" "2322" "2111" "1111",
		"1122" "2232" "2111" "0111",
		"CDCC" "DCDC" "CCBC" "BBCB",
		"BCDC" "CDCC" "CBCB" "ABBC",
		"AxAA" "CABC" "BxAB" "xAxA",
		"1121" "2221" "1110" "0110",
		"cdc1" "2321" "1110" "0100",
		"1bcd" "c221" "1110" "0110",
		"1211" "2bc1" "1100" "0100",
		"BCCB" "CDCB" "CBBC" "BBCB",
		"10x1" "cdcd" "1x01" "0000",
		"0x00" "bcbc" "0x00" "x00x",
	], lg)
	A.face(t, "top").art(["1221", "1232", "2232", "2222"], lg)
	A.face(t, "bottom").art(["0110", "x00x", "dcdc", "cbcb"], lg)

	# Leg (mirrored for the left): spiral burial wrappings, torn to show flesh, bare rotting feet
	G = HUM_LEG
	G.fill(t, FLESH, 1)
	S = G.strip(t)
	S.art([
		"1121" "2222" "1111" "0110",
		"1111" "1221" "1111" "0010",
	], lg)
	for j in range(2, 9):
		for i in range(16):
			face, _ = G.strip_face_of(i)
			k = (j - i // 2) % 4
			back = 1 if face == "back" else 0
			if k < 3:
				S.set(i, j, LINEN[max(0, 3 - k - back)])
			else:
				S.set(i, j, C("#232b20") if back else FLESH[0])
	S.art([
		"................",
		"................",
		"................",
		"......1.........",
		"........1.......",
		"................",
		"...2............",
		"...........11...",
		"..A....A.....A..",
		"1110" "1221" "1100" "0000",
		"0110" "1111" "1100" "0000",
		"0x00" "cdcd" "000x" "0000",
	], lg)
	G.face(t, "top").art(["1111", "1211", "1221", "1221"], lg)
	G.face(t, "bottom").art(["0000", "0xx0", "0xx0", "0000"], lg)

	eyes = Tex(64, 64)
	f = H.face(eyes, "front")
	f.set(2, 3, SOUL[2])
	f.set(5, 3, SOUL[2])
	return {"risen/risen.png": t, "risen/risen_eyes.png": eyes}


def preview_risen(texs, outdir):
	base, eyes = texs["risen/risen.png"], texs["risen/risen_eyes.png"]
	sheets = [uv_sheet(base, HUMANOID_BOXES, 8, "risen"), uv_sheet(eyes, HUMANOID_BOXES, 4, "eyes")]
	body = humanoid(parts=["head", "body", "right_arm", "left_arm", "right_leg", "left_leg"])
	hat = humanoid(parts=["hat"])
	renders = standard_renders([(body, base, eyes), (hat, base, None)], scale=10)
	return compose_preview("risen", sheets, renders, outdir)


# ----------------------------------------------------------------------------------------------
# 2/3. Skeleton variants (vanilla skeleton layout 64x32) + humanoid 64x32 overlays
# ----------------------------------------------------------------------------------------------
HOOD = pal("#16140f", "#25221b", "#38332a", "#4f483b")   # dark weathered hood (archer)
FEATHER = pal("#6e6a60", "#a8a294", "#d8d2c2")


def paint_skeleton_base(bone, heavy=False):
	t = Tex(64, 32)
	lg = L(bone, a=TEETH)
	H = HUM_HEAD
	H.fill(t, bone, 2)
	if heavy:
		front = [
			"34444443",
			"34443443",
			"33333332",
			"3KK33KK2",
			"2KK22KK2",
			"2223K322",
			"2K4K4K42",
			"12333321",
		]
	else:
		front = [
			"34441443",
			"34431433",
			"33312332",
			"2KK21KK2",
			"2KK22KK1",
			"2213K221",
			"2K3K3K31",
			"12322211",
		]
	H.face(t, "front").art(front, lg)
	H.face(t, "right").art([
		"23333333",
		"22333333",
		"22233333",
		"12223333",
		"12222342",
		"122K2232",
		"11222122",
		"11111111",
	], lg)
	H.face(t, "left").art([
		"33333332",
		"33333322" if heavy else "33331322",
		"33333222" if heavy else "33331222",
		"33332221" if heavy else "33313221",
		"24322221",
		"2322K221",
		"22122211",
		"11111111",
	], lg)
	H.face(t, "back").art([
		"23333332",
		"23333322",
		"22333222",
		"22222221" if heavy else "22122221",
		"22222221" if heavy else "22212221",
		"12222211",
		"11222111",
		"11111111",
	], lg)
	H.face(t, "top").art([
		"22333322",
		"23334332",
		"33344433",
		"23332333",
		"33343433" if heavy else "33343133",
		"34444433" if heavy else "34441433",
		"34444443" if heavy else "34414443",
		"34444443",
	], lg)
	H.face(t, "bottom").art([
		"11111111",
		"11000011",
		"1100K011",
		"11000011",
		"11100111",
		"11111111",
		"12222221",
		"12222221",
	], lg)

	# Body: ribcage, mostly see-through like vanilla
	B = HUM_BODY
	B.face(t, "front").art([
		"23444432",
		"_233332_",
		"___43___",
		"_334433_" if heavy else "_233332_",
		"___32___",
		"_233332_" if heavy else "_123321_",
		"___32___",
		"__2332__" if heavy else "__1221__",
		"___32___",
		"___21___",
		"_123321_",
		"12____21",
	], lg)
	B.face(t, "right").art([
		"2333",
		"2333",
		"____",
		"2233" if heavy else "1223",
		"____",
		"1222" if heavy else "1122",
		"____",
		"_122" if heavy else "__12",
		"____",
		"____",
		"1222",
		"12__",
	], lg)
	B.face(t, "left").art([
		"3332",
		"3322",
		"____",
		"3221" if heavy else "3211",
		"____",
		"2211" if heavy else "2111",
		"____",
		"221_" if heavy else "21__",
		"____",
		"____",
		"2221",
		"__21",
	], lg)
	B.face(t, "back").art([
		"12233221",
		"_122221_" if heavy else "_12__21_",
		"___32___",
		"_222322_" if heavy else "_122321_",
		"___32___",
		"_112211_" if heavy else "_112211_",
		"___32___",
		"__1221__" if heavy else "__1221__",
		"___32___",
		"___21___",
		"_122221_",
		"12_21_21",
	], lg)
	B.face(t, "top").art([
		"22222222",
		"32____23",
		"32____23",
		"34444443",
	], lg)
	B.face(t, "bottom").art([
		"11111111",
		"1______1",
		"1______1",
		"11111111",
	], lg)

	# Arms 2x12x2 (strip: right|front|left|back, 2 px each)
	A = SKEL_ARM
	A.strip(t).art([
		"34" "43" "32" "21",
		"23" "34" "32" "21",
		"23" "34" "22" "11",
		"23" "33" "22" "11",
		"22" "33" "22" "11",
		"34" "44" "33" "22",
		"23" "33" "32" "21",
		"23" "3K" "22" "11" if not heavy else "23" "33" "22" "11",
		"22" "32" "21" "11",
		"22" "32" "21" "11",
		"12" "21" "11" "01",
		"21" "2K" "1K" "01",
	], lg)
	A.face(t, "top").art(["34", "33"], lg)
	A.face(t, "bottom").art(["21", "32"], lg)

	# Legs 2x12x2
	G = SKEL_LEG
	G.strip(t).art([
		"23" "34" "32" "21",
		"23" "34" "22" "11",
		"23" "33" "22" "11",
		"22" "33" "22" "11",
		"22" "33" "21" "11",
		"33" "44" "32" "21",
		"23" "43" "32" "21",
		"22" "33" "22" "11",
		"22" "32" "21" "11",
		"22" "32" "21" "11",
		"12" "22" "21" "11",
		"22" "33" "22" "11",
	], lg)
	G.face(t, "top").art(["33", "33"], lg)
	G.face(t, "bottom").art(["11", "22"], lg)
	return t


def skeleton_eyes():
	e = Tex(64, 32)
	f = HUM_HEAD.face(e, "front")
	f.set(2, 3, SOUL[2])
	f.set(5, 3, SOUL[2])
	return e


def paint_bone_archer():
	base = paint_skeleton_base(BONE, heavy=False)
	o = Tex(64, 32)
	lg = L(HOOD, a=LEATHER, A=FEATHER, p=GOLD)
	H = HUM_HEAD
	H.face(o, "top").art([
		"11222211",
		"12233221",
		"12233321",
		"12333321",
		"12333331",
		"23333332",
		"23333332",
		"33333333",
	], lg)
	H.face(o, "front").art([
		"33333332",
		"10000001",
		"1______1",
		"2______1",
		"1______0",
		"1______0",
		"0______0",
		"_______0",
	], lg)
	H.face(o, "right").art([
		"22222233",
		"12222223",
		"11222223",
		"11122222",
		"11122222",
		"01112122",
		"0101_011",
		"_0_0__01",
	], lg)
	H.face(o, "left").art([
		"33222222",
		"32222211",
		"32222111",
		"22221111",
		"22211110",
		"21211100",
		"110_1010",
		"10__0_0_",
	], lg)
	H.face(o, "back").art([
		"11122111",
		"11122111",
		"01121110",
		"01111110",
		"00111100",
		"0010_100",
		"0_00_0_0",
		"__0___0_",
	], lg)
	# Hat: hood peak overhang + a frayed edge (inflated layer)
	T = HUM_HAT
	T.face(o, "front").art([
		"2333333_",
		"_1_0_1__",
	], lg)
	T.face(o, "top").art([
		"________",
		"________",
		"________",
		"________",
		"________",
		"________",
		"________",
		"23333332",
	], lg)
	T.face(o, "right").art(["_______3", "______1_"], lg)
	T.face(o, "left").art(["3_______", "_1______"], lg)

	# Body: short ragged mantle + leather quiver strap + quiver on the back
	B = HUM_BODY
	B.face(o, "top").art([
		"2CBA2222",
		"2bcb2332",
		"2333CB32",
		"333BC333",
	], lg)
	B.face(o, "front").art([
		"332__BC3",
		"21__BC_2",
		"21_BC__1",
		"1_BC___1",
		"0BC____0",
		"BC______",
		"C_______",
		"________",
		"________",
		"________",
		"________",
		"________",
	], lg)
	B.face(o, "right").art([
		"2233",
		"1222",
		"1122",
		"0112",
		"0111",
		"_011",
		"_0_0",
		"____",
		"____",
		"____",
		"____",
		"____",
	], lg)
	B.face(o, "left").art([
		"3322",
		"2211",
		"2111",
		"2110",
		"1110",
		"1_0_",
		"0___",
		"____",
		"____",
		"____",
		"____",
		"____",
	], lg)
	B.face(o, "back").art([
		"BC22ACB2",
		"CB22dcd1",
		"21C1bcb1",
		"11BCbca0",
		"101Bbca0",
		"100BCca0",
		"0_10bBC_",
		"____bcaC",
		"____bpa_",
		"____bca_",
		"_____a__",
		"________",
	], lg)
	# Arms: frayed sleeves near the shoulders only
	A = HUM_ARM
	A.face(o, "top").art(["2233", "2333", "2333", "2233"], lg)
	A.strip(o).art([
		"2222" "3333" "2222" "1111",
		"1222" "2332" "2221" "1111",
		"1121" "2222" "2111" "0110",
		"0_10" "1_21" "1_01" "0_0_",
		"_0__" "_1__" "0__0" "____",
	], lg)
	return {"skeleton/bone_archer.png": base, "skeleton/bone_archer_overlay.png": o,
		"skeleton/bone_archer_eyes.png": skeleton_eyes()}


def _mail(i, j, base=1):
	"""Riveted mail: staggered ring rows (light top arc, dark gap)."""
	k = (i + (j // 2)) % 2
	if j % 2 == 0:
		return IRON[base + 2] if k == 0 else IRON[base + 1]
	return IRON[base] if k == 0 else IRON[base + 1]


def paint_bone_shieldbearer():
	base = paint_skeleton_base(PALEBONE, heavy=True)
	o = Tex(64, 32)
	lg = L(IRON, a=RUST, A=TABARD_RED, p=BONE[1:])
	H = HUM_HEAD
	# Dented crypt-iron kettle helmet
	H.face(o, "top").art([
		"22233222",
		"22333322",
		"2a343332",
		"23344332",
		"23344432",
		"233334b2",
		"22334a32",
		"22333322",
	], lg)
	H.face(o, "front").art([
		"23344332",
		"2a331232",
		"12222221",
		"34444443",
		"________",
		"________",
		"________",
		"________",
	], lg)
	H.face(o, "right").art([
		"22222333",
		"22222333",
		"1a122232",
		"33333334",
		"________",
		"________",
		"________",
		"________",
	], lg)
	H.face(o, "left").art([
		"33322222",
		"3322b222",
		"2322a221",
		"43333333",
		"________",
		"________",
		"________",
		"________",
	], lg)
	H.face(o, "back").art([
		"22222222",
		"21222b12",
		"11a21211",
		"22222222",
		"________",
		"________",
		"________",
		"________",
	], lg)
	# Hat layer: the kettle brim as a lip 0.5 px proud of the helmet
	T = HUM_HAT
	T.face(o, "front").art(["________", "________", "________", "34444443"], lg)
	T.face(o, "right").art(["________", "________", "________", "33333334"], lg)
	T.face(o, "left").art(["________", "________", "________", "43333333"], lg)
	T.face(o, "back").art(["________", "________", "________", "22232222"], lg)

	# Body: chainmail vest under a ragged red-brown tabard with a faded emblem
	B = HUM_BODY
	mail = _mail
	for f in ("right", "left", "front", "back"):
		F = B.face(o, f)
		F.each(lambda i, j: mail(i, j) if j < 9 else None)
	B.face(o, "top").each(lambda i, j: _mail(i, j, 2))
	B.face(o, "front").art([
		"3BCDDCB3",
		"2BCCCCB2",
		"1BqrrqB1",
		"2BrArAB2",
		"1BqrrpB1",
		"2BCpqCB2",
		"1BCCCCB1",
		"2BBCCBB1",
		"1BCBCCB1",
		"_BC_CBB_",
		"_A__BA__",
		"____A___",
	], lg)
	B.face(o, "back").art([
		"3BCCCCB3",
		"2BCCCCB2",
		"1BBCCBB1",
		"2BCCCCB2",
		"1BCBCCB1",
		"2BCCBCB2",
		"1BBCCBB1",
		"2BCCCBB1",
		"_BCBCCB_",
		"_AB_BA__",
		"__A__A__",
		"________",
	], lg)
	B.face(o, "right").art([
		"3333",
		"....",
		"....",
		"....",
		"....",
		"....",
		"....",
		"....",
		"1_1_",
		"_0__",
	], lg)
	B.face(o, "left").art([
		"3333",
		"....",
		"....",
		"....",
		"....",
		"....",
		"....",
		"....",
		"_1_1",
		"__0_",
	], lg)
	# Arms: mail sleeves at the shoulder
	A = HUM_ARM
	A.face(o, "top").each(lambda i, j: _mail(i, j, 2))
	S = A.strip(o)
	S.each(lambda i, j: _mail(i, j, 1) if j < 3 else None)
	S.art([
		"3333" "4444" "3333" "2222",
		"................",
		"................",
		"1_1_" "_1_1" "1__1" "_0_0",
	], lg)
	return {"skeleton/bone_shieldbearer.png": base, "skeleton/bone_shieldbearer_overlay.png": o,
		"skeleton/bone_shieldbearer_eyes.png": skeleton_eyes()}


def _skeleton_preview(name, texs, prefix, outdir):
	base, over, eyes = (texs[f"skeleton/{prefix}.png"], texs[f"skeleton/{prefix}_overlay.png"],
		texs[f"skeleton/{prefix}_eyes.png"])
	sheets = [uv_sheet(base, SKELETON_BOXES, 8, prefix), uv_sheet(over, HUMANOID_BOXES, 8, "overlay"),
		uv_sheet(eyes, SKELETON_BOXES, 4, "eyes")]
	skel = humanoid(arm_w=2, leg_w=2, parts=["head", "body", "right_arm", "left_arm", "right_leg", "left_leg"])
	outer = humanoid(grow=0.25)
	renders = standard_renders([(skel, base, eyes), (outer, over, None)], scale=10)
	return compose_preview(name, sheets, renders, outdir)


def preview_bone_archer(texs, outdir):
	return _skeleton_preview("bone_archer", texs, "bone_archer", outdir)


def preview_bone_shieldbearer(texs, outdir):
	return _skeleton_preview("bone_shieldbearer", texs, "bone_shieldbearer", outdir)


# ----------------------------------------------------------------------------------------------
# 4. Crypt ghoul (custom model, 64x64)
# ----------------------------------------------------------------------------------------------
G_BODY = Box(0, 20, 7, 11, 5, "body")
G_SPINE = Box(24, 20, 1, 9, 2, "spine")
G_HEAD = Box(0, 0, 6, 5, 6, "head")
G_SNOUT = Box(24, 0, 4, 3, 3, "snout")
G_JAW = Box(24, 8, 4, 1, 5, "jaw")
G_LARM = Box(32, 20, 2, 15, 2, "l_arm")
G_RARM = Box(40, 20, 2, 15, 2, "r_arm")
G_LCLAW = Box(48, 20, 3, 2, 4, "l_claw")
G_RCLAW = Box(48, 26, 3, 2, 4, "r_claw")
G_LLEG = Box(0, 40, 3, 10, 3, "l_leg")
G_RLEG = Box(12, 40, 3, 10, 3, "r_leg")
GHOUL_BOXES = [G_BODY, G_SPINE, G_HEAD, G_SNOUT, G_JAW, G_LARM, G_RARM, G_LCLAW, G_RCLAW, G_LLEG, G_RLEG]


def paint_crypt_ghoul():
	t = Tex(64, 64)
	x = C("#241f2b")
	lg = L(GHOUL, a=TEETH, A=MOUTH, p=CLAW, x=x, y=BONE[2], z=BONE[3], w=BONE[1], t=C("#5e5866"))

	# --- Head: hairless, sunken brow, deep sockets; the snout covers the lower middle of the face
	H = G_HEAD
	H.face(t, "front").art([
		"233321",
		"xKxxKx",
		"1x00x0",
		"101100",
		"010010",
	], lg)
	H.face(t, "top").art([
		"011110",
		"122221",
		"123321",
		"123332",
		"233332",
		"133321",
	], lg)
	H.face(t, "right").art([
		"012222",
		"011123",
		"00x112",
		"001x11",
		"000011",
	], lg)
	H.face(t, "left").art([
		"222210",
		"321110",
		"211x00",
		"11x100",
		"110000",
	], lg)
	H.face(t, "back").art([
		"112211",
		"122221",
		"112z11",
		"011y10",
		"001100",
	], lg)
	H.face(t, "bottom").art([
		"000000",
		"0xxxx0",
		"0x00x0",
		"0x00x0",
		"000000",
		"000000",
	], lg)

	# --- Snout: wrinkled muzzle, slit nostrils, lips peeled back from yellowed teeth
	N = G_SNOUT
	N.face(t, "top").art([
		"1221",
		"2332",
		"1331",
	], lg)
	N.face(t, "front").art([
		"2KK2",
		"BAAB",
		"cbcb",
	], lg)
	N.face(t, "right").art([
		"122",
		"1BB",
		"bcb",
	], lg)
	N.face(t, "left").art([
		"221",
		"BB1",
		"bcb",
	], lg)
	N.face(t, "back").fill(GHOUL[0])
	N.face(t, "bottom").art([
		"bAAb",
		"cAAc",
		"bcbc",
	], lg)

	# --- Jaw: lower teeth along the rim, dark tongue inside
	J = G_JAW
	J.face(t, "top").art([
		"AAAA",
		"aAAa",
		"bBBb",
		"cBCb",
		"bcbc",
	], lg)
	J.face(t, "front").art(["cbcb"], lg)
	J.face(t, "right").art(["0abcb"], lg)
	J.face(t, "left").art(["bcba0"], lg)
	J.face(t, "back").fill(GHOUL[0])
	J.face(t, "bottom").art([
		"0000",
		"0110",
		"1111",
		"1221",
		"1221",
	], lg)

	# --- Body: stretched skin over ribs; the hunched back shows shoulder blades and spine knobs
	B = G_BODY
	B.strip(t).art([
		# right(5)  front(7)   left(5)  back(7)   ribs wrap the torso as horizontal ridges/grooves
		"12233" "2333332" "33221" "2233322",
		"12232" "0011100" "23221" "3332333",
		"23332" "2332332" "23332" "3321233",
		"x0000" "x00100x" "0000x" "1x010x1",
		"23332" "1332331" "23332" "3332333",
		"x0000" "x00100x" "0000x" "x00100x",
		"12332" "1232321" "23321" "2332332",
		"x0000" "x01110x" "0000x" "x00100x",
		"11221" "0121210" "12211" "2232322",
		"01221" "1011101" "12210" "1222221",
		"x0121" "2x000x2" "1210x" "1x121x1",
	], lg)
	B.face(t, "top").art([
		"1223221",
		"2333332",
		"2310132",
		"2zx0xz2",
		"1yz3zy1",
	], lg)
	B.face(t, "bottom").art([
		"0000000",
		"0x000x0",
		"0xxxxx0",
		"0x000x0",
		"0000000",
	], lg)

	# --- Spine ridge: knobby vertebrae poking through the skin
	S = G_SPINE
	knobs = ["z", "y", "1", "z", "y", "1", "z", "y", "1"]
	S.face(t, "back").art(knobs, lg)
	S.face(t, "right").art(["1y", "0w", "x0", "1y", "0w", "x0", "1y", "0w", "x0"], lg)
	S.face(t, "left").art(["y1", "w0", "0x", "y1", "w0", "0x", "y1", "w0", "0x"], lg)
	S.face(t, "front").fill(GHOUL[0])
	S.face(t, "top").art(["z", "y"], lg)
	S.face(t, "bottom").art(["w", "w"], lg)

	# --- Arms: gaunt, knobbly elbows and knuckles (2x15x2)
	arm = [
		"23" "33" "32" "22",
		"23" "33" "32" "21",
		"12" "23" "21" "11",
		"12" "22" "21" "11",
		"12" "22" "21" "11",
		"11" "21" "11" "10",
		"23" "33" "32" "22",
		"01" "11" "10" "00",
		"12" "32" "21" "11",
		"12" "32" "21" "11",
		"12" "32" "21" "11",
		"12" "22" "21" "10",
		"11" "21" "11" "00",
		"00" "00" "00" "x0",
		"12" "23" "21" "11",
	]
	G_LARM.strip(t).art(arm, lg)
	G_RARM.strip(t).art(arm, lg)
	for A in (G_LARM, G_RARM):
		A.face(t, "top").art(["23", "22"], lg)
		A.face(t, "bottom").art(["11", "11"], lg)

	# --- Claws: bony hands with long black talons pointing forward (3x2x4)
	for K in (G_LCLAW, G_RCLAW):
		K.face(t, "top").art([
			"212",
			"323",
			"rqr",
			"sts",
		], lg)
		K.face(t, "front").art([
			"tqt",
			"rpr",
		], lg)
		K.face(t, "right").art(["12rs", "01qr"], lg)
		K.face(t, "left").art(["sr21", "rq10"], lg)
		K.face(t, "back").art(["111", "000"], lg)
		K.face(t, "bottom").art([
			"000",
			"101",
			"qpq",
			"rqr",
		], lg)

	# --- Legs: knobbly knees, stringy shins, clawed feet (3x10x3)
	leg = [
		"122" "232" "221" "111",
		"112" "232" "211" "111",
		"112" "222" "211" "011",
		"011" "121" "110" "001",
		"123" "333" "321" "111",
		"011" "121" "110" "000",
		"112" "232" "211" "001",
		"112" "232" "211" "001",
		"011" "121" "110" "000",
		"0qr" "sts" "rq0" "000",
	]
	for G in (G_LLEG, G_RLEG):
		G.strip(t).art(leg, lg)
		G.face(t, "top").art(["111", "121", "121"], lg)
		G.face(t, "bottom").art(["000", "0p0", "qpq"], lg)

	eyes = Tex(64, 64)
	f = H.face(eyes, "front")
	f.set(1, 1, GHOUL_EYE[1])
	f.set(4, 1, GHOUL_EYE[1])
	f.set(0, 1, GHOUL_EYE[0])
	f.set(5, 1, GHOUL_EYE[0])
	return {"crypt_ghoul.png": t, "crypt_ghoul_eyes.png": eyes}


def preview_crypt_ghoul(texs, outdir):
	base, eyes = texs["crypt_ghoul.png"], texs["crypt_ghoul_eyes.png"]
	sheets = [uv_sheet(base, GHOUL_BOXES, 10, "crypt_ghoul"), uv_sheet(eyes, GHOUL_BOXES, 4, "eyes")]
	renders = standard_renders([(crypt_ghoul_model(), base, eyes)], scale=12,
		views=[(0, 0.15), (-0.7, 0.3), (-math.pi / 2, 0.1), (math.pi, 0.5), (math.pi - 0.7, 0.4)])
	return compose_preview("crypt_ghoul", sheets, renders, outdir)


# ----------------------------------------------------------------------------------------------
# 5. Wailing skull (64x32) + glow
# ----------------------------------------------------------------------------------------------
W_SKULL = Box(0, 0, 8, 8, 8, "skull")
W_JAW = Box(32, 0, 6, 2, 6, "jaw")
W_FLAME = Box(32, 8, 10, 8, 0, "flame")
W_V1 = Box(0, 16, 2, 2, 2, "v1")
W_V2 = Box(8, 16, 2, 2, 2, "v2")
W_V3 = Box(16, 16, 1, 2, 1, "v3")
WAILING_BOXES = [W_SKULL, W_JAW, W_FLAME, W_V1, W_V2, W_V3]
SOUL_DEEP = pal("#0e2a3c", "#16405a", "#1f5d80", "#2f8fb8")   # unlit soul-fire body (base layer)

FLAME_ART = [
	"__0____0__",
	"__0___01__",
	"_01__01__0",
	"_01_012_10",
	"01210121_0",
	"0122122210",
	"1223232321",
	"1233333321",
]


def paint_wailing_skull():
	t = Tex(64, 32)
	g = Tex(64, 32)
	lg = L(BONE, r=BONE[1], R=C("#5c5140"))
	S = W_SKULL
	S.face(t, "front").art([
		"3R34R4R3",
		"3R4R44R3",
		"33433432",
		"3KK33KK2",
		"2KK22KK2",
		"222KK221",
		"12222221",
		"14343431",
	], lg)
	S.face(t, "top").art([
		"22233322",
		"23333332",
		"233R3332",
		"33R43433",
		"334R4433",
		"34444R43",
		"3444R443",
		"34444443",
	], lg)
	S.face(t, "right").art([
		"23333334",
		"22333334",
		"2233R333",
		"222R3333",
		"12223344",
		"12K22232",
		"11222122",
		"11112222",
	], lg)
	S.face(t, "left").art([
		"43333332",
		"43333322",
		"33333222",
		"3333R222",
		"4432R221",
		"2322K221",
		"22122211",
		"22221111",
	], lg)
	S.face(t, "back").art([
		"22333322",
		"2333R322",
		"233R3322",
		"2223R222",
		"22222R21",
		"12222221",
		"11222211",
		"11122111",
	], lg)
	S.face(t, "bottom").art([
		"11111111",
		"111KK111",
		"111KK111",
		"11100111",
		"10000001",
		"10000001",
		"1k0000k1",
		"13434341",
	], lg)

	J = W_JAW
	J.face(t, "top").art([
		"100001",
		"1kkkk1",
		"1kkkk1",
		"3kkkk3",
		"4kkkk4",
		"343434",
	], lg)
	J.face(t, "front").art(["434343", "122221"], lg)
	J.face(t, "right").art(["112234", "111222"], lg)
	J.face(t, "left").art(["432211", "222111"], lg)
	J.face(t, "back").art(["111111", "011110"], lg)
	J.face(t, "bottom").art(["011110", "111111", "112211", "112211", "122221", "111111"], lg)

	# Soul flames (planes): darker unlit body in the base, full fire in the glow layer
	fl = {"0": SOUL_DEEP[1], "1": SOUL_DEEP[2], "2": SOUL_DEEP[3], "3": SOUL[0]}
	F = W_FLAME.face(t, "front")
	F.art(FLAME_ART, fl)
	W_FLAME.face(t, "back").mirror_of(F)

	for V in (W_V1, W_V2):
		V.strip(t).art(["34" "43" "32" "23", "12" "21" "11" "11"], lg)
		V.face(t, "top").art(["22", "33"], lg)
		V.face(t, "bottom").art(["11", "11"], lg)
	W_V3.strip(t).art(["3" "4" "3" "2", "1" "2" "1" "1"], lg)
	W_V3.face(t, "top").art(["3"], lg)
	W_V3.face(t, "bottom").art(["1"], lg)

	# Glow: blazing eyes, faint forehead runes, the fire planes
	f = S.face(g, "front")
	f.art([
		"........",
		"........",
		"........",
		".32..23.",
		".11..11.",
	], {"0": SOUL[0], "1": SOUL[1], "2": SOUL[2], "3": SOUL[3]})
	f.art(["_0__0_0_", "_0_0__0_"], {"0": SOUL[0]})
	G = W_FLAME.face(g, "front")
	G.art(FLAME_ART, {str(i): c for i, c in enumerate(SOUL)})
	W_FLAME.face(g, "back").mirror_of(G)
	return {"wailing_skull.png": t, "wailing_skull_glow.png": g}


def preview_wailing_skull(texs, outdir):
	base, glow = texs["wailing_skull.png"], texs["wailing_skull_glow.png"]
	sheets = [uv_sheet(base, WAILING_BOXES, 12, "wailing_skull"), uv_sheet(glow, WAILING_BOXES, 12, "glow")]
	renders = standard_renders([(wailing_skull_model(), base, glow)], scale=16,
		views=[(0, 0.1), (-0.7, 0.3), (-math.pi / 2, 0), (math.pi, 0.2), (math.pi - 0.7, 0.4)])
	return compose_preview("wailing_skull", sheets, renders, outdir)


# ----------------------------------------------------------------------------------------------
# Registry / main
# ----------------------------------------------------------------------------------------------
REGISTRY = [
	("risen", paint_risen, preview_risen),
	("bone_archer", paint_bone_archer, preview_bone_archer),
	("bone_shieldbearer", paint_bone_shieldbearer, preview_bone_shieldbearer),
	("crypt_ghoul", paint_crypt_ghoul, preview_crypt_ghoul),
	("wailing_skull", paint_wailing_skull, preview_wailing_skull),
]


def main(argv=None):
	ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
	ap.add_argument("--preview", metavar="DIR", help="also write UV contact sheets and model renders here")
	ap.add_argument("--only", nargs="*", help="only these texture sets")
	args = ap.parse_args(argv)
	for name, painter, previewer in REGISTRY:
		if args.only and name not in args.only:
			continue
		texs = painter()
		for rel, tex in texs.items():
			tex.save(rel)
			print("wrote", os.path.relpath(os.path.join(OUT, rel), ROOT))
		if args.preview:
			os.makedirs(args.preview, exist_ok=True)
			print("preview", previewer(texs, args.preview))


if __name__ == "__main__":
	main()
