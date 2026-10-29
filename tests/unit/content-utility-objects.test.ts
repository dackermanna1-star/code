// Bathroom / laundry / foyer / balcony object builders: every registered builder builds with full
// validation and NO builder warnings, masses fall in realistic ranges (stated per object), real
// construction details are present (features, joints, anchors, materials), and builds are
// deterministic.
// Run: node --test tests/unit/content-utility-*.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { Builder } from "../../src/objects/lib/builder.ts";
import { polyVolume } from "../../src/geom/poly.ts";
import { MATERIALS } from "../../src/destruction/model/materials.ts";
import type { AssemblyDef, FeatureDef } from "../../src/destruction/model/types.ts";
import { BATH_OBJECTS } from "../../src/objects/bath/index.ts";
import { UTILITY_OBJECTS } from "../../src/objects/utility/index.ts";

// any builder warning is a failure
Builder.warnMode = "throw";
Builder.validation = "full";

const ALL: Record<string, (o?: unknown) => AssemblyDef> = { ...BATH_OBJECTS, ...UTILITY_OBJECTS };

const massOf = (d: AssemblyDef): number => d.parts.reduce((s, p) => s + (p.mass ?? polyVolume(p.poly) * MATERIALS[p.mat].density), 0);
const massByMat = (d: AssemblyDef, mat: string): number => d.parts.filter((p) => p.mat === mat).reduce((s, p) => s + (p.mass ?? polyVolume(p.poly) * MATERIALS[p.mat].density), 0);
const feats = (d: AssemblyDef, type: FeatureDef["type"]) => (d.features ?? []).filter((f) => f.type === type);
const minY = (d: AssemblyDef) => Math.min(...d.parts.flatMap((p) => p.poly.verts.map((v) => v.y)));
const maxY = (d: AssemblyDef) => Math.max(...d.parts.flatMap((p) => p.poly.verts.map((v) => v.y)));
const worldBonds = (d: AssemblyDef) => d.bonds.filter((b) => b.b === "world");
const joints = (d: AssemblyDef, kind: "hinge" | "slider") => new Set(d.bonds.filter((b) => b.kind === kind).map((b) => b.joint?.group));

/** Realistic mass ranges (kg) — the brief's where given, else typical retail/spec-sheet values. */
const MASS: Record<string, [number, number]> = {
  bathtub: [25, 60], // acrylic tub incl. frame/aprons (brief 25–60)
  showerSet: [2.5, 6], // bar mixer + rail + hand shower
  showerScreen: [12, 25], // 6 mm toughened 0.78 × 1.4 m ≈ 16 kg + hardware
  toilet: [25, 40], // close-coupled china toilet (brief 25–40)
  bathVanity: [30, 45], // brief 30–45
  mirrorCabinet: [8, 18],
  towelRing: [0.2, 1],
  towelRack: [0.5, 2],
  toiletPaperHolder: [0.15, 0.6],
  toothbrushCup: [0.15, 0.5],
  soapDispenser: [0.2, 0.6],
  shampooBottle: [0.25, 0.6],
  toiletryBottle: [0.03, 0.3],
  hairDryer: [0.35, 0.9],
  bathBin: [0.4, 1.5],
  bathScale: [1.2, 2.5],
  bathMat: [0.3, 1.2],
  exhaustFan: [0.4, 1.5],
  washer: [65, 85], // brief 65–85
  dryer: [35, 50], // brief 35–50
  waterHeater: [45, 70], // empty shell (brief 45–70); water is a feature
  wireShelf: [5, 12],
  wallWireShelf: [2, 6],
  detergentJug: [2.5, 4], // 3 l + jug
  paintCan: [4, 6.5], // 1 gal of paint + can
  bulbBox: [0.1, 0.5],
  storageBox: [0.5, 4],
  toolbox: [2, 4.5],
  hammer: [0.4, 0.9],
  screwdriver: [0.04, 0.2],
  wrench: [0.2, 0.6],
  pliers: [0.12, 0.4],
  mopBucket: [1, 3],
  broomHolder: [0.4, 1.5],
  vacuumCleaner: [3.5, 8],
  ironingBoard: [3.5, 7],
  electricalPanel: [8, 15], // brief 8–15
  coatCloset: [50, 110], // particleboard carcass + hollow-core bifolds + coats
  consoleTable: [7, 18],
  foyerMirror: [4, 10],
  keyBowl: [0.3, 0.8],
  keyRing: [0.02, 0.12],
  photoFrame: [0.15, 0.6],
  shoeRack: [4, 10],
  shoe: [0.2, 0.6],
  umbrellaStand: [3, 8],
  intercom: [0.25, 0.8],
  foyerBench: [12, 25],
  patioChair: [4, 7], // brief 4–7
  bistroTable: [4, 9],
  terracottaPlant: [3, 30], // terracotta + real-weight soil (herb pot … shrub)
  acCondenser: [30, 45], // brief 30–45
};

const built = new Map<string, AssemblyDef>();
function get(type: string): AssemblyDef {
  let d = built.get(type);
  if (!d) {
    d = ALL[type]();
    built.set(type, d);
  }
  return d;
}

test("registry: every builder has a stated mass range and every range a builder", () => {
  assert.deepEqual(Object.keys(ALL).sort(), Object.keys(MASS).sort());
});

for (const type of Object.keys(ALL)) {
  test(`${type}: builds (full validation, no warnings), realistic mass, sane bounds`, () => {
    const d = get(type);
    assert.equal(d.type, type);
    assert.ok(d.parts.length >= 1);
    const m = massOf(d);
    const [lo, hi] = MASS[type];
    assert.ok(m >= lo && m <= hi, `${type} mass ${m.toFixed(2)} kg outside [${lo}, ${hi}]`);
    for (const p of d.parts) for (const v of p.poly.verts) assert.ok(Number.isFinite(v.x + v.y + v.z), `${p.name} has a non-finite vertex`);
    assert.ok(d.parts.length <= 130, `${type} uses ${d.parts.length} parts`);
  });
}

test("determinism: builders produce identical defs for the same options", () => {
  for (const type of Object.keys(ALL)) {
    const a = JSON.stringify(ALL[type]({ seed: 5 }));
    const b = JSON.stringify(ALL[type]({ seed: 5 }));
    assert.equal(a, b, `${type} is not deterministic`);
  }
});

test("variants build without warnings", () => {
  const variants: Array<[string, unknown]> = [
    ["toilet", { tint: 0xd8e6dc, supplyX: 0.16 }],
    ["bathtub", { endApron: false }],
    ["showerScreen", { w: 0.7, t: 0.008 }],
    ["mirrorCabinet", { bottomY: 1.5, hingeSide: 1 }],
    ["shampooBottle", { kind: "conditioner" }],
    ["toiletryBottle", { kind: "perfume" }],
    ["toiletryBottle", { kind: "cream" }],
    ["detergentJug", { kind: "bleach" }],
    ["paintCan", { size: "quart", color: 0xaa3322 }],
    ["storageBox", { w: 0.36, h: 0.22, contents: 1.5 }],
    ["shoe", { kind: "leather", side: "left" }],
    ["shoe", { kind: "runner" }],
    ["terracottaPlant", { plant: "snake" }],
    ["terracottaPlant", { plant: "herb" }],
    ["terracottaPlant", { plant: "bush", size: 1.2 }],
    ["coatCloset", { coats: 4, sideWall: "r" }],
    ["coatCloset", { coats: 0, sideWall: "none" }],
    ["wallWireShelf", { len: 0.9, tops: [1.5] }],
    ["washer", { hoses: { inlet: [0.25, 1.05, -0.4], drain: [0.1, 0.95, -0.42] } }],
    ["dryer", { plug: [-0.4, 1.1, 0.1], vent: [-0.2, 0.15, -0.38] }],
    ["acCondenser", { fanSpeed: 0 }],
  ];
  for (const [type, o] of variants) {
    const d = ALL[type](o);
    assert.ok(d.parts.length > 0, `${type} variant`);
  }
});

// ------------------------------------------------------------------ construction details

test("toilet: bolted to the floor, separate resting ceramic tank lid, flush internals, water", () => {
  const d = get("toilet");
  const lid = d.parts.find((p) => p.name === "tank_lid")!;
  assert.equal(lid.mat, "ceramic");
  const lm = polyVolume(lid.poly) * MATERIALS.ceramic.density;
  assert.ok(lm >= 3 && lm <= 5, `tank lid ${lm.toFixed(2)} kg`);
  const lidBonds = d.bonds.filter((b) => b.a === lid.name || b.b === lid.name);
  assert.ok(lidBonds.length > 0 && lidBonds.every((b) => b.kind === "friction"), "the lid only rests (friction)");
  assert.ok(worldBonds(d).some((b) => b.kind === "bolt"), "closet bolts to the floor");
  assert.ok(d.parts.some((p) => p.mat === "plastic" && /float|fill/.test(p.name)), "plastic fill valve / float");
  assert.ok(feats(d, "water").length >= 2, "tank water + supply line");
  assert.ok(joints(d, "hinge").size >= 2, "seat and lid on hinges");
});

test("bathtub + shower: acrylic shell, tempered hinged screen, chrome water fittings", () => {
  const tub = get("bathtub");
  assert.ok(massByMat(tub, "acrylic") > 10, "acrylic shell");
  assert.ok(worldBonds(tub).length >= 2, "wall brackets");
  const scr = get("showerScreen");
  assert.ok(scr.parts.some((p) => p.mat === "temperedGlass"), "toughened glass panel");
  assert.equal(joints(scr, "hinge").size, 1, "one hinge group");
  const set = get("showerSet");
  assert.ok(feats(set, "water").length >= 2, "spout + hand shower water");
});

test("vanity + mirror cabinet: hinged doors, ceramic basin top, water, wall anchors", () => {
  const v = get("bathVanity");
  assert.ok(massByMat(v, "ceramic") > 8, "vitreous china top");
  assert.ok(joints(v, "hinge").size >= 2, "two hinged doors");
  assert.ok(feats(v, "water").length >= 3, "tap + both supply hoses");
  assert.ok(worldBonds(v).length >= 3, "rail screwed to the wall + hoses/trap at the stub-outs");
  const mc = get("mirrorCabinet");
  assert.ok(mc.parts.some((p) => p.mat === "glass" && p.name.includes("mirror")), "glass mirror");
  assert.ok(mc.parts.filter((p) => p.mat === "glass" && p.name.startsWith("shelf")).length >= 2, "glass shelves");
  assert.equal(joints(mc, "hinge").size, 1);
});

test("washer: concrete counterweights, steel drum on a bearing, glass porthole door, drawer, water", () => {
  const w = get("washer");
  const c = massByMat(w, "concrete");
  assert.ok(c >= 15 && c <= 35, `concrete counterweights ${c.toFixed(1)} kg`);
  assert.ok(w.parts.some((p) => p.name.startsWith("drum") && p.mat === "steelSheet"), "stainless drum");
  assert.ok(w.parts.some((p) => p.name === "door_glass" && p.mat === "glass"), "porthole glass");
  assert.ok(joints(w, "slider").size >= 1, "detergent drawer slider");
  assert.ok(joints(w, "hinge").size >= 2, "door + drum bearing");
  assert.ok(feats(w, "water").length >= 2 && feats(w, "sparks").length >= 1);
  const dr = get("dryer");
  assert.equal(massByMat(dr, "concrete"), 0, "dryers carry no concrete");
  assert.ok(dr.parts.some((p) => p.name.startsWith("lint")), "lint filter");
});

test("water heater: finite 150 l water, insulation, steel jacket, supply pipes", () => {
  const h = get("waterHeater");
  const tank = feats(h, "water").find((f) => f.type === "water" && f.litres !== undefined && f.litres >= 100);
  assert.ok(tank && tank.type === "water" && Math.abs((tank.litres ?? 0) - 150) < 1e-9, "150 litres in the tank");
  assert.ok(massByMat(h, "foam") > 1.5, "foamed-in PU insulation");
  // tiled vessel: the tank water sits on a bottom (dome) tile
  const tp = h.parts.find((p) => p.name === (tank as { part: string }).part)!;
  assert.ok(tp.name.startsWith("tank") && Math.min(...tp.poly.verts.map((v) => v.y)) < 0.13, "water on the tank's base tile");
  assert.ok(massByMat(h, "steelSheet") > 5, "steel jacket");
  assert.ok(feats(h, "water").length >= 3);
});

test("electrical panel: power feature on the main breaker AND bus bar, press-fit breakers, sparks", () => {
  const p = get("electricalPanel");
  const powered = feats(p, "power").map((f) => (f as { part: string }).part);
  assert.ok(powered.some((n) => /main/.test(n)), `power on the main breaker (${powered.join(", ")})`);
  assert.ok(powered.some((n) => /bus/.test(n)), "power on the bus bar");
  assert.ok(p.parts.some((q) => /bus/.test(q.name) && q.mat === "copper"), "copper bus bar");
  const breakers = p.parts.filter((q) => /breaker/.test(q.name) && q.mat === "plastic");
  assert.ok(breakers.length >= 10, `${breakers.length} breakers`);
  assert.ok(p.bonds.some((b) => b.kind === "press"), "press-fit breakers");
  assert.ok(feats(p, "sparks").length >= 5);
  assert.equal(joints(p, "hinge").size, 1, "hinged door");
});

test("balcony: chair aluminium + plastic, tempered table top, planter soil, condenser fan motor", () => {
  const ch = get("patioChair");
  assert.ok(massByMat(ch, "aluminum") > 1.5 && massByMat(ch, "plastic") > 0.5);
  assert.ok(get("bistroTable").parts.some((p) => p.mat === "temperedGlass"));
  const pl = get("terracottaPlant");
  assert.equal(feats(pl, "soil").length, 1);
  assert.ok(massByMat(pl, "ceramic") > 2 && massByMat(pl, "soil") > 5, "terracotta + soil");
  const ac = get("acCondenser");
  assert.equal(feats(ac, "motor").length, 1, "fan motor");
  assert.ok(ac.parts.some((p) => p.name === "compressor" && (p.mass ?? 0) >= 10), "heavy compressor");
});

test("small items: liquids, stuffing, closet coats on hinges, bifold doors", () => {
  for (const t of ["shampooBottle", "detergentJug", "paintCan", "soapDispenser"]) assert.ok(feats(get(t), "liquid").length >= 1, `${t} has liquid`);
  assert.ok(get("paintCan").parts.some((p) => p.mat === "steelSheet"), "dentable tinplate can");
  const cl = get("coatCloset");
  assert.ok(feats(cl, "stuffing").length >= 2, "coats");
  assert.ok(joints(cl, "hinge").size >= 4 + 2, "four bifold panels + coat hangers");
  assert.ok(get("toolbox").bonds.some((b) => b.kind === "latch"), "toolbox lid latch");
});

test("frames: floor items stand on y = 0, wall items hang from world bonds, ceiling fan under y = 0", () => {
  const floor = ["bathtub", "toilet", "bathVanity", "washer", "dryer", "waterHeater", "consoleTable", "shoeRack", "foyerBench", "coatCloset", "patioChair", "bistroTable", "acCondenser", "mopBucket", "vacuumCleaner"];
  for (const t of floor) assert.ok(Math.abs(minY(get(t))) < 1e-3, `${t} base at y = 0 (got ${minY(get(t)).toFixed(4)})`);
  const wall = ["showerSet", "showerScreen", "mirrorCabinet", "towelRing", "towelRack", "toiletPaperHolder", "electricalPanel", "foyerMirror", "intercom", "broomHolder", "ironingBoard", "wallWireShelf"];
  for (const t of wall) {
    const d = get(t);
    assert.ok(worldBonds(d).length >= 1, `${t} is fixed to the wall`);
    const zmin = Math.min(...d.parts.flatMap((p) => p.poly.verts.map((v) => v.z)));
    assert.ok(zmin > -1e-3, `${t} does not reach behind its wall plane (z min ${zmin.toFixed(4)})`);
  }
  const fan = get("exhaustFan");
  assert.ok(maxY(fan) <= 1e-6 && worldBonds(fan).length >= 1, "extractor fan hangs from the ceiling plane");
});
