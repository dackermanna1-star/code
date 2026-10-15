"""M24 SWS -- traced from Commons 'M24-Sniper-Weapon-System.png' (scope removed; detachable 5-rd box mag as in game; small Palma-style irons)."""
import os
from wkit import *

META = dict(name='M24', real_length_m=1.092, cycle_node='bolt', mag_kind='box')
REF = os.path.join(os.path.dirname(__file__), '..', 'ref', 'sr_m24.json')
BORE = 136.0
RAIL = 152.0
SIGHT = 176.0


def build(g):
    S = Sil(REF)
    stock = S.clip([(-5, -5), (810, -5), (810, 150), (560, 150), (560, 124), (340, 124), (340, 150), (-5, 150)],
                   minus=[(318, 40, 376, 92), (420, 60, 486, 92)])
    g.side_geom('stock', stock, 46, 'poly_od', bevel=8, bres=3,
                taper=[(0, 0.9), (100, 1.0), (260, 0.9), (300, 0.7), (380, 0.9), (560, 0.85), (800, 0.72)])
    g.side('buttpad', [(-14, 6, 6), (2, 6), (2, 122), (-14, 122, 6)], 48, 'rubber', bevel=4)
    # receiver (round), scope base (rail), bolt shroud
    g.lathe('recv', [(330, 0), (330, 13), (334, 15.5), (560, 15.5), (566, 13), (566, 0)], 'blued', u=BORE, segs=24)
    g.side('rail_mount', [(340, 144), (560, 144), (560, RAIL), (340, RAIL)], 18, 'anod', bevel=1.5)
    g.rail('rail_top', 344, 556, RAIL, 'anod')
    g.lathe('shroud', [(300, 0), (300, 10), (306, 12.5), (334, 13), (334, 0)], 'blued', group='bolt', u=BORE, segs=20)
    # bolt handle (right side) with tactical knob
    g.lathe('bolt_stem', [(0, 0), (0, 4.0), (30, 3.6), (40, 3.4), (40, 0)], 'bright', group='bolt', f=356, u=BORE, s=8, axis='s', segs=12, M=rot_f(30, BORE, 0))
    import math
    a = math.radians(30); L = 50
    g.lathe('bolt_knob', [(-10, 0), (-10, 7), (-6, 9.5), (6, 9.5), (10, 7), (10, 0)], 'blued', group='bolt', f=356,
            u=BORE - L * math.sin(a), s=L * math.cos(a), axis='s', segs=16)
    g.pivot('bolt', 356, BORE)
    # trigger guard + trigger
    g.side('guard', [(320, 92), (322, 52, 10), (376, 48, 10), (380, 92)], 12, 'blued', bevel=1.5, holes=[[(332, 92), (334, 60, 8), (366, 58, 8), (368, 92)]])
    g.side('trigger', [(346, 94), (352, 94), (354, 80, 3), (359, 70, 2), (355, 69), (347, 79, 3)], 6, 'blued', bevel=1)
    # 5-rd detachable box mag
    g.side('mag', [(418, 120), (486, 120), (486, 62, 3), (420, 62, 3)], 22, 'blued', group='mag', bevel=1.8)
    g.side('mag_base', [(414, 56, 2), (490, 56, 2), (490, 66), (414, 66)], 26, 'poly', group='mag', bevel=1.5)
    g.pivot('mag', 452, 120)
    # heavy barrel
    g.tube('barrel', 560, 1092, 13.0, 'blued', u=BORE, r1=10.5, bore=4.0)
    g.lathe('crown', [(1086, 4), (1086, 11), (1092, 10.5), (1092, 4)], 'bright', u=BORE, closed=True, segs=24)
    # Palma-style irons
    g.side('rsight', [(350, RAIL + 9.4), (374, RAIL + 9.4), (374, SIGHT + 6, 3), (350, SIGHT + 6, 3)], 18, 'anod', bevel=1.5)
    g.front('raperture', [(-6, -6, 3), (6, -6, 3), (6, 6, 3), (-6, 6, 3)], 362, 368, 'anod', bevel=0.8, u=SIGHT, holes=[circle(0, 0, 1.4, 10)])
    g.lathe('fs_hood', [(1052, 9.5), (1052, 11.5), (1082, 11.5), (1082, 9.5)], 'blued', u=SIGHT - 8, closed=True, segs=18)
    g.side('fs_base', [(1052, BORE + 8), (1082, BORE + 8), (1082, SIGHT - 16), (1052, SIGHT - 16)], 10, 'blued', bevel=1)
    g.side('fs_post', [(1066, SIGHT - 18), (1069, SIGHT - 18), (1068.8, SIGHT), (1066.2, SIGHT)], 2.4, 'blued', bevel=0.3)
    # sling swivels
    for f, u in ((150, 34), (740, 96)):
        g.lathe(f'swivel{f}', [(0, 0), (0, 5), (12, 5), (12, 0)], 'blued', f=f, u=u, axis='u', segs=10)
    g.grip = (300, 80)
    g.empty('muzzle', 1092, BORE)
    g.empty('grip_support', 640, 112)
    g.empty('sight_eye', 230, SIGHT)
    g.empty('rail_top', 450, RAIL + 9.4)
