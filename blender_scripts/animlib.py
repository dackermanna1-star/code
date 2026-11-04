"""Hand-keyed style animation toolkit for MPFB (MakeHuman default_no_toes) rigs.

Poses are written as rotations about ARMATURE axes (character space):
  X = character's left (+X) ... rotation about X: +  bends spine/head forward, - lifts thigh forward
  Y = character's back (+Y)   (character faces -Y)
  Z = up
They are converted per bone into local quaternions, so a pose reads like an animator's
intent ("spine03 forward 10 deg") independent of the bone roll.

Keys are interpolated with monotone cubic (PCHIP) per channel -> natural ease in/out, no
overshoot, holds when values repeat. Extra layers: breathing, idle noise, follow-through lag,
blinks, facial shape key tracks. Everything is baked to per-frame keyframes.
"""
import bpy, math, random
from mathutils import Euler, Quaternion, Matrix, Vector

R = math.radians

# ---------------------------------------------------------------- helpers
def mirror_name(n):
    if n.endswith('.L'): return n[:-2] + '.R'
    if n.endswith('.R'): return n[:-2] + '.L'
    return n

def sym(pose):
    """Expand a pose dict: keys ending with '.L*' are mirrored to '.R' automatically
    unless a .R value is already present. Use key 'name.LR' for symmetric spec."""
    out = {}
    for k, v in pose.items():
        if k.endswith('.LR'):
            b = k[:-3]
            out[b + '.L'] = v
            out[b + '.R'] = (v[0], -v[1], -v[2])
        else:
            out[k] = v
    return out

def mir(v):
    return (v[0], -v[1], -v[2])

def pchip_slopes(xs, ys):
    n = len(xs)
    if n < 2: return [0.0] * n
    h = [xs[i+1] - xs[i] for i in range(n-1)]
    d = [(ys[i+1] - ys[i]) / h[i] if h[i] else 0.0 for i in range(n-1)]
    m = [0.0] * n
    m[0] = d[0] * 0.0  # ease from rest at the ends (animator's ease-in)
    m[-1] = d[-1] * 0.0
    for i in range(1, n-1):
        if d[i-1] * d[i] <= 0: m[i] = 0.0
        else:
            w1 = 2*h[i] + h[i-1]; w2 = h[i] + 2*h[i-1]
            m[i] = (w1 + w2) / (w1/d[i-1] + w2/d[i])
    return m

def pchip_eval(xs, ys, ms, x):
    if x <= xs[0]: return ys[0]
    if x >= xs[-1]: return ys[-1]
    # binary search
    lo, hi = 0, len(xs) - 1
    while hi - lo > 1:
        mid = (lo + hi) // 2
        if xs[mid] <= x: lo = mid
        else: hi = mid
    h = xs[hi] - xs[lo]; t = (x - xs[lo]) / h
    t2, t3 = t*t, t*t*t
    return ((2*t3 - 3*t2 + 1) * ys[lo] + (t3 - 2*t2 + t) * h * ms[lo]
            + (-2*t3 + 3*t2) * ys[hi] + (t3 - t2) * h * ms[hi])

class Channel:
    """Scalar animation channel with PCHIP interpolation."""
    def __init__(self):
        self.keys = {}
    def key(self, f, v):
        self.keys[float(f)] = float(v)
    def compile(self):
        xs = sorted(self.keys); ys = [self.keys[x] for x in xs]
        self.xs, self.ys = xs, ys
        self.ms = pchip_slopes(xs, ys) if len(xs) > 1 else [0.0]
    def __call__(self, f):
        if not self.keys: return 0.0
        if len(self.xs) == 1: return self.ys[0]
        return pchip_eval(self.xs, self.ys, self.ms, f)

def noise1(t, seed=0.0):
    # smooth pseudo-noise: sum of incommensurate sines
    return (math.sin(t*1.0 + seed) * 0.5 + math.sin(t*2.31 + seed*1.7) * 0.3 + math.sin(t*4.13 + seed*2.9) * 0.2)

# ---------------------------------------------------------------- the character animator
BASE_BONES = ['root', 'spine05', 'spine04', 'spine03', 'spine02', 'spine01', 'neck01', 'neck02', 'neck03', 'head', 'jaw',
    'clavicle.L', 'clavicle.R', 'shoulder01.L', 'shoulder01.R', 'wrist.L', 'wrist.R',
    'upperleg01.L', 'upperleg01.R', 'lowerleg01.L', 'lowerleg01.R', 'foot.L', 'foot.R', 'pelvis.L', 'pelvis.R'] + \
    ['finger%d-%d.%s' % (a, b, s) for a in range(1, 6) for b in range(1, 4) for s in 'LR']
DEFAULT_LAG = {  # follow-through, frames
    'neck01': 1, 'neck02': 1, 'neck03': 2, 'head': 2,
    'lowerarm01.L': 1, 'lowerarm01.R': 1, 'wrist.L': 2, 'wrist.R': 2,
    'lowerarm02.L': 1, 'lowerarm02.R': 1,
}
FINGERS = ['finger%d-%d' % (a, b) for a in range(1, 6) for b in range(1, 4)]

class Actor:
    def __init__(self, rig, body=None, seed=1):
        self.rig = rig
        self.body = body
        self.seed = seed
        self.bone = {}       # bone -> [Channel x, y, z]
        self.loc = {}        # bone -> [Channel x,y,z] (armature-space offset, used for root)
        self.obj_loc = [Channel(), Channel(), Channel()]
        self.obj_rot = Channel()  # Z rotation (degrees)
        self.shape = {}      # shape key -> Channel
        self.breath = Channel(); self.breath.key(0, 1.0)      # breathing amplitude multiplier
        self.breath_rate = Channel(); self.breath_rate.key(0, 0.25)  # Hz
        self.idle = Channel(); self.idle.key(0, 1.0)          # idle noise multiplier
        self.extra = []      # callables(frame) -> dict bone->(x,y,z) additive
        self.blink_ranges = []
        self.lag = dict(DEFAULT_LAG)
        self.rest = {b.name: b.matrix_local.to_3x3() for b in rig.data.bones}
        self.vis = Channel()
        self.hand_ch = {}   # side -> [Channel]*3 (character space)
        self.pole_ch = {}
        self.ik_inf = {'L': Channel(), 'R': Channel()}
        self.ik_targets = {}
        self.local_bones = set(['upperarm01.L','upperarm01.R','upperarm02.L','upperarm02.R','lowerarm01.L','lowerarm01.R','lowerarm02.L','lowerarm02.R','wrist.L','wrist.R'])
        rb = rig.data.bones
        self.hip_x = rb['upperleg01.L'].head_local.x
        self.hip_z = rb['upperleg01.L'].head_local.z
        self.l1 = (rb['lowerleg01.L'].head_local - rb['upperleg01.L'].head_local).length
        self.l2 = (rb['foot.L'].head_local - rb['lowerleg01.L'].head_local).length
        self.ankle_z = rb['foot.L'].head_local.z
        self.foot_x = rb['foot.L'].head_local.x
        th = rb['lowerleg01.L'].head_local - rb['upperleg01.L'].head_local
        sh = rb['foot.L'].head_local - rb['lowerleg01.L'].head_local
        self.thigh_rest = math.atan2(-th.y, -th.z)   # forward angle of thigh at rest
        self.shin_rest = math.atan2(-sh.y, -sh.z)
        for pb in rig.pose.bones:
            pb.rotation_mode = 'QUATERNION'

    # -- keying API
    def pose(self, f, p, blend=1.0):
        p = sym(p)
        for b, v in p.items():
            if b not in self.rest: continue
            ch = self.bone.setdefault(b, [Channel(), Channel(), Channel()])
            for i in range(3): ch[i].key(f, v[i])

    def hold(self, f, bones=None):
        """Re-key current interpolated values at frame f (hold before next change)."""
        for b, ch in self.bone.items():
            if bones and b not in bones: continue
            for c in ch:
                c.compile(); c.key(f, c(f))

    def root(self, f, x=0.0, y=0.0, z=0.0):
        ch = self.loc.setdefault('root', [Channel(), Channel(), Channel()])
        ch[0].key(f, x); ch[1].key(f, y); ch[2].key(f, z)

    def place(self, f, x, y, z=0.0, rotz=None):
        self.obj_loc[0].key(f, x); self.obj_loc[1].key(f, y); self.obj_loc[2].key(f, z)
        if rotz is not None: self.obj_rot.key(f, rotz)

    def face(self, f, **kw):
        for k, v in kw.items():
            self.shape.setdefault(k, Channel()).key(f, v)

    def blinks(self, f0, f1, rate=(55, 140)):
        self.blink_ranges.append((f0, f1, rate))

    # -- evaluation
    def _compile(self):
        for ch in list(self.bone.values()) + list(self.loc.values()) + [self.obj_loc, [self.obj_rot]]:
            for c in ch: c.compile()
        for c in self.shape.values(): c.compile()
        for c in (self.breath, self.breath_rate, self.idle): c.compile()

    def eval_bone(self, b, f):
        ch = self.bone.get(b)
        lag = self.lag.get(b, 0)
        if ch is None:
            if b.startswith('finger'):
                return RELAX.get(b, (0.0, 0.0, 0.0))
            return (0.0, 0.0, 0.0)
        return tuple(c(f - lag) for c in ch)

    def to_quat(self, b, e):
        if b.startswith('finger') or b in self.local_bones:
            return Euler((R(e[0]), R(e[1]), R(e[2])), 'XYZ').to_quaternion()
        Rm = self.rest[b]
        qw = Euler((R(e[0]), R(e[1]), R(e[2])), 'XYZ').to_matrix()
        return (Rm.inverted() @ qw @ Rm).to_quaternion()

    def bake(self, f0, f1, step=1):
        self._compile()
        rig = self.rig
        frames = list(range(int(f0), int(f1) + 1, step))
        bones = set(self.bone.keys())
        # layers touch these bones too
        layer_bones = {'spine02', 'spine01', 'clavicle.L', 'clavicle.R', 'neck02', 'head', 'spine04', 'spine03'}
        bones |= layer_bones
        bones |= set(BASE_BONES)
        bones = [b for b in bones if b in self.rest]
        action = rig.animation_data.action if rig.animation_data and rig.animation_data.action else None
        if rig.animation_data is None: rig.animation_data_create()
        if action is None:
            action = bpy.data.actions.new(rig.name + '_act'); rig.animation_data.action = action
        data = {}
        prevq = {}
        t_breath = 0.0
        for f in frames:
            rate = self.breath_rate(f)
            t_breath += rate * step / 30.0 * 2 * math.pi
            br = math.sin(t_breath + self.seed) * self.breath(f)
            idl = self.idle(f)
            t = f / 30.0
            add = {
                'spine02': (1.1 * br, 0, 0), 'spine01': (-1.6 * br, 0, 0),
                'clavicle.L': (0, 0, 0.0), 'clavicle.R': (0, 0, 0.0),
                'neck02': (0.8 * br + 1.2 * idl * noise1(t * 0.6, self.seed), 1.5 * idl * noise1(t * 0.45, self.seed + 3), 0),
                'head': (1.0 * idl * noise1(t * 0.8, self.seed + 5), 0, 2.0 * idl * noise1(t * 0.35, self.seed + 9)),
                'spine04': (0.6 * idl * noise1(t * 0.3, self.seed + 11), 0, 0.8 * idl * noise1(t * 0.25, self.seed + 13)),
            }
            for fn in self.extra:
                for b, v in fn(f).items():
                    a = add.get(b, (0, 0, 0)); add[b] = (a[0] + v[0], a[1] + v[1], a[2] + v[2])
            for b in bones:
                e = self.eval_bone(b, f)
                a = add.get(b)
                if a: e = (e[0] + a[0], e[1] + a[1], e[2] + a[2])
                q = self.to_quat(b, e)
                if b in prevq and prevq[b].dot(q) < 0: q = -q
                prevq[b] = q
                data.setdefault(b, []).append((f, q))
        # write fcurves fast
        for b, seq in data.items():
            path = 'pose.bones["%s"].rotation_quaternion' % b
            for i in range(4):
                fc = action.fcurve_ensure_for_datablock(rig, path, index=i)
                self._write(fc, [(f, q[i]) for f, q in seq])
        for b, ch in self.loc.items():
            path = 'pose.bones["%s"].location' % b
            # location is in bone-local space: convert armature-space offset
            Rm = self.rest[b]
            vals = [(f, Rm.inverted() @ Vector((ch[0](f), ch[1](f), ch[2](f)))) for f in frames]
            for i in range(3):
                fc = action.fcurve_ensure_for_datablock(rig, path, index=i)
                self._write(fc, [(f, v[i]) for f, v in vals])
        if 'root' not in self.loc:
            self.root(frames[0], 0, 0, 0); self.loc['root'][0].compile(); self.loc['root'][1].compile(); self.loc['root'][2].compile()
            path = 'pose.bones["root"].location'
            for i in range(3):
                fc = action.fcurve_ensure_for_datablock(rig, path, index=i)
                self._write(fc, [(f, 0.0) for f in frames])
        if self.obj_loc[0].keys:
            for i in range(3):
                fc = action.fcurve_ensure_for_datablock(rig, 'location', index=i)
                self._write(fc, [(f, self.obj_loc[i](f)) for f in frames])
        if self.obj_rot.keys:
            fc = action.fcurve_ensure_for_datablock(rig, 'rotation_euler', index=2)
            self._write(fc, [(f, R(self.obj_rot(f))) for f in frames])
        self._bake_ik(frames)
        self._bake_face(frames)

    def _bake_face(self, frames):
        if self.body is None or self.body.data.shape_keys is None: return
        kb = self.body.data.shape_keys.key_blocks
        sk = self.body.data.shape_keys
        if sk.animation_data is None: sk.animation_data_create()
        act = sk.animation_data.action
        if act is None:
            act = bpy.data.actions.new(self.body.name + '_face'); sk.animation_data.action = act
        rnd = random.Random(self.seed * 7 + int(frames[0]))
        blink = {f: 0.0 for f in frames}
        for (f0, f1, rate) in self.blink_ranges:
            f = f0 + rnd.randint(5, 40)
            while f < f1:
                # 2 frames close, 1 hold, 4 open  (classic animator blink)
                for df, v in ((0, 0.0), (1, 0.55), (2, 1.0), (3, 1.0), (4, 0.7), (5, 0.4), (6, 0.15), (7, 0.0)):
                    if f + df in blink: blink[f + df] = max(blink[f + df], v)
                f += rnd.randint(*rate)
                if rnd.random() < 0.15: f = f - rate[0] + 12  # occasional double blink
        names = set(self.shape.keys()) | {'eyeBlinkLeft', 'eyeBlinkRight'} | {k.name for k in kb if k.name[:1].islower()}
        for n in names:
            if n not in kb: continue
            ch = self.shape.get(n)
            vals = []
            for f in frames:
                v = ch(f) if ch else 0.0
                if n in ('eyeBlinkLeft', 'eyeBlinkRight'):
                    v = v + (1 - v) * blink[f]
                vals.append((f, max(0.0, min(1.0, v))))
            path = 'key_blocks["%s"].value' % n
            fc = act.fcurve_ensure_for_datablock(sk, path)
            self._write(fc, vals)

    @staticmethod
    def _write(fc, pts):
        # replace keys in the range of pts
        if not pts: return
        f0, f1 = pts[0][0], pts[-1][0]
        existing = [(k.co[0], k.co[1]) for k in fc.keyframe_points if k.co[0] < f0 or k.co[0] > f1]
        allp = sorted(existing + list(pts))
        fc.keyframe_points.clear()
        fc.keyframe_points.add(len(allp))
        flat = []
        for f, v in allp: flat += [f, v]
        fc.keyframe_points.foreach_set('co', flat)
        fc.keyframe_points.foreach_set('interpolation', [0] * len(allp))  # CONSTANT->set below
        for k in fc.keyframe_points: k.interpolation = 'LINEAR'
        fc.update()

    # ------------------------------------------------------------ arm IK
    def setup_arm_ik(self, pole_angle=-90.0):
        rig = self.rig
        coll = rig.users_collection[0]
        if rig.pose.bones['lowerarm02.L'].constraints.get('ArmIK'):
            for side in ('L', 'R'):
                c = rig.pose.bones['lowerarm02.' + side].constraints['ArmIK']
                self.ik_targets[side] = (c.target, c.pole_target, c)
            return
        for side in ('L', 'R'):
            sx = 1 if side == 'L' else -1
            t = bpy.data.objects.new('%s_hand%s' % (rig.name, side), None); coll.objects.link(t)
            p = bpy.data.objects.new('%s_pole%s' % (rig.name, side), None); coll.objects.link(p)
            for e in (t, p):
                e.parent = rig; e.empty_display_size = 0.05; e.hide_render = True
            pb = rig.pose.bones['lowerarm02.' + side]
            c = pb.constraints.new('IK'); c.name = 'ArmIK'
            c.target = t; c.pole_target = p; c.pole_angle = math.radians(pole_angle); c.chain_count = 4
            c.use_stretch = False
            for b in ('upperarm02.', 'lowerarm02.'):
                pb2 = rig.pose.bones[b + side]; pb2.lock_ik_y = False
            self.ik_targets[side] = (t, p, c)
            t.location = rig.data.bones['wrist.' + side].head_local
            p.location = (0.4 * sx, 0.5, 1.15)

    def hand(self, f, side, pos, pole=None, inf=1.0):
        ch = self.hand_ch.setdefault(side, [Channel(), Channel(), Channel()])
        for i in range(3): ch[i].key(f, pos[i])
        self.ik_inf[side].key(f, inf)
        if pole is not None:
            pc = self.pole_ch.setdefault(side, [Channel(), Channel(), Channel()])
            for i in range(3): pc[i].key(f, pole[i])

    def hands(self, f, l=None, r=None, pole_l=None, pole_r=None, mirror=True):
        if l is not None: self.hand(f, 'L', l, pole_l)
        if r is None and l is not None and mirror: r = (-l[0], l[1], l[2])
        if pole_r is None and pole_l is not None and mirror: pole_r = (-pole_l[0], pole_l[1], pole_l[2])
        if r is not None: self.hand(f, 'R', r, pole_r)

    def _bake_ik(self, frames):
        for side, (t, p, c) in self.ik_targets.items():
            for obj, chs in ((t, self.hand_ch.get(side)), (p, self.pole_ch.get(side))):
                if not chs: continue
                for cc in chs: cc.compile()
                if obj.animation_data is None: obj.animation_data_create()
                act = obj.animation_data.action
                if act is None:
                    act = bpy.data.actions.new(obj.name + '_act'); obj.animation_data.action = act
                rt = self.loc.get('root')
                if rt:
                    for cc in rt: cc.compile()
                for i in range(3):
                    fc = act.fcurve_ensure_for_datablock(obj, 'location', index=i)
                    if i == 1 and rt:
                        self._write(fc, [(f, chs[i](f) + rt[1](f)) for f in frames])
                    else:
                        self._write(fc, [(f, chs[i](f)) for f in frames])
            ch = self.ik_inf[side]
            if ch.keys:
                ch.compile()
                act = self.rig.animation_data.action
                fc = act.fcurve_ensure_for_datablock(self.rig, 'pose.bones["lowerarm02.%s"].constraints["ArmIK"].influence' % side)
                self._write(fc, [(f, ch(f)) for f in frames])

    # ------------------------------------------------------------ locomotion
    def leg_ik(self, f, side, ankle_rel, pitch=0.0):
        """ankle_rel: ankle target relative to hip joint in character space (x,y,z). Keys thigh/knee/foot."""
        dy, dz = ankle_rel[1], ankle_rel[2]
        D = math.hypot(dy, dz); D = min(D, self.l1 + self.l2 - 1e-3)
        fwd = -dy
        alpha = math.atan2(fwd, -dz)
        c_t = max(-1, min(1, (self.l1**2 + D**2 - self.l2**2) / (2 * self.l1 * D)))
        c_k = max(-1, min(1, (self.l1**2 + self.l2**2 - D**2) / (2 * self.l1 * self.l2)))
        flex = alpha + math.acos(c_t) - self.thigh_rest
        knee = math.pi - math.acos(c_k) - (self.thigh_rest - self.shin_rest)
        sfx = '.' + side
        self.pose(f, {'upperleg01' + sfx: (-math.degrees(flex), 0, 0) if side == 'L' else (-math.degrees(flex), 0, 0),
                      'lowerleg01' + sfx: (math.degrees(knee), 0, 0),
                      'foot' + sfx: (math.degrees(flex) - math.degrees(knee) + pitch, 0, 0)})

    def walk(self, f0, f1, path, speed=1.35, stride=0.72, ease=12, style=None, phase0=0.0, arm_swing=1.0, hold_end=True):
        """Walk along a world polyline [(x,y),...] from frame f0 to f1 (stops at the end of the path).
        Keys object placement + root + legs + arms + spine every frame."""
        st = dict(bob=0.022, sway=0.018, hip_yaw=5.0, hip_roll=3.0, lean=4.0, arm=16.0, elbow=18.0, head_bob=1.5, step_h=0.07, tired=0.0)
        if style: st.update(style)
        pts = [Vector((p[0], p[1])) for p in path]
        seg = [(pts[i+1] - pts[i]).length for i in range(len(pts) - 1)]
        total = sum(seg)
        def at(d):
            d = max(0.0, min(total, d))
            for i, L in enumerate(seg):
                if d <= L or i == len(seg) - 1:
                    t = d / L if L else 0
                    p = pts[i].lerp(pts[i+1], min(1.0, t)); dirv = (pts[i+1] - pts[i]).normalized()
                    return p, dirv
                d -= L
        # distance as function of frame with accel/decel
        n = f1 - f0
        dist = []
        v = speed / 30.0
        acc = ease
        d = 0.0
        # simulate speed ramp, decelerate so we land exactly at the end
        for i in range(n + 1):
            ramp_in = min(1.0, i / acc) if acc else 1
            remaining = total - d
            ramp_out = min(1.0, max(0.0, remaining / (v * acc * 0.5))) if acc else 1
            sp = v * min(ramp_in, ramp_out ** 0.5 if remaining > 0 else 0)
            d = min(total, d + sp)
            dist.append(d)
        heading_prev = None
        hipx = self.hip_x
        for i in range(n + 1):
            f = f0 + i
            dd = dist[i]
            p, dirv = at(dd)
            heading = math.degrees(math.atan2(dirv.x, -dirv.y))
            if heading_prev is not None:
                while heading - heading_prev > 180: heading -= 360
                while heading - heading_prev < -180: heading += 360
            heading_prev = heading
            moving = 1.0 if i < n and dist[min(n, i+1)] - dd > 1e-5 else (dist[i] - dist[i-1]) / v if i > 0 else 0
            moving = max(0.0, min(1.0, (dist[min(n, i+1)] - dist[max(0, i-1)]) / (2 * v)))
            ph = phase0 + dd / (2 * stride)          # gait cycles
            # pelvis / root
            c = 2 * math.pi * ph
            bob = -st['bob'] * math.cos(2 * c) * moving
            sway = st['sway'] * math.sin(c) * moving
            self.place(f, p.x, p.y, 0.0, heading)
            self.root(f, sway, 0.0, bob - 0.012 * moving - st['tired'] * 0.03)
            leg = {}
            for side, off in (('L', 0.0), ('R', 0.5)):
                lp = (ph + off) % 1.0
                sx = 1 if side == 'L' else -1
                # stance 0..0.6 : foot moves backward relative to hip from +stride/2 to -stride/2
                if lp < 0.6:
                    u = lp / 0.6
                    fy = (0.5 - u) * stride        # forward offset of foot vs hip (char space, forward = +)
                    fz = 0.0
                    pitch = 0.0
                    if u > 0.75: pitch = (u - 0.75) / 0.25 * 28  # heel lift / toe-off
                    if u < 0.12: pitch = -(0.12 - u) / 0.12 * 12  # heel strike
                else:
                    u = (lp - 0.6) / 0.4
                    s_ = 0.5 - 0.5 * math.cos(math.pi * u)
                    fy = (-0.5 + s_) * stride
                    fz = st['step_h'] * math.sin(math.pi * u) ** 1.3
                    pitch = 28 * (1 - u) ** 2 - 10 * math.sin(math.pi * u) * 0.3
                fy *= moving; fz *= moving; pitch *= moving
                ankle = (0, -fy, (self.ankle_z + fz) - (self.hip_z + bob - 0.012 * moving - st['tired'] * 0.03))
                self.leg_ik(f, side, ankle, pitch)
                leg[side] = fy
            # upper body
            yaw = st['hip_yaw'] * math.sin(c) * moving
            roll = st['hip_roll'] * math.sin(c + math.pi / 2) * moving * 0.6
            lean = st['lean'] * moving + st['tired'] * 10
            arm = st['arm'] * arm_swing * moving / 16.0
            if st.get('ik_arms', True) and self.ik_targets:
                for side, sg in (('L', 1), ('R', -1)):
                    sw = math.sin(c) * (1 if side == 'L' else -1) * arm   # +: hand forward
                    hx = sg * (0.215 + 0.01 * abs(sw))
                    hy = -0.03 - 0.13 * sw + 0.01
                    hz = 0.865 + 0.03 * abs(sw) + bob * 0.8 + 0.035 * max(0, sw)
                    if st.get('carry') == side: hy, hz = 0.10, 0.80
                    if st.get('hold') == side: hy, hz = -0.03, 0.84
                    if st.get('push'): hx, hy, hz = sg * 0.24, -0.34, 1.02
                    self.hand(f, side, (hx, hy, hz), (sg * 0.45, 0.55, 1.1))
            self.pose(f, {
                'spine05': (0, roll * 0.5, -yaw * 0.6),
                'spine03': (lean * 0.5, 0, yaw * 0.5),
                'spine02': (lean * 0.3, -roll * 0.3, yaw * 0.6),
                'neck01': (-lean * 0.4 + st['head_bob'] * math.cos(2 * c) * moving * 0.5, 0, -yaw * 0.3),
                'head': (-lean * 0.3, 0, 0),
            })

# ---------------------------------------------------------------- pose library
# Values tuned against the MPFB default_no_toes rig (A-pose rest).
ARMS_DOWN = {'upperarm01.L': (0, 38, 0), 'upperarm01.R': (0, -38, 0)}

STAND = sym({
    'upperarm01.LR': (6, 40, -4), 'lowerarm01.LR': (-12, 0, 0), 'wrist.LR': (0, 0, 0),
    'spine03': (2, 0, 0), 'neck01': (-2, 0, 0), 'head': (2, 0, 0),
})

FINGER_AXIS = 0   # local axis index for finger flexion
FINGER_SIGN = 1.0
def fingers(curl=0.3, thumb=0.2, side='LR', spread=0.0):
    p = {}
    for s in (['.L', '.R'] if side == 'LR' else [side]):
        for a in range(2, 6):
            for j in range(1, 4):
                ang = FINGER_SIGN * curl * (60 if j == 1 else 80 if j == 2 else 50) * (1 + (a - 2) * 0.1)
                v = [0.0, 0.0, 0.0]; v[FINGER_AXIS] = ang
                p['finger%d-%d%s' % (a, j, s)] = tuple(v)
        for j in range(2, 4):
            v = [0.0, 0.0, 0.0]; v[FINGER_AXIS] = FINGER_SIGN * thumb * 35
            p['finger1-%d%s' % (j, s)] = tuple(v)
    return p

RELAX = fingers(0.32, 0.25)
