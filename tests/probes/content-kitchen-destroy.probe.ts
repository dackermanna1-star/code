// Destruction probe for the kitchen content: spawns the real kitchen placements (north run with
// sink/faucet/plumbing, range + cookware, fridge + groceries, dishwasher + dishes, the wall cabinet
// with the plate stacks, the island with bottles and fruit) on a concrete test floor in the real
// physics + destruction runtime (render mocked), lets everything settle awake (drift report), then
// strikes them the way a player would and reports what broke: fractures, dents, bond breaks,
// splits and feature events (water leaks, liquid spills, sparks, lights).
// Run: node tests/probe.mjs tests/probes/content-kitchen-destroy.probe.ts --timeout 600000 --screenshot /tmp/claude-0/content-kitchen-destroy.png

import { Vector3 } from "@babylonjs/core";
import { makeSim, floorDef, round } from "./destruction-util.ts";
import type { Vec3 } from "../../src/geom/vec.ts";
import { kitchenLayout } from "../../src/world/furnish/kitchen.ts";

const I = { x: 0, y: 0, z: 0, w: 1 };

export async function probe(): Promise<unknown> {
  const sim = await makeSim({ camPos: new Vector3(6.0, 1.75, 6.2), camTarget: new Vector3(6.6, 1.0, 8.4) });
  const { d } = sim;
  d.spawn(floorDef(12), { p: { x: 6.6, y: 0, z: 7 }, q: I });

  // the kitchen minus the far west/east items: everything that rests on/in the spawned containers
  const L = kitchenLayout();
  const keepTypes = new Set(["kitchenNorthRun", "range", "fridge", "dishwasher", "kitchenIsland", "kitchenWallCabinet"]);
  const roots = new Set<number>();
  L.placements.forEach((p, i) => {
    if (L.on[i] < 0 && keepTypes.has(p.type)) roots.add(i);
  });
  // keep only the u2/u3 wall cabinets (plates, bowls, glasses)
  const uppers = L.placements.map((p, i) => (p.type === "kitchenWallCabinet" ? i : -1)).filter((i) => i >= 0);
  for (const i of uppers.slice(0, 1).concat(uppers.slice(3))) roots.delete(i);
  const keep = (i: number): boolean => {
    for (let k = i; k >= 0; k = L.on[k]) if (roots.has(k)) return true;
    return false;
  };
  const ids: number[] = [];
  const idx: number[] = [];
  L.placements.forEach((p, i) => {
    if (!keep(i)) return;
    ids.push(d.spawn({ ...p.def, startAsleep: false }, p.xf));
    idx.push(i);
  });
  const idOfType = (type: string, n = 0): number => {
    let k = 0;
    for (let j = 0; j < idx.length; j++) if (L.placements[idx[j]].type === type && k++ === n) return ids[j];
    return -1;
  };
  const start = ids.map((id) => d.positionOf(id));
  const ev0 = { ...sim.ev };
  sim.step(150);
  const drift: Record<string, number> = {};
  ids.forEach((id, j) => {
    const a = start[j],
      b = d.positionOf(id);
    const m = a && b ? Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) : -1;
    if (m > 0.004) drift[`${L.placements[idx[j]].type}#${idx[j]}`] = round(m);
  });
  const evAtRest: Record<string, number> = {};
  for (const [k, v] of Object.entries(sim.ev)) if (v - (ev0[k] ?? 0) > 0) evAtRest[k] = v - (ev0[k] ?? 0);

  const strike = (id: number, part: string, local: Vec3 | null, dir: Vector3, mass: number, speed: number, r: number, sharp = 1) => {
    const asm = d.assembly(id);
    if (!asm) return { part, missing: "assembly" };
    const p = asm.byName.get(part) ?? [...asm.parts].find((q) => q.name.startsWith(part));
    if (!p || !p.island) return { part, missing: "part" };
    const isl = p.island;
    const lp = local ?? { x: p.centroid.x, y: p.centroid.y, z: p.centroid.z };
    const wp = d.world.toWorldVec(isl, lp);
    const res = d.strike({ point: new Vector3(wp.x, wp.y, wp.z), dir: dir.normalize(), body: isl.body!, childIndex: -1, mass, speed, sharpness: sharp, contactRadius: r, strikerMat: "steel", source: "debug" });
    return { part: res.partName, e: round(res.energy, 10), broke: res.broke };
  };
  const features = () => sim.log.filter((l) => l.type === "feature").map((l) => (l.ev as { kind: string }).kind);
  const log: Array<Record<string, unknown>> = [];
  const run = (name: string, fn: () => unknown, settle = 45) => {
    const e0 = { ...sim.ev };
    const f0 = features().length;
    const r = fn();
    sim.step(settle);
    const events: Record<string, number> = {};
    for (const [k, v] of Object.entries(sim.ev)) if (v - (e0[k] ?? 0) > 0) events[k] = v - (e0[k] ?? 0);
    log.push({ name, r, events, features: [...new Set(features().slice(f0))] });
  };
  const north = idOfType("kitchenNorthRun"),
    range = idOfType("range"),
    fridge = idOfType("fridge"),
    dw = idOfType("dishwasher"),
    upper = idOfType("kitchenWallCabinet"),
    bottle = idOfType("wineBottle");
  // top plate of the dinner-plate stack in the first kept wall cabinet
  let plate = -1;
  for (let j = 0; j < idx.length; j++) if (L.placements[idx[j]].type === "plate" && L.placements[L.on[idx[j]]]?.type === "kitchenWallCabinet") plate = ids[j];
  const down = new Vector3(0, -1, 0),
    north3 = new Vector3(0, 0, 1);
  run("hammer glass-ceramic cooktop", () => strike(range, "cooktop", null, down, 0.9, 11, 0.015));
  run("sledge glass-ceramic cooktop", () => strike(range, "cooktop", null, down, 6, 7, 0.03));
  run("sledge fridge door (dent)", () => strike(fridge, "fr_skin", null, north3, 6, 7, 0.03));
  run("hammer oven door glass", () => strike(range, "door_glass", null, north3, 0.9, 11, 0.015));
  run("crowbar drain trap", () => strike(north, "drain_3", null, new Vector3(0, -0.3, 1), 2.5, 8, 0.012));
  run("hammer supply line", () => strike(north, "cold_3", null, north3, 0.9, 11, 0.012));
  run("bat faucet spout", () => strike(north, "fct_spout_2", null, new Vector3(1, 0, 0), 1.0, 14, 0.03));
  run("hammer sink bowl (dent)", () => strike(north, "sink_bw_bot", null, down, 0.9, 11, 0.015));
  run("hammer wine bottle", () => strike(bottle, "body_wall", null, new Vector3(1, 0, 0), 0.9, 9, 0.015));
  run("hammer top plate of the stack", () => strike(plate, "base", null, down, 0.9, 8, 0.015));
  run("sledge wall cabinet up off the wall", () => strike(upper, "car_bottom", null, new Vector3(0, 1, 0.2), 6, 8, 0.03), 120);
  run("kick dishwasher door", () => strike(dw, "door_skin", null, north3, 8, 4, 0.06));

  const list = d
    .list()
    .filter((a) => a.damage > 0.001 || a.islands > 1)
    .map((a) => ({ name: a.type, islands: a.islands, parts: a.parts, damage: round(a.damage) }));
  sim.render.camera.position.set(6.0, 1.75, 6.2);
  await sim.renderReady(3);
  return { spawned: ids.length, drift, evAtRest, log, damaged: list, stats: d.stats() };
}
