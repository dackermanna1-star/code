"""Shared helicopter-rescue helpers (MH-65 Dolphin, rotor, downwash spray, hoist strop)."""
from mathutils import Matrix
from common import *
import marine

def heli(path_fn, N, hover=False, spin_deg=24.0, yaw_deg=None):
    root, rotor = marine.load_helicopter(hub_z=3.3)
    root.rotation_mode = 'QUATERNION'
    sc = bpy.context.scene
    prev = path_fn(0)
    # initial heading: given, or the first direction of travel (no snap when it starts moving)
    yaw0 = math.radians(yaw_deg) if yaw_deg is not None else None
    if yaw0 is None:
        for f in range(1, N + 1):
            dd = path_fn(f) - path_fn(0)
            if Vector((dd.x, dd.y, 0)).length > 0.5:
                yaw0 = math.atan2(dd.y, dd.x) + math.pi / 2; break
        if yaw0 is None: yaw0 = 0.0
    root['yaw'] = yaw0; cur_yaw = yaw0
    for f in range(1, N + 1):
        p = path_fn(f)
        d = p - prev
        t = f / 30.0
        wob = Vector((0.15 * math.sin(t * 0.9), 0.12 * math.sin(t * 0.7 + 1), 0.2 * math.sin(t * 1.1))) if hover else Vector()
        root.location = p + wob; root.keyframe_insert('location', frame=f)
        hd = Vector((d.x, d.y, 0))
        if hd.length > 0.05 and yaw_deg is None:
            target = math.atan2(hd.y, hd.x) + math.pi / 2     # nose is -Y in model space
            dy = (target - cur_yaw + math.pi) % (2 * math.pi) - math.pi
            cur_yaw += dy * 0.08                              # smooth heading changes
            pitch = min(0.22, hd.length * 30 / 350.0)        # nose-down when moving fast
        else:
            pitch = 0.0
        yaw = cur_yaw
        from mathutils import Quaternion
        # +X rotation pitches the nose (-Y) DOWN
        q = Quaternion((0, 0, 1), yaw) @ Quaternion((1, 0, 0), pitch + 0.03 * math.sin(t * 1.3)) @ Quaternion((0, 1, 0), 0.03 * math.sin(t * 0.8))
        root.rotation_quaternion = q; root.keyframe_insert('rotation_quaternion', frame=f)
        prev = p
    if rotor:
        rotor.rotation_mode = 'XYZ'
        rotor.rotation_euler.z = 0.0; rotor.keyframe_insert('rotation_euler', index=2, frame=0)
        rotor.rotation_euler.z = math.radians(spin_deg) * (N + 1); rotor.keyframe_insert('rotation_euler', index=2, frame=N + 1)
        for fc in env.fcurves_of(rotor):
            for k in fc.keyframe_points: k.interpolation = 'LINEAR'
        # faint motion-blur disc
        bpy.ops.mesh.primitive_circle_add(vertices=64, radius=6.1, fill_type='NGON', location=(0, 0, 0))
        disc = bpy.context.object; disc.name = 'RotorDisc'; env.link(disc, 'Props')
        m = bpy.data.materials.new('RotorDisc'); m.use_nodes = True; nt = m.node_tree; N_ = nt.nodes; L_ = nt.links; N_.clear()
        out = N_.new('ShaderNodeOutputMaterial'); tr = N_.new('ShaderNodeBsdfTransparent'); df = N_.new('ShaderNodeBsdfDiffuse')
        df.inputs['Color'].default_value = (0.05, 0.05, 0.05, 1); mx = N_.new('ShaderNodeMixShader'); mx.inputs[0].default_value = 0.12
        L_.new(tr.outputs[0], mx.inputs[1]); L_.new(df.outputs[0], mx.inputs[2]); L_.new(mx.outputs[0], out.inputs[0])
        disc.data.materials.append(m); disc.parent = rotor; disc.location = (0, 0, 0.12)
        disc.visible_shadow = False
    return root, rotor

def downwash(center_obj, frames, radius=(2.5, 7.5), rate=2600, seed=0, strength=1.0):
    """Spray thrown outward and up from the water under the rotor."""
    bpy.ops.mesh.primitive_circle_add(vertices=48, radius=radius[1], fill_type='NGON', location=(0, 0, 0))
    ring = bpy.context.object; ring.name = 'WashRing'; env.link(ring, 'FX')
    ring.parent = center_obj; ring.location = (0, 0, 0.05); ring.show_instancer_for_render = False
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=1, location=(0, -300, -300))
    mist = bpy.context.object; mist.name = 'Mist'; env.link(mist, 'FX')
    m = bpy.data.materials.new('Mist'); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (0.9, 0.93, 0.95, 1); b.inputs['Roughness'].default_value = 0.5; b.inputs['Alpha'].default_value = 0.45
    mist.data.materials.append(m)
    ps = ring.modifiers.new('wash', 'PARTICLE_SYSTEM').particle_system; st = ps.settings
    st.count = int(rate * (frames[1] - frames[0]) / 30 * strength); st.frame_start, st.frame_end = frames
    st.lifetime = 34; st.lifetime_random = 0.5; st.emit_from = 'FACE'
    st.normal_factor = 0.7; st.factor_random = 1.1; st.object_align_factor = (0, 0, 0.6)
    st.effector_weights.gravity = 1.0; st.drag_factor = 0.5
    st.render_type = 'OBJECT'; st.instance_object = mist; st.particle_size = 0.012; st.size_random = 0.8
    st.lifetime = 22
    ps.seed = seed
    return ring

def churn_water(o, amount=2.2):
    n = o['mat'].node_tree.nodes
    n['foam_amount'].outputs[0].default_value = amount
    n['ripple_amp'].outputs[0].default_value = 3.5
    n['collar_foam'].outputs[0].default_value = 0.8

def strop(c):
    """Yellow rescue strop (horse collar) around his chest, under the arms."""
    bpy.ops.mesh.primitive_torus_add(major_radius=0.2, minor_radius=0.045, location=(0, 0, 0))
    s = bpy.context.object; s.name = 'Strop'; env.link(s, 'Props')
    s.scale = (1.0, 0.75, 1.0)
    m = bpy.data.materials.new('Strop'); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (0.95, 0.55, 0.02, 1); b.inputs['Roughness'].default_value = 0.6
    s.data.materials.append(m)
    s.parent = c.rig; s.parent_type = 'BONE'; s.parent_bone = 'spine02'; s.location = (0, -0.02, 0.0)
    s.rotation_euler = (math.radians(90), 0, 0)
    return s

def cable(top_obj, bottom_obj):
    """Hoist cable: a thin cylinder stretched between two objects every frame (keyed)."""
    bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=0.008, depth=1.0, location=(0, 0, 0))
    cb = bpy.context.object; cb.name = 'Cable'; env.link(cb, 'Props')
    cb.data.transform(Matrix.Translation((0, 0, 0.5)))
    cb.data.transform(Matrix.Rotation(-math.pi / 2, 4, 'X'))   # length along +Y for STRETCH_TO
    m = bpy.data.materials.new('Cable'); m.use_nodes = True; m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.25, 0.25, 0.25, 1)
    cb.data.materials.append(m)
    cs = cb.constraints.new('COPY_LOCATION'); cs.target = bottom_obj
    st = cb.constraints.new('STRETCH_TO'); st.target = top_obj; st.rest_length = 1.0; st.volume = 'NO_VOLUME'
    return cb

def rescue_frame(sun):
    """Shared geometry for SH25-SH29: d points toward the low sun; the helicopter comes out of the glare
    along d and hovers slightly sunward of him; he faces d. Returns (d, side, yaw_deg_facing_d)."""
    az = math.atan2(sun['dir'][1], sun['dir'][0])
    d = Vector((math.cos(az), math.sin(az), 0))
    side = d.cross(Vector((0, 0, 1)))
    yaw = math.degrees(math.atan2(d.x, -d.y))    # character faces (sin y, -cos y)
    return d, side, yaw

HOVER_OFF = 1.2      # metres sunward of him (SH26 arrival)
HOVER_Z = 10.5       # hoist hover height (~35 ft); SH26 arrives 2 m higher and SH27 settles down to this
ARRIVE_Z = HOVER_Z + 2.0
HOOK_CM = (130.0, -150.0, 260.0)   # rescue hoist above the cabin door, model space (cm)

def heli_yaw(d):
    """Hover heading used in SH26-SH28 (nose toward the sun), degrees."""
    return math.degrees(math.atan2(d.y, d.x)) + 90

def hook_over_xy(d):
    """Root position (XY) that puts the hoist hook straight above him (the origin)."""
    q = Matrix.Rotation(math.radians(heli_yaw(d)), 3, 'Z')
    h = q @ Vector((HOOK_CM[0] * 0.01, HOOK_CM[1] * 0.01, 0.0))
    return Vector((-h.x, -h.y, 0.0))

def world_at(ob, f, local=(0.0, 0.0, 0.0)):
    """World position of a point in an (unparented, keyed) object's space at frame f, from its fcurves
    (no scene evaluation: frame_set would re-simulate the ocean every call)."""
    from mathutils import Quaternion
    loc = Vector(ob.location); q = Quaternion(ob.rotation_quaternion)
    ad = ob.animation_data
    if ad and ad.action:
        for fc in env.fcurves_of(ob):
            if fc.data_path == 'location': loc[fc.array_index] = fc.evaluate(f)
            elif fc.data_path == 'rotation_quaternion': q[fc.array_index] = fc.evaluate(f)
    q.normalize()
    return loc + q @ (Vector(local) * ob.scale.x)

def hoist_hook(hroot):
    hook = bpy.data.objects.new('HoistHook', None); bpy.context.scene.collection.objects.link(hook)
    hook.parent = hroot; hook.location = HOOK_CM
    return hook

def hanging_strop():
    """Empty rescue strop as it hangs from the hook: a vertical yellow loop. Returns (strop, top_attach_empty)."""
    bpy.ops.mesh.primitive_torus_add(major_radius=0.24, minor_radius=0.05, location=(0, 0, 0))
    s = bpy.context.object; s.name = 'StropHang'; env.link(s, 'Props')
    s.data.transform(Matrix.Rotation(math.pi / 2, 4, 'X'))
    s.data.transform(Matrix.Scale(0.7, 4, Vector((1, 0, 0))))
    m = bpy.data.materials.new('StropHang'); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (0.95, 0.55, 0.02, 1); b.inputs['Roughness'].default_value = 0.6
    s.data.materials.append(m)
    top = bpy.data.objects.new('StropTop', None); bpy.context.scene.collection.objects.link(top)
    top.parent = s; top.location = (0, 0, 0.27)
    return s, top
