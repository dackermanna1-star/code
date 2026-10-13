# Weapon model generator

`generate_models.py` turns the Python weapon designs in `weapons/*.py` and the attachment library in
`attachments.py` into Minecraft model JSON, item model definitions and first-person render metadata.

```
python3 tools/assetgen/models/generate_models.py                 # everything (cleans old output)
python3 tools/assetgen/models/generate_models.py --only ak --no-clean --preview --preview-dir /tmp/prev
```

## Conventions (binding — the Java renderer relies on them)

* 1 unit = 1 model pixel. Muzzle points toward **-Z**, the bore axis is `x = 8, y = 8`. Up is +Y,
  the right-hand side of the weapon (ejection port) is +X.
* Coordinates may exceed Minecraft's `[-16, 32]` range: each model is shifted into range automatically
  and its display transforms are compensated (only y/z are shifted). Keep every single part, and the
  whole weapon, under **48 units** per axis.
* Every box has a material **role**: `receiver`, `furniture`, `metal`, `detail`, `accent`, `mag`,
  `brass`, `shell`. Use `glow=True` only on thin `accent` strips (they light up on the neon/energy skins).
  Each weapon sets `w.standard` (role → library texture) for its stock finish.
* Parts:
  * `w.part("body")` – everything static.
  * `w.part(name, animated=True)` – moving parts, rendered separately in first person.
    Allowed names: `slide`, `bolt`, `charging_handle`, `pump`, `cylinder`, `hammer`, `bolt_handle`,
    `feed_cover`, `belt`, `shell` (use `in_world=False` for first-person-only props such as the pump
    shotgun's loose `shell`).
  * `w.variant(slot, vid)` – `barrel`, `stock`, `magazine` variants. `vid` is `"default"` or the attachment
    id (`calibercraft:short_barrel`, `calibercraft:extended_mag`, …). Magazine variants are animated
    (they drop out during reloads) unless the slot is listed in `w.static_variant_slots`.
* Every barrel variant must register `w.muzzle_by_barrel[vid] = (8, 8, z_tip)`.
* `w.mounts` — attachment mount points (see the conventions at the top of `attachments.py`):
  `optic` (top rail surface), `grip` (bottom rail surface), `tactical` (right side surface), `charm`.
* `w.points` — `grip` (right hand centre on the pistol grip), `support` (left hand), `ejection`
  (ejection port centre), `mag_well` (bottom centre of the magazine well).
* `w.iron_sight_y` / `w.iron_sight_z` — eye line height and rear sight position for aiming without optic.
* `w.slots` — allowed attachments for `optic`, `muzzle`, `grip`, `tactical`, `charm` (ids must exist in
  `attachments.py`). Barrel/stock/magazine compatibility is implied by the variants you model.
* `w.anim` — hints for the procedural animation system:

| part              | keys |
|-------------------|------|
| `magazine`        | `pivot` [x,y,z] (top centre of the magazine), `style`: `drop` (straight down) or `rock` (AK-style: tilts forward around the pivot, which sits at the *front* top edge) |
| `slide`           | `travel` [dx,dy,dz] (rearward travel when cycling, e.g. [0,0,3]) |
| `bolt`            | `travel` |
| `charging_handle` | `travel` |
| `pump`            | `travel` |
| `bolt_handle`     | `pivot` (point on the bolt axis), `lift_deg` (rotation about +Z when lifted, positive = handle rises), `travel` |
| `cylinder`        | `pivot` (crane hinge point), `swing_deg` (rotation about +Z to swing out; negative swings to the left), `spin_center` (cylinder axis centre), `chambers` |
| `hammer`          | `pivot`, `cock_deg` (rotation about +X when cocked) |
| `feed_cover`      | `pivot` (hinge), `open_deg` (rotation about +X; negative lifts the rear upward) |
| `belt`            | `follow`: `"magazine"` (moves with the ammo box) |
| `shell`           | `from` [x,y,z] (where the hand holds it), `to` [x,y,z] (loading port) |

## Workflow for designing a weapon

1. Copy the structure of `weapons/ar15.py` (the reference design). Use `weapons/common.py` helpers.
2. Generate with `--only <id> --no-clean --preview --preview-dir <scratch>` and inspect the PNG.
   The preview shows: right side stock, right side with attachments, top, 3/4, left side, and three skins.
3. Iterate until the silhouette is instantly recognisable at small size and parts line up.
