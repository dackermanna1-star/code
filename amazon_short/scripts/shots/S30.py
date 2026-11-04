"""S30 – 'You can last weeks without food. Water is what keeps you alive.' Exhausted, stumbling along the creek, he keeps following it."""
import sys; sys.path.insert(0, '/home/user/code/amazon_short/scripts'); sys.path.insert(0, '/home/user/code/amazon_short/scripts/shots')
from shotlib import *
import stream_set
s, sh = setup('S30'); N = sh['frames']
E = stream_set.build((4.8, -14.0), seed=301, wet=0.6, extra_clear=clear_view((6.2, -14.0), (4.2, -10.0), 1.6, 1.0, 1.2), path=dict(pts=[(4.4, -4), (4.2, -10), (3.9, -18)], width=1.3))
T = E['terrain']
col, rig, acts = character(0.92, 0.7, ['UAL_Walk_Loop', 'UAL_Zombie_Walk_Fwd_Loop'])
pts = [Vector((4.4, -6.0)), Vector((4.2, -9.0)), Vector((4.05, -12.0))]
sp_, sc = locomote(rig, T, pts, 1, N, 'UAL_Walk_Loop', ease_in=1, ease_out=10)
clip(rig, acts, 'Walk_Loop', -10, dur=N + 20, scale=sc * 1.15, blend_in=0, blend_out=0)
clip(rig, acts, 'Zombie_Walk_Fwd_Loop', -10, dur=N + 20, scale=sc * 1.15, blend_in=0, blend_out=0, influence=[(1, 0.45), (60, 0.6), (70, 0.85), (80, 0.55), (N, 0.5)])
pose_layer(rig, 'tired', merge(look_keys([(1, 0, 20), (60, 5, 25), (68, -10, 35), (78, 0, 15), (N, 10, 22)]), breathing(1, N, 24, 4.0),
                               {'spine_02': [(1, (10, 0, 0)), (66, (12, 0, 0)), (70, (22, 0, 6)), (80, (12, 0, 0)), (N, (11, 0, 0))]}))
day_light(3.2, (62, 0, 120), 0.8, 1.0, sun_col=(1.0, 0.82, 0.6), exposure=0.6)
cam = camera('CAM', (4.8, -14.0, 1.3), (2.6, -9.0, 1.0), 40)
cam_path(cam, [(1, (6.3, -14.2, 1.25 + ENV.height_at(T, 6.2, -14)), (4.4, -7.0, 1.2)), (N, (5.9, -13.6, 1.15 + ENV.height_at(T, 6.2, -14)), (4.1, -11.5, 1.2))])
handheld(cam, 1, N, amp=0.004, rot_amp=0.003, seed=30)
focus_on(cam, rig, 'Head', 3.5)
ENV.mist_fog(2, 25, (0.6, 0.6, 0.5), 0.5, grade=dict(sat=0.85, gain=(1.05, 1.0, 0.9)))
finish(s, 'S30'); render_if_requested()
