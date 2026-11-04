"""Blender-side helpers: images, materials, fog/sky environment, meshes, bulk animation."""
import math
import bpy
import numpy as np
from mathutils import Vector, Euler

from . import textures

FPS = 24


# ====================================================================== scene
def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scn = bpy.context.scene
    scn.render.fps = FPS
    return scn


def collection(name):
    c = bpy.data.collections.get(name)
    if c is None:
        c = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(c)
    return c


def link(obj, coll=None):
    (coll or bpy.context.scene.collection).objects.link(obj)
    return obj


def empty(name, loc=(0, 0, 0), parent=None, coll=None):
    o = bpy.data.objects.new(name, None)
    o.empty_display_size = 0.2
    o.location = loc
    if parent:
        o.parent = parent
    return link(o, coll)


# ====================================================================== images
def make_image(name, arr, non_color=False):
    arr = np.asarray(arr, dtype=np.float32)
    if arr.ndim == 2:
        arr = np.repeat(arr[..., None], 3, -1)
    h, w, c = arr.shape
    if c == 3:
        arr = np.concatenate([arr, np.ones((h, w, 1), np.float32)], -1)
    img = bpy.data.images.new(name, w, h, alpha=True, float_buffer=False)
    img.pixels.foreach_set(np.ascontiguousarray(arr[::-1]).ravel())
    if non_color:
        img.colorspace_settings.name = "Non-Color"
    img.pixels.foreach_set(np.ascontiguousarray(arr[::-1]).ravel())
    img.pack()
    return img


_ATLAS = {}


def atlases():
    if not _ATLAS:
        c, m, e = textures.build_atlases()
        p, pt = textures.build_plant_atlas()
        _ATLAS["col"] = make_image("atlas_col", c)
        _ATLAS["mask"] = make_image("atlas_mask", m, non_color=True)
        _ATLAS["emit"] = make_image("atlas_emit", e)
        _ATLAS["plant"] = make_image("atlas_plant", p)
    return _ATLAS


# ====================================================================== env params
ENV_DEFAULTS = {
    # name: (type, default)
    "fog_color": ("RGB", (0.7, 0.8, 0.95)),
    "fog_density": ("VAL", 0.004),
    "fog_start": ("VAL", 30.0),
    "fog_max": ("VAL", 1.0),
    "fog_h0": ("VAL", 70.0),
    "fog_hfall": ("VAL", 0.0),
    "fog_hamt": ("VAL", 0.0),
    "zenith": ("RGB", (0.25, 0.45, 0.9)),
    "horizon": ("RGB", (0.7, 0.8, 0.95)),
    "ground": ("RGB", (0.3, 0.3, 0.32)),
    "sun_color": ("RGB", (1.0, 0.9, 0.7)),
    "sun_glow": ("VAL", 0.4),
    "sun_x": ("VAL", 0.0), "sun_y": ("VAL", 0.5), "sun_z": ("VAL", 0.8),
    "sky_strength": ("VAL", 1.0),
    "star_amount": ("VAL", 0.0),
    "emit_strength": ("VAL", 1.0),
    "flash": ("VAL", 0.0),
    "ambient": ("VAL", 0.45),
    "amb_sat": ("VAL", 0.45),
}


def env_group():
    ng = bpy.data.node_groups.get("Env")
    if ng:
        return ng
    ng = bpy.data.node_groups.new("Env", "ShaderNodeTree")
    out = ng.nodes.new("NodeGroupOutput")
    y = 0
    for name, (typ, val) in ENV_DEFAULTS.items():
        if typ == "RGB":
            n = ng.nodes.new("ShaderNodeRGB")
            n.outputs[0].default_value = (*val, 1)
            ng.interface.new_socket(name, in_out="OUTPUT", socket_type="NodeSocketColor")
        else:
            n = ng.nodes.new("ShaderNodeValue")
            n.outputs[0].default_value = val
            ng.interface.new_socket(name, in_out="OUTPUT", socket_type="NodeSocketFloat")
        n.name = n.label = name
        n.location = (0, y)
        y -= 120
        ng.links.new(n.outputs[0], out.inputs[name])
    out.location = (400, 0)
    return ng


def _math(nt, op, a=None, b=None, loc=(0, 0)):
    n = nt.nodes.new("ShaderNodeMath")
    n.operation = op
    n.location = loc
    for i, v in enumerate((a, b)):
        if v is None:
            continue
        if isinstance(v, (int, float)):
            n.inputs[i].default_value = v
        else:
            nt.links.new(v, n.inputs[i])
    return n.outputs[0]


def fog_group():
    ng = bpy.data.node_groups.get("Fog")
    if ng:
        return ng
    ng = bpy.data.node_groups.new("Fog", "ShaderNodeTree")
    ng.interface.new_socket("Shader", in_out="INPUT", socket_type="NodeSocketShader")
    ng.interface.new_socket("Shader", in_out="OUTPUT", socket_type="NodeSocketShader")
    gi = ng.nodes.new("NodeGroupInput")
    go = ng.nodes.new("NodeGroupOutput")
    env = ng.nodes.new("ShaderNodeGroup")
    env.node_tree = env_group()
    cam = ng.nodes.new("ShaderNodeCameraData")
    geo = ng.nodes.new("ShaderNodeNewGeometry")
    sep = ng.nodes.new("ShaderNodeSeparateXYZ")
    ng.links.new(geo.outputs["Position"], sep.inputs[0])
    E = env.outputs
    d = _math(ng, "SUBTRACT", cam.outputs["View Distance"], E["fog_start"])
    d = _math(ng, "MAXIMUM", d, 0.0)
    d = _math(ng, "MULTIPLY", d, E["fog_density"])
    d = _math(ng, "MULTIPLY", d, -1.0)
    d = _math(ng, "EXPONENT", d)
    f1 = _math(ng, "SUBTRACT", 1.0, d)
    hz = _math(ng, "SUBTRACT", sep.outputs[2], E["fog_h0"])
    hz = _math(ng, "MAXIMUM", hz, 0.0)
    hz = _math(ng, "MULTIPLY", hz, E["fog_hfall"])
    hz = _math(ng, "MULTIPLY", hz, -1.0)
    hf = _math(ng, "EXPONENT", hz)
    hf = _math(ng, "SUBTRACT", hf, 1.0)
    hf = _math(ng, "MULTIPLY", hf, E["fog_hamt"])
    hf = _math(ng, "ADD", hf, 1.0)
    fac = _math(ng, "MULTIPLY", f1, hf)
    fac = _math(ng, "MULTIPLY", fac, E["fog_max"])
    n = ng.nodes.new("ShaderNodeMath"); n.operation = "MINIMUM"; n.use_clamp = True
    ng.links.new(fac, n.inputs[0]); n.inputs[1].default_value = 1.0
    em = ng.nodes.new("ShaderNodeEmission")
    ng.links.new(E["fog_color"], em.inputs["Color"])
    mix = ng.nodes.new("ShaderNodeMixShader")
    ng.links.new(n.outputs[0], mix.inputs[0])
    ng.links.new(gi.outputs[0], mix.inputs[1])
    ng.links.new(em.outputs[0], mix.inputs[2])
    ng.links.new(mix.outputs[0], go.inputs[0])
    return ng


def _hurt_mix(nt, color_socket):
    """Mix colour towards red by the object's custom 'hurt' property."""
    at = nt.nodes.new("ShaderNodeAttribute")
    at.attribute_type = "OBJECT"
    at.attribute_name = "hurt"
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    nt.links.new(at.outputs["Fac"], mix.inputs[0])
    nt.links.new(color_socket, mix.inputs[6])
    mix.inputs[7].default_value = (0.9, 0.05, 0.03, 1)
    return mix.outputs[2]


def _finish(nt, shader_socket, fog=True):
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    if fog:
        f = nt.nodes.new("ShaderNodeGroup")
        f.node_tree = fog_group()
        nt.links.new(shader_socket, f.inputs[0])
        shader_socket = f.outputs[0]
    nt.links.new(shader_socket, out.inputs["Surface"])


def _img_node(nt, img, uv=None, closest=True):
    t = nt.nodes.new("ShaderNodeTexImage")
    t.image = img
    t.interpolation = "Closest" if closest else "Linear"
    if uv is not None:
        nt.links.new(uv, t.inputs[0])
    return t


def terrain_material():
    m = bpy.data.materials.get("Terrain")
    if m:
        return m
    A = atlases()
    m = bpy.data.materials.new("Terrain")
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    tex = _img_node(nt, A["col"])
    msk = _img_node(nt, A["mask"])
    emi = _img_node(nt, A["emit"])
    col = nt.nodes.new("ShaderNodeVertexColor"); col.layer_name = "col"
    ao = nt.nodes.new("ShaderNodeAttribute"); ao.attribute_name = "ao"
    tint = nt.nodes.new("ShaderNodeMix"); tint.data_type = "RGBA"
    nt.links.new(msk.outputs["Color"], tint.inputs[0])
    tint.inputs[6].default_value = (1, 1, 1, 1)
    nt.links.new(col.outputs["Color"], tint.inputs[7])
    m1 = nt.nodes.new("ShaderNodeMix"); m1.data_type = "RGBA"; m1.blend_type = "MULTIPLY"
    m1.inputs[0].default_value = 1
    nt.links.new(tex.outputs["Color"], m1.inputs[6]); nt.links.new(tint.outputs[2], m1.inputs[7])
    m2 = nt.nodes.new("ShaderNodeMix"); m2.data_type = "RGBA"; m2.blend_type = "MULTIPLY"
    m2.inputs[0].default_value = 1
    nt.links.new(m1.outputs[2], m2.inputs[6]); nt.links.new(ao.outputs["Fac"], m2.inputs[7])
    dif = nt.nodes.new("ShaderNodeBsdfDiffuse")
    nt.links.new(m2.outputs[2], dif.inputs["Color"])
    env = nt.nodes.new("ShaderNodeGroup"); env.node_tree = env_group()
    em = nt.nodes.new("ShaderNodeEmission")
    nt.links.new(emi.outputs["Color"], em.inputs["Color"])
    nt.links.new(env.outputs["emit_strength"], em.inputs["Strength"])
    add = nt.nodes.new("ShaderNodeAddShader")
    nt.links.new(dif.outputs[0], add.inputs[0]); nt.links.new(em.outputs[0], add.inputs[1])
    _finish(nt, add.outputs[0])
    return m


def water_material():
    m = bpy.data.materials.get("Water")
    if m:
        return m
    m = bpy.data.materials.new("Water")
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    p = nt.nodes.new("ShaderNodeBsdfPrincipled")
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 0.6
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (0.08, 0.2, 0.55, 1)
    ramp.color_ramp.elements[1].color = (0.15, 0.35, 0.75, 1)
    nt.links.new(noise.outputs["Fac"], ramp.inputs[0])
    nt.links.new(ramp.outputs[0], p.inputs["Base Color"])
    p.inputs["Roughness"].default_value = 0.3
    p.inputs["Specular IOR Level"].default_value = 0.25
    p.inputs["Alpha"].default_value = 0.82
    _finish(nt, p.outputs[0])
    return m


def plant_material():
    m = bpy.data.materials.get("Plants")
    if m:
        return m
    A = atlases()
    m = bpy.data.materials.new("Plants")
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    tex = _img_node(nt, A["plant"])
    col = nt.nodes.new("ShaderNodeVertexColor"); col.layer_name = "col"
    mul = nt.nodes.new("ShaderNodeMix"); mul.data_type = "RGBA"; mul.blend_type = "MULTIPLY"
    mul.inputs[0].default_value = 1
    nt.links.new(tex.outputs["Color"], mul.inputs[6]); nt.links.new(col.outputs["Color"], mul.inputs[7])
    dif = nt.nodes.new("ShaderNodeBsdfDiffuse")
    nt.links.new(mul.outputs[2], dif.inputs["Color"])
    tr = nt.nodes.new("ShaderNodeBsdfTransparent")
    f = nt.nodes.new("ShaderNodeGroup"); f.node_tree = fog_group()
    nt.links.new(dif.outputs[0], f.inputs[0])
    mix = nt.nodes.new("ShaderNodeMixShader")
    gt = nt.nodes.new("ShaderNodeMath"); gt.operation = "GREATER_THAN"; gt.inputs[1].default_value = 0.5
    nt.links.new(tex.outputs["Alpha"], gt.inputs[0])
    nt.links.new(gt.outputs[0], mix.inputs[0])
    nt.links.new(tr.outputs[0], mix.inputs[1]); nt.links.new(f.outputs[0], mix.inputs[2])
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(mix.outputs[0], out.inputs["Surface"])
    return m


def flat_material(name, color, emission=0.0, fog=True, alpha=1.0, emit_color=None, rough=0.9):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    if emission > 0 and emit_color is None:
        em = nt.nodes.new("ShaderNodeEmission")
        em.inputs["Color"].default_value = (*color, 1)
        em.inputs["Strength"].default_value = emission
        sh = em.outputs[0]
    else:
        p = nt.nodes.new("ShaderNodeBsdfDiffuse")
        p.inputs["Color"].default_value = (*color, 1)
        sh = p.outputs[0]
        if emission > 0:
            em = nt.nodes.new("ShaderNodeEmission")
            em.inputs["Color"].default_value = (*emit_color, 1)
            em.inputs["Strength"].default_value = emission
            add = nt.nodes.new("ShaderNodeAddShader")
            nt.links.new(sh, add.inputs[0]); nt.links.new(em.outputs[0], add.inputs[1])
            sh = add.outputs[0]
    if alpha < 1.0:
        tr = nt.nodes.new("ShaderNodeBsdfTransparent")
        mix = nt.nodes.new("ShaderNodeMixShader")
        mix.inputs[0].default_value = alpha
        nt.links.new(tr.outputs[0], mix.inputs[1]); nt.links.new(sh, mix.inputs[2])
        sh = mix.outputs[0]
    _finish(nt, sh, fog=fog)
    return m


def vcol_material(name="VCol", emission=0.0, fog=True):
    """Diffuse material driven by the 'col' colour attribute (used for item sprites, particles)."""
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    col = nt.nodes.new("ShaderNodeVertexColor"); col.layer_name = "col"
    c = _hurt_mix(nt, col.outputs["Color"])
    dif = nt.nodes.new("ShaderNodeBsdfDiffuse")
    nt.links.new(c, dif.inputs["Color"])
    sh = dif.outputs[0]
    if emission > 0:
        em = nt.nodes.new("ShaderNodeEmission")
        nt.links.new(col.outputs["Color"], em.inputs["Color"])
        em.inputs["Strength"].default_value = emission
        add = nt.nodes.new("ShaderNodeAddShader")
        nt.links.new(sh, add.inputs[0]); nt.links.new(em.outputs[0], add.inputs[1])
        sh = add.outputs[0]
    _finish(nt, sh, fog=fog)
    return m


def skin_material(name, img, emit_img=None, emit_strength=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    tex = _img_node(nt, img)
    c = _hurt_mix(nt, tex.outputs["Color"])
    dif = nt.nodes.new("ShaderNodeBsdfDiffuse")
    nt.links.new(c, dif.inputs["Color"])
    sh = dif.outputs[0]
    if emit_img is not None:
        et = _img_node(nt, emit_img)
        em = nt.nodes.new("ShaderNodeEmission")
        nt.links.new(et.outputs["Color"], em.inputs["Color"])
        em.inputs["Strength"].default_value = emit_strength
        add = nt.nodes.new("ShaderNodeAddShader")
        nt.links.new(sh, add.inputs[0]); nt.links.new(em.outputs[0], add.inputs[1])
        sh = add.outputs[0]
    tr = nt.nodes.new("ShaderNodeBsdfTransparent")
    mix = nt.nodes.new("ShaderNodeMixShader")
    gt = nt.nodes.new("ShaderNodeMath"); gt.operation = "GREATER_THAN"; gt.inputs[1].default_value = 0.5
    nt.links.new(tex.outputs["Alpha"], gt.inputs[0])
    f = nt.nodes.new("ShaderNodeGroup"); f.node_tree = fog_group()
    nt.links.new(sh, f.inputs[0])
    nt.links.new(gt.outputs[0], mix.inputs[0])
    nt.links.new(tr.outputs[0], mix.inputs[1]); nt.links.new(f.outputs[0], mix.inputs[2])
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(mix.outputs[0], out.inputs["Surface"])
    return m


# ====================================================================== world / sky
def setup_world():
    w = bpy.data.worlds.new("Sky")
    bpy.context.scene.world = w
    w.use_nodes = True
    nt = w.node_tree
    nt.nodes.clear()
    env = nt.nodes.new("ShaderNodeGroup"); env.node_tree = env_group()
    E = env.outputs
    tc = nt.nodes.new("ShaderNodeTexCoord")
    dirv = nt.nodes.new("ShaderNodeVectorMath"); dirv.operation = "NORMALIZE"
    nt.links.new(tc.outputs["Generated"], dirv.inputs[0])
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(dirv.outputs[0], sep.inputs[0])
    z = sep.outputs[2]
    t = _math(nt, "MAXIMUM", z, 0.0)
    t = _math(nt, "POWER", t, 0.55)
    sky = nt.nodes.new("ShaderNodeMix"); sky.data_type = "RGBA"
    nt.links.new(t, sky.inputs[0])
    nt.links.new(E["horizon"], sky.inputs[6]); nt.links.new(E["zenith"], sky.inputs[7])
    # below horizon -> ground colour blend
    g = _math(nt, "MULTIPLY", z, -8.0)
    gmix = nt.nodes.new("ShaderNodeMix"); gmix.data_type = "RGBA"; gmix.clamp_factor = True
    nt.links.new(g, gmix.inputs[0])
    nt.links.new(sky.outputs[2], gmix.inputs[6]); nt.links.new(E["ground"], gmix.inputs[7])
    # sun glow
    sv = nt.nodes.new("ShaderNodeCombineXYZ")
    nt.links.new(E["sun_x"], sv.inputs[0]); nt.links.new(E["sun_y"], sv.inputs[1]); nt.links.new(E["sun_z"], sv.inputs[2])
    sn = nt.nodes.new("ShaderNodeVectorMath"); sn.operation = "NORMALIZE"
    nt.links.new(sv.outputs[0], sn.inputs[0])
    dot = nt.nodes.new("ShaderNodeVectorMath"); dot.operation = "DOT_PRODUCT"
    nt.links.new(dirv.outputs[0], dot.inputs[0]); nt.links.new(sn.outputs[0], dot.inputs[1])
    gl = _math(nt, "MAXIMUM", dot.outputs["Value"], 0.0)
    gl = _math(nt, "POWER", gl, 6.0)
    gl = _math(nt, "MULTIPLY", gl, E["sun_glow"])
    glc = nt.nodes.new("ShaderNodeMix"); glc.data_type = "RGBA"; glc.blend_type = "ADD"
    nt.links.new(gl, glc.inputs[0])
    nt.links.new(gmix.outputs[2], glc.inputs[6]); nt.links.new(E["sun_color"], glc.inputs[7])
    # stars
    vor = nt.nodes.new("ShaderNodeTexVoronoi")
    vor.inputs["Scale"].default_value = 260.0
    nt.links.new(dirv.outputs[0], vor.inputs["Vector"])
    st = _math(nt, "LESS_THAN", vor.outputs["Distance"], 0.05)
    zpos = _math(nt, "GREATER_THAN", z, 0.03)
    st = _math(nt, "MULTIPLY", st, zpos)
    st = _math(nt, "MULTIPLY", st, E["star_amount"])
    stc = nt.nodes.new("ShaderNodeMix"); stc.data_type = "RGBA"; stc.blend_type = "ADD"
    nt.links.new(st, stc.inputs[0])
    nt.links.new(glc.outputs[2], stc.inputs[6]); stc.inputs[7].default_value = (1, 1, 1, 1)
    # lightning flash
    fl = nt.nodes.new("ShaderNodeMix"); fl.data_type = "RGBA"; fl.blend_type = "ADD"
    nt.links.new(E["flash"], fl.inputs[0])
    nt.links.new(stc.outputs[2], fl.inputs[6]); fl.inputs[7].default_value = (0.8, 0.85, 1.0, 1)
    # lighting version of the sky: desaturated and dimmer; camera rays see the real sky
    hsv = nt.nodes.new("ShaderNodeHueSaturation")
    nt.links.new(E["amb_sat"], hsv.inputs["Saturation"])
    nt.links.new(gmix.outputs[2], hsv.inputs["Color"])
    amb = nt.nodes.new("ShaderNodeMix"); amb.data_type = "RGBA"; amb.blend_type = "MULTIPLY"
    amb.inputs[0].default_value = 1.0
    nt.links.new(hsv.outputs[0], amb.inputs[6])
    av = nt.nodes.new("ShaderNodeCombineXYZ")
    nt.links.new(E["ambient"], av.inputs[0]); nt.links.new(E["ambient"], av.inputs[1]); nt.links.new(E["ambient"], av.inputs[2])
    nt.links.new(av.outputs[0], amb.inputs[7])
    flash_amb = nt.nodes.new("ShaderNodeMix"); flash_amb.data_type = "RGBA"; flash_amb.blend_type = "ADD"
    nt.links.new(E["flash"], flash_amb.inputs[0])
    nt.links.new(amb.outputs[2], flash_amb.inputs[6]); flash_amb.inputs[7].default_value = (0.8, 0.85, 1.0, 1)
    lp = nt.nodes.new("ShaderNodeLightPath")
    sel = nt.nodes.new("ShaderNodeMix"); sel.data_type = "RGBA"
    nt.links.new(lp.outputs["Is Camera Ray"], sel.inputs[0])
    nt.links.new(flash_amb.outputs[2], sel.inputs[6]); nt.links.new(fl.outputs[2], sel.inputs[7])
    bg = nt.nodes.new("ShaderNodeBackground")
    nt.links.new(sel.outputs[2], bg.inputs["Color"])
    nt.links.new(E["sky_strength"], bg.inputs["Strength"])
    out = nt.nodes.new("ShaderNodeOutputWorld")
    nt.links.new(bg.outputs[0], out.inputs[0])
    return w


def make_sun_lamp():
    ld = bpy.data.lights.new("Sun", "SUN")
    ld.energy = 3.0
    ld.angle = math.radians(1.5)
    o = bpy.data.objects.new("Sun", ld)
    link(o)
    return o


def celestial(name, color, size=90.0, kind="sun"):
    """Minecraft-style square sun / moon: emissive plane that always faces the camera."""
    S = 16
    img = np.zeros((S, S, 4))
    if kind == "sun":
        img[3:13, 3:13] = (1.0, 0.95, 0.6, 1)
        img[5:11, 5:11] = (1.0, 1.0, 0.9, 1)
    else:
        img[3:13, 3:13] = (0.85, 0.87, 0.92, 1)
        for (y, x) in ((5, 5), (8, 9), (10, 6), (6, 10)):
            img[y:y + 2, x:x + 2] = (0.6, 0.62, 0.7, 1)
    im = make_image(name + "_img", img)
    m = bpy.data.materials.new(name + "_mat")
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    t = _img_node(nt, im)
    em = nt.nodes.new("ShaderNodeEmission")
    nt.links.new(t.outputs["Color"], em.inputs["Color"])
    em.inputs["Strength"].default_value = 6.0 if kind == "sun" else 1.6
    tr = nt.nodes.new("ShaderNodeBsdfTransparent")
    mix = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(t.outputs["Alpha"], mix.inputs[0])
    nt.links.new(tr.outputs[0], mix.inputs[1]); nt.links.new(em.outputs[0], mix.inputs[2])
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(mix.outputs[0], out.inputs["Surface"])
    me = bpy.data.meshes.new(name)
    h = size / 2
    me.from_pydata([(-h, -h, 0), (h, -h, 0), (h, h, 0), (-h, h, 0)], [], [(0, 1, 2, 3)])
    uv = me.uv_layers.new()
    for i, c in enumerate([(0, 0), (1, 0), (1, 1), (0, 1)]):
        uv.data[i].uv = c
    me.materials.append(m)
    o = bpy.data.objects.new(name, me)
    o.visible_shadow = False
    link(o)
    return o


# ====================================================================== meshes
def quads_mesh(name, verts, uvs=None, cols=None, ao=None, mat=None, coll=None):
    verts = np.asarray(verts, np.float32)
    nv = len(verts)
    nf = nv // 4
    me = bpy.data.meshes.new(name)
    me.vertices.add(nv)
    me.vertices.foreach_set("co", verts.ravel())
    me.loops.add(nv)
    me.loops.foreach_set("vertex_index", np.arange(nv, dtype=np.int32))
    me.polygons.add(nf)
    me.polygons.foreach_set("loop_start", np.arange(0, nv, 4, dtype=np.int32))
    me.polygons.foreach_set("loop_total", np.full(nf, 4, np.int32))
    if uvs is not None:
        uv = me.uv_layers.new(name="UVMap")
        uv.data.foreach_set("uv", np.asarray(uvs, np.float32).ravel())
    if cols is not None:
        ca = me.color_attributes.new("col", "FLOAT_COLOR", "CORNER")
        c = np.concatenate([np.asarray(cols, np.float32), np.ones((nv, 1), np.float32)], 1)
        ca.data.foreach_set("color", c.ravel())
    if ao is not None:
        a = me.attributes.new("ao", "FLOAT", "CORNER")
        a.data.foreach_set("value", np.asarray(ao, np.float32))
    me.update(calc_edges=True)
    if mat:
        me.materials.append(mat)
    o = bpy.data.objects.new(name, me)
    link(o, coll)
    return o


def world_objects(world, name="terrain", coll=None, plants=True, sway_groups=4, seed=0):
    res, water = world.mesh_arrays(seed=seed)
    objs = {}
    if len(res["verts"]):
        objs["terrain"] = quads_mesh(name, res["verts"], res["uvs"], res["col"], res["ao"],
                                     terrain_material(), coll)
    if len(water["verts"]):
        w = quads_mesh(name + "_water", water["verts"], water["uvs"], mat=water_material(), coll=coll)
        w.visible_shadow = False
        objs["water"] = w
    if plants and world.plants:
        pa = world.plant_arrays(seed)
        nq = len(pa["verts"]) // 4
        groups = np.arange(nq) % sway_groups
        objs["plants"] = []
        for g in range(sway_groups):
            sel = np.repeat(groups == g, 4)
            if not sel.any():
                continue
            o = quads_mesh(f"{name}_plants{g}", pa["verts"][sel], pa["uvs"][sel], pa["col"][sel],
                           mat=plant_material(), coll=coll)
            o.visible_shadow = True
            # sway shape key: offset top vertices
            o.shape_key_add(name="Basis")
            sk = o.shape_key_add(name="sway")
            co = pa["verts"][sel].copy()
            top = pa["sway"][sel] > 0.5
            co[top, 0] += 0.12
            co[top, 1] += 0.06
            sk.data.foreach_set("co", co.astype(np.float32).ravel())
            o["sway_phase"] = g * 1.7
            objs["plants"].append(o)
    print(f"[mesh] {name}: {len(res['verts']) // 4} faces, water {len(water['verts']) // 4}, "
          f"plants {len(world.plants)}")
    return objs


def box_mesh_data(x0, y0, z0, x1, y1, z1):
    from .voxel import FACES
    v = []
    for n, corners, _, _ in FACES:
        for c in corners:
            v.append((x0 if c[0] == 0 else x1, y0 if c[1] == 0 else y1, z0 if c[2] == 0 else z1))
    return np.array(v, float)


def boxes_mesh(name, boxes, colors, mat=None, coll=None):
    """boxes: list of (x0,y0,z0,x1,y1,z1); colors: list of rgb (per box)."""
    V, C = [], []
    for b, c in zip(boxes, colors):
        v = box_mesh_data(*b)
        V.append(v)
        C.append(np.tile(np.asarray(c, float), (24, 1)))
    return quads_mesh(name, np.concatenate(V), cols=np.concatenate(C), mat=mat or vcol_material(), coll=coll)


# ====================================================================== animation
class Anim:
    """Collects per-frame samples and writes them as F-curves in bulk."""

    def __init__(self):
        self.ch = {}
        self.frame = 1

    def set(self, idb, path, value, index=-1):
        if isinstance(value, (tuple, list, Vector, Euler)) and index == -1:
            for i, v in enumerate(value):
                self.set(idb, path, float(v), i)
            return
        key = (idb.name, type(idb).__name__, path, index)
        if key not in self.ch:
            self.ch[key] = [idb, {}]
        self.ch[key][1][self.frame] = float(value)

    def flush(self):
        from bpy_extras import anim_utils
        by_id = {}
        for (n, t, path, index), (idb, samples) in self.ch.items():
            by_id.setdefault((n, t), [idb, []])[1].append((path, index, samples))
        for (n, t), (idb, chans) in by_id.items():
            for path, index, samples in chans:
                frames = sorted(samples)
                f0 = frames[0]
                idx = max(index, 0)
                # create the F-curve through the regular API (handles slotted actions)
                try:
                    if index >= 0:
                        idb.keyframe_insert(path, index=index, frame=f0)
                    else:
                        idb.keyframe_insert(path, frame=f0)
                except TypeError:
                    idb.keyframe_insert(path, frame=f0)
                ad = idb.animation_data
                cb = anim_utils.action_get_channelbag_for_slot(ad.action, ad.action_slot)
                fc = cb.fcurves.find(path, index=idx)
                fc.keyframe_points.clear()
                fc.keyframe_points.add(len(frames))
                co = np.empty(2 * len(frames), np.float32)
                co[0::2] = frames
                co[1::2] = [samples[f] for f in frames]
                fc.keyframe_points.foreach_set("co", co)
                fc.keyframe_points.foreach_set("interpolation",
                                               np.zeros(len(frames), np.int32))  # CONSTANT
                fc.update()
        self.ch.clear()


ANIM = Anim()


def env_node(name):
    return env_group().nodes[name]


def env_set(**kw):
    """Record environment parameters for the current ANIM frame."""
    ng = env_group()
    for k, v in kw.items():
        node = ng.nodes[k]
        if isinstance(v, (tuple, list)):
            ANIM.set(ng, f'nodes["{k}"].outputs[0].default_value', (*v[:3], 1.0))
        else:
            ANIM.set(ng, f'nodes["{k}"].outputs[0].default_value', v)


def look_rot(cam_loc, target, roll=0.0):
    d = Vector(target) - Vector(cam_loc)
    q = d.to_track_quat("-Z", "Y")
    e = q.to_euler()
    if roll:
        from mathutils import Matrix
        m = q.to_matrix() @ Matrix.Rotation(roll, 3, "Z")
        e = m.to_euler()
    return e


def render_settings(scn, res=(1280, 536), samples=8):
    scn.render.engine = "BLENDER_EEVEE_NEXT"
    scn.render.resolution_x, scn.render.resolution_y = res
    scn.render.resolution_percentage = 100
    scn.eevee.taa_render_samples = samples
    scn.eevee.use_shadows = True
    scn.eevee.shadow_ray_count = 1
    scn.eevee.shadow_step_count = 2
    scn.eevee.shadow_resolution_scale = 0.4
    for l in bpy.data.lights:
        if l.type == "SUN":
            l.shadow_maximum_resolution = 0.03
            l.use_shadow_jitter = False
    scn.eevee.use_raytracing = False
    scn.eevee.use_gtao = True
    scn.eevee.gtao_distance = 1.5
    import os
    scn.view_settings.view_transform = os.environ.get("MC_VIEW", "Filmic")
    try:
        scn.view_settings.look = os.environ.get("MC_LOOK", "Medium High Contrast")
    except TypeError:
        pass
    scn.render.image_settings.file_format = "PNG"
    scn.render.image_settings.color_mode = "RGB"
    scn.render.image_settings.compression = 15
    scn.render.film_transparent = False


def compositor(scn, bloom=0.6):
    scn.use_nodes = True
    nt = scn.node_tree
    nt.nodes.clear()
    rl = nt.nodes.new("CompositorNodeRLayers")
    gl = nt.nodes.new("CompositorNodeGlare")
    gl.glare_type = "BLOOM"
    gl.quality = "MEDIUM"
    gl.inputs["Threshold"].default_value = 1.0
    gl.inputs["Strength"].default_value = bloom
    gl.inputs["Size"].default_value = 0.45
    nt.links.new(rl.outputs["Image"], gl.inputs[0])
    import os
    hs = nt.nodes.new("CompositorNodeHueSat")
    hs.inputs["Saturation"].default_value = float(os.environ.get("MC_SAT", "1.1"))
    nt.links.new(gl.outputs[0], hs.inputs["Image"])
    out = nt.nodes.new("CompositorNodeComposite")
    nt.links.new(hs.outputs[0], out.inputs[0])
