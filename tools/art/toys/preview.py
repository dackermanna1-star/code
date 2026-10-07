"""Orthographic software preview of generated block models (dev aid, not used by the game).

Usage: python3 tools/art/toys/preview.py out.png block/rubber_duck block/pig_plush ...
Renders each model from the front-left (like the inventory icon) and from the back-right.
"""
from __future__ import annotations

import json
import math
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from lib import ASSETS  # noqa: E402

SHADE = {"up": 1.0, "down": 0.5, "north": 0.8, "south": 0.8, "east": 0.6, "west": 0.6}


def load_tex(ref, cache={}):
	ns, path = ref.split(":")
	if ref not in cache:
		im = Image.open(os.path.join(ASSETS, "textures", path + ".png")).convert("RGBA")
		w, h = im.size
		if h > w:  # animated strip: first frame
			im = im.crop((0, 0, w, w))
		cache[ref] = np.asarray(im).astype(np.float32) / 255.0
	return cache[ref]


def resolve(model, var):
	t = model["textures"]
	v = t[var.lstrip("#")]
	while v.startswith("#"):
		v = t[v[1:]]
	return v


def corners(frm, to, d):
	x0, y0, z0 = frm
	x1, y1, z1 = to
	# returns top-left, top-right, bottom-left (as seen from outside) in model coords
	return {
		"north": ((x1, y1, z0), (x0, y1, z0), (x1, y0, z0)),
		"south": ((x0, y1, z1), (x1, y1, z1), (x0, y0, z1)),
		"west": ((x0, y1, z0), (x0, y1, z1), (x0, y0, z0)),
		"east": ((x1, y1, z1), (x1, y1, z0), (x1, y0, z1)),
		"up": ((x0, y1, z0), (x1, y1, z0), (x0, y1, z1)),
		"down": ((x0, y0, z1), (x1, y0, z1), (x0, y0, z0)),
	}[d]


def rot_matrix(rot):
	if "axis" in rot:
		a = math.radians(rot["angle"])
		ca, sa = math.cos(a), math.sin(a)
		ax = rot["axis"]
		if ax == "x":
			return np.array([[1, 0, 0], [0, ca, -sa], [0, sa, ca]])
		if ax == "y":
			return np.array([[ca, 0, sa], [0, 1, 0], [-sa, 0, ca]])
		return np.array([[ca, -sa, 0], [sa, ca, 0], [0, 0, 1]])
	rx, ry, rz = (math.radians(rot.get(k, 0)) for k in "xyz")
	X = np.array([[1, 0, 0], [0, math.cos(rx), -math.sin(rx)], [0, math.sin(rx), math.cos(rx)]])
	Y = np.array([[math.cos(ry), 0, math.sin(ry)], [0, 1, 0], [-math.sin(ry), 0, math.cos(ry)]])
	Z = np.array([[math.cos(rz), -math.sin(rz), 0], [math.sin(rz), math.cos(rz), 0], [0, 0, 1]])
	return Z @ Y @ X


def render(model_path, yaw=225, pitch=30, scale=14, size=360, night=False, offset=(0.0, 0.0), bg=None):
	model = json.load(open(os.path.join(ASSETS, "models", model_path + ".json")))
	img = np.zeros((size, size, 4), np.float32)
	img[..., :3] = bg if bg is not None else (0.12 if night else 0.75)
	img[..., 3] = 1
	zbuf = np.full((size, size), -1e9, np.float32)
	ya, pa = math.radians(yaw), math.radians(pitch)
	Ry = np.array([[math.cos(ya), 0, math.sin(ya)], [0, 1, 0], [-math.sin(ya), 0, math.cos(ya)]])
	Rx = np.array([[1, 0, 0], [0, math.cos(pa), -math.sin(pa)], [0, math.sin(pa), math.cos(pa)]])
	cam = Rx @ Ry
	ys, xs = np.mgrid[0:size, 0:size]
	for el in model["elements"]:
		R = rot_matrix(el["rotation"]) if "rotation" in el else None
		origin = np.array(el["rotation"]["origin"]) if R is not None else None
		emissive = el.get("light_emission", 0) > 0
		for d, f in el["faces"].items():
			tl, tr, bl = (np.array(p, float) for p in corners(el["from"], el["to"], d))
			pts = [tl, tr, bl]
			if R is not None:
				pts = [R @ (p - origin) + origin for p in pts]
			pts = [cam @ (p - 8) for p in pts]
			p0, p1, p2 = pts
			e1, e2 = p1 - p0, p2 - p0
			normal = np.cross(e1, e2)
			if normal[2] >= -1e-9:  # back-facing (camera looks down -z)
				continue
			# screen coords
			def scr(p):
				return np.array([size / 2 + offset[0] + p[0] * scale, size / 2 - offset[1] - p[1] * scale])
			s0, s1, s2 = scr(p0), scr(p1), scr(p2)
			M = np.array([[s1[0] - s0[0], s2[0] - s0[0]], [s1[1] - s0[1], s2[1] - s0[1]]])
			if abs(np.linalg.det(M)) < 1e-6:
				continue
			Minv = np.linalg.inv(M)
			dx = xs + 0.5 - s0[0]
			dy = ys + 0.5 - s0[1]
			a = Minv[0, 0] * dx + Minv[0, 1] * dy
			b = Minv[1, 0] * dx + Minv[1, 1] * dy
			mask = (a >= 0) & (a < 1) & (b >= 0) & (b < 1)
			if not mask.any():
				continue
			depth = p0[2] + a * e1[2] + b * e2[2]
			tex = load_tex(resolve(model, f["texture"]))
			th, tw = tex.shape[:2]
			u0, v0, u1, v1 = f.get("uv", [0, 0, 16, 16])
			u = (u0 + (u1 - u0) * a) / 16 * tw
			v = (v0 + (v1 - v0) * b) / 16 * th
			ui = np.clip(u.astype(int), 0, tw - 1)
			vi = np.clip(v.astype(int), 0, th - 1)
			col = tex[vi, ui]
			m = mask & (col[..., 3] > 0.1) & (depth > zbuf)
			sh = 1.0 if (emissive or not el.get("shade", True)) else SHADE[d]
			if night and not emissive:
				sh *= 0.35
			alpha = col[..., 3:4]
			blended = img[..., :3] * (1 - alpha) + col[..., :3] * sh * alpha
			img[..., :3] = np.where(m[..., None], blended, img[..., :3])
			opaque = m & (col[..., 3] > 0.9)
			zbuf = np.where(opaque, depth, zbuf)
	return Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8))


def sheet(paths, out, night=False):
	tiles = []
	for p in paths:
		a = render(p, 225, 30, night=night)
		b = render(p, 45, 25, night=night)
		t = Image.new("RGBA", (a.width * 2, a.height))
		t.paste(a, (0, 0))
		t.paste(b, (a.width, 0))
		tiles.append(t)
	cols = 2
	rows = (len(tiles) + cols - 1) // cols
	W, H = tiles[0].size
	S = Image.new("RGBA", (W * cols, H * rows), (40, 40, 40, 255))
	for i, t in enumerate(tiles):
		S.paste(t, ((i % cols) * W, (i // cols) * H))
	S.save(out)


def gui_sheet(paths, out, zoom=6):
	"""Renders inventory icons exactly like the GUI display transform (16px slot, x zoom)."""
	slot = 16 * zoom
	pad = 4
	S = Image.new("RGBA", ((slot + pad) * len(paths) + pad, slot + 2 * pad), (139, 139, 139, 255))
	for i, p in enumerate(paths):
		model = json.load(open(os.path.join(ASSETS, "models", p + ".json")))
		gui = model["display"]["gui"]
		rx, ry, _ = gui["rotation"]
		s = gui["scale"][0]
		tx, ty, _ = gui["translation"]
		im = render(p, ry, rx, scale=s * zoom, size=slot, offset=(tx * zoom, ty * zoom), bg=0.545)
		S.paste(im, (pad + i * (slot + pad), pad))
	S.save(out)


if __name__ == "__main__":
	if sys.argv[1] == "--gui":
		gui_sheet(sys.argv[3:], sys.argv[2])
		sys.exit(0)
	night = "--night" in sys.argv
	args = [a for a in sys.argv[1:] if a != "--night"]
	sheet(args[1:], args[0], night)
