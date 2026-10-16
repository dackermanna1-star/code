# residential — catalog

Soviet residential blocks of a Moscow microdistrict, winter 2008: panel series P-44, II-49,
1-515/9Ш, P-44T, the K-7 khrushchyovka and the brick II-32. One model = one **section**
(подъезд, one entrance); buildings are rows of sections. Explorable stairwells with a working
lift, doorbells and readable notices. Package order 25; `build()` places nothing (layout packages
call the API).

```js
import { placeResidential, residentialSize } from '../residential/api.js'
```

## placeResidential(ctx, opts) → building

Call it from your package's `build()` (signs, zones and interactions must exist before the world
is finalized).

```js
const b = placeResidential(ctx, {
  series: 'ii49',          // 'p44' | 'ii49' | '1515' | 'p44t' | 'k7' | 'ii32'
  floors: 9,               // see the table; any 2..18 works (models are defined on demand)
  sections: 4,             // entrances side by side along the building's local +X
  x: 300, z: 352,          // FRONT-LEFT CORNER at grade (see orientation table)
  rot: 2,                  // quarter turns (or angle: radians)
  y: 0.25,                 // optional; default = lowest terrain along both facades, clamped to 0..0.5
  seed: 3,                 // varies lit windows, section variants, lamps, door colours
  enterable: [2],          // section indexes with an explorable stairwell (+lift if the series has one)
  address: { street: 'ул. Берёзовая', house: '12', korpus: '2' },
  firstEntrance: 1,        // number on the first entrance plate («Подъезд N»)
  firstApartment: 1,       // first flat number of entrance 1 (flats per entrance = floors × flats/floor)
  tint: 0x4f6b8f,          // accent colour (tile bands, loggia panels, P-44T brick); default per series
  variants: ['a','b','a'], // optional per-section model variant (default: picked from seed)
  lampsBroken: 0.2,        // share of dead entrance lamps (default 0.2)
  homeLight: [2],          // that stairwell's 1st-floor landing bulb always works ("one working light")
  porch: true,             // false = no porch/canopy (e.g. if you build your own)
})
// b = { placements, sections, entrances, bounds:{minX,minZ,maxX,maxZ}, height, length, depth, y, series, floors }
// b.entrances[i] = { index, number, building, x, y, z (door centre on the outer wall face, porch level),
//   angle (Signs convention: 0 faces +z; the way the entrance faces), outside: [x,z] (3 m in front of
//   the facade, just past the porch steps), doorPlacement, sectionPlacement, enterable,
//   flats: [first,last], address, lamp (Light|null), noticeSpot: {x,y,z,angle} (wall left of the door,
//   1.6 m up, for notices) }
```

### Orientation of (x, z)

(x, z) is the corner of the **entrance facade** where section 0 starts, at grade. Sections run
along local +X; the body (depth D) lies along local +Z behind the entrance facade; porches
(2.5 m) and balconies (≤ 1.5 m) stick out in front, balconies ≤ 1.5 m at the back.

| rot | entrances face | building runs from (x,z) | body extends |
|---|---|---|---|
| 0 | north (−z) | east (+x) | south (+z) |
| 1 | west (−x) | north (−z) | east (+x) |
| 2 | south (+z) | west (−x) | north (−z) |
| 3 | east (+x) | south (+z) | west (−x) |

Example: courtyard on the south side of a building whose entrance facade is the line z = 352,
running from x = 300 to the west → `rot: 2, x: 300, z: 352` (the body occupies z 340–352 for an
II-49, porches reach z 354.5).

### residentialSize(series, floors, sections = 1)

```js
residentialSize('ii49', 9, 4)
// → { length: 108, depth: 12, frontMargin: 2.5, backMargin: 1.5, height: 28.75, sectionLength: 27, flatsPerEntrance: 36 }
```
Meters, nothing placed. `frontMargin` = how far porches/balconies stick out in front of the
entrance facade, `backMargin` = balconies at the back; `height` = parapet top above grade (the
machine room and antennas add up to ~6 m more).

### Sizes (per section, meters)

Length along the building / body depth / balcony margin front & back / height to the parapet top
above grade / flats per entrance / door centre measured from the section's left end (local x).
Model height incl. machine room and antennas is height + 6 m. Porches add 2.5 m in front of the
entrance facade.

| series | floors | length | depth | margins F/B | height | flats | door at |
|---|---|---|---|---|---|---|---|
| p44 | 9, 10, 12, 14, 16, **17** | 25.5 | 13.0 | 1.5/1.5 | 29.0 (9) · 37.25 (12) · 48.25 (16) · **51.0 (17)** | 4/floor (68 @17) | 13.75 |
| ii49 | 5, **9**, 12 | 27.0 | 12.0 | 1.5/1.5 | 17.75 (5) · **28.75 (9)** · 37.0 (12) | 4/floor (36 @9) | 14.5 |
| 1515 | 5, **9** | 26.5 | 12.0 | 1.5/1.5 | 17.5 (5) · **28.5 (9)** | 4/floor | 14.25 |
| p44t | 9, 12, 14, 16, **17** | 26.0 | 14.0 | 1.5/1.5 | 29.0 (9) · **51.0 (17)** | 4/floor | 14.0 |
| k7 | **5** | 21.5 | 10.5 | 1.0/1.0 | 17.25 | 3/floor (15) | 11.75 |
| ii32 | **5** | 21.5 | 11.0 | 1.5/1.5 | 17.25 | 4/floor (20) | 11.75 |

Examples: a 9-storey II-49 of 4 sections is 108 × 12 m (+2.5 m porches), 28.75 m tall; a
4-section 9-storey P-44 is 102 × 13 m; a 6-section K-7 is 129 × 10.5 m, 17.25 m tall; one P-44T
tower section is 26 × 14 m, 51 m tall.

Floor levels above grade: floor k is at 1.25 + 2.75·(k−1) m; half-landings (stair windows) are
1.5 m above each floor; the porch platform / tambour floor is at +0.5 m.

## Series looks

- **p44** — white tile, accent-colour tile bands under the windows and on loggia fronts, accent
  tile stripes on the gables, a vertical stack of open transit balconies either side of the stair
  column (about a third of their bulbs dead), lift machine room. Default tint blue `0x4f6b8f`
  (1979–83); brown `0x7a4b32` (from 1983), beige `0xb9a688` (from 1988).
- **ii49** — cream tiled panels with striped mosaic "carpets" in the accent colour (pale blue
  default), fallen-tile scars, old wooden frames, loggias glazed by owners in every possible way,
  refuse-room door «Мусорокамера» beside the entrance.
- **1515** — grey panels, ribbed balcony fronts, accent stripe on the end bays.
- **p44t** — cream panels with terracotta brick-relief columns and bay windows (эркеры), white
  PVC windows, transit balconies.
- **k7** — 5-storey frame-panel khrushchyovka: small tile, protruding column-and-girder grid, no
  balconies, blind gables, no lift.
- **ii32** — 5-storey sand-lime brick, small slab balconies with steel railings, no lift.

Every section: plinth with dark basement vents (продухи), raised 1st floor, steel entrance door,
intercom, «Подъезд N · кв. a–b» plate beside the door, canopy with snow and icicles, staggered
half-landing stair windows, apartment windows with unique window ids (procedural lit rooms at
night) recessed one voxel behind a frame ring with a sill, loggias/balconies with varied glazing,
laundry, skis and jars, satellite dishes («ТВ-Плюс»), a rare AC unit, first-floor window grilles,
rust streaks, panel seams and darker re-sealed joints, roof parapet with a 0.25–0.5 m snow cornice
and icicles, vent stacks, TV antennas, cables over the parapet. Gables carry blue house-number
plates near both corners (half are lit boxes at night) and a big painted «12/2» near the top.

Night look: the self-lit stairwell whitewash (non-enterable sections) and transit-balcony
ceilings follow the street-light schedule (dark by day, glowing from dusk; ~72% of stair floors
lit). Explorable sections are lit by real indoor bulbs, plus a faint glow around the working
half-landing bulbs so their stair column still reads lit from the courtyard.

## Models

All sections: pivot = front-left corner of the entrance facade at grade (model voxel (0, 3, F));
foundation 0.75 m below grade; front (entrance) = local −Z; sections tile along +X with no gap.
LODs [1,2,4] (75 m / 190 m), `occludesSnow`. Name: `res_<series>_<floors>_<variant>[_ent]`,
variants `a`, `b`, `c` (different glazing, frames, junk, dishes, lit stair floors; identical
structure). `_ent` = explorable stairwell geometry (lift shaft, real lights). Use the API rather
than placing these directly — it adds the porch, door, lamp, lights, signs, interactions and runtime.

| model | size (m) | pivot | notes |
|---|---|---|---|
| `res_<series>_<floors>_<v>[_ent]` | see table | front-left corner at grade | section |
| `res_porch_a/b/c` | 3.5 × 4.75 × 2.5 | back-centre at grade (wall side) | 0.25 m step + platform (+0.5 m), canopy (+2.75 m) with snow and icicles; a: cantilever + sand box, b: on pipe posts + rails, c: corrugated re-roof + ramp. Front = −Z |
| `res_door_entrance` | 1.0 × 2.0 × 0.5 | hinge corner, outer face | dynamic steel door leaf (tint = paint colour); front = −Z |
| `res_door_inner` | 1.0 × 2.0 × 0.25 | hinge corner | wooden tambour door with frosted pane |
| `res_lamp_entrance` | 0.25 cube | back centre | `lamp_warm`, follows its light |
| `res_lamp_ceiling` | 0.25 cube | top centre | `lamp_bulb`, indoor |
| `res_lift_cab` | 2.0 × 2.75 × 1.5 | corner (0,0,0) | dynamic, indoor; opening at −Z |
| `res_lift_leaf` | 0.5 × 2.0 × 0.25 | corner | lift landing door leaf (matte grey) |

## Runtime behaviour

- **Entrance doors.** Enterable: `E` opens (key-pill beep or exit-button clack,
  `door_metal_open`); it swings out and auto-closes after ~4.5 s when nobody stands in the
  way, with `door_metal_slam` + `door_magnet_lock`. Others: «Заперто · домофон» →
  `intercom_beep`, then `intercom_call` rings for 7 s; nobody answers.
- **Entrance lamp**: a bulb above the door under the canopy, light 4.4 / range 8.5, `schedule:
  'night'`, ~20% dead (lampsBroken), ~12% buzzing, ~8% dying.
- **Stairwells** (enterable): tambour with a propped-open inner door and a notice, mailboxes
  (readable flyer), stair flights with railings, two-tone paint following the stairs (dark
  green/blue/brown up to 1.5 m, whitewash above), tiled landings, 3–4 flat doors per landing
  (dermatin with brass nails, steel, "oak" vinyl) with numbers and bell buttons — «Позвонить» →
  `doorbell`; very rarely `footsteps_phantom` behind the door, then nothing. Painted floor
  numbers, electrical cabinets, garbage chute hatches (`garbage_chute`), radiators (random
  `radiator_knock` while inside), graffiti and scratched texts (readable, with translations),
  roof-hatch notice on the top half-landing. Bulbs: tambour always works; landing bulbs ~38%
  dead, some `buzz`, some `dying`; half-landing bulbs follow the model variant. Muffled
  `tv_muffled` / `voices_muffled` behind ~16% of doors (created lazily near the player once audio
  runs). Zone `stairwell_<n>`: reverb 'stairwell', indoor, no snow.
- Ceiling height in stairwells is 2.25 m (2-voxel slabs: whitewashed underside, tiled top); the
  tambour is 2.0 m.
- **Lift** (series p44, ii49, 1515, p44t): call button on every landing («Вызвать лифт»),
  working cab with wood-grain laminate, fluorescent light (buzzing), burnt buttons, 400 kg
  plate; floor buttons inside («Этаж N»). Sounds `elevator_call`, `elevator_doors`,
  `elevator_motor` (loop, follows the cab), `elevator_stop`. Zone `lift_<n>` reverb 'elevator'.
  Doors stay open while the player stands in the doorway.
- **Readable texts** (`E`, tag `'notice'`): tambour notice «Закрывайте дверь подъезда!», roof
  notice «Выход на кровлю закрыт. Ключи в ДЕЗ», graffiti («Надпись»), the «Мусорокамера» plate.

## Registry / tags

- `registry.entrances[]` — every entrance (see `b.entrances`).
- `registry.buildings[]` — `{ id, series, floors, sections, address, bounds, height, entrances, x, z, angle }`.
- `registry.stairwells[]` — `{ entrance, building, windows: [[x,y,z] per floor], enterable }`:
  world centres of the half-landing windows (the stair column, e.g. for lights or effects).
- Tags: sections `'building'`, porches `'porch'`, entrance doors `'entrance'`, entrance lamps
  `'lamp'`, stair bulbs `'stair_lamp'`, lift parts `'lift_cab'`, `'lift_door'`. Lights:
  `'entrance_lamp'`, `'stair_light'`, `'lift_light'`. Interactions: `'entrance_door'`,
  `'apartment_door'`, `'lift_call'`, `'lift_button'`, `'chute'`, `'mailboxes'`, `'notice'`.
- navPaths: one `{ kind: 'entrance', y }` per entrance: door → `outside` (3 m out) → 6.5 m out.

## Sounds used

`door_metal_open`, `door_metal_slam`, `door_magnet_lock`, `intercom_beep`, `intercom_call`,
`doorbell`, `footsteps_phantom`, `elevator_call`, `elevator_doors`, `elevator_motor`,
`elevator_stop`, `garbage_chute`, `radiator_knock`, `tv_muffled`, `voices_muffled` (all
guarded: silently skipped if not registered or before audio starts).

## Notes for layout agents

- Paint the ground (paths at 0.25) before calling, or pass `y: 0.25`. The plinth is buried
  0.75 m, so 0.25 m of terrain variation along a building is fine.
- Keep the 2.5 m porch zone and ~1.5 m in front of it clear (no snow banks, trees or cars);
  use `entrances[i].outside` as the start of the path to the door. Benches go beside the porch.
- Put notices on the wall via `entrances[i].noticeSpot` (not on enterable doors — they move).
  The entrance plate sits above it at ~2.1 m on the same side of the door; the intercom is on the
  other side.
- Adjacent buildings at a corner: leave ≥ 1 m between bounds or butt them gable to gable.
- Stairwell lights are indoor; each enterable section adds ~10–28 lights (only the nearest 24
  are evaluated, so this is fine) — keep enterable sections to the few the plan asks for.
- Cost (quads at LOD0 / LOD1 beyond 75 m / LOD2 beyond 190 m): 9-storey II-49 ≈ 20k / 8k / 1.4k,
  1-515 ≈ 24k / 8k / 1.6k, 17-storey P-44 ≈ 38k / 14k / 1.8k, P-44T ≈ 45k / 16k / 2.6k, K-7 and
  II-32 ≈ 14k / 5k / 0.8k. Every distinct (series, floors, variant, mode) is one model built and
  meshed at load (~0.1–0.5 s each): reuse 2–3 variants rather than many different floor counts.
- House-number plates and the painted gable number appear only when `address` is given.
- Dev showcase: `?resdemo=1&only=base,residential&x=231.5&z=380` (test district around x 170–420,
  z 330–505; `?resdemo=home` places only the II-49 «12/2» with its enterable 3rd entrance at
  x ≈ 231.5, z = 352; never active in the real game).
