"""CubeOS wallpapers: ten Minecraft-inspired pixel-art scenes.

Each scene is painted on a 480x270 "art pixel" grid (smooth gradients, glows, blocky terrain made of
block-sized columns, trees, water reflections...), finished with subtle ordered dithering, and saved
upscaled 2x (nearest) as a 960x540 texture.  Every art pixel is therefore 2x2 texels, so nothing is
thinner than 2 texels and the image survives the non-integer nearest-neighbour scaling the OS uses.

Run: python3 tools/art/wallpapers.py [name ...]
"""
from __future__ import annotations

import math
import sys

import numpy as np
from PIL import Image

from lib import box_blur, posterize_dither, rgba, save_image

W, H = 480, 270
YS, XS = np.mgrid[0:H, 0:W].astype(np.float64)


def C(hexstr) -> np.ndarray:
	return rgba(hexstr)[:3]


def lerp(a, b, t):
	return a + (b - a) * t


class Scene:
	def __init__(self, seed: int):
		self.img = np.zeros((H, W, 3))
		self.r = np.random.default_rng(seed)
		self.seed = seed

	# ---------------------------------------------------------------------------------- basics
	def vgrad(self, stops, y0=0, y1=H, mask=None):
		t = np.clip((YS - y0) / max(y1 - y0, 1), 0, 1)
		col = ramp3(t, stops)
		self.put(col, mask)

	def put(self, col, mask=None, alpha=1.0):
		if mask is None:
			mask = np.ones((H, W), dtype=bool)
		a = (mask.astype(np.float64) * alpha)[..., None]
		col = np.broadcast_to(col, (H, W, 3)) if np.ndim(col) == 1 else col
		self.img = self.img * (1 - a) + col * a

	def add(self, col, intensity):
		self.img = self.img + np.asarray(col) * intensity[..., None]

	def glow(self, cx, cy, r, col, strength=1.0, power=2.0):
		d = np.hypot(XS - cx, YS - cy) / r
		self.add(C(col) if isinstance(col, str) else col, strength * np.clip(1 - d, 0, 1) ** power)

	def rect(self, x0, y0, x1, y1, col, alpha=1.0):
		x0, y0, x1, y1 = int(round(x0)), int(round(y0)), int(round(x1)), int(round(y1))
		x0, y0 = max(0, x0), max(0, y0)
		x1, y1 = min(W, x1), min(H, y1)
		if x0 >= x1 or y0 >= y1:
			return
		c = C(col) if isinstance(col, str) else np.asarray(col)
		self.img[y0:y1, x0:x1] = self.img[y0:y1, x0:x1] * (1 - alpha) + c * alpha

	def px(self, x, y, col, alpha=1.0):
		self.rect(x, y, x + 1, y + 1, col, alpha)

	# ---------------------------------------------------------------------------------- terrain
	def profile(self, base, amp, scale, block, step=None, seed_off=0, octaves=3, sharp=1.0):
		n = noise1d(W + block, scale, self.seed * 31 + seed_off, octaves)
		n = (n - 0.5) * 2
		if sharp != 1.0:
			n = np.sign(n) * np.abs(n) ** sharp
		h = base - amp * n
		step = step or max(1, block // 2)
		out = np.empty(W)
		for x0 in range(0, W, block):
			v = h[x0 + block // 2]
			out[x0:x0 + block] = np.round(v / step) * step
		return out[:W]

	def ridge(self, h, top, bottom=None, grass=None, grass_h=3, edge=None, block=0, var=0.05, haze=None, haze_t=0.0,
			y_bottom=None):
		"""Fill everything below height profile h. Optional grass band, top edge highlight and per-block shade jitter."""
		mask = YS >= h[None, :]
		yb = y_bottom if y_bottom is not None else H
		t = np.clip((YS - h[None, :]) / max(yb - h.min(), 1), 0, 1)
		top_c, bot_c = C(top), C(bottom or top)
		col = top_c + (bot_c - top_c) * t[..., None]
		if grass:
			g = (YS - h[None, :]) < grass_h
			col = np.where(g[..., None], C(grass), col)
		if edge:
			e = (YS - h[None, :]) < 1
			col = np.where(e[..., None], C(edge), col)
		if block and var:
			bx = (XS // block).astype(int)
			by = ((YS - h[None, :]) // block).astype(int)
			jitter = hash2(bx, by, self.seed) * 2 - 1
			col = col * (1 + var * jitter[..., None])
		if haze is not None and haze_t:
			col = col + (C(haze) - col) * haze_t
		self.put(col, mask)
		return mask

	def peaks(self, base, n, hmin, hmax, wmin, wmax, seed_off=0, block=3, jag=2.5):
		"""Jagged mountain range: union of asymmetric triangular peaks, quantised to blocks."""
		r = np.random.default_rng(self.seed * 17 + seed_off)
		x = np.arange(W, dtype=np.float64)
		h = np.full(W, float(base))
		for _ in range(n):
			c = r.uniform(-60, W + 60)
			ph = r.uniform(hmin, hmax)
			half = r.uniform(wmin, wmax)
			sl, sr = ph / half * r.uniform(0.75, 1.25), ph / half * r.uniform(0.75, 1.25)
			prof = base - np.maximum(0, ph - np.where(x < c, (c - x) * sl, (x - c) * sr))
			h = np.minimum(h, prof)
		h += (noise1d(W, 6, self.seed + seed_off, 2) - 0.5) * 2 * jag
		out = np.empty(W)
		for x0 in range(0, W, block):
			out[x0:x0 + block] = h[min(W - 1, x0 + block // 2)]
		return np.round(out / block) * block

	def mountains(self, h, lit, shade, snow_lit=None, snow_shade=None, snowline=0.0, cap=3, light="right", haze=None,
			haze_t=0.0, bottom=None, block=3, smooth=9):
		m = YS >= h[None, :]
		k = smooth // 2
		hs = np.convolve(np.pad(h, k, mode="edge"), np.ones(2 * k + 1) / (2 * k + 1), mode="same")[k:-k]
		slope = np.gradient(hs)
		lit_cols = (slope > 0.05) if light == "right" else (slope < -0.05)
		L = np.broadcast_to(lit_cols[None, :, None], (H, W, 1))
		col = np.where(L, C(lit), C(shade))
		if bottom:
			depth = np.clip((YS - h[None, :]) / 70, 0, 1)[..., None]
			col = col * (1 - depth) + C(bottom) * depth
		if snow_lit:
			# ragged but continuous snow line: smooth noise plus thin "gullies" of snow running down
			n = (noise1d(W, 10, self.seed + 77, 2) - 0.5) * 18
			gully = np.where(noise1d(W, 3, self.seed + 78, 1) > 0.8, 6.0, 0.0)
			line = np.round((snowline + n + gully) / block) * block
			line = np.repeat(line[::block], block)[:W]
			snowy = (YS < line[None, :]) | ((YS - h[None, :]) < cap)
			snowy &= (YS - h[None, :]) < 46
			scol = np.where(L, C(snow_lit), C(snow_shade or snow_lit))
			col = np.where(snowy[..., None], scol, col)
		bx = (XS // block).astype(int)
		by = (YS // block).astype(int)
		col = col * (1 + 0.035 * (hash2(bx, by, self.seed + 1)[..., None] * 2 - 1))
		if haze is not None and haze_t:
			col = col + (C(haze) - col) * haze_t
		self.put(col, m)
		return m

	def clouds(self, y0, y1, density=0.5, cell=(6, 3), col="#ffffff", shade="#d8e6f5", alpha=1.0, seed_off=0, scale=40,
			drift=0):
		"""Minecraft-style blocky clouds: thresholded 2-D noise on a coarse grid."""
		cw, ch = cell
		gw, gh = W // cw + 2, int((y1 - y0) / ch) + 2
		n = noise2d(gw, gh, scale / cw, self.seed * 7 + seed_off)
		# fade towards band edges
		yy = np.linspace(0, 1, gh)[:, None]
		n = n * (1 - (2 * yy - 1) ** 4)
		m = n > (1 - density)
		mask = np.zeros((H, W), dtype=bool)
		shadow = np.zeros((H, W), dtype=bool)
		for gy in range(gh):
			for gx in range(gw):
				if not m[gy, gx]:
					continue
				x = gx * cw - drift
				y = int(y0 + gy * ch)
				x0, x1 = max(0, x), min(W, x + cw)
				if x0 >= x1 or y >= H:
					continue
				mask[y:y + ch, x0:x1] = True
				below = gy + 1 >= gh or not m[gy + 1, gx]
				if below:
					shadow[y + ch - 1:y + ch, x0:x1] = True
		self.put(C(col), mask & ~shadow, alpha)
		self.put(C(shade), shadow, alpha)
		return mask

	def stars(self, n, y1, bright=1.0, col="#ffffff", big=0.08, twinkle=True, seed_off=0, ymin=0):
		r = np.random.default_rng(self.seed * 13 + seed_off)
		for _ in range(n):
			x = int(r.integers(0, W))
			y = int(r.integers(ymin, int(y1)))
			b = r.random() ** 2 * bright
			fade = 1 - (y / y1) ** 2
			a = min(1.0, (0.35 + 0.65 * b) * fade)
			c = col
			if r.random() < 0.15:
				c = "#ffe9b0" if r.random() < 0.5 else "#b8d4ff"
			if r.random() < big:
				self.px(x, y, c, a)
				for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
					self.px(x + dx, y + dy, c, a * 0.45)
			else:
				self.px(x, y, c, a)

	def reflect(self, y_line, y_end=H, tint="#1a3a6a", tint_t=0.35, darken=0.75, ripple=1.5, seed_off=0, src_min=0):
		"""Mirror the image above y_line into the band below it, with horizontal ripples."""
		src = self.img.copy()
		r = np.random.default_rng(self.seed * 5 + seed_off)
		phase = r.random() * 6.28
		for y in range(int(y_line), int(y_end)):
			d = y - y_line
			sy = int(y_line - 1 - d * 1.0)
			if sy < src_min:
				sy = src_min
			off = int(round(math.sin(d * 0.9 + phase) * ripple * (1 + d / 40)))
			row = np.roll(src[sy], off, axis=0)
			t = min(1.0, tint_t + d / (y_end - y_line) * 0.35)
			row = row * darken
			row = row + (C(tint) - row) * t
			self.img[y] = row

	# ---------------------------------------------------------------------------------- props
	def oak(self, x, ground, s=1.0, leaves=("#3f8f2f", "#5aae3c", "#2d6e22"), trunk=("#6b4a2b", "#4a321c"), haze=None,
			haze_t=0.0):
		x = int(x)
		tw = max(2, int(round(2 * s)))
		th = int(round(10 * s))
		lw = int(round(16 * s)) | 1
		lh = int(round(12 * s))
		top = ground - th - lh + int(3 * s)
		cols = [C(c) for c in leaves]
		tcol = [C(c) for c in trunk]
		if haze is not None:
			cols = [c + (C(haze) - c) * haze_t for c in cols]
			tcol = [c + (C(haze) - c) * haze_t for c in tcol]
		self.rect(x - tw // 2, ground - th, x - tw // 2 + tw, ground + 1, tcol[0])
		self.rect(x - tw // 2 + tw - 1, ground - th, x - tw // 2 + tw, ground + 1, tcol[1])
		# canopy: two stacked blocky layers like a Minecraft oak
		b = max(2, int(round(3 * s)))
		x0 = x - lw // 2
		self.rect(x0, top + b, x0 + lw, top + lh, cols[0])
		self.rect(x0 + b, top, x0 + lw - b, top + b, cols[0])
		r = np.random.default_rng(int(x * 7 + ground))
		for yy in range(top, top + lh, max(1, b // 2 + 1)):
			for xx in range(x0, x0 + lw, max(1, b // 2 + 1)):
				if r.random() < 0.3:
					inside = (yy >= top + b) or (x0 + b <= xx < x0 + lw - b)
					if inside:
						self.rect(xx, yy, xx + max(1, b // 2), yy + max(1, b // 2), cols[1] if (yy - top) < lh * 0.45 else cols[2])
		self.rect(x0, top + lh - max(1, b // 2), x0 + lw, top + lh, cols[2])
		self.rect(x0 + b, top, x0 + lw - b, top + 1, cols[1])

	def birch(self, x, ground, s=1.0, haze=None, haze_t=0.0):
		self.oak(x, ground, s, leaves=("#6fae3f", "#8fcb55", "#548f2e"), trunk=("#e8e4d8", "#c9c3b4"), haze=haze, haze_t=haze_t)
		th = int(round(10 * s))
		tw = max(2, int(round(2 * s)))
		for yy in range(ground - th + 1, ground, 3):
			self.rect(x - tw // 2, yy, x - tw // 2 + 1, yy + 1, "#2b2b2b" if haze is None else lerp(C("#2b2b2b"), C(haze), haze_t))

	def cottage(self, x, ground):
		"""Small Minecraft-style house: cobblestone base, plank walls, log corners, stair roof, smoking chimney."""
		w, hgt = 30, 16
		x0 = x - w // 2
		self.rect(x0, ground - 3, x0 + w, ground + 1, "#8b8b8b")
		for k in range(x0, x0 + w, 3):
			self.rect(k, ground - 3, k + 1, ground - 2, "#6f6f6f")
		self.rect(x0, ground - hgt, x0 + w, ground - 3, "#b88a52")
		for yy in range(ground - hgt + 3, ground - 3, 3):
			self.rect(x0, yy, x0 + w, yy + 1, "#9c7342")
		self.rect(x0, ground - hgt, x0 + 3, ground - 3, "#6b4a2b")
		self.rect(x0 + w - 3, ground - hgt, x0 + w, ground - 3, "#6b4a2b")
		self.rect(x0 + 5, ground - hgt + 4, x0 + 11, ground - hgt + 10, "#9fd3f5")
		self.rect(x0 + 5, ground - hgt + 4, x0 + 11, ground - hgt + 5, "#d8f0ff")
		self.rect(x0 + 18, ground - 12, x0 + 24, ground - 3, "#7a5530")
		self.px(x0 + 22, ground - 8, "#3a2a18")
		for k in range(w // 2 + 3):
			self.rect(x0 - 3 + k, ground - hgt - k - 1, x0 + w + 3 - k, ground - hgt - k, "#5a3a22" if k % 2 else "#6b4628")
		self.rect(x0 + w - 9, ground - hgt - 16, x0 + w - 5, ground - hgt - 6, "#7d7d7d")
		for i, (dx, dy, sz) in enumerate(((0, -20, 3), (2, -25, 4), (-1, -31, 5), (3, -38, 5))):
			self.rect(x0 + w - 8 + dx, ground - hgt + dy, x0 + w - 8 + dx + sz, ground - hgt + dy + sz, "#e8eef5", 0.75 - i * 0.15)

	def spruce(self, x, ground, s=1.0, col="#1f4a3a", dark="#163a2d", snow=None, haze=None, haze_t=0.0, trunk="#4a3220"):
		x = int(x)
		c1, c2, tc = C(col), C(dark), C(trunk)
		if haze is not None:
			c1, c2, tc = [c + (C(haze) - c) * haze_t for c in (c1, c2, tc)]
		h = int(round(26 * s))
		self.rect(x - 1, ground - int(4 * s), x + 1, ground + 1, tc)
		tiers = max(3, int(round(5 * s)))
		for i in range(tiers):
			ty = ground - int(4 * s) - int((i + 1) * h / tiers)
			wdt = int(round((tiers - i) * 2.6 * s)) + 1
			hh = int(h / tiers) + 2
			for k in range(hh):
				ww = int(wdt * (0.45 + 0.55 * (k + 1) / hh))
				self.rect(x - ww, ty + k, x + ww + 1, ty + k + 1, c1)
				self.rect(x + 1, ty + k, x + ww + 1, ty + k + 1, c2)
			if snow:
				self.rect(x - int(wdt * 0.6), ty + 1, x + int(wdt * 0.5) + 1, ty + 2, C(snow))
		self.rect(x, ground - h - int(4 * s) - 2, x + 1, ground - h - int(4 * s) + 1, c1)
		if snow:
			self.rect(x, ground - h - int(4 * s) - 2, x + 1, ground - h - int(4 * s) - 1, C(snow))

	def cherry(self, x, ground, s=1.0, haze=None, haze_t=0.0):
		x = int(x)
		pinks = [C(c) for c in ("#f6a9c9", "#ffc8de", "#e083ad", "#ffe1ee")]
		trunk = [C("#5a3640"), C("#3e232b")]
		if haze is not None:
			pinks = [c + (C(haze) - c) * haze_t for c in pinks]
			trunk = [c + (C(haze) - c) * haze_t for c in trunk]
		th = int(16 * s)
		self.rect(x - int(1.5 * s), ground - th, x + int(1.5 * s) + 1, ground + 1, trunk[0])
		self.rect(x + int(0.5 * s), ground - th, x + int(1.5 * s) + 1, ground + 1, trunk[1])
		# branches
		for dx, dy in ((-6, -4), (6, -6)):
			for k in range(int(6 * s)):
				self.rect(x + int(dx * s * k / (6 * s)), ground - th - int(abs(dy) * s * k / (6 * s)),
					x + int(dx * s * k / (6 * s)) + 2, ground - th - int(abs(dy) * s * k / (6 * s)) + 2, trunk[0])
		r = np.random.default_rng(int(x * 3 + ground))
		blobs = [(-9, -8, 10, 7), (7, -10, 11, 8), (-1, -14, 12, 8), (-14, -3, 7, 5), (13, -4, 8, 5)]
		for bx, by, bw, bh in blobs:
			cx, cy = x + int(bx * s), ground - th + int(by * s)
			w2, h2 = int(bw * s), int(bh * s)
			self.rect(cx - w2, cy - h2 + 2, cx + w2, cy + h2, pinks[0])
			self.rect(cx - w2 + 2, cy - h2, cx + w2 - 2, cy - h2 + 2, pinks[0])
		for bx, by, bw, bh in blobs:
			cx, cy = x + int(bx * s), ground - th + int(by * s)
			w2, h2 = int(bw * s), int(bh * s)
			for _ in range(int(10 * s * s) + 4):
				px = cx + int(r.integers(-w2, w2))
				py = cy + int(r.integers(-h2, h2))
				c = pinks[1] if py < cy else pinks[2]
				self.rect(px, py, px + 2, py + 2, c)
			self.rect(cx - w2 + 2, cy - h2, cx + w2 - 2, cy - h2 + 1, pinks[3])
			# hanging petals
			for k in range(int(4 * s)):
				px = cx + int(r.integers(-w2, w2))
				self.rect(px, cy + h2, px + 1, cy + h2 + int(r.integers(1, 4)), pinks[2])

	def cactus(self, x, ground, h, flower=False):
		x = int(x)
		self.rect(x - 3, ground - h, x + 3, ground + 1, "#4e8c3a")
		self.rect(x - 3, ground - h, x - 2, ground + 1, "#6fb04f")
		self.rect(x + 2, ground - h, x + 3, ground + 1, "#356a28")
		for yy in range(ground - h + 2, ground, 4):
			self.px(x - 1, yy, "#2f5e22")
			self.px(x + 1, yy + 2, "#2f5e22")
		self.rect(x - 3, ground - h, x + 3, ground - h + 1, "#86c464")
		if flower:
			self.rect(x - 2, ground - h - 2, x + 2, ground - h, "#ff7fb6")
			self.rect(x - 1, ground - h - 3, x + 1, ground - h - 2, "#ffb3d4")

	def house(self, x, ground, w, h, wall, roof, window="#ffcf6b", lit=True, door=True):
		x = int(x)
		self.rect(x, ground - h, x + w, ground + 1, wall)
		# stepped roof
		rh = w // 2 + 1
		for k in range(rh):
			self.rect(x - 1 + k, ground - h - k - 1, x + w + 1 - k, ground - h - k, roof)
		if lit:
			for wx in range(x + 2, x + w - 3, 5):
				self.rect(wx, ground - h + 3, wx + 3, ground - h + 6, window)
				self.glow(wx + 1.5, ground - h + 4.5, 9, C(window) * 0.6, 0.35)
		if door:
			self.rect(x + w // 2 - 1, ground - 5, x + w // 2 + 2, ground + 1, "#2a1a10")

	def finish(self, levels=40, strength=0.9) -> Image.Image:
		img = np.clip(self.img, 0, 1)
		img = posterize_dither(img, levels=levels, strength=strength)
		arr = np.round(img * 255).astype(np.uint8)
		im = Image.fromarray(arr, "RGB").convert("RGBA")
		return im.resize((W * 2, H * 2), Image.NEAREST)


# -------------------------------------------------------------------------------------------------
# noise helpers
# -------------------------------------------------------------------------------------------------

def ramp3(t, stops):
	ts = np.array([s[0] for s in stops])
	cs = np.array([C(s[1]) for s in stops])
	out = np.empty(t.shape + (3,))
	for ch in range(3):
		out[..., ch] = np.interp(t, ts, cs[:, ch])
	return out


def noise1d(n, scale, seed, octaves=3, persistence=0.5):
	r = np.random.default_rng(seed)
	total = np.zeros(n)
	amp, norm, sc = 1.0, 0.0, float(scale)
	for _ in range(octaves):
		pts = r.random(int(n / sc) + 3)
		xs = np.arange(n) / sc
		i = np.floor(xs).astype(int)
		f = xs - i
		f = f * f * (3 - 2 * f)
		total += amp * (pts[i] * (1 - f) + pts[i + 1] * f)
		norm += amp
		amp *= persistence
		sc = max(sc / 2, 1.0)
	return total / norm


def noise2d(w, h, scale, seed, octaves=3):
	r = np.random.default_rng(seed)
	total = np.zeros((h, w))
	amp, norm, sc = 1.0, 0.0, float(scale)
	ys, xs = np.mgrid[0:h, 0:w].astype(np.float64)
	for _ in range(octaves):
		gw, gh = int(w / sc) + 3, int(h / sc) + 3
		g = r.random((gh, gw))
		fx, fy = xs / sc, ys / sc
		ix, iy = np.floor(fx).astype(int), np.floor(fy).astype(int)
		tx, ty = fx - ix, fy - iy
		tx, ty = tx * tx * (3 - 2 * tx), ty * ty * (3 - 2 * ty)
		a = g[iy, ix] * (1 - tx) + g[iy, ix + 1] * tx
		b = g[iy + 1, ix] * (1 - tx) + g[iy + 1, ix + 1] * tx
		total += amp * (a * (1 - ty) + b * ty)
		norm += amp
		amp *= 0.5
		sc = max(sc / 2, 1.0)
	return total / norm


def hash2(x, y, seed):
	v = np.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453
	return v - np.floor(v)


# -------------------------------------------------------------------------------------------------
# scenes
# -------------------------------------------------------------------------------------------------

def square_sun(s: Scene, cx, cy, size, core="#fff6c8", rim="#ffe58a", glow_col="#ffd86a", glow_r=90, glow_s=0.55,
		inner="#fffef4"):
	"""Minecraft's square sun: warm glow, a bright near-white square with a slightly warmer edge."""
	s.glow(cx, cy, glow_r, C(glow_col) * 0.8, glow_s * 0.8, 2.4)
	s.glow(cx, cy, size * 1.6, C(glow_col), glow_s * 0.45, 1.2)
	h = size / 2
	b = max(2, round(size / 8))
	s.rect(cx - h, cy - h, cx + h, cy + h, rim)
	s.rect(cx - h + b, cy - h + b, cx + h - b, cy + h - b, core)
	s.rect(cx - h + 2 * b, cy - h + 2 * b, cx + h - 2 * b, cy + h - 2 * b, inner)


def square_moon(s: Scene, cx, cy, size):
	s.glow(cx, cy, size * 3.2, C("#9fb8ff"), 0.30, 2.0)
	h = size // 2
	s.rect(cx - h, cy - h, cx + h, cy + h, "#e9eef8")
	s.rect(cx - h, cy + h - 3, cx + h, cy + h, "#cfd7e6")
	s.rect(cx + h - 3, cy - h, cx + h, cy + h, "#d5dcea")
	for (dx, dy, w) in ((-7, -6, 6), (3, -2, 5), (-5, 4, 4), (5, 7, 3), (-9, 1, 2)):
		s.rect(cx + dx, cy + dy, cx + dx + w, cy + dy + w, "#c2cbdc")
		s.rect(cx + dx, cy + dy, cx + dx + w, cy + dy + 1, "#aeb8cc")


def meadow():
	s = Scene(11)
	s.vgrad([(0, "#3f8ee8"), (0.32, "#74b6f7"), (0.6, "#b4defc"), (0.76, "#e2f4ff"), (1, "#e2f4ff")])
	square_sun(s, 392, 54, 24)
	s.clouds(16, 64, 0.40, (8, 4), "#ffffff", "#dcebf8", seed_off=1, scale=70)
	s.clouds(72, 104, 0.24, (6, 3), "#f6fbff", "#d6e6f5", alpha=0.9, seed_off=2, scale=50)
	sky = "#c4e4fb"
	h = s.peaks(170, 11, 40, 88, 45, 85, seed_off=1)
	s.mountains(h, "#b0cbec", "#6584b0", "#ffffff", "#c2d2ec", snowline=118, cap=3, haze=sky, haze_t=0.25)
	h2 = s.profile(186, 12, 70, 8, 4, 2)
	s.ridge(h2, "#6aa957", "#5a9549", grass="#86c46a", grass_h=3, edge="#9ad37c", block=8, var=0.05, haze=sky, haze_t=0.32)
	for x in range(2, W, 8):
		if s.r.random() < 0.72:
			kind = s.r.random()
			gx = x + int(s.r.integers(-3, 3))
			g = int(h2[min(W - 1, max(0, gx))]) + 1
			if kind < 0.25:
				s.birch(gx, g, 0.42 + 0.12 * s.r.random(), haze=sky, haze_t=0.32)
			else:
				s.oak(gx, g, 0.40 + 0.16 * s.r.random(), haze=sky, haze_t=0.32)
	# lake reflecting the whole scene
	wl = 202
	s.reflect(wl, H, tint="#3f86c9", tint_t=0.28, darken=0.93, ripple=1.0)
	r = np.random.default_rng(5)
	for _ in range(40):
		x, y = int(r.integers(0, W)), int(r.integers(wl + 1, H))
		s.rect(x, y, x + int(r.integers(4, 18)), y + 1, "#ffffff", 0.35)
	s.rect(0, wl, W, wl + 1, "#d9f0ff", 0.6)
	# shores
	xs = np.arange(W, dtype=np.float64)
	left = 194 + np.clip(xs / 200, 0, 1) ** 2.2 * 90
	right = 194 + np.clip((W - xs) / 170, 0, 1) ** 2.2 * 90
	shore = np.minimum(left, right) + (noise1d(W, 20, 3, 2) - 0.5) * 6
	shore = np.round(np.repeat(shore[::6], 6)[:W] / 3) * 3
	s.ridge(shore, "#4f9a3a", "#3d7f2e", grass="#68b84a", grass_h=4, edge="#8bd668", block=6, var=0.06)
	# sandy rim where the shore meets the water
	rim = (YS >= shore[None, :]) & (YS < shore[None, :] + 6) & (shore[None, :] > 206)
	s.put(C("#d8c58a"), rim & (YS > wl))
	s.oak(26, int(shore[26]) + 1, 1.15)
	s.birch(62, int(shore[62]) + 1, 1.0)
	s.oak(104, int(shore[104]) + 1, 0.9)
	s.oak(454, int(shore[454]) + 1, 1.1)
	s.cottage(372, int(shore[386]) + 1)
	s.birch(420, int(shore[420]) + 1, 0.85)
	# lily pads
	for (x, y) in ((214, 236), (232, 244), (262, 232), (198, 250)):
		s.rect(x, y, x + 7, y + 2, "#3f8f3a")
		s.rect(x + 1, y - 1, x + 6, y, "#5fb04f")
		if x == 232:
			s.rect(x + 2, y - 3, x + 4, y - 1, "#ff9ec7")
	# foreground bank with flowers
	h4 = s.profile(258, 5, 50, 12, 3, 4)
	s.ridge(h4, "#3b8a2b", "#2c6b20", grass="#58ac3c", grass_h=4, edge="#79c95a", block=12, var=0.07)
	for _ in range(170):
		x = int(r.integers(0, W))
		y = int(h4[x] + r.integers(3, max(4, H - h4[x])))
		if r.random() < 0.6:
			s.rect(x, y - 3, x + 1, y, "#2f7a22")
			col = ["#e5383b", "#ffd93d", "#f2f2f2", "#5c7cfa", "#ff8fb1"][int(r.integers(0, 5))]
			s.rect(x - 1, y - 5, x + 2, y - 3, col)
		else:
			s.rect(x, y - 3, x + 1, y, "#6cc24a")
	for (x, y) in ((150, 214), (176, 206)):  # butterflies
		s.rect(x, y, x + 2, y + 2, "#ffffff")
		s.rect(x + 3, y, x + 5, y + 2, "#ffffff")
		s.px(x + 2, y + 1, "#333333")
	for (x, y) in ((250, 92), (262, 88), (275, 95)):  # birds
		s.rect(x, y, x + 2, y + 1, "#3a4a6a")
		s.rect(x + 2, y + 1, x + 3, y + 2, "#3a4a6a")
		s.rect(x + 3, y, x + 5, y + 1, "#3a4a6a")
	return s


def sunset():
	s = Scene(23)
	hor = 172
	s.vgrad([(0, "#1d1645"), (0.25, "#4b2a7f"), (0.48, "#a43f86"), (0.66, "#f0656b"), (0.82, "#ffa25e"), (1, "#ffd08a")], 0, hor)
	s.stars(70, 70, 0.6, seed_off=3)
	square_sun(s, 240, hor - 6, 52, core="#fff2c8", rim="#ffd68a", glow_col="#ff9a5a", glow_r=190, glow_s=0.5, inner="#fffcef")
	# horizontal sunset clouds lit from below
	r = np.random.default_rng(4)
	for _ in range(16):
		y = int(r.integers(55, 150))
		x = int(r.integers(-40, W))
		w = int(r.integers(30, 110))
		t = (y - 55) / 95
		top = lerp(C("#7a3a8f"), C("#ff8a6b"), t)
		bot = lerp(C("#c4528d"), C("#ffd29a"), t)
		s.rect(x, y, x + w, y + 3, top)
		s.rect(x + 6, y + 3, x + w - 4, y + 5, bot)
	# far islands silhouettes
	h = s.profile(hor - 4, 14, 60, 6, 3, 1)
	h[150:330] = hor
	s.ridge(h, "#6d2f6e", "#6d2f6e", block=6, var=0.04, y_bottom=hor)
	s.img[hor:] = 0
	s.vgrad([(0, "#ffb070"), (0.15, "#d4607a"), (0.5, "#6a2c6e"), (1, "#24123d")], hor, H, mask=YS >= hor)
	s.reflect(hor, H, tint="#3b1b55", tint_t=0.25, darken=0.85, ripple=2.0)
	# sun glitter on the water
	for y in range(hor, H, 2):
		d = (y - hor) / (H - hor)
		w = int(26 + 70 * d)
		for _ in range(int(3 + 6 * d)):
			x = int(240 + r.normal(0, w * 0.45))
			ln = int(r.integers(3, 10 + int(16 * d)))
			s.rect(x - ln // 2, y, x + ln // 2, y + 1, "#ffe3a3", 0.85 - 0.5 * d)
	# left cliff with trees, right headland
	hl = np.full(W, float(H))
	for x in range(0, 150):
		hl[x] = 128 + (x / 150) ** 2.2 * 120
	hl = np.round(hl / 6) * 6
	s.ridge(hl, "#2a1238", "#1a0b26", edge="#5a2a5f", block=6, var=0.05)
	for x in (14, 40, 62, 88):
		s.oak(x, int(hl[x]) + 1, 0.9, leaves=("#22102f", "#3b1c4a", "#170a22"), trunk=("#1a0b26", "#1a0b26"))
	hr = np.full(W, float(H))
	for x in range(380, W):
		hr[x] = 210 - ((x - 380) / 100) ** 1.5 * 40
	hr = np.round(hr / 5) * 5
	s.ridge(hr, "#2a1238", "#1a0b26", edge="#6a3466", block=5, var=0.05)
	# birds
	for (x, y) in ((170, 92), (182, 86), (196, 95), (300, 70)):
		s.rect(x, y, x + 2, y + 1, "#2a1238")
		s.rect(x + 2, y + 1, x + 3, y + 2, "#2a1238")
		s.rect(x + 3, y, x + 5, y + 1, "#2a1238")
	return s


def night():
	s = Scene(37)
	s.vgrad([(0, "#060a1c"), (0.4, "#0d1840"), (0.66, "#1b2f63"), (0.8, "#2a3f73"), (1, "#2a3f73")])
	band = np.exp(-((YS - (40 + XS * 0.25)) / 30) ** 2) * (0.6 + 0.4 * noise2d(W, H, 30, 3))
	s.add(C("#4b3f8a"), band * 0.35)
	s.stars(520, 190, 1.0, seed_off=1)
	r = np.random.default_rng(9)
	for _ in range(260):  # dense faint stars inside the band
		x = int(r.integers(0, W))
		y = int(40 + x * 0.25 + r.normal(0, 14))
		if 0 <= y < 170:
			s.px(x, y, "#c9d4ff", 0.35)
	square_moon(s, 110, 58, 26)
	# shooting star
	for k in range(26):
		s.rect(330 + k * 2, 40 + k, 332 + k * 2, 41 + k, "#ffffff", 0.05 + k * 0.03)
	h = s.peaks(184, 10, 35, 75, 45, 80, seed_off=4)
	s.mountains(h, "#2a3d6e", "#1b2a52", "#b9c9ec", "#6f84b6", snowline=128, cap=3, light="left", haze="#22356a", haze_t=0.25)
	h2 = s.profile(196, 10, 60, 8, 4, 2)
	s.ridge(h2, "#142140", "#101a33", edge="#2c4170", block=8, var=0.05)
	# village on the far shore
	houses = ((150, 16, 10), (172, 20, 12), (198, 14, 9), (232, 18, 11), (262, 16, 10), (300, 22, 12), (330, 14, 9))
	for (x, w, hh) in houses:
		g = int(h2[x + w // 2])
		s.house(x, g, w, hh, "#1c2235", "#3a2230" if x % 2 else "#2a1d2c")
	g = int(h2[287])  # bell tower
	s.rect(284, g - 30, 292, g + 1, "#1e2438")
	s.rect(283, g - 34, 293, g - 30, "#3a2230")
	s.rect(286, g - 26, 290, g - 22, "#ffcf6b")
	s.glow(288, g - 24, 14, C("#ffcf6b"), 0.4)
	for x in (20, 46, 92, 118, 372, 400, 430, 458):
		s.oak(x, int(h2[x]) + 1, 0.7, leaves=("#0f2a26", "#173a33", "#0a1f1c"), trunk=("#1a1414", "#120e0e"))
	# lake reflecting the moon and the lit windows
	wl = 214
	s.reflect(wl, H, tint="#0b1636", tint_t=0.2, darken=0.8, ripple=1.4)
	for _ in range(50):
		x, y = int(r.integers(0, W)), int(r.integers(wl + 1, H))
		s.rect(x, y, x + int(r.integers(3, 12)), y + 1, "#9fb3ff", 0.15)
	for y in range(wl + 1, H, 2):  # shimmering moon path
		d = (y - wl) / (H - wl)
		for _ in range(2 + int(3 * d)):
			x = int(110 + r.normal(0, 6 + 22 * d))
			ln = int(r.integers(2, 6 + int(10 * d)))
			s.rect(x - ln // 2, y, x + ln // 2 + 1, y + 1, "#e6ecff", 0.55 - 0.3 * d)
	# foreground shore
	xs = np.arange(W, dtype=np.float64)
	shore = 226 + np.clip((xs - 260) / 220, 0, 1) ** 1.6 * -10 + np.clip((200 - xs) / 200, 0, 1) * 0 + 34 * (1 - np.clip(xs / 120, 0, 1)) * 0
	shore = 252 - np.clip((xs - 250) / 230, 0, 1) ** 1.4 * 36 + (noise1d(W, 18, 4, 2) - 0.5) * 6
	shore = np.round(np.repeat(shore[::8], 8)[:W] / 4) * 4
	s.ridge(shore, "#0c1526", "#070d18", grass="#11223a", grass_h=3, edge="#3a5a92", block=8, var=0.06)
	s.oak(452, int(shore[452]) + 1, 1.5, leaves=("#0b1f1d", "#12302b", "#071615"), trunk=("#140f0f", "#0c0909"))
	# lamp post on the shore
	g = int(shore[380])
	s.rect(379, g - 24, 381, g + 1, "#20242e")
	s.rect(376, g - 28, 384, g - 23, "#ffd27a")
	s.glow(380, g - 25, 42, C("#ffb84a"), 0.45, 2.2)
	for x in range(0, W, 3):  # reeds
		if r.random() < 0.35:
			hh = int(r.integers(2, 7))
			s.rect(x, int(shore[x]) - hh, x + 1, int(shore[x]), "#16263f")
	for _ in range(34):  # fireflies
		x, y = int(r.integers(0, W)), int(r.integers(196, 266))
		s.glow(x, y, 5, C("#d8ff7a"), 0.5, 1.5)
		s.px(x, y, "#f3ffb8")
	return s


def ocean():
	s = Scene(41)
	wl = 98
	s.vgrad([(0, "#3a9be8"), (0.6, "#8fd3ff"), (1, "#d9f4ff")], 0, wl)
	square_sun(s, 60, 30, 18, glow_r=70, glow_s=0.5)
	s.clouds(10, 52, 0.38, (6, 3), seed_off=2, scale=50)
	# island with oak
	hi = np.full(W, float(wl))
	for x in range(330, 430):
		hi[x] = wl - 9 + abs(x - 380) ** 1.6 / 30
	hi = np.round(np.minimum(hi, wl) / 3) * 3
	s.ridge(hi, "#ecd9a0", "#d7c084", edge="#fff1c2", block=3, var=0.03, y_bottom=wl)
	s.oak(372, int(hi[372]) + 1, 0.8)
	s.oak(392, int(hi[392]) + 1, 0.6)
	# distant boat
	s.rect(180, wl - 4, 196, wl - 1, "#8b5a2b")
	s.rect(182, wl - 5, 194, wl - 4, "#a8743c")
	s.rect(187, wl - 16, 188, wl - 5, "#5a3a1c")
	s.rect(188, wl - 15, 195, wl - 7, "#f4f1e6")
	# underwater
	under = YS >= wl
	s.vgrad([(0, "#36c3e0"), (0.25, "#1d93c9"), (0.6, "#0f5e9e"), (1, "#0a2f63")], wl, H, mask=under)
	# light rays
	rays = np.zeros((H, W))
	for k in range(9):
		x0 = 30 + k * 55 + (k * 37 % 23)
		wdt = 10 + (k * 13 % 14)
		d = np.abs((XS - x0) - (YS - wl) * 0.35)
		rays += np.clip(1 - d / wdt, 0, 1) * np.clip(1 - (YS - wl) / 150, 0, 1)
	s.add(C("#bff6ff"), rays * under * 0.22)
	# surface band
	for x in range(W):
		y = wl + int(round(math.sin(x * 0.18) * 1.2))
		s.rect(x, y - 1, x + 1, y + 1, "#e8fdff")
		s.rect(x, y + 1, x + 1, y + 2, "#7ee3f5")
	# sand floor
	hs = s.profile(246, 10, 70, 6, 2, 5)
	s.ridge(hs, "#d9c38c", "#a08a58", edge="#f0dfa8", block=6, var=0.05, haze="#1f6fa8", haze_t=0.18)
	r = np.random.default_rng(3)
	# kelp
	for x in (22, 30, 96, 104, 266, 452, 460):
		base = int(hs[x])
		hgt = int(r.integers(60, 120))
		for yy in range(base - hgt, base):
			off = int(round(math.sin(yy * 0.12 + x) * 2))
			s.rect(x + off, yy, x + off + 2, yy + 1, "#2e8a4a")
			if yy % 9 == 0:
				s.rect(x + off + 2, yy, x + off + 5, yy + 2, "#3fae5a")
	# corals (minecraft-ish palette)
	corals = [("#3d5bf2", "#6f88ff"), ("#e2559a", "#ff8cc2"), ("#a64ae0", "#cf86ff"), ("#e53b2c", "#ff7a63"), ("#e6c832", "#ffe873")]
	for i, x in enumerate((60, 140, 180, 214, 300, 330, 380, 420)):
		base = int(hs[x])
		c0, c1 = corals[i % len(corals)]
		kind = i % 3
		if kind == 0:  # brain/fan block
			s.rect(x - 7, base - 10, x + 7, base + 1, c0)
			for k in range(0, 14, 3):
				s.rect(x - 7 + k, base - 10, x - 6 + k, base + 1, c1)
		elif kind == 1:  # branching coral
			s.rect(x - 1, base - 16, x + 1, base + 1, c0)
			s.rect(x - 6, base - 11, x - 4, base - 3, c0)
			s.rect(x + 4, base - 13, x + 6, base - 4, c0)
			s.rect(x - 6, base - 4, x + 6, base - 2, c0)
			for (px, py) in ((x - 1, base - 17), (x - 6, base - 12), (x + 4, base - 14)):
				s.rect(px, py, px + 2, py + 2, c1)
		else:  # tube coral
			for dx in (-4, 0, 4):
				hh = 8 + (dx + 4)
				s.rect(x + dx - 1, base - hh, x + dx + 2, base + 1, c0)
				s.rect(x + dx - 1, base - hh, x + dx + 2, base - hh + 1, c1)
	# fish
	def fish(x, y, body, fin, flip=False):
		d = -1 if flip else 1
		s.rect(x, y, x + 8 * d if d > 0 else x + 1, y + 4, body) if d > 0 else s.rect(x - 7, y, x + 1, y + 4, body)
		tx = x - 3 if d > 0 else x + 1
		s.rect(tx, y - 1, tx + 3, y + 5, fin)
		ex = x + 6 if d > 0 else x - 6
		s.px(ex, y + 1, "#111111")
		s.rect(x + 2 if d > 0 else x - 4, y + 1, x + 3 if d > 0 else x - 3, y + 3, "#ffffff")
	fish(120, 150, "#ff8a2a", "#ffffff")
	fish(140, 160, "#ff8a2a", "#ffffff")
	fish(360, 130, "#ffd23f", "#3d5bf2", flip=True)
	fish(250, 190, "#9ec7d9", "#7aa5b8")
	fish(262, 198, "#9ec7d9", "#7aa5b8")
	# bubbles
	for _ in range(26):
		x, y = int(r.integers(0, W)), int(r.integers(wl + 8, 240))
		sz = int(r.integers(1, 3))
		s.rect(x, y, x + sz + 1, y + sz + 1, "#c9f6ff", 0.6)
		s.px(x, y, "#ffffff", 0.9)
	return s


def nether():
	s = Scene(53)
	s.vgrad([(0, "#140303"), (0.35, "#3a0909"), (0.7, "#6e1b0c"), (1, "#b2410f")])
	s.add(C("#ff6a1a"), np.clip((YS - 120) / 150, 0, 1) ** 2 * 0.35)
	# far fortress bridge
	fy = 128
	s.rect(0, fy, W, fy + 8, "#3a1016")
	s.rect(0, fy - 4, W, fy, "#42121a")
	for x in range(-10, W, 34):
		s.rect(x + 8, fy + 8, x + 18, fy + 70, "#2e0c12")
		s.rect(x + 9, fy + 8, x + 10, fy + 70, "#43141b")
	for x in range(0, W, 10):
		s.rect(x, fy - 7, x + 4, fy - 4, "#42121a")
	# haze over the fortress
	s.put(C("#5a160c"), YS >= fy - 8, 0.35)
	# netherrack cliffs left/right
	hl = np.full(W, float(H))
	for x in range(W):
		if x < 160:
			hl[x] = 90 + (x / 160) ** 1.8 * 140 + math.sin(x * 0.2) * 4
		elif x > 340:
			hl[x] = 100 + ((W - x) / 140) ** 1.7 * 130 + math.sin(x * 0.17) * 4
	hl = np.round(hl / 6) * 6
	s.ridge(hl, "#6e1d1d", "#3d0d0d", edge="#a33a2c", block=6, var=0.08)
	# glowing lava sea
	ly = 222
	lava = YS >= ly
	n = noise2d(W, H, 18, 5)
	lavac = ramp3(np.clip(n * 1.4 - 0.2, 0, 1), [(0, "#b8300a"), (0.45, "#f26a12"), (0.75, "#ffa62b"), (1, "#ffe066")])
	s.put(lavac, lava)
	for x in range(W):  # bright edge
		s.rect(x, ly, x + 1, ly + 1, "#ffd25a")
	s.glow(240, ly + 10, 260, C("#ff7a1a"), 0.25, 1.5)
	# lava falls
	for x0, y0 in ((118, 160), (372, 150)):
		top = int(hl[x0]) if hl[x0] < H else y0
		s.rect(x0, top, x0 + 6, ly, "#ff9a22")
		s.rect(x0 + 1, top, x0 + 3, ly, "#ffd45c")
		s.glow(x0 + 3, (top + ly) / 2, 30, C("#ff8a1a"), 0.25)
	# ceiling stalactites
	r = np.random.default_rng(8)
	ceil = np.zeros(W)
	for x0 in range(0, W, 6):
		ceil[x0:x0 + 6] = 10 + r.random() * 18 + (30 * r.random() if r.random() < 0.18 else 0)
	ceil = np.round(ceil / 3) * 3
	cmask = YS < ceil[None, :]
	s.put(C("#3d0b0b"), cmask)
	s.put(C("#6a1616"), (YS < ceil[None, :]) & (YS >= ceil[None, :] - 2))
	# glowstone clusters
	for gx in (70, 210, 300, 430):
		gy = int(ceil[gx]) - 2
		s.glow(gx + 5, gy + 6, 45, C("#ffd46b"), 0.45, 2.0)
		for (dx, dy) in ((0, 0), (5, 0), (2, 5), (7, 4), (4, 9)):
			s.rect(gx + dx, gy + dy, gx + dx + 5, gy + dy + 5, "#f6c95b")
			s.rect(gx + dx + 1, gy + dy + 1, gx + dx + 3, gy + dy + 3, "#fff2b0")
	# embers
	for _ in range(70):
		x, y = int(r.integers(0, W)), int(r.integers(30, 220))
		s.px(x, y, "#ffb347", 0.8)
		if r.random() < 0.3:
			s.glow(x, y, 4, C("#ff8a2a"), 0.4)
	return s


def the_end():
	s = Scene(67)
	s.vgrad([(0, "#07040d"), (0.55, "#160b24"), (1, "#24123a")])
	neb = noise2d(W, H, 60, 2)
	s.add(C("#5b2a86"), np.clip(neb - 0.45, 0, 1) * 0.55)
	s.add(C("#1c4a6e"), np.clip(noise2d(W, H, 45, 9) - 0.55, 0, 1) * 0.5)
	s.stars(420, 270, 0.9, seed_off=2)
	# main island
	top_y = 178
	iw0, iw1 = 60, 420
	prof = np.full(W, float(H + 10))
	under = np.full(W, -1.0)
	for x in range(iw0, iw1):
		t = (x - iw0) / (iw1 - iw0)
		prof[x] = top_y + 6 * math.sin(t * 9) + (abs(t - 0.5) * 2) ** 3 * 18
		under[x] = top_y + 10 + (1 - (abs(t - 0.5) * 2) ** 1.6) * 80 + 6 * math.sin(x * 0.3)
	prof = np.round(prof / 4) * 4
	under = np.round(under / 4) * 4
	isl = (YS >= prof[None, :]) & (YS <= under[None, :])
	depth = np.clip((YS - prof[None, :]) / 90, 0, 1)
	col = ramp3(depth, [(0, "#e8e6ad"), (0.08, "#d9d59a"), (0.4, "#a8a46c"), (1, "#5c5a3a")])
	jit = hash2(XS // 4, YS // 4, 3)[..., None] * 0.08 - 0.04
	s.put(col * (1 + jit), isl)
	s.put(C("#f4f2c6"), isl & (YS < prof[None, :] + 1))
	# obsidian pillars with crystals
	for (x, hgt, w) in ((110, 92, 12), (170, 120, 14), (240, 146, 16), (318, 112, 14), (378, 84, 12)):
		base = int(prof[x + w // 2]) + 2
		top = base - hgt
		s.rect(x, top, x + w, base, "#140c1e")
		s.rect(x, top, x + 2, base, "#2c1d3e")
		s.rect(x + w - 2, top, x + w, base, "#0b0612")
		for yy in range(top + 3, base, 7):
			s.rect(x + 3, yy, x + 5, yy + 1, "#3e2a58")
		# crystal
		cx, cy = x + w // 2, top - 9
		s.glow(cx, cy, 40, C("#ff7af0"), 0.55, 2.0)
		s.rect(cx - 5, cy - 5, cx + 5, cy + 5, "#d86bff")
		s.rect(cx - 3, cy - 3, cx + 3, cy + 3, "#ffd2ff")
		s.rect(x + 2, top - 3, x + w - 2, top, "#2b2b2b")
		s.rect(x + 3, top - 2, x + w - 3, top - 1, "#ff9d3a")
	# distant small islands with chorus plants
	for (cx, cy, w) in ((440, 92, 26), (30, 120, 18), (420, 150, 14)):
		s.rect(cx - w // 2, cy, cx + w // 2, cy + 4, "#d0cc90")
		s.rect(cx - w // 3, cy + 4, cx + w // 3, cy + 9, "#9a965f")
		s.rect(cx - w // 6, cy + 9, cx + w // 6, cy + 13, "#6e6b45")
		if w > 20:
			s.rect(cx - 1, cy - 14, cx + 2, cy, "#8a5a9c")
			s.rect(cx - 6, cy - 9, cx - 1, cy - 6, "#8a5a9c")
			s.rect(cx + 2, cy - 11, cx + 6, cy - 8, "#8a5a9c")
			for (px, py) in ((cx - 1, cy - 17), (cx - 8, cy - 11), (cx + 5, cy - 13)):
				s.rect(px, py, px + 3, py + 3, "#d9b8e8")
	# ender dragon silhouette
	dx, dy = 300, 48
	body = [(0, 0, 26, 6), (24, -3, 34, 4), (-14, 2, 0, 5), (-22, 3, -14, 5)]
	for (a, b, c, d) in body:
		s.rect(dx + a, dy + b, dx + c, dy + d, "#05030a")
	for k in range(14):  # wings
		s.rect(dx + 4 + k, dy - 2 - k, dx + 6 + k, dy, "#05030a")
		s.rect(dx + 2 - k // 2, dy - 2 - k, dx + 4 - k // 2, dy, "#05030a")
	s.rect(dx + 30, dy - 2, dx + 32, dy - 1, "#d65cff")
	s.glow(dx + 31, dy - 1.5, 6, C("#d65cff"), 0.6)
	# end particles
	r = np.random.default_rng(12)
	for _ in range(60):
		x, y = int(r.integers(0, W)), int(r.integers(0, H))
		s.px(x, y, "#e0a0ff", 0.7)
	return s


def cherry():
	s = Scene(79)
	s.vgrad([(0, "#86b9f2"), (0.35, "#c6d7f7"), (0.6, "#f8d2e4"), (0.75, "#ffe8e0"), (1, "#ffe8e0")])
	square_sun(s, 360, 60, 20, glow_col="#ffc9dc", glow_r=100, glow_s=0.5)
	s.clouds(14, 58, 0.30, (8, 4), "#ffffff", "#f5dbe8", seed_off=4, scale=60)
	sky = "#f6d6e6"
	h = s.peaks(165, 10, 35, 80, 45, 85, seed_off=3)
	s.mountains(h, "#a7a3da", "#8c86c6", "#fff8ff", "#e2d6f2", snowline=112, cap=3, light="right", haze=sky, haze_t=0.4)
	h2 = s.profile(186, 10, 70, 8, 4, 2)
	s.ridge(h2, "#8cc47a", "#79b06c", grass="#a6d690", grass_h=3, edge="#c4ebb0", block=8, var=0.05, haze=sky, haze_t=0.22)
	for _ in range(160):  # petals on the far meadow
		x = int(s.r.integers(0, W))
		y = int(h2[x] + s.r.integers(2, 16))
		s.px(x, y, "#f6b3cf", 0.8)
	for x in range(0, W, 13):
		if s.r.random() < 0.85:
			gx = x + int(s.r.integers(-4, 4))
			s.cherry(gx, int(h2[min(W - 1, max(0, gx))]) + 1, 0.5 + 0.2 * s.r.random(), haze=sky, haze_t=0.3)
	# pond with drifting petals
	wl = 199
	s.reflect(wl, H, tint="#d9a7c7", tint_t=0.22, darken=0.95, ripple=0.8)
	r = np.random.default_rng(6)
	for _ in range(36):
		x, y = int(r.integers(0, W)), int(r.integers(wl + 1, H))
		s.rect(x, y, x + int(r.integers(4, 14)), y + 1, "#ffffff", 0.3)
	for _ in range(60):
		x, y = int(r.integers(0, W)), int(r.integers(wl + 2, H))
		s.rect(x, y, x + 2, y + 1, ["#ffc8de", "#f6a9c9"][int(r.integers(0, 2))], 0.9)
	# shores with big framing trees
	xs = np.arange(W, dtype=np.float64)
	left = 198 + np.clip(xs / 190, 0, 1) ** 2.0 * 90
	right = 198 + np.clip((W - xs) / 190, 0, 1) ** 2.0 * 90
	shore = np.minimum(left, right) + (noise1d(W, 20, 7, 2) - 0.5) * 6
	shore = np.round(np.repeat(shore[::6], 6)[:W] / 3) * 3
	s.ridge(shore, "#6fb35a", "#559646", grass="#8fd27a", grass_h=4, edge="#b2e79c", block=6, var=0.05)
	s.cherry(40, int(shore[40]) + 1, 1.35)
	s.cherry(120, int(shore[120]) + 1, 0.85)
	s.cherry(440, int(shore[440]) + 1, 1.3)
	s.cherry(372, int(shore[372]) + 1, 0.8)
	# pink petal clusters on the grass (like the pink_petals block)
	for _ in range(420):
		x = int(r.integers(0, W))
		y = int(shore[x] + r.integers(2, max(3, H - shore[x])))
		if y < H:
			c = ["#ffc8de", "#f6a9c9", "#ffe1ee"][int(r.integers(0, 3))]
			s.rect(x, y, x + 2, y + 1, c)
			s.px(x + 1, y - 1, c)
	# bees and falling petals
	for (x, y) in ((150, 172), (330, 165)):
		s.rect(x, y, x + 4, y + 3, "#f5c542")
		s.rect(x + 1, y, x + 2, y + 3, "#3a2a1a")
		s.rect(x + 1, y - 2, x + 3, y, "#e8f4ff", 0.8)
	for _ in range(110):
		x, y = int(r.integers(0, W)), int(r.integers(0, 240))
		s.rect(x, y, x + 2, y + 1, "#ffb7d5", 0.9)
		s.px(x + 1, y + 1, "#f48fb9", 0.9)
	return s


def snowy():
	s = Scene(83)
	s.vgrad([(0, "#7fb2e6"), (0.45, "#b5d5f3"), (0.72, "#e3f0fc"), (1, "#eef6ff")])
	square_sun(s, 400, 48, 18, glow_col="#fff0c0", glow_r=80, glow_s=0.45)
	s.clouds(20, 60, 0.28, (8, 4), "#ffffff", "#dbe8f6", seed_off=3, scale=70)
	sky = "#d6e8f8"
	h0 = s.peaks(150, 9, 50, 95, 50, 90, seed_off=1)
	s.mountains(h0, "#9fb4cf", "#7f93b2", "#f4f8ff", "#c9d7ec", snowline=112, cap=4, haze=sky, haze_t=0.45)
	h = s.peaks(172, 8, 40, 80, 40, 70, seed_off=2)
	s.mountains(h, "#7c8ca6", "#56647e", "#ffffff", "#b9cbe6", snowline=130, cap=4, bottom="#8fa5c4", haze=sky, haze_t=0.12)
	h2 = s.profile(194, 8, 70, 8, 4, 2)
	s.ridge(h2, "#eef4fc", "#d6e2f0", edge="#ffffff", block=8, var=0.02, haze=sky, haze_t=0.1)
	for x in range(2, W, 7):
		if s.r.random() < 0.8:
			s.spruce(x + int(s.r.integers(-2, 3)), int(h2[min(W - 1, x)]) + 2, 0.5 + 0.2 * s.r.random(), snow="#f2f7ff",
				haze=sky, haze_t=0.3)
	# frozen lake
	wl = 208
	s.reflect(wl, 246, tint="#cfe5f7", tint_t=0.5, darken=0.97, ripple=0.0)
	r = np.random.default_rng(7)
	for _ in range(30):  # glints and cracks
		x, y = int(r.integers(0, W)), int(r.integers(wl + 2, 244))
		s.rect(x, y, x + int(r.integers(6, 30)), y + 1, "#ffffff", 0.55)
	for _ in range(6):
		x, y = int(r.integers(20, W - 40)), int(r.integers(wl + 6, 240))
		for k in range(8):
			s.px(x + k * 2, y + int(round(math.sin(k) * 1.5)), "#9fbfdc", 0.8)
	# snowy foreground bank with soft blue shading
	bank = 246 - np.clip((W - np.arange(W)) / 160, 0, 1) * 0 + (noise1d(W, 30, 9, 2) - 0.5) * 10
	bank = np.round(np.repeat(bank[::8], 8)[:W] / 2) * 2
	m = YS >= bank[None, :]
	t = np.clip((YS - bank[None, :]) / 24, 0, 1)[..., None]
	col = C("#ffffff") * (1 - t) + C("#d4e2f2") * t
	s.put(col, m)
	s.put(C("#c3d6ec"), m & (YS < bank[None, :] + 1) & (np.gradient(bank)[None, :] > 0))
	for x in (22, 46, 444, 466):
		s.spruce(x, int(bank[x]) + 2, 1.35, snow="#ffffff")
	# igloo
	ix, iy = 330, int(bank[330]) + 1
	for k in range(9):
		w = int(math.sqrt(max(0, 81 - k * k)) * 2.2)
		s.rect(ix - w, iy - k * 2 - 2, ix + w, iy - k * 2, "#f8fbff" if k % 2 else "#e2ebf6")
	s.rect(ix - 4, iy - 7, ix + 4, iy, "#2a3550")
	s.glow(ix, iy - 3, 16, C("#ffc46b"), 0.5)
	# snow golem with a carved pumpkin head
	gx, gy = 380, int(bank[380]) + 1
	s.rect(gx - 5, gy - 10, gx + 5, gy, "#f4f8fc")
	s.rect(gx - 4, gy - 18, gx + 4, gy - 10, "#ffffff")
	s.rect(gx + 2, gy - 18, gx + 4, gy - 10, "#e2ebf6")
	s.rect(gx - 4, gy - 26, gx + 4, gy - 18, "#e48a1c")
	s.rect(gx - 4, gy - 26, gx + 4, gy - 25, "#f2a43a")
	s.rect(gx - 3, gy - 23, gx - 1, gy - 21, "#ffd25a")
	s.rect(gx + 1, gy - 23, gx + 3, gy - 21, "#ffd25a")
	s.rect(gx - 2, gy - 20, gx + 2, gy - 19, "#ffd25a")
	s.rect(gx - 1, gy - 28, gx + 1, gy - 26, "#4f8a2b")
	s.rect(gx - 10, gy - 16, gx - 4, gy - 15, "#5a3a22")
	s.rect(gx + 4, gy - 17, gx + 10, gy - 16, "#5a3a22")
	s.glow(gx, gy - 22, 10, C("#ffb347"), 0.25)
	# snowfall
	for _ in range(240):
		x, y = int(r.integers(0, W)), int(r.integers(0, H))
		sz = 1 if r.random() < 0.7 else 2
		s.rect(x, y, x + sz, y + sz, "#ffffff", 0.85)
	return s


def desert():
	s = Scene(97)
	hor = 160
	s.vgrad([(0, "#4f9be6"), (0.45, "#8cc3ef"), (0.75, "#f2d9a6"), (1, "#f7c98a")], 0, hor + 20)
	square_sun(s, 330, 50, 24, glow_r=150, glow_s=0.6)
	# badlands mesas with terracotta stripes
	h = s.profile(hor - 10, 30, 120, 6, 6, 1, sharp=0.3)
	stripes = ["#c96a3c", "#d98b4f", "#b85a36", "#e8b07a", "#a4502f", "#c77a4c", "#d4945a"]
	m = YS >= h[None, :]
	band = ((YS - 60) // 6).astype(int) % len(stripes)
	col = np.array([C(c) for c in stripes])[band]
	col = col + (C("#f2d9a6") - col) * 0.35
	s.put(col, m)
	# pyramid (desert temple)
	px, py = 120, hor + 4
	for k in range(14):
		w = 42 - k * 3
		c = "#e4c88a" if k % 3 else "#d38c4f"
		s.rect(px - w, py - (k + 1) * 3, px + w, py - k * 3, c)
		s.rect(px + w - 3, py - (k + 1) * 3, px + w, py - k * 3, "#c9a865")
	s.rect(px - 4, py - 12, px + 4, py, "#6b4a2b")
	# dunes
	# dunes: asymmetric ridges with a sunlit face (sun on the right) and a shadow face
	h2 = s.peaks(hor + 26, 7, 8, 18, 50, 90, seed_off=11, block=4, jag=0)
	s.ridge(h2, "#f7e0aa", "#e2be80", block=4, var=0.015, haze="#f2d9a6", haze_t=0.25, y_bottom=hor + 50)
	h3 = s.peaks(228, 5, 12, 26, 70, 120, seed_off=12, block=4, jag=0)
	s.ridge(h3, "#f3d396", "#cf9d5a", block=4, var=0.015, y_bottom=250)
	h4 = s.peaks(268, 4, 10, 22, 80, 140, seed_off=13, block=4, jag=0)
	s.ridge(h4, "#edc785", "#c38a46", block=4, var=0.015)
	for hh in (h2, h3, h4):  # bright crest lines
		crest = (YS >= hh[None, :]) & (YS < hh[None, :] + 1)
		s.put(C("#fff0c8"), crest, 0.7)
	for (x, hh, fl) in ((60, 30, False), (76, 20, True), (300, 38, True), (430, 26, False)):
		s.cactus(x, int(h3[x] if x < 200 else h4[x]) + 1, hh, fl)
	for (x, hh) in ((200, 12), (380, 16)):
		s.cactus(x, int(h2[x]) + 1, hh, False)
	# dead bushes
	r = np.random.default_rng(4)
	for x in (150, 240, 350, 470):
		g = int(h4[min(W - 1, x)])
		for k in range(5):
			dx = int(r.integers(-4, 5))
			s.rect(x + dx, g - int(r.integers(3, 8)), x + dx + 1, g, "#7a5a32")
	# wind ripples on the dunes
	for _ in range(120):
		x = int(r.integers(0, W))
		y = int(r.integers(int(h3[x]) + 4, H))
		s.rect(x, y, x + int(r.integers(5, 14)), y + 1, "#c99a55", 0.45)
		s.rect(x + 1, y - 1, x + int(r.integers(4, 12)), y, "#f7dca4", 0.35)
	# desert well
	wx, wy = 236, int(h3[236]) + 1
	s.rect(wx - 9, wy - 6, wx + 9, wy + 1, "#e3cb8f")
	s.rect(wx - 9, wy - 6, wx + 9, wy - 5, "#f2e0ac")
	s.rect(wx - 6, wy - 6, wx + 6, wy - 4, "#3d7fd1")
	for px_ in (wx - 9, wx + 7):
		s.rect(px_, wy - 18, px_ + 2, wy - 6, "#c9b072")
	s.rect(wx - 10, wy - 21, wx + 10, wy - 18, "#d9bf80")
	s.rect(wx - 8, wy - 23, wx + 8, wy - 21, "#e8d39a")
	# camel with a saddle (1.20+) walking along the dune
	cx, cy = 400, int(h3[400]) + 1
	camel = "#c8955a"
	dark = "#a8763f"
	s.rect(cx - 14, cy - 22, cx + 8, cy - 12, camel)          # body
	s.rect(cx - 10, cy - 27, cx - 2, cy - 22, camel)          # hump
	s.rect(cx + 8, cy - 32, cx + 12, cy - 14, camel)          # neck
	s.rect(cx + 8, cy - 34, cx + 18, cy - 28, camel)          # head
	s.rect(cx + 16, cy - 31, cx + 19, cy - 28, dark)          # snout
	s.px(cx + 13, cy - 32, "#2a1a10")
	for lx in (cx - 13, cx - 8, cx + 1, cx + 5):              # legs
		s.rect(lx, cy - 12, lx + 3, cy + 1, dark if lx in (cx - 8, cx + 5) else camel)
	s.rect(cx - 11, cy - 24, cx - 1, cy - 20, "#b03a2e")      # saddle
	s.rect(cx - 11, cy - 20, cx - 1, cy - 18, "#e8b13a")
	s.rect(cx - 16, cy - 21, cx - 14, cy - 14, dark)          # tail
	# heat shimmer
	for y in range(hor - 2, hor + 30, 3):
		s.img[y] = np.roll(s.img[y], int(r.integers(-1, 2)), axis=0)
	return s


def aurora():
	s = Scene(101)
	s.vgrad([(0, "#030916"), (0.45, "#081a2e"), (0.7, "#0f2b43"), (1, "#133650")])
	s.stars(360, 200, 0.9, seed_off=4)
	# aurora curtains (additive)
	for (base, amp, freq, ph, cbot, ctop, k) in ((92, 26, 0.012, 0.4, "#3dffb0", "#7a5cff", 1.0),
			(120, 18, 0.018, 2.2, "#2be0ff", "#c95cff", 0.7), (70, 14, 0.02, 4.0, "#7dff8a", "#38c9ff", 0.5)):
		fy = base + amp * np.sin(XS * freq + ph) + 8 * np.sin(XS * freq * 2.7 + ph * 1.3)
		above = fy - YS
		streak = 0.35 + 0.65 * noise1d(W, 2.5, int(ph * 10), 2)[None, :] ** 1.5
		inten = np.where(above >= 0, np.exp(-above / 42) * streak, np.exp(above / 5.0)) * k
		tcol = np.clip(above / 70, 0, 1)[..., None]
		col = C(cbot) * (1 - tcol) + C(ctop) * tcol
		s.img += col * inten[..., None] * 0.55
	sky_rim = "#2f9f8a"
	h = s.peaks(190, 9, 40, 85, 45, 80, seed_off=5)
	s.mountains(h, "#1b3247", "#122436", "#7fb7c2", "#3f6a80", snowline=128, cap=3, light="left", bottom="#0f1d2c")
	h2 = s.profile(206, 10, 60, 8, 4, 2)
	s.ridge(h2, "#0b1622", "#0b1622", edge="#1f4a55", block=8, var=0.03)
	for x in range(3, W, 7):
		if s.r.random() < 0.8:
			s.spruce(x + int(s.r.integers(-2, 2)), int(h2[min(W - 1, x)]) + 2, 0.5 + 0.3 * s.r.random(), col="#08121b", dark="#060e16")
	# lake reflection
	ly = 222
	s.reflect(ly, H, tint="#06121d", tint_t=0.35, darken=0.7, ripple=1.0, src_min=40)
	for k in range(26):
		x = int(s.r.integers(0, W))
		y = int(s.r.integers(ly + 2, H))
		s.rect(x, y, x + int(s.r.integers(6, 24)), y + 1, "#7dffd0", 0.18)
	return s


SCENES = {
	"meadow": meadow, "sunset": sunset, "night": night, "ocean": ocean, "nether": nether, "the_end": the_end,
	"cherry": cherry, "snowy": snowy, "desert": desert, "aurora": aurora,
}


def main(names=None):
	out = []
	for n in names or SCENES:
		im = SCENES[n]().finish()
		out.append(save_image(im, f"textures/gui/wallpapers/{n}.png"))
	print(f"wallpapers: wrote {len(out)} files")
	return out


if __name__ == "__main__":
	main(sys.argv[1:] or None)
