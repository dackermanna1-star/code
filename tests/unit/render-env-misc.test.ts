import { test } from "node:test";
import assert from "node:assert/strict";
import { noise1, fbm1, hash01 } from "../../src/render/env/noise.ts";
import { ShakeModel, FlashModel } from "../../src/render/env/shake.ts";
import { MeshBuffer } from "../../src/render/env/meshBuffer.ts";
import { hexToLinear, srgbToLinear } from "../../src/render/env/sunModel.ts";

test("noise1 is bounded, deterministic, smooth and zero on the lattice", () => {
  let maxAbs = 0;
  let maxStep = 0;
  let prev = noise1(0, 3);
  for (let i = 1; i <= 20000; i++) {
    const x = i * 0.001;
    const v = noise1(x, 3);
    assert.ok(Number.isFinite(v));
    maxAbs = Math.max(maxAbs, Math.abs(v));
    maxStep = Math.max(maxStep, Math.abs(v - prev));
    prev = v;
  }
  assert.ok(maxAbs <= 1.0001 && maxAbs > 0.3, `range ${maxAbs}`);
  assert.ok(maxStep < 0.01, `continuity ${maxStep}`);
  for (let i = -5; i <= 5; i++) assert.ok(Math.abs(noise1(i, 9)) < 1e-12);
  assert.equal(noise1(1.234, 5), noise1(1.234, 5));
  assert.notEqual(noise1(1.234, 5), noise1(1.234, 6));
  assert.equal(noise1(Number.NaN), 0);
  const f = fbm1(3.3, 1, 4);
  assert.ok(Math.abs(f) <= 1);
  for (let i = 0; i < 1000; i++) {
    const h = hash01(i, 7);
    assert.ok(h >= 0 && h < 1);
  }
});

test("camera shake: trauma² amplitude within limits, decays, respects the user scale", () => {
  const s = new ShakeModel();
  s.update(0.016);
  assert.equal(s.pos.x, 0);
  s.add(1);
  let maxRot = 0;
  let maxPos = 0;
  for (let i = 0; i < 20; i++) {
    s.update(1 / 60);
    maxRot = Math.max(maxRot, Math.abs(s.rot.x), Math.abs(s.rot.y), Math.abs(s.rot.z));
    maxPos = Math.max(maxPos, Math.abs(s.pos.x), Math.abs(s.pos.y), Math.abs(s.pos.z));
  }
  assert.ok(maxRot > 0.002 && maxRot <= 0.05 + 1e-9, `rot ${maxRot}`);
  assert.ok(maxPos > 0.001 && maxPos <= 0.045 + 1e-9, `pos ${maxPos}`);
  for (let i = 0; i < 120; i++) s.update(1 / 60);
  assert.equal(s.trauma, 0);
  assert.equal(s.rot.z, 0);
  // small knocks stay subtle (quadratic)
  s.add(0.2);
  s.update(1 / 120);
  assert.ok(Math.abs(s.rot.z) <= 0.05 * 0.2 * 0.2 + 1e-9);
  // user scale 0 disables
  s.add(1);
  s.update(1 / 60, 0);
  assert.equal(s.pos.y, 0);
  // garbage input is ignored
  s.add(Number.NaN);
  s.update(Number.NaN, Number.NaN);
  assert.ok(Number.isFinite(s.trauma));
  // reused output objects (no per-frame allocation)
  const ref = s.pos;
  s.update(0.01);
  assert.equal(ref, s.pos);
});

test("flash: strongest wins, fades exponentially", () => {
  const f = new FlashModel();
  f.trigger(0.8, 0xff0000);
  assert.equal(f.alpha, 0.8);
  assert.equal(f.color.x, 1);
  assert.equal(f.color.y, 0);
  f.trigger(0.2, 0x00ff00); // weaker: ignored
  assert.equal(f.color.y, 0);
  f.update(0.11);
  assert.ok(Math.abs(f.alpha - 0.8 * Math.exp(-1)) < 1e-9);
  for (let i = 0; i < 100; i++) f.update(0.05);
  assert.equal(f.alpha, 0);
});

test("mesh buffer quads/boxes use Babylon front-face winding", () => {
  const mb = new MeshBuffer();
  mb.box({ x: -1, y: 0, z: -2 }, { x: 1, y: 3, z: 2 });
  assert.equal(mb.vertexCount, 24);
  assert.equal(mb.indices.length, 36);
  const P = mb.positions;
  const N = mb.normals;
  for (let t = 0; t < mb.indices.length; t += 3) {
    const [a, b, c] = [mb.indices[t], mb.indices[t + 1], mb.indices[t + 2]];
    const e1 = [P[b * 3] - P[a * 3], P[b * 3 + 1] - P[a * 3 + 1], P[b * 3 + 2] - P[a * 3 + 2]];
    const e2 = [P[c * 3] - P[a * 3], P[c * 3 + 1] - P[a * 3 + 1], P[c * 3 + 2] - P[a * 3 + 2]];
    const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const d = cr[0] * N[a * 3] + cr[1] * N[a * 3 + 1] + cr[2] * N[a * 3 + 2];
    assert.ok(d < 0, "RH cross must oppose the outward normal");
  }
  const g = mb.build();
  assert.deepEqual([g.min.x, g.min.y, g.min.z, g.max.x, g.max.y, g.max.z], [-1, 0, -2, 1, 3, 2]);
  const mb2 = new MeshBuffer();
  mb2.box({ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 }, undefined, undefined, { skip: ["bottom", "top"] });
  assert.equal(mb2.vertexCount, 16);
  mb.append(mb2);
  assert.equal(mb.vertexCount, 40);
  assert.equal(Math.max(...mb.indices), 39);
});

test("colour helpers", () => {
  assert.ok(Math.abs(srgbToLinear(0.5) - 0.214) < 0.001);
  const [r, g, b] = hexToLinear(0xffffff);
  assert.ok(r === 1 && g === 1 && b === 1);
});
