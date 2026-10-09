// The ground of Vice City as a height map: flat streets at GROUND, beaches
// that slope into the sea, seawalls, a deep bay and ocean, canals, and soft
// little hills in the parks and golf courses. Everything below y = 0 is under
// the sea (the water plane fills it).
//
//   const g = new Ground(plan).generate();
//   g.heightAt(x, z)  g.normalAt(x, z) -> [nx, ny, nz]  g.waterAt(x, z) -> 0 | -Infinity
//   g.h (Float32Array N*N, row-major by z then x), g.N, g.CELL, g.HALF
//   g.kind (Uint8Array N*N): 0 land, 1 beach sand, 2 wet sand / shallows, 3 seabed, 4 mangrove mud, 5 park lawn
//   g.coastD (Float32Array N*N): signed distance to the coast, inland +
//   g.weights() -> [Uint8Array RGBA N*N x 3] blend weights of LAYERS (9 layers, sum 255)
//
// Same interface as The Outbreak's Terrain where it matters (Phys, the
// terrain view and the water read heightAt / h / N / CELL / HALF).
import { SIZE, HALF, CELL, GROUND, GRIDS } from './layout.js';
import { Simplex, smooth, clamp } from '../../outbreak/noise.js';

export const LAYERS = ['lawn', 'sand', 'wetSand', 'mud', 'gravel', 'lawnDry', 'seabed', 'rock', 'dirt'];
const BEACH_W = 190;     // from the top of the beach to the waterline
const MANGROVE_W = 120;

export class Ground {
  constructor(plan) {
    this.P = plan;
    this.SIZE = SIZE; this.HALF = HALF; this.CELL = CELL; this.N = SIZE / CELL + 1;
    this.GROUND = GROUND;
    this.noise = new Simplex(1985);
  }

  generate() {
    const t0 = performance.now();
    const P = this.P, N = this.N, n2 = N * N;
    this.h = new Float32Array(n2);
    this.kind = new Uint8Array(n2);
    this.coastD = new Float32Array(n2);
    // 1. the coast distance on a coarse grid (32 studs), then interpolated
    const CC = 32, CN = SIZE / CC + 1;
    const cd = new Float32Array(CN * CN), ck = new Uint8Array(CN * CN);
    const KIND = { wall: 0, beach: 1, mangrove: 2, rocks: 3 };
    for (let j = 0; j < CN; j++) for (let i = 0; i < CN; i++) {
      const x = -HALF + i * CC, z = -HALF + j * CC;
      const c = P.coast(x, z);
      cd[j * CN + i] = Number.isFinite(c.d) ? c.d : -2000;
      ck[j * CN + i] = KIND[c.kind] ?? 0;
    }
    const coarse = (arr, x, z) => {
      const fx = clamp((x + HALF) / CC, 0, CN - 1.001), fz = clamp((z + HALF) / CC, 0, CN - 1.001);
      const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
      const a = arr[j * CN + i], b = arr[j * CN + i + 1], c = arr[(j + 1) * CN + i], d = arr[(j + 1) * CN + i + 1];
      return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
    };
    const kindNear = (x, z) => ck[Math.round(clamp((z + HALF) / CC, 0, CN - 1)) * CN + Math.round(clamp((x + HALF) / CC, 0, CN - 1))];
    // the parks and golf courses (the grids' skipped rectangles, except the airport)
    const parks = [];
    for (const G of GRIDS) for (const r of G.skip) if (r[2] - r[0] < 1200 && r[3] - r[1] < 1200) parks.push(r);
    const nz = this.noise;
    for (let j = 0; j < N; j++) {
      const z = -HALF + j * CELL;
      for (let i = 0; i < N; i++) {
        const x = -HALF + i * CELL, k = j * N + i;
        // near the coast use the exact distance, elsewhere the interpolated one
        let d = coarse(cd, x, z), kd = kindNear(x, z);
        if (Math.abs(d) < 90) { const c = P.coast(x, z); d = c.d; kd = KIND[c.kind] ?? 0; }
        this.coastD[k] = d;
        let h, kind = 0;
        if (kd === 1) {
          // beach: sand from BEACH_W inland down to the waterline, then a gentle shelf
          if (d >= BEACH_W) h = GROUND;
          else if (d >= 0) { h = GROUND * smooth(0, BEACH_W, d) * 0.92 + 0.25 * (d / BEACH_W); kind = d < 22 ? 2 : 1; }
          else { h = -Math.min(14, -d * 0.045) - Math.max(0, -d - 300) * 0.05; kind = -d < 60 ? 2 : 3; }
        } else if (kd === 2) {
          // mangroves: mud flats and shallow water
          if (d >= MANGROVE_W) h = GROUND;
          else if (d >= 0) { h = GROUND * smooth(0, MANGROVE_W, d) * 0.85 + 0.2; kind = 4; }
          else { h = -Math.min(5, 0.6 - d * 0.02); kind = 4; }
        } else if (kd === 3) {
          // riprap: a steep rocky bank
          if (d >= 14) h = GROUND; else if (d >= 0) { h = GROUND * (d / 14) - 0.5; kind = 7; } else { h = -4 - Math.min(18, -d * 0.2); kind = 3; }
        } else {
          // seawall: straight down into deep water
          if (d >= 0) h = GROUND; else { h = -7 - Math.min(20, -d * 0.12); kind = 3; }
        }
        // deep water far out
        if (d < -400) h = Math.min(h, -16 - Math.min(26, (-d - 400) * 0.03));
        // undulating seabed
        if (h < 0) h += nz.noise(x / 160, z / 160) * 1.2;
        this.h[k] = h;
        this.kind[k] = kind;
      }
    }
    // 2. canals: carved below sea level with walls
    for (const c of P.canals) {
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      for (const [x, z] of c.pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
      const pad = c.w;
      const i0 = Math.max(0, Math.floor((x0 - pad + HALF) / CELL)), i1 = Math.min(N - 1, Math.ceil((x1 + pad + HALF) / CELL));
      const j0 = Math.max(0, Math.floor((z0 - pad + HALF) / CELL)), j1 = Math.min(N - 1, Math.ceil((z1 + pad + HALF) / CELL));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x = -HALF + i * CELL, z = -HALF + j * CELL, k = j * N + i;
        if (P.canalAt(x, z, 0)) { this.h[k] = Math.min(this.h[k], -7 + nz.noise(x / 60, z / 60)); this.kind[k] = 3; }
      }
    }
    // 3. parks: soft hills (never under a road; the hills fade out 30 studs from the edge)
    for (const r of parks) {
      const i0 = Math.max(0, Math.floor((r[0] + HALF) / CELL)), i1 = Math.min(N - 1, Math.ceil((r[2] + HALF) / CELL));
      const j0 = Math.max(0, Math.floor((r[1] + HALF) / CELL)), j1 = Math.min(N - 1, Math.ceil((r[3] + HALF) / CELL));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x = -HALF + i * CELL, z = -HALF + j * CELL, k = j * N + i;
        if (this.h[k] < GROUND - 0.01 || this.kind[k] !== 0) continue;
        const edge = Math.min(x - r[0], r[2] - x, z - r[1], r[3] - z);
        if (edge < 30) continue;
        const f = smooth(30, 90, edge);
        this.h[k] = GROUND + f * (1.6 + 1.4 * nz.fbm(x / 140, z / 140, 3));
        this.kind[k] = 5;
      }
    }
    this.genMs = Math.round(performance.now() - t0);
    return this;
  }

  _i(x, z) { return [clamp((x + HALF) / CELL, 0, this.N - 1.0001), clamp((z + HALF) / CELL, 0, this.N - 1.0001)]; }
  sample(arr, x, z) {
    const [fx, fz] = this._i(x, z), N = this.N;
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, k = j * N + i;
    return (arr[k] * (1 - u) + arr[k + 1] * u) * (1 - v) + (arr[k + N] * (1 - u) + arr[k + N + 1] * u) * v;
  }
  heightAt(x, z) {
    if (x < -HALF || x > HALF || z < -HALF || z > HALF) return -40;
    return this.sample(this.h, x, z);
  }
  normalAt(x, z) {
    const e = CELL;
    const hx = this.heightAt(x + e, z) - this.heightAt(x - e, z), hz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    const nx = -hx, ny = 2 * e, nzz = -hz, l = Math.hypot(nx, ny, nzz);
    return [nx / l, ny / l, nzz / l];
  }
  /** The water surface over (x, z): 0 where the ground is under the sea, otherwise -Infinity. */
  waterAt(x, z) { return this.heightAt(x, z) < -0.05 ? 0 : -Infinity; }
  kindAt(x, z) { const [fx, fz] = this._i(x, z); return this.kind[Math.round(fz) * this.N + Math.round(fx)]; }
  coastAt(x, z) { return this.sample(this.coastD, x, z); }
  inside(x, z, m = 0) { return x > -HALF + m && x < HALF - m && z > -HALF + m && z < HALF - m; }

  /** Blend weights of LAYERS: three RGBA byte arrays (layers 0-3, 4-7, 8). */
  weights() {
    const N = this.N, n2 = N * N;
    const w = [new Uint8Array(n2 * 4), new Uint8Array(n2 * 4), new Uint8Array(n2 * 4)];
    const nz = this.noise;
    const L = new Float32Array(9);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const k = j * N + i, x = -HALF + i * CELL, z = -HALF + j * CELL;
      L.fill(0);
      const kind = this.kind[k], h = this.h[k];
      switch (kind) {
        case 1: L[1] = 1; L[2] = smooth(40, 0, this.coastD[k]) * 0.8; break;
        case 2: L[2] = 1; L[1] = 0.3; break;
        case 3: L[6] = 1; L[2] = h > -3 ? 0.5 : 0; break;
        case 4: L[3] = 1; L[0] = 0.25; break;
        case 5: L[0] = 1; L[5] = Math.max(0, nz.noise(x / 90, z / 90)) * 0.6; break;
        case 7: L[7] = 1; break;
        default: {
          L[0] = 1;
          const dry = nz.fbm(x / 260, z / 260, 3);
          L[5] = Math.max(0, dry) * 0.9;
          // the airfield's big lawns: drier, patchier grass
          if (x < -2400 && z < -760) L[5] = 0.3 + Math.max(0, dry + 0.2) * 1.3;
          L[8] = Math.max(0, nz.noise(x / 55 + 9, z / 55) - 0.35) * 0.9;
        }
      }
      let s = 0; for (let q = 0; q < 9; q++) s += L[q];
      let acc = 0;
      for (let q = 0; q < 9; q++) {
        const v = q === 8 ? 255 - acc : Math.round((L[q] / s) * 255);
        const vv = Math.max(0, Math.min(255, v));
        if (q < 8) acc += vv;
        w[q >> 2][k * 4 + (q & 3)] = vv;
      }
    }
    return w;
  }
}
