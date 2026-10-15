"""Colt M1911A1 ('P1911') -- outline read from Commons 'M1911_and_M1911A1_pistols.JPG' grid (216 mm), clean polygons."""
from wkit import *

META = dict(name='P1911', real_length_m=0.216, cycle_node='slide', mag_kind='box')
BORE = 117.0
SIGHT = 139.0


def build(g):
    slide = [(20, 104), (150, 104), (158, 93, 3), (212, 93, 2), (213, 133, 3), (32, 135, 3), (22, 130, 2)]
    g.side('slide', slide, 23, 'park', group='slide', bevel=2.2, bres=2)
    for i in range(10):
        g.box(f'serr{i}', 32 + i * 3.6, 33.6 + i * 3.6, 108, 132, 23.8, 'park', group='slide', bevel=0.3)
    g.side('rsight', [(26, 134), (38, 134), (38, SIGHT + 1), (26, SIGHT + 1)], 12, 'park', group='slide', bevel=0.8)
    g.side('fsight', [(196, 134), (204, 134), (203, SIGHT + 1), (198, SIGHT + 1)], 3, 'park', group='slide', bevel=0.5)
    g.pivot('slide', 110, 118)
    g.lathe('bushing', [(204, 0), (204, 9), (214, 9), (214, 0)], 'park', u=BORE, segs=20)
    g.tube('barrel', 210, 216, 6.6, 'park', u=BORE, bore=5.8, segs=20)
    g.lathe('recoil_plug', [(206, 0), (206, 5), (214, 5), (214, 0)], 'park', u=100, segs=14)
    frame = [(8, 3), (56, 3), (58, 40), (64, 88), (70, 104), (20, 106), (2, 103, 3), (6, 95), (12, 70, 6), (10, 20, 6)]
    g.side('frame', frame, 22, 'park', bevel=2.2, bres=2)
    g.side('dust', [(68, 94), (160, 94), (160, 105), (68, 105)], 22, 'park', bevel=2)
    g.side('guard', [(64, 100), (68, 74, 10), (80, 64, 8), (108, 64, 8), (116, 76, 6), (118, 100)], 12, 'park', bevel=1.5,
           holes=[[(76, 99), (76, 78, 8), (87, 70, 6), (104, 70, 6), (110, 80, 5), (110, 99)]])
    g.side('grips', [(14, 12), (52, 12), (56, 48), (60, 88), (20, 94, 4), (14, 60, 6)], 30, 'wood_red', bevel=3, bres=2)
    for sgn in (1, -1):
        g.lathe(f'gscrew{sgn}', [(0, 0), (0, 3.4), (1.2, 3.0), (1.5, 0)], 'park', f=30, u=22, s=15 * sgn, axis='s', segs=10)
        g.lathe(f'gscrew2{sgn}', [(0, 0), (0, 3.4), (1.2, 3.0), (1.5, 0)], 'park', f=44, u=82, s=15 * sgn, axis='s', segs=10)
    g.side('hammer', [(4, 100), (16, 100), (18, 126, 2), (8, 134, 3), (0, 130)], 8, 'park', bevel=1.2)
    g.side('grip_safety', [(0, 70), (8, 70), (12, 104), (0, 108, 3)], 16, 'park', bevel=1.5)
    g.side('thumb_safety', [(22, 104), (48, 104), (50, 110, 2), (24, 111, 2)], 3, 'park', s=-12, bevel=0.7)
    g.side('slide_stop', [(60, 98), (88, 98), (90, 106, 3), (62, 106, 3)], 3, 'park', s=-12, bevel=0.7)
    g.side('trigger', [(86, 82), (106, 82), (106, 98), (86, 98)], 6, 'park', bevel=1)
    g.lathe('magrel', [(0, 0), (0, 4.5), (2.5, 4.5), (2.5, 0)], 'park', f=66, u=84, s=-12, axis='s', segs=12)
    g.side('mag', [(14, 6), (50, 6), (60, 100), (24, 102)], 18, 'blued', group='mag', bevel=1.2)
    g.side('mag_base', [(10, 0, 2), (56, 0, 2), (56, 6), (10, 6)], 22, 'blued', group='mag', bevel=1.5)
    g.pivot('mag', 33, 6)
    g.grip = (34, 56)
    g.empty('muzzle', 216, BORE)
    g.empty('grip_support', 34, 40, -18)
    g.empty('sight_eye', -260, SIGHT)
