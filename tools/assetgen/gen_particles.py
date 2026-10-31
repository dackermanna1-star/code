"""Particle sprites (particle/*.png).  Small, crisp, quantised to short colour ramps.

Particles use straight (non-premultiplied) alpha; transparent pixels are (0,0,0,0).
"""
from __future__ import annotations

import math

import numpy as np

import texlib as T

PI = math.pi


def quant(inten, ramp, alphas, thresholds):
    """Map an intensity field onto (colour, alpha) steps.
    ramp/alphas: lists from faintest to brightest; thresholds: ascending, len == len(ramp)."""
    h, w = inten.shape
    img = T.new(w, h)
    lvl = np.digitize(inten, thresholds) - 1          # -1 = transparent
    for i, (c, a) in enumerate(zip(ramp, alphas)):
        m = lvl == i
        img[m, :3] = T.rgb(c)
        img[m, 3] = a
    return img


def save(img, name):
    T.save(img, f"particle/{name}.png")
    return img


def star_field(n, arm, core, diag=0.0, cx=None, cy=None):
    """4-point star intensity: core radius `core`, arm half-length `arm` (pixels)."""
    if cx is None:
        cx = n / 2
    if cy is None:
        cy = n / 2
    x, y = T.grid(n, n, cx, cy)
    ax, ay = np.abs(x), np.abs(y)
    r = np.hypot(x, y)
    f_core = np.clip(1.2 - r / max(core, 0.3), 0, 1.2)
    f_h = np.clip(1 - ax / max(arm, 0.3), 0, 1) * (ay < 0.6)
    f_v = np.clip(1 - ay / max(arm, 0.3), 0, 1) * (ax < 0.6)
    f_d = np.clip(1 - r / max(diag, 0.3), 0, 1) * 0.55 * (np.abs(ax - ay) < 0.6) if diag > 0 else 0
    return np.maximum.reduce([f_core, f_h * 0.95, f_v * 0.95, f_d + 0 * x])


# ------------------------------------------------------------------ sparks
SPARK_RAMPS = {
    "blue": (["#1d5fff", "#46b4ff", "#aeeeff", "#ffffff"]),
    "red": (["#b0100c", "#ff4a14", "#ffb060", "#fff4dc"]),
    "purple": (["#5b1fd6", "#a45cff", "#e0b8ff", "#ffffff"]),
}


SPARK_SHAPES = [
    # 0 = brightest core, 1 = inner, 2 = mid, 3 = outer (faint)
    ["...33...",
     "...22...",
     "...11...",
     "3210012.",
     ".2100123",
     "...11...",
     "...22...",
     "...33..."],
    ["........",
     "...3....",
     "...22...",
     "..2001..",
     "..1002..",
     "...22...",
     "....3...",
     "........"],
    ["........",
     "........",
     "...2....",
     "..2012..",
     "..2102..",
     "....2...",
     "........",
     "........"],
    ["........",
     "........",
     "........",
     "...12...",
     "...21...",
     "........",
     "........",
     "........"],
]


def sparks():
    out = []
    for name, ramp in SPARK_RAMPS.items():
        cols = [ramp[3], ramp[2], ramp[1], ramp[0]]
        alphas = [255, 245, 210, 140]
        for k, rows in enumerate(SPARK_SHAPES):
            img = T.new(8, 8)
            for y, row in enumerate(rows):
                for x, c in enumerate(row):
                    if c != ".":
                        i = int(c)
                        img[y, x, :3] = T.rgb(cols[i])
                        img[y, x, 3] = alphas[i]
            out.append((f"{name}_spark_{k}", save(img, f"{name}_spark_{k}")))
    return out


# ------------------------------------------------------------------ wisps / flames
def flame_field(n, k, seed, width=5.2, height=13.0, sway=1.6, base_y=None, lick=0.35):
    """Teardrop flame shape, base at the bottom, tip swaying per frame k."""
    if base_y is None:
        base_y = n - 1.5
    rng = np.random.default_rng(seed)
    x, y = T.grid(n, n, cx=n / 2, cy=0)
    h = np.clip((base_y - y) / height, -0.2, 1.2)          # 0 at base .. 1 at tip
    phase = 2 * PI * k / 4 + rng.uniform(0, 1)
    off = sway * np.sin(phase + h * 3.2) * np.clip(h, 0, None) ** 1.2
    prof = np.where(h < 0.22, np.sqrt(np.clip(1 - ((0.22 - h) / 0.3) ** 2, 0, 1)),
                    np.clip(1 - (h - 0.22) / 0.78, 0, 1) ** 0.9)
    wdt = width * prof * (1 + lick * np.sin(phase * 2 + h * 9) * h)
    d = np.abs(x - off) / np.maximum(wdt, 1e-3)
    f = np.clip(1 - d, 0, 1) * (h >= -0.15) * (h <= 1.0)
    core = np.clip(1 - d * 1.6, 0, 1) * np.clip(1 - h * 1.25, 0, 1)
    return f, core


def wisps():
    out = []
    for k in range(4):
        f, core = flame_field(16, k, seed=3, width=4.6, height=12.5, sway=1.8)
        inten = np.maximum(f * 0.75, core * 1.1)
        img = quant(inten, ["#1f4fd8", "#4aa6ff", "#a8e6ff", "#f4fdff"], [120, 200, 240, 255],
                    [0.06, 0.3, 0.55, 0.82])
        out.append((f"ce_wisp_blue_{k}", save(img, f"ce_wisp_blue_{k}")))
    for k in range(4):
        f, core = flame_field(16, k, seed=8, width=4.8, height=12.5, sway=2.0, lick=0.45)
        inten = np.maximum(f * 0.78, core * 1.0)
        # black edges, dark crimson body, red core
        img = quant(inten, ["#0b0003", "#4a0410", "#8e0c1e", "#d41e34"], [215, 235, 250, 255],
                    [0.05, 0.22, 0.5, 0.78])
        out.append((f"ce_wisp_red_{k}", save(img, f"ce_wisp_red_{k}")))
    for k in range(4):
        f, core = flame_field(16, k, seed=21 + k, width=5.4, height=13.5, sway=1.4, lick=0.6)
        inten = np.maximum(f * 0.8, core * 1.15)
        img = quant(inten, ["#a8200c", "#f05a12", "#ffb02a", "#fff0a8", "#ffffff"], [170, 225, 250, 255, 255],
                    [0.06, 0.28, 0.5, 0.72, 0.92])
        out.append((f"fuga_flame_{k}", save(img, f"fuga_flame_{k}")))
    return out


# ------------------------------------------------------------------ slashes
def crescent16(k, thick_max=3.2):
    n = 16
    x, y = T.grid(n, n, cx=0, cy=0)
    # arc of a circle centred bottom-right, sweeping from bottom-left to top-right
    cx, cy, R = 16.5, 16.5, 13.2
    r = np.hypot(x - cx, y - cy)
    ang = np.arctan2(y - cy, x - cx)                   # -pi..-pi/2 covers the arc
    u = np.clip((ang + PI) / (PI / 2), 0, 1)           # 0 at left .. 1 at top
    thick = thick_max * np.sin(PI * u) ** 0.9 * (1 - 0.18 * k)
    depth = R - r                                      # inside the circle (toward centre) = trailing side
    edge = np.exp(-(depth / 0.75) ** 2)
    body = np.where((depth >= 0) & (depth <= thick), 1 - depth / np.maximum(thick, 1e-3), 0)
    valid = (ang > -PI) & (ang < -PI / 2)
    f = np.maximum(edge * 1.0, body * 0.8) * valid * (np.sin(PI * u) > 0.08)
    f *= [1.0, 0.8, 0.6, 0.38][k]
    # later frames break up
    if k >= 2:
        f *= (0.55 + 0.45 * np.cos(u * PI * (5 + k)))
    return f


def slashes():
    out = []
    for k in range(4):
        f = crescent16(k)
        img = quant(f, ["#8a98b8", "#c8d4ec", "#ffffff"], [120, 200, 255], [0.12, 0.4, 0.75])
        out.append((f"slash_{k}", save(img, f"slash_{k}")))
    for k in range(4):
        f = crescent16(k)
        img = quant(f, ["#1a0004", "#8a0a1c", "#e2203a", "#ff8a96"], [200, 230, 255, 255], [0.08, 0.3, 0.58, 0.85])
        out.append((f"slash_red_{k}", save(img, f"slash_red_{k}")))
    return out


# ------------------------------------------------------------------ black flash
def bolt_mask(n, seed):
    rng = np.random.default_rng(seed)
    m = np.zeros((n, n))
    # main bolt from top area to bottom area, zigzag
    x = rng.uniform(4, 11)
    y = 1.0
    pts = [(x, y)]
    while y < n - 2:
        y += rng.uniform(2.0, 3.2)
        x += rng.choice([-1, 1]) * rng.uniform(1.5, 3.5)
        x = float(np.clip(x, 2.5, n - 3.5))
        pts.append((x, min(y, n - 2.0)))
    for (x0, y0), (x1, y1) in zip(pts[:-1], pts[1:]):
        for p in T.line_pixels(int(round(x0)), int(round(y0)), int(round(x1)), int(round(y1))):
            px, py = p
            m[py, px] = 1
            if px + 1 < n:
                m[py, px + 1] = 1        # 2px thick core
    # one branch
    j = rng.integers(1, len(pts) - 1)
    bx, by = pts[j]
    ex = float(np.clip(bx + rng.choice([-1, 1]) * rng.uniform(3, 5), 1, n - 2))
    ey = float(min(by + rng.uniform(2, 4), n - 2))
    for px, py in T.line_pixels(int(round(bx)), int(round(by)), int(round(ex)), int(round(ey))):
        m[py, px] = 1
    return m


def black_flash():
    out = []
    for k in range(4):
        core = bolt_mask(16, seed=100 + k * 7)
        n = 16
        img = T.new(n, n)
        # glow (2px), outline (1px), black core
        o = T.outline(np.dstack([np.zeros((n, n, 3), np.uint8), (core * 255).astype(np.uint8)]),
                      (255, 34, 56, 255))
        ring = (o[..., 3] > 0) & (core == 0)
        img[ring] = (255, 34, 56, 255)
        img[core > 0] = (6, 0, 2, 255)
        halo_src = np.dstack([np.zeros((n, n, 3), np.uint8), ((core + ring) > 0).astype(np.uint8) * 255])
        halo = (T.outline(halo_src, (1, 1, 1, 255))[..., 3] > 0) & (core == 0) & ~ring
        img[halo] = (150, 0, 20, 95)
        # a couple of white-hot sparks on the outline
        rng = np.random.default_rng(k)
        ys, xs = np.nonzero(ring)
        for i in rng.choice(len(xs), size=min(2, len(xs)), replace=False):
            img[ys[i], xs[i]] = (255, 210, 210, 255)
        out.append((f"black_flash_{k}", save(img, f"black_flash_{k}")))
    return out


# ------------------------------------------------------------------ misc
def void_stars():
    out = []
    params = [(1.6, 0.8), (2.8, 1.0), (3.8, 1.3), (2.4, 0.9)]
    for k, (arm, core) in enumerate(params):
        f = star_field(8, arm, core)
        img = quant(f, ["#3c8cff", "#9fe2ff", "#e8fbff", "#ffffff"], [110, 190, 240, 255], [0.1, 0.35, 0.65, 0.9])
        out.append((f"void_star_{k}", save(img, f"void_star_{k}")))
    return out


def shockwave():
    n = 32
    x, y = T.grid(n, n)
    r = np.hypot(x, y)
    f = np.exp(-((r - 12.5) / 1.3) ** 2) + 0.35 * np.exp(-((r - 10.5) / 2.2) ** 2) * (r < 12.5)
    img = quant(f, ["#9fd8ff", "#e4f6ff", "#ffffff"], [70, 170, 255], [0.15, 0.45, 0.8])
    return [("shockwave", save(img, "shockwave"))]


def impact_flash():
    out = []
    n = 32
    x, y = T.grid(n, n)
    r = np.hypot(x, y)
    th = np.arctan2(y, x)
    main = (0.5 + 0.5 * np.cos(4 * th)) ** 40            # 4 long cardinal rays
    diag = (0.5 + 0.5 * np.cos(4 * th + PI)) ** 60       # 4 shorter diagonal rays
    params = [(3.2, 8.0, 5.0, 1.0), (4.6, 14.5, 9.0, 1.0), (4.0, 15.5, 12.0, 0.8), (2.0, 15.8, 13.5, 0.5)]
    for k, (core_r, main_len, diag_len, gain) in enumerate(params):
        core = np.clip(1.25 - r / core_r, 0, 1.25)
        thin = np.clip(1 - r / main_len, 0, 1)
        rays = main * thin ** 0.8 + diag * np.clip(1 - r / diag_len, 0, 1) ** 0.8 * 0.85
        f = np.maximum(core, rays * 1.05) * gain
        if k == 3:
            f = np.where(r < 5, f * 0.25, f)               # burnt-out centre
        img = quant(f, ["#fff0cc", "#fffaf0", "#ffffff"], [185, 235, 255], [0.12, 0.38, 0.7])
        out.append((f"impact_flash_{k}", save(img, f"impact_flash_{k}")))
    return out


def rct_glow():
    out = []
    shapes = [
        ["........", "........", "...22...", "..2112..", "..2112..", "...22...", "........", "........"],
        ["........", "...33...", "..2112..", ".310013.", ".310013.", "..2112..", "...33...", "........"],
        ["...33...", "..2222..", ".211112.", "32100123", "32100123", ".211112.", "..2222..", "...33..."],
        ["........", "...3....", "..323...", ".32113..", "..3113..", "...33...", "........", "........"],
    ]
    cols = ["#ffffff", "#d6ffe6", "#7dffb0", "#2fae6a"]
    alphas = [255, 230, 170, 95]
    for k, rows in enumerate(shapes):
        img = T.new(8, 8)
        for y, row in enumerate(rows):
            for x, c in enumerate(row):
                if c != ".":
                    i = int(c)
                    img[y, x, :3] = T.rgb(cols[i])
                    img[y, x, 3] = alphas[i]
        out.append((f"rct_glow_{k}", save(img, f"rct_glow_{k}")))
    return out


def blood():
    out = []
    pal_ = {"o": (40, 0, 6, 255), "d": (92, 6, 16, 255), "b": (138, 14, 28, 255), "h": (214, 70, 82, 255)}
    shapes = [
        ["...o....",
         "...d....",
         "..odo...",
         "..dbdo..",
         ".odbbdo.",
         ".dhbbbd.",
         ".odbbdo.",
         "..oddo.."],
        ["........",
         ".o...o..",
         "odo.odo.",
         "dhd..o..",
         "odo.....",
         "....odo.",
         "...dhbd.",
         "....odo."],
    ]
    for k, rows in enumerate(shapes):
        img = T.new(8, 8)
        for y, row in enumerate(rows):
            for x, c in enumerate(row):
                if c != ".":
                    img[y, x] = pal_[c]
        out.append((f"blood_{k}", save(img, f"blood_{k}")))
    return out


def embers():
    out = []
    pal_ = {"r": (150, 12, 10, 150), "R": (232, 40, 20, 230), "o": (255, 120, 40, 255), "y": (255, 214, 140, 255)}
    shapes = [
        ["........", "........", "...rr...", "..rooR..", "..Royr..", "...Rr...", "........", "........"],
        ["........", "....r...", "...rRr..", "..rRoR..", "...ryo..", "....R...", "........", "........"],
        ["........", "........", "....r...", "...Ror..", "...rR...", "........", "........", "........"],
        ["........", "........", "........", "...r....", "...R....", "........", "........", "........"],
    ]
    for k, rows in enumerate(shapes):
        img = T.new(8, 8)
        for y, row in enumerate(rows):
            for x, c in enumerate(row):
                if c != ".":
                    img[y, x] = pal_[c]
        out.append((f"domain_ember_{k}", save(img, f"domain_ember_{k}")))
    return out


def main():
    items = []
    for fn in (sparks, wisps, slashes, black_flash, void_stars, shockwave, impact_flash, rct_glow, blood, embers):
        items += fn()
    T.contact_sheet(items, T.SCRATCH / "preview/particles.png", k=10, cols=8, max_w=20000)
    print("particles done:", len(items))


if __name__ == "__main__":
    main()
