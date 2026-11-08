# Scarlet — rigged character model

Scarlet from *SCARLET: BEFORE DAWN*, in her own outfit: black leather jacket over a red top,
leather mini skirt, sheer black tights, black boots, fingerless gloves, red hair.

## Files

| File | What it is |
|---|---|
| `Scarlet.glb` | Everything in one file: mesh, skeleton, skin weights, materials and textures |
| `textures/` | The same textures as separate files, for setting materials up by hand |
| `preview.png` | Top: the rest pose from four sides. Bottom: posed through the rig to test it (arm, knee, head, jaw, fingers) |
| `LICENSE-Rocketbox.txt` | The MIT licence notice. Ship it with your game (see Licence below) |

## The model

- **Size and orientation:** 1.72 m tall, in metres, Y up, facing +Z, feet on the origin.
- **Rest pose:** A-pose, with the arms about 40° below horizontal.
- **Mesh:** 6,715 vertices, about 11,000 triangles in 3 materials. At most 4 bone influences per vertex.
- **Skeleton:** 81 bones, named in 3ds Max Biped style (`Bip01 Pelvis`, `Bip01 L Thigh`, `Bip01 R UpperArm`…). Besides the body it has:
  - every finger and the thumb, three joints each, with the hands modelled open;
  - face bones: jaw, tongue, upper and lower lip, mouth corners, upper and lower eyelids, inner, middle and outer brows, cheeks, eyes, nose.
- **No animations** are included. The rig is a standard humanoid, so clips retarget onto it:
  - Unity: as a *Humanoid* avatar, after converting to FBX (the Biped names auto-map);
  - Unreal: with the IK Retargeter;
  - Mixamo or other clips: in your engine, or in Blender.

## Materials (glTF PBR, metallic-roughness)

| Material | Textures |
|---|---|
| `Scarlet_Body` | Colour 2048², normal 1024², metallic-roughness 1024² (roughness in G, metalness in B) |
| `Scarlet_Head` | Same set for the face, scalp, eyes and mouth |
| `Scarlet_Hair` | Colour with alpha: hair strands and eyelashes. Alpha-tested (*cutout*, cutoff 0.42), two-sided |

The roughness is baked from the game's own surface map. The leather and lips are glossy; skin, the top
and the tights are matte. The mesh stores no tangents for the normal maps. Engines generate them on
import (MikkTSpace).

## About the clothes

As on the original avatar, the jacket, top, tights, boots and gloves are painted into the body
texture rather than being separate meshes. There is no body modelled underneath them, so she can't be
undressed or have pieces swapped by hiding meshes. The leather skirt is real geometry. It is skinned
to the pelvis and spine at the top and to the thighs below, so it rides up on a raised knee.

## Importing

- **Blender:** File › Import › glTF 2.0. From there you can export FBX if your engine wants it.
- **Unreal Engine 5:** drag `Scarlet.glb` into the Content Browser. It imports as a Skeletal Mesh.
- **Godot 4:** drop it into the project. It imports as a scene with a Skeleton3D.
- **Unity:** add the glTFast package (`com.unity.cloud.gltfast`) and drop the `.glb` into Assets. For
  Unity's Humanoid animation workflow, an FBX is the usual route: convert it in Blender as above.
- **three.js, Babylon.js and other web engines:** load it as glTF 2.0.

## Licence

The base model is **Female_Adult_07** from the Microsoft Rocketbox Avatar Library
(<https://github.com/microsoft/Microsoft-Rocketbox>), © 2020 Microsoft, released under the MIT
licence. You may use, modify and sell it in your own games. The condition is that the licence notice
in `LICENSE-Rocketbox.txt` is included with your game, for example in its credits or licence files.

Scarlet's textures (re-dressed from the avatar's own) and her skirt were made for *SCARLET: BEFORE
DAWN*.
