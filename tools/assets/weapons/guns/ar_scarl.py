"""FN SCAR-L (Mk16) -- traced from Commons 'ScarSandiaPix.png' (top rifle). Grid coords (mm): f from butt, u from lowest point."""
import os
from wkit import *

META = dict(name='SCAR-L', real_length_m=0.889, cycle_node='charging_handle', mag_kind='box')
REF = os.path.join(os.path.dirname(__file__), '..', 'ref', 'ar_scarl.json')
BORE = 197.0
RAIL = 235.6     # rail base height (rail top = 245)
SIGHT = 272.0    # iron sight line
GRIP_R = [(228, 28), (298, 28), (324, 96), (300, 132), (284, 134), (228, 62)]


def build(g):
    S = Sil(REF)
    # stock (folding polymer stock) + butt pad + hinge
    g.side_geom('stock', S.clip((14, 60, 246, 246)), 40, 'poly_tan', bevel=5, bres=2, taper=[(14, 0.95), (120, 1.0), (240, 0.85)])
    g.side('butt', [(0, 72), (16, 72), (16, 214), (0, 214)], 44, 'rubber', bevel=3)
    g.side('hinge', [(240, 182), (256, 182), (256, 232), (240, 232)], 46, 'poly', bevel=3)
    # upper receiver (aluminium) + handguard + front sight/gas block
    g.side_geom('upper', S.clip((250, 171, 680, RAIL + 0.6)), 52, 'anod_tan', bevel=3.5, bres=2)
    g.side_geom('fblock', S.clip((676, 178, 728, 244)), 34, 'anod', bevel=3)
    # lower receiver (polymer)
    g.side_geom('lower', S.clip((246, 128, 497, 180), minus=[GRIP_R]), 46, 'poly_tan', bevel=3.5)
    g.side_geom('guard', S.clip((318, 92, 394, 130)), 18, 'poly_tan', bevel=1.5, bres=1)
    g.side_geom('grip', S.clip(GRIP_R), 31, 'poly', bevel=7, bres=3, taper=[(240, 0.88), (310, 1.0)])
    g.side('trigger', [(346, 128), (352, 128), (354, 116, 3), (358, 107, 2), (354, 106), (346, 115, 3)], 6, 'park', bevel=1)
    # magazine (steel STANAG, slight curve)
    g.side_geom('mag', S.clip([(386, 10), (482, 10), (472, 130), (390, 130)]), 23, 'anod', group='mag', bevel=2.2)
    g.side('mag_plate', [(404, 13), (478, 13), (480, 22, 2), (402, 22, 2)], 28, 'poly', group='mag', bevel=2)
    g.pivot('mag', 432, 130)
    # rails
    g.rail('rail_top', 252, 678, RAIL, 'anod')
    g.rail('rail_bot', 560, 676, BORE + 25, 'anod', ang=180, u_c=BORE)
    for sgn in (1, -1):
        g.rail(f'rail_s{"r" if sgn > 0 else "l"}', 604, 676, BORE + 26, 'anod', ang=90 * sgn, u_c=BORE)
    # barrel + flash hider
    g.tube('barrel', 724, 842, 7.2, 'park', u=BORE, r1=6.8, bore=3.0)
    g.lathe('flash', [(838, 4.6), (838, 9.4), (841, 10.2), (884, 10.2), (889, 9.4), (889, 4.6)], 'park', u=BORE, closed=True, segs=24)
    for i in range(3):
        g.side(f'fslot{i}', [(860, -1.2), (888, -1.2), (888, 1.2), (860, 1.2)], 2.4, 'park', bevel=0.2,
               M=rot_f(60 + 120 * i, BORE, 0) @ T(0, BORE + 9.6, 0))
    # flip-up iron sights
    rt = RAIL + 9.4
    g.side('rsight_base', [(258, rt), (286, rt), (286, rt + 7, 2), (258, rt + 7, 2)], 22, 'anod', bevel=1.5)
    g.side('rsight', [(266, rt + 6), (282, rt + 6), (280, SIGHT + 9, 4), (268, SIGHT + 9, 4)], 9, 'anod', bevel=1.4)
    g.front('rsight_ring', [(-6.5, -6.5, 3), (6.5, -6.5, 3), (6.5, 6.5, 3), (-6.5, 6.5, 3)], 271, 277, 'anod', bevel=0.8, u=SIGHT,
            holes=[circle(0, 0, 1.7, 10)])
    g.side('fsight_base', [(684, rt - 2), (712, rt - 2), (712, rt + 8, 3), (684, rt + 8, 3)], 24, 'anod', bevel=1.5)
    for sgn in (1, -1):
        g.side(f'fsight_ear{sgn}', [(688, rt + 6), (708, rt + 6), (705, SIGHT + 16, 3), (692, SIGHT + 16, 3)], 3, 'anod', s=9 * sgn, bevel=0.8)
    g.side('fsight_post', [(696, rt + 6), (700, rt + 6), (699.5, SIGHT), (696.5, SIGHT)], 2.6, 'anod', bevel=0.4)
    # charging handle (left side) + slot
    g.box('ch_slot', 470, 600, 201, 211, 2, 'anod', s=-26.5, r=4, bevel=0.6)
    g.side('ch_handle', [(514, 201), (528, 201), (530, 211, 2), (512, 211, 2)], 8, 'park', group='charging_handle', s=-30, bevel=1.5)
    g.lathe('ch_knob', [(0, 0), (0, 5.5), (-12, 5.5), (-16, 4), (-16, 0)], 'park', group='charging_handle', f=521, u=206, s=-32, axis='s', segs=14)
    g.pivot('charging_handle', 521, 206, -30)
    # ejection port, controls, pins
    g.box('eject', 330, 400, 188, 210, 1.6, 'park', s=26.4, r=2, bevel=0.5)
    g.box('fwd_assist', 404, 420, 190, 206, 3, 'anod', s=26.5, r=3, bevel=0.8)
    g.side('selector', [(296, 150), (320, 152, 2), (320, 160, 2), (294, 158, 3)], 3, 'park', s=-23.6, bevel=0.8)
    g.side('mag_release', [(378, 136), (388, 136), (388, 148), (378, 148)], 3, 'park', s=23.6, bevel=0.8)
    for i, f in enumerate((300, 360, 470)):
        g.lathe(f'pin{i}', [(0, 0), (0, 3.5), (2, 3.5), (2, 0)], 'park', f=f, u=158, s=-23.4, axis='s', segs=10)
    # named points
    g.grip = (287, 90)
    g.empty('muzzle', 889, BORE)
    g.empty('grip_support', 600, 194)
    g.empty('sight_eye', 185, SIGHT)
    g.empty('rail_top', 350, RAIL + 9.4)
