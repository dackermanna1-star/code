"""S24 – 'By day three, insect bites cover your skin,' Morning: mosquitoes settle on his bitten forearm; he slaps at them."""
import sys; sys.path.insert(0, '/home/user/code/amazon_short/scripts')
from shotlib import *
import creatures as CR, random
s, sh = setup('S24'); N = sh['frames']
E = ENV.build_env(forest_cfg(seed=241, cam=(0.6, -0.6, 1.4), density=1.0, clear=[(0, 0, 2.0)], giants=[(-3.5, 5, 1.3)], n_poles=45, wet=0.5))
T = E['terrain']
col, rig, acts = character(0.72, 0.55, ['UAL_Idle_Lantern_Loop'])
place(rig, T, 0, 0, 0)
clip(rig, acts, 'Idle_Lantern_Loop', 1, dur=N + 5, blend_in=0, blend_out=0)
# left hand swats across at f62
pose_layer(rig, 'slap', merge({'upperarm_l': [(1, (0, 0, 0)), (50, (0, 0, 0)), (58, (45, 0, -20)), (63, (55, 0, -35)), (72, (30, 0, -10)), (N, (0, 0, 0))],
                               'lowerarm_l': [(1, (0, 0, 0)), (50, (0, 0, 0)), (58, (40, 0, 40)), (63, (50, 0, 70)), (72, (20, 0, 30)), (N, (0, 0, 0))]},
                              look_keys([(1, 0, 25), (50, 0, 25), (62, 5, 30), (N, 0, 22)])))
bpy.context.view_layer.update(); s.frame_set(30)
arm = col.objects['CH_Arms']; rnd = random.Random(24)
mos = []
for i in range(5):
    m, wings = CR.mosquito(f'CR_Mosq_{i}', 0.0075)
    CR.flap(wings, 1, N, period=2, amp=55)
    # land target: points on forearm (bone space), shrinkwrapped
    tgt = empty(f'MQ_T{i}', size=0.01); ch = tgt.constraints.new('CHILD_OF'); ch.target = rig; ch.subtarget = 'lowerarm_r'; ch.inverse_matrix.identity()
    bm_ = rig.matrix_world @ rig.pose.bones['lowerarm_r'].matrix
    a0 = rig.matrix_world @ rig.pose.bones['lowerarm_r'].head; a1 = rig.matrix_world @ rig.pose.bones['lowerarm_r'].tail
    pw = a0.lerp(a1, rnd.uniform(0.3, 0.85)) + Vector((0.17, -0.15, 0.08)).normalized() * 0.05 + Vector((0, 0, rnd.uniform(-0.01, 0.015)))
    tgt.location = bm_.inverted() @ pw
    sw = tgt.constraints.new('SHRINKWRAP'); sw.target = arm; sw.distance = 0.004
    bpy.context.view_layer.update()
    land = tgt.matrix_world.translation.copy()
    start = land + Vector((rnd.uniform(-0.5, 0.5), rnd.uniform(-0.6, -0.2), rnd.uniform(0.1, 0.4)))
    fl = 8 + i * 7
    CR.fly_path(m, 1, fl, [start, land + Vector((0.03, -0.04, 0.05)), land], wobble=0.03, seed=i)
    cl = m.constraints.new('COPY_LOCATION'); cl.target = tgt
    for f, v in ((1, 0.0), (fl, 0.0), (fl + 2, 1.0), (61, 1.0), (62, 0.0)):
        cl.influence = v; cl.keyframe_insert('influence', frame=f)
    away = land + Vector((rnd.uniform(-0.6, 0.6), rnd.uniform(-0.8, 0.2), rnd.uniform(0.3, 0.8)))
    CR.fly_path(m, 62, N, [land, away], wobble=0.04, seed=i + 9)
    mos.append(m)
CAMDIR = Vector((0.17, -0.15, 0.08)).normalized()
bpy.context.view_layer.update(); s.frame_set(40)
import random as _r
_rb = _r.Random(77)
for _i in range(14):
    _d = wound_decal(col, rig, 'lowerarm_r', (0, 0, 0), _r.Random(_i).uniform(0.01, 0.016), 0.8)
    _bm = rig.matrix_world @ rig.pose.bones['lowerarm_r'].matrix
    _a0 = rig.matrix_world @ rig.pose.bones['lowerarm_r'].head; _a1 = rig.matrix_world @ rig.pose.bones['lowerarm_r'].tail
    _cd = (CAMDIR + Vector((_rb.uniform(-0.6, 0.6), _rb.uniform(-0.6, 0.6), _rb.uniform(-0.6, 0.6)))).normalized()
    _d.location = _bm.inverted() @ (_a0.lerp(_a1, _rb.uniform(0.15, 0.9)) + _cd * 0.05)
day_light(4.5, (35, 0, 110), 0.8, 0.8, sun_col=(1.0, 0.85, 0.65), exposure=0.7)
bpy.context.view_layer.update(); s.frame_set(40)
fa = (rig.matrix_world @ rig.pose.bones['lowerarm_r'].tail)
fm = (rig.matrix_world @ rig.pose.bones['lowerarm_r'].head).lerp(fa, 0.5)
cam = camera('CAM', fm + Vector((0.17, -0.15, 0.08)), fm, 85)
cam_path(cam, [(1, fm + Vector((0.18, -0.16, 0.09)), fm), (N, fm + Vector((0.15, -0.13, 0.07)), fm + Vector((-0.02, 0.01, 0)))])
handheld(cam, 1, N, amp=0.002, rot_amp=0.002, seed=24)
cam.data.dof.use_dof = True; cam.data.dof.focus_distance = (cam.location - fm).length; cam.data.dof.aperture_fstop = 5.6
ENV.mist_fog(2, 22, (0.6, 0.62, 0.52), 0.4)
finish(s, 'S24'); render_if_requested()
