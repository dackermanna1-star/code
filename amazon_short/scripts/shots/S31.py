"""S31 – 'On day five, the stream opens onto a wide river,' He pushes out of the forest onto the bank; the river opens wide, golden."""
import sys; sys.path.insert(0, '/home/user/code/amazon_short/scripts'); sys.path.insert(0, '/home/user/code/amazon_short/scripts/shots')
from shotlib import *
import river_set
s, sh = setup('S31'); N = sh['frames']
E = river_set.build((2.0, -9.5), extra_clear=[(0.5, -2.0, 1.4), (0.3, 0.2, 1.0)])
T = E['terrain']
col, rig, acts = character(0.95, 0.6, ['UAL_Walk_Loop', 'UAL_Zombie_Walk_Fwd_Loop', 'UAL_Idle_Loop'])
pts = [Vector((0.3, 1.2)), Vector((0.45, -1.0)), Vector((0.55, -3.3))]
sp_, sc = locomote(rig, T, pts, 1, 70, 'UAL_Walk_Loop', ease_in=2, ease_out=18)
clip(rig, acts, 'Walk_Loop', -10, dur=85, scale=sc, blend_in=0, blend_out=8)
clip(rig, acts, 'Zombie_Walk_Fwd_Loop', -10, dur=85, scale=sc, blend_in=0, blend_out=8, influence=[(1, 0.45)])
clip(rig, acts, 'Idle_Loop', 64, dur=N, blend_in=10, blend_out=0); hold_first(rig)
pose_layer(rig, 'look', merge(look_keys([(1, 0, 22), (50, 0, 10), (70, 0, -8), (85, 25, -10), (N, -15, -6)]), breathing(1, N, 26, 3.5)))
cam = camera('CAM', (2.0, -9.5, -0.55), (0.5, -2.0, 0.6), 24)
cam_path(cam, [(1, (2.2, -10.2, -0.6), (0.4, 0.0, 0.9)), (N, (1.7, -9.2, -0.4), (0.55, -3.0, 0.9))])
handheld(cam, 1, N, amp=0.01, rot_amp=0.003, seed=31)
focus_on(cam, rig, 'Head', 5.0)
ENV.mist_fog(6, 300, (0.95, 0.75, 0.55), 0.0, grade=dict(gain=(1.06, 0.99, 0.9), sat=1.05))
finish(s, 'S31'); render_if_requested()
