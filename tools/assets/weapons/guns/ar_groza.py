"""OTs-14 Groza -- traced from Commons 'GrozaOC14_noBG.png'."""
import os
from wkit import *

META = dict(name='Groza', real_length_m=0.61, cycle_node='bolt', mag_kind='box')
REF = os.path.join(os.path.dirname(__file__), '..', 'ref', 'ar_groza.json')
BORE = 172.0
SIGHT = 249.0
GRIP_R = [(318, 28), (400, 28), (408, 140), (334, 140)]
MAG_R = [(185, 0), (295, 0), (282, 128), (192, 128)]


def build(g):
    S = Sil(REF)
    g.side_geom('butt', S.clip((0, 88, 22, 222)), 38, 'rubber', bevel=4)
    g.side_geom('recv', S.clip((18, 126, 470, 209), minus=[MAG_R, GRIP_R, (396, 90, 470, 134)]), 38, 'park', bevel=3, bres=2)
    g.side('recv_cover', [(24, 196), (300, 196), (300, 207, 3), (40, 207, 6)], 30, 'park_light', bevel=3)
    g.side_geom('handle', S.clip((286, 206, 476, 258)), 20, 'park', bevel=2.5, bres=2)
    g.lathe('gas', [(318, 0), (318, 7.5), (320, 9.5), (438, 9.5), (440, 7.5), (440, 0)], 'steel', u=200, segs=20)
    g.side_geom('front', S.clip((466, 136, 612, 194), minus=[(512, 30, 570, 140)]), 40, 'poly', bevel=4, bres=2)
    g.side_geom('foregrip', S.clip((512, 38, 570, 142)), 34, 'poly', bevel=8, bres=3)
    g.side_geom('grip', S.clip(GRIP_R), 30, 'poly', bevel=8, bres=3, taper=[(320, 0.9), (400, 1.0)])
    g.side_geom('guard', S.clip((398, 98, 466, 134)), 10, 'park', bevel=1.2, bres=1)
    g.side('trigger', [(412, 130), (418, 130), (420, 118, 3), (425, 110, 2), (421, 109), (413, 117, 3)], 6, 'park', bevel=1)
    # magazine (bakelite-style AK 30rd)
    g.side_geom('mag', S.clip(MAG_R), 26, 'bakelite', group='mag', bevel=2.5, bres=2)
    for i in range(5):
        u = 108 - i * 20
        g.side(f'mag_rib{i}', [(206 + i * 2.2, u), (262 + i * 3.2, u), (262 + i * 3.2, u + 6, 2), (206 + i * 2.2, u + 6, 2)], 28, 'bakelite', group='mag', bevel=1.5)
    g.pivot('mag', 238, 128)
    # muzzle (short barrel w/ thread) protruding from handguard
    g.tube('barrel', 606, 614, 9.0, 'park', u=BORE, bore=4.2)
    # top rail on carry handle + sights
    g.rail('rail_top', 312, 448, 252.5, 'anod')
    g.side('fsight', [(452, 230), (470, 230), (468, SIGHT + 6, 3), (454, SIGHT + 6, 3)], 6, 'park', bevel=1)
    g.side('rsight', [(290, 245), (306, 245), (306, SIGHT + 4, 2), (290, SIGHT + 4, 2)], 14, 'park', bevel=1,)
    # AK-style charging handle (right side)
    g.side('bolt_carrier', [(250, 184), (330, 184), (330, 194), (250, 194)], 6, 'steel', group='bolt', s=19, bevel=1)
    g.lathe('bolt_knob', [(0, 0), (0, 4.5), (14, 4.5), (18, 5.5), (22, 5.5), (24, 3.5), (24, 0)], 'steel', group='bolt', f=322, u=189, s=21, axis='s', segs=12)
    g.pivot('bolt', 322, 189, 21)
    g.box('selector', 180, 300, 168, 176, 3, 'park', s=-19.5, r=2, bevel=0.8)
    for (f, u) in ((120, 160), (140, 160), (330, 160), (360, 160)):
        g.lathe(f'rivet{f}', [(0, 0), (0, 2.6), (1.2, 2.2), (1.6, 0)], 'park', f=f, u=u, s=-19, axis='s', segs=8)
    g.grip = (366, 90)
    g.empty('muzzle', 614, BORE)
    g.empty('grip_support', 540, 95)
    g.empty('sight_eye', 200, SIGHT)
    g.empty('rail_top', 380, 261.9)
