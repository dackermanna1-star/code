// respond() cost breakdown: fracturing vs non-fracturing calls, by material.
import { Vector3 } from "@babylonjs/core";
import { makeSim, floorDef, tableDef, paneDef, round } from "./destruction-util.ts";
import type { PartOutcome } from "../../src/destruction/model/damage.ts";

export async function probe() {
  const sim = await makeSim();
  const { d } = sim;
  const I = { x: 0, y: 0, z: 0, w: 1 };
  d.spawn(floorDef(), { p: { x: 0, y: 0, z: 0 }, q: I });
  const calls: Array<{ ms: number; frac: boolean; mat: string; e: number; strike: boolean; cracks: number; chips: number; gen: number }> = [];
  const IM = d.impacts as unknown as { hitPart: (...a: unknown[]) => PartOutcome | null };
  const orig = IM.hitPart.bind(d.impacts);
  IM.hitPart = (...a: unknown[]) => {
    const part = a[1] as { matId: string; gen: number };
    const t0 = performance.now();
    const out = orig(...a);
    calls.push({ ms: performance.now() - t0, frac: !!out?.fracture, mat: part.matId, e: a[4] as number, strike: a[9] as boolean, cracks: out?.addCracks.length ?? 0, chips: out?.chips.length ?? 0, gen: part.gen });
    return out;
  };
  const paneId = d.spawn(paneDef(), { p: { x: 1.2, y: 0.9, z: 0.5 }, q: I });
  const tableId = d.spawn(tableDef(), { p: { x: -1.2, y: 0, z: 0 }, q: I });
  sim.step(5);
  const strike = (id: number, local: { x: number; y: number; z: number }, dir: Vector3, mass: number, speed: number, r: number) => {
    const isl = [...d.assembly(id)!.islands][0];
    const wp = d.world.toWorldVec(isl, local);
    return d.strike({ point: new Vector3(wp.x, wp.y, wp.z), dir, body: isl.body!, childIndex: -1, mass, speed, sharpness: 1, contactRadius: r, strikerMat: "steel", source: "debug" });
  };
  strike(paneId, { x: 0.1, y: 0.6, z: -0.002 }, new Vector3(0, 0, 1), 0.9, 11, 0.015);
  strike(tableId, { x: -0.1, y: 0.75, z: 0 }, new Vector3(0, -1, 0), 6, 8.5, 0.03);
  sim.step(60);
  const agg: Record<string, { n: number; ms: number; max: number }> = {};
  for (const c of calls) {
    const k = `${c.mat}/${c.frac ? "FRACTURE" : "nofrac"}/${c.strike ? "strike" : "passive"}`;
    const a = (agg[k] ??= { n: 0, ms: 0, max: 0 });
    a.n++;
    a.ms += c.ms;
    a.max = Math.max(a.max, c.ms);
  }
  const slow = calls.filter((c) => c.ms > 5 && !c.frac).slice(0, 12).map((c) => ({ ...c, ms: round(c.ms, 10), e: round(c.e, 100) }));
  return { agg: Object.fromEntries(Object.entries(agg).map(([k, v]) => [k, { n: v.n, avg: round(v.ms / v.n, 100), max: round(v.max, 10) }])), slowNoFrac: slow, fractures: sim.ev.fracture, parts: d.stats().parts };
}
