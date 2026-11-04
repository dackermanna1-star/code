"""Render preview stills: blender -b scene.blend -P render_stills.py -- OUTDIR PCT SAMPLES F1 F2 ..."""
import bpy, sys, time, os
a = sys.argv[sys.argv.index("--") + 1:]
out, pct, spp, frames = a[0], int(a[1]), int(a[2]), [int(x) for x in a[3:]]
sc = bpy.context.scene
sc.render.resolution_percentage = pct
sc.cycles.samples = spp
sc.render.use_overwrite = True
sc.render.use_placeholder = False
os.makedirs(out, exist_ok=True)
for f in frames:
    sc.frame_set(f)
    sc.render.filepath = os.path.join(out, "still_%04d.png" % f)
    t = time.time()
    bpy.ops.render.render(write_still=True)
    print("FRAME %d  %.1fs  cam=%s" % (f, time.time() - t, sc.camera.name), flush=True)
