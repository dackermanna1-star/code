"""Export per-frame world positions of a few of Leo's bones (for 2D infographics that track him)."""
import bpy, json, sys
argv = sys.argv[sys.argv.index("--") + 1:]
out = argv[0]
sc = bpy.context.scene
S = json.loads(sc["shots"])
rig = bpy.data.objects["Leo"]
B = ["hand_l", "lowerarm_l", "upperarm_l", "clavicle_l", "hand_r", "lowerarm_r", "upperarm_r", "clavicle_r",
     "neck_01", "head", "spine_03", "spine_01", "pelvis", "middle_01_r", "foot_l", "foot_r"]
res = {}
for sid, s in S.items():
    if sid not in ("SH06b", "SH08a", "SH08b", "SH10a", "SH10b", "SH10c", "SH17a", "SH18", "SH20", "SH14", "SH09", "SH16a"):
        continue
    d = {}
    for f in range(s["f0"], s["f1"] + 1):
        sc.frame_set(f)
        d[f] = {b: list(rig.matrix_world @ rig.pose.bones[b].head) for b in B}
        d[f]["head_tail"] = list(rig.matrix_world @ rig.pose.bones["head"].tail)
        p = bpy.data.objects["HeatSpot_0"]; d[f]["heat0"] = list(p.location)
    res[sid] = d
json.dump(res, open(out, "w"))
print("ANCHORS", len(res))
