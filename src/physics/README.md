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
  2–10 cm shards up to 60 m/s. Fragments are covered automatically (velocity read after `setShape`); call
  `expectFast(body)` after striking a small body. `physics.substeps` reads the count used by the last step
  (Havok's constraint impulses are per substep: force = impulse / (dt / substeps) — or use `constraintLoad`).
* **Sleep assist**: dynamic bodies slower than 0.1 m/s / 0.5 rad/s for 1.5 s are put to sleep (Havok never sleeps
  big piles). Bodies with joints or `setKeepAwake(b, true)` are exempt; HELD-layer bodies are kept awake.

## Bodies and shapes
* `createBody(node, "static"|"dynamic"|"animated", startAsleep)` then `setShape(body, shape)`. Nodes must be
  unparented, unit scale, with `rotationQuaternion`. Move static bodies with `teleport()`, not via the node.
* Shapes (`ShapeOpts`: density kg/m³, friction, restitution, layer, collideWith — default layer DYNAMIC):
  `hullShape(points)` (raw Havok, ~0.1 ms), `boxShape(center, rot, size)` (boxes < 10 cm or with a middle extent
  < 5 cm become 8-point hulls: small Havok boxes fall through floors), `sphereShape`, `containerShape(children)`
  (children in body frame, distinct objects, keep their own density/material/filter).
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
* `started: true` — a new contact: the impulse of the whole contact episode is merged (speculative STARTED step,
  main CONTINUED step, restitution rebound, a rotating corner's second hit) minus the resting load:
  ≈ (1+e)·μ·v. Delivered when the episode ends (separation, steady load, or 8 steps) — typically 1–2 steps after
  the peak. `started: false` — a spike above 3× the resting load of an existing contact (crushing, slams, things
  landing on a pile), impulse = excess over the load.
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
`setSliderLimits`, `hingeAngle(c)`, `sliderPosition(c)`, `constraintLoad(c)` → `{force N, torque N·m}` for joint
stress, `removeConstraint(c)` (truly frees the Havok constraint).

## Stats
`stats()` → bodies, awake, stepMs (EMA), constraints; `debugStats()` adds substeps, events/impacts per step, sync
counts and a per-phase time breakdown.
