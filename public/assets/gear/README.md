# Wearable gear: helmets, vests, backpacks, parachute

10 gear GLBs plus LOD1 copies: three helmet levels, three vest levels, three backpack levels and a ram-air parachute. They are fitted
to the project's characters (skeleton `pubg_m55`, rest A-pose, ~1.8 m). `manifest.json` holds per-asset data: file, triangle count,
bytes, bounds, nodes, attach bone and offset. It is also the **combined index** for the whole attachments / melee / throwables / gear / items
category, in its `index` and `weapons_extra` sections.

## Source and license

Every model in this folder is **authored for this project** (CC0) by scripted Blender modelling in `tools/assets/gear/`.
Helmets are parametric shells. Vests and backpacks are panels, straps, pouches and MOLLE generated from a **measured body envelope**.
`tools/assets/gear/fit/body_envelope.py` ray-casts the rest-pose meshes of survivor_m_shirt / _leather / _vest / _hoodie_blue
and stores the result in `fit/body_envelope_m.json`. That data gives the torso radius per height and azimuth, the front, back and shoulder
height fields, and the bare-head radius per direction. Materials are baked per asset into one 1024 px PBR set. Sources include
cordura with weave/fibre bump, ribbed webbing, velcro, textured paint, gloss fibreglass, M81-style woodland camo, rubber,
leather and zinc hardware. There are generated decals: "POLICE" patches, which are generic wording and not a real agency.

No free model was good enough. Rigged or fitted CC0 gear is very rare. Mixamo and Sketchfab need a login. The generic CC0 helmets and vests
I found were low-poly or did not fit this skeleton.

## Attachment (rest pose, character space: +Y up, +Z forward, the character's left is +X)

All joint rest rotations of `pubg_m55` are identity, so a root-space offset in the rest pose equals a bone-local offset.
Attach each GLB **rigidly** to the bone, with the offset below and identity rotation.

| asset | origin | bone | offset from bone (m) | root-space origin (rest) |
|---|---|---|---|---|
| helmet_1..3 | head centre | `Head` | (0, 0.100, 0.008) | (0, 1.687, 0.008) |
| vest_1..3 | chest centre | `Spine2` | (0, -0.021, 0.020) | (0, 1.300, 0.000) |
| backpack_1..3 | upper-back attach point (pack front face) | `Spine2` | (0, 0.079, -0.165) | (0, 1.400, -0.185) |
| parachute | between the shoulder riser attachments | `Spine2` | (0, 0.15, -0.03) | (0, 1.47, -0.05) |

- `src/characters/anim/Equipment.ts` currently scales loaded gear into a procedural proxy box (`fitTo`). With these assets the
  proxy fit is no longer needed. Use `holder.add(gltf.scene)` at the offsets above and scale by `rig.height / 1.8` only for
  non-standard rigs.
- **Female variants** (`survivor_f_*`) have a shorter, narrower torso. Attaching to the bones keeps the gear in the right place.
  Vests and backpacks then sit about 1-2 cm proud of the body, because they were fitted to the male envelope. A uniform scale of ~0.94 on
  vests looks right.
- **Hair and hoods**: helmets are sized for the bare head with 10-12 mm of clearance. They clip voluminous hair
  (survivor_m_leather) and raised hoods. Hide or swap the hair mesh while a helmet is worn. Vest and backpack shoulder straps follow the
  shoulder height of the shirt/vest variants, so they sink slightly into thick hoods and collars.
- Vests and backpacks are rigid. They follow `Spine2` well in normal locomotion. Strong torso bends show small intersections at the
  lower edge. Optional improvement: skin the lower half of each vest to `Spine1`.
- **Vest + backpack** together: packs sit behind the thickest vest (vest_3's back plate, which has no back pouch), so any
  combination works. Backpack harness straps lie over the vest shoulder straps.

## Assets

| id | description |
|---|---|
| helmet_1 | open-face (3/4) motorcycle helmet: gloss blue-grey fibreglass shell, black liner, rubber edge trim, snap-on peak with 3 snaps, chin strap with double D-rings |
| helmet_2 | PASGT-style ballistic helmet in a woodland camo cloth cover, with cover fold, elastic band with cat-eye strips and an olive chin strap |
| helmet_3 | Spetsnaz heavy helmet (Altyn/K6-3 style): deep olive textured-paint dome, ear arches with padded ear protectors, visor hinge bosses and stop pins, rubber trim, leather chin strap. There is no visor, as in PUBG. |
| vest_1 | police soft armour in a navy carrier: front and back panels, elastic side straps with velcro tabs, elastic shoulder straps, POLICE patches front and back |
| vest_2 | black police tactical vest: padded panels, cummerbund sides, MOLLE, three mag pouches with magazines and bungees, radio pouch with antenna, admin pouch, POLICE placards, drag handle |
| vest_3 | ranger-green military plate carrier: rigid front and back plate bags (single-curve plates), MOLLE, cummerbund with MOLLE, triple mag pouch, admin pouch, velcro ID panel, radio pouch and general-purpose pouch, padded shoulder straps, drag handle |
| backpack_1 | ~20 l grey urban daypack: rounded top, zipped main compartment and front pocket, grab handle, padded harness with sternum strap and lower webbing |
| backpack_2 | ~35 l olive assault pack: lid, admin pocket, MOLLE, side compression straps with buckles, harness |
| backpack_3 | ~65 l coyote rucksack, rising above the shoulders: overhanging lid pocket with straps, two side pockets, front pocket with compression straps, bedroll strapped underneath, padded hip-belt wings, harness |
| parachute | 9-cell ram-air canopy (7.2 m arc span, 2.7 m chord, NACA-style airfoil with pillowed cells, open leading-edge inlets, end-cell stabilisers, navy/white with an orange centre cell), 40 suspension lines + brake lines, 4 risers |

### Parachute nodes

- `canopy`: the wing as one mesh with a double-sided material. Its bottom centre is ~4.3 m above the origin and 0.6 m ahead, matching
  `ParachuteVisual`. Scale this node for the opening animation (for example y and x from 0.3 to 1).
- `lines`: every suspension and brake line as thin tubes, with the plain material `line`. Hide it or fade it with the canopy.
- `risers`: four webbing risers and connector links from the shoulders up to the line links.
- empties `riser_l` / `riser_r` (shoulder attach points, ±0.16 m on X) and `canopy_center`.

## Melee weapons and throwables (files in `public/assets/weapons/`)

They are produced by this category's pipeline but live next to the guns. The weapons `manifest.json` belongs to the weapons pipeline, so
these files are listed in **this** manifest under `weapons_extra`.

| id | source | origin / axes | nodes |
|---|---|---|---|
| melee_pan | authored: 26 cm cast-iron skillet, cast-iron PBR with pitting and worn edges | hand grip on the handle; +Z toward the pan; cooking face +Y. Roll 90 deg about Z to swing it like a bat | body, `tip` |
| melee_machete | Poly Haven [Machete](https://polyhaven.com/a/machete) (CC0, Ulan Cabanilla) | hand grip; blade along +Z, edge toward -Y | body, `tip` |
| melee_crowbar | Poly Haven [Crowbar 01](https://polyhaven.com/a/crowbar_01) (CC0, Alexander Otterbeck) | hand grip near the chisel end; hook end along +Z | body, `tip` |
| melee_sickle | authored: crescent carbon-steel blade with a ground edge on the inside of the curve, turned wood handle, ferrule | hand grip; blade forward (+Z) curling up (+Y) | body, `tip` |
| throw_frag | authored: M67-style 64 mm olive body, yellow band, fuze, spoon and pull ring | body centre; fuze +Y | body, `spoon` (pivot at the lever hinge) -> spoon_mesh, `pin` (pivot) -> pin_mesh, `pin_ring` |
| throw_smoke | authored: M18-style can with stencilled label, white top with emission holes | can centre; fuze +Y | same as frag |
| throw_stun | authored: M84-style perforated tube (real boolean holes), black ribbed caps | body centre | same as frag |
| throw_molotov | authored: 0.75 l green glass bottle (alpha-blended `glass` node), fuel (`fuel` node), printed wine label, cloth rag wick with string | hand grip 110 mm above the base; neck +Y | body, glass, fuel, `wick` (fire FX) |

Grenade animation: pulling the pin = animate or hide `pin`. Release = rotate `spoon` about its local X (the hinge) and detach it.

## LODs

`<id>_lod1.glb` for helmets, vests and backpacks has about 28 % of the triangles (meshoptimizer simplify, error 0.4 %) and 512 px
textures, with the same nodes and origin. Switch at about 25 m together with the character LOD1. Generate it with
`tools/assets/gear/make_lods.sh`.

## Quality notes and gaps

- Size: the gear folder is 7.7 MB including LODs. The whole category (attachments + reticles, items, gear, melee/throwables) is 17.8 MB, well under the 35 MB budget.

- LOD0 triangle counts are 9k-25k for vests and helmets and 5k-12k for backpacks. The parachute has ~9k triangles plus lines.
- Fabric detail comes from the bake: weave/fibre bump, wrinkles displaced into the pouch geometry and soft rounded edges. There is no
  stitching geometry.
- No ghillie suit. It would need a skinned mesh on the character skeleton, so it is better done as a character variant.
- Rebuild: `BLENDER=... tools/assets/gear/build_all.sh <work> helmet_2 vest_3 ...`, `tools/assets/gear/make_lods.sh`, then
  `node tools/assets/gear/make_manifest.mjs`. Fit check on a character:
  `node tools/assets/gear/preview/fit.mjs out.png --char public/assets/characters/survivor_m_shirt.glb --gear "public/assets/gear/vest_3.glb@0,1.30,0;public/assets/gear/helmet_3.glb@0,1.687,0.008"`.
