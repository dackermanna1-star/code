// Kitchen object builders: every builder builds and validates (full overlap check, no warnings),
// masses are realistic, features reference parts, results are deterministic.
// Run: node --test tests/unit/content-kitchen-objects.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { Builder } from "../../src/objects/lib/builder.ts";
import { KBUILD, BUILD_INFO } from "../../src/objects/kitchen/lib.ts";
import { KITCHEN_OBJECTS } from "../../src/objects/kitchen/index.ts";
import { polyVolume } from "../../src/geom/poly.ts";
import { MATERIALS } from "../../src/destruction/model/materials.ts";
import type { AssemblyDef } from "../../src/destruction/model/types.ts";

KBUILD.validate = "full";
KBUILD.record = true;
Builder.warnMode = "collect";

function massOf(def: AssemblyDef): number {
  let m = 0;
  for (const p of def.parts) m += p.mass ?? polyVolume(p.poly) * MATERIALS[p.mat].density;
  return m;
}

/** Realistic mass ranges (kg) per type. */
const MASS: Record<string, [number, number]> = {
  kitchenNorthRun: [230, 330], // 4 units + 152 kg of 30 mm stone + sink & plumbing
  kitchenWestRun: [160, 220], // 3 units (~30 kg each) + 92 kg stone
  kitchenIsland: [270, 350], // 3 units, MDF back/gables, 167 kg stone
  kitchenWallCabinet: [12, 24], // 0.8 m unit in 16 mm board ≈ 22.6 kg
  range: [45, 65],
  dishwasher: [35, 50],
  fridge: [70, 95],
  rangeHood: [9, 18],
  toaster: [1.5, 2.5],
  kettle: [1.0, 1.5],
  coffeeMaker: [1.2, 3],
  carafe: [0.35, 0.7], // incl. its plastic collar, handle, lid
  blender: [3, 5.5],
  plate: [0.4, 0.6],
  sidePlate: [0.2, 0.4],
  bowl: [0.25, 0.45],
  tumbler: [0.15, 0.3],
  wineGlass: [0.15, 0.2],
  kitchenMug: [0.28, 0.42],
  cutleryTray: [0.6, 1.5],
  knifeBlock: [1.2, 2.5],
  knife: [0.08, 0.25],
  cuttingBoard: [1, 2],
  dishRack: [1.5, 3.5],
  fruitBowl: [0.8, 1.6],
  fruit: [0.08, 0.3],
  paperTowelHolder: [0.7, 1.5],
  spiceRack: [0.5, 1.2],
  spiceJar: [0.07, 0.15],
  wineBottle: [1.2, 1.5], // full
  oilBottle: [0.8, 1.1], // full 0.5 l
  cerealBox: [0.3, 0.7],
  can: [0.3, 0.5],
  skillet: [2, 3.5],
  saucepan: [1.2, 2.2],
  stockPot: [2, 4],
  milkCarton: [0.9, 1.1],
  jar: [0.35, 0.6],
  juiceBottle: [0.9, 1.15],
  foodTub: [0.3, 0.8],
  pedalBin: [3, 5.5],
  recyclingBin: [1.5, 3],
  wallClock: [0.6, 1.4],
  barStool: [5, 9],
};

const PARTS_MAX: Record<string, number> = { kitchenNorthRun: 150, fridge: 120, range: 120, dishwasher: 120, kitchenIsland: 80, kitchenWestRun: 80, rangeHood: 60, pedalBin: 40 };

for (const [type, build] of Object.entries(KITCHEN_OBJECTS)) {
  test(`kitchen object '${type}' builds cleanly with a realistic mass`, () => {
    const def = build();
    const info = BUILD_INFO.get(def);
    assert.ok(info, "build info recorded");
    assert.deepEqual(info.warnings, [], `${type} warnings:\n${info.warnings.join("\n")}`);
    assert.ok(def.parts.length > 0);
    const m = massOf(def);
    assert.ok(Number.isFinite(m), "finite mass");
    const r = MASS[type];
    assert.ok(r, `mass range declared for ${type}`);
    assert.ok(m >= r[0] && m <= r[1], `${type} mass ${m.toFixed(2)} kg outside [${r[0]}, ${r[1]}]`);
    assert.ok(def.parts.length <= (PARTS_MAX[type] ?? 40), `${type} has ${def.parts.length} parts`);
    for (const p of def.parts) for (const v of p.poly.verts) assert.ok(Number.isFinite(v.x + v.y + v.z), `${p.name} NaN vertex`);
    const names = new Set(def.parts.map((p) => p.name));
    for (const f of def.features ?? []) assert.ok(names.has((f as { part: string }).part), `feature ${f.type} part`);
    for (const bd of def.bonds) {
      assert.ok(names.has(bd.a), `bond a ${bd.a}`);
      assert.ok(bd.b === "world" || names.has(bd.b), `bond b ${bd.b}`);
    }
  });
}

test("kitchen builders are deterministic", () => {
  for (const type of ["kitchenNorthRun", "fridge", "plate", "barStool", "range"]) {
    const a = JSON.stringify(KITCHEN_OBJECTS[type]({ seed: 5 }));
    const b = JSON.stringify(KITCHEN_OBJECTS[type]({ seed: 5 }));
    assert.equal(a, b, `${type} not deterministic`);
  }
});

test("kitchen features: water at faucet/pipes, lights under the cabinets, fridge hum, liquids", () => {
  const north = KITCHEN_OBJECTS.kitchenNorthRun();
  const water = (north.features ?? []).filter((f) => f.type === "water");
  assert.ok(water.length >= 6, "faucet + supply/drain water features");
  assert.ok(north.parts.some((p) => p.tags?.includes("faucet")), "spout tagged as faucet");
  assert.ok(north.bonds.some((b) => b.b === "world"), "run anchored to the wall");
  const wc = KITCHEN_OBJECTS.kitchenWallCabinet();
  assert.ok((wc.features ?? []).some((f) => f.type === "light"), "LED strip light");
  assert.ok(wc.bonds.some((b) => b.b === "world"), "wall cabinet screwed to the wall");
  const fridge = KITCHEN_OBJECTS.fridge();
  assert.ok((fridge.features ?? []).some((f) => f.type === "hum"), "fridge hum");
  assert.ok(fridge.bonds.some((b) => b.kind === "hinge"), "fridge doors hinged");
  assert.ok(fridge.bonds.some((b) => b.kind === "slider"), "crisper drawers slide");
  const range = KITCHEN_OBJECTS.range();
  assert.ok(range.bonds.some((b) => b.kind === "latch"), "oven door detent");
  assert.ok(range.parts.some((p) => p.name === "cooktop" && p.mat === "glass"), "breakable glass-ceramic top");
  for (const t of ["wineBottle", "oilBottle", "milkCarton", "kettle"]) assert.ok((KITCHEN_OBJECTS[t]().features ?? []).some((f) => f.type === "liquid"), `${t} liquid`);
  const hood = KITCHEN_OBJECTS.rangeHood();
  assert.ok((hood.features ?? []).some((f) => f.type === "light"), "hood lights");
});
