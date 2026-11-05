"""Bake all shot animation into anim.blend.
Run: blender -b /opt/work/blend/master.blend --python build_anim.py -- /opt/work/blend/anim.blend [SH05,SH09,...]"""
import bpy, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import shots
argv = sys.argv[sys.argv.index("--") + 1:]
out = argv[0]; ids = argv[1].split(",") if len(argv) > 1 and argv[1] else None
bpy.context.scene.frame_start = 1; bpy.context.scene.frame_end = 3945
bpy.context.scene.render.fps = 30
shots.build(ids)
# remove imported BVH source armatures before saving
for o in list(bpy.data.objects):
    if o.type == "ARMATURE" and o.name not in ("Leo", "Maya"):
        bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.wm.save_as_mainfile(filepath=out)
print("SAVED", out)
