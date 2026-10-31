"""Technique / effect textures (entity/technique/*).

These are drawn as float RGB + alpha and stored *premultiplied* (colour fades
with alpha, transparent = black) so they work with additive and translucent
blending alike.
"""
from __future__ import annotations

import math

import numpy as np

import texlib as T

PI = math.pi


def save_fx(rgb, a, rel):
    T.save(T.from_float(rgb, a, premultiply=True), f"entity/technique/{rel}")
    return T.from_float(rgb, a, premultiply=True)


def colormap(v, stops):
    """v: array 0..1; stops: list of (pos, (r,g,b) 0..255). Returns (...,3) floats 0..1."""
    v = np.clip(v, 0, 1)
    pos = np.array([s[0] for s in stops])
    cols = np.array([s[1] for s in stops], float) / 255
    out = np.zeros(v.shape + (3,))
    for c in range(3):
        out[..., c] = np.interp(v, pos, cols[:, c])
    return out


def periodic_noise_1d(n, cells, seed, octaves=3):
    rng = np.random.default_rng(seed)
    out = np.zeros(n)
    amp, norm = 1.0, 0.0
    for o in range(octaves):
        c = cells * 2 ** o
        lat = rng.random(c)
        x = np.arange(n) / n * c
        i = np.floor(x).astype(int)
        f = x - i
        f = f * f * (3 - 2 * f)
        out += amp * (lat[i % c] * (1 - f) + lat[(i + 1) % c] * f)
        norm += amp
        amp *= 0.5
    return out / norm


def sample_polar_noise(theta, r, ang_cells, rad_cells, seed, n=512):
    """Noise sampled in polar coords; periodic in angle."""
    tex = T.fbm(n, n, base_cells=ang_cells, octaves=4, seed=seed)
    u = ((theta / (2 * PI)) % 1.0) * (n - 1)
    v = np.clip(r, 0, 1) * (n - 1) * (rad_cells / ang_cells) % (n - 1)
    return tex[v.astype(int), u.astype(int)]


# --------------------------------------------------------------------- glow
def glow():
    w = 64
    x, y = T.grid(w, w)
    r = np.hypot(x, y) / (w / 2)
    a = np.clip(1 - r * r, 0, 1) ** 2.2
    rgb = np.ones((w, w, 3))
    return save_fx(rgb, a, "glow.png")


# ----------------------------------------------------------------- blue orb
def blue_orb():
    w = 64
    x, y = T.grid(w, w)
    r = np.hypot(x, y) / (w / 2)
    th = np.arctan2(y, x)
    # logarithmic spiral arms; image y points down so +theta is clockwise on screen.
    # arms trail so the vortex reads as turning counter-clockwise.
    arms = 3
    phase = arms * th + 5.2 * np.log(np.maximum(r, 0.02))
    spiral = (0.5 + 0.5 * np.cos(phase)) ** 2.5
    turb = sample_polar_noise(th, r, 8, 4, seed=11)
    spiral = spiral * (0.65 + 0.7 * turb)
    env_arm = np.clip(1 - r, 0, 1) ** 1.2 * T.smoothstep(0.05, 0.25, r)
    core = np.exp(-(r / 0.22) ** 2.4)
    halo = np.exp(-(r / 0.45) ** 2) * 0.6
    rim = np.exp(-((r - 0.78) / 0.12) ** 2) * 0.25 * (0.6 + 0.8 * turb)
    inten = core * 1.5 + spiral * env_arm * 1.15 + halo * 0.6 + rim
    edge = 1 - T.smoothstep(0.82, 1.0, r)
    inten *= edge
    v = np.clip(inten, 0, 1.3)
    rgb = colormap(v / 1.3, [(0.0, (6, 14, 70)), (0.18, (14, 40, 160)), (0.38, (30, 110, 250)),
                             (0.6, (80, 190, 255)), (0.8, (170, 235, 255)), (1.0, (245, 255, 255))])
    a = np.clip(inten * 1.15, 0, 1)
    return save_fx(rgb, a, "blue_orb.png")


# ------------------------------------------------------------------ red orb
def red_orb():
    w = 64
    x, y = T.grid(w, w)
    r = np.hypot(x, y) / (w / 2)
    th = np.arctan2(y, x)
    n_ang = 1024
    streak_noise = periodic_noise_1d(n_ang, 24, seed=5, octaves=3)
    idx = (((th / (2 * PI)) % 1.0) * n_ang).astype(int) % n_ang
    s = streak_noise[idx]
    streak_len = 0.45 + 0.6 * (s ** 2)          # how far each angular streak reaches
    streaks = np.clip(1 - r / streak_len, 0, 1) ** 1.6 * (0.4 + 0.9 * (s ** 3))
    core = np.exp(-(r / 0.2) ** 2)
    body = np.exp(-(r / 0.42) ** 2)
    inten = core * 1.4 + body * 0.75 + streaks * 0.9
    # crackles: jagged radial lightning lines
    rng = np.random.default_rng(9)
    crack = np.zeros((w, w))
    for k in range(9):
        ang = rng.uniform(0, 2 * PI)
        px, py = w / 2, w / 2
        length = rng.uniform(16, 29)
        steps = int(length)
        for st in range(steps):
            ang += rng.normal(0, 0.35)
            px += math.cos(ang)
            py += math.sin(ang)
            ix, iy = int(px), int(py)
            if 0 <= ix < w and 0 <= iy < w:
                crack[iy, ix] = max(crack[iy, ix], 1 - st / steps)
    crack_glow = T.blur(crack, 1) * 1.6
    inten = inten + crack * 0.9 + crack_glow * 0.5
    inten *= 1 - T.smoothstep(0.85, 1.0, r)
    v = np.clip(inten / 1.6, 0, 1)
    rgb = colormap(v, [(0.0, (90, 0, 8)), (0.2, (190, 10, 20)), (0.42, (255, 50, 25)),
                       (0.62, (255, 130, 50)), (0.82, (255, 220, 160)), (1.0, (255, 255, 250))])
    a = np.clip(inten * 1.2, 0, 1)
    return save_fx(rgb, a, "red_orb.png")


# ------------------------------------------------------------- hollow purple
def lightning_path(rng, x0, y0, ang, length, jitter=0.45, step=1.0):
    pts = [(x0, y0)]
    x, y = x0, y0
    for _ in range(int(length / step)):
        ang += rng.normal(0, jitter)
        x += math.cos(ang) * step
        y += math.sin(ang) * step
        pts.append((x, y))
    return pts


def raster_path(w, h, pts, ss=1):
    m = np.zeros((h, w))
    for (x0, y0), (x1, y1) in zip(pts[:-1], pts[1:]):
        for t in np.linspace(0, 1, 4):
            x = x0 + (x1 - x0) * t
            y = y0 + (y1 - y0) * t
            ix, iy = int(x), int(y)
            if 0 <= ix < w and 0 <= iy < h:
                m[iy, ix] = 1
    return m


def purple_orb():
    w = 128
    x, y = T.grid(w, w)
    R = 61.0
    r = np.hypot(x, y) / R
    th = np.arctan2(y, x)
    inside = T.ss_mask(w, w, lambda X, Y: np.hypot(X - w / 2, Y - w / 2) <= R, ss=4)
    turb = T.fbm(w, w, base_cells=5, octaves=5, seed=21)
    swirl = sample_polar_noise(th + 2.0 * r, r, 6, 3, seed=33)
    # sphere shading: bright core, violet body, magenta/indigo rim
    core = np.exp(-(r / 0.28) ** 2)
    body = 0.55 + 0.25 * swirl + 0.15 * turb
    rim = np.exp(-((r - 0.93) / 0.07) ** 2)
    v = np.clip(core * 0.85 + body * 0.55 * (1 - r ** 3) + 0.05, 0, 1)
    rgb = colormap(v, [(0.0, (40, 6, 90)), (0.3, (98, 22, 190)), (0.5, (150, 60, 235)),
                       (0.7, (200, 140, 255)), (0.88, (238, 215, 255)), (1.0, (255, 252, 255))])
    # rim colour: magenta on top-left, indigo bottom-right
    rim_col = colormap(0.5 + 0.5 * np.cos(th + PI * 0.75), [(0, (60, 20, 200)), (1, (255, 40, 200))])
    rgb = rgb * (1 - rim[..., None] * 0.85) + rim_col * rim[..., None] * 0.95
    # electric arcs
    rng = np.random.default_rng(77)
    arcs = np.zeros((w, w))
    for k in range(14):
        ang = rng.uniform(0, 2 * PI)
        start_r = rng.uniform(0.0, 0.35) * R
        pts = lightning_path(rng, w / 2 + math.cos(ang) * start_r, w / 2 + math.sin(ang) * start_r,
                             ang + rng.normal(0, 0.4), rng.uniform(25, 60), jitter=0.5, step=1.5)
        arcs = np.maximum(arcs, raster_path(w, w, pts))
        # small branches
        for _ in range(2):
            j = rng.integers(len(pts) // 3, len(pts))
            bx, by = pts[j]
            bp = lightning_path(rng, bx, by, ang + rng.choice([-1, 1]) * rng.uniform(0.5, 1.2),
                                rng.uniform(6, 16), jitter=0.6, step=1.2)
            arcs = np.maximum(arcs, raster_path(w, w, bp) * 0.8)
    arc_glow = T.blur(arcs, 2)
    arc_col = np.array([0.95, 0.88, 1.0])
    glow_col = np.array([0.8, 0.45, 1.0])
    rgb = rgb * (1 - arcs[..., None] * 0.9) + arc_col * arcs[..., None] * 0.95
    rgb = np.clip(rgb + glow_col * arc_glow[..., None] * 0.9, 0, 1)
    a = np.clip(0.82 + core * 0.2 + rim * 0.2 + arcs * 0.2, 0, 1) * inside
    return save_fx(rgb, a, "purple_orb.png")


# --------------------------------------------------------------------- ring
def ring():
    w = 128
    x, y = T.grid(w, w)
    r = np.hypot(x, y)
    R = 56.0
    d = r - R
    inten = np.exp(-(d / 1.1) ** 2) + 0.55 * np.where(d < 0, np.exp(-(d / 5.5) ** 2), np.exp(-(d / 3.5) ** 2))
    inten += 0.12 * np.where(d < 0, np.exp(-(d / 14) ** 2), 0)
    inten *= 1 - T.smoothstep(61, 64, r)
    a = np.clip(inten, 0, 1)
    rgb = np.ones((w, w, 3))
    rgb[..., 0] = 0.92 + 0.08 * np.clip(inten, 0, 1)  # faintly cool outside the core
    return save_fx(rgb, a, "ring.png")


# --------------------------------------------------------------------- slash
def crescent_field(w, h):
    """Signed distances for a crescent spanning the texture width.
    Returns (dist_from_outer_edge (px, + inside), thickness_profile, tip_env)."""
    x, y = T.grid(w, h, cx=0, cy=0)
    # outer arc: circle through (4, h-3), (w/2, 3), (w-4, h-3)
    xa, ya = 4.0, h - 4.0
    xm, ym = w / 2, 3.0
    cy_ = (xa - xm) ** 2 / (2 * (ya - ym)) + (ya + ym) / 2
    cx_ = w / 2
    R = cy_ - ym
    rr = np.hypot(x - cx_, y - cy_)
    depth = R - rr                      # >0 inside the outer circle (below the arc)
    u = np.clip((x - 4) / (w - 8), 0, 1)  # 0..1 along the arc
    thickness = 11.0 * np.sin(PI * u) ** 1.3
    tip = T.smoothstep(0.0, 0.08, u) * T.smoothstep(0.0, 0.08, 1 - u)
    return depth, thickness, tip, u


def slash(red=False):
    w, h = 128, 32
    depth, thick, tip, u = crescent_field(w, h)
    th_safe = np.maximum(thick, 0.3)
    t = depth / th_safe                                  # 0 at leading edge, 1 at inner edge
    edge = np.exp(-(depth / 0.85) ** 2) * (depth > -1.6)
    inside = (depth >= 0) & (depth <= thick)
    body = np.where(inside, np.clip(1 - t, 0, 1) ** 1.8, 0.0)
    # wispy streaks parallel to the edge, stronger toward the trailing side
    streak_n = periodic_noise_1d(256, 12, seed=3 if not red else 6, octaves=3)
    k = np.clip((u * 255).astype(int), 0, 255)
    streaks = 0.75 + 0.5 * np.sin(depth * 2.2 + streak_n[k] * 9.0)
    body = body * np.clip(streaks, 0.3, 1.2)
    inten = (edge * 1.0 + body * 0.8) * tip * np.clip(thick / 2.5, 0, 1)
    inten = np.clip(inten, 0, 1)
    if not red:
        rgb = colormap(inten, [(0.0, (120, 140, 180)), (0.35, (185, 200, 228)), (0.7, (228, 236, 252)),
                               (1.0, (255, 255, 255))])
        a = inten
        name = "slash.png"
    else:
        rgb = colormap(inten, [(0.0, (20, 0, 4)), (0.25, (90, 0, 12)), (0.5, (180, 8, 28)),
                               (0.78, (240, 40, 55)), (1.0, (255, 175, 175))])
        # black fringe hugging the leading edge (outside) and the inner edge
        fringe = (np.exp(-((depth + 1.6) / 0.7) ** 2) +
                  np.where(depth > 0, np.exp(-((depth - thick) / 0.9) ** 2), 0)) * tip * np.clip(thick / 3, 0, 1)
        fringe = np.clip(fringe, 0, 1)
        a = np.clip(inten + fringe * 0.6, 0, 1)
        rgb = rgb * (1 - fringe[..., None] * 0.9)
        name = "slash_red.png"
    return save_fx(rgb, a, name)


# --------------------------------------------------------------- world slash
def world_slash():
    w, h = 256, 16
    x, y = T.grid(w, h, cx=0, cy=0)
    d = np.abs(y - 8.0)                     # rows 7 and 8 are the core
    core = np.exp(-(d / 0.62) ** 2)
    bloom = np.exp(-d / 2.2) * 0.5 + np.exp(-(d / 6.0) ** 2) * 0.2
    u = x / w
    env = T.smoothstep(0.0, 0.18, u) * T.smoothstep(0.0, 0.18, 1 - u)
    shimmer = 0.85 + 0.15 * periodic_noise_1d(w, 32, seed=4)[None, :]
    inten = (core * 1.2 + bloom * shimmer) * env
    a = np.clip(inten, 0, 1)
    white = np.ones((h, w, 3))
    cyan = np.zeros((h, w, 3))
    cyan[...] = (0.72, 0.95, 1.0)
    mix = np.clip(core * 1.3, 0, 1)[..., None]
    rgb = white * mix + cyan * (1 - mix)
    return save_fx(rgb, a, "world_slash.png")


# ----------------------------------------------------------------- fuga arrow
def fuga_arrow():
    w, h = 64, 16
    x, y = T.grid(w, h, cx=0, cy=0)
    cy = 8.0
    dy = np.abs(y - cy)
    # arrow head: broad flaming triangle, base at x=49 (half height 5), tip at x=63.5
    hx0, tipx = 48.0, 63.5
    head_half = np.clip((tipx - x) / (tipx - hx0) * 5.2, 0, 5.2) * (x >= hx0 - 0.5)
    head_t = np.where(head_half > 0, dy / np.maximum(head_half, 1e-3), 9)
    head = np.clip(1.15 - head_t, 0, 1) ** 0.6 * (x < tipx)
    head_heat = np.clip(1.25 - head_t * 1.1, 0, 1)
    # shaft core
    shaft = np.exp(-(dy / 0.9) ** 2.2) * T.smoothstep(3, 22, x) * (x < 52)
    # flames trailing left, tongues from stretched turbulence
    dist = np.clip((54 - x) / 50, 0, 1)
    width = 2.0 + 5.8 * dist ** 0.7
    n = T.fbm(w, h, base_cells=4, octaves=4, seed=8, aspect=0.4)
    n2 = T.fbm(w, h, base_cells=6, octaves=3, seed=19, aspect=0.5)
    ft = dy / (width * (0.5 + 0.95 * n))
    flame = np.clip(1 - ft, 0, 1) ** 0.9
    flame *= T.smoothstep(0.0, 0.35, 1 - dist) * (0.75 + 0.45 * n2) * (x < 54)
    flame_heat = np.clip(1 - ft * 1.1, 0, 1) * (1 - dist * 0.55)
    inten = np.clip(np.maximum.reduce([head, shaft * 1.1, flame]), 0, 1)
    heat = np.clip(np.maximum.reduce([head_heat * head, shaft, flame_heat * flame * 0.95]), 0, 1)
    rgb = colormap(heat, [(0.0, (120, 10, 0)), (0.2, (205, 40, 6)), (0.42, (250, 105, 18)),
                          (0.64, (255, 175, 50)), (0.84, (255, 236, 150)), (1.0, (255, 255, 240))])
    a = np.clip(inten * 1.05, 0, 1)
    return save_fx(rgb, a, "fuga_arrow.png")


# ---------------------------------------------------------------- void stars
def void_stars():
    w, h = 256, 128
    rng = np.random.default_rng(1234)
    xs = np.arange(w)
    ys = np.arange(h)
    X, Y = np.meshgrid(xs, ys)
    lat = (Y + 0.5) / h * PI - PI / 2          # -pi/2..pi/2
    lon = (X + 0.5) / w * 2 * PI
    # base: near-black indigo with slight vertical gradient
    base = np.zeros((h, w, 3))
    base[...] = np.array([6, 5, 20]) / 255
    base += (np.array([10, 6, 26]) / 255) * (1 - np.abs(lat[..., None]) / (PI / 2))
    # galaxy band: sinusoidal path around the sphere (periodic in x)
    band_c = 0.32 * np.sin(lon + 0.6) + 0.08 * np.sin(2 * lon + 1.3)
    d = (lat - band_c)
    neb = T.fbm(w, h, base_cells=6, octaves=6, seed=7)
    neb2 = T.fbm(w, h, base_cells=12, octaves=4, seed=8)
    band = np.exp(-(d / 0.2) ** 2) * (0.4 + 0.9 * neb) ** 2
    dust = np.exp(-(d / 0.08) ** 2) * T.smoothstep(0.45, 0.75, neb2)   # dark dust lane
    glow_col = colormap(np.clip(neb2 * 1.2, 0, 1), [(0, (90, 60, 170)), (0.5, (160, 140, 230)),
                                                    (0.8, (140, 220, 255)), (1, (240, 240, 255))])
    img = base + glow_col * band[..., None] * 0.55 - dust[..., None] * 0.12
    # faint wide nebula clouds
    clouds = T.smoothstep(0.55, 0.85, T.fbm(w, h, base_cells=3, octaves=5, seed=99))
    img += np.array([0.14, 0.05, 0.25]) * clouds[..., None] * 0.6
    # stars (uniform on the sphere: sample latitude with arcsin)
    n_stars = 3400
    lats = np.arcsin(rng.uniform(-1, 1, n_stars))
    lons = rng.uniform(0, 2 * PI, n_stars)
    # extra density in the galaxy band
    extra = 1600
    lon_b = rng.uniform(0, 2 * PI, extra)
    lat_b = 0.32 * np.sin(lon_b + 0.6) + 0.08 * np.sin(2 * lon_b + 1.3) + rng.normal(0, 0.12, extra)
    lats = np.concatenate([lats, lat_b])
    lons = np.concatenate([lons, lon_b])
    mag = rng.power(0.25, lats.size)            # mostly faint, a few bright
    px = (lons / (2 * PI) * w).astype(int) % w
    py = np.clip(((lats + PI / 2) / PI * h).astype(int), 0, h - 1)
    tint_choice = rng.random(lats.size)
    stars = np.zeros((h, w, 3))
    for i in range(lats.size):
        b = 0.18 + 0.82 * mag[i]
        if tint_choice[i] < 0.15:
            col = np.array([0.7, 0.85, 1.0])
        elif tint_choice[i] < 0.25:
            col = np.array([0.9, 0.8, 1.0])
        elif tint_choice[i] < 0.3:
            col = np.array([1.0, 0.9, 0.8])
        else:
            col = np.array([1.0, 1.0, 1.0])
        stars[py[i], px[i]] = np.maximum(stars[py[i], px[i]], col * b)
        if mag[i] > 0.93:  # bright star: small cross
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                yy = py[i] + dy
                if 0 <= yy < h:
                    xx = (px[i] + dx) % w
                    stars[yy, xx] = np.maximum(stars[yy, xx], col * b * 0.45)
    img = np.maximum(img, stars) + stars * 0.15
    # light streaks (thin diagonal lines, wrap horizontally)
    for k in range(9):
        x0 = rng.uniform(0, w)
        y0 = rng.uniform(16, h - 16)
        ang = rng.uniform(-0.35, 0.35)
        length = rng.uniform(14, 40)
        col = np.array([0.75, 0.9, 1.0]) if k % 2 else np.array([0.9, 0.8, 1.0])
        for s in np.linspace(0, 1, int(length * 2)):
            xx = int(x0 + math.cos(ang) * length * s) % w
            yy = int(y0 + math.sin(ang) * length * s)
            if 0 <= yy < h:
                fall = math.sin(PI * s) ** 1.5 * 0.55
                img[yy, xx] = np.maximum(img[yy, xx], col * fall)
    img = np.clip(img, 0, 1)
    out = T.from_float(img, np.ones((h, w)))
    T.save(out, "entity/technique/void_stars.png")
    return out


# --------------------------------------------------------- infinity ripple
def infinity_ripple():
    w = 64
    x, y = T.grid(w, w)
    r = np.hypot(x, y) / (w / 2)
    rings = (0.5 + 0.5 * np.cos(2 * PI * r * 5.0 - 0.6)) ** 3
    env = T.smoothstep(0.06, 0.3, r) * (1 - T.smoothstep(0.7, 1.0, r))
    fade_out = 1 - 0.55 * r                     # inner rings slightly stronger
    a = np.clip(rings * env * fade_out * 0.42 + 0.05 * env, 0, 1)
    rgb = np.zeros((w, w, 3))
    rgb[...] = (0.78, 0.96, 1.0)
    return save_fx(rgb, a, "infinity_ripple.png")


def main():
    items = [("glow", glow()), ("blue_orb", blue_orb()), ("red_orb", red_orb()),
             ("purple_orb", purple_orb()), ("ring", ring()), ("slash", slash()),
             ("slash_red", slash(True)), ("world_slash", world_slash()), ("fuga_arrow", fuga_arrow()),
             ("void_stars", void_stars()), ("infinity_ripple", infinity_ripple())]
    out = T.SCRATCH / "preview"
    # preview on black (additive look) and on checker
    from PIL import Image
    blk = []
    for name, img in items:
        bg = np.zeros_like(img)
        bg[..., 3] = 255
        # additive preview: premultiplied rgb added on black
        add = bg.copy()
        add[..., :3] = np.clip(img[..., :3].astype(int), 0, 255)
        blk.append((name + " (add)", add))
    T.contact_sheet(items, out / "effects_checker.png", k=4, cols=4)
    T.contact_sheet(blk, out / "effects_additive.png", k=4, cols=4)
    print("effects done")


if __name__ == "__main__":
    main()
