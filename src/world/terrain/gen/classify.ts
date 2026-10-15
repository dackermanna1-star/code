// Surface classification, splat weights, tree density, ground cover, reserved-distance field and normals.
import { BUILDING_FOOTPRINTS } from '../../../core/contracts';
import type { WorldLayout } from '../../layout/types';
import { PROP_FOOTPRINTS } from '../../layout/props';
import type { Noise2D } from '../noise';
import { distanceTransform } from '../edt';
import { CELL, CLS, CLS_CELL, M, N, Surf } from '../TerrainData';
import { sstep } from './baseTerrain';
import { rectSd, hyp } from './raster';
import type { RoadField } from './roadCarve';
import type { RiverField } from './waterCarve';

export function computeNormals(h: Float32Array): Uint8Array {
  const out = new Uint8Array(N * N * 4);
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const il = i > 0 ? i - 1 : i, ir = i < N - 1 ? i + 1 : i;
      const jl = j > 0 ? j - 1 : j, jr = j < N - 1 ? j + 1 : j;
      const nx = (h[j * N + il] - h[j * N + ir]) / ((ir - il) * CELL);
      const nz = (h[jl * N + i] - h[jr * N + i]) / ((jr - jl) * CELL);
      const inv = 1 / Math.sqrt(nx * nx + 1 + nz * nz);
      const o = (j * N + i) * 4;
      out[o] = Math.round((nx * inv * 0.5 + 0.5) * 255);
      out[o + 1] = Math.round((inv * 0.5 + 0.5) * 255);
      out[o + 2] = Math.round((nz * inv * 0.5 + 0.5) * 255);
      out[o + 3] = 255;
    }
  return out;
}

/** Binary reserved mask (cells) → distance field in 0.1 m units. */
export function computeReserved(layout: WorldLayout, roads: RoadField): { reserved: Uint8Array; roadMask: Uint8Array } {
  const src = new Uint8Array(M * M);
  const roadMask = new Uint8Array(M * M);
  for (let j = 0; j < M; j++)
    for (let i = 0; i < M; i++) {
      // a cell is reserved if any of its corner samples is on a road / deck
      const s0 = j * N + i;
      let e = roads.edge[s0], k = roads.kind[s0];
      if (roads.edge[s0 + 1] < e) (e = roads.edge[s0 + 1]), (k = roads.kind[s0 + 1]);
      if (roads.edge[s0 + N] < e) (e = roads.edge[s0 + N]), (k = roads.kind[s0 + N]);
      if (roads.edge[s0 + N + 1] < e) (e = roads.edge[s0 + N + 1]), (k = roads.kind[s0 + N + 1]);
      if (e < 0) {
        src[j * M + i] = 1;
        roadMask[j * M + i] = k;
      }
    }
  const markRect = (cx: number, cz: number, hw: number, hd: number, rot: number) => {
    const cos = Math.cos(rot), sin = Math.sin(rot);
    const R = hyp(hw, hd) + CELL;
    const i0 = Math.max(0, Math.floor((cx - R) / CELL)), i1 = Math.min(M - 1, Math.floor((cx + R) / CELL));
    const j0 = Math.max(0, Math.floor((cz - R) / CELL)), j1 = Math.min(M - 1, Math.floor((cz + R) / CELL));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        if (rectSd((i + 0.5) * CELL, (j + 0.5) * CELL, cx, cz, hw, hd, cos, sin) <= CELL * 0.5) src[j * M + i] = 1;
      }
  };
  for (const lot of layout.lots) {
    const f = BUILDING_FOOTPRINTS[lot.type];
    markRect(lot.x, lot.z, f.w / 2, f.d / 2, lot.rotationY);
  }
  for (const br of layout.bridges) {
    const dx = br.b.x - br.a.x, dz = br.b.z - br.a.z;
    markRect((br.a.x + br.b.x) / 2, (br.a.z + br.b.z) / 2, br.width / 2, hyp(dx, dz) / 2, Math.atan2(dx, dz));
  }
  for (const p of layout.props) {
    const fp = PROP_FOOTPRINTS[p.kind] ?? { hx: 1, hz: 1, h: 1 };
    const s = p.scale ?? 1;
    if (fp.linear) markRect(p.x, p.z, (p.length ?? 2) / 2, fp.hz + 0.3, p.rotationY);
    else markRect(p.x, p.z, fp.hx * s, fp.hz * s, p.rotationY);
  }
  const dist = distanceTransform(M, M, src);
  const out = new Uint8Array(M * M);
  for (let i = 0; i < M * M; i++) {
    const meters = src[i] ? 0 : Math.max(0, dist[i] * CELL - CELL * 0.5);
    out[i] = Math.min(255, Math.round(meters * 10));
  }
  return { reserved: out, roadMask };
}

export interface ClassifyInput {
  layout: WorldLayout;
  h: Float32Array;
  normals: Uint8Array;
  coast: Float32Array;
  flat: Float32Array;
  river: RiverField;
  roads: RoadField;
  pad: Uint8Array;
  reserved: Uint8Array;
  pondLevels: Float32Array;
  noise: Noise2D;
}

export interface ClassifyOutput {
  surface: Uint8Array;
  splatA: Uint8Array;
  splatB: Uint8Array;
  tree: Uint8Array;
  cover: Uint8Array;
}

// layer order in the weight vector: 0 grass, 1 dry, 2 forest, 3 dirt, 4 mud, 5 rock, 6 sand, 7 gravel, 8 field
const L = 9;

export function classify(inp: ClassifyInput): ClassifyOutput {
  const { layout, h, normals, coast, flat, river, roads, pad, reserved, noise } = inp;
  const MM = CLS * CLS;
  const surface = new Uint8Array(MM);
  const splatA = new Uint8Array(MM * 4);
  const splatB = new Uint8Array(MM * 4);
  const tree = new Uint8Array(MM);
  const cover = new Uint8Array(MM);
  const w = new Float32Array(L);

  // Pre-compute field / patch / forest lookup in local frames, bucketed into 128 m tiles.
  const fields = layout.fields.map((f) => ({ ...f, cos: Math.cos(f.rotation), sin: Math.sin(f.rotation), r: hyp(f.w, f.d) / 2 + 8 }));
  const patches = layout.groundPatches.map((p) => ({ ...p, cos: Math.cos(p.rotation), sin: Math.sin(p.rotation), r: hyp(p.w, p.d) / 2 + 6 }));
  const forests = layout.forests.map((f) => ({ ...f, cos: Math.cos(f.rotation ?? 0), sin: Math.sin(f.rotation ?? 0), st: f.stretch ?? 1, r: f.radius * (f.stretch ?? 1) * 1.3 }));
  const ponds = layout.ponds.map((p, i) => ({ ...p, i, r: p.radius + 14 }));
  const TILE = 128, TN = Math.ceil((CLS * CLS_CELL) / TILE);
  type Bucket = { fields: typeof fields; patches: typeof patches; forests: typeof forests; ponds: typeof ponds };
  const buckets: Bucket[] = [];
  for (let ty = 0; ty < TN; ty++)
    for (let tx = 0; tx < TN; tx++) {
      const cx = (tx + 0.5) * TILE, cz = (ty + 0.5) * TILE, half = TILE * 0.71;
      const near = (o: { x: number; z: number; r: number }) => hyp(o.x - cx, o.z - cz) < o.r + half;
      buckets.push({ fields: fields.filter(near), patches: patches.filter(near), forests: forests.filter(near), ponds: ponds.filter(near) });
    }
  // Coarse (8 m) noise grids, sampled bilinearly per cell.
  const G = (CLS * CLS_CELL) / 8 + 1;
  const grid = (fn: (x: number, z: number) => number) => {
    const a = new Float32Array(G * G);
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) a[j * G + i] = fn(i * 8, j * 8);
    return a;
  };
  const nClearing = grid((x, z) => noise.fbm(x, z, 150, 3));
  const nSparse = grid((x, z) => noise.fbm(x + 300, z, 90, 2));
  const nDry = grid((x, z) => noise.fbm(x - 700, z + 200, 380, 3));
  const nWorn = grid((x, z) => noise.fbm(x + 50, z - 80, 60, 3));
  const nSandy = grid((x, z) => noise.fbm(x, z, 70, 2));
  const nBeach = grid((x, z) => noise.fbm(x, z + 999, 220, 2));
  const nEdge = grid((x, z) => noise.noise(x / 110 + 3, z / 110 + 9));
  const nCover = grid((x, z) => noise.noise(x / 40, z / 40));
  const sampleG = (a: Float32Array, x: number, z: number) => {
    const fx = x / 8, fz = z / 8;
    const i = Math.min(G - 2, fx | 0), j = Math.min(G - 2, fz | 0);
    const tx = fx - i, tz = fz - j;
    const o = j * G + i;
    return (a[o] * (1 - tx) + a[o + 1] * tx) * (1 - tz) + (a[o + G] * (1 - tx) + a[o + G + 1] * tx) * tz;
  };
  const q = layout.quarry;
  const qc = Math.cos(q.rotation), qs = Math.sin(q.rotation);
  const qR = Math.max(q.rx, q.rz) * 1.6;
  const lotYard = new Uint8Array(MM); // 1 = village/farm yard (dirt), 2 = industrial/military (gravel)
  for (const lot of layout.lots) {
    const f = BUILDING_FOOTPRINTS[lot.type];
    const industrial = /warehouse|factory|military|hangar|watchtower|gas_station|police|hospital|school|apartment/.test(lot.type);
    const hw = f.w / 2 + 4, hd = f.d / 2 + 4;
    const cos = Math.cos(lot.rotationY), sin = Math.sin(lot.rotationY);
    const R = hyp(hw, hd) + 6;
    const C = CLS_CELL;
    const i0 = Math.max(0, Math.floor((lot.x - R) / C)), i1 = Math.min(CLS - 1, Math.floor((lot.x + R) / C));
    const j0 = Math.max(0, Math.floor((lot.z - R) / C)), j1 = Math.min(CLS - 1, Math.floor((lot.z + R) / C));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const sd = rectSd((i + 0.5) * C, (j + 0.5) * C, lot.x, lot.z, hw, hd, cos, sin);
        if (sd < noise.noise(i * 0.61, j * 0.57) * 3) lotYard[j * CLS + i] = industrial ? 2 : 1;
      }
  }
  const stackL = new Uint8Array(32);
  const stackA = new Float32Array(32);
  let ns = 0;
  const over = (layer: number, a: number) => {
    if (a <= 0) return;
    stackL[ns] = layer;
    stackA[ns++] = a > 1 ? 1 : a;
  };

  // 4 m cells: the center of cell (i, j) is exactly height sample (2i+1, 2j+1).
  for (let j = 0; j < CLS; j++) {
    const z = (j + 0.5) * CLS_CELL;
    for (let i = 0; i < CLS; i++) {
      const x = (i + 0.5) * CLS_CELL;
      const c = j * CLS + i;
      const sc = (2 * j + 1) * N + (2 * i + 1);
      const hh = h[sc];
      const ny = (normals[sc * 4 + 1] / 255) * 2 - 1;
      const cd = coast[sc];
      const rd = river.dist[sc];
      const redge = Number.isFinite(rd) ? rd - river.halfW[sc] : 1e9;
      let roadEdge = roads.edge[sc], roadKind = roads.kind[sc];
      if (roads.edge[sc - N - 1] < roadEdge) (roadEdge = roads.edge[sc - N - 1]), (roadKind = roads.kind[sc - N - 1]);
      if (roads.edge[sc - N + 1] < roadEdge) (roadEdge = roads.edge[sc - N + 1]), (roadKind = roads.kind[sc - N + 1]);
      if (roads.edge[sc + N - 1] < roadEdge) (roadEdge = roads.edge[sc + N - 1]), (roadKind = roads.kind[sc + N - 1]);
      if (roads.edge[sc + N + 1] < roadEdge) (roadEdge = roads.edge[sc + N + 1]), (roadKind = roads.kind[sc + N + 1]);
      const r0 = 2 * j * M + 2 * i;
      const resv = Math.min(reserved[r0], reserved[r0 + 1], reserved[r0 + M], reserved[r0 + M + 1]) / 10;
      const flatS = flat[sc];

      const bucket = buckets[Math.min(TN - 1, (z / TILE) | 0) * TN + Math.min(TN - 1, (x / TILE) | 0)];
      // ── tree density ──────────────────────────────────────────────────
      let f = 0;
      if (bucket.forests.length) {
        const edgeN = sampleG(nEdge, x, z) * 0.25;
        for (const fo of bucket.forests) {
          const dx = x - fo.x, dz = z - fo.z;
          const lx = (dx * fo.cos - dz * fo.sin) / fo.st, lz = dx * fo.sin + dz * fo.cos;
          const dn = Math.sqrt(lx * lx + lz * lz) / fo.radius + edgeN;
          if (dn < 1) f = Math.max(f, fo.density * (1 - sstep(0.5, 1, dn)));
        }
      }
      f *= 0.45 + 0.55 * sstep(-0.45, 0.15, sampleG(nClearing, x, z));
      f = Math.max(f, 0.04 * sstep(0.15, 0.55, sampleG(nSparse, x, z)));
      f *= sstep(36, 80, cd);
      f *= sstep(6, 22, redge);
      f *= sstep(3.5, 10, resv);
      f *= sstep(0.72, 0.84, ny);
      f *= 1 - 0.88 * flatS;

      // ── layer weights ─────────────────────────────────────────────────
      // base meadow: lush vs dry grass; other layers are composited "over" it (resolved top-down below)
      const dry = Math.min(1, sstep(0.05, 0.55, sampleG(nDry, x, z)) * 0.65 + sstep(50, 100, hh) * 0.35 + (1 - ny) * 0.6);
      ns = 0;
      // forest floor
      over(2, sstep(0.32, 0.6, f));
      // fields
      let inField = false;
      for (const fl of bucket.fields) {
        const sd = rectSd(x, z, fl.x, fl.z, fl.w / 2, fl.d / 2, fl.cos, fl.sin);
        if (sd > 6) continue;
        const a = sstep(4, -2, sd + noise.noise(x / 9, z / 9) * 2);
        if (a > 0.5) inField = true;
        if (fl.crop === 'plowed') over(8, a);
        else if (fl.crop === 'wheat') {
          over(1, a);
          over(8, a * 0.35);
        } else {
          over(0, a);
          over(8, a * 0.2);
        }
      }
      if (inField) f = 0;
      // worn dirt patches in meadows
      over(3, 0.5 * sstep(0.55, 0.85, sampleG(nWorn, x, z)) * (1 - flatS * 0.5));
      // lot yards
      const yard = lotYard[c];
      if (yard === 1) over(3, 0.45);
      else if (yard === 2) over(7, 0.6);
      if (pad[sc]) over(yard === 2 ? 7 : 3, 0.9);
      // road shoulders
      if (roadKind === 2) over(3, sstep(2.2, -0.5, roadEdge));
      // (asphalt shoulders are drawn by the road ribbon itself: a 1-2 m strip aliases into spots on the 4 m splat)
      // ground patches
      for (const p of bucket.patches) {
        const sd = rectSd(x, z, p.x, p.z, p.w / 2, p.d / 2, p.cos, p.sin);
        if (sd > 4) continue;
        const a = sstep(3, -1, sd + noise.noise(x / 7, z / 7) * 2.5);
        const layer = p.surface === 'dirt' ? 3 : p.surface === 'mud' ? 4 : p.surface === 'sand' ? 6 : 7;
        over(layer, a);
      }
      // quarry floor gravel
      if (Math.abs(x - q.x) < qR && Math.abs(z - q.z) < qR) {
        const dx = x - q.x, dz = z - q.z;
        const lx = dx * qc - dz * qs, lz = dx * qs + dz * qc;
        const e = Math.pow(Math.pow(Math.abs(lx) / q.rx, 4) + Math.pow(Math.abs(lz) / q.rz, 4), 0.25);
        if (e < 1.5) {
          over(7, sstep(1.45, 1.0, e));
          f *= sstep(1.2, 1.6, e);
        }
      }
      // river banks: mud and sand
      if (redge < 12) {
        const sandy = sstep(-0.2, 0.4, sampleG(nSandy, x, z));
        const bank = sstep(9, 1.5, redge);
        over(4, bank * (1 - sandy) * 0.9);
        over(6, bank * sandy);
      }
      // ponds
      for (const p of bucket.ponds) {
        const d = hyp(x - p.x, z - p.z);
        if (d < p.radius + 12) over(4, sstep(p.radius + 10, p.radius + 2, d) * 0.85);
      }
      // beaches / seabed: sandy stretches alternate with grassy/rocky shores
      if (cd < 90) {
        const beachW = Math.max(0, 12 + 46 * sampleG(nBeach, x, z));
        over(6, sstep(beachW + 6, beachW - 6, cd) * sstep(5.5, 3.2, hh));
        if (cd < 2) over(6, sstep(2, -6, cd) * 0.85); // seabed / wet shoreline
        else over(3, 0.45 * sstep(10, 2, cd) * (1 - sstep(4, 14, beachW))); // pebbly shore where there is no beach
      }
      // rock on steep slopes (and cliff faces)
      const rock = sstep(0.82, 0.68, ny + noise.noise(x / 13, z / 13) * 0.04);
      over(5, rock);
      if (rock > 0.5) f = 0;

      // resolve the layer stack: later layers cover earlier ones
      w.fill(0);
      let rem = 1;
      for (let k = ns - 1; k >= 0 && rem > 1e-4; k--) {
        const a = stackA[k];
        w[stackL[k]] += a * rem;
        rem *= 1 - a;
      }
      w[0] += (1 - dry) * rem;
      w[1] += dry * rem;

      // ── surface class ─────────────────────────────────────────────────
      let best = 0, bw = -1;
      for (let k = 0; k < L; k++)
        if (w[k] > bw) {
          bw = w[k];
          best = k;
        }
      let s: number;
      switch (best) {
        case 0: s = Surf.Grass; break;
        case 1: s = Surf.DryGrass; break;
        case 2: s = Surf.Forest; break;
        case 3: s = Surf.Dirt; break;
        case 4: s = Surf.Mud; break;
        case 5: s = Surf.Rock; break;
        case 6: s = Surf.Sand; break;
        case 7: s = Surf.Gravel; break;
        default: s = Surf.Field;
      }
      for (const p of bucket.patches) {
        if (p.surface !== 'concrete') continue;
        if (rectSd(x, z, p.x, p.z, p.w / 2, p.d / 2, p.cos, p.sin) < 0) s = Surf.Concrete;
      }
      if (roadEdge < 0 && roadKind === 1) s = Surf.Asphalt;
      else if (roadEdge < 0 && roadKind === 2) s = Surf.Dirt;
      let water = hh < -0.05 && (cd < 30 || redge < 2);
      for (const p of bucket.ponds) if (hyp(x - p.x, z - p.z) < p.radius + 3 && hh < inp.pondLevels[p.i]) water = true;
      if (water) s = Surf.Water;
      surface[c] = s;

      // ── ground cover ──────────────────────────────────────────────────
      let cv = (0.72 + 0.2 * sampleG(nCover, x, z)) * (w[0] + w[1] * 1.1) + 0.38 * w[2] + 0.12 * w[8];
      for (const fl of bucket.fields) {
        if (rectSd(x, z, fl.x, fl.z, fl.w / 2, fl.d / 2, fl.cos, fl.sin) < 0) cv = fl.crop === 'wheat' ? 1 : fl.crop === 'green' ? 0.9 : 0.12;
      }
      cv *= sstep(0.3, 2.5, resv + 0.3);
      if (water || hh < 0.2) cv = 0;
      cover[c] = Math.round(Math.min(1, Math.max(0, cv)) * 255);
      tree[c] = water ? 0 : Math.round(Math.min(1, Math.max(0, f)) * 255);

      const o = c * 4;
      splatA[o] = Math.round(w[1] * 255);
      splatA[o + 1] = Math.round(w[2] * 255);
      splatA[o + 2] = Math.round(w[3] * 255);
      splatA[o + 3] = Math.round(w[4] * 255);
      splatB[o] = Math.round(w[5] * 255);
      splatB[o + 1] = Math.round(w[6] * 255);
      splatB[o + 2] = Math.round(w[7] * 255);
      splatB[o + 3] = Math.round(w[8] * 255);
    }
  }
  return { surface, splatA, splatB, tree, cover };
}
