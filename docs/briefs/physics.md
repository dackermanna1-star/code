# Brief: physics system (`src/physics/**`)

Owner paths: `src/physics/**`, `tests/probes/physics-sys-*.probe.ts`.
Read first: `docs/api-notes/physics-bodies-shapes.md`, `docs/api-notes/physics-events-queries.md`,
`docs/api-notes/physics-constraints-character.md` (if present), `docs/api-notes/input-loop-camera.md`
(fixed-step section, if present), and `src/core/context.ts` (PhysicsSystem, Layer, RawImpact,
RayHit, SweepHit, ShapeOpts, HingeOpts, SliderOpts).

Implement `PhysicsSystem` as `class Physics` in `src/physics/physics.ts` with
`export async function createPhysics(scene: Scene, opts?: { substeps?: number }): Promise<Physics>`
(Havok init via `import HavokPhysics from "@babylonjs/havok"` and
`import havokWasmUrl from "@babylonjs/havok/lib/esm/HavokPhysics.wasm?url"`). Also expose
`readonly plugin: HavokPlugin` and `readonly hk` (raw Havok module) for the player's character
controller and for advanced use.

Requirements:
- FIXED-STEP manual stepping: `step(dt)` advances Havok exactly once by dt (optionally split into
  `substeps`), independent of `scene.render()` (scene.render must NOT advance physics by wall
  clock — use the mechanism documented in the notes). Body→node transform sync must happen
  after each step (verify). Expose `stepIndex`.
- Collision events → `RawImpact`: enable collision callbacks on every body created through
  `createBody` (dynamic, animated AND static as needed per the notes so that dynamic↔static and
  dynamic↔dynamic impacts are all reported exactly once per contact start). Normalise: copy point
  and normal (world), make the normal point from bodyA to bodyB, impulse = normal impulse
  magnitude (N·s) per the measured semantics; `started` true for contact start; include strong
  CONTINUED spikes (impulse above max(minImpulse, k × typical resting impulse)) so sustained
  crushing and sliding slams register, but filter resting-contact noise. Deduplicate A/B
  duplicates within a step. Dispatch to `onImpact` subscribers after the step completes (never
  inside Havok callbacks that could be re-entrant with body creation/destruction).
- Shapes: `hullShape(points)` (from raw points without leaking temp meshes; benchmark),
  `boxShape(center, rotation, size)`, `sphereShape`, `containerShape(children)` (children
  already in body frame; preserve per-child density / material / filter), `setShape` (swap a
  body's shape incl. mass-property recomputation; dispose the previous container but NOT
  children that are reused — document ownership: the caller owns child shapes),
  `setMotion` (static ↔ dynamic ↔ animated at runtime; when going dynamic make sure mass
  properties are valid and the body wakes), `setLayer`, `wake`, `isAwake`, `disposeBody`.
- Collision layers (`Layer` in context.ts) and default collide masks:
  STATIC ↔ everything; DYNAMIC ↔ STATIC|DYNAMIC|DEBRIS|PLAYER|HELD; DEBRIS ↔ STATIC|DYNAMIC|DEBRIS|HELD
  (NOT PLAYER: the player walks through/over tiny debris without being shoved; the player's
  feet still trigger stomps via raycasts); PLAYER ↔ STATIC|DYNAMIC; HELD ↔ STATIC|DYNAMIC|DEBRIS
  (not PLAYER). Export `defaultCollideMask(layer)`.
- Queries: `raycast(from, to, collideWith?, ignore?)` → RayHit with `childIndex` of the hit child
  in a container if Havok exposes it (shape key / child index — see notes), else −1; `sphereSweep`
  via shape casting; both must honour `ignore` and layer masks; return world copies.
- Constraints: `hinge`, `slider` (prismatic with limits), `ball`, `removeConstraint`, honoring
  pivots/axes in body-local frames, limits, friction, optional position motor (latches/springs:
  target angle + max force/torque), `collideConnected` default false. `worldBody`: a static body at
  the origin with identity transform for world-anchored joints. Changing motor target/max force at
  runtime (`setHingeMotor(c, target, maxForce)`), and `setHingeLimits(c, min, max)` helpers.
- Robustness for fast small bodies (glass shards, thrown objects): use the notes' CCD findings
  (substeps or other mechanism) — default `substeps` chosen so a 2 cm piece at 30 m/s doesn't
  tunnel through a 5 cm static slab, while keeping cost reasonable. Make it configurable.
- Sleeping: rely on Havok deactivation; expose `isAwake`; bodies created with `startAsleep`.
- `stats()`: bodies, awake, constraints, last step ms (EMA).
- Leak-free: disposing bodies/shapes/constraints returns plugin counts to baseline (verify).

Probes (`tests/probes/physics-sys-*.probe.ts`) must cover: deterministic stepping (free-fall
after N steps matches analytic within tolerance; scene.render() between steps doesn't advance
physics), impacts (drop test: one started event with impulse ≈ (1+e)·m·v; static and dynamic
targets; normal direction), container hull bodies (mass/COM from densities; rebuild after
removing a child: raycast through removed child misses; mass changes), layer filtering
(DEBRIS vs PLAYER), raycast childIndex, sphere sweep hit point/normal/fraction, hinge door with
limits on a static frame, slider drawer with limits and removal, ball socket, static→dynamic
switch, motor-held latch released, 1000-body pile perf (ms/step) and 3000 sleeping bodies cost.
