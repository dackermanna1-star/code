"""Development helper: renders every food sprite into contact sheets (big + inventory-sized).

Usage: python3 tools/art/food/preview_food.py <out_dir>
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import food_sprites  # noqa: E402
import pixel  # noqa: E402


def main():
	out = sys.argv[1] if len(sys.argv) > 1 else '.'
	os.makedirs(out, exist_ok=True)
	imgs = []
	for name, (grid, palette) in food_sprites.SPRITES.items():
		try:
			imgs.append((name, pixel.render(grid, palette)))
		except Exception as e:  # report every broken sprite at once
			print('ERR', name, e)
	pixel.preview(imgs, scale=7, cols=9).save(os.path.join(out, 'food_sheet.png'))
	pixel.preview(imgs, scale=3, cols=14, bg=(139, 139, 139, 255)).save(os.path.join(out, 'food_small.png'))
	print(' '.join(n for n, _ in imgs))


if __name__ == '__main__':
	main()
