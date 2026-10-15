#!/usr/bin/env python3
"""One-off: derive the compact layout data in tools/ct/layout/ from the NMRiH
reference data (nav mesh, BSP faces, brush boxes, entities, static props).

The reference files are never copied: this script measures them and writes
our own raster description of the walkable space (floor/ceiling heights and
surface classes on an 8-unit grid) plus point lists (vehicles, props, items,
lights, zombie spawn boxes) that tools/ct/build-map.mjs turns into a DOOM map.

Usage: python3 tools/ct/extract-layout.py [refdir]
  refdir defaults to $CT_REF or the session scratchpad's out/ folder.
Needs numpy (and Pillow for the optional previews).
"""
import json, math, os, pickle, sys, zlib, base64
from collections import deque
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
REF = sys.argv[1] if len(sys.argv) > 1 else os.environ.get(
    'CT_REF', '/tmp/claude-0/-home-user-code/2139ba89-9871-5bc9-a1b9-3df0ca0d94e2/scratchpad/out')
OUT = os.environ.get('CT_LAYOUT_OUT') or os.path.join(HERE, 'layout')
PREV = os.path.join(HERE, '..', '..', 'build', 'ct', 'previews', 'map')
C = 8  # cell size (map units)

# --- layers ---------------------------------------------------------------
# Real (Source) coordinates. The build shifts subway by -5000 and sewer by
# +6000 in x (SPEC section 2). Seams: portal 100 just east of the ticket-hall
# elevator door (x = P100X), portal 101 across the pre-sewer landing (y = P101Y).
P100X = -2616
P101Y = -2048
LAYERS = {
    'street': dict(box=(-3712, -7040, 2560, 4224)),
    'subway': dict(box=(-3328, -7040, -1920, -3200)),
    'sewer': dict(box=(-2688, -2560, -512, -128)),
}
# (layer receiving a copy, from layer, box x0,y0,x1,y1)
STUBS = [
    ('subway', 'street', (P100X, -5000, P100X + 48, -4760)),
    ('street', 'subway', (-2688, -5000, P100X, -4760)),
    ('sewer', 'street', (-1672, -2120, -1496, P101Y)),
    ('street', 'sewer', (-1672, P101Y, -1496, -1976)),
]


def cell_layer(x, y, z):
    """Which layer a walkable point (nav sample) belongs to."""
    if -3400 < x < -1900 and -7000 < y < -3200 and z < -150:
        if -5000 < y < -4760 and x > P100X and z > -300:
            return 'street'  # exit stair passage (stacked over the platform's north end)
        return 'subway'
    if -2700 < x < -600 and -2450 < y < -150 and z < -150:
        if x < -1250 and y < P101Y:
            return 'street'  # first stair flight / south half of the pre-sewer landing
        return 'sewer'
    return 'street'


# --- texture classes -------------------------------------------------------
def wall_class(t):
    u = t.upper()
    if 'SKYBOX' in u or 'NODRAW' in u or u.startswith('TOOLS'):
        return None
    if 'METALCRATE' in u or 'CONTAINER' in u or 'CARGO' in u:
        return 'container'
    if 'GLASS' in u or 'WINDOW' in u:
        return 'glass'
    if 'FENCE' in u or 'CHAINLINK' in u or 'METALGATE' in u:
        return 'fence'
    if 'SUBWAYWALL' in u or 'TILE' in u or 'MARBLE' in u:
        return 'tile'
    if 'TRAINSTATION' in u:
        return 'facade2'
    if 'STAIR' in u or 'CURB' in u:
        return 'step'
    if 'SHUTTER' in u or 'ROLLUP' in u or 'GARAGE' in u or 'METALDOOR' in u or 'METAL_DOOR' in u:
        return 'shutter'
    if 'BUILDING' in u or 'RC_BUILDING' in u:
        return 'facade'
    if 'TRIM' in u:
        return 'trim'
    if 'BRICK' in u:
        if any(k in u for k in ('053', '045', '049', 'BRICKWALL02', 'HOSPITAL', 'BRICK_WALL02')):
            return 'brick2'
        return 'brick'
    if 'PLASTER' in u or 'DRYWALL' in u or 'WALLPAPER' in u or 'BU_WALL' in u:
        return 'plaster'
    if 'PLYWOOD' in u or 'WOOD' in u or 'CRATE' in u:
        return 'wood'
    if 'CONTAINER' in u or 'CARGO' in u:
        return 'container'
    if 'METAL' in u or 'TRUSS' in u or 'HULL' in u or 'MTL' in u or 'CORRUGATED' in u or 'RAIL' in u:
        return 'metal'
    if 'STONE' in u:
        return 'stone'
    if 'SEWER' in u or 'CANAL' in u:
        return 'sewer'
    if 'CONC' in u or 'CEMENT' in u:
        return 'concrete'
    return 'concrete'


def floor_class(t):
    u = t.upper()
    if 'WATER' in u or 'REEDS' in u:
        return 'water'
    if 'YELLOW' in u or 'LINE' in u:
        return 'roadline'
    if 'ROAD' in u or 'ASPHALT' in u or 'STREET' in u or 'ALLEY' in u:
        return 'road'
    if 'CURB' in u or 'SIDEWALK' in u:
        return 'sidewalk'
    if 'WOOD' in u or 'PLYWOOD' in u or 'CRATE' in u:
        return 'wood'
    if 'TILE' in u or 'MARBLE' in u or 'SUBWAY' in u or 'TRAINSTATION' in u:
        return 'tile'
    if 'GRATE' in u or 'TRACK' in u or 'METAL' in u or 'TRUSS' in u or 'HULL' in u:
        return 'metal'
    if 'DIRT' in u or 'GRAVEL' in u or 'GRASS' in u or 'MUD' in u or 'SAND' in u:
        return 'dirt'
    if 'STAIR' in u:
        return 'stairs'
    if 'CARPET' in u:
        return 'carpet'
    return 'concrete'


def ceil_class(t):
    u = t.upper()
    if 'SKYBOX' in u:
        return 'sky'
    if 'CEILING' in u or 'PLASTIC' in u or 'ACOUSTIC' in u:
        return 'tiles'
    if 'WOOD' in u:
        return 'wood'
    if 'METAL' in u or 'TRUSS' in u or 'HULL' in u or 'MTL' in u:
        return 'metal'
    return 'concrete'


WALL_CLASSES = [None, 'brick', 'brick2', 'facade', 'facade2', 'tile', 'concrete', 'plaster', 'wood', 'metal', 'stone',
                'sewer', 'glass', 'fence', 'shutter', 'trim', 'step', 'container']
FLOOR_CLASSES = [None, 'road', 'roadline', 'sidewalk', 'concrete', 'wood', 'tile', 'metal', 'dirt', 'stairs', 'carpet', 'water']
CEIL_CLASSES = [None, 'sky', 'tiles', 'concrete', 'wood', 'metal']
WI = {k: i for i, k in enumerate(WALL_CLASSES)}
FI = {k: i for i, k in enumerate(FLOOR_CLASSES)}
CI = {k: i for i, k in enumerate(CEIL_CLASSES)}

# --- load reference ---------------------------------------------------------
print('loading reference data from', REF)
NAV = json.load(open(os.path.join(REF, 'nav.json')))['areas']
BR = json.load(open(os.path.join(REF, 'brushes.json')))
FACES = pickle.load(open(os.path.join(REF, 'polys.pkl'), 'rb'))
ENTS = [dict(e) for e in json.load(open(os.path.join(REF, 'entities.json')))]
PROPS = json.load(open(os.path.join(REF, 'static_props.json')))

NONSOLID_TOOLS = {'TOOLS/ZOMBIE_SPAWN', 'TOOLS/TOOLSTRIGGER', 'TOOLS/TRIGGER_INFECT', 'TOOLS/TOOLS_FFBLOCKER',
                  'TOOLS/WEAPON_TRIGGER', 'TOOLS/TOOLSEXTRACT', 'TOOLS/TOOLSSKIP', 'TOOLS/TOOLSHINT',
                  'TOOLS/TOOLSAREAPORTAL'}
BLOCK_MASK = 0x1 | 0x2 | 0x8 | 0x10000  # SOLID | WINDOW | GRATE | PLAYERCLIP
blockers = []
water_brushes = []
for b in BR:
    tex = set(t.upper() for t in b['tex'])
    if tex and tex <= NONSOLID_TOOLS:
        continue
    if b['cont'] & 0x20:  # water volume
        water_brushes.append(b['bb'])
        continue
    if not (b['cont'] & BLOCK_MASK):
        continue
    if tex == {'TOOLS/TOOLSSKYBOX'} or tex == {'TOOLS/TOOLSCLIP_VPHYS'}:
        continue  # sky shell / physics-only clips (func_clip_vphysics) don't block players
    kind = 'glass' if b['cont'] & 0x2 else 'grate' if b['cont'] & 0x8 else 'clip' if not (b['cont'] & 1) else 'solid'
    blockers.append((b['bb'], kind))
print(len(blockers), 'blocking brushes', len(water_brushes), 'water volumes')


def true_normal(P):
    nx = ny = nz = 0.0
    n = len(P)
    for i in range(n):
        a = P[i]
        b = P[(i + 1) % n]
        nx += (a[1] - b[1]) * (a[2] + b[2])
        ny += (a[2] - b[2]) * (a[0] + b[0])
        nz += (a[0] - b[0]) * (a[1] + b[1])
    l = math.sqrt(nx * nx + ny * ny + nz * nz) or 1.0
    return (-nx / l, -ny / l, -nz / l)


floors, ceils, walls = [], [], []
for f in FACES:
    P = f['p']
    if len(P) < 3:
        continue
    n = true_normal(P)
    if f['cls'] not in ('worldspawn', 'func_brush', 'func_door', 'func_movelinear', 'func_lod', 'func_breakable', 'func_illusionary'):
        continue
    if n[2] > 0.6:
        floors.append((P, n, f['t']))
    elif n[2] < -0.6:
        ceils.append((P, n, f['t']))
    elif abs(n[2]) < 0.3:
        walls.append((P, n, f['t'], f['cls']))
print(len(floors), 'floor faces', len(ceils), 'ceiling faces', len(walls), 'wall faces')


class Grid:
    def __init__(self, box):
        x0, y0, x1, y1 = box
        self.x0, self.y0 = x0, y0
        self.W = (x1 - x0) // C
        self.H = (y1 - y0) // C

    def centers(self, i0, j0, i1, j1):
        xs = self.x0 + (np.arange(i0, i1) + 0.5) * C
        ys = self.y0 + (np.arange(j0, j1) + 0.5) * C
        return np.meshgrid(xs, ys)

    def span(self, x0, y0, x1, y1, pad=0):
        i0 = max(0, int(math.floor((x0 - self.x0) / C)) - pad)
        j0 = max(0, int(math.floor((y0 - self.y0) / C)) - pad)
        i1 = min(self.W, int(math.ceil((x1 - self.x0) / C)) + pad)
        j1 = min(self.H, int(math.ceil((y1 - self.y0) / C)) + pad)
        return i0, j0, i1, j1


# --- nav rasterisation (global, per cell layer) -----------------------------
def nav_cells(G, layer, stub_boxes):
    navz = np.full((G.H, G.W), np.nan, np.float32)
    navflat = np.zeros((G.H, G.W), bool)
    stub = np.zeros((G.H, G.W), bool)
    navid = np.zeros((G.H, G.W), np.int32)
    for a in NAV:
        ax0, ay0, z00 = a['nw']
        ax1, ay1, z11 = a['se']
        z10, z01 = a['nez'], a['swz']  # ne = (x1,y0), sw = (x0,y1)
        i0, j0, i1, j1 = G.span(ax0, ay0, ax1, ay1)
        if i1 <= i0 or j1 <= j0:
            continue
        X, Y = G.centers(i0, j0, i1, j1)
        inside = (X >= ax0) & (X <= ax1) & (Y >= ay0) & (Y <= ay1)
        if not inside.any():
            continue
        u = np.clip((X - ax0) / max(1e-6, ax1 - ax0), 0, 1)
        v = np.clip((Y - ay0) / max(1e-6, ay1 - ay0), 0, 1)
        Z = z00 * (1 - u) * (1 - v) + z10 * u * (1 - v) + z01 * (1 - u) * v + z11 * u * v
        flat = max(z00, z10, z01, z11) - min(z00, z10, z01, z11) < 3
        # per-cell layer assignment
        ok = np.zeros_like(inside)
        for jj in range(Z.shape[0]):
            for ii in range(Z.shape[1]):
                if not inside[jj, ii]:
                    continue
                x, y, z = X[jj, ii], Y[jj, ii], Z[jj, ii]
                L = cell_layer(x, y, z)
                if L == layer:
                    ok[jj, ii] = True
                else:
                    for (bx0, by0, bx1, by1, src) in stub_boxes:
                        if src == L and bx0 <= x < bx1 and by0 <= y < by1:
                            ok[jj, ii] = True
                            stub[j0 + jj, i0 + ii] = True
        sub = navz[j0:j1, i0:i1]
        better = ok & (np.isnan(sub) | (Z < sub))  # lowest floor wins (no stacking left inside a layer)
        sub[better] = Z[better]
        navflat[j0:j1, i0:i1][better] = flat
        navid[j0:j1, i0:i1][better] = a['id']
    return navz, navflat, stub, navid


def convex_mask(G, P, i0, j0, i1, j1):
    """Cells (centres) inside the XY projection of a convex face."""
    X, Y = G.centers(i0, j0, i1, j1)
    pts = [(p[0], p[1]) for p in P]
    # orientation
    area = 0
    for k in range(len(pts)):
        a, b = pts[k], pts[(k + 1) % len(pts)]
        area += a[0] * b[1] - b[0] * a[1]
    s = 1 if area > 0 else -1
    m = np.ones(X.shape, bool)
    for k in range(len(pts)):
        a, b = pts[k], pts[(k + 1) % len(pts)]
        cr = (b[0] - a[0]) * (Y - a[1]) - (b[1] - a[1]) * (X - a[0])
        m &= cr * s >= -0.01
    return X, Y, m


def plane_z(P, n, X, Y):
    p0 = P[0]
    d = n[0] * p0[0] + n[1] * p0[1] + n[2] * p0[2]
    return (d - n[0] * X - n[1] * Y) / n[2]


def propagate(navz, steps):
    z = navz.copy()
    for _ in range(steps):
        nan = np.isnan(z)
        if not nan.any():
            break
        acc = np.zeros_like(z)
        cnt = np.zeros_like(z)
        for dj, di in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            sh = np.full_like(z, np.nan)
            src = z
            if dj == 1:
                sh[1:, :] = src[:-1, :]
            elif dj == -1:
                sh[:-1, :] = src[1:, :]
            elif di == 1:
                sh[:, 1:] = src[:, :-1]
            else:
                sh[:, :-1] = src[:, 1:]
            ok = ~np.isnan(sh)
            acc[ok] += sh[ok]
            cnt[ok] += 1
        fill = nan & (cnt > 0)
        z[fill] = acc[fill] / cnt[fill]
    return z


def components(mask, conn4=True):
    """Label connected components of a boolean mask. Returns (labels, sizes)."""
    H, W = mask.shape
    lab = np.zeros((H, W), np.int32)
    sizes = [0]
    cur = 0
    ys, xs = np.nonzero(mask)
    for y0, x0 in zip(ys, xs):
        if lab[y0, x0]:
            continue
        cur += 1
        q = deque([(y0, x0)])
        lab[y0, x0] = cur
        n = 0
        while q:
            y, x = q.popleft()
            n += 1
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                yy, xx = y + dy, x + dx
                if 0 <= yy < H and 0 <= xx < W and mask[yy, xx] and not lab[yy, xx]:
                    lab[yy, xx] = cur
                    q.append((yy, xx))
        sizes.append(n)
    return lab, sizes


def build_layer(name):
    box = LAYERS[name]['box']
    G = Grid(box)
    stubs = [(b[0], b[1], b[2], b[3], src) for (dst, src, b) in STUBS if dst == name]
    print(f'[{name}] grid {G.W}x{G.H}')
    navz, navflat, stub, navid = nav_cells(G, name, stubs)
    nav = ~np.isnan(navz)
    print(f'[{name}] nav cells {nav.sum()}')
    zref = propagate(navz, 10)
    has = ~np.isnan(zref)
    zr = np.where(has, zref, -99999).astype(np.float32)

    # floors closest to the reference height
    fz = np.full((G.H, G.W), np.nan, np.float32)
    fbest = np.full((G.H, G.W), 1e9, np.float32)
    fcls = np.zeros((G.H, G.W), np.uint8)
    for P, n, t in floors:
        xs = [p[0] for p in P]; ys = [p[1] for p in P]
        i0, j0, i1, j1 = G.span(min(xs), min(ys), max(xs), max(ys))
        if i1 <= i0 or j1 <= j0:
            continue
        X, Y, m = convex_mask(G, P, i0, j0, i1, j1)
        if not m.any():
            continue
        Z = plane_z(P, n, X, Y)
        ref = zr[j0:j1, i0:i1]
        d = Z - ref
        cand = m & (d > -40) & (d < 28)
        score = np.abs(d) - (d < 0) * 0  # prefer closest
        sb = fbest[j0:j1, i0:i1]
        upd = cand & (score < sb)
        sb[upd] = score[upd]
        fz[j0:j1, i0:i1][upd] = Z[upd]
        cl = FI[floor_class(t)]
        fcls[j0:j1, i0:i1][upd] = cl

    # blocked at body height
    blocked = np.zeros((G.H, G.W), bool)
    glassm = np.zeros((G.H, G.W), bool)
    gratem = np.zeros((G.H, G.W), bool)
    solidm = np.zeros((G.H, G.W), bool)
    base = np.where(np.isnan(fz), zr, fz)
    for (bb, kind) in blockers:
        bx0, by0, bz0, bx1, by1, bz1 = bb
        i0 = max(0, int(math.floor((bx0 + 1 - G.x0) / C)))
        i1 = min(G.W, int(math.ceil((bx1 - 1 - G.x0) / C)))
        j0 = max(0, int(math.floor((by0 + 1 - G.y0) / C)))
        j1 = min(G.H, int(math.ceil((by1 - 1 - G.y0) / C)))
        if i1 <= i0 or j1 <= j0:
            continue
        b = base[j0:j1, i0:i1]
        hit = (bz0 < b + 60) & (bz1 > b + 20)
        blocked[j0:j1, i0:i1] |= hit
        if kind != 'clip':
            solidm[j0:j1, i0:i1] |= hit
        if kind == 'glass':
            glassm[j0:j1, i0:i1] |= hit
        elif kind == 'grate':
            gratem[j0:j1, i0:i1] |= hit

    # top of the solid column standing on each blocked cell (stacked brushes)
    topz = np.where(blocked, base + 60, -32768).astype(np.float32)
    for _ in range(5):
        changed = 0
        for (bb, kind) in blockers:
            if kind == 'clip':
                continue
            bx0, by0, bz0, bx1, by1, bz1 = bb
            i0 = max(0, int(math.floor((bx0 + 1 - G.x0) / C)))
            i1 = min(G.W, int(math.ceil((bx1 - 1 - G.x0) / C)))
            j0 = max(0, int(math.floor((by0 + 1 - G.y0) / C)))
            j1 = min(G.H, int(math.ceil((by1 - 1 - G.y0) / C)))
            if i1 <= i0 or j1 <= j0:
                continue
            t = topz[j0:j1, i0:i1]
            up = (t > -32768) & (bz0 <= t + 2) & (bz1 > t)
            if up.any():
                t[up] = bz1
                changed += 1
        if not changed:
            break

    # walkable: nav plus a short flood to the walls
    # gap cells: non-nav cells lying between two nav areas that are not
    # connected to each other (a prop obstacle the nav generator went around)
    gap = np.zeros((G.H, G.W), bool)
    R = 9
    def scan(dj, di):
        # nearest nav id within R cells in direction (dj,di), stopping at blocked cells
        res = np.zeros((G.H, G.W), np.int32)
        cur = np.zeros((G.H, G.W), np.int32)
        stop = np.zeros((G.H, G.W), bool)
        for step in range(1, R + 1):
            sh_id = np.zeros((G.H, G.W), np.int32)
            sh_bl = np.ones((G.H, G.W), bool)
            ys0, ys1 = max(0, -dj * step), G.H - max(0, dj * step)
            xs0, xs1 = max(0, -di * step), G.W - max(0, di * step)
            sh_id[ys0:ys1, xs0:xs1] = navid[ys0 + dj * step:ys1 + dj * step, xs0 + di * step:xs1 + di * step]
            sh_bl[ys0:ys1, xs0:xs1] = solid_any[ys0 + dj * step:ys1 + dj * step, xs0 + di * step:xs1 + di * step]
            new = (~stop) & (res == 0) & (sh_id > 0)
            res[new] = sh_id[new]
            stop |= sh_bl | (sh_id > 0)
        return res
    solid_any = blocked & ~nav
    connset = set()
    adj = {}
    for a in NAV:
        for lst in a['conn']:
            for b in lst:
                connset.add((a['id'], b)); connset.add((b, a['id']))
                adj.setdefault(a['id'], set()).add(b); adj.setdefault(b, set()).add(a['id'])

    def linked(a, b, y, x, r=3):
        # a and b are linked if connected directly, or through a connector
        # area lying within r cells of (y,x) (narrow doorway / passage-mouth
        # areas: the cells beside them are not a barrier)
        if (a, b) in connset:
            return True
        win = navid[max(0, y - r):y + r + 1, max(0, x - r):x + r + 1]
        sa, sb = adj.get(a, ()), adj.get(b, ())
        for X in np.unique(win):
            X = int(X)
            if X and X in sa and X in sb:
                return True
        return False
    for (d1, d2) in (((0, 1), (0, -1)), ((1, 0), (-1, 0))):
        A = scan(*d1); B = scan(*d2)
        both = (~nav) & (A > 0) & (B > 0) & (A != B)
        ys, xs = np.nonzero(both)
        for y, x in zip(ys, xs):
            if not linked(int(A[y, x]), int(B[y, x]), y, x):
                gap[y, x] = True
    print(f'[{name}] gap cells {gap.sum()}')

    walk = nav.copy()
    owner = navid.copy()
    fzz = np.where(np.isnan(fz), zr, fz)
    frontier = deque(zip(*np.nonzero(nav)))
    MAXD = 5
    dist = np.where(nav, 0, 99).astype(np.int16)
    dist[stub] = MAXD  # copied stub cells don't grow
    while frontier:
        y, x = frontier.popleft()
        if dist[y, x] >= MAXD:
            continue
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            yy, xx = y + dy, x + dx
            if not (0 <= yy < G.H and 0 <= xx < G.W) or walk[yy, xx] or blocked[yy, xx] or gap[yy, xx]:
                continue
            if np.isnan(fz[yy, xx]) or abs(fz[yy, xx] - fzz[y, x]) > 24:
                continue
            walk[yy, xx] = True
            owner[yy, xx] = owner[y, x]
            dist[yy, xx] = dist[y, x] + 1
            frontier.append((yy, xx))

    # enclosed holes (vehicles, props) and gaps become barrier cells: floor
    # continues under them but they are impassable (props stand there)
    barrier = np.zeros((G.H, G.W), bool)
    lab, sizes = components(~walk)
    border = set(np.unique(np.concatenate([lab[0, :], lab[-1, :], lab[:, 0], lab[:, -1]])))
    filled = 0
    for k in range(1, len(sizes)):
        if k in border or sizes[k] > 2500:
            continue
        m = lab == k
        bfrac = solidm[m].mean()
        if bfrac < 0.2 or (sizes[k] <= 6 and bfrac < 0.6):
            if sizes[k] <= 6:
                walk |= m
            else:
                barrier |= m
            filled += sizes[k]
    gapb = gap & ~walk & ~solidm & ~np.isnan(fz) & ~barrier
    barrier |= gapb
    # cells under player clips only (no solid brush: vehicles, fenced-off
    # pens, barricades the mapper clipped) are invisible walls in NMRiH: keep
    # their floor as barrier cells (impassable, see-through) instead of solid
    # wall, flooding in from walkable space
    clipc = blocked & ~solidm & ~walk & ~barrier & ~np.isnan(fz) & has & (np.abs(fz - zr) < 40)
    seed = clipc & (np.roll(walk, 1, 0) | np.roll(walk, -1, 0) | np.roll(walk, 1, 1) | np.roll(walk, -1, 1))
    q = deque(zip(*np.nonzero(seed)))
    clipb = seed.copy()
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            yy, xx = y + dy, x + dx
            if 0 <= yy < G.H and 0 <= xx < G.W and clipc[yy, xx] and not clipb[yy, xx] and abs(fz[yy, xx] - fz[y, x]) <= 24:
                clipb[yy, xx] = True
                q.append((yy, xx))
    barrier |= clipb
    print(f'[{name}] clip barrier cells {clipb.sum()}')
    print(f'[{name}] filled {filled} hole cells, barrier cells {barrier.sum()}')
    walk |= barrier
    # fill floor heights where missing (cells with no floor face and no nav
    # height nearby take the propagated floor of their walkable neighbours;
    # never the 'no reference' sentinel)
    fz = np.where(walk & np.isnan(fz), np.where(has, zref, np.nan), fz)
    for steps in (30, 200):
        if not (walk & np.isnan(fz)).any():
            break
        fz = np.where(walk & np.isnan(fz), propagate(np.where(walk, fz, np.nan), steps), fz)
    walk &= ~np.isnan(fz)
    bad = walk & ((fz < -2000) | (fz > 2000))
    assert not bad.any(), f'{name}: {bad.sum()} walkable cells with out-of-range floors'
    # hole barriers (props the nav mesh went round) never reach into the
    # player hull around nav: a nav sample is a valid player centre in NMRiH,
    # so its 32x32 box (2 cells each way) must stay free. Gap barriers (thin
    # obstacles between unconnected nav areas) are kept whole.
    hole = barrier & ~gapb
    halo = np.zeros_like(hole)
    navf = np.where(nav, navz, np.nan)
    for dj in range(-2, 3):
        for di in range(-2, 3):
            sh = np.full_like(navf, np.nan)
            ys0, ys1 = max(0, dj), G.H + min(0, dj)
            xs0, xs1 = max(0, di), G.W + min(0, di)
            sh[ys0:ys1, xs0:xs1] = navf[ys0 - dj:ys1 - dj, xs0 - di:xs1 - di]
            halo |= hole & ~np.isnan(sh) & (np.abs(sh - np.where(np.isnan(fz), 0, fz)) <= 24)
    barrier &= ~halo
    cleared = halo  # former obstacle cells: never the site of a barrier edge
    print(f'[{name}] hole barrier cells cleared round nav: {halo.sum()}')

    # drop tiny walkable islands
    lab, sizes = components(walk & ~barrier)
    for k in range(1, len(sizes)):
        if sizes[k] < 40:
            walk[lab == k] = False
    barrier &= walk

    # final floor heights: flat areas exact, ramps as 16-unit steps
    final = np.zeros((G.H, G.W), np.int16)
    ramp = walk & nav & ~navflat
    fl = np.where(np.isnan(fz), 0, fz)
    final[walk] = np.round(fl[walk]).astype(np.int16)
    nz = np.where(nav, navz, 0)
    final[ramp] = (np.round(nz[ramp] / 16) * 16).astype(np.int16)
    # snap near-multiples of 8
    r8 = np.round(final / 8.0) * 8
    close = np.abs(final - r8) <= 3
    final = np.where(close, r8, final).astype(np.int16)

    # ceilings
    cz = np.full((G.H, G.W), 32767, np.int32)
    ccls = np.zeros((G.H, G.W), np.uint8)
    for P, n, t in ceils:
        xs = [p[0] for p in P]; ys = [p[1] for p in P]
        i0, j0, i1, j1 = G.span(min(xs), min(ys), max(xs), max(ys))
        if i1 <= i0 or j1 <= j0:
            continue
        X, Y, m = convex_mask(G, P, i0, j0, i1, j1)
        m &= walk[j0:j1, i0:i1]
        if not m.any():
            continue
        Z = plane_z(P, n, X, Y)
        f = final[j0:j1, i0:i1]
        cur = cz[j0:j1, i0:i1]
        upd = m & (Z > f + 56) & (Z < cur)
        cur[upd] = np.round(Z[upd]).astype(np.int32)
        ccls[j0:j1, i0:i1][upd] = CI[ceil_class(t)]
    sky = walk & ((ccls == CI['sky']) | (cz == 32767))
    cz[sky] = 32767
    ccls[sky] = CI['sky']

    # wall surface classes for non-walkable cells next to walkable ones
    wcls = np.zeros((G.H, G.W), np.uint8)
    wscore = np.zeros((G.H, G.W), np.float32)
    wtop = np.full((G.H, G.W), -32768, np.int32)  # highest wall face top on a solid cell next to walkable space
    for P, n, t, cls in walls:
        wc = wall_class(t)
        if wc is None:
            continue
        hx, hy = n[0], n[1]
        hl = math.hypot(hx, hy)
        if hl < 1e-6:
            continue
        hx /= hl; hy /= hl
        tx, ty = -hy, hx
        proj = [p[0] * tx + p[1] * ty for p in P]
        off = sum(p[0] * hx + p[1] * hy for p in P) / len(P)
        zs = [p[2] for p in P]
        z0, z1 = min(zs), max(zs)
        a, b = min(proj), max(proj)
        L = b - a
        if L < 2:
            continue
        steps = max(2, int(L / 4) + 1)
        for s in range(steps):
            u = a + (b - a) * (s + 0.5) / steps
            px, py = tx * u + hx * off, ty * u + hy * off
            # front cell (walkable side) and back cell (solid side)
            fi = int((px + hx * 4 - G.x0) // C); fj = int((py + hy * 4 - G.y0) // C)
            bi = int((px - hx * 4 - G.x0) // C); bj = int((py - hy * 4 - G.y0) // C)
            if not (0 <= bi < G.W and 0 <= bj < G.H and 0 <= fi < G.W and 0 <= fj < G.H):
                continue
            if walk[bj, bi]:
                continue
            ref = final[fj, fi] if walk[fj, fi] else (zr[bj, bi] if has[bj, bi] else None)
            if ref is None:
                continue
            if z1 > ref + 8 and z0 < ref + 2048 and cls == 'worldspawn':
                wtop[bj, bi] = max(wtop[bj, bi], int(round(z1)))
            ov = min(z1, ref + 128) - max(z0, ref)
            if ov <= 0:
                continue
            sc = ov + (8 if wc in ('glass', 'shutter') else 0)
            if sc > wscore[bj, bi]:
                wscore[bj, bi] = sc
                wcls[bj, bi] = WI[wc]

    # open water surfaces (bay) over non-walkable cells
    wsurf = np.full((G.H, G.W), -32768, np.int32)
    for P, n, t in floors:
        if 'WATER' not in t.upper():
            continue
        xs = [p[0] for p in P]; ys = [p[1] for p in P]
        i0, j0, i1, j1 = G.span(min(xs), min(ys), max(xs), max(ys))
        if i1 <= i0 or j1 <= j0:
            continue
        X, Y, m = convex_mask(G, P, i0, j0, i1, j1)
        Z = plane_z(P, n, X, Y)
        m &= (Z > -400) & (Z < 0)
        sub = wsurf[j0:j1, i0:i1]
        sub[m] = np.maximum(sub[m], np.round(Z[m]).astype(np.int32))

    # water volumes (surface height) over walkable or nearby cells
    water = np.full((G.H, G.W), -32768, np.int32)
    for bb in water_brushes:
        bx0, by0, bz0, bx1, by1, bz1 = bb
        i0, j0, i1, j1 = G.span(bx0, by0, bx1, by1)
        if i1 <= i0 or j1 <= j0:
            continue
        sub = water[j0:j1, i0:i1]
        f = final[j0:j1, i0:i1]
        w = walk[j0:j1, i0:i1]
        hit = w & (bz1 > f) & (bz0 < f + 64)
        sub[hit] = np.maximum(sub[hit], int(round(bz1)))

    # barrier edges: adjacent walkable cells owned by nav areas that are not
    # connected (thin obstacles the nav mesh saw: fences, barricades, rails)
    hbar = np.zeros((G.H + 1, G.W), bool)
    vbar = np.zeros((G.H, G.W + 1), bool)
    free = walk & ~barrier & ~cleared
    # propagate owners into cells without one (hole fills, stubs)
    for _ in range(4):
        miss = free & (owner == 0)
        if not miss.any():
            break
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            sh = np.zeros_like(owner)
            if dy == 1: sh[1:, :] = owner[:-1, :]
            elif dy == -1: sh[:-1, :] = owner[1:, :]
            elif dx == 1: sh[:, 1:] = owner[:, :-1]
            else: sh[:, :-1] = owner[:, 1:]
            take = miss & (owner == 0) & (sh > 0)
            owner[take] = sh[take]
    a = owner[:-1, :]; b = owner[1:, :]
    m = free[:-1, :] & free[1:, :] & (a > 0) & (b > 0) & (a != b) & (np.abs(final[:-1, :].astype(np.int32) - final[1:, :]) < 40)
    for y, x in zip(*np.nonzero(m)):
        if not linked(int(a[y, x]), int(b[y, x]), y, x):
            hbar[y + 1, x] = True
    a = owner[:, :-1]; b = owner[:, 1:]
    m = free[:, :-1] & free[:, 1:] & (a > 0) & (b > 0) & (a != b) & (np.abs(final[:, :-1].astype(np.int32) - final[:, 1:]) < 40)
    for y, x in zip(*np.nonzero(m)):
        if not linked(int(a[y, x]), int(b[y, x]), y, x):
            vbar[y, x + 1] = True
    print(f'[{name}] barrier edges h {hbar.sum()} v {vbar.sum()}')

    return dict(G=G, walk=walk, barrier=barrier, clip=clipb & barrier, wsurf=wsurf, topz=topz, wtop=wtop, floor=final, ceil=cz, fcls=fcls, ccls=ccls, wcls=wcls, hbar=hbar, vbar=vbar,
                nav=nav, blocked=blocked, glass=glassm, grate=gratem, water=water)


def nav_barriers():
    """Segments where two nav areas touch but are not connected either way:
    thin obstacles (fences, railings, barricades, gates) the nav mesh saw."""
    byid = {a['id']: a for a in NAV}
    conn = {}
    for a in NAV:
        s = set()
        for lst in a['conn']:
            s.update(lst)
        conn[a['id']] = s
    # spatial hash on 256 cells
    from collections import defaultdict
    hsh = defaultdict(list)
    for a in NAV:
        x0, y0 = a['nw'][0], a['nw'][1]
        x1, y1 = a['se'][0], a['se'][1]
        for gx in range(int(x0 // 256) - 1, int(x1 // 256) + 2):
            for gy in range(int(y0 // 256) - 1, int(y1 // 256) + 2):
                hsh[(gx, gy)].append(a)
    segs = []
    seen = set()
    for a in NAV:
        ax0, ay0, az0 = a['nw']; ax1, ay1, az1 = a['se']
        cand = set()
        for gx in range(int(ax0 // 256) - 1, int(ax1 // 256) + 2):
            for gy in range(int(ay0 // 256) - 1, int(ay1 // 256) + 2):
                for b in hsh[(gx, gy)]:
                    cand.add(b['id'])
        for bid in cand:
            if bid <= a['id']:
                continue
            b = byid[bid]
            if bid in conn[a['id']] or a['id'] in conn[bid]:
                continue
            bx0, by0, bz0 = b['nw']; bx1, by1, bz1 = b['se']
            za = (min(az0, az1, a['nez'], a['swz']), max(az0, az1, a['nez'], a['swz']))
            zb = (min(bz0, bz1, b['nez'], b['swz']), max(bz0, bz1, b['nez'], b['swz']))
            if za[0] - zb[1] > 30 or zb[0] - za[1] > 30:
                continue  # different levels (ledge/drop): not a thin barrier
            zm = (max(za[0], zb[0]) + min(za[1], zb[1])) / 2
            for (p, q, lo, hi) in ((ax1, bx0, max(ay0, by0), min(ay1, by1)), (bx1, ax0, max(ay0, by0), min(ay1, by1))):
                if abs(p - q) <= 2 and hi - lo >= 8:
                    segs.append(('v', (p + q) / 2, lo, hi, zm))
            for (p, q, lo, hi) in ((ay1, by0, max(ax0, bx0), min(ax1, bx1)), (by1, ay0, max(ax0, bx0), min(ax1, bx1))):
                if abs(p - q) <= 2 and hi - lo >= 8:
                    segs.append(('h', (p + q) / 2, lo, hi, zm))
    print(len(segs), 'nav barrier segments')
    return segs


BARRIERS = None


def enc(arr):
    return base64.b64encode(zlib.compress(np.ascontiguousarray(arr).tobytes(), 9)).decode()


def save_layers(res):
    out = {'cell': C, 'wallClasses': WALL_CLASSES, 'floorClasses': FLOOR_CLASSES, 'ceilClasses': CEIL_CLASSES,
           'portals': {'P100X': P100X, 'P101Y': P101Y}, 'layers': {}}
    for name, r in res.items():
        G = r['G']
        floor = np.where(r['walk'], r['floor'], -32768).astype('<i2')
        ceil = np.where(r['walk'], np.minimum(r['ceil'], 32767), -32768).astype('<i2')
        fcls = np.where(r['walk'], r['fcls'], 0).astype('u1')
        ccls = np.where(r['walk'], r['ccls'], 0).astype('u1')
        wcls = np.where(r['walk'], 0, r['wcls']).astype('u1')
        flags = (r['glass'].astype('u1') * 1 | r['grate'].astype('u1') * 2 | r['blocked'].astype('u1') * 4)
        # walkable cells: 8 barrier (impassable), 16 inside a nav area, 32 barrier under a player clip
        flags = np.where(r['walk'], r['barrier'].astype('u1') * 8 | (r['nav'] & ~r['barrier']).astype('u1') * 16 | r['clip'].astype('u1') * 32, flags).astype('u1')
        water = np.where(r['walk'], np.where(r['water'] > -32768, r['water'], -32768), r['wsurf']).astype('<i2')
        out['layers'][name] = {
            'x0': G.x0, 'y0': G.y0, 'w': G.W, 'h': G.H,
            'floor': enc(floor), 'ceil': enc(ceil), 'fcls': enc(fcls), 'ccls': enc(ccls),
            'wcls': enc(wcls), 'flags': enc(flags), 'water': enc(water),
            'hbar': enc(r['hbar'].astype('u1')), 'vbar': enc(r['vbar'].astype('u1')),
            'top': enc(np.where(r['walk'], -32768, np.clip(np.round(r['topz']), -32768, 32767)).astype('<i2')),
            'wtop': enc(np.where(r['walk'], -32768, np.clip(r['wtop'], -32768, 32767)).astype('<i2')),
        }
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, 'raster.json'), 'w') as f:
        json.dump(out, f, separators=(',', ':'))
    print('wrote', os.path.join(OUT, 'raster.json'), os.path.getsize(os.path.join(OUT, 'raster.json')) // 1024, 'KB')


def preview(name, r):
    try:
        from PIL import Image
    except ImportError:
        return
    G = r['G']
    img = np.zeros((G.H, G.W, 3), np.uint8)
    w = r['walk']
    f = r['floor'].astype(np.float32)
    lo, hi = -600, 200
    t = np.clip((f - lo) / (hi - lo), 0, 1)
    img[..., 0] = np.where(w, 40 + 180 * t, 0)
    img[..., 1] = np.where(w, 80 + 150 * (1 - abs(t - 0.6)), 0)
    img[..., 2] = np.where(w, 200 - 150 * t, 0)
    indoor = w & (r['ceil'] < 32767)
    img[indoor] = (img[indoor] * 0.6).astype(np.uint8)
    wc = (~w) & (r['wcls'] > 0)
    pal = {WI['brick']: (150, 60, 50), WI['brick2']: (110, 90, 90), WI['facade']: (170, 150, 110), WI['facade2']: (140, 140, 160),
           WI['tile']: (200, 200, 200), WI['concrete']: (120, 120, 120), WI['plaster']: (180, 170, 140), WI['wood']: (140, 100, 50),
           WI['metal']: (90, 110, 130), WI['stone']: (130, 130, 100), WI['glass']: (100, 220, 255), WI['fence']: (220, 220, 0),
           WI['shutter']: (200, 120, 200), WI['trim']: (90, 90, 60), WI['step']: (100, 100, 100), WI['sewer']: (60, 100, 60),
           WI['container']: (200, 60, 200)}
    for k, c in pal.items():
        img[wc & (r['wcls'] == k)] = c
    wat = w & (r['water'] > -32768)
    img[wat] = (30, 60, 200)
    img = img[::-1]
    os.makedirs(PREV, exist_ok=True)
    Image.fromarray(img).save(os.path.join(PREV, f'raster_{name}.png'))



# --- point data ---------------------------------------------------------------
# vehicle model -> (thing type, length along model x, width)
VEH = {
    'police-vic': (9100, 200, 84), 'crown-vic': (9100, 200, 84),
    'ambulance_open': (9101, 250, 100), 'ambulance': (9101, 250, 100),
    'taxi': (9102, 196, 84),
    'van_ford_econ': (9103, 216, 92), 'van_ford_econ_dmgb': (9103, 216, 92),
    'chevrolet_pickup': (9104, 216, 88),
    'car_civic_damaged': (9105, 180, 78), 'car_civic': (9105, 180, 78), 'cadillac': (9105, 200, 84),
    'audi-d1': (9105, 180, 76), 'car002a': (9105, 176, 76), 'car002b': (9105, 176, 76), 'car004a': (9105, 176, 76),
    'car003b': (9105, 176, 76), 'car001a_hatchback': (9105, 168, 76), 'car001b_hatchback': (9105, 168, 76),
    'lexus_is_300_trunk_open': (9105, 180, 76),
    'car_humvee_pick-up': (9110, 190, 92), 'bradley_base': (9110, 260, 136), 'army_truck_lmtv_02': (9110, 300, 104),
    'bus_transit_mta': (9107, 480, 104), 'truck_kenworth': (9107, 260, 100), 'trailer_gas': (9107, 520, 104),
    'trailer_box': (9107, 560, 104),
    'car_fire_truck': (9108, 360, 104), 'car_fire_truck_burned': (9108, 360, 104),
}
PROPMAP = [
    ('concrete_barrier', 9120), ('police_barricade', 9121), ('barricade_01', 9121), ('pylon', 9122),
    ('generatortrailer', 9123), ('rc_generator', 9123), ('streetlight02', 9130), ('light_post', 9130), ('street/light_001', 9130),
    ('payphone', 9128), ('bench', 9129), ('garbagecan01.mdl', 9126), ('trashcan', 9126), ('trin-trashcan', 9126),
    ('wheeliebin', 9126), ('subway_trashcan', 9126), ('metal_bin', 9126), ('fire_hydrant', 9127),
    ('wooden_pallet', 9133), ('fallout_pallet', 9133), ('wood_crate', 9132), ('army_crate', 9132), ('paperlantern', 9131),
]
SIGNS = ['sign_chinatown_01', 'sign_chinatown_02', 'sign_chinatown_03', 'sign_drugs', 'sign_garage_01', 'fallout_motel_sign',
         'subway_sign01', 'sign_gun_shop_side', 'sign_gun_shop_front', 'sign_market_lg_01', 'sign_store_blank_160']
# other solid props (shelves, dumpsters, tables...): category -> how the map
# draws the obstacle the nav mesh went round (textured raised block)
OBST = [('shelf', 'shelf'), ('rack', 'shelf'), ('p_street_dump', 'dumpster'), ('dumpster', 'dumpster'), ('pallet', 'pallet'),
        ('crate', 'crate'), ('boxes', 'crate'), ('cardboard', 'crate'), ('table', 'table'), ('desk', 'table'), ('counter', 'table'),
        ('workbench', 'table'), ('barrel', 'barrel'), ('drum', 'barrel'), ('sandbag', 'sandbag'), ('tire', 'tire'),
        ('vending', 'machine'), ('washer', 'machine'), ('dryer', 'machine'), ('fridge', 'machine'), ('locker', 'machine'),
        ('cabinet', 'machine'), ('generator', 'machine'), ('garbage', 'garbage'), ('trash', 'garbage'), ('cot', 'bed'),
        ('matress', 'bed'), ('mattress', 'bed'), ('bed', 'bed'), ('couch', 'bed'), ('sofa', 'bed'), ('wirespool', 'spool'),
        ('spool', 'spool'), ('scaffold', 'scaffold'), ('container', 'container'), ('wheeliebin', 'dumpster'), ('bin', 'dumpster'),
        ('bumper', 'concrete'), ('barricade', 'wood'), ('plank', 'wood'), ('chair', 'table'), ('stove', 'machine'),
        ('oven', 'machine'), ('pipe', 'metal'), ('tank', 'metal'), ('cart', 'metal')]
FENCES = {'fence_set1_128': 128, 'fence_set1_256': 256, 'fence_set1_512': 512, 'urban/fence.mdl': 128,
          'exterior_fence002b': 128, 'exterior_fence002c': 128, 'exterior_fence002d': 128, 'exterior_fence002a': 128,
          'exterior_fence003a': 128, 'exterior_fence003b': 128, 'fence01a': 128, 'fence01b': 128, 'fence02a': 128}


def collect_ref(res):
    street = res['street']
    G = street['G']
    navm = street['nav']

    def nav_at(x, y):
        i = int((x - G.x0) // C); j = int((y - G.y0) // C)
        return 0 <= i < G.W and 0 <= j < G.H and navm[j, i]

    def best_fit(x, y, yaw, L, Wd):
        # the model origin is not always the footprint centre (Bradley, semi
        # trailers): slide the footprint (and try the other axis) to the
        # position that best matches the nav hole; small moves only
        f0 = hole_fit(x, y, yaw, L, Wd)
        best = (f0, x, y, yaw)
        if f0 >= 0.9:
            return best
        for a in (yaw, yaw + 90):
            c, s = math.cos(math.radians(a)), math.sin(math.radians(a))
            for du in range(-int(L / 4) // 8 * 8, int(L / 4) + 1, 8):
                for dv in range(-int(Wd / 4) // 8 * 8, int(Wd / 4) + 1, 8):
                    px, py = x + du * c - dv * s, y + du * s + dv * c
                    f = hole_fit(px, py, a, L, Wd) - 0.0004 * math.hypot(du, dv) - (0.02 if a != yaw else 0)
                    if f > best[0] + 1e-9:
                        best = (f, px, py, a)
        return best if best[0] > f0 + 0.1 else (f0, x, y, yaw)

    def hole_fit(x, y, yaw, L, Wd):
        # fraction of the footprint that is NOT nav (vehicles cut holes in the nav mesh)
        c, s = math.cos(math.radians(yaw)), math.sin(math.radians(yaw))
        tot = hit = 0
        for a in np.linspace(-L / 2 + 8, L / 2 - 8, 9):
            for b in np.linspace(-Wd / 2 + 8, Wd / 2 - 8, 5):
                px, py = x + a * c - b * s, y + a * s + b * c
                tot += 1
                hit += 0 if nav_at(px, py) else 1
        return hit / tot

    out = {'vehicles': [], 'props': [], 'obst': [], 'signs': [], 'fences': [], 'lights': [], 'zspawn': [], 'spawners': [], 'items': []}
    for p in PROPS:
        m = p['model'].lower()
        short = m.split('/')[-1].replace('.mdl', '')
        x, y, z = p['origin']
        yaw = p['angles'][1]
        if short in VEH:
            t, L, Wd = VEH[short]
            # model forward axis: pick the orientation that matches the nav hole best
            f0 = hole_fit(x, y, yaw, L, Wd)
            f1 = hole_fit(x, y, yaw + 90, L, Wd)
            out['vehicles'].append({'m': short, 't': t, 'x': round(x), 'y': round(y), 'z': round(z), 'yaw': round(yaw % 360),
                                    'len': L, 'wid': Wd, 'f0': round(f0, 2), 'f1': round(f1, 2)})
            continue
        if any(k in short for k in SIGNS):
            out['signs'].append({'m': short, 'x': round(x), 'y': round(y), 'z': round(z), 'yaw': round(yaw % 360)})
            continue
        fl = next((v for k, v in FENCES.items() if k in m), None)
        if fl:
            out['fences'].append({'m': short, 'x': round(x), 'y': round(y), 'z': round(z), 'yaw': round(yaw % 360), 'len': fl})
            continue
        if 'chinatown_gate' in m or 'dock_crane' in m or 'boat_fishing' in m:
            out['props'].append({'t': 0, 'm': short, 'x': round(x), 'y': round(y), 'z': round(z), 'yaw': round(yaw % 360)})
            continue
        t = next((v for k, v in PROPMAP if k in m), None)
        if t:
            q = {'t': t, 'm': short, 'x': round(x), 'y': round(y), 'z': round(z), 'yaw': round(yaw % 360)}
            if any(o['t'] == t and abs(o['x'] - q['x']) <= 8 and abs(o['y'] - q['y']) <= 8 and abs(o['z'] - q['z']) <= 16 for o in out['props']):
                continue  # duplicate placement in the reference (same model stacked on itself)
            out['props'].append(q)
            continue
        cat = next((v for k, v in OBST if k in short), None)
        if cat:
            out['obst'].append({'c': cat, 'm': short, 'x': round(x), 'y': round(y), 'z': round(z), 'yaw': round(yaw % 360)})
    # vehicle models here have their long axis along model y (yaw + 90): settle by majority vote
    votes = sum(1 if v['f1'] > v['f0'] + 0.05 else -1 if v['f0'] > v['f1'] + 0.05 else 0 for v in out['vehicles'])
    rot = 90 if votes > 0 else 0
    print('vehicle axis vote', votes, '-> +%d' % rot)
    for v in out['vehicles']:
        a = rot
        if v['f0'] > v['f1'] + 0.25:
            a = 0
        elif v['f1'] > v['f0'] + 0.25:
            a = 90
        v['yaw'] = (v['yaw'] + a) % 360
        v['fit'] = max(v.pop('f0'), v.pop('f1'))
        f, cx, cy, yw = best_fit(v['x'], v['y'], v['yaw'], v['len'], v['wid'])
        if (round(cx), round(cy), round(yw) % 360) != (v['x'], v['y'], v['yaw']):
            print(f"  vehicle {v['m']} ({v['x']},{v['y']}) yaw {v['yaw']} fit {v['fit']} -> centre ({round(cx)},{round(cy)}) yaw {round(yw) % 360} fit {round(f, 2)}")
            v['ox'], v['oy'] = v['x'], v['y']
            v['x'], v['y'], v['yaw'], v['fit'] = round(cx), round(cy), round(yw) % 360, round(f, 2)
    for e in ENTS:
        cl = e.get('classname')
        if cl in ('light', 'light_spot'):
            o = [float(v) for v in e['origin'].split()]
            lv = (e.get('_light') or '255 255 255 200').split()
            r, g, b = (int(float(v)) for v in lv[:3])
            i = float(lv[3]) if len(lv) > 3 else 200
            out['lights'].append({'x': round(o[0]), 'y': round(o[1]), 'z': round(o[2]), 'c': [r, g, b], 'i': round(i),
                                  'spot': cl == 'light_spot', 'pitch': float(e.get('pitch', 0) or 0)})
        elif cl == 'random_spawner':
            o = [float(v) for v in e['origin'].split()]
            cats = {k: int(float(v)) for k, v in e.items() if k not in ('origin', 'angles', 'model', 'classname', 'hammerid',
                    'spawnflags', 'ammo_fill_pct_min', 'ammo_fill_pct_max', 'targetname') and v not in ('0', '')
                    and v.replace('.', '').isdigit()}
            out['spawners'].append({'x': round(o[0]), 'y': round(o[1]), 'z': round(o[2]), 'cats': cats})
        elif cl in ('item_bandages', 'item_first_aid', 'item_pills', 'item_maglite', 'tool_welder', 'tool_barricade',
                    'me_axe_fire', 'me_machete', 'me_sledge', 'me_pipe_lead', 'me_wrench'):
            o = [float(v) for v in e['origin'].split()]
            out['items'].append({'c': cl, 'x': round(o[0]), 'y': round(o[1]), 'z': round(o[2])})
    for b in BR:
        if 'TOOLS/ZOMBIE_SPAWN' in [t.upper() for t in b['tex']]:
            out['zspawn'].append([round(v) for v in b['bb']])
    kp = json.load(open(os.path.join(REF, 'chinatown_keypoints.json')))
    out['heli'] = [[round(v) for v in p] for p in kp['helicopter_path']]
    out['extract'] = kp['extraction_zone_bbox']
    with open(os.path.join(OUT, 'ref.json'), 'w') as f:
        json.dump(out, f, separators=(',', ':'))
    print('wrote ref.json:', {k: len(v) for k, v in out.items()})


if __name__ == '__main__':
    only = os.environ.get('CT_LAYERS')
    names = only.split(',') if only else list(LAYERS)
    res = {}
    for name in names:
        res[name] = build_layer(name)
        preview(name, res[name])
    if not only:
        save_layers(res)
        collect_ref(res)
