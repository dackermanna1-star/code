// Bedroom object builders: every registered builder builds with full validation and NO warnings,
// masses sit in realistic ranges, features reference parts, data is finite and deterministic.
// Run: node --test tests/unit/content-bedrooms-objects.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { Builder } from "../../src/objects/lib/builder.ts";
import { polyVolume } from "../../src/geom/poly.ts";
import { MATERIALS } from "../../src/destruction/model/materials.ts";
import type { AssemblyDef } from "../../src/destruction/model/types.ts";
import { BEDROOM_OBJECTS } from "../../src/objects/bedroom/index.ts";
import { guitarOnStand } from "../../src/objects/bedroom/guitar.ts";
import { polyTransform } from "../../src/geom/poly.ts";
import { polyContact } from "../../src/objects/lib/contact.ts";

/** Realistic mass ranges (kg) per type id; brief ranges where the brief gives one. */
const MASS: Record<string, [number, number]> = {
  queenBed: [35, 55], // brief
  metalBed: [25, 45],
  mattress: [20, 30], // brief
  duvet: [1.5, 3.5],
  bedPillow: [0.4, 1.2],
  decoPillow: [0.25, 0.8],
  foldedClothes: [0.2, 0.6],
  laundryPile: [0.2, 0.8],
  nightstand: [8, 14], // brief
  bedsideLamp: [1.5, 3],
  dresser: [40, 60], // brief (incl. its mirror)
  wardrobe: [45, 70], // brief
  shoeBox: [0.5, 1.2],
  laundryBasket: [0.8, 2.5],
  framedPrint: [2, 6],
  chevalMirror: [9, 18],
  alarmClock: [0.2, 0.5],
  smartphone: [0.14, 0.22],
  waterGlass: [0.1, 0.3],
  book: [0.15, 1.2],
  perfume: [0.15, 0.35],
  jewelryBox: [0.4, 1.2],
  coffeeMug: [0.25, 0.45],
  paperStack: [0.05, 0.4],
  desk: [15, 30], // brief
  pcTower: [8, 14], // brief
  monitor: [3, 6], // brief
  keyboard: [0.7, 1.4],
  mouse: [0.06, 0.15],
  speaker: [0.4, 1.2],
  deskLamp: [2, 4],
  laptop: [1.5, 2.5], // brief
  officeChair: [12, 18], // brief
  bookshelf: [25, 45],
  guitar: [1.8, 2.6], // brief
  guitarStand: [1, 3.5],
  poster: [0.05, 0.4],
  beanbag: [3, 8],
};

function massOf(def: AssemblyDef): number {
  let m = 0;
  for (const p of def.parts) m += p.mass ?? polyVolume(p.poly) * MATERIALS[p.mat].density;
  return m;
}

function buildStrict(type: string, opts: Record<string, unknown> = {}): AssemblyDef {
  const prev = Builder.warnMode;
  Builder.warnMode = "throw";
  try {
    return BEDROOM_OBJECTS[type]({ validate: "full", ...opts });
  } finally {
    Builder.warnMode = prev;
  }
}

const finite = (x: number): boolean => Number.isFinite(x);

test("every bedroom type has a mass range and vice versa", () => {
  assert.deepEqual(Object.keys(BEDROOM_OBJECTS).sort(), Object.keys(MASS).sort());
});

for (const type of Object.keys(BEDROOM_OBJECTS)) {
  test(`${type}: builds with full validation and no warnings, realistic mass`, () => {
    const def = buildStrict(type);
    assert.equal(def.type, type, "def.type matches the registry key");
    assert.ok(def.parts.length >= 1);
    const names = new Set(def.parts.map((p) => p.name));
    assert.equal(names.size, def.parts.length, "unique part names");
    for (const p of def.parts) {
      for (const v of p.poly.verts) assert.ok(finite(v.x) && finite(v.y) && finite(v.z), `finite vertex in ${p.name}`);
      assert.ok(MATERIALS[p.mat], `material ${p.mat}`);
    }
    for (const b of def.bonds) {
      assert.ok(names.has(b.a), `bond part ${b.a}`);
      assert.ok(b.b === "world" || names.has(b.b), `bond part ${b.b}`);
    }
    for (const f of def.features ?? []) assert.ok(names.has((f as { part: string }).part), `feature ${f.type} part`);
    const m = massOf(def);
    const [lo, hi] = MASS[type];
    assert.ok(m >= lo && m <= hi, `${type} mass ${m.toFixed(2)} kg outside [${lo}, ${hi}]`);
    // origin convention: base on y = 0 for floor/surface objects (wall items hang from y = 0 too)
    let minY = Infinity;
    for (const p of def.parts) for (const v of p.poly.verts) minY = Math.min(minY, v.y);
    if (type !== "duvet") assert.ok(Math.abs(minY) < 0.0101, `${type} underside at y = ${minY.toFixed(4)} (expected ~0)`);
  });
}

test("builders are deterministic (same seed → identical data)", () => {
  for (const type of Object.keys(BEDROOM_OBJECTS)) {
    const a = JSON.stringify(BEDROOM_OBJECTS[type]({ seed: 7 }));
    const b = JSON.stringify(BEDROOM_OBJECTS[type]({ seed: 7 }));
    assert.equal(a, b, `${type} is not deterministic`);
  }
});

test("features: lamps light up, screens on the displays, liquids, stuffing, sparks", () => {
  const has = (type: string, kind: string, opts: Record<string, unknown> = {}): boolean => (BEDROOM_OBJECTS[type](opts).features ?? []).some((f) => f.type === kind);
  assert.ok(has("bedsideLamp", "light"));
  assert.ok(has("deskLamp", "light"));
  assert.ok(has("monitor", "screen"));
  assert.ok(has("laptop", "screen"));
  assert.ok(has("smartphone", "screen"));
  assert.ok(has("waterGlass", "liquid"));
  assert.ok(has("perfume", "liquid"));
  assert.ok(has("coffeeMug", "liquid"));
  assert.ok(has("mattress", "stuffing"));
  assert.ok(has("bedPillow", "stuffing"));
  assert.ok(has("pcTower", "sparks"));
  assert.ok(has("pcTower", "hum"));
  assert.ok(has("alarmClock", "sparks"));
});

test("interactive joints: drawers, doors, lids, casters, articulated lamp", () => {
  const groups = (type: string, kind: "hinge" | "slider"): number => new Set(BEDROOM_OBJECTS[type]().bonds.filter((b) => b.kind === kind).map((b) => b.joint?.group)).size;
  assert.equal(groups("nightstand", "slider"), 1);
  assert.equal(groups("dresser", "slider"), 6);
  assert.equal(groups("dresser", "hinge"), 1, "tilting mirror");
  assert.equal(groups("wardrobe", "hinge"), 2);
  assert.equal(groups("laptop", "hinge"), 1);
  assert.equal(groups("jewelryBox", "hinge"), 1);
  assert.equal(groups("officeChair", "hinge"), 6, "5 caster ball joints + seat swivel");
  assert.equal(groups("deskLamp", "hinge"), 4);
  // latches: wardrobe magnetic catches, jewelry box clasp
  assert.equal(BEDROOM_OBJECTS.wardrobe().bonds.filter((b) => b.kind === "latch").length, 2);
  assert.equal(BEDROOM_OBJECTS.jewelryBox().bonds.filter((b) => b.kind === "latch").length, 1);
});

test("keyboard has 87 individual press-fit keycaps", () => {
  const def = BEDROOM_OBJECTS.keyboard();
  const keys = def.parts.filter((p) => p.name.startsWith("key_"));
  assert.equal(keys.length, 87);
  const keyNames = new Set(keys.map((k) => k.name));
  const press = def.bonds.filter((b) => b.kind === "press" && keyNames.has(b.a));
  assert.equal(press.length, 87);
  for (const b of press) assert.ok((b.strength ?? 0) <= 3, "keycaps pop off easily");
});

test("PC tower has its internals as separate parts", () => {
  const names = BEDROOM_OBJECTS.pcTower().parts.map((p) => p.name);
  for (const n of ["glass", "mobo_board", "cpu", "cooler_fins", "cooler_fan", "ram0", "ram3", "gpu_pcb", "gpu_heatsink", "gpu_fan0", "gpu_fan1", "psu_top", "psu_pcb_board", "hdd", "ssd", "atx_cable_0"]) {
    assert.ok(names.includes(n), `missing ${n}`);
  }
  const glass = BEDROOM_OBJECTS.pcTower().parts.find((p) => p.name === "glass")!;
  assert.equal(glass.mat, "temperedGlass");
});

test("guitar rests on its stand: touching cradle and yoke, no penetration", () => {
  const { guitar, stand, guitarPose } = guitarOnStand();
  let minSep = Infinity;
  for (const g of guitar.parts) {
    const gp = polyTransform(g.poly, guitarPose);
    for (const s of stand.parts) {
      const c = polyContact(gp, s.poly, 0.01);
      if (c) minSep = Math.min(minSep, c.sep);
    }
  }
  assert.ok(minSep > -0.0005, `guitar penetrates the stand by ${(-minSep * 1000).toFixed(1)} mm`);
  assert.ok(minSep < 0.002, `guitar floats ${(minSep * 1000).toFixed(1)} mm above its supports`);
});

test("flat soft goods keep ≤ 16 hull points so the physics hull is exact (things rest on them)", () => {
  // src/physics/physics.ts decimates hulls with more points to k-DOP support points, which would
  // turn a finely sampled mattress/duvet top into a shallow pyramid
  const check = (type: string, parts: string[]): void => {
    const def = BEDROOM_OBJECTS[type]();
    for (const name of parts) {
      const p = def.parts.find((q) => q.name === name);
      assert.ok(p, `${type}: missing ${name}`);
      assert.ok(p!.poly.verts.length <= 16, `${type}:${name} has ${p!.poly.verts.length} hull points`);
      // flat top: at least 4 vertices at the maximum height
      let top = -Infinity;
      for (const v of p!.poly.verts) top = Math.max(top, v.y);
      assert.ok(p!.poly.verts.filter((v) => Math.abs(v.y - top) < 1e-6).length >= 4, `${type}:${name} has no flat top`);
    }
  };
  check("mattress", ["core", "pillow_top"]);
  check("duvet", ["main", "hem", "drape_l", "drape_r"]);
  check("foldedClothes", ["cloth"]);
  check("officeChair", ["seat_cushion"]);
  const bag = BEDROOM_OBJECTS.beanbag().parts.find((q) => q.name === "bag")!;
  assert.ok(bag.poly.verts.length <= 16, `beanbag has ${bag.poly.verts.length} hull points`);
});

test("office chair casters: ball-jointed wheels at the wheel centre, hood pressed into the leg", () => {
  const def = BEDROOM_OBJECTS.officeChair();
  for (let k = 0; k < 5; k++) {
    const balls = def.bonds.filter((b) => b.kind === "hinge" && b.a === `caster${k}_wheel`);
    assert.equal(balls.length, 1, "one pivot → ball-and-socket");
    const wheel = def.parts.find((p) => p.name === `caster${k}_wheel`)!;
    let cx = 0,
      cy = 0,
      cz = 0;
    for (const v of wheel.poly.verts) {
      cx += v.x / wheel.poly.verts.length;
      cy += v.y / wheel.poly.verts.length;
      cz += v.z / wheel.poly.verts.length;
    }
    const pv = balls[0].joint!.pivot;
    assert.ok(Math.hypot(pv.x - cx, pv.y - cy, pv.z - cz) < 0.002, "pivot at the wheel centre (no moment on the joint)");
    assert.ok(def.bonds.some((b) => b.kind === "press" && b.a === `caster${k}_hood` && b.b === `leg${k}`));
  }
});
