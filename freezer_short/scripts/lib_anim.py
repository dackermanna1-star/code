"""Animation toolkit for the freezer short.

* retarget(): CMU motion capture (BVH, MotionBuilder-friendly release, frame 1 = T-pose)
  -> MPFB game_engine rig.  World-space rotation deltas relative to the T-pose frame are
  applied to a target reference pose whose limb directions are aligned to the T-pose,
  so the A-pose rest of the MakeHuman rig retargets cleanly.
* Layers on top of the baked mocap (all keyed per frame, so nothing is procedural at
  render time): additive/replace pose layers, finger poses, shiver, breathing, head aim.
* Face: ARKit shape-key keyframes, blinks, chattering jaw.
"""
import bpy, math, random
from mathutils import Vector, Matrix, Quaternion, Euler

MAP = {  # CMU -> game_engine
    "Hips": "pelvis", "LowerBack": "spine_01", "Spine": "spine_02", "Spine1": "spine_03",
    "Neck": "neck_01", "Head": "head",
    "LeftShoulder": "clavicle_l", "LeftArm": "upperarm_l", "LeftForeArm": "lowerarm_l", "LeftHand": "hand_l",
    "RightShoulder": "clavicle_r", "RightArm": "upperarm_r", "RightForeArm": "lowerarm_r", "RightHand": "hand_r",
    "LeftUpLeg": "thigh_l", "LeftLeg": "calf_l", "LeftFoot": "foot_l", "LeftToeBase": "ball_l",
    "RightUpLeg": "thigh_r", "RightLeg": "calf_r", "RightFoot": "foot_r", "RightToeBase": "ball_r",
}
# direction used to align each segment: (src from, src to) / (tgt from, tgt to); 'T' = bone tail
SRC_DIR = {"LowerBack": ("LowerBack", "Spine"), "Spine": ("Spine", "Spine1"), "Spine1": ("Spine1", "Head"),
           "Neck": ("Neck", "Head"), "Head": ("Head", "T"),
           "LeftShoulder": ("LeftShoulder", "LeftArm"), "LeftArm": ("LeftArm", "LeftForeArm"),
           "LeftForeArm": ("LeftForeArm", "LeftHand"), "LeftHand": ("LeftHand", "LeftFingerBase"),
           "RightShoulder": ("RightShoulder", "RightArm"), "RightArm": ("RightArm", "RightForeArm"),
           "RightForeArm": ("RightForeArm", "RightHand"), "RightHand": ("RightHand", "RightFingerBase"),
           "LeftUpLeg": ("LeftUpLeg", "LeftLeg"), "LeftLeg": ("LeftLeg", "LeftFoot"), "LeftFoot": ("LeftFoot", "LeftToeBase"),
           "LeftToeBase": ("LeftToeBase", "T"),
           "RightUpLeg": ("RightUpLeg", "RightLeg"), "RightLeg": ("RightLeg", "RightFoot"), "RightFoot": ("RightFoot", "RightToeBase"),
           "RightToeBase": ("RightToeBase", "T")}
TGT_DIR = {"spine_01": ("spine_01", "spine_02"), "spine_02": ("spine_02", "spine_03"), "spine_03": ("spine_03", "neck_01"),
           "neck_01": ("neck_01", "head"), "head": ("head", "T"),
           "clavicle_l": ("clavicle_l", "upperarm_l"), "upperarm_l": ("upperarm_l", "lowerarm_l"),
           "lowerarm_l": ("lowerarm_l", "hand_l"), "hand_l": ("hand_l", "middle_01_l"),
           "clavicle_r": ("clavicle_r", "upperarm_r"), "upperarm_r": ("upperarm_r", "lowerarm_r"),
           "lowerarm_r": ("lowerarm_r", "hand_r"), "hand_r": ("hand_r", "middle_01_r"),
           "thigh_l": ("thigh_l", "calf_l"), "calf_l": ("calf_l", "foot_l"), "foot_l": ("foot_l", "ball_l"), "ball_l": ("ball_l", "T"),
           "thigh_r": ("thigh_r", "calf_r"), "calf_r": ("calf_r", "foot_r"), "foot_r": ("foot_r", "ball_r"), "ball_r": ("ball_r", "T")}

_BVH_CACHE = {}


def load_bvh(path):
    if path in _BVH_CACHE and _BVH_CACHE[path].name in bpy.data.objects:
        return _BVH_CACHE[path]
    before = set(bpy.data.objects)
    bpy.ops.import_anim.bvh(filepath=path, axis_forward="-Z", axis_up="Y", rotate_mode="NATIVE",
                            update_scene_fps=False, update_scene_duration=False, global_scale=1.0)
    src = [o for o in bpy.data.objects if o not in before][0]
    src.hide_render = True
    _BVH_CACHE[path] = src
    return src


def _src_world(src, name, frame):
    pb = src.pose.bones[name]
    return src.matrix_world @ pb.matrix


def _src_pt(src, name):
    if name == "T":
        raise ValueError
    return src.matrix_world @ src.pose.bones[name].head


def retarget(rig, bvh_path, src_start, src_end, tgt_start, speed=1.0, yaw_deg=0.0, offset=(0, 0, 0),
             action=None, ground_lock=True, hips_height_scale=1.0, subset=None, n_frames=None, root_motion=True, canon_deg=None):
    """Bake a mocap segment onto `rig` beginning at tgt_start. Returns (action, last_frame)."""
    sc = bpy.context.scene
    src = load_bvh(bvh_path)
    src.hide_viewport = False
    src_act = src.animation_data.action
    # --- canonical facing: rotate source so that at frame 1 its left points +X
    src.rotation_euler = (0, 0, 0); src.location = (0, 0, 0)
    sc.frame_set(1); bpy.context.view_layer.update()
    lat = _src_pt(src, "LeftUpLeg") - _src_pt(src, "RightUpLeg")
    ang = math.atan2(lat.y, lat.x) if canon_deg is None else math.radians(canon_deg)
    src.rotation_euler = (0, 0, -ang)
    sc.frame_set(1); bpy.context.view_layer.update()
    # reference (T-pose) data
    ref_rot = {s: _src_world(src, s, 1).to_quaternion() for s in MAP}

    def sdir(s):
        a, b = SRC_DIR[s]
        pa = _src_pt(src, a)
        pb = (src.matrix_world @ src.pose.bones[a].tail) if b == "T" else _src_pt(src, b)
        if (pb - pa).length < 1e-3:  # zero-length segment in the CMU skeleton (e.g. Spine1->Neck)
            return (src.matrix_world.to_3x3() @ src.pose.bones[a].matrix.to_3x3().col[1]).normalized()
        return (pb - pa).normalized()
    src_dirs = {s: sdir(s) for s in SRC_DIR}
    hips_ref = _src_pt(src, "Hips")
    foot_ref = min(_src_pt(src, "LeftToeBase").z, _src_pt(src, "RightToeBase").z)
    src_leg = hips_ref.z - foot_ref
    bones = rig.data.bones
    tgt_leg = bones["pelvis"].head_local.z - min(bones["ball_l"].head_local.z, 0.0)
    scale = tgt_leg / src_leg * hips_height_scale

    def tdir(t):
        a, b = TGT_DIR[t]
        pa = bones[a].head_local
        pb = bones[a].tail_local if b == "T" else bones[b].head_local
        return (pb - pa).normalized()
    tref = {}
    for s, t in MAP.items():
        R = bones[t].matrix_local.to_quaternion()
        if s in SRC_DIR:
            A = tdir(t).rotation_difference(src_dirs[s])
            R = A @ R
        tref[t] = R
    # --- per frame
    if action is None:
        action = bpy.data.actions.new("ACT_" + rig.name)
    if rig.animation_data is None:
        rig.animation_data_create()
    rig.animation_data.action = action
    for pb in rig.pose.bones:
        pb.rotation_mode = "QUATERNION"
    yawq = Quaternion((0, 0, 1), math.radians(yaw_deg))
    off = Vector(offset)
    n = n_frames if n_frames else int((src_end - src_start) / (4.0 * max(speed, 1e-6))) + 1
    order = [b.name for b in rig.data.bones]  # parents before children
    data = {t: [] for t in order}
    locs = []
    sc.frame_set(int(src_start)); bpy.context.view_layer.update()
    hips0 = _src_pt(src, "Hips")
    for i in range(n):
        f = src_start + i * 4.0 * speed
        sc.frame_set(int(f), subframe=f - int(f)); bpy.context.view_layer.update()
        M = {}  # armature-space desired rotation (quaternion)
        for s, t in MAP.items():
            D = _src_world(src, s, f).to_quaternion() @ ref_rot[s].inverted()
            M[t] = yawq @ D @ tref[t]
        hp = _src_pt(src, "Hips")
        d = hp - hips0
        pos = Vector((d.x * scale, d.y * scale, (hp.z - hips_ref.z) * scale))
        pos = yawq @ Vector((pos.x, pos.y, 0)) + Vector((0, 0, pos.z))
        locs.append(pos + off)
        # convert to local basis rotations top-down
        posed = {}
        for t in order:
            b = bones[t]
            Bb = b.matrix_local.to_quaternion()
            if b.parent:
                Bp = b.parent.matrix_local.to_quaternion()
                Mp = posed[b.parent.name]
                rel = Bp.inverted() @ Bb
                if t in M:
                    L = (Mp @ rel).inverted() @ M[t]
                else:
                    L = Quaternion()
                posed[t] = Mp @ rel @ L
            else:
                L = Bb.inverted() @ M[t] if t in M else Quaternion()
                posed[t] = Bb @ L
            data[t].append(L)
    # pelvis location: pose-space translation in the bone's rest frame (parent Root has identity)
    Bpel = bones["pelvis"].matrix_local.to_3x3()
    pel_head = bones["pelvis"].head_local
    root_rest = bones["Root"].matrix_local.to_3x3()
    fr = [tgt_start + i for i in range(n)]
    tgt_names = set(MAP.values()) if subset is None else set(subset)
    for t in order:
        if t not in tgt_names:
            continue
        pth = f'pose.bones["{t}"].rotation_quaternion'
        qs = data[t]
        # keep quaternion continuity
        for i in range(1, len(qs)):
            if qs[i].dot(qs[i - 1]) < 0: qs[i] = -qs[i]
        for c in range(4):
            fc = action.fcurves.find(pth, index=c) or action.fcurves.new(pth, index=c, action_group=t)
            _set_keys(fc, fr, [q[c] for q in qs])
    pth = 'pose.bones["pelvis"].location'
    if subset is not None and "pelvis" not in subset:
        assign(rig, action); src.hide_viewport = True
        return action, tgt_start + n - 1
    if not root_motion:
        locs = [Vector((0, 0, p.z)) + off for p in locs]
    for c in range(3):
        fc = action.fcurves.find(pth, index=c) or action.fcurves.new(pth, index=c, action_group="pelvis")
        vals = [(Bpel.inverted() @ p)[c] for p in locs]
        _set_keys(fc, fr, vals)
    assign(rig, action)
    src.hide_viewport = True
    return action, tgt_start + n - 1


def assign(idblock, action):
    """Blender 4.4+ slotted actions: (re)assign action and its first slot."""
    if idblock.animation_data is None:
        idblock.animation_data_create()
    idblock.animation_data.action = action
    if hasattr(action, "slots") and len(action.slots) and idblock.animation_data.action_slot is None:
        idblock.animation_data.action_slot = action.slots[0]


def canon_angle(bvh_path):
    sc = bpy.context.scene
    src = load_bvh(bvh_path); src.hide_viewport = False
    src.rotation_euler = (0, 0, 0); sc.frame_set(1); bpy.context.view_layer.update()
    lat = _src_pt(src, "LeftUpLeg") - _src_pt(src, "RightUpLeg")
    src.hide_viewport = True
    return math.degrees(math.atan2(lat.y, lat.x))


def clip_hips(bvh_path, frame, canon_deg):
    """Hips position (source units) at frame in a given canonical rotation."""
    sc = bpy.context.scene
    src = load_bvh(bvh_path); src.hide_viewport = False
    src.rotation_euler = (0, 0, -math.radians(canon_deg)); sc.frame_set(int(frame)); bpy.context.view_layer.update()
    p = _src_pt(src, "Hips").copy()
    src.hide_viewport = True
    return p


def src_scale(rig, bvh_path):
    sc = bpy.context.scene
    src = load_bvh(bvh_path); src.hide_viewport = False
    src.rotation_euler = (0, 0, 0); sc.frame_set(1); bpy.context.view_layer.update()
    hips = _src_pt(src, "Hips"); foot = min(_src_pt(src, "LeftToeBase").z, _src_pt(src, "RightToeBase").z)
    bones = rig.data.bones
    src.hide_viewport = True
    return (bones["pelvis"].head_local.z - min(bones["ball_l"].head_local.z, 0.0)) / (hips.z - foot)


def clip_heading(bvh_path, frame):
    """Heading (deg, 0 = facing -Y, CCW positive) of the actor at `frame`, in the canonical frame used by retarget."""
    sc = bpy.context.scene
    src = load_bvh(bvh_path); src.hide_viewport = False
    src.rotation_euler = (0, 0, 0); sc.frame_set(1); bpy.context.view_layer.update()
    lat = _src_pt(src, "LeftUpLeg") - _src_pt(src, "RightUpLeg")
    src.rotation_euler = (0, 0, -math.atan2(lat.y, lat.x))
    sc.frame_set(int(frame)); bpy.context.view_layer.update()
    lat = _src_pt(src, "LeftUpLeg") - _src_pt(src, "RightUpLeg")
    F = lat.cross(Vector((0, 0, 1)))
    src.hide_viewport = True
    return math.degrees(math.atan2(F.x, -F.y))


def transition(action, bones, f0, f1, ease=True):
    """Animator in-between: replace keys strictly between f0 and f1 with an eased slerp of the poses at f0 and f1."""
    for b in bones:
        qa, qb = get_q(action, b, f0), get_q(action, b, f1)
        if qa.dot(qb) < 0: qb = -qb
        frames = list(range(int(f0) + 1, int(f1)))
        set_q_range(action, b, frames, [qa.slerp(qb, smooth((f - f0) / (f1 - f0)) if ease else (f - f0) / (f1 - f0)) for f in frames])
    pth = 'pose.bones["pelvis"].location'
    for c in range(3):
        fc = action.fcurves.find(pth, index=c)
        if not fc: continue
        a, b2 = fc.evaluate(f0), fc.evaluate(f1)
        frames = list(range(int(f0) + 1, int(f1)))
        _set_keys(fc, frames, [a + (b2 - a) * smooth((f - f0) / (f1 - f0)) for f in frames])


def hold(action, bones, f_src, f0, f1):
    """Hold the pose of frame f_src over [f0, f1]."""
    if f1 < f0: return
    for b in bones:
        q = get_q(action, b, f_src)
        set_q_range(action, b, list(range(int(f0), int(f1) + 1)), [q.copy() for _ in range(int(f0), int(f1) + 1)])
    if "pelvis" not in bones: return
    pth = 'pose.bones["pelvis"].location'
    for c in range(3):
        fc = action.fcurves.find(pth, index=c)
        if fc:
            v = fc.evaluate(f_src); _set_keys(fc, list(range(int(f0), int(f1) + 1)), [v] * (int(f1) - int(f0) + 1))


def pelvis_offset(action, f0, f1, keys):
    """Additive pelvis translation in armature space; keys: list of (frame, (dx,dy,dz))."""
    import bpy as _b
    rig = None
    for o in _b.data.objects:
        if o.animation_data and o.animation_data.action == action: rig = o
    B = rig.data.bones["pelvis"].matrix_local.to_3x3().inverted()
    pth = 'pose.bones["pelvis"].location'
    fcs = [action.fcurves.find(pth, index=c) for c in range(3)]
    frames = list(range(int(f0), int(f1) + 1))
    base = [[fc.evaluate(f) for fc in fcs] for f in frames]
    for i, f in enumerate(frames):
        for (fa, da), (fb, db) in zip(keys, keys[1:] if len(keys) > 1 else keys):
            if fa <= f <= fb or len(keys) == 1:
                t = smooth((f - fa) / max(1e-6, fb - fa)) if len(keys) > 1 else 0
                d = Vector(da).lerp(Vector(db), t); break
        else:
            d = Vector(keys[-1][1]) if f > keys[-1][0] else Vector(keys[0][1])
        dl = B @ d
        base[i] = [base[i][c] + dl[c] for c in range(3)]
    for c in range(3):
        _set_keys(fcs[c], frames, [b[c] for b in base])


ALL_BODY = list(MAP.values())


def _set_keys(fc, frames, values, interp="LINEAR"):
    """Insert/replace keys on an fcurve for given frames (fast path)."""
    existing = {round(k.co[0], 3): k for k in fc.keyframe_points}
    new_f, new_v = [], []
    for f, v in zip(frames, values):
        k = existing.get(round(f, 3))
        if k is not None:
            k.co[1] = v; k.handle_left[1] = v; k.handle_right[1] = v
        else:
            new_f.append(f); new_v.append(v)
    if new_f:
        start = len(fc.keyframe_points)
        fc.keyframe_points.add(len(new_f))
        for i, (f, v) in enumerate(zip(new_f, new_v)):
            kp = fc.keyframe_points[start + i]
            kp.co = (f, v); kp.interpolation = interp
    fc.update()


# ------------------------------------------------------------------ evaluation helpers
def get_q(action, bone, frame):
    pth = f'pose.bones["{bone}"].rotation_quaternion'
    vals = []
    for c in range(4):
        fc = action.fcurves.find(pth, index=c)
        vals.append(fc.evaluate(frame) if fc else (1.0 if c == 0 else 0.0))
    return Quaternion(vals)


def set_q_range(action, bone, frames, quats):
    pth = f'pose.bones["{bone}"].rotation_quaternion'
    for i in range(1, len(quats)):
        if quats[i].dot(quats[i - 1]) < 0: quats[i] = -quats[i]
    for c in range(4):
        fc = action.fcurves.find(pth, index=c) or action.fcurves.new(pth, index=c, action_group=bone)
        _set_keys(fc, frames, [q[c] for q in quats])


def smooth(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


def weight_curve(keys, f):
    """keys: list of (frame, weight); smoothstep between keys."""
    if f <= keys[0][0]: return keys[0][1]
    if f >= keys[-1][0]: return keys[-1][1]
    for (f0, w0), (f1, w1) in zip(keys, keys[1:]):
        if f0 <= f <= f1:
            return w0 + (w1 - w0) * smooth((f - f0) / max(1e-6, f1 - f0))
    return keys[-1][1]


def eul(x, y, z):
    return Euler((math.radians(x), math.radians(y), math.radians(z))).to_quaternion()


def layer(action, bone, f0, f1, poses, mode="add"):
    """Handcrafted layer. poses: list of (frame, (x,y,z) degrees local, weight).
    mode 'add' post-multiplies a local delta; 'replace' slerps towards an absolute local pose."""
    frames = list(range(int(f0), int(f1) + 1))
    out = []
    for f in frames:
        base = get_q(action, bone, f)
        # interpolate pose & weight
        if f <= poses[0][0]: e, w = poses[0][1], poses[0][2]
        elif f >= poses[-1][0]: e, w = poses[-1][1], poses[-1][2]
        else:
            for a, b in zip(poses, poses[1:]):
                if a[0] <= f <= b[0]:
                    t = smooth((f - a[0]) / max(1e-6, b[0] - a[0]))
                    qa, qb = eul(*a[1]), eul(*b[1])
                    e = qa.slerp(qb, t); w = a[2] + (b[2] - a[2]) * t
                    break
        q = eul(*e) if isinstance(e, tuple) else e
        if mode == "add":
            out.append(base @ Quaternion().slerp(q, w))
        else:
            out.append(base.slerp(q, w))
    set_q_range(action, bone, frames, out)


def noise1(t, seed, freqs=(1.0,)):
    rnd = random.Random(seed)
    v = 0.0
    for fq in freqs:
        v += math.sin(2 * math.pi * fq * t + rnd.uniform(0, 6.28)) * (1.0 / len(freqs))
    return v


SHIVER_BONES = {"spine_01": 0.5, "spine_02": 0.6, "spine_03": 0.8, "neck_01": 0.7, "head": 0.5,
                "clavicle_l": 1.0, "clavicle_r": 1.0, "upperarm_l": 0.8, "upperarm_r": 0.8,
                "lowerarm_l": 0.6, "lowerarm_r": 0.6, "hand_l": 0.9, "hand_r": 0.9,
                "thigh_l": 0.3, "thigh_r": 0.3, "calf_l": 0.3, "calf_r": 0.3}


def shiver(action, f0, f1, amp_keys, seed=1, fps=30.0):
    """Involuntary shivering: fast 8-11 Hz tremor + slower 2-4 Hz bursts. amp_keys in degrees."""
    frames = list(range(int(f0), int(f1) + 1))
    for bi, (bone, gain) in enumerate(SHIVER_BONES.items()):
        out = []
        for f in frames:
            a = weight_curve(amp_keys, f) * gain
            t = f / fps
            burst = 0.6 + 0.4 * noise1(t, seed * 31 + bi, (0.37, 0.61))
            x = a * burst * (0.7 * noise1(t, seed + bi * 7, (9.1, 10.7, 8.3)) + 0.3 * noise1(t, seed + bi * 11, (2.3, 3.1)))
            y = a * burst * 0.5 * noise1(t, seed + bi * 13, (9.7, 11.3, 7.9))
            z = a * burst * 0.6 * noise1(t, seed + bi * 17, (8.8, 10.1))
            out.append(get_q(action, bone, f) @ eul(x, y, z))
        set_q_range(action, bone, frames, out)


def breathe(action, f0, f1, period_keys, depth_deg=1.6):
    """Chest & shoulder rise synced to a breathing period (seconds). Returns exhale frames."""
    frames = list(range(int(f0), int(f1) + 1))
    phase = 0.0; exhales = []; prev = 0
    o3, oc_l, oc_r, onk = [], [], [], []
    for f in frames:
        per = weight_curve(period_keys, f)
        phase += 1.0 / (30.0 * per)
        s = math.sin(2 * math.pi * phase)
        if prev > 0 >= s:
            exhales.append(f)
        prev = s
        o3.append(get_q(action, "spine_03", f) @ eul(-depth_deg * s, 0, 0))
        oc_l.append(get_q(action, "clavicle_l", f) @ eul(0, 0, 0.8 * depth_deg * s))
        oc_r.append(get_q(action, "clavicle_r", f) @ eul(0, 0, -0.8 * depth_deg * s))
        onk.append(get_q(action, "neck_01", f) @ eul(0.6 * depth_deg * s, 0, 0))
    set_q_range(action, "spine_03", frames, o3)
    set_q_range(action, "clavicle_l", frames, oc_l)
    set_q_range(action, "clavicle_r", frames, oc_r)
    set_q_range(action, "neck_01", frames, onk)
    return exhales


# finger curl (degrees about local X for joints 1,2,3) - verified against the MPFB game_engine rig
HAND_POSES = {
    "relaxed": {"thumb": (10, 5, 5), "index": (12, 15, 10), "middle": (15, 18, 12), "ring": (18, 20, 14), "pinky": (22, 22, 16)},
    "fist": {"thumb": (25, 30, 35), "index": (80, 95, 60), "middle": (85, 95, 60), "ring": (85, 95, 60), "pinky": (85, 90, 60)},
    "grip": {"thumb": (20, 20, 20), "index": (45, 55, 35), "middle": (50, 58, 38), "ring": (52, 58, 38), "pinky": (55, 55, 35)},
    "flat": {"thumb": (0, 0, 0), "index": (2, 2, 2), "middle": (2, 2, 2), "ring": (2, 2, 2), "pinky": (2, 2, 2)},
    "claw": {"thumb": (15, 20, 25), "index": (30, 60, 50), "middle": (32, 62, 50), "ring": (35, 62, 50), "pinky": (38, 60, 48)},
    "tucked": {"thumb": (35, 25, 20), "index": (50, 60, 40), "middle": (55, 62, 40), "ring": (55, 62, 40), "pinky": (58, 60, 40)},
}
FINGER_AXIS = (1, 0, 0)  # curl axis in bone-local space (sign set by CURL_SIGN)
CURL_SIGN = {"l": 1.0, "r": 1.0}


def hand_pose(action, side, keys):
    """keys: list of (frame, pose_name, weight-of-pose-vs-relaxed)."""
    f0, f1 = int(keys[0][0]), int(keys[-1][0])
    frames = list(range(f0, f1 + 1))
    for finger in ["thumb", "index", "middle", "ring", "pinky"]:
        for j in range(3):
            bone = f"{finger}_0{j + 1}_{side}"
            out = []
            for f in frames:
                for a, b in zip(keys, keys[1:] if len(keys) > 1 else keys):
                    if a[0] <= f <= b[0] or len(keys) == 1:
                        t = smooth((f - a[0]) / max(1e-6, b[0] - a[0])) if len(keys) > 1 else 0
                        ca = HAND_POSES[a[1]][finger][j] * a[2]; cb = HAND_POSES[b[1]][finger][j] * b[2]
                        c = ca + (cb - ca) * t
                        break
                else:
                    c = HAND_POSES[keys[-1][1]][finger][j]
                ax = Vector(FINGER_AXIS) * CURL_SIGN[side]
                if finger == "thumb":
                    q = Quaternion(Vector((0.3, 0, 1.0)).normalized(), math.radians(c) * CURL_SIGN[side])
                else:
                    q = Quaternion(ax, math.radians(c))
                out.append(q)
            set_q_range(action, bone, frames, out)


# ------------------------------------------------------------------ face (shape keys)
def face_action(body):
    sk = body.data.shape_keys
    if sk.animation_data is None:
        sk.animation_data_create()
    if sk.animation_data.action is None:
        sk.animation_data.action = bpy.data.actions.new("FACE_" + body.name)
    return sk.animation_data.action


def ensure_slots(rig, body):
    for idb in (rig, body.data.shape_keys):
        if idb.animation_data and idb.animation_data.action:
            assign(idb, idb.animation_data.action)


def face_keys(body, frame, values, interp="BEZIER"):
    sk = body.data.shape_keys
    for k, v in values.items():
        kb = sk.key_blocks.get(k)
        if kb is None:
            continue
        kb.value = v
        kb.keyframe_insert("value", frame=frame)
    act = sk.animation_data.action
    for fc in act.fcurves:
        for kp in fc.keyframe_points:
            if abs(kp.co[0] - frame) < 0.01:
                kp.interpolation = interp


def blinks(body, f0, f1, mean_interval_s=3.2, seed=3, dur=5, droop_keys=None):
    rnd = random.Random(seed)
    f = f0 + rnd.uniform(10, 40)
    while f < f1 - dur:
        base = weight_curve(droop_keys, f) if droop_keys else 0.0
        face_keys(body, int(f) - 1, {"eyeBlinkLeft": base, "eyeBlinkRight": base})
        face_keys(body, int(f) + 2, {"eyeBlinkLeft": 1.0, "eyeBlinkRight": 1.0})
        face_keys(body, int(f) + dur, {"eyeBlinkLeft": base, "eyeBlinkRight": base})
        f += 30 * mean_interval_s * rnd.uniform(0.6, 1.4)


def chatter(body, f0, f1, amp_keys, seed=5):
    """Teeth chattering: rapid small jaw open/close (~7-9 Hz) with lip press."""
    rnd = random.Random(seed)
    for f in range(int(f0), int(f1) + 1, 2):
        a = weight_curve(amp_keys, f)
        v = a * (0.5 + 0.5 * math.sin(f * 1.85 + rnd.uniform(-0.4, 0.4)))
        face_keys(body, f, {"jawOpen": 0.02 + 0.09 * v, "mouthPressLeft": 0.3 * a, "mouthPressRight": 0.3 * a,
                            "mouthStretchLeft": 0.25 * a, "mouthStretchRight": 0.25 * a}, interp="LINEAR")
