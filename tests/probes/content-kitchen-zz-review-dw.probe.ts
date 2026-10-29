// THROWAWAY review probe: dishwasher door diagnostics.
import { Vector3 } from "@babylonjs/core";
import { makeSim, floorDef, round } from "./destruction-util.ts";
import { KITCHEN_OBJECTS as K } from "../../src/objects/kitchen/index.ts";
const I = { x: 0, y: 0, z: 0, w: 1 };
export async function probe(): Promise<unknown> {
  const sim = await makeSim({ camPos: new Vector3(1.4, 1.0, 1.4), camTarget: new Vector3(0, 0.4, 0.2) });
  const { d } = sim;
  d.spawn(floorDef(12), { p: { x: 0, y: 0, z: 0 }, q: I });
  const out: Record<string, unknown> = {};
  const id = d.spawn({ ...K.dishwasher(), startAsleep: false }, { p: { x: 0, y: 0, z: 0 }, q: I });
  const rid = d.spawn({ ...K.range({ towel: false }), startAsleep: false }, { p: { x: -1.5, y: 0, z: 0 }, q: I });
  sim.step(30);
  const l0 = sim.log.length;
  const asm = d.assembly(id)!;
  const isl = asm.byName.get("door_controls")!.island!;
  const g = [...asm.groups.values()].find((gg: any) => gg.constraints.some((c: any) => c.moving === isl)) as any;
  out.groups = [...asm.groups.values()].map((gg: any) => ({ kind: gg.kind, n: gg.constraints.length, parts: [...new Set(gg.constraints.map((c: any) => [...c.moving.parts].slice(0, 3).map((p: any) => p.name).join(",")))] }));
  out.doorParts = [...isl.parts].map((p: any) => p.name);
  d.joints.release(g);
  const trace: number[] = [];
  const mode = ["push", "none"];
  for (let i = 0; i < 200; i++) {
    if (i < 120) {
      const jc = g.constraints[0];
      const { axis, pivot } = d.joints.worldAxis(g, jc);
      const c = d.world.toWorldVec(isl, isl.com);
      const r = { x: c.x - pivot.x, y: c.y - pivot.y, z: c.z - pivot.z };
      const t = { x: axis.y * r.z - axis.z * r.y, y: axis.z * r.x - axis.x * r.z, z: axis.x * r.y - axis.y * r.x };
      const l = Math.hypot(t.x, t.y, t.z) || 1;
      const F = isl.mass * 8;
      isl.body!.applyForce(new Vector3((t.x / l) * F, (t.y / l) * F, (t.z / l) * F), new Vector3(c.x, c.y, c.z));
    }
    sim.step(1);
    if (i % 10 === 0) trace.push(round(((d.joints.coordinate(g) ?? NaN) * 180) / Math.PI, 10));
  }
  out.mass = round(isl.mass, 100);
  out.trace = trace;
  out.log = sim.log.slice(l0).filter((l) => l.type !== "damage").slice(0, 20).map((l) => { const e = l.ev as any; return `${l.t.toFixed(2)} ${l.type} ${e.kind ?? ""} ${e.a ?? e.partA ?? ""} ${e.b ?? e.partB ?? ""} ${e.matA ?? e.mat ?? ""}/${e.matB ?? ""} E=${typeof e.energy === "number" ? e.energy.toFixed(2) : "?"} ${e.pos ? `${e.pos.x.toFixed(2)},${e.pos.y.toFixed(2)},${e.pos.z.toFixed(2)}` : ""}`; });
  // range drawer
  const ra = d.assembly(rid)!;
  const di = ra.byName.get("drawer_l")!.island!;
  out.rangeDrawerIsland = [...di.parts].map((p: any) => p.name);
  const dg = [...ra.groups.values()].find((gg: any) => gg.constraints.some((c: any) => c.moving === di)) as any;
  if (dg) {
    d.joints.release(dg);
    let mx = 0;
    for (let i = 0; i < 150; i++) {
      const jc = dg.constraints[0];
      const { axis } = d.joints.worldAxis(dg, jc);
      const c = d.world.toWorldVec(di, di.com);
      const F = di.mass * 6;
      di.body!.applyForce(new Vector3(axis.x * F, axis.y * F, axis.z * F), new Vector3(c.x, c.y, c.z));
      sim.step(1);
      mx = Math.max(mx, d.joints.coordinate(dg) ?? 0);
    }
    out.rangeDrawerMax = round(mx, 1000);
  }
  await sim.renderReady(3);
  return out;
}
