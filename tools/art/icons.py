"""CubeOS icons (32x32): app tiles, site tiles and white UI glyphs.

App/site icons: soft rounded-square tile with a vertical gradient, a 1px top highlight, a darker
bottom lip and a crisp glyph with a soft drop shadow.  Glyph strokes are >= 2px wide so the icons stay
readable when the game draws them at 16x16 (nearest-neighbour sampling keeps one of every two texels).

Misc UI glyphs are pure white (alpha only) on a transparent background so code can tint them
(GuiGraphics.blit(..., color) multiplies the texture by the colour).

Run: python3 tools/art/icons.py
"""
from __future__ import annotations

import math

import numpy as np

import pixfont
from lib import (Canvas, arc, circle, ellipse, intersect, mask_shape, offset, polygon, rgba, ring, rotate, rrect,
	segment, subtract, translate, union, darken, pixel_gem, rng)

S = 32
CX, CY = 16.0, 15.5  # visual centre of a tile (tile body spans y 1..30, lip to 31)

WHITE = "#ffffff"


def hp(nx: float, ny: float, c: float):
	"""Half plane nx*x + ny*y <= c (normal is normalised)."""
	n = math.hypot(nx, ny)
	return lambda X, Y: (nx * X + ny * Y - c) / n


# ------------------------------------------------------------------------------------------------
# tile + glyph helpers
# ------------------------------------------------------------------------------------------------

def tile(top, bottom, texture=None) -> Canvas:
	c = Canvas(S, S)
	body = rrect(1, 1, 31, 30, 7)
	lip = rrect(1, 2, 31, 31, 7)
	# faint dark outline so tiles read on light backgrounds
	c.fill(offset(lip, 0.6), "#000000", opacity=0.22)
	c.fill(lip, darken(bottom, 0.35))
	c.fill_grad(body, [(0, top), (1, bottom)], p0=1, p1=30)
	if texture is not None:
		texture(c, body)
	# top highlight line + gentle gloss in the upper half
	hl = subtract(body, translate(body, 0, 1.2))
	c.fill(hl, WHITE, opacity=0.45)
	gloss = intersect(body, rrect(1, 1, 31, 15, 7))
	c.paint(c.coverage(gloss), c.gradient([(0, rgba(WHITE, 0.10)), (1, rgba(WHITE, 0.0))], p0=1, p1=16))
	return c


def glyph(c: Canvas, shape, color=WHITE, shadow=0.28, shadow_color="#000000", sharp=1.6, grad=None, aa="ss"):
	"""Draw a glyph shape with a 1px soft drop shadow."""
	if shadow:
		c.fill(translate(shape, 0, 1), shadow_color, opacity=shadow, sharp=sharp, aa=aa)
	if grad is not None:
		c.paint(c.coverage(shape, aa, sharp=sharp), c.gradient(grad[0], p0=grad[1], p1=grad[2]))
	else:
		c.fill(shape, color, sharp=sharp, aa=aa)


def pixel_glyph(c: Canvas, mask: np.ndarray, x: int, y: int, color, shadow=0.28):
	"""Hard-edged pixel mask (bool array) placed at x,y."""
	full = np.zeros((S, S), dtype=bool)
	h, w = mask.shape
	full[y:y + h, x:x + w] = mask
	shape = mask_shape(full)
	if shadow:
		c.fill(translate(shape, 0, 1), "#000000", opacity=shadow, aa="hard")
	c.fill(shape, color, aa="hard")


# ------------------------------------------------------------------------------------------------
# reusable glyph shapes
# ------------------------------------------------------------------------------------------------

def gear(cx, cy, r_body=8.2, r_tip=12.0, teeth=8, hole=3.6, tooth_w=4.6):
	parts = [circle(cx, cy, r_body)]
	for k in range(teeth):
		t = rrect(cx - tooth_w / 2, cy - r_tip, cx + tooth_w / 2, cy - r_body + 2, 1.0)
		parts.append(rotate(t, k * 360 / teeth, cx, cy))
	return subtract(union(*parts), circle(cx, cy, hole))


def folder_shapes(x0=5, y0=7, x1=27, y1=26):
	tab = rrect(x0, y0, x0 + 9, y0 + 5, 1.6)
	back = rrect(x0, y0 + 2.5, x1, y1, 2)
	front = rrect(x0, y0 + 6, x1, y1, 2)
	return tab, back, front


def envelope(x0, y0, x1, y1):
	return rrect(x0, y0, x1, y1, 2)


def emerald_gem(cx, cy, w, h):
	"""Faceted emerald silhouette (elongated octagon)."""
	hw, hh = w / 2, h / 2
	cut = min(hw, hh) * 0.55
	return polygon([(cx - hw + cut, cy - hh), (cx + hw - cut, cy - hh), (cx + hw, cy - hh + cut), (cx + hw, cy + hh - cut),
		(cx + hw - cut, cy + hh), (cx - hw + cut, cy + hh), (cx - hw, cy + hh - cut), (cx - hw, cy - hh + cut)])


def draw_emerald(c: Canvas, x: int, y: int, w: int, h: int, shadow=0.3):
	"""Crisp pixel emerald with its top-left corner at (x, y)."""
	g = pixel_gem(w, h)
	full = np.zeros((S, S, 4))
	full[y:y + h, x:x + w] = g
	a = full[..., 3]
	if shadow:
		sh = np.zeros_like(a)
		sh[1:] = a[:-1]
		c.paint(sh, "#000000", shadow)
	c.paint(a, full)


def play_triangle(cx, cy, size):
	h = size
	w = size * 0.88
	tri = polygon([(cx - w * 0.42, cy - h / 2), (cx - w * 0.42, cy + h / 2), (cx + w * 0.58, cy)])
	return offset(_shrink(tri, 1.0), 1.0)


def _shrink(f, d):
	return lambda X, Y: f(X, Y) + d


def star(cx, cy, r_out, r_in, rot=-90):
	pts = []
	for k in range(10):
		r = r_out if k % 2 == 0 else r_in
		a = math.radians(rot + k * 36)
		pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
	return polygon(pts)


def check(cx, cy, s, w):
	return union(segment(cx - s * 0.55, cy, cx - s * 0.15, cy + s * 0.42, w), segment(cx - s * 0.15, cy + s * 0.42, cx + s * 0.6, cy - s * 0.42, w))


def cross(cx, cy, s, w):
	return union(segment(cx - s, cy - s, cx + s, cy + s, w), segment(cx - s, cy + s, cx + s, cy - s, w))


# ------------------------------------------------------------------------------------------------
# app icons
# ------------------------------------------------------------------------------------------------

def icon_settings():
	c = tile("#b4bdc9", "#5f6b7c")
	glyph(c, gear(CX, CY, r_body=7.6, r_tip=11.6, hole=3.3, tooth_w=4.4))
	return c


def icon_notepad():
	c = tile("#ffe680", "#f5a623")
	page = rrect(8, 5, 24, 27, 2.2)
	glyph(c, page, "#fffdf7", shadow=0.25)
	band = intersect(page, rrect(0, 0, 32, 10.5, 0))
	c.fill(band, "#ff6b5e", sharp=1.6)
	for x in (11, 15, 19):  # spiral rings
		c.fill(rrect(x, 3.6, x + 2, 7.6, 1), "#5b6573", sharp=1.6)
	for y in (13.5, 17.5, 21.5):
		c.fill(rrect(10.5, y, 21.5, y + 1.6, 0.6), "#9db4cc", sharp=1.4)
	# pencil (vertical construction rotated so the tip points down-left)
	ang, ox, oy = 32, 23, 16
	R = lambda f: rotate(f, ang, ox, oy)
	pen = R(rrect(21, 4.5, 25, 21, 0.8))
	tip = R(polygon([(21, 21), (25, 21), (23, 26.5)]))
	c.fill(translate(union(pen, tip), 0, 1), "#000000", opacity=0.25)
	c.fill(pen, "#3a7bd5", sharp=1.6)
	c.fill(intersect(pen, R(rrect(21, 4, 22.8, 22, 0))), "#6aa6f5", sharp=1.6)
	c.fill(tip, "#f5d3a1", sharp=1.6)
	c.fill(intersect(tip, R(rrect(20, 24.4, 26, 28, 0))), "#2d2d2d", sharp=1.6)
	c.fill(intersect(pen, R(rrect(20, 4, 26, 7.5, 0))), "#ff8fa3", sharp=1.6)
	c.fill(intersect(pen, R(rrect(20, 7.5, 26, 8.8, 0))), "#cfd8e3", sharp=1.6)
	return c


def icon_calculator():
	c = tile("#ffb85c", "#f2661c")
	for x0, y0 in ((4.5, 4.5), (16.5, 4.5), (4.5, 16), (16.5, 16)):
		c.fill(rrect(x0, y0, x0 + 11, y0 + 11, 3), "#ffffff", opacity=0.16)
	c.fill(rrect(16.5, 16, 27.5, 27, 3), "#ffffff", opacity=0.22)
	pl = union(rrect(6.2, 8.8, 13.8, 11.2, 1), rrect(8.8, 6.2, 11.2, 13.8, 1))
	mi = rrect(18.2, 8.8, 25.8, 11.2, 1)
	tm = union(segment(7.4, 18.6, 12.6, 23.8, 1.25), segment(7.4, 23.8, 12.6, 18.6, 1.25))
	eq = union(rrect(18.2, 17.9, 25.8, 20.3, 1), rrect(18.2, 21.8, 25.8, 24.2, 1))
	glyph(c, union(pl, mi, tm, eq))
	return c


def icon_files():
	c = tile("#5aa2ff", "#2350d8")
	tab, back, front = folder_shapes(5, 7, 27, 26)
	c.fill(translate(union(tab, back), 0, 1), "#000000", opacity=0.3)
	c.fill(union(tab, back), "#e8a21a", sharp=1.6)
	c.fill(translate(front, 0, 0.0), "#000000", opacity=0.0)
	c.paint(c.coverage(front, sharp=1.6), c.gradient([(0, "#ffe08a"), (1, "#ffc53d")], p0=13, p1=26))
	c.fill(subtract(front, translate(front, 0, 1.1)), "#fff4cc", opacity=0.9, sharp=1.6)
	return c


def icon_terminal():
	c = tile("#4a5568", "#161b22")
	for i, col in enumerate(("#ff5f57", "#febc2e", "#28c840")):
		c.fill(rrect(6 + i * 4, 5, 9 + i * 4, 8, 1.1), col)
	c.fill(rrect(3.5, 9.6, 28.5, 10.4, 0), "#ffffff", opacity=0.10, aa="hard")
	chev = union(segment(8, 13, 13.5, 17.5, 1.35), segment(13.5, 17.5, 8, 22, 1.35))
	und = rrect(15.5, 20.5, 24, 23.2, 0.8)
	glow = union(chev, und)
	c.fill(offset(glow, 1.5), "#39ff88", opacity=0.18, aa="soft")
	glyph(c, glow, "#4dff9a", shadow=0.4)
	return c


def icon_mail():
	c = tile("#5fd4ff", "#1683e0")
	env = envelope(5, 8.5, 27, 24.5)
	glyph(c, env, "#ffffff")
	lower = union(segment(5.8, 23.8, 13.5, 17, 0.75), segment(26.2, 23.8, 18.5, 17, 0.75))
	c.fill(intersect(lower, env), "#cfe3f5", sharp=1.5)
	flap = polygon([(5.5, 9), (26.5, 9), (16, 18.2)])
	c.fill(intersect(flap, env), "#e6f1fb", sharp=1.5)
	c.fill(intersect(union(segment(5.6, 9.2, 16, 18, 0.9), segment(26.4, 9.2, 16, 18, 0.9)), env), "#7fb6e6", sharp=1.5)
	# heart seal
	h = union(circle(14.9, 15.6, 1.45), circle(17.1, 15.6, 1.45), polygon([(13.5, 16.2), (18.5, 16.2), (16, 19.2)]))
	c.fill(h, "#ff4d6d", sharp=1.6)
	return c


def icon_clock():
	c = tile("#7b78ff", "#3b2fb8")
	face = circle(CX, CY, 11.2)
	glyph(c, face, "#ffffff", shadow=0.35)
	c.fill(ring(CX, CY, 10.6, 1.2), "#dfe3ff", sharp=1.4)
	for k in range(12):
		a = math.radians(k * 30)
		r0, r1 = (7.6, 9.6) if k % 3 == 0 else (8.6, 9.6)
		w = 0.9 if k % 3 == 0 else 0.55
		c.fill(segment(CX + r0 * math.sin(a), CY - r0 * math.cos(a), CX + r1 * math.sin(a), CY - r1 * math.cos(a), w), "#3d3f6b", sharp=1.4)
	c.fill(segment(CX, CY, CX - 3.2, CY - 5.0, 1.15), "#2a2c52", sharp=1.5)   # hour ~10
	c.fill(segment(CX, CY, CX + 6.8, CY - 1.6, 0.95), "#2a2c52", sharp=1.5)   # minute ~2
	c.fill(segment(CX - 1.5, CY + 2.6, CX + 3.2, CY + 7.4, 0.5), "#ff6b3d", sharp=1.3)
	c.fill(circle(CX, CY, 1.6), "#ff6b3d", sharp=1.5)
	return c


def icon_browser():
	c = tile("#2ee6c8", "#0a74b8")
	r = 10.6
	g = union(ring(CX, CY, r - 1.0, 2.2),
		intersect(circle(CX, CY, r - 1), union(
			lambda X, Y: np.abs(ellipse(CX, CY, 4.4, r - 1)(X, Y)) - 1.0,
			rrect(CX - r, CY - 1.0, CX + r, CY + 1.0, 0),
			rrect(CX - r, CY - 6.0, CX + r, CY - 4.4, 0),
			rrect(CX - r, CY + 4.4, CX + r, CY + 6.0, 0),
		)))
	glyph(c, g)
	return c


def icon_minesweeper():
	pal = ["#5cc64a", "#6fd85a", "#4fb33e", "#82e26c", "#3f9e31", "#67cf52"]
	r = rng(7)

	def tex(c: Canvas, body):
		noise = np.zeros((S, S, 4))
		idx = r.integers(0, len(pal), (8, 8))
		for y in range(8):
			for x in range(8):
				noise[y * 4:(y + 1) * 4, x * 4:(x + 1) * 4] = rgba(pal[idx[y, x]])
		c.paint(c.coverage(body), noise, 0.9)
	c = tile("#79db5d", "#3c9a2c", texture=tex)
	face = [
		"........",
		".##..##.",
		".##..##.",
		"...##...",
		"..####..",
		"..####..",
		"..#..#..",
		"........",
	]
	m = np.array([[ch == "#" for ch in row] for row in face], dtype=bool)
	m = pixfont.scale_mask(m, 3)
	pixel_glyph(c, m, 4, 4, "#14260f", shadow=0.0)
	# subtle highlight on the face so it isn't flat black
	inner = np.zeros_like(m)
	inner[1:, :] = m[:-1, :] & m[1:, :]
	return c


def icon_snake():
	c = tile("#3a3f72", "#171936")
	# faint grid
	for k in range(5, 29, 4):
		c.fill(rrect(k - 0.25, 3, k + 0.25, 29, 0), "#ffffff", opacity=0.06, aa="soft")
		c.fill(rrect(3, k - 0.25, 29, k + 0.25, 0), "#ffffff", opacity=0.06, aa="soft")
	cells = [(1, 5), (2, 5), (3, 5), (4, 5), (4, 4), (4, 3), (3, 3), (2, 3), (2, 2), (2, 1)]
	shapes = []
	for i, (gx, gy) in enumerate(cells):
		x, y = 5 + gx * 4, 5 + gy * 4 - 4
		shapes.append(rrect(x - 3.6, y + 0.4, x + 0.4, y + 4.4, 1.2))
	body = union(*shapes)
	c.fill(offset(body, 1.2), "#7dff6a", opacity=0.15, aa="soft")
	glyph(c, body, "#7dff6a", shadow=0.4, grad=([(0, "#b6ff8a"), (1, "#3fcf4a")], 4, 26))
	hx, hy = 5 + 2 * 4 - 3.6, 5 + 1 * 4 - 4 + 0.4
	c.fill(rrect(hx + 0.8, hy + 1.0, hx + 2.0, hy + 2.2, 0.2), "#10230f", aa="hard")
	c.fill(rrect(hx + 2.2, hy + 1.0, hx + 3.4, hy + 2.2, 0.2), "#10230f", aa="hard")
	# apple
	glyph(c, circle(23.5, 9.5, 3.2), "#ff4d4d", shadow=0.35)
	c.fill(circle(22.5, 8.5, 1.0), "#ffb3b3", sharp=1.5)
	c.fill(segment(23.6, 6.3, 24.6, 4.8, 0.55), "#7a4a20", sharp=1.5)
	c.fill(ellipse(25.6, 5.6, 1.4, 0.8), "#5ee05e", sharp=1.5)
	return c


def icon_2048():
	c = tile("#cdbfb0", "#9c8b7a")
	tiles = [((5, 5), "#eee4da", "2", "#776e65"), ((16.5, 5), "#f2b179", "4", "#ffffff"),
		((5, 16.5), "#f59563", "8", "#ffffff"), ((16.5, 16.5), "#edc22e", "16", "#ffffff")]
	for (x, y), col, txt, tcol in tiles:
		t = rrect(x, y, x + 10.5, y + 10.5, 2)
		glyph(c, t, col, shadow=0.25)
		m = pixfont.small_digits(txt)
		m2 = pixfont.scale_mask(m, 2) if len(txt) == 1 else m
		h, w = m2.shape
		ox = int(round(x + 5.25 - w / 2))
		oy = int(round(y + 5.25 - h / 2))
		pixel_glyph(c, m2, ox, oy, tcol, shadow=0.0)
	return c


def icon_paint():
	c = tile("#ff8a8a", "#e0335a")
	pal = subtract(ellipse(15, 16.5, 11.2, 9.2), circle(9.3, 20.2, 2.4), polygon([(22, 26.5), (27, 19), (30, 27)]))
	glyph(c, pal, "#fff3dc", shadow=0.35)
	for (x, y), col in zip([(9.5, 12.5), (14.5, 10.2), (19.8, 11.6), (21.2, 16.6), (15.5, 20.8)],
			["#ff3b3b", "#ffcc00", "#33cc66", "#3d8bfd", "#a259ff"]):
		c.fill(circle(x, y, 2.0), col, sharp=1.6)
	brush = rotate(rrect(23.2, 9, 25.8, 26, 1.0), 28, 24.5, 17)
	c.fill(translate(brush, 0, 1), "#000000", opacity=0.25)
	c.fill(brush, "#8b5a2b", sharp=1.6)
	tipb = rotate(rrect(23.2, 6.5, 25.8, 10.5, 1.2), 28, 24.5, 17)
	c.fill(tipb, "#2b6de8", sharp=1.6)
	c.fill(rotate(rrect(23.0, 10.0, 26.0, 11.8, 0), 28, 24.5, 17), "#d9d9d9", sharp=1.6)
	return c


def icon_music():
	c = tile("#d77bff", "#7b2ff2")
	h1 = rotate(ellipse(11, 23, 3.8, 2.8), -20, 11, 23)
	h2 = rotate(ellipse(22.5, 20.5, 3.8, 2.8), -20, 22.5, 20.5)
	s1 = rrect(13.4, 8.5, 15.6, 23, 0.4)
	s2 = rrect(24.9, 6, 27.1, 20.5, 0.4)
	beam = polygon([(13.4, 8.5), (27.1, 5.2), (27.1, 9.6), (13.4, 12.9)])
	glyph(c, union(h1, h2, s1, s2, beam))
	return c


# ------------------------------------------------------------------------------------------------
# site icons
# ------------------------------------------------------------------------------------------------

def icon_bloogle():
	c = tile("#ffffff", "#dfe3e8")
	sx = 13.8
	stem = rrect(8.5, 5.5, sx + 0.5, 26.5, 1)
	top = subtract(rrect(8.5, 5.5, 21.5, 16.6, 5.0), rrect(sx, 9.4, 17.2, 12.8, 1.2))
	bot = subtract(rrect(8.5, 15.0, 23.5, 26.5, 5.4), rrect(sx, 18.8, 18.8, 22.6, 1.4))
	c.fill(translate(union(stem, top, bot), 0, 1), "#000000", opacity=0.18, sharp=1.6)
	right = hp(-1, 0, -sx)
	c.fill(intersect(top, right, hp(0, 1, 15.8)), "#ea4335", sharp=1.6)
	c.fill(intersect(bot, right, hp(0, 1, 20.7), hp(0, -1, -15.8)), "#fbbc05", sharp=1.6)
	c.fill(intersect(bot, right, hp(0, -1, -20.7)), "#34a853", sharp=1.6)
	c.fill(stem, "#4285f4", sharp=1.6)
	return c


def icon_emerazon():
	c = tile("#2f4058", "#111a26")
	draw_emerald(c, 10, 4, 12, 14, shadow=0.45)
	sm = arc(CX, 4.0, 18.0, 2.6, 236, 304)
	head = polygon([(21.6, 19.0), (27.4, 17.0), (26.0, 23.2)])
	glyph(c, union(sm, head), "#ff9900", shadow=0.35)
	return c


def icon_blocktube():
	c = tile("#ff4b4b", "#c80d0d")
	glyph(c, play_triangle(CX + 0.3, CY, 13.5), "#ffffff", shadow=0.3)
	return c


def icon_endereats():
	c = tile("#5b2a8c", "#1d0b33")
	# fork
	fork = union(rrect(6.2, 5.5, 7.6, 12, 0.6), rrect(8.6, 5.5, 10.0, 12, 0.6), rrect(11.0, 5.5, 12.4, 12, 0.6),
		rrect(6.2, 10.5, 12.4, 13.6, 1.4), rrect(8.3, 12, 10.3, 26.5, 1.0))
	glyph(c, fork, "#e9dcff", shadow=0.4)
	# eye of ender
	ex, ey = 20.5, 16.5
	c.fill(circle(ex, ey, 9.5), "#2bd48a", opacity=0.22, aa="soft")
	glyph(c, circle(ex, ey, 7.2), "#1f8a62", shadow=0.4)
	c.paint(c.coverage(circle(ex, ey, 6.0), sharp=1.6), c.gradient([(0, "#9dffd2"), (0.55, "#2fd690"), (1, "#14805a")], "radial", (ex - 1.5, ey - 1.5), 7.5))
	c.fill(ellipse(ex, ey, 1.9, 4.6), "#0b2f2a", sharp=1.6)
	c.fill(circle(ex - 2.6, ey - 2.8, 1.1), "#eafff6", sharp=1.5)
	return c


def icon_bank():
	c = tile("#3fe08a", "#0e8a4e")
	ped = polygon([(4.5, 11.5), (16, 4.2), (27.5, 11.5)])
	arch = rrect(6, 11.2, 26, 13.4, 0.4)
	cols = [rrect(x, 14.3, x + 2.6, 22.5, 0.4) for x in (7.2, 11.9, 17.5, 22.2)]
	base = union(rrect(5.5, 23.0, 26.5, 25.0, 0.4), rrect(4, 25.4, 28, 27.6, 0.6))
	glyph(c, union(ped, arch, *cols, base))
	draw_emerald(c, 13, 6, 6, 5, shadow=0)
	return c


def icon_news():
	c = tile("#7b9cc2", "#3a587d")
	paper = rrect(5, 6.5, 27, 26.5, 1.6)
	glyph(c, paper, "#fbfaf6", shadow=0.35)
	c.fill(rrect(7.5, 9, 24.5, 11.6, 0.5), "#1f2937", sharp=1.6)            # masthead
	c.fill(rrect(7.5, 12.6, 24.5, 13.4, 0), "#9aa5b4", aa="hard")          # rule
	c.fill(rrect(7.5, 15, 15, 22.5, 0.6), "#5b8fd6", sharp=1.6)              # photo
	c.fill(polygon([(7.5, 22.5), (10.5, 18.4), (13, 21), (15, 19.5), (15, 22.5)]), "#2f6d3a", sharp=1.6)
	c.fill(circle(12.6, 17.2, 1.1), "#ffe066", sharp=1.5)
	for y in (15, 18, 21):
		c.fill(rrect(16.8, y, 24.5, y + 1.5, 0.4), "#6b7280", sharp=1.5)
	c.fill(rrect(7.5, 24.0, 24.5, 24.8, 0), "#c9ced6", aa="hard")
	return c


def icon_weather():
	c = tile("#6cc8ff", "#2b74e0")
	sx, sy = 12, 11.5
	rays = union(*[segment(sx + 6.6 * math.cos(math.radians(a)), sy + 6.6 * math.sin(math.radians(a)),
		sx + 8.9 * math.cos(math.radians(a)), sy + 8.9 * math.sin(math.radians(a)), 1.0) for a in range(0, 360, 45)])
	c.fill(circle(sx, sy, 8), "#fff3a0", opacity=0.25, aa="soft")
	glyph(c, union(rays, circle(sx, sy, 5)), "#ffd23f", shadow=0.25)
	c.fill(circle(sx - 1.2, sy - 1.3, 2.4), "#fff0a6", sharp=1.5)
	cloud = union(circle(13.5, 20.5, 4.4), circle(19.5, 17, 5.6), circle(24.6, 21.2, 3.8), rrect(9.5, 20, 28.4, 25.5, 2.8))
	glyph(c, cloud, "#ffffff", shadow=0.3)
	c.fill(intersect(cloud, rrect(0, 23.4, 32, 32, 0)), "#dde9f7", sharp=1.5)
	return c


def _bird_shapes():
	head = circle(19.0, 10.6, 4.9)
	body = rotate(ellipse(15.0, 17.6, 5.4, 7.6), 32, 15.0, 17.6)
	tail = polygon([(10.5, 20.5), (14.8, 23.8), (8.6, 29.4), (6.2, 28.2)])
	crest = rotate(ellipse(16.4, 5.4, 1.3, 3.0), -40, 16.4, 5.4)
	wing = rotate(ellipse(14.2, 17.2, 2.6, 5.2), 30, 14.2, 17.2)
	beak = polygon([(22.6, 8.0), (27.4, 9.4), (26.6, 13.6), (23.6, 12.6)])
	jaw = polygon([(23.4, 11.3), (26.4, 12.3), (26.3, 13.8), (23.6, 12.8)])
	return union(head, body, tail, crest), wing, beak, jaw


def _draw_bird(c: Canvas, body_col, wing_col, eye_col, aa="ss", grad=None):
	bird, wing, beak, jaw = _bird_shapes()
	if grad:
		c.paint(c.coverage(bird, aa, sharp=1.6), c.gradient(grad, p0=4, p1=30))
	else:
		c.fill(bird, body_col, sharp=1.6, aa=aa)
	c.fill(beak, "#ffb21e", sharp=1.6, aa=aa)
	c.fill(jaw, "#d87400", sharp=1.6, aa=aa)
	c.fill(circle(19.6, 9.5, 1.15), eye_col, sharp=1.6, aa=aa)
	c.fill(subtract(wing, translate(wing, 0.8, -1.2)), wing_col, sharp=1.6, aa=aa)


def draw_squawker_bird(blue=True) -> Canvas:
	"""The Squawker parrot on a transparent canvas (used by the wordmark)."""
	c = Canvas(S, S)
	if blue:
		_draw_bird(c, None, "#c4ecff", "#0b2440", aa="hard", grad=[(0, "#8fdcff"), (1, "#1d8fe0")])
	else:
		_draw_bird(c, "#ffffff", "#9ccff7", "#14365c", aa="hard")
	return c


def icon_squawker():
	c = tile("#45c3ff", "#1878e8")
	bird, _, _, _ = _bird_shapes()
	c.fill(translate(bird, 0, 1), "#000000", opacity=0.3, sharp=1.6)
	_draw_bird(c, "#ffffff", "#9ccff7", "#14365c")
	return c


# ------------------------------------------------------------------------------------------------
# white UI glyphs
# ------------------------------------------------------------------------------------------------

def blank():
	return Canvas(S, S)


def white(shape, sharp=1.6):
	c = blank()
	c.fill(shape, WHITE, sharp=sharp)
	return c


def g_folder():
	tab, back, front = folder_shapes(4, 6, 28, 26)
	return white(union(subtract(union(tab, back), offset(front, 1.2)), front))


def page(x0=7, y0=4, x1=25, y1=28, ear=6.5):
	return polygon([(x0, y0), (x1 - ear, y0), (x1, y0 + ear), (x1, y1), (x0, y1)])


def page_outline():
	p = offset(page(), 0)
	inner = page(9.4, 6.4, 22.6, 25.6, 5.0)
	ear = polygon([(25 - 6.5, 4), (25 - 6.5, 4 + 6.5), (25, 4 + 6.5)])
	return union(subtract(p, inner, ear), offset(ear, -0.0))


def g_file_text():
	lines = union(*[rrect(11.5, y, 20.5 if i % 2 else 18, y + 2, 0.6) for i, y in enumerate((13.5, 17.5, 21.5))])
	return white(union(page_outline(), lines))


def g_file_image():
	mount = intersect(polygon([(9.5, 25.5), (14, 17.5), (17, 21.5), (19.5, 18.5), (22.5, 25.5)]), page(9.4, 6.4, 22.6, 25.6, 5.0))
	sun = circle(13.5, 12.8, 2.2)
	return white(union(page_outline(), mount, sun))


def g_trash():
	lid = rrect(6, 7, 26, 9.6, 1)
	handle = subtract(rrect(12.5, 4, 19.5, 8, 1.4), rrect(14.6, 6, 17.4, 8, 0))
	body = polygon([(8, 11), (24, 11), (22.4, 28), (9.6, 28)])
	body = offset(_shrink(body, 0.8), 0.8)
	slots = union(*[rrect(x - 0.9, 14, x + 0.9, 25, 0.9) for x in (12.6, 16, 19.4)])
	return white(union(lid, handle, subtract(body, slots)))


def g_power():
	a = arc(16, 17, 9.2, 2.6, 120, 60)
	bar = segment(16, 5.2, 16, 15, 1.4)
	return white(union(a, bar, circle(16 + 9.2 * math.cos(math.radians(60)), 17 - 9.2 * math.sin(math.radians(60)), 1.3),
		circle(16 + 9.2 * math.cos(math.radians(120)), 17 - 9.2 * math.sin(math.radians(120)), 1.3)))


def g_lock():
	shackle = intersect(ring(16, 12.5, 6.0, 2.6), rrect(0, 0, 32, 14, 0))
	legs = union(rrect(8.7, 12, 11.3, 15, 0), rrect(20.7, 12, 23.3, 15, 0))
	body = rrect(7, 14, 25, 28, 2.5)
	hole = union(circle(16, 19.6, 2.0), rrect(15.1, 19.6, 16.9, 24.6, 0.6))
	return white(union(shackle, legs, subtract(body, hole)))


def g_user():
	head = circle(16, 10.5, 5.6)
	sh = intersect(ellipse(16, 28.5, 11, 10.5), rrect(0, 0, 32, 28, 0))
	return white(union(head, subtract(sh, offset(head, 1.6))))


def g_search():
	return white(union(ring(13.5, 13.5, 7.2, 2.8), segment(19.2, 19.2, 26, 26, 1.8)))


def g_cart():
	handle = union(segment(3.5, 6.5, 7.2, 6.5, 1.2), segment(7.2, 6.5, 10.4, 21, 1.2))
	basket = polygon([(8.4, 9.5), (28, 9.5), (25.4, 19.8), (10.6, 19.8)])
	slits = union(rrect(11, 12.6, 25.6, 13.6, 0), rrect(11.6, 15.8, 25, 16.8, 0))
	rail = segment(10.4, 21.5, 25, 21.5, 1.1)
	wheels = union(circle(12.4, 25.8, 2.3), circle(23.2, 25.8, 2.3))
	return white(union(handle, subtract(basket, slits), rail, wheels))


def g_wifi():
	parts = [circle(16, 25, 2.4)]
	for r in (6.6, 12.0, 17.4):
		parts.append(arc(16, 25.5, r, 2.8, 42, 138))
	return white(union(*parts))


def g_volume():
	spk = polygon([(4.5, 12.4), (9.6, 12.4), (16, 6), (16, 26), (9.6, 19.6), (4.5, 19.6)])
	spk = offset(_shrink(spk, 0.6), 0.6)
	w1 = arc(16.5, 16, 5.2, 2.4, -42, 42)
	w2 = arc(16.5, 16, 10.2, 2.4, -46, 46)
	return white(union(spk, w1, w2))


def g_bell():
	dome = union(circle(16, 13.5, 7.4), rrect(8.6, 13.5, 23.4, 21, 0))
	flare = polygon([(8.6, 19), (23.4, 19), (27, 23.6), (5, 23.6)])
	base = rrect(4.6, 22.4, 27.4, 25, 1.2)
	knob = circle(16, 5.6, 1.8)
	clap = intersect(circle(16, 26.2, 3.2), rrect(0, 25.6, 32, 32, 0))
	return white(union(dome, flare, base, knob, clap))


def g_home():
	roof = polygon([(16, 4), (29, 15.5), (25.6, 15.5), (25.6, 28), (6.4, 28), (6.4, 15.5), (3, 15.5)])
	roof = offset(_shrink(roof, 0.7), 0.7)
	door = rrect(13.2, 19, 18.8, 28.5, 1.2)
	chim = rrect(21, 5.5, 24, 11, 0.4)
	return white(union(subtract(roof, door), chim))


def g_back():
	return white(union(segment(8.5, 16, 25, 16, 1.5), segment(8, 16, 15.5, 8.5, 1.5), segment(8, 16, 15.5, 23.5, 1.5)))


def g_forward():
	return white(union(segment(7, 16, 23.5, 16, 1.5), segment(24, 16, 16.5, 8.5, 1.5), segment(24, 16, 16.5, 23.5, 1.5)))


def g_reload():
	# clockwise arrow (like a browser reload button): ring with a gap at the top right, arrowhead at
	# the top end pointing clockwise into the gap
	cx, cy, r = 16, 16.8, 9.0
	a = arc(cx, cy, r, 2.8, 100, 36)
	th = math.radians(100)
	ex, ey = cx + r * math.cos(th), cy - r * math.sin(th)
	tx, ty = math.sin(th), math.cos(th)          # clockwise tangent (screen space)
	nx, ny = math.cos(th), -math.sin(th)         # outward normal
	tip = (ex + tx * 5.0, ey + ty * 5.0)
	b1 = (ex + nx * 4.6 - tx * 0.6, ey + ny * 4.6 - ty * 0.6)
	b2 = (ex - nx * 4.6 - tx * 0.6, ey - ny * 4.6 - ty * 0.6)
	head = polygon([b1, tip, b2])
	return white(union(a, offset(_shrink(head, 0.4), 0.4)))


def g_star():
	return white(offset(_shrink(star(16, 16.8, 13.2, 5.6), 0.8), 0.8))


def g_bookmark():
	b = polygon([(8.5, 4.5), (23.5, 4.5), (23.5, 28), (16, 21.2), (8.5, 28)])
	return white(offset(_shrink(b, 1.0), 1.0))


def g_info():
	return white(subtract(circle(16, 16, 12.5), circle(16, 9.8, 1.9), rrect(14.3, 13.4, 17.7, 23.6, 0.8)))


def g_error():
	return white(subtract(circle(16, 16, 12.5), cross(16, 16, 4.6, 1.5)))


def g_success():
	return white(subtract(circle(16, 16, 12.5), check(16, 16.4, 12, 1.6)))


def g_warning():
	tri = offset(_shrink(polygon([(16, 3.5), (29.5, 27.5), (2.5, 27.5)]), 2.0), 2.0)
	return white(subtract(tri, rrect(14.4, 11, 17.6, 20, 1.2), circle(16, 23.4, 1.75)))


def g_play():
	return white(play_triangle(16.6, 16, 20))


def g_pause():
	return white(union(rrect(8, 6, 13.6, 26, 1.4), rrect(18.4, 6, 24, 26, 1.4)))


# ------------------------------------------------------------------------------------------------
# coloured variants of a few glyphs (extra, optional for code: icons/<name>_color.png)
# ------------------------------------------------------------------------------------------------

def color_folder():
	c = Canvas(S, S)
	tab, back, front = folder_shapes(4, 6, 28, 26)
	c.fill(translate(union(tab, back), 0, 1), "#000000", opacity=0.25)
	c.fill(union(tab, back), "#e39b17", sharp=1.6)
	c.paint(c.coverage(front, sharp=1.6), c.gradient([(0, "#ffe08a"), (1, "#ffbf2e")], p0=12, p1=26))
	c.fill(subtract(front, translate(front, 0, 1.1)), "#fff4cc", opacity=0.9, sharp=1.6)
	return c


def color_page(kind: str):
	c = Canvas(S, S)
	p = page()
	c.fill(translate(p, 0, 1), "#000000", opacity=0.22)
	c.paint(c.coverage(p, sharp=1.6), c.gradient([(0, "#ffffff"), (1, "#e6ebf2")], p0=4, p1=28))
	c.fill(subtract(offset(p, 0.0), offset(p, -1.0)), "#9aa7b8", sharp=1.6)
	ear = polygon([(25 - 6.5, 4), (25 - 6.5, 4 + 6.5), (25, 4 + 6.5)])
	c.fill(ear, "#c5cfdc", sharp=1.6)
	if kind == "text":
		for i, y in enumerate((13.5, 17.5, 21.5)):
			c.fill(rrect(10.5, y, 21.5 if i % 2 else 18.5, y + 2, 0.6), "#5b7fb4", sharp=1.6)
	else:
		win = rrect(9.5, 12, 22.5, 25, 1)
		c.fill(win, "#7cc4ff", sharp=1.6)
		c.fill(intersect(win, polygon([(9, 25.5), (13.5, 18.5), (16.5, 22), (19, 19.5), (23, 25.5)])), "#3faa52", sharp=1.6)
		c.fill(circle(13.2, 15.4, 1.8), "#ffd23f", sharp=1.6)
	return c


def color_status(kind: str):
	c = Canvas(S, S)
	cols = {"info": ("#5aa9ff", "#2563eb"), "error": ("#ff6b6b", "#d62839"), "success": ("#4ade80", "#16a34a"),
		"warning": ("#ffd166", "#f59e0b")}[kind]
	if kind == "warning":
		shape = offset(_shrink(polygon([(16, 3.5), (29.5, 27.5), (2.5, 27.5)]), 2.0), 2.0)
	else:
		shape = circle(16, 16, 12.5)
	c.fill(translate(shape, 0, 1), "#000000", opacity=0.25)
	c.paint(c.coverage(shape, sharp=1.6), c.gradient([(0, cols[0]), (1, cols[1])], p0=3, p1=29))
	c.fill(subtract(shape, translate(shape, 0, 1.2)), "#ffffff", opacity=0.35, sharp=1.6)
	sym = {"info": union(circle(16, 9.8, 1.9), rrect(14.3, 13.4, 17.7, 23.6, 0.8)), "error": cross(16, 16, 4.6, 1.5),
		"success": check(16, 16.4, 12, 1.6), "warning": union(rrect(14.4, 11, 17.6, 20, 1.2), circle(16, 23.4, 1.75))}[kind]
	c.fill(sym, "#3b2a00" if kind == "warning" else "#ffffff", sharp=1.6)
	return c


APPS = {
	"settings": icon_settings, "notepad": icon_notepad, "calculator": icon_calculator, "files": icon_files,
	"terminal": icon_terminal, "mail": icon_mail, "clock": icon_clock, "browser": icon_browser,
	"minesweeper": icon_minesweeper, "snake": icon_snake, "game2048": icon_2048, "paint": icon_paint, "music": icon_music,
}
SITES = {
	"bloogle": icon_bloogle, "emerazon": icon_emerazon, "blocktube": icon_blocktube, "endereats": icon_endereats,
	"bank": icon_bank, "news": icon_news, "weather": icon_weather, "squawker": icon_squawker,
}
MISC = {
	"folder": g_folder, "file_text": g_file_text, "file_image": g_file_image, "trash": g_trash, "power": g_power,
	"lock": g_lock, "user": g_user, "search": g_search, "cart": g_cart, "wifi": g_wifi, "volume": g_volume,
	"bell": g_bell, "home": g_home, "back": g_back, "forward": g_forward, "reload": g_reload, "star": g_star,
	"bookmark": g_bookmark, "info": g_info, "error": g_error, "success": g_success, "warning": g_warning,
	"play": g_play, "pause": g_pause,
}
EXTRAS = {
	"folder_color": color_folder,
	"file_text_color": lambda: color_page("text"),
	"file_image_color": lambda: color_page("image"),
	"info_color": lambda: color_status("info"),
	"error_color": lambda: color_status("error"),
	"success_color": lambda: color_status("success"),
	"warning_color": lambda: color_status("warning"),
}


def main():
	out = []
	for group in (APPS, SITES, MISC, EXTRAS):
		for name, fn in group.items():
			out.append(fn().save(f"textures/gui/icons/{name}.png"))
	print(f"icons: wrote {len(out)} files")
	return out


if __name__ == "__main__":
	main()
