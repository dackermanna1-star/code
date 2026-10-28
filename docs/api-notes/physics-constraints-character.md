# Havok v2: constraints, motors, joint loads, grab/hold, character controller
Babylon.js **9.30.0** (`@babylonjs/core`) + **@babylonjs/havok 1.3.14**. Checked against the installed
`Physics/v2/physicsConstraint.*`, `characterController.*`, `Plugins/havokPlugin.js` and `HavokPhysics.d.ts`, and run in
headless Chromium with fixed 1/60 s steps (`new HavokPlugin(false, hk)` + `scene._advancePhysicsEngineStep(1000/60)`).
Markers: **[RT]** = verified at runtime by a probe; **[SRC]** = read from the installed source only; **[DER]** = derived
from verified numbers (math only).
Probes: `tests/probes/physics-constraints-*.probe.ts`; helpers `physics-constraints-util.ts`. The snippets of §3, §6.2
and §7.4 were extracted **verbatim** from this file into `physics-constraints-notesnippets.ts` and run by
`physics-constraints-notesnippets.probe.ts` (5 kg held at exactly 1.2 m with 50.1 N, 60 kg not liftable at 451 N,
setRotation yaw 0.5 ✓, jointLoad 40.5 N for a 4 kg lamp, jump apex 1.037 m, landing 4.56 m/s, crouch/stand check ✓).
Timings come from a shared 4-CPU box (±50 % noise). All imports from the package root (`"@babylonjs/core"`).

## TL;DR
1. Pivots/axes are **body-local, relative to the body origin** (not COM; `.d.ts` "world space" is wrong); the joint exists only after `parent.addConstraint(child, c)` — axis setters before that throw.
2. Hinge/Slider/Prismatic/Ball/Lock have no axis methods → `plugin.setAxisMode/MinLimit/MaxLimit/Friction/Motor*(c, axis, v)` or `Physics6DoFConstraint` (identical results).
3. Limits are measured between the local frames (`perpAxisA`→`perpAxisB`, +right-hand about `axisA`): re-creating a hinge at 60° with the same local frames → no jump, limits still ±100° from closed. Friction = N·m (N), motor maxForce = N·m (N).
4. Motors: set type **before** target; **release = `setAxisMotorMaxForce(c, axis, 0)`** (`setAxisMotorType(NONE)` is ignored). POSITION 30 N·m latch held 28.8 N·m, opened at 36; VELOCITY fan works.
5. Joint loads: `hk.HP_Constraint_GetAppliedImpulses(c._pluginData[0])` = world impulse on the child last step (m·g·dt within 0.2 %, motor torque included); impacts = 1-step spikes.
6. Every created joint leaks ~3.5 KB + solver time after `dispose()` (20 k → +64 MB, 0.3→1.0 ms/step) and joints can't be re-pointed → create per grab/island change, never per frame.
7. Havok bleeds ~0.005 m/s per step off any body slower than ~0.12 m/s (even `ALWAYS_ACTIVE`): forces < ~0.3·m N never start motion.
8. Grab: 6DoF joint with POSITION motors (lift 450 N / push 300 N) to an ANIMATED anchor — exact, jitter-free, force readable; joints to STATIC bodies do nothing (compute pull yourself). Snippet §6.2.
9. CharacterController defaults bite: radius **0.6**, `characterStrength` 1e38 (shoves 200 kg → use 600 N), `characterMass` 0 (weightless → 80); hovers 5–15 cm (use keepDistance 0.02 / tolerance 0.03); jumps die without a post-jump grace.
10. CC: capsule filter masks filter its queries (debris ignored ✓), rides over ≤ 10 cm, `maxStepHeight` 0.35 climbs 20 cm only with keepDistance 0.02; crouch = `setShapeOptions` (+ own headroom check); its ANIMATED body is hit by raycasts. Snippet §7.4.

---

## 1. Constraint API

### 1.1 Signatures (from `physicsConstraint.d.ts`)
```ts
new PhysicsConstraint(type: PhysicsConstraintType, options: PhysicsConstraintParameters, scene: Scene)
new BallAndSocketConstraint(pivotA: Vector3, pivotB: Vector3, axisA: Vector3, axisB: Vector3, scene: Scene)
new DistanceConstraint(maxDistance: number, scene: Scene)            // pivots = body origins; min = max = maxDistance → rigid rod!
new HingeConstraint(pivotA: Vector3, pivotB: Vector3, axisA: Vector3, axisB: Vector3, scene: Scene)
new SliderConstraint(pivotA: Vector3, pivotB: Vector3, axisA: Vector3, axisB: Vector3, scene: Scene)     // translate AND rotate about axis
new PrismaticConstraint(pivotA: Vector3, pivotB: Vector3, axisA: Vector3, axisB: Vector3, scene: Scene)  // translate along axis only (drawers)
new LockConstraint(pivotA: Vector3, pivotB: Vector3, axisA: Vector3, axisB: Vector3, scene: Scene)
new Physics6DoFConstraint(constraintParams: PhysicsConstraintParameters, limits: Physics6DoFLimit[], scene: Scene)
new SpringConstraint(pivotA, pivotB, axisA, axisB, minDistance: number, maxDistance: number, stiffness: number, damping: number, scene) // 6DoF + LINEAR_DISTANCE soft limit
interface PhysicsConstraintParameters { pivotA?: Vector3; pivotB?: Vector3; axisA?: Vector3; axisB?: Vector3;
  perpAxisA?: Vector3; perpAxisB?: Vector3; maxDistance?: number; collision?: boolean; }  // vectors body-local
class Physics6DoFLimit { axis: PhysicsConstraintAxis; minLimit?: number; maxLimit?: number; stiffness?: number; damping?: number; }
// PhysicsConstraint (all classes): get type; get options; isEnabled (get/set); isCollisionsEnabled (get/set);
//   getBodiesUsingConstraint(): ConstrainedBodyPair[]; dispose(); _pluginData: HP_ConstraintId[] (one per addConstraint)
// Physics6DoFConstraint only: setAxisFriction/getAxisFriction, setAxisMode/getAxisMode, setAxisMinLimit/getAxisMinLimit,
//   setAxisMaxLimit/getAxisMaxLimit, setAxisMotorType/getAxisMotorType, setAxisMotorTarget/getAxisMotorTarget,
//   setAxisMotorMaxForce/getAxisMotorMaxForce — all (axis, value)
// HavokPlugin (works on ANY constraint): setAxisFriction(c, axis, v), setAxisMode(c, axis, mode), setAxisMinLimit(c, axis, v),
//   setAxisMaxLimit(c, axis, v), setAxisMotorType(c, axis, t), setAxisMotorTarget(c, axis, v), setAxisMotorMaxForce(c, axis, v),
//   + the matching getters, setEnabled/getEnabled, setCollisionsEnabled/getCollisionsEnabled, disposeConstraint
// PhysicsBody: addConstraint(childBody: PhysicsBody, constraint: PhysicsConstraint, instanceIndex?: number, childInstanceIndex?: number): void
// raw (HavokPhysics.d.ts): HP_Constraint_GetAppliedImpulses(id): [Result, Vector3 /*lin*/, Vector3 /*ang*/]
//   HP_Constraint_SetAxisMotorPositionTarget/VelocityTarget/Stiffness/Damping(id, axis, v), Get… variants,
//   ConstraintMotorType { NONE, VELOCITY, POSITION, SPRING_FORCE, SPRING_ACCELERATION }  (Babylon maps only the first three)
```
Enum values: `PhysicsConstraintType` BALL_AND_SOCKET 1, DISTANCE 2, HINGE 3, SLIDER 4, LOCK 5, PRISMATIC 6, SIX_DOF 7.
`PhysicsConstraintAxis` LINEAR_X 0 (along axisA), LINEAR_Y 1 (along perpAxisA), LINEAR_Z 2 (axisA × perpAxisA),
ANGULAR_X 3, ANGULAR_Y 4, ANGULAR_Z 5, LINEAR_DISTANCE 6. `PhysicsConstraintAxisLimitMode` FREE 0, LIMITED 1, LOCKED 2.
`PhysicsConstraintMotorType` NONE 0, VELOCITY 1, POSITION 2.

**[RT] Axis modes each class sets** (LIN_X, LIN_Y, LIN_Z, ANG_X, ANG_Y, ANG_Z, LIN_DIST; 0 free, 1 limited, 2 locked):

| class | modes | notes |
|---|---|---|
| BallAndSocket | 2 2 2 0 0 0 0 | |
| Hinge | 2 2 2 **0** 2 2 0 | ANGULAR_X free; limits read ±3.4e38 until set |
| Slider | **0** 2 2 **0** 2 2 0 | also spins about its axis — a drawer would roll |
| Prismatic | **0** 2 2 2 2 2 0 | |
| Lock | 2 2 2 2 2 2 0 | |
| Distance(d) | 0 0 0 0 0 0 **1** | min = max = d. Rope: `plugin.setAxisMinLimit(c, LINEAR_DISTANCE, 0)` (not run) |
| 6DoF, `limits: []` | all 0 | a limit with min = max = 0 → LOCKED, otherwise LIMITED |

- **[SRC]** `initConstraint` defaults: missing pivot → (0,0,0); missing axis → (1,0,0); missing perpAxis →
  `axis.getNormalToRef()` ((0,1,0) → (1,0,0); (1,0,0) and (0,0,1) → (0,−1,0)). The same local axis on both bodies gives
  the same perp, so the zero angle means "both local frames aligned". Pass explicit unit `perpAxisA/B` anyway.
- **[RT]** Getters return **numbers**: `isEnabled` 1/0 after add (false before add and after dispose),
  `isCollisionsEnabled` 0 by default.
- **[RT]** `plugin.getAxisMotorTarget()` **throws** ("Cannot convert … to uint64_t": it passes `_pluginData` instead of
  the id). Read `hk.HP_Constraint_GetAxisMotorPositionTarget(c._pluginData[0], hk.ConstraintAxis.ANGULAR_X)[1]`.

### 1.2 Attaching and coordinate spaces
```ts
import { HingeConstraint, PhysicsConstraintAxis, PhysicsConstraintAxisLimitMode, Vector3, type HavokPlugin } from "@babylonjs/core";
// frame: STATIC body at (-0.5, 1.05, 0); door: DYNAMIC 0.9 x 2.0 x 0.04 box at (0, 1.05, 0), 20 kg
const hinge = new HingeConstraint(
  new Vector3(0.05, 0, 0),    // pivotA, FRAME-local (relative to the frame's TransformNode origin)
  new Vector3(-0.45, 0, 0),   // pivotB, DOOR-local (its left edge) — must be the same WORLD point as pivotA
  new Vector3(0, 1, 0), new Vector3(0, 1, 0), scene);  // axisA / axisB, body-local
frame.addConstraint(door, hinge);                       // parent = frame, child = door; the Havok joint is created HERE
const p = scene.getPhysicsEngine()!.getPhysicsPlugin() as HavokPlugin;
p.setAxisMode(hinge, PhysicsConstraintAxis.ANGULAR_X, PhysicsConstraintAxisLimitMode.LIMITED);
p.setAxisMinLimit(hinge, PhysicsConstraintAxis.ANGULAR_X, -100 * Math.PI / 180);
p.setAxisMaxLimit(hinge, PhysicsConstraintAxis.ANGULAR_X, 100 * Math.PI / 180);
p.setAxisFriction(hinge, PhysicsConstraintAxis.ANGULAR_X, 0.5);   // N*m of constant resisting torque
```
Equivalent with `Physics6DoFConstraint` (typed methods, bitwise-identical motion **[RT]**):
```ts
const X = new Vector3(1, 0, 0), Y = new Vector3(0, 1, 0), A = PhysicsConstraintAxis;
const c = new Physics6DoFConstraint({ pivotA, pivotB, axisA: Y, axisB: Y, perpAxisA: X, perpAxisB: X }, [
  { axis: A.LINEAR_X, minLimit: 0, maxLimit: 0 }, { axis: A.LINEAR_Y, minLimit: 0, maxLimit: 0 }, { axis: A.LINEAR_Z, minLimit: 0, maxLimit: 0 },
  { axis: A.ANGULAR_Y, minLimit: 0, maxLimit: 0 }, { axis: A.ANGULAR_Z, minLimit: 0, maxLimit: 0 },
  { axis: A.ANGULAR_X, minLimit: -100 * Math.PI / 180, maxLimit: 100 * Math.PI / 180 },
], scene);
frame.addConstraint(door, c);
c.setAxisFriction(A.ANGULAR_X, 0.5);   // only AFTER addConstraint
```
- **[RT] Body-local, origin-relative:** frame at (5,1,3) rotated 30°, door COM moved to (0.3,0.2,0) with
  `setMassProperties`: after 30 steps without gravity the door moved 0.000 m and the pivot gap stayed 0.
- **[RT]** If the pivots are not the same world point at creation, the solver pulls the bodies together (world-space
  pivots passed by mistake: 1.55 m jump). pivotB = `inverse(childRotation) * (worldPivot − childPosition)`.
- **[RT] Before `addConstraint`**, setters throw `TypeError: _pluginData is not iterable`; getters return null.
- **[RT] Connected bodies don't collide** (`collision: false` default). `c.isCollisionsEnabled = true` pushed an
  overlapping box out of its post.
- **[RT]** The **same constraint object added to two pairs** makes two Havok joints; setters loop over all, getters read
  the first.
- **[RT] `isEnabled = false` / `true`** works; re-enabling after the bodies drifted 1.2 m apart pulls them back in ~6 steps
  (≈ 50 %/step, 25 N·s on 5 kg in the first step). No explosion.

### 1.3 Lifecycle, leaks, re-pointing
- **[RT]** `c.dispose()` = `HP_Constraint_SetEnabled(false)` + `HP_Constraint_Release`; `_pluginData.length = 0`;
  `isEnabled` → false; a second `dispose()` is harmless. Reading `GetAppliedImpulses` on a disposed constraint throws
  in JS (`_pluginData[0]` undefined) — guard with `c._pluginData.length`.
- **[RT] Leak:** Havok's constraint counter (`hk.HP_GetStatistics()[1][2]`) **never decreases** after `dispose()`; only
  `scene.dispose()` (world release) frees them. 20 000 create+dispose cycles in one world: WASM heap 16 → 84 MB
  (**≈ 3.5 KB per constraint**) and an otherwise idle 21-body world went from **0.30 to 1.02 ms/step**.
- **[RT] No re-pointing:** `HP_Constraint_SetChildBody(id, otherBody)` (also with re-set parent/anchors, while disabled
  or enabled) returns RESULT_OK and `GetChildBody` reports the new body, but the joint has **no effect** on it.
- **[RT]** Disposing a **body** that still has a constraint: no error; the joint is inert; a new body reusing the Havok
  id is not affected. Order to use anyway: `constraint.dispose()`, then the body.
- **[RT]** `scene.dispose()` frees live constraints in Havok but not their JS wrappers — never use them again. One WASM
  instance that had gone through ~7 world create/dispose cycles with live constraints **crashed the renderer** on a later
  `setAxisMotorMaxForce`; with one WASM instance per world it never crashed. In the game: one world, dispose constraints
  before their bodies.
- **[RT]** Each WASM instance only accepts its own handles: calling `hkA.HP_Constraint_*` with a joint of instance B →
  `RuntimeError: null function`.

## 2. Limits, friction, motors

### 2.1 Angles and limits **[RT]**
- `ANGULAR_X` = rotation of the child's constraint frame relative to the parent's about `axisA`, zero when `perpAxisB`
  (child-local) lines up with `perpAxisA` (parent-local). Positive = right-hand rotation about `axisA` in Babylon's
  numbers: +θ about +Y maps local +X to (cos θ, 0, −sin θ) (POSITION target +0.5 rad → measured +0.500). An impulse +Z at
  the +X edge of an unrotated door gives a **negative** angle.
- Measuring it yourself (as the probes do): `relAngle(parent, child, axis, perp)` in `physics-constraints-util.ts`.
- Door (20 kg, I_hinge 5.40 kg·m²), limits ±100°, friction 0.5, kicked to ≈ 5 rad/s: min −101.3° (1.3° overshoot), then
  it **bounces back** (~25 % of the speed) and swings to +10.6° after 2 s. Mirror image the other way. Pivot gap 0 mm.
- **Re-creating at 60°** (POSITION motor opened the door to 60.0°, joint disposed, new joint with the **same local
  pivots/axes/perps**): position jump 0 mm, rotation jump 0°, angle reads 60°, a 120 N·m push stops at **+100°** and the
  opposite push at **−100°** → limits stay relative to the closed pose. With `perpAxisB` recomputed from the current pose
  (= frame perp expressed in the door's current local frame) the zero moves to 60°: limits became −40°…+160°.

### 2.2 Friction **[RT]**
Free door (angular damping 0), kicked to 2.5 rad/s, deceleration over 20 steps → torque = I·Δω/Δt:

| friction | 0 | 2 | 5 | 10 | 20 |
|---|---|---|---|---|---|
| measured torque (N·m) | 0.26 | 2.24 | 5.21 | 10.17 | 20.12 |

On the prismatic drawer, `setAxisFriction(LINEAR_X, 1)` = 1 N (not separately measured).

### 2.3 Motors **[RT]**
```ts
p.setAxisMotorType(c, PhysicsConstraintAxis.ANGULAR_X, PhysicsConstraintMotorType.POSITION); // 1. type
p.setAxisMotorTarget(c, PhysicsConstraintAxis.ANGULAR_X, 0);   // 2. target: rad (POSITION) or rad/s (VELOCITY); m, m/s on linear axes
p.setAxisMotorMaxForce(c, PhysicsConstraintAxis.ANGULAR_X, 30); // 3. max torque N*m (max force N on linear axes)
p.setAxisMotorMaxForce(c, PhysicsConstraintAxis.ANGULAR_X, 0);  // release (latch broken / opened) — NOT motor type NONE
```
- **Order:** target 0.6 set while the type was NONE → raw target 0 and the motor later held 0; target set after the type
  works (−0.4 → door at −0.400 rad).
- **Latch** (POSITION, target 0, maxForce 30 N·m), constant push at the door edge for 1 s:

| push torque (N·m) | 9 | 18 | 27 | 28.8 | 31.5 | 36 | 54 |
|---|---|---|---|---|---|---|---|
| angle after 1 s | 0° | 0° | 0° | 0° | −1.9° | −26.3° | −92.4° |
| motor torque from the applied impulse | 9.85 | 18.0 | 27.1 | 28.8 | 30.0 | 30.0 | 30.1 |

  Kicks at the edge with the motor left on: 2 N·s → −0.5°, 5 → −3.4°, 10 → −14°, 20 → −56°, 40 → −101° (limit); each
  time it springs back to ~0° within ~1 s. A breakable latch = watch |θ| (e.g. > 3–5°) or the saturated motor torque,
  then release with maxForce 0.
- **Release variants** (POSITION 30 N·m, then a 5 N push at the edge): maxForce 0 → moves exactly like a door that never
  had a motor (−11.9° / 1 s); VELOCITY + target 0 + maxForce 0 → same; **`setAxisMotorType(NONE)` → stays latched**
  (raw type still POSITION, maxForce still 30; a 90 N·m push opened it with the motor still applying 30 N·m).
- **Powered "use" opening:** a POSITION target of 60° with 200 N·m reached 60.0° in < 3 s; then maxForce 0 frees it.
- **Velocity motor (ceiling fan)**: 2 kg blade bar (I 0.24 kg·m²) on a vertical hinge, VELOCITY target 10 rad/s, maxForce
  2 N·m: ω = 2.0, 4.0, 5.9, 7.8, 9.6, 9.98 every 0.25 s (α 8.1 rad/s² = 1.94 N·m / I), steady 9.984. Target 0 → brakes at
  the same rate. maxForce 0 → coasts (9.98 → 9.03 in 1 s, angular damping 0.1). Positive target = positive ω about +axis.
- `HP_Constraint_SetAxisMotorTarget` sets the position target under POSITION and the velocity target under VELOCITY.
- **Raw spring motor** works: `hk.HP_Constraint_SetAxisMotorType(id, hk.ConstraintAxis.LINEAR_Y, hk.ConstraintMotorType.SPRING_ACCELERATION)`
  + `…MotorPositionTarget/VelocityTarget/Stiffness(ω²)/Damping(2ζω)` + Babylon `setAxisMotorMaxForce`. 3 Hz critically
  damped: sags by g/ω² (2.4 cm measured), otherwise like POSITION. A POSITION motor on `LINEAR_DISTANCE` produced **no
  force** at all.

## 3. Joint loads (breakable hinges, latches, slides) **[RT]**
`HP_Constraint_GetAppliedImpulses(id)` (Havok ≥ 1.3.11) returns the impulse the joint applied during the last step,
**world space, acting on the CHILD**: linear part at the pivot (N·s), angular part = the pure couple of the locked/limited
angular axes + motor + friction (N·m·s). Divide by dt for N / N·m.
```ts
import type { HavokPhysicsWithBindings } from "@babylonjs/havok";
const hk = (scene.getPhysicsEngine()!.getPhysicsPlugin() as HavokPlugin)._hknp as HavokPhysicsWithBindings;
function jointLoad(c: PhysicsConstraint, dt: number): { lin: Vector3; ang: Vector3 } | null {  // N, N*m on the child
  const ids = (c as unknown as { _pluginData: [bigint][] })._pluginData;
  if (!ids || ids.length === 0) return null;                       // not added yet / disposed
  const [, l, a] = hk.HP_Constraint_GetAppliedImpulses(ids[0]);
  return { lin: new Vector3(l[0], l[1], l[2]).scaleInPlace(1 / dt), ang: new Vector3(a[0], a[1], a[2]).scaleInPlace(1 / dt) };
}
```
| case | linear | angular | expected |
|---|---|---|---|
| 20 kg door hanging from one ball socket | (−0.08, 3.265, 0) N·s | 0 | m·g·dt = 3.27 |
| 20 kg door on a vertical hinge through its edge (cantilever) | (0, 3.166, 0) | (0, 0, 1.425) | 3.27 / m·g·0.45·dt = 1.472 |
| same, step after a 10 N·s kick at the free edge | z 4.98 (pivot reaction) | | |
| latch pushed with 18 N·m | | y 0.300 = 18 N·m·dt | motor torque included |
| drawer (3 kg) resting at its 0.45 m limit | 29.4 N | | m·g = 29.4 |

**Impacts are 1-step spikes** (door 0.06 m thick, 20 kg, static load 190 N / 86 N·m):

| projectile | peak force | peak torque | steps above 2× static |
|---|---|---|---|
| 10 kg @ 5 m/s | 400 N | 434 N·m | 1 |
| 1 kg @ 10 m/s | 241 N | 173 N·m | 0 |
| 30 kg @ 3 m/s | 447 N | 381 N·m | 1 |

Recipe: per joint per step, `excessImpulse = max(0, |lin|·dt − staticLoad·dt)`; break on a single-step impulse above
J_break (impacts), or when `|lin| > F_max` / `|ang| > T_max` for N consecutive steps (sustained pulls; the grab force of
§6 is known exactly). Feed impact-side damage from the collision events as usual.

**Two hinges represented by one joint [DER]:** for hinges at ±h/2 along the unit axis `a` around the joint pivot, with
the joint's force `L` and couple `T` (from `jointLoad`), `T⊥ = T − a(a·T)`:
`F_top = L/2 + (T⊥ × a)/h`, `F_bottom = L/2 − (T⊥ × a)/h` (cantilever door, h = 1.4 m: ±63 N horizontal + 98 N each).
Two separate hinge joints on the same axis are stable too (sag 0.007 mm vs 0.31 mm), but their load split is arbitrary
(top 201 N / 1.9 N·m, bottom 23 N / 14 N·m) → use one joint and split analytically.

## 4. The six joint scenarios **[RT]**
| | setup | result |
|---|---|---|
| (a) door | hinge on a static frame, ±100°, friction 0.5, 30 N·s kick | stops at the limit (1.3° overshoot), rebounds ~25 % (§2.1) |
| (b) latch | POSITION 0 rad, 30 N·m | holds ≤ 28.8 N·m pushes, kicks ≥ 20 N·s open it, maxForce 0 frees it (§2.3) |
| (c) drawer | `PrismaticConstraint` along local Z, LINEAR_X limited [0, 0.45], friction 1 N, 3 kg | 6 N·s pull → stops at exactly 0.450 (no bounce, v 0); −6 N·s → stops at 0.000; constraint disposed at full extension → tips out and falls to the floor (rot 174°), speeds 0.16, 0.32, 0.33, 0.45… (no pop). Overlapping a solid cabinet by 2 cm when released: it just fell through the overlap, no explosion |
| (d) hinge → ball | door swinging at −25°, hinge disposed, `BallAndSocketConstraint` at the top hinge in the same step | speed continuous (0.594 → 0.596 → 0.603…), pivot gap 0.19 → 0.005 mm, door swings down about the top pivot (max 1.3 m/s), ball load ≈ m·g. Note: it then passes through the frame (connected bodies don't collide) |
| (e) re-create at 60° | same local frames | no jump, limits still relative to closed (§2.1) |
| (f) fan | VELOCITY 10 rad/s, 2 N·m | spins up at maxForce/I, holds 9.98 rad/s (§2.3) |

Drawer code:
```ts
const pivotA = new Vector3(0, 0, 0.01);                                    // closed drawer origin in cabinet-local coords
const pr = new PrismaticConstraint(pivotA, Vector3.Zero(), new Vector3(0, 0, 1), new Vector3(0, 0, 1), scene);
cabinet.addConstraint(drawer, pr);                                          // LINEAR_X = travel along +Z
p.setAxisMode(pr, PhysicsConstraintAxis.LINEAR_X, PhysicsConstraintAxisLimitMode.LIMITED);
p.setAxisMinLimit(pr, PhysicsConstraintAxis.LINEAR_X, 0);
p.setAxisMaxLimit(pr, PhysicsConstraintAxis.LINEAR_X, 0.45);
p.setAxisFriction(pr, PhysicsConstraintAxis.LINEAR_X, 1);
```

## 5. Slow-velocity damping (affects pushes, drags, holds) **[RT]**
Free box, zero gravity, `ALWAYS_ACTIVE`, angular damping 0, velocity set once:

| v0 (m/s) | 0.05 | 0.10 | 0.15 | 0.2 – 0.5 |
|---|---|---|---|---|
| loss in the 1st step | 0.0052 | 0.0039 | 0 | 0 |
| after 10 steps | 0 | 0.051 | 0.15 | unchanged |

- Identical for 1, 10 and 100 kg; pure spin (0.05–1 rad/s) is **not** damped; a box sliding at 0.1 m/s on a frictionless
  floor stops within 0.5 s.
- Consequences: 10 kg pushed by 0.5/1/3 N for 1 s → **never moves**; 10 N → 0.96 m/s instead of 1.0. A hinged door pushed
  with 2 N at its edge → never opens; 5 N → 12° instead of 24° in 1 s. A velocity-driven grab hovers ~6 mm off target.
- `ALWAYS_ACTIVE` does not change it; there is no API to tune it. Keep per-step Δv ≫ 0.005 m/s (force ≫ 0.3·m N), or set
  velocities directly (velocity re-set every step lost ~16 %: 0.02 m/s for 1 s moved 16.8 mm).

## 6. Grab / hold

### 6.1 Comparison **[RT]**
Target 1.5 m in front at 1.2 m height; "swing" = target yawed 90° around the player in 0.25 s; "wall" = target 0.6 m
inside a static wall. Caps: lift (Y) 450 N, push (X/Z) 300 N. Error measured at the grab point.

| method / mass | lift: reach (steps), final err, jitter | swing: max err, settle | wall: penetration, force | 60 kg |
|---|---|---|---|---|
| **joint, POSITION motors**, 1 kg | 30, 0.001 cm, 0 mm | 12.6 cm, at once | 2.9 mm, 300 N | — |
| joint, POSITION, 30 kg | 45, 0.001 cm, 0 mm | lags 167 cm (cap), tail jitter 15 mm | 0.13 mm, keeps height | stays on floor (451 N), **dragged** to the target |
| joint, raw SPRING_ACCEL 3 Hz, 1 / 30 kg | 17 / 41, **2.4 cm sag** | 16 cm / 30 kg jitter 268 mm | 2.4 / 0.11 mm | dragged |
| manual velocity controller (gravity first, err clamp), 1 kg | 19, 0.6 cm (dead band) | 20.7 cm | 1.3 mm | — |
| manual velocity controller, 30 kg | 39, 0.6 cm | **oscillates, jitter 227 mm** | 0.15 mm | dragged |
| v1 manual controller with one isotropic 450 N cap, 30 kg | 39 | jitter 375 mm | **sagged 1.2 → 0.74 m** against the wall | (100 kg) dragged, overshoots 15 cm |

Other measurements: grab at a corner (no angular motors, angular damping 3) → hangs with the COM 15 cm below the grab
point; per-axis caps mean a diagonal pull can reach √(450² + 2·300²) = 636 N; the joint's force readout matched m·g
(10.02 N for 1 kg, 299.7 N for 30 kg) and the caps (300 N into the wall). Angular POSITION motor targets rotate the held
object relative to the anchor: ANGULAR_X 0.5 → pitch +0.5 (Euler x), ANGULAR_Y → yaw +0.5, ANGULAR_Z → roll +0.5
(combined targets don't compose like Euler angles: yaw 0.6 + pitch 0.3 → (0.246, 0.621, 0.173)); yawing the anchor 90°
turned the object by exactly 90°. Pulling a hinged door at its edge 1 m towards the player swung it 24° → 64° (≈ 434 N,
hinge reaction 420–505 N). **A joint between the ANIMATED anchor and a STATIC body applies 0 N** (both infinite mass).

**Recommendation:** the joint (POSITION motors) — exact, stable against walls, force-capped per axis, drags heavy
objects, works on hinged bodies, and the force is readable for bond stress. One new joint per grab (~3.5 KB, §1.3).
For STATIC islands (cabinets screwed to walls) skip the joint and compute the pull force yourself.

### 6.2 Snippet (same logic as `GrabJoint` in `physics-constraints-grab2.probe.ts`, POSITION variant)
```ts
import { Vector3, Quaternion, TransformNode, PhysicsBody, PhysicsShapeSphere, PhysicsMotionType, Physics6DoFConstraint,
  PhysicsConstraintAxis, PhysicsConstraintMotorType, type Scene, type HavokPlugin } from "@babylonjs/core";
import type { HavokPhysicsWithBindings } from "@babylonjs/havok";

const LIN = [PhysicsConstraintAxis.LINEAR_X, PhysicsConstraintAxis.LINEAR_Y, PhysicsConstraintAxis.LINEAR_Z];
const ANG = [PhysicsConstraintAxis.ANGULAR_X, PhysicsConstraintAxis.ANGULAR_Y, PhysicsConstraintAxis.ANGULAR_Z];

export class GrabJoint {
  readonly anchor: PhysicsBody;                       // persistent, ANIMATED, collides with nothing
  joint: Physics6DoFConstraint | null = null;
  held: PhysicsBody | null = null;
  liftN = 450; pushN = 300; holdTorqueNm = 60;        // holdTorqueNm 0 => object hangs from the grab point
  private readonly scene: Scene; private readonly hk: HavokPhysicsWithBindings; private readonly dt: number;
  constructor(scene: Scene) {
    this.scene = scene;
    const plugin = scene.getPhysicsEngine()!.getPhysicsPlugin() as HavokPlugin;
    this.hk = plugin._hknp as HavokPhysicsWithBindings;
    this.dt = plugin.getTimeStep();
    const n = new TransformNode("grabAnchor", scene);
    n.position.set(0, -50, 0); n.rotationQuaternion = Quaternion.Identity(); n.computeWorldMatrix(true);
    this.anchor = new PhysicsBody(n, PhysicsMotionType.ANIMATED, false, scene);
    const s = new PhysicsShapeSphere(Vector3.Zero(), 0.01, scene);
    s.filterMembershipMask = 0; s.filterCollideMask = 0;
    this.anchor.shape = s;
  }
  /** Grab DYNAMIC `body` at world point `p`; `rot` = anchor rotation (camera yaw only, so the Y cap stays vertical). */
  grab(body: PhysicsBody, p: Vector3, rot: Quaternion): void {
    this.release();
    const n = body.transformNode, inv = Quaternion.Inverse(n.rotationQuaternion!);
    const pivotB = p.subtract(n.position).applyRotationQuaternion(inv);
    const ax = new Vector3(1, 0, 0).applyRotationQuaternion(rot).applyRotationQuaternion(inv);
    const ay = new Vector3(0, 1, 0).applyRotationQuaternion(rot).applyRotationQuaternion(inv);
    const an = this.anchor.transformNode;               // teleport the anchor onto the grab point (zero initial error)
    an.position.copyFrom(p); an.rotationQuaternion!.copyFrom(rot);
    this.hk.HP_Body_SetQTransform(this.anchor._pluginData.hpBodyId, [[p.x, p.y, p.z], [rot.x, rot.y, rot.z, rot.w]]);
    const c = new Physics6DoFConstraint({ pivotA: Vector3.Zero(), pivotB, axisA: new Vector3(1, 0, 0), perpAxisA: new Vector3(0, 1, 0),
      axisB: ax, perpAxisB: ay }, [], this.scene);
    this.anchor.addConstraint(body, c);                 // setters only after this
    const caps = [this.pushN, this.liftN, this.pushN];  // anchor-frame X, Y (up), Z
    LIN.forEach((a, i) => { c.setAxisMotorType(a, PhysicsConstraintMotorType.POSITION); c.setAxisMotorTarget(a, 0); c.setAxisMotorMaxForce(a, caps[i]); });
    if (this.holdTorqueNm > 0) for (const a of ANG) { c.setAxisMotorType(a, PhysicsConstraintMotorType.POSITION); c.setAxisMotorTarget(a, 0); c.setAxisMotorMaxForce(a, this.holdTorqueNm); }
    this.joint = c; this.held = body;
  }
  /** Every fixed step BEFORE the physics step: where the grab point should be (and the camera yaw). */
  update(target: Vector3, rot: Quaternion): void { this.anchor.setTargetTransform(target, rot); }
  /** R + mouse: rotate the held object relative to the anchor (radians). */
  setRotation(pitch: number, yaw: number): void {
    this.joint?.setAxisMotorTarget(PhysicsConstraintAxis.ANGULAR_X, pitch);
    this.joint?.setAxisMotorTarget(PhysicsConstraintAxis.ANGULAR_Y, yaw);
  }
  /** Force (N, world) the hand applied to the held body during the last step -> bond stress / destruction.pull(). */
  force(): Vector3 {
    const ids = (this.joint as unknown as { _pluginData?: [bigint][] } | null)?._pluginData;
    if (!ids || ids.length === 0) return Vector3.Zero();
    const l = this.hk.HP_Constraint_GetAppliedImpulses(ids[0])[1];
    return new Vector3(l[0], l[1], l[2]).scaleInPlace(1 / this.dt);
  }
  release(): void { this.joint?.dispose(); this.joint = null; this.held = null; }
}
// STATIC or world-anchored islands: no joint (it would apply 0 N). Pull force for destruction.pull():
//   d = target - grabPoint;  F = d.normalize() * Math.min(maxPullN, kPull * |d|)   (e.g. kPull 2000 N/m, maxPullN 450)
```
Usage notes: switch the held body's **leaf** shapes to the HELD layer while held (HELD doesn't collide with PLAYER);
`plugin.setActivationControl(body, PhysicsActivationControl.ALWAYS_ACTIVE)` while held, back to SIMULATION_CONTROLLED
on release; throw = `release()` + `setLinearVelocity`; drop when `|grabPoint − target| > 1.2 m`.

## 7. PhysicsCharacterController

### 7.1 API (from `characterController.d.ts`)
```ts
new PhysicsCharacterController(position: Vector3 /* capsule CENTRE */, characterShapeOptions: CharacterShapeOptions, scene: Scene)
interface CharacterShapeOptions { shape?: PhysicsShape; capsuleHeight?: number /* default 1.8 */; capsuleRadius?: number /* default 0.6! */ }
// properties (defaults verified [RT]):
keepDistance = 0.05; keepContactTolerance = 0.1; maxCastIterations = 10; penetrationRecoverySpeed = 1;
staticFriction = 0; dynamicFriction = 1; maxSlopeCosine = 0.5 /* 60° */; maxStepHeight = 0; footOffset = height/2;
maxCharacterSpeedForSolver = 10; up = (0,1,0); characterStrength = 1e38 /* N */; acceleration = 0.05; maxAcceleration = 50;
characterMass = 0; onTriggerCollisionObservable: Observable<ICharacterControllerCollisionEvent> /* {collider, colliderIndex, impulse, impulsePosition} */
// methods:
dispose(): void
get shape(): PhysicsShape; set shape(value: PhysicsShape)            // setter disposes the previously owned capsule
get shapeOptions(): CharacterShapeOptions
setShapeOptions(o: CharacterShapeOptions, preserveFootPosition = true): void   // crouch/stand
getPosition(): Vector3            // the INTERNAL vector (same object every call) — clone before keeping/mutating
setPosition(position: Vector3): void   // teleport
getVelocity(): Vector3            // internal vector too
setVelocity(velocity: Vector3): void
checkSupport(deltaTime: number, direction: Vector3): CharacterSurfaceInfo
checkSupportToRef(deltaTime: number, direction: Vector3, surfaceInfo: CharacterSurfaceInfo): void
integrate(deltaTime: number, surfaceInfo: CharacterSurfaceInfo, gravity: Vector3): void
moveWithCollisions(displacement: Vector3): void   // uses scene.deltaTime — not for fixed stepping
calculateMovement(deltaTime, forwardWorld, surfaceNormal, currentVelocity, surfaceVelocity, desiredVelocity, upWorld): Vector3
calculateMovementToRef(…same…, result: Vector3): boolean
interface CharacterSurfaceInfo { isSurfaceDynamic: boolean; supportedState: CharacterSupportedState /* UNSUPPORTED 0, SLIDING 1, SUPPORTED 2 */;
  averageSurfaceNormal: Vector3; averageSurfaceVelocity: Vector3; averageAngularSurfaceVelocity: Vector3 }
```

### 7.2 How it works **[SRC]**, confirmed **[RT]** where marked
- It owns a TransformNode `"CCTransformNode"` and an **ANIMATED PhysicsBody** with the capsule (infinite inertia,
  `disablePreStep = false` → teleported to the node at each step's pre-step) **[RT]**. Dynamic bodies collide with it as
  with an immovable object: a 10 kg box dropped on the head rested on it (43 contact events) and stayed behind when the
  character walked away **[RT]**. **Raycasts hit it** → pass `ignoreBody: characterBody(cc)` or exclude PLAYER **[RT]**.
- Movement is a JS solver: shape proximity + shape casts of `cc.shape` against the world (ignoring its own body),
  contact manifold, simplex solve. **The capsule shape's filter masks are the query filter**: membership PLAYER,
  collide STATIC|DYNAMIC → the character walked straight through DEBRIS slabs (debris untouched) **[RT]**.
- **Pushing:** for each manifold contact with a DYNAMIC body, an impulse along the normal makes the contact point keep
  up with the character, clamped to `characterStrength · dt`, and fires `onTriggerCollisionObservable` (misnamed) with
  the impulse. **Weight:** `characterMass · g` pressing on supports — 0 by default.
- `checkSupport` reports `isSurfaceDynamic` but **surface velocity only for ANIMATED bodies**, tracked per
  `scene.getFrameId()` (breaks with ≠ 1 fixed step per render); for DYNAMIC supports it is 0 (a crate pushed at 2 m/s slid
  out from under the character **[RT]**).
- Uses `transformNode.getWorldMatrix()` of contacted bodies (COM for push impulses, animated surfaces) — stale when several
  fixed steps run per render (small error).
- The simplex treats every manifold plane as touching (time of impact 0) regardless of its distance → the character stops
  as soon as a surface is within keepDistance + keepContactTolerance → **hover** (below).

### 7.3 Verified behaviour **[RT]** (capsule 1.8 × 0.3, `FpsMover` of §7.4)
| test | result |
|---|---|
| rest height (feet gap) after falling/landing, defaults 0.05/0.1 | **0.05–0.15 m** depending on arrival (drop 1 m → 0.094, walk off 0.3 m ledge → 0.123, start 0.35 → 0.137) |
| same with keepDistance 0.02 / keepContactTolerance 0.03 (snippet) | 0.014–0.05 m (start 0.3 → 0.014, walk-off 0.044, 2 m drop 0.043); 0.01/0.02 → 0.007–0.026 |
| walk yaw 0 (+Z), 3.6 m/s, acceleration 0.35 | 3.52 m/s after 10 steps, 3.60 after 20; 7.04 m in 2 s; strafe right at yaw 90° → −Z ✓; stops in < 0.5 s |
| jump 1.0 m (with 6-step grace) | apex 1.037 m, 54 airborne steps (0.9 s ✓); **without grace: apex 0.074 m** |
| walk off a 0.3 m ledge / down a 20° ramp | falls and lands / stays grounded every step (both keepDistance settings) |
| static steps 3 / 5 / 10 cm | climbed by the round capsule (feet peak 0.08–0.09 / 0.10–0.11 / 0.16–0.24), any settings |
| static step 20 cm | keepDistance 0.05 (default): blocked with `maxStepHeight` 0 and 0.35. **keepDistance 0.02 + `maxStepHeight` 0.35: climbed** (0 → blocked) |
| static steps 35 / 50 cm | blocked in every configuration (the step-up's forward sweep only covers v·dt − keepDistance) |
| five 5 cm dynamic debris slabs (1.5 kg) | default masks: rides over (feet ≤ 0.12), shoves debris 2–17 cm; filtered capsule (PLAYER vs STATIC\|DYNAMIC): walks through, debris untouched |
| 2 kg box / 200 kg box, `characterStrength` 1e38 (default) | both pushed: 200 kg box moved 6–6.7 m at 2–2.7 m/s, up to 530 N·s in one step |
| same with `characterStrength = 600` | 2 kg pushed 4–5 m; **200 kg not moved, character blocked** (impulse capped at 10 N·s = 600·dt) |
| stand on a 50 kg dynamic crate | SUPPORTED, isSurfaceDynamic true, support contact = crate at its top (normal y 1); jump from it 1.037 m |
| seesaw plank (20 kg, hinged in the middle), standing 1.5 m out | characterMass 0 → 0° (keepDistance 0.05) / −4.1° creeping (0.02); **characterMass 80 → −14.6°** both |
| landing detection (`landingSpeed`) | one event per landing: 0.5 m drop 3.107 m/s (√2gh 3.069), 2 m 6.213 (6.233), support = floor / crate |
| crouch `setShapeOptions({capsuleHeight: 1.1, capsuleRadius: 0.3})` | centre 0.95 → 0.60, feet kept at 0.05; passes under a 1.3 m beam that blocks standing (stopped at z 1.67) |
| standing up under the beam without a check | `setShapeOptions` accepted, capsule left 0.53 m inside the beam |
| headroom check: `plugin.shapeProximity` with a 1.8 m capsule, maxDistance 0, ignoreBody | open floor → no hit; under the beam → hit, distance −0.53 |
| update in `onBeforePhysicsObservable` vs `onAfterPhysicsObservable` | both fine: walking/jumps identical; pushing a 20 kg box: gap 22–92 mm (before) vs −1.5–66 mm (after); on a crate both rock-steady |
| cost | 0.2–0.6 ms per controller step (pure JS), comparable to a Havok step with 50 boxes |

### 7.4 FPS movement snippet (= `FpsMover` in `tests/probes/physics-constraints-ccutil.ts`, all rows above)
```ts
import { PhysicsCharacterController, CharacterSupportedState, Vector3, type CharacterSurfaceInfo, type Scene, type PhysicsBody } from "@babylonjs/core";

export interface MoveInput { forward: number; right: number; yaw: number /* 0 = +Z, pi/2 = +X */; speed: number; jump: boolean }

export class FpsMover {
  readonly cc: PhysicsCharacterController;
  readonly gravity = new Vector3(0, -9.81, 0);
  readonly up = new Vector3(0, 1, 0);
  jumpHeight = 1.0;
  airSpeedFactor = 0.3;
  jumpGraceSteps = 6;          // ignore SUPPORTED right after a jump (stale manifold still sees the floor)
  grounded = false;
  landingSpeed = 0;            // m/s on the landing step (stomps), else 0
  support: CharacterSurfaceInfo = { isSurfaceDynamic: false, supportedState: CharacterSupportedState.UNSUPPORTED,
    averageSurfaceNormal: new Vector3(), averageSurfaceVelocity: new Vector3(), averageAngularSurfaceVelocity: new Vector3() };
  private sinceJump = 1e9;
  private readonly down = new Vector3(0, -1, 0); private readonly fwd = new Vector3(); private readonly rightV = new Vector3();
  private readonly desired = new Vector3(); private readonly v = new Vector3();

  constructor(scene: Scene, feet: Vector3, height = 1.8, radius = 0.3) {
    this.cc = new PhysicsCharacterController(feet.add(new Vector3(0, height / 2, 0)), { capsuleHeight: height, capsuleRadius: radius }, scene);
    this.cc.acceleration = 0.35;      // default 0.05 is floaty
    this.cc.maxAcceleration = 40;
    this.cc.keepDistance = 0.02;      // hover 2–5 cm instead of 5–15 cm
    this.cc.keepContactTolerance = 0.03;
    this.cc.characterStrength = 600;  // N: pushes light things, blocked by heavy ones
    this.cc.characterMass = 80;       // kg pressing on dynamic supports
    // optional (verified with keepDistance 0.02): this.cc.maxStepHeight = 0.35 -> also climbs 20 cm steps (not 35 cm)
  }

  /** Once per fixed step, e.g. in player.fixedUpdate() before the Havok step (after it works too). */
  step(dt: number, inp: MoveInput): void {
    const cc = this.cc;
    cc.checkSupportToRef(dt, this.down, this.support);
    const s = this.support;
    this.fwd.set(Math.sin(inp.yaw), 0, Math.cos(inp.yaw));
    this.rightV.set(Math.cos(inp.yaw), 0, -Math.sin(inp.yaw));
    this.desired.copyFrom(this.fwd).scaleInPlace(inp.forward).addInPlace(this.rightV.scale(inp.right));
    const l = this.desired.length();
    if (l > 1) this.desired.scaleInPlace(1 / l);
    const cur = cc.getVelocity();
    this.sinceJump++;
    this.grounded = s.supportedState === CharacterSupportedState.SUPPORTED && (this.sinceJump > this.jumpGraceSteps || cur.y <= 0);
    if (this.grounded) {
      this.desired.scaleInPlace(inp.speed);
      cc.calculateMovementToRef(dt, this.fwd, s.averageSurfaceNormal, cur, s.averageSurfaceVelocity, this.desired, this.up, this.v);
      this.v.subtractInPlace(s.averageSurfaceVelocity);               // keep horizontal speed on slopes (Babylon PG pattern)
      if (this.v.dot(this.up) > 1e-3) {
        const len = this.v.length();
        this.v.normalizeFromLength(len);
        const horizLen = len / s.averageSurfaceNormal.dot(this.up);
        s.averageSurfaceNormal.cross(this.v).cross(this.up).scaleToRef(horizLen, this.v);
      }
      this.v.addInPlace(s.averageSurfaceVelocity);
      if (inp.jump) {
        this.v.addInPlace(this.up.scale(Math.sqrt(2 * -this.gravity.y * this.jumpHeight) - this.v.dot(this.up)));
        this.sinceJump = 0;
      }
    } else {
      this.desired.scaleInPlace(inp.speed * this.airSpeedFactor);
      cc.calculateMovementToRef(dt, this.fwd, this.up, cur, Vector3.ZeroReadOnly, this.desired, this.up, this.v);
      this.v.addInPlace(this.up.scale(cur.dot(this.up) - this.v.dot(this.up)));   // keep vertical velocity
      this.v.addInPlace(this.gravity.scale(dt));
    }
    const vyRequested = this.v.y;
    cc.setVelocity(this.v);
    cc.integrate(dt, s, this.gravity);
    this.landingSpeed = vyRequested < -1 && cc.getVelocity().y > vyRequested * 0.5 ? -vyRequested : 0;
  }
  get feetY(): number { return this.cc.getPosition().y - this.cc.footOffset; }
}

/** What the character stands on (footstep material, stomp target): contacts from the private manifold. */
export function supportContacts(cc: PhysicsCharacterController, minNormalY = 0.5) {
  const m = (cc as unknown as { _manifold: { position: Vector3; normal: Vector3; bodyB: { body: PhysicsBody; index: number } }[] })._manifold;
  return m.filter((c) => c.normal.y >= minNormalY && c.bodyB)
    .map((c) => ({ body: c.bodyB.body, index: c.bodyB.index, point: c.position.clone(), normal: c.normal.clone() }));
}
/** The controller's own ANIMATED capsule body (ignore it in raycasts/sweeps/proximity queries). */
export function characterBody(cc: PhysicsCharacterController): PhysicsBody { return (cc as unknown as { _body: PhysicsBody })._body; }
```
The walk/jump/crouch/landing/step/push rows of §7.3 were re-run with exactly this class (constructor settings included).
Layers: `cc.shape.filterMembershipMask = Layer.PLAYER;
cc.shape.filterCollideMask = Layer.STATIC | Layer.DYNAMIC;` — set them again after every `setShapeOptions`, which builds a
new `PhysicsShapeCapsule` with default masks **[SRC]**. Crouch:
```ts
// headroom check before standing up (verified): capsule of standing size, 1 cm above the feet
const standProbe = new PhysicsShapeCapsule(new Vector3(0, 0.6, 0), new Vector3(0, -0.6, 0), 0.3, scene); // 1.8 m tall, r 0.3
standProbe.filterMembershipMask = Layer.PLAYER; standProbe.filterCollideMask = Layer.STATIC | Layer.DYNAMIC;
function canStand(): boolean {
  const pos = mover.cc.getPosition(), feet = pos.y - mover.cc.footOffset;
  const a = new ProximityCastResult(), b = new ProximityCastResult();
  plugin.shapeProximity({ shape: standProbe, position: new Vector3(pos.x, feet + 0.9 + 0.01, pos.z), rotation: Quaternion.Identity(),
    maxDistance: 0, shouldHitTriggers: false, ignoreBody: characterBody(mover.cc) }, a, b);
  return !b.hasHit;
}
mover.cc.setShapeOptions({ capsuleHeight: 1.1, capsuleRadius: 0.3 });               // crouch (feet stay put)
if (canStand()) mover.cc.setShapeOptions({ capsuleHeight: 1.8, capsuleRadius: 0.3 }); // stand
```

## Pitfalls
1. Constraint pivots/axes are body-local and origin-relative; the Hinge/Slider `.d.ts` says "world" — wrong.
2. Axis setters before `addConstraint` throw; Hinge/Slider/Prismatic/Ball/Lock/Distance have no axis methods → use
   `plugin.setAxis*(c, …)` or `Physics6DoFConstraint`.
3. Motor: type → target → max force. Release with max force 0; motor type NONE is silently ignored.
4. `plugin.getAxisMotorTarget` throws; `isEnabled`/`isCollisionsEnabled` return 1/0 numbers.
5. `DistanceConstraint(d)` is a rigid rod (min = max = d). `SliderConstraint` lets the body spin about the axis — use
   `PrismaticConstraint` for drawers.
6. Every created constraint costs ~3.5 KB forever and slows the solver after disposal; joints can't be re-pointed.
   Never create joints per frame.
7. Limits are bouncy (~25 % rebound at 5 rad/s); add hinge friction/angular damping for dead stops.
8. A joint between an ANIMATED and a STATIC body does nothing (both infinite mass) — no grab joint on static islands.
9. Linear velocities below ~0.12 m/s are bled off at ~0.005 m/s per step (any activation mode): small forces do nothing.
10. Read joint loads with `HP_Constraint_GetAppliedImpulses(c._pluginData[0])` only while `_pluginData.length > 0`;
    impact loads are 1-step spikes.
11. One WASM instance per world, handles never cross instances; after `scene.dispose()` don't touch old constraint
    wrappers.
12. CharacterController: default radius 0.6, strength 1e38 (shoves 200 kg), mass 0 (weightless); set all three.
13. CC hovers up to keepDistance + keepContactTolerance (15 cm by default); jumps are cancelled unless SUPPORTED is
    ignored for a few steps after the jump.
14. CC: dynamic supports give surface velocity 0 (no riding); animated-surface velocity relies on `scene.getFrameId()`;
    natural ride-over ≈ r·(1 − maxSlopeCosine) = 15 cm; `maxStepHeight` only helps with a small keepDistance (0.02 +
    0.35 → 20 cm climbed; 35 cm never) because its forward sweep covers only v·dt − keepDistance.
15. CC: its ANIMATED capsule is hit by raycasts and blocks dynamic bodies like a wall — ignore it in queries, use
    layers; `getPosition()`/`getVelocity()` return internal vectors; `setShapeOptions` replaces the capsule (re-apply
    filter masks) and does no headroom check; `moveWithCollisions` uses `scene.deltaTime` (not fixed-step friendly).
