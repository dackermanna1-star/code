# Architecture & module contracts

Browser-based, zero-build, first-person Boeing 737-800 passenger experience built on
**Three.js r187** (vendored in `vendor/three`, imported as `three` and `three/addons/...`
through the import map in `index.html`). Plain ES modules, no bundler, no npm runtime deps.

Run: `node scripts/serve.mjs` → http://localhost:8080/
Test: `node scripts/shot.mjs --out x.png --query "phase=cruise&seat=16A&look=90,-5"` (headless Chromium,
SwiftShader WebGL2 – slow but correct; prints console errors + draw-call stats as JSON).

## 1. Frames & units

* Metres, seconds, radians. Compass headings in degrees (0 = north).
* **Aircraft-local frame** (cabin, seats, galley, exterior parts, player, camera):
  `+X` right/starboard, `+Y` up, `-Z` forward (nose). Origin = cabin floor centreline at the wing-root
  quarter-chord station. All geometry contracts are in `src/core/constants.js` (AIRCRAFT, DOORS, ZONES,
  ROWS, SEAT_LIST, WINDOWS, innerHalfWidthAt…).
* **World frame** (airports, terrain, clouds, traffic): `+X` east, `-Z` north, `+Y` up, origin = departure
  airport reference point. Heading → yaw: `yaw = -heading·π/180` (`util.headingToYaw`).
* **Floating origin.** The aircraft (cabin) is always rendered at the origin. `app.worldRoot`
  (child of the outside scene) gets `matrix = inverse(aircraftPose)` each frame (core priority 20), so
  everything in the world moves around the aircraft. `app.skyRoot` gets only the inverse attitude
  rotation and follows the camera position. JS matrices are float64, so precision is fine; shaders that need
  absolute world positions over hundreds of km must receive *offset* uniforms (e.g. aircraft world position
  modulo a period) rather than raw world coordinates.
* Converting: `app.world.toLocal(worldPos)` / `app.world.toWorld(localPos)`;
  `app.sunDirectionLocal()`; `app.aircraftMatrix` / `app.aircraftMatrixInverse`.

## 2. Scenes, cameras and the render pipeline (`src/core/pipeline.js`)

| Scene | Contents | Camera |
|---|---|---|
| `app.scenes.outside` | `skyRoot` (sky dome, sun disc, stars), `worldRoot` (terrain, water, airports, city, traffic, clouds geometry), `aircraftRoot` (OUR wings, engines, gear, tail, fuselage skin) + `lights.sunOutside` + `lights.hemiOutside` | `app.outsideCamera` (near 0.25 m, far 450 km, reversed float depth) |
| `app.scenes.cabin` | `cabinRoot` (everything inside the pressure hull) + `lights.sunCabin` + `lights.hemiCabin` + cabin lights | `app.camera` (near 0.03, far 60) |

Frame: outside scene → *outside post passes* (`app.pipeline.addOutsidePass`, e.g. volumetric clouds; they
get colour + depth texture) → cabin scene on top (depth cleared; windows are transparent glass so the outside
shows through) → auto-exposure → bloom → ACES tone-map, vignette, grain → FXAA/MSAA → canvas.

* Both scenes render **linear HDR** (HalfFloat). Do not tone-map in materials. `renderer.outputColorSpace` is linear; the
  composite pass encodes sRGB. Colour textures must have `colorSpace = SRGBColorSpace`.
* Auto-exposure meters the screen (centre weighted) and adapts like an eye: looking at a bright window
  darkens the cabin, looking at the dark cabin opens up. Keep intensities physically plausible: outside
  daylight radiance is ~10–50× the cabin's lit surfaces. Sun ≈ 6–8, sky hemisphere ≈ 1–2 (outside);
  cabin ceiling wash + fixtures produce roughly 0.3–0.8 luminance on lit surfaces.
* `pipeline.renderCabin` = false in cinematic exterior views (`app.view.mode === 'cinematic'`).
* `pipeline.depthGLSL` defines `float linearizeDepth(float d, float near, float far)` that is correct for
  reversed/non-reversed depth. `pipeline.reversedDepth` tells you which.
* Shadows: `lights.sunCabin` has its shadow camera auto-fitted to `app.cabinBounds` (aircraft-local AABB); the
  fuselage shell/sidewalls with **window openings** must `castShadow = true` so sunlight enters through the
  windows as moving patches. `lights.sunOutside` covers ±`app.outsideShadowRadius` m around the aircraft
  (wing/engine self-shadowing, aircraft shadow on the apron). Shadow map type: PCF.
* `app.sun` (set by the environment module each frame, applied by core priority 25):
  `{ direction (WORLD, towards sun), color, intensity, skyColor, groundColor, ambientIntensity, cabinFill }`.
* `app.scenes.cabin.environment` = RoomEnvironment PMREM by default; the environment module sets
  `scenes.outside.environment` (sky PMREM) and may tint/replace the cabin one.

## 3. App services (`src/core/app.js`)

```
app.renderer, app.pipeline, app.scenes, app.camera, app.outsideCamera, app.view
app.worldRoot, app.skyRoot, app.aircraftRoot, app.cabinRoot
app.events      EventBus  on(name, fn) -> off, once, emit(name, payload)
app.settings    get(k), set(k, v), onChange(fn)      (src/core/settings.js DEFAULT_SETTINGS)
app.quality     current preset object (QUALITY_PRESETS); 'quality:changed' event
app.input       mode ('menu'|'play'|'ife'|'cinematic'), setMode(), isDown(code), axis(), consumeMouseDelta(), requestLock()
app.interactions add({object, instanceId?, label, onInteract, enabled?, maxDistance?, priority?}) -> {remove, setLabel}
                addOccluder(object); current; pick(camera, ndc?)
app.colliders   addBox(min, max, {tag}) -> id; addBoxCentered; setEnabled(id, on); remove(id); resolve(pos, r); blocked()
app.assets      texture(url, {srgb, repeat, ...}); pbr(folder, {repeat, maps}); canvasTexture(w, h, draw); json(url)
app.addUpdate(fn(dt, time), priority, name) -> unsubscribe
app.time, app.dt, app.frame, app.paused (simulation pause), app.started, app.ready, app.timeScale
app.world       { root, departureOrigin, arrivalOrigin, setArrivalOrigin(v), toLocal, toWorld, groundHeight(x, z) }
app.debug       parsed URL params (src/core/debug.js)
app.flight      the flight director API (state = FlightState, see src/flight/state.js)
app.<module>    API returned by each module's init()
window.__app    the app (for tests)
```

**Update priorities** (lower runs first): 0 input · 10 flight director · 20 core world sync · 25 core lights ·
30 environment / clouds / airport / exterior animation · 40 cabin / seats / galley · 50 player (camera) ·
60 interactions (run by the player after moving the camera) · 70 IFE / audio · 80 HUD · then render.

**Module init order** (`src/main.js`): environment, city, clouds, exterior, airport, cabin, seats, galley, flight,
player, ife, audio, hud. Each module file exports `async function init(app)` returning its API (stored as
`app.<name>`). Each init is isolated in try/catch. Use `app.events.on('app:ready', ...)` for anything that
needs modules that initialise after you. **Always access other modules defensively** (`app.audio?.play?.(...)`).

## 4. Events (namespaced)

| Event | Payload | Emitted by |
|---|---|---|
| `app:ready` | {} | main (all modules initialised) |
| `app:start` | {auto} | HUD "Board" button (audio unlock happens here) |
| `app:pause` | {paused} | HUD |
| `settings:changed` | {key, value} | core |
| `quality:changed` | preset | core |
| `input:keydown` / `input:keyup` | {code, key} | core |
| `input:mousedown` / `input:mouseup` / `input:wheel` | | core |
| `input:mode` | {mode, prev} | core |
| `input:lostlock` | {} | core (pointer lock lost while playing → HUD shows pause menu) |
| `interact:hover` | {label, key} or null | core |
| `interact:use` | {label} | core |
| `flight:phase` | {phase, prev} | director |
| `flight:restart` / `flight:skip` | {to} | director |
| `flight:doors` | {closed} | director (L1 door closes before pushback, opens at the arrival gate) |
| `flight:bridge` | {connected, airport} | director (jet bridge retract / attach) |
| `flight:pushback` | {state: 'start'|'end'} | director |
| `flight:engineStart` | {engine: 0|1} | director |
| `flight:thrust` | {level} | director (takeoff power, idle, reverse…) |
| `flight:liftoff` | {} | director |
| `flight:gear` | {down} | director |
| `flight:flaps` | {deg} | director |
| `flight:spoilers` | {deployed} | director |
| `flight:reverse` | {on} | director |
| `flight:touchdown` | {verticalSpeed, intensity 0..1} | director |
| `flight:turbulence` | {level} | director |
| `cabin:announce` | {id} | director → audio plays it |
| `cabin:announcement` | {id, speaker, text, duration} | audio (when playback starts; HUD shows captions) |
| `cabin:announcementEnd` | {id} | audio |
| `cabin:chime` | {type: 'pa'|'seatbelt'|'call'} | director / cabin |
| `cabin:seatbelt` | {on} | director |
| `cabin:lights` | {mode} | director |
| `world:arrivalMoved` | {origin} | core (director calls app.world.setArrivalOrigin) |
| `env:cloud` | {inside, density} | clouds |
| `player:sit` / `player:stand` | {seatId} | player |
| `player:zone` | {zone: 'aisle'|'lav'|'galley'|...} | player |
| `ife:focus` | {seatId, on} | IFE |
| `view:mode` | {mode: 'first-person'|'cinematic', shot} | player |

## 5. Flight state & journey

`src/flight/state.js` documents every field of `app.flight.state` (owned & mutated by the director; read-only for
everyone else, except `inCloud` which the clouds module writes). Phases:
`gate → pushback → taxi_out → lineup → takeoff → climb → cruise → descent → approach → landing → taxi_in → arrived`.

Director API: `state`, `phases`, `skipTo(phaseId)`, `restart()`, `beginDeparture()`, `beginDescent()`,
`timeline()` → `[{id, label, start, end}]` in missionProgress units, `phaseLabel()`.

Geography (terrain height, coastline, water mask, city/town zones) is defined once in `src/world/geo.js`, with
identical JS (`GEO.terrainHeight`, `GEO.waterMask`, …) and GLSL (`GEO_GLSL`: `geoHeight(vec2)`, `geoWater(vec2)`,
uniforms `uGeoDep`, `uGeoArr`) implementations. The terrain shader, city placement, airports and the director's AGL
all use it, so they agree exactly.

Airport layouts, gate stands, pushback / taxi / rollout paths and the approach are defined once in
`src/world/layout.js` (`DEPARTURE`, `ARRIVAL`, `buildPath`, `samplePath`). The airport generator builds pavement
covering those paths; the director drives along exactly the same paths.

The arrival region (airport, city, coastline/bay) is re-anchored by the director with
`app.world.setArrivalOrigin(v)` when the descent begins (so cruise can last as long as the player likes).
Modules owning arrival-region content listen to `world:arrivalMoved`.

Announcements: `src/flight/announcements.js` (ids, speaker, chime, text). Audio files:
`assets/audio/announcements/<id>.ogg`.

## 6. Module APIs (what each module must provide)

* **environment** (`src/world/environment/`): sky + sun + time of day, fog/aerial perspective, terrain (near &
  far, flattened under airports), ocean/bay + coastline + city in the arrival region, departure-region
  farmland/town; sets `app.sun.*`, `scenes.outside.environment`, `app.world.groundHeight`. API:
  `{ groundHeight(x,z), setTimeOverride(h|null), skyColorAt(dirWorld) }`.
* **city** (`src/world/city/`): everything man-made outside the airport fences — the departure town and farms,
  the arrival coastal city (downtown towers with lit windows at dusk, suburbs, port, marina, beach), road
  network with moving car lights, bridges, wind turbines / power lines. Uses `src/world/geo.js` for heights and
  land/water. API: `{ setNightFactor? }` (free).
* **clouds** (`src/world/clouds/`): volumetric/impostor cloud layers, cloud penetration during climb/descent,
  cirrus; registers an outside pass. API: `{ densityAt(worldPos) → 0..1, aircraftDensity, coverage, setWeather(name) }`.
  Writes `app.flight.state.inCloud` and emits `env:cloud`.
* **exterior** (`src/aircraft/exterior/`): OUR aircraft's exterior in `app.aircraftRoot` (wings with animated
  flaps/slats/spoilers/ailerons, CFM56 nacelles with spinning fans + reverser, winglets, gear + doors, nav/strobe/
  beacon/landing/logo lights, full fuselage + tail + livery shown only in cinematic view). API:
  `{ createAircraft({livery, seed}) → {group, update(dt, partialState)}, setFuselageVisible(bool), liveries }`.
* **airport** (`src/world/airport/`): both airports from layout.js (runway with painted markings, taxiways,
  apron, lights, signs, terminal with gates & glass, jet bridges, ground vehicles & crew, pushback tug, parked
  and moving AI aircraft, tower, hangars, approach lights & PAPI). API:
  `{ airports: {departure: {group, def}, arrival: {group, def}}, setBridge(airportId, connected) }`.
* **cabin** (`src/aircraft/cabin/`): pressure-hull interior: floor/carpet, sculpted sidewalls with window
  reveals, dual-pane windows + pull-down shades (interactive), ceiling panels, pivot overhead bins (interactive),
  PSUs per row (reading lights, gaspers, call button, signs), LED mood lighting following
  `state.cabin.lightsMode`, exit signs, emergency floor lighting, class divider/curtain, bulkheads, over-wing exit
  hatches, colliders for walls. API: `{ windows, bins, setReadingLight(seatId, on), lights: {mode, level} }`.
* **seats** (`src/aircraft/seats/`): all 154 seats (business 2-2, economy 3-3, instanced), interactive tray
  tables, armrests, recline, seatbelts, seat-pocket literature, under-seat life vest pouch; seat colliders. API:
  `{ list: SeatDescriptor[], byId(id) }` where a SeatDescriptor = SEAT_LIST entry + `{ position (Vector3 seat-pan top),
  eye (seated eye point), standPoint (aisle floor point), screenAnchor (Object3D: centre of the seatback screen,
  +Z facing the passenger), screenSize {w,h}, state {tray, recline, belt, armrests, occupied} }`.
* **galley** (`src/aircraft/galley/`): forward & aft galleys (carts, ovens, coffee makers, drawers), three
  lavatories (bi-fold door, lock + occupied sign, sink with water, mirror, toilet + flush, lighting), cabin
  doors L1/R1/L2/R2 (L1 open at the gate with the jet bridge outside), cockpit door (locked), crew jumpseats.
  API: `{ lavs, doors, setDoorOpen(id, open) }`.
* **flight** (`src/flight/director.js`): see §5.
* **player** (`src/player/`): first-person walking (WASD/arrows, mouse look, collisions), sit/stand in any seat,
  look-out-the-window lean, camera response to vibration/turbulence/accelerations, cinematic camera mode
  (exterior shots). Calls `app.interactions.update(camera)`. API:
  `{ sit(seatId), stand(), seat, position, setPose(pos, yaw, pitch), setView(mode), focusOn(object3D, opts)/releaseFocus() }`.
* **ife** (`src/ife/`): seatback screens on every `screenAnchor`, touchscreen UI (canvas texture + UV picking),
  movies/TV (bundled open movies), music, live moving map, flight info, settings. API:
  `{ open(seatId), close(), setPower(seatId, on) }`.
* **audio** (`src/audio/`): Web Audio graph (procedural engines/APU/airflow/rumble/gear/flaps/tyres + sampled or
  synthesized foley), announcements with chimes. API: `{ unlock(), play(name, {position, volume, rate}),
  context, ifeBus, connectMedia(mediaElement) }`. Foley vocabulary for `play()`:
  `bin_open, bin_close, tray_open, tray_close, belt_buckle, belt_unbuckle, switch_click, button_press,
  shade_up, shade_down, lav_door, lav_lock, toilet_flush, tap_water, drawer, cart, footstep, seat_sit,
  seat_stand, armrest, recline, gasper, oven_door, cabin_door, cockpit_knock, chime_pa, chime_seatbelt,
  chime_call, paper`.
* **hud** (`src/ui/`): start screen, pause & settings menus, flight progression bar + skip buttons
  (cruise / approach / restart / begin descent), interaction prompts, captions, seat map, help, FPS, toasts.
  API: `{ toast(text, ms) }`.

## 7. Assets

`assets/textures/<name>/{color,normal,roughness,ao}.jpg` (1K, CC0 from ambientCG / Poly Haven),
`assets/audio/...`, `assets/video/...`. Credits: each module writes `assets/credits/<module>.md`. Every asset must
be CC0 / CC-BY (attributed) / self-generated. Procedural generation is preferred where it looks as good.

## 8. Performance budget

Target 60 fps on a mid-range desktop GPU at `high`. Instance repeated geometry (seats, bins, windows, lights,
buildings, cars), merge static meshes (`BufferGeometryUtils.mergeGeometries`), share materials, avoid
per-frame allocations, keep the outside scene under ~600 draw calls and the cabin under ~400. Respect
`app.quality` (shadow sizes, cloud steps, terrain segments, `detail` 0–3).

## 9. Debug URL parameters

`autostart=1 quality=low|medium|high|ultra phase=<id> progress=0..1 seat=16A pos=x,y,z look=yawDeg,pitchDeg
cam=cinematic tod=18.5 weather=clear timescale=5 mute=1 shot=1 fps=1 colliders=1 paused=1 noui=1 module=<flag>`.
