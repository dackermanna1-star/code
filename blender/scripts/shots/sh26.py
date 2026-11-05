"""SH26 - "...lasted at least fifteen hours in the Gulf of Mexico, with no life jacket." The helicopter hangs
overhead in a storm of spray, backlit by the low sun; he lifts one heavy arm toward it."""
from common import *
import rescue

def build():
    sc, c, o, sun = setup('SH26', tod='golden', ocean='calm', water_mode='opaque', vignette=0.38)
    N = sc.frame_end   # 159
    c.condition(wet=1.0, fatigue=0.95, sunburn=0.62, salt=0.7, cold=0.4)
    d, side, yaw = rescue.rescue_frame(sun)
    probe = tread_in_place(c, o, N, depth=-0.2, speed=0.6, effort=0.5, yaw=yaw, lean=-4, breath_bpm=22)
    c.add(ch.weight(KeyPoses([(1, ch.raise_arm_pose('R', 1.0)), (N, ch.raise_arm_pose('R', 0.95))]), lambda f: ease((f - 20) / 30)))
    c.add(lambda f: {'upperarm01.R': R('X', 10 * math.sin(f / 9.0) * ease((f - 50) / 20))})   # weak wave
    # look up at the helicopter (~80 deg elevation): neck + head + eyes share it
    c.add(KeyPoses([(1, {'neck01': [('X', -24)], 'neck02': [('X', -14)], 'head': [('X', -22)]}), (N, {'neck01': [('X', -26)], 'neck02': [('X', -14)], 'head': [('X', -20)]})]))
    c.add(ch.look(lambda f: (0, -20)))
    c.add_face(lambda f: dict(face('hope', 1.0), eyeSquintLeft=0.5, eyeSquintRight=0.5))
    c.add_face(ch.blinks(seed=26, mean_gap=1.8))
    finish(c, o, N, probe)
    hp = d * rescue.HOVER_OFF + Vector((0, 0, rescue.ARRIVE_Z))
    hroot, rotor = rescue.heli(lambda f: hp, N, hover=True, yaw_deg=rescue.heli_yaw(d))
    rescue.downwash(c.root, (1, N), radius=(2.0, 9.0), rate=4200)
    rescue.churn_water(o)
    cam = env.add_camera('Cam', lens=17)
    aimt = cam_target(None, tuple(d * 1.0 + Vector((0, 0, 3.2)))); env.aim(cam, aimt)
    for f in range(1, N + 1, 3):
        k = ease((f - 1) / (N - 1))
        env.key_loc(cam, f, -d * (3.5 - 0.3 * k) + side * 1.0 + Vector((0, 0, 0.35)))
    ch.ride_swell(cam, probe, 1, N, amount=0.8, min_clear=0.22)
    env.handheld(cam, amp_loc=0.03, amp_rot=0.012, freq=1.2, seed=26)
    return sc
