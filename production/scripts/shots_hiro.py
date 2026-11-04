"""Hiroshima street shots: S01a, S04, S05a, S06a, S06b.

Geography: the street runs east-west; Yamaguchi walks west towards the Mitsubishi shipyard at Eba.
8:15 am sun in the east (az ~92 deg, elevation ~37 deg). The hypocentre lies ~3 km to the north-east,
so the flash comes from behind his right shoulder, low (about 11 deg elevation).
"""
import sys
sys.path.insert(0, "/home/user/code/production/scripts")
import bpy, math, random
from mathutils import Vector
import ylib as Y, shotkit as K, sets as S, anim as AN, chars as C, vehicles as V

PI = math.pi
WEST = PI


def morning(sc, c):
    K.world(sc, "W_HiroMorning", "qwantani_mid_morning_puresky", 0.7, rot=0.4, mist=(40, 1200))
    K.sun("Sun_" + sc.name, c, 92, 37, energy=7.0, color=(1.0, 0.92, 0.8))


def yamaguchi(c, sid, burned=False):
    ch = C.build("Yamaguchi", collection=c)
    C.field_cap(sid + "Y", ch["rig"], ch["body"])
    if burned:
        C.burn_tint(ch["body"])
    return ch


def head_target(rig):
    return rig.matrix_world @ rig.pose.bones["Head"].tail


def flash_light(c, f_on, peak=8000, f_off=None):
    """Light from the burst direction (north-east, low)."""
    L = K.sun("Flash", c, 45, 11, energy=0.0, color=(1.0, 0.97, 0.94), angle=2)
    L.data.energy = 0; L.data.keyframe_insert("energy", frame=f_on - 1)
    L.data.energy = peak; L.data.keyframe_insert("energy", frame=f_on + 2)
    L.data.energy = peak * 0.8; L.data.keyframe_insert("energy", frame=f_on + 12)
    if f_off:
        L.data.energy = 0; L.data.keyframe_insert("energy", frame=f_off)
    return L


def build(which):
    work = K.work_scene()
    setc, anchors = K.get_set("hiro_street", S.hiro_street)

    if "S01a" in which:
        sc, c, f0, f1 = K.new_shot("S01a", setc)
        morning(sc, c)
        ch = yamaguchi(c, "S01a")
        R = AN.Retarget(ch["rig"])
        R.clip("40_10", f0, src_from=880, length=f1 - f0 + 1, origin=(-20, -3.2, 0), face=WEST, root_motion=False)
        R.add_rot("Neck", [(f0, 0), (f0 + 95, 0), (f0 + 140, -16)], axis='X')
        R.add_rot("Neck1", [(f0, -6), (f0 + 50, 8), (f0 + 100, 0)], axis='Y')
        R.add_rot("Head", [(f0, 0), (f0 + 100, 0), (f0 + 145, -14)], axis='X')
        R.breathe()
        R.write("S01a_Yamaguchi")
        AN.face(ch["body"], [(f0, "neutral"), (f0 + 60, "earnest", 0.6), (f0 + 120, "curious", 0.7), (f1, "curious", 0.8)])
        cam = Y.camera("CAM_S01a", (-24.6, -2.7, 1.45), lens=50, c=c)
        foc = K.focus_empty("FOC_S01a", c, ch["rig"], "Head")
        cam.data.dof.use_dof = True; cam.data.dof.focus_object = foc; cam.data.dof.aperture_fstop = 2.0
        K.keycam(cam, [(f0, (-25.2, -2.6, 1.42), (-20, -3.2, 1.35)), (f1, (-21.9, -3.05, 1.52), (-20, -3.2, 1.5))])
        K.shake(cam, f0, f1, amp=0.004, rot_amp=0.12, seed=11)
        sc.camera = cam
        Y.light("Fill_S01a", 'AREA', (-22.5, -4.2, 2.2), 120, color=(0.85, 0.9, 1.0), size=2.5, c=c, rot=(math.radians(70), 0, math.radians(-120)))
        K.comp(sc, fog=(0.78, 0.8, 0.82), fog_amt=0.22, bloom=0.5, lift=(1.0, 0.99, 1.02), gamma=(1.02, 1.0, 0.97), gain=(1.1, 1.03, 0.94), vignette=0.4)

    if "S04" in which:
        sc, c, f0, f1 = K.new_shot("S04", setc)
        morning(sc, c)
        tram = V.build_streetcar(c)
        tram.location = (-8.5, 1.4, 0.12)
        # tram eases to a stop at the start of the shot
        tram.location.x = -2.5; tram.keyframe_insert("location", frame=f0 - 20)
        tram.location.x = -8.5; tram.keyframe_insert("location", frame=f0 + 22)
        ch = yamaguchi(c, "S04")
        R = AN.Retarget(ch["rig"])
        R.clip("02_01", f0, length=f1 - f0 + 1, origin=(-12.5, -1.6, 0), travel=WEST - 0.12)
        R.write("S04_Yamaguchi")
        AN.face(ch["body"], [(f0, "neutral"), (f1, "earnest", 0.4)])
        # passers-by
        for i, (key, org, trv, clip) in enumerate((("Wife", (-2, -4.4, 0), 0.0, "91_13"), ("ColleagueA", (-30, 3.6, 0), 0.05, "08_04"))):
            ex = C.build(f"Passerby{i}_S04", key=key, collection=c, faceunits=False)
            Re = AN.Retarget(ex["rig"])
            Re.clip(clip, f0, length=f1 - f0 + 1, origin=org, travel=trv)
            Re.write(f"S04_pass{i}")
        cam = Y.camera("CAM_S04", (-27, -3.6, 0.7), lens=28, c=c)
        K.keycam(cam, [(f0, (-27.5, -3.8, 0.65), (-10, -1.0, 2.2)), (f1, (-26.2, -3.6, 0.75), (-13, -1.6, 1.8))])
        K.shake(cam, f0, f1, amp=0.004, rot_amp=0.1, seed=4)
        sc.camera = cam
        K.comp(sc, fog=(0.8, 0.82, 0.85), fog_amt=0.45, bloom=0.4, gain=(1.06, 1.02, 0.95), vignette=0.35)

    if "S05a" in which:
        sc, c, f0, f1 = K.new_shot("S05a", setc)
        morning(sc, c)
        ch = yamaguchi(c, "S05a")
        R = AN.Retarget(ch["rig"])
        R.clip("16_33", f0, src_from=60, length=f1 - f0 + 1, origin=(-16.0, -2.0, 0), travel=WEST - 0.1)
        R.add_rot("Neck", [(f0, 0), (f0 + 30, 0), (f0 + 52, -20)], axis='X')
        R.add_rot("Head", [(f0, 0), (f0 + 34, 0), (f0 + 58, -24)], axis='X')
        R.add_rot("Neck1", [(f0, 0), (f0 + 34, 0), (f0 + 58, 8)], axis='Y')
        R.write("S05a_Yamaguchi")
        AN.face(ch["body"], [(f0, "neutral"), (f0 + 28, "curious", 0.8), (f1, "concern", 0.8)])
        bpy.context.view_layer.update()
        cam = Y.camera("CAM_S05a", (-20.5, -4.0, 1.2), lens=45, c=c)
        foc = K.focus_empty("FOC_S05a", c, ch["rig"], "Head")
        cam.data.dof.use_dof = True; cam.data.dof.focus_object = foc; cam.data.dof.aperture_fstop = 2.2
        K.keycam(cam, [(f0, (-21.5, -4.3, 1.15), (-17.2, -2.2, 1.45)), (f1, (-20.6, -3.9, 1.05), (-18.3, -2.3, 1.7))])
        K.shake(cam, f0, f1, amp=0.003, rot_amp=0.12, seed=5)
        sc.camera = cam
        Y.light("Fill_S05a", 'AREA', (-19.5, -5.0, 2.0), 90, color=(0.85, 0.9, 1.0), size=2.5, c=c, rot=(math.radians(70), 0, math.radians(-140)))
        K.comp(sc, fog=(0.8, 0.82, 0.85), fog_amt=0.35, bloom=0.4, gain=(1.06, 1.02, 0.95), vignette=0.4)

    if "S06a" in which:
        sc, c, f0, f1 = K.new_shot("S06a", setc)
        morning(sc, c)
        ch = yamaguchi(c, "S06a")
        R = AN.Retarget(ch["rig"])
        R.clip("40_10", f0, src_from=900, length=f1 - f0 + 1, origin=(-18.2, -2.3, 0), face=WEST - 0.25, root_motion=False)
        R.add_rot("Neck", [(f0, -20), (f0 + 24, -20), (f0 + 30, -6)], axis='X')
        R.add_rot("Head", [(f0, -24), (f0 + 24, -24), (f0 + 30, -4)], axis='X')
        R.add_rot("Spine1", [(f0 + 24, 0), (f0 + 30, -9)], axis='X')     # recoil backwards
        R.add_rot("LeftArm", [(f0 + 25, 0), (f0 + 34, -25)], axis='Z')
        R.write("S06a_Yamaguchi")
        fl = f0 + 24
        AN.face(ch["body"], [(f0, "concern", 0.8), (fl, "curious", 0.8), (fl + 3, "squint_flash", 1.0), (f1, "squint_flash", 1.0)])
        flash_light(c, fl, peak=60)
        cam = Y.camera("CAM_S06a", (-19.6, -2.8, 1.5), lens=60, c=c)
        foc = K.focus_empty("FOC_S06a", c, ch["rig"], "Head")
        cam.data.dof.use_dof = True; cam.data.dof.focus_object = foc; cam.data.dof.aperture_fstop = 2.0
        K.keycam(cam, [(f0, (-19.7, -2.95, 1.42), (-18.2, -2.3, 1.5)), (f1, (-19.45, -2.85, 1.44), (-18.2, -2.3, 1.48))])
        K.shake(cam, fl, f1, amp=0.012, rot_amp=0.6, seed=6)
        sc.camera = cam
        K.comp(sc, fog=(0.8, 0.82, 0.85), fog_amt=0.3, bloom=0.9, gain=(1.06, 1.02, 0.95), vignette=0.35,
               exposure_keys=[(fl - 1, 0.0), (fl + 2, 1.6), (fl + 20, 2.4), (f1 - 10, 3.6), (f1, 6.0)])

    if "S06b" in which:
        sc, c, f0, f1 = K.new_shot("S06b", setc)
        K.world(sc, "W_HiroMorning", "qwantani_mid_morning_puresky", 0.9, rot=0.4, mist=(10, 300))
        K.sun("Sun_S06b", c, 92, 37, energy=4.0, color=(1.0, 0.86, 0.7))
        flash = flash_light(c, f0 - 60, peak=25)
        flash.data.energy = 25; flash.data.keyframe_insert("energy", frame=f0)
        flash.data.energy = 3; flash.data.keyframe_insert("energy", frame=f0 + 40)
        ch = yamaguchi(c, "S06b")
        R = AN.Retarget(ch["rig"])
        hit = f0 + 26
        R.clip("40_10", f0, src_from=900, length=hit - f0 + 2, origin=(-22, -2.4, 0), face=WEST - 0.2, root_motion=False)
        R.clip("90_16", hit, src_from=330, length=f1 - hit + 1, origin=(-22, -2.4, 0), face=WEST - 0.2, blend=4, speed=1.15)
        R.write("S06b_Yamaguchi")
        AN.face(ch["body"], [(f0, "squint_flash", 1.0), (f1, "pain", 1.0)])
        cam = Y.camera("CAM_S06b", (-31, -4.5, 1.1), lens=24, c=c)
        K.keycam(cam, [(f0, (-31, -4.6, 1.1), (-18, -1.5, 2.5)), (f1, (-30.4, -4.4, 0.9), (-22, -2.0, 1.2))])
        K.shake(cam, hit - 4, f1, amp=0.05, rot_amp=1.6, freq=0.5, seed=7)
        sc.camera = cam
        # dust wall racing west along the street (sprites), roof tiles and splinters
        dc = bpy.data.collections.new("FX_S06b"); sc.collection.children.link(dc)
        rnd = random.Random(66)
        mats = [S.sprite_mat(f"M_Dust{i}", i, color=(0.55, 0.47, 0.38), alpha_mul=0.9) for i in range(6)]
        for i in range(90):
            x0 = rnd.uniform(10, 40); y0 = rnd.uniform(-7, 7); z0 = rnd.uniform(0.3, 9)
            sp = S.sprite(f"Dust{i}", mats[i % 6], (x0, y0, z0), rnd.uniform(4, 9), dc, cam=cam)
            t0 = hit - 14 + int((x0 - 10) / 8)
            sp.location = (x0, y0, z0); sp.keyframe_insert("location", frame=t0)
            sp.location = (x0 - 70 - rnd.uniform(0, 20), y0 * 1.2, z0 + rnd.uniform(0, 4)); sp.keyframe_insert("location", frame=t0 + 40)
            sp.scale = (0.5, 0.5, 0.5); sp.keyframe_insert("scale", frame=t0)
            sp.scale = (1.8, 1.8, 1.8); sp.keyframe_insert("scale", frame=t0 + 40)
            sp.color = (1, 1, 1, 0.0); sp.keyframe_insert("color", frame=t0 - 1)
            sp.color = (1, 1, 1, 0.95); sp.keyframe_insert("color", frame=t0 + 3)
        tile_m = bpy.data.materials.get("M_Ridge")
        houses = anchors["houses"]
        for i in range(160):
            h = rnd.choice(houses)
            if not (-45 < h.location.x < 5):
                continue
            start = Vector((h.location.x + rnd.uniform(-2, 2), h.location.y * 0.8, rnd.uniform(5, 7.5)))
            tl = Y.box(f"Tile{i}", (0.28, 0.24, 0.03), tuple(start), mat=tile_m, c=dc)
            t0 = hit - 8 + int((h.location.x + 45) / 6)
            tl.keyframe_insert("location", frame=t0)
            tl.keyframe_insert("rotation_euler", frame=t0)
            end = start + Vector((-rnd.uniform(15, 40), rnd.uniform(-3, 3) - h.location.y * 0.3, -start.z + 0.05))
            tl.location = end; tl.keyframe_insert("location", frame=t0 + rnd.randint(14, 30))
            tl.rotation_euler = (rnd.uniform(-12, 12), rnd.uniform(-12, 12), rnd.uniform(-6, 6)); tl.keyframe_insert("rotation_euler", frame=t0 + 30)
        # buildings lurch
        for h in houses:
            if -60 < h.location.x < 10:
                t0 = hit - 8 + int((h.location.x + 45) / 6)
                h.keyframe_insert("rotation_euler", frame=t0)
                r = h.rotation_euler.copy()
                h.rotation_euler = (r.x + rnd.uniform(-0.02, 0.02), r.y - 0.035, r.z); h.keyframe_insert("rotation_euler", frame=t0 + 4)
                h.rotation_euler = (r.x, r.y - 0.012, r.z); h.keyframe_insert("rotation_euler", frame=t0 + 12)
        K.comp(sc, fog=(0.55, 0.45, 0.35), fog_amt=0.6, bloom=0.8, gain=(1.1, 0.98, 0.85), vignette=0.45,
               exposure_keys=[(f0, 5.0), (f0 + 8, 1.6), (hit, 0.8), (f1 - 20, 0.0), (f1, -1.5)])
    return work


if __name__ == "__main__":
    which = sys.argv[sys.argv.index("--") + 1].split(",") if "--" in sys.argv else ["S01a", "S04", "S05a", "S06a", "S06b"]
    bpy.ops.wm.read_homefile(use_empty=True)
    bpy.context.preferences.filepaths.save_version = 0
    build(which)
    out = sys.argv[sys.argv.index("--") + 2] if "--" in sys.argv and len(sys.argv) > sys.argv.index("--") + 2 else "/home/user/code/production/blend/seq_hiro_street.blend"
    bpy.ops.wm.save_as_mainfile(filepath=out)
    print("SAVED", out)
