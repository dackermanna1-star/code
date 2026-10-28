# Physics events & spatial queries — Babylon.js 9.30.0 + @babylonjs/havok 1.3.14 (verified)

Scope: Havok collision events, triggers, raycasts, shape casts, proximity queries. Everything marked
**VERIFIED** was measured at runtime with the probes `tests/probes/physics-events-*.probe.ts`
(headless Chromium; CPU timings indicative only). "from source" = read in `node_modules/@babylonjs/core/Physics/v2/Plugins/havokPlugin.js`
or `node_modules/@babylonjs/havok/HavokPhysics.d.ts` but not exercised. All imports come from the package root.

## TL;DR
1. **One event per CONTACT POINT per step**, not per pair: a box lying flat = 4 events/step, a box on a MESH floor ≈ 16 (depends on the triangles under it). `impulse` is the per-point **normal** impulse in **N·s**; the pair total for the step is the **sum** over its events (matches m·Δv within 1 %). Friction impulse is NOT included.
2. The impact impulse arrives on **STARTED or on the next CONTINUED**: Havok creates speculative contacts up to ~v·dt before touching (STARTED with `distance` > 0 and a small impulse), then the big impulse comes one step later as CONTINUED. Never use STARTED alone for damage — aggregate STARTED+CONTINUED per pair per step (`ImpactTracker` below).
3. Resting contacts emit CONTINUED **every step** with Σimpulse ≈ m·g·dt (0.16 N·s per kg at 60 Hz) — until the island **sleeps** (~0.3–2 s); sleeping bodies emit nothing, no FINISHED on sleep, and CONTINUED (not STARTED) resumes on wake.
4. `e.point` / `e.normal` are **the same two Vector3 instances for every event of a step** (overwritten per event) → copy the numbers, never store the refs. Query results (`hitPointWorld`, …) are also reused per result object.
5. Events fire if **either** body has the event bit in its mask. `collider` is **not** "the body that enabled callbacks" (observed: dynamic-vs-static → collider = dynamic; dynamic-vs-dynamic → first-created body). Per-body observables normalise (`collider === thatBody`). `normal` points from `collider` toward `collidedAgainst`; `point` lies on `collider`'s surface.
6. Compound bodies: collision events carry **no child-shape info** (Babylon or raw Havok: colliderId 0, invalid shape key). Use the contact point → `nearestChildIndex()`. Raycasts / shape casts DO return the child in `result.shape` (containers with ≥ 2 children, and MESH shapes); `colliderIndex`/`bodyIndex` = thin-instance index.
7. **Never dispose+create bodies inside a collision callback**: Havok reuses body ids immediately, so the remaining events of that step get attributed to the new body (VERIFIED). Queue fracture work and apply it in `scene.onAfterPhysicsObservable`.
8. Rays: `(scene.getPhysicsEngine() as PhysicsEngineV2).raycastToRef(...)` (root `PhysicsEngine` is the **v1** class). ~13 µs/ray. Rays starting inside a convex shape do not hit it. `raycastMulti` returns only 1 hit unless the plugin was built with `{ maxQueryCollectorHits: N }` or `setMaxQueryCollectorHits(N)` was called (`getMaxQueryCollectorHits()` is buggy, always 1).
9. Shape casts / proximity exist only on **HavokPlugin** (`shapeCast`, `shapeProximity`, `pointProximity`); the query shape's own filter masks act as the query filter; ~10 µs/cast. `IPhysicsShapeCastQuery` is not exported from the root → `Parameters<HavokPlugin["shapeCast"]>[0]`.
10. Deterministic stepping: `new HavokPlugin(false, hk)` → every `scene.render()`/`scene.animate()` advances exactly `getTimeStep()` (1/60). With the default `HavokPlugin(true)` a tight `scene.render()` loop advances only **1 ms per call** (engine delta = 0 → clamped).

---

## 0. Stepping, ordering, types

```ts
import { HavokPlugin, PhysicsEngineV2, Vector3, type Scene } from "@babylonjs/core";
// HavokPlugin(_useDeltaForWorldStep?: boolean, hpInjection?: any, parameters?: HavokPluginParameters)
// HavokPluginParameters { maxQueryCollectorHits?: number; disableWorldRegions?: boolean; floatingOriginWorldRadius?: number }
const plugin = new HavokPlugin(false, hk, { maxQueryCollectorHits: 16 }); // false => fixed dt = plugin.getTimeStep()
scene.enablePhysics(new Vector3(0, -9.81, 0), plugin);
const pe = scene.getPhysicsEngine() as PhysicsEngineV2; // typed IPhysicsEngine: has no raycastToRef/raycastMulti
pe.setTimeStep(1 / 60);          // -> plugin.setTimeStep
scene.animate();                 // one physics step (+ animations), no rendering — handy in tests/probes
```
- **VERIFIED**: `HavokPlugin(false, …)`: each `scene.render()` / `scene.animate()` = exactly one 1/60 s step. `HavokPlugin(true, …)` (default): dt = `engine.getDeltaTime()` clamped to [1 ms, 1000 ms] by Scene and ≤ 0.1 s by `PhysicsEngineV2._step`; outside `engine.runRenderLoop` the delta is 0 → 60 tight `scene.render()` calls simulated 0.0597 s.
- Order inside one step (**VERIFIED** for the observables, rest from source): `scene.onBeforePhysicsObservable` → `HP_World_Step` → transforms synced to nodes (`position`/`rotationQuaternion`) → **collision events** → **trigger events** → `scene.onAfterPhysicsObservable`. With `pe.setSubTimeStep(ms)` the before/after observables fire per sub-step.
- Inside the callbacks, `transformNode.getWorldMatrix()` is **stale** (last render/compute; measured 1.06 m off before any render, 4.9 cm with one step lag) → call `computeWorldMatrix(true)` (**VERIFIED**). Velocities read in a callback are already post-impact.
- `@babylonjs/havok`'s `hk.EventType` only has `COLLISION_STARTED=1, COLLISION_CONTINUED=2, COLLISION_FINISHED=4` (**VERIFIED**); trigger types 8/16 are hard-coded in the plugin.

## 1. Collision event API

Signatures (copied from .d.ts):
```ts
// HavokPlugin
onCollisionObservable: Observable<IPhysicsCollisionEvent>;        // STARTED + CONTINUED
onCollisionEndedObservable: Observable<IBasePhysicsCollisionEvent>; // FINISHED
onTriggerCollisionObservable: Observable<IBasePhysicsCollisionEvent>; // TRIGGER_ENTERED / TRIGGER_EXITED
setActivationControl(body: PhysicsBody, controlMode: PhysicsActivationControl): void; // only on the plugin
// PhysicsBody
setCollisionCallbackEnabled(enabled: boolean): void;      // mask = 1|2|4 (=7) or 0 (also clears FINISHED!)
setCollisionEndedCallbackEnabled(enabled: boolean): void; // ORs/clears bit 4 only
setEventMask(eventMask: number, instanceIndex?: number): void;
getEventMask(instanceIndex?: number): number;
getCollisionObservable(instanceIndex?: number): Observable<IPhysicsCollisionEvent>;
getCollisionEndedObservable(instanceIndex?: number): Observable<IBasePhysicsCollisionEvent>;
// enum PhysicsEventType { COLLISION_STARTED = "COLLISION_STARTED", COLLISION_CONTINUED = "COLLISION_CONTINUED",
//   COLLISION_FINISHED = "COLLISION_FINISHED", TRIGGER_ENTERED = "TRIGGER_ENTERED", TRIGGER_EXITED = "TRIGGER_EXITED" }
interface IBasePhysicsCollisionEvent { collider: PhysicsBody; collidedAgainst: PhysicsBody; colliderIndex: number; collidedAgainstIndex: number; type: PhysicsEventType; }
interface IPhysicsCollisionEvent extends IBasePhysicsCollisionEvent { point: Nullable<Vector3>; distance: number; impulse: number; normal: Nullable<Vector3>; }
```
**VERIFIED** behaviour:
- Masks: default 0. `setCollisionCallbackEnabled(true)` → `getEventMask() === 7`. `setEventMask(1)` → only STARTED, `2` → only CONTINUED, `4` (or `setCollisionEndedCallbackEnabled(true)` alone) → only FINISHED.
- Event object keys: collision = `collidedAgainst, collidedAgainstIndex, collider, colliderIndex, distance, impulse, normal, point, type`; ended/trigger = the 5 base keys. `point`/`normal` are never null for Havok collision events.
- `point`: contact point on the **collider's** surface (world). `normal`: unit, **from collider toward collidedAgainst** (box on ground: collider=box → (0,-1,0)). `distance` = dot(pB − pA, nA): **> 0 = gap** (speculative contact), < 0 = penetration.
- **Reuse**: all events of one step share the same `point`/`normal` Vector3s (117/117 multi-event steps), a fresh pair per step; 776/893 stored refs had changed value afterwards. The same objects are passed to the per-body observable of the collider; the other body's per-body event uses the `contactOnB` vectors (also reused).
- Plugin-level observable: each contact point reported **once** even if both bodies have callbacks. Per-body observables: both bodies' observables get it, normalised so `collider === thatBody` (B-side: point on B's surface, normal from B toward A, same `distance`/`impulse`). A body's per-body observable fires even if only the *other* body enabled callbacks.
- **Quirk**: if *no* body anywhere has a `getCollisionObservable()` registered, `getCollisionEndedObservable()` observers also receive STARTED and CONTINUED events (measured 2 STARTED + 3 CONTINUED + 2 FINISHED). Always filter `e.type === PhysicsEventType.COLLISION_FINISHED` in ended observers.
- FINISHED is per contact point too (box lifted off ground → 4 FINISHED in one step); mesh floors churn STARTED/FINISHED per triangle manifold while still touching.
- Disposing a body inside a callback is safe (later events of that body are dropped); **disposing + creating** is not (see Pitfalls).

```ts
import { PhysicsEventType, type IPhysicsCollisionEvent } from "@babylonjs/core";
body.setCollisionCallbackEnabled(true);
plugin.onCollisionObservable.add((e: IPhysicsCollisionEvent) => {
  const px = e.point!.x, py = e.point!.y, pz = e.point!.z; // copy numbers NOW (shared Vector3)
  const n = e.normal!.clone();                              // or clone
  if (e.type === PhysicsEventType.COLLISION_STARTED) { /* new manifold (may be speculative, distance > 0) */ }
});
plugin.onCollisionEndedObservable.add((e) => { if (e.type !== PhysicsEventType.COLLISION_FINISHED) return; /* ... */ });
```

## 2. Impulse semantics (VERIFIED numbers, dt = 1/60, restitution 0 unless noted)

| test | per-step pair sums (events/step) | check |
|---|---|---|
| 1 kg box, 1 m gap → static ground | step26 STARTED Σ0.284 (4 ev, distance +0.0712) · step27 CONTINUED Σ**4.339** · then ~0.12–0.16/step | m·(v_after−v_before)+m·g·dt = 4.337 (v_before −4.128) |
| 10 kg box, same | 2.835 · **43.351** · 1.2–1.64/step | exactly 10× |
| 1 kg box, 2 m gap | STARTED Σ**6.410** (distance +0.021) in the impact step | Δv-derived 6.409 |
| 1 kg box, 0.25 m gap | STARTED Σ**2.421** | Δv-derived 2.421 |
| 1 kg sphere, 1 m | STARTED 0.318 · CONTINUED **4.257** (1 event) · then 0.1635/step | m·4.094 + m·g·dt = 4.257 |
| 1 kg sphere, restitution 0.8 | 0.318 · 4.257 · **3.311** (bounce impulse arrives the *next* step) · FINISHED | |
| resting 1 kg box | 4 CONTINUED/step, Σ 0.158–0.1635 (points 0.020/0.020/0.059/0.059) | m·g·dt = 0.1635 |
| 1 kg box sliding at 3 m/s, μ 0.5 | Σ 0.1635/step | friction removed 0.082 N·s/step → friction impulse **not** reported |
| 1 kg box 1 m onto resting 1 kg box | top/bottom: 0.853 · 4.364 ; bottom/ground: 0.919 · 4.685 | |
| 10 kg box 1 m onto 1 kg box | 1.55 · 20.96 · 30.13 · 16.49 · 2.54 (spread over 5 steps, then toppled) | heavy-on-light impacts spread over several steps |
| 1 kg box 1 m onto MESH floor | 16 ev/step: STARTED Σ0.487 · CONTINUED Σ**4.271** | |

Conclusions: units N·s; per contact point; sum per pair per step = total normal impulse; may be on STARTED or the following CONTINUED (speculative contact one step early); ≈ m·v_impact (+ m·g·dt) for inelastic hits, restitution part one step later; resting noise per pair = (supported weight)·dt every awake step — note a box under a stack carries the whole stack's weight.

## 3. Who gets events / who is `collider` (VERIFIED matrix)

| pair (cb = setCollisionCallbackEnabled(true)) | events? | collider |
|---|---|---|
| static **with** cb + dynamic without | yes | the dynamic (no cb!) |
| dynamic with cb (created first or second) + static without | yes | the dynamic |
| neither has cb | no | – |
| dyn A (cb, created first) + dyn B (no cb) | yes | A |
| dyn A (no cb, created first) + dyn B (cb) | yes | **A (no cb!)** |
| ANIMATED (cb) moved into STATIC | no (kinematic–static pairs never collide) | – |
| ANIMATED (cb) pushing DYNAMIC (no cb) | yes | the animated |

Rule of thumb: pair reported if either mask has the bit; `collider` follows Havok's internal order, not the callback flag → always handle both sides (or use per-body observables / the `ImpactTracker`, which is order-agnostic).

## 4. Compound bodies & child index

- **VERIFIED**: for a body whose shape is a `PhysicsShapeContainer`, events have `colliderIndex = collidedAgainstIndex = 0`; no child info anywhere. Raw event (read via `hk.HP_Event_AsCollision(addr)` / memory): ContactPoint = `[bodyId, colliderId, shapePath, position, normal, triIdx]` with colliderId = **0**, shapePath = `[containerShapeId, 0x7FFFFFF]` (invalid key), triIdx = −1, for both bodies. Int32 layout at the event address: `[0]` type, `[2]` bodyA, `[4..5]` colliderA, `[6..9]` pathA, f32`[10..12]` posA, f32`[13..15]` normalA, `[16]` triA, `[18]` bodyB, … f32`[34]` impulse (matches the plugin's `CollisionEvent.readToRef`).
- **VERIFIED**: the raw list is consume-once — `HP_World_GetCollisionEvents` returns the same first address until the list has been walked with `HP_World_GetNextCollisionEvent`, then 0. The plugin walks it inside `executeStep`, so reading in `onAfterPhysicsObservable` yields nothing. (If ever needed: wrap `hk.HP_World_GetCollisionEvents`/`HP_World_GetNextCollisionEvent` on the injected module to capture the address the plugin is dispatching — verified to work, but useless for child ids.) Do not call `HP_Shape_PathIterator_GetNext` on event/ray paths: it crashed the renderer.
- **VERIFIED** thin instances (`PhysicsAggregate` on a thin-instanced mesh): `colliderIndex` = instance index, `body.getCollisionObservable(i)` per instance works, raycast `bodyIndex` = instance index.
- **VERIFIED** fallback: transform the contact point into body space and pick the child whose local AABB is closest → `nearestChildIndex()` (§9) matched the child that actually landed in all 12 sampled events. Contact points of compound/ground contacts in the impact step correctly lay on the lowest child.
- Raycast / shapeCast child identification: see §7/§8 (`result.shape` = child PhysicsShape for containers with ≥ 2 children). Use a **distinct PhysicsShape object per child** (a shape object added twice is ambiguous).

## 5. Cost (VERIFIED, 1000 awake 0.25 m boxes resting on a static slab, ALWAYS_ACTIVE, median of 3 runs)

| config | events/step | ms/step |
|---|---|---|
| callbacks off | 0 | 4.4 – 4.9 |
| `setCollisionCallbackEnabled(true)`, no observer attached | 4000 generated | 5.9 – 6.4 |
| + plugin observer counting | 4000 | 5.9 – 6.7 |
| + per-collider Map aggregation | 4000 | 6.7 – 6.9 |
| + 1000 per-body observables | 4000 | 6.4 – 7.9 |
| + `ImpactTracker` (§9) | 4000 | 7.7 |
| `setEventMask(1)` (STARTED only) | 4000 at step 0, then 0 | ≈ baseline |

≈ 0.3–0.5 µs plugin overhead per event + observer work (timer resolution 0.1 ms, run-to-run noise ±1 ms). With sleeping allowed (default), all 1000 boxes slept after 23 steps → 0 events, ~0.9–1.5 ms/step. So: enable callbacks on everything that can take damage or make sound; debris you never need to hear can stay at mask 0.

## 6. Triggers (VERIFIED)

```ts
shape.isTrigger = true; // PhysicsShape: set isTrigger(isTrigger: boolean); get isTrigger(): boolean
plugin.onTriggerCollisionObservable.add((e: IBasePhysicsCollisionEvent) => {
  if (e.type === PhysicsEventType.TRIGGER_ENTERED) { /* e.collider / e.collidedAgainst: either may be the trigger */ }
});
```
- Fires with **no event masks** on either body; once on enter, once on exit (not per step). Fields: the 5 base fields only (no point/normal/impulse).
- Static trigger vs DYNAMIC or ANIMATED body: events; static trigger vs static body: none. A trigger on a DYNAMIC body (gravity factor 0) also works and is not pushed.
- `collider` = the non-trigger body for static triggers, but = the trigger for a dynamic trigger created first → check both.
- No `TRIGGER_EXITED` when the body inside is disposed or falls asleep. Triggers produce no collision events and no collision response; rays/casts ignore them unless `shouldHitTriggers: true`.
- from HavokPhysics.d.ts: a MESH shape overlapping a trigger raises one event per overlapping triangle.

## 7. Raycast

```ts
// PhysicsEngineV2
raycastToRef(from: Vector3, to: Vector3, result: PhysicsRaycastResult | Array<PhysicsRaycastResult>, query?: IRaycastQuery): void;
raycast(from: Vector3, to: Vector3, query?: IRaycastQuery): PhysicsRaycastResult;            // allocates
raycastMulti(from: Vector3, to: Vector3, query?: IRaycastQuery): Array<PhysicsRaycastResult>; // = raycastToRef(from,to,[],q)
// HavokPlugin: raycast(from, to, result: PhysicsRaycastResult | Array<PhysicsRaycastResult>, query?: IRaycastQuery): void
//              setMaxQueryCollectorHits(n: number): void; getMaxQueryCollectorHits(): number  (buggy: always returns 1)
interface IRaycastQuery { membership?: number; collideWith?: number; shouldHitTriggers?: boolean; ignoreBody?: PhysicsBody; }
// PhysicsRaycastResult (extends CastingResult): hasHit, hitPointWorld(=hitPoint), hitNormalWorld(=hitNormal), hitDistance,
//   rayFromWorld, rayToWorld, body?: PhysicsBody, bodyIndex?: number, shape?: PhysicsShape, triangleIndex (-1 if not a mesh)
```
**VERIFIED**:
- `hitDistance` = world distance from `from` (ray 5 m above ground → 5). `hitNormalWorld` = surface normal facing the ray origin. No hit → `hasHit=false`, body/shape undefined, vectors zeroed, distance 0. Result vectors are reused per result object (clone to keep).
- A ray **starting inside** a convex shape does not report that shape (either direction). Use `pointProximity` (negative distance = inside).
- MESH shapes are two-sided (hit from below, normal (0,−1,0)) and give `triangleIndex` (index into the mesh's triangles).
- Filters: hit iff `(shape.filterMembershipMask & query.collideWith) && (query.membership & shape.filterCollideMask)`; defaults ~0. E.g. shape(m=2,c=all): q(m=1,c=1) miss, q(m=1,c=2) hit; shape(m=all,c=1): q(m=2) miss.
- Triggers ignored by default; `shouldHitTriggers:true` hits them. `ignoreBody` skips that body (from source: crashes for thin-instanced bodies — `_pluginData` undefined).
- `result.shape` by body shape: BOX/SPHERE/CAPSULE/CYLINDER/CONVEX_HULL/aggregate shapes → **undefined**; MESH → the mesh shape; container with ≥ 2 children (static or dynamic) → **the hit child PhysicsShape**; container with 1 child → undefined. (Raw cause: Havok returns the body id in the colliderId slot for leaf shapes.)
- Multi-hit: with the default collector (1 hit) `raycastMulti` returns **1** hit. After `new HavokPlugin(false, hk, { maxQueryCollectorHits: 16 })` or `plugin.setMaxQueryCollectorHits(16)` it returns all hits **sorted by distance**, one per leaf shape (a ray through a 4-child compound → 4 hits on the same body, each with its child shape). A pre-sized array of k results gets the nearest k. A single result object always returns the nearest hit.
- Freshly created bodies are hit before any step. Moving a dynamic body via `mesh.position` does nothing (`disablePreStep` true by default): ray at the new spot misses, physics syncs the mesh back.
- Cost: ~13 µs per single-hit ray, ~26 µs per multi-hit ray (500 bodies).

## 8. Shape cast & proximity (HavokPlugin only — no PhysicsEngineV2 wrappers)

```ts
shapeCast(query: IPhysicsShapeCastQuery, inputShapeResult: ShapeCastResult, hitShapeResult: ShapeCastResult): void;
shapeProximity(query: IPhysicsShapeProximityCastQuery, inputShapeResult: ProximityCastResult, hitShapeResult: ProximityCastResult): void;
pointProximity(query: IPhysicsPointProximityQuery, result: ProximityCastResult): void;
interface IPhysicsShapeCastQuery { shape: PhysicsShape; rotation: Quaternion; startPosition: Vector3; endPosition: Vector3; shouldHitTriggers: boolean; ignoreBody?: PhysicsBody; } // NOT exported from root
interface IPhysicsShapeProximityCastQuery { shape: PhysicsShape; position: Vector3; rotation: Quaternion; maxDistance: number; shouldHitTriggers: boolean; ignoreBody?: PhysicsBody; }
interface IPhysicsPointProximityQuery { position: Vector3; maxDistance: number; collisionFilter: IRaycastQuery; shouldHitTriggers: boolean; ignoreBody?: PhysicsBody; }
// ShapeCastResult: CastingResult + hitFraction;  ProximityCastResult: CastingResult + hitDistance
type ShapeCastQuery = Parameters<HavokPlugin["shapeCast"]>[0]; // how to name the unexported type
```
**VERIFIED** (sphere r = 0.1 swept along +x into a 1 m box face at x = 4.5):
- `hitShapeResult`: `hitPoint` (4.5, 0.5, 0) **world** on the hit body, `hitNormal` (−1,0,0) = hit surface normal (points back at the caster), `body`, `bodyIndex`, `shape` (child for ≥2-child containers, else undefined), `hitFraction` 0.4 → centre at impact = lerp(start, end, fraction) = (4.4, 0.5, 0).
- `inputShapeResult`: `hitPoint` (0.1, 0, 0) = contact point on the cast shape in the cast shape's **local, rotated** frame; `hitNormal` (1,0,0) local (= −hit normal); `body` undefined; same fraction. Rotated box cast: rotation honoured (centre at impact y = 1.15 as expected).
- Starting in penetration → `hasHit`, `hitFraction` 0 (input point unreliable, e.g. (0,0,0) or (−0.5,0,0)). Miss → `hasHit` false on both.
- Only the first hit. Filtering = the **query shape's** `filterMembershipMask`/`filterCollideMask` (two-way test like rays); `ignoreBody` works. All hits along a sweep need the raw API: `hk.HP_World_ShapeCastWithCollector(plugin.world, hk.HP_QueryCollector_Create(16)[1], [shape._pluginData, [qx,qy,qz,qw], [sx,sy,sz], [ex,ey,ez], false, [BigInt(0)]])` then `HP_QueryCollector_GetShapeCastResult(coll, i)[1] = [fraction, inputCP, hitCP]` (hitCP[0][0] = body id → `plugin._bodies.get(id).body`); hits come **unsorted** (verified 3 walls, reverse order). Release with `HP_QueryCollector_Release`.
- `shapeProximity`: `hitDistance` = surface gap (0.3 for a 0.3 gap); > maxDistance → no hit; overlapping with maxDistance 0 → hit with **negative** distance (−0.05 = penetration depth; centre inside box → −0.6). Points: input local, hit world.
- `pointProximity`: nearest surface point (world) + outward normal + distance; inside a body → negative distance (−0.5 at 0.5 depth) even with maxDistance 0. Pass `collisionFilter: {}` (required field; only its membership/collideWith are read).
- Cost: ~10 µs per sphere cast (300 bodies).

## 9. Copy-paste helpers (verified)

Source of truth: `tests/probes/physics-events-helpers.ts`, verified by `tests/probes/physics-events-helpers.probe.ts`.
`ImpactTracker` results (defaults: minExcessImpulse 0.5 N·s, minDeltaV 0.5 m/s):
- 1 kg / 10 kg box dropped 1 m → exactly **one** impact each (excess 4.27 / 42.6 N·s, 4 contacts, normal (0,−1,0), isNew).
- Resting 1 kg box, resting **30 kg box spawned in contact**, sliding box, a sleeping box woken by a touching sphere → **no** impacts.
- Bouncing sphere → one `isNew` impact per bounce (+ a follow-up `isNew:false` emission for the restitution impulse).
- Box onto MESH floor → one impact (16 contacts aggregated). Tilted compound → impact at first touch (4.86) and when the rest lands (9.93).
- 10 kg onto 1 kg stack → a burst of emissions over 4 steps (first `isNew`), sum of `excess` ≈ total impact impulse.
- Overhead ≈ +1 ms per 4000 events on top of the plugin's own cost (§5).
- Disposing a body from an `onImpact` handler while the same body has another pair pending in that flush: no error, the stale pair is skipped.

Usage:
```ts
import { PhysicsShapeSphere, Vector3 } from "@babylonjs/core";
import { ImpactTracker, raycastPhysics, sphereSweep, nearestChildIndex } from "./physicsEventsHelpers"; // copy of the file below

const tracker = new ImpactTracker(scene, plugin, { minExcessImpulse: 0.5, minDeltaV: 0.5 });
tracker.onImpact.add((imp) => {
  // damageSystem / audio are your own systems. This runs inside scene.onAfterPhysicsObservable, i.e. after Havok's
  // event loop: disposing/spawning bodies here is safe (VERIFIED: disposing a body that still had another pair
  // pending in the same flush works — the tracker skips disposed bodies). Queue heavy fracture work if needed.
  damageSystem.applyImpulse(imp.bodyA, imp.indexA, imp.excess, imp.point, imp.normal);
  damageSystem.applyImpulse(imp.bodyB, imp.indexB, imp.excess, imp.point, imp.normal.negate());
  if (imp.isNew) audio.playImpact(imp.point, imp.excess);
});
// after spawning fracture fragments that touch each other / the parent's neighbours:
for (const frag of fragments) { frag.body.setCollisionCallbackEnabled(true); tracker.mute(frag.body, 8); }

const hit = raycastPhysics(pe, camPos, camPos.add(camDir.scale(3)));           // {body, bodyIndex, shape, point, normal, distance, triangleIndex} | null
const swingProbe = new PhysicsShapeSphere(Vector3.Zero(), 0.06, scene);          // reuse; set its filter masks to filter the sweep
const sweep = sphereSweep(plugin, swingProbe, headPosPrev, headPosNow, playerBody); // {body, point, normal, fraction, centre, shape} | null
const child = nearestChildIndex(compoundBody, imp.point, childBoxes);           // childBoxes: [{centre, half}] in body space
```

```ts
// Copy-pasteable helpers verified by physics-events-helpers.probe.ts (see docs/api-notes/physics-events-queries.md).
import {
  Vector3,
  Quaternion,
  Matrix,
  Observable,
  PhysicsRaycastResult,
  ShapeCastResult,
  PhysicsEventType,
  PhysicsMotionType,
  type Scene,
  type HavokPlugin,
  type PhysicsEngineV2,
  type PhysicsBody,
  type PhysicsShape,
  type IPhysicsCollisionEvent,
  type IBasePhysicsCollisionEvent,
  type IRaycastQuery,
  type Observer,
} from "@babylonjs/core";

// ---------------------------------------------------------------------------------------------
// 1. Impact aggregation: Havok reports ONE EVENT PER CONTACT POINT per step (a flat box = 4 events),
//    the main impulse may arrive on STARTED *or* on the following CONTINUED step (speculative contacts),
//    resting contacts keep reporting ~m*g*dt per step while awake, and point/normal Vector3s are reused.
//    This aggregates per body pair per physics step and emits impacts above a resting baseline.
// ---------------------------------------------------------------------------------------------
export interface ImpactEvent {
  bodyA: PhysicsBody; indexA: number; // pair order is arbitrary (first-seen collider): check both bodies
  bodyB: PhysicsBody; indexB: number;
  impulse: number; // total normal impulse of this pair in this step (N*s), sum over contact points
  excess: number; // impulse above the pair's resting baseline (what you should feed into damage)
  point: Vector3; // impulse-weighted average contact point (world, on bodyA's surface), owned by the event
  normal: Vector3; // unit, points from bodyA toward bodyB (world)
  contacts: number; // number of contact points aggregated
  isNew: boolean; // first emission for this pair after `newImpactCooldownSteps` quiet steps (use for sounds)
  step: number;
}

interface PairAcc {
  a: PhysicsBody; ia: number; b: PhysicsBody; ib: number; lo: number; hi: number;
  imp: number; wsum: number; px: number; py: number; pz: number; nx: number; ny: number; nz: number; n: number;
  baseline: number; started: boolean; lastSeenStep: number; lastEmitStep: number;
}

export interface ImpactTrackerOptions {
  /** Minimum excess impulse (N*s) to emit. Default 0.5 */
  minExcessImpulse?: number;
  /** Minimum excess / (lightest DYNAMIC mass of the pair) in m/s. Filters resting/spawn load (~g*dt = 0.16). Default 0.5 */
  minDeltaV?: number;
  /** Baseline EMA factor per step (0..1). Default 0.25 */
  baselineAlpha?: number;
  /** Steps without emission before an impact counts as "new". Default 6 (~100 ms) */
  newImpactCooldownSteps?: number;
  /** Drop pair state after this many steps without events (bodies asleep keep no events!). Default 600 */
  forgetAfterSteps?: number;
}

export class ImpactTracker {
  readonly onImpact = new Observable<ImpactEvent>();
  // pairs keyed lo -> hi with numeric keys (transformNode.uniqueId * 4096 + instanceIndex), no string allocation
  private pairs = new Map<number, Map<number, PairAcc>>();
  private touched: PairAcc[] = [];
  private finished: PairAcc[] = [];
  private stepNo = 0;
  private collObs: Observer<IPhysicsCollisionEvent>;
  private endObs: Observer<IBasePhysicsCollisionEvent>;
  private afterObs: Observer<Scene>;
  private opts: Required<ImpactTrackerOptions>;
  private muted = new WeakMap<PhysicsBody, number>(); // body -> step until which its impacts are ignored
  // events of one pair arrive consecutively (one per contact point): cache the last lookup
  private lastC: PhysicsBody | null = null; private lastCI = -1; private lastO: PhysicsBody | null = null; private lastOI = -1;
  private lastPair: PairAcc | null = null;

  constructor(scene: Scene, plugin: HavokPlugin, opts: ImpactTrackerOptions = {}) {
    this.opts = { minExcessImpulse: 0.5, minDeltaV: 0.5, baselineAlpha: 0.25, newImpactCooldownSteps: 6, forgetAfterSteps: 600, ...opts };
    this.collObs = plugin.onCollisionObservable.add((e) => this.accumulate(e));
    // FINISHED is reported per contact point / manifold (mesh floors churn manifolds while still touching), so a
    // pair is only forgotten if it reported no contact event in the same step.
    this.endObs = plugin.onCollisionEndedObservable.add((e) => {
      if (e.type !== PhysicsEventType.COLLISION_FINISHED) return;
      const p = this.find(e.collider, e.colliderIndex, e.collidedAgainst, e.collidedAgainstIndex, false);
      if (p) this.finished.push(p);
    });
    this.afterObs = scene.onAfterPhysicsObservable.add(() => this.flush());
  }

  /** Ignore impacts involving `body` for `steps` physics steps (e.g. freshly spawned fragments touching neighbours). */
  mute(body: PhysicsBody, steps = 8) {
    this.muted.set(body, this.stepNo + steps);
  }

  private isMuted(b: PhysicsBody) {
    const until = this.muted.get(b);
    return until !== undefined && this.stepNo < until;
  }

  /** Mass used for the delta-v test: Infinity for STATIC / ANIMATED bodies. */
  private massOf(b: PhysicsBody, index: number): number {
    if (b.getMotionType(index) !== PhysicsMotionType.DYNAMIC) return Infinity;
    return b.getMassProperties(index).mass ?? 1;
  }

  private find(a: PhysicsBody, ia: number, b: PhysicsBody, ib: number, create: boolean): PairAcc | null {
    const ka = a.transformNode.uniqueId * 4096 + ia, kb = b.transformNode.uniqueId * 4096 + ib;
    const lo = ka < kb ? ka : kb, hi = ka < kb ? kb : ka; // canonical: (A,B) and (B,A) share one accumulator
    let m = this.pairs.get(lo);
    if (!m) {
      if (!create) return null;
      m = new Map();
      this.pairs.set(lo, m);
    }
    let p = m.get(hi);
    if (!p && create) {
      p = { a, ia, b, ib, lo, hi, imp: 0, wsum: 0, px: 0, py: 0, pz: 0, nx: 0, ny: 0, nz: 0, n: 0, baseline: 0, started: false, lastSeenStep: -1, lastEmitStep: -1e9 };
      m.set(hi, p);
    }
    return p ?? null;
  }

  private remove(p: PairAcc) {
    const m = this.pairs.get(p.lo);
    if (m) { m.delete(p.hi); if (m.size === 0) this.pairs.delete(p.lo); }
    if (this.lastPair === p) this.lastPair = null;
  }

  private accumulate(e: IPhysicsCollisionEvent) {
    if (e.type === PhysicsEventType.COLLISION_FINISHED) return; // (never delivered here, defensive)
    let p: PairAcc;
    if (this.lastPair && e.collider === this.lastC && e.colliderIndex === this.lastCI && e.collidedAgainst === this.lastO && e.collidedAgainstIndex === this.lastOI) {
      p = this.lastPair;
    } else {
      p = this.find(e.collider, e.colliderIndex, e.collidedAgainst, e.collidedAgainstIndex, true)!;
      this.lastPair = p; this.lastC = e.collider; this.lastCI = e.colliderIndex; this.lastO = e.collidedAgainst; this.lastOI = e.collidedAgainstIndex;
    }
    if (p.lastSeenStep !== this.stepNo) {
      p.imp = p.wsum = p.px = p.py = p.pz = p.nx = p.ny = p.nz = 0; p.n = 0; p.started = false;
      p.lastSeenStep = this.stepNo;
      this.touched.push(p);
    }
    // STARTED = new manifold -> resting baseline restarts at 0. CONTINUED after a gap (island woke up) keeps it.
    if (e.type === PhysicsEventType.COLLISION_STARTED) p.started = true;
    const w = e.impulse > 1e-6 ? e.impulse : 1e-6;
    const pt = e.point!, nrm = e.normal!; // reused objects: read the numbers now, never keep the refs
    const s = p.a === e.collider && p.ia === e.colliderIndex ? w : -w; // normal points collider -> collidedAgainst
    p.imp += e.impulse;
    p.wsum += w;
    p.px += pt.x * w; p.py += pt.y * w; p.pz += pt.z * w;
    p.nx += nrm.x * s; p.ny += nrm.y * s; p.nz += nrm.z * s;
    p.n++;
  }

  private flush() {
    const o = this.opts;
    for (const p of this.touched) {
      if (p.a.isDisposed || p.b.isDisposed) continue; // an earlier onImpact handler may have disposed it
      if (p.started) p.baseline = 0;
      const excess = p.imp - p.baseline;
      if (excess >= o.minExcessImpulse && !this.isMuted(p.a) && !this.isMuted(p.b) && excess / Math.min(this.massOf(p.a, p.ia), this.massOf(p.b, p.ib)) >= o.minDeltaV) {
        const wt = p.wsum;
        const normal = new Vector3(p.nx, p.ny, p.nz);
        const len = normal.length();
        if (len > 1e-9) normal.scaleInPlace(1 / len);
        this.onImpact.notifyObservers({
          bodyA: p.a, indexA: p.ia, bodyB: p.b, indexB: p.ib,
          impulse: p.imp, excess, contacts: p.n, step: this.stepNo,
          point: new Vector3(p.px / wt, p.py / wt, p.pz / wt), normal,
          isNew: this.stepNo - p.lastEmitStep > o.newImpactCooldownSteps,
        });
        p.lastEmitStep = this.stepNo;
      }
      // EMA baseline tracks sustained (resting / pushing) load; impacts rise far above it
      p.baseline += (p.imp - p.baseline) * o.baselineAlpha;
    }
    this.touched.length = 0;
    for (const p of this.finished) if (p.lastSeenStep !== this.stepNo) this.remove(p);
    this.finished.length = 0;
    if (this.stepNo % 60 === 0) {
      for (const m of this.pairs.values())
        for (const p of m.values())
          if (p.a.isDisposed || p.b.isDisposed || this.stepNo - p.lastSeenStep > o.forgetAfterSteps) this.remove(p);
    }
    this.lastPair = null; // never carry the consecutive-event cache across steps
    this.stepNo++;
  }

  dispose() {
    this.collObs.remove();
    this.endObs.remove();
    this.afterObs.remove();
    this.onImpact.clear();
    this.pairs.clear();
    this.finished.length = 0;
    this.lastPair = null;
  }
}

// ---------------------------------------------------------------------------------------------
// 2. Raycast returning plain data (cloned), with optional child-shape index for compound bodies.
// ---------------------------------------------------------------------------------------------
export interface RayHit {
  body: PhysicsBody;
  bodyIndex: number; // thin-instance index (0 for normal bodies)
  shape: PhysicsShape | undefined; // leaf shape: set for MESH shapes and for containers with >= 2 children, else undefined
  point: Vector3;
  normal: Vector3;
  distance: number; // world units from `from`
  triangleIndex: number; // MESH shapes only, else -1
}
const _rayRes = new PhysicsRaycastResult();
export function raycastPhysics(pe: PhysicsEngineV2, from: Vector3, to: Vector3, query?: IRaycastQuery): RayHit | null {
  pe.raycastToRef(from, to, _rayRes, query);
  if (!_rayRes.hasHit || !_rayRes.body) return null;
  return {
    body: _rayRes.body,
    bodyIndex: _rayRes.bodyIndex ?? 0,
    shape: _rayRes.shape,
    point: _rayRes.hitPointWorld.clone(),
    normal: _rayRes.hitNormalWorld.clone(),
    distance: _rayRes.hitDistance,
    triangleIndex: _rayRes.triangleIndex,
  };
}

// ---------------------------------------------------------------------------------------------
// 3. Sphere sweep A -> B (tool swing hit detection). Returns first hit (fraction 0 = already overlapping at A).
// ---------------------------------------------------------------------------------------------
export interface SweepHit {
  body: PhysicsBody;
  bodyIndex: number;
  shape: PhysicsShape | undefined; // child shape for containers with >= 2 children, else undefined
  point: Vector3; // world contact point on the hit body
  normal: Vector3; // world surface normal of the hit body (points back toward the sweep)
  fraction: number; // 0..1 along A->B
  centre: Vector3; // sphere centre at time of impact = A + (B-A)*fraction
}
const _inRes = new ShapeCastResult();
const _hitRes = new ShapeCastResult();
export function sphereSweep(
  plugin: HavokPlugin,
  sphere: PhysicsShape, // e.g. new PhysicsShapeSphere(Vector3.Zero(), r, scene); its filter masks act as the query filter
  a: Vector3,
  b: Vector3,
  ignoreBody?: PhysicsBody,
): SweepHit | null {
  plugin.shapeCast({ shape: sphere, rotation: Quaternion.Identity(), startPosition: a, endPosition: b, shouldHitTriggers: false, ignoreBody }, _inRes, _hitRes);
  if (!_hitRes.hasHit || !_hitRes.body) return null;
  return {
    body: _hitRes.body,
    bodyIndex: _hitRes.bodyIndex ?? 0,
    shape: _hitRes.shape,
    point: _hitRes.hitPoint.clone(),
    normal: _hitRes.hitNormal.clone(),
    fraction: _hitRes.hitFraction,
    centre: Vector3.Lerp(a, b, _hitRes.hitFraction),
  };
}

// ---------------------------------------------------------------------------------------------
// 4. Child of a compound body nearest to a world point (collision events never carry the child index).
//    children: body-local AABBs of the children (centre = translation passed to container.addChild,
//    half = half extents; for rotated children use their local AABB).
// ---------------------------------------------------------------------------------------------
const _invM = new Matrix();
const _lp = new Vector3();
export function nearestChildIndex(body: PhysicsBody, worldPoint: Vector3, children: { centre: Vector3; half: Vector3 }[]): number {
  // computeWorldMatrix(true): inside physics callbacks the cached world matrix is stale (last render / last compute)
  body.transformNode.computeWorldMatrix(true).invertToRef(_invM);
  Vector3.TransformCoordinatesToRef(worldPoint, _invM, _lp);
  let best = -1, bestD = Infinity, bestC = Infinity;
  for (let i = 0; i < children.length; i++) {
    const { centre: c, half: h } = children[i];
    const dx = Math.max(Math.abs(_lp.x - c.x) - h.x, 0), dy = Math.max(Math.abs(_lp.y - c.y) - h.y, 0), dz = Math.max(Math.abs(_lp.z - c.z) - h.z, 0);
    const d = dx * dx + dy * dy + dz * dz; // 0 when the point is on/inside the child's box
    const dc = Vector3.DistanceSquared(_lp, c); // tie-break: closest centre
    if (d < bestD - 1e-8 || (Math.abs(d - bestD) <= 1e-8 && dc < bestC)) { bestD = d; bestC = dc; best = i; }
  }
  return best;
}
```

## Pitfalls
1. Treating events as per-pair: they are per contact point (4 for a flat box, ~16 on a mesh floor). Sum per pair per step.
2. Using only STARTED for impact strength: with speculative contacts the impulse is on the next CONTINUED (1 m drop: STARTED 0.28 vs CONTINUED 4.34 N·s).
3. Storing `e.point` / `e.normal` / `result.hitPointWorld`: shared, overwritten objects. Copy or clone.
4. Assuming `collider` = the body you enabled callbacks on, or the trigger. It's Havok's order. Normalise.
5. `getCollisionEndedObservable()` receives STARTED/CONTINUED too unless some body has a `getCollisionObservable()`; always check `type`.
6. Havok reuses body ids immediately: (a) dispose + create inside a collision callback → the rest of the step's events for the old body are attributed to the new one (VERIFIED: 3 "replacement" events at the victim's old position); (b) per-body **ended** observables are not removed on dispose and fire for the next body that gets the id (VERIFIED: 4 FINISHED). Structural changes go to `onAfterPhysicsObservable`; call `body.getCollisionEndedObservable().clear()` before disposing a body that had ended observers.
7. Resting contacts are noise you must threshold (≈ supported weight × dt per step, i.e. 0.16 N·s/kg) — and a heavy object spawned in contact gives a STARTED of that size (30 kg → 4.9 N·s). Gate by Δv = impulse / lightest dynamic mass, mute fresh fragments.
8. Sleeping bodies emit no events (no FINISHED either), so "damage over time from a static load" cannot come from events.
9. `setCollisionCallbackEnabled(false)` sets the mask to 0, also killing FINISHED; `setCollisionCallbackEnabled(true)` overwrites any custom mask with 7.
10. Collision events contain no compound child index (and no raw shape key). Raycasts/shape casts give the child via `result.shape` only for containers with ≥ 2 distinct child shape objects; for leaf convex shapes `result.shape` is undefined (use `result.body.shape`).
11. `scene.getPhysicsEngine()` is typed `IPhysicsEngine` (no `raycastToRef`/`raycastMulti`): cast to `PhysicsEngineV2`. `PhysicsEngine` from the root is the v1 engine.
12. `raycastMulti` silently returns 1 hit unless `maxQueryCollectorHits > 1`; `getMaxQueryCollectorHits()` always reports 1.
13. Rays starting inside a convex body miss it; shape casts starting in penetration return fraction 0 with unreliable input-side data.
14. `shapeCast`/`shapeProximity` have no filter fields: set `filterMembershipMask`/`filterCollideMask` on the query shape. `IPhysicsShapeCastQuery` isn't exported from the root.
15. Kinematic (ANIMATED) bodies never collide with STATIC bodies (no events), but DO trigger static triggers.
16. No TRIGGER_EXITED when a body inside a trigger is disposed or sleeps — track occupancy yourself.
17. Inside physics callbacks `getWorldMatrix()` is stale → `computeWorldMatrix(true)` before world↔local conversions.
18. Probes/tests: `HavokPlugin(true)` + tight `scene.render()` loop = 1 ms of physics per call. Use `HavokPlugin(false, hk)` and `scene.animate()`/`scene.render()` for exact 1/60 steps.
19. Do not call `hk.HP_Shape_PathIterator_GetNext` with shape paths from events/rays (garbage data; crashed the page).
20. (Toolchain, found while writing probes) TypeScript 7.0.2 here enforces `erasableSyntaxOnly`: `enum`, `const enum` and constructor parameter properties (`constructor(private x: T)`) are compile errors (TS1294). Use `as const` objects / explicit fields. Importing Babylon's enums is fine.

## Probe index
`tests/probes/physics-events-common.ts` (world setup) · `-basic` (fields, masks, reuse, conventions, drop impulses) · `-impulse` (stacks, sliding, bounce/FINISHED, masks, sleep) · `-onesided` (callback matrix, ended-observable quirk, dispose in callback) · `-compound` (children, thin instances, id reuse) · `-rawdebug` (raw event layout, consume-once, iteration tap) · `-raycast`, `-rayshape` (raycast semantics, result.shape per type) · `-trigger` · `-shapecast` · `-cost` · `-leak` (id-reuse hazards) · `-helpers` (+ `physics-events-helpers.ts`). Run: `node tests/probe.mjs tests/probes/<file>`.
