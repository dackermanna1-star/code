# Ram-air parachute: 9-cell arched canopy (7.2 m span, 2.7 m chord, airfoil with pillowed cells, open leading-edge
# inlets, end-cell stabilisers), 40 suspension lines + brake lines to four risers.
# Origin = between the shoulder riser attachments (root-space about (0, 1.47, -0.05): Spine2 + (0, 0.15, -0.03)).
# Nodes: 'canopy' (mesh), 'lines' (mesh, plain material), 'risers' (mesh), empties 'riser_l' / 'riser_r'.
import math
from mathutils import Vector
from gkit import grid_surface, mesh_from_pydata, sweep, MM

OUT = 'gear'
TEX = 1024
MS = 12.0
DOUBLE_SIDED = True
META = dict(kind='parachute', span_m=7.2, chord_m=2.7, attach_bone='Spine2', attach_offset_m=[0.0, 0.15, -0.03],
            notes="canopy bottom centre ~4.3 m above the origin and 0.6 m ahead; the canopy node can be scaled for the opening animation")

SPAN, CHORD, ARC, H, ZC0 = 7.2, 2.7, 1.9, 4.3, 0.6
R = SPAN / ARC
NC = 9


def Lc(x, y, z):            # glTF -> kit local (x = f, y = u, z = s)
    return (z, y, -x)


def frame(s):
    """arc frame at span coordinate s in [-1, 1]: base point and arc normal (glTF)."""
    ph = s * ARC / 2
    base = Vector((R * math.sin(ph), H + R * math.cos(ph) - R, 0.0))
    nrm = Vector((math.sin(ph), math.cos(ph), 0.0))
    return base, nrm


def airfoil(c):
    t = 0.15
    yt = 5 * t * (0.2969 * math.sqrt(max(c, 0)) - 0.126 * c - 0.3516 * c ** 2 + 0.2843 * c ** 3 - 0.1015 * c ** 4) * CHORD
    yc = 0.045 * CHORD * math.sin(math.pi * min(1.0, c) ** 0.85)
    return yc, yt


def point(s, c, top):
    base, nrm = frame(s)
    cell = (s + 1) / 2 * NC
    frac = cell - math.floor(cell)
    pillow = 1.0 + 0.16 * math.sin(math.pi * frac)
    yc, yt = airfoil(c)
    tip = 1.0 - 0.35 * max(0.0, abs(s) - 0.85) / 0.15      # thinner end cells
    off = yc + (yt if top else -yt * 0.85) * pillow * tip
    z = ZC0 + CHORD * (0.5 - c)
    trim = -(z - ZC0) * 0.09                                 # nose slightly down
    p = base + nrm * (off + trim) + Vector((0, 0, z))
    return p


def build(g):
    kinds = ['nylon_navy', 'nylon_white', 'nylon_orange']
    for k in range(NC):
        s0 = -1 + 2 * k / NC; s1 = -1 + 2 * (k + 1) / NC
        kind = kinds[0] if k % 2 == 0 else kinds[1]
        if k == NC // 2: kind = kinds[2]
        def ftop(a, b, s0=s0, s1=s1):
            return Lc(*point(s0 + (s1 - s0) * a, b, True))
        def fbot(a, b, s0=s0, s1=s1):
            return Lc(*point(s0 + (s1 - s0) * a, 0.07 + 0.93 * b, False))
        g.mesh(f'top{k}', grid_surface(ftop, 8, 28), kind, 'canopy')
        g.mesh(f'bot{k}', grid_surface(fbot, 8, 26), kind, 'canopy')
    # ribs (airfoil sections) at every cell wall: visible through the inlets and at the tips
    for k in range(NC + 1):
        s = -1 + 2 * k / NC
        n = 24
        tops = [point(s, (i / n) ** 1.6, True) for i in range(n + 1)]
        bots = [point(s, 0.07 + 0.93 * (i / n) ** 1.6, False) for i in range(n + 1)]
        verts = [Lc(*p) for p in tops] + [Lc(*p) for p in bots]
        faces = []
        for i in range(n):
            faces.append((i, i + 1, n + 1 + i + 1, n + 1 + i))
        kind = 'nylon_navy' if k in (0, NC) else 'nylon_white'
        g.mesh(f'rib{k}', mesh_from_pydata(verts, faces), kind, 'canopy')
    # stabilisers hanging under the end cells
    for sgn in (-1, 1):
        s = sgn * 1.0
        p0 = point(s, 0.2, False); p1 = point(s, 0.8, False)
        base, nrm = frame(s)
        tipp = (p0 + p1) / 2 - nrm * 0.45
        verts = [Lc(*p0), Lc(*p1), Lc(*tipp)]
        g.mesh(f'stab{sgn}', mesh_from_pydata(verts, [(0, 1, 2)]), 'nylon_navy', 'canopy')
    # risers (front/rear per side) from the shoulders up to the line links
    riser_top = {}
    for side in (1, -1):
        for fr, dz in (('f', 0.03), ('r', -0.03)):
            a = Vector((side * 0.16, 0.0, dz * 0.6)); b = Vector((side * 0.19, 0.46, dz))
            pts = [Lc(*(a + (b - a) * t / 6)) for t in range(7)]
            prof = [(-0.001, -0.0125), (0.001, -0.0125), (0.001, 0.0125), (-0.001, 0.0125)]
            g.mesh(f'riser{side}{fr}', sweep(pts, prof, up=(0, 0, 1)), 'webbing_od', 'risers')
            riser_top[(side, fr)] = b
            g.lathe(f'link{side}{fr}', [(0, 0), (0, 4.0), (22, 4.0), (22, 0)], 'zinc', group='risers',
                    f=b.z * 1000, u=b.y * 1000, s=-b.x * 1000, axis='u', segs=8)
    # suspension lines: A/B rows to the front risers, C/D rows to the rear risers; brake lines from the trailing edge
    lines = []
    for k in range(NC + 1):
        s = -1 + 2 * k / NC
        side = 1 if s > 0 else -1
        for c, fr in ((0.12, 'f'), (0.36, 'f'), (0.62, 'r'), (0.86, 'r')):
            lines.append((point(s, c, False), riser_top[(side, fr)] + Vector((0, 0.022, 0))))
    for side in (1, -1):
        knot = Vector((side * 0.9, 1.9, -0.55))
        for s in (0.5, 0.7, 0.88, 1.0):
            lines.append((point(side * s, 1.0, False), knot))
        lines.append((knot, riser_top[(side, 'r')] + Vector((0, 0.02, -0.02))))
    for i, (a, b) in enumerate(lines):
        prof = [(math.cos(2 * math.pi * j / 5) * 0.0022, math.sin(2 * math.pi * j / 5) * 0.0022) for j in range(5)]
        g.mesh(f'line{i}', sweep([Lc(*a), Lc(*b)], prof), '=line', 'lines')
    g.empty('riser_l', 0, 0, -160)
    g.empty('riser_r', 0, 0, 160)
    g.empty('canopy_center', ZC0 * 1000, H * 1000)
    g.set_origin(0, 0)
