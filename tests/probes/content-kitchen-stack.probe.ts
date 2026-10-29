// Stability probe for nested dishware: a lone plate, plate/bowl stacks on a concrete floor and a
// plate stack in a wall cabinet, all spawned awake; reports drift, breakage and the at-rest event
// log (material, energy) so resting contacts that damage thin ceramic show up.
// Run: node tests/probe.mjs tests/probes/content-kitchen-stack.probe.ts --timeout 300000

import { Vector3 } from "@babylonjs/core";
import { makeSim, floorDef, round } from "./destruction-util.ts";
import { KITCHEN_OBJECTS as K } from "../../src/objects/kitchen/index.ts";
import { nestPitch } from "../../src/world/furnish/kitchen.ts";
import type { AssemblyDef } from "../../src/destruction/model/types.ts";

const I = { x: 0, y: 0, z: 0, w: 1 };

export async function probe(): Promise<unknown> {
  const sim = await makeSim({ camPos: new Vector3(0.6, 1.0, 1.4), camTarget: new Vector3(0, 0.2, 0) });
  const { d } = sim;
  d.spawn(floorDef(6), { p: { x: 0, y: 0, z: 0 }, q: I });
  const awake = (def: AssemblyDef): AssemblyDef => ({ ...def, startAsleep: false });
  const ids: Array<[string, number]> = [];
  const put = (name: string, def: AssemblyDef, x: number, y: number, z: number): void => {
    ids.push([name, d.spawn(awake(def), { p: { x, y, z }, q: I })]);
  };
  put("lonePlate", K.plate({ seed: 1 }), -0.6, 0.0005, 0);
  const pp = nestPitch(K.plate({ seed: 2 }));
  for (let k = 0; k < 5; k++) put(`plate${k}`, K.plate({ seed: 10 + k }), -0.2, 0.0005 + k * pp, 0);
  const pb = nestPitch(K.bowl({ seed: 2 }));
  for (let k = 0; k < 3; k++) put(`bowl${k}`, K.bowl({ seed: 20 + k }), 0.2, 0.0005 + k * pb, 0);
  const ps = nestPitch(K.sidePlate({ seed: 2 }));
  for (let k = 0; k < 4; k++) put(`side${k}`, K.sidePlate({ seed: 30 + k }), 0.6, 0.0005 + k * ps, 0);
  // the same stacks inside a wall cabinet hung at 1.45 m (static: screwed to the "wall")
  const cab = K.kitchenWallCabinet({ w: 0.8, doors: 2, seed: 5 });
  const floorY = Math.max(...cab.parts.find((q) => q.name === "car_bottom")!.poly.verts.map((v) => v.y));
  const shelfY = Math.max(...cab.parts.find((q) => q.name === "car_shelf0")!.poly.verts.map((v) => v.y));
  const CZ = 1.0,
    CY = 1.45;
  put("cabinet", cab, 0, CY, CZ);
  for (let k = 0; k < 5; k++) put(`cabPlate${k}`, K.plate({ seed: 40 + k }), -0.19, CY + floorY + 0.0005 + k * pp, CZ);
  for (let k = 0; k < 4; k++) put(`cabSide${k}`, K.sidePlate({ seed: 50 + k }), 0.2, CY + floorY + 0.0005 + k * ps, CZ);
  for (let k = 0; k < 3; k++) put(`cabBowl${k}`, K.bowl({ seed: 60 + k }), -0.18, CY + shelfY + 0.0005 + k * pb, CZ - 0.005);
  const t0 = sim.log.length;
  const start = ids.map(([, id]) => d.positionOf(id));
  sim.step(180);
  const drift: Record<string, number> = {};
  ids.forEach(([n, id], j) => {
    const a = start[j],
      b = d.positionOf(id);
    drift[n] = a && b ? round(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z), 10000) : -1;
  });
  const evs = sim.log.slice(t0).filter((l) => l.type !== "damage").slice(0, 40).map((l) => {
    const e = l.ev as Record<string, unknown>;
    const pos = e.pos as { x: number; y: number; z: number } | undefined;
    return `${l.t.toFixed(2)} ${l.type} ${e.mat ?? `${e.matA ?? ""}/${e.matB ?? ""}`} E=${typeof e.energy === "number" ? (e.energy as number).toFixed(3) : "?"} ${pos ? `@${pos.x.toFixed(2)},${pos.y.toFixed(3)},${pos.z.toFixed(2)}` : ""} ${e.kind ?? ""}`;
  });
  const list = d.list().filter((a) => a.damage > 0 || a.islands > 1).map((a) => ({ name: a.type, islands: a.islands, damage: round(a.damage) }));
  await sim.renderReady(3);
  return { pitch: { plate: round(pp, 1e5), bowl: round(pb, 1e5), side: round(ps, 1e5) }, drift, counts: sim.ev, events: evs, broken: list };
}
