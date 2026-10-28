# Havok v2: bodies, shapes, mass, motion, stepping, performance
Babylon.js **9.30.0** (`@babylonjs/core`) + **@babylonjs/havok 1.3.14**, checked against the installed `.d.ts`/`.js` and run in headless Chromium.
Markers: **[RT]** = verified at runtime by a probe; **[SRC]** = read from the installed source only.
Probes: `tests/probes/physics-bodies-*.probe.ts`. The reusable helpers below live in `tests/probes/physics-bodies-snippets.ts`, and `physics-bodies-snippets.probe.ts` runs every one of them (no leaks). Copy them into `src/`; don't import from `tests/`.
Timings are CPU timings in a shared headless container with other agents running at the same time, so expect about ±50% noise.

## TL;DR
1. **Bodies live in world space.** They follow the node's world pose and work on a plain `TransformNode`. The default is `disablePreStep === true`: if you move a dynamic body's node, the next step writes the body's pose back over it. To teleport, use the TELEPORT prestep plus `plugin.setPhysicsBodyTransformation` (§1). **Call `node.computeWorldMatrix(true)` before `new PhysicsBody`** (stale-matrix bug, §1).
2. **Mass, COM and inertia are computed** from the shape tree and each leaf's `density` (default **1000 kg/m³**), but only inside `body.shape = …` and `setMassProperties()`. Changing a density or container children later does not update mass until you re-assign `body.shape = shape`. Overrides passed to `setMassProperties` are **sticky**: they survive shape swaps until you call `setMassProperties({})`.
3. **Container edits change collision but not mass.** A removed child stops colliding immediately and an added child collides from the next step, but mass/COM stay stale until `body.shape = container` (about 0.1 ms). `removeChild(i)` shifts later indices down. **Filter masks are read from LEAF shapes only**; the container's own mask is ignored.
4. **`PhysicsShapeConvexHull(mesh)` bakes only `mesh.absoluteScaling`**, not rotation or translation. A raw `HP_Shape_CreateConvexHull` from a `Float32Array` works with no mesh. 200 hulls × 30 pts takes about **100–175 ms** (8 pts: about 25 ms), so spread hull creation over frames. Degenerate inputs never fail; Havok inflates them by about 1.5 cm.
5. **Stepping.** `scene.render()` steps physics by `engine.getDeltaTime()`, which stays **0 unless `runRenderLoop` is running**, so a manual render loop advances only **1 ms per render**. In tests, `scene._advancePhysicsEngineStep(1000/60)` is exactly one 1/60 s step. Runs are **bitwise deterministic only with a fresh `HavokPhysics()` WASM instance per world**. In production, use a fixed-step accumulator (§11) or the engine's `deterministicLockstep` option.
6. **There is no CCD API.** Straight-line motion into **STATIC** bodies never tunneled (2 cm box at 200 m/s against a 6 mm slab or a zero-thickness mesh). Against **DYNAMIC/ANIMATED** bodies, objects tunnel from about **10 m/s**, even at 240 Hz. Spinning thin shards tunnel even through static slabs.
7. **Piles of about 1000 touching bodies never sleep**: about 15–18 ms per step indefinitely. Force-sleeping slow bodies brings that to about 1 ms, and they still wake on impact (§12). Babylon's own sync costs about **1.5 µs per body per step, even for sleeping bodies**. Reading the body buffer directly costs about 0.1–0.2 µs.
8. **Collision callbacks on everything are expensive.** A 1000-body pile raises about **10k CONTINUED events per step**, adding 4–10 ms. Use `body.setEventMask(1)` (STARTED only) instead: about 60× fewer events. A pair reports an event type if **either** body's mask includes it, and `setEventMask` wakes the body.
9. **Leak and ownership traps:**
   - `node.dispose()` disposes the body but **not** its shape.
   - `body.dispose()` **nulls `body.shape`**, so grab the shape first.
   - `container.dispose()` does **not** dispose its children.
   - The per-body collision-**ended** observable is never removed, and **Havok reuses body ids immediately**, so a new body inherits the old body's observers.
10. **`PhysicsRaycastResult.shape` is `undefined` for single-shape bodies**; for container bodies it is the **hit child**. `startsAsleep=true` bodies **hang in mid-air** until something wakes them.

## 0. Setup (all imports from the package root)
```ts
import { Scene, Vector3, HavokPlugin, PhysicsEngineV2 } from "@babylonjs/core";
import HavokPhysics, { type HavokPhysicsWithBindings } from "@babylonjs/havok";
import havokWasmUrl from "@babylonjs/havok/lib/esm/HavokPhysics.wasm?url";
const hk = await HavokPhysics({ locateFile: () => havokWasmUrl }); // each call = new WASM instance
const plugin = new HavokPlugin(true, hk);       // (useDeltaForWorldStep=true, hk, {maxQueryCollectorHits?, disableWorldRegions?, floatingOriginWorldRadius?})
scene.enablePhysics(new Vector3(0, -9.81, 0), plugin);
const phys = scene.getPhysicsEngine() as PhysicsEngineV2; // getPhysicsEngine() is typed IPhysicsEngine; cast for getBodies()
const raw = plugin._hknp as HavokPhysicsWithBindings;     // raw HP_* functions (_hknp is typed any)
```
- The project's tsconfig sets `erasableSyntaxOnly`, so no constructor parameter properties and no TS enums in our code. The Babylon enums imported above are ordinary values and are fine.
- `NullEngine` has **no thin-instance support** ("Instanced Array extension not supported"); use `Engine` in probes that need thin instances. **[RT]**
- Object counters: `raw.HP_GetStatistics()[1]` → `[bodies, shapes, constraints, debugGeoms, worlds, queryCollectors]`. `plugin.numBodies` counts the default world only. **[RT]**
- Babylon 9 added floating-origin "world regions" (`HavokPluginParameters`). They only activate when `scene.floatingOriginMode` is on, so they don't matter for an apartment. **[SRC]**

## 1. Bodies without PhysicsAggregate
```ts
constructor(transformNode: TransformNode, motionType: PhysicsMotionType, startsAsleep: boolean, scene: Scene);
set shape(shape: Nullable<PhysicsShape>); get shape(): Nullable<PhysicsShape>;
get disablePreStep(): boolean; set disablePreStep(value: boolean); // true => PhysicsPrestepType.DISABLED, false => TELEPORT
disableSync: boolean;                                                // skip physics->node copy (true for STATIC)
setPrestepType(prestepType: PhysicsPrestepType): void;               // DISABLED=0, TELEPORT=1, ACTION=2
// HavokPlugin:
setPhysicsBodyTransformation(body: PhysicsBody, node: TransformNode): void; // applies node pose now if prestep is TELEPORT/ACTION
```
- **[RT] Plain `TransformNode` works.** Meshes parented under it follow, so one physics root can carry many visual parts.
- **[RT] Defaults after construction:**
  - `disablePreStep=true` (prestep DISABLED) and `disableSync=false`; static bodies get `disableSync=true`.
  - Linear damping **0**, angular damping **0.1**, gravity factor 1.
  - The constructor creates `node.rotationQuaternion` from the Euler rotation if it is missing.
- **[RT] World space with a parent.** Example: parent at (10,0,0), rotated 90° about Y, scale 2; child at local (0,5,0). The Havok body is created at world (10,10,0). After it falls, sync writes back local (0,4.382,0), which is world (10,8.765,0); local `scaling` is untouched. **[SRC]** Each sync on a parented node inverts the parent's world matrix, which costs extra; keep physics nodes unparented.
- **[RT] Stale world matrix.**
  - **Cause:** the body is created at `node.absolutePosition`, which comes from a non-forced `computeWorldMatrix()` cached per `renderId`.
  - **When it bites:** the node already has a `rotationQuaternion` and something computed its world matrix earlier in the same frame.
  - **What happens:** the body is created at the **old** pose and the first step snaps the node back. Observed: created at (0,0,0) instead of (5,5,5).
  - **Fix:** call `node.computeWorldMatrix(true)` before `new PhysicsBody`. Nodes without a `rotationQuaternion` happen to be safe because the constructor's quaternion assignment marks them dirty.
  - **Also breaks** `PhysicsPrestepType.ACTION` whenever there is more than one physics step per render.
- **[RT] Teleport (each case starts from a falling body):**
  - Setting `node.position` with the default `disablePreStep=true`: overwritten on the next step (x went from 20 back to 0).
  - `disablePreStep=false` for one step, then back to `true`: works. Velocity is kept.
  - TELEPORT prestep + `setPhysicsBodyTransformation`: **immediate**; the Havok pose is updated before any step.
  - Raw `raw.HP_Body_SetQTransform(body._pluginData.hpBodyId, [[x,y,z],[qx,qy,qz,qw]])`: works.
  - **None of these reset velocity.**
```ts
export function teleportBody(body: PhysicsBody, pos: Vector3, rot: Quaternion): void { // unparented node
  const node = body.transformNode;
  node.position.copyFrom(pos);
  node.rotationQuaternion!.copyFrom(rot);
  body.setPrestepType(PhysicsPrestepType.TELEPORT);
  (node.getScene().getPhysicsEngine()!.getPhysicsPlugin() as HavokPlugin).setPhysicsBodyTransformation(body, node);
  body.setPrestepType(PhysicsPrestepType.DISABLED);
  body.setLinearVelocity(Vector3.Zero());
  body.setAngularVelocity(Vector3.Zero());
}
export function createBody(node: TransformNode, shape: PhysicsShape, motion: PhysicsMotionType, scene: Scene, startsAsleep = false) {
  if (!node.rotationQuaternion) node.rotationQuaternion = Quaternion.FromEulerVector(node.rotation);
  node.computeWorldMatrix(true);          // avoid stale-matrix spawn
  const body = new PhysicsBody(node, motion, startsAsleep, scene);
  body.shape = shape;                     // set density/material/filter on leaf shapes BEFORE this
  return body;
}
```
- **[SRC]** `body.getObjectCenterWorld()` returns `transformNode.position`, which is local and is **not** the COM. Use `getMassProperties().centerOfMass` (body-local) instead.
- **[RT]** Swapping the shape (`body.shape = other`) keeps linear and angular velocity, the body origin, and the body-buffer offset.

## 2. Shapes
```ts
new PhysicsShapeBox(center: Vector3, rotation: Quaternion, extents: Vector3, scene: Scene)   // extents = FULL size
new PhysicsShapeSphere(center: Vector3, radius: number, scene: Scene)
new PhysicsShapeCapsule(pointA: Vector3, pointB: Vector3, radius: number, scene: Scene)      // A/B = cap-sphere centres
new PhysicsShapeCylinder(pointA: Vector3, pointB: Vector3, radius: number, scene: Scene)     // A/B = flat-face centres
new PhysicsShapeConvexHull(mesh: Mesh, scene: Scene)
new PhysicsShapeMesh(mesh: Mesh, scene: Scene)
new PhysicsShapeContainer(scene: Scene)
new PhysicsShape(options: PhysicShapeOptions, scene: Scene) // { type?: PhysicsShapeType, parameters?: PhysicsShapeParameters, pluginData?: any }
static FromMesh(mesh: AbstractMesh)                          // on Box/Sphere/Capsule/Cylinder
```
- **[RT] AABBs** from `shape.getBoundingBox()`, all in local space:
  - Box with center (1,0,0) and extents (2,1,0.5) → [0..2, −0.5..0.5, −0.25..0.25].
  - Capsule from (0,±0.5,0), r 0.25 → y ±0.75.
  - Cylinder, same inputs → y ±0.5.
- **[RT] `FromMesh` ignores mesh scaling.** A box mesh with scaling 2 gives a 1 m box. Pass scaled extents yourself, or use `PhysicsAggregate`, which does apply scaling.
- **[RT] `ConvexHull(mesh)` and `Mesh(mesh)`** use vertices × `mesh.absoluteScaling` (parent scale included). **Rotation and position are not baked**; the hull is in node-local space.
  - Example: a mesh at (5,0,0), rotated 45° about Y, scale (2,1,1) → hull AABB [−1..1, −0.5..0.5, −0.5..0.5].
  - **[SRC]** Child meshes can be merged into one hull with `new PhysicsShape({ type: PhysicsShapeType.CONVEX_HULL, parameters: { mesh, includeChildMeshes: true } }, scene)`.
- **[RT] A closed `PhysicsShapeMesh` gets a volume-based mass** (2000 kg for a 2×1×1 box at density 1000, same as the hull). Prefer hulls or containers of hulls for dynamic bodies.
- **[RT] `shape.type`** is the numeric `PhysicsShapeType` for constructed shapes (BOX=3, SPHERE=0, CONTAINER=5, CONVEX_HULL=4). For `new PhysicsShape({pluginData})` it is the raw `[Result, ShapeType]` tuple; the helper below fixes it.
- **[RT] Convex hull from raw points, no mesh** (falls and rests correctly; a 20 cm cube gets 8 kg):
```ts
export function createConvexHullFromPoints(scene: Scene, points: Float32Array): PhysicsShape { // body-local xyz
  const plugin = scene.getPhysicsEngine()!.getPhysicsPlugin() as HavokPlugin;
  const hk = plugin._hknp as HavokPhysicsWithBindings;
  const ptr = hk._malloc(points.length * 4);
  new Float32Array(hk.HEAPU8.buffer, ptr, points.length).set(points); // view AFTER _malloc (heap may grow)
  const res = hk.HP_Shape_CreateConvexHull(ptr, points.length / 3);
  hk._free(ptr);
  if (res[0] !== hk.Result.RESULT_OK) throw new Error("HP_Shape_CreateConvexHull failed");
  const shape = new PhysicsShape({ pluginData: res[1] }, scene);
  (shape as unknown as { _type: PhysicsShapeType })._type = PhysicsShapeType.CONVEX_HULL;          // fix .type
  (plugin as unknown as { _shapes: Map<bigint, PhysicsShape> })._shapes.set(res[1][0], shape);  // raycast .shape lookup + child lookup
  return shape;
}
```
  The alternative also works: `const m = new Mesh("tmp", scene); m.setVerticesData(VertexBuffer.PositionKind, pts); new PhysicsShapeConvexHull(m, scene)`. It gives an identical AABB. On a WebGL engine this uploads GPU buffers, so prefer the raw helper.
- **[RT] Cost** (warmed up; NullEngine for the mesh variants):

| what | time |
|---|---|
| 200 hulls × 30 pts, raw | 100–175 ms (0.5–0.9 ms each) |
| 200 × 30 pts, new temp Mesh each | 157–164 ms |
| 200 × 30 pts, one reused temp Mesh | 82–109 ms |
| 200 × 8 pts raw / 200 × 100 pts raw | 25 ms / 184 ms |
| creating 200 bodies for them | 10–15 ms |

- **[RT] Degenerate inputs all return `RESULT_OK`.**
  - Single point → about 3 cm ball. Two points → about 1.5 cm-radius capsule.
  - Triangle or 4 coplanar points → slab about ±1–1.5 cm thick (a 1 m² flat quad weighs 2 kg).
  - A real 0.5 mm sliver box keeps its thickness (AABB ±0.25 mm, 0.5 kg).
  - A 5 mm cube weighs 1.25e-4 kg.
  - A 500-point sphere is simplified (about 219 debug vertices).
  - A 2 cm hull rests at y=0.00996 versus 0.01 for a box, so there is no visible convex-radius gap.
  - **Advice:** clamp the minimum shard mass, e.g. `setMassProperties({ mass: Math.max(m, 0.02) })`, and keep collider thickness ≥1–2 cm (§10).

## 3. PhysicsShapeContainer
```ts
addChild(newChild: PhysicsShape, translation?: Vector3, rotation?: Quaternion, scale?: Vector3): void;
addChildFromParent(parentTransform: TransformNode, newChild: PhysicsShape, childTransform: TransformNode): void;
removeChild(childIndex: number): void;
getNumChildren(): number;
```
**[RT] Live edits after the container is assigned to a dynamic body.** Children are 1 m boxes at x=±1, density 1000:

| step | ray at removed/added child | mass / COM |
|---|---|---|
| assigned | hit | 2000 / (0,0,0) |
| `removeChild(1)` | **miss immediately** | **2000 / (0,0,0), stale** |
| … + 1 step | miss | stale |
| `body.shape = container` | miss | **1000 / (−1,0,0)** |
| `addChild(box, (0,0,3))` | miss until the next step, then hit | stale until reassign → 2000 / (−0.5,0,1.5) |

- **Rebuild:** edit in place, then `body.shape = container`. remove + add + reassign on a 50-child container takes **0.08 ms**; building a new 50-child container and assigning it takes 0.89 ms. Re-assigning keeps the body origin and velocity.
- **[RT]** `removeChild(0)` shifts the remaining children down, like an array splice. Remove indices highest-first.
- **[RT]** `removeChild` does **not** dispose the child. Reuse it as the shape of the detached piece's new body, or dispose it.
- **[RT]** Non-uniform child scale works on a box child: (2,1,1) gives a 2 m AABB. `addChildFromParent` computes the child's TRS relative to the parent node; verified translation (0,2,0).
- **[RT] Raw child lookup:**
  - `raw.HP_Shape_GetChildShape(container._pluginData, i)[1][0]` gives the child's id; look it up in `plugin._shapes` to get the `PhysicsShape`.
  - `HP_Shape_GetChildQSTransform`/`SetChildQSTransform` appear only as strings in the bundle and are **not functions at runtime**, so keep child transforms yourself.
- **[RT] Which child was hit:**
  - **Raycasts:** `result.body` is the container body and `result.shape` is **the hit child**, provided the child is registered in `_shapes` (Babylon constructors register automatically; the raw helper registers manually).
  - **Collision events:** they carry no child info. The raw event words for the collider id are 0 and the shape path is undocumented. Pick the child by transforming `ev.point` into body space and testing your stored child AABBs.
- Helper in `physics-bodies-snippets.ts`: `removeContainerChildren(body, container, indices)` removes highest index first, re-assigns the shape, and returns the removed child shapes. It was exercised at 500 → 250 kg.

## 4. Mass, density, material
```ts
set density(density: number); get density(): number;              // default 1000 (kg/m^3)
set material(material: PhysicsMaterial); get material(): PhysicsMaterial;
interface PhysicsMaterial { friction?: number; staticFriction?: number; restitution?: number; frictionCombine?: PhysicsMaterialCombineMode; restitutionCombine?: PhysicsMaterialCombineMode; }
setMassProperties(massProps: PhysicsMassProperties, instanceIndex?: number): void;
getMassProperties(instanceIndex?: number): PhysicsMassProperties;
computeMassProperties(instanceIndex?: number): PhysicsMassProperties; // from shape only, ignores overrides
interface PhysicsMassProperties { centerOfMass?: Vector3; mass?: number; inertia?: Vector3; inertiaOrientation?: Quaternion; }
```
**[RT] Measurements:**

| case | mass | COM | inertia (per unit mass) |
|---|---|---|---|
| 1 m box, default density | 1000 | 0 | (0.167, 0.167, 0.167) |
| `density = 2500`, set before assigning | 2500 | 0 | same |
| density changed **after** assigning | **1000 (unchanged)** → 100 after `body.shape = shape` | | |
| container: box density 3000 at x=0 + box density 1000 at x=2 | **4000** | **(0.5,0,0)** | (0.167, 0.917, 0.917) |
| container's own `density = 5` | ignored (4000) | | |
| `setMassProperties({ mass: 50 })` | 50 | computed (0) | computed per unit mass |
| then `{mass:50, centerOfMass:(0,1,0)}`, then `body.shape = 2 m box` | **50 (sticky)** | **(0,1,0) sticky** | recomputed 0.667 |
| then `setMassProperties({})` | 8000 | 0 | 0.667 |

- **Inertia is per unit mass.** It is scaled by mass internally (an off-centre impulse on a 2 kg unit cube gave ω=−1.5, which matches I = 2/6). Setting only `{mass}` therefore scales rotation correctly.
- **[RT] `{ mass: 0 }` on a DYNAMIC body means infinite mass.** It ignores gravity and never moves. Never use it to mean "massless".
- **[RT] Material set through Babylon** uses these defaults (`plugin.getMaterial` roundtrip): `friction` 0.5, `staticFriction` = friction, `restitution` 0, `frictionCombine` MINIMUM(1), `restitutionCombine` MAXIMUM(2).
  - A shape whose material was **never set** reports friction 0.5 and restitution 0, with combine modes GEOMETRIC_MEAN or `undefined`. **Set the material explicitly on every leaf.**
  - The `material` getter returns the object you passed in; it does not fill in defaults.
  - `PhysicsAggregate` uses different defaults: friction 0.2, restitution 0.2.
- **[RT]** A restitution 0.8 ball dropped 1 m onto a restitution 0 ground (MAXIMUM combine) rebounds 0.55 m (effective e ≈ 0.74).

## 5. Motion types
```ts
setMotionType(motionType: PhysicsMotionType, instanceIndex?: number): void; // STATIC=0, ANIMATED=1, DYNAMIC=2
getMotionType(instanceIndex?: number): PhysicsMotionType;                   // also: get motionType()
setTargetTransform(position: Vector3, rotation: Quaternion, instanceIndex?: number): void;
```
- **[RT] STATIC → DYNAMIC** (an object breaking loose) works at once. The body is ACTIVE right after the switch, `disableSync` becomes false, and it falls (3 → 1.765 after 30 steps). Its mass was already computed from the shape while static (125 kg for a 0.5 m box), so set density or mass before switching.
- **[RT] DYNAMIC → STATIC** freezes the body where it is, zeroes its velocity, and sets `disableSync=true`.
- **[RT] ANIMATED (kinematic)** ignores gravity and collisions but pushes dynamic bodies. Three ways to drive it:
  - `setTargetTransform(pos, rot)` every physics step from `scene.onBeforePhysicsObservable`. Velocity is derived (2 m/s measured) and it pushed a box along.
  - `setLinearVelocity(v)` moves it at a constant velocity that persists.
  - Prestep `ACTION` calls `setTargetTransform(node.absolutePosition, …)` each step, but it reads the stale world matrix whenever there are several steps per render (§1). With no render between steps it was pulled back to the start. Prefer explicit `setTargetTransform`.

## 6. Velocities, forces, damping, sleeping
```ts
setLinearVelocity(linVel: Vector3, instanceIndex?: number): void; getLinearVelocityToRef(linVel: Vector3, instanceIndex?: number): void;
setAngularVelocity(angVel: Vector3, instanceIndex?: number): void; getAngularVelocityToRef(angVel: Vector3, instanceIndex?: number): void;
applyImpulse(impulse: Vector3, location: Vector3, instanceIndex?: number): void;   // N*s, location in WORLD space
applyAngularImpulse(angularImpulse: Vector3, instanceIndex?: number): void;
applyForce(force: Vector3, location: Vector3, instanceIndex?: number): void;       // = applyImpulse(force * plugin.getTimeStep())
applyTorque(torque: Vector3, instanceIndex?: number): void;                        // = applyAngularImpulse(torque * timeStep)
setLinearDamping(damping: number, instanceIndex?: number): void; setAngularDamping(damping: number, instanceIndex?: number): void;
setGravityFactor(factor: number, instanceIndex?: number): void;
// PhysicsEngineV2: setVelocityLimits(maxLinearVelocity: number, maxAngularVelocity: number): void
// HavokPlugin:     setActivationControl(body: PhysicsBody, controlMode: PhysicsActivationControl): void
```
- **[RT]**
  - **Velocity:** 5 m/s for 60 steps moves exactly 5.000 m.
  - **Impulse:** Δv = J/m and is readable **before** the step. An off-centre impulse gives ω = I⁻¹(r × J).
  - **`applyForce` is a single impulse** of `F · plugin.getTimeStep()`, not a continuous force and not scaled by the frame delta. For a continuous force, call it every physics step from `onBeforePhysicsObservable` (12 N on 2 kg for 60 steps → 5.996 m/s).
  - **Damping** per step is v *= 1/(1 + c·dt). With linear c=1, 10 m/s drops to 3.648 after 1 s; angular 0.05 takes 10 rad/s to 9.512.
- **[RT] Speed limits** default to 200 m/s and 100 rad/s (`phys.getMaxLinearVelocity()/getMaxAngularVelocity()`). `phys.setVelocityLimits(50, 20)` clamps immediately, even values passed to `setLinearVelocity`.
- **[RT] Slow bodies are damped to rest.** In free flight with gravity factor 0, speeds of ≤0.1 m/s decay to **0** within 1 s (deactivation damping); 0.5 m/s and above are unaffected. For slow drags or held objects, use `ALWAYS_ACTIVE` and set velocity every step.
- **[RT] Activation** (the raw enums are embind objects; compare by identity):
```ts
const asleep = hk.HP_Body_GetActivationState(body._pluginData.hpBodyId)[1] === hk.ActivationState.INACTIVE;
hk.HP_Body_SetActivationState(body._pluginData.hpBodyId, hk.ActivationState.INACTIVE /* or ACTIVE */);
plugin.setActivationControl(body, PhysicsActivationControl.ALWAYS_ACTIVE); // or SIMULATION_CONTROLLED / ALWAYS_INACTIVE
```
- **[RT] Sleep and wake behaviour:**
  - An isolated box resting on the floor sleeps after **about 22 steps**.
  - `setLinearVelocity`, `applyImpulse`, `setEventMask` and `SetActivationState(ACTIVE)` wake a body; `setLinearDamping` does not.
  - `ALWAYS_ACTIVE` was still active after 600 steps.
- **[RT] `startsAsleep=true`** created in mid-air stays INACTIVE and **hovers** (y unchanged after 60 steps) until woken; then it falls. Bodies created asleep while resting on a static floor mostly stay asleep (2702 of 3000 after 30 steps).
- **[SRC]** `setActivationControl` only handles non-instanced bodies (it uses `body._pluginData`). `HP_Body_SetActivationPriority(id, -127..127)` exists.

## 7. Collision filtering
```ts
set filterMembershipMask(membershipMask: number); get filterMembershipMask(): number; // default -1 (all 32 bits)
set filterCollideMask(collideMask: number);       get filterCollideMask(): number;    // default -1
```
- **[RT] Rule:** A and B collide iff `(A.membership & B.collide) && (B.membership & A.collide)`. The asymmetric case was checked: debris wanting PLAYER while the player excludes DEBRIS → no collision.
- **[RT] The test setup:** WORLD=1, PLAYER=2, DEBRIS=4.
  - Debris (member DEBRIS, collides WORLD|DEBRIS) fell **through** the player and landed on the floor (y 0.15).
  - The player was unaffected.
  - A second piece of debris landed on the first (debris-debris contact works).
  - A control piece with default masks landed on the player.
- **[RT] Masks on containers:** only the **leaf** masks count. A mask set on the container alone was ignored (it collided); a mask on the children worked.
- **[RT] Raycast queries** follow the same rule: `phys.raycast(from, to, { collideWith: WORLD })` skipped the player and hit the floor, and `{ membership: PLAYER }` hit the player.
```ts
export const Layer = { WORLD: 1, PLAYER: 2, DEBRIS: 4, PROPS: 8 } as const;
export function setLayer(shape: PhysicsShape, membership: number, collideWith: number): void { // call on LEAF shapes
  shape.filterMembershipMask = membership;
  shape.filterCollideMask = collideWith;
}
```

## 8. Disposal and leaks
| action | result **[RT]** |
|---|---|
| `shape.dispose()` while a body still uses it | safe. Havok refcounts it; the body keeps simulating and colliding and the native shape is freed with the last body. The JS wrapper is dead (`_pluginData=undefined`). |
| `node.dispose()` | disposes the body (`isDisposed`, `node.physicsBody=null`, removed from engine and Havok). **The shape is NOT disposed.** |
| `body.dispose()` | sets **`body.shape = null`**. Calling `b.shape?.dispose()` afterwards leaked 4000 shapes in a test. |
| `container.dispose()` | releases the container only. **Children stay alive** until each is disposed. |
| collision observables | `_bodyCollisionObservable` entries are deleted on remove, but **`_bodyCollisionEndedObservable` entries are never deleted**. Havok **reuses the id immediately**, so the next body inherited one old "ended" observer. Clear both observables before disposing. |
| churn: 5 × (create + dispose 2000 bodies + shapes + nodes) | stats, JS maps, engine body list and WASM heap (16.1 MB) all returned to baseline. Create 2000: 30–185 ms; dispose 2000: 27–99 ms. |
| `PhysicsEngineV2.removeBody` is `indexOf` + `splice` (O(n)) | removing 2000 of 4000 bodies took 15–66 ms. Acceptable. |

```ts
export function disposeBodyAndShapes(body: PhysicsBody, disposeNode = true): void {
  const shape = body.shape;                       // grab BEFORE dispose
  body.getCollisionEndedObservable().clear();     // id-reuse leak
  body.getCollisionObservable().clear();
  body.dispose();
  if (shape) {
    if (shape instanceof PhysicsShapeContainer) {
      const kids: PhysicsShape[] = [];
      for (let i = 0; i < shape.getNumChildren(); i++) { const k = getContainerChild(shape, i); if (k) kids.push(k); }
      shape.dispose();
      for (const k of kids) k.dispose();          // only if not shared!
    } else shape.dispose();
  }
  if (disposeNode) body.transformNode.dispose();
}
```
`getContainerChild` (in the snippets file) looks up `raw.HP_Shape_GetChildShape` in `plugin._shapes`.

## 9. Thin-instanced bodies (one PhysicsBody per thin-instanced Mesh)
- **[RT] Creation:** `new PhysicsBody(mesh /* has thin instances */, motion, asleep, scene)` creates one Havok body per instance (50 → 50). `body.shape = s` sets the **same** shape on every instance.
- **[RT] Per-instance calls** take an `instanceIndex` and work: `setLinearVelocity(v, i)`, `applyImpulse(j, p, i)`, `setMotionType(t, i)`, `setMassProperties(p, i)`, `getLinearVelocity(i)`. Collision events report the instance in `ev.colliderIndex` / `ev.collidedAgainstIndex`. `body.numInstances` gives the count.
- **[RT] Adding instances:** `mesh.thinInstanceAdd(m)` followed by `body.updateBodyInstances()` (51 bodies). The new body copies instance 0's shape and simulates normally.
- **[RT] Removing:** only from the end, via `mesh.thinInstanceCount = n` then `updateBodyInstances()` (40 bodies). **[SRC]** This pops the last Havok bodies and re-teleports all remaining bodies to their matrices. To remove instance k, swap the last instance's matrix *and its velocities* into k.
- **[RT] Per-instance scale is lost.** Sync overwrites each instance matrix with rotation + translation only; a scale of 0.5 became 1 after the first step. Bake scale into the geometry.
- **[RT] Don't read poses with `thinInstanceGetWorldMatrices()`**: it caches and goes stale. Read `mesh._thinInstanceDataStorage.matrixData` or Havok directly.
- **[SRC]** Every step rewrites and re-uploads the **whole** matrix buffer, even when every instance is asleep.
- **Verdict:** practical only for **identical generic debris** (dust chunks, pebbles, screws) with one shared shape. **Not** for unique Voronoi shards. For those, use one node per shard; 3000 nodes is fine with fast sync (§12).

## 10. CCD and tunnelling
**[SRC]** The plugin and the WASM expose no CCD or motion-quality controls. Raw HP_* functions don't include any.

**[RT]** Each cell is the lowest tested speed (of 5, 10, 20, 30, 60, 100, 200 m/s) at which the projectile's centre crossed the slab. The slab is 4×4 m and the step is 1/60 s unless noted. "never" means it stopped at every speed up to 200 m/s.

| target \ projectile | 2 cm box | 1 cm-radius sphere | 30 cm box | 10×10×0.5 cm shard spinning 40 rad/s |
|---|---|---|---|---|
| static box 5 cm / 1 cm / 6 mm | never | never | never | 30 / 10 / 10 m/s |
| static zero-thickness mesh plane | never | never | never | 10 m/s |
| **dynamic** 20 kg door, 4 cm | **10 m/s** | never | **20 m/s** | 60 m/s (intermittent) |
| dynamic door, 10 cm | **10 m/s** | – | – | – |
| **animated** door, 4 cm | **10 m/s** | – | – | – |
| dynamic door 4 cm / 10 cm vs 10 cm box | | | | 30 / 60 m/s |

- Higher step rates don't fix it. The 2 cm box against the dynamic 4 cm door still tunnelled from 10 m/s at **240 Hz**, and spinning shards still tunnelled intermittently at 120 and 240 Hz.
- **Rules of thumb:**
  - Keep structural and fixed parts **STATIC** until they break (static targets are tunnel-proof for straight-line motion).
  - Resolve hammer swings and fast tool hits with raycasts or shape casts, not contact events.
  - Clamp debris speed and spin (`setVelocityLimits`, or per body), and give shards some angular damping.
  - Make thin dynamic panels (doors, glass, cabinet sides) use colliders ≥5–10 cm thick, or keep them ANIMATED/STATIC while attached.

## 11. Stepping
**[SRC] What `scene.render()` does:**
- `render(updateCameras = true, ignoreAnimations = false)` calls `animate()`, which calls `scene._advancePhysicsEngineStep(deltaMs)`.
  - `deltaMs = clamp(engine.getDeltaTime(), 1, 1000)`, or 16 if `scene.useConstantAnimationDeltaTime`.
  - `ignoreAnimations=true` or `scene.physicsEnabled=false` skips physics.
- `_advancePhysicsEngineStep`:
  - If `phys.getSubTimeStep() > 0` (**milliseconds**): runs `_step(sub/1000)` while `acc > sub`. Nothing caps the number of substeps.
  - Otherwise runs one `_step(deltaMs/1000)`.
  - Each `_step` is wrapped in `onBeforePhysicsObservable` / `onAfterPhysicsObservable`.
- `_step(delta)` clamps delta to ≤0.1 (and ≤0 becomes 1/60), then calls `plugin.executeStep(delta, bodies)`, which:
  1. applies the prestep for bodies whose prestep isn't DISABLED;
  2. calls `HP_World_SetIdealStepTime(dt)` and `HP_World_Step(dt)`;
  3. syncs every body with `!disableSync`;
  4. dispatches collision and trigger events.
- **The `HavokPlugin` constructor's first argument** `_useDeltaForWorldStep` (default `true`): `dt = delta`. With `false`, `dt = plugin.getTimeStep()` (set with `phys.setTimeStep(seconds)`, default 1/60) regardless of frame time.

**[RT] Measurements:**

| setup | result |
|---|---|
| manual `for` loop of `scene.render()`, `useDelta=true` | `engine.getDeltaTime()` = 0 → **1 ms simulated per render** (60 renders = 0.06 s) |
| same with `useDelta=false` | 60 renders = 1.0 s; after `phys.setTimeStep(1/120)`, 0.5 s |
| `_advancePhysicsEngineStep(500)` | 1 step, 0.1 s (clamped) |
| `setSubTimeStep(1000/60)` + `_advancePhysicsEngineStep(50)` | 2 steps; 16.7 ms stays in the accumulator |
| `runRenderLoop` for 1.5 s, headless at about 60 fps: default, subTimeStep, FixedStepper, engine lockstep | 86–91 steps, 1.48 s simulated in every case |
| same scene in two worlds sharing one WASM instance | **diverged by 5–10 m** after 400 steps |
| same scene, fresh `HavokPhysics()` per world | **bitwise identical** |

**Recommended production driver** (verified in the render loop). It is decoupled from the render rate, caps steps per frame (no spiral of death), and keeps the physics observables firing:
```ts
export class FixedStepper {
  acc = 0;
  readonly scene: Scene; readonly dt: number; readonly maxSteps: number;
  constructor(scene: Scene, engine: Engine, dt = 1 / 60, maxSteps = 4) {
    this.scene = scene; this.dt = dt; this.maxSteps = maxSteps;
    scene.physicsEnabled = false;                         // scene.render() stops stepping physics
    scene.onBeforeRenderObservable.add(() => this.advance(engine.getDeltaTime() / 1000));
  }
  advance(frameSeconds: number): number {                 // returns interpolation alpha
    this.acc += Math.min(frameSeconds, 0.25);
    let n = 0;
    while (this.acc >= this.dt && n < this.maxSteps) { this.scene._advancePhysicsEngineStep(this.dt * 1000); this.acc -= this.dt; n++; }
    if (n === this.maxSteps) this.acc = Math.min(this.acc, this.dt);
    return this.acc / this.dt;
  }
}
```
- **Built-in alternative [RT]:** `new Engine(canvas, aa, { deterministicLockstep: true, lockstepMaxSteps: 4, timeStep: 1/60 })` (for `NullEngine`, set the same fields on `new NullEngineOptions()`). It runs fixed 1/60 s steps (≤4 per frame) and also locks animations to them.
- `phys.setSubTimeStep(1000/60)` works too, but has no step cap: up to 60 steps after a 1 s hitch.
- **Tests:** `stepN(scene, n, dt)` calls `scene._advancePhysicsEngineStep(dt*1000)` n times with subTimeStep 0. That is exactly n steps, with observables. It is public in the `.d.ts` but documented `@internal`. Use a **fresh `HavokPhysics()` per test world** for reproducibility. `phys._step(dt)` also works but skips the observables.

## 12. Performance
Numbers are per 1/60 s step; "native" is the time spent inside `HP_World_Step`.

**1000 dynamic hulls (20 random points, about 35 cm) dropped into a 6×6 m pen [RT]:**

| phase | total (avg / p95) | native (avg) |
|---|---|---|
| fall, steps 0–40 | 5–10 / 8–28 ms | – |
| impact, steps 40–200 | 16.4 / 24.5 ms | 14.8 ms |
| settling, steps 200–600 | 17.5–18.4 / 25–28 ms | 16.7 ms |
| collision callbacks on all 1000, observer only counting | 20–27 / 27–36 ms | 15–17 ms |

- **The pile never sleeps.** No body slept even after 1200 steps (20 s): max speed 0.04–0.08 m/s, max spin about 0.4 rad/s, and it is all one island.
- Piles of 100 or 300 hulls, and 1000 separated hulls, all slept within 5–10 s.
- Damping (0.3 linear / 0.6 angular) didn't help.
- **Fix [RT]:** every 10 steps, force-sleep bodies that have been slow for 1 s (lin < 0.15, ang < 0.6) with `HP_Body_SetActivationState(INACTIVE)`. All 1000 were asleep by 5 s and the step dropped to **0.7–1 ms**. Dropping a 200 kg box onto the pile woke the island and moved 201 bodies, so force-slept debris stays interactive. Freezing to STATIC costs 0.03 ms but is not interactive. Helper: `forceSleepSlowBodies` in the snippets file.
- **Collision events are per contact point:** about 4 CONTINUED events per step for each box resting on the floor (about 10.6k per step for the pile). Sleeping bodies raise 0.
- `body.setEventMask(1)` (STARTED only) produced 1871 events where all-events bodies produced 114k. Mask values are STARTED=1, CONTINUED=2, FINISHED=4 (**[SRC]** TRIGGER_ENTERED=8, EXITED=16).
- Only 842 of 2000 STARTED events had impulse > 0; most STARTED impulses are 0. See the collision-events notes for how to measure impact strength.

**3000 separate dynamic boxes [RT]:**

| state | total | native |
|---|---|---|
| all asleep | **3.3–4.8 ms** | 0.3–0.5 ms ← Babylon sync calls `HP_Body_GetQTransform` for every body, every step |
| asleep, `disableSync = true` | **0.05–0.08 ms** | 0.03 |
| `setCollisionCallbackEnabled(true)` on all | 10.9 ms (p95 30); **woke all 3000**, 4000 events per step | 4.1 |
| custom fast sync instead (below) | **0.35–0.68 ms** (sync itself 0.23–0.5 ms, max error 1.5e-8) | 0.07–0.1 |

- Polling `HP_Body_GetActivationState` for 3000 bodies takes 1.9–3.1 ms.
- Creating 3000 bodies with one shared shape takes 53–134 ms.

**Fast sync [RT]:** read the transforms straight out of the world body buffer. Offsets were unchanged after removing 750 and adding 500 bodies, after a shape swap, a motion-type change and sleep:
```ts
// once per body (while it is in the world):
body.disableSync = true;
const offset = hk.HP_Body_GetWorldTransformOffset(body._pluginData.hpBodyId)[1];
// every step (onAfterPhysicsObservable):
const base = hk.HP_World_GetBodyBuffer(plugin.world)[1];       // re-read each step (moves when bodies are added)
const f32 = new Float32Array(hk.HEAPU8.buffer);                // re-create each step (heap can grow)
const o = (base + offset) >> 2;                                // 16 floats, Babylon Matrix layout, translation at 12..14
node.position.set(f32[o + 12], f32[o + 13], f32[o + 14]);
Matrix.FromArrayToRef(f32, o, tmpMatrix);                      // elements 3,7,11,15 are junk; rotation part is valid
Quaternion.FromRotationMatrixToRef(tmpMatrix, node.rotationQuaternion!);
```
The full class is `FastBodySync` in the snippets file; it requires unparented nodes that have a `rotationQuaternion`.

## Pitfalls
1. Moving the node of a dynamic body does nothing (`disablePreStep` defaults to true). Teleport with the TELEPORT prestep + `setPhysicsBodyTransformation`, and zero velocities yourself.
2. Call `node.computeWorldMatrix(true)` before `new PhysicsBody(...)`. Otherwise the body can spawn at a stale pose from earlier in the frame. Prestep ACTION has the same problem with several steps per render.
3. Set density, material and filters on leaf shapes **before** `body.shape = …`. Later changes need a re-assign. `setMassProperties` overrides are sticky; clear them with `setMassProperties({})`.
4. After `container.removeChild` or `addChild`, always re-assign `body.shape = container`, or mass and COM stay stale. Indices shift down after a removal, and removed children are not disposed.
5. Container (parent) filter masks are ignored; set them on the children.
6. `{ mass: 0 }` on a DYNAMIC body means infinite mass, not "massless".
7. `applyForce` is a one-shot impulse of `F × timeStep`. Re-apply it every physics step for a continuous force.
8. A manual `scene.render()` loop (as in tests) steps physics only 1 ms per call. Use `_advancePhysicsEngineStep` or `HavokPlugin(false)`.
9. Determinism needs a fresh `HavokPhysics()` instance per world. A second world in a used instance diverges.
10. `startsAsleep=true` bodies hover in mid-air until woken. Slow bodies (≤0.1 m/s) are damped to rest even in free flight.
11. Large piles (about 1000+ touching bodies) never sleep; force-sleep slow debris. Babylon sync costs about 1.5 µs per body per step even when asleep; use fast sync or `disableSync`.
12. Collision callbacks: CONTINUED events fire per contact point per step. Prefer `setEventMask(1)`. Enabling callbacks (any `setEventMask`) wakes the body.
13. `body.dispose()` nulls `body.shape`. `node.dispose()` leaves the shape alive. `container.dispose()` leaves its children alive. Clear the per-body collision-ended observables before disposing, because Havok reuses ids.
14. `PhysicsRaycastResult.shape` is undefined for single-shape bodies; use `result.body`. For containers it is the hit child, but only if that child is registered in `plugin._shapes`.
15. Shapes made with `new PhysicsShape({pluginData})` have a bogus `.type` and aren't registered for raycasts; use `createConvexHullFromPoints`.
16. `PhysicsShapeX.FromMesh` ignores mesh scaling, while `ConvexHull(mesh)` bakes absolute scaling. Neither bakes rotation or position.
17. Thin-instance bodies share one shape, lose per-instance scale, can only shrink from the end, re-upload the whole buffer every step, and don't run on `NullEngine`.
18. No CCD against dynamic or animated bodies (tunnelling from about 10 m/s), and spinning thin shards can tunnel through static ones. Keep attached structure STATIC and raycast fast tools.
19. `hk.EventType.X` and the other raw enums are typed as TS enums but are embind objects at runtime. Compare by identity, use `(e as unknown as {value:number}).value`, or pass plain numbers to `setEventMask`.
20. `getObjectCenterWorld()` returns the node's local position, not the COM. `thinInstanceGetWorldMatrices()` returns a stale cache for physics-driven instances.
