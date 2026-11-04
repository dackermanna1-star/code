"""S17 – 'Then the afternoon rain arrives.' Thunder, the light drops, a wall of rain sweeps through; leaves shudder."""
import sys; sys.path.insert(0, '/home/user/code/amazon_short/scripts'); sys.path.insert(0, '/home/user/code/amazon_short/scripts/shots')
from shotlib import *
import stream_set, fx
s, sh = setup('S17'); N = sh['frames']
E = stream_set.build((5.5, -3.5), seed=171, wet=0.9, rain=1.0, extra_clear=clear_view((5.5, -3.5), (3.0, -0.5)))
T = E['terrain']
col, rig, acts = character(0.45, 0.5, ['UAL_Idle_Loop'])
place(rig, T, 3.0, -0.5, -140)
clip(rig, acts, 'Idle_Loop', 1, dur=N + 5, blend_in=0, blend_out=0)
pose_layer(rig, 'look', merge(look_keys([(1, 0, 5), (14, 10, -25), (40, -10, -30), (N, 0, -15)]), breathing(1, N, 34, 2.5)))
sun = day_light(1.2, (60, 0, 200), 0.6, 1.0, fill=4500, fill_col=(0.8, 0.88, 0.95), exposure=0.35)
fx.overcast(0.35)
fill = bpy.data.objects['LT_CanopyFill']
fx.animate_light(fill, [(1, 6500), (20, 3500), (N, 3200)])
fx.lightning(fill, [16], peak=4.0)
fx.rain((4.5, -2.0, 0), (12, 12, 8), 14000, 9.0, amount_keys=[(1, 0.05), (30, 0.7), (N, 1.0)])
fx.wet_leaves(0.35); fx.stronger_wind(2.5, 2.5)
cam = camera('CAM', (5.5, -3.5, 1.1), (3.0, -0.5, 1.8), 26)
cam_path(cam, [(1, (5.6, -3.6, 1.05), (3.0, -0.5, 1.9)), (N, (5.2, -3.1, 1.15), (3.0, -0.5, 2.2))])
handheld(cam, 1, N, amp=0.005, rot_amp=0.004, seed=17)
focus_on(cam, rig, 'Head', 3.5)
ENV.mist_fog(1.5, 18, (0.5, 0.55, 0.55), 0.65, grade=dict(gain=(0.95, 1.0, 1.05), sat=0.85))
finish(s, 'S17'); render_if_requested()
