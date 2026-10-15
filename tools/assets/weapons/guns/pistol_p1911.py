"""Colt M1911 ('P1911') -- traced from Commons 'M1911_and_M1911A1_pistols.JPG' (upper pistol, 216 mm)."""
import os
from wkit import *

META = dict(name='P1911', real_length_m=0.216, cycle_node='slide', mag_kind='box')
REF = os.path.join(os.path.dirname(__file__), '..', 'ref', 'pistol_p1911.json')
BORE = 116.0
SIGHT = 137.0
SLIDE_R = [(20, 104), (158, 104), (162, 93), (218, 93), (218, 150), (20, 150)]
GUARD_R = [(66, 60), (124, 60), (124, 96), (66, 96)]
GRIP_P = [(10, 8), (50, 8), (62, 58), (64, 94), (28, 97), (14, 58)]
SHADOW = [(56, -5), (90, -5), (90, 60), (71, 60)]   # photo shadow on the front strap


def build(g):
    S = Sil(REF, smooth=1, holes=False)
    HOLE = [(80, 97), (79, 80, 8), (88, 70, 8), (106, 70, 8), (113, 80, 6), (113, 97)]
    GOUT = [(68, 100), (68, 72, 10), (80, 58, 10), (112, 58, 10), (121, 72, 8), (122, 100)]
    g.tol = 0.25
    g.side_geom('slide', S.clip(SLIDE_R), 23, 'park', group='slide', bevel=2.2, bres=2)
    for i in range(11):
        g.box(f'serr{i}', 40 + i * 3.3, 41.4 + i * 3.3, 108, 132, 23.8, 'park!', group='slide', bevel=0.3)
    g.side('rsight', [(36, 132), (48, 132), (48, SIGHT + 1), (36, SIGHT + 1)], 12, 'park', group='slide', bevel=0.8)
    g.side('fsight', [(200, 132), (208, 132), (207, SIGHT + 1), (202, SIGHT + 1)], 3, 'park', group='slide', bevel=0.5)
    g.pivot('slide', 110, 118)
    g.lathe('bushing', [(208, 0), (208, 9.4), (216, 9.4), (216, 0)], 'park', u=BORE, segs=20)
    g.tube('barrel', 212, 216.5, 6.6, 'park', u=BORE, bore=5.8, segs=20)
    frame = S.clip((-4, 5, 220, 105), minus=[SLIDE_R, GUARD_R, HOLE, SHADOW, (0, -4, 70, 6)])
    g.side_geom('frame', frame, 22, 'park', bevel=2.2, bres=2)
    g.side_geom('guard', S.clip(GUARD_R, minus=[HOLE]).intersection(__import__('shapely.geometry', fromlist=['Polygon']).Polygon(fillet(GOUT))), 11, 'park', bevel=1.4, bres=1)
    g.side('grips', GRIP_P, 30, 'wood_red', bevel=3, bres=2)
    for sgn in (1, -1):
        g.lathe(f'gscrew{sgn}', [(0, 0), (0, 3.4), (1.2, 3.0), (1.5, 0)], 'park', f=24, u=20, s=15 * sgn, axis='s', segs=10)
        g.lathe(f'gscrew2{sgn}', [(0, 0), (0, 3.4), (1.2, 3.0), (1.5, 0)], 'park', f=46, u=84, s=15 * sgn, axis='s', segs=10)
    g.side('thumb_safety', [(24, 102), (50, 102), (52, 108, 2), (26, 109, 2)], 3, 'park', s=-12, bevel=0.7)
    g.side('slide_stop', [(60, 96), (92, 98), (94, 105, 3), (62, 105, 3)], 3, 'park', s=-12, bevel=0.7)
    g.side('trigger', [(88, 80, 1), (95, 80, 1), (95, 98), (88, 98)], 6, 'park', bevel=1)
    g.lathe('magrel', [(0, 0), (0, 4.5), (2.5, 4.5), (2.5, 0)], 'park', f=68, u=84, s=-12, axis='s', segs=12)
    g.side('mag', [(14, 6), (50, 6), (64, 98), (30, 100)], 18, 'blued', group='mag', bevel=1.2)
    g.side_geom('mag_base', S.clip((0, -4, 60, 7), minus=[SHADOW]), 22, 'blued', group='mag', bevel=1.2)
    g.pivot('mag', 33, 6)
    g.grip = (38, 56)
    g.empty('muzzle', 216.5, BORE)
    g.empty('grip_support', 38, 40, -18)
    g.empty('sight_eye', -260, SIGHT)
    g.empty('rail_top', 70, 134, parent='slide')
