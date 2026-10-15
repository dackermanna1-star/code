# Contact sheet: python3 tests/contact.py out.png img1 img2 ... (labels from filenames)
import sys
from PIL import Image, ImageDraw
out = sys.argv[1]; files = sys.argv[2:]
cols = 3; tw, th = 480, 270
rows = (len(files) + cols - 1) // cols
sheet = Image.new('RGB', (cols * tw, rows * (th + 14)), (20, 20, 20))
d = ImageDraw.Draw(sheet)
for i, f in enumerate(files):
    im = Image.open(f).convert('RGB').resize((tw, th))
    x, y = (i % cols) * tw, (i // cols) * (th + 14)
    sheet.paste(im, (x, y + 14))
    d.text((x + 4, y + 1), f.split('/')[-1].replace('.png', ''), fill=(255, 220, 120))
sheet.save(out)
print(out, sheet.size)
