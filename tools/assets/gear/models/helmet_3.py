# Level-3 heavy assault helmet (Spetsnaz Altyn/K6-3 style): deep titanium dome in textured olive paint, ear arches
# with padded ear protectors, visor hinge bosses, rubber edge trim, leather chin strap. Origin = head centre.
import math
from mathutils import Vector
from gkit import sweep, MM, KINDS
from _wear import Shell, solidify, orient_out, chin_strap, periodic_interp

OUT = 'gear'
TEX = 1024
MS = 2.0
META = dict(kind='helmet', level=3, attach_bone='Head', attach_offset_m=[0.0, 0.1, 0.008],
            notes='origin = head centre (rest pose root-space (0, 1.687, 0.008)); +Z = face forward')
T3 = {0: 7, 30: 3, 55: -20, 70: -38, 82: -30, 92: -12, 106: -12, 117: -30, 130: -46, 155: -50, 180: -47}
RIM = {**T3, **{360 - k: v for k, v in T3.items() if 0 < k < 180}}


def rim(th):
    return periodic_interp(RIM, th)


def build(g):
    sh = Shell(cf=8, cu=4, af=138, as_=126, au=152, al=130, k=0.08, rim=rim)
    print('CLEARANCE', sh.clearance(12.0))
    outer = orient_out(sh.surface(nu=120, nv=30))
    g.mesh('shell', solidify(outer, 9.0), 'paint_od2', 'body')
    liner = orient_out(sh.surface(nu=72, nv=20, off=-9.5))
    g.mesh('liner', solidify(liner, 3.0), 'cordura_blk', 'body')
    path = sh.rim_path(200, off=-4.0)
    prof = [(math.cos(2 * math.pi * k / 10) * 7.5 * MM, math.sin(2 * math.pi * k / 10) * 4.2 * MM) for k in range(10)]
    ups = [(p - Vector((sh.cf * MM, sh.cu * MM, 0))).normalized() for p in path]
    g.mesh('trim', sweep(path + [path[0]], prof, up=ups + [ups[0]], cap=False), 'rubber_soft', 'body')
    for side in (-1, 1):
        th = 76 * side
        # visor hinge boss + bolt (on the temple, just in front of the ear arch)
        p = Vector(sh.point(th, -4, 0.0))
        sgn = -1 if side > 0 else 1        # left (th > 0) is -s
        prof_b = [(sgn * x, r) for (x, r) in [(-3, 0), (-3, 17), (4, 16.5), (8, 14), (8.5, 0)]]
        g.lathe(f'boss{side}', prof_b, 'paint_od2', f=p.x, u=p.y, s=p.z, axis='s', segs=32)
        prof_c = [(sgn * x, r) for (x, r) in [(8, 0), (8, 9.5), (13, 9.5), (14, 8), (14.5, 0)]]
        g.lathe(f'bolt{side}', prof_c, 'park', f=p.x, u=p.y, s=p.z, axis='s', segs=6)
        q = Vector(sh.point(th + side * 10, 18, 0.0))
        g.lathe(f'stop{side}', [(sgn * x, r) for (x, r) in [(-2, 0), (-2, 4.5), (5, 4.5), (5.5, 0)]], 'park', f=q.x, u=q.y, s=q.z, axis='s', segs=12)
        # padded ear protector over the ear arch
        th_e = 99 * side
        c = Vector(sh.point(th_e, -22, -2.0))
        prof_e = [(sgn * x, r) for (x, r) in [(-6, 0), (-6, 34), (0, 38), (8, 36), (13, 28), (15, 0)]]
        ob = g.lathe(f'ear{side}', prof_e, 'cordura_od', f=c.x, u=c.y, s=c.z, axis='s', segs=32)
        # squash vertically into an oval
        for v in ob.data.vertices:
            z0 = c.y * MM
            v.co.z = z0 + (v.co.z - z0) * 1.25
            v.co.y = -c.x * MM + (v.co.y + c.x * MM) * 0.85
    chin_strap(g, sh, 'leather_brn', width=22.0, off=8.0, anchor_th=100, anchor_de=8.0)
    g.set_origin(0, 0)
