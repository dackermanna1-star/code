# Level-3 backpack: ~65 l expedition rucksack (coyote cordura): tall body rising above the shoulders, overhanging
# lid pocket, two side pockets, front shove-it pocket with compression straps, bedroll strapped underneath, padded
# hip-belt wings and harness. Origin = upper-back attach point, root-space (0, 1.40, -0.185).
from _pack import Pack, OY, OZ, snap_path
from gkit import catmull, lathe_mesh, MM
from mathutils import Matrix
import math

OUT = 'gear'
TEX = 1024
MS = 2.5
DECIMATE = 0.6
DECIMATE_MIN = 400
META = dict(kind='backpack', level=3, attach_bone='Spine2', attach_offset_m=[0.0, 0.079, -0.165], origin_root_space_m=[0.0, OY, OZ],
            capacity_l=65)


def build(g):
    pk = Pack(g, 'cordura_tan', 'webbing_tan')
    W, H, D = 0.34, 0.64, 0.25
    yb = 0.98
    body = pk.box('main', W, H, D, 0.0, yb + H / 2, OZ, puff=0.02, seed=21, taper_top=0.06)
    pk.box('backpad', W * 0.84, H * 0.8, 0.038, 0.0, yb + H / 2 - 0.02, OZ + 0.028, kind='cordura_blk', puff=0.006, seed=22)
    fz = OZ - D
    # lid pocket overhanging the top
    lid = pk.box('lid', W * 1.02, 0.11, D * 1.05, 0.0, yb + H + 0.02, OZ - 0.005, puff=0.02, seed=23)
    # side pockets
    for side in (1, -1):
        pk.box(f'side{side}', 0.07, 0.3, D * 0.7, side * (W / 2 + 0.02), yb + 0.2, OZ - D * 0.15, puff=0.01, seed=24 + side)
    # front shove-it pocket
    sp = pk.box('front', W * 0.8, 0.38, 0.05, 0.0, yb + 0.25, fz + 0.012, puff=0.008, seed=27)
    # compression straps over the front pocket + buckles
    for k, y in enumerate((yb + 0.22, yb + 0.4)):
        pts = [(-W / 2 - 0.02, y, OZ - D * 0.5), (-W * 0.45, y, fz - 0.05), (0.0, y, fz - 0.06), (W * 0.45, y, fz - 0.05), (W / 2 + 0.02, y, OZ - D * 0.5)]
        L = [pk.L(*p) for p in catmull(pts, n=6)]
        P, N = snap_path(body, L, 0.004)
        P2, N2 = snap_path(sp, P, 0.004)
        P = [a if (a - b).length > 0.03 else b for a, b in zip(P, P2)]
        pk.webbing(f'comp{k}', P, 0.022, 0.0025, ups=N)
        m = len(P) // 2
        pk.buckle_at(f'cb{k}', P[m] + N[m] * 0.006, N[m], w=0.036, h=0.026)
    # lid straps
    for side in (1, -1):
        x = side * 0.09
        pts = [(x, yb + H + 0.06, OZ - 0.05), (x, yb + H + 0.07, fz + 0.05), (x, yb + H - 0.02, fz - 0.005), (x, yb + H - 0.12, fz - 0.02)]
        L = [pk.L(*p) for p in catmull(pts, n=5)]
        P, N = snap_path(lid, L[:len(L) // 2], 0.003)
        P3, N3 = snap_path(body, L[len(L) // 2:], 0.003)
        pk.webbing(f'lidstrap{side}', P + P3, 0.022, 0.0025, ups=N + N3)
        pk.buckle_at(f'lidbuckle{side}', P3[-1] + N3[-1] * 0.004, N3[-1], w=0.03, h=0.028)
    # bedroll under the pack
    roll = lathe_mesh([(-210, 0), (-210, 62), (-206, 68), (206, 68), (210, 62), (210, 0)], segs=28)
    # lathe axis = local x (f); rotate to lateral (local z = s)
    M = Matrix.Translation(pk.L(0.0, yb - 0.055, OZ - D * 0.5)) @ Matrix.Rotation(math.radians(90), 4, 'Y')
    g.mesh('bedroll', roll, 'foam', 'body', M=M)
    for side in (1, -1):
        x = side * 0.13
        pts = [(x, yb + 0.02, OZ - 0.03), (x, yb - 0.11, OZ - 0.03), (x, yb - 0.13, OZ - D * 0.5), (x, yb - 0.11, fz + 0.03), (x, yb + 0.02, fz - 0.005)]
        L = [pk.L(*p) for p in catmull(pts, n=5)]
        pk.webbing(f'rollstrap{side}', L, 0.022, 0.003, ups=(0, 0, 1))
    # hip belt wings
    b = pk.b
    for side in (1, -1):
        th0, th1 = (100, 150) if side > 0 else (-150, -100)
        b.wrap_panel(f'hip{side}', 'cordura_blk', th0, th1, 0.96, 1.06, 0.012, 0.022, nu=12, nv=4)
    pk.grab_handle(yb + H + 0.07, OZ - 0.04)
    pk.harness(yb + H - 0.14, yb + 0.05, W / 2, width=0.07, thick=0.018)
    g.set_origin(0, 0)
