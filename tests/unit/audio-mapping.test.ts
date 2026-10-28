// Unit tests for the event → sound mapping: loudness feels right, layers are material- and
// mode-specific, rate limiters behave, propagation formulas are sane.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as M from "../../src/audio/mapping.ts";
import { resolveSound } from "../../src/audio/bank.ts";
import type { ImpactEv, FractureEv } from "../../src/core/events.ts";
import { MATERIALS, type MaterialId } from "../../src/destruction/model/materials.ts";

const P = { x: 0, y: 1, z: 0 };
const N = { x: 0, y: 1, z: 0 };
const imp = (o: Partial<ImpactEv>): ImpactEv => ({ pos: P, normal: N, energy: 1, impulse: 1, speed: 1, matA: "softwood", matB: "concrete", sizeA: 0.3, sizeB: 3, massA: 5, massB: 500, idA: 1, idB: 2, ...o });
const frac = (o: Partial<FractureEv>): FractureEv => ({ pos: P, dir: N, mat: "glass", mode: "shatter", energy: 50, volume: 0.002, pieces: 10, micro: 20, global: true, size: 1, assembly: "Window", ...o });
const rand = () => 0.5;
const maxDb = (ls: M.Layer[]) => Math.max(...ls.map((l) => l.db));

// What the destruction runtime really emits for static parts: PART sizes and masses
// (levels.ts FLOOR_TILE 0.3 × 0.3 × 0.01 porcelain ≈ 2.1 kg, PLANK 1.2 × 0.19 × 0.012 oak ≈ 1.9 kg,
// a 1.2 × 2.6 m drywall panel ≈ 27 kg). Contacts on the floor are at y = FLOOR_Y = 0.
const FLOOR = { x: 0, y: 0, z: 1 };
const TILE = { matB: "tile" as MaterialId, sizeB: 0.3, massB: 2.07, idB: 7 };
const PLANK = { matB: "hardwood" as MaterialId, sizeB: 1.2, massB: 1.92, idB: 8 };
const DRYWALL = { matA: "gypsum" as MaterialId, sizeA: 2.6, massA: 27, normal: { x: 1, y: 0, z: 0 } };

test("loudness ordering: sledgehammer » punch » dropped mug » footstep » falling pen", () => {
  const sledge = maxDb(M.impactLayers(imp({ ...DRYWALL, energy: 300, matB: "steel", sizeB: 0.06, massB: 7, idB: -1 })));
  const punch = maxDb(M.impactLayers(imp({ ...DRYWALL, energy: 60, matB: "flesh", sizeB: 0.08, massB: 3, idB: -1 })));
  const mug = maxDb(M.impactLayers(imp({ pos: FLOOR, energy: 3.4, matA: "ceramic", sizeA: 0.1, massA: 0.35, ...TILE })));
  const pen = maxDb(M.impactLayers(imp({ pos: FLOOR, energy: 0.07, matA: "plastic", sizeA: 0.14, massA: 0.01, ...PLANK })));
  const step = M.footstepDb(3.6);
  assert.ok(sledge > punch + 4, `sledge ${sledge} punch ${punch}`);
  assert.ok(punch > mug, `punch ${punch} mug ${mug}`);
  assert.ok(mug > step - 4, `mug ${mug} step ${step}`);
  assert.ok(pen < step - 4, `pen ${pen} must be a tiny tick below a footstep ${step}`);
  assert.ok(sledge > -4, "sledgehammer is loud");
  // Footsteps are subtle and scale with speed.
  assert.ok(M.footstepDb(6) > M.footstepDb(3.6) && M.footstepDb(3.6) > M.footstepDb(1.6));
  assert.ok(M.footstepDb(3.6) < -18);
  // A sledgehammer through drywall (impact + fracture) is loud.
  const f = maxDb(M.fractureLayers(frac({ mat: "gypsum", mode: "crumble", energy: 250, volume: Math.PI * 0.2 * 0.2 * 0.0125, global: false, size: 2.4 }), rand));
  assert.ok(f > -3, `drywall breakout ${f}`);
});

test("real floor finishes and drywall panels are surfaces, loose objects ring", () => {
  // Mug on a real floor tile: the tile clacks as a damped surface (not a ringing loose tile).
  const mug = M.impactLayers(imp({ pos: FLOOR, energy: 3.4, matA: "ceramic", sizeA: 0.1, massA: 0.35, ...TILE }));
  assert.deepEqual(mug.map((l) => l.id), ["impact.ceramic", "surface.ceramic"]);
  // Pen on a laminate plank: no 105 Hz board ring.
  const pen = M.impactLayers(imp({ pos: FLOOR, energy: 0.07, matA: "plastic", sizeA: 0.14, massA: 0.01, ...PLANK }));
  assert.equal(pen[1].id, "surface.wood");
  // Sledgehammer on a drywall panel: the wall sounds as a surface, the tool head as a striker.
  const sl = M.impactLayers(imp({ ...DRYWALL, energy: 300, matB: "steel", sizeB: 0.06, massB: 7, idB: -1 }));
  assert.equal(sl[0].id, "surface.drywall");
  assert.equal(M.surfaceSides(imp({ ...DRYWALL, energy: 300, matB: "steel", sizeB: 0.06, massB: 7, idB: -1 })), 1);
  // A hardwood cutting board dropped on the planks: the heavier plank is the floor, the board rings.
  const board = M.impactLayers(imp({ pos: FLOOR, energy: 2, matA: "hardwood", sizeA: 0.4, massA: 0.8, ...PLANK }));
  assert.deepEqual(board.map((l) => l.id), ["impact.wood", "surface.wood"]);
  // A hardwood table top hit at table height is a free panel, not a floor.
  const table = M.impactLayers(imp({ pos: { x: 0, y: 0.75, z: 0 }, energy: 5, matA: "hardwood", sizeA: 1.4, massA: 30, matB: "ceramic", sizeB: 0.25, massB: 0.5, idB: 3 }));
  assert.deepEqual(table.map((l) => l.id), ["impact.wood", "impact.ceramic"]);
  // A ceramic plate landing flat on the floor still rings (only floor-finish materials count).
  const plate = M.impactLayers(imp({ pos: FLOOR, energy: 2, matA: "ceramic", sizeA: 0.27, massA: 0.5, ...PLANK }));
  assert.equal(plate[0].id, "impact.ceramic");
  // Explicit static flags (requested ImpactEv addition) win over the heuristics.
  const flagged = { ...imp({ energy: 2, matA: "hardwood", sizeA: 0.4, massA: 0.8, matB: "softwood", sizeB: 0.5, massB: 3 }), staticA: false, staticB: true } as ImpactEv;
  assert.equal(M.surfaceSides(flagged), 2);
});

test("impacts layer both materials, pitch from size, ticks for tiny debris", () => {
  const ls = M.impactLayers(imp({ energy: 20, matA: "steelSheet", matB: "ceramic", sizeA: 0.4, sizeB: 0.3, massB: 0.6 }));
  assert.equal(ls.length, 2);
  assert.equal(ls[0].id, "impact.metalThin");
  assert.equal(ls[1].id, "impact.ceramic");
  assert.equal(ls[0].size, 0.4);
  for (const l of ls) assert.ok(resolveSound(l.id, l.size), l.id);
  const tiny = M.impactLayers(imp({ energy: 0.01, matA: "glass", matB: "hardwood", sizeA: 0.02, sizeB: 3 }));
  assert.equal(tiny[0].id, "tick.glass");
  // Below the audibility threshold nothing plays; NaN energy is ignored.
  assert.equal(M.impactLayers(imp({ energy: 1e-4 })).length, 0);
  assert.equal(M.impactLayers(imp({ energy: NaN })).length, 0);
  // World / unknown second body: single layer.
  assert.equal(M.impactLayers(imp({ matB: null })).length, 1);
});

test("soft strikers do not excite high modes (contact cutoff)", () => {
  const hard = M.contactCutoff("glass", "steel");
  const fist = M.contactCutoff("gypsum", "flesh");
  const foam = M.contactCutoff("hardwood", "foam");
  assert.ok(hard > 12000, `hard ${hard}`);
  assert.ok(fist < 3000, `fist ${fist}`);
  assert.ok(foam <= 600, `foam ${foam}`);
});

test("fracture sounds are material/mode specific and scale with energy and volume", () => {
  const ids = (e: Partial<FractureEv>) => M.fractureLayers(frac(e), rand).map((l) => l.id);
  assert.ok(ids({ mat: "glass", mode: "shatter", size: 1, volume: 0.005 }).includes("shatter.glass.l"));
  assert.ok(ids({ mat: "glass", mode: "shatter", size: 0.1, volume: 1e-4 }).includes("shatter.glass.s"));
  assert.ok(ids({ mat: "temperedGlass", mode: "dice" }).includes("shatter.tempered"));
  assert.ok(ids({ mat: "ceramic", mode: "shatter", size: 0.5 }).includes("shatter.ceramic.l"));
  assert.ok(ids({ mat: "softwood", mode: "splinter", global: true }).includes("break.wood.snap"));
  assert.ok(ids({ mat: "softwood", mode: "splinter", global: false, size: 0.2, volume: 1e-4 }).includes("break.wood.splinter"));
  assert.ok(ids({ mat: "gypsum", mode: "crumble", global: false, size: 0.2, volume: 1e-4 }).includes("break.drywall.punch"));
  assert.ok(ids({ mat: "concrete", mode: "crumble", global: false, volume: 1e-4, size: 0.2 }).includes("break.concrete.chip"));
  assert.ok(ids({ mat: "plastic", mode: "crack" }).some((i) => i.startsWith("break.plastic")));
  assert.ok(ids({ mat: "pcb", mode: "crack" }).includes("spark.crackle"));
  assert.ok(ids({ mat: "steelSheet", mode: "bend" }).includes("metal.tear"));
  assert.ok(ids({ mat: "fabric", mode: "soft" }).includes("tear.cloth"));
  assert.ok(ids({ mat: "paper", mode: "soft" }).includes("tear.paper"));
  // Debris rattle is delayed.
  const rattle = M.fractureLayers(frac({ mat: "ceramic", pieces: 6 }), rand).find((l) => l.id.startsWith("rattle."));
  assert.ok(rattle && (rattle.delay ?? 0) > 0.1);
  // Loudness grows with energy and broken volume.
  assert.ok(M.fractureDb(200, 0.002) > M.fractureDb(20, 0.002));
  assert.ok(M.fractureDb(50, 0.01) > M.fractureDb(50, 0.0001));
  // Every id produced resolves in the bank.
  const modes: FractureEv["mode"][] = ["shatter", "dice", "splinter", "crumble", "crack", "bend", "soft"];
  for (const mat of Object.keys(MATERIALS) as MaterialId[])
    for (const mode of modes) for (const l of M.fractureLayers(frac({ mat, mode }), rand)) assert.ok(resolveSound(l.id, l.size), `${mat}/${mode} → ${l.id}`);
});

test("bonds, cracks, chips, dents, splits map to existing sounds", () => {
  const kinds = ["glue", "screw", "nail", "dowel", "weld", "bolt", "press", "clip", "mortar", "fused", "friction", "hinge", "slider", "latch"] as const;
  for (const k of kinds) for (const l of M.bondLayers(k, "softwood", "steel", 40)) assert.ok(resolveSound(l.id), `${k} → ${l.id}`);
  assert.equal(M.bondLayers("screw", "softwood", null, 40)[0].id, "bond.screw");
  assert.ok(M.bondLayers("screw", "softwood", null, 40).some((l) => l.id === "crack.wood"), "screw tearing out of wood");
  assert.equal(M.bondLayers("weld", "steelSheet", "steelSheet", 70)[0].id, "bond.weld");
  for (const mat of Object.keys(MATERIALS) as MaterialId[]) {
    for (const l of M.crackLayers(mat, 0.6, 0.4)) assert.ok(resolveSound(l.id), `crack ${mat} → ${l.id}`);
    for (const l of M.chipLayers(mat, 30, rand)) assert.ok(resolveSound(l.id), `chip ${mat} → ${l.id}`);
  }
  assert.equal(M.crackLayers("glass", 0.5, 1)[0].id, "crack.glass");
  assert.equal(M.crackLayers("fabric", 0.5, 1).length, 0, "soft materials do not crack audibly");
  assert.equal(M.dentLayers(50, 0.02, 0.4)[0].id, "metal.dent");
  assert.ok(M.dentLayers(200, 0.03, 0.4)[0].db > M.dentLayers(5, 0.002, 0.4)[0].db);
  assert.ok(M.splitLayers(30, "metal").some((l) => l.id === "creak.metal"));
  assert.ok(M.splitLayers(30, null).some((l) => l.id === "settle"));
});

test("player foley mapping", () => {
  assert.equal(M.swingLayer("sledgehammer", 1).id, "swing.heavy");
  assert.equal(M.swingLayer("bat", 1).id, "swing.medium");
  assert.equal(M.swingLayer("hands", 1).id, "swing.light");
  assert.ok(M.swingLayer("bat", 1).db > M.swingLayer("bat", 0.1).db);
  const fistHard = M.toolHitLayers("hands", 60, true).map((l) => l.id);
  assert.deepEqual(fistHard, ["punch.thud", "tool.transient", "ouch"], "flesh on hard: thud + sharp transient + ouch");
  assert.deepEqual(M.toolHitLayers("hands", 60, false).map((l) => l.id), ["punch.thud"]);
  assert.equal(M.toolHitLayers("kick", 120, false)[0].id, "kick.thud");
  assert.equal(M.toolHitLayers("stomp", 120, false)[0].id, "stomp");
  for (const l of M.toolHitLayers("stomp", 120, true)) assert.ok(resolveSound(l.id), l.id);
  assert.equal(M.toolHitLayers("hammer", 60, true)[0].id, "tool.transient");
  assert.equal(M.stepIdFor("hardwood"), "step.wood");
  assert.equal(M.stepIdFor("tile"), "step.tile");
  assert.equal(M.stepIdFor("fabric"), "step.carpet");
  assert.equal(M.stepIdFor("concrete"), "step.concrete");
  assert.equal(M.stepIdFor(null), "step.wood");
  assert.ok(M.landDb(8) > M.landDb(3));
});

test("propagation formulas", () => {
  assert.equal(M.inverseDistanceGain(0.5, 1, 1), 1);
  assert.ok(Math.abs(M.inverseDistanceGain(10, 1, 1) - 0.1) < 1e-9);
  assert.ok(M.inverseDistanceGain(10, 1, 0.75) > M.inverseDistanceGain(10, 1, 1.5));
  assert.ok(M.occlusionGain(0) > 0.1 && M.occlusionGain(0) < 0.2);
  assert.equal(M.occlusionGain(1), 1);
  assert.ok(M.occlusionCutoff(0) < 500 && M.occlusionCutoff(1) >= 19999);
  assert.ok(M.occlusionCutoff(0.5) > M.occlusionCutoff(0.2));
  assert.ok(M.airCutoff(1) > M.airCutoff(30));
  assert.ok(M.diffraction(1) > M.diffraction(0) && M.diffraction(0) > M.diffraction(-1));
  // A body leaving the world at y = -30 hits the street (-93 m) about 2 s later.
  const d = M.fallOutDelay(-30, -93);
  assert.ok(d > 1.6 && d < 2.8, `fall delay ${d}`);
});

test("token buckets and island limiter", () => {
  const tb = new M.TokenBuckets();
  let ok = 0;
  for (let i = 0; i < 50; i++) if (tb.allow("impact.wood", 0, 10, 30)) ok++;
  assert.equal(ok, 10, "burst capacity");
  assert.ok(tb.allow("impact.wood", 0.1, 10, 30), "refills over time");
  // Priority: quiet debris drains the bucket, a loud close hit still passes.
  const pb = new M.TokenBuckets();
  for (let i = 0; i < 40; i++) pb.allow("impact.wood", 0, 12, 36, -45);
  assert.ok(!pb.allow("impact.wood", 0, 12, 36, -44), "another quiet layer is limited");
  assert.ok(pb.allow("impact.wood", 0, 12, 36, -30), "6 dB above the family's recent peak overrides");
  assert.ok(pb.allow("impact.wood", 0, 12, 36, 0), "loud at the listener: never limited");
  assert.ok(!pb.allow("impact.wood", 0, 12, 36, -40), "but quiet ones still are");
  tb.prune(100);
  assert.equal(tb.size, 0);
  const il = new M.IslandLimiter();
  assert.ok(il.check(5, 0, 1));
  il.record(5, 0, 1);
  assert.ok(!il.check(5, 0.01, 1.5), "too soon");
  assert.ok(il.check(5, 0.01, 10), "much bigger hit overrides");
  assert.ok(il.check(5, 0.05, 1), "interval passed");
  assert.ok(il.check(-1, 0, 1), "world never limited");
  assert.equal(M.familyKey("impact.wood.m"), "impact.wood");
  assert.equal(M.familyKey("step.tile"), "step.tile");
  assert.deepEqual(M.limitsFor("tick.glass"), M.RATE_LIMITS.tick);
});
