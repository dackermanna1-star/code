"""SH27 - "So what kills you out here? In cold water, shock and hypothermia. In warm water, exhaustion, drowning,
and thirst." Aerial orbit of the rescue in golden light, horizon in frame (threat labels added in the edit)."""
from common import *
import rescue

def build():
    sc, c, o, sun = setup('SH27', tod='golden', ocean='calm', water_mode='opaque', vignette=0.3)
    N = sc.frame_end   # 249
    c.condition(wet=1.0, fatigue=0.95, sunburn=0.62, salt=0.7, cold=0.4)
    d, side, yaw = rescue.rescue_frame(sun)
    probe = tread_in_place(c, o, N, depth=-0.2, speed=0.6, effort=0.5, yaw=yaw, lean=-4)
    c.add(KeyPoses([(1, ch.raise_arm_pose('R', 0.9)), (N, ch.raise_arm_pose('R', 0.9))]))
    finish(c, o, N, probe)
    hp = d * rescue.HOVER_OFF + Vector((0, 0, rescue.HOVER_Z))
    hroot, rotor = rescue.heli(lambda f: hp, N, hover=True, yaw_deg=math.degrees(math.atan2(d.y, d.x)) + 90)
    rescue.downwash(c.root, (1, N), radius=(2.0, 9.0), rate=3000)
    rescue.churn_water(o)
    cam = env.add_camera('Cam', lens=24, clip=(0.5, 80000))
    aimt = cam_target(None, tuple(d * 0.8 + Vector((0, 0, 9.0)))); env.aim(cam, aimt)   # helicopter mid-frame, below the labels
    base = math.atan2(-d.y, -d.x)          # start on the far side from the sun, orbit around
    for f in range(1, N + 1, 2):
        k = ease((f - 1) / (N - 1))
        a = base + math.radians(-55 + 100 * k)
        r = 34 - 5 * k
        env.key_loc(cam, f, Vector((r * math.cos(a), r * math.sin(a), 21 + 3 * k)))
    env.handheld(cam, amp_loc=0.08, amp_rot=0.002, freq=0.3, seed=27)
    return sc
