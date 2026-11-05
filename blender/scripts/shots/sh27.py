"""SH27 - "So what kills you out here? In cold water, shock and hypothermia. In warm water, exhaustion, drowning,
and thirst." Water-level medium shot from in front of him, in the rotor wash: he squints up into the downdraft while
the yellow strop is paid out on its cable from the helicopter overhead (off the top of frame, heard), drops into
the frame and lands in front of him; he reaches for it. Threat labels sit in the sky above him (added in the edit)."""
from common import *
import rescue

LAND = 196           # strop reaches the water in front of him

def build():
    sc, c, o, sun = setup('SH27', tod='golden', ocean='calm', water_mode='opaque', vignette=0.3)
    N = sc.frame_end   # 249
    c.condition(wet=1.0, fatigue=0.95, sunburn=0.62, salt=0.7, cold=0.4)
    d, side, yaw = rescue.rescue_frame(sun)
    probe = tread_in_place(c, o, N, depth=-0.2, speed=0.6, effort=0.5, yaw=yaw, lean=-2)
    # arm up toward the helicopter, then both hands forward for the strop as it lands
    c.add(KeyPoses([(1, ch.raise_arm_pose('R', 0.9)), (120, ch.raise_arm_pose('R', 0.8)), (LAND - 30, ch.raise_arm_pose('R', 0.55)),
                    (LAND + 6, ch.cup_hands_pose(0.0)), (N, ch.cup_hands_pose(0.0))]))
    c.add(KeyPoses([(1, {'neck01': [('X', -22)], 'head': [('X', -18)]}), (120, {'neck01': [('X', -20)], 'head': [('X', -14)]}),
                    (LAND - 10, {'neck01': [('X', -2)], 'head': [('X', 2)]}), (N, {'neck01': [('X', 6)], 'head': [('X', 8)]})]))
    c.add_face(expression([(1, dict(face('hope', 0.9), eyeSquintLeft=0.6, eyeSquintRight=0.6)),
                           (LAND, dict(face('hope', 1.0), eyeSquintLeft=0.4, eyeSquintRight=0.4)), (N, face('hope', 0.8))]))
    c.add_face(ch.blinks(seed=27, mean_gap=1.6))
    finish(c, o, N, probe)
    # helicopter (off the top of frame): settles from the SH26 arrival point to hoist height with the hook over him
    p0 = d * rescue.HOVER_OFF + Vector((0, 0, rescue.ARRIVE_Z))
    p1 = rescue.hook_over_xy(d) + Vector((0, 0, rescue.HOVER_Z))
    hpath = lambda f: p0.lerp(p1, ease(min(1.0, max(0.0, (f - 1) / 110.0))))
    hroot, rotor = rescue.heli(hpath, N, hover=True, yaw_deg=rescue.heli_yaw(d))
    hook = rescue.hoist_hook(hroot)
    # strop paid out on the cable, swinging in the downwash; lands just in front of him and bobs
    strop, top = rescue.hanging_strop()
    tgt = d * 0.3 + side * 0.5 + Vector((0, 0, -0.03))        # beside him (not between him and the lens)
    for f in range(1, N + 1):
        hw = rescue.world_at(hroot, f, rescue.HOOK_CM)
        k = ease(min(1.0, max(0.0, (f - 60) / float(LAND - 60))))
        L = 0.6 + k * (hw.z - 0.6)
        sw = Vector((0.3 * math.sin(f / 13.0), 0.25 * math.sin(f / 17.0 + 1.0), 0)) * (1.0 - k * 0.7)
        pos = hw - Vector((0, 0, L)) + sw
        m = ease(min(1.0, max(0.0, (f - (LAND - 50)) / 50.0)))            # guided toward him as it comes down
        pos = pos.lerp(Vector((tgt.x, tgt.y, pos.z)), m)
        if f >= LAND:
            pos.z = tgt.z + 0.03 * math.sin(f / 7.0)
        strop.location = pos; strop.keyframe_insert('location', frame=f)
        strop.rotation_euler = (0.15 * math.sin(f / 11.0), 0.1 * math.sin(f / 9.0), math.radians(yaw) + 0.5 * math.sin(f / 29.0))
        strop.keyframe_insert('rotation_euler', frame=f)
    rescue.cable(hook, top)
    rescue.downwash(c.root, (1, N), radius=(1.2, 7.0), rate=4200)
    rescue.churn_water(o)
    # camera: in the water ~3.2 m in front of him, slow arc, looking slightly up (he sits low, sky above for the labels)
    cam = env.add_camera('Cam', lens=30, dof={'fstop': 4.0, 'dist': 3.2}, clip=(0.05, 80000))
    aimt = bpy.data.objects.new('Aim', None); sc.collection.objects.link(aimt)
    a0 = math.atan2(d.y, d.x)
    for f in range(1, N + 1, 3):
        k = ease((f - 1) / (N - 1))
        a = a0 + math.radians(-22 + 34 * k)
        r = 3.4 - 0.4 * k
        env.key_loc(cam, f, Vector((r * math.cos(a), r * math.sin(a), 0.9)))
        aimt.location = Vector((0, 0, 0.9 + r * math.tan(math.radians(4.0)))); aimt.keyframe_insert('location', frame=f)
    env.aim(cam, aimt)
    ch.ride_swell(cam, probe, 1, N, amount=0.85, min_clear=0.4)
    env.handheld(cam, amp_loc=0.03, amp_rot=0.008, freq=1.0, seed=27)
    return sc
