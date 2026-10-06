"""16x16 item icons for the toys (magic 8-ball, confetti popper, yo-yo, fidget spinner, bouncy ball).

Shapes are rasterised analytically and shaded with a small quantised palette (top-left light), then outlined —
the result reads like hand-placed pixel art without any random noise.
"""
from __future__ import annotations

import math

from PIL import Image

from lib import c, shade, write_flat_item, write_png

LIGHT = (-0.55, -0.65, 0.52)  # towards the viewer's top-left
_ln = math.sqrt(sum(v * v for v in LIGHT))
LIGHT = tuple(v / _ln for v in LIGHT)


class Canvas:
	def __init__(self, size=16):
		self.size = size
		self.im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
		self.px = self.im.load()

	def put(self, x, y, col):
		if 0 <= x < self.size and 0 <= y < self.size and col is not None:
			self.px[x, y] = col

	def get(self, x, y):
		return self.px[x, y]

	def sphere(self, cx, cy, r, palette, band=None):
		"""Shaded sphere. palette: dark -> light. band(nx, ny, nz) may return a palette override list."""
		for y in range(self.size):
			for x in range(self.size):
				dx, dy = (x + 0.5 - cx) / r, (y + 0.5 - cy) / r
				d2 = dx * dx + dy * dy
				if d2 > 1.0:
					continue
				nz = math.sqrt(1 - d2)
				lam = max(0.0, dx * LIGHT[0] + dy * LIGHT[1] + nz * LIGHT[2])
				pal = band(dx, dy, nz) if band else palette
				idx = min(len(pal) - 1, int(round((0.15 + 0.85 * lam) * (len(pal) - 1))))
				self.put(x, y, pal[idx])

	def disc(self, cx, cy, r, col):
		for y in range(self.size):
			for x in range(self.size):
				if (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r:
					self.put(x, y, col(x, y) if callable(col) else col)

	def line(self, x0, y0, x1, y1, col):
		n = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
		for i in range(n + 1):
			t = i / max(1, n)
			self.put(int(round(x0 + (x1 - x0) * t)), int(round(y0 + (y1 - y0) * t)), col)

	def rows(self, rows, pal, ox=0, oy=0):
		for y, row in enumerate(rows):
			for x, ch in enumerate(row):
				if ch not in " .":
					self.put(ox + x, oy + y, pal[ch])

	def outline(self, col_for=None, col=None):
		src = self.im.copy().load()
		for y in range(self.size):
			for x in range(self.size):
				if src[x, y][3] != 0:
					continue
				for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
					X, Y = x + dx, y + dy
					if 0 <= X < self.size and 0 <= Y < self.size and src[X, Y][3] != 0:
						self.put(x, y, col_for(src[X, Y]) if col_for else col)
						break


def dark_of(colr):
	return shade(colr, 0.45)


# ----------------------------------------------------------------------------------------------------------------

def magic_8_ball():
	cv = Canvas()
	pal = [c("0b0b12"), c("161722"), c("232534"), c("33364b"), c("4b4f6b")]
	cv.sphere(7.5, 8.0, 6.6, pal)
	# glossy highlight
	cv.put(4, 4, c("8f95bd"))
	cv.put(5, 4, c("6b7096"))
	cv.put(4, 5, c("6b7096"))
	# the famous white "8" window
	W, w = c("f4f4f8"), c("c9cad8")
	cv.disc(8.0, 8.5, 3.4, lambda x, y: w if (x - 8) + (y - 8) > 2 else W)
	cv.rows([
		".KK.",
		"K..K",
		".KK.",
		"K..K",
		".KK.",
	], {"K": c("15151f")}, ox=6, oy=6)
	cv.outline(col=c("07070b"))
	return cv.im


def confetti_popper():
	cv = Canvas()
	T = (2.5, 13.5)
	M = (10.2, 5.8)
	ax, ay = M[0] - T[0], M[1] - T[1]
	length = math.hypot(ax, ay)
	ux, uy = ax / length, ay / length
	gold = [c("b9801c"), c("e5ad2c"), c("ffd257")]
	red = [c("a32852"), c("d6457a"), c("f07aa4")]
	for y in range(16):
		for x in range(16):
			px, py = x + 0.5 - T[0], y + 0.5 - T[1]
			t = (px * ux + py * uy) / length
			if t < 0 or t > 1:
				continue
			perp = -px * uy + py * ux
			r = 0.6 + 2.8 * t
			if abs(perp) > r:
				continue
			band = int(t * 3.6 + 0.4) % 2
			pal = red if band else gold
			k = 2 if perp < -r * 0.35 else (1 if perp < r * 0.4 else 0)
			cv.put(x, y, pal[k])
	# mouth of the popper: white paper rim around a dark opening
	cv.disc(10.5, 5.5, 2.6, c("fff4d6"))
	cv.disc(10.8, 5.2, 1.6, c("4a1f12"))
	cv.outline(col=c("3b1f10"))
	# confetti burst (after outline so the pieces float freely)
	conf = [
		(13, 1, "ff4d6d"), (15, 3, "3fa9ff"), (12, 0, "ffd23f"), (14, 6, "4fd17a"), (15, 0, "c06bff"),
		(11, 1, "4fd1d1"), (13, 4, "ffd23f"), (15, 6, "ff8a3d"), (14, 2, "ffffff"), (12, 2, "c06bff"), (9, 1, "ff4d6d"),
	]
	for x, y, h in conf:
		cv.put(x, y, c(h))
	cv.line(12, 3, 13, 2, c("ff4d6d"))
	return cv.im


def yo_yo():
	"""3/4 view: a chunky red disc pair (visible thickness + groove), string rising from the hub."""
	cv = Canvas()
	pal = [c("6e0d1c"), c("a8192b"), c("d92c3d"), c("ff7474")]
	cy, rx, ry = 10.0, 3.3, 5.3
	front_cx, back_cx, groove_cx = 6.0, 10.2, 8.1

	def inside(x, y, cx, sx=rx, sy=ry):
		dx, dy = (x + 0.5 - cx) / sx, (y + 0.5 - cy) / sy
		return dx * dx + dy * dy <= 1

	for y in range(16):
		for x in range(16):
			swept = any(inside(x, y, front_cx + (back_cx - front_cx) * t / 8) for t in range(9))
			if not swept:
				continue
			col = pal[1] if y + 0.5 < cy else pal[0]  # thickness band, lit from above
			if inside(x, y, groove_cx) and not inside(x, y, groove_cx - 0.7) and x + 0.5 > groove_cx:
				col = c("3a0710")  # the string groove between the halves
			cv.put(x, y, col)
	for y in range(16):
		for x in range(16):
			if not inside(x, y, front_cx):
				continue
			dx, dy = (x + 0.5 - front_cx) / rx, (y + 0.5 - cy) / ry
			r2 = dx * dx + dy * dy
			col = pal[1] if r2 > 0.62 else pal[2]
			if r2 > 0.62 and dx + dy < -0.6:
				col = pal[3]
			cv.put(x, y, col)
	cv.disc(front_cx, cy, 1.3, c("d9dde4"))  # hub
	cv.put(int(front_cx), int(cy), c("8a909c"))
	cv.outline(col=c("3d0710"))
	S = c("f2ecdc")
	cv.line(6, 9, 6, 3, S)  # string
	cv.rows([".SS.", "S..S", ".SS."], {"S": S}, ox=4, oy=0)  # finger loop
	return cv.im


def fidget_spinner():
	cv = Canvas()
	body = [c("1d4f91"), c("2b73c9"), c("4d9bf0"), c("8cc6ff")]
	cx, cy = 8.0, 8.0
	lobes = []
	for k in range(3):
		ang = math.radians(-90 + k * 120)
		lobes.append((cx + 4.6 * math.cos(ang), cy + 4.6 * math.sin(ang)))
	for y in range(16):
		for x in range(16):
			X, Y = x + 0.5, y + 0.5
			inside = math.hypot(X - cx, Y - cy) <= 3.0
			for (lx, ly) in lobes:
				if math.hypot(X - lx, Y - ly) <= 3.0:
					inside = True
				# arm: distance from segment centre->lobe
				vx, vy = lx - cx, ly - cy
				t = max(0.0, min(1.0, ((X - cx) * vx + (Y - cy) * vy) / (vx * vx + vy * vy)))
				if math.hypot(X - (cx + vx * t), Y - (cy + vy * t)) <= 1.9:
					inside = True
			if not inside:
				continue
			lam = -((X - cx) * 0.6 + (Y - cy) * 0.75) / 8.0
			idx = 3 if lam > 0.42 else 2 if lam > 0.05 else 1 if lam > -0.35 else 0
			cv.put(x, y, body[idx])
	steel = [c("6f7480"), c("aab0bd"), c("e8ecf3")]
	for (lx, ly) in lobes + [(cx, cy)]:
		cv.disc(lx, ly, 1.6, lambda x, y, lx=lx, ly=ly: steel[2] if (x + 0.5 - lx) + (y + 0.5 - ly) < -0.6 else steel[1])
		cv.put(int(lx), int(ly), steel[0])
	cv.outline(col=c("0d2547"))
	return cv.im


def bouncy_ball():
	cv = Canvas()
	pink = [c("a8235f"), c("e04b8e"), c("ff86bd"), c("ffc1dd")]
	yellow = [c("b8860b"), c("f2c12e"), c("ffe066"), c("fff3b0")]
	cyan = [c("146f86"), c("27a9c9"), c("5fd8f0"), c("b5f2ff")]

	def band(nx, ny, nz):
		k = int(math.floor((nx * 1.3 - ny * 0.9 + 0.35 * nz) * 1.5 + 10)) % 3
		return (pink, yellow, cyan)[k]

	cv.sphere(8.0, 8.5, 5.6, None, band=band)
	cv.put(5, 5, c("ffffff"))
	cv.put(6, 5, c("ffe6f2"))
	cv.put(5, 6, c("ffe6f2"))
	cv.outline(col=c("4a1030"))
	return cv.im


ICONS = {
	"magic_8_ball": magic_8_ball,
	"confetti_popper": confetti_popper,
	"yo_yo": yo_yo,
	"fidget_spinner": fidget_spinner,
	"bouncy_ball": bouncy_ball,
}


def build_all():
	for item, fn in ICONS.items():
		tex = f"item/toys/{item}"
		write_png(tex, fn())
		write_flat_item(item, tex)
