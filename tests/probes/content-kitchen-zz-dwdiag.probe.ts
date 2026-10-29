// THROWAWAY diagnostic: dishwasher door stall — who touches the door island at the stall?
import { Vector3 } from "@babylonjs/core";
import { makeSim, floorDef, round } from "./destruction-util.ts";
import { KITCHEN_OBJECTS as K } from "../../src/objects/kitchen/index.ts";
const I = { x: 0, y: 0, z: 0, w: 1 };
export async function probe(): Promise<unknown> {
  const sim = await makeSim({ camPos: new Vector3(1.4, 1.0, 1.4), camTarget: new Vector3(0, 0.4, 0.2) });
  const { d } = sim;
  const floorId = d.spawn(floorDef(8), { p: { x: 0, y: 0, z: 0 }, q: I });
  const id = d.spawn({ ...K.dishwasher(), startAsleep: false }, { p: { x: 0, y: 0, z: 0 }, q: I });
  sim.step(30);
  const asm = d.assembly(id)!;
  const isl = asm.byName.get("door_controls")!.island!;
  const g = [...asm.groups.values()].find((gg: any) => gg.constraints.some((c: any) => c.moving === isl)) as any;
  const names = new Map<any, string>();
  for (const a of [d.assembly(id)!, d.assembly(floorId)!]) for (const p of (a as any).byName.values()) if (p.island?.body) names.set(p.island.body, `${a.type}:${[...p.island.parts][0].name}`);
  const contacts: Record<string, number> = {};
  let rec = false;
  (d.world.physics as any).onImpact((e: any) => {
    if (!rec) return;
    if (e.bodyA !== isl.body && e.bodyB !== isl.body) return;
    const o = e.bodyA === isl.body ? e.bodyB : e.bodyA;
    const k = `${names.get(o) ?? "?"} @${round(e.point.x, 1000)},${round(e.point.y, 1000)},${round(e.point.z, 1000)} imp=${round(e.impulse, 1000)}`;
    contacts[k] = (contacts[k] ?? 0) + 1;
  });
  const c = d.world.toWorldVec(isl, isl.com);
  const used = d.use(isl.body!, new Vector3(c.x, c.y + 0.2, c.z), new Vector3(c.x, 1.6, 1.5));
  const tr: number[] = [];
  for (let i = 0; i < 180; i++) {
    if (i === 120) rec = true;
    sim.step(1);
    if (i % 15 === 0) tr.push(round(((d.joints.coordinate(g) ?? NaN) * 180) / Math.PI, 10));
  }
  const ph: any = d.world.physics;
  return { used, tr, contacts: Object.entries(contacts).slice(0, 30), awake: ph.isAwake(isl.body), mass: isl.mass, released: g.released, latched: g.constraints.map((x: any) => x.latched), stats: ph.debugStats?.() };
}
