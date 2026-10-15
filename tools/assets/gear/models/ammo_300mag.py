# .300 Win Mag: black/gold 20-round premium box + two loose boat-tail rounds.
# Origin = bottom centre on the ground; the printed front faces +Z.
from _ammo import ammo_box, cartridge

OUT = 'items'
TEX = 512
META = dict(kind='ammo', caliber='300mag')


def build(g):
    ammo_box(g, 'ammo_300mag', 150, 48, 82)
    n = 2 if '300' == '300' else 3
    for i in range(n):
        cartridge(g, '300', f'c{i}', 82 / 2 + 22 + i * 4, -150 / 3 + i * (150 / 3), ang=-12 + i * 17)
    g.set_origin(0, 0)
