import test from "node:test";
import { faceAttr, polyBox } from "../../src/geom/poly.ts";
import { generateSeeds, voronoiFracture, type SeedPattern } from "../../src/geom/fracture.ts";
import { Rng } from "../../src/core/rng.ts";
const A = faceAttr(1);
const v = (x:number,y:number,z:number)=>({x,y,z});
test("review: seeds near edges", () => {
  const pane = polyBox(v(0.9, 1.2, 0.004), A);
  for (const pat of ["radial", "chunks", "crumble", "splinter"] as SeedPattern[]) for (const [label, imp] of [["center", v(0,0,0.002)], ["2cm-edge", v(0.43, 0, 0.002)], ["edge", v(0.45, 0, 0.002)], ["corner", v(0.45, 0.6, 0.002)]] as const) {
    let exact = 0, near1mm = 0, cellsTot = 0, seedsTot = 0, micro = 0;
    for (let k = 0; k < 10; k++) {
      const rng = new Rng(100 + k);
      const s = generateSeeds(pane, { pattern: pat, impact: imp, dir: v(0,0,-1), radius: 0.2, count: 30, rng });
      seedsTot += s.length;
      for (let i = 0; i < s.length; i++) for (let j = i+1; j < s.length; j++) { const d = Math.hypot(s[i].x-s[j].x, s[i].y-s[j].y, s[i].z-s[j].z); if (d < 1e-9) exact++; else if (d < 1e-3) near1mm++; }
      const cells = voronoiFracture(pane, s, { interiorAttr: A });
      cellsTot += cells.length;
      micro += cells.filter(c => c.maxExtent < 0.01).length;
    }
    console.log(pat.padEnd(9), label.padEnd(9), "seeds", seedsTot, "cells", cellsTot, "exactDupPairs", exact, "near<1mm pairs", near1mm, "cells<1cm", micro);
  }
});
