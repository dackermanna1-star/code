"""SH25 - "But people do survive..." Golden light. Over his shoulder: a thudding sound, he lifts his head - out of
the glare a Coast Guard helicopter is coming, low over the water."""
from common import *
import rescue

def build():
    sc, c, o, sun = setup('SH25', tod='golden', ocean='calm', water_mode='opaque', vignette=0.38, world_kw={'show_sun_disk': True})
    N = sc.frame_end   # 147
    c.condition(wet=1.0, fatigue=0.95, sunburn=0.62, salt=0.7, cold=0.4)
    d, side, yaw = rescue.rescue_frame(sun)
    probe = tread_in_place(c, o, N, depth=-0.22, speed=0.5, effort=0.35, yaw=yaw, lean=3, breath_bpm=16)
    c.add(KeyPoses([(1, {'neck01': [('X', 14)], 'head': [('X', 12)]}), (30, {'neck01': [('X', 13)], 'head': [('X', 10)]}),
                    (52, {'neck01': [('X', -6)], 'head': [('X', -10)]}, ease_out), (147, {'neck01': [('X', -8)], 'head': [('X', -12)]})]))
    c.add_face(expression([(1, face('exhausted', 1.0)), (40, face('exhausted', 0.9)), (60, face('hope', 1.0)), (147, face('hope', 0.9))]))
    finish(c, o, N, probe)
    # out of the glare, slightly off the sun line, decelerating from ~45 m/s to a near hover
    off = side * 18.0
    def path(f):
        k = ease_out(min(1.0, f / N))
        return d * (240 - 175 * k) + off * (1 - k) + Vector((0, 0, 42 - 20 * k))
    hroot, rotor = rescue.heli(path, N)
    cam = env.add_camera('Cam', lens=30, dof={'fstop': 5.6, 'dist': 90.0}, clip=(0.1, 80000))
    aimt = bpy.data.objects.new('Aim', None); sc.collection.objects.link(aimt)
    for f in range(1, N + 1, 3):
        hp = path(f); dist = Vector((hp.x, hp.y, 0)).length
        el = math.atan2(hp.z, dist) * 0.55          # keep both his head (bottom) and the helicopter (top) in frame
        aimt.location = d * 100 + Vector((0, 0, 100 * math.tan(el))); aimt.keyframe_insert('location', frame=f)
    env.aim(cam, aimt)
    for f in range(1, N + 1, 3):
        env.key_loc(cam, f, -d * 1.2 - side * 0.15 + Vector((0, 0, 0.5)))
    ch.ride_swell(cam, probe, 1, N, amount=0.85, min_clear=0.25)
    env.handheld(cam, amp_loc=0.008, amp_rot=0.003, freq=0.4, seed=25)
    return sc
