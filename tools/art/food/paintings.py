"""Procedural art for LaptopCraft's custom painting variants.

Each function paints one canvas (16 px per block). Run gen_food_assets.py to write the PNGs,
the painting_variant JSON files, the placeable tag and the lang entries.
"""
from __future__ import annotations

import math

from paint import Canvas, hash01, mix, rgb, value_noise

FRAME = '#3b2614'
FRAME_HI = '#6b4524'


# ==== The Starry Night Sky (4x3) ==================================================================
def starry_night_sky() -> Canvas:
	c = Canvas(64, 48, '#13205a')
	blues = ['#0e1848', '#16286e', '#21418f', '#3463b4', '#5a8fd2', '#a9c8ec']
	vortices = [(30, 15, 11, 1.0), (13, 9, 6, -1.0), (48, 22, 6, 1.0)]
	for y in range(36):
		for x in range(64):
			# background flow: long horizontal brush waves
			v = math.sin(x * 0.19 + math.sin(y * 0.35 + x * 0.05) * 1.6 + y * 0.55)
			w_total = 0.0
			for vx, vy, vr, spin in vortices:
				dx, dy = x + 0.5 - vx, (y + 0.5 - vy) * 1.25
				r = math.hypot(dx, dy)
				if r < vr * 1.6:
					w = max(0.0, 1.0 - r / (vr * 1.6))
					ang = math.atan2(dy, dx) * spin
					sv = math.sin(ang * 2 + r * 0.9)
					v = v * (1 - w) + sv * w
					w_total += w
			level = (v + 1) / 2 * 3.2 + 0.6 + (0.5 if y < 6 else 0) - y * 0.02
			level = max(0.0, min(len(blues) - 1.001, level))
			i = int(level)
			c.dither_mix(x, y, rgb(blues[i]), rgb(blues[min(i + 1, len(blues) - 1)]), level - i)
	# stars with dithered halos
	stars = [(6, 5, 2.5), (22, 4, 2.0), (41, 6, 2.2), (55, 13, 2.0), (9, 20, 1.8), (36, 26, 1.6), (58, 28, 1.5), (19, 24, 1.4)]
	for sx, sy, sr in stars:
		c.radial(sx, sy, sr + 2.4, ['#fff6b0', '#f4e070', '#c9d070', '#7fa6cf'])
		c.disc(sx, sy, sr * 0.6, '#fffbe0')
	# crescent moon with orange halo
	c.radial(56, 6, 6.5, ['#fff1a0', '#ffd248', '#e8a830', '#b88a3a', '#6f86b0'])
	c.disc(56, 6, 3.2, '#ffe680')
	c.disc(57.5, 5, 2.6, '#f2b83a')
	# distant hills: two layers with a moonlit rim
	for x in range(64):
		hy = 30 + 2.5 * math.sin(x * 0.11 + 1.3) + 1.5 * math.sin(x * 0.29)
		c.px(x, int(hy), '#4a72a6')
		c.vline(x, int(hy) + 1, 47, '#2a4a74')
		hy2 = 35 + 1.8 * math.sin(x * 0.17 + 4.0)
		c.vline(x, int(hy2), 47, '#203a5e')
	# blocky village with pitched roofs and lit windows
	houses = [(14, 40, 5, 3), (20, 38, 5, 4), (26, 37, 6, 5), (33, 39, 4, 3), (45, 38, 5, 4), (51, 39, 6, 4), (57, 37, 5, 5)]
	for i, (hx, hy, hw, hh) in enumerate(houses):
		c.rect(hx, hy, hw, hh, '#4a5c88' if i % 2 else '#3e4f7a')
		c.rect(hx, hy, 1, hh, '#5a6e9c')
		c.rect(hx - 1, hy - 1, hw + 2, 1, '#1b2340')
		c.rect(hx, hy - 2, hw, 1, '#1b2340')
		if hw > 4:
			c.rect(hx + 1, hy - 3, hw - 2, 1, '#1b2340')
		for wx in range(hx + 1, hx + hw - 1, 2):
			if hash01(wx, hy, 9) < 0.75:
				c.px(wx, hy + 1, '#ffd95a')
	# church with steeple
	c.rect(38, 33, 5, 9, '#4a5c88')
	c.rect(38, 33, 1, 9, '#5a6e9c')
	c.rect(39, 28, 3, 5, '#4a5c88')
	c.poly([(38.5, 28), (40.5, 21), (42.5, 28)], '#1b2340')
	c.px(40, 35, '#ffd95a')
	c.px(40, 36, '#ffd95a')
	# foreground field
	c.vgrad(0, 43, 64, 5, ['#1e3a52', '#14283c'])
	for x in range(0, 64, 3):
		c.line(x, 47, x + 2, 44 + (x * 7) % 3, '#2e5670')
	# the cypress: a dark flickering flame
	for y in range(2, 48):
		t = (y - 2) / 46
		half = 0.8 + 5.6 * math.sin(min(1.0, t * 1.1) * math.pi / 2)
		cx = 9.5 + math.sin(y * 0.3) * 1.0 * (1 - t * 0.6)
		for x in range(int(round(cx - half)), int(round(cx + half)) + 1):
			edge = abs(x + 0.5 - cx) / max(half, 0.8)
			if edge > 0.8 and hash01(x, y, 11) < 0.4:
				continue  # flickering flame edge
			stroke = value_noise(x * 2.2, y * 0.8, 1.6, 13)
			col = '#0c1c12'
			if stroke > 0.6:
				col = '#1a3a22'
			if stroke > 0.78 and x + 0.5 < cx:
				col = '#2e5a32'
			c.px(x, y, col)
	c.frame(FRAME)
	return c


# ==== Composition with Redstone (2x2) =============================================================
def redstone_composition() -> Canvas:
	c = Canvas(32, 32, '#f1ede2')
	for y in range(32):
		for x in range(32):
			if hash01(x // 2, y // 2, 1) < 0.18:
				c.px(x, y, '#e4ddd0')  # quartz-like panel texture
	black = '#141414'
	# red panel (redstone block)
	for y in range(0, 20):
		for x in range(10, 32):
			n = hash01(x // 2, y // 2, 2)
			c.px(x, y, '#c4201c' if n < 0.6 else ('#a41612' if n < 0.85 else '#e0342a'))
	# redstone dust trail glowing on the red panel
	for x in range(13, 30):
		c.px(x, 14 + int(math.sin(x * 0.6) * 1.5), '#ff5a3a')
	# blue (lapis) panel
	for y in range(22, 32):
		for x in range(0, 8):
			n = hash01(x, y, 4)
			c.px(x, y, '#1f43a6' if n < 0.7 else ('#2f5bd0' if n < 0.9 else '#e6c042'))
	# yellow (gold block) panel
	for y in range(27, 32):
		for x in range(28, 32):
			c.px(x, y, '#f6cf2c' if (x + y) % 3 else '#fff07a')
	for x0, x1 in ((8, 9), (26, 27)):
		c.rect(x0, 0 if x0 == 8 else 20, x1 - x0 + 1, 32 if x0 == 8 else 12, black)
	c.rect(0, 20, 32, 2, black)
	c.rect(0, 9, 8, 2, black)
	c.rect(28, 25, 4, 2, black)
	c.frame(FRAME)
	return c


# ==== The Great Wave (3x2) ========================================================================
def _dist_to_polyline(x, y, pts):
	best = 1e9
	for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
		vx, vy = x1 - x0, y1 - y0
		t = max(0.0, min(1.0, ((x - x0) * vx + (y - y0) * vy) / (vx * vx + vy * vy)))
		best = min(best, math.hypot(x - x0 - t * vx, y - y0 - t * vy))
	return best


def great_wave() -> Canvas:
	c = Canvas(48, 32)
	c.vgrad(0, 0, 48, 32, ['#efe3c6', '#eadbb8', '#e0caa0'])
	for x in range(31, 45):  # a faint cloud bank
		c.px(x, 7 + (1 if x % 4 == 0 else 0), '#d8c49c')
	for x in range(34, 42):
		c.px(x, 6, '#d8c49c')
	# Mount Fuji, tiny in the distance (seen through the hollow of the wave)
	c.poly([(27, 26), (33.5, 17.5), (40, 26)], '#3b5378')
	c.poly([(31.6, 20), (33.5, 17.5), (35.4, 20), (34.4, 21), (33.5, 19.6), (32.6, 21)], '#f6f1e4')
	# the great wave: outer contour (back + crest) and inner contour (hollow)
	outer = [(-1, 24), (2, 16), (6, 10), (10, 6), (15, 3), (20, 2), (24, 3), (27, 5), (29, 8), (29.5, 11)]
	inner = [(29.5, 11), (27.5, 9.5), (25, 8.5), (22, 9), (19.5, 11), (18, 14), (18, 18), (19.5, 23), (22, 27), (25, 33)]
	body = outer + inner + [(-1, 33)]
	c.poly(body, '#1b3c6b')
	for y in range(32):
		for x in range(48):
			if not (c.get(x, y) == rgb('#1b3c6b')).all():
				continue
			d = _dist_to_polyline(x + 0.5, y + 0.5, outer)
			band = (d + 0.6 * math.sin(y * 0.5)) % 4.2
			if band < 0.9:
				c.px(x, y, '#4f86ba')
			elif band < 1.6:
				c.px(x, y, '#2d5e94')
	# foam crest with claws reaching into the hollow
	for i in range(len(outer) - 1):
		(x0, y0), (x1, y1) = outer[i], outer[i + 1]
		steps = int(max(abs(x1 - x0), abs(y1 - y0)) * 2) + 1
		for k in range(steps):
			t = k / steps
			fx, fy = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
			if fy < 9.5 or fx > 24:
				c.px(fx, fy, '#f7f2e6')
				if hash01(int(fx * 2), int(fy * 2), 7) < 0.5:
					c.px(fx, fy + 1, '#cfe1eb')
	for fx, fy in ((29, 11), (28, 12), (27, 11), (26, 12), (25, 11), (24, 12), (23, 11), (29, 12), (27, 13), (25, 13)):
		c.px(fx, fy, '#f7f2e6')
	for fx, fy in ((22, 10), (21, 11), (20, 12)):
		c.px(fx, fy, '#cfe1eb')
	for sx, sy in ((31, 6), (32, 9), (30, 3), (33, 5), (26, 1), (12, 3), (8, 6)):
		c.px(sx, sy, '#f7f2e6')
	# foreground swell echoing the mountain
	for x in range(18, 48):
		top = 26 - 4.5 * math.exp(-((x - 38) / 5.0) ** 2) + 0.8 * math.sin(x * 0.7)
		for y in range(int(top), 32):
			t = (y - top) / 6
			c.dither_mix(x, y, rgb('#2d5e94'), rgb('#1b3c6b'), min(1, t))
		c.px(x, int(top), '#f7f2e6')
		if (x * 3) % 5 == 0:
			c.px(x, int(top) + 1, '#cfe1eb')
	# a Minecraft boat with a brave villager, riding the trough
	bx, by = 40, 27
	c.rect(bx, by, 6, 2, '#8a5a2e')
	c.rect(bx + 1, by + 2, 4, 1, '#5e3a1a')
	c.rect(bx + 2, by - 2, 2, 2, '#4c8a3c')
	c.px(bx + 2, by - 3, '#c8977a')
	c.px(bx + 3, by - 3, '#b07e62')
	c.frame(FRAME)
	return c


# ==== Portrait of Steve (1x1) =====================================================================
def steve_portrait() -> Canvas:
	c = Canvas(16, 16)
	c.vgrad(1, 1, 14, 14, ['#8cc8f0', '#5f9fd8', '#4a86c4'])
	hair, skin, skin_d, eye_w, eye_b, mouth, shirt = '#3d2614', '#c69a7c', '#ac7c5e', '#ffffff', '#3f45a8', '#6e4028', '#1fa3a8'
	c.rect(4, 2, 8, 8, skin)
	c.rect(4, 2, 8, 2, hair)
	c.px(4, 4, hair)
	c.px(11, 4, hair)
	c.px(5, 4, skin_d)
	c.px(10, 4, skin_d)
	c.px(5, 5, eye_w)
	c.px(6, 5, eye_b)
	c.px(9, 5, eye_b)
	c.px(10, 5, eye_w)
	c.rect(7, 6, 2, 1, '#94603e')
	c.rect(6, 7, 4, 1, mouth)
	c.px(6, 8, mouth)
	c.px(9, 8, mouth)
	c.rect(4, 9, 8, 1, skin_d)
	c.rect(6, 10, 4, 1, skin_d)
	c.rect(2, 11, 12, 4, shirt)
	c.rect(6, 11, 4, 1, skin)
	c.px(7, 12, skin)
	c.px(8, 12, skin)
	c.rect(2, 11, 1, 4, '#168288')
	c.frame(FRAME, FRAME_HI)
	return c


from paintings_more import (  # noqa: E402
	cherry_grove_dawn, creation_of_steve, creeper_scream, diamond_still_life, dragon_sunset, emerald_earring, mona_llama,
	netherhawks, persistence_of_mining, sunflower_field, villager_gothic,
)

# id -> painter, in gallery order (must match PaintingContent.GALLERY)
PAINTINGS = {
	'mona_llama': mona_llama,
	'starry_night_sky': starry_night_sky,
	'creeper_scream': creeper_scream,
	'sunflower_field': sunflower_field,
	'great_wave': great_wave,
	'emerald_earring': emerald_earring,
	'redstone_composition': redstone_composition,
	'dragon_sunset': dragon_sunset,
	'cherry_grove_dawn': cherry_grove_dawn,
	'diamond_still_life': diamond_still_life,
	'steve_portrait': steve_portrait,
	'netherhawks': netherhawks,
	'villager_gothic': villager_gothic,
	'persistence_of_mining': persistence_of_mining,
	'creation_of_steve': creation_of_steve,
}
