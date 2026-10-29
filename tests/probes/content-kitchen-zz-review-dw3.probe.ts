// THROWAWAY review probe: dishwasher/oven door opened with the player's use() in the kitchen layout.
import { Vector3 } from "@babylonjs/core";
import { makeSim, floorDef, round } from "./destruction-util.ts";
import { kitchenLayout } from "../../src/world/furnish/kitchen.ts";
const I = { x: 0, y: 0, z: 0, w: 1 };
export async function probe(): Promise<unknown> {
  const sim = await makeSim({ camPos: new Vector3(5.5, 1.5, 6.6), camTarget: new Vector3(5.5, 0.4, 8.2) });
  const { d } = sim;
  d.spawn(floorDef(12), { p: { x: 6.6, y: 0, z: 7 }, q: I });
  const L = kitchenLayout();
  const ids: Record<string, number> = {};
  L.placements.forEach((p, i) => { if (["kitchenNorthRun", "dishwasher", "range", "fridge"].includes(p.type)) ids[p.type] = d.spawn({ ...p.def, startAsleep: false }, p.xf); });
  sim.step(30);
  const out: Record<string, unknown> = {};
  for (const [type, part] of [["dishwasher", "door_controls"], ["range", "door_top"], ["fridge", "fr_skin"]] as const) {
    const asm = d.assembly(ids[type])!;
    const isl = asm.byName.get(part)!.island!;
    const g = [...asm.groups.values()].find((gg: any) => gg.constraints.some((c: any) => c.moving === isl)) as any;
    const c = d.world.toWorldVec(isl, isl.com);
    const used = d.use(isl.body!, new Vector3(c.x, c.y + 0.2, c.z), new Vector3(c.x, 1.6, 6.8));
    const tr: number[] = [];
    for (let i = 0; i < 150; i++) { sim.step(1); if (i % 15 === 0) tr.push(round(((d.joints.coordinate(g) ?? NaN) * 180) / Math.PI, 10)); }
    out[type] = { used, tr };
  }
  await sim.renderReady(3);
  return out;
}
