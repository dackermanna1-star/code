#!/usr/bin/env python3
"""Procedurally generated texture content (all CC0, this project).

Called from build.py (make_<name>(base_maps, size) -> map dict) and standalone for the blue noise:
  python3 -I tools/assets/textures/generate.py noise <out_dir>
Everything here is tileable unless it is a decal/atlas.
"""
import math, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import texlib as T  # noqa: E402


# ----------------------------------------------------------------------------------------------- noise helpers
def fft_noise(n, beta=2.0, seed=0, lo=1.0, hi=None, aniso=(1.0, 1.0)):
    """Periodic fractal noise (zero mean, unit std). Frequencies are in cycles per tile.
    aniso=(ax, ay) stretches features: larger ax -> shorter features along x."""
    rng = np.random.default_rng(seed)
    F = np.fft.fft2(rng.standard_normal((n, n)))
    fy = np.fft.fftfreq(n)[:, None] * n
    fx = np.fft.fftfreq(n)[None, :] * n
    f = np.sqrt((fx * aniso[0]) ** 2 + (fy * aniso[1]) ** 2)
    f[0, 0] = 1.0
    amp = f ** (-beta)
    amp[f < lo] = 0.0
    if hi:
        amp *= np.exp(-(f / hi) ** 2)
    x = np.real(np.fft.ifft2(F * amp))
    x -= x.mean()
    return (x / max(x.std(), 1e-9)).astype(np.float32)


def coverage_mask(field, coverage, soft=0.0):
    """Threshold `field` so that `coverage` fraction is inside; optional soft edge width (in std units)."""
    t = np.quantile(field, 1.0 - coverage)
    if soft <= 0:
        return (field >= t).astype(np.float32)
    return np.clip((field - t) / soft + 0.5, 0, 1).astype(np.float32)


def detail_from(albedo, sigma):
    """Luminance detail ratio (≈1 mean) of a base albedo: lum / blurred lum."""
    lum = (albedo[..., :3] * np.array([0.2126, 0.7152, 0.0722], np.float32)).sum(-1)
    return (lum / np.maximum(T.gauss_blur_periodic(lum, sigma), 1e-3)).astype(np.float32)


def tile_maps(m, reps, size):
    """Downsample every map of a base set so `reps` x `reps` copies fill `size` px, then tile."""
    out = {}
    cell = size // reps
    for k, v in m.items():
        if v is None:
            out[k] = None
            continue
        if k == 'normal':
            r = T.resize_normal(v, cell)
        else:
            r = T.resize(v, cell, Image.LANCZOS)
        out[k] = np.tile(r, (reps, reps, 1))
    return out


# ----------------------------------------------------------------------------------------------- camo fabric
def make_camo(base, size):
    """US-woodland-style 4-colour camouflage printed on canvas. base = ambientCG Fabric061 maps (0.4 m).
    Output tile = 0.8 m (base repeated 2x2)."""
    N = 2048
    b = tile_maps(base, 2, N)
    light = np.array([0.44, 0.47, 0.33], np.float32)   # sRGB-ish albedo values (khaki green)
    brown = np.array([0.36, 0.27, 0.19], np.float32)
    green = np.array([0.20, 0.25, 0.16], np.float32)
    black = np.array([0.10, 0.10, 0.09], np.float32)
    edge = fft_noise(N, 1.8, 99, lo=10, hi=90) * 0.22   # irregular (but smooth) print edges
    n_brown = fft_noise(N, 2.8, 11, lo=2.5, hi=45) + edge
    n_green = fft_noise(N, 2.8, 23, lo=2.5, hi=45) + edge
    n_black = fft_noise(N, 2.5, 37, lo=3, hi=55, aniso=(1.5, 0.75)) + edge * 1.2   # horizontally drawn "branch" strokes
    m_brown = coverage_mask(n_brown, 0.40, 0.08)
    m_green = coverage_mask(n_green, 0.30, 0.08)
    m_black = coverage_mask(n_black, 0.12, 0.08)
    col = light[None, None] * np.ones((N, N, 1), np.float32)
    for m, c in [(m_brown, brown), (m_green, green), (m_black, black)]:
        col = col * (1 - m[..., None]) + c[None, None] * m[..., None]
    # slight print bleed + fading/dirt variation
    fade = 1.0 + 0.06 * fft_noise(N, 2.0, 5, lo=1, hi=12)
    det = 1.0 + 0.7 * (np.clip(detail_from(b["albedo"], 6.0), 0.8, 1.2) - 1.0)
    alb = np.clip(col * (fade * det)[..., None], 0, 1)
    rough = np.clip(b['rough'] * 0.15 + 0.72, 0, 1) if b['rough'] is not None else None
    return dict(albedo=alb, normal=b['normal'], ao=b['ao'], rough=rough, metal=None, height=b['height'])


# ----------------------------------------------------------------------------------------------- wallpaper
def _leaf(d, x0, y0, a, L, Wd, fill):
    """Pointed leaf polygon from (x0,y0) along angle a, length L, max half-width Wd."""
    pts = []
    for t in np.linspace(0, 1, 14):
        w = Wd * math.sin(math.pi * t) ** 0.8
        pts.append((x0 + math.cos(a) * L * t - math.sin(a) * w, y0 + math.sin(a) * L * t + math.cos(a) * w))
    for t in np.linspace(1, 0, 14):
        w = Wd * math.sin(math.pi * t) ** 0.8
        pts.append((x0 + math.cos(a) * L * t + math.sin(a) * w, y0 + math.sin(a) * L * t - math.cos(a) * w))
    d.polygon(pts, fill=fill)


def _flower(d, cx, cy, s, rng, petal, centre, leaf, stem):
    """Small rose sprig: curved stem below the bloom, alternating leaves along it, a bud, layered petals."""
    lean = rng.uniform(-0.35, 0.35)
    # stem: gentle S-curve downward (image y grows downward)
    pts = [(cx + math.sin(t * 2.2) * s * 0.18 + lean * s * t * 1.4, cy + s * 1.9 * t) for t in np.linspace(0, 1, 16)]
    for i in range(len(pts) - 1):
        d.line([pts[i], pts[i + 1]], fill=stem, width=max(2, int(s * 0.07)))
    for k, (ti, side) in enumerate([(0.38, -1), (0.62, 1), (0.85, -1)]):
        x0, y0 = pts[int(ti * 15)]
        a = math.pi / 2 + side * rng.uniform(0.9, 1.25)   # pointing sideways-down
        _leaf(d, x0, y0, a - math.pi, s * rng.uniform(0.55, 0.75), s * 0.2, leaf)
    # bud on a side twig
    bx, by = pts[9]
    tw = (bx + s * 0.55 * (1 if lean < 0 else -1), by - s * 0.35)
    d.line([(bx, by), tw], fill=stem, width=max(2, int(s * 0.05)))
    d.ellipse([tw[0] - s * 0.13, tw[1] - s * 0.2, tw[0] + s * 0.13, tw[1] + s * 0.12], fill=petal)
    # bloom: outer petals, inner cup, spiral hint
    ang0 = rng.uniform(0, math.tau)
    for k in range(7):
        a = ang0 + k * math.tau / 7
        px, py = cx + math.cos(a) * s * 0.3, cy + math.sin(a) * s * 0.3
        r = s * 0.34
        d.ellipse([px - r, py - r, px + r, py + r], fill=petal)
    darker = tuple(int(v * 0.88) for v in petal)
    d.ellipse([cx - s * 0.36, cy - s * 0.36, cx + s * 0.36, cy + s * 0.36], fill=darker)
    for k in range(3):
        rr = s * (0.28 - 0.08 * k)
        d.arc([cx - rr, cy - rr, cx + rr, cy + rr], start=ang0 * 57 + k * 70, end=ang0 * 57 + k * 70 + 220,
              fill=centre, width=max(2, int(s * 0.06)))


def make_wallpaper_pattern(base, size):
    """Faded regency stripe with rose sprigs, printed over ambientCG Wallpaper001A woodchip paper.
    Output tile ≈ 1.06 m: 2 stripe repeats (53 cm wallpaper width) x 2 half-drop motif rows."""
    N = 2048
    SS = 2  # supersample for anti-aliased drawing
    W = N * SS
    cream = (224, 216, 196)
    sage = (166, 172, 150)
    pin = (118, 128, 102)
    petal = (184, 132, 126)
    centre = (150, 98, 92)
    leaf = (122, 138, 104)
    stem = (110, 120, 92)
    img = Image.new('RGB', (W, W), cream)
    d = ImageDraw.Draw(img)
    rep = W // 2
    for r in range(2):
        x0 = r * rep
        bw = int(rep * 0.36)
        bx = x0 + (rep - bw) // 2
        d.rectangle([bx, 0, bx + bw, W], fill=sage)
        for off in (-int(rep * 0.035), bw + int(rep * 0.035)):
            d.rectangle([bx + off - 3 * SS, 0, bx + off + 3 * SS, W], fill=pin)
        # subtle damask lines inside the band
        for k in range(1, 6):
            xx = bx + k * bw // 6
            d.rectangle([xx - SS, 0, xx + SS, W], fill=tuple(int(c * 0.95) for c in sage))
    rng = np.random.default_rng(7)
    # rose sprigs in the cream gaps, half-drop repeat; draw wrapped copies for seamless tiling
    for r in range(2):
        cx0 = r * rep  # gap centre sits on repeat boundary
        for j in range(6):
            cy = (j * W / 6 + (W / 12 if r % 2 else 0)) % W
            cx = cx0 + (rep * 0.07 if j % 2 else -rep * 0.07)
            s = rep * 0.075
            state = rng.bit_generator.state
            for dx in (-W, 0, W):
                for dy in (-W, 0, W):
                    rng.bit_generator.state = state
                    _flower(d, cx + dx, cy + dy - s * 0.8, s, rng, petal, centre, leaf, stem)
    img = img.resize((N, N), Image.LANCZOS)
    col = np.asarray(img, np.float32) / 255.0
    b = {k: (T.resize(v, N, Image.LANCZOS) if (v is not None and k != 'normal') else v) for k, v in base.items()}
    if b['normal'] is not None:
        b['normal'] = T.resize_normal(b['normal'], N)
    # ageing: yellowing, fading, faint water stains
    yel = fft_noise(N, 2.2, 3, lo=1, hi=10)
    col = col * (1 - 0.18) + np.array([0.86, 0.80, 0.66], np.float32) * 0.18
    col *= (1.0 + 0.05 * yel)[..., None]
    col = col * np.array([1.0, 0.985, 0.95], np.float32)
    stains = coverage_mask(fft_noise(N, 2.6, 17, lo=2, hi=24), 0.06, 0.25)
    ring = np.clip(1 - np.abs(coverage_mask(fft_noise(N, 2.6, 17, lo=2, hi=24), 0.07, 0.6) - 0.5) * 2, 0, 1) ** 3
    col *= (1 - 0.035 * stains - 0.05 * ring)[..., None]
    det = np.clip(detail_from(b['albedo'], 4.0), 0.85, 1.12)
    alb = np.clip(col * det[..., None], 0, 1)
    n = T.normal_decode(b['normal'])
    n[..., :2] *= 0.6   # paper over woodchip: keep the bumps but soften them
    rough = np.full((N, N, 1), 0.78, np.float32) + 0.06 * (b['rough'] - b['rough'].mean() if b['rough'] is not None else 0)
    return dict(albedo=alb, normal=T.normal_encode(n), ao=None, rough=np.clip(rough, 0, 1), metal=None, height=b['height'])


# ----------------------------------------------------------------------------------------------- decals
def _polar(n):
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float32)
    c = (n - 1) / 2
    dx, dy = xx - c, yy - c
    return np.sqrt(dx * dx + dy * dy), np.arctan2(dy, dx), dx, dy


def _angular_noise(theta, rng, k=7, amp=0.25):
    v = np.zeros_like(theta)
    for i in range(1, k + 1):
        v += rng.normal() / i * np.cos(i * theta + rng.uniform(0, math.tau))
    return 1.0 + amp * v / 1.5


def _crack_lines(n, rng, count, r0, r1, width, wiggle=0.35, branch=0.3):
    """Rasterise radial-ish random-walk cracks into an anti-aliased mask (supersampled)."""
    SS = 2
    im = Image.new('L', (n * SS, n * SS), 0)
    d = ImageDraw.Draw(im)
    c = n * SS / 2

    def walk(x, y, a, length, w):
        steps = max(4, int(length / (3 * SS)))
        pts = [(x, y)]
        for _ in range(steps):
            a += rng.normal() * wiggle
            x += math.cos(a) * length / steps
            y += math.sin(a) * length / steps
            pts.append((x, y))
            if rng.random() < branch / steps and w > 1:
                walk(x, y, a + rng.choice([-1, 1]) * rng.uniform(0.4, 1.0), length * rng.uniform(0.25, 0.5), max(1, w * 0.6))
        for i in range(len(pts) - 1):
            ww = max(1, int(w * SS * (1 - i / len(pts)) + 0.5))
            d.line([pts[i], pts[i + 1]], fill=255, width=ww)

    for k in range(count):
        a = rng.uniform(0, math.tau)
        rs = r0 * SS * rng.uniform(0.8, 1.0)
        walk(c + math.cos(a) * rs, c + math.sin(a) * rs, a, (r1 - r0) * SS * rng.uniform(0.5, 1.0), width)
    im = im.resize((n, n), Image.LANCZOS)
    return np.asarray(im, np.float32) / 255.0


def _bullet_cell(kind, n, seed):
    rng = np.random.default_rng(seed)
    r, th, dx, dy = _polar(n)
    alb = np.zeros((n, n, 3), np.float32)
    alpha = np.zeros((n, n), np.float32)
    h = np.zeros((n, n), np.float32)
    rough = np.full((n, n), 0.85, np.float32)
    metal = np.zeros((n, n), np.float32)
    hole_r = n * rng.uniform(0.035, 0.045)
    if kind == 'concrete':
        R = n * rng.uniform(0.17, 0.24) * _angular_noise(th, rng, 9, 0.28)
        t = np.clip(r / R, 0, 1.5)
        bowl = -np.clip(1 - t ** 2, 0, 1) ** 0.7
        h += bowl * 0.6
        hole = np.clip(1 - (r - hole_r) / 2.5, 0, 1)
        h -= hole * 0.8
        # chips around the rim
        for _ in range(rng.integers(2, 5)):
            a = rng.uniform(0, math.tau); rr = R.mean() * rng.uniform(0.85, 1.1); cr = n * rng.uniform(0.025, 0.045)
            cx, cy = math.cos(a) * rr, math.sin(a) * rr
            dd = np.sqrt((dx - cx) ** 2 + (dy - cy) ** 2) / _angular_noise(np.arctan2(dy - cy, dx - cx), rng, 5, 0.45)
            chip = np.clip(1 - dd / cr, 0, 1)
            h -= chip ** 0.8 * 0.25
            alpha = np.maximum(alpha, (chip > 0).astype(np.float32) * np.clip(chip * 3, 0, 1))
        cracks = _crack_lines(n, rng, rng.integers(3, 6), R.mean() * 0.8, n * 0.47, 2.2)
        h -= cracks * 0.25
        fresh = np.array([0.64, 0.62, 0.58], np.float32) * (0.9 + 0.2 * rng.random())
        grain = fft_noise(n, 1.0, int(rng.integers(1 << 30)), lo=6, hi=n / 3)
        alb[:] = fresh
        alb *= (0.55 + 0.45 * np.clip(t, 0, 1) ** 0.6)[..., None] * (1 + 0.14 * grain)[..., None]
        alb = alb * (1 - hole[..., None]) + np.array([0.04, 0.04, 0.04]) * hole[..., None]
        alb = alb * (1 - cracks[..., None] * 0.8)
        dust = np.clip(1 - (r - R) / (R * 0.8), 0, 1) * (r >= R)
        alpha = np.maximum(alpha, np.where(t < 1, 1.0, 0.0))
        alpha = np.maximum(alpha, cracks)
        alpha = np.maximum(alpha, dust * 0.22)
        alb = alb * (1 - (dust * (t >= 1))[..., None] * 0.12)
        alpha = np.clip(alpha, 0, 1)
        h *= 1.6
        rough[:] = 0.92
    elif kind == 'metal':
        hr = hole_r * 1.1
        ring = np.exp(-((r - hr * 1.6) / (hr * 0.55)) ** 2)
        petals = np.clip(_angular_noise(th, rng, 12, 0.6) - 0.6, 0, 1)
        h += ring * 0.5 + petals * np.exp(-((r - hr * 1.2) / (hr * 0.4)) ** 2) * 0.3
        hole = np.clip(1 - (r - hr * _angular_noise(th, rng, 6, 0.12)) / 1.5, 0, 1)
        h -= hole * 1.0
        bare_r = hr * rng.uniform(2.4, 3.2) * _angular_noise(th, rng, 8, 0.25)
        bare = np.clip(1 - (r - bare_r) / 2.0, 0, 1)
        scorch_r = hr * rng.uniform(4.5, 6.5)
        scorch = np.clip(1 - r / scorch_r, 0, 1) ** 1.5
        steel = np.array([0.56, 0.56, 0.55], np.float32)
        soot = np.array([0.07, 0.065, 0.06], np.float32)
        alb[:] = soot
        alb = alb * (1 - bare[..., None]) + steel * bare[..., None]
        alb = alb * (1 - hole[..., None]) + np.array([0.02, 0.02, 0.02]) * hole[..., None]
        metal = bare * (1 - hole)
        rough = 0.75 * (1 - bare) + 0.38 * bare
        alpha = np.maximum(bare, scorch * 0.55)
        alpha = np.maximum(alpha, hole)
    elif kind == 'wood':
        R = n * rng.uniform(0.10, 0.13)
        ex, ey = 0.6, 1.5  # splintering along the grain (V)
        re = np.sqrt((dx / ex) ** 2 + (dy / ey) ** 2)
        t = np.clip(re / R, 0, 2)
        hole = np.clip(1 - (r - hole_r) / 2.0, 0, 1)
        crater = np.clip(1 - t, 0, 1)
        h -= crater ** 0.6 * 0.5 + hole * 0.8
        spl = np.zeros((n, n), np.float32)
        for _ in range(rng.integers(6, 12)):
            a = (math.pi / 2 if rng.random() < 0.5 else -math.pi / 2) + rng.normal() * 0.35
            L = n * rng.uniform(0.12, 0.3); w = rng.uniform(1.5, 4.0)
            ax, ay = math.cos(a), math.sin(a)
            along = dx * ax + dy * ay
            across = -dx * ay + dy * ax
            m = np.clip(1 - np.abs(across) / w, 0, 1) * (along > hole_r) * np.clip(1 - along / L, 0, 1)
            spl = np.maximum(spl, m)
        h += spl * 0.35
        fresh = np.array([0.74, 0.60, 0.42], np.float32)
        alb[:] = fresh
        alb *= (0.7 + 0.3 * (1 - crater))[..., None]
        alb = alb * (1 - hole[..., None]) + np.array([0.05, 0.035, 0.02]) * hole[..., None]
        alpha = np.clip(np.maximum(crater * 1.5, spl), 0, 1)
        alpha = np.maximum(alpha, hole)
        rough[:] = 0.9
    else:  # glass: radial + concentric cracks
        cr = _crack_lines(n, rng, rng.integers(7, 12), hole_r * 1.5, n * 0.49, 1.3, wiggle=0.12, branch=0.5)
        conc = np.zeros((n, n), np.float32)
        for k in range(rng.integers(2, 4)):
            rr = n * rng.uniform(0.07, 0.25)
            band = np.exp(-((r - rr * _angular_noise(th, rng, 10, 0.18)) / 1.0) ** 2)
            gate = (np.cos(th * rng.integers(5, 9) + rng.uniform(0, 6)) > 0.1).astype(np.float32)
            conc = np.maximum(conc, band * gate)
        crush = np.clip(1 - r / (hole_r * 2.2), 0, 1)
        hole = np.clip(1 - (r - hole_r * 0.8) / 1.5, 0, 1)
        lines = np.clip(np.maximum(cr, conc), 0, 1)
        alb[:] = 0.92
        alb = alb * (1 - hole[..., None]) + np.array([0.15, 0.16, 0.17]) * hole[..., None]
        alpha = np.clip(np.maximum(lines * 0.85, crush * 0.9), 0, 1)
        h -= lines * 0.15
        rough[:] = 0.15
    ao = np.clip(1 + np.minimum(h, 0) * 0.6, 0.15, 1)
    return alb, alpha, h, ao, rough, metal


def make_bullet_holes(base, size):
    N = 2048
    C = N // 4
    alb = np.zeros((N, N, 3), np.float32)
    alpha = np.zeros((N, N), np.float32)
    h = np.zeros((N, N), np.float32)
    ao = np.ones((N, N), np.float32)
    rough = np.ones((N, N), np.float32)
    metal = np.zeros((N, N), np.float32)
    for row, kind in enumerate(['concrete', 'metal', 'wood', 'glass']):
        for col in range(4):
            a, al, hh, o, rgh, mt = _bullet_cell(kind, C, 1000 * row + col)
            sl = (slice(row * C, (row + 1) * C), slice(col * C, (col + 1) * C))
            alb[sl] = a; alpha[sl] = al; h[sl] = hh; ao[sl] = o; rough[sl] = rgh; metal[sl] = mt
    nrm = T.normal_from_height(h, 6.0)
    alb = np.where(alpha[..., None] > 0.003, alb, 0.5)
    return dict(albedo=alb, opacity=alpha[..., None], normal=nrm, ao=ao[..., None], rough=rough[..., None],
                metal=metal[..., None], height=None)


def _long_crack(n, rng, width):
    """A through-crack: two jagged polylines leaving the centre in opposite directions, with angular branches."""
    SS = 2
    im = Image.new('L', (n * SS, n * SS), 0)
    d = ImageDraw.Draw(im)

    def seg(x, y, a, length, w, depth):
        step = 6 * SS
        steps = max(3, int(length / step))
        drift = rng.normal() * 0.005
        pts = [(x, y)]
        for i in range(steps):
            a += drift + rng.normal() * 0.16          # mostly straight with small kinks
            x += math.cos(a) * step
            y += math.sin(a) * step
            j = rng.normal() * 1.2 * SS               # sub-step jaggedness
            pts.append((x - math.sin(a) * j, y + math.cos(a) * j))
            if depth < 3 and rng.random() < 0.06:
                seg(x, y, a + rng.choice([-1, 1]) * rng.uniform(0.5, 1.1), length * rng.uniform(0.15, 0.4) * (1 - i / steps),
                    w * 0.55, depth + 1)
        for i in range(len(pts) - 1):
            ww = max(1, int(w * SS * (1 - 0.8 * i / len(pts)) + 0.5))
            d.line([pts[i], pts[i + 1]], fill=255, width=ww)

    c = n * SS / 2
    a = rng.uniform(0, math.tau)
    for k in (0, 1):
        seg(c, c, a + k * math.pi + rng.normal() * 0.2, n * SS * rng.uniform(0.36, 0.46), width, 0)
    im = im.resize((n, n), Image.LANCZOS)
    return np.asarray(im, np.float32) / 255.0


def make_cracks(base, size):
    N = 2048
    C = N // 2
    alb = np.zeros((N, N, 3), np.float32)
    alpha = np.zeros((N, N), np.float32)
    h = np.zeros((N, N), np.float32)
    for k in range(4):
        rng = np.random.default_rng(500 + k)
        r, th, dx, dy = _polar(C)
        lines = _long_crack(C, rng, 5.0 if k < 2 else 3.2)
        halo = T.gauss_blur_periodic(lines, 5.0)
        halo = np.clip(halo / max(halo.max(), 1e-6) * 2.5, 0, 1)
        fade = np.clip(1 - (r / (C * 0.5)) ** 6, 0, 1)
        a = np.clip(np.maximum(lines, halo * 0.3) * fade, 0, 1)
        col = np.array([0.30, 0.29, 0.27], np.float32) * (1 - lines[..., None]) + np.array([0.05, 0.05, 0.045]) * lines[..., None]
        sl = (slice((k // 2) * C, (k // 2 + 1) * C), slice((k % 2) * C, (k % 2 + 1) * C))
        alb[sl] = col; alpha[sl] = a; h[sl] = -lines * fade
    nrm = T.normal_from_height(T.gauss_blur_periodic(h, 1.2), 6.0)
    ao = np.clip(1 + h * 0.7, 0.2, 1)
    return dict(albedo=alb, opacity=alpha[..., None], normal=nrm, ao=ao[..., None],
                rough=np.full((N, N, 1), 0.9, np.float32), metal=None, height=None)


def make_tire_tracks_from(m):
    """Turn ambientCG TireTracks001 (pale clay imprint) into a darkening/compaction decal for dirt roads:
    alpha = band fade x groove depth, colour = neutral compacted-dirt brown; normal kept."""
    ao = m['ao'][..., 0]
    hgt = m['height'][..., 0]
    H, W = ao.shape
    v = (np.arange(H, dtype=np.float32) + 0.5) / H
    band = np.clip(np.minimum(v, 1 - v) / 0.12, 0, 1) ** 1.5
    groove = np.clip((np.percentile(hgt, 95) - hgt) / max(np.ptp(hgt), 1e-3) * 1.6, 0, 1)
    a = np.clip(0.30 + 0.55 * groove + 0.25 * (1 - ao), 0, 1) * band[:, None]
    dark = np.array([0.20, 0.16, 0.12], np.float32)
    lite = np.array([0.33, 0.27, 0.20], np.float32)
    col = lite * (1 - groove[..., None]) + dark * groove[..., None]
    return dict(albedo=col, opacity=a[..., None], normal=m['normal'], ao=m['ao'], rough=m['rough'], metal=None,
                height=m['height'])


def recolor_conifer(alb, opacity):
    """Map the (dry, reddish) PineNeedles001 albedo onto a living-needle green ramp, keeping luminance detail."""
    lum = (alb * np.array([0.2126, 0.7152, 0.0722], np.float32)).sum(-1)
    m = opacity[..., 0] > 0.5
    lo, hi = np.percentile(lum[m], [2, 98]) if m.any() else (0, 1)
    t = np.clip((lum - lo) / max(hi - lo, 1e-3), 0, 1)[..., None]
    dark = np.array([0.10, 0.16, 0.08], np.float32)
    light = np.array([0.36, 0.44, 0.20], np.float32)
    return dark * (1 - t) + light * t


# ----------------------------------------------------------------------------------------------- blue noise
def void_and_cluster(n=64, sigma=1.9, seed=0):
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:n, 0:n]
    d2 = np.minimum(xx, n - xx) ** 2 + np.minimum(yy, n - yy) ** 2
    K = np.exp(-d2 / (2 * sigma * sigma)).astype(np.float64)

    def add(e, idx, s):
        y, x = divmod(idx, n)
        e += s * np.roll(np.roll(K, y, 0), x, 1)

    N = n * n
    m0 = N // 10
    b = np.zeros(N, bool)
    b[rng.choice(N, m0, replace=False)] = True
    e = np.zeros((n, n))
    for i in np.flatnonzero(b):
        add(e, i, 1)
    for _ in range(4 * N):  # relax initial pattern
        ef = e.ravel()
        c = int(np.argmax(np.where(b, ef, -np.inf)))
        b[c] = False; add(e, c, -1)
        ef = e.ravel()
        v = int(np.argmin(np.where(~b, ef, np.inf)))
        b[v] = True; add(e, v, 1)
        if v == c:
            break
    rank = np.zeros(N, np.int64)
    # phase 1: remove tightest clusters from the initial pattern
    b1 = b.copy(); e1 = e.copy(); ones = m0
    while ones > 0:
        c = int(np.argmax(np.where(b1, e1.ravel(), -np.inf)))
        b1[c] = False; add(e1, c, -1); ones -= 1; rank[c] = ones
    # phase 2: fill largest voids up to half
    b2 = b.copy(); e2 = e.copy(); ones = m0
    while ones < N // 2:
        v = int(np.argmin(np.where(~b2, e2.ravel(), np.inf)))
        b2[v] = True; add(e2, v, 1); rank[v] = ones; ones += 1
    # phase 3: invert -> fill the tightest clusters of zeros
    ez = np.zeros((n, n))
    for i in np.flatnonzero(~b2):
        add(ez, i, 1)
    while ones < N:
        c = int(np.argmax(np.where(~b2, ez.ravel(), -np.inf)))
        b2[c] = True; add(ez, c, -1); rank[c] = ones; ones += 1
    return (rank.reshape(n, n).astype(np.float32) + 0.5) / N


def write_noise(out_dir):
    os.makedirs(out_dir, exist_ok=True)
    chans = [void_and_cluster(64, 1.9, s) for s in range(4)]
    Image.fromarray((chans[0] * 256).clip(0, 255).astype(np.uint8), 'L').save(os.path.join(out_dir, 'blue_noise_64.png'), optimize=True)
    rgba = np.stack([(c * 256).clip(0, 255).astype(np.uint8) for c in chans], -1)
    Image.fromarray(rgba, 'RGBA').save(os.path.join(out_dir, 'blue_noise_64_rgba.png'), optimize=True)
    # spectrum sanity: low-frequency energy should be tiny compared with high-frequency
    F = np.abs(np.fft.fft2(chans[0] - chans[0].mean()))
    f = np.sqrt(np.fft.fftfreq(64)[:, None] ** 2 + np.fft.fftfreq(64)[None, :] ** 2)
    print('blue noise low/high energy ratio:', float(F[(f > 0) & (f < 0.1)].mean() / F[f > 0.3].mean()))


if __name__ == '__main__':
    if sys.argv[1] == 'noise':
        write_noise(sys.argv[2])
