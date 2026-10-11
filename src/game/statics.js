// Permanent clutter: append-only static meshes for things that never go away — zombie
// survival bodies, gibs and brass, and the blood / scorch / bullet decals of every mode.
//
// How it stays cheap however long the game runs:
//  - everything is bucketed by map area (CELL x CELL columns): one mesh per area and
//    kind, with a tight bounding sphere, so areas outside the view are culled whole
//  - buffers grow by doubling; what changed in a frame is uploaded as one range per
//    mesh (nothing is copied or re-sent every frame)
//  - bodies carry a second, low-poly index over the same vertices (vertex clustering),
//    drawn when their area is far away; brass has none (it's sub-pixel there)
//  - decals don't stack without end: a spot that already has a few of the same kind
//    and size is soaked and takes no more (it looks the same, overdraw stays bounded)
import * as THREE from 'three';

export const CELL = 1024;
const MAX_VERTS = 65535; // 16-bit indices
const LOD_DIST = 650; // camera this far outside an area's bounds: draw its low-poly index

const pow2 = (min, want) => { let c = min; while (c < want) c *= 2; return c; };

/** One growable append-only mesh. layout: [[name, itemSize, ArrayType, normalized]]. */
export class GrowMesh {
  constructor(parent, material, layout, o = {}) {
    this.layout = layout;
    this.withLod = !!o.lod;
    this.pad = o.pad ?? 8;
    this.nv = 0; this.ni = 0; this.nl = 0;
    this.vcap = 0; this.icap = 0; this.lcap = 0;
    this.arr = {}; this.attrs = {};
    this.idx = null; this.lidx = null;
    this.min = [Infinity, Infinity, Infinity]; this.max = [-Infinity, -Infinity, -Infinity];
    this.sphere = new THREE.Sphere(new THREE.Vector3(), 0);
    this.dv = [Infinity, -1]; this.di = [Infinity, -1]; this.dl = [Infinity, -1]; // dirty ranges
    this.far = false;
    this.full = null; this.lodGeo = null;
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
    this.mesh.matrixAutoUpdate = false;
    this.mesh.renderOrder = o.order ?? 0;
    this.mesh.name = o.name || 'statics';
    this.grow(o.verts ?? 1024, (o.verts ?? 1024) * 2, this.withLod ? (o.verts ?? 1024) : 0);
    parent.add(this.mesh);
  }

  room(nv) { return this.nv + nv <= MAX_VERTS; }

  /** Re-allocate at new capacities (copies the data; the GPU buffers are re-created). */
  grow(vc, ic, lc) {
    const oldFull = this.full, oldLod = this.lodGeo;
    for (const [name, n, T] of this.layout) {
      const a = new T(vc * n);
      if (this.arr[name]) a.set(this.arr[name].subarray(0, this.nv * n));
      this.arr[name] = a;
    }
    const idx = new Uint16Array(ic);
    if (this.idx) idx.set(this.idx.subarray(0, this.ni));
    this.idx = idx;
    if (this.withLod) {
      const l = new Uint16Array(Math.max(lc, 3));
      if (this.lidx) l.set(this.lidx.subarray(0, this.nl));
      this.lidx = l;
    }
    this.vcap = vc; this.icap = ic; this.lcap = this.withLod ? this.lidx.length : 0;
    const geo = new THREE.BufferGeometry();
    for (const [name, n, , norm] of this.layout) {
      const at = new THREE.BufferAttribute(this.arr[name], n, !!norm).setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute(name, at);
      this.attrs[name] = at;
    }
    geo.setIndex(new THREE.BufferAttribute(this.idx, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, this.ni);
    geo.boundingSphere = this.sphere;
    this.full = geo;
    if (this.withLod) {
      const lg = new THREE.BufferGeometry();
      for (const [name] of this.layout) lg.setAttribute(name, this.attrs[name]);
      lg.setIndex(new THREE.BufferAttribute(this.lidx, 1).setUsage(THREE.DynamicDrawUsage));
      lg.setDrawRange(0, this.nl);
      lg.boundingSphere = this.sphere;
      this.lodGeo = lg;
    }
    this.mesh.geometry = this.far && this.lodGeo ? this.lodGeo : this.full;
    // fresh buffers go up whole on first use: nothing left to send in pieces
    this.dv = [Infinity, -1]; this.di = [Infinity, -1]; this.dl = [Infinity, -1];
    oldFull?.dispose();
    oldLod?.dispose();
  }

  /**
   * Append nv vertices (data: { name: array of nv * itemSize }) and triangles (indices
   * local to them; lidx: the low-poly ones). Returns the first vertex.
   */
  append(data, nv, idx, lidx = null) {
    const ni = idx.length, nl = lidx ? lidx.length : 0;
    if (this.nv + nv > this.vcap || this.ni + ni > this.icap || this.nl + nl > this.lcap) {
      this.grow(Math.min(MAX_VERTS, pow2(this.vcap, this.nv + nv)), pow2(this.icap, this.ni + ni), this.withLod ? pow2(Math.max(this.lcap, 3), this.nl + nl) : 0);
    }
    const v0 = this.nv;
    for (const [name, n] of this.layout) {
      const src = data[name];
      if (src) this.arr[name].set(src.length > nv * n ? src.subarray(0, nv * n) : src, v0 * n);
    }
    const P = this.arr.position, mn = this.min, mx = this.max;
    for (let i = v0; i < v0 + nv; i++) {
      const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
      if (x < mn[0]) mn[0] = x; if (x > mx[0]) mx[0] = x;
      if (y < mn[1]) mn[1] = y; if (y > mx[1]) mx[1] = y;
      if (z < mn[2]) mn[2] = z; if (z > mx[2]) mx[2] = z;
    }
    for (let i = 0; i < ni; i++) this.idx[this.ni + i] = idx[i] + v0;
    if (nl) for (let i = 0; i < nl; i++) this.lidx[this.nl + i] = lidx[i] + v0;
    this.mark(this.dv, v0, v0 + nv);
    this.mark(this.di, this.ni, this.ni + ni);
    if (nl) this.mark(this.dl, this.nl, this.nl + nl);
    this.nv += nv; this.ni += ni; this.nl += nl;
    this.full.setDrawRange(0, this.ni);
    this.lodGeo?.setDrawRange(0, this.nl);
    this.bounds();
    return v0;
  }

  /** Vertices [a, b) were changed in place. */
  touch(a, b) { this.mark(this.dv, a, b); }

  /** Grow the bounds to take in a point (a decal that moves while it spreads). */
  include(x, y, z) {
    const mn = this.min, mx = this.max;
    if (x >= mn[0] && x <= mx[0] && y >= mn[1] && y <= mx[1] && z >= mn[2] && z <= mx[2]) return;
    mn[0] = Math.min(mn[0], x); mn[1] = Math.min(mn[1], y); mn[2] = Math.min(mn[2], z);
    mx[0] = Math.max(mx[0], x); mx[1] = Math.max(mx[1], y); mx[2] = Math.max(mx[2], z);
    this.bounds();
  }

  mark(r, a, b) { if (a < r[0]) r[0] = a; if (b > r[1]) r[1] = b; }

  bounds() {
    const mn = this.min, mx = this.max;
    this.sphere.center.set((mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2);
    this.sphere.radius = Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) / 2 + this.pad;
  }

  /** Send this frame's changes (one range per buffer). */
  flush() {
    const v = this.dv;
    if (v[1] > v[0]) {
      for (const [name, n] of this.layout) {
        const at = this.attrs[name];
        at.addUpdateRange(v[0] * n, (v[1] - v[0]) * n);
        at.needsUpdate = true;
      }
    }
    const i = this.di;
    if (i[1] > i[0]) { const ix = this.full.index; ix.addUpdateRange(i[0], i[1] - i[0]); ix.needsUpdate = true; }
    const l = this.dl;
    if (l[1] > l[0] && this.lodGeo) { const ix = this.lodGeo.index; ix.addUpdateRange(l[0], l[1] - l[0]); ix.needsUpdate = true; }
    this.dv = [Infinity, -1]; this.di = [Infinity, -1]; this.dl = [Infinity, -1];
  }

  /** Full or low-poly, by the camera's distance to this mesh's bounds. */
  pickLod(cam) {
    if (!this.withLod || !cam) return;
    const c = this.sphere.center;
    const far = Math.hypot(cam[0] - c.x, cam[1] - c.y, cam[2] - c.z) - this.sphere.radius > LOD_DIST;
    if (far === this.far) return;
    this.far = far;
    this.mesh.geometry = far ? this.lodGeo : this.full;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.full?.dispose();
    this.lodGeo?.dispose();
  }
}

/** Grow meshes keyed by kind and map area. */
export class StaticStore {
  /** material(kind) -> THREE.Material; o: GrowMesh options (+ verts: first capacity). */
  constructor(parent, layout, material, o = {}) {
    this.parent = parent;
    this.layout = layout;
    this.material = material;
    this.o = o;
    this.cells = new Map(); // `${kind}|${cx},${cy}` -> [GrowMesh]
    this.list = [];
    this.dirty = new Set();
  }

  /** The mesh to append nv vertices at (x, y) of this kind to. */
  meshFor(kind, x, y, nv) {
    const key = `${kind}|${Math.floor(x / CELL)},${Math.floor(y / CELL)}`;
    let arr = this.cells.get(key);
    if (!arr) { arr = []; this.cells.set(key, arr); }
    let m = arr[arr.length - 1];
    if (!m || !m.room(nv)) {
      m = new GrowMesh(this.parent, this.material(kind), this.layout, { ...this.o, name: `${this.o.name || 'statics'}_${key}` });
      arr.push(m);
      this.list.push(m);
    }
    return m;
  }

  /** Append (see GrowMesh.append) where the first vertex lies. Returns { m, v0 }. */
  add(kind, data, nv, idx, lidx = null) {
    const P = data.position;
    const m = this.meshFor(kind, P[0], P[1], nv);
    const v0 = m.append(data, nv, idx, lidx);
    this.dirty.add(m);
    return { m, v0 };
  }

  touch(m, a, b) { m.touch(a, b); this.dirty.add(m); }

  /** Per frame: upload changes, pick full / low-poly by distance (cam in GS units). */
  update(cam) {
    if (this.dirty.size) { for (const m of this.dirty) m.flush(); this.dirty.clear(); }
    if (this.o.lod && cam) for (const m of this.list) m.pickLod(cam);
  }

  stats() {
    let verts = 0, tris = 0, lod = 0;
    for (const m of this.list) { verts += m.nv; tris += m.ni / 3; lod += m.nl / 3; }
    return { meshes: this.list.length, verts, tris, lodTris: lod };
  }

  clear() {
    for (const m of this.list) m.dispose();
    this.list = [];
    this.cells.clear();
    this.dirty.clear();
  }
}

/**
 * Low-poly index for a mesh (vertex clustering): vertices snapped to a grid of `cell`
 * units collapse onto the first one in each grid cell; triangles that collapse vanish.
 * Uses only the original vertices, so it can share their buffers.
 */
export function clusterIndex(pos, idx, cell) {
  const n = pos.length / 3;
  const rep = new Int32Array(n);
  const seen = new Map();
  for (let i = 0; i < n; i++) {
    const k = `${Math.floor(pos[i * 3] / cell)},${Math.floor(pos[i * 3 + 1] / cell)},${Math.floor(pos[i * 3 + 2] / cell)}`;
    let r = seen.get(k);
    if (r === undefined) { r = i; seen.set(k, i); }
    rep[i] = r;
  }
  const out = [];
  const tris = new Set();
  for (let t = 0; t < idx.length; t += 3) {
    const a = rep[idx[t]], b = rep[idx[t + 1]], c = rep[idx[t + 2]];
    if (a === b || b === c || a === c) continue;
    // same triangle (either winding) only once
    const s = a < b ? (a < c ? `${a},${Math.min(b, c)},${Math.max(b, c)}` : `${c},${a},${b}`) : (b < c ? `${b},${Math.min(a, c)},${Math.max(a, c)}` : `${c},${b},${a}`);
    if (tris.has(s)) continue;
    tris.add(s);
    out.push(a, b, c);
  }
  return out;
}

/**
 * "Is this spot soaked yet?" — counts decals of one kind by position (quantised to a
 * fraction of their size), surface direction and size class.
 */
export class Soak {
  constructor(frac = 0.5, max = 3, minQ = 2) {
    this.frac = frac; this.max = max; this.minQ = minQ;
    this.map = new Map();
  }

  /** True (and counted) if a decal of this size fits here; false if the spot is full. */
  take(p, n, size) {
    const q = Math.max(this.minQ, size * this.frac);
    const sc = Math.round(Math.log2(q) * 2);
    const k = `${Math.round(p[0] / q)},${Math.round(p[1] / q)},${Math.round(p[2] / q)},${Math.round(n[0] * 2)},${Math.round(n[1] * 2)},${Math.round(n[2] * 2)},${sc}`;
    const c = this.map.get(k) || 0;
    if (c >= this.max) return false;
    this.map.set(k, c + 1);
    return true;
  }

  clear() { this.map.clear(); }
}

/**
 * Permanent textured quads (decals) of one kind: a StaticStore of quads with a uv,
 * an RGBA colour and optionally a per-quad float (the puddles' spread).
 * Handles { m, i } let a quad be changed later (puddles spread and follow a body).
 */
export class QuadStore {
  constructor(parent, material, o = {}) {
    this.colName = o.colName || 'aCol';
    this.prog = !!o.prog;
    const layout = [['position', 3, Float32Array], ['uv', 2, Float32Array], [this.colName, 4, Float32Array]];
    if (this.prog) layout.push(['aProg', 1, Float32Array]);
    this.store = new StaticStore(parent, layout, () => material, { verts: 256, pad: o.pad ?? 4, order: o.order ?? 0, name: o.name || 'decals' });
    this.soak = o.soak || null;
    this.count = 0;
    this._P = new Float32Array(12); this._U = new Float32Array(8); this._C = new Float32Array(16); this._G = new Float32Array(4);
  }

  /**
   * A new quad centred at c spanning ±U*hu, ±V*hv; uv rect [u0, v0, u1, v1]; rgb, a.
   * soakAt / n / size: checked against the Soak (null: the spot is full, nothing added).
   */
  add(c, U, V, hu, hv, uvr, rgb, a, n = null, size = 0) {
    if (this.soak && n && !this.soak.take(c, n, size)) return null;
    const P = this._P;
    this.quad(P, 0, c, U, V, hu, hv);
    const T = this._U;
    T[0] = uvr[0]; T[1] = uvr[1]; T[2] = uvr[2]; T[3] = uvr[1]; T[4] = uvr[2]; T[5] = uvr[3]; T[6] = uvr[0]; T[7] = uvr[3];
    const C = this._C;
    for (let k = 0; k < 4; k++) { C[k * 4] = rgb[0]; C[k * 4 + 1] = rgb[1]; C[k * 4 + 2] = rgb[2]; C[k * 4 + 3] = a; }
    const data = { position: P, uv: T, [this.colName]: C };
    if (this.prog) { this._G.fill(0); data.aProg = this._G; }
    const { m, v0 } = this.store.add('q', data, 4, QUAD_IDX);
    this.count++;
    return { m, i: v0 / 4 };
  }

  quad(P, o, c, U, V, hu, hv) {
    for (let k = 0; k < 4; k++) {
      const su = k === 0 || k === 3 ? -hu : hu, sv = k < 2 ? -hv : hv;
      P[o + k * 3] = c[0] + U[0] * su + V[0] * sv;
      P[o + k * 3 + 1] = c[1] + U[1] * su + V[1] * sv;
      P[o + k * 3 + 2] = c[2] + U[2] * su + V[2] * sv;
    }
  }

  setQuad(h, c, U, V, hu, hv) {
    this.quad(h.m.arr.position, h.i * 12, c, U, V, hu, hv);
    const r = Math.max(hu, hv) * 1.5;
    h.m.include(c[0] - r, c[1] - r, c[2] - r);
    h.m.include(c[0] + r, c[1] + r, c[2] + r);
    this.store.touch(h.m, h.i * 4, h.i * 4 + 4);
  }

  setColor(h, rgb, a) {
    const C = h.m.arr[this.colName], o = h.i * 16;
    for (let k = 0; k < 4; k++) { C[o + k * 4] = rgb[0]; C[o + k * 4 + 1] = rgb[1]; C[o + k * 4 + 2] = rgb[2]; C[o + k * 4 + 3] = a; }
    this.store.touch(h.m, h.i * 4, h.i * 4 + 4);
  }

  setProg(h, p) {
    h.m.arr.aProg.fill(p, h.i * 4, h.i * 4 + 4);
    this.store.touch(h.m, h.i * 4, h.i * 4 + 4);
  }

  update() { this.store.update(null); }

  clear() { this.store.clear(); this.soak?.clear(); this.count = 0; }
}

const QUAD_IDX = [0, 1, 2, 0, 2, 3];
