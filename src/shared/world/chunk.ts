import { CHUNK_AREA, CHUNK_MASK, CHUNK_SHIFT, CHUNK_SIZE, CHUNK_VOLUME, WORLD_HEIGHT } from '../constants';
import { SOLID } from './blocks';

/** Index of a block inside a column chunk. x/z in [0,16), y in [0,WORLD_HEIGHT). */
export const cidx = (x: number, y: number, z: number) => x | (z << CHUNK_SHIFT) | (y << 8);

/** Numeric chunk key (faster than strings in Maps). Valid for |cx|,|cz| < 32768. */
export const chunkKey = (cx: number, cz: number) => (cx + 32768) * 65536 + (cz + 32768);
export const chunkKeyX = (k: number) => Math.floor(k / 65536) - 32768;
export const chunkKeyZ = (k: number) => (k % 65536) - 32768;

export const toChunk = (v: number) => v >> CHUNK_SHIFT;
export const toLocal = (v: number) => v & CHUNK_MASK;

export class Chunk {
  readonly blocks: Uint8Array;
  /** Incremented on every modification; used for persistence and client sync. */
  rev = 0;
  /** Modified since generation (must be persisted). */
  edited = false;

  constructor(readonly cx: number, readonly cz: number, blocks?: Uint8Array) {
    this.blocks = blocks ?? new Uint8Array(CHUNK_VOLUME);
    if (this.blocks.length !== CHUNK_VOLUME) throw new Error(`Bad chunk buffer length ${this.blocks.length}`);
  }

  get key() {
    return chunkKey(this.cx, this.cz);
  }

  get(x: number, y: number, z: number): number {
    if (y < 0 || y >= WORLD_HEIGHT) return 0;
    return this.blocks[cidx(x, y, z)];
  }

  set(x: number, y: number, z: number, id: number) {
    if (y < 0 || y >= WORLD_HEIGHT) return;
    this.blocks[cidx(x, y, z)] = id;
  }

  /** Highest solid y at local column, or -1. */
  topSolid(x: number, z: number): number {
    for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
      if (SOLID[this.blocks[cidx(x, y, z)]]) return y;
    }
    return -1;
  }
}

/** Anything that can answer world-space block queries (server world, client world, gen scratch). */
export interface BlockAccess {
  getBlock(x: number, y: number, z: number): number;
}

/**
 * Sparse world of loaded column chunks. Shared by server and client.
 * Unloaded chunks read as `unloadedValue` (server: bedrock-like solid so
 * nothing falls out of the world; client: air).
 */
export class VoxelWorld implements BlockAccess {
  readonly chunks = new Map<number, Chunk>();

  constructor(public unloadedValue = 0) {}

  getChunk(cx: number, cz: number): Chunk | undefined {
    return this.chunks.get(chunkKey(cx, cz));
  }

  hasChunkAt(x: number, z: number) {
    return this.chunks.has(chunkKey(x >> CHUNK_SHIFT, z >> CHUNK_SHIFT));
  }

  addChunk(c: Chunk) {
    this.chunks.set(c.key, c);
  }

  removeChunk(cx: number, cz: number) {
    this.chunks.delete(chunkKey(cx, cz));
  }

  getBlock(x: number, y: number, z: number): number {
    if (y < 0) return 1; // below world = bedrock
    if (y >= WORLD_HEIGHT) return 0;
    const c = this.chunks.get(chunkKey(x >> CHUNK_SHIFT, z >> CHUNK_SHIFT));
    if (!c) return this.unloadedValue;
    return c.blocks[(x & CHUNK_MASK) | ((z & CHUNK_MASK) << CHUNK_SHIFT) | (y << 8)];
  }

  /** Returns false if the chunk is not loaded or y out of range. */
  setBlock(x: number, y: number, z: number, id: number): boolean {
    if (y < 0 || y >= WORLD_HEIGHT) return false;
    const c = this.chunks.get(chunkKey(x >> CHUNK_SHIFT, z >> CHUNK_SHIFT));
    if (!c) return false;
    c.blocks[(x & CHUNK_MASK) | ((z & CHUNK_MASK) << CHUNK_SHIFT) | (y << 8)] = id;
    c.rev++;
    c.edited = true;
    return true;
  }

  isSolid(x: number, y: number, z: number) {
    return SOLID[this.getBlock(x, y, z)] === 1;
  }

  /** Highest solid block y at world column (x,z), or -1 if none / unloaded. */
  topSolid(x: number, z: number): number {
    const c = this.chunks.get(chunkKey(x >> CHUNK_SHIFT, z >> CHUNK_SHIFT));
    if (!c) return -1;
    return c.topSolid(x & CHUNK_MASK, z & CHUNK_MASK);
  }
}

// --- Compact run-length codec for persistence & network --------------------
// Format: repeated [blockId:u8][runLength: LEB128 varint].

export function rleEncode(data: Uint8Array): Uint8Array {
  const out: number[] = [];
  let i = 0;
  while (i < data.length) {
    const v = data[i];
    let run = 1;
    while (i + run < data.length && data[i + run] === v) run++;
    out.push(v);
    let r = run;
    while (r >= 0x80) {
      out.push((r & 0x7f) | 0x80);
      r >>>= 7;
    }
    out.push(r);
    i += run;
  }
  return Uint8Array.from(out);
}

export function rleDecode(src: Uint8Array, expectedLength = CHUNK_VOLUME, offset = 0): Uint8Array {
  const out = new Uint8Array(expectedLength);
  let o = 0;
  let i = offset;
  while (i < src.length && o < expectedLength) {
    const v = src[i++];
    let run = 0;
    let shift = 0;
    for (;;) {
      if (i >= src.length) throw new Error('RLE: truncated varint');
      const b = src[i++];
      run |= (b & 0x7f) << shift;
      if (!(b & 0x80)) break;
      shift += 7;
      if (shift > 28) throw new Error('RLE: varint too long');
    }
    if (o + run > expectedLength) throw new Error('RLE: run overflows buffer');
    out.fill(v, o, o + run);
    o += run;
  }
  if (o !== expectedLength) throw new Error(`RLE: decoded ${o} of ${expectedLength} bytes`);
  return out;
}

export { CHUNK_SIZE, CHUNK_AREA, CHUNK_VOLUME, WORLD_HEIGHT };
