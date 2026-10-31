import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/**
 * meleeModels.js — procedural first-person melee props (tactical knife, baseball bat, combat boot
 * with the lower leg) and the small signed-distance-field toolkit the viewmodel uses for organic
 * shapes (hands, boot): SDF primitives, a narrow-band surface-nets mesher and a quadric-error
 * decimator. No external assets; everything is built once and cached.
 *
 * Conventions (metres): a hand-held item's origin is the centre of the right hand's grip, its
 * striking direction along local -Z (knife blade / bat barrel), its "up" (knife spine) +Y.
 */

// =============================================================================================
// SDF primitives (all distances in metres)
// =============================================================================================

/** Polynomial smooth minimum (k = blend radius). */
export function smin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}
/** Smooth maximum (for smooth subtraction use smax(a, -b, k)). */
export function smax(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.max(a, b) + h * h * k * 0.25;
}

/**
 * Round cone (tapered capsule) between a (radius ra) and b (radius rb). Returns an object with
 * precomputed constants; evaluate with roundCone(c, x, y, z).
 */
export function makeRoundCone(a, b, ra, rb) {
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  const l2 = bax * bax + bay * bay + baz * baz;
  const rr = ra - rb;
  return { ax: a[0], ay: a[1], az: a[2], bax, bay, baz, l2, rr, a2: l2 - rr * rr, il2: 1 / l2, ra, rb };
}
export function roundCone(c, px, py, pz) {
  const pax = px - c.ax, pay = py - c.ay, paz = pz - c.az;
  const y = pax * c.bax + pay * c.bay + paz * c.baz;
  const z = y - c.l2;
  const qx = pax * c.l2 - c.bax * y, qy = pay * c.l2 - c.bay * y, qz = paz * c.l2 - c.baz * y;
  const x2 = qx * qx + qy * qy + qz * qz;
  const y2 = y * y * c.l2, z2 = z * z * c.l2;
  const k = Math.sign(c.rr) * c.rr * c.rr * x2;
  if (Math.sign(z) * c.a2 * z2 > k) return Math.sqrt(x2 + z2) * c.il2 - c.rb;
  if (Math.sign(y) * c.a2 * y2 < k) return Math.sqrt(x2 + y2) * c.il2 - c.ra;
  return (Math.sqrt(x2 * c.a2 * c.il2) + y * c.rr) * c.il2 - c.ra;
}
/** Parameter (0..1) of the closest point on a round cone's axis (for weights / regions). */
export function coneT(c, px, py, pz) {
  const t = ((px - c.ax) * c.bax + (py - c.ay) * c.bay + (pz - c.az) * c.baz) * c.il2;
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/** Rounded box centred at the origin of a local frame (half extents hx, hy, hz, corner radius r). */
export function roundBox(px, py, pz, hx, hy, hz, r) {
  const qx = Math.abs(px) - hx + r, qy = Math.abs(py) - hy + r, qz = Math.abs(pz) - hz + r;
  const mx = Math.max(qx, 0), my = Math.max(qy, 0), mz = Math.max(qz, 0);
  return Math.sqrt(mx * mx + my * my + mz * mz) + Math.min(Math.max(qx, Math.max(qy, qz)), 0) - r;
}
/** Ellipsoid (approximate distance, good near the surface). */
export function ellipsoid(px, py, pz, rx, ry, rz) {
  const ax = px / rx, ay = py / ry, az = pz / rz;
  const k0 = Math.sqrt(ax * ax + ay * ay + az * az);
  const bx = ax / rx, by = ay / ry, bz = az / rz;
  const k1 = Math.sqrt(bx * bx + by * by + bz * bz);
  return k1 > 1e-12 ? (k0 * (k0 - 1)) / k1 : -Math.min(rx, ry, rz);
}

/** A local frame for evaluating primitives in rotated space: origin o, orthonormal axes. */
export function makeFrame(o, xAxis, yAxis) {
  const x = new THREE.Vector3(...xAxis).normalize();
  let y = new THREE.Vector3(...yAxis);
  y.addScaledVector(x, -y.dot(x)).normalize();
  const z = new THREE.Vector3().crossVectors(x, y);
  return { ox: o[0], oy: o[1], oz: o[2], xx: x.x, xy: x.y, xz: x.z, yx: y.x, yy: y.y, yz: y.z, zx: z.x, zy: z.y, zz: z.z };
}
/** World -> frame-local coordinates into out[0..2]. */
export function toFrame(f, px, py, pz, out) {
  const dx = px - f.ox, dy = py - f.oy, dz = pz - f.oz;
  out[0] = dx * f.xx + dy * f.xy + dz * f.xz;
  out[1] = dx * f.yx + dy * f.yy + dz * f.yz;
  out[2] = dx * f.zx + dy * f.zy + dz * f.zz;
  return out;
}

// =============================================================================================
// Surface nets (narrow band) + projection onto the surface + SDF normals
// =============================================================================================

/**
 * Mesh the zero set of `f(x, y, z)` inside bounds {min: [x,y,z], max: [x,y,z]} with cell size h.
 * Returns { positions: Float32Array, normals: Float32Array, indices: Uint32Array }.
 * The SDF should be (roughly) 1-Lipschitz; far-away cells are skipped using a coarse pass.
 */
export function meshSDF(f, bounds, h, opts = {}) {
  const x0 = bounds.min[0], y0 = bounds.min[1], z0 = bounds.min[2];
  const nx = Math.ceil((bounds.max[0] - x0) / h) + 1, ny = Math.ceil((bounds.max[1] - y0) / h) + 1, nz = Math.ceil((bounds.max[2] - z0) / h) + 1;
  const sxy = nx * ny;
  const vals = new Float32Array(nx * ny * nz);
  // narrow band: 2x2x2 point blocks whose centre is far from the surface only get the sign (every
  // corner of a cell the surface crosses is still evaluated exactly, with a safety margin)
  const far = h * (1.732 + 0.87) * 1.25;
  const fill = (i0, i1, j0, j1, k0, k1, v) => {
    for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) vals.fill(v, k * sxy + j * nx + i0, k * sxy + j * nx + i1 + 1);
  };
  const block2 = (bi, bj, bk) => {
    const i1 = Math.min(bi + 1, nx - 1), j1 = Math.min(bj + 1, ny - 1), k1 = Math.min(bk + 1, nz - 1);
    const dc = f(x0 + ((bi + i1) / 2) * h, y0 + ((bj + j1) / 2) * h, z0 + ((bk + k1) / 2) * h);
    if (Math.abs(dc) > far) return fill(bi, i1, bj, j1, bk, k1, dc > 0 ? far : -far);
    for (let k = bk; k <= k1; k++) {
      for (let j = bj; j <= j1; j++) {
        let o = k * sxy + j * nx + bi;
        for (let i = bi; i <= i1; i++, o++) vals[o] = f(x0 + i * h, y0 + j * h, z0 + k * h);
      }
    }
  };
  // outer level: 4x4x4 point blocks (centre test with the larger radius)
  const far4 = h * (2.6 + 1.732) * 1.25;
  for (let bk = 0; bk < nz; bk += 4) {
    const k1 = Math.min(bk + 3, nz - 1);
    for (let bj = 0; bj < ny; bj += 4) {
      const j1 = Math.min(bj + 3, ny - 1);
      for (let bi = 0; bi < nx; bi += 4) {
        const i1 = Math.min(bi + 3, nx - 1);
        const dc = f(x0 + ((bi + i1) / 2) * h, y0 + ((bj + j1) / 2) * h, z0 + ((bk + k1) / 2) * h);
        if (Math.abs(dc) > far4) fill(bi, i1, bj, j1, bk, k1, dc > 0 ? far : -far);
        else for (let k = bk; k <= k1; k += 2) for (let j = bj; j <= j1; j += 2) for (let i = bi; i <= i1; i += 2) block2(i, j, k);
      }
    }
  }
  // one vertex per cell with a sign change (mass point of the edge crossings)
  const cnx = nx - 1, cny = ny - 1, cnz = nz - 1;
  const cellV = new Int32Array(cnx * cny * cnz).fill(-1);
  const pos = [];
  const corner = [0, 1, nx, nx + 1, sxy, sxy + 1, sxy + nx, sxy + nx + 1];
  const cOff = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const cv = new Float32Array(8);
  for (let k = 0; k < cnz; k++) {
    for (let j = 0; j < cny; j++) {
      for (let i = 0; i < cnx; i++) {
        const base = k * sxy + j * nx + i;
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          cv[c] = vals[base + corner[c]];
          if (cv[c] < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let sx = 0, sy = 0, sz = 0, n = 0;
        for (const [a, b] of edges) {
          const va = cv[a], vb = cv[b];
          if (va < 0 === vb < 0) continue;
          const t = va / (va - vb);
          const A = cOff[a], Bc = cOff[b];
          sx += A[0] + (Bc[0] - A[0]) * t;
          sy += A[1] + (Bc[1] - A[1]) * t;
          sz += A[2] + (Bc[2] - A[2]) * t;
          n++;
        }
        cellV[k * cny * cnx + j * cnx + i] = pos.length / 3;
        pos.push(x0 + (i + sx / n) * h, y0 + (j + sy / n) * h, z0 + (k + sz / n) * h);
      }
    }
  }
  // quads across every grid edge with a sign change
  const idx = [];
  const cid = (i, j, k) => cellV[k * cny * cnx + j * cnx + i];
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) idx.push(a, d, c, a, c, b);
    else idx.push(a, b, c, a, c, d);
  };
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const o = k * sxy + j * nx + i;
        const inside = vals[o] < 0;
        // edge along x
        if (i < nx - 1 && j > 0 && k > 0 && j < ny - 1 && k < nz - 1 && inside !== vals[o + 1] < 0) {
          quad(cid(i, j - 1, k - 1), cid(i, j, k - 1), cid(i, j, k), cid(i, j - 1, k), !inside);
        }
        if (j < ny - 1 && i > 0 && k > 0 && i < nx - 1 && k < nz - 1 && inside !== vals[o + nx] < 0) {
          quad(cid(i - 1, j, k - 1), cid(i - 1, j, k), cid(i, j, k), cid(i, j, k - 1), !inside);
        }
        if (k < nz - 1 && i > 0 && j > 0 && i < nx - 1 && j < ny - 1 && inside !== vals[o + sxy] < 0) {
          quad(cid(i - 1, j - 1, k), cid(i, j - 1, k), cid(i, j, k), cid(i - 1, j, k), !inside);
        }
      }
    }
  }
  let positions = new Float32Array(pos);
  let indices = new Uint32Array(idx);
  if (opts.targetTris && indices.length / 3 > opts.targetTris) {
    projectToSurface(f, positions, h * 0.25, 1, false); // decimate the true surface, not the grid's estimate
    const d = decimate(positions, indices, opts.targetTris, opts.maxError);
    positions = d.positions;
    indices = d.indices;
  }
  const normals = projectToSurface(f, positions, h * 0.25, opts.project ?? 2);
  return { positions, normals, indices };
}

/**
 * Newton-project vertices onto f = 0 (forward-difference steps); returns unit normals (central
 * difference SDF gradient) per vertex, or null when normals = false.
 */
export function projectToSurface(f, positions, eps, iters = 2, normalsOut = true) {
  const n = positions.length / 3;
  const normals = normalsOut ? new Float32Array(n * 3) : null;
  for (let v = 0; v < n; v++) {
    let x = positions[v * 3], y = positions[v * 3 + 1], z = positions[v * 3 + 2];
    for (let it = 0; it < iters; it++) {
      const d = f(x, y, z);
      let gx = f(x + eps, y, z) - d, gy = f(x, y + eps, z) - d, gz = f(x, y, z + eps) - d;
      const gl = Math.hypot(gx, gy, gz) || 1;
      const step = Math.max(-eps * 8, Math.min(eps * 8, d));
      x -= (gx / gl) * step;
      y -= (gy / gl) * step;
      z -= (gz / gl) * step;
    }
    positions[v * 3] = x;
    positions[v * 3 + 1] = y;
    positions[v * 3 + 2] = z;
    if (!normals) continue;
    let gx = f(x + eps, y, z) - f(x - eps, y, z);
    let gy = f(x, y + eps, z) - f(x, y - eps, z);
    let gz = f(x, y, z + eps) - f(x, y, z - eps);
    const gl = Math.hypot(gx, gy, gz) || 1;
    normals[v * 3] = gx / gl;
    normals[v * 3 + 1] = gy / gl;
    normals[v * 3 + 2] = gz / gl;
  }
  return normals;
}

// =============================================================================================
// Quadric-error edge-collapse decimation (closed manifold triangle meshes)
// =============================================================================================

/**
 * Reduce an indexed triangle mesh to about `target` triangles (Garland-Heckbert quadrics, link
 * condition + normal-flip checks). Returns compacted { positions, indices }.
 */
export function decimate(posIn, idxIn, target, maxError = Infinity) {
  const nv = posIn.length / 3, nf = idxIn.length / 3;
  const P = Float64Array.from(posIn);
  const F = Int32Array.from(idxIn);
  const faceAlive = new Uint8Array(nf).fill(1);
  const vAlive = new Uint8Array(nv).fill(1);
  const ver = new Uint32Array(nv);
  const Q = new Float64Array(nv * 10);
  const vf = Array.from({ length: nv }, () => []);
  for (let f = 0; f < nf; f++) {
    const a = F[f * 3], b = F[f * 3 + 1], c = F[f * 3 + 2];
    vf[a].push(f);
    vf[b].push(f);
    vf[c].push(f);
    const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2];
    const wx = P[c * 3] - P[a * 3], wy = P[c * 3 + 1] - P[a * 3 + 1], wz = P[c * 3 + 2] - P[a * 3 + 2];
    let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const l = Math.hypot(nx, ny, nz);
    if (l < 1e-20) continue;
    const area = l * 0.5;
    nx /= l;
    ny /= l;
    nz /= l;
    const d = -(nx * P[a * 3] + ny * P[a * 3 + 1] + nz * P[a * 3 + 2]);
    const q = [nx * nx, nx * ny, nx * nz, nx * d, ny * ny, ny * nz, ny * d, nz * nz, nz * d, d * d];
    for (const v of [a, b, c]) for (let i = 0; i < 10; i++) Q[v * 10 + i] += q[i] * area;
  }
  // binary min-heap of candidate collapses: the heap holds entry ids, entries live in pools
  let cap = nf * 4;
  let ec = new Float64Array(cap), ea = new Int32Array(cap), eb = new Int32Array(cap), eva = new Uint32Array(cap), evb = new Uint32Array(cap), exyz = new Float64Array(cap * 3);
  let heap = new Int32Array(cap);
  let hn = 0, en = 0;
  const grow = () => {
    cap *= 2;
    const g = (A, n) => {
      const B = new A.constructor(n);
      B.set(A);
      return B;
    };
    ec = g(ec, cap);
    ea = g(ea, cap);
    eb = g(eb, cap);
    eva = g(eva, cap);
    evb = g(evb, cap);
    exyz = g(exyz, cap * 3);
    heap = g(heap, cap);
  };
  const push = (cost, a, b, x, y, z) => {
    if (en >= cap) grow();
    const e = en++;
    ec[e] = cost;
    ea[e] = a;
    eb[e] = b;
    eva[e] = ver[a];
    evb[e] = ver[b];
    exyz[e * 3] = x;
    exyz[e * 3 + 1] = y;
    exyz[e * 3 + 2] = z;
    let i = hn++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (ec[heap[p]] <= cost) break;
      heap[i] = heap[p];
      i = p;
    }
    heap[i] = e;
  };
  const pop = () => {
    const top = heap[0];
    const last = heap[--hn];
    const c = ec[last];
    let i = 0;
    for (;;) {
      const l = 2 * i + 1, r = l + 1;
      if (l >= hn) break;
      let m = l;
      if (r < hn && ec[heap[r]] < ec[heap[l]]) m = r;
      if (ec[heap[m]] >= c) break;
      heap[i] = heap[m];
      i = m;
    }
    heap[i] = last;
    return top;
  };
  const qerr = (q, x, y, z) =>
    q[0] * x * x + 2 * q[1] * x * y + 2 * q[2] * x * z + 2 * q[3] * x + q[4] * y * y + 2 * q[5] * y * z + 2 * q[6] * y + q[7] * z * z + 2 * q[8] * z + q[9];
  const qs = new Float64Array(10);
  const best = [0, 0, 0, 0];
  const evalEdge = (a, b) => {
    for (let i = 0; i < 10; i++) qs[i] = Q[a * 10 + i] + Q[b * 10 + i];
    // optimal point: solve A x = -b
    const a00 = qs[0], a01 = qs[1], a02 = qs[2], a11 = qs[4], a12 = qs[5], a22 = qs[7];
    const det = a00 * (a11 * a22 - a12 * a12) - a01 * (a01 * a22 - a12 * a02) + a02 * (a01 * a12 - a11 * a02);
    let bx, by, bz, bc = Infinity;
    const mx = (P[a * 3] + P[b * 3]) / 2, my = (P[a * 3 + 1] + P[b * 3 + 1]) / 2, mz = (P[a * 3 + 2] + P[b * 3 + 2]) / 2;
    const elen = Math.hypot(P[a * 3] - P[b * 3], P[a * 3 + 1] - P[b * 3 + 1], P[a * 3 + 2] - P[b * 3 + 2]);
    if (Math.abs(det) > 1e-18) {
      const r0 = -qs[3], r1 = -qs[6], r2 = -qs[8];
      const x = (r0 * (a11 * a22 - a12 * a12) - a01 * (r1 * a22 - a12 * r2) + a02 * (r1 * a12 - a11 * r2)) / det;
      const y = (a00 * (r1 * a22 - a12 * r2) - r0 * (a01 * a22 - a12 * a02) + a02 * (a01 * r2 - r1 * a02)) / det;
      const z = (a00 * (a11 * r2 - r1 * a12) - a01 * (a01 * r2 - r1 * a02) + r0 * (a01 * a12 - a11 * a02)) / det;
      // keep the optimum close to the edge (avoid spikes on near-singular quadrics)
      if (Math.hypot(x - mx, y - my, z - mz) < elen) {
        bc = qerr(qs, x, y, z);
        bx = x;
        by = y;
        bz = z;
      }
    }
    for (const [x, y, z] of [[P[a * 3], P[a * 3 + 1], P[a * 3 + 2]], [P[b * 3], P[b * 3 + 1], P[b * 3 + 2]], [mx, my, mz]]) {
      const c = qerr(qs, x, y, z);
      if (c < bc) {
        bc = c;
        bx = x;
        by = y;
        bz = z;
      }
    }
    best[0] = Math.max(0, bc) + elen * elen * 1e-6; // a tiny length term keeps triangles even
    best[1] = bx;
    best[2] = by;
    best[3] = bz;
    return best;
  };
  const seen = new Set();
  for (let f = 0; f < nf; f++) {
    for (let e = 0; e < 3; e++) {
      const a = F[f * 3 + e], b = F[f * 3 + ((e + 1) % 3)];
      const key = a < b ? a * nv + b : b * nv + a;
      if (seen.has(key)) continue;
      seen.add(key);
      const r = evalEdge(a, b);
      push(r[0], a, b, r[1], r[2], r[3]);
    }
  }
  seen.clear();
  let faces = nf;
  // one-ring neighbours into a reusable list, de-duplicated with a stamp per vertex
  const mark = new Uint32Array(nv);
  let stamp = 1;
  const nbA = [], nbB = [];
  const neighbours = (v, out) => {
    out.length = 0;
    const st = ++stamp;
    for (const f of vf[v]) {
      if (!faceAlive[f]) continue;
      for (let e = 0; e < 3; e++) {
        const u = F[f * 3 + e];
        if (u !== v && mark[u] !== st) {
          mark[u] = st;
          out.push(u);
        }
      }
    }
    return st;
  };
  const flips = (v, other, x, y, z) => {
    // would moving v to (x,y,z) flip or degenerate any face around v that does not contain `other`?
    for (const f of vf[v]) {
      if (!faceAlive[f]) continue;
      const i0 = F[f * 3], i1 = F[f * 3 + 1], i2 = F[f * 3 + 2];
      if (i0 === other || i1 === other || i2 === other) continue;
      // the two other corners (in winding order after v)
      const j = i0 === v ? 0 : i1 === v ? 1 : 2;
      const b = F[f * 3 + ((j + 1) % 3)], c = F[f * 3 + ((j + 2) % 3)];
      const bx = P[b * 3], by = P[b * 3 + 1], bz = P[b * 3 + 2];
      const cx = P[c * 3] - bx, cy = P[c * 3 + 1] - by, cz = P[c * 3 + 2] - bz;
      const ox = P[v * 3] - bx, oy = P[v * 3 + 1] - by, oz = P[v * 3 + 2] - bz;
      const nx = x - bx, ny = y - by, nz = z - bz;
      // normals of (b, c, v_old) and (b, c, v_new)
      const n0x = cy * oz - cz * oy, n0y = cz * ox - cx * oz, n0z = cx * oy - cy * ox;
      const n1x = cy * nz - cz * ny, n1y = cz * nx - cx * nz, n1z = cx * ny - cy * nx;
      const l0 = Math.sqrt(n0x * n0x + n0y * n0y + n0z * n0z), l1 = Math.sqrt(n1x * n1x + n1y * n1y + n1z * n1z);
      if (l1 < l0 * 1e-3 + 1e-14) return true;
      if ((n0x * n1x + n0y * n1y + n0z * n1z) / (l0 * l1 + 1e-30) < 0.35) return true;
    }
    return false;
  };
  while (faces > target && hn > 0) {
    const e = pop();
    const cost = ec[e], a = ea[e], b = eb[e], x = exyz[e * 3], y = exyz[e * 3 + 1], z = exyz[e * 3 + 2];
    if (!vAlive[a] || !vAlive[b] || ver[a] !== eva[e] || ver[b] !== evb[e]) continue;
    if (cost > maxError) break;
    // link condition: the two vertices share exactly two neighbours (the edge's opposite corners)
    neighbours(b, nbB);
    const stA = neighbours(a, nbA);
    if (mark[b] !== stA) continue;
    let common = 0;
    for (const u of nbB) if (mark[u] === stA) common++;
    // (a rejected edge is dropped; it is queued again if a neighbouring collapse changes it)
    if (common !== 2) continue;
    if (flips(a, b, x, y, z) || flips(b, a, x, y, z)) continue;
    // collapse b into a
    for (const f of vf[b]) {
      if (!faceAlive[f]) continue;
      const i0 = F[f * 3], i1 = F[f * 3 + 1], i2 = F[f * 3 + 2];
      if (i0 === a || i1 === a || i2 === a) {
        faceAlive[f] = 0;
        faces--;
      } else {
        for (let e = 0; e < 3; e++) if (F[f * 3 + e] === b) F[f * 3 + e] = a;
        vf[a].push(f);
      }
    }
    vAlive[b] = 0;
    vf[b] = [];
    {
      // drop dead faces from a's list in place
      const L = vf[a];
      let k = 0;
      for (let i = 0; i < L.length; i++) if (faceAlive[L[i]]) L[k++] = L[i];
      L.length = k;
    }
    P[a * 3] = x;
    P[a * 3 + 1] = y;
    P[a * 3 + 2] = z;
    for (let i = 0; i < 10; i++) Q[a * 10 + i] += Q[b * 10 + i];
    // edges into a are stale (new position and quadric): bump its version and queue them again
    ver[a]++;
    neighbours(a, nbA);
    for (const u of nbA) {
      const r = evalEdge(a, u);
      push(r[0], a, u, r[1], r[2], r[3]);
    }
  }
  // compact
  const remap = new Int32Array(nv).fill(-1);
  const outP = [], outI = [];
  for (let f = 0; f < nf; f++) {
    if (!faceAlive[f]) continue;
    for (let e = 0; e < 3; e++) {
      const v = F[f * 3 + e];
      if (remap[v] < 0) {
        remap[v] = outP.length / 3;
        outP.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]);
      }
      outI.push(remap[v]);
    }
  }
  return { positions: new Float32Array(outP), indices: new Uint32Array(outI) };
}

// =============================================================================================
// Small procedural textures (DataTexture; no DOM needed)
// =============================================================================================
const _clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const _lerp = (a, b, t) => a + (b - a) * t;
const _smooth = (a, b, x) => {
  const t = _clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
function hash2(i, j, s) {
  let h = (i * 374761393 + j * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** Tileable value noise on a px x py lattice. */
function vnoise(u, v, px, py, s = 0) {
  const x = u * px, y = v * py;
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const w = (a, b) => hash2(((a % px) + px) % px, ((b % py) + py) % py, s);
  return _lerp(_lerp(w(i, j), w(i + 1, j), sx), _lerp(w(i, j + 1), w(i + 1, j + 1), sx), sy);
}
function fbm2(u, v, px, py, oct, s) {
  let a = 0, amp = 0.5, n = 0;
  for (let o = 0; o < oct; o++) {
    a += amp * vnoise(u, v, px << o, py << o, s + o * 17);
    n += amp;
    amp *= 0.5;
  }
  return a / n;
}
/** fn(u, v, out[4]) -> RGBA 0..1. */
function makeTexture(w, h, fn, srgb = true) {
  const data = new Uint8Array(w * h * 4), o = [0, 0, 0, 1];
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      o[3] = 1;
      fn((i + 0.5) / w, (j + 0.5) / h, o);
      const k = (j * w + i) * 4;
      for (let c = 0; c < 4; c++) data[k + c] = _clamp(o[c], 0, 1) * 255 + 0.5;
    }
  }
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

const _cache = new Map();
const once = (k, f) => {
  if (!_cache.has(k)) _cache.set(k, f());
  return _cache.get(k);
};
const noShadow = (o) => {
  o.traverse((m) => {
    if (m.isMesh) m.castShadow = m.receiveShadow = false;
  });
  return o;
};
/** Swap the winding of an indexed geometry (after a mirroring scale). */
function flipWinding(g) {
  const idx = g.index.array;
  for (let i = 0; i < idx.length; i += 3) {
    const t = idx[i + 1];
    idx[i + 1] = idx[i + 2];
    idx[i + 2] = t;
  }
  g.index.needsUpdate = true;
  return g;
}

// =============================================================================================
// TACTICAL KNIFE: black textured grip with finger grooves, steel guard and pommel, a clip-point
// blade (coated flats, bright satin bevel). Origin = centre of the grip, blade along -Z, spine +Y.
// Children: 'tip' (the point), 'edge' (middle of the cutting edge).
// =============================================================================================
function knifeGripTexture() {
  return once('tex:knifeGrip', () =>
    makeTexture(128, 256, (u, v, o) => {
      // diamond texturing + grain (bump) - u round the grip, v along it
      const a = (((u * 10 + v * 20) % 1) + 1) % 1, b = (((u * 10 - v * 20) % 1) + 1) % 1;
      const d = Math.min(Math.abs(a - 0.5), Math.abs(b - 0.5));
      o[0] = o[1] = o[2] = _smooth(0.02, 0.12, d) * 0.85 + 0.15 * vnoise(u, v, 64, 128, 3);
    }, false),
  );
}
function bladeGeometries() {
  return once('geo:blade', () => {
    const z0 = -0.057, L = 0.172, N = 56;
    const ys = (t) => {
      // spine: straight, then a slightly concave clip down to the point
      if (t < 0.64) return 0.0102;
      const c = (t - 0.64) / 0.36;
      return _lerp(0.0102, 0.0012, c) - 0.0028 * Math.sin(Math.PI * c);
    };
    const ye = (t) => (t < 0.5 ? -0.0218 : -0.0218 + (0.0218 + 0.0012) * ((t - 0.5) / 0.5) ** 2.1);
    const hs = (t) => 0.0023 * (t < 0.6 ? 1 : 1 - 0.85 * ((t - 0.6) / 0.4) ** 1.4);
    const he = 0.00022;
    const sec = (t) => {
      const y1 = ys(t), y0 = ye(t), yg = y0 + 0.52 * (y1 - y0), h = Math.max(hs(t), he);
      return [[h, y1], [h, yg], [he, y0], [-he, y0], [-h, yg], [-h, y1]];
    };
    const strip = (k) => {
      const pos = [], idx = [];
      for (let i = 0; i <= N; i++) {
        const t = i / N, z = z0 - L * t, s = sec(t);
        const a = s[k], b = s[(k + 1) % 6];
        pos.push(a[0], a[1], z, b[0], b[1], z);
      }
      for (let i = 0; i < N; i++) {
        const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
        idx.push(a, c, b, b, c, d);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      return g.toNonIndexed();
    };
    const merge = (ks) => {
      const list = ks.map(strip);
      let n = 0;
      for (const g of list) n += g.attributes.position.count;
      const p = new Float32Array(n * 3), nr = new Float32Array(n * 3);
      let o = 0;
      for (const g of list) {
        p.set(g.attributes.position.array, o * 3);
        nr.set(g.attributes.normal.array, o * 3);
        o += g.attributes.position.count;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(p, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(nr, 3));
      g.computeBoundingSphere();
      return g;
    };
    // faces: 0 right flat, 1 right bevel, 2 edge, 3 left bevel, 4 left flat, 5 spine
    return { flats: merge([0, 4, 5]), bevels: merge([1, 2, 3]) };
  });
}
function knifeTemplate() {
  return once('tpl:knife', () => {
    const g = new THREE.Group();
    g.name = 'knife';
    // grip: an oval lathe with finger grooves underneath and a palm swell
    const z0 = -0.054, z1 = 0.066, N = 60;
    const prof = [new THREE.Vector2(0.0005, z0)];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const swell = 1 + 0.06 * Math.sin(Math.PI * t) + 0.04 * Math.exp(-(((t - 0.85) / 0.1) ** 2));
      prof.push(new THREE.Vector2(0.0128 * swell, _lerp(z0, z1, t)));
    }
    prof.push(new THREE.Vector2(0.0005, z1));
    const grip = new THREE.LatheGeometry(prof, 28);
    // lathe axis +Y -> +Z (profile y becomes z), squashed to an oval, grooves cut underneath
    grip.rotateX(Math.PI / 2);
    const p = grip.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i);
      const z = p.getZ(i);
      x *= 0.86;
      y *= 1.24;
      if (y < 0) {
        const tz = (z - z0) / (z1 - z0);
        const groove = 0.0017 * Math.max(0, Math.sin(tz * Math.PI * 4 - 0.6)) * _smooth(0.05, 0.2, tz) * (1 - _smooth(0.75, 0.9, tz));
        y += groove * Math.min(1, -y / 0.01);
      }
      p.setXYZ(i, x, y, z);
    }
    grip.computeVertexNormals();
    g.add(new THREE.Mesh(grip, new THREE.MeshStandardMaterial({ color: 0x1b1c1e, roughness: 0.8, metalness: 0, bumpMap: knifeGripTexture(), bumpScale: 1.4 })));
    // guard and pommel (blackened steel), lanyard ring
    const steel = new THREE.MeshStandardMaterial({ color: 0x2a2c30, metalness: 0.85, roughness: 0.38 });
    g.add(new THREE.Mesh(new RoundedBoxGeometry(0.013, 0.05, 0.0055, 2, 0.0022).translate(0, -0.0035, -0.0575), steel));
    g.add(new THREE.Mesh(new RoundedBoxGeometry(0.0235, 0.035, 0.012, 3, 0.0045).translate(0, -0.0005, 0.071), steel));
    g.add(new THREE.Mesh(new THREE.TorusGeometry(0.0035, 0.0012, 6, 14).rotateY(Math.PI / 2).translate(0, -0.006, 0.08), steel));
    // blade
    const bg = bladeGeometries();
    g.add(new THREE.Mesh(bg.flats, new THREE.MeshStandardMaterial({ color: 0x232427, metalness: 0.65, roughness: 0.42, side: THREE.DoubleSide })));
    g.add(new THREE.Mesh(bg.bevels, new THREE.MeshStandardMaterial({ color: 0xd8dde3, metalness: 1, roughness: 0.2, side: THREE.DoubleSide })));
    const tip = new THREE.Object3D();
    tip.name = 'tip';
    tip.position.set(0, 0.0012, -0.229);
    const edge = new THREE.Object3D();
    edge.name = 'edge';
    edge.position.set(0, -0.018, -0.15);
    g.add(tip, edge);
    return noShadow(g);
  });
}

// =============================================================================================
// BASEBALL BAT: ash, 84 cm, taped handle and knob. Origin = the right (upper) hand's grip,
// barrel along -Z. Children: 'sweet' (the sweet spot), 'end' (the barrel end).
// =============================================================================================
export const BAT = { length: 0.84, knobZ: 0.15 };
function batTextures() {
  return once('tex:bat', () => {
    // ash: straight grain along v (the length), a few darker latewood streaks
    const grain = (u, v) => (((u * 18 + 0.6 * fbm2(u, v, 4, 2, 3, 5)) % 1) + 1) % 1;
    const map = makeTexture(256, 512, (u, v, o) => {
      const g = grain(u, v);
      const late = _smooth(0.55, 0.8, g) * (1 - _smooth(0.85, 1, g));
      const fib = vnoise(u, v, 64, 8, 9) * 0.5 + vnoise(u, v, 128, 16, 11) * 0.5;
      const k = 0.12 * late + 0.06 * fib + 0.05 * fbm2(u, v, 3, 6, 3, 21);
      o[0] = 0.86 - k * 1.3;
      o[1] = 0.69 - k * 1.4;
      o[2] = 0.47 - k * 1.3;
    });
    const bump = makeTexture(128, 256, (u, v, o) => {
      o[0] = o[1] = o[2] = 0.6 - 0.3 * _smooth(0.55, 0.8, grain(u, v)) + 0.1 * vnoise(u, v, 64, 8, 9);
    }, false);
    // grip tape: overlapping spiral wraps (u round, v along)
    const tape = makeTexture(128, 256, (u, v, o) => {
      const s = (((v * 14 + u) % 1) + 1) % 1;
      o[0] = o[1] = o[2] = 0.35 + 0.5 * _smooth(0.0, 0.08, s) * (1 - _smooth(0.86, 1, s)) + 0.15 * vnoise(u, v, 32, 64, 2);
    }, false);
    return { map, bump, tape };
  });
}
function latheZ(pts, segs) {
  // lathe round +Y, then laid along Z with the profile's y as z
  const g = new THREE.LatheGeometry(pts, segs).rotateX(Math.PI / 2);
  return g;
}
function batTemplate() {
  return once('tpl:bat', () => {
    const g = new THREE.Group();
    g.name = 'bat';
    const r = (d) => {
      // radius vs distance from the knob end
      if (d < 0.012) return 0.0215 * Math.sqrt(Math.max(0, 1 - ((0.012 - d) / 0.012) ** 2)) + 0.002;
      if (d < 0.03) return _lerp(0.0215, 0.0122, _smooth(0.012, 0.03, d));
      if (d < 0.3) return 0.0122 + (0.0013 * (d - 0.03)) / 0.27;
      if (d < 0.64) return _lerp(0.0135, 0.0332, _smooth(0.3, 0.64, d));
      if (d < 0.828) return 0.0332;
      const e = (d - 0.828) / 0.012;
      return 0.0332 * Math.sqrt(Math.max(0, 1 - e * e)) + 0.0001;
    };
    const pts = [new THREE.Vector2(0, BAT.knobZ)];
    for (let i = 0; i <= 72; i++) {
      const d = (BAT.length * i) / 72;
      pts.push(new THREE.Vector2(Math.max(0.0004, r(d)), BAT.knobZ - d));
    }
    pts.push(new THREE.Vector2(0, BAT.knobZ - BAT.length));
    pts.reverse(); // lathe profiles run upwards (outward faces): barrel end first
    const tx = batTextures();
    tx.map.repeat.set(1, 1.6);
    tx.bump.repeat.set(1, 1.6);
    g.add(new THREE.Mesh(latheZ(pts, 36), new THREE.MeshPhysicalMaterial({ map: tx.map, bumpMap: tx.bump, bumpScale: 0.4, roughness: 0.42, clearcoat: 0.6, clearcoatRoughness: 0.25 })));
    // grip tape over the handle, a hair proud of the wood
    const tp = [];
    for (let i = 0; i <= 40; i++) {
      const d = 0.022 + (0.268 * i) / 40;
      tp.push(new THREE.Vector2(r(d) + 0.0009, BAT.knobZ - d));
    }
    tp.reverse();
    g.add(new THREE.Mesh(latheZ(tp, 30), new THREE.MeshStandardMaterial({ color: 0x222326, roughness: 0.85, bumpMap: tx.tape, bumpScale: 1.2 })));
    const sweet = new THREE.Object3D();
    sweet.name = 'sweet';
    sweet.position.set(0, 0, BAT.knobZ - 0.7);
    const end = new THREE.Object3D();
    end.name = 'end';
    end.position.set(0, 0, BAT.knobZ - BAT.length);
    g.add(sweet, end);
    return noShadow(g);
  });
}

// =============================================================================================
// COMBAT BOOT (right foot): lugged rubber outsole, leather toe box and heel counter, cordura
// shaft, laces and eyelets. Origin = the ankle joint, +Z to the toes, +Y up; ground at y = -0.088.
// Children: 'sole' (centre of the sole, the striking point), 'toe'.
// =============================================================================================
export const BOOT = { ground: -0.088, sole: [0, -0.088, 0.075], top: 0.165 };
function bootSDF() {
  const prim = {
    heel: makeRoundCone([0, -0.034, -0.036], [0, -0.034, -0.02], 0.043, 0.044),
    vamp: makeRoundCone([0, -0.032, 0.02], [0.003, -0.047, 0.16], 0.044, 0.031),
    shaft: makeRoundCone([0, -0.02, -0.012], [0, BOOT.top, -0.018], 0.05, 0.047),
    collar: makeRoundCone([-0.03, BOOT.top - 0.004, -0.02], [0.03, BOOT.top - 0.004, -0.02], 0.012, 0.012),
  };
  const toeF = makeFrame([0.002, -0.05, 0.178], [1, 0, 0], [0, 1, 0.15]);
  const laces = [], eyelets = [];
  const n = 8;
  const at = (t) => [0, _lerp(-0.012, BOOT.top - 0.012, t) + 0.018 * Math.sin(t * 2.2), _lerp(0.085, 0.034, t) - 0.01 * t];
  for (let k = 0; k < n; k++) {
    const a = at(k / n), b = at((k + 1) / n), w = 0.019;
    laces.push(makeRoundCone([-w, a[1], a[2] + 0.002], [w, b[1], b[2] + 0.002], 0.0024, 0.0024));
    laces.push(makeRoundCone([w, a[1], a[2] + 0.002], [-w, b[1], b[2] + 0.002], 0.0024, 0.0024));
    eyelets.push([-w - 0.002, a[1], a[2]], [w + 0.002, a[1], a[2]]);
  }
  const l = [0, 0, 0];
  const foot2D = (x, z) => {
    // footprint: heel, ball and toe discs smoothly joined
    const h = Math.hypot(x, z + 0.038) - 0.04;
    const b = Math.hypot(x - 0.004, z - 0.135) - 0.052;
    const t = Math.hypot(x + 0.004, z - 0.19) - 0.043;
    return smin(smin(h, b, 0.09), t, 0.05);
  };
  const soleD = (x, y, z) => {
    const spring = 0.013 * _smooth(0.13, 0.235, z) ** 2;
    const lug = (((((z + Math.abs(x) * 0.9) / 0.021) % 1) + 1) % 1) - 0.5;
    const lugs = 0.0032 * _smooth(0.16, 0.06, Math.abs(lug)) * (1 - _smooth(0.17, 0.2, z));
    const bottom = BOOT.ground + spring + lugs;
    const fy = Math.max(bottom - y, y - (-0.06 + spring));
    const f = foot2D(x, z);
    return Math.min(Math.max(f, fy), 0) + Math.hypot(Math.max(f, 0), Math.max(fy, 0)) - 0.002;
  };
  const upperD = (x, y, z) => {
    let d = roundCone(prim.heel, x, y, z);
    d = smin(d, roundCone(prim.vamp, x, y, z), 0.03);
    toFrame(toeF, x, y, z, l);
    d = smin(d, ellipsoid(l[0], l[1], l[2], 0.0445, 0.025, 0.052), 0.02);
    d = smin(d, roundCone(prim.shaft, x * 1.08, y, z * 0.95) / 1.08, 0.025);
    d = smin(d, roundCone(prim.collar, x, y, z), 0.01);
    // flat underneath (it sits on the midsole)
    return smax(d, -0.058 - y, 0.004);
  };
  // distance (in y-z) from the lacing line - the laces and eyelets only live near it
  const lA = at(0), lB = at(1), lD = [lB[1] - lA[1], lB[2] - lA[2]], lL = Math.hypot(lD[0], lD[1]);
  const laceFar = (y, z) => Math.abs(((y - lA[1]) * lD[1] - (z - lA[2]) * lD[0]) / lL) - 0.022;
  const laceD = (x, y, z) => {
    if (z < 0.01 || y < -0.03 || laceFar(y, z) > 0.012) return 1;
    let d = 1;
    for (const c of laces) d = Math.min(d, roundCone(c, x, y, z));
    return d;
  };
  const eyeD = (x, y, z) => {
    if (z < 0.005 || y < -0.03 || laceFar(y, z) > 0.012) return 1;
    let d = 1;
    for (const e of eyelets) d = Math.min(d, Math.hypot(x - e[0], y - e[1], z - e[2]) - 0.0032);
    return d;
  };
  const f = (x, y, z) => Math.min(smin(soleD(x, y, z), upperD(x, y, z), 0.004), laceD(x, y, z), eyeD(x, y, z));
  /** region weights: [leather, cordura, rubber, lace/metal] */
  const region = (x, y, z, out) => {
    out[0] = out[1] = out[2] = out[3] = 0;
    if (laceD(x, y, z) < 0.0008 || eyeD(x, y, z) < 0.0008) out[3] = 1;
    else if (y < -0.0585 || soleD(x, y, z) < 0.0008) out[2] = 1;
    else {
      // leather toe box, heel counter and collar; cordura panels on the shaft's sides
      toFrame(toeF, x, y, z, l);
      const toe = z > 0.1 || ellipsoid(l[0], l[1], l[2], 0.0445, 0.025, 0.052) < 0.002;
      const heel = z < -0.03 && y < 0.03;
      const collar = y > BOOT.top - 0.03;
      const side = Math.abs(x) > 0.025 && y > -0.02 && !collar;
      if (toe || heel || collar || !side) out[0] = 1;
      else out[1] = 1;
    }
  };
  return { f, region, bounds: { min: [-0.066, -0.095, -0.095], max: [0.066, BOOT.top + 0.02, 0.245] } };
}
function bootGeometry() {
  return once('geo:boot', () => {
    const sdf = bootSDF();
    const m = meshSDF(sdf.f, sdf.bounds, 0.0034, { targetTris: 7000 });
    const nv = m.positions.length / 3;
    const reg = new Float32Array(nv * 4), r = [0, 0, 0, 0];
    for (let v = 0; v < nv; v++) {
      sdf.region(m.positions[v * 3], m.positions[v * 3 + 1], m.positions[v * 3 + 2], r);
      reg.set(r, v * 4);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(m.normals, 3));
    g.setAttribute('aRegion', new THREE.BufferAttribute(reg, 4));
    g.setIndex(new THREE.BufferAttribute(m.indices, 1));
    g.computeBoundingSphere();
    return g;
  });
}

/**
 * A melee model, a fresh Object3D sharing cached geometry: 'knife' | 'bat' | 'boot'. The boot's
 * surface carries region weights (attribute aRegion: leather, cordura, rubber, lace/metal) for
 * the caller's material (fpsView's detail material); without one it gets a plain dark material.
 */
export function createMeleeModel(type, material = null) {
  if (type === 'knife') return knifeTemplate().clone(true);
  if (type === 'bat') return batTemplate().clone(true);
  if (type === 'boot') {
    const grp = new THREE.Group();
    grp.name = 'boot';
    const mesh = new THREE.Mesh(bootGeometry(), material || new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 0.6 }));
    mesh.castShadow = mesh.receiveShadow = false;
    const sole = new THREE.Object3D();
    sole.name = 'sole';
    sole.position.set(...BOOT.sole);
    const toe = new THREE.Object3D();
    toe.name = 'toe';
    toe.position.set(0, -0.05, 0.225);
    grp.add(mesh, sole, toe);
    return grp;
  }
  throw new Error(`createMeleeModel: unknown type '${type}'`);
}
