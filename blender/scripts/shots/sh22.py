"""SH22 - "By day two, thirst and exhaustion cloud your mind." Grey, windy morning on a lumpy sea;
he floats limp, sunburnt and crusted with salt, eyes half shut."""
from common import *

def build():
    sc, c, o, sun = setup('SH22', tod='overcast', ocean='moderate', water_mode='clear', vignette=0.42, grade='overcast')
    N = sc.frame_end   # 108
    c.condition(wet=1.0, fatigue=0.85, sunburn=0.58, salt=0.6, cold=0.6)
    c.add(ch.float_back(c, spread=0.85, head_back=0.9)); c.add(ch.breathing(rate_bpm=16, depth=0.9))
    c.add(lambda f: {'head': R('Z', -14 + 8 * ch.fbm(f / 30, 22, 0.4))})
    c.add_face(lambda f: dict(face('exhausted', 1.0), eyeBlinkLeft=0.55, eyeBlinkRight=0.55))
    c.add_face(ch.blinks(seed=22, mean_gap=4.0))
    c.pivot_fn = lambda f: (Vector((0, 0.15, -0.1)), compose(R('X', -74), R('Z', 120)))
    probe = finish(c, o, N, inertia=(0.25, 0.55), radius=1.0)
    o['mat'].node_tree.nodes['collar_foam'].outputs[0].default_value = 0.15
    cam = env.add_camera('Cam', lens=35, dof={'fstop': 2.8})
    cam.data.dof.focus_object = cam_target(c.rig, (0, 0, 0), bone='eye.L')
    hd = Vector((-math.sin(math.radians(120)), math.cos(math.radians(120)), 0))   # head direction after the 120 deg yaw
    aimt = cam_target(c.root, tuple(Vector((0, 0.15, 0.05)) + hd * 0.45)); env.aim(cam, aimt)
    for f in range(1, N + 1, 3):
        k = ease((f - 1) / (N - 1))
        env.key_loc(cam, f, Vector((0, 0.15, 0)) - hd * (0.35 + 0.05 * k) + Vector((0.12, 0, 0.85 - 0.1 * k)))
    ch.ride_swell(cam, probe, 1, N, amount=0.85, min_clear=0.3)
    env.handheld(cam, amp_loc=0.012, amp_rot=0.005, freq=0.5, seed=22)
    return sc
