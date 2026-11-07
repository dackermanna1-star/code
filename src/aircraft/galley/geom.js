// Geometry helpers for the galley / lavatory / door module.
//
// MeshBuilder collects many small BufferGeometries (transformed, tinted, with a
// cheap position-based ambient-occlusion term baked into the vertex colour) and
// merges them into ONE geometry per material, so the whole module draws in a
// handful of calls. Matrices with a negative determinant (mirrored left-hand
// lavatories) are handled by flipping the triangle winding.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { clamp, smoothstep } from '../../core/util.js';

const _n3 = new THREE.Matrix3();
const _v = new THREE.Vector3();
const _nv = new THREE.Vector3();
const _c = new THREE.Color();

/** Default ambient-occlusion heuristic (aircraft-local position + normal). */
export function defaultAO(x, y, z, nx, ny, nz) {
  // darker near the floor (contact), slightly darker right under the ceiling, undersides darker
  let ao = 0.62 + 0.38 * smoothstep(0.0, 0.32, y);
  if (ny < -0.5) ao *= 0.82;
  if (y > 1.95) ao *= 0.9;
  return ao;
}

export class MeshBuilder {
  constructor(name = 'mb', aoFn = defaultAO) {
    this.name = name;
    this.aoFn = aoFn;
    this.pos = []; this.nor = []; this.uv = []; this.col = []; this.idx = [];
    this.n = 0;
  }
  get empty() { return this.idx.length === 0; }

  /**
   * Append a geometry. opts:
   *   color: hex | THREE.Color | [r,g,b] (linear tint, default white)
   *   ao: false | function(x,y,z,nx,ny,nz) -> factor (default: builder aoFn, evaluated in builder space)
   *   uvRect: [u0, v0, u1, v1] remaps the 0..1 uv range into an atlas rectangle
   *   uvScale: [su, sv] or number, multiplies uvs (for tiled textures)
   */
  add(geom, matrix = null, opts = {}) {
    const g = geom;
    const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
    if (!N) g.computeVertexNormals();
    const NN = g.attributes.normal;
    const m = matrix;
    if (m) _n3.getNormalMatrix(m);
    const flip = m ? m.determinant() < 0 : false;
    const tint = toColor(opts.color);
    const aoFn = opts.ao === false ? null : (typeof opts.ao === 'function' ? opts.ao : this.aoFn);
    const rect = opts.uvRect;
    const us = opts.uvScale === undefined ? null : (Array.isArray(opts.uvScale) ? opts.uvScale : [opts.uvScale, opts.uvScale]);
    const base = this.n;
    for (let i = 0; i < P.count; i++) {
      _v.fromBufferAttribute(P, i);
      _nv.fromBufferAttribute(NN, i);
      if (m) { _v.applyMatrix4(m); _nv.applyMatrix3(_n3).normalize(); }
      this.pos.push(_v.x, _v.y, _v.z);
      this.nor.push(_nv.x, _nv.y, _nv.z);
      let u = U ? U.getX(i) : 0, v = U ? U.getY(i) : 0;
      if (us) { u *= us[0]; v *= us[1]; }
      if (rect) { u = rect[0] + (rect[2] - rect[0]) * clamp(u, 0, 1); v = rect[1] + (rect[3] - rect[1]) * clamp(v, 0, 1); }
      this.uv.push(u, v);
      const ao = aoFn ? aoFn(_v.x, _v.y, _v.z, _nv.x, _nv.y, _nv.z) : 1;
      this.col.push(tint.r * ao, tint.g * ao, tint.b * ao);
    }
    if (g.index) {
      const I = g.index.array;
      for (let i = 0; i < I.length; i += 3) {
        if (flip) this.idx.push(base + I[i], base + I[i + 2], base + I[i + 1]);
        else this.idx.push(base + I[i], base + I[i + 1], base + I[i + 2]);
      }
    } else {
      for (let i = 0; i < P.count; i += 3) {
        if (flip) this.idx.push(base + i, base + i + 2, base + i + 1);
        else this.idx.push(base + i, base + i + 1, base + i + 2);
      }
    }
    this.n += P.count;
    if (!opts.keep) g.dispose();
    return this;
  }

  /** Append another builder (optionally transformed). */
  append(b, matrix = null) {
    if (b.empty) return this;
    const g = b.build();
    // keep colours as they are: pass ao=false and a white tint, but the colour attribute must survive
    const base = this.n;
    const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv, C = g.attributes.color;
    if (matrix) _n3.getNormalMatrix(matrix);
    const flip = matrix ? matrix.determinant() < 0 : false;
    for (let i = 0; i < P.count; i++) {
      _v.fromBufferAttribute(P, i); _nv.fromBufferAttribute(N, i);
      if (matrix) { _v.applyMatrix4(matrix); _nv.applyMatrix3(_n3).normalize(); }
      this.pos.push(_v.x, _v.y, _v.z); this.nor.push(_nv.x, _nv.y, _nv.z);
      this.uv.push(U.getX(i), U.getY(i)); this.col.push(C.getX(i), C.getY(i), C.getZ(i));
    }
    const I = g.index.array;
    for (let i = 0; i < I.length; i += 3) {
      if (flip) this.idx.push(base + I[i], base + I[i + 2], base + I[i + 1]);
      else this.idx.push(base + I[i], base + I[i + 1], base + I[i + 2]);
    }
    this.n += P.count;
    g.dispose();
    return this;
  }

  /** Re-evaluate the vertex colour with an extra AO function (multiplies). */
  shade(fn) {
    for (let i = 0; i < this.n; i++) {
      const k = fn(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2], this.nor[i * 3], this.nor[i * 3 + 1], this.nor[i * 3 + 2]);
      this.col[i * 3] *= k; this.col[i * 3 + 1] *= k; this.col[i * 3 + 2] *= k;
    }
    return this;
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.n > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

/** A set of builders keyed by material name. */
export class Kit {
  constructor(aoFn = defaultAO) { this.b = new Map(); this.aoFn = aoFn; }
  get(name) { let b = this.b.get(name); if (!b) { b = new MeshBuilder(name, this.aoFn); this.b.set(name, b); } return b; }
  add(name, geom, matrix, opts) { this.get(name).add(geom, matrix, opts); return this; }
  /** Merge another kit into this one with a transform. */
  merge(kit, matrix = null) { for (const [k, b] of kit.b) this.get(k).append(b, matrix); return this; }
  /** Create meshes (one per material) under parent. */
  meshes(M, parent, { castShadow = true, receiveShadow = true, namePrefix = 'galley', noShadow = [] } = {}) {
    const out = {};
    for (const [k, b] of this.b) {
      if (b.empty) continue;
      const mat = M[k];
      if (!mat) { console.warn('[galley] no material', k); continue; }
      const mesh = new THREE.Mesh(b.build(), mat);
      mesh.name = `${namePrefix}-${k}`;
      mesh.castShadow = castShadow && !noShadow.includes(k) && !mat.transparent && !mat.userData.noShadow;
      mesh.receiveShadow = receiveShadow;
      parent.add(mesh);
      out[k] = mesh;
    }
    return out;
  }
}

function toColor(c) {
  if (c === undefined || c === null) return _c.setRGB(1, 1, 1);
  if (c.isColor) return _c.copy(c);
  if (Array.isArray(c)) return _c.setRGB(c[0], c[1], c[2]);
  return _c.set(c);
}

// ------------------------------------------------------------------ matrices
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
/** Translation + Euler rotation (XYZ, radians) + optional scale -> new Matrix4. */
export function T(x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _q.setFromEuler(_e.set(rx, ry, rz, 'XYZ'));
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
}
export function mul(...ms) { const r = new THREE.Matrix4(); for (const m of ms) r.multiply(m); return r; }
export const MIRROR_X = new THREE.Matrix4().makeScale(-1, 1, 1);

// ------------------------------------------------------------------ primitives
export const box = (w, h, d, sw = 1, sh = 1, sd = 1) => new THREE.BoxGeometry(w, h, d, sw, sh, sd);
export const rbox = (w, h, d, r = 0.01, seg = 2) => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4));
export const cyl = (rt, rb, h, seg = 16, open = false) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
export const plane = (w, h) => new THREE.PlaneGeometry(w, h);
/** Box from min/max corners (handy for architectural panels). */
export function boxMM(x0, y0, z0, x1, y1, z1, segs = null) {
  const w = Math.abs(x1 - x0), h = Math.abs(y1 - y0), d = Math.abs(z1 - z0);
  const s = segs || [1, Math.max(1, Math.round(h / 0.25)), 1];
  const g = new THREE.BoxGeometry(w, h, d, s[0], s[1], s[2]);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return g;
}
/** Rounded rectangle Shape (centred). */
export function rrectShape(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  r = Math.min(r, w / 2, h / 2);
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
/** Flat rounded plate in the XY plane facing +Z, thickness d (front face at z = d/2), uv 0..1 over the face. */
export function plate(w, h, d, r = 0.01, curveSegments = 4) {
  const g = new THREE.ExtrudeGeometry(rrectShape(w, h, r), { depth: d, bevelEnabled: false, curveSegments });
  g.translate(0, 0, -d / 2);
  const P = g.attributes.position, U = g.attributes.uv;
  for (let i = 0; i < P.count; i++) U.setXY(i, P.getX(i) / w + 0.5, P.getY(i) / h + 0.5);
  return g;
}
/** Rounded-rect frame (ring) in XY facing +Z. */
export function frame(w, h, bw, d, r = 0.01) {
  const s = rrectShape(w, h, r);
  s.holes.push(rrectShape(w - 2 * bw, h - 2 * bw, Math.max(0.002, r - bw)));
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false, curveSegments: 4 });
  g.translate(0, 0, -d / 2);
  return g;
}
/** Tube along a polyline of [x,y,z] points. */
export function tube(points, r, radial = 8, tubular = 24) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), false, 'catmullrom', 0.1);
  return new THREE.TubeGeometry(curve, tubular, r, radial, false);
}
/** U-shaped grab handle lying in the XY plane, standing off +Z by `off`. */
export function grabHandle(len, off = 0.05, r = 0.011) {
  const h = len / 2;
  return tube([[-h, 0, 0], [-h, 0, off * 0.8], [-h + off * 0.3, 0, off], [h - off * 0.3, 0, off], [h, 0, off * 0.8], [h, 0, 0]], r, 8, 32);
}
export function lathe(points, seg = 24) {
  return new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), seg);
}

/** Convert a polygon in (a, b) to an extruded slab: poly in XY, depth along Z from z0 to z1. */
export function slab(poly, z0, z1, holes = [], curveSegments = 6) {
  const s = new THREE.Shape(poly.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const h of holes) s.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
  const g = new THREE.ExtrudeGeometry(s, { depth: z1 - z0, bevelEnabled: false, curveSegments });
  g.translate(0, 0, z0);
  return g;
}
/** Ensure a polygon is counter-clockwise. */
export function ccw(p) { let a = 0; for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i][0] * q[1] - q[0] * p[i][1]; } return a > 0 ? p : p.slice().reverse(); }

/** Planar UV projection (u along axis a, v along axis b), scaled. Mutates & returns g. */
export function projectUV(g, axisU = 'x', axisV = 'y', scale = 1, offU = 0, offV = 0) {
  const P = g.attributes.position;
  let U = g.attributes.uv;
  if (!U) { U = new THREE.Float32BufferAttribute(new Float32Array(P.count * 2), 2); g.setAttribute('uv', U); }
  const get = { x: (i) => P.getX(i), y: (i) => P.getY(i), z: (i) => P.getZ(i) };
  for (let i = 0; i < P.count; i++) U.setXY(i, get[axisU](i) * scale + offU, get[axisV](i) * scale + offV);
  return g;
}
/** Box UVs in metres (tri-planar by face normal) so tiled textures keep a constant texel density. */
export function worldUV(g, scale = 1) {
  const P = g.attributes.position, N = g.attributes.normal;
  let U = g.attributes.uv;
  if (!U) { U = new THREE.Float32BufferAttribute(new Float32Array(P.count * 2), 2); g.setAttribute('uv', U); }
  for (let i = 0; i < P.count; i++) {
    const ax = Math.abs(N.getX(i)), ay = Math.abs(N.getY(i)), az = Math.abs(N.getZ(i));
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    if (ax >= ay && ax >= az) U.setXY(i, z * scale, y * scale);
    else if (ay >= az) U.setXY(i, x * scale, z * scale);
    else U.setXY(i, x * scale, y * scale);
  }
  return g;
}

// ------------------------------------------------------------------ easing / animation
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutBack = (t) => { const c1 = 1.4, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

/**
 * Linear progress animator with easing; `apply(eased, raw)` is called whenever it changes.
 *   const a = new Anim(0.8, (e) => obj.rotation.x = e * 1.2);
 *   a.to(1); a.update(dt);
 */
export class Anim {
  constructor(duration, apply, { value = 0, ease = easeInOut } = {}) {
    this.duration = duration; this.applyFn = apply; this.value = value; this.target = value; this.ease = ease;
    this.apply();
  }
  get moving() { return this.value !== this.target; }
  to(t, duration = null) { if (duration !== null) this.duration = duration; this.target = t; return this; }
  snap(t) { this.value = this.target = t; this.apply(); return this; }
  update(dt) {
    if (this.value === this.target) return false;
    const step = dt / Math.max(1e-3, this.duration);
    this.value = this.value < this.target ? Math.min(this.target, this.value + step) : Math.max(this.target, this.value - step);
    this.apply();
    return true;
  }
  apply() { this.applyFn(this.ease(this.value), this.value); }
}

export { clamp, smoothstep };

/** Mirror a geometry in its local X (u runs backwards) and fix the winding so it still faces the same way. */
export function flipX(g) {
  g.scale(-1, 1, 1);
  if (g.index) { const I = g.index.array; for (let i = 0; i < I.length; i += 3) { const t = I[i + 1]; I[i + 1] = I[i + 2]; I[i + 2] = t; } }
  return g;
}
