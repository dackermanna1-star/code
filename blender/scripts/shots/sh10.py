"""SH10 - "It buys you time." Underwater, looking up: his floating star silhouette against the bright surface."""
from common import *
import marine

def build():
    sc, c, o, sun = setup('SH10', tod='day', ocean='calm', water_mode='under', grade='under', vignette=0.4)
    N = sc.frame_end   # 57
    c.condition(wet=1.0, fatigue=0.35)
    marine.underwater_camera_setup(sc, o, sun)
    c.add(ch.float_back(c)); c.add(ch.breathing(rate_bpm=12, depth=1.0))
    c.pivot_fn = lambda f: (Vector((0, 0.15, -0.11)), compose(R('X', -78), R('Z', 30)))
    probe = finish(c, o, N, inertia=(0.22, 0.6), radius=1.0)
    cam = env.add_camera('Cam', lens=18)
    aimt = cam_target(c.root, (0, 0.2, 0)); env.aim(cam, aimt)
    for f in range(1, N + 1, 3):
        k = ease((f - 1) / (N - 1))
        env.key_loc(cam, f, Vector((0.6 - 0.2 * k, -0.9 + 0.3 * k, -2.3 + 0.3 * k)))
    env.handheld(cam, amp_loc=0.015, amp_rot=0.004, freq=0.3, seed=10)
    marine.marine_snow(cam, n=600)
    marine.god_rays(sun['dir'], count=16, radius=6.0, length=12.0, strength=0.34, avoid=(0.5, -0.8, -2.2), avoid_r=1.8)
    marine.fill_light(target=(0, 0, -0.3), loc=(0.8, -1.5, -5.5), energy=260)
    return sc
