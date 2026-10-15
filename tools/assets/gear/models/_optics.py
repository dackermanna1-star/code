"""shared parts for optics: Picatinny clamp base, cross bolts, scope rings, turrets."""
from gkit import rot_f, rot_s, rot_u, T, rect

BASE_TOP = 8.8


def pic_base(g, f0, f1, name='base', kind='anod', top=BASE_TOP, half_w=15.8):
    """clamp base sitting on a Picatinny rail top (u = 0) with jaws down the rail sides."""
    hw = half_w
    pts = [(-hw + 0.3, -6.5, 1.0), (-11.2, -6.5, 0.6), (-10.4, -3.6, 0), (-10.4, 0, 0), (10.4, 0, 0), (10.4, -3.6, 0),
           (11.2, -6.5, 0.6), (hw - 0.3, -6.5, 1.0), (hw, top, 2.2), (-hw, top, 2.2)]
    return g.front(name, pts, f0, f1, kind, bevel=1.0)


def cross_bolt(g, f, name, half_w=15.8, kind='park', nut='park'):
    """recoil cross bolt: slotted head on the left, hex nut on the right."""
    g.lathe(name + '_head', [(-half_w - 3.2, 0), (-half_w - 3.2, 5.0), (-half_w - 0.6, 5.6), (-half_w, 5.6), (-half_w, 0)],
            kind, f=f, u=-2.5, axis='s', segs=20)
    g.lathe(name + '_nut', [(half_w, 0), (half_w, 6.2), (half_w + 5.0, 6.2), (half_w + 5.5, 5.6), (half_w + 5.5, 0)],
            nut, f=f, u=-2.5, axis='s', segs=6)
    g.lathe(name + '_end', [(half_w + 5.5, 0), (half_w + 5.5, 2.6), (half_w + 7.0, 2.4), (half_w + 7.0, 0)], kind, f=f, u=-2.5, axis='s', segs=12)


def thumb_nut(g, f, name, side=1, half_w=15.8, kind='anod', u=-1.0):
    """large knurled thumb nut on one side."""
    s0 = half_w if side > 0 else -half_w
    d = 1 if side > 0 else -1
    g.lathe(name + '_washer', [(s0, 0), (s0, 8.5), (s0 + d * 1.2, 8.5), (s0 + d * 1.2, 0)], 'park', f=f, u=u, axis='s', segs=24)
    a, b = s0 + d * 1.2, s0 + d * 10.5
    lo, hi = min(a, b), max(a, b)
    g.lathe(name, [(lo, 0), (lo, 8.0), (lo + 0.8, 9.2), (hi - 0.8, 9.2), (hi, 8.0), (hi, 0)], kind, f=f, u=u, axis='s', segs=32)
    for i in range(16):
        g.box(f'{name}_k{i}', f - 0.7, f + 0.7, u + 8.9, u + 9.9, (hi - lo) - 2.0, kind + '!', s=(lo + hi) / 2, M=rot_s(i * 22.5, f, u))


def scope_ring(g, f0, f1, ax, r_tube, name, kind='anod', top=BASE_TOP, screws=True):
    """ring clamping a tube of radius r_tube (mm) at axis height ax, standing on a base whose top is `top`."""
    ro = r_tube + 4.8
    g.lathe(name, [(f0, r_tube), (f0, ro - 1.0), (f0 + 1.0, ro), (f1 - 1.0, ro), (f1, ro - 1.0), (f1, r_tube)], kind, u=ax, segs=40, closed=True)
    w = min(r_tube + 1.5, 15.0)
    g.front(name + '_stem', [(-w, top - 0.5, 2.0), (w, top - 0.5, 2.0), (w * 0.8, ax - r_tube * 0.6, 0), (-w * 0.8, ax - r_tube * 0.6, 0)],
            f0, f1, kind, bevel=0.8)
    # cap screws on top of the ring flanks
    if screws:
        import math
        for side in (-1, 1):
            sc = side * (r_tube + 2.4)
            h = math.sqrt(max(ro * ro - sc * sc, 1.0))
            g.lathe(f'{name}_scr{side}', [(h - 1.5, 0), (h - 1.5, 2.9), (h + 1.6, 2.9), (h + 2.1, 2.3), (h + 2.1, 0)],
                    'park', f=(f0 + f1) / 2, u=ax, s=sc, axis='u', segs=16)


def turret(g, f, ax, h0, h1, r, name, axis='u', side=1, cap='anod', ribs=0, base_r=None):
    """turret column from radius h0 to h1 (mm from the optical axis) along axis 'u' (top) or 's' (side; side=+1 right)."""
    br = base_r or r + 1.5
    if axis == 'u':
        g.lathe(name + '_base', [(h0 - 3, 0), (h0 - 3, br), (h0 + 3, br), (h0 + 3.5, br - 0.5), (h0 + 3.5, 0)], 'anod', f=f, u=ax, axis='u', segs=32)
        g.lathe(name, [(h0 + 3.5, 0), (h0 + 3.5, r), (h1 - 1.2, r), (h1, r - 1.2), (h1, 0)], cap, f=f, u=ax, axis='u', segs=36)
        for i in range(ribs):
            g.box(f'{name}_r{i}', f - 0.8, f + 0.8, ax + h0 + 5, ax + h1 - 1.8, 1.4, cap + '!', s=r, M=rot_u(i * 360.0 / ribs, f, 0))
    else:
        d = side
        def P(a, b):
            return (d * a, b)
        g.lathe(name + '_base', [P(h0 - 3, 0), P(h0 - 3, br), P(h0 + 3, br), P(h0 + 3.5, br - 0.5), P(h0 + 3.5, 0)], 'anod', f=f, u=ax, axis='s', segs=32)
        g.lathe(name, [P(h0 + 3.5, 0), P(h0 + 3.5, r), P(h1 - 1.2, r), P(h1, r - 1.2), P(h1, 0)], cap, f=f, u=ax, axis='s', segs=36)
        for i in range(ribs):
            g.box(f'{name}_r{i}', f - 0.8, f + 0.8, ax + r - 0.7, ax + r + 0.7, (h1 - h0 - 7), cap + '!', s=d * (h0 + h1 + 4) / 2,
                  M=rot_s(i * 360.0 / ribs, f, ax))


def knurl_ring(g, f0, f1, r, ax, name, n=36, kind='rubber', depth=1.0):
    """grip ring of n longitudinal ribs around the optical axis."""
    g.lathe(name, [(f0, r - 0.3), (f0, r), (f1, r), (f1, r - 0.3)], kind, u=ax, segs=48, closed=True)
    for i in range(n):
        g.box(f'{name}_{i}', f0 + 0.5, f1 - 0.5, ax + r - 0.4, ax + r + depth, 1.6, kind + '!', M=rot_f(i * 360.0 / n, ax, 0))


def under_clamp(g, f0, f1, name='clamp', kind='poly', depth=9.0, half_w=14.5):
    """clamp for mounting UNDER a rail: top face at u = 0 touches the rail, jaws reach up to u = +6.5, body below."""
    hw = half_w
    pts = [(-hw, -depth, 2.5), (hw, -depth, 2.5), (hw, 6.5, 1.0), (11.2, 6.5, 0.6), (10.4, 3.6, 0), (10.4, 0, 0),
           (-10.4, 0, 0), (-10.4, 3.6, 0), (-11.2, 6.5, 0.6), (-hw, 6.5, 1.0)]
    return g.front(name, pts, f0, f1, kind, bevel=1.2)


def clamp_screw(g, f, name, half_w=14.5, u=3.0):
    """cross screw through an under-rail clamp: knurled knob on the left, hex nut on the right."""
    g.lathe(name + '_knob', [(-half_w - 6.0, 0), (-half_w - 6.0, 6.2), (-half_w - 0.8, 6.6), (-half_w, 6.6), (-half_w, 0)],
            'anod', f=f, u=u, axis='s', segs=24)
    g.lathe(name + '_nut', [(half_w, 0), (half_w, 5.4), (half_w + 3.6, 5.4), (half_w + 3.6, 0)], 'park', f=f, u=u, axis='s', segs=6)
