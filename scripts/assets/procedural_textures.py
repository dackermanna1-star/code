"""Procedural (numpy) texture generators and post-processors.

Every generator returns (albedo_srgb HxWx3, normal_gl HxWx3 decoded vectors, roughness HxW),
all seamless (periodic FFT noise, wrapped distances and integer-periodic patterns only).
`post_<name>` functions modify an already-baked photo texture (same return triple).
"""
import numpy as np

import texlib as T


def _srgb(c):
    return np.asarray(c, np.float32) / 255.0


def _lin(c):
    return T.srgb_to_linear(_srgb(c))


def _out(lin, nrm, rough):
    return T.linear_to_srgb(np.clip(lin, 0, 1)), nrm, np.clip(rough, 0, 1).astype(np.float32)


def _aniso_noise(size, angle, stretch, seed, beta=1.6, fmin=0.0, fmax=0.5):
    """Periodic noise whose features are elongated along `angle` (radians from +U)."""
    rng = np.random.default_rng(seed)
    wn = rng.standard_normal((size, size)).astype(np.float32)
    fx = np.fft.fftfreq(size)[None, :]
    fy = np.fft.fftfreq(size)[:, None]
    c, s = np.cos(angle), np.sin(angle)
    along = fx * c - fy * s
    across = fx * s + fy * c
    f = np.sqrt((along * stretch) ** 2 + across ** 2)
    f[0, 0] = 1.0
    amp = 1.0 / np.power(f, beta / 2.0)
    raw = np.sqrt(fx ** 2 + fy ** 2)
    amp[(raw < fmin) | (raw > fmax)] = 0
    amp[0, 0] = 0
    out = np.real(np.fft.ifft2(np.fft.fft2(wn) * amp)).astype(np.float32)
    return out / max(out.std(), 1e-6)


def _strands(size, n, seed, length=(20, 80), angle=0.0, spread=0.5, curl=0.08, sigma=0.8):
    """Rasterise n soft, slightly curling fibres onto a wrapping canvas (density map)."""
    rng = np.random.default_rng(seed)
    steps = int(max(length) * 2)
    lens = rng.uniform(length[0], length[1], n)
    ang0 = angle + rng.normal(0, spread, n)
    dang = rng.normal(0, curl, (n, steps))
    ang = ang0[:, None] + np.cumsum(dang, axis=1)
    x = rng.uniform(0, size, n)[:, None] + np.cumsum(np.cos(ang) * 0.5, axis=1)
    y = rng.uniform(0, size, n)[:, None] + np.cumsum(np.sin(ang) * 0.5, axis=1)
    keep = (np.arange(steps)[None, :] * 0.5) < lens[:, None]
    w = rng.uniform(0.5, 1.0, n)[:, None] * np.ones((1, steps))
    x, y, w = x[keep], y[keep], w[keep]
    canvas = np.zeros((size, size), np.float32)
    x0, y0 = np.floor(x).astype(int), np.floor(y).astype(int)
    fx, fy = x - x0, y - y0
    for dx, dy, wt in ((0, 0, (1 - fx) * (1 - fy)), (1, 0, fx * (1 - fy)), (0, 1, (1 - fx) * fy), (1, 1, fx * fy)):
        np.add.at(canvas, ((y0 + dy) % size, (x0 + dx) % size), w * wt)
    return T.blur_wrap(canvas, sigma)


def _worley_xy(size, n_points, seed, xx, yy, jitter=1.0):
    """Tileable Worley F1/F2 and nearest-point id evaluated at (possibly warped) coords."""
    rng = np.random.default_rng(seed)
    g = int(np.ceil(np.sqrt(n_points)))
    cell = size / g
    gy, gx = np.mgrid[0:g, 0:g]
    px = ((gx + 0.5 + (rng.random((g, g)) - 0.5) * jitter) * cell).ravel()
    py = ((gy + 0.5 + (rng.random((g, g)) - 0.5) * jitter) * cell).ravel()
    f1 = np.full(xx.shape, 1e9, np.float32)
    f2 = np.full(xx.shape, 1e9, np.float32)
    ids = np.zeros(xx.shape, np.int32)
    half = size / 2.0
    for i in range(len(px)):
        dx = (xx - px[i] + half) % size - half
        dy = (yy - py[i] + half) % size - half
        d = np.sqrt(dx * dx + dy * dy)
        closer = d < f1
        f2 = np.where(closer, f1, np.minimum(f2, d))
        ids = np.where(closer, i, ids)
        f1 = np.where(closer, d, f1)
    return f1, f2, ids


def _grid(size):
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    return xx, yy


# ------------------------------------------------------------------------------- MDF


def mdf(size):
    fine = T.spectral_noise(size, beta=0.6, seed=11, fmin=0.08)
    mid = T.spectral_noise(size, beta=1.6, seed=12, fmin=0.02, fmax=0.2)
    low = T.spectral_noise(size, beta=2.5, seed=13, fmax=0.05)
    fib = np.zeros((size, size), np.float32)
    for i, ang in enumerate(np.linspace(0, np.pi, 6, endpoint=False)):  # short random fibres
        n = _aniso_noise(size, ang, 6.0, 100 + i, beta=1.2, fmin=0.03)
        fib = np.maximum(fib, 1.0 - np.abs(n) * 3.0)
    fib = np.clip(fib, 0, 1)
    rng = np.random.default_rng(14)
    specks = T.blur_wrap((rng.random((size, size)) > 0.995).astype(np.float32), 0.6) * 4
    L = 1.0 + 0.06 * fine + 0.05 * mid + 0.04 * low + 0.06 * (fib - fib.mean()) - 0.25 * specks
    lin = np.clip(_lin((172, 134, 98))[None, None, :] * L[..., None], 0, 1)
    lin[..., 2] *= 1.0 - 0.05 * (fib - fib.mean())
    h = 0.2 * fine + 0.6 * fib + 0.2 * mid
    nrm = T.height_to_normal(T.blur_wrap(h, 0.7), 0.9)
    rough = 0.88 + 0.05 * fine - 0.03 * fib
    return _out(lin, nrm, rough)


# ---------------------------------------------------------------------------- enamel


def enamel(size):
    peel = T.spectral_noise(size, beta=2.0, seed=21, fmin=0.03, fmax=0.18)
    low = T.spectral_noise(size, beta=3.0, seed=22, fmax=0.03)
    fine = T.spectral_noise(size, beta=0.0, seed=23, fmin=0.2)
    lin = _lin((228, 228, 225))[None, None, :] * (1.0 + 0.01 * low + 0.005 * fine)[..., None]
    nrm = T.height_to_normal(peel, 0.05)
    rough = 0.22 + 0.03 * low + 0.015 * peel
    return _out(lin, nrm, rough)


# ------------------------------------------------------------------------ insulation


def insulation(size):
    """Pink fibreglass batt: layered soft fibres, fluffy tufts and darker gaps."""
    deep = _strands(size, 700, 31, (30, 100), 0.0, 0.6, 0.06, 2.2)
    mid = _strands(size, 900, 32, (20, 80), 0.0, 0.7, 0.09, 1.0)
    top = _strands(size, 500, 33, (15, 60), 0.0, 0.8, 0.12, 0.55)
    clump = T.spectral_noise(size, beta=2.6, seed=34, fmax=0.05)
    tuft = 1.0 / (1.0 + np.exp(-1.6 * clump))
    dens = (0.6 * deep / deep.mean() + 0.8 * mid / mid.mean() + 0.6 * top / top.mean()) * (0.45 + 0.75 * tuft)
    h = 1.0 - np.exp(-0.55 * dens)
    gap = _lin((176, 78, 98))
    body = _lin((236, 150, 162))
    hi = _lin((252, 212, 216))
    t = T.norm01(h)[..., None]
    lin = np.where(t < 0.55, gap + (body - gap) * (t / 0.55), body + (hi - body) * ((t - 0.55) / 0.45))
    nrm = T.height_to_normal(h, 3.0)
    rough = 0.97 - 0.05 * T.norm01(h)
    return _out(lin, nrm, rough)


# --------------------------------------------------------------------------- foliage


def foliage(size):
    """Leaf surface: curved lateral veins + fine reticulate venation, waxy green."""
    xx, yy = _grid(size)
    wx = 7.0 * T.spectral_noise(size, beta=3.2, seed=41, fmax=0.03)
    wy = 7.0 * T.spectral_noise(size, beta=3.2, seed=42, fmax=0.03)
    # lateral veins: parallel lines with an integer wave vector (keeps them periodic)
    kx, ky = 3, -5
    ph = (kx * (xx + wx) + ky * (yy + wy)) / size
    spacing = size / np.hypot(kx, ky)
    d = np.abs((ph % 1.0) - 0.5) * spacing
    lateral = np.exp(-(d / 1.3) ** 2)
    f1, f2, _ = _worley_xy(size, 260, 43, xx + 0.5 * wx, yy + 0.5 * wy, 0.9)
    fine = np.exp(-((f2 - f1) / 0.8) ** 2)
    areole = T.norm01(f1)
    mott = T.spectral_noise(size, beta=2.2, seed=44, fmax=0.08)
    grain = T.spectral_noise(size, beta=0.5, seed=45, fmin=0.15)
    base = _lin((52, 98, 36))
    vein = _lin((126, 160, 70))
    t = np.clip(0.85 * lateral + 0.3 * fine, 0, 1)[..., None]
    lin = (base * (1 - t) + vein * t) * (1.0 + 0.10 * mott + 0.03 * grain - 0.07 * areole)[..., None]
    h = -1.0 * lateral - 0.35 * fine + 0.25 * (1 - areole)
    nrm = T.height_to_normal(T.blur_wrap(h, 0.6), 1.5)
    rough = 0.42 + 0.08 * areole + 0.1 * lateral + 0.03 * mott
    return _out(lin, nrm, rough)


# ------------------------------------------------------------------------- wallpaper


def _ell(x, y, cx, cy, rx, ry, rot=0.0):
    c, s = np.cos(rot), np.sin(rot)
    dx, dy = x - cx, y - cy
    u, v = dx * c + dy * s, -dx * s + dy * c
    return (u / rx) ** 2 + (v / ry) ** 2


def _fill(d, edge=7.0):
    return np.clip((1.0 - d) * edge, 0, 1)


def _fleur(x, y):
    """Mirror-symmetric fleur-de-lis style ornament, cell coords in [-0.5, 0.5], y up."""
    ax = np.abs(x)
    m = _fill(_ell(ax, y, 0.0, 0.07, 0.055, 0.2))                        # central upright petal
    m = np.maximum(m, _fill(_ell(ax, y, 0.0, 0.29, 0.03, 0.05)))          # tip
    m = np.maximum(m, _fill(_ell(ax, y, 0.11, 0.04, 0.04, 0.15, -0.75)))  # side petals curling out
    m = np.maximum(m, _fill(_ell(ax, y, 0.19, 0.15, 0.03, 0.05, -0.2)))   # side petal tips
    m = np.maximum(m, _fill(_ell(ax, y, 0.0, -0.08, 0.15, 0.025)))        # horizontal band
    m = np.maximum(m, _fill(_ell(ax, y, 0.0, -0.2, 0.035, 0.08)))         # stem
    m = np.maximum(m, _fill(_ell(ax, y, 0.07, -0.2, 0.05, 0.03, 0.5)))    # foot leaves
    # thin carved centre line on the main petal
    m = m - 0.5 * np.clip(1 - ax / 0.008, 0, 1) * (np.abs(y - 0.07) < 0.15)
    return np.clip(m, 0, 1)


def wallpaper(size):
    """Tone-on-tone damask: ogee trellis + fleur ornaments, embossed paper. Neutral, tintable."""
    xx, yy = _grid(size)
    u = (xx + 0.5) / size
    v = 1.0 - (yy + 0.5) / size
    rep = 2  # ornament repeats per tile in each direction (half-drop adds the in-between row)
    cov = np.zeros((size, size), np.float32)
    for ox, oy in ((0.0, 0.0), (0.5, 0.5)):
        cx = ((u * rep + ox) % 1.0) - 0.5
        cy = ((v * rep + oy) % 1.0) - 0.5
        cov = np.maximum(cov, _fleur(cx * 1.15, cy * 1.15))
    # ogee trellis: two mirrored sine curves per repeat, drawn as thin lines
    su = u * rep
    sv = v * rep * 2.0
    for sgn in (1.0, -1.0):
        dx = np.abs(((su + 0.25 + sgn * 0.17 * np.sin(np.pi * sv)) % 1.0) - 0.5)
        line = np.clip(1.0 - (dx - 0.006) / 0.006, 0, 1) * (dx < 0.012)
        cov = np.maximum(cov, line * 0.85)
    cov = T.blur_wrap(cov, 0.6)
    paper = T.spectral_noise(size, beta=0.8, seed=51, fmin=0.05)
    low = T.spectral_noise(size, beta=2.5, seed=52, fmax=0.04)
    stripes = 0.5 + 0.5 * np.cos(2 * np.pi * u * 96)
    ground = _lin((228, 226, 221))  # near-neutral: the wallpaper is tintable
    ink = _lin((186, 183, 176))
    lin = ground * (1 - cov[..., None]) + ink * cov[..., None]
    lin = lin * (1.0 + 0.012 * stripes * (1 - cov) + 0.02 * paper + 0.01 * low)[..., None]
    h = 0.6 * cov + 0.06 * paper
    nrm = T.height_to_normal(T.blur_wrap(h, 0.8), 1.2)
    rough = 0.78 - 0.22 * cov + 0.02 * paper
    return _out(lin, nrm, rough)


# --------------------------------------------------------------------- post-processes


def post_granite_dark(col, nrm, rough, size):
    """Turn a light salt-and-pepper granite into a dark granite with light flecks."""
    L = T.luminance(T.srgb_to_linear(col))
    a, b = np.percentile(L, [2, 98])
    t = np.clip((L - a) / max(b - a, 1e-4), 0, 1)
    inv = 1.0 - t  # dark specks -> light flecks, light matrix -> dark
    flecks = np.clip((inv - 0.45) / 0.55, 0, 1) ** 1.6
    out_L = 0.012 + 0.03 * inv + 0.32 * flecks
    return _out(out_L[..., None] * np.array([1.0, 0.98, 1.03], np.float32), nrm, rough)


def post_flutes(col, nrm, rough, size, periods=48):
    """Faint corrugation flutes (running along U) on kraft paper."""
    yy = np.mgrid[0:size, 0:size][0].astype(np.float32)
    ph = 2 * np.pi * yy * periods / size
    nrm = T.combine_normals(nrm, T.height_to_normal(np.sin(ph), 0.12))
    lin = T.srgb_to_linear(col) * (1.0 + 0.025 * np.cos(ph))[..., None]
    return _out(lin, nrm, rough)


def post_orange_peel(col, nrm, rough, size):
    """Fine orange-peel roller relief (paint) on top of the photo normal."""
    peel = T.spectral_noise(size, beta=1.6, seed=61, fmin=0.06, fmax=0.3)
    nrm = T.combine_normals(nrm, T.height_to_normal(peel, 0.035))
    return col, nrm, np.clip(rough + 0.015 * peel, 0, 1)


def post_warm_white(col, nrm, rough, size):
    """Shift a neutral light surface to a chalky warm off-white."""
    return _out(T.srgb_to_linear(col) * np.array([1.03, 1.0, 0.93], np.float32), nrm, rough)


def post_glaze(col, nrm, rough, size):
    """Very subtle tonal variation and gentle waviness for glossy glazed ceramic."""
    low = T.spectral_noise(size, beta=3.0, seed=71, fmax=0.04)
    wave = T.spectral_noise(size, beta=3.0, seed=72, fmax=0.05)
    lin = T.srgb_to_linear(col) * (1.0 + 0.007 * low)[..., None] * np.array([1.0, 1.0, 0.99], np.float32)
    nrm = T.combine_normals(nrm, T.height_to_normal(wave, 0.5))
    return _out(lin, nrm, rough)


def post_weave(col, nrm, rough, size, p=4):
    """Plain-weave thread relief (period p px, size % (2p) == 0) for upholstery fabric."""
    xx, yy = _grid(size)
    i = np.floor(xx / p)
    j = np.floor(yy / p)
    fx = (xx / p) % 1.0 - 0.5
    fy = (yy / p) % 1.0 - 0.5
    warp_profile = np.cos(np.pi * fx)
    weft_profile = np.cos(np.pi * fy)
    over = 0.5 + 0.5 * np.sin(np.pi * (yy / p) + np.pi * i)  # warp rises/falls along its length
    under = 0.5 + 0.5 * np.sin(np.pi * (xx / p) + np.pi * j + np.pi)
    h = np.maximum(warp_profile * (0.35 + 0.65 * over), weft_profile * (0.35 + 0.65 * under))
    rng = np.random.default_rng(81)
    slub = ((rng.random(size // p)[i.astype(int)] - 0.5) * 0.06
            + (rng.random(size // p)[j.astype(int)] - 0.5) * 0.06)
    nrm = T.combine_normals(nrm, T.height_to_normal(T.blur_wrap(h, 0.5), 0.9))
    lin = T.srgb_to_linear(col) * (0.86 + 0.14 * h + slub)[..., None]
    return _out(lin, nrm, rough + 0.03 * (1 - h))


def post_stipple(col, nrm, rough, size):
    """Fine matte grain (moulded plastic texture)."""
    g = T.spectral_noise(size, beta=0.8, seed=91, fmin=0.12)
    nrm = T.combine_normals(nrm, T.height_to_normal(T.blur_wrap(g, 0.5), 0.06))
    lin = T.srgb_to_linear(col) * (1.0 + 0.006 * g)[..., None]
    return _out(lin, nrm, rough + 0.02 * g)


def post_spangle(col, nrm, rough, size):
    """Galvanised zinc spangle: crystal cells with slightly different tone, tilt and gloss."""
    xx, yy = _grid(size)
    wx = 3.0 * T.spectral_noise(size, beta=3.0, seed=101, fmax=0.05)
    wy = 3.0 * T.spectral_noise(size, beta=3.0, seed=102, fmax=0.05)
    f1, f2, ids = _worley_xy(size, 900, 103, xx + wx, yy + wy, 1.0)
    rng = np.random.default_rng(104)
    n = int(ids.max()) + 1
    tone = rng.normal(0, 1, n)[ids]
    tilt = rng.normal(0, 0.06, (n, 2))[ids]
    gloss = rng.normal(0, 1, n)[ids]
    edge = np.exp(-((f2 - f1) / 0.7) ** 2)
    facet = T.normalize(np.stack([tilt[..., 0], tilt[..., 1], np.ones_like(tone)], -1))
    nrm = T.combine_normals(nrm, facet)
    lin = T.srgb_to_linear(col) * (1.0 + 0.035 * tone - 0.05 * edge)[..., None]
    return _out(lin, nrm, rough + 0.05 * gloss + 0.05 * edge)


def post_brushed(col, nrm, rough, size):
    """Fine brushing streaks along U (satin aluminium)."""
    s = _aniso_noise(size, 0.0, 60.0, 111, beta=1.0, fmin=0.02)
    nrm = T.combine_normals(nrm, T.height_to_normal(s, 0.04))
    lin = T.srgb_to_linear(col) * (1.0 + 0.02 * s)[..., None]
    return _out(lin, nrm, rough + 0.03 * s)


def post_grain(col, nrm, rough, size):
    """Sugary fine grain + tiny pores (unglazed ceramic body)."""
    rng = np.random.default_rng(121)
    g = T.spectral_noise(size, beta=0.3, seed=122, fmin=0.2)
    pores = T.blur_wrap((rng.random((size, size)) > 0.993).astype(np.float32), 0.7) * 5
    h = 0.15 * g - pores
    nrm = T.combine_normals(nrm, T.height_to_normal(h, 0.5))
    lin = T.srgb_to_linear(col) * (1.0 + 0.03 * g - 0.18 * np.clip(pores, 0, 1))[..., None]
    return _out(lin, nrm, rough)
