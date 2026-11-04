"""Amazon rainforest set builder used by every shot.

build_env(cfg) creates, around a camera position:
  * terrain patch with mud / leaf-litter blend, optional stream channel and river basin
  * giant buttressed trees (kapok-like), thin pole trunks, understory trees with palm crowns
  * lianas hanging from the canopy, epiphytes on trunks
  * geometry-nodes scatter layers (leaf litter, Poly Haven scanned plants, our tropical plants, roots/debris)
    with per-instance wind sway driven by scene time
  * canopy ceiling for dappled light, water surfaces, sun + HDRI
All randomness is seeded so a shot rebuilds identically.
"""
import bpy, bmesh, math, random
from mathutils import Vector, Matrix, noise
from lib import *

TEX = ASSETS + 'tex/'
PH = ASSETS + 'ph/'


def S(coll, name, typ='RGBA'):
    for x in coll:
        if x.name == name and x.type == typ: return x


# ------------------------------------------------------------------ helpers
def smoothstep(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t)


def dist_to_polyline(p, pts):
    best = 1e9; bt = 0
    for i in range(len(pts) - 1):
        a, b = Vector(pts[i]), Vector(pts[i + 1]); ab = b - a
        t = max(0, min(1, (p - a).dot(ab) / max(1e-9, ab.length_squared)))
        d = (p - (a + ab * t)).length
        if d < best: best = d; bt = i + t
    return best, bt


def hidden_collection(name):
    c = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    if c.name not in bpy.context.scene.collection.children: bpy.context.scene.collection.children.link(c)
    # exclude from the view layer (instancing still works; hide_render would also hide instances)
    lc = bpy.context.view_layer.layer_collection.children.get(c.name)
    if lc: lc.exclude = True
    return c


def link(o, col):
    for c in o.users_collection: c.objects.unlink(o)
    col.objects.link(o)


# ------------------------------------------------------------------ materials
def pbr_material(name, base, scale=1.0, tint=None, bump=0.3, rough_add=0.0, disp_bump=True, extra=None):
    if name in bpy.data.materials: return bpy.data.materials[name]
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; L = nt.links.new
    bsdf = nt.nodes['Principled BSDF']
    tc = nt.nodes.new('ShaderNodeTexCoord'); mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (scale, scale, scale)
    L(tc.outputs['UV'], mp.inputs[0])
    def T(suf, nc):
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(f'{TEX}{base}/{base}_{suf}_2k.jpg', check_existing=True)
        if nc: t.image.colorspace_settings.name = 'Non-Color'
        L(mp.outputs[0], t.inputs[0]); return t
    d = T('diff', False); n = T('nor_gl', True); r = T('rough', True)
    col = d.outputs[0]
    if tint:
        mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.blend_type = 'MULTIPLY'; mx.inputs[0].default_value = 1
        L(col, S(mx.inputs, 'A')); S(mx.inputs, 'B').default_value = tint; col = S(mx.outputs, 'Result')
    L(col, bsdf.inputs['Base Color'])
    nm = nt.nodes.new('ShaderNodeNormalMap'); L(n.outputs[0], nm.inputs[1]); L(nm.outputs[0], bsdf.inputs['Normal'])
    ra = nt.nodes.new('ShaderNodeMath'); ra.operation = 'ADD'; ra.inputs[1].default_value = rough_add; ra.use_clamp = True
    L(r.outputs[0], ra.inputs[0]); L(ra.outputs[0], bsdf.inputs['Roughness'])
    return m


def terrain_material(wet=0.0):
    """Mud / leaf litter / forest floor blended by noise; low areas become wet, glossy mud and puddles."""
    name = f'MAT_Terrain_w{wet:.2f}'
    if name in bpy.data.materials: return bpy.data.materials[name]
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear(); L = nt.links.new
    out = nt.nodes.new('ShaderNodeOutputMaterial'); out.location = (1400, 0)
    tc = nt.nodes.new('ShaderNodeTexCoord'); tc.location = (-1800, 0)
    def layer(base, scale, loc):
        mp = nt.nodes.new('ShaderNodeMapping'); mp.location = (loc[0] - 300, loc[1]); mp.inputs['Scale'].default_value = (scale,) * 3
        L(tc.outputs['Object'], mp.inputs[0])
        res = {}
        for k, suf, nc in (('c', 'diff', False), ('n', 'nor_gl', True), ('r', 'rough', True), ('d', 'disp', True)):
            t = nt.nodes.new('ShaderNodeTexImage'); t.location = (loc[0], loc[1] - 260 * len(res))
            t.image = bpy.data.images.load(f'{TEX}{base}/{base}_{suf}_2k.jpg', check_existing=True) if suf != 'disp' else None
            if suf == 'disp':
                import os
                for ext in ('jpg', 'png'):
                    p = f'{TEX}{base}/{base}_disp_2k.{ext}'
                    if os.path.exists(p): t.image = bpy.data.images.load(p, check_existing=True)
            if nc and t.image: t.image.colorspace_settings.name = 'Non-Color'
            L(mp.outputs[0], t.inputs[0]); res[k] = t
        return res
    A = layer('brown_mud_leaves_01', 0.35, (-1200, 900))
    Bm = layer('mud_forest', 0.4, (-1200, -200))
    C = layer('forest_leaves_02', 0.3, (-1200, -1300))
    nz = nt.nodes.new('ShaderNodeTexNoise'); nz.location = (-900, 1400); nz.inputs['Scale'].default_value = 0.12; nz.inputs['Detail'].default_value = 6
    L(tc.outputs['Object'], nz.inputs[0])
    cr = nt.nodes.new('ShaderNodeValToRGB'); cr.location = (-650, 1400); cr.color_ramp.elements[0].position = 0.42; cr.color_ramp.elements[1].position = 0.58
    L(nz.outputs['Fac'], cr.inputs[0])
    nz2 = nt.nodes.new('ShaderNodeTexNoise'); nz2.location = (-900, 1700); nz2.inputs['Scale'].default_value = 0.07; nz2.inputs['Detail'].default_value = 4
    L(tc.outputs['Object'], nz2.inputs[0])
    cr2 = nt.nodes.new('ShaderNodeValToRGB'); cr2.location = (-650, 1700); cr2.color_ramp.elements[0].position = 0.45; cr2.color_ramp.elements[1].position = 0.62
    L(nz2.outputs['Fac'], cr2.inputs[0])
    # 'mud' attribute (painted from stream/path proximity) forces mud layer
    at = nt.nodes.new('ShaderNodeAttribute'); at.attribute_name = 'mud'; at.location = (-650, 1100)
    mx1 = nt.nodes.new('ShaderNodeMath'); mx1.operation = 'MAXIMUM'; mx1.location = (-400, 1300)
    L(cr.outputs[0], mx1.inputs[0]); L(at.outputs['Fac'], mx1.inputs[1])
    def mix3(sock_a, sock_b, sock_c, typ, loc):
        m1 = nt.nodes.new('ShaderNodeMix'); m1.data_type = typ; m1.location = loc
        L(mx1.outputs[0], m1.inputs[0]); L(sock_a, S(m1.inputs, 'A', typ if typ != 'FLOAT' else 'VALUE')); L(sock_b, S(m1.inputs, 'B', typ if typ != 'FLOAT' else 'VALUE'))
        m2 = nt.nodes.new('ShaderNodeMix'); m2.data_type = typ; m2.location = (loc[0] + 200, loc[1])
        L(cr2.outputs[0], m2.inputs[0]); L(S(m1.outputs, 'Result', typ if typ != 'FLOAT' else 'VALUE'), S(m2.inputs, 'A', typ if typ != 'FLOAT' else 'VALUE'))
        L(sock_c, S(m2.inputs, 'B', typ if typ != 'FLOAT' else 'VALUE'))
        return S(m2.outputs, 'Result', typ if typ != 'FLOAT' else 'VALUE')
    col = mix3(A['c'].outputs[0], Bm['c'].outputs[0], C['c'].outputs[0], 'RGBA', (-200, 600))
    nor = mix3(A['n'].outputs[0], Bm['n'].outputs[0], C['n'].outputs[0], 'RGBA', (-200, 200))
    rgh = mix3(A['r'].outputs[0], Bm['r'].outputs[0], C['r'].outputs[0], 'FLOAT', (-200, -200))
    hgt = mix3(A['d'].outputs[0], Bm['d'].outputs[0], C['d'].outputs[0], 'FLOAT', (-200, -500))
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled'); bsdf.location = (900, 200)
    # wetness: darker albedo, lower roughness where height map is low + global rain wetness
    wa = nt.nodes.new('ShaderNodeAttribute'); wa.attribute_name = 'wetmask'; wa.location = (200, -700)
    hm = nt.nodes.new('ShaderNodeMapRange'); hm.location = (200, -500); L(hgt, hm.inputs[0]); hm.inputs[1].default_value = 0.25; hm.inputs[2].default_value = 0.6
    hm.inputs[3].default_value = 1; hm.inputs[4].default_value = 0
    wsum = nt.nodes.new('ShaderNodeMath'); wsum.operation = 'MULTIPLY_ADD'; wsum.location = (400, -500); wsum.use_clamp = True
    L(hm.outputs[0], wsum.inputs[0]); wsum.inputs[1].default_value = 0.35 + 0.65 * wet; wsum.inputs[2].default_value = 0.15 * wet
    wsum2 = nt.nodes.new('ShaderNodeMath'); wsum2.operation = 'MAXIMUM'; wsum2.location = (550, -600); wsum2.use_clamp = True
    L(wsum.outputs[0], wsum2.inputs[0]); L(wa.outputs['Fac'], wsum2.inputs[1])
    dk = nt.nodes.new('ShaderNodeMix'); dk.data_type = 'RGBA'; dk.blend_type = 'MULTIPLY'; dk.location = (650, 600)
    L(wsum2.outputs[0], dk.inputs[0]); L(col, S(dk.inputs, 'A')); S(dk.inputs, 'B').default_value = (0.45, 0.42, 0.38, 1)
    L(S(dk.outputs, 'Result'), bsdf.inputs['Base Color'])
    rr = nt.nodes.new('ShaderNodeMix'); rr.location = (650, -200)
    L(wsum2.outputs[0], rr.inputs[0]); L(rgh, S(rr.inputs, 'A', 'VALUE')); S(rr.inputs, 'B', 'VALUE').default_value = 0.12
    L(S(rr.outputs, 'Result', 'VALUE'), bsdf.inputs['Roughness'])
    nm = nt.nodes.new('ShaderNodeNormalMap'); nm.location = (650, 200); L(nor, nm.inputs[1])
    nmix = nt.nodes.new('ShaderNodeMath'); nmix.operation = 'SUBTRACT'; nmix.inputs[0].default_value = 1.0; nmix.location = (500, 100)
    L(wsum2.outputs[0], nmix.inputs[1]); L(nmix.outputs[0], nm.inputs[0])
    L(nm.outputs[0], bsdf.inputs['Normal'])
    L(bsdf.outputs[0], out.inputs[0])
    return m


def bark_material(name, base='bark_brown_02', tint=(1, 1, 1, 1), moss=0.5, lichen=0.0, scale=0.6):
    if name in bpy.data.materials: return bpy.data.materials[name]
    m = pbr_material(name, base, scale, tint)
    nt = m.node_tree; L = nt.links.new; bsdf = nt.nodes['Principled BSDF']
    base_col = bsdf.inputs['Base Color'].links[0].from_socket
    tc = nt.nodes.new('ShaderNodeTexCoord')
    nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 1.2; nz.inputs['Detail'].default_value = 8
    L(tc.outputs['Object'], nz.inputs[0])
    # moss favours the lower trunk and upward-facing surfaces
    sep = nt.nodes.new('ShaderNodeSeparateXYZ'); L(tc.outputs['Object'], sep.inputs[0])
    zf = nt.nodes.new('ShaderNodeMapRange'); L(sep.outputs['Z'], zf.inputs[0]); zf.inputs[1].default_value = 0; zf.inputs[2].default_value = 6
    zf.inputs[3].default_value = moss; zf.inputs[4].default_value = moss * 0.25
    th = nt.nodes.new('ShaderNodeMath'); th.operation = 'SUBTRACT'; L(nz.outputs['Fac'], th.inputs[0]); th.inputs[1].default_value = 0.62
    th2 = nt.nodes.new('ShaderNodeMath'); th2.operation = 'ADD'; L(th.outputs[0], th2.inputs[0]); L(zf.outputs[0], th2.inputs[1])
    th3 = nt.nodes.new('ShaderNodeMath'); th3.operation = 'MULTIPLY'; th3.inputs[1].default_value = 6; th3.use_clamp = True; L(th2.outputs[0], th3.inputs[0])
    mm = nt.nodes.new('ShaderNodeMix'); mm.data_type = 'RGBA'; L(th3.outputs[0], mm.inputs[0]); L(base_col, S(mm.inputs, 'A'))
    S(mm.inputs, 'B').default_value = (0.06, 0.11, 0.025, 1)
    cur = S(mm.outputs, 'Result')
    if lichen > 0:
        vz = nt.nodes.new('ShaderNodeTexNoise'); vz.inputs['Scale'].default_value = 2.5; vz.inputs['Detail'].default_value = 10; vz.inputs['Roughness'].default_value = 0.7
        L(tc.outputs['Object'], vz.inputs[0])
        lm = nt.nodes.new('ShaderNodeMapRange'); L(vz.outputs['Fac'], lm.inputs[0]); lm.inputs[1].default_value = 0.56; lm.inputs[2].default_value = 0.66
        lm.inputs[3].default_value = 0; lm.inputs[4].default_value = lichen * 0.7
        ml = nt.nodes.new('ShaderNodeMix'); ml.data_type = 'RGBA'; L(lm.outputs[0], ml.inputs[0]); L(cur, S(ml.inputs, 'A'))
        S(ml.inputs, 'B').default_value = (0.42, 0.45, 0.36, 1); cur = S(ml.outputs, 'Result')
    L(cur, bsdf.inputs['Base Color'])
    return m


def liana_material():
    if 'MAT_Liana' in bpy.data.materials: return bpy.data.materials['MAT_Liana']
    return pbr_material('MAT_Liana', 'bark_brown_02', 3.0, (0.55, 0.45, 0.32, 1), rough_add=0.1)


def water_material(name='MAT_Water', tint=(0.18, 0.12, 0.05, 1), flow=(0.0, 0.25), murk=0.9, wave_scale=3.0, rain=0.0, flow_uv=False):
    if name in bpy.data.materials: return bpy.data.materials[name]
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; L = nt.links.new
    bsdf = nt.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = tint; bsdf.inputs['Roughness'].default_value = 0.04
    bsdf.inputs['Transmission Weight'].default_value = 1 - murk; bsdf.inputs['IOR'].default_value = 1.333
    bsdf.inputs['Specular IOR Level'].default_value = 0.6
    tc = nt.nodes.new('ShaderNodeTexCoord'); mp = nt.nodes.new('ShaderNodeMapping')
    L(tc.outputs['UV' if flow_uv else 'Object'], mp.inputs[0])
    # flowing: mapping location driven by frame
    for i, v in enumerate(flow):
        fc = mp.inputs['Location'].driver_add('default_value', i)
        fc.driver.expression = f'-frame*{v}/30.0'
    nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = wave_scale; nz.inputs['Detail'].default_value = 6
    nz.noise_dimensions = '4D'
    wf = nz.inputs['W'].driver_add('default_value'); wf.driver.expression = 'frame/90.0'
    L(mp.outputs[0], nz.inputs['Vector'])
    bump = nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.12; bump.inputs['Distance'].default_value = 0.05
    L(nz.outputs['Fac'], bump.inputs['Height'])
    if rain > 0:  # raindrop ripples
        vr = nt.nodes.new('ShaderNodeTexVoronoi'); vr.voronoi_dimensions = '4D'; vr.inputs['Scale'].default_value = 9
        vw = vr.inputs['W'].driver_add('default_value'); vw.driver.expression = 'frame/6.0'
        L(tc.outputs['Object'], vr.inputs['Vector'])
        rp = nt.nodes.new('ShaderNodeMath'); rp.operation = 'SINE'; mul = nt.nodes.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'; mul.inputs[1].default_value = 60
        L(vr.outputs['Distance'], mul.inputs[0]); L(mul.outputs[0], rp.inputs[0])
        ad = nt.nodes.new('ShaderNodeMath'); ad.operation = 'MULTIPLY_ADD'; L(rp.outputs[0], ad.inputs[0]); ad.inputs[1].default_value = 0.06 * rain
        L(nz.outputs['Fac'], ad.inputs[2]); L(ad.outputs[0], bump.inputs['Height'])
    L(bump.outputs[0], bsdf.inputs['Normal'])
    return m


# ------------------------------------------------------------------ terrain
def build_terrain(cfg):
    cx, cy = cfg['center']; size = cfg['size']; res = cfg.get('res', 0.35)
    n = int(size / res)
    rnd = random.Random(cfg['seed'])
    off = Vector((rnd.uniform(0, 100), rnd.uniform(0, 100), 0))
    stream = cfg.get('stream'); river = cfg.get('river'); path = cfg.get('path')
    me = bpy.data.meshes.new('TERRAIN'); bm = bmesh.new()
    dens_l = bm.verts.layers.float.new('dens'); lit_l = bm.verts.layers.float.new('dens_litter'); mud_l = bm.verts.layers.float.new('mud'); wet_l = bm.verts.layers.float.new('wetmask')
    grid = []
    for j in range(n + 1):
        row = []
        for i in range(n + 1):
            x = cx - size / 2 + i * res; y = cy - size / 2 + j * res
            p = Vector((x, y, 0))
            h = 0.9 * noise.fractal((p + off) * 0.035, 0.5, 2.0, 4) + 0.12 * noise.fractal((p + off) * 0.4, 0.5, 2.0, 3)
            dens = 1.0; mud = 0.0; wet = 0.0
            if stream:
                d, _ = dist_to_polyline(Vector((x, y)), stream['pts'])
                w = stream['width']
                carve = 1 - smoothstep(w * 0.5, w * 0.5 + stream.get('bank', 1.6), d)
                h = h * (1 - carve * 0.8) - carve * stream.get('depth', 0.7)
                dens *= smoothstep(w * 0.5 + 0.2, w * 0.5 + 1.5, d)
                mud = max(mud, 1 - smoothstep(w * 0.5, w * 0.5 + 2.2, d))
                wet = max(wet, 1 - smoothstep(w * 0.5, w * 0.5 + 0.9, d))
            if river:
                yb = river['y'] + 2.0 * math.sin(x * 0.05 + 1.3) + 1.0 * math.sin(x * 0.13)
                t = smoothstep(yb - 3.5, yb + 3.0, y)  # 0 in river, 1 on land
                h = h * t + (1 - t) * (-1.6)
                dens *= smoothstep(yb + 0.5, yb + 3.5, y)
                mud = max(mud, 1 - smoothstep(yb, yb + 5.0, y))
                wet = max(wet, 1 - smoothstep(yb, yb + 1.5, y))
            if path:
                d, _ = dist_to_polyline(Vector((x, y)), path['pts'])
                dens *= 0.08 + 0.92 * smoothstep(path['width'] * 0.5, path['width'] * 0.5 + 1.2, d)
                mud = max(mud, 0.7 * (1 - smoothstep(path['width'] * 0.3, path['width'] * 0.5 + 0.6, d)))
            lit = dens
            for (ex, ey, er) in cfg.get('clear', []):
                d = (Vector((x, y)) - Vector((ex, ey))).length
                dens *= smoothstep(er * 0.6, er, d)
            # distance falloff from camera keeps far geometry light (fog hides it)
            cam = cfg.get('cam')
            if cam:
                d = (Vector((x, y)) - Vector(cam[:2])).length
                dens *= 1 - 0.75 * smoothstep(cfg.get('near', 18), cfg.get('far', 45), d)
            v = bm.verts.new((x, y, h)); v[dens_l] = dens; v[lit_l] = lit; v[mud_l] = mud; v[wet_l] = wet
            row.append(v)
        grid.append(row)
    uvl = bm.loops.layers.uv.new('UVMap')
    for j in range(n):
        for i in range(n):
            f = bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
            f.smooth = True
    bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new('ENV_Terrain', me)
    o.data.materials.append(terrain_material(cfg.get('wet', 0.0)))
    return o


def height_at(terrain, x, y):
    """Ray-cast down onto terrain to find ground height."""
    dg = bpy.context.evaluated_depsgraph_get()
    inv = terrain.matrix_world.inverted()
    ok, loc, nrm, idx = terrain.ray_cast(inv @ Vector((x, y, 50)), Vector((0, 0, -1)))
    return (terrain.matrix_world @ loc).z if ok else 0.0


# ------------------------------------------------------------------ trees
def buttress_trunk(name, R=1.0, H=38.0, fins=6, fin_len=2.6, fin_h=4.5, seed=0, seg=96, lean=(0, 0)):
    rnd = random.Random(seed)
    phis = [k / fins * math.tau + rnd.uniform(-0.35, 0.35) for k in range(fins)]
    lens = [fin_len * rnd.uniform(0.6, 1.3) for _ in range(fins)]
    hts = [fin_h * rnd.uniform(0.6, 1.25) for _ in range(fins)]
    zs = [-0.6 + 0.2 * i for i in range(int(fin_h * 1.5 / 0.2))]
    z = zs[-1]
    while z < H: z += 1.0 if z < 12 else 3.0; zs.append(min(z, H))
    me = bpy.data.meshes.new(name); bm = bmesh.new(); uvl = bm.loops.layers.uv.new('UVMap')
    rings = []
    for z in zs:
        ring = []
        taper = R * (1 - 0.45 * (z / H)) * (1 + 0.5 * math.exp(-max(z, 0) / 1.2))
        lx = lean[0] * (z / H) ** 2 * H; ly = lean[1] * (z / H) ** 2 * H
        for s in range(seg):
            th = s / seg * math.tau
            r = taper * (1 + 0.04 * noise.noise(Vector((math.cos(th) * 2, math.sin(th) * 2, z * 0.3 + seed))))
            for phi, fl, fh in zip(phis, lens, hts):
                dth = math.atan2(math.sin(th - phi), math.cos(th - phi))
                # plank fin: narrow angular width, outward reach decays with height (concave profile)
                wid = 0.10 + 0.25 * math.exp(-max(z, 0) / 0.8) * 0.3
                prof = max(0.0, 1 - max(z, -0.6) / fh) ** 1.6
                r += fl * prof * math.exp(-(dth / wid) ** 2) * (1 + 0.3 * noise.noise(Vector((phi, z * 0.5, seed))))
                # web between fins slightly concave
            ring.append(bm.verts.new((r * math.cos(th) + lx, r * math.sin(th) + ly, z)))
        rings.append(ring)
    for j in range(len(rings) - 1):
        for s in range(seg):
            a, b = rings[j][s], rings[j][(s + 1) % seg]; c, d = rings[j + 1][(s + 1) % seg], rings[j + 1][s]
            f = bm.faces.new((a, b, c, d)); f.smooth = True
            for k, l in enumerate(f.loops):
                ss = s + (1 if k in (1, 2) else 0); jj = j + (1 if k in (2, 3) else 0)
                l[uvl].uv = (ss / seg * R * 2 * math.pi / 1.5, zs[jj] / 1.5)
    bm.to_mesh(me); bm.free()
    return me


def pole_trunk(name, r=0.25, H=30.0, seed=0, seg=16):
    rnd = random.Random(seed)
    me = bpy.data.meshes.new(name); bm = bmesh.new(); uvl = bm.loops.layers.uv.new('UVMap')
    bend = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), 0)) * rnd.uniform(0.2, 1.2)
    zs = [-0.4, 0.0, 0.4, 1.2] + [2.0 + k * 2.5 for k in range(int(H / 2.5))]
    rings = []
    for z in zs:
        t = max(0, z) / H
        rr = r * (1 - 0.4 * t) * (1 + 0.6 * math.exp(-max(z, 0) / 0.5))
        c = bend * math.sin(t * math.pi)
        rings.append([bm.verts.new((c.x + rr * math.cos(s / seg * math.tau), c.y + rr * math.sin(s / seg * math.tau), z)) for s in range(seg)])
    for j in range(len(rings) - 1):
        for s in range(seg):
            f = bm.faces.new((rings[j][s], rings[j][(s + 1) % seg], rings[j + 1][(s + 1) % seg], rings[j + 1][s])); f.smooth = True
            for k, l in enumerate(f.loops):
                ss = s + (1 if k in (1, 2) else 0); jj = j + (1 if k in (2, 3) else 0)
                l[uvl].uv = (ss / seg * r * 2 * math.pi, zs[jj] / 1.2)
    bm.to_mesh(me); bm.free()
    top = Vector((0, 0, zs[-1]))
    return me, top


def liana(name, p0, p1, sag=2.0, r=0.03, mat=None, wiggle=0.3, seed=0):
    rnd = random.Random(seed)
    cu = bpy.data.curves.new(name, 'CURVE'); cu.dimensions = '3D'
    sp = cu.splines.new('NURBS'); N = 12; sp.points.add(N - 1)
    for i in range(N):
        t = i / (N - 1)
        p = p0.lerp(p1, t) + Vector((0, 0, -sag * 4 * t * (1 - t)))
        p += Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-0.3, 0.3))) * wiggle * math.sin(t * math.pi)
        sp.points[i].co = (p.x, p.y, p.z, 1)
        sp.points[i].radius = 1.0 - 0.3 * t
    sp.use_endpoint_u = True; sp.order_u = 4
    cu.bevel_mode = 'ROUND'; cu.bevel_depth = r; cu.bevel_resolution = 2; cu.resolution_u = 6
    cu.materials.append(mat or liana_material())
    return bpy.data.objects.new(name, cu)


# ------------------------------------------------------------------ asset sources
_SRC = {}


def ph_objects(asset, names=None, lod='LOD1'):
    """Append Poly Haven objects (prefers given LOD) into a hidden source collection."""
    key = (asset, lod)
    if key in _SRC: return _SRC[key]
    f = f'{PH}{asset}/{asset}_1k.blend'
    with bpy.data.libraries.load(f, link=False) as (src, dst):
        objs = [o for o in src.objects if ('LOD' not in o.lower() or lod.lower() in o.lower()) and 'geometry_nodes' not in o.lower()]
        if names: objs = [o for o in objs if any(n in o for n in names)]
        dst.objects = objs
    col = hidden_collection(f'SRC_{asset}')
    res = []
    for o in dst.objects:
        if o is None or o.type != 'MESH': continue
        col.objects.link(o); o.location = (0, 0, 0); res.append(o)
    _SRC[key] = (col, res)
    return col, res


_PLIB = None


def plant_lib():
    global _PLIB
    if _PLIB: return _PLIB
    with bpy.data.libraries.load(BLEND + 'plants_lib.blend', link=False) as (src, dst):
        dst.collections = [c for c in src.collections if c.startswith('PL_') or c == 'LITTER']
    d = {}
    for c in dst.collections:
        h = hidden_collection('SRC_' + c.name)
        for o in c.objects: h.objects.link(o)
        d[c.name] = h
    _PLIB = d
    return d


def source_collection(name, objs):
    col = hidden_collection(name)
    for o in objs:
        if o.name not in col.objects: col.objects.link(o)
    return col


# ------------------------------------------------------------------ geometry-node scatter
def scatter(name, terrain, col, density, seed, scale=(0.8, 1.2), align=0.0, wind=0.04, wind_speed=0.5,
            zoff=0.0, attr='dens', dens_pow=1.0, min_dist=0.0, tilt=0.15, rot_x=None):
    """Instances children of `col` on terrain, density × named attribute; per-instance wind sway."""
    ng = bpy.data.node_groups.new(name, 'GeometryNodeTree')
    ng.interface.new_socket('Geometry', in_out='INPUT', socket_type='NodeSocketGeometry')
    ng.interface.new_socket('Geometry', in_out='OUTPUT', socket_type='NodeSocketGeometry')
    N = ng.nodes; L = ng.links.new
    gi = N.new('NodeGroupInput'); go = N.new('NodeGroupOutput')
    na = N.new('GeometryNodeInputNamedAttribute'); na.data_type = 'FLOAT'; na.inputs['Name'].default_value = attr
    pw = N.new('ShaderNodeMath'); pw.operation = 'POWER'; pw.inputs[1].default_value = dens_pow; L(na.outputs['Attribute'], pw.inputs[0])
    dp = N.new('GeometryNodeDistributePointsOnFaces')
    if min_dist > 0:
        dp.distribute_method = 'POISSON'; dp.inputs['Distance Min'].default_value = min_dist; dp.inputs['Density Max'].default_value = density
        L(pw.outputs[0], dp.inputs['Density Factor'])
    else:
        mul = N.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'; mul.inputs[1].default_value = density; L(pw.outputs[0], mul.inputs[0])
        L(mul.outputs[0], dp.inputs['Density'])
    dp.inputs['Seed'].default_value = seed
    L(gi.outputs[0], dp.inputs['Mesh'])
    ci = N.new('GeometryNodeCollectionInfo'); ci.inputs['Collection'].default_value = col
    ci.inputs['Separate Children'].default_value = True; ci.inputs['Reset Children'].default_value = True
    io = N.new('GeometryNodeInstanceOnPoints'); io.inputs['Pick Instance'].default_value = True
    L(dp.outputs['Points'], io.inputs['Points']); L(ci.outputs[0], io.inputs['Instance'])
    ri = N.new('FunctionNodeRandomValue'); ri.data_type = 'INT'; ri.inputs['Min'].default_value = 0; ri.inputs['Max'].default_value = 99
    ri.inputs['Seed'].default_value = seed + 1; L(ri.outputs[2], io.inputs['Instance Index'])
    # rotation: random yaw + small random tilt (+ optional alignment to surface normal)
    rz = N.new('FunctionNodeRandomValue'); rz.data_type = 'FLOAT_VECTOR'; rz.inputs['Seed'].default_value = seed + 2
    rz.inputs['Min'].default_value = (-tilt, -tilt, 0); rz.inputs['Max'].default_value = (tilt, tilt, math.tau)
    if rot_x is not None:
        rz.inputs['Min'].default_value = (rot_x[0], -tilt, 0); rz.inputs['Max'].default_value = (rot_x[1], tilt, math.tau)
    if align > 0:
        an = N.new('FunctionNodeAlignEulerToVector'); an.axis = 'Z'; L(dp.outputs['Normal'], an.inputs['Vector']); an.inputs['Factor'].default_value = align
        L(rz.outputs[0], an.inputs['Rotation'])
        L(an.outputs[0], io.inputs['Rotation'])
    else:
        L(rz.outputs[0], io.inputs['Rotation'])
    rs = N.new('FunctionNodeRandomValue'); rs.data_type = 'FLOAT'; rs.inputs[2].default_value = scale[0]; rs.inputs[3].default_value = scale[1]
    rs.inputs['Seed'].default_value = seed + 3; L(rs.outputs[1], io.inputs['Scale'])
    last = io.outputs[0]
    if zoff:
        tr = N.new('GeometryNodeTranslateInstances'); tr.inputs['Translation'].default_value = (0, 0, zoff); L(last, tr.inputs['Instances']); last = tr.outputs[0]
    if wind > 0:
        # sway: rotate each instance about its own pivot by noise(position, time)
        st = N.new('GeometryNodeInputSceneTime')
        pos = N.new('GeometryNodeInputPosition')
        tx = N.new('ShaderNodeTexNoise'); tx.noise_dimensions = '4D'; tx.inputs['Scale'].default_value = 0.15; tx.inputs['Detail'].default_value = 1
        sm = N.new('ShaderNodeMath'); sm.operation = 'MULTIPLY'; sm.inputs[1].default_value = wind_speed; L(st.outputs['Seconds'], sm.inputs[0])
        L(pos.outputs[0], tx.inputs['Vector']); L(sm.outputs[0], tx.inputs['W'])
        sub = N.new('ShaderNodeVectorMath'); sub.operation = 'SUBTRACT'; L(tx.outputs['Color'], sub.inputs[0]); sub.inputs[1].default_value = (0.5, 0.5, 0.5)
        sc = N.new('ShaderNodeVectorMath'); sc.operation = 'MULTIPLY'; L(sub.outputs[0], sc.inputs[0]); sc.inputs[1].default_value = (wind * 2, wind * 2, wind)
        rot = N.new('GeometryNodeRotateInstances'); rot.inputs['Local Space'].default_value = True
        L(last, rot.inputs['Instances']); L(sc.outputs[0], rot.inputs['Rotation']); last = rot.outputs[0]
    L(last, go.inputs[0])
    o = bpy.data.objects.new(name, terrain.data)
    md = o.modifiers.new('scatter', 'NODES'); md.node_group = ng
    o.data.materials  # same mesh: only instances are output so terrain material unused
    return o


def stream_ribbon(pts, width, level, step=0.5):
    """Flat water ribbon along the (densified) stream polyline; UV v follows flow."""
    import numpy as np
    P = [Vector((p[0], p[1], 0)) for p in pts]
    dense = []
    for i in range(len(P) - 1):
        n = max(1, int((P[i + 1] - P[i]).length / step))
        for k in range(n): dense.append(P[i].lerp(P[i + 1], k / n))
    dense.append(P[-1])
    me = bpy.data.meshes.new('ENV_StreamWater'); bm = bmesh.new(); uvl = bm.loops.layers.uv.new('UVMap')
    rows = []; acc = 0
    for i, p in enumerate(dense):
        t = (dense[min(i + 1, len(dense) - 1)] - dense[max(i - 1, 0)]).normalized()
        nrm = Vector((-t.y, t.x, 0))
        if i: acc += (p - dense[i - 1]).length
        rows.append((bm.verts.new(p - nrm * width / 2 + Vector((0, 0, level))), bm.verts.new(p + nrm * width / 2 + Vector((0, 0, level))), acc))
    for i in range(len(rows) - 1):
        a, b, va = rows[i]; c, d, vb = rows[i + 1]
        f = bm.faces.new((a, b, d, c))
        for l, uv in zip(f.loops, [(0, va), (1, va), (1, vb), (0, vb)]): l[uvl].uv = (uv[0] * width, uv[1])
    bm.to_mesh(me); bm.free()
    return bpy.data.objects.new('ENV_StreamWater', me)


# ------------------------------------------------------------------ main builder
def build_env(cfg):
    scn = bpy.context.scene
    envc = bpy.data.collections.new('ENV'); scn.collection.children.link(envc)
    sub = {k: bpy.data.collections.new('ENV_' + k) for k in ('Terrain', 'Trees', 'Vegetation', 'Lianas', 'Water', 'Canopy', 'Light')}
    for c in sub.values(): envc.children.link(c)
    rnd = random.Random(cfg['seed'])
    terrain = build_terrain(cfg); sub['Terrain'].objects.link(terrain)
    bpy.context.view_layer.update()
    cx, cy = cfg['center']; size = cfg['size']
    cam = Vector(cfg.get('cam', (cx, cy, 1.6)))

    def ok_spot(x, y, margin=0.0):
        if cfg.get('stream'):
            d, _ = dist_to_polyline(Vector((x, y)), cfg['stream']['pts'])
            if d < cfg['stream']['width'] * 0.5 + 1.5 + margin: return False
        if cfg.get('path'):
            d, _ = dist_to_polyline(Vector((x, y)), cfg['path']['pts'])
            if d < cfg['path']['width'] * 0.5 + 0.5 + margin: return False
        if cfg.get('river'):
            if y < cfg['river']['y'] + 4 + margin: return False
        for (ex, ey, er) in cfg.get('clear', []):
            if (Vector((x, y)) - Vector((ex, ey))).length < er + margin: return False
        return True

    # ---- giant buttress trees
    mat_bark = bark_material('MAT_Bark_Giant', 'bark_brown_02', (0.85, 0.78, 0.7, 1), moss=0.32, lichen=0.4, scale=0.5)
    giants = list(cfg.get('giants', []))
    tries = 0
    while len(giants) < cfg.get('n_giants', 5) and tries < 400:
        tries += 1
        x = cx + rnd.uniform(-size * 0.45, size * 0.45); y = cy + rnd.uniform(-size * 0.45, size * 0.45)
        if not ok_spot(x, y, 2.5): continue
        if any((Vector((x, y)) - Vector(g[:2])).length < 9 for g in giants): continue
        giants.append((x, y, rnd.uniform(0.8, 1.5)))
    for gi, g in enumerate(giants):
        x, y, Rr = g[0], g[1], g[2]
        me = buttress_trunk(f'TR_Giant_{gi}', R=Rr, H=rnd.uniform(34, 44), fins=rnd.randint(5, 7), fin_len=Rr * rnd.uniform(1.8, 2.8), fin_h=rnd.uniform(3.5, 6), seed=cfg['seed'] * 31 + gi,
                            lean=(rnd.uniform(-0.03, 0.03), rnd.uniform(-0.03, 0.03)))
        me.materials.append(mat_bark)
        o = bpy.data.objects.new(f'TR_Giant_{gi}', me); sub['Trees'].objects.link(o)
        o.location = (x, y, height_at(terrain, x, y)); o.rotation_euler.z = rnd.uniform(0, math.tau)
    # ---- pole trunks (the many thin straight trees)
    mat_pole = bark_material('MAT_Bark_Pole', 'bark_brown_02', (1.15, 1.1, 1.0, 1), moss=0.2, lichen=0.6, scale=1.2)
    mat_pole2 = bark_material('MAT_Bark_Pole2', 'palm_tree_bark', (0.8, 0.75, 0.65, 1), moss=0.2, lichen=0.3, scale=1.0)
    poles = []
    for k in range(cfg.get('n_poles', 40)):
        for _ in range(30):
            x = cx + rnd.uniform(-size * 0.48, size * 0.48); y = cy + rnd.uniform(-size * 0.48, size * 0.48)
            if ok_spot(x, y, 0.3) and all((Vector((x, y)) - Vector(g[:2])).length > g[2] * 3 for g in giants): break
        else: continue
        r = rnd.uniform(0.1, 0.35) if rnd.random() < 0.8 else rnd.uniform(0.35, 0.6)
        H = rnd.uniform(6, 30) if r < 0.25 else rnd.uniform(18, 34)
        me, top = pole_trunk(f'TR_Pole_{k}', r, H, seed=k + cfg['seed'] * 7)
        me.materials.append(rnd.choice([mat_pole, mat_pole, mat_pole2]))
        o = bpy.data.objects.new(f'TR_Pole_{k}', me); sub['Trees'].objects.link(o)
        o.location = (x, y, height_at(terrain, x, y))
        poles.append((o, H, r))
    # ---- understory crowns: palm / shrub crowns on short poles (instanced copies of library plants)
    P = plant_lib()
    crown_cols = [P['PL_Palm_0'], P['PL_Palm_1'], P['PL_Palm_2'], P['PL_Shrub_1']]
    for (o, H, r) in poles:
        if H < 14:
            c = rnd.choice(crown_cols)
            inst = bpy.data.objects.new(o.name + '_crown', None); inst.instance_type = 'COLLECTION'; inst.instance_collection = c
            inst.location = o.location + Vector((0, 0, H - 0.6)); inst.scale = (rnd.uniform(1.8, 3.0),) * 3; inst.rotation_euler.z = rnd.uniform(0, 6.3)
            sub['Canopy'].objects.link(inst)
    # ---- canopy ceiling: large leaf masses high up (shrub/philodendron prototypes scaled up)
    if cfg.get('canopy', True):
        ceil_cols = [P['PL_Shrub_0'], P['PL_Shrub_1'], P['PL_Philodendron_2']]
        for k in range(cfg.get('n_canopy', 70)):
            x = cam.x + rnd.uniform(-35, 35); y = cam.y + rnd.uniform(-35, 35)
            gap = cfg.get('gap')  # optional opening for a sun shaft
            if gap and (Vector((x, y)) - Vector(gap[:2])).length < gap[2]: continue
            inst = bpy.data.objects.new(f'CN_{k}', None); inst.instance_type = 'COLLECTION'; inst.instance_collection = rnd.choice(ceil_cols)
            inst.location = (x, y, rnd.uniform(18, 32)); inst.scale = (rnd.uniform(7, 13),) * 3
            inst.rotation_euler = (rnd.uniform(-0.3, 0.3), rnd.uniform(-0.3, 0.3), rnd.uniform(0, 6.3))
            sub['Canopy'].objects.link(inst)
    # ---- lianas
    lm = liana_material()
    anchors = [Vector((g[0], g[1], 0)) for g in giants] + [p[0].location.copy() for p in poles if p[1] > 15]
    for k in range(cfg.get('n_lianas', 25)):
        if not anchors: break
        a = rnd.choice(anchors)
        top = Vector((a.x + rnd.uniform(-1.5, 1.5), a.y + rnd.uniform(-1.5, 1.5), rnd.uniform(12, 26)))
        if rnd.random() < 0.5:  # hangs to the ground
            gx, gy = top.x + rnd.uniform(-3, 3), top.y + rnd.uniform(-3, 3)
            bot = Vector((gx, gy, height_at(terrain, gx, gy) + rnd.uniform(-0.1, 1.5)))
            ob = liana(f'LI_{k}', top, bot, sag=rnd.uniform(0.0, 1.5), r=rnd.uniform(0.012, 0.045), mat=lm, wiggle=0.5, seed=k)
        else:  # loops between two trees
            near = [b for b in anchors if 2 < (b - a).length < 9]
            if not near: continue
            b = rnd.choice(near)
            bot = Vector((b.x, b.y, rnd.uniform(4, 14)))
            ob = liana(f'LI_{k}', top, bot, sag=rnd.uniform(4, 9), r=rnd.uniform(0.02, 0.06), mat=lm, wiggle=0.5, seed=k)
        sub['Lianas'].objects.link(ob)
    # ---- ground scatter layers
    vegc = sub['Vegetation']
    litc = P['LITTER']
    d = cfg.get('density', 1.0)
    vegc.objects.link(scatter('SC_Litter', terrain, litc, 45 * d * cfg.get('litter', 1.0), cfg['seed'] + 10, (0.8, 1.6), align=1.0, wind=0, tilt=0.4, zoff=0.01, attr='dens_litter', dens_pow=0.5))
    c_fern, _ = ph_objects('fern_02'); c_cal, _ = ph_objects('calathea_orbifolia_01'); c_ant, _ = ph_objects('anthurium_botany_01')
    c_ne, _ = ph_objects('nettle_plant', lod='LOD1'); c_sh, _ = ph_objects('shrub_02', lod='LOD1')
    small = source_collection('SRC_Small', list(c_fern.objects) + list(c_cal.objects) + list(c_ant.objects))
    vegc.objects.link(scatter('SC_Small', terrain, small, 1.1 * d, cfg['seed'] + 11, (0.9, 2.2), align=0.3, wind=0.05))
    vegc.objects.link(scatter('SC_Nettle', terrain, c_ne, 3.0 * d, cfg['seed'] + 15, (2.5, 5.0), align=0.2, wind=0.04))
    mids = source_collection('SRC_Mid', list(P['PL_Philodendron_0'].objects) + list(P['PL_Philodendron_1'].objects) + list(P['PL_Philodendron_2'].objects) +
                             list(P['PL_Heliconia_0'].objects) + list(P['PL_Heliconia_1'].objects) + list(P['PL_Palm_0'].objects) + list(P['PL_Palm_1'].objects))
    vegc.objects.link(scatter('SC_Mid', terrain, mids, 0.30 * d, cfg['seed'] + 12, (0.8, 1.5), align=0.1, wind=0.05, dens_pow=2.0))
    shr = source_collection('SRC_Shrubs', list(P['PL_Shrub_0'].objects) + list(P['PL_Shrub_1'].objects) + list(c_sh.objects))
    vegc.objects.link(scatter('SC_Shrub', terrain, shr, 0.10 * d, cfg['seed'] + 13, (0.9, 1.8), align=0.0, wind=0.04, dens_pow=2.0))
    c_rc, _ = ph_objects('root_cluster_02'); c_bd, _ = ph_objects('bark_debris_01', lod='LOD2'); c_br, _ = ph_objects('dry_branches_medium_01')
    deb = source_collection('SRC_Debris', list(c_rc.objects) + list(c_bd.objects) + list(c_br.objects))
    vegc.objects.link(scatter('SC_Debris', terrain, deb, 0.35 * d, cfg['seed'] + 14, (0.8, 1.4), align=1.0, wind=0, tilt=0.05, zoff=-0.02))
    # ---- big roots & rocks & fallen logs near giants
    c_root1, r1 = ph_objects('root_cluster_01')
    for gi, g in enumerate(giants):
        if rnd.random() < 0.6:
            inst = bpy.data.objects.new(f'RT_{gi}', None); inst.instance_type = 'COLLECTION'; inst.instance_collection = c_root1
            a = rnd.uniform(0, 6.3); rr = g[2] * 2.2
            x, y = g[0] + math.cos(a) * rr, g[1] + math.sin(a) * rr
            inst.location = (x, y, height_at(terrain, x, y) - 0.15); inst.rotation_euler.z = a; inst.scale = (1.2,) * 3
            sub['Trees'].objects.link(inst)
    # ---- water
    if cfg.get('stream'):
        st = cfg['stream']; pts = st['pts']
        cu = bpy.data.curves.new('ENV_StreamCurve', 'CURVE'); cu.dimensions = '3D'
        sp = cu.splines.new('POLY'); sp.points.add(len(pts) - 1)
        for i, p in enumerate(pts): sp.points[i].co = (p[0], p[1], 0, 1)
        cobj = bpy.data.objects.new('ENV_StreamCurve', cu); sub['Water'].objects.link(cobj)
        wp = stream_ribbon(pts, st['width'] + 1.4, st.get('level', -0.45))
        sub['Water'].objects.link(wp)
        wp.data.materials.append(water_material('MAT_Stream', (0.22, 0.15, 0.07, 1), flow=(0, st.get('speed', 0.35)), murk=0.8, wave_scale=1.2, rain=cfg.get('rain_ripples', 0), flow_uv=True))
    if cfg.get('river'):
        bpy.ops.mesh.primitive_plane_add(size=1)
        rp = bpy.context.active_object; rp.name = 'ENV_RiverWater'
        for c in rp.users_collection: c.objects.unlink(rp)
        sub['Water'].objects.link(rp)
        rp.scale = (size * 3, 400, 1); rp.location = (cx, cfg['river']['y'] - 200, cfg['river'].get('level', -0.9))
        rp.data.materials.append(water_material('MAT_River', (0.30, 0.20, 0.09, 1), flow=(0.12, 0.0), murk=0.95, wave_scale=0.8))
    for c in sub.values():
        for o in c.objects:
            o.cycles.use_camera_cull = True
            o.cycles.use_motion_blur = False
    return dict(terrain=terrain, giants=giants, poles=poles, cols=sub)


# ------------------------------------------------------------------ lighting & world
def world_hdri(strength=0.6, rot=0.0, hdri='rainforest_trail_2k.hdr', tint=(1, 1, 1, 1), bg_strength=None):
    w = bpy.data.worlds.new('WORLD'); bpy.context.scene.world = w; w.use_nodes = True
    nt = w.node_tree; L = nt.links.new
    bg = nt.nodes['Background']; bg.inputs[1].default_value = strength
    env = nt.nodes.new('ShaderNodeTexEnvironment'); env.image = bpy.data.images.load(ASSETS + 'hdri/' + hdri, check_existing=True)
    tc = nt.nodes.new('ShaderNodeTexCoord'); mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Rotation'].default_value = (0, 0, rot)
    L(tc.outputs['Generated'], mp.inputs[0]); L(mp.outputs[0], env.inputs[0])
    mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.blend_type = 'MULTIPLY'; mx.inputs[0].default_value = 1
    L(env.outputs[0], S(mx.inputs, 'A')); S(mx.inputs, 'B').default_value = tint
    L(S(mx.outputs, 'Result'), bg.inputs[0])
    return w


def sun(energy=4.0, rot=(0.6, 0.1, 2.2), color=(1.0, 0.92, 0.8), angle=1.5):
    l = bpy.data.lights.new('SUN', 'SUN'); l.energy = energy; l.color = color; l.angle = math.radians(angle)
    o = bpy.data.objects.new('LT_Sun', l); o.rotation_euler = rot
    bpy.context.scene.collection.objects.link(o); return o


def area_light(name, loc, target, energy=100, size=2.0, color=(1, 1, 1), shadow=True):
    l = bpy.data.lights.new(name, 'AREA'); l.energy = energy; l.size = size; l.color = color
    l.cycles.cast_shadow = shadow
    o = bpy.data.objects.new(name, l); o.location = loc; o.rotation_euler = look_at_rot(loc, target)
    bpy.context.scene.collection.objects.link(o); return o


def mist_fog(start=2.0, depth=40.0, color=(0.55, 0.62, 0.55), amount=0.6, glare=True, grade=None):
    """Aerial perspective in the compositor (mist pass) – far cheaper than volumetrics on CPU."""
    s = bpy.context.scene
    s.view_layers[0].use_pass_mist = True
    s.world.mist_settings.start = start; s.world.mist_settings.depth = depth; s.world.mist_settings.falloff = 'QUADRATIC'
    s.use_nodes = True; nt = s.node_tree; nt.nodes.clear(); L = nt.links.new
    rl = nt.nodes.new('CompositorNodeRLayers')
    cur = rl.outputs['Image']
    mx = nt.nodes.new('CompositorNodeMixRGB'); mx.blend_type = 'MIX'
    mm = nt.nodes.new('CompositorNodeMath'); mm.operation = 'MULTIPLY'; mm.inputs[1].default_value = amount
    L(rl.outputs['Mist'], mm.inputs[0]); L(mm.outputs[0], mx.inputs[0]); L(cur, mx.inputs[1]); mx.inputs[2].default_value = (*color, 1)
    cur = mx.outputs[0]
    if glare:
        gl = nt.nodes.new('CompositorNodeGlare'); gl.glare_type = 'FOG_GLOW'; gl.quality = 'MEDIUM'; gl.threshold = 1.2; gl.size = 7
        try: gl.mix = -0.75
        except Exception: pass
        L(cur, gl.inputs[0]); cur = gl.outputs[0]
    # grade: lift/gamma/gain colour balance + vignette
    cb = nt.nodes.new('CompositorNodeColorBalance'); cb.correction_method = 'LIFT_GAMMA_GAIN'
    g = grade or {}
    cb.lift = g.get('lift', (1.0, 1.0, 1.02)); cb.gamma = g.get('gamma', (1.0, 1.0, 1.0)); cb.gain = g.get('gain', (1.03, 1.0, 0.95))
    L(cur, cb.inputs[1]); cur = cb.outputs[0]
    if g.get('sat', 1.0) != 1.0:
        hs = nt.nodes.new('CompositorNodeHueSat'); hs.inputs['Saturation'].default_value = g['sat']; L(cur, hs.inputs['Image']); cur = hs.outputs[0]
    # vignette
    el = nt.nodes.new('CompositorNodeEllipseMask'); el.width = 0.95; el.height = 0.85
    bl = nt.nodes.new('CompositorNodeBlur'); bl.size_x = 200; bl.size_y = 200; bl.use_relative = False
    L(el.outputs[0], bl.inputs[0])
    vm = nt.nodes.new('CompositorNodeMixRGB'); vm.blend_type = 'MULTIPLY'
    vf = nt.nodes.new('CompositorNodeMath'); vf.operation = 'MULTIPLY_ADD'
    L(bl.outputs[0], vf.inputs[0]); vf.inputs[1].default_value = g.get('vignette', 0.35); vf.inputs[2].default_value = 1 - g.get('vignette', 0.35)
    vm.inputs[0].default_value = 1; L(cur, vm.inputs[1]); L(vf.outputs[0], vm.inputs[2]); cur = vm.outputs[0]
    comp = nt.nodes.new('CompositorNodeComposite'); L(cur, comp.inputs[0])
    return nt
