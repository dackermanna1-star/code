// Q1/Q2: collision event fields, masks, object reuse, conventions, impulse semantics on drops.
import { Vector3, type IPhysicsCollisionEvent, type IBasePhysicsCollisionEvent, type PhysicsBody } from "@babylonjs/core";
import { createWorld, makeGround, makeBox, makeSphere, r3, rn } from "./physics-events-common";

export async function probe() {
  const w = await createWorld();
  const out: any = {};
  const hk: any = w.hk;
  out.hkEventTypeValues = Object.fromEntries(
    Object.keys(hk.EventType).filter((k) => k !== "values").map((k) => [k, hk.EventType[k]?.value]),
  );
  out.timeStep = w.pe.getTimeStep();

  const ground = makeGround(w);
  out.groundMaskDefault = ground.body.getEventMask();

  // Drop tests run side by side (2 m apart, no interaction). gap = distance from box bottom to ground top.
  const g = 9.81;
  const tests: { name: string; mass: number; gap: number; kind: "box" | "sphere"; body: PhysicsBody; size: number }[] = [];
  const addBox = (name: string, mass: number, gap: number, x: number) => {
    const s = 0.5;
    const b = makeBox(w, name, new Vector3(s, s, s), new Vector3(x, s / 2 + gap, 0), mass);
    b.body.setCollisionCallbackEnabled(true);
    tests.push({ name, mass, gap, kind: "box", body: b.body, size: s });
  };
  const addSphere = (name: string, mass: number, gap: number, x: number) => {
    const r = 0.25;
    const b = makeSphere(w, name, r, new Vector3(x, r + gap, 0), mass);
    b.body.setCollisionCallbackEnabled(true);
    tests.push({ name, mass, gap, kind: "sphere", body: b.body, size: r });
  };
  addBox("box1kg_h1", 1, 1, -8);
  addBox("box10kg_h1", 10, 1, -6);
  addBox("box1kg_h2", 1, 2, -4);
  addBox("box1kg_h0.25", 1, 0.25, -2);
  addSphere("sph1kg_h1", 1, 1, 0);
  addSphere("sph10kg_h1", 10, 1, 2);
  // box resting from the start (touching ground) to observe resting noise
  addBox("box1kg_rest", 1, 0.0, 4);
  out.maskAfterEnable = tests[0].body.getEventMask();

  let stepIdx = -1;
  const events: any[] = [];
  const keepRefs: { step: number; point: Vector3 | null; normal: Vector3 | null; snapshot: number[] | null }[] = [];
  const nm = (b: PhysicsBody) => b.transformNode.name;
  w.plugin.onCollisionObservable.add((e: IPhysicsCollisionEvent) => {
    events.push({
      step: stepIdx, src: "plugin", type: e.type, collider: nm(e.collider), against: nm(e.collidedAgainst),
      ci: e.colliderIndex, ai: e.collidedAgainstIndex, impulse: rn(e.impulse, 5), point: r3(e.point), normal: r3(e.normal), distance: rn(e.distance, 5),
      keys: Object.keys(e).sort().join(","),
    });
    keepRefs.push({ step: stepIdx, point: e.point, normal: e.normal, snapshot: r3(e.point) });
  });
  w.plugin.onCollisionEndedObservable.add((e: IBasePhysicsCollisionEvent) => {
    events.push({ step: stepIdx, src: "pluginEnded", type: e.type, collider: nm(e.collider), against: nm(e.collidedAgainst), keys: Object.keys(e).sort().join(",") });
  });
  // per-body observables (box1kg_h1 has callbacks, ground has none)
  tests[0].body.getCollisionObservable().add((e) => {
    events.push({ step: stepIdx, src: "box1kg_h1.body", type: e.type, collider: nm(e.collider), against: nm(e.collidedAgainst), impulse: rn(e.impulse, 5), point: r3(e.point), normal: r3(e.normal), distance: rn(e.distance, 5) });
  });
  const groundObsEvents: any[] = [];
  ground.body.getCollisionObservable().add((e) => {
    if (nm(e.collidedAgainst) === "box1kg_h1")
      groundObsEvents.push({ step: stepIdx, type: e.type, collider: nm(e.collider), against: nm(e.collidedAgainst), impulse: rn(e.impulse, 5), point: r3(e.point), normal: r3(e.normal), distance: rn(e.distance, 5) });
  });
  const afterPhysicsOrder: string[] = [];
  w.scene.onBeforePhysicsObservable.add(() => afterPhysicsOrder.length < 6 && afterPhysicsOrder.push("before:" + stepIdx));
  w.scene.onAfterPhysicsObservable.add(() => afterPhysicsOrder.length < 6 && afterPhysicsOrder.push("after:" + stepIdx));
  w.plugin.onCollisionObservable.add(() => afterPhysicsOrder.length < 6 && afterPhysicsOrder.push("collision:" + stepIdx));

  const traces: Record<string, any[]> = {};
  for (const t of tests) traces[t.name] = [];
  const N = 150;
  for (let i = 0; i < N; i++) {
    stepIdx = i;
    const before = tests.map((t) => t.body.getLinearVelocity().y);
    w.step();
    tests.forEach((t, k) => {
      const v = t.body.getLinearVelocity();
      traces[t.name].push({ step: i, vyBefore: rn(before[k], 4), vyAfter: rn(v.y, 4), y: rn(t.body.transformNode.position.y, 4), vx: rn(v.x, 3), vz: rn(v.z, 3) });
    });
  }

  // Object reuse check: within one step, do all events share the same Vector3 instance?
  const byStep = new Map<number, typeof keepRefs>();
  for (const r of keepRefs) { if (!byStep.has(r.step)) byStep.set(r.step, []); byStep.get(r.step)!.push(r); }
  let sameInstanceWithinStep = 0, multiEventSteps = 0, diffInstanceAcrossSteps = 0, valueChangedAfterward = 0;
  let prevStepFirst: Vector3 | null = null;
  for (const [, arr] of byStep) {
    if (arr.length > 1) { multiEventSteps++; if (arr.every((a) => a.point === arr[0].point)) sameInstanceWithinStep++; }
    if (prevStepFirst && arr[0].point !== prevStepFirst) diffInstanceAcrossSteps++;
    prevStepFirst = arr[0].point;
  }
  for (const r of keepRefs) { const now = r3(r.point); if (JSON.stringify(now) !== JSON.stringify(r.snapshot)) valueChangedAfterward++; }
  out.reuse = { multiEventSteps, sameInstanceWithinStep, stepsWithEvents: byStep.size, diffInstanceAcrossSteps, valueChangedAfterward, totalRefs: keepRefs.length };

  // per-test summaries
  const summary: any = {};
  for (const t of tests) {
    const evs = events.filter((e) => e.src === "plugin" && (e.collider === t.name || e.against === t.name));
    const ended = events.filter((e) => e.src === "pluginEnded" && (e.collider === t.name || e.against === t.name));
    const tr = traces[t.name];
    // impact step = first step with a big velocity change
    let impact = -1;
    for (const s of tr) if (s.vyAfter - s.vyBefore > 0.5) { impact = s.step; break; }
    const vImpactTheory = Math.sqrt(2 * g * t.gap);
    const preV = impact >= 0 ? tr[impact].vyBefore : null;
    const postV = impact >= 0 ? tr[impact].vyAfter : null;
    const contactImpulseFromDv = impact >= 0 ? t.mass * (tr[impact].vyAfter - tr[impact].vyBefore) + t.mass * g * (1 / 60) : null;
    const evWindow = evs.filter((e) => impact < 0 || (e.step >= impact - 3 && e.step <= impact + 4));
    const countsByType: Record<string, number> = {};
    for (const e of evs) countsByType[e.type] = (countsByType[e.type] ?? 0) + 1;
    const lastSteps = evs.filter((e) => e.step >= N - 30);
    summary[t.name] = {
      mass: t.mass, gap: t.gap, kind: t.kind, vImpactTheory: rn(vImpactTheory, 3), mvTheory: rn(t.mass * vImpactTheory, 3),
      impactStep: impact, vyBeforeImpact: preV, vyAfterImpact: postV, contactImpulseFromDv: rn(contactImpulseFromDv ?? undefined, 4),
      countsByType, endedCount: ended.length, firstEventStep: evs[0]?.step, eventsAroundImpact: evWindow,
      restingTail: { n: lastSteps.length, impulses: lastSteps.slice(-5).map((e) => e.impulse), expectedMgDt: rn(t.mass * g / 60, 4) },
      finalY: tr[tr.length - 1].y,
    };
  }
  out.summary = summary;
  out.firstEventsKeys = events.find((e) => e.src === "plugin")?.keys;
  out.endedKeys = events.find((e) => e.src === "pluginEnded")?.keys;
  out.box1kgBodyObs = events.filter((e) => e.src === "box1kg_h1.body").slice(0, 6);
  out.groundBodyObsAgainstBox1 = groundObsEvents.slice(0, 6);
  out.order = afterPhysicsOrder;
  out.traceBox1kg = traces["box1kg_h1"].slice(20, 36);
  return out;
}
