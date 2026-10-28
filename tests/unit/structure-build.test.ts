// Unit tests for buildStructure(): validity of every assembly, part budget, masses, no NaN,
// determinism, no interpenetrating parts, nothing floating (every rigid group is anchored to the
// building or hangs on a joint from an anchored group).
// Run: node --test tests/unit/structure-build.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { polyVolume } from "../../src/geom/poly.ts";
import { MATERIALS } from "../../src/destruction/model/materials.ts";
import { JOINT_KINDS, type AssemblyDef, type PartDef } from "../../src/destruction/model/types.ts";
import { buildStructure, structureStats } from "../../src/world/structure.ts";
import { allParts, overlaps } from "./structure-helpers.ts";
import { Builder } from "../../src/objects/lib/builder.ts";

const t0 = performance.now();
const pieces = buildStructure();
const buildMs = performance.now() - t0;
const defs = pieces.map((p) => p.def);

const massOf = (p: PartDef) => p.mass ?? polyVolume(p.poly) * MATERIALS[p.mat].density;
const asmMass = (d: AssemblyDef) => d.parts.reduce((s, p) => s + massOf(p), 0);

test("structure builds within the part budget and reports totals", () => {
  const st = structureStats(pieces);
  const totalMass = defs.reduce((s, d) => s + asmMass(d), 0);
  console.log(`structure: ${st.assemblies} assemblies, ${st.parts} parts, ${st.bonds} bonds, ${st.joints} joint bonds, ${(totalMass / 1000).toFixed(1)} t, built in ${buildMs.toFixed(0)} ms`);
  const byType = new Map<string, { n: number; parts: number; mass: number }>();
  for (const d of defs) {
    const e = byType.get(d.type) ?? { n: 0, parts: 0, mass: 0 };
    e.n++;
    e.parts += d.parts.length;
    e.mass += asmMass(d);
    byType.set(d.type, e);
  }
  for (const [k, v] of byType) console.log(`  ${k.padEnd(16)} ×${String(v.n).padStart(2)}  parts ${String(v.parts).padStart(5)}  mass ${(v.mass / 1000).toFixed(2)} t`);
  assert.ok(st.parts >= 2500 && st.parts <= 5000, `part count ${st.parts}`);
  // runtime cost (the browser uses the builder's "basic" validation); the first build above ran
  // the slow "full" test validation
  const prev = Builder.validation;
  Builder.validation = "basic";
  try {
    buildStructure();
    const t = performance.now();
    buildStructure();
    const ms = performance.now() - t;
    console.log(`  runtime build (basic validation, warm): ${ms.toFixed(0)} ms`);
    assert.ok(ms < 4000, `runtime build took ${ms} ms`);
  } finally {
    Builder.validation = prev;
  }
  assert.ok(pieces.every((p) => p.xf.q.w === 1 && p.xf.p.x === 0 && p.xf.p.y === 0 && p.xf.p.z === 0), "identity transforms");
});

test("every assembly is valid: unique parts, bonds/joints/features reference parts, no NaN", () => {
  const finite = (v: { x: number; y: number; z: number }) => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
  for (const d of defs) {
    assert.ok(d.parts.length > 0, d.name);
    assert.equal(d.category === "structure" || d.category === "fixture", true);
    assert.ok(d.value > 0, `${d.name} value`);
    const names = new Set<string>();
    for (const p of d.parts) {
      assert.ok(!names.has(p.name), `${d.name}: duplicate ${p.name}`);
      names.add(p.name);
      assert.ok(polyVolume(p.poly) > 1e-9, `${d.name}/${p.name} volume`);
      for (const v of p.poly.verts) assert.ok(finite(v), `${d.name}/${p.name} NaN vertex`);
      for (const f of p.poly.faces) assert.ok(finite(f.n) && Number.isFinite(f.d), `${d.name}/${p.name} NaN face`);
      assert.ok(massOf(p) > 0 && Number.isFinite(massOf(p)), `${d.name}/${p.name} mass`);
    }
    for (const b of d.bonds) {
      assert.ok(names.has(b.a), `${d.name}: bond a ${b.a}`);
      assert.ok(b.b === "world" || names.has(b.b), `${d.name}: bond b ${b.b}`);
      assert.ok(b.anchor && finite(b.anchor), `${d.name}: bond anchor ${b.a}-${b.b}`);
      assert.ok(b.strength === undefined || (Number.isFinite(b.strength) && b.strength > 0), `${d.name}: strength ${b.a}-${b.b}`);
      if (b.kind === "hinge" || b.kind === "slider" || b.kind === "latch") {
        assert.ok(b.joint && finite(b.joint.axis) && finite(b.joint.pivot) && b.joint.group, `${d.name}: joint ${b.a}`);
        assert.ok(Math.abs(Math.hypot(b.joint!.axis.x, b.joint!.axis.y, b.joint!.axis.z) - 1) < 1e-6);
      }
    }
    for (const f of d.features ?? []) assert.ok(names.has((f as { part: string }).part), `${d.name}: feature ${f.type}`);
  }
});

test("deterministic: two builds are identical", () => {
  const again = buildStructure().map((p) => p.def);
  assert.equal(again.length, defs.length);
  for (let i = 0; i < defs.length; i++) assert.equal(JSON.stringify(again[i]), JSON.stringify(defs[i]), defs[i].name);
});

test("no two parts interpenetrate (across all assemblies, > 0.5 mm)", () => {
  const ov = overlaps(allParts(defs), 0.0005);
  const msg = ov
    .slice(0, 10)
    .map((o) => `${o.a.asm.name}/${o.a.part.name} × ${o.b.asm.name}/${o.b.part.name} (${(o.depth * 1000).toFixed(1)} mm)`)
    .join("\n");
  assert.equal(ov.length, 0, msg);
});

test("nothing floats: every rigid group is anchored or hangs on a joint from an anchored group", () => {
  for (const d of defs) {
    const idx = new Map(d.parts.map((p, i) => [p.name, i]));
    const parent = d.parts.map((_, i) => i);
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    const anchored = new Set<number>();
    for (const b of d.bonds) {
      if (b.b === "world") continue;
      if (JOINT_KINDS.has(b.kind) || b.kind === "latch") continue;
      parent[find(idx.get(b.a)!)] = find(idx.get(b.b)!);
    }
    for (const b of d.bonds) if (b.b === "world" && !JOINT_KINDS.has(b.kind) && b.kind !== "latch") anchored.add(find(idx.get(b.a)!));
    // joint-hung groups
    let changed = true;
    while (changed) {
      changed = false;
      for (const b of d.bonds) {
        if (!JOINT_KINDS.has(b.kind)) continue;
        const ra = find(idx.get(b.a)!),
          rb = b.b === "world" ? -1 : find(idx.get(b.b)!);
        if ((rb === -1 || anchored.has(rb)) && !anchored.has(ra)) {
          anchored.add(ra);
          changed = true;
        }
      }
    }
    const floating = d.parts.filter((_, i) => !anchored.has(find(i))).map((p) => p.name);
    assert.deepEqual(floating, [], `${d.name}: floating parts`);
  }
});

test("realistic masses of key components", () => {
  const find = (type: string, name?: string) => defs.filter((d) => d.type === type && (!name || d.name === name));
  const leafMass = (d: AssemblyDef) => {
    // parts reachable from the hinge stile through rigid bonds
    const hinge = d.bonds.find((b) => b.kind === "hinge")!;
    const adj = new Map<string, string[]>();
    for (const b of d.bonds) {
      if (b.b === "world" || JOINT_KINDS.has(b.kind) || b.kind === "latch") continue;
      (adj.get(b.a) ?? adj.set(b.a, []).get(b.a)!).push(b.b);
      (adj.get(b.b) ?? adj.set(b.b, []).get(b.b)!).push(b.a);
    }
    const seen = new Set([hinge.a]);
    const st = [hinge.a];
    while (st.length) for (const n of adj.get(st.pop()!) ?? []) if (!seen.has(n)) (seen.add(n), st.push(n));
    return d.parts.filter((p) => seen.has(p.name)).reduce((s, p) => s + massOf(p), 0);
  };
  for (const d of find("door_interior")) {
    const m = leafMass(d);
    assert.ok(m > 10 && m < 17, `${d.name} leaf ${m.toFixed(1)} kg`);
  }
  const fd = find("door_front")[0];
  const fm = leafMass(fd);
  assert.ok(fm > 30 && fm < 46, `front door leaf ${fm.toFixed(1)} kg`);
  for (const d of find("window")) {
    const m = leafMass(d);
    assert.ok(m > 12 && m < 45, `${d.name} sash ${m.toFixed(1)} kg`);
  }
  // a full drywall sheet ≈ 25–30 kg, a laminate plank ≈ 1.9 kg, a floor tile ≈ 2 kg
  const sheet = defs.flatMap((d) => d.parts).find((p) => p.name.startsWith("shP_") && polyVolume(p.poly) > 1.1 * 2.6 * 0.0124)!;
  assert.ok(massOf(sheet) > 22 && massOf(sheet) < 32, `sheet ${massOf(sheet)}`);
  const plank = defs.flatMap((d) => d.parts).filter((p) => p.tags?.includes("plank")).sort((a, b) => massOf(b) - massOf(a))[0];
  assert.ok(Math.abs(massOf(plank) - 1.2 * 0.19 * 0.012 * 700) < 0.05, `plank ${massOf(plank)}`);
  const tile = defs.flatMap((d) => d.parts).filter((p) => p.tags?.includes("tile")).sort((a, b) => massOf(b) - massOf(a))[0];
  assert.ok(massOf(tile) > 1.8 && massOf(tile) < 2.2, `tile ${massOf(tile)}`);
});

test("rigid islands: static assemblies stay one island (a hidden underlay may be a second)", () => {
  let total = 0;
  for (const d of defs) {
    const idx = new Map(d.parts.map((p, i) => [p.name, i]));
    const parent = d.parts.map((_, i) => i);
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    for (const b of d.bonds) {
      if (b.b === "world" || JOINT_KINDS.has(b.kind) || b.kind === "latch") continue;
      parent[find(idx.get(b.a)!)] = find(idx.get(b.b)!);
    }
    const roots = new Set(d.parts.map((_, i) => find(i)));
    total += roots.size;
    const jointed = d.bonds.some((b) => JOINT_KINDS.has(b.kind));
    const allowed = jointed ? 2 : d.type === "floor_laminate" || d.type === "floor_carpet" ? 2 : 1;
    assert.ok(roots.size <= allowed, `${d.name}: ${roots.size} rigid islands`);
  }
  console.log(`  rigid islands at spawn: ${total}`);
  assert.ok(total <= 70, `${total} islands`);
});
