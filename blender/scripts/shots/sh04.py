"""SH04 - "You look around. No boat. No land."
Medium shot, low orbit around the castaway treading water; he whips his head
around searching, body turning, eyes leading the head."""
import math
from common import *
from char import R, compose, KeyPoses, ease, ease_out, face, expression

def build():
    sc, c, o, sun = setup('SH04', tod='day', ocean='moderate', water_mode='opaque')
    N = sc.frame_end
    c.condition(wet=1.0, sunburn=0.0, fatigue=0.0, cold=0.0, salt=0.0)

    # ---------------- body: treading water + searching turns
    c.add(ch.tread_water(c, 1, N, speed=1.15, effort=1.1))
    c.add(ch.breathing(rate_bpm=34, depth=1.6))
    c.add(ch.micro_head(seed=4, amp=2.0))
    # search: eyes lead, head follows ~4f later, neck/spine follow later still (overlap)
    yaw_keys = [(1, 0), (10, 5), (22, 62), (30, 55), (44, -48), (54, -70), (66, -60), (80, 20), (92, 35), (102, 28)]
    def yaw_at(f, lag=0):
        f = f - lag
        for i in range(len(yaw_keys) - 1):
            a, b = yaw_keys[i], yaw_keys[i + 1]
            if a[0] <= f <= b[0]:
                return a[1] + (b[1] - a[1]) * ease_out((f - a[0]) / (b[0] - a[0]))
        return yaw_keys[0][1] if f < yaw_keys[0][0] else yaw_keys[-1][1]
    def search(f):
        h = yaw_at(f, 3); n = yaw_at(f, 5); s = yaw_at(f, 8)
        pitch = -6 + 4 * math.sin(f * 0.21)
        return {'head': compose(R('Z', h * 0.45), R('X', pitch * 0.5)),
                'neck02': R('Z', n * 0.25), 'neck01': R('Z', n * 0.12),
                'spine02': R('Z', s * 0.10), 'spine03': R('Z', s * 0.06)}
    c.add(search)
    c.add(ch.look(lambda f: (max(-30, min(30, (yaw_at(f) - yaw_at(f, 3)) * 0.9 + 4 * math.sin(f * 0.5))), -2)))
    c.add_face(ch.blinks(seed=3, stressed=True))
    c.add_face(expression([(1, face('fear', 0.8)), (20, face('alarm')), (45, face('fear', 1.0)), (80, face('fear', 0.9)), (102, face('fear', 0.75))]))
    # heavy mouth breathing
    c.add_face(lambda f: {'jawOpen': 0.12 + 0.12 * max(0, math.sin(2 * math.pi * f / 30 * 34 / 60)), 'mouthFunnel': 0.05})

    # whole-body slow turn in the water (pivot yaw), forward lean, kick bob
    def pivot(f):
        body_yaw = 25 + yaw_at(f, 14) * 0.35
        z = -0.24 + ch.tread_bob(f, 1.15, 0.04)
        return (Vector((0, 0, z)), compose(R('X', 9), R('Z', body_yaw)))
    c.pivot_fn = pivot
    c.bake(1, N)

    probe = ch.OceanProbe(o['ocean'])
    ch.apply_buoyancy(c, probe, 1, N, radius=0.7, inertia=(0.25, 0.55))

    # ---------------- camera: low orbit, opposite to his turn
    cam = env.add_camera('Cam', lens=38, dof={'fstop': 2.4, 'obj': None})
    tgt = bpy.data.objects.new('CamTarget', None); bpy.data.collections['Cameras'].objects.link(tgt)
    tgt.parent = c.root; tgt.location = (0, 0, 0.28)
    cam.data.dof.focus_object = tgt
    for f in range(1, N + 1, 3):
        a = math.radians(-115 + 95 * ease((f - 1) / (N - 1)))
        r = 1.75
        p = Vector((r * math.cos(a), r * math.sin(a), 0.42 + 0.06 * math.sin(f * 0.07)))
        # follow root height loosely (camera operator bobbing on the swell)
        env.key_cam(cam, f, p, (0, 0, 0.22), lens=45)
    ch.ride_swell(cam, probe, 1, N, amount=0.8)
    env.handheld(cam, amp_loc=0.012, amp_rot=0.006, freq=0.5, seed=4)
    return sc
