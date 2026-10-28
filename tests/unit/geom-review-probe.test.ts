import test from "node:test";
import { polyBox, faceAttr, polyClip, polyVolume, polyTransform, polyPrism } from "../../src/geom/poly.ts";
import { polyToRenderGeom } from "../../src/geom/meshgen.ts";
import { watertight } from "./geom-helpers.ts";

test("review: tess edge just above tessCell", () => {
  const a = faceAttr(1);
  const tc = 0.04;
  for (const f of [1.00001, 1.00005, 1.00009]) {
    // box: one edge set of length tc*f, others long
    const p = polyBox({ x: tc * f, y: 0.4, z: 0.4 }, a);
    const g = polyToRenderGeom(p, { tessCell: tc });
    console.log("f", f, watertight(g));
  }
  // prism with face all edges ~tc*f (triangle) adjacent to long faces
  const tri = polyPrism([[0, 0], [0.04 * 1.00005, 0], [0.02 * 1.00005, 0.0346]], 0.4, a, a);
  console.log("tri", watertight(polyToRenderGeom(tri, { tessCell: 0.04 })));
});
