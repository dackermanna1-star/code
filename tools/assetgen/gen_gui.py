"""GUI textures: ability icons, emblems, character-select cards, vignettes, overlays,
QTE widgets and the mod icon.

GUI textures use straight (non-premultiplied) alpha.  Icons are drawn with
super-sampled vector shapes that are then *hard-thresholded* so edges stay crisp
pixel-art; only glows keep soft alpha.
"""
from __future__ import annotations

import math

import numpy as np
from PIL import Image, ImageDraw

import texlib as T

PI = math.pi


# ============================================================ canvas helpers
def hexf(h):
    return np.array(T.rgb(h), float) / 255


class Canvas:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.rgb = np.zeros((h, w, 3))
        self.a = np.zeros((h, w))

    def over(self, color, alpha):
        a = np.clip(np.asarray(alpha, float), 0, 1)
        c = color if isinstance(color, np.ndarray) and color.ndim == 3 else (
            hexf(color) if isinstance(color, str) else np.asarray(color, float))
        if c.ndim == 1:
            c = np.broadcast_to(c, (self.h, self.w, 3))
        oa = a + self.a * (1 - a)
        num = c * a[..., None] + self.rgb * (self.a * (1 - a))[..., None]
        self.rgb = np.where(oa[..., None] > 1e-9, num / np.maximum(oa[..., None], 1e-9), 0)
        self.a = oa

    def img(self):
        return T.from_float(self.rgb, self.a)


SS = 8


def mask(w, h, draw_fn, ss=SS):
    im = Image.new("L", (w * ss, h * ss), 0)
    d = ImageDraw.Draw(im)
    draw_fn(d, ss)
    a = np.asarray(im, float) / 255
    return a.reshape(h, ss, w, ss).mean(axis=(1, 3))


def circle(w, h, cx, cy, r):
    return mask(w, h, lambda d, s: d.ellipse([(cx - r) * s, (cy - r) * s, (cx + r) * s, (cy + r) * s], fill=255))


def ellipse(w, h, cx, cy, rx, ry):
    return mask(w, h, lambda d, s: d.ellipse([(cx - rx) * s, (cy - ry) * s, (cx + rx) * s, (cy + ry) * s], fill=255))


def poly(w, h, pts):
    return mask(w, h, lambda d, s: d.polygon([(x * s, y * s) for x, y in pts], fill=255))


def polyline(w, h, pts, width):
    def f(d, s):
        sp = [(x * s, y * s) for x, y in pts]
        d.line(sp, fill=255, width=max(1, int(round(width * s))), joint="curve")
        r = width * s / 2
        for x, y in (sp[0], sp[-1]):
            d.ellipse([x - r, y - r, x + r, y + r], fill=255)
    return mask(w, h, f)


def rrect(w, h, x0, y0, x1, y1, r):
    return mask(w, h, lambda d, s: d.rounded_rectangle([x0 * s, y0 * s, x1 * s, y1 * s], radius=r * s, fill=255))


def hardm(m, thr=0.5):
    return (m >= thr).astype(float)


def dilate(m, n=1, diagonal=False):
    out = m.astype(bool)
    for _ in range(n):
        g = out.copy()
        g[1:, :] |= out[:-1, :]
        g[:-1, :] |= out[1:, :]
        g[:, 1:] |= out[:, :-1]
        g[:, :-1] |= out[:, 1:]
        if diagonal:
            g[1:, 1:] |= out[:-1, :-1]
            g[:-1, :-1] |= out[1:, 1:]
            g[1:, :-1] |= out[:-1, 1:]
            g[:-1, 1:] |= out[1:, :-1]
        out = g
    return out.astype(float)


def bezier(p0, p1, p2, n=40):
    t = np.linspace(0, 1, n)[:, None]
    p0, p1, p2 = map(np.asarray, (p0, p1, p2))
    return (1 - t) ** 2 * p0 + 2 * (1 - t) * t * p1 + t ** 2 * p2


def crescent_pts(p0, p1, c_out, c_in, n=40):
    outer = bezier(p0, c_out, p1, n)
    inner = bezier(p1, c_in, p0, n)
    return [tuple(p) for p in np.vstack([outer, inner])]


def lemniscate(cx, cy, a, n=400, sy=1.0):
    t = np.linspace(0, 2 * PI, n)
    den = 1 + np.sin(t) ** 2
    return [(cx + a * math.cos(tt) / dd, cy + sy * a * math.sin(tt) * math.cos(tt) / dd) for tt, dd in zip(t, den)]


def nearest_palette(rgb, palette_hex):
    pal = np.array([hexf(h) for h in palette_hex])
    d = ((rgb[..., None, :] - pal[None, None, :, :]) ** 2).sum(-1)
    return pal[np.argmin(d, axis=-1)]


def bayer(h, w):
    b = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) / 16.0 - 0.47
    return np.tile(b, (h // 4 + 1, w // 4 + 1))[:h, :w]


# ============================================================== icon frames
THEMES = {
    "gojo": dict(inner="#1b2c6e", outer="#070b24", border="#5fd0ff", border_hi="#c8f2ff", outline="#020410",
                 glow="#3f8cff"),
    "sukuna": dict(inner="#5a0c18", outer="#170307", border="#ff3a4c", border_hi="#ffb0b8", outline="#0b0103",
                   glow="#ff2a3a"),
    "neutral": dict(inner="#2e2640", outer="#0e0b15", border="#b9a8dc", border_hi="#f0e8ff", outline="#050408",
                    glow="#9f8cff"),
    "locked": dict(inner="#2c2c31", outer="#121215", border="#85858d", border_hi="#c4c4cc", outline="#050506",
                   glow="#666670"),
}
N = 32
C = 16.0


def disc_area():
    return hardm(circle(N, N, C, C, 14.5))


def frame(cv, theme, shape="circle"):
    th = THEMES[theme]
    x, y = T.grid(N, N)
    r = np.hypot(x, y)
    if shape == "circle":
        outer = hardm(circle(N, N, C, C, 15.9))
        body = hardm(circle(N, N, C, C, 14.9))
        inner = hardm(circle(N, N, C, C, 13.9))
        g = np.clip(r / 14.5, 0, 1)
    else:  # diamond
        dist = np.abs(x) + np.abs(y)
        outer = (dist <= 16.2).astype(float)
        body = (dist <= 15.0).astype(float)
        inner = (dist <= 13.8).astype(float)
        g = np.clip(dist / 15, 0, 1)
    gq = np.floor(g * 4) / 4                     # 4 banded steps => pixel-art gradient
    col = hexf(th["inner"])[None, None, :] * (1 - gq[..., None]) + hexf(th["outer"])[None, None, :] * gq[..., None]
    cv.over(th["outline"], outer)
    cv.over(th["border"], body)
    # lit top-left arc of the border
    ang = np.arctan2(y, x)
    hi = body * (1 - inner) * ((ang < -PI * 0.55) & (ang > -PI * 0.95))
    cv.over(th["border_hi"], hi)
    cv.over(col, inner)
    return inner


def glow(cv, m, color, radius=1.6, strength=0.75, clip=None):
    radius = min(radius, 1.4)
    strength = strength * 0.7
    g = np.clip(T.blur(m, radius) * strength * 1.6, 0, strength) * (1 - np.clip(m, 0, 1))
    if clip is not None:
        g = g * clip
    cv.over(color, g)


def finish(cv, name):
    img = cv.img()
    T.save(img, f"gui/icons/{name}.png")
    return img


# ================================================================== icons
def icon_blue():
    cv = Canvas(N, N)
    area = frame(cv, "gojo")
    x, y = T.grid(N, N)
    r = np.hypot(x, y)
    th = np.arctan2(y, x)
    R = 8.6
    sph = hardm(circle(N, N, C, C, R))
    glow(cv, sph, "#3f8cff", 2.2, 0.7, area)
    spiral = 0.5 + 0.5 * np.cos(3 * th + 5.0 * np.log(np.maximum(r, 0.6) / R))
    v = 0.5 * (1 - r / R) + 0.5 * spiral * np.clip(r / 3, 0, 1)
    idx = np.digitize(v, [0.3, 0.5, 0.68])
    pal = np.array([hexf(h) for h in ("#1838b8", "#2c78ff", "#62c4ff", "#d4f5ff")])
    col = pal[idx]
    col[r < 2.0] = hexf("#ffffff")
    cv.over(col, sph)
    # orbiting sparks
    for px, py in ((6, 9), (25, 22), (24, 8), (7, 23)):
        cv.over("#bff0ff", (np.abs(x + C - px - 0.5) < 0.6) * (np.abs(y + C - py - 0.5) < 0.6) * 1.0)
    return finish(cv, "blue")


def icon_red():
    cv = Canvas(N, N)
    area = frame(cv, "gojo")
    x, y = T.grid(N, N)
    r = np.hypot(x, y)
    rays = np.zeros((N, N))
    for k in range(8):
        a = k * PI / 4 + PI / 8
        r1 = 12.4 if k % 2 == 0 else 10.4
        rays = np.maximum(rays, polyline(N, N, [(C + math.cos(a) * 7.0, C + math.sin(a) * 7.0),
                                                (C + math.cos(a) * r1, C + math.sin(a) * r1)], 1.7))
    rays = hardm(rays) * area
    core = hardm(circle(N, N, C, C, 5.6))
    glow(cv, np.maximum(core, rays * 0.6), "#ff3a1a", 2.0, 0.75, area)
    cv.over("#ff5a24", rays)
    tips = rays * (r > 9.5)
    cv.over("#ffb070", tips)
    col = np.zeros((N, N, 3))
    col[...] = hexf("#e0142a")
    col[r < 4.6] = hexf("#ff6a2a")
    col[r < 3.2] = hexf("#ffd08a")
    col[r < 1.8] = hexf("#ffffff")
    cv.over(col, core)
    return finish(cv, "red")


def icon_blink():
    cv = Canvas(N, N)
    area = frame(cv, "gojo")
    layers = [(10.0, "#4f8ad8", 0.5), (15.5, "#9fd6ff", 0.8), (21.0, "#ffffff", 1.0)]
    allm = np.zeros((N, N))
    ms = []
    for cx, col, al in layers:
        m = hardm(polyline(N, N, [(cx - 3.2, 9.0), (cx + 2.6, 16.0), (cx - 3.2, 23.0)], 2.6)) * area
        ms.append((m, col, al))
        allm = np.maximum(allm, m * al)
    glow(cv, allm, "#5fd0ff", 1.6, 0.6, area)
    for m, col, al in ms:
        cv.over(col, m * al)
    # teleport sparkle at the destination
    x, y = T.grid(N, N)
    sp = ((np.abs(x - 9.5) < 0.6) & (np.abs(y + 6.5) < 2.2)) | ((np.abs(y + 6.5) < 0.6) & (np.abs(x - 9.5) < 2.2))
    cv.over("#e8fbff", sp.astype(float) * area)
    return finish(cv, "blink")


def icon_hollow_purple():
    cv = Canvas(N, N)
    area = frame(cv, "gojo")
    x, y = T.grid(N, N)
    r = np.hypot(x, y)
    R = 9.2
    sph = hardm(circle(N, N, C, C, R))
    halo = hardm(circle(N, N, C, C, 11.6)) * (1 - hardm(circle(N, N, C, C, 10.4))) * area
    glow(cv, sph, "#9a4cff", 2.4, 0.8, area)
    cv.over("#a060ff", halo * 0.75)
    t = T.smoothstep(-4.0, 4.0, x)
    blue, red, purple = hexf("#2f6bff"), hexf("#ff2f45"), hexf("#b45cff")
    base = blue[None, None] * (1 - t[..., None]) + red[None, None] * t[..., None]
    mid = np.exp(-(x / 3.0) ** 2)[..., None]
    base = base * (1 - mid) + purple[None, None] * mid
    shade = np.clip(1.15 - r / R * 0.65, 0, 1)[..., None]
    col = base * shade + (1 - shade) * 0.05
    core = np.exp(-(r / 3.0) ** 2)[..., None]
    col = col * (1 - core) + hexf("#f6ecff")[None, None] * core
    col = nearest_palette(col, ["#1c3fb0", "#2f6bff", "#6f9cff", "#b02035", "#ff2f45", "#ff7a8a",
                                "#7a2fd0", "#b45cff", "#dcb8ff", "#f6ecff"])
    cv.over(col, sph)
    return finish(cv, "hollow_purple")


def icon_infinity():
    cv = Canvas(N, N)
    area = frame(cv, "gojo")
    pts = lemniscate(C, C, 11.0)
    outer = hardm(polyline(N, N, pts, 3.4)) * area
    inner = hardm(polyline(N, N, pts, 1.3), 0.45) * area
    glow(cv, outer, "#4fd8ff", 2.0, 0.85, area)
    cv.over("#3cb8f0", outer)
    cv.over("#e8fdff", inner)
    return finish(cv, "infinity")


def icon_unlimited_void():
    cv = Canvas(N, N)
    area = frame(cv, "gojo")
    x, y = T.grid(N, N)
    disc = hardm(circle(N, N, C, C, 9.0))
    ring = hardm(circle(N, N, C, C, 11.2)) * (1 - hardm(circle(N, N, C, C, 9.8)))
    glow(cv, ring, "#9fe8ff", 1.8, 0.7, area)
    cv.over("#ffffff", ring)
    cv.over("#020108", disc)
    # starfield inside the disc
    stars = [(12, 12, "#ffffff"), (19, 11, "#9fe2ff"), (21, 17, "#ffffff"), (13, 19, "#c8b8ff"),
             (17, 21, "#9fe2ff"), (10, 16, "#6c78c8"), (22, 13, "#6c78c8"), (15, 9, "#6c78c8"),
             (18, 14, "#4a5090"), (14, 15, "#4a5090"), (20, 20, "#4a5090")]
    for sx, sy, c in stars:
        m = np.zeros((N, N))
        m[sy, sx] = 1
        cv.over(c, m * disc)
    # central glint: a tiny 4-point star (the eye of the void)
    m = np.zeros((N, N))
    for dx, dy in ((0, 0), (1, 0), (0, 1), (1, 1)):
        m[15 + dy, 15 + dx] = 1
    cv.over("#ffffff", m)
    m2 = np.zeros((N, N))
    for dx, dy in ((-1, 0), (-1, 1), (2, 0), (2, 1), (0, -1), (1, -1), (0, 2), (1, 2)):
        m2[15 + dy, 15 + dx] = 1
    cv.over("#7fd6ff", m2 * 0.8)
    return finish(cv, "unlimited_void")


def slash_shape(p0, p1, c_out, c_in):
    return hardm(poly(N, N, crescent_pts(p0, p1, c_out, c_in)))


def icon_dismantle():
    cv = Canvas(N, N)
    area = frame(cv, "sukuna")
    m = slash_shape((6.5, 25.5), (25.5, 6.5), (9.0, 9.0), (13.5, 13.5)) * area
    glow(cv, m, "#ffffff", 1.6, 0.45, area)
    cv.over("#c8d4ee", m)
    inner = slash_shape((8.0, 24.0), (24.0, 8.0), (10.0, 10.0), (12.8, 12.8)) * area
    cv.over("#ffffff", inner)
    return finish(cv, "dismantle")


def icon_cleave():
    cv = Canvas(N, N)
    area = frame(cv, "sukuna")
    a = slash_shape((6.5, 24.5), (24.5, 6.5), (9.5, 9.5), (13.5, 13.5))
    b = slash_shape((7.5, 6.5), (25.5, 24.5), (22.5, 9.5), (18.5, 13.5))
    for m in (a, b):
        m = m * area
        cv.over("#120004", dilate(m) * area)
        cv.over("#e01a34", m)
    hi_a = slash_shape((8.0, 23.0), (23.0, 8.0), (10.2, 10.2), (12.0, 12.0)) * area
    hi_b = slash_shape((9.0, 8.0), (24.0, 23.0), (21.8, 10.2), (20.0, 12.0)) * area
    cv.over("#ff9aa6", hi_a)
    cv.over("#ff9aa6", hi_b)
    return finish(cv, "cleave")


def icon_fuga():
    cv = Canvas(N, N)
    area = frame(cv, "sukuna")
    x, y = T.grid(N, N, cx=0, cy=0)
    tail = np.array([7.0, 25.0])
    tip = np.array([25.5, 6.5])
    ax = (tip - tail) / np.linalg.norm(tip - tail)
    pv = np.array([-ax[1], ax[0]])
    L = np.linalg.norm(tip - tail)
    px, py = x + 0.5 - tail[0], y + 0.5 - tail[1]
    u = (px * ax[0] + py * ax[1]) / L
    v = px * pv[0] + py * pv[1]
    n = T.fbm(N, N, base_cells=3, octaves=3, seed=4)
    width = (0.9 + 4.2 * np.clip(1 - u, 0, 1) ** 0.8) * (0.7 + 0.6 * n)
    flame = np.clip(1 - np.abs(v) / width, 0, 1) * (u > -0.05) * (u < 0.78)
    heat = flame * np.clip(1.15 - u * 0.2, 0, 1)
    idx = np.digitize(heat, [0.05, 0.3, 0.55, 0.8])
    pal = np.array([[0, 0, 0]] + [hexf(h) for h in ("#b0200c", "#f06010", "#ffb030", "#fff2b0")])
    fm = (idx > 0).astype(float) * area
    glow(cv, fm, "#ff6a10", 1.8, 0.6, area)
    cv.over(pal[idx], fm)
    head = hardm(poly(N, N, [(tip[0], tip[1]), (tip[0] - ax[0] * 7 + pv[0] * 3.6, tip[1] - ax[1] * 7 + pv[1] * 3.6),
                              (tip[0] - ax[0] * 5.2, tip[1] - ax[1] * 5.2),
                              (tip[0] - ax[0] * 7 - pv[0] * 3.6, tip[1] - ax[1] * 7 - pv[1] * 3.6)])) * area
    shaft = hardm(polyline(N, N, [tuple(tail + ax * 4), tuple(tip - ax * 4)], 1.4)) * area
    cv.over("#fff6d0", shaft)
    cv.over("#ffd060", head)
    cv.over("#ffffff", hardm(poly(N, N, [(tip[0], tip[1]), (tip[0] - ax[0] * 4.5 + pv[0] * 1.4, tip[1] - ax[1] * 4.5 + pv[1] * 1.4),
                                          (tip[0] - ax[0] * 4.5 - pv[0] * 1.4, tip[1] - ax[1] * 4.5 - pv[1] * 1.4)])) * area)
    return finish(cv, "fuga")


def icon_world_slash():
    cv = Canvas(N, N)
    area = frame(cv, "sukuna")
    x, y = T.grid(N, N)
    side = (x - y) > 0                          # split along the y = x diagonal (top-left / bottom-right halves)
    off = 1.1
    halfA = hardm(circle(N, N, C - off * 0.7, C - off * 0.7, 9.0)) * (~side)
    halfB = hardm(circle(N, N, C + off * 0.7, C + off * 0.7, 9.0)) * side
    for hm, cx_, cy_ in ((halfA, C - 0.8, C - 0.8), (halfB, C + 0.8, C + 0.8)):
        r = np.hypot(x + C - cx_, y + C - cy_)
        lit = -(x + y) / np.maximum(r, 1e-3)
        col = np.zeros((N, N, 3))
        col[...] = hexf("#a99fb4")
        col[lit > 0.3] = hexf("#d8d0e0")
        col[lit < -0.45] = hexf("#6e657c")
        col[r > 8.0] = hexf("#4a4256")
        cv.over(col, hm)
    gap = (np.abs(x - y) < 1.6).astype(float) * area
    cv.over("#0c0206", gap)
    line = (np.abs(x - y) < 0.75).astype(float) * area
    glow(cv, line, "#d8f4ff", 1.4, 0.8, area)
    cv.over("#ffffff", line)
    return finish(cv, "world_slash")


HAND = [
    "......##.......",
    "...##.##.......",
    "...##.##.##....",
    "...##.##.##....",
    "...##.##.##.##.",
    "...##.##.##.##.",
    "...##.##.##.##.",
    "...##.##.##.##.",
    "...###########.",
    "##.###########.",
    "###.##########.",
    ".###.#########.",
    "..############.",
    "...###########.",
    "...##########..",
    "....#########..",
    ".....#######...",
    ".....#######...",
]


def icon_domain_amplification():
    cv = Canvas(N, N)
    area = frame(cv, "sukuna")
    m = np.zeros((N, N))
    ox, oy = 9, 7
    for j, row in enumerate(HAND):
        for i, c in enumerate(row):
            if c == "#":
                m[oy + j, ox + i] = 1
    aura = dilate(m, 2, diagonal=True) * area
    cv.over("#3a0a4a", np.clip(T.blur(aura, 1.5) * 1.4, 0, 0.9) * area)
    cv.over("#14041c", dilate(m, 1, diagonal=True) * area)
    # skin shading: lighter on the left of each finger
    col = np.zeros((N, N, 3))
    col[...] = hexf("#e6c6b2")
    for j, row in enumerate(HAND):
        for i, c in enumerate(row):
            if c != "#":
                continue
            left = i == 0 or row[i - 1] != "#"
            right = i == len(row) - 1 or row[i + 1] != "#"
            if left:
                col[oy + j, ox + i] = hexf("#fbe4d4")
            elif right:
                col[oy + j, ox + i] = hexf("#b89080")
    # palm crease
    for (i, j) in ((5, 12), (6, 12), (7, 13), (8, 13), (9, 13)):
        col[oy + j, ox + i] = hexf("#c49e8c")
    cv.over(col, m)
    return finish(cv, "domain_amplification")


SHRINE = [
    "...........##...........",
    "..........####..........",
    "..r.....########.....r..",
    "...rKKKKKKKKKKKKKKKKKr...",
    "....KKKKKKKKKKKKKKKKK...",
    ".......bbPbbbbPbb.......",
    ".......bbPbbbbPbb.......",
    ".r...KKKKKKKKKKKKKK...r.",
    "..rKKKKKKKKKKKKKKKKKKr..",
    "...KKKKKKKKKKKKKKKKKK...",
    ".....PbbbbbbbbbbbbP.....",
    ".....PbWtWtWtWtWtbP.....",
    ".....PbmmmmmmmmmmbP.....",
    ".....PbmmmmmmmmmmbP.....",
    ".....PbtWtWtWtWtWbP.....",
    ".....PbbbbbbbbbbbbP.....",
    "...SSSSSSSSSSSSSSSSSS...",
]


def icon_malevolent_shrine():
    cv = Canvas(N, N)
    area = frame(cv, "sukuna")
    colors = {"K": "#0c0306", "r": "#ff3a4c", "b": "#2a080e", "P": "#8a0f1e", "W": "#f4ecd8", "t": "#c9bea4",
              "m": "#c0102a", "S": "#1a0508", "#": "#0c0306"}
    ox, oy = 4, 8
    m_all = np.zeros((N, N))
    for j, row in enumerate(SHRINE):
        for i, c in enumerate(row):
            if c != "." and c != " ":
                m_all[oy + j, ox + i] = 1
    glow(cv, m_all, "#ff2030", 1.8, 0.65, area)
    for j, row in enumerate(SHRINE):
        for i, c in enumerate(row):
            if c in colors:
                mm = np.zeros((N, N))
                mm[oy + j, ox + i] = 1
                cv.over(colors[c], mm * area)
    # red rim light on the roofs' top edges
    for j, row in enumerate(SHRINE):
        for i, c in enumerate(row):
            if c == "K" and (j == 0 or SHRINE[j - 1][i] in ".r"):
                mm = np.zeros((N, N))
                mm[oy + j, ox + i] = 1
                cv.over("#7a1020", mm * area)
    return finish(cv, "malevolent_shrine")


def icon_rct():
    cv = Canvas(N, N)
    area = frame(cv, "neutral")
    plus = np.maximum(hardm(rrect(N, N, 13.5, 7.5, 18.5, 24.5, 1.0)), hardm(rrect(N, N, 7.5, 13.5, 24.5, 18.5, 1.0)))
    halo = hardm(circle(N, N, C, C, 12.2)) * (1 - hardm(circle(N, N, C, C, 11.0))) * area
    glow(cv, np.maximum(plus, halo * 0.6), "#5cff9a", 2.0, 0.8, area)
    cv.over("#7dffb0", halo * 0.85)
    cv.over("#5ce890", dilate(plus) * area)
    cv.over("#ffffff", plus)
    inner = np.maximum(hardm(rrect(N, N, 15.0, 9.0, 17.0, 23.0, 0.5)), hardm(rrect(N, N, 9.0, 15.0, 23.0, 17.0, 0.5)))
    cv.over("#e4fff0", inner * 0.0)
    return finish(cv, "reverse_cursed_technique")


def icon_black_flash():
    cv = Canvas(N, N)
    area = frame(cv, "neutral")
    pts = [(20.5, 4.5), (11.0, 15.0), (16.5, 15.5), (9.5, 27.5), (23.0, 13.5), (17.0, 13.0), (22.5, 4.5)]
    bolt = hardm(poly(N, N, pts)) * area
    outl = dilate(bolt, 1, diagonal=False) * area
    glow(cv, outl, "#ff1a2e", 2.0, 0.85, area)
    cv.over("#ff2238", outl)
    cv.over("#050002", bolt)
    for sx, sy in ((7, 10), (25, 21), (24, 9), (8, 22)):
        mm = np.zeros((N, N))
        mm[sy, sx] = 1
        cv.over("#ff8a96", mm)
    mm = np.zeros((N, N))
    mm[14, 13] = 1
    mm[20, 13] = 1
    cv.over("#ffb0b8", mm * bolt)
    return finish(cv, "black_flash")


def icon_dodge():
    cv = Canvas(N, N)
    area = frame(cv, "neutral")
    lines = [((6.0, 10.5), (15.0, 10.5), 1.3, "#8e86b0"), ((5.0, 16.0), (17.0, 16.0), 1.6, "#c8c0e8"),
             ((7.0, 21.5), (14.5, 21.5), 1.3, "#8e86b0")]
    for p0, p1, wdt, col in lines:
        cv.over(col, hardm(polyline(N, N, [p0, p1], wdt)) * area)
    arrow = hardm(poly(N, N, [(18.0, 9.0), (26.5, 16.0), (18.0, 23.0), (20.5, 16.0)])) * area
    glow(cv, arrow, "#cfc4ff", 1.4, 0.5, area)
    cv.over("#ffffff", arrow)
    cv.over("#cfc4ff", hardm(poly(N, N, [(20.5, 16.0), (26.5, 16.0), (18.0, 23.0)])) * area)
    return finish(cv, "dodge")


def icon_block():
    cv = Canvas(N, N)
    area = frame(cv, "neutral")
    pts = [(8.5, 7.5), (16.0, 6.0), (23.5, 7.5), (23.5, 15.0), (21.5, 21.0), (16.0, 26.5), (10.5, 21.0), (8.5, 15.0)]
    sh = hardm(poly(N, N, pts)) * area
    cv.over("#151820", dilate(sh) * area)
    x, y = T.grid(N, N)
    col = np.zeros((N, N, 3))
    col[...] = hexf("#8a94aa")
    col[(x < 0)] = hexf("#b4bed2")
    col[(x < -4.5) & (y < 2)] = hexf("#dde4f0")
    col[(x > 3.5)] = hexf("#646e84")
    col[np.abs(x) < 0.6] = hexf("#e8eef8")
    cv.over(col, sh)
    inner = hardm(poly(N, N, [(10.5, 9.0), (16.0, 8.0), (21.5, 9.0), (21.5, 14.8), (20.0, 19.6), (16.0, 24.0),
                               (12.0, 19.6), (10.5, 14.8)]))
    rim = sh * (1 - inner)
    cv.over("#c8a64a", rim * (y < 0))
    cv.over("#8e7232", rim * (y >= 0))
    return finish(cv, "block")


def icon_locked():
    cv = Canvas(N, N)
    area = frame(cv, "locked")
    shackle = hardm(circle(N, N, C, 13.0, 6.2)) * (1 - hardm(circle(N, N, C, 13.0, 3.8)))
    shackle *= (T.grid(N, N)[1] < -2.5)
    legs = np.maximum(hardm(rrect(N, N, 9.8, 12.5, 12.2, 16.0, 0.2)), hardm(rrect(N, N, 19.8, 12.5, 22.2, 16.0, 0.2)))
    sh = np.maximum(shackle, legs)
    body = hardm(rrect(N, N, 8.5, 15.0, 23.5, 26.0, 2.0))
    cv.over("#18181c", dilate(np.maximum(sh, body)) * area)
    cv.over("#a4a4ac", sh)
    cv.over("#d4d4da", sh * (T.grid(N, N)[0] < -2))
    x, y = T.grid(N, N)
    col = np.zeros((N, N, 3))
    col[...] = hexf("#8c8c94")
    col[y < 0.5] = hexf("#b2b2ba")
    col[y > 7.5] = hexf("#6a6a72")
    cv.over(col, body)
    hole = np.maximum(hardm(circle(N, N, C, 19.5, 1.7)), hardm(rrect(N, N, 15.2, 19.5, 16.8, 23.5, 0.3)))
    cv.over("#141418", hole)
    return finish(cv, "locked")


# ================================================================= emblems
def emblem_gojo():
    cv = Canvas(N, N)
    area = frame(cv, "gojo", shape="diamond")
    x, y = T.grid(N, N)
    # almond eye = intersection of two circles
    eye = hardm(circle(N, N, C, C + 7.5, 11.0)) * hardm(circle(N, N, C, C - 7.5, 11.0))
    glow(cv, eye, "#5fd0ff", 2.0, 0.6, area)
    cv.over("#eef6ff", eye)
    iris = hardm(circle(N, N, C, C, 4.6)) * eye
    r = np.hypot(x, y)
    col = np.zeros((N, N, 3))
    col[...] = hexf("#2a86ff")
    col[r < 3.6] = hexf("#4fc8ff")
    col[(r < 2.6) & (y > -0.5)] = hexf("#8fe6ff")
    cv.over(col, iris)
    pupil = hardm(circle(N, N, C, C, 1.5))
    cv.over("#0a1640", pupil)
    hi = np.zeros((N, N))
    hi[13, 13] = hi[13, 14] = hi[14, 13] = 1
    cv.over("#ffffff", hi)
    # white upper lashes
    lash = hardm(circle(N, N, C, C + 7.5, 11.0)) - hardm(circle(N, N, C, C + 8.6, 11.0))
    lash = np.clip(lash, 0, 1) * (y < -1.5) * area
    cv.over("#ffffff", lash)
    for (lx, ly) in ((6, 13), (5, 14), (26, 13), (27, 14)):
        mm = np.zeros((N, N))
        mm[ly, lx] = 1
        cv.over("#ffffff", mm)
    img = cv.img()
    T.save(img, "gui/emblem_gojo.png")
    return img


def almond(cx, cy, hw, hh, angle_deg):
    """Pointed eye shape (intersection of two circles), rotated by angle_deg."""
    rc = (hw * hw / hh + hh) / 2.0
    d = rc - hh
    ca, sa = math.cos(math.radians(angle_deg)), math.sin(math.radians(angle_deg))

    def fn(X, Y):
        dx, dy = X - cx, Y - cy
        u = dx * ca + dy * sa
        v = -dx * sa + dy * ca
        return (u * u + (v - d) ** 2 <= rc * rc) & (u * u + (v + d) ** 2 <= rc * rc)
    return hardm(T.ss_mask(N, N, fn, ss=8))


SUKUNA_FACE = {
    # row: list of (col_start, pattern)
    6: [(14, "kkkk")],
    7: [(15, "kk")],
    9: [(9, "kkk"), (20, "kkk")],
    10: [(11, "kkk"), (18, "kkk")],
    12: [(7, "kkkkk"), (20, "kkkkk")],
    13: [(7, "kRHpRRk"), (18, "kRHpRRk")],
    14: [(9, "kkkkk"), (18, "kkkkk")],
    17: [(9, "kkk"), (20, "kkk")],
    18: [(9, "kRpRk"), (18, "kRpRk")],
    19: [(11, "kkk"), (18, "kkk")],
    21: [(8, "kkkk"), (20, "kkkk")],
    23: [(10, "kk"), (20, "kk")],
}


def emblem_sukuna():
    cv = Canvas(N, N)
    area = frame(cv, "sukuna", shape="diamond")
    cols = {"k": "#060001", "R": "#ff2236", "H": "#ff9aa2", "p": "#1a0004"}
    eyes = np.zeros((N, N))
    for row, segs in SUKUNA_FACE.items():
        for c0, pat in segs:
            for i, ch in enumerate(pat):
                if ch in "RHp":
                    eyes[row, c0 + i] = 1
    g = np.clip(T.blur(eyes, 1.3) * 1.3, 0, 0.75) * (1 - eyes) * area
    cv.over("#ff1a2e", g)
    for row, segs in SUKUNA_FACE.items():
        for c0, pat in segs:
            for i, ch in enumerate(pat):
                m = np.zeros((N, N))
                m[row, c0 + i] = 1
                cv.over(cols[ch], m)
    img = cv.img()
    T.save(img, "gui/emblem_sukuna.png")
    return img


# ============================================================ select cards
def select_card(kind):
    W, H = 160, 240
    rng = np.random.default_rng(5 if kind == "gojo" else 6)
    x, y = np.meshgrid(np.arange(W) + 0.5, np.arange(H) + 0.5)
    t = y / H
    if kind == "gojo":
        top, mid, bot = hexf("#231a6a"), hexf("#0e0b30"), hexf("#020107")
    else:
        top, mid, bot = hexf("#6a0a16"), hexf("#2a0408"), hexf("#030001")
    col = np.where(t[..., None] < 0.5,
                   top * (1 - (t / 0.5))[..., None] + mid * (t / 0.5)[..., None],
                   mid * (1 - ((t - 0.5) / 0.5))[..., None] + bot * ((t - 0.5) / 0.5)[..., None])
    # side darkening keeps focus on the centre
    sx = np.abs(x - W / 2) / (W / 2)
    col *= (1 - 0.35 * sx ** 2)[..., None]
    calm = np.exp(-(((x - W / 2) / (W * 0.33)) ** 4 + ((y - H * 0.5) / (H * 0.32)) ** 4))   # ~centre 60%
    if kind == "gojo":
        # starfield, sparse in the calm zone
        n = 900
        sxp = rng.uniform(0, W, n)
        syp = rng.uniform(0, H, n)
        mag = rng.power(0.3, n)
        for px, py, m in zip(sxp, syp, mag):
            ix, iy = int(px), int(py)
            if rng.random() < calm[iy, ix] * 0.85:
                continue
            b = 0.25 + 0.75 * m
            tint = hexf("#cfe6ff") if rng.random() < 0.6 else hexf("#ffffff")
            col[iy, ix] = np.maximum(col[iy, ix], tint * b * (1 - 0.5 * calm[iy, ix]))
            if m > 0.95 and 1 <= ix < W - 1 and 1 <= iy < H - 1:
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    col[iy + dy, ix + dx] = np.maximum(col[iy + dy, ix + dx], tint * b * 0.45)
        # blue/white swirl at the bottom
        cx, cy = W / 2, H * 0.93
        dx, dy = x - cx, (y - cy) * 2.2
        r = np.hypot(dx, dy)
        th = np.arctan2(dy, dx)
        arms = (0.5 + 0.5 * np.cos(2 * th - 0.09 * r)) ** 3
        sw = arms * np.exp(-r / 55) + np.exp(-(r / 14) ** 2) * 0.8
        swc = hexf("#3f8cff") * (1 - np.exp(-(r / 20) ** 2))[..., None] + hexf("#e8fbff") * np.exp(-(r / 20) ** 2)[..., None]
        col += swc * (sw * (1 - calm) * 0.75)[..., None]
        # faint infinity at the top
        inf = polyline(W, H, lemniscate(W / 2, 30, 34, sy=1.0), 3.0)
        inf_g = T.blur(inf, 2.5)
        col += hexf("#7fd6ff") * (inf_g * 0.35 + inf * 0.22)[..., None]
        frame_col = hexf("#5fd0ff")
    else:
        # slash marks in the upper corners
        slashes = np.zeros((H, W))
        for (p0, p1, c0, c1) in [((6, 70), (70, 6), (20, 20), (30, 30)), ((20, 92), (92, 20), (38, 38), (48, 48)),
                                 ((154, 64), (100, 6), (138, 18), (130, 28))]:
            slashes = np.maximum(slashes, poly(W, H, crescent_pts(p0, p1, c0, c1)))
        sl_g = T.blur(slashes, 2)
        col = col * (1 - 0.6 * sl_g[..., None]) + hexf("#ff2a3a") * (slashes * 0.55)[..., None] \
            + hexf("#ff8a96") * (np.clip(slashes - 0.7, 0, 1) * 0.6)[..., None]
        # shrine silhouette at the bottom
        sil = np.zeros((H, W))
        base_y = H - 6
        shapes = [
            [(18, base_y - 44), (142, base_y - 44), (128, base_y - 54), (32, base_y - 54)],     # lower roof
            [(12, base_y - 42), (24, base_y - 46), (20, base_y - 40)],                          # upturned tip L
            [(148, base_y - 42), (136, base_y - 46), (140, base_y - 40)],                       # upturned tip R
            [(46, base_y - 54), (114, base_y - 54), (104, base_y - 64), (56, base_y - 64)],      # body upper
            [(36, base_y - 64), (124, base_y - 64), (110, base_y - 72), (50, base_y - 72)],      # upper roof
            [(74, base_y - 72), (86, base_y - 72), (80, base_y - 84)],                           # finial
            [(36, base_y - 44), (124, base_y - 44), (124, base_y), (36, base_y)],                # hall
            [(0, base_y), (160, base_y), (160, H), (0, H)],                                      # ground
        ]
        for pts in shapes:
            sil = np.maximum(sil, poly(W, H, pts))
        moon = np.exp(-(((x - W / 2) / 58) ** 2 + ((y - (base_y - 70)) / 46) ** 2))
        col += hexf("#ff2a2a") * (moon * 0.42 * (1 - calm * 0.6))[..., None]
        col = col * (1 - sil[..., None]) + hexf("#070102") * sil[..., None]
        # glowing teeth row in the hall
        teeth = np.zeros((H, W))
        for k in range(10):
            xx = 44 + k * 8
            teeth = np.maximum(teeth, poly(W, H, [(xx, base_y - 26), (xx + 6, base_y - 26), (xx + 3, base_y - 19)]))
            teeth = np.maximum(teeth, poly(W, H, [(xx + 4, base_y - 10), (xx + 10, base_y - 10), (xx + 7, base_y - 17)]))
        maw = poly(W, H, [(42, base_y - 27), (122, base_y - 27), (122, base_y - 9), (42, base_y - 9)])
        col = col * (1 - maw[..., None]) + hexf("#5a0410") * maw[..., None]
        col = col * (1 - teeth[..., None]) + hexf("#cbbda2") * teeth[..., None]
        col += hexf("#ff2030") * (T.blur(maw, 4) * 0.25 * (1 - sil))[..., None]
        # embers
        for _ in range(140):
            px, py = rng.uniform(0, W), rng.uniform(H * 0.3, H)
            ix, iy = int(px), int(py)
            if rng.random() < calm[iy, ix] * 0.9:
                continue
            col[iy, ix] = np.maximum(col[iy, ix], hexf("#ff5a2a") * rng.uniform(0.4, 1.0))
        frame_col = hexf("#ff3a4c")
    # thin inset frame with corner accents
    fr = np.zeros((H, W))
    fr[3, 3:W - 3] = fr[H - 4, 3:W - 3] = 1
    fr[3:H - 3, 3] = fr[3:H - 3, W - 4] = 1
    col = col * (1 - 0.55 * fr[..., None]) + frame_col * (0.55 * fr)[..., None]
    for (cx, cy) in ((3, 3), (W - 4, 3), (3, H - 4), (W - 4, H - 4)):
        for d in range(0, 9):
            for (xx, yy) in ((cx + (d if cx < W / 2 else -d), cy), (cx, cy + (d if cy < H / 2 else -d))):
                col[yy, xx] = frame_col
    col = np.clip(col + bayer(H, W)[..., None] / 255.0, 0, 1)
    img = T.from_float(col, np.ones((H, W)))
    T.save(img, f"gui/select_{kind}.png")
    return img


# =============================================================== overlays
def vignette(kind):
    S = 256
    rng = np.random.default_rng(11 if kind == "void" else 12)
    x, y = T.grid(S, S)
    r = np.hypot(x, y) / (S / 2)
    a = T.smoothstep(0.5, 1.38, r) ** 1.15 * 0.94
    if kind == "void":
        col = np.zeros((S, S, 3))
        col[...] = hexf("#0b0726")
        col = col * (1 - T.smoothstep(0.9, 1.4, r))[..., None] + hexf("#05030f") * T.smoothstep(0.9, 1.4, r)[..., None]
        stars = np.zeros((S, S))
        for _ in range(700):
            ix, iy = rng.integers(0, S, 2)
            if r[iy, ix] < 0.8:
                continue
            stars[iy, ix] = max(stars[iy, ix], rng.uniform(0.3, 1.0))
        col = col * (1 - stars[..., None]) + hexf("#d8e2ff") * stars[..., None]
        a = np.maximum(a, stars * a * 1.05)
    else:
        col = np.zeros((S, S, 3))
        col[...] = hexf("#5a0010")
        col = col * (1 - T.smoothstep(0.8, 1.4, r))[..., None] + hexf("#2a0006") * T.smoothstep(0.8, 1.4, r)[..., None]
    a = np.clip(a + bayer(S, S) / 255.0, 0, 1)
    img = T.from_float(col, a)
    T.save(img, f"gui/vignette_{kind}.png")
    return img


GLYPHS = None


def make_glyphs(rng, n=40):
    gl = []
    for _ in range(n):
        g = (rng.random((5, 3)) < 0.5).astype(float)
        g[rng.integers(0, 5), :] = 1  # a crossbar keeps them glyph-like
        gl.append(g)
    return gl


def info_overload():
    S = 256
    rng = np.random.default_rng(2024)
    x, y = T.grid(S, S)
    r = np.hypot(x, y) / (S / 2)
    th = np.arctan2(y, x)
    rgb = np.zeros((S, S, 3))
    a = np.zeros((S, S))
    cv = Canvas(S, S)
    # light rays from the centre
    ray_n = np.zeros(720)
    for _ in range(46):
        k = rng.integers(0, 720)
        ray_n[k] = rng.uniform(0.3, 1.0)
    ray_n = np.maximum(ray_n, np.roll(ray_n, 1) * 0.6)
    ray_n = np.maximum(ray_n, np.roll(ray_n, -1) * 0.6)
    ang_idx = ((th + PI) / (2 * PI) * 720).astype(int) % 720
    rays = ray_n[ang_idx] * T.smoothstep(0.18, 0.55, r) * np.clip(1.25 - r * 0.5, 0, 1)
    cv.over("#dff8ff", rays * 0.2)
    # horizontal data streaks (more toward the edges)
    for _ in range(120):
        yy = rng.integers(0, S)
        length = int(rng.uniform(8, 110))
        x0 = rng.integers(-40, S)
        alpha = rng.uniform(0.1, 0.45)
        col = "#ffffff" if rng.random() < 0.5 else "#9fe8ff"
        m = np.zeros((S, S))
        xs = np.arange(max(0, x0), min(S, x0 + length))
        if xs.size == 0:
            continue
        fade = np.sin(np.linspace(0, PI, xs.size)) ** 0.5
        m[yy, xs] = fade
        edge_w = np.clip((r[yy, xs] - 0.25) / 0.45, 0, 1)
        m[yy, xs] *= edge_w
        cv.over(col, m * alpha)
    # glyph columns / rows
    glyphs = make_glyphs(rng)
    for _ in range(360):
        gx, gy = rng.integers(0, S - 3), rng.integers(0, S - 5)
        rr = r[gy, gx]
        if rr < 0.35 or rng.random() > (rr - 0.3) * 1.3:
            continue
        g = glyphs[rng.integers(0, len(glyphs))]
        m = np.zeros((S, S))
        m[gy:gy + 5, gx:gx + 3] = g
        cv.over("#bff4ff" if rng.random() < 0.7 else "#ffffff", m * rng.uniform(0.2, 0.55))
    # faint concentric pulse rings
    rings = (0.5 + 0.5 * np.cos(r * 2 * PI * 6)) ** 12 * T.smoothstep(0.3, 0.8, r) * 0.12
    cv.over("#9fe8ff", rings)
    img = cv.img()
    T.save(img, "gui/info_overload.png")
    return img


def qte_ring():
    S = 64
    x, y = T.grid(S, S)
    r = np.hypot(x, y)
    cov = T.ss_mask(S, S, lambda X, Y: (np.hypot(X - 32, Y - 32) <= 30.0) & (np.hypot(X - 32, Y - 32) >= 26.0), ss=8)
    rgb = np.ones((S, S, 3))
    img = T.from_float(rgb, cov)
    T.save(img, "gui/qte_ring.png")
    return img


def qte_key():
    S = 32
    cv = Canvas(S, S)
    outer = hardm(rrect(S, S, 1.0, 1.0, 31.0, 31.0, 5.0))
    skirt = hardm(rrect(S, S, 2.0, 2.0, 30.0, 30.0, 4.0))
    top = hardm(rrect(S, S, 4.0, 3.0, 28.0, 26.0, 3.5))
    cv.over("#141418", outer)
    cv.over("#8e8e9c", skirt)
    x, y = T.grid(S, S)
    col = np.zeros((S, S, 3))
    col[...] = hexf("#e4e4ec")
    col[y > 6] = hexf("#d8d8e2")
    cv.over(col, top)
    hl = top * (1 - hardm(rrect(S, S, 4.0, 4.0, 28.0, 27.0, 3.5)))
    cv.over("#ffffff", hl)
    # lower skirt shading (key depth)
    sk = skirt * (1 - top) * (y > 8)
    cv.over("#6e6e7c", sk)
    img = cv.img()
    T.save(img, "gui/qte_key.png")
    return img


# ================================================================ mod icon
def mod_icon():
    S = 128
    k = 4
    W = S * k
    x, y = T.grid(W, W)
    x /= k
    y /= k
    r = np.hypot(x, y)
    th = np.arctan2(y, x)
    rgb = np.zeros((W, W, 3))
    rgb[...] = hexf("#07070c")
    rgb *= (1.0 - 0.3 * np.clip(r / 90, 0, 1))[..., None]
    R = 56.0
    disc = (r <= R).astype(float)
    # jagged divide: zig-zag crack down the middle
    zig = 2.2 * np.sin(y * 0.55) + 1.4 * np.sin(y * 1.37 + 1.0)
    left = (x < zig)
    blue_bg = hexf("#05103a") * (1 - np.clip((r / R), 0, 1))[..., None] + hexf("#020414") * np.clip(r / R, 0, 1)[..., None]
    swirl = (0.5 + 0.5 * np.cos(3 * th + 0.12 * r)) ** 4 * np.exp(-r / 40)
    blue_bg += hexf("#2f7dff") * (swirl * 0.55)[..., None]
    red_bg = hexf("#3a0008") * (1 - np.clip((r / R), 0, 1))[..., None] + hexf("#120002") * np.clip(r / R, 0, 1)[..., None]
    red_swirl = (0.5 + 0.5 * np.cos(3 * th - 0.12 * r + 1.0)) ** 4 * np.exp(-r / 40)
    red_bg += hexf("#ff2a2a") * (red_swirl * 0.5)[..., None]
    rgb = np.where((disc * left)[..., None] > 0, blue_bg, rgb)
    rgb = np.where((disc * (~left))[..., None] > 0, red_bg, rgb)

    def paint(m, col, alpha=1.0):
        nonlocal rgb
        m = np.clip(m * alpha, 0, 1)[..., None]
        rgb = rgb * (1 - m) + hexf(col) * m

    def m_ellipse(cx, cy, rx, ry):
        return (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1).astype(float)

    # ---- left: Six Eyes + faint infinity
    inf_im = Image.new("L", (W, W), 0)
    pts = [((px + 64) * k, (py + 64) * k) for px, py in lemniscate(-27, -22, 17)]
    ImageDraw.Draw(inf_im).line(pts, fill=255, width=int(4.0 * k), joint="curve")
    inf = np.asarray(inf_im, float) / 255
    paint(inf * left * disc, "#8fe0ff", 0.9)
    ex, ey = -26.0, 6.0
    eye = m_ellipse(ex, ey + 9.5, 22, 15.5) * m_ellipse(ex, ey - 9.5, 22, 15.5)
    eye *= ((x - ex) ** 2 / 20.5 ** 2 + (y - ey) ** 2 / 9.0 ** 2 <= 1.3)
    glow_m = T.blur(eye[::k, ::k], 3)
    glow_big = np.repeat(np.repeat(glow_m, k, 0), k, 1)
    paint(glow_big * left * disc, "#3fb4ff", 0.7)
    paint(eye * left, "#eef6ff")
    ir = np.hypot(x - ex, y - ey)
    paint((ir <= 7.2) * eye, "#2a86ff")
    paint((ir <= 5.6) * eye, "#4fc8ff")
    paint(((ir <= 4.2) & (y > ey - 1)) * eye, "#9fe9ff")
    paint((ir <= 2.2) * eye, "#06123a")
    paint((np.hypot(x - ex + 2.4, y - ey + 2.6) <= 1.6) * eye, "#ffffff")
    lid = m_ellipse(ex, ey + 9.5, 22, 15.5) - m_ellipse(ex, ey + 10.8, 22, 15.5)
    paint(np.clip(lid, 0, 1) * (y < ey - 2) * left, "#ffffff")
    # ---- right: red slash marks + shrine silhouette
    def slash_mask(p0, p1, c_out, c_in):
        im = Image.new("L", (W, W), 0)
        pts = crescent_pts(p0, p1, c_out, c_in, 60)
        ImageDraw.Draw(im).polygon([((px + 64) * k, (py + 64) * k) for px, py in pts], fill=255)
        return np.asarray(im, float) / 255
    for i, off in enumerate((-12, 0, 12)):
        sm = slash_mask((8 + off * 0.2, -28 + off), (46 + off * 0.2, 4 + off), (19 + off * 0.2, -25 + off),
                        (29 + off * 0.2, -12 + off))
        sm_g = np.repeat(np.repeat(T.blur(sm[::k, ::k], 2.5), k, 0), k, 1)
        paint(sm_g * (~left) * disc, "#ff1a2e", 0.6)
        paint(sm * (~left) * disc, "#ff3a4c")
        paint(np.clip(sm - 0.5, 0, 1) * 2 * (~left) * disc, "#ffc0c6", 0.7)
    shrine = Image.new("L", (W, W), 0)
    d = ImageDraw.Draw(shrine)
    def P(pts):
        d.polygon([((px + 64) * k, (py + 64) * k) for px, py in pts], fill=255)
    by = 46
    P([(6, by - 16), (50, by - 16), (45, by - 21), (11, by - 21)])
    P([(3, by - 15), (8, by - 18), (8, by - 15)])
    P([(53, by - 15), (48, by - 18), (48, by - 15)])
    P([(16, by - 21), (40, by - 21), (36, by - 26), (20, by - 26)])
    P([(12, by - 26), (44, by - 26), (39, by - 30), (17, by - 30)])
    P([(26, by - 30), (30, by - 30), (28, by - 35)])
    P([(12, by - 16), (44, by - 16), (44, by + 4), (12, by + 4)])
    sh = np.asarray(shrine, float) / 255
    paint(sh * (~left) * disc, "#050002")
    teeth = Image.new("L", (W, W), 0)
    dt = ImageDraw.Draw(teeth)
    for i in range(7):
        xx = 15 + i * 4
        dt.polygon([((xx + 64) * k, (by - 10 + 64) * k), ((xx + 3 + 64) * k, (by - 10 + 64) * k),
                    ((xx + 1.5 + 64) * k, (by - 6 + 64) * k)], fill=255)
    tm = np.asarray(teeth, float) / 255
    paint(sh * (~left) * disc * ((y > by - 11) & (y < by - 3) & (x > 13) & (x < 43)), "#7a0614")
    paint(tm * (~left), "#f0e4cc")
    # ---- divide crack + rim
    crack = (np.abs(x - zig) < 1.1) * disc
    crack_g = np.repeat(np.repeat(T.blur(crack[::k, ::k], 2), k, 0), k, 1)
    paint(crack_g * disc, "#ffffff", 0.5)
    paint(crack, "#ffffff")
    rim = ((r <= R + 2.2) & (r > R)).astype(float)
    rim_col_l = "#5fd0ff"
    rim_col_r = "#ff3a4c"
    paint(rim * left, rim_col_l)
    paint(rim * (~left), rim_col_r)
    outer = ((r <= R + 3.6) & (r > R + 2.2)).astype(float)
    paint(outer, "#020205")
    out = rgb.reshape(S, k, S, k, 3).mean(axis=(1, 3))
    img = T.from_float(out, np.ones((S, S)))
    path = T.ASSETS / "icon.png"
    from PIL import Image as PImage
    PImage.fromarray(img, "RGBA").save(path, optimize=True)
    return img


def main():
    icons = [("blue", icon_blue()), ("red", icon_red()), ("blink", icon_blink()),
             ("hollow_purple", icon_hollow_purple()), ("infinity", icon_infinity()),
             ("unlimited_void", icon_unlimited_void()), ("dismantle", icon_dismantle()),
             ("cleave", icon_cleave()), ("fuga", icon_fuga()), ("world_slash", icon_world_slash()),
             ("domain_amplification", icon_domain_amplification()),
             ("malevolent_shrine", icon_malevolent_shrine()), ("reverse_cursed_technique", icon_rct()),
             ("black_flash", icon_black_flash()), ("dodge", icon_dodge()), ("block", icon_block()),
             ("locked", icon_locked()), ("emblem_gojo", emblem_gojo()), ("emblem_sukuna", emblem_sukuna())]
    T.contact_sheet(icons, T.SCRATCH / "preview/gui_icons.png", k=6, cols=7)
    big = [("select_gojo", select_card("gojo")), ("select_sukuna", select_card("sukuna")),
           ("vignette_void", vignette("void")), ("vignette_red", vignette("red")),
           ("info_overload", info_overload()), ("qte_ring", qte_ring()), ("qte_key", qte_key()),
           ("icon", mod_icon())]
    T.contact_sheet(big, T.SCRATCH / "preview/gui_big.png", k=2, cols=4, max_w=6000)
    print("gui done")


if __name__ == "__main__":
    main()
