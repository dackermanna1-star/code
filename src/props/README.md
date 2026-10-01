# Props (`src/props/`)

Procedural voxel props for the alley. Every generator is registered in `PROPS` (`catalog.js`):

```js
import { PROPS } from './props/catalog.js';
const res = PROPS.dumpster(new RNG(seed), { color: 'brown', overflow: 0.6 });
// res = { model: VoxelModel, parts?: [...], meta: {...} }
```

All randomness comes from the `rng` argument (and per-voxel hashes seeded from it): the same seed
and opts always give the same prop. Nothing uses `Math.random`.

## Files

| file | contents |
|---|---|
| `catalog.js` | `PROPS` registry (name -> generator) |
| `kit.js` | builder `VB` (grid + palette + placement), material presets `mat`, variants `V`, shapes (lathe, torus, extrude, blob, fieldFill), weathering (`grime`, `rust`, `mottle`, `streaks`, `chips`, `dent`), paint/text rasterization (`applyPaint`, `projectFace`, `textMask`), part composition (`addProp`, `rot`, `restPos`, `repivot`), fast value noise |
| `containers.js` | dumpster, trashCart, metalCan, plasticCan |
| `bags.js` | trashBag, plasticBag |
| `sheets.js` | cardboardSheet |
| `clutter.js` | cardboardBox, flatCardboard, pallet, palletStack, mattress |
| `misc.js` | shoppingCart, bucket, paintCan, tire, brokenChair, plasticChair, greaseBin, rubble, milkCrate, crateSeat, mopBucket, cigaretteCan, newspaperBox, bicycleFrame, shoesOnWire |
| `debris.js` | can, bottle, glassShard, cup, foodBox, paperScrap, cigaretteButt, bottleCap, leaf |
| `wall.js` | electricMeter, meterBank, gasMeter, junctionBox, conduitRun, downspout, acUnit, exhaustFan, dryerVent, wallVent, hvacCondenser, sign |
| `lamps.js` | cageLamp, rlmLamp, wallPack, bulkhead, fluoroFixture, cobraHead |
| `openings.js` | windowSash, windowBars, boardedWindow, door, rollupDoor, garageDoor, slidingDoor, stoop, bollard |
| `structures.js` | fireEscape, utilityPole, rearPorch, woodFence, chainLinkFence, rooftopHVAC, ventStack, chimney, satelliteDish, antenna |
| `chainlink.js` | `makeChainLinkTexture()` alpha texture for chain-link mesh panels |

## Conventions

**Result.** `{ model, parts?, meta }`.

* `model` - `VoxelModel` (grid, palette, voxelSize, origin). It may be an *empty* 1-voxel model
  (`emptyModel()`, zero triangles) when all geometry lives in parts (fire escape, pole, porch,
  leaning mattress, tipped chairs...). `StaticBatcher.add` already skips empty geometry.
* `parts` - `[{ name, model, position:[x,y,z], rotation:[rx,ry,rz] (Euler XYZ, radians), emissive?, animate? }]`
  in the prop's local frame. Besides emissive and moving parts, parts are used for **rotated
  sub-objects** (lids at an angle, flaps, leaning boards, stair stringers, braces, bags heaped in
  a dumpster, bricks in a rubble pile...) so diagonals stay straight instead of stair-stepping.
  Static parts can be batched like the main model (transform = prop matrix * part matrix).
* `meta` - always `size:[w,h,d]` (m), `mount`, `kind`; `footprint:[w,d]` (centred collision
  rectangle) for floor props; plus the prop-specific fields listed below.

**Mount / origin** (`meta.mount`):

* `floor` - origin at the centre of the footprint at ground level (y = 0); front faces +Z.
* `wall` - origin on the wall surface (back plane z = 0), bottom centre of the attachment unless
  stated; extends toward +Z, +Y up.
* `opening` - insert for a facade opening: origin at the bottom-centre of the opening at the
  recess plane (z = 0 = back of the frame, flush against the recess bottom); spans
  x in [-w/2, w/2], y in [0, h]; extends toward +Z.
* `wire` - hangs from an overhead wire; origin = contact point on the wire.

**Voxel sizes.** `VS_MED` (2.708 cm): dumpster, trashCart, trashBag (default), greaseBin, fireEscape,
utilityPole, rearPorch, woodFence, rooftopHVAC. `VS_FINE` (1.354 cm): everything else.
`VS_FINE/2` (`VS_XFINE`, 6.8 mm) only for tiny debris (cigaretteButt, bottleCap, leaf, glassShard,
flat paper, the butts heap of cigaretteCan), the grease stain decal and **sign faces** (legible text).

**Emissive parts.** Bulbs, lenses and tubes are separate parts with `emissive: true` (class
`EMISSIVE`, warm colours). `meta.anchors.light` = light position, `meta.anchors.lightDir` = unit
direction, `meta.lightColor` = suggested colour (hex).

**Animated parts.** `animate: 'spin-y' | 'spin-z' | 'sway'`, pivot = the part's origin
(`position`). Fans/turbines spin about their own axis; `shoesOnWire` parts all pivot at the wire.

**Paint (graffiti).** Props with large flat faces accept `opts.paint`:
a canvas / OffscreenCanvas / ImageData / `{ color: canvas }` (RGBA, alpha = coverage) which goes
on the primary face, or an object `{ front, left, right, back }` of canvases for several faces.
Sampling is box-filtered per voxel, alpha threshold 0.35, colours quantized (step 12) into
palette entries derived from the painted voxel's entry. `meta.paintSurfaces` lists the faces and
their size in meters (`{ front: { w, h, face: '+z' }, ... }`) so canvases can be generated at the
right aspect ratio (e.g. with `generatePropPaint({ widthM: w, heightM: h, kind })`). The pole's
surface is `wrap` (periodic in x = around the pole, lower 2.6 m).

**Glass.** Window/door glass is not voxelized: panes are empty and listed in `meta.panes`
`[{ x, y, w, h, z, sash?, broken?, frosted?, screen?, wired?, open? }]` (local meters; x, y =
lower-left; z = glass plane depth). `broken` panes have jagged voxel shards left in the frame
(skip the glass); `open` = no glass at all (raised sash gap, open vent, open roll-up/sliding door:
render a dark interior there); `screen` = insect screen / screen door mesh; `wired` = wired glass;
`frosted` = obscure glass.

**Chain-link mesh.** Not voxelized (a voxel diamond lattice costs >100k triangles). `chainLinkFence`
returns `meta.meshPanels = [{ x0, x1, y0, y1, z, gate?, ajar? }]`; fill them with an
alpha-tested quad textured with `makeChainLinkTexture()` (`chainlink.js`; tile =
`canvas.metersPerTile` = 0.2 m). Thin wires vanish with alphaTest + mipmaps: the preview uses
`generateMipmaps = false`, `alphaToCoverage: true` (MSAA on) - alpha-preserving mips also work.

## Prop reference

Unless noted, every option is optional and randomized from `rng` when omitted.

### A. Hero clutter

| prop | opts | size (m) / notes |
|---|---|---|
| `dumpster` | `color` 'brown'\|'green'\|'blue'\|'grey'\|[r,g,b], `capacity` 2\|3\|4, `lidOpen` false\|true\|'left'\|'right'\|'both'\|'propped'\|radians, `overflow` 0..1, `wheels`, `rust` 0..1, `paint` (front/left/right/back) | 2.17 x 1.0-1.35 x 1.3 (fork pockets included). Front-load steel bin, sloped front, fork pockets, skids or casters, rim, hinges, dents, stencil label, rust/grime. Parts `lid0`/`lid1` (hinged at the back, `meta.anchors.lidHinge0/1`), overflow bags `bag#/..`, cardboard `card#`. Interior trash only when visible. |
| `trashCart` | `color` 'black'\|'green'\|'grey'\|'blue'\|'brown', `lidColor`, `lid` 'closed'\|'ajar'\|'open', `bag` (bag sticking out), `number` (house number painted on), `paint` (front/left/right) | 0.73 x 1.08 x 0.81, 95-gal cart; handle + wheels at the back (-Z). Part `lid` (+ `bag`). anchors `lidHinge`, `handle`. |
| `metalCan` | `lid` 'on'\|'off'\|'ajar', `dents` (count), `rust` 0..1 | dia 0.52, h 0.66. Galvanized, ribs, handles, dents, white rust. Part `lid` (on, ajar, or lying/leaning on the ground). |
| `plasticCan` | `color`, `lid` 'on'\|'off'\|'ajar' | dia 0.56, h 0.70. Vent channels, molded handles, contents when open. |
| `trashBag` | `color` 'black'\|'white'\|'clear'\|'grey'\|'green'\|'blue', `shape` 'stand'\|'lie'\|'slump', `size` (scale), `torn`, `vs` (default VS_MED; VS_FINE for hero bags, ~4x triangles) | ~0.5 x 0.6 x 0.45. Lumpy glossy film, gravity sag, creases, gathered neck, knot and ears (drawstring ties for white bags), torn spill. `meta.height`. |
| `cardboardBox` | `size` 'small'\|'medium'\|'large'\|'long'\|'produce'\|[w,h,d], `flaps` 'closed'\|'open'\|'torn', `wet` 0..1, `collapsed` 0..1, `print` | 0.3-0.9 wide. Parts `flap#` (hinged, rotated). Collapsed = sag, bulge, crushed corner. |
| `flatCardboard` | `count`, `lean` (sheets leaning on a wall, mount 'wall') | pile of flattened boxes, parts `sheet#`. |
| `cardboardSheet` | `w`, `d`, `wet`, `curl`, `vs` | single flattened box (used by others). |
| `pallet` | `broken`, `tone` 'fresh'\|'grey'\|'mixed' | 1.22 x 0.14 x 1.02 GMA pallet; stringers along X; broken: missing/split boards, part `pried`. `meta.height`. |
| `palletStack` | `count` 2-6, `leaning` (extra pallet on edge against the wall behind) | misaligned stack, parts `pallet#/...`. |
| `mattress` | `size` 'twin'\|'full', `lean` (default random), `color` | flat: mount 'floor', 1.37 x 0.2 x 1.9 (length along Z). lean: mount 'wall', empty model + part `mattress`. Stains, quilting, tear. |
| `shoppingCart` | `tipped`, `handleColor` | 0.6 x 1.0 x 1.1 wire cart (handle at -Z); tipped = on its side. |
| `bucket` | `color`, `contents` 'water'\|'sand'\|'butts'\|'empty'\|'paint', `pose` 'up'\|'side'\|'down' | 5-gal pail with bail. |
| `paintCan` | `lid`, `color`, `pose` 'up'\|'side' | 1-gal can, drips. |
| `tire` | `pose` 'flat'\|'stand'\|'lean'\|'stack', `bald` | dia 0.63; stand/lean = empty model + part `tire`; stack adds `tire#`. |
| `brokenChair` | `kind` 'wood'\|'office', `pose` 'side'\|'back'\|'upright' | part `chair` (+ loose `leg` for wood). |
| `milkCrate` | `color`, `upsideDown` | 0.33 x 0.28 x 0.33 dairy crate. `meta.height`. |
| `greaseBin` | `color`, `paint` (front), `stain` (default true) | 1.08 x 1.0 x 0.73 used-oil container, padlock, drain valve, grease drips; part `stain` = thin glossy decal on the ground. |
| `rubble` | `count`, `radius` | brick / half-brick / CMU pile; dust base in the model, pieces as parts. |

### B. Small debris (for instancing; `opts.variant` picks a deterministic variant)

| prop | variants | notes |
|---|---|---|
| `can` | 0 standing, 1-2 lying, 3 crushed, 4 run-over flat; `color` 'red'\|'blue'\|'silver'\|'green'\|'gold'\|'white'\|'black' | VS_FINE, ~100-400 tris |
| `bottle` | 0 beer, 1 wine, 2 40oz, 3 flask, 4 broken beer, 5 broken wine; `color` 'brown'\|'green'\|'clear'; `standing` | GLASS class, labels; `meta.length` |
| `cup` | 0 coffee cup (sleeve, lid), 1 crushed coffee cup, 2 fountain cup + straw, 3 red party cup, 4 crushed clear cup | |
| `foodBox` | 0 styrofoam clamshell, 1 open clamshell + food, 2 paper pail, 3 pizza box, 4 open pizza box (part `lid`), 5 black container | |
| `paperScrap` | 0 crumpled ball, 1 receipt, 2 wet flyer, 3 newspaper sheet, 4 napkin | |
| `cigaretteButt` | 0 straight, 1 bent, 2 half smoked | VS_XFINE |
| `bottleCap` | 0 flat, 1 bent, 2 upside down; `color` | VS_XFINE |
| `leaf` | 0 maple, 1 oak, 2 elm, 3 linden | VS_XFINE, muted wet autumn colours |
| `glassShard` | 0-3; `color` | VS_XFINE |
| `plasticBag` | 0-2 crumpled flat, 3 balled; `color` 'white'\|'grey'\|'black'\|'blue'\|'yellow' | VS_FINE |

All debris is cropped to its content, origin at the footprint centre on the ground. Rotate freely
around Y when scattering. Budget ~30-900 triangles (most < 600).

### C. Wall infrastructure (mount 'wall' unless noted)

| prop | opts | notes |
|---|---|---|
| `electricMeter` | `height` (box bottom, default 1.35), `conduit` 'down'\|'up'\|'none' | origin on the wall at **ground** level below the meter; anchors `meter`. |
| `meterBank` | `count` 3-6, `height` (wireway bottom, 1.0), `mastHeight`, `paint` | meters over a wireway, main disconnect, unit labels, service conduit up the wall (`anchors.serviceTop`); origin at ground. |
| `gasMeter` | `height` (meter bottom, ~0.45) | yellow riser from the ground, valve, regulator, outlet into the wall; origin at ground; anchors `meter`. |
| `junctionBox` | `size` 's'\|'m'\|'l', `conduits` ['down','up','left','right'], `stub` (m), `paint` | origin = bottom centre of the box (stubs extend below / sideways). |
| `conduitRun` | `length` (m), `axis` 'x'\|'y' | EMT with straps/couplings. axis 'y': x-centred, y 0..length; axis 'x': x-centred, y = 0 at the pipe bottom. |
| `downspout` | `height` (m), `style` 'rect'\|'round', `color` 'galv'\|'white'\|'brown'\|'grey'\|'black', `broken` | conductor head at the top, offset elbows, straps, kick-out shoe; origin at ground. anchors `outlet`, `head`. 'round' costs ~3x more triangles. |
| `acUnit` | `w` (opening width to fill with accordion panels), `color`, `protrude` (m) | **mount 'opening'** (same transform as the window insert); sits on the sill and protrudes ~0.42 m; use `windowSash` with `raised >= meta.height`. anchors `drip`. |
| `exhaustFan` | `style` 'louver'\|'fan', `size` | greasy kitchen exhaust with rain hood; 'fan' has part `fan` (`animate: 'spin-z'`). |
| `dryerVent` | `kind` 'flap'\|'louver', `color` | |
| `wallVent` | `w`, `h`, `material` 'alu'\|'rusty'\|'painted' | |
| `hvacCondenser` | `wallGap` (m) | **mount 'floor'**: condenser on a pad, coil fins, top grille, part `fan` (`spin-y`), line set toward -Z (`anchors.lineSet`). |
| `sign` | `kind` 'noParking'\|'privateProperty'\|'fireExit'\|'address', `text` (secondary line / address), `mount` 'wall'\|'pole' | legible canvas text at VS_XFINE, faded, bent corner, bolts, rust, stickers; origin bottom centre. |

### D. Lamps (mount 'wall'; emissive parts + `anchors.light` / `anchors.lightDir` / `lightColor`)

| prop | opts | emissive parts |
|---|---|---|
| `cageLamp` | `tilt` (rad), `color` 'black'\|'grey'\|'white'\|'rust', `bulbColor` | `bulb` (+ static `cage`) |
| `rlmLamp` | `reach` (m, 0.6), `shadeDia`, `shadeColor`, `bulbColor` | `bulb`; gooseneck arm, enamel dome dark outside / white inside; plate at y 0..0.17 |
| `wallPack` | `color`, `lens` 'sodium'\|'white' | `lens` (prismatic, front + underside) |
| `bulkhead` | `color` 'black'\|'white'\|'grey'\|'green', `bulbColor` | `glass` (ribbed) under an eyelid cage |
| `fluoroFixture` | `length`, `cracked`, `tubeColor` | `tubes` (bright) + `diffuser` (dim glow, missing chunks) |
| `cobraHead` | `reach` (m, 1.4), `rise` (m, 0.35), `lens` 'sodium'\|'led' | `lens`; origin = arm bracket on the pole surface (y = 0 bracket centre), arm toward +Z |

### E. Openings (mount 'opening' unless noted)

| prop | opts | notes |
|---|---|---|
| `windowSash` | `w`, `h`, `style` 'dh'\|'fe'\|'alu'\|'steel'\|'small', `color`, `raised` (m, lower sash raised), `lites` [cols, rows] per sash, `broken` [pane indices], `peel` 0..1 | dh/fe: painted wood double-hung, peeling paint; alu: horizontal slider + optional screen; steel: industrial multi-pane with broken/boarded/painted panes and an optional tilted vent (part `vent`); small: single frosted sash. `meta.panes` (indices = order of the list: top-to-bottom, left-to-right). |
| `windowBars` | `w`, `h` (opening), `color`, `style` 'straight'\|'scroll', `recess` | Security grille overlapping the masonry by ~5 cm. Without `recess`: mount 'wall', origin on the **wall face** at the opening's bottom centre. With `recess` (m): mount 'opening', geometry shifted by +recess so it shares the insert transform. |
| `boardedWindow` | `w`, `h`, `mount` 'reveal'\|'face', `recess` (default 0.2), `x` (sprayed X), `paint` | weathered plywood with screws, seams, delamination. |
| `door` | `w`, `h`, `style` 'steel'\|'steel2'\|'wood'\|'kitchen'\|'boarded', `color`, `hinge` 'left'\|'right', `paint` (leaf front) | steel: hinges, lever, deadbolt, kickplate, closer arm, dents; steel2: + wired vision lite (pane `wired`), latch guard; wood: raised panels, knob; kitchen: + aluminum screen door (panes `screen`); boarded: plywood. anchors `handle`. |
| `rollupDoor` | `w`, `h`, `color`, `open` (m raised), `paint` | curtain (slat relief as colour bands), side guides, hood box inside the top of the opening, bottom bar, padlocked hasp. |
| `garageDoor` | `w`, `h`, `color`, `windows`, `paint` | 4 sections with panel relief, hinges, handle, dents, peeling. |
| `slidingDoor` | `w`, `h`, `recess` (m, default 0.135), `open` (m), `kind` 'corrugated'\|'planks', `color`, `paint` | leaf on the **wall face** (z = recess) wider than the opening, overhead track with trolleys; slides along +X. |
| `stoop` | `w`, `steps` 1-5, `depth` (landing), `recess` (default 0.2), `rail` | **mount 'wall'**: origin on the wall face at ground; landing continues back into the door recess to z = -recess. `meta.topY` = landing height (raise the door insert by it). |
| `bollard` | `height`, `dia`, `color`, `lean` (rad) | **mount 'floor'**; leaning bollards are an empty model + part. |

### F. Large structures

| prop | opts | notes |
|---|---|---|
| `fireEscape` | `width` (4.4), `platformYs` (absolute deck heights, default [3.5, 6.8, 10.1]), `depth` (1.1), `dropLadder` (true), `roofLadder` (true), `stairWidth` | mount 'wall', origin on the wall at ground, platforms centred on x = 0. Empty model; parts `level#` (platform, slat deck, railings, treads, drop ladder + counterweight, roof gooseneck ladder) and rotated `brace#`, `stringer#`, `handrail#`, `handpost#`. `meta.platforms` [{y, x0, x1, z0, z1}], `meta.clearance` (lowest steel above ground), anchors `dropLadderBottom`. Black paint, mostly rusted (METAL_PAINTED + rust). |
| `utilityPole` | `height` (11-12), `baseDia`/`topDia`, `transformers` 0-3, `crossarms` 1-2, `armOffset` (m, default 0: shifts crossarms toward +Z; when > 0 their -Z end is clamped to z = -0.35), `streetlight` null\|'cobra', `streetlightY`, `reach`, `meterBox`, `paint` (wraps, `paintSurfaces.wrap`) | mount 'floor', origin = pole base centre. Local frame: wires run along X; crossarms span Z, bolted alternately to the +X / -X faces; +Z faces the alley centre (streetlight arm and secondary rack on +Z); transformer cans on +X / -X (third one lower on +X); nothing on the -Z side extends beyond 0.35 m from the axis (pole 0.45 m in front of a wall). Shaft = 12 rotated voxel staves (smooth silhouette, cheap), creosote butt, checks, staples and flyer scraps, tag, step bolts, ground molding, crossarms with braces + insulators, secondary rack, cans with bushings and drop leads, meter box. anchors: `primary` (crossarm insulator tops, sorted by z ascending), `wires` (primary + secondary-rack spools), `guy`, `light`/`lightDir` (with streetlight). |
| `rearPorch` | `width` (5), `depth` (2.6), `levels` (deck heights, default [1.2, 4.3, 7.4]), `stairSide` | mount 'wall'. Chicago wooden back porch: posts, beams, ledgers, joists, plank decks with seams/missing boards, railings with balusters, switchback stairs (rotated stringers, treads, handrails) incl. the flight to the ground. Built from many small parts. anchors `decks`. |
| `woodFence` | `length` (6), `height` (1.9-2.2), `gate`, `paint` | mount 'floor', runs along X centred on the origin; boards face +Z. Missing/broken boards, part `looseBoard`, part `gate` (may be ajar), moss, wet bottom. `meta.gate` {x0, x1}. |
| `chainLinkFence` | `length` (8), `height` (2.0), `gate`, `barbed`, `trash` | mount 'floor' along X; frame only + `meta.meshPanels` (see above). Part `gate`, padlocked chain when closed. |
| `rooftopHVAC` | | packaged unit on a curb, parts `fan#` (`spin-y`). |
| `ventStack` | `kind` 'pipe'\|'turbine'\|'mushroom', `height` | turbine head = part `turbine` (`spin-y`). |
| `chimney` | `height`, `w`, `bricks` [[r,g,b],...] | running-bond brick, concrete crown, clay flues, soot. |
| `satelliteDish` | `dia`, `aim` (rad), `color` | mount 'wall'; parts `dish`, `lnbArm`, `lnb`, `coax` (runs down the wall). |
| `antenna` | `height` (mast) | yagi + bowtie on a tripod mast. |

### G. Storytelling extras

| prop | opts | notes |
|---|---|---|
| `shoesOnWire` | | mount 'wire'; parts `shoe0/1`, `lace0/1` all `animate: 'sway'` pivoting at the wire (origin). |
| `bicycleFrame` | `wheel` (bent rear wheel) | mount 'wall': frame leaning on the wall, U-locked to a short pipe; parts `frame`, `wheel`, `pipe`, `lock`. |
| `newspaperBox` | `color`, `tipped`, `paint` | vending box on a pedestal, window (glass voxels), coin box. |
| `plasticChair` | `color`, `broken` | monobloc chair; broken = snapped leg, tipped (part `chair`). |
| `mopBucket` | `color` | yellow wringer bucket on casters, part `mop` leaning in it. |
| `cigaretteCan` | | coffee-can ashtray, part `butts` (VS_XFINE heap). |
| `crateSeat` | `color` | upside-down milk crate with a cardboard cushion; anchors `seat`. |

## Budgets (warm generation time, Node, median of 12 seeds; triangles with the current mesher)

Most props generate in < 10 ms; the heaviest: slidingDoor ~43 ms, chainLinkFence ~33 ms,
rollupDoor ~31 ms, dumpster ~24 ms, metalCan ~21 ms, fireEscape ~17 ms. Triangles:
fireEscape ~36k, dumpster ~25k (max ~39k with overflow), metal/plastic cans ~18-20k,
shoppingCart ~18k, slidingDoor ~16k, rearPorch ~15k, utilityPole ~7k, debris 30-900.

Curved / ribbed surfaces dominate the counts because `greedyMesh` never merges faces whose AO
corners are not all equal (every stair-step face of a curve). Merging such faces along the axis
where their AO pattern is constant is exact and cuts ~33% of all prop triangles (see the report).

## Preview tool

`node scripts/propshot.mjs out.png "dumpster,trashCart" "x,y,z,yawDeg,pitchDeg" 1100 620 "seed=3&spacing=2.6&exp=9"`
(`BASE` env var for the server). Extra query params (see the header of `tools/props-preview.js`):
`opts` (JSON per prop name, or arrays per occurrence), `cols`/`rowgap`, `rot`/`rots`, `light=studio`,
`wall=0`/`wallz`, `ref=1` (1.75 m figure), `fog=0`, `paint=fake|gen`, `cams=a;b;c` + `tcols`
(tiled multi-camera shots), `cam=auto:yaw,pitch[,zoom[,index]]` (auto framing), `layout=<json>`
(explicit placements `[{p, o, at, r, s}]`), `parts=0`, `lamps=0`, `panes=0`, `emit`, `wet`.
Wall/opening props are placed on the wall automatically; lamps get preview lights at their
anchors; panes are drawn as simple glass stand-ins; chain-link panels use `makeChainLinkTexture`.
`wall2z=<z>` adds a second wall (facing -Z) for alley-like `layout` scenes. Note: `layout` travels in
the URL - very large layouts (~100+ entries) exceed the dev server's URL limit.
