"""LaptopCraft home decor block models. Models face north; see lib.py for the painting conventions."""
from __future__ import annotations

from PIL import Image

import animtex
from lib import (CLEAR, Face, Model, NS, alpha, c, edge, fabric, facing_variants, flat, func, mix, over, pattern, plain,
	shade, write_blockstate, write_item_def, write_loot_self, write_model, write_models_shared, write_png)

TEX = "block/decor/"


# ----------------------------------------------------------------------------------------------------------------
# shared materials
# ----------------------------------------------------------------------------------------------------------------

def chrome(base=c("b9c0cc")):
	"""Polished metal: bright top band, darker lower half, a specular column near the left."""

	def fn(x, y, w, h):
		t = y / max(1, h - 1)
		col = mix(shade(base, 1.18), shade(base, 0.72), t)
		if x == 1 and w >= 4:
			col = shade(col, 1.25)
		if x == w - 1 and w >= 3:
			col = shade(col, 0.85)
		return col

	return func(fn)


def wood(base=c("8a5a33")):
	"""Horizontal wood grain (regular, hand-placed rhythm)."""

	def fn(x, y, w, h):
		col = base
		if y % 3 == 2:
			col = shade(base, 0.86)
		if (x * 7 + y * 3) % 13 == 0:
			col = shade(base, 0.8)
		if y == 0:
			col = shade(col, 1.1)
		return col

	return func(fn)


def glass(tint=c("dff4ff"), a=70):
	def fn(x, y, w, h):
		if x == 1 and 0 < y < h - 1:
			return alpha(shade(tint, 1.1), 150)  # streak of reflected light
		if x == 0 or x == w - 1:
			return alpha(tint, a + 30)
		return alpha(tint, a)

	return func(fn)


# ----------------------------------------------------------------------------------------------------------------
# lava lamps (3 colours, one shared body texture + an animated, emissive wax texture each)
# ----------------------------------------------------------------------------------------------------------------

LAVA_VARIANTS = ["lava_lamp", "lava_lamp_blue", "lava_lamp_purple"]


def lava_lamp(variant: str) -> Model:
	m = Model(f"block/{variant}", TEX + "lava_lamp")
	m.tex("liquid", TEX + f"{variant}_liquid")
	m.particle = TEX + f"{variant}_liquid"
	steel = chrome(c("c4cad4"))
	m.box((5, 0, 5), (11, 1.5, 11), steel, faces={"up": flat(c("8d95a3"))})
	m.box((5.5, 1.5, 5.5), (10.5, 3.5, 10.5), steel, faces={"up": plain(c("3a3f4a"))}, skip="down")
	# classic tapered bottle: a wide lower bulb and a narrower neck, both full of animated, glowing wax
	lower = {d: Face(tex="liquid", uv=[4 * i, 4.5, 4 * i + 4, 9]) for i, d in enumerate(("north", "east", "south", "west"))}
	upper = {d: Face(tex="liquid", uv=[4 * i + 0.5, 0, 4 * i + 3.5, 4.5]) for i, d in enumerate(("north", "east", "south", "west"))}
	upper["up"] = Face(tex="liquid", uv=[0, 10, 4, 14])
	lower["up"] = Face(tex="liquid", uv=[0, 10, 4, 14])
	m.box((6, 3.5, 6), (10, 8, 10), None, faces=lower, emission=15)
	m.box((6.5, 8, 6.5), (9.5, 12.25, 9.5), None, faces=upper, emission=15)
	m.box((5.5, 3.5, 5.5), (10.5, 8, 10.5), glass(), skip="down")
	m.box((6, 8, 6), (10, 12.5, 10), glass(), skip="down")
	m.box((6.5, 12.5, 6.5), (9.5, 14, 9.5), steel)
	m.box((7, 14, 7), (9, 14.5, 9), steel, skip="down")
	return m


def build_lava_lamps():
	models = [lava_lamp(v) for v in LAVA_VARIANTS]
	write_models_shared(models, TEX + "lava_lamp")
	for v in LAVA_VARIANTS:
		write_blockstate(v, {"": {"model": f"{NS}:block/{v}"}})
		write_item_def(v, f"block/{v}")
		write_loot_self(v)


# ----------------------------------------------------------------------------------------------------------------
# disco ball (hanging from a chain, or standing on a little stand)
# ----------------------------------------------------------------------------------------------------------------

def disco_ball(hanging: bool) -> Model:
	m = Model("block/disco_ball" + ("" if hanging else "_standing"), TEX + "disco_ball")
	m.tex("mirror", TEX + "disco_ball_mirror")
	m.particle = TEX + "disco_ball_mirror"

	def mir(u, v, w, h):
		return Face(tex="mirror", uv=[u, v, u + w, v + h])

	dy = 0 if hanging else 0.5
	E = 13
	# a "voxel sphere": 8px core + three 6px cross slabs poking out 1px on every side
	m.box((4.5, 4 + dy, 4.5), (11.5, 11 + dy, 11.5), None, emission=E, faces={
		"north": mir(0, 0, 7, 7), "east": mir(8, 0, 7, 7), "south": mir(0, 8, 7, 7), "west": mir(8, 8, 7, 7),
		"up": mir(4, 4, 7, 7), "down": mir(2, 6, 7, 7)})
	m.box((3, 4.5 + dy, 5), (13, 10.5 + dy, 11), None, emission=E, faces={
		"east": mir(2, 2, 6, 6), "west": mir(10, 4, 6, 6), "north": mir(0, 4, 10, 6), "south": mir(6, 10, 10, 6),
		"up": mir(2, 0, 10, 6), "down": mir(4, 8, 10, 6)})
	m.box((5, 4.5 + dy, 3), (11, 10.5 + dy, 13), None, emission=E, faces={
		"north": mir(2, 2, 6, 6), "south": mir(10, 10, 6, 6), "east": mir(4, 4, 10, 6), "west": mir(0, 10, 10, 6),
		"up": mir(6, 2, 6, 10), "down": mir(0, 4, 6, 10)})
	m.box((5, 2.5 + dy, 5), (11, 12.5 + dy, 11), None, emission=E, faces={
		"up": mir(4, 6, 6, 6), "down": mir(6, 4, 6, 6), "north": mir(8, 0, 6, 10), "south": mir(2, 6, 6, 10),
		"east": mir(10, 6, 6, 10), "west": mir(0, 2, 6, 10)})
	dark = c("3b3f48")
	if hanging:
		links = pattern(["L", "d", "L", "d"], {"L": c("6d7380"), "d": c("2c2f36")}, anchor="tl")
		m.box((7.5, 13, 7.5), (8.5, 16, 8.5), links, skip="up down")
		m.box((6.5, 12.5, 6.5), (9.5, 13.25, 9.5), chrome(), faces={"up": plain(dark)})
	else:
		m.box((5, 0, 5), (11, 1, 11), chrome(), faces={"up": flat(c("8d95a3"))})
		m.box((7.5, 1, 7.5), (8.5, 3, 8.5), chrome(), skip="up down")
	return m


def build_disco_ball():
	write_models_shared([disco_ball(True), disco_ball(False)], TEX + "disco_ball")
	write_blockstate("disco_ball", {
		"hanging=true": {"model": f"{NS}:block/disco_ball"},
		"hanging=false": {"model": f"{NS}:block/disco_ball_standing"},
	})
	write_item_def("disco_ball", "block/disco_ball")
	write_loot_self("disco_ball")


# ----------------------------------------------------------------------------------------------------------------
# neon "OPEN" sign
# ----------------------------------------------------------------------------------------------------------------

def neon_board(mirror: bool):
	tubes = animtex.neon_frame(False).load()
	board = c("16191f")
	glow_g = c("1b3a2c")
	glow_p = c("3a1d33")

	def fn(x, y, w, h):
		sx = (w - 1 - x) if mirror else x
		for dx, dy in ((0, 0), (1, 0), (-1, 0), (0, 1), (0, -1)):
			X, Y = sx + dx, y + dy
			if 0 <= X < 32 and 0 <= Y < 32 and tubes[X, Y][3] != 0:
				return glow_p if tubes[X, Y][0] > 200 else glow_g
		return board

	return func(fn)


def neon_sign() -> Model:
	"""A 19px wide acrylic board (pokes 1.5px past the block on each side, like a real sign) with glowing tubes on
	both sides — the back reads 'NEPO', as any neon sign seen from behind should."""
	m = Model("block/neon_sign", TEX + "neon_sign")
	m.tex("tubes", TEX + "neon_sign_tubes")
	frame = c("2a2e38")
	w, h = animtex.NEON_W / 2, animtex.NEON_H / 2  # uv units of the 32px frame
	m.box((-1.5, 1.5, 7), (17.5, 12.5, 9), plain(frame), faces={"north": neon_board(False), "south": neon_board(True),
		"up": flat(frame), "down": flat(frame), "east": flat(frame), "west": flat(frame)})
	m.box((-1.5, 1.5, 6.9), (17.5, 12.5, 6.9), None, faces={"north": Face(tex="tubes", uv=[0, 0, w, h])}, emission=15, shade=False)
	m.box((-1.5, 1.5, 9.1), (17.5, 12.5, 9.1), None, faces={"south": Face(tex="tubes", uv=[w, 0, 0, h])}, emission=15, shade=False)
	foot = flat(c("3a3f4a"))
	for x0 in (2, 12):
		m.box((x0, 0, 5.5), (x0 + 2, 1.5, 10.5), foot)
	return m


def build_neon_sign():
	write_model(neon_sign())
	write_blockstate("neon_sign", facing_variants(lambda p: "block/neon_sign"))
	write_item_def("neon_sign", "block/neon_sign")
	write_loot_self("neon_sign")


# ----------------------------------------------------------------------------------------------------------------
# desk lamp (lit / unlit)
# ----------------------------------------------------------------------------------------------------------------

def desk_lamp(lit: bool) -> Model:
	m = Model("block/desk_lamp" + ("_on" if lit else ""), TEX + "desk_lamp")
	body = c("3fa89b")
	metal = chrome(c("c9ced6"))
	paint = flat(body)
	m.box((5, 0, 7), (11, 1, 13), paint, faces={"up": flat(shade(body, 1.08))})
	m.box((6, 1, 8), (10, 1.5, 12), metal, skip="down")
	m.box((7.5, 1.5, 9.5), (8.5, 8.5, 10.5), paint, rot={"origin": [8, 1.5, 10], "axis": "x", "angle": 15})  # lower arm
	m.box((7.25, 7.75, 11), (8.75, 9.25, 12.5), metal)  # elbow joint
	m.box((7.5, 8.5, 11.25), (8.5, 15.5, 12.25), paint, rot={"origin": [8, 8.5, 11.75], "axis": "x", "angle": -62})  # upper arm
	# flared shade, built pointing straight down and then tipped forward
	head_rot = {"origin": [8, 12, 5.5], "axis": "x", "angle": -35}
	m.box((6.5, 11.5, 4), (9.5, 13, 7), paint, rot=head_rot, faces={"up": flat(shade(body, 1.1))}, skip="down")  # cap
	m.box((5.5, 10, 3), (10.5, 11.5, 8), paint, rot=head_rot, faces={"up": flat(shade(body, 1.1))}, skip="down")
	m.box((4.5, 8.75, 2), (11.5, 10, 9), paint, rot=head_rot, faces={"up": flat(shade(body, 1.1))}, skip="down")  # rim
	m.box((7.25, 12.75, 4.75), (8.75, 13.75, 6.25), metal, rot=head_rot, skip="down")  # knob
	opening = pattern([
		"RRRRRRR",
		"RLLLLLR",
		"RLLBLLR",
		"RLBBBLR",
		"RLLBLLR",
		"RLLLLLR",
		"RRRRRRR",
	], {"R": c("2d6f67"), "L": c("ffe08a") if lit else c("4a4f57"), "B": c("fffbe8") if lit else c("8b919b")})
	m.box((4.5, 8.7, 2), (11.5, 8.75, 9), None, rot=head_rot, faces={"down": opening}, emission=15 if lit else 0)
	return m


def build_desk_lamp():
	write_models_shared([desk_lamp(False), desk_lamp(True)], TEX + "desk_lamp")
	write_blockstate("desk_lamp", facing_variants(lambda p: "block/desk_lamp_on" if p["lit"] == "true" else "block/desk_lamp",
		{"lit": ["false", "true"]}))
	write_item_def("desk_lamp", "block/desk_lamp_on")
	write_loot_self("desk_lamp")


# ----------------------------------------------------------------------------------------------------------------
# globe (spinning map texture, tilted 23.4 degrees like the real thing)
# ----------------------------------------------------------------------------------------------------------------

def globe() -> Model:
	m = Model("block/globe", TEX + "globe")
	m.tex("map", TEX + "globe_map")
	m.particle = TEX + "globe_map"
	walnut = wood(c("6e4426"))
	gold = chrome(c("e8b84a"))
	m.box((5, 0, 5), (11, 1, 11), walnut, faces={"up": flat(c("7d4f2c"))})
	m.box((7.5, 1, 7.5), (8.5, 3.5, 8.5), gold, skip="down")
	tilt = {"origin": [8, 7.5, 8], "axis": "z", "angle": 23.4}
	m.box((4, 3.5, 4), (12, 11.5, 12), None, rot=tilt, faces={
		# 32px frame -> 1 uv = 2 texels; the four sides read a continuous scrolling strip
		"north": Face(tex="map", uv=[0, 0, 4, 4]),
		"west": Face(tex="map", uv=[4, 0, 8, 4]),
		"south": Face(tex="map", uv=[8, 0, 12, 4]),
		"east": Face(tex="map", uv=[12, 0, 16, 4]),
		"up": Face(tex="map", uv=[0, 4, 4, 8]),
		"down": Face(tex="map", uv=[4, 4, 8, 8]),
	})
	# meridian ring (gold), tilted with the globe
	m.box((7.75, 12, 3.5), (8.25, 12.5, 12.5), gold, rot=tilt)
	m.box((7.75, 2.5, 3.5), (8.25, 3, 12.5), gold, rot=tilt)
	m.box((7.75, 3, 3), (8.25, 12, 3.5), gold, rot=tilt)
	m.box((7.75, 3, 12.5), (8.25, 12, 13), gold, rot=tilt)
	return m


def build_globe():
	write_model(globe())
	write_blockstate("globe", facing_variants(lambda p: "block/globe"))
	write_item_def("globe", "block/globe")
	write_loot_self("globe")


# ----------------------------------------------------------------------------------------------------------------
# bean bags (3 colours)
# ----------------------------------------------------------------------------------------------------------------

BEAN_COLORS = {"bean_bag": c("d2413f"), "bean_bag_blue": c("3b6fd6"), "bean_bag_lime": c("7cc23a")}


def puffy(col):
	"""Soft vinyl: lit top rows, shadowed bottom rows, regular fine weave — reads as a squishy sack."""

	def fn(x, y, w, h):
		cl = col
		if y == 0:
			cl = shade(col, 1.14)
		elif y == 1 and h > 3:
			cl = shade(col, 1.06)
		elif y == h - 1:
			cl = shade(col, 0.8)
		elif y == h - 2 and h > 4:
			cl = shade(col, 0.9)
		if (x + 2 * y) % 4 == 0 and 0 < y < h - 1:
			cl = shade(cl, 0.96)
		return cl

	return func(fn)


def bean_bag(name: str, col) -> Model:
	"""A slouchy sack: octagonal footprint, a dip to sit in and a soft back roll."""
	m = Model(f"block/{name}", TEX + name)
	v = puffy(col)
	top = fabric(shade(col, 1.08), weave=0.95)
	m.box((2, 0, 2), (14, 6, 14), v, faces={"up": top})
	m.box((1, 0.5, 3), (15, 5, 13), v, faces={"up": top})  # bulge east/west
	m.box((3, 0.5, 1), (13, 5, 15), v, faces={"up": top})  # bulge north/south
	m.box((3, 6, 9), (13, 10, 14), v, faces={"up": top})  # back roll
	m.box((4, 10, 10), (12, 11, 13.5), top, skip="down")
	m.box((2, 6, 4), (4, 7.5, 12), v, faces={"up": top})  # side cushions
	m.box((12, 6, 4), (14, 7.5, 12), v, faces={"up": top})
	m.box((5, 6, 5), (11, 6.25, 9), plain(shade(col, 0.88)), skip="down")  # the comfy dip (shadowed)
	tag = pattern(["W", "W"], {"W": c("f4f0e6")})
	m.box((15, 1, 7), (15.1, 3, 8), None, faces={"east": tag})  # tiny care label
	return m


def build_bean_bags():
	for name, col in BEAN_COLORS.items():
		write_model(bean_bag(name, col))
		write_blockstate(name, facing_variants(lambda p, name=name: f"block/{name}"))
		write_item_def(name, f"block/{name}")
		write_loot_self(name)


# ----------------------------------------------------------------------------------------------------------------
# gaming chair
# ----------------------------------------------------------------------------------------------------------------

def gaming_chair() -> Model:
	m = Model("block/gaming_chair", TEX + "gaming_chair")
	K = c("23242b")
	Kd = c("17181c")
	R = c("d6283a")
	Rd = c("9c1b29")
	steel = chrome(c("c9ced6"))
	leather = fabric(K, weave=1.15)
	m.box((7, 0.5, 2), (9, 1.5, 14), flat(Kd))  # star base
	m.box((2, 0.5, 7), (14, 1.5, 9), flat(Kd))
	for (x, z) in ((7.5, 1.5), (7.5, 13.5), (1.5, 7.5), (13.5, 7.5)):
		m.box((x, 0, z), (x + 1, 0.5, z + 1), plain(c("101114")), skip="up")  # casters
	m.box((7.25, 1.5, 7.25), (8.75, 5, 8.75), steel, skip="up down")  # gas lift
	m.box((3, 5, 2.5), (13, 7, 12.5), leather, faces={"north": over(flat(K), edge(R, "b"))})  # seat
	for x0 in (3, 11.5):
		m.box((x0, 7, 2.5), (x0 + 1.5, 8, 12), flat(R), faces={"up": flat(shade(R, 1.1)), "north": plain(Rd)}, skip="down")  # bolsters
		m.box((x0 - 1 if x0 < 8 else x0 + 1.5, 5.5, 7), (x0 if x0 < 8 else x0 + 2.5, 9, 8), flat(Kd))  # armrest posts
		m.box((x0 - 1.25 if x0 < 8 else x0 + 1.25, 9, 5), (x0 + 0.25 if x0 < 8 else x0 + 2.75, 9.75, 10), flat(K))  # pads
	back = pattern([
		"KKKRKKKRKK"[:10],
		"KKKRKKKRKK",
		"KKKRKKKRKK",
		"KKKRKKKRKK",
		"KKKKGGKKKK",
		"KKKRGGKRKK",
		"KKKRKKKRKK",
		"KKKRKKKRKK",
		"KKKRKKKRKK",
	], {"K": K, "R": R, "G": c("3ddc84")}, base=leather)
	m.box((3, 7, 12), (13, 16, 14), leather, faces={"north": back, "up": flat(R)})  # backrest with racing stripes
	for x0 in (3, 12):
		m.box((x0, 9, 11.5), (x0 + 1, 15.5, 12), flat(R), skip="south")  # side wings
	m.box((5.5, 13, 11.5), (10.5, 15, 12), flat(R), faces={"north": over(flat(R), edge(Rd, "b"))}, skip="south")  # neck pillow
	return m


def build_gaming_chair():
	write_model(gaming_chair())
	write_blockstate("gaming_chair", facing_variants(lambda p: "block/gaming_chair"))
	write_item_def("gaming_chair", "block/gaming_chair")
	write_loot_self("gaming_chair")


# ----------------------------------------------------------------------------------------------------------------
# potted monstera
# ----------------------------------------------------------------------------------------------------------------

LEAF = [
	"..gGGg..",
	".gGLG.G.",
	"gG.LGGGg",
	"GGGLG.GG",
	"G.GLGGGG",
	"gGGLG.G.",
	".GGLGg..",
	"...L....",
]
LEAF2 = [
	"...gG...",
	"..gGLg..",
	".G.GLGG.",
	"gGGGL.Gg",
	"G.GGLGGG",
	"GGG.LG.G",
	".gGGLGG.",
	"....L...",
]


def monstera_leaf_texture():
	im = Image.new("RGBA", (16, 16), CLEAR)
	px = im.load()
	pal = {"G": c("3f9a3a"), "g": c("2f7a2e"), "L": c("8fd16a")}
	for ox, rows in ((0, LEAF), (8, LEAF2)):
		for y, row in enumerate(rows):
			for x, ch in enumerate(row):
				if ch != ".":
					col = pal[ch]
					if ch == "G" and x < 3 and y < 4:
						col = shade(col, 1.12)
					px[ox + x, y] = col
	return im


def potted_monstera() -> Model:
	m = Model("block/potted_monstera", TEX + "potted_monstera")
	m.tex("leaf", TEX + "monstera_leaf")
	pot = c("eae4da")
	stripe = c("d9824a")
	pot_paint = over(flat(pot), func(lambda x, y, w, h: stripe if y == 2 else None))
	m.box((4.5, 0, 4.5), (11.5, 5, 11.5), pot_paint)
	m.box((4, 5, 4), (12, 6.5, 12), flat(shade(pot, 1.04)), faces={"up": flat(pot)})
	m.box((5, 6.5, 5), (11, 6.6, 11), None, faces={"up": pattern(["SsSsSs", "sSSsSS", "SSsSsS"], {"S": c("4a3122"), "s": c("5e3f2b")}, anchor="tl")})
	stem = plain(c("4c8f3c"))
	leaves = [  # (yaw, tilt, height, length, variant)
		(0, -8, 12.5, 8, 0), (95, 12, 11, 7, 1), (200, -18, 10, 8, 0), (275, 20, 13.5, 7, 1), (150, 35, 14.5, 6, 0),
	]
	for yaw, tilt, h, ln, var in leaves:
		rot = {"origin": [8, 6.5, 8], "x": 0, "y": yaw, "z": 0}
		m.box((7.75, 6.5, 7.75), (8.25, h, 8.25), stem, rot={"origin": [8, 6.5, 8], "x": -10, "y": yaw, "z": 0}, skip="up down")
		u0 = 8 * var
		leaf_rot = {"origin": [8, h, 8], "x": tilt, "y": yaw, "z": 0}
		m.box((8 - ln / 2, h, 8 - ln - 1), (8 + ln / 2, h, 8 - 1 + 0.5), None, rot=leaf_rot, faces={
			"up": Face(tex="leaf", uv=[u0, 0, u0 + 8, 8]),
			"down": Face(tex="leaf", uv=[u0, 8, u0 + 8, 0]),
		})
	return m


def build_monstera():
	write_png(TEX + "monstera_leaf", monstera_leaf_texture())
	write_model(potted_monstera())
	write_blockstate("potted_monstera", facing_variants(lambda p: "block/potted_monstera"))
	write_item_def("potted_monstera", "block/potted_monstera")
	write_loot_self("potted_monstera")


# ----------------------------------------------------------------------------------------------------------------
# mini fridge (closed / open with a lit interior full of snacks)
# ----------------------------------------------------------------------------------------------------------------

def mini_fridge(open_: bool) -> Model:
	m = Model("block/mini_fridge" + ("_open" if open_ else ""), TEX + "mini_fridge")
	W = c("e9eef3")
	Wd = c("c7d0da")
	inside = c("d4dde6")
	shell = flat(W)
	m.box((2, 0, 3), (3, 14, 15), shell, faces={"east": flat(inside)})
	m.box((13, 0, 3), (14, 14, 15), shell, faces={"west": flat(inside)})
	m.box((3, 13, 3), (13, 14, 15), shell, faces={"down": flat(shade(inside, 0.95))})
	m.box((3, 0, 3), (13, 1, 15), shell, faces={"up": flat(shade(inside, 0.9))})
	vents = over(flat(Wd), func(lambda x, y, w, h: c("8f9aa6") if y % 2 == 1 and 1 < x < w - 2 and 2 < y < h - 2 else None))
	m.box((3, 1, 14), (13, 13, 15), shell, faces={"north": flat(inside), "south": vents})
	m.box((2.5, 0, 3.5), (3.5, 0.5, 4.5), plain(c("2b2f36")))  # feet
	m.box((12.5, 0, 3.5), (13.5, 0.5, 4.5), plain(c("2b2f36")))
	if open_:
		glass_shelf = plain(alpha(c("cfe9ff"), 160))
		m.box((3, 5, 4), (13, 5.25, 14), glass_shelf, skip="down")
		m.box((3, 9, 4), (13, 9.25, 14), glass_shelf, skip="down")
		m.box((6.5, 12.75, 7), (9.5, 13, 9), None, faces={"down": plain(c("fff7d6"))}, emission=15)  # fridge light!
		milk = pattern(["WW", "BB", "WW", "WW"], {"W": c("fbfbf7"), "B": c("4a8fe0")}, anchor="tl")
		m.box((4, 1, 6), (6, 4.5, 8), milk, faces={"up": plain(c("4a8fe0"))})  # milk carton
		m.box((10, 1, 7), (11, 3.5, 8), flat(c("e04a8c")), faces={"up": plain(c("6b4b2a"))})  # potion
		m.box((10.25, 3.5, 7.25), (10.75, 4.25, 7.75), plain(c("cfe9ff")), skip="down")
		m.box((7.5, 5.25, 6), (11, 6.75, 9), flat(c("f6efe1")), faces={"up": pattern(["RWRWRWR"[:4]], {"R": c("e03b3b"), "W": c("ffffff")}, anchor="tl"),
			"north": over(flat(c("f6efe1")), edge(c("b5774a"), "b"))})  # cake slice
		m.box((4.5, 9.25, 7), (6, 10.75, 8.5), flat(c("d8333a")), faces={"up": pattern(["  ", " L"], {"L": c("5aa83e")}, base=flat(c("d8333a")))})  # apple
		m.box((8, 9.25, 6.5), (11.5, 10.25, 9), flat(c("f3c24a")), faces={"up": pattern(["CcCc", "cCcC"], {"C": c("f3c24a"), "c": c("d79a2b")}, anchor="tl")})  # cheese
		# door swung open (hinge on the viewer's right = low x)
		m.box((1, 0, -10), (2, 14, 2), shell, faces={
			"east": over(flat(inside), func(lambda x, y, w, h: c("9fb0c2") if y in (4, 9) and 0 < x < w - 1 else None)),
			"west": shell})
		m.box((2, 4, -9), (3, 4.5, 1), plain(alpha(c("cfe9ff"), 170)), skip="down")  # door shelf
		m.box((2, 4.5, -8), (2.75, 7, -7), plain(c("7fd6ff")), skip="down")  # soda can
		m.box((2, 4.5, -5), (2.75, 6.5, -4), plain(c("ff8a3d")), skip="down")
	else:
		magnet = pattern([
			"            ",
			"            ",
			"   GG       ",
			"   KG       ",
			"            ",
			"            ",
			"            ",
			"            ",
			"            ",
			"            ",
			"            ",
			"            ",
			"            ",
			"            ",
		], {"G": c("5cae46"), "K": c("1b2a17")}, base=over(flat(W), edge(Wd, "tblr")))
		m.box((2, 0, 2), (14, 14, 3), shell, faces={"north": magnet})
		m.box((11.5, 3, 1.25), (12.5, 11, 2), chrome(), skip="south")  # handle
	return m


def build_mini_fridge():
	write_models_shared([mini_fridge(False), mini_fridge(True)], TEX + "mini_fridge")
	write_blockstate("mini_fridge", facing_variants(lambda p: "block/mini_fridge_open" if p["open"] == "true" else "block/mini_fridge",
		{"open": ["false", "true"]}))
	write_item_def("mini_fridge", "block/mini_fridge")
	write_loot_self("mini_fridge")


# ----------------------------------------------------------------------------------------------------------------
# retro TV (on / off)
# ----------------------------------------------------------------------------------------------------------------

def retro_tv(on: bool) -> Model:
	m = Model("block/retro_tv" + ("_on" if on else ""), TEX + "retro_tv")
	m.tex("screen", TEX + "retro_tv_screen")
	walnut = wood(c("8a5530"))
	panel = c("c9c3b5")
	front = over(flat(panel), func(lambda x, y, w, h: c("6f6a60") if (x <= 2 and y >= 6 and y % 2 == 0 and 0 < x) else None))
	m.box((1, 1, 3), (15, 12, 14), walnut, faces={"north": front})
	for (x, z) in ((2, 4), (13, 4), (2, 12), (13, 12)):
		m.box((x, 0, z), (x + 1, 1, z + 1), plain(c("3b2a1c")), skip="up")  # little legs
	m.box((4, 2.5, 2.5), (14, 11, 3), plain(c("1d1d22")), skip="south")  # bezel
	if on:
		m.box((4.5, 3.25, 2.4), (13.5, 10.25, 2.4), None, faces={"north": Face(tex="screen", uv=[0, 0, 9, 7])}, emission=15, shade=False)
	else:
		dark_glass = pattern([
			"         ",
			" ww      ",
			" w       ",
			"         ",
			"         ",
			"         ",
			"         ",
		], {"w": c("4c5866")}, base=plain(c("232a33")))
		m.box((4.5, 3.25, 2.4), (13.5, 10.25, 2.4), None, faces={"north": dark_glass})
	knob = chrome(c("d8d2c4"))
	m.box((2, 8.5, 2.5), (3.5, 10, 3), knob, skip="south")
	m.box((2, 6, 2.5), (3.5, 7.5, 3), knob, skip="south")
	m.box((2.25, 3, 2.75), (3.25, 3.5, 3), plain(c("ff4a3a") if on else c("5a2a26")), skip="south", emission=10 if on else 0)  # power LED
	m.box((6.5, 12, 7.5), (9.5, 13, 9.5), flat(c("2b2b30")), skip="down")  # antenna base
	rod = plain(c("b9c0cc"))
	m.box((7.75, 13, 8.25), (8.25, 19, 8.75), rod, rot={"origin": [8, 13, 8.5], "axis": "z", "angle": 32}, skip="down")
	m.box((7.75, 13, 8.25), (8.25, 19, 8.75), rod, rot={"origin": [8, 13, 8.5], "axis": "z", "angle": -32}, skip="down")
	return m


def build_retro_tv():
	write_models_shared([retro_tv(False), retro_tv(True)], TEX + "retro_tv")
	write_blockstate("retro_tv", facing_variants(lambda p: "block/retro_tv_on" if p["lit"] == "true" else "block/retro_tv",
		{"lit": ["false", "true"]}))
	write_item_def("retro_tv", "block/retro_tv_on")
	write_loot_self("retro_tv")


# ----------------------------------------------------------------------------------------------------------------
# arcade cabinet (two blocks tall)
# ----------------------------------------------------------------------------------------------------------------

PURPLE = c("3b2a7a")
PURPLE_D = c("2a1d5a")
EMER = c("33d17a")


def cabinet_side(upper: bool):
	def fn(x, y, w, h):
		# diagonal emerald lightning stripe running across both halves
		gy = y + (0 if upper else 16)
		d = (x * 2 + gy) % 40
		if 18 <= d <= 19:
			return EMER
		if d == 20:
			return shade(EMER, 0.7)
		if x == 0 or x == w - 1:
			return PURPLE_D
		return PURPLE

	return func(fn)


def arcade_lower() -> Model:
	m = Model("block/arcade_cabinet_lower", TEX + "arcade_cabinet")
	front = pattern([
		"KKKKKKKKKKKK",
		"PPPPPPPPPPPP",
		"PPPPPPPPPPPP",
		"PPPPPPPPPPPP",
		"PPPPKKKKPPPP",
		"PPPPKOKOPPPP",
		"PPPPKOKOPPPP",
		"PPPPKKKKPPPP",
		"PPPPKKKKPPPP",
		"PPPPKKKKPPPP",
		"PPPPPPPPPPPP",
		"PPPPPPPPPPPP",
		"PPPPPPPPPPPP",
		"EEEEEEEEEEEE",
		"KKKKKKKKKKKK",
		"KKKKKKKKKKKK",
	], {"K": c("1a1830"), "P": PURPLE, "O": c("ff9a2e"), "E": EMER})
	side = cabinet_side(False)
	m.box((2, 0, 4), (14, 16, 15), side, faces={"north": front, "up": plain(PURPLE_D), "south": flat(PURPLE_D)})
	panel_top = pattern([
		"KKKKKKKKKKKK",
		"KKKKKKKKKKKK",
		"KKKKKKKKKKKK",
	], {"K": c("1a1830")})
	m.box((2, 13, 1), (14, 15.5, 4), flat(c("1a1830")), faces={"up": panel_top, "north": over(flat(PURPLE), edge(EMER, "t")), "east": side, "west": side})
	m.box((4.25, 15.5, 2.25), (4.75, 17, 2.75), plain(c("111111")), skip="down")  # joystick
	m.box((3.75, 17, 1.75), (5.25, 18.5, 3.25), flat(c("e8333f")), skip="down")
	for x0, col in ((8, "ff3b47"), (9.75, "ffd23b"), (11.5, "3bd6ff")):
		m.box((x0, 15.5, 2), (x0 + 1, 16, 3), flat(c(col)), skip="down", emission=8)  # buttons
	return m


def arcade_upper() -> Model:
	m = Model("block/arcade_cabinet_upper", TEX + "arcade_cabinet")
	m.tex("screen", TEX + "arcade_screen")
	side = cabinet_side(True)
	m.box((2, 0, 5), (14, 15, 15), side, faces={"south": flat(PURPLE_D)}, skip="down")
	m.box((2, 0, 4), (14, 11, 5), side, faces={"north": plain(c("101018"))}, skip="down south")  # bezel
	m.box((3.5, 1, 3.95), (12.5, 10, 3.95), None, faces={"north": Face(tex="screen", uv=[0, 0, 9, 9])}, emission=15, shade=False)
	marquee = pattern([
		"KKKKKKKKKKKK",
		"KYY.KR..RKKK",
		"KYYKKRRRRK.K",
		"KYY.KR.R.KKK",
	], {"K": c("15102a"), "Y": c("ffe14a"), "R": c("ff5aa8"), ".": c("ffffff")})
	m.box((2, 11, 2.5), (14, 15, 5), side, faces={"north": marquee}, emission=15)
	m.box((2, 15, 2.5), (14, 16, 15), flat(PURPLE), faces={"up": flat(PURPLE_D)}, skip="down")
	return m


def build_arcade():
	write_models_shared([arcade_lower(), arcade_upper(), arcade_item()], TEX + "arcade_cabinet")
	write_blockstate("arcade_cabinet", facing_variants(lambda p: f"block/arcade_cabinet_{p['half']}", {"half": ["lower", "upper"]}))
	write_item_def("arcade_cabinet", "block/arcade_cabinet_item")
	write_loot_self("arcade_cabinet", lower_half_only=True)


def arcade_item():
	"""Item model: both halves stacked (scaled to fit the slot)."""
	lower = arcade_lower()
	upper = arcade_upper().translated(dy=16)
	m = Model("block/arcade_cabinet_item", TEX + "arcade_cabinet")
	m.extra_textures = dict(upper.extra_textures)
	m.elems = [e for e in lower.elems if e.to[1] <= 16.5] + upper.elems
	return m


def build_all():
	animtex.build_all()
	build_lava_lamps()
	build_disco_ball()
	build_neon_sign()
	build_desk_lamp()
	build_globe()
	build_bean_bags()
	build_gaming_chair()
	build_monstera()
	build_mini_fridge()
	build_retro_tv()
	build_arcade()
