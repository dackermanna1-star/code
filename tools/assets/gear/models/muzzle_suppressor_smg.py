# 9 mm / .45 SMG suppressor (36 mm can, 184 mm) with a fluted booster housing and knurled front cap.
from _muzzle import ribs

OUT = 'attachments'
TEX = 512
META = dict(kind='muzzle', type='suppressor', fits='SMG', length_m=0.184)


def build(g):
    prof = [(16, 0), (16, 6.6), (0, 6.6), (0, 14.0), (1, 16.0), (40, 16.0), (44, 18.0), (178, 18.0), (182, 16.6), (184, 13.0),
            (184, 5.0), (170, 5.0), (170, 0)]
    g.lathe('can', prof, 'anod', segs=48)
    ribs(g, 4, 38, 16.0, 'flute', n=12, kind='anod', depth=1.4, width=3.2)
    ribs(g, 168, 180, 18.0, 'cap', n=36, kind='anod', depth=0.7, width=1.4)
    for f0 in (52, 164):
        g.lathe(f'seam{f0}', [(f0, 18.0), (f0 + 0.5, 17.4), (f0 + 1.0, 18.0)], 'anod!', segs=48)
    g.empty('muzzle', 184, 0)
    g.set_origin(0, 0)
