"""SH18 - "Then the sun sets." Long lens at water level: his small silhouette sits in the glittering path of a
huge setting sun."""
from common import *

def build():
    sc, c, o, sun = setup('SH18', tod='sunset', ocean='calm', water_mode='opaque', vignette=0.38, world_kw={'show_sun_disk': True})
    N = sc.frame_end   # 108
    c.condition(wet=1.0, fatigue=0.55, sunburn=0.5, salt=0.35)
    az = sun_az(sun)
    probe = tread_in_place(c, o, N, depth=-0.22, speed=0.6, effort=0.45, yaw=math.degrees(az) - 90 + 15, lean=4)
    c.add(KeyPoses([(1, {'head': [('Z', -20)]}), (60, {'head': [('Z', 5)]}), (108, {'head': [('Z', 0), ('X', 4)]})]))
    finish(c, o, N, probe)
    env.setup_compositor('sunset', glare=False, vignette=0.38)
    d = Vector((math.cos(az), math.sin(az), 0))
    cam = env.add_camera('Cam', lens=100, clip=(1, 80000))
    aimt = cam_target(None, d * 400 + Vector((0, 0, 6))); env.aim(cam, aimt)
    for f in range(1, N + 1, 3):
        k = ease((f - 1) / (N - 1))
        p = -d * (19 - 3 * k) + Vector((0, 0, 1.25)) + d.cross(Vector((0, 0, 1))) * (0.4 - 0.8 * k)
        env.key_loc(cam, f, p, lens=100)
    ch.ride_swell(cam, probe, 1, N, amount=0.6, min_clear=0.8)
    env.handheld(cam, amp_loc=0.01, amp_rot=0.0012, freq=0.3, seed=18)
    return sc
