// The land: a height map 6144 studs across (a sample every 8 studs), grown
// from the plan in layout.js - hills, northern and western mountains, the
// coast and beaches, a river valley, a lake, flattened ground for the towns,
// roads draped over it all - plus the masks the rest of the world is drawn
// from (where the forests, fields, beaches and rocks are).
//
// No three.js in here: it's plain arrays, so it can be tested on its own.
import { Simplex, clamp, lerp, smooth, hash2 } from '../noise.js';
import { SIZE, HALF, PLACES, POIS, RIVER, LAKE, ROADS, ROAD_STYLE } from './layout.js';

export const CELL = 8;
export const N = SIZE / CELL + 1; // 769 samples per side
const FN = SIZE / 4 + 1; // the fine grid (every 4 studs) for grass and footprints

/** Catmull-Rom curve through the points, sampled about every `step` studs: [{x, z, d}] (d = distance along). */
export function spline(pts, step = 6) {
  const out = [];
  const P = (i) => pts[Math.max(0, Math.min(pts.length - 1, i))];
  let d = 0, px = null, pz = null;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const n = Math.max(1, Math.ceil(len / step));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const x = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
      const z = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
      if (px != null) d += Math.hypot(x - px, z - pz);
      out.push({ x, z, d });
      px = x; pz = z;
    }
  }
  const last = pts[pts.length - 1];
  if (px != null) d += Math.hypot(last[0] - px, last[1] - pz);
  out.push({ x: last[0], z: last[1], d });
  return out;
}

/** Visit every grid sample within r of segment a-b: fn(index, dist, t along). */
function aroundSegment(ax, az, bx, bz, r, n, cell, fn) {
  const x0 = Math.max(0, Math.floor((Math.min(ax, bx) - r + HALF) / cell)), x1 = Math.min(n - 1, Math.ceil((Math.max(ax, bx) + r + HALF) / cell));
  const z0 = Math.max(0, Math.floor((Math.min(az, bz) - r + HALF) / cell)), z1 = Math.min(n - 1, Math.ceil((Math.max(az, bz) + r + HALF) / cell));
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
  for (let j = z0; j <= z1; j++) {
    const pz = j * cell - HALF;
    for (let i = x0; i <= x1; i++) {
      const px = i * cell - HALF;
      let t = ((px - ax) * dx + (pz - az) * dz) / L2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = ax + dx * t - px, qz = az + dz * t - pz;
      const d = Math.sqrt(qx * qx + qz * qz);
      if (d <= r) fn(j * n + i, d, t);
    }
  }
}

export class Terrain {
  constructor(seed = 47) {
    this.seed = seed;
    this.n = N; this.cell = CELL; this.size = SIZE; this.half = HALF;
    this.h = new Float32Array(N * N);
    this.forest = new Float32Array(N * N);
    this.field = new Float32Array(N * N);
    this.town = new Float32Array(N * N);
    this.roadW = new Float32Array(N * N); // how much of a road (or its shoulder) is here
    this.pavedW = new Float32Array(N * N); // the same for asphalt roads only
    this.water = new Float32Array(N * N).fill(-1e9); // water surface height (-1e9 = none)
    this.riverD = new Float32Array(N * N).fill(1e9);
    this.coast = new Float32Array(N * N); // distance inland from the sea
    this.slope = new Float32Array(N * N); // radians
    this.fine = new Uint8Array(FN * FN).fill(255); // where grass may grow (every 4 studs)
    this.roads = [];
    this.bridges = [];
    this.fields = [];
    this.noise = new Simplex(seed);
    this.noise2 = new Simplex(seed + 101);
  }

  // --- sampling ---------------------------------------------------------------------------------------------------------
  idx(i, j) { return j * N + i; }
  /** Height of the ground at (x, z) (bilinear). */
  heightAt(x, z) {
    const fx = (x + HALF) / CELL, fz = (z + HALF) / CELL;
    let i = Math.floor(fx), j = Math.floor(fz);
    if (i < 0) i = 0; else if (i > N - 2) i = N - 2;
    if (j < 0) j = 0; else if (j > N - 2) j = N - 2;
    const tx = Math.min(1, Math.max(0, fx - i)), tz = Math.min(1, Math.max(0, fz - j));
    const h = this.h, k = j * N + i;
    const a = h[k] + (h[k + 1] - h[k]) * tx, b = h[k + N] + (h[k + N + 1] - h[k + N]) * tx;
    return a + (b - a) * tz;
  }
  /** Bilinear lookup in one of the masks. */
  sample(arr, x, z) {
    const fx = (x + HALF) / CELL, fz = (z + HALF) / CELL;
    let i = Math.floor(fx), j = Math.floor(fz);
    if (i < 0) i = 0; else if (i > N - 2) i = N - 2;
    if (j < 0) j = 0; else if (j > N - 2) j = N - 2;
    const tx = Math.min(1, Math.max(0, fx - i)), tz = Math.min(1, Math.max(0, fz - j)), k = j * N + i;
    const a = arr[k] + (arr[k + 1] - arr[k]) * tx, b = arr[k + N] + (arr[k + N + 1] - arr[k + N]) * tx;
    return a + (b - a) * tz;
  }
  /** Ground normal (x, y, z) at a point. */
  normalAt(x, z, out = [0, 1, 0]) {
    const e = 3;
    const dx = this.heightAt(x + e, z) - this.heightAt(x - e, z), dz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    const l = Math.hypot(dx, 2 * e, dz);
    out[0] = -dx / l; out[1] = 2 * e / l; out[2] = -dz / l;
    return out;
  }
  slopeAt(x, z) { const n = this.normalAt(x, z); return Math.acos(Math.min(1, n[1])); }
  /** Water surface height at a point (sea, river or lake), or -Infinity if dry. */
  waterAt(x, z) {
    const fx = Math.round((x + HALF) / CELL), fz = Math.round((z + HALF) / CELL);
    if (fx < 0 || fz < 0 || fx >= N || fz >= N) return 0;
    const w = this.water[fz * N + fx];
    if (w < -1e8) return -Infinity;
    return w;
  }
  inside(x, z, margin = 0) { return Math.abs(x) < HALF - margin && Math.abs(z) < HALF - margin; }

  // --- generation ---------------------------------------------------------------------------------------------------------
  /** Distance inland from the sea (negative out at sea). */
  coastDist(x, z) {
    const n = this.noise;
    let zc = 2330 + 150 * Math.sin(x / 820 + 0.4) + 80 * Math.sin(x / 310 + 2.1) + 40 * n.noise(x / 260, 7.3);
    zc -= 330 * Math.exp(-(((x - 1620) / 300) ** 2)); // the bay at Morovsk
    zc += 520 * Math.exp(-(((x + 2640) / 230) ** 2)); // Cape Volk
    zc -= 80 * Math.exp(-(((x + 40) / 140) ** 2)); // the river mouth
    const dS = zc - z;
    const xc = 3020 - 420 * smooth(600, 2500, z) + 70 * Math.sin(z / 380) + 30 * n.noise(9.1, z / 200);
    const dE = xc - x;
    return Math.min(dS, dE);
  }

  /** o.streets(T): extra roads (the towns' streets) to lay with the others. */
  generate(o = {}) {
    const t0 = Date.now();
    this._base();
    this._river();
    this._lake();
    this._places();
    this.extraRoads = o.streets ? o.streets(this) : [];
    this._roads();
    this._masks();
    this.genMs = Date.now() - t0;
    return this;
  }

  _base() {
    const n = this.noise, n2 = this.noise2, h = this.h;
    for (let j = 0; j < N; j++) {
      const z = j * CELL - HALF;
      for (let i = 0; i < N; i++) {
        const x = i * CELL - HALF;
        // warp the coordinates a little so nothing lines up
        const wx = x + 180 * n2.noise(x / 1300, z / 1300), wz = z + 180 * n2.noise(x / 1300 + 31, z / 1300 + 17);
        const base = 62 + 48 * n.fbm(wx / 1500, wz / 1500, 3) + 22 * n.fbm(wx / 520, wz / 520, 4);
        const hills = 85 * Math.max(0, n.fbm(wx / 760 + 13, wz / 760 + 5, 3) + 0.08);
        // the mountains along the north and the west
        const mN = smooth(-1300, -2950, z), mW = smooth(-1500, -3000, x), mE = smooth(1700, 3000, x) * smooth(500, -2500, z);
        const m = Math.max(mN, mW * 0.85, mE * 0.7);
        // ridges, but worn down: fewer fine octaves, and a broad swell under them so the peaks aren't spikes
        const mountains = m > 0.001 ? m * (250 * Math.pow(n.ridged(wx / 1100, wz / 1100, 4, 2.0, 0.42), 1.6) + 120 * (0.5 + 0.5 * n.fbm(wx / 1400 + 7, wz / 1400 - 3, 3)) + 60) : 0;
        let land = base + hills + mountains;
        // a few named hills
        for (const p of HILLS) { const d2 = ((x - p.x) ** 2 + (z - p.z) ** 2) / (p.r * p.r); if (d2 < 4) land += p.h * Math.exp(-d2 * 1.6); }
        // the coast: beaches, low ground near the sea, the sea floor
        const d = this.coastDist(wx * 0.15 + x * 0.85, wz * 0.15 + z * 0.85);
        this.coast[j * N + i] = d;
        let v;
        if (d > 0) {
          const beach = 2.5 + d * 0.035 + 1.5 * n.noise(x / 90, z / 90);
          const k = smooth(30, 520, d);
          v = lerp(beach, land, k);
          // cliffs at the cape and the west coast: the land stays high right to the water
          if (x < -1700 && d < 160) {
            const cliff = smooth(-1700, -2600, x) * (0.55 + 0.45 * n.noise(x / 300, z / 300));
            if (cliff > 0.05) v = lerp(v, lerp(1.5, Math.min(land * 0.75, 30 + 14 * n.noise(x / 200, 3.3)), smooth(4, 60, d)), clamp(cliff));
          }
        } else {
          v = -3 - Math.min(70, -d * 0.09) + 2 * n.noise(x / 120, z / 120);
        }
        h[j * N + i] = v;
      }
    }
    // the sea
    for (let k = 0; k < N * N; k++) if (h[k] < 0.4) { this.water[k] = 0; }
  }

  _river() {
    const R = RIVER, h = this.h, pts = spline(R.pts, 8);
    // the water level falls steadily from the hills to the sea
    const lv = pts.map((p) => this.heightAt(p.x, p.z) - 5);
    for (let k = 1; k < lv.length; k++) lv[k] = Math.min(lv[k], lv[k - 1] - 0.02);
    for (let pass = 0; pass < 6; pass++) for (let k = 1; k < lv.length - 1; k++) lv[k] = Math.min(lv[k - 1] - 0.01, (lv[k - 1] + lv[k] + lv[k + 1]) / 3);
    for (let k = 0; k < lv.length; k++) lv[k] = Math.max(0, lv[k]);
    this.river = pts.map((p, k) => ({ x: p.x, z: p.z, d: p.d, level: lv[k] }));
    const w = R.w, valley = 260;
    const best = new Float32Array(N * N).fill(1e9), lvAt = new Float32Array(N * N);
    for (let k = 0; k < pts.length - 1; k++) {
      const a = pts[k], b = pts[k + 1];
      aroundSegment(a.x, a.z, b.x, b.z, valley, N, CELL, (idx, d, t) => { if (d < best[idx]) { best[idx] = d; lvAt[idx] = lerp(lv[k], lv[k + 1], t); } });
    }
    for (let idx = 0; idx < N * N; idx++) {
      const d = best[idx];
      if (d > valley) continue;
      const L = lvAt[idx];
      // wiggle the banks
      const i = idx % N, j = (idx / N) | 0;
      const dd = d + 5 * this.noise2.noise(i / 7, j / 7);
      const bed = L - 4.5 * (1 - smooth(0, w * 0.5, dd));
      const bank = L + 1.2 + smooth(w * 0.5, w * 1.6, dd) * 6;
      let v = h[idx];
      if (dd < w * 0.5) v = Math.min(v, bed);
      else v = Math.min(v, lerp(bank, v, smooth(w * 0.8, valley, dd)));
      // the wider valley sinks gently towards the river
      v = lerp(v, Math.min(v, L + 8), (1 - smooth(w, valley, dd)) * 0.5);
      h[idx] = v;
      this.riverD[idx] = d;
      if (dd < w * 0.55 + 2) this.water[idx] = Math.max(this.water[idx], L);
    }
  }

  _lake() {
    const L = LAKE, h = this.h;
    L.level = this.heightAt(L.x, L.z) - 6;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = i * CELL - HALF, z = j * CELL - HALF;
      const r = Math.hypot((x - L.x) / L.rx, (z - L.z) / L.rz) + 0.08 * this.noise.noise(x / 160, z / 160);
      if (r > 2.2) continue;
      const idx = j * N + i;
      const bed = L.level - 12 * (1 - r * r);
      if (r < 1) { h[idx] = Math.min(h[idx], bed); this.water[idx] = Math.max(this.water[idx], L.level); }
      else h[idx] = lerp(Math.min(h[idx], L.level + 1 + (r - 1) * 14), h[idx], smooth(1, 2.2, r));
    }
  }

  _places() {
    const h = this.h;
    this.placeLevel = {};
    for (const p of [...PLACES, ...POIS.filter((q) => q.kind !== 'castle' && q.kind !== 'radio' && q.kind !== 'lighthouse')]) {
      const r = p.r || 90;
      // the level: the average ground over the middle of the place
      let s = 0, c = 0;
      for (let a = 0; a < 16; a++) for (const f of [0, 0.35, 0.7]) { s += this.heightAt(p.x + Math.cos(a) * r * f, p.z + Math.sin(a) * r * f); c++; }
      let lvl = Math.max(4, s / c);
      p.level = lvl;
      this.placeLevel[p.id] = lvl;
      const flat = p.kind === 'airfield' || p.kind === 'military' ? 0.92 : p.kind === 'city' ? 0.85 : 0.7;
      const R = r * 1.35;
      for (let j = 0; j < N; j++) {
        const z = j * CELL - HALF; if (Math.abs(z - p.z) > R) continue;
        for (let i = 0; i < N; i++) {
          const x = i * CELL - HALF; if (Math.abs(x - p.x) > R) continue;
          const d = Math.hypot(x - p.x, z - p.z);
          if (d > R) continue;
          const idx = j * N + i;
          if (this.water[idx] > -1e8 && h[idx] < 0.5) continue;
          // (near the sea the land keeps its own slope down to the beach - no cliffs round coastal towns)
          const k = flat * (1 - smooth(r * 0.8, R, d)) * smooth(15, 150, this.coast[idx]);
          h[idx] = lerp(h[idx], Math.max(lvl, h[idx] < 1 ? h[idx] : lvl), k);
          this.town[idx] = Math.max(this.town[idx], 1 - smooth(r * 0.7, R, d));
        }
      }
    }
    // the runway: dead flat
    const A = PLACES.find((p) => p.id === 'dolina');
    this.flattenRect(A.x, A.z - 10, 640, 90, 0, A.level, 60);
  }

  /** Flatten a (rotated) rectangle to height y, blending over `blend` studs. */
  flattenRect(cx, cz, hx, hz, yaw, y, blend = 12, strength = 1) {
    const c = Math.cos(yaw), s = Math.sin(yaw), R = Math.hypot(hx, hz) + blend;
    const i0 = Math.max(0, Math.floor((cx - R + HALF) / CELL)), i1 = Math.min(N - 1, Math.ceil((cx + R + HALF) / CELL));
    const j0 = Math.max(0, Math.floor((cz - R + HALF) / CELL)), j1 = Math.min(N - 1, Math.ceil((cz + R + HALF) / CELL));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = i * CELL - HALF - cx, z = j * CELL - HALF - cz;
      const lx = x * c - z * s, lz = x * s + z * c;
      const ox = Math.max(0, Math.abs(lx) - hx), oz = Math.max(0, Math.abs(lz) - hz);
      const d = Math.hypot(ox, oz);
      if (d > blend) continue;
      const idx = j * N + i;
      this.h[idx] = lerp(this.h[idx], y, strength * (1 - smooth(0, blend, d)));
    }
  }

  _roads() {
    const h = this.h;
    const target = new Float32Array(N * N), weight = new Float32Array(N * N);
    for (const def of [...ROADS, ...this.extraRoads]) {
      const st = ROAD_STYLE[def.type];
      const pts = spline(def.pts, 6);
      if (pts.length < 2) continue;
      // the road's own height: the land smoothed out, not too steep
      let y = pts.map((p) => Math.max(this.heightAt(p.x, p.z), 1.2));
      const win = def.type === 'highway' ? 9 : 6;
      for (let pass = 0; pass < 4; pass++) {
        const y2 = y.slice();
        for (let k = 0; k < y.length; k++) { let s = 0, c = 0; for (let q = -win; q <= win; q++) { const v = y[Math.max(0, Math.min(y.length - 1, k + q))]; s += v; c++; } y2[k] = s / c; }
        y = y2;
      }
      const grade = def.type === 'highway' ? 0.07 : 0.1;
      for (let k = 1; k < y.length; k++) { const ds = pts[k].d - pts[k - 1].d; y[k] = clamp(y[k], y[k - 1] - grade * ds, y[k - 1] + grade * ds); }
      for (let k = y.length - 2; k >= 0; k--) { const ds = pts[k + 1].d - pts[k].d; y[k] = clamp(y[k], y[k + 1] - grade * ds, y[k + 1] + grade * ds); }
      // over the river: a bridge (the road stays up, the river isn't filled in)
      const bridge = new Uint8Array(pts.length);
      for (let k = 0; k < pts.length; k++) {
        const rd = this.sample(this.riverD, pts[k].x, pts[k].z);
        if (rd < RIVER.w * 0.5 + 14 && (def.type === 'highway' || def.type === 'road')) bridge[k] = 1;
      }
      if (bridge.some((b) => b)) {
        let k0 = bridge.indexOf(1), k1 = bridge.lastIndexOf(1);
        k0 = Math.max(0, k0 - 2); k1 = Math.min(pts.length - 1, k1 + 2);
        const deck = Math.max(y[k0], y[k1], this.sample(this.water, pts[(k0 + k1) >> 1].x, pts[(k0 + k1) >> 1].z) + 10);
        for (let k = k0; k <= k1; k++) { y[k] = deck; bridge[k] = 1; }
        // ramps up to it
        for (let k = k0 - 1; k >= 0; k--) { const ds = pts[k + 1].d - pts[k].d; if (y[k] >= y[k + 1] - grade * ds) break; y[k] = y[k + 1] - grade * ds; }
        for (let k = k1 + 1; k < y.length; k++) { const ds = pts[k].d - pts[k - 1].d; if (y[k] >= y[k - 1] - grade * ds) break; y[k] = y[k - 1] - grade * ds; }
        this.bridges.push({ pts: pts.slice(k0, k1 + 1), y: y.slice(k0, k1 + 1), w: st.w });
      }
      const road = { type: def.type, w: st.w, style: st, place: def.place, pts: pts.map((p, k) => ({ x: p.x, z: p.z, d: p.d, y: y[k], bridge: bridge[k] })) };
      this.roads.push(road);
      const reach = st.w / 2 + st.shoulder + 26;
      for (let k = 0; k < pts.length - 1; k++) {
        if (bridge[k] && bridge[k + 1]) continue;
        const a = pts[k], b = pts[k + 1];
        aroundSegment(a.x, a.z, b.x, b.z, reach, N, CELL, (idx, d, t) => {
          const w = 1 - smooth(st.w / 2 + 1, reach, d);
          if (w > weight[idx]) { weight[idx] = w; target[idx] = lerp(y[k], y[k + 1], t) - 0.15; }
          const rw = 1 - smooth(st.w / 2 - 2, st.w / 2 + st.shoulder, d);
          if (rw > this.roadW[idx]) this.roadW[idx] = rw;
          if (st.tex === 'asphalt') { const pw = 1 - smooth(st.w / 2 - 1, st.w / 2 + 1, d); if (pw > this.pavedW[idx]) this.pavedW[idx] = pw; }
        });
      }
    }
    for (let idx = 0; idx < N * N; idx++) if (weight[idx] > 0) h[idx] = lerp(h[idx], target[idx], weight[idx]);
    // keep the fine grass map off the road surfaces
    for (const r of this.roads) for (let k = 0; k < r.pts.length - 1; k++) {
      const a = r.pts[k], b = r.pts[k + 1];
      aroundSegment(a.x, a.z, b.x, b.z, r.w / 2 + 1.5, FN, 4, (idx) => { this.fine[idx] = 0; });
    }
  }

  /** Forests, fields, rocks: what grows where. */
  _masks() {
    const n = this.noise, n2 = this.noise2, h = this.h;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const i0 = Math.max(0, i - 1), i1 = Math.min(N - 1, i + 1), j0 = Math.max(0, j - 1), j1 = Math.min(N - 1, j + 1);
      const dx = (h[j * N + i1] - h[j * N + i0]) / ((i1 - i0) * CELL), dz = (h[j1 * N + i] - h[j0 * N + i]) / ((j1 - j0) * CELL);
      this.slope[j * N + i] = Math.atan(Math.hypot(dx, dz));
    }
    // fields round the villages and farms: strips of ploughed land and pasture
    const farmCentres = [...PLACES.filter((p) => p.kind === 'village'), ...POIS.filter((p) => p.kind === 'farm')];
    for (const c of farmCentres) {
      const count = c.kind === 'farm' ? 4 : 3;
      for (let f = 0; f < count; f++) {
        const a = hash2(f, c.x | 0, 3) * Math.PI * 2, dist = (c.r || 60) + 90 + hash2(f, c.z | 0, 4) * 160;
        const fx = c.x + Math.cos(a) * dist, fz = c.z + Math.sin(a) * dist;
        const yaw = hash2(f, 7, c.x | 0) * Math.PI, hx = 70 + hash2(f, 8, 1) * 90, hz = 50 + hash2(f, 9, 2) * 70;
        const kind = hash2(f, 11, c.z | 0) < 0.55 ? 'plough' : hash2(f, 12, 3) < 0.5 ? 'wheat' : 'pasture';
        if (this.sample(this.coast, fx, fz) < 120 || this.sample(this.riverD, fx, fz) < 60) continue;
        this.fields.push({ x: fx, z: fz, hx, hz, yaw, kind });
        const cs = Math.cos(yaw), sn = Math.sin(yaw), R = Math.hypot(hx, hz) + 16;
        for (let j = Math.max(0, Math.floor((fz - R + HALF) / CELL)); j <= Math.min(N - 1, Math.ceil((fz + R + HALF) / CELL)); j++) {
          for (let i = Math.max(0, Math.floor((fx - R + HALF) / CELL)); i <= Math.min(N - 1, Math.ceil((fx + R + HALF) / CELL)); i++) {
            const x = i * CELL - HALF - fx, z = j * CELL - HALF - fz;
            const lx = x * cs - z * sn, lz = x * sn + z * cs;
            const o = Math.max(Math.abs(lx) - hx, Math.abs(lz) - hz);
            if (o > 12) continue;
            const idx = j * N + i;
            const v = 1 - smooth(-6, 12, o);
            this.field[idx] = Math.max(this.field[idx], kind === 'plough' ? v : kind === 'wheat' ? v * 0.66 : v * 0.33);
          }
        }
      }
    }
    for (let j = 0; j < N; j++) {
      const z = j * CELL - HALF;
      for (let i = 0; i < N; i++) {
        const x = i * CELL - HALF, idx = j * N + i;
        let f = smooth(-0.12, 0.32, n.fbm(x / 1000 + 50, z / 1000 - 20, 3) + 0.3 * n2.fbm(x / 260, z / 260, 2));
        // more forest in the hills, none on the beaches, in towns, on roads or in the water
        f *= smooth(-40, 160, this.coast[idx]);
        f = Math.max(f, smooth(-1200, -2600, z) * 0.6 * smooth(-0.3, 0.2, n2.noise(x / 400, z / 400)));
        f *= 1 - this.town[idx] * 0.97;
        f *= 1 - smooth(0.05, 0.6, this.roadW[idx]);
        f *= 1 - this.field[idx];
        if (this.water[idx] > -1e8) f = 0;
        f *= smooth(RIVER.w * 0.6, RIVER.w * 1.5, this.riverD[idx]);
        if (this.h[idx] > 470) f *= 1 - smooth(470, 560, this.h[idx]);
        this.forest[idx] = clamp(f);
      }
    }
    // keep the trees off the airfield and the military base (they get their own)
    for (const p of PLACES) if (p.kind === 'airfield' || p.kind === 'military') {
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const x = i * CELL - HALF, z = j * CELL - HALF, d = Math.hypot(x - p.x, z - p.z);
        if (d < p.r * 1.3) this.forest[j * N + i] *= smooth(p.r * 0.9, p.r * 1.3, d);
      }
    }
    // grass: not in the water, not on rock or sand
    const g = new Float32Array(N * N);
    for (let idx = 0; idx < N * N; idx++) {
      const hh = this.h[idx];
      if (this.water[idx] > hh - 0.6) { g[idx] = -1; continue; }
      g[idx] = smooth(30, 110, this.coast[idx]) * (1 - smooth(0.62, 0.8, this.slope[idx])) * (1 - smooth(500, 600, hh));
    }
    for (let j = 0; j < FN; j++) {
      const cj = Math.min(N - 2, j >> 1), tz = (j & 1) * 0.5;
      for (let i = 0; i < FN; i++) {
        const k = j * FN + i;
        if (this.fine[k] === 0) continue;
        const ci = Math.min(N - 2, i >> 1), tx = (i & 1) * 0.5, c = cj * N + ci;
        const a = g[c] + (g[c + 1] - g[c]) * tx, b = g[c + N] + (g[c + N + 1] - g[c + N]) * tx;
        const v = a + (b - a) * tz;
        this.fine[k] = v <= 0 ? 0 : Math.round(255 * clamp(v));
      }
    }
  }

  /** Work the slopes out again (after building pads have been levelled). */
  updateSlope() {
    const h = this.h;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const i0 = Math.max(0, i - 1), i1 = Math.min(N - 1, i + 1), j0 = Math.max(0, j - 1), j1 = Math.min(N - 1, j + 1);
      const dx = (h[j * N + i1] - h[j * N + i0]) / ((i1 - i0) * CELL), dz = (h[j1 * N + i] - h[j0 * N + i]) / ((j1 - j0) * CELL);
      this.slope[j * N + i] = Math.atan(Math.hypot(dx, dz));
    }
  }

  /** Mark a building footprint so no grass grows through the floor (rotated rectangle, studs). */
  clearGrass(cx, cz, hx, hz, yaw, pad = 1) {
    const c = Math.cos(yaw), s = Math.sin(yaw), R = Math.hypot(hx, hz) + pad;
    for (let j = Math.max(0, Math.floor((cz - R + HALF) / 4)); j <= Math.min(FN - 1, Math.ceil((cz + R + HALF) / 4)); j++) {
      for (let i = Math.max(0, Math.floor((cx - R + HALF) / 4)); i <= Math.min(FN - 1, Math.ceil((cx + R + HALF) / 4)); i++) {
        const x = i * 4 - HALF - cx, z = j * 4 - HALF - cz;
        const lx = x * c - z * s, lz = x * s + z * c;
        if (Math.abs(lx) <= hx + pad && Math.abs(lz) <= hz + pad) this.fine[j * FN + i] = 0;
      }
    }
  }
  grassAt(x, z) {
    const i = Math.round((x + HALF) / 4), j = Math.round((z + HALF) / 4);
    if (i < 0 || j < 0 || i >= FN || j >= FN) return 0;
    return this.fine[j * FN + i] / 255;
  }
  get fineN() { return FN; }

  /**
   * The ground's look, per sample: weights of the nine ground textures
   * (grass, meadow, forest floor, dirt, rock, moss, sand, gravel, field).
   */
  weights() {
    const out = [new Uint8Array(N * N * 4), new Uint8Array(N * N * 4), new Uint8Array(N * N * 4)];
    const n = this.noise;
    const w = new Float32Array(9);
    for (let j = 0; j < N; j++) {
      const z = j * CELL - HALF;
      for (let i = 0; i < N; i++) {
        const x = i * CELL - HALF, idx = j * N + i, hh = this.h[idx];
        const slope = this.slope[idx];
        const v1 = n.noise(x / 180, z / 180), v2 = n.noise(x / 60 + 9, z / 60 - 4);
        w.fill(0);
        // grass and meadow, patchy
        const meadow = smooth(-0.3, 0.5, v1 + 0.3 * v2);
        w[0] = 1 - meadow; w[1] = meadow;
        // forest floor under the trees
        const fo = smooth(0.35, 0.75, this.forest[idx]);
        for (const k of [0, 1]) w[k] *= 1 - fo;
        w[2] = fo;
        // ploughed fields, wheat, pasture
        const fi = this.field[idx];
        if (fi > 0.7) { w.fill(0); w[8] = 1; }
        else if (fi > 0.4) { w[1] += fi; w[3] += fi * 0.4; }
        // towns: trodden, dusty
        const tw = this.town[idx];
        w[3] += tw * 0.25 * smooth(-0.2, 0.6, v2);
        // road shoulders: gravel and dirt
        const rw = this.roadW[idx];
        if (rw > 0) { const k = smooth(0, 0.9, rw); for (let q = 0; q < 9; q++) w[q] *= 1 - k; w[7] += k * 0.6; w[3] += k * 0.4; }
        // beaches and river banks: sand
        const coast = this.coast[idx];
        const sand = 1 - smooth(25, 75 + 20 * v2, coast);
        const bank = (1 - smooth(RIVER.w * 0.5, RIVER.w * 1.2, this.riverD[idx])) * 0.8;
        const lakeR = Math.hypot((x - LAKE.x) / LAKE.rx, (z - LAKE.z) / LAKE.rz);
        const lakeSand = 1 - smooth(1.0, 1.25, lakeR);
        const sd = Math.max(sand, bank, lakeSand);
        if (sd > 0) { for (let q = 0; q < 9; q++) w[q] *= 1 - sd; w[6] += sd * (bank > sand ? 0.4 : 1); w[7] += sd * (bank > sand ? 0.6 : 0); }
        // rock on the steep slopes, moss on the high hills
        const rock = smooth(0.55, 0.85, slope + 0.08 * v2);
        const moss = smooth(330, 460, hh + 40 * v1) * (1 - rock) * 0.75;
        if (rock + moss > 0) { for (let q = 0; q < 9; q++) w[q] *= 1 - Math.min(1, rock + moss); w[4] += rock; w[5] += moss; }
        // under water: mud and sand
        if (hh < (this.water[idx] > -1e8 ? this.water[idx] : -1e9)) { w.fill(0); w[6] = 0.5; w[3] = 0.5; }
        let s = 0; for (let q = 0; q < 9; q++) s += w[q];
        s = s > 0 ? 255 / s : 0;
        for (let q = 0; q < 9; q++) out[q >> 2][idx * 4 + (q & 3)] = Math.round(w[q] * s);
      }
    }
    return out;
  }
}

/** Named hills: the castle hill, the radio mountain, the lighthouse headland. */
const HILLS = [
  { x: -470, z: -1270, r: 230, h: 120 },
  { x: 2380, z: -2460, r: 300, h: 160 },
  { x: -2640, z: 2600, r: 180, h: 40 },
  { x: 1000, z: 1100, r: 300, h: 50 },
  { x: -1400, z: 600, r: 260, h: 60 },
];
