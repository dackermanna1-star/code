"""Marine life, props and underwater FX for "Stranded"."""
import bpy, math, random
import numpy as np
from mathutils import Vector, Matrix, Euler, Quaternion

ROOT = '/home/user/code/blender'
SRC = ROOT + '/assets_src/objaverse/'
FPS = 30

def _link(o, colname):
    for c in o.users_collection: c.objects.unlink(o)
    bpy.data.collections[colname].objects.link(o)

def import_glb(name, colname='Marine'):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=SRC + name + '.glb')
    new = [o for o in bpy.data.objects if o not in before]
    for o in list(new):
        if o.name.startswith('Icosphere') or (o.type == 'MESH' and len(o.data.polygons) <= 12 and name.startswith('trevally')):
            new.remove(o); bpy.data.objects.remove(o, do_unlink=True)
    for o in new: _link(o, colname)
    return new

def top_parent(objs):
    roots = [o for o in objs if o.parent is None or o.parent not in objs]
    return roots

def make_root(objs, name):
    root = bpy.data.objects.new(name, None)
    bpy.data.collections[objs[0].users_collection[0].name].objects.link(root)
    for o in top_parent(objs):
        mw = o.matrix_world.copy(); o.parent = root; o.matrix_world = mw
    return root

# ------------------------------------------------------------------ fish
_FISH_CACHE = {}

def fish_template(name='trevally_juv', length=0.22, target_faces=14000):
    """Import once, join, decimate, normalise: head toward -X, length in metres, origin at centre. Hidden template."""
    if name in _FISH_CACHE: return _FISH_CACHE[name]
    objs = import_glb(name)
    names = [o.name for o in objs]
    meshes = [o for o in objs if o.type == 'MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes: o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    for o in meshes:
        mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.ops.object.join()
    fish = bpy.context.object
    for nm in names:
        ob = bpy.data.objects.get(nm)
        if ob is not None and ob != fish:
            bpy.data.objects.remove(ob, do_unlink=True)
    nf = len(fish.data.polygons)
    dec = fish.modifiers.new('dec', 'DECIMATE'); dec.ratio = min(1.0, target_faces / nf)
    bpy.ops.object.modifier_apply(modifier='dec')
    bb = [Vector(c) for c in fish.bound_box]
    mn = Vector([min(v[i] for v in bb) for i in range(3)]); mx = Vector([max(v[i] for v in bb) for i in range(3)])
    L = mx.x - mn.x; s = length / L
    fish.data.transform(Matrix.Translation(-(mn + mx) / 2))
    fish.data.transform(Matrix.Scale(s, 4))
    fish.name = name + '_tpl'
    fish.hide_render = True; fish.hide_viewport = True
    fish['length'] = length
    _FISH_CACHE[name] = fish
    return fish

def swim_wave_group():
    """Geometry nodes: lateral travelling wave along X (head at -X), amplitude grows toward the tail."""
    if 'FishSwim' in bpy.data.node_groups: return bpy.data.node_groups['FishSwim']
    g = bpy.data.node_groups.new('FishSwim', 'GeometryNodeTree')
    g.interface.new_socket('Geometry', in_out='INPUT', socket_type='NodeSocketGeometry')
    for nm, d in (('Length', 0.22), ('Amplitude', 0.12), ('Frequency', 3.0), ('Phase', 0.0), ('Wavelength', 1.1)):
        s = g.interface.new_socket(nm, in_out='INPUT', socket_type='NodeSocketFloat'); s.default_value = d
    g.interface.new_socket('Geometry', in_out='OUTPUT', socket_type='NodeSocketGeometry')
    N = g.nodes; L = g.links
    gi = N.new('NodeGroupInput'); go = N.new('NodeGroupOutput')
    pos = N.new('GeometryNodeInputPosition'); sep = N.new('ShaderNodeSeparateXYZ'); L.new(pos.outputs[0], sep.inputs[0])
    t = N.new('GeometryNodeInputSceneTime')
    def m(op, a, b=None):
        n = N.new('ShaderNodeMath'); n.operation = op
        for i, x in enumerate((a, b)):
            if x is None: continue
            if isinstance(x, (int, float)): n.inputs[i].default_value = x
            else: L.new(x, n.inputs[i])
        return n.outputs[0]
    # s = x/L + 0.5  (0 head .. 1 tail)
    s = m('ADD', m('DIVIDE', sep.outputs['X'], gi.outputs['Length']), 0.5)
    env_ = m('MULTIPLY', m('POWER', m('MAXIMUM', s, 0.0), 2.0), gi.outputs['Amplitude'])
    ph = m('SUBTRACT', m('MULTIPLY', m('DIVIDE', s, gi.outputs['Wavelength']), 6.2832),
           m('ADD', m('MULTIPLY', t.outputs['Seconds'], m('MULTIPLY', gi.outputs['Frequency'], 6.2832)), gi.outputs['Phase']))
    off = m('MULTIPLY', m('MULTIPLY', m('SINE', ph), env_), gi.outputs['Length'])
    comb = N.new('ShaderNodeCombineXYZ'); L.new(off, comb.inputs['Y'])
    sp = N.new('GeometryNodeSetPosition'); L.new(gi.outputs['Geometry'], sp.inputs['Geometry']); L.new(comb.outputs[0], sp.inputs['Offset'])
    L.new(sp.outputs[0], go.inputs[0])
    return g

def make_fish(tpl, phase=0.0, freq=3.0, amp=0.12, name='fish'):
    o = bpy.data.objects.new(name, tpl.data)
    bpy.data.collections['Marine'].objects.link(o)
    md = o.modifiers.new('swim', 'NODES'); md.node_group = swim_wave_group()
    ids = {s.name: s.identifier for s in md.node_group.interface.items_tree if s.item_type == 'SOCKET' and s.in_out == 'INPUT'}
    md[ids['Length']] = tpl['length']; md[ids['Amplitude']] = amp; md[ids['Frequency']] = freq; md[ids['Phase']] = phase
    return o

def school(tpl, n, center_fn, seed=0, spread=(1.2, 1.2, 0.5), heading_fn=None, speed_jitter=0.15):
    """A loose aggregation of fish. center_fn(f)->Vector; each fish wanders around the centre with its own noise,
    always facing its direction of motion (head -X)."""
    rnd = random.Random(seed)
    fishes = []
    sc = bpy.context.scene
    for i in range(n):
        o = make_fish(tpl, phase=rnd.uniform(0, 6.28), freq=rnd.uniform(2.6, 3.6), amp=rnd.uniform(0.09, 0.14), name='fish%02d' % i)
        sc_ = rnd.uniform(0.8, 1.2); o.scale = (sc_, sc_, sc_)
        off = Vector((rnd.uniform(-1, 1) * spread[0], rnd.uniform(-1, 1) * spread[1], rnd.uniform(-1, 1) * spread[2]))
        sd = rnd.uniform(0, 100)
        prev = None
        o.rotation_mode = 'QUATERNION'
        for f in range(sc.frame_start - 2, sc.frame_end + 3):
            t = f / FPS
            w = Vector((math.sin(t * 0.7 + sd) * 0.35, math.cos(t * 0.53 + sd * 1.3) * 0.35, math.sin(t * 0.9 + sd * 0.7) * 0.12))
            p = center_fn(f) + off + w
            if prev is not None:
                d = p - prev
                if d.length > 1e-5:
                    q = (-d).to_track_quat('X', 'Z')  # head (-X) along motion
                    o.rotation_quaternion = q
                    o.keyframe_insert('rotation_quaternion', frame=f)
            o.location = p; o.keyframe_insert('location', frame=f)
            prev = p.copy()
        fishes.append(o)
    return fishes

# ------------------------------------------------------------------ shark
def load_shark(length=2.6):
    objs = import_glb('mako')
    arm = next(o for o in objs if o.type == 'ARMATURE')
    root = make_root(objs, 'Mako')
    root.scale = (length / 3.2,) * 3
    act = bpy.data.actions.get('Action')
    ad = arm.animation_data or arm.animation_data_create()
    if act:
        ad.action = None
        tr = ad.nla_tracks.new(); st = tr.strips.new('swim', 1, act)
        st.repeat = 40; st.scale = 1.25   # slower, calmer cruising beat
    return root, arm

def path_animate(obj, pts_fn, f0, f1, bank=0.6, head_axis='X', head_sign=-1, up='Z'):
    """Key location along pts_fn(f) and orient the head (along head_sign*axis) to the direction of travel, with banking."""
    sc = bpy.context.scene
    obj.rotation_mode = 'QUATERNION'
    prev = pts_fn(f0 - 1); prevd = None; roll = 0.0
    for f in range(f0, f1 + 1):
        p = pts_fn(f); d = p - prev
        if d.length > 1e-6:
            q = d.to_track_quat(('-' + head_axis) if head_sign < 0 else head_axis, up)
            if prevd is not None and bank:
                # bank into the turn: angle proportional to the yaw rate (rad/frame), clamped, smoothed
                turn = math.asin(max(-1.0, min(1.0, prevd.normalized().cross(d.normalized()).z)))
                target = max(-0.45, min(0.45, -turn * bank * 15.0))
                roll += (target - roll) * 0.15
                axis = Vector((1, 0, 0)) if head_axis == 'X' else Vector((0, 1, 0))
                q = q @ Quaternion(axis, roll)
            obj.rotation_quaternion = q; obj.keyframe_insert('rotation_quaternion', frame=f)
            prevd = d
        obj.location = p; obj.keyframe_insert('location', frame=f)
        prev = p

# ------------------------------------------------------------------ underwater FX
def bubble_material():
    if 'Bubble' in bpy.data.materials: return bpy.data.materials['Bubble']
    m = bpy.data.materials.new('Bubble'); m.use_nodes = True
    nt = m.node_tree; N = nt.nodes; L = nt.links; N.clear()
    out = N.new('ShaderNodeOutputMaterial')
    fr = N.new('ShaderNodeLayerWeight'); fr.inputs['Blend'].default_value = 0.35
    gl = N.new('ShaderNodeBsdfGlossy'); gl.inputs['Roughness'].default_value = 0.02
    tr = N.new('ShaderNodeBsdfTransparent')
    em = N.new('ShaderNodeEmission'); em.inputs['Color'].default_value = (0.7, 0.9, 1.0, 1); em.inputs['Strength'].default_value = 0.6
    ad = N.new('ShaderNodeAddShader'); L.new(gl.outputs[0], ad.inputs[0]); L.new(em.outputs[0], ad.inputs[1])
    mx = N.new('ShaderNodeMixShader'); L.new(fr.outputs['Facing'], mx.inputs[0]); L.new(tr.outputs[0], mx.inputs[1]); L.new(ad.outputs[0], mx.inputs[2])
    L.new(mx.outputs[0], out.inputs[0])
    m.cycles.emission_sampling = 'NONE'
    return m

def bubble_emitter(parent, bone=None, offset=(0, 0, 0), frames=(1, 60), rate=40, size=(0.004, 0.018), name='Bubbles',
                   up_speed=0.6, spread=0.05, lifetime=90, seed=0):
    """Particle bubbles rising (negative gravity) with Brownian wobble."""
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.02, location=(0, 0, 0))
    em = bpy.context.object; em.name = name + '_emit'
    _link(em, 'FX')
    if bone:
        em.parent = parent; em.parent_type = 'BONE'; em.parent_bone = bone; em.location = offset
    else:
        em.parent = parent; em.location = offset
    em.show_instancer_for_render = False   # hide the emitter mesh, keep its particles
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1.0, location=(0, -200, -200))
    b = bpy.context.object; b.name = name + '_inst'; _link(b, 'FX')
    b.data.materials.append(bubble_material())
    b.scale = (1, 1, 0.85)
    ps = em.modifiers.new(name, 'PARTICLE_SYSTEM').particle_system
    st = ps.settings
    st.count = int(rate * (frames[1] - frames[0]) / FPS)
    st.frame_start, st.frame_end = frames
    st.lifetime = lifetime; st.lifetime_random = 0.4
    st.emit_from = 'VOLUME'
    st.normal_factor = 0.0; st.object_align_factor[2] = up_speed; st.factor_random = spread * 10
    st.physics_type = 'NEWTON'; st.mass = 0.01
    st.effector_weights.gravity = -0.12
    st.brownian_factor = 0.25; st.drag_factor = 0.4; st.damping = 0.02
    st.render_type = 'OBJECT'; st.instance_object = b
    st.particle_size = (size[0] + size[1]) / 2; st.size_random = 0.8
    ps.seed = seed
    st.use_rotations = False
    return em, b

def marine_snow(cam, n=900, box=(5, 5, 8), seed=3):
    """Suspended particles drifting around the camera (GN points instancing tiny spheres)."""
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=1, location=(0, -300, -300))
    speck = bpy.context.object; speck.name = 'SnowSpeck'; _link(speck, 'FX')
    m = bpy.data.materials.new('Snow'); m.use_nodes = True
    nt = m.node_tree; b = nt.nodes['Principled BSDF']; b.inputs['Base Color'].default_value = (0.75, 0.85, 0.8, 1)
    b.inputs['Emission Color'].default_value = (0.4, 0.55, 0.55, 1); b.inputs['Emission Strength'].default_value = 0.4
    b.inputs['Roughness'].default_value = 0.8
    m.cycles.emission_sampling = 'NONE'
    speck.data.materials.append(m)
    me = bpy.data.meshes.new('snow_pts')
    rnd = np.random.default_rng(seed)
    pts = (rnd.random((n, 3)) - 0.5) * np.array(box)
    pts[:, 2] -= box[2] * 0.15
    me.vertices.add(n); me.vertices.foreach_set('co', pts.astype(np.float32).ravel())
    o = bpy.data.objects.new('MarineSnow', me); bpy.data.collections['FX'].objects.link(o)
    o.parent = cam; o.location = (0, 0, -box[2] * 0.5 + 0.3)   # in front of the camera (camera looks down -Z)
    g = bpy.data.node_groups.new('SnowGN', 'GeometryNodeTree')
    g.interface.new_socket('Geometry', in_out='INPUT', socket_type='NodeSocketGeometry')
    g.interface.new_socket('Geometry', in_out='OUTPUT', socket_type='NodeSocketGeometry')
    N = g.nodes; L = g.links
    gi = N.new('NodeGroupInput'); go = N.new('NodeGroupOutput')
    m2p = N.new('GeometryNodeMeshToPoints'); L.new(gi.outputs[0], m2p.inputs[0])
    t = N.new('GeometryNodeInputSceneTime')
    noise = N.new('ShaderNodeTexNoise'); noise.noise_dimensions = '4D'; noise.inputs['Scale'].default_value = 0.4
    L.new(t.outputs['Seconds'], noise.inputs['W'])
    vm = N.new('ShaderNodeVectorMath'); vm.operation = 'SUBTRACT'; L.new(noise.outputs['Color'], vm.inputs[0]); vm.inputs[1].default_value = (0.5, 0.5, 0.5)
    vs = N.new('ShaderNodeVectorMath'); vs.operation = 'SCALE'; vs.inputs['Scale'].default_value = 0.6; L.new(vm.outputs[0], vs.inputs[0])
    sp = N.new('GeometryNodeSetPosition'); L.new(m2p.outputs[0], sp.inputs['Geometry']); L.new(vs.outputs[0], sp.inputs['Offset'])
    inst = N.new('GeometryNodeInstanceOnPoints'); L.new(sp.outputs[0], inst.inputs['Points'])
    oi = N.new('GeometryNodeObjectInfo'); oi.inputs['Object'].default_value = speck; L.new(oi.outputs['Geometry'], inst.inputs['Instance'])
    rv = N.new('FunctionNodeRandomValue'); rv.inputs['Min'].default_value = 0.0015; rv.inputs['Max'].default_value = 0.006
    L.new(rv.outputs['Value'], inst.inputs['Scale'])
    L.new(inst.outputs[0], go.inputs[0])
    md = o.modifiers.new('snow', 'NODES'); md.node_group = g
    speck.hide_render = True
    return o

def underwater_camera_setup(sc, o, sun=None, volume_density=0.05, absorb_density=0.32):
    """Tune the shared water for a camera that is under the surface."""
    from env import set_volume
    for m in (o['mat'], o.get('volmat')):
        if m is None: continue
        N = m.node_tree.nodes
        if 'vol_scatter' in N: N['vol_scatter'].inputs['Density'].default_value = volume_density
        if 'vol_abs' in N: N['vol_abs'].inputs['Density'].default_value = absorb_density
    sc.cycles.volume_bounces = 1
    sc.cycles.volume_step_rate = 4.0
    sc.cycles.volume_max_steps = 64

# ------------------------------------------------------------------ helicopter
def load_helicopter(hub_z=3.3):
    """MH-65 (cm units -> m). Returns (root, main_rotor_object)."""
    objs = import_glb('mh65', 'Props')
    meshes = [o for o in objs if o.type == 'MESH']
    root = make_root(objs, 'MH65')
    root.scale = (0.01, 0.01, 0.01)
    bpy.context.view_layer.update()
    rot = separate_rotor(meshes, hub_z=hub_z)
    bpy.context.view_layer.update()
    if rot:
        mw = rot.matrix_world.copy(); rot.parent = root; rot.matrix_parent_inverse = root.matrix_world.inverted(); rot.matrix_world = mw
    return root, rot

def separate_rotor(meshes, hub_z=3.4):
    """Separate faces whose vertices are all above hub_z into one 'MainRotor' object pivoting at the hub."""
    import bmesh
    parts = []
    for o in meshes:
        mw = o.matrix_world
        me = o.data
        bm = bmesh.new(); bm.from_mesh(me)
        faces = [f for f in bm.faces if all((mw @ v.co).z > hub_z for v in f.verts)]
        if len(faces) < 10: bm.free(); continue
        nm = bpy.data.meshes.new(o.name + '_rotor')
        bm2 = bmesh.new()
        vmap = {}
        for f in faces:
            vs = []
            for v in f.verts:
                if v not in vmap: vmap[v] = bm2.verts.new(mw @ v.co)
                vs.append(vmap[v])
            try: bm2.faces.new(vs)
            except ValueError: pass
        bmesh.ops.delete(bm, geom=faces, context='FACES')
        bm.to_mesh(me); bm.free()
        bm2.to_mesh(nm); bm2.free()
        nm.materials.append(o.data.materials[0] if o.data.materials else None)
        parts.append(nm)
    if not parts: return None
    objs = []
    for nm in parts:
        ob = bpy.data.objects.new(nm.name, nm); bpy.data.collections['Props'].objects.link(ob); objs.append(ob)
    bpy.ops.object.select_all(action='DESELECT')
    for ob in objs: ob.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1: bpy.ops.object.join()
    rot = bpy.context.view_layer.objects.active; rot.name = 'MainRotor'
    # pivot at hub: centre of the rotor bbox in XY, lowest point in Z
    bb = [rot.matrix_world @ Vector(c) for c in rot.bound_box]
    hub = Vector(((min(v.x for v in bb) + max(v.x for v in bb)) / 2, (min(v.y for v in bb) + max(v.y for v in bb)) / 2, min(v.z for v in bb)))
    rot.data.transform(Matrix.Translation(-hub)); rot.location = hub
    return rot

def god_rays(sun_dir, center=(0, 0, 0), count=14, radius=6.0, length=14.0, strength=0.35, seed=5, color=(0.55, 0.85, 0.95), avoid=None, avoid_r=2.5):
    """Cheap volumetric-looking light shafts: soft emissive cards hanging from the surface along the sun direction,
    each fading with depth and across its width, swaying and flickering over time."""
    rnd = random.Random(seed)
    d = -Vector(sun_dir).normalized()            # direction light travels (downward)
    if d.z > -0.2: d = Vector((d.x, d.y, -0.8)).normalized()
    m = bpy.data.materials.new('GodRay'); m.use_nodes = True
    nt = m.node_tree; N = nt.nodes; L = nt.links; N.clear()
    out = N.new('ShaderNodeOutputMaterial')
    uv = N.new('ShaderNodeTexCoord')
    sep = N.new('ShaderNodeSeparateXYZ'); L.new(uv.outputs['UV'], sep.inputs[0])
    # across-width falloff (U) * along-length fade (V: 1 at surface -> 0 deep)
    g1 = N.new('ShaderNodeMath'); g1.operation = 'SUBTRACT'; g1.inputs[0].default_value = 0.5; L.new(sep.outputs['X'], g1.inputs[1])
    g2 = N.new('ShaderNodeMath'); g2.operation = 'ABSOLUTE'; L.new(g1.outputs[0], g2.inputs[0])
    g3 = N.new('ShaderNodeMapRange'); g3.inputs['From Min'].default_value = 0.5; g3.inputs['From Max'].default_value = 0.05; L.new(g2.outputs[0], g3.inputs['Value'])
    g3.interpolation_type = 'SMOOTHSTEP'
    vs_ = N.new('ShaderNodeMath'); vs_.operation = 'MULTIPLY'; L.new(sep.outputs['Y'], vs_.inputs[0]); vs_.inputs[1].default_value = 3.14159
    vsn = N.new('ShaderNodeMath'); vsn.operation = 'SINE'; L.new(vs_.outputs[0], vsn.inputs[0])
    vp = N.new('ShaderNodeMath'); vp.operation = 'POWER'; L.new(sep.outputs['Y'], vp.inputs[0]); vp.inputs[1].default_value = 1.2
    v1 = N.new('ShaderNodeMath'); v1.operation = 'MULTIPLY'; L.new(vsn.outputs[0], v1.inputs[0]); L.new(vp.outputs[0], v1.inputs[1])
    mul = N.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'; L.new(g3.outputs[0], mul.inputs[0]); L.new(v1.outputs[0], mul.inputs[1])
    att = N.new('ShaderNodeAttribute'); att.attribute_type = 'OBJECT'; att.attribute_name = 'ray_strength'
    mul2 = N.new('ShaderNodeMath'); mul2.operation = 'MULTIPLY'; L.new(mul.outputs[0], mul2.inputs[0]); L.new(att.outputs['Fac'], mul2.inputs[1])
    em = N.new('ShaderNodeEmission'); em.inputs['Color'].default_value = (*color, 1); L.new(mul2.outputs[0], em.inputs['Strength'])
    tr = N.new('ShaderNodeBsdfTransparent')
    ad = N.new('ShaderNodeAddShader'); L.new(tr.outputs[0], ad.inputs[0]); L.new(em.outputs[0], ad.inputs[1])
    lp = N.new('ShaderNodeLightPath')
    mx = N.new('ShaderNodeMixShader'); L.new(lp.outputs['Is Camera Ray'], mx.inputs[0]); L.new(tr.outputs[0], mx.inputs[1]); L.new(ad.outputs[0], mx.inputs[2])
    L.new(mx.outputs[0], out.inputs[0])
    m.cycles.emission_sampling = 'NONE'
    rays = []
    sc = bpy.context.scene
    for i in range(count):
        w = rnd.uniform(0.5, 1.8)
        bpy.ops.mesh.primitive_plane_add(size=1)
        p = bpy.context.object; p.name = 'GodRay%02d' % i; _link(p, 'FX')
        # plane in local XY: X = width, Y = length (V=1 at top)
        p.data.transform(Matrix.Translation((0, -0.5, 0)))
        p.scale = (w, length, 1)
        for _try in range(30):
            top = Vector(center) + Vector((rnd.uniform(-radius, radius), rnd.uniform(-radius, radius), -0.05))
            if avoid is None: break
            # distance from the avoid point to the ray line
            a = Vector(avoid); dd = a - top; proj = dd.dot(d)
            if proj < 0 or (dd - d * proj).length > avoid_r: break
        p.location = top
        # orient: local -Y along light direction, face roughly toward the centre
        q = (-d).to_track_quat('Y', 'Z')
        p.rotation_mode = 'QUATERNION'; p.rotation_quaternion = q @ Quaternion((0, 1, 0), rnd.uniform(0, math.pi))
        p.data.materials.append(m)
        p.visible_shadow = False; p.visible_diffuse = False; p.visible_glossy = False; p.visible_transmission = False
        base = strength * rnd.uniform(0.4, 1.0)
        ph = rnd.uniform(0, 6.28)
        for f in range(sc.frame_start, sc.frame_end + 1, 4):
            t = f / FPS
            p['ray_strength'] = base * (0.55 + 0.45 * math.sin(t * rnd.uniform(0.6, 1.4) + ph)) ** 2
            p.keyframe_insert('["ray_strength"]', frame=f)
        rays.append(p)
    return rays

def fill_light(target=(0, 0, -3), loc=(0, -2, -7), energy=60.0, color=(0.45, 0.75, 0.85), size=4.0):
    ld = bpy.data.lights.new('UnderFill', 'AREA'); ld.energy = energy; ld.color = color; ld.size = size
    o = bpy.data.objects.new('UnderFill', ld); bpy.data.collections['Lights'].objects.link(o)
    o.location = loc
    o.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    o.visible_camera = False
    return o
