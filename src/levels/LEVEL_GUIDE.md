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

## Kit (`src/levels/kit.js`) — import what you need
- `room(L, {x0,z0,x1,z1,y,h, floor, ceil, wall, walls:{n,s,e,w}, light, reverb, trim})` walls: `false` to omit, or `{mat, thick, open:[{at, w, h, y0, door:true, hinge, opened, locked, safe, window:true, sill}]}`. north = z0 side, south = z1, west = x0, east = x1. Returns `{doors}`.
- `ceilingLight(L,x,y,z,{type:'bulb'|'fluoro'|'cage'|'none', intensity, range, flicker, on, color})`, `wallLamp(...)`.
- `stairFlight`, `railSegment`, `stairwell(L,x,z,w,d,y0,floors,fh,opts)` (switchback), `street(L,x0,z0,x1,z1,axis,{sidewalk, holes, noSidewalk})`, `floorWithHoles(L,x0,z0,x1,z1,y,thick,mat,holes)`, `facade(L,x0,z0,x1,z1,y0,y1,{mat, faces, lit, floorH, skipBelow, parapet})` (building block with window grid — use for backdrop buildings).
- `sign(L,text,x,y,z,ry,w,h,{bg,fg,glow,border,font,lightColor,lightIntensity})` — a textured quad. `ry=0` faces -Z (readable from the -Z side), `Math.PI` faces +Z, `Math.PI/2` faces -X, `-Math.PI/2` faces +X. Place it ~0.02 m in front of the wall.
- `graffiti(L,text,x,y,z,ry,w,h,color)` — spray paint (use `\n` for line breaks). Write ORIGINAL messages.
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
- Test with Playwright (see `tests/play.mjs` and `tests/scen_tour1.mjs`): the dev server for tests runs at http://localhost:5180/ (`npx vite --config vite.test.config.js`); load `?autostart=N` (N = chapter index), wait until `window.session.state === 'playing'`, then `window.game.player.teleport(x,y,z,yaw)`, `window.game.advance(seconds)` and screenshot. Set `window.game.director.enabled=false; window.game.cheats.botsIdle=true; window.game.cheats.god=true` for visual tours. Check: no console errors, nav node count > 0, `game.level.progressAt(x,y,z)` goes from ~0 at the start to ~1 at the end safe room (if it is -1 somewhere on the path, that spot is not connected by the nav grid!), bots can reach the end (`game.cheats.botsIdle=false`, teleport the player near the end and `advance()`), screenshots look good.
