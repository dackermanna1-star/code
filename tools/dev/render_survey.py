#!/usr/bin/env python3
"""Renders a survey written by net.earthscapes.dev.ClimateSurvey: a large hill-shaded biome map with
legend and biome percentages, a height map, and climate parameter percentiles.

    python3 tools/dev/render_survey.py <survey.bin> <output prefix>
"""
import colorsys
import os
import struct
import sys

import numpy as np
from PIL import Image, ImageDraw


def main():
    path, prefix = sys.argv[1], sys.argv[2]
    os.makedirs(os.path.dirname(prefix) or '.', exist_ok=True)
    with open(path, 'rb') as f:
        data = f.read()
    n, step, origin = struct.unpack('>iii', data[:12])
    off = 12
    rec = np.frombuffer(data[off:off + n * n * 6], dtype=np.dtype([('h', '>f4'), ('b', '>i2')]))
    off += n * n * 6
    height = rec['h'].reshape(n, n).astype(float)
    biome = rec['b'].reshape(n, n).astype(int)
    climate = np.frombuffer(data[off:off + 5 * n * n * 4], dtype='>f4').reshape(5, n, n).astype(float)
    off += 5 * n * n * 4
    count = struct.unpack('>i', data[off:off + 4])[0]
    off += 4
    names = []
    for _ in range(count):
        ln = struct.unpack('>H', data[off:off + 2])[0]
        names.append(data[off + 2:off + 2 + ln].decode())
        off += 2 + ln

    gx = np.zeros_like(height)
    gz = np.zeros_like(height)
    gx[:, 1:-1] = (height[:, 2:] - height[:, :-2]) / (2 * step)
    gz[1:-1, :] = (height[2:, :] - height[:-2, :]) / (2 * step)
    shade = np.clip(1.0 + (-gx - gz) * 2.2, 0.5, 1.4)

    pal = []
    for i in range(len(names)):
        r, g, b = colorsys.hsv_to_rgb((i * 0.618033 + 0.1) % 1.0, 0.55, 0.92)
        pal.append((int(r * 255), int(g * 255), int(b * 255)))
    img = np.zeros((n, n, 3))
    for i, c in enumerate(pal):
        img[biome == i] = c
    water = height < 63
    img[water] = (60, 110, 200)
    out = np.clip(img * shade[:, :, None], 0, 255).astype(np.uint8)
    im = Image.fromarray(out, 'RGB')
    legend = 16 * len(names) + 10
    canvas = Image.new('RGB', (n, n + legend), (28, 28, 28))
    canvas.paste(im, (0, 0))
    d = ImageDraw.Draw(canvas)
    counts = np.bincount(biome.ravel(), minlength=len(names))
    for i, nm in enumerate(names):
        d.rectangle((4, n + 6 + i * 16, 16, n + 18 + i * 16), fill=pal[i])
        d.text((22, n + 5 + i * 16), '%s  %.1f%%' % (nm, 100.0 * counts[i] / counts.sum()), fill=(255, 255, 255))
    d.text((4, 4), '%d x %d blocks, step %d' % (n * step, n * step, step), fill=(255, 255, 255))
    canvas.save(prefix + '_survey_biomes.png')

    hn = np.clip((height - 40) / 260.0, 0, 1)
    hcol = np.stack([hn * 0.9 + 0.1, hn * 0.8 + 0.15, hn * 0.6 + 0.25], axis=2)
    hcol[water] = (0.2, 0.35, 0.7)
    Image.fromarray(np.clip(hcol * 255 * shade[:, :, None], 0, 255).astype(np.uint8), 'RGB').save(prefix + '_survey_height.png')
    print('height: p1 %.1f p50 %.1f p99 %.1f max %.1f' % tuple(np.percentile(height, [1, 50, 99]).tolist() + [height.max()]))
    for i, nm in enumerate(['temperature', 'humidity', 'continentalness', 'erosion', 'weirdness']):
        v = climate[i].ravel()
        print('%-16s p5 %7.3f p25 %7.3f p50 %7.3f p75 %7.3f p95 %7.3f' % (nm, *np.percentile(v, [5, 25, 50, 75, 95])))
    for i, nm in enumerate(names):
        print('%-40s %5.1f%%' % (nm, 100.0 * counts[i] / counts.sum()))


if __name__ == '__main__':
    main()
