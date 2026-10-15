"""
vkit -- scripted vehicle authoring kit for Blender 4.5 (headless).

Authoring frame ("vehicle coords", metres):
  f = forward, u = up (0 = ground), s = lateral, + = vehicle LEFT (driver side on a LHD car).
  The origin is on the ground at the centre of the wheelbase.
Blender coords: x = s, y = -f, z = u   ->  glTF export (+Y up) gives (x, y, z) = (s, u, f): +Z forward, left = +X.

A vehicle module defines build(v: Vehicle). Run via build.py.
"""
import bpy, bmesh, math, os, json, time
from mathutils import Vector, Matrix

# ----------------------------------------------------------------------------------------------
# frames
# ----------------------------------------------------------------------------------------------
def V(f, u, s=0.0):
    return Vector((s, -f, u))


# local frame matrices (local -> vehicle-blender). Profiles are authored in a 2D plane and extruded along local Z.
M_SIDE = Matrix(((0, 0, -1, 0), (-1, 0, 0, 0), (0, 1, 0, 0), (0, 0, 0, 1)))   # local (x=f, y=u, z=-s)
M_FRONT = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))   # local (x=s, y=u, z=f)
M_TOP = Matrix(((0, 1, 0, 0), (-1, 0, 0, 0), (0, 0, 1, 0), (0, 0, 0, 1)))     # local (x=f, y=s, z=u)
# lathe local axis is X (profile (x, r)); map lathe X to a vehicle axis
L_AX = {
    's': Matrix(((1, 0, 0, 0), (0, 1, 0, 0), (0, 0, 1, 0), (0, 0, 0, 1))),     # axis along s (wheels)
    'f': Matrix(((0, 1, 0, 0), (-1, 0, 0, 0), (0, 0, 1, 0), (0, 0, 0, 1))),    # axis along f (props, pipes)
    'u': Matrix(((0, 0, 1, 0), (0, -1, 0, 0), (1, 0, 0, 0), (0, 0, 0, 1))),    # axis along u
}


def TR(f=0.0, u=0.0, s=0.0):
    return Matrix.Translation(V(f, u, s))


def rot(axis, deg, f=0.0, u=0.0, s=0.0):
    """rotation about a vehicle axis through (f,u,s), right-handed in BLENDER coords ('s' = +X_b, 'f' = -Y_b, 'u' = +Z_b).
    Prefer the named helpers below."""
    ax = {'f': Vector((0, -1, 0)), 's': Vector((1, 0, 0)), 'u': Vector((0, 0, 1))}[axis]
    return TR(f, u, s) @ Matrix.Rotation(math.radians(deg), 4, ax) @ TR(-f, -u, -s)


def pitch_up(deg, f=0.0, u=0.0):
    """rotation in the side plane about the s axis through (f,u): positive raises +f (nose up)."""
    return rot('s', -deg, f, u)


def yaw_left(deg, f=0.0, s=0.0):
    """rotation about the vertical through (f,s): positive turns +f toward +s (left)."""
    return rot('u', deg, f, 0.0, s)


def roll_left(deg, u=0.0, s=0.0):
    """rotation about the f axis through (u,s): positive lifts the +s (left) side."""
    return rot('f', deg, 0.0, u, s)


# ----------------------------------------------------------------------------------------------
# 2D helpers
# ----------------------------------------------------------------------------------------------
def _signed_area(P):
    a = 0.0
    for i in range(len(P)):
        x0, y0 = P[i][0], P[i][1]; x1, y1 = P[(i + 1) % len(P)][0], P[(i + 1) % len(P)][1]
        a += x0 * y1 - x1 * y0
    return a / 2


def dedupe(pts, eps=1e-6):
    out = []
    for q in pts:
        if not out or abs(q[0] - out[-1][0]) > eps or abs(q[1] - out[-1][1]) > eps:
            out.append(q)
    while len(out) > 2 and abs(out[0][0] - out[-1][0]) <= eps and abs(out[0][1] - out[-1][1]) <= eps:
        out.pop()
    return out


def rpoly(ctrl, nseg=4, closed=True, edge_div=None):
    """Rounded polygon with a FIXED number of samples: every control point (x, y, r) becomes an arc of nseg+1 points
    (degenerate radii keep the same count), every edge i gets edge_div[i] extra interior points.
    Returns a list of (x, y)."""
    n = len(ctrl)
    out = []
    for i in range(n):
        if not closed and (i == 0 or i == n - 1):
            out.append((ctrl[i][0], ctrl[i][1]))
            if edge_div and i < n - 1:
                out += _edge_pts(ctrl, i, edge_div[i], closed, nseg)
            continue
        p = ctrl[i]; r = p[2] if len(p) > 2 else 0.0
        P = Vector((p[0], p[1]))
        A = Vector(ctrl[i - 1][:2]); B = Vector(ctrl[(i + 1) % n][:2])
        da = A - P; db = B - P
        la, lb = da.length, db.length
        pts = None
        if la > 1e-9 and lb > 1e-9:
            da /= la; db /= lb
            ang = math.acos(max(-1.0, min(1.0, da.dot(db))))
            if 1e-4 < ang < math.pi - 1e-4 and r > 1e-6:
                t = r / math.tan(ang / 2)
                ra = ctrl[i - 1][2] if len(ctrl[i - 1]) > 2 else 0.0
                rb = ctrl[(i + 1) % n][2] if len(ctrl[(i + 1) % n]) > 2 else 0.0
                tmax = min(la * (0.5 if ra > 0 else 0.98), lb * (0.5 if rb > 0 else 0.98))
                if not closed:
                    if i - 1 == 0: tmax = min(tmax, la * 0.98)
                    if i + 1 == n - 1: tmax = min(tmax, lb * 0.98)
                if t > tmax:
                    t = tmax; r = t * math.tan(ang / 2)
                T1 = P + da * t; T2 = P + db * t
                C = P + (da + db).normalized() * (r / math.sin(ang / 2))
                a1 = math.atan2(T1.y - C.y, T1.x - C.x); a2 = math.atan2(T2.y - C.y, T2.x - C.x)
                d = a2 - a1
                while d > math.pi: d -= 2 * math.pi
                while d < -math.pi: d += 2 * math.pi
                pts = [(C.x + r * math.cos(a1 + d * j / nseg), C.y + r * math.sin(a1 + d * j / nseg)) for j in range(nseg + 1)]
        if pts is None:
            # degenerate: spread the samples over a tiny span along the bisector-normal so counts stay fixed
            pts = [(P.x, P.y)] * (nseg + 1)
        out += pts
        if edge_div and (closed or i < n - 1):
            out += _edge_pts(ctrl, i, edge_div[i], closed, nseg, last=pts[-1])
    return out


def _edge_pts(ctrl, i, k, closed, nseg, last=None):
    if not k:
        return []
    n = len(ctrl)
    a = Vector(last if last is not None else ctrl[i][:2])
    b = Vector(ctrl[(i + 1) % n][:2])
    # the next corner's arc starts somewhere along the edge; approximate the edge end as the next corner point
    # pulled back by its tangent length -> recompute cheaply by sampling rpoly of the next corner
    nxt = rpoly_corner_start(ctrl, (i + 1) % n, nseg, closed)
    if nxt is not None:
        b = Vector(nxt)
    return [tuple(a.lerp(b, j / (k + 1))) for j in range(1, k + 1)]


def rpoly_corner_start(ctrl, i, nseg, closed):
    n = len(ctrl)
    if not closed and (i == 0 or i == n - 1):
        return ctrl[i][:2]
    p = ctrl[i]; r = p[2] if len(p) > 2 else 0.0
    P = Vector((p[0], p[1])); A = Vector(ctrl[i - 1][:2]); B = Vector(ctrl[(i + 1) % n][:2])
    da = A - P; db = B - P; la, lb = da.length, db.length
    if la < 1e-9 or lb < 1e-9 or r <= 1e-6:
        return (P.x, P.y)
    da /= la; db /= lb
    ang = math.acos(max(-1.0, min(1.0, da.dot(db))))
    if not (1e-4 < ang < math.pi - 1e-4):
        return (P.x, P.y)
    t = r / math.tan(ang / 2)
    ra = ctrl[i - 1][2] if len(ctrl[i - 1]) > 2 else 0.0
    rb = ctrl[(i + 1) % n][2] if len(ctrl[(i + 1) % n]) > 2 else 0.0
    tmax = min(la * (0.5 if ra > 0 else 0.98), lb * (0.5 if rb > 0 else 0.98))
    t = min(t, tmax)
    T1 = P + da * t
    return (T1.x, T1.y)


def erode_ctrl(ctrl, d):
    """offset a closed control polygon inward by d (corner radii shrink on convex, grow on reflex corners)."""
    if d <= 0:
        return [tuple(c) for c in ctrl]
    n = len(ctrl)
    ccw = _signed_area(ctrl) > 0
    out = []
    for i in range(n):
        P = Vector(ctrl[i][:2]); A = Vector(ctrl[i - 1][:2]); B = Vector(ctrl[(i + 1) % n][:2])
        e1 = (P - A); e2 = (B - P)
        if e1.length < 1e-9 or e2.length < 1e-9:
            out.append(tuple(ctrl[i])); continue
        e1.normalize(); e2.normalize()
        # inward normals
        n1 = Vector((-e1.y, e1.x)) if ccw else Vector((e1.y, -e1.x))
        n2 = Vector((-e2.y, e2.x)) if ccw else Vector((e2.y, -e2.x))
        bis = n1 + n2
        if bis.length < 1e-6:
            bis = n1
        bis.normalize()
        cosh = max(0.2, bis.dot(n1))
        Q = P + bis * (d / cosh)
        cross = e1.x * e2.y - e1.y * e2.x
        convex = (cross > 0) == ccw
        r = ctrl[i][2] if len(ctrl[i]) > 2 else 0.0
        r2 = max(r - d, 0.0005) if convex else r + d
        out.append((Q.x, Q.y, r2))
    return out


def pchip(xs, ys, x):
    """monotone cubic interpolation of one scalar series at x"""
    n = len(xs)
    if n == 1:
        return ys[0]
    if x <= xs[0]:
        return ys[0]
    if x >= xs[-1]:
        return ys[-1]
    h = [xs[i + 1] - xs[i] for i in range(n - 1)]
    dl = [(ys[i + 1] - ys[i]) / h[i] if h[i] > 0 else 0.0 for i in range(n - 1)]
    m = [0.0] * n
    m[0] = dl[0]; m[-1] = dl[-1]
    for i in range(1, n - 1):
        if dl[i - 1] * dl[i] <= 0:
            m[i] = 0.0
        else:
            w1 = 2 * h[i] + h[i - 1]; w2 = h[i] + 2 * h[i - 1]
            m[i] = (w1 + w2) / (w1 / dl[i - 1] + w2 / dl[i])
    k = 0
    while k < n - 2 and x > xs[k + 1]:
        k += 1
    t = (x - xs[k]) / h[k] if h[k] > 0 else 0.0
    t2, t3 = t * t, t * t * t
    return ((2 * t3 - 3 * t2 + 1) * ys[k] + (t3 - 2 * t2 + t) * h[k] * m[k] + (-2 * t3 + 3 * t2) * ys[k + 1]
            + (t3 - t2) * h[k] * m[k + 1])


def lerp_keys(keys, x, smooth=True):
    """keys: [(x, [values...])]; returns interpolated values list"""
    xs = [k[0] for k in keys]
    nv = len(keys[0][1])
    out = []
    for j in range(nv):
        ys = [k[1][j] for k in keys]
        if smooth:
            out.append(pchip(xs, ys, x))
        else:
            if x <= xs[0]: out.append(ys[0]); continue
            if x >= xs[-1]: out.append(ys[-1]); continue
            i = max(i for i in range(len(xs) - 1) if xs[i] <= x)
            t = (x - xs[i]) / (xs[i + 1] - xs[i]); out.append(ys[i] + (ys[i + 1] - ys[i]) * t)
    return out


def mirror_half(half):
    """half profile listed from bottom-centre (s=0) around the LEFT side (+s) to top-centre (s=0), as (s,u[,r]).
    Returns the full closed control polygon (CCW in (s,u)): [bottom-centre, left..., top-centre, right...].
    Edge count = 2 * (len(half) - 1)."""
    mid = half[1:-1]
    right = [(-p[0], p[1]) + tuple(p[2:]) for p in reversed(mid)]
    return [half[0]] + list(mid) + [half[-1]] + right


def sym_div(half_div):
    """edge subdivision list for mirror_half: half_div lists the edges from bottom-centre to top-centre"""
    return list(half_div) + list(reversed(half_div))


# ----------------------------------------------------------------------------------------------
# mesh builders (return a bpy mesh in VEHICLE-BLENDER coords)
# ----------------------------------------------------------------------------------------------
def mesh_from_bm(bm, name='m'):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    return me


def loft_mesh(sections, cap0=True, cap1=True, closed=True, name='loft'):
    """sections: list of (f, [(s,u)...]) with equal point counts -> quad skin (+ n-gon caps)."""
    bm = bmesh.new()
    rings = []
    for f, pts in sections:
        rings.append([bm.verts.new(V(f, p[1], p[0])) for p in pts])
    n = len(rings[0])
    for a, b in zip(rings, rings[1:]):
        for j in range(n if closed else n - 1):
            j2 = (j + 1) % n
            q = [a[j], b[j], b[j2], a[j2]]
            try:
                bm.faces.new(q)
            except ValueError:
                pass
    if closed:
        for ring, cap in ((rings[0], cap0), (rings[-1], cap1)):
            if cap:
                try:
                    bm.faces.new(ring)
                except ValueError:
                    pass
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.dissolve_degenerate(bm, edges=bm.edges, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ngons = [f for f in bm.faces if len(f.verts) > 4]
    if ngons:
        bmesh.ops.triangulate(bm, faces=ngons, quad_method='BEAUTY', ngon_method='BEAUTY')
    return mesh_from_bm(bm, name)


def block_sections(keys, fs=None, nseg=4, n_f=16, end0=0.0, end1=0.0, n_end=4, edge_div=None, smooth=True):
    """keys: [(f, ctrl)] where ctrl is a closed polygon [(s,u,r)] (same length for every key).
    end0/end1: rounding radius of the rear (min f) / front (max f) ends.
    Returns sections for loft_mesh."""
    f0, f1 = keys[0][0], keys[-1][0]
    if fs is None:
        core0 = f0 + end0; core1 = f1 - end1
        fs = set()
        for i in range(n_f + 1):
            fs.add(core0 + (core1 - core0) * i / n_f)
        for k in keys:
            if core0 <= k[0] <= core1:
                fs.add(k[0])
        for i in range(1, n_end + 1):
            a = (math.pi / 2) * i / n_end
            if end0 > 0: fs.add(core0 - end0 * math.sin(a))
            if end1 > 0: fs.add(core1 + end1 * math.sin(a))
        fs = sorted(fs)
        # drop near-duplicates
        ded = [fs[0]]
        for x in fs[1:]:
            if x - ded[-1] > 1e-4: ded.append(x)
        fs = ded
    flat = [(k[0], [c for p in k[1] for c in (p[0], p[1], p[2] if len(p) > 2 else 0.0)]) for k in keys]
    secs = []
    for f in fs:
        vals = lerp_keys(flat, f, smooth)
        ctrl = [(vals[3 * i], vals[3 * i + 1], max(vals[3 * i + 2], 0.0)) for i in range(len(vals) // 3)]
        d = 0.0
        if end0 > 0 and f < f0 + end0:
            x = (f0 + end0) - f; d = end0 - math.sqrt(max(end0 * end0 - x * x, 0.0))
        if end1 > 0 and f > f1 - end1:
            x = f - (f1 - end1); d = max(d, end1 - math.sqrt(max(end1 * end1 - x * x, 0.0)))
        if d > 0:
            ctrl = erode_ctrl(ctrl, d)
        secs.append((f, rpoly(ctrl, nseg, True, edge_div)))
    return secs


def curve_extrude_mesh(loops, depth, bevel=0.0, bres=2, center=True):
    """closed 2D loops (x,y) metres (first = outer, others holes) extruded along local Z by depth with round bevel"""
    cu = bpy.data.curves.new('tmp', 'CURVE')
    cu.dimensions = '2D'; cu.fill_mode = 'BOTH'
    half = depth / 2.0
    b = min(bevel, half * 0.98)
    if b > 1e-5:
        loops = _shrink_loops(loops, b)
        if loops is None:
            b = 0.0
            loops = _orig_loops
    for loop in loops:
        sp = cu.splines.new('POLY')
        sp.points.add(len(loop) - 1)
        for p, q in zip(sp.points, loop):
            p.co = (q[0], q[1], 0.0, 1.0)
        sp.use_cyclic_u = True
    if b > 1e-5:
        cu.bevel_mode = 'ROUND'; cu.bevel_depth = b; cu.bevel_resolution = bres; cu.offset = 0.0
    cu.extrude = max(half - b, 0.0)
    ob = bpy.data.objects.new('tmp', cu)
    bpy.context.scene.collection.objects.link(ob)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    bpy.data.objects.remove(ob); bpy.data.curves.remove(cu)
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    if not center:
        bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0, half))
    bm.to_mesh(me); bm.free()
    return me


_orig_loops = None


def _shrink_loops(loops, b):
    global _orig_loops
    _orig_loops = loops
    from shapely.geometry import Polygon
    try:
        poly = Polygon(loops[0], [l for l in loops[1:] if len(l) >= 3]).buffer(0)
    except Exception:
        return None
    if poly.is_empty:
        return None
    sh = poly.buffer(-b, join_style=1, quad_segs=4)
    if sh.is_empty or sh.geom_type != 'Polygon' or sh.area < 0.2 * poly.area:
        return None
    sh = sh.simplify(b * 0.05, preserve_topology=True)
    out = [list(sh.exterior.coords)[:-1]]
    for h in sh.interiors:
        out.append(list(h.coords)[:-1])
    return out


def lathe_mesh(profile, segs=24, a0=0.0, a1=360.0, cap0=True, cap1=True, closed=False):
    """profile [(x, r)] revolved about local X: vert = (x, r cos a, r sin a)"""
    bm = bmesh.new()
    full = abs(a1 - a0) >= 359.9
    cnt = segs if full else segs + 1
    rings = []
    for (x, r) in profile:
        ring = []
        for j in range(cnt):
            a = math.radians(a0 + (a1 - a0) * j / segs)
            ring.append(bm.verts.new((x, r * math.cos(a), r * math.sin(a))))
        rings.append(ring)
    pairs = [(i, i + 1) for i in range(len(rings) - 1)]
    if closed:
        pairs.append((len(rings) - 1, 0))
    for (i, k) in pairs:
        for j in range(cnt if full else cnt - 1):
            j2 = (j + 1) % cnt
            try:
                bm.faces.new([rings[i][j], rings[k][j], rings[k][j2], rings[i][j2]])
            except ValueError:
                pass
    if full and not closed:
        if cap0 and profile[0][1] > 1e-6:
            try: bm.faces.new(list(reversed(rings[0])))
            except ValueError: pass
        if cap1 and profile[-1][1] > 1e-6:
            try: bm.faces.new(rings[-1])
            except ValueError: pass
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-7)
    bmesh.ops.dissolve_degenerate(bm, edges=bm.edges, dist=1e-7)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ngons = [f for f in bm.faces if len(f.verts) > 4]
    if ngons:
        bmesh.ops.triangulate(bm, faces=ngons, quad_method='BEAUTY', ngon_method='BEAUTY')
    return mesh_from_bm(bm, 'lathe')


def tube_mesh(pts, radius, segs=12, bend_r=None, closed=False, cap=True, bend_segs=4):
    """tube along a 3D polyline (blender coords) with rounded bends (bend_r) -> mesh"""
    P = [Vector(p) for p in pts]
    if bend_r and len(P) > 2:
        Q = [P[0]]
        for i in range(1, len(P) - 1):
            a, b, c = P[i - 1], P[i], P[i + 1]
            da = (a - b); db = (c - b)
            la, lb = da.length, db.length
            if la < 1e-9 or lb < 1e-9:
                Q.append(b); continue
            da /= la; db /= lb
            ang = math.acos(max(-1, min(1, da.dot(db))))
            if ang > math.pi - 1e-3:
                Q.append(b); continue
            t = min(bend_r / math.tan(ang / 2), la * 0.49, lb * 0.49)
            r = t * math.tan(ang / 2)
            T1 = b + da * t; T2 = b + db * t
            C = b + (da + db).normalized() * (r / math.sin(ang / 2))
            v1 = T1 - C; v2 = T2 - C
            for j in range(bend_segs + 1):
                w = j / bend_segs
                # slerp between v1 and v2
                om = v1.angle(v2)
                if om < 1e-6:
                    Q.append(C + v1); continue
                q = (math.sin((1 - w) * om) * v1 + math.sin(w * om) * v2) / math.sin(om)
                Q.append(C + q)
        Q.append(P[-1])
        P = Q
    bm = bmesh.new()
    rings = []
    # parallel-transport frames
    tan0 = (P[1] - P[0]).normalized()
    ref = Vector((0, 0, 1)) if abs(tan0.z) < 0.9 else Vector((1, 0, 0))
    nrm = tan0.cross(ref).normalized()
    prev_t = tan0
    for i, p in enumerate(P):
        if i == 0:
            t = tan0
        elif i == len(P) - 1:
            t = (P[i] - P[i - 1]).normalized()
        else:
            t = ((P[i] - P[i - 1]).normalized() + (P[i + 1] - P[i]).normalized()).normalized()
        # transport
        axis = prev_t.cross(t)
        if axis.length > 1e-8:
            ang = prev_t.angle(t)
            nrm = Matrix.Rotation(ang, 3, axis.normalized()) @ nrm
        prev_t = t
        bn = t.cross(nrm).normalized()
        # scale radius on bends to keep thickness (miter)
        k = 1.0
        if 0 < i < len(P) - 1:
            d1 = (P[i] - P[i - 1]).normalized(); c = max(0.5, d1.dot(t)); k = 1.0 / c
        ring = []
        for j in range(segs):
            a = 2 * math.pi * j / segs
            off = nrm * math.cos(a) * radius + bn * math.sin(a) * radius
            # stretch only along the bend plane component
            ring.append(bm.verts.new(p + off * (1.0 if k == 1.0 else 1.0)))
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        for j in range(segs):
            j2 = (j + 1) % segs
            bm.faces.new([a[j], b[j], b[j2], a[j2]])
    if cap and not closed:
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ngons = [f for f in bm.faces if len(f.verts) > 4]
    if ngons:
        bmesh.ops.triangulate(bm, faces=ngons, quad_method='BEAUTY', ngon_method='BEAUTY')
    return mesh_from_bm(bm, 'tube')


def rbox_mesh(sx, sy, sz, r=0.0, segs=3):
    """rounded box centred at origin (local), dims sx,sy,sz, edge radius r"""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=bm.verts)
    if r > 0:
        r = min(r, sx * 0.49, sy * 0.49, sz * 0.49)
        bmesh.ops.bevel(bm, geom=list(bm.verts) + list(bm.edges), offset=r, segments=segs, profile=0.5, affect='EDGES', clamp_overlap=True)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return mesh_from_bm(bm, 'rbox')


def apply_fn(me, fn):
    """deform mesh vertices with fn(Vector_blender) -> Vector_blender"""
    for v in me.vertices:
        v.co = fn(v.co.copy())
    me.update()
    return me


def subdiv_mesh(me, levels=1, simple=False):
    bm = bmesh.new(); bm.from_mesh(me)
    for _ in range(levels):
        bmesh.ops.subdivide_edges(bm, edges=bm.edges, cuts=1, use_grid_fill=True, smooth=0.0 if simple else 1.0)
    bm.to_mesh(me); bm.free()
    return me


# ----------------------------------------------------------------------------------------------
# materials ("kinds"). Every part gets a kind; kinds are baked into the atlas and mapped to final glTF materials.
# ----------------------------------------------------------------------------------------------
def srgb(h):
    if isinstance(h, str):
        h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    else:
        c = list(h)
    return tuple(((x / 12.92) if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4) for x in c) + (1.0,)


# final: which glTF material the kind ends up in. paint kinds are baked NEUTRAL and tinted by the material colour.
# base/var: albedo, rough, metal, dirt: how much grime collects, wear: edge wear amount (shows wear colour), pat: micro pattern
KINDS = {
    'paint':        dict(final='paint', base='#c8c8c8', rough=0.42, metal=0.0, dirt=1.0, wear=0.35, wear_col='#5a5a58', wear_metal=0.0, pat='orange'),
    'paint_matte':  dict(final='paint', base='#c8c8c8', rough=0.62, metal=0.0, dirt=1.0, wear=0.45, wear_col='#4d4c48', wear_metal=0.0, pat='orange'),
    'paint_in':     dict(final='paint', base='#b4b4b4', rough=0.6, metal=0.0, dirt=0.7, wear=0.4, wear_col='#4d4c48', wear_metal=0.0, pat='orange'),
    'black_paint':  dict(final='trim', base='#1c1d1e', rough=0.55, metal=0.0, dirt=0.8, wear=0.5, wear_col='#4a4846', wear_metal=0.6, pat='orange'),
    'chassis':      dict(final='trim', base='#1f1e1c', rough=0.7, metal=0.1, dirt=1.6, wear=0.3, wear_col='#3a3530', wear_metal=0.5, pat='rough'),
    'chrome':       dict(final='trim', base='#d8d8d8', rough=0.12, metal=1.0, dirt=0.5, wear=0.1, wear_col='#a0a0a0', wear_metal=1.0, pat='none'),
    'alu':          dict(final='trim', base='#a8a8a6', rough=0.35, metal=1.0, dirt=0.8, wear=0.1, wear_col='#c0c0c0', wear_metal=1.0, pat='rough'),
    'steel':        dict(final='trim', base='#6a6a68', rough=0.45, metal=1.0, dirt=1.0, wear=0.2, wear_col='#9a9a98', wear_metal=1.0, pat='rough'),
    'rust':         dict(final='trim', base='#5a3a26', rough=0.85, metal=0.2, dirt=1.0, wear=0.0, wear_col='#5a3a26', wear_metal=0.2, pat='rough'),
    'exhaust':      dict(final='trim', base='#4a3a30', rough=0.75, metal=0.6, dirt=1.4, wear=0.0, wear_col='#4a3a30', wear_metal=0.6, pat='rough'),
    'rubber':       dict(final='trim', base='#1b1b1b', rough=0.88, metal=0.0, dirt=1.4, wear=0.2, wear_col='#2c2b29', wear_metal=0.0, pat='rubber'),
    'tire':         dict(final='trim', base='#1a1a1a', rough=0.9, metal=0.0, dirt=1.6, wear=0.25, wear_col='#2d2c2a', wear_metal=0.0, pat='rubber'),
    'seal':         dict(final='trim', base='#121212', rough=0.75, metal=0.0, dirt=0.5, wear=0.0, wear_col='#121212', wear_metal=0.0, pat='rubber'),
    'gap':          dict(final='trim', base='#0a0a0a', rough=0.9, metal=0.0, dirt=0.0, wear=0.0, wear_col='#0a0a0a', wear_metal=0.0, pat='none'),
    'plastic':      dict(final='trim', base='#1e1e1f', rough=0.6, metal=0.0, dirt=0.8, wear=0.2, wear_col='#3a3a3a', wear_metal=0.0, pat='grain'),
    'plastic_grey': dict(final='trim', base='#5e5e5c', rough=0.6, metal=0.0, dirt=0.8, wear=0.2, wear_col='#7a7a78', wear_metal=0.0, pat='grain'),
    'vinyl':        dict(final='trim', base='#2a2522', rough=0.55, metal=0.0, dirt=0.6, wear=0.3, wear_col='#4a4440', wear_metal=0.0, pat='grain'),
    'vinyl_brown':  dict(final='trim', base='#4a3020', rough=0.5, metal=0.0, dirt=0.6, wear=0.35, wear_col='#6a4a35', wear_metal=0.0, pat='grain'),
    'fabric':       dict(final='trim', base='#3a3632', rough=0.95, metal=0.0, dirt=0.6, wear=0.1, wear_col='#4a4642', wear_metal=0.0, pat='fabric'),
    'canvas':       dict(final='trim', base='#4b4e33', rough=0.92, metal=0.0, dirt=1.0, wear=0.15, wear_col='#5e6045', wear_metal=0.0, pat='fabric'),
    'carpet':       dict(final='trim', base='#222120', rough=1.0, metal=0.0, dirt=1.0, wear=0.0, wear_col='#222120', wear_metal=0.0, pat='fabric'),
    'reflector':    dict(final='trim', base='#e0e0e0', rough=0.15, metal=1.0, dirt=0.0, wear=0.0, wear_col='#e0e0e0', wear_metal=1.0, pat='none'),
    'lens_amber':   dict(final='trim', base='#c86a10', rough=0.15, metal=0.0, dirt=0.4, wear=0.0, wear_col='#c86a10', wear_metal=0.0, pat='none'),
    'lens_red_dim': dict(final='trim', base='#5a0a08', rough=0.2, metal=0.0, dirt=0.4, wear=0.0, wear_col='#5a0a08', wear_metal=0.0, pat='none'),
    'gauge':        dict(final='trim', base='#0e0e0e', rough=0.3, metal=0.0, dirt=0.0, wear=0.0, wear_col='#0e0e0e', wear_metal=0.0, pat='none'),
    'wood':         dict(final='trim', base='#6b4a2e', rough=0.6, metal=0.0, dirt=0.8, wear=0.3, wear_col='#8a6a4a', wear_metal=0.0, pat='grain'),
    'hull':         dict(final='paint', base='#d2d2d2', rough=0.3, metal=0.0, dirt=0.8, wear=0.2, wear_col='#909090', wear_metal=0.0, pat='orange'),
    'antifoul':     dict(final='trim', base='#5a1a14', rough=0.8, metal=0.0, dirt=1.0, wear=0.2, wear_col='#3a2a20', wear_metal=0.0, pat='rough'),
    'grille':       dict(final='trim', base='#2a2a2a', rough=0.55, metal=0.6, dirt=0.8, wear=0.0, wear_col='#2a2a2a', wear_metal=0.6, pat='mesh'),
    'plate':        dict(final='trim', base='#d8d6cc', rough=0.4, metal=0.3, dirt=0.8, wear=0.2, wear_col='#909090', wear_metal=0.8, pat='none'),
    # non-baked (own materials)
    'glass':        dict(final='glass', base='#1a2024', rough=0.05, metal=0.0),
    'lens_head':    dict(final='lamp_head', base='#d8dde0', rough=0.05, metal=0.0),
    'lens_tail':    dict(final='lamp_tail', base='#8a0f0a', rough=0.2, metal=0.0),
}
UNBAKED_FINALS = ('glass', 'lamp_head', 'lamp_tail')


def kind_material(kind):
    name = 'K_' + kind
    m = bpy.data.materials.get(name)
    if m:
        return m
    k = KINDS[kind]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = srgb(k['base'])
    b.inputs['Roughness'].default_value = k['rough']
    b.inputs['Metallic'].default_value = k['metal']
    m['kind'] = kind
    m.diffuse_color = srgb(k['base'])
    return m


# ----------------------------------------------------------------------------------------------
# object helpers
# ----------------------------------------------------------------------------------------------
def link(ob):
    bpy.context.scene.collection.objects.link(ob)
    return ob


def new_obj(name, me, kind=None):
    if kind is not None:
        me.materials.clear(); me.materials.append(kind_material(kind))
    return link(bpy.data.objects.new(name, me))


def obj_apply_matrix(ob, M):
    ob.data.transform(M)
    ob.data.update()


def apply_modifiers(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
    old = ob.data
    ob.modifiers.clear()
    ob.data = me
    if old.users == 0:
        bpy.data.meshes.remove(old)
    return ob


def boolean(target, cutters, op='DIFFERENCE', solver='EXACT', keep=False):
    """apply a boolean between target and one or more cutter objects. Cutter materials are transferred onto the
    faces they create (so a cutter with kind 'gap' paints the walls of the slot it cuts)."""
    if not isinstance(cutters, (list, tuple)):
        cutters = [cutters]
    cutters = [c for c in cutters if c is not None]
    if not cutters:
        return target
    if len(cutters) == 1:
        md = target.modifiers.new('bool', 'BOOLEAN'); md.operation = op; md.solver = solver
        md.object = cutters[0]
    else:
        col = bpy.data.collections.new('cut_tmp')
        bpy.context.scene.collection.children.link(col)
        for c in cutters:
            for uc in list(c.users_collection): uc.objects.unlink(c)
            col.objects.link(c)
        md = target.modifiers.new('bool', 'BOOLEAN'); md.operation = op; md.solver = solver
        md.operand_type = 'COLLECTION'; md.collection = col
    try:
        md.material_mode = 'TRANSFER'
    except Exception:
        pass
    if solver == 'EXACT':
        md.use_self = False; md.use_hole_tolerant = True
    for c in cutters:
        c.hide_render = True
    nf0 = len(target.data.polygons)
    apply_modifiers(target)
    if os.environ.get('VKIT_DEBUG'):
        print('BOOL', op, target.name, [c.name for c in cutters], nf0, '->', len(target.data.polygons))
    if not keep:
        for c in cutters:
            me = c.data
            bpy.data.objects.remove(c)
            if me and me.users == 0:
                bpy.data.meshes.remove(me)
        if len(cutters) > 1:
            bpy.data.collections.remove(col)
    return target


def join(objs, name=None):
    objs = [o for o in objs if o is not None]
    if len(objs) == 1:
        if name: objs[0].name = name
        return objs[0]
    for o in bpy.context.view_layer.objects: o.select_set(False)
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    with bpy.context.temp_override(active_object=objs[0], selected_objects=objs, selected_editable_objects=objs, object=objs[0]):
        bpy.ops.object.join()
    if name:
        objs[0].name = name
    return objs[0]


def dup(ob, name=None, M=None, mirror_s=False, linked=False):
    o2 = ob.copy()
    if not linked:
        o2.data = ob.data.copy()
    o2.name = name or (ob.name + '_dup')
    for k in ob.keys():
        o2[k] = ob[k]
    link(o2)
    if mirror_s:
        o2.data.transform(Matrix.Scale(-1, 4, Vector((1, 0, 0))))
        o2.data.flip_normals()
    if M is not None:
        o2.data.transform(M)
    o2.data.update()
    return o2


def clean_mesh(ob, dist=1e-5):
    bm = bmesh.new(); bm.from_mesh(ob.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=dist)
    bmesh.ops.dissolve_degenerate(bm, edges=bm.edges, dist=1e-7)
    bm.to_mesh(ob.data); bm.free()


# ----------------------------------------------------------------------------------------------
# Vehicle
# ----------------------------------------------------------------------------------------------
class Vehicle:
    def __init__(self, vid):
        self.id = vid
        self.parts = []           # objects (each has ['group'])
        self.empties = {}         # name -> (Matrix world (blender), parent_group or None)
        self.pivots = {}          # group -> Matrix world (blender) of the pivot node
        self.instances = []       # (node_name, template_group, Matrix world of node, Matrix mesh-local, parent_group)
        self.meta = {}
        self.tex = 2048
        self.paint = '#4b5320'
        self.paint_coat = 0.0     # clearcoat weight on the paint material
        self.uv_scale = {}        # kind -> texel density multiplier
        self.group_uv_scale = {}  # group -> texel density multiplier
        self.lamp_glass_alpha = 0.35

    # ---------------- registration ----------------
    def add(self, name, me, kind, group='body', M=None, register=True):
        if M is not None:
            me.transform(M)
            if M.to_3x3().determinant() < 0:
                me.flip_normals()
        ob = new_obj(name, me, kind)
        ob['group'] = group
        if register:
            self.parts.append(ob)
        return ob

    def register(self, ob, group='body'):
        ob['group'] = group
        if ob not in self.parts:
            self.parts.append(ob)
        return ob

    def unregister(self, ob):
        if ob in self.parts:
            self.parts.remove(ob)

    def mirror(self, ob, name=None):
        o2 = dup(ob, name or (ob.name + '_R'), mirror_s=True)
        o2['group'] = ob.get('group', 'body')
        if ob in self.parts:
            self.parts.append(o2)
        return o2

    # ---------------- builders (vehicle coords, metres) ----------------
    def block(self, name, keys, kind, group='body', register=True, **kw):
        """loft of rounded closed sections along f (see block_sections)"""
        secs = block_sections(keys, **kw)
        me = loft_mesh(secs, name=name)
        return self.add(name, me, kind, group, register=register)

    def loft(self, name, sections, kind, group='body', register=True, cap0=True, cap1=True):
        me = loft_mesh(sections, cap0, cap1, name=name)
        return self.add(name, me, kind, group, register=register)

    def side(self, name, ctrl, s0, s1, kind, group='body', bevel=0.0, nseg=4, holes=(), register=True, M=None, bres=2):
        """outline in the side plane (f, u, r) extruded laterally from s0 to s1"""
        loops = [dedupe(rpoly(ctrl, nseg))] + [dedupe(rpoly(h, nseg)) for h in holes]
        me = curve_extrude_mesh(_ccw(loops), abs(s1 - s0), bevel, bres)
        Mx = TR(0, 0, (s0 + s1) / 2) @ M_SIDE
        if M is not None: Mx = M @ Mx
        return self.add(name, me, kind, group, Mx, register)

    def front(self, name, ctrl, f0, f1, kind, group='body', bevel=0.0, nseg=4, holes=(), register=True, M=None, bres=2):
        """outline in the front plane (s, u, r) extruded along f from f0 to f1"""
        loops = [dedupe(rpoly(ctrl, nseg))] + [dedupe(rpoly(h, nseg)) for h in holes]
        me = curve_extrude_mesh(_ccw(loops), abs(f1 - f0), bevel, bres)
        Mx = TR((f0 + f1) / 2, 0, 0) @ M_FRONT
        if M is not None: Mx = M @ Mx
        return self.add(name, me, kind, group, Mx, register)

    def top(self, name, ctrl, u0, u1, kind, group='body', bevel=0.0, nseg=4, holes=(), register=True, M=None, bres=2):
        """outline in the plan plane (f, s, r) extruded vertically from u0 to u1"""
        loops = [dedupe(rpoly(ctrl, nseg))] + [dedupe(rpoly(h, nseg)) for h in holes]
        me = curve_extrude_mesh(_ccw(loops), abs(u1 - u0), bevel, bres)
        Mx = TR(0, (u0 + u1) / 2, 0) @ M_TOP
        if M is not None: Mx = M @ Mx
        return self.add(name, me, kind, group, Mx, register)

    def lathe(self, name, prof, kind, at=(0, 0, 0), axis='s', segs=24, group='body', register=True, M=None, **kw):
        """profile [(x_along_axis, r)] about an axis through at=(f,u,s). axis 's' x runs toward +s (left),
        'f' toward +f, 'u' toward +u."""
        me = lathe_mesh(prof, segs, **kw)
        Mx = TR(*at) @ L_AX[axis]
        if M is not None: Mx = M @ Mx
        return self.add(name, me, kind, group, Mx, register)

    def tube(self, name, pts, r, kind, group='body', segs=10, bend_r=None, register=True, cap=True, M=None, bend_segs=3):
        """pts: [(f,u,s)]"""
        me = tube_mesh([V(*p) for p in pts], r, segs, bend_r, cap=cap, bend_segs=bend_segs)
        return self.add(name, me, kind, group, M, register)

    def box(self, name, c, size, kind, r=0.0, group='body', register=True, M=None, segs=None):
        """rounded box centred at c=(f,u,s) with size=(df, du, ds)"""
        if segs is None:
            segs = 1 if max(size) < 0.08 or r < 0.008 else 2
        me = rbox_mesh(size[2], size[0], size[1], r, segs)
        Mx = TR(*c)
        if M is not None: Mx = M @ Mx
        return self.add(name, me, kind, group, Mx, register)

    def cyl(self, name, at, r, length, kind, axis='s', segs=24, group='body', register=True, M=None, bevel=0.0):
        """closed cylinder centred at at, along axis"""
        h = length / 2
        if bevel > 0:
            b = min(bevel, r * 0.5, h * 0.5)
            prof = [(-h, 0), (-h, r - b), (-h + b * 0.3, r - b * 0.3), (-h + b, r), (h - b, r), (h - b * 0.3, r - b * 0.3), (h, r - b), (h, 0)]
        else:
            prof = [(-h, 0), (-h, r), (h, r), (h, 0)]
        return self.lathe(name, prof, kind, at, axis, segs, group, register, M)

    # ---------------- empties / pivots ----------------
    def empty(self, name, f, u, s=0.0, parent=None, M=None):
        W = TR(f, u, s)
        if M is not None:
            W = W @ M
        self.empties[name] = (W, parent)

    def pivot(self, group, f, u, s=0.0, R=None):
        W = TR(f, u, s)
        if R is not None:
            W = W @ R
        self.pivots[group] = W

    def realize_instances(self):
        """temporary linked copies of instanced templates (for previews); returns the created objects"""
        out = []
        for (node, tg, W, L, parent) in self.instances:
            for ob in [o for o in self.parts if o.get('group') == tg]:
                o2 = ob.copy(); o2.name = node + '_' + ob.name
                link(o2)
                o2.matrix_world = W @ L
                out.append(o2)
        return out

    def instance(self, node, template_group, f, u, s, flip=False, parent=None, R=None):
        W = TR(f, u, s)
        if R is not None:
            W = W @ R
        L = Matrix.Rotation(math.pi, 4, Vector((0, 0, 1))) if flip else Matrix.Identity(4)
        self.instances.append((node, template_group, W, L, parent))


def _ccw(loops):
    out = []
    for i, l in enumerate(loops):
        a = _signed_area(l)
        if (i == 0 and a < 0) or (i > 0 and a > 0):
            l = list(reversed(l))
        out.append(l)
    return out


# ----------------------------------------------------------------------------------------------
# quick preview (Cycles, unbaked kind colours)
# ----------------------------------------------------------------------------------------------
def preview(path, views=('q34', 'side', 'rear34', 'front'), res=(640, 400), samples=24, extent=None, look=None, objs=None):
    import numpy as np
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    try:
        scene.cycles.denoiser = 'OPENIMAGEDENOISE'
    except Exception:
        pass
    scene.render.resolution_x, scene.render.resolution_y = res
    scene.render.film_transparent = False
    scene.view_settings.view_transform = 'AgX'
    if scene.world is None:
        scene.world = bpy.data.worlds.new('W')
    w = scene.world; w.use_nodes = True
    bg = w.node_tree.nodes['Background']
    sky = w.node_tree.nodes.get('SKY') or w.node_tree.nodes.new('ShaderNodeTexSky')
    sky.name = 'SKY'
    try:
        sky.sky_type = 'NISHITA'; sky.sun_elevation = math.radians(35); sky.sun_rotation = math.radians(140)
    except Exception:
        pass
    w.node_tree.links.new(sky.outputs[0], bg.inputs[0]); bg.inputs[1].default_value = 0.35
    # ground
    if 'GROUND' not in bpy.data.objects:
        bpy.ops.mesh.primitive_plane_add(size=60)
        g = bpy.context.active_object; g.name = 'GROUND'
        gm = bpy.data.materials.new('ground'); gm.use_nodes = True
        gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.25, 0.24, 0.22, 1)
        gm.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.9
        g.data.materials.append(gm)
        sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = 3.5; sun.angle = math.radians(2)
        so = bpy.data.objects.new('SUN', sun); link(so)
        so.rotation_euler = (math.radians(50), 0, math.radians(140))
    # framing
    mn = Vector((1e9,) * 3); mx = Vector((-1e9,) * 3)
    for o in (objs or [o for o in scene.objects if o.type == 'MESH' and o.name != 'GROUND' and not o.hide_render]):
        for c in o.bound_box:
            p = o.matrix_world @ Vector(c)
            mn = Vector(map(min, mn, p)); mx = Vector(map(max, mx, p))
    ctr = (mn + mx) / 2 if look is None else V(*look)
    rad = (mx - mn).length / 2 if extent is None else extent
    cam_data = bpy.data.cameras.get('PCAM') or bpy.data.cameras.new('PCAM')
    cam_data.lens = 50
    cam = bpy.data.objects.get('PCAM') or link(bpy.data.objects.new('PCAM', cam_data))
    scene.camera = cam
    dirs = {
        'q34': V(1.0, 0.55, 1.0), 'rear34': V(-1.0, 0.5, 1.0), 'side': V(0, 0.12, 1.0), 'sider': V(0, 0.12, -1.0),
        'front': V(1.0, 0.25, 0.0), 'rear': V(-1.0, 0.25, 0.0), 'top': V(0.001, 1.0, 0.0), 'q34r': V(1.0, 0.55, -1.0),
        'low': V(0.7, 0.05, 1.0), 'under': V(0.3, -1.0, 0.4), 'in': V(-0.4, 0.6, 0.15),
    }
    tiles = []
    for vw in views:
        d = dirs[vw].normalized()
        dist = rad / math.tan(math.radians(36) / 2) * 1.05
        cam.location = ctr + d * dist
        cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
        tmp = path + f'.{vw}.png'
        scene.render.filepath = tmp
        bpy.ops.render.render(write_still=True)
        tiles.append(tmp)
    # composite with numpy via bpy images
    ims = [bpy.data.images.load(t) for t in tiles]
    W_, H_ = res
    cols = 2 if len(ims) > 1 else 1
    rows = (len(ims) + cols - 1) // cols
    canvas = np.zeros((rows * H_, cols * W_, 4), dtype=np.float32)
    for i, im in enumerate(ims):
        a = np.array(im.pixels[:], dtype=np.float32).reshape(H_, W_, 4)
        r = rows - 1 - i // cols; c = i % cols
        canvas[r * H_:(r + 1) * H_, c * W_:(c + 1) * W_] = a
    out = bpy.data.images.new('sheet', cols * W_, rows * H_, alpha=False)
    out.pixels.foreach_set(canvas.ravel())
    out.filepath_raw = path; out.file_format = 'PNG'; out.save()
    for t in tiles:
        try: os.remove(t)
        except OSError: pass
    print('PREVIEW', path)


# ----------------------------------------------------------------------------------------------
# component builders
# ----------------------------------------------------------------------------------------------
def set_kind_faces(ob, kind, pred):
    """reassign faces matching pred(center_vehicle(f,u,s), normal_vehicle(f,u,s)) to kind"""
    me = ob.data
    m = kind_material(kind)
    if m.name not in [x.name for x in me.materials if x]:
        me.materials.append(m)
    idx = [i for i, x in enumerate(me.materials) if x and x.name == m.name][0]
    n = 0
    for p in me.polygons:
        c = p.center; nn = p.normal
        if pred((-c.y, c.z, c.x), (-nn.y, nn.z, nn.x)):
            p.material_index = idx; n += 1
    return n


def thicken(path, t):
    """open 2D polyline -> closed loop offset by t to the LEFT of the walking direction (for lathe shells)"""
    P = [Vector(p) for p in path]
    off = []
    for i in range(len(P)):
        if i == 0: d = (P[1] - P[0])
        elif i == len(P) - 1: d = (P[-1] - P[-2])
        else: d = (P[i + 1] - P[i - 1])
        d.normalize()
        off.append(P[i] + Vector((-d.y, d.x)) * t)
    return [tuple(p) for p in P] + [tuple(p) for p in reversed(off)]


def gap_ring(v, name, ctrl, plane, a0, a1, width=0.004, kind='gap', nseg=4):
    """thin outline cutter along a closed control polygon (panel gap). plane: 'side' (f,u) extruded along s from a0..a1,
    'front' (s,u) along f, 'top' (f,s) along u."""
    inner = erode_ctrl(ctrl, width)
    fn = {'side': v.side, 'front': v.front, 'top': v.top}[plane]
    return fn(name, ctrl, a0, a1, kind, holes=[inner], nseg=nseg, register=False)


def slot(v, name, pts, plane, a0, a1, width=0.004, kind='gap'):
    """open polyline slot (panel gap) of given width: pts in the plane coords"""
    from shapely.geometry import LineString
    g = LineString(pts).buffer(width / 2, cap_style=2, join_style=2)
    ctrl = [(x, y, 0.0) for (x, y) in list(g.exterior.coords)[:-1]]
    fn = {'side': v.side, 'front': v.front, 'top': v.top}[plane]
    return fn(name, ctrl, a0, a1, kind, nseg=1, register=False)


def tire_profile(R, width, rim_r, style='lug', lug_depth=0.016, bulge=1.0):
    """closed tyre section (x axial, r) going around the outside from the inner bead to the outer bead"""
    w2 = width / 2
    Hs = R - rim_r
    base = R - (lug_depth if style in ('lug', 'knobby') else 0.0)
    half = [
        (w2 - 0.026, rim_r + 0.004),
        (w2 - 0.010, rim_r + 0.018),
        (w2 + 0.002 * bulge, rim_r + 0.30 * Hs),
        (w2 + 0.006 * bulge, rim_r + 0.55 * Hs),
        (w2 + 0.002 * bulge, rim_r + 0.78 * Hs),
        (w2 - 0.006, base - 0.030),
        (w2 - 0.020, base - 0.008),
        (w2 - 0.038, base - 0.0005),
    ]
    if style == 'road':
        # circumferential grooves in the crown
        crown = []
        gx = [0.33, 0.11]
        for g in gx:
            x = w2 * g
            crown += [(x + 0.006, base), (x + 0.004, base - 0.007), (x - 0.004, base - 0.007), (x - 0.006, base)]
        half += crown
        mid = [(0.0, base + 0.001)]
    else:
        mid = [(0.0, base + 0.0015)]
    outer = half + mid + [(-x, r) for (x, r) in reversed(half)]
    # outer: goes from +x bead over the crown to -x bead; return as (x, r) list from -x bead to +x bead
    return list(reversed(outer))


def build_tire(v, name, R, width, rim_r, style='lug', segs=40, nlug=20, group='wheel', lug_depth=0.016, kind='tire', chevron=0.35):
    prof = tire_profile(R, width, rim_r, style, lug_depth)
    # close the section through the rim seat (hidden by the rim)
    me = lathe_mesh(prof + [(prof[-1][0] - 0.004, rim_r - 0.004), (prof[0][0] + 0.004, rim_r - 0.004)], segs, closed=True)
    obs = [v.add(name, me, kind, group)]
    if style in ('lug', 'knobby'):
        bm = bmesh.new()
        w2 = width / 2
        base = R - lug_depth
        pitch = 2 * math.pi / nlug
        for row in (1, -1):
            for i in range(nlug):
                a_c = i * pitch + (pitch / 2 if row < 0 else 0.0)
                if style == 'lug':
                    x0, x1 = 0.012, w2 + 0.004
                    aw = pitch * 0.42
                else:  # knobby: square blocks
                    x0, x1 = 0.01, w2 * 0.55
                    aw = pitch * 0.45
                # chevron: lug centre-line angle shifts with x
                corners = []
                for (x, s_) in ((x0, -1), (x1, -1), (x1, 1), (x0, 1)):
                    a = a_c + s_ * aw / 2 + chevron * (x - x0) / R * (1 if style == 'lug' else 0)
                    corners.append((row * x, a))
                bot_r = [base - 0.006, base - 0.030 if style == 'lug' else base - 0.006, base - 0.030 if style == 'lug' else base - 0.006, base - 0.006]
                vb = []; vt = []
                cx = sum(c[0] for c in corners) / 4; ca = sum(c[1] for c in corners) / 4
                for k, (x, a) in enumerate(corners):
                    vb.append(bm.verts.new((x, bot_r[k] * math.cos(a), bot_r[k] * math.sin(a))))
                    # top face shrunk by ~12 % toward the centre (draft angle)
                    xt = cx + (x - cx) * 0.88; at = ca + (a - ca) * 0.86
                    rt = R if k in (0, 3) or style != 'lug' else R - 0.004
                    vt.append(bm.verts.new((xt, rt * math.cos(at), rt * math.sin(at))))
                for k in range(4):
                    k2 = (k + 1) % 4
                    bm.faces.new([vb[k], vb[k2], vt[k2], vt[k]])
                bm.faces.new(list(reversed(vb))); bm.faces.new(vt)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        obs.append(v.add(name + '_lugs', mesh_from_bm(bm, 'lugs'), kind, group))
    return obs


def build_steel_rim(v, name, rim_r, width, kind='black_paint', group='wheel', segs=36, nuts=5, pcd=0.1397, dish=0.035, holes=0, nut_kind='steel'):
    """pressed-steel wheel: barrel + flanges + dished disc + hub cap + nuts. axis = local s (outer face +s)."""
    w2 = width / 2 + 0.012
    rf = rim_r + 0.014
    barrel = [(-w2, rf), (-w2 + 0.006, rf + 0.002), (-w2 + 0.012, rim_r + 0.002), (-w2 + 0.03, rim_r - 0.004),
              (-0.03, rim_r - 0.022), (0.02, rim_r - 0.022), (w2 - 0.03, rim_r - 0.004), (w2 - 0.012, rim_r + 0.002),
              (w2 - 0.006, rf + 0.002), (w2, rf)]
    me = lathe_mesh(thicken(barrel, -0.004), segs, closed=True)
    obs = [v.add(name + '_barrel', me, kind, group)]
    # disc (outer face toward +x): from the barrel well to the centre
    d0 = 0.012
    disc = [(d0, rim_r - 0.024), (d0 + 0.010, rim_r - 0.05), (d0 + dish * 0.75, rim_r * 0.62), (d0 + dish, rim_r * 0.50),
            (d0 + dish, rim_r * 0.42), (d0 + dish - 0.010, rim_r * 0.37), (d0 + dish - 0.012, 0.075), (d0 + dish - 0.012, 0.050)]
    me = lathe_mesh(thicken(disc, 0.004), segs, closed=True)
    obs.append(v.add(name + '_disc', me, kind, group))
    # hub cap / centre
    hx = d0 + dish - 0.012
    cap = [(hx - 0.004, 0.0), (hx - 0.004, 0.052), (hx + 0.010, 0.050), (hx + 0.026, 0.040), (hx + 0.036, 0.022), (hx + 0.039, 0.0)]
    obs.append(v.add(name + '_hub', lathe_mesh(cap, 24), 'steel' if nut_kind == 'steel' else kind, group))
    # nuts
    bm_obs = []
    for i in range(nuts):
        a = 2 * math.pi * i / nuts + 0.3
        y = pcd / 2 * math.cos(a); z = pcd / 2 * math.sin(a)
        prof = [(hx - 0.002, 0.0), (hx - 0.002, 0.0115), (hx + 0.012, 0.0115), (hx + 0.016, 0.008), (hx + 0.017, 0.0)]
        me = lathe_mesh(prof, 6)
        me.transform(Matrix.Translation((0, y, z)))
        bm_obs.append(v.add(name + f'_nut{i}', me, nut_kind, group))
    obs += bm_obs
    if holes:
        hr = (rim_r * 0.5 + rim_r * 0.82) / 2
        cut = []
        for i in range(holes):
            a = 2 * math.pi * (i + 0.5) / holes
            c = v.lathe(f'hole{i}', [(-0.1, 0.0), (-0.1, 0.022), (0.1, 0.022), (0.1, 0.0)], 'gap', at=(0, 0, 0), axis='s', segs=12, register=False)
            c.data.transform(Matrix.Translation((0, hr * math.cos(a), hr * math.sin(a))))
            cut.append(c)
        boolean(obs[1], cut)
    return obs


def build_seat(v, name, f, u_cush, s, width=0.5, depth=0.5, back_h=0.6, recline=14.0, kind='vinyl', group='body',
               cush_t=0.12, back_t=0.11, headrest=False, frame_kind='chassis', floor_u=None, bolster=0.03, cush_tilt=4.0):
    """bucket/bench seat. (f, u_cush, s) = front-centre top of the cushion. Returns (objects, hip point (f,u,s))."""
    obs = []
    sec = lambda w, t, b: mirror_half([(0.0, -t), (w / 2 - 0.02, -t, 0.02), (w / 2, b, 0.04), (w / 2 - 0.07, b * 0.5, 0.03), (0.0, 0.0, 0.5)])
    keys = [(-depth, sec(width, cush_t, bolster)), (0.0, sec(width, cush_t, bolster * 0.6))]
    ob = v.block(name + '_cushion', keys, kind, group, end0=0.04, end1=0.05, n_f=3, nseg=2, n_end=3)
    ob.data.transform(TR(f, u_cush, s) @ pitch_up(cush_tilt))
    obs.append(ob)
    # backrest: built along -f (top end at -back_h), surface toward +u, then stood up (+u -> +f) and reclined
    keys = [(-back_h, sec(width * 0.94, back_t * 0.9, bolster)), (0.0, sec(width, back_t, bolster * 1.4))]
    bk = v.block(name + '_back', keys, kind, group, end0=0.06, end1=0.03, n_f=3, nseg=2, n_end=3)
    base = TR(f - depth + 0.01, u_cush - 0.04, s) @ pitch_up(recline - 90.0)
    bk.data.transform(base)
    obs.append(bk)
    if headrest:
        hr = v.box(name + '_headrest', (-(back_h + 0.12), -0.02, 0.0), (0.2, 0.08, width * 0.5), kind, r=0.035, group=group)
        hr.data.transform(base)
        obs.append(hr)
    if floor_u is not None:
        for side in (-1, 1):
            ss = s + side * (width / 2 - 0.06)
            obs.append(v.tube(name + f'_leg{side}', [(f - 0.05, u_cush - cush_t, ss), (f - 0.08, floor_u, ss), (f - depth + 0.05, floor_u, ss),
                                                    (f - depth + 0.08, u_cush - cush_t - 0.02, ss)], 0.012, frame_kind, group, segs=6, bend_r=0.03))
    hip = (f - depth + 0.13, u_cush + 0.03, s)
    return obs, hip


def build_steering_wheel(v, name, center, tilt_deg, diameter=0.40, rim_t=0.014, spokes=3, group='steering_wheel', kind='plastic', col_len=0.0, spoke_kind=None):
    """steering wheel in the plane perpendicular to the column. center=(f,u,s) hub; tilt_deg = column angle below
    horizontal (column points forward-down into the dash). Returns the pivot rotation matrix (local Z = column axis
    pointing toward the dash)."""
    f, u, s = center
    Rd = diameter / 2
    obs = []
    # build in a local frame: wheel plane = local XY of the lathe 's' axis... we build around the 'f' axis then rotate
    rim = lathe_mesh([(0.0 + rim_t * math.cos(a), Rd + rim_t * math.sin(a) * 1.0) for a in [2 * math.pi * k / 8 for k in range(8)]], 30, closed=True)
    obs.append(v.add(name + '_rim', rim, kind, group, L_AX['f']))
    hub = lathe_mesh([(-0.03, 0.0), (-0.03, 0.03), (0.005, 0.045), (0.02, 0.04), (0.025, 0.0)], 16)
    obs.append(v.add(name + '_hub', hub, kind, group, L_AX['f']))
    for i in range(spokes):
        a = math.radians(-90 + (i - (spokes - 1) / 2) * (360.0 / spokes if spokes > 2 else 180.0))
        if spokes == 3:
            a = math.radians([-90, 8, 172][i])
        y, z = math.cos(a), math.sin(a)
        p0 = Vector((0.04 * y, -0.01, 0.04 * z)); p1 = Vector((Rd * y, -0.0, Rd * z))
        # local frame: x = s, y = -f, z = u (wheel faces -f toward the driver)
        obs.append(v.add(name + f'_spoke{i}', tube_mesh([Vector((p0.x, p0.y, p0.z)), Vector((p1.x, p1.y, p1.z))], 0.008, 8), spoke_kind or kind, group))
    if col_len > 0:
        obs.append(v.add(name + '_col', lathe_mesh([(0.0, 0.0), (0.0, 0.022), (col_len, 0.022), (col_len, 0.0)], 12), 'black_paint', group, L_AX['f']))
    # orient: wheel built facing +f/-f in plane (s,u); tilt so the top leans back toward the driver
    Rm = TR(f, u, s) @ pitch_up(-tilt_deg)
    for o in obs:
        o.data.transform(Rm)
    return Rm


def build_round_lamp(v, name, at, r, kind_lens='lens_head', axis='f', depth=0.06, bezel_kind='chrome', group='body', dome=0.012, reflector=True, sign=1, segs=32):
    """round lamp facing +axis (sign=-1 faces -axis) at at=(f,u,s): bezel ring + domed lens + reflector bowl"""
    obs = []
    M = TR(*at) @ L_AX[axis] @ (Matrix.Scale(-1, 4, Vector((1, 0, 0))) if sign < 0 else Matrix.Identity(4))
    bez = [(-0.012, r * 0.93), (0.0, r * 1.12), (0.008, r * 1.12), (0.014, r * 1.04), (0.012, r * 0.98), (0.004, r * 0.955), (-0.012, r * 0.955)]
    obs.append(v.add(name + '_bezel', lathe_mesh(bez, segs, closed=True), bezel_kind, group, M))
    lens = [(-0.003, 0.0), (-0.003, r * 0.96)] + [(dome * (1 - (k / 6) ** 2), r * 0.96 * k / 6) for k in range(6, -1, -1)]
    obs.append(v.add(name + '_lens', lathe_mesh(lens, segs), kind_lens, group, M))
    if reflector:
        bowl = [(-depth + depth * (k / 6) ** 2, r * 0.95 * k / 6) for k in range(0, 7)]
        bowl = [(-depth - 0.004, 0.0)] + [(x - 0.004, rr) for x, rr in bowl[1:]][::-1][::-1]
        prof = [(-depth - 0.006, 0.0)] + [(x - 0.003, rr + 0.002) for (x, rr) in [(-depth + depth * (k / 6) ** 2, r * 0.95 * k / 6) for k in range(1, 7)]]
        inner = [(-depth + depth * (k / 6) ** 2, r * 0.95 * k / 6) for k in range(6, -1, -1)]
        obs.append(v.add(name + '_refl', lathe_mesh(prof + inner, max(12, segs // 2)), 'reflector', group, M))
    return obs


# ----------------------------------------------------------------------------------------------
# baking materials: one node tree per kind; outputs are switched by _wire()
# ----------------------------------------------------------------------------------------------
class NB:
    def __init__(self, mat):
        self.nt = mat.node_tree; self.N = self.nt.nodes; self.L = self.nt.links

    def n(self, t, **kw):
        nd = self.N.new(t)
        for k, v in kw.items():
            setattr(nd, k, v)
        return nd

    def link(self, a, b):
        self.L.new(a, b)

    def _in(self, sock, val):
        if isinstance(val, (int, float)) or isinstance(val, tuple):
            sock.default_value = val
        else:
            self.link(val, sock)

    def math(self, op, a, b=0.0, clamp=False):
        nd = self.n('ShaderNodeMath', operation=op, use_clamp=clamp)
        self._in(nd.inputs[0], a); self._in(nd.inputs[1], b)
        return nd.outputs[0]

    def mix(self, fac, a, b):
        nd = self.n('ShaderNodeMix', data_type='RGBA', blend_type='MIX')
        self._in(nd.inputs['Factor'], fac); self._in(nd.inputs[6], a); self._in(nd.inputs[7], b)
        return nd.outputs[2]

    def mixf(self, fac, a, b):
        nd = self.n('ShaderNodeMix', data_type='FLOAT')
        self._in(nd.inputs['Factor'], fac); self._in(nd.inputs[2], a); self._in(nd.inputs[3], b)
        return nd.outputs[0]

    def mul_rgb(self, a, b):
        nd = self.n('ShaderNodeMix', data_type='RGBA', blend_type='MULTIPLY')
        nd.inputs['Factor'].default_value = 1.0
        self._in(nd.inputs[6], a); self._in(nd.inputs[7], b)
        return nd.outputs[2]

    def noise(self, vec, scale, detail=4.0, rough=0.55, dim='3D'):
        nd = self.n('ShaderNodeTexNoise', noise_dimensions=dim)
        self.link(vec, nd.inputs['Vector'])
        nd.inputs['Scale'].default_value = scale; nd.inputs['Detail'].default_value = detail
        nd.inputs['Roughness'].default_value = rough
        return nd.outputs['Fac']

    def mapscale(self, vec, sx, sy, sz):
        nd = self.n('ShaderNodeMapping')
        self.link(vec, nd.inputs['Vector']); nd.inputs['Scale'].default_value = (sx, sy, sz)
        return nd.outputs[0]

    def ramp(self, fac, a, b):
        nd = self.n('ShaderNodeMapRange', clamp=True)
        self._in(nd.inputs['Value'], fac); nd.inputs['From Min'].default_value = a; nd.inputs['From Max'].default_value = b
        return nd.outputs[0]

    def sep(self, vec):
        nd = self.n('ShaderNodeSeparateXYZ'); self.link(vec, nd.inputs[0]); return nd.outputs

    def wave(self, vec, scale, axis='X', profile='SIN', distortion=0.0):
        nd = self.n('ShaderNodeTexWave', wave_type='BANDS', bands_direction=axis, wave_profile=profile)
        self.link(vec, nd.inputs['Vector']); nd.inputs['Scale'].default_value = scale
        nd.inputs['Distortion'].default_value = distortion
        return nd.outputs['Fac']


def make_bake_material(kind, mask_img, look):
    """procedural look of a kind for baking. look: vehicle-level dict(dirt, wear, rust, burnt, dust_col, mud_col)"""
    k = dict(KINDS[kind])
    mat = bpy.data.materials.new('B_' + kind)
    mat.use_nodes = True
    nb = NB(mat)
    for nd in list(nb.N):
        nb.N.remove(nd)
    out = nb.n('ShaderNodeOutputMaterial'); out.name = 'OUT'
    bsdf = nb.n('ShaderNodeBsdfPrincipled'); bsdf.name = 'BSDF'
    emit = nb.n('ShaderNodeEmission'); emit.name = 'EMIT'
    tc = nb.n('ShaderNodeTexCoord')
    obj = tc.outputs['Object']
    geo = nb.n('ShaderNodeNewGeometry')
    P = geo.outputs['Position']
    Pz = nb.sep(P)[2]
    Nz = nb.sep(geo.outputs['Normal'])[2]
    # ---- live masks (mask bake only) ----
    bev = nb.n('ShaderNodeBevel'); bev.samples = 8; bev.inputs['Radius'].default_value = look.get('bevel', 0.006)
    dot = nb.n('ShaderNodeVectorMath', operation='DOT_PRODUCT')
    nb.link(bev.outputs['Normal'], dot.inputs[0]); nb.link(geo.outputs['Normal'], dot.inputs[1])
    edge_live = nb.ramp(nb.math('SUBTRACT', 1.0, dot.outputs['Value']), 0.003, 0.06)
    ao_s = nb.n('ShaderNodeAmbientOcclusion'); ao_s.samples = 12; ao_s.inputs['Distance'].default_value = 0.05
    ao_l = nb.n('ShaderNodeAmbientOcclusion'); ao_l.samples = 12; ao_l.inputs['Distance'].default_value = 0.6
    comb = nb.n('ShaderNodeCombineColor'); comb.name = 'MASK_LIVE'
    nb.link(edge_live, comb.inputs[0]); nb.link(ao_s.outputs['AO'], comb.inputs[1]); nb.link(ao_l.outputs['AO'], comb.inputs[2])
    # ---- baked masks ----
    mt = nb.n('ShaderNodeTexImage'); mt.image = mask_img; mt.name = 'MASK_TEX'; mt.interpolation = 'Linear'
    sp = nb.n('ShaderNodeSeparateColor'); nb.link(mt.outputs['Color'], sp.inputs[0])
    edge, aos, aol = sp.outputs[0], sp.outputs[1], sp.outputs[2]
    base = srgb(k['base'])
    pat = k.get('pat', 'none')
    n_big = nb.noise(obj, 1.2, 3.0, 0.5)
    n_mid = nb.noise(obj, 9.0, 4.0, 0.55)
    n_fine = nb.noise(obj, 60.0, 3.0, 0.5)
    col = nb.mix(nb.math('MULTIPLY', nb.ramp(n_big, 0.3, 0.7), 0.10), base, nb.mul_rgb(base, srgb('#9a9a9a')))
    rough = nb.math('ADD', k['rough'], nb.math('MULTIPLY', nb.math('SUBTRACT', n_mid, 0.5), 0.12))
    metal = k['metal']
    bump_h = None; bump_s = 0.0
    if pat == 'rough':
        bump_h = nb.noise(obj, 180.0, 3.0, 0.6); bump_s = 0.25
        col = nb.mix(nb.math('MULTIPLY', nb.ramp(n_fine, 0.4, 0.7), 0.25), col, nb.mul_rgb(col, srgb('#b0aca4')))
    elif pat == 'rubber':
        bump_h = nb.noise(obj, 260.0, 2.0, 0.5); bump_s = 0.15
    elif pat == 'grain':
        bump_h = nb.noise(obj, 400.0, 2.0, 0.5); bump_s = 0.12
    elif pat == 'fabric':
        wr = nb.noise(nb.mapscale(obj, 1.0, 3.0, 1.0), 7.0, 3.0, 0.6)          # wrinkles
        bump_h = nb.math('ADD', nb.math('MULTIPLY', wr, 0.8), nb.math('MULTIPLY', nb.noise(obj, 300.0, 1.0, 0.5), 0.2)); bump_s = 0.35
        col = nb.mix(nb.math('MULTIPLY', nb.ramp(n_mid, 0.35, 0.75), 0.35), col, nb.mul_rgb(col, srgb('#cfc7b4')))
    elif pat == 'mesh':
        # woven wire mesh in the (s,u) plane, ~22 mm cells
        xs = nb.sep(obj)
        wx = nb.n('ShaderNodeMath', operation='SINE'); nb.link(nb.math('MULTIPLY', xs[0], 2 * math.pi / 0.022), wx.inputs[0])
        wz = nb.n('ShaderNodeMath', operation='SINE'); nb.link(nb.math('MULTIPLY', xs[2], 2 * math.pi / 0.022), wz.inputs[0])
        wire = nb.math('MAXIMUM', nb.ramp(nb.math('ABSOLUTE', wx.outputs[0]), 0.80, 0.97), nb.ramp(nb.math('ABSOLUTE', wz.outputs[0]), 0.80, 0.97))
        col = nb.mix(wire, srgb('#050505'), base)
        metal = nb.mixf(wire, 0.0, k['metal'])
        rough = nb.mixf(wire, 1.0, k['rough'])
        bump_h = wire; bump_s = 0.6
    elif pat == 'orange':
        bump_h = nb.noise(obj, 90.0, 2.0, 0.5); bump_s = 0.03
    # ---- wear (convex edges) ----
    wear_amt = k.get('wear', 0.0) * look.get('wear', 1.0)
    if wear_amt > 0:
        convex = nb.math('MULTIPLY', edge, nb.ramp(aos, 0.5, 0.95))
        brk = nb.ramp(nb.noise(obj, 40.0, 5.0, 0.7), 0.42, 0.62)
        wear = nb.math('MULTIPLY', nb.ramp(nb.math('MULTIPLY', convex, brk), 0.08, 0.35), min(1.0, wear_amt * 1.6))
        col = nb.mix(wear, col, srgb(k['wear_col']))
        rough = nb.mixf(wear, rough, 0.45)
        metal = nb.mixf(wear, metal, k.get('wear_metal', 0.0))
    # ---- rust (wrecks) ----
    rust_amt = look.get('rust', 0.0) * (0.0 if kind in ('glass', 'gap', 'tire', 'rubber', 'seal', 'canvas', 'fabric', 'vinyl', 'vinyl_brown', 'carpet', 'plastic', 'plastic_grey', 'gauge') else 1.0)
    if rust_amt > 0:
        rn = nb.noise(obj, 3.5, 6.0, 0.7)
        rmask = nb.ramp(nb.math('ADD', nb.math('ADD', nb.math('MULTIPLY', rn, 0.9), nb.math('MULTIPLY', nb.math('SUBTRACT', 1.0, aos), 0.6)),
                                nb.math('MULTIPLY', edge, 0.4)), 1.0 - 0.45 * rust_amt, 1.15 - 0.45 * rust_amt)
        rc = nb.mix(nb.ramp(nb.noise(obj, 25.0, 4.0, 0.6), 0.3, 0.7), srgb('#4a2614'), srgb('#7a4422'))
        col = nb.mix(rmask, col, rc)
        rough = nb.mixf(rmask, rough, 0.9)
        metal = nb.mixf(rmask, metal, 0.15)
    # ---- burnt (wrecks) ----
    burnt = look.get('burnt', 0.0) * (0.0 if kind in ('gap',) else 1.0)
    if burnt > 0:
        soot = nb.ramp(nb.math('ADD', nb.math('MULTIPLY', nb.noise(obj, 2.0, 5.0, 0.6), 0.8), nb.math('MULTIPLY', Pz, 0.25)), 0.25, 0.7)
        ash = nb.mix(nb.ramp(nb.noise(obj, 14.0, 4.0, 0.6), 0.35, 0.75), srgb('#0d0c0b'), srgb('#3e3a35'))
        burn_rust = nb.mix(nb.ramp(nb.noise(obj, 6.0, 4.0, 0.6), 0.4, 0.7), srgb('#3a2418'), srgb('#6a3a20'))
        bc = nb.mix(soot, ash, burn_rust)
        col = nb.mix(burnt, col, bc)
        rough = nb.mixf(burnt, rough, 0.9)
        metal = nb.mixf(burnt, metal, 0.05)
    # ---- dirt / dust / mud ----
    dirt_amt = k.get('dirt', 0.0) * look.get('dirt', 1.0)
    if dirt_amt > 0:
        low = nb.ramp(Pz, look.get('mud_top', 0.95), 0.15)                       # 1 near the ground
        streak = nb.noise(nb.mapscale(obj, 4.0, 4.0, 0.6), 6.0, 5.0, 0.65)       # vertical streaks
        mud = nb.math('MULTIPLY', low, nb.ramp(streak, 0.35, 0.65))
        occl = nb.math('MULTIPLY', nb.math('SUBTRACT', 1.0, aol), 0.9)
        up = nb.math('MULTIPLY', nb.ramp(Nz, 0.5, 0.95), 0.35)
        d = nb.math('ADD', nb.math('ADD', mud, occl), up)
        d = nb.math('MULTIPLY', d, nb.ramp(nb.noise(obj, 3.0, 4.0, 0.6), 0.25, 0.75))
        d = nb.math('MULTIPLY', nb.ramp(d, 0.15, 0.85), min(1.0, 0.75 * dirt_amt))
        dc = nb.mix(low, srgb(look.get('dust_col', '#7a6a55')), srgb(look.get('mud_col', '#3e3328')))
        col = nb.mix(d, col, dc)
        rough = nb.mixf(d, rough, 0.95)
        metal = nb.mixf(d, metal, 0.0)
    # cavity darkening (shows under direct light too)
    cav = nb.ramp(aos, 0.35, 1.0)
    col = nb.mix(nb.math('MULTIPLY', nb.math('SUBTRACT', 1.0, cav), 0.85), col, nb.mul_rgb(col, srgb('#202020')))
    rough = nb.math('ADD', rough, 0.0, clamp=True)
    # normal: rounded edges (bevel) + micro bump
    nrm = bev.outputs['Normal']
    if bump_h is not None and bump_s > 0:
        bump = nb.n('ShaderNodeBump'); bump.inputs['Strength'].default_value = bump_s; bump.inputs['Distance'].default_value = 0.0008
        nb.link(bump_h, bump.inputs['Height']); nb.link(bev.outputs['Normal'], bump.inputs['Normal'])
        nrm = bump.outputs['Normal']
    nb.link(nrm, bsdf.inputs['Normal'])
    nb._in(bsdf.inputs['Base Color'], col); nb._in(bsdf.inputs['Roughness'], rough); nb._in(bsdf.inputs['Metallic'], metal)
    nb.link(bsdf.outputs[0], out.inputs['Surface'])
    mat['kind'] = kind
    st = {'col': col, 'rough': rough, 'metal': metal, 'mask': comb.outputs[0]}
    return mat, st


# ----------------------------------------------------------------------------------------------
# finishing: shading, UV atlas, bake, final materials, hierarchy, export
# ----------------------------------------------------------------------------------------------
def _finish(self, out_path, bake=True, keep_blend=None, look=None, mask_res=None, normal_spp=2, mask_spp=12):
    t0 = time.time()
    scene = bpy.context.scene
    look = dict(dict(dirt=1.0, wear=1.0, rust=0.0, burnt=0.0), **(look or getattr(self, 'look', {}) or {}))
    tex = self.tex
    mask_res = mask_res or max(512, tex // 2)
    # ---------- per-part shading ----------
    for ob in self.parts:
        clean_mesh(ob)
        me = ob.data
        me.shade_smooth()
        me.set_sharp_from_angle(angle=math.radians(ob.get('sharp', 36)))
        wn = ob.modifiers.new('wn', 'WEIGHTED_NORMAL'); wn.keep_sharp = True; wn.weight = 50
        apply_modifiers(ob)
    rep = {}
    for ob in self.parts:
        ob.data.calc_loop_triangles()
        key = ''.join(c for c in ob.name if not c.isdigit() and c not in '.-_')
        rep[key] = rep.get(key, 0) + len(ob.data.loop_triangles)
    print('PARTTRIS', sorted(rep.items(), key=lambda kv: -kv[1])[:40])
    # ---------- UV atlas (on the separate parts) ----------
    self._uv_atlas(self.parts)
    print('UV done', round(time.time() - t0, 1))
    # ---------- join per group ----------
    groups = {}
    for ob in self.parts:
        groups.setdefault(ob.get('group', 'body'), []).append(ob)
    gobs = {}
    for g, obs in groups.items():
        o = join(obs, g)
        o.data.name = g
        o['group'] = g
        gobs[g] = o
    template_groups = set(i[1] for i in self.instances)
    objs = list(gobs.values())
    # ---------- bake ----------
    final_mats = self._final_materials(bake)
    if bake:
        self._bake(objs, gobs, template_groups, look, mask_res, mask_spp, normal_spp)
        print('BAKE done', round(time.time() - t0, 1))
    # ---------- assign final materials ----------
    for o in objs:
        me = o.data
        old = [m for m in me.materials]
        fin_names = []
        remap = []
        for m in old:
            kd = m.get('kind') if m else None
            fn = KINDS[kd]['final'] if kd in KINDS else 'trim'
            if fn not in fin_names: fin_names.append(fn)
            remap.append(fin_names.index(fn))
        idx = [remap[p.material_index] for p in me.polygons]
        me.materials.clear()
        for fn in fin_names:
            me.materials.append(final_mats[fn])
        for p, i in zip(me.polygons, idx):
            p.material_index = i
    # ---------- stats ----------
    dg = bpy.context.evaluated_depsgraph_get()
    tris = {}
    for g, o in gobs.items():
        o.data.calc_loop_triangles(); tris[g] = len(o.data.loop_triangles)
    inst_tris = sum(tris.get(i[1], 0) for i in self.instances)
    self.meta['tris_unique'] = sum(tris.values()) - sum(tris[g] for g in template_groups if g in tris) * 0 
    self.meta['tris_rendered'] = sum(t for g, t in tris.items() if g not in template_groups) + inst_tris
    self.meta['tris_by_group'] = tris
    print('TRIS', self.id, tris, 'rendered', self.meta['tris_rendered'])
    # ---------- hierarchy ----------
    root = link(bpy.data.objects.new(self.id, None))
    pivot_objs = {}
    for g, o in gobs.items():
        if g in template_groups:
            continue
        W = self.pivots.get(g)
        if g == 'body' or W is None:
            o.parent = root
            continue
        o.data.transform(W.inverted())
        o.name = g + '_mesh'; o.data.name = g + '_mesh'
        piv = link(bpy.data.objects.new(g, None))
        piv.empty_display_type = 'ARROWS'; piv.empty_display_size = 0.1
        piv.matrix_world = W
        piv.parent = root
        pivot_objs[g] = piv
        o.name = g + '_mesh'; o.data.name = g + '_mesh'
        o.parent = piv
        o.matrix_parent_inverse = Matrix.Identity(4)
        o.matrix_basis = Matrix.Identity(4)
    tmpl_meshes = {g: gobs[g].data for g in template_groups if g in gobs}
    for (node, tg, W, L, parent) in self.instances:
        e = link(bpy.data.objects.new(node, None))
        e.empty_display_type = 'PLAIN_AXES'; e.empty_display_size = 0.1
        par = pivot_objs.get(parent, root)
        e.parent = par
        e.matrix_parent_inverse = Matrix.Identity(4)
        e.matrix_basis = (par.matrix_world.inverted() if par is not root else Matrix.Identity(4)) @ W
        mo = link(bpy.data.objects.new(node + '_mesh', tmpl_meshes[tg]))
        mo.parent = e
        mo.matrix_parent_inverse = Matrix.Identity(4)
        mo.matrix_basis = L
    for g in template_groups:
        if g in gobs:
            bpy.data.objects.remove(gobs[g])
    for name, (W, parent) in self.empties.items():
        e = link(bpy.data.objects.new(name, None))
        e.empty_display_type = 'PLAIN_AXES'; e.empty_display_size = 0.05
        par = pivot_objs.get(parent, root)
        e.parent = par
        e.matrix_parent_inverse = Matrix.Identity(4)
        e.matrix_basis = (par.matrix_world.inverted() if par is not root else Matrix.Identity(4)) @ W
    bpy.context.view_layer.update()
    # ---------- bounds / meta ----------
    mn = Vector((1e9,) * 3); mx = Vector((-1e9,) * 3)
    for o in scene.objects:
        if o.type == 'MESH':
            for c in o.bound_box:
                p = o.matrix_world @ Vector(c)
                mn = Vector(map(min, mn, p)); mx = Vector(map(max, mx, p))
    # glTF (x, y, z) = (x_b, z_b, -y_b)
    self.meta['bounds_min'] = [round(mn.x, 3), round(mn.z, 3), round(-mx.y, 3)]
    self.meta['bounds_max'] = [round(mx.x, 3), round(mx.z, 3), round(-mn.y, 3)]
    self.meta['size_m'] = {'length': round(mx.y - mn.y, 3), 'width': round(mx.x - mn.x, 3), 'height': round(mx.z - mn.z, 3)}
    nodes = {}
    for o in scene.objects:
        if o.name in ('GROUND', 'SUN', 'PCAM'):
            continue
        Wm = o.matrix_world
        p = Wm.to_translation()
        nodes[o.name] = {'parent': o.parent.name if o.parent else None, 'mesh': o.type == 'MESH',
                         'world_pos': [round(p.x, 4), round(p.z, 4), round(-p.y, 4)]}
    self.meta['nodes'] = nodes
    self.meta['materials'] = sorted(set(m.name for o in scene.objects if o.type == 'MESH' for m in o.data.materials))
    for o in [o for o in scene.objects if o.name in ('GROUND', 'SUN', 'PCAM')]:
        bpy.data.objects.remove(o)
    if keep_blend:
        bpy.ops.wm.save_as_mainfile(filepath=keep_blend)
    for o in bpy.context.view_layer.objects: o.select_set(False)
    bpy.ops.export_scene.gltf(filepath=out_path, export_format='GLB', use_selection=False, export_apply=False,
                              export_yup=True, export_tangents=False, export_image_format='JPEG', export_jpeg_quality=90,
                              export_cameras=False, export_lights=False, export_animations=False, export_extras=False,
                              export_draco_mesh_compression_enable=False)
    print('EXPORTED', out_path, round(time.time() - t0, 1), 's')
    return self.meta


def _uv_atlas(self, parts):
    """one smart-project over all baked parts, equalised texel density, per-part density factor, packed into one atlas"""
    from collections import Counter
    def is_baked(o):
        return any(m and KINDS.get(m.get('kind'), {}).get('final') not in UNBAKED_FINALS for m in o.data.materials)
    objs = [o for o in parts if is_baked(o)]
    for o in parts:
        if not o.data.uv_layers: o.data.uv_layers.new(name='UVMap')
    for o in bpy.context.view_layer.objects: o.select_set(False)
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.context.scene.tool_settings.use_uv_select_sync = True
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.0, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.uv.select_all(action='SELECT')
    bpy.ops.uv.average_islands_scale()
    for o in objs:
        cnt = Counter(p.material_index for p in o.data.polygons)
        m = o.data.materials[cnt.most_common(1)[0][0]]
        kd = m.get('kind', 'paint') if m else 'paint'
        sc = self.uv_scale.get(kd, 1.0) * self.group_uv_scale.get(o.get('group', 'body'), 1.0) * o.get('uv_scale', 1.0)
        if abs(sc - 1.0) > 1e-3:
            bm = bmesh.from_edit_mesh(o.data); uvl = bm.loops.layers.uv.active
            for f in bm.faces:
                for l in f.loops:
                    l[uvl].uv = l[uvl].uv * sc
            bmesh.update_edit_mesh(o.data)
    bpy.ops.uv.select_all(action='SELECT')
    bpy.ops.uv.pack_islands(udim_source='CLOSEST_UDIM', rotate=True, scale=True, margin_method='FRACTION',
                            margin=3.0 / self.tex, shape_method='AABB')
    bpy.ops.object.mode_set(mode='OBJECT')
    # faces of unbaked kinds inside baked parts, and unbaked parts: park their UVs in a corner
    for o in parts:
        uv = o.data.uv_layers.active.data
        for p in o.data.polygons:
            m = o.data.materials[p.material_index]
            if not m or KINDS.get(m.get('kind'), {}).get('final') in UNBAKED_FINALS or o not in objs:
                for i in p.loop_indices:
                    uv[i].uv = (0.9995, 0.9995)
    tot = 0.0
    for o in objs:
        uv = o.data.uv_layers.active.data
        for p in o.data.polygons:
            pts = [uv[i].uv for i in p.loop_indices]
            for i in range(1, len(pts) - 1):
                tot += abs((pts[i] - pts[0]).cross(pts[i + 1] - pts[0])) / 2
    print('UV utilisation', round(tot, 3))
    self.meta['uv_utilisation'] = round(tot, 3)


def _final_materials(self, bake):
    mats = {}
    def principled(name):
        m = bpy.data.materials.new(name); m.use_nodes = True
        return m, m.node_tree.nodes['Principled BSDF']
    for fn in ('paint', 'trim'):
        m, b = principled(fn)
        if fn == 'paint':
            b.inputs['Base Color'].default_value = srgb(self.paint)
            if self.paint_coat > 0:
                b.inputs['Coat Weight'].default_value = self.paint_coat
                b.inputs['Coat Roughness'].default_value = 0.06
        mats[fn] = m
    m, b = principled('glass')
    b.inputs['Base Color'].default_value = srgb('#0f1619'); b.inputs['Roughness'].default_value = 0.03
    b.inputs['Alpha'].default_value = 0.42
    try:
        m.surface_render_method = 'BLENDED'
    except Exception:
        m.blend_method = 'BLEND'
    m.use_backface_culling = False
    mats['glass'] = m
    m, b = principled('lamp_head')
    b.inputs['Base Color'].default_value = srgb('#e8ecee'); b.inputs['Roughness'].default_value = 0.05
    b.inputs['Alpha'].default_value = 0.45
    b.inputs['Emission Color'].default_value = srgb('#fff4dc'); b.inputs['Emission Strength'].default_value = 0.0
    try:
        m.surface_render_method = 'BLENDED'
    except Exception:
        m.blend_method = 'BLEND'
    mats['lamp_head'] = m
    m, b = principled('lamp_tail')
    b.inputs['Base Color'].default_value = srgb('#7a0b08'); b.inputs['Roughness'].default_value = 0.18
    b.inputs['Emission Color'].default_value = srgb('#ff1a0a'); b.inputs['Emission Strength'].default_value = 0.0
    mats['lamp_tail'] = m
    for m in mats.values():
        m.use_backface_culling = True
    self.final_mats = mats
    return mats


def _bake(self, objs, gobs, template_groups, look, mask_res, mask_spp, normal_spp):
    import numpy as np
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.use_denoising = False
    scene.render.bake.margin = 8
    scene.render.bake.margin_type = 'EXTEND'
    if scene.world is None:
        scene.world = bpy.data.worlds.new('W')
    for o in [o for o in scene.objects if o.name in ('GROUND',)]:
        o.hide_render = True
    tex = self.tex
    def newimg(name, res, noncolor=True):
        im = bpy.data.images.new(f'{self.id}_{name}', res, res, alpha=False, float_buffer=False)
        if noncolor: im.colorspace_settings.name = 'Non-Color'
        return im
    mask = newimg('mask', mask_res)
    # bake materials replace the kind materials (same slots)
    bmats = {}; socks = {}
    kinds_used = set()
    for o in objs:
        for m in o.data.materials:
            if m and m.get('kind') and KINDS[m['kind']]['final'] not in UNBAKED_FINALS:
                kinds_used.add(m['kind'])
    for kd in kinds_used:
        bm_, st = make_bake_material(kd, mask, look)
        bmats[kd] = bm_; socks[kd] = st
    swapped = {}
    for o in objs:
        for i, m in enumerate(o.data.materials):
            if m and m.get('kind') in bmats:
                swapped[(o.name, i)] = m
                o.data.materials[i] = bmats[m['kind']]
    # move the wheel template away (keep its height); add occluder copies at the instance positions
    moved = []
    for i, g in enumerate(sorted(template_groups)):
        if g in gobs:
            hz = next((W.to_translation().z for (_n, tg, W, _L, _p) in self.instances if tg == g), self.meta.get('wheel_radius', 0.35))
            gobs[g].location = (30.0 + 4.0 * i, 0.0, hz)
            moved.append(gobs[g])
    occl = []
    for (node, tg, W, L, parent) in self.instances:
        if tg in gobs:
            o2 = gobs[tg].copy(); o2.name = 'OCC_' + node; link(o2); o2.matrix_world = W @ L
            occl.append(o2)
    bake_objs = objs
    tnodes = {}
    for kd, m in bmats.items():
        tn = m.node_tree.nodes.new('ShaderNodeTexImage'); tn.name = 'BAKE_TARGET'; tnodes[kd] = tn
    def set_target(im):
        for kd, m in bmats.items():
            tn = tnodes[kd]; tn.image = im
            for nd in m.node_tree.nodes: nd.select = False
            tn.select = True; m.node_tree.nodes.active = tn
    def wire(kd, what):
        m = bmats[kd]; nt = m.node_tree; N = nt.nodes
        out = N['OUT']; em = N['EMIT']
        for l in list(out.inputs['Surface'].links): nt.links.remove(l)
        for l in list(em.inputs['Color'].links): nt.links.remove(l)
        if what == 'bsdf':
            nt.links.new(N['BSDF'].outputs[0], out.inputs['Surface']); return
        sock = socks[kd][what]
        if not hasattr(sock, 'links'):
            val = sock
            cc = N.new('ShaderNodeCombineColor')
            for i in range(3): cc.inputs[i].default_value = val
            sock = cc.outputs[0]
        elif what in ('rough', 'metal'):
            cc = N.get('CC_' + what)
            if cc is None:
                cc = N.new('ShaderNodeCombineColor'); cc.name = 'CC_' + what
                for i in range(3): nt.links.new(sock, cc.inputs[i])
            sock = cc.outputs[0]
        nt.links.new(sock, em.inputs['Color'])
        nt.links.new(em.outputs[0], out.inputs['Surface'])
    def bake_pass(img, what, spp, btype='EMIT'):
        tt = time.time()
        for o in scene.objects: o.select_set(False)
        for o in bake_objs: o.select_set(True)
        bpy.context.view_layer.objects.active = bake_objs[0]
        for kd in bmats: wire(kd, what)
        set_target(img)
        scene.cycles.samples = spp
        if btype == 'NORMAL':
            bpy.ops.object.bake(type='NORMAL', normal_space='TANGENT', margin=8, use_clear=True)
        else:
            bpy.ops.object.bake(type='EMIT', margin=8, use_clear=True)
        print('BAKE', what, img.size[0], round(time.time() - tt, 1), 's')
    bake_pass(mask, 'mask', mask_spp)
    # wheel template: its occlusion should not include the body -> re-bake? (it is far away already)
    if mask_res != tex:
        mask.scale(tex, tex)
    for o in occl:
        bpy.data.objects.remove(o)
    col = newimg('albedo', tex, False); rough = newimg('rough', tex); metal = newimg('metal', tex); nrm = newimg('normal', tex)
    bake_pass(col, 'col', 1)
    bake_pass(rough, 'rough', 1)
    bake_pass(metal, 'metal', 1)
    bake_pass(nrm, 'bsdf', normal_spp, 'NORMAL')
    for o in moved:
        o.location = (0, 0, 0)
    dbg = os.environ.get('VKIT_DEBUG_TEX')
    if dbg:
        for im, k in ((mask, 'mask'), (col, 'albedo'), (nrm, 'normal'), (rough, 'rough')):
            im.filepath_raw = os.path.join(dbg, f'{self.id}_{k}.png'); im.file_format = 'PNG'; im.save()
    # ORM
    n = tex * tex * 4
    def px(im):
        a = np.empty(n, dtype=np.float32); im.pixels.foreach_get(a); return a.reshape(-1, 4)
    mk = px(mask); r = px(rough); mt = px(metal)
    orm = np.ones((tex * tex, 4), dtype=np.float32)
    orm[:, 0] = np.clip(0.25 + 0.75 * mk[:, 2], 0, 1) * np.clip(0.55 + 0.45 * mk[:, 1], 0, 1)
    orm[:, 1] = np.clip(r[:, 0], 0.04, 1)
    orm[:, 2] = np.clip(mt[:, 0], 0, 1)
    im_orm = newimg('orm', tex); im_orm.pixels.foreach_set(orm.ravel())
    for im in (col, nrm, im_orm):
        im.pack()
    # restore kind materials so _finish can remap faces by kind
    for (oname, i), m in swapped.items():
        bpy.data.objects[oname].data.materials[i] = m
    # wire the final materials
    for fn in ('paint', 'trim'):
        m = self.final_mats[fn]; nt = m.node_tree; N = nt.nodes
        b = N['Principled BSDF']
        tc = N.new('ShaderNodeTexImage'); tc.image = col
        to = N.new('ShaderNodeTexImage'); to.image = im_orm
        tn = N.new('ShaderNodeTexImage'); tn.image = nrm
        sp = N.new('ShaderNodeSeparateColor'); nm = N.new('ShaderNodeNormalMap')
        if fn == 'paint':
            mul = N.new('ShaderNodeMix'); mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'; mul.inputs['Factor'].default_value = 1.0
            nt.links.new(tc.outputs[0], mul.inputs[6]); mul.inputs[7].default_value = srgb(self.paint)
            nt.links.new(mul.outputs[2], b.inputs['Base Color'])
        else:
            nt.links.new(tc.outputs[0], b.inputs['Base Color'])
        nt.links.new(to.outputs[0], sp.inputs[0])
        nt.links.new(sp.outputs[1], b.inputs['Roughness']); nt.links.new(sp.outputs[2], b.inputs['Metallic'])
        nt.links.new(tn.outputs[0], nm.inputs['Color']); nt.links.new(nm.outputs[0], b.inputs['Normal'])
        gname = 'glTF Material Output'
        grp = bpy.data.node_groups.get(gname)
        if grp is None:
            grp = bpy.data.node_groups.new(gname, 'ShaderNodeTree')
            grp.interface.new_socket('Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
        gn = N.new('ShaderNodeGroup'); gn.node_tree = grp
        nt.links.new(sp.outputs[0], gn.inputs['Occlusion'])


Vehicle.finish = _finish
Vehicle._uv_atlas = _uv_atlas
Vehicle._final_materials = _final_materials
Vehicle._bake = _bake


# ----------------------------------------------------------------------------------------------
# erodable prisms (for "silhouette intersection" bodies)
# ----------------------------------------------------------------------------------------------
def outline_loops(ctrl, erode=0.0, nseg=4, holes=()):
    """rounded control outline -> list of loops, optionally eroded (shapely, round joins)"""
    from shapely.geometry import Polygon
    outer = dedupe(rpoly(ctrl, nseg))
    hl = [dedupe(rpoly(h, nseg)) for h in holes]
    if erode <= 0:
        return [outer] + hl
    g = Polygon(outer, hl).buffer(0).buffer(-erode, join_style=1, quad_segs=nseg)
    if g.geom_type != 'Polygon':
        g = max(g.geoms, key=lambda x: x.area)
    g = g.simplify(0.0005, preserve_topology=True)
    return [list(g.exterior.coords)[:-1]] + [list(h.coords)[:-1] for h in g.interiors]


def prism(v, name, ctrl, plane, a0, a1, kind, erode=0.0, nseg=4, register=False, group='body', holes=()):
    """outline in 'side' (f,u) / 'front' (s,u) / 'top' (f,s) plane, eroded by `erode`, extruded from a0 to a1"""
    loops = outline_loops(ctrl, erode, nseg, holes)
    me = curve_extrude_mesh(_ccw(loops), abs(a1 - a0), 0.0, 1)
    base = {'side': TR(0, 0, (a0 + a1) / 2) @ M_SIDE, 'front': TR((a0 + a1) / 2, 0, 0) @ M_FRONT, 'top': TR(0, (a0 + a1) / 2, 0) @ M_TOP}[plane]
    return v.add(name, me, kind, group, base, register)


def eroded_keys(keys, d):
    return [(f, erode_ctrl(c, d)) for f, c in keys]


def build_moto_tire(v, name, R, width, rim_r, segs=36, nknob=22, group='wheel', kind='tire', knob_h=0.012):
    """round-section motorcycle tyre with knobby blocks on the crown and shoulders. axis = local s"""
    w2 = width / 2
    rc = R - knob_h - w2 * 0.95          # section circle centre radius
    prof = [(w2 * 0.55, rim_r + 0.004)]
    for k in range(13):
        phi = math.radians(-80 + 160 * k / 12)       # -80..80 deg around the section
        prof.append((w2 * 0.98 * math.sin(phi), rc + w2 * 0.95 * math.cos(phi)))
    prof = [prof[0]] + list(reversed(prof[1:])) + [(-w2 * 0.55, rim_r + 0.004)]
    prof = list(reversed(prof))
    me = lathe_mesh(prof + [(prof[-1][0] - 0.003, rim_r - 0.003), (prof[0][0] + 0.003, rim_r - 0.003)], segs, closed=True)
    obs = [v.add(name, me, kind, group)]
    bm = bmesh.new()
    pitch = 2 * math.pi / nknob
    rows = [(-0.0, 0.0, 0.42), (math.radians(38), 0.5, 0.38), (-math.radians(38), 0.5, 0.38)]
    for (phi, aoff, aw) in rows:
        for i in range(nknob):
            th = (i + aoff) * pitch
            # knob centre on the section circle, oriented along the section normal
            nx, nr = math.sin(phi), math.cos(phi)
            cx, cr = w2 * 0.95 * nx, rc + w2 * 0.95 * nr
            hw = w2 * 0.30                   # half width across the tread
            ha = pitch * aw / 2              # half angle along the tread
            verts = []
            for (h, sc) in ((-0.004, 1.0), (knob_h, 0.85)):
                for (dx, da) in ((-hw, -ha), (hw, -ha), (hw, ha), (-hw, ha)):
                    # offset across the section (tangent direction (nr, -nx)) and radially by h along the normal
                    x = cx + dx * sc * nr + h * nx
                    r = cr - dx * sc * nx + h * nr
                    a = th + da * sc
                    verts.append(bm.verts.new((x, r * math.cos(a), r * math.sin(a))))
            b, t = verts[:4], verts[4:]
            for k in range(4):
                k2 = (k + 1) % 4
                bm.faces.new([b[k], b[k2], t[k2], t[k]])
            bm.faces.new(list(reversed(b))); bm.faces.new(t)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obs.append(v.add(name + '_knobs', mesh_from_bm(bm, 'knobs'), kind, group))
    return obs


def build_spoked_rim(v, name, rim_r, width, group='wheel', rim_kind='alu', spoke_kind='steel', hub_kind='alu', nspokes=36, segs=32,
                     hub_r=0.055, hub_w=0.13, drum=True):
    """motorcycle wire wheel: channel rim, laced spokes, hub (+ drum). axis = local s"""
    w2 = width / 2
    rim = [(-w2, rim_r + 0.012), (-w2 + 0.004, rim_r + 0.014), (-w2 + 0.006, rim_r), (-w2 * 0.3, rim_r - 0.008),
           (w2 * 0.3, rim_r - 0.008), (w2 - 0.006, rim_r), (w2 - 0.004, rim_r + 0.014), (w2, rim_r + 0.012)]
    obs = [v.add(name + '_rim', lathe_mesh(thicken(rim, -0.004), segs, closed=True), rim_kind, group)]
    hub = [(-hub_w / 2, 0.0), (-hub_w / 2, hub_r * 0.6), (-hub_w / 2 + 0.01, hub_r), (-hub_w / 2 + 0.02, hub_r), (-0.02, hub_r * 0.7),
           (0.02, hub_r * 0.7), (hub_w / 2 - 0.02, hub_r), (hub_w / 2 - 0.01, hub_r), (hub_w / 2, hub_r * 0.6), (hub_w / 2, 0.0)]
    if drum:
        hub = [(-hub_w / 2, 0.0), (-hub_w / 2, hub_r * 1.5), (-hub_w / 2 + 0.035, hub_r * 1.6), (-hub_w / 2 + 0.045, hub_r), (-0.02, hub_r * 0.7),
               (0.02, hub_r * 0.7), (hub_w / 2 - 0.02, hub_r), (hub_w / 2 - 0.01, hub_r), (hub_w / 2, hub_r * 0.6), (hub_w / 2, 0.0)]
    obs.append(v.add(name + '_hub', lathe_mesh(hub, 20), hub_kind, group))
    bm_list = []
    for i in range(nspokes):
        side = 1 if i % 2 == 0 else -1
        a0 = 2 * math.pi * i / nspokes
        a1 = a0 + side * math.radians(30) * (1 if (i // 2) % 2 == 0 else -1)
        x0 = side * (hub_w / 2 - 0.015)
        p0 = Vector((x0, hub_r * 0.95 * math.cos(a0), hub_r * 0.95 * math.sin(a0)))
        p1 = Vector((side * 0.006, (rim_r - 0.006) * math.cos(a1), (rim_r - 0.006) * math.sin(a1)))
        bm_list.append(tube_mesh([p0, p1], 0.0022, 4, cap=False))
    bm = bmesh.new()
    for me in bm_list:
        bm.from_mesh(me); bpy.data.meshes.remove(me)
    obs.append(v.add(name + '_spokes', mesh_from_bm(bm, 'spokes'), spoke_kind, group))
    return obs
