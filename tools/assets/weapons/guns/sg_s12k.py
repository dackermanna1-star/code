"""Saiga-12K ('S12K') -- traced from Commons 'Сайга_12К_исп.030.jpg'."""
import os
from wkit import *

META = dict(name='S12K', real_length_m=1.0, cycle_node='bolt', mag_kind='box')
REF = os.path.join(os.path.dirname(__file__), '..', 'ref', 'sg_s12k.json')
BORE = 240.0
SIGHT = 300.0
GRIP_R = [(232, 104), (300, 104), (330, 210), (262, 216), (240, 160)]
MAG_R = [(410, 214), (532, 214), (592, 40), (520, -4), (440, 150)]


def build(g):
    S = Sil(REF, smooth=2)
    g.tol = 1.2
    g.side_geom('stock', S.clip((0, 150, 256, 262)), 42, 'poly', bevel=7, bres=2, taper=[(0, 1.0), (180, 0.88), (256, 0.7)])
    g.side_geom('recv', S.clip((250, 200, 580, 302), minus=[GRIP_R, MAG_R, (330, 176, 410, 214)]), 34, 'park', bevel=2.6, bres=2)
    g.side('cover', [(296, 268), (560, 272), (566, 282), (560, 298, 4), (318, 296, 6), (296, 282)], 30, 'park_light', bevel=4, bres=2)
    g.side_geom('grip', S.clip(GRIP_R), 31, 'poly', bevel=8, bres=3)
    g.side_geom('guard', S.clip((330, 176, 410, 214)), 12, 'park', bevel=1.4, bres=1)
    g.side('trigger', [(354, 214), (360, 214), (362, 202, 3), (367, 194, 2), (363, 193), (355, 201, 3)], 6, 'park', bevel=1)
    g.side_geom('mag', S.clip(MAG_R), 40, 'poly', group='mag', bevel=4, bres=2)
    g.pivot('mag', 462, 210)
    # polymer handguard (lower + upper), gas block, front sight, barrel, choke
    g.side_geom('hguard', S.clip((570, 214, 712, 300)), 50, 'poly', bevel=6, bres=2, taper=[(570, 1.0), (712, 0.9)])
    g.side_geom('gasblock', S.clip((706, 216, 762, 290)), 34, 'park', bevel=3)
    g.side_geom('fsight', S.clip((746, 254, 774, 306)), 18, 'park', bevel=2)
    g.side('fs_post', [(758, 286), (762, 286), (761.5, SIGHT), (758.5, SIGHT)], 3, 'park', bevel=0.4)
    g.tube('barrel', 700, 990, 13.5, 'park', u=BORE, r1=13.5, bore=9.0)
    g.lathe('choke', [(954, 9.5), (954, 14.6), (956, 15.4), (994, 15.4), (1000, 14.4), (1000, 9.5)], 'park', u=BORE, closed=True, segs=24)
    g.tube('gastube', 700, 740, 10, 'park', u=268, segs=16)
    # rear sight block + leaf
    g.side('rs_block', [(560, 286), (600, 286), (600, 298), (560, 298)], 30, 'park', bevel=2)
    g.side('rs_leaf', [(566, 296), (600, 296), (600, SIGHT), (566, SIGHT - 3)], 18, 'park', bevel=1)
    # bolt carrier + charging handle (right), safety
    g.side('bolt_carrier', [(470, 254), (560, 254), (560, 266), (470, 266)], 5, 'steel', group='bolt', s=17.5, bevel=1)
    g.lathe('bolt_knob', [(0, 0), (0, 4.5), (14, 4.5), (18, 6), (24, 6), (26, 3.5), (26, 0)], 'steel', group='bolt', f=552, u=260, s=18, axis='s', segs=12)
    g.pivot('bolt', 552, 260, 18)
    g.side('safety', [(300, 236), (440, 240), (440, 250, 2), (300, 246, 3)], 3, 'park', s=17.5, bevel=0.8)
    for (f, u) in ((300, 226), (338, 226), (520, 226), (540, 226)):
        g.lathe(f'rivet{f}', [(0, 0), (0, 2.6), (1.2, 2.2), (1.6, 0)], 'park', f=f, u=u, s=-17, axis='s', segs=8)
    g.grip = (276, 160)
    g.empty('muzzle', 1000, BORE)
    g.empty('grip_support', 640, 222)
    g.empty('sight_eye', 180, SIGHT)
    g.empty('rail_top', 440, 298)
