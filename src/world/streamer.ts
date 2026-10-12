// Chunk loading/unloading around the player. Generation runs in a worker pool when available.
// Unmodified chunks are dropped when far away and regenerated deterministically later; modified chunks
// are retained in memory so terrain changes persist for the whole run.
import { CHUNK, WORLD_CX, WORLD_CY, WORLD_CZ } from '../config';
import { Chunk } from './chunk';
import { Spawn, WorldGenerator } from './generator';
import { VoxelWorld, chunkKey } from './world';

export interface StreamerOptions {
  radiusH: number; // chunks
  radiusV: number;
  useWorkers: boolean;
}

export class ChunkStreamer {
  private workers: Worker[] = [];
  private nextWorker = 0;
  private inflight = new Map<number, number>(); // key -> request id
  private reqId = 1;
  private retained = new Map<number, Chunk>(); // modified chunks kept while unloaded
  private spawned = new Set<number>();
  onSpawns: (spawns: Spawn[], c: Chunk) => void = () => {};
  onUnload: (c: Chunk) => void = () => {};
  readonly gen: WorldGenerator;
  maxInflight = 12;
  stats = { generated: 0, inflight: 0, retained: 0 };

  constructor(public world: VoxelWorld, public seed: number, public opts: StreamerOptions) {
    this.gen = new WorldGenerator(seed);
    if (opts.useWorkers && typeof Worker !== 'undefined') {
      const n = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1));
      for (let i = 0; i < n; i++) {
        const w = new Worker(new URL('./genWorker.ts', import.meta.url), { type: 'module' });
        w.postMessage({ type: 'init', seed });
        w.onmessage = (e) => this.onWorkerMessage(e.data);
        this.workers.push(w);
      }
      this.maxInflight = n * 4;
    }
  }

  dispose(): void {
    for (const w of this.workers) w.terminate();
    this.workers = [];
  }

  private onWorkerMessage(d: { type: string; id: number; cx: number; cy: number; cz: number; mat: Uint8Array; spawns: Spawn[] }): void {
    const key = chunkKey(d.cx, d.cy, d.cz);
    if (this.inflight.get(key) !== d.id) return; // stale
    this.inflight.delete(key);
    if (this.world.chunks[key]) return;
    this.install(new Chunk(d.cx, d.cy, d.cz, key, d.mat), d.spawns);
  }

  private install(c: Chunk, spawns: Spawn[]): void {
    this.world.addChunk(c);
    this.stats.generated++;
    // wake the borders of neighbours so resting liquids/powders can flow into the newly loaded space
    for (const [dx, dy, dz] of [[0, 1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, -1, 0]]) {
      const n = this.world.getChunk(c.cx + dx, c.cy + dy, c.cz + dz);
      if (!n) continue;
      const x0 = dx === 1 ? 0 : dx === -1 ? 15 : 0, x1 = dx === 1 ? 0 : dx === -1 ? 15 : 15;
      const y0 = dy === 1 ? 0 : dy === -1 ? 15 : 0, y1 = dy === 1 ? 0 : dy === -1 ? 15 : 15;
      const z0 = dz === 1 ? 0 : dz === -1 ? 15 : 0, z1 = dz === 1 ? 0 : dz === -1 ? 15 : 15;
      this.world.touchBox(n.ox + x0, n.oy + y0, n.oz + z0, n.ox + x1, n.oy + y1, n.oz + z1);
    }
    if (!this.spawned.has(c.key)) {
      this.spawned.add(c.key);
      if (spawns.length) this.onSpawns(spawns, c);
    }
  }

  /** Synchronously generate (or restore) one chunk. */
  loadSync(cx: number, cy: number, cz: number): Chunk | null {
    if (cx < 0 || cy < 0 || cz < 0 || cx >= WORLD_CX || cy >= WORLD_CY || cz >= WORLD_CZ) return null;
    const key = chunkKey(cx, cy, cz);
    const existing = this.world.chunks[key];
    if (existing) return existing;
    const kept = this.retained.get(key);
    if (kept) {
      this.retained.delete(key);
      this.install(kept, []);
      return kept;
    }
    this.inflight.delete(key);
    const r = this.gen.generateChunk(cx, cy, cz);
    const c = new Chunk(cx, cy, cz, key, r.mat);
    this.install(c, r.spawns);
    return c;
  }

  /** Request chunks around a position, unload far ones. Returns number of missing chunks in range. */
  update(px: number, py: number, pz: number, syncBudgetMs = 0): number {
    const pcx = Math.floor(px / CHUNK), pcy = Math.floor(py / CHUNK), pcz = Math.floor(pz / CHUNK);
    const rh = this.opts.radiusH, rv = this.opts.radiusV;
    const want: [number, number, number, number][] = [];
    for (let dy = -rv; dy <= rv; dy++)
      for (let dz = -rh; dz <= rh; dz++)
        for (let dx = -rh; dx <= rh; dx++) {
          if (dx * dx + dz * dz > (rh + 0.5) * (rh + 0.5)) continue;
          const cx = pcx + dx, cy = pcy + dy, cz = pcz + dz;
          if (cx < 0 || cy < 0 || cz < 0 || cx >= WORLD_CX || cy >= WORLD_CY || cz >= WORLD_CZ) continue;
          const key = chunkKey(cx, cy, cz);
          if (this.world.chunks[key] || this.inflight.has(key)) continue;
          want.push([dx * dx + dz * dz + dy * dy * 1.5, cx, cy, cz]);
        }
    want.sort((a, b) => a[0] - b[0]);
    const t0 = performance.now();
    let missing = want.length;
    for (const [, cx, cy, cz] of want) {
      const key = chunkKey(cx, cy, cz);
      const kept = this.retained.get(key);
      if (kept) {
        this.retained.delete(key);
        this.install(kept, []);
        missing--;
        continue;
      }
      if (this.workers.length && this.inflight.size < this.maxInflight) {
        const id = this.reqId++;
        this.inflight.set(key, id);
        const w = this.workers[this.nextWorker++ % this.workers.length];
        w.postMessage({ type: 'gen', id, cx, cy, cz });
      } else if (!this.workers.length && (syncBudgetMs > 0 && performance.now() - t0 < syncBudgetMs)) {
        this.loadSync(cx, cy, cz);
        missing--;
      }
    }
    // unload
    const ur = rh + 2.5, uv = rv + 2;
    for (const c of this.loadedChunks()) {
      const dx = c.cx - pcx, dy = c.cy - pcy, dz = c.cz - pcz;
      if (dx * dx + dz * dz > ur * ur || Math.abs(dy) > uv) {
        this.world.removeChunk(c);
        this.onUnload(c);
        if (c.modified) this.retained.set(c.key, c);
      }
    }
    this.stats.inflight = this.inflight.size;
    this.stats.retained = this.retained.size;
    return missing;
  }

  private *loadedChunks(): Generator<Chunk> {
    for (const c of this.world.chunks) if (c) yield c;
  }

  isLoaded(x: number, y: number, z: number): boolean {
    return this.world.chunkAt(Math.floor(x), Math.floor(y), Math.floor(z)) !== null;
  }
}
