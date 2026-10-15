# 5.56 mm rifle suppressor (38 mm can, 175 mm) with a knurled lock collar. Origin = rear face on the bore axis.
from _muzzle import ribs

OUT = 'attachments'
TEX = 512
META = dict(kind='muzzle', type='suppressor', fits='AR', length_m=0.174)


def build(g):
    prof = [(14, 0), (14, 7.2), (0, 7.2), (0, 13.5), (1, 14.6), (24, 14.6), (26, 16.0), (31, 19.0), (166, 19.0), (170, 18.2),
            (173, 15.8), (174, 13.0), (174, 4.4), (158, 4.4), (158, 0)]
    g.lathe('can', prof, 'park', segs=48)
    ribs(g, 4, 21, 14.6, 'lock', n=30)
    for f0 in (36, 160):
        g.lathe(f'seam{f0}', [(f0, 19.0), (f0 + 0.5, 18.4), (f0 + 1.0, 19.0)], 'park!', segs=48)
    g.empty('muzzle', 174, 0)
    g.set_origin(0, 0)
