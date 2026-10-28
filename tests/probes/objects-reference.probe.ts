// Visual + stability probe for the reference objects: spawns microwave, chair, coffee table and
// mug (with the mug on the table and the microwave on the floor) in the real physics/destruction
// runtime, lets them settle and reports drift/islands; the screenshot shows them at rest.
// Usage: node tests/probe.mjs tests/probes/objects-reference.probe.ts --screenshot /tmp/claude-0/objects-ref.png
// Optional: window.__probeArgs = { view: "microwave" } before load is not supported by the
// harness, so the view is chosen with the VIEW constant below.
import { Vector3 } from "@babylonjs/core";
import { makeSim, floorDef } from "./destruction-util.ts";
import { buildMicrowave } from "../../src/objects/reference/microwave.ts";
import { buildChair } from "../../src/objects/reference/chair.ts";
import { buildCoffeeTable } from "../../src/objects/reference/coffeeTable.ts";
import { buildMug } from "../../src/objects/reference/mug.ts";
import { qeuler } from "../../src/geom/vec.ts";

const VIEW: "overview" | "microwave" | "microwaveOpen" = "overview";

export async function probe() {
  const views = {
    overview: { pos: new Vector3(1.2, 1.5, 2.9), target: new Vector3(-0.2, 0.3, 0.1) },
    microwave: { pos: new Vector3(1.25, 0.6, 1.25), target: new Vector3(0.8, 0.15, 0.35) },
    microwaveOpen: { pos: new Vector3(1.4, 0.55, 1.2), target: new Vector3(0.8, 0.15, 0.3) },
  };
  const v = views[VIEW];
  const sim = await makeSim({ camPos: v.pos, camTarget: v.target });
  const { d } = sim;
  const I = { x: 0, y: 0, z: 0, w: 1 };
  d.spawn(floorDef(), { p: { x: 0, y: 0, z: 0 }, q: I });
  // well separated: assemblies must not interpenetrate at spawn
  const table = d.spawn(buildCoffeeTable(), { p: { x: -0.45, y: 0, z: -0.3 }, q: I });
  const mug = d.spawn(buildMug(), { p: { x: -0.25, y: 0.44, z: -0.2 }, q: qeuler(0, 0.6, 0) });
  const chair = d.spawn(buildChair(), { p: { x: -1.45, y: 0, z: 0.7 }, q: qeuler(0, 2.4, 0) });
  const mw = d.spawn(buildMicrowave(), { p: { x: 0.8, y: 0, z: 0.3 }, q: qeuler(0, -0.5, 0) });
  const ids = { table, mug, chair, mw };
  const start: Record<string, { x: number; y: number; z: number } | null> = {};
  for (const [k, id] of Object.entries(ids)) start[k] = d.positionOf(id);
  sim.step(120);
  if (VIEW === "microwaveOpen") {
    // pull the door open with the use action at the handle
    const asm = d.assembly(mw)!;
    const handle = asm.byName.get("door_handle")!;
    const isl = handle.island!;
    const hp = d.world.toWorldVec(isl, { x: 0.0945, y: 0.155, z: 0.2 });
    d.use(isl.body!, new Vector3(hp.x, hp.y, hp.z), new Vector3(hp.x + 0.5, hp.y + 0.3, hp.z + 0.8));
    sim.step(90);
  }
  const drift: Record<string, number> = {};
  for (const [k, id] of Object.entries(ids)) {
    const a = start[k],
      b = d.positionOf(id);
    drift[k] = a && b ? Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) : -1;
  }
  await sim.renderReady(3);
  const list = d.list().map((a) => ({ name: a.name, islands: a.islands, parts: a.parts, damage: +a.damage.toFixed(3) }));
  return { view: VIEW, drift, list, events: sim.ev, stats: d.stats(), counts: sim.counts() };
}
