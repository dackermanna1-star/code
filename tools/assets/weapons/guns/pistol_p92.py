"""Beretta 92FS ('P92') -- outline read from Commons 'Beretta-92FS.jpg' grid (217 mm), authored as clean polygons."""
from wkit import *

META = dict(name='P92', real_length_m=0.217, cycle_node='slide', mag_kind='box')
BORE = 128.0
SIGHT = 145.5


def build(g):
    # slide (open-top Beretta slide simplified) + barrel
    slide = [(16, 119), (150, 119), (152, 101, 2), (205, 101, 3), (206, 139, 3), (40, 141, 3), (28, 139), (16, 131, 2)]
    g.side('slide', slide, 26, 'blued', group='slide', bevel=2.2, bres=2)
    for i in range(9):
        g.box(f'serr{i}', 48 + i * 4.2, 50 + i * 4.2, 121, 136, 26.8, 'blued', group='slide', bevel=0.4)
    g.box('barrel_top', 84, 150, 136, 140, 14, 'bright', group='slide', bevel=0.8)
    g.side('decocker', [(28, 124), (46, 124, 2), (46, 134, 3), (28, 132, 3)], 3, 'blued', group='slide', s=-14, bevel=0.8)
    g.side('rsight', [(28, 140), (42, 140), (42, SIGHT + 1), (28, SIGHT + 1)], 16, 'blued', group='slide', bevel=0.8)
    g.side('fsight', [(194, 140), (202, 140), (201, SIGHT + 1), (196, SIGHT + 1)], 3.5, 'blued', group='slide', bevel=0.5)
    g.tube('barrel', 200, 216, 7.6, 'blued', u=BORE, bore=4.6, segs=20)
    g.pivot('slide', 110, 128)
    # frame: dust cover, trigger guard, grip, beavertail
    frame = [(14, 4), (58, 4), (60, 40), (64, 70), (70, 100), (150, 100), (150, 119), (16, 119), (4, 113, 4), (10, 104), (6, 70, 10), (10, 22, 8)]
    g.side('frame', frame, 22, 'blued', bevel=2.2, bres=2)
    g.side('guard', [(66, 101), (66, 72, 12), (80, 60, 10), (120, 60, 10), (127, 74, 8), (128, 101)], 12, 'blued', bevel=1.5,
           holes=[[(76, 100), (75, 76, 10), (86, 67, 8), (114, 67, 8), (120, 77, 6), (120, 100)]])
    g.side('grips', [(14, 10), (54, 10), (58, 50), (62, 92), (18, 108, 4), (12, 70, 10), (12, 22, 6)], 32, 'poly', bevel=3.5, bres=2)
    for sgn in (1, -1):
        g.lathe(f'gscrew{sgn}', [(0, 0), (0, 3.5), (1.2, 3.2), (1.6, 0)], 'bright', f=36, u=24, s=16 * sgn, axis='s', segs=10)
        g.lathe(f'gscrew2{sgn}', [(0, 0), (0, 3.5), (1.2, 3.2), (1.6, 0)], 'bright', f=46, u=92, s=16 * sgn, axis='s', segs=10)
    g.side('hammer', [(8, 116), (18, 116), (20, 132, 2), (12, 140, 3), (6, 136)], 8, 'blued', bevel=1.2)
    g.side('trigger', [(94, 99), (100, 99), (102, 84, 3), (107, 72, 2), (103, 71), (95, 84, 3)], 6, 'blued', bevel=1)
    g.side('takedown', [(118, 104), (132, 104, 2), (132, 110, 2), (118, 110, 2)], 2, 'bright', s=-11.5, bevel=0.5)
    g.lathe('magrel', [(0, 0), (0, 5), (3, 5), (3, 0)], 'blued', f=64, u=84, s=-11, axis='s', segs=12)
    # magazine (base visible, body inside the grip)
    g.side('mag', [(16, 6), (52, 6), (62, 100), (26, 102)], 18, 'park', group='mag', bevel=1.2)
    g.side('mag_base', [(12, 0, 2), (60, 0, 2), (60, 7), (12, 7)], 26, 'poly', group='mag', bevel=1.5)
    g.pivot('mag', 36, 7)
    g.grip = (36, 60)
    g.empty('muzzle', 216, BORE)
    g.empty('grip_support', 36, 40, -18)
    g.empty('sight_eye', -260, SIGHT)
