#!/usr/bin/env python3
"""Compose captured frames into a contact sheet: sheet.py outdir prefix cols out.png [crop x0 y0 x1 y1] [scale]"""
import sys, glob, os
from PIL import Image, ImageDraw
d, prefix, cols, out = sys.argv[1], sys.argv[2], int(sys.argv[3]), sys.argv[4]
crop = tuple(map(int, sys.argv[5:9])) if len(sys.argv) >= 9 else None
scale = float(sys.argv[9]) if len(sys.argv) >= 10 else 1.0
fs = sorted(glob.glob(os.path.join(d, prefix + '*.png')))
ims = []
for f in fs:
    im = Image.open(f).convert('RGB')
    if crop: im = im.crop(crop)
    if scale != 1: im = im.resize((int(im.width * scale), int(im.height * scale)), Image.LANCZOS)
    ims.append(im)
w, h = ims[0].size
rows = (len(ims) + cols - 1) // cols
S = Image.new('RGB', (w * cols, h * rows), 'white')
dr = ImageDraw.Draw(S)
for i, im in enumerate(ims):
    x, y = (i % cols) * w, (i // cols) * h
    S.paste(im, (x, y))
    dr.text((x + 4, y + 4), str(i), fill=(200, 0, 0))
S.save(out)
print(out, S.size)
