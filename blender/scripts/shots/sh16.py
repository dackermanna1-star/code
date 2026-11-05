"""SH16 - "Then, something bigger comes to look."  Underwater wide into the blue: his legs hang at the top of
frame; out of the haze a shortfin mako glides in, slow and curious."""
from common import *
import marine

def build():
    sc, c, o, sun = setup('SH16', tod='afternoon', ocean='calm', water_mode='under', grade='under', vignette=0.45, sun_toward=(0.6, 0.8))
    N = sc.frame_end   # 75
    c.condition(wet=1.0, fatigue=0.5, sunburn=0.45, salt=0.3)
    marine.underwater_camera_setup(sc, o, sun)
    probe = tread_in_place(c, o, N, depth=-0.22, speed=0.7, effort=0.55, yaw=60, lean=4)
    finish(c, o, N, probe)
    shark, arm = marine.load_shark(2.6)
    marine.path_animate(shark, lambda f: Vector((1.0 + 15 * (1 - ease_out(f / N)), 8.5 - 3.0 * ease(f / N), -3.4 + 0.5 * ease(f / N))), 1, N)
    cam = env.add_camera('Cam', lens=24)
    aimt = cam_target(None, (2.0, 6.0, -2.4)); env.aim(cam, aimt)
    for f in range(1, N + 1, 3):
        k = ease((f - 1) / (N - 1))
        env.key_loc(cam, f, Vector((-1.6 + 0.3 * k, -2.2 + 0.4 * k, -1.6)))
    env.handheld(cam, amp_loc=0.012, amp_rot=0.004, freq=0.3, seed=16)
    marine.marine_snow(cam, n=700)
    marine.god_rays(sun['dir'], count=14, radius=7.0, length=12.0, strength=0.28, avoid=(-1.5, -2.0, -1.6), avoid_r=2.0)
    marine.fill_light(target=(2, 6, -3), loc=(-1.0, -1.0, -7.0), energy=140)
    return sc
