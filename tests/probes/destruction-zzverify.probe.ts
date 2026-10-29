// temporary verification probe (reviewer) — pane strike cost breakdown after warm-up
import { Vector3 } from "@babylonjs/core";
import { makeSim, floorDef, paneDef, round } from "./destruction-util.ts";
const I = { x: 0, y: 0, z: 0, w: 1 };
export async function probe() {
  const sim = await makeSim();
  const { d } = sim;
  d.spawn(floorDef(16), { p: { x: 0, y: 0, z: 0 }, q: I });
  const t: Record<string, number> = {};
  const wrap = (obj: any, name: string, key: string) => {
    const f = obj[name].bind(obj);
    obj[name] = (...a: any[]) => { const t0 = performance.now(); try { return f(...a); } finally { t[key] = (t[key] ?? 0) + performance.now() - t0; } };
  };
  wrap(d.impacts, "hitPart", "hitPart");
  wrap(d.fracture, "process", "fractureProcess");
  wrap(d.world, "flushTopology", "flush");
  wrap(d.world, "createIsland", "createIsland");
  wrap(d.world, "ensureShape", "ensureShape");
  wrap(d.world, "newPart", "newPart");
  wrap(d.world, "killPart", "killPart");
  wrap(d.world, "breakBond", "breakBond");
  wrap(d.world, "createBond", "createBond");
  wrap((d as any).features, "onFracture", "featOnFracture");
  wrap(d.world.vfx as any, "micro", "vfxMicro");
  wrap(d.world.events as any, "emit", "emit");
  wrap(d.world, "addPartToIsland", "addPartToIsland");
  const res: any[] = [];
  for (let k = 0; k < 8; k++) {
    const id = d.spawn(paneDef(), { p: { x: -6 + k * 1.6, y: 0.9, z: 0.5 }, q: I });
    sim.step(10);
    const asm = d.assembly(id)!;
    const glass = asm.byName.get("glass")!;
    const isl = glass.island!;
    const wp = d.world.toWorldVec(isl, glass.centroid);
    for (const key in t) t[key] = 0;
    const t0 = performance.now();
    const r = d.strike({ point: new Vector3(wp.x, wp.y, wp.z), dir: new Vector3(0, 0, -1), body: isl.body!, childIndex: -1, mass: 0.6, speed: 20, sharpness: 1, contactRadius: 0.01, strikerMat: "steel", source: "debug" });
    const ms = performance.now() - t0;
    const pend = d.world.pendingWork();
    const s0 = performance.now();
    sim.step(1);
    const stepMs = performance.now() - s0;
    res.push({ broke: r.broke, ms: round(ms, 10), stepMs: round(stepMs, 10), pend, ...Object.fromEntries(Object.entries(t).map(([a, b]) => [a, round(b, 10)])) });
    sim.step(30);
  }
  return res;
}
