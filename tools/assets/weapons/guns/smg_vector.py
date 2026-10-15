"""KRISS Vector SMG -- traced from Commons 'Kriss_Vector_SMG_Realistic.png' (suppressor/optic/foregrip removed)."""
import os
from wkit import *

META = dict(name='Vector', real_length_m=0.622, cycle_node='charging_handle', mag_kind='box')
REF = os.path.join(os.path.dirname(__file__), '..', 'ref', 'smg_vector.json')
BORE = 240.0
RAIL = 282.6
SIGHT = 324.0


def build(g):
    S = Sil(REF)
    # skeleton stock + butt
    g.side_geom('stock', S.clip((36, 100, 252, 282)), 30, 'poly', bevel=4, bres=2)
    g.side_geom('butt', S.clip((0, 100, 38, 256)), 40, 'rubber', bevel=4)
    # upper receiver + handguard (polymer over alloy)
    g.side_geom('upper', S.clip((248, 252, 616, RAIL + 0.5), minus=[(355, 283, 475, 400)]), 46, 'poly', bevel=3.5, bres=2)
    g.side_geom('hguard', S.clip((520, 212, 616, 254), minus=[(548, 100, 606, 214)]), 46, 'poly', bevel=3.5)
    # lower "KRISS" frame with the big openings
    g.side_geom('frame', S.clip([(246, 120), (470, 120), (560, 214), (560, 254), (246, 254)], minus=[(360, 0, 476, 126)]), 50, 'poly', bevel=4, bres=2)
    g.side('trigger', [(330, 258), (336, 258), (338, 246, 3), (342, 236, 2), (338, 235), (331, 245, 3)], 6, 'park', bevel=1)
    # magazine (Glock-pattern)
    g.side_geom('mag', S.clip([(355, 0), (472, 0), (476, 128), (378, 128)]), 26, 'poly', group='mag', bevel=2.5)
    g.pivot('mag', 420, 128)
    # rail + flip sights
    g.rail('rail_top', 254, 612, RAIL, 'anod')
    rt = RAIL + 9.4
    g.side('rsight_base', [(286, rt), (314, rt), (314, rt + 7, 2), (286, rt + 7, 2)], 22, 'anod', bevel=1.5)
    g.side('rsight', [(293, rt + 6), (309, rt + 6), (307, SIGHT + 10, 4), (295, SIGHT + 10, 4)], 9, 'anod', bevel=1.4)
    g.front('rsight_ring', [(-6.5, -6.5, 3), (6.5, -6.5, 3), (6.5, 6.5, 3), (-6.5, 6.5, 3)], 298, 304, 'anod', bevel=0.8, u=SIGHT,
            holes=[circle(0, 0, 1.7, 10)])
    g.side('fsight_base', [(566, rt), (590, rt), (590, rt + 7, 2), (566, rt + 7, 2)], 22, 'anod', bevel=1.5)
    for sgn in (1, -1):
        g.side(f'fsight_ear{sgn}', [(569, rt + 5), (587, rt + 5), (584, SIGHT + 14, 3), (572, SIGHT + 14, 3)], 3, 'anod', s=9 * sgn, bevel=0.8)
    g.side('fsight_post', [(576.5, rt + 5), (580, rt + 5), (579.5, SIGHT), (577, SIGHT)], 2.6, 'anod', bevel=0.4)
    # barrel stub + thread protector
    g.tube('barrel', 612, 618, 9.0, 'park', u=BORE, bore=4.6)
    g.lathe('thread', [(616, 4.6), (616, 7.4), (624, 7.4), (626, 6.6), (626, 4.6)], 'park', u=BORE, closed=True, segs=20)
    # charging handle (left, front) + slot
    g.box('ch_slot', 520, 600, 268, 277, 2, 'anod!', s=-23.4, r=3, bevel=0.6)
    g.side('ch_handle', [(582, 267), (596, 267), (598, 278, 2), (580, 278, 2)], 8, 'park', group='charging_handle', s=-27, bevel=1.5)
    g.pivot('charging_handle', 589, 272, -27)
    # details: hex screws, selector, mag release, ejection port
    for (f, u) in ((568, 233), (598, 233)):
        for sgn in (1, -1):
            g.lathe(f'nut{f}{sgn}', [(0, 0), (0, 4.2), (2.2 * sgn, 4.2), (2.2 * sgn, 0)], 'steel', f=f, u=u, s=23 * sgn, axis='s', segs=6)
    for (f, u) in ((300, 270), (430, 270), (360, 135), (420, 135), (440, 215)):
        for sgn in (1, -1):
            g.lathe(f'pin{f}{u}{sgn}', [(0, 0), (0, 3.6), (1.6 * sgn, 3.6), (1.6 * sgn, 0)], 'park', f=f, u=u, s=25 * sgn, axis='s', segs=10)
    g.side('selector', [(268, 262), (290, 264, 2), (290, 272, 2), (266, 270, 3)], 3, 'park', s=-24.6, bevel=0.8)
    g.box('eject', 420, 470, 252, 270, 1.6, 'park!', s=23.4, r=2, bevel=0.5)
    # named points
    g.grip = (282, 200)
    g.empty('muzzle', 626, BORE)
    g.empty('grip_support', 575, 232)
    g.empty('sight_eye', 205, SIGHT)
    g.empty('rail_top', 400, RAIL + 9.4)
