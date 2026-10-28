// Unit tests for CC0 sample classification/selection and the default sound portals.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { classifySample, selectSamples, type ManifestRow } from "../../src/audio/samples.ts";
import { SAMPLE_FOR_ID, SAMPLE_FOR_PROFILE } from "../../src/audio/mapping.ts";
import { defaultPortals } from "../../src/audio/portals.ts";

test("classifySample maps manifest categories and names to layers", () => {
  const c = (file: string, category: string) => classifySample({ file, category, durationSec: 0.5 });
  assert.deepEqual(c("kenney_impact/impactglass_heavy_000.ogg", "impact_glass"), { layer: "impact.glass", intensity: 1 });
  assert.equal(c("kenney_impact/impactglass_light_001.ogg", "impact_glass")?.intensity, 0.2);
  assert.equal(c("kenney_impact/impacttin_medium_000.ogg", "impact_metal")?.layer, "impact.metalThin");
  assert.equal(c("kenney_impact/impactmetal_heavy_000.ogg", "impact_metal")?.layer, "impact.metal");
  assert.equal(c("kenney_impact/impactbell_heavy_000.ogg", "impact_metal"), null, "bells excluded");
  assert.equal(c("kenney_rpg/bookplace1.ogg", "impact_soft")?.layer, "impact.paper");
  assert.equal(c("oga_doors/doorclose01.ogg", "door")?.layer, "door.slam");
  assert.equal(c("oga_doors/dooropen01.ogg", "door"), null);
  assert.equal(c("oga_100sfx/microwave_door_close.ogg", "door"), null);
  assert.equal(c("oga_owlish/footsteps_hard_footstep1.ogg", "footstep_tile")?.layer, "step.tile");
  assert.equal(c("x/whatever.ogg", "misc"), null);
  assert.equal(classifySample({ file: "oga_water/loop_rain.ogg", category: "water", durationSec: 30 }), null);
});

test("selectSamples is balanced, deterministic and capped", () => {
  const rows: ManifestRow[] = [];
  for (let i = 0; i < 30; i++) rows.push({ file: `p/impactwood_${i % 3 === 0 ? "heavy" : i % 3 === 1 ? "light" : "medium"}_${i}.ogg`, category: "impact_wood", durationSec: 0.4 });
  for (let i = 0; i < 4; i++) rows.push({ file: `p/punch_${i}.ogg`, category: "punch", durationSec: 0.3 });
  rows.push({ file: "p/readme.txt", category: "impact_wood" });
  const a = selectSamples(rows, 6, 100);
  assert.deepEqual(a, selectSamples(rows, 6, 100));
  assert.equal(a.filter((s) => s.layer === "impact.wood").length, 6);
  assert.equal(a.filter((s) => s.layer === "punch").length, 4);
  const ints = new Set(a.filter((s) => s.layer === "impact.wood").map((s) => s.intensity));
  assert.ok(ints.size >= 2, "spread across intensities");
  assert.ok(selectSamples(rows, 6, 5).length === 5);
});

test("real manifest (if present) yields layers the mapping uses", () => {
  const path = new URL("../../public/assets/sounds/manifest.json", import.meta.url);
  if (!existsSync(path)) return; // optional asset pack
  const rows = JSON.parse(readFileSync(path, "utf8")) as ManifestRow[];
  const sel = selectSamples(rows);
  assert.ok(sel.length > 20 && sel.length <= 110, `selected ${sel.length}`);
  const layers = new Set(sel.map((s) => s.layer));
  for (const want of ["impact.wood", "impact.metal", "impact.glass", "punch", "step.wood", "shatter.glass"]) assert.ok(layers.has(want), want);
  const used = new Set([...Object.values(SAMPLE_FOR_ID), ...Object.values(SAMPLE_FOR_PROFILE)]);
  for (const l of layers) assert.ok(used.has(l), `layer ${l} is never used by the mapping`);
  for (const s of sel) assert.ok(existsSync(new URL(`../../public/assets/sounds/${s.file}`, import.meta.url)), `missing file ${s.file}`);
});

test("default portals: doorways and open-plan boundaries of the apartment", () => {
  const p = defaultPortals();
  assert.ok(p.length >= 8, `portals ${p.length}`);
  const near = (x: number, z: number) => p.some((q) => Math.hypot(q.x - x, q.z - z) < 0.35);
  assert.ok(near(1.8, 5.6), "bathroom door");
  assert.ok(near(3.25, 4.4), "master bedroom door");
  assert.ok(near(10.05, 4.4), "bedroom 2 door");
  assert.ok(near(9.2, 5.2), "foyer arch");
  assert.ok(near(6.6, 5.0), "living/kitchen open plan");
  assert.ok(near(4.0, 4.7), "hall/living opening");
  for (const q of p) assert.ok(q.y > 0.5 && q.y < 2.2 && Number.isFinite(q.x) && Number.isFinite(q.z));
});
