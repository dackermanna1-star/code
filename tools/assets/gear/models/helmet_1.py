# Level-1 helmet: open-face (3/4) motorcycle helmet. Gloss painted fibreglass shell over a thick liner, rubber edge
# trim, snap-on visor peak with three snaps, chin strap with double D-rings. Origin = head centre.
import math
from mathutils import Vector
from gkit import sweep, MM, grid_surface, KINDS
from _wear import Shell, solidify, orient_out, chin_strap, periodic_interp

OUT = 'gear'
TEX = 1024
MS = 2.0
META = dict(kind='helmet', level=1, attach_bone='Head', attach_offset_m=[0.0, 0.1, 0.008],
            notes='origin = head centre (rest pose root-space (0, 1.687, 0.008)); +Z = face forward')
KINDS['gloss_steel'] = dict(base='#2d3540', var='#29303a', metal=0.0, rough=0.16, rvar=0.04, wear='#7a7e84', wear_amt=0.35,
                            wear_rough=0.4, pat='none', bump=0.04)
KINDS['chrome'] = dict(base='#c8cacc', var='#bfc1c3', metal=1.0, rough=0.12, rvar=0.04, wear='#d8d8d8', wear_amt=0.0,
                       wear_rough=0.12, pat='none', bump=0.0)
T1 = {0: 30, 25: 26, 40: 14, 50: -16, 58: -46, 70: -63, 90: -66, 120: -60, 150: -53, 180: -50}
RIM = {**T1, **{360 - k: v for k, v in T1.items() if 0 < k < 180}}


def rim(th):
    return periodic_interp(RIM, th)


def build(g):
    sh = Shell(cf=8, cu=6, af=146, as_=134, au=150, al=150, k=0.22, rim=rim)
    print('CLEARANCE', sh.clearance(24.0))
    outer = orient_out(sh.surface(nu=112, nv=32))
    g.mesh('shell', solidify(outer, 4.0), 'gloss_steel', 'body')
    # liner (EPS + fabric comfort liner) just inside the shell, visible at the opening
    liner = orient_out(sh.surface(nu=96, nv=26, off=-4.2))
    g.mesh('liner', solidify(liner, 19.0), 'cordura_blk', 'body')
    # rubber edge trim
    path = sh.rim_path(180, off=-11.0)
    prof = [(math.cos(2 * math.pi * k / 12) * 13.5 * MM, math.sin(2 * math.pi * k / 12) * 4.0 * MM) for k in range(12)]
    ups = [(p - Vector((sh.cf * MM, sh.cu * MM, 0))).normalized() for p in path]
    g.mesh('trim', sweep(path + [path[0]], prof, up=ups + [ups[0]], cap=False), 'rubber_soft', 'body')
    # snap-on visor peak
    def peak(a, b):
        th = -58 + 116 * a
        c = math.cos(math.radians(th * 90 / 58))
        e0 = rim(th) + 9.0
        p0 = Vector(sh.point(th, e0, 1.5))
        n = Vector(sh.point(th, e0, 10.0)) - p0
        n.normalize()
        fwd = Vector((1, -0.75, 0)).normalized()
        out = 52.0 * max(0.0, c) ** 0.7 * b
        p = p0 + (fwd * out) + n * (2.0 * b)
        return (p.x * MM, p.y * MM, p.z * MM)
    pk = orient_out(grid_surface(peak, 40, 6), center=(0, 0.2, 0))
    g.mesh('peak', solidify(pk, 3.0, offset=0.0), 'plastic_blk', 'body')
    for th in (-38, 0, 38):
        p = sh.point(th, rim(th) + 14, 2.0)
        g.lathe(f'snap{th}', [(0, 0), (0, 5.5), (1.5, 5.5), (2.6, 4.0), (3.0, 0)], 'chrome', f=p[0], u=p[1], s=p[2], axis='f', segs=20)
    # chin strap + double D-rings
    a_l, a_r = chin_strap(g, sh, 'webbing_blk', width=20.0, off=8.0, anchor_th=100, anchor_de=10.0)
    from gkit import torus_mesh, rot_s, T
    for k in range(2):
        g.mesh(f'dring{k}', torus_mesh(13.0, 1.6, seg=28, ring=6), 'chrome', 'body', M=T(a_r[0] + 10, a_r[1] - 26 - k * 4, a_r[2] * 0.82))
    g.set_origin(0, 0)
