# AR compensator (23 mm, 62 mm) with three side ports per side, two top ports and wrench flats.
from gkit import rot_f

OUT = 'attachments'
TEX = 512
META = dict(kind='muzzle', type='compensator', fits='AR', length_m=0.062)


def build(g):
    prof = [(12, 0), (12, 7.2), (0, 7.2), (0, 10.5), (0.8, 11.5), (58, 11.5), (61, 10.0), (62, 8.0), (62, 5.6), (60, 5.6),
            (60, 8.2), (14, 8.2), (12, 7.2)]
    body = g.lathe('body', [(0, 7.2), (0, 10.5), (0.8, 11.5), (58, 11.5), (61, 10.2), (62, 8.6), (62, 5.4), (56, 5.4),
                            (54, 8.4), (14, 8.4), (12, 7.2)], 'park', segs=48, closed=True)
    cut = []
    for side in (-1, 1):
        for i, f in enumerate((24, 35, 46)):
            cut.append(g.box(f'port{side}{i}', f - 3.2, f + 3.2, -5.0, 5.0, 14, 'park', s=side * 10.0, r=2.5))
    for f in (40, 50):
        cut.append(g.lathe(f'top{f}', [(4, 0), (4, 2.6), (16, 2.6), (16, 0)], 'park', f=f, u=0, axis='u', segs=16))
    for side in (-1, 1):
        cut.append(g.box(f'flat{side}', -1, 9, -14, 14, 6, 'park', s=side * 12.8))
    g.subtract(body, cut)
    g.empty('muzzle', 62, 0)
    g.set_origin(0, 0)
