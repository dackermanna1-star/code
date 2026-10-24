// Procedural terrain: mountains ring a flat central plain; pads and roads are
// carved in, hills are added for the off-road area, and the surface material
// map (grip, dust, sparks) is painted to match.

import { Heightfield } from '../../sim/terrain.ts';
import { Surface } from '../../sim/surfaces.ts';
import { fbm2, ridged2, smoothstep, clamp } from '../../sim/math.ts';
import { PADS, ROADS, WORLD_HALF, TERRAIN_CELL, CLIFF, HILLS, type RoadDef } from './layout.ts';

export interface RoadSample {
  x: number;
  z: number;
  y: number;
  tx: number; // tangent
  tz: number;
  s: number; // arc length
}

export interface RoadPath {
  def: RoadDef;
  samples: RoadSample[];
}

/** Sample a Catmull-Rom spline through the road points every `step` meters. */
export function sampleRoad(def: RoadDef, step = 2): RoadSample[] {
  const pts = def.pts.map((p) => [p[0], p[1], p[2] ?? 0] as [number, number, number]);
  const n = pts.length;
  const get = (i: number) => {
    if (def.closed) return pts[((i % n) + n) % n];
    if (i < 0) return [2 * pts[0][0] - pts[1][0], 2 * pts[0][1] - pts[1][1], 2 * pts[0][2] - pts[1][2]] as [number, number, number];
    if (i >= n) return [2 * pts[n - 1][0] - pts[n - 2][0], 2 * pts[n - 1][1] - pts[n - 2][1], 2 * pts[n - 1][2] - pts[n - 2][2]] as [number, number, number];
    return pts[i];
  };
  const dense: [number, number, number][] = [];
  const segs = def.closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const steps = Math.max(4, Math.ceil(len / 0.5));
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      dense.push([cr(p0[0], p1[0], p2[0], p3[0], t), cr(p0[1], p1[1], p2[1], p3[1], t), cr(p0[2], p1[2], p2[2], p3[2], t)]);
    }
  }
  if (!def.closed) dense.push(pts[n - 1]);
  else dense.push(dense[0]);
  // resample by arc length
  const out: RoadSample[] = [];
  let acc = 0, next = 0;
  for (let i = 0; i < dense.length - 1; i++) {
    const a = dense[i], b = dense[i + 1];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    while (next <= acc + l) {
      const t = l > 0 ? (next - acc) / l : 0;
      const tx = (b[0] - a[0]) / (l || 1), tz = (b[1] - a[1]) / (l || 1);
      out.push({ x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, y: a[2] + (b[2] - a[2]) * t, tx, tz, s: next });
      next += step;
    }
    acc += l;
  }
  // smooth tangents
  for (let i = 0; i < out.length; i++) {
    const a = out[Math.max(0, i - 2)], b = out[Math.min(out.length - 1, i + 2)];
    const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    out[i].tx = (b.x - a.x) / l;
    out[i].tz = (b.z - a.z) / l;
  }
  return out;
}

function cr(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

/** Base mountain height: flat plain in the middle, ridges beyond. */
function baseHeight(x: number, z: number): number {
  // angular start radius: mountains come in closer in the north-west
  const ang = Math.atan2(z, x);
  const nw = Math.max(0, Math.cos(ang - Math.atan2(-1, -1)));
  const start = 570 - 140 * nw * nw;
  const r = Math.max(Math.abs(x), Math.abs(z)) * 0.7 + Math.hypot(x, z) * 0.3;
  const t = smoothstep(start, start + 150, r);
  if (t <= 0) return fbm2(x * 0.004, z * 0.004, 3, 3) * 0.0;
  const ridge = ridged2(x * 0.0035, z * 0.0035, 5, 11) * 150;
  const roll = (fbm2(x * 0.006, z * 0.006, 4, 7) * 0.5 + 0.5) * 50;
  return t * (ridge + roll) + t * t * 40;
}

export function generateTerrain(): { hf: Heightfield; roads: RoadPath[] } {
  const n = Math.round((WORLD_HALF * 2) / TERRAIN_CELL) + 1;
  const hf = new Heightfield(n, n, TERRAIN_CELL, -WORLD_HALF, -WORLD_HALF, 2);
  const H = hf.heights;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = -WORLD_HALF + i * TERRAIN_CELL, z = -WORLD_HALF + j * TERRAIN_CELL;
      H[j * n + i] = baseHeight(x, z);
    }
  }
  // gentle undulation on the open plain (not under pads/roads, which are flattened later)
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = -WORLD_HALF + i * TERRAIN_CELL, z = -WORLD_HALF + j * TERRAIN_CELL;
      H[j * n + i] += fbm2(x * 0.012, z * 0.012, 3, 21) * 1.2;
    }
  }
  // off-road hills
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = -WORLD_HALF + i * TERRAIN_CELL, z = -WORLD_HALF + j * TERRAIN_CELL;
      const dx = Math.abs(x - HILLS.x) / (HILLS.w / 2), dz = Math.abs(z - HILLS.z) / (HILLS.d / 2);
      const m = 1 - smoothstep(0.75, 1.0, Math.max(dx, dz));
      if (m <= 0) continue;
      const bumps = (fbm2(x * 0.03, z * 0.03, 4, 31) * 0.5 + 0.5) * 7 + Math.max(0, Math.sin(x * 0.09) * Math.sin(z * 0.07)) * 2.5;
      H[j * n + i] += m * bumps;
    }
  }
  // cliff plateau
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = -WORLD_HALF + i * TERRAIN_CELL, z = -WORLD_HALF + j * TERRAIN_CELL;
      const d = Math.hypot(x - CLIFF.x, z - CLIFF.z);
      // steep on the south-east face, gentle elsewhere
      const dirSE = ((x - CLIFF.x) + (z - CLIFF.z)) / (Math.SQRT2 * (d || 1));
      const fall = dirSE > 0.2 ? 5 : 45;
      const w = 1 - smoothstep(CLIFF.radius, CLIFF.radius + fall, d);
      if (w <= 0) continue;
      const k = j * n + i;
      H[k] = H[k] * (1 - w) + CLIFF.y * w;
      if (d < CLIFF.radius) H[k] = Math.max(H[k], CLIFF.y);
    }
  }
  // pads
  const target = new Float32Array(n * n).fill(NaN);
  const weight = new Float32Array(n * n);
  for (const p of PADS) {
    const i0 = Math.max(0, Math.floor((p.x - p.w / 2 - p.falloff + WORLD_HALF) / TERRAIN_CELL));
    const i1 = Math.min(n - 1, Math.ceil((p.x + p.w / 2 + p.falloff + WORLD_HALF) / TERRAIN_CELL));
    const j0 = Math.max(0, Math.floor((p.z - p.d / 2 - p.falloff + WORLD_HALF) / TERRAIN_CELL));
    const j1 = Math.min(n - 1, Math.ceil((p.z + p.d / 2 + p.falloff + WORLD_HALF) / TERRAIN_CELL));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const x = -WORLD_HALF + i * TERRAIN_CELL, z = -WORLD_HALF + j * TERRAIN_CELL;
        const ox = Math.max(0, Math.abs(x - p.x) - p.w / 2);
        const oz = Math.max(0, Math.abs(z - p.z) - p.d / 2);
        const o = Math.hypot(ox, oz);
        const w = 1 - smoothstep(0, p.falloff, o);
        const k = j * n + i;
        if (w > weight[k]) {
          weight[k] = w;
          target[k] = p.y;
        }
      }
    }
  }
  // roads
  const roads: RoadPath[] = [];
  for (const r of ROADS) {
    const samples = sampleRoad(r, 2);
    // plain roads follow 0 unless explicit heights are given
    roads.push({ def: r, samples });
    const half = r.width / 2 + 1.5;
    const shoulder = r.shoulder ?? 10;
    const reach = half + shoulder;
    for (const s of samples) {
      const i0 = Math.max(0, Math.floor((s.x - reach + WORLD_HALF) / TERRAIN_CELL));
      const i1 = Math.min(n - 1, Math.ceil((s.x + reach + WORLD_HALF) / TERRAIN_CELL));
      const j0 = Math.max(0, Math.floor((s.z - reach + WORLD_HALF) / TERRAIN_CELL));
      const j1 = Math.min(n - 1, Math.ceil((s.z + reach + WORLD_HALF) / TERRAIN_CELL));
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const x = -WORLD_HALF + i * TERRAIN_CELL, z = -WORLD_HALF + j * TERRAIN_CELL;
          // lateral distance to the road line at this sample
          const dx = x - s.x, dz = z - s.z;
          const along = dx * s.tx + dz * s.tz;
          if (Math.abs(along) > 2.5) continue;
          const lat = Math.abs(dx * -s.tz + dz * s.tx);
          const w = lat <= half ? 1 : 1 - smoothstep(0, shoulder, lat - half);
          const k = j * n + i;
          if (w > weight[k] + 1e-4 || (w >= 0.999 && lat < half)) {
            weight[k] = Math.max(weight[k], w);
            target[k] = s.y;
          }
        }
      }
    }
  }
  for (let k = 0; k < n * n; k++) {
    const w = weight[k];
    if (w > 0 && !isNaN(target[k])) H[k] = H[k] * (1 - w) + target[k] * w;
  }

  // ---------------------------------------------------------------- surfaces
  const mn = hf.matNx;
  const mat = hf.materials;
  const mc = hf.matCell;
  for (let j = 0; j < hf.matNz; j++) {
    for (let i = 0; i < mn; i++) {
      const x = hf.x0 + (i + 0.5) * mc, z = hf.z0 + (j + 0.5) * mc;
      let s: number = Surface.GRASS;
      const patch = fbm2(x * 0.02, z * 0.02, 3, 41);
      if (patch > 0.35) s = Surface.DIRT;
      // slope
      const h0 = hf.heightAt(x, z), hx = hf.heightAt(x + 2, z), hz = hf.heightAt(x, z + 2);
      const slope = Math.hypot(hx - h0, hz - h0) / 2;
      if (h0 > 25 && slope > 0.55) s = Surface.ROCK;
      else if (h0 > 70) s = slope > 0.4 ? Surface.ROCK : Surface.GRAVEL;
      const dx = Math.abs(x - HILLS.x) / (HILLS.w / 2), dz = Math.abs(z - HILLS.z) / (HILLS.d / 2);
      if (Math.max(dx, dz) < 0.9) s = Surface.DIRT;
      mat[j * mn + i] = s;
    }
  }
  for (const p of PADS) {
    paintRect(hf, p.x, p.z, p.w, p.d, p.surface);
  }
  for (const r of roads) {
    const half = r.def.width / 2;
    for (const s of r.samples) {
      for (let a = -half; a <= half; a += 1) {
        hf.setSurface(s.x - s.tz * a, s.z + s.tx * a, r.def.surface ?? Surface.ASPHALT);
        hf.setSurface(s.x - s.tz * a + s.tx, s.z + s.tx * a + s.tz, r.def.surface ?? Surface.ASPHALT);
      }
    }
  }
  // mud pit in the hills
  paintCircle(hf, HILLS.x + 40, HILLS.z + 30, 16, Surface.MUD);
  // sand trap in the stunt park
  return { hf, roads };
}

export function paintRect(hf: Heightfield, cx: number, cz: number, w: number, d: number, s: number): void {
  for (let z = cz - d / 2; z <= cz + d / 2; z += hf.matCell * 0.5) {
    for (let x = cx - w / 2; x <= cx + w / 2; x += hf.matCell * 0.5) hf.setSurface(x, z, s);
  }
}

export function paintCircle(hf: Heightfield, cx: number, cz: number, r: number, s: number): void {
  for (let z = cz - r; z <= cz + r; z += hf.matCell * 0.5) {
    for (let x = cx - r; x <= cx + r; x += hf.matCell * 0.5) {
      if ((x - cx) ** 2 + (z - cz) ** 2 <= r * r) hf.setSurface(x, z, s);
    }
  }
}

/** Raise/lower terrain smoothly under a footprint (used by obstacles needing pits/mounds). */
export function sculpt(hf: Heightfield, cx: number, cz: number, r: number, dh: number): void {
  const n = hf.nx;
  for (let j = 0; j < hf.nz; j++) {
    const z = hf.z0 + j * hf.cell;
    if (Math.abs(z - cz) > r) continue;
    for (let i = 0; i < n; i++) {
      const x = hf.x0 + i * hf.cell;
      const d = Math.hypot(x - cx, z - cz);
      if (d > r) continue;
      hf.heights[j * n + i] += dh * (1 - smoothstep(r * 0.5, r, d));
    }
  }
  void clamp;
}
