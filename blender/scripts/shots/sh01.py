"""SH01 - Hook. "What happens if you're stranded in the middle of the ocean, with absolutely nothing around you?"
Top-down on his frightened upturned face, then the camera rockets straight up until he is a yellow speck
in an endless, sun-glittering ocean - the reveal lands on "absolutely nothing around you"."""
from common import *

def build():
    sc, c, o, sun = setup('SH01', tod='day', ocean='moderate', water_mode='opaque', vignette=0.25,
                          water_kw={'deep': (0.0025, 0.02, 0.055), 'crest': (0.008, 0.07, 0.09)})
    N = sc.frame_end   # 180
    c.condition(wet=1.0)
    probe = tread_in_place(c, o, N, depth=-0.13, speed=1.1, effort=1.1, yaw_fn=lambda f: 10 + 25 * math.sin(f / 50), lean=4)
    # looking up toward the sky/camera at first, then searching around
    c.add(KeyPoses([(1, {'neck01': [('X', -16)], 'head': [('X', -20)]}), (40, {'neck01': [('X', -14)], 'head': [('X', -16), ('Z', 10)]}),
                    (90, {'neck01': [('X', -4)], 'head': [('X', -4), ('Z', -35)]}), (140, {'neck01': [('X', -2)], 'head': [('Z', 30)]}),
                    (180, {'head': [('Z', 0)]})]))
    c.add(ch.look(lambda f: (0, -18) if f < 40 else (8 * math.sin(f / 9), -2)))
    c.add_face(ch.blinks(seed=1, stressed=True))
    c.add_face(expression([(1, face('fear', 0.9)), (60, face('fear', 0.8)), (180, face('fear', 0.7))]))
    finish(c, o, N, probe)
    o['mat'].node_tree.nodes['collar_foam'].outputs[0].default_value = 0.45
    az = sun_az(sun)
    cam = env.add_camera('Cam', lens=30, clip=(0.3, 80000))
    aimt = cam_target(c.root, (0, 0, 0)); env.aim(cam, aimt)
    yaw0 = math.radians(10)
    face_dir = Vector((math.sin(yaw0), -math.cos(yaw0), 0))   # he faces roughly -Y
    for f in range(1, N + 1):
        u = (f - 1) / (N - 1)
        k = 0.0 if u < 0.14 else ease_in(min((u - 0.14) / 0.86, 1.0)) ** 0.8
        h = 2.6 + 360 * k
        # start: high 3/4 in front of his upturned face; climb: swing over and lean toward the sun (glitter)
        start = face_dir * 2.0
        sun_off = Vector((math.cos(az), math.sin(az), 0)) * h * 0.55
        p = start.lerp(sun_off, min(1.0, k * 3.0)) + Vector((0, 0, h))
        env.key_loc(cam, f, p, lens=32 - 6 * k)
    cam.constraints[0].influence = 1.0
    env.handheld(cam, amp_loc=0.02, amp_rot=0.003, freq=0.5, seed=1)
    return sc
