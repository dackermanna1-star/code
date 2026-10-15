"""shared grenade fuze (M201/M213 style): fuze body, spoon (lever) and pull-pin ring."""
import math
from mathutils import Vector
from gkit import sweep, torus_mesh, MM, T, rot_u


def fuze(g, top_u, body_r_fn, spoon_end_u, kind_fuze='zinc', kind_spoon='paint_olive', kind_pin='steel', spoon_w=15.0):
    """top_u: height of the fuze seat (mm). body_r_fn(u) -> radius of the grenade body surface at height u (for the spoon path).
    Builds groups 'body' (fuze), 'spoon' (pivot at the lever hinge) and 'pin' (pivot at the pin centre)."""
    u0 = top_u
    g.lathe('fuze', [(u0 - 4, 0), (u0 - 4, 10.5), (u0 + 1, 10.5), (u0 + 1, 9.5), (u0 + 13, 9.5), (u0 + 14, 8.6), (u0 + 17, 8.6),
                     (u0 + 19, 6.5), (u0 + 19.6, 0)], kind_fuze, f=0, u=0, axis='u', segs=28)
    # hinge ears for the lever
    for s in (-8.2, 8.2):
        g.box(f'ear{s}', 6, 13, u0 + 6, u0 + 15, 2.2, kind_fuze, s=s, r=0.8)
    # spoon path: over the fuze top, down the side following the body
    pts = [(-7, u0 + 21.0), (2, u0 + 21.6), (9, u0 + 19.5), (12.5, u0 + 14), (13.5, u0 + 8)]
    nrm = [(0, 1, 0), (0.1, 1, 0), (0.6, 0.8, 0), (1, 0.15, 0), (1, 0, 0)]
    u = u0 + 2
    while u > spoon_end_u:
        r = body_r_fn(u) + 1.4
        pts.append((r, u)); u -= 6.0
    for (f, uu) in pts[5:]:
        # outward normal of the body surface in the f-u plane
        r1 = body_r_fn(uu + 1); r0 = body_r_fn(uu - 1)
        n = Vector((1.0, -(r1 - r0) / 2.0, 0)).normalized()
        nrm.append(tuple(n))
    P = [(f * MM, uu * MM, 0.0) for (f, uu) in pts]
    prof = [(-0.75 * MM, -spoon_w / 2 * MM), (0.75 * MM, -spoon_w / 2 * MM), (0.75 * MM, spoon_w / 2 * MM), (-0.75 * MM, spoon_w / 2 * MM)]
    me = sweep(P, prof, up=[Vector(n) for n in nrm])
    g.mesh('spoon', me, kind_spoon, 'spoon')
    g.pivot('spoon', 10, u0 + 17)
    # pin + ring (left side, -s)
    g.lathe('pin_wire', [(-11, 0), (-11, 1.0), (12, 1.0), (12.5, 0)], kind_pin, group='pin', f=-1, u=u0 + 12, axis='s', segs=10)
    g.lathe('pin_head', [(12, 0), (12, 1.8), (13.5, 1.8), (13.5, 0)], kind_pin, group='pin', f=-1, u=u0 + 12, axis='s', segs=10)
    ring = torus_mesh(11.0, 1.3, seg=36, ring=8)
    g.mesh('ring', ring, kind_pin, 'pin', M=T(-1, u0 + 12, -22.5))
    g.pivot('pin', -1, u0 + 12, 0)
    g.empty('pin_ring', -1, u0 + 12, -22.5)
