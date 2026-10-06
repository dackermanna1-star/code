"""Block art: the CubeBook laptop (open/closed, animated emissive screen) and the two delivery packages.

All block textures are 32x32 (2 texels per model unit, mip-map friendly) and fully opaque (the blocks
render in the solid layer).  Models, blockstates and the laptop item model definition are written too.

Run: python3 tools/art/blocks.py
"""
from __future__ import annotations

import numpy as np

import pixfont
from lib import rgba, save_image, to_image, write_json

T = 32  # texture size
NS = "laptopcraft"


def tex(name):
	return f"{NS}:block/{name}"


# --------------------------------------------------------------------------------------------------
# tiny raster helpers (straight-alpha float arrays, opaque)
# --------------------------------------------------------------------------------------------------

def canvas(col, h=T, w=T):
	a = np.zeros((h, w, 4))
	a[:] = rgba(col)
	return a


def fill(a, x0, y0, x1, y1, col, alpha=1.0):
	"""Fill texel rect [x0,x1) x [y0,y1)."""
	c = rgba(col)
	sl = a[max(0, y0):max(0, y1), max(0, x0):max(0, x1)]
	sl[..., :3] = sl[..., :3] * (1 - alpha * c[3]) + c[:3] * alpha * c[3]
	sl[..., 3] = 1.0


def px(a, x, y, col, alpha=1.0):
	if 0 <= x < a.shape[1] and 0 <= y < a.shape[0]:
		fill(a, x, y, x + 1, y + 1, col, alpha)


def frame(a, x0, y0, x1, y1, col, alpha=1.0):
	fill(a, x0, y0, x1, y0 + 1, col, alpha)
	fill(a, x0, y1 - 1, x1, y1, col, alpha)
	fill(a, x0, y0, x0 + 1, y1, col, alpha)
	fill(a, x1 - 1, y0, x1, y1, col, alpha)


def noise(a, seed, amount=0.04, x0=0, y0=0, x1=None, y1=None, streak=False):
	r = np.random.default_rng(seed)
	x1 = x1 if x1 is not None else a.shape[1]
	y1 = y1 if y1 is not None else a.shape[0]
	h, w = y1 - y0, x1 - x0
	if streak:  # horizontal brushed-metal streaks
		n = r.normal(0, 1, (h, 1)) * 0.6 + r.normal(0, 1, (h, w)) * 0.4
	else:
		n = r.normal(0, 1, (h, w))
	a[y0:y1, x0:x1, :3] = np.clip(a[y0:y1, x0:x1, :3] * (1 + n[..., None] * amount), 0, 1)


def vgrad(a, x0, y0, x1, y1, top, bottom):
	t = np.linspace(0, 1, y1 - y0)[:, None, None]
	a[y0:y1, x0:x1, :3] = rgba(top)[:3] * (1 - t) + rgba(bottom)[:3] * t
	a[y0:y1, x0:x1, 3] = 1


def blit_mask(a, mask, x, y, col):
	h, w = mask.shape
	for j in range(h):
		for i in range(w):
			if mask[j, i]:
				px(a, x + i, y + j, col)


def save_tex(a, name):
	assert np.all(a[..., 3] > 0.999), f"{name}: block textures must be opaque"
	return save_image(to_image(a), f"textures/block/{name}.png")


# --------------------------------------------------------------------------------------------------
# laptop textures
# --------------------------------------------------------------------------------------------------

ALU = "#c4cbd5"
ALU_LIGHT = "#e2e7ee"
ALU_DARK = "#9aa3b0"

CUBE_8 = [
	"...WW...",
	".WWWWWW.",
	"LWWWWWWS",
	"LLLWWSSS",
	"LLLLSSSS",
	"LLLLSSSS",
	".LLLSSS.",
	"...LS...",
]


def cube_logo(a, x, y, glow=True):
	pal = {"W": "#f4f8ff", "L": "#3a4659", "S": "#46d6ff"} if glow else {"W": "#dfe5ee", "L": "#9aa3b0", "S": "#b3c3d6"}
	for j, row in enumerate(CUBE_8):
		for i, ch in enumerate(row):
			if ch != ".":
				px(a, x + i, y + j, pal[ch])
	if glow:
		px(a, x + 5, y + 4, "#b8f4ff")
		px(a, x + 3, y + 1, "#ffffff")


def shell():
	a = canvas(ALU)
	noise(a, 1, 0.035, streak=True)
	for y in range(0, T, 8):  # faint seams so long edges don't look flat
		fill(a, 0, y, T, y + 1, ALU_LIGHT, 0.25)
	return a


def deck():
	"""Top of the base, painted in block coordinates (texel = 2 * model unit, v = z)."""
	a = canvas(ALU)
	noise(a, 2, 0.03, streak=True)
	fill(a, 4, 7, 28, 8, ALU_LIGHT)                      # front edge highlight (z = 3.5)
	# keyboard well x 3..13, z 6.5..11.5
	fill(a, 6, 13, 26, 23, "#1d2129")
	frame(a, 6, 13, 26, 23, "#2a2f38")
	for row, y in enumerate((14, 16, 18, 20)):
		off = row % 2
		for x in range(7 + off, 25, 2):
			if row == 3 and 11 <= x <= 20:
				continue
			px(a, x, y, "#4b525e")
			px(a, x, y + 1, "#343a44")
	fill(a, 11, 20, 21, 22, "#4b525e")                    # space bar
	fill(a, 11, 21, 21, 22, "#343a44")
	px(a, 24, 14, "#5aa7ff")                              # a glowing key, for fun
	# speaker grilles
	for y in range(14, 22, 2):
		px(a, 5, y, ALU_DARK)
		px(a, 26, y, ALU_DARK)
	# trackpad x 6..10, z 4..6
	fill(a, 12, 8, 20, 12, "#b5bdc9")
	frame(a, 12, 8, 20, 12, "#9ba4b1")
	fill(a, 13, 9, 19, 10, "#c9d0da")
	return a


def bezel():
	a = canvas("#131519")
	noise(a, 3, 0.05)
	fill(a, 0, 11, T, 13, "#1b1e24")
	px(a, 16, 12, "#2c3340")                              # webcam
	px(a, 15, 12, "#0b0c0f")
	px(a, 17, 12, "#0b0c0f")
	fill(a, 0, 28, T, 32, "#1a1d22")                      # chin
	return a


def lid():
	"""Lid back/top: brushed aluminium with an engraved cube logo at (x 6..10, y 3.8..7.8 / z 6..10)."""
	a = canvas(ALU)
	noise(a, 4, 0.035, streak=True)
	frame(a, 4, 6, 28, 26, ALU_LIGHT, 0.5)
	cube_logo(a, 12, 12, glow=False)
	return a


def logo_tex():
	"""Glowing logo overlay (used by small emissive elements). Logo at texels 12..20; status LED at 0..4."""
	a = lid()
	fill(a, 12, 12, 20, 20, ALU)
	cube_logo(a, 12, 12, glow=True)
	fill(a, 0, 0, 4, 2, "#5dff8a")                         # LED colour patch
	fill(a, 1, 0, 3, 1, "#c8ffd6")
	return a


# --------------------------------------------------------------------------------------------------
# animated screen (frames 32x32; the visible screen uses the top 32x24)
# --------------------------------------------------------------------------------------------------

def desktop_base():
	a = canvas("#000000")
	vgrad(a, 0, 0, 32, 13, "#4aa6f0", "#b9e6ff")
	# sun
	fill(a, 25, 3, 28, 6, "#fff6b0")
	px(a, 25, 3, "#ffe066")
	# hills
	hills = [13, 13, 12, 12, 11, 11, 12, 12, 13, 13, 13, 12, 12, 11, 10, 10, 11, 11, 12, 12, 13, 13, 12, 12, 11, 11, 11, 12, 12, 13, 13, 13]
	for x, h in enumerate(hills):
		fill(a, x, h, x + 1, 21, "#4fae45")
		px(a, x, h, "#7fd66a")
	fill(a, 0, 17, 32, 21, "#3f9438")
	for x in range(0, 32, 4):
		px(a, x + 1, 18, "#358030")
	# desktop icons
	for y, col in ((2, "#ffc93c"), (7, "#2ee6c8"), (12, "#ff9900")):
		fill(a, 2, y, 5, y + 3, col)
		px(a, 2, y, "#ffffff", 0.5)
		fill(a, 2, y + 3, 5, y + 4, "#ffffff", 0.75)
	# taskbar
	fill(a, 0, 21, 32, 24, "#141a2b")
	fill(a, 0, 21, 32, 22, "#2a3350")
	fill(a, 1, 22, 3, 24, "#46d6ff")                       # start (cube)
	px(a, 1, 22, "#f4f8ff")
	for x, col in ((5, "#ffc93c"), (8, "#2ee6c8"), (11, "#ff9900")):
		fill(a, x, 22, x + 2, 23, col)
	for x in (25, 26, 28, 29):                              # clock
		px(a, x, 22, "#e8eefc")
	px(a, 27, 22, "#8a97b8")
	# below the visible area: dark
	fill(a, 0, 24, 32, 32, "#0a0c10")
	return a


CURSOR = ["X..", "XX.", "XWX", "XWWX", "XXXX"]


def cursor(a, x, y):
	pts = [(0, 0, "#ffffff"), (0, 1, "#ffffff"), (1, 1, "#ffffff"), (0, 2, "#ffffff"), (1, 2, "#ffffff"), (2, 2, "#ffffff"),
		(0, 3, "#ffffff"), (1, 3, "#1a1a1a")]
	for dx, dy, c in pts:
		px(a, x + dx, y + dy, c)
	px(a, x + 1, y, "#1a1a1a")
	px(a, x + 2, y + 1, "#1a1a1a")
	px(a, x + 3, y + 2, "#1a1a1a")


def window(a, x0, y0, x1, y1, content=True, highlight=-1, toast=False):
	fill(a, x0 + 1, y1, x1 + 1, y1 + 1, "#000000", 0.35)   # drop shadow
	fill(a, x1, y0 + 1, x1 + 1, y1 + 1, "#000000", 0.35)
	fill(a, x0, y0, x1, y1, "#f4f6fa")
	fill(a, x0, y0, x1, y0 + 2, "#3d8bfd")
	if x1 - x0 > 6:
		px(a, x1 - 2, y0, "#ff5f57")
		px(a, x1 - 4, y0, "#febc2e")
	if not content:
		return
	# "Emerazon" page: orange header with smile, three product tiles, text lines
	fill(a, x0, y0 + 2, x1, y0 + 4, "#232f3e")
	fill(a, x0 + 1, y0 + 3, x0 + 5, y0 + 4, "#ff9900")
	tiles = ["#e5383b", "#5c7cfa", "#2ecc71"]
	for i, col in enumerate(tiles):
		tx = x0 + 2 + i * 7
		if tx + 5 > x1:
			break
		fill(a, tx, y0 + 6, tx + 5, y0 + 10, "#ffffff")
		fill(a, tx + 1, y0 + 6, tx + 4, y0 + 9, col)
		fill(a, tx, y0 + 11, tx + 4, y0 + 12, "#9aa5b4")
		px(a, tx, y0 + 12, "#2fbf5a")
		if i == highlight:
			frame(a, tx - 1, y0 + 5, tx + 6, y0 + 13, "#ff9900")
	if toast:
		fill(a, x0 + 3, y1 - 4, x1 - 3, y1 - 1, "#2fbf5a")
		px(a, x0 + 4, y1 - 3, "#ffffff")
		px(a, x0 + 5, y1 - 2, "#ffffff")
		px(a, x0 + 6, y1 - 3, "#ffffff")
		px(a, x0 + 7, y1 - 4 + 0, "#ffffff")


def screen_frames():
	frames = []
	cur_path = [(22, 15), (16, 12), (9, 10), (4, 9)]
	for cx, cy in cur_path:                                         # 0-3: cursor travels to the Emerazon icon
		f = desktop_base()
		cursor(f, cx, cy)
		frames.append(f)
	f = desktop_base()                                              # 4: icon selected
	frame(f, 1, 11, 6, 17, "#9fd8ff")
	cursor(f, 4, 13)
	frames.append(f)
	for (x0, y0, x1, y1) in ((12, 8, 20, 13), (8, 5, 24, 16)):     # 5-6: window zooms open
		f = desktop_base()
		window(f, x0, y0, x1, y1, content=(x1 - x0) > 10)
		frames.append(f)
	for i, (cx, cy, hl, toast) in enumerate(((22, 16, -1, False), (14, 10, 1, False), (14, 10, 1, False), (14, 10, 1, True),
			(20, 6, -1, True))):                                    # 7-11: browse, pick a product, "added!"
		f = desktop_base()
		window(f, 4, 2, 28, 19, highlight=hl, toast=toast)
		cursor(f, cx, cy)
		frames.append(f)
	f = desktop_base()                                              # 12: window closes
	window(f, 10, 6, 22, 14, content=False)
	frames.append(f)
	f = desktop_base()                                              # 13: idle desktop
	cursor(f, 24, 6)
	frames.append(f)
	return frames


def screen_texture():
	frames = screen_frames()
	strip = np.concatenate(frames, axis=0)
	times = [5, 5, 5, 6, 8, 3, 3, 10, 8, 6, 10, 8, 3, 30]
	meta = {"animation": {"interpolate": False, "frametime": 6,
		"frames": [{"index": i, "time": t} for i, t in enumerate(times)]}}
	return strip, meta


# --------------------------------------------------------------------------------------------------
# package textures
# --------------------------------------------------------------------------------------------------

CARD = "#c99a5e"
CARD_DARK = "#9c7140"
CARD_LIGHT = "#ddb57c"
TAPE = "#a8763f"
TAPE_LIGHT = "#c99558"


def cardboard(seed):
	a = canvas(CARD)
	noise(a, seed, 0.05)
	r = np.random.default_rng(seed + 100)
	for _ in range(26):  # fibres / specks
		x, y = int(r.integers(0, T)), int(r.integers(0, T))
		px(a, x, y, CARD_DARK if r.random() < 0.6 else CARD_LIGHT, 0.5)
	return a


def smile(a, x, y, w=14):
	"""Orange Emerazon smile arrow, w texels wide, starting at (x, y)."""
	sag = 3
	pts = []
	for i in range(w):
		t = (i - (w - 1) / 2) / ((w - 1) / 2)
		yy = y + round(sag * (1 - t * t))
		pts.append((x + i, yy))
	for (xx, yy) in pts:
		px(a, xx, yy, "#ff9900")
		px(a, xx, yy + 1, "#e07b00")
	ex, ey = pts[-1]
	for (dx, dy) in ((0, -1), (-1, -2), (1, -1), (1, 0), (0, -2)):
		px(a, ex + dx, ey + dy, "#ff9900")


def box_top():
	"""Top face (uv 3..13 -> texels 6..26)."""
	a = cardboard(11)
	frame(a, 6, 6, 26, 26, CARD_DARK)
	fill(a, 15, 6, 17, 26, "#7d5a33")                    # flap seam
	fill(a, 13, 6, 19, 26, TAPE)                          # tape
	fill(a, 14, 6, 15, 26, TAPE_LIGHT)
	for y in range(8, 26, 5):
		px(a, 17, y, "#8e6233")
	# shipping label
	fill(a, 7, 8, 13, 16, "#f6f4ee")
	frame(a, 7, 8, 13, 16, "#d8d4c8")
	for x in (8, 9, 11, 12):
		fill(a, x, 9, x + 1, 12, "#2a2a2a")
	px(a, 10, 10, "#2a2a2a")
	fill(a, 8, 13, 12, 14, "#9aa0a8")
	fill(a, 8, 14, 11, 15, "#ff9900")
	return a


def box_front():
	"""North/south faces (uv 3..13 x 7..16 -> texels 6..26 x 14..32)."""
	a = cardboard(12)
	frame(a, 6, 14, 26, 32, CARD_DARK)
	fill(a, 13, 14, 19, 18, TAPE)                          # tape wrapping over the edge
	fill(a, 14, 14, 15, 18, TAPE_LIGHT)
	fill(a, 13, 18, 19, 19, "#8e6233")
	# printed wordmark (dashes read as tiny text) + smile
	for x in range(10, 22, 2):
		fill(a, x, 21, x + 1, 22, "#3a2a1a", 0.8)
	smile(a, 9, 23, 14)
	return a


def box_side():
	"""East/west faces: 'this side up' arrows and a fragile glass."""
	a = cardboard(13)
	frame(a, 6, 14, 26, 32, CARD_DARK)
	fill(a, 13, 14, 19, 18, TAPE)
	fill(a, 14, 14, 15, 18, TAPE_LIGHT)
	for ax in (9, 13):                                     # two up arrows
		px(a, ax + 1, 21, "#3a2a1a")
		fill(a, ax, 22, ax + 3, 23, "#3a2a1a")
		fill(a, ax + 1, 23, ax + 2, 27, "#3a2a1a")
	fill(a, 9, 28, 16, 29, "#3a2a1a")
	# wine glass
	fill(a, 19, 21, 23, 24, "#3a2a1a")
	fill(a, 20, 21, 22, 23, CARD)
	fill(a, 20, 24, 22, 25, "#3a2a1a")
	fill(a, 20, 25, 21, 28, "#3a2a1a")
	fill(a, 19, 28, 23, 29, "#3a2a1a")
	return a


def box_bottom():
	a = cardboard(14)
	frame(a, 6, 6, 26, 26, CARD_DARK)
	fill(a, 15, 6, 17, 26, "#7d5a33")
	return a


PURPLE = "#7a3fb0"
PURPLE_DARK = "#5a2a86"
PURPLE_LIGHT = "#9356c8"


def paper(seed, base=PURPLE):
	a = canvas(base)
	noise(a, seed, 0.04)
	return a


def eye(a, x, y):
	"""8x8 ender eye."""
	rows = [
		"..GGGG..",
		".GLLLLG.",
		"GLLDDLLG",
		"GLDKKDLG",
		"GLDKKDLG",
		"GLLDDLLG",
		".GLLLLG.",
		"..GGGG..",
	]
	pal = {"G": "#0f5a45", "L": "#3fe0a0", "D": "#1fa878", "K": "#0b2f2a"}
	for j, row in enumerate(rows):
		for i, ch in enumerate(row):
			if ch != ".":
				px(a, x + i, y + j, pal[ch])
	px(a, x + 2, y + 2, "#c8fff0")


def bag_front():
	"""North/south (8 wide x 10 tall -> uv 4..12 x 6..16 -> texels 8..24 x 12..32)."""
	a = paper(21)
	for x in (9, 23):
		fill(a, x, 12, x + 1, 32, PURPLE_DARK, 0.6)          # side creases
	fill(a, 8, 30, 24, 32, PURPLE_DARK)                     # bottom fold
	fill(a, 8, 12, 24, 13, PURPLE_LIGHT)
	eye(a, 12, 17)
	fill(a, 11, 27, 21, 28, "#3fe0a0")                       # green stripe
	px(a, 10, 27, "#3fe0a0", 0.5)
	px(a, 21, 27, "#3fe0a0", 0.5)
	return a


def bag_end():
	"""East/west (6 wide x 10 tall -> uv 5..11 x 6..16 -> texels 10..22 x 12..32): gusset fold."""
	a = paper(22)
	fill(a, 15, 12, 17, 28, PURPLE_DARK, 0.55)
	for k in range(4):
		px(a, 15 - k, 28 + k, PURPLE_DARK)
		px(a, 16 + k, 28 + k, PURPLE_DARK)
	fill(a, 10, 12, 22, 13, PURPLE_LIGHT)
	fill(a, 12, 15, 18, 24, "#f7f7f2")                       # order ticket
	for y in range(16, 23, 2):
		fill(a, 13, y, 17, y + 1, "#b8b8c0")
	fill(a, 13, 22, 15, 23, "#3fe0a0")
	return a


def bag_top():
	a = paper(23, PURPLE_DARK)
	fill(a, 8, 15, 24, 17, "#4a2270")                       # rolled seam
	fill(a, 8, 15, 24, 16, PURPLE)
	return a


def bag_fold():
	"""The folded lip band (wraps all four sides) with a stapled receipt on the front."""
	a = paper(24, "#6a33a0")
	fill(a, 0, 0, T, 1, PURPLE_LIGHT)
	fill(a, 0, T - 1, T, T, "#4a2270")
	fill(a, 0, 3, T, 4, "#4a2270")
	fill(a, 19, 1, 23, 2, "#d9dde4")                        # staple
	return a


def handle():
	a = paper(25, "#4a2270")
	for y in range(0, T, 3):
		fill(a, 0, y, T, y + 1, "#6a33a0")
	return a


# --------------------------------------------------------------------------------------------------
# models
# --------------------------------------------------------------------------------------------------

def face(texture, uv, rotation=0, cull=None):
	f = {"uv": uv, "texture": texture}
	if rotation:
		f["rotation"] = rotation
	if cull:
		f["cullface"] = cull
	return f


def box(frm, to, faces, **extra):
	e = {"from": frm, "to": to, "faces": faces}
	e.update(extra)
	return e


DISPLAY_LAPTOP = {
	"gui": {"rotation": [28, 210, 0], "translation": [0.5, 2.2, 0], "scale": [0.92, 0.92, 0.92]},
	"ground": {"rotation": [0, 0, 0], "translation": [0, 3, 0], "scale": [0.35, 0.35, 0.35]},
	"fixed": {"rotation": [-90, 0, 0], "translation": [0, 0, -1.5], "scale": [0.75, 0.75, 0.75]},
	"thirdperson_righthand": {"rotation": [75, 225, 0], "translation": [0, 2.5, 1.5], "scale": [0.45, 0.45, 0.45]},
	"firstperson_righthand": {"rotation": [0, 165, 0], "translation": [1, 2.5, 0], "scale": [0.36, 0.36, 0.36]},
	"firstperson_lefthand": {"rotation": [0, 165, 0], "translation": [1, 2.5, 0], "scale": [0.36, 0.36, 0.36]},
}

LID_ROT = {"origin": [8, 1, 12.5], "axis": "x", "angle": 12}


def base_elements():
	return [box([2, 0, 3.5], [14, 1, 12.5], {
		"up": face("#deck", [2, 3.5, 14, 12.5]),
		"down": face("#shell", [2, 3.5, 14, 12.5], cull="down"),
		"north": face("#shell", [2, 15, 14, 16]),
		"south": face("#shell", [2, 15, 14, 16]),
		"east": face("#shell", [3.5, 15, 12.5, 16]),
		"west": face("#shell", [3.5, 15, 12.5, 16]),
	})]


def laptop_open():
	els = base_elements()
	els.append(box([2, 1, 11.7], [14, 10.6, 12.5], {
		"north": face("#bezel", [2, 5.4, 14, 15]),
		"south": face("#lid", [2, 3.2, 14, 12.8]),
		"east": face("#shell", [0, 5.4, 0.8, 15]),
		"west": face("#shell", [0, 5.4, 0.8, 15]),
		"up": face("#shell", [2, 0, 14, 0.8]),
	}, rotation=LID_ROT))
	els.append(box([3, 2, 11.65], [13, 9.5, 11.7], {
		"north": face("#screen", [0, 0, 16, 12]),
	}, rotation=LID_ROT, shade=False, light_emission=15))
	els.append(box([6, 3.8, 12.5], [10, 7.8, 12.55], {
		"south": face("#logo", [6, 6, 10, 10]),
	}, rotation=LID_ROT, shade=False, light_emission=12))
	return {
		"parent": "minecraft:block/block",
		"ambientocclusion": False,
		"textures": {
			"particle": tex("laptop_shell"), "shell": tex("laptop_shell"), "deck": tex("laptop_deck"),
			"bezel": tex("laptop_bezel"), "lid": tex("laptop_lid"), "screen": tex("laptop_screen"), "logo": tex("laptop_logo"),
		},
		"display": DISPLAY_LAPTOP,
		"elements": els,
	}


def laptop_closed():
	els = base_elements()
	els.append(box([2, 1, 3.5], [14, 1.8, 12.5], {
		"up": face("#lid", [2, 3.5, 14, 12.5], rotation=180),
		"down": face("#bezel", [2, 3.5, 14, 12.5]),
		"north": face("#shell", [2, 0, 14, 0.8]),
		"south": face("#shell", [2, 0, 14, 0.8]),
		"east": face("#shell", [3.5, 0, 12.5, 0.8]),
		"west": face("#shell", [3.5, 0, 12.5, 0.8]),
	}))
	els.append(box([6, 1.8, 6], [10, 1.85, 10], {
		"up": face("#logo", [6, 6, 10, 10], rotation=180),
	}, shade=False, light_emission=10))
	els.append(box([7.5, 0.3, 3.45], [8.5, 0.6, 3.5], {
		"north": face("#logo", [0, 0, 1, 0.3]),
	}, shade=False, light_emission=8))
	return {
		"parent": "minecraft:block/block",
		"ambientocclusion": False,
		"textures": {
			"particle": tex("laptop_shell"), "shell": tex("laptop_shell"), "deck": tex("laptop_deck"),
			"bezel": tex("laptop_bezel"), "lid": tex("laptop_lid"), "logo": tex("laptop_logo"),
		},
		"display": DISPLAY_LAPTOP,
		"elements": els,
	}


DISPLAY_SMALL = {
	"gui": {"rotation": [30, 225, 0], "translation": [0, 1, 0], "scale": [0.8, 0.8, 0.8]},
	"ground": {"rotation": [0, 0, 0], "translation": [0, 3, 0], "scale": [0.4, 0.4, 0.4]},
	"fixed": {"rotation": [0, 0, 0], "translation": [0, 0, 0], "scale": [0.75, 0.75, 0.75]},
	"thirdperson_righthand": {"rotation": [75, 45, 0], "translation": [0, 2.5, 0], "scale": [0.5, 0.5, 0.5]},
	"firstperson_righthand": {"rotation": [0, 45, 0], "translation": [0, 2, 0], "scale": [0.6, 0.6, 0.6]},
	"firstperson_lefthand": {"rotation": [0, 225, 0], "translation": [0, 2, 0], "scale": [0.6, 0.6, 0.6]},
}


def emerazon_box():
	return {
		"parent": "minecraft:block/block",
		"ambientocclusion": False,
		"textures": {
			"particle": tex("emerazon_box_side"), "top": tex("emerazon_box_top"), "front": tex("emerazon_box_front"),
			"side": tex("emerazon_box_side"), "bottom": tex("emerazon_box_bottom"),
		},
		"display": DISPLAY_SMALL,
		"elements": [box([3, 0, 3], [13, 9, 13], {
			"up": face("#top", [3, 3, 13, 13]),
			"down": face("#bottom", [3, 3, 13, 13], cull="down"),
			"north": face("#front", [3, 7, 13, 16]),
			"south": face("#front", [3, 7, 13, 16]),
			"east": face("#side", [3, 7, 13, 16]),
			"west": face("#side", [3, 7, 13, 16]),
		})],
	}


def ender_eats_bag():
	els = [
		box([4, 0, 5], [12, 10, 11], {
			"up": face("#top", [4, 5, 12, 11]),
			"down": face("#top", [4, 5, 12, 11], cull="down"),
			"north": face("#front", [4, 6, 12, 16]),
			"south": face("#front", [4, 6, 12, 16]),
			"east": face("#end", [5, 6, 11, 16]),
			"west": face("#end", [5, 6, 11, 16]),
		}),
		box([3.8, 8.6, 4.8], [12.2, 10.2, 11.2], {
			"up": face("#top", [4, 5, 12, 11]),
			"north": face("#fold", [3.8, 0, 12.2, 1.6]),
			"south": face("#fold", [3.8, 0, 12.2, 1.6]),
			"east": face("#fold", [0, 0, 6.4, 1.6]),
			"west": face("#fold", [0, 0, 6.4, 1.6]),
			"down": face("#fold", [3.8, 0, 12.2, 1.6]),
		}),
	]
	for z in (5.6, 9.9):  # two handle loops
		for (x0, x1, y0, y1) in ((5.8, 6.4, 10.2, 11.8), (9.6, 10.2, 10.2, 11.8), (5.8, 10.2, 11.8, 12.4)):
			faces = {d: face("#handle", [0, 0, max(0.6, x1 - x0), max(0.6, y1 - y0)]) for d in
				("north", "south", "east", "west", "up", "down")}
			els.append(box([x0, y0, z], [x1, y1, z + 0.5], faces))
	return {
		"parent": "minecraft:block/block",
		"ambientocclusion": False,
		"textures": {
			"particle": tex("ender_eats_bag_front"), "front": tex("ender_eats_bag_front"), "end": tex("ender_eats_bag_end"),
			"top": tex("ender_eats_bag_top"), "fold": tex("ender_eats_bag_fold"), "handle": tex("ender_eats_bag_handle"),
		},
		"display": DISPLAY_SMALL,
		"elements": els,
	}


def horizontal_variants(model, extra_prop=None):
	out = {}
	rot = {"north": 0, "east": 90, "south": 180, "west": 270}
	for facing, y in rot.items():
		v = {"model": model}
		if y:
			v["y"] = y
		out[f"facing={facing}"] = v
	return out


def laptop_blockstate():
	rot = {"north": 0, "east": 90, "south": 180, "west": 270}
	variants = {}
	for facing, y in rot.items():
		for open_ in ("false", "true"):
			v = {"model": f"{NS}:block/laptop_{'open' if open_ == 'true' else 'closed'}"}
			if y:
				v["y"] = y
			variants[f"facing={facing},open={open_}"] = v
	return {"variants": variants}


def main():
	out = []
	for name, fn in (("laptop_shell", shell), ("laptop_deck", deck), ("laptop_bezel", bezel), ("laptop_lid", lid),
			("laptop_logo", logo_tex), ("emerazon_box_top", box_top), ("emerazon_box_front", box_front),
			("emerazon_box_side", box_side), ("emerazon_box_bottom", box_bottom), ("ender_eats_bag_front", bag_front),
			("ender_eats_bag_end", bag_end), ("ender_eats_bag_top", bag_top), ("ender_eats_bag_fold", bag_fold),
			("ender_eats_bag_handle", handle)):
		out.append(save_tex(fn(), name))
	strip, meta = screen_texture()
	out.append(save_tex(strip, "laptop_screen"))
	out.append(write_json("textures/block/laptop_screen.png.mcmeta", meta))
	out.append(write_json("models/block/laptop_open.json", laptop_open()))
	out.append(write_json("models/block/laptop_closed.json", laptop_closed()))
	out.append(write_json("models/block/emerazon_box.json", emerazon_box()))
	out.append(write_json("models/block/ender_eats_bag.json", ender_eats_bag()))
	out.append(write_json("blockstates/laptop.json", laptop_blockstate()))
	out.append(write_json("blockstates/emerazon_box.json", {"variants": horizontal_variants(f"{NS}:block/emerazon_box")}))
	out.append(write_json("blockstates/ender_eats_bag.json", {"variants": horizontal_variants(f"{NS}:block/ender_eats_bag")}))
	out.append(write_json("items/laptop.json", {"model": {"type": "minecraft:model", "model": f"{NS}:block/laptop_open"}}))
	print(f"blocks: wrote {len(out)} files")
	return out


if __name__ == "__main__":
	main()
