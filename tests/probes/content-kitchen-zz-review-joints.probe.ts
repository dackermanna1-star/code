// THROWAWAY review probe: drive appliance doors open and report the max angle reached.
import { Vector3 } from "@babylonjs/core";
import { makeSim, floorDef, round } from "./destruction-util.ts";
import { KITCHEN_OBJECTS as K } from "../../src/objects/kitchen/index.ts";

const I = { x: 0, y: 0, z: 0, w: 1 };

export async function probe(): Promise<unknown> {
  const sim = await makeSim({ camPos: new Vector3(0.0, 1.4, 2.6), camTarget: new Vector3(0, 0.5, 0) });
  const { d } = sim;
  d.spawn(floorDef(12), { p: { x: 0, y: 0, z: 0 }, q: I });
  const out: Record<string, unknown> = {};
  const specs: Array<[string, any, number, string[]]> = [
    ["range", K.range({ towel: false }), -1.5, ["door_top", "drawer_front"]],
    ["dishwasher", K.dishwasher(), 0, ["door_controls"]],
    ["fridge", K.fridge(), 1.5, ["fr_skin", "fz_skin", "crisper0_bot"]],
  ];
  const ids: Record<string, number> = {};
  for (const [n, def, x] of specs) ids[n] = d.spawn({ ...def, startAsleep: false }, { p: { x, y: 0, z: 0 }, q: I });
  sim.step(30);
  for (const [n, , , parts] of specs) {
    const asm = d.assembly(ids[n])!;
    for (const pn of parts) {
      const part = asm.byName.get(pn)!;
      const isl = part.island!;
      const g = [...asm.groups.values()].find((gg: any) => gg.constraints.some((c: any) => c.moving === isl)) as any;
      if (!g) { out[`${n}.${pn}`] = "no group"; continue; }
      d.joints.release(g);
      let maxC = -Infinity;
      for (let i = 0; i < 240; i++) {
        const jc = g.constraints.find((c: any) => c.moving === isl) ?? g.constraints[0];
        const { axis, pivot } = d.joints.worldAxis(g, jc);
        const c = d.world.toWorldVec(isl, isl.com);
        if (g.kind === "hinge") {
          const r = { x: c.x - pivot.x, y: c.y - pivot.y, z: c.z - pivot.z };
          const t = { x: axis.y * r.z - axis.z * r.y, y: axis.z * r.x - axis.x * r.z, z: axis.x * r.y - axis.y * r.x };
          const l = Math.hypot(t.x, t.y, t.z) || 1;
          const F = isl.mass * 8;
          isl.body!.applyForce(new Vector3((t.x / l) * F, (t.y / l) * F, (t.z / l) * F), new Vector3(c.x, c.y, c.z));
        } else {
          const F = isl.mass * 6;
          isl.body!.applyForce(new Vector3(axis.x * F, axis.y * F, axis.z * F), new Vector3(c.x, c.y, c.z));
        }
        sim.step(1);
        const v = d.joints.coordinate(g) ?? NaN;
        if (v > maxC) maxC = v;
      }
      sim.step(30);
      const fin = d.joints.coordinate(g) ?? NaN;
      const k = g.kind === "hinge" ? 180 / Math.PI : 1;
      out[`${n}.${pn}`] = { kind: g.kind, max: round(maxC * k, 100), final: round(fin * k, 100), limit: g.def.max * (g.kind === "hinge" ? k : 1) };
    }
  }
  out.ev = sim.ev;
  sim.render.camera.position.set(-1.5, 1.0, 2.0);
  await sim.renderReady(3);
  return out;
}
