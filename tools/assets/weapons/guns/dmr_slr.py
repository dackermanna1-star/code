"""L1A1 SLR -- outlines read from Commons 'SLRL1A1.jpg' (sling and carry handle omitted)."""
from wkit import *

META = dict(name='SLR', real_length_m=1.143, cycle_node='charging_handle', mag_kind='box')
BORE = 228.0
SIGHT = 272.0


def build(g):
    g.set_global(scale=1.016, f0=15.0, u0=0.0)
    # synthetic butt stock
    g.side('stock', [(24, 100, 6), (78, 102, 20), (262, 188, 10), (290, 196), (292, 238), (240, 226, 20), (60, 224, 8), (24, 222, 6)], 42, 'poly',
           bevel=8, bres=3, taper=[(24, 1.0), (160, 0.92), (290, 0.72)])
    g.side('buttplate', [(15, 98, 4), (26, 98), (26, 226), (15, 226, 4)], 44, 'park', bevel=3)
    # receiver (upper + lower)
    g.side('recv_upper', [(282, 222), (562, 222), (562, 254, 3), (300, 254, 4), (284, 240)], 32, 'park', bevel=3, bres=2)
    g.side('recv_lower', [(286, 192), (522, 192), (530, 200), (530, 224), (286, 224)], 34, 'park', bevel=2.5)
    g.side('magwell', [(432, 184), (506, 184), (506, 200), (432, 200)], 34, 'park', bevel=2)
    g.side('rsight', [(282, 250), (306, 250), (304, SIGHT + 7, 3), (284, SIGHT + 7, 3)], 18, 'park', bevel=1.5)
    g.front('rsight_ring', [(-5, -5, 2), (5, -5, 2), (5, 5, 2), (-5, 5, 2)], 292, 297, 'park', bevel=0.6, u=SIGHT, holes=[circle(0, 0, 1.4, 10)])
    # pistol grip, trigger guard, trigger
    g.side('grip', [(268, 98, 8), (318, 82, 6), (352, 180), (300, 196)], 32, 'poly', bevel=8, bres=3)
    g.side('guard', [(342, 192), (346, 148, 8), (392, 146, 8), (396, 192)], 12, 'park', bevel=1.5, holes=[[(354, 192), (356, 158, 6), (384, 158, 6), (386, 192)]])
    g.side('trigger', [(362, 194), (368, 194), (370, 180, 3), (375, 170, 2), (371, 169), (363, 179, 3)], 6, 'park', bevel=1)
    # 20-rd magazine
    g.side('mag', [(440, 190), (500, 190), (500, 72, 3), (442, 70, 3)], 28, 'park', group='mag', bevel=2)
    g.side('mag_base', [(436, 64, 2), (504, 66, 2), (504, 74), (436, 72)], 32, 'park', group='mag', bevel=1.5)
    g.pivot('mag', 470, 190)
    # handguard with vent slots
    g.side('hguard', [(556, 210, 4), (818, 212, 6), (820, 232), (818, 260, 4), (556, 262, 4)], 46, 'poly', bevel=7, bres=2)
    for i in range(3):
        g.box(f'hg_slot{i}', 640 + i * 52, 680 + i * 52, 238, 246, 47, 'park', r=3.5, bevel=0.5)
    # gas block + front sight, barrel, flash hider
    g.side('gasblock', [(818, 206), (858, 206), (858, 246, 4), (818, 250, 4)], 28, 'park', bevel=2.5)
    for sgn in (1, -1):
        g.side(f'fs_ear{sgn}', [(828, 244), (850, 244), (846, SIGHT + 12, 3), (832, SIGHT + 12, 3)], 3, 'park', s=8 * sgn, bevel=0.8)
    g.side('fs_post', [(837, 244), (841, 244), (840.5, SIGHT), (837.5, SIGHT)], 3, 'park', bevel=0.4)
    g.tube('barrel', 856, 1052, 9.6, 'park', u=BORE, r1=8.8, bore=3.8)
    g.lathe('flash', [(1048, 5), (1048, 11.5), (1052, 12.5), (1134, 12.5), (1140, 11.2), (1140, 5)], 'park', u=BORE, closed=True, segs=24)
    for i in range(3):
        g.side(f'fslot{i}', [(1080, -1.4), (1138, -1.4), (1138, 1.4), (1080, 1.4)], 2.8, 'park', bevel=0.2,
               M=rot_f(60 + 120 * i, BORE, 0) @ T(0, BORE + 11.4, 0))
    # folding charging handle (left side) + slot
    g.box('ch_slot', 450, 562, 230, 238, 2, 'park', s=-16.6, r=3, bevel=0.5)
    g.side('ch', [(540, 228), (554, 228), (556, 240, 2), (538, 240, 2)], 8, 'park', group='charging_handle', s=-20, bevel=1.2)
    g.side('ch_lever', [(544, 230), (552, 230), (552, 238), (544, 238)], 24, 'park', group='charging_handle', s=-30, bevel=1.5)
    g.pivot('charging_handle', 547, 234, -20)
    g.side('selector', [(318, 206), (340, 208, 2), (340, 216, 2), (316, 214, 3)], 3, 'park', s=-17.6, bevel=0.8)
    g.set_grip(305, 140)
    g.empty('muzzle', 1140, BORE)
    g.empty('grip_support', 700, 236)
    g.empty('sight_eye', 200, SIGHT)
    g.empty('rail_top', 420, 254)
