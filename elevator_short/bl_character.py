"""Stylized human character: procedural meshes on an FK hierarchy of pivot empties, plus a face rig
(eyelids, brows, eye look, pupils, mouth shape keys, sweat, blush) and pose/expression libraries."""
import bpy, bmesh, math, random
from mathutils import Vector
from bl_lib import *

# ------------------------------------------------------------------------------ proportions
HIP_Z = 0.93
TORSO = 0.46
NECK = 0.06
HEAD_R = 0.185
HEAD_C = 0.17          # head centre above head pivot
SH_X, SH_Z = 0.205, 0.41
UPPER, FORE = 0.28, 0.25
THIGH, SHIN = 0.42, 0.40
HIP_X = 0.095


class Rig:
    pass


def _mouth_mesh(name, parent, mat, head_scale):
    """Elliptical mouth patch projected onto the head surface, with expression shape keys."""
    N = 28
    W, H = 0.044, 0.004
    cz = 0.075 - HEAD_C        # mouth centre relative to head centre (z)
    sx, sy, sz = head_scale
    R = HEAD_R

    def proj(x, z):
        zz = z + cz
        t = 1 - (x / (R * sx)) ** 2 - (zz / (R * sz)) ** 2
        y = -math.sqrt(max(t, 0.02)) * R * sy
        # jaw ellipsoid (centre (0,-0.02,-0.07) rel. head centre, radii R*.82*(1.05,.95,.8))
        return Vector((x, y - 0.005, zz + HEAD_C))

    def ring(fn):
        pts = []
        for i in range(N):
            a = 2 * math.pi * i / N
            x, z = fn(a)
            pts.append(proj(x, z))
        return pts

    def basis(a):
        return W * math.cos(a), H * math.sin(a)

    shapes = {
        "open": lambda a: (W * 0.9 * math.cos(a), (0.016 if math.sin(a) > 0 else 0.052) * math.sin(a) - 0.008),
        "smile": lambda a: (W * 1.1 * math.cos(a), H * math.sin(a) + 0.020 * (math.cos(a) ** 2) - 0.004
                            - (0.010 * math.sin(a) ** 2 if math.sin(a) < 0 else 0)),
        "frown": lambda a: (W * 0.95 * math.cos(a), H * math.sin(a) - 0.017 * (math.cos(a) ** 2) + 0.004),
        "wide": lambda a: (W * 1.45 * math.cos(a), H * 1.3 * math.sin(a)),
        "o": lambda a: (W * 0.42 * math.cos(a), 0.024 * math.sin(a) - 0.006),
    }
    bm = bmesh.new()
    base = ring(basis)
    vs = [bm.verts.new(p) for p in base]
    c = bm.verts.new(proj(0, 0))
    for i in range(N):
        bm.faces.new((c, vs[i], vs[(i + 1) % N]))
    ob = obj_from_bm(name, bm, mat, parent)
    ob.shape_key_add(name="Basis")
    for key, fn in shapes.items():
        sk = ob.shape_key_add(name=key)
        pts = ring(fn)
        for i in range(N):
            sk.data[i].co = pts[i]
        # centre vertex: average of its ring
        cx = sum((p.x for p in pts)) / N
        czz = sum((p.z for p in pts)) / N
        sk.data[N].co = proj(cx, czz - HEAD_C - cz)
    return ob


def build_character(name, colors, parent=None, hat=False, vest=False, mustache=False):
    r = Rig()
    r.name = name
    skin = mat(name + "_skin", colors["skin"], rough=0.45, sss=0.0, spec=0.4)
    shirt = mat(name + "_shirt", colors["shirt"], rough=0.75)
    pants = noise_mat(name + "_pants", colors["pants"], [c * 0.75 for c in colors["pants"]], scale=60, rough=0.8)
    shoe = mat(name + "_shoe", colors["shoe"], rough=0.45)
    sole = mat(name + "_sole", (0.9, 0.9, 0.88), rough=0.6)
    hair = noise_mat(name + "_hair", colors["hair"], [c * 0.6 for c in colors["hair"]], scale=80, rough=0.45,
                     stretch=(1, 1, 8))
    white = mat(name + "_eyewhite", (0.95, 0.94, 0.92), rough=0.15, coat=0.6)
    iris = mat(name + "_iris", colors["iris"], rough=0.2, coat=1.0)
    pupil = mat(name + "_pupil", (0.005, 0.005, 0.005), rough=0.05, coat=1.0)
    mouthm = mat(name + "_mouth", (0.07, 0.006, 0.01), rough=0.35)
    blushm = mat(name + "_blush", (0.9, 0.15, 0.15), rough=0.5, alpha=0.0)
    sweatm = mat(name + "_sweat", (0.75, 0.88, 1.0), rough=0.02, coat=1.0, alpha=0.75)
    r.mats = dict(skin=skin, shirt=shirt, mouth=mouthm, blush=blushm, sweat=sweatm)

    r.root = empty(name + "_root", parent=parent, size=0.3)
    r.hips = empty(name + "_hips", (0, 0, HIP_Z), r.root)
    r.spine = empty(name + "_spine", (0, 0, 0.0), r.hips)
    # pelvis + torso
    capsule(name + "_pelvis", 0.15, 0.06, pants, r.spine, loc=(0, 0, 0.05), rx=0.16, ry=0.115)
    torso = capsule(name + "_torso", 0.17, 0.34, shirt, r.spine, loc=(0, 0, TORSO - 0.02), rx=0.175, ry=0.125, taper=0.92)
    if vest:
        vm = mat(name + "_vest", (1.0, 0.35, 0.02), rough=0.6)
        stripe = mat(name + "_stripe", (0.85, 0.85, 0.8), rough=0.2, metal=0.6)
        capsule(name + "_vest", 0.18, 0.30, vm, r.spine, loc=(0, 0, TORSO - 0.04), rx=0.183, ry=0.133, taper=0.94)
        for zz in (0.18, 0.28):
            cyl(name + "_stripe%d" % int(zz * 100), 0.181, 0.03, (0, 0, zz), stripe, r.spine).scale = (1.02, 0.74, 1)
    r.neck = empty(name + "_neck", (0, 0, TORSO), r.spine)
    cyl(name + "_neckm", 0.055, 0.12, (0, 0.0, 0.02), skin, r.neck)
    r.head = empty(name + "_head", (0, 0, NECK), r.neck)
    hs = (1.0, 0.97, 1.1)
    sphere(name + "_headm", HEAD_R, (0, 0, HEAD_C), hs, skin, r.head, seg=40, ring=24)
    # jaw/cheeks: slightly wider lower face
    sphere(name + "_nose", 0.03, (0, -HEAD_R * 0.97 - 0.012, HEAD_C - 0.02), (0.85, 1.0, 1.15), skin, r.head)
    for s in (-1, 1):
        sphere(name + "_ear%d" % s, 0.04, (s * HEAD_R * 0.98, 0.0, HEAD_C - 0.01), (0.45, 0.8, 1.1), skin, r.head)
    # hair: shell of a sphere with the face cut away + quiff tufts
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=40, v_segments=24, radius=1.0)
    # hairline: high on the forehead, low at the nape
    kill = [v for v in bm.verts if v.co.z < 0.1 + 0.48 * (-v.co.y)]
    bmesh.ops.delete(bm, geom=kill, context='VERTS')
    for v in bm.verts:
        v.co = Vector((v.co.x * HEAD_R * 1.07 * hs[0], v.co.y * HEAD_R * 1.07 * hs[1],
                       v.co.z * HEAD_R * 1.06 * hs[2] + HEAD_C + 0.01))
    hob = obj_from_bm(name + "_hair", bm, hair, r.head)
    sm = hob.modifiers.new("solid", "SOLIDIFY"); sm.thickness = 0.025; sm.offset = 1
    sb = hob.modifiers.new("sub", "SUBSURF"); sb.levels = 1; sb.render_levels = 1
    for i, (x, y, z, sc) in enumerate([(-0.06, -0.10, 0.37, 0.065), (0.02, -0.12, 0.375, 0.07),
                                       (0.09, -0.09, 0.36, 0.055), (0.0, -0.03, 0.39, 0.085)]):
        t = sphere(name + "_tuft%d" % i, sc, (x, y, z), (1.2, 0.9, 0.6), hair, r.head)
        t.rotation_euler = (rad(-25), rad(10 * (i - 1.5)), 0)
    if hat:
        hm = mat(name + "_hat", (1.0, 0.78, 0.05), rough=0.3, coat=0.5)
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=16, radius=1.0)
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -0.05], context='VERTS')
        for v in bm.verts:
            v.co = Vector((v.co.x * 0.215, v.co.y * 0.23, v.co.z * 0.17 + HEAD_C + 0.07))
        h = obj_from_bm(name + "_hatm", bm, hm, r.head)
        h.modifiers.new("s", "SOLIDIFY").thickness = 0.01
        cyl(name + "_brim", 0.25, 0.012, (0, -0.03, HEAD_C + 0.065), hm, r.head).scale = (0.95, 1.08, 1)
    if mustache:
        capsule(name + "_stache", 0.018, 0.07, hair, r.head, loc=(0.035, -HEAD_R * 0.98, HEAD_C - 0.06),
                down=True).rotation_euler = (0, rad(-80), 0)
    # ---- face rig
    r.eyes, r.lids, r.lowlids, r.brows, r.pupils = [], [], [], [], []
    for s in (-1, 1):
        ex = s * 0.066
        eye_piv = empty(name + "_eye%d" % s, (ex, -HEAD_R * 0.80, HEAD_C + 0.035), r.head, size=0.03)
        sphere(name + "_eyeball%d" % s, 0.043, (0, 0, 0), (1, 1, 1), white, eye_piv, seg=24, ring=12)
        sphere(name + "_iris%d" % s, 0.026, (0, -0.036, 0), (1, 0.35, 1), iris, eye_piv, seg=20, ring=10)
        p = sphere(name + "_pupil%d" % s, 0.0135, (0, -0.0445, 0), (1, 0.3, 1), pupil, eye_piv, seg=16, ring=8)
        # specular glint (tiny emissive dot) makes eyes read alive in close-ups
        g = sphere(name + "_glint%d" % s, 0.005, (0.008, -0.047, 0.01), (1, 0.4, 1),
                   emit_mat(name + "_glintm", (1, 1, 1), 6.0), eye_piv, seg=8, ring=6)
        r.eyes.append(eye_piv)
        r.pupils.append(p)
        lid_piv = empty(name + "_lidp%d" % s, (ex, -HEAD_R * 0.80, HEAD_C + 0.035), r.head, size=0.03)
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=12, radius=0.0505)
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -0.002], context='VERTS')
        lid = obj_from_bm(name + "_lid%d" % s, bm, skin, lid_piv)
        lid.modifiers.new("s", "SOLIDIFY").thickness = 0.004
        r.lids.append(lid_piv)
        low_piv = empty(name + "_lowp%d" % s, (ex, -HEAD_R * 0.80, HEAD_C + 0.035), r.head, size=0.03)
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=12, radius=0.050)
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z > 0.002], context='VERTS')
        lo = obj_from_bm(name + "_lowlid%d" % s, bm, skin, low_piv)
        low_piv.rotation_euler = (rad(60), 0, 0)
        r.lowlids.append(low_piv)
        bp = empty(name + "_browp%d" % s, (ex, -HEAD_R * 0.88, HEAD_C + 0.095), r.head, size=0.03)
        bw = capsule(name + "_brow%d" % s, 0.013, 0.06, hair, bp, loc=(-s * 0.032, 0, 0), rx=0.014, ry=0.01)
        bw.rotation_euler = (0, rad(-90 * s), 0)
        r.brows.append(bp)
        # blush + sweat
        sphere(name + "_blush%d" % s, 0.03, (s * 0.1, -HEAD_R * 0.86, HEAD_C - 0.035), (1.2, 0.3, 0.7), blushm, r.head)
    r.sweat = []
    for i, (x, z) in enumerate([(-0.09, 0.15), (0.11, 0.12), (0.03, 0.2), (0.15, 0.04)]):
        y = -math.sqrt(max(0.0, HEAD_R ** 2 - x ** 2 - (z - 0.0) ** 2 * 0.3)) * 0.98
        d = sphere(name + "_sweat%d" % i, 0.011, (x, y, HEAD_C + z - 0.04), (0.8, 0.6, 1.3), sweatm, r.head, seg=12, ring=8)
        d.hide_render = True
        r.sweat.append(d)
    r.mouth = _mouth_mesh(name + "_mouth", r.head, mouthm, hs)
    r.face = empty(name + "_face", (0, -HEAD_R * 0.95, HEAD_C), r.head, size=0.02)
    # ---- arms
    r.sh, r.el, r.wr, r.hand = {}, {}, {}, {}
    for s, side in ((1, "L"), (-1, "R")):
        sh = empty(f"{name}_sh{side}", (s * SH_X, 0, SH_Z), r.spine)
        sphere(f"{name}_shoulder{side}", 0.075, (0, 0, -0.02), (1, 1, 1), shirt, sh)
        capsule(f"{name}_upper{side}", 0.066, UPPER - 0.02, shirt, sh, loc=(0, 0, -0.01), taper=0.95)
        el = empty(f"{name}_el{side}", (0, 0, -UPPER), sh)
        capsule(f"{name}_fore{side}", 0.05, FORE - 0.03, skin, el, taper=0.85)
        wr = empty(f"{name}_wr{side}", (0, 0, -FORE), el)
        hand = sphere(f"{name}_palm{side}", 0.052, (0, 0, -0.055), (0.8, 0.5, 1.05), skin, wr)
        for i in range(3):
            fx = (i - 1) * 0.022
            capsule(f"{name}_fing{side}{i}", 0.014, 0.045, skin, wr, loc=(fx * 0.9, -0.004, -0.09))
        th = capsule(f"{name}_thumb{side}", 0.016, 0.04, skin, wr, loc=(-s * 0.03, -0.022, -0.035))
        th.rotation_euler = (rad(20), rad(-s * 40), 0)
        r.sh[side], r.el[side], r.wr[side], r.hand[side] = sh, el, wr, hand
    # ---- legs
    r.hip, r.knee, r.ank = {}, {}, {}
    for s, side in ((1, "L"), (-1, "R")):
        hp = empty(f"{name}_hip{side}", (s * HIP_X, 0, -0.03), r.hips)
        capsule(f"{name}_thigh{side}", 0.08, THIGH - 0.02, pants, hp, taper=0.82)
        kn = empty(f"{name}_knee{side}", (0, 0, -THIGH), hp)
        capsule(f"{name}_shin{side}", 0.062, SHIN - 0.04, pants, kn, taper=0.85)
        an = empty(f"{name}_ank{side}", (0, 0, -SHIN), kn)
        box(f"{name}_shoe{side}", (0.105, 0.25, 0.085), (0, -0.05, -0.03), shoe, an, bevel=0.035, segs=3)
        box(f"{name}_sole{side}", (0.11, 0.255, 0.025), (0, -0.05, -0.07), sole, an, bevel=0.01, segs=2)
        r.hip[side], r.knee[side], r.ank[side] = hp, kn, an
    r.joints = {"spine": r.spine, "neck": r.neck, "head": r.head,
                "shL": r.sh["L"], "shR": r.sh["R"], "elL": r.el["L"], "elR": r.el["R"],
                "wrL": r.wr["L"], "wrR": r.wr["R"], "hipL": r.hip["L"], "hipR": r.hip["R"],
                "knL": r.knee["L"], "knR": r.knee["R"], "anL": r.ank["L"], "anR": r.ank["R"]}
    return r


# ------------------------------------------------------------------------------ poses
# Semantic pose values (degrees). Converted to Euler with the sign conventions of this rig
# (character faces -Y; +X is the character's left).
#   spine/neck/head: (lean_fwd, tilt_side, twist)   shoulders: (raise_fwd, out, twist)
#   elbows: bend    wrists: (flex, side, twist)    hips: (raise_fwd, out, twist)   knees: bend   ankles: flex
STAND = dict(spine=(0, 0, 0), neck=(0, 0, 0), head=(0, 0, 0),
             shL=(0, 8, 0), shR=(0, 8, 0), elL=8, elR=8, wrL=(0, 0, 0), wrR=(0, 0, 0),
             hipL=(0, 2, 0), hipR=(0, 2, 0), knL=0, knR=0, anL=0, anR=0)


def _euler(j, v):
    if j in ("spine", "neck", "head"):
        a, b, c = v
        return (rad(a), rad(b), rad(c))
    if j in ("shL", "shR", "hipL", "hipR"):
        a, b, c = v
        s = -1 if j.endswith("L") else 1
        return (rad(-a), rad(s * b), rad(c * -s))
    if j in ("elL", "elR"):
        return (rad(-v), 0, 0)
    if j in ("knL", "knR"):
        return (rad(v), 0, 0)
    if j in ("anL", "anR"):
        return (rad(-v), 0, 0)
    if j in ("wrL", "wrR"):
        a, b, c = v
        return (rad(-a), rad(b), rad(c))


def P(**kw):
    p = dict(STAND)
    p.update(kw)
    return p


POSES = {
    "stand": P(),
    "freefall": P(spine=(-10, 0, 0), head=(-15, 0, 0), shL=(40, 85, 0), shR=(60, 80, 0), elL=60, elR=40,
                  hipL=(30, 15, 0), hipR=(-5, 12, 0), knL=70, knR=50, wrL=(20, 0, 0), wrR=(-20, 0, 0)),
    "freefall2": P(spine=(-5, 5, 0), head=(-20, 5, 0), shL=(70, 75, 0), shR=(30, 95, 0), elL=30, elR=70,
                   hipL=(-5, 18, 0), hipR=(35, 10, 0), knL=40, knR=80),
    "crouch_daze": P(spine=(35, 0, 0), head=(-10, 8, 0), shL=(30, 20, 0), shR=(25, 25, 0), elL=40, elR=50,
                     hipL=(95, 8, 0), hipR=(95, 8, 0), knL=130, knR=130, anL=-30, anR=-30),
    "press": P(spine=(5, 0, -10), head=(5, 0, -15), shR=(80, 15, 0), elR=20, wrR=(10, 0, 0), shL=(10, 10, 0), elL=30),
    "press2": P(spine=(6, 0, -10), head=(5, 0, -15), shR=(72, 22, 0), elR=35, wrR=(15, 0, 0), shL=(10, 10, 0), elL=30),
    "pound": P(spine=(10, 0, 0), head=(10, 0, 0), shL=(120, 10, 0), shR=(110, 15, 0), elL=60, elR=70),
    "defeat": P(spine=(18, 0, 0), neck=(10, 0, 0), head=(20, 0, 0), shL=(-5, 4, 0), shR=(-5, 4, 0), elL=5, elR=5),
    "phone": P(spine=(8, 0, 0), head=(28, 0, 0), shR=(35, 12, 20), elR=95, wrR=(-20, 0, 0),
               shL=(25, 8, -20), elL=80, wrL=(-10, 0, 0)),
    "look_down": P(head=(25, 0, 0), shL=(0, 10, 0), shR=(0, 10, 0)),
    "brace": P(spine=(-5, 0, 0), head=(-10, 0, 0), shL=(10, 45, 0), shR=(10, 45, 0), elL=20, elR=20,
               hipL=(0, 10, 0), hipR=(0, 10, 0)),
    "belly": P(spine=(15, 0, 0), head=(15, 0, 0), shL=(25, 10, -30), shR=(25, 10, -30), elL=95, elR=95),
    "sit_wall": P(spine=(-5, 0, 0), head=(0, 0, 0), hipL=(85, 12, 0), hipR=(85, 12, 0), knL=100, knR=100,
                  anL=-10, anR=-10, shL=(20, 15, 0), shR=(20, 15, 0), elL=40, elR=40),
    "sit_squirm": P(spine=(5, 0, 0), head=(5, 0, 0), hipL=(95, 2, 0), hipR=(95, 2, 0), knL=95, knR=95,
                    shL=(35, 5, -30), shR=(35, 5, -30), elL=60, elR=60),
    "sit_slump": P(spine=(15, 10, 0), neck=(10, 0, 0), head=(15, 15, 0), hipL=(84, 20, 0), hipR=(88, 12, 0),
                   knL=12, knR=28, shL=(10, 15, 0), shR=(5, 10, 0), elL=20, elR=10),
    "headache": P(spine=(12, 0, 0), head=(20, 0, 0), hipL=(84, 15, 0), hipR=(88, 10, 0), knL=15, knR=30,
                  shR=(140, 30, 0), elR=135, wrR=(30, 0, 0), shL=(40, 20, 0), elL=60),
    "fan": P(spine=(-5, 0, 0), head=(-15, 0, 0), shR=(70, 40, 40), elR=110, shL=(15, 10, 0), elL=30,
             hipL=(80, 15, 0), hipR=(80, 15, 0), knL=95, knR=95),
    "fan2": P(spine=(-5, 0, 0), head=(-12, 0, 0), shR=(80, 30, 10), elR=125, shL=(15, 10, 0), elL=30,
              hipL=(80, 15, 0), hipR=(80, 15, 0), knL=95, knR=95),
    "lying": P(head=(0, 0, 15), shL=(10, 95, 0), shR=(5, 80, 0), elL=20, elR=40, hipL=(5, 15, 0), hipR=(0, 10, 0),
               knL=10, knR=25),
    "sit_up_shield": P(spine=(25, 0, 0), head=(-20, 0, 0), hipL=(85, 5, 0), hipR=(85, 5, 0), knL=40, knR=60,
                       shR=(130, 10, 20), elR=110, shL=(-30, 30, 0), elL=10),
    "kneel_reach": P(spine=(15, 0, 0), head=(-30, 0, 0), hipL=(80, 5, 0), hipR=(5, 5, 0), knL=90, knR=100,
                     anR=-30, shR=(150, 10, 0), elR=20, shL=(20, 10, 0), elL=20),
    "drink": P(spine=(-12, 0, 0), neck=(-15, 0, 0), head=(-35, 0, 0), hipL=(80, 5, 0), hipR=(5, 5, 0), knL=90,
               knR=100, anR=-30, shR=(125, 25, 10), elR=135, wrR=(10, 0, 0), shL=(20, 10, 0), elL=20),
    "victory": P(spine=(-8, 0, 0), head=(-15, 0, 0), shL=(160, 25, 0), shR=(160, 25, 0), elL=20, elR=20),
    "victory2": P(spine=(-10, 0, 0), head=(-20, 0, 0), shL=(170, 15, 0), shR=(165, 20, 0), elL=10, elR=15),
    "suspicious": P(spine=(-8, 0, 0), head=(5, 0, 0), shL=(10, 10, 0), shR=(10, 10, 0), elL=15, elR=15),
    "nope": P(spine=(-6, 0, 0), head=(0, 0, 0), shL=(55, 20, 0), shR=(55, 20, 0), elL=60, elR=60,
              wrL=(-60, 0, 0), wrR=(-60, 0, 0)),
    "thumbs": P(spine=(-5, 0, 10), head=(-5, 8, 15), shR=(70, 35, -10), elR=75, wrR=(0, 0, 90),
                shL=(5, 12, 0), elL=15),
    "crouch_work": P(spine=(40, 0, 0), head=(-25, 0, 0), hipL=(110, 10, 0), hipR=(15, 8, 0), knL=115, knR=110,
                     anR=-40, shR=(90, 10, 0), elR=40, shL=(70, 15, 0), elL=60),
    "tech_offer": P(spine=(45, 0, 0), head=(-30, 0, 0), hipL=(110, 10, 0), hipR=(15, 8, 0), knL=115, knR=110,
                    anR=-40, shR=(110, 5, 0), elR=10, shL=(40, 15, 0), elL=60),
    "pat": P(spine=(0, 0, 0), head=(0, 0, 15), shL=(5, 10, 0), elL=10, shR=(80, -30, 0), elR=40),
    "thumbs_tech": P(shR=(60, 20, 0), elR=80, wrR=(0, 0, 90), head=(5, 0, 10)),
}


def key_pose(r, frame, pose, interp=None, overrides=None):
    p = dict(POSES[pose]) if isinstance(pose, str) else dict(pose)
    if overrides:
        p.update(overrides)
    for j, v in p.items():
        ob = r.joints[j]
        ob.rotation_euler = _euler(j, v)
        ob.keyframe_insert("rotation_euler", frame=frame)
        if interp:
            for fc in fcurves(ob):
                if fc.data_path == "rotation_euler":
                    for k in fc.keyframe_points:
                        if int(round(k.co.x)) == frame:
                            k.interpolation = interp


def blend_pose(a, b, t):
    pa = POSES[a] if isinstance(a, str) else a
    pb = POSES[b] if isinstance(b, str) else b
    out = {}
    for j in pa:
        va, vb = pa[j], pb[j]
        if isinstance(va, tuple):
            out[j] = tuple(x + (y - x) * t for x, y in zip(va, vb))
        else:
            out[j] = va + (vb - va) * t
    return out


def key_root(r, frame, loc, rotz=0.0, rotx=0.0, roty=0.0, interp=None, hipz=None):
    r.root.location = loc
    r.root.rotation_euler = (rad(rotx), rad(roty), rad(rotz))
    r.root.keyframe_insert("location", frame=frame)
    r.root.keyframe_insert("rotation_euler", frame=frame)
    r.hips.location = (0, 0, HIP_Z if hipz is None else hipz)
    r.hips.keyframe_insert("location", frame=frame)
    if interp:
        for ob in (r.root, r.hips):
            for fc in fcurves(ob):
                for k in fc.keyframe_points:
                    if int(round(k.co.x)) == frame:
                        k.interpolation = interp


# ------------------------------------------------------------------------------ expressions
#  brow: lift (m), brow angle (deg, + = worried inner-up), lid (deg; -60 wide .. 0 relaxed .. 90 shut),
#  mouth shape-key weights, pupil scale
EXPR = {
    "neutral":   dict(lift=0.0, ang=0, lid=-38, open=0, smile=0.1, frown=0, wide=0, o=0, pupil=1.0),
    "shock":     dict(lift=0.022, ang=8, lid=-70, open=0.75, smile=0, frown=0.2, wide=0.1, o=0.4, pupil=0.65),
    "scream":    dict(lift=0.026, ang=22, lid=-72, open=1.0, smile=0, frown=0.35, wide=0.55, o=0, pupil=0.6),
    "dazed":     dict(lift=0.004, ang=10, lid=12, open=0.3, smile=0, frown=0.2, wide=0, o=0.2, pupil=1.1),
    "worried":   dict(lift=0.012, ang=24, lid=-42, open=0.08, smile=0, frown=0.55, wide=0.15, o=0, pupil=0.9),
    "panic":     dict(lift=0.018, ang=26, lid=-62, open=0.45, smile=0, frown=0.5, wide=0.5, o=0, pupil=0.7),
    "angry":     dict(lift=-0.01, ang=-22, lid=-22, open=0.35, smile=0, frown=0.6, wide=0.6, o=0, pupil=0.9),
    "defeated":  dict(lift=0.006, ang=20, lid=15, open=0, smile=0, frown=0.7, wide=0, o=0, pupil=1.0),
    "grim":      dict(lift=-0.004, ang=10, lid=-8, open=0, smile=0, frown=0.45, wide=0.2, o=0, pupil=1.15),
    "bored":     dict(lift=-0.003, ang=0, lid=28, open=0, smile=0, frown=0.3, wide=0.2, o=0, pupil=1.0),
    "strained":  dict(lift=0.01, ang=25, lid=-15, open=0.05, smile=0.0, frown=0.3, wide=0.9, o=0, pupil=0.9),
    "alarmed":   dict(lift=0.02, ang=15, lid=-68, open=0.2, smile=0, frown=0.2, wide=0.2, o=0.3, pupil=0.7),
    "embarrass": dict(lift=0.012, ang=24, lid=-25, open=0.05, smile=0.45, frown=0, wide=0.9, o=0, pupil=1.0),
    "pained":    dict(lift=-0.004, ang=30, lid=48, open=0.15, smile=0, frown=0.7, wide=0.6, o=0, pupil=1.0),
    "dizzy":     dict(lift=0.008, ang=14, lid=18, open=0.35, smile=0, frown=0.25, wide=0.0, o=0.5, pupil=1.2),
    "tired":     dict(lift=-0.002, ang=14, lid=35, open=0.2, smile=0, frown=0.35, wide=0, o=0, pupil=1.1),
    "hot":       dict(lift=0.004, ang=18, lid=20, open=0.5, smile=0, frown=0.3, wide=0.3, o=0, pupil=1.0),
    "relief":    dict(lift=0.01, ang=10, lid=0, open=0.25, smile=0.6, frown=0, wide=0.2, o=0, pupil=1.1),
    "exhausted": dict(lift=-0.004, ang=18, lid=60, open=0.25, smile=0, frown=0.25, wide=0, o=0, pupil=1.2),
    "closed":    dict(lift=-0.004, ang=10, lid=92, open=0.15, smile=0, frown=0.2, wide=0, o=0, pupil=1.2),
    "squint":    dict(lift=-0.006, ang=-5, lid=52, open=0.1, smile=0, frown=0.4, wide=0.4, o=0, pupil=0.8),
    "hope":      dict(lift=0.016, ang=18, lid=-45, open=0.3, smile=0.2, frown=0, wide=0, o=0.3, pupil=1.25),
    "joy":       dict(lift=0.018, ang=6, lid=-25, open=0.7, smile=1.0, frown=0, wide=0.3, o=0, pupil=1.15),
    "gulp":      dict(lift=0.01, ang=8, lid=60, open=0.0, smile=0, frown=0, wide=0, o=0.9, pupil=1.0),
    "grin":      dict(lift=0.008, ang=-6, lid=-20, open=0.35, smile=1.0, frown=0, wide=0.4, o=0, pupil=1.0),
    "smug":      dict(lift=0.004, ang=-14, lid=-5, open=0.0, smile=0.75, frown=0, wide=0.2, o=0, pupil=1.0),
    "nope":      dict(lift=0.016, ang=-18, lid=-55, open=0.2, smile=0, frown=0.6, wide=0.6, o=0, pupil=0.6),
    "friendly":  dict(lift=0.01, ang=4, lid=-15, open=0.2, smile=0.8, frown=0, wide=0.2, o=0, pupil=1.0),
}


def key_expr(r, frame, name, look=(0, 0), interp=None, overrides=None):
    e = dict(EXPR[name])
    if overrides:
        e.update(overrides)
    for i, s in enumerate((-1, 1)):
        bp = r.brows[i]
        bp.location.z = HEAD_C + 0.095 + e["lift"]
        bp.rotation_euler = (0, rad(s * e["ang"]), 0)
        bp.keyframe_insert("location", frame=frame)
        bp.keyframe_insert("rotation_euler", frame=frame)
        lp = r.lids[i]
        lp.rotation_euler = (rad(e["lid"]), 0, 0)
        lp.keyframe_insert("rotation_euler", frame=frame)
        lo = r.lowlids[i]
        lo.rotation_euler = (rad(62 - max(0, e["lid"] - 20) * 0.3), 0, 0)
        lo.keyframe_insert("rotation_euler", frame=frame)
        ey = r.eyes[i]
        ey.rotation_euler = (rad(look[1]), 0, rad(look[0]))
        ey.keyframe_insert("rotation_euler", frame=frame)
        pu = r.pupils[i]
        pu.scale = (e["pupil"], 1, e["pupil"])
        pu.keyframe_insert("scale", frame=frame)
    keys = r.mouth.data.shape_keys.key_blocks
    for k in ("open", "smile", "frown", "wide", "o"):
        keys[k].value = e[k]
        keys[k].keyframe_insert("value", frame=frame)


def key_blush(r, frame, alpha):
    b = r.mats["blush"].node_tree.nodes["Principled BSDF"].inputs["Alpha"]
    b.default_value = alpha
    b.keyframe_insert("default_value", frame=frame)


def sweat(r, ranges):
    for i, d in enumerate(r.sweat):
        key_vis(d, ranges)
        # drops slide down slowly
        z0 = d.location.z
        for a, b in ranges:
            d.location.z = z0
            d.keyframe_insert("location", frame=a, index=2)
            d.location.z = z0 - 0.03 - 0.01 * i
            d.keyframe_insert("location", frame=b, index=2)
            d.location.z = z0


def blink(r, frames, closed=92):
    """Insert quick blinks on top of the existing eyelid animation."""
    for i in range(2):
        lp = r.lids[i]
        fc = [f for f in fcurves(lp) if f.data_path == "rotation_euler" and f.array_index == 0][0]
        for f in frames:
            v0 = fc.evaluate(f - 1)
            v1 = fc.evaluate(f + 4)
            if math.degrees(v0) > 40:
                continue
            for ff, vv in ((f - 1, v0), (f + 1, rad(closed)), (f + 2, rad(closed)), (f + 4, v1)):
                fc.keyframe_points.insert(ff, vv)


def look(r, frame, yaw, pitch=0):
    for ey in r.eyes:
        ey.rotation_euler = (rad(pitch), 0, rad(yaw))
        ey.keyframe_insert("rotation_euler", frame=frame)


def walk_cycle(r, f0, f1, path, period=16, run=False, stairs=False, interp_root='LINEAR', base_pose=None,
               rot_fn=None, z_fn=None):
    """Keys a walk/run cycle from f0 to f1 while root follows path(t)->(x,y,z,rotz), t in [0,1]."""
    amp_leg = 55 if run else 28
    amp_knee = 95 if run else 45
    amp_arm = 55 if run else 22
    lean = 18 if run else 4
    step = max(2, period // 4)
    f = f0
    while f <= f1:
        t = (f - f0) / max(1, (f1 - f0))
        x, y, z, rz = path(t)
        ph = 2 * math.pi * (f - f0) / period
        s = math.sin(ph)
        c = math.cos(ph)
        bob = (abs(math.sin(ph)) * (0.05 if run else 0.025))
        hipz = HIP_Z - (0.06 if run else 0.0) + bob - (0.02 if stairs else 0)
        key_root(r, f, (x, y, z), rz, interp=interp_root, hipz=hipz)
        lift_extra = 25 if stairs else 0
        pose = P(spine=(lean, 0, -s * 6), head=(-lean * 0.6, 0, s * 4),
                 hipL=(amp_leg * s + lift_extra * max(0, s), 3, 0), hipR=(-amp_leg * s + lift_extra * max(0, -s), 3, 0),
                 knL=amp_knee * max(0, -c) * 0.8 + 10 + (lift_extra if s > 0 else 0),
                 knR=amp_knee * max(0, c) * 0.8 + 10 + (lift_extra if s < 0 else 0),
                 shL=(-amp_arm * s, 10, 0), shR=(amp_arm * s, 10, 0),
                 elL=(80 if run else 20) + 10 * s, elR=(80 if run else 20) - 10 * s)
        if base_pose:
            pose.update(base_pose)
        key_pose(r, f, pose)
        f += step
