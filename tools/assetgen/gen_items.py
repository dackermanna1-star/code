"""Item sprites (16x16, vanilla-like: 1px dark outline, top-left light, few tones)."""
from __future__ import annotations

import math

import numpy as np

import texlib as T


def pal(*hexes):
    return [T.rgb(h) for h in hexes]


def render_idx(idx, palette, alpha=None):
    """idx: int grid, -1 = transparent. palette: list of RGB; alpha: optional per-index alpha."""
    h, w = idx.shape
    img = T.new(w, h)
    for y in range(h):
        for x in range(w):
            i = idx[y, x]
            if i < 0:
                continue
            img[y, x, :3] = palette[i]
            img[y, x, 3] = 255 if alpha is None else alpha.get(i, 255)
    return img


def add_outline(idx, outline_index, diagonal=False):
    h, w = idx.shape
    filled = idx >= 0
    grow = np.zeros_like(filled)
    grow[1:, :] |= filled[:-1, :]
    grow[:-1, :] |= filled[1:, :]
    grow[:, 1:] |= filled[:, :-1]
    grow[:, :-1] |= filled[:, 1:]
    if diagonal:
        grow[1:, 1:] |= filled[:-1, :-1]
        grow[:-1, :-1] |= filled[1:, 1:]
        grow[1:, :-1] |= filled[:-1, 1:]
        grow[:-1, 1:] |= filled[1:, :-1]
    out = idx.copy()
    out[grow & ~filled] = outline_index
    return out


# ---------------------------------------------------------------- finger
def sukuna_finger():
    """45-degree mummified finger: cut end bottom-left, nail at the top-right tip."""
    # 0 outline, 1 deep, 2 shadow, 3 base, 4 light, 5 highlight, 6 crease, 7 nail, 8 nail hi,
    # 9 aura strong, 10 aura faint, 11 cut flesh, 12 cut bone
    P = pal("#160a0d", "#3b1a21", "#57262c", "#713538", "#8b4944", "#a86451", "#2a1116",
            "#2b2433", "#6a5d78", "#a160ff", "#7d3fe0", "#6a1822", "#b9a58a")
    idx = -np.ones((16, 16), int)
    tone_by_s = {-2: 4, -1: 5, 0: 3, 1: 2, 2: 1}
    for y in range(16):
        for x in range(16):
            s = x + y - 15          # perpendicular offset (negative = up-left, the lit side)
            u = x - y               # along the finger: -10 base .. +10 tip
            if abs(s) > 2 or u < -10 or u > 10:
                continue
            if u >= 9 and abs(s) > 1:      # rounded fingertip
                continue
            if u == 10 and s > 0:
                continue
            idx[y, x] = tone_by_s[s]
            if u in (-4, -3) and abs(s) <= 1:     # knuckle crease
                idx[y, x] = 6 if u == -4 else 4
            if u in (3, 4) and abs(s) <= 1:
                idx[y, x] = 6 if u == 3 else 4
            if u >= 6 and s <= -1 and not (u >= 9):
                idx[y, x] = 8 if (u == 7 and s == -2) else 7    # nail on the dorsal side
            if u >= 9 and s == -1:
                idx[y, x] = 7
            if u <= -9:                            # ragged cut end
                idx[y, x] = 12 if s == 0 else 11
    # dried cracks
    for (x, y) in ((5, 11), (8, 8), (10, 6), (3, 13)):
        if idx[y, x] in (2, 3, 4, 5):
            idx[y, x] = 1
    idx = add_outline(idx, 0)
    # cursed aura wisps drifting up-left of the finger
    for x, y, c in ((5, 6, 9), (4, 5, 10), (4, 7, 10), (9, 3, 9), (8, 2, 10), (2, 10, 10),
                    (12, 9, 10), (13, 8, 9)):
        if idx[y, x] < 0:
            idx[y, x] = c
    img = render_idx(idx, P, alpha={9: 165, 10: 95})
    T.save(img, "item/sukuna_finger.png")
    return img


# ------------------------------------------------------------- blindfold
def gojo_blindfold():
    """A rolled-up black cloth band (spiral face) with its loose end trailing off."""
    P = pal("#030305", "#0c0c11", "#22222c", "#353545", "#4c4c64", "#7a84b0")
    idx = -np.ones((16, 16), int)
    cx, cy = 6.5, 6.5
    for y in range(16):
        for x in range(16):
            dx, dy = x + 0.5 - cx, y + 0.5 - cy
            r = math.hypot(dx, dy)
            if r > 5.7:
                continue
            ang = math.atan2(dy, dx)
            rs = r - (ang + math.pi) / (2 * math.pi) * 2.0    # spiral, 2px per turn
            frac = (rs / 2.0) % 1.0
            lit = -(dx + dy) / max(r, 1e-3)                 # >0 toward top-left
            if frac < 0.3:
                tone = 1                                     # gap between wraps
            else:
                tone = 3 if lit > -0.3 else 2
                if lit > 0.55 and frac > 0.55:
                    tone = 4
            if r < 1.0:
                tone = 1
            idx[y, x] = tone
    tail = {
        (10, 10): 3, (11, 10): 4, (11, 11): 3, (12, 11): 4, (12, 12): 3, (13, 12): 3,
        (10, 11): 2, (11, 12): 2, (12, 13): 2, (13, 13): 3, (14, 13): 3, (13, 14): 2, (14, 14): 2,
        (9, 11): 2, (10, 12): 2, (11, 13): 1,
    }
    for (x, y), c in tail.items():
        idx[y, x] = c
    idx[10, 11] = 5
    idx[13, 13] = 4
    idx[2, 5] = 5
    idx[3, 3] = 5
    idx = add_outline(idx, 0)
    img = render_idx(idx, P)
    T.save(img, "item/gojo_blindfold.png")
    return img


# ---------------------------------------------------------------- spawn eggs
EGG_SPANS = {1: (6, 9), 2: (5, 10), 3: (4, 11), 4: (4, 11), 5: (3, 12), 6: (3, 12), 7: (3, 12),
             8: (3, 12), 9: (3, 12), 10: (3, 12), 11: (3, 12), 12: (4, 11), 13: (4, 11), 14: (5, 10)}


def egg_base(ramp, outline):
    """ramp: 4 colours (shadow, base, light, highlight). Returns (img, mask)."""
    mask = np.zeros((16, 16), bool)
    for y, (a, b) in EGG_SPANS.items():
        mask[y, a:b + 1] = True
    L = np.array([-0.42, -0.55, 0.72])
    L /= np.linalg.norm(L)
    idx = -np.ones((16, 16), int)
    for y in range(16):
        for x in range(16):
            if not mask[y, x]:
                continue
            nx = (x + 0.5 - 8.0) / 5.4
            ny = (y + 0.5 - 8.2) / 7.0
            nz = math.sqrt(max(0.0, 1 - nx * nx - ny * ny))
            d = nx * L[0] + ny * L[1] + nz * L[2]
            idx[y, x] = 4 if d > 0.95 else 3 if d > 0.62 else 2 if d > 0.12 else 1
    idx = add_outline(idx, 0)
    pal_ = [T.rgb(outline)] + [T.rgb(c) for c in ramp]
    return render_idx(idx, pal_), mask


def paint(img, mask, pts, col):
    for x, y in pts:
        if mask[y, x]:
            img[y, x, :3] = T.rgb(col)


def gojo_egg():
    img, m = egg_base(["#9ea8c4", "#cdd5e6", "#ebeff7", "#ffffff"], "#262b3d")
    paint(img, m, [(9, 3), (10, 3), (10, 4), (4, 9), (5, 9), (4, 10), (11, 11), (12, 11), (11, 12)], "#161822")
    paint(img, m, [(9, 4), (5, 10), (12, 12)], "#2e3244")
    paint(img, m, [(7, 6), (8, 6), (7, 7), (8, 7), (10, 8), (4, 13), (5, 13), (8, 12), (9, 12)], "#2f8cff")
    paint(img, m, [(8, 7), (5, 13), (9, 12)], "#1a5fd0")
    paint(img, m, [(7, 6), (10, 8)], "#9fe9ff")
    T.save(img, "item/gojo_spawn_egg.png")
    return img


def sukuna_egg():
    img, m = egg_base(["#b5506a", "#dc7c90", "#f0a2b0", "#ffcad2"], "#3e1521")
    blk = "#1c0f14"
    paint(img, m, [(3, 8), (4, 7), (5, 7), (6, 6), (7, 5), (8, 4), (9, 3), (10, 3)], blk)
    paint(img, m, [(4, 13), (5, 12), (6, 12), (7, 11), (8, 10), (9, 9), (10, 8), (11, 7), (12, 7)], blk)
    paint(img, m, [(4, 9), (5, 8), (11, 9), (12, 9)], "#2b1219")
    paint(img, m, [(10, 5), (11, 5), (5, 10), (8, 13), (9, 12), (12, 11), (6, 3)], "#c2142a")
    paint(img, m, [(10, 5), (9, 12)], "#ff3346")
    T.save(img, "item/sukuna_spawn_egg.png")
    return img


def main():
    items = [("sukuna_finger", sukuna_finger()), ("gojo_blindfold", gojo_blindfold()),
             ("gojo_spawn_egg", gojo_egg()), ("sukuna_spawn_egg", sukuna_egg())]
    T.contact_sheet(items, T.SCRATCH / "preview/items.png", k=16, cols=4)
    print("items done")


if __name__ == "__main__":
    main()
