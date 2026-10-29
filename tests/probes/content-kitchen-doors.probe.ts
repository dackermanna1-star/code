// Appliance door / drawer probe for the kitchen: spawns the north run, dishwasher (with its dishes),
// range (with its cookware) and fridge (with its groceries) from the real kitchen layout on a
// concrete test floor, then works every door and drawer the way the player does (E = `use()` on
// the moving part) and reports how far each one travels, whether it reached its limit, and every
// bond break / fracture on the way (opening the oven once tore the storage drawer off its runners;
// the dishwasher door once stalled at ~27°).
// Run: node tests/probe.mjs tests/probes/content-kitchen-doors.probe.ts --timeout 600000 --screenshot /tmp/claude-0/content-kitchen-doors.png

import { Vector3 } from "@babylonjs/core";
import { makeSim, floorDef, round } from "./destruction-util.ts";
import { kitchenLayout } from "../../src/world/furnish/kitchen.ts";
import { qrot } from "../../src/geom/vec.ts";
import type { Assembly, Island, JointGroup } from "../../src/destruction/runtime/types.ts";

const I = { x: 0, y: 0, z: 0, w: 1 };
const DEG = 180 / Math.PI;

export async function probe(): Promise<unknown> {
  const sim = await makeSim({ camPos: new Vector3(6.4, 1.5, 5.6), camTarget: new Vector3(6.9, 0.6, 8.3) });
  const { d } = sim;
  d.spawn(floorDef(12), { p: { x: 6.6, y: 0, z: 7 }, q: I });
  const L = kitchenLayout();
  const roots = new Set(["kitchenNorthRun", "dishwasher", "range", "fridge"]);
  const keep = (i: number): boolean => {
    let k = i;
    while (L.on[k] >= 0) k = L.on[k];
    return roots.has(L.placements[k].type);
  };
  const ids = new Map<string, number>();
  const front = new Map<number, { x: number; y: number; z: number }>();
  L.placements.forEach((p, i) => {
    if (!keep(i)) return;
    const id = d.spawn({ ...p.def, startAsleep: false }, p.xf);
    if (roots.has(p.type)) {
      ids.set(p.type, id);
      front.set(id, qrot(p.xf.q, { x: 0, y: 0, z: 1 }));
    }
  });
  sim.step(90); // settle
  const l0 = sim.log.length;
  const coord = (g: JointGroup): number => d.joints.coordinate(g) ?? NaN;
  const use = (asmId: number, g: JointGroup): boolean => {
    const isl = g.constraints[0].moving as Island;
    const c = d.world.toWorldVec(isl, isl.com);
    const f = front.get(asmId)!;
    const p = new Vector3(c.x, c.y + 0.05, c.z);
    return d.use(isl.body!, p, new Vector3(c.x + f.x * 0.9, 1.6, c.z + f.z * 0.9));
  };
  const out: Record<string, unknown> = {};
  const summary: string[] = [];
  for (const type of ["range", "dishwasher", "fridge"]) {
    const id = ids.get(type)!;
    const asm = d.assembly(id) as Assembly;
    const groups = [...asm.groups.values()];
    const res: Array<Record<string, unknown>> = [];
    // doors first (racks/drawers behind them need them open), then everything that slides
    for (const g of [...groups.filter((x) => x.kind === "hinge"), ...groups.filter((x) => x.kind === "slider")]) {
      const lim = g.def.max;
      const used = use(id, g);
      const tr: number[] = [];
      let best = 0;
      const steps = g.kind === "hinge" ? 150 : 90;
      for (let i = 0; i < steps; i++) {
        sim.step(1);
        const x = coord(g);
        if (Number.isFinite(x)) best = Math.max(best, x);
        if (i % 15 === 14) tr.push(g.kind === "hinge" ? round(x * DEG, 10) : round(x, 1000));
      }
      const end = coord(g);
      const frac = best / lim; // furthest travel (a door left free may swing back a little afterwards)
      const name = [...(g.constraints[0].moving as Island).parts][0].name;
      res.push({ g: name, kind: g.kind, used, limit: g.kind === "hinge" ? round(lim * DEG, 10) : lim, max: g.kind === "hinge" ? round(best * DEG, 10) : round(best, 1000), end: g.kind === "hinge" ? round(end * DEG, 10) : round(end, 1000), reached: round(frac, 100), trace: tr });
      summary.push(`${type}.${name}: ${(frac * 100).toFixed(0)}% of limit${frac < 0.8 ? "  <-- SHORT" : ""}`);
    }
    out[type] = res;
  }
  const breaks = sim.log.slice(l0).filter((l) => l.type === "bondBreak" || l.type === "fracture" || l.type === "split");
  const fmt = (l: { t: number; type: string; ev: unknown }): string => {
    const e = l.ev as Record<string, unknown>;
    const pos = e.pos as { x: number; y: number; z: number } | undefined;
    return `${l.t.toFixed(2)} ${l.type} ${e.kind ?? ""} ${e.mat ?? ""}${pos ? ` @${pos.x.toFixed(2)},${pos.y.toFixed(2)},${pos.z.toFixed(2)}` : ""}`;
  };
  await sim.renderReady(3);
  return { summary, bondBreaks: breaks.filter((l) => l.type === "bondBreak").length, fractures: breaks.filter((l) => l.type === "fracture").length, breakLog: breaks.slice(0, 20).map(fmt), dents: sim.log.slice(l0).filter((l) => l.type === "dent").length, detail: out };
}
