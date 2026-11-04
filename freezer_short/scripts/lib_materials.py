"""Shared material helpers for the freezer short.

Every environment material gets the same "frost overlay" so frost can grow
over time.  Frost amount is read with an Attribute node of type VIEW_LAYER,
which looks the name up on the view layer, then the scene, then the world -
so a single animated scene custom property ("frost") drives every surface.
"""
import bpy, os

PH = "/opt/assets/polyhaven"


def _tex(nt, path, colorspace="sRGB", loc=(0, 0), proj="BOX", mapping=None):
    n = nt.nodes.new("ShaderNodeTexImage")
    n.image = bpy.data.images.load(path, check_existing=True)
    n.image.colorspace_settings.name = colorspace
    n.projection = proj
    if proj == "BOX":
        n.projection_blend = 0.25
    n.location = loc
    if mapping is not None:
        nt.links.new(mapping.outputs[0], n.inputs[0])
    return n


def scene_attr(nt, name, loc=(0, 0)):
    a = nt.nodes.new("ShaderNodeAttribute")
    a.attribute_type = "VIEW_LAYER"
    a.attribute_name = name
    a.location = loc
    return a


GEN = "/opt/assets/gen"


def frost_group():
    """Node group: mixes a frost layer over an input surface description.
    Uses a baked tileable noise image (R patches, G crystal cells, B grain)."""
    if "NG_Frost" in bpy.data.node_groups:
        return bpy.data.node_groups["NG_Frost"]
    ng = bpy.data.node_groups.new("NG_Frost", "ShaderNodeTree")
    iface = ng.interface
    for name, typ in [("Color", "NodeSocketColor"), ("Roughness", "NodeSocketFloat"),
                      ("Metallic", "NodeSocketFloat"), ("Normal", "NodeSocketVector"),
                      ("Amount", "NodeSocketFloat"), ("Bias", "NodeSocketFloat")]:
        iface.new_socket(name, in_out="INPUT", socket_type=typ)
    for name, typ in [("Color", "NodeSocketColor"), ("Roughness", "NodeSocketFloat"),
                      ("Metallic", "NodeSocketFloat"), ("Normal", "NodeSocketVector"),
                      ("Mask", "NodeSocketFloat")]:
        iface.new_socket(name, in_out="OUTPUT", socket_type=typ)
    N, L = ng.nodes, ng.links
    gi = N.new("NodeGroupInput"); go = N.new("NodeGroupOutput")
    gi.location = (-900, 0); go.location = (700, 0)
    tc = N.new("ShaderNodeTexCoord"); tc.location = (-1100, 300)
    mp = N.new("ShaderNodeMapping"); mp.inputs["Scale"].default_value = (0.45, 0.45, 0.45)
    L.new(tc.outputs["Object"], mp.inputs[0]); mp.location = (-950, 300)
    img = bpy.data.images.load(GEN + "/frost_noise.png", check_existing=True)
    img.colorspace_settings.name = "Non-Color"
    t1 = N.new("ShaderNodeTexImage"); t1.image = img; t1.projection = "BOX"; t1.projection_blend = 0.3
    L.new(mp.outputs[0], t1.inputs[0]); t1.location = (-750, 300)
    mp2 = N.new("ShaderNodeMapping"); mp2.inputs["Scale"].default_value = (3.1, 3.1, 3.1)
    L.new(tc.outputs["Object"], mp2.inputs[0]); mp2.location = (-950, 0)
    t2 = N.new("ShaderNodeTexImage"); t2.image = img; t2.projection = "BOX"; t2.projection_blend = 0.3
    L.new(mp2.outputs[0], t2.inputs[0]); t2.location = (-750, 0)
    sep = N.new("ShaderNodeSeparateColor"); L.new(t1.outputs["Color"], sep.inputs[0]); sep.location = (-550, 300)
    sep2 = N.new("ShaderNodeSeparateColor"); L.new(t2.outputs["Color"], sep2.inputs[0]); sep2.location = (-550, 0)
    # mask = patches + 0.25*crystal + bias + amount*1.35 - 1.0, smooth threshold
    mix1 = N.new("ShaderNodeMath"); mix1.operation = "MULTIPLY_ADD"; mix1.location = (-400, 350)
    L.new(sep2.outputs[1], mix1.inputs[0]); mix1.inputs[1].default_value = 0.25; L.new(sep.outputs[0], mix1.inputs[2])
    add1 = N.new("ShaderNodeMath"); add1.operation = "ADD"; add1.location = (-250, 300)
    L.new(mix1.outputs[0], add1.inputs[0]); L.new(gi.outputs["Bias"], add1.inputs[1])
    amt = N.new("ShaderNodeMath"); amt.operation = "MULTIPLY_ADD"; amt.location = (-400, 120)
    L.new(gi.outputs["Amount"], amt.inputs[0]); amt.inputs[1].default_value = 1.35; amt.inputs[2].default_value = -1.0
    geo = N.new("ShaderNodeNewGeometry"); geo.location = (-600, -350)
    sepn = N.new("ShaderNodeSeparateXYZ"); L.new(geo.outputs["Normal"], sepn.inputs[0]); sepn.location = (-450, -350)
    up = N.new("ShaderNodeMath"); up.operation = "MULTIPLY_ADD"; up.location = (-300, -250)
    L.new(sepn.outputs[2], up.inputs[0]); up.inputs[1].default_value = 0.1; L.new(amt.outputs[0], up.inputs[2])
    add2 = N.new("ShaderNodeMath"); add2.operation = "ADD"; add2.location = (-120, 250)
    L.new(add1.outputs[0], add2.inputs[0]); L.new(up.outputs[0], add2.inputs[1])
    mr = N.new("ShaderNodeMapRange"); mr.location = (-0, 250)
    mr.inputs["From Min"].default_value = 0.42; mr.inputs["From Max"].default_value = 0.9
    mr.interpolation_type = "SMOOTHSTEP"
    L.new(add2.outputs[0], mr.inputs["Value"])
    gate0 = N.new("ShaderNodeMath"); gate0.operation = "MULTIPLY"; gate0.location = (150, 350)
    gate = N.new("ShaderNodeMath"); gate.operation = "MULTIPLY"; gate.location = (250, 250)
    L.new(gate0.outputs[0], gate.inputs[0]); gate.inputs[1].default_value = 0.88
    gs = N.new("ShaderNodeMath"); gs.operation = "MULTIPLY"; gs.use_clamp = True; gs.location = (60, 0)
    L.new(gi.outputs["Amount"], gs.inputs[0]); gs.inputs[1].default_value = 4.0
    L.new(mr.outputs[0], gate0.inputs[0]); L.new(gs.outputs[0], gate0.inputs[1])
    fcol = N.new("ShaderNodeMix"); fcol.data_type = "RGBA"; fcol.location = (150, -150)
    fcol.inputs[6].default_value = (0.78, 0.86, 0.94, 1); fcol.inputs[7].default_value = (0.97, 0.99, 1.0, 1)
    L.new(sep2.outputs[1], fcol.inputs[0])
    mixc = N.new("ShaderNodeMix"); mixc.data_type = "RGBA"; mixc.location = (380, 200)
    L.new(gate.outputs[0], mixc.inputs[0]); L.new(gi.outputs["Color"], mixc.inputs[6]); L.new(fcol.outputs[2], mixc.inputs[7])
    mixr = N.new("ShaderNodeMix"); mixr.location = (380, 40)
    L.new(gate.outputs[0], mixr.inputs[0]); L.new(gi.outputs["Roughness"], mixr.inputs[2]); mixr.inputs[3].default_value = 0.6
    mixm = N.new("ShaderNodeMix"); mixm.location = (380, -100)
    L.new(gate.outputs[0], mixm.inputs[0]); L.new(gi.outputs["Metallic"], mixm.inputs[2]); mixm.inputs[3].default_value = 0.0
    hb = N.new("ShaderNodeMath"); hb.operation = "MULTIPLY"; hb.location = (200, -300)
    L.new(sep2.outputs[2], hb.inputs[0]); L.new(gate.outputs[0], hb.inputs[1])
    bump = N.new("ShaderNodeBump"); bump.inputs["Strength"].default_value = 0.4; bump.inputs["Distance"].default_value = 0.004
    bump.location = (450, -300)
    L.new(hb.outputs[0], bump.inputs["Height"]); L.new(gi.outputs["Normal"], bump.inputs["Normal"])
    L.new(mixc.outputs[2], go.inputs["Color"]); L.new(mixr.outputs[0], go.inputs["Roughness"])
    L.new(mixm.outputs[0], go.inputs["Metallic"]); L.new(bump.outputs[0], go.inputs["Normal"])
    L.new(gate.outputs[0], go.inputs["Mask"])
    return ng


def pbr(name, tex=None, color=(0.6, 0.6, 0.6), rough=0.5, metal=0.0, scale=1.0, tint=None,
        frost=True, frost_bias=0.0, normal_strength=1.0, box=True, uv=False, extra_rough=None, desat=None, brushed=False):
    """Create a Principled material, optionally from a Poly Haven texture set
    (folder name in /opt/assets/polyhaven/textures), with frost overlay."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree; N, L = nt.nodes, nt.links
    bsdf = N["Principled BSDF"]; out = N["Material Output"]
    bsdf.location = (400, 0); out.location = (700, 0)
    col_out, rough_out, nrm_out = None, None, None
    if tex:
        d = os.path.join(PH, "textures", tex)
        tc = N.new("ShaderNodeTexCoord"); tc.location = (-1100, 0)
        mp = N.new("ShaderNodeMapping"); mp.location = (-900, 0)
        mp.inputs["Scale"].default_value = (scale, scale, scale)
        L.new(tc.outputs["UV" if uv else "Object"], mp.inputs[0])
        proj = "FLAT" if uv else "BOX"
        files = os.listdir(d)
        def f(key):
            for x in files:
                if f"_{key}_" in x:
                    return os.path.join(d, x)
        c = _tex(nt, f("diff"), "sRGB", (-650, 250), proj, mp)
        col_out = c.outputs["Color"]
        if desat is not None:
            hs = N.new("ShaderNodeHueSaturation"); hs.location = (-450, 300)
            hs.inputs["Saturation"].default_value = desat[0]; hs.inputs["Value"].default_value = desat[1]
            L.new(col_out, hs.inputs["Color"]); col_out = hs.outputs[0]
        if tint:
            mx = N.new("ShaderNodeMix"); mx.data_type = "RGBA"; mx.blend_type = "MULTIPLY"
            mx.inputs[0].default_value = 1.0; mx.inputs[7].default_value = (*tint, 1)
            mx.location = (-350, 250); L.new(col_out, mx.inputs[6]); col_out = mx.outputs[2]
        if f("rough"):
            r = _tex(nt, f("rough"), "Non-Color", (-650, 0), proj, mp)
            rough_out = r.outputs["Color"]
            if extra_rough is not None:
                mr = N.new("ShaderNodeMath"); mr.operation = "MULTIPLY"; mr.inputs[1].default_value = extra_rough
                L.new(rough_out, mr.inputs[0]); rough_out = mr.outputs[0]
        if f("nor_gl"):
            n = _tex(nt, f("nor_gl"), "Non-Color", (-650, -250), proj, mp)
            nm = N.new("ShaderNodeNormalMap"); nm.location = (-350, -250)
            nm.inputs["Strength"].default_value = normal_strength
            L.new(n.outputs["Color"], nm.inputs["Color"]); nrm_out = nm.outputs["Normal"]
    if brushed:
        tc = N.new("ShaderNodeTexCoord"); mp = N.new("ShaderNodeMapping")
        mp.inputs["Scale"].default_value = (scale, scale, scale); L.new(tc.outputs["Object"], mp.inputs[0])
        im = bpy.data.images.load(GEN + "/brushed_steel.png", check_existing=True); im.colorspace_settings.name = "Non-Color"
        bt = N.new("ShaderNodeTexImage"); bt.image = im; bt.projection = "BOX"; bt.projection_blend = 0.2
        L.new(mp.outputs[0], bt.inputs[0])
        sp = N.new("ShaderNodeSeparateColor"); L.new(bt.outputs[0], sp.inputs[0])
        cm = N.new("ShaderNodeMath"); cm.operation = "MULTIPLY"; cm.inputs[1].default_value = 1.25
        L.new(sp.outputs[0], cm.inputs[0])
        cc = N.new("ShaderNodeCombineColor"); L.new(cm.outputs[0], cc.inputs[0]); L.new(cm.outputs[0], cc.inputs[1]); L.new(cm.outputs[0], cc.inputs[2])
        col_out = cc.outputs[0]
        rm = N.new("ShaderNodeMapRange"); rm.inputs[3].default_value = rough * 0.7; rm.inputs[4].default_value = rough * 1.4
        L.new(sp.outputs[1], rm.inputs[0]); rough_out = rm.outputs[0]
        bb = N.new("ShaderNodeBump"); bb.inputs["Strength"].default_value = 0.08; L.new(sp.outputs[1], bb.inputs["Height"])
        nrm_out = bb.outputs[0]
    if frost:
        fg = N.new("ShaderNodeGroup"); fg.node_tree = frost_group(); fg.location = (100, 0)
        fa = scene_attr(nt, "frost", (-150, -450))
        L.new(fa.outputs["Fac"], fg.inputs["Amount"])
        fg.inputs["Bias"].default_value = frost_bias
        if col_out: L.new(col_out, fg.inputs["Color"])
        else: fg.inputs["Color"].default_value = (*color, 1)
        if rough_out: L.new(rough_out, fg.inputs["Roughness"])
        else: fg.inputs["Roughness"].default_value = rough
        fg.inputs["Metallic"].default_value = metal
        if nrm_out: L.new(nrm_out, fg.inputs["Normal"])
        else:
            geo = N.new("ShaderNodeNewGeometry"); geo.location = (-150, -600)
            L.new(geo.outputs["Normal"], fg.inputs["Normal"])
        L.new(fg.outputs["Color"], bsdf.inputs["Base Color"])
        L.new(fg.outputs["Roughness"], bsdf.inputs["Roughness"])
        L.new(fg.outputs["Metallic"], bsdf.inputs["Metallic"])
        L.new(fg.outputs["Normal"], bsdf.inputs["Normal"])
    else:
        if col_out: L.new(col_out, bsdf.inputs["Base Color"])
        else: bsdf.inputs["Base Color"].default_value = (*color, 1)
        if rough_out: L.new(rough_out, bsdf.inputs["Roughness"])
        else: bsdf.inputs["Roughness"].default_value = rough
        bsdf.inputs["Metallic"].default_value = metal
        if nrm_out: L.new(nrm_out, bsdf.inputs["Normal"])
    return m


def emission(name, color, strength):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; nt.nodes.remove(nt.nodes["Principled BSDF"])
    e = nt.nodes.new("ShaderNodeEmission"); e.inputs[0].default_value = (*color, 1); e.inputs[1].default_value = strength
    nt.links.new(e.outputs[0], nt.nodes["Material Output"].inputs[0])
    return m


def ice(name="M_Ice", color=(0.72, 0.86, 0.95)):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; N, L = nt.nodes, nt.links
    b = N["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = 0.08
    b.inputs["Transmission Weight"].default_value = 0.85
    b.inputs["IOR"].default_value = 1.31
    b.inputs["Coat Weight"].default_value = 0.3
    tc = N.new("ShaderNodeTexCoord")
    nz = N.new("ShaderNodeTexNoise"); nz.inputs["Scale"].default_value = 18; nz.inputs["Detail"].default_value = 6
    L.new(tc.outputs["Object"], nz.inputs["Vector"])
    bp = N.new("ShaderNodeBump"); bp.inputs["Strength"].default_value = 0.25
    L.new(nz.outputs["Fac"], bp.inputs["Height"]); L.new(bp.outputs[0], b.inputs["Normal"])
    # cloudy trapped-air variation in roughness
    nz2 = N.new("ShaderNodeTexNoise"); nz2.inputs["Scale"].default_value = 6
    L.new(tc.outputs["Object"], nz2.inputs["Vector"])
    mr = N.new("ShaderNodeMapRange"); mr.inputs[3].default_value = 0.03; mr.inputs[4].default_value = 0.35
    L.new(nz2.outputs["Fac"], mr.inputs[0]); L.new(mr.outputs[0], b.inputs["Roughness"])
    return m
