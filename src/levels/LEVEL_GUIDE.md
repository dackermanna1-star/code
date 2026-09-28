# Level authoring guide (The Last Four: No Mercy)

Each chapter is one ES module in `src/levels/` exporting a default object:

```js
export default {
  id: 'subway',
  title: 'The Subway',
  def: { director: { ...directorConfig }, navCell: 0.5 },
  build(L, game) { /* geometry, lights, items, triggers, script */ },
  onStart(game, session) { /* optional: dialogue when the chapter begins */ },
  onLeaveSafe(game, session) { /* optional: called when survivors leave the start safe room */ },
};
```

Register it in `src/levels/campaign.js` (the lead developer does this). Reference implementation:
`src/levels/ch1_apartments.js` — read it fully before writing a chapter.

## Coordinates & units
- Metres. +Y is up. Each chapter has its own coordinate space (start anywhere).
- Survivors are 1.8 m tall, radius 0.36 m; they step up to 0.46 m; doors ~1.0-1.2 m wide, 2.15 m tall.
- Keep walkable corridors >= 1.6 m wide (infected & bots navigate a 0.5 m nav grid with 0.3 m clearance radius, 1.75 m head clearance).
- Stairs: `L.stairs(x0,z0,x1,z1,y0,y1,dir,mat,{thin:true})` — `dir` is the ascent direction ('+x','-x','+z','-z'); use `thin:true` whenever another flight/landing is stacked above or below (otherwise steps are solid down to y0).
- Avoid coplanar overlapping boxes (z-fighting): never build the same wall/floor twice. Floors that need holes: `floorWithHoles` (kit).
- Keep the playable space enclosed (facades / walls / invisible `L.clip(...)` boxes) — nothing should let players fall out of the world. Add `L.killZone(...)` far below the map.

## Level API (`src/world/level.js`)
- `L.box(x0,y0,z0,x1,y1,z1, mat, {collide=true, visible=true, tint, flags, surf, ao})` — AABB visual+collider. World-space UVs.
- `L.floor(x0,z0,x1,z1,y,mat,thick)`, `L.ceiling(...)`, `L.wallX(x0,x1,z,y0,y1,mat,thick,openings)`, `L.wallZ(z0,z1,x,y0,y1,mat,thick,openings)` — openings `{a,b,y0,y1}` (absolute coords).
- `L.clip(...)` invisible solid. Flags from `src/world/collision.js`: `F_SOLID|F_SHOOT|F_SIGHT` default; `F_SOLID` only = invisible player clip that bullets pass.
- `L.light(x,y,z,color,intensity,range,{flicker 0..1, buzz, on, priority})` → virtual light (a pool of 4-8 real lights is assigned each frame). Typical intensities: bulb 8-12, fluorescent 10-14, street light 25-35, fire 12-20. Returns an object whose `.on` / `.intensity` you can change at runtime (alarms, power on).
- `L.trigger(x0,y0,z0,x1,y1,z1, fn(survivor), {once=true, all=false, humanOnly})` — volume trigger.
- `L.after(seconds, fn)` — timer (game time).
- `L.item(type, x,y,z, {chance, group, count, yaw})` — item spawn. Types: any weapon id (`smg, pumpShotgun, chromeShotgun, silencedSmg, rifle, autoShotgun, huntingRifle, scar, m60, grenadeLauncher, magnum, pistol, fireaxe, crowbar, machete`), `ammo` (infinite pile), `medkit`, `pills`, `adrenaline`, `molotov`, `pipebomb`, `bile`, or random categories `tier1`, `tier2`, `melee`, `secondary`, `throwable`, `health`. Items with the same `group` string: exactly one of the group spawns.
- `L.decal(x,y,z,nx,ny,nz,size,frame,{noRoll, grow})` — static decals. Frames `DF` in `src/render/decals.js` (BLOOD1-4, POOL, DRIP, SCORCH, BILE, SMEAR, SPLAT_BIG, HAND, CRACK).
- `L.hazard(x0,y0,z0,x1,y1,z1,'fire',dps)`, `L.killZone(...)`, `L.reverb(box..., preset)` presets: `outdoor|room|hall|tunnel|sewer|stairwell|safe`; `L.ambience(box..., name)` names: `city|apartments|subway|sewer|hospital|rooftop|safe`.
- Spawns/markers: `L.survivorStart.push({x,y,z,yaw})` ×4 (inside the start safe room); `L.flowStart = [x,y,z]` (start) and `L.flowEnd = [x,y,z]` (inside the end safe room) — REQUIRED (they drive chapter progress, bot navigation and director spawning).
  `L.witchSpots.push({x,y,z})` candidate Witch positions (director may use some). `L.menuCam` optional.
- `L.env = Object.assign(L.env, {...})`: `fog` (hex), `fogDensity` (0.01-0.04), `hemiSky`, `hemiGround`, `hemiIntensity` (0.2-0.5), `envIntensity` (0.05-0.15), `moon: {dir:[x,y,z], intensity, color}` (outdoor maps only, else omit), `exposure` (0.9-1.3), `reverb`, `ambience`, `skyOpts: {hospitalAz 0..1 (Mercy Hospital landmark direction on the painted skyline), hospitalH, moonAz, fires, rotation}` or `skyOpts: {none: true}` for fully underground maps.
- `L.script = { start(){...}, update(dt){...} }` — per-chapter logic.
- `L.dynamics.push(obj)` any object with `update(dt)` is updated each frame.
- `L.addObject(object3D)` — add a custom (non-merged) mesh.
- `L.mesh(geometry, mat, matrix4, {collide:'bbox', tint})` — merged arbitrary geometry.

Materials (string names, `src/render/materials.js`): concrete, concreteDark, concreteFloor, plaster, plasterGreen, plasterBlue, plasterHosp, plasterDirty, wallpaper, wallpaperGreen, wallpaperRose, brick, brickDark, brickTan, tileWhite, tileSubway, tileGreen, tileChecker, tileFloor, woodFloor, woodFloorDark, wood, woodDark, woodPale, carpet, carpetBlue, carpetGray, asphalt, sidewalk, metal, metalDark, metalClean, rust, diamond, roof, ceiling, linoleum, linoleumBlue, sewer, dirt, fabric, fabricRed, fabricGreen, fabricBlue, marble, paintedRed, paintedYellow, paintedGreen, paintedWhite, paintedBlue, rubber, glass, glassDirty, emissiveWarm, emissiveCool, emissiveRed, emissiveGreen, emissiveWindow, plastic, plasticGloss, chrome, carPaint, blackMatte, paper, waterSurface, foliage.
`tint` multiplies the texture (hex colour) — use it for variety.
Surface notes: all level materials get world-space macro variation (no visible tiling on big walls), a shared micro-detail layer, and outdoor ground (`asphalt`, `sidewalk`, `roof`, `dirt`) gets world-space puddles automatically. Bricks are real size (~8 cm courses), `concreteDark` has formwork seams + tie holes (good for cast walls / stairwells / parapets), `concreteFloor` has oil stains, `tileSubway`/`tileGreen` are 7.5x15 cm subway tiles. Colour variants of plaster / painted metal / wood / fabric / carpet share one texture set (paint mask), so using several of them is cheap.

## Kit (`src/levels/kit.js`) — import what you need
- `room(L, {x0,z0,x1,z1,y,h, floor, ceil, wall, walls:{n,s,e,w}, light, reverb, trim})` walls: `false` to omit, or `{mat, thick, open:[{at, w, h, y0, door:true, hinge, opened, locked, safe, window:true, sill}]}`. north = z0 side, south = z1, west = x0, east = x1. Returns `{doors}`.
- `ceilingLight(L,x,y,z,{type:'bulb'|'fluoro'|'cage'|'none', intensity, range, flicker, on, color})`, `wallLamp(...)`.
- `stairFlight`, `railSegment`, `stairwell(L,x,z,w,d,y0,floors,fh,opts)` (switchback), `street(L,x0,z0,x1,z1,axis,{sidewalk, holes, noSidewalk})`, `floorWithHoles(L,x0,z0,x1,z1,y,thick,mat,holes)`, `facade(L,x0,z0,x1,z1,y0,y1,{mat, faces, lit, floorH, skipBelow, parapet})` (building block with window grid — use for backdrop buildings).
- `sign(L,text,x,y,z,ry,w,h,{bg,fg,glow,border,font,lightColor,lightIntensity})` — a textured quad. Signs are double-sided and read correctly from either side, so `ry` only has to align the quad with its wall (`0`/`Math.PI` for walls running along X, `±Math.PI/2` for walls along Z). A glow light (`glow` + optional `lightColor`/`lightIntensity`, or `light:false`) is placed automatically on the open side. Place the sign ~0.02 m off the wall.
- `graffiti(L,text,x,y,z,ry,w,h,color,{style})` — spray paint (use `\n` for line breaks). Write ORIGINAL messages. See **Wall art** below for styles, posters and survivor walls.
- `safeRoom(L,{x0,z0,x1,z1,y,h,doorWall,doorAt,end,hinge,wall,floor,ceil,graffiti:[...], extraOpen, noWalls})` — start safe room (`end:false`) sets `L.startSafe`; end safe room (`end:true`) sets `L.endSafe` + `L.endDoor`. The chapter ends when all living survivors are inside the end safe room with its door closed. Put 4 survivor starts inside the start safe room and supplies (weapons/medkits/ammo) inside safe rooms.
- `supplies(L,x,y,z,ry,[types],{w,d})` table with items.
- `fireSource(L,x,y,z,size,{hazard,intensity})`, `burningBarrel(L,x,y,z)`.
- `physProp(L,'propane'|'oxygen'|'gascan'|'bucket'|'box'|'chair'|'trashcan'|'cone'|'bottle',x,y,z)` — dynamic physics props (propane/oxygen explode, gascan ignites when shot).
- `alarmCar(L,x,y,z,ry,color)` car alarm → horde. `hittable(L,'car'|'dumpster',x,y,z,ry)` — objects the Tank can punch.
- `usable(L,x,y,z,prompt,fn(survivor),{hold seconds, holdLabel, once, radius, sound, enabled})` — "press/hold E" interaction (buttons, radios, levers). Returns `u` (toggle `u.enabled`).
- `buttonPanel(L,x,y,z,ry)` visual.
- `P.*` props (`src/levels/props.js`): table, chair, sofa, bed (hospital flag), dresser, bookshelf, tv, fridge, stove, counter, desk, officeChair, filingCabinet, lamp, cabinetWall, toilet, bathtub, sink, rug, picture, crate, pallet, barrel, dumpster, trashCan, trashBags, debris, papers, car ({burnt, police, taxi, color}), van, truck, streetLight, trafficLight, hydrant, mailbox, newsBox, bench, vending, planter, fenceChain, barricade, sandbags, acUnit, waterTower, antenna, pipe(L,x0,y0,z0,x1,y1,z1,r,mat), subwayCar(L,x,y,z,ry,{len,lit,doors,color}), turnstile, generator, electricPanel, pumpMachine, valveWheel, gurney, wheelchair, ivStand, medCabinet, receptionDesk, curtainRail, helipad, radioTable, corpse, bodyBag, and `P.prop(L,x,y,z,ry)` custom builder (`.box(cx,cy,cz,sx,sy,sz,mat,tint,rot)`, `.cyl(...)`, `.col(...)` collision).
  Prop signature is `(L, x, y, z, ry, ...)` with (x,y,z) the floor point under its centre.
- `new Door(L, x, y, z, 'x'|'z', {width, hinge:±1, open, locked, safe, material, onOpen, onClose})` (`src/world/dynamic.js`) for doors not made via `room()`. Infected break ordinary doors; safe doors are unbreakable.
- `new WindowPane(L, x0,y0,z0,x1,y1,z1, {dirty})` breakable glass.
- `new MovingPlatform(L, object3D, min[3], max[3], {to:[dx,dy,dz], duration, sound:'liftMotor'|'elevatorMotor', onArrive, onUpdate(k,dt), pauses:[{at,dur,onPause}]})` — elevator / scissor lift. `.start()`, `.moveTo([dx,dy,dz], dur)`, `.contains(pos)`, `.attachCollider(min,max)` (walls that ride along). The visual object is moved with the platform; survivors standing on it are carried; infected near survivors on a platform use physics-based chasing and can climb onto it.
- `Helicopter` (`src/levels/helicopter.js`) for flybys.

## Wall art (`src/levels/kit.js`, drawing in `src/render/wallart.js`)
All wall art is one flat quad per call (one draw call), readable from both sides like `sign()`; place it ~0.02 m off the wall with `ry` aligned to the wall (`0`/`Math.PI` for walls along X, `±Math.PI/2` for walls along Z). Textures are drawn on small canvases (<= 512 px), cached by content (same text/kind/seed/size = shared texture) and freed when the next level builds. Everything is deterministic (seeded from text / position), so co-op peers see the same art. Budget: a few dozen pieces per map is fine.

- `graffiti(L, text, x, y, z, ry, w, h, color, {style, seed, hand, color2, fill2, drips})` — spray paint. Without `style` one is picked from the text (arrows → scrawl/stencil, one short word → tag/throw-up, red multi-line → drippy, dark → marker, else spray scrawl). The quad extends 25% below `h` for drips; `(x,y,z)` is still the text centre.
  Styles: `'scrawl'` (spray-can handwriting), `'drip'` (heavy runs), `'marker'` (thick felt marker), `'chalk'`, `'tag'` (slanted signature + swoosh, `color2` = outline), `'throwup'` (bubble letters with outline + 3D shadow), `'piece'` (throw-up with gradient fill, backdrop and sparkles; `fill2`), `'stencil'` (sprayed stencil lettering with bridges).
  ```js
  graffiti(L, 'THEY HEAR\nEVERYTHING', 8.5, 1.6, 11.28, Math.PI, 1.8, 0.9, '#8a1a14');           // auto style
  graffiti(L, 'RUST', 30, 1.4, 20.02, 0, 2.2, 1.0, '#e05a1a', { style: 'throwup', color2: '#141414' });
  graffiti(L, 'KESS', 31, 2.2, 20.02, 0, 1.2, 0.5, '#e0a010', { style: 'tag' });
  ```
- `stencil(L, text, x, y, z, ry, w, h, color)` — shorthand for `graffiti(..., {style:'stencil'})`: `stencil(L, 'SAFE ROOM →', x, 1.5, z, 0, 1.6, 0.35, '#d8d8c8')`, `stencil(L, 'CEDA', ...)`.
- `wallMessages(L, x, y, z, ry, w, h, {seed, lines, density, bigSize})` — a survivor wall like the classic safe rooms: your `lines` written prominently plus filler in many hands, tools (marker, ballpoint, chalk, spray, brush) and colours — names (some crossed out), tallies, arrows, "CEDA LIES", dates, lists of the missing, replies to other messages. `density` 0 = only your lines, 1 = normal, 1.5 = packed. Keep panels about 1.2-1.8 m wide (text stays crisp); use several panels for a long wall.
  ```js
  wallMessages(L, 12.1, 1.75, 7, Math.PI / 2, 1.6, 1.2, { lines: ['CALL THEM\nON CH 9', 'WE WENT UP'] });
  ```
- `poster(L, kind, x, y, z, ry, w, h, {seed, title, brand, lines, wet, fade, torn, tape, staples, vandal})` — printed paper, alpha-cut torn edges, sun fading, water stains, creases, tape or staples, sometimes vandalised. Kinds: `'movie'`, `'concert'`, `'airline'` (FLY NEWBURG / SKYLINE AIR), `'evac'` (CEDA evacuation notice), `'health'` (public-health checklist), `'quarantine'` (military warning), `'missing'` (photo, tear-off tabs), `'ad'` (`brand: [name, slogan, bg, fg]`), `'flyer'` (`lines: [title, l1, l2, l3]`, tear-off tabs). Typical sizes: poster 0.6 x 0.9, flyer / missing 0.3 x 0.42, airline landscape 1.2 x 0.8. `torn`/`wet`/`fade` are 0..1.
  ```js
  poster(L, 'missing', 40.02, 1.5, 18, Math.PI / 2, 0.3, 0.42, { title: 'ELI MARSH' });
  poster(L, 'airline', 60, 1.8, 12.98, 0, 1.2, 0.8, { title: 'SKYLINE AIR', torn: 0.2 });
  poster(L, 'evac', 3.1, 1.6, 20, -Math.PI / 2, 0.5, 0.72);
  ```
- `posterWall(L, x, y, z, ry, w, h, {seed, kinds, count})` — a patch of wall plastered with overlapping posters, flyers and torn remnants of older ones (one texture). Great for underpasses, subway walls, construction hoardings and shop shutters: `posterWall(L, 20, 1.4, 9.98, 0, 2.4, 1.6)`; flyer board: `{ kinds: ['flyer', 'missing', 'evac'] }`.
- `sign(...)` renders printed / metal plates with rounded corners, inset borders, bolts + rust runs (dark metal signs), tape (cream paper notices), dirt and rain streaks; glowing text without `bg` becomes illuminated channel letters with a halo, plain text without `bg` becomes cast/painted lettering with a bevel. Cream/white paper-sized notices (light unsaturated `bg`, 0.25-2.2 m², not glowing) are automatically drawn as aged paper (torn edges, tape/staples, creases); force with `{paper: true}` / `{paper: false}`. The canvas follows the quad's aspect ratio (no stretched text). Pass `{clean: true}` to skip weathering, `{plain: true}` for flat text. `textTexture(text, o)` still returns the same (weathered) CanvasTexture for custom meshes.
- `safeRoom(..., {graffiti:[...]})` now writes the given lines into 3-5 handwritten survivor-wall panels (avoiding the door / `extraOpen` openings) and pins an official notice; `notice:false` skips the notice.

## Gameplay scripting (from `build()` / `L.script`)
- `game.session.objective('text')` — objective banner.
- `game.voice.script('scriptKey')` (keys in `src/audio/lines.js` SCRIPTS — you may ADD new keys to SCRIPTS for your chapter; keep existing keys unchanged) or `game.voice.script([{who:'bill'|'zoey'|'louis'|'francis'|'pilot'|'radio', text, d: secondsDelay}])` inline.
- `game.voice.say(survivor, category, priority)`; categories in `LINES`.
- Director (`game.director`): `panic(name, {waves, size:[a,b], interval, endless, nodes, where, minD, maxD, tanks:[waveIndex], onWave(i), onEnd})` → crescendo hordes; `stopPanic()`; `spawnMob(size, {where:'ahead'|'behind'|'any', nodes:[navNode...], minD, maxD})`; `spawnSpecial(kind, {node, where})` kinds `hunter|smoker|boomer|tank|witch`; `spawnWitchAt(x,y,z)`; flags `blockMobs`, `blockSpecials`, `blockWanderers`. Nav node near a point: `game.level.nav.nearestNode(x,y,z,radius)`.
- Audio: `game.audio.play(name,{pos, vol})`, `game.audio.loop(name,{pos, vol})` → `{stop(fade), set({pos,vol,rate})}`. Loops: `carAlarm, alarm, generator, elevatorMotor, liftMotor, helicopter, fireLoop, oxygenHiss, minigunSpin, hordeRumble`. One-shots: `elevatorDing, buttonPress, metalGate, radioStatic, radioBeep, glassBreak, woodBreak, metalImpact, doorBang, explosion, drip` … (full list in `src/audio/SPEC.md`). Music stingers `game.audio.music.stinger('objective'|'hordeIncoming'|'finaleStart'|...)`.
- Director config (`def.director`): `wanderers` (idle population, 15-30), `mobInterval:[min,max]` s, `mobSize:[a,b]`, `specials:[kinds]`, `maxSpecials`, `specialInterval`, `tank` (chance 0..1 of a random Tank), `tankAt` (progress 0..1), `witches` (expected count), `relax:[a,b]`, `outfit: 'civilian'|'subway'|'worker'|'hospital'|'police'` (infected clothing), `noSpawnBoxes: [[x0,y0,z0,x1,y1,z1]]`.

## Quality bar
- The map must feel like a real place along a continuous journey: rich prop dressing, readable landmarks, environmental storytelling (bodies, barricades, graffiti, blood trails, evacuation notices), strong light/dark contrast (pools of light in darkness), and signage that guides the player.
- Keep the critical path clear, readable and fully navigable by bots (test it!), with occasional side rooms containing supplies.
- Budget: ~600-1500 static boxes is fine; avoid thousands of tiny props. <= ~120 virtual lights per map.
- Surface textures are generated in Web Workers: a level starts with 32 px placeholders and full-resolution maps stream in a moment later. Screenshot tests should wait until `window.__texStats.pending === 0` (or `texturesReady()` from `src/render/textures.js`) before capturing.
- Test with Playwright (see `tests/play.mjs` and `tests/scen_tour1.mjs`): the dev server for tests runs at http://localhost:5180/ (`npx vite --config vite.test.config.js`); load `?autostart=N` (N = chapter index), wait until `window.session.state === 'playing'`, then `window.game.player.teleport(x,y,z,yaw)`, `window.game.advance(seconds)` and screenshot. Set `window.game.director.enabled=false; window.game.cheats.botsIdle=true; window.game.cheats.god=true` for visual tours. Check: no console errors, nav node count > 0, `game.level.progressAt(x,y,z)` goes from ~0 at the start to ~1 at the end safe room (if it is -1 somewhere on the path, that spot is not connected by the nav grid!), bots can reach the end (`game.cheats.botsIdle=false`, teleport the player near the end and `advance()`), screenshots look good.

## Engine notes (learned while building chapters 2-5)
- Infected move on the nav grid and never collide with dynamic colliders (moving platforms, gates, hittables). To hold a horde behind a moving gate, place a locked, unbreakable `Door` (or a nav blocker) across it until it is open far enough.
- Light `priority` multiplies a light's relevance score (1 + priority); it no longer overrides distance, so a handful of priority lights cannot take every slot of the small low-quality pool.
- Level builds are deterministic: Math.random is seeded during the build and every `makeRng()` generator is rewound before it, so co-op peers build identical worlds. Don't create objects conditionally on wall-clock time or anything outside the build.
- Code that needs the collision world after the build (raycasts) can push a callback onto `L.postBuild`.
- The nav grid adds two-cell "vault" drop links across thin wall tops (parapets, low walls under 0.47 m thick), so infected can climb onto them and drop down the far side.


## Props, clutter & effects (graphics upgrade)
All props below live in `src/levels/props.js` (`P.*` via `kit.js`), signature `(L, x, y, z, ry, ...)` with (x,y,z) the floor point under the prop's centre, front facing -Z. They are merged into the static batches (cost = vertices, not draw calls) and keep simple box colliders.
- Builder (`P.prop(L,x,y,z,ry)`): besides `.box/.cyl/.sph/.geo/.col` there are `.rbox(cx,cy,cz,sx,sy,sz,radius,mat,tint,rot)` (rounded box), `.cylX/.cylZ` (horizontal cylinders), `.frustum(cx,cy,cz,rTop,rBottom,h,...)`, `.cone`, `.torus(cx,cy,cz,R,r,...)`, `.tube(x0,y0,z0,x1,y1,z1,r,mat)` (cylinder between two local points), `.glow(cx,cy,cz,sx,sy,sz,tint)` (unlit light surface — the tint IS the light colour/brightness: use it for lamps, LEDs, screens, vehicle lights), `.light(lx,ly,lz,color,intensity,range,opts)`, `.beam(lx,ly,lz,dx,dy,dz,len,radius,color,lightRef)` and `.at(lx,ly,lz)` (world point).
- Material `emissiveTint` (vertex-coloured unlit HDR) and `chainLink` (alpha-tested wire mesh) are registered by props.js; tints on `emissiveWarm/Cool/Red/Green` have no effect (use `emissiveTint`).
- `P.lightCone(L, x,y,z, dir=[0,-1,0], len, radius, color, lightRef, strength)` — soft volumetric beam in fog (merged per level; medium/high only). Pass the `L.light(...)` return value as `lightRef` so the beam follows its on/flicker state. Street lights, flood lights and grow lights add their own beams. Scene SpotLights that are not attached to the camera (bot flashlights, helicopter searchlights) get beams automatically (`light.userData.noCone = true` to opt out).
- Vehicles: `car` (opts `{color, burnt, police, taxi, damaged, lights}`: extruded body, glass with interior, rims/tyres, lights, plates, mirrors; burnt cars sit on their rims), `policeCar`, `taxi`, `van`, `truck` (box truck), `bus(L,x,y,z,ry,{color,lit,burnt})` 12 m, `ambulance(...,{lights})`, `semi(...,{color, trailer=true, trailerLen=12, trailerColor})` (trailer roof walkable), `fuelTanker(...,{color, cabColor, pump=true, pumpOn})`, `baggageTug`, `baggageCart(...,{color, loaded})`, `luggageCart(...,loaded)`, `aircraftStairs(L,x,y,z,ry,h=3.5,{walkable})` (steps are colliders), `jetBridge(L,x,y,z,ry,len=12,{floorY})`, `transportPlane(L,x,y,z,ry,{color, rampDown=true, hollow=true, lights})` (C-130-ish, nose -Z, cargo floor y+1.1, walkable rear ramp), `airlinerSection(L,x,y,z,ry,{len, burnt, broken, wing, lit, ground, stripe})`.
- Street: `streetLight(...,{on, intensity, range, flicker})`, `trafficLight(...,{state:'red'|'amber'|'green'|'off'})`, `hydrant`, `mailbox`, `newsBox`, `bench`, `vending`, `planter`, `fenceChain(L,x0,z0,x1,z1,y,h)`, `barricade`, `sandbags`, `concreteBarrier(L,x,y,z,ry,len=3)`, `trafficCone` (no collider), `phoneBooth`, `parkingMeter`, `busStop(L,x,y,z,ry,len)` (open side + bench face -Z: rotate so -Z points at the road), `gasCan` (static), `propaneTank(L,x,y,z,ry,len=3)`.
- Interiors: `cubicle(L,x,y,z,ry,{w,d,h,fabric,chair})` (open side -Z, includes an office chair), `metalShelf(L,x,y,z,ry,w,h,fill)`, `cableTray(L,x0,y,z0,x1,z1,w)`, `duct(L,x0,y0,z0,x1,y1,z1,w,h)` plus the upgraded furniture set.
- Greenhouse / kitchen: `planterBox(L,x,y,z,ry,len,{dead})`, `growTable(L,x,y,z,ry,len)`, `growLight(L,x,y,z,ry,len,on)` (hang it: y = bar height), `steelTable(L,x,y,z,ry,len,d)`, `kitchenRange(L,x,y,z,ry,len)`, `fryer`, `exhaustHood(L,x,y,z,ry,len)` (y = hood bottom), `kitchenShelf(L,x,y,z,ry,w)`.
- Construction / utility: `scaffolding(L,x,y,z,ry,len=6,levels=2,{walkable=true, netting})` (2 m lifts, decks are colliders), `rebarBundle(L,x,y,z,ry,len,n)`, `cementMixer`, `portableToilet`, `siteTrailer(L,x,y,z,ry,len=7)` (steps + door on -Z), `formwork(L,x,y,z,ry,len,h)`, `transformer(L,x,y,z,ry,{w,d,h,color})`, `floodLight(L,x,y,z,ry,{h, on, tower=true, intensity, range, color, beamLen})`.
- Airport: `checkInDesk(L,x,y,z,ry,n)` (passenger side -Z, with belts + queue stanchions), `departureBoard(L,x,y,z,ry,w,h,{on, light, hanging})` ((x,y,z) = board centre), `suitcase(L,x,y,z,ry,color,upright)`, `luggagePile(L,x,y,z,n,r)`, `conveyor(L,x,y,z,ry,len,h,{bags})`, `carousel(L,x,y,z,ry,len,w)`, `seatingRow(L,x,y,z,ry,n,{color,double})`, `metalDetector(L,x,y,z,ry,on)` (walk along Z), `xrayScanner`, `runwayLight(L,x,y,z,color,{light})`.

### Clutter (`src/levels/clutter.js`)
Visual-only debris (no colliders → navigation untouched), merged into a few chunked meshes per chapter (2 materials, no shadow casting). Placement runs after the collision world + nav grid exist: items land on real floors (raycasts; never inside walls/furniture or on car roofs) and 3D pieces are kept off the survivor route so the guide arrows stay readable. Seeded (co-op safe); density scales with `QUALITY.clutter`.
- `scatterClutter(L, [x0,y0,z0,x1,y1,z1], {density=1, kinds, seed, alongWalls: true|0..1, avoid:[[x0,z0,x1,z1]], route=true, tol})` — y0 = floor height, y1 = probe height (keep it below table tops so clutter stays on the floor). Kinds: `papers, newspapers, trash, bottles, cans, leaves, rubble, glass, casings, bloodtrail, grime, water, oil, soot`.
- `autoClutter(L, {theme:'city'|'subway'|'sewer'|'hospital'|'office'|'rooftop'|'industrial', density, seed, yMin, yMax, box:[x0,z0,x1,z1], avoid, grime, connected})` — dresses the whole connected play space (skips safe rooms) with indoor/outdoor-appropriate clutter and wall-base grime.
- `edgeGrime(L, x0,z0,x1,z1, y, {strength, width, height})` — soft dirt where floor meets walls (doorways stay clean).
- `ceilingPipes(L, x0,z0,x1,z1, ceilingY, {n, r, mat, spacing})`, `cables(L, [x,y,z], [x,y,z], sag, r)` (sagging wires), `drips(L, [[x,y,z],...], rate, {findCeiling})` (ceiling water drips; with `findCeiling` pass floor points and the drip starts at the ceiling above). `autoClutter` adds drips on its own for the `sewer`/`subway` themes (`drips: n` to override).

### Effects (`game.fx`, `src/render/particles.js`)
Particles are lit by the light pool (smoke/dust/blood read correctly next to fires, lamps and flashlights), have colour-over-life and can bounce. Emitters: `fire(x,y,z,size)` (layered flames with animated turbulence, fire-lit smoke, embers — call every frame), `smokeColumn(x,y,z,size,color)`, `explosion(x,y,z,scale)` (flash, fireball, ground rings, bouncing debris/embers, lingering smoke column), `sparks(x,y,z,nx,ny,nz,n,color,speed)` (bouncing), `muzzle(...)` (shape per weapon class), `dust/chips` (impacts), `blood/bloodSpurt`, `splash`, `drip(x,y,z)`, `cloud`, `shockwave`. Ash and embers drift outdoors and dust motes float indoors automatically (`game.fx.ambient = {ash, embers, motes, wind:[x,z]}` to tune per chapter; set a field to 0 to disable).

### Post-processing & quality (`src/render/renderer.js`, `src/config.js`)
Chain: world pass → screen-space ambient occlusion from the world depth buffer (no extra scene render; half-res, depth-aware blur; bright/emissive pixels are never darkened) → viewmodel pass → bloom mips → grade pass (ACES tone map using `renderer.r.toneMappingExposure`, bloom + procedural lens dirt, edge-weighted chromatic aberration, lift/gamma/gain, split toning cool shadows / warm highlights, film grain, vignette and the damage/bile/incap effects) → FXAA. The grade uniforms are `game.renderer.fx` (`lift`, `gamma`, `gain`, `shadowTone`, `highTone`, `splitAmount`, `caBase`, `dirtAmount`, `grain`, `vignette`, `saturation`, `contrast`, plus the old effect uniforms). `QUALITY` fields: `ao`, `aoScale`, `aoStrength`, `cones` (volumetric beams), `clutter` (scatter density multiplier). Low quality: no AO, no bloom, no beams, 45% clutter.
- Sky (`src/render/sky.js`): painted base sky + drifting fire-lit cloud deck + skyline layers composited in a shader, with distant explosion flashes lighting the clouds. `skyOpts` also accept `cloudDrift` (default 0.0012), `flashes: false`, `brightness`.
