"""S21 – 'So you follow it downstream.' Side tracking shot along the bank, water sliding the same way he walks."""
import sys; sys.path.insert(0, '/home/user/code/amazon_short/scripts'); sys.path.insert(0, '/home/user/code/amazon_short/scripts/shots')
from shotlib import *
import stream_set
s, sh = setup('S21'); N = sh['frames']
E = stream_set.build((-0.6, -8.0), seed=211, wet=0.7, extra_clear=[(-0.6, -8.0, 1.4)], path=dict(pts=[(3.2, 2), (3.0, -6), (2.8, -14)], width=1.4))
T = E['terrain']
col, rig, acts = character(0.5, 0.45, ['UAL_Walk_Loop'])
pts = [Vector((3.15, -5.0)), Vector((3.0, -8.0)), Vector((2.9, -11.0))]
sp_, sc = locomote(rig, T, pts, 1, N, 'UAL_Walk_Loop', ease_in=1, ease_out=1)
clip(rig, acts, 'Walk_Loop', -10, dur=N + 20, scale=sc, blend_in=0, blend_out=0)
pose_layer(rig, 'look', merge(look_keys([(1, 20, 8), (30, 35, 12), (N, 10, 6)]), breathing(1, N, 32, 2.5)))
day_light(3.6, (50, 0, 120), 0.8, 1.0, exposure=0.65)
gz = ENV.height_at(T, 1.4, -7)
cam = camera('CAM', (0.9, -6.0, gz + 1.2), (3.0, -6.5, 1.0), 32)
cam_path(cam, [(1, (0.6, -4.6, -0.1), (3.1, -5.2, 0.9 + ENV.height_at(T, 3.1, -5.2))), (N, (0.7, -10.3, -0.1), (2.9, -10.9, 0.9 + ENV.height_at(T, 2.9, -10.9)))])
handheld(cam, 1, N, amp=0.005, rot_amp=0.003, seed=21)
focus_on(cam, rig, 'spine_03', 4.0)
ENV.mist_fog(2, 25, (0.52, 0.57, 0.53), 0.5)
finish(s, 'S21'); render_if_requested()
