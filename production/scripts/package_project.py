"""Package the Blender project for delivery.

Run per sequence file:   blender -b blend/seq_X.blend --python package_project.py -- seq
Run once for the master:  blender -b --python package_project.py -- master
- Copies every external image into project/assets/ with relative paths.
- Removes the temporary WORK scene (BVH source armatures) and un-animated, zero-valued face shape keys.
- Saves compressed copies into project/.
- The master file links every shot scene and lays them out in the Video Sequencer with the soundtrack,
  the stems and subtitle text strips (the same timing as the final MP4).
"""
import bpy, os, sys, shutil, hashlib, json

ROOT = "/home/user/code/production"
PROJ = f"{ROOT}/project"
ASSETS = f"{PROJ}/assets"
mode = sys.argv[sys.argv.index("--") + 1]


def strip_shape_keys():
    n = 0
    for me in bpy.data.meshes:
        sk = me.shape_keys
        if not sk:
            continue
        animated = set()
        if sk.animation_data and sk.animation_data.action:
            act = sk.animation_data.action
            fcs = list(act.fcurves) if hasattr(act, "fcurves") and len(act.fcurves) else [fc for l in act.layers for st in l.strips for cb in st.channelbags for fc in cb.fcurves]
            for fc in fcs:
                if fc.data_path.startswith('key_blocks["'):
                    animated.add(fc.data_path.split('"')[1])
        users = [o for o in bpy.data.objects if o.data == me]
        if not users:
            continue
        ob = users[0]
        for kb in list(sk.key_blocks)[1:]:
            if kb.name not in animated and abs(kb.value) < 1e-6:
                ob.shape_key_remove(kb)
                n += 1
    return n


def localize_images():
    os.makedirs(ASSETS, exist_ok=True)
    for im in bpy.data.images:
        if im.source != 'FILE' or not im.filepath or im.packed_file:
            continue
        src = bpy.path.abspath(im.filepath)
        if not os.path.exists(src):
            continue
        sub = "hdri" if src.endswith(".hdr") else ("mpfb" if "/mpfb/" in src else ("polyhaven" if "polyhaven" in src else "textures"))
        h = hashlib.md5(src.encode()).hexdigest()[:6]
        dst = f"{ASSETS}/{sub}/{h}_{os.path.basename(src)}"
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        if not os.path.exists(dst):
            shutil.copy2(src, dst)
        im.filepath = bpy.path.relpath(dst, start=PROJ)


if mode == "seq":
    name = os.path.basename(bpy.data.filepath)
    if "WORK" in bpy.data.scenes:
        w = bpy.data.scenes["WORK"]
        for o in list(w.collection.objects):
            bpy.data.objects.remove(o)
        if len(bpy.data.scenes) > 1:
            bpy.data.scenes.remove(w)
    for a in list(bpy.data.armatures):
        if a.users == 0:
            bpy.data.armatures.remove(a)
    n = strip_shape_keys()
    bpy.data.orphans_purge(do_recursive=True)
    os.makedirs(PROJ, exist_ok=True)
    out = f"{PROJ}/{name}"
    bpy.ops.wm.save_as_mainfile(filepath=out, compress=True, copy=True, relative_remap=False)
    # second pass: relative image paths in the saved copy
    bpy.ops.wm.open_mainfile(filepath=out)
    localize_images()
    for sc in bpy.data.scenes:
        sc.render.filepath = f"//../renders/{sc.name}/####"
    bpy.ops.wm.save_mainfile(filepath=out, compress=True)
    print("PACKED", out, "removed shape keys:", n, "size MB", round(os.path.getsize(out) / 1e6, 1))

elif mode == "master":
    TL = json.load(open(f"{ROOT}/timeline.json"))
    bpy.ops.wm.read_homefile(use_empty=True)
    ed_scene = bpy.context.scene
    ed_scene.name = "EDIT_Yamaguchi_Short"
    ed_scene.render.resolution_x, ed_scene.render.resolution_y = 1080, 1920
    ed_scene.render.fps = 30
    ed_scene.frame_start, ed_scene.frame_end = 1, TL["total_frames"]
    files = sorted(f for f in os.listdir(PROJ) if f.startswith("seq_") and f.endswith(".blend"))
    linked = {}
    for f in files:
        with bpy.data.libraries.load(f"{PROJ}/{f}", link=True, relative=True) as (src, dst):
            dst.scenes = [s for s in src.scenes if s != "WORK"]
        for s in dst.scenes:
            if s:
                linked[s.name] = s
    se = ed_scene.sequence_editor_create()
    strips = se.strips if hasattr(se, "strips") else se.sequences
    for s in TL["shots"]:
        sc = linked.get(s["id"])
        if not sc:
            print("missing scene", s["id"]); continue
        st = strips.new_scene(name=s["id"], scene=sc, channel=2, frame_start=s["f0"])
        st.frame_final_end = s["f1"] + 1
        st.scene_camera = sc.camera
    for ch, (nm, path) in enumerate((("MIX", "audio/mix.wav"), ("NARRATION", "audio/stem_narration.wav"), ("MUSIC", "audio/stem_music.wav"), ("SFX", "audio/stem_sfx.wav"))):
        snd = strips.new_sound(name=nm, filepath=bpy.path.relpath(f"{ROOT}/{path}", start=PROJ), channel=6 + ch, frame_start=1)
        if nm != "MIX":
            snd.mute = True
    # final rendered film as a reference strip
    mp4 = f"{ROOT}/output/yamaguchi_short.mp4"
    if os.path.exists(mp4):
        mv = strips.new_movie(name="FINAL_MP4", filepath=bpy.path.relpath(mp4, start=PROJ), channel=1, frame_start=1)
        mv.mute = True
    # subtitles
    sys.path.insert(0, f"{ROOT}/scripts")
    sys.argv = ["x"]
    import post
    for i, cap in enumerate(post.CAPS):
        f0 = int(cap["s"] * 30) + 1
        f1 = max(f0 + 1, int(cap["e"] * 30) + 1)
        tx = strips.new_effect(name=f"SUB{i:03d}", type='TEXT', channel=10, frame_start=f0, frame_end=f1) if bpy.app.version < (4, 4) else strips.new_effect(name=f"SUB{i:03d}", type='TEXT', channel=10, frame_start=f0, length=f1 - f0)
        tx.text = " ".join(w["w"] for w in cap["words"]).upper()
        tx.font_size = 64
        tx.location = (0.5, 0.35)
        tx.use_outline = True
    out = f"{PROJ}/yamaguchi_master.blend"
    bpy.ops.wm.save_as_mainfile(filepath=out, compress=True, relative_remap=True)
    print("MASTER", out)
