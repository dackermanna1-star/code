// Stress probe: rapid sledge strikes into a real stud partition, then a 200 kg concrete block
// dropped onto the debris pile. Checks that break work stays spread over steps and that debris
// cannot multiply without bound (fracture cascades): body count, fractures, per-step costs.
import { Vector3 } from "@babylonjs/core";
import { makeSim, blockDef, round } from "./destruction-util.ts";
import { buildStructure } from "../../src/world/structure.ts";
import type { AssemblyDef } from "../../src/destruction/model/types.ts";

export async function probe() {
  const sim = await makeSim();
  const { d } = sim;
  const pieces = buildStructure();
  const slab = pieces.find((p) => p.def.type.toLowerCase().includes("slab") && /floor/i.test(p.def.name)) ?? pieces[0];
  const parts = pieces.filter((p) => p.def.type.toLowerCase().includes("partition")).sort((a, b) => b.def.parts.length - a.def.parts.length);
  const wallPiece = parts.find((p) => p.def.parts.length <= 260) ?? parts[parts.length - 1];
  d.spawn(slab.def, slab.xf);
  const wall = d.assembly(d.spawn(wallPiece.def, wallPiece.xf))!;
  sim.step(5);
  const stepMs: number[] = [];
  const destMs: number[] = [];
  let maxIslandsMade = 0;
  let skipped = 0;
  const W = d.world as unknown as { createIsland: (...a: unknown[]) => unknown };
  let made = 0;
  const orig = W.createIsland;
  W.createIsland = function (this: unknown, ...a: unknown[]) {
    made++;
    return orig.apply(this, a);
  };
  // per-step stage accounting; the worst destruction step's breakdown is reported
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
  const Wd = d.world as unknown as Record<string, unknown>;
  for (const m of ["createIsland", "syncContainer", "rebuildMeshes", "splitIsland", "refineShapes", "createPendingIslands", "flushTopology"]) wrap(`world.${m}`, Wd, m);
  wrap("fracture.process", d.fracture as unknown as Record<string, unknown>, "process");
  wrap("impacts.hitPart", d.impacts as unknown as Record<string, unknown>, "hitPart");
  wrap("impacts.inertial", d.impacts as unknown as Record<string, unknown>, "inertial");
  wrap("impacts.process", d.impacts as unknown as Record<string, unknown>, "process");
  wrap("joints.jointLoads", d.joints as unknown as Record<string, unknown>, "jointLoads");
  wrap("features.fixedUpdate", d.features as unknown as Record<string, unknown>, "fixedUpdate");
  wrap("debris.fixedUpdate", d.debris as unknown as Record<string, unknown>, "fixedUpdate");
  wrap("debris.rebuildBatches", d.debris as unknown as Record<string, unknown>, "rebuildBatches");
  wrap("accounting.update", d.accounting as unknown as Record<string, unknown>, "update");
  const Pp = sim.physics as unknown as Record<string, unknown>;
  for (const m of ["hullShape", "setShape", "createBody"]) wrap(`physics.${m}`, Pp, m);
  wrap("render.buildIsland", sim.render as unknown as Record<string, unknown>, "buildIsland");
  let worst = -1;
  let worstInfo: unknown = null;
  const step = (n: number) => {
    for (let i = 0; i < n; i++) {
      made = 0;
      for (const k of Object.keys(acc)) delete acc[k];
      const t0 = performance.now();
      sim.step(1);
      stepMs.push(performance.now() - t0);
      const dm = d.stats().msLastStep;
      destMs.push(dm);
      maxIslandsMade = Math.max(maxIslandsMade, made);
      skipped += d.impacts.skipped;
      if (dm > worst) {
        worst = dm;
        worstInfo = {
          ms: round(dm, 10),
          impacts: d.impacts.processed,
          skipped: d.impacts.skipped,
          islandsMade: made,
          stages: Object.fromEntries(Object.entries(acc).sort((a, b) => b[1].ms - a[1].ms).map(([k, v]) => [k, `${round(v.ms, 10)}/${v.n} max ${round(v.max, 10)}`])),
        };
      }
    }
  };
  const gyp = () => [...wall.parts].filter((p) => p.alive && p.island && p.island.isStatic && (p.matId === "gypsum" || p.matId === "softwood") && p.volume > 0.002);
  const timeline: unknown[] = [];
  for (let k = 0; k < 14; k++) {
    const cands = gyp();
    if (!cands.length) break;
    const p = cands[(k * 7919) % cands.length];
    const isl = p.island!;
    const b = p.bounds;
    const ex = [b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z];
    const thin = ex[0] <= ex[1] && ex[0] <= ex[2] ? 0 : ex[1] <= ex[2] ? 1 : 2;
    const c = { ...p.centroid };
    const dl = { x: 0, y: 0, z: 0 };
    const s = (thin === 0 ? c.x - isl.com.x : thin === 1 ? c.y - isl.com.y : c.z - isl.com.z) >= 0 ? 1 : -1;
    if (thin === 0) [c.x, dl.x] = [s > 0 ? b.max.x : b.min.x, -s];
    else if (thin === 1) [c.y, dl.y] = [s > 0 ? b.max.y : b.min.y, -s];
    else [c.z, dl.z] = [s > 0 ? b.max.z : b.min.z, -s];
    const wp = d.world.toWorldVec(isl, c);
    const wd = d.world.dirToWorldVec(isl, dl);
    d.strike({ point: new Vector3(wp.x, wp.y, wp.z), dir: new Vector3(wd.x, wd.y, wd.z), body: isl.body!, childIndex: -1, mass: 8, speed: 10, sharpness: 1, contactRadius: 0.04, strikerMat: "steel", source: "debug" });
    step(8);
    timeline.push({ k, islands: d.stats().islands, fractures: d.stats().fractures, pending: d.world.pendingWork() });
  }
  // drop a heavy block on the debris (centre of the wall's footprint, 1 m up)
  const wb = [...wall.islands].sort((a, b) => b.parts.length - a.parts.length)[0];
  const at = d.world.toWorldVec(wb, wb.com);
  const debrisNear = [...d.world.islands].filter((i) => !i.isStatic).length;
  d.spawn({ ...blockDef("concrete", { x: 0.5, y: 0.35, z: 0.5 }, "block", "concrete"), startAsleep: false } as AssemblyDef, { p: { x: at.x + 0.6, y: 0.9, z: at.z + 0.6 }, q: { x: 0, y: 0, z: 0, w: 1 } });
  const t1 = performance.now();
  step(240);
  const dropMs = performance.now() - t1;
  const sorted = [...stepMs].sort((a, b) => a - b);
  const dsorted = [...destMs].sort((a, b) => a - b);
  const pct = (a: number[], q: number) => round(a[Math.min(a.length - 1, Math.floor(q * a.length))], 10);
  const st = d.stats();
  return {
    timeline,
    beforeDrop: { dynamicIslands: debrisNear },
    after: { islands: st.islands, dynamic: st.dynamicIslands, debris: st.debrisIslands, fractures: st.fractures, parts: st.parts, pending: d.world.pendingWork(), fractureQueue: d.fracture.pending },
    stepMs: { p50: pct(sorted, 0.5), p90: pct(sorted, 0.9), p99: pct(sorted, 0.99), max: round(sorted[sorted.length - 1], 10) },
    destructionMs: { p50: pct(dsorted, 0.5), p90: pct(dsorted, 0.9), p99: pct(dsorted, 0.99), max: round(dsorted[dsorted.length - 1], 10) },
    maxIslandsCreatedInOneStep: maxIslandsMade,
    worstDestructionStep: worstInfo,
    respondSkipped: skipped,
    dropPhaseMsPerStep: round(dropMs / 240, 10),
    bounded: st.dynamicIslands < 700,
  };
}
