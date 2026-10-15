# 9 mm Luger: white/red 50-round box + three loose FMJ rounds.
# Origin = bottom centre on the ground; the printed front faces +Z.
from _ammo import ammo_box, cartridge

OUT = 'items'
TEX = 512
META = dict(kind='ammo', caliber='9mm')


def build(g):
    ammo_box(g, 'ammo_9mm', 98, 38, 68)
    n = 2 if '9mm' == '300' else 3
    for i in range(n):
        cartridge(g, '9mm', f'c{i}', 68 / 2 + 22 + i * 4, -98 / 3 + i * (98 / 3), ang=-12 + i * 17)
    g.set_origin(0, 0)
