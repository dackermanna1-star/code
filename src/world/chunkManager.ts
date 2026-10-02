/**
 * Streams chunks around the player: requests generation from worker threads, adds results to
 * the World (with cross-border light integration), schedules meshing of dirty sections on mesh
 * workers, and unloads far chunks.
 */
import { WorkerPool } from '../core/workerPool';
import { chunkKey, chunkKeyX, chunkKeyZ } from '../core/math';
import { SECTIONS_PER_CHUNK } from '../core/constants';
import { World, sectionKey } from './world';
import { chunkFromGenerated, type Chunk, type GeneratedChunk } from './chunk';
import { P, pidx, cidx, type MeshOutput } from '../render/mesher';

export interface SectionSink {
  updateSection(key: number, cx: number, sy: number, cz: number, out: MeshOutput): void;
  removeChunk(cx: number, cz: number): void;
}

export interface ChunkManagerOptions {
  renderDistance: number;
  genWorkers?: number;
  meshWorkers?: number;
  bevels?: boolean;
  decorations?: boolean;
  /** Called for every chunk that finished loading (entities to spawn etc.). */
  onChunkReady?: (c: Chunk) => void;
  /** Optional: provides saved chunk data instead of generating. */
  loadSaved?: (dimension: string, cx: number, cz: number) => Promise<Chunk | null>;
}

export class ChunkManager {
  private gen: WorkerPool;
  private mesh: WorkerPool;
  private requested = new Set<number>();
  private sectionVersion = new Map<number, number>();
  private meshing = new Set<number>();
  private urgent = new Set<number>();
  renderDistance: number;
  centerX = 0;
  centerZ = 0;
  bevels: boolean;
  decorations: boolean;
  /** Stats */
  generatedCount = 0;
  meshedCount = 0;
  disposed = false;

  constructor(readonly world: World, readonly sink: SectionSink, readonly opts: ChunkManagerOptions) {
    const cores = Math.max(2, (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4);
    const nGen = opts.genWorkers ?? Math.max(1, Math.min(4, Math.floor(cores / 2)));
    const nMesh = opts.meshWorkers ?? Math.max(1, Math.min(4, cores - nGen - 1));
    this.gen = new WorkerPool(() => new Worker(new URL('./worker/gen.worker.ts', import.meta.url), { type: 'module' }), nGen, 3);
    this.mesh = new WorkerPool(() => new Worker(new URL('./worker/mesh.worker.ts', import.meta.url), { type: 'module' }), nMesh, 2);
    this.renderDistance = opts.renderDistance;
    this.bevels = opts.bevels ?? true;
    this.decorations = opts.decorations ?? true;
  }

  dispose() {
    this.disposed = true;
    this.gen.terminate();
    this.mesh.terminate();
  }

  /** Mark a section for high-priority remeshing (player edits). */
  markUrgent(x: number, y: number, z: number) {
    this.urgent.add(sectionKey(x >> 4, y >> 4, z >> 4));
  }

  /** Number of chunks within load radius not yet loaded (loading progress). */
  pendingAround(): number {
    let n = 0;
    const r = this.renderDistance;
    const pcx = Math.floor(this.centerX) >> 4, pcz = Math.floor(this.centerZ) >> 4;
    for (let dz = -r; dz <= r; dz++)
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dz * dz > r * r) continue;
        if (!this.world.getChunk(pcx + dx, pcz + dz)) n++;
      }
    return n;
  }

  /** Fraction of sections near the player that have been meshed (for the loading screen). */
  nearReady(radius = 3): boolean {
    const pcx = Math.floor(this.centerX) >> 4, pcz = Math.floor(this.centerZ) >> 4;
    for (let dz = -radius; dz <= radius; dz++)
      for (let dx = -radius; dx <= radius; dx++) {
        const c = this.world.getChunk(pcx + dx, pcz + dz);
        if (!c) return false;
        for (let sy = 0; sy < SECTIONS_PER_CHUNK; sy++) {
          const k = sectionKey(c.cx, sy, c.cz);
          if (this.world.dirtySections.has(k) && c.blocks[sy]) return false;
        }
      }
    return true;
  }

  update(px: number, pz: number) {
    if (this.disposed) return;
    this.centerX = px;
    this.centerZ = pz;
    const pcx = Math.floor(px) >> 4, pcz = Math.floor(pz) >> 4;
    const r = this.renderDistance;
    // 1) request missing chunks, closest first
    if (this.gen.hasCapacity()) {
      const want: [number, number, number][] = [];
      for (let dz = -r - 1; dz <= r + 1; dz++)
        for (let dx = -r - 1; dx <= r + 1; dx++) {
          const d2 = dx * dx + dz * dz;
          if (d2 > (r + 1) * (r + 1)) continue;
          const cx = pcx + dx, cz = pcz + dz;
          const k = chunkKey(cx, cz);
          if (this.requested.has(k) || this.world.chunks.has(k)) continue;
          want.push([d2, cx, cz]);
        }
      want.sort((a, b) => a[0] - b[0]);
      for (const [, cx, cz] of want) {
        if (!this.gen.hasCapacity()) break;
        this.requestChunk(cx, cz);
      }
    }
    // 2) unload far chunks
    const ur = r + 3;
    for (const [k, c] of this.world.chunks) {
      const dx = c.cx - pcx, dz = c.cz - pcz;
      if (dx * dx + dz * dz > ur * ur) {
        this.world.removeChunk(c.cx, c.cz);
        this.sink.removeChunk(c.cx, c.cz);
        this.requested.delete(k);
        this.meshedChunks.delete(k);
        for (let sy = 0; sy < SECTIONS_PER_CHUNK; sy++) this.world.dirtySections.delete(sectionKey(c.cx, sy, c.cz));
      }
    }
    // 3) mesh dirty sections
    this.scheduleMeshing(pcx, pcz);
  }

  private async requestChunk(cx: number, cz: number) {
    const k = chunkKey(cx, cz);
    this.requested.add(k);
    try {
      let chunk: Chunk | null = null;
      if (this.opts.loadSaved) chunk = await this.opts.loadSaved(this.world.dimension, cx, cz);
      if (!chunk) {
        const res = await this.gen.request<{ chunk: GeneratedChunk }>({ type: 'gen', dimension: this.world.dimension, seed: this.world.seed, cx, cz });
        if (this.disposed) return;
        chunk = chunkFromGenerated(res.chunk);
      }
      if (!this.requested.has(k) || this.world.chunks.has(k)) return; // unloaded meanwhile
      chunk.status = 'ready';
      this.world.addChunk(chunk);
      this.generatedCount++;
      this.opts.onChunkReady?.(chunk);
    } catch (e) {
      console.error('chunk gen failed', cx, cz, e);
      this.requested.delete(k);
    }
  }

  private meshable(cx: number, cz: number): boolean {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (!this.world.getChunk(cx + dx, cz + dz)) return false;
    return true;
  }

  private scheduleMeshing(pcx: number, pcz: number) {
    const dirty = this.world.dirtySections;
    if (dirty.size === 0 || !this.mesh.hasCapacity()) return;
    const cand: [number, number][] = [];
    const r2 = (this.renderDistance + 1) ** 2;
    for (const k of dirty) {
      if (this.meshing.has(k)) continue;
      const sy = k % 32;
      const ck = (k - sy) / 32;
      const cx = chunkKeyX(ck), cz = chunkKeyZ(ck);
      const dx = cx - pcx, dz = cz - pcz;
      if (dx * dx + dz * dz > r2) { dirty.delete(k); continue; }
      const c = this.world.getChunk(cx, cz);
      if (!c) { dirty.delete(k); continue; }
      if (!this.meshable(cx, cz)) continue;
      const pri = this.urgent.has(k) ? -1000 : dx * dx + dz * dz + Math.abs(sy - 4) * 0.25;
      cand.push([pri, k]);
    }
    cand.sort((a, b) => a[0] - b[0]);
    for (const [, k] of cand) {
      if (!this.mesh.hasCapacity()) break;
      this.dispatchMesh(k);
    }
  }

  private dispatchMesh(k: number) {
    const sy = k % 32;
    const ck = (k - sy) / 32;
    const cx = chunkKeyX(ck), cz = chunkKeyZ(ck);
    this.world.dirtySections.delete(k);
    this.urgent.delete(k);
    const c = this.world.getChunk(cx, cz)!;
    // Empty section with empty neighbours above/below: nothing to draw
    if (!c.blocks[sy] && !(sy > 0 && c.blocks[sy - 1]) && !(sy < 15 && c.blocks[sy + 1])) {
      this.sink.updateSection(k, cx, sy, cz, { opaque: null, cutout: null, translucent: null });
      this.checkMeshed(cx, cz);
      return;
    }
    const input = this.buildInput(cx, sy, cz);
    const version = (this.sectionVersion.get(k) ?? 0) + 1;
    this.sectionVersion.set(k, version);
    this.meshing.add(k);
    this.mesh
      .request<{ out: MeshOutput; version: number }>({ type: 'mesh', key: k, version, input }, [input.blocks.buffer, input.light.buffer, input.grass.buffer, input.foliage.buffer, input.water.buffer])
      .then((res) => {
        this.meshing.delete(k);
        if (this.disposed) return;
        if (!this.world.getChunk(cx, cz)) return;
        if (res.version !== this.sectionVersion.get(k)) return;
        this.sink.updateSection(k, cx, sy, cz, res.out);
        this.meshedCount++;
        this.checkMeshed(cx, cz);
      })
      .catch((e) => {
        this.meshing.delete(k);
        console.error('mesh failed', e);
      });
  }

  private checkMeshed(cx: number, cz: number) {
    const ck = chunkKey(cx, cz);
    if (this.meshedChunks.has(ck)) return;
    for (let sy = 0; sy < SECTIONS_PER_CHUNK; sy++) {
      const k = sectionKey(cx, sy, cz);
      if (this.world.dirtySections.has(k) || this.meshing.has(k)) return;
    }
    this.meshedChunks.add(ck);
  }

  /** Build the padded 18³ input for a section from the world. */
  buildInput(cx: number, sy: number, cz: number) {
    const blocks = new Uint16Array(P * P * P);
    const light = new Uint16Array(P * P * P);
    const grass = new Uint32Array(P * P), foliage = new Uint32Array(P * P), water = new Uint32Array(P * P);
    const w = this.world;
    const y0 = sy * 16;
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        const c = w.getChunk(cx + dx, cz + dz);
        const xs = dx < 0 ? 15 : 0, xe = dx > 0 ? 0 : 15;
        const zs = dz < 0 ? 15 : 0, ze = dz > 0 ? 0 : 15;
        for (let lz = zs; lz <= ze; lz++)
          for (let lx = xs; lx <= xe; lx++) {
            const px = lx + dx * 16, pz = lz + dz * 16;
            const ci = cidx(px, pz);
            if (c) {
              const hi = lz * 16 + lx;
              grass[ci] = c.grassColor[hi];
              foliage[ci] = c.foliageColor[hi];
              water[ci] = c.waterColor[hi];
            }
            for (let py = -1; py <= 16; py++) {
              const y = y0 + py;
              const i = pidx(px, py, pz);
              if (!c) { light[i] = 15 << 12; continue; }
              if (y < 0) { blocks[i] = 1 << 4; light[i] = 0; continue; } // treat below world as stone
              if (y > 255) { light[i] = 15 << 12; continue; }
              const s = c.blocks[y >> 4];
              blocks[i] = s ? s[((y & 15) << 8) | (lz << 4) | lx] : 0;
              light[i] = c.getLight(lx, y, lz);
            }
          }
      }
    return { blocks, light, grass, foliage, water, ox: cx * 16, oy: y0, oz: cz * 16, bevels: this.bevels ? 1 : 0, decorations: this.decorations ? 1 : 0 };
  }

  /** Remesh everything (e.g. after changing bevel settings). */
  remeshAll() {
    for (const c of this.world.chunks.values()) for (let sy = 0; sy < SECTIONS_PER_CHUNK; sy++) this.world.dirtySections.add(sectionKey(c.cx, sy, c.cz));
  }

  /** Ask a generation worker for structure locations / spawn. */
  locate(structure: string, x: number, z: number): Promise<{ x: number; y: number; z: number } | null> {
    return this.gen.request<{ result: any }>({ type: 'locate', dimension: this.world.dimension, seed: this.world.seed, structure, x, z }).then((r) => r.result);
  }
  /** Request a distant-terrain LOD tile (low priority: only when generation is idle). */
  requestLod(x0: number, z0: number, n: number, step: number): Promise<{ heights: Float32Array; colors: Uint32Array; kinds: Uint8Array }> {
    return this.gen.request({ type: 'lod', dimension: this.world.dimension, seed: this.world.seed, x0, z0, n, step });
  }
  get genIdle() {
    return this.gen.busy === 0;
  }
  /** True once every section of the chunk has been meshed at least once. */
  isChunkMeshed(cx: number, cz: number): boolean {
    return this.meshedChunks.has(chunkKey(cx, cz));
  }
  readonly meshedChunks = new Set<number>();

  findSpawn(): Promise<{ x: number; y: number; z: number }> {
    return this.gen.request<{ result: any }>({ type: 'spawn', dimension: this.world.dimension, seed: this.world.seed }).then((r) => r.result);
  }
  get stats() {
    return { gen: this.gen.busy, mesh: this.mesh.busy, dirty: this.world.dirtySections.size, chunks: this.world.chunks.size };
  }
}
