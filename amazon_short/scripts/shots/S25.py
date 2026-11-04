"""S25 – 'a small cut on your arm is red and swollen. In this heat, wounds can get infected in days.'
Close-up of the inflamed cut as he turns his forearm, then his tired face (camera cut via marker)."""
import sys; sys.path.insert(0, '/home/user/code/amazon_short/scripts')
from shotlib import *
s, sh = setup('S25'); N = sh['frames']
E = ENV.build_env(forest_cfg(seed=241, cam=(0.6, -0.6, 1.4), density=1.0, clear=[(0, 0, 2.0)], giants=[(-3.5, 5, 1.3)], n_poles=45, wet=0.5))
T = E['terrain']
col, rig, acts = character(0.75, 0.6, ['UAL_Idle_Lantern_Loop'])
place(rig, T, 0, 0, 0)
clip(rig, acts, 'Idle_Lantern_Loop', 1, dur=N + 5, blend_in=0, blend_out=0)
pose_layer(rig, 'turn', merge({'lowerarm_r': [(1, (0, 0, 0)), (40, (0, 60, 0)), (90, (0, 70, 0)), (N, (0, 70, 0))], 'hand_r': [(1, (0, 0, 0)), (40, (0, 20, 0)), (N, (0, 25, 0))]},
                              look_keys([(1, 0, 28), (100, 5, 30), (120, 0, 22), (160, -10, 15), (N, -5, 25)]), breathing(1, N, 34, 2.5)))
wd = wound_decal(col, rig, 'lowerarm_r', (0.0, 0.13, 0.0), 0.085, 1.0)
day_light(4.5, (35, 0, 110), 0.8, 0.8, sun_col=(1.0, 0.85, 0.65), exposure=0.7)
bpy.context.view_layer.update(); s.frame_set(60)
fa = (rig.matrix_world @ rig.pose.bones['lowerarm_r'].head).lerp(rig.matrix_world @ rig.pose.bones['lowerarm_r'].tail, 0.55)
hd = rig.matrix_world @ rig.pose.bones['Head'].head
bm_ = rig.matrix_world @ rig.pose.bones['lowerarm_r'].matrix
camdir = Vector((0.25, -0.22, 0.12)).normalized()
wd.constraints[0].inverse_matrix.identity()
wd.location = bm_.inverted() @ (fa + camdir * 0.06)
CAMDIR = camdir
import random as _r
_rb = _r.Random(77)
for _i in range(14):
    _d = wound_decal(col, rig, 'lowerarm_r', (0, 0, 0), _r.Random(_i).uniform(0.01, 0.016), 0.8)
    _bm = rig.matrix_world @ rig.pose.bones['lowerarm_r'].matrix
    _a0 = rig.matrix_world @ rig.pose.bones['lowerarm_r'].head; _a1 = rig.matrix_world @ rig.pose.bones['lowerarm_r'].tail
    _cd = (CAMDIR + Vector((_rb.uniform(-0.6, 0.6), _rb.uniform(-0.6, 0.6), _rb.uniform(-0.6, 0.6)))).normalized()
    _d.location = _bm.inverted() @ (_a0.lerp(_a1, _rb.uniform(0.15, 0.9)) + _cd * 0.05)
c1 = camera('CAM_Arm', fa + Vector((0.25, -0.22, 0.12)), fa, 70)
cam_path(c1, [(1, fa + Vector((0.27, -0.24, 0.14)), fa), (110, fa + Vector((0.22, -0.2, 0.11)), fa)])
focus_on(c1, wd, None, 2.0)
c2 = camera('CAM_Face', hd + Vector((0.35, -0.55, 0.0)), hd + Vector((0, 0, 0.05)), 60)
cam_path(c2, [(111, hd + Vector((0.38, -0.6, 0.0)), hd + Vector((0, 0, 0.06))), (N, hd + Vector((0.3, -0.48, 0.0)), hd + Vector((0, 0, 0.06)))])
focus_on(c2, rig, 'Head', 2.0)
for c in (c1, c2): handheld(c, 1, N, amp=0.002, rot_amp=0.002, seed=25)
s.camera = c1
mk = s.timeline_markers.new('arm', frame=1); mk.camera = c1
mk = s.timeline_markers.new('face', frame=111); mk.camera = c2
ENV.mist_fog(2, 22, (0.6, 0.62, 0.52), 0.4)
finish(s, 'S25'); render_if_requested()
