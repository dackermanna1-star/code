import sys; sys.path.insert(0, '/home/user/code/amazon_short/scripts')
from lib import *
from mathutils import Euler
s = new_scene('Axis', (1, 1), res=(300, 450))
s.render.engine = 'BLENDER_WORKBENCH'
col, rig = get_character()
acts = append_actions(['UAL_Idle_Loop']); assign_action(rig, acts['UAL_Idle_Loop'])
camera('CAM', (0.0, -3.6, 1.2), (0, 0, 1.0), 35)
for b in ['upperarm_r', 'lowerarm_r', 'hand_r', 'Head', 'spine_02', 'clavicle_r']:
    for ax in 'XYZ':
        rig.animation_data.action = None
        for pb in rig.pose.bones: pb.rotation_mode = 'XYZ'; pb.rotation_euler = (0, 0, 0)
        e = [0, 0, 0]; e['XYZ'.index(ax)] = math.radians(50)
        rig.pose.bones[b].rotation_euler = e
        s.render.filepath = f'{R}renders/tests/axis/{b}_{ax}.png'; bpy.ops.render.render(write_still=True)
