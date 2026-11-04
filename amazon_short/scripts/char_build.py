"""Build the main character "the Explorer" from CC0 Quaternius parts and save it as a library .blend.

Parts: Universal Base Characters (head/eyes/brows), Modular Character Outfits (shirt, arms, pants, boots),
hair rigged to Head bone. Everything is bound to ONE armature (RIG_Explorer) whose bone names match the
Universal Animation Library, so every UAL action plays directly on it.

Materials are rebuilt by hand so we control colour (explorer khaki / olive) and add a per-object
"condition" property (0 = fresh, 1 = day five) that drives sweat stains, mud, skin sheen and grime.
Run:  blender -b --factory-startup -P char_build.py
"""
import bpy, bmesh, glob, os, math
from mathutils import Vector

R = '/home/user/code/amazon_short/'
Q = R + 'assets/quaternius/'
BASE = Q + 'Universal Base Characters[Standard]/Base Characters/Godot - UE/'
MCO = Q + 'Modular Character Outfits - Fantasy[Standard]/Exports/glTF (Godot-Unreal)/'
HAIR = Q + 'Universal Base Characters[Standard]/Hairstyles/Rigged to Head Bone/glTF (Godot -Unreal)/'

import sys
VAR = 'boatwoman' if 'boatwoman' in sys.argv else 'explorer'
bpy.ops.wm.read_factory_settings(use_empty=True)
scn = bpy.context.scene


def imp(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.data.objects if o not in before]


# ---------------------------------------------------------------- base body
new = imp(BASE + ('Superhero_Female_FullBody.gltf' if VAR == 'boatwoman' else 'Superhero_Male_FullBody.gltf'))
rig = [o for o in new if o.type == 'ARMATURE'][0]
rig.name = 'RIG_Explorer'; rig.data.name = 'RIG_Explorer'
for o in new:
    if o.name.startswith('Icosphere'):
        bpy.data.objects.remove(o)
body = [o for o in bpy.data.objects if o.type == 'MESH' and o.name.lower().startswith('superhero')][0]; body.name = 'CH_Head'

# keep only head + neck verts of the full body (outfit covers the rest)
keep_groups = {'Head', 'neck_01'}
vg_idx = {g.index: g.name for g in body.vertex_groups}
bm = bmesh.new(); bm.from_mesh(body.data)
deform = bm.verts.layers.deform.active
kill = []
for v in bm.verts:
    w_keep = sum(w for gi, w in v[deform].items() if vg_idx.get(gi) in keep_groups)
    if w_keep < 0.35:
        kill.append(v)
bmesh.ops.delete(bm, geom=kill, context='VERTS')
bm.to_mesh(body.data); bm.free()

# ---------------------------------------------------------------- outfit parts
G = 'Female' if VAR == 'boatwoman' else 'Male'
parts = [MCO + f'Modular Parts/{G}_Peasant_Body.gltf',
         MCO + f'Modular Parts/{G}_Peasant_Arms.gltf',
         MCO + f'Modular Parts/{G}_Peasant_Legs.gltf' if VAR == 'boatwoman' else MCO + 'Modular Parts/Male_Ranger_Legs.gltf',
         MCO + 'Modular Parts/Female_Peasant_Feet.gltf' if VAR == 'boatwoman' else MCO + 'Modular Parts/Male_Ranger_Feet_Boots.gltf',
         HAIR + ('Hair_Buns.gltf' if VAR == 'boatwoman' else 'Hair_SimpleParted.gltf'),
         ]
for p in parts:
    objs = imp(p)
    arm = [o for o in objs if o.type == 'ARMATURE'][0]
    for o in objs:
        if o.type == 'MESH' and not o.name.startswith('Icosphere'):
            mw = o.matrix_world.copy()
            o.parent = rig; o.matrix_world = mw
            for m in o.modifiers:
                if m.type == 'ARMATURE':
                    m.object = rig
    for o in objs:
        if o.type == 'ARMATURE' or o.name.startswith('Icosphere'):
            bpy.data.objects.remove(o)

# ---------------------------------------------------------------- materials
def S(coll, name, typ='RGBA'):
    for x in coll:
        if x.name == name and x.type == typ: return x
    raise KeyError(name)


def img(path, non_color=False):
    i = bpy.data.images.load(path, check_existing=True)
    if non_color: i.colorspace_settings.name = 'Non-Color'
    return i


def node_mat(name):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial'); out.location = (900, 0)
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled'); bsdf.location = (600, 0)
    nt.links.new(bsdf.outputs[0], out.inputs[0])
    return m, nt, bsdf


def tex(nt, image, loc, non_color=False):
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = image; t.location = loc
    if non_color: image.colorspace_settings.name = 'Non-Color'
    return t


def normal(nt, image, bsdf, strength=1.0, loc=(0, -500)):
    t = tex(nt, image, loc, True)
    n = nt.nodes.new('ShaderNodeNormalMap'); n.location = (loc[0] + 300, loc[1]); n.inputs[0].default_value = strength
    nt.links.new(t.outputs[0], n.inputs[1]); nt.links.new(n.outputs[0], bsdf.inputs['Normal'])
    return n


def cond_attr(nt, loc):
    a = nt.nodes.new('ShaderNodeAttribute'); a.attribute_type = 'OBJECT'; a.attribute_name = 'condition'; a.location = loc
    return a


def maprange(nt, val_socket, a, b, loc):
    mr = nt.nodes.new('ShaderNodeMapRange'); mr.location = loc
    mr.inputs[1].default_value = a; mr.inputs[2].default_value = b
    nt.links.new(val_socket, mr.inputs[0]); return mr


def math_node(nt, op, loc, a=None, b=None):
    m = nt.nodes.new('ShaderNodeMath'); m.operation = op; m.location = loc
    if a is not None: m.inputs[0].default_value = a
    if b is not None: m.inputs[1].default_value = b
    return m


def grime_mask(nt, cond, scale, lo, hi, loc, zfade=None):
    """Noise-based patch mask that grows with condition."""
    tc = nt.nodes.new('ShaderNodeTexCoord'); tc.location = (loc[0] - 800, loc[1])
    nz = nt.nodes.new('ShaderNodeTexNoise'); nz.location = (loc[0] - 600, loc[1])
    nz.inputs['Scale'].default_value = scale; nz.inputs['Detail'].default_value = 8; nz.inputs['Roughness'].default_value = 0.6
    nt.links.new(tc.outputs['Object'], nz.inputs['Vector'])
    # threshold drops as condition grows -> patches spread
    thr = maprange(nt, cond.outputs['Fac'], 0, 1, (loc[0] - 600, loc[1] - 250))
    thr.inputs[3].default_value = hi; thr.inputs[4].default_value = lo
    sub = math_node(nt, 'SUBTRACT', (loc[0] - 400, loc[1])); nt.links.new(nz.outputs['Fac'], sub.inputs[0]); nt.links.new(thr.outputs[0], sub.inputs[1])
    mul = math_node(nt, 'MULTIPLY', (loc[0] - 250, loc[1]), b=9.0); mul.use_clamp = True; nt.links.new(sub.outputs[0], mul.inputs[0])
    last = mul
    if zfade is not None:  # mud rises from the boots
        sep = nt.nodes.new('ShaderNodeSeparateXYZ'); sep.location = (loc[0] - 600, loc[1] - 450)
        nt.links.new(tc.outputs['Object'], sep.inputs[0])
        zr = nt.nodes.new('ShaderNodeMapRange'); zr.location = (loc[0] - 400, loc[1] - 450)
        nt.links.new(sep.outputs['Z'], zr.inputs[0])
        zr.inputs[1].default_value = zfade[0]; zr.inputs[2].default_value = zfade[1]
        zr.inputs[3].default_value = 1; zr.inputs[4].default_value = 0
        m2 = math_node(nt, 'MULTIPLY', (loc[0] - 120, loc[1])); m2.use_clamp = True
        nt.links.new(mul.outputs[0], m2.inputs[0]); nt.links.new(zr.outputs[0], m2.inputs[1]); last = m2
    return last


def cloth_material(name, base_img, nrm_img, orm_img, tint, tint_amt, sweat=True, mud_z=None, rough_base=0.85):
    m, nt, bsdf = node_mat(name)
    t = tex(nt, base_img, (-900, 300))
    # recolour: desaturate the original then multiply by our tint -> keeps fabric detail and seams
    hsv = nt.nodes.new('ShaderNodeHueSaturation'); hsv.location = (-600, 300)
    hsv.inputs['Saturation'].default_value = 0.15; hsv.inputs['Value'].default_value = 1.35
    nt.links.new(t.outputs[0], hsv.inputs['Color'])
    mix_t = nt.nodes.new('ShaderNodeMix'); mix_t.data_type = 'RGBA'; mix_t.blend_type = 'MULTIPLY'; mix_t.location = (-400, 300)
    mix_t.inputs['Factor'].default_value = tint_amt
    nt.links.new(hsv.outputs[0], S(mix_t.inputs,'A')); S(mix_t.inputs,'B').default_value = tint
    # keep untinted pixels for leather / buckles where original is dark (belts etc.) -> blend by tint_amt
    col = S(mix_t.outputs,'Result')
    cond = cond_attr(nt, (-1400, 0))
    rough = nt.nodes.new('ShaderNodeValue'); rough.outputs[0].default_value = rough_base; rough.location = (-200, -100)
    rsock = rough.outputs[0]
    if sweat:
        sm = grime_mask(nt, cond, 2.2, 0.38, 0.75, (-200, 0))
        dark = nt.nodes.new('ShaderNodeMix'); dark.data_type = 'RGBA'; dark.blend_type = 'MULTIPLY'; dark.location = (100, 300)
        f = math_node(nt, 'MULTIPLY', (-50, 150), b=0.75); nt.links.new(sm.outputs[0], f.inputs[0])
        nt.links.new(f.outputs[0], dark.inputs['Factor']); nt.links.new(col, S(dark.inputs,'A')); S(dark.inputs,'B').default_value = (0.45, 0.42, 0.38, 1)
        col = S(dark.outputs,'Result')
        rmix = nt.nodes.new('ShaderNodeMix'); rmix.location = (100, -100)
        nt.links.new(sm.outputs[0], rmix.inputs['Factor']); rmix.inputs['A'].default_value = rough_base; rmix.inputs['B'].default_value = 0.55
        rsock = rmix.outputs['Result']
    # global grime + mud from below
    mud = grime_mask(nt, cond, 5.0, 0.25, 0.9, (-200, -700), zfade=mud_z if mud_z else (0.0, 1.9))
    mm = nt.nodes.new('ShaderNodeMix'); mm.data_type = 'RGBA'; mm.location = (300, 300)
    nt.links.new(mud.outputs[0], mm.inputs['Factor']); nt.links.new(col, S(mm.inputs,'A')); S(mm.inputs,'B').default_value = (0.11, 0.075, 0.045, 1)
    nt.links.new(S(mm.outputs,'Result'), bsdf.inputs['Base Color'])
    nt.links.new(rsock, bsdf.inputs['Roughness'])
    normal(nt, nrm_img, bsdf, 1.0, (-200, -1100))
    bsdf.inputs['Sheen Weight'].default_value = 0.25
    return m


def skin_material(name, base_img, nrm_img, rough_img):
    m, nt, bsdf = node_mat(name)
    t = tex(nt, base_img, (-900, 300))
    cond = cond_attr(nt, (-1400, 0))
    # tired skin: slightly redder / greyer with condition, plus insect bites (voronoi dots) on exposed skin
    bc = nt.nodes.new('ShaderNodeHueSaturation'); bc.location = (-600, 300)
    nt.links.new(t.outputs[0], bc.inputs['Color'])
    sat = maprange(nt, cond.outputs['Fac'], 0, 1, (-900, 0)); sat.inputs[3].default_value = 1.05; sat.inputs[4].default_value = 0.85
    nt.links.new(sat.outputs[0], bc.inputs['Saturation'])
    val = maprange(nt, cond.outputs['Fac'], 0, 1, (-900, -200)); val.inputs[3].default_value = 1.0; val.inputs[4].default_value = 0.88
    nt.links.new(val.outputs[0], bc.inputs['Value'])
    # bites
    tc = nt.nodes.new('ShaderNodeTexCoord'); tc.location = (-1200, -500)
    vor = nt.nodes.new('ShaderNodeTexVoronoi'); vor.location = (-1000, -500); vor.inputs['Scale'].default_value = 38
    nt.links.new(tc.outputs['Object'], vor.inputs['Vector'])
    dot = nt.nodes.new('ShaderNodeMapRange'); dot.location = (-800, -500)
    nt.links.new(vor.outputs['Distance'], dot.inputs[0]); dot.inputs[1].default_value = 0.0; dot.inputs[2].default_value = 0.24
    dot.inputs[3].default_value = 1; dot.inputs[4].default_value = 0
    rnd = nt.nodes.new('ShaderNodeMapRange'); rnd.location = (-800, -750)
    nt.links.new(vor.outputs['Color'], rnd.inputs[0])
    bth = maprange(nt, cond.outputs['Fac'], 0.35, 1.0, (-1000, -900)); bth.inputs[3].default_value = 1.0; bth.inputs[4].default_value = 0.55
    gt = math_node(nt, 'GREATER_THAN', (-600, -750)); nt.links.new(rnd.outputs[0], gt.inputs[0]); nt.links.new(bth.outputs[0], gt.inputs[1])
    bite = math_node(nt, 'MULTIPLY', (-450, -600)); nt.links.new(dot.outputs[0], bite.inputs[0]); nt.links.new(gt.outputs[0], bite.inputs[1])
    bmix = nt.nodes.new('ShaderNodeMix'); bmix.data_type = 'RGBA'; bmix.location = (-300, 300)
    bf = math_node(nt, 'MULTIPLY', (-300, -600), b=1.0); nt.links.new(bite.outputs[0], bf.inputs[0])
    nt.links.new(bf.outputs[0], bmix.inputs['Factor']); nt.links.new(bc.outputs[0], S(bmix.inputs,'A')); S(bmix.inputs,'B').default_value = (0.62, 0.10, 0.08, 1)
    # dirt smudges
    dm = grime_mask(nt, cond, 4.0, 0.3, 0.95, (0, -300))
    dmf = math_node(nt, 'MULTIPLY', (100, -300), b=0.55); nt.links.new(dm.outputs[0], dmf.inputs[0])
    dmix = nt.nodes.new('ShaderNodeMix'); dmix.data_type = 'RGBA'; dmix.blend_type = 'MULTIPLY'; dmix.location = (250, 300)
    nt.links.new(dmf.outputs[0], dmix.inputs['Factor']); nt.links.new(S(bmix.outputs,'Result'), S(dmix.inputs,'A')); S(dmix.inputs,'B').default_value = (0.35, 0.28, 0.22, 1)
    nt.links.new(S(dmix.outputs,'Result'), bsdf.inputs['Base Color'])
    # sweat sheen: roughness falls as condition rises (peak sweat mid-story handled by 'sweat' prop)
    sw = nt.nodes.new('ShaderNodeAttribute'); sw.attribute_type = 'OBJECT'; sw.attribute_name = 'sweat'; sw.location = (-200, -100)
    rt = tex(nt, rough_img, (-500, -150), True)
    rr = nt.nodes.new('ShaderNodeMix'); rr.location = (300, -100)
    nt.links.new(sw.outputs['Fac'], rr.inputs['Factor']); nt.links.new(rt.outputs[0], rr.inputs['A']); rr.inputs['B'].default_value = 0.36
    nt.links.new(rr.outputs['Result'], bsdf.inputs['Roughness'])
    spec = maprange(nt, sw.outputs['Fac'], 0, 1, (300, -300)); spec.inputs[3].default_value = 0.4; spec.inputs[4].default_value = 0.6
    nt.links.new(spec.outputs[0], bsdf.inputs['Specular IOR Level'])
    bsdf.inputs['Subsurface Weight'].default_value = 0.12
    bsdf.inputs['Subsurface Radius'].default_value = (1.0, 0.35, 0.2)
    bsdf.inputs['Subsurface Scale'].default_value = 0.012
    normal(nt, nrm_img, bsdf, 0.8, (-200, -1100))
    return m


def simple_tex_material(name, base_img, nrm_img=None, rough=0.6, alpha_from_base=False):
    m, nt, bsdf = node_mat(name)
    t = tex(nt, base_img, (-500, 300))
    nt.links.new(t.outputs[0], bsdf.inputs['Base Color'])
    if alpha_from_base:
        nt.links.new(t.outputs['Alpha'], bsdf.inputs['Alpha'])
    bsdf.inputs['Roughness'].default_value = rough
    if nrm_img: normal(nt, nrm_img, bsdf, 1.0)
    return m


PEAS = MCO + 'Modular Parts/T_Peasant_'; RANG = MCO + 'Modular Parts/T_Ranger_'
mat_shirt = cloth_material('MAT_Explorer_Shirt', img(PEAS + 'BaseColor.png'), img(PEAS + 'Normal.png'), None,
                           ((0.50, 0.10, 0.08, 1) if VAR == 'boatwoman' else (0.60, 0.47, 0.27, 1)), 1.0, sweat=True, mud_z=(0.6, 1.5))
mat_pants = cloth_material('MAT_Explorer_Pants', img(RANG + 'BaseColor.png'), img(RANG + 'Normal.png'), None,
                           ((0.10, 0.12, 0.2, 1) if VAR == 'boatwoman' else (0.20, 0.22, 0.12, 1)), 1.0, sweat=False, mud_z=(0.05, 1.0))
mat_boots = cloth_material('MAT_Explorer_Boots', img(RANG + 'BaseColor.png'), img(RANG + 'Normal.png'), None,
                           (0.26, 0.15, 0.08, 1), 1.0, sweat=False, mud_z=(0.0, 0.45), rough_base=0.7)
mat_skin_head = skin_material('MAT_Skin_Head', img(BASE + ('T_Superhero_Female_Dark_BaseColor.png' if VAR == 'boatwoman' else 'T_Superhero_Male_Dark.png')), img(BASE + f'T_Superhero_{G}_Normal.png'), img(BASE + f'T_Superhero_{G}_Roughness.png'))
mat_skin_arms = skin_material('MAT_Skin_Arms', img(MCO + f'Modular Parts/T_Regular_{G}_Dark_BaseColor.png'), img(MCO + f'Modular Parts/T_Regular_{G}_Normal.png'), img(MCO + f'Modular Parts/T_Regular_{G}_Roughness.png'))
mat_hair = simple_tex_material('MAT_Hair', img(BASE + 'T_Hair_1_BaseColor.png'), img(BASE + 'T_Hair_1_Normal.png'), 0.5)
_nt = mat_hair.node_tree; _b = _nt.nodes['Principled BSDF']; _t = [n for n in _nt.nodes if n.type == 'TEX_IMAGE'][0]
_m = _nt.nodes.new('ShaderNodeMix'); _m.data_type = 'RGBA'; _m.blend_type = 'MULTIPLY'; _m.inputs[0].default_value = 1.0
_nt.links.new(_t.outputs[0], S(_m.inputs, 'A')); S(_m.inputs, 'B').default_value = (0.035, 0.02, 0.012, 1)
_nt.links.new(S(_m.outputs, 'Result'), _b.inputs['Base Color'])
mat_hair_beard = simple_tex_material('MAT_Hair_Beard', img(BASE + 'T_Hair_1_BaseColor.png'), img(BASE + 'T_Hair_1_Normal.png'), 0.6)
mat_eyes = simple_tex_material('MAT_Eyes', img(BASE + 'T_Eye_Brown.png'), img(BASE + 'T_Eye_Normal.png'), 0.08)
mat_eyes.node_tree.nodes['Principled BSDF'].inputs['Coat Weight'].default_value = 1.0

for o in rig.children:
    if o.type != 'MESH': continue
    n = o.name
    for i, slot in enumerate(o.material_slots):
        mn = slot.material.name if slot.material else ''
        if n == 'CH_Head': slot.material = mat_skin_head
        elif 'Regular_' in mn: slot.material = mat_skin_arms
        elif n.startswith(f'{G}_Peasant_Body') or n.startswith(f'{G}_Peasant_Arms'): slot.material = mat_shirt
        elif 'Legs' in n: slot.material = mat_pants
        elif 'Feet' in n: slot.material = mat_boots
        elif n.startswith('Hair_Beard'): slot.material = mat_hair_beard
        elif n.startswith('Hair') or n.startswith('Eyebrows'): slot.material = mat_hair
        elif n.startswith('Eyes'): slot.material = mat_eyes
    o['condition'] = 0.0; o['sweat'] = 0.0
    nice = {f'{G}_Peasant_Body': 'CH_Shirt', f'{G}_Peasant_Arms': 'CH_Arms', 'Male_Ranger_Legs': 'CH_Pants', 'Female_Peasant_Legs': 'CH_Pants',
            'Male_Ranger_Feet_Boots': 'CH_Boots', 'Female_Peasant_Feet': 'CH_Boots', 'Hair_SimpleParted': 'CH_Hair', 'Hair_Buns': 'CH_Hair', 'Hair_Beard': 'CH_Beard',
            'Eyebrows': 'CH_Eyebrows', 'Eyes': 'CH_Eyes'}
    for k, v in nice.items():
        if n.startswith(k): o.name = v
    for m in o.modifiers:
        if m.type == 'ARMATURE': m.use_deform_preserve_volume = True
    o.data.shade_smooth() if hasattr(o.data, 'shade_smooth') else None

# stubble beard grows with days: scale beard down to "stubble" with a shape key
beard = bpy.data.objects.get('CH_Beard')
if beard:
    beard.shape_key_add(name='Basis')
    sk = beard.shape_key_add(name='Stubble')
    # pull every vertex 70% toward the head surface (approx: toward head bone axis) -> thin stubble
    hb = rig.data.bones['Head']; hc = rig.matrix_world @ ((hb.head_local + hb.tail_local) / 2)
    for i, v in enumerate(beard.data.vertices):
        co = beard.matrix_world @ v.co
        d = (co - hc)
        sk.data[i].co = beard.matrix_world.inverted() @ (hc + d * 0.965)
    sk.value = 1.0

# ---------------------------------------------------------------- props: daypack + bottle
def bevel_box(name, size, loc, mat, bevel=0.02):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.active_object; o.name = name; o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    b = o.modifiers.new('bevel', 'BEVEL'); b.width = bevel; b.segments = 4
    s = o.modifiers.new('sub', 'SUBSURF'); s.levels = 1; s.render_levels = 2
    o.data.materials.append(mat); bpy.ops.object.shade_smooth()
    return o


def fabric(name, col, rough=0.9):
    m, nt, bsdf = node_mat(name)
    bsdf.inputs['Base Color'].default_value = col; bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Sheen Weight'].default_value = 0.4
    tc = nt.nodes.new('ShaderNodeTexCoord'); w = nt.nodes.new('ShaderNodeTexWave'); w.inputs['Scale'].default_value = 120
    w.wave_type = 'BANDS'; nt.links.new(tc.outputs['Object'], w.inputs['Vector'])
    bump = nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.05
    nt.links.new(w.outputs['Fac'], bump.inputs['Height']); nt.links.new(bump.outputs[0], bsdf.inputs['Normal'])
    return m


mat_pack = fabric('MAT_Daypack', (0.025, 0.06, 0.075, 1))
mat_strap = fabric('MAT_Strap', (0.03, 0.035, 0.04, 1))
sp = rig.matrix_world @ rig.data.bones['spine_03'].head_local
pack = bevel_box('PR_Daypack', (0.30, 0.16, 0.40), (sp.x, sp.y + 0.17, sp.z - 0.05), mat_pack, 0.05)
pocket = bevel_box('PR_Daypack_Pocket', (0.22, 0.06, 0.18), (sp.x, sp.y + 0.27, sp.z - 0.15), mat_pack, 0.03)
pocket.parent = pack; pocket.matrix_parent_inverse = pack.matrix_world.inverted()
for side in (-1, 1):
    bpy.ops.curve.primitive_bezier_curve_add()
    c = bpy.context.active_object; c.name = f'PR_Strap_{"L" if side < 0 else "R"}'
    pts = c.data.splines[0].bezier_points
    pts[0].co = Vector((side * 0.09, sp.y + 0.10, sp.z + 0.17)); pts[0].handle_left = pts[0].co + Vector((0, 0.03, 0.05)); pts[0].handle_right = pts[0].co + Vector((0, -0.12, 0.08))
    pts[1].co = Vector((side * 0.10, sp.y + 0.09, sp.z - 0.22)); pts[1].handle_left = pts[1].co + Vector((side * 0.06, -0.25, 0.10)); pts[1].handle_right = pts[1].co + Vector((0, 0.03, -0.03))
    c.data.bevel_mode = 'ROUND'; c.data.bevel_depth = 0.012; c.data.resolution_u = 16
    c.data.extrude = 0.0; c.data.materials.append(mat_strap)
    c.parent = pack; c.matrix_parent_inverse = pack.matrix_world.inverted()
# bind pack to spine_03 bone (keep world transform)
bpy.context.view_layer.update()
mw = pack.matrix_world.copy()
pack.parent = rig; pack.parent_type = 'BONE'; pack.parent_bone = 'spine_03'
bpy.context.view_layer.update()
pack.matrix_world = mw

# metal water bottle (nearly empty, he only had a little water) – parented to hand_r when needed (Child Of constraint)
mat_bottle = bpy.data.materials.new('MAT_Bottle'); mat_bottle.use_nodes = True
b = mat_bottle.node_tree.nodes['Principled BSDF']; b.inputs['Base Color'].default_value = (0.05, 0.35, 0.28, 1); b.inputs['Metallic'].default_value = 0.85; b.inputs['Roughness'].default_value = 0.35
bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=0.036, depth=0.22, location=(0, 0, 0))
bottle = bpy.context.active_object; bottle.name = 'PR_Bottle'
bm = bmesh.new(); bm.from_mesh(bottle.data)
for v in bm.verts:
    if v.co.z > 0.09: v.co.x *= 0.55; v.co.y *= 0.55
bm.to_mesh(bottle.data); bm.free()
bv = bottle.modifiers.new('bv', 'BEVEL'); bv.width = 0.01; bv.segments = 3
bottle.modifiers.new('sub', 'SUBSURF').levels = 1
bottle.data.materials.append(mat_bottle); bpy.ops.object.shade_smooth()
bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.022, depth=0.03, location=(0, 0, 0.125))
cap = bpy.context.active_object; cap.name = 'PR_Bottle_Cap'; cap.data.materials.append(mat_strap); cap.hide_render = True
cap.parent = bottle
ch = bottle.constraints.new('CHILD_OF'); ch.target = rig; ch.subtarget = 'hand_r'
ch.inverse_matrix.identity()
bottle.location = (0.0, 0.08, 0.03); bottle.rotation_euler = (math.radians(90), 0, 0)
bottle.hide_render = True; bottle['note'] = 'unhide + key Child Of influence in shots that need it'

# ---------------------------------------------------------------- collection & save
if VAR == 'boatwoman':
    for o in list(bpy.data.objects):
        if o.name.startswith(('PR_Daypack', 'PR_Strap')): bpy.data.objects.remove(o)
    rig.name = 'RIG_Boatwoman'
col = bpy.data.collections.new('CH_Boatwoman' if VAR == 'boatwoman' else 'CH_Explorer'); scn.collection.children.link(col)
for o in list(scn.collection.objects):
    scn.collection.objects.unlink(o); col.objects.link(o)
for o in bpy.data.objects:
    if o.name not in col.objects and not o.users_collection:
        col.objects.link(o)
# tidy: remove leftover materials from gltf
for m in list(bpy.data.materials):
    if m.users == 0: bpy.data.materials.remove(m)
rig.show_in_front = False
os.makedirs(R + 'blend', exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=R + ('blend/char_boatwoman.blend' if VAR == 'boatwoman' else 'blend/char_explorer.blend'))
print('SAVED character', [o.name for o in col.objects])
