// Unit tests: world vertex layout packing (src/render/layout.ts) — exactness of the surf.z
// roughness/metallic packing against the shader's decode, glass opacity, emissive sign rules,
// and a full pass over every SURFACES entry.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  WORLD_STRIDE,
  OFF_NORMAL,
  OFF_UV,
  OFF_COLOR,
  OFF_SURF,
  SRGB_TO_LINEAR,
  SURFACE_ROW,
  glassOpacity,
  packRoughMetal,
  unpackRoughMetal,
  packSurfaceRow,
  emissiveFor,
} from "../../src/render/layout.ts";
import { SURFACES, S, registerSurface } from "../../src/render/surfaces.ts";

test("vertex layout offsets are contiguous", () => {
  assert.equal(OFF_NORMAL, 3);
  assert.equal(OFF_UV, 6);
  assert.equal(OFF_COLOR, 8);
  assert.equal(OFF_SURF, 12);
  assert.equal(WORLD_STRIDE, OFF_SURF + 4);
});

test("sRGB → linear LUT endpoints and monotonicity", () => {
  assert.equal(SRGB_TO_LINEAR[0], 0);
  assert.ok(Math.abs(SRGB_TO_LINEAR[255] - 1) < 1e-6);
  assert.ok(Math.abs(SRGB_TO_LINEAR[128] - 0.2158605) < 1e-4);
  for (let i = 1; i < 256; i++) assert.ok(SRGB_TO_LINEAR[i] > SRGB_TO_LINEAR[i - 1]);
});

test("roughness/metallic packing round-trips exactly through float32 (shader decode)", () => {
  const f = new Float32Array(1);
  for (let r = 0; r <= 255; r += 5) {
    for (const m of [0, 1, 37, 128, 255]) {
      const z = packRoughMetal(r / 255, m / 255);
      f[0] = z; // as stored in the vertex buffer
      // vertex shader: rm = floor(z+0.5); met = floor(rm/256); rgh = rm - met*256
      const d = unpackRoughMetal(f[0]);
      assert.ok(Math.abs(d.roughness - r / 255) < 1e-9, `rough ${r}`);
      assert.ok(Math.abs(d.metallic - m / 255) < 1e-9, `metal ${m}`);
      // simulate small interpolation noise (flat varyings make this unnecessary, but be safe)
      const noisy = unpackRoughMetal(f[0] + 0.3);
      assert.ok(Math.abs(noisy.roughness - r / 255) < 1e-9);
    }
  }
  // clamping
  assert.deepEqual(unpackRoughMetal(packRoughMetal(-1, 2)), { roughness: 0, metallic: 1 });
});

test("glass opacity: clear < frosted < smoked, always within [0.08, 0.95]", () => {
  const clear = glassOpacity(0xe8f4f0, 0.05);
  const frosted = glassOpacity(0xf4f8f8, 0.4);
  const smoked = glassOpacity(0x404850, 0.05);
  assert.ok(clear > 0.1 && clear < 0.3, `clear ${clear}`);
  assert.ok(frosted > 0.45 && frosted < 0.7, `frosted ${frosted}`);
  assert.ok(smoked > 0.65 && smoked <= 0.95, `smoked ${smoked}`);
  assert.ok(clear < frosted && frosted < smoked);
  for (const t of [0x000000, 0xffffff, 0x808080]) for (const r of [0, 0.5, 1, 7]) {
    const a = glassOpacity(t, r);
    assert.ok(a >= 0.08 && a <= 0.95);
  }
});

test("emissive sign convention: >0 mains (power scaled), <0 always on", () => {
  assert.equal(emissiveFor(6, 1), 6);
  assert.equal(emissiveFor(6, 0), 0);
  assert.equal(emissiveFor(-1.2, 0), 1.2);
  assert.equal(emissiveFor(0, 1), 0);
});

test("every surface packs to finite, sane values", () => {
  const row = new Float32Array(SURFACE_ROW);
  SURFACES.forEach((s, i) => {
    packSurfaceRow(s, i, i % 7, row);
    for (let k = 0; k < SURFACE_ROW; k++) assert.ok(Number.isFinite(row[k]), `${s.name}[${k}]`);
    assert.equal(row[0], i);
    assert.equal(row[1], i % 7);
    const d = unpackRoughMetal(row[2]);
    assert.ok(Math.abs(d.roughness - Math.min(1, Math.max(0, s.roughness))) <= 0.5 / 255 + 1e-9, s.name);
    assert.ok(Math.abs(d.metallic - s.metallic) <= 0.5 / 255 + 1e-9, s.name);
    assert.ok(Math.abs(row[4] - 1 / s.worldSize) < 1e-6 * (1 / s.worldSize), s.name);
    assert.equal(row[9], s.transparent ? 1 : 0, s.name);
    if (!s.transparent) assert.equal(row[8], 1, s.name);
    if (s.emissive) assert.ok(Math.abs(Math.abs(row[3]) - s.emissive) < 1e-6, s.name);
    else assert.equal(row[3], 0, s.name);
  });
  // mains vs always-on
  packSurfaceRow(SURFACES[S.bulb_on], 0, 0, row);
  assert.ok(row[3] > 1, "bulb is mains-powered HDR");
  packSurfaceRow(SURFACES[S.city_windows], 0, 0, row);
  assert.ok(row[3] < 0, "city windows stay lit in a power cut");
});

test("late-registered surfaces pack too (registerSurface)", () => {
  const idx = registerSurface({ name: "test_poster_a3", tex: "proc:poster_0", worldSize: 0.42, roughness: 0.6, metallic: 0, tint: 0xffffff });
  const row = new Float32Array(SURFACE_ROW);
  packSurfaceRow(SURFACES[idx], 3, 0, row);
  assert.ok(Math.abs(row[4] - 1 / 0.42) < 1e-5);
  assert.equal(registerSurface({ name: "test_poster_a3", tex: "proc:poster_0", worldSize: 1, roughness: 1, metallic: 0, tint: 0 }), idx);
});
