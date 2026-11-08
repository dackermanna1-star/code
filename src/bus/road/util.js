// Road module helpers: deterministic hashing / RNG, smoothing, and a light-weight
// merged-geometry builder (append transformed templates into one BufferGeometry
// without creating intermediate Three objects).
import * as THREE from 'three';

export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const DEG = Math.PI / 180;
/** Period (m) of the along-road texture coordinate. Every along-road pattern period divides it. */
export const VPERIOD = 7200;

export function hash1(n) {
  let h = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}
export function hash2(a, b) { return hash1((a | 0) * 73856093 ^ (b | 0) * 19349663); }
export function hash3(a, b, c) { return hash1((a | 0) * 73856093 ^ (b | 0) * 19349663 ^ (c | 0) * 83492791); }

/** Small deterministic PRNG (mulberry32). */
export function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Along-road texture coordinate (metres, periodic VPERIOD) at s. */
export const vOf = (s) => ((s % VPERIOD) + VPERIOD) % VPERIOD;

// -----------------------------------------------------------------------------
// MeshBuilder: grows typed arrays; attributes position (3), normal (3), uv (2),
// color (4, optional), plus optional custom float attributes.
// -----------------------------------------------------------------------------
export class MeshBuilder {
  constructor({ color = false, extra = {} } = {}) {
    this.color = color;
    this.extra = extra;           // name -> itemSize
    this.cap = 1024;
    this.n = 0;
    this.pos = new Float32Array(this.cap * 3);
    this.nrm = new Float32Array(this.cap * 3);
    this.uv = new Float32Array(this.cap * 2);
    this.col = color ? new Float32Array(this.cap * 4) : null;
    this.ex = {};
    for (const k in extra) this.ex[k] = new Float32Array(this.cap * extra[k]);
    this.idx = [];
    // current per-vertex defaults
    this.c = [1, 1, 1, 1];
    this.e = {};
    for (const k in extra) this.e[k] = new Array(extra[k]).fill(0);
  }
  _grow(need) {
    if (this.n + need <= this.cap) return;
    let cap = this.cap;
    while (this.n + need > cap) cap *= 2;
    const g = (a, k) => { const b = new Float32Array(cap * k); b.set(a); return b; };
    this.pos = g(this.pos, 3); this.nrm = g(this.nrm, 3); this.uv = g(this.uv, 2);
    if (this.col) this.col = g(this.col, 4);
    for (const k in this.ex) this.ex[k] = g(this.ex[k], this.extra[k]);
    this.cap = cap;
  }
  setColor(r, g, b, a = 1) { this.c[0] = r; this.c[1] = g; this.c[2] = b; this.c[3] = a; return this; }
  setExtra(name, ...v) { const e = this.e[name]; for (let i = 0; i < e.length; i++) e[i] = v[i] ?? 0; return this; }
  /** Append one vertex; returns its index. */
  v(x, y, z, nx, ny, nz, u, w) {
    this._grow(1);
    const i = this.n++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.nrm[i * 3] = nx; this.nrm[i * 3 + 1] = ny; this.nrm[i * 3 + 2] = nz;
    this.uv[i * 2] = u; this.uv[i * 2 + 1] = w;
    if (this.col) { const c = this.c; this.col[i * 4] = c[0]; this.col[i * 4 + 1] = c[1]; this.col[i * 4 + 2] = c[2]; this.col[i * 4 + 3] = c[3]; }
    for (const k in this.ex) { const e = this.e[k], a = this.ex[k], m = e.length; for (let j = 0; j < m; j++) a[i * m + j] = e[j]; }
    return i;
  }
  tri(a, b, c) { this.idx.push(a, b, c); }
  quad(a, b, c, d) { this.idx.push(a, b, c, a, c, d); }
  /**
   * Append a template geometry (non-indexed or indexed BufferGeometry) transformed by
   * matrix m (THREE.Matrix4). uvScale optional. Colour = current colour.
   */
  addGeometry(geo, m, nm = null) {
    const p = geo.attributes.position, nr = geo.attributes.normal, uv = geo.attributes.uv;
    const base = this.n;
    const e = m.elements;
    let ne = null;
    if (!nm) { _nm.getNormalMatrix(m); ne = _nm.elements; } else ne = nm.elements;
    this._grow(p.count);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const X = e[0] * x + e[4] * y + e[8] * z + e[12];
      const Y = e[1] * x + e[5] * y + e[9] * z + e[13];
      const Z = e[2] * x + e[6] * y + e[10] * z + e[14];
      let nx = 0, ny = 1, nz = 0;
      if (nr) {
        const a = nr.getX(i), b = nr.getY(i), c = nr.getZ(i);
        nx = ne[0] * a + ne[3] * b + ne[6] * c; ny = ne[1] * a + ne[4] * b + ne[7] * c; nz = ne[2] * a + ne[5] * b + ne[8] * c;
        const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      }
      this.v(X, Y, Z, nx, ny, nz, uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
    }
    if (geo.index) { const ia = geo.index.array; for (let i = 0; i < ia.length; i++) this.idx.push(base + ia[i]); }
    else for (let i = 0; i < p.count; i++) this.idx.push(base + i);
    return base;
  }
  get empty() { return this.idx.length === 0; }
  build() {
    if (this.empty) return null;
    const g = new THREE.BufferGeometry();
    const n = this.n;
    g.setAttribute('position', new THREE.BufferAttribute(this.pos.slice(0, n * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nrm.slice(0, n * 3), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(this.uv.slice(0, n * 2), 2));
    if (this.col) g.setAttribute('color', new THREE.BufferAttribute(this.col.slice(0, n * 4), 4));
    for (const k in this.ex) g.setAttribute(k, new THREE.BufferAttribute(this.ex[k].slice(0, n * this.extra[k]), this.extra[k]));
    g.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}
const _nm = new THREE.Matrix3();

/** Box template centred at origin (size w,h,d) with per-face uv in metres. */
export function boxGeo(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv, p = g.attributes.position, n = g.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (ax > 0.5) uv.setXY(i, z, y); else if (ay > 0.5) uv.setXY(i, x, z); else uv.setXY(i, x, y);
  }
  return g;
}
