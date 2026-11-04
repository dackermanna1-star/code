"""S08 – 'But that only works if someone knows where you are. And nobody does.' Slow push-in on his face."""
import sys; sys.path.insert(0, '/home/user/code/amazon_short/scripts'); sys.path.insert(0, '/home/user/code/amazon_short/scripts/shots')
from shotlib import *
import rest_set
s, sh = setup('S08'); N = sh['frames']
E = rest_set.build((1.0, -1.6), clear_view((1.2, -1.8), (0, 0), 1.6, 1.0, 1.0))
T = E['terrain']
col, rig, acts = character(0.14, 0.45, ['UAL_Sitting_Idle_Loop'])
place(rig, T, 0.0, -0.15, 0)
clip(rig, acts, 'Sitting_Idle_Loop', 1, dur=N + 5, blend_in=0, blend_out=0)
# looks into the forest, then down; a slow defeated head drop on 'nobody does'
pose_layer(rig, 'look', merge(look_keys([(1, -15, 8), (30, -25, 4), (55, 20, 0), (80, 30, 2), (100, 10, 10), (N, 0, 22)]), breathing(1, N, 50, 3.2)))
hd = empty('HEADTGT'); c = hd.constraints.new('COPY_LOCATION'); c.target = rig; c.subtarget = 'Head'
bpy.context.view_layer.update(); s.frame_set(60)
H = rig.matrix_world @ rig.pose.bones['Head'].head
cam = camera('CAM', H + Vector((1.2, -1.75, 0.05)), H, 50)
cam_path(cam, [(1, H + Vector((1.25, -1.8, 0.05)), H + Vector((0, 0, -0.12))), (N, H + Vector((0.7, -1.0, 0.04)), H + Vector((0, 0, 0.0)))])
handheld(cam, 1, N, amp=0.002, rot_amp=0.002, seed=8)
focus_on(cam, rig, 'Head', 2.0)
ENV.mist_fog(2, 22, (0.44, 0.51, 0.44), 0.5)
finish(s, 'S08'); render_if_requested()
