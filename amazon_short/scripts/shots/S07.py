"""S07 – 'Experts say that when you're lost, you should stop and stay put.' He sits down on a fallen log, exhales."""
import sys; sys.path.insert(0, '/home/user/code/amazon_short/scripts'); sys.path.insert(0, '/home/user/code/amazon_short/scripts/shots')
from shotlib import *
import rest_set
s, sh = setup('S07'); N = sh['frames']
E = rest_set.build((2.6, -3.6), clear_view((2.6, -3.6), (0, 0)))
T = E['terrain']
col, rig, acts = character(0.12, 0.4, ['UAL_Sitting_Enter', 'UAL_Sitting_Idle_Loop', 'UAL_Idle_Loop'])
place(rig, T, 0.0, -0.15, 0)
clip(rig, acts, 'Idle_Loop', 1, dur=20, blend_in=0, blend_out=6)
clip(rig, acts, 'Sitting_Enter', 14, blend_in=6, blend_out=6)
clip(rig, acts, 'Sitting_Idle_Loop', 14 + 38, dur=N, blend_in=6, blend_out=0)
hold_first(rig)
pose_layer(rig, 'breath', merge(breathing(1, N, 42, 3.0), look_keys([(1, 0, 0), (60, -10, 8), (90, -15, 12), (N, -8, 10)])))
cam = camera('CAM', (2.6, -3.6, 1.3), (0, 0, 0.8), 30)
cam_path(cam, [(1, (2.7, -3.8, 1.35), (0, 0, 0.85)), (N, (2.3, -3.1, 1.2), (0, 0.1, 0.8))])
handheld(cam, 1, N, amp=0.004, rot_amp=0.003, seed=7)
focus_on(cam, rig, 'spine_03', 4.0)
ENV.mist_fog(3, 32, (0.44, 0.51, 0.44), 0.55)
finish(s, 'S07'); render_if_requested()
