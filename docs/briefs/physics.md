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

## Addendum (orchestrator, after reading the verified notes) — mandatory
The notes revealed performance/semantics traps that this module must solve for everyone:
1. **Impact detection cost vs accuracy.** Collision callbacks on every body produce ~10k
   CONTINUED events/step for big piles (+4–10 ms), but the real impact impulse often arrives on
   the CONTINUED after a speculative STARTED. Design a scheme that is both cheap and correct, e.g.:
   STARTED-only masks for slow/sleeping bodies, STARTED|CONTINUED only while a body is fast
   (|v| above ~1.5 m/s; change masks only on already-awake bodies since setEventMask wakes), plus
   impulse ESTIMATION from cached pre-step velocities (J ≈ (1+e)·μ·v_n at the contact point using
   the bodies' previous-step linear/angular velocities and masses) when the measured impulse is
   missing or speculative. Aggregate per pair per step (sum of per-point impulses; max with the
   estimate). Document the scheme and its measured cost at the top of physics.ts.
2. **Sleeping piles.** Large piles never sleep (15–18 ms/step at 1000 bodies). Implement a
   force-sleep policy: dynamic bodies whose linear speed < ~0.08 m/s and angular < ~0.2 rad/s for
   ~0.5 s are put to sleep via the activation control API (they still wake on impact) — expose
   `setAutoSleep(enabled, thresholds)`; on by default.
3. **Sync cost.** Babylon's per-body transform sync costs ~1.5 µs per body per step even when
   asleep. Provide a cheaper sync path for many bodies (e.g. disable Babylon's sync for our bodies
   and copy transforms yourself only for awake bodies by reading the body buffer as the notes
   describe) — keep `TransformNode` poses correct for awake bodies after each step and after
   teleports; expose a flag per body if needed. Measure with 3000 sleeping + 200 awake bodies.
4. **Hull cost.** ~0.5–0.9 ms per 30-point hull. Decimate hull inputs to ≤ 16 well-spread extreme
   points (k-DOP-style support points) before creating the shape (tiny visual mismatch is fine),
   use box shapes for box-like polys, and expose `hullShape` timing in stats. Also measure the
   resting gap (convex radius) of hull/box shapes on a static floor and minimise it so small
   debris does not visibly float.
5. **Layer masks live on LEAF shapes** (container masks are ignored): `setLayer` on a container
   must update every child; containers must copy the layer onto children at creation.
6. **Never create/dispose bodies inside Havok callbacks** (ids are reused immediately): buffer
   everything and dispatch impacts after the step (already in the brief).
7. Raycast `result.shape` is the hit child for containers (undefined for single shapes): map it to
   the child index via a per-container Map.

## Addendum 2 (constraints notes landed: docs/api-notes/physics-constraints-character.md)
- Pivots/axes are body-local (origin, not COM); axis setters only after addConstraint; use plugin
  setAxis*/Motor* calls. Motor: set type before target; release with maxForce 0 (type NONE is ignored).
- Constraints LEAK (~3.5 KB each, solver slows even after dispose): never create per frame;
  expose `appliedImpulse(c)` via HP_Constraint_GetAppliedImpulses so hinges can break physically.
- Dispose constraints before their bodies. One Havok world for the whole session.
