// Break-step performance probe: a real stud partition (drywall + studs + insulation, ~200 parts)
// on the concrete floor slab, struck repeatedly with a 6 kg sledge at 8 m/s. Reports per strike
// the strike call time, the following steps (max / mean over 30) and a stage breakdown (shape
// creations, island creations, mesh builds), plus the pending-work queues, so the per-step
// budgets of the destruction runtime can be checked. CPU timings on the shared probe box are
// noisy (often several × too high); operation counts per step are the reliable signal.
import { Vector3 } from "@babylonjs/core";
import { makeSim, round } from "./destruction-util.ts";
import { buildStructure } from "../../src/world/structure.ts";

export async function probe() {
  const sim = await makeSim();
  const { d, physics } = sim;
  const pieces = buildStructure();
  const slab = pieces.find((p) => p.def.type.toLowerCase().includes("slab") && /floor/i.test(p.def.name)) ?? pieces[0];
  const parts = pieces.filter((p) => p.def.type.toLowerCase().includes("partition")).sort((a, b) => b.def.parts.length - a.def.parts.length);
  const wallPiece = parts.find((p) => p.def.parts.length <= 260) ?? parts[parts.length - 1];
  d.spawn(slab.def, slab.xf);
  const wallId = d.spawn(wallPiece.def, wallPiece.xf);
  const wall = d.assembly(wallId)!;

  const acc: Record<string, { n: number; ms: number; max: number }> = {};
  const wrap = (label: string, obj: Record<string, unknown>, name: string) => {
    const fn = obj[name] as (...a: unknown[]) => unknown;
    if (typeof fn !== "function") return;
    obj[name] = function (this: unknown, ...a: unknown[]) {
      const t0 = performance.now();
      try {
        return fn.apply(this, a);
      } finally {
        const ms = performance.now() - t0;
        const e = (acc[label] ??= { n: 0, ms: 0, max: 0 });
        e.n++;
        e.ms += ms;
        e.max = Math.max(e.max, ms);
      }
    };
  };
  const W = d.world as unknown as Record<string, unknown>;
  for (const m of ["createIsland", "syncContainer", "ensureShape", "rebuildMeshes", "splitIsland"]) wrap(`world.${m}`, W, m);
  wrap("fracture.process", d.fracture as unknown as Record<string, unknown>, "process");
  wrap("impacts.hitPart", d.impacts as unknown as Record<string, unknown>, "hitPart");
  wrap("impacts.process", d.impacts as unknown as Record<string, unknown>, "process");
  const P = physics as unknown as Record<string, unknown>;
  for (const m of ["step", "hullShape", "boxShape", "containerShape", "setShape", "createBody"]) wrap(`physics.${m}`, P, m);
  wrap("render.buildIsland", sim.render as unknown as Record<string, unknown>, "buildIsland");
  wrap("d.afterPhysics", d as unknown as Record<string, unknown>, "afterPhysics");
  const snap = () => {
    const o = Object.fromEntries(
      Object.entries(acc)
        .sort((a, b) => b[1].ms - a[1].ms)
        .map(([k, v]) => [k, `${round(v.ms, 10)}ms/${v.n} (max ${round(v.max, 10)})`]),
    );
    for (const k of Object.keys(acc)) delete acc[k];
    return o;
  };
  const queues = () => {
    const x = d as unknown as { fracture: { pending: number }; world: { pendingWork?: () => Record<string, number> } };
    return { fracture: x.fracture.pending, ...(x.world.pendingWork ? x.world.pendingWork() : {}) };
  };

  sim.step(10);
  snap();
  const gyp = () =>
    [...wall.parts].filter((p) => p.alive && p.island && p.island.isStatic && p.matId === "gypsum" && p.volume > 0.004);
  const strikes: unknown[] = [];
  for (let k = 0; k < 8; k++) {
    const cands = gyp();
    if (!cands.length) break;
    const p = cands[(k * 7919) % cands.length];
    const isl = p.island!;
    const b = p.bounds;
    const ex = [b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z];
    const thin = ex[0] <= ex[1] && ex[0] <= ex[2] ? 0 : ex[1] <= ex[2] ? 1 : 2;
    const c = { ...p.centroid };
    const dirL = { x: 0, y: 0, z: 0 };
    // hit the face pointing away from the wall's centre plane
    const wc = isl.com;
    const sgn = (thin === 0 ? c.x - wc.x : thin === 1 ? c.y - wc.y : c.z - wc.z) >= 0 ? 1 : -1;
    if (thin === 0) {
      c.x = sgn > 0 ? b.max.x : b.min.x;
      dirL.x = -sgn;
    } else if (thin === 1) {
      c.y = sgn > 0 ? b.max.y : b.min.y;
      dirL.y = -sgn;
    } else {
      c.z = sgn > 0 ? b.max.z : b.min.z;
      dirL.z = -sgn;
    }
    const wp = d.world.toWorldVec(isl, c);
    const wd = d.world.dirToWorldVec(isl, dirL);
    const t1 = performance.now();
    const r = d.strike({ point: new Vector3(wp.x, wp.y, wp.z), dir: new Vector3(wd.x, wd.y, wd.z), body: isl.body!, childIndex: -1, mass: 6, speed: 8, sharpness: 1, contactRadius: 0.03, strikerMat: "steel", source: "debug" });
    const strikeMs = performance.now() - t1;
    const strikeStages = snap();
    const q0 = queues();
    const stepMs: number[] = [];
    let firstStages: unknown = null;
    for (let s = 0; s < 30; s++) {
      const t2 = performance.now();
      sim.step(1);
      stepMs.push(performance.now() - t2);
      if (s === 0) firstStages = snap();
    }
    const rest = snap();
    strikes.push({
      part: r.partName,
      e: round(r.energy, 10),
      broke: r.broke,
      strikeMs: round(strikeMs, 10),
      step1Ms: round(stepMs[0], 10),
      maxStepMs: round(Math.max(...stepMs), 10),
      meanStepMs: round(stepMs.reduce((a, b) => a + b, 0) / stepMs.length, 10),
      destructionMsLast: round(d.stats().msLastStep, 10),
      queuesAfterStrike: q0,
      world: { islands: d.stats().islands, parts: d.stats().parts, fractures: d.stats().fractures, wallStatic: [...wall.islands].filter((i) => i.isStatic).map((i) => i.parts.length), biggestDyn: Math.max(0, ...[...wall.islands].filter((i) => !i.isStatic).map((i) => round(i.mass, 10))) },
      queuesAfter30: queues(),
      strikeStages,
      step1Stages: firstStages,
      steps2to30: rest,
    });
  }
  const t3 = performance.now();
  sim.step(60);
  return {
    wall: { name: wall.name, parts: wallPiece.def.parts.length },
    strikes,
    idleAfterMs: round((performance.now() - t3) / 60, 100),
    stats: d.stats(),
    counts: sim.counts(),
  };
}
