// Verifies the helpers in physics-events-helpers.ts + extra semantics (wake-up event type, FINISHED per pair,
// mesh-shape floors, spawn-in-contact, tight-loop scene.render() timing).
import {
  Vector3,
  Quaternion,
  MeshBuilder,
  PhysicsBody,
  PhysicsMotionType,
  PhysicsShapeBox,
  PhysicsShapeMesh,
  PhysicsShapeSphere,
  PhysicsShapeContainer,
  HavokPlugin,
  PhysicsEventType,
  type PhysicsBody as PB,
} from "@babylonjs/core";
import { createWorld, makeGround, makeBox, makeSphere, loadHavok, r3, rn } from "./physics-events-common";
import { ImpactTracker, raycastPhysics, sphereSweep, nearestChildIndex, type ImpactEvent } from "./physics-events-helpers";

export async function probe() {
  const out: any = {};
  const w = await createWorld();
  const hk: any = w.hk;
  const ground = makeGround(w, 60);
  const tracker = new ImpactTracker(w.scene, w.plugin);
  const impacts: (ImpactEvent & { s: string })[] = [];
  const nm = (b: PB) => b.transformNode.name;
  tracker.onImpact.add((e) => impacts.push({ ...e, s: `${nm(e.bodyA)}|${nm(e.bodyB)}` }));
  // raw per-pair event types (for wake-up + FINISHED analysis)
  let stepIdx = -1;
  const rawTypes: { step: number; pair: string; type: string; imp: number }[] = [];
  w.plugin.onCollisionObservable.add((e) => rawTypes.push({ step: stepIdx, pair: `${nm(e.collider)}|${nm(e.collidedAgainst)}`, type: e.type, imp: e.impulse }));
  w.plugin.onCollisionEndedObservable.add((e) => rawTypes.push({ step: stepIdx, pair: `${nm(e.collider)}|${nm(e.collidedAgainst)}`, type: e.type, imp: 0 }));

  const S = new Vector3(0.5, 0.5, 0.5);
  const cb = <T extends { body: PB }>(b: T): T => (b.body.setCollisionCallbackEnabled(true), b);
  cb(makeBox(w, "drop1kg", S, new Vector3(-20, 1.25, 0), 1));
  cb(makeBox(w, "drop10kg", S, new Vector3(-17, 1.25, 0), 10));
  cb(makeBox(w, "rest1kg", S, new Vector3(-14, 0.25, 0), 1));
  cb(makeBox(w, "rest30kg_spawned", S, new Vector3(-11, 0.25, 0), 30));
  const slide = cb(makeBox(w, "slide", S, new Vector3(-8, 0.25, 0), 1));
  cb(makeBox(w, "stackBottom1kg", S, new Vector3(-5, 0.25, 0), 1));
  cb(makeBox(w, "stackTop10kg", S, new Vector3(-5, 1.75, 0), 10));
  cb(makeSphere(w, "bouncer", 0.25, new Vector3(-2, 1.25, 0), 1, { restitution: 0.8 }));
  // wake test: box rests & sleeps; at step 200 a light sphere is dropped next to it (touching it) to wake it
  const sleeper = cb(makeBox(w, "sleeper", S, new Vector3(2, 0.25, 0), 1));
  // lift test: box resting, at step 150 thrown upward -> FINISHED events
  const lifter = cb(makeBox(w, "lifter", S, new Vector3(5, 0.25, 0), 1));
  // mesh floor: static MESH shape ground patch at x=10, box dropped on it
  const patch = MeshBuilder.CreateGround("meshFloor", { width: 2, height: 2, subdivisions: 4 }, w.scene);
  patch.position.set(10, 0.5, 0);
  const patchBody = new PhysicsBody(patch, PhysicsMotionType.STATIC, false, w.scene);
  patchBody.shape = new PhysicsShapeMesh(patch, w.scene);
  cb(makeBox(w, "dropOnMesh", S, new Vector3(10.3, 0.5 + 0.25 + 1, 0.3), 1));
  // compound: tilted, left child lands first
  const cont = new PhysicsShapeContainer(w.scene);
  const childBoxes = [-0.6, 0, 0.6].map((x) => ({ centre: new Vector3(x, 0, 0), half: new Vector3(0.2, 0.2, 0.2) }));
  childBoxes.forEach((c) => cont.addChild(new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(0.4, 0.4, 0.4), w.scene), c.centre));
  const cm = MeshBuilder.CreateBox("compound", { width: 1.6, height: 0.4, depth: 0.4 }, w.scene);
  cm.position.set(15, 1.5, 0);
  cm.rotationQuaternion = Quaternion.RotationAxis(new Vector3(0, 0, 1), 0.35);
  const cbody = new PhysicsBody(cm, PhysicsMotionType.DYNAMIC, false, w.scene);
  cbody.shape = cont;
  cbody.setMassProperties({ mass: 3 });
  cbody.setCollisionCallbackEnabled(true);
  const childHits: { step: number; child: number; childStale: number; y: number }[] = [];
  const staleness: number[] = [];
  w.plugin.onCollisionObservable.add((e) => {
    if (e.collider === cbody && childHits.length < 12) {
      const staleM = cbody.transformNode.getWorldMatrix(); // NOT recomputed: may be one step old
      const staleT = staleM.getTranslation();
      const freshT = cbody.transformNode.computeWorldMatrix(true).getTranslation();
      staleness.push(rn(Vector3.Distance(staleT, freshT), 4)!);
      cbody.transformNode.computeWorldMatrix(true);
      const inv = staleM.clone().invert();
      const lp = Vector3.TransformCoordinates(e.point!, inv);
      let stale = -1, bd = Infinity;
      childBoxes.forEach((c, i) => { const d = Vector3.Distance(lp, c.centre); if (d < bd) { bd = d; stale = i; } });
      childHits.push({ step: stepIdx, child: nearestChildIndex(cbody, e.point!, childBoxes), childStale: stale, y: rn(e.point!.y, 3)! });
    }
  });
  // fragments spawned touching each other + muted
  const spawnFragments = () => {
    for (let k = 0; k < 4; k++) {
      const f = cb(makeBox(w, "frag" + k, new Vector3(0.2, 0.2, 0.2), new Vector3(20 + k * 0.2, 0.1, 0), 5));
      tracker.mute(f.body, 8);
    }
  };

  let sleeperState: string[] = [];
  for (let i = 0; i < 360; i++) {
    stepIdx = i;
    if (i === 30) slide.body.setLinearVelocity(new Vector3(3, 0, 0));
    if (i === 150) lifter.body.setLinearVelocity(new Vector3(0, 4, 0));
    if (i === 200) cb(makeSphere(w, "waker", 0.1, new Vector3(2.35, 0.1, 0), 0.2)); // spawned touching the sleeper's side
    if (i === 250) spawnFragments();
    w.step();
    if (i === 199 || i === 202) {
      const st = hk.HP_Body_GetActivationState((sleeper.body as any)._pluginData.hpBodyId)[1];
      sleeperState.push(`${i}:${st === hk.ActivationState.ACTIVE ? "ACTIVE" : "INACTIVE"}`);
    }
  }
  const byPair: Record<string, { step: number; excess: number; impulse: number; isNew: boolean; contacts: number; normal: number[] | null }[]> = {};
  for (const e of impacts) (byPair[e.s] ??= []).push({ step: e.step, excess: rn(e.excess, 3)!, impulse: rn(e.impulse, 3)!, isNew: e.isNew, contacts: e.contacts, normal: r3(e.normal, 2) });
  out.impactsByPair = byPair;
  const sumTypes = (pairSub: string, from = 0, to = 1e9) => {
    const m: Record<string, number> = {};
    for (const r of rawTypes) if (r.pair.includes(pairSub) && r.step >= from && r.step <= to) m[r.type] = (m[r.type] ?? 0) + 1;
    return m;
  };
  out.wake = { sleeperState, sleeperGroundTypes_195_215: sumTypes("sleeper|ground", 195, 215), sleeperAllTypes_195_215: rawTypes.filter((r) => r.pair.includes("sleeper") && r.step >= 195 && r.step <= 215).map((r) => `${r.step}:${r.pair}:${r.type.replace("COLLISION_", "")}:${rn(r.imp, 3)}`).slice(0, 16) };
  out.lifterFinished = rawTypes.filter((r) => r.pair.includes("lifter") && r.type === PhysicsEventType.COLLISION_FINISHED).map((r) => `${r.step}:${r.pair}`);
  const meshEv = rawTypes.filter((r) => r.pair.includes("dropOnMesh"));
  const perStep: Record<number, { n: number; sum: number; types: string[] }> = {};
  for (const r of meshEv) { perStep[r.step] ??= { n: 0, sum: 0, types: [] }; perStep[r.step].n++; perStep[r.step].sum += r.imp; if (!perStep[r.step].types.includes(r.type)) perStep[r.step].types.push(r.type.replace("COLLISION_", "")); }
  out.meshFloorPerStep = Object.entries(perStep).slice(0, 6).map(([s, v]) => ({ step: +s, n: v.n, sum: rn(v.sum, 3), types: v.types }));
  out.compoundChildFromPoint = childHits;
  out.worldMatrixStalenessInCallback_m = staleness.slice(0, 8);

  // dispose a body from inside onImpact while the same body has another pair pending in the same flush
  {
    const w3 = await createWorld({ engine: w.engine });
    makeGround(w3);
    const t3 = new ImpactTracker(w3.scene, w3.plugin);
    const bottom = cb(makeBox(w3, "bottom", S, new Vector3(0, 0.25, 0), 1));
    cb(makeBox(w3, "top", S, new Vector3(0, 1.75, 0), 10));
    const seen: string[] = [];
    let err: string | null = null;
    t3.onImpact.add((e) => {
      seen.push(`${e.step}:${nm(e.bodyA)}|${nm(e.bodyB)}`);
      if (!bottom.body.isDisposed && (e.bodyA === bottom.body || e.bodyB === bottom.body)) bottom.mesh.dispose();
    });
    try { w3.steps(60); } catch (x) { err = String(x); }
    out.disposeInsideOnImpact = { error: err, impactsSeen: seen.slice(0, 6) };
    t3.dispose();
  }

  // raycast + sweep helpers
  const hit = raycastPhysics(w.pe, new Vector3(-14, 3, 0), new Vector3(-14, -1, 0));
  const hitPointBefore = hit ? hit.point.clone() : null;
  raycastPhysics(w.pe, new Vector3(-20, 3, 0), new Vector3(-20, -1, 0));
  out.raycastHelper = hit ? { body: nm(hit.body), point: r3(hit.point), normal: r3(hit.normal), distance: rn(hit.distance), stillSameAfterNextRay: hit.point.equals(hitPointBefore!) } : null;
  const sweepShape = new PhysicsShapeSphere(Vector3.Zero(), 0.1, w.scene);
  const sw = sphereSweep(w.plugin, sweepShape, new Vector3(-16, 0.25, 0), new Vector3(-12, 0.25, 0));
  out.sweepHelper = sw ? { body: nm(sw.body), point: r3(sw.point), normal: r3(sw.normal), fraction: rn(sw.fraction), centre: r3(sw.centre) } : null;
  const swIgn = sphereSweep(w.plugin, sweepShape, new Vector3(-16, 0.25, 0), new Vector3(-12, 0.25, 0), sw?.body);
  out.sweepHelperIgnoreFirst = swIgn ? nm(swIgn.body) : null;
  tracker.dispose();

  // tight-loop scene.render() with HavokPlugin(true) (real-time delta): how much physics time passes?
  const hk2 = await loadHavok();
  const w2 = await createWorld({ engine: w.engine });
  w2.scene.disablePhysicsEngine();
  w2.scene.enablePhysics(new Vector3(0, -9.81, 0), new HavokPlugin(true, hk2));
  const fb = makeBox(w2, "freefall", S, new Vector3(0, 100, 0), 1);
  const t0 = performance.now();
  for (let i = 0; i < 60; i++) w2.scene.render();
  const wall = performance.now() - t0;
  const v = fb.body.getLinearVelocity().y;
  out.tightLoopRealtimePlugin = { renders: 60, wallMs: rn(wall, 1), simulatedSeconds: rn(-v / 9.81, 4), engineDeltaTime: w2.engine.getDeltaTime() };
  void ground;
  return out;
}
