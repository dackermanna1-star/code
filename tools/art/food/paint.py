"""Small raster toolkit for LaptopCraft's painting variants (16 px per block, RGB).

Everything is deterministic: gradients use 4x4 ordered (Bayer) dithering between palette colors, and
"texture" comes from hashed value noise, so re-running the generator reproduces the exact same PNGs.
"""
from __future__ import annotations

import math

import numpy as np
from PIL import Image

BAYER4 = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]], dtype=float) / 16.0 + 1 / 32.0


def rgb(h: str) -> np.ndarray:
	h = h.lstrip('#')
	return np.array([int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)], dtype=float)


def mix(a, b, t: float) -> np.ndarray:
	a = rgb(a) if isinstance(a, str) else a
	b = rgb(b) if isinstance(b, str) else b
	return a + (b - a) * t


class Canvas:
	def __init__(self, w: int, h: int, fill='#000000'):
		self.w, self.h = w, h
		self.a = np.zeros((h, w, 3), dtype=float)
		self.a[:, :] = rgb(fill) if isinstance(fill, str) else fill

	# -- basic pixels ------------------------------------------------------------------------------
	def inside(self, x, y):
		return 0 <= x < self.w and 0 <= y < self.h

	def px(self, x, y, c):
		x, y = int(x), int(y)
		if self.inside(x, y):
			self.a[y, x] = rgb(c) if isinstance(c, str) else c

	def get(self, x, y) -> np.ndarray:
		return self.a[int(y), int(x)].copy()

	def rect(self, x0, y0, w, h, c):
		for y in range(int(y0), int(y0 + h)):
			for x in range(int(x0), int(x0 + w)):
				self.px(x, y, c)

	def hline(self, x0, x1, y, c):
		for x in range(int(x0), int(x1) + 1):
			self.px(x, y, c)

	def vline(self, x, y0, y1, c):
		for y in range(int(y0), int(y1) + 1):
			self.px(x, y, c)

	def line(self, x0, y0, x1, y1, c):
		x0, y0, x1, y1 = int(round(x0)), int(round(y0)), int(round(x1)), int(round(y1))
		dx, dy = abs(x1 - x0), -abs(y1 - y0)
		sx, sy = (1 if x0 < x1 else -1), (1 if y0 < y1 else -1)
		err = dx + dy
		while True:
			self.px(x0, y0, c)
			if x0 == x1 and y0 == y1:
				break
			e2 = 2 * err
			if e2 >= dy:
				err += dy
				x0 += sx
			if e2 <= dx:
				err += dx
				y0 += sy

	def poly(self, pts, c):
		"""Even-odd scanline fill of a polygon given in pixel coordinates (pixel centers sampled)."""
		ys = [p[1] for p in pts]
		for y in range(max(0, int(math.floor(min(ys)))), min(self.h, int(math.ceil(max(ys))) + 1)):
			cy = y + 0.5
			xs = []
			for i in range(len(pts)):
				(x0, y0), (x1, y1) = pts[i], pts[(i + 1) % len(pts)]
				if (y0 <= cy < y1) or (y1 <= cy < y0):
					xs.append(x0 + (cy - y0) * (x1 - x0) / (y1 - y0))
			xs.sort()
			for i in range(0, len(xs) - 1, 2):
				for x in range(int(math.ceil(xs[i] - 0.5)), int(math.floor(xs[i + 1] - 0.5)) + 1):
					self.px(x, y, c)

	def ellipse(self, cx, cy, rx, ry, c):
		for y in range(int(cy - ry - 1), int(cy + ry + 2)):
			for x in range(int(cx - rx - 1), int(cx + rx + 2)):
				if ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1.0:
					self.px(x, y, c)

	def disc(self, cx, cy, r, c):
		self.ellipse(cx, cy, r, r, c)

	def ring(self, cx, cy, r0, r1, c, dither_from=None):
		for y in range(int(cy - r1 - 1), int(cy + r1 + 2)):
			for x in range(int(cx - r1 - 1), int(cx + r1 + 2)):
				d = math.hypot(x + 0.5 - cx, y + 0.5 - cy)
				if r0 <= d <= r1:
					self.px(x, y, c)

	# -- dithered fills ----------------------------------------------------------------------------
	def vgrad(self, x0, y0, w, h, colors, mask=None):
		"""Vertical gradient through `colors` (evenly spaced), Bayer-dithered between neighbours."""
		cols = [rgb(c) if isinstance(c, str) else c for c in colors]
		n = len(cols) - 1
		for y in range(int(y0), int(y0 + h)):
			t = (y - y0) / max(1, h - 1) * n
			i = min(int(t), n - 1)
			f = t - i
			for x in range(int(x0), int(x0 + w)):
				if mask is not None and not mask(x, y):
					continue
				self.px(x, y, cols[i + 1] if f > BAYER4[y % 4, x % 4] else cols[i])

	def radial(self, cx, cy, r, colors, mask=None):
		"""Radial gradient from center (colors[0]) to radius r (colors[-1]), dithered."""
		cols = [rgb(c) if isinstance(c, str) else c for c in colors]
		n = len(cols) - 1
		for y in range(int(cy - r - 1), int(cy + r + 2)):
			for x in range(int(cx - r - 1), int(cx + r + 2)):
				d = math.hypot(x + 0.5 - cx, y + 0.5 - cy)
				if d > r or not self.inside(x, y):
					continue
				if mask is not None and not mask(x, y):
					continue
				t = d / r * n
				i = min(int(t), n - 1)
				f = t - i
				self.px(x, y, cols[i + 1] if f > BAYER4[y % 4, x % 4] else cols[i])

	def dither_mix(self, x, y, a, b, t):
		"""Puts a or b at (x, y) so that an area averages to mix(a, b, t)."""
		self.px(x, y, b if t > BAYER4[int(y) % 4, int(x) % 4] else a)

	# -- output --------------------------------------------------------------------------------------
	def frame(self, outer='#3a2412', inner=None):
		self.hline(0, self.w - 1, 0, outer)
		self.hline(0, self.w - 1, self.h - 1, outer)
		self.vline(0, 0, self.h - 1, outer)
		self.vline(self.w - 1, 0, self.h - 1, outer)
		if inner:
			self.hline(1, self.w - 2, 1, inner)
			self.vline(1, 1, self.h - 2, inner)

	def image(self) -> Image.Image:
		return Image.fromarray(np.clip(self.a + 0.5, 0, 255).astype(np.uint8), 'RGB')


def hash01(x: int, y: int, seed: int = 0) -> float:
	"""Deterministic per-pixel pseudo random value in [0, 1)."""
	h = (x * 374761393 + y * 668265263 + seed * 2147483647) & 0xFFFFFFFF
	h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
	return ((h ^ (h >> 16)) & 0xFFFF) / 65536.0


def value_noise(x: float, y: float, scale: float, seed: int = 0) -> float:
	"""Smooth value noise in [0, 1)."""
	gx, gy = x / scale, y / scale
	x0, y0 = int(math.floor(gx)), int(math.floor(gy))
	fx, fy = gx - x0, gy - y0
	fx, fy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
	v00, v10 = hash01(x0, y0, seed), hash01(x0 + 1, y0, seed)
	v01, v11 = hash01(x0, y0 + 1, seed), hash01(x0 + 1, y0 + 1, seed)
	return (v00 * (1 - fx) + v10 * fx) * (1 - fy) + (v01 * (1 - fx) + v11 * fx) * fy
