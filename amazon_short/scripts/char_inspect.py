import bpy, glob, os
Q='/home/user/code/amazon_short/assets/quaternius/'
MP=Q+'Modular Character Outfits - Fantasy[Standard]/Exports/glTF (Godot-Unreal)/Modular Parts/'
bpy.ops.wm.read_factory_settings(use_empty=True)
for f in sorted(glob.glob(glob.escape(MP)+'Male_*.gltf'))+[Q+'Universal Base Characters[Standard]/Hairstyles/Rigged to Head Bone/glTF (Godot -Unreal)/Hair_SimpleParted.gltf']:
    before=set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=f)
    new=[o for o in bpy.data.objects if o not in before]
    print(os.path.basename(f), [(o.name,o.type, len(o.data.vertices) if o.type=='MESH' else len(o.data.bones), [m.name for m in o.material_slots] if o.type=='MESH' else '', o.parent.name if o.parent else None) for o in new])
