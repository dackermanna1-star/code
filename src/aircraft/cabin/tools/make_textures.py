# Generates the cabin texture sets into assets/textures/cabin-*/ (run with python3 -I)
import sys, os
import numpy as np
from PIL import Image, ImageFilter

DL = sys.argv[1]      # extracted downloads dir
OUT = sys.argv[2]     # repo assets/textures
rng = np.random.default_rng(7)

def save(img, path, q=82):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if isinstance(img, np.ndarray):
        a = np.clip(img, 0, 1)
        if a.ndim == 2: img = Image.fromarray((a * 255 + 0.5).astype(np.uint8), 'L')
        else: img = Image.fromarray((a * 255 + 0.5).astype(np.uint8), 'RGB')
    img.save(path, 'JPEG', quality=q, optimize=True, progressive=True)
    print(path, os.path.getsize(path))

def load(path, size=None, mode='RGB'):
    im = Image.open(path).convert(mode)
    if size: im = im.resize((size, size), Image.LANCZOS)
    return np.asarray(im).astype(np.float32) / 255.0

def periodic_noise(n, beta=2.0, seed=0, lo=1, hi=None):
    """Seamless fractal noise via FFT filtering of white noise. Returns [-1,1]-ish normalised."""
    r = np.random.default_rng(seed)
    w = r.standard_normal((n, n))
    F = np.fft.fft2(w)
    fy = np.fft.fftfreq(n)[:, None] * n
    fx = np.fft.fftfreq(n)[None, :] * n
    f = np.sqrt(fx * fx + fy * fy)
    f[0, 0] = 1
    amp = 1.0 / np.power(f, beta / 2)
    amp[f < lo] = 0
    if hi: amp[f > hi] = 0
    out = np.real(np.fft.ifft2(F * amp))
    out -= out.mean(); out /= (np.abs(out).max() + 1e-9)
    return out

def height_to_normal(h, strength):
    # h periodic; central differences with wrap
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5 * strength
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5 * strength
    # OpenGL convention: +Y up in tangent space; image rows go down, so flip dy
    nx, ny, nz = -dx, dy, np.ones_like(h)
    l = np.sqrt(nx * nx + ny * ny + nz * nz)
    return np.stack([nx / l * 0.5 + 0.5, ny / l * 0.5 + 0.5, nz / l * 0.5 + 0.5], -1)

def srgb_to_lin(c): return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
def lin_to_srgb(c): c = np.clip(c, 0, 1); return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055)
def hexc(h): h = h.lstrip('#'); return np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)], np.float32)

# ---------------------------------------------------------------- carpet
def carpet():
    N = 1024
    src = f'{DL}/x_Carpet012/Carpet012_1K-JPG'
    col = load(src + '_Color.jpg', N)
    lum = col.mean(-1)
    detail = lum / lum.mean()                      # fibre luminance variation ~1
    detail = 1 + (detail - 1) * 0.9
    # pattern: tile = 0.6 m, 6 x 6 cells (10 cm)
    yy, xx = np.mgrid[0:N, 0:N].astype(np.float32) / N
    cells = 6
    u = xx * cells; v = yy * cells
    row = np.floor(v)
    u2 = u + 0.5 * (row % 2)                         # brick offset
    fu = (u2 % 1) - 0.5; fv = (v % 1) - 0.5
    cid = (np.floor(u2) % cells) + row * cells
    # motif A: small rounded diamond outline; motif B: pair of dashes (stylised kingfisher wing)
    d1 = np.abs(fu) + np.abs(fv)
    ringA = np.clip(1 - np.abs(d1 - 0.20) / 0.035, 0, 1)
    dot = np.clip(1 - d1 / 0.05, 0, 1)
    ang = np.where((cid % 2) == 0, 1.0, -1.0)
    du = fu * 0.7071 + ang * fv * 0.7071; dv = -ang * fu * 0.7071 + fv * 0.7071
    dash1 = np.clip(1 - np.maximum(np.abs(du) / 0.16, np.abs(dv - 0.05) / 0.02), 0, 1)
    dash2 = np.clip(1 - np.maximum(np.abs(du + 0.03) / 0.11, np.abs(dv + 0.05) / 0.02), 0, 1)
    motifA = np.clip(ringA + dot, 0, 1)
    motifB = np.clip(dash1 + dash2, 0, 1)
    sel = ((row + np.floor(u2)) % 2) == 0
    teal = np.where(sel, motifA, 0.0); grey = np.where(sel, 0.0, motifB)
    soft = lambda m: np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.6))).astype(np.float32) / 255
    teal = soft(teal); grey = soft(grey)
    # tufted edges: modulate motif by fibre noise
    fib = (detail - 1)
    teal = np.clip(teal * (1 + fib * 1.5), 0, 1); grey = np.clip(grey * (1 + fib * 1.5), 0, 1)
    base = srgb_to_lin(hexc('#1c2433'))
    alt = srgb_to_lin(hexc('#202a3b'))
    mott = periodic_noise(N, 2.6, 3, lo=2) * 0.5 + 0.5
    basec = base[None, None] * (1 - mott[..., None] * 0.35) + alt[None, None] * (mott[..., None] * 0.35)
    tealc = srgb_to_lin(hexc('#2d6b78'))
    greyc = srgb_to_lin(hexc('#6d7584'))
    c = basec * (1 - teal[..., None] * 0.85) + tealc * teal[..., None] * 0.85
    c = c * (1 - grey[..., None] * 0.55) + greyc * grey[..., None] * 0.55
    # sparse gold flecks
    fl = rng.random((N, N)) < 0.0009
    flm = soft(fl.astype(np.float32)) * 3
    goldc = srgb_to_lin(hexc('#b58a3c'))
    c = c * (1 - np.clip(flm, 0, 1)[..., None] * 0.6) + goldc * np.clip(flm, 0, 1)[..., None] * 0.6
    c = c * detail[..., None]
    save(lin_to_srgb(c), f'{OUT}/cabin-carpet/color.jpg')
    nrm = Image.open(src + '_NormalGL.jpg').convert('RGB').resize((N, N), Image.LANCZOS)
    save(nrm, f'{OUT}/cabin-carpet/normal.jpg', 80)
    r = load(src + '_Roughness.jpg', N, 'L')
    r = np.clip(0.88 + (r - r.mean()) * 0.5, 0, 1)
    save(r, f'{OUT}/cabin-carpet/roughness.jpg')
    ao = load(src + '_AmbientOcclusion.jpg', N, 'L')
    save(ao, f'{OUT}/cabin-carpet/ao.jpg')

# ---------------------------------------------------------------- vinyl galley floor
def vinyl():
    N = 1024
    # 0.5 m tile: fine embossed 'coin' grid (raised round studs, 12 mm pitch is too dense -> use 25 mm)
    yy, xx = np.mgrid[0:N, 0:N].astype(np.float32) / N
    pitch = 20  # studs per tile
    fu = (xx * pitch % 1) - 0.5; fv = (yy * pitch % 1) - 0.5
    r = np.sqrt(fu * fu + fv * fv)
    stud = np.clip((0.30 - r) / 0.06, 0, 1)
    stud = stud * stud * (3 - 2 * stud)
    n1 = periodic_noise(N, 2.2, 11, lo=1) * 0.5 + 0.5
    n2 = periodic_noise(N, 1.0, 12, lo=60)
    h = stud * 0.6 + n2 * 0.08
    save(height_to_normal(h, 6.0), f'{OUT}/cabin-vinyl/normal.jpg', 80)
    base = srgb_to_lin(hexc('#5a5d61'))
    c = base[None, None] * (0.86 + n1[..., None] * 0.22) * (1 + n2[..., None] * 0.05)
    # scuffs: darker streaks
    sc = periodic_noise(N, 3.0, 13, lo=3)
    c *= (1 - np.clip(sc - 0.35, 0, 1)[..., None] * 0.5)
    save(lin_to_srgb(c * (1 + stud[..., None] * 0.06)), f'{OUT}/cabin-vinyl/color.jpg')
    rr = 0.62 - stud * 0.12 + n1 * 0.1 - np.clip(sc - 0.35, 0, 1) * 0.15
    save(rr, f'{OUT}/cabin-vinyl/roughness.jpg')

# ---------------------------------------------------------------- textured lining plastic (orange peel / stipple)
def plastic():
    N = 512
    n = periodic_noise(N, 0.6, 21, lo=30, hi=200)
    n2 = periodic_noise(N, 1.2, 22, lo=8, hi=60)
    h = n * 0.7 + n2 * 0.3
    save(height_to_normal(h, 1.6), f'{OUT}/cabin-plastic/normal.jpg', 85)
    # roughness with faint smudges / wipe marks from Plastic010
    src = f'{DL}/x_Plastic010/Plastic010_1K-JPG_Roughness.jpg'
    r = load(src, N, 'L')
    r = (r - r.mean()) / (r.std() + 1e-6)
    rr = np.clip(0.5 + r * 0.05 + n * 0.03, 0, 1)
    save(rr, f'{OUT}/cabin-plastic/roughness.jpg')
    # very subtle colour mottling (multiplied with material colour)
    m = periodic_noise(N, 2.4, 23, lo=1) * 0.5 + 0.5
    c = 0.955 + m * 0.045 + n * 0.012
    save(np.repeat(c[..., None], 3, -1), f'{OUT}/cabin-plastic/color.jpg', 88)

# ---------------------------------------------------------------- fabric (curtain)
def fabric():
    src = f'{DL}/x_Fabric030/Fabric030_1K-JPG'
    N = 512
    col = load(src + '_Color.jpg', N)
    lum = col.mean(-1); lum = lum / lum.mean()
    navy = srgb_to_lin(hexc('#1b2c48'))
    save(lin_to_srgb(navy[None, None] * lum[..., None]), f'{OUT}/cabin-fabric/color.jpg')
    save(Image.open(src + '_NormalGL.jpg').convert('RGB').resize((N, N), Image.LANCZOS), f'{OUT}/cabin-fabric/normal.jpg', 80)
    save(Image.open(src + '_Roughness.jpg').convert('L').resize((N, N), Image.LANCZOS), f'{OUT}/cabin-fabric/roughness.jpg')

# ---------------------------------------------------------------- metal
def metal():
    src = f'{DL}/x_Metal032/Metal032_1K-JPG'
    N = 512
    save(Image.open(src + '_Color.jpg').convert('RGB').resize((N, N), Image.LANCZOS), f'{OUT}/cabin-metal/color.jpg')
    save(Image.open(src + '_NormalGL.jpg').convert('RGB').resize((N, N), Image.LANCZOS), f'{OUT}/cabin-metal/normal.jpg', 80)
    save(Image.open(src + '_Roughness.jpg').convert('L').resize((N, N), Image.LANCZOS), f'{OUT}/cabin-metal/roughness.jpg')

for f in sys.argv[3:] or ['carpet', 'vinyl', 'plastic', 'fabric', 'metal']:
    globals()[f]()
