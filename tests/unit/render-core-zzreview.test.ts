// THROWAWAY review test: printed fallback on fracture fragments / small faces / tiled posters.
import { test } from "node:test";
import { fitPrintedUVs, PrintedFitScratch, isPrintedSurface } from "../../src/render/printed.ts";
import { SURFACES, S } from "../../src/render/surfaces.ts";

function quads(spec: Array<{ u0: number; v0: number; u1: number; v1: number; surf: number }>) {
  const uvs: number[] = [], surf: number[] = [], idx: number[] = [];
  for (const q of spec) {
    const b = uvs.length / 2;
    uvs.push(q.u0, q.v0, q.u1, q.v0, q.u1, q.v1, q.u0, q.v1);
    surf.push(q.surf, q.surf, q.surf, q.surf);
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  return { uvs: new Float32Array(uvs), surf: new Uint16Array(surf), idx: new Uint32Array(idx), vc: uvs.length / 2 };
}
const inv = (s: number) => 1 / SURFACES[s].worldSize;
const pr = (s: number) => isPrintedSurface(SURFACES[s]);
const ranges = (out: Float32Array, q: number) => {
  const u = [0, 2, 4, 6].map((i) => out[q * 8 + i]), v = [1, 3, 5, 7].map((i) => out[q * 8 + i]);
  return { u: [Math.min(...u), Math.max(...u)].map((x) => +x.toFixed(3)), v: [Math.min(...v), Math.max(...v)].map((x) => +x.toFixed(3)) };
};
test("review: painting 0.9x0.65 split into two halves (same UV map, as fracture keeps it)", () => {
  const P = S.painting_0;
  const u0 = 1.33, v0 = 2.21; // random builder offset (metres)
  const g = quads([
    { u0, v0, u1: u0 + 0.45, v1: v0 + 0.65, surf: P }, // left half
    { u0: u0 + 0.45, v0, u1: u0 + 0.9, v1: v0 + 0.65, surf: P }, // right half
  ]);
  const out = new Float32Array(g.vc * 2);
  const n = fitPrintedUVs(g.uvs, g.surf, g.idx, g.vc, inv, pr, out, new PrintedFitScratch());
  console.log("fragments fitted:", n, "left", ranges(out, 0), "right", ranges(out, 1));
});
test("review: same painting at different offsets: cropped vs whole", () => {
  const P = S.painting_0; // ws 0.8
  for (const off of [0.02, 0.33]) {
    const g = quads([{ u0: off, v0: off, u1: off + 0.6, v1: off + 0.45, surf: P }]);
    const out = new Float32Array(g.vc * 2);
    const n = fitPrintedUVs(g.uvs, g.surf, g.idx, g.vc, inv, pr, out, new PrintedFitScratch());
    console.log(`offset ${off}: fitted ${n}`, ranges(out, 0));
  }
});
test("review: content faces outside the 0.5..1.5 tile window", () => {
  const cases: Array<[string, number, number, number]> = [
    ["microwave cp_front panel_microwave", S.panel_microwave, 0.1289, 0.2892],
    ["bedroom2 east poster photo_0 0.45x0.6", S.photo_0, 0.45, 0.6],
  ];
  for (const [name, s, w, h] of cases) {
    const g = quads([{ u0: 0.37, v0: 0.11, u1: 0.37 + w, v1: 0.11 + h, surf: s }]);
    const out = new Float32Array(g.vc * 2);
    const n = fitPrintedUVs(g.uvs, g.surf, g.idx, g.vc, inv, pr, out, new PrintedFitScratch());
    console.log(name, "fitted", n, ranges(out, 0));
  }
});
