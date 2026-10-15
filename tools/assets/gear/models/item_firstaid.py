# First aid kit: white ABS hard case with a red cross lid, two latches, hinge and a fold-down carry handle.
# Origin = bottom centre on the ground; latches/handle face +Z.
from gkit import rot_s

OUT = 'items'
TEX = 512
META = dict(kind='heal', type='first_aid')


def build(g):
    Wd, Dp, H = 230.0, 150.0, 78.0
    lid = g.decal_kind('plastic_wht', 'cross', g.work + '/labels/cross_red_on_white.png', rough=0.4)
    g.front('base', [(-Wd / 2, 2, 14), (Wd / 2, 2, 14), (Wd / 2, 50, 14), (-Wd / 2, 50, 14)], -Dp / 2, Dp / 2, 'plastic_wht', bevel=3.0)
    top = g.front('lid', [(-Wd / 2 - 1, 51, 15), (Wd / 2 + 1, 51, 15), (Wd / 2 + 1, H, 15), (-Wd / 2 - 1, H, 15)], -Dp / 2 - 1, Dp / 2 + 1, lid, bevel=6.0, bres=3)
    g.decal_uv(top, 'fs', (-55, -55, 55, 55), facing=(0, 1, 0), min_dot=0.7)
    # feet
    for sx in (-1, 1):
        for sf in (-1, 1):
            g.lathe(f'foot{sx}{sf}', [(0, 0), (0, 8), (3, 8), (3, 0)], 'rubber', f=sf * (Dp / 2 - 18), s=sx * (Wd / 2 - 22), axis='u', segs=16)
    # latches
    for sx in (-1, 1):
        g.box(f'latch{sx}', Dp / 2 - 1, Dp / 2 + 5, 36, 66, 26, 'plastic_gry', s=sx * 62, r=3.0)
        g.box(f'latchk{sx}', Dp / 2 + 4, Dp / 2 + 7, 56, 64, 18, 'plastic_gry', s=sx * 62, r=1.0)
    # handle (folded down against the front)
    g.box('handle', Dp / 2, Dp / 2 + 9, 20, 30, 90, 'plastic_gry', r=4.0)
    for sx in (-1, 1):
        g.box(f'hpivot{sx}', Dp / 2 - 1, Dp / 2 + 8, 22, 48, 12, 'plastic_gry', s=sx * 50, r=3.0)
    # rear hinge knuckles
    for i in range(5):
        g.lathe(f'hinge{i}', [(-Wd / 2 + 30 + i * 40, 0), (-Wd / 2 + 30 + i * 40, 4.5), (-Wd / 2 + 52 + i * 40, 4.5), (-Wd / 2 + 52 + i * 40, 0)],
                'plastic_wht', f=-Dp / 2 - 3, u=51, axis='s', segs=16)
    # seam groove between lid and base
    g.box('seam', -Dp / 2 + 2, Dp / 2 - 2, 49.6, 51.4, Wd - 6, 'plastic_gry!', r=12.0)
    g.set_origin(0, 0)
