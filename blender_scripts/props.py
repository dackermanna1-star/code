"""Modeling + material helpers used by the set builders."""
import bpy, bmesh, math, os
from mathutils import Vector, Matrix, Euler

TEX = '/opt/assets/ph/tex'
MODELS = '/opt/assets/ph/models'
FONTS = '/opt/assets/fonts'
R = math.radians

_font_cache = {}
def font(name):
    if name not in _font_cache:
        _font_cache[name] = bpy.data.fonts.load(os.path.join(FONTS, name))
    return _font_cache[name]

def coll(name, parent=None):
    c = bpy.data.collections.get(name)
    if c is None:
        c = bpy.data.collections.new(name)
        (parent or bpy.context.scene.collection).children.link(c)
    return c

def link(obj, c):
    for uc in list(obj.users_collection): uc.objects.unlink(obj)
    c.objects.link(obj)
    return obj

# ------------------------------------------------------------ materials
def mat_color(name, color, rough=0.5, metal=0.0, emit=None, emit_strength=1.0, spec=0.5, alpha=1.0, coat=0.0):
    m = bpy.data.materials.get(name)
    if m: return m
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color[:3], 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    b.inputs['Specular IOR Level'].default_value = spec
    if coat: b.inputs['Coat Weight'].default_value = coat
    if emit is not None:
        b.inputs['Emission Color'].default_value = (*emit[:3], 1)
        b.inputs['Emission Strength'].default_value = emit_strength
    if alpha < 1.0:
        b.inputs['Alpha'].default_value = alpha
        m.surface_render_method = 'BLENDED' if hasattr(m, 'surface_render_method') else None
    return m

def mat_emit(name, color, strength=5.0):
    m = bpy.data.materials.get(name)
    if m: return m
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    o = nt.nodes.new('ShaderNodeOutputMaterial'); e = nt.nodes.new('ShaderNodeEmission')
    e.inputs['Color'].default_value = (*color[:3], 1); e.inputs['Strength'].default_value = strength
    nt.links.new(e.outputs[0], o.inputs[0])
    return m

def mat_tex(name, tex, scale=1.0, tint=None, rough_mul=1.0, rough_add=0.0, nor=1.0, box=False, rot=0.0, spec=0.5, sat=1.0, val=1.0):
    """Poly Haven PBR texture material using object/UV coords scaled in world units (meters)."""
    m = bpy.data.materials.get(name)
    if m: return m
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; b = nt.nodes['Principled BSDF']
    b.inputs['Specular IOR Level'].default_value = spec
    tc = nt.nodes.new('ShaderNodeTexCoord'); mp = nt.nodes.new('ShaderNodeMapping')
    mp.inputs['Scale'].default_value = (scale, scale, scale)
    mp.inputs['Rotation'].default_value = (0, 0, rot)
    nt.links.new(tc.outputs['Object' if box else 'UV'], mp.inputs['Vector'])
    d = os.path.join(TEX, tex)
    def img(kind, non_color=False):
        p = os.path.join(d, '%s_%s.jpg' % (tex, kind))
        if not os.path.exists(p): return None
        n = nt.nodes.new('ShaderNodeTexImage'); n.image = bpy.data.images.load(p, check_existing=True)
        if non_color: n.image.colorspace_settings.name = 'Non-Color'
        if box: n.projection = 'BOX'; n.projection_blend = 0.2
        nt.links.new(mp.outputs[0], n.inputs['Vector'])
        return n
    dif = img('diff')
    if dif:
        out = dif.outputs['Color']
        if sat != 1.0 or val != 1.0:
            hsv = nt.nodes.new('ShaderNodeHueSaturation'); hsv.inputs['Saturation'].default_value = sat; hsv.inputs['Value'].default_value = val
            nt.links.new(out, hsv.inputs['Color']); out = hsv.outputs['Color']
        if tint:
            mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.blend_type = 'MULTIPLY'
            mx.inputs['Factor'].default_value = 1.0; mx.inputs['B'].default_value = (*tint[:3], 1)
            nt.links.new(out, mx.inputs['A']); out = mx.outputs['Result']
        nt.links.new(out, b.inputs['Base Color'])
    rg = img('rough', True)
    if rg:
        mth = nt.nodes.new('ShaderNodeMapRange')
        mth.inputs['To Min'].default_value = rough_add; mth.inputs['To Max'].default_value = rough_add + rough_mul
        nt.links.new(rg.outputs['Color'], mth.inputs['Value']); nt.links.new(mth.outputs[0], b.inputs['Roughness'])
    nr = img('nor', True)
    if nr and nor > 0:
        nm = nt.nodes.new('ShaderNodeNormalMap'); nm.inputs['Strength'].default_value = nor
        nt.links.new(nr.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs[0], b.inputs['Normal'])
    return m

# ------------------------------------------------------------ primitives
def _obj_from_bm(name, bm, mat=None, c=None):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me)
    (c or bpy.context.scene.collection).objects.link(o)
    if mat: me.materials.append(mat)
    return o

def box(name, size, loc=(0, 0, 0), mat=None, c=None, bevel=0.0, rot=(0, 0, 0), seg=2, uv_world=True):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    o = _obj_from_bm(name, bm, mat, c)
    o.location = loc; o.rotation_euler = rot
    if uv_world: world_uv(o)
    if bevel > 0:
        m = o.modifiers.new('bev', 'BEVEL'); m.width = bevel; m.segments = seg; m.limit_method = 'ANGLE'
        m.harden_normals = False
        o.data.shade_smooth() if hasattr(o.data, 'shade_smooth') else None
        add_smooth_by_angle(o)
    return o

def add_smooth_by_angle(o, ang=35):
    """Smooth shading with sharp edges above `ang` degrees (baked into mesh, no modifier)."""
    me = o.data
    bm = bmesh.new(); bm.from_mesh(me)
    for f in bm.faces: f.smooth = True
    for e in bm.edges:
        if len(e.link_faces) == 2:
            e.smooth = e.calc_face_angle(0.0) < R(ang)
        else:
            e.smooth = False
    bm.to_mesh(me); bm.free()

def cyl(name, r, h, loc=(0, 0, 0), mat=None, c=None, verts=24, rot=(0, 0, 0), smooth=True, r2=None):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=verts, radius1=r, radius2=r if r2 is None else r2, depth=h)
    o = _obj_from_bm(name, bm, mat, c)
    o.location = loc; o.rotation_euler = rot
    if smooth: add_smooth_by_angle(o, 50)
    world_uv(o)
    return o

def sphere(name, r, loc=(0, 0, 0), mat=None, c=None, scale=(1, 1, 1), seg=24, rings=12):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=r)
    o = _obj_from_bm(name, bm, mat, c)
    o.location = loc; o.scale = scale
    for p in o.data.polygons: p.use_smooth = True
    return o

def plane(name, w, h, loc=(0, 0, 0), rot=(0, 0, 0), mat=None, c=None):
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=0.5)
    bmesh.ops.scale(bm, vec=Vector((w, h, 1)), verts=bm.verts)
    o = _obj_from_bm(name, bm, mat, c)
    o.location = loc; o.rotation_euler = rot
    uv = o.data.uv_layers.new()
    for li, l in enumerate(o.data.loops):
        v = o.data.vertices[l.vertex_index].co
        uv.data[li].uv = (v.x / w + 0.5, v.y / h + 0.5)
    return o

def world_uv(o, scale=1.0):
    """Cube-ish projection UVs in meters (so textures keep real-world size)."""
    me = o.data
    if not me.uv_layers: me.uv_layers.new()
    uv = me.uv_layers.active
    for p in me.polygons:
        n = p.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for li in p.loop_indices:
            v = me.vertices[me.loops[li].vertex_index].co * Vector(o.scale)
            if ax == 0: u, w = v.y, v.z
            elif ax == 1: u, w = v.x, v.z
            else: u, w = v.x, v.y
            uv.data[li].uv = (u * scale, w * scale)

def text(name, body, size=0.3, loc=(0, 0, 0), rot=(R(90), 0, 0), mat=None, c=None, fnt='Oswald.ttf',
         align='CENTER', valign='CENTER', extrude=0.0, spacing=1.0, bold=False):
    cu = bpy.data.curves.new(name, 'FONT'); cu.body = body; cu.size = size
    cu.font = font(fnt); cu.align_x = align; cu.align_y = valign; cu.extrude = extrude
    cu.space_character = spacing; cu.resolution_u = 3
    o = bpy.data.objects.new(name, cu); (c or bpy.context.scene.collection).objects.link(o)
    o.location = loc; o.rotation_euler = rot
    if mat: cu.materials.append(mat)
    return o

def import_gltf(name, c=None, loc=(0, 0, 0), rot=(0, 0, 0), scale=1.0):
    d = os.path.join(MODELS, name)
    f = [x for x in os.listdir(d) if x.endswith('.gltf')][0]
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(d, f))
    new = [o for o in bpy.data.objects if o not in before]
    root = bpy.data.objects.new(name, None)
    (c or bpy.context.scene.collection).objects.link(root)
    for o in new:
        if o.parent is None: o.parent = root
        link(o, c or bpy.context.scene.collection)
    root.location = loc; root.rotation_euler = rot; root.scale = (scale,) * 3
    return root

def instance(src_root, name, loc, rot=(0, 0, 0), scale=1.0, c=None):
    """Lightweight duplicate of an imported hierarchy via collection instance."""
    cn = 'SRC_' + src_root.name
    sc = bpy.data.collections.get(cn)
    if sc is None:
        sc = bpy.data.collections.new(cn)
        objs = [src_root] + list(src_root.children_recursive)
        for o in objs: link(o, sc)
        src_root.location = (0, 0, 0); src_root.rotation_euler = (0, 0, 0)
        # keep it out of the view layer
        lib = coll('LIBRARY')
        lib.children.link(sc)
    e = bpy.data.objects.new(name, None); e.instance_type = 'COLLECTION'; e.instance_collection = sc
    (c or bpy.context.scene.collection).objects.link(e)
    e.location = loc; e.rotation_euler = rot; e.scale = (scale,) * 3 if not isinstance(scale, tuple) else scale
    return e

def parent_keep(child, parent):
    mw = child.matrix_world.copy(); child.parent = parent; child.matrix_world = mw

def decimate_to(o, target_tris):
    import bpy as _b
    if o.type != 'MESH' or o.data.shape_keys: return
    n = sum(len(p.vertices) - 2 for p in o.data.polygons)
    if n <= target_tris: return
    m = o.modifiers.new('dec', 'DECIMATE'); m.ratio = max(0.02, target_tris / n)
    # move to top and apply
    while o.modifiers.find('dec') > 0:
        with _b.context.temp_override(object=o, active_object=o):
            _b.ops.object.modifier_move_up(modifier='dec')
    with _b.context.temp_override(object=o, active_object=o, selected_objects=[o]):
        _b.ops.object.modifier_apply(modifier='dec')
