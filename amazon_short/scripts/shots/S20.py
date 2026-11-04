"""S20 – 'Small streams flow into bigger rivers, and rivers are where people live.' Map-like aerial: glowing chevrons
run down the stream into the river and on to a riverside village."""
import sys; sys.path.insert(0, '/home/user/code/amazon_short/scripts')
from shotlib import *
import aerial as AE
s, sh = setup('S20'); N = sh['frames']
RIV = dict(y=150, width=95); ST = dict(p0=(-260, -330), p1=(0, AE.river_center(0, RIV) - 40), width=7)
huts = [(170 + 14 * k, AE.river_center(170 + 14 * k, RIV) - RIV['width'] / 2 - 14 - 5 * (k % 2)) for k in range(5)]
A = AE.build_aerial(dict(center=(0, 0), size=1100, res=4.0, seed=2, river=RIV, stream=ST, huts=huts, mist=0.35, mist_levels=[48]))
ENV.world_hdri(1.0, 1.0, 'kloofendal_48d_partly_cloudy_puresky_2k.hdr'); s.view_settings.exposure = 0.3
ENV.sun(4.5, (math.radians(40), 0, math.radians(160)), (1.0, 0.95, 0.85), 1.0)
# path curve: stream -> river (downstream towards +x) -> village
pts = [AE.stream_line(ST, k / 30) for k in range(31)] + [Vector((x, AE.river_center(x, RIV))) for x in range(10, 200, 20)]
cu = bpy.data.curves.new('FX_FlowPath', 'CURVE'); cu.dimensions = '3D'; sp = cu.splines.new('POLY'); sp.points.add(len(pts) - 1)
for i, p in enumerate(pts): sp.points[i].co = (p.x, p.y, 9, 1)
path = bpy.data.objects.new('FX_FlowPath', cu); s.collection.objects.link(path)
em = bpy.data.materials.new('MAT_Chevron'); em.use_nodes = True; nt = em.node_tree; nt.nodes.clear()
e = nt.nodes.new('ShaderNodeEmission'); e.inputs[0].default_value = (1.0, 0.85, 0.3, 1); e.inputs[1].default_value = 12
o_ = nt.nodes.new('ShaderNodeOutputMaterial'); nt.links.new(e.outputs[0], o_.inputs[0])
for k in range(14):
    bpy.ops.mesh.primitive_cone_add(vertices=3, radius1=9, depth=2, location=(0, 0, 0)); c = bpy.context.active_object; c.name = f'FX_Chevron_{k}'
    c.scale = (1.0, 0.55, 0.2); c.rotation_euler = (0, 0, math.radians(-90)); c.data.materials.append(em)
    fp = c.constraints.new('FOLLOW_PATH'); fp.target = path; fp.use_curve_follow = True; fp.forward_axis = 'FORWARD_X'; fp.use_fixed_location = True
    for f, v in ((1, -0.08 * k), (N, 1.15 - 0.08 * k)):
        fp.offset_factor = max(0, min(1, v)); fp.keyframe_insert('offset_factor', frame=f)
    for f, sc in ((1, 0.0), (1 + 6 * k, 0.0), (8 + 6 * k, 1.0)):
        c.scale = (sc, 0.55 * sc, 0.2 * max(sc, 0.01)); c.keyframe_insert('scale', frame=f)
# village highlight ring
bpy.ops.mesh.primitive_torus_add(major_radius=1, minor_radius=0.03, location=(huts[2][0], huts[2][1], 10)); ring = bpy.context.active_object; ring.name = 'FX_VillageRing'
ring.data.materials.append(em)
for f, r in ((1, 0.01), (70, 0.01), (90, 60), (N, 64)):
    ring.scale = (r, r, r); ring.keyframe_insert('scale', frame=f)
cam = camera('CAM', (-80, -260, 600), (-40, -40, 0), 30)
cam_path(cam, [(1, (-120, -360, 560), (-80, -120, 0)), (N, (70, -120, 520), (110, 120, 0))])
cam.data.dof.use_dof = False; cam.data.clip_end = 3000
ENV.mist_fog(200, 1400, (0.75, 0.8, 0.85), 0.35, glare=True)
finish(s, 'S20'); render_if_requested()
