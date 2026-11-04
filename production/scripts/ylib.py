"""Shared helpers for the Tsutomu Yamaguchi short (Blender 4.5).

Materials, asset import, worlds, render settings. Imported by every build script.
"""
import bpy, bmesh, math, os, random
from mathutils import Vector, Euler, Matrix

ASSETS = "/opt/assets"
PH = f"{ASSETS}/polyhaven"
PROD = "/home/user/code/production"


# ---------------------------------------------------------------- collections
def coll(name, parent=None):
    c = bpy.data.collections.get(name)
    if c is None:
        c = bpy.data.collections.new(name)
        (parent or bpy.context.scene.collection).children.link(c)
    elif parent is not None and c.name not in parent.children:
        parent.children.link(c)
    return c


def link_to(obj, c):
    for uc in list(obj.users_collection):
        uc.objects.unlink(obj)
    c.objects.link(obj)
    return obj


# ---------------------------------------------------------------- materials
def _node(nt, typ, loc=(0, 0), **kw):
    n = nt.nodes.new(typ)
    n.location = loc
    for k, v in kw.items():
        setattr(n, k, v)
    return n


def mat_basic(name, color=(0.8, 0.8, 0.8, 1), rough=0.6, metal=0.0, sss=0.0, emission=None, estr=0.0, alpha=1.0):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = color
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if sss:
        b.inputs["Subsurface Weight"].default_value = sss
    if emission:
        b.inputs["Emission Color"].default_value = emission
        b.inputs["Emission Strength"].default_value = estr
    if alpha < 1:
        b.inputs["Alpha"].default_value = alpha
        m.surface_render_method = 'BLENDED'
    return m


def mat_pbr(name, tex, scale=1.0, tint=None, rough_mul=1.0, bump=0.6, box=True, dirt=0.0, hue_var=0.0):
    """Poly Haven PBR material. box=True uses object-space box projection (no UVs needed)."""
    m = bpy.data.materials.get(name)
    if m:
        return m
    d = f"{PH}/tex/{tex}"
    def f(kind):
        for ext in ("jpg", "png"):
            p = f"{d}/{tex}_{kind}_1k.{ext}"
            if os.path.exists(p):
                return p
        return None
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    tc = _node(nt, "ShaderNodeTexCoord", (-1200, 0))
    mp = _node(nt, "ShaderNodeMapping", (-1000, 0))
    mp.inputs["Scale"].default_value = (scale, scale, scale)
    nt.links.new(tc.outputs["Object" if box else "UV"], mp.inputs["Vector"])
    def img(path, loc, non_color=False):
        t = _node(nt, "ShaderNodeTexImage", loc)
        t.image = bpy.data.images.load(path, check_existing=True)
        if non_color:
            t.image.colorspace_settings.name = "Non-Color"
        if box:
            t.projection = 'BOX'
            t.projection_blend = 0.25
        nt.links.new(mp.outputs["Vector"], t.inputs["Vector"])
        return t
    col = f("Diffuse")
    if col:
        t = img(col, (-700, 300))
        out = t.outputs["Color"]
        if hue_var:
            # per-object colour variation so repeated buildings don't look cloned
            oi = _node(nt, "ShaderNodeObjectInfo", (-700, 520))
            hsv = _node(nt, "ShaderNodeHueSaturation", (-300, 380))
            mr = _node(nt, "ShaderNodeMapRange", (-500, 560))
            mr.inputs["To Min"].default_value = 1 - hue_var
            mr.inputs["To Max"].default_value = 1 + hue_var
            nt.links.new(oi.outputs["Random"], mr.inputs["Value"])
            nt.links.new(out, hsv.inputs["Color"])
            nt.links.new(mr.outputs["Result"], hsv.inputs["Value"])
            out = hsv.outputs["Color"]
        if tint:
            mix = _node(nt, "ShaderNodeMix", (-150, 300), data_type='RGBA', blend_type='MULTIPLY')
            mix.inputs["Factor"].default_value = 1.0
            mix.inputs[7].default_value = tint
            nt.links.new(out, mix.inputs[6])
            out = mix.outputs[2]
        if dirt:
            # soot / grime overlay driven by noise
            nz = _node(nt, "ShaderNodeTexNoise", (-700, 700))
            nz.inputs["Scale"].default_value = 3.0
            nt.links.new(tc.outputs["Object"], nz.inputs["Vector"])
            cr = _node(nt, "ShaderNodeValToRGB", (-450, 700))
            cr.color_ramp.elements[0].position = 0.45
            cr.color_ramp.elements[1].position = 0.75
            nt.links.new(nz.outputs["Fac"], cr.inputs["Fac"])
            mix2 = _node(nt, "ShaderNodeMix", (0, 450), data_type='RGBA', blend_type='MULTIPLY')
            mm = _node(nt, "ShaderNodeMath", (-200, 650), operation='MULTIPLY')
            mm.inputs[1].default_value = dirt
            nt.links.new(cr.outputs["Color"], mm.inputs[0])
            nt.links.new(mm.outputs[0], mix2.inputs["Factor"])
            nt.links.new(out, mix2.inputs[6])
            mix2.inputs[7].default_value = (0.08, 0.07, 0.06, 1)
            out = mix2.outputs[2]
        nt.links.new(out, b.inputs["Base Color"])
    r = f("Rough")
    if r:
        t = img(r, (-700, 0), True)
        if rough_mul != 1.0:
            mm = _node(nt, "ShaderNodeMath", (-300, 0), operation='MULTIPLY')
            mm.inputs[1].default_value = rough_mul
            nt.links.new(t.outputs["Color"], mm.inputs[0])
            nt.links.new(mm.outputs[0], b.inputs["Roughness"])
        else:
            nt.links.new(t.outputs["Color"], b.inputs["Roughness"])
    n = f("nor_gl")
    if n and bump > 0:
        t = img(n, (-700, -300), True)
        nm = _node(nt, "ShaderNodeNormalMap", (-300, -300))
        nm.inputs["Strength"].default_value = bump
        nt.links.new(t.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
    return m


def assign(obj, mat, slot=None):
    if slot is None:
        obj.data.materials.clear()
        obj.data.materials.append(mat)
    else:
        while len(obj.data.materials) <= slot:
            obj.data.materials.append(mat)
        obj.data.materials[slot] = mat
    return obj


# ---------------------------------------------------------------- primitives
def box(name, size, loc=(0, 0, 0), rot=(0, 0, 0), mat=None, c=None, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    o.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        md = o.modifiers.new("bevel", 'BEVEL')
        md.width = bevel
        md.segments = 2
        md.limit_method = 'ANGLE'
    if mat:
        assign(o, mat)
    if c:
        link_to(o, c)
    return o


def cyl(name, r, depth, loc=(0, 0, 0), rot=(0, 0, 0), mat=None, c=None, verts=24):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    if mat:
        assign(o, mat)
    if c:
        link_to(o, c)
    return o


def smooth(o, angle=40):
    for p in o.data.polygons:
        p.use_smooth = True
    try:
        o.data.set_sharp_from_angle(angle=math.radians(angle))
    except Exception:
        pass
    return o


# ---------------------------------------------------------------- assets
def import_gltf(model, c=None, loc=(0, 0, 0), rot=(0, 0, 0), scale=1.0, join=True):
    """Import a Poly Haven glTF model, optionally join into a single object."""
    path = f"{PH}/models/{model}/{model}.gltf"
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in new if o.type == 'MESH']
    for o in new:
        if o.type == 'MESH':
            mw = o.matrix_world.copy()
            o.parent = None
            o.matrix_world = mw
    for o in new:
        if o.type != 'MESH':
            bpy.data.objects.remove(o)
    if join and len(meshes) > 1:
        bpy.ops.object.select_all(action='DESELECT')
        for o in meshes:
            o.select_set(True)
        bpy.context.view_layer.objects.active = meshes[0]
        bpy.ops.object.join()
        meshes = [bpy.context.active_object]
    for o in meshes:
        o.name = model if len(meshes) == 1 else o.name
        o.location = Vector(loc) + o.location
        o.rotation_euler = rot
        o.scale = (scale, scale, scale)
        if c:
            link_to(o, c)
    return meshes[0] if len(meshes) == 1 else meshes


def instance(src, name, loc, rot=(0, 0, 0), scale=1.0, c=None):
    o = src.copy()
    o.name = name
    o.location = loc
    o.rotation_euler = rot
    o.scale = (scale, scale, scale) if isinstance(scale, (int, float)) else scale
    (c or src.users_collection[0]).objects.link(o)
    return o


# ---------------------------------------------------------------- world
def world_hdri(name, hdri, strength=1.0, rot_z=0.0, tint=(1, 1, 1, 1), sat=1.0, bg_strength=None):
    w = bpy.data.worlds.get(name) or bpy.data.worlds.new(name)
    w.use_nodes = True
    nt = w.node_tree
    nt.nodes.clear()
    tc = _node(nt, "ShaderNodeTexCoord", (-1000, 0))
    mp = _node(nt, "ShaderNodeMapping", (-800, 0))
    mp.inputs["Rotation"].default_value[2] = rot_z
    env = _node(nt, "ShaderNodeTexEnvironment", (-600, 0))
    env.image = bpy.data.images.load(f"{PH}/hdri/{hdri}_2k.hdr", check_existing=True)
    hsv = _node(nt, "ShaderNodeHueSaturation", (-350, 0))
    hsv.inputs["Saturation"].default_value = sat
    mix = _node(nt, "ShaderNodeMix", (-150, 0), data_type='RGBA', blend_type='MULTIPLY')
    mix.inputs["Factor"].default_value = 1
    mix.inputs[7].default_value = tint
    bg = _node(nt, "ShaderNodeBackground", (100, 0))
    bg.inputs["Strength"].default_value = strength
    out = _node(nt, "ShaderNodeOutputWorld", (350, 0))
    nt.links.new(tc.outputs["Generated"], mp.inputs["Vector"])
    nt.links.new(mp.outputs["Vector"], env.inputs["Vector"])
    nt.links.new(env.outputs["Color"], hsv.inputs["Color"])
    nt.links.new(hsv.outputs["Color"], mix.inputs[6])
    nt.links.new(mix.outputs[2], bg.inputs["Color"])
    nt.links.new(bg.outputs["Background"], out.inputs["Surface"])
    return w


# ---------------------------------------------------------------- render
def setup_render(scene, res=(576, 1024), samples=4, fps=30, film_transparent=False):
    r = scene.render
    r.engine = 'BLENDER_EEVEE_NEXT'
    r.resolution_x, r.resolution_y = res
    r.resolution_percentage = 100
    r.fps = fps
    r.film_transparent = film_transparent
    e = scene.eevee
    e.taa_render_samples = samples
    e.use_shadows = True
    e.shadow_ray_count = 1
    e.shadow_step_count = 4
    e.bokeh_max_size = 24
    e.use_gtao = True
    e.gtao_distance = 0.6
    e.use_volumetric_shadows = True
    e.volumetric_tile_size = '8'
    e.volumetric_samples = 48
    e.use_bokeh_jittered = False
    e.use_raytracing = False
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'AgX - Punchy'
    r.image_settings.file_format = 'PNG'
    r.image_settings.color_mode = 'RGB'
    r.image_settings.compression = 30
    return scene


def camera(name, loc, target=None, lens=35, c=None, dof_obj=None, fstop=2.8, sensor=36):
    cd = bpy.data.cameras.new(name)
    cd.lens = lens
    cd.sensor_width = sensor
    cd.clip_start = 0.05
    cd.clip_end = 3000
    o = bpy.data.objects.new(name, cd)
    (c or bpy.context.scene.collection).objects.link(o)
    o.location = loc
    if target is not None:
        look_at(o, target)
    if dof_obj is not None:
        cd.dof.use_dof = True
        cd.dof.focus_object = dof_obj
        cd.dof.aperture_fstop = fstop
    return o


def look_at(o, target, roll=0.0):
    d = Vector(target) - o.location
    q = d.to_track_quat('-Z', 'Y')
    o.rotation_euler = q.to_euler()
    if roll:
        o.rotation_euler.rotate_axis('Z', roll)


def key(obj, path, frame, value=None, interp=None, index=-1):
    if value is not None:
        p = obj.path_resolve(path) if '.' in path else getattr(obj, path)
        if hasattr(p, '__len__') and not isinstance(value, (int, float)):
            for i, v in enumerate(value):
                p[i] = v
        else:
            setattr(obj, path, value) if '.' not in path else exec(f"obj.{path} = value")
    obj.keyframe_insert(data_path=path, frame=frame, index=index)
    if interp:
        ad = obj.animation_data
        if ad and ad.action:
            for fc in _fcurves(ad.action):
                if fc.data_path == path:
                    for kp in fc.keyframe_points:
                        if abs(kp.co[0] - frame) < 0.5:
                            kp.interpolation = interp


def _fcurves(action):
    """Blender 4.4+ layered actions: iterate all fcurves."""
    if hasattr(action, "fcurves") and len(action.fcurves):
        return list(action.fcurves)
    out = []
    for layer in getattr(action, "layers", []):
        for strip in layer.strips:
            for cb in strip.channelbags:
                out.extend(cb.fcurves)
    return out


def ease_all(obj, ease='AUTO_CLAMPED'):
    ad = obj.animation_data
    if ad and ad.action:
        for fc in _fcurves(ad.action):
            for kp in fc.keyframe_points:
                kp.interpolation = 'BEZIER'
                kp.handle_left_type = ease
                kp.handle_right_type = ease


def light(name, kind, loc, energy, color=(1, 1, 1), rot=(0, 0, 0), size=0.5, c=None, spot=45):
    ld = bpy.data.lights.new(name, kind)
    ld.energy = energy
    ld.color = color
    if kind == 'AREA':
        ld.size = size
    elif kind in ('POINT', 'SPOT'):
        ld.shadow_soft_size = size
        if kind == 'SPOT':
            ld.spot_size = math.radians(spot)
            ld.spot_blend = 0.6
    elif kind == 'SUN':
        ld.angle = math.radians(size)
    o = bpy.data.objects.new(name, ld)
    o.location = loc
    o.rotation_euler = rot
    (c or bpy.context.scene.collection).objects.link(o)
    return o


def seed(n):
    random.seed(n)
