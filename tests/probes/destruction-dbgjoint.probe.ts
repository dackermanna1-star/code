import { Vector3 } from "@babylonjs/core";
import { makeSim, floorDef, doorDef, round } from "./destruction-util.ts";

export async function probe() {
  const sim = await makeSim();
  const { d, physics } = sim;
  d.spawn(floorDef(), { p: { x: 0, y: 0, z: 0 }, q: { x: 0, y: 0, z: 0, w: 1 } });
  const doorId = d.spawn(doorDef({ latch: 40 }), { p: { x: 0, y: 0, z: 2 }, q: { x: 0, y: 0, z: 0, w: 1 } });
  const door = d.assembly(doorId)!;
  const slab = door.byName.get("slab")!;
  const sIsl = slab.island!;
  const g = [...door.groups.values()][0];
  sim.step(30);
  const log: unknown[] = [];
  const hk = (physics as any).hk;
  for (let i = 0; i < 120; i++) {
    const p = d.world.toWorldVec(sIsl, { x: 0.3, y: 1.0, z: 0.02 });
    const F = new Vector3(0, 60, -450);
    sIsl.body!.applyForce(F, new Vector3(p.x, p.y, p.z));
    sim.step(1);
    const jc = g.constraints[0];
    const r = hk.HP_Constraint_GetAppliedImpulses((jc.c as any)._pluginData[0]);
    if (i % 10 === 0) log.push({ i, ang: round(d.joints.coordinate(g)! * 57.3, 100), lin: r[1].map((x: number) => round(x, 1000)), angI: r[2].map((x: number) => round(x, 1000)), sF: round(jc.fEma), sA: round(jc.tAxisEma), sP: round(jc.tPerpEma), latched: jc.latched, latch: round(g.latch!.health), awake: physics.isAwake(sIsl.body!) });
  }
  return { log, mass: sIsl.mass, substeps: (physics as any).substeps };
}
