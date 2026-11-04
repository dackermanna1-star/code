"""S11 – 'It's over 30 degrees, and the air is so humid your sweat barely evaporates.' Walking close-up, face beaded with sweat."""
import sys; sys.path.insert(0, '/home/user/code/amazon_short/scripts')
from shotlib import *
s, sh = setup('S11'); N = sh['frames']
E = ENV.build_env(forest_cfg(seed=111, cam=(0, -3, 1.6), density=1.2, path=dict(pts=[(0.2, 8), (0, 0), (-0.2, -9)], width=2.2),
                             giants=[(-3.5, 2, 1.3), (4, -6, 1.2)], n_poles=50, wet=0.35))
T = E['terrain']
col, rig, acts = character(0.3, 1.0, ['UAL_Walk_Loop'])
pts = [Vector((0.15, 3.2)), Vector((0.0, 0.0)), Vector((-0.1, -2.4))]
sp_, sc = locomote(rig, T, pts, 1, N, 'UAL_Walk_Loop', ease_in=1, ease_out=1)
clip(rig, acts, 'Walk_Loop', -10, dur=N + 20, scale=sc * 0.92, blend_in=0, blend_out=0)
pose_layer(rig, 'tired', merge(look_keys([(1, 0, 4), (60, -8, 7), (110, 5, 3), (N, 0, 6)]), breathing(1, N, 30, 3.5),
                               {'spine_02': [(1, (6, 0, 0)), (N, (8, 0, 0))]}))
# sweat beads: small glossy drops stuck to the skin (shrinkwrap) that slowly run down the face
wm = bpy.data.materials.new('MAT_Sweat'); wm.use_nodes = True; b = wm.node_tree.nodes['Principled BSDF']
b.inputs['Roughness'].default_value = 0.02; b.inputs['Transmission Weight'].default_value = 1.0; b.inputs['IOR'].default_value = 1.33
head = col.objects['CH_Head']
import random; rnd = random.Random(5)
hb = rig.pose.bones['Head']
for i in range(16):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=rnd.uniform(0.0016, 0.0032), segments=10, ring_count=6)
    d = bpy.context.active_object; d.name = f'FX_Sweat_{i}'; d.data.materials.append(wm); d.scale = (1, 1, 1.5)
    ch = d.constraints.new('CHILD_OF'); ch.target = rig; ch.subtarget = 'Head'; ch.inverse_matrix.identity()
    # bone space: y up the head, z towards the face (forward) – drops on forehead/temples
    x0 = rnd.uniform(-0.055, 0.055); y0 = rnd.uniform(0.07, 0.13); z0 = 0.11
    f0 = rnd.randint(1, 80)
    d.location = (x0, y0, z0); d.keyframe_insert('location', frame=1)
    d.location = (x0, y0, z0); d.keyframe_insert('location', frame=f0)
    d.location = (x0 + rnd.uniform(-0.005, 0.005), y0 - rnd.uniform(0.03, 0.07), z0); d.keyframe_insert('location', frame=min(N, f0 + rnd.randint(50, 90)))
    sw = d.constraints.new('SHRINKWRAP'); sw.target = head; sw.wrap_mode = 'OUTSIDE_SURFACE'; sw.distance = 0.0012
day_light(4.0, (60, 0, 200), 0.85, 1.6, sun_col=(1.0, 0.88, 0.7), exposure=0.8)
cam = camera('CAM', (0.1, -1.0, 1.65), (0, 0.5, 1.6), 55)
y0 = ENV.height_at(T, 0, 2)
cam_path(cam, [(1, (0.35, 2.15, 1.75 + y0), (0.12, 3.2, 1.5 + y0)), (N, (0.15, -3.55, 1.72 + ENV.height_at(T, 0, -3)), (-0.1, -2.4, 1.5 + ENV.height_at(T, 0, -3)))])
handheld(cam, 1, N, amp=0.004, rot_amp=0.003, seed=11)
focus_on(cam, rig, 'Head', 2.0)
# thick humid haze
ENV.mist_fog(1.0, 14, (0.62, 0.66, 0.55), 0.55, grade=dict(gain=(1.06, 1.0, 0.9), sat=0.95))
finish(s, 'S11'); render_if_requested()
