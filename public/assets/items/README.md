# Loot items

16 ground-loot GLBs: six ammo pickups, six heals/boosts, a fuel can, the airdrop crate (plus a descending variant with a
parachute) and the death box. Per-asset data is in `manifest.json`: file, source, license, triangle count, bytes, bounds, nodes and origin.

## Sources and licenses

| id | source | license |
|---|---|---|
| ammo_762 | Poly Haven [Ammo Box](https://polyhaven.com/a/ammo_box) by DanKit: M19A1-style can stencilled "200 CARTRIDGES 7.62 MM" | CC0 |
| item_fuelcan | Poly Haven [Metal Jerrycan](https://polyhaven.com/a/metal_jerrycan) by Sean Buckley: red 20 l can, decimated to 8k tris | CC0 |
| deathbox | Poly Haven [Wooden Crate 02](https://polyhaven.com/a/wooden_crate_02) by James Ray Cock / Jurita Burger: rope-handled chest with a separate `lid` | CC0 |
| everything else | authored for this project, scripted Blender (`tools/assets/gear/models/<id>.py`) | CC0 |

The Poly Haven props were re-oriented, re-centred, had their textures downsized to 1024 px and were meshopt-compressed by `tools/assets/gear/ph_prop.py`
(see `build_ph.sh`). Authored items use printed-label decals that `tools/assets/gear/labels.py` / `labels_items.py`
generates. All brands are fictional: FIELDLINE / TARGETLINE / PRECISION ammunition and VOLTAGE energy drink.

## Conventions

- **Origin = bottom centre resting on the ground (y = 0)**, +Y up, metres. The printed front faces +Z. Spawn ground loot at the
  terrain height and give it a random yaw.
- Compression: `EXT_meshopt_compression` + `KHR_mesh_quantization`. Authored items use one baked PBR material (512 px; 1024 px for the
  med kit and airdrop) plus plain materials for clear glass and liquids (`glass_clear`, `liquid_yel`, `line`).

| id | what it looks like | size (m) | nodes |
|---|---|---|---|
| ammo_556 | olive printed 30-rd box "5.56x45 BALL M855" + 3 loose green-tip rounds | 0.14 x 0.04 x 0.12 | body |
| ammo_762 | steel ammo can (Poly Haven) | 0.26 x 0.18 x 0.09 | body |
| ammo_9mm | white/red 50-rd box "9mm LUGER" + 3 loose FMJ rounds | 0.10 x 0.04 x 0.11 | body |
| ammo_45acp | blue/gold 50-rd box ".45 AUTO" + 3 loose rounds | 0.11 x 0.04 x 0.12 | body |
| ammo_12g | red/yellow 25-shell box "12 GAUGE 00 BUCK" + 2 loose red shells | 0.13 x 0.07 x 0.12 | body |
| ammo_300mag | black/gold 20-rd box ".300 WIN MAG" + 2 loose long rounds | 0.16 x 0.05 x 0.12 | body |
| item_bandage | gauze roll with its loose end unrolled on the ground + a second roll in a printed sterile band | 0.14 x 0.08 x 0.20 | body |
| item_firstaid | white ABS first aid case with a red-cross lid, latches, hinge and handle | 0.23 x 0.08 x 0.17 | body |
| item_medkit | red cordura trauma bag with white-cross patches, zip, twin handles and end pockets | 0.52 x 0.27 x 0.23 | body |
| item_energydrink | 500 ml printed aluminium can with pull tab | 0.066 x 0.168 | body |
| item_painkiller | white pharmacy bottle with ribbed child-proof cap and label | 0.053 x 0.098 | body |
| item_adrenaline | 20 ml syringe (clear barrel, yellow liquid, label, orange needle cap) lying along +Z | 0.05 x 0.03 x 0.22 | body, glass, liquid |
| item_fuelcan | red steel jerrycan (Poly Haven) | 0.35 x 0.46 x 0.17 | body, `spout` empty |
| airdrop_crate | olive painted plywood supply crate on a skid with yellow cargo straps, steel corner angles, stencils and a lifting ring | 1.29 x 1.25 x 1.29 | crate, `chute_attach`, `smoke` |
| airdrop_crate_chute | the same crate under a 7.5 m red/white round cargo parachute (20 gores, 20 lines) | 7.8 x 8.2 x 7.8 | crate, canopy, lines, `chute_attach`, `smoke`, `canopy_center` |
| deathbox | wooden loot chest (Poly Haven) with a separate lid | 0.53 x 0.46 x 1.17 | body, lid |

- **Airdrop**: spawn `airdrop_crate_chute` while it descends. Optionally sway and tilt the `canopy` node. On landing, swap to `airdrop_crate`
  or hide `canopy` + `lines`. The `smoke` empty marks where the red flare smoke comes out.
  The canopy material is double-sided.
- **Deathbox**: rotate `lid` about its back edge (local X) to open it.
- Held items: the energy drink, painkiller bottle and syringe can also be shown in the hand during the `use_item` / `drink` clips.
  Their origin is the bottom centre, so add a small grip offset.

## Gaps / notes

- Only `ammo_762` uses a real can. The others are smaller printed cartridge boxes, so each caliber reads at a glance. The 7.62 can is
  much larger, so scale it to about 0.7 if consistent pickup sizes matter.
- No LODs (items are small and few at a time).
