"""M16A4 -- proportions read from Commons 'M16A2_noBG.jpg' (A2 carry handle replaced by A4 flat-top rail + BUIS)."""
import os, math
from wkit import *

META = dict(name='M16A4', real_length_m=1.003, cycle_node='charging_handle', mag_kind='box')
BORE = 190.0
RAIL = 214.0
SIGHT = 252.0


def build(g):
    # A2 fixed stock
    g.side('stock', [(14, 84, 3), (262, 140, 6), (270, 142), (270, 199), (14, 199, 3)], 42, 'poly', bevel=6, bres=2,
           taper=[(14, 1.0), (150, 0.92), (268, 0.7)])
    g.side('buttplate', [(0, 82, 3), (16, 82), (16, 201), (0, 201, 4)], 44, 'poly', bevel=4)
    g.box('trapdoor', 2, 10, 120, 170, 30, 'park', bevel=1.5, r=4)
    # lower receiver
    lower = [(266, 145), (334, 145), (338, 132), (394, 132), (396, 141), (466, 141), (470, 150), (470, 182), (266, 182), (266, 160)]
    g.side('lower', lower, 30, 'anod', bevel=2.2)
    g.side('magwell', [(392, 141), (468, 141), (466, 182), (394, 182)], 33, 'anod', bevel=2.2)
    g.side('guard', [(330, 122, 3), (398, 124), (398, 131), (336, 130, 2), (330, 138)], 16, 'anod', bevel=1.2)
    g.side('grip', [(287, 145), (262, 96), (248, 60, 5), (252, 47, 4), (300, 40, 6), (310, 60), (323, 90, 4), (317, 101, 3), (333, 145)], 30, 'poly',
           bevel=7, bres=3, taper=[(250, 0.88), (320, 1.0)])
    g.side('trigger', [(350, 140), (356, 140), (358, 128, 3), (363, 120, 2), (359, 119), (351, 127, 3)], 6, 'park', bevel=1)
    # upper receiver (flat top) + rail
    g.side('upper', [(270, 181), (470, 181), (470, RAIL), (292, RAIL), (276, 206, 4)], 30, 'anod', bevel=2.4)
    g.rail('rail_top', 284, 468, RAIL, 'anod')
    g.lathe('fwd_assist', [(0, 0), (0, 7.5), (12, 7.5), (14, 6), (14, 0)], 'anod', f=448, u=200, s=15, axis='s', segs=14)
    g.box('eject', 360, 425, 182, 202, 1.6, 'park', s=15.4, r=1.5, bevel=0.5)
    g.lathe('brass_def', [(0, 0), (0, 6), (8, 5), (8, 0)], 'anod', f=432, u=192, s=15, axis='s', segs=12)
    # charging handle (rear, T-handle)
    g.side('ch', [(258, 204), (300, 204), (300, 211), (258, 211)], 18, 'anod', group='charging_handle', bevel=1.2)
    g.side('ch_latch', [(256, 203), (266, 203), (266, 212), (256, 212)], 30, 'anod', group='charging_handle', bevel=2)
    g.pivot('charging_handle', 266, 207)
    # delta ring + A2 round ribbed handguard
    g.lathe('delta', [(468, 0), (468, 27), (472, 30), (488, 30), (492, 26), (492, 0)], 'anod', u=BORE, segs=28)
    rib = []
    n = 28
    for i in range(n * 2):
        a = math.pi * 2 * i / (n * 2)
        r = 29.5 if i % 2 == 0 else 27.6
        rib.append((r * math.cos(a), r * math.sin(a)))
    g.front('handguard', rib, 492, 768, 'poly', bevel=0.6, u=BORE)
    g.lathe('hg_cap', [(766, 0), (766, 25), (774, 25), (776, 22), (776, 0)], 'park', u=BORE, segs=24)
    # barrel, front sight, flash hider
    g.tube('barrel', 774, 952, 8.6, 'park', u=BORE, r1=7.8, bore=3.0)
    g.side('fsight', [(778, 178), (806, 178), (842, 196), (842, 212), (826, 212), (824, 258, 3), (814, 258, 3), (780, 212)], 24, 'park', bevel=2,
           holes=[[(798, 214), (816, 214), (816, 246, 2), (806, 230)]])
    g.box('bayo_lug', 822, 846, 166, 182, 10, 'park', bevel=1.5)
    g.side('fsight_post', [(817, 236), (821, 236), (820.5, SIGHT), (817.5, SIGHT)], 3, 'park', bevel=0.4)
    g.lathe('flash', [(948, 4.5), (948, 10), (952, 11.2), (998, 11.2), (1003, 10), (1003, 4.5)], 'park', u=BORE, closed=True, segs=24)
    for i in range(5):
        g.side(f'fslot{i}', [(966, -1.2), (1002, -1.2), (1002, 1.2), (966, 1.2)], 2.4, 'park', bevel=0.2,
               M=rot_f(18 + 72 * i, BORE, 0) @ T(0, BORE + 10.4, 0))
    # rear BUIS (flip-up)
    rt = RAIL + 9.4
    g.side('rsight_base', [(286, rt), (316, rt), (316, rt + 7, 2), (286, rt + 7, 2)], 22, 'anod', bevel=1.5)
    g.side('rsight', [(294, rt + 6), (310, rt + 6), (308, SIGHT + 9, 4), (296, SIGHT + 9, 4)], 9, 'anod', bevel=1.4)
    g.front('rsight_ring', [(-6.5, -6.5, 3), (6.5, -6.5, 3), (6.5, 6.5, 3), (-6.5, 6.5, 3)], 299, 305, 'anod', bevel=0.8, u=SIGHT,
            holes=[circle(0, 0, 1.7, 10)])
    # magazine
    g.side('mag', [(393, 141), (455, 141), (462, 90), (470, 16, 3), (410, 10, 3), (400, 80)], 22, 'anod', group='mag', bevel=2)
    g.side('mag_plate', [(406, 6), (474, 12), (474, 20), (406, 14)], 26, 'poly', group='mag', bevel=2)
    g.pivot('mag', 424, 141)
    # controls / pins
    g.side('selector', [(296, 160), (318, 162, 2), (318, 170, 2), (294, 168, 3)], 3, 'park', s=-16, bevel=0.8)
    g.lathe('magrel', [(0, 0), (0, 5), (3, 5), (3, 0)], 'park', f=388, u=152, s=15, axis='s', segs=12)
    for (f, u) in ((276, 172), (462, 172), (336, 158), (376, 158)):
        g.lathe(f'pin{f}', [(0, 0), (0, 3.2), (1.5, 3.2), (1.5, 0)], 'park', f=f, u=u, s=-15, axis='s', segs=10)
    g.grip = (290, 95)
    g.empty('muzzle', 1003, BORE)
    g.empty('grip_support', 640, BORE)
    g.empty('sight_eye', 215, SIGHT)
    g.empty('rail_top', 380, RAIL + 9.4)
