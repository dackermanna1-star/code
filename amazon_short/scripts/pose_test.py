import sys, json; sys.path.insert(0, '/home/user/code/amazon_short/scripts')
from shotlib import *
poses = json.loads(open(sys.argv[sys.argv.index('--') + 1]).read())
s = new_scene('Pose', (1, 10), res=(300, 450)); s.render.engine = 'BLENDER_WORKBENCH'
col, rig, acts = character(0, 0, ['UAL_Idle_Loop'])
clip(rig, acts, 'Idle_Loop', 1, dur=20, blend_in=0, blend_out=0)
layers = []
for i, (name, keys) in enumerate(poses.items()):
    st = pose_layer(rig, name, {b: [(1, tuple(v))] for b, v in keys.items()})
    st.mute = True; layers.append(st)
camF = camera('F', (0.3, -2.4, 1.4), (0, 0, 1.2), 40); camS = camera('S', (2.4, -0.3, 1.4), (0, 0, 1.2), 40)
for st in layers:
    for o in layers: o.mute = (o is not st)
    for c in (camF, camS):
        s.camera = c; s.frame_set(5); s.render.filepath = f'{R}renders/tests/pose/{st.name}_{c.name}.png'; bpy.ops.render.render(write_still=True)
