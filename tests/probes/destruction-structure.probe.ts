// Structural runtime probe (no damage model needed): spawn → islands/bodies/meshes, manual bond
// breaks → splits + static→dynamic, joints (hinge/latch/use/pull rip), fell-out removal,
// consolidation + restore, full despawn leak check.
import { Vector3 } from "@babylonjs/core";
import { makeSim, floorDef, tableDef, paneDef, doorDef, blockDef, gateDef, drawerDef, round } from "./destruction-util.ts";
import { Layer } from "../../src/core/context.ts";

export async function probe() {
  const sim = await makeSim();
  const { d, physics } = sim;
  const out: Record<string, unknown> = {};
  const base = sim.counts();
  out.base = base;

  const floorId = d.spawn(floorDef(), { p: { x: 0, y: 0, z: 0 }, q: { x: 0, y: 0, z: 0, w: 1 } });
  const tableId = d.spawn(tableDef(), { p: { x: -1, y: 0, z: 0 }, q: { x: 0, y: 0, z: 0, w: 1 } });
  const paneId = d.spawn(paneDef(), { p: { x: 1.2, y: 0.9, z: 0.5 }, q: { x: 0, y: 0, z: 0, w: 1 } });
  const doorId = d.spawn(doorDef({ latch: 40 }), { p: { x: 0, y: 0, z: 2 }, q: { x: 0, y: 0, z: 0, w: 1 } });
  out.afterSpawn = sim.counts();
  const table = d.assembly(tableId)!;
  const tIsl = [...table.islands][0];
  out.table = { islands: table.islands.size, static: tIsl.isStatic, mass: round(tIsl.mass), layer: tIsl.layer, parts: tIsl.parts.length };
  const pane = d.assembly(paneId)!;
  out.pane = { islands: pane.islands.size, static: [...pane.islands][0].isStatic };
  const door = d.assembly(doorId)!;
  out.door = { islands: door.islands.size, groups: door.groups.size, constraints: [...door.groups.values()].map((g) => g.constraints.map((c) => c.kind + (c.latched ? "+latch" : ""))) };

  sim.step(60);
  const tPos = d.positionOf(tableId)!;
  out.tableRest = { y: round(tPos.y), awake: physics.isAwake(tIsl.body!) };

  // ---- split: break a leg's glue joint by hand
  const leg = table.byName.get("leg0")!;
  const glue = leg.bonds.find((b) => b.kind === "glue")!;
  d.world.breakBond(glue);
  d.world.flushTopology();
  d.joints.refreshDirty();
  const legIsl = leg.island!;
  out.legSplit = { islands: table.islands.size, legLayer: legIsl.layer === Layer.DEBRIS ? "DEBRIS" : legIsl.layer, legMass: round(legIsl.mass), tableParts: tIsl.parts.length, bondBreakEvents: sim.ev.bondBreak ?? 0, splitEvents: sim.ev.split ?? 0 };
  sim.step(90);
  out.afterLegFall = { legY: round(d.world.toWorldVec(legIsl, legIsl.com).y), tableY: round(d.positionOf(tableId)!.y) };

  // ---- static → dynamic: free the glass from its frame clips
  const glass = pane.byName.get("glass")!;
  for (const b of glass.bonds.slice()) d.world.breakBond(b);
  d.world.flushTopology();
  const gIsl = glass.island!;
  out.glassFreed = { islands: pane.islands.size, glassStatic: gIsl.isStatic, glassMass: round(gIsl.mass), frameStatic: pane.byName.get("frameL")!.island!.isStatic };
  sim.step(60);
  out.glassAfter = { y: round(d.world.toWorldVec(gIsl, gIsl.com).y) };

  // ---- door: use opens it (latch released), swings, re-latches when pushed closed
  const slab = door.byName.get("slab")!;
  const sIsl = slab.island!;
  const g = [...door.groups.values()][0];
  const hpos = d.world.toWorldVec(sIsl, { x: 0.3, y: 1.0, z: 0 });
  const used = d.use(sIsl.body!, new Vector3(hpos.x, hpos.y, hpos.z), new Vector3(hpos.x, 1.6, hpos.z + 1));
  sim.step(30);
  const ang1 = d.joints.coordinate(g)!;
  sim.step(60);
  const ang2 = d.joints.coordinate(g)!;
  out.doorUse = { used, released: g.released, angle30: round((ang1 * 180) / Math.PI, 10), angle90: round((ang2 * 180) / Math.PI, 10), constraints: g.constraints.map((c) => c.kind + (c.latched ? "+latch" : "")) };
  // close it again
  const hp2 = d.world.toWorldVec(sIsl, { x: 0.3, y: 1.0, z: 0 });
  d.use(sIsl.body!, new Vector3(hp2.x, hp2.y, hp2.z), new Vector3(0, 1.6, 0));
  let relatchedAt = -1;
  for (let i = 0; i < 240; i++) {
    sim.step(1);
    if (relatchedAt < 0 && !g.released) relatchedAt = i;
  }
  out.doorClose = { angle: round(((d.joints.coordinate(g) ?? 0) * 180) / Math.PI, 10), relatchedAt, latched: g.constraints.some((c) => c.latched), hkConstraintsCreated: physics.hk.HP_GetStatistics()[1][2] };

  // ---- pull: yank the closed, latched door outward (+Z) at the handle until something gives
  const pullLog: Array<{ t: number; latch: number; hinges: number[]; c: string[] }> = [];
  for (let i = 0; i < 60 * 12; i++) {
    const p = d.world.toWorldVec(sIsl, { x: 0.3, y: 1.0, z: 0.02 });
    const F = new Vector3(0, 60, -450);
    sIsl.body!.applyForce(F, new Vector3(p.x, p.y, p.z));
    d.pull(sIsl.body!, new Vector3(p.x, p.y, p.z), F, 1 / 60);
    sim.step(1);
    if (i % 60 === 0)
      pullLog.push({
        t: i / 60,
        latch: g.latch ? round(g.latch.health, 10) : -1,
        hinges: g.bonds.map((b) => round(b.health, 10)),
        c: g.constraints.map((c) => c.kind + (c.latched ? "+latch" : "")),
      });
    if (g.bonds.every((b) => !b.alive)) break;
  }
  out.pull = { log: pullLog, latchAlive: g.latch?.alive, hingesAlive: g.bonds.filter((b) => b.alive).length, constraints: g.constraints.length, loadsActive: d.joints.loadsActive };

  // ---- world-anchored hinge: a gate on the anchor body, rotated spawn (yaw 60°) to test frames
  const gateId = d.spawn(gateDef(), { p: { x: -2.5, y: 0, z: 1 }, q: { x: 0, y: Math.sin(Math.PI / 6), z: 0, w: Math.cos(Math.PI / 6) } });
  const gate = d.assembly(gateId)!;
  const gg = [...gate.groups.values()][0];
  const gIsl2 = gate.byName.get("leaf")!.island!;
  sim.step(10);
  const angle0 = d.joints.coordinate(gg)!;
  const gp = d.world.toWorldVec(gIsl2, { x: 0.35, y: 0.6, z: 0 });
  const gUsed = d.use(gIsl2.body!, new Vector3(gp.x, gp.y, gp.z), new Vector3(gp.x - 1, 1.6, gp.z));
  let gMax = -10,
    gMin = 10;
  for (let i = 0; i < 120; i++) {
    sim.step(1);
    const a = d.joints.coordinate(gg)!;
    gMax = Math.max(gMax, a);
    gMin = Math.min(gMin, a);
  }
  out.gate = { constraints: gg.constraints.map((c) => c.kind + (c.fixed ? "" : "@world")), angle0: round((angle0 * 180) / Math.PI, 10), used: gUsed, maxDeg: round((gMax * 180) / Math.PI, 10), minDeg: round((gMin * 180) / Math.PI, 10), anchor: !!gate.anchorBody };

  // ---- slider: drawer opens with use, then gets yanked out at full extension
  const drwId = d.spawn(drawerDef(), { p: { x: 2.5, y: 0, z: -1 }, q: { x: 0, y: 0, z: 0, w: 1 } });
  const drw = d.assembly(drwId)!;
  const dg = [...drw.groups.values()][0];
  const boxIsl = drw.byName.get("box")!.island!;
  sim.step(10);
  const fp = d.world.toWorldVec(boxIsl, { x: 0, y: 0.6, z: 0.27 });
  const dUsed = d.use(boxIsl.body!, new Vector3(fp.x, fp.y, fp.z), new Vector3(fp.x, 1.6, fp.z + 1));
  sim.step(60);
  const s1 = d.joints.coordinate(dg)!;
  const pullD: number[] = [];
  for (let i = 0; i < 60 * 6; i++) {
    const p = d.world.toWorldVec(boxIsl, { x: 0, y: 0.6, z: 0.27 });
    const F = new Vector3(0, 0, 450);
    boxIsl.body!.applyForce(F, new Vector3(p.x, p.y, p.z));
    d.pull(boxIsl.body!, new Vector3(p.x, p.y, p.z), F, 1 / 60);
    sim.step(1);
    if (i % 60 === 0) pullD.push(round(dg.bonds.reduce((a, b) => a + Math.max(0, b.health), 0), 10));
    if (dg.bonds.every((b) => !b.alive)) break;
  }
  out.drawer = { constraints: [...dg.constraints.map((c) => c.kind)], used: dUsed, openedTo: round(s1, 1000), runnerHealth: pullD, runnersAlive: dg.bonds.filter((b) => b.alive).length, drawerStatic: boxIsl.isStatic };

  // ---- fell out: drop a block into the void
  const voidId = d.spawn(blockDef("plastic", { x: 0.2, y: 0.2, z: 0.2 }), { p: { x: 30, y: 2, z: 0 }, q: { x: 0, y: 0, z: 0, w: 1 } });
  const vIsl = [...d.assembly(voidId)!.islands][0];
  physics.wake(vIsl.body!);
  sim.step(60 * 4);
  out.fellOut = { events: sim.ev.fellOut ?? 0, islands: d.assembly(voidId)!.islands.size, parts: d.assembly(voidId)!.parts.size };

  // ---- consolidation: a small block sleeping on the floor gets merged, then restored when woken
  const blkId = d.spawn(blockDef("softwood", { x: 0.15, y: 0.08, z: 0.1 }, "Wood Block", "wood_pine"), { p: { x: 0.5, y: 0.0, z: -1 }, q: { x: 0, y: 0, z: 0, w: 1 } });
  const bIsl = [...d.assembly(blkId)!.islands][0];
  physics.wake(bIsl.body!);
  sim.settings.data.quality = "low"; // consolidateAfter = 1 s
  let consolidatedAt = -1;
  for (let i = 0; i < 60 * 8; i++) {
    sim.step(1);
    if (bIsl.consolidated?.inBatch) {
      consolidatedAt = i;
      break;
    }
  }
  const meshesWhileConsolidated = sim.render.liveMeshes.size;
  const consolidated = d.stats().consolidated;
  const bc = d.world.toWorldVec(bIsl, bIsl.com);
  bIsl.body!.applyImpulse(new Vector3(0, 1.2, 0.2), new Vector3(bc.x, bc.y, bc.z));
  sim.step(40);
  out.consolidation = { consolidatedAt, consolidated, meshesWhileConsolidated, restored: !bIsl.consolidated, afterStats: d.stats().consolidated, cells: d.debris.cells.size };

  out.statsMid = d.stats();
  out.eventsMid = { ...sim.ev };
  sim.render1();

  // ---- despawn everything: counts back to baseline
  for (const id of [floorId, tableId, paneId, doorId, voidId, blkId, gateId, drwId]) d.despawn(id);
  d.dispose();
  sim.step(2);
  out.final = sim.counts();
  out.leak = Object.fromEntries(Object.entries(out.final as Record<string, number>).map(([k, v]) => [k, v - (base as Record<string, number>)[k]]));
  return out;
}
