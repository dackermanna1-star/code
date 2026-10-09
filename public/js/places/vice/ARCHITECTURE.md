# Vice City: architecture and contracts

An open-world crime game (GTA-style) in a made-up Miami. This file is the
contract between the systems: read it before changing any of them, and
keep it up to date when an interface changes.

## Conventions

- **Units** are studs (1 stud = 0.33 m). **+x is east, +z is SOUTH (north is -z), +y up.**
- Sea level is y = 0; street level is `K.GROUND` = 3. Everything below 0 is under water: the sea plane fills it.
- **Gravity** is `K.G` = 80 studs/s² for everything that falls: people, cars, ragdolls, debris.
- **Heading** (people, vehicles, boxes) is three.js `rotation.y`. Forward is `(sin h, 0, cos h)`. The Kenney models and the crowd figures face +Z at heading 0.
  - The **camera** is the one exception: its yaw makes it look along `(-sin yaw, 0, -cos yaw)`, as in The Outbreak.
  - To turn a camera yaw into a heading, use `heading = yaw + π`.
- **Speeds**:
  - walk 7, run 14, sprint 21 studs/s
  - city car top speed 100–130, sports car 150–175 (about 0.73 mph per stud/s)
- **Shared state** lives in `V` (state.js), so systems find each other there (`V.vehicles`, `V.peds`, ...). Never import another system's internals.
- **Events** go on `V.events` (core/events.js): `on(name, fn)` and `emit(name, payload)`. They are listed below.
- **No per-frame allocation** in hot loops; use module-level temporaries. No runtime `new THREE.*Light` (it recompiles every shader); pre-allocate the lights you need.
- **DOM**: everything goes under one root (`.vc`) appended to `game.gui.root`. CSS class prefix `vc-`, injected once by id. The root gets `pointer-events: none` and each interactive element opts in.
- **Storage**: keys `vice.save.v1` and `vice.settings.v1`, always inside try/catch.
- **Tests**: every system adds its debug and test helpers to `window.__vc` (defined in session.js). Examples: `__vc.look(x, y, z, tx, ty, tz)` sets the free camera, `__vc.tp(x, z)`, `__vc.time(h)`, `__vc.play()`.
  - The test runner is Playwright with SwiftShader at 1280×720. It drives `game.tick(1/30)` directly.
  - Expect about 2–5 fps of rendering in SwiftShader. The real target is a MacBook (Apple GPU) at 60 fps.
- **Assets** (all CC0):
  - `assets/models.js`: Kenney cars, boats, ships, containers, palms and debris. `await loadModels()`, then `modelParts(name)` gives the body plus wheels with pivots, and `modelGeometry(name)` gives everything merged. Model space is +Y up, front toward +Z, in Kenney units: a sedan is 1.5 wide, 1.15 high and 2.55 long, so scale ×5.4 to studs.
  - `assets/texdata.js`: 26 Poly Haven photo textures (`TEX` = `[{key, col, nor, avg}]`), loaded as one texture array by `world/textures.js`.
- **Reused as-is from other places:**
  - `../outbreak/physics.js` (Phys, through core/phys.js)
  - `../outbreak/game/input.js` (Input)
  - `../outbreak/noise.js`
  - `../warzone/guns.js` (`buildGun`, `GUNS`)
  - `../warzone/fx.js` (`playShot`, `playMech`)
  - `../../engine/Sound.js` (`sounds`)
- **Copy and adapt rather than importing** anything that reads The Outbreak's `O`.

## Frame order (session.js)

```
input.frame()
[play] player.update(dt, input)   on foot or driving: sets its vehicle's controls
[play] weapons.update(dt, input)  the player's aiming, shooting and melee
[play] vehicles.update(dt)        physics for every vehicle (controls already set by the player/AI)
[play] traffic.update(dt)         AI drivers: spawn/despawn and set controls for next frame
[play] peds.update(dt)            pedestrian/cop/gang AI and movement
[play] police.update(dt)          wanted level, dispatch
[play] missions.update(dt)
[play] combat.update(dt)          bullets in flight, explosions
peds.lateUpdate(dt)               ragdolls and the crowd's pose upload (runs while paused, so the world still looks alive)
fx.update(dt)
cam.update(dt, input)             (or the debug free camera)
sky, water, terrain, roads, city  (everything that depends on where the camera is)
audio, radio, hud, menus, post
-> the engine renders (Post replaces world.render)
```

Session states: `loading → title → play ⇄ paused`, plus `wasted` and `busted` (both lead back to `play`) and `cutscene`.

- `V.session` methods: `start(continueSave)` (called from the title menu), `pause()`, `resume()`, `wasted()`, `busted()` (triggered by the events `player:wasted` and `player:busted`), `respawn(kind)`, `save()`, `after(secs, fn)`.
- `V.timeScale` is the slow motion while dying. Gameplay systems receive dt already scaled.
- `V.postFx` is the per-frame post-processing options (`wasted`, ...).
- `V.settings` holds the player's settings: `{mouse, invertY, volume, music, quality}`.
- Saving (`vice.save.v1`) asks each system for `save()` and gives it back through `load(data)`: weapons, missions. `V.stats` is saved as it is.
- Menus call `V.session.start(true|false)`; the title menu gets `showTitle(hasSave)`.

## World

- `world/layout.js`: the hand-written map (land polygons, canals, districts, street grids, crossings, the expressway, places, START).
- `world/plan.js` `makePlan()` returns P:
  - `P.nodes[i]` = `{id, x, y, z, edges[], light, deadEnd}` (`deadEnd`: only one edge)
  - `P.edges[i]` = `{id, a, b, cls, name, R, lanes, width, walk, pts:[{x, y, z, d}], len, bridge, elevated, deadEnd}` (`deadEnd`: one of its ends is a dead end)
  - `P.blocks[i]` = `{id, grid, x0, z0, x1, z1, district, edge:{n, s, e, w}}`
  - helpers: `landAt`, `isLand`, `canalAt`, `coast`, `districtAt`
  - `districtAt(x, z)` gives the district; well out on the water it gives `{id: 'bay' | 'ocean', name: 'Biscayne Bay' | 'Atlantic Ocean', water: true, peds}` (`P.waterDistricts`).
  - Grid streets that ran on past their last cross street into the water with no block beside them are trimmed back to that street (`P.trimmed`); a park's ring street is left out on a side where a grid street already runs (the sides next to it run on to meet it). The dead ends left are mostly beach-access streets.
  - `edgePoint(e, d)` gives the position and tangent along an edge.
  - Road classes (ROAD): `hwy`, `blvd`, `ave`, `street`, `drive`, with lanes per direction, lane width, median and sidewalk width.
  - **Lanes:** traffic drives on the RIGHT. Looking from a to b, right is `(-dz, dx)` normalised, i.e. `(-tz, tx)` for tangent `(tx, tz)`.
  - Lane k (0 = innermost) of the a→b direction has its centre at offset `median/2 + lane*(k + 0.5)` to the right of the centre line.
- `world/ground.js` `Ground`:
  - `heightAt(x, z)`, `normalAt`, `waterAt(x, z)` (0 or -Infinity), `kindAt`, `coastAt`
  - `h`, `N`, `CELL` = 8, `HALF` = 4096
  - `weights()` for the 9 `LAYERS`
- `core/phys.js` `VPhys`, which extends The Outbreak's Phys:
  - boxes (`add(x, y, z, hx, hy, hz, heading, mat, extra)`, `remove`, `move`, `query`)
  - `groundAt(x, y, z, r, step)` includes road decks
  - `deckAt(x, z, yMax)`
  - `moveBody(p, v, dt, {r, h, step, grounded, gravity})` for people
  - `ray(ox, oy, oz, dx, dy, dz, max, {skip})` hits boxes, the ground and decks
  - Box `extra` flags: `{vehicle}`, `building`, `glass`, `noStand`, `shootable`, `cover`, `prop`. `mat` is one of concrete, metal, glass, wood, cloth or foliage.
- `world/roads.js` `Roads(world, plan, ground, phys)`:
  - asphalt with lane markings, junctions, crosswalks, kerbs and sidewalks, bridge decks with railings and piers, and the expressway on pillars
  - collision for barriers and kerbs; traffic lights and street lights
  - `roads.lightState(node, edgeId)` returns 'green' | 'yellow' | 'red' for traffic coming in on that edge
- `world/surface.js` (shared helpers for static geometry):
  - `Geo`: a growable vertex buffer with `quad`, `fan` and `box`, and attributes position, normal, uv, lay (layer, roughness, glow), tint and info.
  - `Chunks`: Geo buffers filed by material and 512-stud chunk. `meshes(materials)` gives one Mesh per material per chunk.
  - `surfaceMaterial(tex, {glowUniform})`: texture-array layers with tint, normal maps, and glow at night.
- `world/textures.js`: `viceTextures(renderer)` returns `{col, nor, ready}` (uniform objects) and `TEX_LAYER[key]`. It is shared by everything that draws photo textures.
- `world/roads.js` also exposes, for the props, peds and traffic:
  - `junction[nodeId].arms`
  - `walkways`: sidewalk centre lines `{ax, az, bx, bz, y, w, edge, side}`
  - `crossings`: crosswalks `{ax, az, bx, bz, y, node, edge}`
  - `parking`: kerbside spots `{x, y, z, heading, edge}`
  - `medians`: boulevard median points for palms
  - `lamps`
  - The sidewalks are phys boxes with `{kerb: true, noBlock: true}`; vehicles must ride over them, not crash into them.
- `world/props.js` `Props(world, plan, ground, phys)` → `V.props`. It is made BEFORE the city, and `finish()` is called after the city.
  - It covers palms (instanced, swaying), street furniture, the beach, parks, the port's cranes and containers, the marina and its moored boats, the airport apron and planes, seawalls and the pier.
  - `palm(x, y, z, scale, lean)` and `bush(x, y, z, s)` let the city add greenery in its lots before `finish()` builds the instanced meshes.
  - `update(dt, camera)`.
  - Also: `tree(x, y, z, s)`, `claimed(x, z, r)` (space props need; the city avoids it), `free(x, z, r)`, `knock(box)` (vehicles knock over boxes with `prop && breakable`), `spots` ({benches, busStops, loungers, umbrellas} for people), `parks`, `marinas`, `pier`.
- `world/city.js` `City(world, plan, ground, phys)`: every building, prop, palm and landmark, merged per 256-stud cell. Sets `city.real = true` (this turns off the debug boxes). Static colliders go in phys.
  - `city.update(dt, camera)` handles LOD and night windows.
  - `city.spawnPoints`: `{parking:[{x, z, heading}], peds:[{x, z}], police:[...], ambulance:[...]}`
  - `city.places[id] = {x, z, door:{x, z, heading}, kind, name}`, where the door heading points out of the door. The ids are safehouse, hospital, hospital2, police, police2, gunshop, gunshop2, sprayshop (it has a `bay` too), marina, arena, helipad, port, airport, liberty, vicetower, atlantis, govcenter, ballpark, brickellkey, star and domino.
  - `city.docks`: private docks `{x, z, heading}` (for moored boats).
  - `city.roadAt(x, z)`: the plan edge under a point.
- `world/sky.js` `Sky(world)`:
  - `update(dt, hour, camPos)`
  - `state = {night 0..1, sunI, light, rain, fogFar}`
  - `sunDir` (Vector3)
  - `updateEnv(renderer, scene)` re-bakes the reflections (`scene.environment`): the sky into a 128² cube one face per frame, then the PMREM filter into the same reused target (7 frames, well under a millisecond each on a GPU). Every ~0.12 h at dawn and dusk, ~0.4 h otherwise; a jump in time or weather bakes at once.
- `world/water.js` `Water(world, ground)`:
  - `update(dt, sky)`
  - `waveAt(x, z, t)` gives the surface height for boats and swimming (≈ 0 ± 0.6)
- `world/terrain.js` `TerrainView(world, ground)`: `update(camera)`.
  - Past the edge of the map the mainland becomes the Everglades: sawgrass, sloughs of open water (`groundGLSL` carves them, so the water draws there) and tree islands (one instanced mesh, `glades`). `glade.slough(x, z)` / `glade.hammock(x, z)` are the JS twins of the shader's noise.
- `render/post.js` `Post(world)`:
  - replaces `world.render`
  - HDR target, bloom, ACES tone mapping and a grade
  - the bloom saturates softly (a big bright area glows without washing the picture out) and its widest levels count for less
  - `update(dt, {exposure, desat, vignette, tint, blur, wasted})`
  - `fadeIn(s)` / `fadeOut(s)`
  - `hit(amount, color)`
  - `info = {calls, tris}`
- `world/textures.js`: `viceTextures(renderer)` returns uniforms `{col, nor}` (one DataArrayTexture each, layer order = `TEX`) plus `ready`. `TEX_LAYER[key]` gives the layer index.

## People

- `peds/peds.js` `Peds(world)` → `V.peds`:
  - `ready()`
  - `spawn({x, z, heading, kind:'civ'|'cop'|'swat'|'gang'|'mission', outfit, weapon, hp, armor, team, ai})` → Ped
  - `remove(p)`, `list`, `near(x, z, r)`
  - `update(dt)` (AI and movement), `lateUpdate(dt)` (ragdolls and drawing)
  - `ray(origin, dir, max, skip)` → `{ped, part, d, point}` | null
  - Population: civilians spawn around the camera from district density on the sidewalks, and despawn when out of view and far.
- **Ped** (the player satisfies the same contract, so combat treats everyone alike):
  - `pos` (Vector3, feet), `heading`, `vel`, `kind`, `team` ('civ', 'cops', 'gang:<id>', 'player', 'friend')
  - `hp`, `maxHp`, `armor`, `dead`, `ragdoll` (bool), `vehicle` (Vehicle | null), `seat`, `weapon` (id | null), `isPlayer`
  - `hit(dmg, part, dir, attacker, info)`, where part is head | torso | armL | armR | legL | legR and info is `{bullet, melee, explosion, vehicle, fire}`
  - `knock(vel, from)`: ragdoll with this push (car hits, explosions, tackles)
  - `die(cause, attacker)`
  - `enterVehicle(veh, seat)`, `exitVehicle()`
- Also: `fromDriver(driver, veh)` and `knockDriver(driver, vel)` (traffic's stand-in drivers become people), `ragdollRig(model, o)` (the player's ragdoll), `drop('money'|'weapon', pos, o)` (pickups), `say(p, kind, secs)` (chat bubbles).
- **Brains** (police, missions): `spawn({ai: {update(ped, dt), onHit?, onNoise?, onCrime?, onDeath?, onGetUp?}})`. A brain drives its ped completely, using the helpers in `peds/ai.js`: `moveTo`, `faceTo`, `aimAt`, `shoot`, `fire`, `lineOfSight`, `setState`, `say`, plus `p.P.arms` for hand poses. The full contract is in the header of `peds/peds.js`.
- Events: `death` {ped, cause, attacker}, `pickup`, and `crime` (assault, murder, copMurder when witnessed).
- Ragdolls are The Outbreak's 10-point Verlet ragdoll, copied and adapted (`peds/ragdoll.js`), with getting up. Blood comes from `V.fx`. Costs about 2.4 ms a frame with 120 people.

## Vehicles

- `vehicles/vehicles.js` `Vehicles(world)` → `V.vehicles`:
  - `ready()`
  - `spawn(type, x, z, heading, {y, color, parked, locked})` → Vehicle
  - `remove(v)`, `list`, `near(x, z, r)`, `update(dt)`
  - `hitTest(origin, dir, max)` → `{veh, d, point, normal, part:'body'|'glass'|'tyre'|'tank'}` | null
  - `TYPES` gives the catalogue: sedan, sports, supercar, suv, taxi, police, ambulance, firetruck, truck, van, bus?, motorbike, scooter, speedboat, tug, police heli, news heli, small plane...
- **Vehicle**:
  - `id`, `type`, `def`, `kind` ('car' | 'bike' | 'boat' | 'heli' | 'plane')
  - `pos` (Vector3: the origin, centre of the wheelbase at the bottom of the tyres), `heading`, `quat` (full orientation)
  - `vel` (Vector3, world), `angVel`, `speed` (signed, forward), `size {w, h, l}`
  - `ctl = {throttle -1..1, brake 0..1, steer -1..1, handbrake, up -1..1, yaw -1..1, horn, siren}`, set every frame by whoever drives
  - `driver` (Ped | player | null), `passengers`, `seats`
  - `health` (1000 → 0: smoke, then fire, then explosion), `dead`, `burning`, `locked`, `lights`, `siren`
  - `damage(amount, point, dir, attacker)`, `explode(attacker)`
  - `seatWorld(i, outMatrix)`, `exitPoint(side)`
  - `group` (Object3D), `box` (the phys box that moves with it; `extra.vehicle`)
- Collisions:
  - vehicle vs static boxes and vehicle vs vehicle are both handled in vehicles.js (impulses plus damage)
  - vehicle vs people: `ped.knock(...)` with the car's velocity, plus a 'crime' event when the player is driving
- `vehicles/traffic.js` `Traffic` → `V.traffic`: AI drivers on the lane graph. They obey lights, follow the car in front, stop for people, flee and honk.
  - `traffic.route(fromX, fromZ, toX, toZ)` → [points] (A* on the road graph; also used for the GPS and police).
  - Each driver follows a path: its lane up to the junction mouth, a quadratic Bezier through the junction (legs at least a turning circle long; right turns end in the kerb lane, left turns in the inner lane), then the next road's lane. Left turns give way to oncoming traffic; unsignalled junctions are taken one car at a time; two cars blocking each other resolve by priority.
  - Unsticking: a car that throttles without moving backs out and tries again; one stuck behind a stalled car (or a person who won't move) pulls round it; cars stuck for long, or lost off the road, are removed out of sight. Edges with a building across the carriageway are never used (`_clear(e)`), nor are dead-end stubs.
  - Small streets (`R.parking`) park on one side only (the right of a→b), and that direction's lane sits nearer the centre line: our cars are 8 studs wide.
  - Density: up to 46 cars in a 210–580 stud ring; the expressway gets its own share of spawns (most of them when the camera is on it). `stats {ms, removed}`.
  - Idle vehicles (no throttle, < 3 studs/s) hold on slopes (physics.js).

## Combat

- `combat/data.js` `WEAPONS` (15 weapons, `weapon(id)` resolves aliases; `combat/models.js` has `gunModel`, `handModel`, `weaponIcon`): fists, knife, bat, pistol, smg, shotgun, rifle, sniper, rpg, grenade, molotov and more. Fields: `{slot, dmg, rpm, spread, mag, reserve, range, vel?, pellets?, auto, melee?, gun:<warzone model id>}`.
- `combat/combat.js` `Combat` → `V.combat`:
  - `fire(shooter, origin, dir, weaponId)`: hitscan with a visible tracer. It tests people (`V.peds.ray` plus the player), vehicles (`V.vehicles.hitTest`) and the world (`V.phys.ray`), then applies damage, blood, impacts and noise.
  - `melee(attacker, weaponId)` → the person or thing hit
  - `explode(pos, radius, dmg, attacker)`: people take damage and are knocked, vehicles take damage, then fx and noise
  - `fireAt`, `launch` (rockets, grenades, molotovs), `burn`, `trace`, `meleeTarget`: see the header of `combat/combat.js`
  - `update(dt)`
  - NPC shots deal ×0.45 damage to the player; the victim applies its own body-part multipliers.
- `combat/weapons.js` `Weapons` → `V.weapons`: the player's arsenal (one weapon per slot, with ammo), aiming (right mouse; over-the-shoulder, with a soft lock-on), firing, reloading, melee combos and the weapon wheel (Tab). Drive-by shooting from vehicles. Also `give`, `buy`, `buyAmmo`, `has`, `armPose` (the player's arm angles, read by player.js), `wheelOpen` (the session slows time while it's open).
- `combat/fx.js` `FX(world)` → `V.fx`:
  - `burst`, `impact(pos, normal, mat)`, `blood(pos, dir, o)`, `pool(x, z, y, size)`, `decal`, `muzzle(pos, dir)`, `tracer(a, b)`
  - `explosion(pos, size)`, `fire(pos, size, secs)` → handle, `smoke`, `sparks`, `skid(x, z, heading)`, `glass(pos)`, `splash(pos, size)`, `wake(pos, heading, speed)`
  - pre-allocated lights only

## Player and camera

- `player/player.js` `Player` → `V.player` (implements the Ped contract with `isPlayer = true`):
  - `pos`, `heading`, `vel`, `hp` 100 (+ `armor` 100), `money`, `vehicle`
  - `place(x, z, heading)`, `update(dt, input)`
  - on foot: walk, run, sprint, jump, swim, fall, cover-less shooting; F enters the nearest vehicle (carjacking pulls the driver out)
  - in a vehicle: WASD, Space handbrake, F exit, H horn/siren, Q/E radio, mouse look
  - drawn with the player's own ROBLOX avatar (`V.appearance` → engine `CharacterModel`); a ragdoll on death or when knocked
- `core/camera.js` `CameraRig(camera)` → `V.cam`:
  - modes `foot | aim | vehicle | cinematic`
  - orbit with the mouse (pointer lock), collision with walls, chase camera for vehicles (looks ahead, pulls back with speed)
  - on foot ~13.5 studs back and a little right (you fill about a quarter of the screen height); aiming 13 back over the right shoulder (the shoulder offset shrinks against a wall at your side)
  - pulls in out of palm crowns; people right in front of the lens dissolve (it sets their crowd figure's `fade`, restoring it next frame)
  - `shake(a)`, `cinematic(shots)`, `aimRay()` → {origin, dir}

## Police, missions, UI, audio

- `police/police.js` `Police` → `V.police` (one file):
  - `wanted` 0–5, `searching`, `search` {x, z, r}, `lastSeen`, `seen`, `blips`, `units`, `cops`; `set(n)`, `add(stars, pos)`, `clear()`, `bust(cop)`.
  - **Crimes:** it listens to 'crime'. A crime counts at once if a cop can see it; one only civilians saw is phoned in 3.5–6.5 s later. Each kind sets a minimum level (shots, assault, carjack, hit-and-run → 1; murder, explosion, assaulting a cop → 2; killing a cop → 3, rising to 4 and 5 with more cop kills), and heat piles up to push the level higher.
  - **Units:** cruisers (1–5 by level) with a crew of two spawn out of sight on the roads. They follow A* routes (`route()` with a U-turn penalty), brake for corners, go round cars, back out of jams and ram you from 2★. They stop and let the crew out when you're on foot or have stopped. Helicopters come at 3★ (two at 5★), circle you and spot from far; the spotter shoots from 4★. At night the first heli's searchlight follows you. Two patrol cars drive about at 0★; their crews see crimes and join the chase.
  - **Cops on foot** (brain in police.js): arrest you at 1–2★ (stand still near one and you're BUSTED, via 'player:busted'), shoot in bursts when hostile (2★+, or when you aim or shoot at them), search where you were last seen, and go back to their car when you drive off.
  - **Escape:** dispatch knows where you are for 12 s after a new star. After that, once no cop has seen you for 2.5 s, the stars flash and a search circle (130–360 studs) is drawn on the radar. Stay out of it and out of sight for 7–25 s to lose them, or drive into the Pay 'n' Spray ($100).
  - Dispatch lines go out as HUD subtitles (street and district names). Test hooks: `window.__vc.police` {P, set, crime, stats}.
- `missions/missions.js` `Missions` → `V.missions`: mission definitions and steps (go to, enter vehicle, kill, survive, chase, lose the cops, deliver). Mission markers and blips, cutscene dialogue, pass/fail, rewards. Progress is saved.
- `ui/hud.js` `Hud(root)` → `V.hud`:
  - `notify(text)`, `help(text)`, `subtitle(who, text, secs)`, `objective(text)`
  - `big(kind:'wasted'|'busted'|'passed'|'failed', title, sub)`, `money(delta)`, `zone(name)`
  - `blips` (Map id → {x, z, icon, color, route})
  - `waypoint`
  - the minimap (from the plan, with the GPS route), health and armour, wanted stars, weapon and ammo, and the radio station
- `ui/menus.js` `Menus(root)` → `V.menus`: title screen, pause menu (Map, Missions, Stats, Settings, Controls, Quit), full-screen map with waypoints, weapon wheel.
- `audio/audio.js` `Audio` → `V.audio`: positioned synth sounds (pan by camera yaw), per-vehicle engine loops (pooled), sirens, horns, tyres, crashes, guns (warzone `playShot`), explosions, screams, the city and ocean ambience.
- `audio/radio.js` `Radio` → `V.radio`: procedural music stations in vehicles. `next()` / `prev()` / `off()`; `station` gives the name.

## Events (V.events)

| Event | Payload |
|---|---|
| `crime` | `{kind:'shots'|'assault'|'murder'|'copMurder'|'carjack'|'theft'|'hitPed'|'explosion'|'trespass', pos, by, victim}` |
| `death` | `{ped, cause, attacker}` |
| `noise` | `{pos, r, kind:'shot'|'explosion'|'crash'|'scream'|'horn', src}` (peds flee, cops investigate) |
| `vehicle:enter` / `vehicle:exit` | `{who, veh}` |
| `vehicle:destroyed` | `{veh, attacker}` |
| `player:wasted` / `player:busted` | — |
| `mission:start` / `mission:pass` / `mission:fail` | `{id}` |

## Who built what

The lead designed the map, the plan, the ground, collision, the roads, the player, the camera, the session, the HUD, the menus, the audio and the radio. Six agents each built one part:

- **The look agent:** the sky, the water, the terrain and the post-processing.
- **The vehicle agent:** all 32 vehicles, their physics, damage and effects.
- **The city agent:** 3,904 buildings, every landmark, the neon, the windows and the murals.
- **The props agent:** 4,500 palms, the beach and lifeguard towers, the port, the marinas, the airport, the parks and the street furniture.
- **The people agent:** the crowds, their outfits, their AI, the ragdolls and getting up.
- **The combat agent:** 15 weapons, gunfights, melee combos, explosions, fire, blood and the weapon wheel.

Thank you, all six.
