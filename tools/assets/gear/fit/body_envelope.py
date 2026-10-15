"""
Sample the body envelope of character GLBs (rest pose) for fitting wearable gear.
  blender -b -P tools/assets/gear/fit/body_envelope.py -- <out.json> <char1.glb> [char2.glb ...]
Writes, per character and as the max over all given characters, in glTF coordinates (x = character left, y = up, z = forward):
  torso[y_cm][theta_deg]  radial distance (m) from the vertical axis through (0, zc) for y in 0.90..1.62 m,
                          theta = atan2(x, z) in degrees (0 = front, 90 = left, 180 = back, 270 = right)
  top[x_cm][z_cm+20]      surface height (m) seen from above (x, z in cm, -30..30 / -20..20); 0.82 = no hit
  front[x_cm][y_cm-90]    frontmost surface z (m) seen from the front (-0.5 = no hit)
  back[x_cm][y_cm-90]     rearmost surface z (m) seen from behind (0.5 = no hit)
  head[elev][azim]        distance (m) from the head centre (0, 1.687, 0.008) along spherical directions
  zc                      the torso axis z used for the torso samples
Input GLBs must be plain (decode meshopt first: gltf_util.mjs plain).
"""
import bpy, sys, json, math
import numpy as np

argv = sys.argv[sys.argv.index('--') + 1:]
out = argv[0]; files = argv[1:]
ZC = -0.01
HC = np.array([0.0, 1.687, 0.008])
res = {'zc': ZC, 'head_center': HC.tolist(), 'chars': {}}


def bvh_of(path):
    from mathutils.bvhtree import BVHTree
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    dg = bpy.context.evaluated_depsgraph_get()
    V = []; F = []
    for ob in bpy.context.scene.objects:
        if ob.type != 'MESH': continue
        ev = ob.evaluated_get(dg); me = ev.to_mesh()
        M = ob.matrix_world
        base = len(V)
        for v in me.vertices:
            w = M @ v.co
            V.append((w.x, w.z, -w.y))          # blender -> glTF
        me.calc_loop_triangles()
        for t in me.loop_triangles:
            F.append(tuple(base + i for i in t.vertices))
        ev.to_mesh_clear()
    return BVHTree.FromPolygons(V, F, all_triangles=True), V


def layered_hit(bvh, origin, d, maxd, layer_gap):
    """distance of the outermost surface of the first layer stack hit from `origin` along `d`."""
    from mathutils import Vector
    o = Vector(origin); d = Vector(d).normalized()
    hits = []; t = 0.0
    for _ in range(12):
        loc, nrm, idx, dist = bvh.ray_cast(o + d * t, d, maxd - t)
        if loc is None: break
        t = t + dist + 1e-4
        hits.append(t)
    if not hits: return 0.0
    out = hits[0]
    for h in hits[1:]:
        if h - out < layer_gap: out = h
        else: break
    return out


for f in files:
    name = f.split('/')[-1].replace('.glb', '')
    bvh, V = bvh_of(f)
    torso = {}
    for ycm in range(90, 163):
        y = ycm / 100.0
        row = []
        for th in range(0, 360, 5):
            a = math.radians(th)
            row.append(round(layered_hit(bvh, (0, y, ZC), (math.sin(a), 0, math.cos(a)), 0.45, 0.035), 4))
        torso[ycm] = row
    head = {}
    for e in range(-60, 91, 5):
        row = []
        for az in range(0, 360, 10):
            ce, se = math.cos(math.radians(e)), math.sin(math.radians(e))
            dv = (ce * math.sin(math.radians(az)), se, ce * math.cos(math.radians(az)))
            row.append(round(layered_hit(bvh, tuple(HC), dv, 0.3, 0.02), 4))
        head[e] = row
    # height fields: top(x, z) (ray down from y = 1.62), front(x, y) (ray -z from z = +0.5), back(x, y) (ray +z from z = -0.5)
    top = {}; front = {}; back = {}
    for xi in range(-30, 31):
        x = xi / 100.0
        top[xi] = [round(1.62 - layered_hit(bvh, (x, 1.62, z / 100.0), (0, -1, 0), 0.8, 0.03), 4) for z in range(-20, 21)]
        front[xi] = [round(0.5 - layered_hit(bvh, (x, y / 100.0, 0.5), (0, 0, -1), 1.0, 0.03), 4) for y in range(90, 163)]
        back[xi] = [round(-0.5 + layered_hit(bvh, (x, y / 100.0, -0.5), (0, 0, 1), 1.0, 0.03), 4) for y in range(90, 163)]
    ys = [v[1] for v in V]
    res['chars'][name] = {'torso': torso, 'head': head, 'top': top, 'front': front, 'back': back, 'height': max(ys)}
    print('ENV', name, 'height', round(max(ys), 3))

# max envelope over characters
names = list(res['chars'])
res['max'] = {
    'top': {k: [max(res['chars'][n]['top'][k][i] for n in names) for i in range(41)] for k in res['chars'][names[0]]['top']},
    'front': {k: [max(res['chars'][n]['front'][k][i] for n in names) for i in range(73)] for k in res['chars'][names[0]]['front']},
    'back': {k: [min(res['chars'][n]['back'][k][i] for n in names) for i in range(73)] for k in res['chars'][names[0]]['back']},
    'torso': {k: [max(res['chars'][n]['torso'][k][i] for n in names) for i in range(72)] for k in res['chars'][names[0]]['torso']},
    'head': {k: [max(res['chars'][n]['head'][k][i] for n in names) for i in range(36)] for k in res['chars'][names[0]]['head']},
}
json.dump(res, open(out, 'w'))
print('WROTE', out)
