"""Procedural (numpy) texture generators and post-processors.

Every generator returns (albedo_srgb HxWx3, normal_gl HxWx3 decoded vectors, roughness HxW),
all seamless (periodic FFT noise / wrapped distances only).
`post_<name>` functions modify an already-baked photo texture.
"""
import numpy as np

import texlib as T


def _srgb(c):
    return np.asarray(c, np.float32) / 255.0


def _lin(c):
    return T.srgb_to_linear(_srgb(c))


def _aniso_noise(size, angle, stretch, seed, beta=1.6, fmin=0.0, fmax=0.5):
    """Periodic noise whose features are elongated along `angle` (radians from +U)."""
    rng = np.random.default_rng(seed)
    wn = rng.standard_normal((size, size)).astype(np.float32)
    fx = np.fft.fftfreq(size)[None, :]
    fy = np.fft.fftfreq(size)[:, None]
    # frequency components along / across the fibre direction
    c, s = np.cos(angle), np.sin(angle)
    along = fx * c - fy * s  # image rows grow downwards -> minus for CCW angle
    across = fx * s + fy * c
    f = np.sqrt((along * stretch) ** 2 + across ** 2)
    f[0, 0] = 1.0
    amp = 1.0 / np.power(f, beta / 2.0)
    raw = np.sqrt(fx ** 2 + fy ** 2)
    amp[(raw < fmin) | (raw > fmax)] = 0
    amp[0, 0] = 0
    out = np.real(np.fft.ifft2(np.fft.fft2(wn) * amp)).astype(np.float32)
    return out / max(out.std(), 1e-6)


# ------------------------------------------------------------------------------- MDF


def mdf(size):
    fine = T.spectral_noise(size, beta=0.6, seed=11, fmin=0.08)
    mid = T.spectral_noise(size, beta=1.6, seed=12, fmin=0.02, fmax=0.2)
    low = T.spectral_noise(size, beta=2.5, seed=13, fmax=0.05)
    # short randomly oriented fibres
    fib = np.zeros((size, size), np.float32)
    for i, ang in enumerate(np.linspace(0, np.pi, 6, endpoint=False)):
        n = _aniso_noise(size, ang, 6.0, 100 + i, beta=1.2, fmin=0.03)
        fib = np.maximum(fib, 1.0 - np.abs(n) * 3.0)
    fib = np.clip(fib, 0, 1)
    rng = np.random.default_rng(14)
    specks = (rng.random((size, size)) > 0.995).astype(np.float32)
    specks = T.blur_wrap(specks, 0.6) * 4
    L = 1.0 + 0.06 * fine + 0.05 * mid + 0.04 * low + 0.06 * (fib - fib.mean()) - 0.25 * specks
    base = _lin((172, 134, 98))
    lin = np.clip(base[None, None, :] * L[..., None], 0, 1)
    # slight hue wobble (darker fibres more reddish)
    lin[..., 2] *= 1.0 - 0.05 * (fib - fib.mean())
    h = 0.5 * fine * 0.4 + 0.6 * fib + 0.2 * mid
    nrm = T.height_to_normal(T.blur_wrap(h, 0.7), 0.9)
    rough = np.clip(0.88 + 0.05 * fine - 0.03 * fib, 0, 1)
    return T.linear_to_srgb(lin), nrm, rough


# ---------------------------------------------------------------------------- enamel


def enamel(size):
    peel = T.spectral_noise(size, beta=2.0, seed=21, fmin=0.03, fmax=0.18)
    low = T.spectral_noise(size, beta=3.0, seed=22, fmax=0.03)
    fine = T.spectral_noise(size, beta=0.0, seed=23, fmin=0.2)
    lin = _lin((236, 236, 233))[None, None, :] * (1.0 + 0.012 * low + 0.006 * fine)[..., None]
    nrm = T.height_to_normal(peel, 0.05)
    rough = np.clip(0.22 + 0.03 * low + 0.015 * peel, 0, 1)
    return T.linear_to_srgb(np.clip(lin, 0, 1)), nrm, rough


# ------------------------------------------------------------------------ insulation


def insulation(size):
    h = np.zeros((size, size), np.float32)
    dens = np.zeros((size, size), np.float32)
    rng = np.random.default_rng(31)
    for i in range(14):
        ang = rng.uniform(-0.6, 0.6)  # batt fibres are roughly laminar along U
        n = _aniso_noise(size, ang, rng.uniform(8, 18), 300 + i, beta=1.4, fmin=0.01)
        ridge = np.clip(1.0 - np.abs(n) * rng.uniform(2.5, 4.0), 0, 1) ** 2
        w = rng.uniform(0.4, 1.0)
        h = np.maximum(h, ridge * w)
        dens += ridge * w
    clump = T.spectral_noise(size, beta=2.4, seed=33, fmax=0.06)
    h = h * (0.75 + 0.25 * np.tanh(clump))
    dens = T.norm01(T.blur_wrap(dens, 1.0))
    # colour: fluffy pink, deeper pink in the gaps, pale fibre highlights
    deep = _lin((200, 105, 120))
    light = _lin((250, 196, 200))
    t = np.clip(0.35 * h + 0.45 * dens + 0.1 * np.tanh(clump) + 0.2, 0, 1)[..., None]
    lin = deep * (1 - t) + light * t
    nrm = T.height_to_normal(T.blur_wrap(h, 0.5), 2.2)
    rough = np.clip(0.92 + 0.05 * (1 - h), 0, 1)
    return T.linear_to_srgb(np.clip(lin, 0, 1)), nrm, rough


# --------------------------------------------------------------------------- foliage


def foliage(size):
    # reticulate venation: Worley cell borders at two scales, plus parallel lateral veins
    f1a, f2a = T.worley(size, 36, seed=41, jitter=0.9)
    f1b, f2b = T.worley(size, 220, seed=42, jitter=0.9)
    big = np.exp(-((f2a - f1a) / 1.6) ** 2)
    small = np.exp(-((f2b - f1b) / 0.9) ** 2)
    cellshade = T.norm01(f1b)  # slight cushion inside the small areoles
    mott = T.spectral_noise(size, beta=2.2, seed=43, fmax=0.08)
    fine = T.spectral_noise(size, beta=0.5, seed=44, fmin=0.15)
    base = _lin((58, 102, 38))
    vein = _lin((120, 150, 62))
    t = np.clip(0.8 * big + 0.35 * small, 0, 1)[..., None]
    lin = base * (1 - t) + vein * t
    lin = lin * (1.0 + 0.10 * mott + 0.03 * fine - 0.08 * cellshade)[..., None]
    h = -0.9 * big - 0.35 * small + 0.25 * (1 - cellshade)
    nrm = T.height_to_normal(T.blur_wrap(h, 0.6), 1.6)
    rough = np.clip(0.42 + 0.08 * cellshade + 0.1 * big + 0.03 * mott, 0, 1)
    return T.linear_to_srgb(np.clip(lin, 0, 1)), nrm, rough


# ------------------------------------------------------------------------- wallpaper


def _damask_motif(x, y):
    """Implicit mirror-symmetric ornament in cell coords x,y in [-0.5,0.5] (y up).
    Returns coverage 0..1."""
    ax = np.abs(x)

    def ell(cx, cy, rx, ry, rot=0.0):
        c, s = np.cos(rot), np.sin(rot)
        dx, dy = ax - cx, y - cy
        u, v = dx * c + dy * s, -dx * s + dy * c
        return (u / rx) ** 2 + (v / ry) ** 2

    def disk(d):
        return np.clip((1.0 - d) * 6.0, 0, 1)

    m = disk(ell(0.0, 0.02, 0.07, 0.20))                 # central bud
    m = np.maximum(m, disk(ell(0.0, 0.27, 0.035, 0.07)))  # top finial
    m = np.maximum(m, disk(ell(0.0, -0.27, 0.05, 0.05)))  # bottom drop
    m = np.maximum(m, disk(ell(0.13, 0.10, 0.05, 0.14, -0.6)))   # upper leaves
    m = np.maximum(m, disk(ell(0.15, -0.12, 0.045, 0.12, 0.7)))  # lower leaves
    m = np.maximum(m, disk(ell(0.26, 0.0, 0.03, 0.03)))  # side dots
    # carve a thin outline/vein into the bud so it reads as ornament
    vein = np.clip(1 - np.abs(ell(0.0, 0.02, 0.04, 0.15) - 1.0) * 10, 0, 1)
    return np.clip(m - 0.6 * vein, 0, 1)


def wallpaper(size):
    # pattern repeat: 2 motif rows per tile, half-drop lattice (diamond arrangement)
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    u = (xx + 0.5) / size
    v = 1.0 - (yy + 0.5) / size
    rep_x, rep_y = 2, 2
    cov = np.zeros((size, size), np.float32)
    for ox, oy in ((0.0, 0.0), (0.5, 0.5)):
        cx = ((u * rep_x + ox) % 1.0) - 0.5
        cy = ((v * rep_y + oy) % 1.0) - 0.5
        cov = np.maximum(cov, _damask_motif(cx, cy))
    cov = T.blur_wrap(cov, 0.7)
    # fine vertical satin stripes in the ground
    stripes = 0.5 + 0.5 * np.cos(2 * np.pi * u * 64)
    paper = T.spectral_noise(size, beta=0.8, seed=51, fmin=0.05)
    low = T.spectral_noise(size, beta=2.5, seed=52, fmax=0.04)
    ground = _lin((232, 228, 220))
    ink = _lin((196, 190, 178))
    lin = ground * (1 - cov[..., None]) + ink * cov[..., None]
    lin = lin * (1.0 + 0.015 * stripes * (1 - cov) + 0.02 * paper + 0.01 * low)[..., None]
    h = 0.6 * cov + 0.08 * paper
    nrm = T.height_to_normal(T.blur_wrap(h, 0.8), 1.2)
    rough = np.clip(0.75 - 0.25 * cov + 0.02 * paper, 0, 1)
    return T.linear_to_srgb(np.clip(lin, 0, 1)), nrm, rough


# --------------------------------------------------------------------- post-processes


def post_granite_dark(col, nrm, rough, size):
    """Turn a light salt-and-pepper granite into a dark granite with light flecks."""
    lin = T.srgb_to_linear(col)
    L = T.luminance(lin)
    a, b = np.percentile(L, [2, 98])
    t = np.clip((L - a) / max(b - a, 1e-4), 0, 1)
    inv = 1.0 - t  # dark specks -> light flecks, light matrix -> dark
    flecks = np.clip((inv - 0.45) / 0.55, 0, 1) ** 1.6
    out_L = 0.012 + 0.03 * inv + 0.32 * flecks
    tint = np.array([1.0, 0.98, 1.03], np.float32)
    lin2 = out_L[..., None] * tint
    return T.linear_to_srgb(np.clip(lin2, 0, 1)), nrm, rough


def post_flutes(col, nrm, rough, size, periods=48):
    """Add faint corrugation flutes (running along U) to a kraft-paper texture."""
    yy = np.mgrid[0:size, 0:size][0].astype(np.float32)
    ph = 2 * np.pi * yy * periods / size
    h = np.sin(ph)
    fl = T.height_to_normal(h, 0.12)
    nrm = T.combine_normals(nrm, fl)
    lin = T.srgb_to_linear(col) * (1.0 + 0.025 * np.cos(ph))[..., None]
    return T.linear_to_srgb(np.clip(lin, 0, 1)), nrm, rough
