"""SH27 - "So what kills you out here? In cold water, shock and hypothermia. In warm water, exhaustion, drowning,
and thirst." Aerial orbit of the rescue in golden light (threat labels added in the edit)."""
from common import *
import rescue

def build():
    sc, c, o, sun = setup('SH27', tod='golden', ocean='calm', water_mode='opaque', vignette=0.3)
    N = sc.frame_end   # 249
    c.condition(wet=1.0, fatigue=0.95, sunburn=0.62, salt=0.6)
    probe = tread_in_place(c, o, N, depth=-0.2, speed=0.6, effort=0.5, yaw=200, lean=-4)
    c.add(KeyPoses([(1, ch.raise_arm_pose('R', 0.9)), (N, ch.raise_arm_pose('R', 0.9))]))
    finish(c, o, N, probe)
    hroot, rotor = rescue.heli(lambda f: Vector((2.5, 5.0, 13.5)), N, hover=True)
    rescue.downwash(c.root, (1, N), rate=1600)
    rescue.churn_water(o)
    cam = env.add_camera('Cam', lens=30, clip=(0.5, 80000))
    aimt = cam_target(None, (0.8, 1.6, 3.0)); env.aim(cam, aimt)
    for f in range(1, N + 1, 2):
        k = ease((f - 1) / (N - 1))
        a = math.radians(-60 + 110 * k)
        r = 22 - 4 * k
        env.key_loc(cam, f, Vector((r * math.cos(a), r * math.sin(a), 17 + 4 * k)))
    env.handheld(cam, amp_loc=0.08, amp_rot=0.002, freq=0.3, seed=27)
    return sc
