"""Build a library of tropical understory plants from CC0 ambientCG leaf scans -> blend/plants_lib.blend

Each plant is hand-structured (petioles, rachis, droop, cupping, midrib fold) rather than flat cards so the
silhouettes read as real philodendron / understory palm / heliconia / shrub masses. Leaf cards use the scanned
colour, opacity, normal and roughness maps; translucency gives the backlit glow typical of rainforest leaves.
"""
import bpy, bmesh, json, math, random
from mathutils import Vector, Matrix, Euler, Quaternion

R = '/home/user/code/amazon_short/'
ACG = R + 'assets/acg/'
BOX = json.load(open(ACG + 'leaf_boxes.json'))
bpy.ops.wm.read_factory_settings(use_empty=True)
scn = bpy.context.scene


def S(coll, name, typ='RGBA'):
    for x in coll:
        if x.name == name and x.type == typ: return x


# ------------------------------------------------------------------ materials
def leaf_material(sid, hue_var=0.04, translucency=0.35, rough_mul=1.0, dry=False):
    name = f'MAT_Leaf_{sid}'
    if name in bpy.data.materials: return bpy.data.materials[name]
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear(); L = nt.links.new
    p = f'{ACG}{sid}/{sid}_2K-PNG_'
    def T(suffix, nc, loc):
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(p + suffix + '.png', check_existing=True)
        if nc: t.image.colorspace_settings.name = 'Non-Color'
        t.location = loc; return t
    col = T('Color', False, (-900, 300)); op = T('Opacity', True, (-900, 0)); nm = T('NormalGL', True, (-900, -300)); rg = T('Roughness', True, (-900, -600))
    oi = nt.nodes.new('ShaderNodeObjectInfo'); oi.location = (-1100, 500)
    hsv = nt.nodes.new('ShaderNodeHueSaturation'); hsv.location = (-600, 300)
    mr = nt.nodes.new('ShaderNodeMapRange'); mr.location = (-800, 500); mr.inputs[3].default_value = 0.5 - hue_var; mr.inputs[4].default_value = 0.5 + hue_var
    L(oi.outputs['Random'], mr.inputs[0]); L(mr.outputs[0], hsv.inputs['Hue'])
    mv = nt.nodes.new('ShaderNodeMapRange'); mv.location = (-800, 700); mv.inputs[3].default_value = 0.45 if dry else 0.75; mv.inputs[4].default_value = 0.8 if dry else 1.1
    L(oi.outputs['Random'], mv.inputs[0]); L(mv.outputs[0], hsv.inputs['Value'])
    hsv.inputs['Saturation'].default_value = 0.5 if dry else 1.08
    L(col.outputs[0], hsv.inputs['Color'])
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled'); bsdf.location = (-200, 200)
    L(hsv.outputs[0], bsdf.inputs['Base Color'])
    n = nt.nodes.new('ShaderNodeNormalMap'); n.location = (-500, -300); L(nm.outputs[0], n.inputs[1]); L(n.outputs[0], bsdf.inputs['Normal'])
    rm = nt.nodes.new('ShaderNodeMath'); rm.operation = 'MULTIPLY'; rm.inputs[1].default_value = rough_mul; rm.location = (-500, -600)
    L(rg.outputs[0], rm.inputs[0]); L(rm.outputs[0], bsdf.inputs['Roughness'])
    bsdf.inputs['Specular IOR Level'].default_value = 0.45
    tr = nt.nodes.new('ShaderNodeBsdfTranslucent'); tr.location = (-200, -200)
    tm = nt.nodes.new('ShaderNodeMix'); tm.data_type = 'RGBA'; tm.blend_type = 'MULTIPLY'; tm.inputs[0].default_value = 1.0; tm.location = (-400, 0)
    L(hsv.outputs[0], S(tm.inputs, 'A')); S(tm.inputs, 'B').default_value = (0.75, 0.95, 0.35, 1)
    L(S(tm.outputs, 'Result'), tr.inputs['Color']); L(n.outputs[0], tr.inputs['Normal'])
    mix = nt.nodes.new('ShaderNodeMixShader'); mix.location = (100, 100); mix.inputs[0].default_value = 0.0 if dry else translucency
    L(bsdf.outputs[0], mix.inputs[1]); L(tr.outputs[0], mix.inputs[2])
    tp = nt.nodes.new('ShaderNodeBsdfTransparent'); tp.location = (100, -150)
    # hard alpha (clip) => far fewer noisy transparent bounces than soft alpha
    gt = nt.nodes.new('ShaderNodeMath'); gt.operation = 'GREATER_THAN'; gt.inputs[1].default_value = 0.5; gt.location = (-500, 0)
    L(op.outputs[0], gt.inputs[0])
    am = nt.nodes.new('ShaderNodeMixShader'); am.location = (350, 0)
    L(gt.outputs[0], am.inputs[0]); L(tp.outputs[0], am.inputs[1]); L(mix.outputs[0], am.inputs[2])
    out = nt.nodes.new('ShaderNodeOutputMaterial'); out.location = (600, 0); L(am.outputs[0], out.inputs[0])
    m.blend_method = 'HASHED' if hasattr(m, 'blend_method') else None
    try: m.surface_render_method = 'DITHERED'
    except Exception: pass
    return m


def stem_material():
    if 'MAT_Stem' in bpy.data.materials: return bpy.data.materials['MAT_Stem']
    m = bpy.data.materials.new('MAT_Stem'); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']; b.inputs['Base Color'].default_value = (0.10, 0.16, 0.035, 1); b.inputs['Roughness'].default_value = 0.6
    return m


# ------------------------------------------------------------------ leaf geometry
def leaf_mesh(name, sid, idx, length, nx=5, ny=12, droop=0.35, cup=0.12, fold=0.06, twist=0.0, petiole_at='bottom'):
    """A curved leaf card whose UVs cover one leaf of the atlas. Leaf base at origin, grows along +Y."""
    b = BOX[sid][idx % len(BOX[sid])]
    aspect = (b['w'] / b['h']) if petiole_at == 'bottom' else (b['h'] / b['w'])
    width = length * aspect
    me = bpy.data.meshes.new(name); bm = bmesh.new(); uvl = bm.loops.layers.uv.new('UVMap')
    verts = []
    for j in range(ny + 1):
        t = j / ny; row = []
        # droop: the leaf arcs downward along its length (quadratic), cup: edges lift, fold: V crease at midrib
        y = t * length * (1 - 0.18 * droop * t)
        z = -droop * length * t * t
        for i in range(nx + 1):
            s = i / nx - 0.5
            x = s * width
            zz = z + cup * width * (s * 2) ** 2 - fold * width * abs(s * 2) * 0 + fold * width * (1 - abs(s * 2)) * 0.5
            # twist along length
            ang = twist * t
            xr = x * math.cos(ang); zr = zz + x * math.sin(ang)
            row.append(bm.verts.new((xr, y, zr)))
        verts.append(row)
    for j in range(ny):
        for i in range(nx):
            f = bm.faces.new((verts[j][i], verts[j][i + 1], verts[j + 1][i + 1], verts[j + 1][i]))
            for k, l in enumerate(f.loops):
                ii, jj = [(i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1)][k]
                s, t = ii / nx, jj / ny
                if petiole_at == 'bottom':
                    u = b['u0'] + s * (b['u1'] - b['u0']); v = b['v0'] + t * (b['v1'] - b['v0'])
                else:  # horizontal atlas leaf: base on the left
                    u = b['u0'] + t * (b['u1'] - b['u0']); v = b['v0'] + s * (b['v1'] - b['v0'])
                l[uvl].uv = (u, v)
    bm.normal_update(); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = True
    me.materials.append(leaf_material(sid))
    return me


def tube(name, pts, r0, r1, mat, res=6):
    cu = bpy.data.curves.new(name, 'CURVE'); cu.dimensions = '3D'
    sp = cu.splines.new('BEZIER'); sp.bezier_points.add(len(pts) - 1)
    for i, p in enumerate(pts):
        bp = sp.bezier_points[i]; bp.co = p; bp.handle_left_type = bp.handle_right_type = 'AUTO'
        bp.radius = r0 + (r1 - r0) * i / max(1, len(pts) - 1)
    cu.bevel_mode = 'ROUND'; cu.bevel_depth = 1.0; cu.bevel_resolution = 1; cu.resolution_u = res
    cu.materials.append(mat)
    o = bpy.data.objects.new(name, cu)
    return o


def to_mesh_join(objs, name):
    """Convert curves to mesh and join everything into one object (one draw / one BVH instance)."""
    coll = bpy.context.scene.collection
    for o in objs:
        if o.name not in coll.objects: coll.objects.link(o)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    curves = [o for o in objs if o.type == 'CURVE']
    if curves:
        for o in objs: o.select_set(o.type == 'CURVE')
        bpy.context.view_layer.objects.active = curves[0]
        bpy.ops.object.convert(target='MESH')
    for o in objs: o.select_set(True)
    leafy = [o for o in objs if o.type == 'MESH' and o.data.uv_layers and o.data.uv_layers[0].name == 'UVMap' and o.data.materials and o.data.materials[0].name.startswith('MAT_Leaf')]
    bpy.context.view_layer.objects.active = leafy[0] if leafy else objs[0]
    bpy.ops.object.join()
    j = bpy.context.active_object; j.name = name
    return j


def place_leaf(me, origin, direction, roll=0.0):
    """Leaf object whose base is at origin, pointing along direction (leaf +Y -> direction)."""
    o = bpy.data.objects.new(me.name + '_o', me)
    d = Vector(direction).normalized()
    q = d.to_track_quat('Y', 'Z')
    o.matrix_world = Matrix.Translation(origin) @ q.to_matrix().to_4x4() @ Matrix.Rotation(roll, 4, 'Y')
    bpy.context.scene.collection.objects.link(o)
    bpy.context.view_layer.update()
    # bake transform so join keeps it
    o.data = o.data.copy(); o.data.transform(o.matrix_world); o.matrix_world = Matrix.Identity(4)
    return o


# ------------------------------------------------------------------ plant types
lib = bpy.data.collections.new('PLANTS'); scn.collection.children.link(lib)
stem = stem_material()


def finish(obj, cname):
    c = bpy.data.collections.new(cname); lib.children.link(c)
    for cc in obj.users_collection: cc.objects.unlink(obj)
    c.objects.link(obj)
    obj.location = (0, 0, 0)
    return c


def philodendron(seed, n_leaves=7, size=0.7, height=0.9):
    rnd = random.Random(seed); parts = []
    for k in range(n_leaves):
        a = k / n_leaves * math.tau + rnd.uniform(-0.3, 0.3)
        h = height * rnd.uniform(0.6, 1.1)
        reach = rnd.uniform(0.15, 0.45)
        tip = Vector((math.cos(a) * reach, math.sin(a) * reach, h))
        mid = Vector((math.cos(a) * reach * 0.4, math.sin(a) * reach * 0.4, h * 0.65))
        parts.append(tube(f'pet{k}', [Vector((0, 0, 0)), mid, tip], 0.014, 0.008, stem))
        L = size * rnd.uniform(0.7, 1.15)
        me = leaf_mesh(f'phil{seed}_{k}', 'LeafSet004', rnd.randint(0, 5), L, droop=rnd.uniform(0.25, 0.5), cup=0.10)
        d = Vector((math.cos(a), math.sin(a), rnd.uniform(-0.1, 0.35)))
        parts.append(place_leaf(me, tip, d, roll=rnd.uniform(-0.25, 0.25)))
    return to_mesh_join(parts, f'PL_Philodendron_{seed}')


def palm(seed, n_fronds=8, frond_len=1.8, trunk_h=0.6):
    rnd = random.Random(seed); parts = []
    parts.append(tube('trunk', [Vector((0, 0, 0)), Vector((0.02, 0, trunk_h * 0.5)), Vector((0, 0.02, trunk_h))], 0.05, 0.04, stem))
    top = Vector((0, 0.02, trunk_h))
    for k in range(n_fronds):
        a = k / n_fronds * math.tau + rnd.uniform(-0.25, 0.25)
        el = rnd.uniform(0.35, 1.05)  # elevation
        Lf = frond_len * rnd.uniform(0.75, 1.1)
        dirv = Vector((math.cos(a) * math.cos(el), math.sin(a) * math.cos(el), math.sin(el)))
        pts = []
        for i in range(5):
            t = i / 4
            p = top + dirv * Lf * t + Vector((0, 0, -0.55 * Lf * t * t))
            pts.append(p)
        parts.append(tube(f'rachis{k}', pts, 0.012, 0.003, stem))
        nl = 14
        for i in range(2, nl):
            t = i / nl
            p = top + dirv * Lf * t + Vector((0, 0, -0.55 * Lf * t * t))
            tangent = (dirv * Lf + Vector((0, 0, -1.1 * Lf * t))).normalized()
            side = tangent.cross(Vector((0, 0, 1))).normalized()
            for sgn in (-1, 1):
                ll = Lf * 0.32 * math.sin(math.pi * (0.15 + 0.85 * t)) + 0.05
                d = (side * sgn * 0.85 + tangent * 0.55 + Vector((0, 0, -0.15))).normalized()
                me = leaf_mesh(f'pl{seed}_{k}_{i}_{sgn}', 'LeafSet013', rnd.randint(0, 5), ll, nx=2, ny=6, droop=0.3, cup=0.0)
                parts.append(place_leaf(me, p, d, roll=sgn * 0.5))
    return to_mesh_join(parts, f'PL_Palm_{seed}')


def heliconia(seed, n_stems=4, h=1.6, leaf_len=1.1):
    rnd = random.Random(seed); parts = []
    for s in range(n_stems):
        base = Vector((rnd.uniform(-0.2, 0.2), rnd.uniform(-0.2, 0.2), 0))
        hh = h * rnd.uniform(0.6, 1.1)
        lean = Vector((rnd.uniform(-0.25, 0.25), rnd.uniform(-0.25, 0.25), 0))
        top = base + Vector((0, 0, hh)) + lean
        parts.append(tube(f'st{s}', [base, base + Vector((0, 0, hh * 0.5)) + lean * 0.3, top], 0.022, 0.012, stem))
        a = rnd.uniform(0, math.tau)
        d = Vector((math.cos(a), math.sin(a), rnd.uniform(0.3, 0.9)))
        me = leaf_mesh(f'hel{seed}_{s}', rnd.choice(['LeafSet018', 'LeafSet005']), rnd.randint(0, 2), leaf_len * rnd.uniform(0.8, 1.2), nx=4, ny=14, droop=0.45, cup=0.06, twist=rnd.uniform(-0.4, 0.4))
        parts.append(place_leaf(me, top, d, roll=rnd.uniform(-0.3, 0.3)))
    return to_mesh_join(parts, f'PL_Heliconia_{seed}')


def shrub(seed, n_twigs=10, h=1.0, sid='LeafSet022'):
    rnd = random.Random(seed); parts = []
    for t in range(n_twigs):
        a = rnd.uniform(0, math.tau); el = rnd.uniform(0.6, 1.3)
        ln = h * rnd.uniform(0.6, 1.1)
        d = Vector((math.cos(a) * math.cos(el), math.sin(a) * math.cos(el), math.sin(el)))
        pts = [Vector((0, 0, 0)), d * ln * 0.5, d * ln + Vector((0, 0, -0.1 * ln))]
        parts.append(tube(f'tw{t}', pts, 0.01, 0.004, stem))
        for i in range(10):
            tt = 0.25 + 0.75 * i / 9
            p = d * ln * tt + Vector((0, 0, -0.1 * ln * tt * tt))
            ld = (d + Vector((rnd.uniform(-0.8, 0.8), rnd.uniform(-0.8, 0.8), rnd.uniform(-0.3, 0.4)))).normalized()
            me = leaf_mesh(f'sh{seed}_{t}_{i}', sid, rnd.randint(0, 5), rnd.uniform(0.16, 0.28), nx=2, ny=4, droop=0.2, cup=0.1)
            parts.append(place_leaf(me, p, ld, roll=rnd.uniform(-1, 1)))
    return to_mesh_join(parts, f'PL_Shrub_{seed}')


def litter(seed, sid):
    rnd = random.Random(seed)
    horiz = sid in ('LeafSet008', 'LeafSet012', 'LeafSet026')
    me = leaf_mesh(f'LT_{sid}_{seed}', sid, seed, rnd.uniform(0.07, 0.14), nx=2, ny=3, droop=-0.15, cup=0.15, twist=rnd.uniform(-0.6, 0.6),
                   petiole_at='left' if horiz else 'bottom')
    me.materials.clear(); me.materials.append(leaf_material(sid, hue_var=0.02, translucency=0.0, dry=True))
    o = bpy.data.objects.new(me.name, me); scn.collection.objects.link(o)
    return o


for i in range(3): finish(philodendron(10 + i, n_leaves=9 + 2 * i, size=0.75 + 0.25 * i, height=0.8 + 0.3 * i), f'PL_Philodendron_{i}')
for i in range(3): finish(palm(20 + i, n_fronds=7 + i, frond_len=1.4 + 0.4 * i, trunk_h=0.3 + 0.5 * i), f'PL_Palm_{i}')
for i in range(2): finish(heliconia(30 + i, n_stems=7 + 2 * i, h=1.3 + 0.6 * i, leaf_len=1.5 + 0.3 * i), f'PL_Heliconia_{i}')
for i in range(2): finish(shrub(40 + i, n_twigs=22 + 6 * i, h=0.9 + 0.4 * i, sid=['LeafSet022', 'LeafSet024'][i]), f'PL_Shrub_{i}')
lit = bpy.data.collections.new('LITTER'); scn.collection.children.link(lit)
k = 0
for sid in ['LeafSet008', 'LeafSet011', 'LeafSet012', 'LeafSet011']:
    for s in range(4):
        o = litter(s, sid)
        for cc in o.users_collection: cc.objects.unlink(o)
        lit.objects.link(o); k += 1

# remove stray helper objects left in master collection
for o in list(scn.collection.objects): bpy.data.objects.remove(o)
for m in list(bpy.data.meshes):
    if m.users == 0: bpy.data.meshes.remove(m)
bpy.ops.wm.save_as_mainfile(filepath=R + 'blend/plants_lib.blend')
print('PLANTS', [c.name for c in lib.children], 'litter', k)
