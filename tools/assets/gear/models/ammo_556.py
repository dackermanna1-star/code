# 5.56 mm rifle cartridges: olive printed 30-round box + three loose M855 rounds (green tips).
# Origin = bottom centre on the ground; the printed front faces +Z.
from _ammo import ammo_box, cartridge

OUT = 'items'
TEX = 512
META = dict(kind='ammo', caliber='556')


def build(g):
    ammo_box(g, 'ammo_556', 120, 42, 78)
    n = 2 if '556' == '300' else 3
    for i in range(n):
        cartridge(g, '556', f'c{i}', 78 / 2 + 22 + i * 4, -120 / 3 + i * (120 / 3), ang=-12 + i * 17)
    g.set_origin(0, 0)
