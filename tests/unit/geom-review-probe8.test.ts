import test from "node:test";
import { faceAttr, polyBox, polyFromHull, polyVolume, polyExtents } from "../../src/geom/poly.ts";
import { voronoiFracture } from "../../src/geom/fracture.ts";
import { polyToRenderGeom } from "../../src/geom/meshgen.ts";
import { qaxisAngle } from "../../src/geom/vec.ts";
import { Rng } from "../../src/core/rng.ts";
import { watertight, windingAgainstNormals } from "./geom-helpers.ts";
const A = faceAttr(1), S = process.env.NS ? faceAttr(2) : faceAttr(2, 0xffffff, { smooth: 3 });
const v = (x:number,y:number,z:number)=>({x,y,z});
test("review: mesh fuzz", () => {
  const rng = new Rng(77);
  let parts = 0, nonwt = 0, wrong = 0, missingFaces = 0;
  for (let it = 0; it < 150; it++) {
    const s = Math.pow(10, rng.range(-2, 0.5));
    const base = rng.chance(0.5) ? polyBox(v(s, s * rng.range(0.005, 1), s * rng.range(0.05, 1)), rng.chance(0.5) ? A : S, { p: v(1, 2, 3), q: qaxisAngle(rng.onSphere(), rng.range(0, 6)) })
      : polyFromHull(Array.from({ length: 25 }, () => { const p = rng.onSphere(); return v(p.x * s, p.y * s * 0.1, p.z * s * 0.5); }), S);
    const seeds = Array.from({ length: rng.int(2, 25) }, () => { const p = rng.inSphere(); const c = base.verts[0]; return v(c.x + p.x * s, c.y + p.y * s, c.z + p.z * s); });
    const cells = voronoiFracture(base, seeds, { interiorAttr: A, minVolume: 0 });
    for (const c of cells) {
      parts++;
      const ext = polyExtents(c.poly).ext;
      const tess = [0, ext[0] / rng.range(1.5, 20), ext[2] * rng.range(0.3, 3)][rng.int(0, 2)];
      const g = polyToRenderGeom(c.poly, { tessCell: tess, dents: process.env.ND ? undefined : rng.chance(0.5) ? [{ p: c.centroid, dir: rng.onSphere(), r: ext[0], depth: ext[2] * 0.3 }] : undefined });
      const w = watertight(g);
      if (w.bad) { nonwt++; if (nonwt < 5) console.log("nonWT", it, "tess/ext", (tess / ext[0]).toFixed(3), "ext", ext.map(e => e.toExponential(2)), w); }
      const wa = windingAgainstNormals(g);
      if (wa.wrong) wrong++;
      // count faces that produced zero triangles
    }
  }
  console.log({ parts, nonwt, wrong });
});
