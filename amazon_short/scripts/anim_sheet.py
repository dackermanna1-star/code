import sys; sys.path.insert(0, '/home/user/code/amazon_short/scripts')
from lib import *
names = sys.argv[sys.argv.index('--')+1].split(',')
s = new_scene('Sheet', (1, 10), res=(400, 600))
s.render.engine = 'BLENDER_WORKBENCH'; s.display.shading.light = 'STUDIO'; s.display.shading.color_type = 'MATERIAL'
col, rig = get_character()
acts = append_actions(['UAL_' + n for n in names])
camera('CAM', (2.4, -3.0, 1.2), (0, 0, 0.85), 35)
for n in names:
    a = acts['UAL_' + n]; assign_action(rig, a)
    f0, f1 = a.frame_range
    for i in range(5):
        f = f0 + (f1 - f0) * i / 4; s.frame_set(int(f))
        s.render.filepath = f'{R}renders/tests/sheet/{n}_{i}.png'; bpy.ops.render.render(write_still=True)
