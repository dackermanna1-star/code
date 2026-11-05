"""SH03 - "...and one gasp underwater can drown you."
Water-level close-up: his head bursts up through the surface, mouth wide in a huge gasp, coughing,
water streaming off his face, blinking it out of his eyes, hyperventilating."""
from common import *
import marine

def build():
    sc, c, o, sun = setup('SH03', res=(648, 1152), tod='day', ocean='moderate', water_mode='clear', vignette=0.32)
    N = sc.frame_end   # 120
    c.condition(wet=1.0)
    # head rises out of the water (pivot depth) then settles into treading
    def depth(f):
        if f < 14: return -0.85 + 0.75 * ease_out((f - 1) / 13)   # burst up
        return -0.10 - 0.12 * ease((f - 14) / 20)              # sink back to treading depth
    c.add(ch.tread_water(c, 1, N, speed=1.3, effort=1.3))
    c.add(ch.micro_head(seed=7, amp=3.0, freq=0.8))
    # gasp: head thrown back on the inhale, then two coughs jerk it forward
    c.add(KeyPoses([(1, {'neck01': [('X', -20)], 'head': [('X', -18)], 'spine02': [('X', -8)]}),
                    (16, {'neck01': [('X', -14)], 'head': [('X', -22)], 'spine02': [('X', -10)]}, ease_out),
                    (30, {'neck01': [('X', -4)], 'head': [('X', -6)], 'spine02': [('X', 0)]}),
                    (38, {'neck01': [('X', 10)], 'head': [('X', 14)], 'spine02': [('X', 10)]}, ease_out),   # cough 1
                    (46, {'neck01': [('X', -2)], 'head': [('X', -4)], 'spine02': [('X', 2)]}),
                    (54, {'neck01': [('X', 9)], 'head': [('X', 12)], 'spine02': [('X', 8)]}, ease_out),     # cough 2
                    (66, {'neck01': [('X', -3)], 'head': [('X', -5)], 'spine02': [('X', 0)]}),
                    (120, {'neck01': [('X', -2)], 'head': [('X', -4)]})]))
    c.add(ch.breathing(rate_bpm=48, depth=1.8, gasp_frames=((12, 26, 3.5), (68, 80, 1.5), (90, 100, 1.5))))
    c.add(ch.look(ch.saccades(seed=3, spread=10, hold=(8, 20))))
    c.add_face(expression([(1, {'eyeBlinkLeft': 1, 'eyeBlinkRight': 1, 'mouthPressLeft': 0.6, 'mouthPressRight': 0.6, 'cheekPuff': 0.4}),
                           (12, face('gasp')), (24, face('gasp', 1.0)),
                           (34, face('cough')), (42, face('gasp', 0.6)), (50, face('cough')), (60, face('fear', 0.9)),
                           (120, face('fear', 0.8))]))
    c.add_face(ch.blinks(seed=5, stressed=True, mean_gap=1.6))
    c.add_face(lambda f: {'jawOpen': 0.15 * max(0, math.sin(f * 0.75)) if f > 66 else 0.0})
    c.pivot_fn = lambda f: (Vector((0, 0, depth(f) + (ch.tread_bob(f, 1.3, 0.04) if f > 20 else 0))), compose(R('X', 6), R('Z', 22)))
    probe = finish(c, o, N, inertia=(0.3, 0.55))
    # splash of droplets as the head breaks through + strong ring ripples
    em, b = marine.bubble_emitter(c.rig, bone='head', offset=(0, 0.05, 0), frames=(9, 16), rate=900, size=(0.006, 0.02),
                                  name='Splash', up_speed=2.6, spread=0.5, lifetime=40, seed=4)
    st = em.particle_systems[0].settings
    st.effector_weights.gravity = 1.0; st.brownian_factor = 0.0; st.drag_factor = 0.05
    st.object_align_factor[2] = 2.2; st.factor_random = 1.4
    b.data.materials.clear(); b.data.materials.append(water_drop_material())
    ra = o['mat'].node_tree.nodes['ripple_amp']; ra.outputs[0].default_value = 2.5
    o['mat'].node_tree.nodes['collar_foam'].outputs[0].default_value = 0.9
    # camera: very close at water level, aimed at an empty that rides with him (not his jerking head)
    cam = env.add_camera('Cam', lens=50, dof={'fstop': 2.2})
    aimt = cam_target(c.root, (0, 0, 0.2)); env.aim(cam, aimt)
    cam.data.dof.focus_object = cam_target(c.rig, (0, 0, 0), bone='head')
    for f in range(1, N + 1, 3):
        k = ease((f - 1) / (N - 1))
        env.key_loc(cam, f, Vector((0.62 - 0.12 * k, -1.45 + 0.12 * k, 0.16)), lens=50)
    ch.ride_swell(cam, probe, 1, N, amount=0.9, min_clear=0.12)
    env.handheld(cam, amp_loc=0.012, amp_rot=0.008, freq=0.8, seed=3)
    return sc

def water_drop_material():
    if 'Droplet' in bpy.data.materials: return bpy.data.materials['Droplet']
    m = bpy.data.materials.new('Droplet'); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (0.8, 0.9, 1.0, 1); b.inputs['Roughness'].default_value = 0.02
    b.inputs['Transmission Weight'].default_value = 1.0; b.inputs['IOR'].default_value = 1.33
    return m
