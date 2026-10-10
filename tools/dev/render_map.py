#!/usr/bin/env python3
"""Renders a map dump written by net.earthscapes.dev.MapDumper into hill-shaded PNG maps.

    python3 tools/dev/render_map.py <map.bin> <output prefix>

Writes <prefix>_terrain.png (block colours with biome tints and hill shading), <prefix>_biomes.png
and <prefix>_height.png. Block colours are the average colour of each block's texture, taken from
this mod's textures and the vanilla client jar (set VANILLA_ASSETS to its assets/minecraft dir).
"""
import colorsys
import glob
import json
import os
import struct
import sys

import numpy as np
from PIL import Image, ImageDraw

CLIMATE = None
ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
MOD_TEX = os.path.join(ROOT, 'src/main/resources/assets/earthscapes/textures/block')
MOD_BIOMES = os.path.join(ROOT, 'src/main/resources/data/earthscapes/worldgen/biome')
VANILLA = os.environ.get('VANILLA_ASSETS', '/tmp/claude-0/-home-user-code/45f3dfe0-1a52-5798-939f-0b7ef9d0c4ed/scratchpad/vanilla/assets/minecraft')

GRASS_TINTED = {'minecraft:grass_block', 'minecraft:short_grass', 'minecraft:tall_grass', 'minecraft:fern', 'minecraft:large_fern',
                'minecraft:bush', 'minecraft:sugar_cane'}
FOLIAGE_TINTED = {'minecraft:oak_leaves', 'minecraft:jungle_leaves', 'minecraft:acacia_leaves', 'minecraft:dark_oak_leaves',
                  'minecraft:mangrove_leaves', 'minecraft:vine'}
FIXED = {'minecraft:water': (63, 118, 228), 'minecraft:birch_leaves': (128, 167, 85), 'minecraft:spruce_leaves': (97, 153, 97),
         'minecraft:lava': (207, 92, 20), 'minecraft:air': (0, 0, 0)}


def read(path):
    with open(path, 'rb') as f:
        data = f.read()
    width, x0, z0 = struct.unpack('>iii', data[:12])
    n = width * width
    arr = np.frombuffer(data[12:12 + n * 10], dtype='>i2').reshape(n, 5)
    off = 12 + n * 10

    def strings(off):
        count = struct.unpack('>i', data[off:off + 4])[0]
        off += 4
        out = []
        for _ in range(count):
            ln = struct.unpack('>H', data[off:off + 2])[0]
            out.append(data[off + 2:off + 2 + ln].decode('utf-8'))
            off += 2 + ln
        return out, off

    blocks, off = strings(off)
    biomes, off = strings(off)
    climate = None
    if off < len(data):
        q = struct.unpack('>i', data[off:off + 4])[0]
        off += 4
        climate = np.frombuffer(data[off:off + 6 * q * q * 4], dtype='>f4').reshape(6, q, q).astype(float)
    global CLIMATE
    CLIMATE = climate
    top = arr[:, 0].reshape(width, width).astype(int)
    ground = arr[:, 1].reshape(width, width).astype(int)
    top_block = arr[:, 2].reshape(width, width).astype(int)
    ground_block = arr[:, 3].reshape(width, width).astype(int)
    biome = arr[:, 4].reshape(width, width).astype(int)
    return width, x0, z0, top, ground, top_block, ground_block, biome, blocks, biomes


_tex_cache = {}


def texture_colour(block):
    if block in _tex_cache:
        return _tex_cache[block]
    ns, name = block.split(':')
    if block in FIXED:
        _tex_cache[block] = FIXED[block]
        return FIXED[block]
    base = MOD_TEX if ns == 'earthscapes' else os.path.join(VANILLA, 'textures/block')
    candidates = []
    stem = name
    for suffix in ('_layer',):
        if stem.endswith(suffix):
            stem = stem[:-len(suffix)]
    if stem.endswith('_wood'):
        candidates.append(stem.replace('_wood', '_log'))
    candidates += [stem + '_top', stem, stem + '_stage2', stem + '_0', stem + '_still', stem + '_side', stem + '_4']
    if stem.startswith('potted_'):
        candidates.append(stem[7:])
    colour = None
    for c in candidates:
        p = os.path.join(base, c + '.png')
        if os.path.exists(p):
            im = np.asarray(Image.open(p).convert('RGBA')).astype(float)
            im = im[:16] if im.shape[0] > 16 else im
            a = im[:, :, 3:4] / 255.0
            if a.sum() < 1:
                continue
            colour = tuple(int(v) for v in (im[:, :, :3] * a).sum(axis=(0, 1)) / a.sum())
            break
    if colour is None:
        colour = (255, 0, 255)
    _tex_cache[block] = colour
    return colour


def biome_colours(biome_id):
    ns, name = biome_id.split(':')
    grass, foliage, water = (124, 189, 107), (89, 174, 48), (63, 118, 228)
    p = os.path.join(MOD_BIOMES, name + '.json') if ns == 'earthscapes' else None
    if p and os.path.exists(p):
        with open(p) as f:
            e = json.load(f)['effects']

        def hx(s):
            return tuple(int(s[i:i + 2], 16) for i in (1, 3, 5))
        grass = hx(e['grass_color']) if 'grass_color' in e else grass
        foliage = hx(e['foliage_color']) if 'foliage_color' in e else foliage
        water = hx(e['water_color'])
    return grass, foliage, water


def tint(colour, tint_rgb):
    # textures for tinted blocks are greyscale; multiply
    g = sum(colour) / 3.0 / 255.0
    return tuple(min(255, int(t * g * 1.15)) for t in tint_rgb)


def main():
    path, prefix = sys.argv[1], sys.argv[2]
    os.makedirs(os.path.dirname(prefix) or '.', exist_ok=True)
    width, x0, z0, top, ground, top_block, ground_block, biome, blocks, biomes = read(path)
    bcol = [biome_colours(b) for b in biomes]
    img = np.zeros((width, width, 3))
    water_idx = blocks.index('minecraft:water') if 'minecraft:water' in blocks else -1
    for z in range(width):
        for x in range(width):
            b = blocks[top_block[z, x]]
            gcol, fcol, wcol = bcol[biome[z, x]]
            if top_block[z, x] == water_idx or b == 'minecraft:water':
                depth = max(0, top[z, x] - ground[z, x])
                gb = blocks[ground_block[z, x]]
                floor = texture_colour(gb)
                t = min(1.0, depth / 8.0)
                c = tuple(int(wcol[i] * (0.55 + 0.45 * (1 - t)) * 0.6 + floor[i] * 0.4 * (1 - t)) for i in range(3))
            else:
                c = texture_colour(b)
                if b in GRASS_TINTED:
                    c = tint(c, gcol)
                elif b in FOLIAGE_TINTED:
                    c = tint(c, fcol)
            img[z, x] = c
    # ground-only colours (surface rules)
    gimg = np.zeros((width, width, 3))
    for z in range(width):
        for x in range(width):
            b = blocks[ground_block[z, x]]
            gcol, fcol, wcol = bcol[biome[z, x]]
            c = texture_colour(b)
            if b in GRASS_TINTED:
                c = tint(c, gcol)
            if blocks[top_block[z, x]] == 'minecraft:water':
                c = tuple(int(c[i] * 0.45 + wcol[i] * 0.55) for i in range(3))
            gimg[z, x] = c
    # hill shading from the terrain (water surfaces count as flat terrain)
    h = np.where(np.array(blocks)[top_block] == 'minecraft:water', top, ground).astype(float)
    gx = np.zeros_like(h)
    gz = np.zeros_like(h)
    gx[:, 1:-1] = (h[:, 2:] - h[:, :-2]) / 2
    gz[1:-1, :] = (h[2:, :] - h[:-2, :]) / 2
    shade = np.clip(1.0 + (-gx - gz) * 0.18, 0.55, 1.35)
    out = np.clip(img * shade[:, :, None], 0, 255).astype(np.uint8)
    Image.fromarray(out, 'RGB').save(prefix + '_terrain.png')
    gout = np.clip(gimg * shade[:, :, None], 0, 255).astype(np.uint8)
    Image.fromarray(gout, 'RGB').save(prefix + '_ground.png')

    # height map
    hn = (h - h.min()) / max(1, h.max() - h.min())
    hm = (np.stack([hn, hn, hn], axis=2) * 255 * shade[:, :, None] / 1.35).clip(0, 255).astype(np.uint8)
    Image.fromarray(hm, 'RGB').save(prefix + '_height.png')

    # biome map with legend
    palette = []
    for i, b in enumerate(biomes):
        hue = (i * 0.618033) % 1.0
        r, g, bb = colorsys.hsv_to_rgb(hue, 0.55, 0.9)
        palette.append((int(r * 255), int(g * 255), int(bb * 255)))
    bim = np.zeros((width, width, 3), dtype=np.uint8)
    for i, c in enumerate(palette):
        bim[biome == i] = c
    bim = (bim * shade[:, :, None] / 1.2).clip(0, 255).astype(np.uint8)
    im = Image.fromarray(bim, 'RGB')
    legend_h = 14 * len(biomes) + 8
    canvas = Image.new('RGB', (width, width + legend_h), (30, 30, 30))
    canvas.paste(im, (0, 0))
    d = ImageDraw.Draw(canvas)
    counts = np.bincount(biome.ravel(), minlength=len(biomes))
    for i, b in enumerate(biomes):
        d.rectangle((4, width + 4 + i * 14, 14, width + 14 + i * 14), fill=palette[i])
        d.text((20, width + 2 + i * 14), '%s  %.1f%%' % (b, 100.0 * counts[i] / counts.sum()), fill=(255, 255, 255))
    canvas.save(prefix + '_biomes.png')
    print('heights: min %d max %d mean %.1f; origin %d,%d; size %d' % (h.min(), h.max(), h.mean(), x0, z0, width))
    if CLIMATE is not None:
        names = ['temperature', 'humidity', 'continentalness', 'erosion', 'weirdness', 'prelim_surface']
        for i, nm in enumerate(names):
            v = CLIMATE[i].ravel()
            print('%-16s p5 %7.3f p25 %7.3f p50 %7.3f p75 %7.3f p95 %7.3f' % (nm, *np.percentile(v, [5, 25, 50, 75, 95])))
    missing = [b for b in blocks if texture_colour(b) == (255, 0, 255)]
    if missing:
        print('no colour for:', ', '.join(missing))


if __name__ == '__main__':
    main()
