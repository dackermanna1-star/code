# Coach road trip — architecture & contracts

`bus.html` is a second experience in this repository: a first-person, hyperrealistic intercity
coach trip, **Coastline Express service 214** from **Cedar Bay Central** to **Port Solano Central**
via **Ridgefield** and the **Hollow Pass** (≈117 km, ≈2 h incl. a 10 min summit rest stop), leaving at
16:45 and arriving around sunset. The player is a passenger in an empty coach (like the flight sim)
and can walk the aisle, sit anywhere, use the seat, the toilet, the onboard screens and their phone,
step out at the rest stop, or take the wheel in the driver's seat (optional manual driving).

It **reuses the flight-sim engine**: `src/core/*` (App, render pipeline with auto-exposure/bloom,
input, interactions, colliders, assets, settings), and the world modules `src/world/environment`
(sky/atmosphere/sun/terrain/water), `src/world/clouds` and `src/world/city`. Read
`docs/ARCHITECTURE.md` first: frames, floating origin, pipeline (outside scene → outside passes →
cabin scene on top), shadows, events, update priorities and debug parameters all apply unchanged.

## 1. Geography & route (shared contracts — do not edit without coordination)

* `bus.html`'s import map remaps `./src/world/geo.js` → `./src/bus/world/geo.js`, so every reused
  module sees the **bus geography**: same API (`GEO.*`, `GEO_GLSL` with `geoHeight/geoWater/geoCoastX`,
  zones `DEP_TOWN`, `ARR_CITY`, `ARR_DOWNTOWN`, `ARR_PORT`, `DEP_LAKE`, `AIRPORT_FLAT` (≈0 size: no airports),
  `SEABED`) plus `GEO.naturalHeight`, `GEO.landHeight`, `GEO.valleyAt`, `GEO.roadInfluence`, `applyRoad`,
  `VALLEY`, `RANGE`, `BUS_ANCHORS`, `GEO_FEATURES = {enrouteLakes:false, airports:false, bus:true}`, and
  **`GEO_UNIFORMS`** (road-field textures the GLSL needs, see below).
* Anchors: `app.world.departureOrigin = (0,0,0)` (Cedar Bay; town at DEP_TOWN), `app.world.arrivalOrigin =
  (-60000, 0, 30000)` (Port Solano; city north of it, the gulf to the west). They never move in the bus app.
* Landscape along the route: Cedar Bay town → Highway 9 (divided 2+2) across farmland → exit 31 →
  Ridgefield village → the Hollow valley climbing into the **Hollow Range** (peaks ~2000 m, snow) → tunnel
  → **Hollow Pass** (~500 m, rest area) → down the Hollow River valley → river mouth at the **gulf** →
  **coast road** south on a cliff-top marine terrace (~85 m, sea on the RIGHT, sunset in the west) →
  **Port Solano** (coastal city) → Central station downtown.
* `src/bus/world/route.js` — `getRoute()` (also `app.route`): dense centreline (2 m), per-sample
  `x z y heading curvature grade bank natural mode seg`, `ROAD_TYPES` (lanes, lane width, shoulders,
  median, `halfW` formation half width, speed limit, kerbs/sidewalk/lighting/guardrail flags),
  `structures` (tunnels, bridges with s0/s1), `stops` (`STOP_DEFS` + `s`), `segments`, `landmarks`, and:
  `sample(s)`, `pointAt(s, lat)` (lat + = right of travel), `laneOffset(s, dir, k)`, `structureAt(s)`,
  `segmentAt(s)`, `nearestS(x,z)`, `index.nearest(x,z)` → `{d, s, lat, y, mode, halfW, seg}`.
  Right-hand traffic; our direction = increasing s; our lanes have lat > 0.
* **Road corridor in the terrain.** Terrain = `applyRoad(natural, roadField)`: within the formation the
  ground sits 0.3 m below the road surface, blending to natural terrain over `22 + 1.6·|Δh|` m (cuttings and
  embankments), except where `mode = 0` (tunnels, bridges). The CPU side reads the route index; the GLSL side
  samples two RGBA float textures in `GEO_UNIFORMS` (`uRoadCoarse/uRoadCoarseRect` whole route,
  `uRoadFine/uRoadFineRect` ≈4 km around the bus, `uRoadReady`): `r = road surface height`, `g = distance to
  the centreline (1e6 = none)`, `b = mode`, `a = halfW`; rects = `(xMin, zMin, 1/width, 1/depth)` world m.
  The **road** module renders these textures; the **world-integration** work makes the environment terrain
  merge `GEO_UNIFORMS` into its geo materials and re-bake when the fine field moves.

## 2. Coach geometry (`src/bus/core/constants.js`)

Bus-local frame: `+X` right (door side), `+Y` up, `-Z` forward. Origin = passenger-deck floor centreline at
mid-length. `COACH` (13.0 × 2.55 × 3.65 m three-axle high-decker; deck 1.32 m above the road; driver
platform at y −0.42; windscreen; axles; wheel radius; mirror arms), `DOORS` (front double plug door and mid
door, both on the right), `ZONES` (driver, vestibule, mid stairwell, toilet with sunken floor, rear wall),
`SEAT` / `ROWS` / `SEAT_LIST` (47 seats, 2+2 pitch 0.80, rows 7–9 left only, rear bench of 5),
`WINDOW_PANELS` (bonded side glass panels per side, door glass, toilet window), `OPERATOR` (Coastline
Express livery colours). The coach is rendered at the origin; the world moves (`app.worldRoot`).
`app.aircraftRoot` (alias `app.vehicleRoot`) holds OUR coach's exterior parts in bus-local space.

## 3. Trip state & API (`src/bus/trip/state.js`)

`app.trip.state` (also `app.flight.state` for the reused modules) — see the file for every field: route
position (`s`, `lat`, `segment`, `structure`, `inTunnel`, `nextStop`, `atStop`), pose (world position of the
bus origin, quaternion incl. suspension pitch/roll), vehicle (`speed`, `accel`, `latAccel`, `yawRate`,
`steer`, `steeringWheel`, `throttle`, `brake`, `retarder`, `gear`, `gearIndex`, `shifting`, `rpm`,
`engineLoad`, `turbo`, `airPressure`), chassis (`suspension`, `kneel`, `wheelRpm`, `surface`, `roughness`,
`vibration`, `roadRumble`, `bump`, `gForce`), `doors`, `lights`, `indicatorPhase`, `wipers`, `wiperAngle`,
`horn`, `cabin` (lights mode, seatbelt sign, stop request, toilet), `weather` (written by the weather
module), `timeOfDay` (sun), `clock`, `driverMode`, `playerAboard`.
Trip API: `{ state, phases, timeline(), phaseLabel(), getStatusText(), skipTo(phaseId), restart(),
jumpTo(phaseId, progress), setDriverMode('auto'|'manual'), command(name, value), setTimeWarp(k),
timeWarp }`. `command` names: `doorFront`, `doorMid`, `kneel`, `hazard`, `indicator` ('L'|'R'|null),
`lights` ('off'|'low'|'high'), `wipers` (0..3), `horn` (bool), `cabinLights` (mode), `requestStop`, `pa`.

## 4. Events (in addition to ARCHITECTURE §4)

| Event | Payload | Emitted by |
|---|---|---|
| `trip:phase` | {phase, prev} | trip |
| `trip:skip` / `trip:restart` | {to} | trip |
| `trip:stop` | {id, name, kind, state: 'approaching'\|'arrived'\|'departing'} | trip |
| `trip:doors` | {door: 'front'\|'mid', open} | trip |
| `trip:kneel` | {down} | trip |
| `trip:gear` | {gearIndex, up} | trip (automatic shifts) |
| `trip:airBrake` | {release: bool} | trip (parking brake set/release "psst") |
| `trip:indicator` | {side, on} | trip |
| `trip:horn` | {on} | trip |
| `trip:bump` | {intensity, kind: 'joint'\|'pothole'\|'kerb'\|'cattlegrid'\|'speedbump'} | trip |
| `trip:tunnel` | {inside, name} | trip |
| `trip:driverMode` | {mode} | trip |
| `trip:announce` | {id} | trip → audio plays it, then emits `cabin:announcement` / `cabin:announcementEnd` (same payloads as the flight sim) |
| `cabin:chime` | {type: 'gong'\|'stop'} | trip / cockpit |
| `weather:change` | {rain, fog, preset} | weather |
| `player:outside` | {outside} | player (walked out of / back into the coach) |
| `player:sit` / `player:stand` / `player:zone` / `view:mode` | as in the flight sim (zones: 'aisle', 'driver', 'vestibule', 'toilet', 'midStairs', 'rear', 'outside') | player |
| `info:phone` | {open} | info |

Announcement script: `src/bus/trip/announcements.js`; audio files `assets/audio/bus/announcements/<id>.ogg`.

## 5. Modules (init order = `src/bus/main.js`) and their APIs

| key | dir | provides |
|---|---|---|
| environment | `src/world/environment` (reused) | sky, sun, atmosphere, terrain, water, fog |
| road | `src/bus/road` | road surface chunks (asphalt, markings, kerbs, shoulders), junctions, tunnels (portals, lining, lights), bridges/viaducts, guardrails, signs, km posts, reflector posts, street lights, roadside trees/fences/poles, road-field textures, traffic signals. API `{ signals, signalAhead(s, dir), surfaceAt(s, lat), chunks }` |
| city | `src/world/city` (reused) | Cedar Bay town, Port Solano; must keep the road corridor clear |
| clouds | `src/world/clouds` (reused) | volumetric clouds; weather drives `setWeather` |
| weather | `src/bus/weather` | rain/fog/wetness script along the route, rain particles, wet road look, raindrops & streaks on glass, windscreen wiper clearing. API `{ registerGlass(mesh, {kind, wiper}), state, setPreset(name) }` |
| stations | `src/bus/stations` | Cedar Bay Central & Port Solano Central bus stations, Ridgefield shelter, Hollow Pass rest area (walkable: café, restrooms, viewpoint, parking). API `{ walkArea(stopId) → {colliders (world AABBs), ground(x,z), bounds} , createCoach }` |
| traffic | `src/bus/traffic` | AI vehicles both directions, car-following, overtaking on the highway, signals, parked cars, lights at dusk. API `{ vehicles, leaderAhead(s, lat, dir) → {gap, speed} }` |
| exterior | `src/bus/exterior` | our coach's body & livery (shown in cinematic/outside views), wheels (spin/steer/suspension), mirror arms with live reflections, wipers, lights; factory `createCoach({livery})` for other coaches. API `{ setBodyVisible(bool), createCoach, mirrors }` |
| interior | `src/bus/interior` | cabin shell, side glazing (registered with weather), windscreen glass, curtains, parcel racks with PSUs (reading lights, air nozzles, call button), ceiling, floor, front & mid doors with stairs, toilet room, lighting modes, signs, emergency hammers, fold-down monitors' housings, colliders |
| seats | `src/bus/seats` | 47 passenger seats (recline, armrest, footrest, seatback tray & net, belts) + the **driver cockpit** (seat, steering wheel, dashboard, gauges & displays, switches, ticket machine). API `{ list, byId(id), driver, cockpit }` |
| trip | `src/bus/trip` | trip director (timeline, autopilot driving incl. speed planning, stops, signals, traffic following, lane changes, time of day, announcements, skips) + vehicle dynamics (gearbox, engine, brakes, air suspension, steering) + manual driving |
| player | `src/bus/player` | first-person passenger (walk, sit, stand, lean to the window, crouch), coach motion feel, outside walking at stops, driver's seat, cinematic cameras |
| info | `src/bus/info` | front LED destination/next-stop sign, ceiling monitors (route map, next stop, speed, time), the player's phone (map, music, camera/photo mode) |
| audio | `src/bus/audio` | diesel engine (rear), gearbox, turbo, retarder, air system, tyres per surface, wind, rain, wipers, indicator relay, horn, doors, foley, traffic pass-bys, tunnel acoustics, announcements |
| hud | `src/bus/ui` | start screen (ticket), pause/settings, trip progress with stops & skips, seat map, prompts, captions, help |

Update priorities as in the flight sim (trip 10, world sync 20, lights 25, environment/clouds/road/traffic/
weather/stations/exterior 30, interior/seats 40, player 50, interactions 60, info/audio 70, hud 80).

## 6. Debug URL parameters (bus.html)

Everything in ARCHITECTURE §9 plus: `phase=<trip phase>`, `progress=0..1` (within the phase, or of the whole
route when no phase is given), `s=<metres>` along the route, `seat=7A|driver`, `weather=clear|rain|overcast`,
`warp=1..8`. Screenshot harness: `node scripts/shot.mjs --page bus.html --out x.png --query "..."`.
