"""Secondary sets + hand props."""
import bpy, bmesh, math, sys
sys.path.insert(0, '/opt/work/scripts')
from props import *
from mathutils import Vector

def img_mat(name, path, rough=0.6, emit=0.0):
    m = bpy.data.materials.get(name)
    if m: return m
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; b = nt.nodes['Principled BSDF']
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(path, check_existing=True)
    nt.links.new(t.outputs['Color'], b.inputs['Base Color']); b.inputs['Roughness'].default_value = rough
    if emit:
        nt.links.new(t.outputs['Color'], b.inputs['Emission Color']); b.inputs['Emission Strength'].default_value = emit
    return m

def dark_room(name, center, size=(16, 16, 8), color=(0.012, 0.012, 0.014), c=None):
    """Inverted box so the outside HDRI is not visible."""
    m = mat_color(name + '_mat', color, rough=0.9, spec=0.1)
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    bmesh.ops.reverse_faces(bm, faces=bm.faces)
    o = bpy.data.objects.new(name, bpy.data.meshes.new(name)); bm.to_mesh(o.data); bm.free()
    o.data.materials.append(m); (c or bpy.context.scene.collection).objects.link(o)
    o.location = (center[0], center[1], center[2] + size[2] / 2 - 0.001)
    return o

def spot(name, loc, target, energy=800, size=30, blend=0.4, color=(1, 0.9, 0.75), c=None, shadow=True, radius=0.1):
    l = bpy.data.lights.new(name, 'SPOT'); l.energy = energy; l.spot_size = R(size); l.spot_blend = blend
    l.color = color; l.use_shadow = shadow; l.shadow_soft_size = radius
    o = bpy.data.objects.new(name, l); (c or bpy.context.scene.collection).objects.link(o)
    o.location = loc; o.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    return o

def area(name, loc, target, energy=200, size=2.0, color=(1, 1, 1), c=None, shadow=False):
    l = bpy.data.lights.new(name, 'AREA'); l.energy = energy; l.size = size; l.color = color; l.use_shadow = shadow
    o = bpy.data.objects.new(name, l); (c or bpy.context.scene.collection).objects.link(o)
    o.location = loc; o.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    return o

# ------------------------------------------------------------------ props
def briefcase(name, c, color=(0.16, 0.08, 0.04)):
    m = mat_color(name + '_leather', color, rough=0.45, coat=0.15)
    o = box(name, (0.44, 0.11, 0.32), mat=m, c=c, bevel=0.015, seg=2)
    hm = mat_color('BriefHandle', (0.05, 0.03, 0.02), rough=0.4)
    h = box(name + '_handle', (0.13, 0.025, 0.035), loc=(0, 0, 0.19), mat=hm, c=c, bevel=0.008); h.parent = o
    gold = mat_color('Brass', (0.8, 0.6, 0.25), rough=0.3, metal=1.0)
    for x in (-0.13, 0.13):
        l = box(name + '_lock', (0.035, 0.012, 0.02), loc=(x, -0.058, 0.13), mat=gold, c=c); l.parent = o
    return o

def newspaper(name, c):
    m = img_mat('NewspaperMat', '/opt/work/tex/newspaper.png', rough=0.8)
    o = plane(name, 0.58, 0.40, mat=m, c=c)
    # subtle fold: a few subdivisions bent along the centre (simple v)
    sd = o.modifiers.new('sd', 'SUBSURF'); sd.levels = 0; sd.render_levels = 0
    so = o.modifiers.new('fold', 'SIMPLE_DEFORM'); so.deform_method = 'BEND'; so.angle = R(-25); so.deform_axis = 'Y'
    o.data.materials[0] = m
    # rotate UV so the page is landscape spread
    return o

def diary(name, c, open_=True):
    pm = img_mat('DiaryPages', '/opt/work/tex/diary.png', rough=0.85)
    cm = mat_color('DiaryCover', (0.12, 0.18, 0.1), rough=0.6)
    root = bpy.data.objects.new(name, None); c.objects.link(root)
    cov = box(name + '_cover', (0.42, 0.29, 0.012), loc=(0, 0, 0.0), mat=cm, c=c, bevel=0.003); cov.parent = root
    pg = plane(name + '_pages', 0.40, 0.275, loc=(0, 0, 0.012), mat=pm, c=c); pg.parent = root
    return root

def notebook_stack(name, c, n=14, loc=(0, 0, 0)):
    root = bpy.data.objects.new(name, None); c.objects.link(root)
    cols = [(0.12, 0.18, 0.1), (0.3, 0.07, 0.05), (0.08, 0.12, 0.28), (0.25, 0.2, 0.1), (0.1, 0.1, 0.1)]
    rnd = __import__('random').Random(5)
    parts = []
    for i in range(n):
        m = mat_color('NB%d' % (i % 5), cols[i % 5], rough=0.6)
        b = box(name + '_%d' % i, (0.21, 0.29, 0.022), loc=(rnd.uniform(-0.01, 0.01), rnd.uniform(-0.01, 0.01), 0.011 + i * 0.023), rot=(0, 0, R(rnd.uniform(-6, 6))), mat=m, c=c, bevel=0.003)
        b.parent = root; parts.append(b)
    root.location = loc
    return root, parts

def pen(name, c):
    o = cyl(name, 0.005, 0.14, rot=(0, R(90), 0), mat=mat_color('PenBlack', (0.02, 0.02, 0.025), rough=0.3), c=c, verts=10)
    t = cyl(name + '_tip', 0.005, 0.02, loc=(0.08, 0, 0), rot=(0, R(90), 0), r2=0.001, mat=mat_color('PenSilver', (0.7, 0.7, 0.7), metal=1, rough=0.2), c=c, verts=10)
    t.parent = o
    return o

def paper_bag(name, c):
    m = img_mat('PaperBag', '/opt/work/tex/paperbag.png', rough=0.85)
    o = box(name, (0.16, 0.1, 0.24), mat=m, c=c, bevel=0.004)
    return o

def coffee_cup(name, c):
    o = cyl(name, 0.04, 0.11, r2=0.048, mat=mat_color('CupWhite', (0.9, 0.88, 0.84), rough=0.4), c=c, verts=16)
    l = cyl(name + '_lid', 0.05, 0.012, loc=(0, 0, 0.06), mat=mat_color('LidBrown', (0.25, 0.15, 0.1), rough=0.4), c=c, verts=16); l.parent = o
    return o

def document(name, tex, c, w=0.21, h=0.297):
    m = img_mat('Doc_' + name, tex, rough=0.8)
    return plane(name, w, h, mat=m, c=c)

def rubber_stamp(name, c):
    wood = mat_color('StampWood', (0.35, 0.2, 0.1), rough=0.5)
    o = box(name, (0.07, 0.05, 0.025), mat=mat_color('StampBase', (0.05, 0.05, 0.05), rough=0.6), c=c, bevel=0.003)
    h = cyl(name + '_h', 0.016, 0.09, loc=(0, 0, 0.055), mat=wood, c=c, verts=12); h.parent = o
    k = sphere(name + '_k', 0.026, loc=(0, 0, 0.11), mat=wood, c=c); k.parent = o
    return o

def razor(name, c):
    return box(name, (0.045, 0.03, 0.13), mat=mat_color('RazorBody', (0.08, 0.08, 0.09), rough=0.35), c=c, bevel=0.01)

def blanket(name, c, size=(1.7, 0.8)):
    m = mat_color('Coat', (0.16, 0.14, 0.12), rough=0.85, spec=0.2)
    bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=24, y_segments=12, size=0.5)
    bmesh.ops.scale(bm, vec=Vector((size[0], size[1], 1)), verts=bm.verts)
    import random as _r; rr = _r.Random(2)
    for v in bm.verts:
        v.co.z = 0.05 * math.sin(v.co.x * 9) * math.cos(v.co.y * 7) + rr.uniform(-0.008, 0.008)
        # drape the edges down
        e = max(0.0, abs(v.co.y) - size[1] * 0.25) / (size[1] * 0.25)
        v.co.z -= 0.22 * e * e
    o = _obj(name, bm, m, c)
    for p in o.data.polygons: p.use_smooth = True
    sol = o.modifiers.new('sol', 'SOLIDIFY'); sol.thickness = 0.01
    return o

def _obj(name, bm, mat, c):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); c.objects.link(o); me.materials.append(mat)
    return o

def luggage_tag(name, c):
    m = img_mat('TagMat', '/opt/work/tex/tag.png', rough=0.8)
    return plane(name, 0.12, 0.06, mat=m, c=c)

# ------------------------------------------------------------------ airliner
def airliner(name, c, L=38.0):
    """Generic twin-jet airliner (no real livery)."""
    body_m = bpy.data.materials.new('PlaneBody'); body_m.use_nodes = True
    nt = body_m.node_tree; b = nt.nodes['Principled BSDF']
    b.inputs['Roughness'].default_value = 0.25; b.inputs['Coat Weight'].default_value = 0.3
    tc = nt.nodes.new('ShaderNodeTexCoord'); sx = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(tc.outputs['Object'], sx.inputs[0])
    ramp = nt.nodes.new('ShaderNodeValToRGB'); nt.links.new(sx.outputs['Z'], ramp.inputs[0])
    # map z (-2..2) via map range first
    mr = nt.nodes.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = -2.0; mr.inputs['From Max'].default_value = 2.0
    nt.links.new(sx.outputs['Z'], mr.inputs['Value']); nt.links.new(mr.outputs[0], ramp.inputs[0])
    cr = ramp.color_ramp; cr.interpolation = 'CONSTANT'
    cr.elements[0].position = 0.0; cr.elements[0].color = (0.55, 0.57, 0.6, 1)
    cr.elements[1].position = 0.40; cr.elements[1].color = (0.92, 0.93, 0.94, 1)
    e = cr.elements.new(0.52); e.color = (0.05, 0.12, 0.42, 1)
    e = cr.elements.new(0.555); e.color = (0.92, 0.93, 0.94, 1)
    # windows: brick texture mask in band 0.58..0.62
    br = nt.nodes.new('ShaderNodeTexBrick'); br.inputs['Scale'].default_value = 1.0
    br.inputs['Mortar Size'].default_value = 0.02
    br.inputs['Brick Width'].default_value = 0.5; br.inputs['Row Height'].default_value = 5.0
    nt.links.new(tc.outputs['Object'], br.inputs['Vector'])
    band_lo = nt.nodes.new('ShaderNodeMath'); band_lo.operation = 'GREATER_THAN'; band_lo.inputs[1].default_value = 0.585
    band_hi = nt.nodes.new('ShaderNodeMath'); band_hi.operation = 'LESS_THAN'; band_hi.inputs[1].default_value = 0.63
    nt.links.new(mr.outputs[0], band_lo.inputs[0]); nt.links.new(mr.outputs[0], band_hi.inputs[0])
    andn = nt.nodes.new('ShaderNodeMath'); andn.operation = 'MULTIPLY'; nt.links.new(band_lo.outputs[0], andn.inputs[0]); nt.links.new(band_hi.outputs[0], andn.inputs[1])
    win = nt.nodes.new('ShaderNodeMath'); win.operation = 'MULTIPLY'; nt.links.new(andn.outputs[0], win.inputs[0]); nt.links.new(br.outputs['Fac'], win.inputs[1])
    inv = nt.nodes.new('ShaderNodeMath'); inv.operation = 'SUBTRACT'; inv.inputs[0].default_value = 1.0; nt.links.new(br.outputs['Fac'], inv.inputs[1])
    win2 = nt.nodes.new('ShaderNodeMath'); win2.operation = 'MULTIPLY'; nt.links.new(andn.outputs[0], win2.inputs[0]); nt.links.new(inv.outputs[0], win2.inputs[1])
    mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'; nt.links.new(win2.outputs[0], mx.inputs['Factor'])
    nt.links.new(ramp.outputs['Color'], mx.inputs['A']); mx.inputs['B'].default_value = (0.02, 0.03, 0.04, 1)
    nt.links.new(mx.outputs['Result'], b.inputs['Base Color'])

    root = bpy.data.objects.new(name, None); c.objects.link(root)
    R0 = 2.0
    bm = bmesh.new()
    rings = []
    N = 40; seg = 24
    for i in range(N + 1):
        t = i / N; x = -L / 2 + t * L
        if t < 0.12: r = R0 * math.sqrt(1 - ((0.12 - t) / 0.12) ** 2) ; zc = -0.25 * (0.12 - t) / 0.12
        elif t > 0.72:
            u = (t - 0.72) / 0.28; r = R0 * (1 - u) ** 0.9 + 0.08; zc = 1.5 * u ** 1.4
        else: r = R0; zc = 0.0
        ring = []
        for j in range(seg):
            a = 2 * math.pi * j / seg
            ring.append(bm.verts.new((x, r * math.cos(a), zc + r * math.sin(a) * 1.05)))
        rings.append(ring)
    for i in range(N):
        for j in range(seg):
            bm.faces.new((rings[i][j], rings[i][(j + 1) % seg], rings[i + 1][(j + 1) % seg], rings[i + 1][j]))
    bm.faces.new(list(reversed(rings[0]))); bm.faces.new(rings[-1])
    fus = _obj(name + '_fuselage', bm, body_m, c); fus.parent = root
    for p in fus.data.polygons: p.use_smooth = True
    wing_m = mat_color('PlaneWing', (0.78, 0.79, 0.81), rough=0.35, metal=0.2)
    def tapered(nm, span, root_c, tip_c, sweep, thick, loc, dihedral=5, vertical=False):
        bm = bmesh.new()
        pts = [(0, 0), (root_c, 0), (sweep + tip_c, span), (sweep, span)]
        vs_t = [bm.verts.new((p[0], p[1], thick / 2)) for p in pts]
        vs_b = [bm.verts.new((p[0], p[1], -thick / 2)) for p in pts]
        bm.faces.new(vs_t); bm.faces.new(list(reversed(vs_b)))
        for i in range(4):
            j = (i + 1) % 4; bm.faces.new((vs_t[i], vs_b[i], vs_b[j], vs_t[j]))
        o = _obj(nm, bm, wing_m, c); o.parent = root; o.location = loc
        if vertical: o.rotation_euler = (R(90), 0, 0)
        else: o.rotation_euler = (R(dihedral), 0, 0)
        bv = o.modifiers.new('b', 'BEVEL'); bv.width = 0.05; bv.segments = 2
        return o
    for s in (1, -1):
        w = tapered(name + '_wing', 15.0, 6.5, 1.6, 6.5, 0.45, (-3.0, 0, -1.1))
        if s < 0: w.scale = (1, -1, 1)
        hs = tapered(name + '_hstab', 6.0, 3.2, 1.0, 3.2, 0.2, (13.2, 0, 1.6))
        if s < 0: hs.scale = (1, -1, 1)
        eng = cyl(name + '_engine', 1.15, 4.2, loc=(-4.5, s * 5.6, -2.2), rot=(0, R(90), 0), mat=wing_m, c=c, verts=24); eng.parent = root
        intake = cyl(name + '_intake', 0.95, 0.1, loc=(-6.62, s * 5.6, -2.2), rot=(0, R(90), 0), mat=mat_color('EngineDark', (0.02, 0.02, 0.02), rough=0.5), c=c, verts=24); intake.parent = root
        pylon = box(name + '_pylon', (3.0, 0.3, 1.0), loc=(-3.6, s * 5.6, -1.5), mat=wing_m, c=c); pylon.parent = root
    fin_m = mat_color('PlaneFin', (0.05, 0.12, 0.42), rough=0.3)
    fin = tapered(name + '_fin', 6.5, 5.0, 1.6, 5.0, 0.3, (12.0, 0, 1.8), vertical=True)
    fin.data.materials[0] = fin_m
    # landing gear (simple)
    gm = mat_color('Gear', (0.1, 0.1, 0.1), rough=0.5)
    for x, y in ((-14.5, 0), (0.5, 2.4), (0.5, -2.4)):
        g = cyl(name + '_gear', 0.08, 1.6, loc=(x, y, -2.6), mat=gm, c=c, verts=8); g.parent = root
        wh = cyl(name + '_wheel', 0.5, 0.35, loc=(x, y, -3.3), rot=(R(90), 0, 0), mat=mat_color('Rubber', (0.02, 0.02, 0.02), rough=0.8), c=c, verts=16); wh.parent = root
    return root

# ------------------------------------------------------------------ sets
def office_void(c, base=(-80.0, 0.0)):
    """Belgium 1981: a desk in the dark under a lamp."""
    bx, by = base
    dark_room('OfficeVoid', (bx, by, 0), (14, 14, 7), c=c)
    floor = plane('OfficeFloor', 14, 14, loc=(bx, by, 0.001), mat=mat_tex('OfficeFloorMat', 'large_grey_tiles', scale=0.8, tint=(0.35, 0.33, 0.3), sat=0.4), c=c); world_uv(floor)
    wood = mat_color('OfficeDesk', (0.28, 0.15, 0.07), rough=0.35, coat=0.2)
    box('OfficeDeskTop', (1.6, 0.8, 0.05), loc=(bx, by, 0.75), mat=wood, c=c, bevel=0.01)
    for x in (-0.75, 0.75):
        box('OfficeDeskSide', (0.06, 0.75, 0.73), loc=(bx + x, by, 0.365), mat=wood, c=c)
    lamp_g = mat_color('BankerGreen', (0.03, 0.25, 0.1), rough=0.2, coat=0.4)
    cyl('LampBase', 0.08, 0.03, loc=(bx + 0.55, by + 0.15, 0.79), mat=mat_color('Brass', (0.8, 0.6, 0.25), rough=0.3, metal=1.0), c=c)
    cyl('LampStem', 0.01, 0.3, loc=(bx + 0.55, by + 0.15, 0.93), mat=mat_color('Brass', (0.8, 0.6, 0.25), rough=0.3, metal=1.0), c=c)
    cyl('LampShade', 0.1, 0.25, loc=(bx + 0.55, by + 0.05, 1.08), rot=(0, R(90), R(90)), mat=lamp_g, c=c)
    pl = bpy.data.lights.new('DeskLamp', 'POINT'); pl.energy = 35; pl.color = (1, 0.82, 0.55); pl.shadow_soft_size = 0.05
    po = bpy.data.objects.new('DeskLamp', pl); c.objects.link(po); po.location = (bx + 0.55, by + 0.05, 1.0)
    spot('OfficeKey', (bx - 1.2, by - 2.0, 3.0), (bx, by, 0.9), energy=600, size=40, c=c)
    area('OfficeRim', (bx + 1.5, by + 2.0, 2.4), (bx, by, 1.2), energy=150, size=1.5, color=(0.6, 0.75, 1.0), c=c)
    # small Belgian flag on desk
    cyl('FlagPole', 0.004, 0.3, loc=(bx - 0.65, by + 0.25, 0.92), mat=mat_color('Chrome', (0.8, 0.8, 0.8), metal=1, rough=0.2), c=c, verts=8)
    for i, col in enumerate([(0.02, 0.02, 0.02), (0.95, 0.8, 0.05), (0.8, 0.05, 0.08)]):
        plane('Flag%d' % i, 0.04, 0.09, loc=(bx - 0.63 + i * 0.04, by + 0.25, 1.02), rot=(R(90), 0, 0), mat=mat_color('Flag%d' % i, col, rough=0.6), c=c)
    return (bx, by)

def theft_set(c, base=(-80.0, 40.0)):
    bx, by = base
    dark_room('TheftVoid', (bx, by, 0), (20, 20, 9), color=(0.01, 0.012, 0.016), c=c)
    floor = plane('TheftFloor', 20, 20, loc=(bx, by, 0.001), mat=mat_tex('TheftFloorMat', 'large_grey_tiles', scale=0.7, tint=(0.4, 0.4, 0.42), sat=0.2, rough_mul=0.4), c=c); world_uv(floor)
    spot('TheftKey', (bx + 0.5, by - 1.0, 5.0), (bx, by, 0.4), energy=1500, size=38, blend=0.5, color=(1.0, 0.85, 0.65), c=c)
    area('TheftRim', (bx - 3, by + 3, 3), (bx, by, 1.0), energy=250, size=3, color=(0.4, 0.55, 1.0), c=c)
    # station hint: big glowing clock + sign far behind
    text('GareSign', 'PARIS', size=0.9, loc=(bx, by + 8.5, 4.5), mat=mat_emit('GareSignMat', (1.0, 0.85, 0.6), 2.0), c=c, fnt='Oswald.ttf')
    return (bx, by)

def immigration_set(c, base=(80.0, 40.0)):
    bx, by = base
    dark_room('ImmRoom', (bx, by, 0), (16, 16, 4), color=(0.35, 0.36, 0.38), c=c)
    floor = plane('ImmFloor', 16, 16, loc=(bx, by, 0.001), mat=mat_tex('ImmFloorMat', 'large_grey_tiles', scale=0.9, tint=(0.55, 0.56, 0.6), sat=0.2), c=c); world_uv(floor)
    desk_m = mat_color('ImmDesk', (0.55, 0.56, 0.58), rough=0.4)
    box('ImmBooth', (1.8, 0.9, 1.15), loc=(bx, by + 0.6, 0.575), mat=desk_m, c=c, bevel=0.02)
    box('ImmBoothTop', (1.9, 1.0, 0.04), loc=(bx, by + 0.6, 1.17), mat=mat_color('ImmTop', (0.85, 0.85, 0.83), rough=0.3), c=c, bevel=0.01)
    g = plane('ImmGlass', 1.8, 0.6, loc=(bx, by + 0.15, 1.5), rot=(R(90), 0, 0), mat=mat_color('Glass2', (0.8, 0.85, 0.9), rough=0.05, alpha=0.15), c=c)
    box('ImmSignBG', (3.2, 0.06, 0.55), loc=(bx, by + 2.5, 2.7), mat=mat_color('ImmSignBG', (0.05, 0.1, 0.3), rough=0.5), c=c)
    text('ImmSign', 'IMMIGRATION', size=0.26, loc=(bx, by + 2.46, 2.78), mat=mat_emit('ImmSignTxt', (1, 1, 1), 2.5), c=c, fnt='Oswald.ttf')
    text('ImmSign2', 'UNITED KINGDOM  ·  ARRIVALS', size=0.12, loc=(bx, by + 2.46, 2.56), mat=mat_emit('ImmSignTxt2', (1, 0.85, 0.2), 2.5), c=c, fnt='BarlowCondensed-SemiBold.ttf')
    plane('ImmLine', 2.5, 0.08, loc=(bx, by - 1.2, 0.003), mat=mat_color('ImmYellow', (0.9, 0.75, 0.05), rough=0.6), c=c)
    text('ImmLineTxt', 'PLEASE WAIT BEHIND THE LINE', size=0.09, loc=(bx, by - 1.32, 0.004), rot=(0, 0, 0), mat=mat_color('ImmYellow', (0.9, 0.75, 0.05), rough=0.6), c=c, fnt='BarlowCondensed-SemiBold.ttf')
    for x in (-3, 0, 3):
        area('ImmFluor%d' % x, (bx + x, by, 3.9), (bx + x, by, 0), energy=220, size=1.2, color=(0.88, 0.95, 1.0), c=c)
    spot('ImmKey', (bx - 1.5, by - 3.0, 3.2), (bx, by, 1.4), energy=400, size=45, c=c)
    return (bx, by)

def restroom_set(c, base=(80.0, 0.0)):
    bx, by = base
    tiles = mat_tex('RestTiles', 'long_white_tiles', scale=1.2, tint=(0.92, 0.94, 0.95), rough_mul=0.3, nor=0.5)
    fl = mat_tex('RestFloor', 'large_grey_tiles', scale=1.6, tint=(0.45, 0.47, 0.5), sat=0.2)
    W, D, Hh = 7.0, 5.0, 2.9
    f = plane('RestFloorP', W, D, loc=(bx, by, 0.001), mat=fl, c=c); world_uv(f)
    for nm, sz, lc in [('RestWallB', (W, 0.1, Hh), (bx, by + D / 2, Hh / 2)), ('RestWallF', (W, 0.1, Hh), (bx, by - D / 2, Hh / 2)),
                       ('RestWallL', (0.1, D, Hh), (bx - W / 2, by, Hh / 2)), ('RestWallR', (0.1, D, Hh), (bx + W / 2, by, Hh / 2))]:
        box(nm, sz, loc=lc, mat=tiles, c=c)
    box('RestCeil', (W, D, 0.1), loc=(bx, by, Hh), mat=mat_color('RestCeilMat', (0.85, 0.86, 0.86), rough=0.8), c=c)
    counter = mat_color('RestCounter', (0.18, 0.18, 0.2), rough=0.25, coat=0.3)
    box('RestCounterTop', (3.6, 0.6, 0.06), loc=(bx, by + D / 2 - 0.35, 0.86), mat=counter, c=c, bevel=0.01)
    box('RestCounterSkirt', (3.6, 0.04, 0.22), loc=(bx, by + D / 2 - 0.65, 0.75), mat=counter, c=c)
    porcelain = mat_color('Porcelain', (0.93, 0.93, 0.92), rough=0.12, coat=0.5)
    chrome = mat_color('Chrome', (0.8, 0.8, 0.8), metal=1, rough=0.15)
    for x in (-1.1, 0.0, 1.1):
        s = sphere('Basin', 0.22, loc=(bx + x, by + D / 2 - 0.36, 0.86), mat=porcelain, c=c, scale=(1.0, 0.75, 0.38))
        cyl('Faucet', 0.015, 0.18, loc=(bx + x, by + D / 2 - 0.12, 0.98), mat=chrome, c=c, verts=10)
        cyl('Spout', 0.012, 0.14, loc=(bx + x, by + D / 2 - 0.18, 1.06), rot=(R(90), 0, 0), mat=chrome, c=c, verts=10)
    # mirror (dark glossy; camera is 'in' the mirror for close-ups)
    plane('Mirror', 3.4, 1.0, loc=(bx, by + D / 2 - 0.06, 1.55), rot=(R(90), 0, 0), mat=mat_color('MirrorMat', (0.6, 0.62, 0.64), metal=1, rough=0.03), c=c)
    # stalls
    stall = mat_color('StallMetal', (0.42, 0.48, 0.52), rough=0.35, metal=0.3)
    for i in range(3):
        x = bx - W / 2 + 0.9 + i * 0.95
        box('StallWall', (0.03, 1.4, 1.9), loc=(x - 0.45, by - D / 2 + 0.75, 1.05), mat=stall, c=c)
        box('StallDoor', (0.85, 0.03, 1.8), loc=(x, by - D / 2 + 1.45, 1.0), mat=stall, c=c, bevel=0.005)
    box('HandDryer', (0.3, 0.2, 0.3), loc=(bx + W / 2 - 0.15, by + 0.3, 1.25), mat=mat_color('DryerWhite', (0.9, 0.9, 0.9), rough=0.3), c=c, bevel=0.03)
    for x in (-1.6, 0.0, 1.6):
        pl = plane('RestTube', 1.2, 0.18, loc=(bx + x, by + 0.4, Hh - 0.06), rot=(R(180), 0, 0), mat=mat_emit('TubeLight', (0.86, 0.95, 1.0), 6.0), c=c)
        area('RestFluor%d' % int(x * 10), (bx + x, by + 0.4, Hh - 0.12), (bx + x, by + 0.4, 0), energy=160, size=1.2, color=(0.85, 0.95, 1.0), c=c)
    spot('RestKey', (bx - 0.6, by + 0.2, 2.6), (bx, by + D / 2 - 0.5, 1.4), energy=250, size=55, color=(0.85, 0.93, 1.0), c=c)
    return (bx, by)

def runway_set(c, base=(0.0, -1200.0)):
    bx, by = base
    asph = mat_tex('RunwayAsphalt', 'asphalt_02', scale=0.06, tint=(0.45, 0.45, 0.46), nor=0.2)
    r = plane('Runway', 3000, 400, loc=(bx, by, 0), mat=asph, c=c); world_uv(r)
    grass = mat_color('Grass', (0.16, 0.2, 0.08), rough=0.9)
    plane('GrassL', 3000, 1500, loc=(bx, by + 800, -0.02), mat=grass, c=c)
    plane('GrassR', 3000, 1500, loc=(bx, by - 800, -0.02), mat=grass, c=c)
    wm = mat_color('RunwayWhite', (0.9, 0.9, 0.9), rough=0.6)
    for i in range(-40, 40):
        plane('Centerline', 30, 0.9, loc=(bx + i * 60, by, 0.01), mat=wm, c=c)
    for s in (-1, 1):
        plane('EdgeLine', 3000, 0.9, loc=(bx, by + s * 22, 0.01), mat=wm, c=c)
    lm = mat_emit('RunwayLight', (1.0, 0.9, 0.7), 8.0)
    for i in range(-60, 60):
        for s in (-1, 1):
            cyl('RLight', 0.12, 0.25, loc=(bx + i * 30, by + s * 24, 0.12), mat=lm, c=c, verts=6, smooth=False)
    plane_root = airliner('Airliner', c)
    plane_root.location = (bx + 150, by, 3.6)
    return plane_root
