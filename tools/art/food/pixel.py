"""Tiny pixel-art toolkit for LaptopCraft food icons.

Sprites are hand-drawn 16x16 character maps. Each character is either
  * a *material* (auto-shaded: top/left edges get the highlight tone, bottom/right edges the shadow tone,
    consistent top-left lighting), or
  * a *decal* (an exact color: sesame seeds, sprinkles, grooves...). Decals do not break the bevel of the
    material they sit on.
After shading, a 1px outline is added around the silhouette, colored with the darkest tone of the
neighboring material (vanilla style: colored outlines, not black).
"""
from __future__ import annotations

from PIL import Image


def hex_rgba(h: str, a: int = 255) -> tuple[int, int, int, int]:
	h = h.lstrip('#')
	return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a


class Mat:
	"""An auto-shaded material: highlight, base, shadow, outline."""

	def __init__(self, hi: str, base: str, sh: str, ol: str, bevel: bool = True):
		self.hi, self.base, self.sh, self.ol = (hex_rgba(c) for c in (hi, base, sh, ol))
		self.bevel = bevel


class Px:
	"""An exact-color decal. outline=False keeps the outline pass from wrapping it (sparkles etc.)."""

	def __init__(self, color: str, outline_color: str | None = None, outline: bool = True):
		self.color = hex_rgba(color)
		self.ol = hex_rgba(outline_color) if outline_color else None
		self.outline = outline


def render(grid: list[str], palette: dict, size: int = 16, outline: bool = True, outline_default: str = '#2a1a10') -> Image.Image:
	assert len(grid) == size, f'grid has {len(grid)} rows'
	for i, row in enumerate(grid):
		assert len(row) == size, f'row {i} has {len(row)} chars: {row!r}'
	cell = [[palette.get(ch) if ch not in '. ' else None for ch in row] for row in grid]
	for y, row in enumerate(grid):
		for x, ch in enumerate(row):
			if ch not in '. ' and cell[y][x] is None:
				raise KeyError(f'unknown palette char {ch!r} at {x},{y}')

	def at(x, y):
		if 0 <= x < size and 0 <= y < size:
			return cell[y][x]
		return None

	# A decal sits "on" the material most common among its 4-neighbours, for bevel purposes.
	def underlying(x, y):
		c = at(x, y)
		if isinstance(c, Mat) or c is None:
			return c
		counts = {}
		for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)):
			n = at(x + dx, y + dy)
			if isinstance(n, Mat):
				counts[id(n)] = (counts.get(id(n), (0, n))[0] + 1, n)
		if not counts:
			return c
		return max(counts.values(), key=lambda t: t[0])[1]

	under = [[underlying(x, y) for x in range(size)] for y in range(size)]

	def same(x, y, m):
		if not (0 <= x < size and 0 <= y < size):
			return False
		return under[y][x] is m

	img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
	px = img.load()
	for y in range(size):
		for x in range(size):
			c = cell[y][x]
			if c is None:
				continue
			if isinstance(c, Px):
				px[x, y] = c.color
				continue
			if not c.bevel:
				px[x, y] = c.base
				continue
			lit = not same(x, y - 1, c) or not same(x - 1, y, c)
			dark = not same(x, y + 1, c) or not same(x + 1, y, c)
			if lit and not dark:
				px[x, y] = c.hi
			elif dark and not lit:
				px[x, y] = c.sh
			elif lit and dark:
				# thin part: top edge wins (lit from above), otherwise base
				px[x, y] = c.hi if not same(x, y - 1, c) and same(x, y + 1, c) else c.base
			else:
				px[x, y] = c.base

	if outline:
		out = img.copy()
		opx = out.load()
		default = hex_rgba(outline_default)
		for y in range(size):
			for x in range(size):
				if cell[y][x] is not None:
					continue
				best = None
				# preference order: below, right, above, left (shadow side outlines look most natural)
				for dx, dy in ((0, -1), (-1, 0), (0, 1), (1, 0)):
					n = at(x + dx, y + dy)
					if n is None:
						continue
					if isinstance(n, Px) and not n.outline:
						continue
					if isinstance(n, Mat):
						best = n.ol
					else:
						u = under[y + dy][x + dx]
						best = n.ol or (u.ol if isinstance(u, Mat) else default)
					break
				if best is not None:
					opx[x, y] = best
		img = out
	return img


def preview(images: list[tuple[str, Image.Image]], scale: int = 8, cols: int = 9, bg=(58, 58, 70, 255)) -> Image.Image:
	"""Contact sheet with names omitted (order = list order); used during development."""
	w = images[0][1].width * scale
	h = images[0][1].height * scale
	rows = (len(images) + cols - 1) // cols
	sheet = Image.new('RGBA', (cols * (w + scale * 2), rows * (h + scale * 2)), bg)
	for i, (_, im) in enumerate(images):
		big = im.resize((w, h), Image.NEAREST)
		sheet.alpha_composite(big, ((i % cols) * (w + scale * 2) + scale, (i // cols) * (h + scale * 2) + scale))
	return sheet
