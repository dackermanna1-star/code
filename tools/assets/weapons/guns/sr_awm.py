"""Accuracy International AWM -- traced from Commons 'G22_Bundeswehr_Technik_02_(RaBoe)_noBG.png' (scope, bipod, suppressor removed; muzzle brake added).
Trace units are rescaled x1.163 so that butt->muzzle brake = 1230 mm (AWM .338)."""
import os
from wkit import *

META = dict(name='AWM', real_length_m=1.23, cycle_node='bolt', mag_kind='box')
REF = os.path.join(os.path.dirname(__file__), '..', 'ref', 'sr_awm.json')
BORE = 196.0
RAIL = 214.0
SIGHT = 232.0
K = 1.163


def build(g):
    g.set_global(scale=K, f0=0.0, u0=0.0)
    S = Sil(REF)
    MAG_R = [(330, 104), (412, 104), (412, 152), (330, 152)]
    stock = S.clip([(0, 95), (690, 95), (690, 206), (0, 206)], minus=[(60, 40, 176, 104), MAG_R, (600, 60, 700, 160)])
    g.side_geom('stock', stock, 52, 'poly_od', bevel=7, bres=2,
                taper=[(0, 0.9), (60, 1.0), (200, 0.92), (250, 0.7), (330, 0.95), (690, 0.85)])
    g.side_geom('monopod', S.clip((80, 50, 170, 108)), 30, 'park', bevel=4, bres=2)
    g.side('buttpad', [(-6, 98, 6), (6, 98), (6, 200), (-6, 200, 6)], 48, 'rubber', bevel=4)
    # receiver, rail, bolt
    g.lathe('recv', [(270, 0), (270, 14), (274, 16), (500, 16), (504, 14), (504, 0)], 'park', u=BORE, segs=24)
    g.side('rail_mount', [(280, 200), (500, 200), (500, RAIL), (280, RAIL)], 22, 'park', bevel=1.5)
    g.rail('rail_top', 284, 520, RAIL, 'park')
    g.lathe('shroud', [(248, 0), (248, 10), (254, 13), (272, 13.5), (272, 0)], 'park', group='bolt', u=BORE, segs=20)
    g.lathe('bolt_stem', [(0, 0), (0, 3.4), (30, 3.0), (36, 3.0), (36, 0)], 'bright', group='bolt', f=300, u=BORE, s=8, axis='s', segs=12, M=rot_f(32, BORE, 0))
    import math
    a = math.radians(32); L = 44
    g.lathe('bolt_knob', [(-9, 0), (-8.4, 4.5), (-5, 8), (0, 9), (5, 8), (8.4, 4.5), (9, 0)], 'poly', group='bolt', f=300,
            u=BORE - L * math.sin(a), s=L * math.cos(a), axis='s', segs=14)
    g.pivot('bolt', 300, BORE)
    # trigger guard + trigger
    g.side('guard', [(262, 140), (266, 112, 8), (316, 110, 8), (320, 140)], 14, 'park', bevel=1.5, holes=[[(274, 140), (276, 120, 6), (308, 119, 6), (310, 140)]])
    g.side('trigger', [(284, 142), (290, 142), (292, 130, 3), (297, 122, 2), (293, 121), (285, 129, 3)], 6, 'park', bevel=1)
    # detachable 5-rd magazine
    g.side('mag', [(334, 150), (408, 150), (410, 96, 3), (336, 96, 3)], 26, 'park', group='mag', bevel=2)
    g.side('mag_base', [(330, 90, 2), (414, 90, 2), (414, 100), (330, 100)], 30, 'park', group='mag', bevel=1.5)
    g.pivot('mag', 372, 150)
    # barrel + muzzle brake (1057..1135 trace ~ 1230 mm)
    g.tube('barrel', 680, 985, 12.5, 'park', u=BORE, r1=10.0, bore=4.4)
    g.lathe('brake', [(980, 5), (980, 13.5), (984, 14.8), (1052, 14.8), (1058, 13.5), (1058, 5)], 'park', u=BORE, closed=True, segs=24)
    for i in range(3):
        g.box(f'port{i}', 994 + i * 18, 1006 + i * 18, BORE - 5, BORE + 5, 32, 'park!', r=3.5, bevel=0.5)
    # irons (emergency) + cheek piece knob, sling studs
    g.side('rsight', [(290, RAIL + 9.4), (310, RAIL + 9.4), (310, SIGHT + 5, 3), (290, SIGHT + 5, 3)], 16, 'park', bevel=1.2)
    g.front('raperture', [(-5, -5, 2), (5, -5, 2), (5, 5, 2), (-5, 5, 2)], 298, 303, 'park', bevel=0.6, u=SIGHT, holes=[circle(0, 0, 1.3, 10)])
    g.side('fs', [(960, BORE + 10), (976, BORE + 10), (974, SIGHT), (962, SIGHT)], 4, 'park', bevel=0.6)
    g.lathe('cheek_knob', [(0, 0), (0, 7), (8, 7), (8, 0)], 'park', f=150, u=180, s=26, axis='s', segs=12)
    g.set_grip(250, 140)
    g.empty('muzzle', 1058, BORE)
    g.empty('grip_support', 560, 168)
    g.empty('sight_eye', 180, SIGHT)
    g.empty('rail_top', 380, RAIL + 9.4)
