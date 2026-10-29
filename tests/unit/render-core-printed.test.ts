// Unit tests: printed artwork fitting (src/render/printed.ts) — builder-side fracture-stable
// UVMap, and the batcher's per-face fallback (seam crossing, strips, tiled areas, multi-face).
import { test } from "node:test";
import assert from "node:assert/strict";
import { printedFaceUV, fitPrintedUVs, PrintedFitScratch, FIT_INSET, PRINTED_BAND, isPrintedSurface, PRINTED_TEXTURES } from "../../src/render/printed.ts";
import { SURFACES, S } from "../../src/render/surfaces.ts";
import { packSurfaceRow, SURFACE_ROW } from "../../src/render/layout.ts";

const dot = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number => a.x * b.x + a.y * b.y + a.z * b.z;

test("printed textures are exactly the whole-picture generators", () => {
  for (const s of SURFACES) if (s.tex.startsWith("proc:")) assert.equal(isPrintedSurface(s), PRINTED_TEXTURES.has(s.tex));
  assert.ok(isPrintedSurface(SURFACES[S.painting_0]));
  assert.ok(isPrintedSurface(SURFACES[S.book_cover_2]));
  assert.ok(!isPrintedSurface(SURFACES[S.keycaps]), "keycaps tile (2 cm key pitch)");
  assert.ok(!isPrintedSurface(SURFACES[S.wood_oak]));
  const row = new Float32Array(SURFACE_ROW);
  packSurfaceRow(SURFACES[S.poster_0], 3, 0, row);
  assert.equal(row[10], 1);
  packSurfaceRow(SURFACES[S.concrete], 3, 0, row);
  assert.equal(row[10], 0);
});

test("printedFaceUV maps a wall face onto exactly one tile, upright and unmirrored", () => {
  const ws = 0.8;
  // painting canvas 0.9 × 0.65 facing +Z, centred at (2, 1.4, -3)
  const pts = [
    { x: 1.55, y: 1.075, z: -3 },
    { x: 2.45, y: 1.075, z: -3 },
    { x: 2.45, y: 1.725, z: -3 },
    { x: 1.55, y: 1.725, z: -3 },
  ];
  const n = { x: 0, y: 0, z: 1 };
  const m = printedFaceUV(pts, n, ws);
  const uv = pts.map((p) => [dot(p, m.u) + m.u0, dot(p, m.v) + m.v0]);
  const us = uv.map((t) => t[0]),
    vs = uv.map((t) => t[1]);
  // exactly the reserved band tile (marks the face as builder-mapped for the batcher)
  const B = PRINTED_BAND;
  assert.ok(Math.abs(Math.min(...us) - ws * (B + FIT_INSET)) < 1e-9);
  assert.ok(Math.abs(Math.max(...us) - ws * (B + 1 - FIT_INSET)) < 1e-9);
  assert.ok(Math.abs(Math.min(...vs) - ws * (B + FIT_INSET)) < 1e-9);
  assert.ok(Math.abs(Math.max(...vs) - ws * (B + 1 - FIT_INSET)) < 1e-9);
  // upright: the top edge has the larger v
  assert.ok(uv[2][1] > uv[1][1]);
  // unmirrored from outside: U = cross(N, V) (left-handed viewer looking along −N has +U to the right)
  assert.ok(m.u.x < 0, "u runs towards −X for a +Z face");
  // a fragment of that face keeps its piece of the picture (same map, sub-range)
  const frag = [pts[0], { x: 2.0, y: 1.075, z: -3 }, { x: 2.0, y: 1.4, z: -3 }];
  for (const p of frag) {
    const u = dot(p, m.u) + m.u0;
    assert.ok(u >= ws * (B + FIT_INSET) - 1e-9 && u <= ws * (B + 1 - FIT_INSET) + 1e-9);
  }
  // upward face (rug, paper on a desk): image up = −Z, so a viewer at the object's +Z front
  // sees it upright and unmirrored (same convention as screens.ts); no NaN for degenerate input
  const rug = printedFaceUV(
    [
      { x: 0, y: 0, z: 0 },
      { x: 1.4, y: 0, z: 0 },
      { x: 1.4, y: 0, z: 2 },
      { x: 0, y: 0, z: 2 },
    ],
    { x: 0, y: 1, z: 0 },
    2,
  );
  assert.ok(rug.v.z < 0 && Math.abs(rug.v.x) < 1e-9, "image up is −Z (far side from the +Z front)");
  assert.ok(rug.u.x < 0, "image right is −X (viewer at +Z looking towards −Z has +X on the left)");
  assert.ok(Number.isFinite(rug.u0) && Number.isFinite(rug.v0));
  const down = printedFaceUV([{ x: 0, y: 2, z: 0 }, { x: 1, y: 2, z: 1 }], { x: 0, y: -1, z: 0 }, 1);
  assert.ok(down.v.z < 0, "downward faces use −Z as image up too");
  const deg = printedFaceUV([{ x: 1, y: 1, z: 1 }], { x: 0, y: 0, z: 1 }, 0);
  assert.ok([deg.u.x, deg.u.y, deg.u.z, deg.v.x, deg.v.y, deg.v.z, deg.u0, deg.v0].every(Number.isFinite));
});

/** Quad (2 triangles, own 4 vertices) with uv corners (u0,v0)-(u1,v1) in metres. */
function quads(spec: Array<{ u0: number; v0: number; u1: number; v1: number; surf: number }>): { uvs: Float32Array; surf: Uint16Array; idx: Uint32Array; vc: number } {
  const uvs: number[] = [],
    surf: number[] = [],
    idx: number[] = [];
  for (const q of spec) {
    const b = uvs.length / 2;
    uvs.push(q.u0, q.v0, q.u1, q.v0, q.u1, q.v1, q.u0, q.v1);
    surf.push(q.surf, q.surf, q.surf, q.surf);
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  return { uvs: new Float32Array(uvs), surf: new Uint16Array(surf), idx: new Uint32Array(idx), vc: uvs.length / 2 };
}

const inv = (s: number): number => 1 / SURFACES[s].worldSize;
const printedOf = (s: number): boolean => isPrintedSurface(SURFACES[s]);
const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-5;
const LO = FIT_INSET,
  HI = 1 - FIT_INSET;
/** Is quad q of `out` fitted onto exactly one tile [LO, HI]² with preserved orientation? */
function isFitted(out: Float32Array, q: number): boolean {
  const o = q * 8;
  return near(out[o], LO) && near(out[o + 1], LO) && near(out[o + 4], HI) && near(out[o + 5], HI) && out[o + 2] > out[o] && out[o + 5] > out[o + 3];
}

test("fitPrintedUVs: every whole printed face is fitted onto one tile; strips and other surfaces stay raw", () => {
  const P = S.painting_0,
    W = S.wood_oak;
  const w0 = SURFACES[P].worldSize;
  const g = quads([
    // 0: painting face 0.9×0.65 m at a random offset, crossing a seam → fitted
    { u0: 1.33, v0: 2.21, u1: 1.33 + 0.9, v1: 2.21 + 0.65, surf: P },
    // 1: the same kind of face whose random offset leaves it inside one tile → fitted too
    { u0: w0 * 2 + 0.01, v0: 0.01, u1: w0 * 3 - 0.2, v1: w0 - 0.3, surf: P },
    // 2: narrow strip (book spine / carton side) across a seam → raw
    { u0: w0 - 0.02, v0: 0.1, u1: w0 + 0.02, v1: 0.6, surf: P },
    // 3: printed face covering 3 × 3 tiles (worldSize too small for this use) → fitted
    { u0: 0.1, v0: 0.1, u1: 0.1 + 3 * w0, v1: 0.1 + 3 * w0, surf: P },
    // 4: non-printed surface crossing seams → raw
    { u0: 0.5, v0: 0.5, u1: 2.5, v1: 2.5, surf: W },
    // 5: microwave keypad 0.1289 × 0.2892 m (aspect 2.24) → fitted whatever the worldSize
    { u0: 0.71, v0: 1.93, u1: 0.71 + 0.1289, v1: 1.93 + 0.2892, surf: S.panel_microwave },
  ]);
  const out = new Float32Array(g.vc * 2);
  const fitted = fitPrintedUVs(g.uvs, g.surf, g.idx, g.vc, inv, printedOf, out, new PrintedFitScratch());
  assert.equal(fitted, 4);
  for (const q of [0, 1, 3, 5]) assert.ok(isFitted(out, q), `quad ${q} fitted: ${Array.from(out.subarray(q * 8, q * 8 + 8))}`);
  for (const q of [2, 4]) {
    const raw = Array.from(g.uvs.subarray(q * 8, q * 8 + 8)).map((x, i) => x * inv(g.surf[q * 4 + (i >> 1)]));
    Array.from(out.subarray(q * 8, q * 8 + 8)).forEach((x, i) => assert.ok(Math.abs(x - raw[i]) < 1e-5, `quad ${q} raw`));
  }
});

test("fitPrintedUVs: an intact object looks the same for every builder uv offset", () => {
  // 0.6 × 0.45 m painting_0 face (worldSize 0.8): previously a crop at offset 0.02, whole at 0.33
  let ref: number[] | null = null;
  for (const off of [0, 0.02, 0.33, 0.79, 1.57, 2.94]) {
    const g = quads([{ u0: off, v0: off * 0.7, u1: off + 0.6, v1: off * 0.7 + 0.45, surf: S.painting_0 }]);
    const out = new Float32Array(g.vc * 2);
    fitPrintedUVs(g.uvs, g.surf, g.idx, g.vc, inv, printedOf, out, new PrintedFitScratch());
    const now = Array.from(out);
    if (!ref) ref = now;
    now.forEach((x, i) => assert.ok(near(x, ref![i]), `offset ${off}: ${now} vs ${ref}`));
  }
});

test("fitPrintedUVs: printedFaceUV-mapped faces and their fracture fragments keep their piece of the picture", () => {
  const P = S.painting_0;
  const ws = SURFACES[P].worldSize;
  // 0.9 × 0.65 canvas facing +Z, mapped by the builder helper; then split into left/right halves
  const pts = [
    { x: 0, y: 0, z: 0 },
    { x: 0.9, y: 0, z: 0 },
    { x: 0.9, y: 0.65, z: 0 },
    { x: 0, y: 0.65, z: 0 },
  ];
  const m = printedFaceUV(pts, { x: 0, y: 0, z: 1 }, ws);
  const uvOf = (x: number, y: number): [number, number] => [x * m.u.x + y * m.u.y + m.u0, x * m.v.x + y * m.v.y + m.v0];
  const quad = (x0: number, x1: number): { u0: number; v0: number; u1: number; v1: number; surf: number } => {
    const a = uvOf(x0, 0),
      b = uvOf(x1, 0.65);
    return { u0: a[0], v0: a[1], u1: b[0], v1: b[1], surf: P };
  };
  const g = quads([quad(0, 0.9), quad(0, 0.45), quad(0.45, 0.9)]);
  const out = new Float32Array(g.vc * 2);
  const fitted = fitPrintedUVs(g.uvs, g.surf, g.idx, g.vc, inv, printedOf, out, new PrintedFitScratch());
  assert.equal(fitted, 0, "builder-mapped faces are not refitted");
  const us = (q: number): number[] => [0, 2, 4, 6].map((k) => out[q * 8 + k]);
  const vs = (q: number): number[] => [1, 3, 5, 7].map((k) => out[q * 8 + k]);
  // whole face: exactly one tile, shifted out of the reserved band
  assert.ok(near(Math.min(...us(0)), LO) && near(Math.max(...us(0)), HI), `whole ${us(0)}`);
  assert.ok(near(Math.min(...vs(0)), LO) && near(Math.max(...vs(0)), HI));
  // halves: complementary halves of that tile (u runs towards −X on a +Z face), full height
  const mid = 0.5;
  const left = us(1),
    right = us(2);
  assert.ok(near(Math.max(...left), HI) && Math.abs(Math.min(...left) - mid) < 1e-3, `left half ${left}`);
  assert.ok(near(Math.min(...right), LO) && Math.abs(Math.max(...right) - mid) < 1e-3, `right half ${right}`);
  for (const q of [1, 2]) assert.ok(near(Math.min(...vs(q)), LO) && near(Math.max(...vs(q)), HI));
});

test("fitPrintedUVs: faces sharing nothing are fitted independently; scratch reuse is clean", () => {
  const P = S.book_cover_1;
  const w = SURFACES[P].worldSize;
  const inv = (): number => 1 / w;
  const printed = (): boolean => true;
  const scratch = new PrintedFitScratch();
  // front and back cover of one book: same uv offsets, mirrored u ranges (autoUV), both cross seams
  const g = quads([
    { u0: -0.15 + 0.4, v0: 0.13, u1: 0.4, v1: 0.13 + 0.23, surf: P },
    { u0: 0.4, v0: 0.13, u1: 0.4 + 0.15, v1: 0.13 + 0.23, surf: P },
  ]);
  const out = new Float32Array(g.vc * 2);
  for (let k = 0; k < 3; k++) {
    const n = fitPrintedUVs(g.uvs, g.surf, g.idx, g.vc, inv, printed, out, scratch);
    assert.equal(n, 2);
    for (let q = 0; q < 2; q++) {
      const u = [out[q * 8], out[q * 8 + 2], out[q * 8 + 4], out[q * 8 + 6]];
      const v = [out[q * 8 + 1], out[q * 8 + 3], out[q * 8 + 5], out[q * 8 + 7]];
      assert.ok(Math.abs(Math.min(...u) - FIT_INSET) < 1e-5 && Math.abs(Math.max(...u) - (1 - FIT_INSET)) < 1e-5);
      assert.ok(Math.abs(Math.min(...v) - FIT_INSET) < 1e-5 && Math.abs(Math.max(...v) - (1 - FIT_INSET)) < 1e-5);
    }
  }
  // malformed indices are skipped without throwing; everything stays finite
  const bad = { ...g, idx: new Uint32Array([0, 1, 99, 2, 3, 0]) };
  fitPrintedUVs(bad.uvs, bad.surf, bad.idx, bad.vc, inv, printed, out, scratch);
  assert.ok(Array.from(out).every(Number.isFinite));
});
