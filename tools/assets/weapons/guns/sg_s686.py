"""Beretta 686-style over/under 12-ga shotgun ('S686'), authored from published dimensions (28" barrels, ~1130 mm).
'bolt' = barrel assembly + forend, pivoting at the hinge pin (break action); 'mag' = the two shells in the chambers."""
from wkit import *

META = dict(name='S686', real_length_m=1.13, cycle_node='bolt', mag_kind='break')
UP = 130.0      # upper barrel axis
LO = 108.0      # lower barrel axis
SIGHT = 146.0
HINGE = (430.0, 98.0)


def build(g):
    stock = [(4, -10, 6), (60, 4), (250, 60, 14), (300, 74, 10), (360, 84), (366, 132), (300, 136, 6), (230, 130, 26), (60, 126), (6, 122, 6)]
    g.side('stock', stock, 40, 'wood_red', bevel=9, bres=3, taper=[(4, 0.95), (150, 1.0), (285, 0.74), (366, 0.82)])
    g.side('buttpad', [(-14, -12, 4), (6, -12), (6, 124), (-14, 124, 4)], 42, 'rubber', bevel=3)
    # boxlock receiver (bright steel with engraving-like noise)
    recv = [(360, 84), (430, 86), (436, 92), (436, 142), (420, 146, 6), (372, 144, 10), (360, 136)]
    g.side('recv', recv, 40, 'bright', bevel=3.5, bres=2)
    g.side('toplever', [(364, 140), (398, 142), (398, 148, 2), (366, 148, 3)], 16, 'blued', bevel=2)
    g.side('safety', [(376, 145), (390, 145), (390, 150, 2), (376, 150, 2)], 8, 'blued', bevel=1)
    g.side('guard', [(366, 86), (372, 58, 8), (418, 56, 10), (424, 86)], 12, 'blued', bevel=1.5, holes=[[(378, 86), (382, 66, 6), (412, 64, 7), (414, 86)]])
    g.side('trigger', [(392, 88), (398, 88), (400, 76, 3), (405, 68, 2), (401, 67), (393, 75, 3)], 6, 'blued', bevel=1)
    # barrels + monoblock + rib + side ribs + forend (all part of 'bolt')
    g.side('monoblock', [(436, 92), (480, 94), (480, 144), (436, 144)], 36, 'blued', group='bolt', bevel=3)
    g.tube('barrel_up', 480, 1130, 11.4, 'blued', group='bolt', u=UP, r1=10.4, bore=9.2)
    g.tube('barrel_lo', 480, 1128, 11.4, 'blued', group='bolt', u=LO, r1=10.4, bore=9.2)
    g.side('siderib', [(480, LO + 6), (1124, LO + 7), (1124, UP - 7), (480, UP - 6)], 14, 'blued', group='bolt', bevel=1.2)
    g.side('toprib', [(450, UP + 10), (1128, UP + 9), (1128, UP + 14), (450, UP + 15)], 8, 'blued', group='bolt', bevel=1)
    g.lathe('bead', [(0, 0), (0, 2.0), (2.8, 1.8), (4, 0)], 'brass', group='bolt', f=1120, u=UP + 14, axis='u', segs=12)
    g.side('forend', [(484, 82, 6), (720, 88, 10), (728, 104), (720, 118), (484, 118)], 44, 'wood_red', group='bolt', bevel=8, bres=3,
           taper=[(484, 0.95), (720, 0.88)])
    g.pivot('bolt', *HINGE)
    # shells in the chambers ('mag')
    for nm, u in (('shell_up', UP), ('shell_lo', LO)):
        g.tube(nm, 448, 520, 9.0, 'red_shell', group='mag', u=u, segs=16)
        g.lathe(nm + '_head', [(438, 0), (438, 10), (448, 10), (448, 0)], 'brass', group='mag', u=u, segs=16)
    g.pivot('mag', 470, (UP + LO) / 2)
    g.grip = (330, 104)
    g.empty('muzzle', 1130, UP)
    g.empty('grip_support', 620, 100)
    g.empty('sight_eye', 170, SIGHT)
