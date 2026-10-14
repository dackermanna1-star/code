#!/usr/bin/env python3
"""Reproducible generator for Abyssal Descent block / particle / GUI / effect assets.

Writes every texture (PNG + .mcmeta), block model, blockstate, item model definition and
particle description used by the mod's blocks into
``src/main/resources/assets/abyssal_descent/``.  All art is drawn procedurally or from
hand-authored pixel maps in this file; no vanilla texture image is read or copied.  Vanilla
textures are only *referenced by id* from block models (e.g. ``minecraft:block/stone_bricks``).

Usage::

    python3 tools/assets/block_assets.py                 # write assets
    python3 tools/assets/block_assets.py --sheet out.png # also render a labelled contact sheet

Conventions
-----------
* Images are numpy arrays shaped (h, w, 4), uint8 RGBA, indexed ``a[y, x]``.
* Block models face NORTH; blockstates rotate them with ``y`` (east=90, south=180, west=270).
* Glowing details live in separate overlay textures applied to model elements with
  ``light_emission`` so they glow in the dark.  Overlays are fully transparent except for
  glowing pixels (alpha is always 0 or 255 for cutout use).
* NOTE for code: every block that uses a transparent overlay must be rendered CUTOUT
  (runic_seal TRANSLUCENT); see ``RENDER_LAYERS`` below.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import random
import sys

import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
OUT = os.path.join(ROOT, "src", "main", "resources", "assets", "abyssal_descent")
MOD = "abyssal_descent"

# Chunk layer each block needs (informational; the Java client code must register these).
# Any block whose model uses a transparent overlay texture must NOT be in the solid layer,
# otherwise the overlay's transparent pixels render as opaque black.
RENDER_LAYERS = {
    "abyssal_gate": "cutout", "descent_rift": "cutout or translucent", "waystone": "cutout",
    "runic_seal": "translucent", "spike_trap": "cutout", "dart_trap": "cutout",
    "crumbling_stone_bricks": "cutout", "reliquary": "cutout", "burial_urn": "solid (cutout harmless)",
    "altar_of_trials": "cutout", "cursed_idol": "cutout", "soul_brazier": "cutout",
    "rune_stone": "cutout",
}

WRITTEN: list[str] = []          # every file written (relative to OUT)
TEXTURES: dict[str, list] = {}   # texture path -> list of frames (for the contact sheet)
ANIMATED: dict[str, dict] = {}   # texture path -> animation meta


# =============================================================================================
# Colour + image utilities
# =============================================================================================

def C(h: str, a: int = 255) -> tuple:
    h = h.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


def ramp(*hexes):
    return [C(h) for h in hexes]


T = (0, 0, 0, 0)  # transparent

SOUL = ramp("#0d2633", "#1b4f6b", "#2f8fb8", "#56d8ff", "#b8f4ff", "#ffffff")
VIO = ramp("#0b0614", "#24123a", "#4f2770", "#8a4fc4", "#c99bf5", "#f0dcff")
BLOOD = ramp("#1f050a", "#3a0a12", "#6e1420", "#a8182f", "#ff4a5e", "#ffb0b8")
DRIED = ramp("#150908", "#22100c", "#331812", "#442218", "#57301f")
GOLD = ramp("#3d2a08", "#5a3f0e", "#8a6418", "#c9962a", "#f2c94c", "#fff1a8")
DARK = ramp("#111016", "#18171e", "#211f28", "#2a2832", "#35333e", "#42404c", "#53515e")
PALE = ramp("#2b2f38", "#3a3f4a", "#4b515e", "#5e6574", "#737b8b", "#8b93a3", "#a6adbb")
BLACKSTONE = ramp("#100d12", "#18141b", "#211c25", "#2b2530", "#36303c", "#433b4a", "#524859")
IRON = ramp("#141418", "#202127", "#2c2e35", "#3c3f48", "#50545f", "#686d79", "#878c98", "#a9aeb8")
RUST = ramp("#2e1910", "#4a2817", "#68381f", "#86492a", "#a35f36")
COFFER = ramp("#1b1719", "#262123", "#322c2e", "#3f383a", "#4d4547", "#5d5457", "#6f6568")
CLAY = ramp("#2e1a12", "#45281a", "#5e3622", "#77452b", "#8f5735", "#a86b42", "#c08453")
BONE = ramp("#6f6552", "#9a8f75", "#c4b898", "#e2d8bd", "#f4eedc")
IDOL = ramp("#141517", "#1c1e21", "#25282b", "#303437", "#3c4143", "#4a5052", "#5b6163")
MOSS = ramp("#1d1630", "#2e1d4a", "#4a2b70", "#6b3d9e")
OUTLINE = C("#0a090d")


def img(w: int, h: int | None = None, fill=T) -> np.ndarray:
    h = w if h is None else h
    a = np.zeros((h, w, 4), np.uint8)
    a[:, :] = fill
    return a


def px(a, x, y, c):
    if 0 <= y < a.shape[0] and 0 <= x < a.shape[1]:
        a[y, x] = c


def rect(a, x0, y0, x1, y1, c):
    """Filled rectangle, inclusive corners."""
    a[max(0, y0):y1 + 1, max(0, x0):x1 + 1] = c


def hline(a, x0, x1, y, c):
    rect(a, min(x0, x1), y, max(x0, x1), y, c)


def vline(a, x, y0, y1, c):
    rect(a, x, min(y0, y1), x, max(y0, y1), c)


def line(a, x0, y0, x1, y1, c):
    dx, dy = abs(x1 - x0), -abs(y1 - y0)
    sx, sy = (1 if x0 < x1 else -1), (1 if y0 < y1 else -1)
    err = dx + dy
    while True:
        px(a, x0, y0, c)
        if x0 == x1 and y0 == y1:
            break
        e2 = 2 * err
        if e2 >= dy:
            err += dy
            x0 += sx
        if e2 <= dx:
            err += dx
            y0 += sy


def outline_rect(a, x0, y0, x1, y1, light, dark):
    """Bevel: top/left edges light, bottom/right edges dark."""
    hline(a, x0, x1, y0, light)
    vline(a, x0, y0, y1, light)
    hline(a, x0, x1, y1, dark)
    vline(a, x1, y0, y1, dark)


def from_map(rows, pal, a=None, ox=0, oy=0):
    """Paint a char map. Chars missing from ``pal`` (and '.'/' ') are skipped."""
    if a is None:
        a = img(max(len(r) for r in rows), len(rows))
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch in pal:
                px(a, ox + x, oy + y, pal[ch])
    return a


def blit(dst, src, ox=0, oy=0):
    """Paste ``src`` over ``dst`` where src alpha > 0 (no blending: pixel art)."""
    h, w = src.shape[:2]
    for y in range(h):
        for x in range(w):
            if src[y, x, 3] > 0:
                px(dst, ox + x, oy + y, src[y, x])


def grain(a, x0, y0, x1, y1, rmp, base, seed, density=0.09, light=1, dark=1, horizontal=True):
    """Vanilla-like stone grain: short horizontal dashes of neighbouring ramp tones.

    Not random static: dashes are 1-3px long and sparse, like hand-placed pixel art.
    """
    rng = random.Random(seed)
    area = (x1 - x0 + 1) * (y1 - y0 + 1)
    n = max(1, int(area * density))
    for i in range(n):
        x = rng.randint(x0, x1)
        y = rng.randint(y0, y1)
        ln = rng.choice((1, 2, 2, 3))
        up = (i % 2 == 0)
        c = rmp[min(len(rmp) - 1, base + light)] if up else rmp[max(0, base - dark)]
        if horizontal:
            hline(a, x, min(x1, x + ln - 1), y, c)
        else:
            vline(a, x, y, min(y1, y + ln - 1), c)


def lerp_c(c1, c2, t):
    return tuple(int(round(c1[i] + (c2[i] - c1[i]) * t)) for i in range(4))


def ramp_at(rmp, v):
    """Pick a ramp entry for v in [0,1] (quantised, no blending)."""
    i = int(round(max(0.0, min(1.0, v)) * (len(rmp) - 1)))
    return rmp[i]


def level_overlay(levels, rmp, offset=0):
    """levels: 2D list/array of ints (-1 = transparent) -> image with ramp[level+offset]."""
    lv = np.array(levels)
    h, w = lv.shape
    a = img(w, h)
    for y in range(h):
        for x in range(w):
            if lv[y, x] >= 0:
                a[y, x] = rmp[max(0, min(len(rmp) - 1, int(lv[y, x]) + offset))]
    return a


def map_levels(rows, legend):
    """Char map -> level grid (-1 for unmapped)."""
    out = [[-1] * len(rows[0]) for _ in rows]
    for y, r in enumerate(rows):
        for x, ch in enumerate(r):
            out[y][x] = legend.get(ch, -1)
    return out


def smoothstep(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


# =============================================================================================
# File output
# =============================================================================================

def _write_bytes_path(rel):
    path = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    WRITTEN.append(rel)
    return path


def save_png(rel, frames, frametime=None, interpolate=False):
    """Save a texture (single frame or list of frames stacked vertically)."""
    if isinstance(frames, np.ndarray):
        frames = [frames]
    for f in frames:
        assert f.dtype == np.uint8 and f.shape[2] == 4, rel
    stacked = np.concatenate(frames, axis=0) if len(frames) > 1 else frames[0]
    Image.fromarray(stacked, "RGBA").save(_write_bytes_path(rel), optimize=True)
    TEXTURES[rel] = frames
    if len(frames) > 1:
        meta = {"animation": {"frametime": int(frametime or 2)}}
        if interpolate:
            meta["animation"]["interpolate"] = True
        save_json(rel + ".mcmeta", meta)
        ANIMATED[rel] = meta


def save_json(rel, obj):
    with open(_write_bytes_path(rel), "w", encoding="utf-8") as fh:
        json.dump(obj, fh, indent=2)
        fh.write("\n")


def block_tex(name, frames, **kw):
    save_png(f"textures/block/{name}.png", frames, **kw)
    return f"{MOD}:block/{name}"


# =============================================================================================
# Block model helpers
# =============================================================================================

DIRS = ("down", "up", "north", "south", "west", "east")


def default_uv(d, f, t):
    x0, y0, z0 = f
    x1, y1, z1 = t
    return {
        "down": [x0, 16 - z1, x1, 16 - z0],
        "up": [x0, z0, x1, z1],
        "north": [16 - x1, 16 - y1, 16 - x0, 16 - y0],
        "south": [x0, 16 - y1, x1, 16 - y0],
        "west": [z0, 16 - y1, z1, 16 - y0],
        "east": [16 - z1, 16 - y1, 16 - z0, 16 - y0],
    }[d]


def _r(v):
    v = round(float(v), 4)
    return int(v) if v == int(v) else v


def el(f, t, faces, uvbox=None, rot=None, emit=0, shade=True, cull=False):
    """Build a model element.

    faces: {dir: "texkey" | {"tex": key, "uv": [...], "cull": dir}}
    uvbox: (from, to) box used for automatic UVs (defaults to the element box) - lets
           slightly inflated overlay elements keep exact 0..16 UVs.
    cull:  add cullface automatically for faces lying on the block boundary.
    """
    ub_f, ub_t = uvbox if uvbox else (f, t)
    jf = {}
    for d, spec in faces.items():
        if isinstance(spec, str):
            spec = {"tex": spec}
        uv = spec.get("uv") or default_uv(d, ub_f, ub_t)
        face = {"uv": [_r(v) for v in uv], "texture": "#" + spec["tex"]}
        cf = spec.get("cull")
        if cf is None and cull:
            axis_val = {"down": ub_f[1], "up": ub_t[1], "north": ub_f[2], "south": ub_t[2],
                        "west": ub_f[0], "east": ub_t[0]}[d]
            if axis_val in (0, 16):
                cf = d
        if cf:
            face["cullface"] = cf
        jf[d] = face
    e = {"from": [_r(v) for v in f], "to": [_r(v) for v in t]}
    if rot:
        e["rotation"] = rot
    if not shade:
        e["shade"] = False
    if emit:
        e["light_emission"] = emit
    e["faces"] = jf
    return e


def rot_y45(origin=(8, 8, 8), rescale=False, angle=45):
    r = {"origin": [_r(v) for v in origin], "axis": "y", "angle": angle}
    if rescale:
        r["rescale"] = True
    return r


SIDES = ("north", "south", "west", "east")


def sides(tex, **extra):
    d = {s: tex for s in SIDES}
    d.update(extra)
    return d


def overlay_planes(box_f, box_t, tex_by_side, emit=15, eps=0.01, cull=False):
    """Zero-thickness planes hovering ``eps`` in front of each requested side of a box."""
    x0, y0, z0 = box_f
    x1, y1, z1 = box_t
    out = []
    for s, tex in tex_by_side.items():
        if s == "north":
            f, t = (x0, y0, z0 - eps), (x1, y1, z0 - eps)
        elif s == "south":
            f, t = (x0, y0, z1 + eps), (x1, y1, z1 + eps)
        elif s == "west":
            f, t = (x0 - eps, y0, z0), (x0 - eps, y1, z1)
        elif s == "east":
            f, t = (x1 + eps, y0, z0), (x1 + eps, y1, z1)
        elif s == "up":
            f, t = (x0, y1 + eps, z0), (x1, y1 + eps, z1)
        else:
            f, t = (x0, y0 - eps, z0), (x1, y0 - eps, z1)
        face = {"tex": tex}
        if cull:
            axis_val = {"down": y0, "up": y1, "north": z0, "south": z1, "west": x0, "east": x1}[s]
            if axis_val in (0, 16):
                face["cull"] = s
        out.append(el(f, t, {s: face}, uvbox=(box_f, box_t), emit=emit, shade=False if emit else True))
    return out


def model(name, textures, elements, ao=True, parent="minecraft:block/block", extra=None):
    m = {}
    if parent:
        m["parent"] = parent
    if not ao:
        m["ambientocclusion"] = False
    m["textures"] = textures
    m["elements"] = elements
    if extra:
        m.update(extra)
    save_json(f"models/block/{name}.json", m)
    return f"{MOD}:block/{name}"


def blockstate(name, variants):
    save_json(f"blockstates/{name}.json", {"variants": variants})


def item_def(name, model_id):
    save_json(f"items/{name}.json", {"model": {"type": "minecraft:model", "model": model_id}})


FACING_Y = {"north": 0, "east": 90, "south": 180, "west": 270}


def facing_variant(model_id, facing):
    v = {"model": model_id}
    if FACING_Y[facing]:
        v["y"] = FACING_Y[facing]
    return v


# =============================================================================================
# Rune glyph library (hand-authored, 3x5 and 3x3)
# =============================================================================================

RUNES5 = [
    ["#.#", "##.", "#..", "#..", "#.."],
    ["#.#", "###", ".#.", ".#.", ".#."],
    [".#.", "#.#", ".#.", ".#.", ".#."],
    ["..#", ".#.", "#.#", ".#.", "#.."],
    ["#.#", ".#.", "#.#", ".#.", "#.#"],
    [".#.", ".##", "##.", ".#.", ".#."],
    ["..#", ".#.", "#..", ".#.", "..#"],
    [".#.", "#.#", ".#.", "#.#", "#.#"],
]
RUNES3 = [
    ["#.#", ".#.", "#.#"],
    [".#.", "###", ".#."],
    ["##.", "#.#", ".##"],
    ["#..", "##.", "#.#"],
    [".##", ".#.", "##."],
    ["#.#", "#.#", ".#."],
]


def stamp(levels, glyph, ox, oy, lv):
    for y, r in enumerate(glyph):
        for x, ch in enumerate(r):
            if ch == "#":
                yy, xx = oy + y, ox + x
                if 0 <= yy < len(levels) and 0 <= xx < len(levels[0]):
                    levels[yy][xx] = lv


def empty_levels(w=16, h=16):
    return [[-1] * w for _ in range(h)]


def pulse_frames(levels, rmp, offsets):
    return [level_overlay(levels, rmp, o) for o in offsets]


# =============================================================================================
# 1. Abyssal gate
# =============================================================================================

def swirl_frame(t, size=16, cx=8.0, cy=8.0, arms=3, twist=0.85, inner=1.6, outer=7.0, rmp=VIO,
                sparkle=True, spin=1.0):
    """Quantised spiral vortex. t in [0,1) loops seamlessly."""
    a = img(size)
    for y in range(size):
        for x in range(size):
            dx, dy = x + 0.5 - cx, y + 0.5 - cy
            r = math.hypot(dx, dy)
            th = math.atan2(dy, dx)
            ph = arms * th + twist * r * 1.0 - spin * 2 * math.pi * t
            arm = 0.5 + 0.5 * math.cos(ph)
            arm = arm ** 1.6
            depth = smoothstep(inner * 0.4, inner * 2.2, r)  # dark centre
            rim = 1.0 - smoothstep(outer - 1.5, outer + 0.5, r)
            v = 0.10 + 0.78 * arm * depth * (0.55 + 0.45 * rim) + 0.10 * depth
            if r < inner:
                v = 0.0
            a[y, x] = ramp_at(rmp, v)
    if sparkle:
        # Motes spiralling into the centre along the arms.
        for k in range(3):
            tt = (t + k / 3.0) % 1.0
            r = outer - (outer - inner) * tt
            th = (2 * math.pi * k / 3.0) + spin * 2 * math.pi * t / arms * arms - twist * r / arms + 1.2
            th = (spin * 2 * math.pi * t + 2 * math.pi * k / 3.0 - twist * r) / arms * 1.0 + 2 * math.pi * k / 3.0
            sx = int(math.floor(cx + r * math.cos(th)))
            sy = int(math.floor(cy + r * math.sin(th)))
            px(a, sx, sy, rmp[-1])
    return a


def gen_abyssal_gate():
    D, G = DARK, GOLD
    # ---- side elevation: slab rows 1-3 (x1..14), body rows 4-11 (x2..13), base rows 12-15
    s = img(16, fill=D[2])
    grain(s, 0, 0, 15, 15, D, 2, seed=101)
    # top slab
    hline(s, 1, 14, 1, G[4]); hline(s, 1, 3, 1, G[5]); hline(s, 12, 14, 1, G[3])
    hline(s, 1, 14, 2, D[3]); grain(s, 2, 2, 13, 2, D, 3, seed=102, density=0.4)
    px(s, 1, 2, D[5]); px(s, 14, 2, D[1])
    for x, c in ((3, G[4]), (12, G[3]), (7, G[4]), (8, G[3])):
        px(s, x, 2, c)
    hline(s, 1, 14, 3, G[2]); px(s, 1, 3, G[3]); px(s, 14, 3, G[1])
    # body
    rect(s, 2, 4, 13, 11, D[2]); grain(s, 3, 5, 12, 11, D, 2, seed=103, density=0.12)
    hline(s, 2, 13, 4, D[0])
    vline(s, 2, 5, 11, D[4]); vline(s, 3, 5, 11, D[3]); vline(s, 12, 5, 11, D[1]); vline(s, 13, 5, 11, D[1])
    arch = [
        "..oooo..",
        ".o1111p.",
        "o111111p",
        "o111111p",
        "o111111p",
        "o111111p",
        "o111111p",
    ]
    from_map(arch, {"o": D[5], "p": D[3], "1": D[0]}, s, 4, 5)
    px(s, 7, 5, G[4]); px(s, 8, 5, G[3])  # keystone
    for y in (6, 8, 10):  # carved rune notches on the pillars beside the arch
        px(s, 3, y, D[0]); px(s, 12, y, D[0])
    # base
    rect(s, 0, 12, 15, 15, D[3]); grain(s, 0, 13, 15, 15, D, 3, seed=104, density=0.2)
    hline(s, 0, 15, 12, G[3]); hline(s, 0, 2, 12, G[4]); hline(s, 13, 15, 12, G[2])
    hline(s, 0, 15, 13, D[4]); hline(s, 0, 15, 15, D[1])
    for x in (1, 5, 10, 14):
        px(s, x, 14, D[1])
    px(s, 0, 13, D[5]); px(s, 15, 14, D[1])
    side = block_tex("abyssal_gate_side", s)

    # ---- top view (rim, base ledge); centre is the portal well
    tp = img(16, fill=D[2])
    grain(tp, 0, 0, 15, 15, D, 2, seed=105)
    outline_rect(tp, 0, 0, 15, 15, D[5], D[1])
    outline_rect(tp, 1, 1, 14, 14, D[4], D[2])
    outline_rect(tp, 2, 2, 13, 13, G[4], G[2])
    for (x, y) in ((2, 2), (13, 2), (2, 13), (13, 13)):
        px(tp, x, y, G[5])
    rect(tp, 3, 3, 12, 12, D[0])
    hline(tp, 3, 12, 3, D[1])
    for x in (5, 10):
        px(tp, x, 0, G[3]); px(tp, x, 15, G[2]); px(tp, 0, x, G[3]); px(tp, 15, x, G[2])
    top = block_tex("abyssal_gate_top", tp)

    # ---- runes overlay: glowing arch interior + pillar notches (slow pulse)
    lv = empty_levels()
    interior = [
        "..##..",
        ".####.",
        ".####.",
        "######",
        "######",
        "######",
    ]
    for y, r in enumerate(interior):
        for x, ch in enumerate(r):
            if ch == "#":
                lv[6 + y][5 + x] = 1
    # inner light: brighter core rising from the threshold
    for (x, y, l) in ((7, 7, 2), (8, 7, 2), (7, 8, 2), (8, 8, 3), (7, 9, 3), (8, 9, 3), (6, 10, 2),
                      (7, 10, 3), (8, 10, 4), (9, 10, 2), (6, 11, 2), (7, 11, 3), (8, 11, 3), (9, 11, 2),
                      (6, 8, 2), (9, 9, 2)):
        lv[y][x] = l
    for y in (6, 8, 10):
        lv[y][3] = 2
        lv[y][12] = 2
    runes = pulse_frames(lv, VIO[1:], [0, 0, 1, 1, 1, 0, 0, -1])
    block_tex("abyssal_gate_runes", runes, frametime=6, interpolate=True)

    # ---- portal (top of the altar), 16 frames
    portal = [swirl_frame(i / 16.0, cx=8, cy=8, arms=3, twist=0.9, inner=1.3, outer=5.2) for i in range(16)]
    block_tex("abyssal_gate_portal", portal, frametime=3)

    T_ = {"particle": side, "side": side, "top": top, "bottom": "minecraft:block/polished_deepslate",
          "runes": f"{MOD}:block/abyssal_gate_runes", "portal": f"{MOD}:block/abyssal_gate_portal"}
    els = [
        el((0, 0, 0), (16, 4, 16), {**sides("side"), "up": "top", "down": "bottom"}, cull=True),
        el((2, 4, 2), (14, 12, 14), sides("side")),
        el((1, 12, 1), (15, 14, 15), {**sides("side"), "down": "top"}),
        # rim around the portal well
        el((1, 14, 1), (15, 15, 3), {"north": "side", "west": "side", "east": "side", "up": "top",
                                     "south": {"tex": "top", "uv": [3, 3, 13, 4]}}),
        el((1, 14, 13), (15, 15, 15), {"south": "side", "west": "side", "east": "side", "up": "top",
                                       "north": {"tex": "top", "uv": [3, 3, 13, 4]}}),
        el((1, 14, 3), (3, 15, 13), {"west": "side", "up": "top", "east": {"tex": "top", "uv": [3, 3, 13, 4]}}),
        el((13, 14, 3), (15, 15, 13), {"east": "side", "up": "top", "west": {"tex": "top", "uv": [3, 3, 13, 4]}}),
        el((3, 14, 3), (13, 14, 13), {"up": "portal"}, emit=15, shade=False),
    ]
    els += overlay_planes((2, 4, 2), (14, 12, 14), {s_: "runes" for s_ in SIDES})
    mid = model("abyssal_gate", T_, els)
    blockstate("abyssal_gate", {"": {"model": mid}})
    item_def("abyssal_gate", mid)


# =============================================================================================
# 2. Descent rift
# =============================================================================================

def rift_frame(t, arms=3):
    """Seamlessly tiling 16x16 vortex: a central whirl fading into periodic dark currents.

    Everything outside r~7.8 is built only from period-16 functions, so 3x3 tiles join
    without seams; the diagonal currents run continuously across tile borders.
    """
    a = img(16)
    k = 2 * math.pi / 16.0
    T = 2 * math.pi * t
    for y in range(16):
        for x in range(16):
            X, Y = x + 0.5, y + 0.5
            dx, dy = X - 8, Y - 8
            r = math.hypot(dx, dy)
            th = math.atan2(dy, dx)
            b = 0.5 + 0.5 * math.sin(k * (X + Y) + 0.8 * math.sin(k * (X - Y)) - T)
            bg = 0.06 + 0.16 * b
            ph = arms * th + 1.05 * r - T
            arm = (0.5 + 0.5 * math.cos(ph)) ** 2.0
            glow = 1.0 - smoothstep(2.0, 7.6, r)
            vort = 0.10 + 0.88 * arm * smoothstep(0.8, 2.6, r) * (0.35 + 0.65 * glow)
            if r < 1.5:
                vort = 0.0
            w = 1.0 - smoothstep(5.4, 7.9, r)
            v = (1 - w) * bg + w * max(vort, bg if r > 2 else 0)
            a[y, x] = ramp_at(VIO[:5], v)
    # drifting stars on periodic paths (wrap with modulo -> seamless)
    for n, (sx, sy, vx, vy) in enumerate(((1, 3, 1, 0), (12, 14, 0, -1), (14, 1, -1, 1), (3, 11, 1, 1))):
        x = int(sx + vx * 16 * t) % 16
        y = int(sy + vy * 16 * t) % 16
        if math.hypot(x + 0.5 - 8, y + 0.5 - 8) > 5.8:
            px(a, x, y, VIO[4] if n % 2 else VIO[5])
    return a


def gen_descent_rift():
    D = DARK
    frames = [rift_frame(i / 32.0) for i in range(32)]
    top = block_tex("descent_rift_top", frames, frametime=2)

    s = img(16, fill=D[2])
    grain(s, 0, 0, 15, 15, D, 2, seed=201, density=0.14)
    hline(s, 0, 15, 0, D[5]); hline(s, 0, 15, 1, D[4]); hline(s, 0, 15, 2, D[3]); hline(s, 0, 15, 3, D[0])
    for x in (4, 11):
        px(s, x, 1, D[2]); px(s, x, 2, D[1])
    # rough blocks below the lip
    for (x0, y0, x1, y1) in ((0, 4, 6, 9), (7, 4, 15, 8), (0, 10, 9, 15), (10, 9, 15, 15)):
        outline_rect(s, x0, y0, x1, y1, D[3], D[1])
    cracks = [(9, 4), (9, 5), (10, 6), (10, 7), (11, 8), (3, 10), (3, 11), (4, 12), (4, 13)]
    dull = [(11, 9), (5, 14), (2, 5), (2, 6)]
    for (x, y) in cracks + dull:
        px(s, x, y, D[0])
    sidet = block_tex("descent_rift_side", s)

    g = img(16)
    for (x, y) in cracks:
        px(g, x, y, VIO[2])
    for (x, y) in ((9, 4), (3, 10)):
        px(g, x, y, VIO[3])
    # the rift's light spilling over the lip
    for x in range(16):
        if x % 5 != 4:
            px(g, x, 3, VIO[2])
    for x in (2, 7, 12):
        px(g, x, 3, VIO[3])
    glow = block_tex("descent_rift_side_glow", g)

    T_ = {"particle": sidet, "side": sidet, "top": top, "glow": glow,
          "bottom": "minecraft:block/polished_deepslate"}
    els = [
        el((0, 0, 0), (16, 16, 16), {**sides("side"), "down": "bottom"}, cull=True),
        el((0, 0, 0), (16, 16, 16), {"up": "top"}, cull=True, emit=15, shade=False),
    ]
    els += overlay_planes((0, 0, 0), (16, 16, 16), {s_: "glow" for s_ in SIDES}, emit=12, cull=True)
    mid = model("descent_rift", T_, els, parent="minecraft:block/block")
    blockstate("descent_rift", {"": {"model": mid}})
    item_def("descent_rift", mid)


# =============================================================================================
# 3. Waystone
# =============================================================================================

def crystal_cluster():
    """Soul crystal on top of the waystone: a tall diamond prism + stepped tip + two tilted shards.

    The crystal texture has four vertical facet bands (bright -> dark) so each face of the
    rotated prism picks a different band and the crystal reads faceted without shading.
    """
    band = {"north": 0, "west": 1, "east": 2, "south": 3}

    def faces(v0, v1, inset=0.0, w=4.0, up=None):
        d = {}
        for s_, b in band.items():
            d[s_] = {"tex": "crystal", "uv": [4 * b + inset, v0, 4 * b + inset + w, v1]}
        if up:
            d["up"] = {"tex": "crystal", "uv": up}
        return d

    els = [
        el((5.5, 15, 5.5), (10.5, 22, 10.5), faces(3, 10, 0, 4), rot=rot_y45((8, 15, 8)), emit=15, shade=False),
        el((6.5, 22, 6.5), (9.5, 24, 9.5), faces(1, 3, 0.5, 3, up=[4.5, 1, 7.5, 4]), rot=rot_y45((8, 22, 8)),
           emit=15, shade=False),
        el((4.5, 15, 7), (6.5, 19, 9), faces(6, 10, 1, 2, up=[1, 5, 3, 7]),
           rot={"origin": [5.5, 15, 8], "axis": "z", "angle": 22.5}, emit=15, shade=False),
        el((9.5, 15, 7), (11.5, 19, 9), faces(6, 10, 1, 2, up=[5, 5, 7, 7]),
           rot={"origin": [10.5, 15, 8], "axis": "z", "angle": -22.5}, emit=15, shade=False),
        el((7, 15, 9.5), (9, 18, 11.5), faces(7, 10, 1, 2, up=[9, 5, 11, 7]),
           rot={"origin": [8, 15, 10.5], "axis": "x", "angle": 22.5}, emit=15, shade=False),
    ]
    return els


def gen_waystone():
    P = PALE
    # ---- lower elevation (face x2..13)
    lo = img(16, fill=P[3])
    grain(lo, 0, 0, 15, 15, P, 3, seed=301, density=0.12)
    vline(lo, 2, 0, 13, P[5]); vline(lo, 3, 0, 13, P[4]); vline(lo, 12, 0, 13, P[2]); vline(lo, 13, 0, 13, P[1])
    # horizontal carved bands
    hline(lo, 2, 13, 1, P[1]); hline(lo, 3, 12, 2, P[5])
    hline(lo, 2, 13, 11, P[1]); hline(lo, 3, 12, 12, P[4])
    # recessed inscription channel
    rect(lo, 5, 3, 10, 10, P[2]); vline(lo, 5, 3, 10, P[1]); hline(lo, 5, 10, 3, P[1]); vline(lo, 10, 4, 10, P[4])
    # plinth (rows 13..15, full width for the flare)
    rect(lo, 0, 13, 15, 15, P[3]); hline(lo, 0, 15, 13, P[6]); hline(lo, 0, 15, 14, P[4]); hline(lo, 0, 15, 15, P[2])
    px(lo, 0, 14, P[5]); px(lo, 15, 14, P[2])
    for x in (4, 8, 11):
        px(lo, x, 15, P[1])
    lower = block_tex("waystone_lower", lo)

    # ---- upper elevation: collar row 1, cap rows 2..3 (x2..13), shaft rows 4..15 (x3..12)
    up = img(16, fill=P[3])
    grain(up, 0, 0, 15, 15, P, 3, seed=302, density=0.12)
    hline(up, 0, 15, 0, P[5]); hline(up, 0, 15, 1, P[4])
    hline(up, 2, 13, 2, P[6]); hline(up, 2, 13, 3, P[4]); px(up, 2, 3, P[5]); px(up, 13, 3, P[2])
    hline(up, 3, 12, 4, P[1])
    vline(up, 3, 5, 15, P[5]); vline(up, 4, 5, 15, P[4]); vline(up, 11, 5, 15, P[2]); vline(up, 12, 5, 15, P[1])
    # carved ring sigil recess
    ring = [".oooo.", "o....p", "o....p", "o....p", ".pppp."]
    from_map(ring, {"o": P[1], "p": P[5]}, up, 5, 6)
    rect(up, 6, 7, 9, 9, P[2])
    hline(up, 4, 11, 13, P[1]); hline(up, 4, 11, 14, P[4])
    upper = block_tex("waystone_upper", up)

    # ---- cap top
    tp = img(16, fill=P[4])
    grain(tp, 0, 0, 15, 15, P, 4, seed=303, density=0.1)
    outline_rect(tp, 1, 1, 14, 14, P[5], P[2])
    outline_rect(tp, 2, 2, 13, 13, P[6], P[3])
    outline_rect(tp, 4, 4, 11, 11, P[3], P[5])
    rect(tp, 5, 5, 10, 10, P[2])
    rect(tp, 6, 6, 9, 9, P[1])
    tops = block_tex("waystone_top", tp)

    # ---- rune overlays (16 frames, a gentle wave of light travelling up the inscription)
    def wave_frames(levels_lower, levels_upper, nframes=16):
        out_l, out_u = [], []
        for f in range(nframes):
            ph = f / nframes
            for levels, out, base_row in ((levels_lower, out_l, 0), (levels_upper, out_u, 16)):
                a = img(16)
                for y in range(16):
                    for x in range(16):
                        lvl = levels[y][x]
                        if lvl < 0:
                            continue
                        # height along the monolith in pixels (0 = ground); the upper block
                        # continues the lower one, so a band of light climbs both halves.
                        hgt = (15 - y) + (0 if base_row == 0 else 16)
                        w = 0.5 + 0.5 * math.cos(2 * math.pi * (hgt / 32.0 - ph))
                        boost = 2 if w > 0.8 else (1 if w > 0.45 else 0)
                        a[y, x] = SOUL[max(2, min(5, lvl + boost))]
                out.append(a)
        return out_l, out_u

    # Inscription channel (x6..9, rows 3..10): two stacked 4-wide runes; groove glints in the bands.
    lf = empty_levels()
    stamp(lf, ["#.#", "###", ".#."], 6, 4, 3)   # algiz
    stamp(lf, ["#.#", ".#.", "#.#"], 7, 8, 3)   # gebo
    for x in (4, 7, 8, 11):
        lf[1][x] = 2
        lf[11][x] = 2
    ls = empty_levels()
    stamp(ls, ["#.#", ".#.", "#.#", "#.."], 6, 4, 3)
    stamp(ls, [".#.", "##.", ".##", ".#."], 7, 8, 3)
    for x in (5, 10):
        ls[1][x] = 2
        ls[11][x] = 2
    # upper: an open eye in a ring (the waystone "watching" the way home) + a rune below
    uf = empty_levels()
    eye_lv = ["..##..", ".#..#.", "#.##.#", ".#..#.", "..##.."]
    for y, r in enumerate(eye_lv):
        for x, ch in enumerate(r):
            if ch == "#":
                uf[6 + y][5 + x] = 3
    uf[8][7] = 4
    uf[8][8] = 4
    stamp(uf, ["#..#", ".##.", "#..#"], 6, 12, 2)
    us = empty_levels()
    stamp(us, ["#.#", "###", ".#.", ".#."], 6, 7, 3)
    stamp(us, ["#.", ".#"], 7, 12, 2)
    lfront, ufront = wave_frames(lf, uf)
    lside, uside = wave_frames(ls, us)
    block_tex("waystone_runes_lower", lfront, frametime=3, interpolate=True)
    block_tex("waystone_runes_upper", ufront, frametime=3, interpolate=True)
    block_tex("waystone_runes_lower_side", lside, frametime=3, interpolate=True)
    block_tex("waystone_runes_upper_side", uside, frametime=3, interpolate=True)

    # ---- soul crystal (8 frames shimmer)
    cr = []
    for f in range(8):
        a = img(16)
        for y in range(16):
            for x in range(16):
                b, i = x // 4, x % 4  # four facet bands, bright -> dark
                base = (4, 3, 3, 2)[b]
                if i == 0:
                    base += 1
                elif i == 3:
                    base -= 1
                if y < 3:
                    base += 1
                if (y - 2 * f) % 16 == 0 and i in (1, 2):  # glint sliding down the facets
                    base += 1
                if (x * 7 + y * 3) % 11 == 0 and 3 <= y:  # inner flaws
                    base -= 1
                a[y, x] = SOUL[max(1, min(5, base))]
        cr.append(a)
    crystal = block_tex("waystone_crystal", cr, frametime=3)

    TL = {"particle": lower, "stone": lower, "top": tops,
          "runes": f"{MOD}:block/waystone_runes_lower", "runes_side": f"{MOD}:block/waystone_runes_lower_side"}
    lower_els = [
        el((2, 0, 2), (14, 16, 14), {**sides("stone"), "up": "top"}),
        el((1, 0, 1), (15, 2, 15), {**sides("stone"), "up": "top", "down": {"tex": "top", "cull": "down"}}),
    ]
    lower_els += overlay_planes((2, 0, 2), (14, 16, 14),
                                {"north": "runes", "south": "runes_side", "west": "runes_side", "east": "runes_side"})
    TU = {"particle": upper, "stone": upper, "top": tops, "crystal": crystal,
          "runes": f"{MOD}:block/waystone_runes_upper", "runes_side": f"{MOD}:block/waystone_runes_upper_side"}
    upper_els = [
        el((3, 0, 3), (13, 12, 13), sides("stone")),
        el((2, 12, 2), (14, 14, 14), {**sides("stone"), "up": "top", "down": "top"}),
        el((5, 14, 5), (11, 15, 11), {**{s_: {"tex": "stone", "uv": [5, 0, 11, 1]} for s_ in SIDES}, "up": "top"}),
    ]
    upper_els += crystal_cluster()
    upper_els += overlay_planes((3, 0, 3), (13, 12, 13),
                                {"north": "runes", "south": "runes_side", "west": "runes_side", "east": "runes_side"})
    m_lo = model("waystone_lower", TL, lower_els)
    m_up = model("waystone_upper", TU, upper_els)
    variants = {}
    for facing in FACING_Y:
        for half, mid in (("lower", m_lo), ("upper", m_up)):
            variants[f"facing={facing},half={half}"] = facing_variant(mid, facing)
    blockstate("waystone", variants)

    # Inventory model: both halves stacked and scaled down to fit one slot.
    inv_tex = {"particle": upper, "lstone": lower, "ustone": upper, "top": tops, "crystal": crystal,
               "lrunes": f"{MOD}:block/waystone_runes_lower", "urunes": f"{MOD}:block/waystone_runes_upper",
               "lrunes_side": f"{MOD}:block/waystone_runes_lower_side",
               "urunes_side": f"{MOD}:block/waystone_runes_upper_side"}
    remap_lo = {"stone": "lstone", "runes": "lrunes", "runes_side": "lrunes_side"}
    remap_up = {"stone": "ustone", "runes": "urunes", "runes_side": "urunes_side"}
    inv = [scale_element(e, 0.5, (8, 0, 8), 0, remap_lo) for e in lower_els]
    inv += [scale_element(e, 0.5, (8, 0, 8), 8, remap_up) for e in upper_els]
    disp = {  # model spans y 0..~20.75 and x/z 5..11, so shrink and lower it to sit in a slot
        "gui": {"rotation": [30, 225, 0], "translation": [0, -1.5, 0], "scale": [0.72, 0.72, 0.72]},
        "ground": {"rotation": [0, 0, 0], "translation": [0, 2, 0], "scale": [0.3, 0.3, 0.3]},
        "fixed": {"rotation": [0, 0, 0], "translation": [0, -2, 0], "scale": [0.6, 0.6, 0.6]},
        "thirdperson_righthand": {"rotation": [75, 45, 0], "translation": [0, 2.5, 0], "scale": [0.45, 0.45, 0.45]},
        "firstperson_righthand": {"rotation": [0, 45, 0], "translation": [0, -1, 0], "scale": [0.5, 0.5, 0.5]},
        "firstperson_lefthand": {"rotation": [0, 225, 0], "translation": [0, -1, 0], "scale": [0.5, 0.5, 0.5]},
    }
    m_inv = model("waystone_inventory", inv_tex, inv, extra={"display": disp})
    item_def("waystone", m_inv)


def scale_element(e, s, pivot, dy, remap):
    """Uniformly scale an element about ``pivot`` and lift it by ``dy`` (UVs untouched)."""
    e = json.loads(json.dumps(e))

    def tr(p):
        return [_r(pivot[0] + (p[0] - pivot[0]) * s), _r(pivot[1] + (p[1] - pivot[1]) * s + dy),
                _r(pivot[2] + (p[2] - pivot[2]) * s)]
    e["from"] = tr(e["from"])
    e["to"] = tr(e["to"])
    if "rotation" in e:
        e["rotation"]["origin"] = tr(e["rotation"]["origin"])
    for f in e["faces"].values():
        key = f["texture"][1:]
        f["texture"] = "#" + remap.get(key, key)
        f.pop("cullface", None)
    return e


# =============================================================================================
# 4. Runic seal
# =============================================================================================

def gen_runic_seal():
    frames = []
    # runes sitting in the four cells of the X lattice: (glyph, x, y)
    cells = ((["#.#", "###", ".#.", ".#.", ".#."], 6, 1), (["..#", ".#.", "#.#", ".#.", "#.."], 7, 10),
             (["#.", "##", "#.", "#."], 2, 6), ([".#", "##", ".#", ".#"], 12, 6))
    for f in range(8):
        a = img(16, fill=C("#2f8fb8", 96))
        # soft sheen band drifting down the field (2px per frame -> loops in 8 frames)
        for y in range(16):
            d = (y - 2 * f) % 16
            if d in (0, 1):
                hline(a, 0, 15, y, C("#56d8ff", 116))
            elif d == 2:
                hline(a, 0, 15, y, C("#3fa8d4", 106))
        # X lattice: period 16, so neighbouring seal blocks form one diamond lattice
        for i in range(16):
            a[i, i] = C("#56d8ff")
            a[i, 15 - i] = C("#56d8ff")
        lit = (f * 2) % 16  # a spark running along the lattice
        for (x, y) in ((lit, lit), (15 - lit, lit)):
            a[y, x] = SOUL[5]
        for (x, y) in ((7, 7), (8, 8), (7, 8), (8, 7)):
            a[y, x] = SOUL[4]
        for n, (g, ox, oy) in enumerate(cells):
            phase = (f - n * 2) % 8
            col = SOUL[5] if phase < 1.5 else (SOUL[4] if phase < 4 else SOUL[3])
            for gy, r in enumerate(g):
                for gx, ch in enumerate(r):
                    if ch == "#":
                        px(a, ox + gx, oy + gy, col)
        frames.append(a)
    tex = block_tex("runic_seal", frames, frametime=3, interpolate=True)
    els = [el((0, 0, 0), (16, 16, 16), {d: "seal" for d in DIRS}, cull=True, emit=10, shade=False)]
    mid = model("runic_seal", {"particle": tex, "seal": tex}, els, ao=False)
    blockstate("runic_seal", {"": {"model": mid}})
    item_def("runic_seal", mid)


# =============================================================================================
# 5. Spike trap
# =============================================================================================

HOLES = (1, 5, 9, 13)  # 2x2 holes start at these pixel coords (centres 2, 6, 10, 14)


def gen_spike_trap():
    I, R = IRON, RUST
    p = img(16, fill=I[3])
    grain(p, 1, 1, 14, 14, I, 3, seed=501, density=0.1)
    outline_rect(p, 0, 0, 15, 15, I[5], I[1])
    px(p, 0, 15, I[3]); px(p, 15, 0, I[3])
    # cross bars between the holes (raised grate)
    for c in (3, 4, 7, 8, 11, 12):
        pass
    for hy in HOLES:
        for hx in HOLES:
            rect(p, hx, hy, hx + 1, hy + 1, I[0])
            px(p, hx, hy, C("#09090b"))
            px(p, hx + 2, hy + 1, I[5]); px(p, hx + 1, hy + 2, I[5]); px(p, hx + 2, hy + 2, I[4])
            px(p, hx - 1, hy, I[2]); px(p, hx, hy - 1, I[2])
    # rivets in the plate corners and rust bleeding from a few holes
    for (x, y) in ((3, 3), (12, 3), (3, 12), (12, 12), (7, 7)):
        pass
    for (x, y, c) in ((4, 3, R[2]), (4, 4, R[1]), (11, 8, R[2]), (12, 8, R[3]), (2, 11, R[2]), (3, 11, R[1]),
                      (7, 12, R[2]), (8, 3, R[3]), (14, 6, R[2]), (10, 14, R[1]), (6, 9, R[2])):
        px(p, x, y, c)
    plate = block_tex("spike_trap_plate", p)

    s = img(16)
    # four tapered spikes centred on u = 2, 6, 10, 14; tip at row 3, 4px-wide base at row 15
    widths = {3: 1, 4: 1, 5: 2, 6: 2, 7: 2, 8: 2, 9: 3, 10: 3, 11: 3, 12: 3, 13: 4, 14: 4, 15: 4}
    cols_for = {1: (-1,), 2: (-1, 0), 3: (-1, 0, 1), 4: (-2, -1, 0, 1)}
    blood = {0: ((2, 6), (2, 7), (2, 9)), 1: ((6, 7), (6, 8)), 2: ((10, 6), (10, 7), (10, 8), (11, 11)),
             3: ((14, 7), (14, 9))}
    for k, cx in enumerate((2, 6, 10, 14)):
        for y, w in widths.items():
            cols = [cx + d for d in cols_for[w]]
            for i, x in enumerate(cols):
                if y == 3:
                    c = I[6]
                elif i == 0:
                    c = I[6] if y < 9 else I[5]
                elif i == len(cols) - 1:
                    c = I[3] if w > 1 else I[5]
                else:
                    c = I[5] if y < 11 else I[4]
                px(s, x, y, c)
        # rust creeping up from the base
        for (dx, y, c) in ((-2, 15, R[1]), (0, 14, R[2]), (1, 15, R[1]) if k % 2 else (-1, 13, R[2])):
            px(s, cx + dx, y, c)
        for (x, y) in blood.get(k, ()):
            px(s, x, y, BLOOD[2] if (x + y) % 2 else BLOOD[1])
    spikes = block_tex("spike_trap_spikes", s)

    T_ = {"particle": plate, "plate": plate, "spikes": spikes}
    plate_el = el((0, 0, 0), (16, 1, 16), {**{s_: {"tex": "plate", "uv": [0, 0, 16, 1]} for s_ in SIDES},
                                           "up": "plate", "down": "plate"}, cull=True)
    # side faces cull too (flush with neighbours)
    for s_ in SIDES:
        plate_el["faces"][s_]["cullface"] = s_

    def cross(y0, y1, v0, v1):
        out = []
        for (f, t, fa, fb) in (((0, y0, 8), (16, y1, 8), "north", "south"), ((8, y0, 0), (8, y1, 16), "west", "east")):
            out.append(el(f, t, {fa: {"tex": "spikes", "uv": [0, v0, 16, v1]},
                                 fb: {"tex": "spikes", "uv": [0, v0, 16, v1]}},
                          rot=rot_y45((8, 8, 8), rescale=True), shade=False))
        return out

    m0 = model("spike_trap_plate", T_, [plate_el])
    m1 = model("spike_trap_primed", T_, [plate_el] + cross(1, 3, 3, 5), ao=False)
    m2 = model("spike_trap_extended", T_, [plate_el] + cross(1, 14, 3, 16), ao=False)
    blockstate("spike_trap", {"stage=0": {"model": m0}, "stage=1": {"model": m1}, "stage=2": {"model": m2},
                              "stage=3": {"model": m0}})
    item_def("spike_trap", m2)


# =============================================================================================
# 6. Dart trap
# =============================================================================================

def gen_dart_trap():
    # Skull carved in relief; the round mouth (rows 8..11) sits where the dart emerges (y=0.45).
    # Relief: lit top/left edges (c), shadowed bottom/right edges (d), no hard frame.
    core = [  # cols 3..12
        "..cccccc..",
        ".cbbbbbbba",
        "cbbbbbbbbd",
        "cbeebbeebd",
        "beeebbeeed",
        "beeebbeeed",
        "abbbnnbbbd",
        ".abbnnbbd.",
        ".atnmmntd.",
        "sdmmmmmmds",
        "sdmmmmmmds",
        ".dtnmmntd.",
        "..dttttd..",
        "...dddd...",
    ]
    face = ["." * 3 + r + "." * 3 for r in core] + ["." * 16] * 2
    pal = {
        "a": C("#848385"), "b": C("#a19fa1"), "c": C("#bab8ba"), "d": C("#5e5d5f"),
        "e": C("#1a191b"), "m": C("#0b0a0b"), "n": C("#2b2a2c"), "s": C("#565557"), "t": C("#c4c2c4"),
    }
    a = from_map(face, pal, img(16))
    # soot fanning out from the mouth
    for (x, y, c) in ((2, 9, C("#5c5b5d")), (13, 10, C("#5c5b5d")), (2, 10, C("#6a696b")), (13, 9, C("#6a696b")),
                      (5, 14, C("#626163")), (10, 14, C("#626163")), (7, 15, C("#6a696b"))):
        px(a, x, y, c)
    ov = block_tex("dart_trap_face", a)
    T_ = {"particle": "minecraft:block/stone_bricks", "stone": "minecraft:block/stone_bricks", "face": ov}
    els = [el((0, 0, 0), (16, 16, 16), {d: "stone" for d in DIRS}, cull=True)]
    els += overlay_planes((0, 0, 0), (16, 16, 16), {"north": "face"}, emit=0, cull=True)
    mid = model("dart_trap", T_, els)
    blockstate("dart_trap", {f"facing={f}": facing_variant(mid, f) for f in FACING_Y})
    item_def("dart_trap", mid)


# =============================================================================================
# 7. Crumbling stone bricks
# =============================================================================================

def gen_crumbling():
    a = img(16)
    hair = C("#5f5e60")
    hair2 = C("#6c6b6d")
    dust = C("#9c999c")
    dust2 = C("#8f8d8f")
    # hairline cracks (tiny extensions running out of the brick seams)
    for (x, y, c) in ((5, 5, hair), (6, 4, hair2), (11, 1, hair), (12, 2, hair2), (2, 12, hair),
                      (3, 11, hair2), (10, 10, hair), (11, 11, hair2), (14, 9, hair2)):
        px(a, x, y, c)
    # dusty pale grit sitting in the mortar seams
    for (x, y, c) in ((3, 7, dust), (4, 7, dust2), (12, 7, dust2), (7, 10, dust2), (7, 12, dust),
                      (10, 15, dust), (11, 15, dust2), (15, 3, dust2), (1, 15, dust2)):
        px(a, x, y, c)
    ov = block_tex("crumbling_overlay", a)
    T_ = {"particle": "minecraft:block/cracked_stone_bricks", "base": "minecraft:block/cracked_stone_bricks",
          "overlay": ov}
    els = [el((0, 0, 0), (16, 16, 16), {d: "base" for d in DIRS}, cull=True),
           el((-0.01, -0.01, -0.01), (16.01, 16.01, 16.01), {d: {"tex": "overlay", "cull": d} for d in DIRS},
              uvbox=((0, 0, 0), (16, 16, 16)))]
    mid = model("crumbling_stone_bricks", T_, els)
    blockstate("crumbling_stone_bricks", {"": {"model": mid}})
    item_def("crumbling_stone_bricks", mid)


# =============================================================================================
# 8. Reliquary
# =============================================================================================

def gen_reliquary():
    Q, G = COFFER, GOLD
    # ---- front elevation: lid rows 3..5 (x1..14), body rows 6..12 (x2..13), base rows 13..15 (x1..14)
    f = img(16, fill=Q[3])
    grain(f, 0, 0, 15, 15, Q, 3, seed=801, density=0.1)
    # lid front band (rows 3..5): stone lip, gold inlay line, clasp in the middle
    hline(f, 1, 14, 3, Q[5]); hline(f, 1, 14, 4, G[3]); hline(f, 1, 3, 4, G[4]); hline(f, 1, 14, 5, Q[2])
    px(f, 1, 3, G[4]); px(f, 14, 3, G[2]); px(f, 1, 5, G[3]); px(f, 14, 5, G[1])
    rect(f, 6, 3, 9, 5, G[3]); px(f, 6, 3, G[4]); px(f, 7, 3, G[5]); px(f, 9, 5, G[1]); px(f, 6, 5, G[2])
    # body: thin gold corner straps, carved panel, gold ring emblem with a gem
    rect(f, 2, 6, 13, 12, Q[3]); grain(f, 4, 7, 11, 12, Q, 3, seed=802, density=0.1)
    hline(f, 2, 13, 6, Q[1])  # under-lid shadow (where the seam glow sits)
    vline(f, 2, 7, 12, G[4]); vline(f, 13, 7, 12, G[2]); vline(f, 3, 7, 12, Q[5]); vline(f, 12, 7, 12, Q[2])
    outline_rect(f, 4, 7, 11, 12, Q[2], Q[5])  # recessed panel bevel (top-left in shadow)
    emblem = [
        "..hy..",
        ".h..k.",
        "h.gG.k",
        "y.gk.k",
        ".y..k.",
        "..kk..",
    ]
    from_map(emblem, {"h": G[5], "y": G[3], "k": G[2], "g": G[4], "G": G[5]}, f, 5, 7)
    # base
    rect(f, 1, 13, 14, 15, Q[2]); hline(f, 1, 14, 13, G[3]); hline(f, 1, 3, 13, G[4]); hline(f, 12, 14, 13, G[2])
    hline(f, 1, 14, 14, Q[4]); hline(f, 1, 14, 15, Q[1])
    for x in (4, 7, 8, 11):
        px(f, x, 15, Q[0])
    front = block_tex("reliquary_front", f)

    # ---- side elevation (z mapped to u): body x3..12, base x2..13, lid band rows 3..5
    s = img(16, fill=Q[3])
    grain(s, 0, 0, 15, 15, Q, 3, seed=803, density=0.1)
    hline(s, 0, 15, 3, Q[5]); hline(s, 0, 15, 4, G[3]); hline(s, 0, 15, 5, Q[2])
    hline(s, 3, 12, 6, Q[1])
    vline(s, 3, 7, 12, G[4]); vline(s, 12, 7, 12, G[2]); vline(s, 4, 7, 12, Q[5]); vline(s, 11, 7, 12, Q[2])
    ring_ = [".yy.", "y..k", "y..k", ".kk."]
    from_map(ring_, {"y": G[4], "k": G[2]}, s, 6, 8)
    px(s, 7, 7, Q[1]); px(s, 8, 7, Q[1])
    rect(s, 0, 13, 15, 15, Q[2]); hline(s, 0, 15, 13, G[3]); hline(s, 0, 15, 14, Q[4]); hline(s, 0, 15, 15, Q[1])
    side = block_tex("reliquary_side", s)

    # ---- lid top
    t = img(16, fill=Q[4])
    grain(t, 0, 0, 15, 15, Q, 4, seed=804, density=0.1)
    outline_rect(t, 1, 2, 14, 13, Q[6], Q[2])
    outline_rect(t, 2, 3, 13, 12, G[3], G[2])
    # raised cross-shaped relief with a gold boss
    rect(t, 7, 4, 8, 11, Q[5]); rect(t, 4, 7, 11, 8, Q[5])
    vline(t, 9, 4, 11, Q[3]); hline(t, 4, 11, 9, Q[3])
    rect(t, 7, 7, 8, 8, G[4]); px(t, 7, 7, G[5]); px(t, 8, 8, G[2])
    for (x, y) in ((2, 3), (13, 3), (2, 12), (13, 12)):
        px(t, x, y, G[5])
    top = block_tex("reliquary_top", t)

    # ---- lid: side band rows 0..2, underside rows 3..15
    l = img(16, fill=Q[2])
    grain(l, 0, 3, 15, 15, Q, 2, seed=805, density=0.1)
    hline(l, 0, 15, 0, Q[5]); hline(l, 0, 15, 1, G[3]); hline(l, 0, 15, 2, Q[2])
    for x in (3, 12):
        px(l, x, 1, G[5])
    outline_rect(l, 1, 4, 14, 14, G[2], G[1])
    rect(l, 2, 5, 13, 13, Q[1])
    lid = block_tex("reliquary_lid", l)

    # ---- inner treasure glow (emissive)
    n = img(16, fill=G[3])
    coins = [
        "................",
        ".hhgghgghhgghgh.",
        ".hwhggyhgghwhgg.",
        ".gggyyggkggyggh.",
        ".gwgghhgkgghhgg.",
        ".ggyhhgggghwhyg.",
        ".hggggrrghggggg.",
        ".hgkggrrghgkgwh.",
        ".ggghgggyggghgg.",
        ".gwhgggggyyhggg.",
        ".ggggygkhgggwhg.",
        ".hgghhggghgggyg.",
        ".ghwggyhhggkggh.",
        ".gggghgggwhgghg.",
        ".hgkgghggggyghg.",
        "................",
    ]
    from_map(coins, {"h": G[5], "g": G[4], "y": G[3], "k": G[2], "w": C("#fffbe6"), "r": C("#ff6a7a")}, n)
    outline_rect(n, 0, 0, 15, 15, G[2], G[2])
    inner = block_tex("reliquary_inner", n)

    # ---- front glow overlay (emblem gem + clasp), emissive
    g = img(16)
    rect(g, 7, 9, 8, 10, G[5]); px(g, 8, 9, C("#fffbe6")); px(g, 7, 10, G[4])
    px(g, 7, 4, G[5]); px(g, 8, 4, G[4])
    glow = block_tex("reliquary_glow", g)

    T_ = {"particle": side, "front": front, "side": side, "top": top, "lid": lid, "inner": inner, "glow": glow}
    base_el = el((1, 0, 2), (15, 3, 14), {"north": "front", "south": "side", "west": "side", "east": "side",
                                          "up": {"tex": "top", "uv": [1, 2, 15, 14]},
                                          "down": {"tex": "lid", "cull": "down", "uv": [1, 2, 15, 14]}})
    body_faces = {"north": "front", "south": "side", "west": "side", "east": "side"}
    seam = el((1.95, 9, 2.95), (14.05, 10, 13.05), {s_: {"tex": "inner", "uv": [2, 1, 14, 2]} for s_ in SIDES},
              emit=15, shade=False)
    lid_faces = {"north": "front", "south": {"tex": "lid", "uv": [1, 0, 15, 3]},
                 "west": {"tex": "lid", "uv": [2, 0, 14, 3]}, "east": {"tex": "lid", "uv": [2, 0, 14, 3]},
                 "up": {"tex": "top", "uv": [1, 2, 15, 14]}, "down": {"tex": "lid", "uv": [1, 3, 15, 15]}}
    glow_body = overlay_planes((2, 3, 3), (14, 10, 13), {"north": "glow"})
    glow_lid = overlay_planes((1, 10, 2), (15, 13, 14), {"north": "glow"})

    closed = [base_el, el((2, 3, 3), (14, 10, 13), {**body_faces, "up": "inner"}),
              el((1, 10, 2), (15, 13, 14), lid_faces), seam] + glow_body + glow_lid
    hinge = {"origin": [8, 10, 14], "axis": "x", "angle": 45}
    open_lid = el((1, 10, 2), (15, 13, 14), lid_faces, rot=hinge)
    open_glow = overlay_planes((1, 10, 2), (15, 13, 14), {"north": "glow"})
    for e in open_glow:
        e["rotation"] = hinge
    opened = [base_el, el((2, 3, 3), (14, 10, 13), body_faces),
              el((2, 3, 3), (14, 10, 13), {"up": {"tex": "inner", "uv": [2, 3, 14, 13]}}, emit=15, shade=False),
              open_lid, seam] + glow_body + open_glow
    m_c = model("reliquary", T_, closed)
    m_o = model("reliquary_open", T_, opened)
    variants = {}
    for facing in FACING_Y:
        variants[f"facing={facing},open=false"] = facing_variant(m_c, facing)
        variants[f"facing={facing},open=true"] = facing_variant(m_o, facing)
    blockstate("reliquary", variants)
    item_def("reliquary", m_c)


# =============================================================================================
# 9. Burial urn
# =============================================================================================

def gen_burial_urn():
    K, B = CLAY, BONE
    a = img(16, fill=K[4])
    # horizontal shading for roundness: left lit, right shadowed (per column)
    shade_cols = {0: 4, 1: 4, 2: 5, 3: 5, 4: 6, 5: 5, 6: 5, 7: 5, 8: 4, 9: 4, 10: 4, 11: 3, 12: 3, 13: 2, 14: 2, 15: 2}
    for x in range(16):
        vline(a, x, 0, 15, K[shade_cols[x]])
    # rim row 3 (y12..13), neck rows 4..5, shoulder row 6, body rows 7..14, foot row 15
    hline(a, 0, 15, 3, K[5]); hline(a, 0, 4, 3, K[6]); hline(a, 11, 15, 3, K[3])
    for x in range(16):
        px(a, x, 4, K[max(1, shade_cols[x] - 2)])
        px(a, x, 5, K[max(1, shade_cols[x] - 1)])
        px(a, x, 6, K[max(1, shade_cols[x] - 1)])
        px(a, x, 15, K[max(1, shade_cols[x] - 2)])
        px(a, x, 14, K[max(1, shade_cols[x] - 1)])
    # painted bone bands
    for x in range(3, 13):
        px(a, x, 7, B[2] if x < 10 else B[1])
        px(a, x, 13, B[2] if x < 10 else B[1])
    for x in range(3, 13, 2):  # zig-zag under the lower band
        px(a, x, 12, B[1])
    skull = [
        ".www.",
        "wbwbw",
        "wwwww",
        ".w.w.",
    ]
    from_map(skull, {"w": B[3], "b": K[0]}, a, 6, 8)
    px(a, 10, 9, B[2]); px(a, 10, 10, B[2])
    # chips: raw clay showing through
    for (x, y, c) in ((4, 9, C("#c99a6e")), (11, 11, C("#b48458")), (5, 7, K[4]), (12, 13, K[2]), (8, 3, C("#c99a6e")),
                      (3, 11, K[3])):
        px(a, x, y, c)
    urn = block_tex("burial_urn", a)

    t = img(16, fill=K[4])
    grain(t, 0, 0, 15, 15, K, 4, seed=901, density=0.08)
    outline_rect(t, 3, 3, 12, 12, K[5], K[3])
    outline_rect(t, 4, 4, 11, 11, K[6], K[3])
    outline_rect(t, 5, 5, 10, 10, K[3], K[5])
    rect(t, 6, 6, 9, 9, C("#140c08"))
    px(t, 6, 6, K[0]); px(t, 9, 9, K[1])
    top = block_tex("burial_urn_top", t)

    T_ = {"particle": urn, "urn": urn, "top": top}
    els = [
        el((4, 0, 4), (12, 1, 12), {**sides("urn"), "down": {"tex": "top", "cull": "down"}}),
        el((3, 1, 3), (13, 9, 13), {**sides("urn"), "up": "top", "down": "top"}),
        el((4, 9, 4), (12, 10, 12), {**sides("urn"), "up": "top"}),
        el((5, 10, 5), (11, 12, 11), sides("urn")),
        el((4, 12, 4), (12, 13, 12), {**sides("urn"), "up": "top", "down": "top"}),
    ]
    mid = model("burial_urn", T_, els)
    blockstate("burial_urn", {"": {"model": mid}})
    item_def("burial_urn", mid)


# =============================================================================================
# 10. Altar of trials
# =============================================================================================

def gen_altar():
    K = BLACKSTONE
    s = img(16, fill=K[3])
    grain(s, 0, 0, 15, 15, K, 3, seed=1001, density=0.12)
    # top slab rows 2..4 (x1..14)
    hline(s, 1, 14, 2, K[5]); hline(s, 1, 14, 3, K[4]); hline(s, 1, 14, 4, K[2])
    px(s, 1, 2, K[6]); px(s, 14, 4, K[1])
    for x in (4, 8, 11):
        px(s, x, 3, K[2])
    # pillar rows 5..11 (x3..12)
    rect(s, 3, 5, 12, 11, K[2]); grain(s, 4, 6, 11, 11, K, 2, seed=1002, density=0.15)
    hline(s, 3, 12, 5, K[0])
    vline(s, 3, 6, 11, K[4]); vline(s, 4, 6, 11, K[3]); vline(s, 11, 6, 11, K[1]); vline(s, 12, 6, 11, K[1])
    # base rows 12..15 (x1..14)
    rect(s, 0, 12, 15, 15, K[3]); grain(s, 0, 13, 15, 15, K, 3, seed=1003, density=0.2)
    hline(s, 0, 15, 12, K[5]); hline(s, 0, 15, 15, K[1]); px(s, 0, 12, K[6])
    side = block_tex("altar_of_trials_side", s)

    t = img(16, fill=K[3])
    grain(t, 0, 0, 15, 15, K, 3, seed=1004, density=0.12)
    outline_rect(t, 1, 1, 14, 14, K[5], K[1])
    outline_rect(t, 2, 2, 13, 13, K[4], K[2])
    rect(t, 3, 3, 12, 12, K[0])
    for (x, y) in ((1, 1), (14, 1), (1, 14), (14, 14)):
        px(t, x, y, K[6])
    top = block_tex("altar_of_trials_top", t)

    # rune level maps (pillar rows 6..11, base rows 13..14)
    def rune_levels(front):
        """Levels index BLOOD[2:]: 0 dark red, 1 red, 2 glow, 3 pale hot core."""
        lv = empty_levels()
        if front:
            sig = [  # an eye inside a ring, centred on the pillar (cols 5..10)
                "..##..",
                ".#..#.",
                "#.##.#",
                "#.##.#",
                ".#..#.",
                "..##..",
            ]
            for y, r in enumerate(sig):
                for x, ch in enumerate(r):
                    if ch == "#":
                        lv[6 + y][5 + x] = 1
            for (x, y) in ((7, 8), (8, 8), (7, 9), (8, 9)):
                lv[y][x] = 2
            band = "##.#.####.#.##"
        else:
            stamp(lv, ["#.#", ".#.", "#.#"], 6, 6, 1)
            stamp(lv, [".#.", "#.#", ".#."], 6, 9, 1)
            lv[7][7] = 2
            band = "#.#.##..##.#.#"
        for i, ch in enumerate(band):  # rune band around the base (row 14, x1..14)
            if ch == "#":
                lv[14][1 + i] = 0
        if front:
            lv[14][7] = lv[14][8] = 1
        return lv

    heartbeat = [1, 0, 1, 0, 0, 0, 0, -1]  # lub-dub ... rest
    runes_f = pulse_frames(rune_levels(True), BLOOD[2:] + [C("#ffd0d6")], heartbeat)
    runes_s = pulse_frames(rune_levels(False), BLOOD[2:] + [C("#ffd0d6")], heartbeat)
    rf = block_tex("altar_of_trials_runes_front", runes_f, frametime=3, interpolate=True)
    rs = block_tex("altar_of_trials_runes", runes_s, frametime=3, interpolate=True)
    dried_f = level_overlay(rune_levels(True), DRIED, 1)
    dried_s = level_overlay(rune_levels(False), DRIED, 1)
    uf = block_tex("altar_of_trials_runes_front_used", dried_f)
    us = block_tex("altar_of_trials_runes_used", dried_s)

    # blood pool (basin 3..12): dark at the walls, a glowing depth, one ripple ring per cycle
    blood_frames = []
    for f in range(8):
        a = img(16, fill=BLOOD[2])
        for y in range(16):
            for x in range(16):
                edge = min(x - 3, 12 - x, y - 3, 12 - y)
                r = math.hypot(x + 0.5 - 9, y + 0.5 - 9)
                if edge <= 0:
                    c = BLOOD[1]
                elif r < 2.6:
                    c = BLOOD[3]
                else:
                    c = BLOOD[2]
                R = 1.0 + 5.2 * f / 8
                if abs(r - R) < 0.55 and edge > 0 and f < 6:
                    c = BLOOD[3]
                a[y, x] = c
        # specular glint near the lit (top-left) wall
        for (x, y, c) in ((5, 5, BLOOD[4]), (6, 5, BLOOD[4]), (5, 6, BLOOD[3]), (4, 4, BLOOD[5])):
            px(a, x, y, c)
        blood_frames.append(a)
    bl = block_tex("altar_of_trials_blood", blood_frames, frametime=5, interpolate=True)
    d = img(16, fill=DRIED[2])
    grain(d, 0, 0, 15, 15, DRIED, 2, seed=1005, density=0.25)
    for (x, y) in ((5, 6), (6, 6), (9, 9), (10, 9), (10, 10), (4, 11), (11, 4)):
        px(d, x, y, DRIED[4])
    for (x, y) in ((7, 4), (8, 5), (8, 6), (4, 8), (12, 8)):
        px(d, x, y, DRIED[0])
    bd = block_tex("altar_of_trials_blood_dried", d)

    def build(used):
        T_ = {"particle": side, "side": side, "top": top,
              "runes": us if used else rs, "runes_front": uf if used else rf,
              "blood": bd if used else bl}
        emit = 0 if used else 15
        els = [
            el((1, 0, 1), (15, 4, 15), {**sides("side"), "up": "top", "down": {"tex": "top", "cull": "down"}}),
            el((3, 4, 3), (13, 11, 13), sides("side")),
            el((1, 11, 1), (15, 13, 15), {**sides("side"), "down": "top"}),
            el((1, 13, 1), (15, 14, 3), {"north": "side", "west": "side", "east": "side", "up": "top",
                                         "south": {"tex": "top", "uv": [3, 3, 13, 4]}}),
            el((1, 13, 13), (15, 14, 15), {"south": "side", "west": "side", "east": "side", "up": "top",
                                           "north": {"tex": "top", "uv": [3, 3, 13, 4]}}),
            el((1, 13, 3), (3, 14, 13), {"west": "side", "up": "top", "east": {"tex": "top", "uv": [3, 3, 13, 4]}}),
            el((13, 13, 3), (15, 14, 13), {"east": "side", "up": "top", "west": {"tex": "top", "uv": [3, 3, 13, 4]}}),
            el((3, 13, 3), (13, 13, 13), {"up": "blood"}, emit=emit, shade=bool(used)),
        ]
        ov = {"north": "runes_front", "south": "runes", "west": "runes", "east": "runes"}
        els += overlay_planes((3, 4, 3), (13, 11, 13), ov, emit=emit)
        els += overlay_planes((1, 0, 1), (15, 4, 15), ov, emit=emit)
        return model("altar_of_trials_used" if used else "altar_of_trials", T_, els)

    m_u = build(False)
    m_d = build(True)
    variants = {}
    for facing in FACING_Y:
        variants[f"facing={facing},used=false"] = facing_variant(m_u, facing)
        variants[f"facing={facing},used=true"] = facing_variant(m_d, facing)
    blockstate("altar_of_trials", variants)
    item_def("altar_of_trials", m_u)


# =============================================================================================
# 11. Cursed idol
# =============================================================================================

def gen_cursed_idol():
    M = IDOL
    # side elevation: head rows 0..6 (x4..11), torso rows 7..12 (x5..10), base rows 13..15 (x2..13)
    s = img(16, fill=M[3])
    grain(s, 0, 0, 15, 15, M, 3, seed=1101, density=0.12)
    vline(s, 4, 0, 6, M[5]); vline(s, 11, 0, 6, M[1]); hline(s, 4, 11, 0, M[5]); hline(s, 4, 11, 6, M[1])
    rect(s, 5, 7, 10, 12, M[2]); vline(s, 5, 7, 12, M[4]); vline(s, 10, 7, 12, M[1]); hline(s, 5, 10, 7, M[0])
    # carved ear / arm
    rect(s, 7, 2, 8, 4, M[1]); px(s, 7, 2, M[0]); px(s, 8, 4, M[4])
    vline(s, 7, 9, 12, M[1]); px(s, 8, 12, M[4])
    # moss / curse veins
    for (x, y, c) in ((5, 0, MOSS[2]), (6, 0, MOSS[1]), (4, 1, MOSS[2]), (10, 5, MOSS[1]), (9, 6, MOSS[2]),
                      (6, 10, MOSS[1]), (9, 11, MOSS[2]), (10, 12, MOSS[1])):
        px(s, x, y, c)
    rect(s, 0, 13, 15, 15, M[2]); hline(s, 0, 15, 13, M[4]); hline(s, 0, 15, 15, M[1])
    for x in range(1, 15, 3):
        px(s, x, 14, M[0])
    for (x, y) in ((3, 14), (4, 15), (11, 13), (12, 14)):
        px(s, x, y, MOSS[2])
    side = block_tex("cursed_idol_side", s)

    fr = s.copy()
    # head front rows 0..6, x4..11: heavy brow, deep sockets, long nose, grim slit mouth
    face = [
        "hhhhhhhh",
        "hBBBBBBs",
        "sEEnNEEs",
        "sEEnNEEs",
        "m.cnNc.m",
        "mOOOOOOm",
        "mhtmmthm",
    ]
    from_map(face, {"h": M[5], "B": M[4], "s": M[2], "E": M[0], "n": M[5], "N": M[3], "c": M[2],
                    "m": M[2], "O": M[0], "t": M[4], ".": M[3]}, fr, 4, 0)
    vline(fr, 11, 1, 6, M[1])
    # torso: arms folded around a carved orb
    rect(fr, 5, 7, 10, 12, M[2]); vline(fr, 5, 8, 12, M[4]); vline(fr, 10, 8, 12, M[1]); hline(fr, 5, 10, 7, M[0])
    orb = [".aa.", "abba", "abba", ".aa."]
    from_map(orb, {"a": M[4], "b": MOSS[2]}, fr, 6, 8)
    px(fr, 6, 12, M[4]); px(fr, 9, 12, M[4])
    # violet tear-veins weeping from the sockets
    for (x, y, c) in ((5, 4, MOSS[3]), (5, 5, MOSS[2]), (5, 6, MOSS[1]), (10, 4, MOSS[3]), (10, 5, MOSS[2]),
                      (6, 7, MOSS[1])):
        px(fr, x, y, c)
    front = block_tex("cursed_idol_front", fr)

    t = img(16, fill=M[3])
    grain(t, 0, 0, 15, 15, M, 3, seed=1102, density=0.12)
    outline_rect(t, 2, 2, 13, 13, M[4], M[1])
    outline_rect(t, 4, 4, 11, 11, M[5], M[1])
    for x in range(5, 11, 2):
        vline(t, x, 5, 10, M[2])
    for (x, y) in ((3, 3), (12, 12), (6, 6), (9, 8), (2, 9)):
        px(t, x, y, MOSS[2])
    top = block_tex("cursed_idol_top", t)

    eyes = []
    for f in range(6):
        a = img(16)
        o = (0, 1, 1, 0, -1, -1)[f]
        for (x, y, l) in ((5, 2, 2), (6, 2, 2), (5, 3, 2), (6, 3, 4), (9, 2, 2), (10, 2, 2), (9, 3, 4), (10, 3, 2)):
            px(a, x, y, VIO[max(1, min(5, l + o + 1))])
        for (x, y, l) in ((5, 4, 1), (10, 4, 1), (5, 5, 0), (10, 5, 0)):
            px(a, x, y, VIO[max(1, min(5, l + o + 1))])
        eyes.append(a)
    eyes_t = block_tex("cursed_idol_eyes", eyes, frametime=5, interpolate=True)

    def build(used):
        T_ = {"particle": side, "side": side, "front": front, "top": top, "eyes": eyes_t}
        els = [
            el((2, 0, 2), (14, 3, 14), {**sides("side"), "up": "top", "down": {"tex": "top", "cull": "down"}}),
            el((5, 3, 5), (11, 9, 11), {"north": "front", "south": "side", "west": "side", "east": "side"}),
            el((4, 9, 4), (12, 16, 12), {"north": "front", "south": "side", "west": "side", "east": "side",
                                         "up": "top", "down": "top"}),
            # crude horns: out, then up
            el((2, 13, 7), (4, 14, 9), {"north": {"tex": "side", "uv": [0, 2, 2, 3]}, "south": {"tex": "side", "uv": [0, 2, 2, 3]},
                                        "up": {"tex": "side", "uv": [0, 2, 2, 4]}, "down": {"tex": "side", "uv": [0, 2, 2, 4]},
                                        "west": {"tex": "side", "uv": [0, 2, 2, 3]}}),
            el((2, 14, 7), (3, 17, 9), {"north": {"tex": "side", "uv": [1, 0, 2, 3]}, "south": {"tex": "side", "uv": [1, 0, 2, 3]},
                                        "west": {"tex": "side", "uv": [0, 0, 2, 3]}, "east": {"tex": "side", "uv": [0, 0, 2, 3]},
                                        "up": {"tex": "side", "uv": [0, 0, 1, 2]}}),
            el((12, 13, 7), (14, 14, 9), {"north": {"tex": "side", "uv": [14, 2, 16, 3]}, "south": {"tex": "side", "uv": [14, 2, 16, 3]},
                                          "up": {"tex": "side", "uv": [14, 2, 16, 4]}, "down": {"tex": "side", "uv": [14, 2, 16, 4]},
                                          "east": {"tex": "side", "uv": [14, 2, 16, 3]}}),
            el((13, 14, 7), (14, 17, 9), {"north": {"tex": "side", "uv": [14, 0, 15, 3]}, "south": {"tex": "side", "uv": [14, 0, 15, 3]},
                                          "west": {"tex": "side", "uv": [14, 0, 16, 3]}, "east": {"tex": "side", "uv": [14, 0, 16, 3]},
                                          "up": {"tex": "side", "uv": [15, 0, 16, 2]}}),
        ]
        if not used:
            els += overlay_planes((4, 9, 4), (12, 16, 12), {"north": "eyes"})
        else:
            del T_["eyes"]
        return model("cursed_idol_used" if used else "cursed_idol", T_, els)

    m_u = build(False)
    m_d = build(True)
    variants = {}
    for facing in FACING_Y:
        variants[f"facing={facing},used=false"] = facing_variant(m_u, facing)
        variants[f"facing={facing},used=true"] = facing_variant(m_d, facing)
    blockstate("cursed_idol", variants)
    item_def("cursed_idol", m_u)


# =============================================================================================
# 12. Soul brazier
# =============================================================================================

def gen_soul_brazier():
    I, R = IRON, RUST
    a = img(16, fill=I[3])
    # rows 0..1: rim top strip; rows 2..3: inner wall (sooty); rows 4..8 bowl outside;
    # rows 8..14 stem; rows 14..15 foot.
    hline(a, 0, 15, 0, I[6]); hline(a, 0, 15, 1, I[4])
    hline(a, 0, 15, 2, I[1]); hline(a, 0, 15, 3, I[0])
    for x in (2, 7, 12):
        px(a, x, 2, SOUL[0]); px(a, x + 1, 3, I[1])
    hline(a, 0, 15, 4, I[6]); hline(a, 0, 15, 5, I[4]); hline(a, 0, 15, 6, I[3]); hline(a, 0, 15, 7, I[2])
    hline(a, 0, 15, 8, I[1])
    for x in range(1, 16, 3):  # rivets on the band
        px(a, x, 6, I[6]); px(a, x, 7, I[1])
    for (x, y) in ((4, 7), (9, 5), (13, 6)):
        px(a, x, y, R[2])
    # stem: twisted bar
    for y in range(8, 14):
        for x in range(16):
            ph = (x + y) % 3
            px(a, x, y, (I[5], I[3], I[2])[ph])
    # foot
    hline(a, 0, 15, 14, I[5]); hline(a, 0, 15, 15, I[2])
    for x in (5, 10):
        px(a, x, 15, R[1])
    iron = block_tex("soul_brazier_iron", a)

    # Charcoal lumps (Voronoi cells around hand-placed centres) with soul-fire glowing in the
    # cracks between them; a few lumps are hot all the way through.
    centres = [(4, 4), (8, 3), (12, 4), (6, 7), (10, 7), (3, 9), (7, 11), (12, 11), (9, 13), (4, 13), (13, 8)]
    hot = {3}
    charcoal = [C("#0b141a"), C("#13232d"), C("#1d3442")]
    em = []
    for f in range(4):
        e = img(16, fill=charcoal[0])
        for y in range(16):
            for x in range(16):
                ds = sorted((math.hypot(x + 0.5 - cx - 0.5, y + 0.5 - cy - 0.5), i) for i, (cx, cy) in enumerate(centres))
                (d0, i0), (d1, i1) = ds[0], ds[1]
                if d1 - d0 < 0.6:  # crack between two lumps
                    flick = (i0 * 3 + i1 * 5 + f) % 4
                    e[y, x] = SOUL[3] if flick else SOUL[4]
                    if d1 - d0 < 0.2 and (i0 + i1 + f) % 3 == 0:
                        e[y, x] = SOUL[5]
                elif i0 in hot:
                    e[y, x] = SOUL[2] if d0 > 1.0 else SOUL[3 + (f % 2)]
                else:
                    # top-left lit facet on each lump
                    cx, cy = centres[i0]
                    lit = (x < cx and y < cy)
                    e[y, x] = charcoal[2] if lit and d0 < 1.6 else (charcoal[1] if d0 < 1.6 else charcoal[0])
        em.append(e)
    embers = block_tex("soul_brazier_embers", em, frametime=4, interpolate=True)

    T_ = {"particle": iron, "iron": iron, "embers": embers, "fire": "minecraft:block/soul_fire_0"}
    rim = {"tex": "iron", "uv": [0, 0, 16, 1]}
    inner = {"tex": "iron", "uv": [0, 2, 16, 4]}

    def wall(f, t, outer, inside):
        faces = {outer: {"tex": "iron", "uv": [f[0] if outer in ("north", "south") else f[2], 4,
                                              t[0] if outer in ("north", "south") else t[2], 7]},
                 "up": {"tex": "iron", "uv": [0, 0, 16, 1] if outer in ("north", "south") else [0, 0, 1, 16]}}
        faces[inside] = {"tex": "iron", "uv": [0, 2, 12, 4]}
        return faces

    els = [
        el((5, 0, 5), (11, 2, 11), {**{s_: {"tex": "iron", "uv": [5, 14, 11, 16]} for s_ in SIDES},
                                    "up": {"tex": "iron", "uv": [5, 0, 11, 6]}, "down": {"tex": "iron", "uv": [5, 0, 11, 6], "cull": "down"}}),
        el((6.5, 2, 6.5), (9.5, 8, 9.5), {s_: {"tex": "iron", "uv": [6, 8, 9, 14]} for s_ in SIDES}),
        el((2, 8, 2), (14, 9, 14), {**{s_: {"tex": "iron", "uv": [2, 8, 14, 9]} for s_ in SIDES},
                                    "down": {"tex": "iron", "uv": [2, 2, 14, 14]}}),
        el((2, 9, 2), (14, 12, 3), {"north": {"tex": "iron", "uv": [2, 4, 14, 7]}, "south": inner, "up": rim,
                                    "west": {"tex": "iron", "uv": [0, 4, 1, 7]}, "east": {"tex": "iron", "uv": [0, 4, 1, 7]}}),
        el((2, 9, 13), (14, 12, 14), {"south": {"tex": "iron", "uv": [2, 4, 14, 7]}, "north": inner, "up": rim,
                                      "west": {"tex": "iron", "uv": [0, 4, 1, 7]}, "east": {"tex": "iron", "uv": [0, 4, 1, 7]}}),
        el((2, 9, 3), (3, 12, 13), {"west": {"tex": "iron", "uv": [3, 4, 13, 7]}, "east": {"tex": "iron", "uv": [0, 2, 10, 4]},
                                    "up": {"tex": "iron", "uv": [0, 0, 10, 1]}}),
        el((13, 9, 3), (14, 12, 13), {"east": {"tex": "iron", "uv": [3, 4, 13, 7]}, "west": {"tex": "iron", "uv": [0, 2, 10, 4]},
                                      "up": {"tex": "iron", "uv": [0, 0, 10, 1]}}),
        # corner claws
        el((1.5, 11, 1.5), (3, 13, 3), {**{s_: {"tex": "iron", "uv": [0, 4, 1.5, 6]} for s_ in SIDES}, "up": rim}),
        el((13, 11, 1.5), (14.5, 13, 3), {**{s_: {"tex": "iron", "uv": [0, 4, 1.5, 6]} for s_ in SIDES}, "up": rim}),
        el((1.5, 11, 13), (3, 13, 14.5), {**{s_: {"tex": "iron", "uv": [0, 4, 1.5, 6]} for s_ in SIDES}, "up": rim}),
        el((13, 11, 13), (14.5, 13, 14.5), {**{s_: {"tex": "iron", "uv": [0, 4, 1.5, 6]} for s_ in SIDES}, "up": rim}),
        el((3, 10, 3), (13, 10, 13), {"up": {"tex": "embers", "uv": [3, 3, 13, 13]}}, emit=15, shade=False),
        el((2, 10, 8), (14, 22, 8), {"north": {"tex": "fire", "uv": [0, 0, 16, 16]}, "south": {"tex": "fire", "uv": [0, 0, 16, 16]}},
           rot=rot_y45((8, 8, 8), rescale=True), emit=15, shade=False),
        el((8, 10, 2), (8, 22, 14), {"west": {"tex": "fire", "uv": [0, 0, 16, 16]}, "east": {"tex": "fire", "uv": [0, 0, 16, 16]}},
           rot=rot_y45((8, 8, 8), rescale=True), emit=15, shade=False),
    ]
    mid = model("soul_brazier", T_, els, ao=False)
    blockstate("soul_brazier", {"": {"model": mid}})
    item_def("soul_brazier", mid)


# =============================================================================================
# 13. Rune stone
# =============================================================================================

SIDE_PATH = [  # glowing channel traced through the carved band (hand-placed, rows 2..11)
    (1, 3), (2, 3), (3, 3), (4, 3), (5, 3), (6, 3), (7, 3), (8, 3),
    (8, 4), (8, 5), (9, 5), (10, 5), (11, 5), (12, 5), (13, 5), (14, 5),
    (14, 6), (14, 7), (14, 8), (14, 9), (13, 9), (12, 9), (12, 10), (12, 11), (11, 11), (10, 11), (9, 11),
    (8, 11), (7, 11), (6, 11), (6, 10), (6, 9), (5, 9), (4, 9), (3, 9), (2, 9), (1, 9), (0, 9),
]
SIDE_NODES = [(2, 4), (2, 5), (2, 6), (2, 7), (3, 7), (4, 7), (5, 7), (6, 6)]
TOP_PATH = (
    [(x, 12) for x in range(4, 12)] + [(12, y) for y in range(11, 3, -1)] + [(x, 3) for x in range(12, 2, -1)]
    + [(3, y) for y in range(4, 11)] + [(x, 10) for x in range(4, 10)] + [(9, y) for y in range(9, 4, -1)]
    + [(x, 5) for x in range(8, 5, -1)] + [(6, 6), (6, 7), (6, 8)]
)


def flow_frames(path, extra, nframes=8, speed=1.0):
    frames = []
    n = len(path)
    for f in range(nframes):
        a = img(16)
        for i, (x, y) in enumerate(path):
            w = 0.5 + 0.5 * math.cos(2 * math.pi * (i / n * 3.0 - f / nframes))
            lvl = 2 + int(round(w * 2.0))
            px(a, x, y, SOUL[lvl])
        for (x, y) in extra:
            px(a, x, y, SOUL[3 if f % 2 == 0 else 2])
        frames.append(a)
    return frames


def gen_rune_stone():
    side = flow_frames(SIDE_PATH, SIDE_NODES)
    top = flow_frames(TOP_PATH, [])
    gs = block_tex("rune_stone_glow", side, frametime=4, interpolate=True)
    gt = block_tex("rune_stone_glow_top", top, frametime=4, interpolate=True)
    T_ = {"particle": "minecraft:block/chiseled_tuff", "side": "minecraft:block/chiseled_tuff",
          "end": "minecraft:block/chiseled_tuff_top", "glow": gs, "glow_top": gt}
    els = [el((0, 0, 0), (16, 16, 16), {**sides("side"), "up": "end", "down": "end"}, cull=True),
           el((-0.01, -0.01, -0.01), (16.01, 16.01, 16.01),
              {**{s_: {"tex": "glow", "cull": s_} for s_ in SIDES},
               "up": {"tex": "glow_top", "cull": "up"}, "down": {"tex": "glow_top", "cull": "down"}},
              uvbox=((0, 0, 0), (16, 16, 16)), emit=15, shade=False)]
    mid = model("rune_stone", T_, els)
    blockstate("rune_stone", {"": {"model": mid}})
    item_def("rune_stone", mid)


# =============================================================================================
# Particles
# =============================================================================================

def part_tex(name, a):
    save_png(f"textures/particle/{name}.png", a)
    return f"{MOD}:{name}"


def particle_json(pid, sprite_ids):
    save_json(f"particles/{pid}.json", {"textures": sprite_ids})


def glow_glyph(glyph, core, halo, ox=2, oy=1):
    a = img(8)
    for y, r in enumerate(glyph):
        for x, ch in enumerate(r):
            if ch == "#":
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    xx, yy = ox + x + dx, oy + y + dy
                    if 0 <= xx < 8 and 0 <= yy < 8 and a[yy, xx, 3] == 0:
                        a[yy, xx] = halo
    for y, r in enumerate(glyph):
        for x, ch in enumerate(r):
            if ch == "#":
                px(a, ox + x, oy + y, core)
    return a


def disc(size, radius_cols, cx=3.5, cy=3.5):
    """radius_cols: list of (radius, colour) from outside in."""
    a = img(size)
    for y in range(size):
        for x in range(size):
            r = math.hypot(x + 0.5 - (cx + 0.5), y + 0.5 - (cy + 0.5))
            for rad, col in radius_cols:
                if r <= rad:
                    a[y, x] = col
    return a


def star(size, arm, core, mid, tip, cx=3, cy=3, diag=None):
    a = img(size)
    for i in range(1, arm + 1):
        c = mid if i < arm else tip
        for dx, dy in ((i, 0), (-i, 0), (0, i), (0, -i)):
            px(a, cx + dx, cy + dy, c)
    if diag:
        for dx, dy in ((1, 1), (-1, 1), (1, -1), (-1, -1)):
            px(a, cx + dx, cy + dy, diag)
    px(a, cx, cy, core)
    return a


def gen_particles():
    # rune_glyph
    glyphs = [
        ["#.#", "##.", "#..", "#..", "#.."],
        ["#.#", "###", ".#.", ".#."],
        ["..#", ".#.", "#.#", ".#.", "#.."],
        [".#.", "#.#", ".#.", "#.#"],
    ]
    ids = []
    for i, g in enumerate(glyphs):
        oy = 1 if len(g) == 5 else 2
        ids.append(part_tex(f"rune_glyph_{i}", glow_glyph(g, C("#e6fcff"), C("#8fe6ff", 120), ox=2, oy=oy)))
    particle_json("rune_glyph", ids)

    # rift_mote: shrinking violet motes
    specs = [
        [(3.6, C("#a46ad8", 90)), (2.9, C("#c99bf5", 190)), (2.0, C("#e2c8ff")), (1.0, C("#ffffff"))],
        [(2.9, C("#a46ad8", 90)), (2.1, C("#c99bf5", 200)), (1.2, C("#e2c8ff")), (0.6, C("#ffffff"))],
        [(2.1, C("#c99bf5", 150)), (1.3, C("#e2c8ff")), (0.6, C("#ffffff"))],
        [(1.3, C("#c99bf5", 160)), (0.8, C("#f6ecff"))],
    ]
    particle_json("rift_mote", [part_tex(f"rift_mote_{i}", disc(8, s)) for i, s in enumerate(specs)])

    # loot_glint: gold twinkle
    lg = [
        star(8, 1, C("#ffffff"), GOLD[5], GOLD[4], 3, 3),
        star(8, 2, C("#ffffff"), GOLD[5], GOLD[4], 3, 3, diag=C("#f2c94c", 150)),
        star(8, 3, C("#ffffff"), C("#fff8d8"), GOLD[4], 3, 3, diag=GOLD[5]),
        star(8, 2, GOLD[5], GOLD[4], GOLD[3], 3, 3),
    ]
    particle_json("loot_glint", [part_tex(f"loot_glint_{i}", a) for i, a in enumerate(lg)])

    # blood_mote
    b0 = from_map(["........", "...aa...", "..abba..", "..bccb..", "..abbd..", "...dd...", "........", "........"],
                  {"a": C("#ff5c6e"), "b": C("#ff5c6e"), "c": C("#ff9aa6"), "d": C("#c8283e")}, img(8))
    px(b0, 3, 2, C("#ffd0d6"))
    b1 = from_map(["........", "........", "...ab...", "..abbd..", "...dd...", "........", "........", "........"],
                  {"a": C("#ff9aa6"), "b": C("#ff5c6e"), "d": C("#c8283e")}, img(8))
    particle_json("blood_mote", [part_tex("blood_mote_0", b0), part_tex("blood_mote_1", b1)])

    # bleed_drip
    dpal = {"a": C("#d8384c"), "b": C("#ff5c6e"), "c": C("#ff9aa6"), "d": C("#a8182f")}
    d0 = from_map(["...a....", "...a....", "..aba...", "..bcb...", ".bbcbb..", ".bbbbd..", "..ddd...", "........"],
                  dpal, img(8))
    px(d0, 2, 4, C("#ffd0d6"))
    d1 = from_map(["........", "........", "...a....", "..aba...", "..bcb...", "..bbd...", "...d....", "........"],
                  dpal, img(8))
    particle_json("bleed_drip", [part_tex("bleed_drip_0", d0), part_tex("bleed_drip_1", d1)])

    # curse_mote: purple wisps
    cw = [  # twisted smoke tendrils (bright tip, fading tail)
        ["....a...", "...ab...", "..bbc...", "..bc....", "...cc...", "....cd..", ".....d..", "........"],
        ["...a....", "...ba...", "...cbb..", "....cb..", "...cc...", "..dc....", "..d.....", "........"],
        ["........", "........", "...ab...", "...bc...", "....cd..", "....d...", "........", "........"],
    ]
    cpal = {"a": C("#ffffff"), "b": VIO[5], "c": C("#dcbcff"), "d": C("#c99bf5", 160)}
    particle_json("curse_mote", [part_tex(f"curse_mote_{i}", from_map(m, cpal, img(8))) for i, m in enumerate(cw)])

    # soul_ember: shrinking cyan ember
    se = [
        [(2.6, C("#56d8ff", 140)), (1.9, SOUL[4]), (1.1, C("#e6fcff")), (0.5, SOUL[5])],
        [(2.0, C("#56d8ff", 140)), (1.4, SOUL[4]), (0.8, C("#e6fcff"))],
        [(1.4, C("#56d8ff", 150)), (0.8, C("#e6fcff"))],
        [(0.8, SOUL[4])],
    ]
    particle_json("soul_ember", [part_tex(f"soul_ember_{i}", disc(8, s)) for i, s in enumerate(se)])

    # bone_shard
    bpal = {"a": BONE[4], "b": BONE[3], "c": BONE[2], "d": BONE[1]}
    bs = [
        ["........", "........", "..ab....", "..bbc...", "...ccd..", "....d...", "........", "........"],
        ["........", "........", "...a....", "..abc...", "...bc...", "...cd...", "........", "........"],
        ["........", "........", "........", ".aabbc..", "..ccdd..", "........", "........", "........"],
    ]
    particle_json("bone_shard", [part_tex(f"bone_shard_{i}", from_map(m, bpal, img(8))) for i, m in enumerate(bs)])

    # arc_spark
    apal = {"w": C("#ffffff"), "c": SOUL[4], "h": C("#56d8ff", 170)}
    ar = [
        ["....hc..", "...hw...", "..hwch..", "...cwh..", "..hwc...", ".hw.....", ".c......", "........"],
        [".c......", "..w...c.", "..cw.hw.", "...wcw..", "...hwh..", "..hw....", "..c.....", "........"],
    ]
    particle_json("arc_spark", [part_tex(f"arc_spark_{i}", from_map(m, apal, img(8))) for i, m in enumerate(ar)])

    # summon_swirl: rotating wisp
    sw = []
    for f in range(4):
        a = img(8)
        for i in range(10):
            ang = f * math.pi / 2 + i * 0.55
            r = 0.6 + i * 0.28
            x = int(math.floor(3.5 + r * math.cos(ang) + 0.5))
            y = int(math.floor(3.5 + r * math.sin(ang) + 0.5))
            c = SOUL[5] if i < 2 else (C("#e6fcff") if i < 5 else (SOUL[4] if i < 8 else C("#56d8ff", 160)))
            if 0 <= x < 8 and 0 <= y < 8 and a[y, x, 3] == 0:
                a[y, x] = c
        sw.append(a)
    particle_json("summon_swirl", [part_tex(f"summon_swirl_{i}", a) for i, a in enumerate(sw)])

    # dust_mote
    dm = []
    a = img(8); px(a, 3, 3, C("#e6e0d2", 220))
    for (x, y) in ((2, 3), (4, 3), (3, 2), (3, 4)):
        px(a, x, y, C("#d8d2c4", 80))
    dm.append(a)
    a = img(8); rect(a, 3, 3, 4, 4, C("#e6e0d2", 200))
    for (x, y) in ((2, 3), (5, 4), (3, 2), (4, 5)):
        px(a, x, y, C("#d8d2c4", 70))
    dm.append(a)
    a = img(8); px(a, 3, 3, C("#ece6d8", 180))
    dm.append(a)
    particle_json("dust_mote", [part_tex(f"dust_mote_{i}", m) for i, m in enumerate(dm)])

    # spark (white, tinted in code)
    W, L1, L2 = C("#ffffff"), C("#e4e4e4"), C("#bdbdbd")
    sp = [star(8, 1, W, L1, L2), star(8, 2, W, L1, L2, diag=C("#cfcfcf", 150)), star(8, 3, W, W, L1, diag=L2),
          star(8, 2, L1, L2, C("#9a9a9a"))]
    sids = [part_tex(f"spark_{i}", a) for i, a in enumerate(sp)]
    for rarity in ("uncommon", "rare", "epic", "legendary"):
        particle_json(f"spark_{rarity}", sids)

    # shock_ring: small white puff
    puff = disc(8, [(3.6, C("#ffffff", 90)), (2.8, C("#ffffff", 170)), (1.8, C("#ffffff", 235))])
    particle_json("shock_ring", [part_tex("shock_ring", puff)])


# =============================================================================================
# Entity-effect textures
# =============================================================================================

def gen_entity_effects():
    # ring
    n = 64
    a = img(n)
    c = n / 2
    for y in range(n):
        for x in range(n):
            r = math.hypot(x + 0.5 - c, y + 0.5 - c)
            al = math.exp(-((r - 29.5) / 1.6) ** 2)
            ang = math.atan2(y + 0.5 - c, x + 0.5 - c)
            # dashed rune band just inside the ring
            if 24.5 <= r <= 26.5:
                seg = (ang + math.pi) / (2 * math.pi) * 24
                k = int(seg) % 3
                fr = seg - int(seg)
                if (k == 0 and fr < 0.7) or (k == 1 and 0.3 < fr < 0.5) or (k == 2 and (fr < 0.2 or 0.6 < fr < 0.8)):
                    al = max(al, 0.55 if 25 <= r <= 26 else 0.3)
            if r > 31.5:
                al = 0
            a[y, x] = (255, 255, 255, int(round(255 * min(1, al))))
    save_png("textures/entity/telegraph/ring.png", a)

    f = img(n)
    for y in range(n):
        for x in range(n):
            r = math.hypot(x + 0.5 - c, y + 0.5 - c)
            if r <= 31.0:
                t = r / 31.0
                al = 0.40 + 0.45 * t ** 2.2
            elif r <= 32:
                al = 0.85 * (32 - r)
            else:
                al = 0
            f[y, x] = (255, 255, 255, int(round(255 * al)))
    save_png("textures/entity/telegraph/fill.png", f)

    ln = img(32)
    for y in range(32):
        for x in range(32):
            al = 0.30
            if x in (0, 1, 30, 31):
                al = 1.0
            elif x in (2, 29):
                al = 0.6
            # chevrons pointing up (period 16 rows -> tiles vertically)
            yy = y % 16
            d = abs(x + 0.5 - 16)
            v = (yy - 3) - d * 0.6
            if 0 <= v < 2.2 and d < 11:
                al = max(al, 0.85)
            ln[y, x] = (255, 255, 255, int(round(255 * al)))
    save_png("textures/entity/telegraph/line.png", ln)

    save_png("textures/entity/telegraph/white.png", img(4, fill=(255, 255, 255, 255)))

    b = img(16)
    for y in range(16):
        for x in range(16):
            dx, dy = x + 0.5 - 8, y + 0.5 - 8
            r = math.hypot(dx, dy)
            ang = math.atan2(dy, dx)
            flick = 0.9 * math.sin(ang * 5) + 0.5 * math.sin(ang * 3 + 1)
            if r <= 2.0:
                col = C("#ffffff")
            elif r <= 3.3:
                col = SOUL[4]
            elif r <= 4.8:
                col = SOUL[3]
            elif r <= 6.0 + flick * 0.8:
                col = SOUL[2]
            elif r <= 7.2 + flick:
                col = C("#1b4f6b", 150)
            else:
                col = T
            b[y, x] = col
    save_png("textures/entity/soul_bolt.png", b)


# =============================================================================================
# GUI sprites
# =============================================================================================

def outlined(rows, pal):
    """9x9 sprite from a char map, then add a 1px dark outline around every opaque pixel."""
    a = from_map(rows, pal, img(9))
    out = a.copy()
    for y in range(9):
        for x in range(9):
            if a[y, x, 3] == 0:
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)):
                    xx, yy = x + dx, y + dy
                    if 0 <= xx < 9 and 0 <= yy < 9 and a[yy, xx, 3] > 0:
                        out[y, x] = OUTLINE
                        break
    return out


def gen_gui():
    hud = "textures/gui/sprites/hud/"
    sprites = {
        "objective_explore": ([
            ".........",
            ".........",
            "..wwwww..",
            ".wwbbbww.",
            "wwbkkcbww",
            ".wwbbbww.",
            "..wwwww..",
            ".........",
            ".........",
        ], {"w": C("#e8e2d0"), "b": SOUL[3], "k": C("#0d2633"), "c": C("#ffffff")}),
        "objective_clear": ([
            ".s.....s.",
            "..s...s..",
            "...s.s...",
            "....s....",
            "...s.s...",
            ".gg...gg.",
            ".hg...gh.",
            "h.......h",
            ".........",
        ], {"s": C("#d8dce4"), "g": GOLD[4], "h": C("#6b4a2a")}),
        "objective_descend": ([
            "...lvv...",
            "...lvv...",
            ".llvvvvp.",
            "..lvvvp..",
            "...lvp...",
            "....p....",
            ".........",
            ".ddkkkdd.",
            "..ddddd..",
        ], {"l": VIO[4], "v": VIO[3], "p": VIO[2], "d": VIO[2], "k": VIO[5]}),
        "objective_boss": ([
            "..bbbbb..",
            ".bbbbbbb.",
            ".beebeeb.",
            ".beebeeb.",
            ".bbbnbbb.",
            "..bbbbb..",
            "..btbtb..",
            ".........",
            ".........",
        ], {"b": C("#e8e2d0"), "e": BLOOD[3], "n": C("#5a5040"), "t": C("#a89c80")}),
        "objective_extract": ([
            "....c....",
            "...cwc...",
            "...sss...",
            "..sbrbs..",
            "..sbrbs..",
            "..sbbbs..",
            "..sbrbs..",
            ".sssssss.",
            ".........",
        ], {"c": SOUL[3], "w": C("#ffffff"), "s": PALE[5], "b": PALE[3], "r": SOUL[3]}),
        "unsecured": ([
            ".......r.",
            "..k....r.",
            ".kbk...r.",
            "..s......",
            ".sbbs..r.",
            "sbbbbs...",
            "sbbbbs...",
            ".ssss....",
            ".........",
        ], {"k": C("#5a3a20"), "b": C("#a8783f"), "s": C("#7a5228"), "r": C("#ff4a5e")}),
        "party": ([
            ".........",
            ".bb...gg.",
            "bbbb.gggg",
            "bbbb.gggg",
            ".bb...gg.",
            ".........",
            "bbbb.gggg",
            "bbbb.gggg",
            ".........",
        ], {"b": SOUL[3], "g": GOLD[4]}),
        "floor": ([
            "hh.......",
            "dd.......",
            "ddhh.....",
            "dddd.....",
            "ddddhh...",
            "dddddd...",
            "ddddddhh.",
            "dddddddd.",
            ".........",
        ], {"h": PALE[6], "d": PALE[3]}),
    }
    for name, (rows, pal) in sprites.items():
        save_png(hud + name + ".png", outlined(rows, pal))

    # 9-slice panel
    p = img(32, fill=C("#0c0b12", 205))
    for y in range(32):
        for x in range(32):
            if x in (0, 31) or y in (0, 31):
                p[y, x] = C("#05050a", 230)
            elif x in (1, 30) or y in (1, 30):
                p[y, x] = C("#2f8fb8", 235)
            elif x in (2, 29) or y in (2, 29):
                p[y, x] = C("#16151f", 220)
    for (cx, cy) in ((1, 1), (30, 1), (1, 30), (30, 30)):
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                if abs(dx) + abs(dy) <= 1:
                    px(p, cx + dx, cy + dy, GOLD[4] if dx == 0 and dy == 0 else GOLD[3])
    for (cx, cy) in ((2, 2), (29, 2), (2, 29), (29, 29)):
        px(p, cx, cy, GOLD[2])
    save_png(hud + "panel.png", p)
    save_json(hud + "panel.png.mcmeta", {"gui": {"scaling": {"type": "nine_slice", "width": 32, "height": 32,
                                                             "border": 4}}})


# =============================================================================================
# Mod icon
# =============================================================================================

def gen_icon():
    n = 32
    a = img(n)
    D = DARK
    # arch silhouette: outer radius 13 around (16, 14), legs down to row 29
    for y in range(n):
        for x in range(n):
            dx = x + 0.5 - 16
            dy = y + 0.5 - 14
            if y < 14:
                r = math.hypot(dx, dy)
                outer = r <= 14.0
                inner = r <= 9.5
            else:
                outer = abs(dx) <= 14.0 and y <= 29
                inner = abs(dx) <= 9.5 and y <= 29
            if outer and not inner:
                a[y, x] = D[4]
            elif inner:
                rr = math.hypot(dx, (y + 0.5 - 17) * 0.85)
                th = math.atan2(y + 0.5 - 17, dx)
                arm = (0.5 + 0.5 * math.cos(3 * th + 0.55 * rr)) ** 1.5
                v = 0.10 + 0.85 * arm * smoothstep(1.0, 6.0, rr) + 0.05
                v *= 1.0 - 0.35 * smoothstep(8, 12, rr)
                a[y, x] = ramp_at(VIO[:6], v)
    # voussoir joints + shading on the arch stones
    for k in range(9):
        ang = math.pi + k * math.pi / 8
        for t_ in np.linspace(9.6, 13.9, 6):
            x = int(16 + t_ * math.cos(ang))
            y = int(14 + t_ * math.sin(ang))
            if y < 14:
                px(a, x, y, D[1])
    for y in range(n):
        for x in range(n):
            if tuple(a[y, x]) == D[4]:
                if x < 16 and (y < 14 or x < 4):
                    a[y, x] = D[5] if (x + y) % 5 else D[4]
                elif x > 16 and (y < 14 or x > 27):
                    a[y, x] = D[3]
    for y in range(15, 30, 4):
        hline(a, 2, 6, y, D[1]); hline(a, 25, 29, y, D[1])
    # keystone (gold)
    rect(a, 14, 0, 17, 4, GOLD[3]); hline(a, 14, 17, 0, GOLD[5]); vline(a, 14, 0, 4, GOLD[4]); vline(a, 17, 1, 4, GOLD[2])
    px(a, 15, 2, VIO[4]); px(a, 16, 2, VIO[3])
    # base step
    rect(a, 0, 29, 31, 31, D[3]); hline(a, 0, 31, 29, GOLD[3]); hline(a, 0, 31, 31, D[1]); hline(a, 0, 10, 29, GOLD[4])
    # soul-blue runes on the legs
    for (gx, gy, g) in ((3, 16, RUNES5[1]), (26, 16, RUNES5[3]), (3, 22, RUNES5[5]), (26, 22, RUNES5[0])):
        for y, r in enumerate(g):
            for x, ch in enumerate(r):
                if ch == "#":
                    px(a, gx + x, gy + y, SOUL[3] if y else SOUL[4])
    # soul skull in the vortex
    skull = [
        "..wwwww..",
        ".wwwwwww.",
        "wwwwwwwww",
        "weeewweee"[0:9],
        "weeewweee"[0:9],
        "wwwwkwwww",
        ".wwwwwww.",
        "..wtwtw..",
    ]
    skull = [
        "..wwwww..",
        ".whwwwww.",
        "whwwwwwww",
        "weewwweew",
        "weewwweew",
        "wwwwkwwww",
        ".wwwwwww.",
        "..wtwtw..",
    ]
    from_map(skull, {"w": SOUL[4], "h": C("#ffffff"), "e": VIO[0], "k": SOUL[1], "t": SOUL[2]}, a, 12, 15)
    # outline the whole emblem
    out = a.copy()
    for y in range(n):
        for x in range(n):
            if a[y, x, 3] == 0:
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    xx, yy = x + dx, y + dy
                    if 0 <= xx < n and 0 <= yy < n and a[yy, xx, 3] > 0:
                        out[y, x] = OUTLINE
                        break
    big = np.array(Image.fromarray(out, "RGBA").resize((128, 128), Image.NEAREST))
    rel = "icon.png"
    Image.fromarray(big, "RGBA").save(_write_bytes_path(rel), optimize=True)
    TEXTURES[rel] = [big]


# =============================================================================================
# Validation
# =============================================================================================

VANILLA_OK = {
    "minecraft:block/stone_bricks", "minecraft:block/cracked_stone_bricks", "minecraft:block/chiseled_tuff",
    "minecraft:block/chiseled_tuff_top", "minecraft:block/polished_deepslate", "minecraft:block/deepslate_tiles",
    "minecraft:block/polished_blackstone", "minecraft:block/soul_fire_0", "minecraft:block/iron_block",
    "minecraft:block/gold_block", "minecraft:block/tuff_bricks",
}
ALLOWED_ANGLES = {-45, -22.5, 0, 22.5, 45}


def validate():
    errors = []
    for rel in WRITTEN:
        if rel.endswith(".json") or rel.endswith(".mcmeta"):
            try:
                with open(os.path.join(OUT, rel), encoding="utf-8") as fh:
                    json.load(fh)
            except Exception as ex:  # noqa: BLE001
                errors.append(f"{rel}: invalid JSON ({ex})")
    models = {}
    for rel in WRITTEN:
        if rel.startswith("models/block/"):
            with open(os.path.join(OUT, rel), encoding="utf-8") as fh:
                models[f"{MOD}:block/" + rel[len("models/block/"):-5]] = json.load(fh)
    for mid, m in models.items():
        tex = m.get("textures", {})
        if "particle" not in tex:
            errors.append(f"{mid}: no particle texture")
        for k, v in tex.items():
            if v.startswith("#"):
                continue
            ns, path = v.split(":", 1)
            if ns == MOD:
                if not os.path.exists(os.path.join(OUT, "textures", path + ".png")):
                    errors.append(f"{mid}: missing texture {v}")
            elif v not in VANILLA_OK:
                errors.append(f"{mid}: unexpected vanilla texture {v}")
        for e in m.get("elements", []):
            for c in e["from"] + e["to"]:
                if not -16 <= c <= 32:
                    errors.append(f"{mid}: coordinate out of range {c}")
            rot = e.get("rotation")
            if rot and rot["angle"] not in ALLOWED_ANGLES:
                errors.append(f"{mid}: bad angle {rot['angle']}")
            if "light_emission" in e and not 0 <= e["light_emission"] <= 15:
                errors.append(f"{mid}: bad light_emission")
            for d, fc in e["faces"].items():
                key = fc["texture"][1:]
                if key not in tex:
                    errors.append(f"{mid}: face {d} uses undefined #{key}")
                for u in fc["uv"]:
                    if not 0 <= u <= 16:
                        errors.append(f"{mid}: uv out of range {fc['uv']}")
    for rel in WRITTEN:
        if rel.startswith("blockstates/"):
            with open(os.path.join(OUT, rel), encoding="utf-8") as fh:
                bs = json.load(fh)
            for k, v in bs["variants"].items():
                if v["model"] not in models:
                    errors.append(f"{rel}: variant {k} -> unknown model {v['model']}")
        if rel.startswith("items/"):
            with open(os.path.join(OUT, rel), encoding="utf-8") as fh:
                it = json.load(fh)
            if it["model"]["model"] not in models:
                errors.append(f"{rel}: unknown model")
        if rel.startswith("particles/"):
            with open(os.path.join(OUT, rel), encoding="utf-8") as fh:
                pj = json.load(fh)
            if not pj["textures"]:
                errors.append(f"{rel}: no sprites")
            for sid in pj["textures"]:
                if not os.path.exists(os.path.join(OUT, "textures", "particle", sid.split(":", 1)[1] + ".png")):
                    errors.append(f"{rel}: missing sprite {sid}")
    # overlays used with cutout must be binary alpha
    for rel, frames in TEXTURES.items():
        if rel.startswith("textures/block/") and "runic_seal" not in rel:
            for fr in frames:
                al = fr[:, :, 3]
                if np.any((al > 0) & (al < 255)):
                    errors.append(f"{rel}: semi-transparent pixels in a cutout texture")
                    break
    return errors


# =============================================================================================
# Contact sheet
# =============================================================================================

def contact_sheet(path, scale=8):
    entries = sorted(TEXTURES.items())
    tiles = []
    for rel, frames in entries:
        label = rel.replace("textures/", "")
        if rel in ANIMATED:
            meta = ANIMATED[rel]["animation"]
            label += f"  [{len(frames)}f t{meta['frametime']}{' i' if meta.get('interpolate') else ''}]"
        show = frames if len(frames) <= 8 else frames[:: max(1, len(frames) // 8)][:8]
        h, w = show[0].shape[:2]
        sc = scale if max(h, w) <= 16 else max(1, (scale * 16) // max(h, w) * 2)
        if max(h, w) >= 64:
            sc = 2
        tiles.append((label, show, sc))
    pad = 8
    rows_img = []
    for label, show, sc in tiles:
        h, w = show[0].shape[:2]
        tw = len(show) * (w * sc + 4) + 8
        th = h * sc + 26
        tile = Image.new("RGBA", (max(tw, 7 * len(label) + 8), th), (48, 48, 52, 255))
        d = ImageDraw.Draw(tile)
        d.text((4, 2), label, fill=(235, 235, 235, 255))
        x = 4
        for fr in show:
            im = Image.fromarray(fr, "RGBA").resize((w * sc, h * sc), Image.NEAREST)
            # checker behind to reveal transparency
            bg = Image.new("RGBA", im.size, (36, 36, 40, 255))
            cd = ImageDraw.Draw(bg)
            step = max(sc, 4)
            for yy in range(0, im.size[1], step):
                for xx in range(0, im.size[0], step):
                    if ((xx // step) + (yy // step)) % 2:
                        cd.rectangle([xx, yy, xx + step - 1, yy + step - 1], fill=(56, 56, 62, 255))
            bg.alpha_composite(im)
            tile.paste(bg, (x, 20))
            x += w * sc + 4
        rows_img.append(tile)
    # shelf packing: tiles flow left to right and wrap at a fixed sheet width
    sheet_w = 2000
    placed, x, y, shelf_h = [], pad, pad, 0
    for t in sorted(rows_img, key=lambda t: -t.size[1]):
        if x + t.size[0] + pad > sheet_w:
            x, y, shelf_h = pad, y + shelf_h + pad, 0
        placed.append((t, x, y))
        x += t.size[0] + pad
        shelf_h = max(shelf_h, t.size[1])
    sheet = Image.new("RGBA", (sheet_w, y + shelf_h + pad), (30, 30, 34, 255))
    for t, x, y in placed:
        sheet.paste(t, (x, y))
    sheet.save(path)


# =============================================================================================

def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--sheet", help="write a contact sheet PNG of all generated textures")
    args = ap.parse_args(argv)

    gen_abyssal_gate()
    gen_descent_rift()
    gen_waystone()
    gen_runic_seal()
    gen_spike_trap()
    gen_dart_trap()
    gen_crumbling()
    gen_reliquary()
    gen_burial_urn()
    gen_altar()
    gen_cursed_idol()
    gen_soul_brazier()
    gen_rune_stone()
    gen_particles()
    gen_entity_effects()
    gen_gui()
    gen_icon()

    errors = validate()
    if args.sheet:
        contact_sheet(args.sheet)
    print(f"wrote {len(WRITTEN)} files under {os.path.relpath(OUT, ROOT)}")
    if errors:
        print("VALIDATION ERRORS:")
        for e in errors:
            print("  " + e)
        return 1
    print("validation OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
