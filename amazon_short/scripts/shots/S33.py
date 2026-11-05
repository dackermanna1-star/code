"""S33 – 'In 1971, after a plane crash, seventeen-year-old Juliane Koepcke survived eleven days alone in the Amazon,'
He waves both arms; the canoe turns toward him; the driver waves back and slows beside the bank."""
import sys; sys.path.insert(0, '/home/user/code/amazon_short/scripts'); sys.path.insert(0, '/home/user/code/amazon_short/scripts/shots')
from shotlib import *
import river_set
s, sh = setup('S33'); N = sh['frames']
E = river_set.build((3.0, -1.0), extra_clear=[(0.55, -3.3, 1.8), (1.6, -1.6, 1.4)])
T = E['terrain']
col, rig, acts = character(0.95, 0.6, ['UAL_Idle_Loop'])
place(rig, T, 0.55, -3.3, -62)
clip(rig, acts, 'Idle_Loop', 1, dur=N + 5, blend_in=0, blend_out=0)
wv = {'upperarm_r': [(1, (0, 0, 0))], 'lowerarm_r': [(1, (0, 0, 0))], 'upperarm_l': [(1, (0, 0, 0))], 'lowerarm_l': [(1, (0, 0, 0))]}
f = 8; k = 0
while f < 170:
    o = 18 if k % 2 else -18
    wv['upperarm_r'].append((f, (15, 0, -140 + o))); wv['lowerarm_r'].append((f, (0, 0, -30 + o * 0.6)))
    wv['upperarm_l'].append((f, (15, 0, 140 + o))); wv['lowerarm_l'].append((f, (0, 0, 30 + o * 0.6))); f += 9; k += 1
for b in wv: wv[b] += [(182, (0, 0, 0)), (N, (0, 0, 0))]
pose_layer(rig, 'wave', merge(wv, look_keys([(1, 50, -5), (120, 40, -3), (190, 20, 5), (N, 10, 8)]), breathing(1, N, 20, 3.5)))
boat, driver = river_set.boat_with_driver([(1, (-60, -22), 10), (120, (-22, -14), 25), (200, (-5, -9.5), 10), (N, (-1.5, -8.6), 4)], wave_frames=(110, 200))
ch = Vector((0.55, -3.3, ENV.height_at(T, 0.55, -3.3)))
def ots(bxy):
    d = (ch.xy - Vector(bxy)).normalized(); side = Vector((-d.y, d.x))
    return Vector((ch.x + d.x * 1.7 + side.x * 0.55, ch.y + d.y * 1.7 + side.y * 0.55, ch.z + 1.75))
c1 = camera('CAM_OTS', ots((-60, -22)), (-60, -22, 0.5), 32)
cam_path(c1, [(1, ots((-60, -22)), Vector((-60, -22, 0.4))), (130, ots((-18, -13)), Vector((-18, -13, 0.3)))])
focus_on(c1, boat, None, 4.0)
hd = Vector((0.55, -3.3, ENV.height_at(T, 0.55, -3.3) + 1.5))
c2 = camera('CAM_Front', (6.5, -15.5, 1.1), hd, 26)
cam_path(c2, [(131, (6.5, -15.5, 1.1), Vector((-3.5, -7.5, 0.2))), (N, (6.2, -15.0, 1.15), Vector((-0.2, -6.6, 0.5)))])
focus_on(c2, rig, 'Head', 4.0)
for c in (c1, c2): handheld(c, 1, N, amp=0.004, rot_amp=0.003, seed=33); c.data.clip_end = 2000
s.camera = c1; s.timeline_markers.new('ots', frame=1).camera = c1; s.timeline_markers.new('front', frame=131).camera = c2
ENV.mist_fog(8, 500, (0.95, 0.75, 0.55), 0.0, grade=dict(gain=(1.06, 0.99, 0.9), sat=1.05))
finish(s, 'S33'); render_if_requested()
