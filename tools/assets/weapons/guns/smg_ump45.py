"""HK UMP45 -- traced from Commons 'HKUMP45.JPG' (side view). Grid coords: f from butt, u from lowest point."""
import os
from wkit import *

META = dict(name='UMP45', real_length_m=0.69, cycle_node='charging_handle', mag_kind='box')
REF = os.path.join(os.path.dirname(__file__), '..', 'ref', 'smg_ump45.json')
BORE = 251.0


def build(g):
    S = Sil(REF)
    # --- stock (skeleton, folding) ---
    g.side_geom('stock', S.clip((0, 140, 214, 265)), 26, 'poly', bevel=3.5, bres=2)
    g.side_geom('stock_hinge', S.clip((210, 200, 240, 262)), 36, 'poly', bevel=4)
    g.side('buttpad', [(0, 168), (6, 168), (6, 262), (0, 262)], 28, 'rubber', bevel=2.5)
    # --- upper receiver / handguard ---
    up = S.clip((236, 224, 602, 286.5))
    g.side_geom('upper', up, 48, 'poly', bevel=4.5, bres=3)
    g.side_geom('rsight', S.clip((252, 284, 292, 303)), 30, 'poly', bevel=3)
    g.side_geom('fsight', S.clip((586, 280, 614, 307)), 22, 'poly', bevel=3)
    g.side_geom('nosecap', S.clip((600, 228, 628, 278)), 36, 'poly', bevel=4)
    # --- lower receiver, trigger guard, grip ---
    lower = S.clip((290, 196, 472, 228), minus=[(300, 150, 312, 230)])
    g.side_geom('lower', lower, 40, 'poly', bevel=3.5)
    g.side_geom('guard', S.clip((308, 168, 396, 202)), 12, 'poly', bevel=1.0, bres=1)
    grip = S.clip([(238, 95), (328, 95), (345, 214), (262, 222)], minus=[(308, 160, 400, 200)])
    g.side_geom('grip', grip, 30, 'poly', bevel=9, bres=3, taper=[(250, 0.9), (300, 1.0)])
    g.side('trigger', [(362, 204), (368, 204), (372, 190, 3), (378, 180, 2), (374, 179), (365, 188, 3)], 6, 'park', bevel=1)
    # --- magazine ---
    mag = S.clip([(408, 0), (530, 0), (478, 196), (412, 196)])
    g.side_geom('mag', mag, 24, 'poly', group='mag', bevel=3, bres=2)
    g.side('mag_base', [(452, 0), (500, 0), (502, 9, 2), (450, 9, 2)], 30, 'poly', group='mag', bevel=2)
    g.pivot('mag', 445, 205)
    # --- rails ---
    g.rail('rail_top', 258, 482, 284, 'anod')
    g.rail('rail_bot', 492, 588, BORE + 26, 'anod', ang=180, u_c=BORE)
    # --- barrel & muzzle ---
    g.tube('barrel', 620, 642, 9.5, 'park', u=BORE, bore=4.6)
    g.lathe('flash', [(640, 5.8), (640, 10.5), (643, 11.2), (683, 11.2), (690, 10.4), (690, 6.0), (650, 6.0)], 'park', u=BORE, closed=True, segs=24)
    # flash hider slots
    for i in range(4):
        g.side(f'slot{i}', [(658, -1.2), (688, -1.2), (688, 1.2), (658, 1.2)], 2.6, 'park', bevel=0.2,
               M=rot_f(45 + 90 * i, BORE, 0) @ T(0, BORE + 10.3, 0))
    # --- details ---
    g.box('ch_handle', 572, 590, 258, 268, 8, 'park', group='charging_handle', s=-27, r=2, bevel=1.5)
    g.box('ch_slot', 515, 595, 259, 267, 2, 'park', s=-24.2, r=3, bevel=0.5)
    g.box('eject', 350, 402, 246, 268, 2, 'park', s=24.4, r=2, bevel=0.6)
    g.side('selector', [(298, 216), (322, 220, 2), (322, 226, 2), (296, 224, 3)], 3, 'park', s=-21.2, bevel=0.8)
    g.side('selector_r', [(298, 216), (322, 220, 2), (322, 226, 2), (296, 224, 3)], 3, 'park', s=21.2, bevel=0.8)
    g.lathe('pin1', [(0, 0), (0, 3.5), (2, 3.5), (2, 0)], 'park', f=440, u=248, s=-24, axis='s', segs=12)
    g.lathe('pin2', [(0, 0), (0, 3.5), (2, 3.5), (2, 0)], 'park', f=440, u=248, s=22, axis='s', segs=12)
    g.pivot('charging_handle', 581, 263, -27)
    # --- named points ---
    g.grip = (290, 166)
    g.empty('muzzle', 690, BORE)
    g.empty('grip_support', 545, 236)
    g.empty('sight_eye', 200, 297.5)
    g.empty('rail_top', 370, 293.4)
