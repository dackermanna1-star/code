"""Voxel world container and face mesher with Minecraft-style vertex AO (pure numpy)."""
import numpy as np
from .textures import TILE, PLANT, tile_uv

# name: (top, side, bottom)
BLOCK_DEFS = [
    ("air", None),
    ("grass", ("grass_top", "grass_side", "dirt")),
    ("dirt", ("dirt",) * 3),
    ("stone", ("stone",) * 3),
    ("cobble", ("cobble",) * 3),
    ("log", ("log_top", "log", "log_top")),
    ("leaves", ("leaves",) * 3),
    ("sand", ("sand",) * 3),
    ("sandstone", ("sandstone",) * 3),
    ("snow", ("snow",) * 3),
    ("snowy_grass", ("snow", "snow_side", "dirt")),
    ("water", ("water",) * 3),
    ("planks", ("planks",) * 3),
    ("gravel", ("gravel",) * 3),
    ("coal_ore", ("coal_ore",) * 3),
    ("iron_ore", ("iron_ore",) * 3),
    ("gold_ore", ("gold_ore",) * 3),
    ("diamond_ore", ("diamond_ore",) * 3),
    ("redstone_ore", ("redstone_ore",) * 3),
    ("lava", ("lava",) * 3),
    ("spruce_log", ("log_top", "spruce_log", "log_top")),
    ("spruce_leaves", ("spruce_leaves",) * 3),
    ("jungle_log", ("log_top", "jungle_log", "log_top")),
    ("jungle_leaves", ("jungle_leaves",) * 3),
    ("cactus", ("cactus_top", "cactus_side", "cactus_top")),
    ("bedrock", ("bedrock",) * 3),
    ("path", ("path", "dirt", "dirt")),
    ("mossy_cobble", ("mossy_cobble",) * 3),
    ("ice", ("ice",) * 3),
    ("obsidian", ("obsidian",) * 3),
    ("farmland", ("farmland", "dirt", "dirt")),
    ("glass", ("glass",) * 3),
    ("hay", ("hay_top", "hay_side", "hay_top")),
    ("window_lit", ("window_lit",) * 3),
    ("glowstone", ("glowstone",) * 3),
    ("birch_log", ("log_top", "birch_log", "log_top")),
    ("birch_leaves", ("birch_leaves",) * 3),
    ("dark_log", ("log_top", "dark_log", "log_top")),
    ("dark_leaves", ("dark_leaves",) * 3),
    ("packed_snow", ("packed_snow",) * 3),
    ("red_sand", ("red_sand",) * 3),
    ("clay", ("clay",) * 3),
    ("andesite", ("andesite",) * 3),
    ("deepslate", ("deepslate",) * 3),
    ("emerald_ore", ("emerald_ore",) * 3),
    ("lapis_ore", ("lapis_ore",) * 3),
    ("bookshelf", ("planks", "bookshelf", "planks")),
    ("cobble_dark", ("cobble_dark",) * 3),
    ("stone_bricks", ("stone_bricks",) * 3),
]
B = {name: i for i, (name, _) in enumerate(BLOCK_DEFS)}
NB = len(BLOCK_DEFS)

TOP_T = np.zeros(NB, np.int32)
SIDE_T = np.zeros(NB, np.int32)
BOT_T = np.zeros(NB, np.int32)
for i, (n, d) in enumerate(BLOCK_DEFS):
    if d:
        TOP_T[i], SIDE_T[i], BOT_T[i] = TILE[d[0]], TILE[d[1]], TILE[d[2]]

OPAQUE = np.ones(NB, bool)
OPAQUE[B["air"]] = False
OPAQUE[B["water"]] = False
OPAQUE[B["glass"]] = False
SOLID = OPAQUE.copy()
SOLID[B["glass"]] = True
# blocks a character can stand on when following terrain (excludes tree parts)
WALK = SOLID.copy()
for _n in ("leaves", "spruce_leaves", "jungle_leaves", "dark_leaves", "birch_leaves", "log", "spruce_log",
           "jungle_log", "dark_log", "birch_log", "cactus"):
    WALK[B[_n]] = False

# corners of each face (unit cube coordinates), CCW seen from outside, plus (u, v) axes
FACES = [
    ((1, 0, 0), [(1, 0, 0), (1, 1, 0), (1, 1, 1), (1, 0, 1)], (0, 1, 0), (0, 0, 1)),
    ((-1, 0, 0), [(0, 1, 0), (0, 0, 0), (0, 0, 1), (0, 1, 1)], (0, -1, 0), (0, 0, 1)),
    ((0, 1, 0), [(1, 1, 0), (0, 1, 0), (0, 1, 1), (1, 1, 1)], (-1, 0, 0), (0, 0, 1)),
    ((0, -1, 0), [(0, 0, 0), (1, 0, 0), (1, 0, 1), (0, 0, 1)], (1, 0, 0), (0, 0, 1)),
    ((0, 0, 1), [(0, 0, 1), (1, 0, 1), (1, 1, 1), (0, 1, 1)], (1, 0, 0), (0, 1, 0)),
    ((0, 0, -1), [(0, 1, 0), (1, 1, 0), (1, 0, 0), (0, 0, 0)], (1, 0, 0), (0, -1, 0)),
]
LOCAL = [(0, 0), (1, 0), (1, 1), (0, 1)]
AO_CURVE = np.array([0.42, 0.6, 0.8, 1.0])


class World:
    def __init__(self, sx, sy, sz, origin=(0, 0, 0)):
        self.b = np.zeros((sx, sy, sz), np.uint8)
        self.tint = np.ones((sx, sy, 3), np.float32) * np.array([0.45, 0.75, 0.3], np.float32)
        self.leaf_tint = None
        self.origin = np.array(origin, np.float64)
        self.plants = []  # (x, y, z, plant_tile, tinted)
        self.shape = self.b.shape
        self.cull = None  # optional face filter: fn(normal, idx) -> keep mask

    # ------------------------------------------------------------ editing
    def inb(self, x, y, z):
        sx, sy, sz = self.shape
        return 0 <= x < sx and 0 <= y < sy and 0 <= z < sz

    def set(self, x, y, z, blk):
        if self.inb(x, y, z):
            self.b[x, y, z] = blk

    def get(self, x, y, z):
        return self.b[x, y, z] if self.inb(x, y, z) else 0

    def fill(self, x0, y0, z0, x1, y1, z1, blk):
        sx, sy, sz = self.shape
        x0, x1 = max(0, min(x0, x1)), min(sx, max(x0, x1) + 1)
        y0, y1 = max(0, min(y0, y1)), min(sy, max(y0, y1) + 1)
        z0, z1 = max(0, min(z0, z1)), min(sz, max(z0, z1) + 1)
        self.b[x0:x1, y0:y1, z0:z1] = blk

    def from_heightmap(self, h, top, under, deep=None, under_depth=3, water_level=None):
        """h: int heightmap (sx, sy) = number of filled blocks. top/under: block id arrays or ints."""
        sx, sy, sz = self.shape
        z = np.arange(sz)[None, None, :]
        h3 = h[:, :, None]
        top = np.broadcast_to(np.asarray(top), (sx, sy))[:, :, None]
        under = np.broadcast_to(np.asarray(under), (sx, sy))[:, :, None]
        deep = B["stone"] if deep is None else deep
        deep = np.broadcast_to(np.asarray(deep), (sx, sy))[:, :, None]
        b = np.where(z < h3 - under_depth - 1, deep, 0)
        b = np.where((z >= h3 - under_depth - 1) & (z < h3 - 1), under, b)
        b = np.where(z == h3 - 1, top, b)
        b = np.where(z < h3, b, 0)
        if water_level is not None:
            b = np.where((z >= h3) & (z < water_level), B["water"], b)
        self.b[:] = b.astype(np.uint8)

    def top_z(self, x, y, below=None, solid_only=True):
        """Return z of the first air cell above the highest solid block in column (x, y)."""
        xi, yi = int(np.floor(x)), int(np.floor(y))
        if not (0 <= xi < self.shape[0] and 0 <= yi < self.shape[1]):
            return 0
        col = self.b[xi, yi]
        zmax = self.shape[2] if below is None else int(below)
        mask = WALK[col[:zmax]] if solid_only else (col[:zmax] != 0)
        idx = np.nonzero(mask)[0]
        return int(idx[-1]) + 1 if len(idx) else 0

    def add_plant(self, x, y, z, name, tinted=None):
        if tinted is None:
            tinted = name in ("tall_grass", "fern", "vine", "sapling")
        self.plants.append((x, y, z, PLANT[name], tinted))

    # ------------------------------------------------------------ meshing
    def mesh_arrays(self, region=None, ao=True, shade_jitter=0.05, seed=0):
        """Return dict with verts (N*4,3), uvs (N*4,2), col (N*4,3), ao (N*4) for opaque blocks
        and a separate dict for water surfaces."""
        b = self.b if region is None else self.b[region]
        off = np.zeros(3) if region is None else np.array([s.start or 0 for s in region], float)
        sx, sy, sz = b.shape
        P = np.zeros((sx + 2, sy + 2, sz + 2), np.uint8)
        P[1:-1, 1:-1, 1:-1] = b
        Pop = OPAQUE[P]
        out_v, out_uv, out_c, out_ao = [], [], [], []
        tint = self.tint if region is None else self.tint[region[0], region[1]]
        rng = np.random.default_rng(seed)
        for n, corners, uax, vax in FACES:
            n = np.array(n)
            nb = Pop[1 + n[0]:sx + 1 + n[0], 1 + n[1]:sy + 1 + n[1], 1 + n[2]:sz + 1 + n[2]]
            cur = P[1:-1, 1:-1, 1:-1]
            vis = OPAQUE[cur] & ~nb
            idx = np.argwhere(vis)
            if self.cull is not None and region is None and len(idx):
                idx = idx[self.cull(n, idx)]
            if len(idx) == 0:
                continue
            blk = cur[idx[:, 0], idx[:, 1], idx[:, 2]]
            if n[2] == 1:
                tiles = TOP_T[blk]
            elif n[2] == -1:
                tiles = BOT_T[blk]
            else:
                tiles = SIDE_T[blk]
            col = tile_uv_arr(tiles)
            corners = np.array(corners, float)
            uax, vax = np.array(uax), np.array(vax)
            q = idx + 1 + n  # padded index of the air neighbour
            nf = len(idx)
            verts = idx[:, None, :].astype(np.float64) + corners[None, :, :] + off
            uvs = np.empty((nf, 4, 2))
            aos = np.empty((nf, 4))
            inset = 0.0015
            for k, (a, bb) in enumerate(LOCAL):
                uvs[:, k, 0] = col[:, 0] + (inset if a == 0 else col[:, 2] - inset)
                uvs[:, k, 1] = col[:, 1] + (inset if bb == 0 else col[:, 2] - inset)
                if ao:
                    su = (2 * a - 1) * uax
                    sv = (2 * bb - 1) * vax
                    s1 = Pop[q[:, 0] + su[0], q[:, 1] + su[1], q[:, 2] + su[2]]
                    s2 = Pop[q[:, 0] + sv[0], q[:, 1] + sv[1], q[:, 2] + sv[2]]
                    c = Pop[q[:, 0] + su[0] + sv[0], q[:, 1] + su[1] + sv[1], q[:, 2] + su[2] + sv[2]]
                    lvl = np.where(s1 & s2, 0, 3 - (s1.astype(int) + s2 + c))
                    aos[:, k] = AO_CURVE[lvl]
                else:
                    aos[:, k] = 1.0
            # biome tint per column + tiny per-face brightness jitter for richness
            t = tint[idx[:, 0], idx[:, 1]]
            jit = 1.0 + rng.uniform(-shade_jitter, shade_jitter, size=(nf, 1))
            out_v.append(verts.reshape(-1, 3))
            out_uv.append(uvs.reshape(-1, 2))
            out_c.append(np.repeat(t * jit, 4, axis=0))
            out_ao.append(aos.reshape(-1))
        res = {
            "verts": np.concatenate(out_v) if out_v else np.zeros((0, 3)),
            "uvs": np.concatenate(out_uv) if out_uv else np.zeros((0, 2)),
            "col": np.concatenate(out_c) if out_c else np.zeros((0, 3)),
            "ao": np.concatenate(out_ao) if out_ao else np.zeros(0),
        }
        # water: top surfaces only (lowered slightly) + sides open to air
        wv, wuv = [], []
        cur = P[1:-1, 1:-1, 1:-1]
        iswater = cur == B["water"]
        for n, corners, uax, vax in FACES:
            if n[2] == -1:
                continue
            n = np.array(n)
            nbb = P[1 + n[0]:sx + 1 + n[0], 1 + n[1]:sy + 1 + n[1], 1 + n[2]:sz + 1 + n[2]]
            vis = iswater & (nbb == 0)
            idx = np.argwhere(vis)
            if len(idx) == 0:
                continue
            corners = np.array(corners, float)
            corners[:, 2] = np.minimum(corners[:, 2], 0.88)
            verts = idx[:, None, :] + corners[None] + off
            wv.append(verts.reshape(-1, 3))
            w_uv = verts[:, :, :2] if n[2] == 1 else np.stack(
                [verts[:, :, 0] + verts[:, :, 1], verts[:, :, 2]], -1)
            wuv.append(w_uv.reshape(-1, 2))
        water = {"verts": np.concatenate(wv) if wv else np.zeros((0, 3)),
                 "uvs": np.concatenate(wuv) if wuv else np.zeros((0, 2))}
        return res, water

    def plant_arrays(self, seed=0):
        if not self.plants:
            return None
        rng = np.random.default_rng(seed)
        p = np.array([(x, y, z) for x, y, z, _, _ in self.plants], float)
        tiles = np.array([t for *_, t, _ in self.plants])
        tinted = np.array([tt for *_, tt in self.plants])
        n = len(p)
        ang = rng.uniform(0, np.pi, n)
        verts, uvs, cols = [], [], []
        from .textures import N as AN
        for k in range(2):
            a = ang + k * np.pi / 2
            dx, dy = np.cos(a) * 0.45, np.sin(a) * 0.45
            cx, cy = p[:, 0] + 0.5 + rng.uniform(-.15, .15, n), p[:, 1] + 0.5 + rng.uniform(-.15, .15, n)
            z0, z1 = p[:, 2], p[:, 2] + 0.95
            v = np.stack([
                np.stack([cx - dx, cy - dy, z0], -1), np.stack([cx + dx, cy + dy, z0], -1),
                np.stack([cx + dx, cy + dy, z1], -1), np.stack([cx - dx, cy - dy, z1], -1)], 1)
            verts.append(v)
            col_, row_ = tiles % AN, tiles // AN
            u0, v0, s = col_ / AN, 1 - (row_ + 1) / AN, 1.0 / AN
            ii = 0.002
            uv = np.stack([np.stack([u0 + ii, v0 + ii], -1), np.stack([u0 + s - ii, v0 + ii], -1),
                           np.stack([u0 + s - ii, v0 + s - ii], -1), np.stack([u0 + ii, v0 + s - ii], -1)], 1)
            uvs.append(uv)
            xi = np.clip(p[:, 0].astype(int), 0, self.shape[0] - 1)
            yi = np.clip(p[:, 1].astype(int), 0, self.shape[1] - 1)
            t = np.where(tinted[:, None], self.tint[xi, yi], 1.0)
            cols.append(np.repeat(t[:, None, :], 4, axis=1))
        verts = np.concatenate(verts).reshape(-1, 3) + self.origin
        return {"verts": verts, "uvs": np.concatenate(uvs).reshape(-1, 2),
                "col": np.concatenate(cols).reshape(-1, 3),
                "sway": np.tile(np.array([0, 0, 1, 1.0]), 2 * n)}


FOLIAGE = np.zeros(NB, bool)
for _n in ("leaves", "spruce_leaves", "jungle_leaves", "dark_leaves", "birch_leaves", "log", "spruce_log",
           "jungle_log", "dark_log", "birch_log"):
    FOLIAGE[B[_n]] = True


def clear_foliage(w, pts, r=2.5, zr=None):
    """Remove tree blocks within a vertical cylinder of radius r around each (x, y[, z]) point."""
    sx, sy, sz = w.shape
    for p in pts:
        x, y = p[0], p[1]
        x0, x1 = max(0, int(x - r)), min(sx, int(x + r) + 2)
        y0, y1 = max(0, int(y - r)), min(sy, int(y + r) + 2)
        if len(p) > 2 and zr is not None:
            z0, z1 = max(0, int(p[2] - zr)), min(sz, int(p[2] + zr) + 1)
        else:
            z0, z1 = 0, sz
        sub = w.b[x0:x1, y0:y1, z0:z1]
        xx, yy = np.meshgrid(np.arange(x0, x1) + 0.5, np.arange(y0, y1) + 0.5, indexing="ij")
        inside = ((xx - x) ** 2 + (yy - y) ** 2 <= r * r)[..., None]
        sub[FOLIAGE[sub] & inside] = 0
    keep = []
    for pl in w.plants:
        if pl[3] == 6 and any((pl[0] + .5 - p[0]) ** 2 + (pl[1] + .5 - p[1]) ** 2 <= r * r for p in pts):
            continue  # vines on removed trees
        keep.append(pl)
    w.plants = keep


def tile_uv_arr(tiles):
    from .textures import N as AN
    col_, row_ = tiles % AN, tiles // AN
    return np.stack([col_ / AN, 1 - (row_ + 1) / AN, np.full(len(tiles), 1.0 / AN)], -1)


# ------------------------------------------------------------------ structures
def oak_tree(w, x, y, z, rng, log="log", leaves="leaves", height=None):
    h = height or int(rng.integers(4, 7))
    L, Lv = B[log], B[leaves]
    for dz in range(h - 3, h + 1):
        r = 2 if dz < h - 1 else 1
        for dx in range(-r, r + 1):
            for dy in range(-r, r + 1):
                if abs(dx) == r and abs(dy) == r and (dz == h or rng.random() < 0.5):
                    continue
                if w.get(x + dx, y + dy, z + dz) == 0:
                    w.set(x + dx, y + dy, z + dz, Lv)
    for dz in range(h):
        w.set(x, y, z + dz, L)


def spruce_tree(w, x, y, z, rng, height=None, snowy=False):
    h = height or int(rng.integers(7, 12))
    L, Lv = B["spruce_log"], B["spruce_leaves"]
    r = 0
    for dz in range(h, 1, -1):
        rr = [0, 1, 2, 1, 2, 3, 2, 3][min(h - dz, 7)]
        for dx in range(-rr, rr + 1):
            for dy in range(-rr, rr + 1):
                if abs(dx) + abs(dy) > rr + (1 if rr > 1 else 0):
                    continue
                if w.get(x + dx, y + dy, z + dz) == 0:
                    w.set(x + dx, y + dy, z + dz, Lv)
                    if snowy and w.get(x + dx, y + dy, z + dz + 1) == 0 and rng.random() < 0.7:
                        w.set(x + dx, y + dy, z + dz + 1, B["snow"])
    w.set(x, y, z + h + 1, Lv)
    for dz in range(h):
        w.set(x, y, z + dz, L)


def jungle_tree(w, x, y, z, rng, height=None):
    h = height or int(rng.integers(14, 24))
    L, Lv = B["jungle_log"], B["jungle_leaves"]
    for dz in range(h):
        for dx in (0, 1):
            for dy in (0, 1):
                w.set(x + dx, y + dy, z + dz, L)
    for layer, r in ((h - 2, 5), (h - 1, 5), (h, 4), (h + 1, 3)):
        for dx in range(-r, r + 2):
            for dy in range(-r, r + 2):
                d = np.hypot(dx - 0.5, dy - 0.5)
                if d <= r + 0.3 and w.get(x + dx, y + dy, z + layer) == 0:
                    w.set(x + dx, y + dy, z + layer, Lv)
    # side branches
    for _ in range(3):
        bz = int(rng.integers(h // 2, h - 3))
        ang = rng.uniform(0, 2 * np.pi)
        bx, by = int(round(x + np.cos(ang) * 3)), int(round(y + np.sin(ang) * 3))
        for dx in range(-2, 3):
            for dy in range(-2, 3):
                if abs(dx) + abs(dy) <= 3 and w.get(bx + dx, by + dy, bz) == 0:
                    w.set(bx + dx, by + dy, bz, Lv)
    # vines hanging from the canopy edge
    for _ in range(14):
        ang = rng.uniform(0, 2 * np.pi)
        vx, vy = int(round(x + np.cos(ang) * 5.5)), int(round(y + np.sin(ang) * 5.5))
        for dz in range(int(rng.integers(3, 9))):
            zz = z + h - 3 - dz
            if w.get(vx, vy, zz) == 0:
                w.add_plant(vx, vy, zz, "vine")


def birch_tree(w, x, y, z, rng):
    oak_tree(w, x, y, z, rng, log="birch_log", leaves="birch_leaves", height=int(rng.integers(5, 8)))


def dark_tree(w, x, y, z, rng):
    h = int(rng.integers(6, 9))
    for dz in range(h):
        for dx in (0, 1):
            for dy in (0, 1):
                w.set(x + dx, y + dy, z + dz, B["dark_log"])
    for layer, r in ((h - 2, 3), (h - 1, 3), (h, 2), (h + 1, 1)):
        for dx in range(-r, r + 2):
            for dy in range(-r, r + 2):
                if w.get(x + dx, y + dy, z + layer) == 0 and rng.random() < 0.92:
                    w.set(x + dx, y + dy, z + layer, B["dark_leaves"])


def cactus(w, x, y, z, rng):
    for dz in range(int(rng.integers(2, 5))):
        w.set(x, y, z + dz, B["cactus"])
