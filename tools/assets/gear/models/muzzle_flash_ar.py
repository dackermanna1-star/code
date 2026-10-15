# A2-style "birdcage" flash hider (22 mm, 56 mm): five slots around the top, closed bottom.
from gkit import rot_f

OUT = 'attachments'
TEX = 512
META = dict(kind='muzzle', type='flash_hider', fits='AR', length_m=0.056)


def build(g):
    body = g.lathe('body', [(0, 7.2), (0, 10.2), (0.8, 11.0), (55, 11.0), (56, 10.2), (56, 8.6), (16, 8.6), (13, 5.5),
                            (11, 5.5), (11, 7.2)], 'park', segs=48, closed=True)
    cut = []
    for k, a in enumerate((0, 72, -72, 144, -144)):
        cut.append(g.box(f'slot{k}', 20, 52, 4.0, 16.0, 3.4, 'park', M=rot_f(a, 0, 0)))
    for side in (-1, 1):
        cut.append(g.box(f'flat{side}', -1, 8, -14, 14, 6, 'park', s=side * 12.3))
    g.subtract(body, cut)
    g.empty('muzzle', 56, 0)
    g.set_origin(0, 0)
