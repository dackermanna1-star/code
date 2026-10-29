// Unit tests: printed artwork fitting (src/render/printed.ts) — builder-side fracture-stable
// UVMap, and the batcher's per-face fallback (seam crossing, strips, tiled areas, multi-face).
import { test } from "node:test";
import assert from "node:assert/strict";
import { printedFaceUV, fitPrintedUVs, PrintedFitScratch, FIT_INSET, isPrintedSurface, PRINTED_TEXTURES } from "../../src/render/printed.ts";
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
  assert.ok(Math.abs(Math.min(...us) - ws * FIT_INSET) < 1e-9);
  assert.ok(Math.abs(Math.max(...us) - ws * (1 - FIT_INSET)) < 1e-9);
  assert.ok(Math.abs(Math.min(...vs) - ws * FIT_INSET) < 1e-9);
  assert.ok(Math.abs(Math.max(...vs) - ws * (1 - FIT_INSET)) < 1e-9);
  // upright: the top edge has the larger v
  assert.ok(uv[2][1] > uv[1][1]);
  // unmirrored from outside: U = cross(N, V) (left-handed viewer looking along −N has +U to the right)
  assert.ok(m.u.x < 0, "u runs towards −X for a +Z face");
  // a fragment of that face keeps its piece of the picture (same map, sub-range)
  const frag = [pts[0], { x: 2.0, y: 1.075, z: -3 }, { x: 2.0, y: 1.4, z: -3 }];
  for (const p of frag) {
    const u = dot(p, m.u) + m.u0;
    assert.ok(u >= ws * FIT_INSET - 1e-9 && u <= ws * (1 - FIT_INSET) + 1e-9);
  }
  // floor face (rug) uses −Z/+Z as image up like autoUV; no NaN for degenerate input
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
  assert.ok(Math.abs(rug.v.z) > 0.9 && Number.isFinite(rug.u0) && Number.isFinite(rug.v0));
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

test("fitPrintedUVs: whole faces across a seam are fitted, others left alone", () => {
  const P = S.painting_0,
    W = S.wood_oak;
  const ws = (s: number): number => SURFACES[s].worldSize;
  const inv = (s: number): number => 1 / ws(s);
  const printed = (s: number): boolean => isPrintedSurface(SURFACES[s]);
  const w0 = ws(P);
  const g = quads([
    // 0: painting face 0.9×0.65 m at a random offset → crosses a seam → fitted
    { u0: 1.33, v0: 2.21, u1: 1.33 + 0.9, v1: 2.21 + 0.65, surf: P },
    // 1: painting face already inside one tile (builder-mapped) → untouched
    { u0: w0 * 2 + 0.01, v0: 0.01, u1: w0 * 3 - 0.01, v1: w0 - 0.01, surf: P },
    // 2: narrow strip (book spine / label tile) across a seam → untouched
    { u0: w0 - 0.02, v0: 0.1, u1: w0 + 0.02, v1: 0.6, surf: P },
    // 3: big intentionally tiled printed area (3 × 3 tiles) → untouched
    { u0: 0.1, v0: 0.1, u1: 0.1 + 3 * w0, v1: 0.1 + 3 * w0, surf: P },
    // 4: non-printed surface crossing seams → untouched
    { u0: 0.5, v0: 0.5, u1: 2.5, v1: 2.5, surf: W },
  ]);
  const out = new Float32Array(g.vc * 2);
  const fitted = fitPrintedUVs(g.uvs, g.surf, g.idx, g.vc, inv, printed, out, new PrintedFitScratch());
  assert.equal(fitted, 1);
  const quad = (q: number): number[] => Array.from(out.subarray(q * 8, q * 8 + 8));
  const q0 = quad(0);
  const lo = FIT_INSET,
    hi = 1 - FIT_INSET;
  const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-5;
  assert.ok(near(q0[0], lo) && near(q0[1], lo) && near(q0[4], hi) && near(q0[5], hi), `fitted ${q0}`);
  // orientation preserved (u grows from vertex 0 to 1, v from 1 to 2)
  assert.ok(q0[2] > q0[0] && q0[5] > q0[3]);
  // untouched quads = raw uv × 1/worldSize
  for (const q of [1, 2, 3, 4]) {
    const raw = Array.from(g.uvs.subarray(q * 8, q * 8 + 8)).map((x, i) => x * inv(g.surf[q * 4 + (i >> 1)]));
    quad(q).forEach((x, i) => assert.ok(Math.abs(x - raw[i]) < 1e-5, `quad ${q}`));
  }
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
