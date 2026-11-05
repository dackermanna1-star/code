"""SH24 - "Without fresh water, you have days, not weeks." Low golden evening light (the same evening as the rescue),
tight on his face from straight above as he floats, face upright in frame: skin burnt and crusted with salt, lips
cracked; his eyes slowly close."""
from common import *

def build():
    sc, c, o, sun = setup('SH24', res=(648, 1152), tod='golden', ocean='calm', water_mode='opaque', vignette=0.36,
                          sun_toward=(0.9, -0.3))
    N = sc.frame_end   # 105
    c.condition(wet=0.8, fatigue=1.0, sunburn=0.62, salt=0.7)
    c.add(ch.float_back(c, head_back=0.8)); c.add(ch.breathing(rate_bpm=11, depth=0.7))
    c.add_face(lambda f: dict(face('exhausted', 1.0), eyeBlinkLeft=0.45 + 0.5 * ease((f - 30) / 60), eyeBlinkRight=0.45 + 0.5 * ease((f - 30) / 60),
                              mouthRollLower=0.2))
    c.add(lambda f: {'head': R('Z', -10 * ease(f / N))})
    c.pivot_fn = lambda f: (Vector((0, 0.15, -0.07)), compose(R('X', -77), R('Z', 15)))
    probe = finish(c, o, N, inertia=(0.25, 0.6), radius=1.0)
    o['mat'].node_tree.nodes['collar_foam'].outputs[0].default_value = 0.12
    cam = env.add_camera('Cam', lens=60, dof={'fstop': 2.4})
    head = overhead_face_cam(c, cam, 105, height=(0.68, 0.6), toward_crown=0.1, N=N)
    cam.data.dof.focus_object = head
    ch.ride_swell(cam, probe, 1, N, amount=0.9, min_clear=0.45)
    env.handheld(cam, amp_loc=0.004, amp_rot=0.002, freq=0.4, seed=24)
    return sc
