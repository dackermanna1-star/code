# Brief: destruction runtime (`src/destruction/**` except `model/`)

Owner paths: `src/destruction/destructionSystem.ts`, `src/destruction/runtime/**`,
`src/destruction/features/**`, `tests/unit/destruction-*.test.ts`, `tests/probes/destruction-*.probe.ts`.
Consumes (implemented concurrently by other agents — code against the contracts, poll before
runtime testing): `src/geom/**` (geometry), `src/destruction/model/damage.ts` (damage model),
`src/physics/physics.ts` (PhysicsSystem), `src/render/*` (RenderSystem.buildIsland, Lighting via
addLight, screens helper `src/render/screens.ts`), `src/vfx/*` (VfxSystem), `src/core/events.ts`.

Implement `DestructionSystem` (src/core/context.ts) as `class Destruction` in
`src/destruction/destructionSystem.ts`, constructed with the GameContext
(`new Destruction(ctx)`; only use ctx.physics, ctx.render, ctx.vfx, ctx.events, ctx.time,
ctx.settings, ctx.rng, ctx.scene). This is the heart of the game — read docs/ARCHITECTURE.md §4
carefully; everything there is in scope.

Data model (runtime/): `Part`, `Bond`, `Island`, `Assembly`, `JointGroup`, plus a registry
(PhysicsBody → Island map; assembly ids; part ids). All parts of an assembly share the assembly
frame; each island has a TransformNode (world transform) + PhysicsBody + IslandMeshes.

Must implement:
1. `spawn(def, xf)`: build parts (poly, volume/mass/centroid/extents via geom), bonds (default
   strengths from BOND_DEFAULTS; `fused` = `fusedStrength(mat, contact area estimate)`), union-find
   over RIGID bonds (all kinds except hinge/slider/latch) into islands; island static iff it
   contains a part with an intact world bond; create body (static/dynamic, startAsleep for dynamic
   furniture), container shape of per-part shapes (box shape when the part's poly is a box
   (8 verts, 6 faces), else hull from `polyPoints`), densities from material (or part.mass
   override), friction/restitution from material; layer STATIC / DYNAMIC / DEBRIS (small: mass
   < 1.5 kg or largest extent < 0.2 m); `noCollide` parts get no shape; render via
   `render.buildIsland(node, geoms, prev, name)` with per-part cached `RenderGeom`
   (`polyToRenderGeom(poly, {tessCell, dents, cracks, crackSurf: S.crack_line})`); joint groups →
   constraints (hinge ≥2 intact → hinge; 1 → ball at that pivot; 0 → none; slider; latch = hinge
   motor holding angle 0 with max torque from latch strength); features (see 8). Return assembly id.
2. Impacts: subscribe `physics.onImpact`; buffer; in `afterPhysics` process: map bodies → islands
   (non-destruction bodies like the player are 'rigid world' side), locate the hit part (childIndex
   when available, else nearest part by `polySignedDist` with a per-island uniform grid of part
   AABBs for islands with > 24 parts), transform point/normal into island frame, compute
   `impactEnergy` (masses: island mass or Infinity if static), per side `respond(...)`, apply the
   outcome: dents/cracks (mark part render dirty), damage points (with slow decay), bond damage
   (direct + `inertialBondDamage` for other bonds of the island), chips → `vfx.micro`, fracture
   plans (queued, see 4). Emit `impact` events for audio/VFX for every impact above a small energy
   threshold (with sizes/masses/materials/ids), rate-limited per island pair (~40 ms).
3. `strike(s)`: synthetic impact from tools/fists/kicks/stomps: J = (1+e)·μ·v (μ from striker mass
   and island mass), apply impulse to dynamic targets at the point (`body.applyImpulse`), energy
   via the same model (striker material for the share; sharpness & contactRadius passed to
   respond), process immediately (fracture may be queued but same-step when budget allows), emit
   `impact`; return StrikeResult (energy, impulse, hardness from `hardness()`, part/assembly
   names, broke). Strikes on consolidated debris restore it first.
4. Fracture application (time-budgeted queue, highest energy first, default budget 4 ms per
   step, always at least one): replace the part with planned cells: `remain` cells become parts in
   the same island bonded by `internalBonds`; transferred bonds re-pointed; broken bonds
   removed (emit `bondBreak`); `loose` cells become parts that will split off with kick velocity
   added; `micro` cells → `vfx.micro(kind, worldPos, vel, size, surf, tint)` + dust; emit `fracture`
   with volume/pieces/micro/global/size. Then split.
5. Bond breaking & splitting: when bond health ≤ 0 → remove, emit `bondBreak` (kind, materials,
   world pos), recompute components of the island; heaviest keeps body (rebuild its container and
   mesh), others get new islands whose node starts at the parent node's world transform; set
   velocities v = v + ω × (com_new − com_old) and ω; static components that lost their last world
   bond become dynamic (setMotion) and wake; recreate affected joint constraints (pivots/axes in
   island-local = assembly frame, so recreation is exact); emit `split`.
6. Interaction APIs: `pry(body, point, dir, force, dt)` (bonds of the targeted part/island within
   ~0.15 m of the point take leverage damage ∝ force·dt, nearest first; emit `strain` with stress;
   breaking pops the part with a small impulse; returns stress 0..1), `pull(body, point, force, dt)`
   (forces beyond the holding capacity of joint/world bonds of that island damage them over time —
   rip doors off hinges, tear wall cabinets down; also for static islands being pulled), `use(body,
   point, from)` (doors: release latch motor + impulse away from the player / push closed and
   re-latch near 0°; drawers: impulse along the slider; parts tagged `switch:<roomId>` toggle that
   room's lights; `screen` features toggle; `water` faucets toggle the emitter if intact), `target`
   (TargetInfo incl. usable kind), `massOf`, `isStatic`, `materialAt`.
7. Debris lifecycle: islands whose body sleeps ≥ settings.quality.consolidateAfter seconds and are
   small (mass < 20 kg and extent < 0.6 m, dynamic) are consolidated: hide their meshes and append
   their world-space geometry to a per-cell (2 m grid) static batch mesh built with the same world
   material (use render.buildIsland on a cell TransformNode with world-space geoms); restore when
   any impact/strike involves the island or a round-robin wake check finds it awake. Islands below
   y = −30 are removed (emit `fellOut`) and fully disposed. Never leak bodies/meshes/shapes.
8. Features (features/): `light` (PointLight/SpotLight parented to the island node at the
   feature pos; `render.addLight(light, roomId, mains)`; bulb part destroyed/detached-broken →
   dispose light, emit feature 'lightBroken' + sparks; strong impacts → `flicker`), `screen`
   (use `src/render/screens.ts` helper if present: screen material on the screen part; cracked →
   glitch state; destroyed → dead; emit 'screenBroken'), `water` (when the part fractures or loses
   its bonds: vfx emitter at the feature pos/dir following the island + audio loop 'water_spray';
   finite litres run out), `sparks` (on damage with chance: vfx sparks + feature 'sparks'), `power`
   (panel destroyed → render.setPower(false), emit 'powerOut'), `stuffing` (tear/fracture → vfx
   feathers/foam), `liquid` (container fracture → vfx liquid splash + puddle decal), `soil`,
   `motor` (hinge motor velocity, e.g. ceiling fan; stops on power loss), `hum` (loop while
   powered and intact), `alarm`. Lights also need a switch toggle and power state.
9. Damage accounting: per assembly fraction (fractured volume share + broken bonds share,
   clamped), `valueLost` deltas → emit `damage`; `stats()`; `list()`; `positionOf()`.
10. Performance: impact processing O(events); no per-frame allocations in steady state; island
   rebuild cost proportional to its parts; big static islands (walls) rebuilt only when changed.

Testing: unit tests for pure bookkeeping (union-find splitting, bond transfer, joint group rules)
with hand-made box polys; runtime probes once dependencies exist: spawn a hand-built table
(top + 4 legs glued) and a glass pane in a static frame on a static floor; strike them; verify
fracture, splits, static→dynamic, joint door ripping via pull, consolidation and restore,
fell-out removal, no leaks (bodies/meshes count back to baseline after disposal), screenshots.

## Addendum (orchestrator, after reading the verified physics notes) — mandatory
- Mass/COM/inertia are recomputed only when a body's shape is re-assigned; container edits change
  collision immediately but not mass → always go through `physics.setShape(body, container)` after
  changing an island's parts.
- Hull creation is expensive (~0.5–0.9 ms per 30-pt hull, cheaper when the physics module
  decimates): create fragment shapes inside the time-budgeted fracture queue; reuse part shapes
  across island rebuilds (the caller owns child shapes; `container.dispose()` does not dispose
  children; `body.dispose()` nulls body.shape — keep your own references).
- Collision events carry no child-shape info: locate parts geometrically from the contact point;
  raycasts/sweeps do provide `childIndex`.
- Bodies created with startAsleep hang in mid-air until woken — the integrator will run a settle
  phase at load; don't rely on startAsleep for correctness.
- Never create/dispose bodies inside collision callbacks; process in `afterPhysics`.
- Large debris counts: use the physics module's auto-sleep + cheap sync; consolidated islands
  should have Babylon sync disabled while consolidated.

## Addendum 2 (constraints notes)
- Hinge reaction forces are readable (physics `appliedImpulse`): drive hinge/slider bond damage
  from the measured joint load each step (plus pull/pry), not only from estimates.
- Constraints leak — recreate joint constraints only when islands actually change.

## Addendum 3
- Fill `staticA`/`staticB` in every `impact` event (audio uses them to pick floor/wall surface sounds).
