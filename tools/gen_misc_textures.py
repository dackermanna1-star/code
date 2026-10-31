#!/usr/bin/env python3
"""Small extra textures not covered by tools/assetgen: the Information Overload mob-effect icon.
Run from the repo root: python3 tools/gen_misc_textures.py"""
import math, os
from PIL import Image

OUT = "src/main/resources/assets/jjkshowdown/textures/mob_effect"
os.makedirs(OUT, exist_ok=True)

S = 18
img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
px = img.load()
cx = cy = (S - 1) / 2
for y in range(S):
    for x in range(S):
        dx, dy = x - cx, y - cy
        r = math.hypot(dx, dy)
        if r <= 8.2:
            # deep void disc with a bright cyan ring and a white "eye" core
            t = r / 8.2
            base = (int(10 + 20 * t), int(10 + 30 * t), int(40 + 60 * t), 255)
            if 5.6 <= r <= 7.0:
                base = (140, 230, 255, 255)
            if r <= 2.2:
                base = (255, 255, 255, 255)
            elif r <= 3.2:
                base = (170, 240, 255, 255)
            px[x, y] = base
# a few stars
for (sx, sy) in [(4, 5), (13, 4), (12, 13), (5, 12), (9, 2)]:
    px[sx, sy] = (255, 255, 255, 255)
# dark outline
out = img.copy()
op = out.load()
for y in range(S):
    for x in range(S):
        if img.getpixel((x, y))[3] == 0:
            for ox, oy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + ox, y + oy
                if 0 <= nx < S and 0 <= ny < S and img.getpixel((nx, ny))[3] > 0:
                    op[x, y] = (8, 8, 20, 255)
                    break
out.save(os.path.join(OUT, "information_overload.png"))
print("wrote", os.path.join(OUT, "information_overload.png"))
