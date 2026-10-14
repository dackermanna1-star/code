"""Shared helpers for the Chinatown content build: the DOOM palette, colour
quantization, and encoders for DOOM lump formats (pictures/patches/sprites,
64x64 flats, DMX sounds). Every asset script writes finished lumps into a
staging directory under build/ct/lumps/<namespace>/NAME.lmp, which
tools/ct/pack.mjs assembles into assets/wads/chinatown.wad.

Usage from another script:
    import sys, os
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'lib'))
    import doomgfx as dg
"""

import os
import struct

import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
BUILD = os.path.join(ROOT, 'build', 'ct')
LUMPS = os.path.join(BUILD, 'lumps')
CACHE = os.environ.get('CT_CACHE', os.path.join(BUILD, 'cache'))
IWAD = os.path.join(ROOT, 'assets', 'wads', 'doom1.wad')

# Lump namespaces (staging subdirectories) and what pack.mjs does with them.
NAMESPACES = {
    'patches': 'wall patches between P_START/P_END (pictures)',
    'flats': '64x64 flats between F_START/F_END',
    'sprites': 'sprite frames between S_START/S_END (pictures)',
    'sounds': 'DMX sounds (DS*)',
    'music': 'MIDI music (D_*)',
    'graphics': 'other pictures (menu/HUD graphics), outside markers',
    'map': 'map lumps in order (written by build-map.mjs)',
    'data': 'other raw lumps (e.g. TEXTURES manifest is JSON, see pack.mjs)',
}


def read_wad_lump(path, name):
    with open(path, 'rb') as f:
        data = f.read()
    ident, n, off = struct.unpack_from('<4sii', data, 0)
    for i in range(n):
        lo, ls, ln = struct.unpack_from('<ii8s', data, off + i * 16)
        if ln.rstrip(b'\0').decode('ascii', 'replace').upper() == name:
            return data[lo:lo + ls]
    raise KeyError(name)


_PAL = None


def palette():
    """The 256 DOOM palette colours as a (256, 3) uint8 array (PLAYPAL 0)."""
    global _PAL
    if _PAL is None:
        _PAL = np.frombuffer(read_wad_lump(IWAD, 'PLAYPAL')[:768], dtype=np.uint8).reshape(256, 3).copy()
    return _PAL


# Indices never produced by quantization: 247 is the classic "transparent
# cyan" some tools treat specially; the bright cyans/pinks rarely fit art.
EXCLUDE = {247}


def _usable():
    pal = palette().astype(np.float32)
    idx = np.array([i for i in range(256) if i not in EXCLUDE])
    return idx, pal[idx]


def quantize(rgb, exclude=None):
    """Map an (H, W, 3) uint8/float RGB array to DOOM palette indices.

    Uses a perceptually weighted RGB distance (redmean), which keeps skin,
    brick and blood tones close to how id's artists' scans came out. No
    dithering: DOOM art is flat-shaded per pixel.
    """
    idx, pal = _usable()
    if exclude:
        keep = np.array([i not in exclude for i in idx])
        idx, pal = idx[keep], pal[keep]
    a = np.asarray(rgb, dtype=np.float32)[..., :3]
    h, w = a.shape[:2]
    flat = a.reshape(-1, 3)
    out = np.empty(flat.shape[0], dtype=np.uint8)
    step = 65536
    for s in range(0, flat.shape[0], step):
        c = flat[s:s + step][:, None, :]
        d = c - pal[None, :, :]
        rmean = (c[..., 0] + pal[None, :, 0]) / 2
        dist = (2 + rmean / 256) * d[..., 0] ** 2 + 4 * d[..., 1] ** 2 + (2 + (255 - rmean) / 256) * d[..., 2] ** 2
        out[s:s + step] = idx[np.argmin(dist, axis=1)]
    return out.reshape(h, w)


def doomify(img, size=None, contrast=1.0, brightness=1.0, saturation=1.0, resample=None):
    """Resize a PIL image and push its tones toward DOOM's art: slightly
    darker, punchier, less saturated. Returns an RGB(A) numpy array."""
    from PIL import Image, ImageEnhance
    if size:
        img = img.resize(size, resample if resample is not None else Image.LANCZOS)
    has_alpha = img.mode in ('RGBA', 'LA')
    alpha = img.getchannel('A') if has_alpha else None
    rgb = img.convert('RGB')
    if contrast != 1.0:
        rgb = ImageEnhance.Contrast(rgb).enhance(contrast)
    if brightness != 1.0:
        rgb = ImageEnhance.Brightness(rgb).enhance(brightness)
    if saturation != 1.0:
        rgb = ImageEnhance.Color(rgb).enhance(saturation)
    arr = np.asarray(rgb)
    if has_alpha:
        arr = np.dstack([arr, np.asarray(alpha)])
    return arr


def encode_picture(indices, mask=None, left=0, top=0):
    """Encode a DOOM picture (patch/sprite/graphic).

    indices: (H, W) uint8 palette indices. mask: (H, W) bool, True = opaque
    (default: all opaque). left/top: leftoffset/topoffset (sprites: left =
    width/2, top = height - (pixels below the origin)). Posts are split at
    128 rows; heights up to 254 are supported.
    """
    ind = np.asarray(indices, dtype=np.uint8)
    h, w = ind.shape
    if h > 254:
        raise ValueError('picture taller than 254 rows: split it into several patches')
    m = np.ones((h, w), dtype=bool) if mask is None else np.asarray(mask, dtype=bool)
    header = struct.pack('<HHhh', w, h, int(left), int(top))
    cols = []
    for x in range(w):
        col = bytearray()
        y = 0
        while y < h:
            if not m[y, x]:
                y += 1
                continue
            start = y
            while y < h and m[y, x] and y - start < 128:
                y += 1
            run = ind[start:y, x]
            col += bytes([start, len(run), 0]) + run.tobytes() + b'\0'
        col += b'\xff'
        cols.append(bytes(col))
    offsets = []
    pos = len(header) + 4 * w
    for c in cols:
        offsets.append(pos)
        pos += len(c)
    return header + struct.pack('<%dI' % w, *offsets) + b''.join(cols)


def encode_flat(indices):
    """A 64x64 flat (raw 4096 palette indices)."""
    ind = np.asarray(indices, dtype=np.uint8)
    if ind.shape != (64, 64):
        raise ValueError('flats must be 64x64')
    return ind.tobytes()


def encode_dmx(samples_u8, rate=11025):
    """DMX sound lump: format 3, rate, count, 16 pad bytes either side of
    the 8-bit unsigned samples (what DOOM's own DS* lumps contain)."""
    s = np.asarray(samples_u8, dtype=np.uint8).tobytes()
    pad = 16
    body = bytes([s[0]] * pad if s else [128] * pad) + s + bytes([s[-1]] * pad if s else [128] * pad)
    return struct.pack('<HHI', 3, rate, len(body)) + body


def audio_to_u8(path, rate=11025, gain_db=0.0, max_seconds=None, fade_ms=8):
    """Decode any audio file with ffmpeg to mono 8-bit unsigned at `rate`,
    peak-normalised (then gain_db), with short fades to avoid clicks."""
    import subprocess
    args = ['ffmpeg', '-v', 'error', '-i', path]
    if max_seconds:
        args += ['-t', str(max_seconds)]
    args += ['-ac', '1', '-ar', str(rate), '-f', 'f32le', '-']
    raw = subprocess.run(args, check=True, capture_output=True).stdout
    a = np.frombuffer(raw, dtype=np.float32).copy()
    if a.size == 0:
        return np.full(1, 128, dtype=np.uint8)
    peak = float(np.max(np.abs(a))) or 1.0
    a = a / peak * (10 ** (gain_db / 20)) * 0.98
    nf = int(rate * fade_ms / 1000)
    if nf and a.size > 2 * nf:
        ramp = np.linspace(0, 1, nf, dtype=np.float32)
        a[:nf] *= ramp
        a[-nf:] *= ramp[::-1]
    return np.clip(np.round(a * 127 + 128), 0, 255).astype(np.uint8)


def write_lump(namespace, name, data):
    """Write a finished lump to build/ct/lumps/<namespace>/<NAME>.lmp."""
    if namespace not in NAMESPACES:
        raise ValueError(namespace)
    name = name.upper()
    if len(name) > 8:
        raise ValueError('lump name too long: ' + name)
    d = os.path.join(LUMPS, namespace)
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, name + '.lmp'), 'wb') as f:
        f.write(data)
    return name


def write_preview(path, indices, mask=None, scale=1):
    """Save a PNG preview of palette-indexed art (for eyeballing)."""
    from PIL import Image
    pal = palette()
    rgb = pal[np.asarray(indices)]
    if mask is not None:
        rgba = np.dstack([rgb, (np.asarray(mask) * 255).astype(np.uint8)])
        im = Image.fromarray(rgba, 'RGBA')
    else:
        im = Image.fromarray(rgb, 'RGB')
    if scale != 1:
        im = im.resize((im.width * scale, im.height * scale), Image.NEAREST)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path)
