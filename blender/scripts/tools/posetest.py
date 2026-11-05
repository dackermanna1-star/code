"""Render the dry rig with a pose layer stack from front + side for checking poses.
blender -b -P posetest.py -- module.function out.png frame [frame...]"""
import sys, math, importlib
sys.path.insert(0, '/home/user/code/blender/scripts/lib'); sys.path.insert(0, '/home/user/code/blender/scripts/tools')
import bpy, env, char as ch
from mathutils import Vector
argv = sys.argv[sys.argv.index('--') + 1:]
modname, fname = argv[0].split('.'); out = argv[1]; frames = [int(x) for x in argv[2:]]
sc = env.new_scene(res=(300, 520), frames=(1, max(frames)))
c = ch.Castaway()
getattr(importlib.import_module(modname), fname)(c)
c.bake(1, max(frames))
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs[0].default_value = (0.3, 0.32, 0.35, 1)
sun = bpy.data.objects.new('s', bpy.data.lights.new('s', 'SUN')); sun.data.energy = 3; sun.rotation_euler = (0.6, 0.2, 0.5); sc.collection.objects.link(sun)
bpy.ops.mesh.primitive_plane_add(size=6, location=(0, 0, 0)); pl = bpy.context.object
pm = bpy.data.materials.new('p'); pm.use_nodes = True; pm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.05, 0.15, 0.3, 1)
pm.node_tree.nodes['Principled BSDF'].inputs['Alpha'].default_value = 0.35; pl.data.materials.append(pm)
sc.cycles.samples = 4; sc.view_settings.look = 'None'
cam = env.add_camera(lens=35)
import os
imgs = []
for f in frames:
    sc.frame_set(f)
    for view, d in (('front', Vector((0.2, -4.2, 0.3))), ('side', Vector((4.2, -0.3, 0.3)))):
        tgt = c.root.matrix_world.translation + Vector((0, 0, -0.1))
        cam.location = tgt + d; env.look_at(cam, tgt)
        p = '%s_%d_%s.png' % (out[:-4], f, view); sc.render.filepath = p; bpy.ops.render.render(write_still=True); imgs.append(p)
print('POSEIMGS', ' '.join(imgs))
