"""S23 – 'Soaked to the skin, you shiver, even in the tropics.' Close-up in near-darkness, moon rim, shaking, fireflies drifting."""
import sys; sys.path.insert(0, '/home/user/code/amazon_short/scripts'); sys.path.insert(0, '/home/user/code/amazon_short/scripts/shots')
from shotlib import *
import stream_set, fx, creatures as CR
s, sh = setup('S23'); N = sh['frames']
E = stream_set.build((6.0, -2.0), seed=221, wet=0.6, giants=[(5.2, 1.6, 1.5), (-6.0, -6.0, 1.4)], extra_clear=clear_view((6.0, -2.0), (5.0, -0.8), 1.6, 1.0, 1.2), density=0.8)
T = E['terrain']
lc, _ = ENV.ph_objects('dead_tree_trunk_02')
lg = bpy.data.objects.new('PR_NightLog', None); lg.instance_type = 'COLLECTION'; lg.instance_collection = lc
lg.location = (5.25, -0.6, ENV.height_at(T, 4.9, -0.45) - 0.08); lg.scale = (0.5, 0.48, 0.48); lg.rotation_euler.z = math.radians(125); s.collection.objects.link(lg)
col, rig, acts = character(0.6, 0.55, ['UAL_Sitting_Idle_Loop'])
place(rig, T, 5.0, -0.85, 35)
clip(rig, acts, 'Sitting_Idle_Loop', 1, dur=N + 5, blend_in=0, blend_out=0)
hug = {'spine_02': [(1, (16, 0, 0))], 'spine_03': [(1, (9, 0, 0))]}
pose_layer(rig, 'huddle', merge(hug, look_keys([(1, 0, 18), (40, 30, 10), (70, -20, 14), (N, 5, 20)]), breathing(1, N, 22, 3.0), shiver(1, N, 1.4, seed=3)))
ENV.world_hdri(0.02, 1.0, 'rainforest_trail_2k.hdr', (0.3, 0.4, 0.7, 1)); s.view_settings.exposure = 0.9
moon = ENV.area_light('LT_MoonRim', (3.0, 1.8, 3.2), (5.0, -0.85, 1.1), 420, 2.5, (0.45, 0.6, 1.0))
key = ENV.area_light('LT_MoonKey', (6.2, -2.2, 1.7), (5.0, -0.85, 1.1), 22, 1.0, (0.5, 0.62, 1.0))
CR.fireflies(18, (5.2, -1.4, 0.4), 2.5, 1, N, seed=23, strength=90)
gz = ENV.height_at(T, 5.0, -0.85)
cam = camera('CAM', (5.75, -1.65, gz + 1.0), (5.0, -0.85, gz + 1.0), 50)
cam_path(cam, [(1, (5.8, -1.72, gz + 1.0), (5.0, -0.85, gz + 1.0)), (N, (5.62, -1.5, gz + 1.0), (5.0, -0.85, gz + 0.98))])
handheld(cam, 1, N, amp=0.002, rot_amp=0.002, seed=23)
focus_on(cam, rig, 'Head', 1.8)
ENV.mist_fog(3, 20, (0.01, 0.015, 0.028), 0.6, grade=dict(gain=(0.9, 0.98, 1.12), sat=0.75, vignette=0.5))
finish(s, 'S23'); render_if_requested()
