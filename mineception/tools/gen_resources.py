#!/usr/bin/env python3
"""Generates Mineception's laptop resources.

The block model is built from the numbers in LaptopGeometry.java (deck box, lid box and screen rectangle), so the model,
the dream raycaster and the live screen renderer always agree on where the screen is. The 16x16 textures and the mod
icon are painted pixel by pixel in a Minecraft-like style.

Usage: python3 tools/gen_resources.py   (from the mineception/ directory or anywhere else)
"""
import json
import random
import re
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
GEOMETRY = ROOT / "src/main/java/com/mineception/dream/LaptopGeometry.java"
ASSETS = ROOT / "src/main/resources/assets/mineception"
DATA = ROOT / "src/main/resources/data"


# ---------------------------------------------------------------------------------------------------------- geometry

def read_geometry():
	"""Pixel coordinates (0..16) of the deck, the lid and the screen, parsed from LaptopGeometry.java."""
	src = GEOMETRY.read_text()

	def array(name):
		m = re.search(name + r"\s*=\s*\{([^}]*)\}", src)
		return [float(v) * 16 for v in m.group(1).split(",")]

	def scalar(name):
		m = re.search(name + r"\s*=\s*([0-9.]+)", src)
		return float(m.group(1)) * 16

	return {
		"base": array("BASE"),
		"lid": array("LID"),
		"screen": [scalar("SCREEN_MIN_X"), scalar("SCREEN_MIN_Y"), scalar("SCREEN_MAX_X"), scalar("SCREEN_MAX_Y")],
		"screen_z": scalar("SCREEN_Z"),
	}


def num(v):
	return int(v) if float(v).is_integer() else round(v, 4)


def face(texture, uv):
	return {"texture": texture, "uv": [num(v) for v in uv]}


def block_model(g):
	b = g["base"]
	l = g["lid"]
	# Default UV for each face of an element, as Minecraft derives it (u, v in texture pixels)
	def uv(box, side):
		x0, y0, z0, x1, y1, z1 = box
		return {
			"up": [x0, z0, x1, z1],
			"down": [x0, 16 - z1, x1, 16 - z0],
			"north": [16 - x1, 16 - y1, 16 - x0, 16 - y0],
			"south": [x0, 16 - y1, x1, 16 - y0],
			"west": [z0, 16 - y1, z1, 16 - y0],
			"east": [16 - z1, 16 - y1, 16 - z0, 16 - y0],
		}[side]

	deck = {
		"name": "deck",
		"from": [num(v) for v in b[:3]],
		"to": [num(v) for v in b[3:]],
		"faces": {
			"up": face("#keyboard", uv(b, "up")),
			"down": face("#body", uv(b, "down")),
			"north": face("#body", uv(b, "north")),
			"south": face("#body", uv(b, "south")),
			"west": face("#body", uv(b, "west")),
			"east": face("#body", uv(b, "east")),
		},
	}
	lid = {
		"name": "lid",
		"from": [num(v) for v in l[:3]],
		"to": [num(v) for v in l[3:]],
		"faces": {
			"south": face("#screen", uv(l, "south")),
			"north": face("#lid", uv(l, "north")),
			"up": face("#body", uv(l, "up")),
			"down": face("#body", uv(l, "down")),
			"west": face("#body", uv(l, "west")),
			"east": face("#body", uv(l, "east")),
		},
	}
	assert abs(l[5] - g["screen_z"]) < 1e-6, "screen must lie on the lid's front face"
	return {
		"parent": "minecraft:block/block",
		"textures": {
			"particle": "mineception:block/laptop_body",
			"body": "mineception:block/laptop_body",
			"keyboard": "mineception:block/laptop_keyboard",
			"screen": "mineception:block/laptop_screen",
			"lid": "mineception:block/laptop_lid",
		},
		# The model's screen faces south, opposite to most vanilla blocks, so the held and GUI views turn it around
		"display": {
			"gui": {"rotation": [30, 45, 0], "translation": [0, 1.5, 0], "scale": [0.75, 0.75, 0.75]},
			"ground": {"rotation": [0, 0, 0], "translation": [0, 3, 0], "scale": [0.375, 0.375, 0.375]},
			"fixed": {"rotation": [0, 180, 0], "translation": [0, 2, 0], "scale": [0.6, 0.6, 0.6]},
			"thirdperson_righthand": {"rotation": [75, 225, 0], "translation": [0, 2.5, 0], "scale": [0.375, 0.375, 0.375]},
			"firstperson_righthand": {"rotation": [0, 225, 0], "translation": [0, 2, 0], "scale": [0.4, 0.4, 0.4]},
			"firstperson_lefthand": {"rotation": [0, 45, 0], "translation": [0, 2, 0], "scale": [0.4, 0.4, 0.4]},
		},
		"elements": [deck, lid],
	}


# ---------------------------------------------------------------------------------------------------------- textures

BODY_HI = (104, 109, 118)
BODY = (74, 78, 86)
BODY_LO = (56, 59, 66)
BODY_DARK = (38, 40, 45)
KEY = (22, 23, 27)
KEY_TOP = (44, 46, 52)
BEZEL = (17, 18, 21)
BEZEL_HI = (30, 32, 36)
SCREEN_TOP = (10, 14, 24)
SCREEN_BOTTOM = (4, 6, 10)
GLINT = (34, 42, 58)
LOGO = (196, 202, 212)
LOGO_SHADE = (138, 144, 156)


def jitter(rng, c, amount=5):
	d = rng.randint(-amount, amount)
	return tuple(max(0, min(255, v + d)) for v in c) + (255,)


def new_texture():
	return Image.new("RGBA", (16, 16), BODY + (255,))


def brushed(rng):
	"""Graphite aluminium with fine horizontal brushing, like Minecraft's metal blocks."""
	img = new_texture()
	for y in range(16):
		row = rng.randint(-3, 3)
		for x in range(16):
			c = tuple(v + row for v in BODY)
			img.putpixel((x, y), jitter(rng, c, 3))
	for i in range(16):
		img.putpixel((i, 0), jitter(rng, BODY_HI, 2))
		img.putpixel((i, 15), jitter(rng, BODY_LO, 2))
		img.putpixel((0, i), jitter(rng, BODY_HI if i < 15 else BODY_LO, 2))
		img.putpixel((15, i), jitter(rng, BODY_LO, 2))
	return img


def keyboard(rng, g):
	"""Deck top: hinge, staggered key rows, a space bar, the touchpad and the front edge."""
	img = brushed(rng)
	x0, _, z0, x1, _, z1 = [int(round(v)) for v in g["base"]]
	for x in range(x0, x1):
		img.putpixel((x, z0), jitter(rng, BODY_DARK, 2))
	rows = [z0 + 1 + i for i in range(4)]
	for i, v in enumerate(rows):
		for x in range(x0 + 1, x1 - 1):
			on_key = (x + i) % 2 == 0
			img.putpixel((x, v), jitter(rng, KEY if on_key else BODY_LO, 2))
	space = z0 + 5
	for x in range(x0 + 1, x1 - 1):
		mid = x0 + 4 <= x < x1 - 4
		edge = x in (x0 + 1, x1 - 2)
		img.putpixel((x, space), jitter(rng, KEY if mid or edge else BODY_LO, 2))
	pad_x0 = (x0 + x1) // 2 - 2
	for v in range(z0 + 7, min(z1 - 1, z0 + 10)):
		for x in range(pad_x0, pad_x0 + 4):
			border = v == z0 + 7 or x in (pad_x0, pad_x0 + 3)
			img.putpixel((x, v), jitter(rng, BODY_LO if border else BODY_HI, 2))
	for x in range(x0, x1):
		img.putpixel((x, z1 - 1), jitter(rng, BODY_HI, 2))
	# Key tops catch a little light
	for i, v in enumerate(rows[:1]):
		for x in range(x0 + 1, x1 - 1):
			if (x + i) % 2 == 0 and rng.random() < 0.25:
				img.putpixel((x, v), jitter(rng, KEY_TOP, 2))
	return img


def screen(rng, g):
	"""Lid front: black bezel around a dark screen (the live picture is drawn over it), with a faint glint."""
	img = Image.new("RGBA", (16, 16), BEZEL + (255,))
	for y in range(16):
		for x in range(16):
			img.putpixel((x, y), jitter(rng, BEZEL, 2))
	sx0, sy0, sx1, sy1 = g["screen"]
	# Lid front maps x -> u and y -> v = 16 - y; paint whole pixels that are at least half screen
	u0, u1 = int(round(sx0)), int(round(sx1))
	v0, v1 = int(16 - sy1 + 0.5), int(16 - sy0)
	for v in range(v0, v1):
		t = (v - v0) / max(1, v1 - v0 - 1)
		base = tuple(int(a + (b - a) * t) for a, b in zip(SCREEN_TOP, SCREEN_BOTTOM))
		for u in range(u0, u1):
			img.putpixel((u, v), jitter(rng, base, 1))
	for k in range(3):
		u = u1 - 3 - k
		v = v0 + 1 + k
		if u0 <= u < u1 and v0 <= v < v1:
			img.putpixel((u, v), jitter(rng, GLINT, 2))
	lid = g["lid"]
	bottom = int(16 - lid[1]) - 1
	img.putpixel((8, bottom), jitter(rng, BEZEL_HI, 1))
	return img


def lid_back(rng, g):
	"""Lid back: brushed graphite with a silver spinning top, the dream totem."""
	img = brushed(rng)
	lid = g["lid"]
	top_v = int(16 - lid[4])
	bottom_v = int(16 - lid[1])
	cx = 8
	cy = (top_v + bottom_v) // 2
	shape = [
		"..#..",
		".###.",
		"#####",
		".###.",
		"..#..",
	]
	oy = cy - 2
	ox = cx - 3
	for j, row in enumerate(shape):
		for i, ch in enumerate(row):
			if ch == "#":
				shade = LOGO if i <= 2 else LOGO_SHADE
				img.putpixel((ox + i, oy + j), jitter(rng, shade, 3))
	img.putpixel((ox + 2, oy - 1), jitter(rng, LOGO_SHADE, 3))
	return img


# ---------------------------------------------------------------------------------------------------------- icon

LEVELS = [
	# sky top, sky horizon, ground, left wall, right wall, accent
	((72, 104, 150), (150, 170, 196), (52, 55, 60), (150, 92, 78), (118, 118, 122), (240, 175, 21)),  # city
	((120, 70, 40), (226, 196, 150), (160, 39, 34), (236, 230, 222), (236, 230, 222), (232, 192, 112)),  # hotel
	((150, 178, 210), (226, 236, 246), (249, 254, 254), (122, 121, 122), (122, 121, 122), (60, 90, 60)),  # fortress
	((62, 74, 106), (224, 154, 92), (219, 207, 163), (150, 140, 110), (150, 140, 110), (43, 81, 158)),  # limbo
]


def put(img, x, y, c):
	if 0 <= x < img.width and 0 <= y < img.height:
		img.putpixel((x, y), c + (255,) if len(c) == 3 else c)


def rect(img, x0, y0, x1, y1, c):
	for y in range(y0, y1):
		for x in range(x0, x1):
			put(img, x, y, c)


def scene(img, x0, y0, x1, y1, depth, rng):
	"""One dream level seen from its spawn, with its laptop (and the next level) in the middle."""
	w = x1 - x0
	h = y1 - y0
	if depth >= len(LEVELS):
		for y in range(y0, y1):
			for x in range(x0, x1):
				g = rng.randint(40, 200)
				put(img, x, y, (g, g, g))
		return
	sky_top, sky_low, ground, left, right, accent = LEVELS[depth]
	horizon = y0 + int(h * 0.58)
	for y in range(y0, y1):
		for x in range(x0, x1):
			if y < horizon:
				t = (y - y0) / max(1, horizon - y0)
				c = tuple(int(a + (b - a) * t) for a, b in zip(sky_top, sky_low))
			else:
				t = (y - horizon) / max(1, y1 - horizon)
				c = tuple(int(v * (0.85 + 0.15 * t)) for v in ground)
			put(img, x, y, c)
	cx = (x0 + x1) // 2
	if depth == 0:
		# Street converging to the vanishing point, towers on both sides with window grids
		for y in range(horizon, y1):
			half = int((y - horizon) * 0.9) + 1
			for x in range(cx - half, cx + half):
				put(img, x, y, (40, 42, 46))
		for side, col in ((-1, left), (1, right)):
			bw = max(2, w // 4)
			bx0 = x0 if side < 0 else x1 - bw
			top = y0 + int(h * 0.08)
			rect(img, bx0, top, bx0 + bw, horizon + 2, col)
			for y in range(top + 2, horizon - 1, 3):
				for x in range(bx0 + 1, bx0 + bw - 1, 2):
					put(img, x, y, accent if rng.random() < 0.3 else (30, 34, 44))
	elif depth == 1:
		# Red carpet to the far door, columns on both sides, warm lamps
		for y in range(horizon, y1):
			half = max(1, int((y - horizon) * 0.35))
			for x in range(cx - half, cx + half + 1):
				put(img, x, y, ground)
			for x in range(x0, cx - half - 1):
				put(img, x, y, (230, 224, 214) if (x + y) % 4 < 2 else (132, 134, 133))
			for x in range(cx + half + 2, x1):
				put(img, x, y, (230, 224, 214) if (x + y) % 4 < 2 else (132, 134, 133))
		for k in (0.18, 0.82):
			px = x0 + int(w * k)
			rect(img, px - max(1, w // 24), y0, px + max(1, w // 24) + 1, horizon + int(h * 0.15), left)
		for k in (0.3, 0.5, 0.7):
			put(img, x0 + int(w * k), y0 + 1, accent)
	elif depth == 2:
		# Frozen lake and a grey keep with towers against the snowy sky, spruces at the sides
		rect(img, x0, horizon - 1, x1, horizon + max(1, h // 8), (145, 183, 253))
		kw = max(3, w // 3)
		kx0 = cx - kw // 2
		ktop = y0 + int(h * 0.22)
		rect(img, kx0, ktop + 2, kx0 + kw, horizon - 1, left)
		rect(img, kx0, ktop, kx0 + 2, ktop + 2, left)
		rect(img, kx0 + kw - 2, ktop, kx0 + kw, ktop + 2, left)
		put(img, cx, ktop + 4, (232, 192, 112))
		for tx in (x0 + 2, x1 - 3):
			for k in range(4):
				for dx in range(-k // 2, k // 2 + 1):
					put(img, tx + dx, horizon - 5 + k, accent)
	else:
		# Dusk sea and a broken pillar
		rect(img, x0, horizon - 1, x1, horizon + max(1, h // 6), accent)
		rect(img, x0 + w // 5, y0 + int(h * 0.3), x0 + w // 5 + max(1, w // 12), horizon, left)
	# The laptop on its desk in the middle of the view, showing the next level
	lw = max(4, int(w * 0.42))
	lh = max(3, int(lw * 0.62))
	lx0 = cx - lw // 2
	ly0 = horizon - lh + int(h * 0.12)
	rect(img, lx0, ly0, lx0 + lw, ly0 + lh, (20, 21, 24))
	desk_c = (120, 90, 60) if depth != 1 else (66, 43, 20)
	rect(img, lx0 + lw // 6, ly0 + lh, lx0 + lw - lw // 6, min(y1, ly0 + lh + max(2, lh // 2)), desk_c)
	b = 1
	if lw - 2 * b >= 2 and lh - 2 * b >= 2:
		scene(img, lx0 + b, ly0 + b, lx0 + lw - b, ly0 + lh - b, depth + 1, rng)


def icon(rng):
	size = 128
	img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
	# Lid with a thick bezel
	lx0, ly0, lx1, ly1 = 10, 8, 118, 84
	rect(img, lx0, ly0, lx1, ly1, (24, 25, 29))
	rect(img, lx0 + 1, ly0 + 1, lx1 - 1, ly0 + 2, (52, 55, 62))
	scene(img, lx0 + 5, ly0 + 5, lx1 - 5, ly1 - 6, 0, rng)
	# Deck in perspective with a keyboard
	for y in range(ly1, ly1 + 30):
		t = (y - ly1) / 29
		inset = int(10 * (1 - t))
		for x in range(lx0 - 4 + inset, lx1 + 4 - inset):
			edge = y == ly1 + 29 or x in (lx0 - 4 + inset, lx1 + 3 - inset)
			put(img, x, y, BODY_LO if edge else BODY)
	for row in range(4):
		y = ly1 + 4 + row * 4
		t = (y - ly1) / 29
		inset = int(10 * (1 - t)) + 8
		for x in range(lx0 + inset, lx1 - inset, 4):
			rect(img, x, y, x + 3, y + 2, KEY)
	rect(img, 54, ly1 + 21, 74, ly1 + 27, BODY_HI)
	return img


# ---------------------------------------------------------------------------------------------------------- data

def write_json(path, value):
	path.parent.mkdir(parents=True, exist_ok=True)
	path.write_text(json.dumps(value, indent=2) + "\n")


def main():
	g = read_geometry()
	rng = random.Random(0x6D696E65)
	textures = ASSETS / "textures/block"
	textures.mkdir(parents=True, exist_ok=True)
	brushed(rng).save(textures / "laptop_body.png")
	keyboard(rng, g).save(textures / "laptop_keyboard.png")
	screen(rng, g).save(textures / "laptop_screen.png")
	lid_back(rng, g).save(textures / "laptop_lid.png")
	icon(rng).save(ASSETS / "icon.png")

	write_json(ASSETS / "models/block/laptop.json", block_model(g))
	write_json(ASSETS / "models/item/laptop.json", {"parent": "mineception:block/laptop"})
	write_json(ASSETS / "items/laptop.json", {"model": {"type": "minecraft:model", "model": "mineception:item/laptop"}})
	write_json(ASSETS / "blockstates/laptop.json", {"variants": {
		"facing=south": {"model": "mineception:block/laptop"},
		"facing=west": {"model": "mineception:block/laptop", "y": 90},
		"facing=north": {"model": "mineception:block/laptop", "y": 180},
		"facing=east": {"model": "mineception:block/laptop", "y": 270},
	}})

	write_json(DATA / "mineception/recipe/laptop.json", {
		"type": "minecraft:crafting_shaped",
		"category": "misc",
		"key": {
			"I": "minecraft:iron_ingot",
			"P": "minecraft:glass_pane",
			"R": "minecraft:redstone",
			"D": "minecraft:diamond",
		},
		"pattern": ["IPI", "RDR", "III"],
		"result": {"count": 1, "id": "mineception:laptop"},
	})
	write_json(DATA / "mineception/advancement/recipes/misc/laptop.json", {
		"parent": "minecraft:recipes/root",
		"criteria": {
			"has_diamond": {"conditions": {"items": [{"items": "minecraft:diamond"}]}, "trigger": "minecraft:inventory_changed"},
			"has_the_recipe": {"conditions": {"recipe": "mineception:laptop"}, "trigger": "minecraft:recipe_unlocked"},
		},
		"requirements": [["has_the_recipe", "has_diamond"]],
		"rewards": {"recipes": ["mineception:laptop"]},
	})
	write_json(DATA / "mineception/loot_table/blocks/laptop.json", {
		"type": "minecraft:block",
		"pools": [{
			"bonus_rolls": 0.0,
			"conditions": [{"condition": "minecraft:survives_explosion"}],
			"entries": [{
				"type": "minecraft:item",
				"name": "mineception:laptop",
				"functions": [{
					"function": "minecraft:copy_components",
					"source": "block_entity",
					"include": ["mineception:laptop_data"],
				}],
			}],
			"rolls": 1.0,
		}],
		"random_sequence": "mineception:blocks/laptop",
	})
	write_json(DATA / "minecraft/tags/block/mineable/pickaxe.json", {"values": ["mineception:laptop"]})
	print("screen pixels on the lid:", g["screen"], "lid:", g["lid"])


if __name__ == "__main__":
	main()
