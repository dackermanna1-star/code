"""S19 – 'And the stream gives you a plan.' Rain easing; he watches the current, follows it with his eyes downstream."""
import sys; sys.path.insert(0, '/home/user/code/amazon_short/scripts'); sys.path.insert(0, '/home/user/code/amazon_short/scripts/shots')
from shotlib import *
import stream_set, fx
s, sh = setup('S19'); N = sh['frames']
E = stream_set.build((2.6, 2.6), seed=191, wet=0.85, rain=0.4, extra_clear=clear_view((2.6, 2.6), (2.2, 0.2), 1.8, 1.0, 1.4))
T = E['terrain']
col, rig, acts = character(0.48, 0.3, ['UAL_Idle_Loop'])
place(rig, T, 2.2, 0.2, -95)
clip(rig, acts, 'Idle_Loop', 1, dur=N + 5, blend_in=0, blend_out=0)
pose_layer(rig, 'look', merge(look_keys([(1, 20, 18), (22, 0, 16), (45, -45, 8), (N, -55, 4)]), breathing(1, N, 38, 2.0)))
day_light(2.2, (55, 0, 230), 0.75, 1.0, fill=5200, exposure=0.55)
fx.wet_leaves(0.4)
fx.rain((2.0, 0, 0), (8, 8, 7), 2500, 7.0)
cam = camera('CAM', (2.6, 2.6, 1.5), (2.0, 0.0, 1.5), 40)
cam_path(cam, [(1, (2.7, 2.6, 1.45 + ENV.height_at(T, 2.6, 2.6)), (1.8, 0.0, 1.35)), (N, (2.75, 2.2, 1.5 + ENV.height_at(T, 2.6, 2.6)), (1.2, -2.0, 0.6))])
handheld(cam, 1, N, amp=0.004, rot_amp=0.003, seed=19)
focus_on(cam, rig, 'Head', 2.8)
ENV.mist_fog(2, 22, (0.52, 0.57, 0.53), 0.55)
finish(s, 'S19'); render_if_requested()
