"""Backpack builder: soft fabric pack bodies, pockets, zips snapped onto the body, shoulder harness fitted to the
torso envelope. Origin = upper-back attach point, root-space (0, OY, OZ) (behind the thickest vest)."""
import math
import numpy as np
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
from gkit import soft_box, rbox_mesh, sweep, catmull, MM, apply_mods, torus_mesh, grid_surface
from _vest import Body
from _wear import front_z, back_z, top_y, ZC

OY, OZ = 1.40, -0.185


def snap_path(me, pts, off):
    """project local points onto mesh `me` (closest point) and push them out by `off` along the surface normal."""
    bvh = BVHTree.FromPolygons([v.co for v in me.vertices], [p.vertices for p in me.polygons])
    out = []; nrm = []
    for p in pts:
        loc, n, i, d = bvh.find_nearest(Vector(p))
        out.append(loc + n * off); nrm.append(n)
    return out, nrm


class Pack:
    def __init__(self, g, kind, web, buckle='plastic_blk'):
        self.g = g; self.kind = kind; self.web = web; self.buckle = buckle
        self.b = Body(g, OY, OZ)

    def L(self, x, y, z):
        return self.b.L(x, y, z)

    def box(self, name, w, h, d, cx, cy, z_front, r=None, puff=0.012, wrinkle=0.0015, seed=0, taper_top=0.0, kind=None, subd=2):
        """fabric box of width w (x), height h (y), depth d (z, extending backwards from z_front); returns (mesh_local, M)."""
        me = soft_box(d, h, w, r if r is not None else min(w, h, d) * 0.28, puff=puff, wrinkle=wrinkle, wscale=0.04, seed=seed,
                      subd=subd, taper_top=taper_top)
        c = self.L(cx, cy, z_front - d / 2)
        me.transform(Matrix.Translation(c))
        keep = me.copy()
        self.g.mesh(name, me, kind or self.kind, 'body')
        return keep

    def zip_loop(self, name, me_local, pts_glTF, off=0.002, kind='plastic_blk', r=0.0026, closed=True, pull=True):
        """zip tube following points (glTF) snapped onto a box mesh returned by box()."""
        L = [self.L(*p) for p in pts_glTF]
        dense = catmull(L, n=6, closed=closed)
        P, N = snap_path(me_local, dense, off)
        self.tube(name, P, r, kind, closed=closed, n=6, flat=0.6)
        if pull:
            i = len(P) // 3
            self.buckle_at(name + '_pull', P[i] + N[i] * 0.003, N[i], w=0.008, h=0.026, t=0.003)
        return P, N

    def tube(self, name, pts_local, radius, kind, closed=False, n=6, flat=1.0):
        prof = [(math.cos(2 * math.pi * k / n) * radius * flat, math.sin(2 * math.pi * k / n) * radius) for k in range(n)]
        P = list(pts_local)
        if closed: P = P + [P[0]]
        return self.g.mesh(name, sweep(P, prof, cap=not closed), kind, 'body')

    def webbing(self, name, pts_local, width, thick, kind=None, ups=None):
        prof = [(-thick / 2, -width / 2), (thick / 2, -width / 2), (thick / 2, width / 2), (-thick / 2, width / 2)]
        return self.g.mesh(name, sweep(pts_local, prof, up=ups if ups is not None else (0, 1, 0)), kind or self.web, 'body')

    def buckle_at(self, name, p_local, n_local, w=0.03, h=0.04, t=0.006, up=(0, 1, 0)):
        nx = Vector(n_local).normalized(); upv = Vector(up); upv = (upv - nx * upv.dot(nx)).normalized(); zc = nx.cross(upv)
        M = Matrix.Identity(4)
        for i in range(3):
            M[i][0] = nx[i]; M[i][1] = upv[i]; M[i][2] = zc[i]; M[i][3] = p_local[i]
        self.g.mesh(name, rbox_mesh(t, h, w, 0.003), self.buckle, 'body', M=M)

    # ------------------------------------------------------------------------------------------
    def harness(self, top_y_pack, bottom_y_pack, half_w_pack, width=0.06, thick=0.014, clear=0.024, sternum=True):
        """padded shoulder straps from the pack top over the shoulders down the chest, lower webbing back to the pack's
        bottom corners, optional sternum strap."""
        b = self.b
        for side in (1, -1):
            xs = side * 0.118
            pts = [(side * 0.075, top_y_pack - 0.03, OZ - 0.01), (side * 0.095, top_y_pack + 0.012, OZ + 0.02)]
            for zz in (-0.10, -0.06, -0.02, 0.02, 0.06):
                pts.append((xs, top_y(xs, zz) + clear, zz))
            for yy in (1.44, 1.38, 1.32, 1.27):
                xx = side * (0.112 + (1.44 - yy) * 0.15)
                pts.append((xx, yy, front_z(xx, yy) + clear * 0.9 + (0.012 if yy < 1.4 else 0)))
            dense = catmull(pts, n=4)
            L = [self.L(*p) for p in dense]
            ups = []
            for p in dense:
                d = Vector((p[0] * 0.3, p[1] - 1.22, p[2] - ZC))
                ups.append(Vector((d.z, d.y, -d.x)).normalized())
            hw = width / 2; ht = thick / 2
            prof = []
            for k in range(14):
                a = 2 * math.pi * k / 14
                prof.append((ht * math.sin(a), hw * (abs(math.cos(a)) ** 0.3) * (1 if math.cos(a) >= 0 else -1)))
            self.g.mesh(f'strap{side}', sweep(L, prof, up=ups), self.kind, 'body')
            # lower webbing from the strap end around the side to the pack bottom corner
            e = pts[-1]
            low = [e, (side * 0.15, 1.20, front_z(side * 0.15, 1.20) + 0.012), (side * 0.205, 1.13, 0.0),
                   (side * 0.19, 1.10, -0.12), (side * (half_w_pack - 0.03), bottom_y_pack + 0.04, OZ - 0.01)]
            dl = catmull(low, n=6)
            Ll = [self.L(*p) for p in dl]
            ups = []
            for p in dl:
                d = Vector((p[0], 0.0, p[2] - ZC)).normalized()
                ups.append(Vector((d.z, d.y, -d.x)))
            self.webbing(f'lower{side}', Ll, 0.025, 0.0025, ups=ups)
            # ladder-lock buckle where padded strap meets webbing
            p = Vector(self.L(*e)); n = ups[0]
            self.buckle_at(f'buckle{side}', p + n * 0.003, n, w=0.034, h=0.03)
        if sternum:
            y = 1.36
            xa, xb = 0.118, -0.118
            pts = [(xa, y, front_z(0.11, y) + 0.03), (0.0, y, front_z(0.0, y) + 0.04), (xb, y, front_z(-0.11, y) + 0.03)]
            L = [self.L(*p) for p in catmull(pts, n=6)]
            self.webbing('sternum', L, 0.02, 0.0025, ups=(1, 0, 0))
            self.buckle_at('sternum_buckle', self.L(0.0, y, front_z(0.0, y) + 0.043), (1, 0, 0), w=0.05, h=0.026)

    def grab_handle(self, y_top, z_c, w=0.06):
        pts = [(-w / 2, y_top - 0.004, z_c), (-w / 2 + 0.008, y_top + 0.022, z_c), (0, y_top + 0.03, z_c), (w / 2 - 0.008, y_top + 0.022, z_c),
               (w / 2, y_top - 0.004, z_c)]
        L = [self.L(*p) for p in catmull(pts, n=5)]
        self.webbing('grab', L, 0.025, 0.004, ups=(1, 0, 0))

    def compression_strap(self, name, pts_glTF, n_out=None):
        L = [self.L(*p) for p in catmull(pts_glTF, n=5)]
        return self.webbing(name, L, 0.02, 0.0025, ups=n_out or (0, 0, -1))
