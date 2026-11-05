"""Render a quick turntable-free preview of a GLB for asset vetting.
Usage: blender -b --factory-startup -P preview_glb.py -- in.glb out.png"""
import bpy, sys, mathutils, math
argv = sys.argv[sys.argv.index('--') + 1:]
src, out = argv[0], argv[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
sc = bpy.context.scene
objs = [o for o in sc.objects if o.type == 'MESH']
dg = bpy.context.evaluated_depsgraph_get()
mn = mathutils.Vector((1e9,)*3); mx = -mn
nf = 0
for o in objs:
    oe = o.evaluated_get(dg)
    nf += len(oe.data.polygons)
    for c in o.bound_box:
        w = o.matrix_world @ mathutils.Vector(c)
        mn = mathutils.Vector(map(min, mn, w)); mx = mathutils.Vector(map(max, mx, w))
ctr = (mn + mx) / 2; size = (mx - mn).length
acts = [a.name + ':%d-%d' % tuple(a.frame_range) for a in bpy.data.actions]
print('INFO', src, 'faces', nf, 'size', tuple(round(v, 3) for v in (mx - mn)), 'actions', acts[:6], 'arm', [o.name for o in sc.objects if o.type == 'ARMATURE'][:3])
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
d = mathutils.Vector((0.9, -1.4, 0.6)).normalized()
cam.location = ctr + d * size * 1.25
cam.rotation_euler = (ctr - cam.location).to_track_quat('-Z', 'Y').to_euler()
cam.data.lens = 40; cam.data.clip_end = size * 20; cam.data.clip_start = size * 0.001
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
w.node_tree.nodes['Background'].inputs[0].default_value = (0.5, 0.6, 0.7, 1); w.node_tree.nodes['Background'].inputs[1].default_value = 0.8
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sun.data.energy = 3; sun.rotation_euler = (0.7, 0.2, 0.8); sc.collection.objects.link(sun)
sc.render.engine = 'CYCLES'; sc.cycles.samples = 16; sc.cycles.use_denoising = True
sc.render.resolution_x = 480; sc.render.resolution_y = 360
sc.render.filepath = out
bpy.ops.render.render(write_still=True)
