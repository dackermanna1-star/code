import test from "node:test";
import { polyBox, faceAttr, polyClip, polyVolume, polyFromHull, polyTransform, polyCentroid, type ConvexPoly } from "../../src/geom/poly.ts";
import { voronoiFracture } from "../../src/geom/fracture.ts";
import { polyValidate } from "../../src/geom/validate.ts";
import { qaxisAngle } from "../../src/geom/vec.ts";
import { Rng } from "../../src/core/rng.ts";
const A = faceAttr(1), INT = faceAttr(9);
const v = (x:number,y:number,z:number)=>({x,y,z});
test("review: voronoi adversarial", () => {
  const rng = new Rng(5);
  let fails = 0, worst = 0, invalid = 0, asym = 0, cases = 0;
  for (let it = 0; it < 400; it++) {
    const s = Math.pow(10, rng.range(-2.7, 0.7));
    let part: ConvexPoly;
    const kind = it % 3;
    if (kind === 0) part = polyBox(v(s, s * rng.range(0.01, 1), s * rng.range(0.05, 1)), A, { p: v(rng.range(-3,3), rng.range(0,3), rng.range(-3,3)), q: qaxisAngle(rng.onSphere(), rng.range(0, 6)) });
    else part = polyFromHull(Array.from({ length: 20 }, () => { const p = rng.onSphere(); return v(p.x * s, p.y * s * 0.3, p.z * s * 0.6); }), A);
    const V = polyVolume(part);
    const c = polyCentroid(part);
    const seeds = [];
    const mode = it % 5;
    const n = rng.int(2, 60);
    for (let i = 0; i < n; i++) {
      if (mode === 0) seeds.push(part.verts[rng.int(0, part.verts.length - 1)]); // seeds on vertices
      else if (mode === 1) { const b = seeds.length ? seeds[seeds.length-1] : c; seeds.push(v(b.x + rng.range(-1,1)*1e-7*s, b.y, b.z)); } // near-duplicates
      else if (mode === 2) seeds.push(v(c.x + (i % 4) * s * 0.1, c.y + Math.floor(i / 4) % 4 * s * 0.1, c.z)); // coplanar grid
      else if (mode === 3) { const p = rng.inSphere(); seeds.push(v(c.x + p.x * s * 2, c.y + p.y * s * 2, c.z + p.z * s * 2)); } // many outside
      else { const p = rng.inSphere(); seeds.push(v(c.x + p.x * s*0.4, c.y + p.y * s*0.4, c.z + p.z * s*0.4)); }
    }
    const an = rng.chance(0.5) ? { axis: rng.onSphere(), factor: rng.range(1.5, 6) } : undefined;
    const cells = voronoiFracture(part, seeds, { interiorAttr: INT, anisotropy: an, minVolume: 0 });
    cases++;
    let sum = 0;
    for (const cl of cells) { sum += cl.volume; if (polyValidate(cl.poly).length) invalid++; 
      for (const nb of cl.neighbors) { const o = cells[nb.cell].neighbors.find(q => q.cell === cells.indexOf(cl)); if (!o || Math.abs(o.area - nb.area) > 1e-9) asym++; } }
    const rel = Math.abs(sum - V) / V;
    if (rel > 1e-6) { fails++; if (fails < 6) console.log("vol mismatch", it, kind, mode, s.toExponential(2), rel, cells.length, n, an ? "aniso" : ""); }
    worst = Math.max(worst, rel);
  }
  console.log({ cases, fails, worst, invalid, asym });
});
test("review: polyClip near-vertex cuts", () => {
  const rng = new Rng(9);
  let bad = 0, nonc = 0, inval = 0;
  for (let it = 0; it < 2000; it++) {
    const s = Math.pow(10, rng.range(-2.7, 0.7));
    const part = polyFromHull(Array.from({ length: 12 }, () => { const p = rng.onSphere(); return v(p.x * s, p.y * s, p.z * s * 0.2); }), A);
    const n = rng.onSphere();
    const vtx = part.verts[rng.int(0, part.verts.length - 1)];
    const d = n.x*vtx.x+n.y*vtx.y+n.z*vtx.z + rng.pick([0, 1e-12, -1e-12, 1e-10, -1e-10, 1e-8, -1e-8]) * s;
    const a = polyClip(part, n, d, null);
    const b = polyClip(part, v(-n.x,-n.y,-n.z), -d, null);
    const va = a ? polyVolume(a) : 0, vb = b ? polyVolume(b) : 0;
    const V = polyVolume(part);
    if (Math.abs(va + vb - V) > 1e-6 * V) { nonc++; if (nonc < 5) console.log("nonconserve", it, va, vb, V); }
    for (const q of [a, b]) if (q && polyValidate(q).length) { inval++; if (inval < 4) console.log(polyValidate(q).slice(0,3)); }
  }
  console.log({ nonc, inval });
});
