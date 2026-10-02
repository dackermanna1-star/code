# Developer guide

A zero-dependency WebGL2 game. Everything (textures, models, sounds, levels) is generated
procedurally at runtime from code in `src/`. There is no build step for development.

## Running

```
python3 -m http.server 8765        # from the repo root
open http://127.0.0.1:8765/index.html
```

URL parameters (development):

| param | effect |
|---|---|
| `seed=<n or text>` | world seed (default fixed seed, the same building for everybody) |
| `x= z= y= yaw= pitch= dim=` | start at a position (`spawnAt` drops you on the nearest free floor) |
| `force=<zoneType>` | every zone that can hold that type becomes it (except the start area) |
| `piece=<roomPiece>` | every room that calls `tryRoomPiece` and fits becomes that piece |
| `noworker` | generate the world on the main thread (no Web Worker) |
| `noaudioworker` | build the sound bank on the main thread in idle slices |

`F3` toggles a debug overlay (position, zone, chunk stats).

### Tools

* `node tools/check.mjs` – imports every module and resolves all materials. Run after every edit.
* `node tools/zones.mjs <type> [level] [dim] [--force]` – generates zones in Node and prints
  where zones of a type are (and generation time).
* `node tools/shots.mjs '<json>' [query] [outDir]` – headless screenshots (Playwright +
  SwiftShader). Example:
  `node tools/shots.mjs '[{"name":"a","x":200,"z":200,"yaw":1.2}]' "force=office" /tmp/out`
  then look at `/tmp/out/a.png`. Set `PORT=` if your server is not on 8765.

### Single-file build

`node tools/build.mjs` writes `dist/index.html`, the whole game in one file that also runs from
`file://`, and `dist/level-zero.html`, the same page without doctype/head/body for hosts that
supply their own document skeleton. Every module becomes an async factory inside one script.

* Supported module syntax: named imports and exports, `import * as`, side-effect imports,
  dynamic `import()`, `export { a as b }`. No `export default`, no `export *`, and one
  declarator per exported `const`.
* Workers: inside the bundle, `globalThis.__makeWorker(path)` starts a Blob worker running the
  module with that repo-relative path. Create workers like this so both modes work:
  `globalThis.__makeWorker ? globalThis.__makeWorker('src/audio/bankworker.js') : new Worker(new URL('./bankworker.js', import.meta.url), { type: 'module' })`.
  Worker modules must also import cleanly in Node (`tools/check.mjs`), so guard `self`.

## Conventions

* Units are metres. `+x` east, `+z` south, `+y` up. Camera yaw 0 looks toward `-z`.
* One **cell** = 1 m square. Cell `(x, z)` covers `[x, x+1) x [z, z+1)`.
* The building is a stack of **levels** `LEVEL_H = 6` m apart. Level `L` has its base at
  `y = L * 6`. Everything a generator writes uses heights **relative to the level base**.
  Normal ceilings are 2.4–3.8 m; keep content below ~4.2 m unless the zone is `tall`.
* **Dimensions**: `dim 0` is the main building. Other dims are pocket spaces reached through
  portals.
* The world is split into **zones**: rectangles aligned to 8 m units, 16–128 m per side,
  produced by a deterministic BSP per 256 m super-block per level. Every zone has a `type`
  (registered with `defineZone`) and `params` (style chosen from the zone seed).
* Determinism: generators must only use `zb.rng` (or RNGs derived from it with `rng.fork()`),
  never `Math.random()`. The same seed must always produce the same building.

## Writing a zone type

```js
import { defineZone } from '../zonetypes.js';
import { W, CF, M, ceilingLight, lightLattice, findWallSpots, propOnWall, env } from './common.js';

defineZone('my_zone', {
  border: 'wall',          // 'open' only for types that blend seamlessly (the yellow rooms)
  gate: 'door',            // style of openings in border walls: door | open | wide
  minW: 16, minD: 16,      // size limits in metres (multiples of 8)
  maxW: 1e9, maxD: 1e9,
  tall: 0,                 // 1 = also occupies the level above (only allowed on even levels)
  allowStairs: true,       // may stairwells be stamped into this zone
  weight: (ctx) => ctx.dim === 0 && ctx.dist > 150 ? 1 : 0,   // relative spawn weight
  params(zone, rng, ctx) { // style, decided without generating the zone
    return {
      wallMat: M.paint_wall, floorMat: M.carpet_gray, ceilMat: M.ceil_tile, ceilH: 2.8,
      ambient: [0.22, 0.22, 0.2],        // baked ambient light (0..2 scale, 1 = neutral)
      env: env({ fog: [0.3, 0.3, 0.28], fogNear: 4, fogFar: 30, hum: 0.5, hvac: 0.5, reverb: 'room', tone: 'office' }),
    };
  },
  gen(zb, world) { /* write cells, walls, props, lights ... */ },
});
```

Then add `import './my_zone.js';` to `src/world/gen/index.js`.

`ctx` (also available as `zb.zone.ctx`): `{dim, level, cx, cz, w, d, dist, flatDist, office, ind, odd}`.
`dist` grows with distance from the start and with |level|; use it so strange things get
rarer near the start. `office`, `ind`, `odd` are smooth 0..1 "biome" noises.

`env` drives the atmosphere while the player stands in the zone (blended smoothly):
`fog` colour, `fogNear`/`fogFar` (draw distance), `hum` (fluorescent hum 0..1), `hvac`
(air handling noise 0..1), `reverb` (`tiny room office corridor hall warehouse stairwell tunnel tile auditorium outdoor`),
`tone` (ambience bed: `yellow office industrial dark water outdoor school hotel void`).

### Generation pipeline

1. `ZoneBuilder` is created with every cell set to: floor 0, ceiling `params.ceilH`,
   `params.floorMat / ceilMat / wallMat`, no walls.
2. Your `gen(zb)` runs.
3. Border walls with gates are written (shared deterministically with the neighbour zone).
   `zb.gates` (available inside `gen`) lists gate cells `{x, z, dx, dz}` (dx/dz point inward).
   Keep them and the cell behind them walkable; the pipeline clears them anyway.
4. Vertical features (stairwells, shafts) are stamped.
5. Connectivity repair: walkable components that are cut off are joined by opening doors /
   clearing solids. Don't rely on it for layout, but you don't need to be perfect.

### ZoneBuilder API (`src/world/zonebuilder.js`)

Bounds: `zb.x0, zb.z0, zb.x1, zb.z1` (exclusive), `zb.w, zb.d`, `zb.in(x,z)`, `zb.i(x,z)`.

Cells (typed arrays indexed by `zb.i(x,z)`):

| array | meaning |
|---|---|
| `floor` | floor height (NaN = no floor: hole/void) |
| `ceil` | ceiling height (NaN = open to above) |
| `fmat cmat` | floor / ceiling material id |
| `wmat` | wall material used for risers, soffits, solid faces |
| `solid` | material id of a full-height block filling the cell (0 = none) |
| `wallW wallN` | thin wall type on the cell's west / north edge |
| `wmW wmN` | packed materials of those walls: `minusSideMat | (plusSideMat << 8)` |
| `flags` | `CF.STAIRS` (no floor mesh / collision – brushes provide it), `CF.VOID`, `CF.HOLE_CEIL` (missing ceiling tile), `CF.NOPROPS`, `CF.KEEP` (connectivity repair must not touch) |

Setters: `setFloor setCeil setSolid clearSolid setFlag`, rect versions `rectFloor rectCeil
rectSolid rectClear rectWallMat rectRoom`, and `fill(x0,z0,x1,z1,(x,z,i)=>{})`.

**Thin walls** sit on cell edges (0.2 m thick). A cell owns its west edge (line `x`) and its
north edge (line `z`). `setWall(x, z, 'W'|'N', type, matMinus, matPlus)`;
`hLine(z, xa, xb, type, mMinus, mPlus)` (horizontal line z, cells xa..xb-1),
`vLine(x, za, zb, ...)`, `roomWalls(x0,z0,x1,z1,type,inner,outer)`.
`matMinus` is the face seen from the west/north cell, `matPlus` from the east/south cell.
Writes outside the zone are ignored (the zone's east/south border belongs to the neighbour).

Wall types (`W`): `WALL` full height · `HALF` 1.05 m with wood rail · `DOOR` 2.1 m opening with
lintel & frame · `BIGDOOR` 2.45 m opening · `ARCH` 2.6 m opening · `LOW` 1.0 m crawl hole ·
`WINDOW` sill 1.0 / head 2.1 with glass · `GLASS` full glass partition · `RAIL` 1 m railing ·
`PART` 1.55 m cubicle partition · `FULL` covers the whole level height · `UPPER` only above the
ceiling. Consecutive `DOOR`/`ARCH` edges make one wide opening.

Floors may differ between neighbouring cells: risers are generated automatically. The player
steps up ≤ 0.42 m, can climb (Space) ledges ≤ 1.45 m. For real stairs use
`stairs(zb, x0, z0, x1, z1, dir, h0, h1, mat)` from common.js (solid step boxes, cells marked
`CF.STAIRS`); the cells beyond each end should have floors at `h0` / `h1`.

Entities (x/z absolute, y relative to the level base):

* `zb.box(x0,y0,z0,x1,y1,z1, mat | [px,nx,py,ny,pz,nz], {collide, render, uv:'world'|'fit', flags, tint, alpha, skip})` – brushes for anything boxy (counters, steps, platforms, houses, racks).
* `zb.prop(type, x, y, z, rot, opts)` – props from `src/world/props.js`. `rot`: use
  `facing(dx, dz)` from common.js to make the front face a direction. `opts.flip` hangs it
  upside down from height `y` (ceiling). `opts.tilt / roll` rotate it. `opts.flags` e.g.
  `VF.VIBRATE`. `opts.collide:false`.
* `zb.dynamic(type, x, y, z, rot, opts, {spin, osc})` – an animated prop rotating about its
  vertical axis: `spin` rad/s, `osc: [amplitudeRad, freqHz, phase]` swings back and forth.
  Lighting is baked once, so keep these few (≤ ~10 per chunk). `{showFar: r}` draws it only
  while the camera is more than r metres away, `{showNear: r}` only while closer (mirages).
* `zb.light(x, y, z, {color, rad, int, ch})` – baked point light. Prefer `ceilingLight()`.
* `zb.fixture(...)` – light fitting visual; use `ceilingLight(zb, x, z, kind, state, opts)`
  which adds both. kinds: `panel troffer tube bulb cage highbay`; states:
  `on off flicker dying pulse flash event`.
* `zb.decal(x, y, z, face, w, h, texName, {rot, lit, glow})` – flat textured quad.
  `face`: `px nx pz nz` (on a wall facing that way), `up` (floor), `down` (ceiling).
  `wallFace()` / `findWallSpots()` in common.js find valid wall positions.
* `zb.emitter(x, y, z, sound, {vol, rad})` – looping positional sound.
  Sounds: `vending cooler fridge server static tick transformer drip washer vent heartbeat
  machine water pipes fan escalator wind drone hum_strip music_box`.

### Lighting

Lighting is baked into vertex colours when a chunk is built (PS1 style Gouraud). Brightness
scale is 0..2 where 1.0 shows a texture as painted. Each light has a radius (≤ 8 m reach
horizontally) and is occluded by walls/solids/floors in the cell grid (props don't cast
shadows). `params.ambient` is added everywhere in the zone. Flickering lights use animated
channels (`ch` 1–12), channel 13 is toggled by world events, 14 blinks, 15 pulses like a
heartbeat.

Self-lit things (screens, signs, windows) use a fullbright style – see `glow()` in props.js.

### Props (`src/world/props.js`)

Models face local `-z`, `+x` is their right, `y = 0` is the floor. Register new ones from your
own module with `defineProp(name, { build(mb, p, rng), boxes, use, emitter, light })`.
`mb` is a `MeshBuilder` (`src/world/mesh.js`): `box`, `cyl`, `rod`, `quad`, `poly4`, `tri3`,
`card`, `grid`. Helpers exported from props.js: `propMat(name)`, `propTex(texName)`,
`propGlow(texName, brightness)`, `propFrontBox`, `propWithXf`, `propLegs4`, `PROP_FIT`.
`boxes`: collision AABBs in local space (array or `(p) => array`). `use`: interaction kind
(`save note locked cooler vending`). Keep models low-poly (most props < 60 triangles; a
chair is ~40).

### Textures & materials

Textures are 64x64 tiles painted in code and reduced to a 16 colour palette (15-bit colour)
like PS1 CLUT textures. Register with `defineTexture(name, (painter, rng) => {...}, colors)`
from `src/gfx/textures.js`; see the `Painter` API in `src/gfx/texgen.js` (`fill rect frame
bevel line disc noise grain blend2 speckle stain drip text map`). Tile seamlessly.
Materials (`defineMaterial(name, texName, {s|su,sv, surf, tint, flags, stain})` in
`src/world/materials.js`) map a texture onto surfaces: `s` metres per texture repeat, `surf`
footstep sound (`carpet concrete tile wood metal lino water gel grass drywall plastic
wetcarpet wet asphalt`). There is a hard limit of 255 materials – reuse existing ones
(`M.*`) wherever possible.

### Room pieces (`src/world/roompieces.js`)

`defineRoomPiece(name, {minW, minD, maxW, maxD, weight(ctx), build(zb, rect, rng)})`.
Generators that carve rectangular rooms call `tryRoomPiece(zb, rect, rng, chance)`; when it
returns a name the room was handed over to that piece (walls and doors already exist; the
piece should add its own lights).

## Sound (`src/audio/`)

* `sounds.js` is the procedural bank: `SHOTS` (one-shots, `n` variants each), `LOOPS`
  (positional loops for `zb.emitter(x, y, z, '<loop name>', { vol, rad })`), `BEDS` (hum, air
  handling and one room tone per `env.tone`), footsteps per floor surface, and `UI_SOUNDS`.
  Everything is synthesised at 22050 or 11025 Hz and run through a PS-ADPCM round trip.
* `bankworker.js` builds the bank off the main thread; `audio.js` (`AudioEngine`) mixes it. The
  game talks to it only through `game.audioCall(method, ...)`: `play(name, x, y, z, { distant,
  vol })`, `footstep`, `land`, `ui`, `setHvac`, `humShift`, and `update()` every frame with the
  zone's `env` (`hum`, `hvac`, `reverb`, `tone`), the nearby emitters and lights.
* `env.reverb` picks an impulse response from `REVERB` in `reverb.js` (tiny, room, office,
  corridor, hall, warehouse, stairwell, tunnel, tile, auditorium, outdoor).
* Floor surfaces come from each material's `surf` (`materials.js`), so footsteps follow the floor.

## Art direction

* Late-90s PS1: few polygons, chunky textures, simple lighting, heavy fog. No modern effects.
* Exploration only: **no monsters, no enemies, no gore, no weapons**. Nothing implies a
  creature. Strangeness is architectural and unexplained.
* Mundane, liminal, abandoned. Things that should have a purpose but no longer do.
* Vary everything you can with `zb.rng`: sizes, lights (some dead, some flickering),
  materials, clutter density.

## Performance budget

A 16 m chunk should build in < 25 ms in Node (`tools/zones.mjs` prints zone generation time;
chunk build time shows in `shots.mjs` output as `avgChunkMs`). Keep zone generation < 20 ms
for a 64x64 zone, keep visible triangles per chunk modest (< 6k), and avoid thousands of props
in one chunk.

## Portals and pocket dimensions

`src/world/portals.js` places **vestibules** on a global lattice in the main building: short
S-shaped corridors (3 cells wide, `2*Lg+1` deep, entry door on the south side at local x=0,
exit door on the north side at local x=2). From the middle of the centre row neither doorway
is visible, so when the player crosses the trigger there the game swaps them into an identical
copy elsewhere with no visible cut. Vestibule materials (`vest_wall/floor/ceil`) use 1 m texture
repeats, cells are flagged `CF.NOLIGHTBLEED` (only the vestibule's own `local` light reaches
them), so every copy renders identically. Kinds: `loop` (rotated copy of itself — you come out
where you went in), `pair` (two vestibules far apart), `pocket` (into a pocket dimension) and
`return` (inside a pocket: back to where the player came from).

Pocket dimensions are registered in `src/world/pockets.js`:

```js
definePocket(ID, { name, zoneType, entry: { level: 0, ox, oz }, sign: 'texName', low: false });
defineZone(zoneType, { dims: [ID], border: 'open', weight: () => 0, allowStairs: false, allowPortals: false, params, gen });
```

* The default partition tiles the pocket with 64 m zones (aligned to multiples of 64) of
  `zoneType`; supply `partition(level, sbx, sbz)` to do something else.
* The zone generator must stamp the arrival/return vestibule exactly at `entry`:
  `if (zb.in(entry.ox, entry.oz)) stampVestibule(zb, { kind: 'return', dim: ID, level: entry.level, ox: entry.ox, oz: entry.oz, Lg: 3, low })`.
  Its footprint (`ox-1..ox+4`, `oz-1..oz+8`) must lie inside one zone. Both of its doors must
  open into the pocket (the player leaves through whichever end they were walking toward).
* Pocket spaces can be enormous or endless; generation must be coordinate-based so every zone
  computes its own part. Geometry may extend below/above a level's 6 m band with brushes
  (`zb.box`) – mark cells `CF.VOID` where the band has nothing. See `src/world/pocket/lecture.js`.
* `sign` is shown above the vestibule doors in the main building (a 64x64 texture name).
