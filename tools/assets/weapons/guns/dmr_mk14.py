"""Mk 14 EBR -- outlines read from Commons 'PEO_M14_EBR-rbg.png' (levelled; scope and bipod omitted)."""
import os
from wkit import *

META = dict(name='Mk14', real_length_m=0.96, cycle_node='bolt', mag_kind='box')
REF = os.path.join(os.path.dirname(__file__), '..', 'ref', 'dmr_mk14.json')
BORE = 262.0
RAIL = 289.0
SIGHT = 318.0
GRIP_R = [(155, 120), (210, 120), (236, 222), (176, 232), (160, 200)]


def build(g):
    S = Sil(REF)
    # Sage EBR chassis stock: butt, buffer tube, cheek riser
    g.side_geom('butt', S.clip((0, 150, 60, 272)), 40, 'poly', bevel=5, bres=2)
    g.side_geom('cheek', S.clip((22, 270, 158, 292)), 30, 'poly', bevel=4, bres=2)
    g.lathe('tube', [(40, 0), (40, 14), (42, 15.5), (156, 15.5), (158, 14), (158, 0)], 'anod', u=240, segs=20)
    g.side('cheek_post', [(70, 254), (80, 254), (80, 272), (70, 272)], 12, 'anod', bevel=1.5)
    # chassis lower (aluminium) with pistol grip
    chassis = [(150, 222), (240, 222), (246, 214, 4), (296, 214, 4), (306, 222), (532, 220), (540, 214), (540, 240), (620, 248), (620, 262), (150, 262)]
    g.side('chassis', chassis, 44, 'anod', bevel=3.5, bres=2)
    g.side_geom('grip', S.clip(GRIP_R), 31, 'poly', bevel=8, bres=3)
    g.side('guard', [(236, 218), (240, 202, 6), (290, 200, 6), (296, 218)], 14, 'anod', bevel=1.5, holes=[[(248, 218), (252, 208, 4), (282, 207, 4), (286, 218)]])
    g.side('trigger', [(258, 220), (264, 220), (266, 210, 3), (271, 202, 2), (267, 201), (259, 209, 3)], 6, 'park', bevel=1)
    # M14 receiver (on top of chassis)
    g.side('recv', [(212, 258), (420, 258), (420, 280, 3), (240, 282, 6), (212, 270, 4)], 28, 'park', bevel=3, bres=2)
    g.rail('rail_top', 240, 618, RAIL, 'anod')
    g.side('rail_mount', [(240, 276), (420, 276), (420, RAIL), (240, RAIL)], 30, 'anod', bevel=2)
    g.side('hg_upper', [(420, 262), (620, 262), (620, RAIL), (420, RAIL)], 44, 'anod', bevel=3)
    for i in range(6):
        g.box(f'hg_slot{i}', 470 + i * 24, 488 + i * 24, 268, 276, 45, 'park', r=3, bevel=0.5)
    g.rail('rail_r', 540, 618, BORE + 22, 'anod', ang=90, u_c=BORE)
    g.rail('rail_l', 540, 618, BORE + 22, 'anod', ang=-90, u_c=BORE)
    g.rail('rail_b', 540, 618, BORE + 28, 'anod', ang=180, u_c=BORE)
    # 20-rd magazine
    g.side('mag', [(312, 222), (382, 222), (390, 130, 3), (322, 126, 3)], 28, 'park', group='mag', bevel=2)
    g.side('mag_base', [(318, 120, 2), (394, 124, 2), (394, 132), (318, 128)], 32, 'park', group='mag', bevel=1.5)
    g.pivot('mag', 348, 222)
    # gas cylinder, barrel, front sight, flash suppressor
    g.tube('gascyl', 620, 778, 8.5, 'park', u=246, segs=18)
    g.lathe('gas_lock', [(668, 0), (668, 14), (694, 14), (694, 0)], 'park', u=256, segs=20)
    g.tube('barrel', 620, 880, 10, 'park', u=BORE, r1=9, bore=3.8)
    g.lathe('collar', [(722, 0), (722, 12.5), (750, 12.5), (750, 0)], 'park', u=BORE, segs=24)
    g.side('fsight', [(856, 244), (878, 244), (876, 292, 3), (858, 292, 3)], 10, 'park', bevel=1.5)
    g.lathe('flash', [(874, 4.5), (874, 11), (878, 12), (954, 12), (960, 11), (960, 4.5)], 'park', u=BORE, closed=True, segs=24)
    for i in range(5):
        g.side(f'fslot{i}', [(894, -1.3), (958, -1.3), (958, 1.3), (894, 1.3)], 2.6, 'park', bevel=0.2,
               M=rot_f(36 + 72 * i, BORE, 0) @ T(0, BORE + 11, 0))
    # op-rod handle (right) + flip sights on rail
    g.side('oprod', [(330, 252), (470, 252), (470, 262), (330, 262)], 6, 'park', group='bolt', s=17, bevel=1)
    g.side('oprod_knob', [(322, 248), (346, 248, 3), (346, 268, 3), (322, 268, 3)], 12, 'park', group='bolt', s=24, bevel=2)
    g.pivot('bolt', 334, 258, 20)
    rt = RAIL + 9.4
    g.side('rsight_base', [(248, rt), (276, rt), (276, rt + 7, 2), (248, rt + 7, 2)], 22, 'anod', bevel=1.5)
    g.side('rsight', [(255, rt + 6), (271, rt + 6), (269, SIGHT + 9, 4), (257, SIGHT + 9, 4)], 9, 'anod', bevel=1.4)
    g.front('rsight_ring', [(-6.5, -6.5, 3), (6.5, -6.5, 3), (6.5, 6.5, 3), (-6.5, 6.5, 3)], 260, 266, 'anod', bevel=0.8, u=SIGHT,
            holes=[circle(0, 0, 1.7, 10)])
    g.side('fsight_base', [(588, rt), (612, rt), (612, rt + 7, 2), (588, rt + 7, 2)], 22, 'anod', bevel=1.5)
    for sgn in (1, -1):
        g.side(f'fsight_ear{sgn}', [(591, rt + 5), (609, rt + 5), (606, SIGHT + 14, 3), (594, SIGHT + 14, 3)], 3, 'anod', s=9 * sgn, bevel=0.8)
    g.side('fsight_post', [(598.5, rt + 5), (602, rt + 5), (601.5, SIGHT), (599, SIGHT)], 2.6, 'anod', bevel=0.4)
    g.grip = (196, 176)
    g.empty('muzzle', 960, BORE)
    g.empty('grip_support', 520, 238)
    g.empty('sight_eye', 140, SIGHT)
    g.empty('rail_top', 330, RAIL + 9.4)
