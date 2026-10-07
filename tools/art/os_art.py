"""CubeOS branding: the cube logo (64x64), the 9x9 emerald price glyph, a mouse cursor and the 128x128 mod icon.

Run: python3 tools/art/os_art.py
"""
from __future__ import annotations

import numpy as np
from PIL import Image

import pixfont
from lib import Canvas, circle, pixel_gem, polygon, rgba, rrect, save_image, sprite, to_image, intersect, translate

# --------------------------------------------------------------------------------------------------
# isometric helpers (2:1 pixel-art projection)
# --------------------------------------------------------------------------------------------------


class Iso:
	"""World (x right-down, z left-down, y up) -> screen."""

	def __init__(self, ox, oy, a):
		self.ox, self.oy, self.a = ox, oy, a

	def p(self, x, y, z):
		return (self.ox + (x - z) * self.a, self.oy + (x + z) * self.a / 2 - y * self.a)

	def quad(self, *pts):
		return polygon([self.p(*q) for q in pts])


def lerp_pt(p, q, t):
	return (p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t)


def face_point(o, u, v, s, t):
	"""Point on the parallelogram with origin o and edge vectors u, v at (s, t)."""
	return (o[0] + u[0] * s + v[0] * t, o[1] + u[1] * s + v[1] * t)


def cube_logo(c: Canvas, cx: float, top: float, half: float, glow=True, outline="#0b1220"):
	"""CubeOS cube: silver top, graphite left face and a glowing screen as the right face."""
	h = half
	T = (cx, top)
	R = (cx + h, top + h / 2)
	B = (cx, top + h)
	L = (cx - h, top + h / 2)
	depth = h
	Bd = (B[0], B[1] + depth)
	Rd = (R[0], R[1] + depth)
	Ld = (L[0], L[1] + depth)
	top_f = polygon([T, R, B, L])
	left_f = polygon([L, B, Bd, Ld])
	right_f = polygon([B, R, Rd, Bd])
	sil = polygon([T, R, Rd, Bd, Ld, L])
	if glow:
		g = Canvas(c.w, c.h)
		g.paint(np.clip(1 - np.hypot(c.X - (cx + h * 0.5), c.Y - (top + h * 1.2)) / (h * 1.9), 0, 1) ** 1.6, "#3fe0ff", 0.55)
		c.blit(g, 0, 0)
	c.fill(sil, outline, aa="hard")
	inner = lambda f: (lambda X, Y: f(X, Y) + 1.0)
	c.paint(c.coverage(inner(top_f), "hard"), c.gradient([(0, "#ffffff"), (0.55, "#dbe7f7"), (1, "#9fb6d6")], "radial", T, h * 1.15))
	c.paint(c.coverage(inner(left_f), "hard"), c.gradient([(0, "#3a4659"), (1, "#1d2533")], p0=top + h / 2, p1=top + h + depth))
	# screen face: bezel + glowing gradient display
	c.fill(inner(right_f), "#0f1a33", aa="hard")
	u = (R[0] - B[0], R[1] - B[1])
	v = (0, depth)
	m = 0.13
	q = [face_point(B, u, v, m, m * 1.1), face_point(B, u, v, 1 - m, m * 1.1), face_point(B, u, v, 1 - m, 1 - m),
		face_point(B, u, v, m, 1 - m)]
	scr = polygon(q)
	c.paint(c.coverage(scr, "hard"), c.gradient([(0, "#7ff6ff"), (0.55, "#33b6ff"), (1, "#2a5cff")], "radial", (q[0][0], q[0][1]), h * 1.6))
	# glossy diagonal highlight on the screen
	g0 = [face_point(B, u, v, m, m * 1.1), face_point(B, u, v, 0.55, m * 1.1), face_point(B, u, v, m, 0.62)]
	c.fill(intersect(scr, polygon(g0)), "#ffffff", opacity=0.22, aa="hard")
	# tiny window bar + prompt line on the screen
	b0 = [face_point(B, u, v, 0.22, 0.24), face_point(B, u, v, 0.78, 0.24), face_point(B, u, v, 0.78, 0.33),
		face_point(B, u, v, 0.22, 0.33)]
	c.fill(polygon(b0), "#e8fdff", opacity=0.85, aa="hard")
	b1 = [face_point(B, u, v, 0.22, 0.48), face_point(B, u, v, 0.58, 0.48), face_point(B, u, v, 0.58, 0.56),
		face_point(B, u, v, 0.22, 0.56)]
	c.fill(polygon(b1), "#e8fdff", opacity=0.55, aa="hard")
	b2 = [face_point(B, u, v, 0.22, 0.66), face_point(B, u, v, 0.48, 0.66), face_point(B, u, v, 0.48, 0.74),
		face_point(B, u, v, 0.22, 0.74)]
	c.fill(polygon(b2), "#e8fdff", opacity=0.4, aa="hard")
	# bright top edges
	# cyan rim light along the front edges of the top face
	edge = lambda X, Y: np.abs(Y - (B[1] - np.abs(X - cx) / 2)) - 0.75
	c.fill(intersect(inner(top_f), edge), "#9ff3ff", opacity=0.9, aa="hard")
	return sil


def logo():
	c = Canvas(64, 64)
	cube_logo(c, 32, 6, 25)
	return c


def emerald_glyph():
	return to_image(pixel_gem(9, 9, cut=3))


def cursor():
	rows = [
		"B...........",
		"BB..........",
		"BWB.........",
		"BWWB........",
		"BWWWB.......",
		"BWWWWB......",
		"BWWWWWB.....",
		"BWWWWWWB....",
		"BWWWWWWWB...",
		"BWWWWWWWWB..",
		"BWWWWWWWWWB.",
		"BWWWWWWBBBBB",
		"BWWWBWWB....",
		"BWWBBWWB....",
		"BWB..BWWB...",
		"BB...BWWB...",
		"B.....BWWB..",
		"......BBB...",
	]
	return to_image(sprite(rows, {"B": "#111111", "W": "#ffffff"}))


# --------------------------------------------------------------------------------------------------
# mod icon (drawn at 64x64, saved 2x as 128x128)
# --------------------------------------------------------------------------------------------------

def mod_icon():
	c = Canvas(64, 64)
	# rounded tile background
	body = rrect(1, 1, 63, 62, 12)
	c.fill(rrect(1, 2, 63, 63, 12), "#0a0f24", aa="hard")
	c.paint(c.coverage(body, "hard"), c.gradient([(0, "#3b4fd8"), (0.5, "#27308f"), (1, "#151a4a")], p0=1, p1=62))
	c.paint(c.coverage(body, "hard"), c.gradient([(0, rgba("#5fe0ff", 0.30)), (1, rgba("#5fe0ff", 0.0))], "radial", (36, 22), 30))
	c.fill(intersect(body, lambda X, Y: Y - 3.0), "#ffffff", opacity=0.3, aa="hard")
	# little stars
	for (x, y) in ((9, 9), (54, 12), (49, 6), (12, 50), (56, 44)):
		c.fill(rrect(x, y, x + 1, y + 1, 0), "#ffffff", opacity=0.75, aa="hard")
	iso = Iso(31, 32, 1.75)
	W, D = 16, 11
	# soft shadow
	sh = Canvas(64, 64)
	sh.paint(np.clip(1 - np.hypot((c.X - 32) / 26, (c.Y - 50) / 9), 0, 1), "#000000", 0.45)
	c.blit(sh, 0, 0)
	out = "#0b0f1a"
	# base slab
	top_f = iso.quad((0, 1, 0), (W, 1, 0), (W, 1, D), (0, 1, D))
	front = iso.quad((0, 0, D), (W, 0, D), (W, 1, D), (0, 1, D))
	right = iso.quad((W, 0, 0), (W, 0, D), (W, 1, D), (W, 1, 0))
	from lib import union, offset
	base = union(top_f, front, right)
	c.fill(offset(base, 1.0), out, aa="hard")
	c.fill(front, "#9aa4b4", aa="hard")
	c.fill(right, "#7c8698", aa="hard")
	c.paint(c.coverage(top_f, "hard"), c.gradient([(0, "#eef2f8"), (1, "#c3ccd9")], p0=20, p1=50))
	# keyboard
	kb = iso.quad((1.6, 1, 1.4), (W - 1.6, 1, 1.4), (W - 1.6, 1, 6.6), (1.6, 1, 6.6))
	c.fill(kb, "#262b35", aa="hard")
	for r_ in range(4):
		for k in range(10):
			x0 = 2.0 + k * 1.24
			z0 = 1.8 + r_ * 1.2
			key = iso.quad((x0, 1, z0), (x0 + 0.9, 1, z0), (x0 + 0.9, 1, z0 + 0.8), (x0, 1, z0 + 0.8))
			c.fill(key, "#4a5262" if (r_ + k) % 7 else "#5b8cff", aa="hard")
	# trackpad
	tp = iso.quad((6.0, 1, 7.6), (10.0, 1, 7.6), (10.0, 1, 10.0), (6.0, 1, 10.0))
	c.fill(tp, "#aeb8c8", aa="hard")
	# lid (tilted back) with screen facing +z
	t = 1.6
	lid_front = iso.quad((0, 1, 0), (W, 1, 0), (W, 12, -t), (0, 12, -t))
	lid_edge = iso.quad((W, 1, 0), (W, 1, -0.9), (W, 12, -t - 0.9), (W, 12, -t))
	lid_top = iso.quad((0, 12, -t), (W, 12, -t), (W, 12, -t - 0.9), (0, 12, -t - 0.9))
	lid = union(lid_front, lid_edge, lid_top)
	c.fill(offset(lid, 1.0), out, aa="hard")
	c.fill(lid_edge, "#7c8698", aa="hard")
	c.fill(lid_top, "#d5dce7", aa="hard")
	c.fill(lid_front, "#151a24", aa="hard")
	scr = iso.quad((0.9, 1.9, -0.13), (W - 0.9, 1.9, -0.13), (W - 0.9, 11.2, -t + 0.1), (0.9, 11.2, -t + 0.1))
	p0 = iso.p(0.9, 11.2, -t)
	c.paint(c.coverage(scr, "hard"), c.gradient([(0, "#6fe6ff"), (0.6, "#2f8dff"), (1, "#3b3fd8")], "radial", p0, 34))
	# glow from the screen
	gl = Canvas(64, 64)
	gx, gy = iso.p(W / 2, 6.5, -0.8)
	gl.paint(np.clip(1 - np.hypot(c.X - gx, c.Y - gy) / 30, 0, 1) ** 2, "#56d8ff", 0.25)
	c.blit(gl, 0, 0)
	# CubeOS logo on the screen
	lx, ly = iso.p(W / 2, 9.4, -t * 0.75)
	mini = Canvas(64, 64)
	cube_logo(mini, lx, ly - 1, 6.5, glow=False)
	c.blit(mini, 0, 0)
	# taskbar on the screen
	tb = iso.quad((0.9, 1.9, -0.13), (W - 0.9, 1.9, -0.13), (W - 0.9, 2.9, -0.27), (0.9, 2.9, -0.27))
	c.fill(tb, "#0d1430", opacity=0.75, aa="hard")
	for k in range(4):
		x0 = 2.0 + k * 1.6
		ic = iso.quad((x0, 2.1, -0.16), (x0 + 1.0, 2.1, -0.16), (x0 + 1.0, 2.7, -0.24), (x0, 2.7, -0.24))
		c.fill(ic, ["#ffd23f", "#4dd0ff", "#ff6b6b", "#5dd879"][k], aa="hard")
	return c.to_image().resize((128, 128), Image.NEAREST)


def main():
	out = [
		logo().save("textures/gui/os/logo.png"),
		save_image(emerald_glyph(), "textures/gui/os/emerald.png"),
		save_image(cursor(), "textures/gui/os/cursor.png"),
		save_image(mod_icon(), "icon.png"),
	]
	print(f"os art: wrote {len(out)} files")
	return out


if __name__ == "__main__":
	main()
