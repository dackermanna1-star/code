"""Sawed-off side-by-side 12-ga (cut-down stock -> pistol grip, ~12" barrels), authored from typical dimensions.
'bolt' = barrels+forend pivoting at the hinge (break action), 'mag' = the two shells in the chambers."""
from wkit import *

META = dict(name='Sawed-off', real_length_m=0.5, cycle_node='bolt', mag_kind='break')
BORE = 112.0
SX = 10.6        # lateral offset of each barrel
HINGE = (186.0, 92.0)


def build(g):
    grip = [(4, 24, 8), (40, 18, 10), (98, 70), (120, 82), (124, 124), (90, 128, 6), (50, 106, 14), (8, 60, 8)]
    g.side('grip', grip, 38, 'wood', bevel=9, bres=3, taper=[(4, 0.85), (60, 0.95), (124, 0.9)])
    g.side('grip_cap', [(2, 22, 6), (12, 18), (14, 62), (4, 64, 6)], 36, 'blued', bevel=2)
    recv = [(118, 82), (186, 84), (192, 90), (192, 126), (176, 130, 6), (130, 128, 10), (118, 122)]
    g.side('recv', recv, 44, 'blued', bevel=3.5, bres=2)
    g.side('toplever', [(122, 124), (156, 127), (156, 133, 2), (124, 132, 3)], 18, 'blued', bevel=2)
    for sgn in (1, -1):
        g.side(f'hammer{sgn}', [(116, 116), (128, 112), (134, 122), (126, 138, 3), (118, 136, 3)], 6, 'blued', s=12 * sgn, bevel=1)
    g.side('guard', [(122, 84), (128, 54, 8), (178, 52, 10), (184, 84)], 12, 'blued', bevel=1.5, holes=[[(134, 84), (138, 62, 6), (172, 60, 7), (174, 84)]])
    g.side('trigger1', [(144, 86), (150, 86), (152, 74, 3), (157, 66, 2), (153, 65), (145, 73, 3)], 5, 'blued', bevel=1)
    g.side('trigger2', [(158, 86), (164, 86), (166, 74, 3), (171, 66, 2), (167, 65), (159, 73, 3)], 5, 'blued', bevel=1)
    # barrels (side by side), rib, forend
    g.side('lumps', [(192, 88), (226, 90), (226, 128), (192, 128)], 42, 'blued', group='bolt', bevel=3)
    for sgn, nm in ((1, 'barrel_r'), (-1, 'barrel_l')):
        g.tube(nm, 226, 500, 11.4, 'blued', group='bolt', u=BORE, s=SX * sgn, bore=9.2, segs=22)
    g.side('rib', [(200, BORE + 6), (500, BORE + 6), (500, BORE + 13), (200, BORE + 13)], 6, 'blued', group='bolt', bevel=1.2)
    g.side('lowrib', [(226, BORE - 10), (500, BORE - 10), (500, BORE - 5), (226, BORE - 5)], 8, 'blued', group='bolt', bevel=1)
    g.side('forend', [(230, 80, 6), (360, 86, 10), (366, 98), (360, 104), (230, 104)], 40, 'wood', group='bolt', bevel=7, bres=3)
    g.pivot('bolt', *HINGE)
    for sgn, nm in ((1, 'shell_r'), (-1, 'shell_l')):
        g.tube(nm, 198, 262, 9.0, 'red_shell', group='mag', u=BORE, s=SX * sgn, segs=16)
        g.lathe(nm + '_head', [(190, 0), (190, 10), (198, 10), (198, 0)], 'brass', group='mag', u=BORE, s=SX * sgn, segs=16)
    g.pivot('mag', 226, BORE)
    g.grip = (72, 80)
    g.empty('muzzle', 500, BORE)
    g.empty('grip_support', 300, 92)
    g.empty('sight_eye', -120, BORE + 18)
