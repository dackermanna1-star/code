"""SKS (with detachable box magazine as in PUBG) -- outlines read from Commons 'Simonow_SKS_45_noBG.jpg' (bayonet omitted)."""
from wkit import *

META = dict(name='SKS', real_length_m=1.02, cycle_node='bolt', mag_kind='box')
BORE = 140.0
SIGHT = 182.0


def build(g):
    # one-piece wooden stock: butt, wrist, forend
    stock = [(4, 22, 6), (60, 30), (170, 48, 30), (250, 62, 30), (296, 74, 10), (300, 96), (420, 100), (424, 98), (530, 100, 6), (668, 104, 6),
             (676, 118), (680, 142, 4), (520, 142), (520, 132), (420, 132), (300, 134), (276, 136, 6), (240, 120, 30), (150, 124, 30), (30, 122, 8), (4, 118, 6)]
    g.side('stock', stock, 40, 'wood_red', bevel=9, bres=3, taper=[(4, 0.95), (150, 1.0), (255, 0.78), (330, 0.85), (420, 0.8), (676, 0.7)])
    g.side('buttplate', [(0, 20, 4), (8, 20), (8, 120), (0, 120, 4)], 40, 'blued', bevel=3)
    g.side('upper_hg', [(548, 140), (676, 140), (684, 150), (680, 170, 6), (560, 172, 6), (548, 158)], 30, 'wood_red', bevel=7, bres=2)
    # receiver + top cover + rear sight
    g.side('recv', [(276, 132), (520, 132), (520, 166), (300, 166), (280, 158)], 30, 'blued', bevel=2.5)
    g.side('cover', [(296, 164), (516, 164), (516, 178, 4), (330, 178, 6), (296, 170, 4)], 26, 'blued', bevel=4, bres=2)
    g.side('rsight', [(478, 170), (520, 170), (520, 178), (510, SIGHT + 4, 2), (488, SIGHT + 4, 2), (478, 178)], 20, 'blued', bevel=1.5)
    g.side('rsight_leaf', [(482, SIGHT - 2), (516, SIGHT - 2), (516, SIGHT + 1), (482, SIGHT + 1)], 12, 'blued', bevel=0.5)
    # trigger guard / trigger
    g.side('guard', [(300, 98), (306, 66, 6), (352, 62, 8), (366, 98)], 12, 'blued', bevel=1.5, holes=[[(312, 98), (316, 74, 5), (346, 72, 6), (356, 98)]])
    g.side('trigger', [(326, 100), (332, 100), (334, 88, 3), (339, 80, 2), (335, 79), (327, 87, 3)], 6, 'blued', bevel=1)
    # detachable box magazine
    g.side('mag', [(426, 40, 3), (494, 44, 3), (496, 100), (430, 100)], 26, 'blued', group='mag', bevel=2)
    g.side('mag_base', [(422, 36, 3), (498, 40, 3), (498, 48), (422, 44)], 30, 'blued', group='mag', bevel=1.5)
    g.pivot('mag', 462, 100)
    # gas tube, gas block, barrel, front sight
    g.tube('gastube', 676, 842, 9.0, 'blued', u=160, segs=18)
    g.side('gasblock', [(838, 128), (872, 128), (872, 170, 4), (838, 170, 4)], 24, 'blued', bevel=3)
    g.tube('barrel', 676, 1020, 9.6, 'blued', u=BORE, r1=8.6, bore=3.8)
    g.lathe('fs_band', [(950, 0), (950, 12), (990, 12), (990, 0)], 'blued', u=BORE, segs=24)
    g.side('fsight', [(956, 150), (984, 150), (982, 192, 4), (958, 192, 4)], 18, 'blued', bevel=1.5, holes=[[(962, 160), (978, 160), (978, 186, 3), (962, 186, 3)]])
    g.side('fsight_post', [(968, 150), (972, 150), (971.5, SIGHT), (968.5, SIGHT)], 3, 'blued', bevel=0.4)
    g.lathe('band', [(676, 0), (676, 16), (690, 16), (690, 0)], 'blued', u=150, segs=24)
    # bolt carrier + handle (right side)
    g.side('bolt', [(400, 150), (500, 150), (500, 162), (400, 162)], 8, 'bright', group='bolt', s=12, bevel=1)
    g.lathe('bolt_knob', [(0, 0), (0, 4), (16, 4), (20, 5.5), (26, 5.5), (28, 3), (28, 0)], 'bright', group='bolt', f=494, u=156, s=14, axis='s', segs=12)
    g.pivot('bolt', 494, 156, 14)
    g.lathe('safety', [(0, 0), (0, 3), (6, 3), (6, 0)], 'blued', f=360, u=104, s=-16, axis='s', segs=10)
    g.grip = (255, 92)
    g.empty('muzzle', 1020, BORE)
    g.empty('grip_support', 600, 122)
    g.empty('sight_eye', 230, SIGHT)
    g.empty('rail_top', 390, 178)
