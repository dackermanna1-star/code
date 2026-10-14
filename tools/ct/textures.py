#!/usr/bin/env python3
"""Chinatown wall textures, flats and sky.

Builds every texture in SPEC.md section 3.1 and every flat in 3.2 in the
style of 1993 DOOM art: CC0 photo sources (ambientCG, Poly Haven, Scouser's
OpenGameArt urban packs) downscaled to DOOM texel density, de-lit so they
tile, contrast-boosted and slightly desaturated, grimed by hand-written
procedural passes and quantized to the DOOM palette. Storefronts, signs,
masked fences/gates/boards, panels and the night-skyline sky are composited
procedurally on top of photo materials; Chinese characters are drawn with
OFL CJK fonts (Noto Serif TC, LXGW WenKai TC, Ma Shan Zheng).

Outputs (all rerunnable, deterministic):
  build/ct/lumps/patches/<TEX>A.lmp   one patch per texture (CTSKY1A..H for the sky)
  build/ct/lumps/flats/<FLAT>.lmp     64x64 flats
  build/ct/lumps/data/TEXTURES.json   texture -> patch composition (pack.mjs)
  build/ct/previews/textures/         contact sheets, street-corner mock-up, PNGs
  tools/ct/credits/textures.md        sources and licences

Usage: python3 tools/ct/textures.py [--only NAME,NAME] [--no-previews]
Downloads go to build/ct/cache (CT_CACHE overrides) and are never repeated.
"""

import json
import math
import os
import sys
import tarfile
import urllib.request
import zipfile
import zlib

import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lib'))
import doomgfx as dg  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = dg.CACHE
PREV = os.path.join(dg.BUILD, 'previews', 'textures')
CREDITS = os.path.join(HERE, 'credits', 'textures.md')

# ---------------------------------------------------------------------------
# Assets: every external file this script reads, where it comes from and its
# licence. Fetched on demand into the cache; nothing is executed.
# ---------------------------------------------------------------------------

USED = {}     # key -> (title, url, licence)
USED_BY = {}  # key -> set of texture/flat names that used it
CURRENT = [None]


def _use(key, title, url, lic):
    USED[key] = (title, url, lic)
    if CURRENT[0]:
        USED_BY.setdefault(key, set()).add(CURRENT[0])


def _download(url, dest):
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    tmp = dest + '.part'
    last = None
    for _ in range(3):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) ct-textures/1.0'})
            with urllib.request.urlopen(req, timeout=120) as r, open(tmp, 'wb') as f:
                while True:
                    b = r.read(1 << 20)
                    if not b:
                        break
                    f.write(b)
            os.replace(tmp, dest)
            return dest
        except Exception as e:  # transient resets happen through the proxy
            last = e
    raise RuntimeError('download failed: %s (%s)' % (url, last))


def acg(asset_id):
    """ambientCG 1K-JPG colour map (CC0)."""
    d = os.path.join(CACHE, 'tex_acg_' + asset_id)
    color = os.path.join(d, '%s_1K-JPG_Color.jpg' % asset_id)
    if not os.path.exists(color):
        z = os.path.join(d, '%s_1K-JPG.zip' % asset_id)
        if not os.path.exists(z):
            _download('https://ambientcg.com/get?file=%s_1K-JPG.zip' % asset_id, z)
        with zipfile.ZipFile(z) as zf:
            member = [n for n in zf.namelist() if n.endswith('_Color.jpg')][0]
            with zf.open(member) as src, open(color, 'wb') as dst:
                dst.write(src.read())
    _use('acg:' + asset_id, 'ambientCG %s' % asset_id, 'https://ambientcg.com/view?id=%s' % asset_id, 'CC0 1.0')
    return color


def ph(asset_id):
    """Poly Haven 1k diffuse JPG (CC0)."""
    d = os.path.join(CACHE, 'tex_ph_' + asset_id)
    f = os.path.join(d, '%s_diff_1k.jpg' % asset_id)
    if not os.path.exists(f):
        _download('https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/%s/%s_diff_1k.jpg' % (asset_id, asset_id), f)
    _use('ph:' + asset_id, 'Poly Haven %s' % asset_id, 'https://polyhaven.com/a/%s' % asset_id, 'CC0 1.0')
    return f


OGA_PACKS = {
    # Scouser's "Free Urban Textures" photo packs on OpenGameArt (CC0).
    'doors-gates': ('tex_oga_scouser_doors-gates_0', 'doors-gates_0.zip',
                    'https://opengameart.org/sites/default/files/doors-gates_0.zip',
                    'https://opengameart.org/content/free-urban-textures-doors-gates'),
    'buildings-apartments-shopfronts-shutters': (
        'tex_oga_scouser_buildings-apartments-shopfronts-shutters', 'buildings-apartments-shopfronts-shutters.zip',
        'https://opengameart.org/sites/default/files/buildings-apartments-shopfronts-shutters.zip',
        'https://opengameart.org/content/free-urban-textures-buildings-apartments-shop-fronts'),
    'ground-grass-road-floor': (
        'tex_oga_scouser_ground-grass-road-floor', 'ground-grass-road-floor.zip',
        'https://opengameart.org/sites/default/files/ground-grass-road-floor.zip',
        'https://opengameart.org/content/free-urban-textures-ground-grass-road-floor'),
    'renderedwall': ('tex_oga_scouser_renderedwall', 'renderedwall.zip',
                     'https://opengameart.org/sites/default/files/renderedwall.zip',
                     'https://opengameart.org/content/free-urban-textures-rendered-walls'),
    'roof-tiles': ('tex_oga_scouser_roof-tiles', 'roof-tiles.zip',
                   'https://opengameart.org/sites/default/files/roof-tiles.zip',
                   'https://opengameart.org/content/free-urban-textures-roof-tiles'),
}


def oga(pack, name):
    """A PNG from one of Scouser's OpenGameArt urban photo packs (CC0)."""
    dname, zname, url, page = OGA_PACKS[pack]
    d = os.path.join(CACHE, dname)
    f = os.path.join(d, pack, name)
    if not os.path.exists(f):
        z = os.path.join(d, zname)
        if not os.path.exists(z):
            _download(url, z)
        with zipfile.ZipFile(z) as zf:
            member = [n for n in zf.namelist() if n.split('/')[-1] == name][0]
            os.makedirs(os.path.dirname(f), exist_ok=True)
            with zf.open(member) as src, open(f, 'wb') as dst:
                dst.write(src.read())
    _use('oga:' + pack + ':' + name, 'Scouser, "Free Urban Textures: %s" (OpenGameArt), %s' % (pack, name), page, 'CC0 1.0')
    return f


NPM_FONTS = {
    'notoserif': ('@fontsource/noto-serif-tc', '5.3.1', 'font_noto_serif_tc',
                  'noto-serif-tc-chinese-traditional-900-normal.woff2',
                  'Noto Serif TC Black (Google / Adobe)', 'SIL OFL 1.1'),
    'kai': ('@fontsource/lxgw-wenkai-tc', '5.3.1', 'font_lxgw_wenkai_tc',
            'lxgw-wenkai-tc-chinese-traditional-700-normal.woff2',
            'LXGW WenKai TC Bold (LXGW)', 'SIL OFL 1.1'),
    'brush': ('@fontsource/ma-shan-zheng', '5.3.1', 'font_ma_shan_zheng',
              'ma-shan-zheng-chinese-simplified-400-normal.woff2',
              'Ma Shan Zheng (Ma Shan Zheng / Google Fonts)', 'SIL OFL 1.1'),
    'oswald': ('@fontsource/oswald', '5.2.8', 'font_oswald',
               'oswald-latin-700-normal.woff2', 'Oswald Bold (Vernon Adams et al.)', 'SIL OFL 1.1'),
}


def npm_font(key):
    pkg, ver, dname, member, title, lic = NPM_FONTS[key]
    d = os.path.join(CACHE, dname)
    f = os.path.join(d, 'x', 'package', 'files', member)
    if not os.path.exists(f):
        base = pkg.split('/')[-1]
        tgz = os.path.join(d, '%s-%s.tgz' % (base, ver))
        legacy = os.path.join(d, 'fontsource-%s-%s.tgz' % (base, ver))
        if os.path.exists(legacy):
            tgz = legacy
        if not os.path.exists(tgz):
            _download('https://registry.npmjs.org/%s/-/%s-%s.tgz' % (pkg, base, ver), tgz)
        with tarfile.open(tgz) as t:
            want = ['package/files/' + member, 'package/LICENSE']
            members = [m for m in t.getmembers() if m.name in want]
            t.extractall(os.path.join(d, 'x'), members=members, filter='data')
    _use('font:' + key, title + ', npm %s@%s' % (pkg, ver), 'https://www.npmjs.com/package/' + pkg, lic)
    return f


_FONT_CACHE = {}


def font(key, size):
    k = (key, size)
    path = npm_font(key)     # also records the use
    if k not in _FONT_CACHE:
        _FONT_CACHE[k] = ImageFont.truetype(path, size)
    return _FONT_CACHE[k]


if __name__ == '__main__' and '--fetch' in sys.argv:
    for a in sys.argv[sys.argv.index('--fetch') + 1:]:
        kind, _, ident = a.partition(':')
        print(a, {'acg': acg, 'ph': ph, 'font': npm_font}[kind](ident))
    sys.exit(0)


# ---------------------------------------------------------------------------
# Image helpers. Images are float32 (H, W, 3) arrays in 0..255 sRGB.
# Everything that is meant to tile works with wrap-around (periodic) maps.
# ---------------------------------------------------------------------------

def seed(name):
    return np.random.default_rng(zlib.crc32(name.encode()))


def load(path, box=None):
    im = Image.open(path).convert('RGB')
    if box:
        im = im.crop(box)
    return np.asarray(im, dtype=np.float32)


def lum(a):
    return a[..., 0] * 0.299 + a[..., 1] * 0.587 + a[..., 2] * 0.114


def _box_reduce(a, fy, fx):
    h, w = a.shape[:2]
    a = a[:h - h % fy, :w - w % fx]
    sh = (a.shape[0] // fy, fy, a.shape[1] // fx, fx) + a.shape[2:]
    return a.reshape(sh).mean(axis=(1, 3))


def resize(a, w, h, wrap=False):
    """Area/Lanczos resample to (w, h). wrap=True treats the input as a
    periodic tile, so the result tiles too."""
    a = np.asarray(a, dtype=np.float32)
    H, W = a.shape[:2]
    fy, fx = max(1, H // (h * 3)), max(1, W // (w * 3))
    if (fy > 1 or fx > 1) and H % fy == 0 and W % fx == 0:
        a = _box_reduce(a, fy, fx)
        H, W = a.shape[:2]
    chans = [a[..., c] for c in range(a.shape[2])] if a.ndim == 3 else [a]
    out = []
    for ch in chans:
        if wrap:
            big = np.tile(ch, (3, 3))
            im = Image.fromarray(big.astype(np.float32), 'F').resize((w * 3, h * 3), Image.LANCZOS)
            r = np.asarray(im)[h:2 * h, w:2 * w]
        else:
            im = Image.fromarray(ch.astype(np.float32), 'F').resize((w, h), Image.LANCZOS)
            r = np.asarray(im)
        out.append(r)
    return np.dstack(out) if a.ndim == 3 else out[0]


def tile(a, ry, rx):
    return np.tile(a, (ry, rx, 1) if a.ndim == 3 else (ry, rx))


def _box1(x, r, axis, wrap):
    if r < 1:
        return x
    n = x.shape[axis]
    idx = np.arange(-r, n + r)
    idx = idx % n if wrap else np.clip(idx, 0, n - 1)
    xp = np.take(x, idx, axis=axis)
    c = np.cumsum(xp, axis=axis, dtype=np.float64)
    zshape = list(c.shape)
    zshape[axis] = 1
    c = np.concatenate([np.zeros(zshape), c], axis=axis)
    k = 2 * r + 1
    hi = np.take(c, np.arange(k, k + n), axis=axis)
    lo = np.take(c, np.arange(0, n), axis=axis)
    return ((hi - lo) / k).astype(np.float32)


def blur(x, r, wrap=True, passes=3):
    """Approximate gaussian blur (3 box passes), periodic by default."""
    x = np.asarray(x, dtype=np.float32)
    rr = max(1, int(round(r / math.sqrt(passes)))) if r >= 1 else 0
    if rr == 0:
        return x
    for _ in range(passes):
        x = _box1(x, rr, 0, wrap)
        x = _box1(x, rr, 1, wrap)
    return x


def delight(a, radius, strength=1.0, wrap=True):
    """Remove large-scale lighting so a tile has even light everywhere."""
    L = lum(a)
    B = blur(L, radius, wrap)
    g = (L.mean() / np.maximum(B, 4.0)) ** strength
    return a * g[..., None]


def grade(a, contrast=1.0, sat=1.0, bright=1.0, pivot=None, gamma=1.0):
    L = lum(a)[..., None]
    a = L + (a - L) * sat
    p = float(lum(a).mean()) if pivot is None else pivot
    a = (a - p) * contrast + p
    a = a * bright
    if gamma != 1.0:
        a = 255.0 * np.clip(a / 255.0, 0, 1) ** gamma
    return np.clip(a, 0, 255)


def sharpen(a, amount=0.6, r=1, wrap=True):
    return np.clip(a + amount * (a - blur(a, r, wrap, passes=1)), 0, 255)


def hue_red(a, k=0.4):
    """Push orange chroma toward red (DOOM brick reds) without colouring greys."""
    L = lum(a)
    c = np.clip(a[..., 0] - L, 0, None)
    a = a.copy()
    a[..., 1] -= k * c
    a[..., 2] -= 0.15 * k * c
    return np.clip(a, 0, 255)


def grain(a, rng, amount=6.0, chroma=0.0):
    """Fine film grain: mixes neighbouring palette entries the way scanned
    DOOM textures do, instead of flat posterized patches."""
    h, w = a.shape[:2]
    n = rng.standard_normal((h, w)).astype(np.float32) * amount
    out = a + n[..., None]
    if chroma:
        out = out + rng.standard_normal((h, w, 3)).astype(np.float32) * chroma
    return np.clip(out, 0, 255)


def recolor(a, mask, target, keep=0.3):
    """Recolour the masked part of a photo to `target` (mean colour), keeping
    the photo's luminance detail and a little of its own colour."""
    L = lum(a)
    m = np.asarray(mask, np.float32)
    mL = float((L * m).sum() / max(m.sum(), 1.0)) or 1.0
    t = np.array(target, np.float32)
    col = t[None, None] * (L / mL)[..., None]
    col = col * (1 - keep) + a * keep * (t.mean() / mL)
    return mix(a, np.clip(col, 0, 255), m)


def seamless(a, axis, shift=None, band=None):
    """Cross-fade the wrap seam on one axis with a copy shifted by `shift`
    (a multiple of the structure's period keeps bricks/slats aligned)."""
    n = a.shape[axis]
    shift = n // 2 if shift is None else shift
    band = max(2, n // 8) if band is None else band
    b = np.roll(a, shift, axis=axis)
    t = np.arange(n, dtype=np.float32)
    d = np.minimum(t, n - 1 - t)
    w = np.clip(1.0 - d / band, 0, 1)
    w = w * w * (3 - 2 * w)
    shp = [1] * a.ndim
    shp[axis] = n
    w = w.reshape(shp)
    return a * (1 - w) + b * w


def seamless2(a, sx=None, sy=None, band=None, bandy=None):
    a = seamless(a, 1, sx, band)
    return seamless(a, 0, sy, bandy if bandy is not None else band)


def fnoise(h, w, rng, beta=2.0, lo=1.0, hi=None, sx=1.0, sy=1.0):
    """Periodic fractal noise (std 1). sx/sy > 1 stretch features along
    that axis (sy=6 gives vertical streaks)."""
    white = rng.standard_normal((h, w))
    F = np.fft.fft2(white)
    fy = np.fft.fftfreq(h)[:, None] * h * sy
    fx = np.fft.fftfreq(w)[None, :] * w * sx
    f = np.sqrt(fx * fx + fy * fy)
    f[0, 0] = 1
    filt = f ** (-beta / 2)
    filt[f < lo] = 0
    if hi:
        filt[f > hi] = 0
    filt[0, 0] = 0
    n = np.real(np.fft.ifft2(F * filt)).astype(np.float32)
    return n / (n.std() + 1e-6)


def mix(a, b, m):
    m = np.asarray(m, dtype=np.float32)
    if m.ndim == 2 and a.ndim == 3:
        m = m[..., None]
    return a * (1 - m) + b * m


def solid(h, w, rgb):
    return np.ones((h, w, 3), np.float32) * np.array(rgb, np.float32)


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


# Grime ----------------------------------------------------------------------

def streaks(h, w, rng, density=0.5, length=2.5, wrap_v=True):
    """Vertical rain/rust streak field 0..1 (periodic)."""
    n = fnoise(h, w, rng, beta=2.4, sx=1.0, sy=length * 3)
    s = smoothstep(1.6 - density, 2.8 - density, n)
    return s


def grime(a, rng, amount=0.25, streak=0.25, spots=0.15, scale=1.0, wrap=True):
    """Hand-applied DOOM-style dirt: soft blotches, vertical streaks and
    darker pits. Periodic so tiles stay seamless."""
    h, w = a.shape[:2]
    blot = fnoise(h, w, rng, beta=2.6)
    k = 1 - amount * smoothstep(0.0, 2.0, blot)
    if streak:
        k = k - streak * streaks(h, w, rng)
    if spots:
        sp = fnoise(h, w, rng, beta=0.6)
        k = k - spots * smoothstep(1.8, 3.0, sp)
    return a * np.clip(k, 0.2, 1.2)[..., None]


def edge_shade(a, x0, y0, x1, y1, light=1.25, dark=0.6, width=1):
    """Bevel a rectangle: lit top/left edge, shadowed bottom/right (DOOM's
    usual top-left light)."""
    for i in range(width):
        a[y0 + i, x0:x1] *= light
        a[y0:y1, x0 + i] *= light
        a[y1 - 1 - i, x0:x1] *= dark
        a[y0:y1, x1 - 1 - i] *= dark
    return a


def rect(a, x0, y0, x1, y1, rgb):
    a[max(0, y0):y1, max(0, x0):x1] = np.array(rgb, np.float32)
    return a


def paste(dst, src, x, y, mask=None):
    h, w = src.shape[:2]
    H, W = dst.shape[:2]
    sx0, sy0 = max(0, -x), max(0, -y)
    dx0, dy0 = max(0, x), max(0, y)
    dx1, dy1 = min(W, x + w), min(H, y + h)
    if dx1 <= dx0 or dy1 <= dy0:
        return dst
    s = src[sy0:sy0 + dy1 - dy0, sx0:sx0 + dx1 - dx0]
    if mask is None:
        dst[dy0:dy1, dx0:dx1] = s
    else:
        m = np.asarray(mask, np.float32)[sy0:sy0 + dy1 - dy0, sx0:sx0 + dx1 - dx0]
        if m.ndim == 2:
            m = m[..., None]
        dst[dy0:dy1, dx0:dx1] = dst[dy0:dy1, dx0:dx1] * (1 - m) + s * m
    return dst


# Palette --------------------------------------------------------------------

PAL_GROUPS = {
    'purple': range(250, 255),
    'ltblue': range(192, 200),
    'blue': list(range(200, 208)) + list(range(240, 247)),
    'brightred': range(168, 184),
    'yellow': list(range(160, 168)) + list(range(224, 232)),
    'orange': list(range(208, 224)) + [248, 249],
    'green': range(112, 128),
    'pink': range(16, 32),
}


PAL_RAMPS = {
    'dark': [0, 1, 2, 5, 6, 7, 8, 13, 14, 15],
    'grey': list(range(80, 112)) + [3, 4],
    'red': range(16, 48),           # pink -> deep red
    'brightred': range(168, 192),
    'tan': range(48, 80),            # peach -> orange brown
    'tandark': range(57, 80),
    'brown': list(range(128, 144)) + [236, 237, 238, 239],
    'olive': list(range(144, 160)) + [9, 10, 11, 12],
    'green': range(112, 128),
    'yellow': list(range(160, 168)) + list(range(224, 232)),
    'orange': list(range(208, 224)) + list(range(232, 236)) + [248, 249],
    'blue': list(range(192, 208)) + list(range(240, 247)),
    'darkblue': list(range(200, 208)) + list(range(240, 247)),
    'purple': list(range(250, 256)),
}


def quant(rgb, allow=None, avoid=('purple', 'ltblue')):
    ex = set()
    if allow:
        keep = set()
        for g in allow:
            keep.update(PAL_RAMPS[g] if isinstance(g, str) else [g])
        ex = set(range(256)) - keep
    else:
        for g in avoid or ():
            ex.update(PAL_GROUPS[g])
    return dg.quantize(np.clip(rgb, 0, 255), exclude=ex)


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------

TEXDEFS = {}   # name -> dict(w, h, fn, allow, avoid)
FLATDEFS = {}  # name -> dict(w=64, h=64, fn, allow, avoid)


def texture(name, w, h, allow=None, avoid=('purple', 'ltblue')):
    """Register a wall texture. `allow` limits quantization to palette
    groups (see PAL_RAMPS) so a material keeps to coherent DOOM ramps."""
    def deco(fn):
        TEXDEFS[name] = dict(w=w, h=h, fn=fn, allow=allow, avoid=avoid)
        return fn
    return deco


def flat(name, allow=None, avoid=('purple', 'ltblue')):
    def deco(fn):
        FLATDEFS[name] = dict(w=64, h=64, fn=fn, allow=allow, avoid=avoid)
        return fn
    return deco


def render(name):
    """Run one definition: returns (indices, mask or None)."""
    d = TEXDEFS.get(name) or FLATDEFS[name]
    CURRENT[0] = name
    try:
        r = d['fn'](seed(name))
    finally:
        CURRENT[0] = None
    mask = None
    if isinstance(r, tuple):
        r, mask = r
    if r.ndim == 2 and r.dtype == np.uint8:
        ind = r
    else:
        ind = quant(r, allow=d['allow'], avoid=d['avoid'])
    if ind.shape != (d['h'], d['w']):
        raise ValueError('%s: got %s, want %dx%d' % (name, ind.shape, d['w'], d['h']))
    if mask is not None:
        mask = np.asarray(mask, dtype=bool)
    return ind, mask


def photo(path, box=None):
    """Load a (cropped) source photo."""
    return load(path, box)


def doom_finish(a, contrast=1.25, sat=0.8, bright=1.0, sharp=0.5, gamma=1.0, wrap=True):
    a = grade(a, contrast=contrast, sat=sat, bright=bright, gamma=gamma)
    if sharp:
        a = sharpen(a, sharp, wrap=wrap)
    return a


# ---------------------------------------------------------------------------
# Base materials (periodic, any size)
# ---------------------------------------------------------------------------

def mat_red_brick(w=128, h=128, variant=0):
    """Red brick, about 10 courses per 128 texels. Poly Haven red_brick has
    20 courses x 6 bricks per 1024 px: a 512 crop is a structural period."""
    src = photo(ph('red_brick'), (0, 0, 512, 512) if variant == 0 else (512, 512, 1024, 1024))
    a = resize(src, w, h, wrap=True)
    a = seamless(a, 1, shift=round(w / 3), band=6)
    a = seamless(a, 0, shift=round(h / 5), band=4)
    a = delight(a, 20, 0.9)
    return a


def mat_grey_brick(w=128, h=128):
    """Dark grey brick (ambientCG Bricks034: 40 courses per 1024)."""
    src = photo(acg('Bricks034'), (0, 0, 307, 256))  # 3 bricks x 10 courses
    a = resize(src, w, h, wrap=True)
    p = h / 10.0
    a = seamless(a, 1, shift=round(w / 3), band=6)
    a = seamless(a, 0, shift=round(2 * p), band=3)
    a = delight(a, 20, 0.9)
    return a


def red_brick_wall(rng, target=(145, 62, 48), mortar=(118, 114, 108), variant=0, dirt=1.0):
    a = mat_red_brick(variant=variant)
    L = lum(a)
    brick = smoothstep(8, 30, a[..., 0] - L)
    a = recolor(a, 1 - brick, mortar, keep=0.2)
    a = recolor(a, brick, target, keep=0.35)
    a = grime(a, rng, amount=0.22 * dirt, streak=0.14 * dirt, spots=0.1 * dirt)
    a = doom_finish(a, contrast=1.25, sat=1.0)
    return grain(a, rng, 7)


@texture('CTBRK1', 128, 128, allow=('red', 'tan', 'brown', 'grey', 'dark'))
def t_brk1(rng):
    return red_brick_wall(rng)


@texture('CTBRK2', 128, 128, allow=('grey', 'dark', 'brown'))
def t_brk2(rng):
    a = mat_grey_brick()
    a = grime(a, rng, amount=0.15, streak=0.1, spots=0.08)
    return doom_finish(a, contrast=1.3, sat=0.3, bright=0.85)


# ---------------------------------------------------------------------------
# Drawing helpers for composited textures
# ---------------------------------------------------------------------------

def glass(h, w, rng, interior='dark', tint_rgb=(22, 26, 34), refl=1.0):
    """Night window glass: near-black with a soft sky reflection band and
    a hint of what is inside."""
    a = solid(h, w, tint_rgb)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    n = fnoise(h, w, rng, beta=2.5) * 4
    a = a + n[..., None]
    if interior == 'curtain':
        c = np.array(rng.choice([(70, 40, 36), (60, 62, 44), (84, 70, 52), (48, 52, 66)]), np.float32)
        folds = 0.75 + 0.25 * np.sin(xx * 1.7 + rng.uniform(0, 6))
        side = (xx < w * 0.32) | (xx > w * 0.68)
        a[side] = (c[None, :] * folds[side][:, None])
    elif interior == 'blinds':
        slat = ((yy.astype(int) % 3) != 0).astype(np.float32)
        a = mix(a, solid(h, w, (92, 88, 78)) * (0.6 + 0.3 * slat[..., None]), 0.85)
    elif interior == 'lit':
        a = mix(a, solid(h, w, (150, 110, 60)), 0.55)
    elif interior == 'shapes':
        for _ in range(3):
            x0 = int(rng.integers(0, max(1, w - 6)))
            ww = int(rng.integers(4, max(5, w // 2)))
            hh = int(rng.integers(h // 4, max(h // 4 + 1, h // 2)))
            a[h - hh:, x0:x0 + ww] *= 0.6
    # reflection: soft diagonal band across the upper part
    d = (xx * 0.8 + yy) / (w * 0.8 + h)
    band = np.exp(-((d - 0.28) / 0.12) ** 2) * 0.9 + np.exp(-((d - 0.55) / 0.05) ** 2) * 0.35
    a = a + refl * band[..., None] * np.array([34, 38, 46], np.float32)
    return np.clip(a, 0, 255)


def window(a, x0, y0, x1, y1, rng, frame=(178, 170, 150), interior='dark', mullion=True,
           sill=(150, 146, 136), lintel=(160, 156, 146), ac=False, fw=2):
    """Draw a sash window with lintel and sill into `a` (in place)."""
    h, w = y1 - y0, x1 - x0
    # recess shadow around the opening
    a[y0 - 1:y1 + 1, x0 - 1:x1 + 1] *= 0.55
    # frame
    a[y0:y1, x0:x1] = np.array(frame, np.float32)
    gl = glass(h - 2 * fw, w - 2 * fw, rng, interior)
    a[y0 + fw:y1 - fw, x0 + fw:x1 - fw] = gl
    if mullion:
        my = y0 + h // 2
        a[my - 1:my + 1, x0:x1] = np.array(frame, np.float32)
        a[my + 1, x0 + fw:x1 - fw] *= 0.6
        mx = x0 + w // 2
        a[y0:y1, mx:mx + 1] = np.array(frame, np.float32) * 0.92
    edge_shade(a, x0, y0, x1, y1, light=1.12, dark=0.7)
    # inner frame shadow on the glass (top/left)
    a[y0 + fw, x0 + fw:x1 - fw] *= 0.6
    a[y0 + fw:y1 - fw, x0 + fw] *= 0.7
    if ac:
        ay0 = y0 + h // 2 + 1
        ah = max(6, h // 4)
        ax0, ax1 = x0 + 2, x1 - 2
        unit = solid(ah, ax1 - ax0, (176, 168, 146))
        unit[:, ::2] *= 0.86
        unit[::3, :] *= 0.94
        unit = edge_shade(unit, 0, 0, ax1 - ax0, ah, 1.15, 0.6)
        a[ay0:ay0 + ah, ax0:ax1] = unit
        a[ay0 + ah:ay0 + ah + 2, ax0:ax1] *= 0.5
    if lintel is not None:
        a[y0 - 6:y0 - 1, x0 - 3:x1 + 3] = np.array(lintel, np.float32)
        a[y0 - 6:y0 - 1, x0 - 3:x1 + 3] *= (1 + 0.06 * fnoise(5, w + 6, rng))[..., None]
        a[y0 - 6, x0 - 3:x1 + 3] *= 1.15
        a[y0 - 2, x0 - 3:x1 + 3] *= 0.75
    if sill is not None:
        a[y1 + 1:y1 + 4, x0 - 3:x1 + 3] = np.array(sill, np.float32)
        a[y1 + 1, x0 - 3:x1 + 3] *= 1.2
        a[y1 + 3, x0 - 3:x1 + 3] *= 0.7
        a[y1 + 4:y1 + 7, x0 - 2:x1 + 2] *= 0.6   # shadow below the sill
        # dirt streaks running down from the sill corners
        for sx in (x0 - 2, x1 + 1, x0 + w // 2):
            ln = int(rng.integers(6, 18))
            a[y1 + 7:y1 + 7 + ln, sx:sx + 1] *= np.linspace(0.7, 1.0, ln)[:, None, None][:a[y1 + 7:y1 + 7 + ln].shape[0]]
    return a


def drop_shadow(a, mask, dx=2, dy=2, k=0.55, wrap=True):
    """Darken the wall where `mask` (an object drawn on top) would cast a
    shadow toward the lower right."""
    sh = np.roll(np.roll(mask, dy, axis=0), dx, axis=1) if wrap else np.pad(mask, ((dy, 0), (dx, 0)))[:mask.shape[0], :mask.shape[1]]
    sh = sh & ~mask
    a[sh] *= k
    return a


# ---------------------------------------------------------------------------
# Walls: facades, stucco, plaster, concrete
# ---------------------------------------------------------------------------

@texture('CTAPT1', 128, 128, allow=('red', 'tan', 'brown', 'grey', 'dark', 'blue'))
def t_apt1(rng):
    a = red_brick_wall(rng, target=(132, 58, 46), variant=1, dirt=1.3)
    a = a.astype(np.float32)
    window(a, 15, 30, 49, 92, rng, interior='curtain', ac=True)
    window(a, 79, 30, 113, 92, rng, interior='blinds')
    a = grain(a, rng, 3)
    return a


def mat_stucco(w, h, rng, color, rough=1.0, stains=0.0):
    """Sand-finish render (Scouser rendered_sandy), made seamless, recoloured."""
    src = photo(oga('renderedwall', 'rendered_sandy.png'))
    a = resize(src, w, h)
    a = seamless2(a, band=w // 6)
    a = delight(a, 24, 1.0)
    L = lum(a)
    L = (L - L.mean()) * 1.2 * rough
    L = 128 + np.clip(L, -60, 12)
    a = np.array(color, np.float32)[None, None] * (L / 128.0)[..., None]
    if stains:
        a = a * stain_map(w, h, rng, stains)[..., None]
    return np.clip(a, 0, 255)


def stain_map(w, h, rng, strength=0.5):
    """Vertical rain-stain multiplier from Scouser rendered_stained2 (middle
    band, made seamless), 1 = clean."""
    src = photo(oga('renderedwall', 'rendered_stained2.png'), (0, 300, 1024, 1024))
    L = lum(resize(src, w, h))
    L = L[..., None].repeat(3, axis=2)
    L = seamless2(L, band=max(4, w // 6))[..., 0]
    L = blur(L, 0.8)
    r = L / max(1.0, float(np.percentile(L, 80)))
    return np.clip(1 - strength * (1 - r) * 1.6, 0.3, 1.1)


def stucco_wall(rng, color):
    """Painted tenement render with some history: stronger sand relief,
    patched repairs in a slightly different tone, hairline cracks and rain
    stains."""
    a = mat_stucco(128, 128, rng, color, rough=1.45, stains=0.45)
    for _ in range(2):                                     # patched repairs
        x0, y0 = int(rng.integers(0, 100)), int(rng.integers(8, 100))
        w_, h_ = int(rng.integers(14, 30)), int(rng.integers(10, 22))
        k = 1 + rng.choice([-1, 1]) * rng.uniform(0.05, 0.09)
        ys, xs = np.arange(y0, y0 + h_) % 128, np.arange(x0, x0 + w_) % 128
        a[np.ix_(ys, xs)] *= k
        a[ys, x0 % 128] *= 0.92
        a[y0 % 128, xs] *= 0.92
    a = cracks(a, rng, 3, (14, 34), 0.72)
    a = grime(a, rng, amount=0.18, streak=0.16, spots=0.1)
    return a


@texture('CTSTUC1', 128, 128, allow=('brown', 'dark') + tuple(range(64, 80)) + tuple(range(96, 112)))
def t_stuc1(rng):
    a = stucco_wall(rng, (196, 178, 140))
    a = doom_finish(a, contrast=1.2, sat=0.9)
    return grain(a, rng, 3)


@texture('CTSTUC2', 128, 128, allow=('olive', 'dark', 'brown') + tuple(range(119, 128)) + tuple(range(100, 112)))
def t_stuc2(rng):
    """Mint/teal-green painted render. The palette has no teal, so the
    paint sits on the darker half of the green ramp (119-127): olive-grey
    mixes lose their green entirely once the COLORMAP dims them in this
    dark map, and the bright greens look like lawn."""
    a = stucco_wall(rng, (54, 104, 52))
    a = doom_finish(a, contrast=1.2, sat=0.95)
    return grain(a, rng, 3)


@texture('CTAPT2', 128, 128, allow=('tandark', 'brown', 'grey', 'dark', 'darkblue', 'red'))
def t_apt2(rng):
    a = mat_stucco(128, 128, rng, (184, 160, 124), stains=0.35)
    a = grime(a, rng, amount=0.15, streak=0.1, spots=0.1)
    a = doom_finish(a, contrast=1.15, sat=0.9)
    window(a, 14, 22, 48, 82, rng, frame=(70, 64, 58), interior='dark', sill=(130, 124, 112), lintel=(140, 134, 120))
    window(a, 80, 22, 114, 82, rng, frame=(70, 64, 58), interior='curtain', sill=(130, 124, 112), lintel=(140, 134, 120))
    # fire escape: black iron balcony with railing, landing slats and a
    # stair run; everything casts a shadow on the stucco.
    m = np.zeros((128, 128), bool)
    iron = np.zeros((128, 128, 3), np.float32) + (34, 32, 30)
    m[100:104, :] = True                    # landing (slatted floor edge)
    m[66:68, :] = True                      # top rail
    m[84, :] = True                         # mid rail
    m[66:100, 0::6] = True                  # balusters
    m[104:107, 0::16] = True                # brackets under the landing
    # drop ladder / stair run descending to the right
    for i in range(0, 34):
        x = 70 + i
        y = 66 + i
        m[y:y + 2, x:x + 2] = True          # stringer
        m[y - 22:y - 21, x:x + 1] = True    # stair handrail
    for k in range(0, 34, 5):
        m[66 + k:68 + k, 62 + k:72 + k] = True  # treads
    a = drop_shadow(a, m, 2, 3, 0.55)
    a[m] = iron[m]
    a[100, :] *= 0  # highlight the landing edge
    a[100, :] += (70, 66, 60)
    a[66, :] += 26
    return grain(a, rng, 3)


def cracks(a, rng, n=3, length=(10, 30), k=0.7, wrap=True):
    h, w = a.shape[:2]
    for _ in range(n):
        x, y = float(rng.uniform(0, w)), float(rng.uniform(0, h))
        ang = rng.uniform(0, 2 * math.pi)
        for _s in range(int(rng.integers(*length))):
            if rng.random() < 0.15:
                ang += rng.normal(0, 0.9)
            x, y = x + math.cos(ang), y + math.sin(ang) * 1.0
            if wrap:
                x, y = x % w, y % h
            elif not (0 <= x < w and 0 <= y < h):
                break
            a[int(y), int(x)] *= k
            a[(int(y) + 1) % h, int(x)] *= 1.08
    return a


@texture('CTPLAS1', 128, 128, allow=('grey', 'brown', 'dark'))
def t_plas1(rng):
    src = photo(oga('renderedwall', 'rendered_cement_dirty.png'), (0, 0, 768, 768))
    a = resize(src, 128, 128)
    a = seamless2(a, band=20)
    a = delight(a, 30, 1.0)
    L = lum(a)
    L = (L - L.mean()) * 1.4 + 140
    a = np.array((168, 164, 154), np.float32)[None, None] * (L / 140)[..., None]
    # brown water stains blooming down the wall, and greasy hand-height grime
    a = a * stain_map(128, 128, rng, 0.45)[..., None]
    st = streaks(128, 128, rng, density=0.35, length=1.5)
    a = a * (1 - 0.15 * st[..., None]) + st[..., None] * np.array((6, 3, -3), np.float32)
    a = grime(a, rng, amount=0.25, streak=0.08, spots=0.18)
    a = cracks(a, rng, 2, (10, 24), 0.8)
    a = doom_finish(a, contrast=1.2, sat=0.85)
    return grain(a, rng, 4)


def mat_concrete(w, h, rng, asset='Concrete031', reps=1, color=(128, 126, 120), contrast=2.0):
    src = photo(acg(asset))
    a = tile(resize(src, 512 // reps, 512 // reps, wrap=True), reps, reps)
    a = resize(a, w, h, wrap=True)
    a = delight(a, 32, 0.8)
    L = lum(a)
    L = (L - L.mean()) * contrast + 128
    a = np.array(color, np.float32)[None, None] * (L / 128)[..., None]
    return np.clip(a, 0, 255)


@texture('CTCONC1', 128, 128, allow=('grey', 'brown', 'dark'))
def t_conc1(rng):
    a = mat_concrete(128, 128, rng, 'Concrete031', 1, (132, 130, 124))
    a = grime(a, rng, amount=0.15, streak=0.12, spots=0.15)
    # form-tie holes in a grid, the classic poured-wall look
    for y in (20, 84):
        for x in (20, 84):
            a[y:y + 3, x:x + 3] *= 0.45
            a[y, x:x + 3] *= 0.8
    a = doom_finish(a, contrast=1.2, sat=0.6)
    return grain(a, rng, 4)


@texture('CTCONC2', 128, 128, allow=('grey', 'brown', 'dark'))
def t_conc2(rng):
    """Stained concrete: smooth poured concrete (Concrete031), a light wash
    of Concrete036 mottling, rust-brown water streaks running down and a
    tide line of grime."""
    a = mat_concrete(128, 128, rng, 'Concrete031', 1, (130, 128, 120), contrast=1.6)
    mot = mat_concrete(128, 128, rng, 'Concrete036', 1, (130, 128, 120), contrast=0.9)
    a = a * 0.72 + mot * 0.28
    st = streaks(128, 128, rng, density=0.45, length=2.0)
    a = mix(a, a * np.array([0.7, 0.6, 0.48], np.float32), st * 0.7)
    st2 = streaks(128, 128, rng, density=0.6, length=1.2)
    a = mix(a, a * 0.7, st2 * 0.5)
    a = a * stain_map(128, 128, rng, 0.35)[..., None]
    a = grime(a, rng, amount=0.2, streak=0.08, spots=0.12)
    a = cracks(a, rng, 2, (12, 30), 0.7)
    a = doom_finish(a, contrast=1.2, sat=0.8)
    return grain(a, rng, 3)


@texture('CTSTEP1', 64, 32, allow=('grey', 'brown', 'dark'))
def t_step1(rng):
    a = mat_concrete(64, 32, rng, 'Concrete034', 1, (140, 138, 132), contrast=1.6)
    a[0:2] *= 1.25           # worn nosing catches the light
    a[2] *= 0.85
    a[-3:] *= np.array([0.85, 0.75, 0.6])[:, None, None]
    a = grime(a, rng, amount=0.2, streak=0.0, spots=0.2)
    a = doom_finish(a, contrast=1.2, sat=0.6)
    return grain(a, rng, 4)


@texture('CTTRIM1', 128, 32, allow=('grey', 'brown', 'dark'))
def t_trim1(rng):
    base = mat_concrete(128, 32, rng, 'Concrete034', 1, (150, 144, 128), contrast=1.4)
    a = base.copy()
    prof = np.ones(32, np.float32)
    # profile of a tenement cornice, top to bottom (light from above)
    prof[0:2] = 1.3; prof[2:3] = 0.6; prof[3:9] = 1.05; prof[9:10] = 1.25; prof[10:12] = 0.55
    prof[12:18] = 1.0; prof[18:20] = 0.45; prof[20:26] = 0.95; prof[26:27] = 1.25; prof[27:29] = 0.8
    prof[29:32] = 0.5
    a *= prof[:, None, None]
    # dentils (blocks with dark gaps) on rows 12..18
    for x in range(0, 128, 8):
        a[12:18, x + 5:x + 8] *= 0.45
        a[12, x:x + 5] *= 1.2
    # modillion brackets every 32 px on the frieze
    for x in range(0, 128, 32):
        a[20:26, x + 13:x + 19] *= 1.15
        a[20:26, x + 18:x + 20] *= 0.5
    a = grime(a, rng, amount=0.2, streak=0.18, spots=0.1)
    a = doom_finish(a, contrast=1.2, sat=0.7)
    return grain(a, rng, 3)


# ---------------------------------------------------------------------------
# Text: a 5x7 pixel font for small labels, TrueType for big letters and the
# CJK fonts for Chinese signage.
# ---------------------------------------------------------------------------

_F57_ROWS = """
A .###. #...# #...# ##### #...# #...# #...#
B ####. #...# #...# ####. #...# #...# ####.
C .###. #...# #.... #.... #.... #...# .###.
D ####. #...# #...# #...# #...# #...# ####.
E ##### #.... #.... ####. #.... #.... #####
F ##### #.... #.... ####. #.... #.... #....
G .###. #...# #.... #.### #...# #...# .####
H #...# #...# #...# ##### #...# #...# #...#
I .###. ..#.. ..#.. ..#.. ..#.. ..#.. .###.
J ..### ...#. ...#. ...#. ...#. #..#. .##..
K #...# #..#. #.#.. ##... #.#.. #..#. #...#
L #.... #.... #.... #.... #.... #.... #####
M #...# ##.## #.#.# #.#.# #...# #...# #...#
N #...# ##..# #.#.# #..## #...# #...# #...#
O .###. #...# #...# #...# #...# #...# .###.
P ####. #...# #...# ####. #.... #.... #....
Q .###. #...# #...# #...# #.#.# #..#. .##.#
R ####. #...# #...# ####. #.#.. #..#. #...#
S .#### #.... #.... .###. ....# ....# ####.
T ##### ..#.. ..#.. ..#.. ..#.. ..#.. ..#..
U #...# #...# #...# #...# #...# #...# .###.
V #...# #...# #...# #...# #...# .#.#. ..#..
W #...# #...# #...# #.#.# #.#.# #.#.# .#.#.
X #...# #...# .#.#. ..#.. .#.#. #...# #...#
Y #...# #...# .#.#. ..#.. ..#.. ..#.. ..#..
Z ##### ....# ...#. ..#.. .#... #.... #####
0 .###. #...# #..## #.#.# ##..# #...# .###.
1 ..#.. .##.. ..#.. ..#.. ..#.. ..#.. .###.
2 .###. #...# ....# ...#. ..#.. .#... #####
3 ####. ....# ....# .###. ....# ....# ####.
4 ...#. ..##. .#.#. #..#. ##### ...#. ...#.
5 ##### #.... ####. ....# ....# #...# .###.
6 ..##. .#... #.... ####. #...# #...# .###.
7 ##### ....# ...#. ..#.. .#... .#... .#...
8 .###. #...# #...# .###. #...# #...# .###.
9 .###. #...# #...# .#### ....# ...#. .##..
- ..... ..... ..... ####. ..... ..... .....
. ..... ..... ..... ..... ..... .##.. .##..
' ..#.. ..#.. .#... ..... ..... ..... .....
& .##.. #..#. #.#.. .#... #.#.# #..#. .##.#
! ..#.. ..#.. ..#.. ..#.. ..#.. ..... ..#..
/ ....# ...#. ...#. ..#.. .#... .#... #....
: ..... .##.. .##.. ..... .##.. .##.. .....
+ ..... ..#.. ..#.. ##### ..#.. ..#.. .....
# .#.#. .#.#. ##### .#.#. ##### .#.#. .#.#.
"""
_F57 = {}
for _ln in _F57_ROWS.strip().splitlines():
    _F57[_ln[0]] = [r == '#' for r in ''.join(_ln[2:].split())]


def glyph57(ch):
    if ch == ' ':
        return np.zeros((7, 3), bool)
    g = _F57.get(ch.upper())
    if g is None:
        return np.zeros((7, 5), bool)
    return np.array(g, bool).reshape(7, 5)


def text57(s, spacing=1, scale=1):
    """Bitmap of `s` in the 5x7 font (True = ink)."""
    cols = []
    for i, ch in enumerate(s):
        g = glyph57(ch)
        if i:
            cols.append(np.zeros((7, spacing), bool))
        cols.append(g)
    b = np.hstack(cols) if cols else np.zeros((7, 1), bool)
    if scale > 1:
        b = b.repeat(scale, axis=0).repeat(scale, axis=1)
    return b


def stamp(a, bitmap, x, y, rgb, shadow=None, center=False):
    """Draw a boolean bitmap in colour (optional 1px drop shadow)."""
    h, w = bitmap.shape
    if center:
        x -= w // 2
    if shadow is not None:
        sub = a[y + 1:y + 1 + h, x + 1:x + 1 + w]
        bm = bitmap[:sub.shape[0], :sub.shape[1]]
        sub[bm] = np.array(shadow, np.float32)
    sub = a[y:y + h, x:x + w]
    bm = bitmap[:sub.shape[0], :sub.shape[1]]
    sub[bm] = np.array(rgb, np.float32)
    return a


def ttf_mask(text, key, size, ss=4, vertical=False, spacing=0, stroke=0):
    """Antialiased coverage (0..1) of text in an npm font, rendered at
    `ss`x and box-filtered down, cropped to its ink."""
    f = font(key, size * ss)
    chars = list(text)
    if vertical:
        ims = [ttf_mask(c, key, size, ss, stroke=stroke) for c in chars]
        w = max(m.shape[1] for m in ims)
        rows = []
        for i, m in enumerate(ims):
            pad = w - m.shape[1]
            rows.append(np.pad(m, ((0, 0), (pad // 2, pad - pad // 2))))
            if i < len(ims) - 1 and spacing:
                rows.append(np.zeros((spacing, w), np.float32))
        return np.vstack(rows)
    bbox = f.getbbox(text, stroke_width=stroke * ss)
    W = bbox[2] - bbox[0] + 8 * ss + spacing * ss * len(text)
    H = bbox[3] - bbox[1] + 8 * ss
    im = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(im)
    if spacing:
        x = 4 * ss - bbox[0]
        for c in text:
            d.text((x, 4 * ss - bbox[1]), c, font=f, fill=255, stroke_width=stroke * ss, stroke_fill=255)
            x += f.getlength(c) + spacing * ss
    else:
        d.text((4 * ss - bbox[0], 4 * ss - bbox[1]), text, font=f, fill=255, stroke_width=stroke * ss, stroke_fill=255)
    a = np.asarray(im, np.float32) / 255.0
    ys, xs = np.nonzero(a > 0.02)
    a = a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    h, w = a.shape
    ph_, pw = (-h) % ss, (-w) % ss
    a = np.pad(a, ((0, ph_), (0, pw)))
    return _box_reduce(a[..., None], ss, ss)[..., 0]


def fit_mask(m, w, h):
    """Scale a coverage mask to fit inside (w, h), keeping aspect."""
    mh, mw = m.shape
    s = min(w / mw, h / mh)
    nw, nh = max(1, int(round(mw * s))), max(1, int(round(mh * s)))
    return np.clip(resize(m, nw, nh), 0, 1)


def put_mask(a, m, x, y, rgb, center=True, k=1.0):
    """Composite a coverage mask in a colour; (x, y) is the centre."""
    h, w = m.shape
    if center:
        x, y = x - w // 2, y - h // 2
    col = np.ones((h, w, 3), np.float32) * np.array(rgb, np.float32)
    return paste(a, col, x, y, np.clip(m * k, 0, 1))


def sharp_mask(m, lo=0.35, hi=0.65):
    """Crisp up an antialiased mask (DOOM signage is hard-edged)."""
    return smoothstep(lo, hi, m)


def dilate(m, r=1):
    out = m.copy()
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            if dx * dx + dy * dy <= r * r + r:
                out = np.maximum(out, np.roll(np.roll(m, dy, 0), dx, 1))
    return out


# ---------------------------------------------------------------------------
# Tiles, shutters, doors
# ---------------------------------------------------------------------------

def tile_wall(w, h, rng, tw, th, color, grout=(132, 130, 122), bond=True, vary=0.035, gw=1,
              colors=None, rows_colors=None):
    """Glazed ceramic tile grid: per-tile shade variation, a lit top edge,
    darker bottom edge, recessed grout. colors(row, col)->rgb overrides."""
    surf = photo(acg('Tiles036'), (0, 0, 512, 512))
    noise = lum(resize(surf, w, h, wrap=True))
    noise = (noise - noise.mean()) / (noise.std() + 1e-6)
    a = np.zeros((h, w, 3), np.float32)
    rows = h // th
    for r in range(rows):
        off = (tw // 2) if (bond and r % 2) else 0
        for c in range(-1, w // tw + 1):
            x0 = c * tw + off
            col = colors(r, c) if colors else color
            v = 1 + rng.normal(0, vary)
            cell = np.array(col, np.float32) * v
            for x in range(x0, x0 + tw):
                a[r * th:(r + 1) * th, x % w] = cell
            y0 = r * th
            # bevel: glaze highlight top/left, shade bottom/right
            xs = [x % w for x in range(x0, x0 + tw)]
            a[y0 + gw, xs] *= 1.12
            a[y0 + th - 1, xs] *= 0.86
            a[y0:y0 + th, (x0 + gw) % w] *= 1.06
            a[y0:y0 + th, (x0 + tw - 1) % w] *= 0.9
            # grout
            a[y0:y0 + gw, xs] = np.array(grout, np.float32)
            for g in range(gw):
                a[y0:y0 + th, (x0 + g) % w] = np.array(grout, np.float32)
    a *= (1 + 0.05 * noise)[..., None]
    return a


@texture('CTTILE1', 128, 128, allow=('grey', 'brown', 'tan', 'dark'))
def t_tile1(rng):
    a = tile_wall(128, 128, rng, 16, 8, (206, 204, 192))
    a = a * stain_map(128, 128, rng, 0.35)[..., None]
    a = grime(a, rng, amount=0.22, streak=0.15, spots=0.15)
    # a few chipped / missing tiles
    for _ in range(4):
        x, y = int(rng.integers(0, 120)), int(rng.integers(0, 15)) * 8
        x -= x % 16
        a[y + 1:y + 7, x + 2:x + 9] = a[y + 1:y + 7, x + 2:x + 9] * 0.45 + 20
    a = doom_finish(a, contrast=1.15, sat=0.7)
    return grain(a, rng, 3)


@texture('CTTILE2', 128, 128, allow=('grey', 'brown', 'tan', 'red', 'dark'))
def t_tile2(rng):
    def col(r, c):
        if r in (7, 8):
            return (122, 26, 22)          # maroon band (reds 37-41 stay red when dimmed)
        return (206, 204, 192)
    a = tile_wall(128, 128, rng, 16, 8, None, colors=col)
    # mosaic borders (2px checker) above and below the band
    for yb in (54, 72):
        for x in range(0, 128, 2):
            for yy in range(yb, yb + 2):
                a[yy, x:x + 2] = (40, 70, 52) if ((x // 2 + yy) % 2) else (190, 176, 140)
    a = a * stain_map(128, 128, rng, 0.35)[..., None]
    a = grime(a, rng, amount=0.22, streak=0.15, spots=0.12)
    a = doom_finish(a, contrast=1.15, sat=0.85)
    return grain(a, rng, 3)


@texture('CTTILE3', 128, 128, allow=('grey', 'brown', 'tandark', 'green', 'olive', 'dark'))
def t_tile3(rng):
    def col(r, c):
        if r >= 9:
            return (46, 84, 54) if (r + c) % 5 else (40, 74, 48)
        return (192, 184, 150)
    a = tile_wall(128, 128, rng, 16, 8, None, colors=col, bond=False)
    # dark green cap row between cream and green
    a[70:72] = np.array((34, 60, 40), np.float32)
    a[70] *= 1.3
    a = grime(a, rng, amount=0.2, streak=0.12, spots=0.12)
    a = doom_finish(a, contrast=1.15, sat=0.85)
    return grain(a, rng, 3)


def mat_shutter(w, h, rng, color=(150, 150, 146), asset='painted_metal_shutter'):
    src = photo(ph(asset))
    a = resize(src, w, h, wrap=True)
    a = delight(a, 30, 0.8)
    L = lum(a)
    L = (L - L.mean()) * 1.5 + 128
    a = np.array(color, np.float32)[None, None] * (L / 128)[..., None]
    return a


def shutter_bottom(a, rng, y0=118):
    """Bottom rail with lock and lift handles."""
    w = a.shape[1]
    a[y0:] = a[y0:] * 0.4 + np.array((60, 58, 54), np.float32) * 0.6
    a[y0] *= 1.6
    a[-2:] *= 0.6
    for hx in (w // 4, 3 * w // 4):
        a[y0 + 3:y0 + 6, hx - 4:hx + 4] = (40, 38, 36)
        a[y0 + 3, hx - 4:hx + 4] = (120, 118, 112)
    lx = w // 2
    a[y0 + 2:y0 + 8, lx - 2:lx + 3] = (150, 130, 60)
    a[y0 + 4:y0 + 6, lx] = (30, 26, 20)
    return a


@texture('CTSHUT1', 128, 128, allow=('grey', 'brown', 'dark', 'yellow'))
def t_shut1(rng):
    a = mat_shutter(128, 128, rng)
    a = grime(a, rng, amount=0.2, streak=0.15, spots=0.1)
    a = a * stain_map(128, 128, rng, 0.25)[..., None]
    a = shutter_bottom(a, rng)
    a = doom_finish(a, contrast=1.2, sat=0.6)
    return grain(a, rng, 3)


def graffiti(a, rng, words, colors, x, y, size=26, angle=-6.0, outline=(18, 18, 18)):
    """Spray-paint tag: Oswald letters with a dark outline, slight tilt,
    paint drips."""
    m = ttf_mask(words, 'oswald', size)
    pad = 6
    m = np.pad(m, pad)
    im = Image.fromarray((m * 255).astype(np.uint8)).rotate(angle, resample=Image.BILINEAR, expand=True)
    m = np.asarray(im, np.float32) / 255.0
    ol = np.clip(dilate(m, 1) * 1.2, 0, 1)
    fill_c = np.array(colors[0], np.float32)
    h, w = m.shape
    # two-tone fill: vertical gradient between the colours
    t = np.linspace(0, 1, h)[:, None, None]
    fill = fill_c * (1 - t) + np.array(colors[-1], np.float32) * t
    paste(a, np.ones((h, w, 3), np.float32) * np.array(outline, np.float32), x - w // 2, y - h // 2, ol)
    paste(a, fill * np.ones((h, w, 3), np.float32), x - w // 2, y - h // 2, sharp_mask(m))
    # drips under the letters
    for _ in range(int(rng.integers(3, 7))):
        dx = int(rng.integers(x - w // 3, x + w // 3))
        col = np.nonzero(m[:, min(w - 1, max(0, dx - x + w // 2))] > 0.5)[0]
        if len(col):
            y1 = y - h // 2 + col.max()
            ln = int(rng.integers(3, 12))
            a[y1:y1 + ln, dx % a.shape[1]] = np.array(colors[-1], np.float32) * 0.9
    return a


def scribble(a, rng, x, y, rgb, n=40, step=1.0, width=2):
    ang = rng.uniform(0, 6.28)
    h, w = a.shape[:2]
    for _ in range(n):
        ang += rng.normal(0, 0.6)
        x, y = x + math.cos(ang) * step, y + math.sin(ang) * step * 0.6
        xi, yi = int(x) % w, int(y)
        if 0 <= yi < h:
            a[yi:yi + width, xi:xi + width] = np.array(rgb, np.float32)
    return a


@texture('CTSHUT2', 128, 128, allow=('grey', 'brown', 'dark', 'yellow', 'red', 'green', 'blue', 'brightred'))
def t_shut2(rng):
    a = mat_shutter(128, 128, rng, color=(140, 142, 140))
    a = grime(a, rng, amount=0.25, streak=0.2, spots=0.12)
    a = graffiti(a, rng, 'KR8Z', [(236, 236, 230), (230, 200, 60)], 58, 44, size=34, angle=8)
    a = graffiti(a, rng, 'DEAD', [(200, 30, 24)], 92, 90, size=18, angle=-4, outline=(60, 10, 8))
    scribble(a, rng, 18, 84, (40, 160, 60), 50)
    scribble(a, rng, 100, 20, (20, 20, 20), 40)
    a = shutter_bottom(a, rng)
    a = doom_finish(a, contrast=1.15, sat=0.85, sharp=0.3)
    return grain(a, rng, 3)


@texture('CTGRGE1', 128, 128, allow=('grey', 'brown', 'dark', 'olive', 'yellow'))
def t_grge1(rng):
    src = photo(ph('painted_metal_shutter'), (0, 0, 528, 528))     # 16 slats
    a = resize(src, 128, 128, wrap=True)
    a = seamless(a, 1, band=16)
    a = delight(a, 30, 0.8)
    L = lum(a)
    L = (L - L.mean()) * 1.7 + 128
    paint = np.array((112, 122, 128), np.float32)[None, None] * (L / 128)[..., None]
    rustc = np.array((112, 66, 40), np.float32)[None, None] * (L / 128)[..., None]
    rust = np.clip(streaks(128, 128, rng, 0.8, 1.2) * 0.7 + smoothstep(1.2, 2.5, fnoise(128, 128, rng, 1.2)), 0, 1)
    a = mix(paint, rustc, rust * 0.75)
    a = grime(a, rng, amount=0.2, streak=0.2, spots=0.1)
    a = shutter_bottom(a, rng, 116)
    a = doom_finish(a, contrast=1.2, sat=0.7)
    return grain(a, rng, 3)


@texture('CTELEV1', 128, 128, allow=('grey', 'brown', 'dark', 'yellow', 'olive'))
def t_elev1(rng):
    base = mat_concrete(128, 128, rng, 'Metal041B', 1, (120, 124, 120), contrast=0.8)
    a = base.copy()
    # vertical stiffener ribs on both leaves
    for x in range(8, 128, 16):
        a[:, x:x + 3] *= 1.18
        a[:, x + 3] *= 0.7
    # bi-parting leaves meet at y=64: rubber astragal + hazard stripes
    for y0 in (52, 66):
        for x in range(128):
            stripe = ((x + (y0 // 2)) // 6) % 2
            a[y0:y0 + 10, x] = (200, 160, 30) if stripe else (30, 28, 24)
        a[y0:y0 + 10] *= (1 + 0.05 * fnoise(10, 128, rng))[..., None]
    a[62:66] = (24, 24, 22)
    a[62] = (70, 70, 66)
    # diamond plate kick panel at the bottom
    dp = resize(photo(acg('DiamondPlate001')), 128, 32, wrap=True)
    dp = grade(dp, contrast=1.6, sat=0.2) * 0.8
    a[100:124] = dp[:24]
    a[100] *= 1.3
    a[123] *= 0.6
    # frame
    a[:4] *= 0.5
    a[124:] *= 0.45
    stamp(a, text57('FREIGHT'), 64, 30, (210, 200, 160), shadow=(30, 30, 30), center=True)
    a = grime(a, rng, amount=0.2, streak=0.18, spots=0.12)
    a = doom_finish(a, contrast=1.15, sat=0.8)
    return grain(a, rng, 3)


def photo_door(path, w, h, color=None, box=None, sat=0.8):
    a = resize(photo(path, box), w, h)
    a = delight(a, 40, 0.6, wrap=False)
    if color is not None:
        L = lum(a)
        L = (L - L.mean()) * 1.3 + 128
        a = np.array(color, np.float32)[None, None] * (L / 128)[..., None]
    return a


@texture('CTDOOR1', 64, 128, allow=tuple(range(35, 44)) + tuple(range(174, 186)) + ('dark', 'yellow') + (236, 237, 238, 239))
def t_door1(rng):
    """Red lacquered wooden door. Quantized to the reds that stay red when
    DOOM's COLORMAP dims them (35-43 and 174-185); the mid reds 16-34 turn
    brown in the dark and would blotch the paint."""
    a = photo_door(oga('doors-gates', 'door_wood_tng_red.png'), 64, 128)
    a = hue_red(a, 0.35)
    a = grime(a, rng, amount=0.12, streak=0.1, spots=0.08)
    a = doom_finish(a, contrast=1.15, sat=1.1, bright=0.62, wrap=False)
    # brass knob and keyhole plate
    a[62:68, 52:57] = (190, 150, 60)
    a[62, 52:57] = (240, 210, 120)
    a[67, 52:57] = (110, 80, 30)
    a[70:73, 54] = (30, 20, 10)
    return grain(a, rng, 3)


@texture('CTDOOR2', 64, 128, allow=('grey', 'brown', 'dark', 'yellow'))
def t_door2(rng):
    a = photo_door(oga('doors-gates', 'door_steel_red2.png'), 64, 128, color=(100, 104, 108))
    a[104:124, 6:58] = a[104:124, 6:58] * 0.5 + 60     # scuffed kick plate
    a[104, 6:58] *= 1.3
    # push-bar handle at hand height
    a[66:70, 8:56] = (150, 150, 146)
    a[66, 8:56] *= 1.3
    a[69, 8:56] *= 0.5
    a[70:72, 9:56] *= 0.6
    a = grime(a, rng, amount=0.18, streak=0.12, spots=0.08)
    a = doom_finish(a, contrast=1.25, sat=0.5, wrap=False)
    return grain(a, rng, 3)


@texture('CTDOOR3', 128, 128, allow=('grey', 'brown', 'dark', 'blue', 'yellow', 'red', 'tan'))
def t_door3(rng):
    alu = (150, 152, 150)
    a = mat_concrete(128, 128, rng, 'Concrete034', 1, (110, 108, 104), contrast=1.0)
    rect(a, 2, 4, 126, 128, alu)
    edge_shade(a, 2, 4, 126, 128, 1.2, 0.6, 1)
    # transom
    a[8:24, 6:122] = glass(16, 116, rng, 'dark')
    a[24:28, 6:122] = alu
    # sidelights and two doors
    for x0, x1, kind in ((6, 20, 'shapes'), (24, 62, 'shapes'), (66, 104, 'shapes'), (108, 122, 'shapes')):
        a[28:112, x0:x1] = glass(84, x1 - x0, rng, kind)
        a[28, x0:x1] *= 0.6
    for x0, x1 in ((22, 64), (64, 106)):
        edge_shade(a, x0, 26, x1, 124, 1.25, 0.55, 1)
        a[112:124, x0 + 2:x1 - 2] = (170, 170, 164)       # kick plate
        a[112, x0 + 2:x1 - 2] *= 1.2
    # pull handles
    for hx in (58, 70):
        a[56:86, hx:hx + 2] = (200, 200, 196)
        a[56:86, hx + 2] = (60, 60, 60)
    stamp(a, text57('PUSH'), 43, 92, (200, 196, 180), center=True)
    stamp(a, text57('PULL'), 85, 92, (200, 196, 180), center=True)
    # store-hours sticker and a hand-written note
    a[36:48, 30:44] = (220, 214, 190)
    for yy in range(38, 47, 2):
        a[yy, 32:42] = (60, 60, 70)
    a[40:52, 80:92] = (200, 190, 120)
    a = grime(a, rng, amount=0.12, streak=0.08, spots=0.05)
    a = doom_finish(a, contrast=1.15, sat=0.85, wrap=False)
    return grain(a, rng, 2)


# ---------------------------------------------------------------------------
# Wood, metal, containers, warehouse, sewer
# ---------------------------------------------------------------------------

def mat_wood(w, h, rng, asset='Wood087', color=(184, 150, 104), contrast=1.6, vertical=False, reps=1):
    src = photo(acg(asset))
    if vertical:
        src = np.ascontiguousarray(np.transpose(src, (1, 0, 2)))
    a = tile(resize(src, 512 // reps, 512 // reps, wrap=True), reps, reps)
    a = resize(a, w, h, wrap=True)
    a = delight(a, 24, 0.9)
    L = lum(a)
    L = (L - L.mean()) * contrast + 128
    return np.clip(np.array(color, np.float32)[None, None] * (L / 128)[..., None], 0, 255)


def plywood(w, h, rng, color=(176, 142, 96), sheet=64):
    a = mat_wood(w, h, rng, 'Wood087', color, 0.8, vertical=True)
    # each sheet a slightly different tone, dark seam between sheets
    for i, x in enumerate(range(0, w, sheet)):
        a[:, x:x + sheet] *= 1 + rng.normal(0, 0.05)
        a[:, x] *= 0.35
        a[:, (x + 1) % w] *= 0.8
        a[:, (x + sheet - 1) % w] *= 1.1
        for y in range(6, h, 16):         # nail rows along the edges
            for nx in (x + 3, x + sheet - 4):
                a[y, nx % w] = (54, 50, 46)
                a[y - 1, nx % w] *= 1.2
    return a


@texture('CTWOOD1', 128, 128, allow=('tandark', 'brown', 'grey', 'dark'))
def t_wood1(rng):
    a = plywood(128, 128, rng)
    a = a * stain_map(128, 128, rng, 0.4)[..., None]
    a = grime(a, rng, amount=0.2, streak=0.15, spots=0.1)
    a = doom_finish(a, contrast=1.15, sat=0.85)
    return grain(a, rng, 3)


def corrugate(w, h, period=8, depth=0.35, phase=0):
    """Shading of vertical sinusoidal corrugation lit from the left."""
    x = np.arange(w, dtype=np.float32)
    s = np.cos((x + phase) * 2 * math.pi / period)
    return np.ones((h, 1), np.float32) * (1 + depth * s)[None, :]


@texture('CTMETL1', 128, 128, allow=('grey', 'brown', 'dark', 'olive'))
def t_metl1(rng):
    a = mat_concrete(128, 128, rng, 'CorrugatedSteel005', 1, (112, 114, 112), contrast=1.4)
    a *= corrugate(128, 128, 8, 0.24)[..., None]
    # lap joint and fastener rows
    a[0:2] *= 0.6
    for y in (10, 74):
        for x in range(2, 128, 8):
            a[y:y + 2, x:x + 2] = (60, 60, 58)
            a[y + 2:y + 2 + int(rng.integers(2, 10)), x] *= 0.75   # rust tears
    st = streaks(128, 128, rng, 0.6, 1.5)
    a = mix(a, a * np.array([0.95, 0.7, 0.5], np.float32), st * 0.8)
    a = grime(a, rng, amount=0.2, streak=0.12, spots=0.1)
    a = doom_finish(a, contrast=1.2, sat=0.7)
    return grain(a, rng, 3)


@texture('CTMETL2', 128, 128, allow=('grey', 'brown', 'dark', 'olive', 'tandark', 'orange'))
def t_metl2(rng):
    paint = mat_concrete(128, 128, rng, 'Metal041B', 1, (76, 84, 78), contrast=1.0)
    rustsrc = resize(photo(acg('Rust009')), 128, 128, wrap=True)
    rustsrc = grade(rustsrc, contrast=1.2, sat=0.75, bright=0.7)
    src = resize(photo(acg('Metal041B')), 128, 128, wrap=True)
    rmask = smoothstep(15, 45, src[..., 0] - src[..., 2])
    rmask = np.clip(rmask + 0.6 * smoothstep(1.0, 2.2, fnoise(128, 128, rng, 1.6)), 0, 1)
    a = mix(paint, rustsrc, rmask)
    # 64x64 riveted panels with lapped seams
    for x in (0, 64):
        a[:, x:x + 2] *= 0.45
        a[:, x + 2] *= 1.25
    for y in (0, 64):
        a[y:y + 2] *= 0.45
        a[y + 2] *= 1.25
    for y in (6, 58, 70, 122):
        for x in range(6, 128, 10):
            a[y:y + 2, x:x + 2] = a[y:y + 2, x:x + 2] * 0.4 + 90
            a[y + 1, x + 1] *= 0.5
    a = grime(a, rng, amount=0.2, streak=0.15, spots=0.12)
    a = doom_finish(a, contrast=1.2, sat=0.8)
    return grain(a, rng, 3)


def container(rng, color, code, grain_amt=3):
    a = mat_concrete(128, 128, rng, 'Metal041B', 1, color, contrast=0.7)
    # trapezoidal corrugation: outer face, slope, inner face, slope (16 px)
    prof = np.ones(16, np.float32)
    prof[0:6] = 1.08
    prof[6:8] = 0.62
    prof[8:14] = 0.9
    prof[14:16] = 1.3
    a *= np.tile(prof, 8)[None, :, None]
    # top and bottom rails
    a[0:6] = a[0:6] * 0.5 + np.array(color, np.float32) * 0.3
    a[0] *= 1.4
    a[5] *= 0.5
    a[120:128] = a[120:128] * 0.45 + np.array(color, np.float32) * 0.25
    a[120] *= 1.4
    rust = np.clip(streaks(128, 128, rng, 0.9, 1.0) + smoothstep(1.4, 2.6, fnoise(128, 128, rng, 1.0)), 0, 1)
    a = mix(a, a * np.array([0.9, 0.6, 0.42], np.float32) + np.array([30, 10, 0], np.float32), rust * 0.7)
    # stencilled owner code (white, partly worn)
    stamp(a, text57(code), 12, 16, (210, 210, 200))
    stamp(a, text57('22G1'), 12, 26, (210, 210, 200))
    a = grime(a, rng, amount=0.22, streak=0.15, spots=0.1)
    a = doom_finish(a, contrast=1.2, sat=0.85)
    return grain(a, rng, grain_amt)


@texture('CTCONT1', 128, 128, allow=('red', 'brown', 'grey', 'dark', 'tandark'))
def t_cont1(rng):
    return container(rng, (140, 46, 34), 'CTXU 4821')


@texture('CTCONT2', 128, 128, allow=('dark', 'brown') + tuple(range(200, 208)) + (240, 241, 242) + tuple(range(88, 112)))
def t_cont2(rng):
    """Blue container. The DOOM palette's blues are pure (0,0,b), so the
    paint keeps to that ramp (no pale blues: they speckle); greys only
    appear as stencils, scrapes and rust patches. Reads deep blue at the
    docks' light levels instead of going black."""
    return container(rng, (14, 18, 136), 'HNKU 3077', grain_amt=1.5)


@texture('CTCONT3', 128, 128, allow=('green', 'olive', 'grey', 'dark', 'brown'))
def t_cont3(rng):
    return container(rng, (52, 88, 52), 'EVRU 1958')


@texture('CTWARE1', 128, 128, allow=('grey', 'brown', 'dark', 'tandark'))
def t_ware1(rng):
    base = mat_concrete(128, 128, rng, 'Concrete034', 1, (150, 150, 140), contrast=2.2)
    a = base.copy()
    bw, bh = 32, 16
    for r in range(128 // bh):
        off = bw // 2 if r % 2 else 0
        y0 = r * bh
        a[y0:y0 + 2] = a[y0:y0 + 2] * 0.62
        a[y0 + 2] *= 1.1
        for x in range(off, 128 + off, bw):
            a[y0:y0 + bh, x % 128] *= 0.62
            a[y0:y0 + bh, (x + 1) % 128] *= 0.8
            a[y0:y0 + bh, (x + 2) % 128] *= 1.08
            a[y0 + 2:y0 + bh, x % 128:(x % 128) + bw] *= 1 + rng.normal(0, 0.025)
    # painted dado band (faded safety green) on the lower part
    a[96:] = a[96:] * np.array([0.7, 0.85, 0.72], np.float32)
    a[95:97] *= 0.7
    a = grime(a, rng, amount=0.2, streak=0.18, spots=0.12)
    a = doom_finish(a, contrast=1.15, sat=0.75)
    return grain(a, rng, 3)


@texture('CTSEWR1', 128, 128, allow=('brown', 'grey', 'dark', 'olive', 'tandark'))
def t_sewr1(rng):
    src = photo(ph('red_bricks_04'), (0, 0, 244, 244))     # ~10 courses x 5 bricks
    a = resize(src, 128, 128, wrap=True)
    a = seamless(a, 1, shift=26, band=6)
    a = seamless(a, 0, shift=26, band=4)
    a = delight(a, 20, 0.9)
    a = grade(a, contrast=1.45, sat=0.6, bright=0.86)
    # wet sheen on brick tops, slime and mineral streaks
    a = a * stain_map(128, 128, rng, 0.5)[..., None]
    slime = np.clip(streaks(128, 128, rng, 1.0, 1.2) * 1.2, 0, 1)
    a = mix(a, a * np.array([0.7, 0.95, 0.55], np.float32) + np.array([0, 12, 0], np.float32), slime * 0.7)
    a = grime(a, rng, amount=0.25, streak=0.1, spots=0.15)
    a = doom_finish(a, contrast=1.2, sat=0.85)
    return grain(a, rng, 4)


def pipe(a, y0, d, color, rng, brackets=64, rust=0.5):
    """Horizontal pipe of diameter d with cylindrical shading (light from above)."""
    w = a.shape[1]
    t = (np.arange(d, dtype=np.float32) + 0.5) / d * 2 - 1
    shade = np.clip(0.55 + 0.75 * np.sqrt(np.clip(1 - t * t, 0, 1)) - 0.35 * t, 0.25, 1.4)
    shade[int(d * 0.25)] *= 1.25
    col = np.array(color, np.float32)
    n = fnoise(d, w, rng, 1.4, sx=4)
    body = shade[:, None, None] * col[None, None, :] * (1 + 0.08 * n[..., None])
    if rust:
        rs = smoothstep(0.8, 2.2, fnoise(d, w, rng, 1.6, sx=2))
        body = mix(body, body * np.array([1.0, 0.6, 0.4], np.float32), rs * rust)
    a[y0:y0 + d] = body
    a[y0 + d:y0 + d + 2] *= 0.5       # contact shadow
    for x in range(brackets // 2, w, brackets):
        a[y0 - 2:y0 + d + 2, x:x + 3] = np.array((70, 66, 60), np.float32) * shade.mean()
        a[y0 - 2:y0 + d + 2, x] *= 1.3
    return a


@texture('CTSEWR2', 128, 128, allow=('grey', 'brown', 'dark', 'olive', 'tandark'))
def t_sewr2(rng):
    a = mat_concrete(128, 128, rng, 'Concrete036', 1, (104, 106, 96), contrast=1.6)
    a = a * stain_map(128, 128, rng, 0.6)[..., None]
    slime = streaks(128, 128, rng, 1.0, 1.0)
    a = mix(a, a * np.array([0.7, 0.9, 0.55], np.float32), slime * 0.7)
    pipe(a, 74, 18, (110, 84, 64), rng, 64, 0.7)
    pipe(a, 34, 8, (120, 122, 118), rng, 32, 0.3)
    # drips below the big pipe
    for x in rng.integers(0, 128, 6):
        ln = int(rng.integers(6, 26))
        a[94:94 + ln, x] *= 0.7
    a = grime(a, rng, amount=0.25, streak=0.1, spots=0.15)
    a = doom_finish(a, contrast=1.2, sat=0.8)
    return grain(a, rng, 3)


@texture('CTSEWR3', 64, 64, allow=('grey', 'brown', 'dark', 'olive', 'green', 'tandark'))
def t_sewr3(rng):
    a = mat_concrete(64, 64, rng, 'Concrete036', 1, (110, 110, 100), contrast=1.6)
    yy, xx = np.mgrid[0:64, 0:64].astype(np.float32)
    cx, cy, r = 31.5, 30, 22
    d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
    ring = (d < r + 3) & (d >= r)
    hole = d < r
    a[ring] *= 0.75
    a[(d < r + 4) & (d >= r + 3) & (yy < cy)] *= 1.25   # lit lip
    # dark tunnel receding, a faint wet glint at the bottom
    depth = np.clip(1 - d / r, 0, 1)
    inner = np.array((40, 40, 34), np.float32)[None, None] * (1 - 0.8 * depth[..., None])
    a[hole] = inner[hole]
    a[hole & (yy > cy + r * 0.55)] += np.array((10, 16, 8), np.float32)
    # bars
    bars = np.zeros((64, 64), bool)
    for x in range(14, 52, 7):
        bars[:, x:x + 3] = True
    bars[28:31, :] = True
    bars &= d < r + 1
    shade = np.where((xx.astype(int) % 7) == 0, 1.3, np.where((xx.astype(int) % 7) == 2, 0.6, 0.95))
    metal = np.array((92, 70, 52), np.float32)[None, None] * shade[..., None]
    a[bars] = metal[bars]
    a = drop_shadow(a, bars, 1, 1, 0.5, wrap=False)
    # green slime trickling from the outflow
    for x in range(20, 44):
        ln = int(abs(rng.normal(8, 5)))
        a[52:52 + ln, x] = a[52:52 + ln, x] * np.array([0.5, 0.9, 0.4]) + np.array([0, 30, 0])
    a = grime(a, rng, amount=0.2, streak=0.1, spots=0.1)
    a = doom_finish(a, contrast=1.2, sat=0.85, wrap=False)
    return grain(a, rng, 3)


# ---------------------------------------------------------------------------
# Chinatown gate pieces: pillar, roof tiles, name board
# ---------------------------------------------------------------------------

GOLD = (226, 178, 60)


def lacquer(w, h, rng, color=(150, 26, 20)):
    src = resize(photo(acg('PaintedWood003')), 256, 256, wrap=True)
    src = np.ascontiguousarray(np.transpose(src, (1, 0, 2)))  # grain runs vertically
    a = resize(src, w, h, wrap=True)
    a = delight(a, 20, 1.0)
    L = lum(a)
    L = (L - L.mean()) * 1.3 + 128
    return np.clip(np.array(color, np.float32)[None, None] * (L / 128)[..., None], 0, 255)


@texture('CTPILR1', 64, 128, allow=('red', 'brightred', 'yellow', 'orange', 'dark', 'brown', 'grey'))
def t_pilr1(rng):
    a = lacquer(64, 128, rng)
    # gentle rounding toward the edges (a square pillar's arrises are eased)
    x = np.linspace(-1, 1, 64)
    a *= (1 - 0.18 * x ** 4)[None, :, None]
    # gold bands with a meander (key) pattern at the top, plinth band at the bottom
    for y0, hh in ((4, 14), (114, 8)):
        band = np.ones((hh, 64, 3), np.float32) * np.array(GOLD, np.float32)
        band[0] *= 1.25
        band[-1] *= 0.55
        if hh >= 12:
            for xx in range(0, 64, 8):
                band[3:hh - 3, xx:xx + 1] = (120, 40, 20)
                band[3, xx:xx + 5] = (120, 40, 20)
                band[3:hh - 5, xx + 4] = (120, 40, 20)
                band[hh - 6, xx + 2:xx + 5] = (120, 40, 20)
        a[y0:y0 + hh] = band
    a[2:4] *= 0.6
    a[18:20] *= 0.6
    a = grime(a, rng, amount=0.15, streak=0.12, spots=0.06)
    a = doom_finish(a, contrast=1.2, sat=1.0, wrap=False)
    return grain(a, rng, 3)


@texture('CTROOF1', 128, 64, allow=('green', 'olive', 'dark', 'yellow') + tuple(range(100, 112)))
def t_roof1(rng):
    """Green glazed barrel tiles seen from the eave: rows of half-round cover
    tiles with round end caps along the bottom."""
    w, h = 128, 64
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    period = 16
    u = (xx % period) / period * 2 - 1          # -1..1 across one tile row
    cover = np.abs(u) < 0.62                    # convex cover tile
    cs = np.sqrt(np.clip(1 - (u / 0.62) ** 2, 0, 1))
    base = np.array((38, 96, 50), np.float32)
    shade = np.where(cover, 0.55 + 0.6 * cs - 0.25 * (u / 0.62), 0.5 + 0.1 * np.abs(u))
    # overlapping tile courses every 12 px down the slope
    course = (yy % 12) / 12
    shade = shade * (0.82 + 0.3 * course)
    shade = np.where((yy % 12) < 1, shade * 0.55, shade)
    glaze = np.clip(np.where(cover, cs ** 8, 0) * 0.35 * (1 - course), 0, 1)
    a = base[None, None] * shade[..., None] + glaze[..., None] * 70
    # end caps (round, with a stamped rim) on the bottom 14 rows
    cy = h - 8
    for cx in range(period // 2, w, period):
        d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
        cap = d < 6.5
        a[cap] = base[None, :] * (1.05 - 0.04 * (yy[cap] - cy))[:, None]
        a[(d < 6.5) & (d > 5.2)] *= 0.65
        a[(d < 2.2)] = np.array((190, 160, 70), np.float32)  # gilded boss
        # drip tile between caps
        tx = cx + period // 2
        tri = (yy > h - 10) & (np.abs(xx - tx) < (yy - (h - 10)) * 0.6 + 0.5) & (yy < h - 2)
        a[tri] = base[None, :] * 0.8
    a[h - 14:h - 13] *= 0.6
    a[-1] *= 0.5
    tex = resize(photo(oga('roof-tiles', 'roof_tiles_arched2.png')), w, h)
    n = lum(tex)
    a *= (0.85 + 0.3 * (n / n.mean() - 1))[..., None] + 0.15
    a = grime(a, rng, amount=0.18, streak=0.1, spots=0.08)
    a = doom_finish(a, contrast=1.15, sat=1.0, bright=1.25)
    return grain(a, rng, 3)


@texture('CTNPAI1', 128, 64, allow=('red', 'brightred', 'yellow', 'orange', 'dark', 'brown', 'green', 'blue'))
def t_npai1(rng):
    """Paifang name board: 唐人街 (Chinatown) in gold on red lacquer,
    gilded frame with a blue-green painted border (fullbright)."""
    a = lacquer(128, 64, rng, (176, 24, 18))
    # outer frame: gold, then a teal-green painted band with a white bead
    a[0:4] = GOLD
    a[-4:] = GOLD
    a[:, 0:4] = GOLD
    a[:, -4:] = GOLD
    edge_shade(a, 0, 0, 128, 64, 1.2, 0.6, 1)
    a[4:7, 4:124] = (30, 90, 70)
    a[57:60, 4:124] = (30, 90, 70)
    a[4:60, 4:7] = (30, 90, 70)
    a[4:60, 121:124] = (30, 90, 70)
    a[7, 7:121] *= 0.55
    m = ttf_mask('唐人街', 'notoserif', 96, ss=2)
    m = fit_mask(m, 104, 42)
    m = sharp_mask(m, 0.3, 0.7)
    sh = np.pad(m, ((1, 0), (1, 0)))[:-1, :-1]
    put_mask(a, sh, 65, 33, (70, 8, 6))
    put_mask(a, m, 64, 32, (252, 214, 90))
    # tiny gold dragon-cloud corner scrolls
    for cx, cy in ((10, 11), (117, 11), (10, 52), (117, 52)):
        a[cy - 1:cy + 2, cx - 1:cx + 2] = (240, 200, 80)
    a = doom_finish(a, contrast=1.1, sat=1.05, sharp=0.2, wrap=False)
    return a


# ---------------------------------------------------------------------------
# Ladders and objective panels (64x64 unless noted)
# ---------------------------------------------------------------------------

def ladder(a, rng, x0=14, x1=50, y_top=0, y_bot=128, color=(150, 150, 140), shadow=True):
    h, w = a.shape[:2]
    m = np.zeros((h, w), bool)
    c = np.array(color, np.float32)
    lad = np.zeros((h, w, 3), np.float32)
    for x in (x0, x1 - 4):
        m[y_top:y_bot, x:x + 4] = True
        lad[y_top:y_bot, x:x + 4] = c * np.array([1.25, 1.05, 0.9, 0.6])[None, :, None]
    for y in range(y_top + 6, y_bot - 3, 12):
        m[y:y + 3, x0 + 4:x1 - 4] = True
        lad[y:y + 3, x0 + 4:x1 - 4] = c * np.array([1.2, 0.95, 0.65])[:, None, None]
    # wall brackets
    for y in range(y_top + 20, y_bot - 3, 48):
        for x in (x0 - 4, x1):
            m[y:y + 3, x:x + 4] = True
            lad[y:y + 3, x:x + 4] = c * 0.7
    if shadow:
        drop_shadow(a, m, 3, 3, 0.5, wrap=False)
    a[m] = lad[m]
    return a, m


@texture('CTLADR1', 64, 128, allow=('grey', 'brown', 'dark', 'yellow'))
def t_ladr1(rng):
    a = mat_concrete(64, 128, rng, 'Concrete031', 1, (124, 122, 116))
    a = grime(a, rng, amount=0.18, streak=0.15, spots=0.1)
    a = doom_finish(a, contrast=1.15, sat=0.6)
    a, _ = ladder(a, rng, color=(176, 150, 60))
    return grain(a, rng, 2)


def plywood_panel(w, h, rng):
    a = plywood(w, h, rng, sheet=64)
    a = a * stain_map(w, h, rng, 0.3)[..., None]
    a = grime(a, rng, amount=0.2, streak=0.15, spots=0.1)
    return doom_finish(a, contrast=1.15, sat=0.85)


@texture('CTLADR2', 64, 128, allow=('tandark', 'brown', 'grey', 'dark'))
def t_ladr2(rng):
    a = plywood_panel(64, 128, seed('CTWOOD1'))
    a, _ = ladder(a, rng, color=(140, 140, 136))
    return grain(a, rng, 2)


@texture('CTLADR3', 64, 128, allow=('tandark', 'brown', 'grey', 'dark', 'yellow'))
def t_ladr3(rng):
    """Same plywood, ladder hoisted up: it ends far above the player's
    reach, held by a chain; scuff marks where it used to stand."""
    a = plywood_panel(64, 128, seed('CTWOOD1'))
    a, _ = ladder(a, rng, y_top=0, y_bot=46, color=(140, 140, 136))
    for y in range(46, 58):          # chain to a hook
        a[y, 31 + (y % 2)] = (60, 58, 54)
    a[56:60, 29:35] = (70, 68, 60)
    for x in (14, 46):               # scrape marks below
        a[60:124, x:x + 4] *= 0.85
    a[118:124, 10:54] *= 0.8
    return grain(a, rng, 2)


def panel_bg(rng, color=(112, 114, 110), size=64):
    a = mat_concrete(size, size, rng, 'Concrete031', 1, (104, 102, 96))
    a = grime(a, rng, amount=0.15, streak=0.12, spots=0.08)
    return doom_finish(a, contrast=1.1, sat=0.6)


def box(a, x0, y0, x1, y1, color, rng=None, bevel=1):
    sub = np.ones((y1 - y0, x1 - x0, 3), np.float32) * np.array(color, np.float32)
    if rng is not None:
        sub *= (1 + 0.06 * fnoise(y1 - y0, x1 - x0, rng, 1.5))[..., None]
    a[y0:y1, x0:x1] = sub
    edge_shade(a, x0, y0, x1, y1, 1.3, 0.55, bevel)
    a[y1:y1 + 2, x0 + 2:x1 + 2] *= 0.5       # cast shadow
    a[y0 + 2:y1 + 2, x1:x1 + 2] *= 0.5
    return a


def disc(a, cx, cy, r, color, ring=None, hl=True):
    yy, xx = np.mgrid[0:a.shape[0], 0:a.shape[1]].astype(np.float32)
    d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
    m = d <= r
    c = np.array(color, np.float32)
    shade = 1.0 - 0.35 * ((yy - cy) + (xx - cx)) / max(r, 1) * 0.5
    a[m] = (c[None] * shade[m][:, None])
    if ring is not None:
        a[(d <= r + 1.2) & (d > r)] = np.array(ring, np.float32)
    if hl:
        a[(np.abs(xx - (cx - r * 0.35)) < 1) & (np.abs(yy - (cy - r * 0.35)) < 1) & m] = np.minimum(c * 1.8 + 60, 255)
    return a


def glow(a, cx, cy, r, color, k=0.8):
    yy, xx = np.mgrid[0:a.shape[0], 0:a.shape[1]].astype(np.float32)
    d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
    g = np.clip(1 - d / r, 0, 1) ** 2 * k
    return a + g[..., None] * np.array(color, np.float32)


def button_panel(rng, lit):
    a = panel_bg(rng)
    box(a, 14, 8, 50, 56, (178, 150, 40), rng)                 # yellow switch box
    for y in range(10, 54, 6):                                 # hazard stripe edge
        a[y:y + 3, 14:17] = (30, 30, 28)
    a[12:18, 20:44] = (40, 40, 38)
    stamp(a, text57('PUSH'), 32, 12 - 1, (220, 200, 120), center=True)
    disc(a, 32, 34, 9, (90, 90, 88), ring=(30, 30, 30), hl=False)
    if lit:
        disc(a, 32, 34, 7, (60, 255, 70), ring=(20, 70, 20))
        a = glow(a, 32, 34, 18, (20, 120, 30), 0.9)
        disc(a, 25, 49, 2, (120, 255, 120), hl=False)
    else:
        disc(a, 32, 34, 7, (150, 30, 24), ring=(50, 10, 8))
        disc(a, 25, 49, 2, (30, 50, 30), hl=False)
    disc(a, 39, 49, 2, (60, 20, 16) if lit else (40, 14, 12), hl=False)
    # conduit running down out of the box
    a[56:64, 30:34] = (90, 90, 86)
    a[56:64, 30] *= 1.3
    a[56:64, 33] *= 0.6
    return grain(a, rng, 2)


@texture('CTBUT1', 64, 64, allow=('grey', 'brown', 'dark', 'yellow', 'red', 'green'))
def t_but1(rng):
    return button_panel(rng, False)


@texture('CTBUT2', 64, 64, allow=('grey', 'brown', 'dark', 'yellow', 'red', 'green'))
def t_but2(rng):
    return button_panel(seed('CTBUT1'), True)


def gauge(a, cx, cy, r, val, rng):
    disc(a, cx, cy, r, (220, 216, 200), ring=(40, 40, 40), hl=False)
    for k in range(7):
        t = math.radians(225 - k * 45)
        x, y = cx + math.cos(t) * (r - 1.5), cy - math.sin(t) * (r - 1.5)
        a[int(round(y)), int(round(x))] = (30, 30, 30)
    a[int(cy) + 2:int(cy) + 4, int(cx) + r - 4:int(cx) + r - 1] = (190, 30, 20)   # red zone
    t = math.radians(225 - val * 270)
    for s in np.linspace(0, r - 2, 12):
        a[int(round(cy - math.sin(t) * s)), int(round(cx + math.cos(t) * s))] = (180, 20, 10)
    return a


@texture('CTGEN1', 64, 64, allow=('grey', 'brown', 'dark', 'yellow', 'red', 'green', 'olive'))
def t_gen1(rng):
    a = panel_bg(rng)
    box(a, 4, 4, 60, 60, (96, 108, 84), rng)          # olive generator control panel
    a[6:14, 6:58] = (178, 150, 40)
    stamp(a, text57('GEN-SET'), 32, 7, (30, 30, 28), center=True)
    gauge(a, 18, 26, 8, 0.15, rng)
    gauge(a, 46, 26, 8, 0.05, rng)
    # START/STOP buttons, toggle switches, fuel cap
    disc(a, 16, 48, 4, (50, 150, 50), ring=(20, 20, 20))
    disc(a, 28, 48, 4, (170, 30, 24), ring=(20, 20, 20))
    for x in (38, 44, 50):
        a[42:50, x:x + 3] = (40, 40, 40)
        a[42:45, x:x + 3] = (200, 200, 196)
    a[52:56, 6:58] = (40, 40, 38)
    return grain(a, rng, 2)


def socket_panel(rng, plugged):
    a = panel_bg(rng)
    box(a, 16, 10, 48, 46, (176, 152, 46), rng)                 # weatherproof outlet box
    disc(a, 32, 28, 10, (60, 60, 58), ring=(30, 30, 28), hl=False)
    if plugged:
        disc(a, 32, 28, 8, (30, 30, 30), hl=False)
        box(a, 26, 22, 38, 36, (40, 40, 42), None)                # plug body
        a[24:34, 30:34] = (70, 70, 72)
        # cable dropping out of frame
        for y in range(36, 64):
            x = 32 + int(round(3 * math.sin((y - 36) / 6.0)))
            a[y, x - 2:x + 2] = (30, 30, 32)
            a[y, x - 2] = (70, 70, 74)
        a = glow(a, 44, 16, 6, (40, 160, 40), 0.9)
        a[15:18, 43:46] = (90, 255, 90)
    else:
        for (dx, dy) in ((-4, -3), (4, -3), (0, 4)):
            a[28 + dy - 1:28 + dy + 2, 32 + dx - 1:32 + dx + 1] = (10, 10, 10)
        a[15:18, 43:46] = (60, 20, 16)
    stamp(a, text57('220V'), 32, 50, (210, 200, 160), shadow=(20, 20, 20), center=True)
    return grain(a, rng, 2)


@texture('CTSOCK1', 64, 64, allow=('grey', 'brown', 'dark', 'yellow', 'red', 'green'))
def t_sock1(rng):
    return socket_panel(rng, False)


@texture('CTSOCK2', 64, 64, allow=('grey', 'brown', 'dark', 'yellow', 'red', 'green'))
def t_sock2(rng):
    return socket_panel(seed('CTSOCK1'), True)


def radio_panel(rng, on):
    a = panel_bg(rng)
    box(a, 3, 8, 61, 58, (78, 86, 60), rng)          # olive drab military set
    a[10:14, 5:59] = (52, 58, 40)
    # display window
    a[16:28, 8:40] = (20, 24, 18)
    if on:
        a[17:27, 9:39] = (30, 80, 30)
        stamp(a, text57('121.5'), 24, 19, (140, 255, 110), center=True)
        a = glow(a, 24, 22, 20, (10, 60, 10), 0.6)
    edge_shade(a, 8, 16, 40, 28, 0.6, 1.3)
    # speaker grille
    for y in range(16, 28, 2):
        a[y, 44:58] = (30, 32, 26)
    # knobs, lamp, handset jack
    for cx in (12, 24, 36):
        disc(a, cx, 42, 5, (36, 36, 34), ring=(20, 20, 20))
        a[38:41, cx] = (200, 200, 190)
    disc(a, 50, 42, 3, (255, 60, 30) if on else (70, 20, 14), ring=(20, 20, 20))
    if on:
        a = glow(a, 50, 42, 9, (120, 30, 10), 0.8)
    stamp(a, text57('PWR'), 50, 49, (210, 200, 160), center=True)
    a[52:56, 6:30] = (40, 42, 34)
    return grain(a, rng, 2)


@texture('CTRADI1', 64, 64, allow=('grey', 'brown', 'dark', 'olive', 'green', 'red', 'orange', 'yellow'))
def t_radi1(rng):
    return radio_panel(rng, False)


@texture('CTRADI2', 64, 64, allow=('grey', 'brown', 'dark', 'olive', 'green', 'red', 'orange', 'yellow'))
def t_radi2(rng):
    return radio_panel(seed('CTRADI1'), True)


def bars_bg(rng, size=64):
    """Steel bar gate close-up (the weld gate) as a backdrop for the lock."""
    a = np.zeros((size, size, 3), np.float32) + (20, 20, 22)
    for x in range(2, size - 5, 12):
        a[:, x:x + 6] = (84, 80, 76)
        a[:, x] *= 1.4
        a[:, x + 5] *= 0.6
    a[50:56, :] = (84, 80, 76)
    a[50, :] *= 1.4
    a[55, :] *= 0.6
    n = resize(photo(acg('Rust009')), size, size, wrap=True)
    a = mix(a, a * (n / n.mean(axis=(0, 1))) * 0.9, 0.5)
    return a


def chain_links(a, pts, color=(150, 150, 146)):
    for i, (x, y) in enumerate(pts):
        x, y = int(x), int(y)
        if i % 2 == 0:
            a[y - 1:y + 2, x - 2:x + 3] = color
            a[y, x - 1:x + 2] = (30, 30, 30)
        else:
            a[y - 2:y + 3, x - 1:x + 2] = np.array(color, np.float32) * 0.8
            a[y - 1:y + 2, x] = (30, 30, 30)
    return a


@texture('CTPADL1', 64, 64, allow=('grey', 'brown', 'dark', 'yellow', 'orange'))
def t_padl1(rng):
    a = bars_bg(rng)
    pts = [(x, 24 + 2 * math.sin(x / 5)) for x in range(0, 64, 3)]
    chain_links(a, pts)
    # brass padlock hanging from the chain
    a[26:30, 27:29] = (170, 170, 166)
    a[26:30, 35:37] = (170, 170, 166)
    a[25:27, 27:37] = (170, 170, 166)
    box(a, 24, 30, 40, 46, (190, 150, 50), rng)
    a[36:40, 31:33] = (40, 30, 10)
    return grain(a, rng, 2)


@texture('CTPADL2', 64, 64, allow=('grey', 'brown', 'dark', 'yellow', 'orange'))
def t_padl2(rng):
    a = bars_bg(seed('CTPADL1'))
    # cut chain ends hanging, padlock gone; glowing cut marks
    pts = [(x, 24 + 2 * math.sin(x / 5)) for x in range(0, 22, 3)]
    pts += [(22 + i, 27 + i * 2.5) for i in range(0, 6, 1)]
    chain_links(a, pts)
    pts2 = [(x, 24 + 2 * math.sin(x / 5)) for x in range(42, 64, 3)]
    pts2 += [(41 - i, 27 + i * 2.5) for i in range(0, 6, 1)]
    chain_links(a, pts2)
    for (x, y) in ((27, 40), (36, 40)):
        a[y:y + 2, x:x + 2] = (255, 160, 40)
        a = glow(a, x, y, 5, (160, 60, 0), 0.7)
    a[58:62, 26:38] = (190, 150, 50)          # lock lying at the bottom
    return grain(a, rng, 2)


@texture('CTCRNK1', 64, 64, allow=('grey', 'brown', 'dark', 'red', 'yellow'))
def t_crnk1(rng):
    a = panel_bg(rng)
    box(a, 26, 30, 38, 64, (80, 80, 76), rng)       # post / gearbox
    box(a, 20, 22, 44, 36, (90, 88, 82), rng)
    yy, xx = np.mgrid[0:64, 0:64].astype(np.float32)
    cx, cy = 32, 26
    d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
    ang = np.arctan2(yy - cy, xx - cx)
    rim = (d < 19) & (d > 15.5)
    spokes = (d < 16) & (np.abs(((ang * 5 / (2 * math.pi)) % 1) - 0.5) > 0.42)
    hub = d < 4.5
    wheel = rim | spokes | hub
    col = np.array((170, 32, 24), np.float32)
    shade = (1 + 0.35 * -np.sin(ang + 0.8))[..., None]
    a = drop_shadow(a, wheel, 2, 2, 0.5, wrap=False)
    a[wheel] = (col[None] * shade[wheel])
    a[hub] = (150, 150, 146)
    disc(a, cx + 13, cy - 11, 2.5, (40, 40, 40), hl=False)    # handle knob
    return grain(a, rng, 2)


@texture('CTDARK1', 64, 64, allow=('dark',) + tuple(range(104, 112)))
def t_dark1(rng):
    a = mat_concrete(64, 64, rng, 'Concrete031', 1, (22, 22, 20), contrast=0.6)
    return a


# ---------------------------------------------------------------------------
# Masked textures (fences, gates, boards, glass, railing, scaffold). Each
# returns (rgb, mask) with mask True where opaque. They read the same from
# both sides: no one-sided shadows across holes.
# ---------------------------------------------------------------------------

def tube_h(a, m, y0, d, x0, x1, color):
    """Horizontal round tube."""
    t = (np.arange(d, dtype=np.float32) + 0.5) / d * 2 - 1
    sh = np.clip(0.6 + 0.6 * np.sqrt(np.clip(1 - t * t, 0, 1)) - 0.3 * t, 0.3, 1.4)
    a[y0:y0 + d, x0:x1] = np.array(color, np.float32)[None, None] * sh[:, None, None]
    m[y0:y0 + d, x0:x1] = True


def tube_v(a, m, x0, d, y0, y1, color):
    t = (np.arange(d, dtype=np.float32) + 0.5) / d * 2 - 1
    sh = np.clip(0.6 + 0.6 * np.sqrt(np.clip(1 - t * t, 0, 1)) - 0.3 * t, 0.3, 1.4)
    a[y0:y1, x0:x0 + d] = np.array(color, np.float32)[None, None] * sh[None, :, None]
    m[y0:y1, x0:x0 + d] = True


def line_mask(h, w, x0, y0, x1, y1, width):
    """Pixels within width/2 of a segment; also returns (along, perp)."""
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32) + 0.5
    dx, dy = x1 - x0, y1 - y0
    L = math.hypot(dx, dy) or 1.0
    ux, uy = dx / L, dy / L
    along = (xx - x0) * ux + (yy - y0) * uy
    perp = -(xx - x0) * uy + (yy - y0) * ux
    m = (np.abs(perp) <= width / 2) & (along >= 0) & (along <= L)
    return m, along, perp


def chainlink(h, w, rng, color=(150, 152, 148), period=8):
    """Diamond mesh: two wire directions, alternating over/under."""
    a = np.zeros((h, w, 3), np.float32)
    m = np.zeros((h, w), bool)
    yy, xx = np.mgrid[0:h, 0:w]
    d1 = ((xx + yy) % period) == 0
    d2 = ((xx - yy) % period) == 0
    m |= d1 | d2
    c = np.array(color, np.float32)
    n = 1 + 0.12 * fnoise(h, w, rng, 1.0)
    a[d1] = c * 1.1
    a[d2] = c * 0.78
    over = ((xx // period + yy // period) % 2) == 0
    a[d1 & d2 & over] = c * 1.25
    a[d1 & d2 & ~over] = c * 0.65
    a *= n[..., None]
    return a, m


@texture('CTFENC1', 128, 128, allow=('grey', 'dark', 'brown'))
def t_fenc1(rng):
    a, m = chainlink(128, 128, rng)
    tube_h(a, m, 0, 4, 0, 128, (150, 150, 146))        # top rail
    a[126:128] = (110, 110, 106)
    m[126:128] = True                                 # bottom tension wire
    tube_v(a, m, 0, 5, 0, 128, (140, 140, 136))        # line post
    for y in (12, 60, 108):                           # post clamps
        a[y:y + 3, 0:7] = (90, 90, 86)
        m[y:y + 3, 0:7] = True
    a = mix(a, a * np.array([1.0, 0.75, 0.55], np.float32), smoothstep(1.2, 2.4, fnoise(128, 128, rng, 1.2)) * 0.6)
    return a, m


def gate_leaves(rng, x_ranges, frame=(130, 130, 126)):
    a, m = chainlink(128, 128, rng)
    keep = np.zeros((128, 128), bool)
    for x0, x1 in x_ranges:
        keep[6:122, x0:x1] = True
    m &= keep
    for x0, x1 in x_ranges:
        tube_h(a, m, 4, 4, x0, x1, frame)
        tube_h(a, m, 120, 4, x0, x1, frame)
        tube_h(a, m, 62, 3, x0, x1, frame)
        tube_v(a, m, x0, 4, 4, 124, frame)
        tube_v(a, m, x1 - 4, 4, 4, 124, frame)
    return a, m


@texture('CTGATE1', 128, 128, allow=('grey', 'dark', 'brown', 'yellow', 'red'))
def t_gate1(rng):
    a, m = gate_leaves(rng, ((2, 63), (65, 126)))
    # hinges on the outer uprights
    for y in (16, 100):
        for x in (0, 125):
            a[y:y + 6, x:x + 3] = (80, 80, 76)
            m[y:y + 6, x:x + 3] = True
    # chain wound round both inner uprights, padlock hanging below
    pts = []
    for k in range(10):
        t = k / 9.0
        pts.append((56 + 16 * t, 56 + 6 * math.sin(t * math.pi * 3)))
    for i, (x, y) in enumerate(pts):
        x, y = int(x), int(y)
        if i % 2 == 0:
            a[y - 1:y + 2, x - 2:x + 3] = (170, 170, 166)
            a[y, x - 1:x + 2] = (40, 40, 40)
            m[y - 1:y + 2, x - 2:x + 3] = True
        else:
            a[y - 2:y + 3, x - 1:x + 2] = (130, 130, 126)
            m[y - 2:y + 3, x - 1:x + 2] = True
    a[64:68, 62:63] = (170, 170, 166); a[64:68, 67:68] = (170, 170, 166); a[63, 62:68] = (170, 170, 166)
    m[63:68, 62:68] |= a[63:68, 62:68].sum(axis=2) > 0
    box(a, 60, 68, 70, 78, (190, 150, 50), None)
    m[68:78, 60:70] = True
    a[72:75, 64:66] = (40, 30, 10)
    # "NO ENTRY" sign wired to the left leaf
    a[28:48, 16:46] = (220, 216, 206)
    m[28:48, 16:46] = True
    a[28, 16:46] *= 0.7
    a[47, 16:46] *= 0.6
    stamp(a, text57('KEEP'), 31, 30, (190, 20, 16), center=True)
    stamp(a, text57('OUT'), 31, 39, (190, 20, 16), center=True)
    return a, m


@texture('CTGATE2', 128, 128, allow=('grey', 'dark', 'brown', 'yellow'))
def t_gate2(rng):
    """Chain cut, leaves swung open: just the leaf edges at the sides and
    the cut chain on the ground."""
    a, m = gate_leaves(rng, ((2, 20), (108, 126)))
    for x0 in (2, 108):                           # swung leaves look narrower, darker
        a[:, x0:x0 + 18] *= 0.8
    for y in (16, 100):
        for x in (0, 125):
            a[y:y + 6, x:x + 3] = (80, 80, 76)
            m[y:y + 6, x:x + 3] = True
    # cut chain hanging from the right leaf and a few links on the ground
    for i, y in enumerate(range(58, 84, 3)):
        x = 106 - (i % 2)
        a[y:y + 3, x - 1:x + 2] = (160, 160, 156)
        a[y + 1, x] = (40, 40, 40)
        m[y:y + 3, x - 1:x + 2] = True
    for i, x in enumerate(range(48, 80, 4)):
        y = 124 + (i % 2)
        a[y - 1:y + 2, x:x + 3] = (150, 150, 146)
        m[y - 1:y + 2, x:x + 3] = True
    a[121:126, 58:66] = (190, 150, 50)            # dropped padlock
    m[121:126, 58:66] = True
    return a, m


@texture('CTGATE3', 128, 128, allow=('grey', 'dark', 'brown', 'tandark'))
def t_gate3(rng):
    a = np.zeros((128, 128, 3), np.float32)
    m = np.zeros((128, 128), bool)
    steel = np.array((96, 90, 84), np.float32)
    rust = resize(photo(acg('Rust009')), 128, 128, wrap=True)
    rn = lum(rust) / lum(rust).mean()
    for x in range(5, 128, 16):                       # square bars
        a[:, x:x + 5] = steel
        a[:, x] *= 1.35
        a[:, x + 1] *= 1.1
        a[:, x + 4] *= 0.55
        m[:, x:x + 5] = True
    for y0 in (2, 60, 116):                            # flat rails
        a[y0:y0 + 8, :] = steel * 0.95
        a[y0, :] *= 1.4
        a[y0 + 7, :] *= 0.5
        m[y0:y0 + 8, :] = True
        for x in range(6, 128, 16):                    # bolts
            a[y0 + 3:y0 + 5, x:x + 2] = (140, 136, 128)
    rmask = smoothstep(0.9, 2.0, fnoise(128, 128, rng, 1.3)) + 0.4 * streaks(128, 128, rng, 0.8, 1.0)
    a = mix(a, a * np.array([1.05, 0.7, 0.5], np.float32) * rn[..., None], np.clip(rmask, 0, 0.8))
    return a, m


def plank(a, m, wood, x0, y0, x1, y1, width, rng, nails=True, broken=None):
    """Draw a nailed plank between two points. broken='start'/'end' gives
    that end a jagged snapped edge."""
    h, w = m.shape
    pm, along, perp = line_mask(h, w, x0, y0, x1, y1, width)
    L = math.hypot(x1 - x0, y1 - y0)
    if broken:
        jag = (np.sin(perp * 2.7 + rng.uniform(0, 6)) * 2.5 + np.sin(perp * 1.1) * 3)
        if broken in ('end', 'both'):
            pm &= along <= L - 6 + jag
        if broken in ('start', 'both'):
            pm &= along >= 6 + jag
    th, tw = wood.shape[:2]
    u = (along.astype(int) + int(rng.integers(0, tw))) % tw
    v = ((perp + width / 2) / width * (th // 4 - 1)).astype(int).clip(0, th // 4 - 1) + int(rng.integers(0, 3)) * (th // 4)
    col = wood[v, u] * (1 + rng.normal(0, 0.06))
    edge = np.where(perp < -width / 2 + 1.2, 1.3, np.where(perp > width / 2 - 1.2, 0.55, 1.0))
    col = col * edge[..., None]
    a[pm] = col[pm]
    m |= pm
    if nails:
        for t in (5, L - 5):
            for s in (-width / 4, width / 4):
                nx = x0 + (x1 - x0) / L * t - (y1 - y0) / L * s
                ny = y0 + (y1 - y0) / L * t + (x1 - x0) / L * s
                xi, yi = int(nx), int(ny)
                if 0 <= xi < w - 1 and 0 <= yi < h - 1 and pm[yi, xi]:
                    a[yi, xi] = (40, 36, 32)
                    a[yi, xi + 1] = (120, 116, 108)
    return pm


def wood_strip(rng, color=(128, 112, 92)):
    src = photo(acg('Planks023A'))
    a = resize(src, 256, 256, wrap=True)
    a = delight(a, 30, 0.8)
    L = lum(a)
    L = (L - L.mean()) * 1.6 + 128
    return np.clip(np.array(color, np.float32)[None, None] * (L / 128)[..., None], 0, 255)


@texture('CTBORD1', 64, 128, allow=('brown', 'tandark', 'grey', 'dark'))
def t_bord1(rng):
    a = np.zeros((128, 64, 3), np.float32)
    m = np.zeros((128, 64), bool)
    wood = wood_strip(rng)
    plank(a, m, wood, -4, 20, 68, 26, 14, rng)
    plank(a, m, wood, -4, 58, 68, 50, 15, rng)
    plank(a, m, wood, -4, 92, 68, 100, 14, rng)
    plank(a, m, wood, 4, 4, 60, 124, 12, rng)
    return a, m


@texture('CTBORD2', 128, 128, allow=('brown', 'tandark', 'grey', 'dark'))
def t_bord2(rng):
    a = np.zeros((128, 128, 3), np.float32)
    m = np.zeros((128, 128), bool)
    wood = wood_strip(rng, (118, 100, 80))
    y = 2
    while y < 124:
        wdt = int(rng.integers(14, 19))
        tilt = rng.uniform(-3, 3)
        plank(a, m, wood, -4, y + wdt / 2 - tilt, 132, y + wdt / 2 + tilt, wdt, rng)
        y += wdt + int(rng.integers(1, 5))
    plank(a, m, wood, 8, 126, 120, 2, 16, rng)               # diagonal brace
    plank(a, m, wood, 16, -4, 16, 132, 14, rng)               # uprights
    plank(a, m, wood, 112, -4, 112, 132, 14, rng)
    return a, m


@texture('CTBORD3', 64, 128, allow=('brown', 'tandark', 'grey', 'dark'))
def t_bord3(rng):
    a = np.zeros((128, 64, 3), np.float32)
    m = np.zeros((128, 64), bool)
    wood = wood_strip(seed('CTBORD1'))
    plank(a, m, wood, -4, 20, 22, 21, 14, rng, broken='end')
    plank(a, m, wood, 68, 23, 46, 25, 14, rng, broken='end')
    plank(a, m, wood, -4, 58, 16, 57, 15, rng, broken='end')
    plank(a, m, wood, 68, 50, 50, 51, 15, rng, broken='end')
    plank(a, m, wood, -4, 92, 12, 93, 14, rng, broken='end')
    plank(a, m, wood, 4, 4, 14, 26, 12, rng, broken='end')
    # bent nails left in the frame
    for (x, y) in ((30, 98), (34, 99), (40, 52)):
        a[y, x:x + 2] = (90, 86, 80)
        m[y, x:x + 2] = True
    return a, m


@texture('CTGLAS1', 64, 128, allow=('grey', 'dark', 'blue'))
def t_glas1(rng):
    """Window glass: transparent, with a bright edge, a few reflection
    glints and grime in the corners."""
    a = np.zeros((128, 64, 3), np.float32) + (150, 160, 176)
    m = np.zeros((128, 64), bool)
    m[0, :] = m[-1, :] = True
    m[:, 0] = m[:, -1] = True
    a[0, :] = a[:, 0] = (190, 196, 206)
    yy, xx = np.mgrid[0:128, 0:64]
    for c0, wdt in ((40, 3), (52, 1), (104, 2)):
        band = (np.abs((xx + yy * 0.6) - c0) < wdt / 2 + 0.5) & ((xx + yy) % 2 == 0)
        m |= band & (xx > 1) & (xx < 62)
    for (cx, cy) in ((2, 126), (61, 126)):
        corner = ((xx - cx) ** 2 + (yy - cy) ** 2 < 20) & ((xx * 7 + yy * 3) % 3 == 0)
        m |= corner
        a[corner] = (90, 92, 88)
    return a, m


@texture('CTGLAS2', 64, 128, allow=('grey', 'dark', 'blue'))
def t_glas2(rng):
    """Shattered pane: jagged shards still stuck in the frame."""
    a = np.zeros((128, 64, 3), np.float32)
    m = np.zeros((128, 64), bool)
    yy, xx = np.mgrid[0:128, 0:64].astype(np.float32)
    # shards: triangles anchored on the frame edges
    shards = []
    for side in range(4):
        for _ in range(int(rng.integers(2, 4))):
            if side == 0:
                p0 = (rng.uniform(0, 50), 0)
                base = (p0[0] + rng.uniform(8, 20), 0)
            elif side == 1:
                p0 = (rng.uniform(0, 50), 128)
                base = (p0[0] + rng.uniform(8, 20), 128)
            elif side == 2:
                p0 = (0, rng.uniform(0, 110))
                base = (0, p0[1] + rng.uniform(10, 26))
            else:
                p0 = (64, rng.uniform(0, 110))
                base = (64, p0[1] + rng.uniform(10, 26))
            mid = ((p0[0] + base[0]) / 2, (p0[1] + base[1]) / 2)
            ln = rng.uniform(10, 34)
            dx, dy = 32 - mid[0], 64 - mid[1]
            dl = math.hypot(dx, dy) or 1
            tip = (mid[0] + dx / dl * ln + rng.uniform(-6, 6), mid[1] + dy / dl * ln + rng.uniform(-6, 6))
            shards.append((p0, base, tip))
    for (p0, p1, p2) in shards:
        def side_(ax, ay, bx, by):
            return (xx - ax) * (by - ay) - (yy - ay) * (bx - ax)
        s1 = side_(*p0, *p1)
        s2 = side_(*p1, *p2)
        s3 = side_(*p2, *p0)
        inside = ((s1 >= 0) & (s2 >= 0) & (s3 >= 0)) | ((s1 <= 0) & (s2 <= 0) & (s3 <= 0))
        m |= inside
        a[inside] = (96, 104, 116)
        edge = inside & ~(np.roll(inside, 1, 0) & np.roll(inside, -1, 0) & np.roll(inside, 1, 1) & np.roll(inside, -1, 1))
        a[edge] = (200, 206, 214)
    a[m] *= (1 + 0.1 * fnoise(128, 64, rng, 1.0))[m][:, None]
    m[0, :] = m[-1, :] = True
    m[:, 0] = m[:, -1] = True
    a[0, :] = a[-1, :] = (120, 120, 120)
    a[:, 0] = a[:, -1] = (120, 120, 120)
    return a, m


@texture('CTRAIL1', 64, 32, allow=('grey', 'dark', 'brown'))
def t_rail1(rng):
    a = np.zeros((32, 64, 3), np.float32)
    m = np.zeros((32, 64), bool)
    col = (64, 64, 62)
    tube_h(a, m, 0, 4, 0, 64, col)
    tube_h(a, m, 27, 3, 0, 64, col)
    for x in range(3, 64, 8):
        tube_v(a, m, x, 2, 4, 27, col)
    tube_v(a, m, 30, 4, 0, 32, col)            # post
    return a, m


@texture('CTSCAF1', 128, 128, allow=('grey', 'dark', 'brown', 'tandark', 'yellow'))
def t_scaf1(rng):
    a = np.zeros((128, 128, 3), np.float32)
    m = np.zeros((128, 128), bool)
    steel = (150, 152, 148)
    for x in (2, 66):
        tube_v(a, m, x, 5, 0, 128, steel)                   # standards
    for y in (2, 66):
        tube_h(a, m, y, 4, 0, 128, steel)                   # ledgers
    pm, along, perp = line_mask(128, 128, 7, 124, 64, 70, 4)
    a[pm] = np.array(steel, np.float32) * np.where(perp[pm] < 0, 1.15, 0.7)[:, None]
    m |= pm
    pm, along, perp = line_mask(128, 128, 71, 60, 126, 6, 4)
    a[pm] = np.array(steel, np.float32) * np.where(perp[pm] < 0, 1.15, 0.7)[:, None]
    m |= pm
    # couplers at joints
    for x in (2, 66):
        for y in (2, 66):
            a[y - 1:y + 6, x - 1:x + 7] = (90, 90, 86)
            m[y - 1:y + 6, x - 1:x + 7] = True
    # scaffold boards and toe board on the upper lift
    wood = wood_strip(rng, (150, 124, 84))
    plank(a, m, wood, 0, 61, 128, 61, 8, rng, nails=False)
    plank(a, m, wood, 0, 125, 128, 125, 6, rng, nails=False)
    return a, m


# ---------------------------------------------------------------------------
# Neon and lit signs (CTN*: fullbright in the engine)
# ---------------------------------------------------------------------------

def neon_bg(w, h, rng, color=(26, 24, 24)):
    a = mat_concrete(w, h, rng, 'Metal041B', 1, color, contrast=0.5)
    a[0, :] *= 1.6
    a[:, 0] *= 1.4
    a[-1, :] *= 0.5
    a[:, -1] *= 0.5
    return a


def neon(a, m, color, core=0.55, halo=3.0, halo_k=0.9):
    """Light a coverage mask as neon tubing: soft halo, saturated tube,
    near-white core."""
    c = np.array(color, np.float32)
    g = blur(m, halo, wrap=False)
    a = a + (g / max(g.max(), 1e-3))[..., None] * c[None, None] * halo_k * 0.55
    tube = sharp_mask(m, 0.3, 0.6)
    a = mix(a, np.ones_like(a) * c, tube)
    inner = sharp_mask(blur(m, 0.8, wrap=False), 0.75, 0.95)
    a = mix(a, np.ones_like(a) * np.minimum(c * 0.45 + 150, 255), inner * core)
    return np.clip(a, 0, 255)


def outline_mask(m, r=1):
    """Hollow letters: neon tubes follow letter outlines."""
    return np.clip(dilate(m, r) - m, 0, 1)


def text_mask(text, w, h, key='oswald', spacing=0):
    m = ttf_mask(text, key, 64, ss=2, spacing=spacing)
    return fit_mask(m, w, h)


def border_tube(w, h, inset=2):
    m = np.zeros((h, w), np.float32)
    m[inset, inset:w - inset] = 1
    m[h - 1 - inset, inset:w - inset] = 1
    m[inset:h - inset, inset] = 1
    m[inset:h - inset, w - 1 - inset] = 1
    return m


def place(m, w, h, cx=None, cy=None):
    out = np.zeros((h, w), np.float32)
    mh, mw = m.shape
    cx = w // 2 if cx is None else cx
    cy = h // 2 if cy is None else cy
    x0, y0 = cx - mw // 2, cy - mh // 2
    out[max(0, y0):y0 + mh, max(0, x0):x0 + mw] = m[max(0, -y0):max(0, -y0) + min(h, y0 + mh) - max(0, y0),
                                                   max(0, -x0):max(0, -x0) + min(w, x0 + mw) - max(0, x0)]
    return out


NEON = dict(red=(255, 40, 30), gold=(255, 200, 60), green=(70, 255, 80), blue=(110, 110, 255),
            pink=(255, 110, 150), white=(255, 250, 230), orange=(255, 140, 30))
NEON_ALLOW = ('dark', 'grey', 'red', 'brightred', 'yellow', 'orange', 'green', 'brown', 'blue')


@texture('CTNSG1', 32, 128, allow=NEON_ALLOW)
def t_nsg1(rng):
    """Vertical blade sign: 金龍酒家 (Golden Dragon restaurant)."""
    a = neon_bg(32, 128, rng)
    m = ttf_mask('金龍酒家', 'notoserif', 64, ss=2, vertical=True, spacing=10)
    m = place(fit_mask(m, 24, 116), 32, 128)
    a = neon(a, m, NEON['red'])
    a = neon(a, border_tube(32, 128, 1), NEON['gold'], halo=1.5, halo_k=0.5)
    return a


@texture('CTNSG2', 128, 32, allow=NEON_ALLOW)
def t_nsg2(rng):
    """Horizontal sign: 海鮮酒家 (seafood restaurant)."""
    a = neon_bg(128, 32, rng)
    m = place(fit_mask(ttf_mask('海鮮酒家', 'notoserif', 64, ss=2), 112, 24), 128, 32)
    a = neon(a, m, NEON['red'])
    a = neon(a, border_tube(128, 32, 1), NEON['green'], halo=1.5, halo_k=0.5)
    return a


@texture('CTNSG3', 128, 32, allow=NEON_ALLOW)
def t_nsg3(rng):
    a = neon_bg(128, 32, rng)
    m = place(text_mask('GUN SHOP', 104, 22, spacing=2), 128, 32)
    a = neon(a, m, NEON['red'])
    a = neon(a, border_tube(128, 32, 1), NEON['orange'], halo=1.5, halo_k=0.4)
    return a


@texture('CTNSG4', 128, 32, allow=NEON_ALLOW)
def t_nsg4(rng):
    """MARKET with 市場 (market)."""
    a = neon_bg(128, 32, rng)
    cj = place(fit_mask(ttf_mask('市場', 'notoserif', 64, ss=2), 44, 24), 128, 32, cx=27)
    en = place(text_mask('MARKET', 70, 20, spacing=2), 128, 32, cx=89)
    a = neon(a, cj, NEON['gold'])
    a = neon(a, en, NEON['green'])
    a = neon(a, border_tube(128, 32, 1), NEON['red'], halo=1.5, halo_k=0.4)
    return a


@texture('CTNSG5', 128, 32, allow=NEON_ALLOW)
def t_nsg5(rng):
    """Subway entrance sign: white lettering on a black band, green lamps."""
    a = np.zeros((32, 128, 3), np.float32) + (14, 14, 14)
    a[0:2] = (90, 90, 88)
    a[30:32] = (60, 60, 58)
    m = place(text_mask('SUBWAY', 84, 20, key='oswald', spacing=3), 128, 32)
    a = neon(a, m, NEON['white'], core=0.8, halo=2.0, halo_k=0.4)
    for cx in (10, 117):
        disc(a, cx, 16, 6, (80, 255, 90), ring=(20, 60, 20), hl=False)
        a = glow(a, cx, 16, 12, (30, 140, 40), 0.7)
        a[13:15, cx - 2:cx] = (220, 255, 220)
    return np.clip(a, 0, 255)


@texture('CTNSG6', 128, 32, allow=NEON_ALLOW)
def t_nsg6(rng):
    a = neon_bg(128, 32, rng, (30, 30, 34))
    m = place(text_mask('AUTO REPAIR', 116, 20, spacing=1), 128, 32)
    a = neon(a, m, NEON['gold'])
    a = neon(a, border_tube(128, 32, 1), NEON['blue'], halo=1.5, halo_k=0.5)
    return a


@texture('CTNSG7', 64, 128, allow=NEON_ALLOW)
def t_nsg7(rng):
    """MOTEL pole sign: stacked letters, VACANCY below."""
    a = neon_bg(64, 128, rng, (34, 30, 28))
    rows = []
    for i, ch in enumerate('MOTEL'):
        m = place(fit_mask(ttf_mask(ch, 'oswald', 64, ss=2), 30, 17), 64, 128, cx=32, cy=12 + i * 20)
        rows.append(m)
    a = neon(a, np.maximum.reduce(rows), NEON['red'])
    vac = text57('VACANCY')
    vm = np.zeros((128, 64), np.float32)
    vm[110:117, 32 - vac.shape[1] // 2:32 - vac.shape[1] // 2 + vac.shape[1]] = vac
    a = neon(a, vm, NEON['green'], core=0.3, halo=1.5, halo_k=0.6)
    bt = border_tube(64, 128, 2)
    bt[104, 2:62] = 1
    a = neon(a, bt, NEON['gold'], halo=1.5, halo_k=0.5)
    return a


@texture('CTNSG8', 128, 32, allow=NEON_ALLOW)
def t_nsg8(rng):
    a = neon_bg(128, 32, rng)
    m = place(text_mask('LAUNDROMAT', 120, 20, spacing=1), 128, 32)
    a = neon(a, m, NEON['blue'])
    a = neon(a, border_tube(128, 32, 1), NEON['pink'], halo=1.5, halo_k=0.5)
    return a


@texture('CTNSG9', 64, 64, allow=NEON_ALLOW)
def t_nsg9(rng):
    """Pharmacy: green cross over DRUGS."""
    a = neon_bg(64, 64, rng)
    m = np.zeros((64, 64), np.float32)
    m[6:38, 26:38] = 1
    m[16:28, 16:48] = 1
    a = neon(a, outline_mask(m, 1) + 0.0, NEON['green'], halo=3, halo_k=1.0)
    a = mix(a, np.ones_like(a) * (20, 110, 30), m * 0.8)
    t = place(text_mask('DRUGS', 52, 14, spacing=2), 64, 64, cy=51)
    a = neon(a, t, NEON['red'])
    return a


# ---------------------------------------------------------------------------
# Storefronts: frame + display window (dark glass, a hint of the interior)
# + door + sign band with Chinese characters and a small English line.
# ---------------------------------------------------------------------------

def interior(kind, h, w, rng):
    """What you'd glimpse through the window at night (pre-glass)."""
    a = np.zeros((h, w, 3), np.float32) + (34, 30, 28)
    yy, xx = np.mgrid[0:h, 0:w]
    if kind == 'restaurant':
        a[:] = (54, 36, 30)
        a[2:4, :] = (120, 110, 90)                       # rail with roast ducks
        for x in range(4, w - 6, 9):
            hh = int(rng.integers(12, 17))
            for y in range(4, 4 + hh):
                half = int(3 * math.sin(math.pi * (y - 4) / hh) + 1)
                a[y, x + 3 - half:x + 3 + half] = (176, 84, 30) if y % 3 else (150, 64, 22)
            a[4:6, x + 2:x + 4] = (90, 40, 16)
        a[h - 22:h - 12, 4:22] = (220, 210, 170)          # menu card
        for y in range(h - 20, h - 13, 2):
            a[y, 6:20] = (120, 30, 20)
        a[h - 10:, :] = (70, 50, 40)                     # counter
    elif kind == 'grocery':
        for y0 in range(2, h - 20, 11):                  # shelves of packaged goods
            a[y0 + 9:y0 + 11, :] = (90, 80, 66)
            for x in range(0, w, 4):
                c = rng.choice([(170, 40, 30), (200, 170, 40), (60, 120, 50), (200, 200, 190), (70, 70, 140)])
                a[y0 + 2 + int(rng.integers(0, 3)):y0 + 9, x:x + 3] = c
    elif kind == 'herbal':
        a[:] = (60, 40, 26)
        for y0 in range(2, h - 14, 8):                   # apothecary drawers
            for x0 in range(2, w - 8, 10):
                a[y0:y0 + 7, x0:x0 + 9] = (110, 70, 40)
                a[y0, x0:x0 + 9] = (140, 96, 56)
                a[y0 + 6, x0:x0 + 9] = (60, 36, 20)
                a[y0 + 3, x0 + 3:x0 + 6] = (200, 170, 80)  # brass pulls
        for x in range(4, w - 6, 10):                    # jars on the counter
            a[h - 12:h - 4, x:x + 6] = (150, 160, 140)
            a[h - 13, x + 1:x + 5] = (180, 40, 30)
        a[h - 4:, :] = (80, 50, 30)
    elif kind == 'bakery':
        a[:] = (70, 60, 50)
        for y0 in (6, 22, 38):                           # display case shelves
            if y0 + 12 > h:
                break
            a[y0 + 10:y0 + 12, :] = (180, 180, 170)
            for x in range(3, w - 8, 10):
                d = (xx - (x + 4)) ** 2 + ((yy - (y0 + 6)) * 1.6) ** 2
                a[d < 16] = (214, 150, 60)
                a[(d < 16) & (d > 8)] = (170, 100, 34)
        a[h - 14:, :] = (150, 140, 120)
    elif kind == 'jewelry':
        a[:] = (40, 10, 12)                               # dark red velvet
        for y0 in range(4, h - 10, 14):
            a[y0 + 10:y0 + 12, :] = (150, 140, 120)
            for _ in range(10):
                x, y = int(rng.integers(1, w - 2)), int(rng.integers(y0 + 2, y0 + 9))
                c = (255, 220, 100) if rng.random() < 0.6 else (230, 230, 240)
                a[y, x] = c
                if rng.random() < 0.5:
                    a[y, x - 1:x + 2] = np.array(c) * 0.6
                    a[y, x] = c
    elif kind == 'electronics':
        a[:] = (26, 28, 34)
        for y0 in range(2, h - 16, 16):                  # stacked TVs
            for x0 in range(2, w - 14, 16):
                a[y0:y0 + 14, x0:x0 + 14] = (40, 40, 44)
                lit = rng.random() < 0.55
                a[y0 + 2:y0 + 11, x0 + 2:x0 + 12] = (90, 110, 170) if lit else (16, 18, 22)
                if lit:
                    a[y0 + 4:y0 + 6, x0 + 3:x0 + 9] = (180, 200, 230)
        a[h - 12:, :] = (60, 60, 64)
    return a


def shop_glass(inner, rng, dark=0.6):
    h, w = inner.shape[:2]
    g = glass(h, w, rng, 'dark', refl=0.8)
    return np.clip(inner * dark + g * (1 - dark) * 1.3, 0, 255)


def awning(a, rng, y0, hgt, c1, c2, x0=0, x1=128):
    for x in range(x0, x1):
        c = c1 if ((x - x0) // 8) % 2 == 0 else c2
        a[y0:y0 + hgt, x] = c
    a[y0:y0 + hgt] *= np.linspace(1.15, 0.8, hgt)[:, None, None]
    # scalloped valance
    for x in range(x0, x1):
        k = int(2.5 * abs(math.sin((x - x0) * math.pi / 8)))
        c = c1 if ((x - x0) // 8) % 2 == 0 else c2
        a[y0 + hgt:y0 + hgt + 3 - k, x] = np.array(c, np.float32) * 0.75
        a[y0 + hgt + 3 - k:y0 + hgt + 5 - k, x] *= 0.45   # shadow under the valance
    return a


SHOPS = {
    'CTSHOP1': dict(zh='中華餐館', en='RESTAURANT', key='notoserif', sign=(150, 20, 16), ink=(250, 206, 80),
                    frame=(120, 24, 18), kind='restaurant', door='right'),
    'CTSHOP2': dict(zh='東方雜貨', en='GROCERY', key='notoserif', sign=(32, 96, 46), ink=(240, 236, 220),
                    frame=(40, 80, 46), kind='grocery', door='left', awning=((40, 110, 50), (220, 220, 210))),
    'CTSHOP3': dict(zh='中藥行', en='HERBS', key='kai', sign=(28, 22, 18), ink=(236, 190, 70),
                    frame=(90, 58, 32), kind='herbal', door='right'),
    'CTSHOP4': dict(zh='金鳳餅家', en='BAKERY', key='kai', sign=(226, 214, 180), ink=(176, 20, 16),
                    frame=(190, 120, 50), kind='bakery', door='left', awning=((180, 30, 24), (230, 226, 210))),
    'CTSHOP5': dict(zh='珠寶金行', en='JEWELRY', key='notoserif', sign=(170, 16, 14), ink=(255, 214, 90),
                    frame=(30, 28, 26), kind='jewelry', door='right'),
    'CTSHOP6': dict(zh='電器行', en='ELECTRONICS', key='notoserif', sign=(30, 50, 140), ink=(240, 240, 240),
                    frame=(150, 152, 156), kind='electronics', door='left'),
}

SHOP_ALLOW = ('dark', 'grey', 'red', 'brightred', 'yellow', 'orange', 'green', 'brown', 'tandark', 'darkblue', 'olive')


def storefront(name, rng):
    s = SHOPS[name]
    W = H = 128
    fr = np.array(s['frame'], np.float32)
    # wall/frame base: painted wood or metal with photo grain
    a = mat_concrete(W, H, rng, 'Concrete034', 1, s['frame'], contrast=0.8)
    # cornice strip
    a[0:4] = a[0:4] * 0.45
    a[0] *= 1.8
    # sign band
    sy0, sy1 = 4, 36
    band = np.ones((sy1 - sy0, W - 4, 3), np.float32) * np.array(s['sign'], np.float32)
    band *= (1 + 0.05 * fnoise(sy1 - sy0, W - 4, rng, 1.6))[..., None]
    m = ttf_mask(s['zh'], s['key'], 96, ss=2)
    m = sharp_mask(fit_mask(m, 112, 20), 0.3, 0.7)
    sh = np.pad(m, ((1, 0), (1, 0)))[:-1, :-1]
    light_sign = lum(np.array([s['sign']], np.float32))[0] > 128
    # a black drop shadow muddies lettering on a light board: use a soft one
    put_mask(band, sh, (W - 4) // 2 + 1, 13 + 1, (150, 120, 96) if light_sign else (16, 10, 8))
    put_mask(band, m, (W - 4) // 2, 13, s['ink'])
    en = text57(s['en'])
    stamp(band, en, (W - 4) // 2, 25, s['ink'], shadow=None if light_sign else (16, 10, 8), center=True)
    edge_shade(band, 0, 0, W - 4, sy1 - sy0, 1.3, 0.5, 1)
    a[sy0:sy1, 2:W - 2] = band
    a[sy1:sy1 + 2] *= 0.5
    y_top = sy1 + 3
    if 'awning' in s:
        awning(a, rng, sy1 + 1, 9, *s['awning'], x0=2, x1=W - 2)
        y_top = sy1 + 13
    # window and door
    if s['door'] == 'right':
        wx0, wx1, dx0, dx1 = 6, 82, 88, 122
    else:
        wx0, wx1, dx0, dx1 = 46, 122, 6, 40
    wy0, wy1 = y_top + 2, 112
    inner = interior(s['kind'], wy1 - wy0, wx1 - wx0, rng)
    a[wy0 - 2:wy1 + 2, wx0 - 2:wx1 + 2] = fr * 0.9
    edge_shade(a, wx0 - 2, wy0 - 2, wx1 + 2, wy1 + 2, 1.25, 0.55, 1)
    a[wy0:wy1, wx0:wx1] = shop_glass(inner, rng)
    a[wy0, wx0:wx1] *= 0.5
    mx = (wx0 + wx1) // 2                                  # centre mullion
    a[wy0:wy1, mx - 1:mx + 1] = fr * 0.95
    a[wy0:wy1, mx + 1] *= 0.6
    # stall-riser below the window
    a[wy1 + 2:122, wx0 - 2:wx1 + 2] = fr * 0.7
    a[wy1 + 2, wx0 - 2:wx1 + 2] *= 1.4
    # door: framed, half-glazed
    dy0 = y_top + 2
    a[dy0 - 2:124, dx0 - 2:dx1 + 2] = fr * 0.8
    edge_shade(a, dx0 - 2, dy0 - 2, dx1 + 2, 124, 1.25, 0.5, 1)
    a[dy0:122, dx0:dx1] = fr * 1.05
    edge_shade(a, dx0, dy0, dx1, 122, 1.2, 0.6, 1)
    gl = shop_glass(interior('dark', 50, dx1 - dx0 - 8, rng), rng)
    a[dy0 + 4:dy0 + 54, dx0 + 4:dx1 - 4] = gl
    a[dy0 + 4, dx0 + 4:dx1 - 4] *= 0.5
    hx = dx0 + 4 if s['door'] == 'right' else dx1 - 6
    a[dy0 + 50:dy0 + 58, hx:hx + 2] = (210, 200, 160)
    a[dy0 + 50:dy0 + 58, hx + 2] = (40, 36, 30)
    # a hand-written card taped inside the door, a lucky 福 diamond on the window
    cx0, cx1 = dx0 + 8, dx1 - 8
    a[dy0 + 9:dy0 + 19, cx0:cx1] = (220, 214, 196)
    a[dy0 + 19, cx0 + 1:cx1 + 1] *= 0.5
    for yy_ in (dy0 + 11, dy0 + 14, dy0 + 17):
        ln = int(rng.integers(8, cx1 - cx0 - 3))
        a[yy_, cx0 + 2:cx0 + 2 + ln] = (160, 24, 18) if yy_ == dy0 + 11 else (60, 60, 70)
    fu = sharp_mask(fit_mask(ttf_mask('福', 'brush', 96, ss=2), 9, 9), 0.3, 0.7)
    cx, cy = wx1 - 10, wy0 + 10
    yy, xx = np.mgrid[0:H, 0:W]
    dia = (np.abs(xx - cx) + np.abs(yy - cy)) <= 8
    a[dia] = (190, 24, 18)
    put_mask(a, fu, cx, cy, (250, 210, 80))
    # base: granite kick, step
    a[122:128] = (70, 68, 66)
    a[122] = (110, 108, 104)
    a[127] *= 0.5
    # pilasters at the tile edges
    a[:, 0:2] = fr * 0.6
    a[:, W - 2:W] = fr * 0.6
    a[:, 0] *= 1.4
    a[:, W - 1] *= 0.6
    clean = a[sy0:sy1].copy()
    a = grime(a, rng, amount=0.15, streak=0.12, spots=0.06)
    a[sy0:sy1] = a[sy0:sy1] * 0.4 + clean * 0.6        # signs get wiped now and then
    a = doom_finish(a, contrast=1.1, sat=0.95, sharp=0.25, wrap=False)
    return grain(a, rng, 2)


for _n in SHOPS:
    texture(_n, 128, 128, allow=SHOP_ALLOW)(lambda rng, _n=_n: storefront(_n, rng))


# ---------------------------------------------------------------------------
# Sky: night Manhattan skyline, 1024x128, seamless around the horizon.
# The engine maps 1024 columns to 360 degrees with the horizon at row 100
# and mirrors the texture upward, fading to the average of the top rows.
# ---------------------------------------------------------------------------

# Night sky ramps, each ordered dark -> light. Colours are only ever mixed
# with a neighbour in the SAME ramp (navy with navy, brown with brown), so
# the dither never speckles one hue into another; the navy/brown meeting
# is a hard, wavy cloud edge instead.
SKY_NAVY = [245, 244, 243, 242, 241]                 # (0,0,23) .. (0,0,71)
SKY_HAZE = [2, 1, 239, 238, 15, 237, 14, 13]         # (23,15,7) .. (79,59,43) sodium smog


def noise_dither(v, ramp, thr):
    """Dither a scalar field along a palette ramp using a smooth threshold
    field `thr` (0..1) instead of a Bayer matrix: transitions break up into
    soft horizontal cloud streaks, like hand-dithered DOOM skies."""
    ramp = np.asarray(ramp)
    v = np.clip(v, 0, len(ramp) - 1.001)
    i = np.floor(v).astype(int)
    return ramp[np.where(v - i > thr, i + 1, i)].astype(np.uint8)


def uniform01(n):
    """Rank-normalise a field to a uniform 0..1 distribution."""
    r = np.argsort(np.argsort(n.ravel()))
    return (r.astype(np.float32) / max(1, r.size - 1)).reshape(n.shape)


def skyline_shapes(W, H, rng, n, hmin, hmax, wmin, wmax, spires=0, towers=0.0, setback=0.45):
    """Silhouette mask of a row of buildings on a circular horizon, plus a
    per-pixel building id (for window patterns) and the roof list."""
    m = np.zeros((H, W), bool)
    bid = np.full((H, W), -1, np.int32)
    tops = []
    for k in range(n):
        x0 = int(rng.integers(0, W))
        bw = int(rng.integers(wmin, wmax))
        top = int(rng.integers(hmin, hmax))
        xs = np.arange(x0, x0 + bw) % W
        m[top:, xs] = True
        bid[top:, xs] = k
        tops.append((x0, bw, top))
        if rng.random() < setback and bw > 10:          # wedding-cake setbacks
            inset = max(2, bw // 4)
            t2 = max(0, top - int(rng.integers(5, 15)))
            xs2 = np.arange(x0 + inset, x0 + bw - inset) % W
            m[t2:top, xs2] = True
            bid[t2:top, xs2] = k
            tops.append((x0 + inset, bw - 2 * inset, t2))
        if rng.random() < towers and bw >= 8:           # NYC rooftop water tower
            tx = x0 + int(rng.integers(1, bw - 6))
            m[top - 6:top - 2, np.arange(tx, tx + 5) % W] = True
            m[top - 7, np.arange(tx + 1, tx + 4) % W] = True
            for lx in (tx, tx + 4):
                m[top - 2:top, lx % W] = True
    for _ in range(spires):
        x0, bw, top = tops[int(rng.integers(0, len(tops)))]
        cx = (x0 + bw // 2) % W
        sh = int(rng.integers(8, 16))
        for i in range(sh):
            half = max(0, int((i / sh) * 3))
            m[max(0, top - sh + i), np.arange(cx - half, cx + half + 1) % W] = True
        m[max(0, top - sh - 6):max(0, top - sh), cx] = True
        tops.append((cx, 1, max(0, top - sh - 6)))
    return m, bid, tops


def windows(m, bid, rng, p_lit, colors, step=(4, 3)):
    """Lit-window mask on a regular grid per building, with whole lit
    floors now and then. Returns (mask, palette index per pixel)."""
    H, W = m.shape
    yy, xx = np.mgrid[0:H, 0:W]
    sy, sx = step
    grid = ((yy % sy) == 1) & ((xx % sx) == 1) & m
    # interior of the silhouette only (no lit pixel on the outline)
    inner = m & np.roll(m, 1, 1) & np.roll(m, -1, 1) & np.roll(m, 1, 0)
    grid &= inner
    # per building a different occupancy so towers read as separate blocks
    occ = rng.uniform(0.3, 1.7, bid.max() + 2)[bid + 1] * p_lit
    lit = grid & (rng.random((H, W)) < occ)
    for _ in range(int(p_lit * 200)):
        y = int(rng.integers(0, H // sy)) * sy + 1
        x = int(rng.integers(0, W))
        run = np.arange(x, x + int(rng.integers(4, 13))) % W
        lit[y, run[grid[y, run]]] = True
    pick = np.asarray(colors)[rng.integers(0, len(colors), (H, W))]
    return lit, pick


@texture('CTSKY1', 1024, 128, allow=('dark', 'grey', 'darkblue', 'brown', 'yellow', 'orange', 'brightred', 'tandark'))
def t_sky1(rng):
    """Night over lower Manhattan: deep navy overhead, a sodium-orange smog
    layer over the rooftops, banks of lit cloud, a hazy moon, then a far
    skyline in smog and near towers as black silhouettes with lit windows.
    Rows 0-100 are above the horizon; buildings continue to row 127."""
    W, H = 1024, 128
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    # where the smog layer starts: a slow wave round the horizon
    hb = 46 + 6 * fnoise(1, W, rng, beta=3.0)[0] + 2 * fnoise(1, W, rng, beta=2.0)[0]
    streak = fnoise(H, W, rng, beta=3.0, sx=6.0)                # long horizontal cloud bands
    thr = uniform01(fnoise(H, W, rng, beta=2.0, sx=3.0))
    edge = yy - (hb[None, :] + 6.0 * streak)
    navy = edge < 0
    vn = np.interp(yy, [0, 20, 44], [0.2, 1.4, 3.6]) + 0.5 * streak
    ind = noise_dither(vn, SKY_NAVY, thr)
    # smog: brightens toward the horizon, lit cloud banks in it
    d = np.clip(edge, 0, None)
    vb = np.interp(d, [0, 6, 22, 40, 56], [0.2, 1.4, 3.6, 5.6, 7.0])
    clouds = fnoise(H, W, rng, beta=2.4, sx=5.0)
    vb = vb + 0.9 * np.clip(clouds, -1.5, 1.5) * smoothstep(0, 14, d)
    ind = np.where(navy, ind, noise_dither(vb, SKY_HAZE, thr))
    # the cloud edge: a darker rim where navy meets smog
    rim = (~navy) & (edge < 1.5)
    ind[rim] = 2
    # hazy moon in a gap in the clouds (low, so the view's vertical stretch
    # near the top of the screen doesn't turn it into an egg)
    mx, my = 300.0, 31.0
    dm = np.sqrt((xx - mx) ** 2 + (yy - my) ** 2)
    ind[(dm < 9) & navy] = 241
    ind[(dm < 6.5) & navy] = 240
    disc_m = dm < 4.0
    ind[disc_m] = 92                                             # (159,159,159)
    ind[disc_m & ((xx - mx) + (yy - my) > 2.0)] = 96              # terminator shading
    ind[(np.abs(xx - mx + 1) < 1) & (np.abs(yy - my + 1) < 1)] = 99   # a mare
    # far skyline in the smog: one flat haze-brown tone, dim windows
    fm, fb, _ = skyline_shapes(W, H, rng, 120, 64, 94, 6, 24, towers=0.25, setback=0.3)
    ind[fm] = 1                                                  # (31,23,11)
    lit, pick = windows(fm, fb, rng, 0.05, [236, 237, 165, 14])
    ind[lit] = pick[lit]
    # near towers: black-brown silhouettes, warm lit windows, a few spires
    nm, nb, ntops = skyline_shapes(W, H, rng, 34, 58, 98, 10, 34, towers=0.5)
    tm, tb, ttops = skyline_shapes(W, H, rng, 9, 30, 52, 10, 20, spires=4)
    near = nm | tm
    nbid = np.where(tm, tb + 1000, nb)
    shade = np.where(((nbid * 7919) % 3) == 0, 5, np.where(((nbid * 7919) % 3) == 1, 6, 7))   # per-building tone
    ind[near] = shade[near]
    # lit edge on the left side of each building facing the haze glow
    left_edge = near & ~np.roll(near, 1, 1)
    ind[left_edge & (yy < 99)] = 109
    lit, pick = windows(near, nbid, rng, 0.09, [162, 163, 161, 164, 222, 231, 85])
    ind[lit] = pick[lit]
    for x0, bw, top_ in sorted(ntops + ttops, key=lambda t_: t_[2])[:9]:     # red aviation lights
        cx = (x0 + bw // 2) % W
        ind[max(0, top_ - 1), cx] = 176
        if top_ >= 2:
            ind[top_ - 2, cx] = 184
    return ind


# ---------------------------------------------------------------------------
# Flats (64x64)
# ---------------------------------------------------------------------------

def asphalt(rng, color=(70, 70, 68)):
    src = photo(ph('asphalt_02'), (380, 0, 796, 416))       # crack-free patch
    a = resize(src, 64, 64)
    a = seamless2(a, band=12)
    a = delight(a, 16, 1.0)
    L = lum(a)
    L = (L - L.mean()) * 1.6
    L = 128 + np.where(L < -18, -18 - (L + 18) * 0.25, L)     # soften the dark cracks
    a = np.array(color, np.float32)[None, None] * (L / 128)[..., None]
    oil = smoothstep(0.8, 2.2, fnoise(64, 64, rng, 2.2))
    a *= (1 - 0.25 * oil)[..., None]
    return a


def worn_paint(a, mask, rgb, rng, wear=0.35):
    """Road paint, thinned where traffic wears it (smooth patches and
    tyre tracks running along the stripes) so the asphalt shows through
    as grey. No per-pixel speckle, chips or black holes: at DOOM scale
    those read as dirt or bites."""
    n = fnoise(64, 64, rng, 3.0) + 0.7 * fnoise(64, 64, rng, 2.8, sy=6.0)
    op = 0.86 - wear * 0.55 * smoothstep(-0.2, 1.6, -n)
    sub = a[mask]
    paint = np.array(rgb, np.float32) * (0.92 + 0.1 * (lum(sub[None])[0] / 128 - 0.5))[:, None]
    a[mask] = sub * (1 - op[mask])[:, None] + paint * op[mask][:, None]
    return a


FLAT_ALLOW_GREY = ('grey', 'dark', 'brown')


@flat('CFASPH1', allow=FLAT_ALLOW_GREY)
def f_asph1(rng):
    return grain(doom_finish(asphalt(rng), contrast=1.2, sat=0.5), rng, 3)


@flat('CFASPH2', allow=FLAT_ALLOW_GREY + ('yellow',))
def f_asph2(rng):
    a = asphalt(seed('CFASPH1'))
    yy, xx = np.mgrid[0:64, 0:64]
    m = (xx >= 30) & (xx < 34) & (yy >= 12) & (yy < 44)
    a = worn_paint(a, m, (214, 212, 200), rng)
    return grain(doom_finish(a, contrast=1.2, sat=0.6), rng, 3)


@flat('CFASPH3', allow=FLAT_ALLOW_GREY)
def f_asph3(rng):
    a = asphalt(seed('CFASPH1'))
    yy, xx = np.mgrid[0:64, 0:64]
    m = (xx >= 12) & (xx < 36)
    a = worn_paint(a, m, (220, 218, 208), rng, wear=0.5)
    return grain(doom_finish(a, contrast=1.15, sat=0.5), rng, 3)


@flat('CFSIDE1', allow=FLAT_ALLOW_GREY)
def f_side1(rng):
    """Sidewalk: four 32x32 concrete slabs a flat, each a slightly
    different tone and wear so the repeat is less obvious; tooled joints
    (dark groove, lit far edge), gum spots, a crack."""
    a = mat_concrete(64, 64, rng, 'Concrete034', 1, (142, 140, 134), contrast=1.6)
    for sy in (0, 32):
        for sx in (0, 32):
            a[sy:sy + 32, sx:sx + 32] *= 1 + rng.normal(0, 0.06)
    for k in (0, 32):                 # joints: soft enough not to alias into dotted lines
        a[k, :] = a[k, :] * 0.55
        a[:, k] = a[:, k] * 0.55
        a[(k + 1) % 64, :] *= 1.1
        a[:, (k + 1) % 64] *= 1.1
        a[(k - 1) % 64, :] *= 0.85
        a[:, (k - 1) % 64] *= 0.85
    for _ in range(int(rng.integers(5, 10))):              # chewing-gum spots
        x, y = int(rng.integers(2, 62)), int(rng.integers(2, 62))
        a[y, x] *= 0.55
        if rng.random() < 0.4:
            a[y, x + 1] *= 0.7
    a = cracks(a, rng, 1, (8, 20), 0.6)
    a = grime(a, rng, amount=0.2, streak=0, spots=0.1)
    return grain(doom_finish(a, contrast=1.15, sat=0.5), rng, 3)


@flat('CFCONC1', allow=FLAT_ALLOW_GREY)
def f_conc1(rng):
    a = mat_concrete(64, 64, rng, 'Concrete031', 2, (128, 126, 120), contrast=1.6)
    a = grime(a, rng, amount=0.15, streak=0, spots=0.1)
    return grain(doom_finish(a, contrast=1.15, sat=0.5), rng, 3)


@flat('CFCONC2', allow=FLAT_ALLOW_GREY + ('olive',))
def f_conc2(rng):
    """Stained concrete floor: smooth slab, mild mottling, a couple of
    soft oil/water stains with darker rims, hairline cracks."""
    a = mat_concrete(64, 64, rng, 'Concrete031', 2, (122, 120, 112), contrast=1.5)
    a *= (1 + 0.06 * fnoise(64, 64, rng, 2.6))[..., None]
    n = fnoise(64, 64, rng, 3.2)
    oil = smoothstep(1.2, 2.0, n)
    rim = smoothstep(1.0, 1.25, n) * (1 - smoothstep(1.25, 1.5, n))
    a = a * (1 - 0.32 * oil - 0.12 * rim)[..., None]
    a = grime(a, rng, amount=0.18, streak=0, spots=0.12)
    a = cracks(a, rng, 2, (8, 22), 0.65)
    return grain(doom_finish(a, contrast=1.15, sat=0.6), rng, 3)


def floor_tiles(rng, tw, color, grout=(70, 66, 60), colors=None):
    a = tile_wall(64, 64, rng, tw, tw, color, grout=grout, bond=False, vary=0.05, colors=colors)
    return a


@flat('CFTILE1', allow=FLAT_ALLOW_GREY)
def f_tile1(rng):
    a = floor_tiles(rng, 16, (124, 116, 104), grout=(58, 56, 52))
    a = grime(a, rng, amount=0.3, streak=0, spots=0.2)
    return grain(doom_finish(a, contrast=1.15, sat=0.7), rng, 3)


@flat('CFTILE2', allow=FLAT_ALLOW_GREY)
def f_tile2(rng):
    a = floor_tiles(rng, 16, None, grout=(90, 88, 84),
                    colors=lambda r, c: (210, 206, 196) if (r + c) % 2 == 0 else (34, 34, 36))
    a = grime(a, rng, amount=0.25, streak=0, spots=0.15)
    return grain(doom_finish(a, contrast=1.1, sat=0.5), rng, 3)


@flat('CFTILE3', allow=FLAT_ALLOW_GREY + ('green', 'olive', 'red'))
def f_tile3(rng):
    """Penny/mosaic floor: 4px tiles, a dark diamond motif and green border."""
    def col(r, c):
        d = abs((r % 16) - 7.5) + abs((c % 16) - 7.5)
        if 5.5 < d < 7.5:
            return (40, 40, 42)
        if d < 2.5:
            return (150, 40, 34)
        if r % 16 in (0, 15) or c % 16 in (0, 15):
            return (50, 90, 60)
        return (204, 200, 186)
    a = floor_tiles(rng, 4, None, grout=(110, 106, 98), colors=col)
    a = grime(a, rng, amount=0.25, streak=0, spots=0.12)
    return grain(doom_finish(a, contrast=1.1, sat=0.7, sharp=0.2), rng, 2)


@flat('CFWOOD1', allow=('brown', 'tandark', 'dark', 'grey'))
def f_wood1(rng):
    a = mat_wood(64, 64, rng, 'WoodFloor041', (120, 86, 58), 1.4)
    return grain(doom_finish(a, contrast=1.2, sat=0.85), rng, 3)


@flat('CFWOOD2', allow=('brown', 'tandark', 'dark', 'grey'))
def f_wood2(rng):
    a = mat_wood(64, 64, rng, 'Planks023A', (116, 104, 88), 1.5, vertical=True)
    for x in range(0, 64, 8):                     # deck gaps between boards
        a[:, x] *= 0.25
        a[:, x + 1] *= 0.8
        a[:, x + 7] *= 1.1
        for y in (10, 42):                        # bolt heads
            a[y:y + 2, x + 3:x + 5] = (60, 56, 50)
    a = grime(a, rng, amount=0.2, streak=0, spots=0.1)
    return grain(doom_finish(a, contrast=1.15, sat=0.6), rng, 3)


@flat('CFMETL1', allow=FLAT_ALLOW_GREY)
def f_metl1(rng):
    """Diamond tread plate: raised oblong lugs, alternating diagonals."""
    base = resize(photo(acg('DiamondPlate001')), 64, 64, wrap=True)
    base = grade(delight(base, 16), contrast=0.8, sat=0.2)
    a = base * (np.array((112, 114, 114), np.float32) / np.maximum(base.reshape(-1, 3).mean(axis=0), 1))
    yy, xx = np.mgrid[0:64, 0:64].astype(np.float32)
    for cy in range(0, 64, 8):
        for cx in range(0, 64, 8):
            ox = 4 if (cy // 8) % 2 else 0
            px, py = (cx + ox) % 64, cy + 4
            d = 1 if ((cx + ox) // 8 + cy // 8) % 2 else -1
            for t in range(-2, 3):
                x, y = int(px + t) % 64, int(py + d * t) % 64
                a[y, x] *= 1.45
                a[(y + 1) % 64, x] *= 0.6
    a = grime(a, rng, amount=0.2, streak=0, spots=0.1)
    return grain(doom_finish(a, contrast=1.1, sat=0.5), rng, 2)


@flat('CFGRAT1', allow=FLAT_ALLOW_GREY + ('tandark',))
def f_grat1(rng):
    """Bar grating: bearing bars with dark gaps, cross rods every 16."""
    base = resize(photo(ph('metal_grate_rusty')), 64, 64, wrap=True)
    base = grade(delight(base, 16), contrast=1.0, sat=0.6)
    a = np.zeros((64, 64, 3), np.float32) + (12, 12, 12)
    for x in range(0, 64, 4):
        a[:, x:x + 2] = base[:, x:x + 2] * 0.9
        a[:, x] *= 1.3
    for y in range(0, 64, 16):
        a[y:y + 2, :] = base[y:y + 2, :] * 0.8
        a[y, :] *= 1.3
    return grain(doom_finish(a, contrast=1.15, sat=0.7), rng, 2)


@flat('CFROOF1', allow=FLAT_ALLOW_GREY)
def f_roof1(rng):
    a = mat_concrete(64, 64, rng, 'Gravel043', 2, (66, 64, 62), contrast=1.6)
    a[:, 30:33] *= 0.6                            # tar seam
    a[:, 31] *= 0.8
    a = grime(a, rng, amount=0.2, streak=0, spots=0.1)
    return grain(doom_finish(a, contrast=1.2, sat=0.5), rng, 3)


@flat('CFCEIL1', allow=FLAT_ALLOW_GREY + ('tandark',))
def f_ceil1(rng):
    """Acoustic drop-ceiling tiles in a T-bar grid, a water stain."""
    a = np.zeros((64, 64, 3), np.float32) + (176, 172, 160)
    pits = rng.random((64, 64)) < 0.12
    a[pits] *= 0.75
    a *= (1 + 0.05 * fnoise(64, 64, rng, 1.5))[..., None]
    st = smoothstep(0.6, 1.6, fnoise(64, 64, rng, 2.6))
    a = a * (1 - 0.3 * st)[..., None] + st[..., None] * np.array((10, 4, -6), np.float32)
    for k in (0, 32):
        a[k:k + 2, :] = (200, 200, 194)
        a[:, k:k + 2] = (200, 200, 194)
        a[k + 2, :] *= 0.8
        a[:, k + 2] *= 0.85
    return grain(doom_finish(a, contrast=1.1, sat=0.6), rng, 2)


@flat('CFCEIL2', allow=FLAT_ALLOW_GREY)
def f_ceil2(rng):
    a = mat_concrete(64, 64, rng, 'Concrete031', 2, (96, 94, 90), contrast=1.6)
    for y in range(0, 64, 16):                    # board-formed lines
        a[y, :] *= 0.7
    a = grime(a, rng, amount=0.2, streak=0, spots=0.1)
    return grain(doom_finish(a, contrast=1.15, sat=0.5), rng, 3)


@flat('CFNLIT1', allow=('grey', 'dark', 'yellow') + (4, 80, 81, 82, 168, 208, 224))
def f_nlit1(rng):
    """Fluorescent troffer: steel frame, prismatic diffuser, two tubes."""
    a = np.zeros((64, 64, 3), np.float32) + (150, 150, 146)
    a[4:60, 4:60] = (226, 226, 216)
    yy, xx = np.mgrid[0:64, 0:64]
    prism = ((xx + yy) % 4 == 0) | ((xx - yy) % 4 == 0)
    a[prism & (xx > 4) & (xx < 59) & (yy > 4) & (yy < 59)] = (200, 200, 190)
    for x0 in (16, 44):
        a[6:58, x0 - 2:x0 + 2] = (255, 255, 244)
    edge_shade(a, 0, 0, 64, 64, 1.2, 0.6, 2)
    a[3, 4:60] *= 0.7
    a[4:60, 3] *= 0.7
    return a


@flat('CFPLAT1', allow=('yellow', 'dark', 'grey', 'brown', 'orange'))
def f_plat1(rng):
    """Platform-edge warning strip: yellow tactile domes."""
    a = np.zeros((64, 64, 3), np.float32) + (214, 176, 40)
    a *= (1 + 0.06 * fnoise(64, 64, rng, 1.4))[..., None]
    for cy in range(4, 64, 8):
        for cx in range(4, 64, 8):
            a[cy - 2:cy + 1, cx - 2:cx + 1] *= 1.15
            a[cy + 1, cx - 1:cx + 2] *= 0.6
            a[cy - 1:cy + 2, cx + 1] *= 0.7
    a[0, :] *= 0.5
    a[:, 0] *= 0.5
    a = grime(a, rng, amount=0.3, streak=0, spots=0.15)
    return grain(doom_finish(a, contrast=1.1, sat=0.9), rng, 2)


@flat('CFTRAK1', allow=('grey', 'dark', 'brown', 'tandark'))
def f_trak1(rng):
    """Subway trackbed: ballast, timber ties and two running rails."""
    a = mat_concrete(64, 64, rng, 'Gravel043', 2, (74, 68, 60), contrast=2.0)
    wood = mat_wood(64, 64, rng, 'Planks012', (70, 54, 40), 1.4)
    for y0 in (6, 38):
        a[y0:y0 + 12] = wood[y0:y0 + 12]
        a[y0] *= 1.25
        a[y0 + 11] *= 0.5
        a[y0 + 12:y0 + 14] *= 0.6
    for x0 in (10, 50):
        a[:, x0 - 1:x0 + 5] *= 0.55                # rail shadow / tie plates
        for y0 in (6, 38):
            a[y0 + 2:y0 + 10, x0 - 2:x0 + 6] = (64, 60, 56)
        a[:, x0:x0 + 4] = (96, 94, 92)
        a[:, x0 + 1:x0 + 3] = (186, 184, 178)      # polished running surface
    a = grime(a, rng, amount=0.2, streak=0, spots=0.1)
    return grain(doom_finish(a, contrast=1.15, sat=0.6), rng, 3)


@flat('CFDIRT1', allow=('brown', 'tandark', 'dark', 'grey', 'olive'))
def f_dirt1(rng):
    a = resize(photo(acg('Ground103')), 64, 64, wrap=True)
    a = delight(a, 16, 1.0)
    a = grade(a, contrast=1.4, sat=0.8, bright=0.8)
    return grain(doom_finish(a, contrast=1.1, sat=0.8), rng, 3)


def water_frames(rng, k=3, kind='bay'):
    """Looping animated water (the engine cycles frames 1-2-3 every 8 tics).
    DOOM's FWATER/NUKAGE read as liquid because of one dominant tone with
    thin, bright, wavy ripple lines; here the lines are contours of a ripple
    field. Any 3-frame loop moves each component 120 degrees per frame, so
    the big shapes (swells, scum, sediment) stay put and only the ripple
    term rotates: the lines shimmer in place instead of blobs jumping."""
    B = fnoise(64, 64, rng, beta=3.6)                        # large, static
    swell = fnoise(64, 64, rng, beta=3.4, sx=4.0)            # long swells along x
    r1 = fnoise(64, 64, rng, beta=3.0, sx=2.5)
    r2 = fnoise(64, 64, rng, beta=3.0, sx=2.5)
    sparkle = np.random.default_rng(int(rng.integers(1 << 30))).random((64, 64)) < 0.1   # glint sites
    frames = []
    for i in range(k):
        th = 2 * math.pi * i / k
        R = math.cos(th) * r1 + math.sin(th) * r2
        P = 0.55 * swell + 0.35 * R                           # ripple phase: 2-3 lines a tile
        fr = P - np.floor(P)
        gy = (np.roll(P, -1, 0) - np.roll(P, 1, 0)) / 2
        gx = (np.roll(P, -1, 1) - np.roll(P, 1, 1)) / 2
        dist = np.abs(fr - 0.5) / (np.sqrt(gx * gx + gy * gy) + 1e-3)   # in pixels
        line = dist < 0.75                                    # unbroken 1-2 px lines
        if kind == 'bay':
            # dark navy harbour, blue ripple lines, rare glints of moon and
            # sodium light on the crests
            v = 1.8 + 0.7 * swell + 0.35 * B
            ramp = [244, 243, 242, 241, 240]
            ind = np.asarray(ramp)[np.clip(np.floor(v), 0, len(ramp) - 1).astype(int)].astype(np.uint8)
            ind[line] = 206                                   # (0,0,131)
            ind[line & (swell > 0.4)] = 205
            ind[line & (swell > 1.1)] = 204                   # (0,0,179)
            glint = line & sparkle & (swell + 0.5 * R > 0.6)
            ind[glint] = 102                                  # (91,91,91) moonlight
            ind[glint & (B < -0.5)] = 237                     # streetlight (67,47,27)
        else:
            # murky olive sludge, pale ripple lines, a toxic green film that
            # only shimmers at its edges, bubbles and rusty sediment
            v = 2.4 + 0.45 * B + 0.25 * swell
            ramp = [10, 159, 158, 157, 156]                   # (35,43,15) .. (91,99,71)
            ind = np.asarray(ramp)[np.clip(np.floor(v), 0, len(ramp) - 1).astype(int)].astype(np.uint8)
            crest = line & (swell + 0.3 * R > 0.1)            # only the crests catch light
            ind[crest] = 155                                   # (71,79,51)
            ind[crest & (swell > 0.8)] = 153                   # (111,115,87)
            fm = 0.9 * B + 0.25 * R
            film = fm > 1.0
            ind[film] = 123                                    # (39,83,27)
            ind[film & (fm > 1.3)] = 122
            edge_f = film & ~(np.roll(film, 1, 0) & np.roll(film, -1, 0) & np.roll(film, 1, 1) & np.roll(film, -1, 1))
            ind[edge_f] = 120                                  # (63,131,47) bright rim
            bub = film & (fm > 1.3) & (dist < 0.5)
            ind[bub] = 118                                     # (75,159,63)
            eddy = (B < -1.5) & ~film
            ind[eddy] = 11                                     # dark swirl (23,31,7)
            ind[eddy & line] = 239                             # rusty sediment in it
        frames.append(ind)
    return frames


_WATER = {}


def water(name):
    group = name[:-1]
    if group not in _WATER:
        _WATER[group] = water_frames(seed(group), kind='sewer' if group == 'CFSEW' else 'bay')
    return _WATER[group][int(name[-1]) - 1]


for _i in (1, 2, 3):
    flat('CFSEW%d' % _i)(lambda rng, _n='CFSEW%d' % _i: water(_n))
    flat('CFBAY%d' % _i)(lambda rng, _n='CFBAY%d' % _i: water(_n))


# ---------------------------------------------------------------------------
# Spec check, lump output, previews, credits
# ---------------------------------------------------------------------------

SPEC_WALLS = {
    'CTBRK1': (128, 128), 'CTBRK2': (128, 128), 'CTAPT1': (128, 128), 'CTAPT2': (128, 128),
    'CTSTUC1': (128, 128), 'CTSTUC2': (128, 128), 'CTPLAS1': (128, 128), 'CTCONC1': (128, 128),
    'CTCONC2': (128, 128), 'CTSTEP1': (64, 32), 'CTTRIM1': (128, 32), 'CTTILE1': (128, 128),
    'CTTILE2': (128, 128), 'CTTILE3': (128, 128), 'CTSHUT1': (128, 128), 'CTSHUT2': (128, 128),
    'CTSHOP1': (128, 128), 'CTSHOP2': (128, 128), 'CTSHOP3': (128, 128), 'CTSHOP4': (128, 128),
    'CTSHOP5': (128, 128), 'CTSHOP6': (128, 128), 'CTDOOR1': (64, 128), 'CTDOOR2': (64, 128),
    'CTDOOR3': (128, 128), 'CTGRGE1': (128, 128), 'CTELEV1': (128, 128), 'CTFENC1': (128, 128),
    'CTGATE1': (128, 128), 'CTGATE2': (128, 128), 'CTGATE3': (128, 128), 'CTBORD1': (64, 128),
    'CTBORD2': (128, 128), 'CTBORD3': (64, 128), 'CTGLAS1': (64, 128), 'CTGLAS2': (64, 128),
    'CTRAIL1': (64, 32), 'CTSEWR1': (128, 128), 'CTSEWR2': (128, 128), 'CTSEWR3': (64, 64),
    'CTWOOD1': (128, 128), 'CTSCAF1': (128, 128), 'CTMETL1': (128, 128), 'CTMETL2': (128, 128),
    'CTCONT1': (128, 128), 'CTCONT2': (128, 128), 'CTCONT3': (128, 128), 'CTWARE1': (128, 128),
    'CTPILR1': (64, 128), 'CTROOF1': (128, 64), 'CTNPAI1': (128, 64), 'CTLADR1': (64, 128),
    'CTLADR2': (64, 128), 'CTLADR3': (64, 128), 'CTBUT1': (64, 64), 'CTBUT2': (64, 64),
    'CTGEN1': (64, 64), 'CTSOCK1': (64, 64), 'CTSOCK2': (64, 64), 'CTRADI1': (64, 64),
    'CTRADI2': (64, 64), 'CTPADL1': (64, 64), 'CTPADL2': (64, 64), 'CTCRNK1': (64, 64),
    'CTNSG1': (32, 128), 'CTNSG2': (128, 32), 'CTNSG3': (128, 32), 'CTNSG4': (128, 32),
    'CTNSG5': (128, 32), 'CTNSG6': (128, 32), 'CTNSG7': (64, 128), 'CTNSG8': (128, 32),
    'CTNSG9': (64, 64), 'CTDARK1': (64, 64), 'CTSKY1': (1024, 128),
}
SPEC_MASKED = {'CTFENC1', 'CTGATE1', 'CTGATE2', 'CTGATE3', 'CTBORD1', 'CTBORD2', 'CTBORD3',
               'CTGLAS1', 'CTGLAS2', 'CTRAIL1', 'CTSCAF1'}
SPEC_FLATS = ['CFASPH1', 'CFASPH2', 'CFASPH3', 'CFSIDE1', 'CFCONC1', 'CFCONC2', 'CFTILE1', 'CFTILE2',
              'CFTILE3', 'CFWOOD1', 'CFWOOD2', 'CFMETL1', 'CFGRAT1', 'CFROOF1', 'CFCEIL1', 'CFCEIL2',
              'CFNLIT1', 'CFPLAT1', 'CFTRAK1', 'CFDIRT1', 'CFSEW1', 'CFSEW2', 'CFSEW3',
              'CFBAY1', 'CFBAY2', 'CFBAY3']


def check_spec():
    for n, (w, h) in SPEC_WALLS.items():
        d = TEXDEFS.get(n)
        if not d:
            raise SystemExit('missing texture ' + n)
        if (d['w'], d['h']) != (w, h):
            raise SystemExit('%s: size %dx%d, spec says %dx%d' % (n, d['w'], d['h'], w, h))
    for n in SPEC_FLATS:
        if n not in FLATDEFS:
            raise SystemExit('missing flat ' + n)


def patch_layout(name, w, h):
    """Patches for a texture: one per texture (<NAME>A), except the sky
    which is eight 128x128 patches CTSKY1A..H."""
    if w <= 256:
        return [(name + 'A', 0, w)]
    return [('%s%s' % (name, chr(65 + i)), x, 128) for i, x in enumerate(range(0, w, 128))]


def write_outputs(results, flats, full):
    texjson = {}
    produced = set()
    for name, (ind, mask) in results.items():
        h, w = ind.shape
        if h > 128:
            raise SystemExit('%s taller than 128' % name)
        pl = patch_layout(name, w, h)
        texjson[name] = {'width': w, 'height': h, 'patches': []}
        for pname, x0, pw in pl:
            sub = ind[:, x0:x0 + pw]
            sm = None if mask is None else mask[:, x0:x0 + pw]
            dg.write_lump('patches', pname, dg.encode_picture(sub, sm))
            produced.add(('patches', pname))
            texjson[name]['patches'].append({'patch': pname, 'x': x0, 'y': 0})
    for name, ind in flats.items():
        dg.write_lump('flats', name, dg.encode_flat(ind))
        produced.add(('flats', name))
    path = os.path.join(dg.LUMPS, 'data', 'TEXTURES.json')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if not full and os.path.exists(path):
        with open(path) as f:
            old = json.load(f)
        old.update(texjson)
        texjson = old
    # Texture #0 is never drawn by DOOM ("no texture"), and a vanilla port
    # that lets this TEXTURE1 replace the IWAD's would lose the first entry:
    # lead with a dummy that reuses an existing patch.
    texjson.pop('CTNULL', None)
    if 'CTDARK1' in texjson:
        texjson['CTNULL'] = {'width': 64, 'height': 64, 'patches': [{'patch': 'CTDARK1A', 'x': 0, 'y': 0}]}
    order = ['CTNULL'] + list(SPEC_WALLS)
    ordered = {n: texjson[n] for n in sorted(texjson, key=lambda n: (n not in order, order.index(n) if n in order else 0, n))}
    with open(path, 'w') as f:
        json.dump(ordered, f, indent=1)
    if full:   # drop stale lumps from earlier runs (we own these folders)
        for ns in ('patches', 'flats'):
            d = os.path.join(dg.LUMPS, ns)
            for fn in os.listdir(d):
                if fn.endswith('.lmp') and (ns, fn[:-4]) not in produced:
                    os.remove(os.path.join(d, fn))


def _rgba(ind, mask):
    rgb = dg.palette()[ind]
    if mask is None:
        return rgb
    h, w = ind.shape
    yy, xx = np.mgrid[0:h, 0:w]
    bg = np.where((((yy // 8) + (xx // 8)) % 2 == 0)[..., None], (0, 60, 60), (0, 92, 92))
    return np.where(mask[..., None], rgb, bg).astype(np.uint8)


def contact_sheet(items, path, scale=2, cols=8, title=None):
    from PIL import ImageDraw as _D
    cell_w = max(w for _, (ind, _m) in items for w in [ind.shape[1]]) * scale
    cell_w = min(cell_w, 128 * scale)
    cells = []
    for name, (ind, mask) in items:
        im = Image.fromarray(_rgba(ind, mask).astype(np.uint8))
        im = im.resize((im.width * scale, im.height * scale), Image.NEAREST)
        cells.append((name, im))
    # wide items (the sky) get their own rows
    rows, cur, row_w = [], [], 0
    maxw = cols * (cell_w + 8)
    for name, im in cells:
        if cur and row_w + im.width + 8 > maxw:
            rows.append(cur)
            cur, row_w = [], 0
        cur.append((name, im))
        row_w += im.width + 8
    if cur:
        rows.append(cur)
    H = 30 + sum(max(im.height for _, im in r) + 18 for r in rows)
    W = max(sum(im.width + 8 for _, im in r) for r in rows) + 8
    sheet = Image.new('RGB', (W, H), (24, 22, 22))
    d = _D.Draw(sheet)
    if title:
        d.text((8, 8), title, fill=(255, 220, 120))
    y = 30
    for r in rows:
        x = 8
        for name, im in r:
            d.text((x, y), '%s %dx%d' % (name, im.width // scale, im.height // scale), fill=(230, 230, 210))
            sheet.paste(im, (x, y + 13))
            x += im.width + 8
        y += max(im.height for _, im in r) + 18
    sheet.save(path)


def street_corner(results, flats, path):
    """Mock-up: a 320x200 DOOM-style ray-cast of a Chinatown street corner
    (shopfronts, apartments, cornice, neon, sidewalk, road, fence, sky),
    lit with the IWAD COLORMAP, shown at 3x."""
    cmap = np.frombuffer(dg.read_wad_lump(dg.IWAD, 'COLORMAP'), np.uint8)[:34 * 256].reshape(34, 256)
    W, H = 320, 200
    # facades: palette-index images (height 0 at the bottom row)
    def facade(names, length, rows):
        img = np.zeros((sum(r[1] for r in rows), length), np.uint8)
        y = img.shape[0]
        for kind, hgt in rows:
            y -= hgt
            seq = kind if isinstance(kind, list) else [kind]
            x = 0
            i = 0
            while x < length:
                ind, _m = results[seq[i % len(seq)]]
                th, tw = ind.shape
                reps = np.tile(ind, (hgt // th + 1, 1))[:hgt]
                img[y:y + hgt, x:x + tw] = reps[:, :min(tw, length - x)]
                x += tw
                i += 1
        return img
    rows = [(['CTSHOP1', 'CTSHOP3', 'CTSHUT2', 'CTSHOP4', 'CTDOOR3', 'CTSHOP2'], 128),
            (['CTAPT1'], 128), (['CTAPT1'], 128), (['CTTRIM1'], 32)]
    rows2 = [(['CTSHOP5', 'CTSHUT1', 'CTSHOP6', 'CTGRGE1', 'CTSHOP2'], 128),
             (['CTAPT2'], 128), (['CTAPT2'], 128), (['CTTRIM1'], 32)]
    fa = facade(None, 768, rows)
    fb = facade(None, 768, rows2)
    fh = fa.shape[0]
    full_a = np.zeros_like(fa, bool)   # fullbright overlay map
    full_b = np.zeros_like(fb, bool)

    def overlay(img, full, name, u, v_top):
        ind, m = results[name]
        h, w = ind.shape
        img[fh - v_top - h:fh - v_top, u:u + w] = ind
        full[fh - v_top - h:fh - v_top, u:u + w] = True
    overlay(fa, full_a, 'CTNSG2', 0, 128)
    overlay(fa, full_a, 'CTNSG4', 384, 128)
    overlay(fa, full_a, 'CTNSG1', 300, 140)
    overlay(fb, full_b, 'CTNSG8', 768 - 256, 128)
    overlay(fb, full_b, 'CTNSG9', 768 - 360, 136)
    # camera
    cx, cy, cz = -70.0, -10.0, 41.0
    yaw = math.atan2(150 - cy + 70, 100 - cx)
    f = 160.0
    sx = (np.arange(W) - W / 2 + 0.5) / f
    sy = (H / 2 - np.arange(H) - 0.5) / f * 1.2   # DOOM's 1.2 pixel aspect
    dx = math.cos(yaw) + sx[None, :] * math.sin(yaw) * np.ones((H, 1))   # screen right = clockwise
    dy = math.sin(yaw) - sx[None, :] * math.cos(yaw) * np.ones((H, 1))
    dz = sy[:, None] * np.ones((1, W))
    best = np.full((H, W), np.inf)
    out = np.zeros((H, W), np.uint8)
    light = np.zeros((H, W))
    fb_mask = np.zeros((H, W), bool)
    # walls: building x>=100, y>=150 (west face x=100, south face y=150)
    for face in ('west', 'south'):
        if face == 'west':
            t = (100 - cx) / np.where(np.abs(dx) < 1e-6, 1e-6, dx)
            img, full = fb, full_b
            u = img.shape[1] - 1 - (cy + t * dy - 150)     # seen from the west, north is on the left
        else:
            t = (150 - cy) / np.where(np.abs(dy) < 1e-6, 1e-6, dy)
            u = cx + t * dx - 100
            img, full = fa, full_a
        z = cz + t * dz
        hit = (t > 0) & (u >= 0) & (u < img.shape[1]) & (z >= 0) & (z < fh) & (t < best)
        ui = np.clip(u.astype(int), 0, img.shape[1] - 1)
        vi = np.clip((fh - 1 - z).astype(int), 0, fh - 1)
        out[hit] = img[vi[hit], ui[hit]]
        fb_mask[hit] = full[vi[hit], ui[hit]]
        best[hit] = t[hit]
        light[hit] = 184 if face == 'west' else 168
    # chain-link fence across the far street (masked texture)
    fi, fm = results['CTFENC1']
    t = (520 - cy) / np.where(np.abs(dy) < 1e-6, 1e-6, dy)
    u = cx + t * dx
    z = cz + t * dz
    hit = (t > 0) & (u > -600) & (u < 100) & (z >= 0) & (z < 128) & (t < best)
    ui = (u.astype(int)) % 128
    vi = np.clip((127 - z).astype(int), 0, 127)
    hit &= fm[vi, ui]
    out[hit] = fi[vi[hit], ui[hit]]
    best[hit] = t[hit]
    light[hit] = 160
    # floor
    t = np.where(dz < -1e-6, -cz / np.where(dz < -1e-6, dz, -1), np.inf)
    px, py = cx + t * dx, cy + t * dy
    hit = (t < best) & np.isfinite(t)
    side = (px >= 4) & (py >= 54)
    cross = ~side & (px < 4) & (px > -150) & (py >= 150) & (py < 214)
    lane = ~side & ~cross & (px < -130) & (px > -194)
    for name, sel in (('CFSIDE1', side), ('CFASPH3', cross), ('CFASPH2', lane), ('CFASPH1', ~side & ~cross & ~lane)):
        m = hit & sel
        fl = flats[name]
        out[m] = fl[(-py[m]).astype(int) % 64, px[m].astype(int) % 64]
    curb = hit & side & ((np.abs(px - 4) < 3) | (np.abs(py - 54) < 3)) & ((px < 100) | (py < 150))
    out[curb] = 94
    light[hit] = 168
    best[hit] = t[hit]
    # sky
    sk, _ = results['CTSKY1']
    sky = np.isinf(best)
    ang = np.arctan2(dy, dx)
    col = (ang / (2 * math.pi) * 1024).astype(int) % 1024
    elev = np.arctan2(dz, np.sqrt(dx * dx + dy * dy))
    row = np.clip((100 - 160 * np.tan(np.clip(elev, -1.3, 1.3))).astype(int), 0, 127)
    out[sky] = sk[np.abs(row[sky]), col[sky]]
    # DOOM-ish diminishing light
    dist = np.where(np.isinf(best), 0, best * np.sqrt(dx * dx + dy * dy))
    start = (15 - (light / 16).astype(int)) * 4
    level = np.clip(start - 1800 / np.maximum(dist, 1) + dist / 60, 0, 31).astype(int)
    level[sky | fb_mask] = 0
    final = cmap[level, out]
    rgb = dg.palette()[final]
    im = Image.fromarray(rgb.astype(np.uint8)).resize((W * 3, int(H * 3 * 1.2)), Image.NEAREST)
    im.save(path)


def write_credits():
    os.makedirs(os.path.dirname(CREDITS), exist_ok=True)
    lines = [
        '# Chinatown textures, flats and sky - sources and licences',
        '',
        'Generated by `tools/ct/textures.py` (procedural compositing by the script; no',
        'No More Room in Hell files are used). Photo sources are downscaled, de-lit,',
        'regraded, grimed and quantized to the DOOM palette; Chinese and Latin',
        'lettering is rasterized from the fonts below (only pixels ship).',
        '',
        '| source | where | licence | used in |',
        '|---|---|---|---|',
    ]
    for key in sorted(USED):
        title, url, lic = USED[key]
        users = ', '.join(sorted(USED_BY.get(key, ())))
        lines.append('| %s | %s | %s | %s |' % (title, url, lic, users))
    lines += [
        '',
        'Chinese words used: 唐人街 (Chinatown, paifang board), 中華餐館 (Chinese',
        'restaurant), 東方雜貨 (Oriental grocery), 中藥行 (herbal medicine shop),',
        '金鳳餅家 (Golden Phoenix bakery), 珠寶金行 (jewellery & gold shop), 電器行',
        '(electrical/electronics shop), 金龍酒家 (Golden Dragon restaurant), 海鮮酒家',
        '(seafood restaurant), 市場 (market), 福 (good fortune).',
        '',
        'The night skyline sky (CTSKY1), neon signs, panels, masked fences/gates/',
        'boards/glass, storefront compositions and water animation are procedural.',
        '',
    ]
    with open(CREDITS, 'w') as f:
        f.write('\n'.join(lines))


def main(argv):
    only = None
    if '--only' in argv:
        only = set(argv[argv.index('--only') + 1].upper().split(','))
    previews = '--no-previews' not in argv
    check_spec()
    results, flats = {}, {}
    for name in TEXDEFS:
        if only and name not in only:
            continue
        ind, mask = render(name)
        if name in SPEC_MASKED:
            if mask is None or mask.all():
                raise SystemExit(name + ' must be masked (have transparent pixels)')
        elif mask is not None and not mask.all():
            raise SystemExit(name + ' has holes but is not a masked texture')
        else:
            mask = None
        results[name] = (ind, mask)
    for name in FLATDEFS:
        if only and name not in only:
            continue
        ind, _ = render(name)
        flats[name] = ind
    write_outputs(results, flats, full=only is None)
    print('textures: %d walls (%d patches), %d flats -> %s' % (
        len(results), sum(len(patch_layout(n, r[0].shape[1], r[0].shape[0])) for n, r in results.items()),
        len(flats), os.path.relpath(dg.LUMPS, dg.ROOT)))
    if previews:
        os.makedirs(os.path.join(PREV, 'single'), exist_ok=True)
        for name, (ind, mask) in results.items():
            dg.write_preview(os.path.join(PREV, 'single', name + '.png'), ind, mask)
        for name, ind in flats.items():
            dg.write_preview(os.path.join(PREV, 'single', name + '.png'), ind)
        if only is None:
            walls = [(n, results[n]) for n in SPEC_WALLS if n != 'CTSKY1']
            contact_sheet(walls, os.path.join(PREV, 'walls.png'), 2, 8, 'Chinatown wall textures (2x)')
            contact_sheet([('CTSKY1', results['CTSKY1'])], os.path.join(PREV, 'sky.png'), 2, 1, 'CTSKY1 (2x)')
            contact_sheet([(n, (flats[n], None)) for n in SPEC_FLATS], os.path.join(PREV, 'flats.png'), 2, 9,
                          'Chinatown flats (2x)')
            street_corner(results, flats, os.path.join(PREV, 'street_corner.png'))
            print('previews ->', os.path.relpath(PREV, dg.ROOT))
    if only is None:
        write_credits()


if __name__ == '__main__':
    main(sys.argv[1:])
