"""FB Beryl M762 -- traced from Commons 'Beryl_M762.png' (foregrip removed)."""
import os
from wkit import *

META = dict(name='Beryl M762', real_length_m=0.943, cycle_node='bolt', mag_kind='box')
REF = os.path.join(os.path.dirname(__file__), '..', 'ref', 'ar_beryl.json')
BORE = 222.0
SIGHT = 288.0
GRIP_R = [(196, 60), (276, 60), (300, 176), (232, 182), (200, 110)]
MAG_R = [(362, 186), (452, 186), (548, -2), (438, -6)]


def build(g):
    S = Sil(REF)
    # stock + buffer tube
    g.side_geom('stock', S.clip((22, 82, 170, 242)), 40, 'poly', bevel=4.5, bres=2, taper=[(22, 1.0), (160, 0.8)])
    g.side_geom('buttpad', S.clip((0, 82, 24, 242)), 44, 'rubber', bevel=5)
    g.lathe('tube', [(150, 0), (150, 13.5), (152, 14.5), (198, 14.5), (200, 13.5), (200, 0)], 'anod', u=197, segs=20)
    # receiver (stamped steel)
    g.side_geom('recv', S.clip((176, 176, 528, 248), minus=[GRIP_R, MAG_R, (296, 140, 360, 172)]), 32, 'park', bevel=2.4, bres=2)
    g.side_geom('mount', S.clip((226, 244, 532, 277)), 26, 'anod', bevel=2.5)
    g.rail('rail_top', 292, 528, 276, 'anod')
    # quad-rail handguard
    g.side_geom('hguard', S.clip((528, 193, 662, 277)), 46, 'anod', bevel=3, bres=2)
    g.rail('rail_hg_top', 534, 656, 276, 'anod')
    g.rail('rail_hg_bot', 540, 652, BORE + 32, 'anod', ang=180, u_c=BORE)
    for sgn in (1, -1):
        g.rail(f'rail_hg_s{sgn}', 540, 652, BORE + 23, 'anod', ang=90 * sgn, u_c=BORE)
    # gas tube, gas block, front sight, barrel, brake
    g.lathe('gastube', [(656, 0), (656, 9.5), (740, 9.5), (746, 8), (746, 0)], 'park', u=247, segs=18)
    g.side_geom('gasblock', S.clip((742, 206, 778, 264)), 26, 'park', bevel=2)
    g.side_geom('fsight', S.clip((786, 198, 832, 300)), 24, 'park', bevel=2)
    g.side('fsight_post', [(806, 270), (810, 270), (809.5, SIGHT), (806.5, SIGHT)], 3, 'park', bevel=0.4)
    g.tube('barrel', 656, 878, 7.6, 'park', u=BORE, r1=7.2, bore=3.0)
    g.lathe('brake', [(870, 4.4), (870, 11.5), (874, 13.2), (938, 13.2), (943, 12), (943, 4.4)], 'park', u=BORE, closed=True, segs=24)
    for i in range(4):
        g.box(f'brake_port{i}', 890 + i * 12, 898 + i * 12, BORE - 4, BORE + 4, 30, 'park!', r=3, bevel=0.6)
    # rear notch sight on the rail
    g.side('rsight', [(298, 285.4), (318, 285.4), (318, SIGHT + 5, 2), (298, SIGHT + 5, 2)], 18, 'anod', bevel=1.2)
    # grip / trigger guard / trigger
    g.side_geom('grip', S.clip(GRIP_R), 30, 'poly', bevel=8, bres=3, taper=[(210, 0.88), (290, 1.0)])
    g.side_geom('guard', S.clip((296, 140, 360, 176)), 10, 'park', bevel=1.2, bres=1)
    g.side('trigger', [(318, 176), (324, 176), (326, 164, 3), (331, 156, 2), (327, 155), (319, 163, 3)], 6, 'park', bevel=1)
    # magazine (polymer 30rd AK)
    mag = S.clip(MAG_R)
    g.side_geom('mag', mag, 27, 'poly', group='mag', bevel=2.6, bres=2)
    from shapely.geometry import LineString, box
    keep = mag.difference(LineString([(430, -10), (556, -4)]).buffer(22)).intersection(box(300, 0, 600, 174))
    g.offset_ribs('mag_rib', mag, [9, 22], 3.2, 29, 'poly', group='mag', keep=keep)
    g.pivot('mag', 406, 182)
    # AK bolt carrier + charging handle (right side) and selector
    g.side('bolt_carrier', [(380, 214), (470, 214), (470, 226), (380, 226)], 5, 'steel', group='bolt', s=17.5, bevel=1)
    g.lathe('bolt_knob', [(0, 0), (0, 4.5), (14, 4.5), (18, 5.8), (23, 5.8), (25, 3.5), (25, 0)], 'steel', group='bolt', f=462, u=220, s=18, axis='s', segs=12)
    g.pivot('bolt', 462, 220, 18)
    g.side('selector', [(268, 226), (380, 232), (380, 240, 2), (268, 236, 3)], 3, 'park', s=17, bevel=0.8)
    for (f, u) in ((262, 205), (300, 205), (440, 205), (470, 205)):
        g.lathe(f'rivet{f}', [(0, 0), (0, 2.6), (1.2, 2.2), (1.6, 0)], 'park', f=f, u=u, s=-16.2, axis='s', segs=8)
    g.grip = (250, 125)
    g.empty('muzzle', 943, BORE)
    g.empty('grip_support', 600, 232)
    g.empty('sight_eye', 160, SIGHT)
    g.empty('rail_top', 420, 285.4)
