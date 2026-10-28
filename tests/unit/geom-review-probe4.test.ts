import test from "node:test";
import { faceAttr, polyBox, polyFromHull, polySignedDist, polyVolume, polyCylinder, type ConvexPoly } from "../../src/geom/poly.ts";
import { generateSeeds, voronoiFracture, type SeedPattern } from "../../src/geom/fracture.ts";
import { qaxisAngle } from "../../src/geom/vec.ts";
import { Rng } from "../../src/core/rng.ts";
const A = faceAttr(1);
const v = (x:number,y:number,z:number)=>({x,y,z});
const PATS: SeedPattern[] = ["radial","dice","chunks","splinter","crumble","crack"];
test("review: seeds", () => {
  const rng = new Rng(3);
  const parts: [string, ConvexPoly][] = [
    ["pane", polyBox(v(0.9, 1.2, 0.004), A, { p: v(1,1,1), q: qaxisAngle(v(0,1,0), 0.5) })],
    ["board", polyBox(v(1.8, 0.02, 0.2), A)],
    ["cube", polyBox(v(0.1, 0.1, 0.1), A)],
    ["button", polyBox(v(0.002, 0.002, 0.001), A)],
    ["slab", polyBox(v(5, 0.2, 3), A)],
    ["cyl", polyCylinder(0.05, 0.05, 0.3, 12, A, A)],
  ];
  for (const [name, p] of parts) {
    for (const pat of PATS) {
      let out = 0, total = 0, counts: number[] = [], dup = 0;
      for (let k = 0; k < 20; k++) {
        const imp = p.verts[rng.int(0, p.verts.length-1)];
        const count = rng.int(5, 40);
        const s = generateSeeds(p, { pattern: pat, impact: imp, dir: v(0,0,-1), radius: 0.15, count, rng, cell: 0.03, grain: v(1,0,0) });
        counts.push(s.length - count);
        for (const q of s) { total++; if (!(polySignedDist(p, q) < 0)) out++; }
        const keys = new Set(s.map(q => `${q.x.toFixed(9)},${q.y.toFixed(9)},${q.z.toFixed(9)}`)); dup += s.length - keys.size;
      }
      console.log(name.padEnd(7), pat.padEnd(9), "out", out, "/", total, "dup", dup, "countDelta[min,max]", Math.min(...counts), Math.max(...counts));
    }
  }
});
