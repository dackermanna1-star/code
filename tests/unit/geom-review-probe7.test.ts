import test from "node:test";
import { faceAttr, polyVolume } from "../../src/geom/poly.ts";
import { latheTiles, torusTiles, arcPanelTiles, polyEllipsoid, polyPillow, frameBars, slabGrid } from "../../src/geom/primitives.ts";
import { polyValidate } from "../../src/geom/validate.ts";
import { polyToRenderGeom } from "../../src/geom/meshgen.ts";
import { watertight } from "./geom-helpers.ts";
const O = faceAttr(2, 0xffffff, { smooth: 1 }), I = faceAttr(3, 0xffffff, { smooth: 2 }), E = faceAttr(4);
const v = (x:number,y:number,z:number)=>({x,y,z});
function check(label: string, tiles: { poly: any }[], expectVol?: number) {
  let inval = 0, vol = 0, nonwt = 0; const msgs: string[] = [];
  for (const t of tiles) { const e = polyValidate(t.poly); if (e.length) { inval++; msgs.push(e[0]); } vol += polyVolume(t.poly);
    const g = polyToRenderGeom(t.poly, { tessCell: 0.01 }); if (watertight(g).bad) nonwt++; }
  console.log(label.padEnd(22), "tiles", tiles.length, "invalid", inval, "nonWT", nonwt, "vol", vol.toExponential(4), expectVol ? "expect " + expectVol.toExponential(4) : "", msgs.slice(0, 2));
}
test("review: primitives", () => {
  check("bowl cap", latheTiles({ profile: [[0.04, 0], [0.08, 0.03], [0.1, 0.07]], thickness: 0.005, segments: 16, capBottom: true, outer: O, inner: I, edge: E }));
  check("bottle neck", latheTiles({ profile: [[0.04, 0], [0.04, 0.2], [0.012, 0.25], [0.012, 0.3]], thickness: 0.003, segments: 12, capBottom: true, outer: O, inner: I, edge: E }));
  check("dome to axis", latheTiles({ profile: [[0.1, 0], [0.07, 0.07], [0, 0.1]], thickness: 0.01, segments: 12, outer: O, inner: I, edge: E }));
  check("thick > r", latheTiles({ profile: [[0.01, 0], [0.01, 0.05]], thickness: 0.03, segments: 8, outer: O, inner: I, edge: E }));
  check("partial 300deg 2seg", latheTiles({ profile: [[0.2, 0], [0.2, 0.2]], thickness: 0.01, segments: 2, angleStart: 0, angleEnd: 5.2, outer: O, inner: I, edge: E }));
  check("profile top->bottom", latheTiles({ profile: [[0.1, 0.1], [0.1, 0]], thickness: 0.01, segments: 12, outer: O, inner: I, edge: E }));
  const R = 0.2, t = 0.01, h = 0.2;
  check("cyl shell vol", latheTiles({ profile: [[R, 0], [R, h]], thickness: t, segments: 64, outer: O, inner: I, edge: E }), Math.PI * (R*R - (R-t)*(R-t)) * h);
  check("torus", torusTiles(0.2, 0.03, 16, 8, O));
  check("torus arc", torusTiles(0.2, 0.03, 4, 8, O, undefined, Math.PI/2));
  check("arc panel", arcPanelTiles(0.5, 1.2, 0.6, 0.01, 6, O, I, E));
  check("ellipsoid", [{ poly: polyEllipsoid(v(0.05, 0.08, 0.04), 12, 8, O) }]);
  check("pillow", [{ poly: polyPillow(v(0.5, 0.15, 0.5), 0.3, O) }]);
  check("pillow e=0.03", [{ poly: polyPillow(v(0.5, 0.15, 0.5), 0.03, O) }]);
  check("frame", frameBars(0.6, 0.4, 0.04, 0.02, E).map(p => ({ poly: p })), 0.6*0.4*0.02 - 0.52*0.32*0.02);
  check("slab", slabGrid(v(1, 0.01, 0.5), 4, 3, 0.002, E));
});
