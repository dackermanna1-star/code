"""LaptopCraft toys: block models (rubber duck, plushies, puzzle cube) and 16x16 item icons.

Run: python3 tools/art/toys/build_all.py   (writes into src/main/resources)
"""
from __future__ import annotations

from lib import (CLEAR, Face, Model, c, edge, fabric, facing_variants, flat, func, icon_from_rows, mix, outline_icon, over,
	pattern, plain, shade, write_blockstate, write_flat_item, write_item_def, write_loot_self, write_model, write_png)

TEX = "block/toys/"


# ----------------------------------------------------------------------------------------------------------------
# rubber duck
# ----------------------------------------------------------------------------------------------------------------

def duck_model(name: str) -> Model:
	m = Model(name, TEX + "rubber_duck")
	Y = c("ffd52e")
	Yd = c("f2b51d")
	Yl = c("ffe86b")
	O = c("f08a24")
	Od = c("c9621a")
	K = c("1d1a22")
	W = c("ffffff")
	body = fabric(Y, weave=1.0)
	# body: round-ish tub
	m.box((5, 0, 5), (11, 4, 12), body, faces={
		"up": flat(Yl, hi=1.04, lo=0.97),
		"south": over(flat(Y), edge(Yd, "b")),
	})
	m.box((5.5, 0.5, 4.5), (10.5, 3.5, 5), flat(Y), skip="south down")  # chest bulge
	m.box((5.5, 0.5, 12), (10.5, 3, 12.5), flat(Y), skip="north down")  # rear bulge
	# tail flick
	m.box((6.5, 3, 11), (9.5, 5, 12.5), flat(Y), faces={"up": flat(Yl), "south": flat(Yd)}, skip="down")
	# wings
	for x0 in (4.5, 11):
		m.box((x0, 1, 6.5), (x0 + 0.5, 3, 10.5), over(flat(Y), edge(Yd, "tbr" if x0 > 8 else "tbl")), skip="up down")
	# head
	eye_front = pattern([
		"    ",
		"K  K",
		"    ",
		"    ",
	], {"K": K}, base=flat(Y))
	eye_side = pattern([
		"    ",
		" WK ",
		" KK ",
		"    ",
	], {"K": K, "W": W}, base=flat(Y))
	eye_side_r = pattern([
		"    ",
		" KW ",
		" KK ",
		"    ",
	], {"K": K, "W": W}, base=flat(Y))
	m.box((6, 4, 4.5), (10, 8, 8.5), flat(Y), faces={
		"north": eye_front,
		"west": eye_side,
		"east": eye_side_r,
		"up": over(flat(Yl), pattern([" Y", "Y "], {"Y": Yd}, anchor="tl")),
	})
	# beak (upper + lower)
	m.box((7, 5, 2.5), (9, 6, 4.5), flat(O), faces={"up": flat(shade(O, 1.1)), "down": plain(Od)}, skip="south")
	m.box((7.25, 4.5, 3), (8.75, 5, 4.5), plain(Od), skip="south up")
	return m


def build_duck():
	m = duck_model("block/rubber_duck")
	write_model(m)
	floating = duck_model("block/rubber_duck_floating").translated(dy=12)
	floating.display = None
	write_model(floating)
	write_blockstate("rubber_duck", facing_variants(
		lambda p: "block/rubber_duck_floating" if p["waterlogged"] == "true" else "block/rubber_duck",
		{"waterlogged": ["false", "true"]}))
	write_item_def("rubber_duck", "block/rubber_duck")
	write_loot_self("rubber_duck")


def build_all():
	import icons
	import plush
	build_duck()
	plush.build_all()
	icons.build_all()
