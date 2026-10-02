import { CHUNK_SIZE, SECTIONS_PER_CHUNK, SECTION_VOLUME, WORLD_HEIGHT } from '../core/constants';

/**
 * A 16 x WORLD_HEIGHT x 16 column of blocks split into 16^3 sections.
 *
 * Block storage: per section a Uint16Array(4096) of block states, or null when the
 * section is entirely air. Index inside a section: (y << 8) | (z << 4) | x.
 *
 * Light storage: per section a Uint16Array(4096) packed as
 *   bits 12-15: sky light, bits 8-11: block light R, bits 4-7: G, bits 0-3: B
 * or null meaning "uniform" with the value in `lightFill[sy]` (used for all-sky
 * sections above the terrain and for not-yet-lit sections).
 */
export type ChunkStatus = 'empty' | 'generated' | 'lit' | 'ready';

export const SKY_SHIFT = 12;
export const packLight = (sky: number, r: number, g: number, b: number) => (sky << 12) | (r << 8) | (g << 4) | b;
export const lightSky = (l: number) => (l >>> 12) & 15;
export const lightR = (l: number) => (l >>> 8) & 15;
export const lightG = (l: number) => (l >>> 4) & 15;
export const lightB = (l: number) => l & 15;
export const FULL_SKY = 15 << 12;

export class Chunk {
  readonly cx: number;
  readonly cz: number;
  readonly blocks: (Uint16Array | null)[] = new Array(SECTIONS_PER_CHUNK).fill(null);
  readonly light: (Uint16Array | null)[] = new Array(SECTIONS_PER_CHUNK).fill(null);
  readonly lightFill = new Uint16Array(SECTIONS_PER_CHUNK);
  /** y of the highest light-blocking block + 1 per column (index z*16+x). */
  readonly heightmap = new Int16Array(CHUNK_SIZE * CHUNK_SIZE);
  /** Biome id per column (index z*16+x). */
  readonly biomes = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
  /** Blended biome colours per column as 0xRRGGBB: grass, foliage, water. */
  readonly grassColor = new Uint32Array(CHUNK_SIZE * CHUNK_SIZE);
  readonly foliageColor = new Uint32Array(CHUNK_SIZE * CHUNK_SIZE);
  readonly waterColor = new Uint32Array(CHUNK_SIZE * CHUNK_SIZE);
  status: ChunkStatus = 'empty';
  /** Set when the player changed something (needs saving). */
  modified = false;
  /** Per-section "needs remesh" flags. */
  readonly dirty = new Uint8Array(SECTIONS_PER_CHUNK);
  /** Block entity data keyed by local index (y<<8|z<<4|x within chunk column, y full height). */
  readonly blockEntities = new Map<number, any>();
  /** Arbitrary per-chunk data for systems (e.g. inhabited time, structure refs). */
  readonly data: Record<string, any> = {};

  constructor(cx: number, cz: number) {
    this.cx = cx;
    this.cz = cz;
  }

  static index(x: number, y: number, z: number) {
    return ((y & 15) << 8) | (z << 4) | x;
  }

  /** Local coordinates: 0<=x,z<16, 0<=y<WORLD_HEIGHT. */
  get(x: number, y: number, z: number): number {
    if (y < 0 || y >= WORLD_HEIGHT) return 0;
    const s = this.blocks[y >> 4];
    return s === null ? 0 : s[((y & 15) << 8) | (z << 4) | x];
  }

  set(x: number, y: number, z: number, state: number): void {
    if (y < 0 || y >= WORLD_HEIGHT) return;
    const sy = y >> 4;
    let s = this.blocks[sy];
    if (s === null) {
      if (state === 0) return;
      s = this.blocks[sy] = new Uint16Array(SECTION_VOLUME);
    }
    s[((y & 15) << 8) | (z << 4) | x] = state;
  }

  getLight(x: number, y: number, z: number): number {
    if (y >= WORLD_HEIGHT) return FULL_SKY;
    if (y < 0) return 0;
    const sy = y >> 4;
    const l = this.light[sy];
    return l === null ? this.lightFill[sy] : l[((y & 15) << 8) | (z << 4) | x];
  }

  setLight(x: number, y: number, z: number, v: number): void {
    if (y < 0 || y >= WORLD_HEIGHT) return;
    const sy = y >> 4;
    let l = this.light[sy];
    if (l === null) {
      if (v === this.lightFill[sy]) return;
      l = this.light[sy] = new Uint16Array(SECTION_VOLUME).fill(this.lightFill[sy]);
    }
    l[((y & 15) << 8) | (z << 4) | x] = v;
  }

  /** Index of the highest non-empty section + 1 (0 if empty). */
  topSection(): number {
    for (let sy = SECTIONS_PER_CHUNK - 1; sy >= 0; sy--) if (this.blocks[sy] !== null) return sy + 1;
    return 0;
  }

  /** Releases sections that became all-air. */
  compact(): void {
    for (let sy = 0; sy < SECTIONS_PER_CHUNK; sy++) {
      const s = this.blocks[sy];
      if (s === null) continue;
      let empty = true;
      for (let i = 0; i < SECTION_VOLUME; i++) if (s[i] !== 0) { empty = false; break; }
      if (empty) this.blocks[sy] = null;
    }
  }
}

/** Data produced by a world generator for one chunk column (transferable). */
export interface GeneratedChunk {
  cx: number;
  cz: number;
  /** 16 entries; null = all air. */
  blocks: (Uint16Array | null)[];
  biomes: Uint8Array;
  heightmap: Int16Array;
  grassColor: Uint32Array;
  foliageColor: Uint32Array;
  waterColor: Uint32Array;
  /** Block entities to create: [x, y, z (world coords), json data]. */
  blockEntities?: { x: number; y: number; z: number; data: any }[];
  /** Entities to spawn on first load (villagers, animals ...). */
  entities?: { type: string; x: number; y: number; z: number; data?: any }[];
}
