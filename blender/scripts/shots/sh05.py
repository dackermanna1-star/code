"""SH05 - "Just horizon, in every direction."
Wide from behind and above his shoulder: a small head in a huge, empty, rolling ocean. Slow push in."""
from common import *

def build():
    sc, c, o, sun = setup('SH05', tod='day', ocean='moderate', water_mode='opaque', vignette=0.3, sun_rot=math.radians(160))
    N = sc.frame_end   # 84
    c.condition(wet=1.0)
    probe = tread_in_place(c, o, N, depth=-0.24, speed=0.95, effort=0.9, yaw=180, lean=6)
    c.add(KeyPoses([(1, {'head': [('Z', -25)], 'neck02': [('Z', -10)]}), (35, {'head': [('Z', 20)], 'neck02': [('Z', 8)]}),
                    (84, {'head': [('Z', 5)], 'neck02': [('Z', 2)]})]))
    c.add_face(ch.blinks(seed=8))
    finish(c, o, N, probe)
    cam = env.add_camera('Cam', lens=26)
    for f in range(1, N + 1, 3):
        k = ease((f - 1) / (N - 1))
        p = Vector((1.2 - 0.3 * k, -6.5 + 2.0 * k, 2.1 - 0.5 * k))
        env.key_cam(cam, f, p, (0.3, 30, -0.6 + 0.4 * k), lens=26)
    ch.ride_swell(cam, probe, 1, N, amount=0.6)
    env.handheld(cam, amp_loc=0.015, amp_rot=0.003, freq=0.4, seed=5)
    return sc
