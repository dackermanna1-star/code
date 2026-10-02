/**
 * Helpers that turn a generator's working buffers into a transferable `GeneratedChunk`.
 * Working layout: one Uint16Array(65536) per chunk column with index (y << 8) | (z << 4) | x —
 * identical to the concatenation of the 16 section arrays.
 */
import type { GeneratedChunk } from '../../chunk';
import { BIOMES, biomeGrassColor, biomeFoliageColor } from '../../biomes';
import { BLOCKS_HEIGHTMAP as BLOCKS_HEIGHTMAP_ } from './states';

const BLOCKS_HEIGHTMAP = BLOCKS_HEIGHTMAP_;

export const COLUMN_VOLUME = 65536;
export const idx = (x: number, y: number, z: number) => (y << 8) | (z << 4) | x;

/** Copies the working column into 16 section arrays (null when empty). */
export function toSections(work: Uint16Array): (Uint16Array | null)[] {
  const out: (Uint16Array | null)[] = new Array(16).fill(null);
  for (let sy = 0; sy < 16; sy++) {
    const off = sy * 4096;
    let any = false;
    for (let i = off, e = off + 4096; i < e; i++) {
      if (work[i] !== 0) { any = true; break; }
    }
    if (any) out[sy] = work.slice(off, off + 4096);
  }
  return out;
}

/** heightmap = y of highest non-air, light-blocking-or-liquid block + 1 (0 if none). */
export function computeHeightmap(work: Uint16Array): Int16Array {
  const hm = new Int16Array(256);
  for (let c = 0; c < 256; c++) {
    let h = 0;
    for (let y = 255; y >= 0; y--) {
      const s = work[(y << 8) | c];
      if (s !== 0 && BLOCKS_HEIGHTMAP[s >>> 4] === 1) { h = y + 1; break; }
    }
    hm[c] = h;
  }
  return hm;
}

const GRASS_RGB: number[] = [];
const FOLIAGE_RGB: number[] = [];
const WATER_RGB: number[] = [];
for (const b of BIOMES) {
  GRASS_RGB[b.id] = biomeGrassColor(b);
  FOLIAGE_RGB[b.id] = biomeFoliageColor(b);
  WATER_RGB[b.id] = b.water;
}

/**
 * Blended biome colours: box average over a (2r+1)^2 neighbourhood of per-block biomes.
 * `biomeAt` is called for the padded area (16 + 2r)^2 in world coordinates.
 */
export function blendBiomeColors(
  cx: number,
  cz: number,
  r: number,
  biomeAt: (x: number, z: number) => number,
  biomesOut: Uint8Array,
): { grass: Uint32Array; foliage: Uint32Array; water: Uint32Array } {
  const W = 16 + 2 * r;
  const ids = new Uint8Array(W * W);
  const x0 = cx * 16 - r, z0 = cz * 16 - r;
  for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) ids[j * W + i] = biomeAt(x0 + i, z0 + j);
  for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) biomesOut[(z << 4) | x] = ids[(z + r) * W + x + r];
  const grass = new Uint32Array(256), foliage = new Uint32Array(256), water = new Uint32Array(256);
  const n = (2 * r + 1) * (2 * r + 1);
  for (let z = 0; z < 16; z++) {
    for (let x = 0; x < 16; x++) {
      let gr = 0, gg = 0, gb = 0, fr = 0, fg = 0, fb = 0, wr = 0, wg = 0, wb = 0;
      for (let dz = -r; dz <= r; dz++) {
        const row = (z + r + dz) * W + x + r;
        for (let dx = -r; dx <= r; dx++) {
          const b = ids[row + dx];
          const g = GRASS_RGB[b], f = FOLIAGE_RGB[b], w = WATER_RGB[b];
          gr += g >> 16; gg += (g >> 8) & 255; gb += g & 255;
          fr += f >> 16; fg += (f >> 8) & 255; fb += f & 255;
          wr += w >> 16; wg += (w >> 8) & 255; wb += w & 255;
        }
      }
      const c = (z << 4) | x;
      grass[c] = (Math.round(gr / n) << 16) | (Math.round(gg / n) << 8) | Math.round(gb / n);
      foliage[c] = (Math.round(fr / n) << 16) | (Math.round(fg / n) << 8) | Math.round(fb / n);
      water[c] = (Math.round(wr / n) << 16) | (Math.round(wg / n) << 8) | Math.round(wb / n);
    }
  }
  return { grass, foliage, water };
}

/** Uniform colours (e.g. Nether / End). */
export function uniformColors(biome: number) {
  const b = BIOMES[biome];
  return {
    grass: new Uint32Array(256).fill(biomeGrassColor(b)),
    foliage: new Uint32Array(256).fill(biomeFoliageColor(b)),
    water: new Uint32Array(256).fill(b.water),
  };
}

export function finishChunk(
  cx: number,
  cz: number,
  work: Uint16Array,
  biomes: Uint8Array,
  colors: { grass: Uint32Array; foliage: Uint32Array; water: Uint32Array },
  blockEntities: { x: number; y: number; z: number; data: any }[],
  entities: { type: string; x: number; y: number; z: number; data?: any }[],
): GeneratedChunk {
  const out: GeneratedChunk = {
    cx,
    cz,
    blocks: toSections(work),
    biomes,
    heightmap: computeHeightmap(work),
    grassColor: colors.grass,
    foliageColor: colors.foliage,
    waterColor: colors.water,
  };
  if (blockEntities.length) out.blockEntities = blockEntities;
  if (entities.length) out.entities = entities;
  return out;
}
