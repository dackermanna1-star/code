import * as THREE from 'three';

/**
 * Convex polyhedron as a set of planar faces (vertex loops, CCW seen from
 * outside). Buildings are made of these so a slash can split them exactly.
 */
export interface Face {
  verts: THREE.Vector3[];
  normal: THREE.Vector3;
  /** Faces created by a cut: drawn as raw concrete. */
  cap: boolean;
}

export class ConvexPoly {
  constructor(public faces: Face[]) {}

  static box(hw: number, hd: number, y0: number, y1: number) {
    const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    const f = (verts: THREE.Vector3[], n: THREE.Vector3): Face => ({ verts, normal: n, cap: false });
    return new ConvexPoly([
      f([v(hw, y0, hd), v(hw, y0, -hd), v(hw, y1, -hd), v(hw, y1, hd)], v(1, 0, 0)),
      f([v(-hw, y0, -hd), v(-hw, y0, hd), v(-hw, y1, hd), v(-hw, y1, -hd)], v(-1, 0, 0)),
      f([v(-hw, y1, hd), v(hw, y1, hd), v(hw, y1, -hd), v(-hw, y1, -hd)], v(0, 1, 0)),
      f([v(-hw, y0, -hd), v(hw, y0, -hd), v(hw, y0, hd), v(-hw, y0, hd)], v(0, -1, 0)),
      f([v(-hw, y0, hd), v(hw, y0, hd), v(hw, y1, hd), v(-hw, y1, hd)], v(0, 0, 1)),
      f([v(hw, y0, -hd), v(-hw, y0, -hd), v(-hw, y1, -hd), v(hw, y1, -hd)], v(0, 0, -1)),
    ]);
  }

  /** A convex solid of revolution: profile [radius, y] from bottom to top (radius must be concave-down). */
  static lathe(profile: [number, number][], sides: number, rx = 1, rz = 1) {
    const faces: Face[] = [];
    const ring = (r: number, y: number) => {
      const out: THREE.Vector3[] = [];
      for (let i = 0; i < sides; i++) {
        const a = (i / sides) * Math.PI * 2;
        out.push(new THREE.Vector3(Math.cos(a) * r * rx, y, Math.sin(a) * r * rz));
      }
      return out;
    };
    const rings = profile.map(([r, y]) => ring(r, y));
    for (let k = 0; k < rings.length - 1; k++) {
      const a = rings[k];
      const b = rings[k + 1];
      for (let i = 0; i < sides; i++) {
        const j = (i + 1) % sides;
        const verts = [a[j], a[i], b[i], b[j]].map((p) => p.clone());
        // drop a degenerate edge where a ring collapses to a point
        const uniq = verts.filter((p, idx) => verts.findIndex((q) => q.distanceToSquared(p) < 1e-8) === idx);
        if (uniq.length < 3) continue;
        const n = new THREE.Vector3().subVectors(uniq[1], uniq[0]).cross(new THREE.Vector3().subVectors(uniq[2], uniq[0])).normalize();
        faces.push({ verts: uniq, normal: n, cap: false });
      }
    }
    const bottom = rings[0];
    if (profile[0][0] > 1e-4) faces.push({ verts: bottom.map((p) => p.clone()), normal: new THREE.Vector3(0, -1, 0), cap: false });
    const top = rings[rings.length - 1];
    if (profile[profile.length - 1][0] > 1e-4) faces.push({ verts: [...top].reverse().map((p) => p.clone()), normal: new THREE.Vector3(0, 1, 0), cap: false });
    return new ConvexPoly(faces);
  }

  vertices() {
    const out: THREE.Vector3[] = [];
    for (const f of this.faces)
      for (const v of f.verts) if (!out.some((o) => o.distanceToSquared(v) < 1e-6)) out.push(v);
    return out;
  }

  bounds(box = new THREE.Box3()) {
    box.makeEmpty();
    for (const f of this.faces) for (const v of f.verts) box.expandByPoint(v);
    return box;
  }

  volume() {
    // divergence theorem over fan triangles
    let v = 0;
    for (const f of this.faces) {
      const a = f.verts[0];
      for (let i = 1; i < f.verts.length - 1; i++) v += a.dot(new THREE.Vector3().crossVectors(f.verts[i], f.verts[i + 1])) / 6;
    }
    return Math.abs(v);
  }

  /**
   * Splits by the plane n·x = d. Returns [front (n·x > d), back]; either can be
   * null when the plane misses. The new cap faces are flagged.
   */
  split(n: THREE.Vector3, d: number): [ConvexPoly | null, ConvexPoly | null] {
    const eps = 1e-5;
    const front: Face[] = [];
    const back: Face[] = [];
    const capPts: THREE.Vector3[] = [];
    let anyF = false;
    let anyB = false;
    for (const f of this.faces) {
      const dist = f.verts.map((v) => n.dot(v) - d);
      const fv: THREE.Vector3[] = [];
      const bv: THREE.Vector3[] = [];
      for (let i = 0; i < f.verts.length; i++) {
        const j = (i + 1) % f.verts.length;
        const a = f.verts[i];
        const b = f.verts[j];
        const da = dist[i];
        const db = dist[j];
        if (da >= -eps) fv.push(a.clone());
        if (da <= eps) bv.push(a.clone());
        if (da > eps) anyF = true;
        if (da < -eps) anyB = true;
        if ((da > eps && db < -eps) || (da < -eps && db > eps)) {
          const t = da / (da - db);
          const p = new THREE.Vector3().lerpVectors(a, b, t);
          fv.push(p.clone());
          bv.push(p.clone());
          capPts.push(p);
        } else if (Math.abs(da) <= eps) capPts.push(a.clone());
      }
      if (fv.length >= 3) front.push({ verts: dedupe(fv), normal: f.normal.clone(), cap: f.cap });
      if (bv.length >= 3) back.push({ verts: dedupe(bv), normal: f.normal.clone(), cap: f.cap });
    }
    if (!anyF) return [null, this];
    if (!anyB) return [this, null];
    const loop = orderLoop(dedupe(capPts), n);
    if (loop.length >= 3) {
      front.push({ verts: [...loop].reverse(), normal: n.clone().negate(), cap: true });
      back.push({ verts: loop.map((p) => p.clone()), normal: n.clone(), cap: true });
    }
    const pf = new ConvexPoly(front.filter((f) => f.verts.length >= 3));
    const pb = new ConvexPoly(back.filter((f) => f.verts.length >= 3));
    return [pf, pb];
  }

  /** Moves every vertex (for pieces re-centred on their own body). */
  translate(dx: number, dy: number, dz: number) {
    for (const f of this.faces) for (const v of f.verts) v.set(v.x + dx, v.y + dy, v.z + dz);
    return this;
  }

  centroid(out = new THREE.Vector3()) {
    const vs = this.vertices();
    out.set(0, 0, 0);
    for (const v of vs) out.add(v);
    return out.multiplyScalar(1 / Math.max(1, vs.length));
  }
}

function dedupe(vs: THREE.Vector3[]) {
  const out: THREE.Vector3[] = [];
  for (const v of vs) if (!out.length || out[out.length - 1].distanceToSquared(v) > 1e-8) out.push(v);
  while (out.length > 1 && out[0].distanceToSquared(out[out.length - 1]) < 1e-8) out.pop();
  const uniq: THREE.Vector3[] = [];
  for (const v of out) if (!uniq.some((u) => u.distanceToSquared(v) < 1e-8)) uniq.push(v);
  return uniq;
}

/** Orders coplanar points CCW around their centroid as seen from +n. */
function orderLoop(pts: THREE.Vector3[], n: THREE.Vector3) {
  if (pts.length < 3) return pts;
  const c = new THREE.Vector3();
  for (const p of pts) c.add(p);
  c.multiplyScalar(1 / pts.length);
  const t = Math.abs(n.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const ax = new THREE.Vector3().crossVectors(t, n).normalize();
  const ay = new THREE.Vector3().crossVectors(n, ax);
  const tmp = new THREE.Vector3();
  return pts
    .map((p) => {
      tmp.subVectors(p, c);
      return { p, a: Math.atan2(tmp.dot(ay), tmp.dot(ax)) };
    })
    .sort((a, b) => a.a - b.a)
    .map((e) => e.p);
}

export interface FacadeAttrs {
  /** style, floor height, bay width, seed */
  fac: [number, number, number, number];
  /** half width (x), half depth (z), top y, bottom y, in the building frame */
  box: [number, number, number, number];
  color: THREE.Color;
  glass: THREE.Color;
}

/** Triangulates a polyhedron with the facade attributes. */
export function polyGeometry(p: ConvexPoly, a: FacadeAttrs) {
  let tris = 0;
  for (const f of p.faces) tris += f.verts.length - 2;
  const n = tris * 3;
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const fac = new Float32Array(n * 4);
  const box = new Float32Array(n * 4);
  const gl = new Float32Array(n * 3);
  let k = 0;
  const put = (v: THREE.Vector3, f: Face) => {
    pos[k * 3] = v.x;
    pos[k * 3 + 1] = v.y;
    pos[k * 3 + 2] = v.z;
    nor[k * 3] = f.normal.x;
    nor[k * 3 + 1] = f.normal.y;
    nor[k * 3 + 2] = f.normal.z;
    col[k * 3] = a.color.r;
    col[k * 3 + 1] = a.color.g;
    col[k * 3 + 2] = a.color.b;
    fac[k * 4] = f.cap ? -1 : a.fac[0];
    fac[k * 4 + 1] = a.fac[1];
    fac[k * 4 + 2] = a.fac[2];
    fac[k * 4 + 3] = a.fac[3];
    box.set(a.box, k * 4);
    gl[k * 3] = a.glass.r;
    gl[k * 3 + 1] = a.glass.g;
    gl[k * 3 + 2] = a.glass.b;
    k++;
  };
  for (const f of p.faces) {
    for (let i = 1; i < f.verts.length - 1; i++) {
      put(f.verts[0], f);
      put(f.verts[i], f);
      put(f.verts[i + 1], f);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aFac', new THREE.BufferAttribute(fac, 4));
  g.setAttribute('aBox', new THREE.BufferAttribute(box, 4));
  g.setAttribute('aGlass', new THREE.BufferAttribute(gl, 3));
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}
