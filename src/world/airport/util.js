// =============================================================================
// Airport module utilities: deterministic RNG, a light-weight geometry builder
// (transform + vertex colour + planar "metre" UVs + merge), small math helpers.
// =============================================================================
import * as THREE from 'three';

export function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
export const easeInOut = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };
export const wrap180 = (d) => { d = ((d + 180) % 360 + 360) % 360 - 180; return d; };

/** compass heading (deg) -> yaw (rad) as used by the layout/world frame */
export const hdgToYaw = (h) => -h * Math.PI / 180;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

/** Matrix from position, euler (x, y, z radians, 'YXZ' order) and scale. */
export function mat(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _e.set(rx, ry, rz, 'YXZ');
  _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
}

/**
 * Geometry builder: collects primitives (any BufferGeometry), applies a matrix,
 * optional vertex colour, and merges them into one indexed geometry with
 * position / normal / uv / color.  `uvMode: 'planar'` recomputes UVs as metres
 * projected along the dominant normal axis (texture tiling in metres).
 */
export class GeoBuilder {
  constructor({ colors = true } = {}) {
    this.parts = [];
    this.colors = colors;
  }
  add(geo, matrix = null, color = 0xffffff, { planar = 0, uvScale = null } = {}) {
    const g = geo.index ? geo : geo; // keep reference; we copy below
    const pos = g.attributes.position;
    const n = pos.count;
    const P = new Float32Array(n * 3);
    const N = new Float32Array(n * 3);
    const U = new Float32Array(n * 2);
    const m = matrix || _m.identity();
    const nm = new THREE.Matrix3().getNormalMatrix(m);
    const v = new THREE.Vector3();
    const hasN = !!g.attributes.normal;
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m);
      P[i * 3] = v.x; P[i * 3 + 1] = v.y; P[i * 3 + 2] = v.z;
      if (hasN) {
        v.fromBufferAttribute(g.attributes.normal, i).applyMatrix3(nm).normalize();
        N[i * 3] = v.x; N[i * 3 + 1] = v.y; N[i * 3 + 2] = v.z;
      }
    }
    if (planar > 0) {
      for (let i = 0; i < n; i++) {
        const nx = Math.abs(N[i * 3]), ny = Math.abs(N[i * 3 + 1]), nz = Math.abs(N[i * 3 + 2]);
        const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
        let u, w;
        if (ny >= nx && ny >= nz) { u = x; w = z; } else if (nx >= nz) { u = z; w = y; } else { u = x; w = y; }
        U[i * 2] = u / planar; U[i * 2 + 1] = w / planar;
      }
    } else if (g.attributes.uv) {
      const uv = g.attributes.uv;
      for (let i = 0; i < n; i++) {
        U[i * 2] = uv.getX(i) * (uvScale ? uvScale[0] : 1);
        U[i * 2 + 1] = uv.getY(i) * (uvScale ? uvScale[1] : 1);
      }
    }
    let idx;
    if (g.index) idx = Array.from(g.index.array);
    else { idx = new Array(n); for (let i = 0; i < n; i++) idx[i] = i; }
    // flip winding if the matrix mirrors
    if (m.determinant() < 0) for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
    const c = new THREE.Color(color ?? 0xffffff);
    let vc = null;
    if (color === null && g.attributes.color) vc = g.attributes.color.array.slice(0, n * 3);
    this.parts.push({ P, N, U, idx, c, hasN, vc });
    return this;
  }
  get empty() { return this.parts.length === 0; }
  build() {
    let nv = 0, ni = 0;
    for (const p of this.parts) { nv += p.P.length / 3; ni += p.idx.length; }
    const P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), U = new Float32Array(nv * 2);
    const C = this.colors ? new Float32Array(nv * 3) : null;
    const I = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
    let ov = 0, oi = 0;
    let needNormals = false;
    for (const p of this.parts) {
      const n = p.P.length / 3;
      P.set(p.P, ov * 3); N.set(p.N, ov * 3); U.set(p.U, ov * 2);
      if (C && p.vc) C.set(p.vc, ov * 3);
      else if (C) for (let i = 0; i < n; i++) { C[(ov + i) * 3] = p.c.r; C[(ov + i) * 3 + 1] = p.c.g; C[(ov + i) * 3 + 2] = p.c.b; }
      for (let i = 0; i < p.idx.length; i++) I[oi + i] = p.idx[i] + ov;
      if (!p.hasN) needNormals = true;
      ov += n; oi += p.idx.length;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(U, 2));
    if (C) g.setAttribute('color', new THREE.BufferAttribute(C, 3));
    g.setIndex(new THREE.BufferAttribute(I, 1));
    if (needNormals) g.computeVertexNormals();
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

// shared primitive geometries (unit sized; scale with the matrix)
export const PRIM = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl8: new THREE.CylinderGeometry(0.5, 0.5, 1, 8, 1),
  cyl12: new THREE.CylinderGeometry(0.5, 0.5, 1, 12, 1),
  cyl16: new THREE.CylinderGeometry(0.5, 0.5, 1, 16, 1),
  cyl24: new THREE.CylinderGeometry(0.5, 0.5, 1, 24, 1),
  cone8: new THREE.CylinderGeometry(0, 0.5, 1, 8, 1),
  sphere: new THREE.SphereGeometry(0.5, 12, 8),
  plane: new THREE.PlaneGeometry(1, 1),
};
// wheel (cylinder lying along X)
export const WHEEL = new THREE.CylinderGeometry(0.5, 0.5, 1, 14, 1).rotateZ(Math.PI / 2);

/** Distance from a point to a polyline sample set using a uniform hash grid. */
export class PointGrid {
  constructor(cell = 20) { this.cell = cell; this.map = new Map(); }
  key(ix, iz) { return ix * 73856093 ^ iz * 19349663; }
  add(x, z, data) {
    const ix = Math.floor(x / this.cell), iz = Math.floor(z / this.cell);
    const k = this.key(ix, iz);
    let a = this.map.get(k);
    if (!a) { a = []; this.map.set(k, a); }
    a.push({ x, z, data });
  }
  /** visit all points within radius r */
  near(x, z, r, fn) {
    const c = this.cell;
    const x0 = Math.floor((x - r) / c), x1 = Math.floor((x + r) / c);
    const z0 = Math.floor((z - r) / c), z1 = Math.floor((z + r) / c);
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
      const a = this.map.get(this.key(ix, iz));
      if (!a) continue;
      for (const p of a) { const dx = p.x - x, dz = p.z - z; if (dx * dx + dz * dz <= r * r) { if (fn(p, Math.sqrt(dx * dx + dz * dz)) === false) return; } }
    }
  }
}

/** Resample a {samples} path into points every `step` metres between s0 and s1. */
export function resample(path, step, s0 = 0, s1 = path.length) {
  const out = [];
  const S = path.samples;
  const n = Math.max(1, Math.round((s1 - s0) / step));
  let j = 0;
  for (let k = 0; k <= n; k++) {
    const s = s0 + (s1 - s0) * (k / n);
    while (j < S.length - 2 && S[j + 1].s < s) j++;
    const a = S[j], b = S[Math.min(j + 1, S.length - 1)];
    const t = b.s > a.s ? clamp01((s - a.s) / (b.s - a.s)) : 0;
    const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
    out.push({ x, z, s });
  }
  // tangents
  for (let i = 0; i < out.length; i++) {
    const p = out[Math.max(0, i - 1)], q = out[Math.min(out.length - 1, i + 1)];
    let dx = q.x - p.x, dz = q.z - p.z;
    const l = Math.hypot(dx, dz) || 1;
    out[i].tx = dx / l; out[i].tz = dz / l;
  }
  return out;
}

/** Shared canvas helper. */
export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

/** Tileable value-noise canvas (grey) – used for macro variation in shaders. */
export function noiseTexture(size = 256, seed = 7) {
  const rnd = mulberry(seed);
  const [c, ctx] = makeCanvas(size, size);
  const img = ctx.createImageData(size, size);
  const octaves = [[8, 0.5], [16, 0.25], [32, 0.15], [64, 0.1]];
  const grids = octaves.map(([n]) => { const g = new Float32Array(n * n); for (let i = 0; i < g.length; i++) g[i] = rnd(); return g; });
  // four independent channels (different offsets)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const ch = [0, 0, 0, 0];
    for (let o = 0; o < octaves.length; o++) {
      const [n, amp] = octaves[o];
      const g = grids[o];
      for (let k = 0; k < 4; k++) {
        const fx = ((x / size) * n + k * 0.37 * n) % n, fy = ((y / size) * n + k * 0.61 * n) % n;
        const ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
        const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
        const i1 = (ix + 1) % n, j1 = (iy + 1) % n;
        const a = g[iy * n + ix], b = g[iy * n + i1], cc = g[j1 * n + ix], d = g[j1 * n + i1];
        ch[k] += amp * (a + (b - a) * sx + (cc - a) * sy + (a - b - cc + d) * sx * sy);
      }
    }
    const i = (y * size + x) * 4;
    for (let k = 0; k < 4; k++) img.data[i + k] = Math.max(0, Math.min(255, Math.round(ch[k] * 255)));
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}
