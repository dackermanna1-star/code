// Q12: performance of many bodies (pile of 1000 convex hulls, 3000 sleeping, collision callbacks, sync cost)
import { Vector3, Quaternion, Matrix, TransformNode, PhysicsBody, PhysicsMotionType, PhysicsShape, PhysicsShapeBox, NullEngine, Scene, HavokPlugin, FreeCamera, type IPhysicsCollisionEvent } from "@babylonjs/core";
import HavokPhysics, { type HavokPhysicsWithBindings } from "@babylonjs/havok";
import havokWasmUrl from "@babylonjs/havok/lib/esm/HavokPhysics.wasm?url";
import { r3 } from "./physics-bodies-util";

async function freshWorld() {
  const hk = await HavokPhysics({ locateFile: () => havokWasmUrl });
  const engine = new NullEngine();
  const scene = new Scene(engine);
  new FreeCamera("c", new Vector3(0, 5, -10), scene);
  const plugin = new HavokPlugin(true, hk);
  scene.enablePhysics(new Vector3(0, -9.81, 0), plugin);
  // time the native world step separately
  let nativeMs = 0;
  const origStep = hk.HP_World_Step.bind(hk);
  (hk as unknown as { HP_World_Step: typeof hk.HP_World_Step }).HP_World_Step = (w, dt) => { const t = performance.now(); const r = origStep(w, dt); nativeMs += performance.now() - t; return r; };
  return { hk, engine, scene, plugin, native: () => nativeMs, resetNative: () => { nativeMs = 0; } };
}
type W = Awaited<ReturnType<typeof freshWorld>>;

function staticBox(w: W, c: Vector3, e: Vector3) {
  const b = new PhysicsBody(new TransformNode("s", w.scene), PhysicsMotionType.STATIC, false, w.scene);
  b.shape = new PhysicsShapeBox(c, Quaternion.Identity(), e, w.scene);
  return b;
}
function pen(w: W, half: number) {
  staticBox(w, new Vector3(0, -0.5, 0), new Vector3(half * 2 + 2, 1, half * 2 + 2));
  staticBox(w, new Vector3(half + 0.5, 3, 0), new Vector3(1, 6, half * 2));
  staticBox(w, new Vector3(-half - 0.5, 3, 0), new Vector3(1, 6, half * 2));
  staticBox(w, new Vector3(0, 3, half + 0.5), new Vector3(half * 2, 6, 1));
  staticBox(w, new Vector3(0, 3, -half - 0.5), new Vector3(half * 2, 6, 1));
}
function hull(w: W, seed: number, npts: number, size: number): PhysicsShape {
  let s = seed;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const pts = new Float32Array(npts * 3);
  for (let i = 0; i < pts.length; i++) pts[i] = (rnd() - 0.5) * size;
  const hk = w.hk;
  const ptr = hk._malloc(pts.length * 4);
  new Float32Array(hk.HEAPU8.buffer, ptr, pts.length).set(pts);
  const res = hk.HP_Shape_CreateConvexHull(ptr, npts);
  hk._free(ptr);
  return new PhysicsShape({ pluginData: res[1] }, w.scene);
}
function stats(a: number[]) {
  const s = [...a].sort((x, y) => x - y);
  const avg = a.reduce((p, c) => p + c, 0) / Math.max(1, a.length);
  return { avg: r3(avg), p50: r3(s[Math.floor(s.length * 0.5)] ?? 0), p95: r3(s[Math.floor(s.length * 0.95)] ?? 0), max: r3(s[s.length - 1] ?? 0) };
}
const asleepCount = (hk: HavokPhysicsWithBindings, bodies: PhysicsBody[]) => bodies.reduce((n, b) => n + (hk.HP_Body_GetActivationState(b._pluginData.hpBodyId)[1] === hk.ActivationState.INACTIVE ? 1 : 0), 0);

async function pileRun(withCallbacks: boolean) {
  const w = await freshWorld();
  pen(w, 3);
  const bodies: PhysicsBody[] = [];
  for (let i = 0; i < 1000; i++) {
    const tn = new TransformNode("h" + i, w.scene);
    tn.position.set(-2.7 + (i % 10) * 0.6, 0.4 + Math.floor(i / 100) * 0.6, -2.7 + (Math.floor(i / 10) % 10) * 0.6);
    tn.rotationQuaternion = Quaternion.RotationYawPitchRoll(i, i * 0.37, i * 0.11);
    tn.computeWorldMatrix(true);
    const b = new PhysicsBody(tn, PhysicsMotionType.DYNAMIC, false, w.scene);
    b.shape = hull(w, i + 1, 20, 0.35);
    if (withCallbacks) b.setCollisionCallbackEnabled(true);
    bodies.push(b);
  }
  let events = 0;
  let maxImpulse = 0;
  const evCounts: number[] = [];
  if (withCallbacks) w.plugin.onCollisionObservable.add((ev: IPhysicsCollisionEvent) => { events++; if (ev.impulse > maxImpulse) maxImpulse = ev.impulse; });
  const total: number[] = [], native: number[] = [];
  for (let i = 0; i < 600; i++) {
    w.resetNative();
    const e0 = events;
    const t = performance.now();
    w.scene._advancePhysicsEngineStep(1000 / 60);
    total.push(performance.now() - t);
    native.push(w.native());
    evCounts.push(events - e0);
  }
  const phase = (a: number[], from: number, to: number) => stats(a.slice(from, to));
  const res = {
    totalMs: { fall_0_40: phase(total, 0, 40), impact_40_200: phase(total, 40, 200), settle_200_400: phase(total, 200, 400), late_400_600: phase(total, 400, 600) },
    nativeWorldStepMs: { impact_40_200: phase(native, 40, 200), late_400_600: phase(native, 400, 600) },
    eventsPerStep: withCallbacks ? { impact_40_200: phase(evCounts, 40, 200), late_400_600: phase(evCounts, 400, 600) } : undefined,
    asleepAtEnd: asleepCount(w.hk, bodies),
    maxHeight: r3(Math.max(...bodies.map((b) => b.transformNode.position.y))),
    escaped: bodies.filter((b) => Math.abs(b.transformNode.position.x) > 3.2 || Math.abs(b.transformNode.position.z) > 3.2 || b.transformNode.position.y < -0.5).length,
  };
  w.engine.dispose();
  return res;
}

const RUN_PILES = true;
export async function probe() {
  const out: Record<string, unknown> = {};
  if (RUN_PILES) {
    out.pile1000Hulls20pts_noCallbacks = await pileRun(false);
    out.pile1000Hulls20pts_callbacksOnAll = await pileRun(true);
  }

  // ---- 3000 sleeping boxes vs active, and sync cost ----
  {
    const w = await freshWorld();
    staticBox(w, new Vector3(0, -0.5, 0), new Vector3(100, 1, 100));
    const bodies: PhysicsBody[] = [];
    const shape = new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(0.2, 0.2, 0.2), w.scene);
    const tCreate = performance.now();
    for (let i = 0; i < 3000; i++) {
      const tn = new TransformNode("s" + i, w.scene);
      tn.position.set(-27 + (i % 55) * 1.0, 0.1, -27 + Math.floor(i / 55) * 1.0);
      tn.rotationQuaternion = Quaternion.Identity();
      tn.computeWorldMatrix(true);
      const b = new PhysicsBody(tn, PhysicsMotionType.DYNAMIC, true, w.scene);
      b.shape = shape;
      bodies.push(b);
    }
    const createMs = performance.now() - tCreate;
    const measure = (n: number) => {
      const total: number[] = [], native: number[] = [];
      for (let i = 0; i < n; i++) { w.resetNative(); const t = performance.now(); w.scene._advancePhysicsEngineStep(1000 / 60); total.push(performance.now() - t); native.push(w.native()); }
      return { total: stats(total), native: stats(native) };
    };
    measure(30); // warm-up
    const asleep0 = asleepCount(w.hk, bodies);
    const sleeping = measure(120);
    for (const b of bodies) b.disableSync = true;
    const sleepingNoSync = measure(120);
    for (const b of bodies) b.disableSync = false;
    // collision callbacks on all 3000 sleeping bodies
    let sleepEvents = 0;
    const so = w.plugin.onCollisionObservable.add(() => sleepEvents++);
    for (const b of bodies) b.setCollisionCallbackEnabled(true);
    const sleepingWithCallbacks = measure(60);
    const sleepingEventsPerStep = sleepEvents / 60;
    for (const b of bodies) b.setCollisionCallbackEnabled(false);
    w.plugin.onCollisionObservable.remove(so);
    // activation-state polling cost
    let t = performance.now();
    const asleep1 = asleepCount(w.hk, bodies);
    const pollMs = performance.now() - t;
    // wake all (moving, not colliding)
    w.scene.getPhysicsEngine()!.setGravity(new Vector3(0, 0, 0));
    for (const b of bodies) b.setLinearVelocity(new Vector3(0, 0.01, 0));
    const active = measure(120);
    const asleepAfterWake = asleepCount(w.hk, bodies);
    // fast sync: read transforms straight from the world body buffer
    const offsets = bodies.map((b) => w.hk.HP_Body_GetWorldTransformOffset(b._pluginData.hpBodyId)[1]);
    const tmpM = new Matrix();
    const fastSync = () => {
      const base = w.hk.HP_World_GetBodyBuffer(w.plugin.world)[1];
      const f32 = new Float32Array(w.hk.HEAPU8.buffer);
      for (let i = 0; i < bodies.length; i++) {
        const o = (base + offsets[i]) >> 2;
        const n = bodies[i].transformNode;
        n.position.set(f32[o + 12], f32[o + 13], f32[o + 14]);
        Matrix.FromArrayToRef(f32, o, tmpM);
        Quaternion.FromRotationMatrixToRef(tmpM, n.rotationQuaternion!);
      }
    };
    for (const b of bodies) b.disableSync = true;
    const fastTimes: number[] = [];
    const obs = w.scene.onAfterPhysicsObservable.add(() => { const t0 = performance.now(); fastSync(); fastTimes.push(performance.now() - t0); });
    const activeFastSync = measure(120);
    w.scene.onAfterPhysicsObservable.remove(obs);
    // correctness of fast sync vs Havok QTransform
    let maxErr = 0;
    for (let i = 0; i < bodies.length; i += 97) {
      const q = w.hk.HP_Body_GetQTransform(bodies[i]._pluginData.hpBodyId)[1];
      const n = bodies[i].transformNode;
      maxErr = Math.max(maxErr, Math.abs(q[0][0] - n.position.x), Math.abs(q[0][1] - n.position.y), Math.abs(q[0][2] - n.position.z), Math.min(Math.abs(q[1][3] - n.rotationQuaternion!.w), Math.abs(q[1][3] + n.rotationQuaternion!.w)));
    }
    // offset stability after removing + adding bodies
    const keep = bodies.slice(0, 1500);
    for (const b of bodies.slice(1500, 2250)) b.dispose();
    for (let i = 0; i < 500; i++) { const tn = new TransformNode("n" + i, w.scene); tn.position.set(0, 5 + i, 40); const b = new PhysicsBody(tn, PhysicsMotionType.DYNAMIC, false, w.scene); b.shape = shape; }
    let changed = 0;
    for (let i = 0; i < keep.length; i++) if (w.hk.HP_Body_GetWorldTransformOffset(keep[i]._pluginData.hpBodyId)[1] !== offsets[i]) changed++;
    out.bodies3000 = {
      createMs: r3(createMs), asleepInitially: asleep0, asleepBeforePoll: asleep1, pollActivationState3000_ms: r3(pollMs),
      sleeping_stepMs: sleeping, sleeping_disableSync_stepMs: sleepingNoSync, sleeping_callbacksOnAll_stepMs: sleepingWithCallbacks, sleepingEventsPerStep,
      active_noContacts_stepMs: active, asleepAfterWake,
      active_customFastSync_stepMs: activeFastSync, fastSyncOnlyMs: stats(fastTimes), fastSyncMaxErr: maxErr,
      offsetsChangedAfterRemoveAdd: changed,
    };
    w.engine.dispose();
  }
  return out;
}
