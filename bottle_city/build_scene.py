"""
City in a Bottle -- procedural Blender 4.5 scene generator.

Builds a 60 second (1440 frames @ 24 fps) surreal animation: an antique glass
bottle lying on a wooden desk with a living miniature city inside it.

Run headless:
    blender -b --factory-startup --python bottle_city/build_scene.py -- [options]

Options (after the "--"):
    --save PATH          save the generated .blend (default: bottle_city/bottle_city.blend)
    --res W H            render resolution (default 1280 720)
    --samples N          Cycles max samples per pixel (default 6, OIDN denoised)
    --haze               add a volumetric haze inside the bottle (god rays; ~35% slower)
    --no-save            do not save a .blend

Everything is generated from code: geometry, materials, animation, camera,
lighting, compositing. The only external asset is a CC0 HDRI from Poly Haven
(assets/artist_workshop_2k.hdr) used for the room reflections.

World scale is real-world metres: the bottle is ~44 cm long, the city is a
1:1000 model (a 4.2 mm car is a 4.2 m car).
"""

import bpy
import bmesh
import math
import os
import random
import sys
from mathutils import Vector, Matrix, Quaternion

HERE = os.path.dirname(os.path.abspath(__file__))
HDRI = os.path.join(HERE, "assets", "artist_workshop_2k.hdr")

# --------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OPT = {"save": os.path.join(HERE, "bottle_city.blend"), "res": (1280, 720), "samples": 6, "haze": False}
i = 0
while i < len(argv):
    a = argv[i]
    if a == "--save":
        OPT["save"] = os.path.abspath(argv[i + 1]); i += 2
    elif a == "--no-save":
        OPT["save"] = None; i += 1
    elif a == "--res":
        OPT["res"] = (int(argv[i + 1]), int(argv[i + 2])); i += 3
    elif a == "--haze":
        OPT["haze"] = True; i += 1
    elif a == "--samples":
        OPT["samples"] = int(argv[i + 1]); i += 2
    else:
        i += 1

FPS = 24
SECONDS = 60
FRAMES = FPS * SECONDS
rng = random.Random(1979)

# Key dimensions (metres)
AXIS_Z = 0.085            # height of the bottle's long axis above the desk
R_OUT = 0.080             # outer body radius
GLASS_T = 0.0025          # glass wall thickness
R_IN = R_OUT - GLASS_T
FLOOR_REL = -0.048        # city ground, relative to the axis
FLOOR_Z = AXIS_Z + FLOOR_REL
ROAD_Z = FLOOR_Z + 0.00006
CITY_X0, CITY_X1 = -0.182, 0.076
CITY_HALF_W = math.sqrt((R_IN - 0.0005) ** 2 - FLOOR_REL ** 2) - 0.0015

# --------------------------------------------------------------------------
# Generic helpers
# --------------------------------------------------------------------------
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


def coll(name, parent=None):
    c = bpy.data.collections.new(name)
    (parent or scene.collection).children.link(c)
    return c


C_DESK = coll("Desk")
C_BOTTLE = coll("Bottle")
C_CITY = coll("City")
C_TRAFFIC = coll("Traffic", C_CITY)
C_SKY = coll("Sky", C_CITY)
C_CAM = coll("Camera_Rig")
C_LIGHTS = coll("Lights")


def obj_from_bm(name, bm, collection, mats=(), smooth=False):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(m)
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    collection.objects.link(ob)
    return ob


def faces_of(verts):
    fs = set()
    for v in verts:
        fs.update(v.link_faces)
    return fs


def bm_box(bm, x0, x1, y0, y1, z0, z1, mat=0):
    m = Matrix.Translation(((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)) @ \
        Matrix.Diagonal((x1 - x0, y1 - y0, z1 - z0, 1.0))
    r = bmesh.ops.create_cube(bm, size=1.0, matrix=m)
    for f in faces_of(r["verts"]):
        f.material_index = mat
    return r["verts"]


def bm_cyl(bm, center, r1, r2, depth, segs=16, mat=0, rot=None, smooth=False):
    m = Matrix.Translation(center)
    if rot is not None:
        m = m @ rot
    r = bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs,
                              radius1=r1, radius2=r2, depth=depth, matrix=m)
    for f in faces_of(r["verts"]):
        f.material_index = mat
        f.smooth = smooth
    return r["verts"]


def bm_sphere(bm, center, radius, subdiv=2, mat=0, scale=(1, 1, 1)):
    m = Matrix.Translation(center) @ Matrix.Diagonal((*scale, 1.0))
    r = bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=radius, matrix=m)
    for f in faces_of(r["verts"]):
        f.material_index = mat
        f.smooth = True
    return r["verts"]


def get_fcurves(action):
    """Blender 4.4+ slotted actions keep a legacy .fcurves proxy; fall back if absent."""
    try:
        return list(action.fcurves)
    except AttributeError:
        out = []
        for layer in action.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    out.extend(bag.fcurves)
        return out


def set_linear(id_data, cyclic=False):
    ad = id_data.animation_data
    if not ad or not ad.action:
        return
    for fc in get_fcurves(ad.action):
        for kp in fc.keyframe_points:
            kp.interpolation = 'LINEAR'
        if cyclic and not any(m.type == 'CYCLES' for m in fc.modifiers):
            fc.modifiers.new('CYCLES')


# --------------------------------------------------------------------------
# Material helpers
# --------------------------------------------------------------------------
def new_mat(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    out.location = (900, 0)
    return m, nt, out


def node(nt, kind, loc=(0, 0), **inputs):
    n = nt.nodes.new(kind)
    n.location = loc
    for k, v in inputs.items():
        if k.startswith("_"):
            setattr(n, k[1:], v)
        else:
            n.inputs[k].default_value = v
    return n


def link(nt, a, b):
    nt.links.new(a, b)


def math_node(nt, op, a=None, b=None, loc=(0, 0), clamp=False, c=None):
    n = nt.nodes.new('ShaderNodeMath')
    n.operation = op
    n.location = loc
    n.use_clamp = clamp
    if op == 'MULTIPLY_ADD' and c is None:
        c = 0.0
    for idx, val in ((0, a), (1, b), (2, c)):
        if val is None:
            continue
        if isinstance(val, (int, float)):
            n.inputs[idx].default_value = val
        else:
            link(nt, val, n.inputs[idx])
    return n.outputs[0]


def ramp(nt, inp, stops, loc=(0, 0), interp='LINEAR'):
    r = nt.nodes.new('ShaderNodeValToRGB')
    r.location = loc
    r.color_ramp.interpolation = interp
    els = r.color_ramp.elements
    while len(els) > 1:
        els.remove(els[-1])
    for i, (pos, col) in enumerate(stops):
        e = els[0] if i == 0 else els.new(pos)
        e.position = pos
        e.color = col if len(col) == 4 else (*col, 1.0)
    link(nt, inp, r.inputs[0])
    return r


def principled(nt, loc=(400, 0), **kw):
    p = nt.nodes.new('ShaderNodeBsdfPrincipled')
    p.location = loc
    for k, v in kw.items():
        p.inputs[k].default_value = v
    return p


def simple_mat(name, color, rough=0.5, metal=0.0, emission=None, strength=0.0, coat=0.0):
    m, nt, out = new_mat(name)
    p = principled(nt, **{"Base Color": (*color, 1), "Roughness": rough, "Metallic": metal,
                          "Coat Weight": coat})
    if emission:
        p.inputs["Emission Color"].default_value = (*emission, 1)
        p.inputs["Emission Strength"].default_value = strength
    link(nt, p.outputs[0], out.inputs[0])
    return m


def time_value(nt, loc=(-1200, -600)):
    """A Value node driven by the scene time in seconds (simple expression, no autoexec needed)."""
    v = nt.nodes.new('ShaderNodeValue')
    v.location = loc
    d = v.outputs[0].driver_add("default_value").driver
    d.type = 'SCRIPTED'
    d.expression = "frame/24"
    return v.outputs[0]


# --------------------------------------------------------------------------
# Materials
# --------------------------------------------------------------------------
def mat_glass():
    m, nt, out = new_mat("Glass_Antique")
    tex = node(nt, 'ShaderNodeTexCoord', (-1100, 0))
    smudge = node(nt, 'ShaderNodeTexNoise', (-900, 200), Scale=55.0, Detail=6.0, Roughness=0.65)
    link(nt, tex.outputs["Object"], smudge.inputs["Vector"])
    rr = ramp(nt, smudge.outputs["Fac"], [(0.45, (0, 0, 0)), (0.75, (0.035, 0.035, 0.035))], (-700, 200))
    # faint waviness of hand-blown glass
    wav = node(nt, 'ShaderNodeTexNoise', (-900, -200), Scale=9.0, Detail=2.0)
    link(nt, tex.outputs["Object"], wav.inputs["Vector"])
    bump = node(nt, 'ShaderNodeBump', (-500, -200), Strength=0.04, Distance=0.0004)
    link(nt, wav.outputs["Fac"], bump.inputs["Height"])
    g = principled(nt, (-200, 100), **{"Base Color": (0.90, 0.97, 0.95, 1), "Transmission Weight": 1.0,
                                       "IOR": 1.47, "Roughness": 0.0})
    link(nt, rr.outputs[0], g.inputs["Roughness"])
    link(nt, bump.outputs[0], g.inputs["Normal"])
    # Shadow rays pass through (tinted) so the city and desk get light through the glass
    tr = node(nt, 'ShaderNodeBsdfTransparent', (-200, -250), Color=(0.80, 0.90, 0.86, 1))
    lp = node(nt, 'ShaderNodeLightPath', (-200, 400))
    mix = node(nt, 'ShaderNodeMixShader', (200, 0))
    link(nt, lp.outputs["Is Shadow Ray"], mix.inputs[0])
    link(nt, g.outputs[0], mix.inputs[1])
    link(nt, tr.outputs[0], mix.inputs[2])
    link(nt, mix.outputs[0], out.inputs[0])
    return m


def mat_wood():
    m, nt, out = new_mat("Desk_Walnut")
    tc = node(nt, 'ShaderNodeTexCoord', (-1400, 0))
    mp = node(nt, 'ShaderNodeMapping', (-1200, 0))
    mp.inputs["Scale"].default_value = (1.0, 3.5, 1.0)
    link(nt, tc.outputs["Object"], mp.inputs["Vector"])
    wave = node(nt, 'ShaderNodeTexWave', (-950, 100), Scale=6.0, Distortion=14.0, Detail=8.0,
                **{"Detail Scale": 1.6, "Detail Roughness": 0.6})
    wave.bands_direction = 'Y'
    link(nt, mp.outputs[0], wave.inputs["Vector"])
    fine = node(nt, 'ShaderNodeTexNoise', (-950, -200), Scale=900.0, Detail=4.0)
    mp2 = node(nt, 'ShaderNodeMapping', (-1200, -250))
    mp2.inputs["Scale"].default_value = (0.08, 1.0, 1.0)
    link(nt, tc.outputs["Object"], mp2.inputs["Vector"])
    link(nt, mp2.outputs[0], fine.inputs["Vector"])
    big = node(nt, 'ShaderNodeTexNoise', (-950, 350), Scale=3.0, Detail=3.0)
    link(nt, tc.outputs["Object"], big.inputs["Vector"])
    mixv = math_node(nt, 'MULTIPLY', wave.outputs["Fac"], 0.75, (-700, 100))
    mixv2 = math_node(nt, 'MULTIPLY_ADD', fine.outputs["Fac"], 0.25, (-550, 100), c=mixv)
    col = ramp(nt, mixv2, [(0.2, (0.11, 0.05, 0.022)), (0.5, (0.19, 0.092, 0.043)),
                           (0.9, (0.27, 0.14, 0.066))], (-350, 100))
    tint = node(nt, 'ShaderNodeMix', (-100, 200))
    tint.data_type = 'RGBA'
    tint.blend_type = 'MULTIPLY'
    tint.inputs[0].default_value = 0.35
    link(nt, col.outputs[0], tint.inputs[6])
    bigr = ramp(nt, big.outputs["Fac"], [(0.3, (0.7, 0.75, 0.8)), (0.7, (1, 1, 1))], (-350, 400))
    link(nt, bigr.outputs[0], tint.inputs[7])
    rough = ramp(nt, fine.outputs["Fac"], [(0.3, (0.28, 0.28, 0.28)), (0.7, (0.45, 0.45, 0.45))], (-350, -200))
    bump = node(nt, 'ShaderNodeBump', (-100, -300), Strength=0.15, Distance=0.0005)
    link(nt, mixv2, bump.inputs["Height"])
    p = principled(nt, (250, 0), **{"Coat Weight": 0.35, "Coat Roughness": 0.08})
    link(nt, tint.outputs[2], p.inputs["Base Color"])
    link(nt, rough.outputs[0], p.inputs["Roughness"])
    link(nt, bump.outputs[0], p.inputs["Normal"])
    link(nt, p.outputs[0], out.inputs[0])
    return m


def mat_cork():
    m, nt, out = new_mat("Cork")
    tc = node(nt, 'ShaderNodeTexCoord', (-900, 0))
    v = node(nt, 'ShaderNodeTexVoronoi', (-700, 0), Scale=900.0)
    n = node(nt, 'ShaderNodeTexNoise', (-700, -250), Scale=400.0, Detail=8.0)
    link(nt, tc.outputs["Object"], v.inputs["Vector"])
    link(nt, tc.outputs["Object"], n.inputs["Vector"])
    c = ramp(nt, n.outputs["Fac"], [(0.35, (0.30, 0.17, 0.08)), (0.65, (0.62, 0.42, 0.24))], (-450, 0))
    pits = ramp(nt, v.outputs["Distance"], [(0.0, (0.15, 0.08, 0.04)), (0.12, (1, 1, 1))], (-450, 250))
    mul = node(nt, 'ShaderNodeMix', (-150, 100))
    mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'; mul.inputs[0].default_value = 1.0
    link(nt, c.outputs[0], mul.inputs[6]); link(nt, pits.outputs[0], mul.inputs[7])
    bump = node(nt, 'ShaderNodeBump', (-150, -250), Strength=0.6, Distance=0.0006)
    link(nt, v.outputs["Distance"], bump.inputs["Height"])
    p = principled(nt, (200, 0), Roughness=0.85)
    link(nt, mul.outputs[2], p.inputs["Base Color"])
    link(nt, bump.outputs[0], p.inputs["Normal"])
    link(nt, p.outputs[0], out.inputs[0])
    return m


def mat_soil():
    """Stratified earth, visible through the glass below the city (slab local z is -0.03..0)."""
    m, nt, out = new_mat("Soil_Layers")
    tc = node(nt, 'ShaderNodeTexCoord', (-1000, 0))
    n = node(nt, 'ShaderNodeTexNoise', (-800, -200), Scale=150.0, Detail=6.0)
    link(nt, tc.outputs["Object"], n.inputs["Vector"])
    sep = node(nt, 'ShaderNodeSeparateXYZ', (-800, 100))
    link(nt, tc.outputs["Object"], sep.inputs[0])
    zd = math_node(nt, 'MULTIPLY_ADD', n.outputs["Fac"], 0.004, (-600, 100), c=sep.outputs[2])
    zz = math_node(nt, 'MULTIPLY_ADD', zd, 33.0, (-450, 100), c=1.0)
    c = ramp(nt, zz, [(0.0, (0.06, 0.035, 0.02)), (0.25, (0.16, 0.09, 0.045)), (0.45, (0.10, 0.06, 0.03)),
                      (0.62, (0.30, 0.22, 0.13)), (0.80, (0.12, 0.075, 0.04)), (0.93, (0.09, 0.06, 0.03)),
                      (0.97, (0.10, 0.22, 0.05))], (-300, 100))
    vor = node(nt, 'ShaderNodeTexVoronoi', (-600, -350), Scale=600.0)
    link(nt, tc.outputs["Object"], vor.inputs["Vector"])
    bump = node(nt, 'ShaderNodeBump', (0, -300), Strength=0.5, Distance=0.0005)
    link(nt, vor.outputs["Distance"], bump.inputs["Height"])
    p = principled(nt, (250, 0), Roughness=0.95)
    link(nt, c.outputs[0], p.inputs["Base Color"])
    link(nt, bump.outputs[0], p.inputs["Normal"])
    link(nt, p.outputs[0], out.inputs[0])
    return m


def mat_concrete(name, color, scale=1500.0, rough=0.8):
    m, nt, out = new_mat(name)
    tc = node(nt, 'ShaderNodeTexCoord', (-900, 0))
    n = node(nt, 'ShaderNodeTexNoise', (-700, 0), Scale=scale, Detail=6.0)
    link(nt, tc.outputs["Object"], n.inputs["Vector"])
    lo = tuple(c * 0.75 for c in color)
    c = ramp(nt, n.outputs["Fac"], [(0.3, lo), (0.7, color)], (-450, 0))
    bump = node(nt, 'ShaderNodeBump', (-200, -250), Strength=0.25, Distance=0.0002)
    link(nt, n.outputs["Fac"], bump.inputs["Height"])
    p = principled(nt, (200, 0), Roughness=rough)
    link(nt, c.outputs[0], p.inputs["Base Color"])
    link(nt, bump.outputs[0], p.inputs["Normal"])
    link(nt, p.outputs[0], out.inputs[0])
    return m


def mat_road():
    m, nt, out = new_mat("Asphalt")
    tc = node(nt, 'ShaderNodeTexCoord', (-900, 0))
    n = node(nt, 'ShaderNodeTexNoise', (-700, 0), Scale=4000.0, Detail=4.0)
    n2 = node(nt, 'ShaderNodeTexNoise', (-700, 300), Scale=60.0, Detail=3.0)
    link(nt, tc.outputs["Object"], n.inputs["Vector"])
    link(nt, tc.outputs["Object"], n2.inputs["Vector"])
    c = ramp(nt, n.outputs["Fac"], [(0.35, (0.018, 0.018, 0.02)), (0.7, (0.06, 0.058, 0.055))], (-450, 0))
    # damp patches: slightly glossy so lights reflect in the streets
    r = ramp(nt, n2.outputs["Fac"], [(0.4, (0.18, 0.18, 0.18)), (0.6, (0.6, 0.6, 0.6))], (-450, 300))
    p = principled(nt, (200, 0))
    link(nt, c.outputs[0], p.inputs["Base Color"])
    link(nt, r.outputs[0], p.inputs["Roughness"])
    link(nt, p.outputs[0], out.inputs[0])
    return m


def mat_building(name, curtain=False):
    """Facade with procedural windows that light up / switch over time, roofs and shopfronts."""
    m, nt, out = new_mat(name)
    geo = node(nt, 'ShaderNodeNewGeometry', (-2200, 0))
    oi = node(nt, 'ShaderNodeObjectInfo', (-2200, -400))
    sep = node(nt, 'ShaderNodeSeparateXYZ', (-2000, 0))
    link(nt, geo.outputs["Position"], sep.inputs[0])
    nsep = node(nt, 'ShaderNodeSeparateXYZ', (-2000, 300))
    link(nt, geo.outputs["Normal"], nsep.inputs[0])
    facade = math_node(nt, 'LESS_THAN', math_node(nt, 'ABSOLUTE', nsep.outputs[2], None, (-1850, 300)),
                       0.5, (-1700, 300))
    h = math_node(nt, 'ADD', sep.outputs[0], sep.outputs[1], (-1850, 50))
    zr = math_node(nt, 'SUBTRACT', sep.outputs[2], FLOOR_Z, (-1850, -100))
    pitch_h = 0.00145 if curtain else 0.0018
    pitch_v = 0.0024 if curtain else 0.0027
    u = math_node(nt, 'DIVIDE', h, pitch_h, (-1700, 50))
    v = math_node(nt, 'DIVIDE', zr, pitch_v, (-1700, -100))
    fu = math_node(nt, 'FRACT', u, None, (-1550, 50))
    fv = math_node(nt, 'FRACT', v, None, (-1550, -100))
    a, b = (0.07, 0.93) if curtain else (0.22, 0.78)
    c_, d_ = (0.12, 0.90) if curtain else (0.30, 0.80)
    wu = math_node(nt, 'MULTIPLY', math_node(nt, 'GREATER_THAN', fu, a, (-1400, 120)),
                   math_node(nt, 'LESS_THAN', fu, b, (-1400, 20)), (-1250, 60))
    wv = math_node(nt, 'MULTIPLY', math_node(nt, 'GREATER_THAN', fv, c_, (-1400, -80)),
                   math_node(nt, 'LESS_THAN', fv, d_, (-1400, -180)), (-1250, -120))
    upper = math_node(nt, 'GREATER_THAN', zr, 0.0032, (-1250, -260))
    win_reg = math_node(nt, 'MULTIPLY', math_node(nt, 'MULTIPLY', wu, wv, (-1100, 0)), upper, (-950, 0))
    # shopfronts on the ground floor
    shop_u = math_node(nt, 'MULTIPLY', math_node(nt, 'GREATER_THAN', fu, 0.06, (-1400, -360)),
                       math_node(nt, 'LESS_THAN', fu, 0.94, (-1400, -460)), (-1250, -400))
    shop_v = math_node(nt, 'MULTIPLY', math_node(nt, 'GREATER_THAN', zr, 0.0004, (-1400, -560)),
                       math_node(nt, 'LESS_THAN', zr, 0.0026, (-1400, -660)), (-1250, -600))
    shop = math_node(nt, 'MULTIPLY', shop_u, shop_v, (-1100, -450))
    win = math_node(nt, 'MULTIPLY', math_node(nt, 'MAXIMUM', win_reg, shop, (-800, -100)), facade, (-650, 0))

    # per-window random state; slowly switching lights
    fl_u = math_node(nt, 'FLOOR', u, None, (-1100, 300))
    fl_v = math_node(nt, 'FLOOR', v, None, (-1100, 200))
    cmb = node(nt, 'ShaderNodeCombineXYZ', (-950, 250))
    link(nt, fl_u, cmb.inputs[0]); link(nt, fl_v, cmb.inputs[1])
    link(nt, math_node(nt, 'MULTIPLY', oi.outputs["Random"], 97.0, (-1100, 100)), cmb.inputs[2])
    wn1 = node(nt, 'ShaderNodeTexWhiteNoise', (-800, 300))
    wn1.noise_dimensions = '3D'
    link(nt, cmb.outputs[0], wn1.inputs["Vector"])
    t = time_value(nt, (-1100, 500))
    wphase = math_node(nt, 'FLOOR', math_node(nt, 'MULTIPLY_ADD', t, 0.35, (-950, 500),
                                              c=math_node(nt, 'MULTIPLY', wn1.outputs["Value"], 9.0, (-1100, 650))),
                       None, (-800, 500))
    wn2 = node(nt, 'ShaderNodeTexWhiteNoise', (-650, 450))
    wn2.noise_dimensions = '4D'
    link(nt, cmb.outputs[0], wn2.inputs["Vector"])
    link(nt, wphase, wn2.inputs["W"])
    mixed = math_node(nt, 'MULTIPLY_ADD', wn1.outputs["Value"], 0.82, (-500, 350),
                      c=math_node(nt, 'MULTIPLY', wn2.outputs["Value"], 0.18, (-650, 250)))
    dens = math_node(nt, 'MULTIPLY_ADD', oi.outputs["Random"], 0.35, (-650, 150),
                     c=0.12 if not curtain else 0.10)
    lit = math_node(nt, 'LESS_THAN', mixed, dens, (-350, 300))
    lit_any = math_node(nt, 'MAXIMUM', lit, shop, (-200, 300))

    wcol_n = node(nt, 'ShaderNodeTexWhiteNoise', (-650, 700))
    wcol_n.noise_dimensions = '3D'
    link(nt, cmb.outputs[0], wcol_n.inputs["Vector"])
    wcol = ramp(nt, wcol_n.outputs["Value"], [(0.0, (1.0, 0.55, 0.22)), (0.55, (1.0, 0.72, 0.38)),
                                               (0.80, (1.0, 0.86, 0.62)), (0.90, (0.62, 0.80, 1.0)),
                                               (1.0, (0.85, 0.95, 1.0))], (-450, 700), 'CONSTANT')
    bright = math_node(nt, 'MULTIPLY_ADD', wcol_n.outputs["Value"], 1.0, (-450, 550), c=0.45)
    strength = math_node(nt, 'MULTIPLY', math_node(nt, 'MULTIPLY', win, lit_any, (-50, 400)),
                         math_node(nt, 'MULTIPLY', bright, 3.2 if not curtain else 2.6, (-200, 550)), (100, 450))

    # facade colour per building
    if curtain:
        fac_col = ramp(nt, oi.outputs["Random"], [(0.0, (0.10, 0.13, 0.16)), (0.5, (0.16, 0.20, 0.22)),
                                                  (1.0, (0.22, 0.20, 0.18))], (-650, -700))
    else:
        fac_col = ramp(nt, oi.outputs["Random"], [(0.0, (0.55, 0.50, 0.42)), (0.2, (0.42, 0.20, 0.13)),
                                                  (0.4, (0.70, 0.66, 0.58)), (0.6, (0.33, 0.34, 0.36)),
                                                  (0.8, (0.62, 0.48, 0.33)), (1.0, (0.78, 0.76, 0.70))],
                       (-650, -700), 'CONSTANT')
    grime_n = node(nt, 'ShaderNodeTexNoise', (-650, -950), Scale=900.0, Detail=5.0)
    link(nt, geo.outputs["Position"], grime_n.inputs["Vector"])
    grime = ramp(nt, grime_n.outputs["Fac"], [(0.35, (0.7, 0.7, 0.7)), (0.65, (1, 1, 1))], (-450, -950))
    fac_dim = node(nt, 'ShaderNodeMix', (-450, -650))
    fac_dim.data_type = 'RGBA'; fac_dim.blend_type = 'MULTIPLY'; fac_dim.inputs[0].default_value = 1.0
    fac_dim.inputs[7].default_value = (0.7, 0.7, 0.7, 1)
    link(nt, fac_col.outputs[0], fac_dim.inputs[6])
    fac_mul = node(nt, 'ShaderNodeMix', (-250, -750))
    fac_mul.data_type = 'RGBA'; fac_mul.blend_type = 'MULTIPLY'; fac_mul.inputs[0].default_value = 1.0
    link(nt, fac_dim.outputs[2], fac_mul.inputs[6]); link(nt, grime.outputs[0], fac_mul.inputs[7])
    roof_col = node(nt, 'ShaderNodeMix', (-50, -750))
    roof_col.data_type = 'RGBA'
    roof_col.inputs[7].default_value = (0.08, 0.08, 0.085, 1)
    link(nt, facade, roof_col.inputs[0])
    roof_col.inputs[6].default_value = (0.13, 0.125, 0.12, 1)
    link(nt, fac_mul.outputs[2], roof_col.inputs[7])

    facade_bsdf = principled(nt, (300, -500), Roughness=0.35 if curtain else 0.75,
                             **{"Metallic": 0.4 if curtain else 0.0})
    link(nt, roof_col.outputs[2], facade_bsdf.inputs["Base Color"])
    glass_bsdf = principled(nt, (300, 100), **{"Base Color": (0.035, 0.045, 0.06, 1), "Roughness": 0.06,
                                               "Metallic": 0.2})
    link(nt, wcol.outputs[0], glass_bsdf.inputs["Emission Color"])
    link(nt, strength, glass_bsdf.inputs["Emission Strength"])
    bump = node(nt, 'ShaderNodeBump', (100, -250), Strength=0.6, Distance=0.00025, _invert=True)
    link(nt, win, bump.inputs["Height"])
    link(nt, bump.outputs[0], facade_bsdf.inputs["Normal"])
    mix = node(nt, 'ShaderNodeMixShader', (650, 0))
    link(nt, win, mix.inputs[0])
    link(nt, facade_bsdf.outputs[0], mix.inputs[1])
    link(nt, glass_bsdf.outputs[0], mix.inputs[2])
    link(nt, mix.outputs[0], out.inputs[0])
    return m


def mat_car_body():
    m, nt, out = new_mat("Car_Paint")
    oi = node(nt, 'ShaderNodeObjectInfo', (-300, 0))
    p = principled(nt, (100, 0), Roughness=0.25, Metallic=0.5, **{"Coat Weight": 1.0, "Coat Roughness": 0.03})
    link(nt, oi.outputs["Color"], p.inputs["Base Color"])
    link(nt, p.outputs[0], out.inputs[0])
    return m


def mat_blink(name, color, period=1.6, strength=40.0):
    m, nt, out = new_mat(name)
    t = time_value(nt, (-800, 0))
    oi = node(nt, 'ShaderNodeObjectInfo', (-800, -200))
    ph = math_node(nt, 'MULTIPLY_ADD', t, 1.0 / period, (-600, 0), c=oi.outputs["Random"])
    fr = math_node(nt, 'FRACT', ph, None, (-450, 0))
    on = math_node(nt, 'LESS_THAN', fr, 0.18, (-300, 0))
    s = math_node(nt, 'MULTIPLY_ADD', on, strength, (-150, 0), c=strength * 0.04)
    em = node(nt, 'ShaderNodeEmission', (100, 0), Color=(*color, 1))
    link(nt, s, em.inputs["Strength"])
    link(nt, em.outputs[0], out.inputs[0])
    return m


def mat_cloud():
    """Soft cumulus: noise-eroded density inside an ellipsoid. Object coords are normalised per cloud
    through the object's custom 'cloud_size' via Attribute node (set on each cloud)."""
    m, nt, out = new_mat("Cloud_Volume")
    tc = node(nt, 'ShaderNodeTexCoord', (-1200, 0))
    att = node(nt, 'ShaderNodeAttribute', (-1200, -300), _attribute_type='OBJECT', _attribute_name='cloud_inv')
    sc = node(nt, 'ShaderNodeVectorMath', (-1000, -150), _operation='MULTIPLY')
    link(nt, tc.outputs["Object"], sc.inputs[0]); link(nt, att.outputs["Vector"], sc.inputs[1])
    ln = node(nt, 'ShaderNodeVectorMath', (-800, -150), _operation='LENGTH')
    link(nt, sc.outputs[0], ln.inputs[0])
    t = time_value(nt, (-1200, 300))
    n = node(nt, 'ShaderNodeTexNoise', (-800, 150), Scale=170.0, Detail=7.0, Roughness=0.6)
    n.noise_dimensions = '4D'
    link(nt, tc.outputs["Object"], n.inputs["Vector"])
    link(nt, math_node(nt, 'MULTIPLY', t, 0.03, (-1000, 300)), n.inputs["W"])
    # flat-ish base, billowy top
    sep = node(nt, 'ShaderNodeSeparateXYZ', (-800, -350))
    link(nt, sc.outputs[0], sep.inputs[0])
    base = math_node(nt, 'MULTIPLY', math_node(nt, 'ADD', sep.outputs[2], 0.55, (-650, -350), clamp=True), 1.0,
                     (-500, -350))
    core = math_node(nt, 'MULTIPLY_ADD', ln.outputs["Value"], -1.5, (-600, -150), c=1.15)
    d = math_node(nt, 'MULTIPLY_ADD', n.outputs["Fac"], 1.9, (-450, 0), c=core)
    d2 = math_node(nt, 'SUBTRACT', d, 0.95, (-300, 0), clamp=True)
    d3 = math_node(nt, 'MULTIPLY', math_node(nt, 'POWER', d2, 1.3, (-150, 0)), base, (0, 0))
    dens = math_node(nt, 'MULTIPLY', d3, 520.0, (150, 0))
    v = node(nt, 'ShaderNodeVolumePrincipled', (350, 0), Color=(1.0, 0.96, 0.93, 1), Anisotropy=0.5)
    link(nt, dens, v.inputs["Density"])
    link(nt, v.outputs[0], out.inputs["Volume"])
    return m


def mat_haze():
    m, nt, out = new_mat("Bottle_Haze")
    v = node(nt, 'ShaderNodeVolumeScatter', (0, 0), Color=(1.0, 0.86, 0.72, 1), Density=3.5, Anisotropy=0.55)
    link(nt, v.outputs[0], out.inputs["Volume"])
    return m


def mat_leaves():
    m, nt, out = new_mat("Leaves")
    oi = node(nt, 'ShaderNodeObjectInfo', (-500, 0))
    tc = node(nt, 'ShaderNodeTexCoord', (-700, -300))
    n = node(nt, 'ShaderNodeTexNoise', (-500, -300), Scale=3000.0, Detail=3.0)
    link(nt, tc.outputs["Object"], n.inputs["Vector"])
    c = ramp(nt, n.outputs["Fac"], [(0.3, (0.035, 0.09, 0.02)), (0.7, (0.12, 0.25, 0.04))], (-300, 0))
    bump = node(nt, 'ShaderNodeBump', (-100, -300), Strength=0.8, Distance=0.0003)
    link(nt, n.outputs["Fac"], bump.inputs["Height"])
    p = principled(nt, (150, 0), Roughness=0.6, **{"Subsurface Weight": 0.15})
    link(nt, c.outputs[0], p.inputs["Base Color"])
    link(nt, bump.outputs[0], p.inputs["Normal"])
    link(nt, p.outputs[0], out.inputs[0])
    return m


M = {}
M["glass"] = mat_glass()
M["wood"] = mat_wood()
M["cork"] = mat_cork()
M["soil"] = mat_soil()
M["sidewalk"] = mat_concrete("Sidewalk", (0.42, 0.40, 0.37))
M["plaza"] = mat_concrete("Plaza_Stone", (0.55, 0.50, 0.42), 800.0, 0.6)
M["road"] = mat_road()
M["paint_y"] = simple_mat("Paint_Yellow", (0.75, 0.55, 0.08), 0.5)
M["paint_w"] = simple_mat("Paint_White", (0.75, 0.75, 0.72), 0.5)
M["grass"] = mat_concrete("Grass", (0.06, 0.16, 0.03), 2500.0, 0.9)
M["water"] = simple_mat("Pond_Water", (0.01, 0.03, 0.04), 0.02, coat=1.0)
M["leaves"] = mat_leaves()
M["trunk"] = simple_mat("Bark", (0.07, 0.045, 0.03), 0.9)
M["bld"] = mat_building("Building_Masonry")
M["bld_glass"] = mat_building("Building_Curtainwall", curtain=True)
M["metal"] = simple_mat("Roof_Metal", (0.35, 0.36, 0.37), 0.4, 0.8)
M["dark_metal"] = simple_mat("Dark_Metal", (0.03, 0.03, 0.035), 0.35, 0.9)
M["lamp_head"] = simple_mat("Streetlamp_Glow", (1, 1, 1), 0.3, emission=(1.0, 0.70, 0.38), strength=60.0)
M["car"] = mat_car_body()
M["car_glass"] = simple_mat("Car_Glass", (0.01, 0.012, 0.015), 0.05, 0.3)
M["tire"] = simple_mat("Tire", (0.015, 0.015, 0.015), 0.8)
M["headlight"] = simple_mat("Headlight", (1, 1, 1), 0.1, emission=(1.0, 0.92, 0.80), strength=80.0)
M["taillight"] = simple_mat("Taillight", (0.5, 0.0, 0.0), 0.2, emission=(1.0, 0.04, 0.02), strength=40.0)
M["beacon"] = mat_blink("Beacon_Red", (1.0, 0.05, 0.02))
M["cloud"] = mat_cloud()
M["haze"] = mat_haze()
M["brass"] = simple_mat("Brass", (0.80, 0.55, 0.25), 0.22, 1.0)
M["paper"] = mat_concrete("Paper", (0.82, 0.78, 0.66), 3000.0, 0.85)
M["leather"] = mat_concrete("Leather_Cover", (0.20, 0.035, 0.03), 1800.0, 0.5)
M["book2"] = mat_concrete("Cloth_Cover", (0.04, 0.09, 0.13), 2500.0, 0.8)
M["book3"] = mat_concrete("Cloth_Cover_Green", (0.06, 0.12, 0.06), 2500.0, 0.8)
M["pencil"] = simple_mat("Pencil_Paint", (0.85, 0.55, 0.05), 0.35, coat=0.6)
M["pencil_wood"] = simple_mat("Pencil_Wood", (0.62, 0.42, 0.24), 0.8)
M["graphite"] = simple_mat("Graphite", (0.03, 0.03, 0.03), 0.3, 0.6)
M["eraser"] = simple_mat("Eraser", (0.75, 0.32, 0.30), 0.9)
M["fairy"] = simple_mat("Fairy_Bulb", (1, 1, 1), 0.2, emission=(1.0, 0.62, 0.30), strength=120.0)
M["airship"] = mat_concrete("Airship_Skin", (0.75, 0.72, 0.66), 2000.0, 0.45)
M["gondola"] = simple_mat("Gondola", (0.25, 0.08, 0.05), 0.4, coat=0.5)
M["win_warm"] = simple_mat("Gondola_Windows", (1, 1, 1), 0.2, emission=(1.0, 0.7, 0.4), strength=25.0)

# --------------------------------------------------------------------------
# Camera path (computed first so the city can keep clear of the flight path)
# --------------------------------------------------------------------------
# time(s), position, look-at, lens(mm), f-stop, roll(deg)
CAM_KEYS = [
    (0.0,  (-0.170, -0.265, 0.092), (-0.055, -0.020, 0.072), 50, 13, 0),
    (6.0,  (-0.070, -0.205, 0.082), (-0.025, -0.020, 0.068), 55, 13, 0),
    (11.0, (0.100, -0.190, 0.098), (0.060, 0.000, 0.074), 50, 14, -2),
    (14.5, (0.270, -0.140, 0.102), (0.215, 0.000, 0.085), 45, 16, -3),
    (17.0, (0.355, -0.050, 0.091), (0.238, 0.000, 0.085), 40, 18, 0),
    (19.0, (0.310, 0.000, 0.0855), (0.200, 0.000, 0.085), 35, 22, 0),
    (21.5, (0.215, 0.000, 0.0850), (0.100, 0.000, 0.075), 28, 28, 0),
    (24.0, (0.130, 0.000, 0.0800), (0.030, 0.000, 0.060), 22, 32, 0),
    (27.0, (0.075, 0.000, 0.0640), (0.000, 0.000, 0.053), 20, 32, 0),
    (30.0, (0.035, 0.000, 0.0570), (-0.040, 0.000, 0.056), 20, 36, -3),
    (33.5, (-0.020, 0.000, 0.0545), (-0.090, -0.004, 0.060), 20, 36, -7),
    (37.0, (-0.075, 0.000, 0.0570), (-0.130, 0.008, 0.072), 20, 36, 7),
    (40.0, (-0.118, 0.000, 0.0720), (-0.130, 0.010, 0.110), 20, 32, 5),
    (43.0, (-0.110, 0.005, 0.1150), (-0.065, 0.000, 0.160), 20, 28, 0),
    (46.0, (-0.075, -0.050, 0.2100), (-0.030, 0.000, 0.090), 24, 22, 0),
    (50.0, (0.020, -0.250, 0.2000), (0.000, 0.000, 0.085), 30, 16, 0),
    (55.0, (0.220, -0.480, 0.2100), (0.010, 0.000, 0.080), 38, 14, 0),
    (60.0, (0.340, -0.600, 0.1900), (0.020, 0.000, 0.080), 40, 14, 0),
]


def hermite_track(keys_t, keys_v, t):
    """C1 cubic Hermite (non-uniform Catmull-Rom) through keyed values; eased ends."""
    n = len(keys_t)
    if t <= keys_t[0]:
        return keys_v[0]
    if t >= keys_t[-1]:
        return keys_v[-1]
    k = max(i for i in range(n - 1) if keys_t[i] <= t)
    t0, t1 = keys_t[k], keys_t[k + 1]
    p0, p1 = keys_v[k], keys_v[k + 1]

    def tangent(i):
        if i == 0 or i == n - 1:
            return p0 * 0  # ease in / ease out
        return (keys_v[i + 1] - keys_v[i - 1]) / (keys_t[i + 1] - keys_t[i - 1])

    m0, m1 = tangent(k), tangent(k + 1)
    dt = t1 - t0
    s = (t - t0) / dt
    h00 = 2 * s ** 3 - 3 * s ** 2 + 1
    h10 = s ** 3 - 2 * s ** 2 + s
    h01 = -2 * s ** 3 + 3 * s ** 2
    h11 = s ** 3 - s ** 2
    return h00 * p0 + h10 * dt * m0 + h01 * p1 + h11 * dt * m1


KT = [k[0] for k in CAM_KEYS]
KP = [Vector(k[1]) for k in CAM_KEYS]
KL = [Vector(k[2]) for k in CAM_KEYS]
KS = [Vector((k[3], k[4], k[5])) for k in CAM_KEYS]


def cam_state(frame):
    t = (frame - 1) / FPS
    p = hermite_track(KT, KP, t)
    l = hermite_track(KT, KL, t)
    s = hermite_track(KT, KS, t)
    return p, l, s


CAM_SAMPLES = [cam_state(f / 2.0)[0] for f in range(2, 2 * FRAMES + 3)]


def path_clearance(x0, x1, y0, y1, margin=0.003):
    """Max allowed building height (above floor) so the camera never clips a building."""
    best = 1.0
    for p in CAM_SAMPLES:
        if x0 - margin <= p.x <= x1 + margin and y0 - margin <= p.y <= y1 + margin:
            best = min(best, p.z - FLOOR_Z - 0.0045)
    return best


# --------------------------------------------------------------------------
# Desk & props
# --------------------------------------------------------------------------
bm = bmesh.new()
bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=1.0,
                      matrix=Matrix.Diagonal((1.3, 0.9, 1, 1)))
desk = obj_from_bm("Desk_Top", bm, C_DESK, [M["wood"]])
bm = bmesh.new()
bm_box(bm, -1.3, 1.3, -0.9, 0.9, -0.04, -0.0001)
obj_from_bm("Desk_Body", bm, C_DESK, [M["wood"]])

# bottle cradles (wood with a concave cut)
for cx in (-0.115, 0.045):
    bm = bmesh.new()
    bm_box(bm, cx - 0.013, cx + 0.013, -0.062, 0.062, 0.0, 0.045)
    cr = obj_from_bm(f"Cradle_{cx:+.3f}", bm, C_DESK, [M["wood"]])
    bm = bmesh.new()
    bm_cyl(bm, (cx, 0, AXIS_Z), R_OUT + 0.0004, R_OUT + 0.0004, 0.05, 96,
           rot=Matrix.Rotation(math.pi / 2, 4, 'Y'))
    cutter = obj_from_bm("cutter", bm, C_DESK)
    mod = cr.modifiers.new("cut", 'BOOLEAN')
    mod.object = cutter
    mod.operation = 'DIFFERENCE'
    mod.solver = 'EXACT'
    bpy.context.view_layer.objects.active = cr
    bpy.ops.object.modifier_apply(modifier="cut")
    bpy.data.objects.remove(cutter)
    bev = cr.modifiers.new("bevel", 'BEVEL')
    bev.width = 0.0012
    bev.segments = 2
    bev.limit_method = 'ANGLE'

# cork lying on the desk next to the neck
bm = bmesh.new()
bm_cyl(bm, (0, 0, 0), 0.0205, 0.0182, 0.036, 48, smooth=True)
bmesh.ops.bevel(bm, geom=[e for e in bm.edges if len(e.link_faces) == 2
                          and e.link_faces[0].normal.dot(e.link_faces[1].normal) < 0.5],
                offset=0.0015, segments=3, affect='EDGES')
cork = obj_from_bm("Cork", bm, C_DESK, [M["cork"]], smooth=True)
cork.location = (0.305, -0.075, 0.0195)
cork.rotation_euler = (math.radians(90), math.radians(4), math.radians(28))

# pencil
bm = bmesh.new()
rot_x = Matrix.Rotation(math.pi / 2, 4, 'Y')
bm_cyl(bm, (0, 0, 0), 0.0036, 0.0036, 0.150, 6, 0, rot_x)
bm_cyl(bm, (0.075 + 0.009, 0, 0), 0.0036, 0.0012, 0.018, 6, 1, rot_x)
bm_cyl(bm, (0.075 + 0.0195, 0, 0), 0.0012, 0.0001, 0.004, 12, 2, rot_x)
bm_cyl(bm, (-0.075 - 0.004, 0, 0), 0.0038, 0.0038, 0.008, 24, 3, rot_x, True)
bm_cyl(bm, (-0.075 - 0.0115, 0, 0), 0.0035, 0.0035, 0.007, 24, 4, rot_x, True)
pencil = obj_from_bm("Pencil", bm, C_DESK, [M["pencil"], M["pencil_wood"], M["graphite"], M["brass"], M["eraser"]])
pencil.location = (0.06, -0.205, 0.0036)
pencil.rotation_euler = (0, 0, math.radians(14))

# notebook
bm = bmesh.new()
bm_box(bm, -0.105, 0.105, -0.074, 0.074, 0.0, 0.0012, 0)
bm_box(bm, -0.103, 0.101, -0.072, 0.072, 0.0012, 0.0128, 1)
bm_box(bm, -0.105, 0.105, -0.074, 0.074, 0.0128, 0.014, 0)
nb = obj_from_bm("Notebook", bm, C_DESK, [M["leather"], M["paper"]])
nb.location = (-0.33, 0.14, 0)
nb.rotation_euler = (0, 0, math.radians(-17))
bev = nb.modifiers.new("bevel", 'BEVEL'); bev.width = 0.0008; bev.segments = 2

# stack of books in the back
z = 0.0
for i, (w, d, h, mat) in enumerate([(0.24, 0.17, 0.035, M["book2"]), (0.22, 0.155, 0.03, M["leather"]),
                                    (0.20, 0.15, 0.026, M["book3"])]):
    bm = bmesh.new()
    bm_box(bm, -w / 2, w / 2, -d / 2, d / 2, 0, 0.003, 0)
    bm_box(bm, -w / 2 + 0.002, w / 2 - 0.004, -d / 2 + 0.003, d / 2 - 0.003, 0.003, h - 0.003, 1)
    bm_box(bm, -w / 2, w / 2, -d / 2, d / 2, h - 0.003, h, 0)
    bm_box(bm, -w / 2 - 0.002, -w / 2 + 0.002, -d / 2, d / 2, 0, h, 0)
    b = obj_from_bm(f"Book_{i}", bm, C_DESK, [mat, M["paper"]])
    b.location = (0.45 + i * 0.01, 0.33, z)
    b.rotation_euler = (0, 0, math.radians(8 - 9 * i))
    z += h

# magnifying glass
def bm_torus(bm, R, r, nu=72, nv=16):
    rows = []
    for i in range(nu):
        a = 2 * math.pi * i / nu
        row = []
        for j in range(nv):
            b = 2 * math.pi * j / nv
            row.append(bm.verts.new(((R + r * math.cos(b)) * math.cos(a), (R + r * math.cos(b)) * math.sin(a),
                                     r * math.sin(b))))
        rows.append(row)
    for i in range(nu):
        for j in range(nv):
            f = bm.faces.new((rows[i][j], rows[(i + 1) % nu][j], rows[(i + 1) % nu][(j + 1) % nv],
                              rows[i][(j + 1) % nv]))
            f.smooth = True


bm = bmesh.new()
bm_torus(bm, 0.042, 0.0035)
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
ring = obj_from_bm("Magnifier_Ring", bm, C_DESK, [M["brass"]], smooth=True)
ring.location = (-0.36, -0.13, 0.0036)
bm = bmesh.new()
bm_sphere(bm, (0, 0, 0), 0.042, 4, 0, (1, 1, 0.09))
lens = obj_from_bm("Magnifier_Lens", bm, C_DESK, [M["glass"]], smooth=True)
lens.location = (-0.36, -0.13, 0.0040)
bm = bmesh.new()
bm_cyl(bm, (0.075, 0, 0), 0.0048, 0.0058, 0.065, 24, 0, rot_x, True)
bm_cyl(bm, (0.0405, 0, 0), 0.006, 0.0055, 0.008, 24, 1, rot_x, True)
handle = obj_from_bm("Magnifier_Handle", bm, C_DESK, [M["wood"], M["brass"]], smooth=True)
handle.location = (-0.36, -0.13, 0.0059)
handle.rotation_euler = (0, 0, math.radians(-150))

# fairy lights far behind the desk -> bokeh
for i in range(46):
    s = i / 45
    x = -0.9 + 1.8 * s
    zz = 0.42 - 0.12 * math.sin(math.pi * ((s * 3) % 1.0)) + 0.02 * rng.random()
    bm = bmesh.new()
    bm_sphere(bm, (0, 0, 0), 0.006, 2, 0)
    fb = obj_from_bm(f"Fairy_{i:02d}", bm, C_DESK, [M["fairy"]])
    fb.location = (x, 0.85 + 0.06 * math.sin(s * 9), zz)

# --------------------------------------------------------------------------
# Bottle
# --------------------------------------------------------------------------
PROFILE = [  # (x, outer radius) from the punted base to the lip
    (-0.186, 0.0), (-0.187, 0.012), (-0.190, 0.030), (-0.195, 0.050), (-0.199, 0.066),
    (-0.200, 0.073), (-0.1985, 0.0775), (-0.195, 0.0795), (-0.190, 0.0800),
    (0.080, 0.0800), (0.095, 0.0792), (0.110, 0.0755), (0.124, 0.0680), (0.136, 0.0560),
    (0.146, 0.0430), (0.155, 0.0320), (0.163, 0.0255), (0.172, 0.0225), (0.185, 0.0215),
    (0.222, 0.0210), (0.224, 0.0222), (0.2255, 0.0242), (0.236, 0.0244), (0.2375, 0.0228),
    (0.238, 0.0210),
]


def lathe(profile, name, collection, mats, segs=128, solid=None):
    bm = bmesh.new()
    prev = None
    verts = []
    for x, r in profile:
        verts.append(bm.verts.new((x, 0.0, r)))
    for a, b in zip(verts[:-1], verts[1:]):
        bm.edges.new((a, b))
    ob = obj_from_bm(name, bm, collection, mats)
    sc = ob.modifiers.new("lathe", 'SCREW')
    sc.axis = 'X'
    sc.steps = segs
    sc.render_steps = segs
    sc.use_merge_vertices = True
    sc.merge_threshold = 1e-5
    sc.use_normal_calculate = True
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.modifier_apply(modifier="lathe")
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.faces.ensure_lookup_table()
    top = max(bm.faces, key=lambda f: f.calc_center_median().z)
    if top.normal.z < 0:
        for f in bm.faces:
            f.normal_flip()
    bm.to_mesh(ob.data)
    bm.free()
    if solid:
        so = ob.modifiers.new("thick", 'SOLIDIFY')
        so.thickness = solid
        so.offset = -1.0
        so.use_even_offset = True
        so.use_quality_normals = True
        bpy.ops.object.modifier_apply(modifier="thick")
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(ob.data)
    bm.free()
    for p in ob.data.polygons:
        p.use_smooth = True
    ob.location = (0, 0, AXIS_Z)
    return ob


bottle = lathe(PROFILE, "Bottle_Glass", C_BOTTLE, [M["glass"]], 128, GLASS_T)
zmax = max(v.co.z for v in bottle.data.vertices)
print(f"[bottle_city] bottle outer radius check: {zmax:.4f} (expect {R_OUT})")
ss = bottle.modifiers.new("smooth", 'SUBSURF')
ss.levels = 1
ss.render_levels = 2

# atmospheric haze filling the inside of the bottle
haze_prof = [(-0.181, 0.0), (-0.181, R_OUT - GLASS_T - 0.003)] + \
    [(x, r - GLASS_T - 0.003) for x, r in PROFILE if -0.18 <= x <= 0.222] + [(0.234, 0.0155), (0.234, 0.0)]
haze = lathe(haze_prof, "Bottle_Haze", C_BOTTLE, [M["haze"]], 64)
haze.visible_shadow = False
haze.hide_render = not OPT["haze"]
haze.hide_viewport = not OPT["haze"]

# --------------------------------------------------------------------------
# City base: soil slab + ground
# --------------------------------------------------------------------------
bm = bmesh.new()
ri = R_IN - 0.0006
angs = []
a_top = math.asin(FLOOR_REL / ri)          # negative angle where floor meets the glass
a_start = math.pi - a_top
a_end = 2 * math.pi + a_top
n_arc = 40
pts = []
for k in range(n_arc + 1):
    a = a_start + (a_end - a_start) * k / n_arc
    pts.append((ri * math.cos(a), ri * math.sin(a)))
# body length profile: the slab follows the punt at the base side
xs = (CITY_X0 - 0.004, CITY_X1 + 0.004)
front = [bm.verts.new((xs[0], y, z + AXIS_Z - FLOOR_Z)) for y, z in pts]
back = [bm.verts.new((xs[1], y, z + AXIS_Z - FLOOR_Z)) for y, z in pts]
bm.faces.new(front[::-1])
bm.faces.new(back)
for k in range(n_arc):
    bm.faces.new((front[k], front[k + 1], back[k + 1], back[k]))
bm.faces.new((front[-1], front[0], back[0], back[-1]))
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
slab = obj_from_bm("City_Soil", bm, C_CITY, [M["soil"]])
slab.location = (0, 0, FLOOR_Z)

# Street layout
LONG_STREETS = [(-0.032, 0.0075), (0.0, 0.0105), (0.032, 0.0075)]          # (y, width)
CROSS_STREETS = [(-0.150, 0.0075), (-0.105, 0.0075), (-0.060, 0.0085), (-0.015, 0.0075), (0.030, 0.0075)]
SIDEWALK = 0.0012

bm = bmesh.new()
for y, w in LONG_STREETS:
    bm_box(bm, CITY_X0, CITY_X1, y - w / 2, y + w / 2, ROAD_Z - 0.0003, ROAD_Z)
for x, w in CROSS_STREETS:
    bm_box(bm, x - w / 2, x + w / 2, -CITY_HALF_W, CITY_HALF_W, ROAD_Z - 0.0003, ROAD_Z)
obj_from_bm("Streets", bm, C_CITY, [M["road"]])

# road markings
bm = bmesh.new()
mz = ROAD_Z + 0.00002
for y, w in LONG_STREETS:
    x = CITY_X0 + 0.002
    while x < CITY_X1 - 0.003:
        near_cross = any(abs(x - cx) < cw / 2 + 0.0015 for cx, cw in CROSS_STREETS)
        if not near_cross:
            if w > 0.009:  # double yellow on the avenue
                bm_box(bm, x, x + 0.0022, y - 0.00022, y - 0.00008, ROAD_Z - 0.0001, mz, 0)
                bm_box(bm, x, x + 0.0022, y + 0.00008, y + 0.00022, ROAD_Z - 0.0001, mz, 0)
            else:
                bm_box(bm, x, x + 0.0015, y - 0.00008, y + 0.00008, ROAD_Z - 0.0001, mz, 1)
        x += 0.0025 if w > 0.009 else 0.0035
for x, w in CROSS_STREETS:
    for y, lw in LONG_STREETS:  # zebra crossings on each side of an intersection
        for side in (-1, 1):
            cy = y + side * (lw / 2 + 0.0012)
            for k in range(-4, 5):
                xx = x + k * (w / 9.0)
                bm_box(bm, xx - w / 40, xx + w / 40, cy - 0.0008, cy + 0.0008, ROAD_Z - 0.0001, mz, 1)
obj_from_bm("Road_Markings", bm, C_CITY, [M["paint_y"], M["paint_w"]])

# blocks
def spans(lines, lo, hi):
    out = []
    cur = lo
    for c, w in sorted(lines):
        out.append((cur, c - w / 2))
        cur = c + w / 2
    out.append((cur, hi))
    return out


X_SPANS = spans(CROSS_STREETS, CITY_X0, CITY_X1)
Y_SPANS = spans(LONG_STREETS, -CITY_HALF_W, CITY_HALF_W)
PARK = (2, 2)       # (x index, y index) of the park block
PLAZA = (4, 1)

bm_side = bmesh.new()
bm_grass = bmesh.new()
for xi, (bx0, bx1) in enumerate(X_SPANS):
    for yi, (by0, by1) in enumerate(Y_SPANS):
        target = bm_grass if (xi, yi) == PARK else bm_side
        bm_box(target, bx0, bx1, by0, by1, FLOOR_Z - 0.0003, ROAD_Z + 0.00035)
obj_from_bm("Sidewalks", bm_side, C_CITY, [M["sidewalk"]])
obj_from_bm("Park_Lawn", bm_grass, C_CITY, [M["grass"]])

BLOCK_TOP = ROAD_Z + 0.00035


def glass_limit(y_abs):
    """Max building top (above floor) under the curved glass at lateral offset y."""
    if y_abs >= R_IN:
        return 0.0
    return math.sqrt(R_IN ** 2 - y_abs ** 2) - FLOOR_REL - 0.006


# --------------------------------------------------------------------------
# Buildings
# --------------------------------------------------------------------------
DOWNTOWN = (-0.055, 0.0)
building_count = 0
beacon_spots = []


def make_building(x0, x1, y0, y1, height, name):
    global building_count
    curtain = height > 0.04 and rng.random() < 0.65
    mat_main = M["bld_glass"] if curtain else M["bld"]
    bm = bmesh.new()
    z0 = BLOCK_TOP
    kind = rng.random()
    w, d = x1 - x0, y1 - y0
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    top_z = z0 + height
    if height > 0.03 and kind < 0.45:
        # setback tower: 2-3 tiers
        tiers = rng.choice((2, 3))
        zc = z0
        sx, sy = w, d
        for t in range(tiers):
            th = height * (0.55 if t == 0 else (0.3 if t == 1 else 0.15)) if tiers == 3 else \
                height * (0.62 if t == 0 else 0.38)
            bm_box(bm, cx - sx / 2, cx + sx / 2, cy - sy / 2, cy + sy / 2, zc, zc + th, 0)
            zc += th
            bm_box(bm, cx - sx / 2 - 0.0002, cx + sx / 2 + 0.0002, cy - sy / 2 - 0.0002, cy + sy / 2 + 0.0002,
                   zc - 0.0004, zc + 0.00005, 1)  # cornice
            sx *= rng.uniform(0.62, 0.78)
            sy *= rng.uniform(0.62, 0.78)
        top_z = zc
        tw, td = sx, sy
    elif height > 0.025 and kind < 0.6 and min(w, d) > 0.007:
        # round tower
        r = min(w, d) / 2
        bm_cyl(bm, (cx, cy, z0 + height / 2), r, r, height, 32, 0)
        bm_cyl(bm, (cx, cy, z0 + height + 0.0003), r * 1.04, r * 1.04, 0.0006, 32, 1)
        top_z = z0 + height + 0.0006
        tw = td = r * 1.1
    else:
        bm_box(bm, x0, x1, y0, y1, z0, top_z, 0)
        if rng.random() < 0.7:  # parapet
            t = 0.00025
            ph = 0.0007
            bm_box(bm, x0, x1, y0, y0 + t, top_z, top_z + ph, 1)
            bm_box(bm, x0, x1, y1 - t, y1, top_z, top_z + ph, 1)
            bm_box(bm, x0, x0 + t, y0, y1, top_z, top_z + ph, 1)
            bm_box(bm, x1 - t, x1, y0, y1, top_z, top_z + ph, 1)
        tw, td = w * 0.8, d * 0.8
    # rooftop clutter: AC units, water tanks, antennas
    for _ in range(rng.randint(1, 4)):
        ux = cx + rng.uniform(-tw / 2.6, tw / 2.6)
        uy = cy + rng.uniform(-td / 2.6, td / 2.6)
        s = rng.uniform(0.0006, 0.0014)
        bm_box(bm, ux - s, ux + s, uy - s * 0.7, uy + s * 0.7, top_z, top_z + s * 0.9, 2)
    if rng.random() < 0.25 and height < 0.035:
        tx, ty = cx + rng.uniform(-tw / 4, tw / 4), cy + rng.uniform(-td / 4, td / 4)
        for lx, ly in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
            bm_box(bm, tx + lx * 0.0008 - 0.00008, tx + lx * 0.0008 + 0.00008,
                   ty + ly * 0.0008 - 0.00008, ty + ly * 0.0008 + 0.00008, top_z, top_z + 0.0012, 3)
        bm_cyl(bm, (tx, ty, top_z + 0.0012 + 0.0011), 0.0011, 0.0011, 0.0022, 16, 4)
        bm_cyl(bm, (tx, ty, top_z + 0.0012 + 0.0022 + 0.0004), 0.0011, 0.0001, 0.0008, 16, 4)
    if height > 0.045:
        ah = rng.uniform(0.006, 0.012)
        bm_cyl(bm, (cx, cy, top_z + ah / 2), 0.00022, 0.00008, ah, 6, 3)
        beacon_spots.append((cx, cy, top_z + ah))
    ob = obj_from_bm(name, bm, C_CITY, [mat_main, M["plaza"], M["metal"], M["dark_metal"], M["trunk"]])
    building_count += 1
    return ob


for xi, (bx0, bx1) in enumerate(X_SPANS):
    for yi, (by0, by1) in enumerate(Y_SPANS):
        if (xi, yi) in (PARK, PLAZA):
            continue
        ix0, ix1 = bx0 + SIDEWALK, bx1 - SIDEWALK
        iy0, iy1 = by0 + SIDEWALK, by1 - SIDEWALK
        rows = 2 if (iy1 - iy0) > 0.016 and rng.random() < 0.7 else 1
        row_edges = [iy0, iy1] if rows == 1 else [iy0, (iy0 + iy1) / 2 + rng.uniform(-0.002, 0.002), iy1]
        for r in range(rows):
            ry0, ry1 = row_edges[r], row_edges[r + 1]
            x = ix0
            while x < ix1 - 0.004:
                lw = rng.uniform(0.007, 0.0145)
                if ix1 - (x + lw) < 0.006:
                    lw = ix1 - x
                lx0, lx1 = x + 0.0003, x + lw - 0.0003
                ly0, ly1 = ry0 + 0.0003, ry1 - 0.0003
                cxm, cym = (lx0 + lx1) / 2, (ly0 + ly1) / 2
                dd = ((cxm - DOWNTOWN[0]) / 0.065) ** 2 + ((cym - DOWNTOWN[1]) / 0.06) ** 2
                h = 0.009 + 0.068 * math.exp(-dd) * rng.uniform(0.55, 1.0) + rng.uniform(0.0, 0.010)
                if rng.random() < 0.08:
                    h *= 1.5
                h = min(h, glass_limit(max(abs(ly0), abs(ly1))), path_clearance(lx0, lx1, ly0, ly1))
                if h > 0.005:
                    make_building(lx0, lx1, ly0, ly1, h, f"Bldg_{xi}{yi}_{r}_{building_count:03d}")
                x += lw

# park: trees, pond, paths
bx0, bx1 = X_SPANS[PARK[0]]
by0, by1 = Y_SPANS[PARK[1]]
bm = bmesh.new()
pond_c = ((bx0 + bx1) / 2 + 0.006, (by0 + by1) / 2 - 0.002)
bm_cyl(bm, (0, 0, BLOCK_TOP + 0.00002), 0.0075, 0.0075, 0.00006, 48, 0)
pond = obj_from_bm("Park_Pond", bm, C_CITY, [M["water"]])
pond.scale = (1.0, 0.65, 1.0)
pond.location = (pond_c[0], pond_c[1], 0)

bm_t = bmesh.new()
tree_spots = []
for _ in range(70):
    tx, ty = rng.uniform(bx0 + 0.0015, bx1 - 0.0015), rng.uniform(by0 + 0.0015, by1 - 0.0015)
    if ((tx - pond_c[0]) / 0.0085) ** 2 + ((ty - pond_c[1]) / 0.0058) ** 2 < 1:
        continue
    tree_spots.append((tx, ty, rng.uniform(0.7, 1.3)))
# street trees along the avenue
x = CITY_X0 + 0.004
while x < CITY_X1 - 0.004:
    if not any(abs(x - cx) < cw / 2 + 0.002 for cx, cw in CROSS_STREETS):
        for side in (-1, 1):
            tree_spots.append((x, side * (0.0105 / 2 + 0.0006), rng.uniform(0.6, 0.85)))
    x += 0.0065
for tx, ty, s in tree_spots:
    th = 0.0022 * s
    bm_cyl(bm_t, (tx, ty, BLOCK_TOP + th / 2), 0.00018 * s, 0.00012 * s, th, 6, 1)
    for k in range(3):
        o = Vector((rng.uniform(-0.4, 0.4), rng.uniform(-0.4, 0.4), rng.uniform(0, 0.6))) * 0.0012 * s
        bm_sphere(bm_t, (tx + o.x, ty + o.y, BLOCK_TOP + th + 0.0009 * s + o.z),
                  0.0011 * s * rng.uniform(0.8, 1.15), 1, 0)
trees = obj_from_bm("Trees", bm_t, C_CITY, [M["leaves"], M["trunk"]])
dsp = trees.modifiers.new("lumpy", 'DISPLACE')
tex = bpy.data.textures.new("tree_noise", 'CLOUDS')
tex.noise_scale = 0.0008
dsp.texture = tex
dsp.strength = 0.0005
dsp.texture_coords = 'GLOBAL'

# plaza with an obelisk / fountain
bx0, bx1 = X_SPANS[PLAZA[0]]
by0, by1 = Y_SPANS[PLAZA[1]]
pc = ((bx0 + bx1) / 2, (by0 + by1) / 2)
bm = bmesh.new()
bm_box(bm, bx0 + SIDEWALK, bx1 - SIDEWALK, by0 + SIDEWALK, by1 - SIDEWALK, BLOCK_TOP - 0.0001, BLOCK_TOP + 0.00015, 0)
bm_cyl(bm, (pc[0], pc[1], BLOCK_TOP + 0.0004), 0.0045, 0.0045, 0.0006, 48, 0)
bm_cyl(bm, (pc[0], pc[1], BLOCK_TOP + 0.0006), 0.0040, 0.0040, 0.0003, 48, 2)
bm_cyl(bm, (pc[0], pc[1], BLOCK_TOP + 0.0045), 0.0005, 0.0002, 0.008, 4, 1)
obj_from_bm("Plaza", bm, C_CITY, [M["plaza"], M["brass"], M["water"]])

# street lamps along every street
bm = bmesh.new()
lamp_h = 0.0055


def lamp(x, y, dirx, diry):
    bm_box(bm, x - 0.00009, x + 0.00009, y - 0.00009, y + 0.00009, BLOCK_TOP, BLOCK_TOP + lamp_h, 0)
    ax, ay = x + dirx * 0.0009, y + diry * 0.0009
    bm_box(bm, min(x, ax) - 0.00007, max(x, ax) + 0.00007, min(y, ay) - 0.00007, max(y, ay) + 0.00007,
           BLOCK_TOP + lamp_h - 0.00014, BLOCK_TOP + lamp_h, 0)
    bm_box(bm, ax - 0.00022, ax + 0.00022, ay - 0.00016, ay + 0.00016,
           BLOCK_TOP + lamp_h - 0.0003, BLOCK_TOP + lamp_h - 0.00012, 1)


for y, w in LONG_STREETS:
    x = CITY_X0 + 0.003
    while x < CITY_X1 - 0.002:
        if not any(abs(x - cx) < cw / 2 + 0.0012 for cx, cw in CROSS_STREETS):
            lamp(x, y - w / 2 - 0.00045, 0, 1)
            lamp(x + 0.006, y + w / 2 + 0.00045, 0, -1)
        x += 0.012
for xc, w in CROSS_STREETS:
    y = -CITY_HALF_W + 0.004
    while y < CITY_HALF_W - 0.003:
        if not any(abs(y - ly) < lw / 2 + 0.0012 for ly, lw in LONG_STREETS):
            lamp(xc - w / 2 - 0.00045, y, 1, 0)
            lamp(xc + w / 2 + 0.00045, y + 0.006, -1, 0)
        y += 0.012
obj_from_bm("Street_Lamps", bm, C_CITY, [M["dark_metal"], M["lamp_head"]])

# aircraft warning beacons on the tallest towers
for i, (bx, by, bz) in enumerate(beacon_spots):
    bm = bmesh.new()
    bm_sphere(bm, (0, 0, 0), 0.00035, 1, 0)
    b = obj_from_bm(f"Beacon_{i:02d}", bm, C_CITY, [M["beacon"]])
    b.location = (bx, by, bz)

# --------------------------------------------------------------------------
# Traffic
# --------------------------------------------------------------------------
CAR_SPEED = 0.0125      # m/s in the miniature ~ 45 km/h at 1:1000 scale


def rounded_loop(x0, x1, y0, y1, r, clockwise):
    """Rounded rectangle polyline (counter-clockwise by default)."""
    pts = []
    corners = [(x1 - r, y0 + r, -90), (x1 - r, y1 - r, 0), (x0 + r, y1 - r, 90), (x0 + r, y0 + r, 180)]
    for cx, cy, a0 in corners:
        for k in range(7):
            a = math.radians(a0 + 90 * k / 6)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    if clockwise:
        pts.reverse()
    return pts


def loop_curve(name, pts):
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '3D'
    cu.use_path = True
    sp = cu.splines.new('POLY')
    sp.points.add(len(pts) - 1)
    for p, (x, y) in zip(sp.points, pts):
        p.co = (x, y, BLOCK_TOP - 0.00035 + 0.00008, 1.0)
    sp.use_cyclic_u = True
    ob = bpy.data.objects.new(name, cu)
    C_TRAFFIC.objects.link(ob)
    ob.hide_render = True
    length = sum(math.dist(pts[i], pts[(i + 1) % len(pts)]) for i in range(len(pts)))
    return ob, length


def street_y(i):
    return LONG_STREETS[i][0]


def street_x(i):
    return CROSS_STREETS[i][0]


LANE = 0.0019
loops = []
# clockwise loops use the inner lanes of the long streets (right-hand traffic)
loops.append(rounded_loop(street_x(0) + LANE, street_x(4) - LANE, street_y(0) + LANE, street_y(1) - LANE - 0.0008,
                          0.0025, True))
loops.append(rounded_loop(street_x(0) + LANE, street_x(4) - LANE, street_y(1) + LANE + 0.0008, street_y(2) - LANE,
                          0.0025, True))
# counter-clockwise loops around each column use the outer lanes
for k in range(4):
    loops.append(rounded_loop(street_x(k) - LANE, street_x(k + 1) + LANE, street_y(0) - LANE, street_y(2) + LANE,
                              0.003, False))

CAR_COLORS = [(0.55, 0.02, 0.02), (0.02, 0.06, 0.25), (0.8, 0.8, 0.78), (0.03, 0.03, 0.03),
              (0.35, 0.36, 0.38), (0.9, 0.55, 0.02), (0.05, 0.2, 0.1), (0.6, 0.6, 0.62), (0.75, 0.62, 0.02)]


def car_mesh(kind):
    bm = bmesh.new()
    if kind == "bus":
        L, W, H = 0.0095, 0.0022, 0.0028
        bm_box(bm, -L / 2, L / 2, -W / 2, W / 2, 0.0004, H, 0)
        bm_box(bm, -L / 2 + 0.0004, L / 2 - 0.0002, -W / 2 - 0.00002, W / 2 + 0.00002, H * 0.55, H * 0.85, 1)
        bm_box(bm, L / 2 - 0.00005, L / 2 + 0.00002, -W / 2 + 0.0002, W / 2 - 0.0002, H * 0.5, H * 0.9, 1)
        wheels = (-L / 2 + 0.0015, L / 2 - 0.0015)
    else:
        L, W = (0.0046, 0.0019) if kind == "car" else (0.0050, 0.0020)
        bm_box(bm, -L / 2, L / 2, -W / 2, W / 2, 0.0003, 0.0011, 0)
        cl = L * (0.48 if kind == "car" else 0.62)
        co = -0.0003 if kind == "car" else -0.0006
        bm_box(bm, co - cl / 2, co + cl / 2, -W / 2 + 0.00012, W / 2 - 0.00012, 0.0011, 0.0017, 1)
        wheels = (-L / 2 + 0.0009, L / 2 - 0.0009)
    for wx in wheels:
        for s in (-1, 1):
            bm_cyl(bm, (wx, s * (W / 2 - 0.0001), 0.00038), 0.00038, 0.00038, 0.00034, 12, 2,
                   Matrix.Rotation(math.pi / 2, 4, 'X'))
    for s in (-1, 1):
        bm_box(bm, L / 2 - 0.00008, L / 2 + 0.00003, s * W * 0.32 - 0.00022, s * W * 0.32 + 0.00022,
               0.0006, 0.00085, 3)
        bm_box(bm, -L / 2 - 0.00003, -L / 2 + 0.00008, s * W * 0.34 - 0.00025, s * W * 0.34 + 0.00025,
               0.0006, 0.0009, 4)
    me = bpy.data.meshes.new(f"Vehicle_{kind}")
    bm.to_mesh(me)
    bm.free()
    for m in (M["car"], M["car_glass"], M["tire"], M["headlight"], M["taillight"]):
        me.materials.append(m)
    return me, L


VEH = {k: car_mesh(k) for k in ("car", "van", "bus")}
car_total = 0
for li, pts in enumerate(loops):
    cob, length = loop_curve(f"TrafficLoop_{li}", pts)
    period = length / CAR_SPEED * FPS
    n = max(4, int(length / 0.03))
    for ci in range(n):
        kind = "bus" if rng.random() < 0.08 else ("van" if rng.random() < 0.2 else "car")
        me, L = VEH[kind]
        car = bpy.data.objects.new(f"Car_{li}_{ci:02d}", me)
        C_TRAFFIC.objects.link(car)
        car.color = (*(rng.choice(CAR_COLORS) if kind != "bus" else (0.75, 0.12, 0.05)), 1)
        fp = car.constraints.new('FOLLOW_PATH')
        fp.target = cob
        fp.use_curve_follow = True
        fp.use_fixed_location = True
        fp.forward_axis = 'FORWARD_X'
        fp.up_axis = 'UP_Z'
        phase = (ci + rng.uniform(-0.2, 0.2)) / n
        speed_scale = 1.0
        f0 = 1 - phase * period
        fp.offset_factor = 0.0
        fp.keyframe_insert("offset_factor", frame=f0)
        fp.offset_factor = 1.0
        fp.keyframe_insert("offset_factor", frame=f0 + period * speed_scale)
        set_linear(car, cyclic=True)
        # headlight beam
        ld = bpy.data.lights.new(f"Headlight_{li}_{ci}", 'SPOT')
        ld.energy = 0.012
        ld.color = (1.0, 0.88, 0.72)
        ld.spot_size = math.radians(70)
        ld.spot_blend = 0.6
        ld.shadow_soft_size = 0.0002
        lo = bpy.data.objects.new(f"Headlight_{li}_{ci}", ld)
        C_TRAFFIC.objects.link(lo)
        lo.parent = car
        lo.location = (L / 2 + 0.0002, 0, 0.0007)
        lo.rotation_euler = (0, math.radians(-82), 0)
        car_total += 1

# --------------------------------------------------------------------------
# Clouds and an airship
# --------------------------------------------------------------------------
CLOUD_SPEED = 0.0016  # m/s, drifting toward -X


def make_cloud(name, size, seed):
    sx, sy, sz = size * 1.7, size * 0.95, size * 0.75
    bm = bmesh.new()
    bm_sphere(bm, (0, 0, 0), 1.0, 3, 0, (sx, sy, sz))
    cl = obj_from_bm(name, bm, C_SKY, [M["cloud"]])
    cl["cloud_inv"] = (1.0 / sx, 1.0 / sy, 1.0 / sz)
    cl.rotation_euler = (0, 0, random.Random(seed).uniform(-0.4, 0.4))
    cl.visible_shadow = True
    return cl


# (x at t=0, y, z, size) -- one cloud is placed to be in the camera's path at t=43s
CLOUDS = [(-0.110 + CLOUD_SPEED * 43.0, 0.004, 0.123, 0.010),
          (-0.020, -0.018, 0.133, 0.011), (0.040, 0.020, 0.128, 0.009),
          (-0.150 + CLOUD_SPEED * 50, 0.024, 0.136, 0.009), (0.010, 0.030, 0.118, 0.007),
          (-0.070, -0.028, 0.120, 0.008), (0.065, -0.010, 0.138, 0.010)]
for i, (x, y, zc, s) in enumerate(CLOUDS):
    cl = make_cloud(f"Cloud_{i}", s, 100 + i)
    cl.location = (x, y, zc)
    cl.keyframe_insert("location", frame=1)
    cl.location = (x - CLOUD_SPEED * SECONDS, y + 0.002 * math.sin(i), zc)
    cl.keyframe_insert("location", frame=FRAMES + 1)
    set_linear(cl)

# airship drifting among the towers
bm = bmesh.new()
bm_sphere(bm, (0, 0, 0), 0.001, 3, 0, (4.2, 1.15, 1.15))
for s in (-1, 1):
    bm_box(bm, -0.0042, -0.0030, -0.00004, 0.00004, 0, s * 0.0012 if s > 0 else 0.0, 1)
bm_box(bm, -0.0042, -0.0030, -0.0012, 0.0012, -0.00004, 0.00004, 1)
bm_box(bm, -0.0012, 0.0012, -0.00035, 0.00035, -0.0016, -0.0010, 1)
bm_box(bm, -0.0010, 0.0010, -0.00036, 0.00036, -0.00145, -0.00120, 2)
ship = obj_from_bm("Airship", bm, C_SKY, [M["airship"], M["gondola"], M["win_warm"]])
for t, (x, y, zz, yaw) in [(0, (0.05, -0.022, 0.108, 180)), (30, (-0.02, -0.03, 0.112, 190)),
                            (60, (-0.09, -0.024, 0.110, 175))]:
    ship.location = (x, y, zz)
    ship.rotation_euler = (0, 0, math.radians(yaw))
    ship.keyframe_insert("location", frame=1 + t * FPS)
    ship.keyframe_insert("rotation_euler", frame=1 + t * FPS)
bm = bmesh.new()
bm_sphere(bm, (0, 0, 0), 0.00018, 1, 0)
sb = obj_from_bm("Airship_Beacon", bm, C_SKY, [M["beacon"]])
sb.parent = ship
sb.location = (0.0, 0.0, -0.00165)

# --------------------------------------------------------------------------
# Lighting & world
# --------------------------------------------------------------------------
world = bpy.data.worlds.new("Workshop")
scene.world = world
world.use_nodes = True
wn = world.node_tree
wn.nodes.clear()
wout = wn.nodes.new('ShaderNodeOutputWorld')
bg = wn.nodes.new('ShaderNodeBackground')
bg.inputs["Strength"].default_value = 0.35
env = wn.nodes.new('ShaderNodeTexEnvironment')
if os.path.exists(HDRI):
    env.image = bpy.data.images.load(HDRI)
    link(wn, env.outputs[0], bg.inputs[0])
else:
    bg.inputs[0].default_value = (0.08, 0.06, 0.05, 1)
wtc = wn.nodes.new('ShaderNodeTexCoord')
wmp = wn.nodes.new('ShaderNodeMapping')
wmp.inputs["Rotation"].default_value = (0, 0, math.radians(-10))
link(wn, wtc.outputs["Generated"], wmp.inputs[0])
link(wn, wmp.outputs[0], env.inputs[0])
link(wn, bg.outputs[0], wout.inputs[0])


def add_light(name, kind, energy, color, loc=None, direction=None, **kw):
    ld = bpy.data.lights.new(name, kind)
    ld.energy = energy
    ld.color = color
    for k, v in kw.items():
        setattr(ld, k, v)
    ob = bpy.data.objects.new(name, ld)
    C_LIGHTS.objects.link(ob)
    if loc:
        ob.location = loc
    if direction:
        ob.rotation_mode = 'QUATERNION'
        ob.rotation_quaternion = Vector(direction).normalized().to_track_quat('-Z', 'Y')
    return ob


# low golden sun coming through the workshop window, backlighting the bottle
add_light("Sun_Golden", 'SUN', 4.2, (1.0, 0.66, 0.38), direction=(0.32, -0.90, -0.27), angle=math.radians(1.2))
# cool bounce from the room
add_light("Fill_Cool", 'AREA', 6.0, (0.62, 0.74, 1.0), loc=(-0.35, -0.6, 0.55),
          direction=(0.35, 0.6, -0.5), size=0.6)
# warm rim from behind-right
add_light("Rim_Warm", 'AREA', 10.0, (1.0, 0.55, 0.25), loc=(0.6, 0.55, 0.35),
          direction=(-0.6, -0.55, -0.3), size=0.25)

# --------------------------------------------------------------------------
# Camera (baked per frame from the spline above)
# --------------------------------------------------------------------------
cam_data = bpy.data.cameras.new("CineCam")
cam_data.sensor_width = 36.0
cam_data.clip_start = 0.0003
cam_data.clip_end = 30.0
cam_data.dof.use_dof = True
cam_data.dof.aperture_blades = 7
cam_data.dof.aperture_rotation = math.radians(12)
cam = bpy.data.objects.new("CineCam", cam_data)
C_CAM.objects.link(cam)
scene.camera = cam
cam.rotation_mode = 'QUATERNION'

prev_q = None
clip_warn = []
for f in range(1, FRAMES + 2):
    p, l, s = cam_state(f)
    d = (l - p)
    q = d.normalized().to_track_quat('-Z', 'Y')
    q = q @ Quaternion((0, 0, 1), math.radians(s.z))
    if prev_q is not None and prev_q.dot(q) < 0:
        q.negate()
    prev_q = q.copy()
    cam.location = p
    cam.rotation_quaternion = q
    cam.keyframe_insert("location", frame=f)
    cam.keyframe_insert("rotation_quaternion", frame=f)
    cam_data.lens = s.x
    cam_data.dof.aperture_fstop = s.y
    cam_data.dof.focus_distance = d.length
    cam_data.keyframe_insert("lens", frame=f)
    cam_data.dof.keyframe_insert("aperture_fstop", frame=f)
    cam_data.dof.keyframe_insert("focus_distance", frame=f)
    # sanity: is the camera inside the glass wall?
    rel = Vector((0, p.y, p.z - AXIS_Z))
    if -0.2 < p.x < 0.08 and abs(rel.length - (R_OUT - GLASS_T / 2)) < 0.004:
        clip_warn.append(f)
set_linear(cam)
set_linear(cam_data)

# --------------------------------------------------------------------------
# Render settings & compositing
# --------------------------------------------------------------------------
scene.frame_start = 1
scene.frame_end = FRAMES
scene.render.fps = FPS
scene.render.engine = 'CYCLES'
cy = scene.cycles
cy.device = 'CPU'
cy.samples = OPT["samples"]
cy.use_adaptive_sampling = True
cy.adaptive_threshold = 0.03
cy.use_denoising = True
cy.denoiser = 'OPENIMAGEDENOISE'
cy.denoising_input_passes = 'RGB_ALBEDO_NORMAL'
cy.denoising_quality = 'HIGH'
cy.denoising_prefilter = 'FAST'
cy.max_bounces = 8
cy.diffuse_bounces = 2
cy.glossy_bounces = 2
cy.transmission_bounces = 8
cy.transparent_max_bounces = 8
cy.volume_bounces = 1
cy.caustics_reflective = False
cy.caustics_refractive = False
cy.blur_glossy = 1.0
cy.sample_clamp_indirect = 8.0
cy.use_light_tree = True
cy.volume_step_rate = 2.0
cy.volume_max_steps = 256
scene.render.use_motion_blur = True
scene.render.motion_blur_shutter = 0.5
scene.render.resolution_x, scene.render.resolution_y = OPT["res"]
scene.render.resolution_percentage = 100
scene.render.film_transparent = False
scene.view_settings.view_transform = 'AgX'
scene.view_settings.look = 'AgX - Medium High Contrast'
scene.view_settings.exposure = 0.0
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_depth = '8'
scene.render.filepath = os.path.join(HERE, "render", "frames", "frame_")
scene.render.use_persistent_data = True

scene.use_nodes = True
ct = scene.node_tree
ct.nodes.clear()
rl = ct.nodes.new('CompositorNodeRLayers')
glare = ct.nodes.new('CompositorNodeGlare')
glare.glare_type = 'BLOOM'
glare.quality = 'HIGH'


def set_in(nd, name, val):
    if name in nd.inputs:
        nd.inputs[name].default_value = val
    else:
        print(f"[bottle_city] note: {nd.bl_idname} has no input {name}")


set_in(glare, "Threshold", 1.2)
set_in(glare, "Strength", 0.30)
set_in(glare, "Size", 0.55)
lens_dist = ct.nodes.new('CompositorNodeLensdist')
set_in(lens_dist, "Dispersion", 0.010)
set_in(lens_dist, "Distortion", -0.006)
# vignette: blurred ellipse -> multiply
ell = ct.nodes.new('CompositorNodeEllipseMask')
set_in(ell, "Size", (1.05, 0.95))
blur = ct.nodes.new('CompositorNodeBlur')
blur.name = "VignetteBlur"
blur.filter_type = 'FAST_GAUSS'
set_in(blur, "Size", (0.22 * OPT["res"][0], 0.22 * OPT["res"][0]))
vig = ct.nodes.new('CompositorNodeMixRGB')
vig.blend_type = 'MULTIPLY'
vmap = ct.nodes.new('CompositorNodeMapRange')
vmap.inputs[3].default_value = 0.62
vmap.inputs[4].default_value = 1.0
comp = ct.nodes.new('CompositorNodeComposite')
ct.links.new(rl.outputs["Image"], glare.inputs["Image"])
ct.links.new(glare.outputs["Image"], lens_dist.inputs["Image"])
ct.links.new(ell.outputs[0], blur.inputs[0])
ct.links.new(blur.outputs[0], vmap.inputs[0])
ct.links.new(lens_dist.outputs["Image"], vig.inputs[1])
ct.links.new(vmap.outputs[0], vig.inputs[2])
vig.inputs[0].default_value = 1.0
ct.links.new(vig.outputs[0], comp.inputs[0])

# Emissive surfaces (windows, lamps, lights on cars) glow and bloom but are not explicitly sampled
# as lights: ~20% faster on CPU; the spot lights on the cars handle real illumination.
for m in bpy.data.materials:
    m.cycles.emission_sampling = 'NONE'

scene.frame_set(1)

print(f"[bottle_city] buildings={building_count} cars={car_total} beacons={len(beacon_spots)} "
      f"trees={len(tree_spots)} glass-proximity frames={clip_warn[:3]}..{clip_warn[-3:] if clip_warn else ''} "
      f"({len(clip_warn)})")

if OPT["save"]:
    os.makedirs(os.path.dirname(OPT["save"]), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=OPT["save"], compress=True, relative_remap=True)
    bpy.ops.file.make_paths_relative()
    bpy.ops.file.pack_all()  # embed the HDRI so the .blend is self-contained
    scene.render.filepath = "//render/frames/frame_"
    bpy.ops.wm.save_mainfile(compress=True)
    print(f"[bottle_city] saved {OPT['save']}")
