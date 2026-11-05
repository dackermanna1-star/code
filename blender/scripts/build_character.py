"""Build the film's main character ("the castaway") with MPFB2 + MakeHuman CC0/CC-BY assets.

Run:  blender -b --factory-startup -P build_character.py -- <out.blend> [variant.json]

The character must look identical in every shot, so all shots append the
Castaway collection from the .blend this script writes. Do not rebuild per shot.
"""
import bpy, sys, os, json

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else '/home/user/code/blender/assets/character.blend'
VARIANT = json.load(open(argv[1])) if len(argv) > 1 else {}

import addon_utils
addon_utils.enable('bl_ext.user_default.mpfb', default_set=True)
from bl_ext.user_default.mpfb.services.humanservice import HumanService
from bl_ext.user_default.mpfb.services.faceservice import FaceService
from bl_ext.user_default.mpfb.services.targetservice import TargetService
from bl_ext.user_default.mpfb.services.locationservice import LocationService

D = LocationService.get_user_data()
S = LocationService.get_mpfb_data()

bpy.ops.wm.read_factory_settings(use_empty=True)

# ---------------------------------------------------------------- body shape
pheno = TargetService.get_default_macro_info_dict()
pheno.update({
    'gender': 1.0, 'age': 0.5,          # ~25 years old
    'muscle': 0.62, 'weight': 0.47,
    'height': 0.58, 'proportions': 0.7,
})
pheno['race'] = {'african': 0.08, 'asian': 0.12, 'caucasian': 0.80}
pheno.update(VARIANT.get('pheno', {}))

basemesh = HumanService.create_human(mask_helpers=True, detailed_helpers=True,
                                     extra_vertex_groups=True, feet_on_ground=True,
                                     scale=0.1, macro_detail_dict=pheno)
basemesh.name = 'Castaway.body'

# Distinctive face (so he does not read as the default MakeHuman face)
FACE_TARGETS = VARIANT.get('face_targets', {
    'head/head-square': 0.25,
    'chin/chin-jutting-incr': 0.25,
    'chin/chin-width-incr': 0.2,
    'nose/nose-scale-vert-incr': 0.15,
    'nose/nose-hump-incr': 0.2,
    'eyebrows/eyebrows-angle-up': 0.2,
    'eyes/r-eye-size-incr': 0.15, 'eyes/l-eye-size-incr': 0.15,
    'cheek/r-cheek-bones-incr': 0.25, 'cheek/l-cheek-bones-incr': 0.25,
    'mouth/mouth-scale-horiz-incr': 0.1,
    'neck/neck-scale-horiz-incr': 0.2,
})
for t, v in FACE_TARGETS.items():
    p = os.path.join(S, 'targets', t + '.target.gz')
    if not os.path.exists(p):
        p = os.path.join(S, 'targets', t + '.target')
    if os.path.exists(p):
        TargetService.load_target(basemesh, p, weight=v)
    else:
        print('WARN missing target', t)

sub = basemesh.modifiers.new('Subdivision', 'SUBSURF'); sub.levels = 0; sub.render_levels = 1

# ---------------------------------------------------------------- rig
rig = HumanService.add_builtin_rig(basemesh, 'default', import_weights=True)
rig.name = 'Castaway.rig'; rig.data.name = 'Castaway.rig'

# ---------------------------------------------------------------- body parts / clothes
def asset(sub, name, ext='.mhclo'):
    p = os.path.join(D, sub, name, name + ext)
    if not os.path.exists(p):
        raise FileNotFoundError(p)
    return p

parts = [
    (os.path.join(D, 'eyes', 'high-poly', 'high-poly.mhclo'), 'Eyes'),
    (asset('eyebrows', VARIANT.get('eyebrows', 'mindfront_eyebrows_03')), 'Eyebrows'),
    (asset('eyelashes', VARIANT.get('eyelashes', 'mindfront_eyelashes_02')), 'Eyelashes'),
    (asset('teeth', 'teeth_base'), 'Teeth'),
    (asset('tongue', 'tongue01'), 'Tongue'),
    (asset('hair', VARIANT.get('hair', 'short02')), 'Hair'),
]
for c in VARIANT.get('clothes', ['elvs_crude_t-shirt_male', 'elvs_male_trouser_short_1']):
    parts.append((asset('clothes', c), 'Clothes'))

for path, kind in parts:
    mt = VARIANT.get('eyes_material_type', 'PROCEDURAL_EYES') if kind == 'Eyes' else 'MAKESKIN'
    o = HumanService.add_mhclo_asset(path, basemesh, asset_type=kind, subdiv_levels=1, material_type=mt)
    print('ADDED', kind, os.path.basename(path), o.name if o else None)

skin = os.path.join(D, 'skins', VARIANT.get('skin', 'young_caucasian_male'), VARIANT.get('skin', 'young_caucasian_male') + '.mhmat')
HumanService.set_character_skin(skin, basemesh, skin_type=VARIANT.get('skin_type', 'ENHANCED_SSS'))

# ---------------------------------------------------------------- wardrobe colour (multiply over the fabric texture)
def tint(obj_sub, rgb, rough=None):
    for o in bpy.data.objects:
        if obj_sub in o.name and o.type == 'MESH':
            for slot in o.material_slots:
                m = slot.material; nt = m.node_tree
                bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
                if bsdf is None: continue
                mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'
                mix.inputs['Factor'].default_value = 1.0; mix.inputs['B'].default_value = (*rgb, 1)
                mix.name = 'WardrobeTint'
                inp = bsdf.inputs['Base Color']
                if inp.links:
                    nt.links.new(inp.links[0].from_socket, mix.inputs['A'])
                else:
                    mix.inputs['A'].default_value = inp.default_value
                nt.links.new(mix.outputs['Result'], inp)
                if rough is not None: bsdf.inputs['Roughness'].default_value = rough
                print('TINT', o.name, m.name)
for sub, col in VARIANT.get('tints', {}).items():
    tint(sub, col)

# ---------------------------------------------------------------- face units (ARKit) for acting
FaceService.load_targets(basemesh, load_microsoft_visemes=False, load_meta_visemes=False, load_arkit_faceunits=True)
FaceService.interpolate_targets(basemesh)

# ---------------------------------------------------------------- organise
col = bpy.data.collections.new('Castaway')
bpy.context.scene.collection.children.link(col)
for o in list(bpy.context.scene.collection.objects):
    bpy.context.scene.collection.objects.unlink(o)
    col.objects.link(o)

keys = [k.name for k in basemesh.data.shape_keys.key_blocks] if basemesh.data.shape_keys else []
print('SHAPEKEYS', len(keys), [k for k in keys if not k.startswith('$')][:80])
print('OBJECTS', [(o.name, o.type, o.parent.name if o.parent else None) for o in col.objects])
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT, compress=True)
print('SAVED', OUT)


# ====================================================================== FINALIZE
# Story-driven condition controls live on the rig as custom properties so every
# shot can keyframe them:  wet, sunburn, fatigue, cold, salt  (all 0..1)
rig = bpy.data.objects['Castaway.rig']
body = bpy.data.objects['Castaway.body']
for p, v in (('wet', 1.0), ('sunburn', 0.0), ('fatigue', 0.0), ('cold', 0.0), ('salt', 0.0)):
    rig[p] = v
    rig.id_properties_ui(p).update(min=0.0, max=1.0, soft_min=0.0, soft_max=1.0)

def drive(id_owner, path, prop, expr='v'):
    fc = id_owner.driver_add(path)
    d = fc.driver; d.type = 'SCRIPTED'; d.expression = expr
    var = d.variables.new(); var.name = 'v'; var.type = 'SINGLE_PROP'
    var.targets[0].id_type = 'OBJECT'; var.targets[0].id = rig; var.targets[0].data_path = '["%s"]' % prop
    return fc

# --- object-space (undeformed) position from Generated coords: pos = gen*size + min
bb = [body.matrix_world.inverted() @ body.matrix_world @ __import__('mathutils').Vector(c) for c in body.bound_box]
bmin = __import__('mathutils').Vector((min(v.x for v in bb), min(v.y for v in bb), min(v.z for v in bb)))
bmax = __import__('mathutils').Vector((max(v.x for v in bb), max(v.y for v in bb), max(v.z for v in bb)))
bsize = bmax - bmin
eyeL = rig.data.bones['eye.L'].head_local; eyeR = rig.data.bones['eye.R'].head_local

g = bpy.data.node_groups['Castaway.body']
N, L = g.nodes, g.links
bsdf = N['Principled BSDF']
gin = N['Group Input']
tc = N['Texture Coordinate']

def vmath(op, a=None, b=None, loc=(0, 0)):
    n = N.new('ShaderNodeVectorMath'); n.operation = op; n.location = loc
    if a is not None:
        (L.new(a, n.inputs[0]) if not isinstance(a, tuple) else setattr(n.inputs[0], 'default_value', a))
    if b is not None:
        (L.new(b, n.inputs[1]) if not isinstance(b, tuple) else setattr(n.inputs[1], 'default_value', b))
    return n
def math(op, a=None, b=None, clamp=False):
    n = N.new('ShaderNodeMath'); n.operation = op; n.use_clamp = clamp
    for i, x in enumerate((a, b)):
        if x is None: continue
        if isinstance(x, (int, float)): n.inputs[i].default_value = x
        else: L.new(x, n.inputs[i])
    return n
def value(name, v=0.0):
    n = N.new('ShaderNodeValue'); n.name = n.label = name; n.outputs[0].default_value = v
    return n

# rest-pose position attribute (basis + body-shape keys, no face units / armature)
import numpy as np
me = body.data
kb = me.shape_keys.key_blocks
nv = len(me.vertices)
basis = np.empty(nv * 3); kb[0].data.foreach_get('co', basis)
co = basis.copy()
for k in kb[1:]:
    if k.value == 0: continue
    a = np.empty(nv * 3); k.data.foreach_get('co', a)
    ref = np.empty(nv * 3); k.relative_key.data.foreach_get('co', ref)
    co += k.value * (a - ref)
if 'rest_pos' in me.attributes: me.attributes.remove(me.attributes['rest_pos'])
at = me.attributes.new('rest_pos', 'FLOAT_VECTOR', 'POINT'); at.data.foreach_set('vector', co)
attr = N.new('ShaderNodeAttribute'); attr.attribute_name = 'rest_pos'; attr.attribute_type = 'GEOMETRY'
P = attr.outputs['Vector']

def blob(center, radius, scale=(1, 1, 1)):
    """Soft spherical mask 1 at center -> 0 at radius (object units, ellipsoid scale)."""
    d = vmath('SUBTRACT', P, tuple(center))
    s = vmath('DIVIDE', d.outputs[0], tuple(scale))
    ln = vmath('LENGTH', s.outputs[0])
    m = math('DIVIDE', ln.outputs['Value'], radius)
    inv = math('SUBTRACT', 1.0, m.outputs[0], clamp=True)
    sm = math('MULTIPLY', inv.outputs[0], inv.outputs[0])
    return sm.outputs[0]

# masks (character faces -Y)
nose = blob((0, -0.19, 1.665), 0.05)
cheeks = math('MAXIMUM', blob((0.045, -0.165, 1.675), 0.045), blob((-0.045, -0.165, 1.675), 0.045))
forehead = blob((0, -0.15, 1.78), 0.07, (1.0, 1.0, 0.6))
face_burn = math('MAXIMUM', math('MAXIMUM', nose, cheeks.outputs[0]).outputs[0], forehead)
underL = blob((0.032, -0.15, 1.699), 0.032, (1.0, 1.0, 0.6))
underR = blob((-0.032, -0.15, 1.699), 0.032, (1.0, 1.0, 0.6))
under = math('MAXIMUM', underL, underR)
lips = blob((0, -0.163, 1.632), 0.036, (1.0, 1.0, 0.5))
# whole head/neck/forearm exposure: everything above the collar plus arms
head_z = math('SUBTRACT', 0.0, 0.0)
sep = N.new('ShaderNodeSeparateXYZ'); L.new(P, sep.inputs[0])
above = math('GREATER_THAN', sep.outputs['Z'], 1.56)
armx = math('GREATER_THAN', math('ABSOLUTE', sep.outputs['X']).outputs[0], 0.33)
exposed = math('MAXIMUM', above.outputs[0], armx.outputs[0])

v_sun = value('sunburn'); v_fat = value('fatigue'); v_cold = value('cold'); v_wet = value('wet')
for nm in ('sunburn', 'fatigue', 'cold', 'wet'):
    drive(g, 'nodes["%s"].outputs[0].default_value' % nm, nm)

# base colour chain
base_link = bsdf.inputs['Base Color'].links[0]
src = base_link.from_socket
def mixcol(a, b_col, fac, blend='MIX'):
    n = N.new('ShaderNodeMix'); n.data_type = 'RGBA'; n.blend_type = blend
    L.new(a, n.inputs['A'])
    if isinstance(b_col, tuple): n.inputs['B'].default_value = b_col
    else: L.new(b_col, n.inputs['B'])
    L.new(fac, n.inputs['Factor'])
    return n.outputs['Result']
# sunburn: overall warm/red on exposed skin + strong on nose/cheeks/forehead
sun_all = math('MULTIPLY', v_sun.outputs[0], math('MULTIPLY', exposed.outputs[0], 0.6).outputs[0])
sun_face = math('MULTIPLY', v_sun.outputs[0], math('MULTIPLY', face_burn.outputs[0], 0.9).outputs[0])
c1 = mixcol(src, (0.95, 0.45, 0.35, 1), sun_all.outputs[0], 'MULTIPLY')
c2 = mixcol(c1, (0.95, 0.3, 0.22, 1), sun_face.outputs[0], 'MULTIPLY')
# fatigue: dark, slightly purple under-eye circles + dull skin
fat_m = math('MULTIPLY', v_fat.outputs[0], math('MINIMUM', math('MULTIPLY', under.outputs[0], 1.6).outputs[0], 1.0).outputs[0])
c3 = mixcol(c2, (0.22, 0.13, 0.2, 1), fat_m.outputs[0], 'MULTIPLY')
# cold: paler, desaturated, bluish lips
cold_all = math('MULTIPLY', v_cold.outputs[0], 0.35)
c4 = mixcol(c3, (0.78, 0.84, 0.95, 1), cold_all.outputs[0], 'MULTIPLY')
cold_lip = math('MULTIPLY', v_cold.outputs[0], lips)
c5 = mixcol(c4, (0.3, 0.34, 0.75, 1), cold_lip.outputs[0], 'MULTIPLY')
# dehydration (fatigue) also dulls/chaps lips
fat_lip = math('MULTIPLY', v_fat.outputs[0], math('MULTIPLY', lips, 0.6).outputs[0])
c6 = mixcol(c5, (0.85, 0.72, 0.68, 1), fat_lip.outputs[0], 'MIX')
L.new(c6, bsdf.inputs['Base Color'])
# wet skin = lower roughness + more coat
r_in = bsdf.inputs['Roughness']
r_src = r_in.links[0].from_socket if r_in.links else None
wet_r = N.new('ShaderNodeMix'); wet_r.data_type = 'FLOAT'
if r_src: L.new(r_src, wet_r.inputs['A'])
else: wet_r.inputs['A'].default_value = r_in.default_value
wet_r.inputs['B'].default_value = 0.22
L.new(v_wet.outputs[0], wet_r.inputs['Factor']); L.new(wet_r.outputs['Result'], r_in)
coat = bsdf.inputs.get('Coat Weight')
if coat is not None:
    cw = math('MULTIPLY', v_wet.outputs[0], 0.35); L.new(cw.outputs[0], coat)
    bsdf.inputs['Coat Roughness'].default_value = 0.12

# --- garments: clean stylised cloth with wetness response
def cloth_mat(name, color, rough, stripe=None):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; n = nt.nodes; l = nt.links
    b = n['Principled BSDF']
    b.inputs['Roughness'].default_value = rough
    b.inputs['Sheen Weight'].default_value = 0.08
    b.inputs['Sheen Tint'].default_value = (*color, 1)
    b.inputs['Sheen Roughness'].default_value = 0.4
    wv = n.new('ShaderNodeValue'); wv.name = 'wet'
    fc = m.node_tree.driver_add('nodes["wet"].outputs[0].default_value')
    d = fc.driver; d.type = 'AVERAGE'; var = d.variables.new(); var.type = 'SINGLE_PROP'
    var.targets[0].id_type = 'OBJECT'; var.targets[0].id = rig; var.targets[0].data_path = '["wet"]'
    sv = n.new('ShaderNodeValue'); sv.name = 'salt'
    fc = m.node_tree.driver_add('nodes["salt"].outputs[0].default_value')
    d = fc.driver; d.type = 'AVERAGE'; var = d.variables.new(); var.type = 'SINGLE_PROP'
    var.targets[0].id_type = 'OBJECT'; var.targets[0].id = rig; var.targets[0].data_path = '["salt"]'
    tcn = n.new('ShaderNodeTexCoord')
    noise = n.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value = 6; noise.inputs['Detail'].default_value = 6
    l.new(tcn.outputs['Object'], noise.inputs['Vector'])
    var_c = n.new('ShaderNodeMix'); var_c.data_type = 'RGBA'; var_c.blend_type = 'MULTIPLY'
    var_c.inputs['A'].default_value = (*color, 1)
    ramp = n.new('ShaderNodeMapRange'); ramp.inputs['To Min'].default_value = 0.85; ramp.inputs['To Max'].default_value = 1.05
    l.new(noise.outputs['Fac'], ramp.inputs['Value'])
    comb = n.new('ShaderNodeCombineColor'); [l.new(ramp.outputs[0], comb.inputs[i]) for i in range(3)]
    l.new(comb.outputs[0], var_c.inputs['B']); var_c.inputs['Factor'].default_value = 1
    # wet darkening
    wet_c = n.new('ShaderNodeMix'); wet_c.data_type = 'RGBA'; wet_c.blend_type = 'MULTIPLY'
    l.new(var_c.outputs['Result'], wet_c.inputs['A']); wet_c.inputs['B'].default_value = (0.55, 0.55, 0.55, 1)
    l.new(wv.outputs[0], wet_c.inputs['Factor'])
    # dried salt crust: blotchy white patches
    sn = n.new('ShaderNodeTexNoise'); sn.inputs['Scale'].default_value = 3.5; sn.inputs['Detail'].default_value = 8; sn.inputs['Roughness'].default_value = 0.7
    l.new(tcn.outputs['Object'], sn.inputs['Vector'])
    sr = n.new('ShaderNodeMapRange'); sr.inputs['From Min'].default_value = 0.55; sr.inputs['From Max'].default_value = 0.75
    l.new(sn.outputs['Fac'], sr.inputs['Value'])
    sm = n.new('ShaderNodeMath'); sm.operation = 'MULTIPLY'; l.new(sr.outputs[0], sm.inputs[0]); l.new(sv.outputs[0], sm.inputs[1])
    salt_c = n.new('ShaderNodeMix'); salt_c.data_type = 'RGBA'
    l.new(wet_c.outputs['Result'], salt_c.inputs['A']); salt_c.inputs['B'].default_value = (0.92, 0.9, 0.84, 1)
    l.new(sm.outputs[0], salt_c.inputs['Factor'])
    l.new(salt_c.outputs['Result'], b.inputs['Base Color'])
    wr = n.new('ShaderNodeMix'); wr.data_type = 'FLOAT'; wr.inputs['A'].default_value = rough; wr.inputs['B'].default_value = 0.38
    l.new(wv.outputs[0], wr.inputs['Factor']); l.new(wr.outputs['Result'], b.inputs['Roughness'])
    # woven cloth bump
    wave = n.new('ShaderNodeTexWave'); wave.inputs['Scale'].default_value = 900; wave.inputs['Distortion'].default_value = 1.5
    l.new(tcn.outputs['Object'], wave.inputs['Vector'])
    bump = n.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.08
    l.new(wave.outputs['Fac'], bump.inputs['Height']); l.new(bump.outputs['Normal'], b.inputs['Normal'])
    return m

shirt_mat = cloth_mat('Castaway.shirt', (0.85, 0.3, 0.012), 0.85)
shorts_mat = cloth_mat('Castaway.shorts', (0.006, 0.014, 0.045), 0.7)
for o in bpy.data.objects:
    if 't-shirt' in o.name:
        o.data.materials.clear(); o.data.materials.append(shirt_mat)
    if 'swim_shorts' in o.name or 'trouser' in o.name:
        o.data.materials.clear(); o.data.materials.append(shorts_mat)

# hair: wet look
for o in bpy.data.objects:
    if o.name.endswith('short04'):
        for s in o.material_slots:
            bs = next((n for n in s.material.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
            if bs:
                bs.inputs['Roughness'].default_value = 0.3
                if bs.inputs.get('Coat Weight') is not None:
                    bs.inputs['Coat Weight'].default_value = 0.3

bpy.ops.wm.save_as_mainfile(filepath=OUT, compress=True)
print('FINALIZED', OUT)
