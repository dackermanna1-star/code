"""Collect all Universal Animation Library actions (CC0) into blend/anim_lib.blend (no root motion)."""
import bpy
Q = '/home/user/code/amazon_short/assets/quaternius/'
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.render.fps = 30
for f in [Q + 'Universal Animation Library[Standard]/Unreal-Godot/UAL1_Standard.glb',
          Q + 'Universal Animation Library 2[Standard]/Unreal-Godot/UAL2_Standard.glb']:
    bpy.ops.import_scene.gltf(filepath=f)
for a in list(bpy.data.actions):
    a.use_fake_user = True
    a.name = 'UAL_' + a.name
for o in list(bpy.data.objects): bpy.data.objects.remove(o)
bpy.ops.outliner.orphans_purge(do_recursive=True) if False else None
bpy.ops.wm.save_as_mainfile(filepath='/home/user/code/amazon_short/blend/anim_lib.blend')
print('ACTIONS', len(bpy.data.actions), [a.name for a in bpy.data.actions][:5])
