"""SH13 - "Soon, you're desperately thirsty. But seawater is about three and a half percent salt."
He swallows dryly, stares at the water, cups his hands, lifts seawater to his cracked lips, sips - grimaces,
spits it out and coughs."""
from common import *

def build():
    sc, c, o, sun = setup('SH13', res=(648, 1152), tod='afternoon', ocean='calm', water_mode='clear', vignette=0.35, sun_toward=(0.9, -0.6))
    N = sc.frame_end   # 162
    c.condition(wet=0.85, fatigue=0.45, sunburn=0.42, salt=0.25)
    c.add(ch.weight(ch.tread_water(c, 1, N, speed=0.75, effort=0.6), lambda f: 1 - ease((f - 26) / 14) * (1 - ease((f - 112) / 16))))
    c.add(ch.breathing(rate_bpm=18, depth=1.0))
    cw = lambda f: ease((f - 22) / 14) * (1 - ease((f - 108) / 18))
    cup = ch.KeyPoses([(1, ch.cup_ik(c, 0.0)), (50, ch.cup_ik(c, 0.0)), (72, ch.cup_ik(c, 1.0), ch.ease_out), (96, ch.cup_ik(c, 1.0)),
                       (110, ch.cup_ik(c, 0.35))])
    c.add(ch.weight(cup, cw))
    c.add(KeyPoses([(1, {'neck01': [('X', 4)], 'head': [('X', 4)]}), (22, {'neck01': [('X', 14)], 'head': [('X', 16)]}),   # looks down at the water
                    (50, {'neck01': [('X', 10)], 'head': [('X', 12)]}), (74, {'neck01': [('X', 8)], 'head': [('X', 10)]}),
                    (86, {'neck01': [('X', 2)], 'head': [('X', -6)]}),       # sip: head tips back slightly
                    (100, {'neck01': [('X', 6)], 'head': [('X', 4), ('Z', -12)]}),   # recoil, turn away
                    (112, {'neck01': [('X', 16)], 'head': [('X', 18), ('Z', 18)]}, ch.ease_out),   # spit to the side
                    (122, {'neck01': [('X', 12)], 'head': [('X', 16)]}), (130, {'neck01': [('X', 4)], 'head': [('X', 4)]}),
                    (138, {'neck01': [('X', 12)], 'head': [('X', 14)]}, ch.ease_out),   # cough
                    (162, {'neck01': [('X', 4)], 'head': [('X', 3)]})]))
    c.add(ch.look(lambda f: (0, 25) if f < 80 else (0, 8)))
    c.add_face(expression([(1, face('thirsty')), (14, dict(face('thirsty'), jawOpen=0.0, mouthClose=0.3, mouthRollLower=0.5)),   # dry swallow
                           (20, face('thirsty')), (70, dict(face('thirsty'), jawOpen=0.12)),
                           (82, {'jawOpen': 0.22, 'mouthFunnel': 0.35, 'eyeBlinkLeft': 0.5, 'eyeBlinkRight': 0.5}),    # sip
                           (96, face('disgust')), (106, face('disgust', 1.0)), (112, face('spit')), (118, dict(face('disgust', 0.8), jawOpen=0.3)),
                           (138, face('cough')), (148, face('disgust', 0.6)), (162, dict(face('thirsty'), browInnerUp=0.8))]))
    c.add_face(ch.blinks(seed=21, mean_gap=3.0))
    c.pivot_fn = lambda f: (Vector((0, 0, -0.19 + ch.tread_bob(f, 0.75, 0.02))), compose(R('X', 5), R('Z', 22)))
    probe = finish(c, o, N, inertia=(0.25, 0.55))
    droplets(c, frames=(74, 100), rate=60, speed=0.2, size=(0.004, 0.012))      # water dribbling from the hands
    import marine
    em, inst = marine.bubble_emitter(c.rig, bone='head', offset=(0, 0.11, -0.12), frames=(111, 116), rate=900, size=(0.003, 0.01),
                                     name='Spit', up_speed=1.2, spread=0.4, lifetime=24, seed=31)
    st = em.particle_systems[0].settings; st.effector_weights.gravity = 1.0; st.brownian_factor = 0.0
    inst.data.materials.clear(); inst.data.materials.append(drop_mat())
    o['mat'].node_tree.nodes['collar_foam'].outputs[0].default_value = 0.3
    cam = env.add_camera('Cam', lens=52, dof={'fstop': 2.4})
    cam.data.dof.focus_object = cam_target(c.rig, (0, 0, 0), bone='head')
    aimt = cam_target(c.root, (0, -0.05, 0.3)); env.aim(cam, aimt)
    for f in range(1, N + 1, 3):
        k = ease((f - 1) / (N - 1))
        env.key_loc(cam, f, Vector((0.55 - 0.1 * k, -1.25 + 0.12 * k, 0.28)))
    ch.ride_swell(cam, probe, 1, N, amount=0.9, min_clear=0.15)
    env.handheld(cam, amp_loc=0.008, amp_rot=0.005, freq=0.6, seed=13)
    return sc
