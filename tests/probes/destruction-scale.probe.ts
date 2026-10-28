// Scaling probe: spawn the whole apartment structure (thousands of parts in big static islands)
// through the runtime with the render double, then measure idle step cost, strikes into big
// walls (in-place container edits + chunked meshes) and a burst of debris.
import { Vector3 } from "@babylonjs/core";
import { makeSim, round } from "./destruction-util.ts";
import { buildStructure } from "../../src/world/structure.ts";

export async function probe() {
  const sim = await makeSim();
  const { d, physics } = sim;
  const t0 = performance.now();
  const pieces = buildStructure();
  const buildMs = performance.now() - t0;
  let parts = 0;
  for (const p of pieces) parts += p.def.parts.length;
  const ts = performance.now();
  const ids: number[] = [];
  for (const p of pieces) ids.push(d.spawn(p.def, p.xf));
  const spawnMs = performance.now() - ts;
  const afterSpawn = d.stats();
  // biggest islands
  const big = [...d.world.islands].sort((a, b) => b.parts.length - a.parts.length).slice(0, 5).map((i) => ({ asm: i.asm.name, parts: i.parts.length, static: i.isStatic, chunks: i.chunks.size }));
  const acc: Record<string, { n: number; ms: number }> = {};
  const wrap = (label: string, obj: Record<string, unknown>, name: string) => {
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
  };
  const W = d.world as unknown as Record<string, unknown>;
  for (const m of ["createPart", "createIsland", "syncContainer", "ensureShape", "rebuildMeshes", "splitIsland", "flushTopology", "locatePart"]) wrap(`world.${m}`, W, m);
  wrap("fracture.apply", d.fracture as unknown as Record<string, unknown>, "apply");
  wrap("fracture.process", d.fracture as unknown as Record<string, unknown>, "process");
  wrap("impacts.hitPart", d.impacts as unknown as Record<string, unknown>, "hitPart");
  wrap("impacts.process", d.impacts as unknown as Record<string, unknown>, "process");
  const P = physics as unknown as Record<string, unknown>;
  for (const m of ["step", "hullShape", "containerShape", "setShape", "createBody"]) wrap(`physics.${m}`, P, m);
  wrap("render.buildIsland", sim.render as unknown as Record<string, unknown>, "buildIsland");
  const snap = () => {
    const o = Object.fromEntries(Object.entries(acc).filter(([, v]) => v.ms > 2).sort((a, b) => b[1].ms - a[1].ms).map(([k, v]) => [k, `${round(v.ms, 10)}/${v.n}`]));
    for (const k of Object.keys(acc)) delete acc[k];
    return o;
  };
  // idle steps
  sim.step(5);
  let tIdle = performance.now();
  sim.step(60);
  const idleStepMs = (performance.now() - tIdle) / 60;
  const idleDestruction = d.stats().msLastStep;
  // strike the largest static island several times (sledge) at different spots
  const target = [...d.world.islands].filter((i) => i.isStatic).sort((a, b) => b.parts.length - a.parts.length)[0];
  const strikes: unknown[] = [];
  for (let k = 0; k < 6; k++) {
    // pick a random collidable part of that island and hit its centre from outside along its thinnest axis
    const p = target.parts[(k * 7919) % target.parts.length];
    const c = d.world.toWorldVec(target, p.centroid);
    const t1 = performance.now();
    const r = d.strike({ point: new Vector3(c.x, c.y, c.z), dir: new Vector3(0, -1, 0), body: target.body!, childIndex: -1, mass: 6, speed: 8, sharpness: 1, contactRadius: 0.03, strikerMat: "steel", source: "debug" });
    const ms = performance.now() - t1;
    const strikeStages = snap();
    const t2 = performance.now();
    sim.step(1);
    strikes.push({ part: r.partName, mat: r.targetMat, e: round(r.energy, 10), broke: r.broke, strikeMs: round(ms, 10), nextStepMs: round(performance.now() - t2, 10), strikeStages, stepStages: snap(), isl: target.parts.length, asm: target.asm.name });
  }
  snap();
  sim.step(30);
  const settle30 = snap();
  tIdle = performance.now();
  sim.step(30);
  const afterStepMs = (performance.now() - tIdle) / 30;
  return {
    assemblies: pieces.length,
    blueprintParts: parts,
    buildMs: round(buildMs, 10),
    spawnMs: round(spawnMs, 10),
    spawnPerPartUs: round((spawnMs * 1000) / Math.max(1, parts), 10),
    afterSpawn,
    big,
    idleStepMs: round(idleStepMs, 100),
    idleDestructionMs: round(idleDestruction, 100),
    physics: physics.stats(),
    strikes,
    afterStepMs: round(afterStepMs, 100),
    settle30,
    final: d.stats(),
  };
}
