# Level-3 military plate carrier (ranger green): rigid front/back plate bags with MOLLE, cummerbund, padded shoulder
# straps, triple rifle-mag pouch, admin pouch, velcro ID panel, radio pouch and drag handle.
# Origin = chest centre, root-space (0, 1.30, 0.0) in the rest pose (= Spine2 + (0, -0.021, +0.020)).
import math
from mathutils import Vector
from _vest import Body
from _wear import front_z, back_z

OUT = 'gear'
TEX = 1024
MS = 2.5
DECIMATE = 0.5
DECIMATE_MIN = 300
OY, OZ = 1.30, 0.0
META = dict(kind='vest', level=3, attach_bone='Spine2', attach_offset_m=[0.0, -0.021, 0.020], origin_root_space_m=[0.0, OY, OZ],
            notes='fitted to the male characters (max envelope of 4 variants) in the A-pose rest pose; skin to Spine1/Spine2 or parent to Spine2')
K = 'cordura_rg'
W = 'webbing_od'


def build(g):
    b = Body(g, OY, OZ)
    hw = lambda y: 0.128 if y < 1.36 else 0.128 - (y - 1.36) / 0.075 * 0.052
    hwb = lambda y: 0.13 if y < 1.37 else 0.13 - (y - 1.37) / 0.08 * 0.045
    zi_f, zo_f = b.plate_bag('front_bag', K, +1, hw, 1.10, 1.435, 0.034, gap=0.008)
    zi_b, zo_b = b.plate_bag('back_bag', K, -1, hwb, 1.09, 1.45, 0.030, gap=0.008)
    fpt = lambda x, y: (x, y, zo_f(x, y) + 0.0005)
    bpt = lambda x, y: (x, y, zo_b(x, y) - 0.0005)
    # MOLLE rows: front (under the pouches) and back
    b.molle_rows('molle_f', W, fpt, -0.115, 0.115, [1.135, 1.173, 1.211], outward=(0, 0, 1))
    b.molle_rows('molle_b', W, bpt, -0.12, 0.12, [1.13, 1.168, 1.206, 1.244, 1.282, 1.32], outward=(0, 0, -1))
    # cummerbund (both sides), tucked under the plate bags
    for side in (1, -1):
        th0, th1 = (34, 146) if side > 0 else (-146, -34)
        cb = b.wrap_panel(f'cummer{side}', K, th0, th1, 1.08, 1.255, 0.016, 0.011, nu=24, nv=8)
        cpt = lambda th, y, s=side: b.wrap(th, y, 0.028)
        for k, y in enumerate((1.125, 1.163, 1.201)):
            n = 5
            for i in range(n):
                t0 = th0 + 14 + (th1 - th0 - 28) * i / n + 0.8
                t1 = th0 + 14 + (th1 - th0 - 28) * (i + 1) / n - 0.8
                b.surface_strip(f'cmolle{side}_{k}_{i}', W, cpt, t0, t1, y - 0.0125, y + 0.0125, 0.0016, nu=4, nv=1)
    # shoulder straps
    for side in (1, -1):
        x = side * 0.112
        fp = (x * 0.92, 1.43, zi_f(x * 0.92, 1.43) + 0.012)
        bp = (x * 0.95, 1.44, zi_b(x * 0.95, 1.44) - 0.012)
        b.shoulder_strap(f'strap{side}', K, x, fp, bp, width=0.06, thick=0.014, off=0.008)
    # triple mag pouch (front, lower)
    for i, x in enumerate((-0.08, 0.0, 0.08)):
        y = 1.18
        p = fpt(x, y)
        b.mag_pouch(f'magp{i}', K, p, (x * 0.6, 0, 1), seed=i)
    # admin pouch + velcro ID panel on the upper front
    b.pouch('admin', K, fpt(0.0, 1.30), (0, 0.05, 1), 0.17, 0.085, 0.022, flap=False, seed=5, puff=0.003)
    b.surface_strip('idpanel', 'velcro_blk', fpt, -0.06, 0.06, 1.37, 1.41, 0.0025, nu=6, nv=2, outward=(0, 0, 1))
    # radio pouch on the left cummerbund + general pouch on the right
    p = b.wrap(78, 1.17, 0.028); n = b.normal_wrap(78, 1.17, 0.028)
    b.pouch('radio', K, p, n, 0.07, 0.15, 0.04, seed=7)
    g.lathe('antenna', [(0, 0), (0, 4.2), (150, 3.2), (155, 0)], 'rubber', f=(p[2] - OZ) * 1000 - 8, u=(p[1] - OY) * 1000 + 75, s=-p[0] * 1000 * 1.18,
            axis='u', segs=10)
    p = b.wrap(-80, 1.17, 0.028); n = b.normal_wrap(-80, 1.17, 0.028)
    b.pouch('gp', K, p, n, 0.11, 0.12, 0.05, seed=9)
    # back: drag handle (the back stays flat so backpacks sit on it)
    from gkit import sweep, catmull, MM
    pts = [b.L(-0.045, 1.44, zo_b(-0.045, 1.44) - 0.001), b.L(-0.04, 1.47, zo_b(-0.04, 1.44) - 0.012), b.L(0, 1.48, zo_b(0, 1.44) - 0.016),
           b.L(0.04, 1.47, zo_b(0.04, 1.44) - 0.012), b.L(0.045, 1.44, zo_b(0.045, 1.44) - 0.001)]
    prof = [(math.sin(2 * math.pi * k / 10) * 0.004, math.cos(2 * math.pi * k / 10) * 0.016) for k in range(10)]
    g.mesh('handle', sweep(catmull(pts, n=6), prof, up=(0, 0, 1)), W, 'body')
    g.set_origin(0, 0)
