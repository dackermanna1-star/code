// Damage-path probe: strikes and collisions through the real damage model → fracture plans
// applied by the runtime (local breakouts, global shatters, splinters), splits, chips/micro
// debris, dents, fatigue, thrown objects, budget/perf numbers and a leak check.
import { Vector3 } from "@babylonjs/core";
import { makeSim, floorDef, tableDef, paneDef, blockDef, boxPart, round } from "./destruction-util.ts";
import type { StrikeInput } from "../../src/core/context.ts";
import type { AssemblyDef } from "../../src/destruction/model/types.ts";

const I = { x: 0, y: 0, z: 0, w: 1 };

function sheetDef(): AssemblyDef {
  // a 0.5 × 0.4 × 1 mm steel appliance panel welded to a static frame bar
  return {
    type: "testSheet",
    name: "Steel Panel",
    category: "appliance",
    value: 80,
    parts: [
      boxPart("panel", "steelSheet", "metal_painted", { x: 0.5, y: 0.4, z: 0.001 }, { x: 0, y: 0.6, z: 0 }, { tessCell: 0.04 }),
      boxPart("bar", "steel", "metal_raw", { x: 0.5, y: 0.03, z: 0.03 }, { x: 0, y: 0.385, z: 0.0155 }),
    ],
    bonds: [
      { a: "panel", b: "bar", kind: "weld", strength: 140 },
      { a: "bar", b: "world", kind: "bolt", strength: 5000, anchor: { x: 0, y: 0.37, z: 0.0155 } },
    ],
  };
}

export async function probe() {
  const sim = await makeSim();
  const { d, physics } = sim;
  const out: Record<string, unknown> = {};
  const base = sim.counts();
  const floorId = d.spawn(floorDef(), { p: { x: 0, y: 0, z: 0 }, q: I });
  const tableId = d.spawn(tableDef(), { p: { x: -1.2, y: 0, z: 0 }, q: I });
  const paneId = d.spawn(paneDef(), { p: { x: 1.2, y: 0.9, z: 0.5 }, q: I });
  const sheetId = d.spawn(sheetDef(), { p: { x: 0, y: 0, z: -1.5 }, q: I });
  sim.step(20);

  const strikeAt = (asmId: number, local: { x: number; y: number; z: number }, dir: Vector3, mass: number, speed: number, r: number, sharp = 1, mat: StrikeInput["strikerMat"] = "steel") => {
    const asm = d.assembly(asmId)!;
    // pick the island containing the part nearest to the local point
    let best = [...asm.islands][0];
    let bestD = Infinity;
    for (const isl of asm.islands)
      for (const p of isl.parts) {
        const dd = (p.centroid.x - local.x) ** 2 + (p.centroid.y - local.y) ** 2 + (p.centroid.z - local.z) ** 2;
        if (dd < bestD) {
          bestD = dd;
          best = isl;
        }
      }
    const wp = d.world.toWorldVec(best, local);
    const t0 = performance.now();
    const res = d.strike({ point: new Vector3(wp.x, wp.y, wp.z), dir, body: best.body!, childIndex: -1, mass, speed, sharpness: sharp, contactRadius: r, strikerMat: mat, source: "debug" });
    return { ...res, ms: round(performance.now() - t0, 100) };
  };

  // ---- glass: hammer at the pane centre → shatter
  const ev0 = { ...sim.ev };
  const g = strikeAt(paneId, { x: 0, y: 0.55, z: -0.002 }, new Vector3(0, 0, 1), 0.9, 11, 0.015);
  sim.step(5);
  const pane = d.assembly(paneId)!;
  out.glassHammer = { strike: g, islands: pane.islands.size, parts: pane.parts.size, fractures: (sim.ev.fracture ?? 0) - (ev0.fracture ?? 0), micro: sim.vfx.microCount, lastFracture: sim.last.fracture };
  sim.step(60);
  out.glassAfter = { islands: pane.islands.size, dynamic: [...pane.islands].filter((i) => !i.isStatic).length, debris: d.stats().debrisIslands };

  // ---- table: repeated hammer blows at one spot (fatigue) then a charged sledge blow
  const table = d.assembly(tableId)!;
  const hammerLog = [];
  for (let i = 0; i < 8; i++) {
    const r = strikeAt(tableId, { x: 0.1, y: 0.75, z: 0.05 }, new Vector3(0, -1, 0), 0.9, 11, 0.015);
    hammerLog.push({ e: round(r.energy, 10), broke: r.broke, parts: table.parts.size, cracks: (sim.ev.crack ?? 0), ms: r.ms });
    sim.step(6);
  }
  out.tableHammer = hammerLog;
  const sl = strikeAt(tableId, { x: -0.2, y: 0.75, z: 0 }, new Vector3(0, -1, 0), 6, 8.5, 0.03);
  sim.step(90);
  out.tableSledge = { strike: sl, islands: table.islands.size, parts: table.parts.size, lastFracture: sim.last.fracture };

  // ---- steel sheet: hammer → dent, repeated → deeper / weld damage
  const sheet = d.assembly(sheetId)!;
  const dents = [];
  for (let i = 0; i < 6; i++) {
    const r = strikeAt(sheetId, { x: 0.05, y: 0.62, z: -0.0005 }, new Vector3(0, 0, 1), 0.9, 11, 0.015);
    const panel = [...sheet.parts].find((p) => p.name === "panel");
    dents.push({ e: round(r.energy, 10), dents: panel?.dents.length ?? -1, depth: panel ? round(Math.max(0, ...panel.dents.map((x) => x.depth)) * 1000, 10) : -1, weld: panel ? round(panel.bonds.find((b) => b.kind === "weld")?.health ?? -1, 10) : -1, broke: r.broke });
    sim.step(4);
  }
  out.sheet = { dents, dentEvents: sim.ev.dent ?? 0, islands: sheet.islands.size };

  // ---- drop: ceramic block from 1.2 m onto concrete
  const mugId = d.spawn(blockDef("ceramic", { x: 0.09, y: 0.1, z: 0.09 }, "Ceramic Block", "ceramic_glaze"), { p: { x: 0.6, y: 1.2, z: 0.8 }, q: I });
  const mug = d.assembly(mugId)!;
  physics.wake([...mug.islands][0].body!);
  const imp0 = sim.ev.impact ?? 0;
  sim.step(90);
  out.drop = { impacts: (sim.ev.impact ?? 0) - imp0, islands: mug.islands.size, parts: mug.parts.size, lastImpact: sim.last.impact };

  // ---- thrown brick into a second pane (collision-driven fracture)
  const pane2Id = d.spawn(paneDef(), { p: { x: -0.2, y: 0.9, z: 2.5 }, q: I });
  const brickId = d.spawn(blockDef("stone", { x: 0.2, y: 0.06, z: 0.1 }, "Brick", "granite"), { p: { x: -0.2, y: 1.45, z: 1.2 }, q: I });
  const brick = [...d.assembly(brickId)!.islands][0];
  physics.wake(brick.body!);
  brick.body!.setLinearVelocity(new Vector3(0, 1.0, 9));
  const pane2 = d.assembly(pane2Id)!;
  sim.step(60);
  out.thrown = { paneIslands: pane2.islands.size, paneParts: pane2.parts.size, fractures: sim.ev.fracture ?? 0 };

  out.stats = d.stats();
  out.events = { ...sim.ev };
  out.vfx = { micros: sim.vfx.micros, bursts: sim.vfx.bursts };
  // ---- perf: per-step destruction ms over a settling period
  let maxMs = 0,
    sum = 0;
  for (let i = 0; i < 60; i++) {
    sim.step(1);
    const ms = d.stats().msLastStep;
    sum += ms;
    maxMs = Math.max(maxMs, ms);
  }
  out.perf = { avgMs: round(sum / 60, 1000), maxMs: round(maxMs, 1000) };
  for (const id of [floorId, tableId, paneId, sheetId, mugId, pane2Id, brickId]) d.despawn(id);
  sim.step(2);
  const fin = sim.counts();
  out.leak = Object.fromEntries(Object.entries(fin).map(([k, v]) => [k, v - (base as Record<string, number>)[k]]));
  return out;
}
