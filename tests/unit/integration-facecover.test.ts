// Unit tests: face culling behind rigidly bonded neighbours (src/destruction/runtime/faceCover.ts,
// used by DestructionWorld.visiblePoly). Glass must never act as a cover: framed art and mirror
// backings stay visible through their panes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Builder } from "../../src/objects/lib/builder.ts";
import { buildObject, objectTypes } from "../../src/objects/registry.ts";
import { coveredFaces, polyHasTransparentFace } from "../../src/destruction/runtime/faceCover.ts";
import { polyHiddenFaces, type ConvexPoly } from "../../src/geom/poly.ts";
import type { AssemblyDef } from "../../src/destruction/model/types.ts";

Builder.warnMode = "collect";

const RIGID = (k: string) => k !== "hinge" && k !== "slider" && k !== "latch";

/** Rigidly bonded neighbour polys of each part (assembly space, like one island's frame). */
function neighbours(def: AssemblyDef): Map<string, ConvexPoly[]> {
  const byName = new Map(def.parts.map((p) => [p.name, p]));
  const out = new Map<string, ConvexPoly[]>();
  for (const b of def.bonds) {
    if (!RIGID(b.kind) || b.b === "world") continue;
    const pa = byName.get(b.a), pb = byName.get(b.b);
    if (!pa || !pb) continue;
    (out.get(pa.name) ?? out.set(pa.name, []).get(pa.name)!).push(pb.poly);
    (out.get(pb.name) ?? out.set(pb.name, []).get(pb.name)!).push(pa.poly);
  }
  return out;
}

/** Faces of an opaque part that the old rule (every bonded neighbour is a cover) hid only because of glass. */
function glassOnlyHidden(p: ConvexPoly, others: ConvexPoly[]): number[] {
  const naive = polyHiddenFaces(p, others);
  const opaque = polyHiddenFaces(p, others.filter((o) => !polyHasTransparentFace(o)));
  return [...naive].filter((i) => !opaque.has(i));
}

test("framedPrint / photoFrame: the art keeps its faces behind the glass", () => {
  for (const type of ["framedPrint", "photoFrame"]) {
    assert.ok(objectTypes().includes(type), type);
    const def = buildObject(type);
    const nb = neighbours(def);
    assert.ok(def.parts.some((p) => polyHasTransparentFace(p.poly)), `${type}: has a glass pane`);
    let exposed = 0;
    for (const p of def.parts) {
      if (polyHasTransparentFace(p.poly)) continue;
      const others = nb.get(p.name) ?? [];
      const viaGlass = glassOnlyHidden(p.poly, others);
      exposed += viaGlass.length;
      const hidden = coveredFaces(p.poly, others);
      for (const i of viaGlass) assert.ok(!hidden.has(i), `${type}.${p.name} face ${i} hidden behind glass`);
    }
    // the art's front face sits against the pane: the old rule hid it, the new one must not
    assert.ok(exposed > 0, `${type}: expected the art to be covered by the glass pane`);
  }
});

test("registry: no opaque part loses a face that only glass covers", () => {
  const bad: string[] = [];
  let viaGlassTotal = 0;
  for (const type of objectTypes()) {
    let def: AssemblyDef;
    try {
      def = buildObject(type);
    } catch {
      continue; // builder failures are covered by the content tests
    }
    const nb = neighbours(def);
    for (const p of def.parts) {
      if (polyHasTransparentFace(p.poly)) continue;
      const others = nb.get(p.name) ?? [];
      const viaGlass = glassOnlyHidden(p.poly, others);
      viaGlassTotal += viaGlass.length;
      const hidden = coveredFaces(p.poly, others);
      for (const i of viaGlass) if (hidden.has(i)) bad.push(`${type}.${p.name}#${i}`);
    }
  }
  assert.ok(viaGlassTotal > 10, `expected many glass-covered opaque faces in the registry, got ${viaGlassTotal}`);
  assert.deepEqual(bad, []);
});

test("coveredFaces still culls faces between opaque bonded neighbours", () => {
  let opaqueHidden = 0;
  for (const type of ["coffeeTable", "framedPrint", "microwave"]) {
    const def = buildObject(type);
    const nb = neighbours(def);
    for (const p of def.parts) opaqueHidden += coveredFaces(p.poly, nb.get(p.name) ?? []).size;
  }
  assert.ok(opaqueHidden > 0, "opaque covers must still hide faces");
});
