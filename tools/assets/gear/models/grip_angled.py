# Angled foregrip (AFG-style ramp) clamped under the rail. Origin = rail contact (top), grip_support = palm.
from _optics import under_clamp, clamp_screw

OUT = 'attachments'
TEX = 512
META = dict(kind='grip', type='angled', mount='bottom rail')


def build(g):
    under_clamp(g, -40, 34)
    clamp_screw(g, -12, 'xs')
    side = [(-58, -3, 4), (40, -3, 2), (58, -8, 8), (62, -22, 10), (52, -40, 9), (40, -42, 6), (26, -34, 10), (-20, -18, 30), (-58, -12, 6)]
    g.side('ramp', side, 30.0, 'poly', bevel=6.0, bres=3, taper=[(-58, 0.8), (0, 1.0), (60, 0.9)])
    g.empty('grip_support', 0, -28)
    g.set_origin(0, 0)
