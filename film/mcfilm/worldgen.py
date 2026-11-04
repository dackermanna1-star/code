"""Procedural world builders for every environment in the film."""
import math
import numpy as np

from .voxel import World, B, oak_tree, spruce_tree, jungle_tree, birch_tree, dark_tree, cactus
from .noise import fbm2, fbm3, ridged2, smoothstep, value2, hash01


def grid(sx, sy):
    return np.meshgrid(np.arange(sx, dtype=float), np.arange(sy, dtype=float), indexing="ij")


def scatter_plants(w, h, rng, region, density, kinds, weights, ground_ok=None):
    x0, x1, y0, y1 = region
    n = int((x1 - x0) * (y1 - y0) * density)
    xs = rng.integers(x0, x1, n)
    ys = rng.integers(y0, y1, n)
    p = np.array(weights, float)
    p /= p.sum()
    ks = rng.choice(len(kinds), n, p=p)
    for x, y, k in zip(xs, ys, ks):
        if not (0 <= x < w.shape[0] and 0 <= y < w.shape[1]):
            continue
        z = w.top_z(x, y)
        if z <= 0 or z >= w.shape[2]:
            continue
        under = w.b[x, y, z - 1]
        if ground_ok is not None and under not in ground_ok:
            continue
        if w.b[x, y, z] == 0:
            w.add_plant(x, y, z, kinds[k])


def house(w, x0, y0, z0, sx, sy, h=4, door="-y", lit=False):
    P, L, C, G = B["planks"], B["log"], B["cobble"], B["window_lit"] if lit else B["glass"]
    w.fill(x0, y0, z0 - 1, x0 + sx - 1, y0 + sy - 1, z0 - 1, C)
    for z in range(z0, z0 + h):
        for x in range(x0, x0 + sx):
            for y in range(y0, y0 + sy):
                edge_x = x in (x0, x0 + sx - 1)
                edge_y = y in (y0, y0 + sy - 1)
                if edge_x and edge_y:
                    w.set(x, y, z, L)
                elif edge_x or edge_y:
                    w.set(x, y, z, C if z == z0 else P)
                else:
                    w.set(x, y, z, 0)
    # windows
    zc = z0 + 1
    for x in range(x0 + 2, x0 + sx - 2, 3):
        w.set(x, y0, zc, G); w.set(x, y0 + sy - 1, zc, G)
    for y in range(y0 + 2, y0 + sy - 2, 3):
        w.set(x0, y, zc, G); w.set(x0 + sx - 1, y, zc, G)
    # door
    if door == "-y":
        dx, dy = x0 + sx // 2, y0
    elif door == "+y":
        dx, dy = x0 + sx // 2, y0 + sy - 1
    elif door == "-x":
        dx, dy = x0, y0 + sy // 2
    else:
        dx, dy = x0 + sx - 1, y0 + sy // 2
    w.set(dx, dy, z0, 0); w.set(dx, dy, z0 + 1, 0)
    # stepped gable roof along x
    k = 0
    while True:
        ya, yb = y0 - 1 + k, y0 + sy - k
        if ya > yb:
            break
        zz = z0 + h + k
        for x in range(x0 - 1, x0 + sx + 1):
            w.set(x, ya, zz, P); w.set(x, yb, zz, P)
        if ya + 1 <= yb - 1:
            for y in (ya + 1, yb - 1):
                if x0 <= x0 + sx - 1:
                    for x in (x0, x0 + sx - 1):
                        w.set(x, y, zz, P)
        k += 1


def well(w, x0, y0, z0):
    w.fill(x0, y0, z0 - 1, x0 + 3, y0 + 3, z0, B["cobble"])
    w.fill(x0 + 1, y0 + 1, z0 - 3, x0 + 2, y0 + 2, z0, B["water"])
    for (x, y) in ((x0, y0), (x0 + 3, y0), (x0, y0 + 3), (x0 + 3, y0 + 3)):
        w.fill(x, y, z0 + 1, x, y, z0 + 2, B["log"])
    w.fill(x0, y0, z0 + 3, x0 + 3, y0 + 3, z0 + 3, B["planks"])
    w.set(x0 + 1, y0 + 1, z0 + 4, B["planks"]); w.set(x0 + 2, y0 + 2, z0 + 4, B["planks"])


def farm(w, x0, y0, z0, sx, sy, rng):
    for x in range(x0, x0 + sx):
        for y in range(y0, y0 + sy):
            if x in (x0, x0 + sx - 1) or y in (y0, y0 + sy - 1):
                w.set(x, y, z0 - 1, B["log"])
            elif y == y0 + sy // 2:
                w.set(x, y, z0 - 1, B["water"])
            else:
                w.set(x, y, z0 - 1, B["farmland"])
                if rng.random() < 0.92:
                    w.add_plant(x, y, z0, "wheat")


def lamp(w, x, y, z):
    w.fill(x, y, z, x, y, z + 2, B["log"])
    w.set(x, y, z + 3, B["glowstone"])


# ====================================================================== OVERWORLD
OW = dict(sx=640, sy=256, sz=104, spawn=(100.5, 128.5), river_x=270, village=(360, 470), ridge_x=591,
          plateau=46)


def river_center(y):
    return OW["river_x"] + 4.0 * np.sin(y / 23.0)


def overworld(seed=11):
    sx, sy, sz = OW["sx"], OW["sy"], OW["sz"]
    w = World(sx, sy, sz)
    rng = np.random.default_rng(seed)
    X, Y = grid(sx, sy)
    base = 33 + 5 * (fbm2(X, Y, scale=70, seed=seed) - 0.5) * 2 + 2 * (fbm2(X, Y, scale=18, seed=seed + 5) - 0.5)
    # distant mountains to the north and south of the valley
    north = smoothstep(168, 236, Y) * (18 + 58 * ridged2(X, Y, scale=90, seed=seed + 1))
    south = smoothstep(70, 8, Y) * (10 + 40 * ridged2(X + 300, Y, scale=80, seed=seed + 2))
    h = base + north + south
    # hill rising from the river to the village plateau, then down to the plains and the dusk ridge
    plateau = OW["plateau"]
    up = smoothstep(284, 345, X)
    down = smoothstep(470, 540, X)
    valley = smoothstep(60, 95, Y) * smoothstep(196, 160, Y)
    target = 33 + up * (plateau - 33) * (1 - down) + down * 4
    h = np.where(valley > 0, h * (1 - valley) + (target + (base - 33) * 0.4 + north * 0.15 + south * 0.15) * valley, h)
    # ridge for the dusk silhouette, then drop into the dark forest basin
    ridge = np.exp(-((X - OW["ridge_x"]) / 7.0) ** 2) * 9 * valley
    basin = smoothstep(596, 612, X) * -5 * valley
    h = h + ridge + basin
    # village flattening
    vx0, vx1 = OW["village"]
    vil = smoothstep(vx0 - 10, vx0 + 4, X) * smoothstep(vx1 + 10, vx1 - 4, X) * smoothstep(80, 95, Y) * smoothstep(176, 162, Y)
    h = h * (1 - vil) + plateau * vil
    # river
    rc = river_center(Y)
    dx = np.abs(X - rc)
    bank = smoothstep(12, 4, dx)
    h = h * (1 - bank) + 32.6 * bank
    river = dx < 5.5
    h = np.where(river, 28 + 2 * smoothstep(0, 5.5, dx), h)
    hi = np.clip(np.round(h).astype(int), 5, sz - 12)
    top = np.full((sx, sy), B["grass"], np.uint8)
    under = np.full((sx, sy), B["dirt"], np.uint8)
    top = np.where(hi > 74, B["stone"], top)
    top = np.where(hi > 84, B["snow"], top)
    under = np.where(hi > 74, B["stone"], under)
    sand = (dx < 8.5) & (dx >= 5.5)
    top = np.where(sand, B["sand"], top)
    top = np.where(river, B["gravel"], top)
    w.from_heightmap(hi, top, under, water_level=32)
    w.h = hi
    # biome tint: lush green valley, cooler on mountains, a touch darker near the dark forest
    tint = np.stack([0.36 + 0.0 * X, 0.64 + 0.0 * X, 0.15 + 0.0 * X], -1)
    cool = smoothstep(60, 85, hi.astype(float))[..., None]
    tint = tint * (1 - cool) + np.array([0.38, 0.55, 0.32]) * cool
    dark = smoothstep(598, 615, X)[..., None]
    tint = tint * (1 - dark) + np.array([0.24, 0.42, 0.12]) * dark
    var = (fbm2(X, Y, scale=40, seed=seed + 9) - 0.5)[..., None] * 0.15
    w.tint = (tint * (1 + var)).astype(np.float32)

    # ------------------------------------------------ stepping stones across the river
    stones = []
    y = 128
    rcx = float(river_center(np.array(y + 0.5)))
    for k, xs in enumerate(np.arange(rcx - 6, rcx + 7, 2.0)):
        xi = int(round(xs))
        if w.b[xi, y, 31] in (B["water"],) or w.b[xi, y, 31] == 0:
            w.fill(xi, y, 27, xi, y, 31, B["cobble"] if k % 2 else B["stone"])
            w.b[xi, y + 1, 31] = w.b[xi, y + 1, 31]
        stones.append(xi)
    OW["stones"] = stones

    # ------------------------------------------------ village
    pz = plateau
    vx0, vx1 = OW["village"]
    w.b[vx0 - 6:vx1 + 6, 127:130, pz - 1] = B["path"]
    w.b[413:416, 96:162, pz - 1] = B["path"]
    houses = [(370, 133, 7, 6, "-y"), (384, 134, 6, 7, "-y"), (398, 133, 8, 6, "-y"),
              (372, 116, 7, 6, "+y"), (390, 115, 6, 7, "+y"), (420, 115, 7, 6, "+y"),
              (444, 133, 7, 7, "-y"), (452, 115, 7, 7, "+y"), (420, 144, 6, 6, "-x")]
    for (hx, hy, hsx, hsy, d) in houses:
        house(w, hx, hy, pz, hsx, hsy, 4, d)
    # weaponsmith: open-fronted stone workshop beside the path
    sx0, sy0 = 428, 132
    w.fill(sx0, sy0, pz - 1, sx0 + 6, sy0 + 5, pz - 1, B["cobble"])
    for z in range(pz, pz + 4):
        for x in range(sx0, sx0 + 7):
            w.set(x, sy0 + 5, z, B["stone_bricks"])
        for y in range(sy0, sy0 + 6):
            w.set(sx0, y, z, B["stone_bricks"]); w.set(sx0 + 6, y, z, B["stone_bricks"])
    w.fill(sx0, sy0, pz + 4, sx0 + 6, sy0 + 5, pz + 4, B["cobble_dark"])
    w.fill(sx0 + 1, sy0, pz + 3, sx0 + 5, sy0, pz + 3, B["planks"])
    w.fill(sx0 + 4, sy0 + 3, pz, sx0 + 5, sy0 + 4, pz, B["cobble"])
    w.set(sx0 + 4, sy0 + 4, pz, B["lava"])
    w.set(sx0 + 2, sy0 + 4, pz, B["bookshelf"])
    OW["smith"] = (sx0 + 3.5, sy0 + 1.2, pz)
    well(w, 412, 124, pz)
    w.b[412:416, 124:128, pz - 1] = B["cobble"]
    farm(w, 376, 146, pz, 12, 9, rng)
    farm(w, 392, 98, pz, 14, 9, rng)
    farm(w, 440, 146, pz, 10, 8, rng)
    for (lx, ly) in ((380, 131), (400, 126), (425, 131), (448, 126), (366, 126), (462, 131)):
        lamp(w, lx, ly, pz)
    w.set(sx0 - 1, 130, pz, B["hay"]); w.set(sx0 - 1, 131, pz, B["hay"]); w.set(sx0 - 1, 131, pz + 1, B["hay"])

    # ------------------------------------------------ trees
    occupied = np.zeros((sx, sy), bool)
    occupied[vx0 - 8:vx1 + 8, 90:170] = True
    sp = OW["spawn"]

    def free(x, y, r=2):
        return not occupied[max(0, x - r):x + r + 1, max(0, y - r):y + r + 1].any()

    def plant_tree(x, y, kind):
        z = int(hi[x, y])
        if not free(x, y):
            return
        if w.b[x, y, z - 1] not in (B["grass"], B["dirt"], B["snow"]):
            return
        if kind == "oak":
            oak_tree(w, x, y, z, rng)
        elif kind == "birch":
            birch_tree(w, x, y, z, rng)
        elif kind == "spruce":
            spruce_tree(w, x, y, z, rng, snowy=z > 70)
        elif kind == "dark":
            dark_tree(w, x, y, z, rng)
        occupied[x - 2:x + 3, y - 2:y + 3] = True

    path_clear = lambda x, y: abs(y - 128.5) < 3.0 or (150 < x < 192 and 115 < y < 132)
    for _ in range(900):  # west forest + main forest
        x = int(rng.integers(4, 258))
        y = int(rng.integers(70, 190))
        if 55 < x < 152:  # meadow - sparse
            if rng.random() > 0.05:
                continue
        if math.hypot(x - sp[0], y - sp[1]) < 14 or path_clear(x, y) or abs(x - river_center(y)) < 10:
            continue
        plant_tree(x, y, "birch" if rng.random() < 0.3 else "oak")
    # specific foreground trunks for the forest tracking shot (between camera lane and path)
    for xx in (166, 173, 181):
        oak_tree(w, xx, 124, int(hi[xx, 124]), rng, height=7)
    for xx in (163, 170, 177, 185):
        oak_tree(w, xx, 134, int(hi[xx, 134]), rng, height=6)
    for _ in range(220):  # mountain spruces
        x = int(rng.integers(4, sx - 4))
        y = int(rng.choice([rng.integers(176, 250), rng.integers(6, 70)]))
        if hi[x, y] < 72:
            plant_tree(x, y, "spruce")
    for _ in range(70):  # plains after the village
        x = int(rng.integers(478, 585))
        y = int(rng.integers(80, 180))
        if path_clear(x, y) or rng.random() < 0.6:
            continue
        plant_tree(x, y, "oak")
    for _ in range(400):  # dark forest
        x = int(rng.integers(604, sx - 3))
        y = int(rng.integers(70, 190))
        plant_tree(x, y, "dark")
    for _ in range(60):
        x = int(rng.integers(300, 350))
        y = int(rng.integers(80, 180))
        if path_clear(x, y):
            continue
        plant_tree(x, y, "oak")

    # ------------------------------------------------ plants
    grass_ok = {B["grass"]}
    scatter_plants(w, hi, rng, (40, 160, 90, 170), 0.13, ["tall_grass", "poppy", "dandelion", "cornflower", "tulip"],
                   [70, 9, 9, 4, 3], grass_ok)
    scatter_plants(w, hi, rng, (0, 640, 60, 200), 0.05, ["tall_grass", "fern", "poppy", "dandelion"],
                   [80, 10, 4, 4], grass_ok)
    scatter_plants(w, hi, rng, (470, 600, 80, 180), 0.12, ["tall_grass", "dandelion"], [90, 5], grass_ok)
    return w


def clear_plants(w, spots):
    """Remove plants within radius r of (x, y) spots (camera positions, spawn point)."""
    keep = []
    for p in w.plants:
        if all((p[0] + 0.5 - x) ** 2 + (p[1] + 0.5 - y) ** 2 > r * r for x, y, r in spots):
            keep.append(p)
    w.plants = keep


# ====================================================================== NIGHT FOREST
NF = dict(sx=260, sy=200, sz=90, cave=(222, 100))


def nightforest(seed=21):
    sx, sy, sz = NF["sx"], NF["sy"], NF["sz"]
    w = World(sx, sy, sz)
    rng = np.random.default_rng(seed)
    X, Y = grid(sx, sy)
    h = 34 + 4 * (fbm2(X, Y, scale=40, seed=seed) - 0.5) * 2
    # a rise for the skeleton and the big hill with the cave mouth
    h += 6 * np.exp(-(((X - 120) / 14) ** 2 + ((Y - 112) / 9) ** 2))
    hill = smoothstep(195, 235, X) * (24 + 10 * fbm2(X, Y, scale=25, seed=seed + 3))
    h += hill
    hi = np.round(h).astype(int)
    w.from_heightmap(hi, B["grass"], B["dirt"])
    w.h = hi
    w.tint = np.broadcast_to(np.array([0.26, 0.46, 0.22], np.float32), (sx, sy, 3)).copy()
    # cave mouth in the hillside facing -x at y=100
    cx, cy = NF["cave"]
    gz = int(hi[cx - 14, cy])
    NF["cave_floor"] = gz
    for x in range(cx - 16, cx + 30):
        for y in range(cy - 4, cy + 5):
            for z in range(gz, gz + 6):
                r = ((y - cy) / 3.6) ** 2 + ((z - gz - 2.2) / 3.0) ** 2
                if r < 1.0:
                    w.set(x, y, z, 0)
        w.set(x, cy, gz - 1, B["stone"] if x > cx - 8 else w.get(x, cy, gz - 1))
    # mossy cobble frame
    for y in range(cy - 4, cy + 5):
        for z in range(gz, gz + 7):
            if w.get(cx - 9, y, z) != 0 and rng.random() < 0.6:
                w.set(cx - 9, y, z, B["mossy_cobble"])
    occupied = np.zeros((sx, sy), bool)
    occupied[cx - 30:, cy - 8:cy + 8] = True
    for _ in range(1400):
        x = int(rng.integers(2, 200))
        y = int(rng.integers(2, sy - 2))
        if abs(y - 100) < 2.5 and x < 200:  # running lane
            continue
        if occupied[max(0, x - 2):x + 3, max(0, y - 2):y + 3].any():
            continue
        z = int(hi[x, y])
        if rng.random() < 0.55:
            dark_tree(w, x, y, z, rng)
        else:
            spruce_tree(w, x, y, z, rng)
        occupied[x - 2:x + 4, y - 2:y + 4] = True
    for (tx, ty) in ((60, 103), (74, 97), (88, 104), (100, 97), (140, 103), (152, 97), (170, 103)):
        dark_tree(w, tx, ty, int(hi[tx, ty]), rng)
    scatter_plants(w, hi, rng, (0, sx, 0, sy), 0.12, ["tall_grass", "fern", "mushroom_red", "mushroom_brown"],
                   [60, 30, 3, 3], {B["grass"]})
    return w


# ====================================================================== CAVE
CV = dict(sx=170, sy=80, sz=80)


def cave(seed=31):
    """Winding tunnel (y~40) heading +x, ore pockets, ending at a lava ravine crossing."""
    sx, sy, sz = CV["sx"], CV["sy"], CV["sz"]
    w = World(sx, sy, sz)
    rng = np.random.default_rng(seed)
    X, Y, Z = np.meshgrid(np.arange(sx, dtype=float), np.arange(sy, dtype=float), np.arange(sz, dtype=float),
                          indexing="ij")
    b = np.full((sx, sy, sz), B["stone"], np.uint8)
    deep = Z < 22 + 4 * fbm3(X, Y, Z, scale=12, seed=seed)
    b[deep] = B["deepslate"]
    b[Z < 2] = B["bedrock"]
    # tunnel centre line
    cy = 40 + 5 * np.sin(X / 17.0)
    cz = 50 + 3 * np.sin(X / 23.0 + 1)
    n = fbm3(X, Y, Z, scale=9, seed=seed + 1)
    r = np.sqrt(((Y - cy) / 3.4) ** 2 + ((Z - cz) / 3.0) ** 2) + (n - 0.5) * 0.9
    tunnel = r < 1.0
    floor = Z >= cz - 2.2
    air = tunnel & floor
    # diamond chamber around x=88
    ch = np.sqrt(((X - 88) / 9) ** 2 + ((Y - 40) / 7) ** 2 + ((Z - 52) / 5) ** 2) + (n - 0.5) * 0.6 < 1.0
    air |= ch & (Z >= 48)
    # ravine: deep vertical slot across the tunnel around x=128..138
    rav = (np.abs(X - 133 - 2 * np.sin(Y / 7)) < 5.5 + 2 * (n - 0.5)) & (Z > 8) & (Z < 70)
    air |= rav
    b[air] = 0
    # lava lake at the bottom of the ravine
    lava = rav & (Z <= 12)
    b[lava] = B["lava"]
    b[(np.abs(X - 133 - 2 * np.sin(Y / 7)) < 5.5 + 2 * (n - 0.5)) & (Z <= 12) & (Z > 8)] = B["lava"]
    w.b[:] = b
    # ores on tunnel walls
    solid = w.b == B["stone"]
    nb_air = np.zeros_like(solid)
    for ax in range(3):
        for s in (-1, 1):
            nb_air |= np.roll(w.b == 0, s, axis=ax)
    exposed = solid & nb_air
    noise_o = hash01(X.astype(int), Y.astype(int), Z.astype(int), seed=seed + 5)
    for blk, thr, xr in (("coal_ore", 0.06, (0, sx)), ("iron_ore", 0.035, (0, sx)), ("redstone_ore", 0.03, (20, sx)),
                         ("gold_ore", 0.02, (40, sx)), ("lapis_ore", 0.015, (30, sx))):
        m = exposed & (noise_o < thr) & (X >= xr[0]) & (X < xr[1])
        w.b[m] = B[blk]
        noise_o = np.where(m, 1.0, noise_o - thr)
    # diamond cluster on the chamber's far wall
    dm = exposed & ch.astype(bool) | (exposed & (np.sqrt(((X - 95) / 3) ** 2 + ((Y - 40) / 6) ** 2 + ((Z - 51) / 3) ** 2) < 1.2))
    dm &= (X > 90)
    w.b[dm & (hash01(X.astype(int), Y.astype(int), Z.astype(int), seed=seed + 9) < 0.6)] = B["diamond_ore"]
    # gravel ledge that collapses on the near side of the ravine
    CV["ledge_x"] = (124, 128)
    CV["ravine_far"] = 141
    CV["cy"] = lambda x: 40 + 5 * np.sin(x / 17.0)
    CV["cz"] = lambda x: 50 + 3 * np.sin(x / 23.0 + 1)
    w.tint[:] = (0.4, 0.6, 0.3)
    return w


# ====================================================================== SNOW
SN = dict(sx=420, sy=260, sz=150)


def snow(seed=41):
    sx, sy, sz = SN["sx"], SN["sy"], SN["sz"]
    w = World(sx, sy, sz)
    rng = np.random.default_rng(seed)
    X, Y = grid(sx, sy)
    # cave mouth on a cliff at the west end, valley, then huge mountain the path climbs across
    h = 40 + 8 * fbm2(X, Y, scale=50, seed=seed)
    mt = np.exp(-(((X - 260) / 75) ** 2 + ((Y - 130) / 120) ** 2)) * 70 * (0.75 + 0.5 * ridged2(X, Y, scale=60, seed=seed + 1))
    side = (smoothstep(60, 0, Y) + smoothstep(200, 260, Y)) * (40 + 50 * ridged2(X, Y, scale=70, seed=seed + 2))
    cliff = smoothstep(40, 20, X) * 30
    h = h + mt + side + cliff
    hi = np.clip(np.round(h).astype(int), 5, sz - 10)
    top = np.where(hi > 52, B["snow"], B["snowy_grass"]).astype(np.uint8)
    top = np.where((hi > 95) & (hash01(X.astype(int), Y.astype(int), seed=3) < 0.3), B["packed_snow"], top)
    under = np.where(hi > 60, B["stone"], B["dirt"]).astype(np.uint8)
    w.from_heightmap(hi, top, under)
    w.h = hi
    w.tint[:] = (0.5, 0.65, 0.5)
    # cave mouth in the cliff facing +x at y=130
    cy = 130
    gz = int(hi[46, cy])
    SN["cave"] = (30, cy, gz)
    for x in range(10, 40):
        for y in range(cy - 4, cy + 5):
            for z in range(gz, gz + 7):
                if ((y - cy) / 3.6) ** 2 + ((z - gz - 2.5) / 3.2) ** 2 < 1:
                    w.set(x, y, z, 0)
    w.b[10:40, cy - 3:cy + 4, gz - 1] = B["stone"]
    occupied = np.zeros((sx, sy), bool)
    for _ in range(500):
        x, y = int(rng.integers(45, sx - 3)), int(rng.integers(3, sy - 3))
        if abs(y - 130) < 4 or occupied[x - 2:x + 3, y - 2:y + 3].any():
            continue
        if 40 < hi[x, y] < 100:
            spruce_tree(w, x, y, int(hi[x, y]), rng, snowy=True)
            occupied[x - 2:x + 3, y - 2:y + 3] = True
    return w


# ====================================================================== DESERT
DS = dict(sx=400, sy=260, sz=80)


def desert(seed=51):
    sx, sy, sz = DS["sx"], DS["sy"], DS["sz"]
    w = World(sx, sy, sz)
    rng = np.random.default_rng(seed)
    X, Y = grid(sx, sy)
    dunes = 6 * np.sin(X / 13 + 2 * fbm2(X, Y, scale=40, seed=seed)) * fbm2(X, Y, scale=60, seed=seed + 1)
    h = 32 + 8 * fbm2(X, Y, scale=80, seed=seed + 2) + dunes
    mesa = smoothstep(0.62, 0.66, fbm2(X, Y, scale=70, seed=seed + 3)) * 16 * (smoothstep(100, 70, np.abs(Y - 130)))
    h += mesa
    hi = np.round(h).astype(int)
    top = np.where(mesa > 8, B["red_sand"], B["sand"]).astype(np.uint8)
    w.from_heightmap(hi, top, B["sandstone"], under_depth=4)
    w.h = hi
    for _ in range(140):
        x, y = int(rng.integers(3, sx - 3)), int(rng.integers(3, sy - 3))
        if abs(y - 130) < 3:
            continue
        if rng.random() < 0.5:
            cactus(w, x, y, int(hi[x, y]), rng)
        else:
            w.add_plant(x, y, int(hi[x, y]), "dead_bush")
    # sun-bleached remains: a half-buried sandstone ruin
    w.fill(210, 140, int(hi[210, 140]) - 1, 216, 146, int(hi[210, 140]) + 2, B["sandstone"])
    w.fill(211, 141, int(hi[210, 140]), 215, 145, int(hi[210, 140]) + 3, 0)
    return w


# ====================================================================== JUNGLE
JG = dict(sx=240, sy=200, sz=110)


def jungle(seed=61):
    sx, sy, sz = JG["sx"], JG["sy"], JG["sz"]
    w = World(sx, sy, sz)
    rng = np.random.default_rng(seed)
    X, Y = grid(sx, sy)
    h = 36 + 7 * fbm2(X, Y, scale=40, seed=seed)
    hi = np.round(h).astype(int)
    w.from_heightmap(hi, B["grass"], B["dirt"])
    w.h = hi
    w.tint[:] = (0.3, 0.78, 0.18)
    occupied = np.zeros((sx, sy), bool)
    for _ in range(700):
        x, y = int(rng.integers(4, sx - 5)), int(rng.integers(4, sy - 5))
        if abs(y - 100) < 2.5:
            continue
        if occupied[x - 3:x + 4, y - 3:y + 4].any():
            continue
        z = int(hi[x, y])
        if rng.random() < 0.4 and abs(y - 100) > 7:
            jungle_tree(w, x, y, z, rng)
            occupied[x - 4:x + 6, y - 4:y + 6] = True
        else:
            oak_tree(w, x, y, z, rng, log="jungle_log", leaves="jungle_leaves")
            occupied[x - 2:x + 3, y - 2:y + 3] = True
    # leafy bushes on the ground
    for _ in range(1600):
        x, y = int(rng.integers(0, sx)), int(rng.integers(0, sy))
        if abs(y - 100) < 1.5:
            continue
        z = w.top_z(x, y)
        if z < sz - 1 and w.b[x, y, z - 1] == B["grass"]:
            w.set(x, y, z, B["jungle_leaves"])
    scatter_plants(w, hi, rng, (0, sx, 0, sy), 0.4, ["tall_grass", "fern", "berry_bush"], [50, 45, 5], {B["grass"]})
    return w


# ====================================================================== EDGE (desolate plain -> broken lands)
ED = dict(sx=720, sy=300, sz=200, ridge_x=520)


def farlands_density(X, Y, Z, seed=0, scale=1.0):
    """Far Lands style terrain: overflowing noise -> colossal walls of stacked, stretched horizontal layers.
    X is the distance past the boundary. Features are long along Y (the wall face) and layered in Z."""
    xs, ys, zs = X * scale, Y * scale, Z * scale
    phase = 6.0 * value2(ys / 70.0, xs / 30.0, seed=seed) + 3.0 * value2(ys / 13.0, 0.3, seed=seed + 5)
    period = 9.0 + 4.0 * value2(xs / 40.0, ys / 90.0, seed=seed + 6)
    layers = np.sin(zs * (2 * np.pi) / period + phase)
    big = value2(ys / 45.0, zs / 11.0, seed=seed + 1) - 0.5
    deep = value2(xs / 16.0, zs / 14.0, seed=seed + 2) - 0.5
    jag = value2(ys / 3.5, zs / 2.5, seed=seed + 3) - 0.5
    return 0.5 + 0.34 * layers + 0.35 * big + 0.25 * deep + 0.12 * jag + 0.0045 * xs


def cull_far(w, x_start, K=10, drop_back=True):
    """Return a face filter that removes Far Lands faces no westward camera can see."""
    solid = w.b[x_start:] != 0
    depth = np.cumsum(solid, axis=0, dtype=np.int16)
    sky = np.flip(np.cumsum(np.flip(solid, axis=2), axis=2, dtype=np.int16), axis=2)  # solids at/above

    def keep(n, idx):
        x = idx[:, 0]
        inside = x >= x_start
        k = np.ones(len(idx), bool)
        xi = np.clip(x - x_start, 0, depth.shape[0] - 1)
        d = depth[xi, idx[:, 1], idx[:, 2]]
        k &= ~inside | (d <= K)
        if n[2] == 1:
            exposed = sky[xi, idx[:, 1], idx[:, 2]] <= 1
            k |= inside & exposed
        if drop_back and n[0] == 1:
            k &= ~inside
        return k
    return keep


def edge(seed=71):
    sx, sy, sz = ED["sx"], ED["sy"], ED["sz"]
    w = World(sx, sy, sz)
    rng = np.random.default_rng(seed)
    X, Y = grid(sx, sy)
    flat = 34 + 2 * fbm2(X, Y, scale=60, seed=seed)
    # broken region: stretched terrain, abrupt steps, stretched pillars, shifted chunks
    brk = smoothstep(200, 300, X)
    stretch = 14 * value2(X / 2.0, Y / 60.0, seed=seed + 1) * brk
    terr = 8 * (np.floor(fbm2(X, Y, scale=30, seed=seed + 2) * 6) / 6) * brk
    h = flat + stretch + terr
    # ridge where Steve stops and sees the wall
    rx = ED["ridge_x"]
    ridge = np.exp(-((X - rx) / 16) ** 2) * 22 * smoothstep(40, 0, np.abs(Y - 150) - 30)
    h += ridge
    after = smoothstep(rx + 5, rx + 40, X)
    h = h * (1 - after) + (34 + 3 * fbm2(X, Y, scale=30, seed=seed + 7)) * after
    hi = np.clip(np.round(h).astype(int), 4, sz - 10)
    # chunk glitches: offset 16x16 chunks / missing chunks in the broken zone
    cxs, cys = X.astype(int) // 16, Y.astype(int) // 16
    ch = hash01(cxs, cys, seed=seed + 11)
    zone = (X > 300) & (X < rx - 20)
    shift = np.where(zone & (ch < 0.18), np.round((hash01(cxs, cys, seed=12) - 0.3) * 30), 0).astype(int)
    hole = zone & (ch > 0.93) & (np.abs(Y - 150) > 4)
    # a guaranteed missing chunk right beside the path for the "void" moment
    hole |= (cxs == 21) & (cys == 10)
    shift = np.where((cxs == 21) & (cys == 10), 0, shift)
    shift = np.where(np.abs(Y - 150) < 6, 0, shift)
    hi = hi + shift
    top = np.where(X < 200, B["grass"], np.where(hash01(X.astype(int), Y.astype(int), seed=5) < 0.3, B["gravel"], B["grass"]))
    top = np.where((X > 260) & (hash01(X.astype(int), Y.astype(int), seed=6) < 0.25), B["stone"], top).astype(np.uint8)
    w.from_heightmap(hi, top, B["dirt"])
    w.b[hole] = 0
    w.h = np.where(hole, 0, hi)
    w.tint = np.broadcast_to(np.array([0.5, 0.58, 0.32], np.float32), (sx, sy, 3)).copy()
    dry = smoothstep(150, 350, X)[..., None]
    w.tint = (w.tint * (1 - dry) + np.array([0.52, 0.5, 0.36]) * dry).astype(np.float32)
    # stretched pillars
    for _ in range(90):
        x, y = int(rng.integers(230, rx - 10)), int(rng.integers(60, 250))
        if abs(y - 150) < 4:
            continue
        z0 = int(w.h[x, y])
        hgt = int(rng.integers(10, 60))
        blk = B["stone"] if rng.random() < 0.6 else B["dirt"]
        w.fill(x, y, z0, x, y, z0 + hgt, blk)
        if rng.random() < 0.4:
            w.set(x, y, z0 + hgt + 1, B["grass"])
    # repeating artifact walls (thin, very tall slabs)
    for k in range(10):
        x = int(330 + k * 17 + rng.integers(-3, 3))
        y0 = int(rng.integers(70, 120)) if k % 2 else int(rng.integers(170, 200))
        z0 = int(w.h[x, min(y0 + 10, sy - 1)])
        w.fill(x, y0, z0 - 2, x, y0 + int(rng.integers(8, 30)), z0 + int(rng.integers(15, 45)), B["stone"])
    # sparse dead plain
    for _ in range(40):
        x, y = int(rng.integers(5, 200)), int(rng.integers(20, 280))
        if abs(y - 150) < 3:
            continue
        w.add_plant(x, y, int(w.h[x, y]), "dead_bush" if rng.random() < 0.5 else "tall_grass")
    for _ in range(12):
        x, y = int(rng.integers(10, 190)), int(rng.integers(30, 270))
        if abs(y - 150) > 6:
            oak_tree(w, x, y, int(w.h[x, y]), rng, height=4)
    # distant Far Lands wall (beyond the ridge) - coarse, lives in this world for the reveal
    x0 = rx + 60
    sub = np.s_[x0:sx, :, :]
    Xs, Ys, Zs = np.meshgrid(np.arange(x0, sx, dtype=float), np.arange(sy, dtype=float), np.arange(sz, dtype=float),
                             indexing="ij")
    d = farlands_density(Xs - x0, Ys, Zs, seed=seed + 20)
    ramp = smoothstep(0, 25, Xs - x0)
    solid = (d * ramp > 0.5) | (Zs < 34)
    solid &= Zs < 178 + 14 * value2(Ys / 9.0, Xs / 9.0, seed=seed + 21)
    blk = np.where(Zs > 3 + 0 * Xs, B["stone"], B["bedrock"]).astype(np.uint8)
    # grass/dirt on exposed tops
    top_air = np.concatenate([~solid[:, :, 1:], np.ones_like(solid[:, :, :1])], axis=2)
    blk = np.where(solid & top_air, B["grass"], blk)
    below_top = np.concatenate([np.zeros_like(top_air[:, :, :1]), top_air[:, :, :-1]], axis=2)
    blk = np.where(solid & ~top_air & np.roll(top_air, -1, axis=2), B["dirt"], blk)
    w.b[sub] = np.where(solid, blk, 0).astype(np.uint8)
    w.cull = cull_far(w, x0, K=8)
    return w


# ====================================================================== FAR LANDS
FL = dict(sx=560, sy=420, sz=230, wall_x=250, ridge=(200, 210))


def farlands(seed=81):
    """Approach plain (x<wall_x) with a ridge, then the colossal Far Lands formations."""
    sx, sy, sz = FL["sx"], FL["sy"], FL["sz"]
    w = World(sx, sy, sz)
    rng = np.random.default_rng(seed)
    X, Y = grid(sx, sy)
    wx = FL["wall_x"]
    h = 36 + 3 * fbm2(X, Y, scale=40, seed=seed)
    # viewpoint ridge (stepped) at x~200..210 near y=210
    rx0, rx1 = FL["ridge"]
    rdg = smoothstep(rx0 - 30, rx0, X) * smoothstep(rx1 + 25, rx1, X) * smoothstep(40, 10, np.abs(Y - 210)) * 14
    h = h + np.floor(rdg)
    hi = np.round(h).astype(int)
    w.from_heightmap(hi, B["grass"], B["dirt"])
    w.tint[:] = (0.48, 0.56, 0.32)
    # 3-D far lands beyond wall_x
    Xs, Ys, Zs = np.meshgrid(np.arange(wx - 20, sx, dtype=float), np.arange(sy, dtype=float),
                             np.arange(sz, dtype=float), indexing="ij")
    d = farlands_density(Xs - wx, Ys, Zs, seed=seed + 3)
    # edge: walls get taller quickly at the boundary, with noise in the border position
    border = wx + 8 * (value2(Ys / 30.0, 0.5, seed=seed + 4) - 0.5) * 2
    ramp = smoothstep(border - 4, border + 18, Xs)
    solid = (d * ramp > 0.5) | (Zs < 36 + 0 * Xs)
    # big overhang shelves: horizontal slabs jutting toward the viewer
    shelf = (np.abs(Zs - 120 - 30 * value2(Ys / 50, 1.5, seed=seed + 6)) < 3) & (Xs > border - 25) & \
            (value2(Ys / 20, Xs / 20, seed=seed + 7) > 0.45)
    solid |= shelf & (Xs < border + 40)
    solid &= Zs < sz - 12 + 8 * value2(Ys / 9.0, Xs / 9.0, seed=seed + 9)
    # a deep diagonal canyon - a crack through the wall leading into the unknown
    yc = 250 + (Xs - 330) * 0.4
    half = 9 + 0.09 * np.clip(Xs - 250, 0, None) + 3 * (value2(Xs / 7.0, Zs / 9.0, seed=seed + 10) - 0.5)
    canyon = (np.abs(Ys - yc) < half) & (Xs > 244) & (Zs > 37)
    solid &= ~canyon
    top_air = np.concatenate([~solid[:, :, 1:], np.ones_like(solid[:, :, :1])], axis=2)
    blk = np.full(solid.shape, B["stone"], np.uint8)
    noise_b = hash01(Xs.astype(int), Ys.astype(int), Zs.astype(int), seed=seed + 8)
    blk = np.where(noise_b < 0.08, B["gravel"], blk)
    blk = np.where((noise_b > 0.08) & (noise_b < 0.12), B["coal_ore"], blk)
    blk = np.where((noise_b > 0.12) & (noise_b < 0.135), B["dirt"], blk)
    blk = np.where(solid & top_air, B["grass"], blk)
    blk = np.where(solid & ~top_air & np.roll(top_air, -1, axis=2), B["dirt"], blk)
    blk = np.where(Zs < 2, B["bedrock"], blk)
    sub = w.b[wx - 20:sx]
    keep_front = (Xs < wx - 10)
    newb = np.where(solid, blk, 0).astype(np.uint8)
    w.b[wx - 20:sx] = np.where(keep_front, sub, np.maximum(sub * (Zs < 36), newb)).astype(np.uint8)
    # some water flooding the base like the original far lands
    base = (Zs >= 36) & (Zs < 39) & (w.b[wx - 20:sx] == 0) & (Xs > border + 4)
    w.b[wx - 20:sx][base] = B["water"]
    w.h = hi
    w.cull = cull_far(w, wx - 10, K=10)
    for _ in range(25):
        x, y = int(rng.integers(20, wx - 30)), int(rng.integers(20, sy - 20))
        if abs(y - 210) < 6:
            continue
        w.add_plant(x, y, int(hi[x, y]), "dead_bush" if rng.random() < 0.4 else "tall_grass")
    scatter_plants(w, hi, rng, (100, wx - 20, 150, 270), 0.04, ["tall_grass"], [1], {B["grass"]})
    return w
