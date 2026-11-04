"""S32 – 'And then you hear it... an engine.' Close on his face snapping toward the sound; cut: a canoe rounds the river bend."""
import sys; sys.path.insert(0, '/home/user/code/amazon_short/scripts'); sys.path.insert(0, '/home/user/code/amazon_short/scripts/shots')
from shotlib import *
import river_set
s, sh = setup('S32'); N = sh['frames']
E = river_set.build((1.5, -5.0), extra_clear=[(0.55, -3.3, 1.6)])
T = E['terrain']
col, rig, acts = character(0.95, 0.6, ['UAL_Idle_Loop'])
place(rig, T, 0.55, -3.3, 8)
clip(rig, acts, 'Idle_Loop', 1, dur=N + 5, blend_in=0, blend_out=0)
pose_layer(rig, 'look', merge(look_keys([(1, -10, -4), (16, -12, -4), (24, 55, -2), (40, 62, 0), (N, 60, 0)]), breathing(1, N, 22, 3.0)))
boat, driver = river_set.boat_with_driver([(1, (-140, -40), 20), (N, (-112, -32), 12)])
hd = rig.matrix_world @ rig.pose.bones['Head'].head if False else Vector((0.55, -3.3, ENV.height_at(T, 0.55, -3.3) + 1.62))
c1 = camera('CAM_Face', hd + Vector((0.55, -0.45, -0.02)), hd, 55)
cam_path(c1, [(1, hd + Vector((0.6, -0.5, -0.02)), hd), (48, hd + Vector((0.5, -0.42, -0.02)), hd)])
focus_on(c1, rig, 'Head', 2.0)
c2 = camera('CAM_Boat', hd + Vector((0.6, 0.3, 0.1)), (-125, -36, 0.5), 120)
cam_path(c2, [(49, hd + Vector((0.5, 0.35, 0.05)), (-126, -37, 0.4)), (N, hd + Vector((0.45, 0.3, 0.05)), (-113, -33, 0.4))])
focus_on(c2, boat, None, 4.0)
for c in (c1, c2): handheld(c, 1, N, amp=0.003, rot_amp=0.002, seed=32); c.data.clip_end = 2000
s.camera = c1; s.timeline_markers.new('face', frame=1).camera = c1; s.timeline_markers.new('boat', frame=49).camera = c2
ENV.mist_fog(8, 500, (0.95, 0.75, 0.55), 0.0, grade=dict(gain=(1.06, 0.99, 0.9), sat=1.05))
finish(s, 'S32'); render_if_requested()
