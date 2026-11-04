"""S12 – 'You're soaking wet, but your body can't cool down.' Pushing through leaves, shirt soaked; stops, wipes brow."""
import sys; sys.path.insert(0, '/home/user/code/amazon_short/scripts')
from shotlib import *
s, sh = setup('S12'); N = sh['frames']
E = ENV.build_env(forest_cfg(seed=121, cam=(2.6, -1.0, 1.5), density=1.4, clear=clear_view((2.6, -1.0), (0, 0.2), 1.8, 1.0, 1.0) + [(0, 2.0, 1.0), (0, -1.6, 1.0)],
                             giants=[(-4, 4, 1.3)], n_poles=50, wet=0.35))
T = E['terrain']
col, rig, acts = character(0.38, 1.0, ['UAL_Walk_Loop', 'UAL_Idle_Loop'])
pts = [Vector((0.1, 2.6)), Vector((0.0, 1.0)), Vector((0.0, 0.0))]
sp_, sc = locomote(rig, T, pts, 1, 58, 'UAL_Walk_Loop', ease_in=1, ease_out=16)
clip(rig, acts, 'Walk_Loop', -10, dur=70, scale=sc, blend_in=0, blend_out=8)
clip(rig, acts, 'Idle_Loop', 52, dur=N, blend_in=8, blend_out=0)
hold_first(rig)
# wipe brow with forearm (hand-keyed), head dips, heavy breathing
W = {'upperarm_r': [(60, (0, 0, 0)), (72, (50, 0, -75)), (80, (55, 0, -80)), (92, (50, 0, -72)), (104, (0, 0, 0))],
     'lowerarm_r': [(60, (0, 0, 0)), (72, (30, 0, -112)), (80, (30, 0, -128)), (92, (30, 0, -112)), (104, (0, 0, 0))]}
pose_layer(rig, 'wipe', merge(W, look_keys([(1, 0, 10), (60, 0, 8), (74, -8, 18), (90, 10, 14), (N, 0, 6)]), breathing(1, N, 28, 4.0)))
# hero leaves he brushes past (they swing aside then settle)
P = ENV.plant_lib()
for i, (x, y, a) in enumerate([(0.45, 1.6, 30), (-0.5, 1.1, -25), (0.5, 0.7, 40)]):
    o = bpy.data.objects.new(f'HERO_Leaf_{i}', None); o.instance_type = 'COLLECTION'; o.instance_collection = P['PL_Philodendron_1']
    o.location = (x, y, ENV.height_at(T, x, y)); s.collection.objects.link(o); o.rotation_euler.z = math.radians(a)
    fh = int(1 + (2.6 - y) / 2.6 * 50)
    for f, r in ((1, 0), (fh - 4, 0), (fh + 2, 18 if x > 0 else -18), (fh + 12, -6 if x > 0 else 6), (fh + 24, 2 if x > 0 else -2), (fh + 40, 0)):
        o.rotation_euler.y = math.radians(r); o.keyframe_insert('rotation_euler', index=1, frame=f)
day_light(4.0, (55, 0, 230), 0.85, 1.6, sun_col=(1.0, 0.9, 0.75), exposure=0.75)
cam = camera('CAM', (2.6, -1.0, 1.5), (0, 0.5, 1.3), 35)
cam_path(cam, [(1, (2.5, -0.6, 1.45), (0.0, 2.0, 1.3)), (N, (1.8, -1.2, 1.55), (0.0, 0.0, 1.45))])
handheld(cam, 1, N, amp=0.005, rot_amp=0.004, seed=12)
focus_on(cam, rig, 'Head', 2.8)
ENV.mist_fog(1.5, 18, (0.62, 0.66, 0.55), 0.5, grade=dict(gain=(1.05, 1.0, 0.9)))
finish(s, 'S12'); render_if_requested()
