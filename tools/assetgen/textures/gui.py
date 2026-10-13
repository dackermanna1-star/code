"""Gunsmith GUI sprites (ASSET_SPEC 3.8) - textures/gui/sprites/gunsmith/<name>.png.

Tactical dark-steel UI with a Minecraft pixel feel.
panel (32x32) is a nine-slice (border 6): edges are uniform along their tiling direction and the
20x20 centre tiles seamlessly, so it can be repeated at any size.
"""
from __future__ import annotations

import numpy as np

from texlib import Canvas, bevel_fill, grid_sprite, hx, outline, paste, save, save_mcmeta

OL = "#121316"
ICON = dict(base="#c3c8cf", hi="#eceef1", lo="#868d97", hi2="#ffffff", lo2="#6b727c")
ICON_DARK = dict(base="#7b828c", hi="#a6acb4", lo="#555b64")
AMBER = "#f2a431"

P = {
    "O": "#0b0c0e",   # outer outline
    "H": "#8a919a",   # outer bevel highlight (top/left)
    "S": "#25282d",   # outer bevel shade (bottom/right)
    "F": "#4d535b",   # frame steel
    "f": "#555c65",   # frame groove light
    "g": "#3f444b",   # frame groove dark
    "D": "#17191c",   # inner bevel dark (top/left of recess)
    "L": "#5f666f",   # inner bevel light (bottom/right of recess)
    "C": "#30343a",   # centre fill
    "c": "#2c3035",   # centre pattern
    "R": "#a8afb8",   # rivet highlight
    "r": "#262a2f",   # rivet shade
    "A": AMBER,
}


def panel():
    img = np.zeros((32, 32, 4), np.uint8)
    # concentric rings, outside in. ring index = min distance to edge.
    for y in range(32):
        for x in range(32):
            d = min(x, y, 31 - x, 31 - y)
            # ring pixel belongs to the top or left side (lit) unless it is on the bottom/right side
            is_tl = (min(x, y) == d) and not (31 - x == d and x != d) and not (31 - y == d and y != d)
            if d == 0:
                k = "O"
            elif d == 1:
                k = "H" if is_tl else "S"
            elif d in (2, 4):
                k = "F"
            elif d == 3:
                k = "g" if is_tl else "f"
            elif d == 5:
                k = "D" if is_tl else "L"
            else:
                k = "c" if (x + y) % 4 == 0 else "C"
            img[y, x] = hx(P[k])
    # corner rivets (corners are never tiled)
    for (x, y) in ((2, 2), (28, 2), (2, 28), (28, 28)):
        img[y, x] = hx(P["R"])
        img[y, x + 1] = hx("#6f767f")
        img[y + 1, x] = hx("#6f767f")
        img[y + 1, x + 1] = hx(P["r"])
    # amber corner ticks (top-left / bottom-right) for a tactical accent
    # (kept inside the 6px corner cells so they are never repeated by the nine-slice tiling)
    img[1, 3:6] = hx(AMBER)
    img[3:6, 1] = hx(AMBER)
    img[30, 26:29] = hx("#a8661a")
    img[26:29, 30] = hx("#a8661a")
    return img


def slot(kind):
    img = np.zeros((22, 22, 4), np.uint8)
    if kind == "normal":
        outer_tl, outer_br, inner_tl, inner_br, fill, mark = "#121417", "#646b74", "#1b1d21", "#4a5058", "#262a2f", "#3b4047"
    elif kind == "hover":
        outer_tl, outer_br, inner_tl, inner_br, fill, mark = "#cfd5dc", "#cfd5dc", "#20232a", "#6a727c", "#363b42", "#596069"
    else:
        outer_tl, outer_br, inner_tl, inner_br, fill, mark = AMBER, AMBER, "#9a5f14", "#c9862a", "#2f2c26", "#6b5428"
    for y in range(22):
        for x in range(22):
            d = min(x, y, 21 - x, 21 - y)
            tl = (x == d or y == d) and not ((21 - x == d) or (21 - y == d))
            if d == 0:
                c = outer_tl if tl else outer_br
            elif d == 1:
                c = inner_tl if tl else inner_br
            else:
                c = fill
            img[y, x] = hx(c)
    # corner brackets inside the recess
    for (x, y, sx, sy) in ((3, 3, 1, 1), (18, 3, -1, 1), (3, 18, 1, -1), (18, 18, -1, -1)):
        img[y, x] = hx(mark)
        img[y, x + sx] = hx(mark)
        img[y + sy, x] = hx(mark)
    # subtle top inner shadow
    img[2, 2:20] = hx("#1e2125" if kind != "selected" else "#24221d")
    img[2:20, 2] = hx("#1e2125" if kind != "selected" else "#24221d")
    if kind == "selected":
        # notched amber corners for emphasis
        for (x, y) in ((0, 0), (21, 0), (0, 21), (21, 21)):
            img[y, x] = hx("#ffd27a")
    if kind == "hover":
        img[0, 0] = img[0, 21] = img[21, 0] = img[21, 21] = hx("#ffffff")
    return img


def icon(mask, colors=ICON, diagonal=False):
    return outline(bevel_fill(mask, **colors), color=OL, diagonal=diagonal)


def icon_optic():
    """Rifle scope side view: eyepiece, tube, elevation turret, objective bell, ring mounts."""
    mount = Canvas(16, 16).rect(4, 9, 11, 10).mask
    img = icon(mount, ICON_DARK)
    for x in (5, 7, 9):
        img[10, x] = hx("#3b4047")
    cv = Canvas(16, 16)
    cv.rect(3, 6, 12, 8)      # tube
    cv.rect(11, 4, 14, 9)     # objective bell
    cv.rect(1, 5, 3, 9)       # eyepiece
    cv.rect(7, 3, 8, 5)       # turret
    scope = icon(cv.mask)
    scope[5:9, 14] = hx("#57b8ea")
    scope[5, 14] = hx("#bfe8ff")
    scope[6:9, 3] = hx("#8d949e")
    scope[3, 7:9] = hx("#9aa1aa")
    paste(img, scope, 0, 0)
    return img


def icon_muzzle():
    cv = Canvas(16, 16)
    cv.rect(3, 5, 13, 10)     # can
    cv.rect(1, 6, 2, 9)       # thread mount
    cv.rect(14, 6, 14, 9)     # end cap
    img = icon(cv.mask)
    for x in (6, 9, 12):
        img[6:10, x] = hx("#8a919b")
        img[5, x] = hx("#a5abb3")
    img[7:9, 14] = hx("#1b1d21")  # bore
    return img


def icon_barrel():
    cv = Canvas(16, 16)
    cv.rect(1, 6, 5, 10)      # chamber / trunnion
    cv.rect(6, 7, 13, 8)      # barrel
    cv.rect(11, 5, 11, 6)     # front sight post
    cv.rect(10, 6, 12, 6)
    cv.rect(14, 6, 14, 9)     # crown / muzzle device
    img = icon(cv.mask)
    img[8, 2:5] = hx("#8d949e")
    img[7:9, 14] = hx("#4a5058")
    return img


def icon_grip():
    cv = Canvas(16, 16)
    cv.rect(3, 2, 12, 4)      # rail clamp
    cv.rect(6, 5, 9, 12)      # grip body
    cv.rect(5, 13, 10, 14)    # end cap
    m = cv.mask
    for y in (7, 9, 11):
        m[y, 6] = False       # finger grooves
    img = icon(m)
    for x in (4, 6, 8, 10):
        img[2, x] = hx("#878e98")  # rail teeth
    img[13:15, 5:11][m[13:15, 5:11]] = hx("#8a919b")
    return img


def icon_stock():
    """Collapsible carbine stock: angled stock body on the buffer tube."""
    tube = Canvas(16, 16).rect(8, 5, 15, 7).mask
    img = icon(tube, ICON_DARK)
    img[6, 15] = hx("#3b4047")
    cv = Canvas(16, 16)
    cv.poly([(1, 3), (9, 3), (10, 4), (10, 9), (5, 12), (1, 12)])
    m = cv.mask
    m[6:8, 4:7] = False       # lightening cut-out
    body = icon(m)
    body[3:13, 2][m[3:13, 2]] = hx("#3a3e44")   # rubber butt pad
    body[3:13, 1][m[3:13, 1]] = hx("#4a4f57")
    body[10, 6:9][m[10, 6:9]] = hx("#8a919b")   # adjustment lever
    paste(img, body, 0, 0)
    return img


def icon_magazine():
    cv = Canvas(16, 16)
    cv.poly([(5, 2), (10, 2), (11, 6), (13, 12), (13, 14), (8, 14), (7, 10), (5, 5)])
    m = cv.mask
    img = icon(m)
    # ribs
    for (x, y) in ((7, 6), (8, 6), (8, 9), (9, 9), (9, 12), (10, 12)):
        if m[y, x]:
            img[y, x] = hx("#8a919b")
    # baseplate
    for y in (13, 14):
        for x in range(16):
            if m[y, x]:
                img[y, x] = hx("#7b828c" if y == 13 else "#5d636c")
    # top round (brass)
    paste(img, outline(grid_sprite(["pbBd"], {"p": "#fff0b8", "b": "#e2b54f", "B": "#c99a3a", "d": "#9c7425"}),
                       color=OL, pad=1), 5, 0)
    return img


def icon_tactical():
    cv = Canvas(16, 16)
    cv.rect(1, 6, 9, 11)      # laser module
    cv.rect(2, 4, 8, 5)       # rail clamp
    cv.rect(10, 7, 10, 10)    # emitter housing
    img = icon(cv.mask)
    img[8:10, 10] = hx("#ff3b2f")
    img[8, 10] = hx("#ffb2a6")
    img[9, 3:5] = hx("#3a3e44")  # pressure switch
    for x in (3, 5, 7):
        img[4, x] = hx("#878e98")
    # laser beam (no outline, glowing)
    for i, x in enumerate(range(12, 16)):
        img[8, x] = (255, 70 + i * 10, 60 + i * 5, 255 - i * 40)
        img[9, x] = (255, 40, 30, 150 - i * 30)
    img[8, 11] = hx("#ff7a6a")
    img[9, 11] = hx("#ff3b2f")
    return img


def icon_charm():
    cv = Canvas(16, 16)
    cv.ellipse(5, 0, 10, 5)
    ring = cv.mask.copy()
    inner = Canvas(16, 16).ellipse(7, 2, 8, 3).mask
    ring &= ~inner
    img = icon(ring)
    chain = Canvas(16, 16).rect(7, 6, 8, 8).mask
    ci = icon(chain, ICON_DARK)
    paste(img, ci, 0, 0)
    img[7, 7:9] = hx("#3b4047")
    pend = Canvas(16, 16).poly([(7.5, 8.5), (11.5, 12), (7.5, 15.5), (3.5, 12)]).mask
    pi = icon(pend, dict(base="#e8b93f", hi="#ffe38a", lo="#a9771c", hi2="#fff4c4"), diagonal=False)
    pi[11:13, 7:9][pend[11:13, 7:9]] = hx("#4ad8e0")
    pi[11, 7] = hx("#c9fbf8")
    paste(img, pi, 0, 0)
    return img


def icon_skin():
    img = np.zeros((16, 16, 4), np.uint8)
    handle = Canvas(16, 16).line([(2, 13), (7, 8)], width=2).mask
    paste(img, icon(handle, dict(base="#8f5f37", hi="#c48a55", lo="#5d3a1f")), 0, 0)
    fer = Canvas(16, 16).poly([(7, 7), (9, 5), (11, 7), (9, 9)]).mask
    paste(img, icon(fer), 0, 0)
    bristle = Canvas(16, 16).poly([(9, 4), (11, 2), (14, 1), (14, 4), (12, 6)]).mask
    bi = icon(bristle, dict(base="#e04ad0", hi="#ff9cf0", lo="#9a228c"))
    paste(img, bi, 0, 0)
    # paint drip / splash
    img[13, 13] = hx("#e04ad0")
    img[14, 13] = hx("#9a228c")
    img[12, 14] = hx("#4ad8e0")
    img[10, 14] = hx("#ffd84a")
    return img


ARROW_UP = [
    "...K...",
    "..KgK..",
    ".KgGGK.",
    "KgGGGGK",
    "KKgGGKK",
    ".KgGGK.",
    ".KKKKK.",
]
LOCK = [
    "..KKKKK..",
    ".KhKKKhK.",
    ".Kh...hK.",
    "KKKKKKKKK",
    "KyYYYYYdK",
    "KyYYkYYdK",
    "KyYYkYYdK",
    "KyddddddK",
    "KKKKKKKKK",
]


def stat_arrow(up=True):
    pal = {"K": OL, "g": "#a6f59a", "G": "#46c63a"} if up else {"K": OL, "g": "#ff9a8f", "G": "#d93025"}
    img = grid_sprite(ARROW_UP, pal)
    return img if up else img[::-1].copy()


def lock():
    pal = {"K": OL, "h": "#b9bfc7", "y": "#ffe08a", "Y": "#e0b43c", "d": "#a37a1e", "k": "#2b2210"}
    return grid_sprite(LOCK, pal)


def generate():
    out = []
    save("gui/sprites/gunsmith/panel", panel(), (32, 32))
    save_mcmeta("gui/sprites/gunsmith/panel",
                {"gui": {"scaling": {"type": "nine_slice", "width": 32, "height": 32, "border": 6}}})
    out.append("gui/sprites/gunsmith/panel")
    for k, n in (("normal", "slot"), ("hover", "slot_hover"), ("selected", "slot_selected")):
        save(f"gui/sprites/gunsmith/{n}", slot(k), (22, 22))
        out.append(f"gui/sprites/gunsmith/{n}")
    icons = {
        "icon_optic": icon_optic, "icon_muzzle": icon_muzzle, "icon_barrel": icon_barrel,
        "icon_grip": icon_grip, "icon_stock": icon_stock, "icon_magazine": icon_magazine,
        "icon_tactical": icon_tactical, "icon_charm": icon_charm, "icon_skin": icon_skin,
    }
    for n, fn in icons.items():
        save(f"gui/sprites/gunsmith/{n}", fn(), (16, 16))
        out.append(f"gui/sprites/gunsmith/{n}")
    save("gui/sprites/gunsmith/stat_up", stat_arrow(True), (7, 7))
    save("gui/sprites/gunsmith/stat_down", stat_arrow(False), (7, 7))
    save("gui/sprites/gunsmith/lock", lock(), (9, 9))
    out += ["gui/sprites/gunsmith/stat_up", "gui/sprites/gunsmith/stat_down", "gui/sprites/gunsmith/lock"]
    return out
