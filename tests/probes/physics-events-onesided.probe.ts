// Q3: which pairs report events when only one body has callbacks; who is `collider`; motion-type combos;
// per-body observable normalisation; the per-body "ended" observable quirk; disposing bodies inside callbacks.
import { Vector3, Quaternion, PhysicsMotionType, type IPhysicsCollisionEvent, type IBasePhysicsCollisionEvent, type PhysicsBody } from "@babylonjs/core";
import { createWorld, makeBox, makeSphere, rn, type World } from "./physics-events-common";

const nm = (b: PhysicsBody) => b.transformNode.name;
const hpId = (b: PhysicsBody) => String((b as any)._pluginData.hpBodyId[0]);

export async function probe() {
  const out: any = {};
  // ---------- World 1: one-sided callback matrix ----------
  const w = await createWorld();
  const S = new Vector3(0.5, 0.5, 0.5);
  const evs: { step: number; type: string; a: string; b: string; imp: number }[] = [];
  let stepIdx = -1;
  w.plugin.onCollisionObservable.add((e: IPhysicsCollisionEvent) => evs.push({ step: stepIdx, type: e.type, a: nm(e.collider), b: nm(e.collidedAgainst), imp: e.impulse }));

  // case 1: static slab WITH callbacks created first, dynamic box WITHOUT callbacks falls on it
  const s1 = makeBox(w, "c1_static_cb", new Vector3(2, 0.2, 2), new Vector3(-10, 0, 0), 0);
  s1.body.setCollisionCallbackEnabled(true);
  makeBox(w, "c1_dyn_nocb", S, new Vector3(-10, 1, 0), 1);
  // case 2: dynamic box WITH callbacks created FIRST, static slab WITHOUT callbacks created after
  const d2 = makeBox(w, "c2_dyn_cb", S, new Vector3(-6, 1, 0), 1);
  d2.body.setCollisionCallbackEnabled(true);
  makeBox(w, "c2_static_nocb", new Vector3(2, 0.2, 2), new Vector3(-6, 0, 0), 0);
  // case 3: static slab created first (no cb), dynamic with cb created after
  makeBox(w, "c3_static_nocb", new Vector3(2, 0.2, 2), new Vector3(-2, 0, 0), 0);
  const d3 = makeBox(w, "c3_dyn_cb", S, new Vector3(-2, 1, 0), 1);
  d3.body.setCollisionCallbackEnabled(true);
  // case 4: neither has callbacks
  makeBox(w, "c4_static_nocb", new Vector3(2, 0.2, 2), new Vector3(2, 0, 0), 0);
  makeBox(w, "c4_dyn_nocb", S, new Vector3(2, 1, 0), 1);
  // case 5: two dynamics: lower created first WITH cb, upper (no cb) falls on it; slab below has no cb
  makeBox(w, "c5_static_nocb", new Vector3(2, 0.2, 2), new Vector3(6, 0, 0), 0);
  const c5low = makeBox(w, "c5_low_cb", S, new Vector3(6, 0.35, 0), 1);
  c5low.body.setCollisionCallbackEnabled(true);
  makeBox(w, "c5_up_nocb", S, new Vector3(6, 1.6, 0), 1);
  // case 6: two dynamics: upper created first WITH cb falls on lower (no cb, created after)
  makeBox(w, "c6_static_nocb", new Vector3(2, 0.2, 2), new Vector3(10, 0, 0), 0);
  const c6up = makeBox(w, "c6_up_cb", S, new Vector3(10, 1.6, 0), 1);
  c6up.body.setCollisionCallbackEnabled(true);
  makeBox(w, "c6_low_nocb", S, new Vector3(10, 0.35, 0), 1);
  // case 7: ANIMATED (kinematic) body with cb pushed into a STATIC body (no cb) -> any events?
  makeBox(w, "c7_static_nocb", new Vector3(0.5, 1, 0.5), new Vector3(14, 0.5, 0), 0);
  const c7 = makeBox(w, "c7_anim_cb", S, new Vector3(13, 0.5, 0), 0, { motion: PhysicsMotionType.ANIMATED });
  c7.body.setCollisionCallbackEnabled(true);
  // case 8: ANIMATED body with cb pushed into a DYNAMIC box (no cb)
  makeBox(w, "c8_static_nocb", new Vector3(3, 0.2, 2), new Vector3(18, -0.1, 0), 0);
  const c8 = makeBox(w, "c8_anim_cb", S, new Vector3(17, 0.26, 0), 0, { motion: PhysicsMotionType.ANIMATED });
  c8.body.setCollisionCallbackEnabled(true);
  makeBox(w, "c8_dyn_nocb", S, new Vector3(18, 0.26, 0), 1);

  const ids: Record<string, string> = {};
  for (const b of w.pe.getBodies()) ids[nm(b)] = hpId(b);
  for (let i = 0; i < 90; i++) {
    stepIdx = i;
    // move animated bodies toward their targets with setTargetTransform (velocity-driven kinematic motion)
    const t = Math.min(1, i / 60);
    c7.body.setTargetTransform(new Vector3(13 + 0.6 * t, 0.5, 0), Quaternion.Identity());
    c8.body.setTargetTransform(new Vector3(17 + 0.8 * t, 0.26, 0), Quaternion.Identity());
    w.step();
  }
  const pairs: Record<string, { n: number; types: string[]; first: number; maxImp: number }> = {};
  for (const e of evs) {
    const k = `${e.a} -> ${e.b}`;
    pairs[k] ??= { n: 0, types: [], first: e.step, maxImp: 0 };
    pairs[k].n++;
    if (!pairs[k].types.includes(e.type)) pairs[k].types.push(e.type);
    pairs[k].maxImp = Math.max(pairs[k].maxImp, rn(e.imp, 3)!);
  }
  out.matrix = pairs;
  out.bodyIds = ids;

  // ---------- World 2: per-body observables only, no plugin-level observers; ended-observable quirk ----------
  const w2 = await createWorld({ engine: w.engine });
  makeBox(w2, "ground2", new Vector3(10, 1, 10), new Vector3(0, -0.5, 0), 0);
  const ball = makeSphere(w2, "ball", 0.25, new Vector3(0, 1.25, 0), 1, { restitution: 0.8 });
  ball.body.setCollisionCallbackEnabled(true);
  const endedObsTypes: Record<string, number> = {};
  ball.body.getCollisionEndedObservable().add((e: IBasePhysicsCollisionEvent) => (endedObsTypes[e.type] = (endedObsTypes[e.type] ?? 0) + 1));
  w2.steps(90);
  out.endedObservableOnlyRegistered = { ...endedObsTypes };
  // now also register a collision observable on some OTHER body -> branch changes
  const other = makeSphere(w2, "other", 0.25, new Vector3(5, 0.25, 5), 1);
  other.body.getCollisionObservable();
  for (const k of Object.keys(endedObsTypes)) delete endedObsTypes[k];
  ball.body.setLinearVelocity(new Vector3(0, 6, 0));
  w2.steps(120);
  out.endedObservableAfterAnyCollisionObservableExists = { ...endedObsTypes };

  // ---------- World 3: dispose bodies / create bodies from inside the collision callback ----------
  const w3 = await createWorld({ engine: w.engine });
  makeBox(w3, "ground3", new Vector3(20, 1, 20), new Vector3(0, -0.5, 0), 0);
  const victims: PhysicsBody[] = [];
  for (let i = 0; i < 20; i++) {
    const v = makeBox(w3, "victim" + i, S, new Vector3((i % 5) - 2, 0.75 + Math.floor(i / 5) * 0.01, Math.floor(i / 5) - 2), 1);
    v.body.setCollisionCallbackEnabled(true);
    victims.push(v.body);
  }
  let disposedInCb = 0, createdInCb = 0, eventsAfterDispose = 0, errors: string[] = [];
  const disposed = new Set<PhysicsBody>();
  w3.plugin.onCollisionObservable.add((e) => {
    try {
      if (disposed.has(e.collider) || disposed.has(e.collidedAgainst)) eventsAfterDispose++;
      const v = victims.includes(e.collider) ? e.collider : victims.includes(e.collidedAgainst) ? e.collidedAgainst : null;
      if (v && !disposed.has(v) && e.impulse > 0.05) {
        disposed.add(v);
        const pos = v.transformNode.position.clone();
        v.transformNode.dispose(); // disposes the body too
        disposedInCb++;
        // spawn 2 fragments immediately (inside the callback)
        for (let k = 0; k < 2; k++) {
          const f = makeBox(w3, "frag", new Vector3(0.2, 0.2, 0.2), pos.add(new Vector3(k * 0.25 - 0.12, 0.3, 0)), 0.3);
          f.body.setCollisionCallbackEnabled(true);
          createdInCb++;
        }
      }
    } catch (err) {
      errors.push(String(err));
    }
  });
  let stepError: string | null = null;
  try { w3.steps(120); } catch (err) { stepError = String(err); }
  out.disposeInsideCallback = { disposedInCb, createdInCb, eventsAfterDispose, errors: errors.slice(0, 3), stepError, bodiesNow: w3.pe.getBodies().length, numBodiesHavok: w3.plugin.numBodies };
  return out;
}
