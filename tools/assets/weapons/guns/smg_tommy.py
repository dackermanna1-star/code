"""Thompson M1A1 -- outlines read from Commons 'ThompsonM1A1VWM.jpg' (trace coords rescaled: gun spans 15..800 -> 813 mm)."""
from wkit import *

META = dict(name='Tommy Gun', real_length_m=0.813, cycle_node='bolt', mag_kind='box')
BORE = 336.0
SIGHT = 364.0


def build(g):
    g.set_global(scale=1.036, f0=15.0, u0=145.0)
    # walnut butt stock
    g.side('stock', [(20, 162, 8), (120, 152, 14), (262, 250, 10), (300, 268), (300, 304), (215, 307), (175, 302, 14), (128, 312, 24), (26, 292, 8)],
           40, 'wood', bevel=8, bres=3, taper=[(20, 1.0), (180, 0.9), (290, 0.75)])
    g.side('buttplate', [(15, 162, 3), (22, 160), (24, 294), (15, 294, 3)], 40, 'blued', bevel=3)
    # receiver + trigger frame
    g.side('recv', [(212, 284), (530, 284), (530, 351, 3), (300, 351, 3), (282, 346), (212, 334, 6)], 36, 'park', bevel=3, bres=2)
    g.side('frame', [(290, 266), (388, 266), (388, 282), (452, 282), (452, 288), (290, 288)], 30, 'park', bevel=2.5)
    g.side('recv_top', [(300, 346), (520, 346), (520, 354, 3), (300, 354, 3)], 26, 'park_light', bevel=3)
    # pistol grip (walnut) + trigger guard + trigger
    g.side('grip', [(302, 198, 8), (372, 192, 8), (398, 262), (396, 274), (330, 274), (318, 255, 6)], 32, 'wood', bevel=8, bres=3)
    g.side('guard', [(388, 248, 4), (446, 248, 6), (446, 284), (388, 284)], 12, 'park', bevel=1.5, holes=[[(398, 256, 5), (436, 256, 5), (436, 284), (398, 284)]])
    g.side('trigger', [(408, 283), (414, 283), (416, 272, 3), (421, 262, 2), (417, 261), (409, 271, 3)], 6, 'park', bevel=1)
    # magazine well + stick magazine
    g.side('magwell', [(448, 290), (502, 290), (502, 312), (448, 312)], 32, 'park', bevel=2)
    g.side('mag', [(452, 148, 2), (498, 148, 2), (498, 300), (452, 300)], 24, 'park', group='mag', bevel=1.8)
    for i in range(3):
        g.side(f'mag_rib{i}', [(455, 170 + i * 40), (495, 170 + i * 40), (495, 174 + i * 40), (455, 174 + i * 40)], 25, 'park', group='mag', bevel=0.8)
    g.pivot('mag', 475, 300)
    # horizontal fore-end + barrel + front sight
    g.side('forend', [(555, 302, 6), (700, 304, 8), (706, 318), (700, 334, 4), (555, 334, 4)], 42, 'wood', bevel=8, bres=3)
    g.tube('barrel', 528, 800, 10.5, 'blued', u=BORE, r1=9.8, bore=5.8)
    g.lathe('band', [(778, 0), (778, 12.5), (796, 12.5), (796, 0)], 'park', u=BORE, segs=24)
    g.side('fsight', [(784, BORE + 8), (796, BORE + 8), (794, SIGHT), (788, SIGHT)], 3, 'park', bevel=0.6)
    g.lathe('recv_front', [(528, 0), (528, 16), (540, 16), (544, 13), (544, 0)], 'park', u=BORE, segs=24)
    # rear peep sight with protective ears
    for sgn in (1, -1):
        g.side(f'rs_ear{sgn}', [(228, 350), (292, 350), (284, 372, 6), (240, 372, 6)], 3, 'park', s=8.5 * sgn, bevel=0.8)
    g.side('rs_block', [(236, 350), (276, 350), (276, SIGHT - 4), (236, SIGHT - 4)], 14, 'park', bevel=1.5)
    g.front('rs_plate', [(-6, -6, 2), (6, -6, 2), (6, 6, 2), (-6, 6, 2)], 252, 256, 'park', bevel=0.5, u=SIGHT, holes=[circle(0, 0, 1.5, 10)])
    # cocking knob (right side) + slot
    g.box('ch_slot', 380, 475, BORE - 5, BORE + 5, 2, 'park', s=18.6, r=4, bevel=0.5)
    g.lathe('ch_knob', [(0, 0), (0, 7), (8, 7), (12, 6), (12, 0)], 'park', group='bolt', f=446, u=BORE, s=18, axis='s', segs=14)
    g.pivot('bolt', 446, BORE, 18)
    # selector / safety levers (left)
    g.side('selector', [(328, 296), (350, 298, 3), (350, 306, 3), (326, 304, 3)], 3, 'park', s=-18.6, bevel=0.8)
    g.side('safety', [(402, 296), (424, 298, 3), (424, 306, 3), (400, 304, 3)], 3, 'park', s=-18.6, bevel=0.8)
    g.set_grip(348, 235)
    g.empty('muzzle', 800, BORE)
    g.empty('grip_support', 630, 318)
    g.empty('sight_eye', 130, SIGHT)
