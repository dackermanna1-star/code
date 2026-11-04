"""Aerial Amazon set: canopy surface of individual rounded crowns (per-crown colour variation, a few
flowering trees), near-camera instanced crowns, meandering brown river, tributary stream, mist banks,
riverside stilt huts."""
import bpy, bmesh, math, random
from mathutils import Vector, noise, Matrix
from lib import *
import env as ENV


def S(coll, name, typ='RGBA'):
    for x in coll:
        if x.name == name and x.type == typ: return x


def river_center(x, river):
    """River runs along X; centre-line y(x)."""
    return river['y'] + 60 * math.sin(x * 0.004 + 0.5) + 25 * math.sin(x * 0.011 + 2.0)


def stream_line(stream, t):
    p0 = Vector(stream['p0']); p1 = Vector(stream['p1'])
    p = p0.lerp(p1, t); d = (p1 - p0); n = Vector((-d.y, d.x)).normalized()
    return p + n * (18 * math.sin(t * 9.0) + 6 * math.sin(t * 23.0)) * (1 - t * 0.3)


def canopy_material():
    m = bpy.data.materials.get('MAT_CanopyTop')
    if m: return m
    m = bpy.data.materials.new('MAT_CanopyTop'); m.use_nodes = True; nt = m.node_tree; L = nt.links.new
    b = nt.nodes['Principled BSDF']
    at = nt.nodes.new('ShaderNodeAttribute'); at.attribute_name = 'crown_col'
    tc = nt.nodes.new('ShaderNodeTexCoord')
    # leaf clumps: voronoi at two scales as bump + darkening in crevices
    v1 = nt.nodes.new('ShaderNodeTexVoronoi'); v1.inputs['Scale'].default_value = 0.3; L(tc.outputs['Object'], v1.inputs[0])
    v2 = nt.nodes.new('ShaderNodeTexVoronoi'); v2.inputs['Scale'].default_value = 0.9; L(tc.outputs['Object'], v2.inputs[0])
    nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 0.5; nz.inputs['Detail'].default_value = 8; L(tc.outputs['Object'], nz.inputs[0])
    ad = nt.nodes.new('ShaderNodeMath'); ad.operation = 'ADD'; L(v1.outputs['Distance'], ad.inputs[0]); L(v2.outputs['Distance'], ad.inputs[1])
    ad2 = nt.nodes.new('ShaderNodeMath'); ad2.operation = 'MULTIPLY_ADD'; L(nz.outputs['Fac'], ad2.inputs[0]); ad2.inputs[1].default_value = 0.6; L(ad.outputs[0], ad2.inputs[2])
    bu = nt.nodes.new('ShaderNodeBump'); bu.inputs['Strength'].default_value = 1.0; bu.inputs['Distance'].default_value = 1.5
    L(ad2.outputs[0], bu.inputs['Height']); L(bu.outputs[0], b.inputs['Normal'])
    cr = nt.nodes.new('ShaderNodeMapRange'); L(ad2.outputs[0], cr.inputs[0]); cr.inputs[1].default_value = 0.3; cr.inputs[2].default_value = 1.4
    cr.inputs[3].default_value = 0.3; cr.inputs[4].default_value = 1.25
    mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.blend_type = 'MULTIPLY'; mx.inputs[0].default_value = 1
    L(at.outputs['Color'], S(mx.inputs, 'A')); L(cr.outputs[0], S(mx.inputs, 'B', 'RGBA')) if False else None
    cv = nt.nodes.new('ShaderNodeCombineColor'); L(cr.outputs[0], cv.inputs[0]); L(cr.outputs[0], cv.inputs[1]); L(cr.outputs[0], cv.inputs[2])
    L(cv.outputs[0], S(mx.inputs, 'B'))
    geo = nt.nodes.new('ShaderNodeNewGeometry'); sz = nt.nodes.new('ShaderNodeSeparateXYZ'); L(geo.outputs['Normal'], sz.inputs[0])
    sd = nt.nodes.new('ShaderNodeMapRange'); L(sz.outputs['Z'], sd.inputs[0]); sd.inputs[1].default_value = 0.1; sd.inputs[2].default_value = 0.8
    sd.inputs[3].default_value = 0.35; sd.inputs[4].default_value = 1.0
    dk = nt.nodes.new('ShaderNodeMix'); dk.data_type = 'RGBA'; dk.blend_type = 'MULTIPLY'; dk.inputs[0].default_value = 1
    L(S(mx.outputs, 'Result'), S(dk.inputs, 'A')); cv2 = nt.nodes.new('ShaderNodeCombineColor')
    for i in range(3): L(sd.outputs[0], cv2.inputs[i])
    L(cv2.outputs[0], S(dk.inputs, 'B'))
    L(S(dk.outputs, 'Result'), b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = 0.7; b.inputs['Sheen Weight'].default_value = 0.1
    return m


def build_aerial(cfg):
    """cfg: center, size, res, seed, river=dict(y, width), stream=dict(p0, p1, width), huts=[(x,y)], cam=(x,y,z)"""
    rnd = random.Random(cfg['seed'])
    cx, cy = cfg['center']; size = cfg['size']; res = cfg.get('res', 4.0)
    river = cfg.get('river'); stream = cfg.get('stream')
    # crown centres on jittered grid (hash for lookup)
    cell = 9.0; crowns = {}
    nC = int(size / cell) + 2
    for i in range(-nC // 2, nC // 2 + 1):
        for j in range(-nC // 2, nC // 2 + 1):
            x = cx + i * cell + rnd.uniform(-3.5, 3.5); y = cy + j * cell + rnd.uniform(-3.5, 3.5)
            big = rnd.random() < 0.08  # emergent giants poke above the canopy
            r = rnd.uniform(4.5, 7.0) * (1.7 if big else 1.0); h = rnd.uniform(25, 33) + (10 if big else 0)
            u = rnd.random()
            if u < 0.008: col = (0.62, 0.50, 0.06)
            elif u < 0.014: col = (0.42, 0.22, 0.42)
            elif u < 0.03: col = (0.16, 0.15, 0.10)   # sparse / leafless crown
            else:
                g = rnd.uniform(0, 1); kk = rnd.random()
                col = (0.025 + 0.06 * g, 0.07 + 0.09 * kk, 0.018 + 0.025 * g)
            lobes = [(x, y, r, h)]
            for _ in range(rnd.randint(2, 4)):
                a = rnd.uniform(0, 6.28); dd = r * rnd.uniform(0.35, 0.6)
                lobes.append((x + math.cos(a) * dd, y + math.sin(a) * dd, r * rnd.uniform(0.45, 0.65), h + rnd.uniform(-1.5, 1.5)))
            crowns[(i, j)] = (lobes, col)
    def crown_field(x, y):
        i = round((x - cx) / cell); j = round((y - cy) / cell)
        best = 16.0; bc = (0.04, 0.1, 0.03)
        for di in (-2, -1, 0, 1, 2):
            for dj in (-2, -1, 0, 1, 2):
                c = crowns.get((i + di, j + dj))
                if not c: continue
                for (lx, ly, lr, lh) in c[0]:
                    d = math.hypot(x - lx, y - ly)
                    if d < lr:
                        z = lh + math.sqrt(max(0, lr ** 2 - d ** 2)) * 0.6
                        if z > best: best = z; bc = c[1]
        return best, bc
    me = bpy.data.meshes.new('AER_Canopy'); bm = bmesh.new()
    n = int(size / res)
    grid = []
    colors = []
    for j in range(n + 1):
        row = []
        for i in range(n + 1):
            x = cx - size / 2 + i * res; y = cy - size / 2 + j * res
            z, col = crown_field(x, y)
            z += 2.5 * noise.noise(Vector((x * 0.01, y * 0.01, 3)))
            gap = 0.0
            if cfg.get('bank_south') is not None:
                t = ENV.smoothstep(cfg['bank_south'], cfg['bank_south'] + 14, y)
                z = z * t + (-2.0) * (1 - t)
            if cfg.get('bank_north') is not None:
                t = ENV.smoothstep(cfg['bank_north'], cfg['bank_north'] - 14, y)
                z = z * t + (-2.0) * (1 - t)
            if river:
                d = abs(y - river_center(x, river))
                w = river['width'] / 2
                t = ENV.smoothstep(w, w + 16, d)
                z = z * t + (-2.0) * (1 - t) if d > w else -3.0
            if stream:
                best = 1e9
                for k in range(41):
                    p = stream_line(stream, k / 40); best = min(best, (Vector((x, y)) - p).length)
                w = stream['width'] / 2
                t = ENV.smoothstep(w, w + 9, best)
                z = z * (0.55 + 0.45 * t) if best > w else min(z, 4.0)
            v = bm.verts.new((x, y, z)); row.append(v); colors.append(col)
        grid.append(row)
    for j in range(n):
        for i in range(n):
            f = bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i])); f.smooth = True
    bm.to_mesh(me); bm.free()
    ca = me.color_attributes.new('crown_col', 'FLOAT_COLOR', 'POINT')
    for k, c in enumerate(colors): ca.data[k].color = (*c, 1)
    o = bpy.data.objects.new('AER_Canopy', me); bpy.context.scene.collection.objects.link(o)
    me.materials.append(canopy_material())
    out = dict(canopy=o)
    # water
    wm = ENV.water_material('MAT_AerRiver', (0.36, 0.24, 0.11, 1), flow=(0.4, 0.0), murk=0.97, wave_scale=0.05)
    if river:
        me2 = bpy.data.meshes.new('AER_River'); bm2 = bmesh.new(); rows = []
        for k in range(int(size / 6) + 1):
            x = cx - size / 2 + k * 6; yc = river_center(x, river)
            rows.append((bm2.verts.new((x, yc - river['width'] / 2 - 12, -1.0)), bm2.verts.new((x, yc + river['width'] / 2 + 12, -1.0))))
        for k in range(len(rows) - 1):
            bm2.faces.new((rows[k][0], rows[k + 1][0], rows[k + 1][1], rows[k][1]))
        bm2.to_mesh(me2); bm2.free()
        ro = bpy.data.objects.new('AER_River', me2); bpy.context.scene.collection.objects.link(ro); me2.materials.append(wm); out['river'] = ro
    if stream:
        me3 = bpy.data.meshes.new('AER_Stream'); bm3 = bmesh.new(); rows = []
        for k in range(81):
            t = k / 80; p = stream_line(stream, t); q = stream_line(stream, min(1, t + 0.01)); d = (q - p).normalized(); nn = Vector((-d.y, d.x))
            w = stream['width'] / 2 * (0.6 + 0.4 * t)
            rows.append((bm3.verts.new((*(p - nn * w), 1.5)), bm3.verts.new((*(p + nn * w), 1.5))))
        for k in range(len(rows) - 1):
            bm3.faces.new((rows[k][0], rows[k + 1][0], rows[k + 1][1], rows[k][1]))
        bm3.to_mesh(me3); bm3.free()
        so = bpy.data.objects.new('AER_Stream', me3); bpy.context.scene.collection.objects.link(so); me3.materials.append(wm); out['stream'] = so
    # huts on stilts with palm-thatch roofs
    thatch = ENV.pbr_material('MAT_Thatch', 'forest_leaves_02', 2.0, (0.75, 0.6, 0.35, 1))
    wood = ENV.pbr_material('MAT_HutWood', 'bark_brown_02', 1.5, (0.7, 0.55, 0.4, 1))
    for hi, (hx, hy) in enumerate(cfg.get('huts', [])):
        bpy.ops.mesh.primitive_cube_add(size=1, location=(hx, hy, 2.4)); h = bpy.context.active_object; h.name = f'AER_Hut_{hi}'
        h.scale = (6, 4, 2.2); h.data.materials.append(wood)
        bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=5.2, depth=3.2, location=(hx, hy, 5.0)); r = bpy.context.active_object; r.name = f'AER_Roof_{hi}'
        r.rotation_euler.z = math.radians(45); r.scale = (1.35, 1.0, 1); r.data.materials.append(thatch)
        for sx in (-1, 1):
            for sy in (-1, 1):
                bpy.ops.mesh.primitive_cylinder_add(radius=0.15, depth=2.5, location=(hx + sx * 2.6, hy + sy * 1.7, 0.5)); bpy.context.active_object.data.materials.append(wood)
    # mist banks: soft noise planes drifting slowly
    mm = bpy.data.materials.new('MAT_Mist'); mm.use_nodes = True; nt = mm.node_tree; nt.nodes.clear(); L = nt.links.new
    tc = nt.nodes.new('ShaderNodeTexCoord'); nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 0.012; nz.inputs['Detail'].default_value = 6
    mp = nt.nodes.new('ShaderNodeMapping'); L(tc.outputs['Object'], mp.inputs[0]); L(mp.outputs[0], nz.inputs[0])
    fc = mp.inputs['Location'].driver_add('default_value', 0); fc.driver.expression = 'frame*0.15'
    cr = nt.nodes.new('ShaderNodeMapRange'); L(nz.outputs['Fac'], cr.inputs[0]); cr.inputs[1].default_value = 0.52; cr.inputs[2].default_value = 0.7
    cr.inputs[3].default_value = 0.0; cr.inputs[4].default_value = cfg.get('mist', 0.55)
    tp = nt.nodes.new('ShaderNodeBsdfTransparent'); df = nt.nodes.new('ShaderNodeBsdfDiffuse'); df.inputs[0].default_value = (0.9, 0.92, 0.95, 1)
    em = nt.nodes.new('ShaderNodeEmission'); em.inputs[0].default_value = (0.85, 0.88, 0.9, 1); em.inputs[1].default_value = 0.25
    ad = nt.nodes.new('ShaderNodeAddShader'); L(df.outputs[0], ad.inputs[0]); L(em.outputs[0], ad.inputs[1])
    mx = nt.nodes.new('ShaderNodeMixShader'); L(cr.outputs[0], mx.inputs[0]); L(tp.outputs[0], mx.inputs[1]); L(ad.outputs[0], mx.inputs[2])
    out_ = nt.nodes.new('ShaderNodeOutputMaterial'); L(mx.outputs[0], out_.inputs[0])
    for k, z in enumerate(cfg.get('mist_levels', [38, 46])):
        bpy.ops.mesh.primitive_plane_add(size=size, location=(cx, cy, z)); mp_ = bpy.context.active_object; mp_.name = f'AER_Mist_{k}'
        mp_.data.materials.append(mm); mp_.cycles.use_motion_blur = False
    out['crown_field'] = crown_field
    return out


def crown_instances(canopy_obj, region_center, region_size, density=0.004, scale=(3.0, 5.5), seed=0, lod='LOD1'):
    """Scatter real scanned tree crowns (Poly Haven island_tree_02) over the canopy surface inside a region."""
    col, objs = ENV.ph_objects('island_tree_02', names=['island_tree_02_' + lod], lod=lod)
    # region mask as vertex attribute
    me = canopy_obj.data
    at = me.attributes.get('crown_dens') or me.attributes.new('crown_dens', 'FLOAT', 'POINT')
    cx, cy = region_center
    for i, v in enumerate(me.vertices):
        d = max(abs(v.co.x - cx), abs(v.co.y - cy))
        at.data[i].value = 1.0 if (d < region_size / 2 and v.co.z > 8) else 0.0
    sc = ENV.scatter('SC_Crowns', canopy_obj, col, density, seed, scale, align=0.0, wind=0.0, tilt=0.08, zoff=-6.0, attr='crown_dens')
    bpy.context.scene.collection.objects.link(sc)
    sc.cycles.use_motion_blur = False
    return sc
