// Unit tests: reference objects + registry (src/objects/reference/*, src/objects/registry.ts).
// Every registered object must build warning-free under full validation, with valid bonds and
// features, no NaN, determinism, no substantial part overlaps (sample-based) and realistic mass.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Builder } from "../../src/objects/lib/builder.ts";
import { OBJECT_REGISTRY, buildObject, objectTypes, registerObject } from "../../src/objects/registry.ts";
import { buildMicrowave } from "../../src/objects/reference/microwave.ts";
import { buildChair } from "../../src/objects/reference/chair.ts";
import { buildCoffeeTable } from "../../src/objects/reference/coffeeTable.ts";
import { buildMug } from "../../src/objects/reference/mug.ts";
import { polyVolume } from "../../src/geom/poly.ts";
import { vlen, qaxisAngle, qrot, v3 } from "../../src/geom/vec.ts";
import { MATERIALS } from "../../src/destruction/model/materials.ts";
import { Rng } from "../../src/core/rng.ts";
import { aabbOf, overlappingPairs, polySd, samplePoly } from "../../src/objects/lib/contact.ts";
import type { AssemblyDef } from "../../src/destruction/model/types.ts";

Builder.warnMode = "collect";
Builder.validation = "full";

const MASS: Record<string, [number, number]> = {
  microwave: [11, 16],
  chair: [4, 7],
  coffeeTable: [18, 35],
  mug: [0.3, 0.45],
};

const massOf = (def: AssemblyDef): number => def.parts.reduce((s, p) => s + (p.mass ?? polyVolume(p.poly) * MATERIALS[p.mat].density), 0);
const finite = (...xs: number[]) => xs.every((x) => Number.isFinite(x));

/** Build through the registry with a fresh warning list (Builder records warnings per instance). */
function buildChecked(type: string): AssemblyDef {
  const warnings: string[] = [];
  const orig = Builder.prototype.build;
  Builder.prototype.build = function (this: Builder, o?: Parameters<typeof orig>[0]) {
    const d = orig.call(this, o);
    warnings.push(...this.warnings);
    return d;
  };
  try {
    const def = buildObject(type);
    assert.deepEqual(warnings, [], `${type} warnings:\n  ${warnings.join("\n  ")}`);
    return def;
  } finally {
    Builder.prototype.build = orig;
  }
}

function checkDef(def: AssemblyDef): void {
  const names = new Set(def.parts.map((p) => p.name));
  assert.equal(names.size, def.parts.length, "unique part names");
  // no NaN anywhere
  for (const p of def.parts) {
    for (const v of p.poly.verts) assert.ok(finite(v.x, v.y, v.z), `${p.name}: NaN vertex`);
    for (const f of p.poly.faces) {
      assert.ok(finite(f.n.x, f.n.y, f.n.z, f.d), `${p.name}: NaN plane`);
      assert.ok(finite(f.attr.uv.u.x, f.attr.uv.u.y, f.attr.uv.u.z, f.attr.uv.v.x, f.attr.uv.v.y, f.attr.uv.v.z, f.attr.uv.u0, f.attr.uv.v0), `${p.name}: NaN uv`);
      if (f.vn) for (const n of f.vn) assert.ok(finite(n.x, n.y, n.z), `${p.name}: NaN vertex normal`);
    }
    assert.ok(polyVolume(p.poly) > 1e-9, `${p.name}: degenerate`);
    if (p.mass !== undefined) assert.ok(p.mass > 0 && Number.isFinite(p.mass));
    if (p.grain) assert.ok(Math.abs(vlen(p.grain) - 1) < 1e-6);
  }
  // bonds valid
  const bonded = new Set<string>();
  for (const b of def.bonds) {
    assert.ok(names.has(b.a), `bond to unknown part ${b.a}`);
    assert.ok(b.b === "world" || names.has(b.b), `bond to unknown part ${b.b}`);
    assert.notEqual(b.a, b.b);
    if (b.strength !== undefined) assert.ok(b.strength >= 0 && Number.isFinite(b.strength), `${b.a}-${b.b} strength`);
    assert.ok(b.anchor && finite(b.anchor.x, b.anchor.y, b.anchor.z), `${b.a}-${b.b} anchor`);
    if (b.kind === "hinge" || b.kind === "slider" || b.kind === "latch") {
      assert.ok(b.joint, `${b.kind} without joint`);
      assert.ok(Math.abs(vlen(b.joint!.axis) - 1) < 1e-9 && b.joint!.min <= b.joint!.max && b.joint!.group);
    }
    bonded.add(b.a);
    bonded.add(b.b);
  }
  // every part bonded or tagged loose
  for (const p of def.parts) assert.ok(bonded.has(p.name) || p.tags?.includes("loose"), `${p.name} unbonded`);
  // features reference parts
  for (const f of def.features ?? []) assert.ok(names.has((f as { part: string }).part), `feature ${f.type} → unknown part`);
}

/** Sample-based overlap: no pair may share more than 5 % of the smaller part's volume. */
function checkOverlap(def: AssemblyDef): void {
  const rng = new Rng(0xbadc0de);
  const boxes = def.parts.map((p) => aabbOf(p.poly));
  const shrink = 1e-4;
  for (const [i, j] of overlappingPairs(boxes, -shrink)) {
    const A = def.parts[i],
      B = def.parts[j];
    const [s, l] = polyVolume(A.poly) <= polyVolume(B.poly) ? [A, B] : [B, A];
    const pts = samplePoly(s.poly, 200, rng);
    let inside = 0;
    for (const q of pts) if (polySd(l.poly, q) < -0.0005) inside++;
    assert.ok(inside / pts.length <= 0.05, `${s.name} overlaps ${l.name} by ~${((100 * inside) / pts.length).toFixed(0)}%`);
  }
}

test("every registered object builds clean, validates and reports its size", () => {
  const rows: string[] = [];
  for (const type of objectTypes()) {
    const def = buildChecked(type);
    checkDef(def);
    const m = massOf(def);
    if (MASS[type]) assert.ok(m >= MASS[type][0] && m <= MASS[type][1], `${type} mass ${m.toFixed(2)} kg outside ${MASS[type]}`);
    rows.push(`${type.padEnd(14)} parts ${String(def.parts.length).padStart(3)}  bonds ${String(def.bonds.length).padStart(3)}  features ${def.features?.length ?? 0}  mass ${m.toFixed(2)} kg`);
  }
  console.log("reference objects:\n  " + rows.join("\n  "));
});

test("reference objects: no substantial overlaps (sample-based)", () => {
  for (const type of Object.keys(MASS)) checkOverlap(buildObject(type));
});

test("reference objects are deterministic", () => {
  for (const type of Object.keys(MASS)) assert.equal(JSON.stringify(buildObject(type)), JSON.stringify(buildObject(type)), type);
});

test("microwave: the showcase is built like the real thing", () => {
  const def = buildMicrowave();
  const part = (n: string) => def.parts.find((p) => p.name === n)!;
  assert.ok(def.parts.length >= 40 && def.parts.length <= 80, `${def.parts.length} parts`);
  // casing: tessellated steel sheet panels
  for (const n of ["case_l", "case_r", "case_top", "case_back", "base"]) {
    assert.equal(part(n).mat, "steelSheet");
    assert.ok((part(n).tessCell ?? 0) > 0, `${n} dentable`);
  }
  // cavity: 5 enamelled steel panels, spot-welded
  const cav = def.parts.filter((p) => p.name.startsWith("cav_"));
  assert.equal(cav.length, 5);
  assert.ok(def.bonds.filter((b) => b.kind === "weld" && b.a.startsWith("cav_") && b.b.startsWith("cav_")).length >= 8);
  // door: 2 hinges in one group + a latch on a hook, left hinge axis opening to the front
  const hinges = def.bonds.filter((b) => b.kind === "hinge");
  assert.equal(hinges.length, 2);
  assert.equal(new Set(hinges.map((h) => h.joint!.group)).size, 1);
  const latch = def.bonds.find((b) => b.kind === "latch")!;
  assert.ok(latch && latch.a === "door_hook_t" && latch.joint!.group === hinges[0].joint!.group);
  // hinges on the viewer's left (+X, left-handed world); the free edge (-X) swings out to +Z
  assert.ok(hinges.every((h) => h.joint!.pivot.x > 0.2));
  const r = qrot(qaxisAngle(hinges[0].joint!.axis, 1.2), v3(-1, 0, 0));
  assert.ok(r.z > 0.9, "door swings out towards +Z");
  const cp = def.parts.find((p) => p.name === "cp_front")!;
  assert.ok(cp.poly.verts.every((v) => v.x < 0), "controls on the viewer's right (-X)");
  // controls: ≥ 12 press-fit buttons, a display with a screen feature
  const buttons = def.bonds.filter((b) => b.kind === "press" && b.b === "cp_front");
  assert.ok(buttons.length >= 14, `${buttons.length} buttons`);
  assert.ok(buttons.every((b) => (b.strength ?? 0) <= 3));
  assert.ok(def.features!.some((f) => f.type === "screen" && f.part === "display"));
  assert.ok(def.features!.some((f) => f.type === "sparks" && f.part === "ctrl_board"));
  // internals
  assert.equal(part("tt_plate").mat, "temperedGlass");
  assert.equal(part("door_pane0").mat, "temperedGlass");
  assert.equal(part("tr_core").mat, "castIron");
  const coreKg = polyVolume(part("tr_core").poly) * MATERIALS.castIron.density;
  assert.ok(coreKg > 2.5 && coreKg < 3.5, `transformer core ${coreKg.toFixed(2)} kg`);
  assert.equal(part("mag_magnet").mat, "ceramic");
  assert.ok(def.parts.filter((p) => p.name.startsWith("fan_blade")).length === 4);
  assert.ok(def.parts.filter((p) => p.name.startsWith("cord_")).length >= 4, "cord segments + plug");
  assert.ok(def.parts.filter((p) => p.name.startsWith("foot_") && p.mat === "rubber").length === 4);
  // sits on its feet at y = 0, front at z = +0.19 (+ handle)
  const minY = Math.min(...def.parts.flatMap((p) => p.poly.verts.map((v) => v.y)));
  assert.ok(Math.abs(minY) < 1e-9);
});

test("chair, coffee table and mug construction", () => {
  const chair = buildChair();
  assert.ok(chair.parts.every((p) => p.mat === "hardwood"));
  assert.equal(chair.parts.filter((p) => p.name.startsWith("leg_")).length, 4);
  assert.ok(chair.bonds.every((b) => b.b !== "world"), "free-standing");
  assert.ok(chair.bonds.filter((b) => b.kind === "dowel").length >= 16, "glued/doweled joinery");
  assert.ok(chair.parts.every((p) => p.grain), "all wood parts carry grain");

  const table = buildCoffeeTable();
  const glass = table.parts.find((p) => p.mat === "temperedGlass")!;
  assert.ok(glass, "tempered glass top");
  const gb = table.bonds.filter((b) => b.a === glass.name || b.b === glass.name);
  assert.ok(gb.length >= 4 && gb.every((b) => b.kind === "friction" && (b.strength ?? 0) <= 10), "glass rests on friction/clips");
  const top = Math.max(...table.parts.flatMap((p) => p.poly.verts.map((v) => v.y)));
  assert.ok(Math.abs(top - 0.44) < 1e-9, "flush top at 0.44 m");

  const mug = buildMug();
  const handle = mug.parts.filter((p) => p.name.includes("handle"));
  assert.ok(handle.length >= 3);
  assert.ok(mug.bonds.filter((b) => (b.a.includes("handle") || b.b.includes("handle")) && b.kind === "fused").length >= handle.length + 1, "handle fused along and into the wall");
  assert.ok(mug.parts.length <= 20);
});

test("registry: buildObject, objectTypes, registerObject", () => {
  assert.deepEqual(objectTypes(), [...objectTypes()].sort());
  for (const t of ["microwave", "chair", "coffeeTable", "mug"]) assert.ok(OBJECT_REGISTRY[t], t);
  assert.throws(() => buildObject("no-such-thing"), /unknown object type/);
  registerObject("testMug", () => buildMug({ tint: 0xff0000 }));
  assert.equal(buildObject("testMug").type, "mug");
  delete OBJECT_REGISTRY.testMug;
  // variants: options change appearance, not validity
  const white = buildMicrowave({ finish: "white" });
  assert.equal(white.parts.length, buildMicrowave().parts.length);
});
