"""Plushie block models (all face north, sit on the floor, roughly half a block tall) + the puzzle cube."""
from __future__ import annotations

from lib import (Model, c, edge, fabric, facing_variants, flat, func, over, pattern, plain, shade, write_blockstate,
	write_item_def, write_loot_self, write_model)

TEX = "block/toys/"


def tiled(rows: list, pal: dict, light: bool = True):
	"""Hand-made repeating tile (e.g. creeper camo) with soft top-left light."""

	def fn(x, y, w, h):
		col = pal[rows[y % len(rows)][x % len(rows[0])]]
		if light and w >= 3 and h >= 3:
			if y == 0 or x == 0:
				col = shade(col, 1.06)
			elif y == h - 1 or x == w - 1:
				col = shade(col, 0.9)
		return col

	return func(fn)


# ----------------------------------------------------------------------------------------------------------------

def creeper_plush() -> Model:
	m = Model("block/creeper_plush", TEX + "creeper_plush")
	pal = {"a": c("5cae46"), "b": c("7fcb63"), "c": c("3f8a34"), "d": c("4e9d3d")}
	skin = tiled([
		"abadacab",
		"dbaacdba",
		"caabbaac",
		"abdacabb",
		"baacbdab",
		"adbbacab",
		"cbaabaad",
		"abcadbba",
	], pal)
	K = c("1b2a17")
	k = c("2d4526")
	face = pattern([
		"        ",
		" KK  KK ",
		" Kk  Kk ",
		"   KK   ",
		"  KkkK  ",
		"  KKKK  ",
		"  K  K  ",
		"        ",
	], {"K": K, "k": k}, base=skin)
	for x0 in (5, 8.5):
		for z0 in (4, 9.5):
			m.box((x0, 0, z0), (x0 + 2.5, 2.5, z0 + 2.5), skin, faces={"north": over(skin, edge(pal["c"], "b"))})  # feet
	m.box((5.5, 2, 6), (10.5, 7, 10), skin, skip="up down")  # body
	m.box((4, 7, 4), (12, 15, 12), skin, faces={"north": face})  # head
	return m


def pig_plush() -> Model:
	m = Model("block/pig_plush", TEX + "pig_plush")
	P = c("f3a7a3")
	Pd = c("dc8682")
	Pl = c("fbc2bd")
	S = c("f7b9b5")
	N = c("b5605e")
	K = c("2b1c22")
	W = c("ffffff")
	R = c("ee8f96")
	skin = fabric(P)
	for x0 in (5, 9):
		for z0 in (6.5, 10.5):
			m.box((x0, 0, z0), (x0 + 2, 1.5, z0 + 2), fabric(Pd), skip="up")  # stubby legs
	m.box((4.5, 1, 6), (11.5, 7, 13), skin, faces={"up": fabric(Pl)})  # body
	face = pattern([
		"        ",
		"        ",
		" KW  WK ",
		" KK  KK ",
		"        ",
		"R      R",
		"        ",
	], {"K": K, "W": W, "R": R}, base=skin)
	m.box((4, 3, 2.5), (12, 10, 8.5), skin, faces={"north": face, "up": fabric(Pl)})  # head
	m.box((5.5, 4, 1.5), (10.5, 7, 2.5), flat(S), faces={"north": pattern([
		"SSSSS",
		"SNSNS",
		"SSSSS",
	], {"S": S, "N": N})}, skip="south")  # snout
	for x0 in (4.5, 9.5):
		m.box((x0, 10, 4), (x0 + 2, 11.5, 5.5), fabric(Pd), faces={"north": flat(Pd)}, skip="down")  # ears
	m.box((7.5, 5, 13), (8.5, 6, 14), flat(Pd), skip="north")  # curly tail
	m.box((8, 5.5, 14), (9, 6.5, 14.5), flat(Pd), skip="north")
	return m


def teddy_bear() -> Model:
	m = Model("block/teddy_bear", TEX + "teddy_bear")
	B = c("b07a43")
	T = c("ecc48c")
	Td = c("d6a86b")
	K = c("2a1a12")
	R = c("d83a3f")
	Rd = c("a3252c")
	fur = fabric(B, weave=0.93)
	for x0 in (5, 8.5):
		m.box((x0, 0, 2.5), (x0 + 2.5, 2.5, 6), fur, faces={"north": pattern(["   ", " T ", "   "], {"T": T}, base=fur)})  # legs
	m.box((5, 0, 6), (11, 7, 11), fur, faces={"north": over(fur, pattern([
		"      ",
		"      ",
		" TTTT ",
		" TTTT ",
		" TTTT ",
		"  TT  ",
		"      ",
	], {"T": T}))})  # body + belly
	m.box((3.5, 2, 6.5), (5, 6.5, 9), fur, rot={"origin": [5, 6.5, 7.75], "axis": "z", "angle": -15})  # arms
	m.box((11, 2, 6.5), (12.5, 6.5, 9), fur, rot={"origin": [11, 6.5, 7.75], "axis": "z", "angle": 15})
	head_face = pattern([
		"       ",
		"       ",
		" K   K ",
		"       ",
		"       ",
		"       ",
	], {"K": K}, base=fur)
	m.box((4.5, 7, 5.5), (11.5, 13, 10.5), fur, faces={"north": head_face})
	m.box((6.5, 7.5, 4.5), (9.5, 9.5, 5.5), flat(T), faces={"north": pattern(["TKT", "TTT"], {"T": T, "K": K})}, skip="south")  # muzzle
	for x0 in (4.5, 9.5):
		inner = ["  ", " T"] if x0 < 8 else ["  ", "T "]
		m.box((x0, 12.5, 7), (x0 + 2, 14.5, 8.5), fur, faces={"north": pattern(inner, {"T": Td}, base=fur)}, skip="down")  # ears
	m.box((5.5, 6.25, 5.25), (10.5, 7.75, 5.5), plain(R), faces={"north": pattern(["RR.RR", "RDDDR"], {"R": R, "D": Rd})}, skip="south")  # bow
	return m


def axolotl_plush() -> Model:
	m = Model("block/axolotl_plush", TEX + "axolotl_plush")
	P = c("f5a9c8")
	Pd = c("e384ab")
	Pl = c("fcc9dc")
	G = c("e2508f")
	K = c("2a1424")
	M = c("c25281")
	skin = fabric(P)
	m.box((5.5, 0, 5.5), (10.5, 3.5, 12), skin, faces={"up": fabric(Pl)})  # body
	m.box((7.5, 0.5, 12), (8.5, 3, 15.5), flat(Pd), faces={"east": over(flat(P), edge(Pd, "t")), "west": over(flat(P), edge(Pd, "t"))})  # tail
	m.box((7.75, 3, 12.5), (8.25, 4, 15.5), flat(Pl), skip="down")  # tail fin
	for x0 in (4.5, 10.5):
		for z0 in (6, 10):
			m.box((x0, 0, z0), (x0 + 1, 1, z0 + 1.5), flat(Pd), skip="up")  # little legs
	face = pattern([
		"       ",
		"K     K",
		"       ",
		" M   M ",
		"  MMM  ",
	], {"K": K, "M": M}, base=skin)
	m.box((4.5, 0, 1.5), (11.5, 4.5, 6), skin, faces={"north": face, "up": fabric(Pl)})  # head
	gill = pattern([
		"G.G",
		"GGG",
		".GG",
		"GGG",
		"G.G",
	], {"G": G}, anchor="tl")
	top_gill = pattern(["G.G.G.G", "GGGGGGG"], {"G": G}, anchor="tl")
	for (x0, x1) in ((2, 4.5), (11.5, 14)):
		m.box((x0, 1, 3.5), (x1, 6, 3.5), None, faces={"north": gill, "south": gill})
	m.box((4.5, 4.5, 3.5), (11.5, 6.5, 3.5), None, faces={"north": top_gill, "south": top_gill})
	return m


def enderman_plush() -> Model:
	m = Model("block/enderman_plush", TEX + "enderman_plush")
	B = c("1e1b26")
	Bl = c("2c2738")
	E = c("d36cf0")
	El = c("f7c8ff")
	G = c("5fae3d")
	Gl = c("7cc955")
	D = c("8a5a3a")
	Dd = c("6b4429")
	skin = fabric(B, weave=1.1)
	for x0 in (6, 9):
		m.box((x0, 0, 7.5), (x0 + 1, 7, 8.5), skin)  # long legs
	m.box((5.5, 7, 7), (10.5, 11, 9), skin)  # body
	for x0 in (4.5, 10.5):  # arms reach forward to hug a tiny grass block
		m.box((x0, 7, 7.5), (x0 + 1, 11, 8.5), skin, skip="down")
		m.box((x0, 6, 4), (x0 + 1, 7, 8.5), skin)
	dirt_side = pattern(["GGG", "DGD", "DDD"], {"G": Gl, "D": D}, anchor="tl")
	m.box((5.5, 5, 3.5), (10.5, 8, 6.5), None, faces={
		"north": pattern(["GGGGG", "DGDDG", "DDDDD"], {"G": Gl, "D": D}, anchor="tl"),
		"south": pattern(["GGGGG", "GDDGD", "DDDDD"], {"G": Gl, "D": D}, anchor="tl"),
		"east": dirt_side, "west": dirt_side,
		"up": pattern(["GgGgG", "gGGgG", "GGgGg"], {"G": G, "g": Gl}, anchor="tl"),
		"down": plain(Dd),
	})
	m.box((5, 11, 5.5), (11, 16, 10.5), skin, faces={"up": fabric(Bl, weave=1.2)})  # head
	m.box((5, 12.5, 5.45), (11, 13.5, 5.45), None, faces={"north": pattern(["EL..LE"], {"E": E, "L": El})}, emission=15, shade=False)
	return m


def sniffer_plush() -> Model:
	m = Model("block/sniffer_plush", TEX + "sniffer_plush")
	R = c("b5463a")
	Rd = c("8c3129")
	Rl = c("cf6550")
	G = c("5f9a3c")
	Gl = c("80bd52")
	Gd = c("477a2c")
	N = c("6e2b22")
	Nl = c("e0bf7c")
	Y = c("e8d24a")
	K = c("1f1a14")
	fur = fabric(R, weave=0.92)
	for x0 in (4.5, 10):
		for z0 in (5.5, 8.25, 11):
			m.box((x0, 0, z0), (x0 + 1.5, 1.5, z0 + 1.5), fabric(Rd), skip="up")  # six legs
	m.box((4, 1.5, 5), (12, 8, 13), fur, faces={"up": plain(G)})  # body
	moss = tiled(["aBab", "bbaB", "abBa", "Baab"], {"a": G, "b": Gl, "B": Gd})
	m.box((4.5, 8, 5.5), (11.5, 9, 12.5), moss, skip="down")  # mossy back
	sprout = pattern([".Y", "G.", "G."], {"Y": Y, "G": Gl}, anchor="tl")
	sprout_b = pattern(["Y.", ".G", ".G"], {"Y": Y, "G": Gl}, anchor="tl")
	m.box((6, 9, 7.5), (8, 12, 7.5), None, faces={"north": sprout, "south": sprout_b})  # tiny flower
	face = pattern([
		"      ",
		"WK  KW",
		"      ",
		"      ",
		"      ",
	], {"K": K, "W": c("bfe39a")}, base=fur)
	m.box((5, 3, 2), (11, 8, 5), fur, faces={"north": face, "up": fabric(Rl)})  # head
	m.box((5.5, 2.5, 0.5), (10.5, 4.5, 2), flat(N), faces={"north": pattern(["NLLLN", "NKNKN"], {"N": N, "L": Nl, "K": K})}, skip="south")  # big nose
	return m


PLUSHIES = {
	"creeper_plush": creeper_plush,
	"pig_plush": pig_plush,
	"teddy_bear": teddy_bear,
	"axolotl_plush": axolotl_plush,
	"enderman_plush": enderman_plush,
	"sniffer_plush": sniffer_plush,
}


def build_plushies():
	for pid, fn in PLUSHIES.items():
		write_model(fn())
		write_blockstate(pid, facing_variants(lambda p, pid=pid: f"block/{pid}"))
		write_item_def(pid, f"block/{pid}")
		write_loot_self(pid)


# ----------------------------------------------------------------------------------------------------------------
# puzzle cube (Rubik's style): 4 states, 0 = solved
# ----------------------------------------------------------------------------------------------------------------

CUBE_COLORS = {"W": c("f4f4f4"), "Y": c("ffd83b"), "R": c("d93636"), "O": c("ff8a1f"), "B": c("2f6fe0"), "G": c("2fb84a")}
SOLVED = {"up": "W", "down": "Y", "north": "G", "south": "B", "east": "R", "west": "O"}
SCRAMBLES = [
	None,
	{"up": "WWRGWBWYW", "north": "GOGGGRGBG", "east": "RRWRRYRGR", "south": "BBOBBWBRB", "west": "OYOOOGOBO", "down": "YRYYYOYWY"},
	{"up": "RWBWWGOWY", "north": "GYGBGGRGW", "east": "WRRORRBRR", "south": "BGBBBYBOB", "west": "OOGOOWOYO", "down": "YBYRYOYGY"},
	{"up": "GWOBWRWYW", "north": "YGRGGOGWG", "east": "RBRWRRGRY", "south": "OBBBBGBRB", "west": "OROYOOBOW", "down": "YOYGYBYRW"},
]


def cube_face(stickers: str):
	frame = c("1b1b20")

	def fn(x, y, w, h):
		cell_x, in_x = divmod(x - 1, 4)
		cell_y, in_y = divmod(y - 1, 4)
		if x == 0 or y == 0 or in_x == 3 or in_y == 3 or cell_x > 2 or cell_y > 2:
			return frame
		col = CUBE_COLORS[stickers[cell_y * 3 + cell_x]]
		if in_x == 0 and in_y == 0:
			return shade(col, 1.25)
		if in_x == 2 and in_y == 2:
			return shade(col, 0.85)
		return col

	return func(fn)


def puzzle_cube(state: int) -> Model:
	m = Model(f"block/puzzle_cube_{state}", TEX + f"puzzle_cube_{state}")
	faces = {}
	for d in ("north", "south", "east", "west", "up", "down"):
		faces[d] = cube_face(SOLVED[d] * 9 if state == 0 else SCRAMBLES[state][d])
	m.box((1.5, 0, 1.5), (14.5, 13, 14.5), None, faces=faces)
	return m


def build_puzzle_cube():
	for s in range(4):
		write_model(puzzle_cube(s))
	write_blockstate("puzzle_cube", {f"state={s}": {"model": f"laptopcraft:block/puzzle_cube_{s}"} for s in range(4)})
	write_item_def("puzzle_cube", "block/puzzle_cube_1")
	write_loot_self("puzzle_cube")


def build_all():
	build_plushies()
	build_puzzle_cube()
