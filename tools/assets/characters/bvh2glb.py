# Blender headless: BVH -> skeleton+animation GLB.  usage: blender -b -P bvh2glb.py -- out_dir a.bvh [b.bvh ...]
import bpy, sys, os
argv = sys.argv[sys.argv.index('--') + 1:]
out_dir = argv[0]; os.makedirs(out_dir, exist_ok=True)
for f in argv[1:]:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_anim.bvh(filepath=f, axis_forward='-Z', axis_up='Y', global_scale=1.0, use_fps_scale=False,
                            update_scene_fps=True, update_scene_duration=True, rotate_mode='NATIVE')
    arm = [o for o in bpy.data.objects if o.type == 'ARMATURE'][0]
    base = os.path.splitext(os.path.basename(f))[0]
    if arm.animation_data and arm.animation_data.action:
        arm.animation_data.action.name = base
    out = os.path.join(out_dir, base + '.glb')
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_animations=True, export_skins=False,
                              export_yup=True, export_force_sampling=True, export_animation_mode='ACTIONS',
                              export_rest_position_armature=True, export_def_bones=False, export_frame_range=False,
                              export_optimize_animation_size=False)
    print('OK', out, bpy.context.scene.render.fps, bpy.context.scene.frame_end)
