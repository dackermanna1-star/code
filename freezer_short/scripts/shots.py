"""Shot definitions for "Could you survive trapped inside a giant industrial freezer?"

Timeline: 30 fps, frame 1 = narration t=0 (narration_full.wav includes a 0.6 s lead-in).
Every shot keeps its camera position fixed and only pans/tilts/zooms (plus handheld
shake), so the environment can be rendered once per shot as a high-quality plate and
re-projected exactly (homography) under the per-frame character pass.
"""
import bpy, math, json, random
from mathutils import Vector, Quaternion, Euler, Matrix
import lib_anim as A

BVH = "/opt/assets/mocap/bvh/{}.bvh"
FPS = 30
SH02_YAW = -1
SH10C_CONTACT = Vector((-2.44, -1.85, 1.42))   # wrist target: the upright palm presses on the top shelf's front rail (x -2.45, z ~1.48)   # direction of SH02's look back at the door (checked in a preview)
SHOTS = {}  # id -> metadata (written to scene["shots"])


def F(t):
    """seconds -> frame"""
    return int(round(t * FPS)) + 1


# ------------------------------------------------------------------ scene state
def keyprop(name, frame, value, interp="CONSTANT"):
    sc = bpy.context.scene
    sc[name] = value
    sc.keyframe_insert(f'["{name}"]', frame=frame)
    act = sc.animation_data.action
    for fc in act.fcurves:
        if fc.data_path == f'["{name}"]':
            for k in fc.keyframe_points:
                if abs(k.co[0] - frame) < 0.01:
                    k.interpolation = interp


def state(f0, **kw):
    for k, v in kw.items():
        keyprop(k, f0, v)


def ramp(name, f0, v0, f1, v1):
    keyprop(name, f0, v0, "BEZIER"); keyprop(name, f1, v1, "CONSTANT")


def key_obj(obj, path, frame, value, index=-1, interp="BEZIER"):
    if index >= 0:
        getattr(obj, path)[index] = value
        obj.keyframe_insert(path, index=index, frame=frame)
    else:
        setattr(obj, path, value); obj.keyframe_insert(path, frame=frame)
    for fc in obj.animation_data.action.fcurves:
        if fc.data_path == path:
            for k in fc.keyframe_points:
                if abs(k.co[0] - frame) < 0.01: k.interpolation = interp
    A.assign(obj, obj.animation_data.action)


# ------------------------------------------------------------------ cameras
def camera(sid, f0, f1, loc, keys, shake=0.0, shake_freq=0.6, fstop=None, focus=None, roll_keys=None, seed=0, focus_track=None):
    """keys: list of (frame, target_xyz, lens_mm). Location fixed (plate compatible)."""
    sc = bpy.context.scene
    cd = bpy.data.cameras.new("CAM_" + sid)
    cd.sensor_fit = "VERTICAL"; cd.sensor_height = 24.0; cd.clip_start = 0.02; cd.clip_end = 60
    cam = bpy.data.objects.new("CAM_" + sid, cd)
    if "CAMERAS" not in bpy.data.collections:
        c = bpy.data.collections.new("CAMERAS"); sc.collection.children.link(c)
    bpy.data.collections["CAMERAS"].objects.link(cam)
    cam.location = loc; cam.rotation_mode = "QUATERNION"
    rnd = random.Random(seed + hash(sid) % 1000)
    ph = [rnd.uniform(0, 6.28) for _ in range(6)]
    loc = Vector(loc)
    for f in range(f0, f1 + 1):
        # interpolate target & lens
        if f <= keys[0][0]: tgt, lens = Vector(keys[0][1]), keys[0][2]
        elif f >= keys[-1][0]: tgt, lens = Vector(keys[-1][1]), keys[-1][2]
        else:
            for a, b in zip(keys, keys[1:]):
                if a[0] <= f <= b[0]:
                    t = A.smooth((f - a[0]) / max(1, b[0] - a[0]))
                    tgt = Vector(a[1]).lerp(Vector(b[1]), t); lens = a[2] + (b[2] - a[2]) * t
                    break
        q = (tgt - loc).to_track_quat("-Z", "Y")
        roll = A.weight_curve(roll_keys, f) if roll_keys else 0.0
        if shake > 0 or roll:
            t = f / FPS
            sx = shake * (0.6 * math.sin(2 * math.pi * shake_freq * t + ph[0]) + 0.4 * math.sin(2 * math.pi * shake_freq * 2.3 * t + ph[1]))
            sy = shake * (0.6 * math.sin(2 * math.pi * shake_freq * 0.8 * t + ph[2]) + 0.4 * math.sin(2 * math.pi * shake_freq * 1.9 * t + ph[3]))
            sz = 0.5 * shake * math.sin(2 * math.pi * shake_freq * 0.5 * t + ph[4])
            q = q @ Euler((math.radians(sx), math.radians(sy), math.radians(sz + roll))).to_quaternion()
        cam.rotation_quaternion = q; cam.keyframe_insert("rotation_quaternion", frame=f)
        cd.lens = lens; cd.keyframe_insert("lens", frame=f)
    A.assign(cam, cam.animation_data.action)
    A.assign(cd, cd.animation_data.action)
    if fstop:
        cd.dof.use_dof = True; cd.dof.aperture_fstop = fstop
        cd.dof.focus_distance = focus if focus else (Vector(keys[0][1]) - loc).length
        if focus_track:  # (rig, bone, where[, offset]): keep that point in focus as it moves
            frig, fb, fw_ = focus_track[:3]; foff = Vector(focus_track[3]) if len(focus_track) > 3 else Vector()
            for f in range(f0, f1 + 1, 2):
                cd.dof.focus_distance = (bpos(frig, fb, f, fw_) + foff - loc).length
                cd.keyframe_insert("dof.focus_distance", frame=f)
            A.assign(cd, cd.animation_data.action)
    return cam


def shot(sid, f0, f1, cam, mode="plate", dynamic=(), chars=("Leo",), note="", lights=None, plate_variants=None):
    SHOTS[sid] = {"id": sid, "f0": f0, "f1": f1, "camera": cam.name, "mode": mode, "dynamic": list(dynamic),
                  "chars": list(chars), "note": note, "plate_variants": plate_variants or []}


# ------------------------------------------------------------------ helpers for the character
def leo():
    return bpy.data.objects["Leo"]


def leo_body():
    return bpy.data.objects["Leo.body"]


def act(rig):
    if rig.animation_data and rig.animation_data.action:
        return rig.animation_data.action
    a = bpy.data.actions.new("ACT_" + rig.name); A.assign(rig, a)
    return a


_SHOT = [None, None]


def begin(f0, f1):
    _SHOT[0], _SHOT[1] = f0, f1


def mocap(rig, clip, s0, s1, f0, face_deg=0.0, pos=(0, 0), speed=1.0, bones=None, n=None, z=0.0, root_motion=True, path_deg=None, path_end=None):
    """face_deg: facing at s0 (0 = -Y). path_deg: instead align the hips travel s0->path_end to this direction."""
    if path_deg is not None:
        canon = A.canon_angle(BVH.format(clip))
        d = A.clip_hips(BVH.format(clip), path_end or s1, canon) - A.clip_hips(BVH.format(clip), s0, canon)
        ang = math.degrees(math.atan2(d.x, -d.y))
        yaw = path_deg - ang
    else:
        yaw = face_deg - A.clip_heading(BVH.format(clip), s0)
    if n is None and _SHOT[1] is not None and f0 <= _SHOT[1]:
        n_clip = int((s1 - s0) / (4.0 * max(speed, 1e-6))) + 1
        n = min(n_clip, _SHOT[1] - f0 + 1)
    a, last = A.retarget(rig, BVH.format(clip), s0, s1, f0, speed=speed, yaw_deg=yaw, offset=(pos[0], pos[1], z),
                         action=act(rig), subset=bones, n_frames=n, root_motion=root_motion)
    if _SHOT[1] is not None and last < _SHOT[1] and f0 <= _SHOT[1]:
        A.hold(act(rig), (bones or A.ALL_BODY), last, last + 1, _SHOT[1])
    return last


def mouth_world(rig, frame):
    sc = bpy.context.scene
    sc.frame_set(frame)
    pb = rig.pose.bones["head"]
    M = rig.matrix_world @ pb.matrix
    # mouth ~ 9.5 cm in front of / 2 cm below the head joint in rest space
    rest = rig.data.bones["head"].matrix_local
    off_local = rest.inverted().to_3x3() @ Vector((0, -0.095, -0.02))
    fwd_local = rest.inverted().to_3x3() @ Vector((0, -1, 0))
    return M @ off_local.to_4d().to_3d() if False else (M.to_translation() + M.to_3x3() @ off_local), (M.to_3x3() @ fwd_local).normalized()


_puff_i = [0]


def puffs(rig, frames, strength=1.0, dur=40, drift=(0, 0, 0.12), dist=0.45, size=(0.12, 0.55)):
    """Animate breath vapour clouds starting at each exhale frame."""
    for fr in frames:
        o = bpy.data.objects[f"BreathPuff_{_puff_i[0] % 4}"]; _puff_i[0] += 1
        p0, fwd = mouth_world(rig, fr)
        p1 = p0 + fwd * dist + Vector(drift)
        for f, t in [(fr - 1, -1), (fr, 0.0), (fr + int(dur * 0.25), 0.25), (fr + dur, 1.0)]:
            if t < 0:
                key_obj(o, "location", f, Vector((0, -30, 0)), interp="CONSTANT"); o["puff"] = 0.0
                o.keyframe_insert('["puff"]', frame=f); continue
            pos = p0.lerp(p1, 1 - (1 - t) ** 2)
            key_obj(o, "location", f, pos, interp="LINEAR")
            s = size[0] + (size[1] - size[0]) * (1 - (1 - t) ** 2)
            key_obj(o, "scale", f, Vector((s, s * 1.2, s)), interp="LINEAR")
            o["puff"] = strength * (0.0 if t == 0 else (1.0 if t == 0.25 else 0.0))
            o.keyframe_insert('["puff"]', frame=f)
        key_obj(o, "location", fr + dur + 1, Vector((0, -30, 0)), interp="CONSTANT")
        A.assign(o, o.animation_data.action)


def leo_face(f0, f1, base, keys=(), blink_s=3.0, droop=None, chatter_amp=None, seed=1):
    body = leo_body(); A.face_action(body)
    A.face_keys(body, f0, base)
    for fr, vals in keys:
        A.face_keys(body, fr, vals)
    A.face_keys(body, f1, base if not keys else dict(base, **keys[-1][1]))
    if blink_s:
        A.blinks(body, f0, f1, blink_s, seed=seed + f0, droop_keys=droop)
    if chatter_amp:
        A.chatter(body, f0, f1, chatter_amp, seed=seed)


# ------------------------------------------------------------------ COLD STATE over the story
# (pale/red/lips/hands/goosebumps/frost on hair; frost on surfaces) keyed per shot
def cold_state(f0, stage):
    S = {
        0: dict(frost=0.30, cold_pale=0.0, cold_red=0.0, cold_lips=0.0, cold_hands=0.0, goosebumps=0.0, frost_hair=0.0),
        1: dict(frost=0.32, cold_pale=0.1, cold_red=0.35, cold_lips=0.0, cold_hands=0.0, goosebumps=0.6, frost_hair=0.0),
        2: dict(frost=0.34, cold_pale=0.25, cold_red=0.55, cold_lips=0.15, cold_hands=0.3, goosebumps=0.9, frost_hair=0.08),
        3: dict(frost=0.55, cold_pale=0.45, cold_red=0.5, cold_lips=0.45, cold_hands=0.6, goosebumps=1.0, frost_hair=0.35),
        4: dict(frost=0.72, cold_pale=0.65, cold_red=0.3, cold_lips=0.75, cold_hands=0.85, goosebumps=1.0, frost_hair=0.6),
        5: dict(frost=0.85, cold_pale=0.85, cold_red=0.15, cold_lips=1.0, cold_hands=1.0, goosebumps=0.6, frost_hair=0.85),
    }[stage]
    state(f0, **S)


def door(frame, angle_deg, interp="BEZIER"):
    piv = bpy.data.objects["Door_Pivot"]
    piv.rotation_euler[2] = math.radians(angle_deg)
    piv.keyframe_insert("rotation_euler", index=2, frame=frame)
    for fc in piv.animation_data.action.fcurves:
        for k in fc.keyframe_points:
            if abs(k.co[0] - frame) < 0.01: k.interpolation = interp
    A.assign(piv, piv.animation_data.action)


def dock_light(frame, energy, interp="BEZIER"):
    l = bpy.data.lights["Dock_Warm"]; l.energy = energy; l.keyframe_insert("energy", frame=frame)
    for fc in l.animation_data.action.fcurves:
        for k in fc.keyframe_points:
            if abs(k.co[0] - frame) < 0.01: k.interpolation = interp
    A.assign(l, l.animation_data.action)


DOOR_PARTS = ["Door_Pivot", "Door_Slab", "Door_Gasket", "Door_KickPlate", "Release_Rod", "Release_Cap",
              "Release_Backplate", "ReleaseLabel_0", "ReleaseLabel_1", "ReleaseLabel_2", "Release_Ice"]
FANS = [f"Evap_Hub_{k}" for k in range(3)] + [f"Evap_Blade_{k}_{j}" for k in range(3) for j in range(5)]
PUFFS = [f"BreathPuff_{i}" for i in range(4)]


# =================================================================== helpers (2)
def bpos(rig, bone, frame, where="head"):
    bpy.context.scene.frame_set(frame)
    pb = rig.pose.bones[bone]
    p = pb.head if where == "head" else (pb.tail if where == "tail" else (pb.head + pb.tail) / 2)
    return rig.matrix_world @ p


def mocap_pair(rigA, clipA, rigB, clipB, s0, s1, f0, face_deg, pos, speed=1.0, n=None):
    """Synchronised two-actor take: same canonical frame/yaw, B placed relative to A."""
    canon = A.canon_angle(BVH.format(clipA))
    yaw = face_deg - A.clip_heading(BVH.format(clipA), s0)
    hA = A.clip_hips(BVH.format(clipA), s0, canon); hB = A.clip_hips(BVH.format(clipB), s0, canon)
    sA = A.src_scale(rigA, BVH.format(clipA))
    d = (hB - hA) * sA
    yq = Quaternion((0, 0, 1), math.radians(yaw))
    dw = yq @ Vector((d.x, d.y, 0))
    if n is None and _SHOT[1] is not None:
        n = min(int((s1 - s0) / (4.0 * speed)) + 1, _SHOT[1] - f0 + 1)
    _, lastA = A.retarget(rigA, BVH.format(clipA), s0, s1, f0, speed=speed, yaw_deg=yaw, offset=(pos[0], pos[1], 0),
                          action=act(rigA), canon_deg=canon, n_frames=n)
    _, lastB = A.retarget(rigB, BVH.format(clipB), s0, s1, f0, speed=speed, yaw_deg=yaw,
                          offset=(pos[0] + dw.x, pos[1] + dw.y, 0), action=act(rigB), canon_deg=canon, n_frames=n)
    return lastA


def facing(rig, frame, bone="spine_03"):
    bpy.context.scene.frame_set(frame)
    rest = rig.data.bones[bone].matrix_local.to_3x3()
    local_fwd = rest.inverted() @ Vector((0, -1, 0))
    f = (rig.matrix_world.to_3x3() @ rig.pose.bones[bone].matrix.to_3x3() @ local_fwd)
    f.z = 0
    return f.normalized()


def orbit(rig, frame, bone, dist, az=0.0, el=0.0, where="head", up=0.0):
    """Camera position around a bone, relative to the character's facing: az 0 = in front, +90 = his left."""
    p = bpos(rig, bone, frame, where) + Vector((0, 0, up))
    fw = facing(rig, frame); left = Vector((0, 0, 1)).cross(fw)
    a, e = math.radians(az), math.radians(el)
    d = (fw * math.cos(a) + left * math.sin(a)) * math.cos(e) + Vector((0, 0, math.sin(e)))
    return tuple(p + d * dist), p


def vis_key(name, ranges):
    """Object render visibility: visible only inside the given (f0,f1) ranges."""
    o = bpy.data.objects[name]
    o.hide_render = True; o.keyframe_insert("hide_render", frame=1)
    for a0, a1 in ranges:
        o.hide_render = False; o.keyframe_insert("hide_render", frame=a0)
        o.hide_render = True; o.keyframe_insert("hide_render", frame=a1 + 1)
    for fc in o.animation_data.action.fcurves:
        for k in fc.keyframe_points: k.interpolation = "CONSTANT"
    A.assign(o, o.animation_data.action)
    o.hide_viewport = False


def maya():
    return bpy.data.objects["Maya"]


def park(rig, f):
    """Move a character far off-set (constant) from frame f."""
    a = act(rig)
    B = rig.data.bones["pelvis"].matrix_local.to_3x3().inverted()
    v = B @ Vector((0, -40, 0))
    pth = 'pose.bones["pelvis"].location'
    for c in range(3):
        fc = a.fcurves.find(pth, index=c) or a.fcurves.new(pth, index=c, action_group="pelvis")
        A._set_keys(fc, [f], [v[c]])


def phone_hold(f, infl):
    ph = bpy.data.objects["Phone"]; c = ph.constraints["Child Of"]
    c.influence = infl; c.keyframe_insert("influence", frame=f)
    for fc in ph.animation_data.action.fcurves:
        for k in fc.keyframe_points:
            k.interpolation = "CONSTANT"
    A.assign(ph, ph.animation_data.action)


def phone_setup(rig, f_ref, f_key=None):
    """Put the phone in the right palm (screen towards the face) for the shot starting at f_key.
    Child Of inverse stays identity; the hand-local offset is keyed per shot (constant)."""
    ph = bpy.data.objects["Phone"]; c = ph.constraints["Child Of"]
    c.inverse_matrix = Matrix.Identity(4)
    f_key = f_key or f_ref
    bpy.context.scene.frame_set(f_ref)
    pb = rig.pose.bones["hand_r"]
    Mb = rig.matrix_world @ pb.matrix
    mid = rig.matrix_world @ rig.pose.bones["middle_01_r"].head
    head = rig.matrix_world @ rig.pose.bones["head"].head
    hand = Mb.to_translation()
    along = (mid - hand).normalized()
    to_face = (head - hand).normalized()
    n = (to_face - along * to_face.dot(along)).normalized()   # screen normal, towards the face
    x = along.cross(n).normalized()
    R = Matrix((x, -n, along)).transposed()  # phone local: X=x, -Y = screen normal, Z = long axis
    W = Matrix.Translation(hand.lerp(mid, 0.8) + n * 0.032) @ R.to_4x4()
    L = Mb.inverted() @ W
    ph.rotation_mode = "QUATERNION"
    ph.matrix_basis = L
    for path in ("location", "rotation_quaternion"):
        ph.keyframe_insert(path, frame=f_key)
    for fc in ph.animation_data.action.fcurves:
        for k in fc.keyframe_points:
            if abs(k.co[0] - f_key) < 0.01: k.interpolation = "CONSTANT"
    A.assign(ph, ph.animation_data.action)


def seat_at(loc, height):
    """Two product boxes stacked as a seat (static set dressing, rendered in the plates)."""
    lib = bpy.data.objects["LIB_cardboard_box_01"]
    dz = lib["dims"][2]
    n = 2; sc_ = height / (dz * n)
    objs = []
    for k in range(n):
        o = bpy.data.objects.new(f"Seat_Box_{k}", lib.data); bpy.data.collections["ENV_Products"].objects.link(o)
        o.location = (loc[0] + 0.01 * k, loc[1] - 0.01 * k, dz * sc_ * k); o.scale = (1.15, 1.05, sc_)
        o.rotation_euler = (0, 0, math.radians(90 + 4 * k)); objs.append(o)
    return objs


def hide_blanket_until(f_show, f_hide=10 ** 6):
    bl = bpy.data.objects["FoilBlanket"]
    for f, v in [(1, True), (f_show, False), (f_hide, True)]:
        bl.hide_render = v; bl.keyframe_insert("hide_render", frame=f)
    A.assign(bl, bl.animation_data.action)


STAND = ["pelvis", "spine_01", "spine_02", "spine_03", "neck_01", "head"]
ARM_L = ["clavicle_l", "upperarm_l", "lowerarm_l", "hand_l"]
ARM_R = ["clavicle_r", "upperarm_r", "lowerarm_r", "hand_r"]
LEGS = ["thigh_l", "calf_l", "foot_l", "ball_l", "thigh_r", "calf_r", "foot_r", "ball_r"]


# =================================================================== more helpers
def place(rig, clip, s0, s1, f0, anchor_f, anchor_xy, bone="pelvis", **kw):
    """Two-pass mocap placement: bone (xy) at anchor_f lands on anchor_xy."""
    kw.setdefault("pos", (0, 0))
    mocap(rig, clip, s0, s1, f0, **kw)
    p = bpos(rig, bone, anchor_f)
    kw["pos"] = (kw["pos"][0] + anchor_xy[0] - p.x, kw["pos"][1] + anchor_xy[1] - p.y)
    return mocap(rig, clip, s0, s1, f0, **kw)


def track(rig, bone, f0, f1, step, lens, off=(0, 0, 0), where="head", lens1=None):
    keys = []
    fr = list(range(f0, f1 + 1, step))
    if fr[-1] != f1: fr.append(f1)
    for i, f in enumerate(fr):
        l = lens if lens1 is None else lens + (lens1 - lens) * i / max(1, len(fr) - 1)
        keys.append((f, tuple(bpos(rig, bone, f, where) + Vector(off)), l))
    # smooth targets (moving average) so the pan feels operated, not locked
    sm = []
    for i in range(len(keys)):
        js = [keys[j][1] for j in range(max(0, i - 1), min(len(keys), i + 2))]
        sm.append((keys[i][0], tuple(sum((Vector(v) for v in js), Vector()) / len(js)), keys[i][2]))
    return sm


def ik_setup(rig):
    for side in "lr":
        nm = f"IK_hand_{side}"
        if nm in bpy.data.objects: continue
        e = bpy.data.objects.new(nm, None); bpy.data.collections["PROPS"].objects.link(e); e.empty_display_size = 0.05
        c = rig.pose.bones[f"lowerarm_{side}"].constraints.new("IK"); c.name = "IK"
        c.target = e; c.chain_count = 2; c.influence = 0.0; c.use_stretch = False
        c.keyframe_insert("influence", frame=1)


def ik_key(rig, side, frame, infl, pos=None):
    c = rig.pose.bones[f"lowerarm_{side}"].constraints["IK"]
    c.influence = infl; c.keyframe_insert("influence", frame=frame)
    if pos is not None:
        e = bpy.data.objects[f"IK_hand_{side}"]; e.location = pos; e.keyframe_insert("location", frame=frame)
        A.assign(e, e.animation_data.action)
    A.assign(rig, rig.animation_data.action)


def _has_key(obj, path, frame):
    ad = obj.animation_data
    fc = ad.action.fcurves.find(path) if ad and ad.action else None
    return bool(fc) and any(abs(k.co[0] - frame) < 0.01 for k in fc.keyframe_points)


def ik_block(rig, sides, f0, f1, bone="lowerarm_{}", name="IK"):
    """Zero IK influence just outside [f0, f1] so curves never bleed into neighbouring shots.
    A key already sitting at f0-1 is the previous shot's last frame, so it is left alone."""
    for side in sides:
        bn = bone.format(side); c = rig.pose.bones[bn].constraints[name]
        for f in (f0 - 1, f1 + 1):
            if f == f0 - 1 and _has_key(rig, f'pose.bones["{bn}"].constraints["{name}"].influence', f): continue
            c.influence = 0.0; c.keyframe_insert("influence", frame=f)


def _ensure_pelvis_loc(rig, f0, f1):
    act_ = act(rig)
    for c in range(3):
        if act_.fcurves.find('pose.bones["pelvis"].location', index=c) is None:
            for f in (f0, f1): rig.pose.bones["pelvis"].keyframe_insert("location", index=c, frame=f)
    A.assign(rig, act_)


def ground_feet(rig, f0, f1, ankle=0.085):
    """Some takes carry their actor's stool/platform height: drop the pelvis so the lower foot rests on the floor."""
    lows = []
    for f in range(f0, f1 + 1, 2):
        lows.append(min(bpos(rig, b, f).z for b in ("foot_l", "foot_r")))
    dz = ankle - sorted(lows)[len(lows) // 4]
    if abs(dz) < 0.015: return 0.0
    _ensure_pelvis_loc(rig, f0, f1)
    A.pelvis_offset(act(rig), f0, f1, [(f0, (0, 0, dz)), (f1, (0, 0, dz))])
    return dz


def hold_slump(rig, frame, f0, f1):
    """Hold the slumped pose of `frame` (body + seat height) with the feet planted where they were."""
    A.hold(act(rig), A.ALL_BODY, frame, f0, f1)
    for sd in ("lr" if "IKF_foot_l" in bpy.data.objects else ""):
        e = bpy.data.objects[f"IKF_foot_{sd}"]; bpy.context.scene.frame_set(frame); p_ = e.location.copy()
        c = rig.pose.bones[f"calf_{sd}"].constraints["IKleg"]
        for ff in (f0, f1):
            e.location = p_; e.keyframe_insert("location", frame=ff); c.influence = 1.0; c.keyframe_insert("influence", frame=ff)
        c.influence = 0.0; c.keyframe_insert("influence", frame=f1 + 1)
    A.assign(rig, act(rig))


def ground_walk(rig, f0, f1, ankle=0.085, win=4):
    """Per-frame grounding for walks: keep the lower foot on the floor (smoothed), so neither foot hovers above
    its contact shadow (a single constant offset left the second half of SH01's walk floating)."""
    fr = list(range(f0, f1, 2)) + [f1]
    lows = [min(bpos(rig, b, f).z for b in ("foot_l", "foot_r")) for f in fr]
    d = [ankle - v for v in lows]
    sm = [sum(d[max(0, i - win):i + win + 1]) / len(d[max(0, i - win):i + win + 1]) for i in range(len(d))]
    _ensure_pelvis_loc(rig, f0, f1)
    A.pelvis_offset(act(rig), f0, f1, [(f, (0, 0, z)) for f, z in zip(fr, sm)])


def hold_box(rig, box, f0, f1, ramp=0):
    """IK: both wrists on the sides of a carried box (the walk take kept swinging the arms, so the box floated)."""
    ik_setup(rig); ik_block(rig, "lr", f0, f1)
    dg = bpy.context.evaluated_depsgraph_get()
    for ff in list(range(f0, f1, 2)) + [f1]:
        bpy.context.scene.frame_set(ff)
        be = box.evaluated_get(dg); M = be.matrix_world
        cs = [M @ Vector(c) for c in be.bound_box]; ctr = sum(cs, Vector()) / 8
        ya = (M.to_3x3() @ Vector((0, 1, 0))).normalized(); za = (M.to_3x3() @ Vector((0, 0, 1))).normalized()
        hw = max((c - ctr).dot(ya) for c in cs); hh = max((c - ctr).dot(za) for c in cs)
        w = A.smooth(min(1.0, (ff - f0) / ramp)) if ramp else 1.0
        for side in "lr":
            # wrists just under the bottom edge near each end, so the hands carry it from below
            cand = [ctr + ya * (hw - 0.06) * sg - za * (hh + 0.03) for sg in (1, -1)]
            p = min(cand, key=lambda q: (q - bpos(rig, f"upperarm_{side}", ff)).length)
            ik_key(rig, side, ff, w, tuple(p))


def follow_object(obj, f0, f1, step=3, off=(0, 0, 0)):
    """Smoothed per-frame world positions of an object (camera look-at targets)."""
    sc = bpy.context.scene; pts = []
    for ff in list(range(f0, f1, step)) + [f1]:
        sc.frame_set(ff); pts.append((ff, obj.matrix_world.to_translation() + Vector(off)))
    return [(f, sum((pts[j][1] for j in range(max(0, i - 1), min(len(pts), i + 2))), Vector()) / len(pts[max(0, i - 1):i + 2]))
            for i, (f, _) in enumerate(pts)]


def key_focus_on(cam, obj, f0, f1, step=2):
    sc = bpy.context.scene; cd = cam.data; loc = cam.matrix_world.to_translation()
    for ff in range(f0, f1 + 1, step):
        sc.frame_set(ff); cd.dof.focus_distance = (obj.matrix_world.to_translation() - loc).length
        cd.keyframe_insert("dof.focus_distance", frame=ff)
    A.assign(cd, cd.animation_data.action)


def sit_on(rig, f0, f1, seat_top, start=None, seated=None, ankle=0.085):
    """Seat the hips on the box and keep the feet on the floor (leg IK). The sitting take (CMU 22_03) was
    recorded on a tall stool, so without this he hovers ~0.4 m above a 0.46 m box with his feet in the air.
    start/seated: frames over which he lowers onto the seat (default: seated for the whole range)."""
    fs = seated if seated is not None else f0
    dz = seat_top + 0.095 - bpos(rig, "pelvis", max(fs, f0 + 1)).z
    w = (lambda f: A.weight_curve([(start, 0.0), (seated, 1.0)], f)) if start is not None else (lambda f: 1.0)
    frames = list(range(f0, f1, 4)) + [f1]
    feet = {ff: {sd: bpos(rig, f"foot_{sd}", ff) for sd in "lr"} for ff in frames}   # before the offset
    _ensure_pelvis_loc(rig, f0, f1)
    keys = [(f0, (0, 0, dz))] if start is None else [(f0, (0, 0, 0)), (start, (0, 0, 0)), (seated, (0, 0, dz))]
    A.pelvis_offset(act(rig), f0, f1, keys + [(f1, (0, 0, dz))])
    for sd in "lr":
        nm = f"IKF_foot_{sd}"
        if nm not in bpy.data.objects:
            e = bpy.data.objects.new(nm, None); bpy.data.collections["PROPS"].objects.link(e); e.empty_display_size = 0.05
            c = rig.pose.bones[f"calf_{sd}"].constraints.new("IK"); c.name = "IKleg"
            c.target = e; c.chain_count = 2; c.influence = 0.0; c.use_stretch = False
            c.keyframe_insert("influence", frame=1)
    ik_block(rig, "lr", f0, f1, bone="calf_{}", name="IKleg")
    for ff in frames:
        for sd in "lr":
            fp = feet[ff][sd]
            e = bpy.data.objects[f"IKF_foot_{sd}"]; e.location = (fp.x, fp.y, ankle); e.keyframe_insert("location", frame=ff)
            A.assign(e, e.animation_data.action)
            c = rig.pose.bones[f"calf_{sd}"].constraints["IKleg"]; c.influence = w(ff); c.keyframe_insert("influence", frame=ff)
    A.assign(rig, act(rig))
    return dz


def tuck_arms(rig, f0, f1, release=None, ramp_in=0, reach=0.2, fwd=(0.13, 0.10)):
    """Arms wrapped round the body, hands tucked at the opposite armpits (IK wrists, straight hands).
    Continuity with SH17c and the advice in L14; the arm mocap underneath keeps the elbows alive.
    release=(fa, fb): the hold lets go between fa and fb (arms fall to whatever the layers below say)."""
    ik_setup(rig); ik_block(rig, "lr", f0, f1)
    fend = release[1] if release else f1
    for ff in list(range(f0, fend, 6)) + [fend]:
        fw = facing(rig, ff); ch = bpos(rig, "spine_03", ff, "tail")
        for side, opp, fd, dz in (("l", "r", fwd[0], -0.15), ("r", "l", fwd[1], -0.12)):
            p = bpos(rig, f"upperarm_{opp}", ff, "head").lerp(ch, reach) + fw * fd + Vector((0, 0, dz))
            w = 1.0 if not release or ff <= release[0] else 0.0
            if ramp_in: w *= A.smooth(min(1.0, (ff - f0) / ramp_in))
            ik_key(rig, side, ff, w, tuple(p))
    hk = [(f0, (0, 0, 0), 0.85), (f1, (0, 0, 0), 0.85)]
    if release:
        fa, fb = release
        for side in "lr":
            ik_key(rig, side, fa, 1.0); ik_key(rig, side, fb, 0.0); ik_key(rig, side, f1, 0.0)
        hk = [(f0, (0, 0, 0), 0.85), (fa, (0, 0, 0), 0.85), (fb, (0, 0, 0), 0.0), (f1, (0, 0, 0), 0.0)]
    for side in "lr":  # hands continue the forearm line so they slide under the opposite arm
        A.layer(act(rig), f"hand_{side}", f0, f1, hk, mode="replace")


def hands_front(rig, f0, f1, fwd=0.33, down=0.24, sep=0.085, rub=0.022):
    """IK: both wrists held out in front of the chest (forearms clear of the torso), rubbing slowly."""
    ik_setup(rig); ik_block(rig, "lr", f0, f1)
    for ff in list(range(f0, f1, 4)) + [f1]:
        fw = facing(rig, ff); left = Vector((0, 0, 1)).cross(fw); ch = bpos(rig, "spine_03", ff, "tail")
        ph = math.sin(2 * math.pi * 1.1 * (ff - f0) / FPS)
        for side, sg in (("l", 1), ("r", -1)):
            p = ch + fw * fwd + left * (sg * sep + rub * ph) + Vector((0, 0, -down + 0.012 * sg * ph))
            ik_key(rig, side, ff, 1.0, tuple(p))


def hands_on(helper, patient, f0, f1, ramp=10):
    """IK: the helper's hands rest on the patient's near upper arm and forearm, settling on over ~10 frames."""
    near = min("lr", key=lambda sd: (bpos(patient, f"upperarm_{sd}", f0) - bpos(helper, "pelvis", f0)).length)
    for side in "lr":
        nm = f"IKM_hand_{side}"
        if nm not in bpy.data.objects:
            e = bpy.data.objects.new(nm, None); bpy.data.collections["PROPS"].objects.link(e); e.empty_display_size = 0.05
            c = helper.pose.bones[f"lowerarm_{side}"].constraints.new("IK"); c.name = "IK"
            c.target = e; c.chain_count = 2; c.influence = 0.0; c.use_stretch = False
            c.keyframe_insert("influence", frame=1)
    for ff in list(range(f0, f1, 6)) + [f1]:
        sh = bpos(patient, f"upperarm_{near}", ff, "head"); up = bpos(patient, f"upperarm_{near}", ff, "mid")
        fore = bpos(patient, f"lowerarm_{near}", ff, "mid")
        out = (sh - bpos(patient, "spine_03", ff, "tail")); out.z = 0; out = out.normalized()
        for side, p in (("r", up + out * 0.05 + Vector((0, 0, -0.03))), ("l", fore + out * 0.05)):
            e = bpy.data.objects[f"IKM_hand_{side}"]; e.location = p; e.keyframe_insert("location", frame=ff)
            A.assign(e, e.animation_data.action)
    for side in "lr":
        bn = f"lowerarm_{side}"; c = helper.pose.bones[bn].constraints["IK"]
        ks = [(f0, 0.0), (f0 + ramp, 1.0)] if ramp else [(f0, 1.0)]
        if not _has_key(helper, f'pose.bones["{bn}"].constraints["IK"].influence', f0 - 1): ks = [(f0 - 1, 0.0)] + ks
        for ff, v in ks + [(f1, 1.0), (f1 + 1, 0.0)]:
            c.influence = v; c.keyframe_insert("influence", frame=ff)
    A.assign(helper, helper.animation_data.action)


def phone_drop(f_drop, floor_z=0.005):
    """Release the phone from the hand and let it fall with a small bounce (hand-keyed)."""
    ph = bpy.data.objects["Phone"]; sc = bpy.context.scene
    sc.frame_set(f_drop)
    M = ph.matrix_world.copy()
    phone_hold(f_drop, 0.0)
    p0 = M.to_translation(); r0 = M.to_euler()
    q0 = M.to_quaternion()
    traj = []
    g = 9.81; vz = 0.3; t = 0.0; z = p0.z; x = p0.x; y = p0.y
    f = f_drop
    while z > floor_z + 0.004 or vz > 0:
        t = 1 / 30; vz -= g * t; z += vz * t; x += 0.25 * t; y += -0.15 * t; f += 1
        if z <= floor_z + 0.004: z = floor_z + 0.004; break
        traj.append((f, (x, y, z)))
    traj.append((f, (x, y, z))); traj.append((f + 3, (x + 0.02, y - 0.01, z + 0.025))); traj.append((f + 6, (x + 0.03, y - 0.015, z)))
    for fr, pp in [(f_drop, tuple(p0))] + traj:
        ph.location = pp; ph.keyframe_insert("location", frame=fr)
    for fr, rr in [(f_drop, q0), (f, Euler((math.radians(90), 0, r0.z + 0.6)).to_quaternion()), (f + 6, Euler((math.radians(90), 0, r0.z + 0.7)).to_quaternion())]:
        ph.rotation_quaternion = rr; ph.keyframe_insert("rotation_quaternion", frame=fr)
    A.assign(ph, ph.animation_data.action)


STAND = ["pelvis", "spine_01", "spine_02", "spine_03", "neck_01", "head"]
ARMS = ["clavicle_l", "upperarm_l", "lowerarm_l", "hand_l", "clavicle_r", "upperarm_r", "lowerarm_r", "hand_r"]
LEGS = ["thigh_l", "calf_l", "foot_l", "ball_l", "thigh_r", "calf_r", "foot_r", "ball_r"]
GRIP = lambda a, f0, f1, pose="grip", w=1.0: (A.hand_pose(a, "l", [(f0, pose, w), (f1, pose, w)]), A.hand_pose(a, "r", [(f0, pose, w), (f1, pose, w)]))


# =================================================================== SHOTS
def build(ids=None):
    rig = leo(); body = leo_body(); my = maya()
    rig.location = (0, 0, 0); my.location = (0, 0, 0)
    for r in (rig, my):
        for pb in r.pose.bones: pb.rotation_mode = "QUATERNION"
    sc = bpy.context.scene
    ik_setup(rig)
    door(1, -100.0, "CONSTANT"); dock_light(1, 900.0, "CONSTANT")
    state(1, thermal_temp=1.0, thermal_hands=1.0, heat0=0.0, heat1=0.0, heat2=0.0, thermal_mode=0.0)
    park(my, 1); phone_hold(1, 0.0)
    want = (lambda x: True) if ids is None else (lambda x: x in ids)
    a = lambda: act(rig)
    box = bpy.data.objects.new("CarryBox", bpy.data.objects["LIB_cardboard_box_01"].data); bpy.data.collections["PROPS"].objects.link(box)
    box.scale = (0.75, 0.75, 0.75)
    vis_key("CarryBox", [(1, F(6.2))])
    vis_key("FoilBlanket", [(F(107.8) + 1, F(120.6))])
    vis_key("Phone", [(F(40.2) + 1, F(45.1)), (F(65.1) + 1, F(66.3))]); vis_key("PhoneScreen", [(F(40.2) + 1, F(45.1)), (F(65.1) + 1, F(66.3))])

    # ---------------------------------------------------------- SH01 walking in with a box (door open, warm dock behind)
    f0, f1 = 1, F(3.8)
    if want("SH01"):
        begin(f0, f1)
        cold_state(f0, 0)
        place(rig, "111_36", 150, 800, f0, f1, (0.1, -2.2), path_deg=180, path_end=470)
        ground_walk(rig, f0, f1)
        cb = box.constraints.new("CHILD_OF"); cb.target = rig; cb.subtarget = "spine_03"
        sc.frame_set(f0 + 50)
        Mb = rig.matrix_world @ rig.pose.bones["spine_03"].matrix
        cb.inverse_matrix = Mb.inverted()
        hl, hr = bpos(rig, "hand_l", f0 + 50), bpos(rig, "hand_r", f0 + 50)
        fw = facing(rig, f0 + 50)
        box.matrix_basis = Matrix.Translation((hl + hr) / 2 + fw * 0.07 + Vector((0, 0, -0.11))) @ \
            Euler((0, 0, math.atan2(fw.y, fw.x))).to_matrix().to_4x4() @ Matrix.Diagonal((0.8, (hl - hr).length / 0.52 * 0.92, 0.85, 1))
        GRIP(a(), f0, F(6.2), "grip", 0.8)
        hold_box(rig, box, f0, f1)
        exh = A.breathe(a(), f0, f1, [(f0, 1.4)], depth_deg=1.2)
        puffs(rig, [e for e in exh if e > f0 + 45], 0.6, dur=34)
        leo_face(f0, f1, {"mouthSmileLeft": 0.15, "mouthSmileRight": 0.15}, blink_s=3.0)
        cam = camera("SH01", f0, f1, (0.95, 0.55, 1.0), track(rig, "spine_03", f0, f1, 15, 26, off=(0, 0, 0.0), lens1=26), shake=0.25)
        shot("SH01", f0, f1, cam, dynamic=PUFFS + DOOR_PARTS + ["CarryBox"], note="walk in, door open",
             plate_variants=[{"door": -100, "dock": 900}])

    # ---------------------------------------------------------- SH02 the door slams shut behind him
    f0, f1 = F(3.8) + 1, F(6.2)
    if want("SH02"):
        begin(f0, f1)
        cold_state(f0, 0)
        sl = F(4.42)
        door(f0, -92.0); door(sl - 10, -75.0); door(sl, 0.0, "LINEAR"); door(sl + 3, -2.5); door(sl + 7, 0.0, "CONSTANT")
        dock_light(f0, 900.0); dock_light(sl, 0.0, "CONSTANT")
        mocap(rig, "111_36", 30, 140, f0, face_deg=180, pos=(0.1, -2.05), speed=0.6, root_motion=False)
        # he twists to look back at the slammed door: yaw is about each bone's own (Y) axis; the old Z keys bent
        # the spine sideways and folded his head ~90 degrees onto his shoulder
        Y = SH02_YAW
        A.layer(a(), "spine_02", sl + 2, f1, [(sl + 2, (0, 0, 0), 0), (sl + 9, (0, 14 * Y, 0), 1), (f1, (0, 18 * Y, 0), 1)])
        A.layer(a(), "spine_03", sl + 2, f1, [(sl + 2, (0, 0, 0), 0), (sl + 8, (3, 12 * Y, 0), 1), (f1, (2, 16 * Y, 0), 1)])
        A.layer(a(), "neck_01", sl + 1, f1, [(sl + 1, (0, 0, 0), 0), (sl + 6, (-3, 18 * Y, 0), 1), (f1, (-2, 22 * Y, 0), 1)])
        A.layer(a(), "head", sl + 1, f1, [(sl + 1, (0, 0, 0), 0), (sl + 5, (-5, 22 * Y, 0), 1), (f1, (-4, 26 * Y, 0), 1)])
        hold_box(rig, box, f0, f1)
        exh = A.breathe(a(), f0, f1, [(f0, 1.3), (sl, 0.8), (f1, 0.9)], depth_deg=1.5)
        puffs(rig, exh, 0.7, dur=34)
        leo_face(f0, f1, {"mouthSmileLeft": 0.1, "mouthSmileRight": 0.1},
                 keys=[(sl + 1, {"eyeWideLeft": 0.0, "eyeWideRight": 0.0}),
                       (sl + 4, {"eyeWideLeft": 0.9, "eyeWideRight": 0.9, "browInnerUp": 0.7, "browOuterUpLeft": 0.6, "browOuterUpRight": 0.6,
                                 "jawOpen": 0.25, "mouthSmileLeft": 0.0, "mouthSmileRight": 0.0})], blink_s=0)
        cp, hp = orbit(rig, f0 + 10, "head", 2.1, az=28, el=2)
        cam = camera("SH02", f0, f1, cp, [(f0, (hp + Vector((0, -2.2, -0.15))).lerp(hp, 0.5), 28), (f1, (hp + Vector((0, -2.2, -0.2))).lerp(hp, 0.5), 30)],
                     shake=0.3, fstop=5.6, focus=1.6)
        shot("SH02", f0, f1, cam, dynamic=PUFFS + DOOR_PARTS + ["CarryBox"], note="door slam",
             plate_variants=[{"door": -100, "dock": 900}, {"door": 0, "dock": 0}])
    # box goes back to the shelf off-screen
    # ---------------------------------------------------------- SH03 thermometer display -20.4 C
    f0, f1 = F(6.2) + 1, F(8.4)
    if want("SH03"):
        begin(f0, f1)
        cold_state(f0, 0); door(f0, 0.0, "CONSTANT"); dock_light(f0, 0.0, "CONSTANT"); park(rig, f0)
        cam = camera("SH03", f0, f1, (0.72, -3.8, 1.55), [(f0, (1.05, -4.47, 1.65), 50), (f1, (1.068, -4.47, 1.655), 74)], shake=0.12, fstop=2.0)
        shot("SH03", f0, f1, cam, chars=(), note="display close-up")

    # ---------------------------------------------------------- SH04 evaporator fans blasting frozen air
    f0, f1 = F(8.4) + 1, F(11.6)
    if want("SH04"):
        begin(f0, f1)
        cold_state(f0, 1)
        mocap(rig, "79_68", 300, 1100, f0, face_deg=180, pos=(0.55, 3.55), speed=0.9, root_motion=False)
        A.layer(a(), "neck_01", f0, f1, [(f0, (-10, 0, 0), 1), (f1, (-14, 0, 0), 1)])
        A.layer(a(), "head", f0, f1, [(f0, (-15, 0, 0), 1), (f0 + 40, (-25, 0, 6), 1), (f1, (-22, 0, -6), 1)])
        A.shiver(a(), f0, f1, [(f0, 0.3), (f1, 0.6)], seed=4)
        GRIP(a(), f0, f1)
        exh = A.breathe(a(), f0, f1, [(f0, 1.2)], depth_deg=1.8)
        puffs(rig, exh, 0.9, dur=40, drift=(0, 0.25, 0.1))
        leo_face(f0, f1, {"browInnerUp": 0.4, "eyeSquintLeft": 0.3, "eyeSquintRight": 0.3}, blink_s=2.5)
        # (the old low camera behind him filled the frame with the seat of his overalls)
        for k in range(3):
            for j in range(5):
                bo = bpy.data.objects.get(f"Evap_Blade_{k}_{j}")
                if bo and bo.animation_data:
                    for dv in bo.animation_data.drivers: dv.driver.expression = dv.driver.expression.replace("frame*0.21", "frame*0.42")
            ho = bpy.data.objects.get(f"Evap_Hub_{k}")
            if ho and ho.animation_data:
                for dv in ho.animation_data.drivers: dv.driver.expression = dv.driver.expression.replace("frame*0.21", "frame*0.42")
        cam = camera("SH04", f0, f1, (1.15, 2.3, 1.5), [(f0, (0.2, 6.0, 2.6), 21), (f1, (0.15, 6.0, 2.7), 23)], shake=0.2)
        shot("SH04", f0, f1, cam, dynamic=PUFFS + FANS, note="fans")

    # ---------------------------------------------------------- SH05 push the door / it won't budge / bang
    f0, f1 = F(11.6) + 1, F(13.9)
    if want("SH05"):
        begin(f0, f1)
        cold_state(f0, 1)
        fb = F(12.65)
        mocap(rig, "82_16", 480, 760, f0, face_deg=0, pos=(0.12, -3.86), speed=0.9, root_motion=False)
        mocap(rig, "82_16", 880, 1300, fb, face_deg=0, pos=(0.12, -3.86), speed=1.1, root_motion=False)
        A.transition(a(), A.ALL_BODY, fb - 5, fb + 3)
        # palms planted on the door while pushing (IK), released for the bang
        ik_block(rig, "lr", f0, f1)
        sc.frame_set(f0 + 5)
        for side, x in (("l", 0.32), ("r", -0.1)):
            ik_key(rig, side, f0, 0.0, (x, -4.47, 1.42)); ik_key(rig, side, f0 + 6, 1.0, (x, -4.47, 1.42))
            ik_key(rig, side, fb - 6, 1.0, (x, -4.47, 1.42)); ik_key(rig, side, fb, 0.0, (x, -4.47, 1.42))
        A.hand_pose(a(), "l", [(f0, "flat", 1.0), (fb, "flat", 1.0), (fb + 6, "fist", 1.0), (f1, "fist", 1.0)])
        A.hand_pose(a(), "r", [(f0, "flat", 1.0), (fb, "flat", 1.0), (fb + 6, "fist", 1.0), (f1, "fist", 1.0)])
        exh = A.breathe(a(), f0, f1, [(f0, 0.9), (f1, 0.8)], depth_deg=2.5)
        puffs(rig, exh, 1.0, dur=34)
        leo_face(f0, f1, {"browDownLeft": 0.6, "browDownRight": 0.6, "jawOpen": 0.1, "mouthStretchLeft": 0.5, "mouthStretchRight": 0.5,
                          "eyeSquintLeft": 0.5, "eyeSquintRight": 0.5, "noseSneerLeft": 0.3, "noseSneerRight": 0.3},
                 keys=[(fb, {"browInnerUp": 0.2}), (fb + 6, {"browInnerUp": 0.8, "jawOpen": 0.35, "mouthFunnel": 0.1})], blink_s=2.5)
        cp, hp = orbit(rig, f0 + 20, "head", 1.75, az=-118, el=8)
        cam = camera("SH05", f0, f1, cp, [(f0, hp + Vector((0, -0.4, -0.15)), 22), (f1, hp + Vector((0, -0.4, -0.12)), 25)], shake=0.45, shake_freq=0.8)
        shot("SH05", f0, f1, cam, dynamic=PUFFS, note="push door")
        ik_key(rig, "l", f1 + 1, 0.0); ik_key(rig, "r", f1 + 1, 0.0)

    # ---------------------------------------------------------- SH06 goosebumps / nerves sounding the alarm
    f0, f1 = F(13.9) + 1, F(16.0)
    if want("SH06a"):
        begin(f0, f1)
        cold_state(f0, 1); ramp("goosebumps", f0, 0.0, f1 - 10, 1.0)
        mocap(rig, "79_68", 400, 1100, f0, face_deg=180, pos=(-0.3, -2.8), speed=0.7, root_motion=False)
        GRIP(a(), f0, f1); A.shiver(a(), f0, f1, [(f0, 0.2), (f1, 0.5)], seed=6)
        cp, hp = orbit(rig, (f0 + f1) // 2, "lowerarm_r", 0.48, az=30, el=18, where="mid")
        cam = camera("SH06a", f0, f1, cp, [(f0, hp, 40), (f1, hp, 46)], shake=0.12, fstop=5.6, focus=0.48)
        shot("SH06a", f0, f1, cam, dynamic=PUFFS, note="goosebumps CU")
    f0, f1 = F(16.0) + 1, F(19.4)
    if want("SH06b"):
        begin(f0, f1)
        cold_state(f0, 1); state(f0, goosebumps=1.0)
        mocap(rig, "79_68", 500, 1180, f0, face_deg=180, pos=(-0.3, -2.8), speed=0.8, root_motion=False)
        GRIP(a(), f0, f1); A.shiver(a(), f0, f1, [(f0, 0.4), (f1, 0.8)], seed=7)
        A.layer(a(), "head", f0, f1, [(f0, (-12, 0, 0), 1), (f1, (-14, 0, 0), 1)])
        exh = A.breathe(a(), f0, f1, [(f0, 1.2)], depth_deg=1.8); puffs(rig, exh, 0.9, dur=40)
        leo_face(f0, f1, {"browInnerUp": 0.5, "eyeSquintLeft": 0.25, "eyeSquintRight": 0.25, "mouthFrownLeft": 0.2, "mouthFrownRight": 0.2}, blink_s=2.6)
        cp, hp = orbit(rig, (f0 + f1) // 2, "spine_03", 1.25, az=12, el=4, up=0.12)
        cam = camera("SH06b", f0, f1, cp, [(f0, hp, 36), (f1, hp + Vector((0, 0, 0.04)), 42)], shake=0.2, fstop=2.8)
        shot("SH06b", f0, f1, cam, dynamic=PUFFS, note="nerve alarm overlay")

    # ---------------------------------------------------------- SH07 thermal: core still 37 C
    f0, f1 = F(19.4) + 1, F(22.7)
    if want("SH07"):
        begin(f0, f1)
        cold_state(f0, 1); state(f0, thermal_temp=1.0, thermal_hands=1.0)
        mocap(rig, "80_41", 220, 1000, f0, face_deg=180, pos=(0.0, -1.0), speed=0.85, root_motion=False)
        tuck_arms(rig, f0, f1)
        A.hand_pose(a(), "l", [(f0, "tucked", 1.0), (f1, "tucked", 1.0)]); A.hand_pose(a(), "r", [(f0, "tucked", 1.0), (f1, "tucked", 1.0)])
        A.shiver(a(), f0, f1, [(f0, 0.5), (f1, 0.6)], seed=8)
        exh = A.breathe(a(), f0, f1, [(f0, 1.2)], depth_deg=1.8); puffs(rig, exh, 1.0, dur=40)
        cp, hp = orbit(rig, f0, "spine_02", 3.1, az=6, el=4)
        cam = camera("SH07", f0, f1, cp, [(f0, hp + Vector((0, 0, 0.05)), 30), (f1, hp + Vector((0, 0, 0.1)), 33)], shake=0.12)
        shot("SH07", f0, f1, cam, mode="thermal", dynamic=PUFFS, note="thermal core 37")

    # ---------------------------------------------------------- SH08 vasoconstriction
    f0, f1 = F(22.7) + 1, F(25.8)
    if want("SH08a"):
        begin(f0, f1)
        cold_state(f0, 2); ramp("thermal_hands", f0 + 20, 1.0, f1, 0.3); state(f0, thermal_temp=0.98)
        mocap(rig, "79_68", 300, 1100, f0, face_deg=180, pos=(0.0, -1.0), speed=0.8, root_motion=False)
        A.hand_pose(a(), "l", [(f0, "relaxed", 1.0), (f1, "claw", 0.6)]); A.hand_pose(a(), "r", [(f0, "relaxed", 1.0), (f1, "claw", 0.6)])
        A.shiver(a(), f0, f1, [(f0, 0.6), (f1, 0.8)], seed=10)
        exh = A.breathe(a(), f0, f1, [(f0, 1.1)], depth_deg=1.8); puffs(rig, exh, 1.0, dur=40)
        cp, hp = orbit(rig, f0, "spine_02", 2.4, az=38, el=10)
        hm = (bpos(rig, "hand_l", f1) + bpos(rig, "hand_r", f1)) / 2
        cam = camera("SH08a", f0, f1, cp, [(f0, hp, 32), (f0 + 25, hp, 32), (f1, hm, 60)], shake=0.1)
        shot("SH08a", f0, f1, cam, mode="thermal", dynamic=PUFFS, note="thermal hands cooling + vessel inset")
    f0, f1 = F(25.8) + 1, F(28.7)
    if want("SH08b"):
        begin(f0, f1)
        cold_state(f0, 2); ramp("cold_hands", f0, 0.2, f1, 0.55)
        mocap(rig, "79_68", 560, 1180, f0, face_deg=180, pos=(0.0, -1.0), speed=0.7, root_motion=False)
        hands_front(rig, f0, f1, fwd=0.30, down=0.05)   # held up in front of the chest, looking at them
        for side in "lr":  # hands continue the forearm line (forward / inward), not the mocap's outward flick
            A.layer(a(), f"hand_{side}", f0, f1, [(f0, (0, 0, 0), 0.8), (f1, (0, 0, 0), 0.8)], mode="replace")
        A.hand_pose(a(), "l", [(f0, "claw", 0.8), (f0 + 30, "grip", 0.9), (f1, "claw", 0.9)])
        A.hand_pose(a(), "r", [(f0, "claw", 0.8), (f0 + 30, "grip", 0.9), (f1, "claw", 0.9)])
        A.shiver(a(), f0, f1, [(f0, 0.7), (f1, 0.9)], seed=11)
        exh = A.breathe(a(), f0, f1, [(f0, 1.1)], depth_deg=1.8); puffs(rig, exh, 1.0, dur=40)
        fm = (f0 + f1) // 2
        hm = (bpos(rig, "hand_l", fm) + bpos(rig, "hand_r", fm)) / 2
        fw = facing(rig, fm)
        hc = hm + fw * 0.07   # centre of the hands, a little in front of the wrists
        cam = camera("SH08b", f0, f1, tuple(hm + fw * 0.85 + Vector((0.12, 0, 0.3))), [(f0, hc + Vector((0, 0, 0.08)), 30), (f1, hc + Vector((0, 0, 0.08)), 34)], shake=0.18, fstop=2.8)
        shot("SH08b", f0, f1, cam, dynamic=PUFFS, note="pale hands CU")

    # ---------------------------------------------------------- SH09 the shivering starts
    f0, f1 = F(28.7) + 1, F(34.1)
    if want("SH09"):
        begin(f0, f1)
        cold_state(f0, 2)
        mocap(rig, "80_41", 230, 900, f0, face_deg=180, pos=(-0.6, -1.2), speed=0.8, root_motion=False)
        tuck_arms(rig, f0, f1)
        A.hand_pose(a(), "l", [(f0, "tucked", 1.0), (f1, "tucked", 1.0)]); A.hand_pose(a(), "r", [(f0, "tucked", 1.0), (f1, "tucked", 1.0)])
        A.shiver(a(), f0, f1, [(f0, 0.3), (f0 + 25, 2.2), (f1, 2.6)], seed=9)
        exh = A.breathe(a(), f0, f1, [(f0, 1.1), (f1, 0.9)], depth_deg=2.2); puffs(rig, exh, 1.0, dur=40)
        leo_face(f0, f1, {"browInnerUp": 0.55, "eyeSquintLeft": 0.35, "eyeSquintRight": 0.35, "mouthFrownLeft": 0.3, "mouthFrownRight": 0.3},
                 blink_s=2.2, chatter_amp=[(f0, 0.0), (f0 + 30, 0.8), (f1, 1.0)])
        cp, hp = orbit(rig, (f0 + f1) // 2, "neck_01", 1.25, az=8, el=2)
        cam = camera("SH09", f0, f1, cp, [(f0, hp + Vector((0, 0, -0.04)), 40), (f1, hp + Vector((0, 0, 0.02)), 50)], shake=0.45, shake_freq=0.9, fstop=2.8,
                     focus_track=(rig, "head", "mid"))
        shot("SH09", f0, f1, cam, dynamic=PUFFS, note="shivering MCU")

    # ---------------------------------------------------------- SH10 heat escaping: air / breath / touch
    f0, f1 = F(34.1) + 1, F(36.9)
    if want("SH10a"):
        begin(f0, f1)
        cold_state(f0, 2); state(f0, thermal_temp=0.97, thermal_hands=0.45)
        mocap(rig, "80_41", 300, 1000, f0, face_deg=180, pos=(0.0, -1.0), speed=0.8, root_motion=False)
        tuck_arms(rig, f0, f1)
        A.hand_pose(a(), "l", [(f0, "tucked", 1.0), (f1, "tucked", 1.0)]); A.hand_pose(a(), "r", [(f0, "tucked", 1.0), (f1, "tucked", 1.0)])
        A.shiver(a(), f0, f1, [(f0, 2.0), (f1, 2.0)], seed=12)
        exh = A.breathe(a(), f0, f1, [(f0, 1.1)], depth_deg=2.0); puffs(rig, exh, 1.0, dur=45)
        cp, hp = orbit(rig, f0, "spine_03", 2.6, az=0, el=8)
        cam = camera("SH10a", f0, f1, cp, [(f0, hp + Vector((0, 0, 0.1)), 28), (f1, hp + Vector((0, 0, 0.25)), 30)], shake=0.1)
        shot("SH10a", f0, f1, cam, mode="thermal", dynamic=PUFFS, note="thermal heat into air")
    f0, f1 = F(36.9) + 1, F(38.4)
    if want("SH10b"):
        begin(f0, f1)
        cold_state(f0, 2)
        mocap(rig, "79_68", 600, 1100, f0, face_deg=180, pos=(-0.4, -1.6), speed=0.6, root_motion=False)
        A.layer(a(), "head", f0, f1, [(f0, (-15, 0, 0), 1), (f1, (-12, 0, 0), 1)])
        A.shiver(a(), f0, f1, [(f0, 1.5), (f1, 1.5)], seed=13)
        puffs(rig, [f0 + 6], 1.6, dur=42, dist=0.6, size=(0.14, 0.75))
        leo_face(f0, f1, {"browInnerUp": 0.5}, keys=[(f0 + 5, {"jawOpen": 0.18, "mouthFunnel": 0.5}), (f0 + 30, {"jawOpen": 0.05, "mouthFunnel": 0.1})], blink_s=0)
        cp, hp = orbit(rig, f0 + 6, "head", 0.95, az=80, el=0, where="mid")
        fw = facing(rig, f0 + 6)
        cam = camera("SH10b", f0, f1, cp, [(f0, hp + fw * 0.07, 30), (f1, hp + fw * 0.1 + Vector((0, 0, 0.02)), 30)], shake=0.12, fstop=2.8, focus=0.95)
        shot("SH10b", f0, f1, cam, dynamic=PUFFS, note="breath CU")
    f0, f1 = F(38.4) + 1, F(40.2)
    if want("SH10c"):
        begin(f0, f1)
        cold_state(f0, 2); state(f0, thermal_temp=0.96, thermal_hands=0.5)
        mocap(rig, "80_41", 300, 900, f0, face_deg=-90, pos=(-2.05, -1.95), speed=0.7, root_motion=False)   # within reach of the rail
        fr_ = f0 + 10
        ik_block(rig, "r", f0, f1)
        cpt = Vector((-2.31, -2.12, 1.08))
        cpt = SH10C_CONTACT
        ch_ = bpos(rig, "spine_03", fr_ + 24, "tail") + facing(rig, fr_ + 24) * 0.24 + Vector((0, 0, -0.14))
        ik_key(rig, "r", f0, 0.0, tuple(cpt + Vector((0.25, 0, -0.1)))); ik_key(rig, "r", fr_, 1.0, tuple(cpt))
        ik_key(rig, "r", fr_ + 12, 1.0, tuple(cpt)); ik_key(rig, "r", fr_ + 24, 1.0, tuple(ch_)); ik_key(rig, "r", f1, 1.0, tuple(ch_))
        A.hand_pose(a(), "r", [(f0, "grip", 1.0), (fr_, "grip", 0.7), (fr_ + 12, "grip", 0.7), (fr_ + 22, "grip", 1.0), (f1, "grip", 1.0)])
        hs = bpy.data.objects["HeatSpot_0"]; hs.location = cpt + Vector((-0.01, 0, 0.06)); hs.scale = (0.11, 0.11, 0.11)   # where the palm lands
        keyprop("heat0", fr_, 0.0, "BEZIER"); keyprop("heat0", fr_ + 10, 0.32, "BEZIER"); keyprop("heat0", f1, 0.05, "CONSTANT")
        cp, hp = orbit(rig, fr_, "spine_03", 1.6, az=-125, el=10)
        cam = camera("SH10c", f0, f1, cp, [(f0, cpt.lerp(hp, 0.3), 30), (f1, cpt.lerp(hp, 0.15), 38)], shake=0.1)
        shot("SH10c", f0, f1, cam, mode="thermal", note="thermal hand on metal")
        ik_key(rig, "r", f1 + 1, 0.0)

    # ---------------------------------------------------------- SH11 numb fingers / phone / no signal
    f0, f1 = F(40.2) + 1, F(42.5)
    if want("SH11a"):
        begin(f0, f1)
        cold_state(f0, 2); state(f0, cold_hands=0.6)
        mocap(rig, "79_80", 160, 700, f0, face_deg=180, pos=(-0.2, -2.2), speed=0.9, root_motion=False)
        phone_setup(rig, f0 + 20, f0); phone_hold(f0, 1.0)
        A.hand_pose(a(), "r", [(f0, "flat", 1.0), (f0 + 20, "claw", 0.4), (f0 + 30, "flat", 1.0), (f1, "flat", 1.0)])
        A.hand_pose(a(), "l", [(f0, "claw", 0.8), (f0 + 25, "flat", 0.5), (f1, "claw", 0.8)])
        A.layer(a(), "hand_r", f0, f1, [(f0, (0, 0, 0), 1), (f0 + 18, (-25, 10, 15), 1), (f0 + 26, (10, -5, -5), 1), (f0 + 40, (-8, 0, 4), 1), (f1, (0, 0, 0), 1)])
        A.shiver(a(), f0, f1, [(f0, 1.4), (f1, 1.4)], seed=14)
        cp, hp = orbit(rig, (f0 + f1) // 2, "spine_03", 0.95, az=10, el=24, up=-0.2)
        # follow the phone in his hand (aiming between both hands framed the bib with the phone at the edge)
        ph_ = bpy.data.objects["Phone"]
        pk = follow_object(ph_, f0, f1, step=4)
        sm = [(f, tuple(p), 40 + 6 * i / max(1, len(pk) - 1)) for i, (f, p) in enumerate(pk)]
        cam = camera("SH11a", f0, f1, cp, sm, shake=0.25, fstop=4.0, focus=0.9)
        key_focus_on(cam, ph_, f0, f1)
        shot("SH11a", f0, f1, cam, dynamic=PUFFS + ["Phone", "PhoneScreen"], note="fumbling phone")
    f0, f1 = F(42.5) + 1, F(45.1)
    if want("SH11b"):
        begin(f0, f1)
        cold_state(f0, 2)
        mocap(rig, "79_80", 300, 800, f0, face_deg=180, pos=(-0.2, -2.2), speed=0.9, root_motion=False)
        phone_setup(rig, f0 + 5, f0); phone_hold(f0, 1.0)
        A.hand_pose(a(), "r", [(f0, "flat", 1.0), (f1, "flat", 1.0)])
        A.shiver(a(), f0, f1, [(f0, 1.2), (f1, 1.2)], seed=15)
        exh = A.breathe(a(), f0, f1, [(f0, 1.2)], depth_deg=1.6); puffs(rig, exh, 0.9, dur=40)
        fm = (f0 + f1) // 2
        hp = bpos(rig, "head", fm, "mid"); fw = facing(rig, fm)
        sc.frame_set(fm); bpy.context.view_layer.update()
        ph_p = bpy.data.objects["Phone"].matrix_world.to_translation().copy()
        eye = hp + fw * 0.21 + Vector((0, 0, -0.03))
        print("PHONE", ph_p, "EYE", eye)
        cam = camera("SH11b", f0, f1, tuple(eye), [(f0, ph_p, 34), (f1, ph_p + Vector((0, 0, 0.01)), 40)], shake=0.3, shake_freq=0.8, fstop=2.8,
                     focus=(eye - ph_p).length)
        shot("SH11b", f0, f1, cam, dynamic=PUFFS + ["Phone", "PhoneScreen"], note="no signal OTS")
    phone_hold(F(45.1) + 1, 0.0)

    # ---------------------------------------------------------- SH12 he remembers the emergency release
    f0, f1 = F(45.1) + 1, F(46.3)
    if want("SH12a"):
        begin(f0, f1)
        cold_state(f0, 2)
        mocap(rig, "79_68", 700, 1100, f0, face_deg=180, pos=(-0.2, -2.6), speed=0.5, root_motion=False)
        A.layer(a(), "neck_01", f0, f1, [(f0, (-18, 0, 0), 1), (f1, (-18, 0, 0), 1)])
        A.layer(a(), "head", f0, f1, [(f0, (-26, 0, 0), 1), (f0 + 10, (-22, 0, 0), 1), (f1, (-24, 0, -22), 1)])
        A.shiver(a(), f0, f1, [(f0, 1.2), (f1, 0.8)], seed=16)
        leo_face(f0, f1, {"browInnerUp": 0.5}, keys=[(f0 + 6, {"eyeWideLeft": 0.8, "eyeWideRight": 0.8, "browOuterUpLeft": 0.6, "browOuterUpRight": 0.6, "jawOpen": 0.15}),
                                                     (f1, {"eyeLookOutRight": 0.6, "eyeLookInLeft": 0.6})], blink_s=0)
        # aim just below the eyes so they sit in the upper part of the frame, clear of the captions
        fm = (f0 + f1) // 2
        mouth, _ = mouth_world(rig, fm)
        eyes = lambda f: mouth_world(rig, f)[0] + (bpos(rig, "head", f, "mid") - mouth_world(rig, f)[0]) * 0.55
        cp, _ = orbit(rig, fm, "head", 0.78, az=6, el=-10, where="mid")
        cam = camera("SH12a", f0, f1, cp, [(f0, eyes(f0) + Vector((0, 0, -0.035)), 50), (f1, eyes(f1) + Vector((0, 0, -0.035)), 54)], shake=0.15, fstop=2.8,
                     focus=(eyes(fm) - Vector(cp)).length)
        shot("SH12a", f0, f1, cam, dynamic=PUFFS, note="realisation CU")
    f0, f1 = F(46.3) + 1, F(49.5)
    if want("SH12b"):
        begin(f0, f1)
        cold_state(f0, 2); park(rig, f0)
        rel = Vector((0.44, -4.40, 1.08))
        cam = camera("SH12b", f0, f1, (0.1, -3.5, 1.3), [(f0, rel + Vector((0, 0, 0.04)), 30), (f1, rel + Vector((-0.025, 0, 0.01)), 62)], shake=0.12, fstop=2.0)
        shot("SH12b", f0, f1, cam, chars=(), note="push-in on iced release")

    # ---------------------------------------------------------- SH13 hand pushes the iced release - nothing
    f0, f1 = F(49.5) + 1, F(51.5)
    if want("SH13"):
        begin(f0, f1)
        cold_state(f0, 2)
        mocap(rig, "80_41", 300, 700, f0, face_deg=0, pos=(0.56, -4.0), speed=0.6, root_motion=False)
        rel = Vector((0.415, -4.335, 1.05))  # contact point: slightly right of the cap so the hand lands centrally
        ik_block(rig, "r", f0, f1)
        # wrist targets: flat hand ~0.17 m long, so the fingertips/palm meet the ice face when pushing;
        # then a fist bang (knuckles ~0.09 m past the wrist)
        cx, cz = -0.11, 0.10   # measured: the hand hangs below the wrist line and lands to one side
        ik_key(rig, "r", f0, 1.0, tuple(rel + Vector((cx + 0.02, 0.18, cz + 0.03))))
        for k, ff in enumerate([f0 + 8, f0 + 16, f0 + 24, f0 + 32]):
            ik_key(rig, "r", ff, 1.0, tuple(rel + Vector((cx, 0.125 if k % 2 == 0 else 0.15, cz))))   # fingertips on the ice face / just off it
        ik_key(rig, "r", f0 + 40, 1.0, tuple(rel + Vector((0.0, 0.2, 0.07)))); ik_key(rig, "r", f0 + 46, 1.0, tuple(rel + Vector((0, 0.035, 0.02))))
        ik_key(rig, "r", f1, 1.0, tuple(rel + Vector((0, 0.09, 0.03))))
        A.layer(a(), "hand_r", f0, f1, [(f0, (0, 0, 0), 0.7), (f1, (0, 0, 0), 0.7)], mode="replace")
        A.hand_pose(a(), "r", [(f0, "flat", 1.0), (f0 + 34, "flat", 1.0), (f0 + 40, "fist", 1.0), (f1, "fist", 1.0)])
        A.shiver(a(), f0, f1, [(f0, 1.0), (f1, 1.0)], seed=17)
        cam = camera("SH13", f0, f1, (0.0, -3.9, 1.3), [(f0, rel + Vector((0.03, 0.04, 0.0)), 26), (f1, rel + Vector((0.03, 0.04, 0.0)), 30)], shake=0.35, shake_freq=0.9, fstop=4.0, focus=0.68)
        shot("SH13", f0, f1, cam, dynamic=PUFFS, note="hand on iced release")
        ik_key(rig, "r", f1 + 1, 0.0)

    # ---------------------------------------------------------- SH14 hurry - slip on the frosted floor
    f0, f1 = F(51.5) + 1, F(55.4)
    if want("SH14"):
        begin(f0, f1)
        cold_state(f0, 2)
        slip_src = 345
        fs = f0 + int((slip_src - 150) / 4)
        place(rig, "90_17", 150, 700, f0, fs, (0.35, 0.25), path_deg=180, path_end=330)
        A.shiver(a(), f0, fs - 10, [(f0, 0.6), (fs - 10, 0.6)], seed=18)
        leo_face(f0, f1, {"browDownLeft": 0.4, "browDownRight": 0.4, "jawOpen": 0.1},
                 keys=[(fs, {"eyeWideLeft": 0.9, "eyeWideRight": 0.9, "jawOpen": 0.35, "browInnerUp": 0.8}),
                       (fs + 22, {"eyeSquintLeft": 0.9, "eyeSquintRight": 0.9, "jawOpen": 0.2, "mouthStretchLeft": 0.7, "mouthStretchRight": 0.7})], blink_s=0)
        cam = camera("SH14", f0, f1, (-1.25, 2.15, 1.25), track(rig, "spine_02", f0, f1, 8, 24, off=(0, 0, -0.05), lens1=22), shake=0.3)
        shot("SH14", f0, f1, cam, dynamic=PUFFS, note="slip and fall")

    # ---------------------------------------------------------- SH15 time-lapse: hours can pass / below 35 = hypothermia
    f0, f1 = F(55.4) + 1, F(62.2)
    if want("SH15"):
        begin(f0, f1)
        cold_state(f0, 2); ramp("frost", f0, 0.36, f1, 0.6)
        fa, fb_, fc = f0, f0 + 58, f0 + 122
        place(rig, "111_06", 1090, 1500, fa, fa, (0.6, 1.1), face_deg=180)
        place(rig, "91_14", 420, 900, fb_, fb_, (0.1, -0.6), path_deg=0, path_end=700)
        mocap(rig, "80_42", 250, 1000, fc, face_deg=90, pos=(-1.72, -0.9), speed=0.8, root_motion=False)
        ground_feet(rig, fa, fb_ - 1)   # the get-up take floated ~0.85 m above the floor
        A.shiver(a(), fa, f1, [(fa, 1.0), (f1, 2.0)], seed=19)
        GRIP(a(), fc, f1)
        exh = A.breathe(a(), fc, f1, [(fc, 1.2)], depth_deg=1.8); puffs(rig, exh, 0.9, dur=40)
        cam = camera("SH15", f0, f1, (2.5, -4.2, 3.2), [(f0, (-0.3, 0.4, 0.4), 17), (f1, (-0.4, 0.2, 0.5), 19)], shake=0.0)
        shot("SH15", f0, f1, cam, dynamic=PUFFS, note="time-lapse, jump cuts", plate_variants=[{"frost": 0.36}, {"frost": 0.48}, {"frost": 0.6}])

    # ---------------------------------------------------------- SH16 mild hypothermia: violent shivering, fumbling, slurring, staggering
    f0, f1 = F(62.2) + 1, F(65.1)
    if want("SH16a"):
        begin(f0, f1)
        cold_state(f0, 3)
        mocap(rig, "80_42", 300, 1000, f0, face_deg=180, pos=(-0.4, -1.4), speed=0.8, root_motion=False)
        A.shiver(a(), f0, f1, [(f0, 3.8), (f1, 4.5)], seed=20)
        GRIP(a(), f0, f1)
        exh = A.breathe(a(), f0, f1, [(f0, 0.9)], depth_deg=2.4); puffs(rig, exh, 1.0, dur=40)
        leo_face(f0, f1, {"browInnerUp": 0.7, "eyeSquintLeft": 0.5, "eyeSquintRight": 0.5, "mouthStretchLeft": 0.4, "mouthStretchRight": 0.4},
                 blink_s=1.8, chatter_amp=[(f0, 1.0), (f1, 1.0)])
        cp, hp = orbit(rig, (f0 + f1) // 2, "neck_01", 1.15, az=-12, el=0)
        cam = camera("SH16a", f0, f1, cp, [(f0, hp + Vector((0, 0, 0.03)), 42), (f1, hp + Vector((0, 0, 0.05)), 46)], shake=0.6, shake_freq=1.1, fstop=2.8)
        shot("SH16a", f0, f1, cam, dynamic=PUFFS, note="violent shivering")
    f0, f1 = F(65.1) + 1, F(66.3)
    if want("SH16b"):
        begin(f0, f1)
        cold_state(f0, 3)
        mocap(rig, "79_80", 200, 600, f0, face_deg=180, pos=(-0.4, -1.4), speed=0.8, root_motion=False)
        phone_setup(rig, f0 + 2, f0); phone_hold(f0, 1.0)
        A.layer(a(), "hand_r", f0, f1, [(f0, (0, 0, 0), 1), (f0 + 10, (-20, 15, 20), 1), (f0 + 16, (25, -10, -10), 1), (f1, (10, 0, 0), 1)])
        A.hand_pose(a(), "r", [(f0, "grip", 1.0), (f0 + 14, "claw", 0.6), (f0 + 18, "flat", 0.6), (f1, "claw", 0.8)])
        A.shiver(a(), f0, f1, [(f0, 3.5), (f1, 3.5)], seed=21)
        phone_drop(f0 + 17)
        cp, hp = orbit(rig, f0 + 10, "hand_r", 1.25, az=28, el=-4)
        ph_ = bpy.data.objects["Phone"]
        def ppos(f):
            sc.frame_set(f); return ph_.matrix_world.to_translation()
        pk = []
        for ff in list(range(f0, f1, 3)) + [f1]:
            pk.append((ff, ppos(ff) * 0.55 + bpos(rig, "hand_r", ff) * 0.45))
        pk = [(f, sum((pk[j][1] for j in range(max(0, i - 1), min(len(pk), i + 2))), Vector()) / len(pk[max(0, i - 1):i + 2])) for i, (f, _) in enumerate(pk)]
        cam = camera("SH16b", f0, f1, cp, [(f, tuple(p), 30) for f, p in pk], shake=0.3, fstop=4.0, focus_track=(rig, "hand_r", "head"))
        shot("SH16b", f0, f1, cam, dynamic=PUFFS + ["Phone", "PhoneScreen"], note="phone drops")
    f0, f1 = F(66.3) + 1, F(67.4)
    if want("SH16c"):
        begin(f0, f1)
        cold_state(f0, 3)
        mocap(rig, "80_42", 400, 700, f0, face_deg=180, pos=(-0.4, -1.4), speed=0.6, root_motion=False)
        A.shiver(a(), f0, f1, [(f0, 3.0), (f1, 3.0)], seed=22)
        body_ = leo_body(); A.face_action(body_)
        rnd = random.Random(4)
        for k, ff in enumerate(range(f0, f1 + 1, 4)):
            A.face_keys(body_, ff, {"jawOpen": rnd.uniform(0.02, 0.22), "mouthFunnel": rnd.uniform(0, 0.4), "mouthPucker": rnd.uniform(0, 0.3),
                                    "mouthRollLower": rnd.uniform(0, 0.3), "eyeBlinkLeft": 0.35, "eyeBlinkRight": 0.4, "browInnerUp": 0.4,
                                    "mouthLeft": rnd.uniform(0, 0.2)})
        fm = (f0 + f1) // 2
        mouth, fwd = mouth_world(rig, fm)
        fw = facing(rig, fm); left = Vector((0, 0, 1)).cross(fw)
        cp = mouth + (fw * math.cos(math.radians(18)) + left * math.sin(math.radians(18))) * 0.5 + Vector((0, 0, 0.03))
        cam = camera("SH16c", f0, f1, tuple(cp), [(f0, mouth + Vector((0, 0, 0.02)), 50), (f1, mouth + Vector((0, 0, 0.02)), 54)], shake=0.25, fstop=2.8, focus=0.5)
        shot("SH16c", f0, f1, cam, dynamic=PUFFS, note="slurred speech CU")
    f0, f1 = F(67.4) + 1, F(69.3)
    if want("SH16d"):
        begin(f0, f1)
        cold_state(f0, 3)
        place(rig, "91_09", 900, 1300, f0, f0, (0.0, 0.4), path_deg=0, path_end=1120)
        ground_feet(rig, f0, f1)
        A.hand_pose(a(), "l", [(f0, "claw", 0.8), (f1, "claw", 0.8)]); A.hand_pose(a(), "r", [(f0, "claw", 0.8), (f1, "claw", 0.8)])
        A.shiver(a(), f0, f1, [(f0, 2.5), (f1, 2.5)], seed=23)
        leo_face(f0, f1, {"eyeBlinkLeft": 0.3, "eyeBlinkRight": 0.35, "browInnerUp": 0.3, "jawOpen": 0.08}, blink_s=1.5)
        cam = camera("SH16d", f0, f1, (1.2, -2.6, 1.3), track(rig, "spine_01", f0, f1, 10, 25), shake=0.5, roll_keys=[(f0, 10), (f1, 16)])
        shot("SH16d", f0, f1, cam, dynamic=PUFFS, note="stagger, judgement slipping")

    # ---------------------------------------------------------- SH17 best move: off the metal floor, onto cardboard, curl up
    seat = Vector((-1.92, -2.0))
    f0, f1 = F(69.3) + 1, F(72.9)
    if want("SH17a"):
        begin(f0, f1)
        cold_state(f0, 3); state(f0, thermal_temp=0.93, thermal_hands=0.3)
        place(rig, "82_05", 300, 900, f0, f0, (-0.9, -0.7), face_deg=90)
        ground_feet(rig, f0, f1)   # the floor-sitting take floated ~0.8 m up
        tuck_arms(rig, f0, f1)
        A.hand_pose(a(), "l", [(f0, "tucked", 1.0), (f1, "tucked", 1.0)]); A.hand_pose(a(), "r", [(f0, "tucked", 1.0), (f1, "tucked", 1.0)])
        A.shiver(a(), f0, f1, [(f0, 2.0), (f1, 2.0)], seed=24)
        pv = bpos(rig, "pelvis", (f0 + f1) // 2)
        hs = bpy.data.objects["HeatSpot_1"]; hs.location = (pv.x, pv.y, 0.0); hs.scale = (0.45, 0.45, 0.45)
        ramp("heat1", f0 + 5, 0.15, f1, 0.75)
        cp, hp = orbit(rig, f0 + 30, "spine_02", 2.6, az=35, el=24)
        left_ = Vector((0, 0, 1)).cross(facing(rig, f0 + 30))
        cam = camera("SH17a", f0, f1, cp, [(f0, hp + Vector((0, 0, -0.25)) - left_ * 0.25, 28), (f1, hp + Vector((0, 0, -0.25)) - left_ * 0.25, 30)], shake=0.08)
        shot("SH17a", f0, f1, cam, mode="thermal", dynamic=PUFFS, note="thermal: floor steals heat")
    # seat dressing (in the plates from here on)
    sit_f = F(72.9) + 30
    if want("SH17b") or want("SH17c") or want("SH18") or want("SH18c") or want("SH20") or want("SH21") or want("SH22"):
        if "Seat_Box_0" not in bpy.data.objects:
            seat_at((seat.x, seat.y), 0.46)
    f0, f1 = F(72.9) + 1, F(74.8)
    if want("SH17b"):
        begin(f0, f1)
        cold_state(f0, 3)
        mocap(rig, "80_42", 400, 600, f0, face_deg=90, pos=(seat.x + 0.35, seat.y), speed=0.8, root_motion=False)
        place(rig, "22_03", 60, 800, f0 + 26, f0 + 26, (seat.x + 0.08, seat.y), face_deg=90)
        A.transition(a(), A.ALL_BODY, f0 + 8, f0 + 26)
        sit_on(rig, f0, f1, 0.46, start=f0 + 8, seated=f0 + 26)
        A.shiver(a(), f0, f1, [(f0, 2.5), (f1, 2.5)], seed=25)
        GRIP(a(), f0, f1)
        tuck_arms(rig, f0 + 22, f1, ramp_in=18)  # wraps his arms round himself as he sits (continuity into SH17c)
        cp, hp = orbit(rig, f0 + 30, "spine_02", 2.4, az=40, el=8)
        cam = camera("SH17b", f0, f1, cp, track(rig, "spine_03", f0, f1, 10, 29, off=(0, 0, 0.12)), shake=0.2)
        shot("SH17b", f0, f1, cam, dynamic=PUFFS, note="sits on cardboard")
    f0, f1 = F(74.8) + 1, F(77.4)
    if want("SH17c"):
        begin(f0, f1)
        cold_state(f0, 3)
        place(rig, "22_03", 150, 900, f0, f0, (seat.x + 0.08, seat.y), face_deg=90)
        mocap(rig, "80_41", 260, 900, f0, face_deg=90, speed=0.8, bones=ARMS, root_motion=False)
        A.layer(a(), "spine_02", f0, f1, [(f0, (0, 0, 0), 0), (f0 + 30, (14, 0, 0), 1), (f1, (18, 0, 0), 1)])
        A.layer(a(), "neck_01", f0, f1, [(f0, (0, 0, 0), 0), (f0 + 30, (10, 0, 0), 1), (f1, (14, 0, 0), 1)])
        sit_on(rig, f0, f1, 0.46)
        tuck_arms(rig, f0, f1, reach=0.38, fwd=(0.11, 0.08))
        A.hand_pose(a(), "l", [(f0, "grip", 1.0), (f0 + 25, "tucked", 1.0), (f1, "tucked", 1.0)])
        A.hand_pose(a(), "r", [(f0, "grip", 1.0), (f0 + 25, "tucked", 1.0), (f1, "tucked", 1.0)])
        A.shiver(a(), f0, f1, [(f0, 2.8), (f1, 3.0)], seed=26)
        exh = A.breathe(a(), f0, f1, [(f0, 1.0)], depth_deg=2.0); puffs(rig, exh, 0.9, dur=40)
        leo_face(f0, f1, {"browInnerUp": 0.6, "eyeSquintLeft": 0.6, "eyeSquintRight": 0.6, "mouthPressLeft": 0.5, "mouthPressRight": 0.5}, blink_s=2.0)
        cp, hp = orbit(rig, f0 + 30, "spine_02", 2.2, az=20, el=48)
        cam = camera("SH17c", f0, f1, cp, [(f0, hp + Vector((0, 0, -0.1)), 30), (f1, hp + Vector((0, 0, -0.1)), 34)], shake=0.12)
        shot("SH17c", f0, f1, cam, dynamic=PUFFS, note="curled up high angle")

    # ---------------------------------------------------------- SH18 nearing 32: shivering stops
    f0, f1 = F(77.4) + 1, F(84.0)
    stop = F(81.95)
    if want("SH18"):
        begin(f0, f1)
        cold_state(f0, 4)
        place(rig, "22_03", 200, 1000, f0, f0, (seat.x + 0.08, seat.y), face_deg=90, speed=0.7)
        mocap(rig, "80_41", 300, 1000, f0, face_deg=90, speed=0.6, bones=ARMS, root_motion=False)
        A.layer(a(), "spine_02", f0, f1, [(f0, (16, 0, 0), 1), (f1, (20, 0, 0), 1)])
        A.layer(a(), "neck_01", f0, f1, [(f0, (-14, 0, 0), 1), (f1, (-10, 0, 0), 1)])
        A.layer(a(), "head", f0, f1, [(f0, (-24, 0, 0), 1), (stop, (-24, 0, 0), 1), (f1, (-8, 0, 6), 1)])
        sit_on(rig, f0, f1, 0.46)
        tuck_arms(rig, f0, f1)
        A.hand_pose(a(), "l", [(f0, "tucked", 1.0), (f1, "tucked", 1.0)]); A.hand_pose(a(), "r", [(f0, "tucked", 1.0), (f1, "tucked", 1.0)])
        A.shiver(a(), f0, f1, [(f0, 3.8), (F(80.8), 4.2), (F(81.6), 1.5), (stop + 4, 0.12), (f1, 0.05)], seed=27)
        exh = A.breathe(a(), f0, f1, [(f0, 0.9), (stop, 1.0), (stop + 20, 2.0), (f1, 2.4)], depth_deg=2.0); puffs(rig, exh, 0.8, dur=50)
        leo_face(f0, f1, {"browInnerUp": 0.6, "eyeSquintLeft": 0.5, "eyeSquintRight": 0.5},
                 keys=[(stop, {"browInnerUp": 0.6}), (stop + 15, {"browInnerUp": 0.1, "eyeSquintLeft": 0.0, "eyeSquintRight": 0.0, "eyeBlinkLeft": 0.35, "eyeBlinkRight": 0.4,
                                                                  "mouthPressLeft": 0.0, "mouthPressRight": 0.0, "jawOpen": 0.06}),
                       (f1, {"eyeBlinkLeft": 0.5, "eyeBlinkRight": 0.55, "jawOpen": 0.08})],
                 blink_s=2.5, chatter_amp=[(f0, 1.0), (F(80.8), 1.0), (F(81.6), 0.35), (stop + 2, 0.0), (f1, 0.0)])
        # the camera follows his face (a fixed aim at 0.95 m let the sway and the final head lift carry it
        # out of frame); slow push-in towards the moment the shivering stops
        cp, _ = orbit(rig, stop, "head", 1.4, az=10, el=-10, where="mid")
        keys = track(rig, "head", f0, f1, 10, 38, off=(0, 0, -0.09), where="mid")
        lens_at = lambda f: 38 + 4 * A.smooth(min(1, (f - f0) / (stop - f0))) + 8 * A.smooth(max(0, (f - stop) / (f1 - stop)))
        keys = [(f, tg, lens_at(f)) for f, tg, _ in keys]
        cam = camera("SH18", f0, f1, cp, keys, shake=0.25, shake_freq=0.7, fstop=2.4)
        shot("SH18", f0, f1, cam, dynamic=PUFFS, note="shivering stops")
    f0, f1 = F(84.0) + 1, F(86.9)
    if want("SH18c"):
        begin(f0, f1)
        cold_state(f0, 4); ramp("thermal_temp", f0, 0.9, f1, 0.74); state(f0, thermal_hands=0.15)
        place(rig, "22_03", 300, 900, f0, f0, (seat.x + 0.08, seat.y), face_deg=90, speed=0.5)
        mocap(rig, "80_41", 400, 900, f0, face_deg=90, speed=0.5, bones=ARMS, root_motion=False)
        A.layer(a(), "spine_02", f0, f1, [(f0, (18, 0, 0), 1), (f1, (22, 0, 0), 1)])
        sit_on(rig, f0, f1, 0.46)
        tuck_arms(rig, f0, f1)
        A.hand_pose(a(), "l", [(f0, "tucked", 1.0), (f1, "tucked", 1.0)]); A.hand_pose(a(), "r", [(f0, "tucked", 1.0), (f1, "tucked", 1.0)])
        exh = A.breathe(a(), f0, f1, [(f0, 2.4)], depth_deg=1.5); puffs(rig, exh, 0.7, dur=50)
        cp, hp = orbit(rig, f0, "spine_02", 2.3, az=25, el=12)
        hp = hp + Vector((0, 0, 0.12))  # keep his head clear of the CORE HUD
        cam = camera("SH18c", f0, f1, cp, [(f0, hp, 30), (f1, hp, 34)], shake=0.06)
        shot("SH18c", f0, f1, cam, mode="thermal", dynamic=PUFFS, note="thermal: body dimming")

    # ---------------------------------------------------------- SH19 confusion & drowsiness (POV)
    f0, f1 = F(86.9) + 1, F(91.7)
    if want("SH19"):
        begin(f0, f1)
        cold_state(f0, 4); park(rig, f0)
        eye = Vector((seat.x + 0.2, seat.y, 1.12))
        cam = camera("SH19", f0, f1, tuple(eye), [(f0, (0.3, -4.4, 1.1), 24), (f0 + 55, (0.9, -3.0, 0.2), 26), (f0 + 100, (0.6, -4.2, 0.9), 30), (f1, (0.35, -4.4, 1.0), 34)],
                     shake=0.6, shake_freq=0.35, roll_keys=[(f0, 0), (f0 + 70, -9), (f1, 6)], fstop=1.8, focus=3.5)
        shot("SH19", f0, f1, cam, chars=(), note="POV double vision, blinks")

    # ---------------------------------------------------------- SH20 below ~28: unconscious, heart rhythm unstable
    f0, f1 = F(91.7) + 1, F(99.2)
    if want("SH20"):
        begin(f0, f1)
        cold_state(f0, 5)
        place(rig, "22_03", 300, 1000, f0, f0, (seat.x + 0.08, seat.y), face_deg=90, speed=0.3)
        mocap(rig, "80_41", 400, 900, f0, face_deg=90, speed=0.4, bones=ARMS, root_motion=False)
        sl0, sl1 = F(93.6), F(95.2)
        A.layer(a(), "spine_01", f0, f1, [(f0, (0, 0, 0), 0), (sl0, (0, 0, 0), 0), (sl1, (6, 0, 6), 1), (f1, (7, 0, 7), 1)])
        A.layer(a(), "spine_02", f0, f1, [(f0, (18, 0, 0), 1), (sl0, (18, 0, 0), 1), (sl1, (22, 0, 8), 1), (f1, (24, 0, 9), 1)])
        A.layer(a(), "neck_01", f0, f1, [(f0, (0, 0, 0), 0), (sl0, (0, 0, 0), 0), (sl1 - 10, (24, 0, 4), 1), (f1, (26, 0, 5), 1)])
        A.layer(a(), "head", f0, f1, [(f0, (0, 0, 0), 0), (sl0 + 5, (0, 0, 0), 0), (sl1, (16, 0, 8), 1), (f1, (18, 0, 9), 1)])
        for side, sg in (("l", 1), ("r", -1)):  # limp before the IK hold lets go, so the hands drop instead of rising to his face
            A.layer(a(), f"upperarm_{side}", f0, f1, [(f0, (0, 0, 0), 0), (sl0 - 6, (0, 0, 0), 0), (sl0 + 4, (0, 0, 0), 0.85), (f1, (0, 0, 0), 0.85)], mode="replace")
            A.layer(a(), f"lowerarm_{side}", f0, f1, [(f0, (0, 0, 0), 0), (sl0 - 6, (0, 0, 0), 0), (sl0 + 4, (0, 0, 20), 0.75), (f1, (0, 0, 20), 0.75)], mode="replace")
        sit_on(rig, f0, f1, 0.46)
        tuck_arms(rig, f0, f1, release=(sl0, sl1 - 8))
        A.hand_pose(a(), "l", [(f0, "tucked", 1.0), (sl1, "relaxed", 1.0), (f1, "relaxed", 1.0)]); A.hand_pose(a(), "r", [(f0, "tucked", 1.0), (sl1, "relaxed", 1.0), (f1, "relaxed", 1.0)])
        exh = A.breathe(a(), f0, f1, [(f0, 2.6), (f1, 3.6)], depth_deg=0.9); puffs(rig, exh, 0.45, dur=55)
        leo_face(f0, f1, {"eyeBlinkLeft": 0.6, "eyeBlinkRight": 0.65, "jawOpen": 0.06},
                 keys=[(sl0, {"eyeBlinkLeft": 0.7, "eyeBlinkRight": 0.75}), (sl1, {"eyeBlinkLeft": 1.0, "eyeBlinkRight": 1.0, "jawOpen": 0.1})], blink_s=0)
        # low front-side angle that follows his head down as he slumps, then eases back (the old high-angle
        # pull-back started too tight and lost his head off the frame edge for the first seconds)
        cp, _ = orbit(rig, f0, "head", 1.6, az=25, el=-12, where="mid")
        keys = track(rig, "head", f0, f1, 10, 32, off=(0, 0, -0.08), where="mid", lens1=24)
        cam = camera("SH20", f0, f1, cp, keys, shake=0.05)
        shot("SH20", f0, f1, cam, dynamic=PUFFS, note="slump, ECG overlay")
    slump_end = F(99.2)

    # ---------------------------------------------------------- SH21 so... could you survive? - the door opens
    f0, f1 = F(99.2) + 1, F(101.0)
    if want("SH21"):
        begin(f0, f1)
        cold_state(f0, 5)
        door(f0, 0.0, "CONSTANT"); door(f0 + 14, 0.0); door(f1 - 4, -92.0); door(f1 + 200, -95.0)
        dock_light(f0 + 14, 0.0); dock_light(f1 - 2, 900.0)
        A.hold(a(), A.ALL_BODY + ["Root"], slump_end, f0, f1) if False else None
        A.hold(a(), A.ALL_BODY, slump_end, f0, f1)
        for sd in ("lr" if "IKF_foot_l" in bpy.data.objects else ""):  # legs: keep SH20's planted feet through the hold
            e = bpy.data.objects[f"IKF_foot_{sd}"]; sc.frame_set(slump_end); p_ = e.location.copy()
            c = rig.pose.bones[f"calf_{sd}"].constraints["IKleg"]
            for ff in (f0, f1):
                e.location = p_; e.keyframe_insert("location", frame=ff); c.influence = 1.0; c.keyframe_insert("influence", frame=ff)
            c.influence = 0.0; c.keyframe_insert("influence", frame=f1 + 1)
        fm_in = f1 - 19   # the door has swung past her path by now
        place(my, "07_04", 40, 600, fm_in, f1, (0.12, -4.42), path_deg=180, path_end=300)
        park(my, f0); park(my, fm_in - 1)
        for fc in act(my).fcurves:  # no in-between from the parked spot to the doorway
            for k in fc.keyframe_points:
                if fm_in - 2 <= k.co[0] <= fm_in - 1: k.interpolation = "CONSTANT"
        cam = camera("SH21", f0, f1, (-1.05, -1.75, 0.32), [(f0, (0.05, -4.5, 1.0), 22), (f1, (0.05, -4.5, 1.08), 24)], shake=0.08)
        shot("SH21", f0, f1, cam, dynamic=PUFFS + DOOR_PARTS, chars=("Leo", "Maya"), note="door opens, light floods in, Maya in the doorway",
             plate_variants=[{"door": 0, "dock": 0}, {"door": -92, "dock": 900}])

    # ---------------------------------------------------------- SH22 rescue
    f0, f1 = F(101.0) + 1, F(107.8)
    if want("SH22"):
        begin(f0, f1)
        cold_state(f0, 5); door(f0, -95.0, "CONSTANT"); dock_light(f0, 900.0, "CONSTANT")
        canon = A.canon_angle(BVH.format("22_03"))
        mocap_pair(rig, "22_03", my, "23_03", 30, 560, f0, face_deg=90, pos=(seat.x + 0.08, seat.y), speed=0.65)
        # Leo stays where SH20 left him: unconscious, slumped on the boxes (severe hypothermia: no sitting up)
        hold_slump(rig, slump_end, f0, f1)
        # Maya stays bent over him with her hands on his arm and shoulder. (The kneel-and-hug take ended with
        # her head in his lap: his seat is much higher than the original actor's.)
        mact = act(my)
        A.hold(mact, A.ALL_BODY, f0 + 4, f0, f1)
        A.layer(mact, "spine_03", f0, f1, [(f0, (0, 0, 0), 1), (f0 + 50, (5, 0, 0), 1), (f1, (7, 0, -3), 1)])
        A.layer(mact, "head", f0, f1, [(f0, (0, 0, 0), 1), (f0 + 45, (8, 0, 5), 1), (f0 + 120, (12, 0, -3), 1), (f1, (9, 0, 4), 1)])
        A.breathe(mact, f0, f1, [(f0, 1.5)], depth_deg=1.5)
        hands_on(my, rig, f0, f1)
        exh = A.breathe(a(), f0, f1, [(f0, 4.0)], depth_deg=0.6); puffs(rig, exh, 0.35, dur=55)   # slow, shallow breaths
        leo_face(f0, f1, {"eyeBlinkLeft": 1.0, "eyeBlinkRight": 1.0, "jawOpen": 0.08}, blink_s=0)
        # aim between the two of them (the old aim left Maya cut off at the frame edge)
        mid = lambda f: (bpos(rig, "head", f) + bpos(rig, "pelvis", f) + bpos(my, "head", f) + bpos(my, "pelvis", f)) / 4
        cam = camera("SH22", f0, f1, (0.9, -0.6, 1.2), [(f0, mid(f0 + 40) + Vector((0.0, 0.0, 0.05)), 24), (f1, mid(f1 - 20) + Vector((0.0, 0.0, 0.05)), 27)], shake=0.2)
        shot("SH22", f0, f1, cam, dynamic=PUFFS + DOOR_PARTS, chars=("Leo", "Maya"), note="rescue")

    # ---------------------------------------------------------- SH23 factors: walking out to the warm dock
    f0, f1 = F(107.8) + 1, F(114.9)
    if want("SH23"):
        begin(f0, f1)
        cold_state(f0, 4); door(f0, -95.0, "CONSTANT"); dock_light(f0, 900.0, "CONSTANT")
        # handled gently: he stays seated in the foil blanket while Maya keeps hold of him (guidance for severe
        # hypothermia is to move the casualty as little as possible); he begins to stir towards the end
        hold_slump(rig, slump_end, f0, f1)
        A.layer(a(), "head", f0, f1, [(f0, (0, 0, 0), 0), (f1 - 70, (0, 0, 0), 0), (f1, (-10, 0, -3), 1)])
        mact = act(my)
        A.hold(mact, A.ALL_BODY, F(107.8), f0, f1)
        A.layer(mact, "head", f0, f1, [(f0, (0, 0, 0), 1), (f0 + 60, (6, 0, -4), 1), (f0 + 140, (10, 0, 3), 1), (f1, (8, 0, 0), 1)])
        A.breathe(mact, f0, f1, [(f0, 1.5)], depth_deg=1.5)
        hands_on(my, rig, f0, f1, ramp=0)   # her hands stay on him across the cut from SH22
        exh = A.breathe(a(), f0, f1, [(f0, 3.6), (f1, 3.0)], depth_deg=0.7); puffs(rig, exh, 0.4, dur=55)
        leo_face(f0, f1, {"eyeBlinkLeft": 1.0, "eyeBlinkRight": 1.0, "jawOpen": 0.06},
                 keys=[(f1 - 60, {"eyeBlinkLeft": 1.0, "eyeBlinkRight": 1.0}), (f1 - 10, {"eyeBlinkLeft": 0.7, "eyeBlinkRight": 0.75, "browInnerUp": 0.3})], blink_s=0)
        fm = (f0 + f1) // 2
        mid = (bpos(rig, "head", fm) + bpos(rig, "pelvis", fm) + bpos(my, "head", fm) + bpos(my, "pelvis", fm)) / 4
        cam = camera("SH23", f0, f1, (-0.55, -3.8, 1.95), [(f0, mid + Vector((0, 0, 0.18)), 21), (f1, mid + Vector((0, 0, 0.16)), 24)], shake=0.15)
        shot("SH23", f0, f1, cam, dynamic=PUFFS + DOOR_PARTS, chars=("Leo", "Maya"), note="factors infographic")
    park(my, F(114.9) + 1)

    # ---------------------------------------------------------- SH24 outside: shivering again (the alarm) / empty freezer (quiet)
    f0, f1 = F(114.9) + 1, F(117.6)
    out_seat = Vector((0.95, -5.25))
    if want("SH24a"):
        begin(f0, f1)
        cold_state(f0, 4); state(f0, frost_hair=0.4)
        if "Dock_Seat" not in bpy.data.objects:
            lib = bpy.data.objects["LIB_wooden_crate_01"] if "LIB_wooden_crate_01" in bpy.data.objects else bpy.data.objects["LIB_plastic_crate_01"]
            ds = bpy.data.objects.new("Dock_Seat", bpy.data.objects["LIB_cardboard_box_01"].data); bpy.data.collections["ENV_Products"].objects.link(ds)
            ds.location = (out_seat.x - 0.05, out_seat.y, 0); ds.scale = (1.2, 1.1, 1.35); ds.rotation_euler = (0, 0, math.radians(90))
        place(rig, "22_03", 300, 1000, f0, f0, (out_seat.x, out_seat.y), face_deg=0, speed=0.7)
        mocap(rig, "80_41", 300, 900, f0, face_deg=0, speed=0.7, bones=ARMS, root_motion=False)
        sit_on(rig, f0, f1, 0.46)
        A.shiver(a(), f0, f1, [(f0, 2.4), (f1, 2.6)], seed=31)
        GRIP(a(), f0, f1, "tucked")
        leo_face(f0, f1, {"browInnerUp": 0.5, "eyeSquintLeft": 0.3, "eyeSquintRight": 0.3}, blink_s=2.2, chatter_amp=[(f0, 0.6), (f1, 0.6)])
        cp, hp = orbit(rig, (f0 + f1) // 2, "head", 1.2, az=-18, el=-3)
        cam = camera("SH24a", f0, f1, cp, [(f0, hp + Vector((0, 0, -0.18)), 36), (f1, hp + Vector((0, 0, -0.14)), 42)], shake=0.2, fstop=2.8)
        shot("SH24a", f0, f1, cam, dynamic=DOOR_PARTS, note="outside, shivering again")
    f0, f1 = F(117.6) + 1, F(120.6)
    if want("SH24b"):
        begin(f0, f1)
        cold_state(f0, 5); door(f0, -95.0, "CONSTANT"); park(rig, f0); park(my, f0)
        cam = camera("SH24b", f0, f1, (0.9, 1.6, 1.4), [(f0, (seat.x, seat.y, 0.5), 30), (f1, (seat.x, seat.y, 0.45), 45)], shake=0.05)
        shot("SH24b", f0, f1, cam, chars=(), note="empty freezer - the alarm goes quiet")

    # ---------------------------------------------------------- SH25 revived / warm and dead
    f0, f1 = F(120.6) + 1, F(124.6)
    if want("SH25a"):
        begin(f0, f1)
        cold_state(f0, 3); ramp("thermal_temp", f0, 0.74, f1, 0.87); ramp("thermal_hands", f0, 0.18, f1, 0.26)
        place(rig, "22_03", 300, 1000, f0, f0, (out_seat.x, out_seat.y), face_deg=0, speed=0.6)
        mocap(rig, "80_41", 300, 900, f0, face_deg=0, speed=0.6, bones=ARMS, root_motion=False)
        sit_on(rig, f0, f1, 0.46)
        tuck_arms(rig, f0, f1)
        A.hand_pose(a(), "l", [(f0, "tucked", 1.0), (f1, "tucked", 1.0)]); A.hand_pose(a(), "r", [(f0, "tucked", 1.0), (f1, "tucked", 1.0)])
        A.shiver(a(), f0, f1, [(f0, 2.0), (f1, 1.2)], seed=32)
        cp, hp = orbit(rig, f0, "spine_02", 1.45, az=-15, el=6)
        cam = camera("SH25a", f0, f1, cp, [(f0, hp, 30), (f1, hp, 33)], shake=0.08)
        shot("SH25a", f0, f1, cam, mode="thermal", note="thermal warming up")
    f0, f1 = F(124.6) + 1, F(131.5)
    if want("SH25b"):
        begin(f0, f1)
        cold_state(f0, 5); park(rig, f0); park(my, f0)
        door(f0, -95.0); door(f0 + 20, -90.0); door(F(128.4), 0.0); door(F(128.4) + 3, -1.2); door(F(128.4) + 6, 0.0, "CONSTANT")
        dock_light(f0 + 20, 900.0); dock_light(F(128.4), 0.0, "CONSTANT")
        cap_ = bpy.data.objects["Release_Cap"]; fcl = F(128.4)
        lens_ = lambda f: 30 + 16 * A.smooth(min(1, max(0, (f - (fcl - 45)) / 45))) + 6 * A.smooth(max(0, (f - fcl) / (f1 - fcl)))
        ck = [(f, tuple(p), lens_(f)) for f, p in follow_object(cap_, f0, f1, step=3, off=(0, 0, 0.01))]
        cam = camera("SH25b", f0, f1, (0.62, -3.55, 1.12), ck, shake=0.06, fstop=2.2, focus=0.88)
        key_focus_on(cam, cap_, f0, f1)
        shot("SH25b", f0, f1, cam, chars=(), dynamic=DOOR_PARTS, note="door closes on the iced release; end card",
             plate_variants=[{"door": -95, "dock": 900}, {"door": 0, "dock": 0}])

    A.ensure_slots(rig, body)
    sc["shots"] = json.dumps(SHOTS)
