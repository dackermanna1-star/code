# Level-2 police tactical vest (black): padded soft-armour carrier wrapping the torso, side cummerbunds, padded
# shoulder straps, MOLLE, three mag pouches, radio pouch, POLICE placard front and back, drag handle.
# Origin = chest centre, root-space (0, 1.30, 0.0) in the rest pose (= Spine2 + (0, -0.021, +0.020)).
import math
from _vest import Body
from gkit import sweep, catmull

OUT = 'gear'
TEX = 1024
MS = 2.5
DECIMATE = 0.5
DECIMATE_MIN = 300
OY, OZ = 1.30, 0.0
META = dict(kind='vest', level=2, attach_bone='Spine2', attach_offset_m=[0.0, -0.021, 0.020], origin_root_space_m=[0.0, OY, OZ])
K = 'cordura_blk'
W = 'webbing_blk'


def ytop_front(th):
    a = abs(th)
    if a < 22: return 1.40 + (a / 22) ** 2 * 0.04
    if a < 42: return 1.44 + 0.006 * math.sin((a - 22) / 20 * math.pi)
    return 1.44 - 0.15 * ((a - 42) / 22) ** 1.3


def ytop_back(th):
    a = abs(180 - (th % 360))
    if a < 42: return 1.455
    return 1.455 - 0.16 * ((a - 42) / 22) ** 1.3


def build(g):
    b = Body(g, OY, OZ)
    OFF, TH = 0.010, 0.018
    b.wrap_panel('front', K, -64, 64, 1.07, ytop_front, OFF, TH, nu=48, nv=22)
    b.wrap_panel('back', K, 116, 244, 1.07, ytop_back, OFF, TH, nu=48, nv=22)
    o2 = OFF + TH
    for side in (1, -1):
        th0, th1 = (50, 130) if side > 0 else (-130, -50)
        b.wrap_panel(f'side{side}', K, th0, th1, 1.085, 1.245, o2 - 0.002, 0.009, nu=20, nv=6)
        b.surface_strip(f'velcro{side}', 'velcro_blk', lambda th, y: b.wrap(th, y, o2 + 0.007), th0 + (0 if side > 0 else 66), th0 + (14 if side > 0 else 80),
                        1.10, 1.23, 0.003, nu=4, nv=4)
    fpt = lambda th, y: b.wrap(th, y, o2 + 0.0005)
    bpt = lambda th, y: b.wrap(th, y, o2 + 0.0005)
    b.molle_rows('molle_f', W, fpt, -46, 46, [1.115, 1.153, 1.191], outward=None, pitch=13.0, h=0.025)
    b.molle_rows('molle_b', W, bpt, 140, 220, [1.12, 1.158, 1.196, 1.234], outward=None, pitch=13.0, h=0.025)
    # pouches: three mags across the lower front, radio on the left chest, admin on the right chest
    for i, th in enumerate((-30, 0, 30)):
        p = b.wrap(th, 1.165, o2 + 0.001); n = b.normal_wrap(th, 1.165, o2)
        b.mag_pouch(f'magp{i}', K, p, n, seed=i + 1)
    p = b.wrap(26, 1.33, o2); n = b.normal_wrap(26, 1.33, o2)
    b.pouch('radio', K, p, n, 0.065, 0.13, 0.035, seed=4)
    g.lathe('antenna', [(0, 0), (0, 4.0), (130, 3.0), (134, 0)], 'rubber', f=(p[2] - OZ) * 1000 + 14, u=(p[1] - OY) * 1000 + 66,
            s=-p[0] * 1000 - 12, axis='u', segs=10)
    p = b.wrap(-27, 1.33, o2); n = b.normal_wrap(-27, 1.33, o2)
    b.pouch('admin', K, p, n, 0.085, 0.10, 0.03, seed=6)
    # POLICE placards
    front_patch = g.decal_kind('cordura_blk', 'pol', g.work + '/labels/police_blk.png', rough=0.75)
    pf = b.surface_strip('placard_f', front_patch, lambda th, y: b.wrap(th, y, o2 + 0.0008), -21, 21, 1.235, 1.285, 0.003, nu=12, nv=2)
    g.decal_uv(pf, 'su', (-66, -65, 66, -15), facing=(1, 0, 0), min_dot=0.2)
    pb = b.surface_strip('placard_b', front_patch, lambda th, y: b.wrap(th, y, o2 + 0.0008), 154, 206, 1.30, 1.37, 0.003, nu=12, nv=2)
    g.decal_uv(pb, 'su-', (-75, 0, 75, 70), facing=(-1, 0, 0), min_dot=0.2)
    # shoulder straps
    for side in (1, -1):
        th_f = side * 32; th_b = 180 - side * 32
        fp = b.wrap(th_f, 1.43, OFF + TH * 0.5); bp = b.wrap(th_b, 1.44, OFF + TH * 0.5)
        x = side * 0.118
        b.shoulder_strap(f'strap{side}', K, x, fp, bp, width=0.06, thick=0.013, off=0.008)
    # drag handle
    pts = [b.L(*b.wrap(171, 1.41, o2)), b.L(*b.wrap(172, 1.44, o2 + 0.012)), b.L(*b.wrap(180, 1.45, o2 + 0.016)),
           b.L(*b.wrap(188, 1.44, o2 + 0.012)), b.L(*b.wrap(189, 1.41, o2))]
    prof = [(math.sin(2 * math.pi * k / 10) * 0.004, math.cos(2 * math.pi * k / 10) * 0.016) for k in range(10)]
    g.mesh('handle', sweep(catmull(pts, n=6), prof, up=(0, 0, 1)), W, 'body')
    g.set_origin(0, 0)
