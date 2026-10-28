# Havok v2: constraints, motors, reaction impulses, grab/hold, character controller
Babylon.js **9.30.0** (`@babylonjs/core`) + **@babylonjs/havok 1.3.14**, checked against the installed
`Physics/v2/physicsConstraint.*`, `characterController.*`, `Plugins/havokPlugin.js` and `HavokPhysics.d.ts`, and run in
headless Chromium with fixed 1/60 s steps (`HavokPlugin(false, hk)` + `scene._advancePhysicsEngineStep(1000/60)`).
Markers: **[RT]** = verified at runtime by a probe; **[SRC]** = read from the installed source only.
Probes: `tests/probes/physics-constraints-*.probe.ts` (helpers in `physics-constraints-util.ts`).
**Status: work in progress — sections marked (pending) are still being verified.**

## TL;DR
1. **Pivots and axes are BODY-LOCAL** (relative to the body ORIGIN = its TransformNode, not the COM) for every constraint
   class, even though the `.d.ts` says "world space" for Hinge/Slider. Passing world pivots made a door jump 1.55 m. **[RT]**
2. A constraint exists in Havok only after `parentBody.addConstraint(childBody, c)`. **Any axis setter before that throws**
   `TypeError: _pluginData is not iterable`. **[RT]**
3. `HingeConstraint`/`SliderConstraint`/`PrismaticConstraint`/`BallAndSocketConstraint`/`LockConstraint`/`DistanceConstraint`
   have **no axis methods** — use the plugin: `plugin.setAxisMode/setAxisMinLimit/setAxisMaxLimit/setAxisFriction/
   setAxisMotorType/setAxisMotorTarget/setAxisMotorMaxForce(c, axis, v)`, or build a `Physics6DoFConstraint` (has them). Both
   gave bitwise-identical door motion. **[RT]**
4. **Angular limits** (`ANGULAR_X` = rotation about `axisA`) are measured from `perpAxisA` (parent) to `perpAxisB` (child),
   i.e. relative to the pose described by the local frames, not the pose at creation. Positive = right-hand rotation about
   `axisA` (+θ about +Y maps +X to (cos θ, 0, −sin θ)). Door at 5 rad/s into a ±100° limit: 1.3° overshoot, rebounds at ~25 %
   speed. **[RT]**
5. **Axis friction = constant resisting torque in N·m** (force in N on linear axes): friction 2/5/10/20 → measured
   2.24/5.21/10.17/20.12 N·m. **[RT]**
6. **Motors**: call `setAxisMotorType` **first** (a target set while the type is NONE is silently dropped); `maxForce` = max
   torque (N·m) on angular axes. A POSITION motor at target 0 with 30 N·m held 28.8 N·m pushes, crept at 31.5, opened at 36.
   **Release with `setAxisMotorMaxForce(c, axis, 0)`** — `setAxisMotorType(NONE)` is **ignored** once a motor was set (raw
   type stays POSITION, door stays latched). `plugin.getAxisMotorTarget` throws (Babylon bug). **[RT]**
7. **Reaction loads are readable**: `hk.HP_Constraint_GetAppliedImpulses(c._pluginData[0])` → `[res, lin, ang]` = world
   impulses (N·s, N·m·s) applied to the CHILD during the last step; force = |lin|/dt, torque = |ang|/dt; includes motor
   torque. Hanging 20 kg door: lin.y 3.265 (m·g·dt = 3.27); cantilevered hinge: 85.5 N·m (m·g·d = 88.3). **[RT]**
8. `c.dispose()` disables + releases; disposing a BODY with a live constraint doesn't crash (the joint is just dead) — still
   dispose constraints first. Havok's constraint counter never decreases until the world is released (tiny leak). **[RT]**
9. **Havok eats slow velocities**: any body slower than ~0.1–0.2 m/s loses ~0.005 m/s per step, even with `ALWAYS_ACTIVE`.
   A 10 kg box pushed with ≤ 3 N never moves; a door pushed with 2 N at its edge never opens. Keep per-step Δv ≫ 0.005 m/s. **[RT]**
10. (pending) grab/hold recommendation, character controller.

## 1. Constraint classes (exact signatures from `physicsConstraint.d.ts`)
```ts
new PhysicsConstraint(type: PhysicsConstraintType, options: PhysicsConstraintParameters, scene: Scene)
new BallAndSocketConstraint(pivotA: Vector3, pivotB: Vector3, axisA: Vector3, axisB: Vector3, scene: Scene)
new DistanceConstraint(maxDistance: number, scene: Scene)              // pivots = body origins; min = max = maxDistance (rigid rod!)
new HingeConstraint(pivotA: Vector3, pivotB: Vector3, axisA: Vector3, axisB: Vector3, scene: Scene)
new SliderConstraint(pivotA: Vector3, pivotB: Vector3, axisA: Vector3, axisB: Vector3, scene: Scene)     // translate + rotate about axis
new PrismaticConstraint(pivotA: Vector3, pivotB: Vector3, axisA: Vector3, axisB: Vector3, scene: Scene)  // translate along axis only
new LockConstraint(pivotA: Vector3, pivotB: Vector3, axisA: Vector3, axisB: Vector3, scene: Scene)
new Physics6DoFConstraint(constraintParams: PhysicsConstraintParameters, limits: Physics6DoFLimit[], scene: Scene)
new SpringConstraint(pivotA, pivotB, axisA, axisB, minDistance: number, maxDistance: number, stiffness: number, damping: number, scene)
interface PhysicsConstraintParameters { pivotA?: Vector3; pivotB?: Vector3; axisA?: Vector3; axisB?: Vector3;
  perpAxisA?: Vector3; perpAxisB?: Vector3; maxDistance?: number; collision?: boolean; }   // all body-local
class Physics6DoFLimit { axis: PhysicsConstraintAxis; minLimit?: number; maxLimit?: number; stiffness?: number; damping?: number; }
// base class members: get type, get options, isEnabled (get/set), isCollisionsEnabled (get/set),
//   getBodiesUsingConstraint(): ConstrainedBodyPair[], dispose(), _pluginData: HP_ConstraintId[] (one per addConstraint call)
// Physics6DoFConstraint only: setAxisFriction/getAxisFriction, setAxisMode/getAxisMode, setAxisMinLimit/getAxisMinLimit,
//   setAxisMaxLimit/getAxisMaxLimit, setAxisMotorType/getAxisMotorType, setAxisMotorTarget/getAxisMotorTarget,
//   setAxisMotorMaxForce/getAxisMotorMaxForce   (all take (axis, value))
// PhysicsBody: addConstraint(childBody: PhysicsBody, constraint: PhysicsConstraint, instanceIndex?: number, childInstanceIndex?: number): void
```
Enums (values): `PhysicsConstraintType` BALL_AND_SOCKET=1, DISTANCE=2, HINGE=3, SLIDER=4, LOCK=5, PRISMATIC=6, SIX_DOF=7;
`PhysicsConstraintAxis` LINEAR_X=0 (along axisA), LINEAR_Y=1 (along perpAxisA), LINEAR_Z=2 (axisA × perpAxisA),
ANGULAR_X=3, ANGULAR_Y=4, ANGULAR_Z=5, LINEAR_DISTANCE=6; `PhysicsConstraintAxisLimitMode` FREE=0, LIMITED=1, LOCKED=2;
`PhysicsConstraintMotorType` NONE=0, VELOCITY=1, POSITION=2 (raw Havok also has SPRING_FORCE/SPRING_ACCELERATION, not mapped).

**[RT] Axis modes set by each class** (order LIN_X, LIN_Y, LIN_Z, ANG_X, ANG_Y, ANG_Z, LIN_DIST; 0 free, 1 limited, 2 locked):

| class | modes | notes |
|---|---|---|
| BallAndSocket | 2 2 2 0 0 0 0 | |
| Hinge | 2 2 2 **0** 2 2 0 | ANGULAR_X free; limits ±3.4e38 until set |
| Slider | **0** 2 2 **0** 2 2 0 | rotates about its axis too — a drawer would roll |
| Prismatic | **0** 2 2 2 2 2 0 | use for drawers |
| Lock | 2 2 2 2 2 2 0 | |
| Distance(d) | 0 0 0 0 0 0 **1** | LINEAR_DISTANCE min = max = d (rod). Rope: `plugin.setAxisMinLimit(c, LINEAR_DISTANCE, 0)` |
| 6DoF, no limits | all 0 | each limit with min = max = 0 → LOCKED, else LIMITED |

**[SRC] Defaults applied by `initConstraint`:** missing pivot → (0,0,0); missing axis → (1,0,0); missing perpAxis →
`axis.getNormalToRef()` ((0,1,0) → (1,0,0); (1,0,0) and (0,0,1) → (0,−1,0)). Same local axis on both bodies → same perp,
so the zero angle is "both local frames aligned". Pass explicit unit `perpAxisA/B` anyway.
**[RT] Getters return numbers, not booleans:** `isEnabled` → 1/0 after add (false before add / after dispose),
`isCollisionsEnabled` → 0 by default.

### Attaching, coordinate spaces
```ts
import { HingeConstraint, PhysicsConstraintAxis, PhysicsConstraintAxisLimitMode, Vector3, type HavokPlugin } from "@babylonjs/core";
// frame: STATIC body at (-0.5, 1.05, 0); door: DYNAMIC 0.9 x 2.0 x 0.04 box at (0, 1.05, 0), 20 kg
const hinge = new HingeConstraint(
  new Vector3(0.05, 0, 0),   // pivotA in FRAME-local coords (body origin, not COM)
  new Vector3(-0.45, 0, 0),  // pivotB in DOOR-local coords (left edge)
  new Vector3(0, 1, 0), new Vector3(0, 1, 0), scene);   // axisA / axisB, body-local
frame.addConstraint(door, hinge);                        // parent = frame, child = door. Creates the Havok joint NOW.
const p = scene.getPhysicsEngine()!.getPhysicsPlugin() as HavokPlugin;
p.setAxisMode(hinge, PhysicsConstraintAxis.ANGULAR_X, PhysicsConstraintAxisLimitMode.LIMITED);
p.setAxisMinLimit(hinge, PhysicsConstraintAxis.ANGULAR_X, -100 * Math.PI / 180);
p.setAxisMaxLimit(hinge, PhysicsConstraintAxis.ANGULAR_X, 100 * Math.PI / 180);
p.setAxisFriction(hinge, PhysicsConstraintAxis.ANGULAR_X, 0.5);   // N*m of constant resisting torque
```
- **[RT] Body-local, origin-relative:** frame translated to (5,1,3) and rotated 30°, door COM moved to (0.3,0.2,0) with
  `setMassProperties`: after 30 steps without gravity the door moved 0.000 m and the pivot gap stayed 0.
- **[RT]** If the pivots do not coincide in world space at creation, the solver pulls the bodies together (1.55 m jump
  with world-space pivots by mistake). Compute pivotB as `inverse(childWorld) * worldPivot`.
- **[RT] Connected bodies don't collide** by default (`collision: false`). `c.isCollisionsEnabled = true` made an
  overlapping box get pushed out of its post.
- **[RT]** Adding the **same constraint object to two body pairs** creates two Havok joints (`_pluginData.length === 2`);
  axis setters loop over all of them, getters read the first.
- **[RT] Re-enabling** a joint after the bodies drifted 1.2 m apart (`isEnabled = false`, fall, `isEnabled = true`)
  pulls them back over ~6 steps (≈ 50 %/step, first-step impulse 25 N·s on 5 kg). No explosion.

### Lifecycle / disposal
- **[RT]** `c.dispose()` → `HP_Constraint_SetEnabled(false)` + `HP_Constraint_Release`, `_pluginData.length = 0`;
  `isEnabled` then returns false; a second `dispose()` is harmless.
- **[RT]** `HP_GetStatistics()[1][2]` (constraints) **never decreases** after `dispose()` (100 created + disposed →
  still 100); it drops only when the world is released (`scene.dispose()`). Released joints are disabled, so this is
  memory only (small). Don't churn tens of thousands of joints per session.
- **[RT]** Disposing a **body** that still has a constraint: no error; the joint stays "enabled" but inert; a new body
  that reuses the Havok id is **not** affected. Order to use anyway: `constraint.dispose()` then body.
- **[RT]** `scene.dispose()` with live constraints frees them in Havok but **not** the JS wrappers — never touch them again.
  One WASM instance that went through ~7 create/dispose world cycles with live constraints **crashed the renderer**
  ("Target crashed") on a later `setAxisMotorMaxForce`; with one WASM instance per world it never crashed. In the game:
  one world, dispose constraints before their bodies, never reuse wrappers.

## 2. Limits, friction, motors

### Angle measurement & limits **[RT]**
- `ANGULAR_X` = rotation of the child's constraint frame relative to the parent's about `axisA`, zero when `perpAxisB`
  (child-local) is aligned with `perpAxisA` (parent-local). Sign check: POSITION motor target +0.5 rad → measured +0.500 rad
  with `relAngle()` (util): right-hand rule, +θ about +Y maps +X to (cos θ, 0, −sin θ).
- Door (20 kg, I_hinge = 5.40 kg·m²), limits ±100°, friction 0.5, kick 30 N·s at the free edge (ω ≈ 5 rad/s):
  min −101.3° (1.3° overshoot), then it bounces back and swings to +10.6° after 2 s (ω 1.1 rad/s). Kick the other way:
  mirror image (+101.3°). Identical for `HingeConstraint` + plugin limits and `Physics6DoFConstraint`. Pivot gap 0 mm.
- An impulse +Z at the +X edge of an unrotated door gives a **negative** angle.

### Friction **[RT]**
Free door (angular damping 0), kicked to 2.5 rad/s, deceleration over 20 steps:

| friction | 0 | 2 | 5 | 10 | 20 |
|---|---|---|---|---|---|
| measured torque (N·m) | 0.26 | 2.24 | 5.21 | 10.17 | 20.12 |

### Motors **[RT]**
```ts
p.setAxisMotorType(c, PhysicsConstraintAxis.ANGULAR_X, PhysicsConstraintMotorType.POSITION); // 1st: type
p.setAxisMotorTarget(c, PhysicsConstraintAxis.ANGULAR_X, 0);                                  // 2nd: target (rad, or rad/s for VELOCITY)
p.setAxisMotorMaxForce(c, PhysicsConstraintAxis.ANGULAR_X, 30);                                // max torque N*m (N on linear axes)
// release (latch opened / broken): set max force 0 — NOT motor type NONE
p.setAxisMotorMaxForce(c, PhysicsConstraintAxis.ANGULAR_X, 0);
```
- **Order:** target 0.6 set while the type was NONE → raw target 0, the motor later held 0, not 0.6. Setting the target
  after the type works (−0.4 → door at −0.400 rad).
- **Latch** (POSITION, target 0, maxForce 30 N·m), constant push at the edge for 1 s:

| push torque (N·m) | 9 | 18 | 27 | 28.8 | 31.5 | 36 | 54 |
|---|---|---|---|---|---|---|---|
| angle after 1 s | 0° | 0° | 0° | 0° | −1.9° | −26.3° | −92.4° |
| motor torque from applied impulse | 9.85 | 18.0 | 27.1 | 28.8 | 30.0 | 30.0 | 30.1 |

  Kicks (impulse at the edge, motor stays on): 2 N·s → −0.5°, 5 → −3.4°, 10 → −14°, 20 → −56°, 40 → hits −101°; every
  time the motor pulls the door back to ~0° within ~1 s (a capped spring). For a breakable latch, watch the angle (e.g.
  |θ| > 3–5° or motor saturated for N steps) and then release with maxForce 0.
- **Release variants** (motor was POSITION/30 N·m, then a 5 N push at the edge): `setAxisMotorMaxForce(0)` → moves like a
  door that never had a motor; VELOCITY + target 0 + maxForce 0 → free; **`setAxisMotorType(NONE)` → stays latched**
  (raw `HP_Constraint_GetAxisMotorType` still POSITION, maxForce still 30; a 90 N·m push opened it slower, motor impulse
  still 30 N·m).
- **Velocity motor (ceiling fan)**: 2 kg blade bar (I = 0.24), hinge axis Y, VELOCITY target 10 rad/s, maxForce 2 N·m:
  ω = 2.0, 4.0, 5.9, 7.8, 9.6, 9.98 rad/s every 0.25 s (α = 8.1 rad/s² = 1.94 N·m / I), steady 9.984. Target 0 → brakes at
  the same rate to 0. maxForce 0 → coasts (9.98 → 9.03 in 1 s from angular damping 0.1). Positive target = positive ω about
  +axis.
- `plugin.getAxisMotorTarget(c, axis)` **throws** ("Cannot convert … to uint64_t": it passes `_pluginData` instead of the
  id). Read raw: `hk.HP_Constraint_GetAxisMotorPositionTarget(c._pluginData[0], hk.ConstraintAxis.ANGULAR_X)[1]`
  (or `…VelocityTarget`).

## 3. Reaction forces for breakable joints **[RT]**
`HP_Constraint_GetAppliedImpulses(constraint: HP_ConstraintId): [Result, Vector3, Vector3]` (Havok ≥ 1.3.11) returns the
linear and angular impulse the joint applied during the last step, in **world space**, as seen by the **child** body.
The linear part acts at the pivot; the angular part is the pure couple (locked angular axes + motor + friction).
```ts
const hk = plugin._hknp as HavokPhysicsWithBindings;
function jointLoad(c: PhysicsConstraint, dt: number): { force: number; torque: number } {
  const id = (c as unknown as { _pluginData: [bigint][] })._pluginData[0];
  const [, lin, ang] = hk.HP_Constraint_GetAppliedImpulses(id);
  return { force: Math.hypot(lin[0], lin[1], lin[2]) / dt, torque: Math.hypot(ang[0], ang[1], ang[2]) / dt };
}
```
| case | lin (N·s) | ang (N·m·s) | expected |
|---|---|---|---|
| 20 kg door hanging from one ball socket, settled | (−0.08, 3.265, 0) | 0 | m·g·dt = 3.27 up |
| 20 kg door on a vertical hinge through its edge (cantilever) | (0, 3.166, 0) | (0, 0, 1.425) | 3.27 / m·g·0.45·dt = 1.472 |
| same, step after a 10 N·s kick at the free edge | z = 4.98 (pivot reaction) | | |
| latch pushed with 18 N·m | | y = 0.300 (= 18 N·m · dt) | motor torque included |

Use it each step in `onAfterPhysicsObservable` for hinge/slider/latch bonds: e.g. break when `force > F_max` or
`torque > T_max` for a few consecutive steps (pending: impact-spike behaviour).

(pending sections: drawer/prismatic, hinge→ball swap, re-creating at 60°, grab/hold comparison, character controller)

## Pitfalls (so far)
1. Pivots/axes are body-local (origin-relative), never world — the `.d.ts` comments on Hinge/Slider are wrong.
2. Axis setters before `addConstraint` throw; Hinge/Slider/... have no axis methods — use `plugin.setAxis*(c, …)`.
3. Motor: type first, then target, then max force. Release = max force 0; motor type NONE is ignored.
4. `plugin.getAxisMotorTarget` throws; `isEnabled`/`isCollisionsEnabled` return 1/0 numbers.
5. `DistanceConstraint(d)` is a rigid rod (min = max = d).
6. Slow bodies (< ~0.1–0.2 m/s) are decelerated by ~0.005 m/s per step regardless of activation control: tiny forces do
   nothing.
7. Each WASM instance must only be used with handles it created (calling `hk.HP_*` of another instance → "null function").
