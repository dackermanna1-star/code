import { CHUNK_SIZE } from '../shared/constants';
import { Chunk, chunkKey, rleDecode, rleEncode, VoxelWorld } from '../shared/world/chunk';
import { WorldGenerator } from '../shared/world/worldgen';
import type { WorldStorage } from './storage';

/**
 * Authoritative voxel world. Chunks come from (1) the save if the chunk was
 * ever edited, otherwise (2) the procedural generator. Generation of new
 * chunks is budgeted per tick (`budgetMs`) so streaming never stalls the
 * simulation; systems that must touch a far-away block use `ensureSync`.
 * Unloaded chunks read as solid so nothing can fall or move into them.
 */
export class SimWorld extends VoxelWorld {
  readonly gen: WorldGenerator;
  /** chunk key -> last time (ms) the player needed it */
  readonly lastNeeded = new Map<number, number>();
  /** Revision persisted by the last completed save, per chunk. */
  readonly savedRev = new Map<number, number>();
  /** Block changes waiting to be replicated: chunk key -> list */
  readonly pending = new Map<number, Array<[number, number, number, number]>>();
  /** Called once for chunks produced by the generator (never for loaded saves). */
  onFreshChunk: ((c: Chunk) => void) | null = null;
  stats = { fromSave: 0, generated: 0, syncGenerated: 0, unloaded: 0, genMs: 0 };
  private budgetLeft = 0;

  constructor(readonly seed: number, private storage: WorldStorage, private budgetMs = 25) {
    super(1);
    this.gen = new WorldGenerator(seed);
  }

  /** Reset the per-tick generation budget. */
  beginTick() {
    this.budgetLeft = this.budgetMs;
  }

  isLoaded(cx: number, cz: number) {
    return this.chunks.has(chunkKey(cx, cz));
  }

  /** Load or (budget permitting) generate a chunk. Returns true if it is available now. */
  request(cx: number, cz: number): boolean {
    const key = chunkKey(cx, cz);
    this.lastNeeded.set(key, Date.now());
    if (this.chunks.has(key)) return true;
    const saved = this.storage.loadChunk(key);
    if (saved) {
      this.install(new Chunk(cx, cz, rleDecode(saved.data)), saved.rev, false);
      this.stats.fromSave++;
      return true;
    }
    if (this.budgetLeft <= 0) return false;
    const t0 = performance.now();
    const data = this.gen.generateChunk(cx, cz);
    const ms = performance.now() - t0;
    this.budgetLeft -= ms;
    this.stats.genMs += ms;
    this.stats.generated++;
    this.install(new Chunk(cx, cz, data), 0, true);
    return true;
  }

  /** Load or generate immediately, ignoring the budget. */
  ensureSync(cx: number, cz: number): Chunk {
    const key = chunkKey(cx, cz);
    const have = this.chunks.get(key);
    if (have) return have;
    const saved = this.storage.loadChunk(key);
    if (saved) {
      this.stats.fromSave++;
      return this.install(new Chunk(cx, cz, rleDecode(saved.data)), saved.rev, false);
    }
    this.stats.syncGenerated++;
    return this.install(new Chunk(cx, cz, this.gen.generateChunk(cx, cz)), 0, true);
  }

  ensureSyncAt(x: number, z: number) {
    return this.ensureSync(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE));
  }

  private install(c: Chunk, rev: number, fresh: boolean): Chunk {
    c.rev = rev;
    c.edited = !fresh;
    this.savedRev.set(c.key, rev);
    this.addChunk(c);
    if (fresh && this.onFreshChunk) this.onFreshChunk(c);
    return c;
  }

  /** Set a block and queue the change for replication. Loads the chunk if needed. */
  set(x: number, y: number, z: number, id: number): boolean {
    this.ensureSyncAt(x, z);
    if (this.getBlock(x, y, z) === id) return true;
    if (!this.setBlock(x, y, z, id)) return false;
    const key = chunkKey(x >> 4, z >> 4);
    let list = this.pending.get(key);
    if (!list) this.pending.set(key, (list = []));
    list.push([x, y, z, id]);
    return true;
  }

  /** Chunks that changed since the last save. */
  dirtyChunks(): Chunk[] {
    const out: Chunk[] = [];
    for (const c of this.chunks.values()) if (c.edited && this.savedRev.get(c.key) !== c.rev) out.push(c);
    return out;
  }

  markSaved(saved: Array<{ key: number; rev: number }>) {
    for (const c of saved) this.savedRev.set(c.key, c.rev);
  }

  encodeForSave(c: Chunk) {
    return { key: c.key, cx: c.cx, cz: c.cz, rev: c.rev, data: rleEncode(c.blocks) };
  }

  /** Unload chunks not needed for `idleMs`, unless they hold unsaved edits. */
  unloadIdle(idleMs: number, keep: Set<number>) {
    const now = Date.now();
    for (const [key, c] of this.chunks) {
      if (keep.has(key)) continue;
      if (now - (this.lastNeeded.get(key) ?? 0) < idleMs) continue;
      if (c.edited && this.savedRev.get(key) !== c.rev) continue;
      this.chunks.delete(key);
      this.lastNeeded.delete(key);
      this.stats.unloaded++;
    }
  }
}
