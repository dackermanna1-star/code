"""
Re-target a downloaded (Poly Haven) glTF prop to the project conventions.
  blender -b -P tools/assets/gear/ph_prop.py -- <in.gltf|glb> <out.glb> [options]
Options:
  --rot X,Y,Z        Euler rotation in degrees applied in glTF space (XYZ order) after --pivot is moved to the origin
  --pivot X,Y,Z      point (source glTF coords, metres) that becomes the origin; 'bottom' = centre of the bounding box base
  --scale S          uniform scale
  --tex N            max texture size (default 1024)
  --decimate R       collapse-decimate ratio for meshes (default 1 = keep)
  --name NAME        root node name
  --join NAME        join all meshes into one mesh node NAME (default 'body'); --keep keeps separate nodes
  --rename a=b,...   rename mesh nodes (with --keep)
  --empty name:X,Y,Z add an empty (OUTPUT glTF coords, metres, relative to the new origin); repeatable
  --bottom           after rotating, move the model so its lowest point is at y = 0 (keeps x/z)
Writes <out.glb> and <out>.meta.json (tris, bounds, nodes).
"""
import bpy, sys, math, json, os
from mathutils import Vector, Matrix, Euler

argv = sys.argv[sys.argv.index('--') + 1:]
src, out = argv[0], argv[1]
def opt(n, d=None):
    return argv[argv.index('--' + n) + 1] if '--' + n in argv else d
def vec(s):
    return Vector([float(x) for x in s.split(',')])

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
scene = bpy.context.scene
meshes = [o for o in scene.objects if o.type == 'MESH']

# glTF -> blender: (x, y, z)_g = (x_b, z_b, -y_b)
def g2b(v): return Vector((v.x, -v.z, v.y))
def b2g(v): return Vector((v.x, v.z, -v.y))

# bake world transforms into mesh data, unparent everything
for o in meshes:
    mw = o.matrix_world.copy()
    o.parent = None
    o.data.transform(mw)
    o.matrix_world = Matrix.Identity(4)
for o in list(scene.objects):
    if o.type != 'MESH':
        bpy.data.objects.remove(o)

def bounds():
    mn = Vector((1e9,) * 3); mx = Vector((-1e9,) * 3)
    for o in meshes:
        for v in o.data.vertices:
            g = b2g(v.co)
            mn = Vector(map(min, mn, g)); mx = Vector(map(max, mx, g))
    return mn, mx

piv = opt('pivot')
if piv:
    if piv == 'bottom':
        mn, mx = bounds(); p = Vector(((mn.x + mx.x) / 2, mn.y, (mn.z + mx.z) / 2))
    else:
        p = vec(piv)
    for o in meshes: o.data.transform(Matrix.Translation(-g2b(p)))
sc = float(opt('scale', '1'))
rot = opt('rot')
R = Matrix.Identity(4)
if rot:
    e = vec(rot)
    Rg = Euler((math.radians(e.x), math.radians(e.y), math.radians(e.z)), 'XYZ').to_matrix().to_4x4()
    # conjugate into blender space
    C = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))   # g -> b
    R = C @ Rg @ C.inverted()
for o in meshes:
    o.data.transform(R @ Matrix.Scale(sc, 4))
if '--bottom' in argv:
    mn, mx = bounds()
    for o in meshes: o.data.transform(Matrix.Translation(g2b(Vector((0, -mn.y, 0)))))

# decimate
ratio = float(opt('decimate', '1'))
if ratio < 0.999:
    for o in meshes:
        m = o.modifiers.new('dec', 'DECIMATE'); m.ratio = ratio; m.use_collapse_triangulate = True
        bpy.context.view_layer.objects.active = o
        with bpy.context.temp_override(object=o, active_object=o):
            bpy.ops.object.modifier_apply(modifier='dec')

# textures
tex = int(opt('tex', '1024'))
for im in bpy.data.images:
    if im.size[0] > tex or im.size[1] > tex:
        k = tex / max(im.size[0], im.size[1])
        im.scale(max(1, int(im.size[0] * k)), max(1, int(im.size[1] * k)))
        im.pack()

name = opt('name', 'prop')
root = bpy.data.objects.new(name, None)
scene.collection.objects.link(root)
if '--keep' in argv:
    ren = dict(kv.split('=') for kv in opt('rename', '').split(',') if '=' in kv)
    for o in meshes:
        nm = ren.get(o.name, o.name)
        o.name = nm; o.data.name = nm
        o.parent = root
else:
    jn = opt('join', 'body')
    if len(meshes) > 1:
        with bpy.context.temp_override(active_object=meshes[0], selected_objects=meshes, selected_editable_objects=meshes, object=meshes[0]):
            bpy.ops.object.join()
    meshes = [meshes[0]]
    meshes[0].name = jn; meshes[0].data.name = jn
    meshes[0].parent = root
i = 0
while '--empty' in argv[i:]:
    i = argv.index('--empty', i) + 1
    nm, xyz = argv[i].split(':')
    e = bpy.data.objects.new(nm, None); scene.collection.objects.link(e)
    e.location = g2b(vec(xyz)); e.parent = root

tris = 0
for o in meshes:
    o.data.calc_loop_triangles(); tris += len(o.data.loop_triangles)
mn, mx = bounds()
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_apply=True, export_yup=True, export_image_format='JPEG',
                          export_jpeg_quality=88, export_cameras=False, export_lights=False, export_animations=False,
                          export_extras=False, export_draco_mesh_compression_enable=False)
meta = dict(tris=tris, bounds_min=[round(x, 4) for x in mn], bounds_max=[round(x, 4) for x in mx],
            size_m=[round(b - a, 4) for a, b in zip(mn, mx)], nodes=[name] + [o.name for o in meshes] +
            [o.name for o in scene.objects if o.type == 'EMPTY' and o != root])
json.dump(meta, open(os.path.splitext(out)[0] + '.meta.json', 'w'), indent=1)
print('DONE', json.dumps(meta))
