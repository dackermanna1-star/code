"""Site wordmark logos (transparent, height 32, width <= 160) built from the hand-made pixel fonts.

Style: chunky Minecraft-like lettering — gradient face, 1px bevel highlight, a short dark extrusion
below and a 1px outline — so every logo reads on both light and dark page headers.

Run: python3 tools/art/logos.py
"""
from __future__ import annotations

import numpy as np

import pixfont
from icons import draw_squawker_bird
from lib import Canvas, arc, mask_shape, pixel_gem, polygon, rgba, save_image, segment, to_image, union

LOGO_H = 32
MAX_W = 160


class Part:
	def __init__(self, text, top, bottom, extrude=None, font=None):
		self.text, self.top, self.bottom, self.font = text, rgba(top), rgba(bottom), font
		self.extrude = rgba(extrude) if extrude else rgba(bottom) * np.array([0.62, 0.62, 0.62, 1])


class Layer:
	"""A face mask plus per-pixel face colour and extrusion colour (all at final resolution)."""

	def __init__(self, w, h):
		self.face = np.zeros((h, w), dtype=bool)
		self.col = np.zeros((h, w, 4))
		self.ext = np.zeros((h, w, 4))

	def add(self, mask, x, y, top, bottom, extrude, grad_y0=None, grad_y1=None):
		h, w = mask.shape
		H, W = self.face.shape
		sub = np.zeros((H, W), dtype=bool)
		x1, y1 = min(W, x + w), min(H, y + h)
		sub[y:y1, x:x1] = mask[:y1 - y, :x1 - x]
		ys = np.arange(H)[:, None]
		g0 = grad_y0 if grad_y0 is not None else y
		g1 = grad_y1 if grad_y1 is not None else y + h
		t = np.clip((ys - g0) / max(g1 - g0, 1), 0, 1)
		col = top[None, None, :] * (1 - t[..., None]) + bottom[None, None, :] * t[..., None]
		col = np.broadcast_to(col, (H, W, 4))
		self.col = np.where(sub[..., None], col, self.col)
		self.ext = np.where(sub[..., None], extrude, self.ext)
		self.face |= sub


def render(layer: Layer, outline="#14161c", depth=2, bevel=0.35, outline_alpha=1.0) -> np.ndarray:
	F = layer.face
	H, W = F.shape
	E = np.zeros_like(F)
	ecol = np.zeros((H, W, 4))
	for d in range(depth, 0, -1):
		sh = pixfont.shift(F, 0, d)
		src = pixfont.shift(np.ones_like(F), 0, d)
		shifted_col = np.zeros_like(layer.ext)
		shifted_col[d:] = layer.ext[:-d]
		new = sh & ~F
		ecol = np.where(new[..., None], shifted_col, ecol)
		E |= new
	solid = F | E
	O = pixfont.dilate(solid, 1) & ~solid
	out = np.zeros((H, W, 4))
	out[O] = rgba(outline, outline_alpha)
	out[E] = ecol[E]
	face = layer.col.copy()
	top_edge = F & ~pixfont.shift(F, 0, 1)
	face[top_edge, :3] = face[top_edge, :3] + (1 - face[top_edge, :3]) * bevel
	out[F] = face[F]
	return out


def crop_center(arr: np.ndarray, height=LOGO_H) -> np.ndarray:
	a = arr[..., 3] > 0
	ys, xs = np.where(a)
	y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
	cropped = arr[y0:y1, x0:x1]
	h, w = cropped.shape[:2]
	assert w <= MAX_W, f"logo too wide: {w}"
	assert h <= height, f"logo too tall: {h}"
	out = np.zeros((height, w, 4))
	oy = (height - h) // 2
	out[oy:oy + h] = cropped
	return out


def word_layer(parts, scale, spacing=1, word_gap=None, canvas=(200, 40), x0=2, y0=2) -> tuple[Layer, int]:
	"""Lay out parts left to right; returns the layer and the x after the last glyph."""
	layer = Layer(*canvas)
	x = x0
	for i, p in enumerate(parts):
		m = pixfont.text_mask(p.text, spacing, p.font)
		ms = pixfont.scale_mask(m, scale)
		cap0 = y0
		cap1 = y0 + 7 * scale
		layer.add(ms, x, y0, p.top, p.bottom, p.extrude, cap0, cap1)
		x += ms.shape[1]
		if i < len(parts) - 1:
			x += spacing * scale + (word_gap or 0)
	return layer, x


# --------------------------------------------------------------------------------------------------

def bloogle():
	cols = [("#6aa7ff", "#2f6fe0"), ("#5ad17a", "#23944a"), ("#ff7a6b", "#d93025"), ("#ffd54a", "#f2a600"),
		("#6aa7ff", "#2f6fe0"), ("#5ad17a", "#23944a"), ("#ff7a6b", "#d93025")]
	parts = [Part(ch, a, b) for ch, (a, b) in zip("Bloogle", cols)]
	layer, _ = word_layer(parts, 3)
	return render(layer, outline="#1b2333", depth=2)


def emerazon():
	parts = [Part("emerazon", "#8af5b6", "#16a356", extrude="#0c6a37")]
	layer, xe = word_layer(parts, 3, canvas=(200, 48))
	# smile arrow from under the first "e" to under the "z"
	z_x = 2 + pixfont.text_width("emera", 1) * 3 + 3 * 1 + 6
	c = Canvas(200, 48)
	x_a, x_b = 6.0, float(z_x + 4)
	cx = (x_a + x_b) / 2
	half = (x_b - x_a) / 2
	sag = 6.0
	r = (half * half + sag * sag) / (2 * sag)
	top = 2 + 7 * 3 + 2.5
	smile = arc(cx, top - (r - sag), r, 3.0, 270 - np.degrees(np.arcsin(half / r)), 270 + np.degrees(np.arcsin(half / r)))
	ang = np.radians(270 + np.degrees(np.arcsin(half / r)))
	ex, ey = cx + r * np.cos(ang), (top - (r - sag)) - r * np.sin(ang)
	head = polygon([(ex - 5.5, ey - 1.0), (ex + 3.5, ey - 4.5), (ex + 1.0, ey + 4.5)])
	m = c.coverage(union(smile, head), aa="hard") > 0.5
	layer.add(m, 0, 0, rgba("#ffb23e"), rgba("#ff8a00"), rgba("#b35a00"))
	return render(layer, outline="#0c2418", depth=2)


def blocktube():
	layer = Layer(220, 40)
	# play box
	c = Canvas(220, 40)
	box = c.coverage(lambda X, Y: _rrect(X, Y, 2, 2, 23, 22, 5), aa="hard") > 0.5
	layer.add(box, 0, 0, rgba("#ff5a4f"), rgba("#d10d0d"), rgba("#7a0606"))
	tri = c.coverage(polygon([(9, 7), (9, 17), (17.5, 12)]), aa="hard") > 0.5
	parts = [Part("Block", "#ffffff", "#dcdcdc", extrude="#6b6b6b"), Part("Tube", "#ffffff", "#dcdcdc", extrude="#6b6b6b")]
	tl, _ = word_layer(parts, 3, spacing=1, canvas=(220, 40), x0=26, y0=1)
	layer.face |= tl.face
	layer.col = np.where(tl.face[..., None], tl.col, layer.col)
	layer.ext = np.where(tl.face[..., None], tl.ext, layer.ext)
	out = render(layer, outline="#1a1a1a", depth=2)
	out[tri] = rgba("#ffffff")
	out[tri & ~pixfont.shift(tri, 0, 1)] = rgba("#ffffff")
	return out


def _rrect(X, Y, x0, y0, x1, y1, r):
	cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
	hx, hy = (x1 - x0) / 2, (y1 - y0) / 2
	qx = np.abs(X - cx) - hx + r
	qy = np.abs(Y - cy) - hy + r
	return np.hypot(np.maximum(qx, 0), np.maximum(qy, 0)) + np.minimum(np.maximum(qx, qy), 0) - r


def endereats():
	parts = [Part("Ender", "#e2a8ff", "#9a4fe0", extrude="#5a2391"), Part("Eats", "#8dffc0", "#1fbf6a", extrude="#0d7a40")]
	layer, _ = word_layer(parts, 3, spacing=1, word_gap=3)
	return render(layer, outline="#170a26", depth=2)


def bank():
	layer = Layer(200, 40)
	gem = pixel_gem(14, 18)
	parts = [Part("Emerald", "#8af5b6", "#17a85a", extrude="#0c6a37"), Part("Bank", "#ffe680", "#e3a21a", extrude="#8a5a0a")]
	tl, _ = word_layer(parts, 2, spacing=1, word_gap=3, canvas=(200, 40), x0=20, y0=6)
	layer = tl
	out = render(layer, outline="#0e2016", depth=1)
	# gem with its own outline
	gm = gem[..., 3] > 0
	full = np.zeros(layer.face.shape, dtype=bool)
	full[3:3 + 18, 2:2 + 14] = gm
	o = pixfont.dilate(full, 1) & ~full
	out[o] = rgba("#0e2016")
	out[3:3 + 18, 2:2 + 14][gm] = gem[gm]
	return out


def dailyblock():
	layer = Layer(220, 40)
	parts = [Part("The Daily Block", "#2a2a2a", "#0c0c0c", extrude="#000000", font=pixfont.GOTHIC)]
	tl, _ = word_layer(parts, 2, spacing=1, canvas=(220, 40), x0=2, y0=6)
	out = render(tl, outline="#ffffff", depth=0, bevel=0.0, outline_alpha=0.85)
	return out


def mineweather():
	parts = [Part("Mine", "#ffe066", "#ff9a1f", extrude="#a35a00"), Part("Weather", "#9ee3ff", "#2b8fe6", extrude="#14548f")]
	layer, _ = word_layer(parts, 3, spacing=1)
	return render(layer, outline="#0d1f36", depth=2)


def squawker():
	parts = [Part("Squawker", "#8fdcff", "#1d8fe0", extrude="#0d4f8a")]
	layer, _ = word_layer(parts, 3, spacing=1, canvas=(200, 40), x0=30, y0=2)
	out = render(layer, outline="#0b2440", depth=2)
	bird = draw_squawker_bird(blue=True)
	b = bird.straight()
	h, w = b.shape[:2]
	mask = b[..., 3] > 0.5
	region = out[0:h, 0:w]
	solid = np.zeros(out.shape[:2], dtype=bool)
	solid[0:h, 0:w] = mask
	o = pixfont.dilate(solid, 1) & ~solid
	out[o & (out[..., 3] == 0)] = rgba("#0b2440")
	region[mask] = b[mask]
	region[mask, 3] = 1.0
	return out


LOGOS = {
	"bloogle_logo": bloogle, "emerazon_logo": emerazon, "blocktube_logo": blocktube, "endereats_logo": endereats,
	"bank_logo": bank, "dailyblock_logo": dailyblock, "mineweather_logo": mineweather, "squawker_logo": squawker,
}


def main():
	out = []
	for name, fn in LOGOS.items():
		raw = fn()
		xs = np.where(raw[..., 3].any(axis=0))[0]
		print(f"  {name}: {xs.max() - xs.min() + 1}px wide")
		arr = crop_center(raw)
		out.append(save_image(to_image(arr), f"textures/gui/sites/{name}.png"))
	print(f"logos: wrote {len(out)} files")
	return out


if __name__ == "__main__":
	main()
