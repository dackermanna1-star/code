"""Mauser Karabiner 98k -- traced from Commons 'Kar_98K_AM021488_noBG.png'. 'mag' = magazine floor plate + follower block."""
import os
from wkit import *

META = dict(name='Kar98k', real_length_m=1.11, cycle_node='bolt', mag_kind='internal')
REF = os.path.join(os.path.dirname(__file__), '..', 'ref', 'sr_kar98k.json')
BORE = 163.0
SIGHT = 187.0


def build(g):
    S = Sil(REF)
    wood = S.clip([(0, -5), (935, -5), (935, 152), (872, 152), (872, 192), (640, 192), (640, 152), (270, 152), (270, 165), (0, 165)],
                  minus=[(834, 0, 874, 200), (318, 60, 384, 112)])
    g.side_geom('stock', wood, 44, 'wood', bevel=9, bres=3,
                taper=[(0, 0.95), (150, 1.0), (300, 0.72), (420, 0.86), (640, 0.78), (935, 0.6)])
    g.side('buttplate', [(-2, 10), (8, 4), (12, 152), (2, 156)], 42, 'blued', bevel=2.5)
    # receiver, bolt shroud, rear sight
    g.side_geom('recv', S.clip((270, 146, 640, 178)), 28, 'blued', bevel=4, bres=2)
    g.side_geom('rsight', S.clip((588, 160, 652, 190)), 24, 'blued', bevel=2)
    # barrel bands, nose cap, front sight, cleaning rod
    g.side_geom('band', S.clip((834, 124, 874, 194)), 40, 'blued', bevel=3)
    g.tube('barrel', 640, 1110, 9.4, 'blued', u=BORE, r1=7.8, bore=3.6)
    g.side_geom('nosecap', S.clip((930, 138, 1000, 182)), 32, 'blued', bevel=3)
    g.side('fs_base', [(1076, 168), (1104, 168), (1104, 176), (1076, 176)], 14, 'blued', bevel=1.5)
    g.side('fs_hood', [(1080, 170), (1100, 170), (1100, 192, 4), (1080, 192, 4)], 18, 'blued', bevel=1.2,
           holes=[[(1083, 174), (1097, 174), (1097, 189, 3), (1083, 189, 3)]])
    g.side('fs_post', [(1088, 172), (1092, 172), (1091.5, SIGHT), (1088.5, SIGHT)], 2.5, 'blued', bevel=0.4)
    g.tube('rod', 990, 1102, 3.0, 'bright', u=146, segs=10)
    # trigger guard + trigger
    g.side('guard', [(318, 108), (322, 70, 10), (380, 66, 12), (384, 108)], 12, 'blued', bevel=1.6, holes=[[(330, 108), (334, 80, 8), (370, 78, 9), (374, 108)]])
    g.side('trigger', [(344, 110), (350, 110), (352, 96, 3), (357, 86, 2), (353, 85), (345, 95, 3)], 6, 'blued', bevel=1)
    # magazine floor plate ('mag')
    g.side('mag', [(384, 104), (500, 112), (500, 120), (384, 112)], 26, 'blued', group='mag', bevel=1.6)
    g.pivot('mag', 440, 112)
    # bolt: body, cocking piece/safety, turned-down handle with ball knob (right side)
    g.tube('bolt_body', 300, 410, 9.5, 'bright', group='bolt', u=BORE, segs=18)
    g.lathe('bolt_shroud', [(268, 0), (268, 8), (272, 11), (300, 12), (304, 9), (304, 0)], 'blued', group='bolt', u=BORE, segs=18)
    g.side('safety_flag', [(276, 172), (290, 172), (290, 186, 3), (276, 186, 3)], 3, 'blued', group='bolt', bevel=0.6)
    g.lathe('bolt_stem', [(0, 0), (0, 4.2), (30, 3.6), (36, 3.4), (36, 0)], 'bright', group='bolt', f=388, u=BORE, s=6, axis='s', segs=12,
            M=rot_f(35, BORE, 0))
    import math
    a = math.radians(35); L = 46
    g.lathe('bolt_ball', [(-9, 0), (-8.3, 4), (-5.5, 7.4), (0, 9), (5.5, 7.4), (8.3, 4), (9, 0)], 'bright', group='bolt', f=388,
            u=BORE - L * math.sin(a), s=L * math.cos(a), axis='s', segs=14)
    g.pivot('bolt', 388, BORE)
    g.grip = (300, 112)
    g.empty('muzzle', 1110, BORE)
    g.empty('grip_support', 720, 142)
    g.empty('sight_eye', 160, SIGHT)
    g.empty('rail_top', 450, 178)
