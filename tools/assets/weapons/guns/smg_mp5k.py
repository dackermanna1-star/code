"""HK MP5K (PDW-style folding stock, extended) -- traced from Commons 'Hkmp5k.jpg'; stock authored."""
import os
from wkit import *

META = dict(name='MP5K', real_length_m=0.603, cycle_node='charging_handle', mag_kind='box')
REF = os.path.join(os.path.dirname(__file__), '..', 'ref', 'smg_mp5k.json')
BORE = 160.0
SIGHT = 200.0
GRIP_R = [(-8, -2), (62, -2), (114, 94), (40, 104), (12, 112)]
MAG_R = [(158, -4), (242, -4), (240, 102), (164, 102)]


def build(g):
    S = Sil(REF)
    g.side_geom('recv', S.clip((14, 134, 242, 189)), 34, 'park', bevel=7, bres=3)
    g.side_geom('rcap', S.clip((6, 136, 18, 168)), 30, 'park', bevel=3)
    g.side_geom('rsight', S.clip((30, 182, 76, 212)), 28, 'park', bevel=3)
    g.side_geom('front', S.clip((238, 140, 302, 194)), 30, 'park', bevel=5, bres=2)
    g.side_geom('fsight', S.clip((298, 142, 326, 214)), 26, 'park', bevel=2.5)
    g.side_geom('lower', S.clip((14, 92, 222, 137), minus=[GRIP_R, MAG_R, (78, 50, 160, 95)]), 34, 'poly', bevel=3.5)
    g.side_geom('grip', S.clip(GRIP_R), 30, 'poly', bevel=8, bres=3)
    g.side_geom('guard', S.clip((76, 50, 160, 95)), 13, 'poly', bevel=2, bres=1)
    g.side('trigger', [(108, 94), (114, 94), (116, 82, 3), (121, 72, 2), (117, 71), (109, 81, 3)], 6, 'park', bevel=1)
    g.side_geom('hguard', S.clip((218, 104, 328, 141), minus=[(244, 30, 292, 116)]), 40, 'poly', bevel=4, bres=2)
    g.side_geom('foregrip', S.clip((244, 44, 292, 120)), 34, 'poly', bevel=8, bres=3)
    # magazine (curved steel)
    g.side_geom('mag', S.clip(MAG_R), 22, 'park', group='mag', bevel=2)
    g.pivot('mag', 200, 102)
    g.tube('barrel', 318, 328, 7.5, 'park', u=BORE, bore=4.5)
    # cocking lever (left, front) + slot
    g.box('ch_slot', 200, 300, 172, 180, 2, 'park', s=-17.2, r=3, bevel=0.5)
    g.side('ch', [(272, 172), (284, 172), (284, 181), (272, 181)], 10, 'park', group='charging_handle', s=-21, bevel=1.2)
    g.lathe('ch_knob', [(0, 0), (0, 4.5), (-12, 4.5), (-15, 3.5), (-15, 0)], 'park', group='charging_handle', f=278, u=176.5, s=-25, axis='s', segs=12)
    g.pivot('charging_handle', 278, 176.5, -21)
    # PDW-style folding stock (extended)
    g.side('stock_hinge', [(-4, 132), (14, 132), (14, 172), (-4, 172)], 36, 'poly', bevel=3)
    g.side('stock_top', [(-250, 152, 4), (-2, 152), (-2, 168), (-250, 168, 4)], 26, 'poly', bevel=4)
    g.side('stock_low', [(-245, 84), (-225, 84), (-6, 134), (-6, 148), (-26, 148), (-245, 104)], 22, 'poly', bevel=4)
    g.side('buttplate', [(-262, 70, 8), (-244, 70, 4), (-244, 176, 4), (-262, 176, 8)], 40, 'poly', bevel=5, bres=2)
    g.side('buttpad', [(-268, 72, 8), (-260, 72), (-260, 174), (-268, 174, 8)], 42, 'rubber', bevel=3)
    # selector + pins
    g.side('selector', [(70, 118), (92, 120, 2), (92, 128, 2), (68, 126, 3)], 3, 'park', s=-18.2, bevel=0.8)
    for (f, u) in ((30, 140), (190, 140)):
        g.lathe(f'pin{f}', [(0, 0), (0, 3.2), (1.5, 3.2), (1.5, 0)], 'park', f=f, u=u, s=-17, axis='s', segs=10)
    g.empty('rail_top', 130, 189)
    g.grip = (55, 60)
    g.empty('muzzle', 328, BORE)
    g.empty('grip_support', 267, 85)
    g.empty('sight_eye', -60, SIGHT)
