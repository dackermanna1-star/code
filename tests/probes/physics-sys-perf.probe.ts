// Physics system performance: 1000-hull pile (substeps × sleep assist), 3000 sleeping bodies, 300 awake bodies,
// raw vs Babylon event path, query costs, create/dispose churn leak check. CPU timings are noisy (shared machine).
import { Vector3, Quaternion, type PhysicsBody } from "@babylonjs/core";
import { Layer } from "../../src/core/context.ts";
import { makeWorld, body, staticBox, floor, steps, counts, randomPoints, r, type World } from "./physics-sys-util.ts";

const ZERO = { x: 0, y: 0, z: 0 };
const IDQ = { x: 0, y: 0, z: 0, w: 1 };

function pen(w: World, half = 3) {
  floor(w, 0, 60);
  staticBox(w, new Vector3(half + 0.25, 3, 0), new Vector3(0.5, 6, half * 2 + 1));
  staticBox(w, new Vector3(-half - 0.25, 3, 0), new Vector3(0.5, 6, half * 2 + 1));
  staticBox(w, new Vector3(0, 3, half + 0.25), new Vector3(half * 2 + 1, 6, 0.5));
  staticBox(w, new Vector3(0, 3, -half - 0.25), new Vector3(half * 2 + 1, 6, 0.5));
}

function timeSteps(w: World, n: number): { avg: number; p95: number; max: number } {
  const t: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = performance.now();
    w.physics.step(1 / 60);
    t.push(performance.now() - a);
  }
  const s = [...t].sort((x, y) => x - y);
  return { avg: r(t.reduce((x, y) => x + y, 0) / n, 3), p95: r(s[Math.floor(n * 0.95)], 3), max: r(s[n - 1], 3) };
}

async function pile(substeps: number, assist: boolean) {
  const w = await makeWorld({ substeps, sleepAssist: assist });
  pen(w);
  const bodies: PhysicsBody[] = [];
  let impacts = 0;
  w.physics.onImpact(() => impacts++);
  for (let i = 0; i < 1000; i++) {
    const s = w.physics.hullShape(randomPoints(i + 1, 20, 0.175), { density: 600, friction: 0.6, layer: Layer.DEBRIS });
    bodies.push(body(w, "h", new Vector3(-2.7 + (i % 10) * 0.6, 0.4 + Math.floor(i / 100) * 0.6, -2.7 + (Math.floor(i / 10) % 10) * 0.6), "dynamic", s, { rot: Quaternion.RotationYawPitchRoll(i, i * 0.37, i * 0.11) }));
  }
  const phases: Record<string, unknown> = {};
  phases.fall_0_40 = timeSteps(w, 40);
  phases.impact_40_200 = timeSteps(w, 160);
  phases.settle_200_600 = timeSteps(w, 400);
  phases.late_600_900 = timeSteps(w, 300);
  const st = w.physics.debugStats();
  const awakeExact = bodies.filter((b) => w.physics.isAwake(b)).length;
  // the pile must stay interactive: drop a 50 kg block on it
  const block = body(w, "block", new Vector3(0, 9, 0), "dynamic", w.physics.boxShape(ZERO, IDQ, { x: 0.6, y: 0.6, z: 0.6 }, { density: 230 }));
  steps(w, 90);
  const movedAfterBlock = bodies.filter((b) => w.physics.isAwake(b)).length;
  const blockY = block.transformNode.position.y;
  const res = { phases, awakeAtEnd: awakeExact, forcedSleeps: st.forcedSleeps, eventsLastStep: st.eventsLastStep, impactsTotal: impacts, awakeAfterBlockDrop: movedAfterBlock, blockRestY: r(blockY, 2) };
  w.dispose();
  return res;
}

export async function probe() {
  const out: Record<string, unknown> = {};

  // ---- P1: 1000-hull pile
  out.P1_pile_substeps2_assistOn = await pile(2, true);
  out.P1_pile_substeps1_assistOn = await pile(1, true);
  out.P1_pile_substeps1_assistOff = await pile(1, false);

  // ---- P2: 3000 sleeping bodies (startAsleep, resting on the floor)
  {
    const w = await makeWorld();
    floor(w, 0, 200);
    const shape = w.physics.boxShape(ZERO, IDQ, { x: 0.25, y: 0.25, z: 0.25 }, { density: 400 });
    const tc = performance.now();
    const bodies: PhysicsBody[] = [];
    for (let i = 0; i < 3000; i++) bodies.push(body(w, "s", new Vector3(-55 + (i % 55) * 2, 0.125, -55 + Math.floor(i / 55) * 2), "dynamic", shape, { asleep: true }));
    const createMs = performance.now() - tc;
    steps(w, 30);
    const t = timeSteps(w, 120);
    const st = w.physics.debugStats();
    const asleep = bodies.filter((b) => !w.physics.isAwake(b)).length;
    // wake 50 and measure again
    for (let i = 0; i < 50; i++) bodies[i * 60].setLinearVelocity(new Vector3(0, 2, 0));
    const tWake = timeSteps(w, 30);
    out.P2_3000_sleeping = { msPerStep: t, asleep, movedLastStep: st.movedLastStep, createMsTotal: r(createMs, 1), with50Woken: tWake, stats: w.physics.stats() };
    const tDispose = performance.now();
    for (const b of bodies) {
      w.physics.disposeBody(b);
      b.transformNode.dispose();
    }
    (out.P2_3000_sleeping as Record<string, unknown>).disposeMsTotal = r(performance.now() - tDispose, 1);
    w.dispose();
  }

  // ---- P3: 300 awake resting bodies (kept awake) at 1 vs 2 substeps, raw vs Babylon event path
  for (const [substeps, external] of [
    [1, false],
    [2, false],
    [2, true],
  ] as const) {
    const w = await makeWorld({ substeps });
    floor(w, 0, 100);
    for (let i = 0; i < 300; i++) {
      const b = body(w, "a", new Vector3(-17 + (i % 18) * 2, 0.15, -17 + Math.floor(i / 18) * 2), "dynamic", w.physics.boxShape(ZERO, IDQ, { x: 0.3, y: 0.3, z: 0.3 }, { density: 400 }));
      w.physics.setKeepAwake(b, true);
    }
    if (external) w.physics.plugin.onCollisionObservable.add(() => {});
    steps(w, 30);
    const t = timeSteps(w, 120);
    const st = w.physics.debugStats();
    out[`P3_300awake_substeps${substeps}${external ? "_babylonEvents" : "_rawEvents"}`] = { msPerStep: t, eventsPerStep: st.eventsLastStep, havokMs: r(st.havokMs, 3), eventsMs: r(st.eventsMs, 3), syncMs: r(st.syncMs, 3) };
    w.dispose();
  }

  // ---- P4: query costs among 500 bodies
  {
    const w = await makeWorld();
    floor(w, 0, 60);
    for (let i = 0; i < 500; i++) body(w, "q", new Vector3(-10 + (i % 25) * 0.8, 0.2 + Math.floor(i / 25) * 0.5, (i % 7) * 0.3), "static", w.physics.boxShape(ZERO, IDQ, { x: 0.3, y: 0.3, z: 0.3 }, { layer: Layer.STATIC }));
    const t0 = performance.now();
    let hits = 0;
    for (let i = 0; i < 2000; i++) if (w.physics.raycast(new Vector3(-12 + (i % 100) * 0.24, 8, (i % 13) * 0.2), new Vector3(-12 + (i % 100) * 0.24, -1, (i % 13) * 0.2))) hits++;
    const rayUs = ((performance.now() - t0) / 2000) * 1000;
    const t1 = performance.now();
    for (let i = 0; i < 2000; i++) w.physics.sphereSweep(new Vector3(-12, 1 + (i % 10) * 0.3, (i % 13) * 0.2), new Vector3(12, 1 + (i % 10) * 0.3, (i % 13) * 0.2), 0.05);
    const sweepUs = ((performance.now() - t1) / 2000) * 1000;
    const t2 = performance.now();
    let allHits = 0;
    for (let i = 0; i < 500; i++) allHits += w.physics.raycastAll(new Vector3(-12, 0.2 + (i % 10) * 0.5, 0), new Vector3(12, 0.2 + (i % 10) * 0.5, 0)).length;
    const allUs = ((performance.now() - t2) / 500) * 1000;
    out.P4_queries = { raycastUs: r(rayUs, 2), sphereSweepUs: r(sweepUs, 2), raycastAllUs: r(allUs, 2), rayHits: hits, avgAllHits: r(allHits / 500, 2) };
    w.dispose();
  }

  // ---- P5: churn leak check: 5 × (500 bodies of 3-hull containers + 60 joints, step, dispose everything)
  {
    const w = await makeWorld();
    floor(w);
    steps(w, 2);
    const base = counts(w);
    const heap0 = w.physics.hk.HEAPU8.length;
    const per: unknown[] = [];
    for (let cycle = 0; cycle < 5; cycle++) {
      const made: Array<{ b: PhysicsBody; kids: ReturnType<World["physics"]["boxShape"]>[] }> = [];
      for (let i = 0; i < 500; i++) {
        const kids = [0, 1, 2].map((k) => w.physics.hullShape(randomPoints(i * 3 + k + 1, 8, 0.05).map((v, j) => v + (j % 3 === 0 ? k * 0.1 : 0)), { density: 700 }));
        const c = w.physics.containerShape(kids);
        const b = body(w, "c", new Vector3((i % 20) * 0.5 - 5, 0.3 + Math.floor(i / 20) * 0.4, cycle * 0.1), "dynamic", c);
        made.push({ b, kids });
      }
      for (let i = 0; i < 60; i++) {
        if (i % 2) w.physics.hinge(made[i].b, made[i + 100].b, { pivotA: Vector3.Zero(), pivotB: new Vector3(0, 0.4, 0), axisA: new Vector3(1, 0, 0), axisB: new Vector3(1, 0, 0) });
        else w.physics.ball(w.physics.worldBody, made[i].b, made[i].b.transformNode.position.clone(), Vector3.Zero());
      }
      steps(w, 20);
      const peak = counts(w);
      for (let i = 0; i < made.length; i++) {
        const { b, kids } = made[i];
        if (i % 3 === 0) b.transformNode.dispose(); // node path
        else {
          w.physics.disposeBody(b);
          b.transformNode.dispose();
        }
        for (const k of kids) w.physics.disposeShape(k);
      }
      steps(w, 2);
      per.push({ cycle, peakBodies: peak.hkBodies, peakConstraints: peak.hkConstraints, after: counts(w) });
    }
    const end = counts(w);
    const same = JSON.stringify({ ...end }) === JSON.stringify({ ...base });
    out.P5_churnLeakCheck = { pass: same, base, end, heapGrowthBytes: w.physics.hk.HEAPU8.length - heap0, cycles: per.slice(0, 2) };
    w.dispose();
  }

  // ---- P6: hull creation micro-benchmark: raw Havok call vs hullShape vs boxShape
  {
    const w = await makeWorld();
    const P = w.physics;
    const hk = P.hk;
    const pts = randomPoints(7, 8, 0.1);
    const ptr = hk._malloc(pts.length * 4);
    new Float32Array(hk.HEAPU8.buffer, ptr, pts.length).set(pts);
    const ids: unknown[] = [];
    let t = performance.now();
    for (let i = 0; i < 200; i++) ids.push(hk.HP_Shape_CreateConvexHull(ptr, 8)[1]);
    const rawMs = (performance.now() - t) / 200;
    for (const id of ids) hk.HP_Shape_Release(id as never);
    hk._free(ptr);
    const shapes: unknown[] = [];
    t = performance.now();
    for (let i = 0; i < 200; i++) shapes.push(P.hullShape(pts));
    const hullMs = (performance.now() - t) / 200;
    t = performance.now();
    for (let i = 0; i < 200; i++) shapes.push(P.boxShape(ZERO, IDQ, { x: 0.3, y: 0.2, z: 0.4 }));
    const boxMs = (performance.now() - t) / 200;
    t = performance.now();
    for (let i = 0; i < 200; i++) shapes.push(P.boxShape(ZERO, IDQ, { x: 0.03, y: 0.02, z: 0.04 }));
    const smallBoxMs = (performance.now() - t) / 200;
    out.P6_shapeCreationMs = { rawHavokHull8: r(rawMs, 4), hullShape8: r(hullMs, 4), boxShape: r(boxMs, 4), smallBoxShapeAsHull: r(smallBoxMs, 4) };
    w.dispose();
  }
  return out;
}
