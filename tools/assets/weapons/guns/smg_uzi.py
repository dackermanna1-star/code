"""Micro Uzi -- traced from Commons 'Uzimicro.jpg'; folding wire stock (extended) authored from dimensions."""
import os
from wkit import *

META = dict(name='Micro UZI', real_length_m=0.486, cycle_node='bolt', mag_kind='box')
REF = os.path.join(os.path.dirname(__file__), '..', 'ref', 'smg_uzi.json')
BORE = 160.0
SIGHT = 203.0


def build(g):
    S = Sil(REF)
    g.side_geom('recv', S.clip((0, 132, 224, 192.5)), 46, 'park', bevel=3, bres=2)
    g.side_geom('rsight', S.clip((0, 190, 34, 216)), 32, 'park', bevel=2.5)
    g.side_geom('fsight', S.clip((196, 188, 226, 216)), 30, 'park', bevel=2)
    g.side('cover_ridge', [(34, 188), (196, 188), (196, 194, 2), (34, 194, 2)], 30, 'park_light', bevel=2)
    g.side_geom('grip', S.clip((58, 16, 134, 136), minus=[(86, -5, 128, 21)]), 32, 'poly', bevel=6, bres=2)
    g.side_geom('guard', S.clip((128, 82, 192, 136)), 12, 'park', bevel=1.5, bres=1)
    g.side('trigger', [(146, 132), (152, 132), (154, 118, 3), (160, 104, 2), (156, 103), (147, 116, 3)], 6, 'park', bevel=1)
    # magazine (inserted through the grip)
    g.side('mag', [(90, 18), (124, 18), (124, 132), (90, 132)], 22, 'park', group='mag', bevel=1.5)
    g.side('mag_base', [(87, 0, 3), (127, 0, 3), (127, 20), (87, 20)], 28, 'park', group='mag', bevel=2)
    g.pivot('mag', 107, 132)
    # barrel nut + barrel
    g.lathe('nut', [(222, 0), (222, 18), (224, 20), (236, 20), (238, 18), (238, 0)], 'park', u=BORE, segs=28)
    for i in range(14):
        g.box(f'knurl{i}', 224, 236, BORE + 19, BORE + 21, 2.5, 'park', bevel=0.3, M=rot_f(i * 360 / 14, BORE, 0))
    g.tube('barrel', 236, 270, 9.5, 'park', u=BORE, bore=4.5)
    # top cocking knob
    g.side_geom('knob', S.clip((164, 190, 184, 213)), 10, 'park', group='bolt', bevel=2)
    g.pivot('bolt', 174, 196)
    # folding wire stock (extended)
    g.side('stock_hinge', [(-6, 140), (6, 140), (6, 186), (-6, 186)], 50, 'park', bevel=2)
    for sgn in (1, -1):
        g.tube(f'stock_rod_u{sgn}', -200, 0, 3.2, 'park', u=176, s=22 * sgn, segs=12)
        g.tube(f'stock_rod_l{sgn}', -200, 0, 3.2, 'park', u=148, s=22 * sgn, segs=12)
        g.side(f'stock_brace{sgn}', [(-150, 146), (-140, 146), (-60, 176), (-70, 178)], 5, 'park', s=22 * sgn, bevel=1.5)
    g.side('buttplate', [(-212, 112, 6), (-198, 112, 4), (-198, 188, 4), (-212, 188, 6)], 50, 'park', bevel=3)
    g.side('butt_pad', [(-216, 112, 6), (-210, 112), (-210, 188), (-216, 188, 6)], 52, 'rubber', bevel=2.5)
    # grip safety + selector
    g.side('grip_safety', [(58, 66), (64, 66), (66, 122), (60, 122)], 20, 'park', bevel=1.5)
    g.side('selector', [(66, 140), (82, 140, 3), (82, 148, 3), (66, 148)], 3, 'park', s=-24, bevel=0.8)
    g.grip = (95, 82)
    g.empty('muzzle', 270, BORE)
    g.empty('grip_support', 196, 146)
    g.empty('sight_eye', -110, SIGHT)
