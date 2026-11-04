"""Wildlife & small props modelled for the film: blue morpho, mosquitoes, fireflies, lancehead snake,
microbes, berries, phone, dugout boat. All built procedurally from reference proportions."""
import bpy, bmesh, math, random
from mathutils import Vector, Matrix, Euler, noise
from lib import *


def S(coll, name, typ='RGBA'):
    for x in coll:
        if x.name == name and x.type == typ: return x


def _mat(name, col, rough=0.5, metal=0.0, emit=None, emit_s=0.0, sss=0.0):
    m = bpy.data.materials.get(name)
    if m: return m
    m = bpy.data.materials.new(name); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = col; b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    if emit: b.inputs['Emission Color'].default_value = emit; b.inputs['Emission Strength'].default_value = emit_s
    if sss: b.inputs['Subsurface Weight'].default_value = sss
    return m


def _link(o, col=None):
    (col or bpy.context.scene.collection).objects.link(o); return o


# ------------------------------------------------------------------ blue morpho
def morpho_material():
    m = bpy.data.materials.get('MAT_Morpho')
    if m: return m
    m = bpy.data.materials.new('MAT_Morpho'); m.use_nodes = True; nt = m.node_tree; L = nt.links.new
    b = nt.nodes['Principled BSDF']
    tc = nt.nodes.new('ShaderNodeTexCoord')
    # radial distance from wing root in UV space (root at 0,0)
    vl = nt.nodes.new('ShaderNodeVectorMath'); vl.operation = 'LENGTH'; L(tc.outputs['UV'], vl.inputs[0])
    cr = nt.nodes.new('ShaderNodeValToRGB'); L(vl.outputs['Value'], cr.inputs[0])
    e = cr.color_ramp.elements
    e[0].position = 0.0; e[0].color = (0.01, 0.06, 0.45, 1)
    e[1].position = 0.62; e[1].color = (0.02, 0.35, 1.0, 1)
    n = e.new(0.72); n.color = (0.005, 0.005, 0.01, 1)
    n2 = e.new(1.0); n2.color = (0.005, 0.005, 0.01, 1)
    L(cr.outputs[0], b.inputs['Base Color'])
    b.inputs['Metallic'].default_value = 0.35; b.inputs['Roughness'].default_value = 0.25
    b.inputs['Coat Weight'].default_value = 0.6; b.inputs['Thin Film Thickness'].default_value = 350 if 'Thin Film Thickness' in b.inputs else 0
    return m


def wing_mesh(name, outline, mat):
    me = bpy.data.meshes.new(name); bm = bmesh.new(); uvl = bm.loops.layers.uv.new('UVMap')
    c = bm.verts.new((0, 0, 0)); vs = [bm.verts.new((x, y, 0)) for x, y in outline]
    mx = max(math.hypot(x, y) for x, y in outline)
    for i in range(len(vs) - 1):
        f = bm.faces.new((c, vs[i], vs[i + 1]))
        for l in f.loops: l[uvl].uv = (l.vert.co.x / mx, l.vert.co.y / mx)
    bm.to_mesh(me); bm.free(); me.materials.append(mat)
    return me


def morpho(name='CR_Morpho', size=0.07, col=None):
    """Blue morpho (wingspan ~14 cm). Returns root empty; wings flap via keyed rotation with cycles."""
    mat = morpho_material(); body_m = _mat('MAT_InsectBody', (0.03, 0.025, 0.02, 1), 0.5)
    root = bpy.data.objects.new(name, None); _link(root, col); root.empty_display_size = 0.05
    fw = [(0.0, 0.0), (0.25, 0.85), (0.55, 1.0), (0.9, 0.85), (1.0, 0.55), (0.75, 0.25), (0.45, 0.05)]
    hw = [(0.0, 0.0), (0.55, -0.05), (0.85, -0.35), (0.8, -0.7), (0.5, -0.85), (0.2, -0.6), (0.05, -0.2)]
    wings = []
    for side in (1, -1):
        piv = bpy.data.objects.new(f'{name}_wingpiv_{side}', None); _link(piv, col); piv.parent = root
        for k, ol in enumerate((fw, hw)):
            pts = [(side * x * size, y * size) for x, y in ol]
            if side < 0: pts = pts[::-1]
            w = bpy.data.objects.new(f'{name}_w{side}{k}', wing_mesh(f'{name}_w{side}{k}', pts, mat)); _link(w, col); w.parent = piv
        wings.append((piv, side))
    bpy.ops.mesh.primitive_uv_sphere_add(radius=1, segments=8, ring_count=6)
    b = bpy.context.active_object; b.name = name + '_body'; b.scale = (size * 0.07, size * 0.6, size * 0.08)
    b.location = (0, -size * 0.15, 0); b.data.materials.append(body_m)
    for c in b.users_collection: c.objects.unlink(b)
    _link(b, col); b.parent = root
    return root, wings


def flap(wings, f0, f1, period=7, amp=70):
    for piv, side in wings:
        f = f0; up = True
        while f <= f1:
            piv.rotation_euler = (0, math.radians(side * (amp if up else -15)), 0)
            piv.keyframe_insert('rotation_euler', index=1, frame=f)
            f += period / 2; up = not up


def fly_path(obj, f0, f1, pts, wobble=0.08, seed=0):
    """Butterfly-like erratic flight through control points."""
    rnd = random.Random(seed); n = len(pts) - 1
    for f in range(f0, f1 + 1, 2):
        t = (f - f0) / (f1 - f0) * n; i = min(int(t), n - 1); u = t - i
        p = Vector(pts[i]).lerp(Vector(pts[i + 1]), u * u * (3 - 2 * u))
        p += Vector((noise.noise(Vector((f * 0.11, seed, 0))), noise.noise(Vector((f * 0.13, seed, 5))), noise.noise(Vector((f * 0.17, seed, 9))) * 1.5)) * wobble
        obj.location = p; obj.keyframe_insert('location', frame=f)
        d = Vector(pts[i + 1]) - Vector(pts[i])
        obj.rotation_euler = (0, 0, math.atan2(d.y, d.x) - math.pi / 2); obj.keyframe_insert('rotation_euler', frame=f)


# ------------------------------------------------------------------ mosquito
def mosquito(name='CR_Mosquito', s=0.006, col=None):
    body_m = _mat('MAT_MosqBody', (0.04, 0.035, 0.03, 1), 0.4)
    wing_m = bpy.data.materials.get('MAT_MosqWing')
    if not wing_m:
        wing_m = bpy.data.materials.new('MAT_MosqWing'); wing_m.use_nodes = True; bb = wing_m.node_tree.nodes['Principled BSDF']
        bb.inputs['Base Color'].default_value = (0.8, 0.8, 0.85, 1); bb.inputs['Alpha'].default_value = 0.25; bb.inputs['Roughness'].default_value = 0.1
    root = bpy.data.objects.new(name, None); _link(root, col)
    parts = []
    def ell(nm, sc, loc, rot=(0, 0, 0)):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=1, segments=10, ring_count=8); o = bpy.context.active_object; o.name = nm
        o.scale = sc; o.location = loc; o.rotation_euler = rot; o.data.materials.append(body_m)
        for c in o.users_collection: c.objects.unlink(o)
        _link(o, col); o.parent = root; parts.append(o); return o
    ell(name + '_thorax', (s * 0.25, s * 0.3, s * 0.25), (0, 0, 0))
    ell(name + '_abdomen', (s * 0.15, s * 0.75, s * 0.14), (0, -s * 0.95, -s * 0.15), (math.radians(-12), 0, 0))
    ell(name + '_head', (s * 0.14, s * 0.14, s * 0.14), (0, s * 0.38, s * 0.02))
    # proboscis + legs as thin curves
    def line(nm, pts, r):
        cu = bpy.data.curves.new(nm, 'CURVE'); cu.dimensions = '3D'; sp = cu.splines.new('POLY'); sp.points.add(len(pts) - 1)
        for i, p in enumerate(pts): sp.points[i].co = (*p, 1)
        cu.bevel_depth = r; cu.materials.append(body_m); o = bpy.data.objects.new(nm, cu); _link(o, col); o.parent = root; return o
    line(name + '_prob', [(0, s * 0.45, 0), (0, s * 1.1, -s * 0.35)], s * 0.025)
    for i, (dx, dy) in enumerate([(-1, 0.4), (1, 0.4), (-1, 0), (1, 0), (-1, -0.4), (1, -0.4)]):
        line(f'{name}_leg{i}', [(0, dy * s * 0.3, -s * 0.1), (dx * s * 0.9, dy * s * 1.1, s * 0.15), (dx * s * 1.6, dy * s * 1.8, -s * 0.9)], s * 0.018)
    wings = []
    for side in (1, -1):
        piv = bpy.data.objects.new(f'{name}_wp{side}', None); _link(piv, col); piv.parent = root; piv.location = (0, 0, s * 0.2)
        me = wing_mesh(f'{name}_wing{side}', [(side * x * s, y * s) for x, y in [(0, 0.1), (0.4, 0.05), (1.4, -0.5), (1.5, -0.75), (0.9, -0.6), (0.1, -0.1)]][::(1 if side > 0 else -1)], wing_m)
        w = bpy.data.objects.new(f'{name}_wing{side}', me); _link(w, col); w.parent = piv
        wings.append((piv, side))
    return root, wings


# ------------------------------------------------------------------ fireflies
def fireflies(n, center, radius, f0, f1, seed=0, col=None, size=0.006, strength=60):
    rnd = random.Random(seed); m = _mat('MAT_Firefly', (0.6, 1.0, 0.2, 1), 0.5, emit=(0.65, 1.0, 0.15, 1), emit_s=strength)
    out = []
    for i in range(n):
        bpy.ops.mesh.primitive_ico_sphere_add(radius=size, subdivisions=1)
        o = bpy.context.active_object; o.name = f'CR_Firefly_{i}'
        for c in o.users_collection: c.objects.unlink(o)
        _link(o, col); o.data.materials.append(m)
        base = Vector(center) + Vector((rnd.uniform(-1, 1) * radius, rnd.uniform(-1, 1) * radius, rnd.uniform(0.2, 2.5)))
        ph = rnd.uniform(0, 100)
        for f in range(f0, f1 + 1, 3):
            o.location = base + Vector((noise.noise(Vector((f * 0.02, i, ph))), noise.noise(Vector((f * 0.02, i + 50, ph))), noise.noise(Vector((f * 0.02, i + 90, ph))) * 0.4)) * 0.8
            o.keyframe_insert('location', frame=f)
        # blink: scale pulses (emission visible only when large)
        f = f0 + rnd.randint(0, 40)
        o.scale = (0.01,) * 3; o.keyframe_insert('scale', frame=f0)
        while f < f1:
            for df, sc in ((0, 0.01), (4, 1.0), (10, 1.0), (16, 0.01)):
                o.scale = (sc,) * 3; o.keyframe_insert('scale', frame=f + df)
            f += rnd.randint(30, 70)
        out.append(o)
    return out


# ------------------------------------------------------------------ lancehead (fer-de-lance, Bothrops atrox)
def snake_material():
    m = bpy.data.materials.get('MAT_Lancehead')
    if m: return m
    m = bpy.data.materials.new('MAT_Lancehead'); m.use_nodes = True; nt = m.node_tree; L = nt.links.new
    b = nt.nodes['Principled BSDF']
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ'); L(tc.outputs['UV'], sep.inputs[0])
    # UV.x = along body (0..1 * length metres), UV.y = around body (0..1)
    # dorsal triangles: dark trapezoids whose apex points to spine; formed from |sin| along length vs. around-angle
    mul = nt.nodes.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'; mul.inputs[1].default_value = 9.0; L(sep.outputs['X'], mul.inputs[0])
    fr = nt.nodes.new('ShaderNodeMath'); fr.operation = 'FRACT'; L(mul.outputs[0], fr.inputs[0])
    tri = nt.nodes.new('ShaderNodeMath'); tri.operation = 'PINGPONG'; tri.inputs[1].default_value = 0.5; L(fr.outputs[0], tri.inputs[0])
    ar = nt.nodes.new('ShaderNodeMath'); ar.operation = 'PINGPONG'; ar.inputs[1].default_value = 0.5; L(sep.outputs['Y'], ar.inputs[0])
    # around: 0 at belly(0.0), 0.5 at spine
    cmp = nt.nodes.new('ShaderNodeMath'); cmp.operation = 'SUBTRACT'; L(ar.outputs[0], cmp.inputs[0]); L(tri.outputs[0], cmp.inputs[1])
    edge = nt.nodes.new('ShaderNodeMapRange'); L(cmp.outputs[0], edge.inputs[0]); edge.inputs[1].default_value = -0.05; edge.inputs[2].default_value = 0.02
    edge2 = nt.nodes.new('ShaderNodeMapRange'); L(cmp.outputs[0], edge2.inputs[0]); edge2.inputs[1].default_value = -0.12; edge2.inputs[2].default_value = -0.06
    nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 40; L(tc.outputs['UV'], nz.inputs[0])
    base = nt.nodes.new('ShaderNodeMix'); base.data_type = 'RGBA'
    L(nz.outputs['Fac'], base.inputs[0]); S(base.inputs, 'A').default_value = (0.11, 0.075, 0.03, 1); S(base.inputs, 'B').default_value = (0.19, 0.14, 0.06, 1)
    light = nt.nodes.new('ShaderNodeMix'); light.data_type = 'RGBA'
    L(edge2.outputs[0], light.inputs[0]); L(S(base.outputs, 'Result'), S(light.inputs, 'A')); S(light.inputs, 'B').default_value = (0.36, 0.30, 0.16, 1)
    dark = nt.nodes.new('ShaderNodeMix'); dark.data_type = 'RGBA'
    L(edge.outputs[0], dark.inputs[0]); L(S(light.outputs, 'Result'), S(dark.inputs, 'A')); S(dark.inputs, 'B').default_value = (0.05, 0.035, 0.02, 1)
    # belly pale
    bel = nt.nodes.new('ShaderNodeMapRange'); L(ar.outputs[0], bel.inputs[0]); bel.inputs[1].default_value = 0.08; bel.inputs[2].default_value = 0.14
    bel.inputs[3].default_value = 1; bel.inputs[4].default_value = 0
    bm_ = nt.nodes.new('ShaderNodeMix'); bm_.data_type = 'RGBA'
    L(bel.outputs[0], bm_.inputs[0]); L(S(dark.outputs, 'Result'), S(bm_.inputs, 'A')); S(bm_.inputs, 'B').default_value = (0.62, 0.55, 0.36, 1)
    L(S(bm_.outputs, 'Result'), b.inputs['Base Color'])
    # scales: voronoi bump
    vo = nt.nodes.new('ShaderNodeTexVoronoi'); vo.inputs['Scale'].default_value = 420; vo.feature = 'DISTANCE_TO_EDGE'
    mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (1, 0.25, 1); L(tc.outputs['UV'], mp.inputs[0]); L(mp.outputs[0], vo.inputs[0])
    bu = nt.nodes.new('ShaderNodeBump'); bu.inputs['Strength'].default_value = 0.35; L(vo.outputs['Distance'], bu.inputs['Height']); L(bu.outputs[0], b.inputs['Normal'])
    b.inputs['Roughness'].default_value = 0.55; b.inputs['Specular IOR Level'].default_value = 0.25
    return m


def snake(name='CR_Lancehead', length=1.6, radius=0.028, pts=None, col=None):
    """Body = bezier curve with tapered bevel; head = sculpted lance-shaped mesh parented to the curve end.
    Returns (body_obj, curve, head)."""
    mat = snake_material()
    pts = pts or [(0, 0, 0), (0.3, 0.2, 0), (0.1, 0.45, 0), (-0.25, 0.3, 0), (-0.2, 0.0, 0), (0.15, -0.1, 0)]
    cu = bpy.data.curves.new(name + '_curve', 'CURVE'); cu.dimensions = '3D'
    sp = cu.splines.new('BEZIER'); sp.bezier_points.add(len(pts) - 1)
    for i, p in enumerate(pts):
        bp = sp.bezier_points[i]; bp.co = p; bp.handle_left_type = bp.handle_right_type = 'AUTO'
    # taper: thin tail at index0 -> thick mid -> neck narrowing at head end
    tp = bpy.data.curves.new(name + '_taper', 'CURVE'); tp.dimensions = '2D'
    ts = tp.splines.new('BEZIER'); ts.bezier_points.add(4)
    for i, (x, y) in enumerate([(0, 0.05), (0.25, 0.7), (0.6, 1.0), (0.92, 0.8), (1.0, 0.55)]):
        b = ts.bezier_points[i]; b.co = (x, y, 0); b.handle_left_type = b.handle_right_type = 'AUTO'
    tpo = bpy.data.objects.new(name + '_taper', tp); _link(tpo, col); tpo.hide_render = True; tpo.hide_viewport = True
    cu.bevel_mode = 'ROUND'; cu.bevel_depth = radius; cu.bevel_resolution = 4; cu.resolution_u = 24
    cu.taper_object = tpo; cu.use_map_taper = True; cu.use_fill_caps = True
    cu.materials.append(mat)
    body = bpy.data.objects.new(name, cu); _link(body, col)
    # head: lance shape
    bpy.ops.mesh.primitive_uv_sphere_add(radius=1, segments=24, ring_count=12)
    h = bpy.context.active_object; h.name = name + '_head'
    for c in h.users_collection: c.objects.unlink(h)
    _link(h, col)
    for v in h.data.vertices:
        x, y, z = v.co
        # y forward: triangular from top view, flat
        w = 0.55 + 0.45 * (1 - (y + 1) / 2)  # wider at back
        v.co = Vector((x * w * radius * 1.4, (y + 1) * radius * 1.9, z * radius * 0.75 * (0.8 + 0.2 * (1 - (y + 1) / 2))))
    hm = bpy.data.materials.new('MAT_LanceheadHead'); hm.use_nodes = True; nt = hm.node_tree; L = nt.links.new; hb = nt.nodes['Principled BSDF']
    tc = nt.nodes.new('ShaderNodeTexCoord'); sep = nt.nodes.new('ShaderNodeSeparateXYZ'); L(tc.outputs['Generated'], sep.inputs[0])
    nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 12; L(tc.outputs['Generated'], nz.inputs[0])
    st = nt.nodes.new('ShaderNodeMapRange'); L(sep.outputs['Z'], st.inputs[0]); st.inputs[1].default_value = 0.52; st.inputs[2].default_value = 0.6
    st2 = nt.nodes.new('ShaderNodeMapRange'); L(sep.outputs['Z'], st2.inputs[0]); st2.inputs[1].default_value = 0.42; st2.inputs[2].default_value = 0.5
    band = nt.nodes.new('ShaderNodeMath'); band.operation = 'SUBTRACT'; L(st2.outputs[0], band.inputs[0]); L(st.outputs[0], band.inputs[1])
    c1 = nt.nodes.new('ShaderNodeMix'); c1.data_type = 'RGBA'; L(nz.outputs['Fac'], c1.inputs[0])
    S(c1.inputs, 'A').default_value = (0.10, 0.065, 0.025, 1); S(c1.inputs, 'B').default_value = (0.18, 0.12, 0.045, 1)
    lw = nt.nodes.new('ShaderNodeMix'); lw.data_type = 'RGBA'; L(st2.outputs[0], lw.inputs[0])
    S(lw.inputs, 'A').default_value = (0.14, 0.10, 0.04, 1); L(S(c1.outputs, 'Result'), S(lw.inputs, 'B'))
    c2 = nt.nodes.new('ShaderNodeMix'); c2.data_type = 'RGBA'; L(band.outputs[0], c2.inputs[0]); L(S(lw.outputs, 'Result'), S(c2.inputs, 'A'))
    S(c2.inputs, 'B').default_value = (0.05, 0.035, 0.02, 1)
    L(S(c2.outputs, 'Result'), hb.inputs['Base Color']); hb.inputs['Roughness'].default_value = 0.55; hb.inputs['Specular IOR Level'].default_value = 0.25
    vo = nt.nodes.new('ShaderNodeTexVoronoi'); vo.inputs['Scale'].default_value = 60; vo.feature = 'DISTANCE_TO_EDGE'; L(tc.outputs['Generated'], vo.inputs[0])
    bu = nt.nodes.new('ShaderNodeBump'); bu.inputs['Strength'].default_value = 0.3; L(vo.outputs['Distance'], bu.inputs['Height']); L(bu.outputs[0], hb.inputs['Normal'])
    h.data.materials.append(hm)
    eye_m = _mat('MAT_SnakeEye', (0.55, 0.42, 0.12, 1), 0.05)
    for sx in (-1, 1):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=radius * 0.22, segments=12, ring_count=8)
        e = bpy.context.active_object; e.name = f'{name}_eye{sx}'
        for c in e.users_collection: c.objects.unlink(e)
        _link(e, col); e.parent = h; e.location = (sx * radius * 0.78, radius * 2.2, radius * 0.32); e.data.materials.append(eye_m)
        bpy.ops.mesh.primitive_cylinder_add(radius=radius * 0.06, depth=radius * 0.1)
        pu = bpy.context.active_object; pu.name = f'{name}_pupil{sx}'; pu.scale = (0.4, 1, 1)
        for c in pu.users_collection: c.objects.unlink(pu)
        _link(pu, col); pu.parent = e; pu.location = (sx * radius * 0.2, 0, 0); pu.rotation_euler = (0, math.radians(90), 0)
        pu.data.materials.append(_mat('MAT_Black', (0.0, 0.0, 0.0, 1), 0.2))
    # forked tongue
    tm = _mat('MAT_Tongue', (0.08, 0.05, 0.08, 1), 0.3)
    tcu = bpy.data.curves.new(name + '_tongue', 'CURVE'); tcu.dimensions = '3D'
    for sx in (-1, 1):
        s2 = tcu.splines.new('POLY'); s2.points.add(2)
        for i, p in enumerate([(0, 0, 0), (0, radius * 1.4, 0), (sx * radius * 0.35, radius * 2.0, radius * 0.1)]): s2.points[i].co = (*p, 1)
    tcu.bevel_depth = radius * 0.04; tcu.materials.append(tm)
    tongue = bpy.data.objects.new(name + '_tongue', tcu); _link(tongue, col); tongue.parent = h; tongue.location = (0, radius * 3.6, -radius * 0.2)
    tongue.scale = (1, 0.01, 1)
    return body, cu, h, tongue


def tongue_flicks(tongue, frames):
    for f in frames:
        for df, sy in ((0, 0.01), (3, 1.0), (5, 0.8), (7, 1.0), (10, 0.01)):
            tongue.scale = (1, sy, 1); tongue.keyframe_insert('scale', index=1, frame=f + df)


# ------------------------------------------------------------------ microbes (stylised Giardia / bacteria for the macro insert)
def giardia(name, scale=1.0, col=None, color=(0.55, 0.85, 0.6, 1)):
    m = _mat('MAT_Giardia', color, 0.3, sss=0.6)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=1, segments=32, ring_count=16)
    o = bpy.context.active_object; o.name = name
    for c in o.users_collection: c.objects.unlink(o)
    _link(o, col)
    for v in o.data.vertices:  # pear/teardrop body, flattened
        x, y, z = v.co
        k = 1.0 - 0.45 * (y + 1) / 2
        v.co = Vector((x * k, y * 1.5, z * 0.45 * k))
    o.scale = (scale,) * 3; o.data.materials.append(m)
    nuc = _mat('MAT_GiardiaNuc', (0.25, 0.45, 0.35, 1), 0.3)
    for sx in (-1, 1):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.22, segments=16, ring_count=8)
        e = bpy.context.active_object; e.name = f'{name}_nuc{sx}'
        for c in e.users_collection: c.objects.unlink(e)
        _link(e, col); e.parent = o; e.location = (sx * 0.3, 0.55, 0.18); e.data.materials.append(nuc)
    # flagella
    fl = []
    for i, (sx, y0) in enumerate([(-1, -1.3), (1, -1.3), (-1, -0.3), (1, -0.3)]):
        cu = bpy.data.curves.new(f'{name}_fl{i}', 'CURVE'); cu.dimensions = '3D'; sp = cu.splines.new('BEZIER'); sp.bezier_points.add(3)
        for k in range(4):
            b = sp.bezier_points[k]; b.co = (sx * (0.3 + k * 0.5), y0 - k * 0.6, 0.1 * math.sin(k)); b.handle_left_type = b.handle_right_type = 'AUTO'
        cu.bevel_depth = 0.03; cu.materials.append(m)
        fo = bpy.data.objects.new(f'{name}_fl{i}', cu); _link(fo, col); fo.parent = o; fl.append(fo)
    return o, fl


def bacterium(name, col=None, color=(0.9, 0.55, 0.4, 1)):
    m = _mat('MAT_Bact_' + name[-1], color, 0.35, sss=0.5)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=1, segments=16, ring_count=10)
    o = bpy.context.active_object; o.name = name
    for c in o.users_collection: c.objects.unlink(o)
    _link(o, col)
    for v in o.data.vertices:
        x, y, z = v.co; v.co = Vector((x * 0.35, y * (1.0 + 0.0) + (0.6 if y > 0 else -0.6) * (1 if abs(y) > 0.01 else 0) * 0.5, z * 0.35))
    o.data.materials.append(m); return o


# ------------------------------------------------------------------ props
def phone(name='PR_Phone', col=None, screen_img=None):
    body = _mat('MAT_PhoneBody', (0.02, 0.02, 0.025, 1), 0.25, metal=0.6)
    bpy.ops.mesh.primitive_cube_add(size=1); o = bpy.context.active_object; o.name = name
    o.scale = (0.072, 0.152, 0.008); bpy.ops.object.transform_apply(scale=True)
    bv = o.modifiers.new('bv', 'BEVEL'); bv.width = 0.006; bv.segments = 5
    o.data.materials.append(body)
    for c in o.users_collection: c.objects.unlink(o)
    _link(o, col)
    bpy.ops.mesh.primitive_plane_add(size=1); sc = bpy.context.active_object; sc.name = name + '_screen'
    sc.scale = (0.066, 0.144, 1); bpy.ops.object.transform_apply(scale=True); sc.location = (0, 0, 0.0042)
    for c in sc.users_collection: c.objects.unlink(sc)
    _link(sc, col); sc.parent = o
    m = bpy.data.materials.new('MAT_PhoneScreen'); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    em = nt.nodes.new('ShaderNodeEmission'); out = nt.nodes.new('ShaderNodeOutputMaterial'); em.inputs[1].default_value = 2.0
    if screen_img:
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(screen_img); nt.links.new(t.outputs[0], em.inputs[0])
    gl = nt.nodes.new('ShaderNodeBsdfGlossy'); gl.inputs['Roughness'].default_value = 0.05
    mx = nt.nodes.new('ShaderNodeAddShader'); nt.links.new(em.outputs[0], mx.inputs[0]); nt.links.new(gl.outputs[0], mx.inputs[1])
    nt.links.new(mx.outputs[0], out.inputs[0])
    sc.data.materials.append(m)
    return o, sc, em


def berries(name, loc, col=None, n=14, seed=0):
    rnd = random.Random(seed); m = _mat('MAT_Berry', (0.55, 0.02, 0.03, 1), 0.15, sss=0.3)
    out = []
    for i in range(n):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=rnd.uniform(0.007, 0.011), segments=12, ring_count=8)
        o = bpy.context.active_object; o.name = f'{name}_{i}'
        for c in o.users_collection: c.objects.unlink(o)
        _link(o, col); o.location = Vector(loc) + Vector((rnd.gauss(0, 0.03), rnd.gauss(0, 0.03), rnd.gauss(0, 0.025)))
        o.data.materials.append(m); out.append(o)
    return out


def dugout_boat(name='PR_Boat', col=None, length=6.5):
    """Amazon 'peque-peque' style dugout/plank canoe with a long-tail outboard."""
    wood = bpy.data.materials.get('MAT_BoatWood')
    if not wood:
        wood = bpy.data.materials.new('MAT_BoatWood'); wood.use_nodes = True; nt = wood.node_tree; bb = nt.nodes['Principled BSDF']
        tc = nt.nodes.new('ShaderNodeTexCoord'); wv = nt.nodes.new('ShaderNodeTexWave'); wv.inputs['Scale'].default_value = 3.0; wv.inputs['Distortion'].default_value = 6
        nt.links.new(tc.outputs['Object'], wv.inputs[0])
        cr = nt.nodes.new('ShaderNodeValToRGB'); cr.color_ramp.elements[0].color = (0.13, 0.07, 0.035, 1); cr.color_ramp.elements[1].color = (0.32, 0.19, 0.09, 1)
        nt.links.new(wv.outputs['Fac'], cr.inputs[0]); nt.links.new(cr.outputs[0], bb.inputs['Base Color']); bb.inputs['Roughness'].default_value = 0.7
    paint = _mat('MAT_BoatPaint', (0.05, 0.25, 0.32, 1), 0.6)
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    nx, nu = 24, 10; L = length; rows = []
    for i in range(nx + 1):
        t = i / nx; x = (t - 0.5) * L
        w = 0.55 * max(0.04, math.sin(math.pi * max(t, 0.2))) ** 0.55
        sheer = 0.38 + 0.25 * (abs(t - 0.45) * 2) ** 3
        row = []
        for j in range(nu + 1):
            a = math.pi * j / nu
            row.append(bm.verts.new((x, -math.cos(a) * w, -math.sin(a) * 0.32 + sheer - 0.38)))
        rows.append(row)
    for i in range(nx):
        for j in range(nu): bm.faces.new((rows[i][j], rows[i + 1][j], rows[i + 1][j + 1], rows[i][j + 1]))
    bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); _link(o, col)
    so = o.modifiers.new('sol', 'SOLIDIFY'); so.thickness = 0.04
    o.modifiers.new('sub', 'SUBSURF').levels = 1
    me.materials.append(wood)
    for p in me.polygons: p.use_smooth = True
    # stripe
    bpy.ops.mesh.primitive_cube_add(size=1); st = bpy.context.active_object; st.name = name + '_seat'
    st.scale = (0.25, 1.0, 0.04); st.location = (-0.8, 0, 0.0); st.data.materials.append(wood)
    for c in st.users_collection: c.objects.unlink(st)
    _link(st, col); st.parent = o
    # outboard long-tail
    bpy.ops.mesh.primitive_cube_add(size=1); mo = bpy.context.active_object; mo.name = name + '_motor'
    mo.scale = (0.35, 0.28, 0.3); mo.location = (-L / 2 + 0.3, 0, 0.25); mo.data.materials.append(paint)
    for c in mo.users_collection: c.objects.unlink(mo)
    _link(mo, col); mo.parent = o
    bpy.ops.mesh.primitive_cylinder_add(radius=0.03, depth=2.0); sh = bpy.context.active_object; sh.name = name + '_shaft'
    sh.location = (-L / 2 - 0.7, 0, -0.05); sh.rotation_euler = (0, math.radians(75), 0); sh.data.materials.append(_mat('MAT_Steel', (0.4, 0.4, 0.4, 1), 0.4, 1.0))
    for c in sh.users_collection: c.objects.unlink(sh)
    _link(sh, col); sh.parent = o
    return o
