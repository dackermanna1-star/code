"""Nagasaki home: S03 (May 1945 departure), S15b (9 Aug: wife and son survived), S18a/b (2009 recognition)."""
import sys
sys.path.insert(0, "/home/user/code/production/scripts")
import bpy, math, random
from mathutils import Vector, Matrix
import ylib as Y, shotkit as K, sets as S, anim as AN, chars as C

PI = math.pi
NORTH, SOUTH = PI / 2, -PI / 2
TEX = "/home/user/code/production/textures"


def attach(obj, rig, bone, offset=(0, 0, 0), upright=False):
    """Attach a prop to a bone: copy the bone's position; optionally keep it upright (yaw follows hips)."""
    c1 = obj.constraints.new('COPY_LOCATION'); c1.target = rig; c1.subtarget = bone; c1.head_tail = 1.0
    if upright:
        c2 = obj.constraints.new('COPY_ROTATION'); c2.target = rig; c2.subtarget = "Hips"
        c2.use_x = False; c2.use_y = False; c2.use_z = True
    else:
        c2 = obj.constraints.new('CHILD_OF'); c2.target = rig; c2.subtarget = bone
        c2.use_location_x = c2.use_location_y = c2.use_location_z = False
        c2.set_inverse_pending = True
    c3 = obj.constraints.new('TRANSFORM_CACHE') if False else None
    obj.location = offset
    return obj


def baby_on_back(wife, c, name):
    b = C.baby(name, c)
    rig = wife["rig"]
    bpy.context.view_layer.update()
    pb = rig.data.bones["Spine1"]
    m = rig.matrix_world @ pb.matrix_local @ Matrix.Translation((0, pb.length, 0))
    b.parent = rig; b.parent_type = 'BONE'; b.parent_bone = "Spine1"
    b.matrix_parent_inverse = m.inverted()
    head = rig.matrix_world @ pb.head_local
    b.matrix_basis = Matrix.Translation(head + Vector((0, 0.17, 0.05))) @ Matrix.Rotation(math.radians(-12), 4, 'X')
    # carrying sash (onbuhimo) across the chest
    sash = Y.cyl(name + "_Sash", 0.16, 0.05, tuple(head + Vector((0, 0.02, 0.06))), (math.radians(8), 0, 0),
                 mat=Y.mat_basic("M_Sash", (0.2, 0.12, 0.08, 1), rough=0.9), c=c, verts=24)
    sash.scale = (1.05, 0.95, 1)
    bpy.context.view_layer.update()
    mw = sash.matrix_world.copy()
    sash.parent = rig; sash.parent_type = 'BONE'; sash.parent_bone = "Spine1"; sash.matrix_parent_inverse = m.inverted(); sash.matrix_basis = mw
    return b


def suitcase(rig, c, name):
    try:
        s = Y.import_gltf("vintage_suitcase", c)
    except Exception as e:
        print("suitcase failed", e); return None
    s.name = name
    bb = [Vector(v) for v in s.bound_box]
    h = max(v.z for v in bb) - min(v.z for v in bb)
    sc_ = 0.42 / max(h, 0.01)
    s.scale = (sc_, sc_, sc_)
    s.data.transform(Matrix.Translation((0, 0, -max(v.z for v in bb))))   # origin at the handle
    c1 = s.constraints.new('COPY_LOCATION'); c1.target = rig; c1.subtarget = "RightHand"; c1.head_tail = 0.4
    c2 = s.constraints.new('COPY_ROTATION'); c2.target = rig; c2.subtarget = "Hips"; c2.use_x = c2.use_y = False
    return s


def build(which):
    K.work_scene()

    if "S03" in which:
        setc, a = K.get_set("home", S.home, state="intact")
        sc, c, f0, f1 = K.new_shot("S03", setc)
        K.world(sc, "W_May", "kloofendal_28d_misty_puresky", 1.0, rot=0.0, mist=(4, 40))
        K.sun("Sun_S03", c, 120, 30, energy=4.0, color=(1.0, 0.93, 0.8))
        amb = Y.light("Amb_S03", 'AREA', (0, 0, a["FL"] + 2.3), 90, color=(1.0, 0.92, 0.82), size=3, c=c); amb.data.use_shadow = False
        doorL = Y.light("DoorBounce_S03", 'AREA', (-0.15, -2.6, 1.2), 120, color=(0.95, 0.95, 1.0), size=1.2, c=c, rot=(math.radians(-90), 0, 0)); doorL.data.use_shadow = False
        wife = C.build("Wife_S03", key="Wife", collection=c)
        C.period_dress_woman("S03W", wife["rig"], wife["body"], wife["parts"])
        Rw = AN.Retarget(wife["rig"])
        Rw.clip("40_10", f0, src_from=900, length=f1 - f0 + 1, origin=(0.35, -1.1, a["FL"]), face=SOUTH + 0.15, root_motion=False)
        Rw.add_rot("Spine1", [(f0 + 10, 0), (f0 + 22, 14), (f0 + 40, 0)], axis='X')     # returns his bow
        Rw.write("S03_Wife")
        AN.face(wife["body"], [(f0, "tender", 0.9), (f0 + 100, "concern", 0.6), (f1, "tender", 0.6)])
        baby_on_back(wife, c, "Baby_S03")
        ch = C.build("Yamaguchi_S03", key="Yamaguchi", collection=c)
        C.field_cap("S03Y", ch["rig"], ch["body"])
        R = AN.Retarget(ch["rig"])
        turn = f0 + 78
        R.clip("40_10", f0, src_from=950, length=turn - f0 + 12, origin=(-0.3, -2.05, 0), face=NORTH, root_motion=False)
        R.add_rot("Spine1", [(f0 + 6, 0), (f0 + 18, 24), (f0 + 36, 0)], axis='X')       # bow
        R.add_rot("Neck", [(f0 + 6, 0), (f0 + 18, 15), (f0 + 36, 0)], axis='X')
        R.clip("02_01", turn, length=f1 - turn + 1, origin=(-0.25, -2.15, 0), travel=SOUTH, blend=14)
        R.write("S03_Y")
        AN.face(ch["body"], [(f0, "tender", 0.7), (turn, "resolve", 0.5), (f1, "resolve", 0.5)])
        suitcase(ch["rig"], c, "Suitcase_S03")
        cam = Y.camera("CAM_S03", (1.2, 0.6, a["FL"] + 1.35), lens=32, c=c)
        foc = K.focus_empty("FOC_S03", c, ch["rig"], "Head")
        cam.data.dof.use_dof = True; cam.data.dof.focus_object = foc; cam.data.dof.aperture_fstop = 2.8
        K.keycam(cam, [(f0, (-1.75, 0.55, a["FL"] + 1.2), (0.05, -1.55, 1.3)), (f1, (-1.6, 0.2, a["FL"] + 1.15), (-0.1, -2.4, 1.2))], lens_keys=[(f0, 26), (f1, 28)])
        K.shake(cam, f0, f1, amp=0.003, rot_amp=0.08, seed=41)
        sc.camera = cam
        K.comp(sc, fog=(0.92, 0.9, 0.86), fog_amt=0.12, bloom=0.8, gain=(1.08, 1.02, 0.94), vignette=0.45)

    if "S15b" in which:
        setc, a = K.get_set("home_damaged", S.home, state="damaged")
        sc, c, f0, f1 = K.new_shot("S15b", setc)
        K.world(sc, "W_NagaAfter", "overcast_soil_puresky", 0.35, tint=(1.0, 0.72, 0.5, 1), mist=(2, 30))
        K.sun("Sun_S15b", c, 200, 35, energy=2.5, color=(1.0, 0.66, 0.4), angle=3)
        amb = Y.light("Amb_S15b", 'AREA', (0, 0, a["FL"] + 2.2), 60, color=(1.0, 0.75, 0.55), size=3, c=c); amb.data.use_shadow = False
        # 9 August, afternoon: the family together in the damaged house, looking out at the darkened sky
        wife = C.build("Wife_S15b", key="Wife", collection=c)
        C.period_dress_woman("S15W", wife["rig"], wife["body"], wife["parts"])
        Rw = AN.Retarget(wife["rig"])
        Rw.clip("40_10", f0, src_from=950, length=f1 - f0 + 1, origin=(0.25, 0.75, a["FL"]), face=NORTH + 0.1, root_motion=False)
        Rw.add_rot("Neck", [(f0, -4), (f1, -6)], axis='X')
        Rw.write("S15b_Wife")
        AN.face(wife["body"], [(f0, "grief", 0.7), (f0 + 60, "relief", 0.7), (f1, "tender", 0.6)])
        baby_on_back(wife, c, "Baby_S15b")
        ch = C.build("Yamaguchi_S15b", key="Yamaguchi", collection=c)
        C.burn_tint(ch["body"], 0.35)
        C.bandages("S15b", ch["rig"], ch["body"])
        R = AN.Retarget(ch["rig"])
        R.clip("40_10", f0, src_from=1100, length=f1 - f0 + 1, origin=(-0.45, 0.65, a["FL"]), face=NORTH - 0.1, root_motion=False)
        R.add_rot("Neck1", [(f0 + 40, 0), (f0 + 70, 22), (f1, 18)], axis='Y')     # turns to look at his wife and son
        R.write("S15b_Y")
        AN.face(ch["body"], [(f0, "dazed", 0.9), (f0 + 60, "relief", 0.9), (f1, "tender", 0.8)])
        cam = Y.camera("CAM_S15b", (0, 0, 1.2), lens=35, c=c)
        foc = K.focus_empty("FOC_S15b", c, ch["rig"], "Head")
        cam.data.dof.use_dof = True; cam.data.dof.focus_object = foc; cam.data.dof.aperture_fstop = 2.4
        sc.camera = cam
        ctr = Vector((-0.1, 0.7, a["FL"] + 1.25))
        K.keycam(cam, [(f0, ctr + Vector((1.75, -0.35, 0.05)), ctr + Vector((0, 0, -0.1))), (f1, ctr + Vector((1.55, -0.2, 0.0)), ctr + Vector((0, 0.05, -0.1)))], lens_keys=[(f0, 26), (f1, 28)])
        # dust motes in the light
        dc = bpy.data.collections.new("FX_S15b"); sc.collection.children.link(dc)
        dm = [S.sprite_mat(f"M_HomeDust{i}", i, color=(0.8, 0.62, 0.45), alpha_mul=0.3) for i in range(6)]
        rnd = random.Random(15)
        for i in range(18):
            p0 = Vector((rnd.uniform(-1.8, 1.8), rnd.uniform(-2.5, 1.2), rnd.uniform(0.6, 2.6)))
            sp = S.sprite(f"HD{i}", dm[i % 6], tuple(p0), rnd.uniform(0.8, 1.8), dc, cam=cam)
            sp.keyframe_insert("location", frame=f0)
            sp.location = p0 + Vector((rnd.uniform(-0.2, 0.2), rnd.uniform(-0.2, 0.2), 0.3)); sp.keyframe_insert("location", frame=f1)
        K.comp(sc, fog=(0.6, 0.45, 0.33), fog_amt=0.3, bloom=0.8, gain=(1.08, 0.96, 0.84), vignette=0.5)

    for sid in ("S18a", "S18b"):
        if sid not in which:
            continue
        setc, a = K.get_set("home_later", S.home, state="later")
        sc, c, f0, f1 = K.new_shot(sid, setc)
        K.world(sc, "W_Later", "qwantani_late_afternoon_puresky" if False else "kloofendal_28d_misty_puresky", 0.8, rot=2.0, mist=(4, 40))
        K.sun("Sun_" + sid, c, 330, 25, energy=3.5, color=(1.0, 0.85, 0.65))
        amb = Y.light("Amb_" + sid, 'AREA', (0, 0, a["FL"] + 2.3), 80, color=(1.0, 0.9, 0.78), size=3, c=c); amb.data.use_shadow = False
        tb = a["table"]
        book = Y.box("Handbook_" + sid, (0.105, 0.15, 0.012), tuple(tb + Vector((0.12, -0.12, 0.33))), (0, 0, 0.25),
                     mat=Y.mat_basic("M_HandbookEdge", (0.85, 0.82, 0.74, 1), rough=0.8), c=c)
        cover = S.plane("HandbookCover_" + sid, (0.105, 0.15), tuple(tb + Vector((0.12, -0.12, 0.3365))), (0, 0, 0.25),
                        mat=S.img_mat("M_HandbookCover", f"{TEX}/handbook_cover.png", rough=0.6), c=c)
        glasses = None
        # (round_spectacles omitted: could not be seated reliably on the MakeHuman head)
        old = C.build("YamaguchiOld_" + sid, key="YamaguchiOld", collection=c)
        R = AN.Retarget(old["rig"])
        R.clip("82_05", K.SHOT["S18a"]["f0"], src_from=400, length=K.SHOT["S18b"]["f1"] - K.SHOT["S18a"]["f0"] + 1,
               origin=tuple(tb + Vector((0, -0.62, -a["FL"] + a["FL"]))), face=NORTH, root_motion=False, speed=0.6)
        R.add_rot("Neck", [(f0, 18), (f1, 18)], axis='X')
        R.write(sid + "_Old")
        AN.face(old["body"], [(K.SHOT["S18a"]["f0"], "earnest", 0.4), (K.SHOT["S18b"]["f0"] + 60, "tender", 0.6), (K.SHOT["S18b"]["f1"], "resolve", 0.6)])
        if glasses:
            bpy.context.view_layer.update()
            hb = old["rig"].data.bones["Head"]
            mm = old["rig"].matrix_world @ hb.matrix_local @ Matrix.Translation((0, hb.length, 0))
            eyes = next(o for o in old["parts"] if "high-poly" in o.name)
            ec = C.eval_coords(eyes) if eyes.data.shape_keys else [v.co.copy() for v in eyes.data.vertices]
            ez = sum(v.z for v in ec) / len(ec); ex = sum(v.x for v in ec) / len(ec)
            fy = min(v.y for v in ec)
            bb = [Vector(v) for v in glasses.bound_box]
            cen = sum(bb, Vector()) / 8
            glasses.data.transform(Matrix.Translation(-cen))
            gw = max(v.x for v in bb) - min(v.x for v in bb)
            s_ = 0.13 / max(gw, 0.01)
            glasses.scale = (s_, s_, s_)
            glasses.parent = old["rig"]; glasses.parent_type = 'BONE'; glasses.parent_bone = "Head"
            glasses.matrix_parent_inverse = mm.inverted()
            glasses.matrix_basis = Matrix.Translation((ex, fy - 0.012, ez)) @ Matrix.Diagonal((s_, s_, s_, 1))
        cam = Y.camera("CAM_" + sid, (0, 0, 1.0), lens=60, c=c)
        if sid == "S18a":
            bk = book.location
            K.keycam(cam, [(f0, bk + Vector((0.25, -0.35, 0.3)), bk), (f1, bk + Vector((0.12, -0.22, 0.24)), bk)])
            cam.data.dof.use_dof = True; cam.data.dof.focus_object = book; cam.data.dof.aperture_fstop = 2.0
        else:
            foc = K.focus_empty("FOC_" + sid, c, old["rig"], "Head")
            cam.data.dof.use_dof = True; cam.data.dof.focus_object = foc; cam.data.dof.aperture_fstop = 2.2
            hp = R.root[K.SHOT["S18b"]["f0"]] + Vector((0, 0, 0.55))
            K.keycam(cam, [(f0, hp + Vector((0.95, 1.05, 0.15)), hp), (f1, hp + Vector((0.7, 0.85, 0.08)), hp + Vector((0, 0, 0.02)))])
        sc.camera = cam
        K.shake(cam, f0, f1, amp=0.002, rot_amp=0.06, seed=48)
        K.comp(sc, fog=(0.9, 0.85, 0.75), fog_amt=0.1, bloom=0.7, gain=(1.08, 1.0, 0.9), vignette=0.45, sat=0.9)


def autoframe(sc):
    """Aim cameras flagged with needs_autoframe at the evaluated head positions of the named rigs."""
    names = sc.get("needs_autoframe")
    if not names:
        return
    rigs = [bpy.data.objects[n] for n in names.split(",")]
    heads = []
    for f in (sc.frame_start, (sc.frame_start + sc.frame_end) // 2, sc.frame_end):
        sc.frame_set(f)
        dg = bpy.context.evaluated_depsgraph_get()
        for r in rigs:
            re = r.evaluated_get(dg)
            heads.append(re.matrix_world @ re.pose.bones["Head"].head)
    ctr = sum(heads, Vector()) / len(heads)
    cam = sc.camera
    f0, f1 = sc.frame_start, sc.frame_end
    if len(rigs) > 1:
        K.keycam(cam, [(f0, ctr + Vector((1.5, -1.9, 0.15)), ctr + Vector((0, 0, -0.15))), (f1, ctr + Vector((1.1, -1.45, 0.05)), ctr + Vector((0, 0, -0.1)))])
    else:
        K.keycam(cam, [(f0, ctr + Vector((-1.1, -0.8, 0.05)), ctr + Vector((0, 0, -0.12))), (f1, ctr + Vector((-0.85, -0.6, 0.02)), ctr + Vector((0, 0, -0.08)))])


if __name__ == "__main__":
    which = sys.argv[sys.argv.index("--") + 1].split(",") if "--" in sys.argv else ["S03", "S15b", "S18a", "S18b"]
    bpy.ops.wm.read_homefile(use_empty=True)
    bpy.context.preferences.filepaths.save_version = 0
    build(which)
    for sc in bpy.data.scenes:
        if sc.get("needs_autoframe"):
            bpy.context.window_manager.windows[0].scene = sc if bpy.context.window_manager.windows else None
            # evaluate in this scene's context
            with bpy.context.temp_override(scene=sc, view_layer=sc.view_layers[0]):
                autoframe(sc)
    out = sys.argv[sys.argv.index("--") + 2] if "--" in sys.argv and len(sys.argv) > sys.argv.index("--") + 2 else "/home/user/code/production/blend/seq_home.blend"
    bpy.ops.wm.save_as_mainfile(filepath=out)
    print("SAVED", out)
