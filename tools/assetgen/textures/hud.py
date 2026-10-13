"""HUD sprites (ASSET_SPEC 3.6) - textures/gui/sprites/hud/<name>.png.

Crisp pixel art: light glyphs with a dark 1px outline so they read on any background.
Reticles are emissive-looking (soft glow, transparent background, no outline).
"""
from __future__ import annotations

import numpy as np

from texlib import Canvas, bevel_fill, grid_sprite, hx, outline, ramp, save, supersample

OUTLINE = "#16171a"
GLYPH = dict(base="#f2f2f2", hi="#ffffff", lo="#b9bcc2")

AMMO_PAL = {
    "q": "#ffd5b4", "c": "#e8955f", "e": "#9a5530",
    "p": "#fff1bf", "b": "#e2b54f", "d": "#9c7425", "r": "#5e4314",
    "x": "#ff6b5e", "X": "#cf2f2a", "z": "#7e1418", "Q": "#a3242a",
}
BULLET_PISTOL = [
    ".q.",
    "qce",
    "qce",
    "pbd",
    "pbd",
    "pbd",
    "rrr",
]
BULLET_RIFLE = [
    ".q.",
    "qce",
    "qce",
    "qce",
    "pbd",
    "pbd",
    "pbd",
    "pbd",
    "rrr",
]
BULLET_SHELL = [
    "QQQz",
    "xXXz",
    "xXXz",
    "xXXz",
    "xXXz",
    "pbbd",
    "rrrr",
]


def glyph(mask, diagonal=False, colors=GLYPH, ol=OUTLINE):
    return outline(bevel_fill(mask, **colors), color=ol, diagonal=diagonal)


def bullet_mask(cv, x, top=1, bottom=6, w=3):
    """Vertical cartridge glyph: 1px pointed tip, body w wide."""
    if w == 3:
        cv.px(x + 1, top)
        cv.rect(x, top + 1, x + 2, bottom)
    else:
        cv.rect(x, top, x + w - 1, bottom)
    return cv


def mode_semi():
    cv = bullet_mask(Canvas(16, 8), 6)
    img = glyph(cv.mask)
    shade_head(img, 6)
    return img


def shade_head(img, x):
    """Bullet head (tip + 2 rows) in cool grey so it reads apart from the white case."""
    img[1, x + 1] = hx("#d9dce1")
    img[2, x:x + 3] = (hx("#e3e5e9"), hx("#c3c7cd"), hx("#9da2aa"))
    img[3, x:x + 3] = (hx("#c3c7cd"), hx("#a6abb2"), hx("#878c94"))


def mode_burst():
    cv = Canvas(16, 8)
    for x in (1, 6, 11):
        bullet_mask(cv, x)
    img = glyph(cv.mask)
    for x in (1, 6, 11):
        shade_head(img, x)
    return img


def mode_auto():
    """Five rounds packed shoulder to shoulder: a continuous stream."""
    cv = Canvas(16, 8)
    xs = (1, 4, 7, 10, 13)
    for x in xs:
        cv.rect(x, 1, x + 1, 6)
    img = glyph(cv.mask)
    for x in xs:
        img[1, x] = hx("#d6d8dc")
        img[1, x + 1] = hx("#a9acb2")
        img[3, x:x + 2] = hx("#9ca0a8")
    for x in (3, 6, 9, 12):
        img[1:7, x] = hx(OUTLINE)
    return img


def mode_bolt():
    cv = Canvas(16, 8)
    cv.rect(1, 2, 9, 3)          # bolt body
    cv.rect(0, 2, 0, 3)
    cv.line([(9, 4), (11, 6)])   # handle stem
    cv.line([(10, 4), (11, 5)])
    cv.ellipse(11, 4, 14, 7)     # knob
    m = cv.mask
    m[:, 0] = False
    img = glyph(m, diagonal=True)
    img[2:4, 3] = hx("#9ca0a8")
    return img


def mode_pump():
    cv = Canvas(16, 8)
    cv.rect(4, 2, 11, 5)       # forend
    cv.poly([(2, 1), (2, 6), (0, 3.5)])   # left arrow
    cv.poly([(13, 1), (13, 6), (15, 3.5)])  # right arrow
    m = cv.mask
    m[:, 0] = False
    m[:, 15] = False
    img = glyph(m, diagonal=True)
    for x in (6, 8, 10):
        img[3:5, x] = hx("#8f939a")
    return img


def hitmarker(kind):
    cv = Canvas(15, 15)
    thick = kind == "kill"
    for (x0, y0, x1, y1) in ((2, 2, 5, 5), (12, 2, 9, 5), (2, 12, 5, 9), (12, 12, 9, 9)):
        cv.line([(x0, y0), (x1, y1)])
        if thick:
            dx = 1 if x1 > x0 else -1
            cv.line([(x0 + dx, y0), (x1, y1 - (1 if y1 > y0 else -1))])
            cv.line([(x0, y0 + (1 if y1 > y0 else -1)), (x1 - dx, y1)])
    m = cv.mask
    if kind == "normal":
        cols = dict(base="#f4f4f4", hi="#ffffff", lo="#c6c8cc")
    elif kind == "head":
        cols = dict(base="#ff8a3d", hi="#ffb77d", lo="#d9531f")
    else:
        cols = dict(base="#ea2a2a", hi="#ff6a5a", lo="#a81414")
    return outline(bevel_fill(m, **cols), color=OUTLINE, diagonal=True)


RED_STOPS = [(0.0, (255, 30, 30, 0)), (0.25, (255, 40, 36, 90)), (0.55, (255, 52, 44, 210)),
             (0.8, (255, 110, 96, 255)), (1.0, (255, 220, 210, 255))]
AMBER_STOPS = [(0.0, (255, 150, 20, 0)), (0.25, (255, 160, 26, 90)), (0.55, (255, 176, 36, 220)),
               (0.8, (255, 205, 92, 255)), (1.0, (255, 240, 200, 255))]


def reticle_red_dot():
    def fn(X, Y):
        r = np.hypot(X - 7.5, Y - 7.5)
        core = np.clip(1.9 - r, 0, 1)
        glow = np.exp(-(r ** 2) / (2 * 2.0 ** 2)) * 0.62
        inten = np.clip(np.maximum(core * 0.85 + np.clip(0.9 - r, 0, 1) * 0.2, glow), 0, 1)
        return ramp(inten, RED_STOPS)
    return supersample(fn, 15, 15, 4)


def seg_dist(X, Y, x0, y0, x1, y1):
    dx, dy = x1 - x0, y1 - y0
    t = np.clip(((X - x0) * dx + (Y - y0) * dy) / (dx * dx + dy * dy), 0, 1)
    return np.hypot(X - (x0 + t * dx), Y - (y0 + t * dy))


def reticle_holo():
    def fn(X, Y):
        r = np.hypot(X - 15.5, Y - 15.5)
        ring = np.clip(1.0 - np.abs(r - 12.0) / 0.75, 0, 1)
        dot = np.clip(1.6 - r, 0, 1)
        d = np.full(X.shape, 99.0)
        for (x0, y0, x1, y1) in ((15.5, 1.2, 15.5, 2.8), (15.5, 28.2, 15.5, 29.8),
                                 (1.2, 15.5, 2.8, 15.5), (28.2, 15.5, 29.8, 15.5)):
            d = np.minimum(d, seg_dist(X, Y, x0, y0, x1, y1))
        ticks = np.clip(1.0 - d / 0.7, 0, 1)
        shape = np.maximum(np.maximum(ring, dot), ticks)
        glow = (np.exp(-((r - 12.0) ** 2) / (2 * 1.4 ** 2)) * 0.35 + np.exp(-(r ** 2) / (2 * 2.2 ** 2)) * 0.5)
        inten = np.clip(np.maximum(shape * 0.86, glow), 0, 1)
        return ramp(inten, RED_STOPS)
    return supersample(fn, 31, 31, 4)


def reticle_acog():
    def fn(X, Y):
        segs = [(15.5, 13.0, 11.0, 18.0), (15.5, 13.0, 20.0, 18.0)]  # chevron
        d = np.full(X.shape, 99.0)
        for s in segs:
            d = np.minimum(d, seg_dist(X, Y, *s))
        chev = np.clip(1.35 - d, 0, 1)
        st = np.full(X.shape, 99.0)
        for s in [(15.5, 20.0, 15.5, 29.0), (12.0, 22.5, 19.0, 22.5), (13.0, 25.5, 18.0, 25.5),
                  (14.0, 28.5, 17.0, 28.5)]:
            st = np.minimum(st, seg_dist(X, Y, *s))
        stadia = np.clip(1.0 - st / 0.6, 0, 1)
        glow = np.exp(-(d ** 2) / (2 * 1.6 ** 2)) * 0.45 + np.exp(-(st ** 2) / (2 * 1.0 ** 2)) * 0.2
        inten = np.clip(np.maximum(np.maximum(chev, stadia * 0.82), glow), 0, 1)
        return ramp(inten, AMBER_STOPS)
    return supersample(fn, 31, 31, 4)


def heat_bar_background():
    img = np.zeros((4, 64, 4), np.uint8)
    img[:, :] = hx("#2a2c31", 210)
    img[0, :] = hx("#0e0f11")
    img[3, :] = hx("#0e0f11")
    img[:, 0] = hx("#0e0f11")
    img[:, 63] = hx("#0e0f11")
    img[1, 1:63] = hx("#1c1d21", 220)
    img[2, 1:63] = hx("#34373d", 210)
    for x in range(8, 63, 8):  # faint graduations
        img[1:3, x] = hx("#40434a", 220)
    return img


def heat_bar_fill():
    xs = np.linspace(0, 1, 64)
    base = ramp(xs[None, :], [(0.0, "#ffe04a"), (0.45, "#ffa126"), (0.8, "#ff5a1e"), (1.0, "#ff2a2a")])[0]
    img = np.zeros((4, 64, 4))
    img[0] = np.concatenate([base[:, :3] * 0.62, np.full((64, 1), 255)], axis=1)
    img[1] = np.concatenate([np.minimum(255, base[:, :3] * 1.0 + 70), np.full((64, 1), 255)], axis=1)
    img[2] = np.concatenate([base[:, :3], np.full((64, 1), 255)], axis=1)
    img[3] = np.concatenate([base[:, :3] * 0.55, np.full((64, 1), 255)], axis=1)
    return img


def generate():
    sprites = {
        "bullet_pistol": (grid_sprite(BULLET_PISTOL, AMMO_PAL), (3, 7)),
        "bullet_rifle": (grid_sprite(BULLET_RIFLE, AMMO_PAL), (3, 9)),
        "bullet_shell": (grid_sprite(BULLET_SHELL, AMMO_PAL), (4, 7)),
        "mode_semi": (mode_semi(), (16, 8)),
        "mode_burst": (mode_burst(), (16, 8)),
        "mode_auto": (mode_auto(), (16, 8)),
        "mode_bolt": (mode_bolt(), (16, 8)),
        "mode_pump": (mode_pump(), (16, 8)),
        "hitmarker": (hitmarker("normal"), (15, 15)),
        "hitmarker_head": (hitmarker("head"), (15, 15)),
        "hitmarker_kill": (hitmarker("kill"), (15, 15)),
        "reticle_red_dot": (reticle_red_dot(), (15, 15)),
        "reticle_holo": (reticle_holo(), (31, 31)),
        "reticle_acog": (reticle_acog(), (31, 31)),
        "heat_bar_background": (heat_bar_background(), (64, 4)),
        "heat_bar_fill": (heat_bar_fill(), (64, 4)),
    }
    out = []
    for name, (arr, size) in sprites.items():
        rel = f"gui/sprites/hud/{name}"
        save(rel, arr, size)
        out.append(rel)
    return out
