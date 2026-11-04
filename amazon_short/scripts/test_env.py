import sys, time; sys.path.insert(0, '/home/user/code/amazon_short/scripts')
from lib import *; from env import *
pct = int(sys.argv[sys.argv.index('--')+1]) if '--' in sys.argv else 50
t0 = time.time()
s = new_scene('EnvTest', (1, 60)); setup_cycles(24, pct)
cfg = dict(center=(0, 0), size=60, seed=3, res=0.3, cam=(0, -6, 1.5), path=dict(pts=[(0, -20), (0.5, -5), (-1, 5), (1, 20)], width=1.4),
           stream=dict(pts=[(-12, -30), (-8, -5), (-10, 10), (-6, 30)], width=3.0), n_giants=5, giants=[(3.5, 6, 1.3)], n_poles=45, wet=0.3, near=15, far=35)
E = build_env(cfg)
col, rig = get_character(); set_condition(col, 0.2, 0.3)
acts = append_actions(['UAL_Walk_Loop']); nla_strip(rig, acts['UAL_Walk_Loop'], 1, repeat=3)
rig.location = (0.3, -2, height_at(E['terrain'], 0.3, -2)); rig.rotation_euler.z = math.radians(180)
world_hdri(0.8, 1.0); sun(5.0, (math.radians(35), 0, math.radians(200)))
tgt = empty('FOCUS', (0.3, -2, 1.2)); cam = camera('CAM', (1.2, -6.5, 1.4), (0.2, -1, 1.6), 28, dof_obj=tgt, fstop=4)
mist_fog(3, 45, (0.45, 0.52, 0.45), 0.55)
print('BUILD', time.time() - t0)
bpy.ops.wm.save_as_mainfile(filepath=R + 'blend/test_env.blend')
s.frame_set(10); s.render.filepath = R + f'renders/tests/env_{pct}.png'
t1 = time.time(); bpy.ops.render.render(write_still=True); print('RENDER', time.time() - t1)
