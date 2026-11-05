import sys, time, math
sys.path.insert(0, '/home/user/code/blender/scripts/lib')
import importlib, env; importlib.reload(env)
import bpy
from mathutils import Vector
argv = sys.argv[sys.argv.index('--') + 1:]
view = argv[0]; hdri = argv[1] if len(argv) > 1 else 'kloofendal_48d_partly_cloudy_puresky'
rot = float(argv[2]) if len(argv) > 2 else 0.0
sc = env.new_scene(res=(720, 1280), frames=(1, 2))
fx = bpy.data.objects.new('FX_Center', None); sc.collection.objects.link(fx)
mode = 'under' if view == 'under' else ('opaque' if view in ('aerial', 'wateropaque') else 'clear')
if view == 'wateropaque': view = 'water'
o = env.make_ocean('moderate', mode=mode, fx_empty=fx, haze_color=(0.62, 0.72, 0.82))
w, sun = env.make_world(hdri, rot_z=rot, strength=1.0, sun_strength=4.0)
bpy.ops.mesh.primitive_uv_sphere_add(radius=0.25, location=(0, 0, 0)); ball = bpy.context.object
bm = bpy.data.materials.new('ball'); bm.use_nodes = True; bm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.8, 0.3, 0.02, 1); ball.data.materials.append(bm)
if view == 'water':
    cam = env.add_camera(lens=32, loc=(0.6, -4.5, 0.9), target=(0, 0, 0.3))
elif view == 'aerial':
    cam = env.add_camera(lens=30, loc=(0, -60, 140), target=(0, 0, 0))
elif view == 'under':
    cam = env.add_camera(lens=24, loc=(0, -4, -3.5), target=(0, 0, 0.0))
    sc.cycles.samples = 48
env.setup_compositor('under' if view == 'under' else 'day')
sc.frame_set(1)
sc.render.filepath = '/home/user/code/blender/tests/env_%s_%s.png' % (view, hdri.split('_')[0])
t = time.time(); bpy.ops.render.render(write_still=True); print('RTIME', view, round(time.time() - t, 1))
print('SUN', sun['dir'] if sun else None)
import os
if os.environ.get('SIMPLE'):
    for mname in ('Water', 'WaterFar'):
        mm = bpy.data.materials[mname]; nt = mm.node_tree; nt.nodes.clear()
        o2 = nt.nodes.new('ShaderNodeOutputMaterial'); b = nt.nodes.new('ShaderNodeBsdfPrincipled')
        b.inputs['Base Color'].default_value = (0.002, 0.01, 0.02, 1); b.inputs['Roughness'].default_value = 0.04
        nt.links.new(b.outputs[0], o2.inputs[0])
    t = time.time(); bpy.ops.render.render(write_still=False); print('RTIME_SIMPLE', round(time.time() - t, 1))
