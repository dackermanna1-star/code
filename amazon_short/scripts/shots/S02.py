"""S02 – 'It starts with a few steps off the trail.' Walking the trail, a blue morpho catches his eye; he follows it off-trail."""
import sys; sys.path.insert(0, '/home/user/code/amazon_short/scripts')
from shotlib import *
import creatures as CR
s, sh = setup('S02'); N = sh['frames']
E = ENV.build_env(forest_cfg(seed=21, cam=(2.6, -4.2, 1.5), path=dict(pts=[(-25, 0.3), (-8, 0), (0, -0.2), (8, 0.5), (25, 0)], width=1.5),
                             clear=clear_view((2.6, -4.2), (-0.5, 0.5)) + clear_view((2.4, -3.6), (1.0, 2.6), 1.5, 1.0, 1.2), giants=[(-3.5, 6.5, 1.2), (7, 5, 1.4)], wet=0.25))
T = E['terrain']
col, rig, acts = character(0.05, 0.15, ['UAL_Walk_Loop', 'UAL_Idle_Loop'])
pts = [Vector((-3.6, 0.0)), Vector((-1.6, 0.0)), Vector((-0.1, 0.1)), Vector((0.6, 1.0)), Vector((0.9, 2.4)), Vector((1.0, 3.6))]
speed, sc = locomote(rig, T, pts, 1, N + 10, 'UAL_Walk_Loop', ease_in=1, ease_out=1)
clip(rig, acts, 'Walk_Loop', -20, dur=N + 40, scale=sc, blend_in=0, blend_out=0)
# head follows the butterfly: glance left (+y side) then commit
pose_layer(rig, 'look', merge(look_keys([(1, 0, 0), (12, 0, -3), (22, 35, -8), (34, 40, -12), (48, 10, -5), (72, 0, 0)])))
# butterfly
m, wings = CR.morpho('CR_Morpho', 0.07)
CR.flap(wings, 1, N + 10, period=6)
CR.fly_path(m, 1, N + 10, [(-0.2, 0.8, 1.9), (0.6, 1.2, 1.6), (1.0, 2.2, 1.45), (1.6, 3.6, 1.6), (1.9, 5.2, 1.4)], wobble=0.12, seed=4)
day_light(4.2, (40, 0, 215), 0.8, 1.2)
tgt = empty('FOCUS', (0, 0.4, 1.3)); tgt.parent = None
cam = camera('CAM', (2.6, -4.2, 1.45), (0, 0.5, 1.2), 32)
cam_path(cam, [(1, (2.7, -4.3, 1.45), (-1.4, 0.4, 1.25)), (N, (2.3, -3.5, 1.5), (0.9, 2.3, 1.3))])
handheld(cam, 1, N, amp=0.006, rot_amp=0.004)
focus_on(cam, rig, 'Head', 3.5)
ENV.mist_fog(3, 40, (0.46, 0.53, 0.45), 0.55)
finish(s, 'S02'); render_if_requested()
