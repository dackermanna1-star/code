// Flatten building lots to a level pad (groundY) with smooth skirts that never disturb road cores or other pads.
import { BUILDING_FOOTPRINTS } from '../../../core/contracts';
import type { WorldLayout } from '../../layout/types';
import { CELL, N } from '../TerrainData';
import { mix, sstep } from './baseTerrain';
import { rectSd, hyp } from './raster';
import type { RoadField } from './roadCarve';

/** Pad margin around the nominal footprint (m) and skirt width. */
export const LOT_PAD = 1.5;
const SKIRT = 9;

export function flattenLots(layout: WorldLayout, h: Float32Array, roads: RoadField): { ground: Float32Array; pad: Uint8Array } {
  const ground = new Float32Array(layout.lots.length);
  const pad = new Uint8Array(N * N);
  // Bigger buildings first so small ones adapt to them.
  const order = layout.lots.map((_, i) => i);
  const area = (i: number) => {
    const f = BUILDING_FOOTPRINTS[layout.lots[i].type];
    return f.w * f.d;
  };
  order.sort((a, b) => area(b) - area(a));
  for (const li of order) {
    const lot = layout.lots[li];
    const f = BUILDING_FOOTPRINTS[lot.type];
    const hw = f.w / 2 + LOT_PAD, hd = f.d / 2 + LOT_PAD;
    const cos = Math.cos(lot.rotationY), sin = Math.sin(lot.rotationY);
    const R = hyp(hw, hd) + SKIRT + 2;
    const i0 = Math.max(0, Math.floor((lot.x - R) / CELL)), i1 = Math.min(N - 1, Math.ceil((lot.x + R) / CELL));
    const j0 = Math.max(0, Math.floor((lot.z - R) / CELL)), j1 = Math.min(N - 1, Math.ceil((lot.z + R) / CELL));
    // ground level = mean height under the footprint (existing pads count double so neighbours agree)
    let sum = 0, cnt = 0;
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const sd = rectSd(i * CELL, j * CELL, lot.x, lot.z, hw, hd, cos, sin);
        if (sd > 0) continue;
        const idx = j * N + i;
        const w = pad[idx] ? 2 : 1;
        sum += h[idx] * w;
        cnt += w;
      }
    let gy = cnt ? sum / cnt : h[Math.round(lot.z / CELL) * N + Math.round(lot.x / CELL)];
    gy = Math.max(gy, 1.6);
    gy = Math.round(gy * 20) / 20;
    ground[li] = gy;
    lot.groundY = gy;
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const idx = j * N + i;
        const sd = rectSd(i * CELL, j * CELL, lot.x, lot.z, hw, hd, cos, sin);
        if (sd <= 0) {
          h[idx] = gy;
          pad[idx] = 1;
        } else if (sd < SKIRT) {
          if (pad[idx]) continue;
          if (roads.edge[idx] < 0.75) continue; // keep road cores intact
          const t = sstep(0, SKIRT, sd);
          h[idx] = mix(gy, h[idx], t);
        }
      }
  }
  return { ground, pad };
}
