"""Shared helicopter-rescue helpers (MH-65 Dolphin, rotor, downwash spray, hoist strop)."""
from mathutils import Matrix
from common import *
import marine

def heli(path_fn, N, hover=False, spin_deg=24.0):
    root, rotor = marine.load_helicopter(hub_z=3.3)
    root.rotation_mode = 'QUATERNION'
    sc = bpy.context.scene
    prev = path_fn(0)
    for f in range(1, N + 1):
        p = path_fn(f)
        d = p - prev
        t = f / 30.0
        wob = Vector((0.15 * math.sin(t * 0.9), 0.12 * math.sin(t * 0.7 + 1), 0.2 * math.sin(t * 1.1))) if hover else Vector()
        root.location = p + wob; root.keyframe_insert('location', frame=f)
        hd = Vector((d.x, d.y, 0))
        if hd.length > 0.02:
            yaw = math.atan2(hd.y, hd.x) + math.pi / 2     # nose is -Y in model space
            pitch = min(0.25, hd.length * 30 / 400.0)       # nose-down when moving fast
        else:
            yaw = root.get('yaw', 0.0); pitch = 0.0
        root['yaw'] = yaw
        from mathutils import Quaternion
        q = Quaternion((0, 0, 1), yaw) @ Quaternion((1, 0, 0), -pitch + 0.03 * math.sin(t * 1.3)) @ Quaternion((0, 1, 0), 0.03 * math.sin(t * 0.8))
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
