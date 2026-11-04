"""S03 – 'You turn around... and the trail is gone.' He stops, turns back; camera drifts to over-shoulder: only jungle."""
import sys; sys.path.insert(0, '/home/user/code/amazon_short/scripts')
from shotlib import *
s, sh = setup('S03'); N = sh['frames']
E = ENV.build_env(forest_cfg(seed=33, cam=(0.2, -2.6, 1.55), density=1.35, clear=clear_view((0.2, -2.6), (0.3, 0.0), 2.0, 1.4, 1.8),
                             giants=[(-4.5, 7.5, 1.4), (5.5, 9, 1.1)], n_poles=55, wet=0.3))
T = E['terrain']
col, rig, acts = character(0.08, 0.25, ['UAL_Walk_Loop', 'UAL_Idle_Loop'])
pts = [Vector((0.05, 0.9)), Vector((0.0, 0.25)), Vector((0.05, -0.2)), Vector((0.35, -0.35)), Vector((0.5, -0.1)), Vector((0.42, 0.25))]
speed, sc = locomote(rig, T, pts, 1, 46, 'UAL_Walk_Loop', ease_in=2, ease_out=14, turn_lag=0.7)
clip(rig, acts, 'Walk_Loop', -10, dur=60, scale=sc * 1.1, blend_in=0, blend_out=8)
clip(rig, acts, 'Idle_Loop', 40, dur=N, blend_in=8, blend_out=0)
hold_first(rig)
# search: looks left, right, up — breath quickens
pose_layer(rig, 'look', merge(look_keys([(1, 0, 4), (30, -15, 0), (50, 0, -4), (60, -40, -6), (72, 35, -4), (86, 20, -10)]), breathing(1, N, 40, 2.5)))
day_light(3.8, (42, 0, 230), 0.75, 2.0)
cam = camera('CAM', (0.2, -2.6, 1.55), (0, 0, 1.5), 30)
cam_path(cam, [(1, (0.15, -2.4, 1.55), (0.05, 0.4, 1.55)), (40, (0.25, -1.9, 1.6), (0.3, 0.0, 1.55)), (N, (0.75, -0.95, 1.72), (0.0, 5.0, 1.35))])
handheld(cam, 1, N, amp=0.007, rot_amp=0.005, seed=3)
focus_on(cam, rig, 'Head', 2.8)
ENV.mist_fog(3, 32, (0.44, 0.51, 0.44), 0.6)
finish(s, 'S03'); render_if_requested()
