"""Assemble master.blend = freezer environment + character "Leo".

- appends the MPFB character into collection CHR_Leo
- replaces the skin with a cold-aware Cycles skin shader driven by scene
  properties (cold_pale, cold_red, cold_lips, cold_hands, goosebumps)
- bakes mask attributes: ColdMask (R nose/cheeks/ears, G lips, B hands)
  and Core (1 = torso ... 0 = fingertips) used by the thermal-camera look
- recolours the overalls (blue denim -> worn rust-brown canvas) so the
  character reads warm against the cold blue set
Run: blender -b /opt/work/blend/freezer_env.blend --python build_master.py -- /opt/work/blend/master.blend
"""
import bpy, sys, os, math
from mathutils import Vector
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib_materials as LM

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = argv[0] if argv else "/opt/work/blend/master.blend"
CHAR = "/opt/work/blend/character.blend"
MPFB = "/root/.config/blender/4.5/extensions/.user/user_default/mpfb/data"
sc = bpy.context.scene
for k, v in {"cold_pale": 0.0, "cold_red": 0.0, "cold_lips": 0.0, "cold_hands": 0.0,
             "goosebumps": 0.0, "frost_hair": 0.0, "thermal_temp": 1.0, "thermal_hands": 1.0}.items():
    sc[k] = v

# ------------------------------------------------------------- append character
with bpy.data.libraries.load(CHAR) as (src, dst):
    dst.objects = [n for n in src.objects]
chr_c = bpy.data.collections.new("CHR_Leo"); sc.collection.children.link(chr_c)
for o in dst.objects:
    if o: chr_c.objects.link(o)
bpy.ops.file.make_paths_absolute()
for im in bpy.data.images:
    p = bpy.path.abspath(im.filepath)
    if not os.path.exists(p):
        base = os.path.basename(p)
        for root, _, files in os.walk(MPFB):
            if base in files:
                im.filepath = os.path.join(root, base); break
        else:
            for root, _, files in os.walk(os.path.dirname(MPFB.replace("/.user/user_default/mpfb/data", "/user_default/mpfb/data"))):
                if base in files:
                    im.filepath = os.path.join(root, base); break
rig = bpy.data.objects["Leo"]; body = bpy.data.objects["Leo.body"]
rig.location = (0.0, -2.5, 0.0)


# ------------------------------------------------------------- mask attributes
def vg_weights(obj, names):
    idx = {obj.vertex_groups[n].index: n for n in names if n in obj.vertex_groups}
    out = [dict() for _ in obj.data.vertices]
    for v in obj.data.vertices:
        for g in v.groups:
            if g.group in idx:
                out[v.index][idx[g.group]] = g.weight
    return out


CORE = {"pelvis": 1.0, "spine_01": 1.0, "spine_02": 1.0, "spine_03": 1.0, "neck_01": 0.92, "head": 0.85,
        "clavicle_l": 0.9, "clavicle_r": 0.9, "upperarm_l": 0.72, "upperarm_r": 0.72,
        "lowerarm_l": 0.45, "lowerarm_r": 0.45, "hand_l": 0.22, "hand_r": 0.22,
        "thigh_l": 0.75, "thigh_r": 0.75, "calf_l": 0.48, "calf_r": 0.48, "foot_l": 0.2, "foot_r": 0.2,
        "ball_l": 0.12, "ball_r": 0.12}
for side in "lr":
    for f in ["thumb", "index", "middle", "ring", "pinky"]:
        for k, val in zip((1, 2, 3), (0.14, 0.09, 0.05)):
            CORE[f"{f}_0{k}_{side}"] = val


def bake_core(obj):
    names = list(CORE.keys())
    ws = vg_weights(obj, names)
    attr = obj.data.attributes.get("Core") or obj.data.attributes.new("Core", "FLOAT", "POINT")
    for i, w in enumerate(ws):
        tot = sum(w.values())
        attr.data[i].value = (sum(CORE[n] * x for n, x in w.items()) / tot) if tot > 0 else 0.8
    return attr


for o in chr_c.objects:
    if o.type == "MESH":
        bake_core(o)

# ColdMask on the body
me = body.data
ws = vg_weights(body, ["ears", "lips", "fingernails", "hand_l", "hand_r"] +
                [f"{f}_0{k}_{s}" for f in ["thumb", "index", "middle", "ring", "pinky"] for k in (1, 2, 3) for s in "lr"])
head_vs = [v for v in me.vertices if v.co.z > 1.55 and abs(v.co.x) < 0.1]
nose = min(head_vs, key=lambda v: v.co.y).co.copy()
cm = me.color_attributes.get("ColdMask") or me.color_attributes.new("ColdMask", "FLOAT_COLOR", "POINT")
for v in me.vertices:
    w = ws[v.index]
    d_nose = (v.co - nose).length
    cheekL = (v.co - (nose + Vector((0.045, 0.035, 0.012)))).length
    cheekR = (v.co - (nose + Vector((-0.045, 0.035, 0.012)))).length
    red = max(math.exp(-(d_nose / 0.018) ** 2), 0.7 * math.exp(-(cheekL / 0.025) ** 2), 0.7 * math.exp(-(cheekR / 0.025) ** 2), w.get("ears", 0.0))
    lips = w.get("lips", 0.0)
    hands = min(1.0, sum(x for n, x in w.items() if n not in ("ears", "lips")))
    cm.data[v.index].color = (red, lips, hands, 1.0)


# ------------------------------------------------------------- skin shader
def skin_material():
    m = bpy.data.materials.new("M_Skin_Leo"); m.use_nodes = True
    nt = m.node_tree; N, L = nt.nodes, nt.links
    b = N["Principled BSDF"]; b.location = (900, 0); N["Material Output"].location = (1200, 0)
    tex = N.new("ShaderNodeTexImage"); tex.location = (-900, 300)
    tex.image = bpy.data.images.load(f"{MPFB}/skins/young_caucasian_male/young_lightskinned_male_diffuse.png", check_existing=True)
    att = N.new("ShaderNodeAttribute"); att.attribute_name = "ColdMask"; att.attribute_type = "GEOMETRY"; att.location = (-900, -100)
    sp = N.new("ShaderNodeSeparateColor"); L.new(att.outputs["Color"], sp.inputs[0]); sp.location = (-700, -100)
    # warm up the slightly grey MakeHuman albedo
    hs = N.new("ShaderNodeHueSaturation"); hs.location = (-650, 300)
    hs.inputs["Saturation"].default_value = 1.12; hs.inputs["Value"].default_value = 1.0
    L.new(tex.outputs["Color"], hs.inputs["Color"])
    # cold flush (red nose/cheeks/ears/hands early on)
    red_f = N.new("ShaderNodeMath"); red_f.operation = "MULTIPLY"; red_f.location = (-450, -50)
    L.new(sp.outputs[0], red_f.inputs[0]); L.new(LM.scene_attr(nt, "cold_red", (-700, -300)).outputs["Fac"], red_f.inputs[1])
    red_h = N.new("ShaderNodeMath"); red_h.operation = "MULTIPLY_ADD"; red_h.location = (-450, -200)
    L.new(sp.outputs[2], red_h.inputs[0]); red_h.inputs[1].default_value = 0.6; L.new(red_f.outputs[0], red_h.inputs[2])
    mx_red = N.new("ShaderNodeMix"); mx_red.data_type = "RGBA"; mx_red.blend_type = "MULTIPLY"; mx_red.location = (-250, 300)
    mx_red.inputs[7].default_value = (1.0, 0.58, 0.55, 1)
    L.new(red_h.outputs[0], mx_red.inputs[0]); L.new(hs.outputs[0], mx_red.inputs[6])
    # overall pallor (vasoconstriction): desaturate + cool
    pale = LM.scene_attr(nt, "cold_pale", (-250, -350))
    hs2 = N.new("ShaderNodeHueSaturation"); hs2.location = (-50, 300)
    inv = N.new("ShaderNodeMath"); inv.operation = "MULTIPLY_ADD"; inv.location = (-120, -250)
    L.new(pale.outputs["Fac"], inv.inputs[0]); inv.inputs[1].default_value = -0.55; inv.inputs[2].default_value = 1.0
    L.new(inv.outputs[0], hs2.inputs["Saturation"]); L.new(mx_red.outputs[2], hs2.inputs["Color"])
    mx_pale = N.new("ShaderNodeMix"); mx_pale.data_type = "RGBA"; mx_pale.blend_type = "MIX"; mx_pale.location = (150, 300)
    pf = N.new("ShaderNodeMath"); pf.operation = "MULTIPLY"; pf.inputs[1].default_value = 0.22; L.new(pale.outputs["Fac"], pf.inputs[0])
    L.new(pf.outputs[0], mx_pale.inputs[0]); L.new(hs2.outputs[0], mx_pale.inputs[6]); mx_pale.inputs[7].default_value = (0.72, 0.76, 0.84, 1)
    # blue-grey lips
    lf = N.new("ShaderNodeMath"); lf.operation = "MULTIPLY"; lf.location = (150, -100)
    L.new(sp.outputs[1], lf.inputs[0]); L.new(LM.scene_attr(nt, "cold_lips", (0, -450)).outputs["Fac"], lf.inputs[1])
    mx_lip = N.new("ShaderNodeMix"); mx_lip.data_type = "RGBA"; mx_lip.location = (350, 300)
    L.new(lf.outputs[0], mx_lip.inputs[0]); L.new(mx_pale.outputs[2], mx_lip.inputs[6]); mx_lip.inputs[7].default_value = (0.36, 0.34, 0.45, 1)
    # pale, waxy fingers later
    hf = N.new("ShaderNodeMath"); hf.operation = "MULTIPLY"; hf.location = (350, -100)
    L.new(sp.outputs[2], hf.inputs[0]); L.new(LM.scene_attr(nt, "cold_hands", (200, -450)).outputs["Fac"], hf.inputs[1])
    mx_h = N.new("ShaderNodeMix"); mx_h.data_type = "RGBA"; mx_h.location = (550, 300)
    L.new(hf.outputs[0], mx_h.inputs[0]); L.new(mx_lip.outputs[2], mx_h.inputs[6]); mx_h.inputs[7].default_value = (0.78, 0.74, 0.78, 1)
    L.new(mx_h.outputs[2], b.inputs["Base Color"])
    b.subsurface_method = "BURLEY"
    b.inputs["Subsurface Weight"].default_value = 0.18
    b.inputs["Subsurface Radius"].default_value = (1.0, 0.38, 0.22)
    b.inputs["Subsurface Scale"].default_value = 0.008
    b.inputs["Roughness"].default_value = 0.47
    b.inputs["Specular IOR Level"].default_value = 0.45
    # pores + goosebumps bump (baked grain texture -> cheap)
    tc = N.new("ShaderNodeTexCoord"); tc.location = (-900, -600)
    mp = N.new("ShaderNodeMapping"); mp.inputs["Scale"].default_value = (22, 22, 22); L.new(tc.outputs["Object"], mp.inputs[0]); mp.location = (-700, -600)
    gr = N.new("ShaderNodeTexImage"); gr.image = bpy.data.images.load(LM.GEN + "/frost_noise.png", check_existing=True)
    gr.projection = "BOX"; gr.projection_blend = 0.3; L.new(mp.outputs[0], gr.inputs[0]); gr.location = (-500, -600)
    sg = N.new("ShaderNodeSeparateColor"); L.new(gr.outputs[0], sg.inputs[0]); sg.location = (-300, -600)
    gb = LM.scene_attr(nt, "goosebumps", (-300, -800))
    gstr = N.new("ShaderNodeMath"); gstr.operation = "MULTIPLY_ADD"; gstr.location = (-100, -800)
    L.new(gb.outputs["Fac"], gstr.inputs[0]); gstr.inputs[1].default_value = 0.35; gstr.inputs[2].default_value = 0.06
    bump = N.new("ShaderNodeBump"); bump.inputs["Distance"].default_value = 0.0008; bump.location = (600, -600)
    L.new(sg.outputs[2], bump.inputs["Height"]); L.new(gstr.outputs[0], bump.inputs["Strength"])
    L.new(bump.outputs[0], b.inputs["Normal"])
    return m


skin = skin_material()
body.data.materials.clear(); body.data.materials.append(skin)


# ------------------------------------------------------------- overalls recolour
def recolor_overalls(mat):
    nt = mat.node_tree; N, L = nt.nodes, nt.links
    tex = next(n for n in N if n.type == "TEX_IMAGE" and "diffuse" in n.image.filepath)
    tgt = [l.to_socket for l in tex.outputs["Color"].links]
    sep = N.new("ShaderNodeSeparateColor"); sep.mode = "HSV"; L.new(tex.outputs["Color"], sep.inputs[0])
    msk = N.new("ShaderNodeMapRange"); msk.inputs[1].default_value = 0.12; msk.inputs[2].default_value = 0.3
    L.new(sep.outputs[1], msk.inputs[0])
    hs = N.new("ShaderNodeHueSaturation"); hs.inputs["Hue"].default_value = 0.98
    hs.inputs["Saturation"].default_value = 0.85; hs.inputs["Value"].default_value = 0.62
    L.new(tex.outputs["Color"], hs.inputs["Color"])
    # rotate blue (~0.6) to burnt orange (~0.07): hue node offsets by (hue-0.5)
    hs.inputs["Hue"].default_value = 0.5 + (0.075 - 0.60)
    mx = N.new("ShaderNodeMix"); mx.data_type = "RGBA"
    L.new(msk.outputs[0], mx.inputs[0]); L.new(tex.outputs["Color"], mx.inputs[6]); L.new(hs.outputs[0], mx.inputs[7])
    for s in tgt: L.new(mx.outputs[2], s)


recolor_overalls(bpy.data.objects["Leo.male_worksuit01"].data.materials[0])


# ------------------------------------------------------------- frost in hair / brows
def frost_hair(mat, amount_name="frost_hair"):
    nt = mat.node_tree; N, L = nt.nodes, nt.links
    bsdf = next((n for n in N if n.type == "BSDF_PRINCIPLED"), None)
    if bsdf is None:
        for g in [n for n in N if n.type == "GROUP"]:
            bsdf = next((n for n in g.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
            if bsdf: nt = g.node_tree; N, L = nt.nodes, nt.links; break
    if bsdf is None or not bsdf.inputs["Base Color"].is_linked: return
    src = bsdf.inputs["Base Color"].links[0].from_socket
    fa = LM.scene_attr(nt, amount_name)
    tc = N.new("ShaderNodeTexCoord"); gr = N.new("ShaderNodeTexImage")
    gr.image = bpy.data.images.load(LM.GEN + "/frost_noise.png", check_existing=True); gr.projection = "BOX"
    mp = N.new("ShaderNodeMapping"); mp.inputs["Scale"].default_value = (9, 9, 9)
    L.new(tc.outputs["Object"], mp.inputs[0]); L.new(mp.outputs[0], gr.inputs[0])
    sp = N.new("ShaderNodeSeparateColor"); L.new(gr.outputs[0], sp.inputs[0])
    mul = N.new("ShaderNodeMath"); mul.operation = "MULTIPLY"; L.new(sp.outputs[2], mul.inputs[0]); L.new(fa.outputs["Fac"], mul.inputs[1])
    mr = N.new("ShaderNodeMapRange"); mr.inputs[1].default_value = 0.15; mr.inputs[2].default_value = 0.6; L.new(mul.outputs[0], mr.inputs[0])
    mx = N.new("ShaderNodeMix"); mx.data_type = "RGBA"; L.new(mr.outputs[0], mx.inputs[0])
    L.new(src, mx.inputs[6]); mx.inputs[7].default_value = (0.88, 0.93, 0.98, 1)
    L.new(mx.outputs[2], bsdf.inputs["Base Color"])


for nm in ["Leo.short02", "Leo.eyebrow001", "Leo.eyelashes01"]:
    frost_hair(bpy.data.objects[nm].data.materials[0])

# ------------------------------------------------------------- render defaults tuned for this CPU box
sc.cycles.samples = 12
sc.cycles.adaptive_threshold = 0.04
sc.cycles.use_denoising = True
sc.cycles.denoiser = "OPENIMAGEDENOISE"
sc.cycles.denoising_input_passes = "RGB_ALBEDO_NORMAL"
sc.cycles.max_bounces = 6; sc.cycles.diffuse_bounces = 2; sc.cycles.glossy_bounces = 2
sc.cycles.transmission_bounces = 4; sc.cycles.transparent_max_bounces = 10; sc.cycles.volume_bounces = 0
sc.cycles.blur_glossy = 1.0; sc.cycles.caustics_reflective = False; sc.cycles.caustics_refractive = False
sc.cycles.sample_clamp_indirect = 4.0
sc.render.use_persistent_data = True
sc.frame_start = 1; sc.frame_end = 3960
bpy.ops.wm.save_as_mainfile(filepath=OUT)
print("SAVED", OUT)
