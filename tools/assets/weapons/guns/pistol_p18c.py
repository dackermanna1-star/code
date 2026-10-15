"""Glock 18C ('P18C') -- traced from Commons 'Glock_17_(6825676904)_без_фона.jpg' + 18C compensator cuts and selector."""
import os
from wkit import *

META = dict(name='P18C', real_length_m=0.202, cycle_node='slide', mag_kind='box')
REF = os.path.join(os.path.dirname(__file__), '..', 'ref', 'pistol_p18c.json')
BORE = 121.0
SIGHT = 141.0


def build(g):
    S = Sil(REF)
    g.side_geom('slide', S.clip((12, 107.5, 206, 140)), 25.5, 'blued', group='slide', bevel=2.4, bres=2)
    for i in range(6):
        g.box(f'serr{i}', 22 + i * 6.2, 24.6 + i * 6.2, 110, 133, 26.2, 'blued', group='slide', bevel=0.3)
    for i in range(2):
        g.box(f'comp{i}', 166 + i * 14, 176 + i * 14, 134.5, 135.7, 8, 'rubber', group='slide', bevel=0.2)
    g.side('selector', [(18, 112), (30, 112, 1), (30, 122, 2), (18, 122, 2)], 2.5, 'poly', group='slide', s=-13.2, bevel=0.6)
    g.side('rsight', [(22, 134), (34, 134), (34, SIGHT + 1), (22, SIGHT + 1)], 20, 'blued', group='slide', bevel=1, )
    g.side('fsight', [(186, 134), (192, 134), (191.5, SIGHT + 1), (186.5, SIGHT + 1)], 3.6, 'blued', group='slide', bevel=0.5)
    g.pivot('slide', 110, 122)
    g.tube('barrel', 198, 204, 5.8, 'blued', u=BORE, bore=4.6, segs=18)
    frame = S.clip((-2, 9, 206, 108))
    g.side_geom('frame', frame, 29, 'poly', bevel=3, bres=2, taper=[(60, 1.0), (85, 0.76)])
    g.side('trigger', [(88, 92), (96, 92), (98, 78, 3), (100, 68, 2), (96, 67), (89, 76, 3)], 6, 'poly', bevel=1)
    g.side('slide_lock', [(96, 100), (106, 100), (106, 104), (96, 104)], 24, 'blued', bevel=0.6)
    g.side('slide_stop', [(56, 104), (74, 104, 1.5), (74, 108, 1.5), (56, 108)], 2.4, 'blued', s=-14.4, bevel=0.5)
    g.side_geom('mag_base', S.clip((8, -2, 62, 9.5)), 26, 'poly', group='mag', bevel=1.8)
    g.side('mag', [(18, 9), (54, 9), (70, 100), (36, 102)], 18, 'blued', group='mag', bevel=1.2)
    g.pivot('mag', 36, 9)
    g.grip = (40, 58)
    g.empty('muzzle', 204, BORE)
    g.empty('grip_support', 38, 40, -18)
    g.empty('sight_eye', -260, SIGHT)
