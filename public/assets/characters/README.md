# Characters

There are 12 realistic human combatants. All of them are skinned to ONE shared 55-joint skeleton (`pubg_m55`).
The 148 animation clips in `/assets/anims/*.glb` are retargeted to that skeleton, so any clip plays on any
variant without further processing.
`manifest.json` is the machine-readable source of truth: skeleton bones, sockets, per-variant stats and the full clip
table with speeds, loop flags and sources. This README explains how to use the assets and lists the known gaps.

## Variants

| id | sex | look | LOD0 tris | LOD1 tris | LOD0 MB | height m |
|---|---|---|---|---|---|---|
| survivor_m_shirt | m | light-blue shirt, dark jeans | 32.4k | 7.4k | 1.33 | 1.83 |
| survivor_m_hoodie_blue | m | blue/white track hoodie, cap, jeans | 31.1k | 7.1k | 1.21 | 1.81 |
| survivor_m_denim | m | denim jacket, white tee | 29.7k | 6.7k | 1.15 | 1.80 |
| survivor_m_hoodie_grey | m | grey hoodie (hood up), black trousers | 28.3k | 6.4k | 0.93 | 1.81 |
| survivor_m_hoodie_brown | m | brown hoodie, jeans | 31.4k | 7.1k | 1.07 | 1.80 |
| survivor_m_leather | m | black leather jacket, cargo trousers | 32.4k | 8.7k | 1.47 | 1.87 |
| survivor_m_flannel | m | red flannel, beanie, beard, boots | 30.2k | 6.8k | 1.24 | 1.81 |
| survivor_m_workshirt | m | denim work shirt, cap | 31.4k | 7.1k | 1.18 | 1.81 |
| survivor_m_vest | m | older man, field vest | 32.9k | 7.8k | 1.54 | 1.81 |
| soldier_m_acu | m | ACU camo, helmet + NVG mount, plate carrier | 14.9k | 8.2k | 2.06 | 1.85 |
| survivor_f_leather | f | brown leather jacket, cargo trousers | 32.0k | 9.3k | 1.41 | 1.71 |
| survivor_f_hoodie | f | black zip hoodie, denim shorts | 32.6k | 8.8k | 1.37 | 1.67 |

- Each variant has `<id>.glb` (LOD0) and `<id>_lod1.glb` (LOD1). LOD1 uses the same skeleton and UVs with 512 px
  textures, so LOD1 can reuse the LOD0 materials. The suggested switch distance for LOD1 is about 25-30 m.
- Source: Microsoft Rocketbox avatars (MIT). They were rebuilt in Blender: joints were renamed to Mixamo style,
  face and eye bones were merged into Head, and LOD0 was subdivided once, with hands and hair cards kept linear and
  the result capped at 33k tris.
  Textures are 1024 px JPEG (color/normal) and 512 px ORM, with WebP RGBA for alpha-tested hair.
- `soldier_m_acu` keeps the original 15k mesh as LOD0, because subdividing it smeared the camo. It has US
  flag and unit patches. If neutral factions are wanted, edit its `body_color` texture.
- Male variants share an identical skeleton, with joint translations equal to 0.1 mm. The two female variants use the same
  joint names, hierarchy and identity rest rotations. They are scaled so that **Hips sits at the same height (0.895 m)**,
  which makes the spine and arms shorter. All clips play unchanged. In `rifle_aim` a weapon held by a female
  character sits about 5 cm lower and 6 cm closer to the centre line than on a male, and the eye line drops by the same amount.

## Loading

```ts
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder); // EXT_meshopt + KHR_mesh_quantization + EXT_texture_webp
const char = await loader.loadAsync('/assets/characters/survivor_m_shirt.glb');
const anims = await loader.loadAsync('/assets/anims/locomotion.glb');   // skeleton-only GLB, clips bind by node name
const model = SkeletonUtils.clone(char.scene);
const mixer = new THREE.AnimationMixer(model);
mixer.clipAction(THREE.AnimationClip.findByName(anims.animations, 'walk_f')).play();
```

## Conventions

- Units are meters. Up is +Y and the character faces **+Z**, so its left is +X and its right is -X. The feet stand on y = 0.
- The rest pose is an A-pose. **Every joint has an identity rest rotation and unit scale**, so the joint axes match the
  character axes in bind pose. Procedural offsets are therefore plain rotations: about +X for pitch (positive = nose down),
  +Y for yaw (positive = turn left) and +Z for roll.
  Examples are aim pitch on Spine/Spine1/Spine2, head look-at and leaning.
- Each clip has quaternion tracks for every joint plus one translation track on `Hips`, sampled at 30 fps with linear interpolation.
  Heights: Hips is at 0.895 m, eyes at about 1.69 m, and head top (`HeadTop_End`) at 1.79 m.

## Weapon sockets (child nodes inside every character GLB)

| node | parent | use |
|---|---|---|
| `socket_weapon_r` | RightHand | **Long guns.** Attach a weapon GLB as-is (weapon convention: origin = firing-hand grip, barrel +Z, up +Y). |
| `socket_pistol_r` | RightHand | **Pistols.** Same convention. The pistol grip differs from the rifle grip by about 70°. |
| `socket_weapon_l` | LeftHand | Mirror of `socket_weapon_r`, for left-hand items. |
| `socket_support_l` | LeftHand | The left-palm centre. Use it as the IK end-effector and drive it to the weapon's `grip_support` node. |

- The rifle socket is derived from `rifle_aim`, with the barrel running from the right grip to the left grip and no cant. These clips are aim-corrected
  so the barrel points exactly along +Z and level: `rifle_aim`, `rifle_crouch_aim`, `rifle_fire`, `rifle_crouch_fire`,
  `rifle_aim_walk_f`, `rifle_fire_walk_f`, `pistol_aim`, `pistol_fire`, `pistol_crouch_aim` and `pistol_crouch_walk_f`.
  `*_aim_up` and `*_aim_down` point exactly 55° up and 55° down.
  **To aim, blend** `*_aim_down` ↔ `*_aim` ↔ `*_aim_up` by camera pitch (±55°), or add pitch to Spine/Spine1/Spine2 for
  angles outside that range. The prone aim clips (`rifle_prone_idle`, `rifle_prone_aim`, `rifle_prone_fire`) are corrected for yaw only
  and keep about 9° of muzzle-up from the source.
- Clips from packs whose grip differed from the rifle socket were corrected so that the shared socket meets the support hand
  (`grip_fixed: true` in the manifest). This covers reloads, the Ch35 fire and prone clips, ADS walk and hit reactions.
  In every two-handed rifle clip the support hand stays within about 2.5 cm of the barrel axis. Reload, equip and sprint
  clips are the exceptions, because the left hand leaves the gun on purpose.
  Use left-hand IK to lock the hand onto the actual weapon model.

## Animations: how to use them

The clips are split across 4 files. The full table is in `/assets/anims/README.md` and in `manifest.json → anims.clips`.

- **Speed sync.** Locomotion clips (`mode: "loco"`) play in place: their root motion was measured and then removed.
  `speed_mps` is the original ground speed, and `move_dir` is `[right, forward]`.
  Set `timeScale = actualSpeed / speed_mps` to keep the feet planted. For 2D blending, use `move_dir`.
  The rifle, pistol and crouch sets include diagonals (`_fl`, `_fr`, `_bl`, `_br`).
- **One-shots** (`mode: "oneshot"`) keep their root motion. `root_displacement` gives `{right, up, forward}` in metres from
  start to end, and `yaw_change_deg` gives the body turn over the clip (positive = left).
  Either apply the displacement to the capsule over the clip, or strip it.
  This matters for deaths, vault (+3.7 m forward), climb (+1.7 m up), climb_low (+0.7 m up), car_enter, car_exit,
  hit_react_b and hit_stagger_*, which move up to about 1 m.
- **Facing.** `facing_deg {pelvis, shoulders}` is the average body heading of each clip. The mocap strafes (`walk_l/r`,
  `jog_l/r`) and the bladed rifle stance (`rifle_aim` pelvis ≈ -74°) turn the hips a long way. This is expected.
- **Heights.** `hips_y_mean` and `head_y_mean` place seats, water lines and similar. Seat clips (`drive_sit`,
  `passenger_sit`) are not grounded: align the hips with the seat. In swim clips the head sits at `head_y_mean`, so put
  the water surface about 0.15 m below it. Ladder clips are in place, with the lowest foot on y = 0.
  Move the character at `climb_speed_mps` (0.65 m/s).
- **Overlays.** `rifle_fire`, `pistol_fire`, the reloads, `throw_grenade`, `use_item`, `drink` and the hit reactions work well as
  upper-body overlays. Mask from Spine1 down, excluding the legs, on top of any locomotion.
- Weapon groups can borrow unarmed clips for anything they do not cover. Examples are `prone_crawl_*` with a rifle and the
  pistol crouch directions other than `pistol_crouch_walk_f`.

## Known gaps / recommendations

- **No lean clips.** For PUBG Q/E lean, rotate Spine1/Spine2 about +Z by about ±20° procedurally, and add about 5° of Hips roll.
- **Rifle prone crawl** uses the unarmed `prone_crawl_f/b` (Mixamo). The rifle stays in the right hand. There are
  no prone crawl strafes.
- **Swimming**: there is a real `swim_f` (front crawl) and `swim_idle` (treading water). `swim_b`, `swim_l` and `swim_r` are treading
  water with nominal speeds, because no dedicated clips exist.
- **Knocked state**: `knocked_crawl` is a hands-and-knees crawl at 0.48 m/s; play it at about 2× for PUBG speeds.
  `knocked_idle` is a breathing hold of that pose. There is no knock-down transition clip, so crossfade from hit/stagger over about 0.3 s.
- **Jumps**: the unarmed jump is a standing jump split into `jump_start` (0.6 s), `fall_loop` and `land`.
  There is no running-jump take-off. `rifle_jump_start`, `rifle_fall_loop` and `rifle_land` hold the rifle.
- **Grenade** throw is unarmed (`throw_grenade`, right-hand overhand, release at about 0.75 s). Hide or holster the gun during it.
- **Vehicles**: there is one driver enter/exit pair. `car_enter` steps about 1.6 m forward, then turns about 95° left and
  sits down. `car_exit` turns back and steps out to the left. Both carry `root_displacement` and `yaw_change_deg`.
  There are no passenger-side or motorbike clips. Reuse these, mirror them via a negative X scale, or snap.
- **Freefall/parachute**: `freefall` is a Mixamo horizontal skydive loop. `parachute_idle` is authored: the arms are up on the
  toggles and the pose was built procedurally. `parachute_hang` is the Mixamo alternative.
- `pistol_reload` comes from the stylised Quaternius pack (CC0). Its arm positions differ a little from the Mixamo pistol set,
  so crossfade over at least 0.2 s.
- The ADS walk exists only forward (`rifle_aim_walk_f`, `rifle_fire_walk_f`). For other directions, layer the `rifle_aim`
  upper body over the rifle walk legs.
- Some deaths (`death_f`, `death_l`, `death_r`, `death_headshot_*`, `death_crouch`) were captured holding a rifle, so the hands stay closed.
  With no weapon they still read fine.
- Equip clips exist for the rifle (`rifle_equip`) and the pistol (`pistol_draw`). There are no holster/unequip clips:
  play the equip clip reversed.

## Sources & licenses

| what | source | license |
|---|---|---|
| character meshes/textures | Microsoft Rocketbox avatars, https://github.com/microsoft/Microsoft-Rocketbox | MIT |
| 133 of the 148 clips | Adobe Mixamo (Pro Rifle Pack, Basic Shooter, pistol/locomotion/prone/vault/climb/car/hit/death clips). The FBX files were taken from public GitHub game projects, listed per clip in the manifest and in `tools/assets/characters/anim_sources.tsv` | Mixamo / Adobe terms: free to use in projects, no standalone redistribution |
| idle, walk_f/b, jog_f/b, sprint_f, crouch_walk_f/b | Ready Player Me animation library, https://github.com/readyplayerme/animation-library | RPM library license (made for RPM avatars). Review before a public release |
| punches, pistol_reload, revive_teammate, passenger_sit | Quaternius Universal Animation Library, https://quaternius.itch.io/universal-animation-library | CC0 |
| interact_door | Microsoft Rocketbox animation library | MIT |
| parachute_idle, pistol_fire recoil | authored procedurally | project |

**Before a public release**, re-download the Mixamo clips from mixamo.com with a free Adobe account to get first-party
provenance. They are the same Mixamo clips, so the pipeline below reproduces the GLBs. Also confirm the RPM license, or swap those
8 clips for Mixamo equivalents: the `kc__Standard_Walk`, `Walking_Backwards`, `Running`, `Running_Backward` and `Sprint` sources are
already downloaded and listed in `anim_sources.tsv`.

## Rebuilding

The tools are in `tools/assets/characters/`. Keep raw sources outside the repo, in `$ASSET_WORK`.

1. Characters: `build_all_characters.sh <blender> <RocketboxAvatarsDir> <work> anim_jobs/sockets.json public/assets/characters`
   runs `build_character.py`, `prep_textures.py` and `finalize_character.mjs`. With `FINALIZE_ONLY=1` it re-runs only
   the finalize step, for example to apply new sockets.
2. Animation sources: `download_anim_sources.sh $ASSET_WORK/raw/mixamo`, then
   `blender -b -P fbx2glb.py -- $ASSET_WORK/work/anims/src/mixamo $ASSET_WORK/raw/mixamo/*.fbx`.
   Add the UAL, RPM and Rocketbox sources as described in `anim_jobs/common.py`.
3. Retarget: `ASSET_WORK=… python3 anim_jobs/prod.py <out> anim_jobs/sockets.json && node retarget.mjs <out>/prod_job.json`.
   The clip list and every per-clip fix (aim/grip fix, trims, loops, poses) live in `anim_jobs/prod.py`.
   For what each option does, see the header of `retarget.mjs`.
4. Sockets: `compute_sockets.mjs <char.glb> <rifle.glb> out.json --rifle rifle_aim --check …`. For pistols, use `--pistol pistol_aim --pistolLevel` on a
   `pistol_aim` that was retargeted without aimFix. Re-run step 3 with the new sockets until they stop changing (one iteration).
5. Manifests: `node make_manifest.mjs <work>/raw_glb <out>/meta.json anim_jobs/sockets.json`.
6. Visual check: start `static_server.mjs`, then run `anim_jobs/sheet.py` and `render_preview.mjs` to get contact sheets with proxy weapons.
