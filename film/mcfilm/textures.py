"""Procedurally painted 16x16 pixel-art block textures (pure numpy).

Three 256x256 atlases are produced (16x16 tiles of 16px):
  * colour  - RGB albedo (greyscale where the tile is biome tinted)
  * mask    - 1.0 where the pixel should be multiplied by the biome tint
  * emit    - RGB emission (glowing ores, lava, lit windows ...)
Plants use a separate RGBA atlas with an alpha cut-out.
Rows are painted top-down; callers flip before uploading to Blender.
"""
import numpy as np

T = 16
N = 16  # tiles per row
TILES = [
    "grass_top", "grass_side", "dirt", "stone", "cobble", "log", "log_top", "leaves",
    "sand", "sandstone", "snow", "snow_side", "water", "planks", "gravel", "coal_ore",
    "iron_ore", "gold_ore", "diamond_ore", "redstone_ore", "lava", "spruce_log", "spruce_leaves",
    "jungle_log", "jungle_leaves", "cactus_side", "cactus_top", "bedrock", "path", "mossy_cobble",
    "ice", "obsidian", "farmland", "glass", "hay_side", "hay_top", "window_lit", "glowstone",
    "birch_log", "birch_leaves", "dark_log", "dark_leaves", "packed_snow", "red_sand", "clay",
    "andesite", "deepslate", "emerald_ore", "lapis_ore", "bookshelf", "cobble_dark", "stone_bricks",
]
TILE = {n: i for i, n in enumerate(TILES)}

PLANTS = ["tall_grass", "poppy", "dandelion", "dead_bush", "fern", "wheat", "vine", "cornflower",
          "sapling", "torch", "mushroom_red", "mushroom_brown", "sugarcane", "lily", "berry_bush", "tulip"]
PLANT = {n: i for i, n in enumerate(PLANTS)}


def tile_uv(index):
    col, row = index % N, index // N
    u0 = col / N
    v0 = 1.0 - (row + 1) / N
    return u0, v0, 1.0 / N


def _rng(name, seed):
    h = 0
    for ch in name:
        h = (h * 131 + ord(ch)) & 0xFFFFFF
    return np.random.default_rng(h + seed * 7919)


def _noise(rng, base, var, shape=(T, T)):
    base = np.asarray(base, dtype=np.float64)
    n = rng.uniform(-var, var, size=shape)[..., None]
    return np.clip(base[None, None, :] * (1 + n), 0, 1)


def _blob_cells(rng, n_cells=7):
    """Voronoi cells (wrap-around) -> (cell_id, edge_mask)."""
    pts = rng.uniform(0, T, size=(n_cells, 2))
    yy, xx = np.mgrid[0:T, 0:T]
    d = []
    for p in pts:
        dx = np.abs(xx + 0.5 - p[0]); dx = np.minimum(dx, T - dx)
        dy = np.abs(yy + 0.5 - p[1]); dy = np.minimum(dy, T - dy)
        d.append(np.sqrt(dx * dx + dy * dy))
    d = np.stack(d)
    srt = np.sort(d, axis=0)
    edge = (srt[1] - srt[0]) < 1.2
    return np.argmin(d, axis=0), edge


def _ore(rng, colour, name):
    img = paint("stone", rng)
    mask = np.zeros((T, T), bool)
    for _ in range(4):
        cx, cy = rng.integers(2, 14, size=2)
        for _ in range(rng.integers(3, 6)):
            x = int(np.clip(cx + rng.integers(-2, 3), 0, 15))
            y = int(np.clip(cy + rng.integers(-2, 3), 0, 15))
            mask[y, x] = True
            if x + 1 < T and rng.random() < 0.5:
                mask[y, x + 1] = True
    c = np.asarray(colour)
    shade = rng.uniform(0.75, 1.15, size=(T, T))[..., None]
    img[mask] = np.clip(c[None, :] * shade[mask], 0, 1)
    return img, mask


def paint(name, rng):
    if name == "grass_top":
        return _noise(rng, (0.72, 0.72, 0.72), 0.18)
    if name == "dirt":
        img = _noise(rng, (0.53, 0.38, 0.26), 0.15)
        spots = rng.random((T, T)) < 0.12
        img[spots] *= 0.7
        return img
    if name == "stone":
        img = _noise(rng, (0.5, 0.5, 0.5), 0.1)
        for _ in range(6):
            y, x = rng.integers(0, T, 2)
            ln = rng.integers(2, 5)
            img[y, x:x + ln] *= 0.78
        return img
    if name in ("cobble", "mossy_cobble", "cobble_dark"):
        cell, edge = _blob_cells(rng, 8)
        tones = rng.uniform(0.42, 0.62, size=cell.max() + 1)
        base = 0.33 if name == "cobble_dark" else 1.0
        g = tones[cell] * (1 + rng.uniform(-0.08, 0.08, (T, T)))
        g[edge] *= 0.55
        img = np.stack([g, g, g], -1) * base
        if name == "mossy_cobble":
            moss = rng.random((T, T)) < 0.35
            img[moss] = _noise(rng, (0.3, 0.45, 0.2), 0.2)[moss]
        return np.clip(img, 0, 1)
    if name == "stone_bricks":
        img = _noise(rng, (0.48, 0.48, 0.48), 0.08)
        img[[3, 7, 11, 15], :] *= 0.6
        for r in range(4):
            off = 0 if r % 2 == 0 else 8
            img[r * 4:r * 4 + 3, (off + 7) % 16] *= 0.6
        return img
    if name in ("log", "spruce_log", "jungle_log", "dark_log", "birch_log"):
        base = {"log": (0.42, 0.33, 0.2), "spruce_log": (0.27, 0.19, 0.11),
                "jungle_log": (0.36, 0.29, 0.13), "dark_log": (0.24, 0.18, 0.1),
                "birch_log": (0.85, 0.84, 0.8)}[name]
        img = _noise(rng, base, 0.08)
        for x in range(T):
            if rng.random() < 0.4:
                img[:, x] *= 0.75
        if name == "birch_log":
            for _ in range(9):
                y, x = rng.integers(0, T, 2)
                img[y, x:x + rng.integers(1, 4)] = (0.15, 0.15, 0.13)
        return img
    if name == "log_top":
        yy, xx = np.mgrid[0:T, 0:T]
        r = np.maximum(np.abs(xx - 7.5), np.abs(yy - 7.5))
        ring = (np.floor(r) % 2 == 0)
        img = np.empty((T, T, 3))
        img[:] = (0.68, 0.55, 0.33)
        img[ring] = (0.58, 0.45, 0.26)
        img[r > 6.5] = (0.42, 0.33, 0.2)
        return np.clip(img * (1 + rng.uniform(-0.06, 0.06, (T, T, 1))), 0, 1)
    if name in ("leaves", "spruce_leaves", "jungle_leaves", "dark_leaves", "birch_leaves"):
        img = _noise(rng, (0.62, 0.62, 0.62), 0.3)
        holes = rng.random((T, T)) < 0.2
        img[holes] *= 0.35
        return img
    if name == "sand":
        return _noise(rng, (0.86, 0.81, 0.6), 0.06)
    if name == "red_sand":
        return _noise(rng, (0.72, 0.4, 0.17), 0.08)
    if name == "sandstone":
        img = _noise(rng, (0.84, 0.78, 0.57), 0.05)
        img[[4, 9, 13], :] *= 0.88
        return img
    if name in ("snow", "packed_snow"):
        img = _noise(rng, (0.95, 0.97, 1.0), 0.04)
        if name == "packed_snow":
            img *= np.array([0.88, 0.92, 1.0])
        return img
    if name == "ice":
        img = _noise(rng, (0.62, 0.75, 0.97), 0.05)
        for i in range(0, T, 5):
            img[i, i:i + 4] = (0.85, 0.92, 1)
        return img
    if name == "water":
        img = _noise(rng, (0.21, 0.36, 0.78), 0.1)
        for y in range(0, T, 4):
            img[y, (np.arange(T) + y) % T < 6] *= 1.2
        return np.clip(img, 0, 1)
    if name == "planks":
        img = _noise(rng, (0.68, 0.53, 0.32), 0.06)
        img[[3, 7, 11, 15], :] *= 0.65
        for r, x in enumerate([5, 12, 2, 9]):
            img[r * 4:r * 4 + 3, x] *= 0.7
        return img
    if name == "gravel":
        img = _noise(rng, (0.52, 0.49, 0.47), 0.28)
        return img
    if name == "bedrock":
        return _noise(rng, (0.3, 0.3, 0.3), 0.6)
    if name == "deepslate":
        img = _noise(rng, (0.28, 0.28, 0.31), 0.12)
        img[::3, :] *= 0.85
        return img
    if name == "andesite":
        return _noise(rng, (0.53, 0.53, 0.52), 0.18)
    if name == "obsidian":
        img = _noise(rng, (0.07, 0.04, 0.12), 0.5)
        sp = rng.random((T, T)) < 0.08
        img[sp] = (0.3, 0.2, 0.45)
        return img
    if name == "path":
        img = _noise(rng, (0.58, 0.47, 0.27), 0.12)
        return img
    if name == "farmland":
        img = _noise(rng, (0.36, 0.24, 0.14), 0.12)
        img[::4, :] *= 0.7
        return img
    if name == "clay":
        return _noise(rng, (0.62, 0.64, 0.7), 0.05)
    if name == "glass":
        img = np.zeros((T, T, 3)) + (0.55, 0.7, 0.8)
        img[0, :] = img[-1, :] = img[:, 0] = img[:, -1] = (0.85, 0.92, 0.95)
        img[3:6, 4] = img[4, 3:6] = (0.95, 0.98, 1)
        return img * 0.6
    if name == "window_lit":
        img = np.zeros((T, T, 3)) + (1.0, 0.72, 0.35)
        img[0, :] = img[-1, :] = img[:, 0] = img[:, -1] = (0.4, 0.3, 0.2)
        img[7:9, :] = (0.4, 0.3, 0.2)
        img[:, 7:9] = (0.4, 0.3, 0.2)
        return img
    if name == "glowstone":
        return _noise(rng, (0.95, 0.78, 0.45), 0.25)
    if name in ("hay_side", "hay_top"):
        img = _noise(rng, (0.78, 0.64, 0.18), 0.12)
        if name == "hay_side":
            img[[2, 13], :] = (0.45, 0.32, 0.12)
        return img
    if name == "cactus_side":
        img = _noise(rng, (0.25, 0.5, 0.18), 0.12)
        img[:, [0, 15]] *= 0.6
        img[::3, [3, 8, 12]] = (0.85, 0.85, 0.6)
        return img
    if name == "cactus_top":
        img = _noise(rng, (0.3, 0.55, 0.22), 0.1)
        img[[0, 15], :] *= 0.6
        img[:, [0, 15]] *= 0.6
        return img
    if name == "bookshelf":
        img = paint("planks", rng)
        cols = [(0.6, 0.15, 0.12), (0.15, 0.3, 0.6), (0.2, 0.5, 0.2), (0.6, 0.5, 0.15)]
        for r0 in (2, 9):
            for x in range(1, 15):
                img[r0:r0 + 5, x] = cols[rng.integers(0, 4)]
        return img
    raise KeyError(name)


def build_atlases(seed=1):
    S = T * N
    col = np.zeros((S, S, 3))
    mask = np.zeros((S, S))
    emit = np.zeros((S, S, 3))
    for name, idx in TILE.items():
        rng = _rng(name, seed)
        r, c = idx // N, idx % N
        sl = (slice(r * T, (r + 1) * T), slice(c * T, (c + 1) * T))
        m = np.zeros((T, T))
        e = np.zeros((T, T, 3))
        if name == "grass_side":
            img = paint("dirt", rng)
            depth = rng.integers(2, 5, size=T)
            for x in range(T):
                img[:depth[x], x] = _noise(rng, (0.72, 0.72, 0.72), 0.18)[:depth[x], x]
                m[:depth[x], x] = 1
        elif name == "snow_side":
            img = paint("dirt", rng)
            depth = rng.integers(3, 6, size=T)
            for x in range(T):
                img[:depth[x], x] = _noise(rng, (0.95, 0.97, 1.0), 0.04)[:depth[x], x]
        elif name.endswith("_ore"):
            ocol = {"coal_ore": (0.08, 0.08, 0.08), "iron_ore": (0.85, 0.68, 0.55),
                    "gold_ore": (1.0, 0.85, 0.2), "diamond_ore": (0.35, 0.95, 0.95),
                    "redstone_ore": (0.95, 0.08, 0.05), "emerald_ore": (0.2, 0.9, 0.4),
                    "lapis_ore": (0.15, 0.3, 0.85)}[name]
            img, om = _ore(rng, ocol, name)
            if name in ("gold_ore", "diamond_ore", "redstone_ore", "emerald_ore", "lapis_ore"):
                e[om] = img[om]
        else:
            img = paint(name, rng)
            if name in ("grass_top",) or name.endswith("leaves"):
                m[:] = 1
            if name in ("lava", "glowstone", "window_lit"):
                e = img.copy()
        col[sl] = img
        mask[sl] = m
        emit[sl] = e
    return col, mask, emit


def _lava(rng):
    img = _noise(rng, (1.0, 0.45, 0.08), 0.25)
    hot = rng.random((T, T)) < 0.25
    img[hot] = (1.0, 0.85, 0.3)
    return img


_orig_paint = paint


def paint(name, rng):  # noqa: F811 - extend with lava
    if name == "lava":
        return _lava(rng)
    return _orig_paint(name, rng)


def build_plant_atlas(seed=2):
    S = T * N
    out = np.zeros((S, S, 4))
    tinted = np.zeros((S, S))
    for name, idx in PLANT.items():
        rng = _rng(name, seed)
        r, c = idx // N, idx % N
        img = np.zeros((T, T, 4))
        tm = np.zeros((T, T))
        if name in ("tall_grass", "fern"):
            for k in range(7 if name == "tall_grass" else 5):
                x = int(rng.integers(1, 15))
                h = int(rng.integers(6, 15))
                lean = rng.uniform(-0.25, 0.25)
                for y in range(h):
                    xx = int(np.clip(round(x + lean * y), 0, 15))
                    g = rng.uniform(0.55, 0.9)
                    img[15 - y, xx] = (g, g, g, 1)
                    tm[15 - y, xx] = 1
                    if name == "fern" and y % 2 == 0 and 0 < xx < 15:
                        img[15 - y, xx - 1] = img[15 - y, xx + 1] = (g * .9, g * .9, g * .9, 1)
                        tm[15 - y, xx - 1] = tm[15 - y, xx + 1] = 1
        elif name in ("poppy", "dandelion", "cornflower", "tulip"):
            petal = {"poppy": (0.85, 0.1, 0.08), "dandelion": (1.0, 0.88, 0.15),
                     "cornflower": (0.35, 0.45, 0.95), "tulip": (0.95, 0.5, 0.65)}[name]
            img[8:16, 7:9] = (0.2, 0.5, 0.15, 1)
            img[10, 5:7] = img[12, 9:11] = (0.25, 0.55, 0.18, 1)
            img[4:8, 6:10] = (*petal, 1)
            img[5:7, 5:11] = (*petal, 1)
            img[5:7, 7:9] = (petal[0] * .6, petal[1] * .6, petal[2] * .6, 1)
        elif name == "dead_bush":
            for k in range(6):
                x = 7.5
                ang = rng.uniform(-1.0, 1.0)
                for y in range(int(rng.integers(5, 12))):
                    xx = int(np.clip(round(x + ang * y * 0.6), 0, 15))
                    img[15 - y, xx] = (0.45, 0.32, 0.17, 1)
        elif name == "wheat":
            for x in (2, 5, 8, 11, 14):
                h = int(rng.integers(9, 15))
                img[16 - h:16, x] = (0.6, 0.58, 0.2, 1)
                img[16 - h:16 - h + 4, x - 1:x + 1] = (0.8, 0.68, 0.25, 1)
        elif name == "vine":
            for x in range(0, 16, 3):
                ln = int(rng.integers(6, 16))
                img[0:ln, x] = (0.6, 0.6, 0.6, 1)
                tm[0:ln, x] = 1
                for y in range(0, ln, 2):
                    if x + 1 < 16:
                        img[y, x + 1] = (0.5, 0.5, 0.5, 1)
                        tm[y, x + 1] = 1
        elif name == "sapling":
            img[9:16, 7:9] = (0.4, 0.3, 0.18, 1)
            img[3:10, 4:12] = (0.5, 0.5, 0.5, 1)
            tm[3:10, 4:12] = 1
        elif name == "torch":
            img[6:16, 7:9] = (0.45, 0.33, 0.18, 1)
            img[4:7, 7:9] = (1.0, 0.85, 0.4, 1)
            img[5, 7] = (1, 1, 0.8, 1)
        elif name in ("mushroom_red", "mushroom_brown"):
            capc = (0.85, 0.12, 0.1) if name == "mushroom_red" else (0.6, 0.45, 0.32)
            img[10:16, 7:9] = (0.85, 0.82, 0.72, 1)
            img[7:11, 4:12] = (*capc, 1)
            if name == "mushroom_red":
                img[8, 5] = img[9, 9] = (1, 1, 1, 1)
        elif name == "sugarcane":
            for x in (3, 8, 12):
                img[:, x:x + 2] = (0.55, 0.75, 0.4, 1)
                img[::4, x:x + 2] = (0.45, 0.62, 0.3, 1)
        elif name == "lily":
            img[6:10, 3:13] = (0.25, 0.5, 0.2, 1)
        elif name == "berry_bush":
            img[5:16, 2:14] = (0.2, 0.42, 0.18, 1)
            holes = rng.random((T, T)) < 0.3
            img[holes, 3] = 0
            for _ in range(4):
                y, x = rng.integers(6, 15), rng.integers(3, 13)
                img[y, x] = (0.8, 0.1, 0.15, 1)
        sl = (slice(r * T, (r + 1) * T), slice(c * T, (c + 1) * T))
        out[sl] = img
        tinted[sl] = tm
    return out, tinted


if __name__ == "__main__":
    c, m, e = build_atlases()
    p, t = build_plant_atlas()
    print(c.shape, m.mean(), e.mean(), p[..., 3].mean())
