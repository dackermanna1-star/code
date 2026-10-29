// Unit test: photo-backed surfaces render at the measured real-world size of their photo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { SURFACES } from "../../src/render/surfaces.ts";

const MANIFEST = new URL("../../public/assets/textures/manifest.json", import.meta.url);
/** Surfaces that deliberately borrow a photo at another scale (documented in surfaces.ts). */
const EXCEPTIONS = new Set(["food"]);

test("photo surfaces use the manifest's worldSizeMeters", { skip: !existsSync(MANIFEST) && "no texture manifest" }, () => {
  const rows = JSON.parse(readFileSync(MANIFEST, "utf8")) as Array<{ name: string; worldSizeMeters?: number }>;
  const ws = new Map(rows.map((r) => [r.name, r.worldSizeMeters]));
  const bad: string[] = [];
  for (const s of SURFACES) {
    if (s.tex.startsWith("proc:") || EXCEPTIONS.has(s.name)) continue;
    const m = ws.get(s.tex);
    if (m !== undefined && Math.abs(m - s.worldSize) > 1e-9) bad.push(`${s.name}: ${s.worldSize} vs ${m}`);
  }
  assert.deepEqual(bad, []);
});
