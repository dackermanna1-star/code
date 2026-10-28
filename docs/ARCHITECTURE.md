# Apartment Destruction Sim — Architecture

This is the master design document. Every module author must read it before writing code.
Verified engine API notes live in `docs/api-notes/*.md` — trust those over memory.

## 1. Pillars

1. **Everything is made of parts.** Every object, fixture and structural element is an
   *assembly* of convex *parts* (each with a physical material) joined by *bonds*
   (glue, screws, nails, welds, hinges, slides, mortar...). Nothing is a single
   indestructible mesh. Internal components exist (a microwave has a magnetron, a
   transformer, a turntable, a PCB; a wall has studs, insulation, pipes and wires).
2. **Damage is physical and cumulative.** Collision impulses and tool strikes are turned
   into energy, distributed by material stiffness, and spent on denting (ductile),
   cracking/chipping/breakout (brittle), splintering (wood), crumbling (gypsum/concrete)
   or bond failure. Local damage persists and accumulates (fatigue), so every hit matters.
3. **Real fracture, no model swaps.** Brittle parts are split at runtime with
   material-specific Voronoi patterns (radial glass webs, dicing tempered glass,
   grain-elongated wood splinters, ceramic chunks, crumbly drywall). Fragments are real
   rigid bodies that can fracture again. Pieces that are too small become micro-debris
   particles and dust (physically motivated cutoff, not an arbitrary limit).
4. **Satisfying feedback.** Material-aware layered audio with occlusion through
   (destructible) walls and room reverb, dust/splinter/spark/glass particles, camera
   shake, persistent debris, lights that die when bulbs break, water spraying from
   broken plumbing, sparks from electronics.
5. **Performance by design.** One draw call per rigid island (texture-array world
   material), sleeping physics, debris consolidation, micro-debris without bodies,
   budgets and quality presets.

Visual direction: late-PS2 low-poly geometry and 256 px photo textures with bilinear
filtering, elevated by modern rendering (PBR-ish lighting, cascaded sun shadows through
windows, SSAO, bloom, ACES tone mapping, light shafts, dust motes). Optional "PS2 mode"
post-process (480p, dithering, 15-bit colour).

## 2. Stack & conventions

* **Engine:** Babylon.js 9.30.0 (`@babylonjs/core`), physics: Havok (`@babylonjs/havok`
  1.3.14, Babylon Physics V2). WebGL2. Vite 8, TypeScript 7 (strict).
* **Imports:** always `import { X } from "@babylonjs/core";` (package root). Babylon 9
  replaces un-imported side-effect methods with *silent no-op stubs*; importing from the
  root registers every side effect. Never deep-import Babylon paths.
* **Relative imports include the `.ts` extension** (`import { clip } from "./clip.ts";`).
  This lets Node run pure modules' unit tests natively (`node --test tests/unit`).
* **Erasable TypeScript only** (`erasableSyntaxOnly`): no `enum`, no `namespace`, no
  constructor parameter properties. Use `as const` objects + union types.
* **Pure vs engine code.** `src/geom/**` and `src/destruction/model/**` (math, polytopes,
  fracture, damage formulas) must NOT import Babylon — they use `Vec3 = {x,y,z}` from
  `src/geom/vec.ts` and are unit-tested in Node. Engine glue lives elsewhere.
* **Units:** metres, kilograms, seconds, newtons, joules. **Y up.** Babylon is
  left-handed: +X east/right, +Z north/forward, +Y up. Gravity −9.81.
* **Randomness:** `src/core/rng.ts` seeded PRNG (mulberry32). Fracture patterns are seeded
  from (part id, impact point, energy) so behaviour is reproducible in tests.
* **No allocation in hot loops** where avoidable (reuse temp vectors), but clarity first.
* **Logging:** `console.warn` only for real problems. The smoke test fails on page errors.
* **File ownership:** each module has an owner during parallel work (see §14). Do not edit
  files you don't own; if you need a change in someone else's contract, write it down in
  your final report instead.

## 3. Runtime architecture

`src/main.ts` boots: creates the Babylon `Engine`/`Scene`, initialises Havok, builds the
`GameContext`, loads/generates assets behind a loading overlay, builds the apartment, then
starts the loop. `GameContext` (`src/core/context.ts`) is a plain service container passed
to every system:

```
ctx = { engine, scene, time, settings, rng, events,
        physics, render, materials, destruction, audio, vfx,
        input, player, world, hud, debug }
```

### Loop & timing (`src/core/time.ts`, `src/core/game.ts`)
* Fixed-step simulation at **60 Hz** (`FIXED_DT = 1/60`), decoupled from rendering through
  an accumulator (max 4 steps per frame, then drop time). Havok is stepped exactly once per
  fixed step with `FIXED_DT` (see physics API notes for the exact mechanism).
* Per fixed step, in order:
  1. `input` sampled (edge-triggered actions latched per frame, consumed by the first step)
  2. `player.fixedUpdate(dt)` (character controller, grab spring, tool swing sweeps)
  3. `destruction.beforePhysics(dt)` (joint motors, pry/pull stress)
  4. **physics step** (Havok), collision events buffered
  5. `destruction.afterPhysics(dt)` → processes buffered impacts → damage → fracture /
     bond breaks / splits (time-budgeted) → emits gameplay events
  6. `vfx.fixedUpdate(dt)` (micro-debris ballistic sim), features (water, sparks, lights)
* Per render frame: `player.update(frameDt)` (camera smoothing, viewmodel), `audio.update`,
  `vfx.update`, `hud.update`, `render.update` (light flicker, shafts), then `scene.render()`.
* `time.scale` supports pause (0) and brief hit-stop/slow-mo; tests can call
  `debug.step(n)` to advance n fixed steps synchronously.

### Event bus (`src/core/events.ts`)
Typed pub/sub decoupling destruction from audio/VFX/HUD. Event types are defined in
`src/core/events.ts` (`GameEvents` map). Main events: `impact`, `fracture`, `chip`,
`crack`, `dent`, `bondBreak`, `jointBreak`, `toolSwing`, `toolHit`, `footstep`, `grab`,
`throw`, `feature` (light broken, water leak, sparks, power change, screen broken).
Audio and VFX react only to events — they never poke destruction internals.

## 4. Destruction model (the heart)

### 4.1 Data model

Blueprints (pure data, produced by object builders):

* `PartDef` — name, physical material id, surface (appearance) id, convex shape
  (box / cylinder / prism / hull points / lathe tile...), transform in *assembly space*,
  optional grain axis (wood), tessellation hint (deformable sheets), features
  (light emitter, screen, water source...), tags, `supported` flag (sheet held by many
  fasteners → fails locally rather than snapping globally).
* `BondDef` — two part names (or `"world"`), kind (`glue|screw|nail|weld|bolt|dowel|
  press|clip|mortar|fused|hinge|slider|latch|friction`), strength (J), anchor point
  (assembly space). Joint kinds (`hinge`, `slider`) also carry axis + limits.
* `AssemblyDef` — named collection of parts + bonds + metadata (display name, category,
  monetary value for the "repair bill", room).

Runtime (`src/destruction/runtime/*`):

* `Part` — owns a `ConvexPoly` (collision + fracture source) in **island frame**, render
  geometry cache, dent list, crack list, local damage points, volume/mass/COM, list of
  bonds, owning `Island`, Havok child shape, features, fracture generation.
* `Bond` — parts a/b (b may be WORLD), kind, max strength, remaining health, anchor
  (island frame), optional physics constraint (joint kinds).
* `Island` — a rigid body: Babylon `TransformNode` + `PhysicsBody` (container of part
  shapes) + one batched opaque `Mesh` (+ optional glass/emissive meshes). STATIC when any
  part (transitively through rigid bonds) has an intact WORLD bond, else DYNAMIC.
* `Assembly` — parts, bonds, islands, metadata, aggregate damage stats.

**Frames.** All parts of an assembly live in one shared frame (the assembly frame at
spawn). Each island's node has a world transform; a part's coordinates never change when
islands split — the new island node simply starts at the parent island's current world
transform. Havok handles the COM offset (mass properties computed from child shapes with
material densities). Fragments are created in the same frame.

**Islands = connected components** of the *rigid* bond graph (all kinds except
`hinge`/`slider`). Joint bonds become Havok constraints *between* islands (or island ↔
world). A component containing a part with an intact WORLD bond is static.

### 4.2 Impacts → energy
Inputs:
1. Havok collision events (`COLLISION_STARTED`, impulse J above a threshold, plus strong
   `CONTINUED` spikes) between bodies we own.
2. Synthetic impacts from tools, fists, kicks, stomps, thrown/slammed held objects.

For an impact between sides A and B with normal impulse `J` (N·s):

```
μ = mA·mB/(mA+mB)          (static side → μ = m_dynamic; tools use their effective mass)
E = lossFactor · J² / (2μ)  (energy dissipated in the contact; lossFactor≈0.8)
shareA = kB/(kA+kB)         (k = material stiffness; the softer side absorbs more)
E_A = E·shareA ,  E_B = E·(1−shareA)
```
Tools add a *sharpness* multiplier (axe on wood ×2.2, on metal ×0.6) and a *contact
radius* (hammer 1.5 cm, sledge 3 cm, fist 4 cm, bat 3 cm, boot 6 cm) which feeds the
breakout model.

The hit **part** is found from the contact point: raycast child index when available,
otherwise nearest part (signed distance to its convex poly, accelerated by a per-island
grid/BVH of part AABBs for large islands).

### 4.3 Part response by failure mode
Each `MaterialDef` (see §5) defines `mode`:
`shatter` (annealed glass, ceramic, porcelain, stone), `dice` (tempered glass),
`splinter` (wood), `crumble` (gypsum, plaster, concrete, MDF/particleboard),
`crack` (rigid plastics, PCB), `bend` (sheet metal, solid metal), `soft` (fabric, foam,
rubber, paper).

Let `E` = energy delivered to the part, `D` = accumulated damage near the hit point
(sum of previous local energies with distance falloff, decaying slowly). Effective
energy `E_eff = E · (1 + fatigue·D/E_ref)`.

* **Global failure** (snap the whole part) if `E_eff ≥ E_global`, where
  `E_global = u_mat · V / clamp(aspect/6, 0.5, 4)` (u = strain-energy density at failure,
  V = part volume, aspect = longest/shortest extent; slender parts snap more easily).
  Not applied to `supported` parts (sheets, tiles on mortar) except glass.
* **Local breakout** otherwise: solve `E_eff = G_mat · 2π r · min(t, r)` for radius `r`
  (t = thickness along the impact normal). If `r ≥ r_min_mat`, fracture locally: seeds are
  clustered within `r` of the impact; fragments inside the breakout zone detach, the
  remaining large cells stay bonded to each other and inherit the original part's bonds
  (this is how holes appear in doors, drywall, table tops). If `r` exceeds ~60 % of the
  part's smallest in-plane extent → global failure instead.
* **Below thresholds:** accumulate local damage, spawn cracks (visual crack-line decals
  grown along the surface) once `E_eff` exceeds `crackFraction·E_threshold`, chips
  (tiny breakout → micro-debris) for ceramic/concrete, scuff/impact decals, and audio.
* **Glass** (`shatter` annealed): cracks first (radial crack overlay), then shatters the
  whole pane in a radial web around the impact; shards touching the frame stay attached
  through weak bonds (jagged glass left in the frame) and drop out later or when hit.
  **Tempered** (`dice`): stronger, but on failure the whole pane dices into hundreds of
  small cubes (micro-debris + some physical chunks). Edges are weaker (hits within 3 cm
  of an edge use ×0.3 threshold).
* **Bend** (ductile metal): no fracture; plastic dents. Dent radius
  `r_d = dentRadius_mat · (E/100)^(1/3)` (tool contact radius sets a minimum),
  depth `d = min(maxDent·size, E / (Y_mat · π r_d²))`, accumulated. Large accumulated
  deformation crumples the part globally (bending field) and loads its bonds (panels pop
  off at spot welds/screws). Extreme energy on thin sheet → `tear` into 2–3 pieces.
* **Soft**: elastic squash (render-only vertex spring-back over ~0.3 s), absorbs energy
  (high loss), never fractures from blunt hits; sharp tools tear (stuffing/feathers/foam
  particles + tear decal; heavily torn cushions split into chunks).

### 4.4 Bonds
Bond health is energy (J). An impact on part P damages each bond b of P:

```
direct:   E_b = E_P · w_b,  w_b ∝ (1 + |p − anchor_b| / size_P)⁻¹  (normalised over P's bonds)
inertial: E_b += J² · m_far / (2 · M_island²)   (m_far = mass on the far side of the bond)
```
times a kind factor (nails/screws weak in pull-out, glue weak to peel, hinges strong in
shear). Fracture of a part transfers its bonds to the fragment containing (nearest to) the
anchor; bonds whose anchor fragment detached are broken. A broken bond emits `bondBreak`
(screw "ping", nail "creak-snap", glue crack, weld snap, mortar crumble) and triggers an
island split check. **Joint bonds** additionally take damage from sustained pull forces:
the player's grab/pry force (known exactly) and impacts on the jointed part. Hinges in a
group: ≥2 intact → one hinge constraint along the axis through the intact hinges; 1 intact
→ ball-and-socket at that hinge (door hangs and sags); 0 → free. Latches are modelled as a
hinge motor holding angle 0 (`latch` bond breaks the motor permanently); doors opened with
the use key release the latch temporarily.

### 4.5 Splitting
After bond breaks: union-find over the island's live parts using intact rigid bonds. If
more than one component: the heaviest keeps the existing body (its container is rebuilt),
others get new islands. New velocities: `v = v_old + ω_old × (com_new − com_old)`,
`ω = ω_old`. Static components that lost their last world bond become dynamic. Render
batches of affected islands are rebuilt. Joint constraints whose parts changed island are
re-created.

### 4.6 Fracture (geometry, `src/geom/fracture.ts`)
Voronoi on convex polyhedra by successive half-space clipping (bisector planes, seeds
sorted by distance, early-out when a seed is farther than twice the cell radius).
Anisotropy (wood grain) = compute bisectors in a space scaled along the grain axis, which
yields cells elongated along the grain (splinters). Seed patterns per mode:
* glass: radial rays (6–12) with geometric radii + jitter around the impact, sparse far seeds;
* tempered: jittered grid over the whole pane (cell ≈ 2–3 cm);
* ceramic/stone: 4–12 seeds within the breakout radius + 1–3 far seeds;
* wood: seeds in an ellipsoid elongated along the grain (anisotropy 3–6);
* crumble: many small seeds near the impact (crumbs → micro-debris/dust) + medium chunks;
* crack (plastic/PCB): 2–5 seeds across the whole part.

Face attributes survive clipping: every face carries a planar UV map
(`uv = (p·U + u0, p·V + v0)`), surface id and tint, so exterior faces keep their texture
mapping exactly; new cut faces get the material's *interior surface* with a planar
projection. Optional per-vertex normals (smooth curved surfaces) are interpolated.
Output fragments carry volume, centroid, neighbour lists and shared-face areas (used for
bond strength between remaining cells).

Fragment classification: `micro` (largest extent < `minFragment_mat`, ~1.5–3 cm) →
micro-debris particle + dust; `loose` (inside breakout zone) → own island with an outward
kick (10–25 % of breakout energy as kinetic energy, along the impact direction with radial
spread); `remain` → stays bonded.

### 4.7 Deformation
Render geometry of deformable parts is tessellated (sheet cell ≈ 4 cm). Dents are stored
as a procedural field `{point, dir, radius, depth}` in island frame and applied whenever
render geometry is (re)built — fragments of a dented part keep their dents. Normals are
recomputed; colliders are refreshed from the deformed hull only for large global bends.

### 4.8 Budgets & debris
* Fracture/split work is queued and processed with a per-step time budget (default
  4 ms), always handling the most energetic requests first; impacts are applied
  immediately for responsiveness.
* Micro-debris: no physics bodies; ballistic sim with simple collisions against a cached
  height probe + bounce; thousands rendered by thin instances / SPS.
* Sleeping small debris islands are merged into per-cell static batch meshes after they
  sleep for 2 s (draw-call consolidation); they are restored when woken.
* Bodies falling below y = −30 (thrown off the balcony) are removed after a delayed
  distant-impact sound.
* Physical debris count is unbounded by design; quality presets only control micro-debris
  density, dust counts and consolidation aggressiveness.

### 4.9 Features (`src/destruction/features/*`)
Behaviours attached to parts, reacting to damage/destroy events:
`light` (Babylon light parented to the island; bulb part breaking → pop, sparks, light off;
damaged → flicker), `screen` (TV/monitor emissive dynamic texture; cracks → glitch, dead),
`water` (faucet/pipe/toilet supply/water heater: breaking spawns a continuous spray emitter
+ water sound + growing puddle decal), `sparks` (electronics, outlets, cables),
`power` (electrical panel; destroying it kills every powered light/screen), `stuffing`
(cushions/pillows/mattress release foam or feathers when torn), `liquid` (bottles splash),
`soil` (plant pots spill soil), `fan` (ceiling fan motor = hinge motor; blades fly off).

## 5. Physical materials (`src/destruction/model/materials.ts`)
Each `MaterialDef`: density (kg/m³), friction, restitution, stiffness k (relative),
mode, `u` (J/m³, global failure energy density), `G` (J/m², local breakout), `rMin`,
`crackFraction`, `chipRatio`, fragment count range, anisotropy, `minFragment` (m),
dent params (`dentRadius`, `Y`, `maxDent`) for ductile, sound + VFX profile ids, interior
surface id. Initial values (gameplay-tuned, physically ordered):

| id | ρ | k | mode | u | G | notes |
|---|---|---|---|---|---|---|
| glass | 2500 | 9 | shatter | 2 000 | 4 000 | window 4 mm pane ≈ 8–15 J |
| temperedGlass | 2500 | 9 | dice | 10 000 | 20 000 | edges ×0.3 |
| ceramic | 2400 | 8 | shatter | 3 000 | 9 000 | toilets, sinks, mugs, plates |
| tile | 2300 | 8 | shatter | 2 500 | 7 000 | supported |
| stone | 2700 | 10 | shatter | 15 000 | 60 000 | granite/marble |
| concrete | 2400 | 10 | crumble | 60 000 | 400 000 | very tough; craters |
| gypsum (drywall) | 700 | 3 | crumble | 250 | 11 000 | punch ≈ 6 cm hole, sledge ≈ 20 cm |
| plaster | 1100 | 4 | crumble | 400 | 15 000 | |
| softwood | 500 | 4 | splinter | 9 000 | 60 000 | studs, pine furniture |
| hardwood | 700 | 5 | splinter | 14 000 | 90 000 | oak/walnut |
| plywood | 600 | 4 | splinter | 8 000 | 40 000 | |
| mdf | 750 | 3.5 | crumble | 3 000 | 25 000 | cabinets, door skins (HDF) |
| particleboard | 650 | 3 | crumble | 2 000 | 18 000 | cheap furniture |
| steelSheet | 7850 | 7 | bend | — | — | appliance casings (Y≈1.4e6) |
| steel | 7850 | 10 | bend | — | — | tools, frames, pipes |
| aluminum | 2700 | 6 | bend | — | — | window frames |
| castIron | 7200 | 10 | shatter | 30 000 | 200 000 | grates, transformer core |
| copper | 8900 | 6 | bend | — | — | pipes, wires |
| plastic | 1050 | 2.5 | crack | 1 500 | 12 000 | ABS casings |
| acrylic | 1190 | 3 | crack | 1 200 | 9 000 | bathtub, panels |
| pcb | 1850 | 4 | crack | 2 500 | 15 000 | boards; sparks |
| lcd | 2500 | 9 | shatter | 1 500 | 3 000 | screens; spiderweb cracks |
| rubber | 1200 | 0.5 | soft | — | — | |
| fabric | 300 | 0.3 | soft | — | — | upholstery, curtains |
| foam | 40 | 0.2 | soft | — | — | cushions, mattress |
| paper | 700 | 0.8 | soft | — | — | books (tear) |
| cardboard | 250 | 1 | soft | — | — | boxes |
| insulation | 30 | 0.1 | soft | — | — | fibreglass batts |
| soil | 1300 | 0.5 | soft | — | — | |
| food | 950 | 0.6 | soft | — | — | fruit etc. |

## 6. Rendering
* **World material** (`src/render/worldMaterial.ts`): one shared PBR (or Standard)
  material with a material plugin that samples **texture arrays** (albedo+roughness,
  normal) using per-vertex attributes: `surf` (vec4: albedo layer, normal layer,
  roughness scale, metallic) and vertex colour (tint). All opaque destructible geometry
  uses it, so an island is one draw call. Glass uses a separate transparent material;
  emissive screens/bulbs separate materials.
* **Surfaces** (`src/render/surfaces.ts`): `SurfaceId` → texture layers, tint, roughness,
  metallic, texture world size. Textures come from `public/assets/textures` (CC0 photo,
  256 px) plus procedural canvas textures (labels, screens, book covers, posters, PCB,
  wallpaper patterns).
* **Batching** (`src/render/batch.ts`): builds an island mesh from its parts' render
  geometry (positions, normals, uvs, colour, surf); incremental rebuild on change.
* **Lighting** (`src/render/lighting.ts`): golden-hour sun (directional, cascaded shadows
  through windows), sky hemisphere fill, interior lights owned by `light` features (room
  assignment to respect per-material light limits), flicker, global power state.
* **Post** (`src/render/postfx.ts`): ACES tone mapping, bloom, SSAO, FXAA, subtle grain
  and vignette, camera shake/impact flash, optional PS2 mode.
* **Exterior** (`src/render/exterior.ts`): gradient sky + sun disc + clouds, low-poly
  city with emissive window textures, our tower's facade, street far below, haze.
* **Light shafts & dust motes** (`src/render/atmosphere.ts`): PS2-style additive shaft
  meshes from window openings along the sun direction + floating dust particles.

## 7. Audio (`src/audio/*`)
Raw Web Audio graph owned by us: voices (AudioBufferSourceNode → gain → lowpass
(occlusion) → HRTF PannerNode → room reverb send + dry) → bus compressor/limiter → out.
Sound bank: CC0 samples (`public/assets/sounds`) layered with **procedurally synthesised
variants generated at startup** (modal synthesis scaled by object size: frequency ∝
size⁻¹, material-specific partial ratios/decays; granular shatter/crumble/crackle
generators). Each event picks layers by material + intensity + size, randomises
pitch/gain, rate-limits per body and globally (voice cap ≈ 48, priority by loudness).
**Propagation:** occlusion by raycasting listener→source against structural bodies —
holes punched in walls and opened/destroyed doors change what you hear; reverb send by
source/listener room (tiled bathroom long & bright, bedroom dead). Ambience: city hum,
wind through broken windows, fridge hum, water spray loops, electrical buzz.

## 8. VFX (`src/vfx/*`)
Pooled particle systems per effect (dust puff, drywall dust cloud, concrete dust, wood
splinters, sparks, glass glitter, water spray/drips, smoke, feathers, foam crumbs, paper
scraps, soil) with an API `vfx.burst(kind, pos, normal, intensity, tint?)` and continuous
emitters `vfx.emitter(kind, node, localPos, dir)`. Micro-debris system for tiny
fragments. Decals: impact marks, crack lines, scorch, water puddles.

## 9. Player, interaction, tools (`src/player/*`)
* Havok character controller capsule (1.8 m, r 0.3), walk 3.6 m/s, sprint 6, crouch 1.6,
  jump. Footsteps by floor material. Landing on objects applies stomp damage.
* **Controls:** WASD move, mouse look (pointer lock; drag-to-look fallback), Space jump,
  Shift sprint, C crouch, LMB use tool (hold = charged power strike), RMB grab/drop,
  while holding: LMB throw (hold to charge), wheel distance, R + mouse rotate, F slam;
  F kick (empty-handed or with tool), G stomp, E use (open/close doors and drawers,
  switches, TV, faucets), 1–7 select tool, Q drop tool, Esc pause, F3 debug.
* **Grab:** physics-based hold (force-capped spring towards a target in front of the
  camera; strength ≈ 450 N so heavy objects can only be dragged/tilted). Pulling on parts
  of static islands or jointed parts stresses their bonds (rip doors off hinges, tear
  cabinets off walls). Throw energy capped (~250 J) → velocity depends on mass.
* **Tools** (physical objects too): fists, claw hammer, sledgehammer, crowbar (strike +
  alt-pry: leverage on nearby bonds), baseball bat, axe (sharp), fire extinguisher
  (spray pushes light objects; can burst). Swings are procedural arm animations; hits are
  detected by sphere-sweeping the tool head each fixed step and resolved as physical
  impacts (effective mass × head velocity, momentum transferred to dynamic targets,
  recoil and hit-stop on hard targets).

## 10. The apartment (`src/world/plan.ts`)
Corner unit on the 31st floor. Interior x ∈ [0, 12.8], z ∈ [0, 8.8], floor y = 0,
ceiling 2.7 m. South (z = 0) and east (x = 12.8) walls are exterior concrete with windows
(golden-hour sun from the west-south-west); north (z = 8.8) is the party wall to the
building corridor with the front door; west (x = 0) is the party wall to the neighbour.
Concrete shell 0.2 m; slab floor/ceiling concrete. Partitions: 12.5 mm drywall both sides
of 90 mm wood studs @ 400 mm, insulation in bedroom walls, plumbing in the bathroom /
kitchen / utility walls, wiring to every outlet and switch.

| room | x | z | notes |
|---|---|---|---|
| Master bedroom | 0 – 4.0 | 0 – 4.4 | south window; bed, nightstands, dresser, wardrobe, mirror |
| Living / dining | 4.0 – 9.2 | 0 – 5.0 | balcony sliding door + window; sofa, armchair, TV wall (x = 4.0), coffee table, shelves, dining set, ceiling fan |
| Bedroom 2 | 9.2 – 12.8 | 0 – 4.4 | south + east windows; bed, desk + PC, office chair, bookshelf, guitar |
| West hall | 0 – 4.0 | 4.4 – 5.6 | opening to living at x = 4.0 |
| Bathroom | 0 – 2.5 | 5.6 – 8.8 | tub + tempered shower panel, toilet, vanity, mirror cabinet, tiles |
| Utility / laundry | 2.5 – 4.0 | 5.6 – 8.8 | washer, dryer, water heater, shelves, toolbox |
| Kitchen | 4.0 – 9.2 | 5.0 – 8.8 | open to living; L-shaped cabinets on north wall, fridge in NE corner, range, dishwasher, sink, peninsula with stools |
| Foyer / east hall | 9.2 – 12.8 | 4.4 – 8.8 | front door (north wall x 10.4–11.4), electrical panel, coat closet, console table |
| Balcony | 4.4 – 9.0 | −1.6 – −0.2 | concrete slab, tempered glass railing, chairs, plants, AC condenser |

Partition walls (centre lines): x = 4.0 (z 0–4.4 solid; z 4.4–5.6 open; z 5.6–8.8 solid,
plumbing), z = 4.4 (x 0–4.0, master door x 2.8–3.7), z = 5.6 (x 0–4.0, bath door
x 1.4–2.2, utility door x 2.85–3.65), x = 2.5 (z 5.6–8.8, plumbing), x = 9.2 (z 0–4.4
solid; z 4.4–8.8 with cased opening z 4.6–5.8), z = 4.4 (x 9.2–12.8, bedroom-2 door
x 9.6–10.5). Windows: master south x 1.0–3.0; living sliding door x 5.0–7.4, window
x 7.8–8.8; bedroom-2 south x 10.2–11.8 and east z 1.4–3.0. Sill 0.9 m, head 2.2 m.

## 11. Performance budgets & quality
Target 60 fps on a mid-range desktop GPU at 1080p with ~300 awake bodies and thousands of
sleeping debris pieces. Budgets per fixed step: physics ≤ 5 ms, destruction ≤ 4 ms,
micro-debris ≤ 1 ms. Presets (Low/Medium/High/Ultra) control resolution scale, shadows,
SSAO, bloom, particle density, micro-debris density, consolidation. Debug overlay (F3)
shows fps, frame/physics/destruction ms, draw calls, bodies (awake/asleep), islands,
parts, debris, voices.

## 12. Debug & tests
`window.__sim` (`src/debug/api.ts`): `ready`, `step(n)`, `stats()`, `listAssemblies()`,
`findAssembly(name)`, `hit({assembly|point, tool, energy, dir})`, `spawn(type, pos)`,
`teleport(pos, yaw, pitch)`, `setTool(id)`, `grab()/throw()`, `screenshotPose(name)`,
`setQuality()`, `seed()`. Tests:
* `node --test tests/unit` — pure geometry/fracture/damage/material tests.
* `node tests/probe.mjs <file>` — ad-hoc runtime probes in headless Chromium.
* `node tests/smoke.mjs` — full game boots, no page errors, renders.
* `node tests/scenarios.mjs` — scripted destruction scenarios (hit every object type,
  verify fracture/splits/bond breaks/audio/vfx events, perf stress) + screenshots.

## 13. Content construction rules (object builders)
Builders live in `src/objects/**` and only produce `AssemblyDef`s through the builder DSL
(`src/objects/lib/builder.ts`). Rules:
* Model real construction: panels with thickness, internal components, fasteners where
  they really are. Hollow things are hollow (thin walls), not solid blocks.
* Real dimensions and plausible masses (the DSL reports the computed mass; tune with
  materials, not magic numbers).
* Parts must be convex (use the DSL's lathe/arc/tile helpers to build curved shells from
  convex tiles bonded with `fused` bonds of the material's strength).
* Keep part counts reasonable: small objects 3–20 parts, appliances 20–80, structure
  pieces as needed. Tiny greebles (screws) are visual-only details inside a part's
  texture, not parts.
* Attach things the way they are attached: cabinets screwed to wall studs, toilet bolted
  to the floor, TV on a wall mount or stand, pictures hanging on a nail (weak bond).

## 14. Module ownership (parallel phase)
| path | owner | notes |
|---|---|---|
| `src/core/*` | orchestrator | context, events, time, rng, settings contracts |
| `src/geom/*` | geometry agent | pure: vec, ConvexPoly, clipping, Voronoi fracture, hull, primitives, triangulation, dents, crack lines |
| `src/physics/*` | physics agent | Havok init, fixed step, layers, body/shape/constraint helpers, queries, collision event normalisation |
| `src/destruction/**` | destruction agent | materials, runtime model, damage, fracture glue, splits, joints, features framework, debris consolidation |
| `src/render/*` | render agent | textures, surfaces, world material, batching, lighting, post, exterior, atmosphere |
| `src/audio/*` | audio agent | engine, synthesis, bank, propagation |
| `src/vfx/*` | vfx agent | particles, micro-debris, decals |
| `src/player/*`, `src/ui/*` | player agent | controller, input, camera, grab/throw, tools, viewmodel, HUD |
| `src/objects/lib/*` | builder agent | DSL + reference objects |
| `src/objects/<room>/*`, `src/world/*` | content agents | apartment structure + furnishing |
| `src/debug/*`, `tests/*` | QA agent | debug API, scenarios |

### Handedness rule (added after the builder-kit review)
Babylon is left-handed. Standing in FRONT of an object (looking along −Z of the object toward its
+Z-facing front), the object's −X side is on the viewer's RIGHT. Kit left/right names are axis-based:
`left` = −X, `right` = +X. Liquid/water features on tiled vessels should be attached to the base tile.
