"""S15 – 'can carry parasites and bacteria' Macro dive into the water: Giardia cysts/trophozoites and bacteria drift past."""
import sys; sys.path.insert(0, '/home/user/code/amazon_short/scripts')
from shotlib import *
import creatures as CR, random
s, sh = setup('S15', samples=8); N = sh['frames']
s.render.use_motion_blur = True
w = bpy.data.worlds.new('W'); s.world = w; w.use_nodes = True; bg = w.node_tree.nodes['Background']
bg.inputs[0].default_value = (0.06, 0.09, 0.05, 1); bg.inputs[1].default_value = 1.0
# murky water volume look: large emissive gradient backdrop + particles of silt
bpy.ops.mesh.primitive_uv_sphere_add(radius=30); sk = bpy.context.active_object; sk.name = 'FX_WaterBG'
m = bpy.data.materials.new('MAT_WaterBG'); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
tc = nt.nodes.new('ShaderNodeTexCoord'); gr = nt.nodes.new('ShaderNodeTexNoise'); gr.inputs['Scale'].default_value = 0.6
em = nt.nodes.new('ShaderNodeEmission'); cr = nt.nodes.new('ShaderNodeValToRGB')
cr.color_ramp.elements[0].color = (0.05, 0.07, 0.03, 1); cr.color_ramp.elements[1].color = (0.32, 0.30, 0.12, 1)
nt.links.new(tc.outputs['Object'], gr.inputs[0]); nt.links.new(gr.outputs['Fac'], cr.inputs[0]); nt.links.new(cr.outputs[0], em.inputs[0])
out = nt.nodes.new('ShaderNodeOutputMaterial'); nt.links.new(em.outputs[0], out.inputs[0]); sk.data.materials.append(m)
rnd = random.Random(15)
mic = []
for i in range(3):
    o, fl = CR.giardia(f'CR_Giardia_{i}', 0.5 + 0.2 * i)
    o.location = (rnd.uniform(-1.2, 1.2), rnd.uniform(4, 9), rnd.uniform(-1.2, 1.2)); mic.append(o)
for i in range(18):
    b = CR.bacterium(f'CR_Bact_{i%3}{i}', color=[(0.85, 0.5, 0.35, 1), (0.6, 0.75, 0.4, 1), (0.8, 0.7, 0.45, 1)][i % 3])
    b.scale = (0.18,) * 3; b.location = (rnd.uniform(-2.5, 2.5), rnd.uniform(2, 14), rnd.uniform(-2.5, 2.5)); mic.append(b)
for o in mic:
    r0 = Vector((rnd.uniform(0, 6), rnd.uniform(0, 6), rnd.uniform(0, 6)))
    for f in (1, N):
        o.location += Vector((rnd.uniform(-0.3, 0.3), rnd.uniform(-0.6, 0.0), rnd.uniform(-0.3, 0.3))) * (0 if f == 1 else 1)
        o.rotation_euler = r0 + Vector((0.5, 0.8, 0.3)) * (f / N) * rnd.uniform(0.5, 1.5)
        o.keyframe_insert('location', frame=f); o.keyframe_insert('rotation_euler', frame=f)
# silt specks
sm = bpy.data.materials.new('MAT_Silt'); sm.use_nodes = True; sm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.5, 0.45, 0.3, 1)
for i in range(120):
    bpy.ops.mesh.primitive_ico_sphere_add(radius=rnd.uniform(0.005, 0.03), subdivisions=1, location=(rnd.uniform(-4, 4), rnd.uniform(0, 16), rnd.uniform(-4, 4)))
    bpy.context.active_object.data.materials.append(sm)
l = bpy.data.lights.new('K', 'AREA'); l.energy = 800; l.size = 6; lo = bpy.data.objects.new('K', l); s.collection.objects.link(lo); lo.location = (2, 3, 6); lo.rotation_euler = look_at_rot(lo.location, (0, 6, 0))
cam = camera('CAM', (0, -2, 0), (0, 6, 0), 35)
cam_path(cam, [(1, (0, -3.0, 0.1), (0, 6, 0)), (N, (0, 1.8, 0.0), (0.1, 8, 0))])
focus_on(cam, mic[0], None, 1.4)
ENV.mist_fog(1, 12, (0.18, 0.2, 0.1), 0.6, glare=True)
finish(s, 'S15'); render_if_requested()
