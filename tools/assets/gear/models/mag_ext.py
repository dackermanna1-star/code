# Extended 40-round polymer box magazine (5.56 STANAG pattern) with two cartridges in the feed lips.
# Origin = top of the magazine body (mag-well top, like the weapon 'mag' pivots); hangs down -Y.
from gkit import rot_s

OUT = 'attachments'
TEX = 512
META = dict(kind='mag', type='extended', capacity_note='generic 40-rd box magazine; pickup model / swap-in for 5.56 rifles')


def build(g):
    side = [(-31, -2, 2), (31, -2, 4), (34, -60, 0), (36, -120, 0), (36, -180, 0), (33, -236, 3), (-12, -236, 3),
            (-21, -180, 0), (-27, -120, 0), (-30, -60, 0)]
    g.side('body', side, 24.0, 'poly', bevel=2.0, bres=2)
    g.side('lips', [(-30, 4, 1), (24, 4, 1), (24, -3, 0), (-30, -3, 0)], 22.0, 'poly', bevel=1.0)
    # base plate
    g.side('base', [(-16, -232, 2), (38, -232, 2), (40, -238, 2), (37, -248, 4), (-18, -248, 4), (-19, -240, 2)], 28.5, 'poly', bevel=2.2)
    # grip ridges + texture panel ribs (horizontal)
    for i in range(7):
        u = -150 - i * 10
        g.box(f'rib{i}', -24 + i * 1.1, 34.5 - i * 0.2, u - 1.4, u + 1.4, 25.6, 'poly!', r=1.0)
    for i in range(3):
        u = -20 - i * 9
        g.box(f'top_rib{i}', -26, 28, u - 1.2, u + 1.2, 25.2, 'poly!', r=1.0)
    # cartridges in the lips (brass case + copper jacketed bullet)
    for k, (fo, uo, so) in enumerate([(0, 6.5, -2.6), (2, 1.0, 3.0)]):
        g.lathe(f'case{k}', [(-26 + fo, 0), (-26 + fo, 4.6), (-25 + fo, 4.8), (12 + fo, 4.7), (16 + fo, 3.2), (19 + fo, 3.0), (19 + fo, 0)],
                'brass', f=0, u=uo, s=so, segs=20)
        g.lathe(f'bullet{k}', [(19 + fo, 0), (19 + fo, 2.85), (25 + fo, 2.8), (31 + fo, 1.6), (34 + fo, 0.4), (34.3 + fo, 0)],
                'copper', f=0, u=uo, s=so, segs=20)
    g.set_origin(0, 0)
