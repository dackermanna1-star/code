# north — catalog (district layout)

Package `src/content/north/` (order 38): the north strip of the map. It covers the park
«Берёзовая роща», ул. Заводская with its heating main, the industrial edge (garage cooperative,
boiler house № 3 and its chimney, warehouse base, substation and wasteland) and the railway with
the platform «Заводская». Every coordinate lives in `layout.js`. Other packages can import the same
constants from `api.js`:

```js
import { RAIL, ROAD, WALK, PARK, GATES, PLATFORM, CROSSING, POND, MEMORIAL, ALLEYS, alleyDist, crossingSignal } from '../north/api.js'
```

| file | contents |
|---|---|
| `index.js` | entry: the build order, acoustic zones, `registry.north`, `init` (steam), `update` (runtime) |
| `layout.js` | every coordinate (single source of truth) |
| `ground.js` | embankment and sleepers, street, sidewalk, verge, yards, the trodden way to the crossing, park lawn |
| `railway.js` | rails, catenary and its wires, the platform, ticket booth, level crossing, embankment fence |
| `industrial.js` | garage cooperative, boiler house yard, warehouse base, substation and wasteland, 110 kV line |
| `street.js` | heating main, street lamps, bus stop, plough banks, parked cars, crossings (nav) |
| `park.js` | pond, alleys, fence and gates, memorial, café, concert shell, playground, trees, lanterns, story props |
| `runtime.js` | the crossing signals and bell, the chained dog |
| `models.js`, `lib.js` | the package's own voxel models; small helpers (fine-voxel placement, polylines) |

## Map (metres; x east, z south)

```
z  0–40   open snow (wrap band). A trodden path leaves the crossing at x 300 and fades north into it.
z 40–56   RAILWAY: embankment (slopes 0.75, top 1.0 at z 41–55), tracks z 46 (west-bound) / 50 (east-bound),
          rail top 1.25; catenary poles every 59.2 m (x = 38.8 + k·59.2, both sides, z 42.1 / 53.9; the south
          pole that would stand on the platform moves to x 243.1);
          platform «Заводская» x 244.5–294.5 (z 51.9–55.9, deck 2.25) with stairs down at its east end;
          level crossing deck x 297–303 (centre 300) with signals; ticket booth (308.6, 53.2).
z 58.5    fence line: chain-link where no yard fence runs (gaps at the crossing path x 297–303 and x 512–516, 566–571.5)
z 58.5–124.5 INDUSTRIAL EDGE
   x  40–204  ГСК «Мотор-7» (ПО-2 fence, gate x 118–124.5 on the street side, guard booth, dog)
   x 214–292  boiler house № 3 yard (ПО-2), hall centred (268, 109.4), CHIMNEY (262, 95), 55 m
   x 292–332  open strip with the trodden way to the crossing (x ≈ 300)
   x 332–458  warehouse base «СКЛАД № 2» (ПО-2), gate x 386.75–393.25
   x 458–616  wasteland: ТП-2417 (522, 116.5), lonely lamp (529.5, 120.4), 110 kV pylons, weeds
z 124.5–133 north verge: heating main on П-supports at z 128.5 (x 158–598) with arches, plough bank
z 133–143   ул. Заводская carriageway (lanes 135.5 west-bound / 140.5 east-bound), x 16–624
z 143–146.5 south sidewalk (0.25), plough bank on its kerb edge, lamps at its back edge (z 146.05)
z 147–499.5 PARK x 24–139 (cast-iron fence on the north, east and south sides; open to the west/whiteout)
```

(The tables of landmarks, doors and story spots follow below.)

## Landmarks (x, z) — what a player should see

| landmark | where | notes |
|---|---|---|
| Boiler-house chimney | (262, 95), 55 m | THE landmark: red/white bands, blinking red aviation lights, a steam plume (public package); visible along ул. Заводская and over the blocks |
| Boiler house № 3 | hall (268, 109.4), front faces the street | lit cold industrial windows, roof vents steaming (north), «КОТЕЛЬНАЯ № 3» plate by the door (249.25, 117.4) |
| Heating main on П-supports | z 128.5, x 158–598 (+ from the boiler at x 289) | arches over the boiler gate (266) and the staff wicket (249.6), the way to the platform (300), the warehouse gate (390), the substation path (522), and over the boiler fence (289, 121.5); a leaking joint steams at (337, 128.5); chambers where it dives underground at x 158 and 598 |
| Platform «Заводская» | x 244.5–294.5, z 51.9–55.9 | high platform, one lit mercury lamp, a dead one, shelter with the timetable, name boards, bench; the chimney looms behind it |
| Level crossing | (300, 48) | rubber/timber deck over both tracks, red signals that flash and a bell that rings while a train approaches, «Берегись поезда!» |
| Pylons of the 110 kV line | (492, 112), (536, 93), (580, 74) | wires continue north-east into the whiteout |
| Park memorial | obelisk (125, 325), faces east | on the axis of the gate opposite 3-й Молодёжный проезд; plaza x 119.5–132.5, z 318.5–331.5 |
| Frozen pond | (80, 330), rx 26, rz 20 | sign «Выход на лёд запрещён!» on its east shore, ring path at 1.42× radius, six benches facing the ice |
| Concert shell (эстрада) | (72, 452), opens north | six buried benches in front |
| Summer café «Берёзка» | (100, 374), faces north | shuttered, chairs stacked under snow |
| Playground | (113, 470), entrance north | full set with its own lamp |
| Sledding hill | (53, 401), 2.4 m | packed slide toward the east, a sled at its foot |

## Gates, doors and ways in

| what | where | notes |
|---|---|---|
| Park main gate | (131, 147) on Заводская | alley A runs SW to the pond |
| Park north gate | (71, 147) | alley B through the birch grove, one leaf hanging nearly closed |
| Park east gates | (139, 236), (139, 325), (139, 412) | meet blocks_west's crossings over Берёзовая (z 236, 412) and the E–W driveway axis (z 325) |
| Park south gate | (133.5, 499.4) | path through the gap of the avenue's lawn fence to the avenue sidewalk at (139.1, 513.2) |
| ГСК gate | x 118–124.5, z 124.5 | west leaf closed, east leaf open; guard booth (128.2, 120.4) |
| Boiler yard gate | x 262–270, z 124.5 (both leaves open); wicket x 247.6–250.8 by the staff door | the boiler door is not enterable (public package) |
| Warehouse base gate | x 386.75–393.25, z 124.5 | lit gate lamp (385.3, 123.5), guard booth inside |
| Way to the crossing | x ≈ 300 from the sidewalk (stop «Платформа «Заводская»») to the embankment | stairs up to the platform at x 294.5–297 |
| Substation door | (522, 119.5) | trodden path from the street; a trail continues NE to a gap in the railway fence (566–571.5) |

No building in this district is enterable (the open garages are walk-in: two in ГСК rows 2 and 3).

## Story spots and small details (environmental storytelling)

| what | where |
|---|---|
| Chained guard dog (the stray's model) by its doghouse; turns to watch you, barks when you come within ~16 m and now and then | (129.75, 123.35), doghouse (131.2, 122.8) |
| «ОСТОРОЖНО! ЗЛАЯ СОБАКА» handwritten on the closed gate leaf; «ГСК «МОТОР-7»» plate | ГСК gate, z 124.6 |
| Two open garages with a bulb, a Lada and a radio (public package) | row 2 index 21 (≈ x 127, z 75), row 3 index 9 (≈ x 90, z 88.3) |
| Garbage containers with a thrown-out New Year tree | ГСК yard (107.5, 122.4) |
| A buried УАЗ, a buried «шестёрка», a brushed «семёрка» in the ГСК yard | (61.5, 114), (146, 104.5), (141.5, 94.9) |
| Cat in the boiler-house plinth vent with «Не закрывайте продухи» | (275.5, 117.4) |
| Yellow gas pipe on posts from a regulator cabinet («ГАЗ · ОГНЕОПАСНО») into the boiler annex | cabinet (240.5, 122.6) |
| Bicycle chained to the boiler fence since autumn; cigarette butts by the staff door | (252.6, 125.2), (251.6, 118.3) |
| Heating-main leak steaming over a thawed muddy patch | (337, 128.5) |
| Payphone with its receiver hanging on the cord, by the bus stop; a used ticket under the stop | (279.8, 146.1); stop (287, 145.65) |
| Platform timetable (readable), «Касса не работает» note on the boarded ticket booth, «ЦОЙ ЖИВ» in the shelter | (270.7, 55.6), (308.6, 53.2) |
| Crossing signals flash and the bell rings only while a train comes | (303.6, 54.5) south, (296.4, 41.6) north |
| Lonely buzzing mercury lamp over the transformer kiosk; a trodden trail through the weeds to a hole in the railway fence | (529.5, 120.4) |
| A buried «шестёрка» and a rusted container in the wasteland | (566.5, 104.5), (590, 95) |
| Lost glove on its own post by the park fence | (137.9, 415.6) |
| Frozen carrier bag on a pond bench | bench at ring angle 150° (≈ (44, 348)) |
| Snowman by the playground; sled at the foot of the sledding hill | (99.5, 460.5); (65.5, 406.2) |
| Steam from a manhole on the main alley (thawed ring round it) | alley A, ≈ (127, 173) |
| Bag snagged in a birch near the playground; crows on a grove birch, on the café birch, on the ground by the café bin, on the garage roof, on the boiler parapet, in the warehouse yard | |
| Summer café «Берёзка»: shutters down, «Кафе закрыто до 1 мая», an old «Дискотека 80-х» poster, «Лена + Саша» on the back wall | (100, 374) |
| Memorial: a wreath with a faded ribbon, two frozen carnations, a readable plaque | (125, 325) |
| Ski track (лыжня): two grooves winding through the western birch grove into the whiteout | x 28–56, z 158–494 |

## Lights (≈ 56 in the region; pools far apart, dark gaps between)

| group | count | notes |
|---|---|---|
| ул. Заводская | 17 poles at z 146.05: cobra sodium (x 34, 66.5, 104, 136.6, 207, 312, 417, 487, 552) and 6.25 m concrete poles with cold mercury (ДРЛ) heads (x 172, 242, 277, 347, 382, 451.5, 516.5, 587) | 207 cycles (failing sodium), 451.5 buzzes, 382 and 487 are dead |
| Park lanterns | 25 low cast-iron lanterns (`street` type `park`), 11 of them smashed | pools of warm light 30–60 m apart along the alleys, two at the memorial plaza (one dead), four round the pond (two dead) |
| Playground lamp | 1 | from `placePlayground` |
| Bus stop tube | 1 | pavilion light, the fascia is backlit |
| Platform | 2 mercury poles, one dead | (259.5, 55.4) lit, (279.5, 55.4) dead |
| Crossing signals | 4 red point lights | dark unless a train is within 280 m of x 300 (schedule follows `crossingSignal.active`) |
| Garage cooperative | guard booth (2), two open garages (2 each) | |
| Boiler house | ≈ 8 (public package: aviation lights, door bulb, floodlight, window spill) | |
| Warehouse base | dock flood, guard booth (2), the gate lamp | |
| Wasteland | the lonely buzzing mercury lamp | |

## Zones (acoustics)

| name | box | reverb / wind / traffic |
|---|---|---|
| `park` | x 14–139.5, z 147–499.5 | park / 0.78 / 0.55 |
| `park_grove` | x 14–94, z 151–300 (priority 1) | park / 0.6 / 0.45 |
| `park_shell` | the concert shell's stage (priority 1) | courtyard / 0.2 |
| `zavodskaya` | x 0–640, z 124.5–147 | outdoor / 1 / 0.55 |
| `industrial` | x 0–640, z 58.5–124.5 | outdoor / 1.05 / 0.45 |
| `garages` | the lanes between the ГСК rows | courtyard / 0.7 / 0.6 |
| `railway` | x 0–640, z 0–58.5 | outdoor / 1.15 / 0.3 |
| `platform_shelter` | under the shelter roof (priority 1) | outdoor / 0.5 |

(The public package adds `garage` zones inside the open garages.)

## Nav paths (life package)

- `sidewalk`: the south sidewalk of Заводская at z 145.0 from x 24.5 to 615.5 (it swings behind the bus-stop
  pavilion over a trodden pocket at z 147.5), a `crossing` over Берёзовая's mouth.
- `crossing`: from the sidewalk over the street to the ГСК gate (x 122.85), the boiler staff door (249.25, meets
  the public `entrance` stub), the warehouse gate (390, meets the public `path` stub at z 136), the substation
  (522), and the way to the level crossing (x 300 → over the tracks → z 40.2).
- `path`: the ГСК lanes (z 71.4 and 92.3) and the way in from the gate.
- `trodden`: the substation → railway-fence trail; three shortcuts in the park.
- `park`: every alley (`ALLEYS` A–K), the pond ring, both sides of the memorial plaza; the south alley G ends
  on the avenue's sidewalk nav line at (139.1, 513.2); the east alleys start at x 139.6 opposite
  blocks_west's crossing ends (139.5, 236) and (139.5, 412); a `crossing` (150.2, 325) → (139.6, 325) joins the
  E–W driveway's line.
- `platform` (ignored by life: walkers stand on terrain): along the platform deck at z 52.5 (in front of the
  shelter, which takes the back 2.75 m of the 4 m deck).

## Registry keys set

- `registry.railway = { y: 1.25, tracks: [46, 50], crossingX: 300, platform }` (read by vehicles' elektrichka).
- `registry.north = { lights, railway, street, park, industrial }` (geometry summary).
- `registry.streets` += `{ name: 'ул. Заводская', axis: 'x', x0, x1, z0, z1, lanes }`.
- `registry.landmarks` += memorial, pond, platform, crossing, garages (the public package adds the chimney).
- `registry.storySpots` += `guard_dog`, `lonely_lamp`, `lost_glove`, `closed_cafe`, `empty_stage` (plus `open_garage` from public).
- `registry.blocks` += `{ name: 'park', pkg: 'north', rect }`.
- `registry.steamVents` += the heating-main leak (marker with `auto: false`; this package makes its plume in `init`).
- Through the helpers: `streetLamps`, `benches`, `stops`, `playgrounds`, `heatPipes`, `garageRows`, `industrial`,
  `substations`, `ponds`, `trees`, `crows`, `story`, `notices`, `parkedCars`.

## Sounds

- Registers **`north_crossing_bell`** (if missing): an electromechanical crossing bell, 2.5 strikes/s, looped;
  played at the south signal while the signals flash (fades in/out, only within 260 m).
- Plays `dog_bark` (`dog: 1`) at the chained dog: a burst when the player comes within 16 m, then every 7–18 s
  while within 60 m, and now and then from afar (more often at night).
- Everything else comes from the helpers (boiler hum, transformer hum, radio in the open garage, TV in the guard
  booths, payphone, crows, ice cracks…). All calls are guarded by `audio.ready`.

## Models (all defined in `models.js` at import time)

Sizes W × H × D in metres (local X × Y × Z). "fine" = 12.5 cm voxels (non-solid, place with
`placeFine` from `lib.js`, which also corrects the culling box).

| model | size (m) | pivot / facing / notes |
|---|---|---|
| `north_rail` | 15 × 0.25 × 1.875, fine | one track's two rails (gauge 1.5), rusty web, polished head, clips at the 0.75 m sleepers; pivot = segment start on the track axis at sleeper-top level (rail top = pivot + 0.25); runs along +X; non-solid |
| `north_crossing_deck` | 6 × 0.25 × 7.75 | rubber/timber decking for both tracks with slots for the four rails; pivot = centre of its north edge (place at z 44.125, y 1.0) |
| `north_cat_pole` | 0.5 × 10.5 × 4.75 | square concrete catenary pole; cantilever, stay and registration arm reach 3.9 m toward local +Z (contact wire ≈ 6.2 m above the pivot) |
| `north_relay_box` | 1 × 2 × 0.75 | railway relay cabinet, front −Z |
| `north_crossing_signal` | 1.75 × 4 × 0.75 | striped post, black backboard with two lamp hoods (lamps are `north_signal_lamp` at local (±0.5, 2.25, −0.25)), bell dome; front −Z |
| `north_signal_lamp` | 0.25 cube | `lamp_red`, follows its light (flag) |
| `north_board_posts` | 3.5 × 3 × 0.25 | two posts and a blank board (3 × 0.75 at 1.75–2.5 m) for double-sided signs |
| `north_platform`, `_b`, `_west` | 10 × 3.5 × 4 (deck top 2.25) | high platform section; pivot = min corner (x0, 0, z0); track edge with a painted line at local z 0, railing at the back; `_west` has the end railing |
| `north_platform_stairs` | 2.75 × 3.5 × 4 | five 0.25 m steps down toward +X from 2.25 to 1.25 (2 m wide, handrails); pivot = min corner |
| `north_platform_shelter` | 7 × 3.25 × 2.75 | blue corrugated shelter with a bench; open side −Z; occludes snow |
| `north_ticket_booth` | 2.5 × 3.25 × 2.25 | boarded ticket window −Z, door +X; *tint* |
| `north_pylon` | 4 × 28 × 10 | 110 kV lattice pylon; crossarms along local Z; conductor points exported as `PYLON_ATTACH` ([lz, y]), earth-wire peak `PYLON_PEAK` |
| `north_fence_cast` | 2.5 × 0.75 × 0.25 | solid part of the cast-iron fence: granite plinth + iron band (0.5 m); along +X |
| `north_fence_cast_bars` | 2.5 × 1.875 × 0.125, fine | bars every 0.5 m with spear tips, rails, scrolls; place at the band top (+0.5 m) |
| `north_fence_pillar` | 0.75 × 2.5 × 0.75 | red-brick pillar with a concrete cap and snow |
| `north_gate_cast` | 1.5 × 2.125 × 0.125, fine | gate leaf, pivot = hinge, drawn closed along +X; non-solid |
| `north_memorial` | 3.5 × 7.5 × 3.5 | stepped granite base, pedestal, whitened obelisk with a red star on its front (−Z), two carnations |
| `north_wreath` | 1.25 × 1.25 × 0.5 | fir wreath with a red ribbon; front −Z; non-solid |
| `north_cafe` | 6 × 4 × 3.75 | summer café pavilion: roller shutter over the serving window (−Z), padlocked side door (+X), fascia band; *tint*; occludes snow |
| `north_cafe_stack` | 1 × 1.75 × 1 | stacked plastic chairs under snow |
| `north_bandstand` | 10 × 6 × 6 | concert shell: 1 m stage with side steps and a whitewashed quarter-dome opening toward −Z |
| `north_chamber` | 3.5 × 2 × 3 | heating-main chamber where the pipes (arriving along −X) bend into the ground; pivot = pipe end |
| `north_gate_leaf` | 3.25 × 2.25 × 0.25 | steel yard-gate leaf, pivot = hinge, along +X; *tint* |
| `north_gate_post` | 0.5 × 2.75 × 0.5 | concrete gate post |
| `north_doghouse` | 1.5 × 2 × 2 | doghouse with a chain and bowl; opening −Z |
| `north_container` | 6 × 2.75 × 2.5 | shipping container, doors +X; *tint* |
| `north_slabs` | 6.25 × 2 × 1.75 | three road slabs on timber spacers |
| `north_drum` | 2.25 × 2.5 × 1.25 | wooden cable drum on its rim |
| `north_gas_pipe` | 3 × 2.375 × 0.125, fine | yellow gas pipe at 2.1–2.25 m on a thin post (post at the segment start); along +X; non-solid |
| `north_gas_cabinet` | 1.25 × 2 × 0.75 | yellow gas regulator cabinet (ШРП) on a concrete foot; front −Z |

## Helpers (`lib.js`, `park.js`)

- `placeFine(ctx, name, opts)` — `world.place` for a fine-voxel model (fixes its culling box once).
- `fineModel(m, scale)` — declare a model in voxels of `0.25 · scale` m (use with `lods: [scale, 0.999]`).
- `alleyDist(x, z)` → metres from the nearest park alley edge (negative on it; 99 beyond 3 m) — for keeping
  objects off the paths. `ALLEYS` holds the alley polylines and widths.
- `nav`, `chaikin`, `alongPolyline`, `distToPolyline`, `resample`, `alongAngle`.

## Notes for the integrator

- **Railway geometry** matches the vehicles package exactly (tracks z 46/50, rail top 1.25, crossing x 300).
  The embankment, rails, catenary and wires run x 0–640 (and a little beyond) so the line continues through
  the wrap bands. Catenary poles are wrap-periodic (pitch 59.2 m = 592/10).
- **Seams.** ул. Берёзовая belongs to blocks_west; this package lowers the kerb at the three east gates and
  repaints the street's verge over Берёзовая's stub north of z 133. The south sidewalk (z 143–146.5) reaches
  2.5 m into the blocks' strip (z 144–146.5); at the driveway mouths (x 302–308, 456–462) it drops to road level.
  A neighbour's plough pile taller than 1 m is kept on the back metre of the sidewalk. The park's south path
  crosses the avenue's tree strip at x 137–139.75 to the gap in its lawn fence and ends on its nav line.
- **Not walkable on purpose:** the plough banks along both kerbs (gaps at every crossing listed above), the
  shovelled ridges along the park alleys (patchy, with gaps), the fences.
- The heating main is the public package's `placeHeatPipe` (6 m segments, П-arches with 6.25 m clearance).
