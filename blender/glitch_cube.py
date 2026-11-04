"""
GLITCH CUBE - a 60 second procedural Blender animation (Blender 4.5 LTS, EEVEE).

A lone cube in a dark studio starts to rotate, glitches, duplicates itself,
stretches, fractures into floating Voronoi shards, warps the space around it,
loses gravity (then reverses it), moves impossibly, collapses into a
singularity and finally snaps back to its original state.

Everything is generated from this file - no external assets:
  * Voronoi fracture done with bmesh plane bisection
  * Shard motion is a small custom rigid-body/spring simulation baked to keys
  * Glitch system (jitter, RGB ghosts, scanline emission, lens dispersion)
  * Room is a subdivided box with a procedural grid shader that twists,
    displaces and folds itself into a sphere via modifiers
  * Dust motes are a Geometry Nodes field driven by a baked "gravity" value
  * Camera follows a time-parameterised Hermite spline with a dolly-zoom,
    180-degree gravity roll, shake and a whip-pan snap back

Usage:
  blender -b --factory-startup -P glitch_cube.py -- out.blend [preview]
"""

import bpy
import bmesh
import json
import math
import random
import sys
from mathutils import Vector, Quaternion, Matrix, Euler
from mathutils import noise as mnoise

# --------------------------------------------------------------------------
# Timing
# --------------------------------------------------------------------------
FPS = 24
DURATION = 60
F_END = FPS * DURATION            # 1440 frames
FRAMES = list(range(1, F_END + 1))


def T(f):
    """Frame -> seconds."""
    return (f - 1) / FPS


def F(t):
    """Seconds -> frame (int)."""
    return int(round(t * FPS)) + 1


# Story beats (seconds)
T_LIGHT_ON = 0.5
T_ROT = 2.0
T_GLITCH = 6.0
T_DUP = 13.0
T_STRETCH = 16.0
T_ORBIT = 18.4
T_RETRACT = 20.0
T_FRACTURE = 21.0
T_DISTORT = 30.0
T_FALL = 38.0
T_FLIP = 39.5
T_IMPOSSIBLE = 42.0
T_COLLAPSE = 46.0
T_SINGULAR = 49.5
T_SNAP = 52.0
T_ASSEMBLED = 52.5
T_SETTLE = 57.0
T_FADE = 58.5

F_FRACTURE = F(T_FRACTURE)
F_SWAP = F(T_ASSEMBLED) + 1      # first frame the solid cube is back

ROOM_HALF = 10.0
ROOM_H = 5.75
CUBE_SIZE = 1.2
HOME = Vector((0.0, 0.0, 1.6))   # cube centre / collapse centre
N_SHARDS = 42

rng = random.Random(1337)

# --------------------------------------------------------------------------
# Easing helpers
# --------------------------------------------------------------------------


def clamp(x, a=0.0, b=1.0):
    return a if x < a else b if x > b else x


def lerp(a, b, t):
    return a + (b - a) * t


def seg(t, a, b):
    if b <= a:
        return 1.0 if t >= a else 0.0
    return clamp((t - a) / (b - a))


def smooth(x):
    x = clamp(x)
    return x * x * (3 - 2 * x)


def smoother(x):
    x = clamp(x)
    return x * x * x * (x * (6 * x - 15) + 10)


def ease_in(x, p=3):
    return clamp(x) ** p


def ease_out(x, p=3):
    return 1 - (1 - clamp(x)) ** p


def ease_out_back(x, s=1.70158):
    x = clamp(x) - 1
    return 1 + x * x * ((s + 1) * x + s)


def ease_out_expo(x):
    x = clamp(x)
    return 1.0 if x >= 1 else 1 - 2 ** (-10 * x)


def bump(t, a, b):
    """0 -> 1 -> 0 smooth bump over [a, b]."""
    return math.sin(math.pi * seg(t, a, b)) ** 2


def decay(t, t0, tau):
    return math.exp(-(t - t0) / tau) if t >= t0 else 0.0


# --------------------------------------------------------------------------
# Baking helpers (per-frame keys, written with foreach_set for speed)
# --------------------------------------------------------------------------

LINEAR, CONSTANT = 1, 0


def _fcurve(id_data, path, index):
    # Blender 4.4+ uses slotted actions: object + object-data may share one action,
    # so look the curve up in the channelbag of this ID's own slot.
    ad = id_data.animation_data
    fc = None
    for layer in ad.action.layers:
        for strip in layer.strips:
            cb = strip.channelbag(ad.action_slot)
            if cb is not None:
                fc = cb.fcurves.find(path, index=index)
                if fc is not None:
                    break
    if fc is None:
        raise RuntimeError("fcurve not found %s[%d] on %s" % (path, index, id_data.name))
    return fc


def bake(id_data, path, values, f0=1, ncomp=1, interp=LINEAR):
    """values: list (one item per frame starting at f0) of floats or tuples."""
    if id_data.animation_data is None:
        id_data.animation_data_create()
    n = len(values)
    for c in range(ncomp):
        id_data.keyframe_insert(data_path=path, index=(c if ncomp > 1 else -1), frame=f0)
        fc = _fcurve(id_data, path, c if ncomp > 1 else 0)
        kp = fc.keyframe_points
        kp.add(n - len(kp))
        co = []
        for i, v in enumerate(values):
            co.append(f0 + i)
            co.append(float(v[c]) if ncomp > 1 else float(v))
        kp.foreach_set("co", co)
        kp.foreach_set("interpolation", [interp] * n)
        fc.update()


def bake_sparse(id_data, path, pairs, interp=CONSTANT):
    """pairs: [(frame, value), ...] scalar only."""
    if id_data.animation_data is None:
        id_data.animation_data_create()
    id_data.keyframe_insert(data_path=path, frame=pairs[0][0])
    fc = _fcurve(id_data, path, 0)
    kp = fc.keyframe_points
    kp.add(len(pairs) - len(kp))
    co = []
    for f, v in pairs:
        co += [f, float(v)]
    kp.foreach_set("co", co)
    kp.foreach_set("interpolation", [interp] * len(pairs))
    fc.update()


def sock_path(sock):
    return sock.path_from_id() + ".default_value"


def bake_transform(obj, locs, quats, scales, f0=1):
    obj.rotation_mode = "QUATERNION"
    bake(obj, "location", locs, f0, 3)
    bake(obj, "rotation_quaternion", quats, f0, 4)
    bake(obj, "scale", scales, f0, 3)


def fix_quat_signs(qs):
    for i in range(1, len(qs)):
        if qs[i].dot(qs[i - 1]) < 0:
            qs[i] = -qs[i]
    return qs


# --------------------------------------------------------------------------
# Scene setup
# --------------------------------------------------------------------------
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.name = "GlitchCube"
scene.frame_start = 1
scene.frame_end = F_END
scene.render.fps = FPS


def link(o):
    scene.collection.objects.link(o)
    return o


def mesh_object(name, bm, mats=()):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(m)
    return link(bpy.data.objects.new(name, me))


# --------------------------------------------------------------------------
# Shader node helpers
# --------------------------------------------------------------------------


class NB:
    """Tiny node-building helper."""

    def __init__(self, tree):
        self.t = tree
        self.n = tree.nodes
        self.l = tree.links

    def node(self, kind, **props):
        nd = self.n.new(kind)
        for k, v in props.items():
            setattr(nd, k, v)
        return nd

    def put(self, sock, x):
        if isinstance(x, bpy.types.NodeSocket):
            self.l.new(x, sock)
        elif x is not None:
            sock.default_value = x

    def math(self, op, a, b=None, clamp=False):
        nd = self.node("ShaderNodeMath", operation=op, use_clamp=clamp)
        self.put(nd.inputs[0], a)
        if b is not None:
            self.put(nd.inputs[1], b)
        return nd.outputs[0]

    def vmath(self, op, a, b=None, scale=None):
        nd = self.node("ShaderNodeVectorMath", operation=op)
        self.put(nd.inputs[0], a)
        if b is not None:
            self.put(nd.inputs[1], b)
        if scale is not None:
            self.put(nd.inputs["Scale"], scale)
        return nd.outputs[0] if op not in ("LENGTH", "DOT_PRODUCT", "DISTANCE") else nd.outputs[1]

    def value(self, name, v):
        nd = self.node("ShaderNodeValue")
        nd.name = name
        nd.label = name
        nd.outputs[0].default_value = v
        return nd

    def sep(self, v):
        nd = self.node("ShaderNodeSeparateXYZ")
        self.put(nd.inputs[0], v)
        return nd.outputs

    def maprange(self, x, a, b, c, d, interp="LINEAR"):
        nd = self.node("ShaderNodeMapRange", interpolation_type=interp, clamp=True)
        self.put(nd.inputs["Value"], x)
        nd.inputs["From Min"].default_value = a
        nd.inputs["From Max"].default_value = b
        nd.inputs["To Min"].default_value = c
        nd.inputs["To Max"].default_value = d
        return nd.outputs[0]

    def mixrgb(self, fac, a, b, blend="MIX"):
        nd = self.node("ShaderNodeMix", data_type="RGBA", blend_type=blend, clamp_result=False)
        self.put(nd.inputs[0], fac)
        self.put(nd.inputs[6], a)
        self.put(nd.inputs[7], b)
        return nd.outputs[2]

    def emission(self, color, strength):
        nd = self.node("ShaderNodeEmission")
        self.put(nd.inputs["Color"], color)
        self.put(nd.inputs["Strength"], strength)
        return nd.outputs[0]

    def add_shader(self, a, b):
        nd = self.node("ShaderNodeAddShader")
        self.put(nd.inputs[0], a)
        self.put(nd.inputs[1], b)
        return nd.outputs[0]

    def mix_shader(self, fac, a, b):
        nd = self.node("ShaderNodeMixShader")
        self.put(nd.inputs[0], fac)
        self.put(nd.inputs[1], a)
        self.put(nd.inputs[2], b)
        return nd.outputs[0]


def new_material(name, blended=False):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    m.node_tree.nodes.clear()
    if blended:
        m.surface_render_method = "BLENDED"
        m.use_backface_culling = False
    nb = NB(m.node_tree)
    out = nb.node("ShaderNodeOutputMaterial")
    return m, nb, out


def set_input(node, name, value):
    if name in node.inputs:
        node.inputs[name].default_value = value


def principled(nb, base, rough, metal=0.0, coat=0.0):
    p = nb.node("ShaderNodeBsdfPrincipled")
    nb.put(p.inputs["Base Color"], base)
    nb.put(p.inputs["Roughness"], rough)
    nb.put(p.inputs["Metallic"], metal)
    set_input(p, "Coat Weight", coat)
    set_input(p, "Coat Roughness", 0.04)
    return p


def edge_mask(nb, width=0.018):
    """1.0 near the edges of a box, using Generated coordinates (0..1)."""
    tc = nb.node("ShaderNodeTexCoord")
    g = nb.vmath("SUBTRACT", tc.outputs["Generated"], (0.5, 0.5, 0.5))
    g = nb.vmath("ABSOLUTE", g)
    g = nb.vmath("SUBTRACT", (0.5, 0.5, 0.5), g)          # distance to face boundary
    x, y, z = nb.sep(g)
    s = nb.math("ADD", nb.math("LESS_THAN", x, width), nb.math("LESS_THAN", y, width))
    s = nb.math("ADD", s, nb.math("LESS_THAN", z, width))
    return nb.math("SUBTRACT", s, 1.0, clamp=True)


# ---- cube / shard outer skin ---------------------------------------------
def make_skin(name, with_edges):
    m, nb, out = new_material(name)
    tc = nb.node("ShaderNodeTexCoord")
    obj = tc.outputs["Object"]
    rough_noise = nb.node("ShaderNodeTexNoise")
    nb.put(rough_noise.inputs["Vector"], obj)
    rough_noise.inputs["Scale"].default_value = 7.0
    rough = nb.maprange(rough_noise.outputs["Fac"], 0.3, 0.7, 0.12, 0.32)
    p = principled(nb, (0.03, 0.032, 0.038, 1), rough, metal=0.35, coat=0.8)

    # glitch scanlines: thin bands along Z gated by 1D noise, randomly re-seeded every frame
    glitch = nb.value("GlitchAmt", 0.0).outputs[0]
    phase = nb.value("Phase", 0.0).outputs[0]
    _, _, z = nb.sep(obj)
    bands = nb.math("FRACT", nb.math("ADD", nb.math("MULTIPLY", z, 16.0), phase))
    bands = nb.math("GREATER_THAN", bands, 0.80)
    gate_n = nb.node("ShaderNodeTexNoise", noise_dimensions="1D")
    nb.put(gate_n.inputs["W"], nb.math("ADD", nb.math("MULTIPLY", z, 3.0), nb.math("MULTIPLY", phase, 0.37)))
    gate_n.inputs["Scale"].default_value = 2.0
    gate = nb.math("GREATER_THAN", gate_n.outputs["Fac"], 0.52)
    stripes = nb.math("MULTIPLY", bands, gate)
    hue = nb.math("GREATER_THAN", nb.math("FRACT", nb.math("ADD", nb.math("MULTIPLY", z, 5.0), phase)), 0.5)
    col = nb.mixrgb(hue, (0.05, 0.85, 1.0, 1), (1.0, 0.08, 0.55, 1))
    strength = nb.math("MULTIPLY", stripes, nb.math("MULTIPLY", glitch, 14.0))
    nb.put(p.inputs["Emission Color"], col)
    nb.put(p.inputs["Emission Strength"], strength)
    shader = p.outputs[0]
    if with_edges:
        eg = nb.value("EdgeGlow", 0.0).outputs[0]
        em = nb.emission((0.55, 0.9, 1.0, 1), nb.math("MULTIPLY", edge_mask(nb), eg))
        shader = nb.add_shader(shader, em)
    nb.put(out.inputs["Surface"], shader)
    return m


# ---- hot inner core of the shards ----------------------------------------
def make_core():
    m, nb, out = new_material("ShardCore")
    tc = nb.node("ShaderNodeTexCoord")
    obj = tc.outputs["Object"]
    vor = nb.node("ShaderNodeTexVoronoi", feature="DISTANCE_TO_EDGE")
    nb.put(vor.inputs["Vector"], obj)
    vor.inputs["Scale"].default_value = 7.0
    veins = nb.maprange(vor.outputs["Distance"], 0.0, 0.05, 1.0, 0.0, "SMOOTHSTEP")
    n = nb.node("ShaderNodeTexNoise")
    nb.put(n.inputs["Vector"], obj)
    n.inputs["Scale"].default_value = 5.0
    ramp = nb.node("ShaderNodeValToRGB")
    nb.put(ramp.inputs[0], n.outputs["Fac"])
    els = ramp.color_ramp.elements
    els[0].position = 0.35
    els[0].color = (1.0, 0.18, 0.02, 1)
    els[1].position = 0.7
    els[1].color = (1.0, 0.62, 0.2, 1)
    tint = nb.node("ShaderNodeMix", data_type="RGBA", blend_type="MULTIPLY")
    tint.inputs[0].default_value = 1.0
    nb.put(tint.inputs[6], ramp.outputs[0])
    tintc = nb.node("ShaderNodeRGB")
    tintc.name = "CoreTint"
    tintc.outputs[0].default_value = (1, 1, 1, 1)
    nb.put(tint.inputs[7], tintc.outputs[0])
    glow = nb.value("CoreGlow", 6.0).outputs[0]
    mask = nb.math("ADD", nb.math("MULTIPLY", veins, 1.6), 0.05)
    st = nb.math("MULTIPLY", glow, mask)
    p = principled(nb, (0.02, 0.018, 0.02, 1), 0.3, coat=0.5)
    nb.put(p.inputs["Emission Color"], tint.outputs[2])
    nb.put(p.inputs["Emission Strength"], st)
    nb.put(out.inputs["Surface"], p.outputs[0])
    return m


# ---- holographic duplicates ----------------------------------------------
def make_holo():
    m, nb, out = new_material("Holo", blended=True)
    edges = edge_mask(nb, 0.03)
    amt = nb.value("HoloAmt", 1.0).outputs[0]
    lw = nb.node("ShaderNodeLayerWeight")
    lw.inputs["Blend"].default_value = 0.35
    fres = nb.math("MULTIPLY", lw.outputs["Facing"], 0.35)
    em_str = nb.math("MULTIPLY", nb.math("ADD", nb.math("MULTIPLY", edges, 5.0), fres), amt)
    em = nb.emission((0.25, 0.75, 1.0, 1), em_str)
    tr = nb.node("ShaderNodeBsdfTransparent")
    glass = principled(nb, (0.01, 0.015, 0.02, 1), 0.08, metal=0.0)
    body = nb.mix_shader(0.2, tr.outputs[0], glass.outputs[0])
    nb.put(out.inputs["Surface"], nb.add_shader(body, em))
    return m


# ---- additive glows (RGB ghosts, shockwave rings) -------------------------
def make_additive(name, color, strength_name, strength, edges=False):
    m, nb, out = new_material(name, blended=True)
    s = nb.value(strength_name, strength).outputs[0]
    if edges:   # chromatic-split ghosts: bright edges, faint body
        s = nb.math("MULTIPLY", s, nb.math("ADD", nb.math("MULTIPLY", edge_mask(nb, 0.03), 4.0), 0.12))
    tr = nb.node("ShaderNodeBsdfTransparent")
    nb.put(out.inputs["Surface"], nb.add_shader(tr.outputs[0], nb.emission(color, s)))
    return m


def make_emissive(name, color, strength_name, strength):
    m, nb, out = new_material(name)
    s = nb.value(strength_name, strength).outputs[0]
    nb.put(out.inputs["Surface"], nb.emission(color, s))
    return m


# ---- the studio room: dark, glossy floor, hidden procedural grid ----------
def make_room_mat():
    m, nb, out = new_material("Studio")
    attr = nb.node("ShaderNodeAttribute", attribute_name="rest", attribute_type="GEOMETRY")
    rest = attr.outputs["Vector"]
    d = nb.vmath("FRACTION", rest)
    d = nb.vmath("ABSOLUTE", nb.vmath("SUBTRACT", d, (0.5, 0.5, 0.5)))
    x, y, z = nb.sep(d)
    w = 0.022
    lx = nb.maprange(x, 0.0, w, 1.0, 0.0, "SMOOTHSTEP")
    ly = nb.maprange(y, 0.0, w, 1.0, 0.0, "SMOOTHSTEP")
    lz = nb.maprange(z, 0.0, w, 1.0, 0.0, "SMOOTHSTEP")
    grid = nb.math("MAXIMUM", nb.math("MAXIMUM", lx, ly), lz)
    gglow = nb.value("GridGlow", 0.0).outputs[0]

    # expanding shockwave ring painted on the grid
    dist = nb.vmath("DISTANCE", rest, tuple(HOME))
    rr = nb.value("RingRadius", 0.0).outputs[0]
    ra = nb.value("RingAmp", 0.0).outputs[0]
    ring = nb.maprange(nb.math("ABSOLUTE", nb.math("SUBTRACT", dist, rr)), 0.0, 0.9, 1.0, 0.0, "SMOOTHSTEP")
    ring = nb.math("MULTIPLY", ring, ra)
    gl = nb.math("ADD", gglow, ring)
    strength = nb.math("MULTIPLY", grid, nb.math("MULTIPLY", gl, 3.0))
    ringfill = nb.math("MULTIPLY", ring, 0.08)
    strength = nb.math("ADD", strength, ringfill)

    gcol = nb.node("ShaderNodeRGB")
    gcol.name = "GridColor"
    gcol.outputs[0].default_value = (0.25, 0.7, 1.0, 1)

    _, _, rz = nb.sep(rest)
    is_floor = nb.math("LESS_THAN", rz, 0.02)
    rough = nb.math("ADD", nb.math("MULTIPLY", is_floor, -0.5), 0.78)
    fl_noise = nb.node("ShaderNodeTexNoise")
    nb.put(fl_noise.inputs["Vector"], rest)
    fl_noise.inputs["Scale"].default_value = 1.5
    rough = nb.math("ADD", rough, nb.maprange(fl_noise.outputs["Fac"], 0.3, 0.7, -0.05, 0.08))
    p = principled(nb, (0.03, 0.03, 0.033, 1), rough)
    nb.put(p.inputs["Emission Color"], gcol.outputs[0])
    nb.put(p.inputs["Emission Strength"], strength)
    nb.put(out.inputs["Surface"], p.outputs[0])
    return m


# --------------------------------------------------------------------------
# Materials
# --------------------------------------------------------------------------
MAT_CUBE = make_skin("CubeSkin", True)
MAT_SHARD = make_skin("ShardSkin", False)
MAT_CORE = make_core()
MAT_HOLO = make_holo()
MAT_GHOST_R = make_additive("GhostRed", (1.0, 0.08, 0.12, 1), "GhostAmt", 1.2, True)
MAT_GHOST_C = make_additive("GhostCyan", (0.05, 0.75, 1.0, 1), "GhostAmt", 1.2, True)
MAT_RING1 = make_additive("RingFracture", (1.0, 0.55, 0.25, 1), "RingStr", 0.0)
MAT_RING2 = make_additive("RingSnap", (0.5, 0.85, 1.0, 1), "RingStr", 0.0)
MAT_SING = make_emissive("Singularity", (0.85, 0.92, 1.0, 1), "SingStr", 60.0)
MAT_DUST = make_emissive("Dust", (1.0, 0.86, 0.7, 1), "DustStr", 1.4)
MAT_ROOM = make_room_mat()


def matval(mat, name):
    return mat.node_tree.nodes[name].outputs[0]


# --------------------------------------------------------------------------
# Geometry
# --------------------------------------------------------------------------

def build_room():
    """Inward facing subdivided box, with a 'rest' attribute holding world rest positions."""
    bm = bmesh.new()
    step = 0.25

    def grid(origin, u, v, nu, nv):
        verts = [[bm.verts.new(origin + u * (i / nu) + v * (j / nv)) for j in range(nv + 1)] for i in range(nu + 1)]
        for i in range(nu):
            for j in range(nv):
                bm.faces.new((verts[i][j], verts[i + 1][j], verts[i + 1][j + 1], verts[i][j + 1]))

    s = ROOM_HALF
    h = ROOM_H
    n = int(2 * s / step)
    nh = int(round(h / step))
    o = Vector((-s, -s, 0))
    grid(o, Vector((2 * s, 0, 0)), Vector((0, 2 * s, 0)), n, n)                      # floor
    grid(Vector((-s, -s, h)), Vector((2 * s, 0, 0)), Vector((0, 2 * s, 0)), n, n)   # ceiling
    grid(Vector((-s, -s, 0)), Vector((2 * s, 0, 0)), Vector((0, 0, h)), n, nh)      # front
    grid(Vector((-s, s, 0)), Vector((2 * s, 0, 0)), Vector((0, 0, h)), n, nh)       # back
    grid(Vector((-s, -s, 0)), Vector((0, 2 * s, 0)), Vector((0, 0, h)), n, nh)      # left
    grid(Vector((s, -s, 0)), Vector((0, 2 * s, 0)), Vector((0, 0, h)), n, nh)       # right
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    centre = Vector((0, 0, h / 2))
    for f in bm.faces:
        if f.normal.dot(centre - f.calc_center_median()) < 0:
            f.normal_flip()
    rest = [v.co.copy() for v in bm.verts]
    for v in bm.verts:
        v.co -= HOME                      # object origin sits at the cube centre
    obj = mesh_object("Studio", bm, [MAT_ROOM])
    obj.location = HOME
    attr = obj.data.attributes.new("rest", "FLOAT_VECTOR", "POINT")
    attr.data.foreach_set("vector", [c for r in rest for c in r])
    return obj


def cube_bm(size=CUBE_SIZE):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=size)
    return bm


def fracture(size, n, seed):
    """Voronoi fracture of a cube by successive plane bisection."""
    r = random.Random(seed)
    h = size / 2
    pts = []
    while len(pts) < n:
        p = Vector((r.uniform(-h, h), r.uniform(-h, h), r.uniform(-h, h))) * 0.97
        if all((p - q).length > size * 0.09 for q in pts):
            pts.append(p)
    shards = []
    for i, p in enumerate(pts):
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=size)
        for f in bm.faces:
            f.material_index = 0
        others = sorted((q for j, q in enumerate(pts) if j != i), key=lambda q: (q - p).length)
        for q in others:
            no = (q - p).normalized()
            co = (p + q) * 0.5
            if all((v.co - co).dot(no) < 1e-6 for v in bm.verts):
                continue
            res = bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:],
                                         dist=1e-6, plane_co=co, plane_no=no, clear_outer=True)
            cut = [e for e in res["geom_cut"] if isinstance(e, bmesh.types.BMEdge)]
            if cut:
                filled = bmesh.ops.holes_fill(bm, edges=cut, sides=0)
                for f in filled["faces"]:
                    f.material_index = 1
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        cen = sum((v.co for v in bm.verts), Vector()) / len(bm.verts)
        bmesh.ops.translate(bm, vec=-cen, verts=bm.verts)
        verts = [v.co.copy() for v in bm.verts]
        shards.append((bm, cen, verts))
    return shards


def torus_bm(R=1.0, r=0.018, nu=128, nv=8):
    bm = bmesh.new()
    rows = []
    for i in range(nu):
        a = 2 * math.pi * i / nu
        row = []
        for j in range(nv):
            b = 2 * math.pi * j / nv
            row.append(bm.verts.new(((R + r * math.cos(b)) * math.cos(a),
                                     (R + r * math.cos(b)) * math.sin(a),
                                     r * math.sin(b))))
        rows.append(row)
    for i in range(nu):
        for j in range(nv):
            bm.faces.new((rows[i][j], rows[(i + 1) % nu][j], rows[(i + 1) % nu][(j + 1) % nv], rows[i][(j + 1) % nv]))
    return bm


# --------------------------------------------------------------------------
# Build objects
# --------------------------------------------------------------------------
room = build_room()

cube = mesh_object("Cube", cube_bm(), [MAT_CUBE])

ghost_r = mesh_object("GhostRed", cube_bm(), [MAT_GHOST_R])
ghost_c = mesh_object("GhostCyan", cube_bm(), [MAT_GHOST_C])

holo_mesh = bpy.data.meshes.new("HoloCube")
_bm = cube_bm()
_bm.to_mesh(holo_mesh)
_bm.free()
holo_mesh.materials.append(MAT_HOLO)
DUP_AXES = [Vector(a) for a in ((1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1))]
dups = [link(bpy.data.objects.new("Echo%d" % i, holo_mesh)) for i in range(len(DUP_AXES))]

shard_data = fracture(CUBE_SIZE, N_SHARDS, 4242)
shards = []
for i, (bm, cen, verts) in enumerate(shard_data):
    o = mesh_object("Shard%02d" % i, bm, [MAT_SHARD, MAT_CORE])
    shards.append((o, cen, verts))

ring1 = mesh_object("RingFracture", torus_bm(), [MAT_RING1])
ring2 = mesh_object("RingSnap", torus_bm(), [MAT_RING2])

_bm = bmesh.new()
bmesh.ops.create_icosphere(_bm, subdivisions=3, radius=1.0)
sing = mesh_object("Singularity", _bm, [MAT_SING])
sing.data.shade_smooth()


# ---- dust motes (geometry nodes) ------------------------------------------
def build_dust():
    ng = bpy.data.node_groups.new("DustField", "GeometryNodeTree")
    ng.interface.new_socket("Geometry", in_out="INPUT", socket_type="NodeSocketGeometry")
    s_grav = ng.interface.new_socket("Gravity", in_out="INPUT", socket_type="NodeSocketFloat")
    s_col = ng.interface.new_socket("Collapse", in_out="INPUT", socket_type="NodeSocketFloat")
    ng.interface.new_socket("Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")
    nb = NB(ng)
    gin = nb.node("NodeGroupInput")
    gout = nb.node("NodeGroupOutput")
    rv = nb.node("FunctionNodeRandomValue", data_type="FLOAT_VECTOR")
    rv.inputs[0].default_value = (-9.3, -7.2, 0.0)
    rv.inputs[1].default_value = (9.3, 9.3, ROOM_H)
    rv.inputs["Seed"].default_value = 11
    x, y, z = nb.sep(rv.outputs[0])
    z = nb.math("FLOORED_MODULO", nb.math("ADD", z, gin.outputs["Gravity"]), ROOM_H)
    comb = nb.node("ShaderNodeCombineXYZ")
    nb.put(comb.inputs[0], x)
    nb.put(comb.inputs[1], y)
    nb.put(comb.inputs[2], z)
    st = nb.node("GeometryNodeInputSceneTime")
    nz = nb.node("ShaderNodeTexNoise", noise_dimensions="4D")
    nb.put(nz.inputs["Vector"], nb.vmath("SCALE", comb.outputs[0], scale=0.35))
    nb.put(nz.inputs["W"], nb.math("MULTIPLY", st.outputs["Seconds"], 0.06))
    nz.inputs["Scale"].default_value = 1.0
    off = nb.vmath("SCALE", nb.vmath("SUBTRACT", nz.outputs["Color"], (0.5, 0.5, 0.5)), scale=1.4)
    p2 = nb.vmath("ADD", comb.outputs[0], off)
    mix = nb.node("ShaderNodeMix", data_type="VECTOR")
    nb.put(mix.inputs[0], gin.outputs["Collapse"])
    nb.put(mix.inputs[4], p2)
    mix.inputs[5].default_value = tuple(HOME)
    pts = nb.node("GeometryNodePoints")
    pts.inputs["Count"].default_value = 380
    nb.put(pts.inputs["Position"], mix.outputs[1])
    ico = nb.node("GeometryNodeMeshIcoSphere")
    ico.inputs["Radius"].default_value = 1.0
    ico.inputs["Subdivisions"].default_value = 1
    rs = nb.node("FunctionNodeRandomValue", data_type="FLOAT")
    rs.inputs[2].default_value = 0.003
    rs.inputs[3].default_value = 0.009
    rs.inputs["Seed"].default_value = 5
    iop = nb.node("GeometryNodeInstanceOnPoints")
    nb.put(iop.inputs["Points"], pts.outputs[0])
    nb.put(iop.inputs["Instance"], ico.outputs["Mesh"])
    nb.put(iop.inputs["Scale"], rs.outputs[1])
    sm = nb.node("GeometryNodeSetMaterial")
    nb.put(sm.inputs["Geometry"], iop.outputs[0])
    sm.inputs["Material"].default_value = MAT_DUST
    nb.put(gout.inputs[0], sm.outputs[0])
    me = bpy.data.meshes.new("DustMesh")
    obj = link(bpy.data.objects.new("Dust", me))
    mod = obj.modifiers.new("Dust", "NODES")
    mod.node_group = ng
    return obj, mod, s_grav.identifier, s_col.identifier


dust, dust_mod, DUST_GRAV, DUST_COL = build_dust()

# ---- room deformers --------------------------------------------------------
warp_tex = bpy.data.textures.new("Warp", "CLOUDS")
warp_tex.noise_scale = 2.8
warp_tex.noise_depth = 2
warp_driver = link(bpy.data.objects.new("WarpDriver", None))
m_disp = room.modifiers.new("Warp", "DISPLACE")
m_disp.texture = warp_tex
m_disp.texture_coords = "OBJECT"
m_disp.texture_coords_object = warp_driver
m_disp.strength = 0.0
m_twist = room.modifiers.new("Twist", "SIMPLE_DEFORM")
m_twist.deform_method = "TWIST"
m_twist.deform_axis = "Z"
m_twist.angle = 0.0
m_cast = room.modifiers.new("Fold", "CAST")
m_cast.cast_type = "SPHERE"
m_cast.factor = 0.0
m_cast.use_radius_as_size = False

# --------------------------------------------------------------------------
# Lights
# --------------------------------------------------------------------------


def make_light(name, kind, loc, target, color, energy, **kw):
    ld = bpy.data.lights.new(name, kind)
    ld.color = color
    ld.energy = energy
    for k, v in kw.items():
        setattr(ld, k, v)
    o = link(bpy.data.objects.new(name, ld))
    o.location = loc
    d = Vector(target) - Vector(loc)
    o.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    return o


L_KEY = make_light("Key", "SPOT", (2.6, -3.4, 5.3), (0, 0, 1.3), (1.0, 0.93, 0.84), 0,
                   spot_size=math.radians(38), spot_blend=0.35, shadow_soft_size=0.25)
L_RIM_C = make_light("RimCyan", "AREA", (-4.5, 4.0, 2.8), (0, 0, 1.6), (0.15, 0.6, 1.0), 0, size=2.5)
L_RIM_M = make_light("RimMagenta", "AREA", (4.5, 4.0, 2.2), (0, 0, 1.6), (1.0, 0.15, 0.55), 0, size=2.5)
L_TOP = make_light("TopSoft", "AREA", (0, 0, 5.6), (0, 0, 0), (0.85, 0.9, 1.0), 0, size=3.0)
L_FILL = make_light("Fill", "AREA", (-1.5, -8.5, 2.5), (0, 0, 1.6), (0.7, 0.8, 1.0), 0, size=4.0)
L_POOL = make_light("BackdropPool", "SPOT", (0.0, 2.0, 5.4), (0.0, 10.0, 0.8), (0.55, 0.65, 0.85), 0,
                    spot_size=math.radians(70), spot_blend=1.0)
L_CORE = make_light("Core", "POINT", tuple(HOME), tuple(HOME), (1.0, 0.45, 0.15), 0, shadow_soft_size=0.3)
# Only the key light casts shadows: virtual shadow maps dominate EEVEE render time
# on a software GL stack, and one shadow caster reads more graphic anyway.
for _l in (L_RIM_C, L_RIM_M, L_TOP, L_FILL, L_CORE, L_POOL):
    _l.data.use_shadow = False

# --------------------------------------------------------------------------
# Camera
# --------------------------------------------------------------------------
cam_data = bpy.data.cameras.new("Camera")
cam_data.sensor_width = 36
cam_data.clip_start = 0.05
cam_data.clip_end = 120
cam_data.dof.use_dof = True
cam_data.dof.aperture_fstop = 2.4
cam_data.dof.aperture_blades = 7
cam = link(bpy.data.objects.new("Camera", cam_data))
scene.camera = cam

# --------------------------------------------------------------------------
# GLITCH SCHEDULE
# --------------------------------------------------------------------------
glitch_events = []


def add_event(t0, dur, strength, cube_fx=True):
    glitch_events.append(dict(t0=t0, t1=t0 + dur, s=strength, cube=cube_fx, id=len(glitch_events)))


_t = 6.4
while _t < 12.2:
    k = seg(_t, 6.0, 12.2)
    dur = rng.uniform(0.05, 0.12 + 0.18 * k)
    add_event(_t, dur, lerp(0.45, 1.0, k))
    _t += dur + lerp(1.1, 0.18, k) * rng.uniform(0.6, 1.3)
add_event(12.25, 0.75, 1.0)                                     # the big burst
for t0, d, s in ((15.95, 0.12, 0.6), (18.35, 0.1, 0.5), (19.9, 0.12, 0.7)):
    add_event(t0, d, s)
for t0, d, s in ((29.7, 0.22, 0.8), (37.75, 0.2, 0.7), (44.55, 0.75, 0.8), (48.4, 0.1, 0.6), (49.05, 0.08, 0.7)):
    add_event(t0, d, s, cube_fx=False)
add_event(56.1, 0.07, 0.45)                                     # one last wink


def glitch(t, f):
    """Returns (intensity, params) for the active event at time t."""
    for e in glitch_events:
        if e["t0"] <= t < e["t1"]:
            r = random.Random(e["id"] * 1000 + f // 2)
            prm = dict(
                off=Vector((r.uniform(-1, 1), r.uniform(-0.6, 0.6), r.uniform(-1, 1))) * 0.28,
                rot=Euler((r.uniform(-1, 1) * 0.35, r.uniform(-1, 1) * 0.35, r.uniform(-1, 1) * 0.6)),
                scl=Vector((1 + r.uniform(-0.25, 0.6) * (r.random() < 0.5),
                            1 + r.uniform(-0.25, 0.6) * (r.random() < 0.5),
                            1 + r.uniform(-0.25, 0.6) * (r.random() < 0.5))),
                ghost=r.uniform(0.06, 0.28) * (1 if r.random() < 0.5 else -1),
                flick=r.uniform(0.05, 1.4),
                cube=e["cube"],
            )
            return e["s"], prm
    return 0.0, None


GL = [glitch(T(f), f) for f in FRAMES]

# --------------------------------------------------------------------------
# CUBE RIG (virtual transform for cube / ghosts / echoes / reassembly)
# --------------------------------------------------------------------------
W0 = Vector((0.18, 0.28, 0.85))


def ang_vel(t):
    if t < T_ROT:
        return Vector()
    w = W0 * smooth(seg(t, T_ROT, T_GLITCH))
    w = w * (1 + 0.4 * seg(t, T_GLITCH, T_DUP))
    if t >= T_DUP:
        w = w.lerp(Vector((0.7, 0.45, 2.6)), smooth(seg(t, T_DUP, 15.5)))
        w = w.lerp(Vector((0.2, 0.1, 0.5)), smooth(seg(t, T_RETRACT, 20.8)))
    return w


Q_REST = Euler((0.0, 0.0, math.radians(32)), "XYZ").to_quaternion()


def q_home(t):
    """Orientation after the snap back: settles exactly on the opening pose at T_SETTLE."""
    e = ease_out(seg(t, T_SNAP, T_SETTLE), 3)
    yaw = math.radians(32) - math.radians(120) * (1 - e)
    tilt = math.radians(28) * (1 - e) * (1 - e)
    return Euler((tilt, 0.0, yaw), "XZY").to_quaternion()


rig_q, rig_p = [], []
q = Q_REST.copy()
for f in FRAMES:
    t = T(f)
    w = ang_vel(t)
    if w.length > 1e-9:
        q = Quaternion(w.normalized(), w.length / FPS) @ q
    base_q = q.copy()
    if t >= T_SNAP:
        base_q = q_home(t)
    p = HOME + Vector((0, 0, 0.045 * math.sin(2 * math.pi * t / 4.0)))
    s, prm = GL[f - 1]
    if prm and prm["cube"]:
        p = p + prm["off"] * s
        base_q = base_q @ prm["rot"].to_quaternion().slerp(Quaternion(), 1 - s)
    if T_RETRACT + 0.5 <= t < T_FRACTURE:                   # pressure tremble
        r = random.Random(f)
        a = 0.035 * seg(t, T_RETRACT + 0.5, T_FRACTURE)
        p = p + Vector((r.uniform(-a, a), r.uniform(-a, a), r.uniform(-a, a)))
    rig_q.append(base_q)
    rig_p.append(p)
fix_quat_signs(rig_q)


def rig_matrix(i):
    return Matrix.Translation(rig_p[i]) @ rig_q[i].to_matrix().to_4x4()


def cube_scale(t, f):
    s = Vector((1, 1, 1))
    gs, prm = GL[f - 1]
    if prm and prm["cube"]:
        s = Vector(lerp(1, prm["scl"][k], gs) for k in range(3))
    st = smooth(seg(t, 16.3, 17.1)) - smooth(seg(t, 17.8, 18.5))
    if st > 0:
        sz = 1 + 0.75 * st * (1 + 0.12 * math.sin(2 * math.pi * 3.2 * (t - 16.3)))
        sxy = 1 / math.sqrt(sz)
        s = Vector((s.x * sxy, s.y * sxy, s.z * sz))
    if T_RETRACT <= t < T_FRACTURE:
        k = lerp(1.0, 0.86, ease_in(seg(t, T_RETRACT, 20.5)))
        k = lerp(k, 1.12, ease_out(seg(t, 20.5, 20.92)))
        if t >= 20.92:
            k = 1.0
        s = s * k
    if t >= T_ASSEMBLED:
        s = s * (1 + 0.05 * decay(t, T_ASSEMBLED, 0.08) * math.cos(30 * (t - T_ASSEMBLED))
                 + 0.035 * bump(t, T_SETTLE - 0.02, T_SETTLE + 0.25))
    return s


# --------------------------------------------------------------------------
# CAMERA PATH
# --------------------------------------------------------------------------
CAM_A = [  # t, pos, target, lens, roll(deg)
    (0.0, (0.0, -9.2, 2.3), (0, 0, 1.55), 38, 0),
    (6.0, (1.0, -7.3, 2.0), (0, 0, 1.6), 50, 0),
    (10.0, (-1.0, -6.3, 1.5), (0, 0, 1.6), 55, 2),
    (13.0, (-2.7, -5.6, 1.05), (0, 0, 1.7), 40, 0),
    (17.0, (-4.6, -2.6, 2.6), (0, 0, 1.6), 34, -6),
    (20.4, (-2.1, -4.0, 1.9), (0, 0, 1.6), 46, 0),
    (21.6, (-2.6, -5.2, 2.1), (0, 0, 1.8), 34, 0),
    (25.5, (4.2, -5.4, 3.3), (0, 0, 2.0), 27, 4),
    (29.0, (2.0, -4.3, 2.0), (0, 0, 2.0), 20, 0),
    (30.6, (0.0, -3.7, 1.8), (0, 0, 1.95), 16, 0),
    (36.0, (0.0, -9.0, 1.8), (0, 0, 1.95), 38, 0),
    (38.0, (2.6, -7.6, 2.2), (0, 0, 1.2), 26, 0),
    (39.5, (2.2, -7.2, 1.5), (0, 0, 1.0), 24, 0),
    (41.6, (0.6, -7.4, 3.8), (0, 0, 4.7), 24, 180),
    (44.0, (-5.6, -4.6, 3.0), (0, 0, 2.9), 22, 270),
    (46.0, (-3.2, -6.6, 2.1), (0, 0, 2.2), 26, 360),
    (49.5, (0.0, -4.6, 1.75), (0, 0, 1.6), 30, 360),
    (52.0, (0.0, -3.4, 1.65), (0, 0, 1.6), 32, 360),
]
CAM_B = [
    (52.6, (0.0, -8.6, 2.25), (0, 0, 1.6), 44, 0),
    (57.0, (0.55, -6.9, 2.08), (0, 0, 1.6), 52, 0),
    (60.1, (0.7, -6.45, 2.02), (0, 0, 1.6), 54, 0),
]


def _flat(k):
    return [*k[1], *k[2], k[3], k[4]]


def hermite(keys, t):
    if t <= keys[0][0]:
        return _flat(keys[0])
    if t >= keys[-1][0]:
        return _flat(keys[-1])
    i = max(j for j in range(len(keys) - 1) if keys[j][0] <= t)
    k0, k1 = keys[i], keys[i + 1]
    t0, t1 = k0[0], k1[0]
    v0, v1 = _flat(k0), _flat(k1)
    vp = _flat(keys[i - 1]) if i > 0 else v0
    vn = _flat(keys[i + 2]) if i + 2 < len(keys) else v1
    tp = keys[i - 1][0] if i > 0 else t0
    tn = keys[i + 2][0] if i + 2 < len(keys) else t1
    h = t1 - t0
    u = (t - t0) / h
    h00 = 2 * u ** 3 - 3 * u ** 2 + 1
    h10 = u ** 3 - 2 * u ** 2 + u
    h01 = -2 * u ** 3 + 3 * u ** 2
    h11 = u ** 3 - u ** 2
    out = []
    for c in range(len(v0)):
        m0 = (v1[c] - vp[c]) / (t1 - tp) if t1 > tp else 0
        m1 = (vn[c] - v0[c]) / (tn - t0) if tn > t0 else 0
        out.append(h00 * v0[c] + h10 * h * m0 + h01 * v1[c] + h11 * h * m1)
    return out


def shake_amp(t):
    a = 0.0
    a += 0.03 * GL[F(t) - 1][0] if F(t) <= F_END else 0
    a += 0.16 * decay(t, T_FRACTURE, 0.35)
    a += 0.05 * bump(t, T_FALL + 0.9, T_FALL + 1.4)
    a += 0.05 * bump(t, 40.5, 41.0)
    if t < T_SNAP:
        a += 0.09 * ease_in(seg(t, T_COLLAPSE, T_SNAP - 0.05), 2)
    a += 0.2 * decay(t, T_SNAP, 0.25)
    return a


cam_p, cam_q, cam_lens, cam_focus = [], [], [], []
for f in FRAMES:
    t = T(f)
    if t < T_SNAP:
        v = hermite(CAM_A, t)
    else:
        a = hermite(CAM_A, T_SNAP)
        b = hermite(CAM_B, t)
        e = ease_out_expo(seg(t, T_SNAP, CAM_B[0][0]))
        if t < CAM_B[0][0]:
            b = hermite(CAM_B, CAM_B[0][0])
        b[7] = b[7]  # roll
        a[7] = 0.0   # 360 == 0
        v = [lerp(a[c], b[c], e) for c in range(len(a))]
    pos = Vector(v[0:3])
    tgt = Vector(v[3:6])
    lens = v[6]
    roll = math.radians(v[7])
    # dolly zoom (vertigo): keep subject size constant while the camera retreats
    wdz = smooth(seg(t, 30.0, 30.8)) - smooth(seg(t, 35.6, 36.6))
    if wdz > 0:
        lens = lerp(lens, 4.25 * (tgt - pos).length, wdz)
    sa = shake_amp(t)
    if sa > 0:
        nv = mnoise.noise_vector(Vector((t * 7.0, 3.1, 0.7)))
        pos = pos + Vector(nv) * sa
        roll += mnoise.noise(Vector((t * 9.0, 1.7, 5.5))) * sa * 0.6
    d = tgt - pos
    qq = d.to_track_quat("-Z", "Y") @ Quaternion((0, 0, 1), roll)
    cam_p.append(pos)
    cam_q.append(qq)
    cam_lens.append(lens)
    cam_focus.append(d.length)
fix_quat_signs(cam_q)

bake_transform(cam, cam_p, cam_q, [(1, 1, 1)] * F_END)
bake(cam_data, "lens", cam_lens)
bake(cam_data, "dof.focus_distance", cam_focus)

# --------------------------------------------------------------------------
# CUBE, GHOSTS, ECHOES
# --------------------------------------------------------------------------
c_loc, c_q, c_s = [], [], []
g_r, g_c = ([], [], []), ([], [], [])
for i, f in enumerate(FRAMES):
    t = T(f)
    s = cube_scale(t, f)
    c_loc.append(rig_p[i])
    c_q.append(rig_q[i])
    c_s.append(s)
    gs, prm = GL[i]
    right = cam_q[i] @ Vector((1, 0, 0))
    up = cam_q[i] @ Vector((0, 1, 0))
    show = prm is not None and prm["cube"] and (t < T_FRACTURE or t >= F_SWAP / FPS)
    off = prm["ghost"] * gs if show else 0.0
    for (L, Q, S), sign in ((g_r, 1), (g_c, -1)):
        L.append(rig_p[i] + right * off * sign + up * off * 0.15)
        Q.append(rig_q[i])
        S.append(s * (1.0 if show else 0.0001))
bake_transform(cube, c_loc, c_q, c_s)
bake_transform(ghost_r, *g_r)
bake_transform(ghost_c, *g_c)
bake_sparse(cube, "hide_render", [(1, 0), (F_FRACTURE, 1), (F_SWAP, 0)])

# echoes (holographic duplicates)
for di, (obj, ax) in enumerate(zip(dups, DUP_AXES)):
    L, Q, S = [], [], []
    for i, f in enumerate(FRAMES):
        t = T(f)
        emerge = ease_out_back(seg(t, T_DUP + 0.09 * di, T_DUP + 1.1 + 0.09 * di), 2.0)
        st = smooth(seg(t, T_STRETCH, 16.8)) - smooth(seg(t, 18.0, 18.6))
        Ls = 1 + 2.2 * st * (1 + 0.1 * math.sin(2 * math.pi * 3 * (t - T_STRETCH)))
        cross = 0.92 / math.sqrt(Ls)
        d = (0.65 + 0.6 * 0.92 * Ls + 0.15) * emerge
        retract = ease_in(seg(t, T_RETRACT, 20.5), 3)
        d *= 1 - retract
        # orbit: horizontal echoes spin about Z, vertical ones about X (passing through each other)
        ang = 2 * math.pi * smooth(seg(t, T_ORBIT, T_RETRACT)) * (1 if di % 2 == 0 else -1)
        orbit = Quaternion((0, 0, 1), ang) if abs(ax.z) < 0.5 else Quaternion((1, 0, 0), ang)
        axw = orbit @ ax
        spin = Quaternion(ax, 3.0 * (t - T_DUP))
        local_q = orbit @ spin
        # scale along the echo's own axis (ax is its local axis because spin is about ax)
        sc = Vector((cross, cross, cross))
        k = [abs(ax.x), abs(ax.y), abs(ax.z)].index(1.0)
        sc[k] = 0.92 * Ls
        sc = sc * (1 - 0.4 * retract) * min(1.0, emerge * 1.5)
        vis = T_DUP <= t < 20.5
        M = rig_matrix(i) @ Matrix.Translation(axw * d) @ local_q.to_matrix().to_4x4()
        loc, rq, _ = M.decompose()
        L.append(loc)
        Q.append(rq)
        S.append(sc if vis else Vector((1e-4,) * 3))
    fix_quat_signs(Q)
    bake_transform(obj, L, Q, S)
    bake_sparse(obj, "hide_render", [(1, 1), (F(T_DUP), 0), (F(20.5) + 1, 1)])

# --------------------------------------------------------------------------
# SHARD SIMULATION
# --------------------------------------------------------------------------
C_FLOAT = Vector((0, 0, 2.15))
C_KNOT = Vector((0, 0, 2.9))
SUB = 4
DT = 1.0 / (FPS * SUB)


def room_twist(t):
    a = 0.9 * smooth(seg(t, T_DISTORT, 34.0))
    a = lerp(a, -0.45, smooth(seg(t, 34.0, 36.5)))
    a = lerp(a, 0.12, smooth(seg(t, 36.5, 39.0)))
    a = lerp(a, 0.12, 0)
    if t >= T_COLLAPSE:
        a = lerp(0.12, 6 * math.pi, ease_in(seg(t, T_COLLAPSE, T_SINGULAR), 2.5))
    if t >= T_SNAP:
        a = 6 * math.pi * (1 - ease_out(seg(t, T_SNAP, T_SNAP + 0.45), 4))
    return a


def knot(u):
    return Vector((math.sin(u) + 2 * math.sin(2 * u), math.cos(u) - 2 * math.cos(2 * u), -math.sin(3 * u)))


def knot_phase(t):
    """integral of knot speed: forward, then an impossible rewind."""
    def spd(x):
        if 44.6 <= x < 45.3:
            return -3.2
        return 1.15
    # numeric integral at 1/48 s resolution (cheap enough)
    s, x = 0.0, T_IMPOSSIBLE
    while x < t:
        s += spd(x) / 48.0
        x += 1 / 48.0
    return s


KNOT_PHASE = {}

srng = random.Random(99)
shard_state = []
f_frac_i = F_FRACTURE - 1
M0 = rig_matrix(f_frac_i)
for si, (obj, cen, verts) in enumerate(shards):
    dirw = (rig_q[f_frac_i] @ cen)
    dirn = dirw.normalized() if dirw.length > 1e-6 else Vector((0, 0, 1))
    tdir = (dirn + Vector((srng.uniform(-.3, .3), srng.uniform(-.3, .3), srng.uniform(-.2, .35)))).normalized()
    shard_state.append(dict(
        p=M0 @ cen,
        v=dirn * srng.uniform(3.0, 5.5) + Vector((0, 0, 0.6)),
        q=rig_q[f_frac_i].copy(),
        w=Vector((srng.uniform(-1, 1), srng.uniform(-1, 1), srng.uniform(-1, 1))).normalized() * srng.uniform(1.5, 4.5),
        tdir=tdir,
        r=srng.uniform(1.6, 3.3),
        om=srng.uniform(0.12, 0.32) * (1 if srng.random() < 0.7 else -1),
        ph=srng.uniform(0, 2 * math.pi),
        u=2 * math.pi * si / len(shards),
        verts=verts,
        cen=cen,
    ))


def float_target(st, t):
    a = st["om"] * (t - T_FRACTURE)
    base = Quaternion((0, 0, 1), a) @ (st["tdir"] * st["r"])
    p = C_FLOAT + base + Vector((0, 0, 0.18 * math.sin(1.3 * t + st["ph"])))
    if t >= T_DISTORT:
        tau = t - T_DISTORT
        tw = room_twist(t) * ((p.z - HOME.z) / 2.0) + 0.7 * smooth(seg(t, T_DISTORT, 31.5)) * tau
        rel = p - C_FLOAT
        breathe = 1 + 0.28 * math.sin(2.2 * tau + st["ph"]) * smooth(seg(t, 31, 33))
        rel = Quaternion((0, 0, 1), tw) @ Vector((rel.x * breathe, rel.y * breathe, rel.z))
        p = C_FLOAT + rel
    p.z = clamp(p.z, 0.45, ROOM_H - 0.5)
    return p


def lowest_highest(q, verts):
    zs = [(q @ v).z for v in verts]
    return min(zs), max(zs)


shard_tracks = [([], [], []) for _ in shards]
impacts = []   # (time, speed, x) - exported as audio cues
f_snap = F(T_SNAP)
f_end_sim = F_SWAP + 1
collapse_ref = [None] * len(shards)
snap_from = [None] * len(shards)

for f in range(F_FRACTURE, f_end_sim + 1):
    t = T(f)
    for si, st in enumerate(shard_state):
        scale = 1.0
        if t < T_SNAP:
            for sub in range(SUB if f > F_FRACTURE else 0):
                ts = t - (SUB - 1 - sub) * DT
                p, v, q, w = st["p"], st["v"], st["q"], st["w"]
                a = Vector()
                spin_damp = 0.25
                contact = False
                if ts < T_FALL:
                    tgt = float_target(st, ts)
                    k = 7.0 * smooth(seg(ts, T_FRACTURE + 0.25, 23.0))
                    c = 1.6 + 1.6 * seg(ts, T_FRACTURE, 22.5)
                    a = (tgt - p) * k - v * c
                    if ts > T_DISTORT:
                        w = w.lerp(w.normalized() * 2.2, 0.002)
                elif ts < T_IMPOSSIBLE:
                    g = -9.81 if ts < T_FLIP else 9.81
                    a = Vector((0, 0, g)) - v * 0.08
                else:
                    if ts < T_COLLAPSE:
                        kp = KNOT_PHASE.get(round(ts * 48))
                        if kp is None:
                            kp = KNOT_PHASE[round(ts * 48)] = knot_phase(ts)
                        kv = knot(st["u"] + kp)
                        tgt = C_KNOT + Vector((kv.x * 0.85, kv.y * 0.85, kv.z * 1.05))
                        k = 10.0 * smooth(seg(ts, T_IMPOSSIBLE, 43.2))
                        a = (tgt - p) * k - v * (1.2 + 3.0 * seg(ts, T_IMPOSSIBLE, 43.0))
                    else:
                        if collapse_ref[si] is None:
                            collapse_ref[si] = (p - HOME)
                        ref = collapse_ref[si]
                        e = ease_in(seg(ts, T_COLLAPSE, T_SINGULAR - 0.2), 2.2)
                        tgt = HOME + Quaternion((0, 0, 1), 5 * math.pi * e) @ (ref * (1 - e))
                        k = 16.0
                        a = (tgt - p) * k - v * 6.0
                        w = w * (1 + 0.004)
                v = v + a * DT
                p = p + v * DT
                if T_FALL <= ts < T_IMPOSSIBLE + 0.6:
                    zmin, zmax = lowest_highest(q, st["verts"])
                    if p.z + zmin < 0.0:
                        p.z = -zmin
                        if v.z < -1.0:
                            impacts.append((round(ts, 4), -v.z, p.x))
                        if v.z < 0:
                            v.z = -v.z * 0.32
                        v.x *= 0.85
                        v.y *= 0.85
                        contact = True
                    if p.z + zmax > ROOM_H:
                        p.z = ROOM_H - zmax
                        if v.z > 1.0:
                            impacts.append((round(ts, 4), v.z, p.x))
                        if v.z > 0:
                            v.z = -v.z * 0.32
                        v.x *= 0.85
                        v.y *= 0.85
                        contact = True
                if contact:
                    w = w * 0.82
                else:
                    w = w * (1 - spin_damp * DT)
                if w.length > 1e-6:
                    q = (Quaternion(w.normalized(), w.length * DT) @ q).normalized()
                st["p"], st["v"], st["q"], st["w"] = p, v, q, w
            if t >= T_COLLAPSE:
                scale = 1 - 0.97 * ease_in(seg(t, T_COLLAPSE + 0.5, T_SINGULAR - 0.1), 2)
            if t >= T_SINGULAR:
                scale = 0.02
                st["p"] = HOME.copy()
            loc, rq = st["p"].copy(), st["q"].copy()
        else:
            # snap back into the cube (elastic reassembly)
            i = f - 1
            if snap_from[si] is None:
                snap_from[si] = st["q"].copy()
            target = rig_matrix(i) @ st["cen"]
            u = seg(t, T_SNAP, T_ASSEMBLED)
            e = ease_out_back(u, 2.4)
            loc = HOME.lerp(target, e)
            rq = snap_from[si].slerp(rig_q[i], min(1.0, ease_out(u, 3)))
            if u >= 1.0:
                rq = rig_q[i].copy()
                loc = target
            scale = 0.02 + 0.98 * clamp(ease_out(u * 1.6, 3))
        L, Q, S = shard_tracks[si]
        L.append(loc)
        Q.append(rq)
        S.append(Vector((scale,) * 3))

for si, (obj, cen, verts) in enumerate(shards):
    L, Q, S = shard_tracks[si]
    fix_quat_signs(Q)
    bake_transform(obj, L, Q, S, f0=F_FRACTURE)
    bake_sparse(obj, "hide_render", [(1, 1), (F_FRACTURE, 0), (F_SWAP, 1)])

# --------------------------------------------------------------------------
# SINGULARITY, RINGS
# --------------------------------------------------------------------------
sl, sq, ss, sstr = [], [], [], []
for f in FRAMES:
    t = T(f)
    r = 0.0
    r += 0.22 * ease_out(seg(t, 48.6, T_SINGULAR), 2)
    if t >= T_SINGULAR:
        beat = math.exp(-((t - T_SINGULAR) % 0.62) / 0.12)
        r = 0.17 + 0.05 * beat
        r *= 1 - ease_in(seg(t, 51.55, 51.96), 2) * 0.92
    if t >= T_SNAP:
        r = 0.0
    sl.append(HOME)
    sq.append(Quaternion())
    ss.append(Vector((max(r, 1e-4),) * 3))
    sstr.append(60 + 140 * (t >= 51.55 and t < T_SNAP) * seg(t, 51.55, 51.96))
bake_transform(sing, sl, sq, ss)
bake(MAT_SING.node_tree, sock_path(matval(MAT_SING, "SingStr")), sstr)


def ring_track(t0, dur, maxr, peak):
    L, Q, S, E = [], [], [], []
    for f in FRAMES:
        t = T(f)
        u = seg(t, t0, t0 + dur)
        rad = lerp(0.6, maxr, ease_out(u, 3))
        L.append(HOME + Vector((0, 0, -0.1)))
        Q.append(Quaternion())
        S.append(Vector((rad, rad, 1 + 2.5 * (1 - u))))
        E.append(peak * (1 - u) ** 1.5 if t >= t0 else 0.0)
    return L, Q, S, E


L, Q, S, E = ring_track(T_FRACTURE, 0.9, 9.0, 9.0)
bake_transform(ring1, L, Q, S)
bake(MAT_RING1.node_tree, sock_path(matval(MAT_RING1, "RingStr")), E)
L, Q, S, E = ring_track(T_SNAP + 0.04, 0.8, 9.5, 14.0)
bake_transform(ring2, L, Q, S)
bake(MAT_RING2.node_tree, sock_path(matval(MAT_RING2, "RingStr")), E)

# --------------------------------------------------------------------------
# ROOM ANIMATION
# --------------------------------------------------------------------------
tw, ds, cf, rs, wd = [], [], [], [], []
for f in FRAMES:
    t = T(f)
    tw.append(room_twist(t))
    d = 0.75 * smooth(seg(t, T_DISTORT, 33.0))
    d = lerp(d, 0.2, smooth(seg(t, 36.8, 39.0)))
    d += 0.25 * GL[f - 1][0] * (t > T_FRACTURE)
    if t >= T_COLLAPSE:
        d = lerp(0.2, 1.6, smooth(seg(t, T_COLLAPSE, 48.0)))
    if t >= T_SNAP:
        d = 1.6 * (1 - ease_out(seg(t, T_SNAP, T_SNAP + 0.45), 4))
    ds.append(d)
    c = smooth(seg(t, T_COLLAPSE, 48.4))
    if t >= T_SNAP:
        c = 1 - ease_out(seg(t, T_SNAP, T_SNAP + 0.4), 4)
    cf.append(c)
    sc = 1.0
    if t >= 47.4:
        sc = max(0.001, 1 - ease_in(seg(t, 47.4, T_SINGULAR - 0.1), 3))
    if t >= T_SNAP:
        sc = max(0.001, ease_out_back(seg(t, T_SNAP, T_SNAP + 0.42), 1.4))
    rs.append(Vector((sc, sc, sc)))
    wd.append(Vector((0.0, 0.25 * t, 0.35 * t)))
bake(room, 'modifiers["Twist"].angle', tw)
bake(room, 'modifiers["Warp"].strength', ds)
bake(room, 'modifiers["Fold"].factor', cf)
bake(room, "scale", rs, ncomp=3)
bake(warp_driver, "location", wd, ncomp=3)

grid, ringr, ringa, gcol = [], [], [], []
for f in FRAMES:
    t = T(f)
    gs = GL[f - 1][0]
    g = 0.0
    g += 0.25 * gs * (t >= T_GLITCH) * (1 if (f % 3) else 0.3)
    g += 0.04 * seg(t, T_DUP, T_FRACTURE)
    g += 0.12 * seg(t, T_FRACTURE, 25)
    g += 0.45 * smooth(seg(t, T_DISTORT - 0.5, 32))
    g -= 0.25 * smooth(seg(t, 37, 39.5))
    g += 0.5 * smooth(seg(t, T_COLLAPSE, 48))
    if t >= T_SNAP:
        g = 0.9 * decay(t, T_SNAP, 0.5) + 0.25 * gs
    grid.append(max(0.0, g))
    if T_FRACTURE <= t < T_FRACTURE + 2:
        u = seg(t, T_FRACTURE, T_FRACTURE + 1.6)
        ringr.append(lerp(0.5, 18, ease_out(u, 2)))
        ringa.append(2.5 * (1 - u))
    elif t >= T_SNAP:
        u = seg(t, T_SNAP + 0.04, T_SNAP + 1.6)
        ringr.append(lerp(0.5, 18, ease_out(u, 2)))
        ringa.append(3.0 * (1 - u))
    else:
        ringr.append(0.0)
        ringa.append(0.0)
    # grid hue drifts from cyan to violet as space breaks down
    k = smooth(seg(t, 34, 37)) * (t < T_SNAP)
    k2 = smooth(seg(t, T_COLLAPSE, 48.5)) * (t < T_SNAP)
    col = Vector((0.25, 0.7, 1.0)).lerp(Vector((0.65, 0.35, 1.0)), k).lerp(Vector((1.0, 0.45, 0.2)), k2)
    gcol.append((col.x, col.y, col.z, 1.0))
rt = MAT_ROOM.node_tree
bake(rt, sock_path(matval(MAT_ROOM, "GridGlow")), grid)
bake(rt, sock_path(matval(MAT_ROOM, "RingRadius")), ringr)
bake(rt, sock_path(matval(MAT_ROOM, "RingAmp")), ringa)
bake(rt, sock_path(rt.nodes["GridColor"].outputs[0]), gcol, ncomp=4)

# --------------------------------------------------------------------------
# MATERIAL FX: glitch scanlines, edge glow, core glow
# --------------------------------------------------------------------------
gamt, phase, edge, core, holo, ctint = [], [], [], [], [], []
for f in FRAMES:
    t = T(f)
    gs = GL[f - 1][0]
    base = 0.0
    base += 0.03 * seg(t, T_GLITCH, T_DUP) * (t < T_FRACTURE)
    base += 0.5 * smooth(seg(t, T_RETRACT, T_FRACTURE)) * (t < T_FRACTURE + 0.4)
    gamt.append(gs * (0.6 + 0.4 * ((f * 7) % 3 == 0)) + base)
    phase.append(random.Random(f * 31).uniform(0, 50))
    e = 0.0
    e += 0.6 * bump(t, 1.3, 3.2)                         # edges catch the light on reveal
    e += 3.0 * gs * (t < T_FRACTURE or t > T_SNAP)
    e += 6.0 * ease_in(seg(t, T_RETRACT, T_FRACTURE), 2) * (t < T_FRACTURE)
    e += 6.0 * decay(t, T(F_SWAP), 0.3)
    e += 5.0 * math.exp(-((t - T_SETTLE) / 0.12) ** 2)   # the final "click"
    e += 1.4 * bump(t, T_FADE + 0.2, 60.0)               # afterglow while the lights die
    edge.append(e)
    c = 0.0
    if t >= T_FRACTURE:
        c = 3.0 + 25.0 * decay(t, T_FRACTURE, 0.35)
        c *= 1 + 0.5 * smooth(seg(t, T_DISTORT, 33)) - 0.3 * smooth(seg(t, T_FALL, 40))
        c += 4 * smooth(seg(t, T_COLLAPSE, T_SINGULAR))
        c *= 0.6 + 0.4 * (1 - 0.8 * gs * ((f % 2) == 0))
    if t >= T_SNAP:
        c = 12.0 * (1 - seg(t, T_SNAP, T_ASSEMBLED + 0.05))
    core.append(c)
    k = smooth(seg(t, T_DISTORT, 34)) * (t < T_COLLAPSE)
    k2 = smooth(seg(t, T_COLLAPSE, 48))
    tint = Vector((1, 1, 1)).lerp(Vector((0.45, 0.6, 1.6)), k).lerp(Vector((1.2, 0.9, 0.8)), k2)
    ctint.append((tint.x, tint.y, tint.z, 1))
    holo.append(1.0 + 0.8 * bump(t, T_STRETCH, 18.6) + 2 * gs)

for mat in (MAT_CUBE, MAT_SHARD):
    bake(mat.node_tree, sock_path(matval(mat, "GlitchAmt")),
         gamt if mat is MAT_CUBE else [g * (T(i + 1) < 21.6) for i, g in enumerate(gamt)])
    bake(mat.node_tree, sock_path(matval(mat, "Phase")), phase)
bake(MAT_CUBE.node_tree, sock_path(matval(MAT_CUBE, "EdgeGlow")), edge)
bake(MAT_CORE.node_tree, sock_path(matval(MAT_CORE, "CoreGlow")), core)
bake(MAT_CORE.node_tree, sock_path(MAT_CORE.node_tree.nodes["CoreTint"].outputs[0]), ctint, ncomp=4)
bake(MAT_HOLO.node_tree, sock_path(matval(MAT_HOLO, "HoloAmt")), holo)

# --------------------------------------------------------------------------
# DUST: gravity offset (integrated) and collapse
# --------------------------------------------------------------------------
gz, gc = [], []
z = 0.0
for f in FRAMES:
    t = T(f)
    vz = -0.05
    if T_FALL <= t < T_FLIP:
        vz = -0.05 - 2.6 * smooth(seg(t, T_FALL, T_FALL + 0.5))
    elif T_FLIP <= t < T_IMPOSSIBLE:
        vz = lerp(-2.6, 3.2, smooth(seg(t, T_FLIP, T_FLIP + 0.5)))
    elif T_IMPOSSIBLE <= t < T_COLLAPSE:
        vz = lerp(3.2, 0.5, smooth(seg(t, T_IMPOSSIBLE, 43)))
        if 44.6 <= t < 45.3:
            vz = -2.0
    z += vz / FPS
    gz.append(z)
    c = ease_in(seg(t, T_COLLAPSE + 0.3, T_SINGULAR), 2)
    if t >= T_SINGULAR:
        c = 1.0
    if t >= T_SNAP:
        c = 1 - ease_out(seg(t, T_SNAP, T_SNAP + 0.5), 4)
    gc.append(c)
bake(dust, 'modifiers["Dust"]["%s"]' % DUST_GRAV, gz)
bake(dust, 'modifiers["Dust"]["%s"]' % DUST_COL, gc)

# --------------------------------------------------------------------------
# LIGHTING CUES
# --------------------------------------------------------------------------
KEY_E, RIM_E, TOP_E, FILL_E = 2600.0, 380.0, 150.0, 30.0


def switch_on(t):
    """Studio light warming up with a couple of stutters."""
    pat = [(0.0, 0), (0.50, 1), (0.56, 0), (0.78, 0.7), (0.86, 0.1), (1.05, 1)]
    v = 0
    for t0, val in pat:
        if t >= t0:
            v = val
    return v * (0.55 + 0.45 * smooth(seg(t, 1.05, 2.2)))


def switch_off(t):
    pat = [(0.0, 1), (0.0, 1), (0.06, 0), (0.12, 0.6), (0.18, 0.0), (0.30, 0.25), (0.34, 0)]
    v = 1
    for t0, val in pat:
        if t >= T_FADE + t0:
            v = val
    return v


key, rimc, rimm, top, fill, pool, core_e, core_c = [], [], [], [], [], [], [], []
expo, disp, dist = [], [], []
for f in FRAMES:
    t = T(f)
    gs, prm = GL[f - 1]
    flick = prm["flick"] if prm else 1.0
    flick = lerp(1.0, flick, gs)
    master = switch_on(t) * switch_off(t)
    # gloom during the collapse, black during the singularity, pop back on the snap
    gloom = 1 - 0.85 * smooth(seg(t, 47.0, T_SINGULAR))
    if T_SINGULAR <= t < T_SNAP:
        gloom = 0.0
    if t >= T_SNAP:
        gloom = 1.0 + 1.5 * decay(t, T_SNAP, 0.2)
    key.append(KEY_E * master * flick * gloom * (1 - 0.35 * smooth(seg(t, T_DISTORT, 33)) * (t < T_SNAP)))
    rim_k = 0.8 + 0.4 * smooth(seg(t, T_DUP - 1, T_DUP + 1))
    rim_k += 0.8 * smooth(seg(t, T_DISTORT, 33)) * (t < T_SNAP)
    if t >= T_SNAP:
        rim_k = 0.8 + 0.5 * decay(t, T_SNAP, 0.3)
    strobe_c = 1 + 0.6 * math.sin(2 * math.pi * 1.5 * t) * smooth(seg(t, 32, 34)) * (t < T_FALL)
    strobe_m = 1 - 0.6 * math.sin(2 * math.pi * 1.5 * t) * smooth(seg(t, 32, 34)) * (t < T_FALL)
    rimc.append(RIM_E * rim_k * master * flick * gloom * strobe_c)
    rimm.append(RIM_E * rim_k * master * flick * gloom * strobe_m)
    top.append(TOP_E * master * gloom * (1 - 0.6 * smooth(seg(t, T_DISTORT, 31))) * (1 + 0.6 * smooth(seg(t, T_FLIP, 41)) * (t < T_COLLAPSE)))
    fill.append(FILL_E * master * gloom)
    pool.append(900.0 * master * gloom * (1 - 0.7 * smooth(seg(t, T_DISTORT - 1, T_DISTORT + 1)) * (t < T_SNAP)))
    # core light
    ce = 0.0
    if t >= T_RETRACT and t < T_FRACTURE:
        ce = 120 * ease_in(seg(t, T_RETRACT, T_FRACTURE), 2)
    if t >= T_FRACTURE:
        ce = 180 + 1500 * decay(t, T_FRACTURE, 0.3)
        ce *= 1 - 0.5 * smooth(seg(t, T_FALL, 39)) * (t < T_COLLAPSE)
        ce += 900 * smooth(seg(t, T_COLLAPSE, T_SINGULAR))
    if t >= T_SINGULAR:
        beat = math.exp(-((t - T_SINGULAR) % 0.62) / 0.12)
        ce = 400 + 900 * beat
        ce *= 1 - 0.9 * ease_in(seg(t, 51.55, 51.96), 2)
    if t >= T_SNAP:
        ce = 12000 * decay(t, T_SNAP, 0.12)
    core_e.append(ce)
    cc = Vector((1.0, 0.45, 0.15))
    cc = cc.lerp(Vector((0.45, 0.5, 1.0)), smooth(seg(t, T_DISTORT, 34)) * (t < T_COLLAPSE))
    cc = cc.lerp(Vector((0.8, 0.88, 1.0)), smooth(seg(t, T_COLLAPSE, T_SINGULAR)))
    if t >= T_SNAP:
        cc = Vector((0.7, 0.85, 1.0))
    core_c.append(tuple(cc))
    # global exposure: punches on fracture / snap, fade to black at the very end
    ex = 0.0
    ex += 0.3 * decay(t, T_FRACTURE, 0.15)
    ex += 1.6 * decay(t, T_SNAP, 0.12)
    ex -= 9.0 * ease_in(seg(t, 59.25, 60.0), 2)
    ex += 0.25 * gs * (1 if f % 2 else -1)
    expo.append(ex)
    # lens: chromatic dispersion and barrel/pincushion warp
    dp = 0.006 + 0.07 * gs + 0.03 * smooth(seg(t, T_DISTORT, 33)) * (t < T_FALL)
    dp += 0.08 * ease_in(seg(t, T_COLLAPSE, T_SNAP), 2) * (t < T_SNAP) + 0.12 * decay(t, T_SNAP, 0.25)
    dp += 0.06 * decay(t, T_FRACTURE, 0.3)
    disp.append(min(dp, 0.2))
    di = 0.0
    di += 0.06 * math.sin(2 * math.pi * 0.35 * (t - T_DISTORT)) * smooth(seg(t, T_DISTORT, 32)) * (t < T_FALL)
    di -= 0.22 * ease_in(seg(t, T_COLLAPSE, T_SNAP), 2) * (t < T_SNAP)
    di += 0.15 * decay(t, T_SNAP, 0.18)
    di += 0.05 * gs * (1 if (f // 2) % 2 else -1)
    dist.append(di)

bake(L_KEY.data, "energy", key)
bake(L_RIM_C.data, "energy", rimc)
bake(L_RIM_M.data, "energy", rimm)
bake(L_TOP.data, "energy", top)
bake(L_FILL.data, "energy", fill)
bake(L_POOL.data, "energy", pool)
bake(L_CORE.data, "energy", core_e)
bake(L_CORE.data, "color", core_c, ncomp=3)

# --------------------------------------------------------------------------
# WORLD
# --------------------------------------------------------------------------
world = bpy.data.worlds.new("Void")
scene.world = world
world.use_nodes = True
wn = NB(world.node_tree)
wn.n.clear()
wout = wn.node("ShaderNodeOutputWorld")
bg = wn.node("ShaderNodeBackground")
bg.inputs["Color"].default_value = (0.0012, 0.0014, 0.002, 1)
bg.inputs["Strength"].default_value = 1.0
wn.put(wout.inputs["Surface"], bg.outputs[0])
vs = wn.node("ShaderNodeVolumeScatter")
vs.name = "Haze"
vs.inputs["Density"].default_value = 0.004
vs.inputs["Anisotropy"].default_value = 0.35
wn.put(wout.inputs["Volume"], vs.outputs[0])
haze = []
for f in FRAMES:
    t = T(f)
    h = 0.0035 + 0.0045 * smooth(seg(t, T_DISTORT, 33)) * (t < T_COLLAPSE)
    if T_SINGULAR - 1.0 <= t < T_SNAP:
        h *= 1 - smooth(seg(t, T_SINGULAR - 1.0, T_SINGULAR))   # the space is gone
    haze.append(h)
bake(world.node_tree, sock_path(vs.inputs["Density"]), haze)

# Only the cube and its shards cast shadows (keeps EEVEE's shadow maps cheap)
for _o in scene.objects:
    if _o.type == "MESH" and not (_o.name == "Cube" or _o.name.startswith("Shard")):
        _o.visible_shadow = False

# --------------------------------------------------------------------------
# RENDER SETTINGS
# --------------------------------------------------------------------------
preview = "preview" in sys.argv
r = scene.render
r.engine = "BLENDER_EEVEE_NEXT"
r.resolution_x = 960
r.resolution_y = 408          # 2.35:1 scope
r.resolution_percentage = 50 if preview else 100
r.use_motion_blur = True
r.motion_blur_shutter = 0.45
r.film_transparent = False
r.image_settings.file_format = "PNG"
r.image_settings.color_mode = "RGB"
r.image_settings.color_depth = "8"
r.use_overwrite = False       # several render processes can share one frame range
r.use_placeholder = True
ee = scene.eevee
ee.taa_render_samples = 6 if preview else 10
ee.use_raytracing = True
ee.ray_tracing_method = "SCREEN"
ee.volumetric_tile_size = "8"
ee.volumetric_samples = 48
ee.volumetric_start = 0.1
ee.volumetric_end = 40.0
ee.use_volumetric_shadows = True
ee.use_shadows = True
ee.shadow_ray_count = 1
ee.shadow_step_count = 6
ee.motion_blur_steps = 1

vset = scene.view_settings
vset.view_transform = "AgX"
for look in ("AgX - Medium High Contrast", "AgX - Punchy", "None"):
    try:
        vset.look = look
        break
    except TypeError:
        pass
vset.exposure = 0.0
bake(scene, "view_settings.exposure", expo)

# --------------------------------------------------------------------------
# COMPOSITOR: bloom -> lens dispersion / distortion
# --------------------------------------------------------------------------
scene.use_nodes = True
ct = scene.node_tree
ct.nodes.clear()
rl = ct.nodes.new("CompositorNodeRLayers")
glare = ct.nodes.new("CompositorNodeGlare")
glare.glare_type = "BLOOM"
glare.quality = "MEDIUM"
set_input(glare, "Threshold", 0.9)
set_input(glare, "Strength", 0.55)
set_input(glare, "Size", 0.75)
lens = ct.nodes.new("CompositorNodeLensdist")
lens.name = "Lens"
set_input(lens, "Fit", True)
set_input(lens, "Jitter", True)
comp = ct.nodes.new("CompositorNodeComposite")
ct.links.new(rl.outputs["Image"], glare.inputs["Image"])
ct.links.new(glare.outputs[0], lens.inputs["Image"])
ct.links.new(lens.outputs[0], comp.inputs["Image"])
bake(ct, sock_path(lens.inputs["Dispersion"]), disp)
bake(ct, sock_path(lens.inputs["Distortion"]), dist)

# --------------------------------------------------------------------------
# Save
# --------------------------------------------------------------------------
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
out = next((a for a in argv if a.endswith(".blend")), None)
if out:
    bpy.ops.wm.save_as_mainfile(filepath=bpy.path.abspath(out), compress=True)
    print("Saved", out)
cue_path = next((a for a in argv if a.endswith(".json")), None)
if cue_path:
    with open(cue_path, "w") as fh:
        json.dump({"glitch": [[e["t0"], e["t1"], e["s"]] for e in glitch_events],
                   "impacts": sorted(impacts)}, fh)
    print("Wrote cues", cue_path, len(impacts), "impacts")
print("frames", F_END, "shards", len(shards), "glitch events", len(glitch_events))
