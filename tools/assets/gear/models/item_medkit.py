# Med kit: red cordura trauma bag with white-cross patches, wrap-around zip, twin carry handles, end pockets.
# Origin = bottom centre on the ground; front faces +Z.
import math
from mathutils import Vector, Matrix
from gkit import soft_box, catmull, sweep, rbox_mesh, MM
from _pack import snap_path

OUT = 'items'
TEX = 1024
MS = 1.5
META = dict(kind='heal', type='med_kit')


def L(x, y, z):          # glTF -> local
    return Vector((z, y, -x))


def build(g):
    W, H, D = 0.40, 0.22, 0.21
    me = soft_box(D, H, W, 0.04, puff=0.012, wrinkle=0.0015, wscale=0.05, seed=31, subd=2)
    me.transform(Matrix.Translation(L(0, H / 2, 0)))
    body = me.copy()
    g.mesh('bag', me, 'cordura_red', 'body')
    # end pockets
    for sx in (-1, 1):
        pm = soft_box(D * 0.7, H * 0.65, 0.06, 0.018, puff=0.006, wrinkle=0.001, seed=33 + sx, subd=2)
        pm.transform(Matrix.Translation(L(sx * (W / 2 + 0.022), H * 0.38, 0)))
        g.mesh(f'pocket{sx}', pm, 'cordura_red', 'body')
    # zip around the lid
    yz = H - 0.035
    pts = [L(-W / 2 + 0.02, yz, D / 2), L(W / 2 - 0.02, yz, D / 2), L(W / 2 - 0.02, yz, -D / 2), L(-W / 2 + 0.02, yz, -D / 2)]
    dense = catmull(pts, n=10, closed=True)
    P, N = snap_path(body, dense, 0.0022)
    prof = [(math.cos(2 * math.pi * k / 6) * 0.0016, math.sin(2 * math.pi * k / 6) * 0.0032) for k in range(6)]
    g.mesh('zip', sweep(P + [P[0]], prof, up=N + [N[0]], cap=False), 'plastic_blk', 'body')
    # carry handles over the top
    for sx in (-1, 1):
        x = sx * 0.07
        hp = [L(x, H - 0.005, D * 0.3), L(x, H + 0.03, D * 0.22), L(x, H + 0.045, 0), L(x, H + 0.03, -D * 0.22), L(x, H - 0.005, -D * 0.3)]
        prof = [(-0.003, -0.0125), (0.003, -0.0125), (0.003, 0.0125), (-0.003, 0.0125)]
        g.mesh(f'handle{sx}', sweep(catmull(hp, n=6), prof, up=(1, 0, 0)), 'webbing_blk', 'body')
        g.mesh(f'grip{sx}', sweep([L(x, H + 0.043, -0.04), L(x, H + 0.043, 0.04)], [(math.cos(2 * math.pi * k / 10) * 0.008, math.sin(2 * math.pi * k / 10) * 0.016) for k in range(10)]),
               'rubber_soft', 'body')
    # white cross patches (front + top) on velcro panels
    patch = g.decal_kind('cordura_red', 'cross', g.work + '/labels/cross_white_on_red.png', rough=0.75)
    pf = g.box('patch_f', D / 2 * 1000 + 8, D / 2 * 1000 + 11, 50, 170, 120, patch, r=3.0, bevel=0.8)
    g.decal_uv(pf, 'su', (-60, 50, 60, 170), facing=(1, 0, 0), min_dot=0.5)
    pt = g.front('patch_t', [(-50, 0, 3), (50, 0, 3), (50, 3, 1), (-50, 3, 1)], -50, 50, patch, u=H * 1000 + 10, bevel=0.6)
    g.decal_uv(pt, 'fs', (-50, -50, 50, 50), facing=(0, 1, 0), min_dot=0.5)
    g.set_origin(0, 0)
