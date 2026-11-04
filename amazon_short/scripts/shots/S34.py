"""S34 – '…by doing exactly this. Following the water.' Pull back and up from the canoe on the golden river to an endless forest."""
import sys; sys.path.insert(0, '/home/user/code/amazon_short/scripts')
from shotlib import *
import aerial as AE, creatures as CR
s, sh = setup('S34'); N = sh['frames']
RIV = dict(y=0, width=120)
A = AE.build_aerial(dict(center=(0, 0), size=1500, res=4.5, seed=3, river=RIV, mist=0.4, mist_levels=[36, 50]))
ENV.world_hdri(0.9, 0.3, 'qwantani_sunset_puresky_2k.hdr', (0.7, 0.85, 1.05, 1)); s.view_settings.exposure = 0.1
ENV.sun(4.0, (math.radians(80), 0, math.radians(95)), (1.0, 0.8, 0.6), 1.0)
boat = CR.dugout_boat('PR_Boat', length=6.5)
yc = AE.river_center(0, RIV)
for f, x in ((1, -10), (N, 25)):
    boat.location = (x, yc + 8, -0.75); boat.keyframe_insert('location', frame=f)
# wake
wk = bpy.data.materials.new('MAT_Wake'); wk.use_nodes = True; wk.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.85, 0.82, 0.75, 1)
wk.node_tree.nodes['Principled BSDF'].inputs['Alpha'].default_value = 0.5
bpy.ops.mesh.primitive_plane_add(size=1); w = bpy.context.active_object; w.name = 'FX_Wake'; w.scale = (14, 3.5, 1); w.data.materials.append(wk)
w.parent = boat; w.location = (-9, 0, 0.72)
# two tiny figures in the boat (seen from afar)
for k, (dx, c) in enumerate(((-1.2, (0.5, 0.4, 0.25, 1)), (-2.6, (0.15, 0.25, 0.4, 1)))):
    bpy.ops.mesh.primitive_cylinder_add(radius=0.22, depth=0.9, location=(dx, 0, 0.3)); fig = bpy.context.active_object; fig.parent = boat
    m = bpy.data.materials.new(f'MAT_Fig{k}'); m.use_nodes = True; m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = c; fig.data.materials.append(m)
cam = camera('CAM', (0, yc - 30, 12), (0, yc + 8, 0), 30)
cam_path(cam, [(1, (-28, yc - 24, 10), (0, yc + 8, 0)), (60, (-40, yc - 70, 60), (10, yc + 20, 0)), (N, (-60, yc - 260, 230), (60, yc + 300, 10))])
cam.data.dof.use_dof = False; cam.data.clip_end = 4000
ENV.mist_fog(150, 1600, (0.95, 0.72, 0.5), 0.12, glare=True, grade=dict(gain=(1.08, 0.98, 0.88), sat=1.1))
finish(s, 'S34'); render_if_requested()
