// THROWAWAY review probe: open the fridge (use) with its contents and see what the door bins keep.
import { Vector3 } from "@babylonjs/core";
import { makeSim, floorDef, round } from "./destruction-util.ts";
import { kitchenLayout } from "../../src/world/furnish/kitchen.ts";
const I = { x: 0, y: 0, z: 0, w: 1 };
export async function probe(): Promise<unknown> {
  const sim = await makeSim({ camPos: new Vector3(7.6, 1.5, 6.6), camTarget: new Vector3(8.7, 0.9, 8.2) });
  const { d } = sim;
  d.spawn(floorDef(12), { p: { x: 6.6, y: 0, z: 7 }, q: I });
  const L = kitchenLayout();
  const fi = L.placements.findIndex((p) => p.type === "fridge");
  let fid = -1;
  const items: Array<[string, number]> = [];
  L.placements.forEach((p, i) => {
    if (i === fi) fid = d.spawn({ ...p.def, startAsleep: false }, p.xf);
    else if (L.on[i] === fi) items.push([p.type, d.spawn({ ...p.def, startAsleep: false }, p.xf)]);
  });
  sim.step(60);
  const p0 = items.map(([, id]) => d.positionOf(id)!);
  const asm = d.assembly(fid)!;
  const out: Record<string, unknown> = {};
  for (const part of ["fr_skin", "fz_skin"]) {
    const isl = asm.byName.get(part)!.island!;
    const g = [...asm.groups.values()].find((gg: any) => gg.constraints.some((c: any) => c.moving === isl)) as any;
    const c = d.world.toWorldVec(isl, isl.com);
    d.use(isl.body!, new Vector3(c.x - 0.3, c.y, c.z), new Vector3(7.8, 1.6, 6.8));
    for (let i = 0; i < 150; i++) sim.step(1);
    out[part] = round(((d.joints.coordinate(g) ?? NaN) * 180) / Math.PI, 10);
  }
  const res: Record<string, unknown> = {};
  items.forEach(([t, id], j) => { const a = p0[j], b = d.positionOf(id)!; res[`${t}#${j}`] = { dy: round(b.y - a.y, 1000), moved: round(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z), 1000), y: round(b.y, 1000) }; });
  out.items = res;
  out.ev = sim.ev;
  await sim.renderReady(3);
  return out;
}
