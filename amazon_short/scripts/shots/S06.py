"""S06 – 'and your phone has no signal.' Over-shoulder: he lifts the phone higher, 'No Service', 'Searching for signal…'"""
import sys; sys.path.insert(0, '/home/user/code/amazon_short/scripts')
from shotlib import *
import creatures as CR
s, sh = setup('S06'); N = sh['frames']
E = ENV.build_env(forest_cfg(seed=61, cam=(0.3, 0.4, 1.6), density=1.2, clear=[(0, 0, 1.8)], giants=[(-3, -6, 1.3)], n_poles=50))
T = E['terrain']
col, rig, acts = character(0.12, 0.35, ['UAL_Idle_Lantern_Loop', 'UAL_Idle_Loop'])
place(rig, T, 0, 0, 0)
clip(rig, acts, 'Idle_Lantern_Loop', 1, dur=N + 5, blend_in=0, blend_out=0)
# raise the phone higher hunting for signal, tilt head to read it
pose_layer(rig, 'raise', merge({'upperarm_r': [(1, (0, 0, 0)), (25, (0, 0, 0)), (50, (-25, 0, -18)), (N, (-28, 0, -20))],
                                 'lowerarm_r': [(1, (0, 0, 0)), (25, (0, 0, 0)), (50, (-8, 0, 0)), (N, (-8, 0, 0))],
                                 'hand_r': [(1, (-20, 0, 0)), (50, (-35, 0, 0)), (N, (-35, 0, 0))]},
                                look_keys([(1, 0, 18), (25, 0, 20), (50, 0, 2), (N, 3, 0)])))
ph, scr, em = CR.phone('PR_Phone', screen_img=R + 'assets/gfx/phone_screen.png')
cl = ph.constraints.new('COPY_LOCATION'); cl.target = rig; cl.subtarget = 'hand_r'; cl.head_tail = 1.0; cl.use_offset = True
tt = ph.constraints.new('TRACK_TO'); tt.target = rig; tt.subtarget = 'Head'; tt.track_axis = 'TRACK_Z'; tt.up_axis = 'UP_Y'
ph.scale = (1, 1, 1)
bpy.context.view_layer.update(); s.frame_set(45)
_h = rig.matrix_world @ rig.pose.bones['hand_r'].tail; _hd = rig.matrix_world @ rig.pose.bones['Head'].head
ph.location = (_hd - _h).normalized() * 0.05 + Vector((0, 0, 0.02))
day_light(3.0, (40, 0, 120), 0.8, 0.5)
bpy.context.view_layer.update(); s.frame_set(45)
P = ph.matrix_world.translation.copy(); Hd = (rig.matrix_world @ rig.pose.bones['Head'].head)
side = (P - Hd).cross(Vector((0, 0, 1))).normalized()
cam = camera('CAM', Hd + (P - Hd) * 0.15 + Vector((0, 0, 0.12)) - side * 0.16, P, 45)
tc = track_cam(cam, ph)
handheld(cam, 1, N, amp=0.004, rot_amp=0.003)
focus_on(cam, ph, None, 2.0)
ENV.mist_fog(2, 25, (0.44, 0.51, 0.44), 0.5)
finish(s, 'S06'); render_if_requested()
