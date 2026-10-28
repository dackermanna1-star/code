import test from "node:test";
import { faceAttr, polyFromHull, polySignedDist, polyVolume } from "../../src/geom/poly.ts";
import { polyValidate } from "../../src/geom/validate.ts";
import { Rng } from "../../src/core/rng.ts";
const A = faceAttr(1);
const v = (x:number,y:number,z:number)=>({x,y,z});
test("review: hull adversarial", () => {
  const rng = new Rng(11);
  let inval = 0, outside = 0, cases = 0, empty = 0;
  for (let it = 0; it < 600; it++) {
    const s = Math.pow(10, rng.range(-3, 0.7));
    const pts = [];
    const mode = it % 6;
    const n = rng.int(4, 200);
    for (let i = 0; i < n; i++) {
      if (mode === 0) { // grid on box surface
        const g = rng.int(2, 6); const a = rng.int(0, g)/g - 0.5, b = rng.int(0, g)/g - 0.5, f = rng.int(0,5);
        const p = [a, b, f%2 ? 0.5 : -0.5]; const ax = Math.floor(f/2); const q = [p[(3-ax)%3], p[(4-ax)%3], p[(5-ax)%3]];
        pts.push(v(q[0]*s, q[1]*s, q[2]*s*0.3));
      } else if (mode === 1) { const p = rng.onSphere(); pts.push(v(p.x*s, p.y*s, p.z*s)); pts.push(v(p.x*s*(1+1e-10), p.y*s, p.z*s)); }
      else if (mode === 2) { const p = rng.onSphere(); pts.push(v(p.x*s, p.y*s, p.z*s*1e-4)); } // nearly flat
      else if (mode === 3) { const p = rng.onSphere(); pts.push(v(p.x*s, p.y*s*1e-6 + (rng.next()-0.5)*1e-12, p.z*s)); } // very flat
      else if (mode === 4) { const t = rng.next(); pts.push(v(t*s, t*s*0.5 + rng.next()*s*1e-3, rng.next()*s*1e-3)); } // needle
      else { const p = rng.inSphere(); pts.push(v(p.x*s + 1000, p.y*s, p.z*s)); } // far from origin
    }
    const h = polyFromHull(pts, A);
    cases++;
    if (!h.faces.length) { empty++; continue; }
    const e = polyValidate(h, polyVolume(h) > 0 ? {} : { closed: true });
    if (e.length) { inval++; if (inval < 6) console.log("mode", mode, "s", s.toExponential(1), "n", pts.length, e.slice(0, 2)); }
    const scale = s;
    for (const p of pts) if (polySignedDist(h, p) > 1e-6 * scale) { outside++; break; }
  }
  console.log({ cases, inval, outside, empty });
});
