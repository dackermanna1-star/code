"""Steyr AUG A3 -- traced from Commons 'Steyr-AUG-A3-SF.webp' (optic and foregrip removed)."""
import os
from wkit import *

META = dict(name='AUG A3', real_length_m=0.79, cycle_node='charging_handle', mag_kind='box')
REF = os.path.join(os.path.dirname(__file__), '..', 'ref', 'ar_aug.json')
BORE = 197.0
RAIL = 274.0
SIGHT = 308.0
MAG_R = [(176, -2), (292, -2), (284, 152), (186, 152)]
GRIP_R = [(316, 38), (392, 38), (394, 150), (326, 150)]


def build(g):
    S = Sil(REF)
    STOCK_R = [(14, 36), (318, 36), (318, 146), (556, 146), (556, 158), (648, 158), (648, 242), (14, 242)]
    g.side_geom('stock', S.clip(STOCK_R, minus=[MAG_R]), 52, 'poly_od', bevel=6, bres=2,
                taper=[(14, 1.0), (330, 1.0), (520, 0.82), (648, 0.62)])
    g.side_geom('butt', S.clip((0, 36, 16, 236)), 54, 'rubber', bevel=5)
    g.side_geom('grip', S.clip(GRIP_R), 32, 'poly_od', bevel=8, bres=3)
    g.side_geom('guard', S.clip((390, 36, 540, 152)), 22, 'poly_od', bevel=5, bres=2)
    g.side('trigger', [(392, 148), (398, 148), (400, 134, 3), (406, 124, 2), (401, 123), (393, 133, 3)], 7, 'park', bevel=1)
    # receiver/rail
    g.side_geom('recv', S.clip((252, 226, 526, RAIL + 0.5)), 34, 'anod', bevel=2.5)
    g.rail('rail_top', 272, 520, RAIL, 'anod')
    # barrel + flash hider + gas/collar
    g.lathe('collar', [(636, 0), (636, 16), (640, 18), (668, 18), (672, 15), (672, 0)], 'park', u=BORE, segs=24)
    g.tube('barrel', 670, 712, 8.0, 'park', u=BORE, bore=3.0)
    g.lathe('flash', [(706, 4.5), (706, 10.8), (710, 12.2), (784, 12.2), (790, 11), (790, 4.5)], 'park', u=BORE, closed=True, segs=24)
    for i in range(6):
        g.box(f'fport{i}', 740 + (i % 3) * 14, 748 + (i % 3) * 14, BORE - 3, BORE + 3, 26, 'park', r=2.5, bevel=0.5,
              M=rot_f(90 * (i // 3), BORE, 0))
    # magazine (translucent-look smoke polymer)
    g.side_geom('mag', S.clip(MAG_R), 26, 'poly', group='mag', bevel=2.5)
    g.pivot('mag', 236, 152)
    # charging handle on the left side
    g.box('ch_slot', 420, 560, 210, 220, 2, 'poly', s=-24.8, r=4, bevel=0.6)
    g.side('ch', [(468, 209), (482, 209), (484, 221, 2), (466, 221, 2)], 10, 'park', group='charging_handle', s=-29, bevel=1.5)
    g.lathe('ch_knob', [(0, 0), (0, 5), (-10, 5), (-13, 3.5), (-13, 0)], 'park', group='charging_handle', f=475, u=215, s=-33, axis='s', segs=12)
    g.pivot('charging_handle', 475, 215, -29)
    # flip-up BUIS on the rail
    rt = RAIL + 9.4
    g.side('rsight_base', [(276, rt), (304, rt), (304, rt + 7, 2), (276, rt + 7, 2)], 22, 'anod', bevel=1.5)
    g.side('rsight', [(283, rt + 6), (299, rt + 6), (297, SIGHT + 9, 4), (285, SIGHT + 9, 4)], 9, 'anod', bevel=1.4)
    g.front('rsight_ring', [(-6.5, -6.5, 3), (6.5, -6.5, 3), (6.5, 6.5, 3), (-6.5, 6.5, 3)], 288, 294, 'anod', bevel=0.8, u=SIGHT,
            holes=[circle(0, 0, 1.7, 10)])
    g.side('fsight_base', [(492, rt), (516, rt), (516, rt + 7, 2), (492, rt + 7, 2)], 22, 'anod', bevel=1.5)
    for sgn in (1, -1):
        g.side(f'fsight_ear{sgn}', [(495, rt + 5), (513, rt + 5), (510, SIGHT + 14, 3), (498, SIGHT + 14, 3)], 3, 'anod', s=9 * sgn, bevel=0.8)
    g.side('fsight_post', [(502.5, rt + 5), (506, rt + 5), (505.5, SIGHT), (503, SIGHT)], 2.6, 'anod', bevel=0.4)
    # cross-bolt safety / bolt release / sling studs
    g.lathe('safety', [(0, 0), (0, 5), (30, 5), (30, 0)], 'park', f=372, u=160, s=-15, axis='s', segs=12)
    g.lathe('stud', [(0, 0), (0, 6), (4, 6), (4, 0)], 'park', f=60, u=200, s=-27, axis='s', segs=12)
    g.grip = (352, 98)
    g.empty('muzzle', 790, BORE)
    g.empty('grip_support', 585, 172)
    g.empty('sight_eye', 150, SIGHT)
    g.empty('rail_top', 395, RAIL + 9.4)
