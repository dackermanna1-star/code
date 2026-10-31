"""Block textures (16x16, tileable).  Animated ones are vertical frame strips + .mcmeta.

Procedural fields are always quantised onto small hand-picked palettes so the
result reads as deliberate pixel art rather than noise.
"""
from __future__ import annotations

import math

import numpy as np

import texlib as T

PI = math.pi


def pal(*hexes):
    return np.array([T.rgb(h) for h in hexes], dtype=np.uint8)


def to_img(idx, palette):
    h, w = idx.shape
    out = np.zeros((h, w, 4), np.uint8)
    out[..., :3] = palette[np.clip(idx, 0, len(palette) - 1)]
    out[..., 3] = 255
    return out


def tile_noise(n, cells, seed, octaves=3, ax=1.0, ay=1.0):
    """Tileable fbm on an n x n grid; ax/ay stretch the cell count per axis."""
    total = np.zeros((n, n))
    amp, norm = 1.0, 0.0
    for o in range(octaves):
        cx = max(1, int(round(cells * 2 ** o * ax)))
        cy = max(1, int(round(cells * 2 ** o * ay)))
        total += amp * T.value_noise(n, n, cx, cy, seed=seed + 31 * o, periodic=True)
        norm += amp
        amp *= 0.5
    return total / norm


def shifted(field, dx, dy):
    return np.roll(np.roll(field, dy, axis=0), dx, axis=1)


# ---------------------------------------------------------- void barrier (8f)
def void_barrier():
    P = pal("#030209", "#060512", "#0b0920", "#120e2e", "#1b1540", "#2a2158", "#9aa4e0",
            "#d6e4ff", "#ffffff")
    # indices: 0-5 background ramp, 6 dim star, 7 bright star, 8 white core
    rng = np.random.default_rng(42)
    big = tile_noise(64, 2, seed=5, octaves=4)         # sample a 64-res tile, use 16x16 window via stride
    neb_a = big[::4, ::4]
    neb_b = tile_noise(16, 2, seed=9, octaves=3)
    stars = [(2, 3, 0.0, 2), (11, 1, 1.3, 1), (6, 8, 2.1, 1), (14, 10, 3.4, 1), (9, 13, 4.2, 0),
             (1, 12, 5.0, 1), (4, 5, 0.7, 0), (13, 6, 2.8, 0), (8, 3, 4.9, 0), (11, 15, 1.9, 0),
             (0, 7, 3.9, 0), (6, 14, 5.6, 0)]
    frames = []
    for k in range(8):
        ph = 2 * PI * k / 8
        f = 0.6 * shifted(neb_a, 2 * k, 0) + 0.4 * shifted(neb_b, 0, 2 * k)
        f = (f - f.min()) / (f.max() - f.min() + 1e-9)
        idx = np.digitize(f, [0.30, 0.52, 0.68, 0.80, 0.90])
        for (x, y, phase, size) in stars:
            b = 0.5 + 0.5 * math.cos(ph + phase)
            if size == 0:          # tiny twinkler
                if b > 0.35:
                    idx[y, x] = max(idx[y, x], 6 if b < 0.8 else 7)
                continue
            core = 8 if b > 0.6 else 7 if b > 0.25 else 6
            idx[y, x] = core
            if size == 2 and b > 0.45:
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    yy, xx = (y + dy) % 16, (x + dx) % 16
                    idx[yy, xx] = max(idx[yy, xx], 6 if b < 0.85 else 7)
        frames.append(to_img(idx, P))
    strip = np.concatenate(frames, axis=0)
    T.save(strip, "block/unlimited_void_barrier.png")
    T.save_mcmeta("block/unlimited_void_barrier.png", 4, True)
    return strip


# --------------------------------------------------------------- void floor (4f)
def void_floor():
    P = pal("#040309", "#08060f", "#0c0a17", "#110e20", "#17132b", "#201b3a", "#2c2650", "#7d84bb", "#e8edff")
    base = tile_noise(16, 2, seed=21, octaves=3)
    base = (base - base.min()) / (base.max() - base.min())
    brk = tile_noise(16, 3, seed=5, octaves=2)
    ys, xs = np.mgrid[0:16, 0:16]
    frames = []
    for k in range(4):
        idx = np.digitize(base, [0.3, 0.55, 0.8]) + 1          # 1..4 glassy body
        dpos = (xs + ys - 4 * k) % 16
        vis = brk > 0.42
        idx = np.where((dpos == 4) & vis, np.maximum(idx, 5), idx)
        idx = np.where((dpos == 5) & vis & (brk > 0.55), np.maximum(idx, 6), idx)
        idx = np.where((dpos == 5) & vis & (brk <= 0.55), np.maximum(idx, 5), idx)
        for gx, gy in ((5, 0), (12, 9), (2, 14)):
            if (gx + gy - 4 * k) % 16 == 5:
                idx[gy, gx] = 8
                idx[(gy + 1) % 16, (gx - 1) % 16] = 7
                idx[(gy - 1) % 16, (gx + 1) % 16] = 7
        for cx, cy in ((9, 4), (10, 5), (3, 9), (4, 10), (14, 14)):
            idx[cy, cx] = 0
        frames.append(to_img(idx, P))
    strip = np.concatenate(frames, axis=0)
    T.save(strip, "block/void_floor.png")
    T.save_mcmeta("block/void_floor.png", 8, True)
    return strip


# ------------------------------------------------------------------- pillar
LACQ = pal("#0d0305", "#18060a", "#24090f", "#320d15", "#43121c", "#5a1924", "#77242f")
TRIM = pal("#5e4a2c", "#8e7444", "#b89a62", "#e2cd98")


def shrine_pillar():
    grain = tile_noise(16, 4, seed=3, octaves=3, ax=1.0, ay=0.25)  # vertical streaks
    col_tone = np.array([3, 3, 2, 3, 4, 4, 3, 3, 2, 3, 3, 2, 3, 2, 2, 1])  # lacquer sheen across
    g = (grain - grain.min()) / (grain.max() - grain.min())
    idx = col_tone[None, :] + np.digitize(g, [0.3, 0.72]) - 1
    idx[:, 4] = np.maximum(idx[:, 4], 5)            # specular sheen line
    idx[[3, 4, 10, 11], 5] = 5
    idx[[6, 13], 4] = 6
    idx = np.clip(idx, 0, 6)
    img = to_img(idx, LACQ)
    # corner trims (bone-gold) at x=1 and x=14, outer edge darker
    for y in range(16):
        img[y, 1, :3] = TRIM[2] if y % 4 else TRIM[3]
        img[y, 14, :3] = TRIM[1] if y % 4 else TRIM[2]
        img[y, 0, :3] = LACQ[1]
        img[y, 15, :3] = LACQ[0]
    T.save(img, "block/shrine_pillar.png")
    return img


def shrine_pillar_top():
    ys, xs = np.mgrid[0:16, 0:16].astype(float)
    r = np.hypot(xs - 7.5, ys - 7.5)
    wob = tile_noise(16, 2, seed=8, octaves=2)
    rings = np.floor(r + wob * 1.2) % 3
    idx = np.where(rings == 0, 2, np.where(rings == 1, 3, 4))
    idx = np.where(r < 1.6, 1, idx)
    img = to_img(idx, LACQ)
    # trim frame matching the side trims, outer dark lacquer border
    for i in range(16):
        for (x, y) in ((i, 0), (i, 15), (0, i), (15, i)):
            img[y, x, :3] = LACQ[1]
    for i in range(1, 15):
        for (x, y, c) in ((i, 1, 3), (1, i, 2), (i, 14, 1), (14, i, 1)):
            img[y, x, :3] = TRIM[c]
    img[1, 1, :3] = TRIM[3]
    T.save(img, "block/shrine_pillar_top.png")
    return img


# --------------------------------------------------------------------- roof
def shrine_roof():
    """Japanese kawara: round cover tiles (ridges) over concave pan tiles, two courses."""
    P = pal("#070405", "#150a0d", "#211015", "#2c161c", "#3a1d25", "#4d2731", "#63343f", "#2e0a10")
    course = [
        "1220" "0711" "1220" "0711",
        "4531" "0122" "4531" "0122",
        "5642" "7233" "5642" "7233",
        "5642" "1233" "5642" "1233",
        "5642" "7233" "5642" "7233",
        "5642" "1233" "5642" "1233",
        "4642" "1232" "4642" "1232",
        "0540" "4443" "0540" "4443",
    ]
    idx = np.array([[int(c) for c in row] for row in course + course])
    img = to_img(idx, P)
    T.save(img, "block/shrine_roof.png")
    return img


# --------------------------------------------------------------------- bone
def shrine_bone():
    """Rows of ivory ribs with fangs hanging into dark crevices."""
    P = pal("#140e09", "#2e241a", "#5c4d3a", "#8f7d5e", "#bda985", "#ddcfae", "#f6efdc")
    unit_a = [
        "5665566556655665",
        "4554455445544554",
        "3443344334433443",
        "2132213221322132",
        "0430004300430004",
        "0040000400040000",
        "1000100000100010",
        "0000000000000000",
    ]
    unit_b = [r[6:] + r[:6] for r in unit_a]          # staggered second rib row
    rows = unit_a + unit_b
    idx = np.array([[int(c) for c in row] for row in rows])
    img = to_img(idx, P)
    T.save(img, "block/shrine_bone.png")
    return img


# --------------------------------------------------------------- cursed blood
def cursed_blood():
    P = pal("#160204", "#240408", "#35060c", "#4a0a12", "#621019", "#7e1822", "#a3242e", "#d24a52")
    n1 = tile_noise(16, 2, seed=13, octaves=3)
    n2 = tile_noise(16, 3, seed=17, octaves=2)
    frames = []
    for k in range(8):
        f = 0.6 * shifted(n1, 2 * k, 0) + 0.4 * shifted(n2, 0, 2 * k)
        f = (f - f.min()) / (f.max() - f.min() + 1e-9)
        # viscous look: broad dark body, thin bright crests
        idx = np.digitize(f, [0.18, 0.36, 0.55, 0.7, 0.82, 0.91, 0.965])
        frames.append(to_img(idx, P))
    strip = np.concatenate(frames, axis=0)
    T.save(strip, "block/cursed_blood.png")
    T.save_mcmeta("block/cursed_blood.png", 3, True)
    return strip


def main():
    res = [("void_barrier", void_barrier()), ("void_floor", void_floor()),
           ("pillar", shrine_pillar()), ("pillar_top", shrine_pillar_top()),
           ("roof", shrine_roof()), ("bone", shrine_bone()), ("blood", cursed_blood())]
    out = T.SCRATCH / "preview"
    items = []
    for name, img in res:
        items.append((name, img))
        first = img[:16]
        tiled = np.tile(first, (3, 3, 1))
        items.append((name + " 3x3", tiled))
    T.contact_sheet(items, out / "blocks.png", k=8, cols=4, max_w=6000)
    print("blocks done")


if __name__ == "__main__":
    main()
