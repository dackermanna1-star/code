"""Quick Workbench preview of shots from their cameras (one Blender session for many shots)."""
import bpy, sys, json, os, time
argv = sys.argv[sys.argv.index("--") + 1:]
sids, out = argv[0].split(","), argv[1]; n = int(argv[2]) if len(argv) > 2 else 6
sc = bpy.context.scene
ALL = json.loads(sc["shots"])
sc.render.engine = "BLENDER_WORKBENCH"
sc.display.shading.light = "STUDIO"; sc.display.shading.color_type = "TEXTURE"
sc.display.shading.show_shadows = False
sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = 216, 384, 100
for o in bpy.data.objects:
    if o.name.startswith("WireShelf") or o.name.startswith("Wrap_") or o.name.startswith("BreathPuff"):
        o.hide_render = True
os.makedirs(out, exist_ok=True)
for sid in sids:
    S = ALL[sid]
    sc.camera = bpy.data.objects[S["camera"]]
    fr = [S["f0"] + round(i * (S["f1"] - S["f0"]) / (n - 1)) for i in range(n)]
    t = time.time()
    for f in fr:
        sc.frame_set(f); sc.render.filepath = f"{out}/{sid}_{f:04d}.png"; bpy.ops.render.render(write_still=True)
    print("PREV", sid, round(time.time() - t, 1), flush=True)
