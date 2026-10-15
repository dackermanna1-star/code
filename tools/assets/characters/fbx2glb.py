# Blender headless: convert animation FBX files to skeleton+animation GLBs (meshes removed).
# usage: blender --background --python fbx2glb.py -- out_dir file1.fbx [file2.fbx ...]
# Each output GLB is named after the input file; its single animation is named after the file too.
import bpy, sys, os
argv = sys.argv[sys.argv.index('--') + 1:]
out_dir = argv[0]
os.makedirs(out_dir, exist_ok=True)
for f in argv[1:]:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    try:
        bpy.ops.import_scene.fbx(filepath=f, automatic_bone_orientation=False, ignore_leaf_bones=False, use_anim=True)
    except Exception as e:
        print('FAIL', f, e); continue
    for o in list(bpy.data.objects):
        if o.type not in ('ARMATURE', 'EMPTY'):
            bpy.data.objects.remove(o)
    base = os.path.splitext(os.path.basename(f))[0].replace('.max', '')
    acts = list(bpy.data.actions)
    arm = [o for o in bpy.data.objects if o.type == 'ARMATURE']
    if not arm:
        print('NOARM', f); continue
    arm = arm[0]
    if acts:
        # keep the action assigned to the armature; name it after the file
        a = arm.animation_data.action if arm.animation_data and arm.animation_data.action else acts[0]
        for o in acts:
            if o is not a:
                bpy.data.actions.remove(o)
        a.name = base
        fr = a.frame_range
        bpy.context.scene.frame_start = int(fr[0]); bpy.context.scene.frame_end = int(fr[1])
    out = os.path.join(out_dir, base + '.glb')
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_animations=True, export_skins=False,
                              export_morph=False, export_yup=True, export_force_sampling=True,
                              export_animation_mode='ACTIONS', export_anim_single_armature=True,
                              export_rest_position_armature=True, export_def_bones=False,
                              export_frame_range=False, export_optimize_animation_size=False)
    print('OK', out, 'fps', bpy.context.scene.render.fps, 'range', bpy.context.scene.frame_start, bpy.context.scene.frame_end)
