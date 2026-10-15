"""
gkit -- scripted authoring kit for attachments, melee, throwables, wearable gear and loot items (Blender 4.5 headless).

Builds on tools/assets/weapons/wkit.py (profile extrusion with eroded round bevels, lathe, Picatinny rails, the
Cycles mask/colour/normal bake into one PBR set) and adds:
  * more material kinds (fabrics, webbing, camo, paints, plastics, paper, cast iron, glass ...),
  * image decals (labels, stencils, red crosses) through a second UV map named DECAL that is baked into the atlas,
  * raw (unbaked) materials for glass/lenses so code can swap them (kind names starting with '='),
  * free-form geometry helpers: parametric surfaces, sweeps along 3D paths, rounded/soft boxes, modifier stacks,
  * a finish() that writes plain mesh nodes named after their group (or pivot empties for animatable parts),
    puts the root origin anywhere (set_origin) and records bounds/nodes in a meta dict.

Frame (same as wkit "gun coords", millimetres): f = forward (+Z glTF), u = up (+Y glTF), s = the object's RIGHT side
(-X glTF). Mesh helpers that take metres use local (x=f, y=u, z=s).
"""
import bpy, bmesh, math, os, sys, json
from mathutils import Vector, Matrix, noise as mnoise

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'weapons'))
import wkit  # noqa: E402
from wkit import (fillet, arc, circle, rect, mirror_x, bezier, rot_f, rot_s, rot_u, T, MM, G2B, gun2b, srgb, NB,  # noqa
                  L_SIDE, L_FRONT, L_AX_F, L_AX_U, L_AX_S, chaikin)

# ----------------------------------------------------------------------------------------------
# material kinds
# ----------------------------------------------------------------------------------------------
KINDS = dict(wkit.KINDS)
_F = dict(metal=0.0, rvar=0.06, wear_rough=0.9, pat='weave', bump=0.45)
KINDS.update({
    # fabrics (nylon cordura, cotton, webbing)
    'cordura_od':   dict(_F, base='#4e5238', var='#43472f', rough=0.84, wear='#6e705a', wear_amt=0.35),
    'cordura_rg':   dict(_F, base='#5b5a45', var='#4f4e3b', rough=0.84, wear='#77755e', wear_amt=0.35),   # ranger green / khaki
    'cordura_tan':  dict(_F, base='#8c7a5b', var='#7d6b4e', rough=0.86, wear='#a8987a', wear_amt=0.35),
    'cordura_blk':  dict(_F, base='#1c1d1e', var='#232426', rough=0.8, wear='#3a3b3d', wear_amt=0.4),
    'cordura_gry':  dict(_F, base='#3c3e40', var='#333537', rough=0.82, wear='#58595b', wear_amt=0.35),
    'cordura_navy': dict(_F, base='#1b2230', var='#202838', rough=0.82, wear='#384258', wear_amt=0.35),
    'cordura_red':  dict(_F, base='#7a1414', var='#6a1010', rough=0.78, wear='#9a3a34', wear_amt=0.3),
    'cordura_blue': dict(_F, base='#27406a', var='#22385c', rough=0.8, wear='#4a628a', wear_amt=0.3),
    'cordura_brn':  dict(_F, base='#4a3a2a', var='#3e3022', rough=0.85, wear='#6a5a48', wear_amt=0.35),
    'webbing_od':   dict(_F, base='#474a33', var='#3d402b', rough=0.78, wear='#6a6c55', wear_amt=0.25, pat='rib', bump=0.6),
    'webbing_blk':  dict(_F, base='#19191a', var='#202021', rough=0.74, wear='#38393a', wear_amt=0.3, pat='rib', bump=0.6),
    'webbing_tan':  dict(_F, base='#7f6f52', var='#706246', rough=0.8, wear='#9a8c70', wear_amt=0.25, pat='rib', bump=0.6),
    'webbing_gry':  dict(_F, base='#35373a', var='#2d2f31', rough=0.78, wear='#55575a', wear_amt=0.25, pat='rib', bump=0.6),
    'velcro_blk':   dict(_F, base='#202122', var='#252627', rough=0.95, wear='#2a2b2c', wear_amt=0.0, pat='stipple', bump=0.8),
    'elastic_blk':  dict(_F, base='#161616', var='#1c1c1c', rough=0.8, wear='#2a2a2a', wear_amt=0.0, pat='rib', bump=0.7),
    'cotton_wht':   dict(_F, base='#e4e1d8', var='#d6d2c6', rough=0.92, wear='#c8c2b2', wear_amt=0.2, bump=0.6),
    'gauze':        dict(_F, base='#ece9e1', var='#dedad0', rough=0.95, wear='#d2ccbe', wear_amt=0.15, pat='gauze', bump=0.9),
    'rag':          dict(_F, base='#b9ab8c', var='#9a8b6c', rough=0.95, wear='#5a4a36', wear_amt=0.6, bump=0.8),
    'camo_wood':    dict(_F, base='#5d6140', var='#565a3b', rough=0.85, wear='#77785e', wear_amt=0.2, pat='camo', bump=0.45,
                         camo=['#5d6140', '#4a3a28', '#2e3821', '#191917']),
    'nylon_chute':  dict(_F, base='#4b5a3a', var='#45533a', rough=0.6, wear='#5a6a48', wear_amt=0.0, pat='ripstop', bump=0.25),
    'nylon_chute2': dict(_F, base='#c8c6bc', var='#bdbab0', rough=0.6, wear='#d8d6cc', wear_amt=0.0, pat='ripstop', bump=0.25),
    'nylon_navy':   dict(_F, base='#26324f', var='#222d48', rough=0.55, wear='#3a4868', wear_amt=0.0, pat='ripstop', bump=0.2),
    'nylon_white':  dict(_F, base='#cfcfc6', var='#c4c4ba', rough=0.55, wear='#dcdcd4', wear_amt=0.0, pat='ripstop', bump=0.2),
    'nylon_orange': dict(_F, base='#b8521c', var='#a84a18', rough=0.55, wear='#c86a38', wear_amt=0.0, pat='ripstop', bump=0.2),
    'nylon_od':     dict(_F, base='#4a5236', var='#434a30', rough=0.6, wear='#5a6244', wear_amt=0.0, pat='ripstop', bump=0.2),
    'nylon_sand':   dict(_F, base='#a8987a', var='#9c8c6e', rough=0.6, wear='#b8a88a', wear_amt=0.0, pat='ripstop', bump=0.2),
    'cord':         dict(_F, base='#3c3b34', var='#33322c', rough=0.75, wear='#55544c', wear_amt=0.0, pat='rib', bump=0.4),
    # foams, rubber, leather
    'foam':         dict(base='#2a2b2c', var='#242526', metal=0.0, rough=0.96, rvar=0.03, wear='#333435', wear_amt=0.0, wear_rough=0.95, pat='stipple', bump=0.7),
    'leather_blk':  dict(base='#1d1b19', var='#26221f', metal=0.0, rough=0.55, rvar=0.12, wear='#4a4038', wear_amt=0.5, wear_rough=0.45, pat='leather', bump=0.5),
    'leather_brn':  dict(base='#4a2e1c', var='#5a3a24', metal=0.0, rough=0.55, rvar=0.12, wear='#8a6040', wear_amt=0.5, wear_rough=0.45, pat='leather', bump=0.5),
    'rubber_soft':  dict(base='#141414', var='#1a1a1a', metal=0.0, rough=0.9, rvar=0.05, wear='#222222', wear_amt=0.2, wear_rough=0.85, pat='fine', bump=0.3),
    # paints / coatings
    'paint_blk':    dict(base='#1a1b1c', var='#202122', metal=0.0, rough=0.5, rvar=0.10, wear='#7d8085', wear_amt=0.6, wear_rough=0.3, pat='fine', bump=0.15, wear_metal=0.9),
    'paint_od2':    dict(base='#3d4230', var='#363a29', metal=0.0, rough=0.7, rvar=0.10, wear='#6d6f62', wear_amt=0.45, wear_rough=0.55, pat='stipple', bump=0.5, wear_metal=0.0),
    'paint_olive':  dict(base='#4b4f33', var='#43472d', metal=0.0, rough=0.66, rvar=0.10, wear='#7d8085', wear_amt=0.8, wear_rough=0.3, pat='fine', bump=0.25, wear_metal=0.9),
    'paint_green':  dict(base='#3f4a2e', var='#384228', metal=0.0, rough=0.55, rvar=0.10, wear='#8a8d90', wear_amt=0.9, wear_rough=0.3, pat='fine', bump=0.2, wear_metal=0.9),
    'paint_sand':   dict(base='#9a8a68', var='#8c7c5c', metal=0.0, rough=0.62, rvar=0.10, wear='#8a8d90', wear_amt=0.7, wear_rough=0.35, pat='fine', bump=0.2, wear_metal=0.9),
    'paint_blue':   dict(base='#2b3f5c', var='#253752', metal=0.0, rough=0.5, rvar=0.10, wear='#8a8d90', wear_amt=0.8, wear_rough=0.3, pat='fine', bump=0.15, wear_metal=0.9),
    'paint_red':    dict(base='#8c1712', var='#7a130f', metal=0.0, rough=0.45, rvar=0.10, wear='#8a8d90', wear_amt=0.7, wear_rough=0.3, pat='fine', bump=0.15, wear_metal=0.9),
    'paint_yel':    dict(base='#b8901c', var='#a88218', metal=0.0, rough=0.5, rvar=0.08, wear='#8a8d90', wear_amt=0.7, wear_rough=0.3, pat='fine', bump=0.15, wear_metal=0.9),
    'gloss_blk':    dict(base='#141516', var='#18191a', metal=0.0, rough=0.18, rvar=0.05, wear='#3a3b3c', wear_amt=0.35, wear_rough=0.4, pat='none', bump=0.05),
    'gloss_red':    dict(base='#6d0f0d', var='#5f0d0b', metal=0.0, rough=0.2, rvar=0.05, wear='#a0a0a0', wear_amt=0.3, wear_rough=0.4, pat='none', bump=0.05),
    'gloss_wht':    dict(base='#d8d8d4', var='#cfcfca', metal=0.0, rough=0.22, rvar=0.05, wear='#a0a0a0', wear_amt=0.2, wear_rough=0.4, pat='none', bump=0.05),
    # plastics
    'plastic_wht':  dict(base='#d9d8d2', var='#cfcec7', metal=0.0, rough=0.42, rvar=0.08, wear='#b8b6ae', wear_amt=0.35, wear_rough=0.55, pat='fine', bump=0.1),
    'plastic_red':  dict(base='#a3201a', var='#931c16', metal=0.0, rough=0.4, rvar=0.08, wear='#b8584e', wear_amt=0.3, wear_rough=0.55, pat='fine', bump=0.1),
    'plastic_org':  dict(base='#c4561a', var='#b44e16', metal=0.0, rough=0.36, rvar=0.06, wear='#d07a48', wear_amt=0.2, wear_rough=0.5, pat='fine', bump=0.08),
    'plastic_yel':  dict(base='#d7a51c', var='#c99a18', metal=0.0, rough=0.38, rvar=0.06, wear='#e0c060', wear_amt=0.2, wear_rough=0.5, pat='fine', bump=0.08),
    'plastic_blk':  dict(base='#1b1b1c', var='#202021', metal=0.0, rough=0.45, rvar=0.08, wear='#3a3a3b', wear_amt=0.3, wear_rough=0.55, pat='fine', bump=0.1),
    'plastic_gry':  dict(base='#5d6064', var='#55585c', metal=0.0, rough=0.45, rvar=0.08, wear='#7a7d80', wear_amt=0.3, wear_rough=0.55, pat='fine', bump=0.1),
    'plastic_blue': dict(base='#2a5d9a', var='#26558e', metal=0.0, rough=0.38, rvar=0.06, wear='#5a8ac0', wear_amt=0.2, wear_rough=0.5, pat='fine', bump=0.08),
    # paper / cardboard
    'cardboard':    dict(base='#a68a62', var='#987c56', metal=0.0, rough=0.88, rvar=0.05, wear='#c0aa88', wear_amt=0.5, wear_rough=0.9, pat='paper', bump=0.3),
    'card_wht':     dict(base='#e6e2d6', var='#dcd7c8', metal=0.0, rough=0.7, rvar=0.05, wear='#c4bca8', wear_amt=0.4, wear_rough=0.85, pat='paper', bump=0.2),
    'card_print':   dict(base='#e6e2d6', var='#dcd7c8', metal=0.0, rough=0.5, rvar=0.05, wear='#d8d0bc', wear_amt=0.35, wear_rough=0.8, pat='paper', bump=0.15),
    # metals
    'alu':          dict(base='#a9abad', var='#9c9ea0', metal=1.0, rough=0.3, rvar=0.06, wear='#c8c9ca', wear_amt=0.2, wear_rough=0.2, pat='brushed', bump=0.08),
    'alu_print':    dict(base='#a9abad', var='#9c9ea0', metal=1.0, rough=0.28, rvar=0.05, wear='#c8c9ca', wear_amt=0.25, wear_rough=0.2, pat='none', bump=0.04),
    'zinc':         dict(base='#8d9094', var='#80838a', metal=1.0, rough=0.42, rvar=0.10, wear='#b2b4b8', wear_amt=0.3, wear_rough=0.3, pat='fine', bump=0.1),
    'cast_iron':    dict(base='#1f1f1f', var='#2a2826', metal=0.55, rough=0.62, rvar=0.10, wear='#6d6a66', wear_amt=0.8, wear_rough=0.35, pat='cast', bump=0.6, wear_metal=0.9),
    'blade':        dict(base='#5a5c5e', var='#4a4b4c', metal=1.0, rough=0.42, rvar=0.12, wear='#b5b7ba', wear_amt=1.0, wear_rough=0.2, pat='brushed', bump=0.2),
    'rusty':        dict(base='#4a3a30', var='#6b3a20', metal=0.5, rough=0.7, rvar=0.15, wear='#8a8a8a', wear_amt=0.8, wear_rough=0.35, pat='cast', bump=0.5, wear_metal=1.0),
    'plywood':      dict(base='#9a7a50', var='#86683f', metal=0.0, rough=0.7, rvar=0.10, wear='#b39a72', wear_amt=0.5, wear_rough=0.75, pat='wood', bump=0.3),
    'wood_handle':  dict(base='#6a4628', var='#7d5532', metal=0.0, rough=0.55, rvar=0.12, wear='#9a7048', wear_amt=0.6, wear_rough=0.6, pat='wood', bump=0.3),
    'glass_dark':   dict(base='#0b0d0e', var='#0b0d0e', metal=0.0, rough=0.06, rvar=0.02, wear='#0b0d0e', wear_amt=0.0, wear_rough=0.06, pat='none', bump=0.0),
})

# raw (unbaked) materials, used by kinds '=name'
RAW = {
    'lens':        dict(base='#081210', rough=0.03, metal=0.0, alpha=1.0, spec=0.9),          # coated objective / ocular glass
    'lens_amber':  dict(base='#1a1206', rough=0.03, metal=0.0, alpha=1.0, spec=0.9),
    'window':      dict(base='#0c1418', rough=0.03, metal=0.0, alpha=0.35, spec=1.0),         # reflex window (see-through)
    'glass_clear': dict(base='#c8d4d0', rough=0.05, metal=0.0, alpha=0.32, spec=1.0),
    'glass_brown': dict(base='#3a1c08', rough=0.05, metal=0.0, alpha=0.78, spec=1.0),
    'glass_green': dict(base='#173018', rough=0.05, metal=0.0, alpha=0.8, spec=1.0),
    'liquid_fuel': dict(base='#7a4a10', rough=0.08, metal=0.0, alpha=0.9, spec=0.6),
    'liquid_yel':  dict(base='#c8a020', rough=0.1, metal=0.0, alpha=0.9, spec=0.6),
    'emit_red':    dict(base='#ff2010', rough=0.4, metal=0.0, alpha=1.0, emit='#ff2010', emit_k=6.0),
    'line':        dict(base='#2e2d29', rough=0.75, metal=0.0, alpha=1.0, spec=0.3),
    'reflector':   dict(base='#d0d0c8', rough=0.25, metal=0.9, alpha=1.0, spec=0.5),
}


class _RawMat:
    pass


def make_raw_material(name):
    p = RAW[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bs = m.node_tree.nodes['Principled BSDF']
    bs.inputs['Base Color'].default_value = srgb(p['base'])
    bs.inputs['Roughness'].default_value = p['rough']
    bs.inputs['Metallic'].default_value = p['metal']
    if 'spec' in p:
        bs.inputs['Specular IOR Level'].default_value = p['spec'] * 0.5 + 0.25
    m.use_backface_culling = False
    if p.get('alpha', 1.0) < 1.0:
        bs.inputs['Alpha'].default_value = p['alpha']
        m.surface_render_method = 'BLENDED'
    if p.get('emit'):
        bs.inputs['Emission Color'].default_value = srgb(p['emit'])
        bs.inputs['Emission Strength'].default_value = p.get('emit_k', 1.0)
    m['raw'] = name
    return m


def make_material(kind, mask_img, ms=1.0, decal=None, wear=1.0):
    """Procedural PBR material in the wkit style (baked later). ms scales the mask distances (bevel radius, AO).
    decal = dict(img=path, rough=None|float, metal=None|float, strength=1) -> image on UV map 'DECAL' mixed over colour."""
    base_kind = kind.split('@')[0].rstrip('!')
    k = dict(KINDS[base_kind])
    if kind.split('@')[0].endswith('!'):
        k['wear_amt'] *= 0.15
    k['wear_amt'] *= wear
    mat = bpy.data.materials.new('K_' + kind)
    mat.use_nodes = True
    nb = NB(mat)
    for nd in list(nb.N):
        nb.N.remove(nd)
    out = nb.n('ShaderNodeOutputMaterial'); out.name = 'OUT'
    bsdf = nb.n('ShaderNodeBsdfPrincipled'); bsdf.name = 'BSDF'
    emit = nb.n('ShaderNodeEmission'); emit.name = 'EMIT'
    tc = nb.n('ShaderNodeTexCoord')
    obj = tc.outputs['Object']
    # live masks (used by the mask bake)
    bev = nb.n('ShaderNodeBevel'); bev.samples = 8; bev.inputs['Radius'].default_value = 0.0022 * ms
    geo = nb.n('ShaderNodeNewGeometry')
    dot = nb.n('ShaderNodeVectorMath', operation='DOT_PRODUCT')
    nb.link(bev.outputs['Normal'], dot.inputs[0]); nb.link(geo.outputs['Normal'], dot.inputs[1])
    edge_bev = nb.ramp(nb.math('SUBTRACT', 1.0, dot.outputs['Value']), 0.004, 0.08)
    aoi = nb.n('ShaderNodeAmbientOcclusion'); aoi.samples = 16; aoi.inside = True; aoi.only_local = True
    aoi.inputs['Distance'].default_value = 0.0035 * ms
    edge_ao = nb.ramp(nb.math('SUBTRACT', 1.0, aoi.outputs['AO']), 0.1, 0.42)
    edge_live = nb.math('MAXIMUM', edge_bev, edge_ao)
    ao = nb.n('ShaderNodeAmbientOcclusion'); ao.samples = 16; ao.inputs['Distance'].default_value = 0.025 * ms
    comb = nb.n('ShaderNodeCombineColor'); comb.name = 'MASK_LIVE'
    nb.link(edge_live, comb.inputs[0]); nb.link(ao.outputs['AO'], comb.inputs[1])
    mt = nb.n('ShaderNodeTexImage'); mt.image = mask_img; mt.name = 'MASK_TEX'; mt.interpolation = 'Linear'
    sep = nb.n('ShaderNodeSeparateColor'); nb.link(mt.outputs['Color'], sep.inputs[0])
    edge = sep.outputs[0]; aom = sep.outputs[1]
    base = srgb(k['base']); var = srgb(k['var']); wearc = srgb(k['wear'])
    n1 = nb.noise(obj, 9.0, 5.0, 0.6)
    n2 = nb.noise(obj, 60.0, 6.0, 0.6)
    n3 = nb.noise(obj, 220.0, 3.0, 0.5)
    pat = k['pat']
    if pat == 'wood':
        pw = nb.mapscale(obj, 1.0, 0.045, 1.0)
        dist = nb.n('ShaderNodeTexNoise', noise_dimensions='3D'); nb.link(obj, dist.inputs['Vector'])
        dist.inputs['Scale'].default_value = 14.0; dist.inputs['Detail'].default_value = 3.0
        pwd = nb.n('ShaderNodeVectorMath', operation='ADD'); nb.link(pw, pwd.inputs[0])
        sc = nb.n('ShaderNodeVectorMath', operation='SCALE'); nb.link(dist.outputs['Color'], sc.inputs[0]); sc.inputs['Scale'].default_value = 0.006
        nb.link(sc.outputs[0], pwd.inputs[1])
        wv = nb.n('ShaderNodeTexWave', wave_type='RINGS', rings_direction='Y', wave_profile='SAW')
        nb.link(pwd.outputs[0], wv.inputs['Vector'])
        wv.inputs['Scale'].default_value = 95.0; wv.inputs['Distortion'].default_value = 2.5
        wv.inputs['Detail'].default_value = 2.0; wv.inputs['Detail Scale'].default_value = 1.2
        lines = nb.ramp(wv.outputs['Fac'], 0.72, 1.0)
        figure = nb.noise(nb.mapscale(obj, 1.0, 0.25, 1.0), 18.0, 4.0, 0.6)
        pores = nb.noise(nb.mapscale(obj, 1.0, 0.04, 1.0), 900.0, 1.0, 0.5)
        col = nb.mix(nb.ramp(figure, 0.3, 0.75), base, var)
        col = nb.mix(nb.math('MULTIPLY', lines, 0.45), col, nb.mul_rgb(col, srgb('#6a5040')))
        col = nb.mix(nb.math('MULTIPLY', nb.ramp(pores, 0.55, 0.8), 0.25), col, nb.mul_rgb(col, srgb('#80705f')))
        bump_h = nb.math('ADD', nb.math('MULTIPLY', lines, 0.5), nb.math('MULTIPLY', pores, 0.5))
    else:
        col = nb.mix(nb.ramp(n1, 0.25, 0.75), base, var)
        col = nb.mix(nb.math('MULTIPLY', nb.ramp(n2, 0.4, 0.75), 0.5), col, var)
        col = nb.mix(nb.math('MULTIPLY', nb.ramp(n3, 0.55, 0.8), 0.25), col, nb.mul_rgb(col, srgb('#b8b0a4')))
        if pat == 'camo':
            cs = [srgb(c) for c in k['camo']]
            # woodland: large horizontal-ish blotches of brown and green, then thin black branches
            v1 = nb.mapscale(obj, 1.0, 1.8, 1.0)
            b1 = nb.noise(v1, 11.0, 3.0, 0.55)
            b2 = nb.noise(nb.mapscale(obj, 1.3, 1.6, 1.1), 9.0, 3.0, 0.55)
            b3 = nb.noise(nb.mapscale(obj, 0.8, 2.6, 0.9), 16.0, 2.0, 0.5)
            col = nb.mix(nb.ramp(b1, 0.53, 0.56), cs[0], cs[1])
            col = nb.mix(nb.ramp(b2, 0.55, 0.58), col, cs[2])
            col = nb.mix(nb.ramp(b3, 0.62, 0.645), col, cs[3])
            col = nb.mix(nb.math('MULTIPLY', nb.ramp(n2, 0.4, 0.75), 0.15), col, nb.mul_rgb(col, srgb('#b8b0a4')))
        if pat == 'stipple':
            bump_h = nb.noise(obj, 1400.0, 1.0, 0.5)
        elif pat == 'brushed':
            bump_h = nb.noise(nb.mapscale(obj, 30.0, 0.6, 30.0), 120.0, 2.0, 0.5)
        elif pat == 'fine':
            bump_h = nb.math('ADD', nb.math('MULTIPLY', nb.noise(obj, 900.0, 2.0, 0.5), 0.7), nb.math('MULTIPLY', n3, 0.3))
        elif pat in ('weave', 'camo', 'ripstop', 'gauze'):
            fib = nb.noise(obj, 1800.0, 1.0, 0.5)
            slub = nb.noise(nb.mapscale(obj, 1.0, 12.0, 1.0), 260.0, 2.0, 0.5)
            bump_h = nb.math('ADD', nb.math('MULTIPLY', fib, 0.55), nb.math('MULTIPLY', slub, 0.45))
            if pat == 'gauze':
                wv = nb.n('ShaderNodeTexWave', wave_type='BANDS', bands_direction='Z')
                nb.link(obj, wv.inputs['Vector']); wv.inputs['Scale'].default_value = 700.0
                bump_h = nb.math('ADD', bump_h, nb.math('MULTIPLY', wv.outputs['Fac'], 0.6))
        elif pat == 'rib':
            # rib structure of webbing: fine bands in every direction (no strap direction known), fibre noise
            wv = nb.n('ShaderNodeTexWave', wave_type='BANDS', bands_direction='DIAGONAL', wave_profile='SIN')
            nb.link(obj, wv.inputs['Vector']); wv.inputs['Scale'].default_value = 900.0
            wv.inputs['Distortion'].default_value = 3.0
            bump_h = nb.math('ADD', nb.math('MULTIPLY', wv.outputs['Fac'], 0.5), nb.math('MULTIPLY', nb.noise(obj, 1600.0, 1.0, 0.5), 0.5))
        elif pat == 'cast':
            pits = nb.noise(obj, 700.0, 3.0, 0.7)
            bump_h = nb.math('ADD', nb.math('MULTIPLY', pits, 0.8), nb.math('MULTIPLY', n3, 0.2))
        elif pat == 'leather':
            vor = nb.n('ShaderNodeTexVoronoi', feature='DISTANCE_TO_EDGE')
            nb.link(obj, vor.inputs['Vector']); vor.inputs['Scale'].default_value = 900.0
            bump_h = nb.math('ADD', nb.ramp(vor.outputs['Distance'], 0.0, 0.12), nb.math('MULTIPLY', n3, 0.3))
        elif pat == 'paper':
            bump_h = nb.math('ADD', nb.math('MULTIPLY', nb.noise(obj, 1200.0, 2.0, 0.6), 0.6), nb.math('MULTIPLY', n3, 0.4))
        else:
            bump_h = n3
    # wear on convex edges, broken up by noise
    convex = nb.math('MULTIPLY', edge, nb.ramp(aom, 0.55, 0.95))
    brk = nb.ramp(nb.noise(obj, 140.0, 4.0, 0.65), 0.38, 0.62)
    wear = nb.math('MULTIPLY', convex, nb.math('ADD', nb.math('MULTIPLY', brk, 0.65), 0.35))
    wear = nb.math('MULTIPLY', nb.ramp(wear, 0.1, 0.45), k['wear_amt'] * 0.85)
    rough = nb.math('ADD', k['rough'], nb.math('MULTIPLY', nb.math('SUBTRACT', n2, 0.5), k['rvar'] * 2))
    metal = k['metal']
    # decal (printed label / stencil) under the wear
    if decal:
        uvn = nb.n('ShaderNodeUVMap'); uvn.uv_map = 'DECAL'
        im = nb.n('ShaderNodeTexImage'); im.image = bpy.data.images.load(decal['img'], check_existing=True)
        im.extension = 'CLIP'; im.interpolation = 'Cubic'
        nb.link(uvn.outputs['UV'], im.inputs['Vector'])
        da = nb.math('MULTIPLY', im.outputs['Alpha'], decal.get('strength', 1.0))
        if decal.get('weather', 0.0) > 0:
            # stencil paint wear: break up the decal with noise
            wn = nb.ramp(nb.noise(obj, 180.0, 4.0, 0.6), 0.3, 0.5)
            da = nb.math('MULTIPLY', da, nb.mixf(decal['weather'], 1.0, wn))
        col = nb.mix(da, col, im.outputs['Color'])
        if decal.get('rough') is not None:
            rough = nb.mixf(da, rough, decal['rough'])
        if decal.get('metal') is not None:
            metal = nb.mixf(da, metal, decal['metal'])
    col = nb.mix(wear, col, wearc)
    cav = nb.math('SUBTRACT', 1.0, aom)
    col = nb.mix(nb.math('MULTIPLY', cav, 0.55, clamp=True), col, nb.mul_rgb(col, srgb('#3a3632')))
    col_out = col
    rough = nb.mixf(wear, rough, k['wear_rough'])
    rough = nb.math('ADD', rough, nb.math('MULTIPLY', cav, 0.15), clamp=True)
    wm = k.get('wear_metal', max(k['metal'], 0.0 if k['metal'] < 0.01 else 1.0))
    metal = nb.mixf(wear, metal, wm)
    bump = nb.n('ShaderNodeBump'); bump.inputs['Strength'].default_value = k['bump']; bump.inputs['Distance'].default_value = 0.0004
    nb.link(bump_h, bump.inputs['Height']); nb.link(bev.outputs['Normal'], bump.inputs['Normal'])
    nb.link(bump.outputs['Normal'], bsdf.inputs['Normal'])
    nb._in(bsdf.inputs['Base Color'], col_out); nb._in(bsdf.inputs['Roughness'], rough); nb._in(bsdf.inputs['Metallic'], metal)
    nb.link(bsdf.outputs[0], out.inputs['Surface'])
    mat['kind'] = kind
    if isinstance(metal, float):
        metal = nb.math('ADD', metal, 0.0)
    st = {'col': col_out, 'rough': rough, 'metal': metal, 'mask': comb.outputs[0]}
    return mat, st


# ----------------------------------------------------------------------------------------------
# free-form mesh helpers (metres, local x=f, y=u, z=s)
# ----------------------------------------------------------------------------------------------
def mesh_from_pydata(verts, faces, name='m'):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], [tuple(f) for f in faces])
    me.validate(clean_customdata=False)
    me.update()
    return me


def grid_surface(fn, nu, nv, wrap_u=False, wrap_v=False, cap_v0=False, cap_v1=False, name='surf'):
    """fn(i/nu, j/nv) -> (x, y, z) metres. Quads; wrap closes the grid. cap_* closes a ring with a fan (pole)."""
    cu = nu if wrap_u else nu + 1
    cv = nv if wrap_v else nv + 1
    verts = []
    for j in range(cv):
        for i in range(cu):
            verts.append(fn(i / nu, j / nv))
    faces = []
    for j in range(nv if not wrap_v else nv):
        j2 = (j + 1) % cv if wrap_v else j + 1
        if j2 >= cv: continue
        for i in range(nu):
            i2 = (i + 1) % cu if wrap_u else i + 1
            if i2 >= cu: continue
            faces.append((j * cu + i, j * cu + i2, j2 * cu + i2, j2 * cu + i))
    if cap_v0:
        c = len(verts); verts.append(tuple(sum(verts[i][a] for i in range(cu)) / cu for a in range(3)))
        for i in range(cu if wrap_u else cu - 1):
            faces.append((c, (i + 1) % cu, i))
    if cap_v1:
        c = len(verts); base = (cv - 1) * cu
        verts.append(tuple(sum(verts[base + i][a] for i in range(cu)) / cu for a in range(3)))
        for i in range(cu if wrap_u else cu - 1):
            faces.append((c, base + i, base + (i + 1) % cu))
    me = mesh_from_pydata(verts, faces, name)
    return me


def apply_mods(me, mods, keep=False):
    """Run a modifier stack on a mesh and return the evaluated mesh. mods = [(TYPE, {attr: value}), ...]
    DISPLACE accepts 'tex' = dict(type='CLOUDS'|'VORONOI'|..., size=..., depth=...)."""
    ob = bpy.data.objects.new('tmp_mod', me)
    bpy.context.scene.collection.objects.link(ob)
    for (t, kw) in mods:
        kw = dict(kw)
        m = ob.modifiers.new(t.lower(), t)
        tex = kw.pop('tex', None)
        if tex:
            tx = bpy.data.textures.new('tx', tex.pop('type', 'CLOUDS'))
            for a, v in tex.items():
                setattr(tx, a, v)
            m.texture = tx
            m.texture_coords = kw.pop('texture_coords', 'GLOBAL')
        for a, v in kw.items():
            setattr(m, a, v)
    dg = bpy.context.evaluated_depsgraph_get()
    me2 = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    bpy.data.objects.remove(ob)
    if not keep:
        try: bpy.data.meshes.remove(me)
        except Exception: pass
    return me2


def rotation_minimizing_frames(path):
    """parallel-transport frames along a 3D polyline (list of Vector) -> list of (t, n, b)."""
    P = [Vector(p) for p in path]
    n = len(P)
    Ts = []
    for i in range(n):
        if i == 0: t = P[1] - P[0]
        elif i == n - 1: t = P[-1] - P[-2]
        else: t = (P[i + 1] - P[i - 1])
        Ts.append(t.normalized())
    # initial normal: any vector perpendicular to t0, preferring world +y (up)
    up = Vector((0, 1, 0))
    if abs(Ts[0].dot(up)) > 0.9: up = Vector((1, 0, 0))
    N = (up - Ts[0] * up.dot(Ts[0])).normalized()
    frames = []
    for i in range(n):
        if i > 0:
            # rotate N from T[i-1] to T[i]
            a = Ts[i - 1].cross(Ts[i])
            if a.length > 1e-9:
                ang = math.asin(max(-1.0, min(1.0, a.length)))
                if Ts[i - 1].dot(Ts[i]) < 0: ang = math.pi - ang
                N = Matrix.Rotation(ang, 3, a.normalized()) @ N
            N = (N - Ts[i] * N.dot(Ts[i])).normalized()
        B = Ts[i].cross(N)
        frames.append((Ts[i], N, B))
    return frames


def sweep(path, profile, closed_profile=True, closed_path=False, up=None, cap=True, twist=None, scale=None, name='sweep'):
    """Sweep a 2D profile [(a, b)] (metres; a along the frame normal N, b along binormal B) along a 3D path (metres).
    up: optional fixed reference vector (e.g. a strap lying on a surface: up = surface normal per point (list) or one vector).
    scale: optional per-point scale list."""
    P = [Vector(p) for p in path]
    if up is not None:
        frames = []
        for i in range(len(P)):
            if i == 0: t = P[1] - P[0]
            elif i == len(P) - 1: t = P[-1] - P[-2]
            else: t = P[i + 1] - P[i - 1]
            t.normalize()
            u = Vector(up[i]) if isinstance(up, (list, tuple)) and len(up) == len(P) and hasattr(up[0], '__len__') else Vector(up)
            nrm = (u - t * u.dot(t))
            if nrm.length < 1e-9: nrm = Vector((0, 1, 0))
            nrm.normalize()
            frames.append((t, nrm, t.cross(nrm)))
    else:
        frames = rotation_minimizing_frames(P)
    verts = []; faces = []
    m = len(profile)
    for i, (p, (t, nrm, b)) in enumerate(zip(P, frames)):
        sc = scale[i] if scale else 1.0
        tw = twist[i] if twist else 0.0
        ca, sa = math.cos(tw), math.sin(tw)
        for (a, bb) in profile:
            a2 = (a * ca - bb * sa) * sc; b2 = (a * sa + bb * ca) * sc
            verts.append(tuple(p + nrm * a2 + b * b2))
    npth = len(P)
    rng = range(npth if closed_path else npth - 1)
    for i in rng:
        i2 = (i + 1) % npth
        for j in range(m if closed_profile else m - 1):
            j2 = (j + 1) % m
            faces.append((i * m + j, i * m + j2, i2 * m + j2, i2 * m + j))
    if cap and closed_profile and not closed_path:
        faces.append(tuple(reversed(range(m))))
        faces.append(tuple((npth - 1) * m + j for j in range(m)))
    me = mesh_from_pydata(verts, faces, name)
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    return me


def rbox_mesh(sx, sy, sz, r, seg=3, center=(0, 0, 0)):
    """rounded box (metres) of full size sx, sy, sz with edge radius r."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * sx, v.co.y * sy, v.co.z * sz))
    if r > 0:
        r = min(r, sx / 2 * 0.99, sy / 2 * 0.99, sz / 2 * 0.99)
        bmesh.ops.bevel(bm, geom=list(bm.edges) + list(bm.verts), offset=r, segments=seg, profile=0.5, affect='EDGES', clamp_overlap=True)
    for v in bm.verts:
        v.co += Vector(center)
    me = bpy.data.meshes.new('rbox'); bm.to_mesh(me); bm.free()
    return me


def soft_box(sx, sy, sz, r, puff=0.0, wrinkle=0.0, wscale=0.03, seed=0, subd=2, center=(0, 0, 0), taper_top=0.0):
    """Fabric pouch: rounded box, subdivided, faces inflated by `puff` (m) and wrinkled by noise of amplitude `wrinkle`.
    taper_top shrinks the top (+y) in x/z by that fraction."""
    me = rbox_mesh(sx, sy, sz, r, seg=2)
    me = apply_mods(me, [('SUBSURF', dict(levels=subd, render_levels=subd))])
    hx, hy, hz = sx / 2, sy / 2, sz / 2
    off = Vector((seed * 1.37, seed * 2.11, seed * 0.73))
    for v in me.vertices:
        p = v.co.copy()
        # inflate: push along normal-ish direction proportional to distance from the edges
        if puff:
            fx = max(0.0, 1 - (abs(p.x) / hx) ** 4); fy = max(0.0, 1 - (abs(p.y) / hy) ** 4); fz = max(0.0, 1 - (abs(p.z) / hz) ** 4)
            d = Vector((p.x / hx * fy * fz, p.y / hy * fx * fz, p.z / hz * fx * fy))
            p += Vector((d.x * puff * 0.6, d.y * puff * 0.3, d.z * puff))
        if wrinkle:
            q = p / wscale + off
            n = mnoise.noise_vector(q)
            p += Vector(n) * wrinkle
        if taper_top:
            t = (p.y + hy) / (2 * hy)
            k = 1 - taper_top * t
            p.x *= k; p.z *= k
        v.co = p + Vector(center)
    return me


def blade_mesh(spine, edge, t_spine, t_edge, n_across=4, grind=0.45):
    """Solid blade between a spine polyline and an edge polyline (lists of (f, u) in mm, same length), lateral
    thickness t_spine at the spine falling to t_edge at the edge; the last `grind` fraction is the sharpening bevel.
    Returns a mesh in metres, local (x=f, y=u, z=s)."""
    n = len(spine)
    verts = []; faces = []
    def th(w):
        if w < 1 - grind: return t_spine * (1 - 0.25 * w / max(1e-6, 1 - grind))
        k = (w - (1 - grind)) / grind
        return t_spine * 0.75 * (1 - k) + t_edge * k
    rows = []
    for i in range(n):
        row = []
        for j in range(n_across + 1):
            w = j / n_across
            f = spine[i][0] * (1 - w) + edge[i][0] * w; u = spine[i][1] * (1 - w) + edge[i][1] * w
            t = th(w) / 2
            row.append((len(verts), len(verts) + 1))
            verts.append((f * MM, u * MM, t * MM)); verts.append((f * MM, u * MM, -t * MM))
        rows.append(row)
    for i in range(n - 1):
        for j in range(n_across):
            a, b, c, d = rows[i][j], rows[i][j + 1], rows[i + 1][j + 1], rows[i + 1][j]
            faces.append((a[0], b[0], c[0], d[0])); faces.append((d[1], c[1], b[1], a[1]))
        # spine strip and edge strip
        a, d = rows[i][0], rows[i + 1][0]
        faces.append((a[1], a[0], d[0], d[1]))
        b, c = rows[i][n_across], rows[i + 1][n_across]
        faces.append((b[0], b[1], c[1], c[0]))
    for i in (0, n - 1):
        r = rows[i]
        ring = [r[j][0] for j in range(n_across + 1)] + [r[j][1] for j in reversed(range(n_across + 1))]
        faces.append(tuple(ring) if i == n - 1 else tuple(reversed(ring)))
    me = mesh_from_pydata(verts, faces, 'blade')
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-7)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    return me


def torus_mesh(R, r, seg=32, ring=8):
    """torus in metres around local x axis (ring in the y-z plane), radii in mm."""
    def fn(a, b):
        A = a * 2 * math.pi; B = b * 2 * math.pi
        rr = R + r * math.cos(B)
        return (r * math.sin(B) * MM, rr * math.cos(A) * MM, rr * math.sin(A) * MM)
    return grid_surface(fn, seg, ring, wrap_u=True, wrap_v=True)


def lathe_mesh(profile, segs=24, a0=0.0, a1=360.0):
    return wkit._lathe_mesh(profile, segs, False, True, True, a0, a1)


def smooth_polyline(pts, n=1):
    out = [Vector(p) for p in pts]
    for _ in range(n):
        new = [out[0]]
        for a, b in zip(out, out[1:]):
            new.append(a * 0.75 + b * 0.25); new.append(a * 0.25 + b * 0.75)
        new.append(out[-1])
        out = new
    return out


def catmull(pts, n=8, closed=False):
    """Catmull-Rom spline through points (Vectors/tuples) -> dense list of Vectors."""
    P = [Vector(p) for p in pts]
    if closed: P = [P[-1]] + P + [P[0], P[1]]
    else: P = [P[0] + (P[0] - P[1])] + P + [P[-1] + (P[-1] - P[-2])]
    out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for k in range(n):
            t = k / n
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    if not closed: out.append(P[-2])
    return out


# ----------------------------------------------------------------------------------------------
# Kit
# ----------------------------------------------------------------------------------------------
class Kit(wkit.Gun):
    def __init__(self, aid, work=None):
        super().__init__(aid)
        self.wear = 1.0               # edge-wear multiplier
        self.ms = 1.0                 # mask distance scale (bevel radius / AO), raise for big soft objects
        self.raw_mats = {}
        self.raw_parts = []           # (ob, group)
        self.origin_g = (0.0, 0.0, 0.0)
        self.decals = {}              # kind -> decal dict
        self.work = work or '/tmp/gear_build'
        self.export_tangents = True
        self.node_mode = {}           # group -> 'mesh' (default) | 'pivot'
        self.uv_pack = 'AABB'         # uv.pack_islands shape_method (CONCAVE/CONVEX can hang on tiny islands)
        self.double_sided = False     # export the baked material double-sided (canopies, cloth)
        self.decimate = 1.0           # collapse-decimate ratio for parts with more than decimate_min triangles
        self.decimate_min = 1500
        self.root_name = aid

    # ---------- materials ----------
    def decal_kind(self, base_kind, tag, img, **kw):
        """register a decal variant 'base@tag' of a kind (image on UV map DECAL mixed over the colour)"""
        kind = f'{base_kind}@{tag}'
        self.decals[kind] = dict(img=img, **kw)
        return kind

    def mat(self, kind):
        if kind.startswith('='):
            nm = kind[1:]
            if nm not in self.raw_mats:
                self.raw_mats[nm] = make_raw_material(nm)
            return self.raw_mats[nm]
        if kind not in self.kind_mats:
            if self.mask_img is None:
                self.mask_img = bpy.data.images.new('mask_' + self.id, self.tex, self.tex, alpha=False)
                self.mask_img.colorspace_settings.name = 'Non-Color'
            m, st = make_material(kind, self.mask_img, self.ms, self.decals.get(kind), self.wear)
            self.kind_mats[kind] = m; self.sockets[kind] = st
        return self.kind_mats[kind]

    def _add(self, name, me, M, kind, group, taper=None, s_c=0.0):
        ob = super()._add(name, me, M, kind, group, taper, s_c)
        if kind.startswith('='):
            self.parts.pop()
            self.raw_parts.append((ob, group))
        return ob

    # ---------- free-form ----------
    def mesh(self, name, me, kind, group='body', M=None):
        """register a mesh given in metres, local (x=f, y=u, z=s), optionally transformed by M (gun-local matrix, mm units via T())."""
        return self._add(name, me, M if M is not None else Matrix.Identity(4), kind, group)

    def set_origin(self, f, u, s=0.0):
        self.origin_g = self._gp(f, u, s)

    def pivot(self, group, f, u, s=0.0):
        super().pivot(group, f, u, s)
        self.node_mode[group] = 'pivot'

    def disc(self, name, f, r, kind, group, u=0.0, s=0.0, face=-1, sag=0.5, segs=40):
        """lens disc perpendicular to the f axis at f (mm), radius r, slightly domed toward `face` (-1 = toward the rear/eye),
        normals pointing to `face`."""
        prof = [(f + face * sag, 0), (f + face * sag * 0.75, r * 0.5), (f, r)]
        ob = self.lathe(name, prof, kind, group, 0, u, s, 'f', segs, cap0=False, cap1=False)
        self.orient_normals(ob, (face, 0, 0))
        return ob

    def orient_normals(self, ob, gun_dir):
        """flip all faces of ob so their average normal points along gun_dir (f,u,s)."""
        me = ob.data
        d = Vector((-gun_dir[2], -gun_dir[0], gun_dir[1]))       # gun -> blender direction
        avg = Vector()
        for p in me.polygons: avg += p.normal * p.area
        if avg.dot(d) < 0:
            bm = bmesh.new(); bm.from_mesh(me)
            bmesh.ops.reverse_faces(bm, faces=bm.faces)
            bm.to_mesh(me); bm.free()

    def subtract(self, target, cutters, solver='EXACT'):
        """boolean-difference registered cutter objects from a registered target object (cutters are consumed)."""
        cut = set(cutters)
        self.parts = [(o, g) for (o, g) in self.parts if o not in cut]
        self.raw_parts = [(o, g) for (o, g) in self.raw_parts if o not in cut]
        bm = bmesh.new()
        for c in cutters:
            bm.from_mesh(c.data)
        cme = bpy.data.meshes.new('cutter'); bm.to_mesh(cme); bm.free()
        c = bpy.data.objects.new('cutter', cme)
        bpy.context.scene.collection.objects.link(c)
        for o in cutters:
            bpy.data.objects.remove(o)
        m = target.modifiers.new('bool', 'BOOLEAN'); m.operation = 'DIFFERENCE'; m.solver = solver; m.object = c
        dg = bpy.context.evaluated_depsgraph_get()
        me2 = bpy.data.meshes.new_from_object(target.evaluated_get(dg))
        target.modifiers.remove(m)
        old = target.data; target.data = me2
        me2.materials.clear(); me2.materials.append(old.materials[0])
        for p in me2.polygons: p.material_index = 0
        bpy.data.objects.remove(c)
        bpy.context.view_layer.update()
        return target

    def union(self, target, others):
        """boolean-union registered objects into target (others are consumed)."""
        oth = set(others)
        self.parts = [(o, g) for (o, g) in self.parts if o not in oth]
        for c in others:
            m = target.modifiers.new('bool', 'BOOLEAN'); m.operation = 'UNION'; m.solver = 'EXACT'; m.object = c
            dg = bpy.context.evaluated_depsgraph_get()
            me2 = bpy.data.meshes.new_from_object(target.evaluated_get(dg))
            target.modifiers.remove(m)
            old = target.data; target.data = me2
            me2.materials.clear(); me2.materials.append(old.materials[0])
            for p in me2.polygons: p.material_index = 0
            bpy.data.objects.remove(c)
        return target

    # ---------- decal UVs ----------
    def decal_uv(self, ob, plane, rect, img_rect=(0, 0, 1, 1), facing=None, min_dot=0.25, flip_u=False, flip_v=False):
        """Project DECAL UVs onto object `ob` (already registered). Coordinates in gun mm.
        plane: 'fu' (side view, looking from +s toward -s: a = f, b = u), 'fu-' (seen from -s side: a = -f),
               'su' (front, looking from +f: a = -s ... ), 'su-' (back), 'fs' (top: a = -s, b = f), 'fs-'(bottom)
               or ('cyl', axis_f, axis_u, axis_s_unused) -> cylindrical around the u axis through (f0, s0): rect = (ang0, u0, ang1, u1) deg
        rect: (a0, b0, a1, b1) in mm of the projection plane mapped to img_rect (sub-rectangle of the image, 0..1).
        facing: gun-space normal the face must face (dot > min_dot) to receive the decal (others get -5)."""
        me = ob.data
        if 'UVMap' not in me.uv_layers:
            me.uv_layers.new(name='UVMap')
        if 'DECAL' not in me.uv_layers:
            lay = me.uv_layers.new(name='DECAL')
            for d in lay.data: d.uv = (-5.0, -5.0)
        me.uv_layers.active = me.uv_layers['UVMap']
        lay = me.uv_layers['DECAL']
        ix0, iy0, ix1, iy1 = img_rect
        a0, b0, a1, b1 = rect
        gl = self.global_M
        def to_gun(co):
            # blender -> gun mm (inverse of G2B) (global map already applied when registered)
            return (-co.y / MM, co.z / MM, -co.x / MM)
        fvec = Vector(facing) if facing is not None else None
        for poly in me.polygons:
            n = poly.normal
            ng = Vector((-n.y, n.z, -n.x))
            if fvec is not None and ng.dot(fvec) < min_dot:
                continue
            for li in poly.loop_indices:
                co = me.vertices[me.loops[li].vertex_index].co
                f, u, s = to_gun(co)
                if isinstance(plane, tuple) and plane[0] == 'cyl':
                    _, fc, sc = plane
                    ang = math.degrees(math.atan2(-(s - sc), f - fc))   # 0 = facing +f, +90 = toward -s (left)
                    a, b = ang, u
                elif isinstance(plane, tuple) and plane[0] == 'cylf':
                    _, uc, sc = plane                                   # cylinder along f: a = f, b = angle (0 = top, +90 = -s)
                    a, b = f, math.degrees(math.atan2(-(s - sc), u - uc))
                elif plane == 'fu': a, b = f, u
                elif plane == 'fu-': a, b = -f, u
                elif plane == 'su': a, b = -s, u
                elif plane == 'su-': a, b = s, u
                elif plane == 'fs': a, b = -s, f
                elif plane == 'fs-': a, b = s, f
                else: raise ValueError(plane)
                x = (a - a0) / (a1 - a0); y = (b - b0) / (b1 - b0)
                if flip_u: x = 1 - x
                if flip_v: y = 1 - y
                lay.data[li].uv = (ix0 + x * (ix1 - ix0), iy0 + y * (iy1 - iy0))

    # ---------- UV ----------
    def _uv_classes(self, objs):
        """smart-project every part, then pack all islands into one atlas (CONVEX packing: CONCAVE can hang)."""
        for o in bpy.context.view_layer.objects: o.select_set(False)
        for o in objs:
            o.select_set(True)
            if not o.data.uv_layers: o.data.uv_layers.new(name='UVMap')
        bpy.context.view_layer.objects.active = objs[0]
        bpy.context.scene.tool_settings.use_uv_select_sync = True
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.0, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
        try:
            bpy.ops.uv.pack_islands(udim_source='CLOSEST_UDIM', rotate=True, margin_method='FRACTION', margin=0.008, shape_method=self.uv_pack)
        except Exception as e:
            print('pack fail', e)
        bpy.ops.object.mode_set(mode='OBJECT')

    # ---------- finishing ----------
    def finish(self, out_path, bake=True, samples=12, keep_blend=None):
        scene = bpy.context.scene
        bpy.context.view_layer.update()
        allparts = [ob for ob, g in self.parts]
        rawparts = [ob for ob, g in self.raw_parts]
        if self.decimate < 0.999:
            for ob in allparts:
                ob.data.calc_loop_triangles()
                nt = len(ob.data.loop_triangles)
                if nt > self.decimate_min:
                    m = ob.modifiers.new('dec', 'DECIMATE'); m.ratio = max(self.decimate, self.decimate_min / nt)
                    m.use_collapse_triangulate = False
                    dg = bpy.context.evaluated_depsgraph_get()
                    me2 = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
                    ob.modifiers.remove(m)
                    old = ob.data; ob.data = me2
                    me2.materials.clear(); me2.materials.append(old.materials[0])
        for ob in allparts + rawparts:
            bm = bmesh.new(); bm.from_mesh(ob.data)
            bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=2e-6)
            bm.to_mesh(ob.data); bm.free()
            ob.data.shade_smooth()
        # make sure every baked part has UVMap (first, active) and a DECAL layer when decals are used
        use_decal = any(k in self.decals for k in self.kind_mats)
        for ob in allparts:
            me = ob.data
            if 'UVMap' not in me.uv_layers:
                if len(me.uv_layers):
                    # keep a decal layer that was added first: re-create order
                    pass
                me.uv_layers.new(name='UVMap')
            if use_decal and 'DECAL' not in me.uv_layers:
                lay = me.uv_layers.new(name='DECAL')
                for d in lay.data: d.uv = (-5.0, -5.0)
            me.uv_layers.active = me.uv_layers['UVMap']
        if allparts:
            self._uv_classes(allparts)
            if bake:
                self._bake_setup()
                self._bake_pass(allparts, 'mask', samples)
        groups = {}
        for ob, g in self.parts + self.raw_parts:
            key = (g, ob in rawparts)
            groups.setdefault(key, []).append(ob)
        gobs = {}
        for (g, israw), obs in groups.items():
            for o in bpy.context.view_layer.objects: o.select_set(False)
            for o in obs: o.select_set(True)
            bpy.context.view_layer.objects.active = obs[0]
            if len(obs) > 1:
                with bpy.context.temp_override(active_object=obs[0], selected_objects=obs, selected_editable_objects=obs, object=obs[0]):
                    bpy.ops.object.join()
            ob = obs[0]
            nm = g if (g, not israw) not in groups else (g + ('_raw' if israw else ''))
            ob.name = nm; ob.data.name = nm
            me = ob.data
            me.shade_smooth()
            me.set_sharp_from_angle(angle=math.radians(38))
            wn = ob.modifiers.new('wn', 'WEIGHTED_NORMAL'); wn.keep_sharp = True; wn.weight = 50
            tri = ob.modifiers.new('tri', 'TRIANGULATE'); tri.keep_custom_normals = True; tri.quad_method = 'SHORTEST_DIAGONAL'
            gobs[nm] = (ob, g, israw)
        objs = [v[0] for v in gobs.values()]
        baked_objs = [v[0] for v in gobs.values() if not v[2]]
        dg = bpy.context.evaluated_depsgraph_get()
        tris = 0
        for o in objs:
            m2 = o.evaluated_get(dg).to_mesh(); m2.calc_loop_triangles(); tris += len(m2.loop_triangles); o.evaluated_get(dg).to_mesh_clear()
        self.meta['tris'] = tris
        print('TRIS', self.id, tris)
        if bake and baked_objs:
            for what in ('bsdf', 'col', 'rough', 'metal'):
                self._bake_pass(baked_objs, what, samples)
            final = self._bake_finish()
            if self.double_sided:
                final.use_backface_culling = False
            for o in baked_objs:
                o.data.materials.clear(); o.data.materials.append(final)
        for o in objs:
            me = o.data
            for nm in [l.name for l in me.uv_layers if l.name != 'UVMap']:
                me.uv_layers.remove(me.uv_layers[nm])
            if o in [v[0] for v in gobs.values() if v[2]]:
                for nm in [l.name for l in me.uv_layers]:
                    me.uv_layers.remove(me.uv_layers[nm])
        # ---- origin / hierarchy ----
        org = gun2b(*self.origin_g)
        root = bpy.data.objects.new(self.root_name, None)
        scene.collection.objects.link(root)
        pivot_objs = {}
        for nm, (o, g, israw) in gobs.items():
            pv = self.pivots.get(g)
            if pv is not None and self.node_mode.get(g) == 'pivot':
                pb = gun2b(*pv)
                o.data.transform(Matrix.Translation(-pb))
                piv = pivot_objs.get(g)
                if piv is None:
                    piv = bpy.data.objects.new(g, None)
                    piv.empty_display_type = 'ARROWS'; piv.empty_display_size = 0.02
                    scene.collection.objects.link(piv)
                    piv.location = pb - org
                    piv.parent = root
                    pivot_objs[g] = piv
                o.name = nm + '_mesh'; o.data.name = nm + '_mesh'
                o.location = (0, 0, 0)
                o.parent = piv
            else:
                o.data.transform(Matrix.Translation(-org))
                o.location = (0, 0, 0)
                o.parent = root
        bounds_min = Vector((1e9,) * 3); bounds_max = Vector((-1e9,) * 3)
        for o in objs:
            for v in o.data.vertices:
                w = v.co + (o.parent.location if o.parent and o.parent != root else Vector())
                bounds_min = Vector(map(min, bounds_min, w)); bounds_max = Vector(map(max, bounds_max, w))
        for name, (f, u, s) in self.empties.items():
            e = bpy.data.objects.new(name, None)
            e.empty_display_type = 'PLAIN_AXES'; e.empty_display_size = 0.02
            scene.collection.objects.link(e)
            par = getattr(self, 'empty_parent', {}).get(name)
            if par and par in pivot_objs:
                e.location = gun2b(f, u, s) - org - pivot_objs[par].location
                e.parent = pivot_objs[par]
            else:
                e.location = gun2b(f, u, s) - org
                e.parent = root
        self.meta['bounds_min'] = [round(bounds_min.x, 4), round(bounds_min.z, 4), round(-bounds_max.y, 4)]
        self.meta['bounds_max'] = [round(bounds_max.x, 4), round(bounds_max.z, 4), round(-bounds_min.y, 4)]
        self.meta['size_m'] = [round(bounds_max.x - bounds_min.x, 4), round(bounds_max.z - bounds_min.z, 4), round(bounds_max.y - bounds_min.y, 4)]
        nodes = [self.root_name]
        for nm, (o, g, israw) in sorted(gobs.items()):
            if g in pivot_objs: nodes += [g, o.name]
            else: nodes.append(nm)
        self.meta['nodes'] = list(dict.fromkeys(nodes + sorted(self.empties.keys())))
        self.meta['materials'] = (['M_' + self.id] if baked_objs and bake else []) + sorted(self.raw_mats.keys())
        if keep_blend:
            bpy.ops.wm.save_as_mainfile(filepath=keep_blend)
        for o in bpy.context.view_layer.objects: o.select_set(False)
        bpy.ops.export_scene.gltf(filepath=out_path, export_format='GLB', use_selection=False, export_apply=True,
                                  export_yup=True, export_tangents=self.export_tangents, export_image_format='JPEG', export_jpeg_quality=88,
                                  export_cameras=False, export_lights=False, export_animations=False, export_extras=False,
                                  export_draco_mesh_compression_enable=False)
        return self.meta
