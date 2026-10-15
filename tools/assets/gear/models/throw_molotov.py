# Molotov cocktail: 0.7 l green glass bottle half full of fuel, rag wick stuffed in the neck, torn paper label.
# Origin = hand grip on the bottle body (110 mm above the base). +Y = neck up. 'wick' empty = rag tip (fire FX).
import math
from mathutils import Vector, noise
from gkit import sweep, MM, catmull, apply_mods

OUT = 'weapons'
TEX = 512
MS = 1.5
META = dict(kind='throwable', type='molotov', nodes_note="'glass' (alpha-blended), 'fuel' (liquid), 'wick' empty at the rag tip")


def build(g):
    outer = [(0, 0), (0.5, 33), (2, 37.5), (5, 39.5), (175, 40), (205, 35), (230, 22), (248, 15.5), (282, 14.2), (285, 15.8),
             (293, 15.8), (296, 13.2), (296, 10.5)]
    g.lathe('glass', outer, '=glass_green', group='glass', axis='u', segs=48)
    # punt (bottom dome) + liquid
    g.lathe('fuel', [(4, 0), (4, 36.5), (6, 37.8), (128, 37.8), (128, 0)], '=liquid_fuel', group='fuel', axis='u', segs=40)
    # paper label (slightly proud of the glass), torn top edge via decal alpha
    lbl = g.decal_kind('card_print', 'molotov', g.work + '/labels/molotov_label.png')
    lab = g.lathe('label', [(60, 40.35), (150, 40.35)], lbl, axis='u', segs=24, cap0=False, cap1=False, a0=-80, a1=80)
    g.decal_uv(lab, ('cyl', 0, 0), (-80, 60, 80, 150))
    # rag: twisted strip going into the neck, out of the mouth and hanging down the side
    path = [(0, 252, 0), (0, 275, 0), (1, 298, 1), (5, 314, 2), (14, 321, 2), (22, 316, 1), (26, 302, -1), (25, 284, -2),
            (24, 266, -2), (25, 246, -1)]
    P = [Vector((p[0] * MM, p[1] * MM, p[2] * MM)) for p in catmull(path, n=6)]
    prof = []
    for k in range(14):
        a = 2 * math.pi * k / 14
        prof.append((3.2 * math.cos(a) * MM, 11.5 * math.sin(a) * MM))
    scale = [1.0 + 0.9 * max(0.0, (i / len(P)) - 0.3) for i in range(len(P))]
    twist = [0.25 * math.sin(i * 0.5) for i in range(len(P))]
    me = sweep(P, prof, scale=scale, twist=twist)
    me = apply_mods(me, [('SUBSURF', dict(levels=1, render_levels=1))])
    for v in me.vertices:
        q = v.co * 140.0
        n = noise.noise_vector(q)
        v.co += Vector(n) * 0.0022
    g.mesh('rag', me, 'rag', 'body')
    # a few loops of string around the neck
    for k, u in enumerate((262, 268)):
        g.lathe(f'string{k}', [(u - 1.0, 14.6), (u, 15.6), (u + 1.0, 14.6)], 'cord', axis='u', segs=32)
    g.empty('wick', 14, 327)
    g.set_origin(0, 110)
