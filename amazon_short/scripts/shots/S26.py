"""S26 – 'Then you nearly step on a fer-de-lance,' Ground level: a camouflaged lancehead in the litter; a boot comes down inches away."""
import sys; sys.path.insert(0, '/home/user/code/amazon_short/scripts'); sys.path.insert(0, '/home/user/code/amazon_short/scripts/shots')
from shotlib import *
import snake_set, creatures as CR
s, sh = setup('S26'); N = sh['frames']
E, T, body, head, tongue = snake_set.build((0.15, -0.9))
col, rig, acts = character(0.78, 0.6, ['UAL_Walk_Loop', 'UAL_Idle_Loop', 'UAL_Hit_Chest'])
pts = [Vector((0.05, 3.6)), Vector((0.0, 2.0)), Vector((0.02, 0.95))]
sp_, sc = locomote(rig, T, pts, 1, 44, 'UAL_Walk_Loop', ease_in=1, ease_out=6)
clip(rig, acts, 'Walk_Loop', -10, dur=60, scale=sc, blend_in=0, blend_out=4)
clip(rig, acts, 'Hit_Chest', 42, blend_in=3, blend_out=6, scale=1.6)
clip(rig, acts, 'Idle_Loop', 58, dur=N, blend_in=8, blend_out=0); hold_first(rig)
pose_layer(rig, 'look', look_keys([(1, 0, 15), (40, 0, 20), (46, 0, 40), (N, 0, 38)]))
CR.tongue_flicks(tongue, [10, 34, 58])
day_light(4.0, (40, 0, 150), 0.8, 0.8, exposure=0.7)
gz = ENV.height_at(T, 0.15, -0.9)
cam = camera('CAM', (0.18, -0.85, gz + 0.12), (0.0, 1.5, gz + 0.25), 28)
cam_path(cam, [(1, (0.2, -0.9, gz + 0.11), (0.0, 1.5, gz + 0.3)), (N, (0.16, -0.75, gz + 0.12), (0.0, 1.2, gz + 0.35))])
focus_on(cam, head, None, 3.2)
ENV.mist_fog(2, 22, (0.55, 0.58, 0.5), 0.45)
finish(s, 'S26'); render_if_requested()
