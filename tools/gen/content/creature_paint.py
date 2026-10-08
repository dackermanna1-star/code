"""Creature texture painter (module C): paints every cube face of a packed creature geometry.

Per texel we know the face direction and the 3D position on the creature (root model space), so patterns
(spots, stripes, scales...) flow continuously across parts and stay left/right symmetric (|x|).
Colours are quantised to small per-material ramps for clean pixel art; faces get directional shading (lighter
tops/backs, darker undersides), a 1px top highlight / bottom shade on tall faces and a little grain.
Faces with a ``face`` dict get eyes / mouths / nostrils / teeth painted on their front (-z) face.

Outputs: the base texture (RGBA) and an emissive overlay (eyes, glow material, glow_lines) for RenderTypes.eyes.
"""
from __future__ import annotations

import colorsys
import math

import numpy as np
from PIL import Image

from .creature_geo import FACES, all_cubes, face_local_points, face_rects, part_matrix


# --------------------------------------------------------------------------------------------- colour helpers
def rgb(h):
    h = h.strip().lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    if len(h) == 8:
        h = h[2:]
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], float)


def to_hex(c):
    c = np.clip(np.round(c), 0, 255).astype(int)
    return "#%02x%02x%02x" % tuple(c)


def mix(a, b, t):
    return a * (1 - t) + b * t


def lum(c):
    return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]


def ramp(base, n=7, spread=1.0):
    """n shades dark->light around base (index n//2 == base) with hue shifting (cool shadows, warm lights)."""
    r, g, b = (base / 255.0).tolist()
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    out = []
    mid = n // 2
    for i in range(n):
        k = (i - mid) / mid  # -1..1
        if k < 0:
            ll = l * (1 + 0.55 * k * spread)
            hh = h + 0.025 * k * (1 if 0.1 < h < 0.6 else -1)
            ss = min(1.0, s * (1 - 0.1 * k))
        else:
            ll = l + (1 - l) * 0.42 * k * spread
            hh = h + 0.02 * k * (1 if h < 0.17 or h > 0.6 else -1)
            ss = s * (1 - 0.18 * k)
        rr, gg, bb = colorsys.hls_to_rgb(hh % 1.0, max(0, min(1, ll)), max(0, min(1, ss)))
        out.append(np.array([rr, gg, bb]) * 255)
    return out


# --------------------------------------------------------------------------------------------- noise
def _hash3(ix, iy, iz, seed):
    h = (ix * 374761393 + iy * 668265263 + iz * 2147483647 + seed * 1274126177) & 0xFFFFFFFF
    h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
    h = h ^ (h >> 16)
    return (h & 0xFFFF) / 65535.0


def vnoise3(P, cell, seed):
    """Smooth 3D value noise in [0,1] for points P (..., 3)."""
    q = P / cell
    i0 = np.floor(q).astype(np.int64)
    f = q - i0
    f = f * f * (3 - 2 * f)
    out = 0
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                w = (f[..., 0] if dx else 1 - f[..., 0]) * (f[..., 1] if dy else 1 - f[..., 1]) * (f[..., 2] if dz else 1 - f[..., 2])
                out = out + w * _hash3(i0[..., 0] + dx, i0[..., 1] + dy, i0[..., 2] + dz, seed)
    return out


def worley3(P, cell, seed):
    """(F1 distance in px, cell id hash) for points P."""
    q = P / cell
    i0 = np.floor(q).astype(np.int64)
    best = np.full(P.shape[:-1], 1e9)
    bid = np.zeros(P.shape[:-1])
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for dz in (-1, 0, 1):
                cx, cy, cz = i0[..., 0] + dx, i0[..., 1] + dy, i0[..., 2] + dz
                jx = _hash3(cx, cy, cz, seed)
                jy = _hash3(cx, cy, cz, seed + 1)
                jz = _hash3(cx, cy, cz, seed + 2)
                fx = (cx + 0.15 + 0.7 * jx) * cell
                fy = (cy + 0.15 + 0.7 * jy) * cell
                fz = (cz + 0.15 + 0.7 * jz) * cell
                d = np.sqrt((P[..., 0] - fx) ** 2 + (P[..., 1] - fy) ** 2 + (P[..., 2] - fz) ** 2)
                m = d < best
                best = np.where(m, d, best)
                bid = np.where(m, _hash3(cx, cy, cz, seed + 3), bid)
    return best, bid


def white(shape, seed):
    return np.random.default_rng(seed & 0xFFFFFFFF).random(shape)


# --------------------------------------------------------------------------------------------- palette
class Palette:
    def __init__(self, colors, translucent=False):
        cols = [rgb(c) for c in colors] if colors else [rgb("#888888")]
        while len(cols) < 4:
            cols.append({1: mix(cols[0], np.array([255, 255, 255.]), 0.4), 2: mix(cols[0], np.array([255, 220, 120.]), 0.5),
                         3: np.array([20, 20, 24.])}[len(cols)])
        self.primary, self.second, self.accent, self.eye = cols[:4]
        self.extra = cols[4:]
        P, S, A = self.primary, self.second, self.accent
        ivory = np.array([232, 224, 200.])
        belly = mix(mix(P, S, 0.45), np.array([255, 255, 255.]), 0.12)
        base = {
            "body": P, "belly": belly, "second": S, "accent": A, "dark": P * 0.42 + S * 0.05,
            "horn": mix(ivory, A, 0.22), "horn_tip": mix(mix(ivory, A, 0.5), P * 0.4, 0.35), "glow": A,
            "wing": S, "mothwing": mix(P, S, 0.55), "membrane": mix(S, np.array([255, 255, 255.]), 0.35), "membrane_dark": mix(P, S, 0.4) * 0.8,
            "paper": np.array([238, 232, 216.]) * 0.6 + S * 0.4, "teeth": np.array([240, 234, 214.]),
            "inner": np.array([96, 24, 36.]), "shell": S, "cap": S, "gills": mix(P, np.array([255, 250, 235.]), 0.4),
            "stem": P, "leaf": S, "beak": mix(A, np.array([240, 190, 60.]), 0.35), "beak_dark": mix(A, np.array([240, 190, 60.]), 0.35) * 0.6,
            "eye": np.array([238, 236, 228.]),
        }
        self.ramps = {k: ramp(v) for k, v in base.items()}
        self.base = base
        self.translucent = translucent

    def col(self, mat, level):
        r = self.ramps.get(mat) or self.ramps["body"]
        return r[int(max(0, min(len(r) - 1, level)))]


SECOND_FOR = {"body": "second", "belly": "second", "stem": "second", "second": "accent", "shell": "accent", "cap": "accent",
              "wing": "accent", "leaf": "accent"}
PATTERN_MATS = {"body", "belly", "second", "stem", "wing", "shell"}


# --------------------------------------------------------------------------------------------- painting
class Canvas:
    def __init__(self, w, h):
        self.rgb = np.zeros((h, w, 3))
        self.a = np.zeros((h, w))
        self.glow = np.zeros((h, w, 4))

    def put(self, u, v, col, alpha=255, glow=False):
        H, W = self.a.shape
        if 0 <= u < W and 0 <= v < H:
            self.rgb[v, u] = col
            self.a[v, u] = alpha
            if glow:
                self.glow[v, u, :3] = col
                self.glow[v, u, 3] = 255
            else:
                self.glow[v, u, 3] = 0

    def images(self):
        base = np.concatenate([self.rgb, self.a[..., None]], -1)
        return (Image.fromarray(np.clip(np.round(base), 0, 255).astype(np.uint8), "RGBA"),
                Image.fromarray(np.clip(np.round(self.glow), 0, 255).astype(np.uint8), "RGBA"))


FACE_SHADE = {"top": 1.0, "bottom": -1.5, "north": 0.0, "south": 0.25, "west": -0.1, "east": -0.1}


def paint(root, tex_w, tex_h, creature, knobs, seed=1):
    pal = Palette(creature.colors, knobs.flag("translucent"))
    pattern = (creature.pattern or "plain").lower()
    glow_eyes = bool(getattr(creature, "glow_eyes", True))
    cv = Canvas(tex_w, tex_h)
    lo, hi = _bounds_y(root)
    for p, c in all_cubes(root):
        if c.uv is None:
            continue
        M = part_matrix(p)
        rects = face_rects(c)
        for face in FACES:
            u, v, fw, fh = rects[face]
            if fw <= 0 or fh <= 0:
                continue
            L = face_local_points(c, face)
            A = (np.concatenate([L, np.ones(L.shape[:-1] + (1,))], -1) @ M.T)[..., :3]
            _paint_face(cv, pal, c, face, u, v, fw, fh, L, A, pattern, seed, lo, hi, glow_eyes, knobs)
        if c.face:
            _paint_features(cv, pal, c, rects, glow_eyes, knobs, creature)
        _sync_flat_faces(cv, c, rects)
    base, glow = cv.images()
    if not glow.getbbox():
        glow = None
    return base, glow


def _sync_flat_faces(cv, c, rects):
    """Zero-thickness cuboids (wings, fins, planes) have two coplanar faces; paint them identically so they never
    z-fight with different pixels."""
    w, h, d = c.size

    def copy(src, dst, mirror):
        su, sv, fw, fh = rects[src]
        du, dv, _, _ = rects[dst]
        for arr in (cv.rgb, cv.a, cv.glow):
            block = arr[sv:sv + fh, su:su + fw].copy()
            if mirror:
                block = block[:, ::-1]
            arr[dv:dv + fh, du:du + fw] = block

    if h == 0 and w > 0 and d > 0:
        copy("top", "bottom", False)
    if d == 0 and w > 0 and h > 0:
        copy("north", "south", True)
    if w == 0 and d > 0 and h > 0:
        copy("west", "east", True)


def _bounds_y(root):
    ys = []
    for p, c in all_cubes(root):
        M = part_matrix(p)
        y = (M @ np.array([c.origin[0], c.origin[1], c.origin[2], 1.0]))[1]
        ys += [y, y + c.size[1]]
    return (min(ys), max(ys)) if ys else (0, 24)


def _pattern_field(pattern, A, seed, lo, hi, mat):
    """-> (use_second mask, level offset, glow mask) for absolute points A (fh, fw, 3)."""
    P = A.copy()
    P[..., 0] = np.abs(P[..., 0])
    shp = A.shape[:-1]
    sec = np.zeros(shp, bool)
    off = np.zeros(shp)
    glow = np.zeros(shp, bool)
    acc = np.zeros(shp, bool)
    if pattern == "spots":
        d, bid = worley3(P + np.array([0.0, 0, 0]), 5.0, seed)
        rad = 1.1 + 0.9 * bid
        sec = d < rad
        off += np.where(d < rad * 0.5, 0.6, 0)
    elif pattern == "stripes":
        n = vnoise3(P, 4.0, seed) - 0.5
        band = np.floor((P[..., 2] + P[..., 1] * 0.35 + n * 3.0) / 3.0)
        sec = (band % 2) == 0
        off += np.where(sec, -0.3, 0)
    elif pattern == "speckle":
        w = white(shp, seed + int(abs(A[..., 0].sum() * 7 + A[..., 2].sum() * 13)) % 9973)
        acc = w > 0.9
        sec = (w > 0.78) & ~acc
    elif pattern == "gradient":
        t = (A[..., 1] - lo) / max(1e-6, hi - lo)
        t = t + (vnoise3(P, 3.0, seed) - 0.5) * 0.25
        sec = t > 0.55
        off += np.where(t < 0.3, 0.6, 0) + np.where((t > 0.45) & (t < 0.6), -0.4, 0)
    elif pattern == "scales":
        # offset rows of little arcs in face-space-ish coordinates
        y = np.floor(P[..., 1] / 2.0)
        x = np.floor((P[..., 0] + P[..., 2] + (y % 2) * 1.5) / 3.0)
        fy = (P[..., 1] / 2.0) % 1
        fx = ((P[..., 0] + P[..., 2] + (y % 2) * 1.5) / 3.0) % 1
        edge = (fy > 0.5) & ((fx < 0.34) | (fx > 0.67))
        off += np.where(edge, -1.0, 0) + np.where((fy < 0.5) & (fx > 0.3) & (fx < 0.7), 0.6, 0)
        sec = ((x + y) % 5 == 0)
    elif pattern == "crystal":
        d, bid = worley3(P, 4.0, seed)
        off += np.round((bid - 0.5) * 3) * 0.7
        d2, _ = worley3(P + 0.9, 4.0, seed)
        edge = np.abs(d - d2) < 0.35
        acc = edge
        glow = edge
    elif pattern == "veins":
        n = vnoise3(P, 6.0, seed) + 0.5 * vnoise3(P, 3.0, seed + 5)
        n = n / 1.5
        acc = np.abs(n - 0.5) < 0.035
        off += np.where(np.abs(n - 0.5) < 0.08, -0.6, 0)
    elif pattern == "patches":
        n = vnoise3(P, 7.0, seed) * 0.75 + vnoise3(P, 3.0, seed + 3) * 0.25
        sec = n > 0.58
        off += np.where((n > 0.54) & (n < 0.6), -0.6, 0)
    elif pattern == "glow_lines":
        n = vnoise3(P, 5.0, seed) * 0.7 + vnoise3(P, 2.5, seed + 9) * 0.3
        line = np.abs(n - 0.5) < 0.045
        acc = line
        glow = line
        off += np.where(np.abs(n - 0.5) < 0.1, -0.5, 0)
    elif pattern == "checker":
        k = np.floor(P[..., 0] / 3.0 + 0.5) + np.floor(P[..., 1] / 3.0) + np.floor(P[..., 2] / 3.0)
        sec = (k % 2) == 0
    elif pattern == "rings":
        band = np.floor(P[..., 2] / 2.0)
        sec = (band % 3) == 0
    return sec, off, glow, acc


def _paint_face(cv, pal, c, face, u, v, fw, fh, L, A, pattern, seed, lo, hi, glow_eyes, K):
    mat = c.mat
    if mat == "eye":
        _paint_eyeball_face(cv, pal, face, u, v, fw, fh, glow_eyes)
        return
    lvl = np.full((fh, fw), 3.0) + FACE_SHADE[face]
    # vertical gradient on side faces (lighter near the top of the creature)
    if face not in ("top", "bottom"):
        t = (A[..., 1] - lo) / max(1e-6, hi - lo)
        lvl += (0.5 - t) * 0.9
        if fh >= 4 and c.shade:
            lvl[0, :] += 0.45
            lvl[-1, :] -= 0.55
    # grain
    rnd = white((fh, fw), seed * 31 + u * 7 + v * 13 + FACES.index(face))
    lvl += (rnd - 0.5) * 0.7
    mats = np.full((fh, fw), mat, dtype=object)
    glow = np.zeros((fh, fw), bool)
    alpha = np.full((fh, fw), 255.0)
    if c.pattern and mat in PATTERN_MATS and pattern != "plain":
        sec, off, gl, acc = _pattern_field(pattern, A, seed, lo, hi, mat)
        lvl += off
        second = SECOND_FOR.get(mat, "second")
        mats = np.where(sec, second, mats)
        mats = np.where(acc, "accent", mats)
        glow |= gl
    # countershaded belly
    if mat == "body" and K.flag("belly", True):
        if face == "bottom":
            mats[:, :] = "belly"
            lvl += 1.0
        elif face not in ("top",) and fh >= 5:
            mats[-max(1, fh // 4):, :] = np.where(mats[-max(1, fh // 4):, :] == "body", "belly", mats[-max(1, fh // 4):, :])
    # material specific textures
    if mat in ("shell",):
        ring = (np.floor((np.abs(A[..., 0]) + A[..., 2] + A[..., 1]) / 2.0) % 3 == 0)
        lvl += np.where(ring, -1.0, 0.3)
    if mat == "cap":
        d, bid = worley3(A * np.array([1, 1, 1]), 5.0, seed + 77)
        spot = (d < 1.3 + bid * 0.6) & (face != "bottom")
        mats = np.where(spot, "accent", mats)
        lvl += np.where(spot, 1.5, 0)
        if face == "bottom":
            mats[:, :] = "gills"
    if mat == "gills":
        lvl += np.where((np.arange(fw)[None, :] + np.arange(fh)[:, None]) % 2 == 0, -0.8, 0.3)
    if mat in ("wing",) and K.str("kind", "") not in ("moth",):
        # feathers: coverts in the body colour, flight feathers (trailing half) in the secondary colour
        j = np.arange(fh)[:, None] * np.ones((1, fw))
        i = np.arange(fw)[None, :] * np.ones((fh, 1))
        if face in ("top", "bottom"):
            front = j < fh * 0.45
            mats = np.where(front, "body", "wing")
            lvl += np.where(front, 0.3, np.where((i % 2) == 0, -0.7, 0.2))
            lvl += np.where(j >= fh - 1, -1.0, 0)
        else:
            lvl += np.where((i % 3) == 0, -0.6, 0.2)
    if mat == "mothwing" and face in ("top", "bottom"):
        I_, J_ = np.meshgrid(np.arange(fw), np.arange(fh))
        cx, cy = (fw - 1) * 0.55, (fh - 1) * 0.5
        d = np.hypot((I_ - cx) / max(1, fw * 0.22), (J_ - cy) / max(1, fh * 0.3))
        mats = np.where(d < 1.0, "accent", mats)
        mats = np.where(d < 0.45, "dark", mats)
        lvl += np.where((d >= 1.0) & (d < 1.35), -1.2, 0) + np.where(d < 1.0, 0.8, 0)
        edge = (I_ == 0) | (I_ == fw - 1) | (J_ == 0) | (J_ == fh - 1)
        lvl += np.where(edge, -1.3, 0)
        glow |= (d < 1.0) & (d >= 0.45) & (pattern == "glow_lines")
    if mat == "membrane":
        d, bid = worley3(A, 3.2, seed + 11)
        d2, _ = worley3(A + 0.7, 3.2, seed + 11)
        vein = np.abs(d - d2) < 0.45
        mats = np.where(vein, "membrane_dark", mats)
        lvl += np.where(vein, -0.5, 0.8 + (bid - 0.5))
        alpha = np.where(vein, 255, 200)
    if mat == "membrane_dark":
        i = np.arange(fw)[None, :] * np.ones((fh, 1))
        lvl += np.where(i % 4 == 0, -1.0, 0)
    if mat == "paper":
        i = np.arange(fw)[None, :] * np.ones((fh, 1))
        j = np.arange(fh)[:, None] * np.ones((1, fw))
        lvl += np.where((i + j) % 5 == 0, -0.8, 0.5)
    if mat == "glow":
        glow[:, :] = True
        lvl = np.full((fh, fw), 4.0) + (rnd - 0.5) * 1.6
    if mat == "leaf":
        i = np.arange(fw)[None, :] * np.ones((fh, 1))
        lvl += np.where(i == fw // 2, -1.0, 0)
    if pal.translucent and mat in ("body", "belly", "second", "stem"):
        alpha = np.minimum(alpha, 175)
    for j in range(fh):
        for i in range(fw):
            m = mats[j, i]
            col = pal.col(m, round(lvl[j, i]))
            g = bool(glow[j, i]) or m == "glow"
            cv.put(u + i, v + j, col, alpha[j, i], g)


def _paint_eyeball_face(cv, pal, face, u, v, fw, fh, glow_eyes):
    white_ = pal.col("eye", 4)
    shade = pal.col("eye", 2)
    for j in range(fh):
        for i in range(fw):
            cv.put(u + i, v + j, white_ if face != "bottom" else shade)
    if face == "north" or face in ("west", "east"):
        iris = pal.eye
        cx, cy = (fw - 1) / 2.0, (fh - 1) / 2.0
        for j in range(fh):
            for i in range(fw):
                d = max(abs(i - cx), abs(j - cy))
                if d <= max(0.5, min(fw, fh) / 2 - 0.5) and face == "north" or (face != "north" and i == (fw - 1 if face == "west" else 0) and False):
                    col = iris if d > 0.5 or min(fw, fh) <= 2 else pal.col("dark", 0) * 0.3
                    if min(fw, fh) <= 2:
                        col = iris * 0.35 if (i + j) % 2 else iris
                    cv.put(u + i, v + j, col, 255, glow_eyes)
        if face == "north" and fw >= 2 and fh >= 2:
            cv.put(u, v, np.array([255, 255, 255.]), 255, glow_eyes)


# --------------------------------------------------------------------------------------------- face features
EYE_SPRITES = {
    # chars: W sclera, I iris, P pupil, H highlight, G glow iris, D lid (body dark)
    ("cute", 1): ["P"], ("cute", 2): ["HP", "PP"], ("cute", 3): ["HPP", "PPP", "PPP"], ("cute", 4): ["HHPP", "HPPP", "PPPP", "PPPP"],
    ("round", 1): ["P"], ("round", 2): ["WI", "WP"], ("round", 3): ["WWI", "WIP"], ("round", 4): ["WWII", "WWIP", "WWIP"],
    ("slit", 1): ["P"], ("slit", 2): ["IP", "IP"], ("slit", 3): ["IPI", "IPI"], ("slit", 4): ["IIPI", "IIPI", "IIPI"],
    ("glow", 1): ["G"], ("glow", 2): ["GG"], ("glow", 3): ["GGG", "GGG"], ("glow", 4): ["GGGG", "GGGG"],
    ("compound", 1): ["P"], ("compound", 2): ["HP", "PP"], ("compound", 3): ["HIP", "IPP", "PPP"], ("compound", 4): ["HIIP", "IIPP", "IPPP", "PPPP"],
    ("angry", 1): ["P"], ("angry", 2): ["WP"], ("angry", 3): ["WIP", "WIP"], ("angry", 4): ["WWIP", "WWIP"],
    ("sleepy", 1): ["D"], ("sleepy", 2): ["DD", "WP"], ("sleepy", 3): ["DDD", "WIP"], ("sleepy", 4): ["DDDD", "WWIP"],
}


def _eye_positions(n, fw, fh, sw, sh):
    """Top-left corners for n eye sprites of size sw x sh on a fw x fh face."""
    ey = int(round(fh * 0.32 - sh / 2.0)) if fh >= 5 else 0
    ey = max(0, min(fh - sh, ey))
    pos = []
    if n == 1:
        pos = [((fw - sw) // 2, ey)]
    elif n == 2:
        gap = max(1, int(round(fw * 0.18)))
        if fw - 2 * sw < 2 * gap:
            gap = max(0, (fw - 2 * sw) // 2)
        cx = fw / 2.0
        xl = int(math.floor(cx - gap / 2.0 - sw))
        xr = fw - xl - sw
        if xr <= xl + sw - 1:
            xl, xr = 0, fw - sw
        pos = [(xl, ey), (xr, ey)]
    else:
        rows = 1 if n <= max(2, fw // (sw + 1)) else 2
        per = math.ceil(n / rows)
        for r in range(rows):
            k = per if r < rows - 1 else n - per * (rows - 1)
            span = k * sw + (k - 1)
            x0 = max(0, (fw - span) // 2)
            for i in range(k):
                pos.append((x0 + i * (sw + 1), max(0, ey - (1 if rows == 2 else 0) + r * (sh + 1))))
    return pos


def _paint_features(cv, pal, c, rects, glow_eyes, K, creature):
    f = c.face
    u, v, fw, fh = rects["north"]
    dark = pal.col("dark", 1)
    inner = pal.col("inner", 2)
    teeth = pal.col("teeth", 4)
    if f.get("big_eye"):
        _paint_big_eye(cv, pal, u, v, fw, fh, glow_eyes, creature)
        return
    if f.get("eye_ball"):
        for j in range(fh):
            for i in range(fw):
                cv.put(u + i, v + j, pal.eye if (i + j) % 3 else pal.eye * 0.7, 255, True)
        return
    if f.get("spiral"):
        for fname in ("west", "east"):
            uu, vv, ww, hh = rects[fname]
            cx, cy = (ww - 1) / 2.0, (hh - 1) / 2.0
            for j in range(hh):
                for i in range(ww):
                    dx, dy = i - cx, j - cy
                    r = math.hypot(dx, dy)
                    a = math.atan2(dy, dx)
                    s = (r - a / (2 * math.pi) * 2.2) % 2.2
                    if s < 0.8:
                        cv.put(uu + i, vv + j, pal.col("shell", 1))
                    elif s > 1.8:
                        cv.put(uu + i, vv + j, pal.col("shell", 5))
        return
    if f.get("inner_ear") and fw >= 3:
        for j in range(1, fh):
            for i in range(1, fw - 1):
                cv.put(u + i, v + j, pal.col("belly", 4) * 0.8 + np.array([255, 150, 160.]) * 0.2)
    if f.get("nostrils") and fw >= 2:
        cy = 0 if fh <= 2 else 1
        if fw >= 4:
            cv.put(u + fw // 2 - 2 + (fw % 2 == 0) * 0, v + cy, dark)
            cv.put(u + fw // 2 + 1, v + cy, dark)
        else:
            cv.put(u + fw // 2, v + cy, dark)
    if f.get("teeth_top"):
        for i in range(fw):
            if i % 2 == 0:
                cv.put(u + i, v, teeth)
    if f.get("lock"):
        cv.put(u + fw // 2, v + 1, dark)
    eyes = int(f.get("eyes", 0) or 0)
    style = f.get("eye_style", "round") or "round"
    if style == "none":
        eyes = 0
    size = int(f.get("eye_size", 2) or 2)
    if eyes:
        # shrink sprites that do not fit
        while size > 1:
            spr = EYE_SPRITES.get((style, size)) or EYE_SPRITES[("round", size)]
            sw, sh = len(spr[0]), len(spr)
            need = eyes * sw + (eyes - 1) if eyes <= 2 else min(eyes, 4) * (sw + 1)
            if need <= fw and sh <= max(1, fh - 1):
                break
            size -= 1
        spr = EYE_SPRITES.get((style, size)) or EYE_SPRITES[("round", size)]
        sw, sh = len(spr[0]), len(spr)
        iris = pal.eye
        lid = pal.col("body", 1)
        pupil = np.array([18, 16, 22.]) if style != "compound" else pal.eye * 0.35
        if style == "cute":
            pupil = np.minimum(pal.eye, np.array([60, 60, 70.])) * 0.6 + np.array([12, 10, 16.]) * 0.4
        cols = {"W": np.array([240, 238, 230.]), "I": iris, "P": pupil, "H": np.array([255, 255, 255.]),
                "G": mix(iris, np.array([255, 255, 255.]), 0.15), "D": lid}
        glowing = {"I", "G", "H"} if glow_eyes else set()
        if glow_eyes and style in ("glow",):
            glowing = {"G", "I", "H", "P"}
        positions = _eye_positions(eyes, fw, fh, sw, sh)
        for k, (ex, ey) in enumerate(positions):
            mirror = (eyes >= 2 and ex + sw / 2.0 > fw / 2.0)
            for j, row in enumerate(spr):
                for i, ch in enumerate(row):
                    ii = (sw - 1 - i) if mirror else i
                    if ch == ".":
                        continue
                    cv.put(u + ex + ii, v + ey + j, cols[ch], 255, ch in glowing)
            if f.get("brows") and ey >= 1:
                for i in range(sw):
                    yy = ey - 1 + (1 if (i >= sw - 1) != mirror and sw > 1 and ey + 0 < fh else 0) * 0
                    cv.put(u + ex + i, v + ey - 1, dark)
                inner_x = ex + (0 if mirror else sw - 1)
                cv.put(u + inner_x, v + ey, dark)
            if f.get("blush") and ey + sh + 1 < fh:
                bx = ex - 1 if not mirror else ex + sw
                if 0 <= bx < fw:
                    cv.put(u + bx, v + ey + sh, np.array([240, 120, 140.]))
    mouth = f.get("mouth", "none") or "none"
    if mouth != "none" and fh >= 3 and fw >= 3:
        my = fh - 2 if fh >= 5 else fh - 1
        mw = max(2, min(fw - 2, int(round(fw * 0.4))))
        mx = (fw - mw) // 2
        if mouth == "smile":
            for i in range(mx + 1, mx + mw - 1):
                cv.put(u + i, v + my, dark)
            cv.put(u + mx, v + my - 1, dark)
            cv.put(u + mx + mw - 1, v + my - 1, dark)
            if mw <= 2:
                cv.put(u + mx, v + my, dark)
                cv.put(u + mx + 1, v + my, dark)
        elif mouth == "frown":
            for i in range(mx + 1, mx + mw - 1):
                cv.put(u + i, v + my - 1, dark)
            cv.put(u + mx, v + my, dark)
            cv.put(u + mx + mw - 1, v + my, dark)
        elif mouth in ("fangs", "grin", "tusks"):
            for i in range(mx, mx + mw):
                cv.put(u + i, v + my - (1 if mouth == "fangs" else 0), inner if mouth == "grin" else dark)
            if mouth == "fangs":
                cv.put(u + mx, v + my, teeth)
                cv.put(u + mx + mw - 1, v + my, teeth)
            elif mouth == "grin":
                for i in range(mx, mx + mw, 2):
                    cv.put(u + i, v + my, teeth)
        elif mouth in ("open", "maw"):
            mh = 2 if fh < 8 else 3
            for j in range(mh):
                for i in range(mx, mx + mw):
                    cv.put(u + i, v + fh - 1 - mh + j, inner)
            for i in range(mx, mx + mw, 2):
                cv.put(u + i, v + fh - 1 - mh, teeth)
                if mouth == "maw":
                    cv.put(u + i + 1 if i + 1 < mx + mw else u + i, v + fh - 2, teeth)
        elif mouth == "maw_ring":
            cx, cy = (fw - 1) / 2.0, (fh - 1) / 2.0
            rr = min(fw, fh) / 2.0 - 0.5
            for j in range(fh):
                for i in range(fw):
                    d = math.hypot(i - cx, j - cy)
                    if d < rr * 0.55:
                        cv.put(u + i, v + j, inner * (0.5 + 0.5 * d / rr))
                    elif d < rr * 0.8 and (int(math.atan2(j - cy, i - cx) * 4) % 2 == 0):
                        cv.put(u + i, v + j, teeth)


def _paint_big_eye(cv, pal, u, v, fw, fh, glow_eyes, creature):
    cx, cy = (fw - 1) / 2.0, (fh - 1) / 2.0
    R = min(fw, fh) / 2.0
    hostile = getattr(creature, "behavior", "") == "hostile"
    for j in range(fh):
        for i in range(fw):
            d = math.hypot(i - cx, j - cy) / R
            if d < 0.92:
                col = np.array([236, 232, 224.])
                if d > 0.75:
                    col = col * 0.85
                g = False
                if d < 0.62:
                    t = d / 0.62
                    col = mix(pal.eye * 1.15, pal.eye * 0.6, t)
                    col = np.clip(col, 0, 255)
                    g = glow_eyes
                if d < 0.26:
                    col = np.array([14, 10, 18.])
                    if hostile:
                        g = glow_eyes
                if hostile and 0.66 < d < 0.9 and (int(i * 7 + j * 3) % 5 == 0):
                    col = np.array([200, 50, 60.])
                cv.put(u + i, v + j, col, 255, g)
    hx, hy = int(cx - R * 0.35), int(cy - R * 0.35)
    cv.put(u + hx, v + hy, np.array([255, 255, 255.]), 255, glow_eyes)
    if R >= 4:
        cv.put(u + hx + 1, v + hy, np.array([255, 255, 255.]), 255, glow_eyes)
        cv.put(u + hx, v + hy + 1, np.array([255, 255, 255.]), 255, glow_eyes)


# --------------------------------------------------------------------------------------------- misc textures
def orb_textures():
    """(glow, core) 16x16 white textures for the creature orb projectile (tinted at render time)."""
    n = 16
    g = np.zeros((n, n, 4))
    k = np.zeros((n, n, 4))
    c = (n - 1) / 2.0
    for j in range(n):
        for i in range(n):
            d = math.hypot(i - c, j - c) / (n / 2.0)
            a = max(0.0, 1 - d) ** 1.6
            g[j, i] = (255, 255, 255, round(a * 255))
            if d < 0.55:
                k[j, i] = (255, 255, 255, 255 if d < 0.4 else 160)
    return (Image.fromarray(g.astype(np.uint8), "RGBA"), Image.fromarray(k.astype(np.uint8), "RGBA"))


def fallback_egg(base_hex, spot_hex, seed):
    """Simple vanilla-like spawn egg if gen.textures.spawn_egg is unavailable."""
    n = 16
    img = np.zeros((n, n, 4))
    b = ramp(rgb(base_hex), 5)
    s = ramp(rgb(spot_hex), 5)
    rnd = np.random.default_rng(seed)
    spots = set()
    for _ in range(6):
        spots.add((int(rnd.integers(5, 11)), int(rnd.integers(4, 13))))
    for j in range(n):
        for i in range(n):
            dx = (i - 7.5) / 5.0
            dy = (j - 8.5) / 6.5 if j > 8 else (j - 8.5) / 6.8
            dd = dx * dx + dy * dy * (1.0 + 0.25 * (j < 8))
            if dd <= 1.0:
                lv = 2 + (1 if dx < -0.2 and dy < 0 else 0) - (1 if dx > 0.4 or dy > 0.6 else 0)
                col = b[lv]
                if (i, j) in spots or (i - 1, j) in spots:
                    col = s[lv + 1]
                if dd > 0.78:
                    col = b[0]
                img[j, i] = (*col, 255)
    return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8), "RGBA")
