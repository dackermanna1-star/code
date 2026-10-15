"""Beretta 92FS ('P92') -- traced from Commons 'Beretta-92FS.jpg' (217 mm)."""
import os
from wkit import *

META = dict(name='P92', real_length_m=0.217, cycle_node='slide', mag_kind='box')
REF = os.path.join(os.path.dirname(__file__), '..', 'ref', 'pistol_p92.json')
BORE = 128.0
SIGHT = 145.0
SLIDE_R = [(12, 117), (150, 117), (150, 100), (214, 100), (214, 152), (12, 152)]
GUARD_R = [(66, 56), (138, 56), (138, 100), (66, 100)]
GRIP_P = [(4, 9), (52, 9), (62, 58), (62, 94), (22, 97), (10, 60)]


def build(g):
    S = Sil(REF, smooth=1, holes=False)
    HOLE = [(78, 99), (77, 81, 8), (86, 72, 7), (115, 72, 7), (121, 81, 5), (122, 99)]
    GOUT = [(66, 100), (66, 78, 10), (78, 66, 9), (122, 66, 8), (130, 78, 6), (131, 100)]
    g.tol = 0.25
    g.side_geom('slide', S.clip(SLIDE_R), 26, 'blued', group='slide', bevel=2.2, bres=2)
    for i in range(10):
        g.box(f'serr{i}', 52 + i * 4.0, 53.8 + i * 4.0, 120, 135, 26.8, 'blued!', group='slide', bevel=0.4)
    g.box('barrel_top', 92, 150, 139, 143, 14, 'bright', group='slide', bevel=0.8)
    g.side('decocker', [(30, 124), (48, 124, 2), (48, 134, 3), (30, 132, 3)], 3, 'blued', group='slide', s=-14, bevel=0.8)
    g.side('rsight', [(30, 140), (44, 140), (44, SIGHT + 1), (30, SIGHT + 1)], 16, 'blued', group='slide', bevel=0.8)
    g.side('fsight', [(196, 140), (204, 140), (203, SIGHT + 1), (198, SIGHT + 1)], 3.5, 'blued', group='slide', bevel=0.5)
    g.pivot('slide', 110, 128)
    g.tube('barrel', 206, 217, 7.4, 'blued', u=BORE, bore=4.6, segs=20)
    frame = S.clip((-4, -1, 216, 118), minus=[SLIDE_R, GUARD_R, HOLE, (0, -4, 70, 7)])
    g.side_geom('frame', frame, 24, 'blued', bevel=2.4, bres=2, taper=[(60, 1.0), (80, 0.9)])
    g.side('guard', GOUT, 11, 'blued', bevel=1.5, bres=1, holes=[HOLE])
    g.side('grips', GRIP_P, 33, 'poly', bevel=3.5, bres=2)
    for sgn in (1, -1):
        g.lathe(f'gscrew{sgn}', [(0, 0), (0, 3.5), (1.2, 3.2), (1.6, 0)], 'bright', f=26, u=22, s=16 * sgn, axis='s', segs=10)
        g.lathe(f'gscrew2{sgn}', [(0, 0), (0, 3.5), (1.2, 3.2), (1.6, 0)], 'bright', f=44, u=86, s=16 * sgn, axis='s', segs=10)
    g.side('trigger', [(92, 99), (98, 99), (101, 84, 3), (104, 72, 2), (100, 71), (93, 84, 3)], 6, 'blued', bevel=1)
    g.side('takedown', [(78, 104), (96, 104, 2), (96, 110, 2), (78, 110, 2)], 2, 'bright', s=-12.5, bevel=0.5)
    g.lathe('magrel', [(0, 0), (0, 5), (3, 5), (3, 0)], 'blued', f=66, u=86, s=-12, axis='s', segs=12)
    g.side_geom('mag_base', S.clip((0, -4, 70, 7)), 26, 'poly', group='mag', bevel=1.5)
    g.side('mag', [(10, 6), (50, 6), (62, 98), (26, 100)], 18, 'park', group='mag', bevel=1.2)
    g.pivot('mag', 34, 6)
    g.grip = (36, 58)
    g.empty('muzzle', 217, BORE)
    g.empty('grip_support', 36, 40, -18)
    g.empty('sight_eye', -260, SIGHT)
    g.empty('rail_top', 70, 143, parent='slide')
