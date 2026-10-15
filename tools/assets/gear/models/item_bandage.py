# Bandage: a gauze roll lying on its side with the loose end unrolled on the ground, plus a second roll still in its
# printed sterile paper band. Origin = bottom centre on the ground.
import math
from mathutils import Vector, noise
from gkit import grid_surface, apply_mods, MM

OUT = 'items'
TEX = 512
MS = 1.5
META = dict(kind='heal', type='bandage')


def build(g):
    R, W = 31.0, 76.0
    g.lathe('roll', [(-W / 2, 7), (-W / 2, R - 1), (-W / 2 + 1.5, R), (W / 2 - 1.5, R), (W / 2, R - 1), (W / 2, 7)], 'gauze', f=-20, u=R, axis='s',
            segs=40, closed=True)
    g.lathe('core', [(-W / 2 + 0.5, 0), (-W / 2 + 0.5, 7), (W / 2 - 0.5, 7), (W / 2 - 0.5, 0)], 'card_wht', f=-20, u=R, axis='s', segs=16)
    # loose end: leaves the roll at its front-bottom and lies on the ground with soft folds
    def fn(a, b):
        f = -20 + 4 + a * 165
        s = (b - 0.5) * (W - 2) * (1.0 - 0.06 * a)
        u = 0.9 + 1.2 * max(0.0, 1 - a * 6) * 10
        q = Vector((f * 0.02, s * 0.02, 1.0))
        u += 2.2 * max(0.0, noise.noise(q * 1.3)) * min(1.0, a * 4)
        return (f * MM, u * MM, s * MM)
    me = grid_surface(fn, 40, 8)
    me = apply_mods(me, [('SOLIDIFY', dict(thickness=1.2 * MM, offset=1.0))])
    g.mesh('tail', me, 'gauze', 'body')
    # second roll, upright, in its paper band
    lbl = g.decal_kind('card_print', 'band', g.work + '/labels/bandage.png', rough=0.6)
    g.lathe('roll2', [(0, 7), (0, R - 1), (1.5, R), (W - 1.5, R), (W, R - 1), (W, 7)], 'gauze', f=10, s=70, axis='u', segs=40, closed=True)
    band = g.lathe('band', [(4, R + 0.4), (W - 4, R + 0.4)], lbl, f=10, s=70, axis='u', segs=48, cap0=False, cap1=False)
    g.decal_uv(band, ('cyl', 10, 70), (-180, 4, 180, W - 4))
    g.set_origin(0, 0)
