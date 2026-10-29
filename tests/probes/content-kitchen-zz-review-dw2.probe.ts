// THROWAWAY review probe: dishwasher door variants.
import { Vector3 } from "@babylonjs/core";
import { makeSim, floorDef, round } from "./destruction-util.ts";
import { KITCHEN_OBJECTS as K } from "../../src/objects/kitchen/index.ts";
const I = { x: 0, y: 0, z: 0, w: 1 };
function strip(def: any, pred: (n: string) => boolean) {
  const parts = def.parts.filter((p: any) => !pred(p.name));
  const names = new Set(parts.map((p: any) => p.name));
  return { ...def, parts, bonds: def.bonds.filter((b: any) => names.has(b.a) && (b.b === "world" || names.has(b.b))), features: (def.features ?? []).filter((f: any) => names.has(f.part)) };
}
export async function probe(): Promise<unknown> {
  const sim = await makeSim({ camPos: new Vector3(1.4, 1.0, 1.4), camTarget: new Vector3(0, 0.4, 0.2) });
  const { d } = sim;
  d.spawn(floorDef(16), { p: { x: 0, y: 0, z: 0 }, q: I });
  const base = K.dishwasher();
  const shift = (def: any, pred: (n: string) => boolean, dz: number) => ({ ...def, parts: def.parts.map((p: any) => (pred(p.name) ? { ...p, poly: { ...p.poly, verts: p.poly.verts.map((v: any) => ({ x: v.x, y: v.y, z: Math.min(v.z, 0.215 + dz) })) } } : p)) });
  const variants: Record<string, any> = {
    orig: base,
    elevated: base,
    elevatedFull: base,
    lowFloor: base,
  };
  const out: Record<string, unknown> = {};
  let x = -3;
  const runs: Array<[string, number]> = [];
  for (const [n, def] of Object.entries(variants)) { const y = n.startsWith("elevated") ? 0.3 : 0; runs.push([n, d.spawn({ ...def, startAsleep: false }, { p: { x, y, z: 0 }, q: I })]); if (n === "elevated") d.spawn(floorDef(0.8), { p: { x, y: 0.3, z: -0.2 }, q: I }); if (n === "elevatedFull") d.spawn(floorDef(1.0), { p: { x, y: 0.3, z: 0.3 }, q: I }); x += 1.2; }
  sim.step(30);
  const gs = runs.map(([n, id]) => {
    const asm = d.assembly(id)!;
    const isl = asm.byName.get("door_rail_l")!.island!;
    const g = [...asm.groups.values()].find((gg: any) => gg.kind === "hinge") as any;
    d.joints.release(g);
    return { n, g, isl };
  });
  const tr: Record<string, number[]> = {};
  for (let i = 0; i < 180; i++) {
    for (const { n, g, isl } of gs) {
      if (i === 0) { const c = d.world.toWorldVec(isl, isl.com); isl.body!.applyImpulse(new Vector3(0, 0, 3), new Vector3(c.x, c.y + 0.2, c.z)); }
    }
    sim.step(1);
    if (i % 15 === 0) for (const { n, g } of gs) (tr[n] ??= []).push(round(((d.joints.coordinate(g) ?? NaN) * 180) / Math.PI, 10));
  }
  out.trace = tr;
  out.geo = runs.map(([n, id]) => {
    const asm = d.assembly(id)!;
    const door = asm.byName.get("door_rail_l")!.island!;
    const body = asm.byName.get("side_l")!.island!;
    let lo = Infinity, loName = "", hiZ = -Infinity;
    for (const p of door.parts as any) for (const v of p.poly.verts) { const w = d.world.toWorldVec(door, v); if (w.y < lo) { lo = w.y; loName = p.name; } }
    let blo = Infinity; for (const p of body.parts as any) for (const v of p.poly.verts) { const w = d.world.toWorldVec(body, v); blo = Math.min(blo, w.y); }
    const q = body.node.rotationQuaternion!;
    const pv = d.world.toWorldVec(body, { x: -0.286, y: 0.075, z: 0.215 });
    return { n, doorLowY: round(lo, 1000), loName, bodyLowY: round(blo, 1000), bodyQ: [q.x, q.y, q.z, q.w].map((x) => round(x, 1000)), pivotWorld: [pv.x, pv.y, pv.z].map((x) => round(x, 1000)), doorIslandOffsetFromAsm: round(door.node.position.y, 1000) };
  });
  out.cons = gs.map(({ n, g }) => ({ n, c: g.constraints.map((c: any) => ({ sig: c.sig, off: round(c.offset, 1000), lat: c.latched, havok: round(((d.world.physics as any).hingeAngle(c.c) * 180) / Math.PI, 10) })), min: g.def.min, max: g.def.max, released: g.released }));
  {
    const rid = d.spawn({ ...K.range({ towel: false }), startAsleep: false }, { p: { x: 3, y: 0, z: 0 }, q: I });
    sim.step(20);
    const ra = d.assembly(rid)!;
    const rg = [...ra.groups.values()].find((gg: any) => gg.kind === "hinge") as any;
    d.joints.release(rg);
    const isl = ra.byName.get("door_top")!.island!;
    const c = d.world.toWorldVec(isl, isl.com); isl.body!.applyImpulse(new Vector3(0, 0, 3), new Vector3(c.x, c.y + 0.2, c.z));
    const rt: number[] = [];
    for (let i = 0; i < 180; i++) { sim.step(1); if (i % 15 === 0) rt.push(round(((d.joints.coordinate(rg) ?? NaN) * 180) / Math.PI, 10)); }
    out.rangeTrace = rt;
    out.rangeCons = rg.constraints.map((c: any) => ({ sig: c.sig, off: c.offset, havok: round(((d.world.physics as any).hingeAngle(c.c) * 180) / Math.PI, 10) }));
  }
  out.ev = sim.ev;
  await sim.renderReady(3);
  return out;
}
