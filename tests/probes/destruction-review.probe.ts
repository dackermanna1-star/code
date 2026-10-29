// Reviewer probe (adversarial checks): impact event fields, rotated-assembly joints, split
// velocity inheritance, constraint churn on use toggles, light toggle churn, degenerate strikes.
import { Vector3 } from "@babylonjs/core";
import { makeSim, floorDef, tableDef, doorDef, blockDef, boxPart, round } from "./destruction-util.ts";
import type { AssemblyDef } from "../../src/destruction/model/types.ts";
import { qaxisAngle } from "../../src/geom/vec.ts";

const I = { x: 0, y: 0, z: 0, w: 1 };

function pairDef(): AssemblyDef {
  return {
    type: "testPair",
    name: "Pair",
    category: "misc",
    value: 5,
    parts: [
      boxPart("a", "steel", "metal_raw", { x: 0.3, y: 0.1, z: 0.1 }, { x: -0.15, y: 0, z: 0 }),
      boxPart("b", "steel", "metal_raw", { x: 0.3, y: 0.1, z: 0.1 }, { x: 0.15, y: 0, z: 0 }),
    ],
    bonds: [{ a: "a", b: "b", kind: "weld", strength: 1e6 }],
    startAsleep: false,
  } as AssemblyDef;
}

export async function probe() {
  const sim = await makeSim();
  const { d, physics } = sim;
  const out: Record<string, unknown> = {};
  d.spawn(floorDef(12), { p: { x: 0, y: 0, z: 0 }, q: I });

  // 1. impact event fields (drop a brick on the static floor)
  const imps: any[] = [];
  sim.events.on("impact", (e: any) => imps.push(e));
  const brickId = d.spawn({ ...blockDef("ceramic", { x: 0.2, y: 0.06, z: 0.1 }, "brick"), startAsleep: false } as AssemblyDef, { p: { x: 3, y: 1.5, z: 3 }, q: I });
  sim.step(90);
  out.impactEvents = imps.length;
  out.impactKeys = imps[0] ? Object.keys(imps[0]) : null;
  out.hasStaticFlags = imps.some((e) => typeof e.staticA === "boolean" || typeof e.staticB === "boolean");

  // 2. rotated door (90° about Y): use opens, coordinate
  const q90 = qaxisAngle({ x: 0, y: 1, z: 0 }, Math.PI / 2);
  const doorId = d.spawn(doorDef({ latch: 40 }), { p: { x: -3, y: 0, z: 0 }, q: q90 });
  const door = d.assembly(doorId)!;
  const g = [...door.groups.values()][0];
  const slab = door.byName.get("slab")!;
  sim.step(10);
  const cBefore = sim.counts().constraints;
  const hk0 = physics.hk.HP_GetStatistics()[1];
  const sIsl = slab.island!;
  const hp = d.world.toWorldVec(sIsl, { x: 0.3, y: 1.0, z: 0 });
  const angs: number[] = [];
  for (let k = 0; k < 6; k++) {
    const isl = slab.island!;
    const p = d.world.toWorldVec(isl, { x: 0.3, y: 1.0, z: 0 });
    d.use(isl.body!, new Vector3(p.x, p.y, p.z), new Vector3(hp.x + 1, 1.6, hp.z));
    sim.step(90);
    angs.push(round(d.joints.coordinate(g)! * 180 / Math.PI, 10));
  }
  out.rotatedDoorAngles = angs;
  out.constraintsBeforeAfter = [cBefore, sim.counts().constraints];
  out.hkStatsBeforeAfter = [Array.from(hk0), Array.from(physics.hk.HP_GetStatistics()[1])];
  out.doorSlabPos = d.world.toWorldVec(slab.island!, slab.island!.com);

  // 3. split velocity: spinning welded pair mid-air, break the weld
  const pairId = d.spawn(pairDef(), { p: { x: 0, y: 6, z: -3 }, q: I });
  const pair = d.assembly(pairId)!;
  const isl0 = [...pair.islands][0];
  isl0.body!.setLinearVelocity(new Vector3(1, 0, 0));
  isl0.body!.setAngularVelocity(new Vector3(0, 0, 5));
  sim.step(1);
  const v0 = new Vector3(), w0 = new Vector3();
  isl0.body!.getLinearVelocityToRef(v0);
  isl0.body!.getAngularVelocityToRef(w0);
  const com0 = d.world.toWorldVec(isl0, isl0.com);
  const weld = pair.byName.get("a")!.bonds[0];
  d.world.breakBond(weld);
  d.world.flushTopology();
  const pv: any[] = [];
  for (const isl of pair.islands) {
    const v = new Vector3(), w = new Vector3();
    isl.body!.getLinearVelocityToRef(v);
    isl.body!.getAngularVelocityToRef(w);
    const c = d.world.toWorldVec(isl, isl.com);
    const r = { x: c.x - com0.x, y: c.y - com0.y, z: c.z - com0.z };
    const exp = { x: v0.x + (w0.y * r.z - w0.z * r.y), y: v0.y + (w0.z * r.x - w0.x * r.z), z: v0.z + (w0.x * r.y - w0.y * r.x) };
    pv.push({ v: [round(v.x), round(v.y), round(v.z)], exp: [round(exp.x), round(exp.y), round(exp.z)], w: [round(w.x), round(w.y), round(w.z)] });
  }
  out.splitVel = { v0: [round(v0.x), round(v0.y), round(v0.z)], w0: [round(w0.x), round(w0.y), round(w0.z)], pieces: pv };

  // 4. degenerate strikes
  const tableId = d.spawn(tableDef(), { p: { x: 2, y: 0, z: -2 }, q: I });
  const tIsl = [...d.assembly(tableId)!.islands][0];
  const nanRes = d.strike({ point: new Vector3(NaN, 1, 0), dir: new Vector3(0, -1, 0), body: tIsl.body!, childIndex: -1, mass: 1, speed: 10, sharpness: 1, contactRadius: 0.015, strikerMat: "steel", source: "debug" });
  const zeroDir = d.strike({ point: new Vector3(2, 0.75, -2), dir: new Vector3(0, 0, 0), body: tIsl.body!, childIndex: 999, mass: 1, speed: Infinity, sharpness: 1, contactRadius: 0.015, strikerMat: "steel", source: "debug" });
  sim.step(5);
  out.degenerate = { nanRes, zeroDir, tablePos: d.positionOf(tableId) };

  // 5. brick pieces after dropping (cascade check) — drop ceramic brick from 1.5 m
  out.brick = { islands: d.assembly(brickId)?.islands.size, fractures: sim.ev.fracture ?? 0 };

  // 6. strike a static floor next to the brick: staticA in strike event?
  imps.length = 0;
  return out;
}
