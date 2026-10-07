"""Dev aid: python3 tools/art/toys/iconsheet.py out.png tex/path1 tex/path2 ... (texture id paths, scaled x10)."""
import os
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from lib import ASSETS  # noqa: E402

if __name__ == "__main__":
	out, paths = sys.argv[1], sys.argv[2:]
	ims = [Image.open(os.path.join(ASSETS, "textures", p + ".png")).convert("RGBA") for p in paths]
	scale = 10
	W = sum(max(16, im.width) * scale + 20 for im in ims) + 20
	H = max(im.height for im in ims) * scale + 40
	sheet = Image.new("RGBA", (W, H), (139, 139, 139, 255))
	x = 20
	for im in ims:
		big = im.resize((im.width * scale, im.height * scale), Image.NEAREST)
		sheet.alpha_composite(big, (x, 20))
		x += big.width + 20
	sheet.save(out)
