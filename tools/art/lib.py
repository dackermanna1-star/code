"""Shared helpers for the LaptopCraft art generators.

Everything is drawn with numpy into float RGBA canvases (premultiplied alpha) using signed distance
functions (SDFs) for shapes, so that edges can be rendered hard (pixel art), softly anti-aliased or
supersampled.  Coordinates are in pixels; pixel (i, j) covers [i, i+1) x [j, j+1).

Only Pillow + numpy are required.  Run the generators from the repository root, e.g.
``python3 tools/art/build_all.py``.
"""
from __future__ import annotations

import json
import math
import os
from typing import Callable, Iterable, Sequence

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
ASSETS = os.path.join(ROOT, "src", "main", "resources", "assets", "laptopcraft")
PREVIEW = os.path.join(ROOT, "build", "art-preview")

SDF = Callable[[np.ndarray, np.ndarray], np.ndarray]


# ----------------------------------------------------------------------------------------------
# colours
# ----------------------------------------------------------------------------------------------

def rgba(c, a: float | None = None) -> np.ndarray:
	"""Parse '#rrggbb', '#rrggbbaa', (r,g,b[,a]) 0-255 tuples or floats into a float RGBA array 0..1."""
	if isinstance(c, np.ndarray):
		out = c.astype(np.float64).copy()
		if out.shape[-1] == 3:
			out = np.concatenate([out, [1.0]])
	elif isinstance(c, str):
		s = c.lstrip("#")
		vals = [int(s[i:i + 2], 16) / 255.0 for i in range(0, len(s), 2)]
		if len(vals) == 3:
			vals.append(1.0)
		out = np.array(vals, dtype=np.float64)
	else:
		vals = list(c)
		if any(v > 1.0 for v in vals):
			vals = [v / 255.0 for v in vals]
		if len(vals) == 3:
			vals.append(1.0)
		out = np.array(vals, dtype=np.float64)
	if a is not None:
		out[3] = a
	return out


def mix(a, b, t: float) -> np.ndarray:
	a, b = rgba(a), rgba(b)
	return a + (b - a) * t


def lighten(c, t: float) -> np.ndarray:
	return mix(c, "#ffffff", t) * np.array([1, 1, 1, 0]) + np.array([0, 0, 0, rgba(c)[3]])


def darken(c, t: float) -> np.ndarray:
	return mix(c, "#000000", t) * np.array([1, 1, 1, 0]) + np.array([0, 0, 0, rgba(c)[3]])


def hsv(h: float, s: float, v: float, a: float = 1.0) -> np.ndarray:
	import colorsys
	r, g, b = colorsys.hsv_to_rgb(h % 1.0, max(0, min(1, s)), max(0, min(1, v)))
	return np.array([r, g, b, a])


# ----------------------------------------------------------------------------------------------
# SDF shapes (all distances in pixels; negative = inside)
# ----------------------------------------------------------------------------------------------

def circle(cx, cy, r) -> SDF:
	return lambda X, Y: np.hypot(X - cx, Y - cy) - r


def ellipse(cx, cy, rx, ry) -> SDF:
	def f(X, Y):
		k = np.hypot((X - cx) / rx, (Y - cy) / ry)
		return (k - 1.0) * min(rx, ry)
	return f


def rect(x0, y0, x1, y1) -> SDF:
	return rrect(x0, y0, x1, y1, 0)


def rrect(x0, y0, x1, y1, r) -> SDF:
	"""Rounded rectangle covering [x0,x1] x [y0,y1] (pixel edges) with corner radius r."""
	cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
	hx, hy = (x1 - x0) / 2, (y1 - y0) / 2

	def f(X, Y):
		qx = np.abs(X - cx) - hx + r
		qy = np.abs(Y - cy) - hy + r
		return np.hypot(np.maximum(qx, 0), np.maximum(qy, 0)) + np.minimum(np.maximum(qx, qy), 0) - r
	return f


def segment(x0, y0, x1, y1, r) -> SDF:
	"""Capsule (thick line with round caps) of radius r."""
	def f(X, Y):
		px, py = X - x0, Y - y0
		bx, by = x1 - x0, y1 - y0
		h = np.clip((px * bx + py * by) / max(bx * bx + by * by, 1e-9), 0, 1)
		return np.hypot(px - bx * h, py - by * h) - r
	return f


def polygon(pts: Sequence[tuple[float, float]]) -> SDF:
	"""Exact SDF of a simple polygon (Inigo Quilez)."""
	P = np.array(pts, dtype=np.float64)

	def f(X, Y):
		d = (X - P[0, 0]) ** 2 + (Y - P[0, 1]) ** 2
		s = np.ones_like(X)
		n = len(P)
		j = n - 1
		for i in range(n):
			ex, ey = P[j, 0] - P[i, 0], P[j, 1] - P[i, 1]
			wx, wy = X - P[i, 0], Y - P[i, 1]
			h = np.clip((wx * ex + wy * ey) / (ex * ex + ey * ey), 0, 1)
			bx, by = wx - ex * h, wy - ey * h
			d = np.minimum(d, bx * bx + by * by)
			c1 = Y >= P[i, 1]
			c2 = Y < P[j, 1]
			c3 = ex * wy > ey * wx
			flip = (c1 & c2 & c3) | (~c1 & ~c2 & ~c3)
			s = np.where(flip, -s, s)
			j = i
		return s * np.sqrt(d)
	return f


def ring(cx, cy, r, thickness) -> SDF:
	c = circle(cx, cy, r)
	return lambda X, Y: np.abs(c(X, Y)) - thickness / 2


def arc(cx, cy, r, thickness, a0, a1) -> SDF:
	"""Ring segment from angle a0 to a1 (degrees, 0 = +x, counter-clockwise on screen = negative y)."""
	rg = ring(cx, cy, r, thickness)

	def f(X, Y):
		ang = np.degrees(np.arctan2(-(Y - cy), X - cx)) % 360
		lo, hi = a0 % 360, a1 % 360
		inside = (ang >= lo) & (ang <= hi) if lo <= hi else (ang >= lo) | (ang <= hi)
		return np.where(inside, rg(X, Y), np.maximum(rg(X, Y), 1.0))
	return f


def union(*fs: SDF) -> SDF:
	return lambda X, Y: np.minimum.reduce([f(X, Y) for f in fs])


def intersect(*fs: SDF) -> SDF:
	return lambda X, Y: np.maximum.reduce([f(X, Y) for f in fs])


def subtract(a: SDF, *bs: SDF) -> SDF:
	return lambda X, Y: np.maximum.reduce([a(X, Y)] + [-b(X, Y) for b in bs])


def offset(f: SDF, d: float) -> SDF:
	return lambda X, Y: f(X, Y) - d


def translate(f: SDF, dx: float, dy: float) -> SDF:
	return lambda X, Y: f(X - dx, Y - dy)


def rotate(f: SDF, deg: float, cx: float, cy: float) -> SDF:
	a = math.radians(deg)
	ca, sa = math.cos(a), math.sin(a)

	def g(X, Y):
		x, y = X - cx, Y - cy
		return f(cx + x * ca + y * sa, cy - x * sa + y * ca)
	return g


def mask_shape(m: np.ndarray) -> SDF:
	"""Turn a boolean pixel mask (h, w) into a pseudo-SDF usable with hard rendering."""
	h, w = m.shape

	def f(X, Y):
		xi = np.clip(np.floor(X).astype(int), 0, w - 1)
		yi = np.clip(np.floor(Y).astype(int), 0, h - 1)
		inb = (X >= 0) & (Y >= 0) & (X < w) & (Y < h)
		return np.where(inb & m[yi, xi], -0.5, 0.5)
	return f


# ----------------------------------------------------------------------------------------------
# canvas
# ----------------------------------------------------------------------------------------------

class Canvas:
	"""Float RGBA canvas with premultiplied alpha."""

	def __init__(self, w: int, h: int, bg=None):
		self.w, self.h = w, h
		self.px = np.zeros((h, w, 4), dtype=np.float64)
		ys, xs = np.mgrid[0:h, 0:w]
		self.X = xs + 0.5
		self.Y = ys + 0.5
		if bg is not None:
			c = rgba(bg)
			self.px[:] = np.concatenate([c[:3] * c[3], [c[3]]])

	# -- coverage ---------------------------------------------------------------------------
	def coverage(self, f: SDF, aa: str = "ss", ss: int = 4, sharp: float = 1.0) -> np.ndarray:
		"""Coverage 0..1 of shape f. aa: 'hard' (pixel centre test), 'soft' (analytic) or 'ss'."""
		if aa == "hard":
			return (f(self.X, self.Y) <= 0).astype(np.float64)
		if aa == "soft":
			return np.clip(0.5 - f(self.X, self.Y) * sharp, 0, 1)
		acc = np.zeros((self.h, self.w))
		for i in range(ss):
			for j in range(ss):
				ox = (i + 0.5) / ss - 0.5
				oy = (j + 0.5) / ss - 0.5
				acc += (f(self.X + ox, self.Y + oy) <= 0)
		cov = acc / (ss * ss)
		if sharp != 1.0:
			cov = np.clip((cov - 0.5) * sharp + 0.5, 0, 1)
		return cov

	# -- painting ---------------------------------------------------------------------------
	def paint(self, cov: np.ndarray, color, opacity: float = 1.0):
		"""Composite colour (RGBA, or an (h,w,4) straight-alpha array) over the canvas with coverage."""
		if isinstance(color, np.ndarray) and color.ndim == 3:
			col = color
		else:
			col = np.broadcast_to(rgba(color), (self.h, self.w, 4))
		a = col[..., 3] * cov * opacity
		src = np.concatenate([col[..., :3] * a[..., None], a[..., None]], axis=-1)
		self.px = src + self.px * (1 - a[..., None])

	def fill(self, f: SDF, color, aa: str = "ss", opacity: float = 1.0, sharp: float = 1.0):
		self.paint(self.coverage(f, aa, sharp=sharp), color, opacity)

	def fill_grad(self, f: SDF, stops, axis: str = "y", p0=None, p1=None, aa: str = "ss", opacity=1.0,
			sharp: float = 1.0, dither: int = 0):
		"""Fill shape with a linear gradient. stops: list of (t, colour)."""
		self.paint(self.coverage(f, aa, sharp=sharp), self.gradient(stops, axis, p0, p1, dither), opacity)

	def gradient(self, stops, axis="y", p0=None, p1=None, dither: int = 0) -> np.ndarray:
		if axis == "y":
			a = p0 if p0 is not None else 0
			b = p1 if p1 is not None else self.h
			t = (self.Y - a) / max(b - a, 1e-9)
		elif axis == "x":
			a = p0 if p0 is not None else 0
			b = p1 if p1 is not None else self.w
			t = (self.X - a) / max(b - a, 1e-9)
		else:  # radial: p0 = (cx, cy), p1 = radius
			t = np.hypot(self.X - p0[0], self.Y - p0[1]) / p1
		return ramp(np.clip(t, 0, 1), stops)

	def blit(self, other: "Canvas", x: int, y: int, opacity: float = 1.0):
		"""Composite another canvas at integer offset."""
		h, w = other.h, other.w
		x0, y0 = max(0, x), max(0, y)
		x1, y1 = min(self.w, x + w), min(self.h, y + h)
		if x0 >= x1 or y0 >= y1:
			return
		src = other.px[y0 - y:y1 - y, x0 - x:x1 - x] * opacity
		dst = self.px[y0:y1, x0:x1]
		self.px[y0:y1, x0:x1] = src + dst * (1 - src[..., 3:4])

	def straight(self) -> np.ndarray:
		a = self.px[..., 3:4]
		rgb = np.where(a > 1e-6, self.px[..., :3] / np.maximum(a, 1e-6), 0)
		return np.concatenate([np.clip(rgb, 0, 1), np.clip(a, 0, 1)], axis=-1)

	def alpha(self) -> np.ndarray:
		return self.px[..., 3].copy()

	def to_image(self) -> Image.Image:
		arr = np.round(self.straight() * 255).astype(np.uint8)
		arr[arr[..., 3] == 0] = 0
		return Image.fromarray(arr, "RGBA")

	def save(self, rel_path: str, base: str = ASSETS) -> str:
		path = os.path.join(base, rel_path)
		os.makedirs(os.path.dirname(path), exist_ok=True)
		self.to_image().save(path, optimize=True)
		return path

	def shadow(self, dx: int, dy: int, color="#000000", opacity: float = 0.35, blur: int = 0) -> "Canvas":
		"""Return a new canvas containing a drop shadow of this canvas' alpha."""
		a = np.roll(np.roll(self.px[..., 3], dy, axis=0), dx, axis=1)
		if dy > 0:
			a[:dy] = 0
		if dx > 0:
			a[:, :dx] = 0
		if blur:
			a = box_blur(a, blur)
		out = Canvas(self.w, self.h)
		out.paint(np.ones_like(a), np.broadcast_to(rgba(color), (self.h, self.w, 4)) * np.array([1, 1, 1, 0]) +
				np.concatenate([np.zeros((self.h, self.w, 3)), a[..., None]], axis=-1), opacity)
		return out


def ramp(t: np.ndarray, stops) -> np.ndarray:
	"""Evaluate a multi-stop colour ramp (straight alpha) at t (any shape)."""
	ts = np.array([s[0] for s in stops], dtype=np.float64)
	cs = np.array([rgba(s[1]) for s in stops])
	out = np.empty(t.shape + (4,))
	for ch in range(4):
		out[..., ch] = np.interp(t, ts, cs[:, ch])
	return out


def box_blur(a: np.ndarray, r: int) -> np.ndarray:
	"""Separable box blur (radius r) applied twice ~ gaussian; works on 2-D or 3-D arrays."""
	if r <= 0:
		return a
	out = a.astype(np.float64)
	for _ in range(2):
		for axis in (0, 1):
			pad = [(0, 0)] * out.ndim
			pad[axis] = (r, r)
			p = np.pad(out, pad, mode="edge")
			c = np.cumsum(p, axis=axis)
			c = np.insert(c, 0, 0, axis=axis)
			n = out.shape[axis]
			hi = np.take(c, np.arange(2 * r + 1, 2 * r + 1 + n), axis=axis)
			lo = np.take(c, np.arange(0, n), axis=axis)
			out = (hi - lo) / (2 * r + 1)
	return out


BAYER4 = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]], dtype=np.float64) / 16.0 - 0.5 + 1 / 32
BAYER8 = None


def bayer(n: int = 8) -> np.ndarray:
	m = np.array([[0]], dtype=np.float64)
	while m.shape[0] < n:
		k = m.shape[0]
		m = np.block([[4 * m, 4 * m + 2], [4 * m + 3, 4 * m + 1]])
	return (m + 0.5) / (n * n) - 0.5


def posterize_dither(rgb: np.ndarray, levels: int = 32, strength: float = 1.0, cell: int = 1) -> np.ndarray:
	"""Quantise an (h,w,3) float image to `levels` per channel with ordered (Bayer 8x8) dithering."""
	h, w = rgb.shape[:2]
	b = bayer(8)
	ys, xs = np.mgrid[0:h, 0:w]
	thr = b[(ys // cell) % 8, (xs // cell) % 8][..., None] * strength
	q = np.floor(rgb * (levels - 1) + 0.5 + thr) / (levels - 1)
	return np.clip(q, 0, 1)


def upscale(img: Image.Image, k: int) -> Image.Image:
	return img.resize((img.width * k, img.height * k), Image.NEAREST)


def write_json(rel_path: str, data, base: str = ASSETS):
	path = os.path.join(base, rel_path)
	os.makedirs(os.path.dirname(path), exist_ok=True)
	with open(path, "w", encoding="utf-8") as fh:
		json.dump(data, fh, indent=2, ensure_ascii=False)
		fh.write("\n")
	return path


def save_image(img: Image.Image, rel_path: str, base: str = ASSETS) -> str:
	path = os.path.join(base, rel_path)
	os.makedirs(os.path.dirname(path), exist_ok=True)
	img.save(path, optimize=True)
	return path


def rng(seed: int) -> np.random.Generator:
	return np.random.default_rng(seed)


# ----------------------------------------------------------------------------------------------
# pixel grid helpers (for block textures & hand-made sprites)
# ----------------------------------------------------------------------------------------------

def sprite(rows: Iterable[str], palette: dict[str, str]) -> np.ndarray:
	"""Build a straight-alpha float (h,w,4) array from ASCII rows; '.' or ' ' = transparent."""
	rows = list(rows)
	h, w = len(rows), max(len(r) for r in rows)
	out = np.zeros((h, w, 4))
	for y, row in enumerate(rows):
		for x, ch in enumerate(row):
			if ch in ". ":
				continue
			out[y, x] = rgba(palette[ch])
	return out


def to_image(arr: np.ndarray) -> Image.Image:
	a = np.round(np.clip(arr, 0, 1) * 255).astype(np.uint8)
	a[a[..., 3] == 0] = 0
	return Image.fromarray(a, "RGBA")


def from_image(img: Image.Image) -> np.ndarray:
	return np.asarray(img.convert("RGBA")).astype(np.float64) / 255.0


def over(dst: np.ndarray, src: np.ndarray, x: int = 0, y: int = 0) -> np.ndarray:
	"""Composite straight-alpha src onto straight-alpha dst (in place) at offset."""
	h, w = src.shape[:2]
	x0, y0 = max(0, x), max(0, y)
	x1, y1 = min(dst.shape[1], x + w), min(dst.shape[0], y + h)
	if x0 >= x1 or y0 >= y1:
		return dst
	s = src[y0 - y:y1 - y, x0 - x:x1 - x]
	d = dst[y0:y1, x0:x1]
	sa = s[..., 3:4]
	da = d[..., 3:4]
	oa = sa + da * (1 - sa)
	orgb = np.where(oa > 0, (s[..., :3] * sa + d[..., :3] * da * (1 - sa)) / np.maximum(oa, 1e-9), 0)
	dst[y0:y1, x0:x1] = np.concatenate([orgb, oa], axis=-1)
	return dst


def pixel_gem(w: int, h: int, cut: int | None = None, palette: dict | None = None) -> np.ndarray:
	"""Crisp pixel-art emerald (straight-alpha (h,w,4)); light comes from the top-left."""
	p = {"ol": "#0c5e26", "os": "#043512", "hi": "#f0fff6", "top": "#b4fdd0", "l": "#7cf0a6", "m": "#2ed46c",
		"d": "#12a843", "bot": "#0b8a35", "deep": "#08702b"}
	if palette:
		p.update(palette)
	k = cut if cut is not None else max(1, round(min(w, h) * 0.3))
	ys, xs = np.mgrid[0:h, 0:w]
	inside = (xs + ys >= k) & ((w - 1 - xs) + ys >= k) & (xs + (h - 1 - ys) >= k) & ((w - 1 - xs) + (h - 1 - ys) >= k)
	pad = np.pad(inside, 1)
	interior = inside & pad[:-2, 1:-1] & pad[2:, 1:-1] & pad[1:-1, :-2] & pad[1:-1, 2:]
	out = np.zeros((h, w, 4))
	outline = inside & ~interior
	tl = (xs / max(w - 1, 1) + ys / max(h - 1, 1)) < 1.0
	out[outline & tl] = rgba(p["ol"])
	out[outline & ~tl] = rgba(p["os"])
	u = ((xs - 1) / max(w - 3, 1))[..., None]
	v = ((ys - 1) / max(h - 3, 1))[..., None]
	col = np.where(u < 0.34, rgba(p["l"]), np.where(u < 0.67, rgba(p["m"]), rgba(p["d"])))
	col = np.where((v < 0.2) & (u < 0.67), rgba(p["top"]), col)
	col = np.where(v > 0.82, np.where(u < 0.5, rgba(p["d"]), rgba(p["bot"])), col)
	col = np.where((v > 0.82) & (u >= 0.67), rgba(p["deep"]), col)
	out[interior] = col[interior]
	# sparkle: first interior pixel from the top-left
	idx = np.argwhere(interior)
	if len(idx):
		s = idx[np.argmin(idx[:, 0] * 2 + idx[:, 1])]
		out[s[0], s[1]] = rgba(p["hi"])
	return out
