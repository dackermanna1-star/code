"""Item sprites (ASSET_SPEC 3.2): 16x16 vanilla-style pixel art.

Cartridges are authored as tiny hand-pixelled char grids (light from the top-left: left column
highlight, right column shade), outlined with a tinted dark outline and composited back-to-front
so each cartridge keeps its own silhouette inside the pile.
"""
from __future__ import annotations

import numpy as np

from texlib import Canvas, bevel_fill, grid_sprite, hx, outline, paste, save

# ---------------------------------------------------------------------------
# palettes
# ---------------------------------------------------------------------------
PAL = {
    # brass case
    "b": "#f5d987", "B": "#d7ab4b", "d": "#a87a2a", "r": "#7d5a1f", "p": "#fff0b8",
    # copper jacket
    "c": "#f0a477", "C": "#c96f3f", "e": "#8f4826", "q": "#ffd0b0",
    # lead
    "l": "#c7cad3", "L": "#959aa6", "m": "#686c78", "n": "#e6e8ee",
    # lacquered steel case (7.62x39)
    "s": "#a8a780", "S": "#7d7f58", "t": "#575a3c", "u": "#45472f",
    # hollow point cavity
    "h": "#2a1a12",
    # AP paint
    "k": "#24202c", "v": "#b07ae6", "w": "#6c3fa3",
    # shotgun hulls: red
    "x": "#e5524a", "X": "#b8262a", "z": "#7c1418", "Q": "#94202a",
    # green hull
    "g": "#5cc163", "G": "#2f8a3a", "j": "#1c5a25", "J": "#246c2e",
    # incendiary: black hull, orange crimp, flame
    "o": "#ff9a2a", "O": "#e0661c", "y": "#ffe25a", "f": "#d23a14",
    "K": "#3a3438", "M": "#26222a", "N": "#18151a",
}

# ---------------------------------------------------------------------------
# cartridge grids (interior only; outline is added automatically)
# ---------------------------------------------------------------------------
C9 = [
    ".q.",
    "cCe",
    "cCe",
    "pBd",
    "bBd",
    "bBd",
    "rrr",
]
C9_HP = [
    "chc",
    "cCe",
    "cCe",
    "pBd",
    "bBd",
    "bBd",
    "rrr",
]
C44 = [
    ".nL.",
    "lLLm",
    "lLLm",
    "pbBd",
    "bBBd",
    "bBBd",
    "bBBd",
    "bBBd",
    "rrrr",
]
C44_HP = [
    "nhhm",
    "lLLm",
    "lLLm",
    "pbBd",
    "bBBd",
    "bBBd",
    "bBBd",
    "bBBd",
    "rrrr",
]
C556 = [
    ".q..",
    ".cC.",
    ".cC.",
    ".ce.",
    ".bd.",
    "pbBd",
    "bBBd",
    "bBBd",
    "bBBd",
    "rrrr",
]
C556_AP = [
    ".v..",
    ".kw.",
    ".cC.",
    ".ce.",
    ".bd.",
    "pbBd",
    "bBBd",
    "bBBd",
    "bBBd",
    "rrrr",
]
C762 = [
    "..q..",
    ".cCe.",
    ".cCe.",
    ".sSt.",
    "ssSSt",
    "sSSSt",
    "sSSSt",
    "sSSSt",
    "uuuuu",
]
C762_AP = [
    "..v..",
    ".vkk.",
    ".cCe.",
    ".sSt.",
    "ssSSt",
    "sSSSt",
    "sSSSt",
    "sSSSt",
    "uuuuu",
]
C308 = [
    "..q..",
    ".cCe.",
    ".cCe.",
    ".cCe.",
    ".bBd.",
    "pbBBd",
    "bBBBd",
    "bBBBd",
    "bBBBd",
    "bBBBd",
    "rrrrr",
]
C308_AP = [
    "..v..",
    ".vkk.",
    ".cCe.",
    ".cCe.",
    ".bBd.",
    "pbBBd",
    "bBBBd",
    "bBBBd",
    "bBBBd",
    "bBBBd",
    "rrrrr",
]
C338 = [
    "..q..",
    ".cCe.",
    ".cCe.",
    ".cCe.",
    ".cCe.",
    ".bBd.",
    "pbBBd",
    "bBBBd",
    "bBBBd",
    "bBBBd",
    "bBBBd",
    "bBBBd",
    "rrrrr",
]
C338_AP = [
    "..v..",
    ".vkk.",
    ".kkk.",
    ".cCe.",
    ".cCe.",
    ".bBd.",
    "pbBBd",
    "bBBBd",
    "bBBBd",
    "bBBBd",
    "bBBBd",
    "bBBBd",
    "rrrrr",
]

SHELL_RED = [
    ".QQQ.",
    "xXXXz",
    "xXXXz",
    "xXXXz",
    "xXXXz",
    "xXXXz",
    "pbBBd",
    "bBBBd",
    "rrrrr",
]
SHELL_GREEN = [
    ".JJJ.",
    "gGGGj",
    "gGGGj",
    "gGGGj",
    "gGGGj",
    "gGGGj",
    "pbBBd",
    "bBBBd",
    "rrrrr",
]
SHELL_INC = [
    ".oOO.",
    "oOOOf",
    "KMyMN",
    "KyoyN",
    "KofoN",
    "KMMMN",
    "pbBBd",
    "bBBBd",
    "rrrrr",
]


def cart(rows):
    return outline(grid_sprite(rows, PAL), darken=0.30, pad=1)


def pile(rows, positions):
    img = np.zeros((16, 16, 4), np.uint8)
    spr = cart(rows)
    for x, y in positions:
        paste(img, spr, x, y)
    return img


# outlined sizes: 9mm 5x9, .44 6x11, 5.56 6x12, 7.62 7x11, .308 7x13, .338 7x15, shell 7x11
POS = {
    "9mm": [(2, 1), (9, 2), (5, 6)],
    "44": [(1, 0), (9, 1), (5, 5)],
    "556": [(1, 0), (9, 1), (5, 4)],
    "762": [(1, 0), (8, 1), (4, 5)],
    "308": [(1, 0), (8, 3)],
    "338": [(1, 0), (8, 1)],
    "shell": [(1, 0), (8, 1), (4, 5)],
}


# ---------------------------------------------------------------------------
# misc items
# ---------------------------------------------------------------------------
STEEL = dict(base="#a9afb8", hi="#dfe3e8", lo="#737a85", hi2="#f4f6f8", lo2="#5c626c")
DSTEEL = dict(base="#6f7682", hi="#9aa1ac", lo="#4a5059", hi2="#b9bec6", lo2="#3a3f47")
DIAMOND = dict(base="#4ad8e0", hi="#a9f6f2", lo="#1e9aa8", hi2="#e2fffc", lo2="#137784")


def part(mask, colors, darken=0.30, ol=None):
    return outline(bevel_fill(mask, **colors), color=ol, darken=darken)


def gear_mask(size, cx, cy, r_in, r_out, teeth, hole, phase=0.0):
    ys, xs = np.mgrid[0:size, 0:size]
    dx = xs + 0.5 - cx
    dy = ys + 0.5 - cy
    r = np.hypot(dx, dy)
    th = np.arctan2(dy, dx)
    tooth = np.cos(teeth * th + phase) > -0.05
    m = (r <= r_in) | ((r <= r_out) & tooth)
    m &= r > hole
    return m


SPRING = [
    ".12.12.12.12.",
    ".1.31.31.31.3",
    "1.31.31.31.3.",
    "1.31.31.31.3.",
    "21.21.21.21..",
]
SPRING_PAL = {"1": "#eef1f4", "2": "#b9bfc7", "3": "#727984"}


def gun_parts():
    img = np.zeros((16, 16, 4), np.uint8)
    # roll pin (back, upper right)
    pin = Canvas(16, 16).rect(13, 1, 14, 8).mask
    pin_spr = outline(bevel_fill(pin, base="#d7a548", hi="#f6d988", lo="#9b6f24"), darken=0.3)
    pin_spr[2, 13] = hx("#fff0c0")
    pin_spr[5, 13:15] = hx("#9b6f24")
    paste(img, pin_spr, 0, 0)
    # gear (upper left)
    gm = gear_mask(16, 6.0, 6.0, 3.4, 5.0, 8, 1.5, phase=0.0)
    gear = part(gm, DSTEEL)
    paste(img, gear, 0, 0)
    # coil spring (front, along the bottom)
    paste(img, outline(grid_sprite(SPRING, SPRING_PAL), darken=0.3, pad=1), 1, 9)
    return img


def precision_parts():
    img = np.zeros((16, 16, 4), np.uint8)
    # polished precision gear with diamond hub (back, upper right)
    gm = gear_mask(16, 8.0, 5.5, 3.4, 5.0, 8, 0.0, phase=0.39)
    gear = part(gm, STEEL)
    hub = Canvas(16, 16).ellipse(6, 3, 9, 6).mask
    hubf = bevel_fill(hub, **DIAMOND)
    gear[hub] = hubf[hub]
    gear[4, 7] = hx("#e2fffc")
    paste(img, gear, 0, 0)
    # precision barrel segment (front, bottom): polished cylinder, diamond-blue crown ring + collar
    bar = np.zeros((16, 16, 4), np.uint8)
    rows = ["#f4f6f8", "#d5dae0", "#a9b0b9", "#7b828d"]
    for i, c in enumerate(rows):
        bar[10 + i, 1:13] = hx(c)
    drows = ["#e2fffc", "#7ff0ee", "#33c0cc", "#167f8c"]
    for i, c in enumerate(drows):
        bar[10 + i, 11:13] = hx(c)   # crown ring
        bar[10 + i, 4] = hx(c)       # collar
        bar[10 + i, 1] = hx(rows[min(3, i + 1)])
    bar[11:13, 13] = hx("#167f8c")   # protruding crown lip
    bar[11, 13] = hx("#33c0cc")
    bar = outline(bar, darken=0.3)
    bar[11:13, 14] = hx("#0f5f6a")   # crown face
    paste(img, bar, 0, 0)
    return img


def prismatic_finish_kit():
    img = np.zeros((16, 16, 4), np.uint8)
    can = Canvas(16, 16)
    can.rect(3, 5, 10, 15)       # body
    can.rect(4, 4, 9, 4)         # shoulder
    cm = can.mask
    body = bevel_fill(cm, base="#cfd3d9", hi="#f2f4f6", lo="#8e949d", hi2="#ffffff", lo2="#737983")
    rainbow = ["#ff4b4b", "#ff9b2e", "#ffe14a", "#5ee05a", "#3fd0ff", "#5a6cff", "#c95cff"]
    ys, xs = np.mgrid[0:16, 0:16]
    stripe = (xs + (15 - ys) - 5) // 2
    label = cm & (ys >= 7) & (ys <= 12)
    for i, col in enumerate(rainbow):
        sel = label & (stripe == i + 1)
        base = np.array(hx(col)[:3], float)
        body[sel, :3] = base.astype(np.uint8)
        body[sel & (xs == 10), :3] = (base * 0.70).astype(np.uint8)
        body[sel & (xs == 3), :3] = np.minimum(255, base + 55).astype(np.uint8)
    # sheen glint on the label
    body[8, 4] = hx("#ffffff")
    body[9, 4] = hx("#ffffff")
    # label borders
    body[6, 3:11] = hx("#7d838c")
    body[13, 3:11] = hx("#7d838c")
    body = outline(body, darken=0.28)
    paste(img, body, 0, 0)
    # cap + nozzle
    cap = Canvas(16, 16).rect(5, 2, 8, 3).mask
    capi = outline(bevel_fill(cap, base="#2b2e35", hi="#4a4f59", lo="#1b1d22"), color="#101114")
    capi[2, 8] = hx("#3fd0ff")
    paste(img, capi, 0, 0)
    # spray mist (rainbow sparkles)
    mist = [(11, 2, "#ff9b2e"), (13, 1, "#ffe14a"), (12, 4, "#5ee05a"), (14, 3, "#3fd0ff"),
            (13, 6, "#c95cff"), (15, 5, "#ff4b4b"), (11, 0, "#ffffff"), (15, 1, "#ffffff")]
    for x, y, col in mist:
        img[y, x] = hx(col)
    return img


ITEMS = {
    "ammo/ammo_9mm": lambda: pile(C9, POS["9mm"]),
    "ammo/ammo_9mm_hp": lambda: pile(C9_HP, POS["9mm"]),
    "ammo/ammo_44": lambda: pile(C44, POS["44"]),
    "ammo/ammo_44_hp": lambda: pile(C44_HP, POS["44"]),
    "ammo/ammo_556": lambda: pile(C556, POS["556"]),
    "ammo/ammo_556_ap": lambda: pile(C556_AP, POS["556"]),
    "ammo/ammo_762": lambda: pile(C762, POS["762"]),
    "ammo/ammo_762_ap": lambda: pile(C762_AP, POS["762"]),
    "ammo/ammo_308": lambda: pile(C308, POS["308"]),
    "ammo/ammo_308_ap": lambda: pile(C308_AP, POS["308"]),
    "ammo/ammo_338": lambda: pile(C338, POS["338"]),
    "ammo/ammo_338_ap": lambda: pile(C338_AP, POS["338"]),
    "ammo/shell_buckshot": lambda: pile(SHELL_RED, POS["shell"]),
    "ammo/shell_slug": lambda: pile(SHELL_GREEN, POS["shell"]),
    "ammo/shell_incendiary": lambda: pile(SHELL_INC, POS["shell"]),
    "gun_parts": gun_parts,
    "precision_parts": precision_parts,
    "prismatic_finish_kit": prismatic_finish_kit,
}


def generate():
    out = []
    for name, fn in ITEMS.items():
        rel = f"item/{name}"
        save(rel, fn(), (16, 16))
        out.append(rel)
    return out
