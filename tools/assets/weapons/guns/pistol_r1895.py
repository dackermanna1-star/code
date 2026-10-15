"""Nagant M1895 revolver ('R1895') -- traced from Commons 'Nagant_Revolver.jpg'. 'mag' = cylinder, 'bolt' = hammer."""
import os
from wkit import *

META = dict(name='R1895', real_length_m=0.235, cycle_node='bolt', mag_kind='cylinder')
REF = os.path.join(os.path.dirname(__file__), '..', 'ref', 'pistol_r1895.json')
BORE = 126.0
CYL = 111.0
SIGHT = 140.0
GRIP_W = [(0, 8), (36, 6), (42, 40), (48, 72), (40, 88), (22, 96), (4, 64)]


def build(g):
    S = Sil(REF)
    frame = S.clip((-2, 12, 140, 146), minus=[GRIP_W, [(76, 90), (124, 90), (124, 126), (76, 126)], (36, 116, 64, 150)])
    g.side_geom('frame', frame, 24, 'blued', bevel=2.4, bres=2)
    g.side('frame_lower', [(76, 86), (124, 86), (124, 92), (76, 92)], 22, 'blued', bevel=1.5)
    g.side('topstrap', [(70, 128), (130, 128), (130, 136, 2), (72, 136, 2)], 16, 'blued', bevel=2)
    g.side_geom('grip', S.clip(GRIP_W), 32, 'wood_red', bevel=6, bres=3)
    g.side('buttcap', [(0, 4), (34, 2), (36, 10), (2, 12)], 26, 'blued', bevel=2)
    g.lathe('lanyard', [(0, 6.5), (0, 8.5), (2.5, 8.5), (2.5, 6.5)], 'blued', f=16, u=-2, s=-1.25, axis='s', segs=16, closed=True)
    # cylinder (unfluted, 7 chambers)
    g.lathe('cylinder', [(78, 0), (78, 17), (80, 19.5), (121, 19.5), (123, 17), (123, 0)], 'blued', group='mag', u=CYL, segs=28)
    import math
    for k in range(7):
        a = 2 * math.pi * k / 7
        g.lathe(f'chamber{k}', [(122.6, 0), (122.6, 4.3), (123.2, 4.3), (123.2, 0)], 'rubber', group='mag',
                u=CYL + 12.5 * math.cos(a), s=12.5 * math.sin(a), segs=10)
    g.pivot('mag', 100, CYL)
    # barrel, front sight, ejector rod
    g.lathe('barrel', [(124, 3.8), (124, 9), (140, 9), (142, 7.6), (232, 7.6), (235, 6.8), (235, 3.8)], 'blued', u=BORE, closed=True, segs=22)
    g.side('fsight', [(218, BORE + 6), (230, BORE + 6), (229, SIGHT), (222, SIGHT, 2)], 3, 'blued', bevel=0.6)
    g.tube('ejector', 132, 186, 2.6, 'blued', u=CYL + 1, segs=10)
    g.lathe('ejector_head', [(180, 0), (180, 4.5), (192, 4.5), (192, 0)], 'blued', u=CYL + 1, segs=12)
    g.side('rnotch_l', [(62, 134), (70, 134), (70, SIGHT), (62, SIGHT)], 4, 'blued', s=-4, bevel=0.5)
    g.side('rnotch_r', [(62, 134), (70, 134), (70, SIGHT), (62, SIGHT)], 4, 'blued', s=4, bevel=0.5)
    # hammer (cycles every shot) + trigger
    g.side_geom('hammer', S.clip((36, 116, 64, 150)), 9, 'blued', group='bolt', bevel=1.4)
    g.pivot('bolt', 56, 116)
    g.side('trigger', [(88, 86), (96, 86), (100, 72, 4), (104, 58, 3), (100, 57), (90, 72, 4)], 6, 'blued', bevel=1)
    g.side('gate', [(124, 98), (132, 98), (132, 122), (124, 122)], 2, 'blued', s=11.5, bevel=0.5)
    g.grip = (24, 50)
    g.empty('muzzle', 235, BORE)
    g.empty('grip_support', 24, 36, -18)
    g.empty('sight_eye', -260, SIGHT)
