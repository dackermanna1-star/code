"""Ocean / sky / underwater environment library for "Stranded" (Blender 4.5, Cycles).

Everything is built procedurally from presets so every shot shares the same
water, sky and colour pipeline.  Shots tweak presets, never rebuild by hand.
"""
import bpy, math, os, json
import numpy as np
from mathutils import Vector, Euler

ROOT = '/home/user/code/blender'
HDRI_DIR = ROOT + '/assets_src/hdri'
FPS = 30
# Day-1 shots SH01-SH15 were rendered with an azimuth-inverted HDRI->lamp mapping; SH11 keeps it for continuity.
LEGACY_SUN_AZIMUTH = False

def sun_vector(u, lat):
    """Direction toward the HDRI pixel at (u, latitude). Cycles maps u = 0.5 - atan2(y, x) / 2pi."""
    lon = (u - 0.5) * 2 * math.pi
    if LEGACY_SUN_AZIMUTH:
        return Vector((-math.cos(lon) * math.cos(lat), math.sin(lon) * math.cos(lat), math.sin(lat)))
    return Vector((math.cos(lon) * math.cos(lat), -math.sin(lon) * math.cos(lat), math.sin(lat)))

# --------------------------------------------------------------------------- scene
def new_scene(res=(648, 1152), frames=(1, 100)):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.fps = FPS
    sc.frame_start, sc.frame_end = frames
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    sc.render.engine = 'CYCLES'
    cy = sc.cycles
    cy.device = 'CPU'
    cy.samples = 6
    cy.use_adaptive_sampling = True
    cy.adaptive_threshold = 0.05
    cy.adaptive_min_samples = 4
    cy.use_denoising = True
    cy.denoiser = 'OPENIMAGEDENOISE'
    cy.denoising_input_passes = 'RGB_ALBEDO_NORMAL'
    cy.denoising_prefilter = 'ACCURATE'
    cy.max_bounces = 6
    cy.diffuse_bounces = 2
    cy.glossy_bounces = 3
    cy.transmission_bounces = 6
    cy.volume_bounces = 1
    cy.transparent_max_bounces = 8
    cy.caustics_reflective = False
    cy.caustics_refractive = False
    cy.blur_glossy = 1.0
    cy.sample_clamp_indirect = 8.0
    cy.light_sampling_threshold = 0.01
    sc.render.use_persistent_data = False
    sc.view_settings.view_transform = 'AgX'
    sc.view_settings.look = 'AgX - Medium High Contrast'
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_depth = '8'
    sc.render.film_transparent = False
    for name in ('Environment', 'Character', 'Marine', 'Props', 'Cameras', 'Lights', 'FX'):
        c = bpy.data.collections.new(name); sc.collection.children.link(c)
    return sc

def col(name):
    return bpy.data.collections[name]

def link(obj, colname):
    for c in obj.users_collection: c.objects.unlink(obj)
    col(colname).objects.link(obj)
    return obj

def time_expr(speed=1.0, offset=0.0):
    return '(frame/%d)*%f+%f' % (FPS, speed, offset)

def add_driver_time(id_, path, speed=1.0, offset=0.0, index=-1):
    fc = id_.driver_add(path, index) if index >= 0 else id_.driver_add(path)
    fc.driver.type = 'SCRIPTED'
    fc.driver.expression = time_expr(speed, offset)
    return fc

# --------------------------------------------------------------------------- ocean
OCEAN_PRESETS = {
    # calm-moderate open-ocean swell, light wind chop
    'calm':  dict(wind=6.5, size=180.0, res=16, wave_scale=0.9, chop=1.0, align=0.35, dir=0.6, damp=0.5, foam=0.12, speed=1.0),
    'moderate': dict(wind=8.0, size=220.0, res=16, wave_scale=1.0, chop=1.15, align=0.3, dir=0.6, damp=0.5, foam=0.22, speed=1.0),
    'rough': dict(wind=12.0, size=260.0, res=16, wave_scale=1.0, chop=1.4, align=0.25, dir=0.6, damp=0.4, foam=0.6, speed=1.0),
    'glassy': dict(wind=4.0, size=160.0, res=16, wave_scale=0.8, chop=0.8, align=0.6, dir=0.6, damp=0.7, foam=0.0, speed=1.0),
}

def _axis_coords(half, fine, fine_extent, growth):
    xs = [0.0]; step = fine; x = 0.0
    while x < half:
        x += step
        xs.append(min(x, half))
        if x > fine_extent: step *= growth
    xs = np.array(xs)
    return np.concatenate([-xs[:0:-1], xs])

def make_ocean_mesh(name='Ocean', half=1500.0, fine=0.14, fine_extent=14.0, growth=1.04, center=(0, 0)):
    ax = _axis_coords(half, fine, fine_extent, growth)
    n = len(ax)
    X, Y = np.meshgrid(ax + center[0], ax + center[1], indexing='xy')
    verts = np.stack([X.ravel(), Y.ravel(), np.zeros(n * n)], 1)
    idx = np.arange(n * n).reshape(n, n)
    a = idx[:-1, :-1].ravel(); b = idx[:-1, 1:].ravel(); c = idx[1:, 1:].ravel(); d = idx[1:, :-1].ravel()
    faces = np.stack([a, b, c, d], 1)
    me = bpy.data.meshes.new(name)
    me.vertices.add(n * n); me.vertices.foreach_set('co', verts.astype(np.float32).ravel())
    me.loops.add(len(faces) * 4); me.loops.foreach_set('vertex_index', faces.astype(np.int32).ravel())
    me.polygons.add(len(faces))
    me.polygons.foreach_set('loop_start', (np.arange(len(faces)) * 4).astype(np.int32))
    me.polygons.foreach_set('loop_total', np.full(len(faces), 4, np.int32))
    me.update(); me.validate()
    me.shade_smooth() if hasattr(me, 'shade_smooth') else None
    for p in me.polygons: p.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob); link(ob, 'Environment')
    ob['grid_axis'] = ax.tolist(); ob['grid_center'] = list(center)
    return ob

def add_ocean_modifier(ob, preset='moderate', seed=7, time_offset=0.0, **over):
    p = dict(OCEAN_PRESETS[preset]); p.update(over)
    m = ob.modifiers.new('OceanSim', 'OCEAN')
    m.geometry_mode = 'DISPLACE'
    m.spectrum = 'PIERSON_MOSKOWITZ'
    m.resolution = p['res']
    m.viewport_resolution = 6
    m.spatial_size = int(p['size'])
    m.wave_scale = p['wave_scale']
    m.wave_scale_min = 0.01
    m.choppiness = p['chop']
    m.wind_velocity = p['wind']
    m.wave_alignment = p['align']
    m.wave_direction = p['dir']
    m.damping = p['damp']
    m.depth = 200
    m.random_seed = seed
    m.use_normals = True
    m.use_foam = p['foam'] > 0
    m.foam_coverage = p['foam']
    m.foam_layer_name = 'foam'
    m.use_spray = False
    add_driver_time(m, 'time', p['speed'], time_offset)
    ob['ocean_preset'] = preset
    return m

def make_far_ocean(mat, inner=1400.0, outer=40000.0):
    bpy.ops.mesh.primitive_circle_add(vertices=128, radius=outer, fill_type='NOTHING')
    o = bpy.context.object; o.name = 'OceanFar'
    me = o.data
    import bmesh
    bm = bmesh.new(); bm.from_mesh(me)
    outer_v = list(bm.verts)
    inner_v = [bm.verts.new((v.co.x * inner / outer, v.co.y * inner / outer, -0.05)) for v in outer_v]
    for i in range(len(outer_v)):
        j = (i + 1) % len(outer_v)
        bm.faces.new((inner_v[i], inner_v[j], outer_v[j], outer_v[i]))
    bm.to_mesh(me); bm.free()
    me.materials.append(mat)
    link(o, 'Environment')
    return o

# --------------------------------------------------------------------------- water shading
def _n(nt, t, loc=None, **kw):
    n = nt.nodes.new(t)
    for k, v in kw.items():
        setattr(n, k, v)
    if loc: n.location = loc
    return n

TEX = ROOT + '/assets/textures/'

def _img(nt, name, loc, colorspace='Non-Color', interp='Linear'):
    n = nt.nodes.new('ShaderNodeTexImage'); n.location = loc
    n.image = bpy.data.images.load(TEX + name + '.png', check_existing=True)
    n.image.colorspace_settings.name = colorspace
    n.interpolation = interp; n.extension = 'REPEAT'
    return n

def water_material(name='Water', mode='clear', fx_empty=None, haze_color=(0.55, 0.65, 0.75),
                   haze_start=250.0, haze_end=9000.0, deep=(0.0015, 0.010, 0.022), crest=(0.006, 0.05, 0.055),
                   near_transmission=14.0, caustic_strength=0.7, ripple_strength=1.0, roughness=0.035):
    """Texture-driven ocean surface. mode: 'opaque' | 'clear' (transmissive near camera) | 'under'."""
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; N = nt.nodes; L = nt.links
    N.clear()
    def math(op, a=None, b=None, c=None, loc=(0, 0), clamp=False):
        n = _n(nt, 'ShaderNodeMath', loc); n.operation = op; n.use_clamp = clamp
        for k, x in enumerate((a, b, c)):
            if x is None: continue
            if isinstance(x, (int, float)): n.inputs[k].default_value = x
            else: L.new(x, n.inputs[k])
        return n.outputs[0]
    def vmath(op, a=None, b=None, loc=(0, 0)):
        n = _n(nt, 'ShaderNodeVectorMath', loc); n.operation = op
        for k, x in enumerate((a, b)):
            if x is None: continue
            if isinstance(x, tuple): n.inputs[k].default_value = x
            else: L.new(x, n.inputs[k])
        return n
    out = _n(nt, 'ShaderNodeOutputMaterial', (1800, 0))
    geo = _n(nt, 'ShaderNodeNewGeometry', (-1800, 400))
    tc = _n(nt, 'ShaderNodeTexCoord', (-1800, 0))
    cam = _n(nt, 'ShaderNodeCameraData', (-1800, -600))
    lp = _n(nt, 'ShaderNodeLightPath', (-1800, 800))
    tval = _n(nt, 'ShaderNodeValue', (-1800, -900)); tval.label = tval.name = 'time'
    add_driver_time(nt, 'nodes["time"].outputs[0].default_value')
    T = tval.outputs[0]
    pos = tc.outputs['Object']

    def scrolled(img_name, scale, vel, rot=0.0, loc=(0, 0)):
        """image lookup at pos*scale (+rotation) + vel*t (in texture units)"""
        mp = _n(nt, 'ShaderNodeMapping', (loc[0] - 200, loc[1])); mp.vector_type = 'POINT'
        mp.inputs['Scale'].default_value = (scale, scale, 1); mp.inputs['Rotation'].default_value = (0, 0, rot)
        L.new(pos, mp.inputs['Vector'])
        off = _n(nt, 'ShaderNodeCombineXYZ', (loc[0] - 400, loc[1] - 200))
        L.new(math('MULTIPLY', T, vel[0], loc=(loc[0] - 600, loc[1] - 150)), off.inputs['X'])
        L.new(math('MULTIPLY', T, vel[1], loc=(loc[0] - 600, loc[1] - 250)), off.inputs['Y'])
        ad = vmath('ADD', mp.outputs[0], off.outputs[0], loc=(loc[0] - 100, loc[1] - 100))
        im = _img(nt, img_name, loc)
        L.new(ad.outputs[0], im.inputs['Vector'])
        return im.outputs['Color']

    # ---- surface normal = ocean geometry normal + scrolling ripple layers (+ character rings)
    def layer(scale, vel, rot, w, loc):
        c = scrolled('ripple_normal', scale, vel, rot, loc)
        v = vmath('MULTIPLY_ADD', c, (2.0, 2.0, 0.0), loc=(loc[0] + 200, loc[1])); v_n = v
        L.new(c, v.inputs[0]); v.inputs[1].default_value = (2.0, 2.0, 0.0); v.inputs[2].default_value = (-1.0, -1.0, 0.0)
        sc_ = vmath('SCALE', v.outputs[0], loc=(loc[0] + 350, loc[1])); sc_.inputs['Scale'].default_value = w * ripple_strength
        return sc_.outputs[0]
    l1 = layer(0.42, (0.05, 0.02), 0.0, 0.55, (-1300, 1200))
    l2 = layer(0.13, (-0.012, 0.016), 1.1, 0.45, (-1300, 900))
    l3 = layer(0.025, (0.002, -0.001), 2.3, 0.35, (-1300, 600))
    # fade fine layers with view distance (no mip-mapping in Cycles -> avoids moire from the air)
    def fade(v, d0, d1, lo, loc):
        fr = _n(nt, 'ShaderNodeMapRange', loc); fr.inputs['From Min'].default_value = d0; fr.inputs['From Max'].default_value = d1
        fr.inputs['To Min'].default_value = 1.0; fr.inputs['To Max'].default_value = lo
        L.new(cam.outputs['View Distance'], fr.inputs['Value'])
        sc_ = vmath('SCALE', v, loc=(loc[0] + 200, loc[1])); L.new(fr.outputs[0], sc_.inputs['Scale'])
        return sc_.outputs[0]
    l1 = fade(l1, 4.0, 22.0, 0.0, (-900, 1300))
    l2 = fade(l2, 14.0, 60.0, 0.0, (-900, 1100))
    l3 = fade(l3, 300.0, 1500.0, 0.25, (-900, 700))
    # break up tiling: scale each layer by an independent large-scale noise
    def modulate(v, scale, loc):
        nz = scrolled('foam_noise', scale, (0.0, 0.0), 0.7, loc)
        mr = _n(nt, 'ShaderNodeMapRange', (loc[0] + 200, loc[1])); mr.inputs['To Min'].default_value = 0.35; mr.inputs['To Max'].default_value = 1.4
        L.new(nz, mr.inputs['Value'])
        sc_ = vmath('SCALE', v, loc=(loc[0] + 400, loc[1])); L.new(mr.outputs[0], sc_.inputs['Scale'])
        return sc_.outputs[0]
    l2 = modulate(l2, 0.021, (-1500, 1100))
    l3 = modulate(l3, 0.0037, (-1500, 700))
    acc = vmath('ADD', l1, l2, loc=(-700, 1000)); acc = vmath('ADD', acc.outputs[0], l3, loc=(-550, 900))
    pert = acc.outputs[0]

    ring_mask = None
    if fx_empty is not None:
        tco = _n(nt, 'ShaderNodeTexCoord', (-1800, -1300)); tco.object = fx_empty
        sep = _n(nt, 'ShaderNodeSeparateXYZ', (-1600, -1300)); L.new(tco.outputs['Object'], sep.inputs[0])
        xy = _n(nt, 'ShaderNodeCombineXYZ', (-1450, -1300)); L.new(sep.outputs['X'], xy.inputs['X']); L.new(sep.outputs['Y'], xy.inputs['Y'])
        D = vmath('LENGTH', xy.outputs[0], loc=(-1300, -1300)).outputs['Value']
        Dn = vmath('NORMALIZE', xy.outputs[0], loc=(-1300, -1450)).outputs[0]
        # analytic ring gradient: A k cos(k d - w t) e^{-d/r}
        ph = math('SUBTRACT', math('MULTIPLY', D, 9.0, loc=(-1150, -1250)), math('MULTIPLY', T, 7.0, loc=(-1150, -1350)), loc=(-1000, -1300))
        cs = math('COSINE', ph, loc=(-850, -1300))
        ee = math('EXPONENT', math('MULTIPLY', D, -0.9, loc=(-1000, -1450)), loc=(-850, -1450))
        near_body = math('GREATER_THAN', D, 0.18, loc=(-850, -1550))
        amp = _n(nt, 'ShaderNodeValue', (-850, -1650)); amp.name = amp.label = 'ripple_amp'; amp.outputs[0].default_value = 1.0
        g = math('MULTIPLY', math('MULTIPLY', cs, ee, loc=(-700, -1350)), math('MULTIPLY', amp.outputs[0], near_body, loc=(-700, -1550)), loc=(-550, -1400))
        g = math('MULTIPLY', g, 0.35, loc=(-400, -1400))
        rg = vmath('SCALE', Dn, loc=(-300, -1450)); L.new(g, rg.inputs['Scale'])
        pert = vmath('ADD', pert, rg.outputs[0], loc=(-200, 800)).outputs[0]
        # froth collar hugging the body, broken up by noise
        fr = _n(nt, 'ShaderNodeMapRange', (-1000, -1800)); fr.inputs['From Min'].default_value = 0.2; fr.inputs['From Max'].default_value = 0.48
        fr.inputs['To Min'].default_value = 1.0; fr.inputs['To Max'].default_value = 0.0; L.new(D, fr.inputs['Value'])
        fn = scrolled('foam_noise', 1.6, (0.03, 0.01), 0.4, (-1000, -2000))
        fm = _n(nt, 'ShaderNodeMapRange', (-700, -2000)); fm.inputs['From Min'].default_value = 0.42; fm.inputs['From Max'].default_value = 0.62
        L.new(fn, fm.inputs['Value'])
        fa = _n(nt, 'ShaderNodeValue', (-700, -2200)); fa.name = fa.label = 'collar_foam'; fa.outputs[0].default_value = 0.6
        ring_mask = math('MULTIPLY', math('MULTIPLY', fr.outputs[0], fm.outputs[0], loc=(-500, -1900)), fa.outputs[0], loc=(-350, -1950))

    nrm = vmath('ADD', geo.outputs['Normal'], pert, loc=(0, 900))
    nrm = vmath('NORMALIZE', nrm.outputs[0], loc=(150, 900)).outputs[0]

    # ---- colour: deep body + teal crests + large-scale variation
    posz = _n(nt, 'ShaderNodeSeparateXYZ', (-1500, 200)); L.new(geo.outputs['Position'], posz.inputs[0])
    cr = _n(nt, 'ShaderNodeMapRange', (-1300, 200)); cr.inputs['From Min'].default_value = -0.2; cr.inputs['From Max'].default_value = 1.4
    L.new(posz.outputs['Z'], cr.inputs['Value'])
    colmix = _n(nt, 'ShaderNodeMix', (-900, 200)); colmix.data_type = 'RGBA'
    colmix.inputs['A'].default_value = (*deep, 1); colmix.inputs['B'].default_value = (*crest, 1)
    L.new(cr.outputs[0], colmix.inputs['Factor'])
    bigv = scrolled('foam_noise', 0.0025, (0.0, 0.0), 0.0, (-1100, -100))
    vr = _n(nt, 'ShaderNodeMapRange', (-800, -100)); vr.inputs['To Min'].default_value = 0.7; vr.inputs['To Max'].default_value = 1.3
    L.new(bigv, vr.inputs['Value'])
    varmix = _n(nt, 'ShaderNodeMix', (-600, 150)); varmix.data_type = 'RGBA'; varmix.blend_type = 'MULTIPLY'; varmix.inputs['Factor'].default_value = 1.0
    vc = _n(nt, 'ShaderNodeCombineColor', (-700, -100)); [L.new(vr.outputs[0], vc.inputs[k]) for k in range(3)]
    L.new(colmix.outputs['Result'], varmix.inputs['A']); L.new(vc.outputs[0], varmix.inputs['B'])

    # ---- camera distance: transmission near, haze far
    near = _n(nt, 'ShaderNodeMapRange', (-1300, -600)); near.inputs['From Min'].default_value = near_transmission * 0.6
    near.inputs['From Max'].default_value = near_transmission; near.inputs['To Min'].default_value = 1.0; near.inputs['To Max'].default_value = 0.0
    L.new(cam.outputs['View Distance'], near.inputs['Value'])
    hz = _n(nt, 'ShaderNodeMapRange', (-1300, -800)); hz.inputs['From Min'].default_value = haze_start; hz.inputs['From Max'].default_value = haze_end
    hz.interpolation_type = 'SMOOTHSTEP'; L.new(cam.outputs['View Distance'], hz.inputs['Value'])
    hzv = _n(nt, 'ShaderNodeValue', (-1300, -1000)); hzv.name = hzv.label = 'haze_amount'; hzv.outputs[0].default_value = 1.0
    hzm = math('MULTIPLY', hz.outputs[0], hzv.outputs[0], loc=(-1100, -850))

    bsdf = _n(nt, 'ShaderNodeBsdfPrincipled', (400, 300)); bsdf.name = 'water_bsdf'
    bsdf.inputs['IOR'].default_value = 1.333
    bsdf.inputs['Roughness'].default_value = roughness
    L.new(varmix.outputs['Result'], bsdf.inputs['Base Color'])
    L.new(nrm, bsdf.inputs['Normal'])
    tw = _n(nt, 'ShaderNodeValue', (0, 0)); tw.name = tw.label = 'transmission'
    tw.outputs[0].default_value = {'opaque': 0.0, 'clear': 1.0, 'under': 1.0}[mode]
    twm = math('MULTIPLY', 1.0 if mode == 'under' else near.outputs[0], tw.outputs[0], loc=(150, 0))
    L.new(twm, bsdf.inputs['Transmission Weight'])

    # ---- foam (sim foam attribute + collar) broken by noise texture
    fattr = _n(nt, 'ShaderNodeAttribute', (-1300, 1500)); fattr.attribute_name = 'foam'
    fnz = scrolled('foam_noise', 0.35, (0.004, 0.002), 0.7, (-1300, 1750))
    fmr = _n(nt, 'ShaderNodeMapRange', (-1000, 1500)); fmr.inputs['From Min'].default_value = 0.05; fmr.inputs['From Max'].default_value = 0.6
    L.new(fattr.outputs['Fac'], fmr.inputs['Value'])
    fbr = _n(nt, 'ShaderNodeMapRange', (-1000, 1750)); fbr.inputs['From Min'].default_value = 0.4; fbr.inputs['From Max'].default_value = 0.62
    L.new(fnz, fbr.inputs['Value'])
    famt = _n(nt, 'ShaderNodeValue', (-800, 1900)); famt.name = famt.label = 'foam_amount'; famt.outputs[0].default_value = 0.7
    foam_fac = math('MULTIPLY', math('MULTIPLY', fmr.outputs[0], fbr.outputs[0], loc=(-800, 1600)), famt.outputs[0], loc=(-650, 1650), clamp=True)
    if ring_mask is not None:
        foam_fac = math('MAXIMUM', foam_fac, ring_mask, loc=(-500, 1650))
    foam = _n(nt, 'ShaderNodeBsdfPrincipled', (400, 900)); foam.name = 'foam_bsdf'
    foam.inputs['Base Color'].default_value = (0.8, 0.85, 0.87, 1); foam.inputs['Roughness'].default_value = 0.65
    L.new(nrm, foam.inputs['Normal'])
    mf = _n(nt, 'ShaderNodeMixShader', (800, 500)); L.new(foam_fac, mf.inputs[0]); L.new(bsdf.outputs[0], mf.inputs[1]); L.new(foam.outputs[0], mf.inputs[2])

    hazeem = _n(nt, 'ShaderNodeEmission', (800, 200)); hazeem.inputs['Color'].default_value = (*haze_color, 1)
    hazeem.inputs['Strength'].default_value = 1.0; hazeem.name = 'haze'
    mh = _n(nt, 'ShaderNodeMixShader', (1050, 400)); L.new(hzm, mh.inputs[0]); L.new(mf.outputs[0], mh.inputs[1]); L.new(hazeem.outputs[0], mh.inputs[2])

    # ---- shadow rays: pass through, modulated by two drifting caustic layers
    c1 = scrolled('caustics', 0.55, (0.04, 0.015), 0.0, (0, -800))
    c2 = scrolled('caustics', 0.37, (-0.025, 0.03), 0.9, (0, -1100))
    cmix = math('MULTIPLY', math('ADD', c1, c2, loc=(250, -900)), 0.9, loc=(400, -900))
    cst = _n(nt, 'ShaderNodeValue', (400, -1100)); cst.name = cst.label = 'caustic_strength'; cst.outputs[0].default_value = caustic_strength
    base = math('SUBTRACT', 1.0, cst.outputs[0], loc=(550, -1050))
    ctr = math('MULTIPLY_ADD', cmix, cst.outputs[0], base, loc=(700, -950), clamp=True)
    ccol = _n(nt, 'ShaderNodeCombineColor', (850, -950)); [L.new(ctr, ccol.inputs[k]) for k in range(3)]
    tr = _n(nt, 'ShaderNodeBsdfTransparent', (1000, -900)); L.new(ccol.outputs[0], tr.inputs['Color'])
    ms = _n(nt, 'ShaderNodeMixShader', (1500, 200)); L.new(lp.outputs['Is Shadow Ray'], ms.inputs[0])
    L.new(mh.outputs[0], ms.inputs[1]); L.new(tr.outputs[0], ms.inputs[2])
    L.new(ms.outputs[0], out.inputs['Surface'])
    m['mode'] = mode
    m.cycles.emission_sampling = 'NONE'   # haze emission must not become 500k mesh lights
    return m

def water_volume_material(name='WaterVolume', density=0.045, color=(0.04, 0.35, 0.42), absorption=(0.12, 0.55, 0.62), abs_density=0.06):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; N = nt.nodes; L = nt.links; N.clear()
    out = _n(nt, 'ShaderNodeOutputMaterial', (600, 0))
    pv = _n(nt, 'ShaderNodeVolumePrincipled', (200, 0))
    pv.inputs['Color'].default_value = (*color, 1); pv.inputs['Density'].default_value = density
    pv.inputs['Absorption Color'].default_value = (*absorption, 1)
    pv.inputs['Anisotropy'].default_value = 0.65
    L.new(pv.outputs[0], out.inputs['Volume'])
    pv.name = 'vol'
    # the abyss floor of the volume box: invisible
    tr = _n(nt, 'ShaderNodeBsdfTransparent', (200, 300))
    geo = _n(nt, 'ShaderNodeNewGeometry', (0, 300))
    m.node_tree.links.new(tr.outputs[0], out.inputs['Surface'])
    return m

def cheap_volume(m, scatter=False, absorb=(0.08, 0.42, 0.5), density=0.35, glow=(0.004, 0.03, 0.045), scatter_density=0.04):
    """Absorption + faint emitted glow (analytic, no light sampling). Underwater shots add real scattering for god rays."""
    nt = m.node_tree; N = nt.nodes; L = nt.links
    out = next(n for n in N if n.type == 'OUTPUT_MATERIAL')
    ab = N.new('ShaderNodeVolumeAbsorption'); ab.name = 'vol_abs'; ab.inputs['Color'].default_value = (*absorb, 1); ab.inputs['Density'].default_value = density
    em = N.new('ShaderNodeEmission'); em.name = 'vol_glow'; em.inputs['Color'].default_value = (*glow, 1); em.inputs['Strength'].default_value = 1.0
    ad = N.new('ShaderNodeAddShader'); L.new(ab.outputs[0], ad.inputs[0]); L.new(em.outputs[0], ad.inputs[1])
    if scatter:
        scn = N.new('ShaderNodeVolumeScatter'); scn.name = 'vol_scatter'; scn.inputs['Color'].default_value = (0.3, 0.75, 0.85, 1)
        scn.inputs['Density'].default_value = scatter_density; scn.inputs['Anisotropy'].default_value = 0.75
        ad2 = N.new('ShaderNodeAddShader'); L.new(ad.outputs[0], ad2.inputs[0]); L.new(scn.outputs[0], ad2.inputs[1]); ad = ad2
    L.new(ad.outputs[0], out.inputs['Volume'])

def make_ocean(preset='moderate', mode='clear', seed=7, fx_empty=None, haze_color=(0.6, 0.7, 0.8),
               volume=True, half=1500.0, fine=0.14, fine_extent=14.0, time_offset=0.0, water_kw=None, **ocean_over):
    """Returns dict with ocean object, material, far plane, volume."""
    ob = make_ocean_mesh('Ocean', half=half, fine=fine, fine_extent=fine_extent)
    mod = add_ocean_modifier(ob, preset, seed=seed, time_offset=time_offset, **ocean_over)
    mat = water_material('Water', mode=mode, fx_empty=fx_empty, haze_color=haze_color, **(water_kw or {}))
    ob.data.materials.append(mat)
    res = {'ocean': ob, 'mod': mod, 'mat': mat}
    farmat = water_material('WaterFar', mode='opaque', haze_color=haze_color, **(water_kw or {}))
    res['far'] = make_far_ocean(farmat, inner=half * 0.97)
    res['farmat'] = farmat
    if volume and mode in ('clear', 'under'):
        # closed water body: the displaced surface extruded downward
        sol = ob.modifiers.new('Depth', 'SOLIDIFY'); sol.thickness = 70.0; sol.offset = -1.0
        sol.use_even_offset = False; sol.use_rim = True; sol.material_offset = 1; sol.material_offset_rim = 1
        vm = water_volume_material()
        ob.data.materials.append(vm)
        # the volume belongs to the water surface material too
        L = mat.node_tree.links; N = mat.node_tree.nodes
        for mt in (mat, vm):
            cheap_volume(mt, scatter=False, glow=((0.004, 0.034, 0.05) if mode == 'under' else (0.008, 0.055, 0.09)), density=(0.28 if mode == 'under' else 0.32))
        res['volmat'] = vm
    return res

def set_volume(res, density=None, color=None, absorption=None):
    for m in (res.get('mat'), res.get('volmat')):
        if m is None: continue
        v = m.node_tree.nodes.get('vol')
        if v is None: continue
        if density is not None: v.inputs['Density'].default_value = density
        if color is not None: v.inputs['Color'].default_value = (*color, 1)
        if absorption is not None: v.inputs['Absorption Color'].default_value = (*absorption, 1)

# --------------------------------------------------------------------------- sky
_SUN_CACHE = HDRI_DIR + '/sun_dirs.json'

def hdri_sun(path):
    """Find the sun (brightest region) of an equirect HDRI -> (azimuth, elevation, peak)."""
    cache = json.load(open(_SUN_CACHE)) if os.path.exists(_SUN_CACHE) else {}
    key = os.path.basename(path)
    if key in cache: return cache[key]
    img = bpy.data.images.load(path, check_existing=True)
    w, h = img.size
    px = np.empty(w * h * 4, np.float32); img.pixels.foreach_get(px)
    px = px.reshape(h, w, 4)[:, :, :3].sum(2)
    # blur-free: take max of upper hemisphere
    up = px[h // 2:, :]
    iy, ix = np.unravel_index(np.argmax(up), up.shape)
    iy += h // 2
    u = (ix + 0.5) / w; v = (iy + 0.5) / h
    az = (u - 0.5) * 2 * math.pi   # blender equirect: u=0.5 -> -Y? handled by rotate in world
    el = (v - 0.5) * math.pi
    r = {'u': u, 'v': v, 'az': az, 'el': el, 'peak': float(up.max())}
    cache[key] = r; json.dump(cache, open(_SUN_CACHE, 'w'), indent=1)
    return r

def make_world(hdri, rot_z=0.0, strength=1.0, sun_strength=4.0, sun_angle=0.6, clamp=12.0,
               camera_sky_boost=1.0, sun_color=None, horizon_haze=None, show_sun_disk=False, add_sun=True):
    """HDRI sky with the sun clamped out and replaced by a matching sun lamp."""
    sc = bpy.context.scene
    path = os.path.join(HDRI_DIR, hdri + '_4k.hdr') if not os.path.isabs(hdri) else hdri
    w = bpy.data.worlds.new('Sky'); sc.world = w; w.use_nodes = True
    nt = w.node_tree; N = nt.nodes; L = nt.links; N.clear()
    out = _n(nt, 'ShaderNodeOutputWorld', (900, 0))
    tc = _n(nt, 'ShaderNodeTexCoord', (-900, 0))
    mp = _n(nt, 'ShaderNodeMapping', (-700, 0)); mp.inputs['Rotation'].default_value = (0, 0, rot_z)
    L.new(tc.outputs['Generated'], mp.inputs['Vector'])
    env = _n(nt, 'ShaderNodeTexEnvironment', (-500, 0)); env.image = bpy.data.images.load(path, check_existing=True)
    L.new(mp.outputs['Vector'], env.inputs['Vector'])
    # clamp (removes the sun hot-spot for lighting; the lamp replaces it)
    sepc = _n(nt, 'ShaderNodeSeparateColor', (-250, -150)); L.new(env.outputs['Color'], sepc.inputs[0])
    comb = _n(nt, 'ShaderNodeCombineColor', (50, -150))
    for i in range(3):
        mn = _n(nt, 'ShaderNodeMath', (-100, -100 - i * 60)); mn.operation = 'MINIMUM'; mn.inputs[1].default_value = clamp
        L.new(sepc.outputs[i], mn.inputs[0]); L.new(mn.outputs[0], comb.inputs[i])
    lp = _n(nt, 'ShaderNodeLightPath', (100, 300))
    camsrc = env.outputs['Color'] if show_sun_disk else comb.outputs[0]
    bg_light = _n(nt, 'ShaderNodeBackground', (300, -100)); bg_light.inputs['Strength'].default_value = strength
    L.new(comb.outputs[0], bg_light.inputs['Color'])
    bg_cam = _n(nt, 'ShaderNodeBackground', (300, 100)); bg_cam.inputs['Strength'].default_value = strength * camera_sky_boost
    if horizon_haze is not None:
        # blend toward a haze colour near/below the horizon for camera rays
        sepz = _n(nt, 'ShaderNodeSeparateXYZ', (-300, 400)); L.new(tc.outputs['Generated'], sepz.inputs[0])
        hzr = _n(nt, 'ShaderNodeMapRange', (-100, 400)); hzr.inputs['From Min'].default_value = horizon_haze[1]; hzr.inputs['From Max'].default_value = 0.0
        hzr.interpolation_type = 'SMOOTHSTEP'; L.new(sepz.outputs['Z'], hzr.inputs['Value'])
        hm = _n(nt, 'ShaderNodeMix', (100, 200)); hm.data_type = 'RGBA'
        L.new(hzr.outputs[0], hm.inputs['Factor']); L.new(camsrc, hm.inputs['A']); hm.inputs['B'].default_value = (*horizon_haze[0], 1)
        L.new(hm.outputs['Result'], bg_cam.inputs['Color'])
    else:
        L.new(camsrc, bg_cam.inputs['Color'])
    mix = _n(nt, 'ShaderNodeMixShader', (600, 0)); L.new(lp.outputs['Is Camera Ray'], mix.inputs[0])
    L.new(bg_light.outputs[0], mix.inputs[1]); L.new(bg_cam.outputs[0], mix.inputs[2])
    L.new(mix.outputs[0], out.inputs['Surface'])
    w.cycles.sampling_method = 'MANUAL'; w.cycles.sample_map_resolution = 1024
    sun = None
    if add_sun:
        s = hdri_sun(path)
        # equirect u -> direction: Blender env maps u=0.5 to -Y... compute world dir of that pixel then apply rotation
        d = sun_vector(s['u'], s['el'])
        d.rotate(Euler((0, 0, rot_z)))
        ld = bpy.data.lights.new('Sun', 'SUN'); ld.energy = sun_strength; ld.angle = math.radians(sun_angle)
        if sun_color: ld.color = sun_color
        sun = bpy.data.objects.new('Sun', ld); bpy.context.scene.collection.objects.link(sun); link(sun, 'Lights')
        sun.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
        sun['dir'] = list(d)
    return w, sun

def sun_dir(sun):
    return Vector(sun['dir'])

# --------------------------------------------------------------------------- compositing / grade
def setup_compositor(grade='day', glare=True, vignette=0.35, grain=0.0, lens_dist=0.0):
    sc = bpy.context.scene
    sc.use_nodes = True
    nt = sc.node_tree; N = nt.nodes; L = nt.links; N.clear()
    rl = N.new('CompositorNodeRLayers'); rl.location = (-800, 0)
    comp = N.new('CompositorNodeComposite'); comp.location = (1200, 0)
    cur = rl.outputs['Image']
    if glare:
        g = N.new('CompositorNodeGlare'); g.glare_type = 'FOG_GLOW'; g.quality = 'MEDIUM'
        g.threshold = 1.2 if grade != 'night' else 0.6; g.size = 7; g.location = (-600, 0)
        if hasattr(g, 'mix'): g.mix = -0.75
        L.new(cur, g.inputs['Image']); cur = g.outputs['Image']
    cb = N.new('CompositorNodeColorBalance'); cb.correction_method = 'LIFT_GAMMA_GAIN'; cb.location = (-300, 0)
    presets = {
        'day':     ((0.98, 1.0, 1.04), (1.0, 1.0, 1.0), (1.04, 1.01, 0.97)),
        'harsh':   ((1.0, 0.99, 0.98), (1.02, 1.0, 0.96), (1.08, 1.02, 0.92)),
        'sunset':  ((0.97, 0.98, 1.06), (1.03, 0.98, 0.95), (1.12, 0.98, 0.86)),
        'dusk':    ((0.95, 0.97, 1.08), (0.98, 0.98, 1.04), (1.02, 0.98, 1.0)),
        'night':   ((0.94, 0.97, 1.1), (0.95, 0.98, 1.08), (0.92, 0.98, 1.1)),
        'overcast':((0.98, 1.0, 1.02), (0.98, 1.0, 1.02), (0.98, 1.0, 1.02)),
        'under':   ((0.95, 1.0, 1.04), (0.98, 1.01, 1.02), (0.98, 1.03, 1.03)),
        'golden':  ((0.97, 0.98, 1.05), (1.02, 1.0, 0.96), (1.1, 1.0, 0.9)),
        'neutral': ((1, 1, 1), (1, 1, 1), (1, 1, 1)),
    }
    lift, gamma, gain = presets.get(grade, presets['day'])
    cb.lift = lift; cb.gamma = gamma; cb.gain = gain
    L.new(cur, cb.inputs['Image']); cur = cb.outputs['Image']
    hsv = N.new('CompositorNodeHueSat'); hsv.location = (-100, 0)
    hsv.inputs['Saturation'].default_value = {'night': 0.95, 'overcast': 0.92, 'under': 1.05}.get(grade, 1.08)
    L.new(cur, hsv.inputs['Image']); cur = hsv.outputs['Image']
    if lens_dist:
        ld = N.new('CompositorNodeLensdist'); ld.location = (100, 0); ld.inputs['Distortion'].default_value = lens_dist
        ld.inputs['Dispersion'].default_value = 0.012
        L.new(cur, ld.inputs['Image']); cur = ld.outputs['Image']
    if vignette > 0:
        # elliptical vignette
        el = N.new('CompositorNodeEllipseMask'); el.location = (100, -300)
        el.width = 1.25; el.height = 1.05
        bl = N.new('CompositorNodeBlur'); bl.location = (300, -300); bl.size_x = 220; bl.size_y = 380; bl.filter_type = 'GAUSS'
        if hasattr(bl, 'use_relative'): bl.use_relative = False
        L.new(el.outputs['Mask'], bl.inputs['Image'])
        mr = N.new('CompositorNodeMapRange'); mr.location = (500, -300)
        mr.inputs['To Min'].default_value = 1.0 - vignette; mr.inputs['To Max'].default_value = 1.0
        L.new(bl.outputs['Image'], mr.inputs['Value'])
        mul = N.new('CompositorNodeMixRGB'); mul.blend_type = 'MULTIPLY'; mul.location = (700, 0)
        L.new(cur, mul.inputs[1]); L.new(mr.outputs[0], mul.inputs[2]); mul.inputs[0].default_value = 1.0
        cur = mul.outputs['Image']
    L.new(cur, comp.inputs['Image'])
    return nt

# --------------------------------------------------------------------------- camera
def add_camera(name='Cam', lens=35.0, loc=(0, -6, 1.2), target=None, dof=None, clip=(0.05, 60000)):
    cd = bpy.data.cameras.new(name); cd.lens = lens; cd.sensor_width = 36
    cd.clip_start, cd.clip_end = clip
    cam = bpy.data.objects.new(name, cd); bpy.context.scene.collection.objects.link(cam); link(cam, 'Cameras')
    cam.location = loc
    if target is not None:
        look_at(cam, target)
    if dof:
        cd.dof.use_dof = True; cd.dof.aperture_fstop = dof.get('fstop', 2.8)
        if 'obj' in dof: cd.dof.focus_object = dof['obj']
        if 'dist' in dof: cd.dof.focus_distance = dof['dist']
    bpy.context.scene.camera = cam
    return cam

def look_at(obj, target, roll=0.0):
    t = Vector(target)
    d = t - obj.location
    q = d.to_track_quat('-Z', 'Y')
    e = q.to_euler()
    if roll:
        e.rotate_axis('Z', roll) if False else None
        obj.rotation_euler = e
        obj.rotation_euler.rotate(Euler((0, 0, 0)))
    obj.rotation_euler = e
    return e

def key_cam(cam, frame, loc, target, lens=None, roll=0.0):
    cam.location = loc
    q = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y')
    if roll:
        from mathutils import Quaternion
        q = q @ Quaternion((0, 0, 1), roll)
    cam.rotation_mode = 'QUATERNION'
    cam.rotation_quaternion = q
    cam.keyframe_insert('location', frame=frame)
    cam.keyframe_insert('rotation_quaternion', frame=frame)
    if lens is not None:
        cam.data.lens = lens; cam.data.keyframe_insert('lens', frame=frame)

def aim(cam, target_obj):
    """Point the camera at an object (keeps framing on a character riding the swell)."""
    c = cam.constraints.new('TRACK_TO'); c.target = target_obj; c.track_axis = 'TRACK_NEGATIVE_Z'; c.up_axis = 'UP_Y'
    return c

def key_loc(cam, frame, loc, lens=None):
    cam.location = loc; cam.keyframe_insert('location', frame=frame)
    if lens is not None:
        cam.data.lens = lens; cam.data.keyframe_insert('lens', frame=frame)

def handheld(obj, amp_loc=0.01, amp_rot=0.004, freq=0.6, seed=0):
    """Organic camera-operator drift via noise modifiers on the f-curves."""
    ad = obj.animation_data or obj.animation_data_create()
    if ad.action is None:
        obj.keyframe_insert('location', frame=bpy.context.scene.frame_start)
        if obj.rotation_mode == 'QUATERNION':
            obj.keyframe_insert('rotation_quaternion', frame=bpy.context.scene.frame_start)
        else:
            obj.keyframe_insert('rotation_euler', frame=bpy.context.scene.frame_start)
    i = 0
    for fc in _fcurves(ad.action):
        if fc.data_path not in ('location', 'rotation_euler', 'rotation_quaternion'): continue
        if fc.data_path == 'rotation_quaternion' and fc.array_index == 0: continue
        mod = fc.modifiers.new('NOISE')
        mod.scale = 30.0 / max(freq, 0.01)
        mod.strength = (amp_loc if fc.data_path == 'location' else amp_rot) * 2
        mod.phase = seed * 13.7 + i * 7.3
        mod.depth = 1
        i += 1

def _fcurves(action):
    """Blender 4.4+ layered actions: iterate all f-curves."""
    if hasattr(action, 'fcurves') and len(action.fcurves):
        return list(action.fcurves)
    out = []
    for layer in getattr(action, 'layers', []):
        for strip in layer.strips:
            for bag in getattr(strip, 'channelbags', []):
                out.extend(bag.fcurves)
    return out

def fcurves_of(id_):
    ad = id_.animation_data
    return _fcurves(ad.action) if ad and ad.action else []

def set_interp(id_, interp='BEZIER', easing='AUTO'):
    for fc in fcurves_of(id_):
        for k in fc.keyframe_points:
            k.interpolation = interp; k.easing = easing

# --------------------------------------------------------------------------- utils
def render_frames(out_dir, frames=None, step=1):
    sc = bpy.context.scene
    os.makedirs(out_dir, exist_ok=True)
    fs = frames or range(sc.frame_start, sc.frame_end + 1, step)
    import time
    for f in fs:
        sc.frame_set(f)
        sc.render.filepath = os.path.join(out_dir, '%04d.png' % f)
        t = time.time()
        bpy.ops.render.render(write_still=True)
        print('FRAME %d %.1fs' % (f, time.time() - t), flush=True)
