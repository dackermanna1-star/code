"""FN M249 SAW -- traced from Commons 'M249_Automatic_Rifle.jpg' (levelled). Bipod shown folded; 'mag' = 200-rd ammo box."""
import os
from wkit import *

META = dict(name='M249', real_length_m=1.041, cycle_node='charging_handle', mag_kind='box')
REF = os.path.join(os.path.dirname(__file__), '..', 'ref', 'lmg_m249.json')
BORE = 297.0
RAIL = 318.0
SIGHT = 342.0
GRIP_R = [(300, 90), (386, 90), (400, 208), (328, 208)]


def build(g):
    S = Sil(REF, smooth=1)
    g.tol = 0.8
    g.side_geom('stock', S.clip((0, 140, 262, 282)), 46, 'poly', bevel=7, bres=2, taper=[(0, 1.0), (150, 0.84), (262, 0.7)])
    g.side('buttplate', [(-4, 146, 4), (10, 146), (10, 276), (-4, 276, 4)], 48, 'rubber', bevel=3)
    recv = S.clip((255, 196, 782, RAIL + 0.5), minus=[GRIP_R, (370, 160, 452, 204)])
    g.side_geom('recv', recv, 52, 'park', bevel=3, bres=2)
    g.side('feedcover', [(500, 300), (700, 300), (700, RAIL), (520, RAIL + 4, 6), (500, 312)], 56, 'park_light', bevel=4, bres=2)
    g.rail('rail_top', 520, 700, RAIL + 4, 'park')
    g.side_geom('grip', S.clip(GRIP_R), 31, 'poly', bevel=8, bres=3)
    g.side_geom('guard', S.clip((370, 160, 452, 206)), 12, 'park', bevel=1.4, bres=1)
    g.side('trigger', [(392, 206), (398, 206), (400, 192, 3), (405, 182, 2), (401, 181), (393, 191, 3)], 6, 'park', bevel=1)
    # lower handguard
    g.side('hguard', [(560, 200, 6), (700, 200, 6), (706, 214), (706, 262), (560, 262)], 60, 'poly', bevel=6, bres=2)
    # gas block / regulator, gas cylinder, barrel, heat shield, flash hider, carry handle
    g.side_geom('gasblock', S.clip((780, 238, 880, 300)), 34, 'park', bevel=3)
    g.tube('gascyl', 700, 800, 11, 'park', u=262, segs=18)
    g.tube('barrel', 780, 1004, 10.5, 'park', u=BORE, r1=9.5, bore=3.0)
    g.side('heatshield', [(800, BORE + 9), (960, BORE + 9), (960, BORE + 15, 3), (800, BORE + 15, 3)], 22, 'park', bevel=1.5)
    g.lathe('flash', [(998, 4.5), (998, 11), (1002, 12.4), (1036, 12.4), (1041, 11.2), (1041, 4.5)], 'park', u=BORE, closed=True, segs=24)
    for i in range(5):
        g.side(f'fslot{i}', [(1012, -1.3), (1040, -1.3), (1040, 1.3), (1012, 1.3)], 2.6, 'park', bevel=0.2,
               M=rot_f(36 + 72 * i, BORE, 0) @ T(0, BORE + 11.6, 0))
    g.side('handle_arm', [(818, BORE + 8), (830, BORE + 8), (830, 352), (818, 352)], 8, 'park', s=-16, bevel=2)
    g.tube('handle_grip', 760, 830, 7, 'poly', u=350, s=-16, segs=14)
    # sights
    g.side('fsight', [(832, BORE + 10), (848, BORE + 10), (846, SIGHT, 2), (836, SIGHT, 2)], 4, 'park', bevel=0.8)
    g.side('rsight', [(368, RAIL), (404, RAIL), (404, SIGHT + 4, 3), (368, SIGHT + 4, 3)], 26, 'park', bevel=1.5,
           holes=[[(382, SIGHT - 3), (390, SIGHT - 3), (390, SIGHT + 1), (382, SIGHT + 1)]])
    # folded bipod
    for sgn in (1, -1):
        g.tube(f'bipod{sgn}', 640, 870, 4.5, 'park', u=252, s=13 * sgn, segs=10)
        g.lathe(f'bipod_foot{sgn}', [(640, 0), (640, 7), (652, 7), (652, 0)], 'rubber', u=252, s=13 * sgn, segs=10)
    g.side('bipod_yoke', [(860, 244), (880, 244), (880, 262), (860, 262)], 34, 'park', bevel=2)
    # charging handle (right) and 200-rd ammo box (left, under feed)
    g.box('ch_slot', 560, 760, 262, 272, 2, 'park', s=26.6, r=4, bevel=0.5)
    g.side('ch', [(736, 260), (752, 260), (752, 274), (736, 274)], 8, 'park', group='charging_handle', s=30, bevel=1.5)
    g.lathe('ch_knob', [(0, 0), (0, 6), (14, 6), (18, 4.5), (18, 0)], 'park', group='charging_handle', f=744, u=267, s=32, axis='s', segs=12)
    g.pivot('charging_handle', 744, 267, 30)
    g.side('mag', [(470, 100, 4), (610, 100, 4), (610, 214), (470, 214)], 66, 'poly_od', group='mag', s=-20, bevel=4, bres=2)
    g.side('mag_lid', [(466, 206), (614, 206), (614, 216), (466, 216)], 70, 'poly_od', group='mag', s=-20, bevel=2)
    g.side('mag_belt', [(520, 214), (560, 214), (560, 240), (520, 240)], 14, 'brass', group='mag', s=-24, bevel=1.5)
    g.pivot('mag', 540, 214)
    g.grip = (352, 150)
    g.empty('muzzle', 1041, BORE)
    g.empty('grip_support', 640, 222)
    g.empty('sight_eye', 200, SIGHT)
    g.empty('rail_top', 610, RAIL + 13.4)
