"""SH11 - "Hours pass." Locked-off time-lapse at water level: sky cross-fades morning -> noon, sun sweeps up,
cloud shadows and light change, the sea churns fast; he floats, small, in the lower frame."""
from common import *

def two_sky(h1, h2, f0, f1, strength=1.0, clamp=12.0):
    sc = bpy.context.scene
    w = bpy.data.worlds.new('SkyLapse'); sc.world = w; w.use_nodes = True
    nt = w.node_tree; N = nt.nodes; L = nt.links; N.clear()
    out = N.new('ShaderNodeOutputWorld'); tc = N.new('ShaderNodeTexCoord')
    envs = []
    for h in (h1, h2):
        e = N.new('ShaderNodeTexEnvironment'); e.image = bpy.data.images.load(env.HDRI_DIR + '/' + h + '_4k.hdr', check_existing=True)
        L.new(tc.outputs['Generated'], e.inputs['Vector']); envs.append(e)
    mix = N.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.name = 'lapse'
    L.new(envs[0].outputs['Color'], mix.inputs['A']); L.new(envs[1].outputs['Color'], mix.inputs['B'])
    mix.inputs['Factor'].default_value = 0.0; mix.inputs['Factor'].keyframe_insert('default_value', frame=f0)
    mix.inputs['Factor'].default_value = 1.0; mix.inputs['Factor'].keyframe_insert('default_value', frame=f1)
    sepc = N.new('ShaderNodeSeparateColor'); L.new(mix.outputs['Result'], sepc.inputs[0]); comb = N.new('ShaderNodeCombineColor')
    for i in range(3):
        mn = N.new('ShaderNodeMath'); mn.operation = 'MINIMUM'; mn.inputs[1].default_value = clamp
        L.new(sepc.outputs[i], mn.inputs[0]); L.new(mn.outputs[0], comb.inputs[i])
    bg = N.new('ShaderNodeBackground'); bg.name = 'bg'
    bg.inputs['Strength'].default_value = strength; bg.inputs['Strength'].keyframe_insert('default_value', frame=f0)
    bg.inputs['Strength'].default_value = strength * 1.6; bg.inputs['Strength'].keyframe_insert('default_value', frame=f1)
    L.new(comb.outputs[0], bg.inputs['Color']); L.new(bg.outputs[0], out.inputs['Surface'])
    return w

def build():
    env.LEGACY_SUN_AZIMUTH = True    # match the day-1 shots it sits between (SH10, SH12)
    sc, c, o, sun = setup('SH11', tod='day', ocean='glassy', water_mode='opaque', vignette=0.28, grade='day')
    N = sc.frame_end   # 96
    c.condition(wet=1.0, fatigue=0.35, sunburn=0.0)
    # time-lapse: everything runs ~8x
    for fc in (o['mod'].id_data.animation_data.drivers if o['mod'].id_data.animation_data else []):
        fc.driver.expression = '(frame/30)*8.0'
    for m in (o['mat'], o['farmat']):
        for fc in m.node_tree.animation_data.drivers:
            fc.driver.expression = '(frame/30)*8.0'
    s1 = env.hdri_sun(env.HDRI_DIR + '/kloofendal_48d_partly_cloudy_puresky_4k.hdr'); s2 = env.hdri_sun(env.HDRI_DIR + '/qwantani_noon_puresky_4k.hdr')
    two_sky('kloofendal_48d_partly_cloudy_puresky', 'qwantani_noon_puresky', 8, N - 8)   # forward in time: mid-morning -> noon
    def sdir(s):
        lon = (s['u'] - 0.5) * 2 * math.pi; lat = s['el']
        return Vector((-math.cos(lon) * math.cos(lat), math.sin(lon) * math.cos(lat), math.sin(lat)))
    d1, d2 = sdir(s1), sdir(s2)
    sun.rotation_mode = 'QUATERNION'
    for f in range(1, N + 1, 4):
        k = ease((f - 8) / (N - 16)) if 8 < f < N - 8 else (0 if f <= 8 else 1)
        d = d1.lerp(d2, k).normalized()
        sun.rotation_quaternion = (-d).to_track_quat('-Z', 'Y'); sun.keyframe_insert('rotation_quaternion', frame=f)
        sun.data.energy = 3.0 + 2.5 * k; sun.data.keyframe_insert('energy', frame=f)
    c.add(ch.float_back(c)); c.add(ch.breathing(rate_bpm=60, depth=0.8))
    c.add(lambda f: {'head': R('Z', 12 * ch.fbm(f / 30 * 3, 4, 0.8)), 'upperarm01.L': R('X', 6 * ch.fbm(f / 10, 5)), 'upperarm01.R': R('X', 6 * ch.fbm(f / 10, 6))})
    c.pivot_fn = lambda f: (Vector((0, 0.15, -0.03)), compose(R('X', -78), R('Z', 70 + 20 * f / N)))
    probe = finish(c, o, N, inertia=(1.0, 1.0), radius=1.3, cond_fn=lambda f: {'sunburn': 0.08 * f / N})   # 8x sea: body must track the surface
    o['mat'].node_tree.nodes['collar_foam'].outputs[0].default_value = 0.12
    cam = env.add_camera('Cam', lens=24)
    aimt = cam_target(None, (0, 0.6, 0.45)); env.aim(cam, aimt)
    env.key_loc(cam, 1, Vector((1.5, -4.2, 1.55)))
    ch.ride_swell(cam, probe, 1, N, amount=0.6, min_clear=1.1)
    return sc
