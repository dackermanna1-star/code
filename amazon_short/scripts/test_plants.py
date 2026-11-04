import sys; sys.path.insert(0, '/home/user/code/amazon_short/scripts')
from lib import *
s = new_scene('PlantTest', (1, 1), res=(1920, 1080)); setup_cycles(24, 50, motion_blur=False)
with bpy.data.libraries.load(BLEND + 'plants_lib.blend', link=False) as (src, dst): dst.collections = src.collections
cols = [c for c in dst.collections if c.name.startswith('PL_')]
for i, c in enumerate(cols):
    for o in c.objects:
        o2 = o.copy(); s.collection.objects.link(o2); o2.location = ((i % 5) * 2.2 - 4.4, (i // 5) * 2.5, 0)
w = s.world = bpy.data.worlds.new('W'); w.use_nodes = True
env = w.node_tree.nodes.new('ShaderNodeTexEnvironment'); env.image = bpy.data.images.load(ASSETS + 'hdri/rainforest_trail_2k.hdr')
w.node_tree.links.new(env.outputs[0], w.node_tree.nodes['Background'].inputs[0])
bpy.ops.mesh.primitive_plane_add(size=40)
sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = 3; so = bpy.data.objects.new('sun', sun); s.collection.objects.link(so); so.rotation_euler = (0.7, 0.2, 2.5)
camera('CAM', (0, -9, 3.2), (0, 1.5, 0.6), 30)
s.render.filepath = R + 'renders/tests/plants.png'; bpy.ops.render.render(write_still=True)
