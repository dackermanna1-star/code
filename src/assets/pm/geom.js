// Tiny mesh builder for the player models: lofted rings ("cylinders" with varying
// elliptical / super-elliptical sections), rigid one-or-two-bone skinning, atlas UVs.
import * as THREE from 'three';

const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);

/** Orthonormal pair perpendicular to an axis (for rings around arbitrary axes). */
export function frameFor(axis, upHint = [0, 0, 1]) {
  const z = v3(axis).normalize();
  let up = v3(upHint);
  if (Math.abs(up.dot(z)) > 0.95) up = new THREE.Vector3(1, 0, 0);
  const ex = up.clone().sub(z.clone().multiplyScalar(up.dot(z))).normalize();
  const ey = new THREE.Vector3().crossVectors(z, ex).normalize();
  return { ex: [ex.x, ex.y, ex.z], ey: [ey.x, ey.y, ey.z] };
}

export class SkinBuilder {
  constructor(boneIndex, texSize = 512) {
    this.boneIndex = boneIndex;
    this.S = texSize;
    this.P = []; this.N = []; this.UV = []; this.SI = []; this.SW = []; this.I = []; this.IT = [];
    this.translucent = false; // parts added while true go to the second (translucent) group
    this.vcount = 0;
  }

  uvOf(region, u, v) {
    const [x, y, w, h] = region;
    const S = this.S;
    return [(x + 1 + u * (w - 2)) / S, 1 - (y + 1 + (1 - v) * (h - 2)) / S];
  }

  boneWeights(bone) {
    const idx = [0, 0, 0, 0], w = [0, 0, 0, 0];
    if (typeof bone === 'string') {
      if (!(bone in this.boneIndex)) throw new Error('unknown bone ' + bone);
      idx[0] = this.boneIndex[bone]; w[0] = 1;
    } else {
      bone.forEach(([n, wt], k) => { idx[k] = this.boneIndex[n]; w[k] = wt; });
    }
    return [idx, w];
  }

  /**
   * verts: [{p:[x,y,z], uv:[u,v] (texture coords), bone}], tris: [[a,b,c]] (CCW from outside)
   */
  addPart(verts, tris, smooth = true, flat = false) {
    if (flat) { // unweld: every triangle gets its own corners (hard edges)
      const nv = [];
      tris = tris.map((t) => t.map((i) => { nv.push(verts[i]); return nv.length - 1; }));
      verts = nv;
      smooth = false;
    }
    const n = verts.map(() => new THREE.Vector3());
    const pa = new THREE.Vector3(), pb = new THREE.Vector3(), pc = new THREE.Vector3();
    const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), fn = new THREE.Vector3();
    for (const [a, b, c] of tris) {
      pa.fromArray(verts[a].p); pb.fromArray(verts[b].p); pc.fromArray(verts[c].p);
      e1.subVectors(pb, pa); e2.subVectors(pc, pa); fn.crossVectors(e1, e2);
      n[a].add(fn); n[b].add(fn); n[c].add(fn);
    }
    if (smooth) {
      const groups = new Map();
      verts.forEach((v, i) => {
        const k = v.p.map((x) => Math.round(x * 50)).join(',');
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(i);
      });
      for (const g of groups.values()) {
        if (g.length < 2) continue;
        const s = new THREE.Vector3();
        g.forEach((i) => s.add(n[i]));
        g.forEach((i) => n[i].copy(s));
      }
    }
    const base = this.vcount;
    verts.forEach((v, i) => {
      const nn = n[i].lengthSq() > 1e-12 ? n[i].normalize() : new THREE.Vector3(0, 0, 1);
      this.P.push(v.p[0], v.p[1], v.p[2]);
      this.N.push(nn.x, nn.y, nn.z);
      this.UV.push(v.uv[0], v.uv[1]);
      const [bi, bw] = this.boneWeights(v.bone);
      this.SI.push(...bi); this.SW.push(...bw);
    });
    const I = this.translucent ? this.IT : this.I;
    for (const [a, b, c] of tris) I.push(base + a, base + b, base + c);
    this.vcount += verts.length;
    return tris.length;
  }

  /**
   * Loft a sequence of rings.
   * ring: { c:[x,y,z], ex?, ey?, r?, rx?, ry?, rxF?, rxB?, ryL?, ryR?, p? (superellipse), bone, v?, apex? }
   * Points: c + ex*fx(θ)*rx + ey*fy(θ)*ry with θ = π + 2πu (u=0.5 -> +ex "front").
   * opts: { sides, region:[x,y,w,h], smooth, arc:[θ0,θ1] (radians; θ=0 is +ex) }
   */
  loft(rings, opts) {
    const sides = opts.sides || 8;
    const region = opts.region;
    const smooth = opts.smooth !== false;
    const arc = opts.arc || null;
    // v coordinates
    if (rings.some((r) => r.v === undefined)) {
      let acc = 0; const d = [0];
      for (let k = 1; k < rings.length; k++) {
        acc += v3(rings[k].c).distanceTo(v3(rings[k - 1].c));
        d.push(acc);
      }
      rings.forEach((r, k) => { if (r.v === undefined) r.v = acc > 0 ? d[k] / acc : 0; });
    }
    const verts = [];
    const cols = sides + 1;
    for (const r of rings) {
      const ex = r.ex || [1, 0, 0], ey = r.ey || [0, 1, 0];
      const rxF = r.rxF ?? r.rx ?? r.r ?? 0, rxB = r.rxB ?? r.rx ?? r.r ?? 0;
      const ryL = r.ryL ?? r.ry ?? r.r ?? 0, ryR = r.ryR ?? r.ry ?? r.r ?? 0;
      const pe = 2 / (r.p || 2);
      for (let j = 0; j <= sides; j++) {
        const u = j / sides;
        const th = (opts.phase || 0) + (arc ? arc[0] + (arc[1] - arc[0]) * u : Math.PI + 2 * Math.PI * u);
        const cs = Math.cos(th), sn = Math.sin(th);
        const fx = Math.sign(cs) * Math.pow(Math.abs(cs), pe) * (cs >= 0 ? rxF : rxB);
        const fy = Math.sign(sn) * Math.pow(Math.abs(sn), pe) * (sn >= 0 ? ryL : ryR);
        const p = r.apex ? [...r.c] : [
          r.c[0] + ex[0] * fx + ey[0] * fy,
          r.c[1] + ex[1] * fx + ey[1] * fy,
          r.c[2] + ex[2] * fx + ey[2] * fy,
        ];
        const uu = opts.uMap ? opts.uMap(u) : u;
        verts.push({ p, uv: this.uvOf(region, uu, r.v), bone: r.bone });
      }
    }
    const tris = [];
    for (let k = 0; k < rings.length - 1; k++) {
      const r0 = rings[k], r1 = rings[k + 1];
      const ex = r0.ex || [1, 0, 0], ey = r0.ey || [0, 1, 0];
      const ax = new THREE.Vector3().crossVectors(v3(ex), v3(ey));
      const dir = v3(r1.c).sub(v3(r0.c));
      let flip = ax.dot(dir) < 0;
      if (arc && arc[1] < arc[0]) flip = !flip;
      if (opts.flip) flip = !flip;
      for (let j = 0; j < sides; j++) {
        const a = k * cols + j, b = k * cols + j + 1, c = (k + 1) * cols + j + 1, d = (k + 1) * cols + j;
        const t = [];
        if (!r0.apex) t.push([a, b, c]);
        if (!r1.apex) t.push([a, c, d]);
        for (const tri of t) tris.push(flip ? [tri[0], tri[2], tri[1]] : tri);
      }
    }
    return this.addPart(verts, tris, smooth, !!opts.flat);
  }

  /** Uniformly scale every vertex rigidly bound to `bone` about a pivot (normals unchanged). */
  scaleBone(bone, pivot, k) {
    const bi = this.boneIndex[bone];
    for (let v = 0; v < this.vcount; v++) {
      if (this.SI[v * 4] !== bi || this.SW[v * 4] < 0.999) continue;
      for (let a = 0; a < 3; a++) this.P[v * 3 + a] = pivot[a] + (this.P[v * 3 + a] - pivot[a]) * k;
    }
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.UV, 2));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.SI, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.SW, 4));
    g.setIndex([...this.I, ...this.IT]);
    g.addGroup(0, this.I.length, 0);
    if (this.IT.length) g.addGroup(this.I.length, this.IT.length, 1);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 30), 64);
    return g;
  }
}
