"""SH14 - "To flush it out, your kidneys need more water than you drank. Every sip leaves you more dehydrated."
Clean 3D explainer (NOAA: kidneys can only make urine less salty than seawater, so flushing the salt costs more
water than was drunk).  Glass IN fills with salty seawater -> kidney pulses -> glass OUT fills HIGHER ->
a BODY WATER meter drains."""
import sys, math, os
sys.path.insert(0, '/home/user/code/blender/scripts/lib')
import bpy, env
from mathutils import Vector, Matrix
from char import ease, ease_out, ease_in
from common import frames_of

FONT = '/usr/share/fonts/opentype/inter/InterDisplay-Bold.otf'

def mat(name, color, rough=0.3, transmission=0.0, emission=None, ior=1.45, sss=0.0, alpha=1.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1); b.inputs['Roughness'].default_value = rough
    b.inputs['Transmission Weight'].default_value = transmission; b.inputs['IOR'].default_value = ior
    b.inputs['Subsurface Weight'].default_value = sss
    if emission:
        b.inputs['Emission Color'].default_value = (*emission[0], 1); b.inputs['Emission Strength'].default_value = emission[1]
    b.inputs['Alpha'].default_value = alpha
    return m

def text(body, loc, size, color, name, align='CENTER', emis=1.2):
    cu = bpy.data.curves.new(name, 'FONT'); cu.body = body
    cu.font = bpy.data.fonts.load(FONT, check_existing=True)
    cu.align_x = align; cu.align_y = 'CENTER'; cu.size = size; cu.extrude = 0.01
    o = bpy.data.objects.new(name, cu); bpy.context.scene.collection.objects.link(o)
    o.location = loc; o.rotation_euler = (math.radians(90), 0, 0)
    o.data.materials.append(mat(name + '_m', color, 0.4, emission=(color, emis)))
    return o

def glass(x, name, liquid_color, liquid_emit):
    # glass: open cylinder with thickness
    bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=0.42, depth=1.6, location=(x, 0, 0.8))
    g = bpy.context.object; g.name = name
    bm_del = g.data.polygons[-1]  # remove top cap
    import bmesh
    bm = bmesh.new(); bm.from_mesh(g.data)
    top = max(bm.faces, key=lambda f: f.calc_center_median().z)
    bmesh.ops.delete(bm, geom=[top], context='FACES'); bm.to_mesh(g.data); bm.free()
    so = g.modifiers.new('s', 'SOLIDIFY'); so.thickness = 0.035
    g.modifiers.new('b', 'BEVEL').width = 0.01
    bpy.ops.object.shade_smooth()
    g.data.materials.append(mat(name + '_glass', (0.9, 0.95, 1.0), 0.02, transmission=1.0, ior=1.5))
    # liquid: origin at the bottom so scaling Z fills it
    bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=0.38, depth=1.0, location=(x, 0, 0.5))
    lq = bpy.context.object; lq.name = name + '_liquid'
    lq.data.transform(Matrix.Translation((0, 0, 0.5))); lq.location = (x, 0, 0.04)
    bpy.ops.object.shade_smooth()
    lq.data.materials.append(mat(name + '_lq', liquid_color, 0.05, transmission=0.85, ior=1.33, emission=(liquid_emit, 0.25)))
    return g, lq

def build():
    sid = 'SH14'; N = frames_of(sid)   # 201
    sc = env.new_scene(res=(648, 1152), frames=(1, N))
    sc.cycles.samples = 16
    sc.view_settings.look = 'AgX - Medium High Contrast'
    # backdrop: deep ocean-blue gradient sweep
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
    w.node_tree.nodes['Background'].inputs[0].default_value = (0.004, 0.02, 0.045, 1); w.node_tree.nodes['Background'].inputs[1].default_value = 1.0
    bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 4, 0)); bd = bpy.context.object
    bd.rotation_euler = (math.radians(90), 0, 0)
    m = bpy.data.materials.new('bd'); m.use_nodes = True; nt = m.node_tree
    tc = nt.nodes.new('ShaderNodeTexCoord'); gr = nt.nodes.new('ShaderNodeTexGradient'); gr.gradient_type = 'SPHERICAL'
    mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (0.12, 0.12, 0.12); mp.inputs['Location'].default_value = (0, 0, 0)
    nt.links.new(tc.outputs['Object'], mp.inputs['Vector']); nt.links.new(mp.outputs[0], gr.inputs['Vector'])
    cr = nt.nodes.new('ShaderNodeValToRGB'); cr.color_ramp.elements[0].color = (0.002, 0.008, 0.02, 1); cr.color_ramp.elements[1].color = (0.03, 0.14, 0.24, 1)
    nt.links.new(gr.outputs['Fac'], cr.inputs['Fac'])
    em = nt.nodes.new('ShaderNodeEmission'); nt.links.new(cr.outputs['Color'], em.inputs['Color'])
    nt.links.new(em.outputs[0], nt.nodes['Material Output'].inputs['Surface'])
    m.cycles.emission_sampling = 'NONE'
    bd.data.materials.append(m)
    bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0, 0)); fl = bpy.context.object
    fl.data.materials.append(mat('floor', (0.006, 0.025, 0.05), 0.7))
    # lights
    for loc, e, sz in (((-3, -4, 5), 900, 4), ((4, -3, 3), 400, 3), ((0, 3, 4), 600, 3)):
        ld = bpy.data.lights.new('L', 'AREA'); ld.energy = e; ld.size = sz
        lo = bpy.data.objects.new('L', ld); sc.collection.objects.link(lo); lo.location = loc
        lo.rotation_euler = (Vector((0, 0, 0.8)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()

    # glasses
    gin, lin = glass(-0.62, 'GlassIn', (0.15, 0.55, 0.75), (0.1, 0.4, 0.6))
    gout, lout = glass(0.62, 'GlassOut', (0.95, 0.82, 0.25), (0.6, 0.45, 0.05))
    # fill animation
    for o_, keys in ((lin, [(1, 0.02), (40, 0.75), (201, 0.75)]), (lout, [(1, 0.02), (95, 0.02), (150, 1.05), (201, 1.05)])):
        for f, z in keys:
            o_.scale = (1, 1, z); o_.keyframe_insert('scale', frame=f)
    # salt crystals swirling in the IN glass
    import random
    rnd = random.Random(4)
    cm = mat('salt', (0.95, 0.97, 1.0), 0.15, emission=((0.9, 0.95, 1.0), 0.6))
    for i in range(70):
        bpy.ops.mesh.primitive_cube_add(size=0.035)
        c_ = bpy.context.object; c_.data.materials.append(cm); c_.parent = lin
        r = 0.3 * math.sqrt(rnd.random()); a = rnd.uniform(0, 6.28); h = rnd.uniform(0.05, 0.95)
        sp = rnd.uniform(0.5, 1.2)
        for f in range(1, N + 1, 6):
            aa = a + sp * f / 30
            c_.location = (math.cos(aa) * r, math.sin(aa) * r, h + 0.03 * math.sin(f / 9 + i))
            c_.rotation_euler = (f * 0.05 * sp, f * 0.03, i)
            c_.keyframe_insert('location', frame=f); c_.keyframe_insert('rotation_euler', frame=f)
            # crystals only appear once the glass has water
        c_.scale = (0, 0, 0); c_.keyframe_insert('scale', frame=10)
        c_.scale = (1, 1, 1); c_.keyframe_insert('scale', frame=40)
    # kidney: bean from a deformed sphere
    bpy.ops.mesh.primitive_uv_sphere_add(segments=64, ring_count=32, radius=0.5, location=(0, 0, 2.55))
    k = bpy.context.object; k.name = 'Kidney'; k.scale = (0.55, 0.38, 0.85)
    bd_ = k.modifiers.new('bend', 'SIMPLE_DEFORM'); bd_.deform_method = 'BEND'; bd_.deform_axis = 'Y'; bd_.angle = math.radians(-75)
    bpy.ops.object.shade_smooth()
    k.data.materials.append(mat('kidney', (0.55, 0.08, 0.1), 0.35, sss=0.4, emission=((0.4, 0.03, 0.05), 0.15)))
    for f in range(1, N + 1, 3):
        pulse = 1 + (0.06 * max(0, math.sin((f - 60) * 0.35)) if 60 < f < 160 else 0)
        k.scale = (0.55 * pulse, 0.38 * pulse, 0.85 * pulse); k.keyframe_insert('scale', frame=f)
    # arrows (flat): IN -> kidney -> OUT
    def arrow(p0, p1, name, f_in):
        p0 = Vector(p0); p1 = Vector(p1); dv = p1 - p0; ang = math.atan2(dv.z, dv.x)
        bpy.ops.mesh.primitive_cube_add(size=1, location=(p0 + p1) / 2)
        a = bpy.context.object; a.name = name; a.scale = (dv.length * 0.5, 0.02, 0.025); a.rotation_euler = (0, -ang, 0)
        bpy.ops.mesh.primitive_cone_add(vertices=3, radius1=0.09, depth=0.14, location=p1)
        h = bpy.context.object; h.rotation_euler = (0, math.radians(90) - ang, 0)
        am = mat(name + '_m', (1.0, 1.0, 1.0), 0.3, emission=((1, 1, 1), 2.0))
        for o_ in (a, h):
            o_.data.materials.append(am)
            o_.scale = o_.scale if o_ is a else (1, 1, 1)
            s0 = tuple(o_.scale)
            o_.scale = (0, 0, 0); o_.keyframe_insert('scale', frame=f_in)
            o_.scale = s0; o_.keyframe_insert('scale', frame=f_in + 10)
    arrow((-0.55, -0.1, 1.85), (-0.28, -0.1, 2.25), 'ArrowIn', 42)
    arrow((0.28, -0.1, 2.25), (0.55, -0.1, 1.85), 'ArrowOut', 92)
    # labels
    t1 = text('IN', (-0.62, -0.62, 1.25), 0.3, (0.55, 0.85, 1.0), 'TIn')
    t2 = text('OUT', (0.62, -0.62, 1.25), 0.3, (1.0, 0.85, 0.35), 'TOut')
    t3 = text('SEAWATER\n3.5% SALT', (-0.95, -0.5, 3.35), 0.19, (0.75, 0.9, 1.0), 'TSea')
    t4 = text('MORE WATER OUT\nTHAN IN', (0.85, -0.5, 3.35), 0.19, (1.0, 0.9, 0.55), 'TFlush')
    for t, f_in in ((t1, 5), (t3, 20), (t2, 90), (t4, 105)):
        t.scale = (0, 0, 0); t.keyframe_insert('scale', frame=f_in)
        t.scale = (1.1, 1.1, 1.1); t.keyframe_insert('scale', frame=f_in + 7)
        t.scale = (1, 1, 1); t.keyframe_insert('scale', frame=f_in + 11)
    # body water meter (drains at the end)
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, -1.6, 0.16)); frame_ = bpy.context.object
    frame_.scale = (1.5, 0.03, 0.12); frame_.data.materials.append(mat('meterbg', (0.05, 0.08, 0.12), 0.5))
    bpy.ops.mesh.primitive_cube_add(size=1, location=(-0.72, -1.63, 0.16)); bar = bpy.context.object
    bar.data.transform(Matrix.Translation((0.5, 0, 0))); bar.scale = (1.44, 0.03, 0.09)
    bmm = mat('meter', (0.2, 0.7, 1.0), 0.3, emission=((0.15, 0.6, 1.0), 2.0)); bar.data.materials.append(bmm)
    t5 = text('BODY WATER', (0, -1.6, 0.42), 0.16, (0.8, 0.9, 1.0), 'TBody')
    for o_ in (frame_, bar, t5):
        s0 = tuple(o_.scale); o_.scale = (0, 0, 0); o_.keyframe_insert('scale', frame=140); o_.scale = s0; o_.keyframe_insert('scale', frame=150)
    bar.scale = (1.44, 0.03, 0.09); bar.keyframe_insert('scale', frame=158)
    bar.scale = (0.55, 0.03, 0.09); bar.keyframe_insert('scale', frame=196)
    # meter turns from blue to red as it drains
    bsdf = bmm.node_tree.nodes['Principled BSDF']
    for f, c_ in ((158, (0.15, 0.6, 1.0)), (196, (1.0, 0.18, 0.1))):
        bsdf.inputs['Emission Color'].default_value = (*c_, 1); bsdf.inputs['Emission Color'].keyframe_insert('default_value', frame=f)
        bsdf.inputs['Base Color'].default_value = (*c_, 1); bsdf.inputs['Base Color'].keyframe_insert('default_value', frame=f)
    # camera: gentle push in
    cam = env.add_camera('Cam', lens=38)
    for f, p, t in ((1, (0, -7.6, 1.3), (0, 0, 1.15)), (201, (0, -7.0, 1.25), (0, 0, 1.12))):
        env.key_cam(cam, f, p, t, lens=38)
    env.set_interp(cam, 'BEZIER')
    env.setup_compositor('neutral', vignette=0.35)
    return sc
