// Per-material 16x16x16 periodic "pixel art" patterns, packed into one atlas texture.
// Noita's materials are textured pixel by pixel; here each voxel face takes the colour of its voxel's
// pattern cell, giving a dense hand-painted look even with greedy-merged geometry.
import { hash4 } from '../core/rng';
import { MATERIALS, MaterialDef, Kind } from '../world/materials';

export const PATTERN_SIZE = 16;
export const ATLAS_W = PATTERN_SIZE * PATTERN_SIZE; // x + z*16
export const ATLAS_H = PATTERN_SIZE * 256; // y + mat*16

export function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function pnoise(x: number, y: number, z: number, cell: number, seed: number): number {
  // periodic value noise with period 16
  const P = PATTERN_SIZE / cell;
  const fx = x / cell, fy = y / cell, fz = z / cell;
  const ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz);
  const tx = fx - ix, ty = fy - iy, tz = fz - iz;
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty), sz = tz * tz * (3 - 2 * tz);
  const h = (a: number, b: number, c: number) => (hash4(((a % P) + P) % P, ((b % P) + P) % P, ((c % P) + P) % P, seed) & 0xffff) / 0xffff;
  const c000 = h(ix, iy, iz), c100 = h(ix + 1, iy, iz), c010 = h(ix, iy + 1, iz), c110 = h(ix + 1, iy + 1, iz);
  const c001 = h(ix, iy, iz + 1), c101 = h(ix + 1, iy, iz + 1), c011 = h(ix, iy + 1, iz + 1), c111 = h(ix + 1, iy + 1, iz + 1);
  const a = c000 + (c100 - c000) * sx, b = c010 + (c110 - c010) * sx;
  const c = c001 + (c101 - c001) * sx, d = c011 + (c111 - c011) * sx;
  const e = a + (b - a) * sy, f = c + (d - c) * sy;
  return e + (f - e) * sz;
}

function rnd(x: number, y: number, z: number, seed: number): number {
  return (hash4(x, y, z, seed) & 0xffff) / 0xffff;
}

/** Returns palette index for a pattern cell. */
function patternIndex(m: MaterialDef, id: number, x: number, y: number, z: number): number {
  const n = m.colors.length;
  const seed = id * 7919 + 13;
  const r = rnd(x, y, z, seed);
  switch (m.pattern ?? 'noise') {
    case 'flat':
      return r < 0.85 ? 0 : 1 % n;
    case 'noise': {
      // weighted toward the first colour
      const t = Math.pow(r, 1.6);
      return Math.min(n - 1, Math.floor(t * n));
    }
    case 'blotch': {
      const v = pnoise(x, y, z, 8, seed) * 0.65 + pnoise(x, y, z, 4, seed + 1) * 0.35;
      if (r > 0.94) return n - 1; // speck
      if (r < 0.04) return Math.min(n - 1, 4);
      const k = Math.min(3, n - 1);
      return Math.min(k, Math.floor(v * (k + 1)));
    }
    case 'dots': {
      // rock with darker roundish spots and pale rims
      const v = pnoise(x, y, z, 4, seed);
      const w = pnoise(x, y, z, 8, seed + 3);
      if (v > 0.7) return 3 % n;
      if (v > 0.62) return 2 % n;
      if (v < 0.18 && r > 0.4) return 4 % n;
      return w > 0.55 ? 1 : 0;
    }
    case 'planks': {
      const board = Math.floor(y / 4);
      if (y % 4 === 3) return 3 % n; // seam
      const grain = pnoise(x * 0.25 + board * 3, y, z * 0.25 + board * 5, 4, seed);
      const base = (hash4(board, 0, 0, seed) & 3) % Math.max(1, n - 2);
      return grain > 0.7 ? (base + 1) % n : grain < 0.25 ? 4 % n : base;
    }
    case 'bricks': {
      const row = Math.floor(y / 4);
      const off = (row & 1) * 4;
      if (y % 4 === 0) return n - 1; // mortar
      if ((x + off) % 8 === 0 || (z + off) % 8 === 0) return n - 1;
      const brick = hash4(Math.floor((x + off) / 8), row, Math.floor((z + off) / 8), seed) % (n - 1);
      return r > 0.92 ? (brick + 1) % (n - 1) : brick;
    }
    case 'crystal': {
      const v = pnoise(x, y, z, 4, seed);
      const k = Math.floor(v * 4);
      return Math.min(n - 1, k);
    }
    case 'speckle': {
      if (r > 0.9) return 3 % n;
      if (r > 0.8) return 1;
      if (r < 0.06) return 4 % n;
      return pnoise(x, y, z, 4, seed) > 0.6 ? 2 % n : 0;
    }
    case 'strata': {
      const band = Math.floor((y + pnoise(x, 0, z, 8, seed) * 3) / 2);
      const idx = hash4(band, 1, 1, seed) % n;
      return r > 0.93 ? (idx + 1) % n : idx;
    }
    case 'plates': {
      const px = x % 8, pz = z % 8, py = y % 8;
      if (px === 0 || pz === 0 || py === 0) return 2 % n;
      if ((px === 1 || px === 7) && (pz === 1 || pz === 7)) return 3 % n; // rivets
      return r > 0.85 ? 1 : 0;
    }
  }
  return 0;
}

export interface MaterialInfoTex {
  atlas: Uint8Array; // RGBA ATLAS_W x ATLAS_H
  info: Uint8Array; // RGBA 256 x 1: alpha, glow, flags, kind
}

export const FLAG_ORGANIC = 1; // random per-tile offset to hide repetition
export const FLAG_LIQUID = 2;
export const FLAG_FIRE = 4;
export const FLAG_GAS = 8;
export const FLAG_SHIMMER = 16;

export function buildMaterialTextures(): MaterialInfoTex {
  const atlas = new Uint8Array(ATLAS_W * ATLAS_H * 4);
  const info = new Uint8Array(256 * 4);
  MATERIALS.forEach((m, id) => {
    const pal = m.colors.map(hexToRgb);
    for (let y = 0; y < PATTERN_SIZE; y++)
      for (let z = 0; z < PATTERN_SIZE; z++)
        for (let x = 0; x < PATTERN_SIZE; x++) {
          const pi = patternIndex(m, id, x, y, z) % pal.length;
          const c = pal[pi];
          const o = ((y + id * PATTERN_SIZE) * ATLAS_W + x + z * PATTERN_SIZE) * 4;
          atlas[o] = c[0];
          atlas[o + 1] = c[1];
          atlas[o + 2] = c[2];
          atlas[o + 3] = 255;
        }
    const organic = ['noise', 'blotch', 'dots', 'speckle', 'crystal'].includes(m.pattern ?? 'noise');
    let flags = organic ? FLAG_ORGANIC : 0;
    if (m.kind === Kind.LIQUID) flags |= FLAG_LIQUID | FLAG_SHIMMER;
    if (m.kind === Kind.FIRE) flags |= FLAG_FIRE;
    if (m.kind === Kind.GAS) flags |= FLAG_GAS;
    info[id * 4] = Math.round((m.alpha ?? 1) * 255);
    info[id * 4 + 1] = Math.round((m.glow ?? 0) * 255);
    info[id * 4 + 2] = flags;
    info[id * 4 + 3] = m.kind;
  });
  return { atlas, info };
}
