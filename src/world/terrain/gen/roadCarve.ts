// Road profiles (smoothed, grade-limited, pinned at junctions, ramped onto bridges) and cut/fill carving.
import type { BridgeDef, RoadDef, WorldLayout } from '../../layout/types';
import { CELL, N } from '../TerrainData';
import { densify, hyp } from './raster';
import { mix, sstep } from './baseTerrain';

export interface RoadField {
  /** Distance from each sample to the nearest road edge (m, negative on the road). */
  edge: Float32Array;
  /** 1 = asphalt, 2 = dirt, 3 = bridge deck, 0 = none (for the nearest road). */
  kind: Uint8Array;
  /** Height of the road surface where a sample lies on a road core (NaN elsewhere). */
  coreH: Float32Array;
}

export function sampleBilinear(h: Float32Array, x: number, z: number): number {
  const fx = Math.min(Math.max(x / CELL, 0), N - 1.001), fz = Math.min(Math.max(z / CELL, 0), N - 1.001);
  const i = Math.floor(fx), j = Math.floor(fz);
  const tx = fx - i, tz = fz - j;
  const a = h[j * N + i], b = h[j * N + i + 1], c = h[(j + 1) * N + i], d = h[(j + 1) * N + i + 1];
  return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
}

const MIN_DECK = { channel: 10, river: 6.5 };

export function carveRoads(layout: WorldLayout, h: Float32Array): { field: RoadField; deck: Float32Array } {
  const NN = N * N;
  const edge = new Float32Array(NN).fill(Infinity);
  const kind = new Uint8Array(NN);
  const coreH = new Float32Array(NN).fill(NaN);
  const deck = new Float32Array(layout.bridges.length);

  for (const road of layout.roadDefs) {
    carveOne(road, layout.bridges, h, edge, kind, coreH, deck);
  }
  return { field: { edge, kind, coreH }, deck };
}

function carveOne(
  road: RoadDef,
  bridges: BridgeDef[],
  h: Float32Array,
  edge: Float32Array,
  kind: Uint8Array,
  coreH: Float32Array,
  deck: Float32Array,
): void {
  const pts = densify(road.points, 2);
  const n = pts.length;
  if (n < 2) return;
  const asphalt = road.kind === 'asphalt';
  const hw = road.width / 2;
  // 1) raw profile + pins where we cross/join an already carved road
  const raw = new Float32Array(n);
  const pin = new Float32Array(n).fill(NaN);
  for (let k = 0; k < n; k++) {
    raw[k] = sampleBilinear(h, pts[k].x, pts[k].z);
    const i = Math.round(pts[k].x / CELL), j = Math.round(pts[k].z / CELL);
    if (i >= 0 && j >= 0 && i < N && j < N) {
      const c = coreH[j * N + i];
      if (!Number.isNaN(c)) pin[k] = c;
    }
  }
  // 2) moving-average smoothing
  const win = asphalt ? 18 : 9;
  const pref = new Float64Array(n + 1);
  for (let k = 0; k < n; k++) pref[k + 1] = pref[k] + raw[k];
  const prof = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const a = Math.max(0, k - win), b = Math.min(n - 1, k + win);
    prof[k] = (pref[b + 1] - pref[a]) / (b - a + 1);
  }
  // never bury the road deeply under water level
  for (let k = 0; k < n; k++) prof[k] = Math.max(prof[k], asphalt ? 1.2 : 0.9);

  // 3) bridges: fixed deck spans
  const fixed = new Uint8Array(n);
  const spans: [number, number][] = [];
  for (const br of bridges) {
    if (br.roadId !== road.id) continue;
    let ka = 0, kb = 0, da = Infinity, db = Infinity;
    for (let k = 0; k < n; k++) {
      const a = hyp(pts[k].x - br.a.x, pts[k].z - br.a.z);
      const b = hyp(pts[k].x - br.b.x, pts[k].z - br.b.z);
      if (a < da) {
        da = a;
        ka = k;
      }
      if (b < db) {
        db = b;
        kb = k;
      }
    }
    if (ka > kb) [ka, kb] = [kb, ka];
    const ends = Math.max(prof[ka], prof[kb]);
    const y = Math.max(MIN_DECK[br.kind], ends + 0.2);
    deck[br.id - 1] = y;
    br.deckY = y;
    for (let k = ka; k <= kb; k++) {
      prof[k] = y;
      fixed[k] = 1;
    }
    spans.push([ka, kb]);
  }

  // 4) pins (junctions): blend toward the existing road height over 24 m
  const pinR = 12; // samples (2 m each)
  for (let k = 0; k < n; k++) {
    if (Number.isNaN(pin[k]) || fixed[k]) continue;
    for (let q = Math.max(0, k - pinR); q <= Math.min(n - 1, k + pinR); q++) {
      if (fixed[q]) continue;
      const w = 1 - Math.abs(q - k) / (pinR + 1);
      prof[q] = mix(prof[q], pin[k], w * w * (3 - 2 * w));
    }
  }

  // 5) grade limiting (keeps bridge spans and ramps up/down to them)
  const g = (asphalt ? 0.085 : 0.14) * 2; // per 2 m sample
  for (let it = 0; it < 3; it++) {
    for (let k = 1; k < n; k++) if (!fixed[k] && Number.isNaN(pin[k])) prof[k] = Math.min(Math.max(prof[k], prof[k - 1] - g), prof[k - 1] + g);
    for (let k = n - 2; k >= 0; k--) if (!fixed[k] && Number.isNaN(pin[k])) prof[k] = Math.min(Math.max(prof[k], prof[k + 1] - g), prof[k + 1] + g);
  }
  // ramps toward bridge decks must always win (embankments)
  for (const [ka, kb] of spans) {
    const y = prof[ka];
    for (let k = ka - 1; k >= 0 && y - (ka - k) * g > prof[k]; k--) prof[k] = y - (ka - k) * g;
    for (let k = kb + 1; k < n && y - (k - kb) * g > prof[k]; k++) prof[k] = y - (k - kb) * g;
  }

  // 6) carve into a local buffer (nearest centerline sample per grid sample)
  // Shoulder blend widens with the cut/fill height so embankments stay walkable (~20° max).
  const blend = asphalt ? 11 : 6;
  const R = hw + 0.75 + blend + (asphalt ? 26 : 16);
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    minZ = Math.min(minZ, p.z);
    maxX = Math.max(maxX, p.x);
    maxZ = Math.max(maxZ, p.z);
  }
  const i0 = Math.max(0, Math.floor((minX - R) / CELL)), i1 = Math.min(N - 1, Math.ceil((maxX + R) / CELL));
  const j0 = Math.max(0, Math.floor((minZ - R) / CELL)), j1 = Math.min(N - 1, Math.ceil((maxZ + R) / CELL));
  const W = i1 - i0 + 1, H = j1 - j0 + 1;
  const ld = new Float32Array(W * H).fill(Infinity);
  const lo = new Int32Array(W * H).fill(-1);
  const R2 = R * R;
  for (let k = 0; k < n; k++) {
    const s = pts[k];
    const a0 = Math.max(i0, Math.floor((s.x - R) / CELL)), a1 = Math.min(i1, Math.ceil((s.x + R) / CELL));
    const b0 = Math.max(j0, Math.floor((s.z - R) / CELL)), b1 = Math.min(j1, Math.ceil((s.z + R) / CELL));
    for (let j = b0; j <= b1; j++) {
      const dz = j * CELL - s.z;
      for (let i = a0; i <= a1; i++) {
        const dx = i * CELL - s.x;
        const d2 = dx * dx + dz * dz;
        if (d2 > R2) continue;
        const li = (j - j0) * W + (i - i0);
        if (d2 < ld[li]) {
          ld[li] = d2;
          lo[li] = k;
        }
      }
    }
  }
  const kindId = asphalt ? 1 : 2;
  for (let j = j0; j <= j1; j++)
    for (let i = i0; i <= i1; i++) {
      const li = (j - j0) * W + (i - i0);
      const k = lo[li];
      if (k < 0) continue;
      const d = Math.sqrt(ld[li]);
      const idx = j * N + i;
      const target = prof[k];
      const onDeck = fixed[k] === 1;
      // Under a bridge span: leave the valley/water alone (only abutments get filled).
      if (onDeck && h[idx] < target - 2.5) {
        const e = d - hw;
        if (e < edge[idx]) {
          edge[idx] = e;
          kind[idx] = 3;
        }
        continue;
      }
      const core = hw + 0.75;
      if (d <= core) {
        h[idx] = target;
        coreH[idx] = target;
      } else {
        const bw = Math.min(R - core, blend + 2.6 * Math.abs(h[idx] - target));
        if (d >= core + bw) continue;
        const t = sstep(core, core + bw, d);
        h[idx] = mix(target, h[idx], t);
      }
      const e = d - hw;
      if (e < edge[idx]) {
        edge[idx] = e;
        kind[idx] = kindId;
      }
    }
}
