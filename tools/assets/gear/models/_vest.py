"""Body-fitted vest / backpack building blocks (wrapped panels, rigid plate bags, MOLLE, straps, pouches).

All functions take glTF character-space metres (x = LEFT, y = up, z = forward) and convert to the kit's local frame
(x = f, y = u, z = s) relative to the asset origin (OX = 0, OY, OZ).
"""
import math
import numpy as np
from mathutils import Vector, Matrix
from gkit import grid_surface, apply_mods, sweep, soft_box, rbox_mesh, catmull, MM, mesh_from_pydata
from _wear import TORSO, _blur, _bilin, front_z, back_z, top_y, ZC

TORSO_S = _blur(TORSO, 2, wrap_x=True)


class Body:
    def __init__(self, g, oy, oz):
        self.g = g; self.oy = oy; self.oz = oz

    # glTF -> kit local metres
    def L(self, x, y, z):
        return Vector((z - self.oz, y - self.oy, -x))

    def Lv(self, v):
        return Vector((v[2], v[1], -v[0]))       # direction

    def r(self, y, th):
        """smoothed torso radius; above 1.27 m the sides are clamped (arms in the A-pose)."""
        a = abs(((th + 180) % 360) - 180)
        yy = y
        if 48 < a < 132 and y > 1.27:
            yy = 1.27
        return _bilin(TORSO_S, yy * 100 - 90, (th % 360) / 5.0, wrap_j=True)

    def wrap(self, th, y, off):
        r = self.r(y, th) + off
        a = math.radians(th)
        return (r * math.sin(a), y, ZC + r * math.cos(a))

    def normal_wrap(self, th, y, off):
        e = 0.002
        p = Vector(self.wrap(th, y, off))
        pa = Vector(self.wrap(th + 0.6, y, off)) - Vector(self.wrap(th - 0.6, y, off))
        pb = Vector(self.wrap(th, y + e, off)) - Vector(self.wrap(th, y - e, off))
        n = pb.cross(pa).normalized()
        out = Vector((p.x, 0, p.z - ZC))
        if n.dot(out) < 0: n = -n
        return n

    # ------------------------------------------------------------------------------------------
    def wrap_panel(self, name, kind, th0, th1, ybot, ytop, off, thick, nu=40, nv=18, bevel=0.35, group='body', subd=0):
        """panel wrapped around the torso between azimuths th0..th1 (deg) and heights ybot(th)..ytop(th) (m)."""
        def fn(a, b):
            th = th0 + (th1 - th0) * a
            y0 = ybot(th) if callable(ybot) else ybot
            y1 = ytop(th) if callable(ytop) else ytop
            y = y0 + (y1 - y0) * b
            return tuple(self.L(*self.wrap(th, y, off)))
        me = grid_surface(fn, nu, nv)
        self._orient(me)
        mods = [('SOLIDIFY', dict(thickness=thick, offset=1.0, use_rim=True, use_even_offset=True))]
        if bevel:
            mods.append(('BEVEL', dict(width=thick * bevel, segments=2, limit_method='ANGLE', angle_limit=math.radians(50))))
        if subd:
            mods.append(('SUBSURF', dict(levels=subd, render_levels=subd)))
        me = apply_mods(me, mods)
        return self.g.mesh(name, me, kind, group)

    def _orient(self, me, sign=1):
        """normals point away from the torso axis (sign=1) or toward it."""
        import bmesh
        c = Vector((ZC - self.oz, 0, 0))
        avg = 0.0
        for p in me.polygons:
            d = p.center - c; d.y = 0
            avg += p.normal.dot(d) * p.area
        if avg * sign < 0:
            bm = bmesh.new(); bm.from_mesh(me)
            bmesh.ops.reverse_faces(bm, faces=bm.faces)
            bm.to_mesh(me); bm.free()

    # ------------------------------------------------------------------------------------------
    def plate_fit(self, side, half_w, y0, y1, gap, R=0.36):
        """rigid single-curve plate surface z(x, y) = a + b (y - yc) + side * (-x^2 / 2R) clear of the body by gap.
        side = +1 front (plate in front of the chest), -1 back."""
        yc = (y0 + y1) / 2
        rows = []
        for yi in np.linspace(y0, y1, 9):
            w = half_w(yi)
            zs = []
            for xi in np.linspace(-w, w, 9):
                if side > 0:
                    zb = front_z(xi, yi)
                    if zb > 0.4: continue
                    zs.append(zb + gap + xi * xi / (2 * R))
                else:
                    zb = back_z(xi, yi)
                    if zb < -0.4: continue
                    zs.append(-(zb - gap - xi * xi / (2 * R)))
            rows.append((yi, max(zs)))
        Y = np.array([r[0] for r in rows]); Z = np.array([r[1] for r in rows])
        b, a = np.polyfit(Y - yc, Z, 1)
        a = max(Z - b * (Y - yc))
        a = a + 0.0005
        def z(x, y):
            v = a + b * (y - yc) - x * x / (2 * R)
            return v if side > 0 else -v
        return z

    def plate_bag(self, name, kind, side, half_w, y0, y1, thick, gap=0.006, R=0.36, nu=24, nv=20, group='body'):
        """padded rigid plate bag; returns (z_inner(x, y), z_outer(x, y)) surface functions (glTF z)."""
        zf = self.plate_fit(side, half_w, y0, y1, gap, R)
        def fn(a, b):
            y = y0 + (y1 - y0) * b
            x = (a * 2 - 1) * half_w(y)
            return tuple(self.L(x, y, zf(x, y)))
        me = grid_surface(fn, nu, nv)
        import bmesh
        # normals toward +side (outward)
        avg = sum(p.normal.x * p.area for p in me.polygons)
        if avg * side < 0:
            bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.reverse_faces(bm, faces=bm.faces); bm.to_mesh(me); bm.free()
        me = apply_mods(me, [('SOLIDIFY', dict(thickness=thick, offset=1.0, use_rim=True, use_even_offset=True)),
                             ('BEVEL', dict(width=thick * 0.42, segments=3, limit_method='ANGLE', angle_limit=math.radians(50)))])
        self.g.mesh(name, me, kind, group)
        zo = lambda x, y: zf(x, y) + side * thick
        return zf, zo

    # ------------------------------------------------------------------------------------------
    def surface_strip(self, name, kind, pt_fn, a0, a1, b0, b1, thick, nu=12, nv=2, group='body', bevel=0.3, outward=None):
        """thin strip on any parametric surface pt_fn(a, b) -> glTF point (already offset off the surface)."""
        def fn(a, b):
            return tuple(self.L(*pt_fn(a0 + (a1 - a0) * a, b0 + (b1 - b0) * b)))
        me = grid_surface(fn, nu, nv)
        if outward is not None:
            import bmesh
            o = self.Lv(outward)
            avg = sum(p.normal.dot(o) * p.area for p in me.polygons)
            if avg < 0:
                bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.reverse_faces(bm, faces=bm.faces); bm.to_mesh(me); bm.free()
        else:
            self._orient(me)
        mods = [('SOLIDIFY', dict(thickness=thick, offset=1.0, use_rim=True, use_even_offset=True))]
        if bevel:
            mods.append(('BEVEL', dict(width=thick * bevel, segments=1, limit_method='ANGLE', angle_limit=math.radians(50))))
        me = apply_mods(me, mods)
        return self.g.mesh(name, me, kind, group)

    def molle_rows(self, name, kind, pt_fn, x0, x1, ys, outward, thick=0.0016, pitch=0.038, h=0.025, gap=0.004):
        """MOLLE: rows of 25 mm webbing loops (one strip per 38 mm loop) on surface pt_fn(x, y)."""
        k = 0
        for y in ys:
            n = int((x1 - x0) // pitch)
            xs0 = (x0 + x1) / 2 - n * pitch / 2
            for i in range(n):
                xa = xs0 + i * pitch + gap / 2; xb = xs0 + (i + 1) * pitch - gap / 2
                self.surface_strip(f'{name}{k}', kind, pt_fn, xa, xb, y - h / 2, y + h / 2, thick, nu=4, nv=1, outward=outward)
                k += 1

    # ------------------------------------------------------------------------------------------
    def frame_at(self, p, n, up=(0, 1, 0)):
        """4x4 matrix (kit local metres) placing a box built with x = depth (normal), y = up, z = width at glTF point p."""
        P = self.L(*p)
        nx = self.Lv(n).normalized()
        upv = self.Lv(up)
        upv = (upv - nx * upv.dot(nx)).normalized()
        zc = nx.cross(upv).normalized()
        M = Matrix.Identity(4)
        for i in range(3):
            M[i][0] = nx[i]; M[i][1] = upv[i]; M[i][2] = zc[i]; M[i][3] = P[i]
        return M

    def pouch(self, name, kind, p, n, w, h, d, flap=True, flap_kind=None, up=(0, 1, 0), seed=0, group='body', puff=0.006,
              wrinkle=0.0012, buckle='plastic_blk'):
        """soft pouch on a surface point p with normal n (glTF). Box dims: w (lateral), h (up), d (depth)."""
        M = self.frame_at(p, n, up) @ Matrix.Translation((d / 2, 0, 0))
        me = soft_box(d, h, w, min(d, w, h) * 0.22, puff=puff, wrinkle=wrinkle, wscale=0.025, seed=seed, subd=2)
        self.g.mesh(name, me, kind, group, M=M)
        if flap:
            fk = flap_kind or kind
            fm = soft_box(d * 1.12 + 0.004, 0.012, w * 1.04, 0.005, puff=0.002, wrinkle=wrinkle * 0.6, seed=seed + 3, subd=2)
            self.g.mesh(name + '_flap', fm, fk, group, M=M @ Matrix.Translation((0.002, h / 2 + 0.002, 0)))
            tab = soft_box(0.006, h * 0.42, 0.034, 0.002, subd=1)
            self.g.mesh(name + '_tab', tab, fk, group, M=M @ Matrix.Translation((d / 2 + 0.006, h / 2 - h * 0.18, 0)))
        return M

    def mag_pouch(self, name, kind, p, n, w=0.078, h=0.105, d=0.034, mag_kind='poly', up=(0, 1, 0), seed=0, group='body',
                  cord_kind='elastic_blk'):
        """open-top rifle magazine pouch with the magazine showing and a bungee retention cord."""
        M = self.frame_at(p, n, up) @ Matrix.Translation((d / 2, 0, 0))
        me = soft_box(d, h, w, 0.008, puff=0.003, wrinkle=0.0008, wscale=0.02, seed=seed, subd=2)
        self.g.mesh(name, me, kind, group, M=M)
        mg = rbox_mesh(0.024, h * 0.5, 0.064, 0.004)
        self.g.mesh(name + '_mag', mg, mag_kind, group, M=M @ Matrix.Translation((0.0, h / 2 + 0.005, 0)) @ Matrix.Rotation(math.radians(-8), 4, 'Z'))
        base = rbox_mesh(0.03, 0.008, 0.07, 0.003)
        self.g.mesh(name + '_mbase', base, mag_kind, group, M=M @ Matrix.Translation((0.0, h / 2 + 0.005 + h * 0.25, 0)) @ Matrix.Rotation(math.radians(-8), 4, 'Z'))
        # bungee over the top
        pts = [Vector((-d / 2 - 0.002, h / 2 - 0.01, -w * 0.3)), Vector((0.0, h / 2 + 0.032, -w * 0.12)), Vector((0.012, h / 2 + 0.04, 0)),
               Vector((0.0, h / 2 + 0.032, w * 0.12)), Vector((-d / 2 - 0.002, h / 2 - 0.01, w * 0.3))]
        pts = [Vector((p.x + d / 2 + 0.002, p.y, p.z)) for p in pts]
        prof = [(math.cos(2 * math.pi * k / 6) * 0.0018, math.sin(2 * math.pi * k / 6) * 0.0018) for k in range(6)]
        cm = sweep(catmull(pts, n=5), prof)
        self.g.mesh(name + '_cord', cm, cord_kind, group, M=M)
        tab = soft_box(0.006, 0.02, 0.022, 0.002, subd=1)
        self.g.mesh(name + '_pull', tab, cord_kind, group, M=M @ Matrix.Translation((d / 2 + 0.014, h / 2 + 0.04, 0)))
        return M

    # ------------------------------------------------------------------------------------------
    def shoulder_strap(self, name, kind, x, front_pt, back_pt, width=0.055, thick=0.010, off=0.010, group='body', n=8):
        """padded strap from front_pt over the shoulder at lateral x to back_pt (glTF points)."""
        pts = [Vector(front_pt)]
        fz = front_pt[2]; bz = back_pt[2]
        for zz in np.linspace(min(fz - 0.02, 0.07), max(bz + 0.02, -0.09), n):
            y = top_y(x, zz) + off + thick / 2
            pts.append(Vector((x, y, zz)))
        pts.append(Vector(back_pt))
        dense = catmull([tuple(p) for p in pts], n=4)
        L = [self.L(*p) for p in dense]
        lat = Vector((0, 0, 1))                        # local s axis
        ups = []
        for i in range(len(L)):
            t = (L[min(i + 1, len(L) - 1)] - L[max(i - 1, 0)]).normalized()
            u = t.cross(lat).normalized()
            if u.y < 0 and abs(u.y) > abs(u.x) * 0.3: u = -u
            # outward: away from the body centre line
            c = Vector((ZC - self.oz, L[i].y, 0))
            if (L[i] - c).dot(u) < 0 and abs(u.y) < 0.5: u = -u
            ups.append(u)
        hw = width / 2; ht = thick / 2
        prof = []
        for k in range(16):
            a = 2 * math.pi * k / 16
            prof.append((ht * math.sin(a) * 1.0, hw * (abs(math.cos(a)) ** 0.35) * (1 if math.cos(a) >= 0 else -1)))
        me = sweep(L, prof, up=ups)
        return self.g.mesh(name, me, kind, group)
