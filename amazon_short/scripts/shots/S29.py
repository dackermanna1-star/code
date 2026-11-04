"""S29 – 'You're starving, but unknown berries and mushrooms could poison you.' Crouched, gaunt; reaches for red berries, stops, shakes his head."""
import sys; sys.path.insert(0, '/home/user/code/amazon_short/scripts')
from shotlib import *
import creatures as CR
s, sh = setup('S29'); N = sh['frames']
E = ENV.build_env(forest_cfg(seed=291, cam=(1.6, -1.6, 1.0), density=1.1, clear=clear_view((1.6, -1.6), (0, 0), 1.5, 1.0, 1.5), giants=[(-3.5, 4.5, 1.3)], n_poles=45, wet=0.5))
T = E['terrain']
col, rig, acts = character(0.86, 0.6, ['UAL_Crouch_Idle_Loop'])
place(rig, T, 0, 0, 25)
clip(rig, acts, 'Crouch_Idle_Loop', 1, dur=N + 5, blend_in=0, blend_out=0)
reach = {'upperarm_r': [(1, (0, 0, 0)), (20, (0, 0, 0)), (40, (40, 0, -10)), (55, (42, 0, -12)), (68, (10, 0, 0)), (N, (0, 0, 0))],
         'lowerarm_r': [(1, (0, 0, 0)), (20, (0, 0, 0)), (40, (-20, 0, 0)), (55, (-22, 0, 0)), (68, (0, 0, 0)), (N, (0, 0, 0))]}
nod = look_keys([(1, 0, 20), (40, 10, 25), (56, 10, 22), (66, 0, 12), (74, 22, 10), (82, -22, 10), (90, 20, 12), (98, -14, 12), (N, 0, 18)])
pose_layer(rig, 'reach', merge(reach, nod, breathing(1, N, 30, 3.0)))
bpy.context.view_layer.update(); s.frame_set(45)
hand = rig.matrix_world @ rig.pose.bones['hand_r'].tail
bush_c = ENV.plant_lib()['PL_Shrub_0']
bush = bpy.data.objects.new('PR_BerryBush', None); bush.instance_type = 'COLLECTION'; bush.instance_collection = bush_c
bush.location = (hand.x + 0.15, hand.y - 0.05, ENV.height_at(T, hand.x, hand.y)); bush.scale = (0.8,) * 3; s.collection.objects.link(bush)
CR.berries('PR_Berry', hand + Vector((0.09, 0.0, -0.02)), n=16, seed=29)
CR.berries('PR_Berry2', hand + Vector((0.16, 0.1, 0.06)), n=10, seed=30)
bpy.ops.import_scene.gltf(filepath=ASSETS + 'quaternius/Stylized Nature MegaKit/glTF/Mushroom_Common.gltf')
for k, o in enumerate([o for o in bpy.context.selected_objects if o.type == 'MESH']):
    o.location = (hand.x - 0.15, hand.y + 0.25, ENV.height_at(T, hand.x - 0.15, hand.y + 0.25)); o.scale = (0.35,) * 3
day_light(3.2, (55, 0, 140), 0.75, 0.8, exposure=0.6)
cam = camera('CAM', (1.5, -1.5, 0.9), (0, 0, 0.6), 35)
cam_path(cam, [(1, (1.55, -1.55, ENV.height_at(T, 1.5, -1.5) + 0.85), (0.1, 0.0, ENV.height_at(T, 0, 0) + 0.55)), (N, (1.25, -1.25, ENV.height_at(T, 1.2, -1.2) + 0.8), (0.0, 0.05, ENV.height_at(T, 0, 0) + 0.75))])
handheld(cam, 1, N, amp=0.003, rot_amp=0.002, seed=29)
focus_on(cam, rig, 'Head', 3.0)
ENV.mist_fog(2, 22, (0.55, 0.58, 0.5), 0.45, grade=dict(sat=0.88))
finish(s, 'S29'); render_if_requested()
