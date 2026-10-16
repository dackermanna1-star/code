# Liminal Moscow — Engine Guide (for content authors)

Browser game: Three.js r170 + Vite, plain ES modules (no TypeScript). Everything is generated
procedurally at load: voxel models, terrain, signs, and all audio (Web Audio synthesis — no
sample files). Run `npm run dev` and open the printed URL.

## Units & axes
- 1 voxel = `VOXEL` = 0.25 m. World units are meters.
- World is 640 × 640 m: **x → east, z → south, y → up**. North is `-z`.
- Play area is `[24, 616]` on both axes. Crossing it wraps the player to the other side
  inside a whiteout; the bands `[0,40]` and `[600,640]` must stay open (snow field / road).
- Rotation angle follows THREE: positive angle about +Y turns +X toward −Z.
  `rot` = quarter turns: `rot:0` model +X→east, +Z→south; `rot:1` model +X→north (−Z), +Z→east;
  `rot:2` model +X→west; `rot:3` model +X→south.
  A model whose "front" is its local −Z side faces: rot 0 → north, rot 1 → west, rot 2 → south, rot 3 → east.

## Content packages
Each folder `src/content/<pkg>/index.js` is auto-discovered and must default-export:
```js
export default {
  name: 'pkg',
  order: 50,              // build order; terrain base = 10, district layouts 20-40, systems 60+
  build(ctx) {},          // paint terrain, place models, add lights/zones/signs/interactions
  init(ctx) {},           // after meshes exist & audio objects exist (audio may not be started yet)
  update(dt, ctx) {},     // per frame (only while not paused)
}
```
Models and materials are defined at **module top level** (import time) so every package can
place every other package's models. Export helper functions from your package (e.g.
`src/content/street/api.js`) for others to import. A package that throws is skipped and logged;
do not let errors escape `update`.

`ctx` contains: `game, THREE, world, terrain, lights, zones, interactions, signs, footprints, wires, audio,
ui, scene, camera, player, atmos, events, navPaths, registry, M, defineMaterial, defineModel,
VoxelModel, VOXEL, RNG, rng(seed)`.

## Materials — `src/core/materials.js`
`M('name')` → id. `defineMaterial(name, {color, emit, emitColor, emitIntensity, gloss, paint, snow,
transparent, solid, surface, variation, lod})` at import time (≤255 total; reuse existing ones —
see the file for the full list: snow*, slush, ice, asphalt*, curb, concrete*, panel_*, tile_*,
brick_*, metal_*, wood*, bark*, branch, twig (non-solid), glass_clear (transparent), window
(procedurally lit apartment window), lamp_* (emissive), fluorescent, tv_screen, paint (instance
tint), linoleum, floor_tile*, wall_paint_*, whitewash, wall_tile_*, marble_*, granite, …).
- `window`: each window's voxels must share an **extra byte window id**: `const id = m.nextWindowId(); m.fill(x,y,z,w,h,1, M('window'), id)`.
  The shader decides lit/dark/TV/curtain colour per (instance seed, window id) and time of day.
- `glass_clear` is see-through (stairwells, shop fronts). Far LODs turn it into a dim lit pane.
- `paint` / `paint_matte` take the placement's `tint` colour (car bodies, painted fences, accent panels).
- Emissive `lamp_sodium` (EMIT_STREET) is on only when street lights are on and follows the linked light's level.
- Surfaces choose footstep sounds (`SURF.*`).

## Voxel models — `src/core/VoxelModel.js`, `src/core/models.js`
```js
import { defineModel } from '../../core/models.js'
import { VoxelModel } from '../../core/VoxelModel.js'
import { M } from '../../core/materials.js'

defineModel('bench_courtyard', () => {
  const m = new VoxelModel(8, 4, 3)            // sx, sy, sz in voxels
  m.fill(0, 1, 0, 8, 1, 2, M('wood'))          // position + SIZE (half-open)
  m.box(0, 0, 0, 0, 0, 1, M('metal_dark'))     // inclusive corners
  m.addSnow({ mat: M('snow'), depth: 1 })      // snow on all exposed tops
  return m
}, { maxDistance: 120 })
```
Builder API: `set/get/fill/box/hollow/walls/clear/replace/line/sphere/ellipsoid/cylinderX/Y/Z/
paste(src, ox,oy,oz, {rot, mirrorX, replace})/mirrorX/mirrorZ/nextWindowId/addInterior/setPivot/
addSnow/clone/downsample`. Pivot defaults to bottom-centre of the footprint; it is the point that
lands on the placement position. Keep models ≤ ~260 voxels on any axis (bigger buildings = several
section models placed side by side).

`defineModel` options: `lods` (e.g. `[1,2,4]`), `lodDistances`, `maxDistance` (cull), `collide`
(default true), `contact` (terrain contact shadow, default true), `indoor` (all faces lit as
indoor — underground spaces), `occludesSnow` (snowflakes stop at its roof: buildings, canopies,
pavilions, underpass/metro), `dynamic` (moving things), `cullBottom`.

`m.addInterior(x,y,z,w,h,d)` marks a volume as indoor: faces facing into it get indoor lighting
(no sky ambient, only `domain:'indoor'` lights). Use it for stairwells/shops inside an outdoor shell.

## World — `src/core/World.js`
- `world.place(name, {x, z, y?, rot | angle, seed, tint, flag, dynamic, collide, visible, tag, userData, yOffset})`
  → `Placement`. `y` defaults to terrain height at (x,z) (+`yOffset`). `seed` (0..1) varies
  windows; `tint` (hex) colours `paint` voxels.
- Dynamic placements: `p.set(x, y, z, angle)` every frame. The player rides on dynamic placements
  (elevator cabs, metro cars) automatically.
- `world.relocate(p, x, y, z, angle)` moves a static placement (anomalies).
- `p.visible = false` hides; `world.remove(p)`.
- Queries: `world.materialAt(x,y,z)`, `world.solidAt`, `world.boxHit(...)`, `world.raycast(o..., d..., max)`,
  `world.lineOfSight(a..., b...)`, `world.groundBelow(x, y, z)`, `world.roofAt(x, z)`, `world.byTag(tag)`.
- `p.voxelToWorld(vx, vy, vz)` / `p.toWorld(lx, ly, lz)` convert model coordinates to world.

## Terrain — `src/core/Terrain.js`
Heightfield of 0.25 m columns. Heights snap to voxels. All methods take meters.
- `terrain.setHeightRect(x0,z0,x1,z1, heightM, mat?)`, `raiseRect`, `paintRect(x0,z0,x1,z1, mat)`
- `terrain.paintLine(x0,z0,x1,z1, width, {mat, height, raise, only:Set<matId>})`, `paintCircle(cx,cz,r,opts)`
- `terrain.mound(cx, cz, rx, rz, heightM, mat, noise)` — snow piles/drifts
- `terrain.holeRect(...)` — remove terrain (stair pits down to underpass/metro)
- `terrain.apply(x0,z0,x1,z1, (x,z,hVox,mat) => ({h, mat}) | null)` — anything else
- `terrain.heightAt(x,z)`, `materialAt(x,z)`
Only a 1.5 m crust below the surface collides; underground interiors must keep their ceilings at
least 1.5 m below the surface above them (or punch holes).

## Lights — `src/core/Lights.js`
```js
lights.add({ x, y, z, color: 0xffa040, intensity: 55, range: 22, type: 'spot', dir: [0,-1,0],
  cone: 60, inner: 30, domain: 'outdoor' | 'indoor' | 'all', schedule: 'street' | 'always' | 'night' | fn,
  flicker: 'none' | 'buzz' | 'cycle' | 'dying', scatter: 1, halo: true, haloSize: 1, placement, tag })
```
The nearest ~24 lights are evaluated per pixel; every light also draws a fog halo sprite.
Calibration: a cobra-head sodium street lamp at 9 m: `intensity ≈ 55, range 24, cone 58, inner 28`;
entrance bulb at 2.6 m: `intensity 6–10, range 8`; stairwell bulb: `domain:'indoor', intensity 5, range 7`.
Pass `placement` so the lamp head's emissive voxels dim/flicker with the light.
Indoor spaces must use `domain:'indoor'` lights; outdoor lights never light indoor faces.

## Zones — `src/core/Zones.js`
`zones.add({ name, min:[x,y,z], max:[x,y,z], type, indoor, priority, reverb, wind, traffic, snow,
conveyor:[vx,vy,vz], silence, surface, data })`. Reverbs: `outdoor courtyard park stairwell
underpass metro tunnel shop room elevator hall`. The current zone is `game.zone`; the
`'zone'` event fires on change. `snow:false` hides snowfall.

## Signs — `src/render/Signs.js`
```js
signs.add({ x, y, z, angle /* 0 faces south (+z) */, w: 1.2, h: 0.4, lines: ['Подъезд 3', 'кв. 37–54'],
  bg: '#1d3a66', color: '#eee', font, weight, size, align, border, ppm: 56, emissive: 0, schedule: 'always'|'night'|'street',
  indoor, aged: 0..1, double, draw(ctx2d, W, H) /* custom drawing instead of text */ })
```
Fonts: `SIGN_FONT` (condensed bold), `PLAIN_FONT`, `SERIF_FONT`, `HAND_FONT`; helpers `drawText`, `ageCanvas`.
Place signs ~1 cm in front of a surface. `emissive` > 0 makes it glow (lit shop signs).

## Interactions & UI
```js
interactions.add({ x, y, z, size: [sx,sy,sz], prompt: { ru: 'Читать', en: 'Read' },
  onUse(game, item) { game.ui.showNote({ ru: '…', en: '…', style: 'notice' }) }, enabled, reach, tag })
```
`ui.showNote({title, ru, en, style:'paper'|'notice'|'sign'|'ticket'|'screen'|'hand', footer})`,
`ui.say({ru, en}, seconds)` (rare quiet caption), `ui.setFade(v, color)`.
Player: `player.sit({x, y, z, standPos: Vector3})`, `player.teleport(x,y,z,yaw)`, `player.mode = 'locked'`.
`game.phone` is provided by the phone package; `game.toggleFlashlight()`.

## Wires
`wires.add([[x,y,z], [x,y,z], ...], { sag, color })` — thin fogged lines for trolleybus overhead
wires, power lines, cables between buildings. Built once at load (static).

## Footprints
`footprints.addTrail([[x,z],...], terrain, age0to1)` — pre-existing trails in the snow.

## Audio — `src/audio/AudioEngine.js`
All sounds are synthesized. `audio.register(name, factory)` where `factory(engine, opts)` returns
`{ output: AudioNode, stop?(when), duration? }` built from `engine.ctx` nodes (use
`engine.noise('white'|'pink'|'brown')`, `engine.makeBuffer(seconds, fn)`).
`audio.play(name, { pos: [x,y,z], gain, bus: 'ambience'|'sfx'|'music'|'ui', refDistance, maxDistance,
rolloff, reverb, occlude, loop, cutoff, ...custom })` → emitter `{ setPosition, setGain, stop }`.
Spatial emitters get distance air-absorption and voxel occlusion automatically; zones switch the
reverb. `audio.addController({ update(dt, engine, game) })` for ambience directors.
`audio.setFootstep(fn(engine, surface, info))`. Audio starts only after the first click
(`audio.ready`), so create looping emitters lazily in `update` when `audio.ready` becomes true.

## Navigation paths
Layout packages push pedestrian routes: `ctx.navPaths.push({ points: [[x,z], ...], kind: 'sidewalk' })`.

## Testing your work
- `node tools/shot.mjs --viewer model_a,model_b [--t 21:00 --lamp] [--views 0,1,2,3]` → PNGs in `tools/out/`
  (4 orbit views of models on flat snow; noon by default). Open them with the Read tool.
- `node tools/shot.mjs --at x,z,yaw[,y] --t 17:30 --weather light [--pitch -0.1] [--only pkg1,pkg2]`
  → first-person screenshot in the world. Multiple: `--at "x,z,yaw;x,z,yaw"`.
- The page logs `[content:pkg]` errors; shot.mjs prints console errors. Headless rendering uses
  SwiftShader: expect ~20 s per shot; keep shots purposeful.
- `npx vite build` must succeed.
- URL params in the browser: `?t=21:00&weather=heavy&x=..&z=..&yaw=..&stats=1&only=..`.
