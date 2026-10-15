# Blender (4.5) headless script: Rocketbox avatar FBX -> GLB skinned to the shared
# Mixamo-named game skeleton (raw geometry + skin; materials are named slots only,
# textures/compression are applied afterwards by finalize_character.mjs).
#
# usage: blender --background --python build_character.py -- \
#          --fbx Male_Adult_08.fbx --out out.glb [--subdiv 1] [--decimate 0.5] \
#          [--joints joints.json] [--conform ref_joints.json]
#
# --joints   : write the source joint positions (meters, Blender Z-up) to json
# --conform  : re-bind the mesh to the reference joint positions (used to put an
#              avatar with different proportions, e.g. a female, on the shared skeleton)
import bpy, sys, json, math
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:]
def arg(name, default=None):
    if name in argv:
        return argv[argv.index(name) + 1]
    return default

FBX = arg('--fbx'); OUT = arg('--out')
SUBDIV = int(arg('--subdiv', '0'))
DECIMATE = float(arg('--decimate', '0'))
DECIMATE_HAIR = float(arg('--decimate-hair', '1'))
MAX_TRIS = int(arg('--max-tris', '0'))
JOINTS_OUT = arg('--joints')
CONFORM = arg('--conform')
SCALE = float(arg('--scale', '1'))
BAKE_SCALE = float(arg('--bake-scale', '1'))  # uniform scale baked into joints + vertices

# Rocketbox (3ds Max Biped) -> Mixamo-style names
FINGERS = ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky']
MAP = {
    'Bip01 Pelvis': 'Hips', 'Bip01 Spine': 'Spine', 'Bip01 Spine1': 'Spine1', 'Bip01 Spine2': 'Spine2',
    'Bip01 Neck': 'Neck', 'Bip01 Head': 'Head',
}
for s, S in (('L', 'Left'), ('R', 'Right')):
    MAP.update({
        f'Bip01 {s} Clavicle': f'{S}Shoulder', f'Bip01 {s} UpperArm': f'{S}Arm',
        f'Bip01 {s} Forearm': f'{S}ForeArm', f'Bip01 {s} Hand': f'{S}Hand',
        f'Bip01 {s} Thigh': f'{S}UpLeg', f'Bip01 {s} Calf': f'{S}Leg',
        f'Bip01 {s} Foot': f'{S}Foot', f'Bip01 {s} Toe0': f'{S}ToeBase',
    })
    for i, F in enumerate(FINGERS):
        MAP[f'Bip01 {s} Finger{i}'] = f'{S}Hand{F}1'
        MAP[f'Bip01 {s} Finger{i}1'] = f'{S}Hand{F}2'
        MAP[f'Bip01 {s} Finger{i}2'] = f'{S}Hand{F}3'

# target hierarchy (child -> parent), Mixamo layout
PARENT = {'Hips': None, 'Spine': 'Hips', 'Spine1': 'Spine', 'Spine2': 'Spine1', 'Neck': 'Spine2',
          'Head': 'Neck', 'HeadTop_End': 'Head'}
for S in ('Left', 'Right'):
    PARENT.update({f'{S}Shoulder': 'Spine2', f'{S}Arm': f'{S}Shoulder', f'{S}ForeArm': f'{S}Arm',
                   f'{S}Hand': f'{S}ForeArm', f'{S}UpLeg': 'Hips', f'{S}Leg': f'{S}UpLeg',
                   f'{S}Foot': f'{S}Leg', f'{S}ToeBase': f'{S}Foot', f'{S}Toe_End': f'{S}ToeBase'})
    for F in FINGERS:
        PARENT[f'{S}Hand{F}1'] = f'{S}Hand'
        PARENT[f'{S}Hand{F}2'] = f'{S}Hand{F}1'
        PARENT[f'{S}Hand{F}3'] = f'{S}Hand{F}2'
ORDER = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'HeadTop_End']
for S in ('Left', 'Right'):
    ORDER += [f'{S}Shoulder', f'{S}Arm', f'{S}ForeArm', f'{S}Hand']
    for F in FINGERS:
        ORDER += [f'{S}Hand{F}1', f'{S}Hand{F}2', f'{S}Hand{F}3']
for S in ('Left', 'Right'):
    ORDER += [f'{S}UpLeg', f'{S}Leg', f'{S}Foot', f'{S}ToeBase', f'{S}Toe_End']

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=FBX, automatic_bone_orientation=False, ignore_leaf_bones=False)
src_arm = [o for o in bpy.data.objects if o.type == 'ARMATURE'][0]
meshes = [o for o in bpy.data.objects if o.type == 'MESH']

# ---- source joint positions (world, meters) ----
SRC = {b.name: (src_arm.matrix_world @ b.head_local) for b in src_arm.data.bones}
J = {}
for sname, tname in MAP.items():
    J[tname] = SRC[sname].copy()
# leaf end joints
# fixed offset so every variant gets an identical skeleton (top of skull, ignoring hair/hats)
J['HeadTop_End'] = Vector((J['Head'].x, J['Head'].y, J['Head'].z + 0.20))
for S in ('Left', 'Right'):
    t = J[f'{S}ToeBase']
    J[f'{S}Toe_End'] = Vector((t.x, t.y - 0.075, t.z))
if JOINTS_OUT:
    json.dump({k: list(v) for k, v in J.items()}, open(JOINTS_OUT, 'w'), indent=1)

# ---- bake meshes to world space and drop the source armature ----
for m in meshes:
    mw = m.matrix_world.copy()
    for mod in list(m.modifiers):
        m.modifiers.remove(mod)
    m.parent = None
    m.matrix_world = mw
bpy.ops.object.select_all(action='DESELECT')
for m in meshes:
    m.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
if len(meshes) > 1:
    bpy.ops.object.join()
mesh = bpy.context.view_layer.objects.active
mesh.name = 'Body'
for o in list(bpy.data.objects):
    if o is not mesh:
        bpy.data.objects.remove(o)

if BAKE_SCALE != 1.0:
    mesh.data.transform(Matrix.Scale(BAKE_SCALE, 4))
    for k in J:
        J[k] = J[k] * BAKE_SCALE

# ---- remap vertex groups (sum weights of merged groups) ----
def target_of(src):
    if src in MAP:
        return MAP[src]
    if src in ('Bip01', 'Bip01 Footsteps'):
        return 'Hips'
    return 'Head'  # face rig, eyes, jaw ...
idx2t = {vg.index: target_of(vg.name) for vg in mesh.vertex_groups}
acc = []
for v in mesh.data.vertices:
    d = {}
    for g in v.groups:
        t = idx2t.get(g.group)
        if t and g.weight > 0:
            d[t] = d.get(t, 0) + g.weight
    acc.append(d)
for vg in list(mesh.vertex_groups):
    mesh.vertex_groups.remove(vg)
groups = {n: mesh.vertex_groups.new(name=n) for n in ORDER}
for i, d in enumerate(acc):
    for t, w in d.items():
        groups[t].add([i], w, 'REPLACE')

# ---- optional conform: deform mesh from its own joints to the reference joints ----
if CONFORM:
    REF = {k: Vector(v) for k, v in json.load(open(CONFORM)).items()}
    # build a temp armature at source joints, pose it to reference joints, apply
    def build_arm(name, JJ):
        ad = bpy.data.armatures.new(name)
        ao = bpy.data.objects.new(name, ad)
        bpy.context.scene.collection.objects.link(ao)
        bpy.context.view_layer.objects.active = ao
        bpy.ops.object.mode_set(mode='EDIT')
        for n in ORDER:
            eb = ad.edit_bones.new(n)
            eb.head = JJ[n]
            kids = [c for c, p in PARENT.items() if p == n]
            prim = {'Hips': 'Spine', 'Spine2': 'Neck', 'LeftHand': 'LeftHandMiddle1', 'RightHand': 'RightHandMiddle1'}.get(n)
            if prim is None and kids:
                prim = kids[0]
            if prim:
                tail = JJ[prim]
            else:
                par = PARENT[n]
                dvec = (JJ[n] - JJ[par]) if par else Vector((0, 0, 0.1))
                tail = JJ[n] + dvec.normalized() * 0.05
            if (tail - eb.head).length < 1e-4:
                tail = eb.head + Vector((0, 0, 0.05))
            eb.tail = tail
        for n in ORDER:
            if PARENT[n]:
                ad.edit_bones[n].parent = ad.edit_bones[PARENT[n]]
        bpy.ops.object.mode_set(mode='OBJECT')
        return ao
    # temp armature at the source joints, posed (via constraints) so every bone's
    # head/tail lands on the reference armature's head/tail; applying it re-shapes the mesh
    tmp = build_arm('TmpConform', J)
    for b in tmp.data.bones:
        b.inherit_scale = 'NONE'
    ref = build_arm('TmpRef', REF)
    bpy.context.view_layer.objects.active = tmp
    bpy.ops.object.mode_set(mode='POSE')
    for n in ORDER:
        pb = tmp.pose.bones[n]
        c = pb.constraints.new('COPY_LOCATION'); c.target = ref; c.subtarget = n
        c3 = pb.constraints.new('STRETCH_TO'); c3.target = ref; c3.subtarget = n; c3.head_tail = 1.0
        c3.volume = 'NO_VOLUME'
    bpy.ops.object.mode_set(mode='OBJECT')
    mod = mesh.modifiers.new('conform', 'ARMATURE'); mod.object = tmp
    bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.modifier_apply(modifier='conform')
    J = REF
    bpy.data.objects.remove(tmp); bpy.data.objects.remove(ref)

# ---- the game skeleton ----
ad = bpy.data.armatures.new('Armature')
arm = bpy.data.objects.new('Armature', ad)
bpy.context.scene.collection.objects.link(arm)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='EDIT')
for n in ORDER:
    eb = ad.edit_bones.new(n)
    eb.head = J[n]
    kids = [c for c, p in PARENT.items() if p == n]
    prim = {'Hips': 'Spine', 'Spine2': 'Neck', 'LeftHand': 'LeftHandMiddle1', 'RightHand': 'RightHandMiddle1'}.get(n)
    if prim is None and kids:
        prim = kids[0]
    if prim:
        tail = J[prim]
    else:
        par = PARENT[n]
        dvec = (J[n] - J[par]) if par else Vector((0, 0, 0.1))
        tail = J[n] + dvec.normalized() * 0.05
    if (tail - eb.head).length < 1e-4:
        tail = eb.head + Vector((0, 0, 0.05))
    eb.tail = tail
    eb.use_deform = True
for n in ORDER:
    if PARENT[n]:
        ad.edit_bones[n].parent = ad.edit_bones[PARENT[n]]
bpy.ops.object.mode_set(mode='OBJECT')

mesh.parent = arm
mod = mesh.modifiers.new('Armature', 'ARMATURE'); mod.object = arm

# ---- materials: rename slots to generic names ----
for slot in mesh.material_slots:
    m = slot.material
    if not m:
        continue
    base = m.name.split('.')[0]
    key = base.split('_', 1)[1] if '_' in base else base
    key = {'opacity': 'hair'}.get(key, key)
    nm = bpy.data.materials.new(key)
    nm.use_nodes = True
    slot.material = nm

# ---- LOD processing ----
bpy.context.view_layer.objects.active = mesh
mesh.select_set(True)
if SUBDIV > 0:
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.tris_convert_to_quads(face_threshold=math.radians(40), shape_threshold=math.radians(40), uvs=True, materials=True, seam=True, sharp=True)
    bpy.ops.object.mode_set(mode='OBJECT')
    # Catmull-Clark smooths silhouettes but shrinks thin parts (fingers) and curls the
    # alpha hair cards; a SIMPLE subdivision of the same topology keeps the original shape.
    # Blend per vertex: hands/fingers/hair use the simple positions, everything else smooth.
    simple = mesh.copy(); simple.data = mesh.data.copy()
    bpy.context.scene.collection.objects.link(simple)
    def subsurf(ob, kind):
        bpy.ops.object.select_all(action='DESELECT')
        bpy.context.view_layer.objects.active = ob; ob.select_set(True)
        for md in list(ob.modifiers):
            if md.type == 'ARMATURE':
                ob.modifiers.remove(md)
        sub = ob.modifiers.new('subdiv', 'SUBSURF')
        sub.subdivision_type = kind
        sub.levels = SUBDIV; sub.render_levels = SUBDIV
        sub.uv_smooth = 'PRESERVE_BOUNDARIES'
        sub.boundary_smooth = 'PRESERVE_CORNERS'
        sub.use_limit_surface = True
        bpy.ops.object.modifier_apply(modifier='subdiv')
    subsurf(mesh, 'CATMULL_CLARK')
    subsurf(simple, 'SIMPLE')
    assert len(simple.data.vertices) == len(mesh.data.vertices)
    keep_groups = {g.index for g in mesh.vertex_groups if 'Hand' in g.name}
    hair_idx = {i for i, s in enumerate(mesh.material_slots) if s.material and s.material.name.startswith('hair')}
    hairv = set()
    for p in mesh.data.polygons:
        if p.material_index in hair_idx:
            hairv.update(p.vertices)
    for v, vs in zip(mesh.data.vertices, simple.data.vertices):
        w = 1.0 if v.index in hairv else min(1.0, sum(g.weight for g in v.groups if g.group in keep_groups) * 1.5)
        if w > 0:
            v.co = v.co.lerp(vs.co, w)
    bpy.data.objects.remove(simple)
    mod = mesh.modifiers.new('Armature', 'ARMATURE'); mod.object = arm
    bpy.context.view_layer.objects.active = mesh; mesh.select_set(True)
if MAX_TRIS > 0:
    hair_idx0 = {i for i, sl in enumerate(mesh.material_slots) if sl.material and sl.material.name.startswith('hair')}
    tot = sum(len(p.vertices) - 2 for p in mesh.data.polygons)
    hair_t = sum(len(p.vertices) - 2 for p in mesh.data.polygons if p.material_index in hair_idx0)
    if tot > MAX_TRIS:
        DECIMATE = max(0.1, (MAX_TRIS - hair_t) / max(1, tot - hair_t))
        print('MAX_TRIS decimate ratio', DECIMATE)
if DECIMATE > 0:
    # decimate everything except the hair cards (alpha-tested strips break when collapsed)
    hair_idx = [i for i, s in enumerate(mesh.material_slots) if s.material and s.material.name.startswith('hair')]
    vg = mesh.vertex_groups.new(name='_dec')
    keep = set()
    for p in mesh.data.polygons:
        if p.material_index in hair_idx:
            keep.update(p.vertices)
    vg.add([v.index for v in mesh.data.vertices if v.index not in keep], 1.0, 'REPLACE')
    dec = mesh.modifiers.new('dec', 'DECIMATE')
    dec.decimate_type = 'COLLAPSE'; dec.ratio = DECIMATE
    dec.vertex_group = '_dec'; dec.vertex_group_factor = 1.0
    dec.use_collapse_triangulate = True
    bpy.ops.object.modifier_move_to_index(modifier='dec', index=0)
    bpy.ops.object.modifier_apply(modifier='dec')
    mesh.vertex_groups.remove(mesh.vertex_groups['_dec'])

# give unweighted vertices the weights of their nearest weighted neighbour
# (otherwise the glTF exporter adds a 'neutral_bone' joint and the skeleton differs)
from mathutils import kdtree
weighted = [v for v in mesh.data.vertices if any(g.weight > 0 for g in v.groups)]
unweighted = [v for v in mesh.data.vertices if not any(g.weight > 0 for g in v.groups)]
if unweighted:
    kd = kdtree.KDTree(len(weighted))
    for i, v in enumerate(weighted):
        kd.insert(v.co, i)
    kd.balance()
    for v in unweighted:
        co, i, dist = kd.find(v.co)
        for g in weighted[i].groups:
            if g.weight > 0:
                mesh.vertex_groups[g.group].add([v.index], g.weight, 'REPLACE')
    print('fixed unweighted verts', len(unweighted))
# clean weights: max 4 influences, normalized
bpy.ops.object.mode_set(mode='OBJECT')
bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL', limit=4)
bpy.ops.object.vertex_group_normalize_all(group_select_mode='ALL', lock_active=False)

if SCALE != 1.0:
    arm.scale = (SCALE, SCALE, SCALE)

tris = sum(len(p.vertices) - 2 for p in mesh.data.polygons)
print('TRIS', tris)

bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_skins=True, export_animations=False,
                          export_morph=False, export_yup=True, export_materials='EXPORT',
                          export_image_format='NONE', export_def_bones=False, export_apply=False)
print('WROTE', OUT)
