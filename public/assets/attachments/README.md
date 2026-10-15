# Weapon attachments

20 attachment GLBs for the PUBG-style attachment system: 7 optics, 5 muzzle devices, 5 foregrips, an extended
magazine and 2 stocks. There are also 7 reticle PNGs in `reticles/`. Per-asset data is in `manifest.json`: file, triangle count, bytes, bounds,
node names, origin description, magnification, eye relief, optical-axis height and reticle. The total size is about 4.2 MB.

## Source and license

Every model here is **authored for this project** (CC0). They were made by scripted Blender modelling in `tools/assets/gear/`
(`models/<id>.py`, kit `gkit.py`). The kit builds on the weapons kit `tools/assets/weapons/wkit.py`, so attachments
share the weapons' material library, bevel/edge-wear bake and texel density, and they sit naturally on the guns.
Free attachment models found online were low-poly, stylised, or covered only one or two items, so I did not use them.

Proportions follow real items: Aimpoint-style tube red dot, EXPS-style holographic sight, compact 2x tube scope,
Spitfire-style 3x prism, ACOG TA31-style 4x with a fibre-optic ridge, a 2-6x variable scope, a 34 mm high-power scope
with a 56 mm objective, 5.56/9 mm/.30 suppressors, an A2 birdcage flash hider, a ported compensator, a vertical grip, an AFG-style
angled grip, half, thumb and skeletonised lightweight grips, a 40-rd polymer magazine, a CTR-style collapsible stock and a cheek riser.
There are no brand names or markings.

## Conventions

- glTF axes: **+Y up, +Z forward** (the direction the weapon points), metres. The asset's right side is -X.
- Compression: `EXT_meshopt_compression` + `KHR_mesh_quantization`. Load with `GLTFLoader.setMeshoptDecoder(MeshoptDecoder)`.
- Materials: one baked PBR material `M_<id>` (JPEG baseColor + normal + packed ORM, 512 px, or 1024 px for the 8x), plus
  plain untextured glass materials for lenses (`lens`, `lens_amber`, `window`). Code can swap these.
- Mesh node transforms can contain the quantization scale/offset. Use the **empties** for positions, and use the mesh nodes only to
  swap materials.

### Optics (`scope_*`)

| node | meaning |
|---|---|
| root (`scope_x`) | **origin = rail-mount base**: the bottom of the clamp where it sits on the Picatinny rail top, centred on the clamp. Put this on the weapon's `rail_top` empty. |
| `eye` | empty on the optical axis at the eye position (eye relief behind the rear lens). The active `sight_eye` of a scoped weapon is this node's world position. |
| `lens` | mesh: the **rear (eye-side) lens**, a domed disc facing -Z, material `lens`. For the reflex sights it is the rear window pane (`window`, alpha 0.35). |
| `lens_front` | mesh: objective lens or front window. |

| id | zoom | optical axis above rail | eye relief | lens radius | reticle |
|---|---|---|---|---|---|
| scope_reddot | 1 | 39 mm | 140 mm (unlimited) | 13.6 mm | reticles/reddot.png (2 MOA dot) |
| scope_holo | 1 | 42 mm | 150 mm (unlimited) | window 31 x 24 mm | reticles/holo.png (68 MOA ring + dot) |
| scope_2x | 2 | 38 mm | 80 mm | 13.5 mm | reticles/scope_2x.png |
| scope_3x | 3 | 40 mm | 65 mm | 12.5 mm | reticles/scope_3x.png |
| scope_4x | 4 | 44 mm | 38 mm (real ACOG) | 12 mm | reticles/scope_4x.png (chevron + BDC) |
| scope_6x | 6 (3-6) | 39 mm | 90 mm | 15.5 mm | reticles/scope_6x.png |
| scope_8x | 8 (4-8) | 47 mm | 95 mm | 16.5 mm | reticles/scope_8x.png (mil-dot) |

**Scope view recipe.** Render the scene from the `eye` node, looking along +Z of the optic, with FOV = hipFOV / zoom into a render
target. Put that texture on the `lens` mesh. Use a screen-space or planar-UV `MeshBasicMaterial`, with the circle given by
the lens radius. Draw the reticle PNG over it and add a vignette at the rim. For the red dot and holo, keep the scene visible
through the semi-transparent `window` and draw only the reticle, projected at infinity. The reticle images are RGBA, 1024 px, and
cover the full eyepiece field of view: red parts are illuminated, black parts are etched.

### Muzzle devices (`muzzle_*`)

The origin is the **rear (thread-shoulder) face on the bore axis**, and the device extends along +Z. Put the origin on the weapon's `muzzle`
empty. The device's own `muzzle` empty is the new muzzle face, for flash and projectile spawn. Lengths: suppressor_ar 174 mm (38 mm can),
suppressor_smg 184 mm, suppressor_sr 231 mm (tan), comp_ar 62 mm, flash_ar 56 mm.

### Grips (`grip_*`)

The origin is the **top of the rail clamp**, the face that touches a bottom Picatinny rail. The grip hangs toward -Y. The `grip_support`
empty is the palm centre: use it as the left-hand IK target instead of the weapon's own `grip_support`. The weapons do not
have a bottom-rail empty. Place grips on the handguard underside below the weapon's `grip_support`, which is about 30 mm below the bore
on most ARs.

### Magazine and stocks

- `mag_ext`: a full 40-round polymer box magazine (5.56 STANAG pattern, 259 mm) with two cartridges in the lips. The origin is the magazine
  top, the same convention as the weapons' `mag` pivots. On 5.56 rifles it can replace `mag_mesh`. For other guns, scale the stock mag
  instead or use this only as the ground pickup.
- `stock_tactical`: buffer tube and collapsible stock. The origin is the receiver end plate on the tube axis, and the stock extends toward -Z.
  `buttpad` = rear contact point, `cheek` = cheek-weld point.
- `stock_cheekpad`: U-shaped padded riser with two buckled straps. The origin is the top of the stock comb, the stock runs through
  the U along Z (inner width 42 mm), and `cheek` is the top of the pad.

## Quality notes

- 0.7k-21k triangles each. Every part has rounded bevels, baked edge wear, cavity grime and AO. Optics use half the edge wear of the guns.
  Machined details are real geometry: knurled knobs, turret ribs, ring screws, cross bolts, compensator ports and birdcage slots,
  which are actual boolean cut-outs.
- The holographic sight is the simplest optic. It has a sloped hood, a window, buttons, a battery cap and a QD lever, but no internal emitter detail.
- There are no LODs, because attachments are small. If needed, `node tools/assets/gear/gltf_util.mjs lod in.glb out.glb --ratio 0.3` makes one.
- Rebuild: `BLENDER=... tools/assets/gear/build_all.sh <work> scope_4x ...`, then `node tools/assets/gear/make_manifest.mjs`.
  To render a contact sheet: `node tools/assets/gear/preview/contact_sheet.mjs out.png public/assets/attachments/*.glb --markers 1`.
