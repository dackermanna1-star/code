/**
 * Shared helpers for the world-generation tests (not a test file itself).
 */
import type { GeneratedChunk } from '../src/world/chunk';
import type { WorldGenerator } from '../src/world/gen/generator';
import { ChunkWriter } from '../src/world/gen/common/writer';

export const blockAt = (ch: GeneratedChunk, lx: number, y: number, lz: number): number => {
  if (y < 0 || y > 255) return 0;
  const s = ch.blocks[y >> 4];
  return s ? s[((y & 15) << 8) | (lz << 4) | lx] : 0;
};

/** A set of generated chunks addressable in world coordinates. */
export class GenWorld {
  readonly chunks = new Map<string, GeneratedChunk>();
  constructor(readonly gen: WorldGenerator) {}
  generate(cx: number, cz: number): GeneratedChunk {
    const k = `${cx},${cz}`;
    let ch = this.chunks.get(k);
    if (!ch) this.chunks.set(k, (ch = this.gen.generate(cx, cz)));
    return ch;
  }
  has(x: number, z: number): boolean {
    return this.chunks.has(`${Math.floor(x / 16)},${Math.floor(z / 16)}`);
  }
  get(x: number, y: number, z: number): number {
    const cx = Math.floor(x / 16), cz = Math.floor(z / 16);
    const ch = this.chunks.get(`${cx},${cz}`);
    if (!ch) return -1;
    return blockAt(ch, x - cx * 16, y, z - cz * 16);
  }
}

/** First difference between two generated chunks, or null when identical. */
export function chunkDiff(a: GeneratedChunk, b: GeneratedChunk): string | null {
  if (a.cx !== b.cx || a.cz !== b.cz) return 'coords';
  for (let s = 0; s < 16; s++) {
    const x = a.blocks[s], y = b.blocks[s];
    if (!x && !y) continue;
    if (!x || !y) return `section ${s} null mismatch`;
    for (let i = 0; i < 4096; i++) if (x[i] !== y[i]) return `section ${s} index ${i}: ${x[i]} vs ${y[i]}`;
  }
  const arr = (n: string, p: ArrayLike<number>, q: ArrayLike<number>) => {
    if (p.length !== q.length) return `${n} length`;
    for (let i = 0; i < p.length; i++) if (p[i] !== q[i]) return `${n}[${i}] ${p[i]} vs ${q[i]}`;
    return null;
  };
  return (
    arr('biomes', a.biomes, b.biomes) ??
    arr('heightmap', a.heightmap, b.heightmap) ??
    arr('grassColor', a.grassColor, b.grassColor) ??
    arr('foliageColor', a.foliageColor, b.foliageColor) ??
    arr('waterColor', a.waterColor, b.waterColor) ??
    (JSON.stringify(a.blockEntities ?? []) !== JSON.stringify(b.blockEntities ?? []) ? 'blockEntities' : null) ??
    (JSON.stringify(a.entities ?? []) !== JSON.stringify(b.entities ?? []) ? 'entities' : null)
  );
}

/** Writer that records every write in world coordinates without clipping (to grow a whole tree). */
export class RecordingWriter extends ChunkWriter {
  readonly blocks = new Map<string, number>();
  constructor() {
    super();
  }
  private k(x: number, y: number, z: number) {
    return `${x},${y},${z}`;
  }
  override inside(): boolean {
    return true;
  }
  override intersects(): boolean {
    return true;
  }
  override get(x: number, y: number, z: number): number {
    return this.blocks.get(this.k(x, y, z)) ?? 0;
  }
  override set(x: number, y: number, z: number, s: number): void {
    this.blocks.set(this.k(x, y, z), s);
  }
  override log(x: number, y: number, z: number, s: number): void {
    this.blocks.set(this.k(x, y, z), s);
  }
  override leaf(x: number, y: number, z: number, s: number): void {
    const cur = this.blocks.get(this.k(x, y, z));
    if (cur === undefined || cur === 0) this.blocks.set(this.k(x, y, z), s);
  }
  override air(x: number, y: number, z: number, s: number): void {
    if (!this.blocks.has(this.k(x, y, z))) this.blocks.set(this.k(x, y, z), s);
  }
}
