# Physics system (`src/physics/`)

Havok (Babylon Physics V2) wrapped for the fixed-step destruction sandbox. `physics.ts` implements
`PhysicsSystem` (`src/core/context.ts`) as `class Physics`; `impacts.ts` (contact events → impacts) and
`layers.ts` (collision masks) are pure and unit-tested (`node --test tests/unit/physics-*.test.ts`).
Every behaviour below is verified by `tests/probes/physics-sys-*.probe.ts`.

```ts
import { createPhysics, defaultCollideMask } from "./physics/physics.ts";
const physics = await createPhysics(scene);        // fresh Havok instance, gravity −9.81, scene.physicsEnabled = false
for (let i = 0; i < time.beginFrame(dt); i++) physics.step(FIXED_DT); // scene.render() never steps physics
```

## Stepping
* `step(dt)` = one fixed step: 1..`maxSubsteps` raw Havok steps, Babylon prestep for TELEPORT/ACTION bodies
  (character controller), node sync (world matrices refreshed), impact dispatch. `scene.onBefore/AfterPhysicsObservable`
  fire once per fixed step; `applyForce(F)` once per step = impulse F·dt. Bitwise deterministic per world.
* **Adaptive substeps**: `minSubsteps` (option `substeps`, default 1); while *thin* dynamic bodies (< 2 cm
  equivalent thickness, from Havok's inertia) move fast, `ceil(v/15 m/s)` substeps (max 4) — no tunnelling of
  2–10 cm shards up to 60 m/s. Velocities set through Babylon (`setLinearVelocity`, `applyImpulse`, …) are seen
  before the next step automatically (struck shards included); only raw `HP_Body_*` velocity calls need
  `expectFast(body)`. `physics.substeps` reads the count used by the last step (Havok's raw constraint impulses are
  per substep — use `appliedImpulse` / `constraintLoad`, which sum all substeps).
* **Velocity cache**: `preStepVelocity(body, lin, ang?)` = COM velocity at the start of the last step, i.e. before
  its collisions (restore a projectile's velocity when the thing it hit breaks). Bias under gravity ≈ 0.06 m/s.
* **Sleep assist** (`setAutoSleep(enabled, {linear, angular, seconds})`, default on, 0.08 m/s, 0.2 rad/s, 0.6 s):
  groups of touching dynamic bodies whose average speeds stayed below the thresholds are put to sleep together
  (Havok never sleeps big piles; sleeping single bodies of an active pile makes it thrash). Groups = world AABBs
  within 3 cm of each other (a superset of the contacts) joined through constraints between awake dynamic bodies.
  Piles > 32 bodies sleep when 90 % are slow and the rest only jitter. Jointed bodies (doors, drawers, a latch motor
  at its target) sleep like any other once slow; `setKeepAwake(b, true)` keeps a group awake; HELD-layer bodies are
  kept awake. Slept bodies wake on contact, through their constraints, on use/pull/motor changes, and when something
  they rest on vanishes: disposing a body or removing container children (disposeBody, setShape with fewer children,
  removeChildren, teleport) wakes the sleeping dynamic bodies overlapping what vanished before the next step (Havok
  itself does not). A (practically) zero impulse (|J| < 1e-5 N·s) is ignored instead of waking the body.
  Before (bounding-sphere groups, joints blocking): 200–300 of 644 bodies of the furnished apartment never slept,
  6–19 ms/step; after: only powered rotors stay awake, ≈ 0.3 ms/step (`node tests/idle.mjs`).

## Bodies and shapes
* `createBody(node, "static"|"dynamic"|"animated", startAsleep)` then `setShape(body, shape)`. Nodes must be
  unparented, unit scale, with `rotationQuaternion`. Move static bodies with `teleport()`, not via the node.
* Shapes (`ShapeOpts`: density kg/m³, friction, restitution, layer, collideWith — default layer DYNAMIC):
  `hullShape(points)` (raw Havok, no temp mesh; inputs that fill their box become boxes, planar/degenerate inputs
  are made 1 mm thick, more than `maxHullPoints` (16) points are reduced to well-spread support points — pass whole
  dented vertex buffers freely; timing in `debugStats().hullMsAvg`), `boxShape(center, rot, size)` (boxes < 10 cm,
  with a middle extent < 5 cm or thinner than 2 cm become 8-point hulls: small/thin Havok boxes tunnel),
  `sphereShape`, `containerShape(children)` (children in body frame, distinct objects, keep their own
  density/material/filter).
* **Ownership**: containers from `containerShape` are owned by the physics system once assigned (`setShape` disposes
  the previous one, `disposeBody` the body's); leaf shapes are the caller's — `disposeShape(leaf)` when unused,
  `disposeShape(container, true)` for a whole unassigned tree. `removeChildren(body, idx)` edits in place.
* `setShape` recomputes mass/COM/inertia (and wakes a body that already had a shape). Dynamic masses are clamped to
  ≥ 5 g. `setMotion` switches at runtime (going dynamic validates mass and wakes). `massOf(body)`.
* `disposeBody(body)` or `node.dispose()` (hooked) — both remove the body's joints first. Do **not** call
  `body.dispose()` directly on a jointed body.

## Layers (`Layer` in context.ts, `defaultCollideMask(layer)`)
STATIC↔all · DYNAMIC↔STATIC|DYNAMIC|DEBRIS|PLAYER|HELD · DEBRIS↔STATIC|DYNAMIC|DEBRIS|HELD · PLAYER↔STATIC|DYNAMIC ·
HELD↔STATIC|DYNAMIC|DEBRIS. `setLayer(shape, layer)` applies to every leaf and takes effect immediately on all bodies
using it (sleep state preserved). The character controller's capsule needs membership PLAYER +
`defaultCollideMask(Layer.PLAYER)` set by its owner (Babylon's default filter collides with everything).

## Impacts — `onImpact(cb)` (returns an unsubscribe function)
* One `RawImpact` per body pair per event; `bodyA`/`bodyB` ordered by creation (handle both orders), `normal` A→B,
  `point` = impulse-weighted midpoint between the two surfaces (world copies), `impulse` in N·s.
* `started: true` — a new contact, delivered in the SAME step as its first real contact impulse with
  impulse = max(measured, (1+e)·v_n / Σ 1/m_eff) from the bodies' pre-step velocities (rotation and a supported
  resting target included) ≈ (1+e)·μ·v. The rest of the contact episode (rebound, corner second hit) only
  suppresses duplicates; if the measured episode turns out far larger (a light body crushed under a heavy one), the
  excess follows as `started: false` when the episode ends. Without usable velocities (foreign bodies) the episode
  impulse is reported when the episode ends (1–2 steps later). `started: false` — also a spike above 3× the resting
  load of an existing contact (crushing, slams, things landing on a pile), impulse = excess over the load.
* Event cost: bodies report CONTINUED contact events only while fast (> 0.5 m/s), just after a contact start or an
  impact (adaptive masks); a settled scene raises ~0 events per step.
* Gates: impulse ≥ `minImpulse` (0.02 N·s) and impulse / lightest dynamic mass ≥ 0.25 m/s (filters resting and
  spawn loads). Tunable via `physics.impacts`. Extra fields: `peak`, `steps`, `contacts` (`PhysicsImpact`).
* Delivered after the step completes: handlers may create/dispose bodies freely. `muteImpacts(body, steps)` for
  fragments spawned in contact.

## Queries
`raycast(from, to, collideWith?, ignore?)` → `{body, point, normal, distance, childIndex}` (childIndex = index in
the body's container, 0 for single-child containers, −1 for leaf shapes); `raycastAll` (all hits, nearest first);
`sphereSweep(from, to, r, collideWith?, ignore?)` → `{…, fraction}`. Triggers are ignored.

## Constraints
`hinge`, `slider` (prismatic: no relative rotation), `ball`; pivots/axes in each body's local frame, limits relative
to the creation pose (perpendicular axes are made consistent automatically), `collideConnected` default false.
`worldBody` = static anchor at the origin. Runtime: `setHingeLimits(c, min?, max?)`, `setHingeMotor(c, target,
maxTorque)` (position motor = latch/closer; maxTorque 0 releases), `setHingeVelocityMotor`, `setHingeFriction`,
`setSliderLimits`, `hingeAngle(c)`, `sliderPosition(c)`, `appliedImpulse(c, out?)` → `{linear, angular (world
vectors, N·s / N·m·s, summed over the step's substeps), dt}`, `constraintLoad(c)` → `{force N, torque N·m}` (the
same, averaged over the step) for joint stress, `removeConstraint(c)` (truly frees the Havok constraint).
These helpers are optional members of the `PhysicsSystem` contract (no casts needed).

## Stats
`stats()` → bodies, awake, stepMs (EMA), constraints; `debugStats()` adds substeps, events/impacts per step, hot
(CONTINUED-reporting) bodies, same-step impacts, forced sleeps, hull statistics (count, EMA/last ms, points in/out,
box substitutions, thickened inputs), sync counts and a per-phase time breakdown.
