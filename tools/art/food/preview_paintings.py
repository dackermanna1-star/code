"""Development helper: renders all paintings (scaled up) into one contact sheet.

Usage: python3 tools/art/food/preview_paintings.py <out_dir> [scale] [name ...]
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from PIL import Image  # noqa: E402

import paintings  # noqa: E402


def main():
	out = sys.argv[1] if len(sys.argv) > 1 else '.'
	scale = int(sys.argv[2]) if len(sys.argv) > 2 else 6
	names = sys.argv[3:] or list(paintings.PAINTINGS)
	ims = [paintings.PAINTINGS[n]().image() for n in names]
	width = 1800
	x = y = 8
	row_h = 0
	placements = []
	for im in ims:
		w, h = im.width * scale, im.height * scale
		if x + w > width:
			x = 8
			y += row_h + 8
			row_h = 0
		placements.append((im, x, y))
		x += w + 8
		row_h = max(row_h, h)
	sheet = Image.new('RGB', (width, y + row_h + 8), (40, 40, 48))
	for im, px, py in placements:
		sheet.paste(im.resize((im.width * scale, im.height * scale), Image.NEAREST), (px, py))
	os.makedirs(out, exist_ok=True)
	sheet.save(os.path.join(out, 'paintings_sheet.png'))


if __name__ == '__main__':
	main()
