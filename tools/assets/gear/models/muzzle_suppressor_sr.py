# .30-cal sniper suppressor (46 mm can, 231 mm), tan cerakote tube on a black QD brake-mount collar.
from _muzzle import ribs

OUT = 'attachments'
TEX = 512
META = dict(kind='muzzle', type='suppressor', fits='SR/DMR', length_m=0.231)


def build(g):
    g.lathe('collar', [(18, 0), (18, 8.0), (0, 8.0), (0, 16.0), (1.5, 17.5), (44, 17.5), (44, 0)], 'park', segs=48)
    ribs(g, 6, 34, 17.5, 'ratchet', n=28, kind='park', depth=1.0)
    can = g.lathe('can', [(40, 0), (40, 19.0), (48, 23.0), (222, 23.0), (226, 22.0), (230, 19.0), (231, 16.0), (231, 5.8),
                          (214, 5.8), (214, 0)], 'anod_tan', segs=56)
    cutters = [g.box('flat_l', 214, 232, -30, 30, 20, 'anod_tan', s=-30.5), g.box('flat_r', 214, 232, -30, 30, 20, 'anod_tan', s=30.5)]
    g.subtract(can, cutters)
    for f0 in (60, 200):
        g.lathe(f'seam{f0}', [(f0, 23.0), (f0 + 0.6, 22.3), (f0 + 1.2, 23.0)], 'anod_tan!', segs=56)
    g.empty('muzzle', 231, 0)
    g.set_origin(0, 0)
