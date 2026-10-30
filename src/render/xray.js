import * as THREE from 'three';
import { landmark } from '../human/anatomy.js';

/**
 * X-ray kill cam ("Sniper Elite" style): a procedural skeleton and internal organs that ride on a
 * person's ragdoll segments, a translucent fresnel shell for the flesh, and slow-motion damage:
 * the skull blows apart along the round's path, ribs snap, long bones splinter, organs burst.
 *
 * Geometry is modelled once per process (lazily) from signed distance fields polygonised with
 * Naive Surface Nets (skull, vertebrae, pelvis, long bones, organs) and swept profiles (ribs,
 * cartilage, clavicles, intestines), in the physics bind pose (anatomy.js coordinates: +Y up,
 * +Z forward, +X = the character's left). Everything is pre-cut into rigid "pieces" with jagged
 * boundaries (Voronoi cells over the skull, pelvis and brain; sections along the ribs and long
 * bones). Each vertex stores its piece; a per-rig float texture holds one 3x4 matrix per piece,
 * so a whole skeleton is one draw call, intact pieces simply share their segment's transform and a
 * fracture only changes which transform a piece follows (no per-hit meshing).
 */

// ================================================================================================
// small helpers (authoring, on [x, y, z] arrays)

const vadd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const vsub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const vmul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const vdot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const vcross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const vlen = (a) => Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
const vnorm = (a) => {
  const l = vlen(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const vlerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const vmir = (a) => [-a[0], a[1], a[2]];
/** a + sum(dir_i * s_i) */
const vax = (a, ...t) => {
  const r = [a[0], a[1], a[2]];
  for (let i = 0; i < t.length; i += 2) {
    r[0] += t[i][0] * t[i + 1];
    r[1] += t[i][1] * t[i + 1];
    r[2] += t[i][2] * t[i + 1];
  }
  return r;
};
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const smooth01 = (t) => {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
};

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash3(i, j, k, s) {
  let h = Math.imul(i | 0, 0x27d4eb2d) ^ Math.imul(j | 0, 0x165667b1) ^ Math.imul(k | 0, 0x9e3779b1) ^ Math.imul(s | 0, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** 3D value noise in [0, 1). */
function vnoise(x, y, z, s = 0) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  let fx = x - ix, fy = y - iy, fz = z - iz;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  fz = fz * fz * (3 - 2 * fz);
  const a = hash3(ix, iy, iz, s), b = hash3(ix + 1, iy, iz, s), c = hash3(ix, iy + 1, iz, s), d = hash3(ix + 1, iy + 1, iz, s);
  const e = hash3(ix, iy, iz + 1, s), f = hash3(ix + 1, iy, iz + 1, s), g = hash3(ix, iy + 1, iz + 1, s), h = hash3(ix + 1, iy + 1, iz + 1, s);
  const x1 = a + (b - a) * fx, x2 = c + (d - c) * fx, x3 = e + (f - e) * fx, x4 = g + (h - g) * fx;
  const y1 = x1 + (x2 - x1) * fy, y2 = x3 + (x4 - x3) * fy;
  return y1 + (y2 - y1) * fz;
}

/** Rows of a rotation whose local Y axis is `y` (local Z toward `zHint`). */
function frameRows(y, zHint = [0, 0, 1]) {
  const Y = vnorm(y);
  let Z = vsub(zHint, vmul(Y, vdot(zHint, Y)));
  if (vlen(Z) < 1e-6) Z = Math.abs(Y[0]) < 0.9 ? vsub([1, 0, 0], vmul(Y, Y[0])) : vsub([0, 1, 0], vmul(Y, Y[1]));
  Z = vnorm(Z);
  const X = vcross(Y, Z);
  return [X, Y, Z];
}

// ================================================================================================
// Signed distance modelling

const OP_U = 0, OP_S = 1, OP_I = 2;
const P_ELL = 0, P_CONE = 1, P_BOX = 2, P_TRI = 3, P_CYL = 4;

class SdfOp {
  constructor(op, prim, k) {
    this.op = op;
    this.prim = prim;
    this.k = k;
    this.p = new Float64Array(36);
    this.x0 = -1e9;
    this.y0 = -1e9;
    this.z0 = -1e9;
    this.x1 = 1e9;
    this.y1 = 1e9;
    this.z1 = 1e9;
  }
}

function setRot(o, base, rows) {
  const p = o.p;
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) p[base + r * 3 + c] = rows[r][c];
}

/** world-axis extents of a rotated box with half extents e (rows = local axes in world) */
function rotExtent(rows, e) {
  const out = [0, 0, 0];
  for (let w = 0; w < 3; w++) out[w] = Math.abs(rows[0][w]) * e[0] + Math.abs(rows[1][w]) * e[1] + Math.abs(rows[2][w]) * e[2];
  return out;
}

const OPNAME = { u: OP_U, s: OP_S, i: OP_I };

/**
 * A field program: primitives combined in order with smooth union / subtraction / intersection,
 * plus whole-field operators (shell, grooves). `lip` bounds the field's gradient (block culling).
 */
class Sdf {
  constructor() {
    this.ops = [];
    this.lip = 1.15;
  }

  _op(o, prim, def) {
    const op = new SdfOp(OPNAME[o.op || 'u'], prim, o.k ?? def);
    this.ops.push(op);
    return op;
  }

  /** ellipsoid; o.y = local Y axis direction, o.z = Z hint */
  ell(c, r, o = {}) {
    const op = this._op(o, P_ELL, 0.006);
    const rows = o.y ? frameRows(o.y, o.z || [0, 0, 1]) : [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    const p = op.p;
    p[0] = c[0]; p[1] = c[1]; p[2] = c[2];
    p[3] = r[0]; p[4] = r[1]; p[5] = r[2];
    setRot(op, 6, rows);
    p[16] = 1 / r[0]; p[17] = 1 / r[1]; p[18] = 1 / r[2];
    p[19] = 1 / (r[0] * r[0]); p[20] = 1 / (r[1] * r[1]); p[21] = 1 / (r[2] * r[2]);
    p[22] = Math.min(r[0], r[1], r[2]);
    const e = rotExtent(rows, r);
    op.x0 = c[0] - e[0]; op.x1 = c[0] + e[0];
    op.y0 = c[1] - e[1]; op.y1 = c[1] + e[1];
    op.z0 = c[2] - e[2]; op.z1 = c[2] + e[2];
    return this;
  }

  /** round cone (capsule with different end radii) */
  cone(a, b, ra, rb = ra, o = {}) {
    const op = this._op(o, P_CONE, 0.004);
    const p = op.p;
    p[0] = a[0]; p[1] = a[1]; p[2] = a[2];
    p[3] = b[0]; p[4] = b[1]; p[5] = b[2];
    p[6] = ra; p[7] = rb;
    const ba = vsub(b, a);
    p[8] = ba[0]; p[9] = ba[1]; p[10] = ba[2];
    const l2 = Math.max(vdot(ba, ba), 1e-12);
    p[11] = l2;
    p[12] = ra - rb;
    p[13] = l2 - (ra - rb) * (ra - rb);
    p[14] = 1 / l2;
    const r = Math.max(ra, rb);
    op.x0 = Math.min(a[0], b[0]) - r; op.x1 = Math.max(a[0], b[0]) + r;
    op.y0 = Math.min(a[1], b[1]) - r; op.y1 = Math.max(a[1], b[1]) + r;
    op.z0 = Math.min(a[2], b[2]) - r; op.z1 = Math.max(a[2], b[2]) + r;
    return this;
  }

  /** chain of round cones through points with radii */
  chain(pts, radii, o = {}) {
    for (let i = 0; i + 1 < pts.length; i++) this.cone(pts[i], pts[i + 1], radii[i], radii[i + 1], o);
    return this;
  }

  /** rounded box */
  box(c, half, o = {}) {
    const op = this._op(o, P_BOX, 0.004);
    const rows = o.y ? frameRows(o.y, o.z || [0, 0, 1]) : [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    const p = op.p;
    const rad = o.rad ?? 0.001;
    p[0] = c[0]; p[1] = c[1]; p[2] = c[2];
    p[3] = half[0]; p[4] = half[1]; p[5] = half[2];
    setRot(op, 6, rows);
    p[15] = rad;
    const e = rotExtent(rows, [half[0] + rad, half[1] + rad, half[2] + rad]);
    op.x0 = c[0] - e[0]; op.x1 = c[0] + e[0];
    op.y0 = c[1] - e[1]; op.y1 = c[1] + e[1];
    op.z0 = c[2] - e[2]; op.z1 = c[2] + e[2];
    return this;
  }

  /** elliptic cylinder along local Y (radii rx, rz, half height hh), rounded by o.rad */
  cyl(c, rx, hh, rz, o = {}) {
    const op = this._op(o, P_CYL, 0.003);
    const rows = o.y ? frameRows(o.y, o.z || [0, 0, 1]) : [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    const p = op.p;
    const rad = o.rad ?? 0.001;
    p[0] = c[0]; p[1] = c[1]; p[2] = c[2];
    p[3] = rx; p[4] = hh; p[5] = rz;
    setRot(op, 6, rows);
    p[15] = rad;
    const e = rotExtent(rows, [rx + rad, hh + rad, rz + rad]);
    op.x0 = c[0] - e[0]; op.x1 = c[0] + e[0];
    op.y0 = c[1] - e[1]; op.y1 = c[1] + e[1];
    op.z0 = c[2] - e[2]; op.z1 = c[2] + e[2];
    return this;
  }

  /** thick (rounded) triangle */
  tri(a, b, c, t, o = {}) {
    const op = this._op(o, P_TRI, 0.004);
    const p = op.p;
    const ba = vsub(b, a), cb = vsub(c, b), ac = vsub(a, c);
    const nor = vcross(ba, ac);
    const q1 = vcross(ba, nor), q2 = vcross(cb, nor), q3 = vcross(ac, nor);
    const put = (i, v) => {
      p[i] = v[0];
      p[i + 1] = v[1];
      p[i + 2] = v[2];
    };
    put(0, a); put(3, b); put(6, c);
    p[9] = t;
    put(10, ba); put(13, cb); put(16, ac); put(19, nor);
    put(22, q1); put(25, q2); put(28, q3);
    p[31] = 1 / vdot(ba, ba);
    p[32] = 1 / vdot(cb, cb);
    p[33] = 1 / vdot(ac, ac);
    p[34] = 1 / vdot(nor, nor);
    op.x0 = Math.min(a[0], b[0], c[0]) - t; op.x1 = Math.max(a[0], b[0], c[0]) + t;
    op.y0 = Math.min(a[1], b[1], c[1]) - t; op.y1 = Math.max(a[1], b[1], c[1]) + t;
    op.z0 = Math.min(a[2], b[2], c[2]) - t; op.z1 = Math.max(a[2], b[2], c[2]) + t;
    return this;
  }

}

function primDist(o, x, y, z) {
  const p = o.p;
  switch (o.prim) {
    case P_ELL: {
      const dx = x - p[0], dy = y - p[1], dz = z - p[2];
      const ux = p[6] * dx + p[7] * dy + p[8] * dz;
      const uy = p[9] * dx + p[10] * dy + p[11] * dz;
      const uz = p[12] * dx + p[13] * dy + p[14] * dz;
      const lx = ux * p[16], ly = uy * p[17], lz = uz * p[18];
      const k0 = Math.sqrt(lx * lx + ly * ly + lz * lz);
      const ax = ux * p[19], ay = uy * p[20], az = uz * p[21];
      const k1 = Math.sqrt(ax * ax + ay * ay + az * az);
      if (k1 < 1e-9) return -p[22];
      return (k0 * (k0 - 1)) / k1;
    }
    case P_CONE: {
      // exact round cone (I. Quilez)
      const pax = x - p[0], pay = y - p[1], paz = z - p[2];
      const bax = p[8], bay = p[9], baz = p[10];
      const l2 = p[11], rr = p[12], a2 = p[13], il2 = p[14];
      const yy = pax * bax + pay * bay + paz * baz;
      const zz = yy - l2;
      const qx = pax * l2 - bax * yy, qy = pay * l2 - bay * yy, qz = paz * l2 - baz * yy;
      const x2 = qx * qx + qy * qy + qz * qz;
      const y2 = yy * yy * l2;
      const z2 = zz * zz * l2;
      const k = (rr > 0 ? 1 : rr < 0 ? -1 : 0) * rr * rr * x2;
      if ((zz > 0 ? a2 * z2 : zz < 0 ? -a2 * z2 : 0) > k) return Math.sqrt(x2 + z2) * il2 - p[7];
      if ((yy > 0 ? a2 * y2 : yy < 0 ? -a2 * y2 : 0) < k) return Math.sqrt(x2 + y2) * il2 - p[6];
      return (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - p[6];
    }
    case P_BOX: {
      const dx = x - p[0], dy = y - p[1], dz = z - p[2];
      const qx = Math.abs(p[6] * dx + p[7] * dy + p[8] * dz) - p[3];
      const qy = Math.abs(p[9] * dx + p[10] * dy + p[11] * dz) - p[4];
      const qz = Math.abs(p[12] * dx + p[13] * dy + p[14] * dz) - p[5];
      const mx = Math.max(qx, 0), my = Math.max(qy, 0), mz = Math.max(qz, 0);
      return Math.sqrt(mx * mx + my * my + mz * mz) + Math.min(Math.max(qx, qy, qz), 0) - p[15];
    }
    case P_CYL: {
      const dx = x - p[0], dy = y - p[1], dz = z - p[2];
      const lx = p[6] * dx + p[7] * dy + p[8] * dz;
      const ly = p[9] * dx + p[10] * dy + p[11] * dz;
      const lz = p[12] * dx + p[13] * dy + p[14] * dz;
      const ux = lx / p[3], uz = lz / p[5];
      const k0 = Math.sqrt(ux * ux + uz * uz);
      const vx = ux / p[3], vz = uz / p[5];
      const k1 = Math.sqrt(vx * vx + vz * vz);
      const d2 = k1 < 1e-9 ? -Math.min(p[3], p[5]) : (k0 * (k0 - 1)) / k1;
      const dh = Math.abs(ly) - p[4];
      const ox = Math.max(d2, 0), oy = Math.max(dh, 0);
      return Math.min(Math.max(d2, dh), 0) + Math.sqrt(ox * ox + oy * oy) - p[15];
    }
    case P_TRI: {
      const pax = x - p[0], pay = y - p[1], paz = z - p[2];
      const pbx = x - p[3], pby = y - p[4], pbz = z - p[5];
      const pcx = x - p[6], pcy = y - p[7], pcz = z - p[8];
      const s = Math.sign(p[22] * pax + p[23] * pay + p[24] * paz) + Math.sign(p[25] * pbx + p[26] * pby + p[27] * pbz) + Math.sign(p[28] * pcx + p[29] * pcy + p[30] * pcz);
      let d2;
      if (s < 2) {
        const t1 = clamp((p[10] * pax + p[11] * pay + p[12] * paz) * p[31], 0, 1);
        const e1x = p[10] * t1 - pax, e1y = p[11] * t1 - pay, e1z = p[12] * t1 - paz;
        const t2 = clamp((p[13] * pbx + p[14] * pby + p[15] * pbz) * p[32], 0, 1);
        const e2x = p[13] * t2 - pbx, e2y = p[14] * t2 - pby, e2z = p[15] * t2 - pbz;
        const t3 = clamp((p[16] * pcx + p[17] * pcy + p[18] * pcz) * p[33], 0, 1);
        const e3x = p[16] * t3 - pcx, e3y = p[17] * t3 - pcy, e3z = p[18] * t3 - pcz;
        d2 = Math.min(e1x * e1x + e1y * e1y + e1z * e1z, e2x * e2x + e2y * e2y + e2z * e2z, e3x * e3x + e3y * e3y + e3z * e3z);
      } else {
        const dn = p[19] * pax + p[20] * pay + p[21] * paz;
        d2 = dn * dn * p[34];
      }
      return Math.sqrt(d2) - p[9];
    }
  }
  return 1e3;
}

/** depth of a worm-like groove (a level set of two-octave value noise) at a point */
function grooveDepth(x, y, z, amp, f, w, seed, oct2) {
  const n = vnoise(x * f, y * f, z * f, seed) * (1 - oct2) + vnoise(x * f * 2.13, y * f * 2.13, z * f * 2.13, seed + 7) * oct2;
  const g = Math.abs(2 * n - 1);
  if (g >= w) return 0;
  const t = 1 - g / w;
  return amp * t * t * (3 - 2 * t);
}

function evalList(list, x, y, z) {
  let d = 1e3;
  for (let i = 0, n = list.length; i < n; i++) {
    const o = list[i];
    const op = o.op;
    const k = o.k;
    if (op !== OP_I) {
      // a primitive whose bounding box is farther than the blend reach cannot change the result
      const dx = Math.max(o.x0 - x, x - o.x1, 0), dy = Math.max(o.y0 - y, y - o.y1, 0), dz = Math.max(o.z0 - z, z - o.z1, 0);
      if (dx + dy + dz > 0) {
        const bd = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (bd >= (op === OP_U ? d : d < 0 ? -d : d) + k) continue;
      }
    }
    const pd = primDist(o, x, y, z);
    if (op === OP_U) {
      if (k > 0) {
        const h = Math.max(k - Math.abs(d - pd), 0) / k;
        d = Math.min(d, pd) - h * h * k * 0.25;
      } else if (pd < d) d = pd;
    } else {
      const b = op === OP_S ? -pd : pd;
      if (k > 0) {
        const h = Math.max(k - Math.abs(d - b), 0) / k;
        d = Math.max(d, b) + h * h * k * 0.25;
      } else if (b > d) d = b;
    }
  }
  return d;
}

// ------------------------------------------------------------------------------------------------
// Naive Surface Nets over a block-culled grid

const CORN = [
  [0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0],
  [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1],
];
const EDGE = [
  [0, 1], [2, 3], [4, 5], [6, 7],
  [0, 2], [1, 3], [4, 6], [5, 7],
  [0, 4], [1, 5], [2, 6], [3, 7],
];
// per edge: start corner, end corner, start offset (x, y, z), axis (0 x, 1 y, 2 z)
const E_A = Int8Array.from(EDGE.map((e) => e[0]));
const E_B = Int8Array.from(EDGE.map((e) => e[1]));
const E_OX = Int8Array.from(EDGE.map((e) => CORN[e[0]][0]));
const E_OY = Int8Array.from(EDGE.map((e) => CORN[e[0]][1]));
const E_OZ = Int8Array.from(EDGE.map((e) => CORN[e[0]][2]));
const E_AX = Int8Array.from(EDGE.map((e) => (CORN[e[1]][0] !== CORN[e[0]][0] ? 0 : CORN[e[1]][1] !== CORN[e[0]][1] ? 1 : 2)));

/**
 * Polygonise an Sdf at cell size h with Naive Surface Nets. Only cells the surface passes through
 * are sampled: a coarse grid (every C-th point) locates the surface, then a flood fill walks from
 * cell to cell across the faces the surface crosses. Primitives are culled per block of B^3
 * points. Normals come from the faces; ambient occlusion is integrated along the normal from the
 * coarse grid. Returns { pos, nrm, ao, tri } (typed arrays).
 */
// grid buffers reused between meshing calls (avoids tens of MB of garbage per mesh)
let G_F = new Float32Array(0), G_V = new Int32Array(0), G_M = new Uint8Array(0);
function gridBuffers(n) {
  if (G_F.length < n) {
    const cap = Math.ceil(n * 1.25);
    G_F = new Float32Array(cap);
    G_V = new Int32Array(cap);
    G_M = new Uint8Array(cap);
  }
  G_F.fill(NaN, 0, n);
  G_V.fill(-1, 0, n);
  G_M.fill(0, 0, n);
  return [G_F, G_V, G_M];
}

/** release the reusable meshing buffers (after the template is built) */
function freeGridBuffers() {
  G_F = new Float32Array(0);
  G_V = new Int32Array(0);
  G_M = new Uint8Array(0);
}

function meshSdf(sdf, h, opts = {}) {
  const ops = sdf.ops;
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (const o of ops) {
    if (o.op !== OP_U) continue;
    x0 = Math.min(x0, o.x0); y0 = Math.min(y0, o.y0); z0 = Math.min(z0, o.z0);
    x1 = Math.max(x1, o.x1); y1 = Math.max(y1, o.y1); z1 = Math.max(z1, o.z1);
  }
  const pad = 3 * h + 0.004;
  x0 -= pad; y0 -= pad; z0 -= pad;
  x1 += pad; y1 += pad; z1 += pad;
  const C = 3;
  const nx = Math.ceil((x1 - x0) / h / C) * C + 1, ny = Math.ceil((y1 - y0) / h / C) * C + 1, nz = Math.ceil((z1 - z0) / h / C) * C + 1;
  const nxy = nx * ny;
  const [F, cellVert, visited] = gridBuffers(nxy * nz);
  const B = 6;
  const nbx = Math.ceil(nx / B), nby = Math.ceil(ny / B), nbz = Math.ceil(nz / B);
  const lists = new Array(nbx * nby * nbz);
  const whole = (o) => o.op === OP_I;
  const buildList = (bi, bj, bk) => {
    const bx0 = x0 + bi * B * h, by0 = y0 + bj * B * h, bz0 = z0 + bk * B * h;
    const bx1 = bx0 + B * h, by1 = by0 + B * h, bz1 = bz0 + B * h;
    let list = null, hasU = false;
    for (const o of ops) {
      if (whole(o)) {
        if (list) list.push(o);
        continue;
      }
      const m = o.op === OP_S ? o.k + h : o.k + Math.max(2 * h, o.k * 0.5) + h;
      if (o.x1 + m < bx0 || o.x0 - m > bx1 || o.y1 + m < by0 || o.y0 - m > by1 || o.z1 + m < bz0 || o.z0 - m > bz1) continue;
      if (!list) {
        list = [];
        // intersections that come before this primitive still apply, in order
        for (const a of ops) {
          if (a === o) break;
          if (whole(a)) list.push(a);
        }
      }
      list.push(o);
      if (o.op === OP_U) hasU = true;
    }
    return hasU ? list : null;
  };
  let evals = 0;
  const sg = sdf.invert ? -1 : 1; // inverted: the solid is outside the primitives (a cavity wall)
  const val = (i, j, k) => {
    const idx = i + j * nx + k * nxy;
    let f = F[idx];
    if (f !== f) {
      const b = ((i / B) | 0) + nbx * (((j / B) | 0) + nby * ((k / B) | 0));
      let l = lists[b];
      if (l === undefined) l = lists[b] = buildList((i / B) | 0, (j / B) | 0, (k / B) | 0);
      f = l ? sg * evalList(l, x0 + i * h, y0 + j * h, z0 + k * h) : 0.05 * sg;
      F[idx] = f;
      evals++;
    }
    return f;
  };
  // block pass: blocks whose centre is far from the surface are filled with that value
  const L = sdf.lip;
  const far = new Float32Array(nbx * nby * nbz).fill(NaN);
  const Rb = 0.5 * Math.sqrt(3) * B * h;
  for (let bk = 0; bk < nbz; bk++) for (let bj = 0; bj < nby; bj++) for (let bi = 0; bi < nbx; bi++) {
    const b = bi + nbx * (bj + nby * bk);
    const l = (lists[b] = buildList(bi, bj, bk));
    if (!l) {
      far[b] = 0.05 * sg;
      continue;
    }
    const dc = sg * evalList(l, x0 + (bi + 0.5) * B * h, y0 + (bj + 0.5) * B * h, z0 + (bk + 0.5) * B * h);
    if (Math.abs(dc) > L * Rb + 2 * h) far[b] = dc;
  }
  // coarse grid
  const cx = (nx - 1) / C + 1, cy = (ny - 1) / C + 1, cz = (nz - 1) / C + 1;
  const Fc = new Float32Array(cx * cy * cz);
  for (let k = 0; k < cz; k++) for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) {
    const fi = Math.min(i * C, nx - 2), fj = Math.min(j * C, ny - 2), fk = Math.min(k * C, nz - 2);
    const fb = far[((fi / B) | 0) + nbx * (((fj / B) | 0) + nby * ((fk / B) | 0))];
    Fc[i + cx * (j + cy * k)] = fb === fb ? fb : val(i * C, j * C, k * C);
  }
  // seeds: fine cells next to sign changes along coarse edges; whole coarse cells near thin features
  let stk = new Int32Array(1 << 15), sp = 0;
  const pushCell = (i, j, k) => {
    if (i < 0 || j < 0 || k < 0 || i >= nx - 1 || j >= ny - 1 || k >= nz - 1) return;
    const c = i + j * nx + k * nxy;
    if (visited[c]) return;
    visited[c] = 1;
    if (sp >= stk.length) {
      const b2 = new Int32Array(stk.length * 2);
      b2.set(stk);
      stk = b2;
    }
    stk[sp++] = c;
  };
  // flood fill over surface cells
  let surf = new Int32Array(1 << 14), ns = 0;
  let pos = new Float32Array(3 << 14), np = 0;
  const v = new Float64Array(8);
  const coff = Int32Array.from(CORN.map((o) => o[0] + o[1] * nx + o[2] * nxy));
  const flood = () => {
  while (sp > 0) {
    const c = stk[--sp];
    const k = (c / nxy) | 0, j = ((c - k * nxy) / nx) | 0, i = c - k * nxy - j * nx;
    let mask = 0;
    for (let q = 0; q < 8; q++) {
      let f = F[c + coff[q]];
      if (f !== f) {
        const o = CORN[q];
        f = val(i + o[0], j + o[1], k + o[2]);
      }
      v[q] = f;
      if (f < 0) mask |= 1 << q;
    }
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (let q = 0; q < 12; q++) {
      const va = v[E_A[q]], vb = v[E_B[q]];
      if (va < 0 === vb < 0) continue;
      const t = va / (va - vb);
      const ax = E_AX[q];
      sx += E_OX[q] + (ax === 0 ? t : 0);
      sy += E_OY[q] + (ax === 1 ? t : 0);
      sz += E_OZ[q] + (ax === 2 ? t : 0);
      n++;
    }
    if (np + 3 > pos.length) {
      const b2 = new Float32Array(pos.length * 2);
      b2.set(pos);
      pos = b2;
    }
    if (ns >= surf.length) {
      const b2 = new Int32Array(surf.length * 2);
      b2.set(surf);
      surf = b2;
    }
    cellVert[c] = np / 3;
    pos[np++] = x0 + (i + sx / n) * h;
    pos[np++] = y0 + (j + sy / n) * h;
    pos[np++] = z0 + (k + sz / n) * h;
    surf[ns++] = c;
    // continue across the faces the surface crosses
    let m = mask & 0b01010101;
    if (m !== 0 && m !== 0b01010101) pushCell(i - 1, j, k);
    m = mask & 0b10101010;
    if (m !== 0 && m !== 0b10101010) pushCell(i + 1, j, k);
    m = mask & 0b00110011;
    if (m !== 0 && m !== 0b00110011) pushCell(i, j - 1, k);
    m = mask & 0b11001100;
    if (m !== 0 && m !== 0b11001100) pushCell(i, j + 1, k);
    m = mask & 0b00001111;
    if (m !== 0 && m !== 0b00001111) pushCell(i, j, k - 1);
    m = mask & 0b11110000;
    if (m !== 0 && m !== 0b11110000) pushCell(i, j, k + 1);
  }
  };
  const thr = sdf.lip * Math.sqrt(3) * C * h * 0.5 + 1.5 * h;
  const cv8 = new Float64Array(8);
  const BC = B / C; // coarse cells per block side
  // coarse cells crossed by the surface
  const ccx = cx - 1, ccy = cy - 1, ccz = cz - 1;
  const cross = new Uint8Array(ccx * ccy * ccz);
  for (let k = 0; k < ccz; k++) for (let j = 0; j < ccy; j++) for (let i = 0; i < ccx; i++) {
    let neg = 0;
    for (let c = 0; c < 8; c++) {
      const o = CORN[c];
      if (Fc[i + o[0] + cx * (j + o[1] + cy * (k + o[2]))] < 0) neg++;
    }
    if (neg > 0 && neg < 8) cross[i + ccx * (j + ccy * k)] = 1;
  }
  const crossNear = (i, j, k) => {
    for (let c = -1; c <= 1; c++) for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
      const ii = i + a, jj = j + b, kk = k + c;
      if (ii >= 0 && jj >= 0 && kk >= 0 && ii < ccx && jj < ccy && kk < ccz && cross[ii + ccx * (jj + ccy * kk)]) return true;
    }
    return false;
  };
  for (let bk = 0; bk < nbz; bk++) for (let bj = 0; bj < nby; bj++) for (let bi = 0; bi < nbx; bi++) {
    const fb = far[bi + nbx * (bj + nby * bk)];
    if (fb === fb) continue;
    for (let k = bk * BC; k < Math.min((bk + 1) * BC, cz - 1); k++) for (let j = bj * BC; j < Math.min((bj + 1) * BC, cy - 1); j++) for (let i = bi * BC; i < Math.min((bi + 1) * BC, cx - 1); i++) {
    let neg = 0, mn = Infinity;
    for (let c = 0; c < 8; c++) {
      const o = CORN[c];
      const f = Fc[i + o[0] + cx * (j + o[1] + cy * (k + o[2]))];
      cv8[c] = f;
      if (f < 0) neg++;
      const af = f < 0 ? -f : f;
      if (af < mn) mn = af;
    }
    if (neg > 0 && neg < 8) {
      // one seed per connected sheet is enough: skip cells the flood has already reached
      for (let q = 0; q < 12; q++) {
        const a = EDGE[q][0], b = EDGE[q][1];
        if (cv8[a] < 0 === cv8[b] < 0) continue;
        const oa = CORN[a], ob = CORN[b];
        const di = ob[0] - oa[0], dj = ob[1] - oa[1], dk = ob[2] - oa[2];
        const pi = (i + oa[0]) * C, pj = (j + oa[1]) * C, pk = (k + oa[2]) * C;
        let prev = val(pi, pj, pk);
        for (let s = 1; s <= C; s++) {
          const qi = pi + di * s, qj = pj + dj * s, qk = pk + dk * s;
          const cur = val(qi, qj, qk);
          if (prev < 0 !== cur < 0) {
            // the 4 cells around the fine edge (q - d) -> q
            const ei = qi - di, ej = qj - dj, ek = qk - dk;
            if (di) for (let a2 = -1; a2 <= 0; a2++) for (let b2 = -1; b2 <= 0; b2++) pushCell(ei, ej + a2, ek + b2);
            else if (dj) for (let a2 = -1; a2 <= 0; a2++) for (let b2 = -1; b2 <= 0; b2++) pushCell(ei + a2, ej, ek + b2);
            else for (let a2 = -1; a2 <= 0; a2++) for (let b2 = -1; b2 <= 0; b2++) pushCell(ei + a2, ej + b2, ek);
            break;
          }
          prev = cur;
        }
        flood();
        break;
      }
    } else if (mn < thr && !crossNear(i, j, k)) {
      // an isolated thin feature may pass between the coarse samples: probe the interior points
      const s0 = cv8[0] < 0;
      let hit = false;
      for (let c = 1; c < C && !hit; c++) for (let b = 1; b < C && !hit; b++) for (let a = 1; a < C && !hit; a++) {
        if (val(i * C + a, j * C + b, k * C + c) < 0 !== s0) hit = true;
      }
      if (hit) {
        for (let c = 0; c < C; c++) for (let b = 0; b < C; b++) for (let a = 0; a < C; a++) pushCell(i * C + a, j * C + b, k * C + c);
        flood();
      }
    }
    }
  }
  // faces: one quad per sign-changing edge leaving each surface cell's base corner
  let tri = new Uint32Array(ns * 7 + 64), nt = 0;
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) {
      const t = b;
      b = d;
      d = t;
    }
    if (nt + 6 > tri.length) {
      const b2 = new Uint32Array(tri.length * 2);
      b2.set(tri);
      tri = b2;
    }
    const ux = pos[c * 3] - pos[a * 3], uy = pos[c * 3 + 1] - pos[a * 3 + 1], uz = pos[c * 3 + 2] - pos[a * 3 + 2];
    const wx = pos[d * 3] - pos[b * 3], wy = pos[d * 3 + 1] - pos[b * 3 + 1], wz = pos[d * 3 + 2] - pos[b * 3 + 2];
    if (ux * ux + uy * uy + uz * uz <= wx * wx + wy * wy + wz * wz) {
      tri[nt++] = a; tri[nt++] = b; tri[nt++] = c;
      tri[nt++] = a; tri[nt++] = c; tri[nt++] = d;
    } else {
      tri[nt++] = a; tri[nt++] = b; tri[nt++] = d;
      tri[nt++] = b; tri[nt++] = c; tri[nt++] = d;
    }
  };
  for (let s = 0; s < ns; s++) {
    const c = surf[s];
    const in0 = F[c] < 0;
    // neighbouring cells by index offset (all are surface cells when the edge changes sign)
    if (in0 !== F[c + 1] < 0) quad(cellVert[c - nx - nxy], cellVert[c - nxy], cellVert[c], cellVert[c - nx], !in0);
    if (in0 !== F[c + nx] < 0) quad(cellVert[c - 1 - nxy], cellVert[c - 1], cellVert[c], cellVert[c - nxy], !in0);
    if (in0 !== F[c + nxy] < 0) quad(cellVert[c - 1 - nx], cellVert[c - nx], cellVert[c], cellVert[c - 1], !in0);
  }
  const mesh = { pos: pos.slice(0, np), tri: tri.slice(0, nt) };
  faceNormals(mesh);
  // ambient occlusion: trilinear samples of the coarse grid along the normal
  const hc = h * C;
  const sampleC = (x, y, z) => {
    const fx = (x - x0) / hc, fy = (y - y0) / hc, fz = (z - z0) / hc;
    if (fx < 0 || fy < 0 || fz < 0 || fx >= cx - 1 || fy >= cy - 1 || fz >= cz - 1) return 1;
    const i = fx | 0, j = fy | 0, k = fz | 0;
    const tx = fx - i, ty = fy - j, tz = fz - k;
    const b = i + cx * (j + cy * k), sy = cx, sz = cx * cy;
    const c00 = Fc[b] + (Fc[b + 1] - Fc[b]) * tx, c10 = Fc[b + sy] + (Fc[b + sy + 1] - Fc[b + sy]) * tx;
    const c01 = Fc[b + sz] + (Fc[b + sz + 1] - Fc[b + sz]) * tx, c11 = Fc[b + sz + sy] + (Fc[b + sz + sy + 1] - Fc[b + sz + sy]) * tx;
    const c0 = c00 + (c10 - c00) * ty, c1 = c01 + (c11 - c01) * ty;
    return c0 + (c1 - c0) * tz;
  };
  const nv = np / 3;
  const nrm = mesh.nrm;
  const ao = new Float32Array(nv);
  const aoR = opts.aoRadius ?? 0.012;
  const steps = [0.45, 1.0, 1.6];
  const str = opts.aoStrength ?? 1.1;
  for (let q = 0; q < nv; q++) {
    const px = pos[q * 3], py = pos[q * 3 + 1], pz = pos[q * 3 + 2];
    const gx = nrm[q * 3], gy = nrm[q * 3 + 1], gz = nrm[q * 3 + 2];
    let occ = 0, wsum = 0;
    for (let s = 0; s < 3; s++) {
      const dd = steps[s] * aoR;
      const f = sampleC(px + gx * dd, py + gy * dd, pz + gz * dd);
      const w = 1 / (1 + s);
      occ += w * clamp((dd - f) / dd, 0, 1);
      wsum += w;
    }
    ao[q] = clamp(1 - (str * occ) / wsum, 0.08, 1);
  }
  mesh.ao = ao;
  if (opts.stats) mesh.stats = { grid: [nx, ny, nz], evals, cells: ns };
  return mesh;
}

// ------------------------------------------------------------------------------------------------
// Swept tubes (ribs, cartilage, intestines)

/** Catmull-Rom resampling of control points into n points */
function catmull(ctrl, n) {
  const out = [];
  const m = ctrl.length;
  for (let s = 0; s < n; s++) {
    const t = (s / (n - 1)) * (m - 1);
    const i = Math.min(Math.floor(t), m - 2);
    const u = t - i;
    const p0 = ctrl[Math.max(i - 1, 0)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(i + 2, m - 1)];
    const u2 = u * u, u3 = u2 * u;
    const q = [0, 0, 0];
    for (let c = 0; c < 3; c++) {
      q[c] = 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * u + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * u2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * u3);
    }
    out.push(q);
  }
  return out;
}

/** resample a polyline to (roughly) uniform spacing ds */
function resample(pts, ds) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + vlen(vsub(pts[i], pts[i - 1])));
  const L = cum[cum.length - 1];
  const n = Math.max(2, Math.round(L / ds) + 1);
  const out = [];
  let j = 0;
  for (let s = 0; s < n; s++) {
    const d = (s / (n - 1)) * L;
    while (j < pts.length - 2 && cum[j + 1] < d) j++;
    const t = (d - cum[j]) / Math.max(cum[j + 1] - cum[j], 1e-9);
    out.push(vlerp(pts[j], pts[j + 1], clamp(t, 0, 1)));
  }
  return { pts: out, length: L };
}

/**
 * Sweep an elliptic profile along a path. prof(u) -> [halfWidthAlongB, halfThickAlongN]; out(p, T)
 * gives the "outward" hint for N. Returns a mesh plus per-vertex path parameter / ring angle.
 */
function sweep(path, prof, opts = {}) {
  const segs = opts.segs ?? 10;
  const n = path.length;
  const pos = [], nrm = [], uu = [], ang = [], tri = [];
  const frames = [];
  let prevN = null;
  for (let i = 0; i < n; i++) {
    const T = vnorm(vsub(path[Math.min(i + 1, n - 1)], path[Math.max(i - 1, 0)]));
    let N = opts.out ? opts.out(path[i], T, i / (n - 1)) : prevN || (Math.abs(T[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]);
    N = vsub(N, vmul(T, vdot(N, T)));
    if (vlen(N) < 1e-6) N = prevN || [0, 1, 0];
    N = vnorm(N);
    if (prevN && !opts.out && vdot(N, prevN) < 0) N = vmul(N, -1);
    prevN = N;
    frames.push([T, N, vcross(T, N)]);
  }
  const ring = (p, T, N, Bv, w, t, u) => {
    for (let s = 0; s < segs; s++) {
      const a = (s / segs) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      pos.push(...vax(p, N, ca * t, Bv, sa * w));
      nrm.push(...vnorm(vax([0, 0, 0], N, ca / t, Bv, sa / w)));
      uu.push(u);
      ang.push(a);
    }
  };
  for (let i = 0; i < n; i++) {
    const [T, N, Bv] = frames[i];
    const u = i / (n - 1);
    const [w, t] = prof(u);
    ring(path[i], T, N, Bv, w, t, u);
  }
  for (let i = 0; i + 1 < n; i++) {
    for (let s = 0; s < segs; s++) {
      const a = i * segs + s, b = i * segs + ((s + 1) % segs), c = (i + 1) * segs + ((s + 1) % segs), d = (i + 1) * segs + s;
      tri.push(a, b, c, a, c, d);
    }
  }
  // rounded caps
  const cap = (end) => {
    const i = end ? n - 1 : 0;
    const [T0, N, Bv] = frames[i];
    const T = end ? T0 : vmul(T0, -1);
    const [w, t] = prof(end ? 1 : 0);
    const r = Math.min(w, t) * (opts.capScale ?? 1);
    const rings = 3;
    let prevStart = i * segs;
    for (let k = 1; k <= rings; k++) {
      const th = (k / (rings + 1)) * Math.PI * 0.5;
      const sc = Math.cos(th), off = Math.sin(th) * r;
      const start = pos.length / 3;
      const p = vax(path[i], T, off);
      for (let s = 0; s < segs; s++) {
        const a = (s / segs) * Math.PI * 2;
        const ca = Math.cos(a), sa = Math.sin(a);
        pos.push(...vax(p, N, ca * t * sc, Bv, sa * w * sc));
        nrm.push(...vnorm(vax([0, 0, 0], N, (ca * sc) / t, Bv, (sa * sc) / w, T, Math.sin(th) / r)));
        uu.push(end ? 1 : 0);
        ang.push(a);
      }
      for (let s = 0; s < segs; s++) {
        const a = prevStart + s, b = prevStart + ((s + 1) % segs), c = start + ((s + 1) % segs), d = start + s;
        if (end) tri.push(a, b, c, a, c, d);
        else tri.push(a, c, b, a, d, c);
      }
      prevStart = start;
    }
    const tip = pos.length / 3;
    pos.push(...vax(path[i], T, r));
    nrm.push(...T);
    uu.push(end ? 1 : 0);
    ang.push(0);
    for (let s = 0; s < segs; s++) {
      const a = prevStart + s, b = prevStart + ((s + 1) % segs);
      if (end) tri.push(a, b, tip);
      else tri.push(a, tip, b);
    }
  };
  if (opts.cap0 !== false) cap(false);
  if (opts.cap1 !== false) cap(true);
  const nv = pos.length / 3;
  return {
    pos: Float32Array.from(pos),
    nrm: Float32Array.from(nrm),
    ao: new Float32Array(nv).fill(1),
    tri: Uint32Array.from(tri),
    u: Float32Array.from(uu),
    ang: Float32Array.from(ang),
  };
}

/** parametric closed surface (superellipsoid-ish) for small parts: f(theta, phi) -> [pos, normal] */
function lathe(nu, nv, f) {
  const pos = [], nrm = [], tri = [];
  for (let j = 0; j <= nv; j++) {
    for (let i = 0; i < nu; i++) {
      const [p, q] = f((i / nu) * Math.PI * 2, (j / nv) * Math.PI);
      pos.push(...p);
      nrm.push(...q);
    }
  }
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a = j * nu + i, b = j * nu + ((i + 1) % nu), c = (j + 1) * nu + ((i + 1) % nu), d = (j + 1) * nu + i;
      tri.push(a, d, c, a, c, b);
    }
  }
  return { pos: Float32Array.from(pos), nrm: Float32Array.from(nrm), ao: new Float32Array(pos.length / 3).fill(1), tri: Uint32Array.from(tri) };
}

// ================================================================================================
// Geometry assembly: pieces (rigid parts), vertex splitting at piece boundaries

class PieceTable {
  constructor() {
    this.list = [];
  }

  add(seg, kind, meta = null) {
    const id = this.list.length;
    this.list.push({ id, seg, kind, meta, c: [0, 0, 0], area: 0 });
    return id;
  }
}

/** linear 3x4 transform helpers for placing template meshes */
function xformMake(rows, scale, t) {
  // p' = R * (S p) + t, rows = local axes (columns of R are rows[i] ... we use R = [X Y Z] as columns)
  const [X, Y, Z] = rows;
  const s = Array.isArray(scale) ? scale : [scale, scale, scale];
  return {
    m: [X[0] * s[0], Y[0] * s[1], Z[0] * s[2], X[1] * s[0], Y[1] * s[1], Z[1] * s[2], X[2] * s[0], Y[2] * s[1], Z[2] * s[2]],
    n: [X[0] / s[0], Y[0] / s[1], Z[0] / s[2], X[1] / s[0], Y[1] / s[1], Z[1] / s[2], X[2] / s[0], Y[2] / s[1], Z[2] / s[2]],
    t,
    flip: false,
  };
}
const MIRROR = { m: [-1, 0, 0, 0, 1, 0, 0, 0, 1], n: [-1, 0, 0, 0, 1, 0, 0, 0, 1], t: [0, 0, 0], flip: true };

class GrowBuf {
  constructor(T, cap = 1 << 14) {
    this.T = T;
    this.a = new T(cap);
    this.n = 0;
  }

  reserve(k) {
    if (this.n + k <= this.a.length) return this.a;
    let c = this.a.length * 2;
    while (c < this.n + k) c *= 2;
    const b = new this.T(c);
    b.set(this.a.subarray(0, this.n));
    this.a = b;
    return b;
  }

  view() {
    return this.a.slice(0, this.n);
  }
}

class GeoBuilder {
  constructor(pieces) {
    this.pieces = pieces;
    this.P = new GrowBuf(Float32Array);
    this.N = new GrowBuf(Int16Array);
    this.C = new GrowBuf(Uint8Array); // rgba bytes: albedo (sRGB) + ao
    this.M = new GrowBuf(Uint8Array); // material / organ id
    this.K = new GrowBuf(Uint16Array); // piece id
    this.I = new GrowBuf(Uint32Array);
  }

  get count() {
    return this.P.n / 3;
  }

  /**
   * Append a mesh. triPiece: Int32Array (piece per triangle) or a single piece id. color: [r,g,b]
   * (0..1 sRGB) or fn(x, y, z) -> [r,g,b]. mat: material id. xf: transform (xformMake / MIRROR).
   * Vertices shared by triangles of different pieces are duplicated, so pieces separate cleanly.
   */
  add(mesh, triPiece, color, mat = 0, xf = null) {
    const { pos, nrm, ao, tri } = mesh;
    const nvIn = pos.length / 3;
    const firstPiece = new Int32Array(nvIn).fill(-1);
    const firstNew = new Int32Array(nvIn);
    const extra = new Map();
    const single = typeof triPiece === 'number';
    const colFn = typeof color === 'function' ? color : null;
    const cr = colFn ? 0 : Math.round(clamp(color[0], 0, 1) * 255), cg = colFn ? 0 : Math.round(clamp(color[1], 0, 1) * 255), cb = colFn ? 0 : Math.round(clamp(color[2], 0, 1) * 255);
    const m = xf ? xf.m : null, nm = xf ? xf.n : null, tt = xf ? xf.t : null;
    const self = this;
    // room for every vertex duplicated once (piece borders) and all triangles
    this.P.reserve(nvIn * 6);
    this.N.reserve(nvIn * 6);
    this.C.reserve(nvIn * 8);
    this.M.reserve(nvIn * 2);
    this.K.reserve(nvIn * 2);
    this.I.reserve(tri.length);
    function emit(i, piece) {
      const id = self.P.n / 3;
      let x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      let nx = nrm[i * 3], ny = nrm[i * 3 + 1], nz = nrm[i * 3 + 2];
      if (m) {
        const a = m[0] * x + m[1] * y + m[2] * z + tt[0], b = m[3] * x + m[4] * y + m[5] * z + tt[1], c = m[6] * x + m[7] * y + m[8] * z + tt[2];
        x = a; y = b; z = c;
        const p = nm[0] * nx + nm[1] * ny + nm[2] * nz, q = nm[3] * nx + nm[4] * ny + nm[5] * nz, r = nm[6] * nx + nm[7] * ny + nm[8] * nz;
        const l = Math.sqrt(p * p + q * q + r * r) || 1;
        nx = p / l; ny = q / l; nz = r / l;
      }
      if (self.K.n + 1 > self.K.a.length) {
        self.P.reserve(nvIn * 3);
        self.N.reserve(nvIn * 3);
        self.C.reserve(nvIn * 4);
        self.M.reserve(nvIn);
        self.K.reserve(nvIn);
      }
      const P = self.P.a, N = self.N.a, C = self.C.a, M = self.M.a, K = self.K.a;
      let o = self.P.n;
      P[o] = x; P[o + 1] = y; P[o + 2] = z;
      self.P.n += 3;
      o = self.N.n;
      N[o] = Math.round(clamp(nx, -1, 1) * 32767); N[o + 1] = Math.round(clamp(ny, -1, 1) * 32767); N[o + 2] = Math.round(clamp(nz, -1, 1) * 32767);
      self.N.n += 3;
      o = self.C.n;
      if (colFn) {
        const col = colFn(x, y, z);
        C[o] = Math.round(clamp(col[0], 0, 1) * 255); C[o + 1] = Math.round(clamp(col[1], 0, 1) * 255); C[o + 2] = Math.round(clamp(col[2], 0, 1) * 255);
      } else {
        C[o] = cr; C[o + 1] = cg; C[o + 2] = cb;
      }
      C[o + 3] = Math.round(clamp(ao[i], 0, 1) * 255);
      self.C.n += 4;
      M[self.M.n++] = mat;
      K[self.K.n++] = piece;
      return id;
    }
    function vid(i, piece) {
      const fp = firstPiece[i];
      if (fp === piece) return firstNew[i];
      if (fp < 0) {
        firstPiece[i] = piece;
        return (firstNew[i] = emit(i, piece));
      }
      const key = i * 4096 + piece;
      let id = extra.get(key);
      if (id === undefined) {
        id = emit(i, piece);
        extra.set(key, id);
      }
      return id;
    }
    const flip = xf && xf.flip;
    const nt = tri.length / 3;
    const list = this.pieces.list;
    for (let t = 0; t < nt; t++) {
      const piece = single ? triPiece : triPiece[t];
      if (piece < 0) continue;
      const a = vid(tri[t * 3], piece), b = vid(tri[t * 3 + 1], piece), c = vid(tri[t * 3 + 2], piece);
      const I = this.I.a;
      let o = this.I.n;
      I[o] = a;
      I[o + 1] = flip ? c : b;
      I[o + 2] = flip ? b : c;
      this.I.n += 3;
      // piece centroid (area weighted)
      const P = this.P.a;
      const ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2];
      const ux = P[b * 3] - ax, uy = P[b * 3 + 1] - ay, uz = P[b * 3 + 2] - az;
      const vx = P[c * 3] - ax, vy = P[c * 3 + 1] - ay, vz = P[c * 3 + 2] - az;
      const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
      const ar = 0.5 * Math.sqrt(cx * cx + cy * cy + cz * cz);
      const pe = list[piece];
      pe.area += ar;
      pe.c[0] += (ax + (ux + vx) / 3) * ar;
      pe.c[1] += (ay + (uy + vy) / 3) * ar;
      pe.c[2] += (az + (uz + vz) / 3) * ar;
    }
  }

  finish() {
    for (const pe of this.pieces.list) {
      if (pe.area > 0 && !pe.done) {
        pe.c = pe.c.map((x) => x / pe.area);
        pe.done = true;
      }
    }
    const nv = this.P.n / 3;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.P.view(), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(this.N.view(), 3, true));
    geo.setAttribute('aSurf', new THREE.BufferAttribute(this.C.view(), 4, true));
    geo.setAttribute('aMat', new THREE.BufferAttribute(this.M.view(), 1, false));
    geo.setAttribute('aPiece', new THREE.BufferAttribute(this.K.view(), 1, false));
    const idx = this.I.view();
    geo.setIndex(new THREE.BufferAttribute(nv > 65535 ? idx : Uint16Array.from(idx), 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 3);
    return geo;
  }
}

/** per-triangle centroids of a mesh (optionally transformed) */
function triCentroids(mesh, xf = null) {
  const { pos, tri } = mesh;
  const nt = tri.length / 3;
  const out = new Float32Array(nt * 3);
  for (let t = 0; t < nt; t++) {
    let x = 0, y = 0, z = 0;
    for (let q = 0; q < 3; q++) {
      const i = tri[t * 3 + q];
      x += pos[i * 3];
      y += pos[i * 3 + 1];
      z += pos[i * 3 + 2];
    }
    x /= 3; y /= 3; z /= 3;
    if (xf) {
      const m = xf.m;
      const a = m[0] * x + m[1] * y + m[2] * z + xf.t[0], b = m[3] * x + m[4] * y + m[5] * z + xf.t[1], c = m[6] * x + m[7] * y + m[8] * z + xf.t[2];
      x = a; y = b; z = c;
    }
    out[t * 3] = x;
    out[t * 3 + 1] = y;
    out[t * 3 + 2] = z;
  }
  return out;
}

/**
 * Voronoi pre-fracture of a mesh: sites spaced ~`spacing` apart (chosen among the vertices that
 * pass `siteOk`), triangles assigned to the nearest site after a smooth domain warp, which gives
 * the cell borders an irregular, cracked course. Returns { triCell, sites, adj }.
 */
function voronoiCells(mesh, spacing, seed, siteOk = null, warp = 0.3, given = null) {
  const { pos, tri } = mesh;
  const nv = pos.length / 3;
  let mnx = Infinity, mny = Infinity, mnz = Infinity, mxx = -Infinity, mxy = -Infinity, mxz = -Infinity;
  for (let i = 0; i < nv; i++) {
    mnx = Math.min(mnx, pos[i * 3]); mny = Math.min(mny, pos[i * 3 + 1]); mnz = Math.min(mnz, pos[i * 3 + 2]);
    mxx = Math.max(mxx, pos[i * 3]); mxy = Math.max(mxy, pos[i * 3 + 1]); mxz = Math.max(mxz, pos[i * 3 + 2]);
  }
  if (given) for (const p of given) {
    mnx = Math.min(mnx, p[0]); mny = Math.min(mny, p[1]); mnz = Math.min(mnz, p[2]);
    mxx = Math.max(mxx, p[0]); mxy = Math.max(mxy, p[1]); mxz = Math.max(mxz, p[2]);
  }
  const S = spacing, W = spacing * warp;
  mnx -= W + S; mny -= W + S; mnz -= W + S;
  const gx = Math.ceil((mxx - mnx + W + S) / S) + 1, gy = Math.ceil((mxy - mny + W + S) / S) + 1, gz = Math.ceil((mxz - mnz + W + S) / S) + 1;
  const head = new Int32Array(gx * gy * gz).fill(-1);
  const next = [];
  const sx = [], sy = [], sz = [];
  const cellOf = (x, y, z) => [Math.floor((x - mnx) / S), Math.floor((y - mny) / S), Math.floor((z - mnz) / S)];
  const rnd = mulberry(seed);
  const order = new Int32Array(given ? 0 : nv);
  for (let i = 0; i < order.length; i++) order[i] = i;
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = order[i];
    order[i] = order[j];
    order[j] = t;
  }
  const S2 = S * S;
  if (given) {
    for (const p of given) {
      const [ci, cj, ck] = cellOf(p[0], p[1], p[2]);
      const g = ci + gx * (cj + gy * ck);
      next.push(head[g]);
      head[g] = sx.length;
      sx.push(p[0]);
      sy.push(p[1]);
      sz.push(p[2]);
    }
  }
  for (let q = given ? nv : 0; q < nv; q++) {
    const i = order[q];
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    if (siteOk && !siteOk(x, y, z, i)) continue;
    const [ci, cj, ck] = cellOf(x, y, z);
    let ok = true;
    for (let c = -1; c <= 1 && ok; c++) for (let b = -1; b <= 1 && ok; b++) for (let a = -1; a <= 1 && ok; a++) {
      const ii = ci + a, jj = cj + b, kk = ck + c;
      if (ii < 0 || jj < 0 || kk < 0 || ii >= gx || jj >= gy || kk >= gz) continue;
      for (let s = head[ii + gx * (jj + gy * kk)]; s >= 0; s = next[s]) {
        const dx = sx[s] - x, dy = sy[s] - y, dz = sz[s] - z;
        if (dx * dx + dy * dy + dz * dz < S2) {
          ok = false;
          break;
        }
      }
    }
    if (!ok) continue;
    const id = sx.length;
    sx.push(x);
    sy.push(y);
    sz.push(z);
    const g = ci + gx * (cj + gy * ck);
    next.push(head[g]);
    head[g] = id;
  }
  // smooth periodic domain warp (cheap, irregular enough for crack lines)
  const wr = mulberry(seed * 7 + 13);
  const ph = Array.from({ length: 12 }, () => wr() * Math.PI * 2);
  const fq = Array.from({ length: 6 }, () => (0.8 + 0.5 * wr()) / (S * 0.45));
  const vCell = new Int32Array(nv);
  for (let vi = 0; vi < nv; vi++) {
    let x = pos[vi * 3], y = pos[vi * 3 + 1], z = pos[vi * 3 + 2];
    const wx = Math.sin(fq[0] * y + fq[1] * z * 0.7 + ph[0]);
    const wy = Math.sin(fq[2] * z + fq[3] * x * 0.7 + ph[1]);
    const wz = Math.sin(fq[4] * x + fq[5] * y * 0.7 + ph[2]);
    x += wx * W;
    y += wy * W;
    z += wz * W;
    const ci = Math.floor((x - mnx) / S), cj = Math.floor((y - mny) / S), ck = Math.floor((z - mnz) / S);
    let best = -1, bd = Infinity;
    for (let r = 1; r <= 3 && best < 0; r++) {
      for (let cc = -r; cc <= r; cc++) for (let bb = -r; bb <= r; bb++) for (let aa = -r; aa <= r; aa++) {
        const ii = ci + aa, jj = cj + bb, kk = ck + cc;
        if (ii < 0 || jj < 0 || kk < 0 || ii >= gx || jj >= gy || kk >= gz) continue;
        for (let q = head[ii + gx * (jj + gy * kk)]; q >= 0; q = next[q]) {
          const dx = sx[q] - x, dy = sy[q] - y, dz = sz[q] - z;
          const d = dx * dx + dy * dy + dz * dz;
          if (d < bd) {
            bd = d;
            best = q;
          }
        }
      }
    }
    vCell[vi] = best < 0 ? 0 : best;
  }
  const nt = tri.length / 3;
  const triCell = new Int32Array(nt);
  for (let t = 0; t < nt; t++) {
    const a = vCell[tri[t * 3]], b = vCell[tri[t * 3 + 1]], c = vCell[tri[t * 3 + 2]];
    triCell[t] = b === c ? b : a;
  }
  // adjacency between cells sharing a vertex
  const ns = sx.length;
  const vc = new Int32Array(nv).fill(-1);
  const adj = Array.from({ length: ns }, () => new Set());
  for (let t = 0; t < nt; t++) {
    const c = triCell[t];
    for (let q = 0; q < 3; q++) {
      const i = tri[t * 3 + q];
      const prev = vc[i];
      if (prev < 0) vc[i] = c;
      else if (prev !== c) {
        adj[prev].add(c);
        adj[c].add(prev);
      }
    }
  }
  const sites = sx.map((x, i) => [x, sy[i], sz[i]]);
  return { triCell, sites, adj: adj.map((s) => [...s]) };
}

/** smooth vertex normals from faces (for parametric meshes) */
function faceNormals(mesh) {
  const { pos, tri } = mesh;
  const n = new Float32Array(pos.length);
  for (let t = 0; t < tri.length; t += 3) {
    const a = tri[t] * 3, b = tri[t + 1] * 3, c = tri[t + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const i of [a, b, c]) {
      n[i] += nx;
      n[i + 1] += ny;
      n[i + 2] += nz;
    }
  }
  for (let i = 0; i < n.length; i += 3) {
    const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
    n[i] /= l;
    n[i + 1] /= l;
    n[i + 2] /= l;
  }
  mesh.nrm = n;
  return mesh;
}

// ================================================================================================
// Anatomy. Colours are sRGB 0..1; material ids select the shading in the bone / organ shaders.

const C_BONE = [0.9, 0.85, 0.75];
const C_TOOTH = [0.96, 0.94, 0.86];
const C_CART = [0.74, 0.8, 0.84];
const BM_BONE = 0, BM_SKULL = 1, BM_TOOTH = 2, BM_CART = 3;

const OM = { brain: 1, eye: 2, heart: 3, artery: 4, vein: 5, lung: 6, liver: 7, stomach: 8, spleen: 9, kidney: 10, gut: 11, colon: 12, bladder: 13, trachea: 14, cord: 15 };


// ---------------- head ----------------

/** dental arch (left half) in the xz plane: midline -> back */
const UPPER_ARCH = [[0, 0.0755], [0.012, 0.0725], [0.0205, 0.0655], [0.0255, 0.055], [0.0285, 0.0435], [0.0305, 0.031], [0.0315, 0.019], [0.032, 0.006]];
const lowerArch = () => UPPER_ARCH.map(([x, z]) => [x * 0.93, z * 0.93 - 0.0005]);

function archWalk(arch, s) {
  // point + tangent at arc length s along the arch polyline
  let acc = 0;
  for (let i = 0; i + 1 < arch.length; i++) {
    const a = arch[i], b = arch[i + 1];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (acc + l >= s || i + 2 === arch.length) {
      const t = clamp((s - acc) / l, 0, 1.5);
      return { p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], t: [(b[0] - a[0]) / l, (b[1] - a[1]) / l] };
    }
    acc += l;
  }
  return null;
}

const TEETH = [
  { k: 'inc', w: 0.0086, d: 0.0068, h: 0.0108 },
  { k: 'inc', w: 0.0066, d: 0.0062, h: 0.0098 },
  { k: 'can', w: 0.0077, d: 0.0078, h: 0.0112 },
  { k: 'pre', w: 0.007, d: 0.0088, h: 0.0086 },
  { k: 'pre', w: 0.0067, d: 0.0086, h: 0.0083 },
  { k: 'mol', w: 0.0102, d: 0.0105, h: 0.0076 },
  { k: 'mol', w: 0.0092, d: 0.0102, h: 0.0072 },
  { k: 'mol', w: 0.0084, d: 0.0096, h: 0.0068 },
];

/** a tooth crown in its own frame: X along the arch, Y toward the root, Z outward (labial) */
function toothMesh(t, lower) {
  const m = lathe(14, 10, (u, v) => {
    // v: 0 = root end (top), PI = biting end
    const sv = Math.sin(v), cv = Math.cos(v);
    const e = 0.55;
    const su = Math.sin(u), cu = Math.cos(u);
    let x = Math.sign(cu) * Math.pow(Math.abs(cu), e) * Math.pow(sv, 0.7) * t.w * 0.5;
    let z = Math.sign(su) * Math.pow(Math.abs(su), e) * Math.pow(sv, 0.7) * t.d * 0.5;
    let y = cv * t.h * 0.5;
    const bite = clamp(-cv, 0, 1); // 0 at the middle -> 1 at the biting end
    if (t.k === 'inc') {
      z *= 1 - 0.65 * bite * bite;
      x *= 1 + 0.08 * bite;
    } else if (t.k === 'can') {
      const pt = bite * bite;
      x *= 1 - 0.55 * pt;
      z *= 1 - 0.45 * pt;
      y -= 0.0012 * pt * (1 - Math.abs(Math.sin(u)));
    } else {
      // cusps: bumps on the occlusal surface
      const cusp = Math.cos(u * 2) * 0.5 + 0.5;
      y -= (t.k === 'mol' ? 0.0011 : 0.0009) * bite * bite * cusp;
      x *= 1 + 0.06 * Math.sin(v * 2);
      z *= 1 + 0.06 * Math.sin(v * 2);
    }
    // narrow at the neck (cervical line)
    const neck = clamp(cv, 0, 1);
    x *= 1 - 0.18 * neck * neck;
    z *= 1 - 0.18 * neck * neck;
    return [[x, lower ? -y : y, z], [0, 1, 0]];
  });
  if (!lower) {
    // the (x, z) ring with y as the pole is a mirrored parameterisation: flip to face outward
    // (the lower teeth are mirrored once more by y -> -y)
    const tr = m.tri;
    for (let i = 0; i < tr.length; i += 3) {
      const a = tr[i + 1];
      tr[i + 1] = tr[i + 2];
      tr[i + 2] = a;
    }
  }
  return faceNormals(m);
}

/** teeth of one jaw: returns [{ mesh, xf, center }] */
function teethSet(lower) {
  const arch = lower ? lowerArch() : UPPER_ARCH;
  const out = [];
  const yC = lower ? 1.5958 : 1.6064;
  for (const side of [1, -1]) {
    let s = 0.0004;
    TEETH.forEach((t, i) => {
      const w = t.w * (lower ? (i < 2 ? 0.72 : 0.97) : 1);
      const tt = { ...t, w };
      const a = archWalk(arch, s + w * 0.5);
      s += w + 0.0003;
      const Zo = [a.t[1] * side, 0, -a.t[0]]; // outward (labial / buccal)
      const Z = vnorm([Zo[0], 0, Zo[2]]);
      const tilt = !lower && i < 2 ? 0.2 : lower && i < 2 ? -0.12 : 0;
      const Y = vnorm([Z[0] * tilt, 1, Z[2] * tilt]);
      const Xr = vnorm(vcross(Y, Z));
      const Zr = vcross(Xr, Y);
      const c = [a.p[0] * side, yC + (lower ? 0.0003 : 0) + (i >= 5 ? (lower ? -0.0006 : 0.0006) : 0), a.p[1]];
      out.push({ mesh: toothMesh(tt, lower), xf: xformMake([Xr, Y, Zr], 1, c), center: c });
    });
  }
  return out;
}

function skullSdf() {
  const s = new Sdf();
  s.name = 'skull';
  // cranial vault (hollowed below)
  s.ell([0, 1.707, -0.014], [0.0655, 0.075, 0.087], { k: 0.015 });
  s.ell([0, 1.713, 0.02], [0.058, 0.063, 0.058], { k: 0.02 }); // frontal bone
  s.ell([0, 1.69, -0.06], [0.05, 0.052, 0.04], { k: 0.02 }); // occipital
  s.ell([0, 1.667, -0.018], [0.058, 0.038, 0.058], { k: 0.018 }); // temporal / cranial base
  // face block: maxilla and the frame of the orbits
  s.ell([0, 1.653, 0.047], [0.049, 0.041, 0.04], { k: 0.014 });
  s.ell([0, 1.627, 0.055], [0.035, 0.022, 0.028], { k: 0.012 }); // maxilla
  for (const sx of [1, -1]) {
    s.ell([sx * 0.055, 1.647, -0.02], [0.012, 0.017, 0.017], { k: 0.012 }); // temporal bone (petrous / ear)
    s.ell([sx * 0.05, 1.632, -0.027], [0.008, 0.013, 0.0095], { k: 0.01 }); // mastoid
    s.ell([sx * 0.046, 1.655, 0.05], [0.011, 0.011, 0.011], { k: 0.01 }); // zygomatic body
  }
  // orbits and nasal cavity
  for (const sx of [1, -1]) {
    s.cone([sx * 0.033, 1.672, 0.104], [sx * 0.024, 1.668, 0.061], 0.0205, 0.0085, { op: 's', k: 0.006 });
    s.ell([sx * 0.0345, 1.6705, 0.086], [0.0212, 0.018, 0.017], { op: 's', k: 0.005 });
    s.ell([sx * 0.03, 1.638, 0.079], [0.012, 0.0095, 0.0065], { op: 's', k: 0.008 }); // canine fossa
    s.cone([sx * 0.075, 1.656, -0.014], [sx * 0.05, 1.656, -0.014], 0.0042, 0.0035, { op: 's', k: 0.002 }); // ear canal
  }
  s.ell([0, 1.638, 0.088], [0.0118, 0.0172, 0.032], { op: 's', k: 0.004 }); // piriform aperture
  s.ell([0, 1.627, 0.086], [0.0142, 0.0098, 0.032], { op: 's', k: 0.004 });
  s.cyl([0, 1.636, -0.031], 0.0135, 0.012, 0.0165, { op: 's', k: 0.003 }); // foramen magnum
  // details added on top of the cavities
  for (const sx of [1, -1]) {
    s.cone([0, 1.6905, 0.083], [sx * 0.049, 1.6865, 0.066], 0.0052, 0.0042, { k: 0.011 }); // brow ridge
    s.cone([sx * 0.049, 1.6865, 0.066], [sx * 0.048, 1.656, 0.057], 0.0038, 0.0038, { k: 0.01 }); // lateral orbital rim
    s.cone([sx * 0.046, 1.6555, 0.059], [sx * 0.016, 1.6555, 0.083], 0.0032, 0.0028, { k: 0.01 }); // infraorbital rim
    s.cone([sx * 0.053, 1.6535, 0.043], [sx * 0.0645, 1.652, -0.006], 0.0052, 0.0044, { k: 0.008 }); // zygomatic arch
    s.ell([sx * 0.024, 1.629, 0.067], [0.009, 0.012, 0.007], { k: 0.008 }); // canine eminence
  }
  s.cone([0, 1.677, 0.0895], [0, 1.6565, 0.0955], 0.0058, 0.0042, { k: 0.005 }); // nasal bones
  s.box([0, 1.632, 0.064], [0.0008, 0.011, 0.012], { rad: 0.0006, k: 0.002 }); // septum
  s.cone([0, 1.6195, 0.0905], [0, 1.6205, 0.08], 0.0018, 0.003, { k: 0.004 }); // anterior nasal spine
  // alveolar process (upper tooth row) and palate
  const arch = [0, 2, 4, 6, 7].map((i) => [UPPER_ARCH[i][0], 1.616, UPPER_ARCH[i][1] - 0.001]);
  const full = [...arch.slice(1).reverse().map(vmir), ...arch];
  s.chain(full, full.map((p) => 0.0068 + 0.0012 * clamp(Math.abs(p[0]) / 0.03, 0, 1)), { k: 0.006 });
  s.ell([0, 1.6205, 0.044], [0.024, 0.0045, 0.027], { k: 0.006 });
  s.lip = 1.25;
  return s;
}

/** the cranial cavity (inner table of the vault), meshed inverted so it faces inward */
function cavitySdf() {
  const s = new Sdf();
  s.name = 'cavity';
  const t = 0.0062;
  s.ell([0, 1.707, -0.014], [0.0655 - t, 0.075 - t, 0.087 - t], { k: 0.015 });
  s.ell([0, 1.713, 0.02], [0.058 - t, 0.063 - t, 0.058 - t], { k: 0.02 });
  s.ell([0, 1.69, -0.06], [0.05 - t, 0.052 - t, 0.04 - t], { k: 0.02 });
  s.ell([0, 1.667, -0.018], [0.058 - t, 0.038 - t, 0.058 - t], { k: 0.018 });
  s.invert = true;
  s.lip = 1.2;
  return s;
}

function mandibleSdf() {
  const s = new Sdf();
  s.name = 'mandible';
  const arch = lowerArch();
  const path = [...arch, [0.035, -0.006], [0.041, -0.012], [0.046, -0.018]];
  const n = path.length;
  const at = (i) => {
    const [x, z] = path[i];
    const u = i / (n - 1);
    return { x, z, top: 1.5935 + 0.0035 * u - (i >= arch.length ? (i - arch.length + 1) * 0.0045 : 0), bot: 1.565 + 0.016 * u };
  };
  const idx = [0, 2, 4, 6, 8, 10];
  for (const sx of [1, -1]) {
    // body: a chain of upright ellipsoids along the arch, a thicker rounded lower border
    for (const i of idx) {
      if (i === 0 && sx < 0) continue;
      const a = at(i), nb = at(Math.min(i + 1, n - 1)), pb = at(Math.max(i - 1, 0));
      const tan = vnorm([sx * (nb.x - pb.x), 0, nb.z - pb.z]);
      const out = vcross([0, 1, 0], tan);
      s.ell([sx * a.x, (a.top + a.bot) * 0.5, a.z], [i === 0 ? 0.014 : 0.0105, (a.top - a.bot) * 0.5, 0.0052], { k: 0.009, y: [0, 1, 0], z: out });
    }
    s.chain(idx.map((i) => [sx * at(i).x, at(i).bot + 0.0048, at(i).z]), idx.map((i) => 0.0054 - 0.0004 * (i / n)), { k: 0.007 });
    // ramus up to the condyle and the coronoid process
    const ang = [sx * 0.0465, 1.585, -0.02];
    const cond = [sx * 0.0505, 1.642, -0.012];
    const notch = [sx * 0.049, 1.632, 0.0];
    const coro = [sx * 0.0455, 1.646, 0.012];
    const ant = [sx * 0.0405, 1.598, 0.012];
    s.tri(ang, cond, notch, 0.0026, { k: 0.006 });
    s.tri(ang, notch, coro, 0.0026, { k: 0.006 });
    s.tri(ang, coro, ant, 0.0026, { k: 0.006 });
    s.cone(ang, cond, 0.0045, 0.0042, { k: 0.006 });
    s.cone(coro, ant, 0.0028, 0.0042, { k: 0.006 });
    s.ell([sx * 0.0515, 1.6505, -0.013], [0.0095, 0.0052, 0.0055], { k: 0.005 }); // condyle head
  }
  s.ell([0, 1.5705, 0.0705], [0.0125, 0.0085, 0.006], { k: 0.008 }); // chin
  s.lip = 1.25;
  return s;
}

function brainSdf() {
  const s = new Sdf();
  s.name = 'brain';
  for (const sx of [1, -1]) {
    s.ell([sx * 0.0282, 1.71, -0.013], [0.0285, 0.0585, 0.0755], { k: 0.012 }); // hemisphere
    s.ell([sx * 0.025, 1.7, 0.03], [0.024, 0.036, 0.026], { k: 0.016 }); // frontal lobe
    s.ell([sx * 0.036, 1.668, -0.004], [0.014, 0.019, 0.036], { k: 0.016 }); // temporal lobe
    s.ell([sx * 0.024, 1.698, -0.066], [0.024, 0.037, 0.022], { k: 0.016 }); // occipital lobe
  }
  s.box([0, 1.748, -0.013], [0.0013, 0.034, 0.082], { op: 's', k: 0.003, rad: 0.0008 }); // longitudinal fissure
  s.ell([0, 1.656, -0.055], [0.04, 0.0185, 0.025], { k: 0.012 }); // cerebellum
  s.cone([0, 1.672, -0.03], [0, 1.618, -0.04], 0.0115, 0.0092, { k: 0.008 }); // brainstem
  s.lip = 1.2;
  return s;
}



function nearestSite(sites, c) {
  let b = 0, bd = Infinity;
  sites.forEach((s, i) => {
    const d = (s[0] - c[0]) ** 2 + (s[1] - c[1]) ** 2 + (s[2] - c[2]) ** 2;
    if (d < bd) {
      bd = d;
      b = i;
    }
  });
  return b;
}

function meshSkull(T) {
  T._skull = meshSdf(skullSdf(), 0.0022, { aoRadius: 0.014, aoStrength: 1.45 });
}

function buildSkull(T, bones) {
  const P = T.pieces;
  // cranium + face: Voronoi pre-fracture
  const skull = T._skull || meshSdf(skullSdf(), 0.0022, { aoRadius: 0.014, aoStrength: 1.45 });
  delete T._skull;
  // sites on the outer table only, so each cell holds the outer and inner surface above each other
  const outer = (x, y, z, i) => {
    const n = skull.nrm;
    return n[i * 3] * x + n[i * 3 + 1] * (y - 1.69) + n[i * 3 + 2] * (z + 0.01) > 0.012 * Math.hypot(x, y - 1.69, z + 0.01) * 4;
  };
  const vc = voronoiCells(skull, 0.019, 11, outer, 0.32);
  const skullPieces = vc.sites.map((s, i) => P.add('head', 'skull', { cell: i }));
  bones.add(skull, Int32Array.from(vc.triCell, (c) => skullPieces[c]), C_BONE, BM_SKULL);
  // inner table: coarser (only seen through the breaks), cut by the same cells
  const cav = meshSdf(cavitySdf(), 0.0034, { aoRadius: 0.01 });
  const cc = voronoiCells(cav, 0.019, 11, null, 0.32, vc.sites);
  bones.add(cav, Int32Array.from(cc.triCell, (c) => skullPieces[c]), [0.84, 0.76, 0.66], BM_SKULL);
  for (const t of teethSet(false)) bones.add(t.mesh, skullPieces[nearestSite(vc.sites, t.center)], C_TOOTH, BM_TOOTH, t.xf);
  T.skull = { ...T.skull, pieces: skullPieces, adj: vc.adj };
}

function buildJaw(T, bones) {
  const P = T.pieces;
  const mand = meshSdf(mandibleSdf(), 0.002, { aoRadius: 0.008 });
  const mc = voronoiCells(mand, 0.024, 23, null, 0.3);
  const mandPieces = mc.sites.map((s, i) => P.add('head', 'jaw', { cell: i }));
  bones.add(mand, Int32Array.from(mc.triCell, (c) => mandPieces[c]), C_BONE, BM_SKULL);
  for (const t of teethSet(true)) bones.add(t.mesh, mandPieces[nearestSite(mc.sites, t.center)], C_TOOTH, BM_TOOTH, t.xf);
  T.skull = { ...T.skull, jaw: mandPieces, jawAdj: mc.adj };
}

function buildBrain(T, organs) {
  const P = T.pieces;
  const brain = meshSdf(brainSdf(), 0.0023, { aoRadius: 0.006, aoStrength: 1.4 });
  // gyri: carve worm-like sulci (a level set of value noise) into the cerebrum, darker inside
  {
    const { pos, nrm, ao } = brain;
    for (let i = 0; i < pos.length / 3; i++) {
      const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      const cereb = smooth01((y - 1.648) / 0.012) * (1 - smooth01((Math.abs(x) - 0.0035) / -0.002));
      const g = grooveDepth(x, y, z, 0.0026, 56, 0.34, 5, 0.3) * cereb;
      pos[i * 3] -= nrm[i * 3] * g;
      pos[i * 3 + 1] -= nrm[i * 3 + 1] * g;
      pos[i * 3 + 2] -= nrm[i * 3 + 2] * g;
      ao[i] *= 1 - 0.55 * (g / 0.0026);
    }
    faceNormals(brain);
  }
  const bc = voronoiCells(brain, 0.026, 31, null, 0.35);
  const brainPieces = bc.sites.map((s, i) => P.add('head', 'brain', { cell: i }));
  organs.add(brain, Int32Array.from(bc.triCell, (c) => brainPieces[c]), [0.83, 0.62, 0.6], OM.brain);
  T.brain = { pieces: brainPieces, adj: bc.adj };
}

// ---------------- shared helpers for pre-cut pieces ----------------

const LM = (n) => {
  const v = landmark(n);
  return [v.x, v.y, v.z];
};
const zigzag = (x) => (2 / Math.PI) * Math.asin(Math.sin(x));

/** two unit vectors perpendicular to d */
function perpBasis(d) {
  const a = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const e1 = vnorm(vcross(d, a));
  const e2 = vcross(d, e1);
  return [e1, e2];
}

/**
 * Cut a mesh into sections along the axis A->B at parameters `bounds` (0..1), each border
 * zig-zagging round the axis (jag metres). Returns a per-triangle section index.
 */
function sectionTris(mesh, A, B, bounds, jag, seed) {
  const ax = vsub(B, A), L = vlen(ax), d = vmul(ax, 1 / L);
  const [e1, e2] = perpBasis(d);
  const cen = triCentroids(mesh);
  const nt = cen.length / 3;
  const out = new Int32Array(nt);
  const teeth = 3 + (seed % 2);
  for (let t = 0; t < nt; t++) {
    const rx = cen[t * 3] - A[0], ry = cen[t * 3 + 1] - A[1], rz = cen[t * 3 + 2] - A[2];
    const u = (rx * d[0] + ry * d[1] + rz * d[2]) / L;
    const th = Math.atan2(rx * e2[0] + ry * e2[1] + rz * e2[2], rx * e1[0] + ry * e1[1] + rz * e1[2]);
    let s = 0;
    const jr = (jag / L) * 1.4;
    for (let k = 0; k < bounds.length; k++) {
      let b = bounds[k];
      if (Math.abs(u - b) < jr) b += (jag / L) * (zigzag(th * teeth + k * 1.93 + seed) + 0.35 * Math.sin(th * 7 + k * 3.1 + seed));
      if (u > b) s = k + 1;
    }
    out[t] = s;
  }
  return out;
}

/** add a left-side mesh and its mirror image, with pieces per side made by mk(side) */
function addMirrored(bones, mesh, triIdx, mk, color, mat) {
  for (const side of ['L', 'R']) {
    const ids = mk(side);
    const tp = typeof triIdx === 'number' ? ids[triIdx] : Int32Array.from(triIdx, (k) => ids[k]);
    bones.add(mesh, tp, color, mat, side === 'R' ? MIRROR : null);
  }
}

// ---------------- spine ----------------

function spineLevels() {
  const out = [];
  const add = (name, seg, type, y, z, s) => out.push({ name, seg, type, c: [0, y, z], s });
  for (let i = 0; i < 7; i++) {
    const u = i / 6;
    add('C' + (i + 1), 'neck', 'C', 1.611 - 0.1225 * u, -0.0235 - 0.0135 * u, 0.9 + 0.16 * u);
  }
  for (let i = 0; i < 12; i++) {
    const u = i / 11;
    add('T' + (i + 1), 'chest', 'T', 1.4615 - 0.2505 * u, -0.0462 - 0.0118 * u - 0.004 * Math.sin(u * Math.PI), 0.82 + 0.4 * u);
  }
  for (let i = 0; i < 5; i++) {
    const u = i / 4;
    add('L' + (i + 1), 'abdomen', 'L', 1.1805 - 0.1335 * u, -0.0555 + 0.0045 * u, 0.92 + 0.12 * u);
  }
  for (let i = 0; i < out.length; i++) {
    const a = out[Math.max(i - 1, 0)].c, b = out[Math.min(i + 1, out.length - 1)].c;
    out[i].up = vnorm(vsub(a, b));
  }
  return out;
}

/** vertebra template in its own frame: body centre at the origin, +Y up, +Z anterior */
function vertebraSdf(type) {
  const s = new Sdf();
  s.name = 'vertebra';
  if (type === 'L') {
    s.cyl([0, 0, 0], 0.0205, 0.0103, 0.015, { rad: 0.0026, k: 0.003 });
    s.ell([0, 0, -0.0215], [0.008, 0.02, 0.0065], { op: 's', k: 0.004 });
    for (const sx of [1, -1]) {
      s.cone([sx * 0.0102, 0.003, -0.012], [sx * 0.0114, 0.004, -0.0265], 0.0047, 0.0044, { k: 0.004 });
      s.cone([sx * 0.0114, 0.003, -0.0275], [0, 0.0005, -0.0355], 0.0042, 0.0044, { k: 0.004 });
      s.cone([sx * 0.0118, 0.0045, -0.0245], [sx * 0.0375, 0.005, -0.0285], 0.0038, 0.0026, { k: 0.004 }); // transverse
      s.ell([sx * 0.0128, 0.0125, -0.0305], [0.0038, 0.0058, 0.0042], { k: 0.003 }); // superior articular
      s.ell([sx * 0.0092, -0.0115, -0.0365], [0.0034, 0.005, 0.0038], { k: 0.003 }); // inferior articular
    }
    s.box([0, -0.0015, -0.0435], [0.0027, 0.0082, 0.0085], { rad: 0.0021, k: 0.004 }); // spinous process
  } else if (type === 'T') {
    s.cyl([0, 0, 0], 0.0142, 0.0068, 0.0132, { rad: 0.002, k: 0.003 });
    for (const sx of [1, -1]) {
      s.cone([sx * 0.0088, 0.0025, -0.009], [sx * 0.0098, 0.0035, -0.0195], 0.0034, 0.0034, { k: 0.003 });
      s.cone([sx * 0.0098, 0.003, -0.0205], [0, 0.0, -0.0295], 0.0034, 0.0036, { k: 0.003 });
      s.cone([sx * 0.0096, 0.004, -0.0185], [sx * 0.0255, 0.0062, -0.0295], 0.0042, 0.0037, { k: 0.003 }); // transverse
      s.ell([sx * 0.0255, 0.0062, -0.0295], [0.0042, 0.0042, 0.0042], { k: 0.002 });
      s.ell([sx * 0.0092, 0.0095, -0.0215], [0.0032, 0.0042, 0.0032], { k: 0.003 }); // articular
    }
    s.cone([0, 0.0, -0.0285], [0, -0.0185, -0.0455], 0.0037, 0.0026, { k: 0.004 }); // spinous (slopes down)
    s.ell([0, -0.019, -0.046], [0.0034, 0.0042, 0.0032], { k: 0.003 });
  } else {
    s.cyl([0, 0, 0], 0.0083, 0.0054, 0.0074, { rad: 0.0015, k: 0.0025 });
    for (const sx of [1, -1]) {
      s.cone([sx * 0.0062, 0.001, -0.0055], [sx * 0.0102, 0.0012, -0.0125], 0.0027, 0.0027, { k: 0.0025 });
      s.cone([sx * 0.0102, 0.001, -0.0135], [0, -0.0005, -0.021], 0.0027, 0.0029, { k: 0.0025 });
      s.ell([sx * 0.0122, 0.0, -0.0128], [0.0038, 0.0068, 0.0045], { k: 0.003 }); // articular pillar
      s.cone([sx * 0.0068, 0.0, -0.0035], [sx * 0.0215, -0.0012, -0.0065], 0.0034, 0.0028, { k: 0.003 }); // transverse
      s.cyl([sx * 0.0142, 0, -0.0048], 0.0024, 0.006, 0.0024, { op: 's', k: 0.001 }); // transverse foramen
    }
    s.cone([0, -0.0005, -0.0205], [0, -0.0052, -0.0305], 0.0029, 0.0024, { k: 0.003 }); // spinous
    for (const sx of [1, -1]) s.ell([sx * 0.0032, -0.0058, -0.0315], [0.0026, 0.0026, 0.0026], { k: 0.002 }); // bifid tip
  }
  s.lip = 1.2;
  return s;
}

function discSdf(type) {
  const s = new Sdf();
  s.name = 'disc';
  const d = type === 'L' ? [0.0205, 0.0045, 0.015] : type === 'T' ? [0.0142, 0.0032, 0.0132] : [0.0083, 0.0035, 0.0074];
  s.cyl([0, 0, 0], d[0] * 0.98, d[1], d[2] * 0.98, { rad: 0.0012, k: 0.002 });
  return s;
}

function buildSpine(T, bones) {
  const P = T.pieces;
  const levels = spineLevels();
  const tmpl = {}, disc = {};
  for (const t of ['C', 'T', 'L']) {
    tmpl[t] = meshSdf(vertebraSdf(t), t === 'C' ? 0.0014 : t === 'T' ? 0.0017 : 0.002, { aoRadius: 0.006, aoStrength: 1.2 });
    disc[t] = meshSdf(discSdf(t), 0.0019, { aoRadius: 0.004 });
  }
  T.spine = [];
  levels.forEach((lv, i) => {
    const [X, Y, Z] = frameRows(lv.up, [0, 0, 1]);
    const sc = [lv.s, 1, lv.s];
    const id = P.add(lv.seg, 'vert', { level: lv.name });
    bones.add(tmpl[lv.type], id, C_BONE, BM_BONE, xformMake([X, Y, Z], sc, lv.c));
    const nxt = levels[i + 1];
    if (nxt) {
      const mid = vlerp(lv.c, nxt.c, 0.5);
      const [X2, Y2, Z2] = frameRows(vnorm(vsub(lv.c, nxt.c)), [0, 0, 1]);
      const gap = vlen(vsub(lv.c, nxt.c));
      const bodyH = lv.type === 'L' ? 0.0258 : lv.type === 'T' ? 0.0176 : 0.0138;
      const dh = (gap - bodyH * 0.5 - (nxt.type === 'L' ? 0.0258 : nxt.type === 'T' ? 0.0176 : 0.0138) * 0.5) / (lv.type === 'L' ? 0.0114 : lv.type === 'T' ? 0.0088 : 0.0094);
      const s2 = (lv.s + nxt.s) * 0.5;
      bones.add(disc[nxt.type === lv.type ? lv.type : nxt.type], id, C_CART, BM_CART, xformMake([X2, Y2, Z2], [s2, clamp(dh, 0.3, 1.6), s2], mid));
    }
    T.spine.push({ name: lv.name, seg: lv.seg, piece: id, c: lv.c });
  });
  return levels;
}

// ---------------- rib cage ----------------

const RIBS = [
  // a (half width), b (half depth), zc, end angle, drop, wall tilt (flat faces turn upward)
  [0.058, 0.05, -0.035, 2.35, 0.03, 1.5],
  [0.086, 0.063, -0.03, 2.4, 0.042, 0.65],
  [0.104, 0.07, -0.027, 2.45, 0.052, 0.38],
  [0.117, 0.075, -0.025, 2.45, 0.06, 0.25],
  [0.126, 0.078, -0.024, 2.4, 0.066, 0.16],
  [0.131, 0.079, -0.023, 2.35, 0.07, 0.1],
  [0.134, 0.079, -0.023, 2.25, 0.073, 0.05],
  [0.134, 0.078, -0.024, 2.1, 0.073, 0.0],
  [0.131, 0.076, -0.026, 1.95, 0.068, -0.03],
  [0.124, 0.073, -0.029, 1.8, 0.062, -0.05],
  [0.112, 0.07, -0.033, 1.45, 0.042, -0.06],
  [0.095, 0.066, -0.038, 1.1, 0.028, -0.06],
];
const STERNUM_Y = [1.428, 1.402, 1.376, 1.35, 1.324, 1.299, 1.276];
const sternumZ = (y) => 0.024 + (1.44 - y) * 0.17;

/** centreline of rib i (1..12), left side, from the head to the costochondral end */
function ribCentre(i, levels) {
  const [a, b, zc, th1, drop] = RIBS[i - 1];
  const v = levels[7 + i - 1].c; // T_i body
  const y0 = v[1] + 0.004, zv = v[2];
  const pts = [[0.0152, y0, zv + 0.001], [0.0285, y0 - 0.001, zv - 0.0175]];
  const tha = Math.asin(clamp(0.05 / a, 0, 0.95));
  const n = 18;
  for (let k = 0; k <= n; k++) {
    const th = tha + ((th1 - tha) * k) / n;
    const s = smooth01(k / n);
    const y = y0 - 0.006 - drop * (0.15 * (k / n) + 0.85 * s);
    pts.push([a * Math.sin(th), y, zc - b * Math.cos(th)]);
  }
  return resample(catmull(pts, 80), 0.004).pts;
}

function cartilagePath(p0, t0, p1, t1) {
  const d = vlen(vsub(p1, p0));
  const c1 = vax(p0, t0, d * 0.38), c2 = vax(p1, t1, -d * 0.38);
  const pts = [];
  for (let k = 0; k <= 16; k++) {
    const t = k / 16, u = 1 - t;
    pts.push(vadd(vadd(vmul(p0, u * u * u), vmul(c1, 3 * u * u * t)), vadd(vmul(c2, 3 * u * t * t), vmul(p1, t * t * t))));
  }
  return resample(pts, 0.004).pts;
}

function sternumSdf() {
  const s = new Sdf();
  s.name = 'sternum';
  s.box([0, 1.423, 0.026], [0.024, 0.0195, 0.0052], { rad: 0.003, k: 0.004, y: [0, 1, -0.28] }); // manubrium
  s.ell([0, 1.4465, 0.026], [0.0085, 0.006, 0.012], { op: 's', k: 0.004 }); // jugular notch
  s.box([0, 1.336, 0.0435], [0.0145, 0.064, 0.0046], { rad: 0.003, k: 0.006, y: [0, 1, -0.17] }); // body
  s.ell([0, 1.298, 0.049], [0.0175, 0.034, 0.0052], { k: 0.01 });
  s.ell([0, 1.402, 0.0372], [0.0175, 0.004, 0.0058], { k: 0.004 }); // sternal angle
  s.cone([0, 1.27, 0.052], [0, 1.238, 0.05], 0.0062, 0.0032, { k: 0.006 }); // xiphoid
  s.lip = 1.2;
  return s;
}

function buildRibcage(T, bones, levels) {
  const P = T.pieces;
  T.ribs = { L: [], R: [] };
  const NS = 10;
  const out = (p, tilt) => {
    const hz = vnorm([p[0], 0, p[2] + 0.025]);
    return vnorm([hz[0], tilt, hz[2]]);
  };
  const cartEnds = { L: [], R: [] };
  for (let i = 1; i <= 12; i++) {
    const tilt = RIBS[i - 1][5];
    const base = ribCentre(i, levels);
    for (const side of ['L', 'R']) {
      const sx = side === 'L' ? 1 : -1;
      const path = base.map((p) => [p[0] * sx, p[1], p[2]]);
      const wMax = i === 1 ? 0.0068 : i >= 11 ? 0.0044 : 0.0056 - 0.0001 * Math.abs(i - 6);
      const tMax = i === 1 ? 0.0023 : 0.0021;
      const prof = (u) => {
        const head = smooth01((u - 0.02) / 0.16);
        let w = 0.0036 + (wMax - 0.0036) * head, t = 0.0034 + (tMax - 0.0034) * head;
        if (i >= 11) w *= 1 - 0.45 * smooth01((u - 0.7) / 0.3);
        return [w * (1 + 0.12 * smooth01((u - 0.6) / 0.4)), t];
      };
      const mesh = sweep(path, prof, { segs: 10, out: (p, Tn, u) => out(p, tilt * Math.min(1, 0.35 + u)), cap1: i >= 11 });
      // sections along the rib with jagged borders
      const nt = mesh.tri.length / 3;
      const ids = [];
      for (let k = 0; k < NS; k++) ids.push(P.add('chest', 'rib', { rib: i, side, sec: k }));
      const tp = new Int32Array(nt);
      const len = path.length;
      for (let t = 0; t < nt; t++) {
        let u = 0, an = 0;
        for (let q = 0; q < 3; q++) {
          const vi = mesh.tri[t * 3 + q];
          u += mesh.u[vi];
          an += mesh.ang[vi];
        }
        u /= 3;
        an /= 3;
        let s = Math.min(NS - 1, Math.floor(u * NS));
        const kb = Math.round(u * NS);
        if (kb > 0 && kb < NS && Math.abs(u - kb / NS) < 0.03) s = u > kb / NS + 0.012 * zigzag(an * 2 + kb * 2.3 + i) * (40 / len) ? kb : kb - 1;
        tp[t] = ids[s];
      }
      bones.add(mesh, tp, C_BONE, BM_BONE);
      T.ribs[side][i] = { path, pieces: ids, ns: NS };
      // costal cartilage
      const pe = path[path.length - 1];
      const te = vnorm(vsub(pe, path[path.length - 3]));
      cartEnds[side][i] = { pe, te };
    }
  }
  // cartilages: ribs 1-7 to the sternum, 8-10 join the cartilage above
  const cartId = P.add('chest', 'cartilage');
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? 1 : -1;
    const paths = [];
    for (let i = 1; i <= 10; i++) {
      const { pe, te } = cartEnds[side][i];
      let p1, t1;
      if (i <= 7) {
        const y = STERNUM_Y[i - 1];
        p1 = [sx * (i === 1 ? 0.021 : 0.0145), y, sternumZ(y) - 0.002];
        t1 = vnorm([-sx, i >= 5 ? 0.45 : 0.1, 0.15]);
      } else {
        const prev = paths[i - 2];
        p1 = prev[Math.floor(prev.length * (i === 8 ? 0.45 : 0.55))];
        t1 = vnorm([-sx * 0.6, 0.8, 0.2]);
      }
      const path = cartilagePath(pe, te, p1, t1);
      paths.push(path);
      const r0 = i === 1 ? 0.0068 : 0.0058;
      const mesh = sweep(path, (u) => [r0 * (1 - 0.15 * u), 0.0033], { segs: 8, out: (p) => vnorm([p[0], 0, p[2] + 0.025]) });
      bones.add(mesh, cartId, C_CART, BM_CART);
    }
  }
  // sternum
  const st = meshSdf(sternumSdf(), 0.0024, { aoRadius: 0.006 });
  const stIds = [P.add('chest', 'sternum', { cell: 0 }), P.add('chest', 'sternum', { cell: 1 }), P.add('chest', 'sternum', { cell: 2 })];
  const stSec = sectionTris(st, [0, 1.45, 0.025], [0, 1.24, 0.05], [0.28, 0.62], 0.004, 3);
  bones.add(st, Int32Array.from(stSec, (k) => stIds[k]), C_BONE, BM_BONE);
  T.sternum = stIds;
  // clavicles (S-curve, flattened laterally)
  const cl = [[0.024, 1.448, 0.019], [0.06, 1.4525, 0.0245], [0.1, 1.4575, 0.012], [0.135, 1.462, -0.009], [0.16, 1.4655, -0.024], [0.172, 1.467, -0.03]];
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? 1 : -1;
    const path = resample(catmull(cl.map((p) => [p[0] * sx, p[1], p[2]]), 40), 0.004).pts;
    const mesh = sweep(path, (u) => [0.0064 + 0.0034 * smooth01((u - 0.55) / 0.45), 0.0058 - 0.0018 * smooth01((u - 0.5) / 0.5)], { segs: 10, out: () => [0, 1, 0] });
    const ids = [0, 1, 2, 3].map((k) => P.add('chest', 'clavicle', { side, sec: k }));
    const sec = sectionTris(mesh, path[0], path[path.length - 1], [0.3, 0.52, 0.74], 0.005, side === 'L' ? 5 : 6);
    bones.add(mesh, Int32Array.from(sec, (k) => ids[k]), C_BONE, BM_BONE);
    T['clavicle' + side] = { ids, a: path[0], b: path[path.length - 1], bounds: [0.3, 0.52, 0.74] };
  }
}

// ---------------- scapula, pelvis ----------------

function scapulaSdf() {
  const s = new Sdf();
  s.name = 'scapula';
  const sup = [0.062, 1.442, -0.094], inf = [0.094, 1.292, -0.094], lat = [0.14, 1.414, -0.064];
  const mid = [0.09, 1.38, -0.1];
  s.tri(sup, inf, mid, 0.0025, { k: 0.004 });
  s.tri(inf, lat, mid, 0.0025, { k: 0.004 });
  s.tri(lat, sup, mid, 0.0025, { k: 0.004 });
  s.cone(sup, inf, 0.0028, 0.0034, { k: 0.004 }); // medial border
  s.cone(inf, lat, 0.0042, 0.0062, { k: 0.005 }); // lateral border
  s.cone(sup, [0.124, 1.438, -0.07], 0.0026, 0.0034, { k: 0.004 }); // superior border
  // spine of the scapula and acromion
  const sp0 = [0.064, 1.396, -0.1], sp1 = [0.152, 1.446, -0.078];
  s.tri(sp0, sp1, [0.14, 1.425, -0.074], 0.0026, { k: 0.004 });
  s.cone([0.064, 1.396, -0.104], [0.152, 1.448, -0.084], 0.0032, 0.0046, { k: 0.004 });
  s.box([0.168, 1.4615, -0.052], [0.0115, 0.0032, 0.017], { rad: 0.003, k: 0.006, y: [0, 1, 0], z: [0.55, 0, 0.85] }); // acromion
  // glenoid cup and coracoid
  s.ell([0.15, 1.424, -0.05], [0.0075, 0.0175, 0.013], { k: 0.008 });
  s.ell(LM('shoulderL'), [0.0236, 0.0236, 0.0236], { op: 's', k: 0.002 });
  s.chain([[0.124, 1.44, -0.064], [0.136, 1.448, -0.036], [0.148, 1.438, -0.016]], [0.0048, 0.0042, 0.0036], { k: 0.004 });
  s.lip = 1.25;
  return s;
}

function hipBoneSdf() {
  const s = new Sdf();
  s.name = 'hipBone';
  const H = LM('hipL');
  // acetabulum: a cup open laterally
  s.ell([0.073, 0.929, -0.002], [0.026, 0.031, 0.031], { k: 0.008 });
  // ilium: webbed fan from the acetabulum up to the iliac crest
  const psis = [0.046, 1.0, -0.088], cb = [0.088, 1.026, -0.069], ct = [0.12, 1.031, -0.036], cf = [0.132, 1.018, 0.0], asis = [0.121, 0.99, 0.038];
  const b1 = [0.082, 0.952, -0.026], b2 = [0.096, 0.953, 0.012], si = [0.052, 0.968, -0.074];
  for (const [a, b, c] of [[b1, si, psis], [b1, psis, cb], [b1, cb, ct], [b1, ct, b2], [b2, ct, cf], [b2, cf, asis]]) s.tri(a, b, c, 0.0031, { k: 0.007 });
  s.chain([psis, cb, ct, cf, asis], [0.0052, 0.0058, 0.0062, 0.0058, 0.0055], { k: 0.005 }); // iliac crest
  s.cone(si, psis, 0.0075, 0.0058, { k: 0.006 });
  s.ell([0.05, 0.968, -0.072], [0.008, 0.02, 0.013], { k: 0.008 }); // auricular surface
  s.chain([si, [0.062, 0.94, -0.052], [0.064, 0.906, -0.045]], [0.0068, 0.0058, 0.0042], { k: 0.006 }); // sciatic notch border
  s.chain([asis, [0.108, 0.962, 0.034], [0.092, 0.944, 0.026]], [0.005, 0.0055, 0.0065], { k: 0.006 }); // anterior border
  s.cone([0.082, 0.95, -0.02], [0.08, 0.905, -0.022], 0.012, 0.011, { k: 0.008 }); // body of ilium / ischium
  // ischium, rami and pubis around the obturator foramen
  const tub = [0.063, 0.857, -0.04], ir = [0.038, 0.848, 0.008], sym = [0.0065, 0.878, 0.046];
  s.cone([0.075, 0.905, -0.03], tub, 0.0095, 0.0115, { k: 0.007 });
  s.cone(tub, ir, 0.0085, 0.0058, { k: 0.006 });
  s.cone(ir, sym, 0.0058, 0.0066, { k: 0.006 });
  s.chain([[0.08, 0.92, 0.024], [0.05, 0.906, 0.044], [0.018, 0.893, 0.05]], [0.0085, 0.0074, 0.0078], { k: 0.007 }); // superior ramus
  s.ell([0.018, 0.884, 0.048], [0.0115, 0.017, 0.0085], { k: 0.007 }); // pubic body
  s.ell(H, [0.0248, 0.0248, 0.0248], { op: 's', k: 0.002 }); // socket
  s.lip = 1.25;
  return s;
}

function sacrumSdf() {
  const s = new Sdf();
  s.name = 'sacrum';
  s.cyl([0, 1.006, -0.062], 0.021, 0.0075, 0.0145, { rad: 0.002, k: 0.004, y: [0, 1, 0.45] }); // S1 body
  for (const sx of [1, -1]) s.ell([sx * 0.033, 0.998, -0.071], [0.021, 0.016, 0.019], { k: 0.01 }); // alae
  s.tri([-0.044, 0.996, -0.075], [0.044, 0.996, -0.075], [0, 0.89, -0.097], 0.0062, { k: 0.008 });
  s.ell([0, 0.955, -0.084], [0.03, 0.04, 0.0075], { k: 0.01 });
  s.cone([0, 0.99, -0.087], [0, 0.912, -0.1], 0.0032, 0.0028, { k: 0.004 }); // median crest
  for (let k = 0; k < 4; k++) for (const sx of [1, -1]) s.ell([sx * 0.0148, 0.984 - k * 0.025, -0.0835 - k * 0.0045], [0.0038, 0.0038, 0.012], { op: 's', k: 0.002 }); // foramina
  s.chain([[0, 0.888, -0.096], [0, 0.868, -0.09], [0, 0.852, -0.079]], [0.0045, 0.0034, 0.002], { k: 0.003 }); // coccyx
  s.lip = 1.25;
  return s;
}

// ---------------- limbs ----------------

function femurSdf() {
  const s = new Sdf();
  s.name = 'femur';
  const H = LM('hipL');
  s.ell(H, [0.0236, 0.0236, 0.0236], { k: 0.004 }); // head
  s.cone(H, [0.118, 0.902, -0.003], 0.0158, 0.0172, { k: 0.008 }); // neck
  s.ell([0.1345, 0.9045, -0.01], [0.0118, 0.0215, 0.0158], { k: 0.01 }); // greater trochanter
  s.cone([0.134, 0.888, -0.018], [0.109, 0.869, -0.016], 0.0068, 0.006, { k: 0.006 }); // intertrochanteric crest
  s.ell([0.1035, 0.8665, -0.0135], [0.0068, 0.0088, 0.0068], { k: 0.006 }); // lesser trochanter
  s.chain([[0.124, 0.885, -0.004], [0.118, 0.76, 0.0065], [0.108, 0.62, 0.005], [0.1, 0.548, -0.002]], [0.0148, 0.0128, 0.0132, 0.0195], { k: 0.012 });
  s.cone([0.117, 0.8, -0.0115], [0.108, 0.625, -0.0095], 0.0042, 0.0042, { k: 0.008 }); // linea aspera
  s.ell([0.0785, 0.5235, -0.0065], [0.0142, 0.0198, 0.0255], { k: 0.01 }); // medial condyle
  s.ell([0.1175, 0.5235, -0.0065], [0.0142, 0.0188, 0.0245], { k: 0.01 }); // lateral condyle
  s.ell([0.098, 0.534, 0.0115], [0.0295, 0.0165, 0.0135], { k: 0.01 }); // patellar surface
  s.ell([0.098, 0.508, -0.019], [0.0078, 0.0125, 0.0145], { op: 's', k: 0.004 }); // intercondylar notch
  s.ell([0.098, 0.5355, 0.0265], [0.008, 0.012, 0.0045], { op: 's', k: 0.005 }); // trochlear groove
  s.lip = 1.2;
  return s;
}

function patellaSdf() {
  const s = new Sdf();
  s.name = 'patella';
  s.ell([0.098, 0.5225, 0.04], [0.0198, 0.0225, 0.0082], { k: 0.004, y: [0, 1, 0.15] });
  s.lip = 1.1;
  return s;
}

function shinSdf() {
  const s = new Sdf();
  s.name = 'shin';
  // tibia
  s.ell([0.096, 0.4845, -0.001], [0.0365, 0.0142, 0.0265], { k: 0.01 }); // plateau
  s.ell([0.097, 0.4965, 0.0], [0.006, 0.0045, 0.006], { k: 0.004 }); // intercondylar eminence
  s.ell([0.0985, 0.452, 0.0235], [0.0085, 0.0115, 0.0068], { k: 0.008 }); // tuberosity
  s.chain([[0.094, 0.47, 0.004], [0.0935, 0.36, 0.006], [0.095, 0.22, 0.0], [0.0985, 0.125, -0.009]], [0.0185, 0.0118, 0.0112, 0.0142], { k: 0.012 });
  s.cone([0.0935, 0.42, 0.0155], [0.0948, 0.2, 0.0115], 0.0038, 0.0038, { k: 0.007 }); // anterior crest
  s.ell([0.0995, 0.103, -0.0135], [0.0175, 0.0155, 0.0165], { k: 0.01 }); // distal tibia
  s.ell([0.0855, 0.0835, -0.0155], [0.0062, 0.0135, 0.0085], { k: 0.006 }); // medial malleolus
  // fibula
  s.ell([0.1245, 0.4615, -0.0165], [0.0085, 0.0095, 0.0085], { k: 0.005 });
  s.chain([[0.1245, 0.45, -0.0165], [0.1255, 0.3, -0.021], [0.1238, 0.11, -0.0265]], [0.0058, 0.0055, 0.0062], { k: 0.006 });
  s.ell([0.1245, 0.0805, -0.027], [0.0064, 0.0155, 0.0084], { k: 0.006 }); // lateral malleolus
  s.lip = 1.2;
  return s;
}

function armFrame() {
  const S = LM('shoulderL'), E = LM('elbowL'), W = LM('wristL');
  const u = vnorm(vsub(E, S)), f = vnorm(vsub(W, E));
  const lat = vnorm(vcross([0, 0, 1], u)); // elbow axis, toward the lateral side
  const fw = vnorm(vcross(u, lat)); // forward, perpendicular to the humerus
  const ff = vnorm(vsub([0, 0, 1], vmul(f, f[2]))); // forward, perpendicular to the forearm
  return { S, E, W, u, f, lat, fw, ff };
}

function humerusSdf() {
  const s = new Sdf();
  s.name = 'humerus';
  const { S, E, u, lat, fw } = armFrame();
  s.ell(vax(S, lat, -0.002), [0.0228, 0.0228, 0.0228], { k: 0.004 }); // head
  s.ell(vax(S, u, 0.013, lat, 0.015, fw, 0.006), [0.0095, 0.012, 0.0095], { k: 0.008, y: u }); // greater tubercle
  s.ell(vax(S, u, 0.019, fw, 0.016), [0.0062, 0.008, 0.0058], { k: 0.007, y: u }); // lesser tubercle
  s.chain([vax(S, u, 0.03), vax(S, u, 0.12, lat, 0.001), vax(E, u, -0.07), vax(E, u, -0.022)], [0.0125, 0.0108, 0.0105, 0.0135], { k: 0.01 });
  s.ell(vax(S, u, 0.105, lat, 0.0085), [0.0052, 0.016, 0.0055], { k: 0.008, y: u }); // deltoid tuberosity
  // distal end: trochlea + capitulum, epicondyles
  s.ell(vax(E, u, 0.002), [0.021, 0.0105, 0.0118], { k: 0.008, y: u, z: fw });
  s.ell(vax(E, lat, -0.0235, u, -0.004), [0.0072, 0.0072, 0.0068], { k: 0.007 }); // medial epicondyle
  s.ell(vax(E, lat, 0.0195, u, -0.004), [0.005, 0.0062, 0.0055], { k: 0.006 });
  s.ell(vax(E, u, -0.016, fw, -0.0105), [0.0075, 0.0105, 0.0055], { op: 's', k: 0.004, y: u }); // olecranon fossa
  s.lip = 1.2;
  return s;
}

function forearmSdf() {
  const s = new Sdf();
  s.name = 'forearm';
  const { E, W, f, ff, lat } = armFrame();
  // ulna (posterior, little-finger side)
  s.ell(vax(E, ff, -0.0105, f, -0.007), [0.0098, 0.0138, 0.0095], { k: 0.007, y: f }); // olecranon
  s.ell(vax(E, ff, 0.0085, f, 0.011), [0.0068, 0.0058, 0.0062], { k: 0.006 }); // coronoid
  s.chain([vax(E, ff, -0.005, f, 0.016), vax(E, ff, -0.008, f, 0.09), vax(W, ff, -0.0105, f, -0.012)], [0.0088, 0.0068, 0.0058], { k: 0.008 });
  s.ell(vax(W, ff, -0.011, f, -0.008), [0.0066, 0.0066, 0.0066], { k: 0.005 }); // ulnar head
  s.cone(vax(W, ff, -0.012, f, -0.006), vax(W, ff, -0.012, f, 0.002), 0.003, 0.0022, { k: 0.003 }); // styloid
  s.cyl(E, 0.0112, 0.03, 0.0112, { op: 's', k: 0.002, y: lat }); // trochlear notch
  // radius (thumb side, anterior in this pose)
  s.cyl(vax(E, ff, 0.0085, f, 0.011, lat, 0.004), 0.0105, 0.0042, 0.0105, { rad: 0.0012, k: 0.004, y: f }); // head
  s.chain([vax(E, ff, 0.0085, f, 0.02), vax(E, ff, 0.0098, f, 0.07), vax(W, ff, 0.0095, f, -0.04), vax(W, ff, 0.009, f, -0.012)], [0.0058, 0.0068, 0.0082, 0.0118], { k: 0.008 });
  s.ell(vax(W, ff, 0.0075, f, -0.0075), [0.0098, 0.0165, 0.0135], { k: 0.008, y: ff }); // distal radius
  s.lip = 1.2;
  return s;
}

function knobBone(s, a, b, r, k = 0.0025) {
  s.cone(a, b, r, r * 0.88, { k });
  s.ell(a, [r * 1.32, r * 1.32, r * 1.32], { k });
  s.ell(b, [r * 1.22, r * 1.22, r * 1.22], { k });
}

function handSdf() {
  const s = new Sdf();
  s.name = 'hand';
  const W = LM('wristL');
  const f = vnorm(vsub(LM('wristL'), LM('elbowL')));
  const eW = vnorm(vsub([0, 0, 1], vmul(f, f[2])));
  const eP = vnorm(vcross(f, eW));
  // carpals: two rows
  for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) {
    const w = -0.0135 + c * 0.009;
    s.ell(vax(W, f, 0.011 + r * 0.0145, eW, w, eP, 0.002), [0.0052, 0.0062, 0.0058], { k: 0.003 });
  }
  const fingers = [
    { w: 0.025, base: 0.095, l1: 0.043, l2: 0.048, r: 0.0039, spread: 0.06 },
    { w: 0.0085, base: 0.097, l1: 0.047, l2: 0.052, r: 0.004, spread: 0.0 },
    { w: -0.0085, base: 0.095, l1: 0.044, l2: 0.05, r: 0.0038, spread: -0.05 },
    { w: -0.0245, base: 0.088, l1: 0.034, l2: 0.04, r: 0.0034, spread: -0.12 },
  ];
  for (const fg of fingers) {
    const k0 = vax(W, f, fg.base, eW, fg.w);
    const mb = vax(W, f, 0.038, eW, fg.w * 0.55);
    knobBone(s, mb, vax(k0, f, -0.006), fg.r * 1.05); // metacarpal
    const d1 = vnorm(vax(f, eP, Math.sin(0.18), eW, fg.spread));
    const j1 = vax(k0, d1, fg.l1);
    const d2 = vnorm(vax(f, eP, Math.sin(0.62), eW, fg.spread * 0.6));
    const j2 = vax(j1, d2, fg.l2 * 0.55);
    const tip = vax(j1, d2, fg.l2 - 0.006);
    knobBone(s, vax(k0, d1, 0.002), vax(j1, d1, -0.0025), fg.r * 0.95);
    knobBone(s, vax(j1, d2, 0.0025), vax(j2, d2, -0.002), fg.r * 0.8);
    knobBone(s, vax(j2, d2, 0.002), tip, fg.r * 0.65);
  }
  // thumb
  const tb = vax(W, f, 0.024, eW, 0.022, eP, 0.006);
  const t1 = vax(tb, vnorm(vax(vmul(f, 0.8), eW, 0.45, eP, 0.35)), 0.04);
  const dt = vnorm(vax(vmul(f, 0.9), eW, 0.12, eP, 0.42));
  const t2 = vax(t1, dt, 0.048);
  knobBone(s, vax(tb, f, -0.004), vax(t1, f, -0.003), 0.0045);
  knobBone(s, vax(t1, dt, 0.003), vax(t1, dt, 0.026), 0.0042);
  knobBone(s, vax(t1, dt, 0.03), vax(t2, dt, -0.007), 0.0033);
  s.lip = 1.25;
  return s;
}

function footSdf() {
  const s = new Sdf();
  s.name = 'foot';
  s.ell([0.105, 0.0695, -0.018], [0.0148, 0.0118, 0.0195], { k: 0.006 }); // talus
  s.ell([0.1, 0.06, 0.011], [0.0105, 0.0095, 0.0105], { k: 0.006 });
  s.ell([0.106, 0.042, -0.038], [0.0145, 0.0165, 0.0275], { k: 0.008 }); // calcaneus
  s.ell([0.106, 0.036, -0.066], [0.0138, 0.0165, 0.0118], { k: 0.008 });
  s.ell([0.093, 0.052, -0.015], [0.0068, 0.0042, 0.0088], { k: 0.005 });
  s.ell([0.094, 0.055, 0.0225], [0.0118, 0.0088, 0.0062], { k: 0.004 }); // navicular
  s.ell([0.122, 0.036, 0.018], [0.0098, 0.0098, 0.0128], { k: 0.004 }); // cuboid
  for (let c = 0; c < 3; c++) s.ell([0.085 + c * 0.0118, 0.0485 - c * 0.002, 0.041], [0.0055, 0.0098, 0.0088], { k: 0.003 }); // cuneiforms
  const mt = [
    [[0.086, 0.0435, 0.052], [0.082, 0.022, 0.129], 0.0062],
    [[0.097, 0.0445, 0.054], [0.097, 0.0195, 0.134], 0.0041],
    [[0.108, 0.0425, 0.052], [0.11, 0.0185, 0.129], 0.0039],
    [[0.117, 0.0395, 0.046], [0.121, 0.0175, 0.122], 0.0037],
    [[0.126, 0.0345, 0.036], [0.133, 0.0158, 0.113], 0.0039],
  ];
  const toeLen = [[0.026, 0.022, 0], [0.023, 0.013, 0.01], [0.02, 0.011, 0.009], [0.018, 0.01, 0.008], [0.016, 0.009, 0.007]];
  mt.forEach(([a, b, r], i) => {
    knobBone(s, a, b, r * 0.85, 0.003);
    const d = vnorm([0.0 + (i - 1) * 0.01, -0.12, 1]);
    let p = vax(b, d, 0.006);
    const L = toeLen[i];
    for (let k = 0; k < 3; k++) {
      if (!L[k]) continue;
      const q = vax(p, d, L[k] - 0.003);
      knobBone(s, p, q, r * (i === 0 ? 0.8 : 0.85) * (1 - k * 0.15), 0.002);
      p = vax(q, d, 0.003);
    }
  });
  s.lip = 1.25;
  return s;
}

function buildGirdles(T, bones) {
  const P = T.pieces;
  // shoulder blades and pelvis: Voronoi cells (cracks)
  const scap = meshSdf(scapulaSdf(), 0.0022, { aoRadius: 0.006 });
  const sc = voronoiCells(scap, 0.04, 41, null, 0.3);
  T.scapula = {};
  addMirrored(bones, scap, sc.triCell, (side) => (T.scapula[side] = sc.sites.map((_, k) => P.add('chest', 'scapula', { side, cell: k }))), C_BONE, BM_BONE);
  const hip = meshSdf(hipBoneSdf(), 0.0029, { aoRadius: 0.01 });
  const hc = voronoiCells(hip, 0.042, 43, null, 0.3);
  T.hipBone = {};
  addMirrored(bones, hip, hc.triCell, (side) => (T.hipBone[side] = hc.sites.map((_, k) => P.add('pelvis', 'pelvis', { side, cell: k }))), C_BONE, BM_BONE);
  const sac = meshSdf(sacrumSdf(), 0.0027, { aoRadius: 0.006 });
  const sacIds = [P.add('pelvis', 'pelvis', { cell: 0, sacrum: true }), P.add('pelvis', 'pelvis', { cell: 1, sacrum: true })];
  const ss = sectionTris(sac, [0, 1.01, -0.07], [0, 0.85, -0.085], [0.45], 0.005, 7);
  bones.add(sac, Int32Array.from(ss, (k) => sacIds[k]), C_BONE, BM_BONE);
  T.sacrum = sacIds;
}

function buildLongBones(T, bones, which) {
  const P = T.pieces;
  const sides = ['L', 'R'];
  // long bones: sections along the joint-to-joint axis with jagged borders
  const long = (sdfFn, h, seg, A, B, bounds, seed, aoR = 0.008) => {
    const mesh = meshSdf(sdfFn(), h, { aoRadius: aoR });
    const tri = sectionTris(mesh, A, B, bounds, 0.0065, seed);
    T.long = T.long || {};
    for (const side of sides) {
      const ids = [];
      for (let k = 0; k <= bounds.length; k++) ids.push(P.add(seg + side, 'long', { sec: k }));
      bones.add(mesh, Int32Array.from(tri, (k) => ids[k]), C_BONE, BM_BONE, side === 'R' ? MIRROR : null);
      const mir = side === 'R' ? vmir : (p) => p;
      T.long[seg + side] = { ids, a: mir(A), b: mir(B), bounds };
    }
  };
  const bnds = (a, b, n) => Array.from({ length: n }, (_, k) => a + ((b - a) * k) / (n - 1));
  if (which === 'legs') {
    long(femurSdf, 0.0031, 'thigh', LM('hipL'), LM('kneeL'), bnds(0.14, 0.86, 12), 61);
    long(shinSdf, 0.003, 'shin', LM('kneeL'), LM('ankleL'), bnds(0.12, 0.86, 11), 62);
  } else {
    long(humerusSdf, 0.0027, 'upperArm', LM('shoulderL'), LM('elbowL'), bnds(0.15, 0.85, 9), 63);
    long(forearmSdf, 0.0023, 'forearm', LM('elbowL'), LM('wristL'), bnds(0.14, 0.86, 9), 64, 0.006);
  }
}

function buildExtremities(T, bones) {
  const P = T.pieces;
  // patella, hands, feet: rigid
  const pat = meshSdf(patellaSdf(), 0.002, { aoRadius: 0.004 });
  addMirrored(bones, pat, 0, (side) => [P.add('thigh' + side, 'patella')], C_BONE, BM_BONE);
  const hand = meshSdf(handSdf(), 0.0019, { aoRadius: 0.005, aoStrength: 1.3 });
  addMirrored(bones, hand, 0, (side) => [P.add('hand' + side, 'hand')], C_BONE, BM_BONE);
  const foot = meshSdf(footSdf(), 0.0026, { aoRadius: 0.006, aoStrength: 1.3 });
  addMirrored(bones, foot, 0, (side) => [P.add('foot' + side, 'foot')], C_BONE, BM_BONE);
}

// ---------------- organs ----------------

function heartSdf() {
  const s = new Sdf();
  s.name = 'heart';
  const base = [0.006, 1.318, -0.006], apex = [0.05, 1.243, 0.028];
  const ax = vnorm(vsub(apex, base));
  s.ell(vlerp(base, apex, 0.42), [0.036, 0.046, 0.031], { k: 0.012, y: ax, z: [0.3, 0, 1] }); // ventricles
  s.cone(vlerp(base, apex, 0.55), apex, 0.026, 0.009, { k: 0.014 }); // apex
  s.ell([-0.01, 1.288, 0.016], [0.027, 0.032, 0.018], { k: 0.012, y: ax }); // right ventricle (front)
  s.ell([-0.024, 1.316, -0.002], [0.019, 0.022, 0.018], { k: 0.01 }); // right atrium
  s.ell([0.014, 1.33, -0.028], [0.024, 0.014, 0.015], { k: 0.01 }); // left atrium
  s.ell([-0.021, 1.333, 0.012], [0.01, 0.008, 0.007], { k: 0.006 }); // right auricle
  s.ell([0.03, 1.327, 0.005], [0.011, 0.007, 0.007], { k: 0.006 }); // left auricle
  // interventricular groove
  s.cone([0.008, 1.312, 0.03], [0.044, 1.248, 0.036], 0.0024, 0.0018, { op: 's', k: 0.004 });
  s.lip = 1.25;
  return s;
}

function lungSdf(left) {
  const s = new Sdf();
  s.name = left ? 'lungL' : 'lungR';
  const sx = left ? 1 : -1;
  s.ell([sx * 0.072, 1.315, -0.031], [0.05, 0.097, 0.047], { k: 0.02 });
  s.ell([sx * 0.066, 1.395, -0.034], [0.035, 0.053, 0.034], { k: 0.025 }); // apex
  s.ell([sx * 0.08, 1.245, -0.033], [0.047, 0.03, 0.051], { k: 0.025 }); // base
  s.ell([sx * 0.0, 1.29, 0.005], [0.034, 0.12, 0.05], { op: 's', k: 0.018 }); // mediastinum
  s.ell([sx * 0.07, 1.165, -0.02], [0.08, 0.06, 0.08], { op: 's', k: 0.02 }); // diaphragm dome
  if (left) s.ell([0.035, 1.272, 0.03], [0.036, 0.05, 0.034], { op: 's', k: 0.012 }); // cardiac notch
  // oblique fissure
  s.box([sx * 0.075, 1.3, -0.02], [0.08, 0.0012, 0.08], { op: 's', k: 0.002, rad: 0.0005, y: [0, 1, -0.75] });
  if (!left) s.box([-0.08, 1.335, 0.01], [0.06, 0.0012, 0.05], { op: 's', k: 0.002, rad: 0.0005 }); // horizontal fissure
  s.lip = 1.25;
  return s;
}

function liverSdf() {
  const s = new Sdf();
  s.name = 'liver';
  s.ell([-0.048, 1.152, 0.0], [0.082, 0.05, 0.066], { k: 0.02 });
  s.ell([0.028, 1.168, 0.016], [0.056, 0.027, 0.046], { k: 0.025 });
  s.ell([-0.075, 1.125, -0.01], [0.05, 0.05, 0.055], { k: 0.02 });
  s.ell([-0.02, 1.08, 0.02], [0.11, 0.038, 0.09], { op: 's', k: 0.02 }); // visceral surface
  s.lip = 1.2;
  return s;
}

function kidneySdf() {
  const s = new Sdf();
  s.name = 'kidney';
  s.ell([0.057, 1.09, -0.064], [0.021, 0.047, 0.019], { k: 0.006, y: [0.18, 1, 0.05] });
  s.ell([0.038, 1.09, -0.058], [0.009, 0.014, 0.012], { op: 's', k: 0.008 }); // hilum
  s.ell([0.056, 1.142, -0.064], [0.016, 0.009, 0.013], { k: 0.006 }); // adrenal
  s.lip = 1.2;
  return s;
}

function spleenSdf() {
  const s = new Sdf();
  s.name = 'spleen';
  s.ell([0.083, 1.16, -0.045], [0.017, 0.042, 0.03], { k: 0.006, y: [-0.35, 1, -0.2] });
  s.ell([0.06, 1.16, -0.03], [0.018, 0.04, 0.02], { op: 's', k: 0.01 });
  s.lip = 1.2;
  return s;
}

function bladderSdf() {
  const s = new Sdf();
  s.name = 'bladder';
  s.ell([0, 0.906, 0.036], [0.031, 0.027, 0.027], { k: 0.006 });
  s.lip = 1.1;
  return s;
}

/** closed tube along control points with radius profile r(u) */
function tube(ctrl, r, ds = 0.004, segs = 10, n = 120) {
  const path = resample(catmull(ctrl, n), ds).pts;
  return sweep(path, (u) => {
    const q = typeof r === 'function' ? r(u) : r;
    return [q, q];
  }, { segs });
}

/** small intestine: a dense coil filling the lower abdomen */
function smallIntestinePath() {
  const pts = [];
  const N = 520;
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const a = t * Math.PI * 2 * 7.3;
    const layer = Math.sin(t * Math.PI * 2 * 2.6);
    const x = 0.06 * Math.sin(a) + 0.012 * Math.sin(a * 2.7 + 1.3);
    const y = 1.1 - 0.13 * t + 0.012 * Math.sin(a * 1.9);
    const z = 0.026 + 0.02 * layer + 0.01 * Math.cos(a * 1.3);
    pts.push([x * (1 - 0.25 * t * t), y, z]);
  }
  return pts;
}

function buildThorax(T, organs) {
  const P = T.pieces;
  const piece = (seg, name) => {
    const id = P.add(seg, 'organ', { name });
    T.organPieces[name] = id;
    return id;
  };
  T.organPieces = {};
  const heart = meshSdf(heartSdf(), 0.0026, { aoRadius: 0.008 });
  organs.add(
    heart,
    piece('chest', 'heart'),
    (x, y, z) => {
      // yellowish fat in the coronary (atrioventricular) groove
      const g = Math.abs(y - 1.305 - (x - 0.0) * 0.35);
      return g < 0.0045 ? [0.78, 0.62, 0.38] : [0.62, 0.13, 0.11];
    },
    OM.heart,
  );
  // great vessels (swept)
  const aorta = tube([[0.004, 1.315, 0.002], [0.004, 1.355, 0.008], [0.0, 1.385, -0.006], [0.002, 1.389, -0.03], [0.008, 1.37, -0.045], [0.012, 1.33, -0.05], [0.012, 1.2, -0.05], [0.009, 1.04, -0.044]], (u) => 0.0118 - 0.003 * u);
  organs.add(aorta, piece('chest', 'aorta'), [0.74, 0.16, 0.15], OM.artery);
  const pulm = tube([[0.012, 1.318, 0.018], [0.016, 1.35, 0.012], [0.024, 1.362, -0.004], [0.05, 1.345, -0.02]], 0.0105);
  organs.add(pulm, T.organPieces.aorta, [0.58, 0.28, 0.42], OM.vein);
  const svc = tube([[-0.024, 1.322, -0.004], [-0.026, 1.38, -0.006], [-0.022, 1.44, -0.008]], 0.0085);
  organs.add(svc, T.organPieces.aorta, [0.35, 0.2, 0.42], OM.vein);
  for (const sx of [1, -1]) {
    const art = tube([[0.0, 1.389, -0.012], [sx * 0.012, 1.42, -0.006], [sx * 0.022, 1.47, 0.0]], 0.0045, 0.004, 8, 40);
    organs.add(art, T.organPieces.aorta, [0.74, 0.16, 0.15], OM.artery);
  }
  // lungs
  for (const left of [true, false]) {
    const lung = meshSdf(lungSdf(left), 0.0036, { aoRadius: 0.012 });
    organs.add(lung, piece('chest', left ? 'lung L' : 'lung R'), [0.86, 0.5, 0.48], OM.lung);
  }
  // airway: trachea with cartilage rings, bronchi
  const trR = (u) => 0.0088 + 0.0011 * Math.max(0, Math.sin(u * Math.PI * 2 * 26));
  const trachea = tube([[0, 1.548, 0.012], [0, 1.47, 0.006], [0, 1.4, -0.006], [0, 1.37, -0.012]], trR, 0.0025, 12, 60);
  const trU = piece('neck', 'trachea');
  const trL = piece('chest', 'trachea lower');
  organs.add(trachea, Int32Array.from({ length: trachea.tri.length / 3 }, (_, t) => (trachea.pos[trachea.tri[t * 3] * 3 + 1] > 1.475 ? trU : trL)), [0.86, 0.74, 0.7], OM.trachea);
  for (const sx of [1, -1]) {
    const br = tube([[0, 1.372, -0.012], [sx * 0.022, 1.355, -0.016], [sx * 0.042, 1.335, -0.022]], 0.0065, 0.003, 10, 30);
    organs.add(br, trL, [0.86, 0.74, 0.7], OM.trachea);
  }
}

function buildAbdomen(T, organs) {
  const P = T.pieces;
  const piece = (seg, name) => {
    const id = P.add(seg, 'organ', { name });
    T.organPieces[name] = id;
    return id;
  };
  const liver = meshSdf(liverSdf(), 0.0036, { aoRadius: 0.012 });
  organs.add(liver, piece('abdomen', 'liver'), [0.44, 0.12, 0.08], OM.liver);
  const stomach = tube([[0.024, 1.198, -0.022], [0.052, 1.205, -0.012], [0.07, 1.18, 0.006], [0.066, 1.142, 0.026], [0.038, 1.115, 0.036], [0.006, 1.11, 0.036], [-0.018, 1.122, 0.028], [-0.03, 1.13, 0.016]], (u) => 0.012 + 0.02 * Math.sin(Math.PI * Math.min(1, u * 1.35)) * (1 - 0.35 * u), 0.004, 14);
  organs.add(stomach, piece('abdomen', 'stomach'), [0.86, 0.58, 0.52], OM.stomach);
  const spleen = meshSdf(spleenSdf(), 0.003, { aoRadius: 0.008 });
  organs.add(spleen, piece('abdomen', 'spleen'), [0.4, 0.1, 0.17], OM.spleen);
  const kid = meshSdf(kidneySdf(), 0.0027, { aoRadius: 0.008 });
  organs.add(kid, piece('abdomen', 'kidney L'), [0.52, 0.15, 0.12], OM.kidney);
  organs.add(kid, piece('abdomen', 'kidney R'), [0.52, 0.15, 0.12], OM.kidney, xformMake([[1, 0, 0], [0, 1, 0], [0, 0, 1]], [-1, 1, 1], [0, -0.008, 0]));
  // intestines
  const si = tube(smallIntestinePath(), (u) => 0.0115 + 0.0012 * Math.sin(u * 230), 0.0045, 10, 900);
  const siA = piece('abdomen', 'intestines'), siP = piece('pelvis', 'lower intestine');
  organs.add(si, Int32Array.from({ length: si.tri.length / 3 }, (_, t) => (si.pos[si.tri[t * 3] * 3 + 1] > 1.035 ? siA : siP)), [0.88, 0.6, 0.56], OM.gut);
  const colonPts = [[-0.07, 0.975, 0.02], [-0.078, 1.04, 0.012], [-0.078, 1.1, 0.0], [-0.06, 1.115, 0.03], [-0.02, 1.095, 0.046], [0.025, 1.098, 0.046], [0.065, 1.12, 0.02], [0.084, 1.118, -0.012], [0.088, 1.05, -0.016], [0.084, 0.99, -0.008], [0.06, 0.955, 0.02], [0.02, 0.945, 0.015], [0.0, 0.94, -0.03], [0.0, 0.9, -0.06]];
  const colon = tube(colonPts, (u) => (0.017 - 0.006 * u) * (1 + 0.14 * Math.max(0, Math.sin(u * Math.PI * 2 * 22))), 0.0035, 12, 200);
  const coA = piece('abdomen', 'colon'), coP = piece('pelvis', 'colon lower');
  organs.add(colon, Int32Array.from({ length: colon.tri.length / 3 }, (_, t) => (colon.pos[colon.tri[t * 3] * 3 + 1] > 1.035 ? coA : coP)), [0.76, 0.5, 0.44], OM.colon);
  const bl = meshSdf(bladderSdf(), 0.003, { aoRadius: 0.006 });
  organs.add(bl, piece('pelvis', 'bladder'), [0.86, 0.68, 0.58], OM.bladder);
}

/** The build, as small steps (each well under ~150 ms) so it can also run sliced over frames. */
function templateSteps() {
  const T = { pieces: new PieceTable(), timings: {} };
  const bones = new GeoBuilder(T.pieces);
  const organs = new GeoBuilder(T.pieces);
  const st = { T, bones, organs, levels: null, t0: now() };
  const steps = [
    // small parts first: the JIT warms up on short slices before the big meshes
    ['spine', () => (st.levels = buildSpine(T, bones))],
    ['ribcage', () => buildRibcage(T, bones, st.levels)],
    ['arms', () => buildLongBones(T, bones, 'arms')],
    ['legs', () => buildLongBones(T, bones, 'legs')],
    ['extremities', () => buildExtremities(T, bones)],
    ['girdles', () => buildGirdles(T, bones)],
    ['thorax', () => buildThorax(T, organs)],
    ['abdomen', () => buildAbdomen(T, organs)],
    ['jaw', () => buildJaw(T, bones)],
    ['brain', () => buildBrain(T, organs)],
    ['skullMesh', () => meshSkull(T)],
    ['skull', () => buildSkull(T, bones)],
  ].map(([name, fn]) => () => {
    const t = now();
    fn();
    T.timings[name] = Math.round(now() - t);
  });
  const finish = () => {
    T.boneGeo = bones.finish();
    T.organGeo = organs.finish();
    T.nPieces = T.pieces.list.length;
    T.timings.total = Math.round(now() - st.t0);
    T.stats = { boneVerts: bones.count, boneTris: bones.I.n / 3, organVerts: organs.count, organTris: organs.I.n / 3, pieces: T.nPieces };
    freeGridBuffers();
    return T;
  };
  return { steps, finish };
}

let TEMPLATE = null;
let BUILDING = null;

/** Build everything (once per process). */
export function xrayTemplate() {
  if (!TEMPLATE) {
    const { steps, finish } = templateSteps();
    for (const s of steps) s();
    TEMPLATE = finish();
  }
  return TEMPLATE;
}

function buildTemplateAsync(sliceMs = 12) {
  if (TEMPLATE) return Promise.resolve(TEMPLATE);
  if (BUILDING) return BUILDING;
  BUILDING = new Promise((resolve) => {
    const { steps, finish } = templateSteps();
    let i = 0;
    const tick = () => {
      if (TEMPLATE) return resolve(TEMPLATE);
      const t0 = now();
      while (i < steps.length && now() - t0 < sliceMs) steps[i++]();
      if (i < steps.length) setTimeout(tick, 0);
      else {
        TEMPLATE = finish();
        resolve(TEMPLATE);
      }
    };
    setTimeout(tick, 0);
  });
  return BUILDING;
}

// ================================================================================================
// Materials

const GLSL_NOISE = /* glsl */ `
float xh(vec3 p) { p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }
float xn(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(xh(i), xh(i + vec3(1, 0, 0)), f.x), mix(xh(i + vec3(0, 1, 0)), xh(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(xh(i + vec3(0, 0, 1)), xh(i + vec3(1, 0, 1)), f.x), mix(xh(i + vec3(0, 1, 1)), xh(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float xfbm(vec3 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * xn(p); p = p * 2.03 + 1.7; a *= 0.5; } return s; }
`;

// rigid "piece skinning": every vertex follows the 3x4 matrix of its piece (one texel row each)
const GLSL_PIECE_PARS = /* glsl */ `
uniform highp sampler2D uBones;
attribute float aPiece;
attribute vec4 aSurf;
attribute float aMat;
varying vec4 vSurf;
varying float vMat;
varying vec3 vBind;
`;

const GLSL_BUMP = /* glsl */ `
vec3 xbump(vec3 N, float hgt) {
  vec3 p = -vViewPosition;
  vec3 dpx = dFdx(p), dpy = dFdy(p);
  float dhx = dFdx(hgt), dhy = dFdy(hgt);
  vec3 r1 = cross(dpy, N), r2 = cross(N, dpx);
  float det = dot(dpx, r1);
  vec3 grad = sign(det) * (dhx * r1 + dhy * r2);
  return normalize(abs(det) * N - grad);
}
`;

function pieceVertex(sh, extraPars = '', deform = '') {
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\n' + GLSL_PIECE_PARS + extraPars)
    .replace(
      '#include <beginnormal_vertex>',
      `int xpid = int(aPiece + 0.5);
      vec4 xr0 = texelFetch(uBones, ivec2(0, xpid), 0);
      vec4 xr1 = texelFetch(uBones, ivec2(1, xpid), 0);
      vec4 xr2 = texelFetch(uBones, ivec2(2, xpid), 0);
      vec3 xpos = position;
      ${deform}
      vec3 objectNormal = vec3(dot(xr0.xyz, normal), dot(xr1.xyz, normal), dot(xr2.xyz, normal));
      vSurf = aSurf; vMat = aMat; vBind = position;`,
    )
    .replace(
      '#include <begin_vertex>',
      `vec4 xp4 = vec4(xpos, 1.0);
      vec3 transformed = vec3(dot(xr0, xp4), dot(xr1, xp4), dot(xr2, xp4));`,
    );
}

// reveal: a scan line sweeps down the body (bind-space height) with a glowing, slightly ragged edge
const GLSL_FADE = /* glsl */ `
  float xscan = mix(1.95, -0.15, uFade) + (xn(vBind * 60.0) - 0.5) * 0.035;
  if (vBind.y < xscan) discard;
  float xedge = (1.0 - smoothstep(0.0, 0.045, vBind.y - xscan)) * step(uFade, 0.999);
`;

function boneMaterial(boneTex) {
  const mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0, clearcoat: 0.2, clearcoatRoughness: 0.4, side: THREE.DoubleSide });
  const u = {
    uBones: { value: boneTex },
    uFade: { value: 1 },
    uXray: { value: 1 },
    uRim: { value: new THREE.Color(0.55, 0.72, 1.0) },
  };
  mat.userData.uniforms = u;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    pieceVertex(sh);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uFade;\nuniform float uXray;\nuniform vec3 uRim;\nvarying vec4 vSurf;\nvarying float vMat;\nvarying vec3 vBind;\n' + GLSL_NOISE + GLSL_BUMP)
      .replace(
        '#include <color_fragment>',
        `${GLSL_FADE}
        vec3 xalb = pow(vSurf.rgb, vec3(2.2));
        float xao = vSurf.a;
        float xm = floor(vMat + 0.5);
        bool xback = !gl_FrontFacing;
        float xn1 = xfbm(vBind * 95.0);
        float xstain = smoothstep(0.5, 0.85, xfbm(vBind * 21.0 + 3.1));
        if (xm < 1.5) {
          xalb *= 0.84 + 0.3 * xn1;
          xalb = mix(xalb, xalb * vec3(0.97, 0.86, 0.68), xstain * 0.8);
        } else if (xm < 2.5) {
          xalb *= 0.94 + 0.1 * xn1;
        } else {
          xalb *= 0.95 + 0.1 * xn1;
        }
        if (xm > 0.5 && xm < 1.5) {
          // cranial sutures (coronal, sagittal, lambdoid) on the vault
          vec3 P = vBind;
          float wig = (xn(P * 300.0) - 0.5) * 0.0035 + (xn(P * 95.0) - 0.5) * 0.004;
          float cor = abs(P.z - (0.012 + 0.21 * (1.778 - P.y)) + wig);
          float sag = abs(P.x + wig) + (P.z > 0.014 || P.z < -0.078 ? 1.0 : 0.0);
          float lam = abs(P.z + 0.079 - 0.42 * abs(P.x) + 0.3 * max(0.0, 1.745 - P.y) + wig) + (P.y < 1.655 ? 1.0 : 0.0);
          float sd = min(min(cor, sag), lam);
          float sut = (1.0 - smoothstep(0.0005, 0.0012, sd)) * step(1.668, P.y) * step(P.z, 0.06);
          xalb *= 1.0 - 0.6 * sut;
          xao *= 1.0 - 0.4 * sut;
        }
        if (xback) {
          // broken edge: marrow / diploe
          xalb = vec3(0.3, 0.04, 0.03) * (0.5 + 0.7 * xn1);
          xao = 0.85;
        }
        diffuseColor.rgb = xalb * mix(0.3, 1.0, xao);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = xback ? 0.75 : xm > 1.5 && xm < 2.5 ? 0.22 : xm > 2.5 ? 0.3 : 0.42 + 0.25 * xn1;`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        if (xm < 1.5) normal = xbump(normal, (xn(vBind * 650.0) * 0.6 + xn1 * 0.4) * 0.00022);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        vec3 xV = normalize(vViewPosition);
        float xfr = pow(1.0 - clamp(abs(dot(normal, xV)), 0.0, 1.0), 3.0);
        float xwrap = clamp(dot(normal, normalize(vec3(-0.45, 0.6, 0.66))) * 0.5 + 0.5, 0.0, 1.0);
        totalEmissiveRadiance += uXray * (xalb * (0.012 + 0.07 * xwrap * xwrap) * mix(0.2, 1.0, xao) + uRim * xfr * mix(0.1, 1.0, xao) * (xback ? 0.1 : 0.3));
        totalEmissiveRadiance += vec3(0.35, 0.75, 1.0) * xedge * 2.5;`,
      )
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
        reflectedLight.indirectDiffuse *= mix(0.12, 1.0, xao);
        reflectedLight.indirectSpecular *= mix(0.15, 1.0, xao);
        reflectedLight.directDiffuse *= mix(0.5, 1.0, xao);
        reflectedLight.directSpecular *= mix(0.4, 1.0, xao);`,
      );
  };
  mat.customProgramCacheKey = () => 'xray-bone-v1';
  return mat;
}

export const MAX_ORGAN_WOUNDS = 8;

function organMaterial(boneTex) {
  const mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.42, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.1, side: THREE.DoubleSide, sheen: 0.3, sheenRoughness: 0.5, sheenColor: new THREE.Color(1, 0.6, 0.6) });
  const N = MAX_ORGAN_WOUNDS;
  const u = {
    uBones: { value: boneTex },
    uFade: { value: 1 },
    uXray: { value: 1 },
    uTime: { value: 0 },
    uBeat: { value: 0 },
    uBreath: { value: 0 },
    uWN: { value: 0 },
    uWA: { value: Array.from({ length: N }, () => new THREE.Vector4()) },
    uWB: { value: Array.from({ length: N }, () => new THREE.Vector4()) },
    uWC: { value: Array.from({ length: N }, () => new THREE.Vector4()) },
  };
  mat.userData.uniforms = u;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    pieceVertex(
      sh,
      `uniform float uTime; uniform float uBeat; uniform float uBreath; uniform int uWN;
      uniform vec4 uWA[${N}]; uniform vec4 uWB[${N}]; uniform vec4 uWC[${N}];
      varying float vDmg;
      ${GLSL_NOISE}`,
      `float xm0 = floor(aMat + 0.5);
      if (xm0 == 3.0) { vec3 hc = vec3(0.014, 1.288, 0.006); xpos = hc + (xpos - hc) * (1.0 - 0.045 * uBeat); }
      if (xm0 == 6.0) { vec3 lc = vec3(sign(xpos.x) * 0.065, 1.3, -0.03); xpos = lc + (xpos - lc) * (1.0 + 0.018 * uBreath); }
      float xdmg = 0.0;
      for (int i = 0; i < ${N}; i++) {
        if (i >= uWN) break;
        vec4 A = uWA[i], Bw = uWB[i], Cw = uWC[i];
        if (Bw.w >= 0.0 && abs(Bw.w - xm0) > 0.5) continue;
        float t = uTime - Cw.x;
        if (t < 0.0) continue;
        vec3 rel = xpos - A.xyz;
        float along = dot(rel, Bw.xyz);
        vec3 perp = rel - Bw.xyz * along;
        float r = length(perp);
        float R = A.w;
        // wound channel: the tissue round the path caves in (crater / gutter) with a torn,
        // slightly everted lip; the temporary cavity overshoots, then settles
        float rr = r / R;
        float grow = 1.0 - exp(-t * 45.0);
        float settle = mix(1.25, 0.8, 1.0 - exp(-t * 7.0));
        float nz = xn(xpos * 170.0 + Cw.w), nz2 = xn(xpos * 420.0 + Cw.w * 3.0);
        float tear = 0.65 + 0.7 * nz;
        float crater = exp(-rr * rr * 1.6) * tear;
        float lip = exp(-pow(rr - 1.25, 2.0) * 5.0) * (0.4 + 0.6 * nz2);
        vec3 dout = perp / max(r, 1e-4);
        float s = R * Cw.y * grow * settle;
        xpos += -normal * s * (0.85 * crater - 0.22 * lip) + dout * s * (0.35 * crater + 0.12 * lip);
        xdmg = max(xdmg, clamp(crater * 1.25 + lip * 0.3, 0.0, 1.0) * grow * min(Cw.y, 1.0));
      }
      vDmg = xdmg;`,
    );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uFade;\nuniform float uXray;\nvarying vec4 vSurf;\nvarying float vMat;\nvarying vec3 vBind;\nvarying float vDmg;\n' + GLSL_NOISE + GLSL_BUMP)
      .replace(
        '#include <color_fragment>',
        `${GLSL_FADE}
        vec3 xalb = pow(vSurf.rgb, vec3(2.2));
        float xao = vSurf.a;
        float xm = floor(vMat + 0.5);
        bool xback = !gl_FrontFacing;
        vec3 P = vBind;
        float xn1 = xfbm(P * 120.0);
        float xwet = 1.0;
        if (xm == 6.0) {
          // lung: mottled, spongy, specks
          xalb *= 0.62 + 0.55 * xfbm(P * 210.0);
          xalb = mix(xalb, vec3(0.08, 0.06, 0.07), step(0.83, xn(P * 700.0)) * 0.55);
        } else if (xm == 1.0) {
          // brain: pink-grey, red surface vessels
          float v = 1.0 - smoothstep(0.0, 0.018, abs(xn(P * 85.0) - 0.5));
          xalb = mix(xalb * (0.9 + 0.2 * xn1), vec3(0.45, 0.03, 0.04), v * 0.55);
        } else if (xm == 3.0 || xm == 11.0 || xm == 12.0 || xm == 8.0) {
          float v = 1.0 - smoothstep(0.0, 0.025, abs(xn(P * 55.0) - 0.5));
          xalb = mix(xalb * (0.85 + 0.3 * xn1), xm == 3.0 ? vec3(0.22, 0.02, 0.06) : vec3(0.5, 0.06, 0.08), v * 0.6);
        } else if (xm == 7.0 || xm == 9.0 || xm == 10.0) {
          xalb *= 0.82 + 0.32 * xn(P * 300.0);
        } else if (xm == 14.0) {
          xwet = 0.6;
        }
        float xd = smoothstep(0.12, 0.6, vDmg);
        xalb = mix(xalb, vec3(0.13, 0.004, 0.006) * (0.55 + 0.7 * xn1), xd);
        xwet = max(xwet, xd);
        if (xback) { xalb = vec3(0.18, 0.012, 0.012); xao = 0.7; }
        diffuseColor.rgb = xalb * mix(0.25, 1.0, xao);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(0.55, 0.32, xwet) - 0.1 * xd;`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        if (vDmg > 0.08) normal = normalize(mix(normal, normalize(cross(dFdx(-vViewPosition), dFdy(-vViewPosition))), 0.55 * smoothstep(0.08, 0.6, vDmg)));
        if (xm == 6.0) normal = xbump(normal, xn(P * 420.0) * 0.0004);
        else if (xm == 7.0 || xm == 3.0) normal = xbump(normal, xn1 * 0.0003);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        vec3 xV = normalize(vViewPosition);
        float xfr = pow(1.0 - clamp(abs(dot(normal, xV)), 0.0, 1.0), 2.5);
        float xwrap = clamp(dot(normal, normalize(vec3(-0.45, 0.6, 0.66))) * 0.5 + 0.5, 0.0, 1.0);
        totalEmissiveRadiance += uXray * (xalb * (0.02 + 0.1 * xwrap * xwrap) * mix(0.3, 1.0, xao) + vec3(1.0, 0.35, 0.3) * xfr * 0.08 * xao);
        totalEmissiveRadiance += vec3(0.35, 0.75, 1.0) * xedge * 2.0;`,
      )
      .replace(
        '#include <lights_physical_fragment>',
        `#include <lights_physical_fragment>
        #ifdef USE_CLEARCOAT
        material.clearcoat = xwet * (xback ? 0.3 : 1.0);
        #endif`,
      )
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
        reflectedLight.indirectDiffuse *= mix(0.15, 1.0, xao);
        reflectedLight.indirectSpecular *= mix(0.3, 1.0, xao);
        reflectedLight.directDiffuse *= mix(0.5, 1.0, xao);`,
      );
  };
  mat.customProgramCacheKey = () => 'xray-organ-v1';
  return mat;
}

let GHOST = null;
const GHOST_PREV = new WeakMap();

function makeGhost() {
  const mat = new THREE.MeshStandardMaterial({ color: 0x9cc2e6, roughness: 1, metalness: 0, transparent: true, depthWrite: false, side: THREE.FrontSide });
  mat.blending = THREE.CustomBlending;
  mat.blendSrc = THREE.OneFactor;
  mat.blendDst = THREE.OneMinusSrcAlphaFactor;
  mat.blendEquation = THREE.AddEquation;
  const u = {
    uInner: { value: new THREE.Color(0.1, 0.2, 0.32) },
    uRimC: { value: new THREE.Color(0.55, 0.8, 1.0) },
    uOpacity: { value: 1 },
  };
  mat.userData.uniforms = u;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uInner;\nuniform vec3 uRimC;\nuniform float uOpacity;')
      .replace(
        '#include <opaque_fragment>',
        `vec3 gV = normalize(vViewPosition);
        float gndv = clamp(abs(dot(normal, gV)), 0.0, 1.0);
        float gfr = 1.0 - gndv;
        float grim = pow(gfr, 2.2);
        float ga = uOpacity * (0.03 + 0.5 * pow(gfr, 4.0));
        vec3 gc = (uInner * 0.12 + uRimC * (0.015 + 0.75 * grim * grim)) * uOpacity;
        gl_FragColor = vec4(gc, ga);`,
      );
  };
  mat.customProgramCacheKey = () => 'xray-ghost-v1';
  return mat;
}

/** instanced debris look: vertex-coloured, wet or bony, with the x-ray rim */
function debrisMaterial(kind) {
  const bone = kind === 'bone';
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: bone ? 0.5 : 0.35,
    clearcoat: bone ? 0.2 : 1,
    clearcoatRoughness: bone ? 0.4 : 0.08,
    side: THREE.DoubleSide,
  });
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      vec3 dV = normalize(vViewPosition);
      float dfr = pow(1.0 - clamp(abs(dot(normal, dV)), 0.0, 1.0), 3.0);
      totalEmissiveRadiance += diffuseColor.rgb * 0.12 + vec3(${bone ? '0.5, 0.65, 0.9' : '0.8, 0.25, 0.2'}) * dfr * 0.4;`,
    );
  };
  mat.customProgramCacheKey = () => 'xray-debris-' + kind;
  return mat;
}

let SHARED = null;
function sharedFx() {
  if (SHARED) return SHARED;
  const rnd = mulberry(77);
  // bone shard: an irregular, elongated crystal, one face shows red marrow
  const shard = new THREE.BufferGeometry();
  {
    const pts = [[0, 0.5, 0], [0, -0.5, 0]];
    const ring = 5;
    for (let i = 0; i < ring; i++) {
      const a = (i / ring) * Math.PI * 2 + rnd() * 0.5;
      pts.push([Math.cos(a) * (0.5 + rnd() * 0.5), (rnd() - 0.5) * 0.35, Math.sin(a) * (0.35 + rnd() * 0.4)]);
    }
    const pos = [], col = [];
    const face = (a, b, c, marrow) => {
      for (const p of [a, b, c]) pos.push(...pts[p]);
      const cc = marrow ? [0.32, 0.05, 0.035] : [0.9, 0.84, 0.72];
      for (let k = 0; k < 3; k++) col.push(...cc);
    };
    for (let i = 0; i < ring; i++) {
      const a = 2 + i, b = 2 + ((i + 1) % ring);
      face(0, a, b, i === 0);
      face(1, b, a, i === 2);
    }
    shard.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    shard.setAttribute('color', new THREE.Float32BufferAttribute(col.map((c) => Math.pow(c, 2.2)), 3));
    shard.computeVertexNormals();
  }
  // tissue chunk: a lumpy blob, darker in its folds
  const chunk = new THREE.IcosahedronGeometry(0.5, 2);
  {
    const p = chunk.attributes.position;
    const col = [];
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const n = vnoise(x * 3.1 + 7, y * 3.1, z * 3.1, 3) * 0.6 + vnoise(x * 7, y * 7, z * 7, 4) * 0.4;
      const s = 0.72 + 0.55 * n;
      p.setXYZ(i, x * s, y * s * 0.85, z * s);
      const c = 0.55 + 0.6 * n;
      col.push(c, c, c);
    }
    chunk.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    chunk.computeVertexNormals();
  }
  const drop = new THREE.IcosahedronGeometry(1, 1);
  SHARED = {
    shard,
    chunk,
    drop,
    shardMat: debrisMaterial('bone'),
    chunkMat: debrisMaterial('tissue'),
    dropMat: new THREE.MeshPhysicalMaterial({ color: 0x5e0505, roughness: 0.16, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.04, emissive: 0x1a0101 }),
    mistMat: new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 600 } },
      vertexShader: /* glsl */ `
        attribute vec4 aInfo; // size (m), alpha, colour mix (blood -> brain), seed
        uniform float uScale;
        varying vec4 vInfo;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = aInfo.y > 0.0 ? clamp(aInfo.x * uScale / max(-mv.z, 0.05), 1.0, 220.0) : 0.0;
          vInfo = aInfo;
        }`,
      fragmentShader: /* glsl */ `
        varying vec4 vInfo;
        float mh(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        void main() {
          vec2 c = gl_PointCoord * 2.0 - 1.0;
          float r2 = dot(c, c);
          if (r2 > 1.0) discard;
          float a = (1.0 - r2);
          a *= a;
          float n = mh(floor(gl_PointCoord * 6.0) + vInfo.w * 17.0);
          a *= 0.75 + 0.25 * n;
          vec3 col = mix(vec3(0.3, 0.012, 0.01), vec3(0.62, 0.36, 0.33), vInfo.z) * (0.75 + 0.35 * n);
          gl_FragColor = vec4(col, a * vInfo.y);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
    }),
    trackMat: new THREE.ShaderMaterial({
      uniforms: { uHead: { value: 1 }, uFade: { value: 1 }, uLen: { value: 0.2 } },
      vertexShader: /* glsl */ `
        attribute vec2 aUv;
        varying vec2 vUv;
        void main() { vUv = aUv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uHead; uniform float uFade; uniform float uLen;
        varying vec2 vUv;
        void main() {
          float along = vUv.x;              // 0 entry .. 1 exit
          float across = abs(vUv.y * 2.0 - 1.0);
          if (along > uHead) discard;
          float core = exp(-across * across * 90.0);
          float glow = exp(-across * across * 9.0);
          float behind = uHead - along;
          float hot = exp(-behind * 9.0);
          vec3 c = vec3(1.0, 0.92, 0.75) * core * (0.45 + 1.4 * hot) + vec3(1.0, 0.36, 0.1) * glow * (0.12 + 0.6 * hot);
          float wobble = 0.85 + 0.15 * sin(along * 90.0);
          gl_FragColor = vec4(c * uFade * wobble, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    }),
  };
  return SHARED;
}

// ================================================================================================
// Runtime

const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
const _m4 = new THREE.Matrix4();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _e = new THREE.Euler();

/** 3x4 row-major affine from position + quaternion (+ bind offset: M = T(p) R T(-c)) */
function mat34(out, o, px, py, pz, qx, qy, qz, qw, cx = 0, cy = 0, cz = 0) {
  const x2 = qx + qx, y2 = qy + qy, z2 = qz + qz;
  const xx = qx * x2, xy = qx * y2, xz = qx * z2, yy = qy * y2, yz = qy * z2, zz = qz * z2, wx = qw * x2, wy = qw * y2, wz = qw * z2;
  const r00 = 1 - (yy + zz), r01 = xy - wz, r02 = xz + wy;
  const r10 = xy + wz, r11 = 1 - (xx + zz), r12 = yz - wx;
  const r20 = xz - wy, r21 = yz + wx, r22 = 1 - (xx + yy);
  out[o] = r00; out[o + 1] = r01; out[o + 2] = r02; out[o + 3] = px - (r00 * cx + r01 * cy + r02 * cz);
  out[o + 4] = r10; out[o + 5] = r11; out[o + 6] = r12; out[o + 7] = py - (r10 * cx + r11 * cy + r12 * cz);
  out[o + 8] = r20; out[o + 9] = r21; out[o + 10] = r22; out[o + 11] = pz - (r20 * cx + r21 * cy + r22 * cz);
}

/** out[o..] = A[a..] * B[b..] (3x4 affine) */
function mul34(out, o, A, a, B, b) {
  for (let r = 0; r < 3; r++) {
    const a0 = A[a + r * 4], a1 = A[a + r * 4 + 1], a2 = A[a + r * 4 + 2], a3 = A[a + r * 4 + 3];
    out[o + r * 4] = a0 * B[b] + a1 * B[b + 4] + a2 * B[b + 8];
    out[o + r * 4 + 1] = a0 * B[b + 1] + a1 * B[b + 5] + a2 * B[b + 9];
    out[o + r * 4 + 2] = a0 * B[b + 2] + a1 * B[b + 6] + a2 * B[b + 10];
    out[o + r * 4 + 3] = a0 * B[b + 3] + a1 * B[b + 7] + a2 * B[b + 11] + a3;
  }
}

/** rigid offset in bind space: rotate by `angle` about `axis` through `pivot`, then translate */
function offset34(out, o, pivot, axis, angle, tr) {
  _qa.setFromAxisAngle(_v1.set(axis[0], axis[1], axis[2]), angle);
  mat34(out, o, pivot[0] + tr[0], pivot[1] + tr[1], pivot[2] + tr[2], _qa.x, _qa.y, _qa.z, _qa.w, pivot[0], pivot[1], pivot[2]);
}

const vec = (p) => [p.x, p.y, p.z];
const rand = (r, a, b) => a + (b - a) * r();

/** a random unit vector inside a cone around d (radians) */
function coneDir(r, d, ang) {
  const [e1, e2] = perpBasis(d);
  const phi = r() * Math.PI * 2;
  const ct = 1 - r() * (1 - Math.cos(ang));
  const st = Math.sqrt(1 - ct * ct);
  return vnorm(vax(vmul(d, ct), e1, Math.cos(phi) * st, e2, Math.sin(phi) * st));
}

const MODE_SEG = 0, MODE_FRAG = 1, MODE_BODY = 2;

/** particle pools (lazily created per rig) */
class XrayFx {
  constructor(group, rnd, floorY, gravity) {
    this.group = group;
    this.rnd = rnd;
    this.floorY = floorY;
    this.g = gravity;
    this.mist = null;
    this.inst = {};
    this.tracks = [];
    this.alive = 0;
  }

  // ---- mist (soft sprites)
  _mist() {
    if (this.mist) return this.mist;
    const N = 1400;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 3), info = new Float32Array(N * 4);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aInfo', new THREE.BufferAttribute(info, 4).setUsage(THREE.DynamicDrawUsage));
    const S = sharedFx();
    const pts = new THREE.Points(geo, S.mistMat);
    pts.frustumCulled = false;
    pts.renderOrder = 3;
    pts.onBeforeRender = (renderer, scene, camera) => {
      const h = renderer.getDrawingBufferSize(_v3).y;
      S.mistMat.uniforms.uScale.value = camera.isPerspectiveCamera ? h / (2 * Math.tan((camera.fov * Math.PI) / 360)) : h;
    };
    this.group.add(pts);
    this.mist = { N, n: 0, next: 0, pos, info, geo, pts, vel: new Float32Array(N * 3), age: new Float32Array(N), life: new Float32Array(N), s0: new Float32Array(N), a0: new Float32Array(N), drag: new Float32Array(N) };
    return this.mist;
  }

  mistBurst(p, d, count, speed, spread, size, life, mix = 0, drag = 7) {
    const M = this._mist(), r = this.rnd;
    for (let k = 0; k < count; k++) {
      const i = M.next;
      M.next = (M.next + 1) % M.N;
      const dir = coneDir(r, d, spread);
      const sp = speed * (0.15 + 0.85 * Math.pow(r(), 0.6));
      M.pos[i * 3] = p[0] + (r() - 0.5) * 0.01;
      M.pos[i * 3 + 1] = p[1] + (r() - 0.5) * 0.01;
      M.pos[i * 3 + 2] = p[2] + (r() - 0.5) * 0.01;
      M.vel[i * 3] = dir[0] * sp;
      M.vel[i * 3 + 1] = dir[1] * sp;
      M.vel[i * 3 + 2] = dir[2] * sp;
      M.age[i] = 0;
      M.life[i] = life * (0.6 + 0.8 * r());
      M.s0[i] = size * (0.5 + r());
      M.a0[i] = 0.25 + 0.4 * r();
      M.drag[i] = drag * (0.6 + 0.8 * r());
      M.info[i * 4 + 2] = clamp(mix + (r() - 0.5) * 0.3, 0, 1);
      M.info[i * 4 + 3] = r();
    }
    this.alive = 1;
  }

  // ---- instanced pools: shards (bone), chunks (tissue), drops (blood)
  _pool(kind) {
    if (this.inst[kind]) return this.inst[kind];
    const S = sharedFx();
    const N = kind === 'drop' ? 500 : kind === 'shard' ? 220 : 120;
    const geo = kind === 'drop' ? S.drop : kind === 'shard' ? S.shard : S.chunk;
    const mat = kind === 'drop' ? S.dropMat : kind === 'shard' ? S.shardMat : S.chunkMat;
    const mesh = new THREE.InstancedMesh(geo, mat, N);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (kind === 'chunk') {
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
      mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    }
    mesh.count = 0;
    mesh.frustumCulled = false;
    this.group.add(mesh);
    const P = { N, mesh, list: [], kind };
    this.inst[kind] = P;
    return P;
  }

  spawn(kind, p, v, size, opts = {}) {
    const P = this._pool(kind);
    if (P.list.length >= P.N) P.list.shift();
    const r = this.rnd;
    const q = new THREE.Quaternion().setFromEuler(_e.set(r() * 6.28, r() * 6.28, r() * 6.28));
    const w = opts.spin ?? (kind === 'drop' ? 0 : 20 + r() * 60);
    const ax = vnorm([r() - 0.5, r() - 0.5, r() - 0.5]);
    P.list.push({
      p: [...p], v: [...v], q, w: vmul(ax, w), s: opts.scale || [size, size, size], age: 0, life: opts.life ?? 2.5, rest: false,
      col: opts.color || null, bounce: kind === 'shard' ? 0.3 : 0.05, drag: opts.drag ?? (kind === 'drop' ? 0.4 : 0.15),
    });
    this.alive = 1;
  }

  /** shower of particles from p along d */
  spray(kind, p, d, count, speed, spread, size, opts = {}) {
    const r = this.rnd;
    for (let k = 0; k < count; k++) {
      const dir = coneDir(r, d, spread);
      const sp = speed * (0.25 + 0.75 * Math.pow(r(), 0.7));
      const sz = size * (0.4 + 0.9 * r());
      let scale;
      if (kind === 'shard') scale = [sz * (0.35 + 0.4 * r()), sz * (1 + 1.6 * r()), sz * (0.25 + 0.3 * r())];
      else if (kind === 'chunk') scale = [sz, sz * (0.7 + 0.5 * r()), sz * (0.8 + 0.4 * r())];
      this.spawn(kind, vax(p, [r() - 0.5, r() - 0.5, r() - 0.5], opts.jitter ?? 0.008), vmul(dir, sp), sz, { ...opts, scale });
    }
  }

  track(entry, exit, dur, life) {
    const S = sharedFx();
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(4 * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aUv', new THREE.Float32BufferAttribute([0, 0, 0, 1, 1, 0, 1, 1], 2));
    geo.setIndex([0, 2, 1, 1, 2, 3]);
    const mat = S.trackMat.clone();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 10;
    const A = new THREE.Vector3(...entry), B = new THREE.Vector3(...exit);
    // extend a little beyond both wounds so the streak enters and leaves the body
    const d = _v1.subVectors(B, A).normalize();
    A.addScaledVector(d, -0.05);
    B.addScaledVector(d, 0.08);
    const tr = { mesh, mat, A, B, age: 0, dur, life };
    mesh.onBeforeRender = (renderer, scene, camera) => {
      const cam = camera.getWorldPosition(_v2);
      const dir = _v1.subVectors(tr.B, tr.A);
      const side = _v3.subVectors(cam, tr.A).cross(dir).normalize().multiplyScalar(0.008);
      pos[0] = tr.A.x - side.x; pos[1] = tr.A.y - side.y; pos[2] = tr.A.z - side.z;
      pos[3] = tr.A.x + side.x; pos[4] = tr.A.y + side.y; pos[5] = tr.A.z + side.z;
      pos[6] = tr.B.x - side.x; pos[7] = tr.B.y - side.y; pos[8] = tr.B.z - side.z;
      pos[9] = tr.B.x + side.x; pos[10] = tr.B.y + side.y; pos[11] = tr.B.z + side.z;
      geo.attributes.position.needsUpdate = true;
    };
    this.group.add(mesh);
    this.tracks.push(tr);
    this.alive = 1;
    return tr;
  }

  update(dt) {
    if (!this.alive) return;
    let any = 0;
    const g = this.g, fy = this.floorY;
    // mist
    const M = this.mist;
    if (M) {
      for (let i = 0; i < M.N; i++) {
        if (M.age[i] >= M.life[i]) {
          M.info[i * 4 + 1] = 0;
          continue;
        }
        any = 1;
        M.age[i] += dt;
        const k = Math.exp(-M.drag[i] * dt);
        M.vel[i * 3] *= k;
        M.vel[i * 3 + 1] = M.vel[i * 3 + 1] * k - g * 0.12 * dt;
        M.vel[i * 3 + 2] *= k;
        M.pos[i * 3] += M.vel[i * 3] * dt;
        M.pos[i * 3 + 1] = Math.max(fy + 0.005, M.pos[i * 3 + 1] + M.vel[i * 3 + 1] * dt);
        M.pos[i * 3 + 2] += M.vel[i * 3 + 2] * dt;
        const t = M.age[i] / M.life[i];
        M.info[i * 4] = M.s0[i] * (1 + 2.2 * Math.sqrt(t));
        M.info[i * 4 + 1] = M.a0[i] * (1 - t) * (1 - t) * Math.min(1, M.age[i] * 200);
      }
      M.geo.attributes.position.needsUpdate = true;
      M.geo.attributes.aInfo.needsUpdate = true;
    }
    // instanced debris
    for (const kind in this.inst) {
      const P = this.inst[kind];
      const L = P.list;
      let n = 0;
      for (let i = 0; i < L.length; i++) {
        const o = L[i];
        o.age += dt;
        if (o.age > o.life) continue;
        any = 1;
        if (!o.rest) {
          const k = Math.exp(-o.drag * dt);
          o.v[0] *= k;
          o.v[1] = o.v[1] * k - g * dt;
          o.v[2] *= k;
          o.p[0] += o.v[0] * dt;
          o.p[1] += o.v[1] * dt;
          o.p[2] += o.v[2] * dt;
          const wl = vlen(o.w);
          if (wl > 1e-6) {
            _qa.setFromAxisAngle(_v1.set(o.w[0] / wl, o.w[1] / wl, o.w[2] / wl), wl * dt);
            o.q.premultiply(_qa);
          }
          const r = kind === 'drop' ? o.s[0] : Math.min(o.s[0], o.s[1], o.s[2]) * 0.5;
          if (o.p[1] < fy + r) {
            o.p[1] = fy + r;
            if (kind === 'drop' || Math.abs(o.v[1]) < 0.4) {
              o.rest = true;
              if (kind === 'drop') o.s = [o.s[0] * 2.2, o.s[0] * 0.25, o.s[0] * 2.2];
            } else {
              o.v[1] = -o.v[1] * o.bounce;
              o.v[0] *= 0.6;
              o.v[2] *= 0.6;
              o.w = vmul(o.w, 0.6);
            }
          }
        }
        L[n++] = o;
      }
      L.length = n;
      const mesh = P.mesh;
      for (let i = 0; i < n; i++) {
        const o = L[i];
        if (kind === 'drop') {
          // stretched along the velocity
          const sp = vlen(o.v);
          if (!o.rest && sp > 0.01) {
            _qa.setFromUnitVectors(_v1.set(0, 1, 0), _v2.set(o.v[0] / sp, o.v[1] / sp, o.v[2] / sp));
            _v3.set(o.s[0], o.s[0] * (1 + Math.min(sp * 0.06, 2.5)), o.s[0]);
          } else {
            _qa.identity();
            _v3.set(o.s[0], o.s[1], o.s[2]);
          }
          _m4.compose(_v1.set(o.p[0], o.p[1], o.p[2]), _qa, _v3);
        } else {
          const fade = Math.min(1, (o.life - o.age) * 3);
          _m4.compose(_v1.set(o.p[0], o.p[1], o.p[2]), o.q, _v3.set(o.s[0] * fade, o.s[1] * fade, o.s[2] * fade));
        }
        mesh.setMatrixAt(i, _m4);
        if (o.col && mesh.instanceColor) mesh.instanceColor.setXYZ(i, o.col[0], o.col[1], o.col[2]);
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    // bullet tracks
    for (let i = this.tracks.length - 1; i >= 0; i--) {
      const tr = this.tracks[i];
      tr.age += dt;
      const head = clamp(tr.age / tr.dur, 0, 1);
      tr.mat.uniforms.uHead.value = head * 1.02;
      tr.mat.uniforms.uFade.value = tr.age < tr.dur ? 1 : Math.max(0, 1 - (tr.age - tr.dur) / tr.life);
      if (tr.age > tr.dur + tr.life) {
        this.group.remove(tr.mesh);
        tr.mesh.geometry.dispose();
        tr.mat.dispose();
        this.tracks.splice(i, 1);
      } else any = 1;
    }
    this.alive = any;
  }

  dispose() {
    if (this.mist) {
      this.mist.geo.dispose();
      this.group.remove(this.mist.pts);
    }
    for (const k in this.inst) {
      this.inst[k].mesh.dispose();
      this.group.remove(this.inst[k].mesh);
    }
    for (const tr of this.tracks) {
      tr.mesh.geometry.dispose();
      tr.mat.dispose();
    }
    this.tracks.length = 0;
  }
}

const LONG_SEGS = new Set(['thighL', 'thighR', 'shinL', 'shinR', 'upperArmL', 'upperArmR', 'forearmL', 'forearmR']);
const CRACKABLE = new Set(['vert', 'pelvis', 'scapula', 'sternum', 'clavicle']);
const ORGAN_ALIAS = {
  heart: 'heart', aorta: 'aorta', 'lung l': 'lung L', lungl: 'lung L', 'left lung': 'lung L', 'lung r': 'lung R', lungr: 'lung R', 'right lung': 'lung R',
  liver: 'liver', spleen: 'spleen', stomach: 'stomach', 'kidney l': 'kidney L', kidneyl: 'kidney L', 'left kidney': 'kidney L', 'kidney r': 'kidney R', kidneyr: 'kidney R',
  'right kidney': 'kidney R', intestines: 'intestines', 'small intestine': 'intestines', 'lower intestine': 'lower intestine', 'large intestine': 'colon', colon: 'colon',
  bladder: 'bladder', brain: 'brain', trachea: 'trachea lower', airway: 'trachea lower',
};
const ORGAN_TYPE = { heart: OM.heart, aorta: OM.artery, 'lung L': OM.lung, 'lung R': OM.lung, liver: OM.liver, spleen: OM.spleen, stomach: OM.stomach, 'kidney L': OM.kidney, 'kidney R': OM.kidney, intestines: OM.gut, 'lower intestine': OM.gut, colon: OM.colon, bladder: OM.bladder, brain: OM.brain, 'trachea lower': OM.trachea };
const ORGAN_COLOR = {
  heart: [0.42, 0.03, 0.03], aorta: [0.5, 0.05, 0.05], 'lung L': [0.75, 0.32, 0.3], 'lung R': [0.75, 0.32, 0.3], liver: [0.3, 0.05, 0.03], spleen: [0.25, 0.04, 0.07],
  stomach: [0.75, 0.38, 0.32], 'kidney L': [0.35, 0.06, 0.05], 'kidney R': [0.35, 0.06, 0.05], intestines: [0.78, 0.42, 0.38], 'lower intestine': [0.78, 0.42, 0.38],
  colon: [0.62, 0.33, 0.27], bladder: [0.75, 0.5, 0.42], brain: [0.78, 0.55, 0.52], 'trachea lower': [0.78, 0.62, 0.58],
};

/**
 * X-ray view of one person: skeleton + organs following the ragdoll, plus slow-motion damage.
 *
 * Host usage:
 *   XRayRig.prebuildAsync();                       // at load (else the first use builds, ~1 s)
 *   const rig = new XRayRig(person, scene);        // cheap until first shown / damaged
 *   // kill cam starts:
 *   rig.setVisible(true, 0.3); XRayRig.setGhost(humanMesh, true);
 *   // on the round's flesh hits (sandbox 'fleshHit' events: entry, exit, dir, energy):
 *   rig.bulletTrack(entry, exit);
 *   rig.shatterSkull(entry, dir, energy) | rig.breakBone(seg, entry, dir, energy, { exit })
 *   rig.damageOrgan('heart', point, dir, energy)
 *   // every frame, after the HumanMesh update: dt = time-scaled sim seconds, alpha = physics lerp
 *   rig.update(dt, alpha);
 *   // kill cam ends:
 *   rig.setVisible(false, 0.25); XRayRig.setGhost(humanMesh, false);
 * Fades run on real time; fragments, particles and wounds on the dt passed to update().
 */
export class XRayRig {
  constructor(person, scene, opts = {}) {
    this.person = person;
    this.rd = person.rd;
    this.scene = scene;
    this.opts = opts;
    this.ready = false;
    this.visible = false;
    this.fade = 0;
    this.fadeFrom = 0;
    this.fadeTo = 0;
    this.fadeT0 = 0;
    this.fadeDur = 0;
    this.time = 0;
    this.floorY = opts.floorY ?? 0;
    this.gravity = opts.gravity ?? 9.81;
    this.speed = opts.speed ?? 1; // scales debris / fragment launch speeds
    this.rnd = mulberry(opts.seed ?? ((Math.random() * 1e9) | 0));
  }

  /** Build the shared geometry now (otherwise it is built on first use, ~1 s). */
  static prebuild() {
    xrayTemplate();
  }

  /** Build the shared geometry in slices across a few frames; resolves when done. */
  static prebuildAsync() {
    return buildTemplateAsync();
  }

  /** The shared translucent fresnel shell material (supports skinning). */
  static ghostMaterial() {
    if (!GHOST) GHOST = makeGhost();
    return GHOST;
  }

  /** Swap a HumanMesh's skin for the ghost shell (on) or restore its own material (off). */
  static setGhost(humanMesh, on) {
    const mesh = humanMesh.mesh || humanMesh;
    if (on) {
      if (!GHOST_PREV.has(mesh)) GHOST_PREV.set(mesh, { material: mesh.material, castShadow: mesh.castShadow });
      mesh.material = XRayRig.ghostMaterial();
    } else {
      const prev = GHOST_PREV.get(mesh);
      if (prev) {
        mesh.material = prev.material;
        mesh.castShadow = prev.castShadow;
        GHOST_PREV.delete(mesh);
      } else if (humanMesh.material && mesh.material === GHOST) mesh.material = humanMesh.material;
    }
  }

  _ensure() {
    if (this.ready) return;
    const T = xrayTemplate();
    this.T = T;
    const n = T.nPieces;
    this.data = new Float32Array(n * 12);
    this.tex = new THREE.DataTexture(this.data, 3, n, THREE.RGBAFormat, THREE.FloatType);
    this.tex.minFilter = THREE.NearestFilter;
    this.tex.magFilter = THREE.NearestFilter;
    this.tex.generateMipmaps = false;
    this.tex.needsUpdate = true;
    this.segNames = this.rd.segList.map((s) => s.name);
    const segIndex = Object.fromEntries(this.segNames.map((s, i) => [s, i]));
    this.pieceSeg = Int16Array.from(T.pieces.list, (p) => segIndex[p.seg] ?? 0);
    this.segM = new Float64Array(this.segNames.length * 12);
    this.mode = new Uint8Array(n);
    this.frag = new Int16Array(n).fill(-1);
    this.off = new Float64Array(n * 12);
    this.hasOff = new Uint8Array(n);
    this.bodyRef = new Array(n).fill(null);
    this.frags = [];
    this.anims = [];
    this.longBreaks = [];
    this.wounds = [];
    this.skullBroken = false;
    this.boneMat = boneMaterial(this.tex);
    this.organMat = organMaterial(this.tex);
    const mk = (geo, mat) => {
      const m = new THREE.Mesh(geo, mat);
      m.frustumCulled = false;
      m.matrixAutoUpdate = false;
      m.castShadow = false;
      m.receiveShadow = false;
      return m;
    };
    this.boneMesh = mk(T.boneGeo, this.boneMat);
    this.organMesh = mk(T.organGeo, this.organMat);
    this.group = new THREE.Group();
    this.group.matrixAutoUpdate = false;
    this.group.add(this.organMesh, this.boneMesh);
    this.group.visible = false;
    this.scene.add(this.group);
    this.fx = new XrayFx(this.group, this.rnd, this.floorY, this.gravity);
    this.ready = true;
    this._pose(1);
    this._write();
  }

  /** Show / hide with a dissolve over `fadeSeconds` of real time. */
  setVisible(on, fadeSeconds = 0.35) {
    if (on) this._ensure();
    if (!this.ready) return;
    this.visible = on;
    this.fadeFrom = this.fade;
    this.fadeTo = on ? 1 : 0;
    this.fadeT0 = now();
    this.fadeDur = Math.max(fadeSeconds, 0) * 1000;
    if (on) this.group.visible = true;
  }

  // ---------------------------------------------------------------- per frame

  update(dt = 1 / 60, alpha = 1) {
    if (!this.ready) return;
    if (this.fadeDur > 0) {
      const t = clamp((now() - this.fadeT0) / this.fadeDur, 0, 1);
      this.fade = this.fadeFrom + (this.fadeTo - this.fadeFrom) * t;
      if (t >= 1) this.fadeDur = 0;
    } else this.fade = this.fadeTo;
    if (!this.visible && this.fade <= 0) {
      this.group.visible = false;
      return;
    }
    this.group.visible = true;
    this.time += dt;
    this._pose(alpha);
    this._simulate(dt);
    this._write();
    this.fx.update(dt);
    const bu = this.boneMat.userData.uniforms, ou = this.organMat.userData.uniforms;
    bu.uFade.value = ou.uFade.value = this.fade;
    ou.uTime.value = this.time;
    // heartbeat (stops after a fatal heart / brain wound) and breathing
    if (this.heartStopAt && this.time > this.heartStopAt) this.heartStop = true;
    this.beatPhase = (this.beatPhase || 0) + dt * (this.heartStop ? 0 : this.heartRate || 1.3);
    const ph = this.beatPhase % 1;
    ou.uBeat.value = Math.pow(Math.max(0, Math.sin(ph * Math.PI * 2)), 3) + 0.4 * Math.pow(Math.max(0, Math.sin(ph * Math.PI * 2 - 1.1)), 4);
    ou.uBreath.value = Math.sin(this.time * 1.4);
  }

  /** segment matrices (bind -> world), interpolated like HumanMesh */
  _pose(alpha) {
    const segs = this.rd.segList, M = this.segM;
    for (let i = 0; i < segs.length; i++) this._bodyMat(segs[i].body, segs[i].bindPos, alpha, M, i * 12);
  }

  _bodyMat(body, bp, alpha, out, o) {
    const fp = body.framePos, p = body.pos;
    const px = fp.x + (p.x - fp.x) * alpha, py = fp.y + (p.y - fp.y) * alpha, pz = fp.z + (p.z - fp.z) * alpha;
    const fr = body.frameRot, r = body.rot;
    _qa.set(fr.x, fr.y, fr.z, fr.w);
    _qb.set(r.x, r.y, r.z, r.w);
    _qa.slerp(_qb, alpha);
    mat34(out, o, px, py, pz, _qa.x, _qa.y, _qa.z, _qa.w, bp.x, bp.y, bp.z);
  }

  _write() {
    const n = this.T.nPieces, D = this.data, M = this.segM;
    const tmp = this._tmp || (this._tmp = new Float64Array(12));
    for (let i = 0; i < n; i++) {
      const o = i * 12;
      const mode = this.mode[i];
      let src = M, so = this.pieceSeg[i] * 12;
      if (mode === MODE_FRAG) {
        const f = this.frags[this.frag[i]];
        mat34(tmp, 0, f.p[0], f.p[1], f.p[2], f.q.x, f.q.y, f.q.z, f.q.w, f.c[0], f.c[1], f.c[2]);
        src = tmp;
        so = 0;
      } else if (mode === MODE_BODY) {
        const b = this.bodyRef[i];
        this._bodyMat(b.body, b.bindPos, b.alpha ?? 1, tmp, 0);
        src = tmp;
        so = 0;
      }
      if (this.hasOff[i]) {
        const t2 = this._tmp2 || (this._tmp2 = new Float64Array(12));
        mul34(t2, 0, src, so, this.off, o);
        for (let k = 0; k < 12; k++) D[o + k] = t2[k];
      } else for (let k = 0; k < 12; k++) D[o + k] = src[so + k];
    }
    this.tex.needsUpdate = true;
  }

  _simulate(dt) {
    // free fragments
    const g = this.gravity, fy = this.floorY;
    for (const f of this.frags) {
      if (f.rest) continue;
      f.v[1] -= g * dt;
      const k = Math.exp(-f.drag * dt);
      f.v[0] *= k;
      f.v[1] *= k;
      f.v[2] *= k;
      f.p[0] += f.v[0] * dt;
      f.p[1] += f.v[1] * dt;
      f.p[2] += f.v[2] * dt;
      const wl = vlen(f.w);
      if (wl > 1e-6) {
        _qa.setFromAxisAngle(_v1.set(f.w[0] / wl, f.w[1] / wl, f.w[2] / wl), wl * dt);
        f.q.premultiply(_qa);
      }
      if (f.p[1] < fy + f.r) {
        f.p[1] = fy + f.r;
        if (Math.abs(f.v[1]) < 0.35) {
          f.v = [0, 0, 0];
          f.w = [0, 0, 0];
          f.rest = true;
        } else {
          f.v[1] = -f.v[1] * 0.28;
          f.v[0] *= 0.55;
          f.v[2] *= 0.55;
          f.w = vmul(f.w, 0.5);
        }
      }
    }
    // offset animations (cracks, displaced ribs, a dropping jaw): fast snap with a little overshoot
    for (const a of this.anims) {
      a.t += dt;
      const x = clamp(a.t / a.dur, 0, 1);
      const e = x >= 1 ? 1 : 1 - Math.exp(-6 * x) * Math.cos(9 * x);
      for (const id of a.pieces) {
        offset34(this.off, id * 12, a.pivot, a.axis, a.angle * e, vmul(a.tr, e));
        this.hasOff[id] = 1;
      }
    }
    // long bones whose segment has since been split by the physics: distal pieces follow the fragment
    for (const lb of this.longBreaks) {
      const seg = this.rd.segments[lb.seg];
      if (lb.followed || !seg.fractured) continue;
      const fr = seg.fractured;
      const body = fr.extra[0];
      const bindPos = body.userData && body.userData.bindPos ? body.userData.bindPos : fr.fragBind;
      // re-split at the physical break
      const L = this.T.long[lb.seg];
      const u = this._axisParam(L, vec(fr.pointBind));
      const k = this._nearestBound(L.bounds, u);
      for (let s = 0; s < L.ids.length; s++) {
        const id = L.ids[s];
        if (this.mode[id] === MODE_FRAG) continue;
        if (s > k) {
          this.mode[id] = MODE_BODY;
          this.bodyRef[id] = { body, bindPos };
        } else if (this.mode[id] === MODE_BODY) this.mode[id] = MODE_SEG;
      }
      // keep only a small separation of the jagged ends
      if (lb.anim) {
        lb.anim.angle *= 0.25;
        lb.anim.pieces = L.ids.slice(k + 1).filter((id) => this.mode[id] === MODE_BODY);
        for (let s = 0; s <= k; s++) this.hasOff[L.ids[s]] = 0;
      }
      lb.followed = true;
    }
  }

  // ---------------------------------------------------------------- helpers

  _toBind(segName, p, body = null) {
    const seg = this.rd.segments[segName];
    const b = body || seg.body;
    const bp = body && body.userData && body.userData.bindPos ? body.userData.bindPos : seg.bindPos;
    _qa.set(b.rot.x, b.rot.y, b.rot.z, b.rot.w).invert();
    _v1.set(p.x - b.pos.x, p.y - b.pos.y, p.z - b.pos.z).applyQuaternion(_qa);
    return [_v1.x + bp.x, _v1.y + bp.y, _v1.z + bp.z];
  }

  _dirToBind(segName, d) {
    const b = this.rd.segments[segName].body;
    _qa.set(b.rot.x, b.rot.y, b.rot.z, b.rot.w).invert();
    _v1.set(d.x, d.y, d.z).normalize().applyQuaternion(_qa);
    return [_v1.x, _v1.y, _v1.z];
  }

  _dirToWorld(segName, d) {
    const b = this.rd.segments[segName].body;
    _qa.set(b.rot.x, b.rot.y, b.rot.z, b.rot.w);
    _v1.set(d[0], d[1], d[2]).applyQuaternion(_qa);
    return [_v1.x, _v1.y, _v1.z];
  }

  _bindToWorld(segName, p) {
    const seg = this.rd.segments[segName];
    const b = seg.body, bp = seg.bindPos;
    _qa.set(b.rot.x, b.rot.y, b.rot.z, b.rot.w);
    _v1.set(p[0] - bp.x, p[1] - bp.y, p[2] - bp.z).applyQuaternion(_qa);
    return [_v1.x + b.pos.x, _v1.y + b.pos.y, _v1.z + b.pos.z];
  }

  _axisParam(L, pb) {
    const ab = vsub(L.b, L.a);
    return vdot(vsub(pb, L.a), ab) / vdot(ab, ab);
  }

  _nearestBound(bounds, u) {
    let k = 0, bd = Infinity;
    bounds.forEach((b, i) => {
      if (Math.abs(b - u) < bd) {
        bd = Math.abs(b - u);
        k = i;
      }
    });
    return k;
  }

  /** turn a group of pieces into a free-flying fragment (state in world space) */
  _launch(pieces, segName, vBind, spin, drag = 0.05) {
    if (!pieces.length) return null;
    const P = this.T.pieces.list;
    let area = 0;
    const c = [0, 0, 0];
    for (const id of pieces) {
      const pe = P[id];
      area += pe.area;
      c[0] += pe.c[0] * pe.area;
      c[1] += pe.c[1] * pe.area;
      c[2] += pe.c[2] * pe.area;
    }
    const cc = vmul(c, 1 / Math.max(area, 1e-9));
    let r = 0.004;
    for (const id of pieces) r = Math.max(r, Math.min(0.03, vlen(vsub(P[id].c, cc)) * 0.6));
    const seg = this.rd.segments[segName], b = seg.body;
    const p = this._bindToWorld(segName, cc);
    const v = this._dirToWorld(segName, vBind);
    // inherit the body's motion (linear + spin about its centre)
    const rel = vsub(p, vec(b.pos));
    const wv = vcross(vec(b.angVel), rel);
    const r2 = this.rnd;
    const ax = vnorm([r2() - 0.5, r2() - 0.5, r2() - 0.5]);
    const f = {
      pieces, c: cc, p, v: [v[0] + b.vel.x + wv[0], v[1] + b.vel.y + wv[1], v[2] + b.vel.z + wv[2]],
      q: new THREE.Quaternion(b.rot.x, b.rot.y, b.rot.z, b.rot.w), w: vadd(vmul(ax, spin), vec(b.angVel)), r, drag, rest: false,
    };
    const idx = this.frags.length;
    this.frags.push(f);
    for (const id of pieces) {
      this.mode[id] = MODE_FRAG;
      this.frag[id] = idx;
      this.hasOff[id] = 0;
    }
    return f;
  }

  /** grow fragments over cell adjacency: cells in `zone` grouped to ~size cells each */
  _groupCells(cells, adj, zoneOf, sizeOf) {
    const groups = [];
    const used = new Set();
    for (const c of cells) {
      if (used.has(c) || zoneOf(c) === null) continue;
      const z = zoneOf(c);
      const g = [c];
      used.add(c);
      const target = sizeOf(z);
      for (let k = 0; k < g.length && g.length < target; k++) {
        for (const nb of adj[g[k]]) {
          if (g.length >= target) break;
          if (!used.has(nb) && zoneOf(nb) === z) {
            used.add(nb);
            g.push(nb);
          }
        }
      }
      groups.push({ zone: z, cells: g });
    }
    return groups;
  }

  _offsetAnim(pieces, pivot, axis, angle, tr, dur = 0.05) {
    const a = { pieces, pivot, axis: vnorm(axis), angle, tr, t: 0, dur };
    this.anims.push(a);
    return a;
  }

  // ---------------------------------------------------------------- damage API

  /**
   * The cranium bursts along the round's path: a small entry hole, the exit side blown out into
   * small fragments, radial plates further out (the whole vault for a high-energy round), brain
   * chunks and a blood / brain mist. point/dir in world space, energy in joules.
   */
  shatterSkull(point, dir, energy = 2500) {
    this._ensure();
    const r = this.rnd, T = this.T, P = T.pieces.list;
    const seg = 'head';
    const pB = this._toBind(seg, point), dB = this._dirToBind(seg, dir);
    const e = clamp(energy / 2000, 0.25, 2.5) * this.speed;
    const se = Math.sqrt(e);
    // exit: far intersection with the skull's bounding ellipsoid
    const C = [0, 1.69, 0.0], R = [0.075, 0.098, 0.105];
    const o = vsub(pB, C);
    const A = vdot(vmul(dB, 1), [dB[0] / R[0] ** 2, dB[1] / R[1] ** 2, dB[2] / R[2] ** 2]);
    const Bq = 2 * (o[0] * dB[0] / R[0] ** 2 + o[1] * dB[1] / R[1] ** 2 + o[2] * dB[2] / R[2] ** 2);
    const Cq = (o[0] / R[0]) ** 2 + (o[1] / R[1]) ** 2 + (o[2] / R[2]) ** 2 - 1;
    const disc = Bq * Bq - 4 * A * Cq;
    const tEx = disc > 0 ? (-Bq + Math.sqrt(disc)) / (2 * A) : 0.14;
    const X = vax(pB, dB, clamp(tEx, 0.04, 0.25));
    const toLine = (c) => {
      const rel = vsub(c, pB);
      const s = clamp(vdot(rel, dB), 0, tEx);
      const q = vax(pB, dB, s);
      return { r: vlen(vsub(c, q)), out: vnorm(vsub(c, q)), s };
    };
    const first = !this.skullBroken;
    this.skullBroken = true;
    const Rb = 0.035 + 0.03 * se, Rr = 0.045 + 0.04 * se;
    const launchCells = (ids, adj, faceOnly, scale) => {
      const zoneOf = (ci) => {
        const id = ids[ci];
        if (this.mode[id] === MODE_FRAG) return null;
        const c = P[id].c;
        const dX = vlen(vsub(c, X)), dE = vlen(vsub(c, pB));
        const L = toLine(c);
        if (dE < 0.022) return 'entry';
        if (dX < Rb) return 'blow';
        if (L.r < Rr) return 'burst';
        if (!faceOnly && e > 0.9 && c[1] > 1.668 && c[2] < 0.065) return 'plate';
        return null;
      };
      const cells = ids.map((_, i) => i).sort((a, b) => vlen(vsub(P[ids[a]].c, X)) - vlen(vsub(P[ids[b]].c, X)));
      const groups = this._groupCells(cells, adj, zoneOf, (z) => (z === 'blow' ? 1 + (r() < 0.3 ? 1 : 0) : z === 'entry' ? 1 : z === 'burst' ? 2 + Math.floor(r() * 2) : 3 + Math.floor(r() * 4)));
      for (const g of groups) {
        const pieces = g.cells.map((ci) => ids[ci]);
        const c = P[pieces[0]].c;
        const L = toLine(c);
        let v, spin;
        if (g.zone === 'blow') {
          v = vax([0, 0, 0], dB, rand(r, 4.5, 11) * se, L.out, rand(r, 1.5, 4.5) * se, coneDir(r, dB, Math.PI), 0.8);
          spin = rand(r, 18, 50);
        } else if (g.zone === 'entry') {
          v = vax([0, 0, 0], dB, rand(r, 0.8, 2.2), coneDir(r, dB, Math.PI), 0.4);
          spin = rand(r, 8, 30);
        } else if (g.zone === 'burst') {
          v = vax([0, 0, 0], L.out, rand(r, 1.4, 3.8) * se, dB, rand(r, 1.2, 3.4) * se, coneDir(r, dB, Math.PI), 0.5);
          spin = rand(r, 8, 26);
        } else {
          v = vax([0, 0, 0], L.out, rand(r, 0.5, 1.5) * e, dB, rand(r, 0.3, 1.1), [0, 1, 0], rand(r, 0.1, 0.6));
          spin = rand(r, 3, 9);
        }
        this._launch(pieces, seg, vmul(v, scale), spin, 0.08);
      }
    };
    launchCells(T.skull.pieces, T.skull.adj, false, 1);
    // jaw: shattered when the path runs close to it, otherwise it drops open
    const jawC = [0, 1.592, 0.035];
    const jawHit = toLine(jawC).r < 0.045;
    if (jawHit) launchCells(T.skull.jaw, T.skull.jawAdj, true, 0.9);
    else if (first && e > 0.6) {
      this._offsetAnim(T.skull.jaw.filter((id) => this.mode[id] !== MODE_FRAG), [0, 1.65, -0.012], [1, 0, 0], 0.32 + 0.1 * r(), [0, -0.002, 0], 0.12);
    }
    // brain: chunks near the path fly out, the rest gets a crater along the wound channel
    const bIds = T.brain.pieces;
    const bZone = (ci) => {
      const id = bIds[ci];
      if (this.mode[id] === MODE_FRAG) return null;
      const c = P[id].c;
      const L = toLine(c);
      if (vlen(vsub(c, X)) < Rb * 1.25 || L.r < 0.022 + 0.012 * se) return 'b';
      if (e > 1.4 && L.r < 0.05 && L.s > tEx * 0.45) return 'b2';
      return null;
    };
    const bCells = bIds.map((_, i) => i).sort((a, b) => vlen(vsub(P[bIds[a]].c, X)) - vlen(vsub(P[bIds[b]].c, X)));
    for (const g of this._groupCells(bCells, T.brain.adj, bZone, (z) => (z === 'b' ? 1 : 2))) {
      const pieces = g.cells.map((ci) => bIds[ci]);
      const L = toLine(P[pieces[0]].c);
      const v = vax([0, 0, 0], dB, rand(r, 2, 6.5) * se * (g.zone === 'b' ? 1 : 0.6), L.out, rand(r, 0.8, 2.2) * se, coneDir(r, dB, Math.PI), 0.4);
      this._launch(pieces, seg, v, rand(r, 4, 16), 0.25);
    }
    this._wound(seg, OM.brain, pB, dB, 0.016 + 0.006 * se, 0.9 + 0.5 * e);
    // particles (world space)
    const Pw = vec(point), Xw = this._bindToWorld(seg, X), Dw = this._dirToWorld(seg, dB);
    const back = vmul(Dw, -1);
    const fx = this.fx;
    fx.mistBurst(Xw, Dw, Math.round(520 * Math.min(e, 1.6)), 8 * se, 0.6, 0.0055, 1.1, 0.35, 6);
    fx.mistBurst(Xw, Dw, Math.round(160 * Math.min(e, 1.6)), 3.5 * se, 1.1, 0.014, 1.6, 0.55, 4);
    fx.mistBurst(Pw, back, 70, 2.2, 0.6, 0.004, 0.8, 0.15, 8);
    fx.spray('drop', Xw, Dw, Math.round(150 * Math.min(e, 1.8)), 8 * se, 0.55, 0.0019, { life: 3, drag: 0.5 });
    fx.spray('drop', Pw, back, 24, 2.2, 0.6, 0.0014, { life: 3 });
    fx.spray('chunk', Xw, Dw, Math.round(26 * Math.min(e, 1.6)), 5.5 * se, 0.5, 0.0085, { color: ORGAN_COLOR.brain, life: 3, drag: 0.3 });
    fx.spray('shard', Xw, Dw, Math.round(50 * Math.min(e, 1.6)), 7 * se, 0.7, 0.0055, { life: 3 });
    fx.spray('shard', Pw, back, 12, 1.6, 0.8, 0.003, { life: 3 });
    this.heartStop = true;
    return { exit: Xw, fragments: this.frags.length };
  }

  /**
   * Snap a bone. Long bones (thigh, shin, upper arm, forearm) break at the section border nearest
   * to `point` (jagged ends, splinters; the distal part follows the physical fragment body when the
   * segment is fractured). 'chest' breaks the 1-3 ribs nearest to `point` and returns them;
   * pelvis / neck / abdomen crack the nearest bone and chip it.
   * opts: { count (ribs), exit (world point: rib selection along the whole path) }
   */
  breakBone(segName, point, dir, energy = 400, opts = {}) {
    this._ensure();
    if (segName === 'chest') {
      const pB = this._toBind('chest', point);
      let ribD = Infinity;
      for (const side of ['L', 'R']) for (let i = 1; i <= 12; i++) for (const p of this.T.ribs[side][i].path) ribD = Math.min(ribD, vlen(vsub(p, pB)));
      let other = Infinity;
      for (const p of this.T.pieces.list) if (p.seg === 'chest' && CRACKABLE.has(p.kind) && p.kind !== 'vert') other = Math.min(other, vlen(vsub(p.c, pB)));
      if (other + 0.005 < ribD * 0.6 && !opts.count) return [this._crack('chest', point, dir, energy)];
      return this._breakRibs(point, dir, energy, opts);
    }
    if (segName === 'head') return this.shatterSkull(point, dir, energy);
    if (LONG_SEGS.has(segName)) return this._breakLong(segName, point, dir, energy);
    return this._crack(segName, point, dir, energy);
  }

  _chips(pw, dw, energy, n = 12, size = 0.004) {
    const e = clamp(energy / 1500, 0.2, 2.5) * this.speed;
    const se = Math.sqrt(e);
    this.fx.spray('shard', pw, dw, Math.round(n * Math.min(e, 1.6) + 3), 4.5 * se, 0.8, size, { life: 3 });
    this.fx.spray('drop', pw, dw, Math.round(n * 1.5 * Math.min(e, 1.6) + 4), 4 * se, 0.7, 0.0016, { life: 3 });
    this.fx.mistBurst(pw, dw, Math.round(60 + 90 * Math.min(e, 1.6)), 3 * se, 0.7, 0.005, 0.9, 0.1, 7);
  }

  _breakLong(segName, point, dir, energy) {
    const T = this.T, L = T.long[segName];
    const seg = this.rd.segments[segName];
    let pB = this._toBind(segName, point);
    if (seg.fractured) {
      const fb = seg.fractured.extra[0];
      const alt = this._toBind(segName, point, fb);
      if (this._axisParam(L, alt) > this._axisParam(L, vec(seg.fractured.pointBind))) pB = alt;
    }
    const dB = this._dirToBind(segName, dir);
    const u = this._axisParam(L, pB);
    const k = this._nearestBound(L.bounds, u);
    const e = clamp(energy / 1500, 0.2, 2.5) * this.speed;
    const prev = this.longBreaks.find((b) => b.seg === segName);
    const pw = vec(point);
    if (!prev) {
      const Pk = vlerp(L.a, L.b, L.bounds[k]);
      const ax = vnorm(vsub(L.b, L.a));
      const side = vsub(dB, vmul(ax, vdot(dB, ax)));
      const rotAx = vlen(side) > 1e-4 ? vnorm(vcross(ax, side)) : perpBasis(ax)[0];
      const distal = L.ids.slice(k + 1);
      const anim = this._offsetAnim(distal, Pk, rotAx, (0.12 + 0.12 * Math.sqrt(e)) * (this.rnd() < 0.5 ? 1 : 0.75), vmul(vnorm(vlen(side) > 1e-4 ? side : dB), 0.006 + 0.004 * e), 0.06);
      this.longBreaks.push({ seg: segName, k, anim, followed: false });
      if (e > 0.6 && k + 1 < L.ids.length - 1) {
        // comminuted: the section just beyond the break is blasted out as a butterfly fragment
        const r = this.rnd;
        const fragId = L.ids[k + 1];
        this._launch([fragId], segName, vmul(coneDir(r, dB, 0.6), rand(r, 2, 4.5) * Math.sqrt(e)), rand(r, 15, 40), 0.15);
        anim.pieces = L.ids.slice(k + 2);
      }
    }
    const dw = this._dirToWorld(segName, dB);
    this._chips(pw, dw, energy, 18, 0.006);
    return { bone: segName, section: k, u };
  }

  _breakRibs(point, dir, energy, opts) {
    const T = this.T, r = this.rnd;
    const pB = this._toBind('chest', point), dB = this._dirToBind('chest', dir);
    // without an exit point, follow the round 25 cm into the chest
    const qB = opts.exit ? this._toBind('chest', opts.exit) : vax(pB, dB, 0.25);
    const e = clamp(energy / 1500, 0.2, 2.5) * this.speed;
    const se = Math.sqrt(e);
    const penetrating = opts.blunt ? false : opts.penetrating ?? energy > 500;
    const cand = [];
    const ab = vsub(qB, pB), l2 = Math.max(vdot(ab, ab), 1e-9);
    for (const side of ['L', 'R']) {
      for (let i = 1; i <= 12; i++) {
        const rib = T.ribs[side][i];
        let best = Infinity, bi = 0;
        rib.path.forEach((p, j) => {
          const t = clamp(vdot(vsub(p, pB), ab) / l2, 0, 1);
          const d = vlen(vsub(p, vax(pB, ab, t)));
          if (d < best) {
            best = d;
            bi = j;
          }
        });
        cand.push({ side, i, d: best, j: bi, rib });
      }
    }
    cand.sort((a, b) => a.d - b.d);
    const n = opts.count ?? (energy > 1200 ? 3 : energy > 350 ? 2 : 1);
    const out = [];
    const broken = this.brokenRibs || (this.brokenRibs = new Set());
    for (const c of cand) {
      if (out.length >= n) break;
      if (out.length && c.d > 0.03 + 0.015 * se) break;
      if (broken.has(c.side + c.i)) continue;
      broken.add(c.side + c.i);
      const { path, pieces, ns } = c.rib;
      const u = c.j / (path.length - 1);
      const hit = clamp(Math.floor(u * ns), 1, ns - 2); // section under the impact
      const P0 = path[0], P1 = path[path.length - 1];
      const Pk = path[Math.round(((hit + 0.5) / ns) * (path.length - 1))];
      const pw = this._bindToWorld('chest', Pk), dw = this._dirToWorld('chest', dB);
      const near = c.d < 0.02 + 0.01 * se;
      if (penetrating && near) {
        // the round blows the hit piece of rib out; the ends either side spring back a little
        const vOut = vmul(vnorm(vax(coneDir(r, dB, 0.5), coneDir(r, dB, Math.PI), 0.4)), rand(r, 2.5, 5.5) * se);
        this._launch([pieces[hit]], 'chest', vOut, rand(r, 20, 50), 0.15);
        const back = vmul(dB, -0.003);
        const k0 = hit, k1 = hit + 1;
        const ePrev = path[Math.round((k0 / ns) * (path.length - 1))], eNext = path[Math.round((k1 / ns) * (path.length - 1))];
        this._offsetAnim(pieces.slice(0, k0), P0, vnorm(vcross(vsub(ePrev, P0), vadd(back, [0, -0.002, 0]))), 0.004 / Math.max(vlen(vsub(ePrev, P0)), 0.02), [0, 0, 0], 0.04);
        this._offsetAnim(pieces.slice(k1), P1, vnorm(vcross(vsub(eNext, P1), vadd(back, [0, 0.002, 0]))), 0.004 / Math.max(vlen(vsub(eNext, P1)), 0.02), [0, 0, 0], 0.04);
        this.fx.spray('shard', pw, dw, Math.round(14 * Math.min(e, 1.6) + 4), 4.5 * se, 0.6, 0.0045, { life: 3 });
      } else {
        // snapped: both halves are driven inward and slip past each other at the break
        const k = hit + (u * ns - hit > 0.5 ? 1 : 0);
        const Pb = path[Math.round((k / ns) * (path.length - 1))];
        const push = 0.007 + 0.009 * se;
        const tang = vnorm(vsub(path[Math.min(path.length - 1, Math.round((k / ns) * (path.length - 1)) + 2)], Pb));
        const wall = vnorm(vcross(tang, dB));
        const d1 = vax([0, 0, 0], dB, push * 0.9, wall, push * 0.35);
        const d2 = vax([0, 0, 0], dB, push * 0.6, wall, -push * 0.45);
        this._offsetAnim(pieces.slice(0, k), P0, vnorm(vcross(vsub(Pb, P0), d1)), vlen(d1) / Math.max(vlen(vsub(Pb, P0)), 0.02), [0, 0, 0], 0.045);
        this._offsetAnim(pieces.slice(k), P1, vnorm(vcross(vsub(Pb, P1), d2)), vlen(d2) / Math.max(vlen(vsub(Pb, P1)), 0.02), [0, 0, 0], 0.05);
      }
      this._chips(pw, dw, energy * 0.5, 6, 0.0035);
      out.push({ rib: c.i, side: c.side, name: `${c.side === 'L' ? 'left' : 'right'} rib ${c.i}`, shattered: penetrating && near });
    }
    return out;
  }

  _crack(segName, point, dir, energy) {
    const T = this.T, P = T.pieces.list;
    const pB = this._toBind(segName, point), dB = this._dirToBind(segName, dir);
    const e = clamp(energy / 1500, 0.2, 2.5) * this.speed;
    let best = -1, bd = Infinity;
    P.forEach((p, id) => {
      if (p.seg !== segName || !CRACKABLE.has(p.kind)) return;
      const d = vlen(vsub(p.c, pB));
      if (d < bd) {
        bd = d;
        best = id;
      }
    });
    if (best >= 0 && this.mode[best] === MODE_SEG && !this.hasOff[best]) {
      const ax = vnorm(vcross([0, 1, 0], dB));
      this._offsetAnim([best], P[best].c, vlen(ax) > 0.1 ? ax : [1, 0, 0], 0.05 + 0.05 * Math.sqrt(e), vmul(dB, 0.003 + 0.003 * e), 0.05);
    }
    this._chips(vec(point), this._dirToWorld(segName, dB), energy, 12, 0.005);
    return { bone: best >= 0 ? P[best].kind : null, piece: best };
  }

  /** organ deformation along a wound channel (bind space of segName) */
  _wound(segName, type, pB, dB, R, strength) {
    const u = this.organMat.userData.uniforms;
    const i = this.wounds.length < MAX_ORGAN_WOUNDS ? this.wounds.length : this.wounds.length % MAX_ORGAN_WOUNDS;
    this.wounds.push({ segName, type });
    u.uWA.value[i].set(pB[0], pB[1], pB[2], R);
    u.uWB.value[i].set(dB[0], dB[1], dB[2], type);
    u.uWC.value[i].set(this.time, strength, 0, this.rnd() * 10);
    u.uWN.value = Math.min(this.wounds.length, MAX_ORGAN_WOUNDS);
  }

  /** Rupture an organ (names as in organs.js: heart, lung L, liver, ...): burst + blood spray. */
  damageOrgan(name, point, dir, energy = 800) {
    this._ensure();
    let key = ORGAN_ALIAS[String(name).toLowerCase()] || name;
    if (key === 'lung' || key === 'lungs' || key === 'kidney' || key === 'kidneys') {
      const x = this._toBind('chest', point)[0];
      key = (key.startsWith('lung') ? 'lung ' : 'kidney ') + (x >= 0 ? 'L' : 'R');
    }
    const pid = this.T.organPieces[key];
    if (pid === undefined) return null;
    const segName = this.T.pieces.list[pid].seg;
    const pB = this._toBind(segName, point), dB = this._dirToBind(segName, dir);
    const e = clamp(energy / 1200, 0.2, 2.5) * this.speed;
    const se = Math.sqrt(e);
    const big = key === 'heart' || key === 'liver' || key.startsWith('lung');
    this._wound(segName, ORGAN_TYPE[key] ?? -1, pB, dB, (big ? 0.016 : 0.012) + 0.008 * se, 0.75 + 0.55 * e);
    const pw = vec(point), dw = this._dirToWorld(segName, dB);
    const col = ORGAN_COLOR[key] || [0.5, 0.05, 0.05];
    const fx = this.fx;
    fx.spray('chunk', pw, dw, Math.round((big ? 14 : 8) * Math.min(e, 1.8)), 3.5 * se, 0.6, big ? 0.007 : 0.0055, { color: col, life: 3, drag: 0.4 });
    fx.spray('drop', pw, dw, Math.round(90 * Math.min(e, 1.8)), 5 * se, 0.65, 0.0018, { life: 3 });
    fx.spray('drop', pw, vmul(dw, -1), 16, 1.5, 0.8, 0.0014, { life: 3 });
    fx.mistBurst(pw, dw, Math.round(220 * Math.min(e, 1.8)), 4.5 * se, 0.7, 0.005, 1.1, key.startsWith('lung') ? 0.45 : 0.1, 6);
    if (key === 'heart') {
      this.heartRate = 3.2;
      this.heartStopAt = this.time + 0.6;
    }
    return { organ: key, wound: this.wounds.length - 1 };
  }

  /** A glowing wound-track streak along the round's path (world points). */
  bulletTrack(entry, exit, opts = {}) {
    this._ensure();
    return this.fx.track(vec(entry), vec(exit), opts.duration ?? 0.01, opts.life ?? 0.16);
  }

  dispose() {
    if (!this.ready) return;
    this.scene.remove(this.group);
    this.fx.dispose();
    this.boneMat.dispose();
    this.organMat.dispose();
    this.tex.dispose();
    this.ready = false;
  }
}
