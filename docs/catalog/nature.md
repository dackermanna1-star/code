# Catalog: `nature`

Package `src/content/nature/` (order 28). `build()` places nothing in the city by itself: it only
creates the shared systems (steam particle mesh, falling-clump pool). Layout packages call the
helpers in **`src/content/nature/api.js`**:

```js
import {
  placeTree, scatterTrees, placeTreeRow, placeBush, placeHedge, placeWeeds, scatterWeeds,
  placePond, snowBank, snowDrift, plowedPile, addSteam, steamPuff, addCrows, addBag, treesNear, dropClump,
} from '../nature/api.js'
```

All helpers take the build `ctx` first and are deterministic (seeded from coordinates unless you
pass `seed`). Terrain-shaping helpers (`placePond`, `snowBank`, `snowDrift`, `plowedPile`) must run
during `build()` (before the world is finalized). Steam and crows may also be added from
`init()`/runtime; place trees and plants during `build()` too (a model first used after the world
is finalized is meshed synchronously on the main thread — a visible hitch for a tree crown).

Conventions: 1 world voxel = 0.25 m; some nature models use finer voxels (tree crowns, bushes,
hedge twigs, saplings 12.5 cm; weeds and reeds 6.25 cm; crows ≈4.3 cm) — they are non-solid and
placed through the helpers, which also fix their culling bounds (`placeModel(ctx, name, o)` does
the same for a direct placement). Pivot of every model = bottom centre of its trunk/footprint at
ground level; tree and plant models extend 0.25–0.5 m *below* the pivot (roots hidden in the snow
so nothing floats on uneven ground). Placements default to the terrain height at (x, z).

---

## 1. Trees

Bare winter trees generated procedurally (recursive branching rasterized into voxels). A few
seeded variants per species are reused with rotation → instancing-friendly (one mesh per variant
and LOD).

**Every deciduous tree is two models placed on the same transform** — always place trees with
`placeTree` / `scatterTrees` / `placeTreeRow`, never with `world.place`:
- `nature_<species>_<i>` — the stout parts in normal 25 cm voxels: the **solid trunk** (collision,
  contact shadow), thick limbs, pollard knuckles. LODs `[1,2,4]`.
- `nature_<species>_<i>_crown` — every branch, twig, berry and the snow on them in **fine 12.5 cm
  voxels**, non-solid (the player never snags or climbs). Crown LODs: 12.5 cm up to ≈46 m
  (40 m for small species), a twig-thinned 25 cm version up to ≈120 m, a 50 cm haze beyond.
  This is what makes a bare crown read as a web of thin twigs instead of a heap of 25 cm blocks.
- Spruces are a single 25 cm model (dense needle tiers, snow on every tier); saplings a single
  fine 12.5 cm model.

Thin lines of snow lie on top of near-horizontal limbs and twigs (`nature_snow_branch`). Cull
distance 400 m (320 m for the smaller species).

Sizes below are the real generated ones (height = top of the crown above the pivot, crown radius
= horizontal reach from the trunk axis); triangles are LOD0 trunk + crown.

| model | species / kind | height m | crown radius m | LOD0 tris | notes |
|---|---|---|---|---|---|
| `nature_birch_0` | birch, single | 12.1 | 4.5 | 7.8k | white trunk with sparse dark lenticel dashes, dark fissured foot, white arching limbs, curtains of pendulous red-brown twigs |
| `nature_birch_1` | birch, single | 13.6 | 5.4 | 10.4k | |
| `nature_birch_2` | birch, **clump** (2 stems) | 14.6 | 6.8 | 13.4k | |
| `nature_birch_3` | birch, single | 16.8 | 6.6 | 10.2k | |
| `nature_birch_4` | birch, single | 16.6 | 6.5 | 12.9k | |
| `nature_birch_5` | birch, **clump** (3 stems) | 17.5 | 10.1 | 27.6k | widest and heaviest model (≈17 m crown) — use sparingly |
| `nature_birch_6` | birch, single | 19.8 | 9.7 | 18.3k | |
| `nature_birch_7` | birch, **clump** (2 stems) | 14.4 | 7.9 | 11.0k | |
| `nature_poplar_0..3` | poplar, `natural` | 21.6 / 23.8 / 25.8 / 26.5 | 2.9–5.2 | 15–30k | tall fastigiate crowns of upright grey twigs, grey-green bark `#777b71`, darker fissured foot |
| `nature_poplar_4` | poplar, `pollarded` | 11.6 | 2.3 | 4.0k | **опиленный тополь**: thick stem cut at ≈7.5 m, knuckled stubs with bristles of straight shoots, snow caps on the knuckles |
| `nature_poplar_5` | poplar, `pollarded` | 11.6 | 1.7 | 2.5k | short fresh shoots (recently cut) |
| `nature_poplar_6` | poplar, `pollarded` | 14.4 | 3.1 | 7.6k | forked stem, two cut heads |
| `nature_poplar_7` | poplar, `pollarded` | 17.5 | 1.9 | 3.3k | one leader allowed to grow back |
| `nature_maple_0..2` | maple, `norway` | 10.3 / 12.3 / 13.3 | 4.0–8.4 | 6–22k | forked at 2.5–4 m, round crown, opposite branching |
| `nature_maple_3..5` | maple, `negundo` | 8.4 / 9.1 / 10.5 | 4.4–6.1 | 8–14k | ash-leaved maple: 2–4 leaning crooked stems, hanging chains of dry seed keys |
| `nature_linden_0..5` | linden | 11.8–18.3 | 3.6–4.7 | 5.5–15.6k | straight stem, upright oval crown of zig-zag twigs; `_1`, `_3` have a **whitewashed** foot (побелка); some have suckers at the foot |
| `nature_apple_0..4` | apple | 4.4–6.4 | 2.9–5.0 | 2–3.7k | low fork, gnarled limbs, water sprouts, a few dried apples (dark red); all but `_3` whitewashed |
| `nature_spruce_0,1,3` | spruce, `green` | 7.8 / 10.3 / 15.3 | 2.2–4.2 | 3.7–15k | dark conical tiers, snow on every tier (single 25 cm model) |
| `nature_spruce_2` | spruce, `green` | 12.8 | 3.2 | 9.5k | courtyard spruce with a bare dry skirt (lower branches dead) |
| `nature_spruce_4,5` | spruce, `blue` | 9.3 / 13.3 | 2.6–3.4 | 5.7–11.6k | blue spruce (by the school), more regular |
| `nature_rowan_0..3` | rowan | 6.6–9.4 | 1.4–3.5 | 1–3.6k | slender, ascending; drooping 15–25 cm clusters of dark red berries (the only saturated red — use sparingly) |
| `nature_sapling_0` | sapling | 3.1 | 0.7 | 0.5k | young tree tied to one wooden stake |
| `nature_sapling_1` | sapling | 3.8 | 1.7 | 1.0k | young birch with stake |
| `nature_sapling_2` | sapling | 4.0 | 0.7 | 1.0k | three stakes with crossbars (typical municipal planting) |
| `nature_sapling_3` | sapling | 4.4 | 0.6 | 0.6k | two slanted stakes, whitewashed stem |

(The `_crown` model of each deciduous variant has the same name plus `_crown`; saplings and
spruces have none.) Saplings are built entirely from fine 12.5 cm voxels and do not collide.
Pivot of every tree = trunk axis at ground level; trunks extend 0.5 m below the pivot (roots in
the snow) so nothing floats on uneven ground.

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
- Handle: `{ placement, crown, species, kind, name, x, y, z, height, crownR, perches(),
  snowSpots(), remove() }`. `placement` is the trunk, `crown` the fine crown placement (null for
  spruces/saplings). `perches()` returns world points (THREE.Vector3) on top of branches where a
  crow can sit. `remove()` takes trunk and crown out of the world.
- Placement tags: trunk `'tree'` (`userData: { species, kind, nature: true }`), crown
  `'tree_crown'` (`userData.trunk` = the trunk placement).

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

Bushes (lilac, currant, snowberry) are built from **fine 12.5 cm voxels** (a 25 cm-thinned LOD
beyond 32 m); weeds, reeds and cattails from **6.25 cm voxels** (a stalk is a centimetre or two
thick; at 25 cm a stand of them reads as a fence of boards). These fine models **do not collide** —
the player can push into a bush or a reed bed. A hedge segment is two models: solid 25 cm stems
every 0.5 m (`nature_hedge*`, they keep the player out) and the clipped twig mass with its snow
cap in 12.5 cm voxels (`nature_hedge*_twigs`) — always use `placeHedge`. Weeds/reeds cull at
75–110 m, bushes at 140 m, hedges at 160 m. Seed heads of burdock, tansy and cattail carry tiny
snow caps.

| model | size w×h×d m (bbox) | notes |
|---|---|---|
| `nature_lilac_0..2` | ≈3–3.6 × 3.5–3.6 × 3.4–4 | сирень: 7–11 upright grey stems fanning out, dry brown panicles, snow on tops |
| `nature_currant_0..1` | ≈3–3.5 × 1.9 × 2.8–3.6 | low arching bush |
| `nature_snowberry_0..1` | ≈2.9–3 × 1.9–2.1 × 2.8 | снежноягодник: fine twigs with clusters of white berries |
| `nature_hedge` + `nature_hedge_twigs` | 2 m long (local X) × 1.0 m high × 0.75 m | clipped hedge segment, flat snow cap, shoots the shears missed |
| `nature_hedge_low` + `_twigs` | 2 × 0.75 × 0.75 | |
| `nature_hedge_gap` + `_twigs` | 2 × 1.0 × 0.75 | trampled dip in the middle (still blocks) |
| `nature_weeds_grass_0..2` | ≈2.3 × 0.8–0.95 × 2.1–2.8 | dry grass tufts poking out of snow (straw) |
| `nature_weeds_burdock_0..1` | ≈2.3 × 2.2–2.4 × 1.8–2.7 | dark burdock stalks with small burr clusters |
| `nature_weeds_tansy_0..1` | ≈2–2.6 × 1.6–1.7 × 2.2–2.5 | tansy with small flat brown heads |
| `nature_reeds_0..2` | ≈2.7–3.1 × 2.5–2.6 × 2.6–3.1 | reed stand with plumes, some stalks broken |
| `nature_cattail_0..1` | ≈1.8–2 × 1.8 × 2.3–2.5 | рогоз with brown heads |

```js
placeBush(ctx, { x, z, kind: 'lilac' | 'currant' | 'snowberry', variant?, rot? | angle?, seed? })   // → placement (tag 'bush')
placeHedge(ctx, { x0, z0, x1, z1, low?, damaged = 0.08, seed? })   // → stem placements (tag 'hedge'; twigs tagged 'hedge_twigs'), any direction
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
- reed/cattail clumps in patches along the shore (thicker on one side) and dry grass on the slope;
- a trodden `snow_packed` path ring at ≈1.42× radius with an old footprint trail, plus a trail of
  footprints straight across the ice;
- the sign **«ВЫХОД НА ЛЁД ЗАПРЕЩЁН!»** (*Walking on the ice is prohibited!*) — signed
  «Управа района «Восточный»» (*Vostochny District Council*) — on `nature_sign_post` at the
  shore, facing away from the pond, readable (interaction «Читать», tag `notice`).

Keep the area within `1.5 × max(rx, rz)` of the centre free of other objects (the path ring sits
at ≈1.42×). Pass `avoid` to keep reeds/path off specific spots. The package plays `ice_crack`
now and then (at most every 25 s) while the player walks on pond ice. Registered in
`ctx.registry.ponds`.

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

All three snow helpers limit the step between neighbouring terrain columns to 0.5 m by raising
the lower one (a snow apron). The engine draws the part of any deeper terrain drop in dark
concrete, which would make steep snow read as masonry terraces.

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
| `nature_snow_chunk_0..3` | 0.5–1.25 lumps (bbox 1.25–2 m incl. padding) | packed dirty snow chunks (solid); place with `yOffset: -0.1` |
| `nature_buried_yolka` | 3 × 2 × 1.75 | discarded New Year tree lying at an angle, tinsel, one red bauble (non-colliding) |
| `nature_buried_tire` | 1 × 1 × 0.5 | tyre standing half-buried |
| `nature_buried_sled` | 0.5 × 1.25 × 0.75 | kids' sled sticking up (seat uses `paint` → pass `tint`) |
| `nature_buried_ski` | 0.25 × 2 × 0.25 | ski stuck upright (`paint`) |
| `nature_buried_chair` | 0.75 × 1.25 × 0.75 | wooden chair upside down |
| `nature_buried_pallet` | 1.25 × 0.75 × 0.5 | pallet edge |
| `nature_sign_post` | 1.5 × 2.75 × 0.5 | two steel posts + board 1.5 × 1.0 m at 1.5–2.5 m; board front = local −Z (rot 0 faces north); the pond sign text is drawn on it via `ctx.signs` (150 px/m) |

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

Hooded crows (серая ворона: grey body, black head/wings/tail) at real size (≈0.5 m long, ≈0.95 m
across the wings), built from fine ≈4.3 cm voxels so they read as birds; at a distance they are
small dark shapes, as real crows are. They perch, turn, caw now and then (`crow_caw`), and when the player comes
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
(≈0.5 m long, ≈0.3 m tall perched, wingspan ≈0.95 m; forward = local +X, pivot at the feet /
body centre for flight). Tree perches are on top of branch voxels (feet on the wood).

---

## 7. Plastic bag in a tree — `addBag(ctx, o)`

A white/pale plastic bag (пакет) snagged on a branch, fluttering in gusts and hanging limp in the
lulls (two fine-voxel frames, `nature_bag_hang` / `nature_bag_blown`, tint = bag colour).
`o: { tree (handle) | x, y, z, color, seed }` — with a tree it hangs from one of its branches 2.5–7 m
up. Use one or two in the whole city (a birch by the garages, the park).
```js
addBag(ctx, { tree: placeTree(ctx, { x: 120, z: 160, species: 'birch' }) })
```

---

## 8. Falling snow clumps (automatic)

While the player is outdoors, every ~0.5–1.5 min a clump of snow (`nature_snow_clump`, ≈35 cm,
12.5 cm voxels, dynamic)
slides off a snowy branch of a package tree within ~22 m — preferably one the player is facing —
trailing powder, and lands with `snow_fall_branch` and a puff. `dropClump(ctx, tree)` triggers one
on demand. Works for every tree placed with `placeTree`/`scatterTrees`/`placeTreeRow`.

---

## Sounds called (registered by the `audio` package)
`crow_caw`, `crows_takeoff`, `snow_fall_branch`, `ice_crack` (all positional, guarded: nothing
happens if audio is not ready or the sound is missing).

## Tags & registry
- Placement tags: `tree` (trunks), `tree_crown`, `bush`, `hedge` (stems), `hedge_twigs`, `weeds`,
  `reeds`, `snow` (chunks), `buried`, `sign`, `crow`, `clump`, `bag`.
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
- Budget: a big deciduous tree is 5–30k triangles at LOD0 (crown in 12.5 cm voxels within
  ≈46 m), ~⅓ at LOD1 (to ≈120 m), ~1/10 beyond. Tall natural poplars (`poplar_2/3`, 25–30k) and
  the 3-stem birch clump (`birch_5`, 28k) are the heaviest: use them as accents. A park of 300
  trees is fine; avoid more than ~40 trees within 45 m of any viewpoint. Each deciduous tree is
  two placements (trunk + crown), i.e. two instanced draw calls per variant and LOD in view.
- `ctx.registry.trees` handles keep working after `world.finalize`; `tree.remove()` removes both
  placements (anomaly/layout use).
- Call `snowBank` after painting roads (it reads road materials to find the dirty side).
- Steam on every street manhole that sits on a heating main; a `chimney` plume on the boiler house;
  `vent` at a few basement vents (a cat sits by one, see `life`).
