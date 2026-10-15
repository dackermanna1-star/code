"""shared helpers for muzzle devices (bore axis u = 0, origin at the rear face f = 0, device extends along +f)."""
from gkit import rot_f


def ribs(g, f0, f1, r, name, n=24, kind='park', depth=0.9, width=1.8):
    for i in range(n):
        g.box(f'{name}{i}', f0, f1, r - 0.5, r + depth, width, kind + '!', M=rot_f(i * 360.0 / n + 7.5, 0, 0))
