"""S04 – 'Every direction looks the same.' Slow high orbit around him as he turns, scanning; identical green walls."""
import sys; sys.path.insert(0, '/home/user/code/amazon_short/scripts')
from shotlib import *
s, sh = setup('S04'); N = sh['frames']
E = ENV.build_env(forest_cfg(seed=41, cam=(0, 0, 3), density=1.4, clear=[(0, 0, 2.2)] + [(3.4 * math.cos(math.radians(a)), 3.4 * math.sin(math.radians(a)), 1.2) for a in range(-30, 65, 10)], giants=[(-6, 5, 1.3), (6.5, -4, 1.2), (2, 8, 1.0)], n_poles=60, wet=0.3))
T = E['terrain']
col, rig, acts = character(0.1, 0.3, ['UAL_Idle_Loop'])
place(rig, T, 0, 0, 0, f=1); place(rig, T, 0, 0, -50, f=N)
clip(rig, acts, 'Idle_Loop', 1, dur=N + 5, blend_in=0, blend_out=0)
pose_layer(rig, 'look', merge(look_keys([(1, 30, -5), (20, -10, -8), (40, -45, -2), (63, -20, -12)]), breathing(1, N, 36, 2.8)))
day_light(3.5, (45, 0, 160), 0.75, 0.4)
cam = camera('CAM', (3, 0, 2.6), (0, 0, 1.2), 24)
keys = []
for i in range(5):
    a = math.radians(-20 + 70 * i / 4); f = 1 + int((N - 1) * i / 4)
    keys.append((f, (3.4 * math.cos(a), 3.4 * math.sin(a), 2.7 - 0.2 * i / 4), (0, 0, 1.2)))
cam_path(cam, keys)
focus_on(cam, rig, 'spine_03', 4)
ENV.mist_fog(2, 26, (0.44, 0.51, 0.44), 0.6)
finish(s, 'S04'); render_if_requested()
