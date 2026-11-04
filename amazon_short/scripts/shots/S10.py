"""S10 – 'people often walk in circles without realizing it.' Top-down: a glowing trace of his route loops back to the same log."""
import sys; sys.path.insert(0, '/home/user/code/amazon_short/scripts')
from shotlib import *
s, sh = setup('S10'); N = sh['frames']
E = ENV.build_env(forest_cfg(seed=81, cam=(0, 0, 9), density=1.0, clear=[(0, 0, 1.6), (2.4, 0, 1.0), (-2.4, 0, 1.0), (0, 2.4, 1.0), (0, -2.4, 1.0)],
                             giants=[(-7, 6, 1.4), (7, -6, 1.3), (6, 7, 1.1)], n_poles=40, n_canopy=30))
T = E['terrain']
Rr = 2.5
# distinctive landmark: mossy log with bright orange sulphur-shelf fungus (Laetiporus)
lc, _ = ENV.ph_objects('dead_tree_trunk')
lg = bpy.data.objects.new('PR_LandmarkLog', None); lg.instance_type = 'COLLECTION'; lg.instance_collection = lc
lg.location = (Rr + 0.6, -0.8, ENV.height_at(T, Rr + 0.6, -0.8) + 0.1); lg.rotation_euler.z = math.radians(80)
s.collection.objects.link(lg)
with bpy.data.libraries.load(ASSETS + 'quaternius/Stylized Nature MegaKit/glTF/Mushroom_Laetiporus.gltf' if False else BLEND + 'plants_lib.blend') as (a, b): pass
bpy.ops.import_scene.gltf(filepath=ASSETS + 'quaternius/Stylized Nature MegaKit/glTF/Mushroom_Laetiporus.gltf')
for o in bpy.context.selected_objects:
    if o.type == 'MESH':
        o.location = (Rr + 0.55, -0.6, ENV.height_at(T, Rr + 0.6, -0.8) + 0.22); o.scale = (0.9,) * 3
col, rig, acts = character(0.25, 0.6, ['UAL_Walk_Loop', 'UAL_Idle_Loop'])
# circle points (counter-clockwise) – he completes the last third of the loop and stops at the log
def circ(a): return Vector((Rr * math.cos(a), Rr * math.sin(a)))
pts = [circ(math.radians(a)) for a in range(200, 352, 12)]
sp_, sc = locomote(rig, T, pts, 1, 118, 'UAL_Walk_Loop', ease_in=1, ease_out=14)
clip(rig, acts, 'Walk_Loop', -10, dur=135, scale=sc, blend_in=0, blend_out=8)
clip(rig, acts, 'Idle_Loop', 112, dur=N, blend_in=8, blend_out=0)
hold_first(rig)
pose_layer(rig, 'look', look_keys([(1, 0, 10), (110, 0, 10), (122, -30, 25), (140, -35, 30), (N, -20, 15)]))
# glowing route trace: full loop drawn from the log, catches up with him
cu = bpy.data.curves.new('FX_Route', 'CURVE'); cu.dimensions = '3D'
sp = cu.splines.new('POLY'); angs = list(range(-12, 352, 4)); sp.points.add(len(angs) - 1)
for i, a in enumerate(angs):
    p = circ(math.radians(a)); sp.points[i].co = (p.x, p.y, ENV.height_at(T, p.x, p.y) + 0.04, 1)
cu.bevel_depth = 0.035; cu.bevel_resolution = 2
m = bpy.data.materials.new('MAT_Route'); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
em = nt.nodes.new('ShaderNodeEmission'); em.inputs[0].default_value = (1.0, 0.82, 0.35, 1); em.inputs[1].default_value = 6
out = nt.nodes.new('ShaderNodeOutputMaterial'); nt.links.new(em.outputs[0], out.inputs[0]); cu.materials.append(m)
ro = bpy.data.objects.new('FX_Route', cu); s.collection.objects.link(ro)
cu.bevel_factor_end = 0.0; cu.keyframe_insert('bevel_factor_end', frame=1)
cu.bevel_factor_end = 0.62; cu.keyframe_insert('bevel_factor_end', frame=40)
cu.bevel_factor_end = 0.985; cu.keyframe_insert('bevel_factor_end', frame=118)
day_light(3.8, (25, 0, 160), 0.8, 0.6)
cam = camera('CAM', (0, 0, 12), (0, 0, 0), 24)
cam_path(cam, [(1, (0.2, -0.3, 12.5), (0.2, 0.0, 0)), (N, (1.4, -0.6, 6.5), (1.9, -0.3, 0))])
cam.rotation_euler.z += 0
cam.data.dof.use_dof = False
ENV.mist_fog(4, 30, (0.44, 0.51, 0.44), 0.4)
finish(s, 'S10'); render_if_requested()
