// =============================================================================
// Geometry helpers for the seats module.
//
// Everything is built procedurally in "seat-local" space (origin on the floor
// below the seat-pan centre, +X right, +Y up, +Z aft; the seat faces -Z) and
// merged into a handful of multi-material geometries that are drawn as
// InstancedMeshes (one group = one draw call per material).
//
// All geometries carry position / normal / uv (metres, so tiling textures use
// texture.repeat = 1 / tileSize) / color (baked AO + wear, multiplied into the
// material colour) / labelMask (0 = plain, 1 = use per-instance label rect A,
// 2 = rect B; see materials.js).
// =============================================================================
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp01 = (x) => Math.min(1, Math.max(0, x));
/** Narrow symmetric dip (for seams): 1 at x = c, 0 beyond ±w. */
export const dip = (x, c, w) => { const d = Math.abs(x - c) / w; return d >= 1 ? 0 : 0.5 + 0.5 * Math.cos(d * Math.PI); };

/** Ensure the standard attribute set (non-indexed). colorFn(x,y,z,nx,ny,nz) -> [r,g,b] or a number. */
export function finalize(geo, { color = 1, colorFn = null, label = 0 } = {}) {
  let g = geo.index ? geo.toNonIndexed() : geo;
  if (!g.attributes.normal) g.computeVertexNormals();
  const n = g.attributes.position.count;
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color', 'labelMask'].includes(k)) g.deleteAttribute(k);
  if (!g.attributes.color || colorFn) {
    const c = new Float32Array(n * 3);
    const P = g.attributes.position, N = g.attributes.normal;
    for (let i = 0; i < n; i++) {
      let v = color;
      if (colorFn) v = colorFn(P.getX(i), P.getY(i), P.getZ(i), N.getX(i), N.getY(i), N.getZ(i));
      if (typeof v === 'number') { c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = v; } else { c[i * 3] = v[0]; c[i * 3 + 1] = v[1]; c[i * 3 + 2] = v[2]; }
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  }
  if (!g.attributes.labelMask) g.setAttribute('labelMask', new THREE.Float32BufferAttribute(new Float32Array(n).fill(label), 1));
  g.groups = [];
  return g;
}

/** Box-projected UVs in metres (by dominant normal axis). */
export function boxUV(geo, scale = 1) {
  const P = geo.attributes.position, N = geo.attributes.normal;
  const uv = new Float32Array(P.count * 2);
  for (let i = 0; i < P.count; i++) {
    const ax = Math.abs(N.getX(i)), ay = Math.abs(N.getY(i)), az = Math.abs(N.getZ(i));
    let u, v;
    if (ay >= ax && ay >= az) { u = P.getX(i); v = P.getZ(i); } else if (ax >= az) { u = P.getZ(i); v = P.getY(i); } else { u = P.getX(i); v = P.getY(i); }
    uv[i * 2] = u * scale; uv[i * 2 + 1] = v * scale;
  }
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return geo;
}

/** Rounded box centred at (cx,cy,cz) with smooth (welded) normals after optional deformation. */
export function rbox(w, h, d, r, seg, cx = 0, cy = 0, cz = 0, deform = null) {
  r = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
  let g = new RoundedBoxGeometry(w, h, d, Math.max(1, seg), Math.max(1e-4, r));
  g.translate(cx, cy, cz);
  if (deform) {
    g.deleteAttribute('normal'); g.deleteAttribute('uv');
    g = mergeVertices(g, 1e-5);
    const P = g.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i); deform(v); P.setXYZ(i, v.x, v.y, v.z); }
    g.computeVertexNormals();
  }
  boxUV(g, 1);
  return g;
}

/** Plain box (min/max). */
export function box(x0, y0, z0, x1, y1, z1) {
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  boxUV(g, 1);
  return g;
}

/** Cylinder between two points. */
export function tube(a, b, r, seg = 10, caps = true) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const len = A.distanceTo(B);
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1, !caps);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  g.applyQuaternion(q);
  g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
  // uv in metres along the length
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2 * Math.PI * r, uv.getY(i) * len);
  return g;
}

/** Tube following a polyline (array of [x,y,z]) with radius r. */
export function pipe(points, r, radial = 8, tubular = 24) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), false, 'centripetal');
  const g = new THREE.TubeGeometry(curve, tubular, r, radial, false);
  return g;
}

/**
 * Loft through rings of equal point count. rings: Array<Array<Vector3>>.
 * UVs: u = arc length around the ring (m), v = accumulated distance between rings (m).
 * Normals are computed (smooth). closedRing joins the last point to the first.
 */
export function loft(rings, { closedRing = false, flip = false } = {}) {
  const R = rings.length, M = rings[0].length;
  const cols = closedRing ? M + 1 : M;
  const pos = new Float32Array(R * cols * 3), uv = new Float32Array(R * cols * 2);
  const vAcc = new Float32Array(cols);
  for (let r = 0; r < R; r++) {
    let u = 0;
    for (let c = 0; c < cols; c++) {
      const p = rings[r][c % M];
      if (c > 0) u += p.distanceTo(rings[r][(c - 1) % M]);
      if (r > 0) vAcc[c] += p.distanceTo(rings[r - 1][c % M]);
      const k = r * cols + c;
      pos[k * 3] = p.x; pos[k * 3 + 1] = p.y; pos[k * 3 + 2] = p.z;
      uv[k * 2] = u; uv[k * 2 + 1] = vAcc[c];
    }
  }
  const idx = [];
  for (let r = 0; r < R - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c, b = a + 1, d = a + cols, e = d + 1;
      if (flip) idx.push(a, b, d, b, e, d); else idx.push(a, d, b, b, d, e);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  if (closedRing) {
    // average the normals of the duplicated seam column
    const N = g.attributes.normal;
    for (let r = 0; r < R; r++) {
      const a = r * cols, b = r * cols + M;
      const x = N.getX(a) + N.getX(b), y = N.getY(a) + N.getY(b), z = N.getZ(a) + N.getZ(b);
      const l = Math.hypot(x, y, z) || 1;
      N.setXYZ(a, x / l, y / l, z / l); N.setXYZ(b, x / l, y / l, z / l);
    }
  }
  return g;
}

/** Superellipse ring point: t in [0, 2PI), half-sizes a (x) b (z), exponent n. */
export function superPt(t, a, b, n) {
  const c = Math.cos(t), s = Math.sin(t);
  return [a * Math.sign(c) * Math.pow(Math.abs(c), 2 / n), b * Math.sign(s) * Math.pow(Math.abs(s), 2 / n)];
}

/**
 * Flat ribbon (webbing strap) along a polyline. pts: [[x,y,z]...], up: function(i)->[x,y,z]
 * (surface normal at the point), width, thickness.
 */
export function ribbon(pts, width, thick, upFn) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), false, 'centripetal', 0.5);
  const N = Math.max(8, pts.length * 3);
  const P = curve.getSpacedPoints(N);
  const rings = [];
  const t = new THREE.Vector3(), up = new THREE.Vector3(), side = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i <= N; i++) {
    const p = P[i];
    t.copy(P[Math.min(N, i + 1)]).sub(P[Math.max(0, i - 1)]).normalize();
    up.set(...upFn(p, i / N));
    side.crossVectors(t, up).normalize();
    n.crossVectors(side, t).normalize();
    const hw = width / 2, ht = thick / 2;
    // rectangle cross-section (top, side, bottom, side) - 4 corners + duplicated for hard-ish edges
    const corners = [[-hw, ht], [hw, ht], [hw, -ht], [-hw, -ht]];
    const ring = [];
    for (const [sx, sy] of corners) ring.push(new THREE.Vector3().copy(p).addScaledVector(side, sx).addScaledVector(n, sy));
    rings.push(ring);
  }
  const g = loft(rings, { closedRing: true, flip: false });
  // uv: u across the width (0..1 on top face), v along the length in metres
  return g;
}

/** Merge parts (BufferGeometry, already finalized) of one material. */
export function mergeList(list) {
  const ok = list.filter(Boolean);
  if (!ok.length) return null;
  return mergeGeometries(ok, false);
}

/**
 * Collects parts per material key and builds one geometry with groups
 * (order = the given material key order). Returns { geometry, keys } where keys
 * lists the material key per group.
 */
export class PartBuilder {
  constructor() { this.parts = new Map(); }
  add(key, geo, opts) {
    if (!geo) return;
    const g = finalize(geo, opts);
    if (!this.parts.has(key)) this.parts.set(key, []);
    this.parts.get(key).push(g);
  }
  /** add with a transform matrix */
  addT(key, geo, m, opts) { if (!geo) return; geo.applyMatrix4(m); this.add(key, geo, opts); }
  build(order) {
    const geos = [], keys = [];
    for (const k of order) {
      const l = this.parts.get(k);
      if (!l || !l.length) continue;
      geos.push(mergeGeometries(l, false));
      keys.push(k);
    }
    for (const k of this.parts.keys()) if (!order.includes(k)) console.warn('[seats] PartBuilder: unused material key', k);
    if (!geos.length) return null;
    const g = mergeGeometries(geos, true);
    g.computeBoundingBox(); g.computeBoundingSphere();
    return { geometry: g, keys };
  }
}

export const M4 = () => new THREE.Matrix4();
export function mT(x, y, z) { return new THREE.Matrix4().makeTranslation(x, y, z); }
export function mRX(a) { return new THREE.Matrix4().makeRotationX(a); }
export function mRY(a) { return new THREE.Matrix4().makeRotationY(a); }
export function mRZ(a) { return new THREE.Matrix4().makeRotationZ(a); }
export function mul(...ms) { const m = new THREE.Matrix4(); for (const x of ms) m.multiply(x); return m; }
