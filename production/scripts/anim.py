"""Mocap retargeting (CMU BVH -> MPFB cmu_mb rig) + keyframe layering helpers.

CMU motion data: mocap.cs.cmu.edu (free for all uses), BVH conversion by B. Hahne (cgspeed).
The CMU skeleton rests in a T-pose while MakeHuman's rests in an A-pose, so rotations are
transferred in world space with a per-bone T-pose alignment offset, then solved back to local
bone rotations down the hierarchy. Clips are sampled at 30 fps, placed on a path (origin + heading)
and cross-faded with quaternion slerp. Hand-keyed additive layers (head looks, reaches, flinches)
are applied on top.
"""
import bpy, math
from mathutils import Vector, Quaternion, Matrix, Euler

MOCAP = "/opt/assets/mocap"
_cache = {}


def _import_bvh(path):
    if path in _cache and _cache[path].name in bpy.data.objects:
        return _cache[path]
    before = set(bpy.data.objects)
    bpy.ops.import_anim.bvh(filepath=path, axis_forward='-Z', axis_up='Y', rotate_mode='NATIVE',
                            update_scene_fps=False, update_scene_duration=False, use_fps_scale=False)
    src = [o for o in bpy.data.objects if o not in before][0]
    src.hide_render = True
    _cache[path] = src
    return src


def _rest_world(arm):
    return {b.name: (arm.matrix_world @ b.matrix_local) for b in arm.data.bones}


class Retarget:
    """Holds per-frame local quaternions for one rig before they are written to an action."""

    def __init__(self, rig):
        self.rig = rig
        self.frames = {}          # frame -> {bone: Quaternion}
        self.root = {}            # frame -> Vector (armature-space hips head location)
        for pb in rig.pose.bones:
            pb.rotation_mode = 'QUATERNION'
        self.rest = _rest_world(rig)
        self.bones = [b for b in rig.data.bones]
        self.order = self._order()
        hips = rig.data.bones["Hips"]
        self.hips_h = (rig.matrix_world @ hips.head_local).z

    def _order(self):
        out = []
        def rec(b):
            out.append(b)
            for c in b.children:
                rec(c)
        for b in self.rig.data.bones:
            if b.parent is None:
                rec(b)
        return out

    # ------------------------------------------------------------------ clip
    def clip(self, name, start, src_from=None, src_to=None, speed=1.0, origin=(0, 0, 0), heading=0.0,
             blend=8, root_motion=True, mirror=False, hold_root_xy=False, src_fps=120, travel=None, face=None, length=None, absolute=False):
        """Add BVH clip `name` (e.g. '02_01') at scene frame `start`. Returns last frame written."""
        src = _import_bvh(f"{MOCAP}/{name}.bvh")
        act = src.animation_data.action
        n_src = int(act.frame_range[1])
        f0 = src_from if src_from is not None else 2   # frame 1 of the cgspeed release is a T-pose
        if f0 < 0:
            f0 = n_src + f0
        f1 = src_to if src_to is not None else n_src
        step = src_fps / 30.0 * speed
        if length is not None:
            f1 = min(n_src, int(f0 + length * step))
        sc0 = bpy.context.scene
        if travel is not None:
            sc0.frame_set(int(f0)); a = (src.matrix_world @ src.pose.bones["Hips"].head).copy()
            sc0.frame_set(int(f1)); b = (src.matrix_world @ src.pose.bones["Hips"].head).copy()
            heading = travel - math.atan2(b.y - a.y, b.x - a.x)
        elif face is not None:
            sc0.frame_set(int(f0))
            l = src.matrix_world @ src.pose.bones["LeftUpLeg"].head
            r = src.matrix_world @ src.pose.bones["RightUpLeg"].head
            lr = l - r
            heading = face - math.atan2(-lr.x, lr.y)   # facing angle theta has left side (-sin, cos)
        self.last_heading = heading
        srest = _rest_world(src)
        # T-pose alignment offsets: rotate each dest rest bone so it points like the src rest bone
        off = {}
        for b in self.bones:
            if b.name not in srest:
                continue
            rd = self.rest[b.name].to_3x3().normalized()
            rs = srest[b.name].to_3x3().normalized()
            dd = rd.col[1].normalized()
            ds = rs.col[1].normalized()
            q = dd.rotation_difference(ds)
            rdT = q.to_matrix() @ rd
            off[b.name] = rs.inverted() @ rdT
        # source hips height for root scaling
        # scale root motion by rest leg length (robust for clips that do not start standing)
        def leg(arm):
            bb = arm.data.bones
            return sum(bb[n].length for n in ("LeftUpLeg", "LeftLeg")) * arm.matrix_world.to_scale().z
        scale = leg(self.rig) / max(leg(src), 1e-5)
        self.last_scale = scale
        H = Matrix.Rotation(heading, 3, 'Z')
        sc = bpy.context.scene
        first_root = None
        f = start
        t = f0
        written = []
        while t <= f1:
            sc.frame_set(int(t), subframe=t - int(t))
            pose = {}
            world = {}
            for b in self.order:
                nm = b.name
                if nm not in off:
                    continue
                spb = src.pose.bones[nm]
                Rs = (src.matrix_world @ spb.matrix).to_3x3().normalized()
                Rd = H @ Rs @ off[nm]
                world[nm] = Rd
            # solve local rotations: L = (Rest_b^-1 Rest_p) M_p^-1 M_b   (rotation parts)
            arm_inv = self.rig.matrix_world.to_3x3().inverted()
            for b in self.order:
                nm = b.name
                if nm not in world:
                    continue
                Mb = arm_inv @ world[nm]
                restb = b.matrix_local.to_3x3()
                if b.parent and b.parent.name in world:
                    Mp = arm_inv @ world[b.parent.name]
                    restp = b.parent.matrix_local.to_3x3()
                    L = (restb.inverted() @ restp) @ Mp.inverted() @ Mb
                else:
                    L = restb.inverted() @ Mb
                pose[nm] = L.to_quaternion().normalized()
            # root
            hp = src.matrix_world @ src.pose.bones["Hips"].head
            if first_root is None:
                first_root = hp.copy()
                if absolute:          # paired clips (two performers): keep their captured spacing
                    first_root = Vector((0, 0, hp.z))
            rel = (hp - first_root) * scale
            if not root_motion or hold_root_xy:
                rel.x = rel.y = 0
            rel = H @ rel
            z = hp.z * scale
            loc = Vector((origin[0] + rel.x, origin[1] + rel.y, z + origin[2]))
            self._put(f, pose, loc, blend if f < start + blend else 0, start)
            written.append(f)
            f += 1
            t += step
        return f - 1

    def _put(self, f, pose, loc, blend, start):
        if blend and f in self.frames:
            w = (f - start + 1) / (blend + 1)
            old = self.frames[f]
            for k, q in pose.items():
                if k in old:
                    pose[k] = old[k].slerp(q, w)
            if f in self.root:
                loc = self.root[f].lerp(loc, w)
        elif blend and (f - 1) in self.frames and f not in self.frames:
            # blend from the last held pose
            w = (f - start + 1) / (blend + 1)
            old = self.frames[f - 1] if f - 1 >= start - 1 else None
            prev = self.frames.get(start - 1)
            if prev:
                for k, q in pose.items():
                    if k in prev:
                        pose[k] = prev[k].slerp(q, w)
                if (start - 1) in self.root:
                    loc = self.root[start - 1].lerp(loc, w)
        self.frames[f] = pose
        self.root[f] = loc

    def hold(self, f_from, f_to):
        """Hold the pose at f_from until f_to (breathing added later)."""
        p, r = self.frames[f_from], self.root[f_from]
        for f in range(f_from + 1, f_to + 1):
            self.frames[f] = {k: q.copy() for k, q in p.items()}
            self.root[f] = r.copy()

    # ------------------------------------------------------------------ additive layers
    def add_rot(self, bone, keys, axis='X', interp='smooth'):
        """keys: list of (frame, degrees). Additive local rotation around a bone axis, smoothly interpolated."""
        keys = sorted(keys)
        ax = {'X': Vector((1, 0, 0)), 'Y': Vector((0, 1, 0)), 'Z': Vector((0, 0, 1))}[axis]
        for f in list(self.frames):
            a = _interp(keys, f)
            if a is None or bone not in self.frames[f]:
                continue
            self.frames[f][bone] = self.frames[f][bone] @ Quaternion(ax, math.radians(a))

    def set_rot_world(self, bone, keys):
        """keys: (frame, weight, Quaternion armature-space target) -> blend bone toward absolute orientation."""
        pass

    def add_root(self, keys):
        """keys: (frame, (dx,dy,dz)) additive root offset."""
        keys = sorted(keys)
        for f in list(self.root):
            v = _interp_vec(keys, f)
            if v is not None:
                self.root[f] = self.root[f] + Vector(v)

    def breathe(self, amp=1.2, period=110, phase=0.0):
        for f in self.frames:
            a = amp * math.sin(2 * math.pi * (f / period) + phase)
            for b, k in (("Spine1", 1.0), ("Neck", -0.6)):
                if b in self.frames[f]:
                    self.frames[f][b] = self.frames[f][b] @ Quaternion((1, 0, 0), math.radians(a * k))

    # ------------------------------------------------------------------ write
    def posture(self, neck=-5, head=-7, spine=-3):
        """Global correction: the CMU->MakeHuman mapping pitches the head/neck forward slightly."""
        for f in self.frames:
            for b, a in (("Neck", neck), ("Head", head), ("Spine1", spine)):
                if b in self.frames[f]:
                    self.frames[f][b] = self.frames[f][b] @ Quaternion((1, 0, 0), math.radians(a))

    def write(self, action_name=None, posture=True):
        rig = self.rig
        if posture and not getattr(self, "_post_done", False):
            self.posture()
            self._post_done = True
        if rig.animation_data is None:
            rig.animation_data_create()
        act = bpy.data.actions.new(action_name or (rig.name + "_perf"))
        rig.animation_data.action = act
        frames = sorted(self.frames)
        for b in rig.pose.bones:
            b.rotation_mode = 'QUATERNION'
        # use keyframe_insert for compatibility with 4.4+ layered actions
        prevq = {}
        for f in frames:
            for nm, q in self.frames[f].items():
                pb = rig.pose.bones[nm]
                if nm in prevq and prevq[nm].dot(q) < 0:
                    q = -q
                prevq[nm] = q
                pb.rotation_quaternion = q
                pb.keyframe_insert("rotation_quaternion", frame=f, group=nm)
            hips = rig.pose.bones["Hips"]
            # convert armature-space root location to hips pose location
            restm = rig.data.bones["Hips"].matrix_local
            wl = rig.matrix_world.inverted() @ self.root[f]
            hips.location = restm.inverted().to_3x3() @ (wl - restm.translation)
            hips.keyframe_insert("location", frame=f, group="Hips")
        return act


def _interp(keys, f):
    if not keys:
        return None
    if f <= keys[0][0]:
        return keys[0][1]
    if f >= keys[-1][0]:
        return keys[-1][1]
    for (fa, a), (fb, b) in zip(keys[:-1], keys[1:]):
        if fa <= f <= fb:
            t = (f - fa) / max(fb - fa, 1e-6)
            t = t * t * (3 - 2 * t)
            return a + (b - a) * t


def _interp_vec(keys, f):
    if not keys:
        return None
    xs = [_interp([(k[0], k[1][i]) for k in keys], f) for i in range(3)]
    return xs


# ------------------------------------------------------------------ face
FACE = {
    "neutral": {},
    "smile_soft": {"mouthSmileLeft": 0.35, "mouthSmileRight": 0.35, "cheekSquintLeft": 0.15, "cheekSquintRight": 0.15},
    "tender": {"mouthSmileLeft": 0.25, "mouthSmileRight": 0.2, "browInnerUp": 0.35, "eyeSquintLeft": 0.15, "eyeSquintRight": 0.15},
    "concern": {"browInnerUp": 0.6, "browDownLeft": 0.15, "browDownRight": 0.15, "mouthFrownLeft": 0.3, "mouthFrownRight": 0.3},
    "curious": {"browOuterUpLeft": 0.35, "browOuterUpRight": 0.35, "eyeWideLeft": 0.2, "eyeWideRight": 0.2, "jawOpen": 0.05},
    "alarm": {"browInnerUp": 0.8, "browOuterUpLeft": 0.6, "browOuterUpRight": 0.6, "eyeWideLeft": 0.8, "eyeWideRight": 0.8, "jawOpen": 0.25, "mouthStretchLeft": 0.2, "mouthStretchRight": 0.2},
    "squint_flash": {"eyeSquintLeft": 1.0, "eyeSquintRight": 1.0, "eyeBlinkLeft": 0.7, "eyeBlinkRight": 0.7, "browDownLeft": 0.8, "browDownRight": 0.8, "noseSneerLeft": 0.5, "noseSneerRight": 0.5, "mouthStretchLeft": 0.5, "mouthStretchRight": 0.5, "jawOpen": 0.2},
    "pain": {"eyeSquintLeft": 0.6, "eyeSquintRight": 0.5, "eyeBlinkLeft": 0.45, "browDownLeft": 0.5, "browInnerUp": 0.5, "mouthFrownLeft": 0.4, "mouthFrownRight": 0.3, "mouthStretchLeft": 0.3, "jawOpen": 0.1},
    "dazed": {"eyeBlinkLeft": 0.35, "eyeBlinkRight": 0.3, "browInnerUp": 0.4, "jawOpen": 0.12, "mouthFrownLeft": 0.15, "mouthFrownRight": 0.15},
    "grief": {"browInnerUp": 0.9, "mouthFrownLeft": 0.55, "mouthFrownRight": 0.55, "eyeSquintLeft": 0.3, "eyeSquintRight": 0.3, "mouthPressLeft": 0.3, "mouthPressRight": 0.3, "eyeLookDownLeft": 0.3, "eyeLookDownRight": 0.3},
    "earnest": {"browInnerUp": 0.45, "browOuterUpLeft": 0.15, "browOuterUpRight": 0.15, "mouthPressLeft": 0.15, "mouthPressRight": 0.15},
    "skeptic": {"browDownLeft": 0.45, "browOuterUpRight": 0.4, "mouthPressLeft": 0.35, "mouthPressRight": 0.2, "mouthLeft": 0.2, "eyeSquintLeft": 0.25},
    "resolve": {"browDownLeft": 0.2, "browDownRight": 0.2, "mouthPressLeft": 0.35, "mouthPressRight": 0.35, "jawForward": 0.1},
    "relief": {"browInnerUp": 0.55, "mouthSmileLeft": 0.2, "mouthSmileRight": 0.2, "eyeSquintLeft": 0.35, "eyeSquintRight": 0.35},
}


def face(body, keys, blink_every=(70, 140), seed=1, talk=None):
    """keys: list of (frame, expression_name[, intensity]); blinks + optional talking (frame ranges)."""
    import random
    sk = body.data.shape_keys
    if not sk:
        return
    kb = sk.key_blocks
    names = set()
    for k in keys:
        names.update(FACE[k[1]].keys())
    names.update(["eyeBlinkLeft", "eyeBlinkRight", "jawOpen", "aa_02", "ow_08", "p_b_m_21", "ey_eh_uh_04", "s_z_15"])
    names = [n for n in names if n in kb]
    keys = sorted(keys)
    frames = range(int(keys[0][0]), int(keys[-1][0]) + 1)
    vals = {n: {} for n in names}
    for f in frames:
        # piecewise smooth between expression keys
        for (fa, ea, *ia), (fb, eb, *ib) in zip(keys[:-1], keys[1:]):
            if fa <= f <= fb:
                t = (f - fa) / max(fb - fa, 1)
                t = t * t * (3 - 2 * t)
                A = {k: v * (ia[0] if ia else 1) for k, v in FACE[ea].items()}
                B = {k: v * (ib[0] if ib else 1) for k, v in FACE[eb].items()}
                for n in names:
                    vals[n][f] = A.get(n, 0) * (1 - t) + B.get(n, 0) * t
                break
    rnd = random.Random(seed)
    f = frames.start + rnd.randint(10, 40)
    while f < frames.stop:
        for d, v in ((0, 0.0), (2, 1.0), (4, 0.6), (6, 0.0)):
            for side in ("eyeBlinkLeft", "eyeBlinkRight"):
                if side in vals and f + d in vals[side]:
                    base = vals[side][f + d]
                    vals[side][f + d] = max(base, v)
        f += rnd.randint(*blink_every)
    if talk:
        vis = ["aa_02", "ow_08", "p_b_m_21", "ey_eh_uh_04", "s_z_15"]
        for (ta, tb) in talk:
            g = ta
            while g < tb:
                v = rnd.choice(vis)
                dur = rnd.randint(3, 6)
                amp = rnd.uniform(0.35, 0.8)
                for d in range(dur):
                    w = math.sin(math.pi * d / dur) * amp
                    if v in vals and g + d in vals[v]:
                        vals[v][g + d] = max(vals[v][g + d], w)
                    if "jawOpen" in vals and g + d in vals["jawOpen"] and v in ("aa_02", "ow_08"):
                        vals["jawOpen"][g + d] = max(vals["jawOpen"][g + d], w * 0.25)
                g += dur
                if rnd.random() < 0.15:
                    g += rnd.randint(4, 9)
    for n in names:
        k = kb[n]
        last = None
        for f in frames:
            v = vals[n].get(f, 0.0)
            if last is not None and abs(v - last) < 0.004 and f % 4:
                continue
            k.value = v
            k.keyframe_insert("value", frame=f)
            last = v
