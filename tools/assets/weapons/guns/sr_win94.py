"""Winchester Model 1894 carbine -- traced from Commons 'Winchester-94-32spl_noBG.png'.
'bolt' = finger lever (pivot at the lever hinge pin); 'mag' = side loading gate."""
import os
from wkit import *

META = dict(name='Win94', real_length_m=0.965, cycle_node='bolt', mag_kind='tube')
REF = os.path.join(os.path.dirname(__file__), '..', 'ref', 'sr_win94.json')
BORE = 161.0
TUBE = 140.0
SIGHT = 182.0


def build(g):
    S = Sil(REF)
    stock = S.clip([(-5, -5), (330, -5), (330, 112), (322, 150), (300, 180), (-5, 180)], minus=[(240, 40, 340, 112)])
    g.side_geom('stock', stock, 40, 'wood', bevel=9, bres=3, taper=[(0, 0.92), (150, 1.0), (300, 0.78), (330, 0.8)])
    g.side('buttplate', [(-4, 0, 3), (6, 0), (12, 125), (2, 127, 3)], 40, 'blued', bevel=2.5)
    # receiver (case-hardened/blued steel)
    g.side_geom('recv', S.clip((318, 104, 482, 180), minus=[(240, 40, 345, 104)]), 30, 'blued', bevel=3, bres=2)
    g.side('hammer', [(312, 166), (326, 160), (334, 168), (322, 182, 2), (316, 184, 2)], 8, 'blued', bevel=1.2)
    g.box('eject', 360, 452, 176, 180, 14, 'bright!', bevel=0.8)
    # lever ('bolt') + trigger
    lever = S.clip([(240, 40), (345, 40), (370, 106), (300, 116), (240, 90)])
    g.side_geom('lever', lever, 11, 'blued', group='bolt', bevel=2, bres=2)
    g.pivot('bolt', 350, 108)
    g.side('trigger', [(340, 112), (346, 112), (348, 98, 3), (352, 90, 2), (348, 89), (341, 97, 3)], 6, 'blued', bevel=1)
    # loading gate (right side) = 'mag'
    g.side('gate', [(404, 112, 3), (446, 112, 3), (446, 132, 4), (404, 132, 4)], 2.4, 'blued', group='mag', s=15.4, bevel=0.7)
    g.pivot('mag', 446, 122, 15.4)
    # forend (walnut), band, barrel, magazine tube, nose cap, sights
    g.side_geom('forend', S.clip((478, 122, 650, 180)), 38, 'wood', bevel=8, bres=3, taper=[(478, 1.0), (650, 0.86)])
    g.lathe('band', [(644, 0), (644, 18), (660, 18), (660, 0)], 'blued', u=152, segs=24)
    g.tube('barrel', 478, 965, 9.8, 'blued', u=BORE, r1=8.6, bore=3.8)
    g.tube('magtube', 640, 945, 9.2, 'blued', u=TUBE, segs=20)
    g.lathe('nosecap', [(886, 0), (886, 11), (890, 12), (938, 12), (944, 11), (944, 0)], 'blued', u=TUBE, segs=20)
    g.side('cap_link', [(886, TUBE), (944, TUBE), (944, BORE), (886, BORE)], 16, 'blued', bevel=2)
    g.side('fs', [(926, BORE + 6), (950, BORE + 6), (946, SIGHT - 3, 3), (932, SIGHT - 3, 3)], 6, 'blued', bevel=1)
    g.side('fs_blade', [(936, BORE + 8), (940, BORE + 8), (939.5, SIGHT), (936.5, SIGHT)], 2.5, 'brass', bevel=0.4)
    g.side('rs', [(508, BORE + 6), (532, BORE + 6), (532, SIGHT + 3, 2), (508, SIGHT + 3, 2)], 14, 'blued', bevel=1,
           holes=[[(518, SIGHT - 4), (522, SIGHT - 4), (522, SIGHT + 4), (518, SIGHT + 4)]])
    # saddle ring + screws
    g.lathe('ring', [(0, 6), (0, 8), (2, 8), (2, 6)], 'blued', f=400, u=126, s=-16, axis='s', segs=14)
    for f, u in ((340, 140), (440, 150)):
        g.lathe(f'screw{f}', [(0, 0), (0, 3.2), (1.5, 3.0), (1.6, 0)], 'bright', f=f, u=u, s=-15, axis='s', segs=10)
    g.grip = (300, 112)
    g.empty('muzzle', 965, BORE)
    g.empty('grip_support', 560, 140)
    g.empty('sight_eye', 200, SIGHT)
    g.empty('rail_top', 400, 180)
