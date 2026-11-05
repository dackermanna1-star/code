"""Character rig, acting and water-interaction library for "Stranded".

Conventions (armature space, rest pose): the character faces -Y, +X is the
character's LEFT, +Z is up.  Rotations are authored about these axes:
  X+  bend forward / nod down / swing limb backward
  Z+  turn toward the character's left
  Y+  tilt/roll toward the character's left
and converted to each bone's local space, applied in the parent's posed frame.
"""
import bpy, math, random
import numpy as np
from mathutils import Quaternion, Vector, Matrix, Euler

ROOT = '/home/user/code/blender'
CHAR_BLEND = ROOT + '/assets/character.blend'
FPS = 30
AX = {'X': Vector((1, 0, 0)), 'Y': Vector((0, 1, 0)), 'Z': Vector((0, 0, 1))}
CHEST_Z = 1.36   # pivot height in rig space (spine01 head)

def R(axis, deg):
    return Quaternion(AX[axis], math.radians(deg))

def compose(*rots):
    q = Quaternion()
    for r in rots:
        q = r @ q
    return q

def ease(x):  # smootherstep
    x = min(max(x, 0.0), 1.0)
    return x * x * x * (x * (x * 6 - 15) + 10)

def ease_out(x):
    x = min(max(x, 0.0), 1.0); return 1 - (1 - x) ** 3

def ease_in(x):
    x = min(max(x, 0.0), 1.0); return x ** 3

def smooth_noise(t, seed=0, freq=1.0):
    """cheap 1D value noise (smooth, -1..1)"""
    x = t * freq + seed * 17.123
    i = math.floor(x); f = x - i
    def h(n):
        n = (n * 1103515245 + 12345 + seed * 2654435761) & 0x7fffffff
        return (n / 0x7fffffff) * 2 - 1
    u = f * f * (3 - 2 * f)
    return h(i) * (1 - u) + h(i + 1) * u

def fbm(t, seed=0, freq=1.0, octaves=3):
    v = 0; a = 1; s = 0
    for o in range(octaves):
        v += a * smooth_noise(t, seed + o * 31, freq * 2 ** o); s += a; a *= 0.5
    return v / s

# ------------------------------------------------------------------ load
class Castaway:
    def __init__(self, at=(0, 0, 0)):
        with bpy.data.libraries.load(CHAR_BLEND, link=False) as (src, dst):
            dst.collections = ['Castaway']
        self.col = dst.collections[0]
        bpy.data.collections['Character'].children.link(self.col)
        self.rig = bpy.data.objects['Castaway.rig']
        self.body = bpy.data.objects['Castaway.body']
        sc = bpy.context.scene
        self.root = bpy.data.objects.new('CharRoot', None); self.root.empty_display_size = 0.3
        self.pivot = bpy.data.objects.new('CharPivot', None); self.pivot.empty_display_size = 0.2
        for o in (self.root, self.pivot):
            bpy.data.collections['Character'].objects.link(o)
        self.pivot.parent = self.root
        self.rig.parent = self.pivot
        self.rig.location = (0, 0, -CHEST_Z)
        self.root.location = at
        for pb in self.rig.pose.bones:
            pb.rotation_mode = 'QUATERNION'
        self.rest = {b.name: b.matrix_local.to_quaternion() for b in self.rig.data.bones}
        self.keys = self.body.data.shape_keys.key_blocks
        # hair cards / teeth / tongue gain nothing from render subdivision (6s/frame sync)
        for o in self.col.objects:
            if any(k in o.name for k in ('eyebrows', 'eyelashes', 'teeth', 'tongue')):
                for m in list(o.modifiers):
                    if m.type == 'SUBSURF': o.modifiers.remove(m)
        # sunburn reads as pink-red, not orange: soften the multiply tints in the skin group
        g = bpy.data.node_groups.get('Castaway.body')
        if g:
            for n in g.nodes:
                if n.type == 'MIX' and getattr(n, 'data_type', '') == 'RGBA':
                    b = tuple(round(x, 2) for x in n.inputs['B'].default_value[:3])
                    if b == (0.95, 0.45, 0.35): n.inputs['B'].default_value = (1.0, 0.66, 0.6, 1)
                    if b == (0.95, 0.3, 0.22): n.inputs['B'].default_value = (0.97, 0.5, 0.46, 1)
        # faster skin SSS
        for m in bpy.data.materials:
            if m.node_tree is None: continue
            for n in m.node_tree.nodes:
                if n.type == 'BSDF_PRINCIPLED' and hasattr(n, 'subsurface_method'):
                    n.subsurface_method = 'BURLEY'
        for ng in bpy.data.node_groups:
            for n in ng.nodes:
                if n.type == 'BSDF_PRINCIPLED' and hasattr(n, 'subsurface_method'):
                    n.subsurface_method = 'BURLEY'
        # FX anchor for water rings (follows chest in XY)
        self.fx = bpy.data.objects.new('FX_Center', None); bpy.data.collections['FX'].objects.link(self.fx)
        self.fx.parent = self.root
        self.layers = []
        self.face_layers = []
        self.pivot_fn = None
        self.root_fn = None

    # -------------------------------------------------------------- conversion
    def local(self, bone, q_arm):
        r = self.rest[bone]
        return r.inverted() @ q_arm @ r

    # -------------------------------------------------------------- authoring
    def add(self, fn):
        """fn(frame) -> {bone: Quaternion(armature-space)}; layers compose additively."""
        self.layers.append(fn); return fn

    def add_face(self, fn):
        """fn(frame) -> {shapekey: value}; values add then clamp 0..1"""
        self.face_layers.append(fn); return fn

    def bake(self, f0, f1, step=1, cond_fn=None):
        """Evaluate all layers per frame and write keyframes."""
        rig = self.rig
        bones = set()
        for f in range(f0, f1 + 1, step):
            acc = {}
            for fn in self.layers:
                for b, q in fn(f).items():
                    acc[b] = q @ acc.get(b, Quaternion())
            bones |= set(acc.keys())
            for b in bones:
                pb = rig.pose.bones[b]
                pb.rotation_quaternion = self.local(b, acc.get(b, Quaternion()))
                pb.keyframe_insert('rotation_quaternion', frame=f)
            vals = {}
            for fn in self.face_layers:
                for k, v in fn(f).items():
                    vals[k] = vals.get(k, 0.0) + v
            for k, v in vals.items():
                if k in self.keys:
                    self.keys[k].value = min(max(v, 0.0), 1.0)
                    self.keys[k].keyframe_insert('value', frame=f)
            if self.pivot_fn:
                loc, rot = self.pivot_fn(f)
                self.pivot.location = loc; self.pivot.rotation_mode = 'QUATERNION'; self.pivot.rotation_quaternion = rot
                self.pivot.keyframe_insert('location', frame=f); self.pivot.keyframe_insert('rotation_quaternion', frame=f)
            if cond_fn:
                for k, v in cond_fn(f).items():
                    rig[k] = v; rig.keyframe_insert('["%s"]' % k, frame=f)

    def condition(self, frame=None, **kw):
        for k, v in kw.items():
            self.rig[k] = v
            if frame is not None:
                self.rig.keyframe_insert('["%s"]' % k, frame=frame)

# ------------------------------------------------------------------ pose interpolation
class KeyPoses:
    """Key poses with per-bone slerp and easing. poses: list of (frame, {bone: [(axis,deg),...]}, ease_fn)."""
    def __init__(self, keys, mirror_lr=False):
        self.keys = sorted(keys, key=lambda k: k[0])
        self.qs = []
        for fr, pose, *rest in self.keys:
            d = {}
            for b, rots in pose.items():
                d[b] = rots if isinstance(rots, Quaternion) else compose(*[R(a, v) for a, v in rots])
            self.qs.append((fr, d, rest[0] if rest else ease))
        self.bones = set().union(*[set(d.keys()) for _, d, _ in self.qs]) if self.qs else set()

    def __call__(self, f):
        ks = self.qs
        if f <= ks[0][0]: return {b: ks[0][1].get(b, Quaternion()) for b in self.bones}
        if f >= ks[-1][0]: return {b: ks[-1][1].get(b, Quaternion()) for b in self.bones}
        for i in range(len(ks) - 1):
            a, b = ks[i], ks[i + 1]
            if a[0] <= f <= b[0]:
                t = b[2]((f - a[0]) / max(b[0] - a[0], 1e-6))
                return {bn: a[1].get(bn, Quaternion()).slerp(b[1].get(bn, Quaternion()), t) for bn in self.bones}

def weight(fn, wfn):
    """scale a layer by a weight curve wfn(f) in [0,1] (slerp from identity)"""
    def g(f):
        w = wfn(f)
        if w <= 0: return {}
        return {b: Quaternion().slerp(q, w) for b, q in fn(f).items()}
    return g

def ramp(f0, f1, a=0.0, b=1.0, fn=ease):
    def w(f):
        if f <= f0: return a
        if f >= f1: return b
        return a + (b - a) * fn((f - f0) / (f1 - f0))
    return w

def window(f0, f1, fade=8):
    def w(f):
        if f < f0 - fade or f > f1 + fade: return 0.0
        if f < f0: return ease((f - (f0 - fade)) / fade)
        if f > f1: return 1 - ease((f - f1) / fade)
        return 1.0
    return w

# ------------------------------------------------------------------ pose library
SIDE = {'L': 1, 'R': -1}

def arms_down(deg_from_rest=30):
    """bring A-pose arms toward the body (positive = adduct)"""
    return {'upperarm01.L': [('Y', deg_from_rest)], 'upperarm01.R': [('Y', -deg_from_rest)]}

def hand_relaxed(curl=25):
    d = {}
    for s in 'LR':
        for i in range(2, 6):
            for j in (1, 2, 3):
                d['finger%d-%d.%s' % (i, j, s)] = [('X', curl * (0.6 + 0.2 * j) * (1 + 0.08 * (i - 3)))]
        d['finger1-2.%s' % s] = [('X', curl * 0.4)]
    return d

def merge(*poses):
    out = {}
    for p in poses:
        for b, r in p.items():
            out[b] = out.get(b, []) + list(r)
    return out

# ------------------------------------------------------------------ procedural actions
def tread_water(char, f0, f1, speed=1.0, effort=1.0, seed=1, head_up=8.0):
    """Upright: forearms sculling forward under the surface + alternating eggbeater kicks."""
    per = 1.25 / speed
    def fn(f):
        t = f / FPS
        ph = 2 * math.pi * t / per
        e = effort
        d = {}
        for s, sg in SIDE.items():
            o = 0 if s == 'L' else math.pi
            # upper arms near the body, a little forward; forearms forward, sweeping in/out (sculling)
            d['upperarm01.%s' % s] = compose(R('Y', sg * (24 + 6 * e * math.sin(ph + o))), R('X', -22 + 8 * e * math.sin(ph + o + 0.6)))
            d['lowerarm01.%s' % s] = compose(R('X', -22 - 8 * e * math.sin(ph + o + 1.2)), R('Z', sg * (8 + 26 * e * math.sin(ph + o))))
            d['wrist.%s' % s] = compose(R('Y', sg * 25 * e * math.cos(ph + o)), R('X', -10))
            # legs: alternating eggbeater circles
            d['upperleg01.%s' % s] = compose(R('X', -30 - 15 * e * math.sin(ph + o)), R('Y', sg * (12 + 6 * math.cos(ph + o))))
            d['lowerleg01.%s' % s] = R('X', 50 + 28 * e * math.sin(ph + o + 1.4))
            d['foot.%s' % s] = R('X', 25 + 15 * math.sin(ph + o + 2.0))
        d['spine05'] = R('X', 6 + 2 * math.sin(ph * 2))
        d['spine03'] = R('X', 4)
        d['neck01'] = R('X', -head_up * 0.5)
        d['head'] = R('X', -head_up * 0.5)
        return d
    return fn

def float_back(char, sculls=True, spread=1.0, head_back=1.0):
    """Supine 'star' float (pivot handles lying back). Arms out, legs apart, head back, hands sculling gently."""
    def fn(f):
        t = f / FPS
        ph = 2 * math.pi * t / 2.2
        d = {}
        for s, sg in SIDE.items():
            o = 0 if s == 'L' else math.pi * 0.3
            sc_ = 6 * math.sin(ph + o) if sculls else 0
            d['upperarm01.%s' % s] = compose(R('Y', -sg * (30 * spread)), R('X', 10 + sc_))
            d['lowerarm01.%s' % s] = R('X', 38)
            d['wrist.%s' % s] = R('Y', sg * 15 * math.sin(ph + o + 0.5) if sculls else 0)
            d['upperleg01.%s' % s] = compose(R('Y', sg * 16 * spread), R('X', -6))
            d['lowerleg01.%s' % s] = R('X', 10)
            d['foot.%s' % s] = R('X', 30)
        d['neck01'] = R('X', -10 * head_back); d['neck02'] = R('X', -8 * head_back); d['head'] = R('X', -8 * head_back)
        d['spine02'] = R('X', -3)
        return d
    return fn

def swim_crawl(char, rate=0.85, breathe_every=2, effort=1.0):
    """Front crawl in the rest (standing) frame; the pivot lays the body prone.
    Arm angle about X: 180 = overhead (reach), 90 = under the body (pull), 0 = at hip, -90 = over the back (recovery)."""
    per = 1.0 / rate   # seconds per full stroke cycle (both arms)
    def arm_angle(u):
        # u in [0,1): pull phase slower (60%), recovery faster
        if u < 0.6:
            return 180 - 180 * ease(u / 0.6)        # reach -> hip (pull, underwater)
        return 0 - 180 * ease((u - 0.6) / 0.4)      # hip -> over back -> reach (recovery)
    def fn(f):
        t = f / FPS
        u = (t / per) % 1.0
        d = {}
        roll = 0
        for s, sg in SIDE.items():
            uu = (u + (0.0 if s == 'L' else 0.5)) % 1.0
            a = arm_angle(uu)
            rec = uu >= 0.6
            # adduct to the body line, then swing about X (negative X = toward front of body, i.e. under the prone swimmer)
            d['upperarm01.%s' % s] = compose(R('Y', sg * 40), R('X', -a), R('Y', -sg * (24 if rec else 6)))
            bend = (75 * math.sin(math.pi * (uu - 0.6) / 0.4) if rec else 35 * math.sin(math.pi * uu / 0.6))
            d['lowerarm01.%s' % s] = R('X', 42 - bend)
            d['wrist.%s' % s] = R('X', -10)
            if s == 'L': roll += 32 * math.sin(2 * math.pi * uu - 0.6)
        kick = 2 * math.pi * t / (per / 3)
        for s, sg in SIDE.items():
            o = 0 if s == 'L' else math.pi
            d['upperleg01.%s' % s] = R('X', 14 * math.sin(kick + o) * effort)
            d['lowerleg01.%s' % s] = R('X', 12 + 14 * max(0, math.sin(kick + o + 0.8)))
            d['foot.%s' % s] = R('X', 45)
        d['spine04'] = R('Z', roll * 0.25); d['spine02'] = R('Z', roll * 0.3)
        # breathe to the left every `breathe_every` strokes: head turns with the roll
        cyc = int(t / per)
        br = (cyc % breathe_every == 0)
        hb = 0.0
        if br:
            hb = max(0.0, math.sin(2 * math.pi * u - 0.8)) ** 1.5 * 70
        d['neck02'] = R('Z', hb * 0.4); d['head'] = compose(R('Z', hb * 0.6), R('X', -12))
        d['_roll'] = roll
        return d
    def wrap(f):
        d = fn(f); d.pop('_roll'); return d
    wrap.roll = lambda f: fn(f)['_roll']
    return wrap

def hug_shiver_pose():
    """arms crossed over chest, shoulders hunched (cold)"""
    d = {}
    for s, sg in SIDE.items():
        d['upperarm01.%s' % s] = compose(R('Y', sg * 38), R('X', -30), R('Z', -sg * 18))
        d['lowerarm01.%s' % s] = compose(R('X', -35), R('Z', -sg * 55))
        d['clavicle.%s' % s] = R('Y', -sg * 6)
    d['spine02'] = R('X', 10); d['neck01'] = R('X', 8)
    return d

def raise_arm_pose(side='R', height=1.0):
    sg = SIDE[side]
    return {'upperarm01.%s' % side: compose(R('Y', -sg * 120 * height), R('X', -20)),
            'lowerarm01.%s' % side: R('X', 30), 'clavicle.%s' % side: R('Y', -sg * 12 * height)}

def cup_hands_pose(stage=0.0):
    """stage 0: hands together in the water in front; 1: raised to the mouth"""
    d = {}
    for s, sg in SIDE.items():
        d['upperarm01.%s' % s] = compose(R('Y', sg * 36), R('X', -25 - 30 * stage), R('Z', -sg * (12 + 8 * stage)))
        d['lowerarm01.%s' % s] = compose(R('X', -5 - 75 * stage), R('Z', -sg * (38 - 8 * stage)))
        d['wrist.%s' % s] = compose(R('Y', sg * 30), R('X', 10 - 25 * stage))
    return d

def tread_bob(f, speed=1.0, amp=0.035):
    per = 1.25 / speed
    return amp * math.sin(2 * math.pi * 2 * (f / FPS) / per)

def breathing(rate_bpm=16, depth=1.0, seed=0, gasp_frames=()):
    def fn(f):
        t = f / FPS
        ph = 2 * math.pi * t * rate_bpm / 60
        b = (math.sin(ph) * 0.5 + 0.5) ** 1.5 * depth
        for g0, g1, gd in gasp_frames:
            if g0 <= f <= g1:
                b += gd * math.sin(math.pi * (f - g0) / max(g1 - g0, 1))
        return {'spine02': R('X', -1.6 * b), 'spine01': R('X', -1.2 * b),
                'clavicle.L': R('Y', -2.0 * b), 'clavicle.R': R('Y', 2.0 * b), 'neck01': R('X', 0.8 * b)}
    return fn

def micro_head(seed=0, amp=2.5, freq=0.35):
    def fn(f):
        t = f / FPS
        return {'head': compose(R('Z', amp * fbm(t, seed, freq)), R('X', amp * 0.6 * fbm(t, seed + 5, freq)), R('Y', amp * 0.4 * fbm(t, seed + 9, freq))),
                'neck02': R('Z', amp * 0.4 * fbm(t, seed + 3, freq * 0.7))}
    return fn

def shiver(intensity_fn, seed=0):
    """fast small tremor of torso/shoulders/jaw (hypothermia)"""
    def fn(f):
        k = intensity_fn(f)
        if k <= 0: return {}
        t = f / FPS
        n = lambda s, fr=11.0: smooth_noise(t, seed + s, fr)
        return {'spine03': compose(R('X', 1.2 * k * n(1)), R('Z', 1.0 * k * n(2))),
                'spine01': R('Y', 1.2 * k * n(3)),
                'clavicle.L': R('Y', -2.5 * k * abs(n(4, 9))), 'clavicle.R': R('Y', 2.5 * k * abs(n(5, 9))),
                'head': compose(R('Z', 1.5 * k * n(6, 13)), R('X', 0.8 * k * n(7, 13))),
                'jaw': R('X', 3.5 * k * (0.5 + 0.5 * n(8, 14)))}
    return fn

def look(eyes_fn):
    """eyes_fn(f) -> (yaw_deg, pitch_deg) for both eyes (positive yaw = character's left, positive pitch = down)"""
    def fn(f):
        y, p = eyes_fn(f)
        q = compose(R('Z', y), R('X', p))
        return {'eye.L': q, 'eye.R': q}
    return fn

def saccades(seed=0, spread=8.0, hold=(12, 40), center=(0, 0)):
    rnd = random.Random(seed)
    pts = []; f = -60
    while f < 6000:
        pts.append((f, rnd.uniform(-spread, spread) + center[0], rnd.uniform(-spread * 0.5, spread * 0.5) + center[1]))
        f += rnd.randint(*hold)
    def fn(f):
        for i in range(len(pts) - 1):
            if pts[i][0] <= f < pts[i + 1][0]:
                a, b = pts[i], pts[i + 1]
                dt = f - a[0]
                prev = pts[i - 1] if i > 0 else a
                k = ease(min(dt / 3.0, 1.0))  # saccades are fast (3 frames)
                return (prev[1] + (a[1] - prev[1]) * k, prev[2] + (a[2] - prev[2]) * k)
        return center
    return fn

def blinks(seed=0, mean_gap=3.2, f0=0, f1=6000, stressed=False):
    rnd = random.Random(seed)
    times = []; f = f0 + rnd.randint(5, 40)
    gap = mean_gap * (0.6 if stressed else 1.0)
    while f < f1:
        times.append(f)
        if rnd.random() < 0.15: times.append(f + 7)   # double blink
        f += int(FPS * rnd.uniform(gap * 0.5, gap * 1.6))
    def fn(f):
        v = 0.0
        for b in times:
            d = f - b
            if 0 <= d <= 7:
                v = max(v, [0.35, 0.85, 1.0, 1.0, 0.75, 0.45, 0.2, 0.05][d])
        return {'eyeBlinkLeft': v, 'eyeBlinkRight': v}
    return fn

def expression(keys):
    """keys: list of (frame, {shape: value}, ease) -> interpolated face layer"""
    ks = sorted(keys, key=lambda k: k[0])
    names = set().union(*[set(k[1].keys()) for k in ks])
    def fn(f):
        if f <= ks[0][0]: return {n: ks[0][1].get(n, 0.0) for n in names}
        if f >= ks[-1][0]: return {n: ks[-1][1].get(n, 0.0) for n in names}
        for i in range(len(ks) - 1):
            a, b = ks[i], ks[i + 1]
            if a[0] <= f <= b[0]:
                e = b[2] if len(b) > 2 else ease
                t = e((f - a[0]) / max(b[0] - a[0], 1))
                return {n: a[1].get(n, 0.0) * (1 - t) + b[1].get(n, 0.0) * t for n in names}
    return fn

FACE = {
    'neutral': {},
    'fear': {'browInnerUp': 0.9, 'browOuterUpLeft': 0.5, 'browOuterUpRight': 0.5, 'eyeWideLeft': 0.7, 'eyeWideRight': 0.7,
             'jawOpen': 0.22, 'mouthStretchLeft': 0.45, 'mouthStretchRight': 0.45},
    'gasp': {'browInnerUp': 0.85, 'eyeWideLeft': 0.85, 'eyeWideRight': 0.85, 'jawOpen': 0.75, 'mouthFunnel': 0.25,
             'browOuterUpLeft': 0.6, 'browOuterUpRight': 0.6},
    'cough': {'eyeSquintLeft': 0.9, 'eyeSquintRight': 0.9, 'eyeBlinkLeft': 0.6, 'eyeBlinkRight': 0.6, 'browDownLeft': 0.7,
              'browDownRight': 0.7, 'jawOpen': 0.45, 'noseSneerLeft': 0.5, 'noseSneerRight': 0.5, 'mouthStretchLeft': 0.3, 'mouthStretchRight': 0.3},
    'effort': {'browDownLeft': 0.5, 'browDownRight': 0.5, 'browInnerUp': 0.4, 'eyeSquintLeft': 0.5, 'eyeSquintRight': 0.5,
               'jawOpen': 0.3, 'mouthStretchLeft': 0.5, 'mouthStretchRight': 0.5},
    'squint': {'eyeSquintLeft': 0.85, 'eyeSquintRight': 0.85, 'cheekSquintLeft': 0.6, 'cheekSquintRight': 0.6,
               'browDownLeft': 0.55, 'browDownRight': 0.55, 'noseSneerLeft': 0.25, 'noseSneerRight': 0.25,
               'eyeBlinkLeft': 0.35, 'eyeBlinkRight': 0.35, 'mouthFrownLeft': 0.2, 'mouthFrownRight': 0.2},
    'disgust': {'noseSneerLeft': 0.85, 'noseSneerRight': 0.85, 'mouthUpperUpLeft': 0.5, 'mouthUpperUpRight': 0.5,
                'browDownLeft': 0.7, 'browDownRight': 0.7, 'eyeSquintLeft': 0.6, 'eyeSquintRight': 0.6,
                'mouthFrownLeft': 0.55, 'mouthFrownRight': 0.55, 'jawOpen': 0.12},
    'spit': {'mouthPucker': 0.6, 'mouthFunnel': 0.5, 'cheekPuff': 0.5, 'browDownLeft': 0.5, 'browDownRight': 0.5,
             'eyeSquintLeft': 0.7, 'eyeSquintRight': 0.7},
    'thirsty': {'browInnerUp': 0.55, 'mouthFrownLeft': 0.3, 'mouthFrownRight': 0.3, 'jawOpen': 0.1, 'mouthRollLower': 0.25,
                'eyeSquintLeft': 0.25, 'eyeSquintRight': 0.25},
    'exhausted': {'eyeBlinkLeft': 0.45, 'eyeBlinkRight': 0.45, 'browInnerUp': 0.45, 'mouthFrownLeft': 0.25,
                  'mouthFrownRight': 0.25, 'jawOpen': 0.1, 'eyeLookDownLeft': 0.2, 'eyeLookDownRight': 0.2},
    'cold': {'mouthStretchLeft': 0.55, 'mouthStretchRight': 0.55, 'browInnerUp': 0.6, 'mouthPressLeft': 0.3,
             'mouthPressRight': 0.3, 'eyeSquintLeft': 0.3, 'eyeSquintRight': 0.3},
    'alarm': {'eyeWideLeft': 0.6, 'eyeWideRight': 0.6, 'browInnerUp': 0.5, 'browOuterUpLeft': 0.4, 'browOuterUpRight': 0.4,
              'mouthClose': 0.0, 'jawOpen': 0.05},
    'hope': {'browInnerUp': 0.7, 'eyeWideLeft': 0.3, 'eyeWideRight': 0.3, 'jawOpen': 0.18, 'mouthSmileLeft': 0.15, 'mouthSmileRight': 0.15},
    'calm_focus': {'browDownLeft': 0.15, 'browDownRight': 0.15, 'mouthPressLeft': 0.25, 'mouthPressRight': 0.25},
}

def face(name, k=1.0):
    return {a: v * k for a, v in FACE[name].items()}

# ------------------------------------------------------------------ buoyancy from the ocean simulation
class OceanProbe:
    """Samples the evaluated ocean surface (render resolution) around a point."""
    def __init__(self, ocean_obj):
        self.ob = ocean_obj
        self.ax = np.array(ocean_obj['grid_axis'])
        self.cx, self.cy = ocean_obj['grid_center']
        self.n = len(self.ax)
        m = ocean_obj.modifiers['OceanSim']
        m.viewport_resolution = m.resolution   # identical spectrum to the render
        for mod in ocean_obj.modifiers:
            if mod.type == 'SOLIDIFY': mod.show_viewport = False

    def indices(self, x, y, radius):
        i0 = np.searchsorted(self.ax, x - self.cx - radius); i1 = np.searchsorted(self.ax, x - self.cx + radius)
        j0 = np.searchsorted(self.ax, y - self.cy - radius); j1 = np.searchsorted(self.ax, y - self.cy + radius)
        jj, ii = np.meshgrid(np.arange(j0, j1), np.arange(i0, i1), indexing='ij')
        return (jj * self.n + ii).ravel()

    def sample(self, frames, xy_fn, radius=0.6):
        sc = bpy.context.scene
        out = []
        for f in frames:
            sc.frame_set(f)
            x, y = xy_fn(f)
            idx = self.indices(x, y, radius)
            dg = bpy.context.evaluated_depsgraph_get()
            me = self.ob.evaluated_get(dg).data
            co = np.empty(len(me.vertices) * 3, np.float32); me.vertices.foreach_get('co', co)
            P = co.reshape(-1, 3)[idx]
            d2 = (P[:, 0] - x) ** 2 + (P[:, 1] - y) ** 2
            w = np.exp(-d2 / (2 * (radius * 0.5) ** 2))
            z = float((P[:, 2] * w).sum() / w.sum())
            A = np.c_[P[:, 0] - x, P[:, 1] - y, np.ones(len(P))]
            sol, *_ = np.linalg.lstsq(A * w[:, None], P[:, 2] * w, rcond=None)
            out.append((f, z, float(sol[0]), float(sol[1])))
        for mod in self.ob.modifiers:
            if mod.type == 'SOLIDIFY': mod.show_viewport = True
        return out

def spring_filter(vals, stiffness=0.25, damping=0.55):
    """critically-damped-ish follower to give the body inertia"""
    out = []; x = vals[0]; v = 0.0
    for target in vals:
        a = stiffness * (target - x) - damping * v
        v += a; x += v
        out.append(x)
    return out

def apply_buoyancy(char, probe, f0, f1, xy_fn=lambda f: (0.0, 0.0), z_offset=0.0, tilt=0.6, inertia=(0.3, 0.55),
                   pad=20, radius=0.6, extra_z=None):
    """Key CharRoot so the body rides the swell (z) and leans with the local slope."""
    frames = list(range(f0 - pad, f1 + 1))
    s = probe.sample(frames, xy_fn, radius)
    zs = spring_filter([v[1] for v in s], *inertia)
    sx = spring_filter([v[2] for v in s], 0.15, 0.6)
    sy = spring_filter([v[3] for v in s], 0.15, 0.6)
    r = char.root
    r.rotation_mode = 'XYZ'
    for (f, *_), z, gx, gy in zip(s, zs, sx, sy):
        if f < f0: continue
        x, y = xy_fn(f)
        ez = extra_z(f) if extra_z else 0.0
        r.location = (x, y, z + z_offset + ez)
        r.rotation_euler = (math.atan(gy) * tilt, -math.atan(gx) * tilt, r.rotation_euler.z)
        r.keyframe_insert('location', frame=f); r.keyframe_insert('rotation_euler', index=0, frame=f); r.keyframe_insert('rotation_euler', index=1, frame=f)
    return s

def surface_height_at(probe, f, x, y):
    return probe.sample([f], lambda _f: (x, y))[0][1]

def ride_swell(cam, probe, f0, f1, amount=0.85, inertia=(0.12, 0.6), min_clear=0.25, pad=15):
    """Make a camera float with the swell (operator in the water): z += filtered water height under it.
    Also guarantees the lens stays min_clear above the local surface."""
    sc = bpy.context.scene
    base = {}
    for f in range(f0 - pad, f1 + 1):
        sc.frame_set(max(f, f0))
        base[f] = cam.matrix_world.translation.copy()
    s = probe.sample(list(range(f0 - pad, f1 + 1)), lambda f: (base[f].x, base[f].y), radius=0.8)
    zs = spring_filter([v[1] for v in s], *inertia)
    for (f, zraw, gx, gy), zf in zip(s, zs):
        if f < f0: continue
        loc = base[f].copy()
        loc.z = max(base[f].z + zf * amount, zraw + min_clear)
        cam.location = loc
        cam.keyframe_insert('location', frame=f)

def arm_ik(char, side, target, pole=None):
    """Two-bone analytic IK in rest armature space: returns {upperarm01, lowerarm01} quaternions placing the wrist
    at `target` (rest-space point, character faces -Y) with the elbow bending toward `pole`."""
    sg = SIDE[side]
    B = char.rig.data.bones
    S = B['upperarm01.%s' % side].head_local.copy(); E = B['lowerarm01.%s' % side].head_local.copy(); W = B['wrist.%s' % side].head_local.copy()
    l1 = (E - S).length; l2 = (W - E).length
    T = Vector(target); d = T - S
    dist = min(max(d.length, abs(l1 - l2) + 1e-3), l1 + l2 - 1e-3)
    dn = d.normalized()
    pole = Vector(pole) if pole is not None else Vector((sg * 0.7, 0.25, -1.0))
    n = dn.cross(pole.normalized())
    if n.length < 1e-6: n = Vector((0, 1, 0))
    n.normalize()
    a = math.acos(min(1.0, max(-1.0, (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist))))
    elbow_dir = Quaternion(n, -a) @ dn
    if (elbow_dir.dot(pole)) < (Quaternion(n, a) @ dn).dot(pole):
        elbow_dir = Quaternion(n, a) @ dn
    Ep = S + elbow_dir * l1
    Tp = S + dn * dist
    fore_dir = (Tp - Ep).normalized()
    q_up = (E - S).normalized().rotation_difference(elbow_dir)
    q_fore = (W - E).normalized().rotation_difference(q_up.inverted() @ fore_dir)
    return {'upperarm01.%s' % side: q_up, 'lowerarm01.%s' % side: q_fore}

def cup_ik(char, stage):
    """Both hands cupped together: stage 0 at the water in front of the chest, 1 at the mouth."""
    d = {}
    for s, sg in SIDE.items():
        t0 = Vector((sg * 0.07, -0.40, 1.47)); t1 = Vector((sg * 0.058, -0.265, 1.55))
        d.update(arm_ik(char, s, t0.lerp(t1, stage), pole=Vector((sg * 0.8, 0.3, -1.0))))
        d['wrist.%s' % s] = compose(R('Y', sg * 8), R('X', -12 - 12 * stage))
        for i in range(2, 6):
            for j in (1, 2, 3):
                d['finger%d-%d.%s' % (i, j, s)] = R('X', 22 + 6 * j)
        d['finger1-2.%s' % s] = R('X', 15)
    return d
