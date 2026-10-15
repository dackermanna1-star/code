# Level-1 police vest (soft concealable armour in a navy carrier): front/back panels, elastic side straps with velcro
# tabs, elastic shoulder straps, POLICE patches. Origin = chest centre, root-space (0, 1.30, 0.0).
import math
from _vest import Body

OUT = 'gear'
TEX = 1024
MS = 2.5
OY, OZ = 1.30, 0.0
META = dict(kind='vest', level=1, attach_bone='Spine2', attach_offset_m=[0.0, -0.021, 0.020], origin_root_space_m=[0.0, OY, OZ])
K = 'cordura_navy'


def ytop_front(th):
    a = abs(th)
    if a < 16: return 1.395 + (a / 16) ** 2 * 0.04
    if a < 32: return 1.435
    return 1.435 - 0.165 * ((a - 32) / 36) ** 1.5


def ytop_back(th):
    a = abs(180 - (th % 360))
    if a < 34: return 1.45
    return 1.45 - 0.17 * ((a - 34) / 34) ** 1.5


def build(g):
    b = Body(g, OY, OZ)
    OFF, TH = 0.008, 0.013
    b.wrap_panel('front', K, -68, 68, 1.05, ytop_front, OFF, TH, nu=48, nv=22)
    b.wrap_panel('back', K, 112, 248, 1.05, ytop_back, OFF, TH, nu=48, nv=22)
    o2 = OFF + TH
    # elastic side straps (two per side) with velcro tabs on the front panel
    for side in (1, -1):
        for k, y in enumerate((1.10, 1.185)):
            th0, th1 = (52, 120) if side > 0 else (-120, -52)
            b.surface_strip(f'elastic{side}{k}', 'elastic_blk', lambda th, yy: b.wrap(th, yy, o2 - 0.004 + 0.002), th0, th1, y - 0.028, y + 0.028, 0.0035, nu=16, nv=2)
            t0, t1 = (50, 60) if side > 0 else (-60, -50)
            b.surface_strip(f'tab{side}{k}', 'velcro_blk', lambda th, yy: b.wrap(th, yy, o2 + 0.0012), t0, t1, y - 0.03, y + 0.03, 0.003, nu=3, nv=2)
    # shoulder straps
    for side in (1, -1):
        fp = b.wrap(side * 24, 1.425, OFF + TH * 0.5); bp = b.wrap(180 - side * 24, 1.44, OFF + TH * 0.5)
        x = (fp[0] + bp[0]) / 2
        b.shoulder_strap(f'strap{side}', 'elastic_blk', x, fp, bp, width=0.05, thick=0.006, off=0.006)
    # POLICE patches
    patch = g.decal_kind('cordura_navy', 'pol', g.work + '/labels/police_navy.png', rough=0.8)
    pf = b.surface_strip('patch_f', patch, lambda th, y: b.wrap(th, y, o2 + 0.0006), -19, 19, 1.315, 1.355, 0.002, nu=10, nv=2)
    g.decal_uv(pf, 'su', (-58, 15, 58, 55), facing=(1, 0, 0), min_dot=0.2)
    pb = b.surface_strip('patch_b', patch, lambda th, y: b.wrap(th, y, o2 + 0.0006), 152, 208, 1.30, 1.37, 0.002, nu=12, nv=2)
    g.decal_uv(pb, 'su-', (-75, 0, 75, 70), facing=(-1, 0, 0), min_dot=0.2)
    g.set_origin(0, 0)
