#!/usr/bin/env python3
"""Generates every Earthscapes texture procedurally.

Run from the repository root:  python3 tools/textures.py
Textures are written to src/main/resources/assets/earthscapes/textures/{block,item}/.
A contact sheet of all textures is written to build/texture_sheet.png for review.
"""
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from pixelkit import (SIZE, blank, blade, disc, fbm, fill_transparent_rgb, hexc, line, mix, outline_darken,  # noqa: E402
                      palette, put, put_wrap, quantize, rng, save, shade, value_noise, white)

ROOT = os.path.join(os.path.dirname(__file__), '..')
OUT_BLOCK = os.path.join(ROOT, 'src/main/resources/assets/earthscapes/textures/block')
OUT_ITEM = os.path.join(ROOT, 'src/main/resources/assets/earthscapes/textures/item')

BLOCK = {}
ITEM = {}


def block(name):
    def deco(fn):
        BLOCK[name] = fn
        return fn
    return deco


def item(name):
    def deco(fn):
        ITEM[name] = fn
        return fn
    return deco


def shaded_field(values, pal):
    img = quantize(np.clip(values, 0, 0.9999), pal).copy()
    return img


# ----------------------------------------------------------------------------- ground

# the orange of Erg Chebbi: redder and more saturated than ordinary sand
SAND_PAL = palette('#AE5C2C', '#BE6A36', '#CC7840', '#D8864A', '#E29454', '#EAA262', '#F2B476')


@block('sahara_sand')
def sahara_sand():
    """Top face: wind ripples, asymmetric (bright stoss, shaded lee), over fine grain."""
    grain = fbm(11, ((8, 0.5), (16, 0.5)))
    speck = white(12)
    v = np.zeros((SIZE, SIZE))
    for y in range(SIZE):
        for x in range(SIZE):
            phase = (y + 1.1 * math.sin(2 * math.pi * x / 16) + 0.5 * math.sin(2 * math.pi * 2 * x / 16 + 1.3)) / 4.0
            f = phase - math.floor(phase)
            if f < 0.7:
                ripple = 0.02 + 0.3 * (f / 0.7)
            else:
                ripple = 0.34 - 0.7 * ((f - 0.7) / 0.3)
            v[y, x] = 0.5 + ripple + (grain[y, x] - 0.5) * 0.2 + (speck[y, x] - 0.5) * 0.1
    return shaded_field(v * 0.88, SAND_PAL)


@block('sahara_sand_side')
def sahara_sand_side():
    grain = fbm(13, ((4, 0.3), (8, 0.35), (16, 0.35)))
    speck = white(14)
    v = 0.42 + (grain - 0.5) * 0.45 + (speck - 0.5) * 0.18
    return shaded_field(v, SAND_PAL)


SANDSTONE_PAL = palette('#A45E32', '#B46C3C', '#C27A46', '#CE8850', '#D9965C', '#E2A46A', '#EAB47E')


@block('sahara_sandstone')
def sahara_sandstone():
    grain = fbm(21, ((8, 0.6), (16, 0.4)))
    v = np.zeros((SIZE, SIZE))
    for y in range(SIZE):
        for x in range(SIZE):
            band = math.sin(2 * math.pi * (y + 0.6 * math.sin(2 * math.pi * x / 16)) * 3 / 16)
            v[y, x] = 0.5 + 0.18 * band + (grain[y, x] - 0.5) * 0.3
    img = shaded_field(v, SANDSTONE_PAL)
    # bedding seams
    for y in (4, 10):
        for x in range(SIZE):
            if (x * 7 + y) % 5 != 0:
                img[(y + int(round(0.6 * math.sin(2 * math.pi * x / 16)))) % 16, x] = SANDSTONE_PAL[1]
    img[0, :] = SANDSTONE_PAL[5]
    img[15, :] = SANDSTONE_PAL[2]
    return img


@block('sahara_sandstone_top')
def sahara_sandstone_top():
    grain = fbm(23, ((4, 0.4), (8, 0.3), (16, 0.3)))
    v = 0.62 + (grain - 0.5) * 0.3
    img = shaded_field(v, SANDSTONE_PAL)
    img[0, :] = SANDSTONE_PAL[3]
    img[:, 0] = SANDSTONE_PAL[3]
    return img


@block('sahara_sandstone_bottom')
def sahara_sandstone_bottom():
    grain = fbm(25, ((8, 0.5), (16, 0.5)))
    v = 0.45 + (grain - 0.5) * 0.45 + (white(26) - 0.5) * 0.15
    return shaded_field(v, SANDSTONE_PAL)


HAMADA_PAL = palette('#241914', '#2F211A', '#3B2A21', '#48342A', '#584033', '#6A4E3E', '#7E604C', '#937460')


@block('hamada_stone')
def hamada_stone():
    big = fbm(31, ((2, 0.4), (4, 0.3), (8, 0.3)))
    fine = fbm(32, ((8, 0.5), (16, 0.5)))
    v = 0.3 + big * 0.3 + (fine - 0.5) * 0.3
    img = shaded_field(v, HAMADA_PAL)
    # a few weathering cracks along noise contours (sparse, so the tiling does not show)
    r0 = rng(34)
    for y in range(SIZE):
        for x in range(SIZE):
            a = big[y, x]
            b = big[y, (x + 1) % 16]
            if (a - 0.55) * (b - 0.55) < 0 and r0.random() < 0.55:
                img[y, x] = HAMADA_PAL[1]
    # varnish glints and quartz specks
    r = rng(33)
    for _ in range(7):
        put(img, int(r.integers(16)), int(r.integers(16)), HAMADA_PAL[7])
    return img


@block('desert_pavement')
def desert_pavement():
    matrix = palette('#B58A5C', '#C29868', '#CEA676', '#D9B384', '#E2C092')
    g = fbm(41, ((8, 0.5), (16, 0.5)))
    img = shaded_field(0.35 + (g - 0.5) * 0.6 + (white(42) - 0.5) * 0.2, matrix)
    r = rng(43)
    stones = [palette('#2C211B', '#3E2F25', '#57443A'), palette('#5E3424', '#76442F', '#8F5A42'),
              palette('#4E4A46', '#66615B', '#807A72'), palette('#3A2A20', '#4C3828', '#6A5240')]
    for i in range(16):
        cx, cy = r.random() * 16, r.random() * 16
        rad = 0.7 + r.random() * 1.0
        pal = stones[int(r.integers(len(stones)))]
        for y in range(int(cy - rad - 1), int(cy + rad + 2)):
            for x in range(int(cx - rad - 1), int(cx + rad + 2)):
                d = math.hypot(x + 0.5 - cx, (y + 0.5 - cy) * 1.2)
                if d <= rad:
                    tone = 2 if (x + 0.5 - cx) + (y + 0.5 - cy) < -rad * 0.4 else (0 if d > rad * 0.7 else 1)
                    put_wrap(img, x, y, pal[tone])
    return img


@block('salt_crust')
def salt_crust():
    base = palette('#E2DBCD', '#EAE4D8', '#F0EBE1', '#F5F2EA', '#FAF8F3')
    g = fbm(51, ((4, 0.5), (8, 0.5)))
    img = shaded_field(0.45 + (g - 0.5) * 0.35, base)
    r = rng(52)
    pts = [(r.random() * 16, r.random() * 16) for _ in range(9)]
    ridge = hexc('#C8BCA8')
    ridge_hi = hexc('#FFFFFF')
    ridges = np.zeros((16, 16), dtype=bool)
    for y in range(SIZE):
        for x in range(SIZE):
            ds = []
            for (px, py) in pts:
                dx = min(abs(x + 0.5 - px), 16 - abs(x + 0.5 - px))
                dy = min(abs(y + 0.5 - py), 16 - abs(y + 0.5 - py))
                ds.append(math.hypot(dx, dy))
            ds.sort()
            ridges[y, x] = ds[1] - ds[0] < 0.55
    for y in range(SIZE):
        for x in range(SIZE):
            if ridges[y, x]:
                img[y, x] = ridge
            elif ridges[(y + 1) % 16, x] or ridges[y, (x + 1) % 16]:
                img[y, x] = ridge_hi
    for _ in range(3):
        put(img, int(r.integers(16)), int(r.integers(16)), hexc('#CDBB9C'))
    return img


LATERITE_PAL = palette('#5C2214', '#702A18', '#84331D', '#984023', '#AA4D2B', '#BA5B35', '#C86B42')


@block('laterite')
def laterite():
    g = fbm(61, ((4, 0.35), (8, 0.35), (16, 0.3)))
    img = shaded_field(0.48 + (g - 0.5) * 0.6 + (white(62) - 0.5) * 0.16, LATERITE_PAL)
    r = rng(63)
    for _ in range(6):
        x, y = int(r.integers(16)), int(r.integers(16))
        put(img, x, y, LATERITE_PAL[0])
        put_wrap(img, x + 1, y, LATERITE_PAL[1])
    for _ in range(8):
        put(img, int(r.integers(16)), int(r.integers(16)), hexc('#D98A5C'))
    return img


@block('termite_mound')
def termite_mound():
    pal = palette('#7A3C22', '#8C482A', '#9E5532', '#B0633A', '#BF7246', '#CC8254', '#D69264')
    streak = fbm(71, ((2, 0.4), (4, 0.35), (8, 0.25)), stretch=(1, 4))
    g = fbm(72, ((8, 0.5), (16, 0.5)))
    img = shaded_field(0.5 + (streak - 0.5) * 0.55 + (g - 0.5) * 0.25, pal)
    r = rng(73)
    for _ in range(4):
        x, y = int(r.integers(1, 15)), int(r.integers(1, 15))
        put(img, x, y, hexc('#2E140A'))
        put(img, x, y + 1, hexc('#4A2414'))
        put(img, x - 1, y, pal[1])
        put(img, x, y + 2, pal[5])
    return img


GRANITE_PAL = palette('#867B75', '#958A83', '#A39891', '#B0A59D', '#BDB2A9', '#C9BFB6', '#D5CCC3')


@block('kopje_granite')
def kopje_granite():
    g = fbm(81, ((2, 0.3), (4, 0.3), (8, 0.2), (16, 0.2)))
    img = shaded_field(0.5 + (g - 0.5) * 0.45 + (white(82) - 0.5) * 0.25, GRANITE_PAL)
    r = rng(83)
    for _ in range(14):
        put(img, int(r.integers(16)), int(r.integers(16)), hexc('#3D393B'))
    for _ in range(16):
        put(img, int(r.integers(16)), int(r.integers(16)), hexc('#C59C8C'))
    for _ in range(9):
        put(img, int(r.integers(16)), int(r.integers(16)), hexc('#E8E2DA'))
    # crustose lichen: an orange patch and a pale grey-green one
    for (cx, cy, cols) in ((4, 11, ('#C9822F', '#DB9A45')), (12, 3, ('#9EA588', '#B3B99C'))):
        for _ in range(9):
            x = cx + int(r.integers(-2, 3))
            y = cy + int(r.integers(-1, 2))
            put_wrap(img, x, y, hexc(cols[int(r.integers(2))]))
    return img


# ----------------------------------------------------------------------------- grasses & flowers

def grass_sprite(seed, count, heights, leans, base_cols, tip_cols, seed_heads=None, head_chance=0.4, xs=None, width_chance=0.3,
                 base_y=15):
    img = blank()
    r = rng(seed)
    for i in range(count):
        x = int(xs[i]) if xs is not None else int(r.integers(1, 15))
        h = int(r.integers(heights[0], heights[1] + 1))
        lean = r.uniform(leans[0], leans[1])
        cols = [hexc(c) for c in base_cols] + [hexc(c) for c in tip_cols]
        pts = blade(img, x, h, lean, cols, base_y=base_y, wobble=0.25, seed=seed * 13 + i,
                    width=2 if r.random() < width_chance else 1)
        if seed_heads and r.random() < head_chance and pts:
            tx, ty, _ = pts[-1]
            hc = [hexc(c) for c in seed_heads]
            for k in range(int(r.integers(2, 4))):
                put(img, tx + int(r.integers(-1, 2)), ty + k, hc[int(r.integers(len(hc)))])
    return img


@block('golden_grass')
def golden_grass():
    return grass_sprite(101, 11, (5, 12), (-3.0, 3.0), ['#7C5C22', '#94702A', '#AD8634'], ['#C49C44', '#D6B258', '#E6C978'],
                        seed_heads=['#B5662E', '#D49A52', '#E8C27A'], head_chance=0.45, xs=[1, 3, 4, 6, 7, 8, 9, 11, 12, 13, 14])


@block('tall_golden_grass_bottom')
def tall_golden_grass_bottom():
    return grass_sprite(102, 9, (12, 16), (-2.0, 2.0), ['#6E5020', '#86622A', '#9C7632'], ['#B08A3C', '#C29C48'],
                        xs=[1, 3, 4, 6, 8, 9, 11, 12, 14], width_chance=0.2)


@block('tall_golden_grass_top')
def tall_golden_grass_top():
    img = grass_sprite(103, 12, (7, 15), (-3.5, 3.5), ['#9C7632', '#B08A3C'], ['#C49E4A', '#D6B45C', '#E6CA7E', '#F0DB98'],
                       seed_heads=['#B0662E', '#C98848', '#DDB06A', '#EBCB8A'], head_chance=0.7,
                       xs=[1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 14])
    return img


@block('red_oat_grass_bottom')
def red_oat_grass_bottom():
    return grass_sprite(111, 9, (12, 16), (-2.0, 2.0), ['#5E3C1E', '#704A26', '#82582E'], ['#946638', '#A47442'],
                        xs=[1, 3, 4, 6, 8, 9, 11, 12, 14], width_chance=0.2)


@block('red_oat_grass_top')
def red_oat_grass_top():
    img = grass_sprite(112, 12, (8, 15), (-4.0, 4.0), ['#86582E', '#9A6838'], ['#AE7A44', '#C08E52', '#CEA264', '#DAB678'],
                       xs=[1, 2, 4, 5, 6, 7, 8, 9, 10, 12, 13, 14])
    r = rng(113)
    # drooping, rusty spikelet clusters of Themeda triandra
    for _ in range(6):
        x, y = int(r.integers(1, 15)), int(r.integers(0, 7))
        for k in range(3):
            put(img, x + (k % 2), y + k, hexc(['#8C4426', '#A25830', '#B6703E'][k]))
    return img


@block('feather_grass_bottom')
def feather_grass_bottom():
    return grass_sprite(121, 8, (13, 16), (-1.5, 1.5), ['#5A5E36', '#6E7442', '#80864E'], ['#949A5E', '#A6AC6E'],
                        xs=[2, 4, 5, 7, 8, 10, 12, 13], width_chance=0.1)


@block('feather_grass_top')
def feather_grass_top():
    img = grass_sprite(122, 9, (4, 9), (-1.0, 1.0), ['#80864E', '#949A5E'], ['#A6AC6E'], xs=[2, 3, 5, 6, 8, 10, 11, 12, 13])
    r = rng(123)
    plume = [hexc('#C8C1B2'), hexc('#DAD4C8'), hexc('#EAE6DD'), hexc('#F6F4EE')]
    # long silky awns sweeping off to one side, the silvery sheen of feather-grass steppe
    for i in range(6):
        x0 = int(r.integers(2, 12))
        y0 = int(r.integers(8, 12))
        direction = 1 if r.random() < 0.75 else -1
        length = int(r.integers(8, 13))
        for k in range(length):
            t = k / length
            x = x0 + direction * int(round(t * t * 6))
            y = y0 - int(round(k * 0.85 - t * t * 3.5))
            if k % 4 != 3:
                put(img, x, y, plume[min(3, int(t * 4))])
    return img


@block('tall_steppe_grass_bottom')
def tall_steppe_grass_bottom():
    return grass_sprite(131, 9, (12, 16), (-2.0, 2.0), ['#4C3E26', '#5E4C2E', '#725A36'], ['#866840', '#98764A'],
                        xs=[1, 3, 4, 6, 8, 9, 11, 12, 14], width_chance=0.2)


@block('tall_steppe_grass_top')
def tall_steppe_grass_top():
    img = grass_sprite(132, 11, (7, 15), (-3.0, 3.0), ['#866840', '#98764A'], ['#AC8452', '#BE945C', '#CFA66A', '#DDB87C'],
                       xs=[1, 2, 4, 5, 6, 8, 9, 11, 12, 13, 14])
    r = rng(133)
    # wine-red seed heads, glowing in low evening light like the photo's foreground
    heads = [hexc('#7A2E2E'), hexc('#953C38'), hexc('#AE5446'), hexc('#C47058')]
    for _ in range(7):
        x, y = int(r.integers(1, 15)), int(r.integers(0, 6))
        for k in range(int(r.integers(2, 5))):
            put(img, x + (1 if k == 2 else 0), y + k, heads[int(r.integers(4))])
    return img


@block('steppe_grass')
def steppe_grass():
    # late-summer sward: bronze and straw with a few rusty seed heads, as in the meadow below Elbrus
    return grass_sprite(141, 10, (4, 10), (-3.0, 3.0), ['#5C5228', '#6E6230', '#82723A'], ['#988444', '#AE9852', '#C2AC66'],
                        seed_heads=['#A0704A', '#B88A5E', '#8E5038'], head_chance=0.35, xs=[1, 3, 4, 6, 7, 8, 10, 11, 13, 14])


@block('drinn_grass')
def drinn_grass():
    return grass_sprite(151, 12, (4, 11), (-4.5, 4.5), ['#6E6A48', '#86825A', '#9E9A6E'], ['#B4AE84', '#C8C29A', '#DAD4B0'],
                        seed_heads=['#E2DCC0', '#C9BE96'], head_chance=0.35, xs=[1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 13, 14])


@block('edelweiss')
def edelweiss():
    img = blank()
    stem = hexc('#7E8C6E')
    for y in range(8, 16):
        put(img, 8, y, stem)
    for (x, y) in ((6, 12), (5, 11), (10, 13), (11, 12), (7, 14)):
        put(img, x, y, hexc('#A3AE92'))
    wool = [hexc('#F6F4EC'), hexc('#E4E2D8'), hexc('#CFCDC2')]
    cx, cy = 8, 6
    for (dx, dy) in ((0, -3), (0, -2), (2, -2), (3, -1), (2, 0), (3, 1), (2, 2), (1, 3), (0, 3), (-1, 3), (-2, 2), (-3, 1), (-2, 0),
                     (-3, -1), (-2, -2), (1, -2), (-1, -2), (2, 1), (-2, 1), (1, 2), (-1, 2)):
        put(img, cx + dx, cy + dy, wool[(abs(dx) + abs(dy)) % 3])
    for (dx, dy) in ((0, 0), (1, 0), (0, 1), (1, 1), (-1, 0), (0, -1)):
        put(img, cx + dx, cy + dy, hexc('#D9BE4A') if (dx + dy) % 2 == 0 else hexc('#B49A34'))
    return img


@block('pasque_flower')
def pasque_flower():
    img = blank()
    stem = [hexc('#6E7E50'), hexc('#8C9A6A')]
    for y in range(6, 16):
        put(img, 7 + (1 if y > 12 else 0), y, stem[y % 2])
    # feathery basal leaves
    for (x, y) in ((4, 14), (5, 13), (3, 13), (10, 14), (11, 13), (12, 12), (6, 15), (9, 15)):
        put(img, x, y, hexc('#8FA070'))
    petals = [hexc('#5A2C86'), hexc('#7444A6'), hexc('#9064C0'), hexc('#AC88D4')]
    shape = ["..2332..", ".123321.", "01233210", "01222210", ".011110."]
    for j, row in enumerate(shape):
        for i, ch in enumerate(row):
            if ch != '.':
                put(img, 4 + i, 1 + j, petals[int(ch)])
    for (x, y) in ((7, 3), (8, 3), (7, 2), (8, 4)):
        put(img, x, y, hexc('#F0CC3C'))
    return img


@block('heliconia_bottom')
def heliconia_bottom():
    img = blank()
    leaf = [hexc('#25521C'), hexc('#2F6624'), hexc('#3B7A2C'), hexc('#4C8E38')]
    rib = hexc('#7CB056')
    for (x, lean, h) in ((6, -5, 15), (8, 0, 16), (10, 5, 15), (7, -2, 12), (9, 3, 13)):
        for k in range(h):
            t = k / h
            px = x + int(round(lean * t * t))
            py = 15 - k
            width = int(round(2.5 * math.sin(t * math.pi))) if t > 0.25 else 0
            for w in range(-width, width + 1):
                put(img, px + w, py, leaf[min(3, abs(w) + (1 if k % 3 == 0 else 0))])
            put(img, px, py, rib if t > 0.25 else hexc('#4E7A30'))
    return img


@block('heliconia_top')
def heliconia_top():
    img = blank()
    leaf = [hexc('#2F6624'), hexc('#3B7A2C'), hexc('#4C8E38')]
    for (x, lean, h) in ((5, -4, 10), (11, 4, 11)):
        for k in range(h):
            t = k / h
            px = x + int(round(lean * t))
            width = int(round(2.0 * math.sin(t * math.pi)))
            for w in range(-width, width + 1):
                put(img, px + w, 15 - k, leaf[min(2, abs(w))])
    # pendent zig-zag inflorescence: scarlet boat-shaped bracts edged in yellow and green
    stalk = hexc('#8A2A1E')
    for y in range(6, 16):
        put(img, 8, y, stalk)
    red = [hexc('#A81E16'), hexc('#CC2C1E'), hexc('#E64A2C')]
    for i, y in enumerate(range(5, 15, 2)):
        side = -1 if i % 2 == 0 else 1
        for k in range(3):
            put(img, 8 + side * (k + 1), y + (1 if k == 2 else 0), red[min(2, k)])
        put(img, 8 + side * 4, y + 1, hexc('#F2C230'))
        put(img, 8 + side * 1, y + 1, hexc('#6E9A30'))
    return img


@block('giant_taro_bottom')
def giant_taro_bottom():
    img = blank()
    stem = [hexc('#3E6A28'), hexc('#4E7E32'), hexc('#5E903C')]
    for (x, lean) in ((5, -3), (8, 0), (11, 3), (7, -1), (10, 2)):
        for k in range(16):
            t = k / 16
            put(img, x + int(round(lean * t)), 15 - k, stem[k % 3])
    return img


@block('giant_taro_top')
def giant_taro_top():
    img = blank()
    leaf = [hexc('#2C5E1C'), hexc('#367024'), hexc('#42822C'), hexc('#4F9436')]
    vein = hexc('#86BA5C')
    for (cx, cy, rx, ry, tip) in ((4.5, 6.0, 4.2, 5.5, -1), (11.5, 7.0, 4.2, 5.8, 1)):
        for y in range(16):
            for x in range(16):
                dx = (x + 0.5 - cx) / rx
                dy = (y + 0.5 - cy) / ry
                # heart / arrow shape: notch at the top, point at the bottom
                if dx * dx + dy * dy <= 1.0 and not (dy < -0.55 and abs(dx) < 0.18):
                    shade_i = min(3, int((1 - (dx * dx + dy * dy)) * 3.5))
                    put(img, x, y, leaf[shade_i])
        for k in range(int(ry * 2)):
            put(img, int(cx), int(cy - ry + 1 + k), vein)
        for k in range(1, 4):
            put(img, int(cx) - k, int(cy) - 2 + k, vein)
            put(img, int(cx) + k, int(cy) - 2 + k, vein)
    for y in range(11, 16):
        put(img, 8, y, hexc('#4E7E32'))
    return img


@block('bromeliad')
def bromeliad():
    img = blank()
    leaves = [hexc('#2E6224'), hexc('#3E7A30'), hexc('#5A963E'), hexc('#84A842')]
    for (dx, h) in ((-6, 5), (-4, 7), (-2, 9), (2, 9), (4, 7), (6, 5), (-5, 3), (5, 3)):
        for k in range(h):
            t = k / max(1, h - 1)
            put(img, 8 + int(round(dx * t)), 15 - int(round(k * (1 - 0.3 * t))), leaves[min(3, int(t * 4))])
    for (x, y, c) in ((7, 9, '#C8283A'), (8, 9, '#E0485A'), (7, 10, '#E0485A'), (8, 10, '#C8283A'), (6, 11, '#B81E30'), (9, 11, '#B81E30'),
                      (7, 8, '#F08A2A'), (8, 7, '#F6B03A'), (7, 6, '#F08A2A')):
        put(img, x, y, hexc(c))
    return img


@block('liana')
def liana():
    img = blank()
    rope = [hexc('#4A3A22'), hexc('#5E4A2C'), hexc('#76603A'), hexc('#8C764C')]
    for y in range(16):
        x = 7 + int(round(1.2 * math.sin(2 * math.pi * y / 16)))
        put(img, x, y, rope[1])
        put(img, x + 1, y, rope[2 + (y % 2)])
        if y % 5 == 0:
            put(img, x - 1, y, rope[0])
    for (x, y) in ((10, 3), (11, 4), (4, 10), (5, 11), (10, 13)):
        put(img, x, y, hexc('#4E7A30'))
        put(img, x + 1, y, hexc('#6A9A40'))
    return img


@block('liana_tip')
def liana_tip():
    img = blank()
    rope = [hexc('#5E4A2C'), hexc('#76603A'), hexc('#8C764C')]
    for y in range(0, 10):
        x = 7 + int(round(1.0 * math.sin(2 * math.pi * y / 16)))
        put(img, x, y, rope[0])
        put(img, x + 1, y, rope[1 + (y % 2)])
    for (x, y, c) in ((6, 10, '#3E6E28'), (7, 10, '#4E8030'), (8, 10, '#5E9038'), (9, 11, '#4E8030'), (7, 11, '#6A9A40'),
                      (8, 12, '#3E6E28'), (6, 12, '#5E9038'), (10, 10, '#3E6E28')):
        put(img, x, y, hexc(c))
    return img


# ----------------------------------------------------------------------------- leaves

def leaves_texture(seed, pal_hex, density, scale_layers=((4, 0.5), (8, 0.3), (16, 0.2)), hole='#1A2410', highlight=None):
    pal = palette(*pal_hex)
    clump = fbm(seed, scale_layers)
    tone = fbm(seed + 1, ((4, 0.6), (8, 0.4)))
    rnd = white(seed + 2)
    img = blank()
    for y in range(SIZE):
        for x in range(SIZE):
            v = clump[y, x] * 0.65 + rnd[y, x] * 0.35
            if v > 1.0 - density:
                # light from the top left: lighter where the clump field rises towards it
                grad = clump[y, x] - clump[(y + 1) % 16, (x + 1) % 16]
                t = np.clip(0.35 + tone[y, x] * 0.45 + grad * 1.6 + (rnd[y, x] - 0.5) * 0.2, 0, 0.999)
                img[y, x] = pal[int(t * len(pal))]
    if highlight:
        r = rng(seed + 3)
        for _ in range(5):
            x, y = int(r.integers(16)), int(r.integers(16))
            if img[y, x, 3]:
                img[y, x] = hexc(highlight)
    return fill_transparent_rgb(img, hole)


@block('umbrella_thorn_leaves')
def umbrella_thorn_leaves():
    # tiny bipinnate leaflets: fine grained and airy
    return leaves_texture(201, ['#2C3A16', '#38481C', '#455622', '#53652A', '#617332', '#71823C'], 0.52,
                          scale_layers=((8, 0.5), (16, 0.5)), hole='#141C0C', highlight='#84944C')


@block('thornbush_leaves')
def thornbush_leaves():
    # grey-olive, wiry dry-season thicket with lots of gaps between the twigs
    return leaves_texture(202, ['#343A22', '#424A2A', '#505832', '#5E663A', '#6C7344', '#7C8250'], 0.5,
                          scale_layers=((8, 0.6), (16, 0.4)), hole='#181C10', highlight='#8E9058')


@block('baobab_leaves')
def baobab_leaves():
    return leaves_texture(203, ['#33521C', '#426626', '#527A30', '#648E3C', '#78A24C'], 0.6, hole='#16220C')


@block('fever_tree_leaves')
def fever_tree_leaves():
    return leaves_texture(204, ['#4E6E26', '#5E8230', '#70963C', '#84AA48', '#9ABE5C', '#B2CE74'], 0.46,
                          scale_layers=((8, 0.5), (16, 0.5)), hole='#1E2A10')


@block('kapok_leaves')
def kapok_leaves():
    return leaves_texture(205, ['#24481A', '#2E5A20', '#3A6E28', '#468232', '#56963C', '#68A84A'], 0.68, hole='#0E1C08',
                          highlight='#7EBA58')


@block('rainforest_leaves')
def rainforest_leaves():
    return leaves_texture(206, ['#142E10', '#1B3C14', '#234A1A', '#2C5A20', '#376C28', '#447E30'], 0.8,
                          scale_layers=((4, 0.6), (8, 0.4)), hole='#08120A', highlight='#6CA048')


@block('larch_leaves')
def larch_leaves():
    img = blank()
    pal = [hexc(c) for c in ('#4E7E28', '#5E9030', '#70A43C', '#86B84C', '#9ECC62', '#B6DC80')]
    r = rng(207)
    # soft needle tufts (short shoots) radiating from points
    for _ in range(14):
        cx, cy = int(r.integers(16)), int(r.integers(16))
        for (dx, dy) in ((0, 0), (1, 0), (-1, 0), (0, 1), (0, -1), (1, -1), (-1, -1), (2, 0), (-2, 0), (0, -2)):
            if r.random() < 0.8:
                put_wrap(img, cx + dx, cy + dy, pal[min(5, int(r.integers(0, 4)) + (1 if dy < 0 else 0) + (1 if dx < 0 else 0))])
    return fill_transparent_rgb(img, '#18240C')


@block('date_palm_leaves')
def date_palm_leaves():
    """One stiff, glaucous pinnate frond per block: a pale rachis with leaflets slanting off both sides."""
    img = blank()
    pal = [hexc(c) for c in ('#3E5636', '#4C6842', '#5A7A4E', '#6A8C5A', '#7EA06C', '#92B47E')]
    rachis = [hexc('#A49660'), hexc('#BCAE76')]
    r = rng(208)
    for y0 in range(1, 19, 3):
        for side in (-1, 1):
            base_x = 8 if side > 0 else 7
            length = 6 + int(r.integers(0, 2))
            for k in range(1, length + 1):
                x = base_x + side * k
                y = y0 - (k * 3) // 6
                tone = 4 if k < 3 else (3 if k < 5 else 2)
                put_wrap(img, x, y, pal[tone + int(r.integers(-1, 2))])
                if k <= 2:
                    put_wrap(img, x, y + 1, pal[1])
    for y in range(16):
        put(img, 7, y, rachis[0])
        put(img, 8, y, rachis[1])
    return fill_transparent_rgb(img, '#1A2414')


@block('acai_palm_leaves')
def acai_palm_leaves():
    img = blank()
    pal = [hexc(c) for c in ('#20461A', '#2A5A20', '#36702A', '#448634', '#56A040')]
    # drooping, finely divided pinnae hanging like curtains
    for x0 in range(0, 16, 2):
        for i in range(16):
            x = x0 + int(round(math.sin(i / 16 * math.pi) * 1.5))
            put_wrap(img, x, i, pal[(i + x0) % 5])
    r = rng(209)
    for _ in range(40):
        x, y = int(r.integers(16)), int(r.integers(16))
        img[y, x, 3] = 0
    return fill_transparent_rgb(img, '#0E1E0A')


@block('buriti_palm_leaves')
def buriti_palm_leaves():
    img = blank()
    pal = [hexc(c) for c in ('#2E5A1C', '#3A6C24', '#48802E', '#58943A', '#6CA84A')]
    # stiff fan segments radiating from the bottom centre
    for a in range(-70, 71, 12):
        rad = math.radians(a)
        for k in range(18):
            x = 8 + int(round(math.sin(rad) * k))
            y = 15 - int(round(math.cos(rad) * k))
            put(img, x, y, pal[(k // 3 + (a // 12)) % 5])
    return fill_transparent_rgb(img, '#10200A')


@block('cecropia_leaves')
def cecropia_leaves():
    img = blank()
    top = [hexc(c) for c in ('#5E7A4E', '#6E8A5C', '#80A06C', '#94B27E')]
    under = [hexc('#C6D0BC'), hexc('#DCE2D4')]
    # deeply lobed, hand-shaped leaves with pale undersides
    for (cx, cy) in ((4, 4), (12, 5), (7, 12), (14, 13)):
        for lobe in range(7):
            a = lobe / 7 * 2 * math.pi
            for k in range(5):
                x = cx + int(round(math.cos(a) * k))
                y = cy + int(round(math.sin(a) * k))
                put_wrap(img, x, y, under[k % 2] if lobe % 3 == 0 else top[min(3, k)])
    return fill_transparent_rgb(img, '#202A18')


# ----------------------------------------------------------------------------- wood

def bark(seed, pal_hex, style):
    pal = palette(*pal_hex)
    n = len(pal)
    if style == 'wrinkled':  # baobab: smooth, with horizontal folds
        g = fbm(seed, ((2, 0.4), (4, 0.35), (8, 0.25)), stretch=(1, 0.5))
        v = 0.5 + (g - 0.5) * 0.5
        img = shaded_field(v, pal)
        r = rng(seed)
        for y in (2, 6, 9, 13):
            for x in range(16):
                if r.random() < 0.75:
                    yy = y + int(round(0.7 * math.sin(2 * math.pi * x / 16 + y)))
                    put_wrap(img, x, yy, pal[1])
                    put_wrap(img, x, yy + 1, pal[n - 2])
        return img
    if style == 'lichen':  # kapok: pale smooth bark with lichen blotches and conical prickles
        g = fbm(seed, ((2, 0.3), (4, 0.4), (8, 0.3)), stretch=(1, 3))
        img = shaded_field(0.5 + (g - 0.5) * 0.45 + (white(seed + 5) - 0.5) * 0.1, pal)
        r = rng(seed)
        for (cols, count) in ((('#A8AE88', '#BDC29E'), 10), (('#D6D2B8', '#E4E0C8'), 7)):
            cx, cy = r.integers(16), r.integers(16)
            for _ in range(count):
                put_wrap(img, int(cx + r.integers(-2, 3)), int(cy + r.integers(-1, 2)), hexc(cols[int(r.integers(2))]))
        for _ in range(3):
            x, y = int(r.integers(16)), int(r.integers(16))
            put_wrap(img, x, y, hexc('#4C473E'))
            put_wrap(img, x, y + 1, hexc('#6A6458'))
        return img
    if style == 'powdery':  # fever tree: yellow-green powdery bark peeling in patches
        g = fbm(seed, ((2, 0.4), (4, 0.35), (8, 0.25)))
        img = shaded_field(0.45 + (g - 0.5) * 0.6 + (white(seed + 1) - 0.5) * 0.12, pal)
        return img
    if style == 'diamond':  # palm: lattice of old leaf bases
        img = blank()
        for y in range(16):
            for x in range(16):
                u = (x + y) % 8
                w = (x - y) % 8
                edge = min(u, w)
                t = 0.15 if edge == 0 else (0.45 if edge == 1 else 0.6 + 0.1 * ((x * 3 + y) % 3))
                if u in (6, 7) and w in (6, 7):
                    t = 0.85
                img[y, x] = pal[min(n - 1, int(t * n))]
        return img
    if style == 'ringed':  # cecropia/acai: smooth stem with leaf-scar rings
        g = fbm(seed, ((2, 0.5), (4, 0.5)), stretch=(1, 4))
        img = shaded_field(0.55 + (g - 0.5) * 0.35, pal)
        for y in (3, 8, 13):
            for x in range(16):
                put(img, x, y, pal[1])
                put(img, x, y + 1, pal[n - 1])
        return img
    if style == 'flaky':  # larch: thick reddish plates split by deep fissures
        g = fbm(seed, ((4, 0.5), (8, 0.5)), stretch=(1, 3))
        img = shaded_field(0.4 + (g - 0.5) * 0.5 + 0.25, pal)
        r = rng(seed)
        for x0 in (1, 5, 10, 13):
            x = float(x0)
            for y in range(16):
                put_wrap(img, int(round(x)), y, pal[0])
                x += r.uniform(-0.6, 0.6)
        for _ in range(10):
            put(img, int(r.integers(16)), int(r.integers(16)), pal[n - 1])
        return img
    raise ValueError(style)


def log_top(seed, wood_hex, bark_hex):
    wood = palette(*wood_hex)
    bark_col = hexc(bark_hex)
    img = blank()
    r = rng(seed)
    wobble = fbm(seed, ((4, 0.6), (8, 0.4)))
    for y in range(16):
        for x in range(16):
            d = max(abs(x - 7.5), abs(y - 7.5)) * 0.55 + math.hypot(x - 7.5, y - 7.5) * 0.45
            d += (wobble[y, x] - 0.5) * 0.9
            if max(abs(x - 7.5), abs(y - 7.5)) > 6.6:
                img[y, x] = shade(bark_col, 0.9 + 0.2 * r.random())
                continue
            ring = int(d) % 2
            t = 0.35 + 0.35 * ring + 0.25 * (1 - d / 8)
            img[y, x] = wood[min(len(wood) - 1, max(0, int(t * len(wood))))]
    return img


def stripped(seed, pal_hex):
    pal = palette(*pal_hex)
    g = fbm(seed, ((4, 0.5), (8, 0.5)), stretch=(1, 6))
    return shaded_field(0.5 + (g - 0.5) * 0.7 + (white(seed + 1) - 0.5) * 0.08, pal)


def planks(seed, pal_hex):
    pal = palette(*pal_hex)
    n = len(pal)
    g = fbm(seed, ((8, 0.5), (16, 0.5)), stretch=(6, 1))
    img = shaded_field(0.45 + (g - 0.5) * 0.5 + 0.1, pal)
    r = rng(seed)
    for board in range(4):
        y_top = board * 4
        for x in range(16):
            img[y_top + 3, x] = pal[0]
            img[y_top, x] = mix(img[y_top, x], pal[n - 1], 0.35)
        joint = int(r.integers(2, 14)) if board % 2 == 0 else int(r.integers(2, 14))
        for y in range(y_top, y_top + 3):
            img[y, joint] = pal[1]
        for _ in range(2):
            put(img, int(r.integers(16)), y_top + 1 + int(r.integers(2)), pal[1])
    return img


@block('baobab_log')
def baobab_log():
    return bark(301, ['#6E6058', '#7E7066', '#8E8074', '#9E9082', '#ADA092', '#BBAFA2'], 'wrinkled')


@block('baobab_log_top')
def baobab_log_top():
    return log_top(302, ['#9C7058', '#B08268', '#C29678', '#D2A88A'], '#8E8074')


@block('stripped_baobab_log')
def stripped_baobab_log():
    return stripped(303, ['#A87866', '#B88A76', '#C69A86', '#D2AA96', '#DCB8A6'])


@block('stripped_baobab_log_top')
def stripped_baobab_log_top():
    return log_top(304, ['#9C7058', '#B08268', '#C29678', '#D2A88A'], '#C69A86')


@block('baobab_planks')
def baobab_planks():
    return planks(305, ['#8A6250', '#9E7460', '#B08670', '#C29880', '#D0A890'])


@block('kapok_log')
def kapok_log():
    return bark(311, ['#7E7A70', '#8E8A7E', '#9E9A8C', '#AEAA9C', '#BCB8AA', '#C8C4B6'], 'lichen')


@block('kapok_log_top')
def kapok_log_top():
    return log_top(312, ['#B8A88A', '#C8B898', '#D6C8A8', '#E2D6B8'], '#9E9A8C')


@block('stripped_kapok_log')
def stripped_kapok_log():
    return stripped(313, ['#BEB096', '#CABCA2', '#D6C8AE', '#E0D4BA', '#EADEC6'])


@block('stripped_kapok_log_top')
def stripped_kapok_log_top():
    return log_top(314, ['#B8A88A', '#C8B898', '#D6C8A8', '#E2D6B8'], '#D6C8AE')


@block('kapok_planks')
def kapok_planks():
    return planks(315, ['#A8987A', '#BAAA8A', '#CABA9A', '#D8CAAA', '#E4D8BA'])


@block('date_palm_log')
def date_palm_log():
    return bark(321, ['#4E3A26', '#644A30', '#7A5C3C', '#8E6E48', '#A28256', '#B49664'], 'diamond')


@block('date_palm_log_top')
def date_palm_log_top():
    img = log_top(322, ['#B49A6A', '#C4AA78', '#D2BA88', '#DEC898'], '#7A5C3C')
    r = rng(323)
    for _ in range(20):  # fibrous monocot core: no rings, just fibre dots
        put(img, int(r.integers(2, 14)), int(r.integers(2, 14)), hexc('#A08458'))
    return img


@block('stripped_date_palm_log')
def stripped_date_palm_log():
    return stripped(324, ['#9C7E52', '#AE905E', '#BEA06C', '#CCAE7A', '#D8BC8A'])


@block('stripped_date_palm_log_top')
def stripped_date_palm_log_top():
    return log_top(325, ['#B49A6A', '#C4AA78', '#D2BA88', '#DEC898'], '#BEA06C')


@block('date_palm_planks')
def date_palm_planks():
    return planks(326, ['#7E6038', '#927244', '#A68452', '#B89660', '#C8A670'])


@block('larch_log')
def larch_log():
    return bark(331, ['#3A1E12', '#56301E', '#6A3C26', '#7E4A30', '#92583A', '#A66A48'], 'flaky')


@block('larch_log_top')
def larch_log_top():
    return log_top(332, ['#B0683E', '#C27A4A', '#D08C5A', '#DCA06C'], '#6A3C26')


@block('stripped_larch_log')
def stripped_larch_log():
    return stripped(333, ['#A85E36', '#B86C40', '#C67C4C', '#D28C5A', '#DC9C6A'])


@block('stripped_larch_log_top')
def stripped_larch_log_top():
    return log_top(334, ['#B0683E', '#C27A4A', '#D08C5A', '#DCA06C'], '#C67C4C')


@block('larch_planks')
def larch_planks():
    return planks(335, ['#8E4A28', '#A45A32', '#B66A3E', '#C67A4A', '#D48C5A'])


@block('fever_tree_log')
def fever_tree_log():
    return bark(341, ['#7E8236', '#949A40', '#A8AE4C', '#B8BE5A', '#C6CA6C', '#D2D480'], 'powdery')


@block('fever_tree_log_top')
def fever_tree_log_top():
    return log_top(342, ['#A87A4A', '#B88A58', '#C69A66', '#D2AA76'], '#A8AE4C')


@block('cecropia_log')
def cecropia_log():
    return bark(351, ['#8A887E', '#A6A49A', '#B6B4AA', '#C4C2B8', '#D0CEC4'], 'ringed')


@block('cecropia_log_top')
def cecropia_log_top():
    return log_top(352, ['#B8AA8A', '#C8BA98', '#D6CAA8', '#E2D8B8'], '#B6B4AA')


@block('acai_palm_log')
def acai_palm_log():
    return bark(361, ['#4E5248', '#646A5C', '#747A6C', '#84897A', '#929888'], 'ringed')


@block('acai_palm_log_top')
def acai_palm_log_top():
    return log_top(362, ['#A89870', '#B8A87E', '#C6B68C', '#D2C49C'], '#747A6C')


@block('euphorbia')
def euphorbia():
    img = blank()
    pal = [hexc(c) for c in ('#26341E', '#334428', '#405432', '#4E643C', '#5E7448', '#728658')]
    for y in range(16):
        for x in range(16):
            rib = x % 4
            t = (1, 3, 5, 3)[rib]
            img[y, x] = pal[max(0, min(5, t + (1 if (y * 5 + x) % 7 == 0 else 0) - (1 if y % 8 == 0 else 0)))]
    for y in range(1, 16, 3):
        for x in (2, 6, 10, 14):
            put(img, x, y, hexc('#D8D2A2'))
    return img


@block('euphorbia_top')
def euphorbia_top():
    img = blank()
    pal = [hexc(c) for c in ('#26341E', '#334428', '#405432', '#4E643C', '#5E7448', '#728658')]
    for y in range(16):
        for x in range(16):
            a = math.atan2(y - 7.5, x - 7.5)
            d = math.hypot(x - 7.5, y - 7.5)
            lobe = math.cos(a * 4) * 0.5 + 0.5
            img[y, x] = pal[max(0, min(5, int(5 - d * 0.6 + lobe * 1.5)))]
    return img


# ----------------------------------------------------------------------------- saplings & fruit

def sapling(seed, stem_hex, leaf_hex, style):
    img = blank()
    stem = hexc(stem_hex)
    leaves = [hexc(c) for c in leaf_hex]
    r = rng(seed)
    if style == 'umbrella':
        for y in range(7, 16):
            put(img, 8 if y > 11 else 7, y, stem)
        line(img, 7, 8, 4, 6, stem)
        line(img, 8, 9, 11, 6, stem)
        for x in range(2, 14):
            for y in range(4, 7):
                if r.random() < (0.85 if y == 5 else 0.5):
                    put(img, x, y, leaves[int(r.integers(len(leaves)))])
    elif style == 'baobab':
        for y in range(8, 16):
            for x in (7, 8):
                put(img, x, y, stem if y > 9 else shade(stem, 1.1))
        for (x0, x1) in ((7, 4), (8, 11)):
            line(img, x0, 8, x1, 5, stem)
        for (cx, cy) in ((4, 4), (11, 4), (7, 6)):
            for _ in range(6):
                put(img, cx + int(r.integers(-1, 2)), cy + int(r.integers(-1, 2)), leaves[int(r.integers(len(leaves)))])
    elif style == 'palm':
        for y in range(9, 16):
            put(img, 8, y, stem)
        for a in range(-80, 81, 32):
            rad = math.radians(a)
            for k in range(1, 7):
                x = 8 + int(round(math.sin(rad) * k))
                y = 9 - int(round(math.cos(rad) * k * 0.8)) + int(k * k * 0.08)
                put(img, x, y, leaves[min(len(leaves) - 1, k // 2)])
    elif style == 'conifer':
        for y in range(4, 16):
            put(img, 8, y, stem)
        for y in range(3, 13):
            w = (y - 2) // 3 + 1
            for x in range(8 - w, 9 + w):
                if r.random() < 0.7:
                    put(img, x, y, leaves[int(r.integers(len(leaves)))])
    elif style == 'broadleaf':
        for y in range(6, 16):
            put(img, 8, y, stem)
        for (cx, cy) in ((5, 5), (11, 5), (8, 3), (6, 8), (10, 8)):
            for _ in range(7):
                put(img, cx + int(r.integers(-2, 2)), cy + int(r.integers(-1, 2)), leaves[int(r.integers(len(leaves)))])
    return img


@block('umbrella_thorn_sapling')
def umbrella_thorn_sapling():
    return sapling(401, '#5A4A3A', ['#5E722E', '#74883A', '#8A9C46'], 'umbrella')


@block('fever_tree_sapling')
def fever_tree_sapling():
    return sapling(402, '#A8AE4C', ['#70963C', '#84AA48', '#9ABE5C'], 'umbrella')


@block('baobab_sapling')
def baobab_sapling():
    return sapling(403, '#8E8074', ['#527A30', '#648E3C', '#78A24C'], 'baobab')


@block('date_palm_sapling')
def date_palm_sapling():
    return sapling(404, '#7A5C3C', ['#4C6842', '#5A7A4E', '#6A8C5A', '#7EA06C'], 'palm')


@block('kapok_sapling')
def kapok_sapling():
    return sapling(405, '#9E9A8C', ['#3A6E28', '#468232', '#56963C'], 'broadleaf')


@block('larch_sapling')
def larch_sapling():
    return sapling(406, '#6A3C26', ['#70A43C', '#86B84C', '#9ECC62'], 'conifer')


def dates_stage(fruit_hex):
    img = blank()
    stalk = [hexc('#C8A040'), hexc('#A88430')]
    fruit = [hexc(c) for c in fruit_hex]
    for y in range(0, 6):
        put(img, 8, y, stalk[y % 2])
    for (sx, lean) in ((5, -1), (7, 0), (9, 0), (11, 1)):
        line(img, 8, 5, sx, 9, stalk[0])
        for k in range(6):
            x = sx + (lean if k > 3 else 0)
            y = 8 + k
            if k % 2 == 0:
                put(img, x - 1, y, fruit[0])
                put(img, x, y, fruit[1])
                put(img, x, y + 1, fruit[2])
            else:
                put(img, x + 1, y, fruit[1])
    return img


@block('dates_stage0')
def dates_stage0():
    return dates_stage(['#5E7A2A', '#7A9636', '#94AE48'])


@block('dates_stage1')
def dates_stage1():
    return dates_stage(['#B88A1E', '#D8AA2A', '#ECC444'])


@block('dates_stage2')
def dates_stage2():
    return dates_stage(['#6E2E14', '#93441C', '#B86028'])


@item('date')
def date_item():
    img = blank()
    for (cx, cy) in ((5, 9), (10, 7), (8, 11)):
        for y in range(16):
            for x in range(16):
                d = ((x + 0.5 - cx) / 2.2) ** 2 + ((y + 0.5 - cy) / 3.3) ** 2
                if d <= 1.0:
                    t = (x - cx + y - cy)
                    img[y, x] = hexc('#C47A3A') if t < -2 else (hexc('#8E3E1A') if t < 1 else hexc('#6A2C12'))
    put(img, 9, 3, hexc('#C8A040'))
    put(img, 10, 4, hexc('#C8A040'))
    return outline_darken(img, 0.8)


# ----------------------------------------------------------------------------- Victoria water lily

def victoria_pad_full():
    size = 48
    img = np.zeros((size, size, 4), dtype=np.uint8)
    pal = [hexc(c) for c in ('#24501C', '#2C5E22', '#366E2A', '#407E32', '#4C8E3A')]
    vein = hexc('#6EA84E')
    rim_out = hexc('#8A2A2E')
    rim_in = hexc('#B04A3C')
    c = 23.5
    g = fbm(501, ((4, 0.5), (8, 0.5)), w=size, h=size)
    for y in range(size):
        for x in range(size):
            d = math.hypot(x - c, y - c)
            if d > 23.4:
                continue
            if d > 21.6:
                img[y, x] = rim_out if d > 22.6 else rim_in
                continue
            a = math.atan2(y - c, x - c)
            radial = abs(((a / (2 * math.pi)) * 24) % 1 - 0.5) < 0.09
            ring = abs(d % 5.5 - 2.75) < 0.4
            t = 0.4 + (g[y, x] - 0.5) * 0.5 + 0.2 * (1 - d / 22)
            col = pal[min(4, max(0, int(t * 5)))]
            if radial and d > 3:
                col = vein
            elif ring and d > 5:
                col = shade(col, 0.88)
            img[y, x] = col
    return img


def victoria_parts():
    full = victoria_pad_full()
    parts = {}
    for part in range(9):
        dx = part % 3
        dz = part // 3
        parts[part] = full[dz * 16:(dz + 1) * 16, dx * 16:(dx + 1) * 16].copy()
    return parts


# ----------------------------------------------------------------------------- icon

def icon():
    """128x128 mod icon: four landscape vignettes."""
    from PIL import Image, ImageDraw
    im = Image.new('RGBA', (128, 128), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    # savanna (top-left): golden plain, blue haze hills, umbrella acacia
    d.rectangle((0, 0, 63, 63), fill=(120, 172, 230))
    d.rectangle((0, 40, 63, 63), fill=(214, 176, 82))
    d.polygon([(0, 41), (14, 35), (30, 38), (46, 33), (63, 37), (63, 41)], fill=(110, 130, 170))
    d.rectangle((0, 41, 63, 63), fill=(214, 176, 82))
    d.line((30, 52, 30, 38), fill=(60, 48, 40), width=2)
    d.line((30, 40, 22, 33), fill=(60, 48, 40), width=1)
    d.line((30, 40, 38, 33), fill=(60, 48, 40), width=1)
    d.ellipse((12, 27, 50, 35), fill=(110, 130, 52))
    d.ellipse((16, 25, 44, 31), fill=(132, 150, 64))
    # dunes (top-right): warm sky, orange dunes with a crisp crest
    d.rectangle((64, 0, 127, 63), fill=(244, 196, 120))
    d.ellipse((104, 30, 116, 42), fill=(255, 228, 140))
    d.polygon([(64, 48), (80, 36), (100, 46), (118, 34), (127, 40), (127, 63), (64, 63)], fill=(214, 140, 80))
    d.polygon([(80, 36), (100, 46), (127, 63), (96, 63)], fill=(176, 106, 58))
    # rainforest (bottom-left): layered greens and an emergent crown
    d.rectangle((0, 64, 63, 127), fill=(150, 196, 214))
    for (y, col) in ((86, (40, 92, 36)), (98, (30, 76, 28)), (110, (22, 60, 22))):
        for x in range(0, 64, 8):
            d.ellipse((x - 4, y - 8, x + 10, y + 6), fill=col)
        d.rectangle((0, y, 63, 127), fill=col)
    d.ellipse((20, 70, 46, 82), fill=(56, 112, 44))
    d.line((33, 80, 33, 100), fill=(170, 165, 150), width=2)
    # steppe (bottom-right): snowy massif over golden grass
    d.rectangle((64, 64, 127, 127), fill=(132, 182, 232))
    d.polygon([(64, 106), (84, 90), (96, 80), (104, 84), (116, 92), (127, 100), (127, 127), (64, 127)], fill=(120, 130, 160))
    d.polygon([(88, 86), (96, 80), (104, 84), (110, 88), (100, 88), (94, 90)], fill=(246, 248, 252))
    d.rectangle((64, 108, 127, 127), fill=(176, 140, 70))
    d.polygon([(64, 110), (90, 104), (127, 112), (127, 127), (64, 127)], fill=(154, 100, 60))
    for x in range(66, 128, 3):
        d.line((x, 127, x + 1, 116 + (x * 7) % 6), fill=(196, 120, 90))
    d.rectangle((0, 0, 127, 127), outline=(40, 30, 20), width=2)
    d.line((64, 0, 64, 127), fill=(40, 30, 20), width=2)
    d.line((0, 64, 127, 64), fill=(40, 30, 20), width=2)
    return im


def main():
    os.makedirs(OUT_BLOCK, exist_ok=True)
    os.makedirs(OUT_ITEM, exist_ok=True)
    produced = {}
    for name, fn in BLOCK.items():
        arr = fn()
        save(arr, os.path.join(OUT_BLOCK, name + '.png'))
        produced['block/' + name] = arr
    for part, arr in victoria_parts().items():
        save(arr, os.path.join(OUT_BLOCK, 'victoria_lily_pad_%d.png' % part))
        produced['block/victoria_lily_pad_%d' % part] = arr
    for name, fn in ITEM.items():
        arr = fn()
        save(arr, os.path.join(OUT_ITEM, name + '.png'))
        produced['item/' + name] = arr
    icon().save(os.path.join(ROOT, 'src/main/resources/assets/earthscapes/icon.png'))
    contact_sheet(produced)
    print('wrote %d textures' % len(produced))


def contact_sheet(produced):
    from PIL import Image, ImageDraw
    scale = 6
    cols = 8
    names = list(produced.keys())
    rows = (len(names) + cols - 1) // cols
    cell_w, cell_h = 16 * scale + 12, 16 * scale + 22
    sheet = Image.new('RGBA', (cols * cell_w, rows * cell_h), (70, 70, 74, 255))
    d = ImageDraw.Draw(sheet)
    for i, n in enumerate(names):
        im = Image.fromarray(produced[n], 'RGBA').resize((16 * scale, 16 * scale), Image.NEAREST)
        x = (i % cols) * cell_w + 6
        y = (i // cols) * cell_h + 18
        bg = Image.new('RGBA', im.size, (150, 190, 230, 255))
        bg.alpha_composite(im)
        sheet.paste(bg, (x, y))
        d.text((x, y - 14), n.split('/')[-1][:18], fill=(255, 255, 255, 255))
    out = os.path.join(ROOT, 'build', 'texture_sheet.png')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    sheet.save(out)


if __name__ == '__main__':
    main()
