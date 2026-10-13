"""Gunsmith bench block textures (ASSET_SPEC 3.3): 16x16, vanilla block style.

Stained wood planks + iron fittings. Top: work surface framed in iron with tools lying on it;
side: pegboard with hanging tools; front: bench vise above two drawers; bottom: underside
planks with iron braces. Tools are drawn from primitives, bevel-shaded and outlined with a
tinted (not black) outline so they sit naturally on the wood like vanilla block details.
"""
from __future__ import annotations

import numpy as np

from texlib import Canvas, bevel_fill, grid_sprite, hx, outline, paste, rng, save

WOOD = ["#3b2515", "#53351f", "#664227", "#79502f", "#8b5d37", "#9c6a40"]
WOOD_DARK = ["#28180d", "#382213", "#462b19", "#54341f", "#613d25"]
IRON = {"K": "#26282c", "1": "#4a4e55", "2": "#6c7179", "3": "#959ba3", "4": "#c3c8ce", "5": "#e6e9ec"}
PEG = ["#8a6841", "#977349", "#a47e51", "#b08a5a"]

IRON_C = dict(base="#9aa0a8", hi="#d3d7dc", lo="#666b73", hi2="#eceef0")
DIRON_C = dict(base="#70757d", hi="#9aa0a8", lo="#4a4e55")
HANDLE_C = dict(base="#d9b27a", hi="#f0d3a2", lo="#a37a48")
RED_C = dict(base="#b8362b", hi="#e2604a", lo="#7c2019")
BRASS_C = dict(base="#d4aa48", hi="#f2d27e", lo="#946d22")


def c(v):
    return np.array(hx(v), np.uint8)


def planks(g, palette, plank_rows=((0, 4), (4, 8), (8, 12), (12, 16)), seams=(6, 12, 3, 9), flip=0.10):
    img = np.zeros((16, 16, 4), np.uint8)
    n = len(palette)
    for p, (y0, y1) in enumerate(plank_rows):
        tone = int(g.integers(-1, 1)) if p % 2 else 0
        for y in range(y0, y1):
            for x in range(16):
                if y == y1 - 1:
                    v = 1
                elif y == y0:
                    v = 4 + tone
                else:
                    v = 3 + tone
                r = g.random()
                if r < flip:
                    v += 1
                elif r < flip * 2.2:
                    v -= 1
                img[y, x] = c(palette[int(np.clip(v, 0, n - 1))])
        gy = y0 + 1 + int(g.integers(0, max(1, y1 - y0 - 2)))
        gx = int(g.integers(0, 16))
        for k in range(int(g.integers(3, 6))):
            img[gy, (gx + k) % 16] = c(palette[2 + tone])
        sx = seams[p % len(seams)]
        for y in range(y0, y1 - 1):
            img[y, sx] = c(palette[0])
        if y1 - y0 > 2:
            img[y0 + 1, (sx + 1) % 16] = c(palette[2])
    return img


def obj(mask, colors, darken=0.42):
    return outline(bevel_fill(mask, **colors), darken=darken)


def top():
    g = rng(501)
    img = planks(g, WOOD, plank_rows=((1, 4), (4, 8), (8, 12), (12, 15)))
    # iron frame
    img[0, :] = c(IRON["4"])
    img[:, 0] = c(IRON["4"])
    img[15, :] = c(IRON["2"])
    img[:, 15] = c(IRON["2"])
    img[0, 15] = c(IRON["3"])
    img[15, 0] = c(IRON["3"])
    for (x, y) in ((0, 0), (13, 0), (0, 13), (13, 13)):
        paste(img, grid_sprite(["443", "453", "332"], IRON), x, y)
    # hammer (upper left): head + wooden handle
    m = Canvas(16, 16).rect(3, 3, 4, 7).mask
    handle = Canvas(16, 16).rect(5, 5, 11, 5).mask
    paste(img, obj(handle, HANDLE_C), 0, 0)
    paste(img, obj(m, IRON_C), 0, 0)
    # screwdriver (bottom): red handle + steel shaft
    shaft = Canvas(16, 16).rect(7, 11, 12, 11).mask
    paste(img, obj(shaft, IRON_C), 0, 0)
    hm = Canvas(16, 16).rect(3, 10, 6, 12).mask
    hd = obj(hm, RED_C)
    hd[11, 4] = c("#7c2019")
    paste(img, hd, 0, 0)
    # loose cartridges / screws
    for (x, y) in ((11, 8), (13, 7)):
        b = Canvas(16, 16).rect(x, y, x, y + 1).mask
        paste(img, obj(b, BRASS_C, darken=0.5), 0, 0)
    return img


def edge_rows(img, g):
    """Bench-top edge seen from the side: iron trim, two plank-edge rows, shadow row."""
    for x in range(16):
        img[0, x] = c(IRON["4"] if x % 5 == 2 else IRON["3"])
        img[1, x] = c(WOOD[4] if g.random() > 0.15 else WOOD[5])
        img[2, x] = c(WOOD[3] if g.random() > 0.2 else WOOD[2])
        img[3, x] = c(WOOD[0])
    img[0, 0] = c(IRON["4"])
    img[0, 15] = c(IRON["2"])


def legs(img, g, y0=4):
    for y in range(y0, 16):
        for x, v in ((0, 4), (1, 3), (14, 3), (15, 1)):
            vv = v - (1 if g.random() < 0.15 else 0)
            img[y, x] = c(WOOD[vv])
    img[15, 0:2] = c(IRON["2"])
    img[15, 14:16] = c(IRON["1"])


def side():
    g = rng(502)
    img = np.zeros((16, 16, 4), np.uint8)
    edge_rows(img, g)
    legs(img, g)
    for y in range(4, 14):
        for x in range(2, 14):
            v = 2 + (1 if g.random() < 0.15 else 0) - (1 if g.random() < 0.15 else 0)
            img[y, x] = c(PEG[v])
    img[4, 2:14] = c(PEG[0])
    for y in (5, 8, 11):
        for x in (3, 6, 9, 12):
            img[y, x] = c("#3d2a18")
    for x in range(2, 14):
        img[14, x] = c(WOOD[4] if g.random() > 0.2 else WOOD[3])
        img[15, x] = c(WOOD[1])
    # hanging hammer
    head = Canvas(16, 16).rect(3, 6, 5, 7).mask
    hnd = Canvas(16, 16).rect(4, 8, 4, 12).mask
    paste(img, obj(hnd, HANDLE_C), 0, 0)
    paste(img, obj(head, IRON_C), 0, 0)
    # hanging wrench (open jaws at both ends)
    w = Canvas(16, 16)
    w.rect(8, 6, 8, 11)
    w.rect(7, 5, 9, 5).rect(7, 12, 9, 12)
    wm = w.mask
    wm[4, 7] = wm[4, 9] = True
    wm[13, 7] = wm[13, 9] = True
    paste(img, obj(wm, IRON_C), 0, 0)
    # hanging screwdriver
    sd = Canvas(16, 16).rect(11, 6, 12, 8).mask
    sh = Canvas(16, 16).rect(12, 9, 12, 12).mask
    paste(img, obj(sh, IRON_C), 0, 0)
    sdi = obj(sd, RED_C)
    paste(img, sdi, 0, 0)
    # pegs above the tools
    for x in (4, 8, 12):
        img[5, x] = c(IRON["3"])
    return img


def front():
    g = rng(503)
    img = np.zeros((16, 16, 4), np.uint8)
    edge_rows(img, g)
    legs(img, g)
    for y in range(4, 16):
        for x in range(2, 14):
            img[y, x] = c(WOOD[1])
    img[4, 2:14] = c(WOOD[0])
    for (y0, y1) in ((8, 11), (12, 15)):
        for y in range(y0, y1):
            for x in range(2, 14):
                v = 3 + (1 if g.random() < 0.12 else 0) - (1 if g.random() < 0.12 else 0)
                if y == y0:
                    v = 4
                if y == y1 - 1:
                    v = 2
                img[y, x] = c(WOOD[v])
        img[y0:y1, 2] = c(WOOD[4])
        img[y0:y1, 13] = c(WOOD[2])
        img[y0, 2] = c(WOOD[5])
        hy = y0 + 1
        paste(img, grid_sprite(["1441", "1221"], IRON), 6, hy)
        img[hy, 6] = c(IRON["2"])
        img[hy, 9] = c(IRON["2"])
    # bench vise on the front edge
    vise = Canvas(16, 16)
    vise.rect(4, 0, 11, 3)   # jaws block
    vm = vise.mask
    vf = bevel_fill(vm, **IRON_C)
    vf[0:4, 7:9] = c(IRON["1"])       # jaw gap
    vf[0, 7:9] = c(IRON["K"])
    vf[1, 4:7] = c(IRON["3"])
    vf[1, 9:11] = c(IRON["3"])
    vf[2, 4:11][vm[2, 4:11]] = c(IRON["2"])
    paste(img, outline(vf, darken=0.42), 0, 0)
    screw = Canvas(16, 16).rect(7, 5, 8, 6).mask
    paste(img, obj(screw, DIRON_C), 0, 0)
    bar = Canvas(16, 16).rect(4, 6, 11, 6).mask
    bi = obj(bar, IRON_C)
    paste(img, bi, 0, 0)
    for x in (3, 12):
        img[6, x] = c(IRON["4"])
        img[5, x] = c(IRON["2"])
        img[7, x] = c(IRON["1"])
    return img


def bottom():
    g = rng(504)
    img = planks(g, WOOD_DARK, seams=(4, 10, 13, 7))
    for y, col in ((2, "2"), (3, "1"), (11, "2"), (12, "1")):
        img[y, :] = c(IRON[col])
    for x in (1, 7, 14):
        img[2, x] = c(IRON["4"])
        img[11, x] = c(IRON["4"])
    return img


def generate():
    out = []
    for name, fn in (("top", top), ("side", side), ("front", front), ("bottom", bottom)):
        rel = f"block/gunsmith_bench_{name}"
        save(rel, fn(), (16, 16))
        out.append(rel)
    return out
