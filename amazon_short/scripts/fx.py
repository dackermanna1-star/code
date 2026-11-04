"""Weather / FX: geometry-nodes rain streaks, ground splashes, leaf wetness, lightning, night light rig."""
import bpy, math
from mathutils import Vector, Matrix
from lib import *


def rain(center, size=(10, 10, 7), count=9000, speed=9.0, amount_keys=((1, 1.0),), length=0.32, radius=0.0022, name='FX_Rain', tilt=0.05):
    """Falling streaks in a box. amount_keys: [(frame, 0..1)] fades the shower in/out."""
    ng = bpy.data.node_groups.new(name, 'GeometryNodeTree')
    ng.interface.new_socket('Geometry', in_out='INPUT', socket_type='NodeSocketGeometry')
    ng.interface.new_socket('Geometry', in_out='OUTPUT', socket_type='NodeSocketGeometry')
    am = ng.interface.new_socket('Amount', in_out='INPUT', socket_type='NodeSocketFloat'); am.default_value = 1.0
    N = ng.nodes; L = ng.links.new
    gi = N.new('NodeGroupInput'); go = N.new('NodeGroupOutput')
    pts = N.new('GeometryNodeLinearGizmo') if False else N.new('GeometryNodePoints'); pts.inputs['Count'].default_value = count
    rv = N.new('FunctionNodeRandomValue'); rv.data_type = 'FLOAT_VECTOR'; rv.inputs['Min'].default_value = (-size[0] / 2, -size[1] / 2, 0); rv.inputs['Max'].default_value = (size[0] / 2, size[1] / 2, 1)
    st = N.new('GeometryNodeInputSceneTime')
    sep = N.new('ShaderNodeSeparateXYZ'); L(rv.outputs[0], sep.inputs[0])
    tm = N.new('ShaderNodeMath'); tm.operation = 'MULTIPLY'; tm.inputs[1].default_value = speed / size[2]; L(st.outputs['Seconds'], tm.inputs[0])
    sub = N.new('ShaderNodeMath'); sub.operation = 'SUBTRACT'; L(sep.outputs['Z'], sub.inputs[0]); L(tm.outputs[0], sub.inputs[1])
    fr = N.new('ShaderNodeMath'); fr.operation = 'FRACT'; L(sub.outputs[0], fr.inputs[0])
    zz = N.new('ShaderNodeMath'); zz.operation = 'MULTIPLY'; zz.inputs[1].default_value = size[2]; L(fr.outputs[0], zz.inputs[0])
    comb = N.new('ShaderNodeCombineXYZ'); L(sep.outputs['X'], comb.inputs[0]); L(sep.outputs['Y'], comb.inputs[1]); L(zz.outputs[0], comb.inputs[2])
    L(comb.outputs[0], pts.inputs['Position'])
    # thin by amount
    r2 = N.new('FunctionNodeRandomValue'); r2.data_type = 'FLOAT'; r2.inputs['Seed'].default_value = 7
    gt = N.new('FunctionNodeCompare'); gt.data_type = 'FLOAT'; gt.operation = 'GREATER_THAN'; L(r2.outputs[1], gt.inputs[0]); L(gi.outputs['Amount'], gt.inputs[1])
    dl = N.new('GeometryNodeDeleteGeometry'); L(pts.outputs[0], dl.inputs[0]); L(gt.outputs[0], dl.inputs['Selection'])
    cyl = N.new('GeometryNodeMeshCylinder'); cyl.inputs['Vertices'].default_value = 4; cyl.inputs['Radius'].default_value = radius; cyl.inputs['Depth'].default_value = length
    io = N.new('GeometryNodeInstanceOnPoints'); L(dl.outputs[0], io.inputs['Points']); L(cyl.outputs['Mesh'], io.inputs['Instance'])
    io.inputs['Rotation'].default_value = (tilt, 0, 0)
    mat = bpy.data.materials.get('MAT_Rain')
    if not mat:
        mat = bpy.data.materials.new('MAT_Rain'); mat.use_nodes = True; nt = mat.node_tree; nt.nodes.clear()
        gl = nt.nodes.new('ShaderNodeBsdfGlossy'); gl.inputs['Roughness'].default_value = 0.05; gl.inputs['Color'].default_value = (0.9, 0.95, 1, 1)
        tp = nt.nodes.new('ShaderNodeBsdfTransparent'); em = nt.nodes.new('ShaderNodeEmission'); em.inputs[0].default_value = (0.75, 0.82, 0.85, 1); em.inputs[1].default_value = 0.35
        add = nt.nodes.new('ShaderNodeAddShader'); nt.links.new(gl.outputs[0], add.inputs[0]); nt.links.new(em.outputs[0], add.inputs[1])
        mx = nt.nodes.new('ShaderNodeMixShader'); mx.inputs[0].default_value = 0.55
        nt.links.new(tp.outputs[0], mx.inputs[1]); nt.links.new(add.outputs[0], mx.inputs[2])
        out = nt.nodes.new('ShaderNodeOutputMaterial'); nt.links.new(mx.outputs[0], out.inputs[0])
    sm = N.new('GeometryNodeSetMaterial'); sm.inputs['Material'].default_value = mat; L(io.outputs[0], sm.inputs[0])
    L(sm.outputs[0], go.inputs[0])
    me = bpy.data.meshes.new(name); o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o)
    o.location = center
    md = o.modifiers.new('rain', 'NODES'); md.node_group = ng
    sock = [i for i in ng.interface.items_tree if getattr(i, 'name', '') == 'Amount'][0]
    for f, v in amount_keys:
        md[sock.identifier] = v; md.keyframe_insert(f'["{sock.identifier}"]', frame=f)
    o.cycles.use_motion_blur = False
    return o


def wet_leaves(rough_mul=0.35):
    """Rain makes every leaf glossier (shared leaf materials)."""
    for m in bpy.data.materials:
        if m.name.startswith('MAT_Leaf') and m.node_tree:
            for n in m.node_tree.nodes:
                if n.type == 'MATH' and n.operation == 'MULTIPLY' and not n.inputs[1].is_linked and abs(n.inputs[1].default_value - 1.0) < 1e-3:
                    n.inputs[1].default_value = rough_mul


def stronger_wind(mult=2.5, speed=2.0):
    for ng in bpy.data.node_groups:
        if ng.name.startswith('SC_'):
            for n in ng.nodes:
                if n.type == 'VECT_MATH' and n.operation == 'MULTIPLY':
                    v = n.inputs[1].default_value; n.inputs[1].default_value = (v[0] * mult, v[1] * mult, v[2] * mult)
                if n.type == 'MATH' and n.operation == 'MULTIPLY' and n.inputs[0].is_linked and n.inputs[0].links[0].from_node.type == 'INPUT_SCENE_TIME':
                    n.inputs[1].default_value *= speed


def lightning(light_obj, frames, peak=12.0):
    base = light_obj.data.energy
    for f in frames:
        for df, k in ((-1, 1), (0, peak), (2, 2.0), (3, peak * 0.7), (6, 1)):
            light_obj.data.energy = base * k; light_obj.data.keyframe_insert('energy', frame=f + df)


def overcast(scene_exposure=0.2, hdri_tint=(0.7, 0.78, 0.85, 1)):
    w = bpy.context.scene.world
    for n in w.node_tree.nodes:
        if n.type == 'MIX' and n.data_type == 'RGBA':
            for s in n.inputs:
                if s.name == 'B' and s.type == 'RGBA': s.default_value = hdri_tint
    bpy.context.scene.view_settings.exposure = scene_exposure


def animate_world_strength(keys):
    bg = bpy.context.scene.world.node_tree.nodes['Background']
    for f, v in keys:
        bg.inputs[1].default_value = v; bg.inputs[1].keyframe_insert('default_value', frame=f)


def animate_light(obj, keys, attr='energy'):
    for f, v in keys:
        setattr(obj.data, attr, v); obj.data.keyframe_insert(attr, frame=f)


def hero_leaf(name, sid, length, base, direction, droop=0.45, cup=0.08):
    """Single big scanned leaf card (same construction as the plant library) – used where a leaf must be placed exactly."""
    import json, bmesh
    BOX = json.load(open(ASSETS + 'acg/leaf_boxes.json'))
    b = BOX[sid][0]; width = length * b['w'] / b['h']; nx, ny = 6, 16
    me = bpy.data.meshes.new(name); bm = bmesh.new(); uvl = bm.loops.layers.uv.new('UVMap'); rows = []
    for j in range(ny + 1):
        t = j / ny; row = []
        for i in range(nx + 1):
            s = i / nx - 0.5
            row.append(bm.verts.new((s * width, t * length * (1 - 0.15 * droop * t), -droop * length * t * t + cup * width * (2 * s) ** 2)))
        rows.append(row)
    for j in range(ny):
        for i in range(nx):
            f = bm.faces.new((rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i]))
            for k, l in enumerate(f.loops):
                ii, jj = [(i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1)][k]
                l[uvl].uv = (b['u0'] + ii / nx * (b['u1'] - b['u0']), b['v0'] + jj / ny * (b['v1'] - b['v0']))
    bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = True
    m = bpy.data.materials.get(f'MAT_Leaf_{sid}')
    if m: me.materials.append(m)
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o)
    d = Vector(direction).normalized(); q = d.to_track_quat('Y', 'Z')
    o.matrix_world = Matrix.Translation(base) @ q.to_matrix().to_4x4()
    tip_local = Vector((0, length * (1 - 0.15 * droop), -droop * length))
    return o, o.matrix_world @ tip_local
