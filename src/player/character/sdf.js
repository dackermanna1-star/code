// Signed-distance modelling helpers for the walker: primitives, smooth
// booleans, value noise, a surface-nets mesher for fields, a quadric mesh
// simplifier and field-sampled ambient occlusion.
import * as THREE from 'three';
import { smin, sdRoundCone, sdEllipsoid, sdRoundBox, vnoise3 } from '../../spray/viewmodelParts.js';

export { smin, sdRoundCone, sdEllipsoid, sdRoundBox, vnoise3 };

export const { abs, min, max, sin, cos, sqrt, pow, exp, atan2, PI, hypot, floor } = Math;
export const clamp = (x, a, b) => min(b, max(a, x));
export const smax = (a, b, k) => -smin(-a, -b, k);
export const sstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const mix = (a, b, t) => a + (b - a) * t;
/** Round cone between points a and b (arrays). */
export const cone = (x, y, z, a, b, r1, r2 = r1) => sdRoundCone(x, y, z, a[0], a[1], a[2], b[0], b[1], b[2], r1, r2);
/** Ellipsoid at c with radii r. */
export const ell = (x, y, z, c, r) => sdEllipsoid(x - c[0], y - c[1], z - c[2], r[0], r[1], r[2]);
/** Sphere at c. */
export const sph = (x, y, z, c, r) => hypot(x - c[0], y - c[1], z - c[2]) - r;
/** 2D ellipse distance (approximate). */
export function ell2(x, y, rx, ry) {
  const k0 = sqrt((x / rx) ** 2 + (y / ry) ** 2);
  const k1 = sqrt((x / (rx * rx)) ** 2 + (y / (ry * ry)) ** 2);
  return k1 > 0 ? (k0 * (k0 - 1)) / k1 : -min(rx, ry);
}
/** Parameter (0..1) and distance of p from segment ab. */
export function segT(x, y, z, a, b) {
  const ex = b[0] - a[0], ey = b[1] - a[1], ez = b[2] - a[2];
  const t = clamp(((x - a[0]) * ex + (y - a[1]) * ey + (z - a[2]) * ez) / (ex * ex + ey * ey + ez * ez), 0, 1);
  return t;
}
export const n3 = (x, y, z, s) => vnoise3(x, y, z, s);

/** Ambient occlusion sampled from the field along each vertex normal (into vmat.a). */
export function sdfAO(geo, sdf, h = 0.006, lo = 0.45) {
  const P = geo.attributes.position.array, N = geo.attributes.normal.array, M = geo.attributes.vmat.array;
  const n = P.length / 3;
  for (let v = 0; v < n; v++) {
    const nx = N[v * 3] / 127, ny = N[v * 3 + 1] / 127, nz = N[v * 3 + 2] / 127;
    // start from the surface, not the voxel corner: corners of the staircase sit
    // up to half a voxel in or out, which would shade every step as a band
    const s0 = sdf(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]);
    const px = P[v * 3] - nx * s0, py = P[v * 3 + 1] - ny * s0, pz = P[v * 3 + 2] - nz * s0;
    let occ = 0;
    for (let k = 1; k <= 2; k++) {
      const d = k * h * 1.5;
      const s = sdf(px + nx * d, py + ny * d, pz + nz * d);
      occ += (max(0, d - s) / d) * (k === 1 ? 0.55 : 0.45);
    }
    M[v * 4 + 3] = Math.round(clamp(1 - occ * 1.3, lo, 1) * 255);
  }
  geo.attributes.vmat.needsUpdate = true;
}

/**
 * Smooth mesh of a field (naive surface nets): one vertex per cell the surface
 * crosses, projected onto the surface, shared by the quads of every crossed
 * edge. Far fewer and better-shaped triangles than the voxel staircase for the
 * same silhouette. Materials come from mat() a little inside each vertex; the
 * class attribute is read flat in the shader, so colours blend across a
 * boundary but material classes never mix. Same vertex format as the mesher.
 */
export function surfaceNets(P, { vs, min: b0, max: b1, sdf, mat, normalSdf = null }) {
  const nx = Math.max(1, Math.ceil((b1[0] - b0[0]) / vs));
  const ny = Math.max(1, Math.ceil((b1[1] - b0[1]) / vs));
  const nz = Math.max(1, Math.ceil((b1[2] - b0[2]) / vs));
  const cx = nx + 1, cy = ny + 1, cz = nz + 1;
  const F = new Float32Array(cx * cy * cz);
  // narrow band: blocks well away from the surface take their centre's value
  const B = 2, nbx = Math.ceil(nx / B), nby = Math.ceil(ny / B), nbz = Math.ceil(nz / B);
  const band = vs * 2.3; // a block's half-diagonal (1.73 vs) and a margin for inexact fields
  const blk = new Float32Array(nbx * nby * nbz);
  for (let k = 0; k < nbz; k++)
    for (let j = 0; j < nby; j++)
      for (let i = 0; i < nbx; i++) blk[i + nbx * (j + nby * k)] = sdf(b0[0] + (i * B + B / 2) * vs, b0[1] + (j * B + B / 2) * vs, b0[2] + (k * B + B / 2) * vs);
  for (let k = 0; k < cz; k++) {
    const bk = Math.min(nbz - 1, (k / B) | 0), z = b0[2] + k * vs;
    for (let j = 0; j < cy; j++) {
      const bj = Math.min(nby - 1, (j / B) | 0), y = b0[1] + j * vs;
      for (let i = 0; i < cx; i++) {
        const bd = blk[Math.min(nbx - 1, (i / B) | 0) + nbx * (bj + nby * bk)];
        F[i + cx * (j + cy * k)] = abs(bd) > band ? bd : sdf(b0[0] + i * vs, y, z);
      }
    }
  }
  // the corners' sign in an edge: true = inside
  const cell = new Int32Array(nx * ny * nz).fill(-1);
  const pos = [], nrm = [], col = [], mt = [], vox = [];
  const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const cv = new Float32Array(8);
  const ns = normalSdf ?? sdf, eps = vs * 0.3;
  const grad = (x, y, z, f, out) => {
    const f1 = f(x + eps, y - eps, z - eps), f2 = f(x - eps, y - eps, z + eps), f3 = f(x - eps, y + eps, z - eps), f4 = f(x + eps, y + eps, z + eps);
    let gx = f1 - f2 - f3 + f4, gy = -f1 - f2 + f3 + f4, gz = -f1 + f2 - f3 + f4;
    const l = sqrt(gx * gx + gy * gy + gz * gz) || 1;
    out[0] = gx / l;
    out[1] = gy / l;
    out[2] = gz / l;
  };
  const g = [0, 0, 0];
  const pal = P.entries;
  for (let k = 0; k < nz; k++)
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        let inside = 0;
        for (let c = 0; c < 8; c++) {
          const v = F[i + (c & 1) + cx * (j + ((c >> 1) & 1) + cy * (k + ((c >> 2) & 1)))];
          cv[c] = v;
          if (v < 0) inside++;
        }
        if (inside === 0 || inside === 8) continue;
        // mean of the edge crossings, then onto the surface
        let sx = 0, sy = 0, sz = 0, n = 0;
        for (const [a, b] of E) {
          const va = cv[a], vb = cv[b];
          if (va < 0 === vb < 0) continue;
          const t = va / (va - vb);
          sx += (a & 1) + ((b & 1) - (a & 1)) * t;
          sy += ((a >> 1) & 1) + (((b >> 1) & 1) - ((a >> 1) & 1)) * t;
          sz += ((a >> 2) & 1) + (((b >> 2) & 1) - ((a >> 2) & 1)) * t;
          n++;
        }
        let x = b0[0] + (i + sx / n) * vs, y = b0[1] + (j + sy / n) * vs, z = b0[2] + (k + sz / n) * vs;
        const ox = x, oy = y, oz = z;
        {
          // one Newton step: the crossing mean is already within a fraction of a cell
          const d = sdf(x, y, z);
          grad(x, y, z, sdf, g);
          x -= g[0] * d;
          y -= g[1] * d;
          z -= g[2] * d;
        }
        // stay near the cell (thin or creased places can pull a vertex far off)
        const mx = x - ox, my = y - oy, mz = z - oz, ml = sqrt(mx * mx + my * my + mz * mz);
        if (ml > vs * 0.5) {
          x = ox + (mx * vs * 0.5) / ml;
          y = oy + (my * vs * 0.5) / ml;
          z = oz + (mz * vs * 0.5) / ml;
        }
        grad(x, y, z, ns, g);
        const push = Math.min(vs * 0.5, 0.0025);
        const px = x - g[0] * push, py = y - g[1] * push, pz = z - g[2] * push;
        let m = mat(px, py, pz, -push);
        if (!m) m = mat(x - g[0] * vs, y - g[1] * vs, z - g[2] * vs, -vs) || 1;
        const e = pal[m] ?? pal[1];
        cell[i + nx * (j + ny * k)] = pos.length / 3;
        pos.push(x, y, z);
        nrm.push(Math.round(g[0] * 127), Math.round(g[1] * 127), Math.round(g[2] * 127));
        col.push(e.color[0], e.color[1], e.color[2], Math.round(Math.min(1, e.vari) * 255));
        mt.push(Math.round(clamp(e.rough, 0, 1) * 255), Math.round(clamp(e.metal, 0, 1) * 255), e.cls & 255, 255);
        vox.push(x / vs, y / vs, z / vs);
      }
  // a quad around every crossed edge, wound so it faces out of the solid
  const idx = [];
  const C = (i, j, k) => cell[i + nx * (j + ny * k)];
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) [b, d] = [d, b];
    // split along the shorter diagonal
    const dac = (pos[a * 3] - pos[c * 3]) ** 2 + (pos[a * 3 + 1] - pos[c * 3 + 1]) ** 2 + (pos[a * 3 + 2] - pos[c * 3 + 2]) ** 2;
    const dbd = (pos[b * 3] - pos[d * 3]) ** 2 + (pos[b * 3 + 1] - pos[d * 3 + 1]) ** 2 + (pos[b * 3 + 2] - pos[d * 3 + 2]) ** 2;
    if (dac <= dbd) idx.push(a, b, c, a, c, d);
    else idx.push(a, b, d, b, c, d);
  };
  for (let k = 0; k < cz; k++)
    for (let j = 0; j < cy; j++)
      for (let i = 0; i < cx; i++) {
        const f0 = F[i + cx * (j + cy * k)] < 0;
        if (i < nx && j > 0 && k > 0 && j < ny && k < nz && f0 !== F[i + 1 + cx * (j + cy * k)] < 0)
          quad(C(i, j - 1, k - 1), C(i, j, k - 1), C(i, j, k), C(i, j - 1, k), !f0);
        if (j < ny && k > 0 && i > 0 && k < nz && i < nx && f0 !== F[i + cx * (j + 1 + cy * k)] < 0)
          quad(C(i - 1, j, k - 1), C(i - 1, j, k), C(i, j, k), C(i, j, k - 1), !f0);
        if (k < nz && i > 0 && j > 0 && i < nx && j < ny && f0 !== F[i + cx * (j + cy * (k + 1))] < 0)
          quad(C(i - 1, j - 1, k), C(i, j - 1, k), C(i, j, k), C(i - 1, j, k), !f0);
      }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(new Int8Array(nrm), 3, true));
  geo.setAttribute('vcol', new THREE.BufferAttribute(new Uint8Array(col), 4, true));
  geo.setAttribute('vmat', new THREE.BufferAttribute(new Uint8Array(mt), 4, true));
  geo.setAttribute('vox', new THREE.BufferAttribute(new Float32Array(vox), 3));
  geo.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1));
  return geo;
}

/**
 * Quadric-error simplification by half-edge collapse (Garland-Heckbert with
 * vertices kept where they are, so they stay on the surface and keep their
 * attributes). An edge only collapses between vertices of the same material
 * class and similar colour (colTol, sRGB units), so material boundaries
 * survive; collapses that would fold a triangle or pinch the surface are
 * refused. Returns a new indexed geometry of about `target` triangles.
 */
export function simplify(geo, target, { colTol = 24 } = {}) {
  const P = geo.attributes.position.array, I = geo.index.array;
  const COL = geo.attributes.vcol.array, MAT = geo.attributes.vmat.array;
  const nv = P.length / 3, nt = I.length / 3;
  if (nt <= target) return geo;
  const T = Int32Array.from(I);
  const alive = new Uint8Array(nt).fill(1);
  const gone = new Uint8Array(nv);
  const ver = new Uint32Array(nv);
  const vt = Array.from({ length: nv }, () => []);
  for (let t = 0; t < nt; t++) for (let c = 0; c < 3; c++) vt[T[t * 3 + c]].push(t);
  // plane quadrics, area weighted
  const Q = new Float64Array(nv * 10);
  for (let t = 0; t < nt; t++) {
    const a = T[t * 3], b = T[t * 3 + 1], c = T[t * 3 + 2];
    const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2];
    const wx = P[c * 3] - P[a * 3], wy = P[c * 3 + 1] - P[a * 3 + 1], wz = P[c * 3 + 2] - P[a * 3 + 2];
    let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const l = sqrt(nx * nx + ny * ny + nz * nz);
    if (l < 1e-14) continue;
    const w = l * 0.5;
    nx /= l;
    ny /= l;
    nz /= l;
    const d = -(nx * P[a * 3] + ny * P[a * 3 + 1] + nz * P[a * 3 + 2]);
    const q = [nx * nx, nx * ny, nx * nz, nx * d, ny * ny, ny * nz, ny * d, nz * nz, nz * d, d * d];
    for (const v of [a, b, c]) for (let k = 0; k < 10; k++) Q[v * 10 + k] += q[k] * w;
  }
  const err = (u, v, x, y, z) => {
    const o = u * 10, p = v * 10;
    const q = (k) => Q[o + k] + Q[p + k];
    return q(0) * x * x + 2 * q(1) * x * y + 2 * q(2) * x * z + 2 * q(3) * x + q(4) * y * y + 2 * q(5) * y * z + 2 * q(6) * y + q(7) * z * z + 2 * q(8) * z + q(9);
  };
  const same = (u, v) =>
    MAT[u * 4 + 2] === MAT[v * 4 + 2] &&
    abs(COL[u * 4] - COL[v * 4]) + abs(COL[u * 4 + 1] - COL[v * 4 + 1]) + abs(COL[u * 4 + 2] - COL[v * 4 + 2]) <= colTol;
  // binary min-heap of candidate collapses u -> v
  let hc = new Float64Array(1 << 16), hu = new Int32Array(1 << 16), hv = new Int32Array(1 << 16), hs = new Uint32Array(1 << 16);
  let hn = 0;
  const grow = () => {
    const n = hc.length * 2;
    const c2 = new Float64Array(n), u2 = new Int32Array(n), v2 = new Int32Array(n), s2 = new Uint32Array(n);
    c2.set(hc);
    u2.set(hu);
    v2.set(hv);
    s2.set(hs);
    (hc = c2), (hu = u2), (hv = v2), (hs = s2);
  };
  const swap = (i, j) => {
    let t = hc[i];
    (hc[i] = hc[j]), (hc[j] = t);
    t = hu[i];
    (hu[i] = hu[j]), (hu[j] = t);
    t = hv[i];
    (hv[i] = hv[j]), (hv[j] = t);
    t = hs[i];
    (hs[i] = hs[j]), (hs[j] = t);
  };
  const push = (c, u, v) => {
    if (hn >= hc.length) grow();
    let i = hn++;
    (hc[i] = c), (hu[i] = u), (hv[i] = v), (hs[i] = ver[u] + ver[v] * 65599);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (hc[p] <= hc[i]) break;
      swap(i, p);
      i = p;
    }
  };
  const pop = () => {
    hn--;
    swap(0, hn);
    let i = 0;
    for (;;) {
      const l = 2 * i + 1, r = l + 1;
      let m = i;
      if (l < hn && hc[l] < hc[m]) m = l;
      if (r < hn && hc[r] < hc[m]) m = r;
      if (m === i) break;
      swap(i, m);
      i = m;
    }
    return hn;
  };
  const consider = (a, b) => {
    if (!same(a, b)) return;
    const ca = err(a, b, P[b * 3], P[b * 3 + 1], P[b * 3 + 2]); // a -> b
    const cb = err(a, b, P[a * 3], P[a * 3 + 1], P[a * 3 + 2]); // b -> a
    if (ca <= cb) push(ca, a, b);
    else push(cb, b, a);
  };
  // neighbour lists without allocation: stamp marks and reusable buffers
  const mark = new Int32Array(nv), mark2 = new Int32Array(nv);
  let stamp = 0;
  const NU = new Int32Array(256), NV = new Int32Array(256);
  const nbrs = (u, out, st, mk = mark) => {
    let n = 0;
    const L = vt[u];
    for (let i = 0; i < L.length; i++) {
      const t = L[i];
      if (!alive[t]) continue;
      for (let c = 0; c < 3; c++) {
        const w = T[t * 3 + c];
        if (w !== u && mk[w] !== st) {
          mk[w] = st;
          if (n < out.length) out[n++] = w;
        }
      }
    }
    return n;
  };
  for (let v = 0; v < nv; v++) {
    const n = nbrs(v, NU, ++stamp);
    for (let i = 0; i < n; i++) if (NU[i] > v) consider(v, NU[i]);
  }
  let count = nt;
  const tnorm = (a, b, c, out) => {
    const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2];
    const wx = P[c * 3] - P[a * 3], wy = P[c * 3 + 1] - P[a * 3 + 1], wz = P[c * 3 + 2] - P[a * 3 + 2];
    out[0] = uy * wz - uz * wy;
    out[1] = uz * wx - ux * wz;
    out[2] = ux * wy - uy * wx;
    return sqrt(out[0] * out[0] + out[1] * out[1] + out[2] * out[2]);
  };
  const n0 = [0, 0, 0], n1 = [0, 0, 0];
  while (count > target && hn > 0) {
    pop();
    const u = hu[hn], v = hv[hn];
    if (gone[u] || gone[v] || hs[hn] !== ver[u] + ver[v] * 65599) continue;
    // link condition: the edge's two wings are the only shared neighbours
    const su = ++stamp;
    nbrs(u, NU, su);
    if (mark[v] !== su) continue;
    const nV = nbrs(v, NV, su, mark2);
    let common = 0;
    for (let i = 0; i < nV; i++) if (mark[NV[i]] === su) common++;
    let shared = 0;
    for (const t of vt[u]) if (alive[t] && (T[t * 3] === v || T[t * 3 + 1] === v || T[t * 3 + 2] === v)) shared++;
    if (common !== 2 || shared !== 2) continue;
    // no folded or sliver triangles around u once it sits on v
    let ok = true;
    for (const t of vt[u]) {
      if (!alive[t]) continue;
      const a = T[t * 3], b = T[t * 3 + 1], c = T[t * 3 + 2];
      if (a === v || b === v || c === v) continue;
      const l0 = tnorm(a, b, c, n0);
      const l1 = tnorm(a === u ? v : a, b === u ? v : b, c === u ? v : c, n1);
      if (l1 < 1e-12 || (n0[0] * n1[0] + n0[1] * n1[1] + n0[2] * n1[2]) / (l0 * l1 + 1e-30) < 0.35) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    // collapse
    for (const t of vt[u]) {
      if (!alive[t]) continue;
      const a = T[t * 3], b = T[t * 3 + 1], c = T[t * 3 + 2];
      if (a === v || b === v || c === v) {
        alive[t] = 0;
        count--;
        continue;
      }
      for (let k = 0; k < 3; k++) if (T[t * 3 + k] === u) T[t * 3 + k] = v;
      vt[v].push(t);
    }
    for (let k = 0; k < 10; k++) Q[v * 10 + k] += Q[u * 10 + k];
    gone[u] = 1;
    vt[u].length = 0;
    ver[v]++;
    {
      const L = vt[v];
      let k = 0;
      for (let i = 0; i < L.length; i++) if (alive[L[i]]) L[k++] = L[i];
      L.length = k;
    }
    const nN = nbrs(v, NV, ++stamp, mark2);
    for (let i = 0; i < nN; i++) {
      ver[NV[i]]++;
      consider(v, NV[i]);
    }
  }
  // compact
  const remap = new Int32Array(nv).fill(-1);
  let m = 0;
  for (let v = 0; v < nv; v++) if (!gone[v] && vt[v].some((t) => alive[t])) remap[v] = m++;
  const out = new THREE.BufferGeometry();
  for (const [name, a] of Object.entries(geo.attributes)) {
    const s = a.itemSize, src = a.array, dst = new src.constructor(m * s);
    for (let v = 0; v < nv; v++) if (remap[v] >= 0) for (let k = 0; k < s; k++) dst[remap[v] * s + k] = src[v * s + k];
    out.setAttribute(name, new THREE.BufferAttribute(dst, s, a.normalized));
  }
  const idx = [];
  for (let t = 0; t < nt; t++) if (alive[t]) idx.push(remap[T[t * 3]], remap[T[t * 3 + 1]], remap[T[t * 3 + 2]]);
  out.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1));
  return out;
}
