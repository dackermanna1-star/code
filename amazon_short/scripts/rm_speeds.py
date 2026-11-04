import bpy, json
Q = '/home/user/code/amazon_short/assets/quaternius/'
bpy.ops.wm.read_factory_settings(use_empty=True)
out = {}
for f in [Q + 'Universal Animation Library[Standard]/Unreal-Godot/UAL1_Standard_RM.glb', Q + 'Universal Animation Library 2[Standard]/Unreal-Godot/UAL2_Standard_RM.glb']:
    bpy.ops.import_scene.gltf(filepath=f)
rig = [o for o in bpy.data.objects if o.type == 'ARMATURE'][0]
for a in bpy.data.actions:
    fcs = [fc for fc in a.fcurves if fc.data_path == 'pose.bones["root"].location']
    if not fcs: continue
    f0, f1 = a.frame_range
    d = [fc.evaluate(f1) - fc.evaluate(f0) for fc in sorted(fcs, key=lambda c: c.array_index)]
    out[a.name] = dict(frames=f1 - f0, delta=[round(x, 3) for x in d])
json.dump(out, open('/home/user/code/amazon_short/blend/rm_speeds.json', 'w'), indent=0)
for k in ['Walk_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Zombie_Walk_Fwd_Loop', 'Crouch_Fwd_Loop', 'Walk_Carry_Loop', 'Walk_Formal_Loop', 'Push_Loop', 'Swim_Fwd_Loop']:
    for kk in out:
        if kk.startswith(k): print('RM', kk, out[kk])
