"""S22 – 'Night falls fast. Under the canopy, it's pitch black, and the forest only gets louder.'
Time-lapse dusk -> night: light drains to blue-black, he sits huddled on a root at a giant tree, fireflies wake."""
import sys; sys.path.insert(0, '/home/user/code/amazon_short/scripts'); sys.path.insert(0, '/home/user/code/amazon_short/scripts/shots')
from shotlib import *
import stream_set, fx, creatures as CR
s, sh = setup('S22'); N = sh['frames']
E = stream_set.build((7.5, -3.2), seed=221, wet=0.6, giants=[(5.2, 1.6, 1.5), (-6.0, -6.0, 1.4)], extra_clear=clear_view((7.6, -3.4), (5.0, -0.8), 1.8, 1.2, 1.2))
T = E['terrain']
lc, _ = ENV.ph_objects('dead_tree_trunk_02')
lg = bpy.data.objects.new('PR_NightLog', None); lg.instance_type = 'COLLECTION'; lg.instance_collection = lc
lg.location = (5.25, -0.6, ENV.height_at(T, 4.9, -0.45) - 0.08); lg.scale = (0.5, 0.48, 0.48); lg.rotation_euler.z = math.radians(125); s.collection.objects.link(lg)
col, rig, acts = character(0.55, 0.2, ['UAL_Sitting_Idle_Loop'])
place(rig, T, 5.0, -0.85, 35)
clip(rig, acts, 'Sitting_Idle_Loop', 1, dur=N + 5, blend_in=0, blend_out=0)
hug = {'spine_02': [(1, (0, 0, 0)), (60, (0, 0, 0)), (110, (14, 0, 0)), (N, (16, 0, 0))], 'spine_03': [(1, (0, 0, 0)), (110, (8, 0, 0)), (N, (9, 0, 0))]}
pose_layer(rig, 'huddle', merge(hug, look_keys([(1, 0, 10), (80, 25, 0), (120, -30, -5), (160, 10, 15), (N, 0, 20)]), breathing(1, N, 36, 2.5),
                               shiver(110, N, 0.8, seed=2)))
sun = day_light(3.0, (75, 0, 250), 0.8, 1.0, sun_col=(1.0, 0.6, 0.35), fill=5500, exposure=0.6)
fill = bpy.data.objects['LT_CanopyFill']
fx.animate_light(sun, [(1, 3.5), (70, 0.4), (110, 0.0)])
fx.animate_light(fill, [(1, 5500), (60, 2000), (110, 120), (N, 90)])
fx.animate_light(fill, [(1, (0.95, 0.8, 0.6)), (110, (0.35, 0.5, 1.0))], 'color')
fx.animate_world_strength([(1, 1.2), (80, 0.25), (120, 0.03), (N, 0.025)])
moon = ENV.area_light('LT_MoonRim', (2.5, 2.2, 4.0), (5.0, -0.85, 1.0), 0, 3.0, (0.45, 0.6, 1.0))
fx.animate_light(moon, [(1, 0), (90, 0), (130, 380), (N, 400)])
key = ENV.area_light('LT_MoonKey', (6.6, -2.6, 1.8), (5.0, -0.85, 1.0), 0, 1.5, (0.5, 0.62, 1.0))
fx.animate_light(key, [(1, 0), (90, 0), (130, 30), (N, 30)])
CR.fireflies(26, (5.0, -1.5, 0.3), 3.5, 100, N, seed=22, strength=80)
cam = camera('CAM', (7.6, -3.4, 1.2), (5.0, -0.8, 0.9), 30)
cam_path(cam, [(1, (7.8, -3.6, 1.25), (5.0, -0.8, 1.0)), (N, (6.9, -2.6, 1.05), (5.0, -0.85, 0.95))])
focus_on(cam, rig, 'Head', 3.0)
ENV.mist_fog(2, 25, (0.4, 0.45, 0.45), 0.45, grade=dict(gain=(0.9, 0.98, 1.1), sat=0.8))
# mist colour fades to night blue-black
mx = [n for n in s.node_tree.nodes if n.bl_idname == 'CompositorNodeMixRGB' and n.blend_type == 'MIX'][0]
for f, c in ((1, (0.5, 0.48, 0.4, 1)), (110, (0.012, 0.018, 0.03, 1)), (N, (0.01, 0.015, 0.028, 1))):
    mx.inputs[2].default_value = c; mx.inputs[2].keyframe_insert('default_value', frame=f)
finish(s, 'S22'); render_if_requested()
