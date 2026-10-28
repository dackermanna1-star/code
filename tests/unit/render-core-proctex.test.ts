// Unit tests: procedural texture toolkit + every canvas-free generator (runs in Node).
import { test } from "node:test";
import assert from "node:assert/strict";
import { SIZE, PIX, noise, fbm, ridged, cells, blur, heightToNormal, channel, fromFn, Img } from "../../src/render/proctex/kit.ts";
import { MATERIAL_GENERATORS } from "../../src/render/proctex/materials.ts";
import { TECH_GENERATORS } from "../../src/render/proctex/tech.ts";
import { PRINTED_GENERATORS } from "../../src/render/proctex/printed.ts";
import { interiorRadiance, interiorEnvironmentFaces, CUBE_FACES } from "../../src/render/proctex/envcube.ts";
import { measureSevenSeg } from "../../src/render/proctex/sevenseg.ts";

/** Mean absolute difference across the wrap seam vs. between interior neighbours (x and y). */
function seamRatio(c: Float32Array): number {
  let seam = 0,
    inner = 0;
  for (let y = 0; y < SIZE; y++) {
    seam += Math.abs(c[y * SIZE + SIZE - 1] - c[y * SIZE]);
    inner += Math.abs(c[y * SIZE + 127] - c[y * SIZE + 128]);
  }
  for (let x = 0; x < SIZE; x++) {
    seam += Math.abs(c[(SIZE - 1) * SIZE + x] - c[x]);
    inner += Math.abs(c[127 * SIZE + x] - c[128 * SIZE + x]);
  }
  return seam / Math.max(1e-9, inner);
}

test("value noise: range, determinism, seamless wrap", () => {
  const a = noise(8, 8, 42);
  const b = noise(8, 8, 42);
  assert.deepEqual(a, b);
  let lo = 1,
    hi = 0;
  for (const v of a) {
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  assert.ok(lo >= 0 && hi <= 1 && hi - lo > 0.5);
  assert.ok(seamRatio(a) < 2.5, `seam ratio ${seamRatio(a)}`);
  assert.notDeepEqual(noise(8, 8, 43), a);
});

test("fbm / ridged are normalised and seamless", () => {
  for (const c of [fbm(4, 4, 5, 7), ridged(3, 3, 4, 9), fbm(1, 32, 3, 11)]) {
    let lo = Infinity,
      hi = -Infinity;
    for (const v of c) {
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
    assert.ok(Math.abs(lo) < 1e-6 && Math.abs(hi - 1) < 1e-6);
    assert.ok(seamRatio(c) < 3, `seam ${seamRatio(c)}`);
  }
});

test("cells: f1 <= f2, ids in [0,1), seamless", () => {
  const c = cells(12, 5);
  for (let i = 0; i < PIX; i++) {
    assert.ok(c.f1[i] <= c.f2[i] + 1e-6);
    assert.ok(c.id[i] >= 0 && c.id[i] < 1);
  }
  assert.ok(seamRatio(c.f1) < 2.5);
});

test("blur preserves the mean (wrap-around box filter)", () => {
  const c = noise(32, 32, 3);
  const mean0 = c.reduce((a, v) => a + v, 0) / PIX;
  blur(c, 3, 2);
  const mean1 = c.reduce((a, v) => a + v, 0) / PIX;
  assert.ok(Math.abs(mean0 - mean1) < 1e-4);
});

test("heightToNormal: flat → (128,128,255); OpenGL convention for slopes", () => {
  const flat = heightToNormal(channel(0.5), 4);
  assert.deepEqual([flat[0], flat[1], flat[2], flat[3]], [128, 128, 255, 255]);
  // height rising to the right (+u): the normal tilts towards -x
  const rampX = heightToNormal(fromFn((x) => Math.sin((x / SIZE) * Math.PI * 2) * 0.5 + 0.5), 8);
  const iMid = 128 * SIZE + 0; // x = 0: slope positive
  assert.ok(rampX[iMid * 4] < 128, "nx < 0 where height increases to the right");
  // height rising UPWARDS in the image (towards row 0 = +v): normal tilts towards -y
  const rampY = heightToNormal(fromFn((_x, y) => Math.sin((-y / SIZE) * Math.PI * 2) * 0.5 + 0.5), 8);
  assert.ok(rampY[(0 * SIZE + 7) * 4 + 1] < 128, "ny < 0 where height increases towards the image top");
});

test("Img packs sRGB bytes with opaque alpha", () => {
  const im = Img.solid([1, 0.5, 0]);
  const d = im.toRGBA();
  assert.equal(d.length, PIX * 4);
  assert.deepEqual([d[0], d[1], d[2], d[3]], [255, 128, 0, 255]);
});

// generators that draw on a 2D canvas need a browser; the rest run here
const CANVAS_GENERATORS = new Set([
  "particleboard",
  "wallpaper",
  "insulation",
  "foliage",
  "pcb",
  "ic_chip",
  "display_digits",
  "panel_microwave",
  "panel_appliance",
  "keycaps",
  "grille",
  "city_windows",
]);

test("every canvas-free generator: size, finite, deterministic, seamless albedo", () => {
  const all = { ...MATERIAL_GENERATORS, ...TECH_GENERATORS, book_pages: PRINTED_GENERATORS.book_pages };
  let ran = 0;
  for (const [name, gen] of Object.entries(all)) {
    if (CANVAS_GENERATORS.has(name)) continue;
    const a = gen();
    assert.equal(a.rgba.length, PIX * 4, name);
    if (a.height) {
      assert.equal(a.height.length, PIX, name);
      for (let i = 0; i < PIX; i += 97) assert.ok(Number.isFinite(a.height[i]), `${name} height`);
    }
    if (a.rough && typeof a.rough !== "number") for (let i = 0; i < PIX; i += 97) assert.ok(Number.isFinite(a.rough[i]) && a.rough[i] >= 0, `${name} rough`);
    const b = gen();
    assert.deepEqual(a.rgba.subarray(0, 4096), b.rgba.subarray(0, 4096), `${name} deterministic`);
    // luminance channel seam check (tileable textures; mirror is a deliberate gradient)
    if (name !== "mirror") {
      const lum = new Float32Array(PIX);
      for (let i = 0; i < PIX; i++) lum[i] = (a.rgba[i * 4] * 0.2126 + a.rgba[i * 4 + 1] * 0.7152 + a.rgba[i * 4 + 2] * 0.0722) / 255;
      const r = seamRatio(lum);
      assert.ok(r < 3.5, `${name} seam ratio ${r.toFixed(2)}`);
    }
    ran++;
  }
  assert.ok(ran >= 35, `ran ${ran}`);
});

test("material stand-ins have plausible colours", () => {
  const mean = (name: string): number[] => {
    const d = MATERIAL_GENERATORS[name]().rgba;
    const m = [0, 0, 0];
    for (let i = 0; i < PIX; i++) for (let c = 0; c < 3; c++) m[c] += d[i * 4 + c] / 255 / PIX;
    return m;
  };
  const oak = mean("wood_oak");
  assert.ok(oak[0] > oak[1] && oak[1] > oak[2], "oak is warm brown");
  const copper = mean("copper");
  assert.ok(copper[0] > copper[1] * 1.3, "copper is reddish");
  const paint = mean("paint_wall");
  assert.ok(Math.abs(paint[0] - paint[2]) < 0.02 && paint[1] > 0.8, "paint is neutral light (tinted per room)");
  const rubber = mean("rubber");
  assert.ok(rubber[1] < 0.25, "rubber is dark");
});

test("seven-segment measure is consistent", () => {
  assert.ok(measureSevenSeg("12:00", 34, 64, 10) > 4 * 34);
  assert.equal(measureSevenSeg("", 34, 64, 10), 0);
});

test("interior environment: finite HDR, floor darker than ceiling, windows brightest", () => {
  const up = interiorRadiance(0, 1, 0);
  const down = interiorRadiance(0, -1, 0);
  const south = interiorRadiance(0, 0.2, -1);
  const north = interiorRadiance(0, 0.2, 1);
  const lum = (c: number[]): number => c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
  assert.ok(lum(up) > lum(down), "ceiling brighter than floor");
  assert.ok(lum(south) > 1, "south window is HDR bright");
  assert.ok(lum(south) > lum(north) * 2);
  const faces = interiorEnvironmentFaces(8);
  assert.equal(faces.length, 6);
  for (const f of faces) {
    assert.equal(f.length, 8 * 8 * 4);
    for (const v of f) assert.ok(Number.isFinite(v) && v >= 0);
  }
  // GL convention: face 0 (+X) centre looks east, face 5 (−Z) centre looks south
  assert.deepEqual(CUBE_FACES[0].n, [1, 0, 0]);
  assert.deepEqual(CUBE_FACES[5].n, [0, 0, -1]);
});
