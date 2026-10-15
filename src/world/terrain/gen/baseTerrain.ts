// Natural terrain: island mask + coastal profile, domain-warped relief, ridges, hills, cliffs, quarry pit.
import type { WorldLayout } from '../../layout/types';
import { Noise2D } from '../noise';
import { signedDistance } from '../edt';
import { CELL, N } from '../TerrainData';
import { rasterizePolygons, hyp } from './raster';

export const sstep = (a: number, b: number, v: number): number => {
  let t = (v - a) / (b - a);
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return t * t * (3 - 2 * t);
};
export const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Height profile across the coast as a function of the signed coast distance d (m, + inland). */
export function coastProfile(d: number): number {
  if (d < 0) {
    const s = -d;
    if (s < 60) return -0.045 * s;
    return -2.7 - 26 * (1 - Math.exp(-(s - 60) / 260));
  }
  if (d < 55) return 2.6 * Math.pow(d / 55, 1.25);
  return 2.6 + 15 * (1 - Math.exp(-(d - 55) / 420));
}

/** Polyline with cumulative arc lengths for exact nearest-segment queries. */
export class PolyQuery {
  readonly xs: Float64Array;
  readonly zs: Float64Array;
  readonly cum: Float64Array;
  readonly total: number;
  /** Results of the last query. */
  d = 0;
  s = 0;
  constructor(pts: readonly { x: number; z: number }[]) {
    const n = pts.length;
    this.xs = new Float64Array(n);
    this.zs = new Float64Array(n);
    this.cum = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      this.xs[i] = pts[i].x;
      this.zs[i] = pts[i].z;
      if (i > 0) this.cum[i] = this.cum[i - 1] + hyp(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    }
    this.total = this.cum[n - 1] || 1;
  }
  query(x: number, z: number): number {
    const { xs, zs, cum } = this;
    let best = Infinity, bs = 0;
    for (let i = 0; i < xs.length - 1; i++) {
      const ax = xs[i], az = zs[i];
      const dx = xs[i + 1] - ax, dz = zs[i + 1] - az;
      const L2 = dx * dx + dz * dz || 1e-9;
      let t = ((x - ax) * dx + (z - az) * dz) / L2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const cx = ax + dx * t - x, cz = az + dz * t - z;
      const d2 = cx * cx + cz * cz;
      if (d2 < best) {
        best = d2;
        bs = cum[i] + (cum[i + 1] - cum[i]) * t;
      }
    }
    this.d = Math.sqrt(best);
    this.s = bs;
    return this.d;
  }
}

export interface BaseTerrain {
  h: Float32Array;
  /** Signed distance to the (noise-perturbed) coastline in meters, + inland. */
  coast: Float32Array;
  /** 0..1 relief suppression from flat areas (towns), for later stages. */
  flat: Float32Array;
}

export function buildBaseTerrain(layout: WorldLayout, noise: Noise2D): BaseTerrain {
  const NN = N * N;
  // 1) island mask + signed distance
  // (computed on a 4 m grid and bilinearly upsampled — the coastline is noise-perturbed anyway)
  const C4 = (N - 1) / 2 + 1;
  const mask = new Uint8Array(C4 * C4);
  rasterizePolygons(layout.islands, C4, C4, CELL * 2, mask, 1);
  const sd4 = signedDistance(C4, C4, mask);
  const coast = new Float32Array(NN);
  // Perturb the coastline with noise (except near bridge ends where geometry must match the authored data).
  const quiet: { x: number; z: number; r: number }[] = [];
  for (const b of layout.bridges) {
    quiet.push({ x: b.a.x, z: b.a.z, r: 90 }, { x: b.b.x, z: b.b.z, r: 90 });
  }
  for (const f of layout.flatAreas) if (f.height !== undefined) quiet.push({ x: f.x, z: f.z, r: f.radius + 40 });
  for (let j = 0; j < N; j++) {
    const z = j * CELL;
    for (let i = 0; i < N; i++) {
      const x = i * CELL;
      const idx = j * N + i;
      const ci = i >> 1, cj = j >> 1, fi = (i & 1) * 0.5, fj = (j & 1) * 0.5;
      const ci1 = Math.min(C4 - 1, ci + 1), cj1 = Math.min(C4 - 1, cj + 1);
      const sdv =
        (sd4[cj * C4 + ci] * (1 - fi) + sd4[cj * C4 + ci1] * fi) * (1 - fj) + (sd4[cj1 * C4 + ci] * (1 - fi) + sd4[cj1 * C4 + ci1] * fi) * fj;
      const d = sdv * CELL * 2;
      let amp = 15 * (1 - sstep(140, 230, Math.abs(d)));
      if (amp > 0) {
        for (const q of quiet) {
          const dd = hyp(x - q.x, z - q.z);
          if (dd < q.r) amp *= sstep(q.r * 0.4, q.r, dd);
        }
        coast[idx] = d + noise.fbm(x, z, 190, 3) * amp;
      } else coast[idx] = d;
    }
  }

  // 2) flat-area suppression map
  const flat = new Float32Array(NN);
  for (const f of layout.flatAreas) {
    const r = f.radius;
    const i0 = Math.max(0, Math.floor((f.x - r) / CELL)), i1 = Math.min(N - 1, Math.ceil((f.x + r) / CELL));
    const j0 = Math.max(0, Math.floor((f.z - r) / CELL)), j1 = Math.min(N - 1, Math.ceil((f.z + r) / CELL));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const d = hyp(i * CELL - f.x, j * CELL - f.z);
        const s = f.strength * (1 - sstep(r * 0.55, r, d));
        const idx = j * N + i;
        if (s > flat[idx]) flat[idx] = s;
      }
  }

  // 3) relief on a coarse 4 m grid (bilinear upsampled), domain warped fBm + ridged noise + macro elevation
  const C = (N - 1) / 2 + 1; // 769
  const coarse = new Float32Array(C * C);
  for (let j = 0; j < C; j++) {
    const z = j * CELL * 2;
    for (let i = 0; i < C; i++) {
      const x = i * CELL * 2;
      const wx = noise.fbm(x + 913, z - 377, 950, 2) * 170;
      const wz = noise.fbm(x - 541, z + 1207, 950, 2) * 170;
      const r = noise.fbm(x + wx, z + wz, 560, 5, 0.5);
      const rid = noise.ridged(x + wz * 0.6, z + wx * 0.6, 760, 4);
      const macro = noise.fbm(x, z, 1700, 2);
      coarse[j * C + i] = r * 8.5 + (rid - 0.38) * 15 + macro * 9;
    }
  }

  const h = new Float32Array(NN);
  for (let j = 0; j < N; j++) {
    const z = j * CELL;
    const cj = j >> 1, fj = (j & 1) * 0.5;
    const cj1 = Math.min(C - 1, cj + 1);
    for (let i = 0; i < N; i++) {
      const x = i * CELL;
      const idx = j * N + i;
      const d = coast[idx];
      let hh = coastProfile(d);
      if (d > -40) {
        const ci = i >> 1, fi = (i & 1) * 0.5;
        const ci1 = Math.min(C - 1, ci + 1);
        const a = coarse[cj * C + ci], b = coarse[cj * C + ci1], c = coarse[cj1 * C + ci], e = coarse[cj1 * C + ci1];
        const rel = (a * (1 - fi) + b * fi) * (1 - fj) + (c * (1 - fi) + e * fi) * fj;
        const fine = noise.noise(x / 38 + 7.7, z / 38 - 3.1) * 0.9;
        const inland = sstep(25, 260, d);
        const amp = inland * (1 - flat[idx]);
        hh += (rel + fine) * amp + fine * 0.3 * (1 - amp) * sstep(0, 30, d);
        if (d > 0) hh = Math.max(hh, Math.min(d * 0.045, 2.2));
      }
      h[idx] = hh;
    }
  }

  // 4) ridges (exact nearest-segment distance; crest height interpolated along the arc length)
  for (const r of layout.ridges) {
    const pq = new PolyQuery(r.points);
    const hs = r.heights;
    const cumPts = pq.cum;
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (const p of r.points) {
      minX = Math.min(minX, p.x);
      minZ = Math.min(minZ, p.z);
      maxX = Math.max(maxX, p.x);
      maxZ = Math.max(maxZ, p.z);
    }
    const W = r.width * 1.15;
    const i0 = Math.max(0, Math.floor((minX - W) / CELL)), i1 = Math.min(N - 1, Math.ceil((maxX + W) / CELL));
    const j0 = Math.max(0, Math.floor((minZ - W) / CELL)), j1 = Math.min(N - 1, Math.ceil((maxZ + W) / CELL));
    let k = 0;
    for (let j = j0; j <= j1; j++) {
      const z = j * CELL;
      for (let i = i0; i <= i1; i++) {
        const x = i * CELL;
        const dist = pq.query(x, z);
        const nW = r.width * (0.85 + 0.3 * noise.noise(x / 210, z / 210));
        if (dist >= nW) continue;
        const t = dist / nW;
        // crest height at arc length s
        const sArc = pq.s;
        k = 0;
        while (k < cumPts.length - 2 && cumPts[k + 1] < sArc) k++;
        const f = (sArc - cumPts[k]) / ((cumPts[k + 1] - cumPts[k]) || 1);
        const H = mix(hs[k], hs[Math.min(k + 1, hs.length - 1)], f);
        const bump = (1 - t * t) * (1 - t * t);
        const crest = 0.88 + 0.24 * noise.noise(x / 90 + 5, z / 90 - 3);
        const idx = j * N + i;
        h[idx] += H * bump * crest * sstep(10, 140, coast[idx]);
      }
    }
  }

  // 5) hills
  for (const hl of layout.hills) {
    const R = hl.radius * 1.15;
    const i0 = Math.max(0, Math.floor((hl.x - R) / CELL)), i1 = Math.min(N - 1, Math.ceil((hl.x + R) / CELL));
    const j0 = Math.max(0, Math.floor((hl.z - R) / CELL)), j1 = Math.min(N - 1, Math.ceil((hl.z + R) / CELL));
    const p = hl.plateau ?? 0;
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const x = i * CELL, z = j * CELL;
        const rr = hyp(x - hl.x, z - hl.z) * (1 + 0.16 * noise.noise(x / 120 + 11, z / 120 + 7));
        const t = rr / hl.radius;
        if (t >= 1) continue;
        const bump = p > 0 ? 1 - sstep(p, 1, t) : 0.5 + 0.5 * Math.cos(Math.PI * t);
        const idx = j * N + i;
        h[idx] += hl.height * bump * sstep(10, 140, coast[idx]);
      }
  }

  // 6) coastal cliffs
  for (const cl of layout.cliffs) {
    const pq = new PolyQuery(cl.points);
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (const q of cl.points) {
      minX = Math.min(minX, q.x);
      minZ = Math.min(minZ, q.z);
      maxX = Math.max(maxX, q.x);
      maxZ = Math.max(maxZ, q.z);
    }
    const R = 170;
    const i0 = Math.max(0, Math.floor((minX - R) / CELL)), i1 = Math.min(N - 1, Math.ceil((maxX + R) / CELL));
    const j0 = Math.max(0, Math.floor((minZ - R) / CELL)), j1 = Math.min(N - 1, Math.ceil((maxZ + R) / CELL));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const x = i * CELL, z = j * CELL;
        const dl = pq.query(x, z);
        if (dl > R) continue;
        const u = pq.s / pq.total;
        const taper = sstep(0, 0.15, u) * sstep(1, 0.85, u) * (1 - sstep(R * 0.6, R, dl));
        if (taper <= 0) continue;
        const idx = j * N + i;
        const d = coast[idx];
        if (d > 0) {
          const jag = noise.fbm(x, z, 23, 2) * 3;
          const hc = cl.height * Math.pow(sstep(0, cl.width, d + jag), 0.6) + noise.fbm(x, z, 60, 2) * 2;
          h[idx] = mix(h[idx], Math.max(h[idx], hc), taper);
        } else {
          // deep water at the cliff foot, blending back into the normal shelf with distance and toward the cliff
          // ends (a hard-edged deep slab reads as a dark rectangular band from the air)
          const hc = -4 - -d * 0.22;
          const seaT = sstep(0, 0.3, u) * sstep(1, 0.7, u) * sstep(R * 0.85, 15, dl);
          h[idx] = mix(h[idx], Math.min(h[idx], hc), seaT);
        }
      }
  }

  // 7) quarry pit with terraced walls
  {
    const q = layout.quarry;
    const cos = Math.cos(q.rotation), sin = Math.sin(q.rotation);
    const ci = Math.round(q.x / CELL), cj = Math.round(q.z / CELL);
    const rim = h[cj * N + ci];
    const floorY = Math.max(rim - q.depth, 5);
    const depth = rim - floorY;
    const wall = 46;
    const R = Math.max(q.rx, q.rz) + wall + 10;
    const i0 = Math.max(0, Math.floor((q.x - R) / CELL)), i1 = Math.min(N - 1, Math.ceil((q.x + R) / CELL));
    const j0 = Math.max(0, Math.floor((q.z - R) / CELL)), j1 = Math.min(N - 1, Math.ceil((q.z + R) / CELL));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const x = i * CELL, z = j * CELL;
        const dx = x - q.x, dz = z - q.z;
        const lx = dx * cos - dz * sin, lz = dx * sin + dz * cos;
        const ex = Math.abs(lx) / q.rx, ez = Math.abs(lz) / q.rz;
        const e = Math.pow(Math.pow(ex, 4) + Math.pow(ez, 4), 0.25); // rounded rectangle "radius" (1 = floor edge)
        const scale = Math.min(q.rx, q.rz);
        const outward = (e - 1) * scale + noise.fbm(x, z, 30, 2) * 4; // meters beyond the floor edge
        let target: number;
        if (outward <= 0) target = floorY + noise.fbm(x, z, 25, 2) * 0.4;
        else if (outward < wall) {
          const t = outward / wall;
          const n = q.terraces;
          const k = Math.floor(t * n), f = t * n - k;
          const step = (k + sstep(0.55, 0.95, f)) / n;
          target = floorY + depth * step + noise.fbm(x, z, 12, 2) * 0.5;
        } else continue;
        const idx = j * N + i;
        if (target < h[idx]) h[idx] = target;
      }
  }
  return { h, coast, flat };
}
