"""S28 – 'You freeze, back away slowly, and give it space.' Side view: frozen, then slow backward steps, hands low and open."""
import sys; sys.path.insert(0, '/home/user/code/amazon_short/scripts'); sys.path.insert(0, '/home/user/code/amazon_short/scripts/shots')
from shotlib import *
import snake_set, creatures as CR
s, sh = setup('S28'); N = sh['frames']
E, T, body, head, tongue = snake_set.build((2.4, 0.2))
col, rig, acts = character(0.78, 0.65, ['UAL_Idle_Loop', 'UAL_Walk_Loop'])
place(rig, T, 0.02, 0.95, 180, f=1); place(rig, T, 0.02, 0.95, 180, f=34)
pts = [Vector((0.02, 0.95)), Vector((0.03, 1.6)), Vector((0.05, 2.4))]
sp_, sc = locomote(rig, T, pts, 34, N, 'UAL_Walk_Loop', ease_in=12, ease_out=14, backward=True)
clip(rig, acts, 'Idle_Loop', 1, dur=40, blend_in=0, blend_out=8)
clip(rig, acts, 'Walk_Loop', 30, dur=N - 26, scale=sc, blend_in=8, blend_out=8, reverse=True)
clip(rig, acts, 'Idle_Loop', N - 12, dur=30, blend_in=8, blend_out=0); hold_first(rig)
pose_layer(rig, 'hands', merge({'upperarm_r': [(1, (0, 0, 0)), (12, (25, 0, 10)), (N, (25, 0, 10))], 'upperarm_l': [(1, (0, 0, 0)), (12, (25, 0, -10)), (N, (25, 0, -10))],
                                'lowerarm_r': [(1, (0, 0, 0)), (12, (30, 0, 0)), (N, (30, 0, 0))], 'lowerarm_l': [(1, (0, 0, 0)), (12, (30, 0, 0)), (N, (30, 0, 0))]},
                               look_keys([(1, 0, 38), (N, 0, 32)]), breathing(1, N, 26, 3.5)))
CR.tongue_flicks(tongue, [20, 60, 95])
day_light(4.0, (40, 0, 150), 0.8, 0.8, exposure=0.7)
gz = ENV.height_at(T, 2.4, 0.2)
cam = camera('CAM', (2.5, 0.0, gz + 0.55), (0.0, 1.0, gz + 0.6), 32)
cam_path(cam, [(1, (1.3, -0.9, gz + 0.32), (0.0, 0.8, gz + 0.55)), (N, (1.4, -0.7, gz + 0.36), (0.0, 1.3, gz + 0.75))])
handheld(cam, 1, N, amp=0.003, rot_amp=0.002, seed=28)
focus_on(cam, head, None, 5.0)
ENV.mist_fog(2, 22, (0.55, 0.58, 0.5), 0.45)
finish(s, 'S28'); render_if_requested()
