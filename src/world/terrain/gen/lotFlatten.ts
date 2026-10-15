// Flatten building lots to a level pad (groundY) with smooth skirts that never disturb road cores or other pads.
import { BUILDING_FOOTPRINTS } from '../../../core/contracts';
import type { WorldLayout } from '../../layout/types';
import { CELL, N } from '../TerrainData';
import { mix, sstep } from './baseTerrain';
import { rectSd, hyp } from './raster';
import { obbOverlap } from '../../layout/geometry';
import type { RoadField } from './roadCarve';

/**
 * Pad margin around the nominal footprint (m): ≥ 2·√2 so every heightfield cell touching the footprint is level
 * (the surface is triangle-interpolated between 2 m samples). Lots whose pads overlap are levelled together.
 */
export const LOT_PAD = 2.9;
const SKIRT = 9;

export function flattenLots(layout: WorldLayout, h: Float32Array, roads: RoadField): { ground: Float32Array; pad: Uint8Array } {
  const lots = layout.lots;
  const ground = new Float32Array(lots.length);
  const pad = new Uint8Array(N * N);
  const boxes = lots.map((l) => {
    const f = BUILDING_FOOTPRINTS[l.type];
    return { x: l.x, z: l.z, hw: f.w / 2 + LOT_PAD, hd: f.d / 2 + LOT_PAD, rot: l.rotationY };
  });
  // 1) mean terrain height under each padded footprint
  const meanH = boxes.map((b) => {
    const cos = Math.cos(b.rot), sin = Math.sin(b.rot);
    const R = hyp(b.hw, b.hd);
    let sum = 0, cnt = 0;
    for (let j = Math.max(0, Math.floor((b.z - R) / CELL)); j <= Math.min(N - 1, Math.ceil((b.z + R) / CELL)); j++)
      for (let i = Math.max(0, Math.floor((b.x - R) / CELL)); i <= Math.min(N - 1, Math.ceil((b.x + R) / CELL)); i++) {
        if (rectSd(i * CELL, j * CELL, b.x, b.z, b.hw, b.hd, cos, sin) > 0) continue;
        sum += h[j * N + i];
        cnt++;
      }
    return cnt ? sum / cnt : h[Math.round(b.z / CELL) * N + Math.round(b.x / CELL)];
  });
  // 2) cluster lots whose pads overlap (union-find) so shared pad cells get one consistent level
  const parent = lots.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let a = 0; a < boxes.length; a++)
    for (let b = a + 1; b < boxes.length; b++) {
      const A = boxes[a], B = boxes[b];
      const r = hyp(A.hw, A.hd) + hyp(B.hw, B.hd);
      if (Math.abs(A.x - B.x) > r || Math.abs(A.z - B.z) > r) continue;
      if (obbOverlap(A, B, 0)) parent[find(a)] = find(b);
    }
  const acc = new Map<number, { sum: number; w: number }>();
  boxes.forEach((b, i) => {
    const k = find(i);
    const w = b.hw * b.hd;
    const e = acc.get(k) ?? { sum: 0, w: 0 };
    e.sum += meanH[i] * w;
    e.w += w;
    acc.set(k, e);
  });
  // 3) flatten pads + skirts
  boxes.forEach((b, li) => {
    const e = acc.get(find(li))!;
    let gy = Math.max(e.sum / e.w, 1.6);
    gy = Math.round(gy * 20) / 20;
    ground[li] = gy;
    lots[li].groundY = gy;
    const cos = Math.cos(b.rot), sin = Math.sin(b.rot);
    const R = hyp(b.hw, b.hd) + SKIRT + 2;
    const i0 = Math.max(0, Math.floor((b.x - R) / CELL)), i1 = Math.min(N - 1, Math.ceil((b.x + R) / CELL));
    const j0 = Math.max(0, Math.floor((b.z - R) / CELL)), j1 = Math.min(N - 1, Math.ceil((b.z + R) / CELL));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const idx = j * N + i;
        const sd = rectSd(i * CELL, j * CELL, b.x, b.z, b.hw, b.hd, cos, sin);
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
  });
  return { ground, pad };
}
