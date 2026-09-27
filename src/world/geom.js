// Fast static-geometry batching. Level geometry is appended into growable typed
// arrays bucketed by (material, sector) and turned into a handful of merged
// meshes, keeping draw calls low even for very detailed maps.
import * as THREE from 'three';

class Grow {
  constructor(type, n = 1024) { this.a = new type(n); this.n = 0; this.T = type; }
  reserve(k) {
    if (this.n + k <= this.a.length) return;
    let cap = this.a.length * 2;
    while (cap < this.n + k) cap *= 2;
    const na = new this.T(cap);
    na.set(this.a.subarray(0, this.n));
    this.a = na;
  }
  push1(v) { this.reserve(1); this.a[this.n++] = v; }
  push2(a, b) { this.reserve(2); this.a[this.n++] = a; this.a[this.n++] = b; }
  push3(a, b, c) { this.reserve(3); this.a[this.n++] = a; this.a[this.n++] = b; this.a[this.n++] = c; }
}

export class Bucket {
  constructor() {
    this.pos = new Grow(Float32Array, 4096);
    this.nor = new Grow(Float32Array, 4096);
    this.uv = new Grow(Float32Array, 2048);
    this.col = new Grow(Float32Array, 4096);
    this.idx = new Grow(Uint32Array, 4096);
    this.vcount = 0;
  }
  vert(x, y, z, nx, ny, nz, u, v, r, g, b) {
    this.pos.push3(x, y, z);
    this.nor.push3(nx, ny, nz);
    this.uv.push2(u, v);
    this.col.push3(r, g, b);
    return this.vcount++;
  }
  quad(a, b, c, d) {
    this.idx.reserve(6);
    const I = this.idx;
    I.a[I.n++] = a; I.a[I.n++] = b; I.a[I.n++] = c;
    I.a[I.n++] = a; I.a[I.n++] = c; I.a[I.n++] = d;
  }
  toGeometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos.a.slice(0, this.pos.n), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nor.a.slice(0, this.nor.n), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(this.uv.a.slice(0, this.uv.n), 2));
    g.setAttribute('color', new THREE.BufferAttribute(this.col.a.slice(0, this.col.n), 3));
    g.setIndex(new THREE.BufferAttribute(this.idx.a.slice(0, this.idx.n), 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

// Face bits for boxes
export const FACE_PX = 1, FACE_NX = 2, FACE_PY = 4, FACE_NY = 8, FACE_PZ = 16, FACE_NZ = 32, FACE_ALL = 63;

const _c = new THREE.Color();
export function tintArray(tint) {
  if (tint == null) return [1, 1, 1];
  if (Array.isArray(tint)) return tint;
  _c.set(tint);
  // Vertex colours are multiplied in linear space; THREE.Color stores linear values.
  return [_c.r, _c.g, _c.b];
}

// Append an axis aligned box with world-space UVs.
// opts: faces, scale (m per tile), tint, ao (bottom darkening 0..1), uvRot
export function pushBox(bucket, x0, y0, z0, x1, y1, z1, opts = {}) {
  const faces = opts.faces ?? FACE_ALL;
  const s = 1 / (opts.scale ?? 2);
  const [tr, tg, tb] = opts.tintArr ?? tintArray(opts.tint);
  const ao = opts.ao ?? 0.72;
  const uo = opts.uvOffset ?? 0;
  const aoTop = opts.aoTop ?? 1.0;
  // vertical gradient helper: darker at the bottom for "contact shadow" feel
  const gy = (y) => {
    if (y1 - y0 < 0.01) return 1;
    const t = (y - y0) / (y1 - y0);
    return ao + (aoTop - ao) * Math.min(1, t * 1.6);
  };
  const B = bucket;
  let a, b, c, d;
  if (faces & FACE_PX) {
    const k0 = gy(y0), k1 = gy(y1);
    a = B.vert(x1, y0, z1, 1, 0, 0, -z1 * s + uo, y0 * s, tr * k0, tg * k0, tb * k0);
    b = B.vert(x1, y0, z0, 1, 0, 0, -z0 * s + uo, y0 * s, tr * k0, tg * k0, tb * k0);
    c = B.vert(x1, y1, z0, 1, 0, 0, -z0 * s + uo, y1 * s, tr * k1, tg * k1, tb * k1);
    d = B.vert(x1, y1, z1, 1, 0, 0, -z1 * s + uo, y1 * s, tr * k1, tg * k1, tb * k1);
    B.quad(a, b, c, d);
  }
  if (faces & FACE_NX) {
    const k0 = gy(y0), k1 = gy(y1);
    a = B.vert(x0, y0, z0, -1, 0, 0, z0 * s + uo, y0 * s, tr * k0, tg * k0, tb * k0);
    b = B.vert(x0, y0, z1, -1, 0, 0, z1 * s + uo, y0 * s, tr * k0, tg * k0, tb * k0);
    c = B.vert(x0, y1, z1, -1, 0, 0, z1 * s + uo, y1 * s, tr * k1, tg * k1, tb * k1);
    d = B.vert(x0, y1, z0, -1, 0, 0, z0 * s + uo, y1 * s, tr * k1, tg * k1, tb * k1);
    B.quad(a, b, c, d);
  }
  if (faces & FACE_PZ) {
    const k0 = gy(y0), k1 = gy(y1);
    a = B.vert(x0, y0, z1, 0, 0, 1, x0 * s + uo, y0 * s, tr * k0, tg * k0, tb * k0);
    b = B.vert(x1, y0, z1, 0, 0, 1, x1 * s + uo, y0 * s, tr * k0, tg * k0, tb * k0);
    c = B.vert(x1, y1, z1, 0, 0, 1, x1 * s + uo, y1 * s, tr * k1, tg * k1, tb * k1);
    d = B.vert(x0, y1, z1, 0, 0, 1, x0 * s + uo, y1 * s, tr * k1, tg * k1, tb * k1);
    B.quad(a, b, c, d);
  }
  if (faces & FACE_NZ) {
    const k0 = gy(y0), k1 = gy(y1);
    a = B.vert(x1, y0, z0, 0, 0, -1, -x1 * s + uo, y0 * s, tr * k0, tg * k0, tb * k0);
    b = B.vert(x0, y0, z0, 0, 0, -1, -x0 * s + uo, y0 * s, tr * k0, tg * k0, tb * k0);
    c = B.vert(x0, y1, z0, 0, 0, -1, -x0 * s + uo, y1 * s, tr * k1, tg * k1, tb * k1);
    d = B.vert(x1, y1, z0, 0, 0, -1, -x1 * s + uo, y1 * s, tr * k1, tg * k1, tb * k1);
    B.quad(a, b, c, d);
  }
  if (faces & FACE_PY) {
    const k = opts.topTint ?? 1;
    a = B.vert(x0, y1, z1, 0, 1, 0, x0 * s + uo, -z1 * s, tr * k, tg * k, tb * k);
    b = B.vert(x1, y1, z1, 0, 1, 0, x1 * s + uo, -z1 * s, tr * k, tg * k, tb * k);
    c = B.vert(x1, y1, z0, 0, 1, 0, x1 * s + uo, -z0 * s, tr * k, tg * k, tb * k);
    d = B.vert(x0, y1, z0, 0, 1, 0, x0 * s + uo, -z0 * s, tr * k, tg * k, tb * k);
    B.quad(a, b, c, d);
  }
  if (faces & FACE_NY) {
    const k = opts.bottomTint ?? 0.9;
    a = B.vert(x0, y0, z0, 0, -1, 0, x0 * s + uo, z0 * s, tr * k, tg * k, tb * k);
    b = B.vert(x1, y0, z0, 0, -1, 0, x1 * s + uo, z0 * s, tr * k, tg * k, tb * k);
    c = B.vert(x1, y0, z1, 0, -1, 0, x1 * s + uo, z1 * s, tr * k, tg * k, tb * k);
    d = B.vert(x0, y0, z1, 0, -1, 0, x0 * s + uo, z1 * s, tr * k, tg * k, tb * k);
    B.quad(a, b, c, d);
  }
}

// Append an arbitrary BufferGeometry transformed by a Matrix4.
const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _nm = new THREE.Matrix3();
export function pushGeometry(bucket, geo, matrix, opts = {}) {
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const uv = geo.attributes.uv;
  const col = geo.attributes.color;
  const [tr, tg, tb] = opts.tintArr ?? tintArray(opts.tint);
  const us = opts.uvScale ?? 1;
  _nm.getNormalMatrix(matrix);
  const base = bucket.vcount;
  const worldUV = opts.worldUV ? 1 / opts.worldUV : 0;
  for (let i = 0; i < pos.count; i++) {
    _v.fromBufferAttribute(pos, i).applyMatrix4(matrix);
    if (nor) _n.fromBufferAttribute(nor, i).applyMatrix3(_nm).normalize();
    else _n.set(0, 1, 0);
    let u = 0, v = 0;
    if (worldUV) {
      // triplanar-ish world UV by dominant normal axis
      const ax = Math.abs(_n.x), ay = Math.abs(_n.y), az = Math.abs(_n.z);
      if (ay >= ax && ay >= az) { u = _v.x * worldUV; v = _v.z * worldUV; }
      else if (ax >= az) { u = _v.z * worldUV; v = _v.y * worldUV; }
      else { u = _v.x * worldUV; v = _v.y * worldUV; }
    } else if (uv) { u = uv.getX(i) * us; v = uv.getY(i) * us; }
    let r = tr, g = tg, b = tb;
    if (col) { r *= col.getX(i); g *= col.getY(i); b *= col.getZ(i); }
    bucket.vert(_v.x, _v.y, _v.z, _n.x, _n.y, _n.z, u, v, r, g, b);
  }
  if (geo.index) {
    const ix = geo.index;
    bucket.idx.reserve(ix.count);
    for (let i = 0; i < ix.count; i++) bucket.idx.a[bucket.idx.n++] = base + ix.getX(i);
  } else {
    bucket.idx.reserve(pos.count);
    for (let i = 0; i < pos.count; i++) bucket.idx.a[bucket.idx.n++] = base + i;
  }
}

// Shared primitive geometries (unit sized) for props
const prim = {};
export function unitBox() { return prim.box || (prim.box = new THREE.BoxGeometry(1, 1, 1)); }
export function unitCyl(seg = 12) {
  const k = 'cyl' + seg;
  return prim[k] || (prim[k] = new THREE.CylinderGeometry(0.5, 0.5, 1, seg, 1));
}
export function unitCone(seg = 12) {
  const k = 'cone' + seg;
  return prim[k] || (prim[k] = new THREE.CylinderGeometry(0, 0.5, 1, seg, 1));
}
export function unitSphere(seg = 12) {
  const k = 'sph' + seg;
  return prim[k] || (prim[k] = new THREE.SphereGeometry(0.5, seg, Math.max(6, seg >> 1)));
}
export function unitTorus() {
  return prim.torus || (prim.torus = new THREE.TorusGeometry(0.5, 0.1, 6, 16));
}
export function unitPlane() { return prim.plane || (prim.plane = new THREE.PlaneGeometry(1, 1)); }

// Build a matrix from position, rotation (euler xyz radians or yaw) and scale.
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
export function trs(x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, out = new THREE.Matrix4()) {
  _e.set(rx, ry, rz, 'YXZ');
  _q.setFromEuler(_e);
  _p.set(x, y, z);
  _s.set(sx, sy, sz);
  return out.compose(_p, _q, _s);
}
export { _m as tmpMatrix };
