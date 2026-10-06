"""Tiny "model compiler" for LaptopCraft toys & decor.

A model is a list of cuboid elements (Minecraft block-model coordinates, 0..16 = one block). Every visible face is
painted procedurally at 1 texel per model pixel (so all models share vanilla's texel density), the painted faces are
packed into one small per-model texture, and the block model JSON is written with matching UVs.

Painting convention: a face image is painted AS SEEN BY A VIEWER looking at that face from outside the element
(top row = top edge; for `up` the top row is the north edge, for `down` the top row is the south edge).
Models face NORTH (front = -Z); blockstates rotate them (east y=90, south y=180, west y=270).
"""
from __future__ import annotations

import hashlib
import json
import math
import os
from dataclasses import dataclass, field
from typing import Callable, Optional

from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
ASSETS = os.path.join(ROOT, "src", "main", "resources", "assets", "laptopcraft")
DATA = os.path.join(ROOT, "src", "main", "resources", "data", "laptopcraft")
NS = "laptopcraft"

DIRS = ("north", "south", "east", "west", "up", "down")

Color = tuple  # (r, g, b, a)


# ----------------------------------------------------------------------------------------------------------------
# colours
# ----------------------------------------------------------------------------------------------------------------

def c(hexstr: str, a: int = 255) -> Color:
	h = hexstr.lstrip("#")
	return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


def shade(col: Color, f: float) -> Color:
	"""f > 1 lightens (towards white), f < 1 darkens (multiplicative)."""
	r, g, b, a = col
	if f >= 1:
		t = f - 1
		return (round(r + (255 - r) * t), round(g + (255 - g) * t), round(b + (255 - b) * t), a)
	return (round(r * f), round(g * f), round(b * f), a)


def mix(a: Color, b: Color, t: float) -> Color:
	return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(4))


def alpha(col: Color, a: int) -> Color:
	return (col[0], col[1], col[2], a)


CLEAR = (0, 0, 0, 0)


# ----------------------------------------------------------------------------------------------------------------
# painters: callables (w, h) -> Image
# ----------------------------------------------------------------------------------------------------------------

Painter = Callable[[int, int], Image.Image]


def _img(w, h, col=CLEAR):
	return Image.new("RGBA", (w, h), col)


def flat(col: Color, light: bool = True, outline: Optional[Color] = None, hi: float = 1.10, lo: float = 0.88) -> Painter:
	"""Solid colour with soft top-left light: top/left edge a bit lighter, bottom/right edge a bit darker."""

	def p(w, h):
		im = _img(w, h, col)
		px = im.load()
		if light and w >= 3 and h >= 3:
			for x in range(w):
				px[x, 0] = shade(col, hi)
				px[x, h - 1] = shade(col, lo)
			for y in range(h):
				px[0, y] = shade(col, hi) if y < h - 1 else px[0, y]
				px[w - 1, y] = shade(col, lo) if y > 0 else px[w - 1, y]
		if outline is not None and w >= 2 and h >= 2:
			for x in range(w):
				px[x, 0] = outline
				px[x, h - 1] = outline
			for y in range(h):
				px[0, y] = outline
				px[w - 1, y] = outline
		return im

	return p


def plain(col: Color) -> Painter:
	return lambda w, h: _img(w, h, col)


def fabric(col: Color, weave: float = 0.95, light: bool = True, seam: Optional[Color] = None) -> Painter:
	"""Plush fabric: soft top-left light plus a regular, very subtle diagonal weave (no random noise)."""
	base = flat(col, light=light, hi=1.08, lo=0.9)

	def p(w, h):
		im = base(w, h)
		px = im.load()
		for y in range(h):
			for x in range(w):
				if (x + 2 * y) % 4 == 0 and 0 < x < w - 1 and 0 < y < h - 1:
					px[x, y] = shade(px[x, y], weave)
		if seam is not None and w >= 3 and h >= 3:
			for x in range(1, w - 1, 2):
				px[x, h - 1] = seam
		return im

	return p


def gradient_v(top: Color, bottom: Color) -> Painter:
	def p(w, h):
		im = _img(w, h)
		px = im.load()
		for y in range(h):
			t = 0 if h == 1 else y / (h - 1)
			col = mix(top, bottom, t)
			for x in range(w):
				px[x, y] = col
		return im

	return p


def pattern(rows: list[str], pal: dict, base: Optional[Painter] = None, anchor: str = "center") -> Painter:
	"""Pixel pattern drawn over `base`. ' ' keeps the base pixel, '.' is transparent. Pattern is anchored in the face."""

	def p(w, h):
		im = base(w, h) if base else _img(w, h)
		px = im.load()
		ph, pw = len(rows), max(len(r) for r in rows)
		if anchor == "center":
			ox, oy = (w - pw) // 2, (h - ph) // 2
		elif anchor == "top":
			ox, oy = (w - pw) // 2, 0
		elif anchor == "bottom":
			ox, oy = (w - pw) // 2, h - ph
		else:
			ox, oy = 0, 0
		for y, row in enumerate(rows):
			for x, ch in enumerate(row):
				X, Y = ox + x, oy + y
				if not (0 <= X < w and 0 <= Y < h):
					continue
				if ch == " ":
					continue
				if ch == ".":
					px[X, Y] = CLEAR
				else:
					px[X, Y] = pal[ch]
		return im

	return p


def over(*painters: Painter) -> Painter:
	"""Composite painters bottom to top."""

	def p(w, h):
		im = _img(w, h)
		for pp in painters:
			layer = pp(w, h)
			im.alpha_composite(layer)
		return im

	return p


def edge(col: Color, sides: str = "tblr") -> Painter:
	"""Only draws an outline on the given sides (t/b/l/r) — use with over()."""

	def p(w, h):
		im = _img(w, h)
		px = im.load()
		for x in range(w):
			if "t" in sides:
				px[x, 0] = col
			if "b" in sides:
				px[x, h - 1] = col
		for y in range(h):
			if "l" in sides:
				px[0, y] = col
			if "r" in sides:
				px[w - 1, y] = col
		return im

	return p


def func(fn: Callable[[int, int, int, int], Optional[Color]], base: Optional[Painter] = None) -> Painter:
	"""Per-pixel painter: fn(x, y, w, h) returns a colour or None (keep base)."""

	def p(w, h):
		im = base(w, h) if base else _img(w, h)
		px = im.load()
		for y in range(h):
			for x in range(w):
				col = fn(x, y, w, h)
				if col is not None:
					px[x, y] = col
		return im

	return p


# ----------------------------------------------------------------------------------------------------------------
# model building
# ----------------------------------------------------------------------------------------------------------------

@dataclass
class Face:
	paint: Optional[Painter] = None  # painted into the model atlas
	tex: Optional[str] = None  # or: external texture variable name ("screen") ...
	uv: Optional[list] = None  # ... with explicit uv
	cull: Optional[str] = None
	rotation: int = 0


@dataclass
class Elem:
	frm: tuple
	to: tuple
	faces: dict
	rot: Optional[dict] = None
	emission: int = 0
	shade: bool = True
	name: Optional[str] = None


def face_size(frm, to, d):
	dx, dy, dz = (to[0] - frm[0], to[1] - frm[1], to[2] - frm[2])
	if d in ("north", "south"):
		w, h = dx, dy
	elif d in ("east", "west"):
		w, h = dz, dy
	else:
		w, h = dx, dz
	return w, h


def texels(v: float) -> int:
	return max(1, int(math.ceil(v - 1e-6)))


class Model:
	def __init__(self, name: str, texture: str, particle: Optional[str] = None, ao: bool = True):
		"""name: model id path (e.g. 'block/rubber_duck'); texture: atlas texture id path (e.g. 'block/toys/rubber_duck')."""
		self.name = name
		self.texture = texture
		self.particle = particle
		self.ao = ao
		self.elems: list[Elem] = []
		self.extra_textures: dict[str, str] = {}
		self.display: Optional[dict] = None
		self.display_scale = 1.0

	def box(self, frm, to, paint: Optional[Painter] = None, faces: Optional[dict] = None, skip: str | tuple = (),
			rot: Optional[dict] = None, emission: int = 0, shade: bool = True, cull_floor: bool = True, name=None) -> Elem:
		"""Adds a cuboid. `paint` is used for every face unless overridden in `faces` (dir -> Painter|Face|None)."""
		if isinstance(skip, str):
			skip = tuple(s for s in skip.split() if s)
		fs = {}
		for d in DIRS:
			if d in skip:
				continue
			w, h = face_size(frm, to, d)
			if w <= 0 or h <= 0:
				continue
			spec = (faces or {}).get(d, paint)
			if spec is None:
				continue
			if not isinstance(spec, Face):
				spec = Face(paint=spec)
			if cull_floor and d == "down" and frm[1] == 0 and spec.cull is None:
				spec.cull = "down"
			fs[d] = spec
		e = Elem(tuple(frm), tuple(to), fs, rot, emission, shade, name)
		self.elems.append(e)
		return e

	def tex(self, var: str, path: str):
		self.extra_textures[var] = path

	def translated(self, dx=0.0, dy=0.0, dz=0.0) -> "Model":
		"""Returns a copy with all elements moved (rotation origins too)."""
		m = Model(self.name, self.texture, self.particle, self.ao)
		m.extra_textures = dict(self.extra_textures)
		m.display_scale = self.display_scale
		for e in self.elems:
			rot = None
			if e.rot:
				rot = dict(e.rot)
				o = rot["origin"]
				rot["origin"] = [o[0] + dx, o[1] + dy, o[2] + dz]
			faces = {}
			for d, f in e.faces.items():
				nf = Face(f.paint, f.tex, f.uv, f.cull, f.rotation)
				if nf.cull == "down" and dy != 0:
					nf.cull = None
				faces[d] = nf
			m.elems.append(Elem((e.frm[0] + dx, e.frm[1] + dy, e.frm[2] + dz), (e.to[0] + dx, e.to[1] + dy, e.to[2] + dz),
				faces, rot, e.emission, e.shade, e.name))
		return m

	# --------------------------------------------------------------------------------------------------------
	def bounds(self):
		lo = [99, 99, 99]
		hi = [-99, -99, -99]
		for e in self.elems:
			for i in range(3):
				lo[i] = min(lo[i], e.frm[i])
				hi[i] = max(hi[i], e.to[i])
		return lo, hi

	def _paint_faces(self):
		"""Paints every atlas face; returns list of (elem, dir, image_key) and unique images."""
		images = {}
		refs = []
		for e in self.elems:
			for d, f in e.faces.items():
				if f.paint is None:
					continue
				w, h = face_size(e.frm, e.to, d)
				tw, th = texels(w), texels(h)
				im = f.paint(tw, th)
				if im.size != (tw, th):
					raise ValueError(f"{self.name}: painter returned {im.size} for face {d} {tw}x{th}")
				key = hashlib.sha1(im.tobytes() + bytes([tw, th])).hexdigest()
				images[key] = im
				refs.append((e, d, key))
		return refs, images

	@staticmethod
	def _pack(images: dict):
		items = sorted(images.items(), key=lambda kv: (-kv[1].size[1], -kv[1].size[0]))
		for size in (16, 32, 64, 128, 256):
			pos = {}
			x = y = row_h = 0
			ok = True
			for key, im in items:
				w, h = im.size
				if w > size:
					ok = False
					break
				if x + w > size:
					x = 0
					y += row_h
					row_h = 0
				if y + h > size:
					ok = False
					break
				pos[key] = (x, y)
				x += w
				row_h = max(row_h, h)
			if ok:
				return size, pos
		raise ValueError("atlas too large")

	def build(self, packing: Optional[tuple] = None):
		"""Returns (model_json, atlas_image). `packing` = (size, positions, images) shares an atlas between models."""
		refs, images = self._paint_faces()
		if packing is not None:
			size, pos, images = packing
		else:
			size, pos = self._pack(images) if images else (16, {})
		atlas = _img(size, size)
		for key, im in images.items():
			atlas.alpha_composite(im, pos[key])
		scale = 16.0 / size
		elements = []
		for e in self.elems:
			ej = {"from": [round(v, 4) for v in e.frm], "to": [round(v, 4) for v in e.to]}
			if e.rot:
				ej["rotation"] = e.rot
			if not e.shade:
				ej["shade"] = False
			if e.emission:
				ej["light_emission"] = e.emission
			faces = {}
			for d, f in e.faces.items():
				fj = {}
				if f.paint is not None:
					key = next(k for (ee, dd, k) in refs if ee is e and dd == d)
					x, y = pos[key]
					w, h = images[key].size
					fj["uv"] = [round(x * scale, 4), round(y * scale, 4), round((x + w) * scale, 4), round((y + h) * scale, 4)]
					fj["texture"] = "#all"
				else:
					fj["uv"] = f.uv
					fj["texture"] = "#" + f.tex
				if f.rotation:
					fj["rotation"] = f.rotation
				if f.cull:
					fj["cullface"] = f.cull
				faces[d] = fj
			ej["faces"] = faces
			if e.name:
				ej["name"] = e.name
			elements.append(ej)
		textures = {"all": f"{NS}:{self.texture}", "particle": f"{NS}:{self.particle or self.texture}"}
		for k, v in self.extra_textures.items():
			textures[k] = f"{NS}:{v}"
		model = {"parent": "minecraft:block/block", "textures": textures, "elements": elements}
		if not self.ao:
			model["ambientocclusion"] = False
		model["display"] = self.display or display_for(self)
		return model, atlas


# ----------------------------------------------------------------------------------------------------------------
# display transforms (item rendering) derived from the model bounds
# ----------------------------------------------------------------------------------------------------------------

def _rot_xyz(ax, ay, az):
	ax, ay, az = (math.radians(v) for v in (ax, ay, az))
	cx, sx, cy, sy, cz, sz = math.cos(ax), math.sin(ax), math.cos(ay), math.sin(ay), math.cos(az), math.sin(az)
	rx = [[1, 0, 0], [0, cx, -sx], [0, sx, cx]]
	ry = [[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]]
	rz = [[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]]

	def mul(a, b):
		return [[sum(a[i][k] * b[k][j] for k in range(3)) for j in range(3)] for i in range(3)]

	return mul(mul(rx, ry), rz)


def _apply(m, v):
	return [sum(m[i][k] * v[k] for k in range(3)) for i in range(3)]


def _centered(rot, scale, center):
	"""translation that keeps the model's bounding-box centre at the origin of the display transform."""
	r = _rot_xyz(*rot)
	v = _apply(r, [(center[i] - 8) * scale for i in range(3)])
	return [round(-v[0], 3), round(-v[1], 3), round(-v[2], 3)]


def display_for(model: Model) -> dict:
	lo, hi = model.bounds()
	ext = max(hi[i] - lo[i] for i in range(3))
	center = [(lo[i] + hi[i]) / 2 for i in range(3)]
	k = max(1.0, min(1.75, 14.0 / max(ext, 6))) * model.display_scale
	gui_rot = [30, 225, 0]
	gui_s = round(0.625 * k, 4)
	fixed_s = round(0.5 * k, 4)
	return {
		"gui": {"rotation": gui_rot, "translation": _centered(gui_rot, gui_s, center), "scale": [gui_s] * 3},
		"ground": {"rotation": [0, 0, 0], "translation": [0, 3, 0], "scale": [round(0.25 * k, 4)] * 3},
		"fixed": {"rotation": [0, 0, 0], "translation": _centered([0, 0, 0], fixed_s, center), "scale": [fixed_s] * 3},
		"thirdperson_righthand": {"rotation": [75, 45, 0], "translation": [0, 2.5, 0], "scale": [round(0.375 * k, 4)] * 3},
		"firstperson_righthand": {"rotation": [0, 45, 0], "translation": [0, 0, 0], "scale": [round(0.4 * k, 4)] * 3},
		"firstperson_lefthand": {"rotation": [0, 225, 0], "translation": [0, 0, 0], "scale": [round(0.4 * k, 4)] * 3},
	}


# ----------------------------------------------------------------------------------------------------------------
# writers
# ----------------------------------------------------------------------------------------------------------------

def _write_json(path, obj):
	os.makedirs(os.path.dirname(path), exist_ok=True)
	with open(path, "w", encoding="utf-8") as f:
		json.dump(obj, f, indent=2)
		f.write("\n")


def write_png(rel: str, im: Image.Image):
	"""rel: texture id path, e.g. 'block/toys/duck' -> assets/laptopcraft/textures/block/toys/duck.png"""
	path = os.path.join(ASSETS, "textures", rel + ".png")
	os.makedirs(os.path.dirname(path), exist_ok=True)
	im.save(path)


def write_animated(rel: str, frames: list, frametime: int = 2, interpolate: bool = False, frame_order: Optional[list] = None):
	w, h = frames[0].size
	strip = _img(w, h * len(frames))
	for i, f in enumerate(frames):
		strip.alpha_composite(f, (0, i * h))
	write_png(rel, strip)
	anim = {"frametime": frametime}
	if interpolate:
		anim["interpolate"] = True
	if frame_order:
		anim["frames"] = frame_order
	path = os.path.join(ASSETS, "textures", rel + ".png.mcmeta")
	_write_json(path, {"animation": anim})


def write_model(model: Model, atlas_override: Optional[Image.Image] = None) -> Image.Image:
	mj, atlas = model.build()
	_write_json(os.path.join(ASSETS, "models", model.name + ".json"), mj)
	if atlas_override is None:
		write_png(model.texture, atlas)
	return atlas


def write_models_shared(models: list, texture: str):
	"""Several models (e.g. on/off states) sharing ONE atlas texture."""
	# paint all faces of all models into one atlas
	all_images = {}
	for m in models:
		m.texture = texture
		_, images = m._paint_faces()
		all_images.update(images)
	size, pos = Model._pack(all_images)
	atlas = _img(size, size)
	for key, im in all_images.items():
		atlas.alpha_composite(im, pos[key])
	for m in models:
		mj, _ = m.build(packing=(size, pos, all_images))
		_write_json(os.path.join(ASSETS, "models", m.name + ".json"), mj)
	write_png(texture, atlas)
	return atlas


def write_blockstate(block: str, variants: dict):
	_write_json(os.path.join(ASSETS, "blockstates", block + ".json"), {"variants": variants})


def facing_variants(model_for: Callable[[dict], str], props: Optional[dict] = None) -> dict:
	"""Variants for facing=north/east/south/west (+ other props: name -> list of values)."""
	rots = {"north": 0, "east": 90, "south": 180, "west": 270}
	combos = [{}]
	for pname, values in (props or {}).items():
		combos = [dict(cb, **{pname: v}) for cb in combos for v in values]
	out = {}
	for cb in combos:
		for f, y in rots.items():
			state = dict(cb, facing=f)
			key = ",".join(f"{k}={state[k]}" for k in sorted(state))
			v = {"model": f"{NS}:{model_for(cb)}"}
			if y:
				v["y"] = y
			out[key] = v
	return out


def write_item_def(item: str, model: str):
	_write_json(os.path.join(ASSETS, "items", item + ".json"), {"model": {"type": "minecraft:model", "model": f"{NS}:{model}"}})


def write_flat_item(item: str, texture: str):
	"""items/<id>.json + models/item/<id>.json (item/generated) for a 16x16 icon at textures/<texture>.png."""
	_write_json(os.path.join(ASSETS, "models", "item", item + ".json"),
		{"parent": "minecraft:item/generated", "textures": {"layer0": f"{NS}:{texture}"}})
	write_item_def(item, f"item/{item}")


def write_loot_self(block: str, lower_half_only: bool = False):
	entry = {"type": "minecraft:item", "name": f"{NS}:{block}"}
	if lower_half_only:
		entry["conditions"] = [{"block": f"{NS}:{block}", "condition": "minecraft:block_state_property", "properties": {"half": "lower"}}]
	table = {
		"type": "minecraft:block",
		"pools": [{
			"bonus_rolls": 0.0,
			"conditions": [{"condition": "minecraft:survives_explosion"}],
			"entries": [entry],
			"rolls": 1.0,
		}],
		"random_sequence": f"{NS}:blocks/{block}",
	}
	_write_json(os.path.join(DATA, "loot_table", "blocks", block + ".json"), table)


# ----------------------------------------------------------------------------------------------------------------
# 16x16 item icon helpers
# ----------------------------------------------------------------------------------------------------------------

def icon_from_rows(rows: list[str], pal: dict, size: int = 16) -> Image.Image:
	im = _img(size, size)
	px = im.load()
	for y, row in enumerate(rows):
		for x, ch in enumerate(row):
			if ch in (" ", "."):
				continue
			px[x, y] = pal[ch]
	return im


def outline_icon(im: Image.Image, col: Color) -> Image.Image:
	"""Adds a 1px outline (4-neighbourhood) around opaque pixels."""
	w, h = im.size
	src = im.load()
	out = im.copy()
	px = out.load()
	for y in range(h):
		for x in range(w):
			if src[x, y][3] != 0:
				continue
			for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
				X, Y = x + dx, y + dy
				if 0 <= X < w and 0 <= Y < h and src[X, Y][3] != 0:
					px[x, y] = col
					break
	return out


# 3x5 pixel font (for signs / screens)
FONT3x5 = {
	"A": ["010", "101", "111", "101", "101"], "B": ["110", "101", "110", "101", "110"], "C": ["011", "100", "100", "100", "011"],
	"D": ["110", "101", "101", "101", "110"], "E": ["111", "100", "110", "100", "111"], "F": ["111", "100", "110", "100", "100"],
	"G": ["011", "100", "101", "101", "011"], "H": ["101", "101", "111", "101", "101"], "I": ["111", "010", "010", "010", "111"],
	"K": ["101", "101", "110", "101", "101"], "L": ["100", "100", "100", "100", "111"], "M": ["101", "111", "111", "101", "101"],
	"N": ["101", "111", "111", "111", "101"], "O": ["010", "101", "101", "101", "010"], "P": ["110", "101", "110", "100", "100"],
	"R": ["110", "101", "110", "101", "101"], "S": ["011", "100", "010", "001", "110"], "T": ["111", "010", "010", "010", "010"],
	"U": ["101", "101", "101", "101", "111"], "V": ["101", "101", "101", "101", "010"], "W": ["101", "101", "111", "111", "101"],
	"Y": ["101", "101", "010", "010", "010"], "!": ["010", "010", "010", "000", "010"], " ": ["000"] * 5,
	"0": ["111", "101", "101", "101", "111"], "1": ["010", "110", "010", "010", "111"], "2": ["110", "001", "010", "100", "111"],
	"3": ["110", "001", "010", "001", "110"], "8": ["111", "101", "111", "101", "111"], "9": ["111", "101", "111", "001", "110"],
}


def draw_text(im: Image.Image, text: str, x: int, y: int, col: Color, spacing: int = 1):
	px = im.load()
	w, h = im.size
	cx = x
	for ch in text:
		g = FONT3x5[ch]
		for gy, row in enumerate(g):
			for gx, bit in enumerate(row):
				if bit == "1" and 0 <= cx + gx < w and 0 <= y + gy < h:
					px[cx + gx, y + gy] = col
		cx += len(g[0]) + spacing
	return cx - x - spacing


def text_width(text: str, spacing: int = 1) -> int:
	return sum(len(FONT3x5[ch][0]) for ch in text) + spacing * (len(text) - 1)
