# Catalog: `nature`

Package `src/content/nature/` (order 28). `build()` places nothing in the city by itself: it only
creates the shared systems (steam particle mesh, falling-clump pool). Layout packages call the
helpers in **`src/content/nature/api.js`**:

```js
import {
  placeTree, scatterTrees, placeTreeRow, placeBush, placeHedge, placeWeeds, scatterWeeds,
  placePond, snowBank, snowDrift, plowedPile, addSteam, steamPuff, addCrows, treesNear, dropClump,
} from '../nature/api.js'
```

All helpers take the build `ctx` first and are deterministic (seeded from coordinates unless you
pass `seed`). Terrain-shaping helpers (`placePond`, `snowBank`, `snowDrift`, `plowedPile`) must run
during `build()` (before the world is finalized). Trees, bushes, steam and crows may also be added
from `init()`/runtime.

Conventions: 1 voxel = 0.25 m. Pivot of every model = bottom centre of its trunk/footprint at
ground level; tree and plant models extend 0.75–2 m *below* the pivot (roots hidden in the snow so
nothing floats on uneven ground). Placements default to the terrain height at (x, z).

---

## 1. Trees

Bare winter trees generated procedurally (recursive branching rasterized into voxels). A few
seeded variants per species are reused with rotation → instancing-friendly (one mesh per variant
and LOD). **Trunks are solid; every branch, twig, needle and the snow on them is non-solid**, so the
player bumps into trunks but never snags or climbs on branches. Thin lines of snow lie on top of
near-horizontal limbs (`nature_snow_branch`), spruces carry snow on every tier. LODs: engine LODs
`[1,2,4]` with a twig-thinning reducer (distant crowns become a light haze instead of solid blocks);
cull 320–400 m for big trees.

| model | species / kind | ~height m | crown radius m | notes |
|---|---|---|---|---|
| `nature_birch_0` | birch, single | 10.5 | 4.6 | white trunk, black lenticel dashes, dark fissured foot, white arching limbs, curtains of pendulous dark twigs |
| `nature_birch_1` | birch, single | 12 | 5.3 | |
| `nature_birch_2` | birch, **clump** (2 stems) | 13 | 6.7 | |
| `nature_birch_3` | birch, single | 14 | 6.6 | |
| `nature_birch_4` | birch, single | 15 | 6.4 | |
| `nature_birch_5` | birch, **clump** (3 stems) | 16.5 | 10.4 | widest model (≈20 m bbox); heaviest (≈20k tris LOD0) |
| `nature_birch_6` | birch, single | 17.5 | 9.8 | |
| `nature_birch_7` | birch, **clump** (2 stems) | 12.5 | 6.9 | |
| `nature_poplar_0..3` | poplar, `natural` | 19 / 21 / 23 / 24.5 | 2.9–4.9 | tall fastigiate crowns, grey-green bark `#777b71`, dark fissured foot |
| `nature_poplar_4` | poplar, `pollarded` | ≈9.5 | 2.2 | **опиленный тополь**: thick stem cut at 7.5 m, knuckled stubs with bristles of straight shoots |
| `nature_poplar_5` | poplar, `pollarded` | ≈10.5 | 1.6 | short fresh shoots (recently cut) |
| `nature_poplar_6` | poplar, `pollarded` | ≈12 | 3.2 | forked stem, two cut heads |
| `nature_poplar_7` | poplar, `pollarded` | ≈13 (+regrown leader to ≈18) | 2.0 | one leader allowed to grow back |
| `nature_maple_0..2` | maple, `norway` | 10 / 12 / 14 | 3.9–8.5 | forked at 2.5–4 m, round crown, opposite branching |
| `nature_maple_3..5` | maple, `negundo` | 7 / 8.5 / 9.5 | 4.4–6.2 | ash-leaved maple: 2–4 leaning crooked stems, hanging clusters of dry seed keys |
| `nature_linden_0..5` | linden | 11–17.5 | 3.5–4.6 | straight stem, upright oval crown; `_1`, `_3` have a **whitewashed** foot (побелка); some have suckers at the foot |
| `nature_apple_0..4` | apple | 3.6–5.2 | 2.9–5.1 | low fork, gnarled limbs, water sprouts, a few frozen apples (dark red); all but `_3` whitewashed |
| `nature_spruce_0,1,3` | spruce, `green` | 6.5 / 9 / 14 | 2.2–4.2 | dark conical tiers, snow on every tier |
| `nature_spruce_2` | spruce, `green` | 11.5 | 3.2 | courtyard spruce with a bare dry skirt (lower branches dead) |
| `nature_spruce_4,5` | spruce, `blue` | 8 / 12 | 2.6–3.4 | blue spruce (by the school), more regular |
| `nature_rowan_0..3` | rowan | 5–8 | 1.4–3.6 | slender, ascending; clusters of red berries (the only saturated red — use sparingly) |
| `nature_sapling_0` | sapling | 2.2 | 0.6 | young tree tied to one wooden stake |
| `nature_sapling_1` | sapling | 2.6 | 1.6 | young birch with stake |
| `nature_sapling_2` | sapling | 3.0 | 0.9 | three stakes with crossbars (typical municipal planting) |
| `nature_sapling_3` | sapling | 3.4 | 0.6 | two slanted stakes, whitewashed stem |

Species names for the API: `birch`, `poplar`, `maple`, `linden`, `apple`, `spruce`, `rowan`,
`sapling`. Kinds can be selected with `species: 'poplar:pollarded'`, `'poplar:natural'`,
`'birch:clump'`, `'birch:single'`, `'maple:norway'`, `'maple:negundo'`, `'spruce:blue'`,
`'spruce:green'`.

### `placeTree(ctx, o)` → tree handle
```js
const t = placeTree(ctx, { x: 120, z: 300, species: 'birch', size: 'large' })
placeTree(ctx, { x: 160, z: 210, species: 'poplar:pollarded', rot: 1 })
placeTree(ctx, { x: 40, z: 400, species: 'spruce', variant: 4 })   // blue spruce
```
`o: { x, z, y?, species, kind?, size?, variant?, rot? | angle?, seed?, tag? }`
- `size`: target height in metres (e.g. `14`), or `'small' | 'medium' | 'large' | 'old'`, or a
  quantile 0..1. Omitted → random variant.
- `variant`: index into the species list (or a model name) — overrides `size`.
- `rot`: quarter turns (default random 0–3). `angle`: free rotation in radians.
- Handle: `{ placement, species, kind, name, x, y, z, height, crownR, perches(), snowSpots() }`.
  `perches()` returns world points (THREE.Vector3) on top of branches where a crow can sit.
- Placement tag `'tree'`, `userData: { species, kind, nature: true }`.

### `scatterTrees(ctx, o)` → handles[]
```js
scatterTrees(ctx, {
  rect: [24, 150, 140, 500],            // or polygon: [[x,z], ...]
  density: 0.6,                         // trees per 100 m² (or count: 120)
  species: { birch: 0.7, 'poplar:pollarded': 0.1, linden: 0.1, spruce: 0.1 },
  avoid: (x, z) => onPath(x, z),        // return true to keep a spot clear
  minSpacing: 4, clump: 0.4, seed: 12,  // clump 0..1: groves (birches self-seed in groups)
  size: 'large', sizes: { spruce: 9 },
})
```
Trees already placed by the package nearby are kept clear automatically.

### `placeTreeRow(ctx, o)` → handles[]
Avenue/street rows: `{ x0, z0, x1, z1, spacing = 7, species = 'linden' | {linden:0.7, poplar:0.3},
jitter = 0.4, size, missing = 0.08 (chance of a gap), skip(x,z), seed }`.
```js
placeTreeRow(ctx, { x0: 30, z0: 520, x1: 600, z1: 520, spacing: 8, species: { linden: 0.6, 'poplar:pollarded': 0.4 } })
```

### `treesNear(ctx, x, z, r)` → handles[] — trees whose trunk is within r m.

---

## 2. Bushes, hedges, weeds, reeds

All plant voxels are non-solid except a few thick stems in bushes/hedges (so the player is held
back by a bush but never climbs it). Weeds/reeds: no collision at all, cull 75–110 m.

| model | size w×h×d m (bbox) | notes |
|---|---|---|
| `nature_lilac_0..2` | ≈4.5 × 3–3.5 × 4.5 | сирень: 8–14 upright grey stems, dry brown panicles, snow on tops |
| `nature_currant_0..1` | ≈4 × 1.5–2 × 4.5 | low arching bush |
| `nature_snowberry_0..1` | ≈3.5 × 1.8 × 4 | снежноягодник: fine twigs with white berries |
| `nature_hedge` | 2 m long (local X) × 1.0 m high × 0.75 m | clipped hedge segment, flat snow cap, solid stems inside |
| `nature_hedge_low` | 2 × 0.75 × 0.75 | |
| `nature_hedge_gap` | 2 × 1.0 × 0.75 | trampled dip in the middle |
| `nature_weeds_grass_0..2` | ≈2.5 × 0.6–1 | dry grass tufts poking out of snow (straw) |
| `nature_weeds_burdock_0..1` | ≈2.5 × 1.2–1.6 | burdock stalks with dark burrs |
| `nature_weeds_tansy_0..1` | ≈2.5 × 1–1.4 | tansy with flat brown heads |
| `nature_reeds_0..2` | ≈3 × 1.6–2.5 | reed stand with plumes, some stalks broken |
| `nature_cattail_0..1` | ≈2.5 × 1.4–1.8 | рогоз with brown heads |

```js
placeBush(ctx, { x, z, kind: 'lilac' | 'currant' | 'snowberry', variant?, rot? | angle?, seed? })   // → placement (tag 'bush')
placeHedge(ctx, { x0, z0, x1, z1, low?, damaged = 0.08, seed? })   // → placements (tag 'hedge'), any direction
placeWeeds(ctx, { x, z, kind: 'grass' | 'burdock' | 'tansy' | 'reeds' | 'cattail', variant?, angle?, seed? })
scatterWeeds(ctx, { rect | polygon, density = 2 (per 100 m²) | count, kinds: { grass: 0.6, burdock: 0.2, tansy: 0.2, lilac: 0.05 },
                    avoid(x,z), minSpacing = 1.5, seed })
```
Typical: hedges along courtyard paths (`placeHedge` 0.5 m off the path edge), lilac by entrances,
dry weeds along fences, garages, the railway embankment and the wasteland, reeds only at ponds.

---

## 3. Frozen pond — `placePond(ctx, o)` → pond

```js
const pond = placePond(ctx, { x: 80, z: 420, rx: 18, rz: 11, seed: 3 })
pond.contains(x, z)   // on the ice?
pond.shapeAt(x, z)    // normalized radius: <0.93 ice, 0.93–1.3 shore slope, ≈1.42 path
```
`o: { x, z, rx = 12, rz = 9 (half-axes m), seed, depth = 0.5 (ice below the shore), sign = true |
{ angle }, reeds = true, path = true, trail = true, rink (auto when rx > 11 && rz > 8), avoid(x,z) }`

What it does (terrain):
- lowers a slightly irregular elliptical bowl; ice at `rim − depth` (rim = lowest ground 1.25×
  radius out), shore slope out to 1.3× radius;
- ice materials `nature_ice` (grey-blue, glossy, footsteps = ICE), `nature_ice_dark` (wind-polished
  black ice), white crack lines `nature_ice_crack`, drifted snow patches;
- a rectangle swept clear by kids for hockey with low snow ridges (`rink`);
- reed/cattail clumps along the shore (thicker on one side) and dry grass on the slope;
- a trodden `snow_packed` path ring at ≈1.42× radius with an old footprint trail, plus a trail of
  footprints straight across the ice;
- the sign **«ВЫХОД НА ЛЁД ЗАПРЕЩЁН!»** (*Walking on the ice is prohibited!*) — signed
  «Управа района «Восточный»» (*Vostochny District Council*) — on `nature_sign_post` at the
  shore, facing away from the pond, readable (interaction «Читать», tag `notice`).

Keep the area within `1.5 × max(rx, rz)` of the centre free of other objects (the path ring sits
at ≈1.42×). Pass `avoid` to keep reeds/path off specific spots. The package plays `ice_crack`
occasionally while the player walks on pond ice. Registered in `ctx.registry.ponds`.

---

## 4. Snow helpers (terrain)

### `snowBank(ctx, x0, z0, x1, z1, height = 1, opts)` — plough windrow along a road
The rect is the bank footprint; its long side is its length. Trapezoid/rounded cross-section,
lumpy, tapered ends, loose packed-snow chunks on the crest. The side facing the road is grimy
(`snow_dirty`, `nature_snow_grime`) — auto-detected from road materials (asphalt, slush, curb...)
1 m outside the long sides, or `opts.dirtySide: 'n'|'s'|'e'|'w'|'both'|'none'`. `opts.gaps:
[[from, to], ...]` (m along the bank) cuts openings for crossings, stops and yard entrances.
`opts.chunks = true`, `opts.seed`.
```js
snowBank(ctx, 30, 522.5, 600, 524.5, 0.9, { gaps: [[206, 214], [350, 356]] })   // north kerb of the avenue
```
Typical: 0.6–1.2 m high, 1.5–2.5 m wide; along every road kerb and driveway edge.

### `snowDrift(ctx, x, z, opts)` — wind drift against a wall/fence
`(x, z)` = foot of the wall at the drift's middle. `opts: { side: 'n'|'s'|'e'|'w' | dir: [dx,dz]
(direction the drift spreads away from the wall), length = 4, depth = 2.2, height = 0.7, seed }`.
Scoured trough at the wall, crest just out from it, long tail, sastrugi ripples, fresh snow.
```js
snowDrift(ctx, 210, 330, { side: 's', length: 12, depth: 3, height: 0.8 })   // along a building's south wall
```

### `plowedPile(ctx, x, z, opts)` → `{ x, z, radius, height, items }` — plough pile
Big lumpy pile (2–3 m) where driveways end: two or three heaps shoved together, fresh top, grimy
sides, slush ring, 4–8 loose chunks (`nature_snow_chunk_*`) at its foot, and with 45% chance
something buried and sticking out. `opts: { radius = 3, height = 2.2, seed, buried: true | false |
'yolka' | 'tire' | 'sled' | 'ski' | 'chair' | 'pallet', chunks = true }`.
```js
plowedPile(ctx, 305, 140, { radius: 3.5, height: 2.6 })
```

Snow props (placed by the helpers, also usable directly):

| model | size m | notes |
|---|---|---|
| `nature_snow_chunk_0..3` | 0.5–1.25 lumps | packed dirty snow chunks (solid); place with `yOffset: -0.1` |
| `nature_buried_yolka` | 3 × 2 × 1.75 | discarded New Year tree lying at an angle, tinsel, one red bauble (non-colliding) |
| `nature_buried_tire` | 1 × 1 × 0.5 | tyre standing half-buried |
| `nature_buried_sled` | 0.5 × 1.25 × 0.75 | kids' sled sticking up (seat uses `paint` → pass `tint`) |
| `nature_buried_ski` | 0.25 × 2 × 0.25 | ski stuck upright (`paint`) |
| `nature_buried_chair` | 0.75 × 1.25 × 0.75 | wooden chair upside down |
| `nature_buried_pallet` | 1.25 × 0.75 × 0.5 | pallet edge |
| `nature_sign_post` | 1.5 × 2.75 × 0.5 | two steel posts + board 1.5 × 1.0 m at 1.5–2.5 m; board front = local −Z (rot 0 faces north) |

---

## 5. Steam — `addSteam(ctx, o)` → handle

One GPU particle system (a single instanced draw call, ≤4096 particles) for all plumes. Motion is
evaluated in the vertex shader from spawn time; particles are lit by the lamp lights (orange glow
under sodium lamps) and fogged like everything else. Emitters further than `maxDist` from the
camera emit nothing; plumes are pre-warmed when they come into range.

```js
addSteam(ctx, { x: 236, y: 0.05, z: 436, kind: 'manhole' })            // street manhole / heating main
addSteam(ctx, { x: 262, y: 32, z: 95, kind: 'chimney' })               // boiler-house chimney top
addSteam(ctx, { x: 312, y: 0.4, z: 200, kind: 'vent', vel: [0, 0.6] }) // basement vent (продух) blowing south
const ex = addSteam(ctx, { x, y: 0.3, z, kind: 'exhaust' })            // car exhaust: ex.set(x,y,z) every frame
```
`o: { x, y, z, kind, rate, size, rise, life, opacity, spread, color, vel: [vx, vz], gust, maxDist, tag }`

| kind | rate/s | size m | rise m/s | life s | use |
|---|---|---|---|---|---|
| `manhole` | 5 | 0.7 | 0.9 | 5.5 | manholes, heating-main leaks |
| `vent` | 3 | 0.45 | 0.55 | 3.8 | basement vents, форточки, metro vent kiosks |
| `pipe` | 7 | 0.55 | 1.2 | 4.2 | heat-pipe leak |
| `chimney` | 5 | 3.2 | 2.4 | 16 | boiler house / ТЭЦ plume (visible to 900 m) |
| `exhaust` | 11 | 0.22 | 0.22 | 2.4 | idling cars, buses (move with `set`) |
| `breath` | 1.5 | 0.18 | 0.15 | 1.4 | a person's breath |
| `kettle` | 3 | 0.2 | 0.4 | 2.2 | dispatcher booth kettle, kiosk |

Handle: `set(x,y,z)`, `setVelocity(vx,vz)`, `setRate(r)`, `setOpacity(a)`, `start()`, `stop()`,
`remove()`. `steamPuff(ctx, { x, y, z, kind: 'powder', size, speed }, count)` makes a one-off burst
(snow powder off a roof, frost at a door). Registry: `ctx.registry.steam = [{x,y,z,kind,handle}]`.

---

## 6. Crows — `addCrows(ctx, o)` → group

Hooded crows (серая ворона: grey body, black head/wings/tail) built from fine 6.25 cm voxels so
they read as birds. They perch, turn, caw now and then (`crow_caw`), and when the player comes
within ~12 m (10 m for ground crows) the group bursts off (`crows_takeoff` + an alarm caw series),
flaps away (frames swapped by toggling dynamic placements), climbs and vanishes into the fog;
each comes back 1–3 minutes later from far away if the player is not standing at its perch.

```js
const t = placeTree(ctx, { x: 100, z: 300, species: 'poplar:pollarded' })
addCrows(ctx, { perch: 'tree', tree: t, count: 4 })                         // on the tree's branches
addCrows(ctx, { perch: 'wire', x: 240, y: 8.9, z: 530, angle: 0, count: 5 }) // along a wire running east
addCrows(ctx, { perch: 'roof', x: 320, y: 27.6, z: 200, angle: 0, facing: Math.PI / 2, count: 3 }) // parapet, looking north
addCrows(ctx, { perch: 'ground', x: 230, z: 420, count: 3 })                 // pecking at the snow (by bins!)
addCrows(ctx, { perch: 'tree', x: 50, y: 9, z: 250, radius: 1.5, count: 2 }) // explicit spot in a crown
```
`o: { x, y, z, count (1–10), perch: 'tree'|'wire'|'roof'|'ground', tree (handle), points
[[x,y,z],...], angle (wire/roof direction, rad; 0 = +X/east), facing (roof), spacing = 0.6,
radius, scareRadius, seed }`. Returns `{ crows, center, scare() }` (`scare()` sends them off now).
Keep counts small (2–5 per group, a dozen groups in the whole city). Registry: `ctx.registry.crows`.

Models (dynamic, non-colliding, fine-scale): `nature_crow_perch`, `nature_crow_caw`,
`nature_crow_peck`, `nature_crow_fly_up`, `nature_crow_fly_mid`, `nature_crow_fly_down`
(≈0.5 m long, wingspan ≈1.3 m; forward = local +X, pivot at the feet / body centre for flight).

---

## 7. Falling snow clumps (automatic)

While the player is outdoors, every ~0.5–1.5 min a clump of snow (`nature_snow_clump`, dynamic)
slides off a snowy branch of a package tree within ~22 m — preferably one the player is facing —
trailing powder, and lands with `snow_fall_branch` and a puff. `dropClump(ctx, tree)` triggers one
on demand. Works for every tree placed with `placeTree`/`scatterTrees`/`placeTreeRow`.

---

## Sounds called (registered by the `audio` package)
`crow_caw`, `crows_takeoff`, `snow_fall_branch`, `ice_crack` (all positional, guarded: nothing
happens if audio is not ready or the sound is missing).

## Tags & registry
- Placement tags: `tree`, `bush`, `hedge`, `weeds`, `reeds`, `snow` (chunks), `buried`, `sign`,
  `crow`, `clump`.
- `ctx.registry.trees` — tree handles (see `placeTree`), `ctx.registry.ponds`,
  `ctx.registry.steam`, `ctx.registry.crows`.

## Materials defined
Trunks (solid): `nature_bark_poplar`, `nature_lime` (whitewash). Non-solid: `nature_limb_birch`,
`nature_branch`, `nature_twig_birch`, `nature_twig_grey`, `nature_snow_branch`, `nature_needles`,
`nature_needles_blue`, `nature_seeds`, `nature_berry_red`, `nature_berry_white`, `nature_straw`,
`nature_stalk`. Terrain: `nature_ice`, `nature_ice_dark`, `nature_ice_crack` (SURF.ICE),
`nature_snow_grime` (traffic-side bank crust). Core `bark_birch`, `bark_birch_dark`, `bark`,
`branch` (solid), `twig` are reused.

## Notes for layout agents
- **Moscow look**: courtyards = pollarded poplars (`'poplar:pollarded'`) and birches, a few lindens
  and maples, lilac by the entrances, apple trees in old 5-storey yards, a blue spruce or two by
  the school, saplings with stakes in newer yards. Avenue lawn strip: lindens/poplars in a row.
  Park: birch grove (`clump: 0.4`), a few spruces, reeds at the pond. Wasteland/railway: maples
  `negundo`, weeds.
- Mind the crown radius: big birches/maples spread 5–10 m; keep trunks ≥ 4–6 m from facades and
  ≥ 1.5 m from paths. Poplars are narrow (2–5 m) and tall (20–28 m): good along buildings.
- Trees sit on the snow surface; dig nothing. On sidewalks place them on a lawn strip.
- Prefer `rot` (quarter turns, the default) for crisp voxels; free `angle` also works.
- Budget: a big tree is 4–20k triangles at LOD0 (≤ 55 m), ~¼ at LOD1, ~1/16 at LOD2. A park of
  300 trees is fine; avoid > 60 trees within 50 m of any viewpoint.
- Call `snowBank` after painting roads (it reads road materials to find the dirty side).
- Steam on every street manhole that sits on a heating main; a `chimney` plume on the boiler house;
  `vent` at a few basement vents (a cat sits by one, see `life`).
