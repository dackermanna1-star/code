# 12-gauge shotshells: red/yellow printed 25-shell box + two loose red shells with brass heads.
# Origin = bottom centre on the ground; the printed front faces +Z.
from _ammo import ammo_box, shotshell

OUT = 'items'
TEX = 512
META = dict(kind='ammo', caliber='12g')


def build(g):
    ammo_box(g, 'ammo_12g', 118, 68, 70)
    shotshell(g, 's0', 70 / 2 + 26, -24, ang=-14)
    shotshell(g, 's1', 70 / 2 + 30, 34, ang=20)
    g.set_origin(0, 0)
