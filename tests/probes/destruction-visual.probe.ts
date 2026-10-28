// Visual sanity probe: spawn the test assemblies and leave them on screen for the screenshot.
// Usage: node tests/probe.mjs tests/probes/destruction-visual.probe.ts --screenshot /tmp/claude-0/destruction-visual.png
import { Vector3 } from "@babylonjs/core";
import { makeSim, floorDef, tableDef, paneDef, doorDef, blockDef } from "./destruction-util.ts";

export async function probe() {
  const sim = await makeSim({ camPos: new Vector3(2.6, 2.0, -3.4), camTarget: new Vector3(0.1, 0.8, 0.6) });
  const { d } = sim;
  const I = { x: 0, y: 0, z: 0, w: 1 };
  d.spawn(floorDef(), { p: { x: 0, y: 0, z: 0 }, q: I });
  const tableId = d.spawn(tableDef(), { p: { x: -0.9, y: 0, z: 0 }, q: I });
  d.spawn(paneDef(), { p: { x: 1.0, y: 0.7, z: 0.6 }, q: I });
  const doorId = d.spawn(doorDef({ latch: 40 }), { p: { x: -0.2, y: 0, z: 2.0 }, q: I });
  for (let i = 0; i < 6; i++) d.spawn(blockDef("softwood", { x: 0.12, y: 0.06, z: 0.09 }, "Block", "wood_oak"), { p: { x: 0.3 + i * 0.16, y: 0, z: -0.9 }, q: I });
  sim.step(30);
  // open the door a bit and knock a leg off the table so the shot shows joints + splits
  const door = d.assembly(doorId)!;
  const sIsl = door.byName.get("slab")!.island!;
  const hp = d.world.toWorldVec(sIsl, { x: 0.3, y: 1.0, z: 0 });
  d.use(sIsl.body!, new Vector3(hp.x, hp.y, hp.z), new Vector3(hp.x, 1.6, hp.z + 1));
  const table = d.assembly(tableId)!;
  const leg = table.byName.get("leg3")!;
  for (const b of leg.bonds.slice()) d.world.breakBond(b);
  d.world.flushTopology();
  sim.step(45);
  await sim.renderReady(3);
  return { stats: d.stats(), list: d.list().map((a) => ({ name: a.name, islands: a.islands, parts: a.parts })), counts: sim.counts() };
}
