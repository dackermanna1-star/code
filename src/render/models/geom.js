// Procedural geometry toolkit for the model library.
//
// A Piece is a local triangle soup (positions + optional per-triangle
// material). A Part accumulates transformed pieces and finally bakes them into
// a non-indexed BufferGeometry with position / normal / color. Materials are
// resolved through a palette at bake time: plain sRGB hex colours, per-vertex
// colour functions, or seeded camouflage that splits triangles along the camo
// boundaries so patches get crisp edges without needing a dense mesh.

import * as THREE from 'three';

export const DEG = Math.PI / 180;
export const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------
// Seeded randomness and noise

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(...parts) {
  let h = 2166136261 >>> 0;
  for (const part of parts) {
    const s = String(part);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    h ^= 0x9e3779b9;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function makeRng(seed) {
  const r = mulberry32(seed);
  r.range = (a, b) => a + (b - a) * r();
  r.int = (a, b) => Math.floor(a + (b - a + 1) * r());
  r.pick = (arr) => arr[Math.floor(r() * arr.length) % arr.length];
  r.sign = () => (r() < 0.5 ? -1 : 1);
  return r;
}

function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
function grad(h, x, y, z) {
  const k = h & 15;
  const u = k < 8 ? x : y;
  const v = k < 4 ? y : (k === 12 || k === 14 ? x : z);
  return ((k & 1) === 0 ? u : -u) + ((k & 2) === 0 ? v : -v);
}

// Seeded 3D gradient (Perlin) noise, roughly in [-1, 1].
export function makeNoise(seed) {
  const r = mulberry32(seed);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    const t = p[i]; p[i] = p[j]; p[j] = t;
  }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  return function noise(x, y, z) {
    let X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z);
    x -= X; y -= Y; z -= Z;
    X &= 255; Y &= 255; Z &= 255;
    const u = fade(x), v = fade(y), w = fade(z);
    const A = perm[X] + Y, AA = perm[A] + Z, AB = perm[A + 1] + Z;
    const B = perm[X + 1] + Y, BA = perm[B] + Z, BB = perm[B + 1] + Z;
    const l1 = grad(perm[AA], x, y, z) + u * (grad(perm[BA], x - 1, y, z) - grad(perm[AA], x, y, z));
    const l2 = grad(perm[AB], x, y - 1, z) + u * (grad(perm[BB], x - 1, y - 1, z) - grad(perm[AB], x, y - 1, z));
    const l3 = grad(perm[AA + 1], x, y, z - 1) + u * (grad(perm[BA + 1], x - 1, y, z - 1) - grad(perm[AA + 1], x, y, z - 1));
    const l4 = grad(perm[AB + 1], x, y - 1, z - 1) + u * (grad(perm[BB + 1], x - 1, y - 1, z - 1) - grad(perm[AB + 1], x, y - 1, z - 1));
    const m1 = l1 + v * (l2 - l1);
    const m2 = l3 + v * (l4 - l3);
    return m1 + w * (m2 - m1);
  };
}

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// ---------------------------------------------------------------------------
// Small vector helpers on [x, y, z] arrays

export const v3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  scale: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]),
  norm: (a) => { const l = Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
};

function centroid(ring) {
  let x = 0, y = 0, z = 0;
  for (const p of ring) { x += p[0]; y += p[1]; z += p[2]; }
  const n = ring.length;
  return [x / n, y / n, z / n];
}

// ---------------------------------------------------------------------------
// Piece: local triangle soup

export class Piece {
  constructor() {
    this.p = [];   // 9 floats per triangle
    this.m = [];   // material per triangle (undefined -> Part.add default)
    this.n = null; // 9 floats per triangle once computed
  }

  get count() { return this.m.length; }

  tri(a, b, c, m) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    if (cx * cx + cy * cy + cz * cz < 1e-16) return this;
    this.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    this.m.push(m);
    this.n = null;
    return this;
  }

  quad(a, b, c, d, m) {
    this.tri(a, b, c, m);
    return this.tri(a, c, d, m);
  }

  // Quad / triangle wound so the face normal points along `facing`.
  quadF(a, b, c, d, facing, m) {
    const n = v3.cross(v3.sub(b, a), v3.sub(c, a));
    return v3.dot(n, facing) >= 0 ? this.quad(a, b, c, d, m) : this.quad(a, d, c, b, m);
  }

  triF(a, b, c, facing, m) {
    const n = v3.cross(v3.sub(b, a), v3.sub(c, a));
    return v3.dot(n, facing) >= 0 ? this.tri(a, b, c, m) : this.tri(a, c, b, m);
  }

  append(other) {
    for (const x of other.p) this.p.push(x);
    for (const m of other.m) this.m.push(m);
    this.n = null;
    return this;
  }

  setMat(m) {
    for (let i = 0; i < this.m.length; i++) this.m[i] = m;
    return this;
  }

  flip() {
    const p = this.p, n = this.n;
    for (let t = 0; t < this.m.length; t++) {
      const mt = this.m[t];
      if (Array.isArray(mt)) this.m[t] = [mt[0], mt[2], mt[1]];
      const o = t * 9;
      for (let k = 0; k < 3; k++) {
        let s = p[o + 3 + k]; p[o + 3 + k] = p[o + 6 + k]; p[o + 6 + k] = s;
        if (n) { s = n[o + 3 + k]; n[o + 3 + k] = n[o + 6 + k]; n[o + 6 + k] = s; }
      }
    }
    return this;
  }

  // Deform positions in place: fn([x, y, z]) -> [x, y, z]. Normals are reset.
  map(fn) {
    const p = this.p;
    for (let i = 0; i < p.length; i += 3) {
      const q = fn([p[i], p[i + 1], p[i + 2]]);
      p[i] = q[0]; p[i + 1] = q[1]; p[i + 2] = q[2];
    }
    this.n = null;
    return this;
  }

  // Bake a transform ({at, rot, s} or Matrix4) into the piece.
  transform(o) {
    const M = o.isMatrix4 ? o : toMatrix(o);
    const e = M.elements;
    const nm = new THREE.Matrix3().getNormalMatrix(M).elements;
    const p = this.p, n = this.n;
    for (let i = 0; i < p.length; i += 3) {
      const x = p[i], y = p[i + 1], z = p[i + 2];
      p[i] = e[0] * x + e[4] * y + e[8] * z + e[12];
      p[i + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
      p[i + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
      if (n) {
        const a = n[i], b = n[i + 1], c = n[i + 2];
        const nx = nm[0] * a + nm[3] * b + nm[6] * c;
        const ny = nm[1] * a + nm[4] * b + nm[7] * c;
        const nz = nm[2] * a + nm[5] * b + nm[8] * c;
        const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        n[i] = nx / l; n[i + 1] = ny / l; n[i + 2] = nz / l;
      }
    }
    if (M.determinant() < 0) this.flip();
    return this;
  }

  // Face normals, or normals smoothed across edges flatter than `crease` degrees.
  normals(crease = 0) {
    const p = this.p, nt = this.m.length;
    const fn = new Float64Array(nt * 3);
    for (let t = 0; t < nt; t++) {
      const o = t * 9;
      const ux = p[o + 3] - p[o], uy = p[o + 4] - p[o + 1], uz = p[o + 5] - p[o + 2];
      const vx = p[o + 6] - p[o], vy = p[o + 7] - p[o + 1], vz = p[o + 8] - p[o + 2];
      fn[t * 3] = uy * vz - uz * vy;
      fn[t * 3 + 1] = uz * vx - ux * vz;
      fn[t * 3 + 2] = ux * vy - uy * vx;
    }
    const uf = new Float64Array(nt * 3);
    for (let t = 0; t < nt; t++) {
      const l = Math.sqrt(fn[t * 3] * fn[t * 3] + fn[t * 3 + 1] * fn[t * 3 + 1] + fn[t * 3 + 2] * fn[t * 3 + 2]) || 1;
      uf[t * 3] = fn[t * 3] / l; uf[t * 3 + 1] = fn[t * 3 + 1] / l; uf[t * 3 + 2] = fn[t * 3 + 2] / l;
    }
    const n = new Array(nt * 9);
    if (!crease) {
      for (let t = 0; t < nt; t++) {
        for (let k = 0; k < 3; k++) {
          n[t * 9 + k * 3] = uf[t * 3]; n[t * 9 + k * 3 + 1] = uf[t * 3 + 1]; n[t * 9 + k * 3 + 2] = uf[t * 3 + 2];
        }
      }
      this.n = n;
      return this;
    }
    const cosT = Math.cos(crease * DEG);
    const map = new Map();
    const keys = new Array(nt * 3);
    for (let v = 0; v < nt * 3; v++) {
      const i = v * 3;
      const k = posKey(p[i], p[i + 1], p[i + 2]);
      keys[v] = k;
      let l = map.get(k);
      if (!l) map.set(k, (l = []));
      l.push((v / 3) | 0);
    }
    for (let v = 0; v < nt * 3; v++) {
      const t = (v / 3) | 0;
      const list = map.get(keys[v]);
      let sx = 0, sy = 0, sz = 0;
      for (const t2 of list) {
        if (uf[t * 3] * uf[t2 * 3] + uf[t * 3 + 1] * uf[t2 * 3 + 1] + uf[t * 3 + 2] * uf[t2 * 3 + 2] >= cosT) {
          sx += fn[t2 * 3]; sy += fn[t2 * 3 + 1]; sz += fn[t2 * 3 + 2];
        }
      }
      const l = Math.sqrt(sx * sx + sy * sy + sz * sz) || 1;
      n[v * 3] = sx / l; n[v * 3 + 1] = sy / l; n[v * 3 + 2] = sz / l;
    }
    this.n = n;
    return this;
  }
}

// ---------------------------------------------------------------------------
// Transforms

const _M4 = new THREE.Matrix4();
const _N3 = new THREE.Matrix3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

export function toMatrix(o) {
  const m = new THREE.Matrix4();
  if (o.m4) return m.copy(o.m4);
  if (o.rot) _q.setFromEuler(_e.set(o.rot[0], o.rot[1], o.rot[2], o.order || 'YXZ'));
  else _q.identity();
  if (o.s === undefined) _s.set(1, 1, 1);
  else if (typeof o.s === 'number') _s.set(o.s, o.s, o.s);
  else _s.set(o.s[0], o.s[1], o.s[2]);
  if (o.at) _p.set(o.at[0], o.at[1], o.at[2]); else _p.set(0, 0, 0);
  return m.compose(_p, _q, _s);
}

// ---------------------------------------------------------------------------
// Primitives (all return Pieces in local space)

function newell(ring) {
  let x = 0, y = 0, z = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    x += (a[1] - b[1]) * (a[2] + b[2]);
    y += (a[2] - b[2]) * (a[0] + b[0]);
    z += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return [x, y, z];
}

function capRing(P, ring, desired, m) {
  const c0 = ring[0];
  let degenerate = true;
  for (const q of ring) if (Math.abs(q[0] - c0[0]) + Math.abs(q[1] - c0[1]) + Math.abs(q[2] - c0[2]) > 1e-7) degenerate = false;
  if (degenerate) return;
  const nrm = newell(ring);
  let tris;
  if (ring.length === 3) tris = [[0, 1, 2]];
  else if (ring.length === 4) tris = [[0, 1, 2], [0, 2, 3]];
  else {
    const ax = Math.abs(nrm[0]), ay = Math.abs(nrm[1]), az = Math.abs(nrm[2]);
    let u, v;
    if (ax >= ay && ax >= az) { u = 1; v = 2; } else if (ay >= az) { u = 2; v = 0; } else { u = 0; v = 1; }
    const pts = ring.map((q) => new THREE.Vector2(q[u], q[v]));
    tris = THREE.ShapeUtils.triangulateShape(pts, []);
  }
  for (const [a, b, c] of tris) {
    const A = ring[a], B = ring[b], C = ring[c];
    const n = v3.cross(v3.sub(B, A), v3.sub(C, A));
    if (v3.dot(n, desired) >= 0) P.tri(A, B, C, m); else P.tri(A, C, B, m);
  }
}

// Connect consecutive rings (arrays of [x,y,z], equal length) with quads.
// Options: closed (default true), caps 'both'|'start'|'end'|'none', smooth
// (crease angle in degrees), wallMat(i, j), capMat, orient (auto-orient walls
// outward, default true for closed rings), flip.
export function loft(rings, o = {}) {
  const P = new Piece();
  const nR = rings.length, nP = rings[0].length;
  const closed = o.closed !== false;
  const segs = closed ? nP : nP - 1;
  const bandStart = [];
  for (let i = 0; i < nR - 1; i++) {
    bandStart.push(P.count);
    const A = rings[i], B = rings[i + 1];
    for (let j = 0; j < segs; j++) {
      const j2 = (j + 1) % nP;
      P.quad(A[j], A[j2], B[j2], B[j], o.wallMat ? o.wallMat(i, j) : undefined);
    }
  }
  bandStart.push(P.count);
  if (closed && o.orient !== false && nR > 1) {
    let s = 0;
    const p = P.p;
    for (let i = 0; i < nR - 1; i++) {
      const c = v3.lerp(centroid(rings[i]), centroid(rings[i + 1]), 0.5);
      for (let t = bandStart[i]; t < bandStart[i + 1]; t++) {
        const q = t * 9;
        const ux = p[q + 3] - p[q], uy = p[q + 4] - p[q + 1], uz = p[q + 5] - p[q + 2];
        const vx = p[q + 6] - p[q], vy = p[q + 7] - p[q + 1], vz = p[q + 8] - p[q + 2];
        const tx = (p[q] + p[q + 3] + p[q + 6]) / 3 - c[0];
        const ty = (p[q + 1] + p[q + 4] + p[q + 7]) / 3 - c[1];
        const tz = (p[q + 2] + p[q + 5] + p[q + 8]) / 3 - c[2];
        s += (uy * vz - uz * vy) * tx + (uz * vx - ux * vz) * ty + (ux * vy - uy * vx) * tz;
      }
    }
    if (s < 0) P.flip();
  }
  if (o.flip) P.flip();
  const caps = o.caps ?? (closed ? 'both' : 'none');
  if (closed && caps !== 'none' && nR > 1) {
    if (caps === 'both' || caps === 'start') {
      capRing(P, rings[0], v3.sub(centroid(rings[0]), centroid(rings[1])), o.capMat);
    }
    if (caps === 'both' || caps === 'end') {
      capRing(P, rings[nR - 1], v3.sub(centroid(rings[nR - 1]), centroid(rings[nR - 2])), o.capMat);
    }
  }
  if (o.smooth) P.normals(o.smooth);
  return P;
}

// Axis-aligned box centred on the origin. noBottom / noTop drop a face.
export function box(w, h, d, o = {}) {
  const x = w / 2, y = h / 2, z = d / 2;
  const P = new Piece();
  // corners: bottom 0-3, top 4-7 (counter-clockwise seen from above)
  const c = [[-x, -y, -z], [x, -y, -z], [x, -y, z], [-x, -y, z], [-x, y, -z], [x, y, -z], [x, y, z], [-x, y, z]];
  P.quad(c[0], c[4], c[5], c[1]); // -Z
  P.quad(c[1], c[5], c[6], c[2]); // +X
  P.quad(c[2], c[6], c[7], c[3]); // +Z
  P.quad(c[3], c[7], c[4], c[0]); // -X
  if (!o.noTop) P.quad(c[4], c[7], c[6], c[5]);
  if (!o.noBottom) P.quad(c[0], c[1], c[2], c[3]);
  return P;
}

// Box with chamfered vertical edges and top edge (bevel b), sitting centred.
export function bbox(w, h, d, b = 0.05, o = {}) {
  const x = w / 2, y = h / 2, z = d / 2;
  const oct = (xx, zz, yy) => [
    [-xx + b, yy, -zz], [xx - b, yy, -zz], [xx, yy, -zz + b], [xx, yy, zz - b],
    [xx - b, yy, zz], [-xx + b, yy, zz], [-xx, yy, zz - b], [-xx, yy, -zz + b],
  ];
  const rings = [oct(x, z, -y), oct(x, z, y - b), oct(x - b, z - b, y)];
  return loft(rings, { caps: o.noBottom ? 'end' : 'both' });
}

// Extrude a profile of [z, y] points across X from x0 to x1.
export function prismX(pts, x0, x1, o = {}) {
  return loft([pts.map(([z, y]) => [x0, y, z]), pts.map(([z, y]) => [x1, y, z])], o);
}
// Extrude a profile of [x, z] points (top view) vertically from y0 to y1.
export function prismY(pts, y0, y1, o = {}) {
  return loft([pts.map(([x, z]) => [x, y0, z]), pts.map(([x, z]) => [x, y1, z])], o);
}
// Extrude a profile of [x, y] points (cross-section) along Z from z0 to z1.
export function prismZ(pts, z0, z1, o = {}) {
  return loft([pts.map(([x, y]) => [x, y, z0]), pts.map(([x, y]) => [x, y, z1])], o);
}

function circle(r, seg, y, phase = 0) {
  const out = [];
  for (let k = 0; k < seg; k++) {
    const a = phase + (k / seg) * TAU;
    out.push([Math.cos(a) * r, y, Math.sin(a) * r]);
  }
  return out;
}

const AXIS = {
  y: null,
  x: { rot: [0, 0, -Math.PI / 2] },
  z: { rot: [Math.PI / 2, 0, 0] },
};

// Cylinder along Y (or o.axis 'x'/'z'), centred, radius r (bottom) / o.r2 (top).
export function cyl(r, h, seg = 12, o = {}) {
  const P = loft([circle(r, seg, -h / 2, o.phase), circle(o.r2 ?? r, seg, h / 2, o.phase)], {
    caps: o.caps ?? 'both', capMat: o.capMat,
  });
  P.normals(o.flat ? 0 : Math.min(85, 360 / seg + 20));
  if (o.axis && AXIS[o.axis]) P.transform(AXIS[o.axis]);
  return P;
}

// Surface of revolution around Y (or o.axis) from [[r, y], ...].
export function lathe(profile, seg = 12, o = {}) {
  const rings = profile.map(([r, y]) => circle(r, seg, y, o.phase));
  const P = loft(rings, {
    caps: o.caps ?? 'none',
    wallMat: o.mats ? (i) => o.mats[i] : undefined,
  });
  P.normals(o.crease ?? 50);
  if (o.axis && AXIS[o.axis]) P.transform(AXIS[o.axis]);
  return P;
}

export function sphere(r, wSeg = 12, hSeg = 8, o = {}) {
  const prof = [];
  for (let i = 0; i <= hSeg; i++) {
    const th = (i / hSeg) * Math.PI;
    prof.push([Math.sin(th) * r, -Math.cos(th) * r]);
  }
  return lathe(prof, wSeg, { crease: o.crease ?? 180, phase: o.phase });
}

// Rotation-minimising frames along a polyline.
function frames(path) {
  const n = path.length;
  const T = [];
  for (let i = 0; i < n; i++) {
    const a = path[Math.max(0, i - 1)], b = path[Math.min(n - 1, i + 1)];
    T.push(v3.norm(v3.sub(b, a)));
  }
  const t0 = T[0];
  let u = Math.abs(t0[1]) < 0.95 ? v3.norm(v3.cross(t0, [0, 1, 0])) : v3.norm(v3.cross(t0, [1, 0, 0]));
  const U = [u];
  for (let i = 1; i < n; i++) {
    const v = v3.cross(T[i - 1], U[i - 1]);
    u = v3.norm(v3.cross(v, T[i]));
    if (!Number.isFinite(u[0]) || v3.len(u) < 0.5) u = U[i - 1];
    U.push(u);
  }
  return { T, U };
}

// Tube along a polyline. radius: number or (i, t) => r.
export function sweep(path, radius, seg = 6, o = {}) {
  const { T, U } = frames(path);
  const rings = path.map((c, i) => {
    const r = typeof radius === 'function' ? radius(i, i / (path.length - 1)) : radius;
    const u = U[i], v = v3.cross(T[i], u);
    const ring = [];
    for (let k = 0; k < seg; k++) {
      const a = (o.phase || 0) + (k / seg) * TAU;
      ring.push(v3.add(c, v3.add(v3.scale(u, Math.cos(a) * r), v3.scale(v, Math.sin(a) * r))));
    }
    return ring;
  });
  const P = loft(rings, { caps: o.caps ?? 'none' });
  P.normals(o.flat ? 0 : (o.crease ?? Math.min(85, 360 / seg + 20)));
  return P;
}

// Straight tube between two points.
export function tube(a, b, r0, r1 = r0, seg = 6, o = {}) {
  return sweep([a, b], (i) => (i === 0 ? r0 : r1), seg, o);
}

// Icosphere with optional displacement fn(unitDir) -> [x, y, z].
export function icosphere(detail = 1, displace = null) {
  const t = (1 + Math.sqrt(5)) / 2;
  const verts = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t],
    [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ].map(v3.norm);
  let faces = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2],
    [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5],
    [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];
  for (let d = 0; d < detail; d++) {
    const cache = new Map();
    const mid = (a, b) => {
      const k = a < b ? a * 100000 + b : b * 100000 + a;
      let i = cache.get(k);
      if (i === undefined) {
        i = verts.length;
        verts.push(v3.norm(v3.lerp(verts[a], verts[b], 0.5)));
        cache.set(k, i);
      }
      return i;
    };
    const next = [];
    for (const [a, b, c] of faces) {
      const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
      next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    faces = next;
  }
  const pos = verts.map((v) => (displace ? displace(v) : v));
  const P = new Piece();
  for (const [a, b, c] of faces) {
    const n = v3.cross(v3.sub(verts[b], verts[a]), v3.sub(verts[c], verts[a]));
    if (v3.dot(n, verts[a]) >= 0) P.tri(pos[a], pos[b], pos[c]); else P.tri(pos[a], pos[c], pos[b]);
  }
  return P;
}

// ---------------------------------------------------------------------------
// Part: accumulates transformed pieces, bakes to BufferGeometry

export class Part {
  constructor(defaultMat = 'paint') {
    this.p = [];
    this.n = [];
    this.m = [];
    this.def = defaultMat;
    this.mat = new THREE.Matrix4();
    this.stack = [];
  }

  get count() { return this.m.length; }

  push(o) {
    this.stack.push(this.mat.clone());
    this.mat.multiply(o.isMatrix4 ? o : toMatrix(o));
    return this;
  }

  pop() {
    this.mat = this.stack.pop();
    return this;
  }

  group(o, fn) {
    this.push(o);
    fn(this);
    return this.pop();
  }

  // Run fn for the +X side, then again mirrored to -X (fn receives side = 1 | -1).
  mirrorX(fn) {
    fn(this, 1);
    this.push({ s: [-1, 1, 1] });
    fn(this, -1);
    return this.pop();
  }

  add(piece, o = {}) {
    if (!piece.n) piece.normals(0);
    const local = o.at || o.rot || o.s !== undefined || o.m4;
    const M = local ? _M4.copy(this.mat).multiply(toMatrix(o)) : this.mat;
    const e = M.elements;
    const e0 = e[0], e1 = e[1], e2 = e[2], e4 = e[4], e5 = e[5], e6 = e[6];
    const e8 = e[8], e9 = e[9], e10 = e[10], e12 = e[12], e13 = e[13], e14 = e[14];
    const nm = _N3.getNormalMatrix(M).elements;
    const n0 = nm[0], n1 = nm[1], n2 = nm[2], n3 = nm[3], n4 = nm[4], n5 = nm[5], n6 = nm[6], n7 = nm[7], n8 = nm[8];
    const flip = M.determinant() < 0;
    const P = piece.p, N = piece.n, dp = this.p, dn = this.n, dm = this.m;
    const def = o.c !== undefined ? o.c : this.def;
    for (let t = 0; t < piece.count; t++) {
      for (let kk = 0; kk < 3; kk++) {
        const i = t * 9 + (flip && kk ? 3 - kk : kk) * 3;
        const x = P[i], y = P[i + 1], z = P[i + 2];
        const a = N[i], b = N[i + 1], c = N[i + 2];
        const nx = n0 * a + n3 * b + n6 * c, ny = n1 * a + n4 * b + n7 * c, nz = n2 * a + n5 * b + n8 * c;
        const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        dp.push(e0 * x + e4 * y + e8 * z + e12, e1 * x + e5 * y + e9 * z + e13, e2 * x + e6 * y + e10 * z + e14);
        dn.push(nx / l, ny / l, nz / l);
      }
      let pm = piece.m[t];
      if (flip && Array.isArray(pm)) pm = [pm[0], pm[2], pm[1]];
      dm.push(o.force ? def : (pm !== undefined ? pm : def));
    }
    return this;
  }

  // Convenience wrappers: primitive args, then placement options {at, rot, s, c}.
  box(w, h, d, o = {}) { return this.add(box(w, h, d, o), o); }
  bbox(w, h, d, b, o = {}) { return this.add(bbox(w, h, d, b, o), o); }
  prismX(pts, x0, x1, o = {}) { return this.add(prismX(pts, x0, x1, o), o); }
  prismY(pts, y0, y1, o = {}) { return this.add(prismY(pts, y0, y1, o), o); }
  prismZ(pts, z0, z1, o = {}) { return this.add(prismZ(pts, z0, z1, o), o); }
  cyl(r, h, seg, o = {}) { return this.add(cyl(r, h, seg, o), o); }
  lathe(profile, seg, o = {}) { return this.add(lathe(profile, seg, o), o); }
  sphere(r, w, h, o = {}) { return this.add(sphere(r, w, h, o), o); }
  tube(a, b, r0, r1, seg, o = {}) { return this.add(tube(a, b, r0, r1, seg, o), o); }
  sweep(path, r, seg, o = {}) { return this.add(sweep(path, r, seg, o), o); }
  loft(rings, o = {}) { return this.add(loft(rings, o), o); }
  quad(a, b, c, d, o = {}) {
    const P = new Piece().quad(a, b, c, d);
    return this.add(P, o);
  }
  tri(a, b, c, o = {}) { return this.add(new Piece().tri(a, b, c), o); }

  toGeometry(pal, o = {}) {
    return bake(this, pal, o);
  }
}

// ---------------------------------------------------------------------------
// Baking: material resolution, camouflage, fake AO

const colorCache = new Map();
export function lin(hex) {
  let c = colorCache.get(hex);
  if (!c) {
    const col = new THREE.Color(hex);
    c = [col.r, col.g, col.b];
    colorCache.set(hex, c);
  }
  return c;
}

const DIRT = 0x6b5a45;

function resolveSpec(pal, mat, cache) {
  let s = cache.get(mat);
  if (s) return s;
  let v = mat;
  if (typeof mat === 'string') {
    v = pal[mat];
    if (v === undefined) throw new Error(`models: unknown material '${mat}'`);
  }
  if (Array.isArray(v)) s = { kind: 'verts', rgbs: v.map(lin), grime: false, ao: false };
  else if (typeof v === 'number') s = { kind: 'const', rgb: lin(v), grime: true, ao: true };
  else if (typeof v === 'function') s = { kind: 'fn', fn: v, grime: false, ao: true };
  else if (v && v.layers && v.layers.length === 0) {
    s = { kind: 'const', rgb: lin(v.base), grime: v.grime !== false, ao: v.ao !== false, vary: v.vary, varyF: v.varyF };
  } else if (v && v.layers) {
    s = {
      kind: 'camo',
      cell: v.cell ?? 0.6,
      colors: [lin(v.base), ...v.layers.map((l) => lin(l.color))],
      layers: v.layers,
      vary: v.vary ?? 0,
      varyF: v.varyF,
      split: v.split !== false,
      skipDown: v.skipDown !== false,
      grime: v.grime !== false,
      ao: v.ao !== false,
    };
  } else if (v && v.color !== undefined) {
    s = { kind: 'const', rgb: lin(v.color), grime: v.grime !== false, ao: v.ao !== false, vary: v.vary, varyF: v.varyF };
  } else throw new Error(`models: bad material '${String(mat)}'`);
  cache.set(mat, s);
  return s;
}

// Growable float output for baked vertices.
class Out {
  constructor(n) {
    this.p = new Float32Array(n * 3);
    this.n = new Float32Array(n * 3);
    this.c = new Float32Array(n * 3);
    this.len = 0;
  }

  vert(x, y, z, nx, ny, nz, r, g, b) {
    if (this.len + 3 > this.p.length) {
      for (const k of ['p', 'n', 'c']) {
        const a = new Float32Array(this.p.length * 2);
        a.set(this[k]);
        this[k] = a;
      }
    }
    const i = this.len;
    this.p[i] = x; this.p[i + 1] = y; this.p[i + 2] = z;
    this.n[i] = nx; this.n[i + 1] = ny; this.n[i + 2] = nz;
    this.c[i] = r; this.c[i + 1] = g; this.c[i + 2] = b;
    this.len += 3;
  }
}

function shadeCtx(o) {
  return {
    ao: o.ao !== false,
    aoDown: o.aoDown ?? 0.32,
    grime: !!o.grime,
    g0: o.grime ? o.grime[0] : 0,
    g1: o.grime ? o.grime[1] : 1,
    dirt: o.dirt ?? 0.35,
    dc: lin(o.dirtColor ?? DIRT),
  };
}

function shadeInto(out, rgb, x, y, z, nx, ny, nz, spec, sh, vary) {
  let r = rgb[0], g = rgb[1], b = rgb[2];
  if (spec.vary && spec.varyF) {
    const f = 1 + spec.vary * (vary ?? spec.varyF(x, y, z));
    r *= f; g *= f; b *= f;
  }
  if (spec.ao && sh.ao && ny < 0) {
    const f = 1 - sh.aoDown * -ny;
    r *= f; g *= f; b *= f;
  }
  if (spec.grime && sh.grime) {
    const h = smoothstep(sh.g0, sh.g1, y);
    const d = (1 - h) * sh.dirt;
    const f = 0.8 + 0.2 * h;
    r = (r + (sh.dc[0] - r) * d) * f;
    g = (g + (sh.dc[1] - g) * d) * f;
    b = (b + (sh.dc[2] - b) * d) * f;
  }
  out.vert(x, y, z, nx, ny, nz, r, g, b);
}

function vtx(P, N, i) {
  return [P[i], P[i + 1], P[i + 2], N[i], N[i + 1], N[i + 2]];
}

function lerpVtx(a, b, t) {
  const nx = a[3] + (b[3] - a[3]) * t, ny = a[4] + (b[4] - a[4]) * t, nz = a[5] + (b[5] - a[5]) * t;
  const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, nx / l, ny / l, nz / l];
}

function d2(a, b) {
  const x = a[0] - b[0], y = a[1] - b[1], z = a[2] - b[2];
  return x * x + y * y + z * z;
}

// Exact numeric key for positions quantised to 1 mm within +-65 m.
function posKey(x, y, z) {
  return ((Math.round(x * 1000) + 65536) * 131072 + (Math.round(y * 1000) + 65536)) * 131072 + (Math.round(z * 1000) + 65536);
}

// Evaluates the signed layer fields of a camo spec (slot L = brightness
// variation). Position-only layers are cached by position; layers flagged
// `normal` (cheap analytic waterlines) are evaluated per call.
function camoCtx(spec) {
  const L = spec.layers.length;
  const normalLayers = [];
  spec.layers.forEach((l, i) => { if (l.normal) normalLayers.push(i); });
  const cache = new Map();
  const field = (l, q) => {
    const layer = spec.layers[l];
    const f = layer.f(q[0], q[1], q[2], q[3], q[4], q[5]) - layer.t;
    return layer.below ? -f : f;
  };
  return function vals(q) {
    const key = posKey(q[0], q[1], q[2]);
    let v = cache.get(key);
    if (!v) {
      v = new Float64Array(L + 1);
      for (let l = 0; l < L; l++) if (!spec.layers[l].normal) v[l] = field(l, q);
      v[L] = spec.varyF ? spec.varyF(q[0], q[1], q[2]) : 0;
      cache.set(key, v);
    }
    if (!normalLayers.length) return v;
    const w = Float64Array.from(v);
    for (const l of normalLayers) w[l] = field(l, q);
    return w;
  };
}

function regionOf(v, L, mask) {
  let r = 0;
  for (let l = 0; l < L; l++) if (v[l] >= 0 && (!mask || mask[l])) r = l + 1;
  return r;
}

function emitTri(tri, region, spec, vals, sh, out) {
  const rgb = spec.colors[region];
  const L = spec.layers.length;
  for (const q of tri) shadeInto(out, rgb, q[0], q[1], q[2], q[3], q[4], q[5], spec, sh, vals(q)[L]);
}

function clipTri(tri, s) {
  const inside = [], outside = [];
  for (let k = 0; k < 3; k++) {
    const a = tri[k], b = tri[(k + 1) % 3], sa = s[k], sb = s[(k + 1) % 3];
    if (sa >= 0) inside.push(a); else outside.push(a);
    if ((sa >= 0) !== (sb >= 0)) {
      const m = lerpVtx(a, b, sa / (sa - sb));
      inside.push(m);
      outside.push(m);
    }
  }
  return [inside, outside];
}

// Camouflage: triangles are refined (longest-edge bisection) only where a
// colour boundary crosses them, down to spec.cell; leaf triangles are then
// clipped along the linearly interpolated boundary so patches get crisp edges.
function emitCamo(P, N, t, spec, vals, sh, out) {
  const i = t * 9;
  const L = spec.layers.length;
  const min2 = spec.cell * spec.cell;
  const step = spec.cell * 1.1;
  // layers flagged refine:false (e.g. a waterline) are clipped but never refined
  const mask = spec.layers.map((l) => l.refine !== false);
  const anyRefine = mask.some(Boolean);
  const stack = [[vtx(P, N, i), vtx(P, N, i + 3), vtx(P, N, i + 6)]];
  while (stack.length) {
    const tri = stack.pop();
    const [a, b, c] = tri;
    const lab = d2(a, b), lbc = d2(b, c), lca = d2(c, a);
    const mx = Math.max(lab, lbc, lca);
    const r0 = regionOf(vals(a), L, mask);
    if (mx > min2 && anyRefine) {
      let uniform = regionOf(vals(b), L, mask) === r0 && regionOf(vals(c), L, mask) === r0;
      const n = Math.min(9, Math.ceil(Math.sqrt(mx) / step));
      const q = [0, 0, 0, a[3], a[4], a[5]];
      for (let u = 0; uniform && u <= n; u++) {
        for (let v = 0; uniform && v <= n - u; v++) {
          const w = n - u - v;
          q[0] = (a[0] * u + b[0] * v + c[0] * w) / n;
          q[1] = (a[1] * u + b[1] * v + c[1] * w) / n;
          q[2] = (a[2] * u + b[2] * v + c[2] * w) / n;
          if (regionOf(vals(q), L, mask) !== r0) uniform = false;
        }
      }
      if (!uniform) {
        if (lab === mx) { const m = lerpVtx(a, b, 0.5); stack.push([a, m, c], [m, b, c]); }
        else if (lbc === mx) { const m = lerpVtx(b, c, 0.5); stack.push([a, b, m], [a, m, c]); }
        else { const m = lerpVtx(c, a, 0.5); stack.push([a, b, m], [m, b, c]); }
        continue;
      }
      // uniform for all refining layers: emit whole unless a waterline-type layer still cuts it
      if (mask.every(Boolean)) { emitTri(tri, r0, spec, vals, sh, out); continue; }
    }
    let tris = [{ v: tri, r: 0 }];
    for (let l = 0; l < L; l++) {
      const next = [];
      for (const tr of tris) {
        const s = [vals(tr.v[0])[l], vals(tr.v[1])[l], vals(tr.v[2])[l]];
        if (s[0] >= 0 && s[1] >= 0 && s[2] >= 0) { next.push({ v: tr.v, r: l + 1 }); continue; }
        if (s[0] < 0 && s[1] < 0 && s[2] < 0) { next.push(tr); continue; }
        const [inside, outside] = clipTri(tr.v, s);
        for (let k = 1; k < inside.length - 1; k++) next.push({ v: [inside[0], inside[k], inside[k + 1]], r: l + 1 });
        for (let k = 1; k < outside.length - 1; k++) next.push({ v: [outside[0], outside[k], outside[k + 1]], r: tr.r });
      }
      tris = next;
    }
    for (const tr of tris) emitTri(tr.v, tr.r, spec, vals, sh, out);
  }
}

function bake(part, pal, o) {
  const out = new Out(part.m.length * 3 + 64);
  const sh = shadeCtx(o);
  const cache = new Map();
  const ctxs = new Map();
  const P = part.p, N = part.n;
  const tmp = new THREE.Color();
  for (let t = 0; t < part.m.length; t++) {
    const spec = resolveSpec(pal, part.m[t], cache);
    let rgb = spec.rgb;
    let vals = null;
    if (spec.kind === 'camo') {
      vals = ctxs.get(spec);
      if (!vals) ctxs.set(spec, (vals = camoCtx(spec)));
      const i = t * 9;
      const flat = !spec.split || o.camo === false || (spec.skipDown && N[i + 1] + N[i + 4] + N[i + 7] < -1.5);
      if (!flat) {
        emitCamo(P, N, t, spec, vals, sh, out);
        continue;
      }
      const c = [(P[i] + P[i + 3] + P[i + 6]) / 3, (P[i + 1] + P[i + 4] + P[i + 7]) / 3, (P[i + 2] + P[i + 5] + P[i + 8]) / 3, N[i], N[i + 1], N[i + 2]];
      rgb = spec.colors[regionOf(vals(c), spec.layers.length)];
    }
    for (let k = 0; k < 3; k++) {
      const i = t * 9 + k * 3;
      let col = rgb;
      if (spec.kind === 'verts') col = spec.rgbs[k];
      else if (spec.kind === 'fn') {
        const v = spec.fn(P[i], P[i + 1], P[i + 2], N[i], N[i + 1], N[i + 2]);
        if (typeof v === 'number') col = lin(v);
        else { tmp.copy(v); col = [tmp.r, tmp.g, tmp.b]; }
      }
      const vary = vals ? vals([P[i], P[i + 1], P[i + 2], N[i], N[i + 1], N[i + 2]])[spec.layers.length] : undefined;
      shadeInto(out, col, P[i], P[i + 1], P[i + 2], N[i], N[i + 1], N[i + 2], spec, sh, vary);
    }
  }
  return makeGeometry(out.p.subarray(0, out.len), out.n.subarray(0, out.len), out.c.subarray(0, out.len));
}

export function makeGeometry(p, n, c) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(p), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(Float32Array.from(n), 3));
  g.setAttribute('color', new THREE.BufferAttribute(Float32Array.from(c), 3));
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}
