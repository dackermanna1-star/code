"""SH19 - "Even warm water is colder than your body, and it drains your heat far faster than air."
Dusk, medium: the light has gone blue; he hugs his arms to his chest, shivering, legs barely kicking."""
from common import *

def build():
    sc, c, o, sun = setup('SH19', tod='dusk', ocean='calm', water_mode='clear', vignette=0.42, sun_toward=(0.8, -0.6))
    N = sc.frame_end   # 117
    c.condition(wet=1.0, fatigue=0.6, sunburn=0.5, salt=0.35)
    tw = ch.tread_water(c, 1, N, speed=0.7, effort=0.4)
    c.add(lambda f: {k: v for k, v in tw(f).items() if 'leg' in k or 'foot' in k or k.startswith('spine')})
    c.add(KeyPoses([(1, ch.hug_shiver_pose()), (N, ch.hug_shiver_pose())]))
    c.add(lambda f: {'neck01': R('X', -12), 'head': R('X', -8)})
    c.add(ch.shiver(lambda f: 0.6 + 0.4 * ease(f / N), seed=19))
    c.add(ch.breathing(rate_bpm=26, depth=1.2))
    c.add(ch.micro_head(seed=19, amp=1.5))
    c.add_face(lambda f: face('cold', 0.7 + 0.3 * f / N))
    c.add_face(ch.blinks(seed=19, mean_gap=2.2))
    c.pivot_fn = lambda f: (Vector((0, 0, -0.09 + 0.012 * math.sin(f * 0.12))), compose(R('X', 6), R('Z', 25)))
    probe = finish(c, o, N, inertia=(0.25, 0.55), cond_fn=lambda f: {'cold': 0.35 + 0.45 * f / N})
    o['mat'].node_tree.nodes['collar_foam'].outputs[0].default_value = 0.25
    cam = env.add_camera('Cam', lens=42, dof={'fstop': 2.4})
    cam.data.dof.focus_object = cam_target(c.rig, (0, 0, 0), bone='eye.L')
    aimt = cam_target(c.root, (0, -0.05, 0.18)); env.aim(cam, aimt)
    for f in range(1, N + 1, 3):
        k = ease((f - 1) / (N - 1))
        env.key_loc(cam, f, Vector((0.9 - 0.25 * k, -1.8 + 0.35 * k, 0.42)))
    ch.ride_swell(cam, probe, 1, N, amount=0.85, min_clear=0.2)
    env.handheld(cam, amp_loc=0.008, amp_rot=0.004, freq=0.5, seed=19)
    return sc
