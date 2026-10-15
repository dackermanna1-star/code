"""Degtyaryov DP-28 -- authored from published dimensions (1266 mm, 47-rd pan, perforated shroud).
Commons 'Chinese_Type_53.jpg' / 'Machine_gun_DP_MON.jpg' used for proportions. 'mag' = pan magazine, 'bolt' = charging handle."""
import math
from wkit import *

META = dict(name='DP-28', real_length_m=1.266, cycle_node='bolt', mag_kind='pan')
BORE = 232.0
SIGHT = 300.0
PAN_F = 450.0


def build(g):
    # wooden butt stock with wrist and trigger group
    stock = [(4, 104, 8), (40, 108), (240, 178, 30), (300, 196, 10), (330, 206), (330, 248), (240, 240), (80, 246, 10), (6, 250, 8)]
    g.side('stock', stock, 44, 'wood', bevel=9, bres=3, taper=[(4, 0.95), (120, 1.0), (300, 0.72), (330, 0.8)])
    g.side('buttplate', [(-4, 100, 4), (8, 100), (8, 254), (-4, 254, 4)], 46, 'blued', bevel=2.5)
    g.side('trig_frame', [(300, 196), (380, 196), (380, 214), (300, 214)], 30, 'blued', bevel=2)
    g.side('guard', [(318, 198), (322, 170, 8), (366, 168, 8), (370, 198)], 12, 'blued', bevel=1.5, holes=[[(330, 198), (332, 178, 6), (358, 177, 6), (360, 198)]])
    g.side('trigger', [(340, 199), (346, 199), (348, 186, 3), (352, 178, 2), (348, 177), (341, 185, 3)], 6, 'blued', bevel=1)
    # receiver
    g.side('recv', [(326, 206), (600, 206), (604, 214), (604, 252), (330, 252, 4)], 40, 'blued', bevel=3, bres=2)
    g.side('pan_mount', [(390, 252), (520, 252), (520, 262), (390, 262)], 34, 'blued', bevel=2)
    # pan magazine (axis vertical) with stamped rings and spokes
    g.lathe('pan', [(0, 0), (0, 128), (2, 132), (14, 132), (17, 128), (19, 96), (22, 92), (24, 60), (30, 52), (34, 30), (38, 18), (38, 0)],
            'paint_od', group='mag', f=PAN_F, u=258, axis='u', segs=40)
    for k in range(10):
        a = 360.0 * k / 10
        g.side(f'pan_rib{k}', [(0, 0), (64, 0), (64, 3), (0, 3)], 6, 'paint_od', group='mag', bevel=1.2,
               M=T(PAN_F, 258 + 21, 0) @ rot_u(a) @ T(40, 0, 0) @ rot_s(-14))
    g.lathe('pan_hub', [(0, 0), (0, 16), (8, 16), (10, 12), (10, 0)], 'blued', group='mag', f=PAN_F, u=258 + 36, axis='u', segs=18)
    g.pivot('mag', PAN_F, 258)
    # rear tangent sight in front of pan
    g.side('rsight_base', [(596, 252), (640, 252), (640, 262), (596, 262)], 28, 'blued', bevel=2)
    g.side('rsight_leaf', [(600, 260), (634, 260), (634, SIGHT + 2), (602, SIGHT - 4)], 16, 'blued', bevel=1.2,
           holes=[[(612, SIGHT - 10), (624, SIGHT - 10), (624, SIGHT - 2), (612, SIGHT - 2)]])
    # barrel shroud with perforations, barrel, flash cone
    g.lathe('shroud', [(600, 0), (600, 21), (606, 23), (930, 23), (940, 20), (940, 0)], 'blued', u=BORE, segs=28)
    for side in (1, -1):
        for row, dang in enumerate((-32, 0, 32)):
            for j in range(9):
                f = 632 + j * 32 + (row % 2) * 16
                g.lathe(f'hole{side}{row}_{j}', [(0, 0), (0, 5.2), (1.4 * side, 5.2), (1.4 * side, 0)], 'rubber', f=f, u=BORE, s=22.2 * side,
                        axis='s', segs=10, M=rot_f(dang * side, BORE, 0))
    g.tube('barrel', 930, 1196, 11.5, 'blued', u=BORE, r1=10.5, bore=3.8)
    g.lathe('cone', [(1190, 5), (1190, 12), (1200, 13), (1266, 21), (1266, 17), (1206, 8)], 'blued', u=BORE, closed=True, segs=24)
    # front sight with protective ears (tall, as on the DP)
    g.side('fs_band', [(1150, BORE - 12), (1176, BORE - 12), (1176, BORE + 16), (1150, BORE + 16)], 28, 'blued', bevel=2)
    for sgn in (1, -1):
        g.side(f'fs_ear{sgn}', [(1152, BORE + 10), (1174, BORE + 10), (1170, SIGHT + 10, 4), (1156, SIGHT + 10, 4)], 3, 'blued', s=10 * sgn, bevel=0.8)
    g.side('fs_post', [(1161, BORE + 10), (1165, BORE + 10), (1164.5, SIGHT), (1161.5, SIGHT)], 3, 'blued', bevel=0.5)
    # gas tube + folded bipod
    g.tube('gastube', 600, 1010, 9, 'blued', u=BORE - 34, segs=18)
    g.lathe('gasreg', [(1000, 0), (1000, 12), (1030, 12), (1030, 0)], 'blued', u=BORE - 34, segs=18)
    g.side('gas_link', [(1004, BORE - 34), (1026, BORE - 34), (1026, BORE), (1004, BORE)], 16, 'blued', bevel=2)
    for sgn in (1, -1):
        g.tube(f'bipod{sgn}', 700, 1000, 4.5, 'blued', u=BORE - 48, s=16 * sgn, segs=10)
        g.side(f'bipod_foot{sgn}', [(690, BORE - 60), (712, BORE - 60), (706, BORE - 44), (696, BORE - 44)], 4, 'blued', s=16 * sgn, bevel=1)
    g.lathe('bipod_clamp', [(990, 0), (990, 24), (1006, 24), (1006, 0)], 'blued', u=BORE, segs=24)
    # charging handle (right side)
    g.box('ch_slot', 470, 590, 222, 232, 2, 'blued!', s=20.6, r=4, bevel=0.5)
    g.side('ch', [(560, 220), (576, 220), (576, 234), (560, 234)], 8, 'blued', group='bolt', s=24, bevel=1.5)
    g.lathe('ch_knob', [(0, 0), (0, 6), (16, 6), (20, 4.5), (20, 0)], 'blued', group='bolt', f=568, u=227, s=26, axis='s', segs=12)
    g.pivot('bolt', 568, 227, 24)
    g.grip = (286, 200)
    g.empty('muzzle', 1266, BORE)
    g.empty('grip_support', 760, BORE - 24)
    g.empty('sight_eye', 180, SIGHT)
