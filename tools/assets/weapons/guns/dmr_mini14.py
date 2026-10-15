"""Ruger Mini-14 GB -- outlines read from Commons 'Mini14GB_noBG.jpg' (sling omitted)."""
from wkit import *

META = dict(name='Mini 14', real_length_m=0.946, cycle_node='bolt', mag_kind='box')
BORE = 277.0
SIGHT = 293.0


def build(g):
    stock = [(4, 126, 6), (120, 150, 40), (238, 172, 8), (252, 166, 6), (268, 180, 10), (300, 214), (690, 220, 6), (694, 236), (692, 266, 4),
             (480, 266), (318, 262), (300, 246, 10), (280, 228, 20), (232, 240, 20), (200, 246, 30), (6, 236, 6)]
    g.side('stock', stock, 40, 'wood', bevel=9, bres=3, taper=[(4, 0.95), (180, 1.0), (262, 0.8), (330, 0.9), (690, 0.78)])
    g.side('buttpad', [(0, 124, 4), (8, 124), (8, 238), (0, 238, 4)], 42, 'rubber', bevel=3)
    # receiver + handguard
    g.side('recv', [(316, 256), (640, 256), (640, 288), (360, 291, 4), (330, 288), (316, 270)], 30, 'blued', bevel=3, bres=2)
    g.side('hguard', [(478, 262), (690, 262), (692, 284, 4), (478, 286, 4)], 32, 'poly', bevel=4, bres=2)
    for i in range(5):
        g.box(f'hg_vent{i}', 540 + i * 26, 556 + i * 26, 278, 282, 33, 'park', r=1.5, bevel=0.4)
    g.side('rsight', [(342, 288), (376, 288), (374, SIGHT + 7, 3), (346, SIGHT + 7, 3)], 22, 'blued', bevel=2)
    g.front('rsight_ring', [(-6, -5, 2), (6, -5, 2), (6, 5, 2), (-6, 5, 2)], 356, 362, 'blued', bevel=0.6, u=SIGHT, holes=[circle(0, 0, 1.4, 10)])
    # trigger guard + safety + trigger
    g.side('guard', [(300, 222), (308, 194, 8), (352, 196, 6), (356, 222)], 12, 'blued', bevel=1.5, holes=[[(312, 222), (316, 204, 5), (344, 204, 5), (346, 222)]])
    g.side('trigger', [(326, 224), (332, 224), (334, 212, 3), (339, 204, 2), (335, 203), (327, 211, 3)], 6, 'blued', bevel=1)
    g.side('safety', [(352, 214), (362, 212), (364, 226), (354, 226)], 10, 'blued', bevel=1)
    # 20-rd box magazine
    g.side('mag', [(400, 222), (468, 222), (472, 138, 3), (408, 136, 3)], 24, 'blued', group='mag', bevel=2)
    g.side('mag_base', [(404, 132, 2), (476, 134, 2), (476, 141), (404, 140)], 28, 'blued', group='mag', bevel=1.5)
    g.pivot('mag', 436, 222)
    # barrel, gas block, front sight, flash hider
    g.tube('barrel', 690, 904, 9.6, 'blued', u=BORE, r1=8.6, bore=3.0)
    g.side('gasblock', [(694, 252), (724, 252), (724, 290, 3), (694, 290, 3)], 26, 'blued', bevel=2.5)
    g.lathe('fs_collar', [(774, 0), (774, 12), (796, 12), (796, 0)], 'blued', u=BORE, segs=24)
    for sgn in (1, -1):
        g.side(f'fs_ear{sgn}', [(776, 280), (794, 280), (792, SIGHT + 8, 3), (778, SIGHT + 8, 3)], 3, 'blued', s=7 * sgn, bevel=0.8)
    g.side('fs_post', [(783, 280), (787, 280), (786.5, SIGHT), (783.5, SIGHT)], 3, 'blued', bevel=0.4)
    g.lathe('flash', [(898, 4), (898, 12.4), (902, 13.4), (940, 13.4), (946, 12.2), (946, 4)], 'blued', u=BORE, closed=True, segs=24)
    for i in range(4):
        g.side(f'fslot{i}', [(912, -1.4), (944, -1.4), (944, 1.4), (912, 1.4)], 2.8, 'blued', bevel=0.2,
               M=rot_f(45 + 90 * i, BORE, 0) @ T(0, BORE + 12.2, 0))
    # operating rod handle (right side)
    g.side('oprod', [(470, 262), (640, 262), (640, 272), (470, 272)], 6, 'blued', group='bolt', s=16.5, bevel=1)
    g.side('oprod_knob', [(464, 258), (486, 258, 3), (486, 278, 3), (464, 278, 3)], 12, 'blued', group='bolt', s=22, bevel=2)
    g.pivot('bolt', 476, 268, 18)
    g.grip = (262, 205)
    g.empty('muzzle', 946, BORE)
    g.empty('grip_support', 560, 245)
    g.empty('sight_eye', 200, SIGHT)
    g.empty('rail_top', 420, 291)
