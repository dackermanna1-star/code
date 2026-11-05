"""Shared shot setup helpers."""
import sys, json, math, os
sys.path.insert(0, '/home/user/code/blender/scripts/lib')
import bpy
import env, char as ch
from mathutils import Vector, Quaternion, Euler

SHOTS = {s[0]: s for s in json.load(open('/home/user/code/story/shots.json'))['shots']}

def frames_of(shot_id):
    s = SHOTS[shot_id]
    return int(round((s[2] - s[1]) * 30))

TOD = {
    # time-of-day presets: hdri, rotation, sun strength, haze colour, grade
    'day':      dict(hdri='kloofendal_48d_partly_cloudy_puresky', rot=0.0, sun=4.0, haze=(0.62, 0.72, 0.82), grade='day', strength=1.0),
    'morning':  dict(hdri='qwantani_morning_puresky', rot=0.0, sun=3.5, haze=(0.66, 0.74, 0.82), grade='day', strength=1.0),
    'noon':     dict(hdri='qwantani_noon_puresky', rot=0.0, sun=5.0, haze=(0.7, 0.78, 0.86), grade='harsh', strength=1.0),
    'afternoon':dict(hdri='qwantani_afternoon_puresky', rot=0.0, sun=4.5, haze=(0.68, 0.76, 0.84), grade='harsh', strength=1.0),
    'late':     dict(hdri='qwantani_late_afternoon_puresky', rot=0.0, sun=4.0, haze=(0.75, 0.72, 0.68), grade='golden', strength=1.0),
    'sunset':   dict(hdri='belfast_sunset_puresky', rot=0.0, sun=3.0, haze=(0.85, 0.6, 0.42), grade='sunset', strength=1.0),
    'dusk':     dict(hdri='qwantani_dusk_2_puresky', rot=0.0, sun=0.6, haze=(0.36, 0.38, 0.5), grade='dusk', strength=1.0),
    'night':    dict(hdri='qwantani_night_puresky', rot=0.0, sun=0.0, haze=(0.03, 0.045, 0.08), grade='night', strength=1.0),
    'overcast': dict(hdri='kloofendal_overcast_puresky', rot=0.0, sun=0.0, haze=(0.62, 0.65, 0.68), grade='overcast', strength=1.0),
    'misty':    dict(hdri='kloofendal_misty_morning_puresky', rot=0.0, sun=1.2, haze=(0.72, 0.74, 0.76), grade='overcast', strength=1.0),
    'golden':   dict(hdri='kloppenheim_06_puresky', rot=0.0, sun=3.0, haze=(0.85, 0.68, 0.5), grade='golden', strength=1.0),
}

def setup(shot_id, tod='day', ocean='moderate', water_mode='clear', res=(576, 1024), samples=6, with_char=True,
          sun_rot=None, sun_toward=None, ocean_kw=None, water_kw=None, grade=None, seed=7, time_offset=0.0, vignette=0.3, world_kw=None, half=1500.0):
    n = frames_of(shot_id)
    # day-1 shots (SH01-SH15) were rendered with the legacy (azimuth-inverted) sun mapping: keep them consistent
    env.LEGACY_SUN_AZIMUTH = shot_id in ('SH01','SH02','SH03','SH04','SH05','SH06','SH07','SH08','SH09','SH10','SH11','SH12','SH13','SH14','SH15')
    sc = env.new_scene(res=res, frames=(1, n))
    sc.cycles.samples = samples
    sc['shot'] = shot_id
    p = dict(TOD[tod])
    if sun_rot is not None: p['rot'] = sun_rot
    if sun_toward is not None:
        s_ = env.hdri_sun(env.HDRI_DIR + '/' + p['hdri'] + '_4k.hdr')
        d0 = env.sun_vector(s_['u'], 0.0)
        p['rot'] = math.atan2(sun_toward[1], sun_toward[0]) - math.atan2(d0.y, d0.x)
    c = ch.Castaway() if with_char else None
    o = env.make_ocean(ocean, mode=water_mode, seed=seed, fx_empty=(c.fx if c else None), haze_color=p['haze'],
                       time_offset=time_offset, water_kw=water_kw, half=half, **(ocean_kw or {}))
    wk = dict(rot_z=p['rot'], strength=p['strength'], sun_strength=p['sun'], add_sun=p['sun'] > 0)
    wk.update(world_kw or {})
    w, sun = env.make_world(p['hdri'], **wk)
    env.setup_compositor(grade or p['grade'], vignette=vignette)
    if water_mode == 'under':
        sc.cycles.transmission_bounces = 3; sc.cycles.transparent_max_bounces = 6; sc.cycles.max_bounces = 4
        sc.cycles.glossy_bounces = 2
    return sc, c, o, sun

def sun_az(sun):
    d = Vector(sun['dir'])
    return math.atan2(d.y, d.x)

from char import R, compose, KeyPoses, ease, ease_in, ease_out, face, expression

def cam_target(parent=None, loc=(0, 0, 0), bone=None):
    t = bpy.data.objects.new('CamTarget', None); bpy.data.collections['Cameras'].objects.link(t)
    if parent is not None:
        t.parent = parent
        if bone: t.parent_type = 'BONE'; t.parent_bone = bone
    t.location = loc
    return t

def tread_in_place(c, o, N, depth=-0.24, speed=1.0, effort=1.0, yaw=0.0, lean=8.0, breath_bpm=22, breath_depth=1.0,
                   seed=1, xy_fn=None, yaw_fn=None, head_seed=3):
    c.add(ch.tread_water(c, 1, N, speed=speed, effort=effort))
    c.add(ch.breathing(rate_bpm=breath_bpm, depth=breath_depth))
    c.add(ch.micro_head(seed=head_seed, amp=2.0))
    def pivot(f):
        yw = yaw_fn(f) if yaw_fn else yaw
        return (Vector((0, 0, depth + ch.tread_bob(f, speed, 0.035 * effort))), compose(R('X', lean), R('Z', yw)))
    c.pivot_fn = pivot
    probe = ch.OceanProbe(o['ocean'])
    return probe

def finish(c, o, N, probe=None, xy_fn=lambda f: (0.0, 0.0), inertia=(0.25, 0.55), radius=0.7, cond_fn=None):
    c.bake(1, N, cond_fn=cond_fn)
    probe = probe or ch.OceanProbe(o['ocean'])
    ch.apply_buoyancy(c, probe, 1, N, xy_fn=xy_fn, radius=radius, inertia=inertia)
    c.fx.location = (0, 0, 0)
    return probe

def droplets(c, bones=('wrist.L', 'wrist.R'), frames=(1, 100), rate=160, speed=1.6, size=(0.006, 0.02), seed=0):
    """Water thrown off the hands/arms: droplet particles from bone-parented emitters (gravity, short life)."""
    import marine
    mats = []
    for i, b in enumerate(bones):
        em, inst = marine.bubble_emitter(c.rig, bone=b, offset=(0, 0.05, 0), frames=frames, rate=rate, size=size,
                                         name='Drops_%s' % b.replace('.', '_'), up_speed=speed, spread=0.35, lifetime=28, seed=seed + i)
        st = em.particle_systems[0].settings
        st.effector_weights.gravity = 1.0; st.brownian_factor = 0.0; st.drag_factor = 0.02
        st.use_emit_random = True; st.normal_factor = 0.4
        inst.data.materials.clear(); inst.data.materials.append(drop_mat())
    return mats

def drop_mat():
    if 'Droplet' in bpy.data.materials: return bpy.data.materials['Droplet']
    m = bpy.data.materials.new('Droplet'); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (0.85, 0.92, 1.0, 1); b.inputs['Roughness'].default_value = 0.03
    b.inputs['Transmission Weight'].default_value = 1.0; b.inputs['IOR'].default_value = 1.33
    return m

def glow_particles(c, bones, frames, rate=300, color=(0.2, 0.85, 1.0), strength=32.0, life=45, size=(0.004, 0.01), seed=0):
    """Bioluminescent plankton: points left behind where the body moves, flaring then fading with particle age."""
    import marine
    m = bpy.data.materials.get('Biolum')
    if m is None:
        m = bpy.data.materials.new('Biolum'); m.use_nodes = True
        nt = m.node_tree; N_ = nt.nodes; L_ = nt.links; N_.clear()
        out = N_.new('ShaderNodeOutputMaterial'); pi = N_.new('ShaderNodeParticleInfo')
        dv = N_.new('ShaderNodeMath'); dv.operation = 'DIVIDE'; L_.new(pi.outputs['Age'], dv.inputs[0]); L_.new(pi.outputs['Lifetime'], dv.inputs[1])
        inv = N_.new('ShaderNodeMath'); inv.operation = 'SUBTRACT'; inv.inputs[0].default_value = 1.0; L_.new(dv.outputs[0], inv.inputs[1]); inv.use_clamp = True
        pw = N_.new('ShaderNodeMath'); pw.operation = 'POWER'; L_.new(inv.outputs[0], pw.inputs[0]); pw.inputs[1].default_value = 2.5
        st = N_.new('ShaderNodeMath'); st.operation = 'MULTIPLY'; L_.new(pw.outputs[0], st.inputs[0]); st.inputs[1].default_value = strength
        em = N_.new('ShaderNodeEmission'); em.inputs['Color'].default_value = (*color, 1); L_.new(st.outputs[0], em.inputs['Strength'])
        L_.new(em.outputs[0], out.inputs['Surface'])
        m.cycles.emission_sampling = 'NONE'
    for i, b in enumerate(bones):
        em_, inst = marine.bubble_emitter(c.rig, bone=b, offset=(0, 0.05, 0), frames=frames, rate=rate, size=size,
                                          name='Glow_%s' % b.replace('.', '_'), up_speed=0.0, spread=0.25, lifetime=life, seed=seed + i)
        s_ = em_.particle_systems[0].settings
        s_.effector_weights.gravity = 0.0; s_.brownian_factor = 0.05; s_.drag_factor = 0.9; s_.normal_factor = 0.0; s_.factor_random = 0.15
        s_.lifetime_random = 0.5
        inst.data.materials.clear(); inst.data.materials.append(m)

def rain(cam, area=14.0, height=7.0, rate=9000, frames=(1, 200), seed=0):
    """3D rain streaks falling around the camera."""
    bpy.ops.mesh.primitive_plane_add(size=area, location=(0, 0, 0))
    em = bpy.context.object; em.name = 'RainEmitter'; env.link(em, 'FX')
    em.parent = cam; em.location = (0, height * 0.4, -area * 0.45); em.rotation_euler = (math.radians(-90), 0, 0)
    em.show_instancer_for_render = False
    bpy.ops.mesh.primitive_cylinder_add(vertices=5, radius=0.0012, depth=0.22, location=(0, -300, -300))
    drop = bpy.context.object; drop.name = 'RainDrop'; env.link(drop, 'FX')
    m = bpy.data.materials.new('Rain'); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']; b.inputs['Base Color'].default_value = (0.8, 0.85, 0.9, 1)
    b.inputs['Roughness'].default_value = 0.1; b.inputs['Alpha'].default_value = 0.35
    drop.data.materials.append(m)
    ps = em.modifiers.new('rain', 'PARTICLE_SYSTEM').particle_system; st = ps.settings
    st.count = int(rate * (frames[1] - frames[0] + 30) / 30); st.frame_start = frames[0] - 30; st.frame_end = frames[1]
    st.lifetime = 40; st.emit_from = 'FACE'; st.normal_factor = 0.0
    st.object_align_factor = (0.4, 0, -9.0)
    st.effector_weights.gravity = 0.0; st.render_type = 'OBJECT'; st.instance_object = drop
    st.use_rotations = True; st.rotation_mode = 'VEL'; st.particle_size = 1.0
    ps.seed = seed
    drop.rotation_euler = (0, math.radians(90), 0)
    return em

def rain_ripples(mat, strength=0.6, scale=3.0, rate=1.6):
    """Add expanding raindrop rings to a water material (bump on top of its normal)."""
    nt = mat.node_tree; N_ = nt.nodes; L_ = nt.links
    bsdf = N_['water_bsdf']; src = bsdf.inputs['Normal'].links[0].from_socket
    tc = N_.new('ShaderNodeTexCoord'); vor = N_.new('ShaderNodeTexVoronoi'); vor.inputs['Scale'].default_value = scale
    L_.new(tc.outputs['Object'], vor.inputs['Vector'])
    t = N_['time'].outputs[0]
    sep = N_.new('ShaderNodeSeparateColor'); L_.new(vor.outputs['Color'], sep.inputs[0])
    def mth(op, a, b_=None):
        n = N_.new('ShaderNodeMath'); n.operation = op
        for i, x in enumerate((a, b_)):
            if x is None: continue
            if isinstance(x, (int, float)): n.inputs[i].default_value = x
            else: L_.new(x, n.inputs[i])
        return n.outputs[0]
    ph = mth('FRACT', mth('ADD', mth('MULTIPLY', t, rate), mth('MULTIPLY', sep.outputs[0], 7.0)))
    radius = mth('MULTIPLY', ph, 0.42)
    d = mth('SUBTRACT', vor.outputs['Distance'], radius)
    ring = mth('EXPONENT', mth('MULTIPLY', mth('MULTIPLY', d, d), -900.0))
    h = mth('MULTIPLY', ring, mth('SUBTRACT', 1.0, ph))
    bump = N_.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = strength; bump.inputs['Distance'].default_value = 0.01
    L_.new(h, bump.inputs['Height']); L_.new(src, bump.inputs['Normal'])
    for nm in ('water_bsdf', 'foam_bsdf'):
        L_.new(bump.outputs['Normal'], N_[nm].inputs['Normal'])
