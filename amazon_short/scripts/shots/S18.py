"""S18 – 'Rainwater is one of the safest drinks out here, so you catch every drop you can.' Leaf tip pours into his bottle; he drinks."""
import sys; sys.path.insert(0, '/home/user/code/amazon_short/scripts'); sys.path.insert(0, '/home/user/code/amazon_short/scripts/shots')
from shotlib import *
import stream_set, fx
s, sh = setup('S18'); N = sh['frames']
E = stream_set.build((4.2, -1.6), seed=181, wet=0.9, rain=1.0, extra_clear=[(3.0, -0.5, 1.6), (4.2, -1.6, 1.6)])
T = E['terrain']
col, rig, acts = character(0.45, 0.4, ['UAL_Idle_Lantern_Loop', 'UAL_Consume', 'UAL_Idle_Loop'])
place(rig, T, 3.0, -0.5, -140)
clip(rig, acts, 'Idle_Lantern_Loop', 1, dur=N + 5, blend_in=0, blend_out=0)
hold_first(rig)
pose_layer(rig, 'look', merge(look_keys([(1, 0, 15), (60, 5, 18), (100, 0, -10), (N, -5, -22)]), breathing(1, N, 40, 2.0)))
b = bottle_to_hand(col, rig, loc=(0.0, 0.07, 0.02), rot=(90, 0, 0))
# catching phase: an upright copy of the bottle follows the hand position; drinking phase: hand-attached bottle
up = b.copy(); up.data = b.data; s.collection.objects.link(up); up.name = 'PR_Bottle_Upright'
up.constraints.clear(); cl = up.constraints.new('COPY_LOCATION'); cl.target = rig; cl.subtarget = 'hand_r'; cl.head_tail = 0.7
up.location = (0, 0, 0); up.rotation_euler = (0, 0, 0)
cap = [o for o in col.objects if o.name.startswith('PR_Bottle_Cap')][0]; cap.hide_render = True
for f, v in ((1, True),):
    up.hide_render = not v; up.keyframe_insert('hide_render', frame=f)
    b.hide_render = v; b.keyframe_insert('hide_render', frame=f)
bpy.context.view_layer.update(); s.frame_set(50)
bp = up.matrix_world.translation.copy() + Vector((0, 0, 0.11))
leaf, tip = fx.hero_leaf('HERO_RainLeaf', 'LeafSet018', 1.1, bp + Vector((-0.75, 0.55, 0.9)), (0.7, -0.5, 0.15), droop=0.55)
# shift leaf so its tip sits ~32 cm above the bottle mouth
leaf.location += (bp + Vector((0, 0, 0.33))) - tip
tip = bp + Vector((0, 0, 0.44))
# water thread from tip into bottle (only while the bottle is under it), plus falling drops
wm = bpy.data.materials.new('MAT_WaterThread'); wm.use_nodes = True; bb = wm.node_tree.nodes['Principled BSDF']
bb.inputs['Roughness'].default_value = 0.02; bb.inputs['Transmission Weight'].default_value = 1; bb.inputs['IOR'].default_value = 1.33
bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.0035, depth=0.33, location=(bp.x, bp.y, bp.z + 0.165))
th = bpy.context.active_object; th.name = 'FX_WaterThread'; th.data.materials.append(wm)
d = th.modifiers.new('wob', 'DISPLACE'); tx = bpy.data.textures.new('wob', 'CLOUDS'); tx.noise_scale = 0.02; d.texture = tx; d.strength = 0.003
for f, v in ((1, True),):
    th.hide_render = not v; th.keyframe_insert('hide_render', frame=f)
fx.rain((3.0, -0.5, 0), (8, 8, 7), 9000, 8.0, amount_keys=[(1, 1.0)])
sun = day_light(1.0, (60, 0, 200), 0.6, 1.0, fill=3600, fill_col=(0.8, 0.88, 0.95), exposure=0.45)
fx.overcast(0.45); fx.wet_leaves(0.35); fx.stronger_wind(2.0, 2.0)
fwd = (rig.matrix_world.to_3x3() @ Vector((0, -1, 0))).normalized(); side = fwd.cross(Vector((0, 0, 1))).normalized()
hd = rig.matrix_world @ rig.pose.bones['Head'].head
c0 = bp + side * 0.85 + fwd * 0.35 + Vector((0, 0, 0.05))
cam = camera('CAM', c0, bp, 40)
cam_path(cam, [(1, c0, bp + Vector((0, 0, 0.16))), (80, c0 + side * -0.1, bp + Vector((0, 0, 0.1))),
               (N, bp + side * 1.2 + fwd * 0.6 + Vector((0, 0, 0.3)), hd)])
handheld(cam, 1, N, amp=0.003, rot_amp=0.003, seed=18)
focus_on(cam, up, None, 2.2)
ENV.mist_fog(1.5, 18, (0.5, 0.55, 0.55), 0.55, grade=dict(gain=(0.95, 1.0, 1.05), sat=0.88))
finish(s, 'S18'); render_if_requested()
