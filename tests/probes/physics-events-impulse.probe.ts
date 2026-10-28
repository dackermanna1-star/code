// Q2: impulse semantics for dynamic-vs-dynamic, sliding, bouncing (FINISHED), event masks, sleeping.
import { Vector3, type IPhysicsCollisionEvent, type IBasePhysicsCollisionEvent, type PhysicsBody } from "@babylonjs/core";
import { createWorld, makeGround, makeBox, makeSphere, r3, rn } from "./physics-events-common";

type Ev = { step: number; type: string; a: string; b: string; imp?: number; n?: number[] | null; p?: number[] | null; d?: number };

export async function probe() {
  const w = await createWorld();
  const hk: any = w.hk;
  const ground = makeGround(w);
  let stepIdx = -1;
  const evs: Ev[] = [];
  const ended: Ev[] = [];
  const nm = (b: PhysicsBody) => b.transformNode.name;
  w.plugin.onCollisionObservable.add((e: IPhysicsCollisionEvent) =>
    evs.push({ step: stepIdx, type: e.type.replace("COLLISION_", ""), a: nm(e.collider), b: nm(e.collidedAgainst), imp: e.impulse, n: r3(e.normal, 3), p: r3(e.point, 3), d: rn(e.distance, 4) }),
  );
  w.plugin.onCollisionEndedObservable.add((e: IBasePhysicsCollisionEvent) =>
    ended.push({ step: stepIdx, type: e.type.replace("COLLISION_", ""), a: nm(e.collider), b: nm(e.collidedAgainst) }),
  );
  const S = 0.5;
  // A: 1 kg box dropped 1 m onto a resting 1 kg box (both callbacks)
  const aBottom = makeBox(w, "A_bottom1", new Vector3(S, S, S), new Vector3(-6, S / 2, 0), 1);
  const aTop = makeBox(w, "A_top1", new Vector3(S, S, S), new Vector3(-6, S * 1.5 + 1, 0), 1);
  aBottom.body.setCollisionCallbackEnabled(true);
  aTop.body.setCollisionCallbackEnabled(true);
  // B: 10 kg box dropped 1 m onto resting 1 kg box; ONLY the top has callbacks
  const bBottom = makeBox(w, "B_bottom1", new Vector3(S, S, S), new Vector3(-3, S / 2, 0), 1);
  const bTop = makeBox(w, "B_top10", new Vector3(S, S, S), new Vector3(-3, S * 1.5 + 1, 0), 10);
  bTop.body.setCollisionCallbackEnabled(true);
  // C: sliding box, vx = 3 m/s, friction 0.5 (ground friction 0.5, MIN combine)
  const slide = makeBox(w, "C_slide", new Vector3(S, S, S), new Vector3(0, S / 2, -6), 1);
  slide.body.setCollisionCallbackEnabled(true);
  // D: bouncy sphere (restitution 0.8, MAX combine) -> FINISHED events
  const bounce = makeSphere(w, "D_bounce", 0.25, new Vector3(3, 0.25 + 1, 0), 1, { restitution: 0.8 });
  bounce.body.setCollisionCallbackEnabled(true);
  // E: masks: STARTED only (1), FINISHED only (4), CONTINUED only (2) on bouncing spheres
  const m1 = makeSphere(w, "E_mask1", 0.25, new Vector3(6, 1.25, 0), 1, { restitution: 0.8 });
  m1.body.setEventMask(1);
  const m4 = makeSphere(w, "E_mask4", 0.25, new Vector3(8, 1.25, 0), 1, { restitution: 0.8 });
  m4.body.setEventMask(4);
  const m2 = makeSphere(w, "E_mask2", 0.25, new Vector3(10, 1.25, 0), 1, { restitution: 0.8 });
  m2.body.setEventMask(2);
  // F: setCollisionEndedCallbackEnabled only (no setCollisionCallbackEnabled)
  const fEnd = makeSphere(w, "F_endedOnly", 0.25, new Vector3(12, 1.25, 0), 1, { restitution: 0.8 });
  fEnd.body.setCollisionEndedCallbackEnabled(true);
  const masks = { E_mask1: m1.body.getEventMask(), E_mask4: m4.body.getEventMask(), E_mask2: m2.body.getEventMask(), F_endedOnly: fEnd.body.getEventMask() };

  const actState = (b: PhysicsBody) => {
    const r = hk.HP_Body_GetActivationState((b as any)._pluginData.hpBodyId);
    const st = r[1];
    return st === hk.ActivationState.ACTIVE ? "ACTIVE" : st === hk.ActivationState.INACTIVE ? "INACTIVE" : String(st?.value ?? st);
  };
  const sleepTrace: any[] = [];
  const slideTrace: any[] = [];
  const N = 240;
  for (let i = 0; i < N; i++) {
    stepIdx = i;
    if (i === 30) slide.body.setLinearVelocity(new Vector3(3, 0, 0));
    const vxBefore = slide.body.getLinearVelocity().x;
    w.step();
    if (i >= 28 && i < 40) slideTrace.push({ step: i, vxBefore: rn(vxBefore), vxAfter: rn(slide.body.getLinearVelocity().x), frictionImpulseFromDv: rn(-(slide.body.getLinearVelocity().x - vxBefore) * 1) });
    if (i % 10 === 9) sleepTrace.push({ step: i, A_top1: actState(aTop.body), A_bottom1: actState(aBottom.body), C_slide: actState(slide.body), D_bounce: actState(bounce.body) });
  }
  // aggregate per (step, pair, type)
  const agg = (filter: (e: Ev) => boolean) => {
    const m = new Map<string, { step: number; type: string; pair: string; n: number; sum: number; normals: string[] }>();
    for (const e of evs.filter(filter)) {
      const k = `${e.step}|${e.a}->${e.b}|${e.type}`;
      if (!m.has(k)) m.set(k, { step: e.step, type: e.type, pair: `${e.a}->${e.b}`, n: 0, sum: 0, normals: [] });
      const o = m.get(k)!;
      o.n++;
      o.sum += e.imp ?? 0;
      const ns = JSON.stringify(e.n);
      if (!o.normals.includes(ns)) o.normals.push(ns);
    }
    return [...m.values()].map((o) => ({ ...o, sum: rn(o.sum, 4) }));
  };
  const involving = (name: string) => (e: Ev) => e.a === name || e.b === name;
  const out: any = { masks };
  out.A = agg((e) => (e.a.startsWith("A_") || e.b.startsWith("A_")) && e.step >= 24 && e.step <= 32);
  out.B = agg((e) => (e.a.startsWith("B_") || e.b.startsWith("B_")) && e.step >= 24 && e.step <= 32);
  out.C = agg((e) => involving("C_slide")(e) && e.step >= 28 && e.step <= 40);
  out.slideTrace = slideTrace;
  out.D = agg((e) => involving("D_bounce")(e) && e.step <= 80);
  out.D_ended = ended.filter((e) => e.a === "D_bounce" || e.b === "D_bounce").slice(0, 10);
  out.E_counts = Object.fromEntries(["E_mask1", "E_mask4", "E_mask2", "F_endedOnly"].map((nmK) => {
    const c: Record<string, number> = {};
    for (const e of evs.filter(involving(nmK))) c[e.type] = (c[e.type] ?? 0) + 1;
    for (const e of ended.filter(involving(nmK))) c["ended:" + e.type] = (c["ended:" + e.type] ?? 0) + 1;
    return [nmK, c];
  }));
  out.sleepTrace = sleepTrace;
  const lastEventStep: Record<string, number> = {};
  for (const e of evs) { lastEventStep[e.a] = e.step; lastEventStep[e.b] = Math.max(lastEventStep[e.b] ?? -1, e.step); }
  out.lastEventStep = lastEventStep;
  out.totalEvents = evs.length;
  return out;
}
