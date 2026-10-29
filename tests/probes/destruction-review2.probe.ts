// Reviewer probe 2: rotated vs unrotated door swing, NaN strike point, landing cascades.
import { Vector3 } from "@babylonjs/core";
import { makeSim, floorDef, tableDef, doorDef, blockDef, boxPart, round } from "./destruction-util.ts";
import type { AssemblyDef } from "../../src/destruction/model/types.ts";
import { qaxisAngle } from "../../src/geom/vec.ts";

const I = { x: 0, y: 0, z: 0, w: 1 };

export async function probe() {
  const sim = await makeSim();
  const { d } = sim;
  const out: Record<string, unknown> = {};
  d.spawn(floorDef(16), { p: { x: 0, y: 0, z: 0 }, q: I });

  const doorTest = (q: any, x: number) => {
    const id = d.spawn(doorDef({ latch: 40 }), { p: { x, y: 0, z: 4 }, q });
    const door = d.assembly(id)!;
    const g = [...door.groups.values()][0];
    const slab = door.byName.get("slab")!;
    sim.step(10);
    const isl = slab.island!;
    const p = d.world.toWorldVec(isl, { x: 0.3, y: 1.0, z: 0 });
    const from = d.world.toWorldVec(isl, { x: 0.3, y: 1.6, z: 1 });
    d.use(isl.body!, new Vector3(p.x, p.y, p.z), new Vector3(from.x, from.y, from.z));
    const trace: number[] = [];
    for (let k = 0; k < 6; k++) {
      sim.step(15);
      trace.push(round((d.joints.coordinate(g)! * 180) / Math.PI, 10));
    }
    return trace;
  };
  out.doorIdentity = doorTest(I, -4);
  out.doorRot90 = doorTest(qaxisAngle({ x: 0, y: 1, z: 0 }, Math.PI / 2), 0);
  out.doorRot180 = doorTest(qaxisAngle({ x: 0, y: 1, z: 0 }, Math.PI), 4);

  // NaN strike point on a dynamic table
  const tableId = d.spawn(tableDef(), { p: { x: 2, y: 0, z: -2 }, q: I });
  sim.step(30);
  const tIsl = [...d.assembly(tableId)!.islands][0];
  const r = d.strike({ point: new Vector3(NaN, NaN, NaN), dir: new Vector3(0, -1, 0), body: tIsl.body!, childIndex: -1, mass: 1, speed: 10, sharpness: 1, contactRadius: 0.015, strikerMat: "steel", source: "debug" });
  const w = new Vector3(), v = new Vector3();
  tIsl.body!.getAngularVelocityToRef(w);
  tIsl.body!.getLinearVelocityToRef(v);
  out.nanStrike = { r, w: [w.x, w.y, w.z], v: [v.x, v.y, v.z], dents: tIsl.parts.map((p) => p.dents.length), cracks: tIsl.parts.map((p) => p.cracks.length), dmg: tIsl.parts.map((p) => p.dmg.map((x) => x.p)) };
  sim.step(30);
  out.nanAfter = d.positionOf(tableId);

  // landing cascades: drop items from table height (0.75 m) and count fractures/pieces
  const drop = (def: AssemblyDef, h: number, x: number) => {
    const f0 = sim.ev.fracture ?? 0;
    const id = d.spawn({ ...def, startAsleep: false } as AssemblyDef, { p: { x, y: h, z: -5 }, q: qaxisAngle({ x: 1, y: 0, z: 0.3 }, 0.4) });
    sim.step(180);
    const a = d.assembly(id)!;
    return { fractures: (sim.ev.fracture ?? 0) - f0, islands: a.islands.size, parts: a.parts.size, mass: round([...a.islands].reduce((s, i) => s + i.mass, 0)) };
  };
  out.plank075 = drop(blockDef("softwood", { x: 0.6, y: 0.02, z: 0.1 }, "plank", "wood_pine"), 0.75, -6);
  out.plank15 = drop(blockDef("softwood", { x: 0.6, y: 0.02, z: 0.1 }, "plank", "wood_pine"), 1.5, -4);
  out.plate075 = drop(blockDef("ceramic", { x: 0.25, y: 0.012, z: 0.25 }, "plate", "ceramic_glaze"), 0.75, -2);
  out.mug075 = drop(blockDef("ceramic", { x: 0.08, y: 0.1, z: 0.08 }, "mug", "ceramic_glaze"), 0.75, 0);
  out.brick03 = drop(blockDef("ceramic", { x: 0.2, y: 0.06, z: 0.1 }, "brick"), 0.3, 2);
  out.glassSheet05 = drop(blockDef("glass", { x: 0.3, y: 0.004, z: 0.3 }, "glass", "glass"), 0.5, 4);
  out.stats = d.stats();
  return out;
}
