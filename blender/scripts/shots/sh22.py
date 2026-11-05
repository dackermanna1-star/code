"""SH22 - "By day two, thirst and exhaustion cloud your mind." Grey morning, rain hissing on a lumpy sea;
he floats limp, sunburnt and crusted with salt, eyes half shut."""
from common import *

def build():
    sc, c, o, sun = setup('SH22', tod='overcast', ocean='moderate', water_mode='clear', vignette=0.42, grade='overcast')
    N = sc.frame_end   # 108
    c.condition(wet=1.0, fatigue=0.85, sunburn=0.58, salt=0.6, cold=0.25)
    c.add(ch.float_back(c, spread=0.85, head_back=0.9)); c.add(ch.breathing(rate_bpm=16, depth=0.9))
    c.add(lambda f: {'head': R('Z', -14 + 8 * ch.fbm(f / 30, 22, 0.4))})
    c.add_face(lambda f: dict(face('exhausted', 1.0), eyeBlinkLeft=0.55, eyeBlinkRight=0.55))
    c.add_face(ch.blinks(seed=22, mean_gap=4.0))
    c.pivot_fn = lambda f: (Vector((0, 0.15, -0.1)), compose(R('X', -74), R('Z', 120)))
    probe = finish(c, o, N, inertia=(0.25, 0.55), radius=1.0)
    o['mat'].node_tree.nodes['collar_foam'].outputs[0].default_value = 0.15
    rain_ripples(o['mat'], strength=0.5)
    cam = env.add_camera('Cam', lens=35, dof={'fstop': 2.8})
    cam.data.dof.focus_object = cam_target(c.rig, (0, 0, 0), bone='head')
    aimt = cam_target(c.root, (0, 0.5, 0.05)); env.aim(cam, aimt)
    for f in range(1, N + 1, 3):
        k = ease((f - 1) / (N - 1))
        env.key_loc(cam, f, Vector((-1.4 + 0.2 * k, -0.6 + 0.3 * k, 0.75 - 0.1 * k)))
    ch.ride_swell(cam, probe, 1, N, amount=0.85, min_clear=0.3)
    env.handheld(cam, amp_loc=0.012, amp_rot=0.005, freq=0.5, seed=22)
    rain(cam, frames=(1, N))
    return sc
