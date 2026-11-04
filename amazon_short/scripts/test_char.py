import sys; sys.path.insert(0, '/home/user/code/amazon_short/scripts')
import bpy, math
from lib import *
cond = float(sys.argv[sys.argv.index('--')+1]) if '--' in sys.argv else 0.0
s = new_scene('CharTest', (1, 40), res=(1080, 1920)); setup_cycles(32, 50, motion_blur=False)
col, rig = get_character(); set_condition(col, cond, cond)
acts = append_actions(['UAL_Walk_Loop', 'UAL_Idle_Loop'])
nla_strip(rig, acts['UAL_Idle_Loop'], 1)
w = s.world = bpy.data.worlds.new('W'); w.use_nodes = True
env = w.node_tree.nodes.new('ShaderNodeTexEnvironment'); env.image = bpy.data.images.load(ASSETS + 'hdri/rainforest_trail_2k.hdr')
w.node_tree.links.new(env.outputs[0], w.node_tree.nodes['Background'].inputs[0])
bpy.ops.mesh.primitive_plane_add(size=10)
k = bpy.data.lights.new('key', 'AREA'); k.energy = 300; k.size = 1.5
ko = bpy.data.objects.new('key', k); s.collection.objects.link(ko); ko.location = (1.5, -2.0, 2.5); ko.rotation_euler = look_at_rot(ko.location, (0, 0, 1.2))
s.frame_set(20)
for name, loc, tgt, lens in [('full', (0.9, -3.6, 1.1), (0, 0, 0.9), 40), ('face', (0.25, -0.75, 1.62), (0, 0, 1.6), 50)]:
    camera('CAM_' + name, loc, tgt, lens)
    s.render.filepath = f'{R}renders/tests/char_{name}_{cond}.png'
    bpy.ops.render.render(write_still=True)
