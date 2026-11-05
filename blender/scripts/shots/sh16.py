"""SH16 - "Then, something bigger comes to look."  Underwater wide into the blue: continuing from SH15 he floats flat
with the little fish in his shadow, then rolls upright, legs dropping into the top of frame, as out of the haze a
oceanic whitetip glides in, slow and curious, and the fish scatter."""
from common import *
import marine

def build():
    sc, c, o, sun = setup('SH16', tod='afternoon', ocean='calm', water_mode='under', grade='under', vignette=0.45, sun_toward=(0.6, 0.8))
    N = sc.frame_end   # 75
    c.condition(wet=1.0, fatigue=0.5, sunburn=0.45, salt=0.3)
    marine.underwater_camera_setup(sc, o, sun)
    # continuity with SH15: he starts floating flat on his back, then rolls upright to tread as the shape appears
    w = ch.ramp(6, 40)
    c.add(ch.weight(ch.float_back(c), lambda f: 1 - w(f)))
    c.add(ch.weight(ch.tread_water(c, 1, N, speed=0.7, effort=0.55), w))
    c.add(ch.breathing(rate_bpm=22, depth=1.0)); c.add(ch.micro_head(seed=3, amp=2.0))
    q_float = compose(R('X', -76), R('Z', 70)); q_tread = compose(R('X', 4), R('Z', 60))
    def pivot(f):
        k = w(f)
        loc = Vector((0, 0.15, -0.11)).lerp(Vector((0, 0, -0.22 + ch.tread_bob(f, 0.7, 0.035 * 0.55))), k)
        return loc, q_float.slerp(q_tread, k)
    c.pivot_fn = pivot
    probe = ch.OceanProbe(o['ocean'])
    finish(c, o, N, probe, inertia=(0.22, 0.6), radius=1.0)
    # the juvenile trevally from SH15 are still in his shadow, and dart away as the shark comes in
    tpl = marine.fish_template('trevally_juv', length=0.2)
    def centre(f):
        e = ease((f - 22) / 30.0)
        return Vector((0.1 - 3.2 * e + 0.1 * math.sin(f / 20), 0.3 * e, -0.95 - 0.6 * e + 0.1 * math.sin(f / 25)))
    marine.school(tpl, 12, centre, seed=3, spread=(0.55, 0.9, 0.22))
    shark, arm = marine.load_shark(2.1)
    # ~2.5 m/s cruise out of the blue haze toward the dangling legs, slight descent-then-rise
    marine.path_animate(shark, lambda f: Vector((3.0 - 2.5 * ease(f / N), 8.0 - 5.4 * ease(f / N), -3.4 + 0.6 * ease(f / N))), 1, N)   # stops ~4 m from the lens
    cam = env.add_camera('Cam', lens=22)
    # open on him floating flat at the surface (continuity with SH15), then pan down/out to the shark as it appears
    aimt = cam_target(None, (0.0, 0.2, -0.5)); env.aim(cam, aimt)
    aimt.keyframe_insert('location', frame=1); aimt.keyframe_insert('location', frame=16)
    aimt.location = (1.0, 5.0, -2.5); aimt.keyframe_insert('location', frame=46)
    for f in range(1, N + 1, 3):
        k = ease((f - 1) / (N - 1))
        env.key_loc(cam, f, Vector((-1.2 + 0.2 * k, -1.6 + 0.3 * k, -1.9)))
    env.handheld(cam, amp_loc=0.012, amp_rot=0.004, freq=0.3, seed=16)
    marine.marine_snow(cam, n=700)
    marine.god_rays(sun['dir'], count=14, radius=7.0, length=12.0, strength=0.28, avoid=(-1.5, -2.0, -1.6), avoid_r=2.0)
    marine.fill_light(target=(1, 4, -3), loc=(-0.5, 0.0, -7.0), energy=320)
    return sc
