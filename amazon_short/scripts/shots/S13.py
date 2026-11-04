"""S13 – 'You find a stream.' From behind: he parts the last leaves; the creek glints below."""
import sys; sys.path.insert(0, '/home/user/code/amazon_short/scripts'); sys.path.insert(0, '/home/user/code/amazon_short/scripts/shots')
from shotlib import *
import stream_set
s, sh = setup('S13'); N = sh['frames']
E = stream_set.build((5.2, 1.0), extra_clear=[(4.4, 0.6, 1.6), (5.6, 1.1, 2.2), (6.4, 1.3, 2.4)])
T = E['terrain']
col, rig, acts = character(0.4, 0.9, ['UAL_Walk_Loop', 'UAL_Idle_Loop'])
pts = [Vector((5.0, 1.0)), Vector((3.9, 0.5)), Vector((3.2, 0.25))]
sp_, sc = locomote(rig, T, pts, 1, 34, 'UAL_Walk_Loop', ease_in=1, ease_out=12)
clip(rig, acts, 'Walk_Loop', -10, dur=50, scale=sc, blend_in=0, blend_out=6)
clip(rig, acts, 'Idle_Loop', 30, dur=N, blend_in=6, blend_out=0); hold_first(rig)
pose_layer(rig, 'look', look_keys([(1, 0, 0), (26, 0, 10), (N, -10, 22)]))
P = ENV.plant_lib()
for i, (x, y, sgn) in enumerate([(2.75, 0.95, 1), (2.8, -0.45, -1)]):
    o = bpy.data.objects.new(f'HERO_Leaf_{i}', None); o.instance_type = 'COLLECTION'; o.instance_collection = P['PL_Philodendron_0']
    o.location = (x, y, ENV.height_at(T, x, y)); s.collection.objects.link(o)
    for f, r in ((1, 0), (10, 0), (18, 25 * sgn), (30, 14 * sgn), (N, 10 * sgn)):
        o.rotation_euler.x = math.radians(r); o.keyframe_insert('rotation_euler', index=0, frame=f)
day_light(4.0, (55, 0, 260), 0.85, 1.6, exposure=0.7)
cam = camera('CAM', (5.6, 1.2, 1.75), (2.0, 0.0, 0.6), 30)
cam_path(cam, [(1, (6.2, 1.3, 2.1), (3.0, 0.3, 0.9)), (N, (5.4, 1.0, 2.2), (0.8, -0.3, -0.2))])
handheld(cam, 1, N, amp=0.005, rot_amp=0.004, seed=13)
focus_on(cam, rig, 'Head', 4.0)
ENV.mist_fog(2, 25, (0.55, 0.6, 0.52), 0.5)
finish(s, 'S13'); render_if_requested()
