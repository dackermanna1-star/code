"""SH24 - "Without fresh water, you have days, not weeks." Late light, tight on his face as he floats: ears under,
skin burnt and crusted with salt, lips cracked; his eyes slowly close."""
from common import *

def build():
    sc, c, o, sun = setup('SH24', res=(648, 1152), tod='late', ocean='calm', water_mode='clear', vignette=0.48, water_kw={'near_transmission': 6.0},
                          sun_toward=(0.3, -0.9))
    N = sc.frame_end   # 105
    c.condition(wet=0.8, fatigue=1.0, sunburn=0.62, salt=0.7)
    c.add(ch.float_back(c, head_back=1.2)); c.add(ch.breathing(rate_bpm=11, depth=0.7))
    c.add_face(lambda f: dict(face('exhausted', 1.0), eyeBlinkLeft=0.45 + 0.5 * ease((f - 30) / 60), eyeBlinkRight=0.45 + 0.5 * ease((f - 30) / 60),
                              mouthRollLower=0.2))
    c.add(lambda f: {'head': R('Z', -10 * ease(f / N))})
    c.pivot_fn = lambda f: (Vector((0, 0.15, -0.12)), compose(R('X', -77), R('Z', 15)))
    probe = finish(c, o, N, inertia=(0.25, 0.6), radius=1.0)
    o['mat'].node_tree.nodes['collar_foam'].outputs[0].default_value = 0.12
    cam = env.add_camera('Cam', lens=60, dof={'fstop': 2.0})
    head = cam_target(c.rig, (0, 0, 0), bone='eye.L'); cam.data.dof.focus_object = head
    env.aim(cam, head)          # aim straight at the eyes so the face is centred whatever the swell does
    for f in range(1, N + 1, 3):
        k = ease((f - 1) / (N - 1))
        env.key_loc(cam, f, Vector((-0.02 - 0.03 * k, 0.02 + 0.04 * k, 0.66 - 0.06 * k)))
    ch.ride_swell(cam, probe, 1, N, amount=0.9, min_clear=0.45)
    env.handheld(cam, amp_loc=0.004, amp_rot=0.002, freq=0.4, seed=24)
    return sc
