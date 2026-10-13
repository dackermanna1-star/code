"""Material textures (ASSET_SPEC 3.1): 32x32 seamless tiles sampled by model faces.

Model faces sample sub-rectangles of these tiles at 2 texels per model pixel, so every
material keeps its detail at the 1-3 texel scale: per-texel noise (stipple), faint
machining lines / grain, light wear. All noise is generated on a torus so tiles are seamless.
Each material is quantised onto a small hand-picked palette (dark -> light) for a crisp,
Minecraft-compatible pixel look.
"""
from __future__ import annotations

import numpy as np

from texlib import (TAU, blur_wrap, fbm, frames_to_strip, hx, palette_map, ramp, rng, save, save_mcmeta,
                    to_rgba, torus_dist, wrap_line, wrap_polyline)

S = 32  # tile size
YY, XX = np.mgrid[0:S, 0:S]
ANIM_META = {"animation": {"frametime": 2, "interpolate": True}}


# ---------------------------------------------------------------------------
# field building blocks (all return S x S float arrays, roughly zero-mean unless noted)
# ---------------------------------------------------------------------------

def stipple(g, amp):
    return (g.random((S, S)) - 0.5) * 2 * amp


def lowfreq(g, amp, cells=2, octaves=3):
    return (fbm(S, S, g, cells=cells, octaves=octaves) - 0.5) * 2 * amp


def brushed(g, amp, streak=0.5):
    """Horizontal machining / brushing lines: per-row values smeared along u."""
    rows = g.random((S, 1)) - 0.5
    long = fbm(S, S, g, cells=4, octaves=3, stretch_x=0.25) - 0.5
    row_field = np.repeat(rows, S, axis=1)
    # occasional row breaks so lines are not perfectly continuous
    breaks = blur_wrap(g.random((S, S)) - 0.5, 0.4, 3.0)
    return (row_field * (1 - streak) + long * streak + breaks * 0.6) * 2 * amp


def specks(g, density, amp, size=1):
    m = (g.random((S, S)) < density).astype(float)
    if size > 1:
        m = np.maximum(m, np.roll(m, 1, axis=1) * (g.random((S, S)) < 0.5))
    return m * amp


def scratches(g, count, amp, min_len=3, max_len=8, angles=(0, 0, 0, 1, -1)):
    """Faint thin scratch lines (wrapping). angles: dy per step choice (0=horizontal)."""
    m = np.zeros((S, S))
    for _ in range(count):
        x0, y0 = int(g.integers(0, S)), int(g.integers(0, S))
        ln = int(g.integers(min_len, max_len + 1))
        a = angles[int(g.integers(0, len(angles)))]
        if a == 0:
            x1, y1 = x0 + ln, y0
        elif abs(a) == 1:
            x1, y1 = x0 + ln, y0 + a * (ln // 2)
        else:
            x1, y1 = x0 + ln, y0 + a * ln
        wrap_line(m, x0, y0, x1, y1, 1.0)
    return m * amp


def sheen_band(amp, period=32, phase=0.0, axis="y"):
    t = (YY if axis == "y" else XX) + 0.5
    return amp * np.cos(TAU * (t / period) - phase)


def finish(rgb):
    return to_rgba(rgb)


# ---------------------------------------------------------------------------
# palettes (dark -> light)
# ---------------------------------------------------------------------------

P = {
    "black_polymer": ["#141416", "#1b1b1e", "#222226", "#2a2a2f", "#333339", "#404047"],
    "od_polymer": ["#2c3022", "#363b2a", "#414733", "#4c533c", "#575f45", "#646d50"],
    "tan_polymer": ["#6c5a41", "#7a684c", "#887557", "#968261", "#a38f6b", "#b29e78"],
    "grey_polymer": ["#3a3c40", "#44464b", "#4e5055", "#585b60", "#63666c", "#71747a"],
    "walnut_wood": ["#3a1f11", "#4a2916", "#5a331c", "#6a3e22", "#7a4929", "#8b5530", "#9c6239"],
    "dark_walnut": ["#1c100a", "#25150d", "#2f1b10", "#392114", "#432818", "#4f301d", "#5b3923"],
    "blued_steel": ["#0c0f15", "#12161f", "#181d29", "#1f2534", "#272f41", "#313b51", "#3f4b66", "#55658a"],
    "parkerized": ["#2a2e29", "#333831", "#3c4139", "#454b42", "#4f564b", "#5a6155"],
    "dark_steel": ["#1c1e21", "#24272b", "#2c3034", "#35393e", "#3f4349", "#4a4f56", "#585e66"],
    "stainless": ["#7c8289", "#8d939a", "#9ea4ab", "#afb5bb", "#bfc5cb", "#cfd4d9", "#e2e6ea"],
    "gunmetal": ["#2c3036", "#353a40", "#3f444b", "#494f57", "#545b64", "#616872", "#6f7781"],
    "black_anodized": ["#151619", "#1a1b1f", "#1f2125", "#25272c", "#2c2e34", "#35383e"],
    "brass": ["#5a3f15", "#76561e", "#94702a", "#b18a38", "#c9a247", "#ddb95a", "#eed27c", "#fbe9ab"],
    "copper": ["#47200f", "#602d17", "#7a3b20", "#93492a", "#ad5a35", "#c46e43", "#d98858", "#eca87c"],
    "red_plastic": ["#460d0d", "#5e1313", "#761919", "#8e2020", "#a42828", "#b83333", "#ca4640"],
    "green_plastic": ["#0e3014", "#143f1b", "#1a4e22", "#215d29", "#296d32", "#337f3b", "#409247"],
    "rubber": ["#0f0f11", "#141416", "#19191b", "#1e1e21", "#252528", "#2d2d31"],
}


def mat_from_field(name, field):
    return finish(palette_map(field, P[name]))


# ---------------------------------------------------------------------------
# base library
# ---------------------------------------------------------------------------

def polymer(name, seed, base=0.48):
    g = rng(seed)
    f = (base + lowfreq(g, 0.10, cells=2) + stipple(g, 0.20)
         + blur_wrap(stipple(g, 0.5), 0.6) * 0.35  # clustered stipple "bumps"
         + specks(g, 0.012, 0.35) - specks(g, 0.02, 0.22)
         + scratches(g, 2, 0.12, 3, 6))
    return mat_from_field(name, f)


def wood(name, seed, lines=7):
    g = rng(seed)
    warp = fbm(S, S, g, cells=2, octaves=3, stretch_x=0.5)  # varies slowly along u
    warp2 = fbm(S, S, g, cells=4, octaves=2, stretch_x=0.25)
    phase = TAU * (lines * (YY + 0.5) / S) + 3.2 * warp + 1.4 * warp2
    rings = 0.5 + 0.5 * np.sin(phase)
    # sharpen to get distinct late-wood lines
    late = np.clip((rings - 0.78) / 0.22, 0, 1) ** 1.5
    fibre = np.repeat(g.random((S, 1)) - 0.5, S, axis=1)
    fibre = blur_wrap(fibre + (g.random((S, S)) - 0.5) * 0.6, 0.3, 2.5)
    pores = np.zeros((S, S))
    for _ in range(14):
        x0, y0 = int(g.integers(0, S)), int(g.integers(0, S))
        wrap_line(pores, x0, y0, x0 + int(g.integers(1, 4)), y0, 1.0)
    f = (0.62 + 0.20 * (rings - 0.5) - 0.50 * late + 0.25 * fibre
         - 0.18 * pores + stipple(g, 0.05) + lowfreq(g, 0.06, cells=2))
    return mat_from_field(name, f)


def brushed_metal(name, seed, base=0.5, brush=0.10, low=0.08, st=0.08, sheen=0.0,
                  sheen_period=32, scr=3, spk=0.006, streak=0.5):
    g = rng(seed)
    f = (base + brushed(g, brush, streak=streak) + lowfreq(g, low, cells=2) + stipple(g, st)
         + sheen_band(sheen, sheen_period, phase=1.0) + scratches(g, scr, 0.16, 3, 7)
         + specks(g, spk, 0.3))
    return mat_from_field(name, f)


def parkerized(seed):
    g = rng(seed)
    crystals = blur_wrap(g.random((S, S)) - 0.5, 0.55) * 1.6
    f = (0.5 + crystals * 0.35 + stipple(g, 0.16) + lowfreq(g, 0.08, cells=2)
         + specks(g, 0.01, 0.3) + scratches(g, 1, 0.14, 3, 5))
    return mat_from_field("parkerized", f)


def black_anodized(seed):
    g = rng(seed)
    machining = np.repeat(np.where((np.arange(S) % 4) == 1, 0.06, 0.0)[:, None], S, axis=1)
    f = (0.5 + brushed(g, 0.06, streak=0.3) + stipple(g, 0.10) + lowfreq(g, 0.06)
         + machining + scratches(g, 2, 0.18, 2, 5) + specks(g, 0.006, 0.35))
    return mat_from_field("black_anodized", f)


def cased_metal(name, seed, band_amp=0.22):
    """Brass / copper: warm metal, highlight band along u (cylindrical reflection), period 16."""
    g = rng(seed)
    band = np.exp(-((((YY + 0.5) % 16) - 5.0) ** 2) / (2 * 1.6 ** 2)) * band_amp
    shadow = -np.exp(-((((YY + 0.5) % 16) - 12.5) ** 2) / (2 * 2.0 ** 2)) * 0.12
    f = (0.5 + band + shadow + brushed(g, 0.04, streak=0.6) + stipple(g, 0.05)
         + lowfreq(g, 0.04) + specks(g, 0.006, 0.22))
    return mat_from_field(name, f)


def hull_plastic(name, seed):
    g = rng(seed)
    ribs = np.repeat(np.where((np.arange(S) % 4) == 0, -0.10, np.where((np.arange(S) % 4) == 1, 0.06, 0))[:, None], S, axis=1)
    f = (0.5 + ribs + stipple(g, 0.10) + lowfreq(g, 0.08) + brushed(g, 0.03)
         + specks(g, 0.01, 0.25) + scratches(g, 1, 0.14, 2, 4))
    return mat_from_field(name, f)


def rubber(seed):
    g = rng(seed)
    texture = blur_wrap(g.random((S, S)) - 0.5, 0.5) * 1.4
    f = 0.45 + texture * 0.3 + stipple(g, 0.16) + lowfreq(g, 0.08) - specks(g, 0.02, 0.2)
    return mat_from_field("rubber", f)


def glass_lens(seed):
    g = rng(seed)
    d = (XX - YY) % S  # diagonal coordinate, wraps seamlessly
    streak = np.exp(-((d - 11.5) ** 2) / (2 * 1.1 ** 2)) * 0.55
    streak2 = np.exp(-((d - 16.0) ** 2) / (2 * 0.5 ** 2)) * 0.30
    sheen = 0.10 * np.cos(TAU * ((XX + YY) % S) / S)
    f = (0.30 + streak + streak2 + sheen + lowfreq(g, 0.08, cells=2) + stipple(g, 0.03))
    pal = ["#051012", "#08191c", "#0c2428", "#113036", "#173e45", "#205058", "#2e676e",
           "#4b8a8e", "#86c2c0", "#d6f2ec"]
    return finish(palette_map(f, pal))


def glow(seed, pal):
    g = rng(seed)
    r = torus_dist(S, S, 16, 16)
    f = 0.80 - (r / 22.6) ** 1.6 * 0.32 + stipple(g, 0.025) + lowfreq(g, 0.03, cells=2)
    stops = [(i / (len(pal) - 1), c) for i, c in enumerate(pal)]
    return finish(ramp(f, stops)[..., :3])


GLOW = {
    "glow_red": ["#9c0e0e", "#be1616", "#da221d", "#ef3a2e", "#ff5a46", "#ff806c", "#ffb2a4"],
    "glow_green": ["#0f861e", "#17a529", "#20c335", "#38dd48", "#62ef6c", "#9cff98", "#d6ffd2"],
    "glow_amber": ["#9c5600", "#bd6d00", "#d98806", "#efa016", "#ffb836", "#ffcf6c", "#ffe7b2"],
}


def build_library():
    out = {}
    out["black_polymer"] = polymer("black_polymer", 101)
    out["od_polymer"] = polymer("od_polymer", 102)
    out["tan_polymer"] = polymer("tan_polymer", 103)
    out["grey_polymer"] = polymer("grey_polymer", 104)
    out["walnut_wood"] = wood("walnut_wood", 105, lines=7)
    out["dark_walnut"] = wood("dark_walnut", 106, lines=8)
    out["blued_steel"] = brushed_metal("blued_steel", 107, base=0.44, brush=0.09, low=0.12,
                                       st=0.06, sheen=0.20, scr=2)
    out["parkerized"] = parkerized(108)
    out["dark_steel"] = brushed_metal("dark_steel", 109, base=0.48, brush=0.11, low=0.07, st=0.07)
    out["stainless"] = brushed_metal("stainless", 110, base=0.52, brush=0.16, low=0.04, st=0.05,
                                     sheen=0.08, scr=3, spk=0.004, streak=0.25)
    out["gunmetal"] = brushed_metal("gunmetal", 111, base=0.48, brush=0.10, low=0.08, st=0.07, sheen=0.06)
    out["black_anodized"] = black_anodized(112)
    out["brass"] = cased_metal("brass", 113)
    out["copper"] = cased_metal("copper", 114)
    out["red_plastic"] = hull_plastic("red_plastic", 115)
    out["green_plastic"] = hull_plastic("green_plastic", 116)
    out["rubber"] = rubber(117)
    out["glass_lens"] = glass_lens(118)
    for i, (k, pal) in enumerate(GLOW.items()):
        out[k] = glow(119 + i, pal)
    return out


# ---------------------------------------------------------------------------
# skin materials
# ---------------------------------------------------------------------------

def simple(pal, seed, base=0.5, low=0.08, st=0.12, cells=2, spk=0.006, scr=1, brush=0.0):
    g = rng(seed)
    f = (base + lowfreq(g, low, cells=cells) + stipple(g, st) + specks(g, spk, 0.3)
         + scratches(g, scr, 0.14, 2, 5))
    if brush:
        f = f + brushed(g, brush)
    return finish(palette_map(f, pal))


def camo(seed, base_cols, layers, texture=0.035, wear=0.006, stip_blur=False, block=1, darken=1.0):
    """Seamless camo: base colour + thresholded toroidal noise layers.

    layers: list of (colour list [main, alt], cells, coverage fraction, edge_noise)
    """
    g = rng(seed)
    n = S // block
    lab = np.zeros((n, n), dtype=int)
    cols = [base_cols]
    for i, (lcols, cells, cover, edge) in enumerate(layers):
        f = fbm(n, n, g, cells=cells, octaves=3, persistence=0.55)
        f = f + (g.random((n, n)) - 0.5) * edge
        thr = np.quantile(f, 1 - cover)
        lab[f > thr] = i + 1
        cols.append(lcols)
    if block > 1:
        lab = lab.repeat(block, axis=0).repeat(block, axis=1)
    alt = g.random((S, S))
    tex = blur_wrap(g.random((S, S)) - 0.5, 0.5) if stip_blur else (g.random((S, S)) - 0.5)
    rgb = np.zeros((S, S, 3))
    for i, c in enumerate(cols):
        main = np.array(hx(c[0])[:3], float)
        second = np.array(hx(c[1])[:3], float)
        m = lab == i
        pick = np.where((alt < 0.22)[..., None], second, main)
        rgb[m] = pick[m]
    lum = 1 + tex * 2 * texture
    rgb = rgb * lum[..., None] * darken
    # light wear: a few lighter specks
    sp = g.random((S, S)) < wear
    rgb[sp] = rgb[sp] * 1.25 + 12
    return finish(np.clip(rgb, 0, 255))


def dilate(m):
    out = m.copy()
    for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
        out |= np.roll(np.roll(m, dy, 0), dx, 1)
    return out


def worn_paint(seed, chips=0.07, n_scratch=6, paint=None, metal=None, under_halo="#3a3b40",
               darker=0.0, faint_scratch=6):
    """Black paint worn through: crisp chips of bright steel ringed by scuffed grey paint,
    plus thin scratches at varied angles (bright = through to metal, faint = scuffed paint)."""
    g = rng(seed)
    paint = paint or ["#121214", "#17171a", "#1c1c20", "#232327"]
    metal = metal or ["#7e848b", "#a8aeb5", "#d0d5da"]
    wear = fbm(S, S, g, cells=4, octaves=4, persistence=0.55)
    wear = wear + (g.random((S, S)) - 0.5) * 0.05
    t_chip = np.quantile(wear, 1 - chips)
    pf = 0.5 + stipple(g, 0.25) + lowfreq(g, 0.12) - darker
    rgb = palette_map(pf, paint).astype(float)
    chip_m = wear > t_chip
    halo_m = dilate(chip_m) & ~chip_m
    halo_m &= g.random((S, S)) < 0.8
    rgb[halo_m] = np.array(hx(under_halo)[:3]) * (0.9 + 0.2 * g.random((int(halo_m.sum()), 1)))
    mf = 0.55 + stipple(g, 0.35)
    mrgb = palette_map(mf, metal)
    rgb[chip_m] = mrgb[chip_m]

    def scratch_set(count, lmin, lmax):
        sm = np.zeros((S, S))
        for _ in range(count):
            x0, y0 = int(g.integers(0, S)), int(g.integers(0, S))
            ln = int(g.integers(lmin, lmax + 1))
            kind = int(g.integers(0, 4))
            if kind == 0:
                x1, y1 = x0 + ln, y0 + int(g.integers(-1, 2))
            elif kind == 1:
                x1, y1 = x0 + ln, y0 + ln // 2 * (1 if g.random() < 0.5 else -1)
            elif kind == 2:
                x1, y1 = x0 + ln // 2, y0 + ln * (1 if g.random() < 0.5 else -1)
            else:
                x1, y1 = x0 + ln, y0 + ln * (1 if g.random() < 0.5 else -1)
            pts = wrap_line(sm, x0, y0, x1, y1, 1.0)
            if len(pts) > 4:
                x, y = pts[int(g.integers(1, len(pts) - 1))]
                sm[y, x] = 0
        return sm > 0

    faint = scratch_set(faint_scratch, 3, 8)
    rgb[faint & ~chip_m] = rgb[faint & ~chip_m] * 0.4 + np.array(hx(under_halo)[:3]) * 0.9
    bright = scratch_set(n_scratch, 3, 7)
    sc = palette_map(0.65 + stipple(g, 0.3), metal)
    rgb[bright] = sc[bright]
    return finish(np.clip(rgb, 0, 255))


def carbon_fibre(seed, dark=0.0):
    g = rng(seed)
    i, j = XX // 2, YY // 2
    horiz = ((i + j) % 4) < 2
    ly, lx = YY % 2, XX % 2
    f = np.where(horiz, 0.62 - 0.18 * ly, 0.36 - 0.14 * lx)
    f = f + stipple(g, 0.06) + lowfreq(g, 0.06) - dark
    pal = ["#0b0c0f", "#111216", "#17191e", "#1e2127", "#262a31", "#30353d"]
    return palette_map(f, pal).astype(float)


def draw_traces(rgb, traces, pads, glow_amt=0.35):
    """traces: list of (colour, [points]); pads: list of (colour, x, y). Draw with soft halo."""
    for col, pts in traces:
        m = np.zeros((S, S))
        wrap_polyline(m, pts, 1.0)
        c = np.array(hx(col)[:3], float)
        halo = np.zeros((S, S))
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            halo = np.maximum(halo, np.roll(np.roll(m, dy, 0), dx, 1))
        halo = np.clip(halo - m, 0, 1)
        rgb[:] = rgb * (1 - halo[..., None] * glow_amt) + c * halo[..., None] * glow_amt
        rgb[m > 0] = c
    for col, x, y in pads:
        c = np.array(hx(col)[:3], float)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                yy, xx = (y + dy) % S, (x + dx) % S
                if dy == 0 and dx == 0:
                    rgb[yy, xx] = c * 0.35
                else:
                    rgb[yy, xx] = c * (0.95 if (dx == 0 or dy == 0) else 0.7)
    return rgb


CYAN, CYAN_D = "#38f0ff", "#1aa6bd"
MAGENTA, MAGENTA_D = "#ff3ad8", "#b01d97"


def neon_receiver():
    rgb = carbon_fibre(301)
    traces = [
        (CYAN, [(0, 5), (9, 5), (13, 9), (22, 9), (26, 5), (32, 5)]),
        (MAGENTA, [(0, 21), (5, 21), (9, 25), (19, 25)]),
        (CYAN, [(28, 13), (28, 18), (24, 22), (24, 28)]),
        (MAGENTA, [(12, 14), (18, 14)]),
        (CYAN, [(3, 28), (3, 31), (3, 33)]),
    ]
    pads = [(MAGENTA, 20, 25), (CYAN, 28, 12), (CYAN, 24, 29), (MAGENTA, 11, 14), (MAGENTA, 19, 14)]
    return finish(draw_traces(rgb, traces, pads))


def neon_furniture():
    rgb = carbon_fibre(302)
    traces = [
        (MAGENTA, [(0, 10), (7, 10), (11, 14), (20, 14), (24, 10), (32, 10)]),
        (CYAN, [(5, 25), (15, 25)]),
    ]
    pads = [(CYAN, 4, 25), (CYAN, 16, 25)]
    return finish(draw_traces(rgb, traces, pads, glow_amt=0.28))


def neon_mag():
    rgb = carbon_fibre(303, dark=0.12)
    traces = [(CYAN_D, [(0, 18), (12, 18), (15, 21), (28, 21), (31, 18), (32, 18)])]
    return finish(draw_traces(rgb, traces, [], glow_amt=0.2))


def neon_accent(frames=16):
    g = rng(304)
    tex = blur_wrap(g.random((S, S)) - 0.5, 0.4, 2.0) * 0.5
    rows = 0.04 * np.cos(TAU * (YY + 0.5) / 8)
    out = []
    for fr in range(frames):
        c = (fr * S / frames) % S
        dx = np.abs((XX + 0.5) - c)
        dx = np.minimum(dx, S - dx)
        pulse = np.exp(-(dx ** 2) / (2 * 3.2 ** 2))
        pulse2 = np.exp(-(np.minimum(np.abs((XX + 0.5) - (c + 16) % S), S - np.abs((XX + 0.5) - (c + 16) % S)) ** 2) / (2 * 2.0 ** 2)) * 0.35
        f = 0.50 + tex + rows + 0.50 * pulse + pulse2
        rgb = ramp(f, [(0.2, "#006c80"), (0.45, "#00b4d2"), (0.65, "#22e2ff"), (0.85, "#8ef6ff"), (1.05, "#eaffff")])
        out.append(finish(palette_quant(rgb[..., :3], 12)))
    return frames_to_strip(out)


def palette_quant(rgb, levels):
    """Light posterisation keeps animated frames crisp."""
    step = 256 / levels
    return np.floor(rgb / step) * step + step / 2


SS = 4  # supersampling for the energy fields (keeps thin veins continuous)
_ss = (np.arange(S * SS) + 0.5) / SS
SX, SY = np.meshgrid(_ss, _ss)


def energy_field(t, seed_phase=0.0, warp=1.0, xs=None, ys=None):
    xs = SX if xs is None else xs
    ys = SY if ys is None else ys
    X = TAU * xs / S
    Y = TAU * ys / S
    T = TAU * t
    p = seed_phase
    w1 = np.sin(Y + T + p) * 0.9 + np.sin(2 * X - T + 1.7 + p) * 0.5
    w2 = np.cos(X - T + 0.4 + p) * 0.9 + np.sin(2 * Y + 2 * T + p) * 0.5
    n = (np.sin(2 * X + Y + warp * 1.3 * w1 + T)
         + 0.8 * np.sin(-X + 3 * Y + warp * 1.3 * w2 - 2 * T + 0.9)
         + 0.55 * np.sin(3 * X - 2 * Y + T + 1.3 + p))
    smooth = 0.5 + 0.5 * np.sin(X + 2 * Y - T + w1 * 0.6 + p)
    return n, smooth


def down(a):
    return a.reshape(S, SS, S, SS).mean(axis=(1, 3))


ENERGY_STOPS = [(0.0, "#06020b"), (0.18, "#12061f"), (0.34, "#2a0b4c"), (0.52, "#5a18a0"),
                (0.70, "#9a3ee6"), (0.85, "#d68cff"), (1.0, "#fbeaff")]


def energy_receiver(frames=16):
    out = []
    g = rng(401)
    st = (g.random((S, S)) - 0.5) * 0.05
    for fr in range(frames):
        n, smooth = energy_field(fr / frames)
        ridge = 1 - np.clip(np.abs(n) / 1.0, 0, 1)
        vein = down(np.clip((ridge - 0.80) / 0.20, 0, 1) ** 1.2) * 1.9
        glowv = down(ridge ** 3)
        f = 0.08 + 0.12 * down(smooth) + 0.16 * glowv + 0.75 * np.clip(vein, 0, 1) + st
        out.append(finish(palette_map(f, ramp_palette(ENERGY_STOPS, 12))))
    return frames_to_strip(out)


def energy_accent(frames=16):
    out = []
    g = rng(402)
    st = (g.random((S, S)) - 0.5) * 0.05
    for fr in range(frames):
        n, smooth = energy_field(fr / frames, seed_phase=2.1, warp=1.4)
        ridge = 1 - np.clip(np.abs(n) / 1.3, 0, 1)
        vein = down(ridge ** 3)
        f = 0.44 + 0.14 * down(smooth) + 0.50 * vein + st
        out.append(finish(palette_map(f, ramp_palette(ENERGY_STOPS, 12))))
    return frames_to_strip(out)


def energy_static(seed, base, vein_amt, dark_pal_shift=0.0):
    g = rng(seed)
    n, smooth = energy_field(0.37, seed_phase=seed * 0.1, warp=1.1)
    ridge = 1 - np.clip(np.abs(n) / 1.0, 0, 1)
    vein = down(np.clip((ridge - 0.82) / 0.18, 0, 1)) * 1.6
    f = base + 0.08 * down(smooth) + vein_amt * np.clip(vein, 0, 1) + stipple(g, 0.05) + lowfreq(g, 0.04) - dark_pal_shift
    return finish(palette_map(f, ramp_palette(ENERGY_STOPS, 12)))


def ramp_palette(stops, n):
    vals = ramp(np.linspace(0, 1, n)[None, :], stops)[0]
    return ["#%02x%02x%02x" % tuple(int(round(v)) for v in c[:3]) for c in vals]


def industrial(seed, rust_cover=0.12, base=0.5, dark=0.0, brush=0.12, pits=0.02):
    g = rng(seed)
    steel = ["#3f4245", "#4a4e51", "#55595c", "#616568", "#6d7174", "#7a7e81", "#888c8f", "#979b9e"]
    rust = ["#3e1f10", "#522915", "#66341a", "#7b4120", "#8f4f27", "#a3602f"]
    f = (base - dark + brushed(g, brush, streak=0.5) + lowfreq(g, 0.10, cells=2) + stipple(g, 0.07)
         + scratches(g, 4, 0.18, 3, 9))
    rgb = palette_map(f, steel).astype(float)
    ox = fbm(S, S, g, cells=4, octaves=4, persistence=0.6) + (g.random((S, S)) - 0.5) * 0.15
    if rust_cover > 0:
        thr = np.quantile(ox, 1 - rust_cover)
        thr2 = np.quantile(ox, 1 - rust_cover * 2.2)
        stain = (ox > thr2) & (ox <= thr)
        rgb[stain] = rgb[stain] * 0.72 + np.array(hx("#6a3a1c")[:3]) * 0.28
        rm = ox > thr
        rf = 0.45 + (ox - thr) * 2.0 + stipple(g, 0.25)
        rrgb = palette_map(rf, rust)
        rgb[rm] = rrgb[rm]
    pm = g.random((S, S)) < pits
    rgb[pm] = rgb[pm] * 0.55
    return finish(rgb)


def hazard(seed):
    g = rng(seed)
    d = (XX + YY) % S
    stripe = (d // 4) % 2 == 0
    y_pal = ["#a77f0a", "#c39812", "#dcae18", "#ebbd22", "#f5cc3a"]
    k_pal = ["#121212", "#18181a", "#1e1e21", "#26262a"]
    yf = 0.6 + stipple(g, 0.22) + lowfreq(g, 0.10)
    kf = 0.5 + stipple(g, 0.3) + lowfreq(g, 0.10)
    rgb = np.where(stripe[..., None], palette_map(yf, y_pal), palette_map(kf, k_pal)).astype(float)
    # worn scuffs exposing steel
    sm = np.zeros((S, S))
    for _ in range(5):
        x0, y0 = int(g.integers(0, S)), int(g.integers(0, S))
        wrap_line(sm, x0, y0, x0 + int(g.integers(2, 6)), y0 + int(g.choice([0, 0, 1])), 1.0)
    chips = (fbm(S, S, g, cells=4, octaves=3) > 0.86) | (sm > 0)
    metal = palette_map(0.5 + stipple(g, 0.4), ["#6d7174", "#888c8f", "#a2a6a9"])
    rgb[chips] = metal[chips]
    return finish(rgb)


def build_skins():
    out = {}
    # matte black: flat black cerakote
    out["matte_black_receiver"] = simple(["#111113", "#151517", "#19191c", "#1d1d21", "#222226", "#28282d"],
                                         201, low=0.07, st=0.10, spk=0.004, scr=1)
    out["matte_black_furniture"] = polymer("black_polymer", 202, base=0.36)
    out["matte_black_mag"] = simple(["#0d0d0f", "#111113", "#151518", "#1a1a1d"], 203, low=0.06, st=0.12,
                                    spk=0.0, scr=0)
    out["matte_black_accent"] = brushed_metal("gunmetal", 204, base=0.40, brush=0.08, st=0.06)

    # desert tan cerakote with faint mottling
    tan = ["#83694a", "#8e7453", "#987e5b", "#a28864", "#ac926d", "#b69d77", "#c0a881", "#cbb38c"]
    g = rng(211)
    mott = fbm(S, S, g, cells=4, octaves=3)
    f = 0.52 + (mott - 0.5) * 0.30 + stipple(g, 0.10) + specks(g, 0.006, 0.25) + scratches(g, 1, 0.12, 2, 5)
    out["desert_tan_receiver"] = finish(palette_map(f, tan))
    out["desert_tan_furniture"] = simple(["#71593d", "#7b6345", "#856d4d", "#8f7755", "#99815d", "#a38b66"],
                                         212, low=0.10, st=0.20, spk=0.01)
    out["desert_tan_mag"] = simple(["#5f4b33", "#675239", "#6f593f", "#776045", "#80684b"], 213,
                                   low=0.08, st=0.14, spk=0.0, scr=0)
    out["desert_tan_accent"] = simple(["#43331f", "#4d3b25", "#57432b", "#614b31", "#6b5337"], 214,
                                      low=0.06, st=0.14)

    # woodland camo
    green = ["#4b5a2f", "#45542b"]
    brown = ["#5c4227", "#553d23"]
    black = ["#1f1f19", "#25251e"]
    khaki = ["#8c7f55", "#83774f"]
    out["woodland_receiver"] = camo(221, green, [(brown, 3, 0.36, 0.06), (khaki, 4, 0.16, 0.08),
                                                 (black, 5, 0.15, 0.10)])
    out["woodland_furniture"] = camo(222, green, [(brown, 3, 0.34, 0.06), (khaki, 4, 0.15, 0.08),
                                                  (black, 5, 0.16, 0.10)], texture=0.06, stip_blur=True)
    out["woodland_mag"] = camo(223, ["#3e4b27", "#3a4625"], [(["#4a3620", "#44321d"], 2, 0.38, 0.05),
                                                           (["#1b1b16", "#1f1f19"], 4, 0.14, 0.08)],
                               texture=0.03, wear=0.0)
    out["woodland_accent"] = simple(["#4e4d30", "#585736", "#62613c", "#6c6b43", "#77764a"], 224,
                                    low=0.08, st=0.14)

    # arctic camo
    white = ["#dde2e6", "#d4d9de"]
    pale = ["#adb6be", "#a5aeb6"]
    bgrey = ["#76869a", "#6f7f92"]
    slate = ["#4f5b69", "#4a5562"]
    out["arctic_receiver"] = camo(231, white, [(pale, 3, 0.34, 0.06), (bgrey, 4, 0.18, 0.08),
                                               (slate, 6, 0.06, 0.10)], texture=0.025)
    out["arctic_furniture"] = camo(232, white, [(pale, 3, 0.32, 0.06), (bgrey, 4, 0.20, 0.08)],
                                   texture=0.04, stip_blur=True)
    out["arctic_mag"] = camo(233, ["#b9c1c8", "#b2bac1"], [(["#8e9aa6", "#88949f"], 2, 0.36, 0.05),
                                                         (["#65737f", "#606d79"], 4, 0.14, 0.08)],
                             texture=0.03, wear=0.0)
    out["arctic_accent"] = simple(["#4a7493", "#5480a0", "#5f8cad", "#6a98ba", "#76a4c6"], 234, low=0.08, st=0.12)

    # digital urban: 2x2 texel blocks (= 1 model pixel)
    lgrey = ["#a7acb2", "#a0a5ab"]
    mgrey = ["#7a8189", "#757c84"]
    blue = ["#566d8a", "#526884"]
    dark = ["#2e343c", "#2b3138"]
    out["digital_receiver"] = camo(241, lgrey, [(mgrey, 3, 0.36, 0.22), (blue, 3, 0.22, 0.25),
                                                (dark, 4, 0.12, 0.25)], block=2, texture=0.02)
    out["digital_furniture"] = camo(242, mgrey, [(lgrey, 3, 0.30, 0.22), (dark, 3, 0.20, 0.25),
                                                 (blue, 4, 0.14, 0.25)], block=2, texture=0.03)
    out["digital_mag"] = camo(243, ["#5f666f", "#5b626a"], [(["#3f4650", "#3c434c"], 3, 0.30, 0.22),
                                                          (["#4a5b72", "#47576d"], 3, 0.18, 0.25)],
                              block=2, texture=0.02, wear=0.0)
    out["digital_accent"] = simple(["#38506d", "#405a7a", "#486486", "#516f92", "#5b7a9e"], 244, low=0.08, st=0.12)

    # industrial: brushed / oxidised steel, hazard accent
    out["industrial_receiver"] = industrial(251, rust_cover=0.10)
    out["industrial_furniture"] = industrial(252, rust_cover=0.20, base=0.40, brush=0.10)
    out["industrial_mag"] = industrial(253, rust_cover=0.06, base=0.30, brush=0.07, pits=0.01)
    out["industrial_accent"] = hazard(254)

    # worn: black paint, chips and scratches showing bright steel
    out["worn_receiver"] = worn_paint(261, chips=0.06, n_scratch=4, faint_scratch=6)
    out["worn_furniture"] = worn_paint(262, chips=0.04, n_scratch=3, faint_scratch=7,
                                       paint=["#151517", "#1a1a1d", "#1f1f23", "#26262a"],
                                       under_halo="#36373b")
    out["worn_mag"] = worn_paint(263, chips=0.025, n_scratch=2, faint_scratch=4, darker=0.15,
                                 metal=["#6c727a", "#8d939a", "#b0b6bc"])
    out["worn_accent"] = worn_paint(264, chips=0.60, n_scratch=0, faint_scratch=3,
                                    metal=["#7a8088", "#959ba2", "#b2b8be"])

    # neon: carbon fibre + circuit traces, animated cyan accent
    out["neon_receiver"] = neon_receiver()
    out["neon_furniture"] = neon_furniture()
    out["neon_mag"] = neon_mag()
    out["neon_accent"] = neon_accent()

    # energy: deep violet/black, flowing animated energy
    out["energy_receiver"] = energy_receiver()
    out["energy_furniture"] = energy_static(411, 0.16, 0.30)
    out["energy_mag"] = energy_static(412, 0.10, 0.18, dark_pal_shift=0.02)
    out["energy_accent"] = energy_accent()
    return out


ANIMATED = {"neon_accent", "energy_receiver", "energy_accent"}


def generate():
    written = []
    allmats = {}
    allmats.update(build_library())
    allmats.update(build_skins())
    for name, arr in allmats.items():
        rel = f"item/material/{name}"
        h = arr.shape[0]
        save(rel, arr, (S, h))
        if name in ANIMATED:
            assert h % S == 0 and h > S
            save_mcmeta(rel, ANIM_META)
        written.append(rel)
    return written
