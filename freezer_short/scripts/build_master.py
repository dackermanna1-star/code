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
    hs.inputs["Saturation"].default_value = 1.22; hs.inputs["Value"].default_value = 0.95
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
    """Blue denim -> worn rust-brown canvas: keep the texture's luminance detail, replace the hue."""
    nt = mat.node_tree; N, L = nt.nodes, nt.links
    tex = next(n for n in N if n.type == "TEX_IMAGE" and "diffuse" in n.image.filepath)
    tgt = [l.to_socket for l in tex.outputs["Color"].links]
    sep = N.new("ShaderNodeSeparateColor"); sep.mode = "HSV"; L.new(tex.outputs["Color"], sep.inputs[0])
    msk = N.new("ShaderNodeMapRange"); msk.inputs[1].default_value = 0.12; msk.inputs[2].default_value = 0.3
    L.new(sep.outputs[1], msk.inputs[0])
    bw = N.new("ShaderNodeRGBToBW"); L.new(tex.outputs["Color"], bw.inputs[0])
    gain = N.new("ShaderNodeMath"); gain.operation = "MULTIPLY"; gain.inputs[1].default_value = 1.9; L.new(bw.outputs[0], gain.inputs[0])
    col = N.new("ShaderNodeMix"); col.data_type = "RGBA"; col.blend_type = "MULTIPLY"; col.inputs[0].default_value = 1.0
    col.inputs[7].default_value = (0.62, 0.24, 0.085, 1)
    cc = N.new("ShaderNodeCombineColor"); L.new(gain.outputs[0], cc.inputs[0]); L.new(gain.outputs[0], cc.inputs[1]); L.new(gain.outputs[0], cc.inputs[2])
    L.new(cc.outputs[0], col.inputs[6])
    mx = N.new("ShaderNodeMix"); mx.data_type = "RGBA"
    L.new(msk.outputs[0], mx.inputs[0]); L.new(tex.outputs["Color"], mx.inputs[6]); L.new(col.outputs[2], mx.inputs[7])
    for s_ in tgt: L.new(mx.outputs[2], s_)


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
# darker, richer brown hair (MakeHuman short02 texture is a light ash brown)
def tint_tex(mat, mul):
    nt = mat.node_tree
    for t in [n for n in nt.nodes if n.type == "TEX_IMAGE" and "diffuse" in n.image.filepath]:
        for l in list(t.outputs["Color"].links):
            mx = nt.nodes.new("ShaderNodeMix"); mx.data_type = "RGBA"; mx.blend_type = "MULTIPLY"; mx.inputs[0].default_value = 1.0
            mx.inputs[7].default_value = (*mul, 1); nt.links.new(t.outputs["Color"], mx.inputs[6]); nt.links.new(mx.outputs[2], l.to_socket)
    for g in [n for n in nt.nodes if n.type == "GROUP"]:
        tint_tex_tree(g.node_tree, mul)
def tint_tex_tree(nt, mul):
    for t in [n for n in nt.nodes if n.type == "TEX_IMAGE" and n.image and "diffuse" in n.image.filepath]:
        for l in list(t.outputs["Color"].links):
            mx = nt.nodes.new("ShaderNodeMix"); mx.data_type = "RGBA"; mx.blend_type = "MULTIPLY"; mx.inputs[0].default_value = 1.0
            mx.inputs[7].default_value = (*mul, 1); nt.links.new(t.outputs["Color"], mx.inputs[6]); nt.links.new(mx.outputs[2], l.to_socket)
tint_tex(bpy.data.objects["Leo.short02"].data.materials[0], (0.55, 0.42, 0.32))

# ------------------------------------------------------------- rescuer "Maya"
with bpy.data.libraries.load("/opt/work/blend/coworker.blend") as (src, dst):
    dst.objects = [n for n in src.objects]
maya_c = bpy.data.collections.new("CHR_Maya"); sc.collection.children.link(maya_c)
for o in dst.objects:
    if o: maya_c.objects.link(o)
bpy.ops.file.make_paths_absolute()
for im in bpy.data.images:
    p = bpy.path.abspath(im.filepath)
    if not os.path.exists(p):
        base = os.path.basename(p)
        for root, _, files in os.walk("/root/.config/blender/4.5/extensions"):
            if base in files:
                im.filepath = os.path.join(root, base); break
maya = bpy.data.objects["Maya"]; maya.location = (0, -30, 0)  # parked off-set until the rescue
for o in maya_c.objects:
    if o.type == "MESH": bake_core(o)

C_PROPS = bpy.data.collections.new("PROPS"); sc.collection.children.link(C_PROPS)
import bmesh
# ---- phone (held in Leo's right hand via Child Of constraint, influence keyed per shot)
bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
for v in bm.verts: v.co = Vector((v.co.x * 0.072, v.co.y * 0.0085, v.co.z * 0.15))
me = bpy.data.meshes.new("Phone"); bm.to_mesh(me); bm.free()
phone = bpy.data.objects.new("Phone", me); C_PROPS.objects.link(phone)
bv = phone.modifiers.new("Bevel", "BEVEL"); bv.width = 0.006; bv.segments = 4
m_case = LM.pbr("M_PhoneCase", None, color=(0.03, 0.03, 0.035), rough=0.35, frost=False)
me.materials.append(m_case)
scr = bpy.data.meshes.new("PhoneScreen")
scr.from_pydata([(-0.033, -0.0046, -0.07), (0.033, -0.0046, -0.07), (0.033, -0.0046, 0.07), (-0.033, -0.0046, 0.07)], [], [(0, 1, 2, 3)])
uv = scr.uv_layers.new(); 
for i, c in enumerate([(0, 0), (1, 0), (1, 1), (0, 1)]): uv.data[i].uv = c
screen = bpy.data.objects.new("PhoneScreen", scr); C_PROPS.objects.link(screen); screen.parent = phone
ms = bpy.data.materials.new("M_PhoneScreen"); ms.use_nodes = True
nt = ms.node_tree; nt.nodes.remove(nt.nodes["Principled BSDF"])
tx = nt.nodes.new("ShaderNodeTexImage"); tx.image = bpy.data.images.load(LM.GEN + "/phone_screen.png")
em = nt.nodes.new("ShaderNodeEmission"); em.inputs[1].default_value = 2.2
nt.links.new(tx.outputs[0], em.inputs[0]); nt.links.new(em.outputs[0], nt.nodes["Material Output"].inputs[0])
ms.cycles.emission_sampling = "NONE"
scr.materials.append(ms)
phone.location = (0, -30, 0)
cof = phone.constraints.new("CHILD_OF"); cof.target = rig; cof.subtarget = "hand_r"; cof.influence = 0.0
cof.set_inverse_pending = False
# ---- emergency foil blanket: shell around Leo's torso/shoulders that deforms with his rig
bl = body.copy(); bl.data = body.data.copy(); bl.name = "FoilBlanket"; bl.data.name = "FoilBlanket"
C_PROPS.objects.link(bl)
keep_groups = ["spine_01", "spine_02", "spine_03", "clavicle_l", "clavicle_r", "upperarm_l", "upperarm_r", "neck_01", "pelvis", "thigh_l", "thigh_r", "lowerarm_l", "lowerarm_r"]
wsb = vg_weights(bl, keep_groups)
bm = bmesh.new(); bm.from_mesh(bl.data)
bm.verts.ensure_lookup_table()
helper = set(v.index for v in bl.data.vertices if v.co.z > 1.62 or v.co.z < 0.55)
body_idx = bl.vertex_groups["body"].index
kill = []
for v in bm.verts:
    w = wsb[v.index]; s_ = sum(w.values())
    inb = any(g.group == body_idx for g in bl.data.vertices[v.index].groups)
    if (not inb) or s_ < 0.5 or v.index in helper or (abs(v.co.x) > 0.42):
        kill.append(v)
bmesh.ops.delete(bm, geom=kill, context="VERTS")
for v in bm.verts:
    v.co += v.normal * (0.045 + 0.02 * math.sin(v.co.z * 40) * math.cos(v.co.x * 33))
bm.to_mesh(bl.data); bm.free()
if bl.data.shape_keys:
    bl.shape_key_clear()
for md in list(bl.modifiers):
    if md.type == "MASK": bl.modifiers.remove(md)
sol = bl.modifiers.new("Solid", "SOLIDIFY"); sol.thickness = 0.004
bl.data.materials.clear()
mf = bpy.data.materials.new("M_FoilBlanket"); mf.use_nodes = True
bf = mf.node_tree.nodes["Principled BSDF"]
bf.inputs["Base Color"].default_value = (0.95, 0.66, 0.25, 1); bf.inputs["Metallic"].default_value = 1.0
bf.inputs["Roughness"].default_value = 0.22
tcn = mf.node_tree.nodes.new("ShaderNodeTexCoord"); vo = mf.node_tree.nodes.new("ShaderNodeTexVoronoi"); vo.inputs["Scale"].default_value = 14
mf.node_tree.links.new(tcn.outputs["Object"], vo.inputs["Vector"])
bpn = mf.node_tree.nodes.new("ShaderNodeBump"); bpn.inputs["Strength"].default_value = 0.6
mf.node_tree.links.new(vo.outputs["Distance"], bpn.inputs["Height"]); mf.node_tree.links.new(bpn.outputs[0], bf.inputs["Normal"])
bl.data.materials.append(mf)
bl.hide_render = True; bl["hide_until"] = 1e9

# ---- breath vapour puffs (Cycles volumes), pool of 4, animated per exhale by shot scripts
m_breath = bpy.data.materials.new("M_Breath"); m_breath.use_nodes = True
nt = m_breath.node_tree; N, Lk = nt.nodes, nt.links
N.remove(N["Principled BSDF"])
pv = N.new("ShaderNodeVolumePrincipled"); pv.inputs["Color"].default_value = (0.9, 0.95, 1.0, 1)
pv.inputs["Anisotropy"].default_value = 0.35
tcb = N.new("ShaderNodeTexCoord")
nz = N.new("ShaderNodeTexNoise"); nz.noise_dimensions = "4D"; nz.inputs["Scale"].default_value = 3.2; nz.inputs["Detail"].default_value = 3
Lk.new(tcb.outputs["Object"], nz.inputs["Vector"])
drv_w = nz.inputs["W"].driver_add("default_value"); drv_w.driver.expression = "frame/24"
grad = N.new("ShaderNodeTexGradient"); grad.gradient_type = "SPHERICAL"; Lk.new(tcb.outputs["Object"], grad.inputs["Vector"])
mul = N.new("ShaderNodeMath"); mul.operation = "MULTIPLY"; Lk.new(nz.outputs["Fac"], mul.inputs[0]); Lk.new(grad.outputs["Fac"], mul.inputs[1])
mr = N.new("ShaderNodeMapRange"); mr.inputs[1].default_value = 0.18; mr.inputs[2].default_value = 0.5
Lk.new(mul.outputs[0], mr.inputs[0])
oa = N.new("ShaderNodeAttribute"); oa.attribute_type = "OBJECT"; oa.attribute_name = "puff"
mul2 = N.new("ShaderNodeMath"); mul2.operation = "MULTIPLY"; Lk.new(mr.outputs[0], mul2.inputs[0]); Lk.new(oa.outputs["Fac"], mul2.inputs[1])
mul3 = N.new("ShaderNodeMath"); mul3.operation = "MULTIPLY"; mul3.inputs[1].default_value = 6.0; Lk.new(mul2.outputs[0], mul3.inputs[0])
Lk.new(mul3.outputs[0], pv.inputs["Density"])
# thermal mode: exhaled air glows warm
tm = LM.scene_attr(nt, "thermal_mode")
emi = N.new("ShaderNodeMath"); emi.operation = "MULTIPLY"; Lk.new(mul2.outputs[0], emi.inputs[0]); Lk.new(tm.outputs["Fac"], emi.inputs[1])
emi2 = N.new("ShaderNodeMath"); emi2.operation = "MULTIPLY"; emi2.inputs[1].default_value = 8.0; Lk.new(emi.outputs[0], emi2.inputs[0])
Lk.new(emi2.outputs[0], pv.inputs["Emission Strength"]); pv.inputs["Emission Color"].default_value = (1.0, 0.45, 0.1, 1)
Lk.new(pv.outputs[0], N["Material Output"].inputs["Volume"])
m_breath.cycles.volume_step_rate = 2.0
sc["thermal_mode"] = 0.0
for i in range(4):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    me = bpy.data.meshes.new(f"BreathPuff_{i}"); bm.to_mesh(me); bm.free(); me.materials.append(m_breath)
    o = bpy.data.objects.new(f"BreathPuff_{i}", me); C_PROPS.objects.link(o)
    o["puff"] = 0.0; o.location = (0, -30, 0); o.scale = (0.1, 0.1, 0.1)
    o.visible_shadow = False

# ---- thermal-camera materials (emission only; swapped in by the thermal render script)
def thermal_ramp(nt, inp):
    r = nt.nodes.new("ShaderNodeValToRGB")
    els = r.color_ramp.elements
    stops = [(0.0, (0.0, 0.0, 0.02)), (0.18, (0.05, 0.0, 0.25)), (0.34, (0.25, 0.0, 0.55)), (0.5, (0.75, 0.02, 0.45)),
             (0.64, (1.0, 0.18, 0.02)), (0.78, (1.0, 0.55, 0.0)), (0.9, (1.0, 0.9, 0.2)), (1.0, (1.0, 1.0, 0.9))]
    els[0].position, els[0].color = stops[0][0], (*stops[0][1], 1)
    els[1].position, els[1].color = stops[-1][0], (*stops[-1][1], 1)
    for pos, col in stops[1:-1]:
        e = els.new(pos); e.color = (*col, 1)
    nt.links.new(inp, r.inputs[0])
    return r


def thermal_char_mat():
    m = bpy.data.materials.new("M_Thermal_Char"); m.use_nodes = True
    nt = m.node_tree; N, Lk = nt.nodes, nt.links; N.remove(N["Principled BSDF"])
    a = N.new("ShaderNodeAttribute"); a.attribute_type = "GEOMETRY"; a.attribute_name = "Core"
    tt = LM.scene_attr(nt, "thermal_temp"); th = LM.scene_attr(nt, "thermal_hands")
    # v = temp*(0.62+0.38*core) - (1-core)*(1-hands)*0.55
    m1 = N.new("ShaderNodeMath"); m1.operation = "MULTIPLY_ADD"; Lk.new(a.outputs["Fac"], m1.inputs[0]); m1.inputs[1].default_value = 0.38; m1.inputs[2].default_value = 0.62
    m2 = N.new("ShaderNodeMath"); m2.operation = "MULTIPLY"; Lk.new(m1.outputs[0], m2.inputs[0]); Lk.new(tt.outputs["Fac"], m2.inputs[1])
    inv = N.new("ShaderNodeMath"); inv.operation = "SUBTRACT"; inv.inputs[0].default_value = 1.0; Lk.new(a.outputs["Fac"], inv.inputs[1])
    invh = N.new("ShaderNodeMath"); invh.operation = "SUBTRACT"; invh.inputs[0].default_value = 1.0; Lk.new(th.outputs["Fac"], invh.inputs[1])
    m3 = N.new("ShaderNodeMath"); m3.operation = "MULTIPLY"; Lk.new(inv.outputs[0], m3.inputs[0]); Lk.new(invh.outputs[0], m3.inputs[1])
    m4 = N.new("ShaderNodeMath"); m4.operation = "MULTIPLY_ADD"; Lk.new(m3.outputs[0], m4.inputs[0]); m4.inputs[1].default_value = -0.55; Lk.new(m2.outputs[0], m4.inputs[2])
    lw = N.new("ShaderNodeLayerWeight"); lw.inputs[0].default_value = 0.3
    m5 = N.new("ShaderNodeMath"); m5.operation = "MULTIPLY_ADD"; Lk.new(lw.outputs["Facing"], m5.inputs[0]); m5.inputs[1].default_value = -0.12; Lk.new(m4.outputs[0], m5.inputs[2])
    r = thermal_ramp(nt, m5.outputs[0])
    e = N.new("ShaderNodeEmission"); Lk.new(r.outputs[0], e.inputs[0]); e.inputs[1].default_value = 1.0
    Lk.new(e.outputs[0], N["Material Output"].inputs[0])
    return m


def thermal_env_mat():
    m = bpy.data.materials.new("M_Thermal_Env"); m.use_nodes = True
    nt = m.node_tree; N, Lk = nt.nodes, nt.links; N.remove(N["Principled BSDF"])
    lw = N.new("ShaderNodeLayerWeight"); lw.inputs[0].default_value = 0.5
    geo = N.new("ShaderNodeNewGeometry")
    sp = N.new("ShaderNodeSeparateXYZ"); Lk.new(geo.outputs["Position"], sp.inputs[0])
    # ceiling a touch warmer (stratified air), floor coldest
    hz = N.new("ShaderNodeMath"); hz.operation = "MULTIPLY_ADD"; Lk.new(sp.outputs[2], hz.inputs[0]); hz.inputs[1].default_value = 0.018; hz.inputs[2].default_value = 0.1
    f1 = N.new("ShaderNodeMath"); f1.operation = "MULTIPLY_ADD"; Lk.new(lw.outputs["Facing"], f1.inputs[0]); f1.inputs[1].default_value = 0.06; Lk.new(hz.outputs[0], f1.inputs[2])
    # heat spots (hand print on metal, body heat into the floor) from empties HeatSpot_0..2
    acc = f1.outputs[0]
    for i in range(3):
        emp = bpy.data.objects.new(f"HeatSpot_{i}", None); C_PROPS.objects.link(emp); emp.location = (0, -30, 0)
        emp.empty_display_size = 0.1; emp["heat"] = 0.0
        tc = N.new("ShaderNodeTexCoord"); tc.object = emp
        ln = N.new("ShaderNodeVectorMath"); ln.operation = "LENGTH"; Lk.new(tc.outputs["Object"], ln.inputs[0])
        fo = N.new("ShaderNodeMapRange"); fo.inputs[1].default_value = 1.0; fo.inputs[2].default_value = 0.0
        fo.interpolation_type = "SMOOTHSTEP"; Lk.new(ln.outputs["Value"], fo.inputs[0])
        ha = N.new("ShaderNodeAttribute"); ha.attribute_type = "VIEW_LAYER"; ha.attribute_name = f"heat{i}"
        mm = N.new("ShaderNodeMath"); mm.operation = "MULTIPLY"; Lk.new(fo.outputs[0], mm.inputs[0]); Lk.new(ha.outputs["Fac"], mm.inputs[1])
        ad = N.new("ShaderNodeMath"); ad.operation = "ADD"; Lk.new(acc, ad.inputs[0]); Lk.new(mm.outputs[0], ad.inputs[1])
        acc = ad.outputs[0]
        sc[f"heat{i}"] = 0.0
    r = thermal_ramp(nt, acc)
    e = N.new("ShaderNodeEmission"); Lk.new(r.outputs[0], e.inputs[0])
    Lk.new(e.outputs[0], N["Material Output"].inputs[0])
    return m


thermal_char_mat(); thermal_env_mat()
for m in bpy.data.materials:
    if m.name.startswith("M_Thermal"): m.use_fake_user = True

# seat for the "best move" beat: two stacked product boxes next to the left shelving
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
