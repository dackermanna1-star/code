"""SH12 - "There's no shade, and the water bounces sunlight right back into your face."
Close-up from above his floating face: harsh noon sun, glare dancing off the water onto his skin, squinting,
he lifts a hand to shade his eyes; the sunburn creeps across his nose and cheeks."""
from common import *

def build():
    sc, c, o, sun = setup('SH12', res=(648, 1152), tod='noon', ocean='calm', water_mode='clear', vignette=0.35, water_kw={'near_transmission': 6.0}, world_kw={'sun_strength': 4.2, 'strength': 1.35}, grade='day')
    N = sc.frame_end   # 99
    c.condition(wet=0.9, fatigue=0.35, salt=0.15)
    c.add(ch.float_back(c, head_back=1.1)); c.add(ch.breathing(rate_bpm=14, depth=1.0))
    c.add(ch.micro_head(seed=12, amp=2.0))
    c.add(ch.look(lambda f: (4 * math.sin(f / 13.0), 6)))
    c.add_face(lambda f: face('squint', 0.9 + 0.1 * math.sin(f / 9.0)))
    c.add(lambda f: {'head': R('Z', 10 * math.sin(f / 25.0))})
    c.add_face(ch.blinks(seed=14, mean_gap=2.5))
    c.pivot_fn = lambda f: (Vector((0, 0.15, -0.09)), compose(R('X', -76), R('Z', 15)))
    probe = finish(c, o, N, inertia=(0.25, 0.6), radius=1.0, cond_fn=lambda f: {'sunburn': 0.08 + 0.32 * ease((f - 1) / (N - 1))})
    o['mat'].node_tree.nodes['collar_foam'].outputs[0].default_value = 0.15
    cam = env.add_camera('Cam', lens=50, dof={'fstop': 2.4})
    head = cam_target(c.rig, (0, 0, 0), bone='eye.L'); cam.data.dof.focus_object = head
    env.aim(cam, head)          # keep the face centred
    for f in range(1, N + 1, 3):
        k = ease((f - 1) / (N - 1))
        env.key_loc(cam, f, Vector((0.35 - 0.1 * k, 0.05 - 0.05 * k, 1.05 - 0.15 * k)))
    ch.ride_swell(cam, probe, 1, N, amount=0.9, min_clear=0.5)
    env.handheld(cam, amp_loc=0.006, amp_rot=0.004, freq=0.5, seed=12)
    return sc
