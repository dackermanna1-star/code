// =============================================================================
// City module utilities: deterministic RNG, hashing, terrain/land queries in
// region-anchored (local) coordinates, and a fast typed-array geometry builder
// used for all merged static meshes (towers, mid-rises, port, pylons ...).
// =============================================================================
import * as THREE from 'three';
import { GEO, AIRPORT_FLAT } from '../geo.js';

export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const lerp = (a, b, t) => a + (b - a) * t;

/** Returns a function that is true when more than `ms` passed since it last returned true (generator yields). */
export function ticker(ms = 4) {
  let t = performance.now();
  return () => { const n = performance.now(); if (n - t > ms) { t = n; return true; } return false; };
}

/** mulberry32 PRNG -> function returning [0, 1). */
export function rng(seed) {
  let a = seed >>> 0;
  const f = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.range = (lo, hi) => lo + (hi - lo) * f();
  f.int = (lo, hi) => lo + Math.floor(f() * (hi - lo + 1));
  f.pick = (arr) => arr[Math.floor(f() * arr.length)];
  f.chance = (p) => f() < p;
  f.gauss = () => (f() + f() + f() - 1.5) * 1.1547;
  return f;
}

/** Integer lattice hash [0,1) (same as geo.js). */
export const hash2 = GEO.hash2;

/**
 * Port of the terrain shader's GLSL hash12 with float32 emulation, so the CPU
 * can find the farmsteads / lots that the terrain paints.
 */
const f32 = Math.fround;
const fr = (x) => f32(x - Math.floor(x));
export function hash12(px, py) {
  let ax = fr(f32(px * f32(0.1031))), ay = fr(f32(py * f32(0.1031))), az = fr(f32(px * f32(0.1031)));
  // p3 += dot(p3, p3.yzx + 33.33)
  const d = f32(f32(f32(ax * f32(ay + f32(33.33))) + f32(ay * f32(az + f32(33.33)))) + f32(az * f32(ax + f32(33.33))));
  ax = f32(ax + d); ay = f32(ay + d); az = f32(az + d);
  return fr(f32(f32(ax + ay) * az));
}

/** sRGB hex -> linear [r,g,b]. */
export function lin(hex, mul = 1) {
  const c = new THREE.Color(hex);
  return [c.r * mul, c.g * mul, c.b * mul];
}
export function mixc(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
export function scalec(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; }

/**
 * Terrain / land queries for one region, in LOCAL coordinates relative to the
 * region anchor. Uses the shared geography contract (geo.js).
 */
export class Land {
  constructor(app, anchorKind) {
    this.app = app;
    this.kind = anchorKind;
    this.dep = { x: 0, z: 0 };
    this.arr = { x: 0, z: 0 };
    this.sync();
  }
  sync() {
    const w = this.app.world;
    this.dep.x = w.departureOrigin.x; this.dep.z = w.departureOrigin.z;
    this.arr.x = w.arrivalOrigin.x; this.arr.z = w.arrivalOrigin.z;
    const a = this.kind === 'arrival' ? this.arr : this.dep;
    this.ax = a.x; this.az = a.z;
  }
  /** Terrain height at local (x, z). */
  h(x, z) { return GEO.terrainHeight(this.ax + x, this.az + z, this.dep, this.arr); }
  /** Water mask 0..1 at local (x, z). */
  water(x, z) { return GEO.waterMask(this.ax + x, this.az + z, this.dep, this.arr); }
  /** True when (x, z) and a ring of radius r around it are dry land. */
  dry(x, z, r = 0) {
    if (this.water(x, z) > 0.001) return false;
    if (r > 0) {
      for (let k = 0; k < 4; k++) {
        const a = k * Math.PI / 2 + 0.4;
        if (this.water(x + Math.cos(a) * r, z + Math.sin(a) * r) > 0.001) return false;
      }
    }
    return true;
  }
  /** Distance (m, + inland) from the arrival sea shore at local z (arrival region only). */
  shoreX(z) { return GEO.coastX(z) + 120 * GEO.vnoise(z / 300, 3.7); }
  /** Min distance outside the flattened airport rectangle (negative inside). */
  airportDist(x, z, anchorX = 0, anchorZ = 0) {
    const F = AIRPORT_FLAT, ax = x - anchorX, az = z - anchorZ;
    const fx = Math.max(F.xMin - ax, ax - F.xMax), fz = Math.max(F.zMin - az, az - F.zMax);
    if (fx < 0 && fz < 0) return Math.max(fx, fz);
    return Math.hypot(Math.max(fx, 0), Math.max(fz, 0));
  }
  /** Lowest terrain height over a footprint (for building bases). */
  hMin(x, z, hw, hd) {
    return Math.min(this.h(x - hw, z - hd), this.h(x + hw, z - hd), this.h(x - hw, z + hd), this.h(x + hw, z + hd), this.h(x, z));
  }
}

// -----------------------------------------------------------------------------
// Geometry builder (merged static meshes).
// Per vertex: position, normal, color (linear base albedo), aFac (facade metres
// u, v), aBld (style, seed, floor height, bay width).
// Styles (see materials.js): 0 flat roof, 1 curtain wall, 2 punched windows,
// 3 ribbon windows, 4 residential, 5 industrial, 6 plain, 7 pitched roof,
// 8 painted metal, 9 glass (no structure), 10 emissive sign / lamp, 11 lawn,
// 12 shipping container, 13 swimming pool, 14 sheltered water / wet
// -----------------------------------------------------------------------------
export const NO_SHADOW = -100000;
export const ST = { ROOF: 0, CURTAIN: 1, PUNCHED: 2, RIBBON: 3, RESID: 4, INDUSTRIAL: 5, PLAIN: 6, PITCHED: 7, METAL: 8, GLASS: 9, LAMP: 10, GRASS: 11, CONTAINER: 12, POOL: 13, WATER: 14 };

export class GeoBuilder {
  constructor(cap = 4096) {
    this.n = 0;
    this._alloc(cap);
    this.idx = [];
    this.style = [0, 0, 3.5, 1.5];     // current aBld
    this.color = [0.5, 0.5, 0.5];
    this.gy = NO_SHADOW;               // ground height for the projected shadow pass (NO_SHADOW = does not cast)
  }
  _alloc(cap) {
    const grow = (old, k) => { const a = new Float32Array(cap * k); if (old) a.set(old.subarray(0, Math.min(old.length, cap * k))); return a; };
    this.P = grow(this.P, 3); this.N = grow(this.N, 3); this.C = grow(this.C, 3); this.F = grow(this.F, 2); this.B = grow(this.B, 4); this.G = grow(this.G, 1);
    this.cap = cap;
  }
  setStyle(style, seed = 0, floorH = 3.5, bayW = 1.5) { this.style = [style, seed, floorH, bayW]; return this; }
  setColor(c) { this.color = c; return this; }
  vert(x, y, z, nx, ny, nz, u, v) {
    if (this.n >= this.cap) this._alloc(this.cap * 2);
    const i = this.n++;
    this.P[i * 3] = x; this.P[i * 3 + 1] = y; this.P[i * 3 + 2] = z;
    this.N[i * 3] = nx; this.N[i * 3 + 1] = ny; this.N[i * 3 + 2] = nz;
    const c = this.color; this.C[i * 3] = c[0]; this.C[i * 3 + 1] = c[1]; this.C[i * 3 + 2] = c[2];
    this.F[i * 2] = u; this.F[i * 2 + 1] = v;
    const s = this.style; this.B[i * 4] = s[0]; this.B[i * 4 + 1] = s[1]; this.B[i * 4 + 2] = s[2]; this.B[i * 4 + 3] = s[3];
    this.G[i] = this.gy;
    return i;
  }
  /** Quad from 4 corners (counter-clockwise seen from the front), with facade uv. */
  quad(p0, p1, p2, p3, uv = null) {
    const ax = p1[0] - p0[0], ay = p1[1] - p0[1], az = p1[2] - p0[2];
    const bx = p3[0] - p0[0], by = p3[1] - p0[1], bz = p3[2] - p0[2];
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const u = uv || [0, 0, 1, 0, 1, 1, 0, 1];
    const a = this.vert(p0[0], p0[1], p0[2], nx, ny, nz, u[0], u[1]);
    const b = this.vert(p1[0], p1[1], p1[2], nx, ny, nz, u[2], u[3]);
    const c = this.vert(p2[0], p2[1], p2[2], nx, ny, nz, u[4], u[5]);
    const d = this.vert(p3[0], p3[1], p3[2], nx, ny, nz, u[6], u[7]);
    this.idx.push(a, b, c, a, c, d);
  }
  /** Quad whose winding is flipped if needed so that its normal points along `outDir`. */
  quadOut(p0, p1, p2, p3, outDir, uv = null) {
    const ax = p1[0] - p0[0], ay = p1[1] - p0[1], az = p1[2] - p0[2];
    const bx = p3[0] - p0[0], by = p3[1] - p0[1], bz = p3[2] - p0[2];
    const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    if (nx * outDir[0] + ny * outDir[1] + nz * outDir[2] >= 0) this.quad(p0, p1, p2, p3, uv);
    else this.quad(p1, p0, p3, p2, uv ? [uv[2], uv[3], uv[0], uv[1], uv[6], uv[7], uv[4], uv[5]] : null);
  }
  tri(p0, p1, p2, uv = null) {
    const ax = p1[0] - p0[0], ay = p1[1] - p0[1], az = p1[2] - p0[2];
    const bx = p2[0] - p0[0], by = p2[1] - p0[1], bz = p2[2] - p0[2];
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const u = uv || [0, 0, 1, 0, 0.5, 1];
    const a = this.vert(p0[0], p0[1], p0[2], nx, ny, nz, u[0], u[1]);
    const b = this.vert(p1[0], p1[1], p1[2], nx, ny, nz, u[2], u[3]);
    const c = this.vert(p2[0], p2[1], p2[2], nx, ny, nz, u[4], u[5]);
    this.idx.push(a, b, c);
  }
  /**
   * Oriented box: centre (x, z), base y0, top y1, half sizes hw (local x) and hd
   * (local z), rotation ry (radians, about +Y). Walls get facade uv in metres
   * (u along the wall, v = height above vBase). `roofStyle` sets the top's style
   * (null = no top), `bottom` adds a bottom face.
   */
  box(x, z, y0, y1, hw, hd, ry = 0, { roofStyle = ST.ROOF, roofColor = null, vBase = null, bottom = false, walls = true } = {}) {
    const c = Math.cos(ry), s = Math.sin(ry);
    const P = (lx, lz, y) => [x + lx * c + lz * s, y, z - lx * s + lz * c];
    const vb = vBase === null ? y0 : vBase;
    const v0 = y0 - vb, v1 = y1 - vb;
    if (walls) {
      // four walls, u runs left->right seen from outside, continuous around the corner
      const W = 2 * hw, D = 2 * hd;
      this.quad(P(-hw, hd, y0), P(hw, hd, y0), P(hw, hd, y1), P(-hw, hd, y1), [0, v0, W, v0, W, v1, 0, v1]);           // +z
      this.quad(P(hw, hd, y0), P(hw, -hd, y0), P(hw, -hd, y1), P(hw, hd, y1), [W, v0, W + D, v0, W + D, v1, W, v1]);   // +x
      this.quad(P(hw, -hd, y0), P(-hw, -hd, y0), P(-hw, -hd, y1), P(hw, -hd, y1), [W + D, v0, 2 * W + D, v0, 2 * W + D, v1, W + D, v1]);
      this.quad(P(-hw, -hd, y0), P(-hw, hd, y0), P(-hw, hd, y1), P(-hw, -hd, y1), [2 * W + D, v0, 2 * W + 2 * D, v0, 2 * W + 2 * D, v1, 2 * W + D, v1]);
    }
    if (roofStyle !== null) {
      const saveS = this.style, saveC = this.color;
      this.style = [roofStyle, saveS[1], saveS[2], saveS[3]];
      if (roofColor) this.color = roofColor;
      this.quad(P(-hw, hd, y1), P(hw, hd, y1), P(hw, -hd, y1), P(-hw, -hd, y1), [x - hw, z + hd, x + hw, z + hd, x + hw, z - hd, x - hw, z - hd]);
      this.style = saveS; this.color = saveC;
    }
    if (bottom) this.quad(P(-hw, -hd, y0), P(hw, -hd, y0), P(hw, hd, y0), P(-hw, hd, y0));
  }
  /** Gabled roof (ridge along local x) on top of a box footprint. */
  gable(x, z, y0, rise, hw, hd, ry = 0, overhang = 0.4, gableColor = null) {
    const c = Math.cos(ry), s = Math.sin(ry);
    const P = (lx, lz, y) => [x + lx * c + lz * s, y, z - lx * s + lz * c];
    const ow = hw + overhang, od = hd + overhang;
    const y1 = y0 + rise;
    const sl = Math.hypot(od, rise);
    this.quad(P(-ow, od, y0 - overhang * rise / hd), P(ow, od, y0 - overhang * rise / hd), P(ow, 0, y1), P(-ow, 0, y1), [0, 0, 2 * ow, 0, 2 * ow, sl, 0, sl]);
    this.quad(P(ow, -od, y0 - overhang * rise / hd), P(-ow, -od, y0 - overhang * rise / hd), P(-ow, 0, y1), P(ow, 0, y1), [0, 0, 2 * ow, 0, 2 * ow, sl, 0, sl]);
    if (gableColor) {
      const saveC = this.color, saveS = this.style;
      this.color = gableColor; this.style = [ST.PLAIN, saveS[1], saveS[2], saveS[3]];
      this.tri(P(hw, hd, y0), P(hw, -hd, y0), P(hw, 0, y1), [0, 0, 2 * hd, 0, hd, rise]);
      this.tri(P(-hw, -hd, y0), P(-hw, hd, y0), P(-hw, 0, y1), [0, 0, 2 * hd, 0, hd, rise]);
      this.color = saveC; this.style = saveS;
    }
  }
  /** Vertical cylinder (open top unless capped) with n sides. */
  cylinder(x, z, y0, y1, r0, r1 = r0, n = 10, { cap = true, capStyle = null } = {}) {
    const saveG = this.gy; this.gy = NO_SHADOW;          // smooth normals: excluded from the shadow pass
    const circ = 2 * Math.PI * Math.max(r0, r1);
    for (let i = 0; i < n; i++) {
      const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2;
      const u0 = circ * i / n, u1 = circ * (i + 1) / n;
      const p0 = [x + Math.cos(a0) * r0, y0, z + Math.sin(a0) * r0], p1 = [x + Math.cos(a1) * r0, y0, z + Math.sin(a1) * r0];
      const p2 = [x + Math.cos(a1) * r1, y1, z + Math.sin(a1) * r1], p3 = [x + Math.cos(a0) * r1, y1, z + Math.sin(a0) * r1];
      // smooth normals
      const am = (a0 + a1) / 2;
      const slope = (r0 - r1) / Math.max(1e-3, y1 - y0);
      const k = 1 / Math.hypot(1, slope);
      const i0 = this.vert(p0[0], p0[1], p0[2], Math.cos(a0) * k, slope * k, Math.sin(a0) * k, u0, 0);
      const i1 = this.vert(p1[0], p1[1], p1[2], Math.cos(a1) * k, slope * k, Math.sin(a1) * k, u1, 0);
      const i2 = this.vert(p2[0], p2[1], p2[2], Math.cos(a1) * k, slope * k, Math.sin(a1) * k, u1, y1 - y0);
      const i3 = this.vert(p3[0], p3[1], p3[2], Math.cos(a0) * k, slope * k, Math.sin(a0) * k, u0, y1 - y0);
      this.idx.push(i0, i2, i1, i0, i3, i2);
      void am;
    }
    if (cap && r1 > 0.01) {
      const save = this.style;
      if (capStyle !== null) this.style = [capStyle, save[1], save[2], save[3]];
      const ci = this.vert(x, y1, z, 0, 1, 0, x, z);
      for (let i = 0; i < n; i++) {
        const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2;
        const j0 = this.vert(x + Math.cos(a0) * r1, y1, z + Math.sin(a0) * r1, 0, 1, 0, x + Math.cos(a0) * r1, z + Math.sin(a0) * r1);
        const j1 = this.vert(x + Math.cos(a1) * r1, y1, z + Math.sin(a1) * r1, 0, 1, 0, x + Math.cos(a1) * r1, z + Math.sin(a1) * r1);
        this.idx.push(ci, j1, j0);
      }
      this.style = save;
    }
    this.gy = saveG;
  }
  /** Thin beam (box) between two 3D points with square section of half-size r. */
  beam(a, b, r) {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const L = Math.hypot(dx, dy, dz) || 1;
    const t = [dx / L, dy / L, dz / L];
    let up = Math.abs(t[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    let u = [t[1] * up[2] - t[2] * up[1], t[2] * up[0] - t[0] * up[2], t[0] * up[1] - t[1] * up[0]];
    const ul = Math.hypot(...u); u = u.map((v) => v / ul * r);
    let w = [t[1] * u[2] - t[2] * u[1], t[2] * u[0] - t[0] * u[2], t[0] * u[1] - t[1] * u[0]];
    const wl = Math.hypot(...w); w = w.map((v) => v / wl * r);
    const C = (p, su, sw) => [p[0] + u[0] * su + w[0] * sw, p[1] + u[1] * su + w[1] * sw, p[2] + u[2] * su + w[2] * sw];
    const corners = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
    for (let i = 0; i < 4; i++) {
      const [s0, w0] = corners[i], [s1, w1] = corners[(i + 1) % 4];
      const out = [u[0] * (s0 + s1) + w[0] * (w0 + w1), u[1] * (s0 + s1) + w[1] * (w0 + w1), u[2] * (s0 + s1) + w[2] * (w0 + w1)];
      this.quadOut(C(a, s0, w0), C(a, s1, w1), C(b, s1, w1), C(b, s0, w0), out, [0, 0, 1, 0, 1, L, 0, L]);
    }
  }
  get vertexCount() { return this.n; }
  build() {
    const g = new THREE.BufferGeometry();
    const n = this.n;
    g.setAttribute('position', new THREE.BufferAttribute(this.P.slice(0, n * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(this.N.slice(0, n * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.C.slice(0, n * 3), 3));
    g.setAttribute('aFac', new THREE.BufferAttribute(this.F.slice(0, n * 2), 2));
    g.setAttribute('aBld', new THREE.BufferAttribute(this.B.slice(0, n * 4), 4));
    g.setAttribute('aGround', new THREE.BufferAttribute(this.G.slice(0, n), 1));
    g.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

/** Polyline helpers (2D points [x, z]). */
export function polyLength(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return L;
}
/** Resample a 2D polyline at a fixed spacing; returns [{x, z, s, tx, tz}]. */
export function resample(pts, step) {
  const out = [];
  const L = polyLength(pts);
  const n = Math.max(1, Math.round(L / step));
  let seg = 0, segS = 0;
  for (let k = 0; k <= n; k++) {
    const s = L * k / n;
    while (seg < pts.length - 2) {
      const sl = Math.hypot(pts[seg + 1][0] - pts[seg][0], pts[seg + 1][1] - pts[seg][1]);
      if (segS + sl >= s) break;
      segS += sl; seg++;
    }
    const a = pts[seg], b = pts[seg + 1];
    const sl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const t = clamp((s - segS) / sl, 0, 1);
    out.push({ x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, s, tx: (b[0] - a[0]) / sl, tz: (b[1] - a[1]) / sl });
  }
  // smooth tangents
  for (let k = 0; k < out.length; k++) {
    const p = out[Math.max(0, k - 1)], q = out[Math.min(out.length - 1, k + 1)];
    const dx = q.x - p.x, dz = q.z - p.z, l = Math.hypot(dx, dz) || 1;
    out[k].tx = dx / l; out[k].tz = dz / l;
  }
  return out;
}
/** Smooth a polyline with rounded corners (Chaikin, n iterations). */
export function chaikin(pts, n = 3) {
  let p = pts;
  for (let it = 0; it < n; it++) {
    const q = [p[0]];
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i], b = p[i + 1];
      q.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    q.push(p[p.length - 1]);
    p = q;
  }
  return p;
}
