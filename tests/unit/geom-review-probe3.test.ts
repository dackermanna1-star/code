import test from "node:test";
import { faceAttr, polyClip, polyFromHull } from "../../src/geom/poly.ts";
import { polyValidate } from "../../src/geom/validate.ts";
import { Rng } from "../../src/core/rng.ts";
const A = faceAttr(1);
const v = (x:number,y:number,z:number)=>({x,y,z});
test("review: polyClip near-vertex reflex magnitude", () => {
  const rng = new Rng(9);
  let shown = 0;
  for (let it = 0; it < 2000 && shown < 4; it++) {
    const s = Math.pow(10, rng.range(-2.7, 0.7));
    const part = polyFromHull(Array.from({ length: 12 }, () => { const p = rng.onSphere(); return v(p.x * s, p.y * s, p.z * s * 0.2); }), A);
    const n = rng.onSphere();
    const vtx = part.verts[rng.int(0, part.verts.length - 1)];
    const off = rng.pick([0, 1e-12, -1e-12, 1e-10, -1e-10, 1e-8, -1e-8]);
    const d = n.x*vtx.x+n.y*vtx.y+n.z*vtx.z + off * s;
    for (const [nn, dd] of [[n, d], [v(-n.x,-n.y,-n.z), -d]] as const) {
      const q = polyClip(part, nn, dd, null);
      if (!q || !polyValidate(q).length) continue;
      shown++;
      for (const f of q.faces) { const m = f.idx.length; for (let k=0;k<m;k++){ const a=q.verts[f.idx[k]], b=q.verts[f.idx[(k+1)%m]], c=q.verts[f.idx[(k+2)%m]];
        const e1={x:b.x-a.x,y:b.y-a.y,z:b.z-a.z}, e2={x:c.x-b.x,y:c.y-b.y,z:c.z-b.z};
        const cr={x:e1.y*e2.z-e1.z*e2.y,y:e1.z*e2.x-e1.x*e2.z,z:e1.x*e2.y-e1.y*e2.x}; const sv=cr.x*f.n.x+cr.y*f.n.y+cr.z*f.n.z;
        const l1=Math.hypot(e1.x,e1.y,e1.z), l2=Math.hypot(e2.x,e2.y,e2.z);
        if (sv < -1e-7*l1*l2) console.log("scale", s.toExponential(2), "edges/scale", (l1/s).toExponential(2), (l2/s).toExponential(2), "sin", (sv/(l1*l2)).toExponential(2), "depth/scale", (Math.abs(sv)/Math.max(l1,l2)/s).toExponential(2)); } }
    }
  }
});
