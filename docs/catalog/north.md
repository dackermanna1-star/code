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
          rail top 1.25; catenary poles every 59.2 m (x = 38.8 + k·59.2, both sides, z 42.1 / 53.9);
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
| Heating main on П-supports | z 128.5, x 158–598 (+ from the boiler at x 289) | arches over the boiler gate (266), the way to the platform (300), the warehouse gate (390), the substation path (522), and over the boiler fence (289, 121.5); a leaking joint steams at (337, 128.5); chambers where it dives underground at x 158 and 598 |
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

- `sidewalk`: the south sidewalk of Заводская at z 145.0 from x 24.5 to 615.5 (a detour in front of the bus
  stop at z 143.8), a `crossing` over Берёзовая's mouth.
- `crossing`: from the sidewalk over the street to the ГСК gate (x 122.85), the boiler staff door (249.25, meets
  the public `entrance` stub), the warehouse gate (390, meets the public `path` stub at z 136), the substation
  (522), and the way to the level crossing (x 300 → over the tracks → z 40.2).
- `path`: the ГСК lanes (z 71.4 and 92.3) and the way in from the gate.
- `trodden`: the substation → railway-fence trail; three shortcuts in the park.
- `park`: every alley (`ALLEYS` A–K), the pond ring, both sides of the memorial plaza; the south alley G ends
  on the avenue's sidewalk nav line at (139.1, 513.2); the east alleys start at x 139.6 opposite
  blocks_west's crossing ends (139.5, 236) and (139.5, 412); a `crossing` (150.2, 325) → (139.6, 325) joins the
  E–W driveway's line.
- `platform` (ignored by life: walkers stand on terrain): along the platform deck.

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
