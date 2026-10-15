"""HK416 ('M416') -- traced from Commons 'HK416N.png' (optic and foregrip removed, flip-up irons added)."""
import os
from wkit import *

META = dict(name='M416', real_length_m=0.9, cycle_node='charging_handle', mag_kind='box')
REF = os.path.join(os.path.dirname(__file__), '..', 'ref', 'ar_m416.json')
BORE = 200.0
RAIL = 229.0
SIGHT = 262.0
GRIP_R = [(212, 42), (282, 42), (300, 120), (296, 172), (240, 172), (222, 120)]
MAG_R = [(356, 122), (436, 122), (456, 30), (440, -4), (386, -2), (360, 60)]


def build(g):
    S = Sil(REF)
    # stock + buffer tube
    g.side_geom('stock', S.clip((0, 96, 152, 232)), 44, 'poly', bevel=8, bres=3, taper=[(0, 0.92), (50, 1.0), (110, 0.85), (152, 0.66)])
    g.lathe('tube', [(140, 0), (140, 14.5), (142, 15.5), (240, 15.5), (242, 14), (242, 0)], 'anod', u=203, segs=22)
    g.side('castle', [(232, 186), (246, 186), (246, 220), (232, 220)], 36, 'anod', bevel=2)
    # lower receiver + magwell
    g.side_geom('lower', S.clip((238, 120, 452, 196), minus=[GRIP_R, MAG_R, (298, 126, 360, 158)], plus=[]), 30, 'anod', bevel=2.4, bres=2)
    g.side_geom('guard', S.clip((296, 124, 362, 160)), 14, 'anod', bevel=1.2, bres=1)
    g.side_geom('grip', S.clip(GRIP_R), 30, 'poly', bevel=8, bres=3, taper=[(220, 0.88), (290, 1.0)])
    g.side('trigger', [(318, 156), (324, 156), (326, 144, 3), (331, 136, 2), (327, 135), (319, 143, 3)], 6, 'park', bevel=1)
    # upper receiver + rail
    g.side('upper', [(246, 194), (440, 194), (440, RAIL), (262, RAIL), (248, 218, 4)], 30, 'anod', bevel=2.4)
    g.rail('rail_top', 250, 438, RAIL, 'anod')
    g.lathe('fwd_assist', [(0, 0), (0, 7.5), (12, 7.5), (14, 6), (14, 0)], 'anod', f=420, u=210, s=15, axis='s', segs=14)
    g.box('eject', 334, 400, 196, 216, 1.6, 'park', s=15.4, r=1.5, bevel=0.5)
    # quad rail handguard (QRS)
    g.side_geom('hguard', S.clip((440, 176, 684, 232)), 52, 'anod', bevel=3, bres=2)
    g.rail('rail_hg_top', 442, 680, RAIL, 'anod')
    g.rail('rail_hg_bot', 446, 676, BORE + 30, 'anod', ang=180, u_c=BORE)
    for sgn in (1, -1):
        g.rail(f'rail_hg_s{sgn}', 560, 676, BORE + 26, 'anod', ang=90 * sgn, u_c=BORE)
    # gas block, barrel, flash hider
    g.side_geom('gasblock', S.clip((684, 186, 752, 226)), 30, 'park', bevel=2.5)
    g.tube('barrel', 748, 852, 8.0, 'park', u=BORE, r1=7.5, bore=3.0)
    g.lathe('flash', [(848, 4.5), (848, 9.5), (852, 10.8), (893, 10.8), (900, 9.6), (900, 4.5)], 'park', u=BORE, closed=True, segs=24)
    for i in range(4):
        g.side(f'fslot{i}', [(866, -1.2), (898, -1.2), (898, 1.2), (866, 1.2)], 2.4, 'park', bevel=0.2,
               M=rot_f(45 + 90 * i, BORE, 0) @ T(0, BORE + 10, 0))
    # magazine (steel STANAG, slight curve)
    g.side_geom('mag', S.clip(MAG_R), 23, 'anod', group='mag', bevel=2.2, bres=2)
    g.pivot('mag', 396, 122)
    # charging handle
    g.side('ch', [(232, 220), (272, 220), (272, 227), (232, 227)], 18, 'anod', group='charging_handle', bevel=1.2)
    g.side('ch_latch', [(228, 219), (238, 219), (238, 228), (228, 228)], 30, 'anod', group='charging_handle', bevel=2)
    g.pivot('charging_handle', 238, 223)
    # flip-up BUIS
    rt = RAIL + 9.4
    g.side('rsight_base', [(254, rt), (282, rt), (282, rt + 7, 2), (254, rt + 7, 2)], 22, 'anod', bevel=1.5)
    g.side('rsight', [(261, rt + 6), (277, rt + 6), (275, SIGHT + 9, 4), (263, SIGHT + 9, 4)], 9, 'anod', bevel=1.4)
    g.front('rsight_ring', [(-6.5, -6.5, 3), (6.5, -6.5, 3), (6.5, 6.5, 3), (-6.5, 6.5, 3)], 266, 272, 'anod', bevel=0.8, u=SIGHT,
            holes=[circle(0, 0, 1.7, 10)])
    g.side('fsight_base', [(652, rt), (676, rt), (676, rt + 7, 2), (652, rt + 7, 2)], 22, 'anod', bevel=1.5)
    for sgn in (1, -1):
        g.side(f'fsight_ear{sgn}', [(655, rt + 5), (673, rt + 5), (670, SIGHT + 14, 3), (658, SIGHT + 14, 3)], 3, 'anod', s=9 * sgn, bevel=0.8)
    g.side('fsight_post', [(662.5, rt + 5), (666, rt + 5), (665.5, SIGHT), (663, SIGHT)], 2.6, 'anod', bevel=0.4)
    # controls
    g.side('selector', [(272, 166), (294, 168, 2), (294, 176, 2), (270, 174, 3)], 3, 'park', s=-16, bevel=0.8)
    g.lathe('magrel', [(0, 0), (0, 5), (3, 5), (3, 0)], 'park', f=356, u=160, s=15, axis='s', segs=12)
    for (f, u) in ((252, 182), (436, 182), (312, 168), (346, 168)):
        g.lathe(f'pin{f}', [(0, 0), (0, 3.2), (1.5, 3.2), (1.5, 0)], 'park', f=f, u=u, s=-15, axis='s', segs=10)
    g.grip = (258, 110)
    g.empty('muzzle', 900, BORE)
    g.empty('grip_support', 560, 172)
    g.empty('sight_eye', 175, SIGHT)
    g.empty('rail_top', 345, RAIL + 9.4)
