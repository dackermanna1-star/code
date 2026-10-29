// THROWAWAY review probe: oven door full open vs storage drawer.
import { Vector3 } from "@babylonjs/core";
import { makeSim, floorDef, round } from "./destruction-util.ts";
import { KITCHEN_OBJECTS as K } from "../../src/objects/kitchen/index.ts";
const I = { x: 0, y: 0, z: 0, w: 1 };
export async function probe(): Promise<unknown> {
  const sim = await makeSim({ camPos: new Vector3(0.9, 0.5, 1.0), camTarget: new Vector3(0, 0.15, 0.3) });
  const { d } = sim;
  d.spawn(floorDef(8), { p: { x: 0, y: 0, z: 0 }, q: I });
  const id = d.spawn({ ...K.range({ towel: false }), startAsleep: false }, { p: { x: 0, y: 0, z: 0 }, q: I });
  sim.step(20);
  const asm = d.assembly(id)!;
  const door = asm.byName.get("door_top")!.island!;
  const drw = asm.byName.get("drawer_l")!.island!;
  const gd = [...asm.groups.values()].find((g: any) => g.constraints.some((c: any) => c.moving === door)) as any;
  const gw = [...asm.groups.values()].find((g: any) => g.constraints.some((c: any) => c.moving === drw)) as any;
  d.joints.release(gd);
  const tr: Array<[number, number]> = [];
  { const c = d.world.toWorldVec(door, door.com); d.use(door.body!, new Vector3(c.x, c.y + 0.2, c.z), new Vector3(c.x, 1.6, 1.5)); }
  for (let i = 0; i < 300; i++) { sim.step(1); if (i % 30 === 0) tr.push([round(((d.joints.coordinate(gd) ?? 0) * 180) / Math.PI, 10), round(d.joints.coordinate(gw) ?? 0, 1000)]); }
  await sim.renderReady(3);
  return { doorDeg_drawerSlide: tr, ev: sim.ev, log: sim.log.filter((l) => l.type !== 'damage').map((l) => ({ t: round(l.t, 100), type: l.type, ev: JSON.stringify(l.ev, (k, v) => (typeof v === 'object' && v && ('scene' in v || 'body' in v || 'parts' in v) ? '[obj]' : v)).slice(0, 400) })) };
}
