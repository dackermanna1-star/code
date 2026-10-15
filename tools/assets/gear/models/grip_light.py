# Lightweight grip: slim skeletonised vertical grip with lightening cut-outs. Origin = rail contact (top).
from _optics import under_clamp, clamp_screw

OUT = 'attachments'
TEX = 512
META = dict(kind='grip', type='lightweight', mount='bottom rail')


def build(g):
    under_clamp(g, -20, 20, depth=8.0)
    clamp_screw(g, 0, 'xs')
    side = [(-20, -6, 2), (20, -6, 2), (22, -20, 8), (24, -86, 8), (14, -94, 6), (-10, -94, 6), (-18, -86, 6), (-17, -20, 8)]
    holes = [[(-8, -24, 4), (10, -24, 4), (11, -44, 4), (-8, -44, 4)], [(-8, -52, 4), (12, -52, 4), (12, -74, 5), (-9, -74, 5)]]
    g.side('frame', side, 22.0, 'poly', bevel=3.5, bres=2, holes=holes, taper=[(-20, 0.85), (0, 1.0), (24, 0.85)])
    g.empty('grip_support', 2, -55)
    g.set_origin(0, 0)
