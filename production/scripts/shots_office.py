"""Mitsubishi Nagasaki shipyard design office: S01b, S02, S12a, S12b, S13a, S13b, S14, S16.

9 August 1945, ~11:00: Yamaguchi, bandaged, reports what one bomb did to Hiroshima; his supervisor
does not believe him. At 11:02 the same white light fills the room (his words).
"""
import sys
sys.path.insert(0, "/home/user/code/production/scripts")
import bpy, math, random
from mathutils import Vector
import ylib as Y, shotkit as K, sets as S, anim as AN, chars as C

PI = math.pi
SOUTH = -PI / 2
NORTH = PI / 2


def office_light(sc, c, a, warm=False, energy=3.5, flash=None):
    K.world(sc, "W_OfficeDay", "kloofendal_48d_partly_cloudy_puresky", 0.6, rot=1.2, mist=(8, 60))
    # sun through the south windows (11 am in August: high, from the south-south-east)
    K.sun("Sun_" + sc.name, c, 165, 58, energy=energy, color=(1.0, 0.94, 0.84) if not warm else (1.0, 0.86, 0.68), angle=1.5)
    # soft window bounce lights
    for i, x in enumerate(a["xs"]):
        L = Y.light(f"WinBounce{i}_{sc.name}", 'AREA', (x, a["win_y"] + 0.4, a["sill"] + a["win_h"] / 2), 140 if not warm else 110,
                    color=(0.92, 0.96, 1.0) if not warm else (1.0, 0.88, 0.75), size=2.0, c=c, rot=(-PI / 2, 0, 0))
        L.data.use_shadow = False
        if flash:
            f_on = flash
            L.data.energy = L.data.energy; L.data.keyframe_insert("energy", frame=f_on - 1)
            e0 = L.data.energy
            L.data.energy = 60000; L.data.keyframe_insert("energy", frame=f_on + 3)
            L.data.energy = 40000; L.data.keyframe_insert("energy", frame=f_on + 30)
    amb = Y.light("OfficeAmb_" + sc.name, 'AREA', (0, 0, 3.9), 250, color=(1.0, 0.95, 0.88), size=12, c=c, rot=(0, 0, 0))
    amb.data.use_shadow = False


def yam(c, sid, key="Yamaguchi", bandaged=True):
    ch = C.build(f"Yamaguchi_{sid}", key=key, collection=c)
    if bandaged:
        C.burn_tint(ch["body"], 0.35)
        C.bandages(sid, ch["rig"], ch["body"])
    return ch


def colleague(c, sid, key, pos, face, clip="13_01", src=700, n=200, seed=0):
    ex = C.build(f"{key}_{sid}", key=key, collection=c, faceunits=False)
    R = AN.Retarget(ex["rig"])
    R.clip(clip, K.SHOT[sid]["f0"], src_from=src, length=n, origin=pos, face=face, root_motion=False)
    R.write(f"{sid}_{key}")
    return ex


def stool_at(a, c, name, loc, h=0.66):
    st = a["stool"]
    if st is None:
        return None
    o = Y.instance(st, name, loc, c=c)
    z = max(v[2] for v in o.bound_box)
    o.scale = (1, 1, h / max(z, 0.1))
    return o


def build(which):
    K.work_scene()
    setc, a = K.get_set("office", S.office, era="1945")
    sup_pos = a["desk"] + Vector((0, 0.95, 0))       # supervisor stands north of his desk, facing north
    yam_pos = a["desk"] + Vector((-0.25, 2.25, 0))   # Yamaguchi faces him (south)

    if "S01b" in which:
        sc, c, f0, f1 = K.new_shot("S01b", setc)
        office_light(sc, c, a)
        S.set_clock(a["hands"], 11, 1, 40)
        ch = yam(c, "S01b")
        R = AN.Retarget(ch["rig"])
        R.clip("40_10", f0, src_from=900, length=f1 - f0 + 1, origin=(2.0, -1.2, 0), face=SOUTH + 0.3, root_motion=False)
        R.add_rot("Neck", [(f0, 0), (f0 + 60, 0), (f0 + 100, -6)], axis='X')
        R.write("S01b_Y")
        AN.face(ch["body"], [(f0, "dazed", 0.8), (f0 + 70, "concern", 0.8), (f1, "alarm", 0.6)])
        cam = Y.camera("CAM_S01b", (1.2, 0.6, 1.55), lens=45, c=c)
        foc = K.focus_empty("FOC_S01b", c, ch["rig"], "Head")
        cam.data.dof.use_dof = True; cam.data.dof.focus_object = foc; cam.data.dof.aperture_fstop = 2.2
        K.keycam(cam, [(f0, (1.0, 1.3, 1.55), (2.0, -1.2, 1.45)), (f1, (1.55, 0.25, 1.52), (2.0, -1.2, 1.5))])
        K.shake(cam, f0, f1, amp=0.003, rot_amp=0.1, seed=21)
        sc.camera = cam
        # window light swells at the end (foreshadowing the flash)
        for o in c.objects:
            if o.name.startswith("WinBounce"):
                o.data.keyframe_insert("energy", frame=f1 - 30)
                o.data.energy = 3000; o.data.keyframe_insert("energy", frame=f1)
        K.comp(sc, fog=(0.85, 0.85, 0.82), fog_amt=0.08, bloom=0.7, gain=(1.05, 1.0, 0.95), vignette=0.4,
               exposure_keys=[(f1 - 25, 0.0), (f1, 1.6)])

    if "S02" in which:
        sc, c, f0, f1 = K.new_shot("S02", setc)
        office_light(sc, c, a)
        S.set_clock(a["hands"], 9, 40, 0)
        t = a["tables"][7]
        tp = t.location
        seat = tp + Vector((0, 0.78, 0))
        stool_at(a, c, "Stool_S02", seat, 0.66)
        ch = yam(c, "S02", bandaged=False)
        R = AN.Retarget(ch["rig"])
        R.clip("13_01", f0, src_from=900, length=f1 - f0 + 1, origin=(seat.x, seat.y, -0.04), face=SOUTH, root_motion=False)
        # drafting: lean over the board, right arm drawing strokes
        R.add_rot("Spine1", [(f0, 12), (f1, 14)], axis='X')
        R.add_rot("Neck", [(f0, 14), (f0 + 120, 14), (f0 + 150, 4)], axis='X')
        R.add_rot("RightArm", [(f0 + i * 12, 18 + (6 if i % 2 else -6)) for i in range(16)], axis='X')
        R.add_rot("RightForeArm", [(f0 + i * 9, -35 + (10 if i % 2 else -6)) for i in range(21)], axis='X')
        R.add_rot("LeftArm", [(f0, 20), (f1, 20)], axis='X')
        R.write("S02_Y")
        AN.face(ch["body"], [(f0, "resolve", 0.6), (f0 + 120, "resolve", 0.6), (f1, "earnest", 0.5)])
        for i, (key, ti) in enumerate((("ColleagueA", 2), ("ColleagueB", 11))):
            tt = a["tables"][ti].location
            stool_at(a, c, f"Stool_S02_{i}", tt + Vector((0, 0.78, 0)), 0.66)
            colleague(c, "S02", key, tt + Vector((0, 0.78, -0.04)), SOUTH, src=1200 + 300 * i, n=f1 - f0 + 1)
        cam = Y.camera("CAM_S02", (0, 0, 2), lens=40, c=c)
        foc = K.focus_empty("FOC_S02", c, ch["rig"], "Head")
        cam.data.dof.use_dof = True; cam.data.dof.focus_object = foc; cam.data.dof.aperture_fstop = 2.4
        K.keycam(cam, [(f0, tp + Vector((0.9, -0.2, 1.5)), tp + Vector((0.0, 0.35, 1.05))),
                       (f0 + 90, tp + Vector((1.3, -0.15, 1.55)), tp + Vector((0.0, 0.6, 1.2))),
                       (f1, tp + Vector((1.5, 0.1, 1.55)), tp + Vector((0.0, 0.8, 1.35)))], lens_keys=[(f0, 35), (f1, 40)])
        K.shake(cam, f0, f1, amp=0.003, rot_amp=0.1, seed=22)
        sc.camera = cam
        K.comp(sc, fog=(0.85, 0.85, 0.82), fog_amt=0.08, bloom=0.5, gain=(1.06, 1.01, 0.94), vignette=0.4)

    for sid in ("S12a", "S12b"):
        if sid not in which:
            continue
        sc, c, f0, f1 = K.new_shot(sid, setc)
        office_light(sc, c, a)
        S.set_clock(a["hands"], 11, 0, 30)
        ch = yam(c, sid)
        R = AN.Retarget(ch["rig"])
        R.clip("18_08", K.SHOT["S12a"]["f0"], src_from=300, length=K.SHOT["S12b"]["f1"] - K.SHOT["S12a"]["f0"] + 1,
               origin=tuple(yam_pos), face=SOUTH, root_motion=False)
        R.write(sid + "_Y")
        AN.face(ch["body"], [(f0, "earnest", 0.9), (f1, "concern", 0.9)], talk=[(f0, f1 - 10)] if sid == "S12a" else [(f0, f0 + 40)])
        sup = C.build(f"Supervisor_{sid}", key="Supervisor", collection=c)
        Rs = AN.Retarget(sup["rig"])
        Rs.clip("19_08", K.SHOT["S12a"]["f0"], src_from=300, length=K.SHOT["S12b"]["f1"] - K.SHOT["S12a"]["f0"] + 1,
                origin=tuple(sup_pos), face=NORTH, root_motion=False)
        # head shake of disbelief in S12b
        f12b = K.SHOT["S12b"]["f0"]
        Rs.add_rot("Head", [(f12b + 20, 0), (f12b + 28, 9), (f12b + 36, -9), (f12b + 44, 8), (f12b + 52, -6), (f12b + 60, 0)], axis='Y')
        Rs.write(sid + "_Sup")
        AN.face(sup["body"], [(f0, "skeptic", 0.5), (f1, "skeptic", 1.0)], talk=[(f12b + 50, f1)] if sid == "S12b" else None)
        cam = Y.camera("CAM_" + sid, (0, 0, 1.6), lens=50, c=c)
        if sid == "S12a":   # over the supervisor's shoulder onto Yamaguchi
            foc = K.focus_empty("FOC_" + sid, c, ch["rig"], "Head")
            K.keycam(cam, [(f0, sup_pos + Vector((0.55, -0.55, 1.52)), yam_pos + Vector((0, 0, 1.45))),
                           (f1, sup_pos + Vector((0.45, -0.35, 1.5)), yam_pos + Vector((0, 0, 1.5)))])
        else:               # reverse over Yamaguchi's shoulder
            foc = K.focus_empty("FOC_" + sid, c, sup["rig"], "Head")
            K.keycam(cam, [(f0, yam_pos + Vector((-0.5, 0.55, 1.55)), sup_pos + Vector((0, 0, 1.5))),
                           (f1, yam_pos + Vector((-0.42, 0.4, 1.52)), sup_pos + Vector((0, 0, 1.52)))])
        cam.data.dof.use_dof = True; cam.data.dof.focus_object = foc; cam.data.dof.aperture_fstop = 2.0
        K.shake(cam, f0, f1, amp=0.003, rot_amp=0.1, seed=23)
        sc.camera = cam
        K.comp(sc, fog=(0.85, 0.85, 0.82), fog_amt=0.08, bloom=0.5, gain=(1.05, 1.0, 0.94), vignette=0.42)

    if "S13a" in which:
        sc, c, f0, f1 = K.new_shot("S13a", setc)
        office_light(sc, c, a)
        hands = a["hands"]
        # second hand ticks towards 11:02:00; the minute hand sits on 2
        for f in range(f0, f1 + 1, 30):
            ss = 54 + (f - f0) // 30 * 1
            S.set_clock(hands, 11, 1 if ss < 60 else 2, ss % 60)
            for h in hands.values():
                h.keyframe_insert("rotation_euler", frame=f)
        S.set_clock(hands, 11, 2, 0)
        for h in hands.values():
            h.keyframe_insert("rotation_euler", frame=f1 - 8)
        for h in hands.values():
            for fc in Y._fcurves(h.animation_data.action):
                for kp in fc.keyframe_points:
                    kp.interpolation = 'CONSTANT'
        cpos = Vector((0, a["D"] / 2 - 0.2, 3.05))
        cam = Y.camera("CAM_S13a", cpos + Vector((0.15, -1.2, -0.25)), lens=70, c=c)
        K.keycam(cam, [(f0, cpos + Vector((0.18, -1.35, -0.3)), cpos), (f1, cpos + Vector((0.05, -0.95, -0.12)), cpos)])
        cam.data.dof.use_dof = True; cam.data.dof.focus_distance = 1.0; cam.data.dof.aperture_fstop = 2.8
        sc.camera = cam
        K.comp(sc, fog=(0.85, 0.85, 0.82), fog_amt=0.05, bloom=0.5, gain=(1.05, 1.0, 0.94), vignette=0.5,
               exposure_keys=[(f1 - 6, 0.0), (f1, 2.0)])

    if "S13b" in which:
        sc, c, f0, f1 = K.new_shot("S13b", setc)
        fl = f0 + 4
        office_light(sc, c, a, flash=fl)
        S.set_clock(a["hands"], 11, 2, 2)
        ch = yam(c, "S13b")
        R = AN.Retarget(ch["rig"])
        R.clip("18_08", f0, src_from=300 + (f0 - K.SHOT["S12a"]["f0"]) * 4, length=fl - f0 + 14, origin=tuple(yam_pos), face=SOUTH, root_motion=False)
        R.clip("90_16", fl + 12, src_from=350, length=f1 - fl - 11, origin=tuple(yam_pos), face=NORTH, blend=5, speed=1.2)
        R.write("S13b_Y")
        AN.face(ch["body"], [(f0, "earnest", 0.8), (fl, "earnest", 0.8), (fl + 2, "squint_flash", 1.0), (f1, "pain", 1.0)])
        sup = C.build("Supervisor_S13b", key="Supervisor", collection=c)
        Rs = AN.Retarget(sup["rig"])
        Rs.clip("19_08", f0, src_from=300 + (f0 - K.SHOT["S12a"]["f0"]) * 4, length=fl - f0 + 10, origin=tuple(sup_pos), face=NORTH, root_motion=False)
        Rs.clip("77_09", fl + 8, src_from=200, length=f1 - fl - 7, origin=tuple(sup_pos), face=NORTH, blend=4, root_motion=False)
        Rs.write("S13b_Sup")
        AN.face(sup["body"], [(f0, "skeptic", 0.7), (fl + 2, "squint_flash", 1.0), (f1, "alarm", 1.0)])
        # papers blown off the desks
        dc = bpy.data.collections.new("FX_S13b"); sc.collection.children.link(dc)
        pm = Y.mat_basic("M_PaperSheet", (0.92, 0.9, 0.84, 1), rough=0.9)
        rnd = random.Random(13)
        for i in range(60):
            t = rnd.choice(a["tables"])
            p0 = t.location + Vector((rnd.uniform(-0.5, 0.5), rnd.uniform(-0.3, 0.3), 1.0))
            pp = S.plane(f"Paper{i}", (0.3, 0.21), tuple(p0), (rnd.uniform(-0.3, 0.3), 0, rnd.uniform(0, 6)), mat=pm, c=dc)
            t0 = fl + 6 + rnd.randint(0, 6)
            pp.keyframe_insert("location", frame=t0); pp.keyframe_insert("rotation_euler", frame=t0)
            pp.location = p0 + Vector((rnd.uniform(-1.5, 1.5), rnd.uniform(2.5, 5.5), rnd.uniform(0.3, 2.0)))
            pp.rotation_euler = (rnd.uniform(-8, 8), rnd.uniform(-8, 8), rnd.uniform(-8, 8))
            pp.keyframe_insert("location", frame=t0 + rnd.randint(20, 40)); pp.keyframe_insert("rotation_euler", frame=t0 + 40)
        # dust in the light
        dm = [S.sprite_mat(f"M_OfficeDust{i}", i, color=(0.85, 0.8, 0.72), alpha_mul=0.5) for i in range(6)]
        cam = Y.camera("CAM_S13b", (0, 0, 1.6), lens=28, c=c)
        for i in range(25):
            p0 = Vector((rnd.uniform(-5, 8), rnd.uniform(-4.5, -2), rnd.uniform(0.5, 3.5)))
            sp = S.sprite(f"ODust{i}", dm[i % 6], tuple(p0), rnd.uniform(1.5, 3.5), dc, cam=cam)
            sp.color = (1, 1, 1, 0); sp.keyframe_insert("color", frame=fl + 6)
            sp.color = (1, 1, 1, 0.8); sp.keyframe_insert("color", frame=fl + 14)
            sp.keyframe_insert("location", frame=fl + 6)
            sp.location = p0 + Vector((0, rnd.uniform(3, 6), rnd.uniform(-0.3, 0.6))); sp.keyframe_insert("location", frame=f1)
        K.keycam(cam, [(f0, a["desk"] + Vector((-3.6, 4.2, 1.7)), a["desk"] + Vector((0, 1.4, 1.2))),
                       (f1, a["desk"] + Vector((-3.3, 3.9, 1.6)), a["desk"] + Vector((0, 1.4, 0.9)))])
        K.shake(cam, fl + 6, f1, amp=0.03, rot_amp=1.2, freq=0.5, seed=31)
        sc.camera = cam
        K.comp(sc, fog=(0.9, 0.88, 0.82), fog_amt=0.15, bloom=1.0, gain=(1.05, 1.0, 0.94), vignette=0.4,
               exposure_keys=[(fl - 1, 0.0), (fl + 3, 3.5), (fl + 30, 2.0), (f1 - 20, 0.6), (f1, -0.5)])

    if "S14" in which:
        sc, c, f0, f1 = K.new_shot("S14", setc)
        K.world(sc, "W_OfficeAfter", "overcast_soil_puresky", 0.25, tint=(1.0, 0.7, 0.45, 1), mist=(2, 25))
        K.sun("Sun_S14", c, 160, 40, energy=2.2, color=(1.0, 0.62, 0.35), angle=3)
        amb = Y.light("Amb_S14", 'AREA', (2, -3, 3.5), 120, color=(1.0, 0.7, 0.45), size=6, c=c, rot=(0.3, 0, 0)); amb.data.use_shadow = False
        ch = yam(c, "S14")
        R = AN.Retarget(ch["rig"])
        base = Vector((4.6, -0.45, 0))
        R.clip("77_18", f0, src_from=380, length=f1 - f0 + 1, origin=tuple(base), face=-0.3, root_motion=False, speed=0.45)
        R.write("S14_Y")
        AN.face(ch["body"], [(f0, "pain", 1.0), (f0 + 40, "dazed", 1.0), (f1, "grief", 0.9)])
        dc = bpy.data.collections.new("FX_S14"); sc.collection.children.link(dc)
        pm = bpy.data.materials["M_PaperSheet"] if "M_PaperSheet" in bpy.data.materials else Y.mat_basic("M_PaperSheet", (0.92, 0.9, 0.84, 1), rough=0.9)
        rnd = random.Random(14)
        for i in range(70):
            S.plane(f"FloorPaper{i}", (0.3, 0.21), (4.6 + rnd.uniform(-4, 4), -0.45 + rnd.uniform(-1.0, 1.0), 0.005 + i * 0.0002), (0, 0, rnd.uniform(0, 6)), mat=pm, c=dc)
        dm = [S.sprite_mat(f"M_AfterDust{i}", i, color=(0.75, 0.55, 0.38), alpha_mul=0.35) for i in range(6)]
        cam = Y.camera("CAM_S14", (0, 0, 1.0), lens=35, c=c)
        for i in range(30):
            p0 = Vector((yam_pos.x + rnd.uniform(-5, 5), yam_pos.y + rnd.uniform(-5, 2), rnd.uniform(0.3, 3)))
            sp = S.sprite(f"AD{i}", dm[i % 6], tuple(p0), rnd.uniform(2, 4), dc, cam=cam)
            sp.keyframe_insert("location", frame=f0)
            sp.location = p0 + Vector((rnd.uniform(-0.4, 0.4), rnd.uniform(-0.4, 0.4), rnd.uniform(0.1, 0.5))); sp.keyframe_insert("location", frame=f1)
        foc = K.focus_empty("FOC_S14", c, ch["rig"], "Head")
        cam.data.dof.use_dof = True; cam.data.dof.focus_object = foc; cam.data.dof.aperture_fstop = 2.0
        K.keycam(cam, [(f0, base + Vector((1.9, -1.0, 0.45)), base + Vector((0, 0, 0.35))), (f1, base + Vector((1.35, -0.8, 0.8)), base + Vector((0, 0.1, 0.8)))])
        K.shake(cam, f0, f1, amp=0.004, rot_amp=0.15, seed=32)
        sc.camera = cam
        K.comp(sc, fog=(0.55, 0.38, 0.25), fog_amt=0.35, bloom=0.8, gain=(1.1, 0.95, 0.8), vignette=0.55,
               exposure_keys=[(f0, 0.6), (f0 + 20, 0.0)])

    if "S16" in which:
        setc2, a2 = K.get_set("office_later", S.office, era="1950s")
        sc, c, f0, f1 = K.new_shot("S16", setc2)
        office_light(sc, c, a2, warm=True, energy=3.0)
        S.set_clock(a2["hands"], 3, 20, 0)
        t = a2["tables"][7]; tp = t.location
        seat = tp + Vector((0, 0.78, 0))
        stool_at(a2, c, "Stool_S16", seat, 0.66)
        ch = yam(c, "S16", key="YamaguchiMid", bandaged=False)
        R = AN.Retarget(ch["rig"])
        R.clip("13_01", f0, src_from=700, length=f1 - f0 + 1, origin=(seat.x, seat.y, -0.04), face=SOUTH, root_motion=False)
        R.add_rot("Spine1", [(f0, 12), (f0 + 70, 12), (f0 + 100, 2)], axis='X')
        R.add_rot("Neck", [(f0, 12), (f0 + 70, 12), (f0 + 105, -4)], axis='X')
        R.add_rot("Neck1", [(f0 + 70, 0), (f0 + 110, -18)], axis='Y')
        R.add_rot("RightForeArm", [(f0 + i * 9, -35 + (10 if i % 2 else -6)) for i in range(9)] + [(f0 + 90, -20)], axis='X')
        R.write("S16_Y")
        AN.face(ch["body"], [(f0, "resolve", 0.5), (f0 + 80, "resolve", 0.5), (f0 + 115, "grief", 0.5), (f1, "grief", 0.6)])
        cam = Y.camera("CAM_S16", (0, 0, 1.5), lens=50, c=c)
        foc = K.focus_empty("FOC_S16", c, ch["rig"], "Head")
        cam.data.dof.use_dof = True; cam.data.dof.focus_object = foc; cam.data.dof.aperture_fstop = 2.0
        K.keycam(cam, [(f0, tp + Vector((-1.6, -0.2, 1.45)), tp + Vector((0, 0.7, 1.15))), (f1, tp + Vector((-1.2, 0.0, 1.45)), tp + Vector((0, 0.8, 1.3)))], lens_keys=[(f0, 40), (f1, 45)])
        K.shake(cam, f0, f1, amp=0.003, rot_amp=0.08, seed=33)
        sc.camera = cam
        K.comp(sc, fog=(0.9, 0.8, 0.7), fog_amt=0.1, bloom=0.6, gain=(1.08, 1.0, 0.9), vignette=0.4, sat=0.85)


if __name__ == "__main__":
    which = sys.argv[sys.argv.index("--") + 1].split(",") if "--" in sys.argv else ["S01b", "S02", "S12a", "S12b", "S13a", "S13b", "S14", "S16"]
    bpy.ops.wm.read_homefile(use_empty=True)
    bpy.context.preferences.filepaths.save_version = 0
    build(which)
    out = sys.argv[sys.argv.index("--") + 2] if "--" in sys.argv and len(sys.argv) > sys.argv.index("--") + 2 else "/home/user/code/production/blend/seq_office.blend"
    bpy.ops.wm.save_as_mainfile(filepath=out)
    print("SAVED", out)
