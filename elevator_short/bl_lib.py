"""Blender helper library: materials, primitive builders, keyframing, cameras."""
import bpy, bmesh, math, random
from mathutils import Vector, Euler, Matrix

D = bpy.data
rad = math.radians


# ------------------------------------------------------------------------------------ scene utils
def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def coll(name, parent=None):
    c = D.collections.get(name)
    if c is None:
        c = D.collections.new(name)
        (parent or bpy.context.scene.collection).children.link(c)
    return c


_ACTIVE_COLL = [None]


def set_coll(c):
    _ACTIVE_COLL[0] = c


def link(ob):
    c = _ACTIVE_COLL[0] or bpy.context.scene.collection
    c.objects.link(ob)
    return ob


def empty(name, loc=(0, 0, 0), parent=None, size=0.1):
    e = D.objects.new(name, None)
    e.empty_display_size = size
    e.location = loc
    link(e)
    if parent:
        e.parent = parent
    return e


def obj_from_bm(name, bm, mat=None, parent=None, loc=(0, 0, 0), smooth=True):
    me = D.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    ob = D.objects.new(name, me)
    link(ob)
    ob.location = loc
    if parent:
        ob.parent = parent
    if mat:
        if isinstance(mat, (list, tuple)):
            for m in mat:
                me.materials.append(m)
        else:
            me.materials.append(mat)
    return ob


# ------------------------------------------------------------------------------------ primitives
def box(name, size, loc=(0, 0, 0), mat=None, parent=None, bevel=0.0, segs=2, rot=None):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
    ob = obj_from_bm(name, bm, mat, parent, loc, smooth=False)
    if rot:
        ob.rotation_euler = [rad(a) for a in rot]
    if bevel > 0:
        m = ob.modifiers.new("bev", "BEVEL")
        m.width = bevel
        m.segments = segs
        m.limit_method = 'NONE'
        if segs > 1:
            for p in ob.data.polygons:
                p.use_smooth = True
            m.harden_normals = False
    return ob


def sphere(name, r=1.0, loc=(0, 0, 0), scale=(1, 1, 1), mat=None, parent=None, seg=32, ring=16):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=ring, radius=r)
    for v in bm.verts:
        v.co = Vector((v.co.x * scale[0], v.co.y * scale[1], v.co.z * scale[2]))
    return obj_from_bm(name, bm, mat, parent, loc)


def cyl(name, r, depth, loc=(0, 0, 0), mat=None, parent=None, verts=24, rot=None, smooth=True, r2=None):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=verts, radius1=r, radius2=r if r2 is None else r2, depth=depth)
    ob = obj_from_bm(name, bm, mat, parent, loc, smooth=smooth)
    if rot:
        ob.rotation_euler = [rad(a) for a in rot]
    return ob


def capsule(name, r, length, mat=None, parent=None, loc=(0, 0, 0), down=True, rx=None, ry=None, taper=1.0, seg=20):
    """Capsule along -Z (down=True) starting at the origin: a limb segment hanging from its pivot.
    rx/ry give an elliptical cross-section; taper scales the far end."""
    rx = rx or r
    ry = ry or r
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=14, radius=1.0)
    for v in bm.verts:
        z = v.co.z
        if z >= 0:   # top half-sphere stays at origin
            s = 1.0
            v.co = Vector((v.co.x * rx * s, v.co.y * ry * s, z * min(rx, ry)))
        else:
            s = taper
            v.co = Vector((v.co.x * rx * s, v.co.y * ry * s, z * min(rx, ry) * s - length))
    if not down:
        for v in bm.verts:
            v.co.z = -v.co.z
    return obj_from_bm(name, bm, mat, parent, loc)


def text(name, body, size=0.1, loc=(0, 0, 0), rot=(90, 0, 0), mat=None, parent=None, extrude=0.0,
         align='CENTER', font=None):
    cu = D.curves.new(name, 'FONT')
    cu.body = body
    cu.size = size
    cu.extrude = extrude
    cu.align_x = align
    cu.align_y = 'CENTER'
    if font:
        cu.font = font
    ob = D.objects.new(name, cu)
    link(ob)
    ob.location = loc
    ob.rotation_euler = [rad(a) for a in rot]
    if parent:
        ob.parent = parent
    if mat:
        cu.materials.append(mat)
    return ob


def load_font(path):
    try:
        return D.fonts.load(path)
    except Exception:
        return None


# ------------------------------------------------------------------------------------ materials
def _bsdf(m):
    return m.node_tree.nodes.get("Principled BSDF")


def mat(name, color, rough=0.5, metal=0.0, emit=None, emit_strength=0.0, sss=0.0, spec=0.5,
        alpha=1.0, coat=0.0, aniso=0.0):
    m = D.materials.new(name)
    m.use_nodes = True
    b = _bsdf(m)
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    b.inputs["Specular IOR Level"].default_value = spec
    if sss:
        b.inputs["Subsurface Weight"].default_value = sss
        b.inputs["Subsurface Radius"].default_value = (1.0, 0.35, 0.2)
        b.inputs["Subsurface Scale"].default_value = 0.03
    if coat:
        b.inputs["Coat Weight"].default_value = coat
    if aniso:
        b.inputs["Anisotropic"].default_value = aniso
    if emit is not None:
        b.inputs["Emission Color"].default_value = (*emit, 1)
        b.inputs["Emission Strength"].default_value = emit_strength
    if alpha < 1.0:
        b.inputs["Alpha"].default_value = alpha
        m.surface_render_method = 'BLENDED'
    return m


def emit_mat(name, color, strength=5.0):
    m = D.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    e = nt.nodes.new("ShaderNodeEmission")
    e.inputs["Color"].default_value = (*color, 1)
    e.inputs["Strength"].default_value = strength
    nt.links.new(e.outputs[0], out.inputs[0])
    return m


def beam_mat(name, color, strength=2.0, alpha=0.25):
    """Additive-looking transparent light beam (fake volumetric) with soft edges (fades along UV x)."""
    m = D.materials.new(name)
    m.use_nodes = True
    m.surface_render_method = 'BLENDED'
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["UV"], sep.inputs[0])
    # edge falloff: 1 - |2u-1|^2, times length falloff (1-v)
    mx = nt.nodes.new("ShaderNodeMath"); mx.operation = 'MULTIPLY_ADD'
    mx.inputs[1].default_value = 2.0; mx.inputs[2].default_value = -1.0
    nt.links.new(sep.outputs[0], mx.inputs[0])
    ab = nt.nodes.new("ShaderNodeMath"); ab.operation = 'ABSOLUTE'
    nt.links.new(mx.outputs[0], ab.inputs[0])
    pw = nt.nodes.new("ShaderNodeMath"); pw.operation = 'POWER'; pw.inputs[1].default_value = 2.0
    nt.links.new(ab.outputs[0], pw.inputs[0])
    inv = nt.nodes.new("ShaderNodeMath"); inv.operation = 'SUBTRACT'; inv.inputs[0].default_value = 1.0
    nt.links.new(pw.outputs[0], inv.inputs[1])
    inv2 = nt.nodes.new("ShaderNodeMath"); inv2.operation = 'SUBTRACT'; inv2.inputs[0].default_value = 1.0
    nt.links.new(sep.outputs[1], inv2.inputs[1])
    mul = nt.nodes.new("ShaderNodeMath"); mul.operation = 'MULTIPLY'
    nt.links.new(inv.outputs[0], mul.inputs[0]); nt.links.new(inv2.outputs[0], mul.inputs[1])
    mul2 = nt.nodes.new("ShaderNodeMath"); mul2.operation = 'MULTIPLY'; mul2.inputs[1].default_value = alpha
    nt.links.new(mul.outputs[0], mul2.inputs[0])
    mul2.name = "BeamAlpha"
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (*color, 1); em.inputs["Strength"].default_value = strength
    tr = nt.nodes.new("ShaderNodeBsdfTransparent")
    mix = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(mul2.outputs[0], mix.inputs[0])
    nt.links.new(tr.outputs[0], mix.inputs[1]); nt.links.new(em.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs[0])
    return m


def noise_mat(name, c1, c2, scale=20.0, rough=0.6, metal=0.0, detail=6.0, bump=0.0, stretch=None,
              rough2=None):
    """Principled material with color mixed by a noise texture (concrete, brushed metal, tiles...)."""
    m = D.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = _bsdf(m)
    tc = nt.nodes.new("ShaderNodeTexCoord")
    mp = nt.nodes.new("ShaderNodeMapping")
    if stretch:
        mp.inputs["Scale"].default_value = stretch
    nt.links.new(tc.outputs["Object"], mp.inputs[0])
    n = nt.nodes.new("ShaderNodeTexNoise")
    n.inputs["Scale"].default_value = scale
    n.inputs["Detail"].default_value = detail
    nt.links.new(mp.outputs[0], n.inputs["Vector"])
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (*c1, 1)
    ramp.color_ramp.elements[1].color = (*c2, 1)
    ramp.color_ramp.elements[0].position = 0.3
    ramp.color_ramp.elements[1].position = 0.7
    nt.links.new(n.outputs["Fac"], ramp.inputs[0])
    nt.links.new(ramp.outputs[0], b.inputs["Base Color"])
    b.inputs["Metallic"].default_value = metal
    if rough2 is not None:
        r = nt.nodes.new("ShaderNodeMapRange")
        r.inputs["To Min"].default_value = rough
        r.inputs["To Max"].default_value = rough2
        nt.links.new(n.outputs["Fac"], r.inputs[0])
        nt.links.new(r.outputs[0], b.inputs["Roughness"])
    else:
        b.inputs["Roughness"].default_value = rough
    if bump:
        bp = nt.nodes.new("ShaderNodeBump")
        bp.inputs["Strength"].default_value = bump
        bp.inputs["Distance"].default_value = 0.02
        nt.links.new(n.outputs["Fac"], bp.inputs["Height"])
        nt.links.new(bp.outputs[0], b.inputs["Normal"])
    return m


def tile_mat(name, c1, c2, scale=4.0, rough=0.35, mortar=(0.05, 0.05, 0.05)):
    m = D.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = _bsdf(m)
    tc = nt.nodes.new("ShaderNodeTexCoord")
    br = nt.nodes.new("ShaderNodeTexBrick")
    br.inputs["Scale"].default_value = scale
    br.inputs["Color1"].default_value = (*c1, 1)
    br.inputs["Color2"].default_value = (*c2, 1)
    br.inputs["Mortar"].default_value = (*mortar, 1)
    br.inputs["Mortar Size"].default_value = 0.012
    br.offset = 0.0
    br.inputs["Brick Width"].default_value = 0.5
    br.inputs["Row Height"].default_value = 0.5
    nt.links.new(tc.outputs["Object"], br.inputs["Vector"])
    nt.links.new(br.outputs["Color"], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = rough
    return m


def set_emission(m, strength):
    """Return the socket that drives emission strength for keyframing."""
    b = _bsdf(m)
    if b:
        return b.inputs["Emission Strength"]
    for n in m.node_tree.nodes:
        if n.type == 'EMISSION':
            return n.inputs["Strength"]


def key_emission(m, frame, strength, interp=None):
    s = set_emission(m, strength)
    s.default_value = strength
    s.keyframe_insert("default_value", frame=frame)
    if interp:
        set_interp(m.node_tree, interp)


# ------------------------------------------------------------------------------------ keyframing
def set_interp(idblock, interp='CONSTANT'):
    for fc in fcurves(idblock):
        for k in fc.keyframe_points:
            k.interpolation = interp


def _fcurves(action):
    try:
        return list(action.fcurves)
    except AttributeError:
        out = []
        for layer in action.layers:
            for strip in layer.strips:
                for cb in strip.channelbags:
                    out.extend(cb.fcurves)
        return out


def fcurves(ob):
    """F-curves of this ID only (4.4+ slotted actions may share one action between object and data)."""
    ad = ob.animation_data
    if not ad or not ad.action:
        return []
    try:
        from bpy_extras import anim_utils
        cb = anim_utils.action_get_channelbag_for_slot(ad.action, ad.action_slot)
        return list(cb.fcurves) if cb else []
    except (ImportError, AttributeError):
        return _fcurves(ad.action)


def kf(ob, path, frame, value=None, interp=None, index=-1):
    if value is not None:
        if isinstance(value, (list, tuple)):
            setattr(ob, path, value)
        else:
            if index >= 0:
                getattr(ob, path)[index] = value
            else:
                setattr(ob, path, value)
    ob.keyframe_insert(path, frame=frame, index=index)
    if interp:
        for fc in fcurves(ob):
            if fc.data_path == path:
                for k in fc.keyframe_points:
                    if int(round(k.co.x)) == frame:
                        k.interpolation = interp


def key_vis(ob, ranges, frame_end=100000):
    """Make object render-visible only inside given frame ranges [(a,b),...] (CONSTANT keys)."""
    for fc in fcurves(ob):
        if fc.data_path == "hide_render":
            fc.keyframe_points.clear()
    ob.hide_render = True
    ob.hide_viewport = False
    ob.keyframe_insert("hide_render", frame=-10)
    for a, b in ranges:
        ob.hide_render = False
        ob.keyframe_insert("hide_render", frame=a)
        ob.hide_render = True
        ob.keyframe_insert("hide_render", frame=b + 1)
    for fc in fcurves(ob):
        if fc.data_path == "hide_render":
            for k in fc.keyframe_points:
                k.interpolation = 'CONSTANT'


def key_light(light_ob, keys):
    """keys: list of (frame, energy[, color]) -- inserted on the light data, linear interpolation."""
    L = light_ob.data
    for k in keys:
        f, e = k[0], k[1]
        L.energy = e
        L.keyframe_insert("energy", frame=f)
        if len(k) > 2:
            L.color = k[2]
            L.keyframe_insert("color", frame=f)


def ease_all(ob, interp='BEZIER', easing='AUTO'):
    for fc in fcurves(ob):
        for k in fc.keyframe_points:
            if k.interpolation != 'CONSTANT':
                k.interpolation = interp
                k.easing = easing


# ------------------------------------------------------------------------------------ lights
def light(name, kind, loc, energy, color=(1, 1, 1), size=0.5, rot=(0, 0, 0), parent=None, spot=45,
          blend=0.3, shadow=True, target=None, size_y=None):
    L = D.lights.new(name, kind)
    L.energy = energy
    L.color = color
    if kind == 'AREA':
        L.size = size
        if size_y:
            L.shape = 'RECTANGLE'
            L.size_y = size_y
    elif kind in ('POINT', 'SPOT'):
        L.shadow_soft_size = size
    if kind == 'SPOT':
        L.spot_size = rad(spot)
        L.spot_blend = blend
    L.use_shadow = shadow
    ob = D.objects.new(name, L)
    link(ob)
    ob.location = loc
    ob.rotation_euler = [rad(a) for a in rot]
    if parent:
        ob.parent = parent
    if target is not None:
        look_at(ob, Vector(loc), Vector(target))
    return ob


def look_rot(src, dst, roll=0.0, prev=None):
    d = (Vector(dst) - Vector(src))
    q = d.to_track_quat('-Z', 'Y')
    e = q.to_euler('XYZ', prev) if prev is not None else q.to_euler('XYZ')
    if roll:
        m = q.to_matrix() @ Matrix.Rotation(rad(roll), 3, 'Z')
        e = m.to_euler('XYZ', prev if prev is not None else e)
    return e


def look_at(ob, src, dst, roll=0.0):
    ob.rotation_euler = look_rot(src, dst, roll)


# ------------------------------------------------------------------------------------ cameras
def camera(name, keys, parent=None, sensor=36.0, dof=None, interp='BEZIER', clip_start=0.01):
    """keys: list of dicts {f, loc, at, lens, roll}. Camera eases between keys."""
    cd = D.cameras.new(name)
    cd.sensor_width = sensor
    cd.sensor_fit = 'AUTO'
    cd.clip_start = clip_start
    cd.clip_end = 200
    ob = D.objects.new(name, cd)
    link(ob)
    if parent:
        ob.parent = parent
    prev = None
    for k in keys:
        f = k["f"]
        ob.location = k["loc"]
        e = look_rot(k["loc"], k["at"], k.get("roll", 0.0), prev)
        ob.rotation_euler = e
        prev = e.copy()
        ob.keyframe_insert("location", frame=f)
        ob.keyframe_insert("rotation_euler", frame=f)
        cd.lens = k.get("lens", 24)
        cd.keyframe_insert("lens", frame=f)
    for fc in fcurves(ob) + fcurves(cd):
        for kp in fc.keyframe_points:
            kp.interpolation = interp
            if interp == 'BEZIER':
                kp.handle_left_type = kp.handle_right_type = 'AUTO_CLAMPED'
    if dof:
        cd.dof.use_dof = True
        if isinstance(dof, dict):
            if "obj" in dof:
                cd.dof.focus_object = dof["obj"]
            if "dist" in dof:
                cd.dof.focus_distance = dof["dist"]
            cd.dof.aperture_fstop = dof.get("fstop", 2.8)
    return ob


def shake(ob, strength=0.01, scale=3.0, frames=None, rot_strength=None, seed=0, blend=2):
    """Noise modifiers on camera location/rotation, optionally limited to frame ranges."""
    ranges = frames or [(None, None)]
    for fc in fcurves(ob):
        if fc.data_path not in ("location", "rotation_euler"):
            continue
        for (a, b) in ranges:
            mod = fc.modifiers.new('NOISE')
            mod.scale = scale
            mod.strength = (rot_strength if (fc.data_path == "rotation_euler" and rot_strength is not None)
                            else strength * (0.6 if fc.data_path == "rotation_euler" else 1.0))
            mod.phase = seed * 13.1 + fc.array_index * 7.7 + (a or 0) * 0.37
            if a is not None:
                mod.use_restricted_range = True
                mod.frame_start = a
                mod.frame_end = b
                mod.blend_in = blend
                mod.blend_out = blend


def bind_cameras(scene, shot_cams):
    """shot_cams: list of (first_frame, camera_object) -> timeline markers that switch cameras."""
    for f, cam in shot_cams:
        mk = scene.timeline_markers.new(cam.name, frame=f)
        mk.camera = cam
    scene.camera = shot_cams[0][1]


def key_vis_tree(ob, ranges):
    key_vis(ob, ranges)
    for c in ob.children_recursive:
        if c.type in ('MESH', 'FONT', 'LIGHT', 'CURVE'):
            key_vis(c, ranges)


def wpos(ob, frame):
    bpy.context.scene.frame_set(frame)
    return ob.matrix_world.translation.copy()


def local_pos(ob, frame, space):
    bpy.context.scene.frame_set(frame)
    return space.matrix_world.inverted() @ ob.matrix_world.translation
