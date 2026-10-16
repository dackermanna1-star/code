# residential — catalog

Soviet residential blocks of a Moscow microdistrict, winter 2008: panel series P-44, II-49,
1-515/9Ш, P-44T, the K-7 khrushchyovka and the brick II-32. One model = one **section**
(подъезд, one entrance); buildings are rows of sections. Explorable stairwells with a working
lift and doorbells. Package order 25; `build()` places nothing.

```js
import { placeResidential, residentialSize } from '../residential/api.js'
```

## placeResidential(ctx, opts) → building

```js
const b = placeResidential(ctx, {
  series: 'ii49',          // 'p44' | 'ii49' | '1515' | 'p44t' | 'k7' | 'ii32'
  floors: 9,               // see the table; any 2..18 works (models are defined on demand)
  sections: 4,             // entrances side by side along the building's local +X
  x: 300, z: 352,          // FRONT-LEFT CORNER at grade (see orientation table)
  rot: 2,                  // quarter turns (or angle: radians)
  y: 0.25,                 // optional; default = lowest terrain along both facades (0..0.5)
  seed: 3,                 // varies lit windows, glazing variants, lamps, door colours
  enterable: [2],          // section indexes with an explorable stairwell (+lift if the series has one)
  address: { street: 'ул. Берёзовая', house: '12', korpus: '2' },
  firstEntrance: 1,        // number on the first entrance plate («Подъезд N»)
  firstApartment: 1,       // first flat number of entrance 1 (flats per entrance = floors × flats/floor)
  tint: 0x4f6b8f,          // accent colour (tile bands, loggia panels, P-44T brick); default per series
  variants: ['a','b','a'], // optional per-section model variant
  lampsBroken: 0.2,        // share of dead entrance lamps
  homeLight: [2],          // that stairwell's first-floor bulb always works (story: "one working light")
  porch: true,             // false = no porch/canopy (e.g. if you build your own)
})
// b = { placements, sections, entrances, bounds:{minX,minZ,maxX,maxZ}, height, length, depth, y, series, floors }
// b.entrances[i] = { index, number, building, x, y, z (door centre, outer face, porch level), angle (Signs convention,
//   facing out), outside: [x,z] (3 m in front of the facade, just past the porch steps), doorPlacement, sectionPlacement, enterable, loop,
//   flats: [first,last], address, lamp (Light|null), noticeSpot: {x,y,z,angle} (wall left of the door for notices) }
```

### Orientation of (x, z)

(x, z) is the corner of the **entrance facade** where section 0 starts, at grade. Sections run
along local +X; the body (depth D) lies along local +Z behind the entrance facade; porches
(2.5 m) and balconies (≤1.5 m) stick out in front.

| rot | entrances face | building runs from (x,z) | body extends |
|---|---|---|---|
| 0 | north (−z) | east (+x) | south (+z) |
| 1 | west (−x) | north (−z) | east (+x) |
| 2 | south (+z) | west (−x) | north (−z) |
| 3 | east (+x) | south (+z) | west (−x) |

Example: courtyard on the south side of a building whose front line is z = 352, from x = 300 to
the west → `rot: 2, x: 300, z: 352`.

`residentialSize(series, floors, sections)` → `{ length, depth, frontMargin, backMargin, height,
sectionLength, flatsPerEntrance }` in meters, without placing anything.

### Sizes (per section, meters)

Length along the building / body depth / front & back margins (balconies) / height to the
parapet top above grade / model height incl. machine room and antennas / flats per entrance /
door centre measured from the section's left end. Porches add 2.5 m in front of the entrance facade.

| series | floors | length | depth | margins F/B | height | max | flats | door at |
|---|---|---|---|---|---|---|---|---|
| p44 | 9, 10, 12, 14, 16, **17** | 25.5 | 13.0 | 1.5/1.5 | 29.0 (9) · 37.3 (12) · 48.3 (16) · **51.0 (17)** | +6 | 4/floor (68 @17) | 13.75 |
| ii49 | 5, **9**, 12 | 27.0 | 12.0 | 1.5/1.5 | 17.8 (5) · **28.8 (9)** · 37.0 (12) | +6 | 4/floor (36 @9) | 14.5 |
| 1515 | 5, **9** | 26.5 | 12.0 | 1.5/1.5 | 17.5 (5) · **28.5 (9)** | +6 | 4/floor | 14.25 |
| p44t | 9, 12, 14, 16, **17** | 26.0 | 14.0 | 1.5/1.5 | 29.0 (9) · **51.0 (17)** | +6 | 4/floor | 14.0 |
| k7 | **5** | 21.5 | 10.5 | 1.0/1.0 | 17.3 | +6 | 3/floor (15) | 11.75 |
| ii32 | **5** | 21.5 | 11.0 | 1.5/1.5 | 17.3 | +6 | 4/floor (20) | 11.75 |

Examples: a 9-storey II-49 of 4 sections is 108 × 12 m (+2.5 m porches), 28.8 m tall; a 4-section
9-storey P-44 is 102 × 13 m; a 6-section K-7 is 129 × 10.5 m, 17.3 m tall; one P-44T tower section
is 26 × 14 m, 51 m tall.

Floor levels above grade: floor k is at 1.25 + 2.75·(k−1) m; half-landings (stair windows) are
1.5 m above each floor; the porch platform/tambour is at +0.5 m.

## Series looks

- **p44** — white tile, accent-colour tile bands under windows and on loggia fronts, accent tile
  stripes on the gables, vertical stack of open bulb-lit transit balconies either side of the
  stair column, lift machine room. Default tint blue `0x4f6b8f` (1979–83); brown `0x7a4b32`
  (from 1983), beige `0xb9a688` (from 1988).
- **ii49** — cream tiled panels with striped mosaic "carpets" in the accent colour (pale blue
  default), fallen-tile scars, old wooden frames, loggias glazed by owners in every possible way.
- **1515** — grey panels, ribbed balcony fronts, accent stripe on the end bays.
- **p44t** — cream panels with terracotta brick-relief columns and bay windows (эркеры), white
  PVC windows, transit balconies.
- **k7** — 5-storey frame-panel khrushchyovka: small white tile, protruding column-and-girder
  grid, no balconies, blind gables, no lift.
- **ii32** — 5-storey sand-lime brick, small slab balconies with steel railings, no lift.

Every section: plinth with basement vents, raised 1st floor, steel entrance door, intercom,
«Подъезд N · кв. a–b» plate, canopy with snow and icicles, staggered stair windows lit from
inside (bulbs + self-lit whitewash on most floors), apartment windows with unique window ids
(procedural lit rooms at night), loggias/balconies with varied glazing, laundry, skis and jars,
satellite dishes («ТВ-Плюс»), a rare AC unit, rust streaks, panel seams and darker re-sealed
joints, roof parapet with snow cornice and icicles, vent stacks, TV antennas, cables over the
parapet. Gables carry blue house-number plates near both corners (half are lit boxes at night)
and a big painted «12/2» near the top.

## Models

All sections: pivot = front-left corner of the entrance facade at grade (model voxel
(0, 3, F)); front (entrance) = local −Z; sections tile along +X with no gap. LODs [1,2,4],
`occludesSnow`. Name: `res_<series>_<floors>_<variant>[_ent|_loop]`, variants `a`, `b`, `c`
(different glazing, frames, junk, dishes, lit stair floors; identical structure).
`_ent` = explorable stairwell geometry (lift shaft, no self-lit walls). (`_loop` exists for the
optional, unused `loopStairs` experiment — ignore it.) Use the API rather than placing these directly — it adds the
porch, door, lamp, lights, signs, interactions and runtime.

| model | size (m) | pivot | notes |
|---|---|---|---|
| `res_<series>_<floors>_<v>` | see table | front-left corner at grade | section |
| `res_porch_a/b/c` | 3.5 × 4.0 × 2.5 | back-centre at grade (wall side) | steps, platform (+0.5 m), canopy (+2.75 m), snow, icicles; a: cantilever + sand box, b: on pipe posts + rails, c: corrugated re-roof + ramp |
| `res_door_entrance` | 1.0 × 2.0 × 0.5 | hinge corner, outer face | dynamic steel door leaf (tint = paint colour); front = −Z |
| `res_door_inner` | 1.0 × 2.0 × 0.25 | hinge corner | wooden tambour door with frosted pane |
| `res_lamp_entrance` | 0.25 cube | back centre | `lamp_warm`, follows its light |
| `res_lamp_ceiling` | 0.25 cube | top centre | `lamp_bulb`, indoor |
| `res_lift_cab` | 2.0 × 2.75 × 1.5 | corner (0,0,0) | dynamic, indoor; opening at −Z |
| `res_lift_leaf` | 0.5 × 2.0 × 0.25 | corner | lift landing door leaf |

## Runtime behaviour

- **Entrance doors.** Enterable: `E` opens (key-pill beep or exit-button click,
  `door_metal_open`); it swings out and auto-closes after ~4.5 s when nobody stands in the
  way, with `door_metal_slam` + `door_magnet_lock`. Others: «Заперто · домофон» →
  `intercom_beep`, then `intercom_call` rings for 7 s; nobody answers.
- **Stairwells** (enterable): tambour with a propped-open inner door, notice, mailboxes
  (readable flyer), stair flights with railings, two-tone paint following the stairs, tiled
  landings, 3–4 flat doors per landing (dermatin with brass nails, steel, "oak" vinyl) with
  numbers and bell buttons — «Позвонить» → `doorbell`; very rarely `footsteps_phantom` behind
  the door, then nothing. Painted floor numbers, electrical cabinets, garbage chute hatches
  (`garbage_chute`), radiators (random `radiator_knock` while inside), graffiti and scratched
  texts, roof-hatch notice on the top. Bulbs: tambour always works; ~38% dead, some `buzz`,
  some `dying`. Muffled `tv_muffled` / `voices_muffled` behind ~16% of doors (created lazily
  near the player once audio runs). Zone `stairwell_<n>`: reverb 'stairwell', indoor, no snow.
- Ceiling height in stairwells is 2.25 m (2-voxel slabs: whitewashed underside, tiled top).
- **Lift** (series p44, ii49, 1515, p44t): call button on every landing («Вызвать лифт»),
  working cab with wood-grain laminate, fluorescent light (buzzing), burnt buttons, 400 kg
  plate; floor buttons inside («Этаж N»). Sounds `elevator_call`, `elevator_doors`,
  `elevator_motor` (loop, follows the cab), `elevator_stop`. Zone `lift_<n>` reverb 'elevator'.
  Doors stay open while the player stands in the doorway.
- Optional, not used by the plan: `loopStairs: [i]` (floors ≥ 9) makes that stairwell repeat
  three floors forever; experimental, leave it off.

## Registry / tags

- `registry.entrances[]` — every entrance (see `b.entrances`).
- `registry.buildings[]` — `{ id, series, floors, sections, address, bounds, height, entrances, x, z, angle }`.
- `registry.stairwells[]` — `{ entrance, building, windows: [[x,y,z] per floor], enterable, loop }`:
  world centres of the half-landing windows (for "a light rising up the stair column").
- Tags: sections `'building'`, porches `'porch'`, entrance doors `'entrance'`, entrance lamps
  `'lamp'`, stair bulbs `'stair_lamp'`, lift parts `'lift_cab'`, `'lift_door'`. Lights:
  `'entrance_lamp'`, `'stair_light'`, `'lift_light'`.
- navPaths: one `{ kind: 'entrance' }` per entrance from the door 6 m outward.

## Sounds used

`door_metal_open`, `door_metal_slam`, `door_magnet_lock`, `intercom_beep`, `intercom_call`,
`doorbell`, `footsteps_phantom`, `elevator_call`, `elevator_doors`, `elevator_motor`,
`elevator_stop`, `garbage_chute`, `radiator_knock`, `tv_muffled`, `voices_muffled` (all
guarded: silently skipped if not registered).

## Notes for layout agents

- Paint the ground (paths at 0.25) before calling, or pass `y: 0.25`. The plinth is buried
  0.75 m, so 0.25 m of terrain variation along a building is fine.
- Keep the 2.5 m porch zone and ~1.5 m in front of it clear (no snow banks, trees or cars);
  use `entrances[i].outside` as the start of the path to the door. Benches go beside the porch.
- Put notices on the wall via `entrances[i].noticeSpot` (not on enterable doors — they move).
- Adjacent buildings at a corner: leave ≥ 1 m between bounds or butt them gable to gable.
- Stairwell lights are indoor; each enterable section adds ~10–28 lights (only the nearest 24
  are evaluated, so this is fine) — keep enterable sections to the few the plan asks for.
- Cost: a 9-storey section ≈ 19k quads (LOD1 ≈ 8k beyond 75 m, LOD2 ≈ 1.4k beyond 190 m);
  a 17-storey ≈ 36–42k. Every distinct (series, floors, variant, mode) is one model built at
  load (~0.1–0.5 s each) — reuse a few variants rather than many.
- Dev showcase: `?resdemo=1&only=base,residential&x=245&z=392` (test district around x 170–400,
  z 340–480; never active in the real game).
