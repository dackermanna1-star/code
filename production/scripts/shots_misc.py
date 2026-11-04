"""Remaining shots: S05b sky, S07 field, S08 Hiroshima vista, S09 night, S10 station, S11 Nagasaki harbour,
S15a/S15c Nagasaki vista, S17 UN, S19 sunset, S20 lanterns."""
import sys
sys.path.insert(0, "/home/user/code/production/scripts")
import bpy, math, random
from mathutils import Vector, Matrix
import ylib as Y, shotkit as K, sets as S, anim as AN, chars as C, vehicles as V, fx

PI = math.pi
SH = K.SHOT


def vol_settings(sc, end=400, tile='4', samples=48):
    e = sc.eevee
    e.volumetric_start = 0.5
    e.volumetric_end = end
    e.volumetric_tile_size = tile
    e.volumetric_samples = samples
    e.use_volumetric_shadows = True


def burned_yam(c, sid, cap=True):
    ch = C.build(f"Yamaguchi_{sid}", key="Yamaguchi", collection=c)
    C.burn_tint(ch["body"], 0.5)
    if cap:
        C.field_cap(sid + "Y", ch["rig"], ch["body"])
    return ch


def build(which):
    K.work_scene()

    # ---------------------------------------------------------------- S05b sky POV
    if "S05b" in which:
        c0 = bpy.data.collections.new("SET_sky")
        sc, c, f0, f1 = K.new_shot("S05b", c0)
        K.world(sc, "W_HiroSky", "qwantani_mid_morning_puresky", 1.0, rot=0.4, mist=(5000, 20000))
        K.sun("Sun_S05b", c, 92, 37, energy=4.0, color=(1, 0.95, 0.88))
        b = V.build_b29(bpy.context.scene.collection)
        Y.link_to(b, c0)
        dist = 1500.0
        # camera at origin looking up to the north-east; plane crosses from right to left
        cam = Y.camera("CAM_S05b", (0, 0, 1.6), lens=135, c=c)
        tgt = Vector((dist * 0.35, dist * 0.55, dist * 0.76))
        Y.look_at(cam, tgt)
        cam.keyframe_insert("rotation_euler", frame=f0)
        Y.look_at(cam, tgt + Vector((-60, 10, 5)))
        cam.keyframe_insert("rotation_euler", frame=f1)
        K.shake(cam, f0, f1, amp=0.0, rot_amp=0.25, seed=51)
        sc.camera = cam
        right = Vector((0.85, -0.53, 0))
        b.location = tgt + right * 220
        b.rotation_euler = (0, 0, math.atan2(-right.y, -right.x))
        b.keyframe_insert("location", frame=f0)
        b.location = tgt - right * 260
        b.keyframe_insert("location", frame=f1)
        for fc in Y._fcurves(b.animation_data.action):
            for kp in fc.keyframe_points:
                kp.interpolation = 'LINEAR'
        for i in range(2):
            ch_ = V.parachute(f"Chute{i}", c0)
            for o_ in [ch_] + list(ch_.children):
                Y.link_to(o_, c0)
            t0 = f0 + 18 + i * 6
            ch_.scale = (0.01, 0.01, 0.01)
            p0 = tgt + right * (220 - 480 * (t0 - f0) / (f1 - f0)) + Vector((0, 0, -12))
            ch_.location = p0
            ch_.keyframe_insert("location", frame=t0); ch_.keyframe_insert("scale", frame=t0)
            ch_.scale = (3.5, 3.5, 3.5); ch_.keyframe_insert("scale", frame=t0 + 12)
            ch_.location = p0 + Vector((-10 - 6 * i, 4, -45)); ch_.keyframe_insert("location", frame=f1)
        K.comp(sc, fog=(0.8, 0.85, 0.9), fog_amt=0.0, bloom=0.6, gain=(1.05, 1.02, 0.98), vignette=0.45)

    # ---------------------------------------------------------------- S07 field / S09 night
    if "S07" in which or "S09" in which:
        setc, a = K.get_set("hiro_ruins", S.hiro_ruins)
    if "S07" in which:
        sc, c, f0, f1 = K.new_shot("S07", setc)
        K.world(sc, "W_Dust", "overcast_soil_puresky", 0.35, tint=(0.85, 0.5, 0.28, 1), sat=0.6, mist=(2, 60))
        K.sun("Sun_S07", c, 95, 25, energy=1.6, color=(1.0, 0.55, 0.28), angle=8)
        for i, loc in enumerate(a["fires"]):
            fx.fire_glow(f"Fire_S07_{i}", c, loc, energy=600, radius=1.5, flicker=(f0, f1), seed=i)
        ch = burned_yam(c, "S07")
        R = AN.Retarget(ch["rig"])
        R.clip("77_18", f0, src_from=360, length=f1 - f0 + 1, origin=(0.5, 1.0, 0), face=-PI * 0.75, root_motion=False, speed=0.55)
        R.write("S07_Y")
        AN.face(ch["body"], [(f0, "pain", 1.0), (f0 + 90, "dazed", 1.0), (f0 + 170, "pain", 0.8), (f1, "dazed", 1.0)])
        dc = bpy.data.collections.new("FX_S07"); sc.collection.children.link(dc)
        cam = Y.camera("CAM_S07", (0, 0, 0.5), lens=32, c=c)
        dm = [S.sprite_mat(f"M_FieldDust{i}", i, color=(0.45, 0.32, 0.22), alpha_mul=0.5) for i in range(6)]
        rnd = random.Random(7)
        for i in range(40):
            p0 = Vector((rnd.uniform(-12, 12), rnd.uniform(-6, 25), rnd.uniform(0.3, 6)))
            sp = S.sprite(f"FD{i}", dm[i % 6], tuple(p0), rnd.uniform(3, 8), dc, cam=cam)
            sp.keyframe_insert("location", frame=f0)
            sp.location = p0 + Vector((rnd.uniform(-2, -0.5), rnd.uniform(-1, 1), rnd.uniform(0, 1))); sp.keyframe_insert("location", frame=f1)
        foc = K.focus_empty("FOC_S07", c, ch["rig"], "Head")
        cam.data.dof.use_dof = True; cam.data.dof.focus_object = foc; cam.data.dof.aperture_fstop = 2.2
        base = Vector((0.5, 1.0, 0))
        K.keycam(cam, [(f0, base + Vector((-2.2, -2.0, 0.35)), base + Vector((0, 0, 0.25))),
                       (f0 + 140, base + Vector((-1.8, -1.7, 0.7)), base + Vector((0, 0, 0.8))),
                       (f1, base + Vector((-1.6, -1.5, 1.1)), base + Vector((0, 0.2, 1.3)))])
        K.shake(cam, f0, f1, amp=0.005, rot_amp=0.2, seed=52)
        sc.camera = cam
        K.comp(sc, fog=(0.42, 0.3, 0.2), fog_amt=0.55, bloom=0.7, gain=(1.1, 0.95, 0.8), vignette=0.55, sat=0.8,
               exposure_keys=[(f0, -0.8), (f0 + 40, 0.0)])

    if "S09" in which:
        sc, c, f0, f1 = K.new_shot("S09", setc)
        K.world(sc, "W_NightRuins", "qwantani_night_puresky", 0.25, tint=(0.8, 0.45, 0.3, 1), mist=(5, 80))
        mid = Vector((0, -2, 0))
        fx.fire_glow("Campfire_S09", c, mid + Vector((0, 0, 0.3)), energy=120, radius=0.4, flicker=(f0, f1), seed=3)
        for i, loc in enumerate(a["fires"]):
            fx.fire_glow(f"Fire_S09_{i}", c, (loc[0], loc[1] + 8, 2.0), energy=2500, radius=3, flicker=(f0, f1), seed=10 + i)
        embers = Y.mat_basic("M_Embers", (1, 0.4, 0.1, 1), emission=(1.0, 0.35, 0.08, 1), estr=8)
        Y.box("Embers_S09", (0.4, 0.4, 0.06), tuple(mid + Vector((0, 0, 0.03))), mat=embers, c=c)
        horizon = Y.mat_basic("M_HorizonGlow", (1, 0.3, 0.1, 1), emission=(1.0, 0.28, 0.08, 1), estr=2.5)
        S.plane("HorizonGlow", (200, 12), (0, 60, 4), (PI / 2, 0, 0), mat=horizon, c=c)
        people = []
        for i, (key, off, face) in enumerate((("Yamaguchi", (0.0, -0.9, 0), PI / 2), ("ColleagueA", (-0.95, -2.3, 0), 0.4), ("ColleagueB", (0.95, -2.4, 0), PI - 0.4))):
            ch = C.build(f"{key}_S09", key=key, collection=c)
            if key == "Yamaguchi":
                C.burn_tint(ch["body"], 0.5)
            R = AN.Retarget(ch["rig"])
            R.clip("82_05", f0, src_from=300 + i * 400, length=f1 - f0 + 1, origin=tuple(mid + Vector(off)), face=face, root_motion=False, speed=0.6)
            R.write(f"S09_{key}")
            AN.face(ch["body"], [(f0, "grief", 0.8), (f1, "dazed", 0.8)])
            people.append(ch)
        cam = Y.camera("CAM_S09", (0, 0, 1), lens=30, c=c)
        K.keycam(cam, [(f0, mid + Vector((2.6, -4.6, 0.9)), mid + Vector((0, 0, 0.5))), (f1, mid + Vector((2.0, -3.8, 0.8)), mid + Vector((0, 0.2, 0.55)))])
        foc = K.focus_empty("FOC_S09", c, loc=mid + Vector((0, -1, 0.6)))
        cam.data.dof.use_dof = True; cam.data.dof.focus_object = foc; cam.data.dof.aperture_fstop = 2.0
        K.shake(cam, f0, f1, amp=0.003, rot_amp=0.08, seed=53)
        sc.camera = cam
        K.comp(sc, fog=(0.2, 0.08, 0.05), fog_amt=0.4, bloom=0.9, gain=(1.05, 0.9, 0.85), vignette=0.55, sat=0.9)

    # ---------------------------------------------------------------- S08 / S15a / S15c vistas
    if "S08" in which:
        setc, a = K.get_set("vista_hiro", S.vista, city="hiro", f0=SH["S08"]["f0"] - 30, f1=SH["S08"]["f1"], cloud_stage=(0.78, 0.98))
        sc, c, f0, f1 = K.new_shot("S08", setc)
        vol_settings(sc)
        K.world(sc, "W_VistaHiro", "qwantani_mid_morning_puresky", 0.7, rot=0.4, mist=(15, 220))
        K.sun("Sun_S08", c, 92, 38, energy=4.5, color=(1, 0.93, 0.82))
        rnd = random.Random(8)
        for i in range(7):
            fx.smoke_column(f"Smoke_S08_{i}", c, (rnd.uniform(-20, 30), rnd.uniform(5, 40), 0), h=rnd.uniform(8, 18), r=rnd.uniform(1.2, 2.5), f0=f0, f1=f1)
        p, t = a["cam_hint"]
        cam = Y.camera("CAM_S08", p, lens=26, c=c)
        K.keycam(cam, [(f0, Vector(p) + Vector((0, 0, 0)), t), (f1, Vector(p) + Vector((5, 6, 1.0)), Vector(t) + Vector((0, 0, 4)))])
        K.shake(cam, f0, f1, amp=0.01, rot_amp=0.05, seed=54)
        sc.camera = cam
        K.comp(sc, fog=(0.75, 0.72, 0.68), fog_amt=0.4, bloom=0.5, gain=(1.05, 1.0, 0.95), vignette=0.45, sat=0.85)

    if "S15a" in which or "S15c" in which:
        setc, a = K.get_set("vista_naga", S.vista, city="naga", f0=SH["S15a"]["f0"] - 40, f1=SH["S15c"]["f1"], cloud_stage=(0.55, 1.15))
    for sid in ("S15a", "S15c"):
        if sid not in which:
            continue
        sc, c, f0, f1 = K.new_shot(sid, setc)
        vol_settings(sc)
        if sid == "S15a":
            K.world(sc, "W_VistaNaga", "kloofendal_48d_partly_cloudy_puresky", 0.7, rot=2.0, mist=(15, 200))
            K.sun("Sun_" + sid, c, 150, 60, energy=4.0, color=(1, 0.95, 0.88))
        else:
            K.world(sc, "W_VistaNaga2", "overcast_soil_puresky", 0.4, tint=(0.95, 0.7, 0.5, 1), mist=(8, 150))
            K.sun("Sun_" + sid, c, 230, 25, energy=2.5, color=(1, 0.7, 0.45))
            rnd = random.Random(15)
            for i in range(8):
                fx.smoke_column(f"Smoke_{sid}_{i}", c, (rnd.uniform(-15, 20), rnd.uniform(18, 40), 0), h=rnd.uniform(6, 14), r=rnd.uniform(1.0, 2.2), f0=f0, f1=f1)
        p, t = a["cam_hint"]
        cam = Y.camera("CAM_" + sid, p, lens=22, c=c)
        if sid == "S15a":
            K.keycam(cam, [(f0, Vector(p), Vector(t) + Vector((0, 0, -6))), (f1, Vector(p) + Vector((2, 3, 0.3)), Vector(t))])
        else:
            K.keycam(cam, [(f0, Vector(p) + Vector((14, -6, 1.5)), Vector(t) + Vector((-4, 0, -20))), (f1, Vector(p) + Vector((10, -2, 1.2)), Vector(t) + Vector((-8, 0, -16)))])
        K.shake(cam, f0, f1, amp=0.008, rot_amp=0.05, seed=55)
        sc.camera = cam
        K.comp(sc, fog=(0.72, 0.72, 0.7) if sid == "S15a" else (0.55, 0.42, 0.33), fog_amt=0.4, bloom=0.5, gain=(1.05, 1.0, 0.95), vignette=0.45, sat=0.85)

    # ---------------------------------------------------------------- S10 station
    if "S10" in which:
        setc, a = K.get_set("station", S.station)
        sc, c, f0, f1 = K.new_shot("S10", setc)
        K.world(sc, "W_Station", "kloofendal_48d_partly_cloudy_puresky", 0.6, rot=2.4, tint=(1.0, 0.88, 0.75, 1), mist=(20, 300))
        K.sun("Sun_S10", c, 250, 28, energy=4.0, color=(1, 0.82, 0.6))
        pz = a["platform_z"]
        rnd = random.Random(10)
        cols = []
        for i, (key, x, y) in enumerate((("Yamaguchi", -18, 4.4), ("ColleagueA", -16.8, 4.9), ("ColleagueB", -19.4, 5.0))):
            ch = C.build(f"{key}_S10", key=key, collection=c)
            if key == "Yamaguchi":
                C.burn_tint(ch["body"], 0.5)
                C.field_cap("S10Y", ch["rig"], ch["body"])
            R = AN.Retarget(ch["rig"])
            R.clip("91_21" if key == "Yamaguchi" else "08_04", f0, src_from=200 + i * 150, length=f1 - f0 + 1, origin=(x, y, pz), travel=0.0, speed=0.9)
            R.write(f"S10_{key}")
            AN.face(ch["body"], [(f0, "dazed", 0.8), (f1, "resolve", 0.5)])
            cols.append(ch)
        for i in range(4):
            ex = C.build(f"Traveller{i}_S10", key=("Wife", "ColleagueA", "Supervisor", "ColleagueB")[i], collection=c, faceunits=False)
            if ex["body"] and i == 0:
                C.period_dress_woman(f"S10W{i}", ex["rig"], ex["body"], ex["parts"])
            Re = AN.Retarget(ex["rig"])
            Re.clip("40_10", f0, src_from=600 + 250 * i, length=f1 - f0 + 1, origin=(-6 + i * 3.4, 4.8 + rnd.uniform(-0.4, 0.6), pz), face=-PI / 2 + rnd.uniform(-0.8, 0.8), root_motion=False)
            Re.write(f"S10_trav{i}")
        # steam from the loco chimney and cylinders
        dc = bpy.data.collections.new("FX_S10"); sc.collection.children.link(dc)
        cam = Y.camera("CAM_S10", (-24, 2.6, 2.2), lens=28, c=c)
        sm = [S.sprite_mat(f"M_Steam{i}", i, color=(0.92, 0.92, 0.92), alpha_mul=0.8) for i in range(6)]
        for i in range(36):
            t0 = f0 - 30 + i * 4
            p0 = Vector((5.9, 0, 4.2))
            sp = S.sprite(f"Steam{i}", sm[i % 6], tuple(p0), 1.2, dc, cam=cam)
            sp.scale = (0.4, 0.4, 0.4); sp.keyframe_insert("scale", frame=t0); sp.keyframe_insert("location", frame=t0)
            sp.color = (1, 1, 1, 0.9); sp.keyframe_insert("color", frame=t0)
            sp.location = p0 + Vector((rnd.uniform(-6, -2), rnd.uniform(-1.5, 1.5), rnd.uniform(5, 9))); sp.keyframe_insert("location", frame=t0 + 60)
            sp.scale = (3.5, 3.5, 3.5); sp.keyframe_insert("scale", frame=t0 + 60)
            sp.color = (1, 1, 1, 0.0); sp.keyframe_insert("color", frame=t0 + 60)
        st = cols[0] and AN  # noqa
        K.keycam(cam, [(f0, (-12.5, 3.2, 2.0), (-18, 4.6, 1.9)), (f1, (-11.5, 3.3, 2.0), (-14, 4.6, 1.9))], lens_keys=[(f0, 30), (f1, 32)])
        foc = K.focus_empty("FOC_S10", c, cols[0]["rig"], "Head")
        K.track_cam(cam, foc)
        cam.data.dof.use_dof = True; cam.data.dof.focus_object = foc; cam.data.dof.aperture_fstop = 2.8
        K.shake(cam, f0, f1, amp=0.004, rot_amp=0.1, seed=56)
        sc.camera = cam
        fill = Y.light("Fill_S10", 'AREA', (-14, 2.0, 3.2), 900, color=(1.0, 0.85, 0.7), size=6, c=c, rot=(math.radians(60), 0, math.radians(-160))); fill.data.use_shadow = False
        K.comp(sc, fog=(0.85, 0.78, 0.7), fog_amt=0.3, bloom=0.6, gain=(1.12, 1.0, 0.9), vignette=0.45, sat=0.85)

    # ---------------------------------------------------------------- S11 Nagasaki harbour road
    if "S11" in which:
        setc, a = K.get_set("naga_harbor", S.naga_harbor, mode="day")
        sc, c, f0, f1 = K.new_shot("S11", setc)
        K.world(sc, "W_NagaMorning", "kloofendal_48d_partly_cloudy_puresky", 0.8, rot=2.0, mist=(30, 900))
        K.sun("Sun_S11", c, 140, 55, energy=5.0, color=(1, 0.94, 0.85))
        ch = C.build("Yamaguchi_S11", key="Yamaguchi", collection=c)
        C.burn_tint(ch["body"], 0.35)
        C.bandages("S11", ch["rig"], ch["body"])
        R = AN.Retarget(ch["rig"])
        R.clip("91_21", f0, src_from=300, length=f1 - f0 + 1, origin=(-4, a["walk_y"], 0), travel=0.0)
        R.write("S11_Y")
        AN.face(ch["body"], [(f0, "resolve", 0.8), (f1, "pain", 0.5)])
        cam = Y.camera("CAM_S11", (0, 0, 1.4), lens=35, c=c)
        foc = K.focus_empty("FOC_S11", c, ch["rig"], "Head")
        cam.data.dof.use_dof = True; cam.data.dof.focus_object = foc; cam.data.dof.aperture_fstop = 2.8
        st, en = R.root[f0], R.root[f1]
        K.keycam(cam, [(f0, st + Vector((1.2, -3.2, 0.55)), st), (f1, en + Vector((1.6, -2.8, 0.45)), en)])
        K.track_cam(cam, foc)
        K.shake(cam, f0, f1, amp=0.004, rot_amp=0.1, seed=57)
        sc.camera = cam
        K.comp(sc, fog=(0.8, 0.83, 0.86), fog_amt=0.3, bloom=0.5, gain=(1.05, 1.01, 0.96), vignette=0.4)

    # ---------------------------------------------------------------- S17 UN
    if "S17" in which:
        setc, a = K.get_set("un_hall", S.un_hall)
        sc, c, f0, f1 = K.new_shot("S17", setc)
        w = bpy.data.worlds.new("W_UN"); w.use_nodes = True
        w.node_tree.nodes["Background"].inputs["Color"].default_value = (0.01, 0.012, 0.02, 1)
        sc.world = w
        spot = Y.light("Spot_S17", 'SPOT', (1.5, -3.5, 5.5), 1800, color=(1.0, 0.92, 0.8), size=0.4, c=c, spot=28)
        Y.look_at(spot, a["podium"] + Vector((0, 0.3, 1.4)))
        back = Y.light("BackWash_S17", 'AREA', (0, 5.2, 6), 400, color=(0.4, 0.55, 0.9), size=10, c=c, rot=(math.radians(-150), 0, 0)); back.data.use_shadow = False
        rim = Y.light("Rim_S17", 'AREA', (-2.5, 3.5, 3.5), 300, color=(0.7, 0.8, 1.0), size=1.5, c=c); Y.look_at(rim, a["podium"] + Vector((0, 0.3, 1.5)))
        old = C.build("YamaguchiOld_S17", key="YamaguchiOld", collection=c)
        R = AN.Retarget(old["rig"])
        R.clip("18_08", f0, src_from=900, length=f1 - f0 + 1, origin=tuple(a["podium"]), face=-PI / 2, root_motion=False, speed=0.8)
        R.add_rot("Spine1", [(f0, 6), (f1, 6)], axis='X')
        R.write("S17_Old")
        AN.face(old["body"], [(f0, "earnest", 0.8), (f0 + 120, "resolve", 0.8), (f1, "earnest", 0.9)], talk=[(f0 + 10, f0 + 110), (f0 + 130, f1 - 10)])
        cam = Y.camera("CAM_S17", (0, -12, 2.0), lens=40, c=c)
        foc = K.focus_empty("FOC_S17", c, old["rig"], "Head")
        cam.data.dof.use_dof = True; cam.data.dof.focus_object = foc; cam.data.dof.aperture_fstop = 2.0
        pd = a["podium"]
        K.keycam(cam, [(f0, pd + Vector((-1.5, -11.5, 1.6)), pd + Vector((0, 0, 1.3))), (f0 + 130, pd + Vector((-0.8, -6.5, 1.7)), pd + Vector((0, 0, 1.5))),
                       (f1, pd + Vector((-0.45, -3.2, 1.65)), pd + Vector((0, 0, 1.6)))], lens_keys=[(f0, 35), (f1, 60)])
        K.shake(cam, f0, f1, amp=0.004, rot_amp=0.08, seed=58)
        sc.camera = cam
        K.comp(sc, fog=(0.05, 0.07, 0.12), fog_amt=0.2, bloom=0.7, gain=(1.0, 1.0, 1.02), vignette=0.55)

    # ---------------------------------------------------------------- S19 sunset / S20 lanterns
    if "S19" in which or "S20" in which:
        setc, a = K.get_set("naga_later", S.naga_harbor, mode="later")
    if "S19" in which:
        sc, c, f0, f1 = K.new_shot("S19", setc)
        K.world(sc, "W_Sunset", "qwantani_sunset_puresky", 1.3, rot=3.9, tint=(1.0, 0.85, 0.7, 1), sat=1.2, mist=(40, 1500))
        K.sun("Sun_S19", c, 220, 4, energy=3.0, color=(1.0, 0.55, 0.28), angle=1.0)
        old = C.build("YamaguchiOld_S19", key="YamaguchiOld", collection=c)
        R = AN.Retarget(old["rig"])
        R.clip("40_10", f0, src_from=900, length=f1 - f0 + 1, origin=(0, -2.0, 0), face=-PI / 2 - 0.3, root_motion=False, speed=0.7)
        R.write("S19_Old")
        AN.face(old["body"], [(f0, "tender", 0.5), (f1, "resolve", 0.6)])
        cam = Y.camera("CAM_S19", (0, 0, 1), lens=35, c=c)
        K.keycam(cam, [(f0, (-1.2, 1.5, 1.45), (0.2, -3.5, 1.4)), (f1, (-2.2, 3.2, 3.4), (0.5, -8, 0.6))], lens_keys=[(f0, 40), (f1, 28)])
        foc = K.focus_empty("FOC_S19", c, old["rig"], "Head")
        cam.data.dof.use_dof = True; cam.data.dof.focus_object = foc; cam.data.dof.aperture_fstop = 2.8
        K.shake(cam, f0, f1, amp=0.004, rot_amp=0.06, seed=59)
        sc.camera = cam
        K.comp(sc, fog=(0.95, 0.65, 0.45), fog_amt=0.35, bloom=0.8, gain=(1.1, 0.98, 0.86), vignette=0.45)

    if "S20" in which:
        sc, c, f0, f1 = K.new_shot("S20", setc)
        K.world(sc, "W_Dusk", "qwantani_dusk_2_puresky", 0.25, rot=3.9, mist=(10, 400))
        rnd = random.Random(20)
        lc = bpy.data.collections.new("FX_S20"); sc.collection.children.link(lc)
        for i in range(42):
            ln = S.lantern(f"Lantern{i}", lc, i)
            p0 = Vector((rnd.uniform(-8, 8), rnd.uniform(-30, -5), -0.78))
            ln.location = p0; ln.rotation_euler.z = rnd.uniform(0, 6)
            ln.keyframe_insert("location", frame=f0); ln.keyframe_insert("rotation_euler", frame=f0)
            ln.location = p0 + Vector((rnd.uniform(-1.5, 1.5), rnd.uniform(-3, -1), 0)); ln.rotation_euler.z += rnd.uniform(-0.5, 0.5)
            ln.keyframe_insert("location", frame=f1); ln.keyframe_insert("rotation_euler", frame=f1)
            if i % 3 == 0:
                L = Y.light(f"LanternLight{i}", 'POINT', tuple(p0 + Vector((0, 0, 0.25))), 6, color=(1.0, 0.6, 0.25), size=0.1, c=lc)
                L.data.use_shadow = False
                L.parent = ln; L.location = (0, 0, 0.25)
        cam = Y.camera("CAM_S20", (0, 0, 1), lens=28, c=c)
        K.keycam(cam, [(f0, (0.5, -5.0, -0.45), (-1, -18, -0.6)), (f1, (0.3, -4.6, 2.0), (-1, -20, -0.9))])
        cam.data.dof.use_dof = True; cam.data.dof.focus_distance = 9; cam.data.dof.aperture_fstop = 2.0
        K.shake(cam, f0, f1, amp=0.003, rot_amp=0.05, seed=60)
        sc.camera = cam
        K.comp(sc, fog=(0.1, 0.12, 0.18), fog_amt=0.3, bloom=1.2, gain=(1.05, 0.98, 0.95), vignette=0.55,
               exposure_keys=[(f1 - 60, 0.0), (f1, -6.0)])


if __name__ == "__main__":
    which = sys.argv[sys.argv.index("--") + 1].split(",") if "--" in sys.argv else ["S05b", "S07", "S08", "S09", "S10", "S11", "S15a", "S15c", "S17", "S19", "S20"]
    bpy.ops.wm.read_homefile(use_empty=True)
    bpy.context.preferences.filepaths.save_version = 0
    build(which)
    out = sys.argv[sys.argv.index("--") + 2] if "--" in sys.argv and len(sys.argv) > sys.argv.index("--") + 2 else "/home/user/code/production/blend/seq_misc.blend"
    bpy.ops.wm.save_as_mainfile(filepath=out)
    print("SAVED", out)
