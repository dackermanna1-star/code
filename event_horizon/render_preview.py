"""Quick low-res motion preview: blender -b scene.blend -P render_preview.py -- OUTDIR [STEP]"""
import bpy, sys, os
a = sys.argv[sys.argv.index("--") + 1:]
sc = bpy.context.scene
sc.render.resolution_percentage = 25
sc.cycles.samples = 6
sc.cycles.adaptive_min_samples = 4
sc.render.use_motion_blur = False
sc.frame_step = int(a[1]) if len(a) > 1 else 3
sc.render.use_overwrite = True
sc.render.use_placeholder = False
sc.render.filepath = os.path.join(a[0], "p_")
bpy.ops.render.render(animation=True)
