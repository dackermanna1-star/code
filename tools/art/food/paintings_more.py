"""More LaptopCraft gallery pieces (see paintings.py for the shared conventions)."""
from __future__ import annotations

import math

from paint import Canvas, hash01, rgb

FRAME = '#3b2614'
FRAME_HI = '#6b4524'
SKIN, SKIN_L, SKIN_D, NOSE = '#c4927a', '#d8aa90', '#9c6c56', '#b07a62'


# ==== The Creation of Steve (4x1) =================================================================
def creation_of_steve() -> Canvas:
	c = Canvas(64, 16)
	c.vgrad(0, 0, 64, 16, ['#6fa6d8', '#8dbce4', '#b9d6ea', '#e6dcc0'])
	for cx, cy, rx, ry in ((51, 12, 9, 2.6), (10, 2.5, 7, 1.8), (33, 14, 8, 1.8), (44, 2, 5, 1.4)):
		c.ellipse(cx, cy, rx, ry, '#e9eef2')
		c.ellipse(cx - 1, cy - 0.6, rx - 2, ry - 0.9, '#ffffff')
	skin, skin_d, skin_h, sleeve, sleeve_d = '#c69a7c', '#a07254', '#dcb293', '#1fa3a8', '#137a80'
	# Steve's arm from the left, relaxed, index finger extended
	c.rect(1, 8, 12, 4, sleeve)
	c.rect(1, 8, 12, 1, '#3cc4c8')
	c.rect(1, 11, 12, 1, sleeve_d)
	c.rect(13, 8, 10, 3, skin)
	c.rect(13, 8, 10, 1, skin_h)
	c.rect(13, 10, 10, 1, skin_d)
	c.rect(23, 7, 4, 4, skin)
	c.rect(23, 7, 4, 1, skin_h)
	c.rect(23, 10, 4, 1, skin_d)
	c.rect(27, 8, 3, 1, skin)
	c.px(29, 8, skin_d)
	c.px(27, 9, skin_d)
	# the divine arm from the right, in a rose cloak
	robe, robe_d, robe_h, dskin, dskin_d, dskin_h = '#b8434a', '#8a2a32', '#d86a6a', '#e2bc98', '#bc9472', '#f2d4b4'
	c.rect(50, 3, 13, 6, robe)
	c.rect(50, 3, 13, 1, robe_h)
	c.rect(50, 8, 13, 1, robe_d)
	c.rect(49, 4, 1, 4, robe_d)
	c.rect(40, 5, 9, 3, dskin)
	c.rect(40, 5, 9, 1, dskin_h)
	c.rect(40, 7, 9, 1, dskin_d)
	c.rect(36, 4, 4, 4, dskin)
	c.rect(36, 4, 4, 1, dskin_h)
	c.rect(36, 7, 4, 1, dskin_d)
	c.rect(33, 5, 3, 1, dskin)
	c.px(33, 5, dskin_d)
	c.px(36, 6, dskin_d)
	# the spark: a diamond between the fingertips
	for dx, dy, col in ((31, 5, '#e8ffff'), (30, 6, '#5ee6e6'), (31, 6, '#b4f6f6'), (32, 6, '#2bb8c8'), (31, 7, '#1d8f9c')):
		c.px(dx, dy, col)
	for sx, sy in ((31, 3), (28, 6), (34, 7), (31, 9), (29, 4), (33, 4)):
		c.px(sx, sy, '#ffffff')
	c.frame(FRAME)
	return c


# ==== Mona Llama (2x3) ============================================================================
def mona_llama() -> Canvas:
	c = Canvas(32, 48)
	# sfumato landscape: hazy sky, blue-green mountains, winding path, a river
	c.vgrad(0, 0, 32, 22, ['#b8c4a0', '#a4b48e', '#8ea27c'])
	for x in range(32):
		m = 13 + 3 * math.sin(x * 0.35) + 2 * math.sin(x * 0.9)
		for y in range(int(m), 26):
			c.dither_mix(x, y, rgb('#6e8a76'), rgb('#55705e'), (y - m) / 10)
	c.vgrad(0, 24, 32, 24, ['#6a6a44', '#4e4a2e', '#3a321e'])
	for k in range(14):
		px_ = 3 + int(2 * math.sin(k * 0.8)) + k // 4
		c.px(px_, 24 + k, '#a08a5a')
		c.px(px_ + 1, 24 + k, '#8a744a')
	c.line(27, 22, 29, 30, '#8a744a')
	c.line(28, 22, 30, 30, '#9aa88a')
	# dark veil of wool hair framing the face
	c.rect(7, 7, 18, 24, '#2c1e12')
	c.poly([(7, 20), (7, 31), (3, 34), (4, 26)], '#2c1e12')
	c.poly([(25, 20), (25, 31), (29, 34), (28, 26)], '#2c1e12')
	# robe with a soft neckline and gathered folds
	c.poly([(2, 48), (3, 36), (8, 30), (24, 30), (29, 36), (30, 48)], '#3a3020')
	for fx in (9, 13, 19, 23):
		c.line(fx, 34, fx - 1, 47, '#4e4228')
	c.poly([(11, 30), (21, 30), (19, 35), (13, 35)], '#d8c6a4')
	c.hline(11, 21, 30, '#6e5a3a')
	# llama head (front view): ears, face, long snout
	wool, wool_l, wool_d, snout = '#e8dcc0', '#f6eedc', '#c8b898', '#d8c8a8'
	c.rect(10, 4, 3, 6, wool)
	c.rect(19, 4, 3, 6, wool)
	c.rect(10, 4, 1, 6, wool_l)
	c.rect(19, 4, 1, 6, wool_l)
	c.rect(11, 5, 1, 4, '#c89a8a')
	c.rect(20, 5, 1, 4, '#c89a8a')
	c.rect(9, 9, 14, 13, wool)
	c.rect(9, 9, 14, 1, wool_l)
	c.rect(9, 9, 1, 13, wool_l)
	c.rect(22, 9, 1, 13, wool_d)
	c.rect(12, 15, 8, 10, snout)
	c.rect(12, 15, 8, 1, wool_l)
	c.rect(19, 15, 1, 10, wool_d)
	c.rect(12, 24, 8, 1, wool_d)
	c.rect(13, 25, 6, 5, wool)
	c.rect(18, 25, 1, 5, wool_d)
	# eyes, nostrils and the famous faint smile
	c.rect(10, 13, 2, 2, '#1a1410')
	c.rect(20, 13, 2, 2, '#1a1410')
	c.px(10, 13, '#5a4a3a')
	c.px(20, 13, '#5a4a3a')
	c.px(14, 18, '#8a7660')
	c.px(17, 18, '#8a7660')
	c.hline(14, 17, 21, '#9a826a')
	c.px(13, 20, '#9a826a')
	c.px(18, 20, '#9a826a')
	# folded arms: robe sleeves ending in neatly crossed hooves
	sleeve, sleeve_l, hoof = '#4e4228', '#64563a', '#5a4a3c'
	c.rect(4, 39, 15, 3, sleeve)
	c.hline(4, 18, 39, sleeve_l)
	c.rect(19, 39, 3, 3, wool)
	c.rect(21, 39, 1, 3, hoof)
	c.rect(13, 42, 15, 3, sleeve)
	c.hline(13, 27, 42, sleeve_l)
	c.rect(10, 42, 3, 3, wool)
	c.rect(10, 42, 1, 3, hoof)
	c.frame(FRAME, FRAME_HI)
	return c


# ==== The Creeper Scream (2x2) ====================================================================
def creeper_scream() -> Canvas:
	c = Canvas(32, 32)
	sky = ['#f2b84a', '#e8843a', '#d4462e', '#e8843a', '#f6cf6a', '#c8603a']
	for y in range(0, 16):
		for x in range(32):
			v = (y + 2.2 * math.sin(x * 0.28 + y * 0.15)) / 2.6
			i = int(v) % len(sky)
			f = v - int(v)
			c.dither_mix(x, y, rgb(sky[i]), rgb(sky[(i + 1) % len(sky)]), max(0, (f - 0.7) / 0.3))
	# swirling fjord and dark hills
	for y in range(10, 32):
		for x in range(32):
			shore = 14 + 3 * math.sin(y * 0.35) + (y - 10) * 0.25
			if x > shore:
				v = math.sin(y * 0.8 + x * 0.25)
				c.px(x, y, '#2a3f6a' if v < 0 else '#3e5f92')
			elif y > 12 + 1.5 * math.sin(x * 0.5):
				c.px(x, y, '#1e3a2a' if math.sin(x * 0.6 + y * 0.9) < 0.3 else '#2e5236')
	# the bridge sweeping in from the right
	c.poly([(32, 26), (32, 32), (0, 32), (0, 30), (12, 24), (32, 19)], '#a0643a')
	for k in range(0, 32, 2):
		c.line(k, 32, k + 10, 22 - k * 0.1, '#8a5230')
	c.line(0, 27, 32, 16, '#5a3418')
	c.line(0, 28, 32, 17, '#6e4224')
	for k in range(2, 32, 6):
		c.vline(k, 28 - k * 0.34, 31 - k * 0.2, '#5a3418')
	# the screaming Creeper (elongated head, hands on cheeks)
	g, gl, gd, face = '#5fbf4a', '#7ed866', '#3e8a32', '#101810'
	c.poly([(10, 31), (11, 24), (20, 24), (21, 31)], '#1c2a20')
	c.rect(11, 9, 10, 15, g)
	for y in range(9, 24):
		for x in range(11, 21):
			n = hash01(x // 2, y // 2, 21)
			if n < 0.25:
				c.px(x, y, gl)
			elif n > 0.8:
				c.px(x, y, gd)
	c.rect(12, 12, 3, 3, face)
	c.rect(17, 12, 3, 3, face)
	c.rect(15, 15, 2, 7, face)
	c.rect(14, 16, 4, 5, face)
	c.rect(13, 18, 6, 3, face)
	c.rect(9, 15, 2, 6, '#4aa83a')
	c.rect(21, 15, 2, 6, '#4aa83a')
	c.px(9, 15, gl)
	c.px(21, 15, gl)
	# two distant figures on the bridge
	c.rect(4, 22, 1, 4, '#1a1a22')
	c.rect(6, 21, 1, 5, '#1a1a22')
	c.frame(FRAME)
	return c


# ==== Sunflower Field (4x2) =======================================================================
def sunflower_field() -> Canvas:
	c = Canvas(64, 32)
	c.vgrad(0, 0, 64, 15, ['#3f86d4', '#5a9ee0', '#8cc4ee', '#c4e2f4'])
	for cx, cy, r in ((12, 4, 3), (16, 3, 3.5), (20, 5, 2.5), (38, 7, 2.5), (41, 6, 3), (44, 7.5, 2.2)):
		c.disc(cx, cy, r, '#ffffff')
	for cx, cy, r in ((14, 6, 3), (18, 6.5, 2.5), (40, 8.4, 2.6)):
		c.ellipse(cx, cy, r + 1, r * 0.6, '#dcecf8')
	c.radial(55, 5, 5, ['#fffbe0', '#fff2a0', '#ffd860', '#9cc8ee'])
	c.disc(55, 5, 2.4, '#fffef0')
	# rolling hills on the horizon with a few blocky oak trees
	for x in range(64):
		hy = 13 + 1.5 * math.sin(x * 0.16) + math.sin(x * 0.41)
		c.vline(x, int(hy), 16, '#5a9a6a')
		c.px(x, int(hy), '#7ab87a')
	for tx in (8, 27, 47):
		c.rect(tx - 1, 9, 4, 3, '#2e6a2e')
		c.rect(tx - 1, 9, 4, 1, '#4a8a3a')
		c.vline(tx + 1, 12, 13, '#5a3a1e')
	# the field, rows of sunflowers growing towards the viewer
	c.vgrad(0, 16, 64, 16, ['#6aa83a', '#4e9030', '#3a7a28'])
	rows = [(16, 0.6, 3), (18, 0.9, 4), (21, 1.4, 5), (25, 2.2, 7), (30, 3.2, 9)]
	for ry, size, spacing in rows:
		off = (ry * 3) % spacing
		for fx in range(-off, 66, spacing):
			jx = fx + int(hash01(fx, ry, 5) * 2)
			jy = ry + int(hash01(fx, ry, 6) * 2)
			if size < 1:
				c.px(jx, jy, '#ffd23a')
				continue
			c.vline(jx, jy, min(31, jy + int(size * 3)), '#2e6a22')
			c.disc(jx + 0.5, jy + 0.5, size + 0.6, '#f6c21a')
			c.disc(jx + 0.5, jy + 0.5, size * 0.55, '#6a3a12')
			if size > 2:
				c.px(jx - 1, jy - 1, '#ffe46a')
				c.px(jx, jy - int(size), '#ffe46a')
	c.frame(FRAME)
	return c


# ==== Villager with an Emerald Earring (2x2) ======================================================
def emerald_earring() -> Canvas:
	c = Canvas(32, 32)
	c.radial(14, 14, 26, ['#2a2418', '#1c1810', '#120f0a'])
	# yellow-ochre jacket and white collar
	c.poly([(4, 32), (6, 25), (12, 22), (24, 23), (29, 32)], '#a8803a')
	c.poly([(12, 22), (24, 23), (22, 26), (14, 26)], '#efe8d8')
	c.line(9, 27, 7, 31, '#7a5a22')
	# head (3/4 view)
	c.rect(10, 9, 13, 14, SKIN)
	c.rect(10, 9, 1, 14, SKIN_L)
	c.rect(22, 9, 1, 14, SKIN_D)
	c.rect(10, 22, 13, 1, SKIN_D)
	# villager unibrow, eyes, big nose
	c.hline(12, 21, 13, '#4a3020')
	c.rect(12, 14, 2, 1, '#ffffff')
	c.px(13, 14, '#2e8a3a')
	c.rect(18, 14, 2, 1, '#ffffff')
	c.px(18, 14, '#2e8a3a')
	c.rect(15, 14, 3, 7, NOSE)
	c.rect(15, 14, 1, 7, SKIN_L)
	c.rect(15, 21, 3, 1, SKIN_D)
	c.hline(13, 19, 22, '#7a4a3a')
	# Vermeer's turban: ultramarine wrap with a hanging yellow cloth
	c.rect(9, 5, 15, 5, '#2b4fa8')
	c.rect(9, 5, 15, 1, '#4a74d0')
	c.rect(9, 8, 15, 1, '#1e3a80')
	c.rect(11, 3, 10, 2, '#3a62c4')
	c.rect(13, 2, 6, 1, '#4a74d0')
	c.poly([(20, 4), (26, 5), (28, 16), (25, 21), (23, 12)], '#e8c050')
	c.line(24, 7, 26, 17, '#c89a30')
	# the emerald earring with its famous highlight
	c.px(9, 19, '#c8a050')
	c.rect(8, 20, 3, 3, '#1fa04a')
	c.px(9, 21, '#2ad46a')
	c.px(8, 20, '#b8ffd0')
	c.px(10, 22, '#127a34')
	c.frame(FRAME, FRAME_HI)
	return c


# ==== Ender Dragon Sunset (4x2) ===================================================================
def dragon_sunset() -> Canvas:
	c = Canvas(64, 32)
	c.vgrad(0, 0, 64, 26, ['#120a2e', '#1e0f40', '#2e1452', '#45196a', '#6a2276', '#962f7c', '#c4426e', '#e8634e', '#ff9a52', '#ffc46a'])
	for sx, sy in ((5, 3), (14, 6), (47, 4), (58, 7), (52, 2), (60, 1), (20, 1), (9, 8), (41, 1)):
		c.px(sx, sy, '#e8d8ff')
	c.radial(33, 17, 14, ['#fff4c8', '#ffe8a0', '#ffc878', '#ff9a5a', '#e8634e', '#c4426e'])
	c.disc(33, 17, 8.5, '#ffeab4')
	c.disc(33, 17, 7.5, '#fff4cc')
	# the End islands and obsidian pillars in silhouette, crystals glowing on top
	for x in range(64):
		top = 26 + 1.4 * math.sin(x * 0.3) + 1.0 * math.sin(x * 0.11 + 2)
		c.vline(x, int(top), 31, '#2a1440')
		c.px(x, int(top), '#4a2460')
	for px_, top, w in ((4, 12, 3), (12, 17, 3), (48, 16, 2), (54, 10, 4), (60, 15, 3)):
		c.rect(px_, top, w, 32 - top, '#140a22')
		c.rect(px_, top, 1, 32 - top, '#24143a')
		c.px(px_ + w // 2, top - 1, '#ff9ae0')
		c.px(px_ + w // 2, top - 2, '#ffffff')
	# the Ender Dragon in profile, crossing the setting sun
	d, bone = '#0c0614', '#2a1840'
	c.poly([(24, 16), (19, 24), (25, 21), (28, 25), (31, 18)], '#1a0c26')  # far wing
	c.ellipse(30, 16.5, 6.5, 2.4, d)  # body
	c.line(18, 14, 24, 16, d)  # neck
	c.line(18, 15, 24, 17, d)
	c.line(17, 14, 23, 15, d)
	c.rect(11, 13, 7, 3, d)  # head
	c.rect(9, 14, 3, 2, d)  # snout
	c.px(9, 16, d)  # open jaw
	c.px(10, 17, d)
	c.px(15, 12, d)  # horns
	c.px(16, 11, d)
	c.px(13, 13, '#d07aff')  # eye
	c.px(14, 13, '#f2c4ff')
	tail = [(36, 16), (42, 15), (47, 13), (52, 14), (57, 12), (61, 11)]
	for (x0, y0), (x1, y1) in zip(tail, tail[1:]):
		c.line(x0, y0, x1, y1, d)
		if x0 < 48:
			c.line(x0, y0 + 1, x1, y1 + 1, d)
	for sx in range(24, 58, 4):  # spikes along the back and tail
		yy = 13 if sx < 36 else int(16 - (sx - 36) * 0.18)
		c.px(sx, yy, d)
	c.poly([(27, 15), (30, 2), (34, 5), (38, 3), (40, 8), (38, 11), (35, 15)], d)  # near wing, raised
	for tx, ty in ((30, 2), (34, 5), (38, 3)):
		c.line(28, 15, tx, ty, bone)
	c.line(28, 18, 28, 20, d)  # legs
	c.line(33, 18, 34, 20, d)
	c.frame(FRAME)
	return c


# ==== Cherry Grove at Dawn (3x2) ==================================================================
def cherry_grove_dawn() -> Canvas:
	c = Canvas(48, 32)
	c.vgrad(0, 0, 48, 17, ['#94b6e2', '#c4c4e4', '#f2c8c8', '#ffdcb4'])
	c.radial(31, 16, 5, ['#fffbe8', '#fff0c0', '#ffd8b0'])
	for x in range(48):
		m = 11 + 2.5 * math.sin(x * 0.2 + 1) + math.sin(x * 0.5)
		c.vline(x, int(m), 17, '#b49ccc')
		m2 = 14 + 1.5 * math.sin(x * 0.27 + 3)
		c.vline(x, int(m2), 17, '#9c86bc')
	# pond reflecting the dawn
	c.vgrad(0, 17, 48, 15, ['#e8c4cc', '#c8b8dc', '#a8aed8', '#8aa0cc'])
	for y in range(19, 31, 3):
		for x in range((y * 5) % 7, 48, 9):
			c.hline(x, x + 3, y, '#f4dce4')
	# grassy banks sprinkled with pink petals
	bank_a, bank_b = '#6aaa52', '#5a9a46'
	c.poly([(0, 17), (12, 18), (18, 22), (14, 27), (0, 32)], bank_a)
	c.poly([(48, 19), (38, 20), (34, 25), (40, 32), (48, 32)], bank_b)
	for y in range(17, 32):
		for x in range(48):
			col = c.get(x, y)
			if (col == rgb(bank_a)).all() or (col == rgb(bank_b)).all():
				if hash01(x, y, 31) < 0.18:
					c.px(x, y, '#f6a8cc')
				elif hash01(x, y, 32) < 0.12:
					c.px(x, y, '#86c46a')
	# cherry trees: dark trunks and blocky blossom canopies
	trunk = '#4a2830'
	c.line(6, 22, 8, 10, trunk)
	c.line(7, 22, 9, 10, trunk)
	c.line(8, 13, 13, 9, trunk)
	c.line(42, 24, 41, 12, trunk)
	c.line(43, 24, 42, 12, trunk)
	c.line(41, 15, 37, 11, trunk)
	for cx, cy, w, h in ((2, 3, 9, 5), (7, 1, 9, 5), (11, 5, 6, 4), (0, 7, 7, 4), (35, 6, 8, 4), (40, 4, 8, 5), (44, 9, 4, 3)):
		for y in range(cy, cy + h):
			for x in range(cx, cx + w):
				n = hash01(x // 2, y // 2, 41)
				c.px(x, y, '#f7b6d2' if n < 0.45 else ('#e98ab6' if n < 0.85 else '#c8609a'))
		c.hline(cx, cx + w - 1, cy, '#ffd0e4')
	for px_, py in ((20, 6), (24, 10), (17, 12), (28, 4), (33, 13), (14, 15), (26, 14), (22, 2)):
		c.px(px_, py, '#ffc0dc')
	c.frame(FRAME)
	return c


# ==== Still Life with Diamond Ore (2x2) ===========================================================
def diamond_still_life() -> Canvas:
	c = Canvas(32, 32)
	c.vgrad(0, 0, 32, 22, ['#5a4632', '#4a3826', '#3a2c1e'])
	c.poly([(0, 0), (9, 0), (6, 10), (8, 22), (0, 22)], '#6a2a2a')
	c.line(3, 0, 2, 21, '#4e1e1e')
	c.line(6, 1, 5, 21, '#8a3a36')
	# table and tablecloth
	c.rect(0, 22, 32, 10, '#6e4224')
	c.hline(0, 31, 22, '#8a5a32')
	for y in range(23, 32, 3):  # wood grain
		c.hline(0, 31, y, '#5e3820')
	c.poly([(8, 21), (23, 21), (25, 31), (6, 31)], '#ece6d8')
	c.poly([(19, 21), (23, 21), (25, 31), (21, 31)], '#d2c8b4')
	c.line(11, 22, 10, 31, '#c8beac')
	c.line(16, 22, 17, 31, '#d8d0c0')
	# diamond ore block in 3/4 view
	c.poly([(10, 11), (16, 8), (22, 11), (16, 14)], '#a2a2a2')
	c.poly([(10, 11), (16, 14), (16, 23), (10, 20)], '#808080')
	c.poly([(16, 14), (22, 11), (22, 20), (16, 23)], '#626262')
	for gx, gy, col in ((14, 10, '#7ef2ee'), (17, 11, '#4ad8d8'), (12, 14, '#4ad8d8'), (13, 17, '#7ef2ee'), (11, 18, '#2aa8b0'),
			(18, 16, '#3ac8cc'), (20, 14, '#2aa8b0'), (19, 19, '#3ac8cc'), (14, 20, '#2aa8b0')):
		c.px(gx, gy, col)
		c.px(gx + 1, gy, '#1a8a90')
	c.line(16, 14, 16, 23, '#4e4e4e')
	# red apple with leaf
	c.disc(6.5, 19.5, 3.2, '#c8282a')
	c.disc(6, 19, 2.2, '#e0403a')
	c.px(5, 18, '#ff9a8a')
	c.vline(7, 15, 16, '#5a3a1e')
	c.px(8, 15, '#4ea83a')
	c.px(9, 15, '#3a8a2a')
	# diamond pickaxe leaning on the right
	c.line(30, 30, 24, 14, '#7a4e26')
	c.line(31, 30, 25, 14, '#5a3818')
	for hx, hy in ((21, 13), (22, 12), (23, 12), (24, 12), (25, 12), (26, 13), (27, 14), (28, 15)):
		c.px(hx, hy, '#4ae2e0')
	for hx, hy in ((22, 13), (27, 15), (28, 16), (21, 14)):
		c.px(hx, hy, '#1a9a9a')
	c.px(23, 11, '#c8fffa')
	c.frame(FRAME, FRAME_HI)
	return c


# ==== Netherhawks (3x2) ===========================================================================
def netherhawks() -> Canvas:
	c = Canvas(48, 32)
	c.vgrad(0, 0, 48, 32, ['#1a0606', '#2c0a0a', '#3e1010'])
	for x in range(48):
		c.vline(x, 27, 31, '#4a1414' if (x // 3 + 27) % 2 else '#5a1a18')
	c.hline(0, 9, 30, '#ff7a1a')
	c.hline(1, 6, 31, '#ffb030')
	# a nether fortress bridge in the distance and a lavafall
	c.rect(0, 14, 12, 2, '#120406')
	for ax in (1, 5, 9):
		c.rect(ax, 16, 2, 6, '#120406')
	c.rect(2, 10, 3, 4, '#120406')
	c.vline(7, 1, 26, '#e8641a')
	c.vline(8, 3, 26, '#ff9a2a')
	c.hline(6, 9, 27, '#ffb030')
	# nether brick diner
	c.poly([(12, 8), (47, 6), (47, 27), (12, 27)], '#30161a')
	for y in range(8, 27):
		for x in range(12, 47):
			if y % 4 == 0 or (y % 4 != 0 and (x + (y // 4) * 3) % 6 == 0):
				c.px(x, y, '#200c10')
	c.poly([(12, 8), (47, 6), (47, 8), (12, 10)], '#5a1a1a')
	for x in range(18, 42, 3):
		c.px(x, 8 - (x - 12) * 0.06, '#ff5a3a')
	# the glowing window
	c.vgrad(14, 12, 32, 12, ['#f8e0a0', '#f2c66a', '#e8a448'])
	c.hline(14, 45, 11, '#1a0a0c')
	for wx in (24, 35):
		c.vline(wx, 12, 23, '#3a1a14')
	c.rect(14, 20, 32, 3, '#7a4a28')
	c.hline(14, 45, 20, '#9a6a3a')
	# a Blaze behind the counter
	c.rect(37, 14, 4, 4, '#f0b030')
	c.px(38, 15, '#2a1a0a')
	c.px(40, 15, '#2a1a0a')
	c.rect(37, 14, 4, 1, '#ffe070')
	for rx, ry in ((36, 18), (41, 18), (39, 19)):
		c.vline(rx, ry, ry + 1, '#e88a20')
	# a Piglin and a Wither Skeleton on stools
	c.rect(19, 15, 4, 4, '#e8a0a0')
	c.rect(18, 17, 2, 2, '#d88080')
	c.px(20, 16, '#2a1a1a')
	c.rect(19, 19, 4, 1, '#c8a040')
	c.rect(28, 15, 3, 4, '#2a2a2a')
	c.px(29, 16, '#0a0a0a')
	c.rect(28, 19, 3, 1, '#1a1a1a')
	for sx in (20, 29):
		c.vline(sx, 23, 26, '#2a1a14')
	# light spilling on the street
	for y in range(24, 27):
		for x in range(14, 46):
			c.dither_mix(x, y, c.get(x, y), rgb('#8a4a28'), 0.5 - (y - 24) * 0.15)
	c.frame(FRAME)
	return c


# ==== Villager Gothic (2x2) =======================================================================
def villager_gothic() -> Canvas:
	c = Canvas(32, 32)
	c.vgrad(0, 0, 32, 14, ['#9cc4e8', '#b8d6ee', '#d4e6f2'])
	c.rect(6, 4, 20, 10, '#ece6d6')
	c.poly([(4, 5), (16, 0), (28, 5)], '#8a3a2a')
	c.poly([(14, 11), (14, 6), (16, 4), (18, 6), (18, 11)], '#3a3a4a')
	c.vline(16, 5, 11, '#ece6d6')
	c.rect(0, 12, 32, 2, '#6a9a4a')

	def villager(x0, robe, robe_d, hat):
		c.rect(x0, 18, 11, 14, robe)
		c.rect(x0, 18, 1, 14, robe_d)
		c.rect(x0 + 10, 18, 1, 14, robe_d)
		c.rect(x0 + 3, 18, 5, 2, robe_d if hat else '#efe8d8')
		c.rect(x0 + 1, 7, 9, 11, SKIN)
		c.rect(x0 + 1, 7, 1, 11, SKIN_L)
		c.rect(x0 + 9, 7, 1, 11, SKIN_D)
		c.hline(x0 + 2, x0 + 8, 10, '#4a3020')
		c.px(x0 + 3, 11, '#2e8a3a')
		c.px(x0 + 7, 11, '#2e8a3a')
		c.rect(x0 + 4, 11, 3, 6, NOSE)
		c.rect(x0 + 4, 11, 1, 6, SKIN_L)
		c.hline(x0 + 3, x0 + 7, 17, SKIN_D)
		if hat:
			c.rect(x0 - 1, 6, 13, 1, '#c8a040')
			c.rect(x0 + 1, 4, 9, 2, '#e0c060')
			c.hline(x0 + 1, x0 + 9, 5, '#a8802a')
		else:
			c.rect(x0 + 1, 6, 9, 2, '#5a3a22')
			c.rect(x0 + 1, 6, 9, 1, '#7a5232')

	villager(3, '#3e6a3a', '#2a4a28', False)
	villager(17, '#6a4a2a', '#4a3220', True)
	c.vline(29, 6, 31, '#7a4e26')
	c.rect(28, 5, 3, 1, '#c8c8c8')
	c.px(30, 6, '#9a9a9a')
	c.frame(FRAME, FRAME_HI)
	return c


# ==== The Persistence of Mining (3x2) =============================================================
def _melting_clock(c, cx, top, r, droop):
	"""A Minecraft clock melting downwards: gold rim, a day sky on top, night below, one hand."""
	def inside(x, y):
		dx = (x + 0.5 - cx) / r
		if abs(dx) > 1:
			return False
		sag = droop * max(0.0, 1 - dx * dx)  # the middle sags the most
		dy = y + 0.5 - (top + r)
		limit = r + (sag if dy > 0 else 0)
		return abs(dy) <= limit * math.sqrt(max(0.0, 1 - dx * dx)) + (sag * 0.4 if dy > 0 else 0)

	h = int(2 * r + droop + 2)
	for y in range(int(top) - 1, int(top) + h + 1):
		for x in range(int(cx - r) - 1, int(cx + r) + 2):
			if not inside(x, y):
				continue
			edge = not (inside(x - 1, y) and inside(x + 1, y) and inside(x, y - 1) and inside(x, y + 1))
			if edge:
				c.px(x, y, '#b8861c' if y > top + r else '#f2c440')
			else:
				c.px(x, y, '#6aa8e8' if y < top + r else '#1c2a52')
	c.px(cx - 1, top + 1.6, '#ffe060')  # sun
	c.px(cx + 1, top + r + 1.5, '#e8e8f0')  # moon
	c.line(cx, top + r, cx + r * 0.5, top + r * 0.45, '#2a2a2a')  # hand


def persistence_of_mining() -> Canvas:
	c = Canvas(48, 32)
	c.vgrad(0, 0, 48, 18, ['#4f84bc', '#6a9cca', '#86b0d4', '#a4c2d6', '#c4d4d0', '#dcdcbc', '#f0e2a8'])
	c.poly([(30, 17), (34, 11), (40, 10), (44, 12), (48, 11), (48, 17)], '#c8964a')
	c.poly([(36, 17), (40, 13), (44, 14), (48, 13), (48, 17)], '#8a6a3a')
	c.hline(0, 47, 17, '#7a98a8')
	c.hline(0, 30, 16, '#8eaebc')
	c.vgrad(0, 18, 48, 14, ['#b4864e', '#8a6236', '#5a3e22'])
	c.rect(1, 19, 18, 6, '#4a3a2a')
	c.rect(1, 19, 18, 1, '#6a5640')
	c.line(4, 19, 6, 8, '#3a2a1a')
	c.line(6, 8, 13, 5, '#3a2a1a')
	c.line(6, 11, 2, 7, '#3a2a1a')
	_melting_clock(c, 11.5, 4, 3, 5)  # hanging from the branch
	_melting_clock(c, 17, 17, 3.2, 6)  # draped over the ledge edge
	_melting_clock(c, 32, 23, 4, 1.5)  # flopped on the sand
	for sx, sy in ((30, 25), (33, 26), (35, 24)):  # silverfish snacking on a clock
		c.px(sx, sy, '#a4a4b4')
	for x in range(20, 46):
		c.dither_mix(x, 30, c.get(x, 30), rgb('#3a2814'), 0.6)
	c.frame(FRAME)
	return c
