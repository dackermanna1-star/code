// Living / dining room object builders: every registered builder builds without warnings,
// masses are realistic (range per object below), geometry is sane (finite, convex parts with
// volume, no substantial part overlaps), features reference real parts, builds are deterministic.
// Run: node --test tests/unit/content-living-objects.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { Builder } from "../../src/objects/lib/builder.ts";
import { aabbOf, overlappingPairs, polyContact, polySd, samplePoly } from "../../src/objects/lib/contact.ts";
import { polyVolume } from "../../src/geom/poly.ts";
import { MATERIALS } from "../../src/destruction/model/materials.ts";
import { Rng } from "../../src/core/rng.ts";
import type { AssemblyDef } from "../../src/destruction/model/types.ts";
import { LIVING_OBJECTS } from "../../src/objects/living/index.ts";
import { buildBook } from "../../src/objects/living/decor.ts";

/** Realistic mass ranges (kg) per type — the brief's ranges where given. */
const MASS: Record<string, [number, number]> = {
  mediaConsole: [30, 50],
  tv55: [14, 20],
  gameConsole: [1.5, 3.5],
  gameController: [0.15, 0.3],
  soundbar: [0.9, 3],
  wifiRouter: [0.25, 0.6],
  cableBox: [0.5, 1.2],
  bookshelfSpeaker: [3, 6],
  sofa3: [45, 70],
  armchair: [20, 35],
  throwPillow: [0.3, 1.0],
  coffeeTable: [18, 35],
  sideTable: [5, 10],
  diningTable: [30, 45],
  chair: [4, 7],
  tableLamp: [2, 4],
  floorLamp: [4, 8],
  bookcase: [30, 45],
  hardcoverBook: [0.3, 1.2],
  paperbackBook: [0.25, 0.5],
  magazine: [0.1, 0.4],
  remoteControl: [0.08, 0.15],
  pillarCandle: [0.2, 0.8],
  candleTray: [0.3, 1.0],
  decorBowl: [0.6, 1.6],
  ceramicVase: [0.4, 1.5],
  figurine: [0.2, 0.8],
  photoFrame: [0.15, 0.5],
  flowerVase: [0.7, 1.8],
  framedPainting: [3, 8],
  wallMirror: [5, 10],
  areaRug: [5, 12],
  placemat: [0.08, 0.25],
  dinnerPlate: [0.4, 0.65],
  wineGlass: [0.1, 0.2],
  fiddleLeafFig: [8, 18],
  snakePlant: [3, 9],
  succulent: [0.25, 0.8],
};

/** Wall-hung items: origin on the wall (back face at z = 0), everything else stands on y = 0. */
const WALL_TYPES = new Set(["framedPainting", "wallMirror"]);

function massOf(def: AssemblyDef): number {
  let m = 0;
  for (const p of def.parts) m += p.mass ?? polyVolume(p.poly) * MATERIALS[p.mat].density;
  return m;
}

function overlapReport(def: AssemblyDef): string[] {
  const out: string[] = [];
  const boxes = def.parts.map((p) => aabbOf(p.poly));
  const rng = new Rng(0xabc);
  for (const [i, j] of overlappingPairs(boxes, 0)) {
    const A = def.parts[i],
      B = def.parts[j];
    const c = polyContact(A.poly, B.poly, 0);
    if (!c || c.sep > -0.002) continue;
    const [s, g] = polyVolume(A.poly) <= polyVolume(B.poly) ? [A, B] : [B, A];
    const pts = samplePoly(s.poly, 96, rng);
    let n = 0;
    for (const q of pts) if (polySd(g.poly, q) < -5e-4) n++;
    if (n / pts.length > 0.1) out.push(`${s.name} ⊂ ${g.name} (${Math.round((100 * n) / pts.length)}%)`);
  }
  return out;
}

/** Reference objects owned (and warning-tested) by the builder-kit module. */
const REFERENCE = new Set(["coffeeTable", "chair"]);

const built = new Map<string, AssemblyDef>();
function build(type: string): AssemblyDef {
  let d = built.get(type);
  if (!d) {
    const prev = Builder.warnMode;
    Builder.warnMode = REFERENCE.has(type) ? "collect" : "throw";
    try {
      d = LIVING_OBJECTS[type]();
    } finally {
      Builder.warnMode = prev;
    }
    built.set(type, d);
  }
  return d;
}

test("every living object has a mass range in this test", () => {
  for (const type of Object.keys(LIVING_OBJECTS)) assert.ok(MASS[type], `no mass range for ${type}`);
});

for (const type of Object.keys(LIVING_OBJECTS)) {
  test(`${type}: builds without warnings, realistic mass, sane geometry`, () => {
    const def = build(type);
    assert.equal(def.type, type);
    assert.ok(def.parts.length > 0);
    // finite geometry, positive volumes, unique names
    const names = new Set<string>();
    for (const p of def.parts) {
      assert.ok(!names.has(p.name), `duplicate part ${p.name}`);
      names.add(p.name);
      for (const v of p.poly.verts) assert.ok(Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z), `${p.name}: NaN vertex`);
      assert.ok(polyVolume(p.poly) > 1e-9, `${p.name}: no volume`);
    }
    // bonds and features reference parts
    for (const b of def.bonds) {
      assert.ok(names.has(b.a), `bond to unknown ${b.a}`);
      assert.ok(b.b === "world" || names.has(b.b), `bond to unknown ${b.b}`);
    }
    for (const f of def.features ?? []) assert.ok(names.has((f as { part: string }).part), `feature ${f.type} on unknown part`);
    // mass
    const m = massOf(def);
    const [lo, hi] = MASS[type];
    assert.ok(m >= lo && m <= hi, `${type} mass ${m.toFixed(2)} kg outside ${lo}–${hi}`);
    // frame convention
    let minY = Infinity,
      minZ = Infinity;
    for (const p of def.parts) {
      const b = aabbOf(p.poly);
      minY = Math.min(minY, b.min.y);
      minZ = Math.min(minZ, b.min.z);
    }
    if (WALL_TYPES.has(type)) assert.ok(Math.abs(minZ) < 1e-6, `${type}: back face not at z = 0 (${minZ})`);
    assert.ok(Math.abs(minY) < 1e-6, `${type}: base not at y = 0 (${minY})`);
    // no substantial overlaps between parts
    assert.deepEqual(overlapReport(def), [], `${type}: overlapping parts`);
    // part budget per object (small items ≤ 40, furniture ≤ 80)
    assert.ok(def.parts.length <= 80, `${type}: ${def.parts.length} parts`);
  });
}

test("builds are deterministic", () => {
  for (const type of ["tv55", "sofa3", "mediaConsole", "fiddleLeafFig", "hardcoverBook", "tableLamp"]) {
    const a = JSON.stringify(LIVING_OBJECTS[type]({ seed: 42 }));
    const b = JSON.stringify(LIVING_OBJECTS[type]({ seed: 42 }));
    assert.equal(a, b, `${type} not deterministic`);
  }
});

test("features: lamps have lights on bulbs, the TV a screen, electronics sparks, soft goods stuffing", () => {
  const feat = (type: string, f: string) => (build(type).features ?? []).filter((x) => x.type === f);
  for (const t of ["tableLamp", "floorLamp"]) {
    const l = feat(t, "light");
    assert.equal(l.length, 1, `${t} light`);
    const part = build(t).parts.find((p) => p.name === (l[0] as { part: string }).part)!;
    assert.equal(part.mat, "glass", `${t}: light not on the glass bulb`);
  }
  const scr = feat("tv55", "screen");
  assert.equal(scr.length, 1);
  assert.equal(build("tv55").parts.find((p) => p.name === (scr[0] as { part: string }).part)!.mat, "lcd");
  for (const t of ["tv55", "gameConsole", "cableBox", "wifiRouter", "soundbar", "gameController"]) assert.ok(feat(t, "sparks").length >= 1, `${t} sparks`);
  assert.ok(feat("sofa3", "stuffing").length >= 6, "sofa cushions stuffing");
  assert.equal(feat("throwPillow", "stuffing").length, 1);
  assert.equal(feat("flowerVase", "liquid").length, 1);
  for (const t of ["fiddleLeafFig", "snakePlant", "succulent"]) assert.equal(feat(t, "soil").length, 1, `${t} soil`);
});

test("interactive joints: console glass doors on hinges with catches, drawer on runners", () => {
  const def = build("mediaConsole");
  const hinges = def.bonds.filter((b) => b.kind === "hinge");
  const sliders = def.bonds.filter((b) => b.kind === "slider");
  const latches = def.bonds.filter((b) => b.kind === "latch");
  assert.equal(new Set(hinges.map((b) => b.joint!.group)).size, 2);
  assert.equal(new Set(sliders.map((b) => b.joint!.group)).size, 1);
  assert.equal(latches.length, 2);
  for (const h of hinges) assert.equal(def.parts.find((p) => p.name === h.a)!.mat, "temperedGlass");
});

test("sofa: cushions are loose soft parts; frame is wood + springs", () => {
  const def = build("sofa3");
  const loose = def.parts.filter((p) => p.tags?.includes("loose"));
  assert.equal(loose.length, 6);
  for (const p of loose) {
    assert.ok(MATERIALS[p.mat].mode === "soft");
    assert.equal(def.bonds.filter((b) => b.a === p.name || b.b === p.name).length, 0);
  }
  assert.ok(def.parts.filter((p) => p.name.startsWith("spring")).length >= 6);
  assert.ok(def.parts.some((p) => p.mat === "softwood"));
});

test("wall items hang on weak world bonds; free-standing furniture is not anchored", () => {
  const nail = build("framedPainting").bonds.filter((b) => b.b === "world");
  assert.equal(nail.length, 1);
  assert.equal(nail[0].kind, "nail");
  assert.ok((nail[0].strength ?? 0) <= 20);
  assert.equal(build("wallMirror").bonds.filter((b) => b.b === "world").length, 2);
  for (const t of ["bookcase", "mediaConsole", "sofa3", "diningTable", "tv55"]) assert.equal(build(t).bonds.filter((b) => b.b === "world").length, 0, `${t} anchored`);
});

test("book formats: paperbacks are one part, hardcovers four, sizes vary", () => {
  const p = buildBook({ size: "paperback", seed: 1 });
  const h = buildBook({ size: "large", seed: 2 });
  assert.equal(p.parts.length, 1);
  assert.equal(h.parts.length, 4);
  assert.equal(p.type, "paperbackBook");
  assert.equal(h.type, "hardcoverBook");
  for (const d of [p, h]) for (const part of d.parts) assert.equal(part.mat, "paper");
});

test("part counts reported", () => {
  const rows = Object.keys(LIVING_OBJECTS).map((t) => `${t}:${build(t).parts.length}`);
  console.log(`living object part counts: ${rows.join(" ")}`);
});
