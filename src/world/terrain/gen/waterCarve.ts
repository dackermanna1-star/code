// River and pond carving.
import type { WorldLayout } from '../../layout/types';
import type { Noise2D } from '../noise';
import { CELL, N } from '../TerrainData';
import { densify, splatNearest, hyp } from './raster';
import { mix, sstep } from './baseTerrain';

export interface RiverField {
  /** Distance from each sample to the river centerline (m, Infinity if far). */
  dist: Float32Array;
  /** Half width of the river at the nearest centerline sample. */
  halfW: Float32Array;
  /** Flow direction (unit) at the nearest centerline sample. */
  flowX: Float32Array;
  flowZ: Float32Array;
}

const FLOOD = 120;
const BANK = 10;

export function carveRiver(layout: WorldLayout, h: Float32Array, noise: Noise2D): RiverField {
  const NN = N * N;
  const river = layout.river;
  const pts = densify(river.points, 3);
  // width per dense point from the per-point widths (both arrays follow the same polyline)
  const widths: number[] = [];
  {
    let k = 0;
    let acc = 0;
    const cum = [0];
    for (let i = 1; i < river.points.length; i++) {
      acc += hyp(river.points[i].x - river.points[i - 1].x, river.points[i].z - river.points[i - 1].z);
      cum.push(acc);
    }
    for (const p of pts) {
      while (k < cum.length - 2 && cum[k + 1] < p.s) k++;
      const t = Math.min(1, Math.max(0, (p.s - cum[k]) / ((cum[k + 1] - cum[k]) || 1)));
      widths.push(mix(river.widths[k], river.widths[Math.min(k + 1, river.widths.length - 1)], t));
    }
  }
  const dist = new Float32Array(NN).fill(Infinity);
  const owner = new Int32Array(NN).fill(-1);
  splatNearest(pts, (k) => widths[k] / 2 + BANK + FLOOD, N, CELL, dist, owner);
  const halfW = new Float32Array(NN);
  const flowX = new Float32Array(NN);
  const flowZ = new Float32Array(NN);
  for (let idx = 0; idx < NN; idx++) {
    const k = owner[idx];
    if (k < 0) continue;
    const i = idx % N, j = (idx / N) | 0;
    const x = i * CELL, z = j * CELL;
    const hw = widths[k] / 2 * (1 + 0.08 * noise.noise(x / 60, z / 60));
    halfW[idx] = hw;
    flowX[idx] = pts[k].tx;
    flowZ[idx] = pts[k].tz;
    const d = dist[idx];
    let target: number;
    if (d < hw) {
      const t = d / hw;
      target = -0.45 - river.depth * Math.pow(1 - t * t, 0.7);
    } else if (d < hw + BANK) {
      target = mix(-0.45, 1.3, sstep(hw, hw + BANK, d));
    } else {
      target = mix(1.3, h[idx], sstep(hw + BANK, hw + BANK + FLOOD * (0.8 + 0.4 * noise.noise(x / 150, z / 150)), d));
    }
    if (target < h[idx]) h[idx] = target;
  }
  return { dist, halfW, flowX, flowZ };
}

/** Carve ponds; resolves NaN levels from the terrain at the pond center. Returns the levels. */
export function carvePonds(layout: WorldLayout, h: Float32Array): Float32Array {
  const levels = new Float32Array(layout.ponds.length);
  layout.ponds.forEach((p, pi) => {
    const ci = Math.round(p.x / CELL), cj = Math.round(p.z / CELL);
    // level = minimum terrain on the rim - 0.5 so the water never spills
    let rimMin = Infinity;
    for (let a = 0; a < 32; a++) {
      const ang = (a / 32) * Math.PI * 2;
      const x = p.x + Math.cos(ang) * (p.radius + 6), z = p.z + Math.sin(ang) * (p.radius + 6);
      const i = Math.round(x / CELL), j = Math.round(z / CELL);
      if (i >= 0 && j >= 0 && i < N && j < N) rimMin = Math.min(rimMin, h[j * N + i]);
    }
    const center = h[cj * N + ci];
    const level = Number.isFinite(p.level) ? p.level : Math.min(center - 1.0, rimMin - 0.6);
    levels[pi] = level;
    const R = p.radius + 30;
    const i0 = Math.max(0, Math.floor((p.x - R) / CELL)), i1 = Math.min(N - 1, Math.ceil((p.x + R) / CELL));
    const j0 = Math.max(0, Math.floor((p.z - R) / CELL)), j1 = Math.min(N - 1, Math.ceil((p.z + R) / CELL));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const d = hyp(i * CELL - p.x, j * CELL - p.z);
        const idx = j * N + i;
        let target: number;
        if (d < p.radius) {
          const t = d / p.radius;
          target = level - 0.4 - 2.6 * (1 - t * t);
        } else {
          target = mix(level - 0.4, h[idx], sstep(p.radius, p.radius + 26, d));
          target = Math.min(target, mix(level + 0.4, h[idx], sstep(p.radius + 2, p.radius + 26, d)));
        }
        if (target < h[idx]) h[idx] = target;
      }
  });
  return levels;
}
