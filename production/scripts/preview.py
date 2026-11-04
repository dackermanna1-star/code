"""Render preview stills: blender -b file.blend --python preview.py -- SCENE f1,f2,f3 outprefix [pct] [samples]"""
import bpy, sys, time
a = sys.argv[sys.argv.index("--") + 1:]
sc = bpy.data.scenes[a[0]]
frames = [int(x) for x in a[1].split(",")]
pct = int(a[3]) if len(a) > 3 else 50
smp = int(a[4]) if len(a) > 4 else 6
sc.render.resolution_percentage = pct
sc.eevee.taa_render_samples = smp
bpy.context.window_manager.windows[0].scene = sc if bpy.context.window_manager.windows else None
for f in frames:
    sc.frame_set(f)
    sc.render.filepath = f"{a[2]}_{a[0]}_{f:04d}.png"
    t = time.time()
    bpy.ops.render.render(write_still=True, scene=sc.name)
    print("RENDERED", f, round(time.time() - t, 1))
