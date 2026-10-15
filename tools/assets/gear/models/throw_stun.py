# Stun grenade (M84-style): perforated olive tube with black end caps, fuze/spoon/ring.
# Origin = body centre. +Y = fuze up.
import math
from gkit import rot_u

OUT = 'weapons'
TEX = 512
META = dict(kind='throwable', type='stun')


def build(g):
    from _grenade import fuze
    tube = g.lathe('tube', [(-50, 19.5), (-50, 22.0), (50, 22.0), (50, 19.5)], 'paint_olive', axis='u', segs=48, closed=True)
    cut = []
    for row, u in enumerate((-33, -11, 11, 33)):
        for k in range(6):
            a = k * 60 + (30 if row % 2 else 0)
            cut.append(g.box(f'h{row}_{k}', -6.5, 6.5, u - 7.5, u + 7.5, 14, 'paint_olive', s=21, r=5.0, M=rot_u(a, 0, 0)))
    g.subtract(tube, cut)
    g.lathe('core', [(-50, 0), (-50, 13.5), (50, 13.5), (50, 0)], 'park', axis='u', segs=24)
    for side, (u0, u1) in (('b', (-62, -50)), ('t', (50, 62))):
        prof = [(u0, 0), (u0, 21.0), (u0 + 1.5, 23.2), (u1 - 1.5, 23.2), (u1, 21.5), (u1, 0)]
        g.lathe(f'cap_{side}', prof, 'paint_blk', axis='u', segs=48)
        for k in range(24):
            g.box(f'cap_{side}_r{k}', -1.0, 1.0, u0 + 2.5, u1 - 2.5, 1.6, 'paint_blk!', s=23.4, M=rot_u(k * 15, 0, 0))
    g.lathe('band', [(44, 22.05), (48, 22.05)], 'paint_yel', axis='u', segs=48)
    fuze(g, 62, lambda u: 23.3 if u > 50 else 22.4, 6)
    g.set_origin(0, 0)
