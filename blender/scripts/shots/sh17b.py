"""SH17B - "...splashing draws attention, so you stay still." Underwater: the mako circles once beneath his
motionless legs, then loses interest and fades back into the blue."""
from common import *
import marine

def build():
    sc, c, o, sun = setup('SH17B', tod='afternoon', ocean='calm', water_mode='under', grade='under', vignette=0.45, sun_toward=(0.6, 0.8))
    N = sc.frame_end   # 72
    c.condition(wet=1.0, fatigue=0.5, sunburn=0.45, salt=0.3)
    marine.underwater_camera_setup(sc, o, sun)
    c.add(ch.tread_water(c, 1, N, speed=0.45, effort=0.25))
    c.pivot_fn = lambda f: (Vector((0, 0, -0.2)), compose(R('X', 4), R('Z', 22)))
    probe = finish(c, o, N, inertia=(0.25, 0.55))
    shark, arm = marine.load_shark(2.6)
    def path(f):
        u = f / N
        a = math.radians(205 - 75 * ease(min(u / 0.7, 1.0)))     # ~2 m/s arc under his legs
        p = Vector((-0.3 + 2.4 * math.cos(a), -0.5 + 2.4 * math.sin(a), -3.0))
        if u > 0.6:                                               # loses interest, glides off into the blue
            k = ease((u - 0.6) / 0.4)
            p += Vector((2.2 * k, 4.0 * k, -1.2 * k))
        return p
    marine.path_animate(shark, path, 1, N, bank=0.8)
    cam = env.add_camera('Cam', lens=20)
    aimt = cam_target(None, (0.0, 0.6, -2.2)); env.aim(cam, aimt)
    for f in range(1, N + 1, 3):
        k = ease((f - 1) / (N - 1))
        env.key_loc(cam, f, Vector((-1.8 + 0.3 * k, -3.6 + 0.3 * k, -2.9 - 0.2 * k)))
    env.handheld(cam, amp_loc=0.012, amp_rot=0.004, freq=0.3, seed=18)
    marine.marine_snow(cam, n=700)
    marine.god_rays(sun['dir'], count=14, radius=7.0, length=12.0, strength=0.28, avoid=(-1.7, -3.4, -3.0), avoid_r=2.0)
    marine.fill_light(target=(-0.5, -0.5, -3), loc=(-1.0, -2.0, -7.5), energy=320)
    return sc
