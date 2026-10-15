"""
wkit -- scripted firearm authoring kit for Blender 4.5 (headless).

Authoring frame ("gun coords", millimetres):
  f = forward along the bore (0 = rear of the butt / rearmost point), u = up (0 = bore axis),
  s = lateral, + = the gun's RIGHT side (ejection side).
Blender coords (meters): x = -s, y = -f, z = u   ->  glTF export (+Y up) gives +Z forward, right side = -X.

Usage: a gun module defines build(g: Gun). Run via build.py.
"""
import bpy, bmesh, math, os, json
from mathutils import Vector, Matrix

MM = 0.001
G2B = Matrix(((0, 0, -1, 0), (-1, 0, 0, 0), (0, 1, 0, 0), (0, 0, 0, 1)))  # gun(f,u,s) -> blender


def gun2b(f, u, s=0.0):
    return Vector((-s * MM, -f * MM, u * MM))


# ----------------------------------------------------------------------------------------------
# 2D helpers
# ----------------------------------------------------------------------------------------------
def fillet(pts, seg_deg=14.0):
    """Closed polygon with optional per-vertex fillet radius: pts = [(x, y) | (x, y, r)] (mm)."""
    n = len(pts)
    out = []
    for i in range(n):
        p = pts[i]
        r = p[2] if len(p) > 2 else 0.0
        P = Vector((p[0], p[1]))
        if r <= 0:
            out.append((P.x, P.y)); continue
        A = Vector(pts[i - 1][:2]); B = Vector(pts[(i + 1) % n][:2])
        da = A - P; db = B - P
        la, lb = da.length, db.length
        if la < 1e-9 or lb < 1e-9:
            out.append((P.x, P.y)); continue
        da /= la; db /= lb
        ang = math.acos(max(-1.0, min(1.0, da.dot(db))))
        if ang < 1e-3 or abs(ang - math.pi) < 1e-3:
            out.append((P.x, P.y)); continue
        t = r / math.tan(ang / 2)
        tmax = 0.5 * min(la, lb)
        if t > tmax:
            t = tmax; r = t * math.tan(ang / 2)
        T1 = P + da * t; T2 = P + db * t
        C = P + (da + db).normalized() * (r / math.sin(ang / 2))
        a1 = math.atan2(T1.y - C.y, T1.x - C.x); a2 = math.atan2(T2.y - C.y, T2.x - C.x)
        d = a2 - a1
        while d > math.pi: d -= 2 * math.pi
        while d < -math.pi: d += 2 * math.pi
        k = max(1, int(math.ceil(abs(math.degrees(d)) / seg_deg)))
        k = min(k, max(1, int(r / 1.2) + 1))
        for j in range(k + 1):
            a = a1 + d * j / k
            out.append((C.x + r * math.cos(a), C.y + r * math.sin(a)))
    res = []
    for q in out:
        if not res or abs(q[0] - res[-1][0]) > 1e-5 or abs(q[1] - res[-1][1]) > 1e-5:
            res.append(q)
    while len(res) > 2 and abs(res[0][0] - res[-1][0]) < 1e-5 and abs(res[0][1] - res[-1][1]) < 1e-5:
        res.pop()
    return res


def arc(cx, cy, r, a0, a1, n=8):
    """Points on an arc (degrees), inclusive."""
    return [(cx + r * math.cos(math.radians(a0 + (a1 - a0) * i / n)),
             cy + r * math.sin(math.radians(a0 + (a1 - a0) * i / n))) for i in range(n + 1)]


def circle(cx, cy, r, n=16):
    return [(cx + r * math.cos(2 * math.pi * i / n), cy + r * math.sin(2 * math.pi * i / n)) for i in range(n)]


def rect(x0, y0, x1, y1, r=0.0):
    return [(x0, y0, r), (x1, y0, r), (x1, y1, r), (x0, y1, r)]


def mirror_x(pts):
    """Make a symmetric closed outline from the right half (x>=0) listed bottom->top."""
    right = list(pts)
    left = [(-p[0], p[1]) + tuple(p[2:]) for p in reversed(pts) if abs(p[0]) > 1e-9]
    return right + left


def bezier(p0, p1, p2, p3, n=8):
    out = []
    for i in range(n + 1):
        t = i / n
        a = (1 - t) ** 3; b = 3 * (1 - t) ** 2 * t; c = 3 * (1 - t) * t * t; d = t ** 3
        out.append((a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]))
    return out


# ----------------------------------------------------------------------------------------------
# mesh builders (return bpy mesh in LOCAL coords, meters)
# ----------------------------------------------------------------------------------------------
def _shrink(loops, bevel):
    """erode the 2D profile by the bevel radius (largest radius <= bevel that keeps the topology)."""
    from shapely.geometry import Polygon
    from shapely.ops import unary_union
    try:
        poly = Polygon(loops[0], [l for l in loops[1:] if len(l) >= 3]).buffer(0)
    except Exception:
        return loops, 0.0
    if poly.is_empty:
        return loops, 0.0
    ncomp = 1 if poly.geom_type == 'Polygon' else len(poly.geoms)
    b = bevel
    while b > 0.08:
        sh = poly.buffer(-b, join_style=2, mitre_limit=2.5)
        if not sh.is_empty:
            nc = 1 if sh.geom_type == 'Polygon' else len([g for g in sh.geoms if g.area > 0.5])
            if nc == ncomp and sh.area > 0.25 * poly.area:
                out = []
                for lp in geom_loops(sh, min_area=0.05, tol=0.04):
                    out.extend(lp)
                if out:
                    return out, b
        b *= 0.65
    return loops, 0.0


def _curve_mesh(loops, half, bevel, bres):
    b = min(bevel, half * 0.98)
    if b > 0.08:
        loops, b = _shrink(loops, b)
    cu = bpy.data.curves.new('tmp', 'CURVE')
    cu.dimensions = '2D'; cu.fill_mode = 'BOTH'
    for loop in loops:
        sp = cu.splines.new('POLY')
        sp.points.add(len(loop) - 1)
        for p, q in zip(sp.points, loop):
            p.co = (q[0] * MM, q[1] * MM, 0.0, 1.0)
        sp.use_cyclic_u = True
    if b > 0.08:
        cu.bevel_mode = 'ROUND'; cu.bevel_depth = b * MM; cu.bevel_resolution = bres; cu.offset = 0.0
    else:
        b = 0.0
    cu.extrude = max(half - b, 0.0) * MM
    ob = bpy.data.objects.new('tmp', cu)
    bpy.context.scene.collection.objects.link(ob)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    bpy.data.objects.remove(ob); bpy.data.curves.remove(cu)
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bm.to_mesh(me); bm.free()
    return me


def _lathe_mesh(profile, segs=24, closed=False, cap0=True, cap1=True, a0=0.0, a1=360.0):
    """profile: [(x_axis_mm, r_mm)], revolve around local X. local vert = (x, r cos a, r sin a)."""
    bm = bmesh.new()
    full = abs(a1 - a0) >= 359.9
    nseg = segs
    rings = []
    for (x, r) in profile:
        ring = []
        cnt = nseg if full else nseg + 1
        for j in range(cnt):
            a = math.radians(a0 + (a1 - a0) * j / nseg)
            ring.append(bm.verts.new((x * MM, r * MM * math.cos(a), r * MM * math.sin(a))))
        rings.append(ring)
    npf = len(rings)
    pairs = [(i, i + 1) for i in range(npf - 1)]
    if closed:
        pairs.append((npf - 1, 0))
    cnt = len(rings[0])
    for (i, k) in pairs:
        for j in range(cnt if full else cnt - 1):
            j2 = (j + 1) % cnt
            vs = [rings[i][j], rings[k][j], rings[k][j2], rings[i][j2]]
            try:
                bm.faces.new(vs)
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
    me = bpy.data.meshes.new('lathe')
    bm.to_mesh(me); bm.free()
    return me


# local->gun matrices
L_SIDE = Matrix.Identity(4)                                                     # (x=f, y=u, z=s)
L_FRONT = Matrix(((0, 0, 1, 0), (0, 1, 0, 0), (-1, 0, 0, 0), (0, 0, 0, 1)))       # (x=-s, y=u, z=f)
L_AX_F = Matrix.Identity(4)                                                      # lathe axis along f
L_AX_U = Matrix(((0, 1, 0, 0), (1, 0, 0, 0), (0, 0, -1, 0), (0, 0, 0, 1)))        # lathe axis along u
L_AX_S = Matrix(((0, 1, 0, 0), (0, 0, 1, 0), (1, 0, 0, 0), (0, 0, 0, 1)))         # lathe axis along s


def T(f, u, s):
    return Matrix.Translation((f * MM, u * MM, s * MM))


def rot_f(deg, u_c=0.0, s_c=0.0):
    """rotation around the f axis (in gun coords), positive turns +u toward +s."""
    a = math.radians(deg)
    R = Matrix(((1, 0, 0, 0), (0, math.cos(a), -math.sin(a), 0), (0, math.sin(a), math.cos(a), 0), (0, 0, 0, 1)))
    return T(0, u_c, s_c) @ R @ T(0, -u_c, -s_c)


def rot_s(deg, f_c=0.0, u_c=0.0):
    """rotation around the lateral axis (pitch), positive raises the front (+f toward +u)."""
    a = math.radians(deg)
    R = Matrix(((math.cos(a), -math.sin(a), 0, 0), (math.sin(a), math.cos(a), 0, 0), (0, 0, 1, 0), (0, 0, 0, 1)))
    return T(f_c, u_c, 0) @ R @ T(-f_c, -u_c, 0)


def rot_u(deg, f_c=0.0, s_c=0.0):
    a = math.radians(deg)
    R = Matrix(((math.cos(a), 0, math.sin(a), 0), (0, 1, 0, 0), (-math.sin(a), 0, math.cos(a), 0), (0, 0, 0, 1)))
    return T(f_c, 0, s_c) @ R @ T(-f_c, 0, -s_c)


# ----------------------------------------------------------------------------------------------
# materials
# ----------------------------------------------------------------------------------------------
def srgb(h):
    """hex '#rrggbb' or tuple of 0-1 sRGB -> linear tuple"""
    if isinstance(h, str):
        h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    else:
        c = list(h)
    return tuple(((x / 12.92) if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4) for x in c) + (1.0,)


KINDS = {
    # base colour, variation colour, metal, rough, rough var, wear colour, wear amount, pattern, bump
    'park':     dict(base='#2e2f30', var='#3a3a38', metal=0.55, rough=0.62, rvar=0.12, wear='#8d8f92', wear_amt=0.8, wear_rough=0.32, pat='fine', bump=0.25),
    'blued':    dict(base='#1d2024', var='#2a2b2e', metal=0.85, rough=0.36, rvar=0.10, wear='#a7a9ac', wear_amt=1.0, wear_rough=0.25, pat='fine', bump=0.15),
    'steel':    dict(base='#5c5e61', var='#4c4d4f', metal=1.0, rough=0.38, rvar=0.10, wear='#a2a4a7', wear_amt=0.5, wear_rough=0.25, pat='brushed', bump=0.15),
    'bright':   dict(base='#9a9b9c', var='#86888a', metal=1.0, rough=0.28, rvar=0.08, wear='#c4c5c6', wear_amt=0.3, wear_rough=0.2, pat='brushed', bump=0.1),
    'anod':     dict(base='#1b1c1d', var='#242526', metal=0.6, rough=0.48, rvar=0.10, wear='#9fa2a6', wear_amt=0.7, wear_rough=0.3, pat='fine', bump=0.15),
    'anod_tan': dict(base='#7b6a50', var='#6c5c44', metal=0.3, rough=0.55, rvar=0.10, wear='#9fa2a6', wear_amt=0.6, wear_rough=0.3, pat='fine', bump=0.15),
    'poly':     dict(base='#1d1d1e', var='#262627', metal=0.0, rough=0.62, rvar=0.10, wear='#3c3c3d', wear_amt=0.5, wear_rough=0.5, pat='stipple', bump=0.35),
    'poly_tan': dict(base='#8a7556', var='#7a6649', metal=0.0, rough=0.66, rvar=0.10, wear='#a99678', wear_amt=0.5, wear_rough=0.55, pat='stipple', bump=0.35),
    'poly_od':  dict(base='#4d5139', var='#434631', metal=0.0, rough=0.66, rvar=0.10, wear='#6d7158', wear_amt=0.5, wear_rough=0.55, pat='stipple', bump=0.35),
    'rubber':   dict(base='#161616', var='#1e1e1e', metal=0.0, rough=0.85, rvar=0.06, wear='#262626', wear_amt=0.3, wear_rough=0.8, pat='stipple', bump=0.5),
    'wood':     dict(base='#5a2f17', var='#7a4523', metal=0.0, rough=0.5, rvar=0.12, wear='#8a5a33', wear_amt=0.6, wear_rough=0.6, pat='wood', bump=0.3),
    'wood_red': dict(base='#5e2312', var='#86381c', metal=0.0, rough=0.38, rvar=0.10, wear='#a0603a', wear_amt=0.6, wear_rough=0.55, pat='wood', bump=0.25),
    'wood_light': dict(base='#7a4a26', var='#a06a3a', metal=0.0, rough=0.5, rvar=0.12, wear='#b58757', wear_amt=0.5, wear_rough=0.6, pat='wood', bump=0.3),
    'bakelite': dict(base='#4a1d12', var='#5e2a18', metal=0.0, rough=0.42, rvar=0.10, wear='#6a3a28', wear_amt=0.5, wear_rough=0.5, pat='fine', bump=0.15),
    'park_light': dict(base='#45474a', var='#3c3e40', metal=0.6, rough=0.55, rvar=0.12, wear='#9a9ca0', wear_amt=0.8, wear_rough=0.3, pat='fine', bump=0.2),
    'brass':    dict(base='#b08a45', var='#9a7535', metal=1.0, rough=0.3, rvar=0.10, wear='#d0b070', wear_amt=0.3, wear_rough=0.2, pat='none', bump=0.05),
    'copper':   dict(base='#b06a40', var='#9a5a35', metal=1.0, rough=0.3, rvar=0.10, wear='#d0906a', wear_amt=0.3, wear_rough=0.2, pat='none', bump=0.05),
    'red_shell': dict(base='#8a1a14', var='#7a1610', metal=0.0, rough=0.45, rvar=0.10, wear='#a03a30', wear_amt=0.3, wear_rough=0.4, pat='none', bump=0.05),
    'glass':    dict(base='#0c1014', var='#0c1014', metal=0.2, rough=0.08, rvar=0.02, wear='#0c1014', wear_amt=0.0, wear_rough=0.1, pat='none', bump=0.0),
    'paint_od': dict(base='#4a4d36', var='#3f422d', metal=0.0, rough=0.6, rvar=0.12, wear='#7d8085', wear_amt=1.0, wear_rough=0.3, pat='fine', bump=0.2, wear_metal=0.9),
    'cloth':    dict(base='#5a5642', var='#4a4636', metal=0.0, rough=0.9, rvar=0.05, wear='#6a6650', wear_amt=0.2, wear_rough=0.9, pat='stipple', bump=0.6),
}


class NB:
    """tiny node-building helper"""
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
        if isinstance(val, (int, float)):
            sock.default_value = val
        elif isinstance(val, tuple):
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

    def noise(self, vec, scale, detail=4.0, rough=0.55, w=None):
        nd = self.n('ShaderNodeTexNoise', noise_dimensions='3D')
        self.link(vec, nd.inputs['Vector'])
        nd.inputs['Scale'].default_value = scale; nd.inputs['Detail'].default_value = detail
        nd.inputs['Roughness'].default_value = rough
        return nd.outputs['Fac']

    def mapscale(self, vec, sx, sy, sz):
        nd = self.n('ShaderNodeMapping')
        self.link(vec, nd.inputs['Vector']); nd.inputs['Scale'].default_value = (sx, sy, sz)
        return nd.outputs[0]

    def ramp(self, fac, a, b):
        """map fac in [a,b] -> [0,1] clamped"""
        nd = self.n('ShaderNodeMapRange', clamp=True)
        self._in(nd.inputs['Value'], fac); nd.inputs['From Min'].default_value = a; nd.inputs['From Max'].default_value = b
        return nd.outputs[0]


def make_kind_material(kind, mask_img):
    k = dict(KINDS[kind])
    mat = bpy.data.materials.new('K_' + kind)
    mat.use_nodes = True
    nb = NB(mat)
    for nd in list(nb.N):
        nb.N.remove(nd)
    out = nb.n('ShaderNodeOutputMaterial'); out.name = 'OUT'
    bsdf = nb.n('ShaderNodeBsdfPrincipled'); bsdf.name = 'BSDF'
    emit = nb.n('ShaderNodeEmission'); emit.name = 'EMIT'
    tc = nb.n('ShaderNodeTexCoord')
    obj = tc.outputs['Object']
    # --- live masks (used only by the mask bake) ---
    bev = nb.n('ShaderNodeBevel'); bev.samples = 8; bev.inputs['Radius'].default_value = 0.0022
    geo = nb.n('ShaderNodeNewGeometry')
    dot = nb.n('ShaderNodeVectorMath', operation='DOT_PRODUCT')
    nb.link(bev.outputs['Normal'], dot.inputs[0]); nb.link(geo.outputs['Normal'], dot.inputs[1])
    edge_live = nb.ramp(nb.math('SUBTRACT', 1.0, dot.outputs['Value']), 0.004, 0.08)
    ao = nb.n('ShaderNodeAmbientOcclusion'); ao.samples = 16; ao.inputs['Distance'].default_value = 0.025
    comb = nb.n('ShaderNodeCombineColor'); comb.name = 'MASK_LIVE'
    nb.link(edge_live, comb.inputs[0]); nb.link(ao.outputs['AO'], comb.inputs[1])
    # --- baked masks ---
    mt = nb.n('ShaderNodeTexImage'); mt.image = mask_img; mt.name = 'MASK_TEX'; mt.interpolation = 'Linear'
    sep = nb.n('ShaderNodeSeparateColor'); nb.link(mt.outputs['Color'], sep.inputs[0])
    edge = sep.outputs[0]; aom = sep.outputs[1]
    # --- colour ---
    base = srgb(k['base']); var = srgb(k['var']); wearc = srgb(k['wear'])
    n1 = nb.noise(obj, 9.0, 5.0, 0.6)
    n2 = nb.noise(obj, 60.0, 6.0, 0.6)
    n3 = nb.noise(obj, 220.0, 3.0, 0.5)
    pat = k['pat']
    if pat == 'wood':
        wv = nb.n('ShaderNodeTexWave', wave_type='BANDS', bands_direction='Z', wave_profile='SIN')
        nb.link(nb.mapscale(obj, 1.0, 0.08, 1.0), wv.inputs['Vector'])
        wv.inputs['Scale'].default_value = 28.0; wv.inputs['Distortion'].default_value = 9.0
        wv.inputs['Detail'].default_value = 4.0; wv.inputs['Detail Scale'].default_value = 1.6
        grain = nb.ramp(wv.outputs['Fac'], 0.15, 1.0)
        fine = nb.noise(nb.mapscale(obj, 1.0, 0.05, 1.0), 260.0, 2.0, 0.5)
        g2 = nb.math('MULTIPLY', nb.math('ADD', nb.math('MULTIPLY', grain, 0.75), nb.math('MULTIPLY', fine, 0.45)), 1.0)
        col = nb.mix(nb.ramp(g2, 0.25, 1.0), base, var)
        col = nb.mix(nb.math('MULTIPLY', nb.ramp(n1, 0.35, 0.7), 0.35), col, srgb('#3a1d0e'))
        bump_h = nb.math('ADD', nb.math('MULTIPLY', grain, 0.6), nb.math('MULTIPLY', fine, 0.4))
    else:
        col = nb.mix(nb.ramp(n1, 0.3, 0.75), base, var)
        col = nb.mix(nb.math('MULTIPLY', nb.ramp(n2, 0.45, 0.75), 0.4), col, var)
        if pat == 'stipple':
            bump_h = nb.noise(obj, 1400.0, 1.0, 0.5)
        elif pat == 'brushed':
            bump_h = nb.noise(nb.mapscale(obj, 30.0, 0.6, 30.0), 120.0, 2.0, 0.5)
        elif pat == 'fine':
            bump_h = nb.math('ADD', nb.math('MULTIPLY', nb.noise(obj, 900.0, 2.0, 0.5), 0.7), nb.math('MULTIPLY', n3, 0.3))
        else:
            bump_h = n3
    # wear on convex edges, broken up by noise
    convex = nb.math('MULTIPLY', edge, nb.ramp(aom, 0.55, 0.95))
    brk = nb.ramp(nb.noise(obj, 140.0, 4.0, 0.65), 0.38, 0.62)
    wear = nb.math('MULTIPLY', nb.math('MULTIPLY', convex, nb.math('ADD', brk, 0.25)), k['wear_amt'], clamp=True)
    wear = nb.ramp(wear, 0.12, 0.6)
    col = nb.mix(wear, col, wearc)
    # cavity grime
    cav = nb.math('SUBTRACT', 1.0, aom)
    col = nb.mix(nb.math('MULTIPLY', cav, 0.55, clamp=True), col, nb.mul_rgb(col, srgb('#3a3632')))
    col_out = col
    rough = nb.math('ADD', k['rough'], nb.math('MULTIPLY', nb.math('SUBTRACT', n2, 0.5), k['rvar'] * 2))
    rough = nb.mixf(wear, rough, k['wear_rough'])
    rough = nb.math('ADD', rough, nb.math('MULTIPLY', cav, 0.15), clamp=True)
    metal = nb.mixf(wear, k['metal'], k.get('wear_metal', max(k['metal'], 0.0 if k['metal'] < 0.01 else 1.0)))
    # normal: bevel-rounded edges + bump
    bump = nb.n('ShaderNodeBump'); bump.inputs['Strength'].default_value = k['bump']; bump.inputs['Distance'].default_value = 0.0004
    nb.link(bump_h, bump.inputs['Height']); nb.link(bev.outputs['Normal'], bump.inputs['Normal'])
    nb.link(bump.outputs['Normal'], bsdf.inputs['Normal'])
    nb._in(bsdf.inputs['Base Color'], col_out); nb._in(bsdf.inputs['Roughness'], rough); nb._in(bsdf.inputs['Metallic'], metal)
    nb.link(bsdf.outputs[0], out.inputs['Surface'])
    # stash sockets for bake switching
    mat['kind'] = kind
    st = {'col': col_out, 'rough': rough, 'metal': metal, 'mask': comb.outputs[0]}
    return mat, st


# ----------------------------------------------------------------------------------------------
# Gun
# ----------------------------------------------------------------------------------------------
class Gun:
    def __init__(self, gid):
        self.id = gid
        self.parts = []          # (obj, group)
        self.empties = {}        # name -> (f,u,s) mm
        self.pivots = {}         # group -> (f,u,s) mm
        self.grip = (0.0, 0.0)   # (f,u) mm
        self.meta = {}
        self.kind_mats = {}
        self.sockets = {}
        self.tex = 1024
        self.mask_img = None
        self.global_M = Matrix.Identity(4)

    def set_global(self, scale=1.0, f0=0.0, u0=0.0):
        """all subsequent gun coords are mapped (f,u,s) -> ((f-f0)*scale, (u-u0)*scale, s*scale)"""
        self.global_M = Matrix.Scale(scale, 4) @ T(-f0, -u0, 0)

    def _gp(self, f, u, s=0.0):
        v = self.global_M @ Vector((f * MM, u * MM, s * MM))
        return (v.x / MM, v.y / MM, v.z / MM)

    # ---------- material ----------
    def mat(self, kind):
        if kind not in self.kind_mats:
            if self.mask_img is None:
                self.mask_img = bpy.data.images.new('mask_' + self.id, self.tex, self.tex, alpha=False)
                self.mask_img.colorspace_settings.name = 'Non-Color'
            m, st = make_kind_material(kind, self.mask_img)
            self.kind_mats[kind] = m; self.sockets[kind] = st
        return self.kind_mats[kind]

    # ---------- part registration ----------
    def _add(self, name, me, M, kind, group, taper=None, s_c=0.0):
        me.transform(M)
        gl = self.global_M
        if gl != Matrix.Identity(4) and taper:
            pass
        if taper:
            # taper: list of (f_mm, k) piecewise lateral scale about s_c, evaluated in gun coords
            tp = sorted(taper)
            for v in me.vertices:
                f = v.co.x / MM
                if f <= tp[0][0]: k = tp[0][1]
                elif f >= tp[-1][0]: k = tp[-1][1]
                else:
                    for (fa, ka), (fb, kb) in zip(tp, tp[1:]):
                        if fa <= f <= fb:
                            t = (f - fa) / (fb - fa) if fb > fa else 0; k = ka + (kb - ka) * t; break
                v.co.z = s_c * MM + (v.co.z - s_c * MM) * k
        me.transform(self.global_M)
        me.transform(G2B)
        me.materials.clear(); me.materials.append(self.mat(kind))
        ob = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(ob)
        ob['group'] = group
        self.parts.append((ob, group))
        return ob

    def side(self, name, pts, width, kind, group='body', s=0.0, bevel=None, bres=2, holes=(), taper=None, M=None, seg=14.0):
        """side-profile (f,u) outline extruded laterally, centred at lateral s"""
        loops = [fillet(pts, seg)] + [fillet(h, seg) for h in holes]
        b = bevel if bevel is not None else min(width * 0.18, 1.6)
        me = _curve_mesh(loops, width / 2.0, b, bres)
        Mx = T(0, 0, s)
        if M is not None: Mx = M @ Mx
        return self._add(name, me, Mx, kind, group, taper=taper, s_c=s)

    def front(self, name, pts, f0, f1, kind, group='body', bevel=None, bres=1, holes=(), M=None, u=0.0, s=0.0, seg=14.0):
        """cross-section outline in (s,u) (mm, relative to (s,u)) extruded along f from f0 to f1"""
        conv = lambda L: [(-p[0], p[1]) + tuple(p[2:]) for p in L]
        loops = [fillet(conv(pts), seg)] + [fillet(conv(h), seg) for h in holes]
        loops = [list(reversed(l)) for l in loops]
        half = abs(f1 - f0) / 2.0
        b = bevel if bevel is not None else min(half * 0.3, 1.0)
        me = _curve_mesh(loops, half, b, bres)
        Mx = T((f0 + f1) / 2.0, u, s) @ L_FRONT
        if M is not None: Mx = M @ Mx
        return self._add(name, me, Mx, kind, group)

    def lathe(self, name, prof, kind, group='body', f=0.0, u=0.0, s=0.0, axis='f', segs=24, closed=False, M=None, a0=0.0, a1=360.0, cap0=True, cap1=True):
        """profile [(x_along_axis_mm, r_mm)]; axis origin at (f,u,s)"""
        me = _lathe_mesh(prof, segs, closed, cap0, cap1, a0, a1)
        L = {'f': L_AX_F, 'u': L_AX_U, 's': L_AX_S}[axis]
        Mx = T(f, u, s) @ L
        if M is not None: Mx = M @ Mx
        return self._add(name, me, Mx, kind, group)

    def tube(self, name, f0, f1, r, kind, group='body', u=0.0, s=0.0, segs=20, r1=None, chamfer=0.4, bore=0.0, M=None):
        r1 = r if r1 is None else r1
        c = min(chamfer, r * 0.3, abs(f1 - f0) * 0.3)
        if bore > 0:
            prof = [(f0, bore), (f0, r - c), (f0 + c, r), (f1 - c, r1), (f1, r1 - c), (f1, bore)]
            return self.lathe(name, prof, kind, group, 0, u, s, 'f', segs, closed=True, M=M)
        prof = [(f0, 0), (f0, r - c), (f0 + c, r), (f1 - c, r1), (f1, r1 - c), (f1, 0)]
        return self.lathe(name, prof, kind, group, 0, u, s, 'f', segs, M=M)

    def box(self, name, f0, f1, u0, u1, width, kind, group='body', s=0.0, r=0.0, bevel=None, M=None):
        return self.side(name, rect(f0, u0, f1, u1, r), width, kind, group, s=s, bevel=bevel, M=M)

    def rail(self, name, f0, f1, u_base, kind='anod', group='body', s=0.0, ang=0.0, u_c=0.0, s_c=0.0, pitch=10.0, base=True, slot_from=None):
        """Picatinny rail on top of a surface at height u_base (bottom of rail), rotate by ang about (u_c,s_c)"""
        M = rot_f(ang, u_c, s_c)
        prof_base = [(-8.0, 0, 0), (8.0, 0, 0), (8.0, 3.2, 0), (-8.0, 3.2, 0)]
        prof_tooth = [(-7.6, 3.0), (7.6, 3.0), (10.6, 5.6), (10.6, 6.6), (7.9, 9.4), (-7.9, 9.4), (-10.6, 6.6), (-10.6, 5.6)]
        if base:
            self.front(name + '_base', prof_base, f0, f1, kind, group, bevel=0.3, u=u_base, s=s, M=M)
        n = int((f1 - f0 - 4.0) // pitch)
        start = f0 + ((f1 - f0) - (n * pitch - (pitch - 5.2))) / 2.0
        teeth = []
        for i in range(n):
            a = start + i * pitch
            teeth.append(self.front(f'{name}_t{i}', prof_tooth, a, a + 5.2, kind, group, bevel=0.0, bres=1, u=u_base, s=s, M=M))
        # web under teeth across slots
        self.front(name + '_web', [(-7.6, 3.0), (7.6, 3.0), (10.0, 5.4), (10.0, 6.0), (-10.0, 6.0), (-10.0, 5.4)], f0 + 1, f1 - 1, kind, group, bevel=0.2, u=u_base, s=s, M=M)
        return teeth

    def empty(self, name, f, u, s=0.0):
        self.empties[name] = self._gp(f, u, s)

    def pivot(self, group, f, u, s=0.0):
        self.pivots[group] = self._gp(f, u, s)

    def set_grip(self, f, u):
        p = self._gp(f, u, 0.0); self.grip = (p[0], p[1])

    # ---------- finishing ----------
    def finish(self, out_path, bake=True, samples=16, keep_blend=None):
        scene = bpy.context.scene
        groups = {}
        rep = {}
        for ob, g in self.parts:
            groups.setdefault(g, []).append(ob)
            ob.data.calc_loop_triangles()
            key = ''.join(c for c in ob.name if not c.isdigit())
            rep[key] = rep.get(key, 0) + len(ob.data.loop_triangles)
        print('PARTTRIS', sorted(rep.items(), key=lambda kv: -kv[1])[:25])
        gobs = {}
        for g, obs in groups.items():
            for o in bpy.context.view_layer.objects: o.select_set(False)
            for o in obs: o.select_set(True)
            bpy.context.view_layer.objects.active = obs[0]
            if len(obs) > 1:
                with bpy.context.temp_override(active_object=obs[0], selected_objects=obs, selected_editable_objects=obs, object=obs[0]):
                    bpy.ops.object.join()
            ob = obs[0]; ob.name = g; ob.data.name = g
            me = ob.data
            bm = bmesh.new(); bm.from_mesh(me)
            bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=2e-6)
            bm.to_mesh(me); bm.free()
            me.shade_smooth()
            me.set_sharp_from_angle(angle=math.radians(38))
            wn = ob.modifiers.new('wn', 'WEIGHTED_NORMAL'); wn.keep_sharp = True; wn.weight = 50
            gobs[g] = ob
        objs = list(gobs.values())
        # ---- stats ----
        dg = bpy.context.evaluated_depsgraph_get()
        tris = 0
        for o in objs:
            m2 = o.evaluated_get(dg).to_mesh(); m2.calc_loop_triangles(); tris += len(m2.loop_triangles); o.evaluated_get(dg).to_mesh_clear()
        self.meta['tris'] = tris
        print('TRIS', self.id, tris)
        # ---- UV: unwrap per colour class, shelf-pack the class squares (prevents colour bleeding) ----
        self._uv_classes(objs)
        final = self._bake(objs, samples) if bake else None
        if final:
            for o in objs:
                o.data.materials.clear(); o.data.materials.append(final)
        # ---- pivots / origin ----
        grip_b = gun2b(self.grip[0], self.grip[1], 0)
        root = bpy.data.objects.new(self.id, None)
        scene.collection.objects.link(root)
        for g, o in gobs.items():
            pv = self.pivots.get(g)
            pb = gun2b(*pv) if pv else grip_b
            o.data.transform(Matrix.Translation(-pb))
            o.location = pb - grip_b
            o.parent = root
        bounds_min = Vector((1e9,) * 3); bounds_max = Vector((-1e9,) * 3)
        dg = bpy.context.evaluated_depsgraph_get()
        for o in objs:
            for v in o.data.vertices:
                w = o.matrix_world @ v.co
                bounds_min = Vector(map(min, bounds_min, w)); bounds_max = Vector(map(max, bounds_max, w))
        for name, (f, u, s) in self.empties.items():
            e = bpy.data.objects.new(name, None)
            e.empty_display_type = 'PLAIN_AXES'; e.empty_display_size = 0.02
            scene.collection.objects.link(e)
            e.location = gun2b(f, u, s) - grip_b
            e.parent = root
        # glTF bounds (x, y, z) = (x_b, z_b, -y_b)
        self.meta['bounds_min'] = [round(bounds_min.x, 4), round(bounds_min.z, 4), round(-bounds_max.y, 4)]
        self.meta['bounds_max'] = [round(bounds_max.x, 4), round(bounds_max.z, 4), round(-bounds_min.y, 4)]
        self.meta['length_m'] = round(bounds_max.y - bounds_min.y, 4)
        self.meta['nodes'] = [self.id] + sorted(gobs.keys()) + sorted(self.empties.keys())
        if keep_blend:
            bpy.ops.wm.save_as_mainfile(filepath=keep_blend)
        for o in bpy.context.view_layer.objects: o.select_set(False)
        bpy.ops.export_scene.gltf(filepath=out_path, export_format='GLB', use_selection=False, export_apply=True,
                                  export_yup=True, export_tangents=True, export_image_format='JPEG', export_jpeg_quality=88,
                                  export_cameras=False, export_lights=False, export_animations=False, export_extras=False,
                                  export_draco_mesh_compression_enable=False)
        return self.meta

    def _uv_classes(self, objs):
        DARK = {'park', 'blued', 'steel', 'bright', 'anod', 'poly', 'rubber', 'glass', 'park_light'}
        cls_of = lambda kind: 'dark' if kind in DARK else kind
        for o in bpy.context.view_layer.objects: o.select_set(False)
        for o in objs:
            o.select_set(True)
            if not o.data.uv_layers: o.data.uv_layers.new(name='UVMap')
        bpy.context.view_layer.objects.active = objs[0]
        bpy.context.scene.tool_settings.use_uv_select_sync = True
        # class areas
        areas = {}
        for o in objs:
            for poly in o.data.polygons:
                m = o.data.materials[poly.material_index]
                c = cls_of(m.get('kind', 'park'))
                areas[c] = areas.get(c, 0.0) + poly.area
        classes = sorted(areas, key=lambda c: -areas[c])
        bpy.ops.object.mode_set(mode='EDIT')
        for c in classes:
            for o in objs:
                bm = bmesh.from_edit_mesh(o.data)
                for f in bm.faces:
                    m = o.data.materials[f.material_index]
                    f.select = (cls_of(m.get('kind', 'park')) == c)
                bmesh.update_edit_mesh(o.data)
            bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.0, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
            try:
                bpy.ops.uv.pack_islands(udim_source='CLOSEST_UDIM', rotate=True, margin_method='FRACTION', margin=0.012, shape_method='CONCAVE')
            except Exception as e:
                print('pack fail', e)
        bpy.ops.object.mode_set(mode='OBJECT')
        # shelf-pack squares of side ~ sqrt(area share)
        tot = sum(areas.values())
        sides = [math.sqrt(areas[c] / tot) for c in classes]
        gap = 6.0 / self.tex
        def place(k):
            pos = []; x = y = rowh = 0.0
            for sd in sides:
                w = sd * k
                if x + w > 1.0 + 1e-9:
                    x = 0.0; y += rowh + gap; rowh = 0.0
                pos.append((x, y, w)); x += w + gap; rowh = max(rowh, w)
            return pos if y + rowh <= 1.0 + 1e-9 else None
        lo, hi = 0.3, 1.0
        best = place(lo) or [(0, 0, sd * 0.3) for sd in sides]
        for _ in range(30):
            mid = (lo + hi) / 2; r = place(mid)
            if r: best, lo = r, mid
            else: hi = mid
        rect = dict(zip(classes, best))
        print('UVCLASSES', {c: [round(v, 3) for v in rect[c]] for c in classes})
        for o in objs:
            me = o.data; uv = me.uv_layers.active.data
            for poly in me.polygons:
                c = cls_of(me.materials[poly.material_index].get('kind', 'park'))
                x0, y0, w = rect[c]
                for li in poly.loop_indices:
                    u, v = uv[li].uv
                    uv[li].uv = (x0 + u * w, y0 + v * w)

    def _bake(self, objs, samples):
        scene = bpy.context.scene
        scene.render.engine = 'CYCLES'
        scene.cycles.device = 'CPU'
        scene.cycles.use_denoising = False
        scene.render.bake.margin = 6
        scene.render.bake.margin_type = 'EXTEND'
        if scene.world is None:
            scene.world = bpy.data.worlds.new('W')
        tex = self.tex
        imgs = {}
        def newimg(name, noncolor=True):
            im = bpy.data.images.new(f'{self.id}_{name}', tex, tex, alpha=False)
            if noncolor: im.colorspace_settings.name = 'Non-Color'
            return im
        imgs['mask'] = self.mask_img
        imgs['nrm'] = newimg('normal'); imgs['col'] = newimg('albedo', False); imgs['rough'] = newimg('rough'); imgs['metal'] = newimg('metal')
        # bake target node per material
        tnodes = {}
        for kind, m in self.kind_mats.items():
            nt = m.node_tree
            tn = nt.nodes.new('ShaderNodeTexImage'); tn.name = 'BAKE_TARGET'
            tnodes[kind] = tn
        def set_target(im):
            for kind, m in self.kind_mats.items():
                tn = tnodes[kind]; tn.image = im
                for nd in m.node_tree.nodes: nd.select = False
                tn.select = True; m.node_tree.nodes.active = tn
        def wire(kind, what):
            m = self.kind_mats[kind]; nt = m.node_tree; N = nt.nodes
            out = N['OUT']; em = N['EMIT']
            for l in list(out.inputs['Surface'].links): nt.links.remove(l)
            for l in list(em.inputs['Color'].links): nt.links.remove(l)
            if what == 'bsdf':
                nt.links.new(N['BSDF'].outputs[0], out.inputs['Surface']); return
            sock = self.sockets[kind][what]
            if what in ('rough', 'metal'):
                cc = N.get('CC_' + what)
                if cc is None:
                    cc = N.new('ShaderNodeCombineColor'); cc.name = 'CC_' + what
                    for i in range(3): nt.links.new(sock, cc.inputs[i])
                sock = cc.outputs[0]
            nt.links.new(sock, em.inputs['Color'])
            nt.links.new(em.outputs[0], out.inputs['Surface'])
        for o in bpy.context.view_layer.objects: o.select_set(False)
        for o in objs: o.select_set(True)
        bpy.context.view_layer.objects.active = objs[0]
        import time
        for what, img, btype, spp in (('mask', imgs['mask'], 'EMIT', samples), ('bsdf', imgs['nrm'], 'NORMAL', samples),
                                      ('col', imgs['col'], 'EMIT', 4), ('rough', imgs['rough'], 'EMIT', 2), ('metal', imgs['metal'], 'EMIT', 1)):
            t0 = time.time()
            for kind in self.kind_mats: wire(kind, what)
            set_target(img)
            scene.cycles.samples = spp
            if btype == 'NORMAL':
                bpy.ops.object.bake(type='NORMAL', normal_space='TANGENT', margin=6, use_clear=True)
            else:
                bpy.ops.object.bake(type='EMIT', margin=6, use_clear=True)
            print('BAKE', what, round(time.time() - t0, 1), 's')
        for kind in self.kind_mats: wire(kind, 'bsdf')
        # ---- pack ORM ----
        import numpy as np
        n = tex * tex * 4
        def px(im):
            a = np.empty(n, dtype=np.float32); im.pixels.foreach_get(a); return a.reshape(-1, 4)
        mk = px(imgs['mask']); r = px(imgs['rough']); mt = px(imgs['metal'])
        orm = np.ones((tex * tex, 4), dtype=np.float32)
        orm[:, 0] = np.clip(0.35 + 0.65 * mk[:, 1], 0, 1)
        orm[:, 1] = np.clip(r[:, 0], 0.04, 1)
        orm[:, 2] = np.clip(mt[:, 0], 0, 1)
        im_orm = newimg('orm'); im_orm.pixels.foreach_set(orm.ravel())
        im_orm.pack(); imgs['col'].pack(); imgs['nrm'].pack()
        self.baked = imgs; self.baked['orm'] = im_orm
        # ---- final material ----
        fm = bpy.data.materials.new('M_' + self.id); fm.use_nodes = True
        nt = fm.node_tree; N = nt.nodes
        bs = N['Principled BSDF']
        tc = N.new('ShaderNodeTexImage'); tc.image = imgs['col']
        to = N.new('ShaderNodeTexImage'); to.image = im_orm
        tn = N.new('ShaderNodeTexImage'); tn.image = imgs['nrm']
        sp = N.new('ShaderNodeSeparateColor')
        nm = N.new('ShaderNodeNormalMap')
        nt.links.new(tc.outputs[0], bs.inputs['Base Color'])
        nt.links.new(to.outputs[0], sp.inputs[0])
        nt.links.new(sp.outputs[1], bs.inputs['Roughness']); nt.links.new(sp.outputs[2], bs.inputs['Metallic'])
        nt.links.new(tn.outputs[0], nm.inputs['Color']); nt.links.new(nm.outputs[0], bs.inputs['Normal'])
        # occlusion via glTF Material Output group
        gname = 'glTF Material Output'
        grp = bpy.data.node_groups.get(gname)
        if grp is None:
            grp = bpy.data.node_groups.new(gname, 'ShaderNodeTree')
            grp.interface.new_socket('Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
        gn = N.new('ShaderNodeGroup'); gn.node_tree = grp
        nt.links.new(sp.outputs[0], gn.inputs['Occlusion'])
        return fm


def apply_mirror_s(g, fn):
    """helper: call fn(side_sign) for both sides"""
    fn(1); fn(-1)


# ----------------------------------------------------------------------------------------------
# traced silhouettes (ref/<id>.json produced by trace.py), clipped into parts with shapely
# ----------------------------------------------------------------------------------------------
class Sil:
    def __init__(self, path, bore_u=0.0, f_shift=0.0, scale=1.0, smooth=1):
        from shapely.geometry import Polygon
        d = json.load(open(path))
        self.d = d
        tr = lambda L: [((p[0] * scale) + f_shift, (p[1] * scale) - bore_u) for p in L]
        outer = tr(d['outer']); holes = [tr(h) for h in d['holes']]
        for _ in range(smooth):
            outer = chaikin(outer); holes = [chaikin(h) for h in holes]
        self.poly = Polygon(outer, holes).buffer(0)
        self.len = d['len_mm'] * scale

    def clip(self, region, minus=(), plus=(), buf=0.0, open_r=1.0, min_area=25.0):
        """region: shapely geom or list of (f,u) points or (f0,u0,f1,u1) box. returns shapely geometry"""
        from shapely.geometry import Polygon, box
        def G(r):
            if hasattr(r, 'geom_type'): return r
            if len(r) == 4 and not isinstance(r[0], (tuple, list)): return box(*r)
            return Polygon(r)
        g = self.poly.intersection(G(region))
        for m in minus: g = g.difference(G(m))
        for p in plus: g = g.union(G(p))
        if buf: g = g.buffer(buf, join_style=2)
        if open_r > 0:
            g = g.buffer(-open_r, join_style=2).buffer(open_r, join_style=2)
        if g.geom_type == 'MultiPolygon':
            from shapely.geometry import MultiPolygon
            g = MultiPolygon([p for p in g.geoms if p.area >= min_area])
        elif g.geom_type == 'GeometryCollection':
            from shapely.geometry import MultiPolygon
            g = MultiPolygon([p for p in g.geoms if p.geom_type == 'Polygon' and p.area >= min_area])
        return g


def chaikin(pts, keep_sharp_deg=55.0):
    """one Chaikin pass on a closed polyline, keeping corners sharper than keep_sharp_deg"""
    n = len(pts); out = []
    for i in range(n):
        p0 = Vector(pts[i - 1]); p1 = Vector(pts[i]); p2 = Vector(pts[(i + 1) % n])
        a = (p0 - p1); b = (p2 - p1)
        if a.length < 1e-9 or b.length < 1e-9:
            continue
        ang = math.degrees(a.angle(b))
        if ang < 180 - keep_sharp_deg:
            out.append(tuple(p1)); continue
        out.append(tuple(p1 + (p0 - p1) * 0.25)); out.append(tuple(p1 + (p2 - p1) * 0.25))
    return out


def geom_loops(geom, min_area=4.0, tol=0.35):
    """shapely (Multi)Polygon -> list of [outer_loop, *hole_loops] (each a list of (x,y))"""
    res = []
    if geom.is_empty: return res
    polys = [geom] if geom.geom_type == 'Polygon' else [g for g in getattr(geom, 'geoms', []) if g.geom_type == 'Polygon']
    for p in polys:
        if p.area < min_area: continue
        p = p.simplify(tol, preserve_topology=True)
        ext = list(p.exterior.coords)[:-1]
        if p.exterior.is_ccw is False: ext = ext[::-1]
        loops = [ext]
        for h in p.interiors:
            hl = list(h.coords)[:-1]
            if len(hl) >= 3: loops.append(hl)
        res.append(loops)
    return res


def _side_loops(self, name, geom, width, kind, group='body', s=0.0, bevel=None, bres=2, taper=None, M=None, min_area=4.0):
    """extrude shapely geometry (side profile) -> one object per polygon"""
    obs = []
    for i, loops in enumerate(geom_loops(geom, min_area)):
        b = bevel if bevel is not None else min(width * 0.18, 1.6)
        me = _curve_mesh(loops, width / 2.0, b, bres)
        Mx = T(0, 0, s)
        if M is not None: Mx = M @ Mx
        obs.append(self._add(f'{name}{i}', me, Mx, kind, group, taper=taper, s_c=s))
    return obs


Gun.side_geom = _side_loops
