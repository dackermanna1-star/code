"""SH17 - "Bites are rare, but..." Above water, tight: he freezes. Eyes drop to the water, breath held, the
sculling hands slow to almost nothing."""
from common import *

def build():
    sc, c, o, sun = setup('SH17', res=(648, 1152), tod='afternoon', ocean='calm', water_mode='clear', vignette=0.42, sun_toward=(0.9, -0.6))
    N = sc.frame_end   # 60
    c.condition(wet=0.9, fatigue=0.5, sunburn=0.45, salt=0.3)
    c.add(ch.tread_water(c, 1, N, speed=0.45, effort=0.25))
    c.add(ch.breathing(rate_bpm=10, depth=0.4))
    c.add(KeyPoses([(1, {'neck01': [('X', 4)], 'head': [('X', 2)]}), (14, {'neck01': [('X', 10)], 'head': [('X', 12), ('Z', -6)]}, ease_out),
                    (60, {'neck01': [('X', 11)], 'head': [('X', 13), ('Z', -4)]})]))
    c.add(ch.look(lambda f: (-6 if f > 10 else 0, 18 if f > 8 else 5)))
    c.add_face(expression([(1, face('alarm', 0.6)), (12, dict(face('fear', 0.8), jawOpen=0.0, mouthPressLeft=0.6, mouthPressRight=0.6,
                                                             noseSneerLeft=0.15, noseSneerRight=0.15, eyeWideLeft=0.75, eyeWideRight=0.75)),
                           (60, dict(face('fear', 0.85), jawOpen=0.0, mouthPressLeft=0.7, mouthPressRight=0.7, eyeWideLeft=0.8, eyeWideRight=0.8))]))
    c.pivot_fn = lambda f: (Vector((0, 0, -0.2)), compose(R('X', 4), R('Z', 22)))
    probe = finish(c, o, N, inertia=(0.25, 0.55))
    o['mat'].node_tree.nodes['collar_foam'].outputs[0].default_value = 0.25
    cam = env.add_camera('Cam', lens=70, dof={'fstop': 2.0})
    cam.data.dof.focus_object = cam_target(c.rig, (0, 0, 0), bone='eye.L')
    aimt = cam_target(c.root, (0.0, -0.06, 0.2)); env.aim(cam, aimt)
    for f in range(1, N + 1, 3):
        k = ease((f - 1) / (N - 1))
        env.key_loc(cam, f, Vector((0.62 - 0.12 * k, -1.35 + 0.25 * k, 0.13)))
    ch.ride_swell(cam, probe, 1, N, amount=0.92, min_clear=0.1)
    env.handheld(cam, amp_loc=0.004, amp_rot=0.003, freq=0.4, seed=17)
    return sc
