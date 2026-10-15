"""printed cardboard ammo boxes with loose cartridges (origin = bottom centre on the ground, front = +Z)."""
import math
from gkit import rot_u, rot_s

CARTS = {
    # caliber: (case profile [(x, r)], bullet profile [(x, r)], case kind, bullet kind, tip kind)
    '556': ([(0, 0), (0, 4.6), (0.8, 4.8), (1.2, 4.2), (2.0, 4.6), (36.5, 4.5), (39.5, 3.2), (44.7, 3.1), (44.7, 0)],
            [(44.7, 0), (44.7, 2.85), (49.5, 2.8), (54.5, 1.8), (57.0, 0.6), (57.4, 0)], 'brass', 'copper', 'paint_green'),
    '9mm': ([(0, 0), (0, 4.9), (0.8, 4.95), (1.3, 4.3), (2.2, 4.9), (19.1, 4.8), (19.1, 0)],
            [(19.1, 0), (19.1, 4.5), (22.5, 4.45), (26.5, 3.4), (29.0, 1.6), (29.7, 0)], 'brass', 'copper', None),
    '45': ([(0, 0), (0, 6.0), (0.9, 6.0), (1.5, 5.3), (2.5, 6.0), (22.8, 5.9), (22.8, 0)],
           [(22.8, 0), (22.8, 5.7), (25.5, 5.65), (29.5, 4.4), (32.0, 2.0), (32.4, 0)], 'brass', 'copper', None),
    '300': ([(0, 0), (0, 6.6), (0.9, 6.7), (1.5, 6.0), (2.2, 6.8), (5.0, 6.8), (5.5, 6.5), (56.5, 6.2), (60.0, 4.3), (66.5, 4.2), (66.5, 0)],
            [(66.5, 0), (66.5, 3.9), (73.0, 3.85), (80.5, 2.4), (83.5, 0.8), (84.0, 0)], 'brass', 'copper', None),
}


def cartridge(g, cal, name, f, s, ang=0.0):
    """cartridge lying on the ground, axis horizontal at angle `ang` (deg, 0 = pointing +s) about the vertical."""
    case, bullet, ck, bk, tk = CARTS[cal]
    r = max(p[1] for p in case)
    L = case[-1][0]
    M = rot_u(ang, f, s)
    g.lathe(name + '_case', [(x - L / 2, rr) for (x, rr) in case], ck, f=f, u=r, s=s, axis='s', segs=20, M=M)
    if tk:
        g.lathe(name + '_bullet', [(x - L / 2, rr) for (x, rr) in bullet[:-2]] + [(bullet[-3][0] - L / 2, 0)], bk, f=f, u=r, s=s, axis='s', segs=16, M=M)
        g.lathe(name + '_tip', [(x - L / 2, rr) for (x, rr) in bullet[-3:]] + [(bullet[-3][0] - L / 2, 0)], tk, f=f, u=r, s=s, axis='s', segs=16, M=M)
    else:
        g.lathe(name + '_bullet', [(x - L / 2, rr) for (x, rr) in bullet], bk, f=f, u=r, s=s, axis='s', segs=16, M=M)


def shotshell(g, name, f, s, ang=0.0):
    M = rot_u(ang, f, s)
    r = 10.4
    g.lathe(name + '_head', [(-35, 0), (-35, 11.2), (-34, 11.2), (-33.4, 10.5), (-23, 10.6), (-23, 0)], 'brass', f=f, u=11.2, s=s, axis='s', segs=24, M=M)
    g.lathe(name + '_hull', [(-23, 0), (-23, 10.45), (31, 10.4), (34, 9.6), (35, 5.0), (34.2, 0)], 'plastic_red', f=f, u=11.2, s=s, axis='s', segs=24, M=M)


def ammo_box(g, label, Lx, H, D, base='card_print', r=3.0):
    """printed box: length Lx along s (x), height H, depth D along f; decals from the atlas <label>.png."""
    kind = g.decal_kind(base, label, f'{g.work}/labels/{label}.png', rough=0.62)
    ob = g.box('box', -D / 2, D / 2, 0.0, H, Lx, kind, r=r, bevel=1.6)
    g.decal_uv(ob, 'su', (-Lx / 2, 0, Lx / 2, H), img_rect=(0, 0.55, 1, 1), facing=(1, 0, 0), min_dot=0.5)
    g.decal_uv(ob, 'su-', (-Lx / 2, 0, Lx / 2, H), img_rect=(0, 0.55, 1, 1), facing=(-1, 0, 0), min_dot=0.5)
    g.decal_uv(ob, 'fs', (-Lx / 2, -D / 2, Lx / 2, D / 2), img_rect=(0, 0.1, 0.7, 0.5), facing=(0, 1, 0), min_dot=0.5, flip_v=True)
    g.decal_uv(ob, 'fu', (-D / 2, 0, D / 2, H), img_rect=(0.72, 0.1, 1, 0.5), facing=(0, 0, 1), min_dot=0.5)
    g.decal_uv(ob, 'fu-', (-D / 2, 0, D / 2, H), img_rect=(0.72, 0.1, 1, 0.5), facing=(0, 0, -1), min_dot=0.5)
    # tuck-flap seam on the top
    g.box('flap', -D / 2 + 6, -D / 2 + 7.2, H - 0.4, H + 0.3, Lx - 10, base + '!', r=0.3, bevel=0.2)
    return ob
