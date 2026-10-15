"""AKM -- traced from Commons 'AKM automatkarbin Ryssland - 7,62x39mm - Armémuseum (noBG)'. Wood furniture, stamped receiver."""
import os
from wkit import *

META = dict(name='AKM', real_length_m=0.88, cycle_node='bolt', mag_kind='box')
REF = os.path.join(os.path.dirname(__file__), '..', 'ref', 'ar_akm.json')
BORE = 192.0
SIGHT = 235.0
GRIP_R = [(232, 56), (290, 56), (306, 168), (248, 168), (226, 80)]
MAG_R = [(360, 160), (428, 160), (520, 46), (480, -2), (400, 60)]


def build(g):
    S = Sil(REF)
    g.side_geom('stock', S.clip((6, 92, 236, 202)), 40, 'wood_red', bevel=8, bres=3, taper=[(6, 1.0), (120, 0.92), (236, 0.72)])
    g.side_geom('buttplate', S.clip((0, 92, 8, 192)), 40, 'park', bevel=3)
    # stamped receiver + trunnion + rear sight block
    g.side_geom('recv', S.clip((232, 160, 500, 232), minus=[GRIP_R, MAG_R, (300, 126, 370, 160)]), 30, 'park', bevel=2.5, bres=2)
    g.side('cover', [(240, 214), (452, 214), (458, 220), (452, 230, 4), (262, 230, 6), (240, 220)], 26, 'park_light', bevel=4, bres=2)
    g.side_geom('rs_block', S.clip((452, 214, 500, 244)), 28, 'park', bevel=2)
    g.side('rs_leaf', [(462, 230), (500, 231), (500, SIGHT), (462, SIGHT - 3)], 18, 'park', bevel=1)
    # wooden lower handguard + upper gas-tube cover
    g.side_geom('hguard', S.clip((486, 162, 650, 210)), 46, 'wood_red', bevel=7, bres=3, taper=[(486, 0.9), (560, 1.0), (650, 0.92)])
    g.side_geom('uhguard', S.clip((534, 208, 650, 238)), 34, 'wood_red', bevel=6, bres=2)
    g.lathe('gastube', [(650, 0), (650, 10), (720, 10), (726, 8), (726, 0)], 'park', u=222, segs=18)
    g.side_geom('gasblock', S.clip((716, 186, 760, 232)), 26, 'park', bevel=2.5)
    # barrel + front sight + slant brake
    g.tube('barrel', 640, 862, 8.4, 'park', u=BORE, r1=7.8, bore=3.0)
    g.side_geom('fsight', S.clip((812, 172, 842, 246)), 18, 'park', bevel=2)
    g.side('fs_post', [(826, 226), (830, 226), (829.5, SIGHT), (826.5, SIGHT)], 3, 'park', bevel=0.4)
    g.lathe('brake', [(840, 4.5), (840, 9.8), (842, 10.8), (872, 10.8), (880, 9), (880, 4.5)], 'park', u=BORE, closed=True, segs=24)
    g.tube('rod', 650, 850, 3.0, 'steel', u=180, segs=10)
    # grip, guard, trigger
    g.side_geom('grip', S.clip(GRIP_R), 30, 'wood_red', bevel=8, bres=3, taper=[(236, 0.88), (300, 1.0)])
    g.side_geom('guard', S.clip((296, 126, 366, 162)), 10, 'park', bevel=1.3, bres=1)
    g.side('trigger', [(322, 160), (328, 160), (330, 148, 3), (335, 140, 2), (331, 139), (323, 147, 3)], 6, 'park', bevel=1)
    # curved 30-rd steel magazine
    g.side_geom('mag', S.clip(MAG_R), 27, 'park', group='mag', bevel=2.5, bres=2)
    g.pivot('mag', 394, 160)
    # bolt carrier + charging handle (right) + safety lever (right)
    g.side('bolt_carrier', [(380, 202), (452, 202), (452, 214), (380, 214)], 5, 'steel', group='bolt', s=15.5, bevel=1)
    g.lathe('bolt_knob', [(0, 0), (0, 4.5), (14, 4.5), (18, 5.8), (23, 5.8), (25, 3.5), (25, 0)], 'steel', group='bolt', f=446, u=208, s=16, axis='s', segs=12)
    g.pivot('bolt', 446, 208, 16)
    g.side('safety', [(268, 196), (384, 200), (384, 210, 2), (268, 206, 3)], 3, 'park', s=15.5, bevel=0.8)
    for (f, u) in ((262, 184), (300, 184), (420, 184), (440, 184)):
        g.lathe(f'rivet{f}', [(0, 0), (0, 2.6), (1.2, 2.2), (1.6, 0)], 'park', f=f, u=u, s=-15, axis='s', segs=8)
    g.grip = (262, 112)
    g.empty('muzzle', 880, BORE)
    g.empty('grip_support', 580, 182)
    g.empty('sight_eye', 160, SIGHT)
    g.empty('rail_top', 380, 232)
