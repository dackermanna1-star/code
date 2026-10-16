# vehicles — catalog

Package `src/content/vehicles/` (order 29). It defines every vehicle model at import time and runs
three traffic systems from `init()`/`update()`:

- **avenue traffic** on проспект Строителей;
- the **elektrichka** on the railway;
- a rare **courtyard crawler** on the driveways.

In the real game `build()` places only the hidden moving fleet. Two exceptions:

- **Test ground.** When the `avenue` or `north` package is *not loaded* (e.g. `?only=base,vehicles`), `build()` carves a plain stand-in carriageway and embankment, so traffic can be tested alone.
- **Showcase.** `?vehtest=1` adds a private showcase strip around (330, 318).

Layout packages place parked vehicles through **`src/content/vehicles/api.js`**:

```js
import { placeParkedCar, parkRow, placeParkedBus, carModelName, CAR_COLORS } from '../vehicles/api.js'
```

## Conventions (read first)

- **Facing / angle.**
  - Every vehicle's **front is its local −Z**; +X is its right side (doors of buses).
  - `angle` is the heading, the same convention as the player's yaw:
    - `0` → front faces **north** (−z)
    - `π/2` → west
    - `π` → south
    - `−π/2` → east
  - With `rot`: `rot:0` faces north, `rot:1` west, `rot:2` south, `rot:3` east.
- **Pivot.**
  - Bottom centre of the body footprint, at road level (wheels stand on y = pivot).
  - For trains: rail top.
- **Fine voxels.**
  - Vehicles are modelled at **0.125 m** voxels: LOD 0 within about 38 m.
  - The registered model (`def.model`) is the 0.25 m downsample. It is used for collision, contact shadow, culling and the mid LOD (38–120 m), then 0.5 m beyond that.
  - Engine request: a first-class `voxelScale` option.
- **Emissive lamps follow `placement.flag`.**
  - flag 0 = off (parked); flag 1 = lit (driving).
  - This covers head lamps, tail lamps, markers, saloon tubes and the far-LOD lit windows.
  - `placeParkedCar` sets flag 0. Moving rigs set it themselves.
- **Glass.**
  - Cars: opaque `glass_car`. The warm car uses `glass_frosted`.
  - Buses, trolleybuses and train cars: see-through `veh_glass_clear` onto a real interior (seats, handrails, ceiling tubes). Far LODs swap it for `veh_window_far` (lit pane, flag-gated).
- **Tint.**
  - Car bodies and the LiAZ body use the core `paint` (placement `tint`).
  - Trolleybus, plow and train colours are fixed liveries.
- **Snow.** Every exposed top carries voxel snow according to the variant. The renderer adds its own fresh-snow dusting on up-facing surfaces on top of that.

## Parked cars and vans

Six model variants per body type, named `veh_<type><suffix>`:

| suffix | snow state | use |
|---|---|---|
| *(none)* | clean, no snow | moving traffic, garages |
| `_s1` | light patchy dusting (12 cm) | recently driven |
| `_s2` | thick cap (25–37 cm) on roof, hood and trunk; windshield and rear glass snowed over | the typical courtyard car |
| `_s3` | half-buried: thick cap plus a drift filling the wheels and the left flank to the belt | parked for weeks. `placeParkedCar` adds a matching terrain drift on the car's left |
| `_br` | thick cap, windshield and rear half of the hood brushed clean, brushed snow piled at the edges | someone is about to leave |
| `_warm` | story car: **bare wet hood** (engine heat), **fogged windows**, cap on roof and trunk only | engine running; see `warm` below |

Body sizes (metres, body only; mirrors add about 0.12 m each side):

| type | model | L × W × H | notes |
|---|---|---|---|
| `vaz2107` | ВАЗ-2107 «семёрка» | 4.13 × 1.63 × 1.50 | chrome bumpers and the protruding chrome grille «jaw», rectangular lamps, chrome hubcaps |
| `vaz2106` | ВАЗ-2106 «шестёрка» | 4.13 × 1.63 × 1.50 | twin round lamps, chrome side molding, **roof rack**, more rust |
| `vaz21099` | ВАЗ-21099 | 4.25 × 1.63 × 1.38 | wedge nose, black plastic bumpers, wide black moldings, full-width dark tail panel |
| `vaz2110` | ВАЗ-2110 «десятка» | 4.25 × 1.63 × 1.38 | rounded body, body-coloured bumpers, oval lamps |
| `moskvich2141` | Москвич-2141 | 4.38 × 1.75 × 1.38 | long sloping hatchback, black bumpers, rust |
| `volga3110` | ГАЗ-3110 «Волга» | 4.88 × 1.75 × 1.50 | big chrome vertical-bar grille, long hood |
| `nexia` | foreign sedan (Daewoo Nexia-like) | 4.50 × 1.63 × 1.38 | rounded, body-coloured bumpers |
| `focus` | foreign hatchback (Ford Focus II-like) | 4.38 × 1.88 × 1.50 | tall vertical tail lamps up the D-pillars |
| `gazelle` | ГАЗель маршрутка (minibus) | 5.50 × 2.00 × 2.25 | side windows, sliding door on the right |
| `gazelle_van` | ГАЗель фургон (cargo van) | 5.50 × 2.00 × 2.25 | blind body |
| `uaz452` | УАЗ-452 «буханка» | 4.50 × 2.00 × 2.13 | rounded loaf body, split windshield, high ground clearance |

Model boxes, including the mirror margin and snow headroom: cars are 2.0–2.25 × 2.25 × L; GAZelle and UAZ are 2.25 × 3.0 × L.

### `placeParkedCar(ctx, o)` → record | null

Call it in **`build()`**. Plates are static signs, and the buried drift reshapes the terrain; both are frozen after finalize. Called later, the car is still placed, but without plates or drift.

```js
placeParkedCar(ctx, { x: 214.5, z: 431, angle: Math.PI / 2, type: 'vaz2107', snow: 'heavy', tint: CAR_COLORS.cherry, seed: 12 })
placeParkedCar(ctx, { x: 220, z: 431, angle: 0, warm: true })            // the story car: idling, fogged
placeParkedCar(ctx, 230, 431, Math.PI / 2, { snow: 'buried' })           // short form (x, z, angle, opts)
```

`o` fields:

- `x`, `z`, `angle`: see the facing convention above.
- `type`: random from the 2008 mix `PARK_MIX` if omitted.
- `snow`: `'none' | 'light' | 'heavy' | 'buried' | 'brushed'`. Random from `SNOW_MIX` if omitted.
- `tint`: hex. Random from the period palette for that model if omitted.
- `warm`: bool.
- `seed`: number. It decides type, colour, plate, snow and jitter, so the result is deterministic.
- `y`: defaults to the terrain height.
- `plate: false`: no plates.
- `drift: false`: no terrain drift.

Each car gets a generated plate «А 123 ВС 77» with the RUS flag strip, front and rear. Buried cars lose the front plate in the drift. GAZelle marshrutkas get yellow route plates.

The returned record is `{ placement, type, model, snow, warm, plate, info, x, y, z, angle }`. It is also pushed to `ctx.registry.parkedCars`. Placements are tagged `'car'`.

**`warm: true`** produces the story car:

- the `_warm` model;
- a faint exhaust plume from nature's `addSteam`, only if the nature package is loaded;
- a `car_idle` loop when the player is within about 40 m;
- an **interaction** on the hood («Капот» / "Hood"). Using it shows a quiet caption: «Капот тёплый, снег на нём растаял. Мотор работает, стёкла запотели изнутри.» ("The hood is warm, the snow on it has melted. The engine is running; the windows are fogged from inside.")

Use it once or twice in the whole city.

### `parkRow(ctx, o)` → records[]

A row of parked cars between (x0, z0) and (x1, z1).

- If the cars stand **across** the row (their facing is perpendicular to the row line), slots are 2.6 m wide. About 30% of them are parked nose-out (`flip`).
- Otherwise slots are 5.8 m long, for parallel parking along a kerb.

```js
// perpendicular parking along the north side of a driveway, cars facing north into the bay
parkRow(ctx, { x0: 160, z0: 312, x1: 290, z1: 312, angle: 0, density: 0.75, seed: 4 })
// parallel parking along a kerb (cars face west, the row runs along x)
parkRow(ctx, { x0: 300, z0: 520, x1: 340, z1: 520, angle: Math.PI / 2, density: 0.5, snow: 'light' })
```

`o` fields:

- `density`: default 0.7.
- `types`: `['vaz2107', ...]` or `[['vaz2107', 3], ...]`.
- `snow`: a fixed state, or a weighted list `[['heavy', 3], ...]`.
- `warmChance`: default 0.03, at most one warm car per row.
- `flip`: default 0.3.
- `slot`: metres.
- `seed`, `y`.

Jitter: ±0.18 m along the row, ±0.25 m depth, ±4°.

## Buses, trolleybuses, plow, train

Each model's front faces local −Z, and its pivot is the centre of the **body**.

| model | what | size L × W × H (m) | notes |
|---|---|---|---|
| `veh_liaz5256` | ЛиАЗ-5256 city bus | 11.4 × 2.5 × 3.0 | `paint` body (white or cream tint) with a blue stripe; 3 glazed doors on the right; lit saloon; LED route board (decal); rear engine grille. Head lamps are lit by flag |
| `veh_liaz5256_parked` | same, parked | | head lamps are plain lenses, so flag only lights the saloon, markers and tail lamps |
| `veh_liaz5256_snow` | same with a thin roof cap | | |
| `veh_ziu682` | ЗиУ-682 trolleybus, Mosgortrans 2002 livery | body 11.7 × 2.5 × 3.35; model box 14.25 long | blue lower body, white/blue stripes, white upper, ochre roof with the equipment casing. **Trolley poles up**: 6 m, rising from 3.45 m to the contact wire at **5.8 m above the road**, trailing 7.45 m behind the body centre, shoes at x = ±0.31 m. Retriever ropes, a rear ladder |
| `veh_ziu682_parked` | same, parked | | poles up, head lamps unlit |
| `veh_ziu682_down` | same with poles lowered onto the roof hooks | 12.25 long | for a depot or a trolleybus off the wires |
| `veh_kamaz_plow` | КамАЗ КДМ: combined road machine | 9.6 × 2.5 (blade 3.2) × 3.05 | orange cab-over; angled front blade with black hazard stripes; sand-salt hopper with a spinner; door lettering «ГУП «ДОРСЕРВИС» ВАО» (decal) |
| `veh_beacon` | two amber rotating beacons on a bar | 1.5 × 0.4 × 0.4 | dynamic, no collision. The plow rig puts it on the cab roof and flashes it at about 1.5 Hz through its flag |
| `veh_er2_head` | ЭР2-style elektrichka head car | 19.6 × 3.48 × 4.25 above **rail top** (pivot) | green body, cream stripe, grey curved roof, red front band; cab with two windows; big headlamp «прожектор» above; buffer lamps (white outboard, red inboard); bay seats; warm ceiling lamps; bogies on 1.52 m gauge |
| `veh_er2_tail` | the same cab, used as the last car (placed reversed) | | white lamps dark, red markers lit |
| `veh_er2_motor` | middle motor car | 6.0 m high with the **pantograph raised to 5.95 m** | |
| `veh_er2_trailer` | middle trailer car | | |

Car pitch is 20.1 m (`TRAIN_PITCH`).

### `placeParkedBus(ctx, o)` → record | null

A parked bus or trolleybus, for the bus terminal or a depot gate. Call it in **`build()`**.

```js
// avenue: the bus terminal layover lane
placeParkedBus(ctx, { x: 566, z: 598, angle: -Math.PI / 2, kind: 'bus', route: 0, placard: 'В ПАРК' })
placeParkedBus(ctx, { x: 548, z: 598, angle: -Math.PI / 2, kind: 'trolleybus', poles: 'up' })
```

`o` fields:

- `kind`: `'bus' | 'trolleybus'`.
- `lit`: default true. Saloon lights from dusk to dawn, through a `schedule:'night'` light that also drives the placement flag.
- `poles`: `'up' | 'down'`.
- `route`: an index or `{num, from, to}`.
- `placard`: e.g. «В ПАРК» ("To depot") or «ПОСАДКИ НЕТ» ("No boarding"). A card behind the windshield; 40% random if omitted.
- `idle`: default true for buses. A diesel `car_idle` loop near the player, and exhaust steam if nature is loaded.
- `seed`, `tint`, `snow`.

It adds static signs: yellow route plates, the lit route board, and the fleet number on the trolleybus side. The record goes to `ctx.registry.parkedBuses`. Moving buses avoid layover stands that a parked bus occupies.

Routes are fictional, from `ROUTES` in `plates.js`:

| kind | number | from | to |
|---|---|---|---|
| trolleybus | 41 | «Ст. м. «Заречная»» (Zarechnaya metro) | «Мкр. «Восточный»» (Vostochny microdistrict) |
| trolleybus | 63 | «Ул. Берёзовая» (Beryozovaya St.) | «Платформа «Заводская»» (Zavodskaya platform) |
| bus | 648 | «Ст. м. «Заречная»» | «9-й микрорайон» (9th microdistrict) |
| bus | 276 | | |
| bus | 613 | | |
| marshrutka | 512м | | |
| marshrutka | 139м | | |

## Moving traffic (runs by itself)

### Avenue

Right-hand traffic on проспект Строителей:

| direction | carriageway | lanes (z) | heading |
|---|---|---|---|
| westbound (−x) | north | 527.5 (curb), 531, 534.5 | `π/2` |
| eastbound (+x) | south | 552.5 (curb), 549, 545.5 | `−π/2` |

The road surface is at y = 0. Vehicles appear beyond x = −45 or x = 685 and vanish at the other end, inside the whiteout.

**Density** follows `atmos.minutes`. It is 0.06–0.35 vehicles per minute per direction after midnight, about 1.3 by day, and 2.4–2.6 at 17–19 h. That usually means 0–3 vehicles visible at once.

**Mix** (pool of 16 cars and vans, 3 LiAZ, 3 ZiU, 2 KAMAZ):

- buses and trolleybuses run 05:30–01:00 and keep to the curb lane;
- cars change lanes to pass stopped or slow vehicles;
- every vehicle follows the one ahead, and brakes and stops for a player standing on the carriageway in its lane.

**Stops.** Buses and trolleybuses stop at every `ctx.registry.stops` entry on their side, judged by the stop's `curb` z. They halt 2.2 m downstream of the pavilion centre, dwell 7–15 s, and about 15% of the time skip a stop.

- With no stops registered, the spawn stop (x 248, north side) is used.
- **At game start** a ZiU trolleybus stands at the spawn stop with its doors closing. It plays `trolleybus_depart` and pulls away westbound after 1.9 s.
- A westbound car approaches from 30–50 m east, and an eastbound one has just passed.

**Bus terminal.** If `ctx.registry.busTerminal = { loop: [[x,z],...], stops|stands: [[x,z],...], exit?: 'east'|'west' }` exists, about 65% of eastbound buses leave the curb lane at the loop's first point. They then:

1. follow the loop polyline (in driving order) at about 15 km/h;
2. lay over 25–55 s at the first free stand within 6 m of the loop;
3. rejoin the avenue after the loop's last point, eastbound by default or westbound with `exit:'west'`.

Only one bus uses the terminal at a time.

**Snowplows.** A KAMAZ snowplow passes every 3–7 min at night (22–06) and every 8–15 min by day. At night there is a 45% chance of a second machine staggered one lane over (уступом). The beacon flashes amber and washes the snow, and the plow plays `snowplow_pass` once as it approaches the player.

**Each moving vehicle carries:**

- a headlight **spot light**, updated every frame (cars: intensity 120, range 42, cone 30°), with fog scatter;
- a red tail-lamp spill on the slush behind;
- for buses and trolleybuses, a saloon light (domain `all`) that lights the interior and the frosted glass and spills onto the snow;
- glow sprites on the head and tail lamps (direction-aware: blazing head-on, a faint lens from the side);
- decals: plates, route boards (LED on buses), fleet number, the marshrutka's hand-lettered card, the plow's door lettering;
- an exhaust plume, if nature is loaded;
- a looping tyre/engine sound: `car_pass`, `bus_pass` or `trolleybus_pass` with `loop:true` (`*_drive`), rate set from speed. Plows use `bus_pass`.

Sound loops are created only within 170 m once `audio.ready`.

### Elektrichka

Double track along x on the north embankment:

| track | direction | heading |
|---|---|---|
| **z = 46.0** (north track) | westbound | `π/2` |
| **z = 50.0** (south track) | eastbound | `−π/2` |

**Rail top is at y = 1.25.** Override with `ctx.registry.railway = { y, tracks: [zWest, zEast] }` if the embankment differs. The track gauge is 1.52 m, centred on those z values. Contact wire: the pantograph reaches 5.95 m above the rail top, so catenary at about y = 7.2.

**Timing.**

- A train passes **every 6–12 minutes of play (wall-clock)**. Spec deviation: the spec said 6–12 *game* minutes, but the default clock runs at 0.5 game min/s, so that would mean a train every 12–24 real seconds.
- The first train comes 50–110 s after the start.
- There are no trains between 01:10 and 04:50 game time.
- Direction is random; 4, 6 or 8 cars; 67–81 km/h.

**Lights.** The head car has a strong headlamp spot (range 95 m) and a big glow. The tail car shows red markers. Lit windows: saloon lights (domain `all`) in the cars within 90 m, warm lit panes in far LODs.

**Sound.**

- `train_pass` plays once per pass, about 13 s before the train reaches the player's x. Its position follows the nearest point of the train.
- `train_horn` plays when the head comes within about 320 m, approaching.
- A second horn plays approaching the level crossing at x ≈ 300.

### Courtyard crawler

Every 3–7 minutes, if `ctx.registry.driveways` exists, a car may creep along a route at 9–13 km/h. Routes are an array of polylines, `[[x,z],...]` or `{points:[[x,z],...]}`, longer than 25 m. A route qualifies when it passes 12–110 m from the player and has an end at least 45 m away.

- It starts at the far end.
- At dusk and night its headlights sweep.
- It plays `car_idle` revved.
- It stops while the player stands in front of it.

At the end it parks: the lights go off, a door slams (`distant_door_slam`), and it becomes solid. It stays until the player is more than 85 m away. Its y follows the terrain.

## Registry keys

| key | content |
|---|---|
| `ctx.registry.traffic` | **every moving vehicle**, the same objects each frame: `{x, z, speed (m/s), type: 'car'\|'bus'\|'trolleybus'\|'plow'\|'train', model, dir (±1 along x), angle}`. Train entries add `length`; the courtyard car has `yard: true` |
| `ctx.registry.train` | `{active, x (centre), z, dir, speed, length, headX, tailX, railway}` |
| `ctx.registry.parkedCars` | records from `placeParkedCar` |
| `ctx.registry.parkedBuses` | records from `placeParkedBus` |
| `ctx.registry.vehicles` | `{avenue: {west: [...lanes], east: [...]}}` |

The package **reads**:

- `registry.stops` (street `placeBusStop`: `curb`, `kind`);
- `registry.busTerminal` (avenue);
- `registry.driveways` (blocks_east, blocks_west);
- `registry.railway` (north, optional).

Tags: parked cars `'car'`; parked buses `'bus'` / `'trolleybus'`; moving rigs `'traffic'`; train cars `'train'`. Lights: `'vehicle'` (moving), `'bus_interior'` (parked buses).

## Sounds called (all from the audio package)

| sound | use |
|---|---|
| `car_pass` (`loop:true` gives `car_drive`) | moving cars |
| `bus_pass` (loop) | buses and plows |
| `trolleybus_pass` (loop) | trolleybuses |
| `trolleybus_depart` | the opening trolleybus, and trolleybuses leaving a stop near the player |
| `snowplow_pass` | blade scrape as a plow approaches |
| `train_pass` | elektrichka pass-by |
| `train_horn` | approaching, and at the level crossing |
| `car_idle` | warm car; courtyard crawler; idling parked buses with `variant 1`, rate 0.82 |
| `distant_door_slam` | the courtyard car's driver getting out |

Everything is guarded by `audio.ready` and is optional.

## Other exports (`api.js`)

| export | what |
|---|---|
| `carModelName(type, snow, warm)` | model name, e.g. `carModelName('vaz2106', 'buried')` gives `'veh_vaz2106_s3'` |
| `CAR_INFO[type]` | `{L, W, H, head:[[x,y,z]...], tail, plateFront, plateRear, exhaust, hood}`, local metres |
| `BIG_INFO.liaz` / `ziu` / `kamaz` | lamp, plate, board, pole-tip and beacon anchors |
| `CAR_TYPES` | all body types |
| `CAR_COLORS` | named period paints, below |
| `CAR_PALETTE` | weighted 2008 mix |
| `TYPE_PALETTE[type]` | colours that suit each model |
| `PARK_MIX`, `SNOW_MIX` | weighted lists used for random parking |
| `AVENUE`, `SPAWN_STOP` | lane geometry; spawn stop |
| `RAILWAY`, `TRAIN`, `TRAIN_PITCH` | track z, rail y, crossing x; train dimensions |
| `makePlate(rng, 'civil'\|'route')`, `plateString(p)`, `drawPlate(ctx2d, W, H, plate, {dirt, seed})` | plates for your own signs, e.g. a plate leaning in a garage |
| `drawRouteBoard(ctx2d, W, H, {num, from, to, led})`, `ROUTES`, `ROUTE_EN` | route boards, e.g. for timetables |

`CAR_COLORS` names: `white`, `beige` («Сафари»), `cherry` («Вишня»), `eggplant` («Баклажан»), `darkGreen`, `murena` («Мурена»), `lightBlue`, `darkBlue`, `silver` («Снежная королева»), `quartz` («Кварц»), `wetAsphalt` («Мокрый асфальт»), `black`, `fadedRed`, `sandYellow`.

## Notes for the layout agents

- **Courtyards and driveways.**
  - Park along the driveways with `parkRow`: perpendicular bays off a driveway, or parallel along a kerb. Leave gaps at entrances and garbage areas.
  - Mix in `buried` and `brushed`, and put **one warm car** near the home entrance in Block D.
  - Cars stand on whatever terrain height is there. Driveway asphalt is y 0; a car on 0.5 m lawn snow sinks into it, which reads as "parked in the snow".
- **Buried cars.** Their terrain drift extends about 2.4 m to the car's **left**. Do not put a path or a door there.
- **Avenue (avenue package).**
  - Keep the lanes clear; traffic drives straight through anything at those z.
  - Register the stops with street `placeBusStop`. The spawn stop at x 248 is the important one: the opening trolleybus halts there.
  - Set `ctx.registry.busTerminal` in your build:
    - `loop`: the loop road's centreline in driving order (start near the eastbound curb lane, end where buses rejoin);
    - `stops`: the layover stands;
    - `exit`: `'east'` (default) or `'west'`.
  - Place the parked LiAZ and ZiU with `placeParkedBus`. Leave a median gap if you choose `exit:'west'`.
  - Trolleybus wires: contact pairs over z 527.5 and 552.5 at 5.8 m (street `placeTrolleyLine`) line up with the poles of `veh_ziu682`.
- **Railway (north package).**
  - Build the double track centred on **z = 46.0 and z = 50.0**, rail top **y = 1.25**, gauge 1.52 m, across the whole world (x 0–640 and through the wrap bands).
  - Catenary contact wire at about y 7.2, so the raised pantograph (5.95 m above rail) touches it.
  - If you change these, set `ctx.registry.railway = { y, tracks: [zWest, zEast] }` in build.
  - The horn also sounds approaching the level crossing at x ≈ 300.
- **Driveways (blocks_east and blocks_west).** Push centreline polylines to `ctx.registry.driveways` for the courtyard crawler. Use routes that end in a parking spot or a dead end, since that is where the car parks. Avoid polylines running through parked cars.
- **Performance.**
  - A parked car costs about 1–3 k triangles at LOD 0, less beyond 38 m. Every placement of the same variant is one instanced draw.
  - Big rows are fine; keep the number of `_warm` cars small (each has an exhaust emitter and an idle loop near the player).
- **Dev URL parameters.**
  - `?vehtest=1`: the showcase strip at (280–380, 300–336).
  - `?traintest=X,dir`: a train already at head x = X; dir ±1.
  - `?traffictest=x,side,kind,lane;...`: forced avenue vehicles. kind is `car|bus|trolleybus|plow`, side is `west|east`.

## Known limitations

- Moving vehicles do not collide with the player. They brake and stop for a player standing in their lane. A bus or trolleybus becomes solid while it stands at a stop, and the courtyard car once it has parked.
- Wheels do not turn.
- At 0.125 m voxels, snow on sloped glass still shows small terraces.
- Bus and trolleybus windows use the engine's shared glass shader, so they look frosted at the edges. In daylight they are whitish; at night they glow from the saloon light.
- A placement has one emissive `flag`. To get parked buses with unlit head lamps and a train tail with dark white lamps, those exist as separate model variants (`_parked`, `veh_er2_tail`).
