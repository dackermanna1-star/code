"""SH26 - "...lasted at least fifteen hours in the Gulf of Mexico, with no life jacket." The helicopter hangs
overhead in a storm of spray; he lifts one heavy arm toward it."""
from common import *
import rescue

def build():
    sc, c, o, sun = setup('SH26', tod='golden', ocean='calm', water_mode='opaque', vignette=0.38)
    N = sc.frame_end   # 159
    c.condition(wet=1.0, fatigue=0.95, sunburn=0.62, salt=0.6)
    probe = tread_in_place(c, o, N, depth=-0.2, speed=0.6, effort=0.5, yaw=200, lean=-4, breath_bpm=22)
    c.add(ch.weight(KeyPoses([(1, ch.raise_arm_pose('R', 1.0)), (N, ch.raise_arm_pose('R', 0.95))]), lambda f: ease((f - 20) / 30)))
    c.add(lambda f: {'upperarm01.R': R('X', 10 * math.sin(f / 9.0) * ease((f - 50) / 20))})   # weak wave
    c.add(KeyPoses([(1, {'neck01': [('X', -16)], 'head': [('X', -18)]}), (N, {'neck01': [('X', -18)], 'head': [('X', -16)]})]))
    c.add_face(lambda f: dict(face('hope', 1.0), eyeSquintLeft=0.5, eyeSquintRight=0.5))
    c.add_face(ch.blinks(seed=26, mean_gap=1.8))
    finish(c, o, N, probe)
    hroot, rotor = rescue.heli(lambda f: Vector((2.5, 5.0, 13.5)), N, hover=True)
    rescue.downwash(c.root, (1, N), rate=2400)
    rescue.churn_water(o)
    cam = env.add_camera('Cam', lens=15)
    aimt = cam_target(None, (0.9, 2.0, 4.2)); env.aim(cam, aimt)
    for f in range(1, N + 1, 3):
        k = ease((f - 1) / (N - 1))
        env.key_loc(cam, f, Vector((-0.9 + 0.2 * k, -2.0 + 0.2 * k, 0.3)))
    ch.ride_swell(cam, probe, 1, N, amount=0.8, min_clear=0.2)
    env.handheld(cam, amp_loc=0.03, amp_rot=0.012, freq=1.2, seed=26)   # buffeted by the downwash
    return sc
