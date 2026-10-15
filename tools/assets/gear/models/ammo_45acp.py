# .45 ACP: blue/gold 50-round box + three loose FMJ rounds.
# Origin = bottom centre on the ground; the printed front faces +Z.
from _ammo import ammo_box, cartridge

OUT = 'items'
TEX = 512
META = dict(kind='ammo', caliber='45acp')


def build(g):
    ammo_box(g, 'ammo_45acp', 112, 44, 74)
    n = 2 if '45' == '300' else 3
    for i in range(n):
        cartridge(g, '45', f'c{i}', 74 / 2 + 22 + i * 4, -112 / 3 + i * (112 / 3), ang=-12 + i * 17)
    g.set_origin(0, 0)
