// Tiny low-poly modelling kit for the view models.
//
// Primitives produce triangle soups (position / normal / uv) in their own local
// frame; a Pen bakes them, transformed, into the node they are drawn on, one
// merged BufferGeometry per (node, material). Nodes are THREE.Groups with a
// rest pose that animations offset.
//
// Conventions (gun-local): +X right, +Y up, -Z forward. Profiles for prisms
// and lathes are written as [forward, y] / [radius, forward] so weapon code
// reads like a side-view blueprint. Angles are degrees, Euler order YXZ
// (yaw, then pitch, then roll about the barrel).

import * as THREE from 'three';
import { makeStudioMaterial } from './material.js';

export const DEG = Math.PI / 180;

class Geo {
  constructor() { this.p = []; this.n = []; this.uv = []; }
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// Box mapping in primitive-local units; forward (z) always maps to u so wood
// grain and wear run along the gun.
function boxUV(p, n) {
  const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
  if (ax >= ay && ax >= az) return [-p[2], p[1]];
  if (ay >= az) return [-p[2], p[0]];
  return [p[0], p[1]];
}

// Flat-shaded triangle; `hint` (optional) is an outward direction used to fix
// the winding so every face is front-facing from outside.
function triFlat(g, a, b, c, hint) {
  let n = cross(sub(b, a), sub(c, a));
  if (hint && dot(n, hint) < 0) { const t = b; b = c; c = t; n = [-n[0], -n[1], -n[2]]; }
  n = norm(n);
  for (const v of [a, b, c]) {
    g.p.push(v[0], v[1], v[2]);
    g.n.push(n[0], n[1], n[2]);
    const uv = boxUV(v, n);
    g.uv.push(uv[0], uv[1]);
  }
}
function quadFlat(g, a, b, c, d, hint) { triFlat(g, a, b, c, hint); triFlat(g, a, c, d, hint); }

// Smooth triangle with explicit normals / uvs.
function triSmooth(g, v, n, uv, hint) {
  let [a, b, c] = [0, 1, 2];
  const gn = cross(sub(v[1], v[0]), sub(v[2], v[0]));
  if (hint && dot(gn, hint) < 0) { b = 2; c = 1; }
  for (const i of [a, b, c]) {
    g.p.push(...v[i]); g.n.push(...n[i]); g.uv.push(...uv[i]);
  }
}

// ---------------------------------------------------------------- primitives

// Hexahedron from 8 corners, index = xbit + 2*ybit + 4*zbit.
export function hexa(C) {
  const g = new Geo();
  const cen = [0, 0, 0];
  for (const c of C) { cen[0] += c[0] / 8; cen[1] += c[1] / 8; cen[2] += c[2] / 8; }
  const faces = [[0, 2, 6, 4], [1, 5, 7, 3], [0, 4, 5, 1], [2, 3, 7, 6], [0, 1, 3, 2], [4, 6, 7, 5]];
  for (const f of faces) {
    const [a, b, c, d] = f.map((i) => C[i]);
    const fc = [(a[0] + b[0] + c[0] + d[0]) / 4, (a[1] + b[1] + c[1] + d[1]) / 4, (a[2] + b[2] + c[2] + d[2]) / 4];
    quadFlat(g, a, b, c, d, sub(fc, cen));
  }
  return g;
}

// Box centred on the origin. o.t = [sx, sz] scales the top face, o.sh = [dx, dz]
// shifts it (skew), o.b = [sx, sz] scales the bottom face, o.f = [sx, sy]
// scales the front (-z) face.
export function box(w, h, d, o = {}) {
  const C = [];
  for (let i = 0; i < 8; i++) {
    const xs = i & 1 ? 1 : -1, ys = i & 2 ? 1 : -1, zs = i & 4 ? 1 : -1;
    let x = (xs * w) / 2, y = (ys * h) / 2, z = (zs * d) / 2;
    if (ys > 0 && o.t) { x *= o.t[0]; z *= o.t[1]; }
    if (ys < 0 && o.b) { x *= o.b[0]; z *= o.b[1]; }
    if (zs < 0 && o.f) { x *= o.f[0]; y *= o.f[1]; }
    if (ys > 0 && o.sh) { x += o.sh[0]; z += o.sh[1]; }
    C.push([x, y, z]);
  }
  return hexa(C);
}

function signedArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length];
    a += x0 * y1 - x1 * y0;
  }
  return a / 2;
}

function insetPoly(pts, d) {
  const ccw = signedArea(pts) > 0;
  const n = pts.length, out = [];
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n];
    const e0 = norm([p1[0] - p0[0], p1[1] - p0[1], 0]), e1 = norm([p2[0] - p1[0], p2[1] - p1[1], 0]);
    // inward normals (left of edge for CCW)
    const s = ccw ? 1 : -1;
    const n0 = [-e0[1] * s, e0[0] * s], n1 = [-e1[1] * s, e1[0] * s];
    let m = [n0[0] + n1[0], n0[1] + n1[1]];
    const l = Math.hypot(m[0], m[1]) || 1; m = [m[0] / l, m[1] / l];
    const c = Math.max(0.35, m[0] * n0[0] + m[1] * n0[1]);
    out.push([p1[0] + (m[0] * d) / c, p1[1] + (m[1] * d) / c]);
  }
  return out;
}

// Extrude a side profile [[forward, y], ...] across X (width w, centred).
// o.bev chamfers the edges; o.wt = width at the top of the profile (taper),
// o.x = lateral offset.
export function prism(profile, w, o = {}) {
  const g = new Geo();
  const bev = o.bev || 0;
  const ys = profile.map((p) => p[1]);
  const ymin = Math.min(...ys), ymax = Math.max(...ys);
  const wt = o.wt ?? w;
  const half = (y) => ((w + (wt - w) * ((y - ymin) / (ymax - ymin || 1))) / 2);
  const to3 = (p, xs, shrink = 0) => [xs * (half(p[1]) - shrink), p[1], -p[0]];
  const ccw = signedArea(profile) > 0;
  const outer = profile;
  const inner = bev ? insetPoly(profile, bev) : profile;
  const n = profile.length;
  // caps
  const contour = inner.map((p) => new THREE.Vector2(p[0], p[1]));
  const tris = THREE.ShapeUtils.triangulateShape(contour, []);
  for (const xs of [-1, 1]) {
    for (const t of tris) {
      triFlat(g, to3(inner[t[0]], xs), to3(inner[t[1]], xs), to3(inner[t[2]], xs), [xs, 0, 0]);
    }
  }
  // sides (+ bevel strips)
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const a = outer[i], b = outer[j];
    const ef = b[0] - a[0], ey = b[1] - a[1];
    // outward normal of the edge in (f,y), mapped to 3D (f -> -z)
    const on = ccw ? [ey, -ef] : [-ey, ef];
    const hint = [0, on[1], -on[0]];
    quadFlat(g, to3(a, -1, bev), to3(b, -1, bev), to3(b, 1, bev), to3(a, 1, bev), hint);
    if (bev) {
      const ia = inner[i], ib = inner[j];
      for (const xs of [-1, 1]) {
        quadFlat(g, to3(a, xs, bev), to3(b, xs, bev), to3(ib, xs), to3(ia, xs), [xs, hint[1], hint[2]]);
      }
    }
  }
  return g;
}

// Cylinder / cone along -Z from z=0 (radius r0) to z=-len (radius r1).
// o.n sides, o.cap0/o.cap1, o.flat, o.a0 start angle (deg), o.ry = y scale.
export function cyl(r0, r1, len, o = {}) {
  const g = new Geo();
  const n = o.n || 8, a0 = (o.a0 ?? 180 / n) * DEG, ry = o.ry || 1;
  const cap0 = o.cap0 !== false, cap1 = o.cap1 !== false;
  const k = (r1 - r0) / len;
  const ring = (r, z) => {
    const out = [];
    for (let i = 0; i <= n; i++) {
      const a = a0 + (i / n) * Math.PI * 2;
      out.push([Math.cos(a) * r, Math.sin(a) * r * ry, z, a]);
    }
    return out;
  };
  const A = ring(r0, 0), B = ring(r1, -len);
  const circ = Math.max(r0, r1);
  for (let i = 0; i < n; i++) {
    const v = [A[i], A[i + 1], B[i + 1], B[i]].map((q) => [q[0], q[1], q[2]]);
    const mid = (A[i][3] + A[i + 1][3]) / 2;
    const hint = [Math.cos(mid), Math.sin(mid), 0];
    if (o.flat) {
      quadFlat(g, v[0], v[1], v[2], v[3], hint);
    } else {
      const nn = [A[i], A[i + 1], A[i + 1], A[i]].map((q) => norm([Math.cos(q[3]), Math.sin(q[3]) / ry, k]));
      const uv = [[i, 0], [i + 1, 0], [i + 1, len], [i, len]].map(([s, z]) => [(s / n) * Math.PI * 2 * circ, z]);
      triSmooth(g, [v[0], v[1], v[2]], [nn[0], nn[1], nn[2]], [uv[0], uv[1], uv[2]], hint);
      triSmooth(g, [v[0], v[2], v[3]], [nn[0], nn[2], nn[3]], [uv[0], uv[2], uv[3]], hint);
    }
  }
  for (const [cap, R, z, dir] of [[cap0, A, 0, 1], [cap1, B, -len, -1]]) {
    if (!cap) continue;
    const c = [0, 0, z];
    for (let i = 0; i < n; i++) triFlat(g, c, R[i].slice(0, 3), R[i + 1].slice(0, 3), [0, 0, dir]);
  }
  return g;
}

// Surface of revolution about Z: profile [[radius, forward], ...] back to front.
export function lathe(profile, o = {}) {
  const g = new Geo();
  const n = o.n || 8, a0 = (o.a0 ?? 180 / n) * DEG;
  const P = profile.map(([r, f]) => [r, -f]);
  // per-profile-vertex normals in (r, z)
  const segN = [];
  for (let j = 0; j < P.length - 1; j++) {
    const dr = P[j + 1][0] - P[j][0], dz = P[j + 1][1] - P[j][1];
    // outward normal of segment going from back (z larger) to front
    let nr = -dz, nz = dr;
    const l = Math.hypot(nr, nz) || 1; nr /= l; nz /= l;
    segN.push([nr, nz]);
  }
  const vN = P.map((_, j) => {
    const a = segN[Math.max(0, j - 1)], b = segN[Math.min(segN.length - 1, j)];
    const nr = a[0] + b[0], nz = a[1] + b[1], l = Math.hypot(nr, nz) || 1;
    return [nr / l, nz / l];
  });
  let acc = 0;
  const vv = [0];
  for (let j = 1; j < P.length; j++) { acc += Math.hypot(P[j][0] - P[j - 1][0], P[j][1] - P[j - 1][1]); vv.push(acc); }
  const rmax = Math.max(...P.map((p) => p[0]));
  for (let j = 0; j < P.length - 1; j++) {
    for (let i = 0; i < n; i++) {
      const ang = [a0 + (i / n) * Math.PI * 2, a0 + ((i + 1) / n) * Math.PI * 2];
      const pt = (jj, ii) => [Math.cos(ang[ii]) * P[jj][0], Math.sin(ang[ii]) * P[jj][0], P[jj][1]];
      const nm = (jj, ii) => (o.flat ? null : norm([Math.cos(ang[ii]) * vN[jj][0], Math.sin(ang[ii]) * vN[jj][0], vN[jj][1]]));
      const uv = (jj, ii) => [(ang[ii] - a0) * rmax, vv[jj]];
      const mid = (ang[0] + ang[1]) / 2;
      const sn = segN[j];
      const hint = [Math.cos(mid) * sn[0], Math.sin(mid) * sn[0], sn[1]];
      const q = [[j, 0], [j, 1], [j + 1, 1], [j + 1, 0]];
      const V = q.map(([a, b]) => pt(a, b));
      if (o.flat) { quadFlat(g, V[0], V[1], V[2], V[3], hint); continue; }
      const N = q.map(([a, b]) => nm(a, b)), U = q.map(([a, b]) => uv(a, b));
      triSmooth(g, [V[0], V[1], V[2]], [N[0], N[1], N[2]], [U[0], U[1], U[2]], hint);
      triSmooth(g, [V[0], V[2], V[3]], [N[0], N[2], N[3]], [U[0], U[2], U[3]], hint);
    }
  }
  return g;
}

// Single quad in the XZ plane facing +Y, 0..1 UVs (for decals: keypad, lens).
export function quad(w, d) {
  const g = new Geo();
  const v = [[-w / 2, 0, d / 2], [w / 2, 0, d / 2], [w / 2, 0, -d / 2], [-w / 2, 0, -d / 2]];
  const uv = [[0, 0], [1, 0], [1, 1], [0, 1]];
  const n = [0, 1, 0];
  triSmooth(g, [v[0], v[1], v[2]], [n, n, n], [uv[0], uv[1], uv[2]], n);
  triSmooth(g, [v[0], v[2], v[3]], [n, n, n], [uv[0], uv[2], uv[3]], n);
  return g;
}

// ------------------------------------------------------------------ helpers

const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();

export function poseMatrix(p = [0, 0, 0], r = [0, 0, 0], s = 1, out = new THREE.Matrix4()) {
  _e.set((r[0] || 0) * DEG, (r[1] || 0) * DEG, (r[2] || 0) * DEG, 'YXZ');
  _q.setFromEuler(_e);
  if (typeof s === 'number') _s.set(s, s, s); else _s.set(s[0], s[1], s[2]);
  return out.compose(_v.set(p[0] || 0, p[1] || 0, p[2] || 0), _q, _s);
}

export function toTint(c) {
  if (Array.isArray(c)) return c;
  if (typeof c === 'number') return [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];
  return [1, 1, 1];
}

// ------------------------------------------------------------------ builder

export class ModelBuilder {
  constructor() {
    this.root = new THREE.Group();
    this.root.name = 'vm_root';
    this.nodes = { root: this.root };
    this.acc = new Map(); // node name -> Map(mat -> {p,n,uv,c})
  }

  // Create a named node under `parent` with a rest pose.
  node(name, parent = 'root', p = [0, 0, 0], r = [0, 0, 0]) {
    const o = new THREE.Group();
    o.name = name;
    o.rotation.order = 'YXZ';
    o.position.set(p[0], p[1], p[2]);
    o.rotation.set(r[0] * DEG, r[1] * DEG, r[2] * DEG);
    o.userData.rest = { p: [...p], r: [...r] };
    (this.nodes[parent] || this.root).add(o);
    this.nodes[name] = o;
    return o;
  }

  // Marker node (muzzle, shell port...).
  marker(name, parent, p) {
    return this.node(name, parent, p);
  }

  // Node `dst` under `parent` that gets a copy of everything drawn on `src`
  // (copied at build time, so draw `src` before or after - it doesn't matter).
  // Used for the fresh magazine that rides in the reloading hand.
  clone(src, dst, parent, p = [0, 0, 0], r = [0, 0, 0], visible = false) {
    const n = this.node(dst, parent, p, r);
    n.visible = visible;
    n.userData.defVisible = visible;
    (this.clones || (this.clones = [])).push([src, dst]);
    return n;
  }

  pen(nodeName) { return new Pen(this, nodeName); }

  addGeo(nodeName, mat, tint, geo, matrix) {
    if (!this.acc.has(nodeName)) this.acc.set(nodeName, new Map());
    const m = this.acc.get(nodeName);
    if (!m.has(mat)) m.set(mat, { p: [], n: [], uv: [], c: [] });
    const a = m.get(mat);
    const t = toTint(tint);
    const nm = new THREE.Matrix3().getNormalMatrix(matrix);
    const v = new THREE.Vector3();
    for (let i = 0; i < geo.p.length; i += 3) {
      v.set(geo.p[i], geo.p[i + 1], geo.p[i + 2]).applyMatrix4(matrix);
      a.p.push(v.x, v.y, v.z);
      v.set(geo.n[i], geo.n[i + 1], geo.n[i + 2]).applyMatrix3(nm).normalize();
      a.n.push(v.x, v.y, v.z);
      a.c.push(t[0], t[1], t[2]);
    }
    for (let i = 0; i < geo.uv.length; i++) a.uv.push(geo.uv[i]);
  }

  // Bake all accumulated geometry into meshes. Returns {root, nodes, materials, geometries}.
  build(shared) {
    for (const [src, dst] of this.clones || []) {
      const a = this.acc.get(src);
      if (a) this.acc.set(dst, new Map(a));
    }
    const materials = new Map();
    const geometries = [];
    let tris = 0;
    for (const [nodeName, mats] of this.acc) {
      const node = this.nodes[nodeName];
      for (const [mat, a] of mats) {
        if (!materials.has(mat)) materials.set(mat, makeStudioMaterial(mat, shared));
        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.Float32BufferAttribute(a.p, 3));
        geom.setAttribute('normal', new THREE.Float32BufferAttribute(a.n, 3));
        geom.setAttribute('uv', new THREE.Float32BufferAttribute(a.uv, 2));
        geom.setAttribute('color', new THREE.Float32BufferAttribute(a.c, 3));
        geom.computeBoundingSphere();
        tris += a.p.length / 9;
        const mesh = new THREE.Mesh(geom, materials.get(mat));
        mesh.name = `${nodeName}:${mat}`;
        mesh.frustumCulled = false;
        node.add(mesh);
        geometries.push(geom);
      }
    }
    return { root: this.root, nodes: this.nodes, materials: [...materials.values()], geometries, tris };
  }
}

// Drawing helper bound to one node. Every call takes a pose {p, r, s}.
export class Pen {
  constructor(mb, node) { this.mb = mb; this.nodeName = node; this.base = null; }
  // Optional extra transform applied to everything this pen draws.
  at(p, r, s) { this.base = poseMatrix(p, r, s); return this; }
  geo(mat, tint, g, o = {}) {
    let m = o.m ? o.m.clone() : poseMatrix(o.p, o.r, o.s);
    if (this.base) m = this.base.clone().multiply(m);
    this.mb.addGeo(this.nodeName, mat, tint, g, m);
    return this;
  }
  box(mat, tint, w, h, d, o = {}) { return this.geo(mat, tint, box(w, h, d, o), o); }
  prism(mat, tint, profile, w, o = {}) { return this.geo(mat, tint, prism(profile, w, o), o); }
  cyl(mat, tint, r0, r1, len, o = {}) { return this.geo(mat, tint, cyl(r0, r1, len, o), o); }
  lathe(mat, tint, profile, o = {}) { return this.geo(mat, tint, lathe(profile, o), o); }
  quad(mat, tint, w, d, o = {}) { return this.geo(mat, tint, quad(w, d), o); }
  hexa(mat, tint, corners, o = {}) { return this.geo(mat, tint, hexa(corners), o); }
  // Box spanning two forward positions (f0 -> f1) at height y0..y1, width w.
  span(mat, tint, f0, f1, y0, y1, w, o = {}) {
    const p = [o.x || 0, (y0 + y1) / 2, -(f0 + f1) / 2];
    return this.geo(mat, tint, box(w, y1 - y0, f1 - f0, o), { ...o, p, r: o.r });
  }
  // Tube along the barrel axis from forward f0 to f1 at height y.
  tube(mat, tint, f0, f1, y, r0, r1 = r0, o = {}) {
    return this.geo(mat, tint, cyl(r0, r1, f1 - f0, o), { p: [o.x || 0, y, -f0], r: o.r });
  }
}
