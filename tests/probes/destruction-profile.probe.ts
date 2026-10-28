// Profiling probe: where does the time go when a pane shatters / a table top breaks out?
// Wraps runtime + physics methods with timers and reports per-stage totals.
import { Vector3 } from "@babylonjs/core";
import { makeSim, floorDef, tableDef, paneDef, round } from "./destruction-util.ts";
import * as damage from "../../src/destruction/model/damage.ts";
import * as meshgen from "../../src/geom/meshgen.ts";

type Acc = Record<string, { n: number; ms: number }>;

function wrap(acc: Acc, label: string, obj: Record<string, unknown>, name: string): void {
  const fn = obj[name] as (...a: unknown[]) => unknown;
  if (typeof fn !== "function") return;
  obj[name] = function (this: unknown, ...a: unknown[]) {
    const t0 = performance.now();
    try {
      return fn.apply(this, a);
    } finally {
      const e = (acc[label] ??= { n: 0, ms: 0 });
      e.n++;
      e.ms += performance.now() - t0;
    }
  };
}

export async function probe() {
  const sim = await makeSim();
  const { d, physics } = sim;
  const I = { x: 0, y: 0, z: 0, w: 1 };
  d.spawn(floorDef(), { p: { x: 0, y: 0, z: 0 }, q: I });
  const acc: Acc = {};
  const W = d.world as unknown as Record<string, unknown>;
  for (const m of ["createPart", "createIsland", "syncContainer", "ensureShape", "partGeom", "rebuildMeshes", "splitIsland", "flushTopology", "updateMetrics"]) wrap(acc, `world.${m}`, W, m);
  const F = d.fracture as unknown as Record<string, unknown>;
  wrap(acc, "fracture.apply", F, "apply");
  wrap(acc, "fracture.createFragment", F, "createFragment");
  wrap(acc, "fracture.spawnMicro", F, "spawnMicro");
  const IM = d.impacts as unknown as Record<string, unknown>;
  wrap(acc, "impacts.hitPart", IM, "hitPart");
  const P = physics as unknown as Record<string, unknown>;
  for (const m of ["hullShape", "boxShape", "containerShape", "setShape", "createBody", "disposeBody", "setMotion"]) wrap(acc, `physics.${m}`, P, m);
  const R = sim.render as unknown as Record<string, unknown>;
  wrap(acc, "render.buildIsland", R, "buildIsland");
  const results: Record<string, unknown> = {};

  const run = async (label: string, fn: () => void) => {
    for (const k of Object.keys(acc)) delete acc[k];
    const t0 = performance.now();
    fn();
    const total = performance.now() - t0;
    results[label] = { totalMs: round(total, 10), stages: Object.fromEntries(Object.entries(acc).sort((a, b) => b[1].ms - a[1].ms).map(([k, v]) => [k, `${round(v.ms, 10)}ms/${v.n}`])) };
  };

  // warm-up fracture (JIT) on a throwaway pane
  const warmId = d.spawn(paneDef(), { p: { x: -3, y: 0.9, z: 2 }, q: I });
  const strikeIsl = (id: number, local: { x: number; y: number; z: number }, dir: Vector3, mass: number, speed: number, r: number) => {
    const isl = [...d.assembly(id)!.islands][0];
    const wp = d.world.toWorldVec(isl, local);
    return d.strike({ point: new Vector3(wp.x, wp.y, wp.z), dir, body: isl.body!, childIndex: -1, mass, speed, sharpness: 1, contactRadius: r, strikerMat: "steel", source: "debug" });
  };
  await run("warmupPane", () => strikeIsl(warmId, { x: 0, y: 0.55, z: -0.002 }, new Vector3(0, 0, 1), 0.9, 11, 0.015));
  sim.step(10);

  const paneId = d.spawn(paneDef(), { p: { x: 1.2, y: 0.9, z: 0.5 }, q: I });
  await run("paneHammer", () => strikeIsl(paneId, { x: 0.1, y: 0.6, z: -0.002 }, new Vector3(0, 0, 1), 0.9, 11, 0.015));
  results.paneParts = d.assembly(paneId)!.parts.size;
  results.paneIslands = d.assembly(paneId)!.islands.size;
  await run("paneStep1", () => sim.step(1));
  await run("paneStep30", () => sim.step(30));

  const tableId = d.spawn(tableDef(), { p: { x: -1.2, y: 0, z: 0 }, q: I });
  sim.step(5);
  await run("tableSledge", () => strikeIsl(tableId, { x: -0.1, y: 0.75, z: 0 }, new Vector3(0, -1, 0), 6, 8.5, 0.03));
  results.tableParts = d.assembly(tableId)!.parts.size;
  await run("tableStep30", () => sim.step(30));

  // pure model timings for reference
  const t0 = performance.now();
  let n = 0;
  for (const p of d.assembly(tableId)!.parts) {
    meshgen.polyToRenderGeom(p.poly, { tessCell: p.tessCell || undefined });
    n++;
  }
  results.meshgenPerPartMs = round((performance.now() - t0) / Math.max(1, n), 1000);
  results.events = { ...sim.ev };
  void damage;
  return results;
}
