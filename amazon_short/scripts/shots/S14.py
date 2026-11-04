"""S14 – 'But untreated, this water…' Kneels at the creek edge and scoops water in cupped hands."""
import sys; sys.path.insert(0, '/home/user/code/amazon_short/scripts'); sys.path.insert(0, '/home/user/code/amazon_short/scripts/shots')
from shotlib import *
import stream_set
s, sh = setup('S14'); N = sh['frames']
E = stream_set.build((0.9, -1.9), extra_clear=[(1.9, 0.0, 1.6), (1.0, -1.8, 1.4)])
T = E['terrain']
col, rig, acts = character(0.4, 0.8, ['UAL_Fixing_Kneeling', 'UAL_Idle_Loop'])
place(rig, T, 1.8, 0.05, -90)   # faces -X towards the water
fk = acts['UAL_Fixing_Kneeling']
clip(rig, acts, 'Fixing_Kneeling', 1, frange=(fk.frame_range[0] + 6, fk.frame_range[0] + 60), blend_in=0, blend_out=0)
hold_first(rig)
pose_layer(rig, 'cup', merge({'hand_r': [(1, (0, 0, 0)), (40, (0, 50, 0)), (N, (0, 55, 0))], 'hand_l': [(1, (0, 0, 0)), (40, (0, -50, 0)), (N, (0, -55, 0))]},
                             look_keys([(1, 0, 10), (N, 0, 28)])))
day_light(4.0, (55, 0, 260), 0.85, 1.6, exposure=0.7)
gz = ENV.height_at(T, 1.8, 0.05)
cam = camera('CAM', (1.0, -1.9, gz + 0.75), (1.5, 0.0, gz + 0.3), 32)
cam_path(cam, [(1, (0.95, -2.0, gz + 0.8), (1.55, 0.0, gz + 0.45)), (N, (1.05, -1.5, gz + 0.6), (1.45, 0.05, gz + 0.1))])
handheld(cam, 1, N, amp=0.004, rot_amp=0.003, seed=14)
focus_on(cam, rig, 'hand_r', 2.2)
ENV.mist_fog(2, 25, (0.55, 0.6, 0.52), 0.45)
finish(s, 'S14'); render_if_requested()
