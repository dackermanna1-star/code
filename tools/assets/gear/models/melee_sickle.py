# Sickle: crescent carbon-steel blade on a turned hardwood handle with a steel ferrule.
# Origin = hand grip (handle centre); +Z = forward, the blade curls up (+Y) with the edge on the inside of the curve.
import math
from gkit import blade_mesh

OUT = 'weapons'
TEX = 512
META = dict(kind='melee', type='sickle')


def build(g):
    g.lathe('handle', [(-72, 0), (-72, 11.5), (-69, 14.5), (-60, 15.5), (-20, 14.5), (20, 13.5), (52, 13.0), (58, 12.5), (58, 0)],
            'wood_handle', segs=28)
    g.lathe('ferrule', [(56, 0), (56, 13.4), (72, 12.2), (74, 10.5), (74, 0)], 'zinc', segs=28)
    # blade: spine arc (radius 125 about C) and edge arc approaching it toward the tip
    C = (140.0, 95.0)
    spine = []; edge = []
    n = 34
    a0, a1 = -128.0, 104.0
    for i in range(n + 1):
        t = i / n
        a = math.radians(a0 + (a1 - a0) * t)
        R1 = 125.0 + 6.0 * (1 - t)
        w = 31.0 * (1 - t) ** 0.75 + 0.6
        R2 = R1 - w
        spine.append((C[0] + R1 * math.cos(a), C[1] + R1 * math.sin(a)))
        edge.append((C[0] + R2 * math.cos(a), C[1] + R2 * math.sin(a)))
    # straight tang from the ferrule into the blade root
    tang_s = [(70, 4.0), (62, -0.5)]
    g.mesh('blade', blade_mesh(spine, edge, 2.6, 0.25, n_across=5, grind=0.4), 'blade', 'body')
    g.side('tang', [(66, -6, 1), (C[0] + 131 * math.cos(math.radians(a0)) + 6, C[1] + 131 * math.sin(math.radians(a0)) - 2, 2),
                    (C[0] + 100 * math.cos(math.radians(a0)) + 4, C[1] + 100 * math.sin(math.radians(a0)) + 6, 2), (66, 7, 1)], 2.8, 'blade', bevel=0.6)
    g.empty('tip', C[0] + 112 * math.cos(math.radians(a1)), C[1] + 112 * math.sin(math.radians(a1)))
    g.set_origin(0, 0)
