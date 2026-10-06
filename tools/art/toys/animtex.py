"""Animated block textures for the decor blocks (lava lamp wax, disco mirrors, neon tubes, spinning globe, TV + arcade
screens). Every texture is a vertical strip of square frames with a .png.mcmeta animation section."""
from __future__ import annotations

import math

from PIL import Image

from lib import FONT3x5, c, draw_text, mix, shade, text_width, write_animated


def blank(size=16):
	return Image.new("RGBA", (size, size), (0, 0, 0, 0))


# ----------------------------------------------------------------------------------------------------------------
# lava lamp: 4 side faces (4x9 each, x = 4*k) + top (4x4 at 0,10)
# ----------------------------------------------------------------------------------------------------------------

LAVA_COLORS = {
	"lava_lamp": (c("d8341f"), c("ffcf3d")),  # red liquid, golden wax
	"lava_lamp_blue": (c("2d48c8"), c("62f0ff")),
	"lava_lamp_purple": (c("6b22b8"), c("ff7ad6")),
}


def lava_frames(liquid, wax, n=24):
	frames = []
	blobs = [  # (face, x centre, phase, radius, speed)
		(0, 1.6, 0.00, 1.4, 1), (0, 2.6, 0.55, 1.0, 1),
		(1, 2.0, 0.30, 1.5, 1), (1, 1.0, 0.80, 0.9, 2),
		(2, 2.2, 0.15, 1.2, 1), (2, 1.3, 0.65, 1.3, 1),
		(3, 1.8, 0.45, 1.5, 1), (3, 2.8, 0.95, 0.9, 2),
	]
	for t in range(n):
		im = blank()
		px = im.load()
		for face in range(4):
			for y in range(9):
				for x in range(4):
					base = mix(shade(liquid, 0.8), shade(liquid, 1.18), y / 8)  # hotter (brighter) towards the bottom
					col = base
					for (bf, bx, ph, r, sp) in blobs:
						if bf != face:
							continue
						by = 4.4 - 3.9 * math.cos(2 * math.pi * (t / n * sp + ph))
						d = math.hypot(x + 0.5 - bx, (y + 0.5 - by) * 0.85)
						if d <= r:
							col = shade(wax, 1.12) if (x + 0.5 < bx and y + 0.5 < by) else wax
						elif d <= r + 0.55:
							col = mix(base, wax, 0.45)
					px[4 * face + x, y] = col
		for y in range(4):
			for x in range(4):
				px[x, 10 + y] = shade(liquid, 0.85)
		px[1, 11] = px[2, 12] = shade(wax, 0.9)
		frames.append(im)
	return frames


# ----------------------------------------------------------------------------------------------------------------
# disco ball: 2x2 px mirror tiles that scroll sideways (= spinning) with colourful glints
# ----------------------------------------------------------------------------------------------------------------

MIRROR_LAYOUT = [
	"12031230",
	"30212013",
	"02130321",
	"21302103",
	"13021320",
	"30132031",
	"02310213",
	"21023102",
]
MIRROR_PAL = [c("434c5d"), c("7d8798"), c("b4bdcb"), c("e3e8f0")]
GLINTS = [c("ffffff"), c("ff9ad5"), c("8ff3ff"), c("fff08a"), c("b8ff9a")]


def mirror_frames(n=16):
	"""2x2 bevelled mirror tiles in calm diagonal bands; a few coloured glints ride along as the ball spins."""
	frames = []
	levels = [1, 2, 3, 2]
	for t in range(n):
		im = blank()
		px = im.load()
		for y in range(16):
			for x in range(16):
				sx = (x + t) % 16  # scroll -> spin
				tx, ty = sx // 2, y // 2
				col = MIRROR_PAL[levels[(tx + 3 * ty) % 4]]
				if (tx * 3 + ty * 5) % 9 == 0:
					col = MIRROR_PAL[0]
				ix, iy = sx % 2, y % 2
				if ix == 0 and iy == 0:
					col = shade(col, 1.12)
				elif ix == 1 and iy == 1:
					col = shade(col, 0.84)
				g = (tx * 5 + ty * 7) % 13
				if g < 4 and (tx + ty) % 3 == 0:
					col = GLINTS[(g + t // 4) % len(GLINTS)]
				px[x, y] = col
		frames.append(im)
	return frames


# ----------------------------------------------------------------------------------------------------------------
# neon "OPEN" sign: 15x9 content, frame 1 = flicker (the N buzzes)
# ----------------------------------------------------------------------------------------------------------------

NEON = c("6dffb0")
NEON_DIM = c("2f9e66")
NEON_RIM = c("ff6fc4")
NEON_W, NEON_H = 19, 11  # content size inside a 32x32 frame


def neon_frame(flicker: bool):
	"""Emerald OPEN letters inside a pink tube border (rounded corners)."""
	im = blank(32)
	px = im.load()
	for x in range(1, NEON_W - 1):
		px[x, 0] = NEON_RIM
		px[x, NEON_H - 1] = NEON_RIM
	for y in range(1, NEON_H - 1):
		px[0, y] = NEON_RIM
		px[NEON_W - 1, y] = NEON_RIM
	draw_text(im, "OPE", 2, 3, NEON)
	draw_text(im, "N", 14, 3, NEON_DIM if flicker else NEON)
	return im


# ----------------------------------------------------------------------------------------------------------------
# globe: 32px equirectangular strip (4 faces x 8) scrolling 1px per frame + polar caps
# ----------------------------------------------------------------------------------------------------------------

WORLD = [
	"~~~GGGGG~~~~~~GGGGGGGGGGGGGG~~~~",
	"~~~~GGGGG~~G~~~GGGGGGGGGGGGG~~~~",
	"~~~~~GGG~~~~~~~YYYGGGGGGGGG~~~~~",
	"~~~~~~GG~~~~~~~YYYYYGGGGGG~~~~~~",
	"~~~~~~~GGG~~~~~~GYYGG~~~GG~~~~~~",
	"~~~~~~~~GGG~~~~~~GGG~~~~~~~~~~~~",
	"~~~~~~~~GG~~~~~~~G~~~~~~~GGG~~~~",
	"~~~~~~~~G~~~~~~~~~~~~~~~~~G~~~~~",
]
OCEAN = c("2f6fd6")
OCEAN_L = c("4b8ff0")
LAND = c("4fae4a")
LAND_D = c("3b8a38")
DESERT = c("d9c27a")
ICE = c("eef6ff")
ICE_D = c("c5d8ee")


def globe_frames(n=32):
	frames = []
	for t in range(n):
		im = blank(32)
		px = im.load()
		for face in range(4):
			for y in range(8):
				for x in range(8):
					wx = (8 * face + x + t) % 32
					ch = WORLD[y][wx]
					if ch == "G":
						col = LAND if (wx + y) % 3 else LAND_D
					elif ch == "Y":
						col = DESERT
					else:
						col = OCEAN_L if (wx * 3 + y * 5) % 7 == 0 else OCEAN
					if x == 0 or x == 7:
						col = shade(col, 0.82)  # fake roundness at the face edges
					elif x == 1 or x == 6:
						col = shade(col, 0.93)
					px[8 * face + x, y] = col
		# polar caps: up (0,8) and down (8,8)
		for y in range(8):
			for x in range(8):
				d = math.hypot(x - 3.5, y - 3.5)
				px[x, 8 + y] = ICE if d < 2.6 else (ICE_D if d < 3.6 else OCEAN)
				px[8 + x, 8 + y] = ICE if d < 3.3 else ICE_D
		frames.append(im)
	return frames


# ----------------------------------------------------------------------------------------------------------------
# retro TV: 9x7 screen. Static -> colour bars -> bouncing emerald -> creeper "news" -> static ...
# ----------------------------------------------------------------------------------------------------------------

def _static(seed):
	im = blank()
	px = im.load()
	s = seed * 7919 + 17
	for y in range(7):
		for x in range(9):
			s = (s * 1103515245 + 12345) & 0x7FFFFFFF
			v = 60 + (s >> 8) % 180
			px[x, y] = (v, v, v + 8 if v < 240 else v, 255)
	return im


def _bars():
	im = blank()
	px = im.load()
	cols = ["c0c0c0", "c0c000", "00c0c0", "00c000", "c000c0", "c00000", "0000c0", "1a1a1a", "f0f0f0"]
	for y in range(7):
		for x in range(9):
			px[x, y] = c(cols[x]) if y < 5 else c("101010" if x % 2 else "e0e0e0")
	return im


def _emerald(x0, y0, bg):
	im = blank()
	px = im.load()
	for y in range(7):
		for x in range(9):
			px[x, y] = bg
	gem = [".GG.", "GgGG", "GGGd", ".Gd."]
	pal = {"G": c("3ddc84"), "g": c("b8ffd6"), "d": c("17994f")}
	for y, row in enumerate(gem):
		for x, ch in enumerate(row):
			if ch != ".":
				X, Y = x0 + x, y0 + y
				if 0 <= X < 9 and 0 <= Y < 7:
					px[X, Y] = pal[ch]
	return im


def _creeper_news(blink):
	im = blank()
	px = im.load()
	for y in range(7):
		for x in range(9):
			px[x, y] = c("2a4a8a") if y < 5 else c("c8302a")  # studio + red news ticker
	face = ["GGGGG", "GKGKG" if not blink else "GGGGG", "GGKGG", "GKKKG", "GKGKG"]
	for y, row in enumerate(face):
		for x, ch in enumerate(row):
			px[2 + x, y] = c("5cae46") if ch == "G" else c("1b2a17")
	for x in range(9):
		if (x + blink) % 3 == 0:
			px[x, 6] = c("ffffff")  # ticker text
	return im


def tv_frames():
	frames = [_static(i) for i in range(4)]  # 0..3
	frames.append(_bars())  # 4
	bg = c("10162e")
	path = [(0, 0), (1, 1), (2, 2), (3, 3), (4, 2), (5, 1), (4, 0), (3, 1), (2, 2), (1, 3), (0, 2), (1, 1)]
	for (x, y) in path:  # 5..16
		frames.append(_emerald(x, y, bg))
	frames.append(_creeper_news(False))  # 17
	frames.append(_creeper_news(True))  # 18
	order = []
	order += [{"index": i % 4, "time": 1} for i in range(10)]
	order += [{"index": 4, "time": 50}]
	order += [{"index": i % 4, "time": 1} for i in range(6)]
	order += [{"index": 5 + i, "time": 4} for i in range(12)] * 2
	order += [{"index": i % 4, "time": 1} for i in range(6)]
	order += [{"index": 17, "time": 30}, {"index": 18, "time": 3}, {"index": 17, "time": 25}, {"index": 18, "time": 3}, {"index": 17, "time": 20}]
	return frames, order


# ----------------------------------------------------------------------------------------------------------------
# arcade: "Creeper Invaders" 9x9 screen
# ----------------------------------------------------------------------------------------------------------------

def arcade_frames(n=16):
	frames = []
	for t in range(n):
		im = blank()
		px = im.load()
		for y in range(9):
			for x in range(9):
				px[x, y] = c("080812")
		# stars
		for (sx, sy) in ((1, 4), (7, 6), (4, 5)):
			if (t + sx) % 4 != 0:
				px[sx, sy] = c("3a3a6a")
		march = [0, 1, 2, 1][(t // 4) % 4]
		for row in range(2):
			for k in range(3):
				x0 = march + k * 3
				y0 = row * 2 + (1 if (t // 8) % 2 else 0) * 0
				col = c("5cdc4a") if row == 0 else c("3fae3a")
				px[x0, y0] = col
				px[x0 + 1, y0] = col
				if (t // 2) % 2 == 0:
					px[x0, y0 + 1] = shade(col, 0.6)
				else:
					px[x0 + 1, y0 + 1] = shade(col, 0.6)
		ship_x = [3, 4, 5, 6, 5, 4, 3, 2, 1, 2, 3, 4, 5, 4, 3, 2][t]
		px[ship_x, 8] = c("4fd8ff")
		px[ship_x - 1 if ship_x > 0 else 0, 8] = c("2a8fd0")
		px[ship_x + 1 if ship_x < 8 else 8, 8] = c("2a8fd0")
		px[ship_x, 7] = c("bff4ff")
		shot_y = 6 - (t % 4) * 2
		if shot_y >= 2:
			px[ship_x, shot_y] = c("fff27a")
		if t % 8 == 5:  # boom!
			px[4, 1] = c("ffb03a")
			px[3, 0] = px[5, 2] = c("ff6a3a")
		frames.append(im)
	return frames


def build_all():
	for name, (liquid, wax) in LAVA_COLORS.items():
		write_animated(f"block/decor/{name}_liquid", lava_frames(liquid, wax), frametime=3, interpolate=True)
	write_animated("block/decor/disco_ball_mirror", mirror_frames(), frametime=4)
	write_animated("block/decor/neon_sign_tubes", [neon_frame(False), neon_frame(True)], frametime=2, frame_order=[
		{"index": 0, "time": 70}, {"index": 1, "time": 2}, {"index": 0, "time": 3}, {"index": 1, "time": 4},
		{"index": 0, "time": 120}, {"index": 1, "time": 3}, {"index": 0, "time": 40}])
	write_animated("block/decor/globe_map", globe_frames(), frametime=3)
	frames, order = tv_frames()
	write_animated("block/decor/retro_tv_screen", frames, frametime=2, frame_order=order)
	write_animated("block/decor/arcade_screen", arcade_frames(), frametime=3)
