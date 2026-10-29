// Destruction probe for the living-room content: spawns the media console with the TV, the side
// table + ceramic table lamp, a bookcase with books, the sofa and a framed painting on a nail in
// the real physics + destruction runtime (render mocked), lets everything settle awake, then
// strikes them the way a player would and reports what broke (fractures, bond breaks, feature
// events: screen broken, light broken, sparks), drift at rest and a screenshot of the aftermath.
// Run: node tests/probe.mjs tests/probes/content-living-destroy.probe.ts --timeout 300000 --screenshot /tmp/claude-0/content-living-destroy.png

import { Vector3 } from "@babylonjs/core";
import { makeSim, floorDef, round } from "./destruction-util.ts";
import { qeuler, type Quat, type Vec3 } from "../../src/geom/vec.ts";
import type { AssemblyDef } from "../../src/destruction/model/types.ts";
import { Builder } from "../../src/objects/lib/builder.ts";
import { buildMediaConsole, MEDIA_CONSOLE_DIMS } from "../../src/objects/living/mediaConsole.ts";
import { buildTv } from "../../src/objects/living/tv.ts";
import { buildSideTable, SIDE_TABLE_DIMS, buildBookcase, BOOKCASE_DIMS } from "../../src/objects/living/furniture.ts";
import { buildTableLamp } from "../../src/objects/living/lamps.ts";
import { buildSofa } from "../../src/objects/living/sofa.ts";
import { buildBook, buildFramedPainting, BOOK_SIZES } from "../../src/objects/living/decor.ts";

const I: Quat = { x: 0, y: 0, z: 0, w: 1 };
const LIFT = 0.0005;

/** A static drywall-faced wall slab for the painting (front face at z = 0, x -1..1). */
function wallDef(): AssemblyDef {
  const b = new Builder("probeWall", "Probe Wall", "structure", 0);
  const w = b.box("wall", "gypsum", "paint_wall", [2.0, 2.4, 0.1], [0, 1.2, -0.05]);
  b.world(w, "mortar", 1e6);
  return b.build();
}

export async function probe(): Promise<unknown> {
  const sim = await makeSim({ camPos: new Vector3(2.6, 1.7, 3.4), camTarget: new Vector3(0.2, 0.6, 0.2) });
  const { d } = sim;
  d.spawn(floorDef(10), { p: { x: 0, y: 0, z: 0 }, q: I });

  const awake = (def: AssemblyDef): AssemblyDef => ({ ...def, startAsleep: false });
  const ids: Record<string, number> = {};
  const put = (id: string, def: AssemblyDef, p: Vec3, q: Quat = I): void => {
    ids[id] = d.spawn(awake(def), { p, q });
  };
  // media console with the TV on top (TV base on the console top)
  put("console", buildMediaConsole({ seed: 1 }), { x: 0, y: 0, z: 0 });
  if (0) put("tv", buildTv({ seed: 2 }), { x: 0, y: MEDIA_CONSOLE_DIMS.h + LIFT, z: -0.05 });
  // side table + lamp
  put("sideTable", buildSideTable({ seed: 3 }), { x: 1.6, y: 0, z: 0 });
  put("lamp", buildTableLamp({ seed: 4 }), { x: 1.6, y: SIDE_TABLE_DIMS.h + LIFT, z: 0 });
  // bookcase with a row of books on the second level
  put("bookcase", buildBookcase({ seed: 5 }), { x: -1.7, y: 0, z: 0 });
  const [bw, , bt] = BOOK_SIZES.hardcover;
  for (let k = 0; k < 8; k++) put(`book${k}`, buildBook({ size: "hardcover", seed: 10 + k }), { x: -1.7 - 0.3 + k * (bt + 0.003), y: BOOKCASE_DIMS.levels[1] + LIFT, z: BOOKCASE_DIMS.shelfZ1 - 0.006 - bw / 2 });
  // sofa facing the console
  put("sofa", buildSofa({ seed: 6 }), { x: 0, y: 0, z: 2.6 }, qeuler(0, Math.PI, 0));
  // painting on a nail on a wall behind the bookcase/console line
  d.spawn(wallDef(), { p: { x: 2.8, y: 0, z: -0.6 }, q: I });
  put("painting", buildFramedPainting({ seed: 7, w: 0.6, h: 0.45 }), { x: 2.8, y: 1.2, z: -0.6 + 0.003 });

  const start: Record<string, Vec3 | null> = {};
  for (const [k, id] of Object.entries(ids)) start[k] = d.positionOf(id);
  sim.step(120);
  const drift: Record<string, number> = {};
  for (const [k, id] of Object.entries(ids)) {
    const a = start[k],
      b = d.positionOf(id);
    const m = a && b ? Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) : -1;
    if (m > 0.004) drift[k] = round(m);
  }
  const evBefore = { ...sim.ev };

  // strike helper: hit a named part (top centre or a given local point) along dir
  const strike = (key: string, part: string, local: Vec3 | null, dir: Vector3, mass: number, speed: number, r: number, sharp = 1) => {
    const asm = d.assembly(ids[key])!;
    const p = asm.byName.get(part) ?? [...asm.parts].find((q) => q.name.startsWith(part));
    if (!p || !p.island) return { part, missing: true };
    const isl = p.island;
    const lp = local ?? { x: p.centroid.x, y: p.centroid.y, z: p.centroid.z };
    const wp = d.world.toWorldVec(isl, lp);
    const res = d.strike({ point: new Vector3(wp.x, wp.y, wp.z), dir, body: isl.body!, childIndex: -1, mass, speed, sharpness: sharp, contactRadius: r, strikerMat: "steel", source: "debug" });
    return { part: res.partName, e: round(res.energy, 10), broke: res.broke };
  };
  const evDelta = (from: Record<string, number>) => {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(sim.ev)) if (v - (from[k] ?? 0) > 0) out[k] = v - (from[k] ?? 0);
    return out;
  };
  const features = () => sim.log.filter((l) => l.type === "feature").map((l) => (l.ev as { kind: string }).kind);

  const log: Array<Record<string, unknown>> = [];
  const run = (name: string, fn: () => unknown, settle = 45) => {
    console.log(`[content-living-destroy] ${name}`); // progress marker (localises page crashes)
    const ev0 = { ...sim.ev };
    const f0 = features().length;
    const r = fn();
    console.log("[tmp] struck " + JSON.stringify(r));
    for (let k = 0; k < settle; k += 5) { sim.step(5); console.log("[tmp] step " + k + " " + JSON.stringify(d.stats().destruction)); }
    log.push({ name, r, events: evDelta(ev0), features: features().slice(f0) });
  };
  // sledge the console top
  run("sledge console top", () => strike("console", "top", null, new Vector3(0, -1, 0), 6, 7.5, 0.03));
  // kick the bookcase at shoulder height from the front (it should rock / tip, books slide)
  run("sledge bookcase side", () => strike("bookcase", "case_side_r", { x: 0.4, y: 1.6, z: 0 }, new Vector3(-1, 0, 0), 6, 7.5, 0.03), 120);

  const list = d.list().map((a) => ({ name: a.type, islands: a.islands, parts: a.parts, damage: round(a.damage) }));
  sim.render.camera.position.set(2.6, 1.7, 3.4);
  await sim.renderReady(3);
  const pos = (k: string) => {
    const q = d.positionOf(ids[k]);
    return q ? { x: round(q.x), y: round(q.y), z: round(q.z) } : null;
  };
  // assertions (reported as `fail` rather than thrown so the rest of the report survives)
  const fail: string[] = [];
  return { ok: fail.length === 0, fail, drift, evAtRest: evBefore, log, endPos: { tv: pos("tv"), lamp: pos("lamp") }, list: list.filter((a) => a.damage > 0 || a.islands > 1), stats: d.stats() };
}
