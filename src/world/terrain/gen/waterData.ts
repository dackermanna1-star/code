// Water data grid for the water shader: terrain height, distance to land and river flow, as half floats.
import { distanceTransform } from '../edt';
import { CELL, N, WATER_RES, WORLD_SIZE, toHalf } from '../TerrainData';
import { sampleBilinear } from './roadCarve';
import type { RiverField } from './waterCarve';

export function buildWaterData(h: Float32Array, river: RiverField): Uint16Array {
  const R = WATER_RES;
  const texel = WORLD_SIZE / R; // 4 m
  const heights = new Float32Array(R * R);
  for (let j = 0; j < R; j++)
    for (let i = 0; i < R; i++) heights[j * R + i] = sampleBilinear(h, (i + 0.5) * texel, (j + 0.5) * texel);
  const land = distanceTransform(R, R, (k) => heights[k] > 0.05);
  const out = new Uint16Array(R * R * 4);
  for (let j = 0; j < R; j++)
    for (let i = 0; i < R; i++) {
      const k = j * R + i;
      const x = (i + 0.5) * texel, z = (j + 0.5) * texel;
      const si = Math.min(N - 1, Math.round(x / CELL)), sj = Math.min(N - 1, Math.round(z / CELL));
      const sidx = sj * N + si;
      let fx = 0, fz = 0;
      const rd = river.dist[sidx];
      if (Number.isFinite(rd) && rd < river.halfW[sidx] + 12) {
        // faster flow in the middle of narrow sections
        const speed = 0.9 * (1 - Math.min(1, rd / (river.halfW[sidx] + 12)) * 0.6) * Math.min(1.4, 28 / Math.max(10, river.halfW[sidx]));
        fx = river.flowX[sidx] * speed;
        fz = river.flowZ[sidx] * speed;
      }
      out[k * 4] = toHalf(heights[k]);
      out[k * 4 + 1] = toHalf(Math.min(2000, land[k] * texel));
      out[k * 4 + 2] = toHalf(fx);
      out[k * 4 + 3] = toHalf(fz);
    }
  return out;
}
