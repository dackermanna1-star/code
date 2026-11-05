"""SH15 - "And you're not alone. Small fish shelter in your shadow."
Underwater looking up: juvenile trevally gather in the shade beneath his floating body, as fish do under any
drifting object in the open ocean."""
from common import *
import marine

def build():
    sc, c, o, sun = setup('SH15', tod='afternoon', ocean='calm', water_mode='under', grade='under', vignette=0.4, sun_toward=(0.6, 0.8))
    N = sc.frame_end   # 117
    c.condition(wet=1.0, fatigue=0.5, sunburn=0.45, salt=0.3)
    marine.underwater_camera_setup(sc, o, sun)
    c.add(ch.float_back(c)); c.add(ch.breathing(rate_bpm=14, depth=1.0))
    c.pivot_fn = lambda f: (Vector((0, 0.15, -0.11)), compose(R('X', -76), R('Z', 70)))
    probe = finish(c, o, N, inertia=(0.22, 0.6), radius=1.0)
    tpl = marine.fish_template('trevally_juv', length=0.2)
    # school arrives from the side and settles into his shadow 0.6-1.2 m below him
    def centre(f):
        k = ease(min(1.0, (f - 1) / 70))
        return Vector((2.6 * (1 - k) + 0.1 * math.sin(f / 20), -1.5 * (1 - k), -0.95 + 0.1 * math.sin(f / 25)))
    marine.school(tpl, 16, centre, seed=3, spread=(0.55, 0.9, 0.22))
    cam = env.add_camera('Cam', lens=22)
    aimt = cam_target(None, (0, 0, -0.6)); env.aim(cam, aimt)
    for f in range(1, N + 1, 3):
        k = ease((f - 1) / (N - 1))
        env.key_loc(cam, f, Vector((1.6 - 0.4 * k, -2.2 + 0.4 * k, -2.6 + 0.3 * k)))
    env.handheld(cam, amp_loc=0.015, amp_rot=0.004, freq=0.3, seed=15)
    marine.marine_snow(cam, n=700)
    marine.god_rays(sun['dir'], count=16, radius=6.0, length=12.0, strength=0.3, avoid=(1.4, -2.0, -2.4), avoid_r=2.0)
    marine.fill_light(target=(0, 0, -1.0), loc=(1.0, -2.5, -6.5), energy=110)
    return sc
