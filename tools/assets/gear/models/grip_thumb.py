# Thumb grip: low stub with a scooped thumb shelf at the rear. Origin = rail contact (top).
from _optics import under_clamp, clamp_screw

OUT = 'attachments'
TEX = 512
META = dict(kind='grip', type='thumb', mount='bottom rail')


def build(g):
    under_clamp(g, -26, 26)
    clamp_screw(g, 0, 'xs')
    side = [(-34, -5, 2), (30, -5, 3), (34, -12, 6), (26, -30, 9), (12, -34, 7), (-2, -26, 12), (-16, -18, 6), (-34, -16, 4)]
    g.side('stub', side, 25.0, 'poly', bevel=5.0, bres=3)
    g.empty('grip_support', 6, -18)
    g.set_origin(0, 0)
