"""S16 – 'and diarrhea would drain your body even faster.' He opens his hands, lets the water fall, shakes his head."""
import sys; sys.path.insert(0, '/home/user/code/amazon_short/scripts'); sys.path.insert(0, '/home/user/code/amazon_short/scripts/shots')
from shotlib import *
import stream_set
s, sh = setup('S16'); N = sh['frames']
E = stream_set.build((4.2, 1.4), extra_clear=[(1.9, 0.0, 1.6), (3.6, 1.1, 1.4)])
bpy.data.objects['ENV_StreamWater'].location.z -= 0.12
T = E['terrain']
col, rig, acts = character(0.42, 0.8, ['UAL_Fixing_Kneeling', 'UAL_Idle_No_Loop', 'UAL_Idle_Loop'])
place(rig, T, 1.8, 0.05, -90)
fk = acts['UAL_Fixing_Kneeling']; a0, a1 = fk.frame_range
clip(rig, acts, 'Fixing_Kneeling', 1, frange=(a0 + 60, a1), blend_in=0, blend_out=8)
clip(rig, acts, 'Idle_No_Loop', int(a1 - a0 - 60) - 4, dur=N, blend_in=8, blend_out=0)
hold_first(rig)
pose_layer(rig, 'look', merge(look_keys([(1, 0, 25), (30, 0, 20), (N, 15, 5)]), breathing(1, N, 34, 3.0)))
day_light(4.0, (55, 0, 260), 0.85, 1.6, exposure=0.7)
gz = ENV.height_at(T, 3.9, 1.3)
cam = camera('CAM', (3.9, 1.3, gz + 1.2), (1.75, 0.0, gz + 0.8), 40)
cam_path(cam, [(1, (3.9, 1.35, gz + 1.0), (1.75, 0.0, gz + 0.5)), (N, (3.75, 1.2, gz + 1.35), (1.75, 0.0, gz + 1.15))])
handheld(cam, 1, N, amp=0.004, rot_amp=0.003, seed=16)
focus_on(cam, rig, 'Head', 2.8)
ENV.mist_fog(2, 25, (0.55, 0.6, 0.52), 0.45)
finish(s, 'S16'); render_if_requested()
