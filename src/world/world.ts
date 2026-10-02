/**
 * World: the set of loaded chunk columns of one dimension plus block/light access,
 * change notification, scheduled & random ticks, and block entities.
 */
import { WORLD_HEIGHT, RANDOM_TICK_SPEED, SECTIONS_PER_CHUNK } from '../core/constants';
import { chunkKey } from '../core/math';
import { Emitter } from '../core/events';
import { Rng } from '../core/rng';
import { Chunk, FULL_SKY } from './chunk';
import { LightEngine, type LightAccess } from './light';
import { behaviorOf } from './blocks/behaviors';
import { T_OPACITY, T_LIQUID, BLOCKS, T_SOLID, T_FULL_CUBE } from './blocks/registry';
import type { DimensionId } from './gen/generator';

export const enum SetFlags {
  NONE = 0,
  /** Notify neighbours (onNeighborChange) */
  NOTIFY = 1,
  /** Call onPlace/onRemove hooks */
  HOOKS = 2,
  /** Mark as player-modified (saved) */
  MODIFY = 4,
  ALL = 7,
}

export interface WorldEvents {
  blockChanged: { x: number; y: number; z: number; oldState: number; newState: number };
  chunkLoaded: { chunk: Chunk };
  chunkUnloaded: { chunk: Chunk };
}

export const sectionKey = (cx: number, sy: number, cz: number) => chunkKey(cx, cz) * 32 + sy;

interface Scheduled {
  x: number; y: number; z: number; state: number; due: number; prio: number; seq: number;
}

export class World {
  readonly chunks = new Map<number, Chunk>();
  readonly events = new Emitter<WorldEvents>();
  /** Section keys (sectionKey) needing remesh. */
  readonly dirtySections = new Set<number>();
  readonly light: LightEngine;
  readonly rng: Rng;
  /** Current game tick (set by the game). */
  tick = 0;
  /** Arbitrary per-world system data (redstone graph, etc.). */
  readonly systems: Record<string, any> = {};
  /** Whether light updates are enabled (disabled during bulk edits). */
  lightEnabled = true;
  private scheduled: Scheduled[] = [];
  private scheduledKeys = new Set<string>();
  private seq = 0;
  private lastChunk: Chunk | null = null;
  private lastKey = NaN;

  constructor(readonly dimension: DimensionId, readonly seed: number) {
    this.rng = new Rng(seed ^ 0x51ed270b);
    const self = this;
    const acc: LightAccess = {
      getLight(x, y, z) {
        const c = self.getChunk(x >> 4, z >> 4);
        if (!c) return -1;
        return c.getLight(x & 15, y, z & 15);
      },
      setLight(x, y, z, v) {
        const c = self.getChunk(x >> 4, z >> 4);
        if (c) c.setLight(x & 15, y, z & 15, v);
      },
      getState(x, y, z) {
        return self.getBlock(x, y, z);
      },
      isLoaded(x, _y, z) {
        return self.getChunk(x >> 4, z >> 4) !== undefined;
      },
      onChanged(x, y, z) {
        self.markDirtyBlock(x, y, z);
      },
    };
    this.light = new LightEngine(acc);
  }

  // ----------------------------------------------------------------- chunks
  getChunk(cx: number, cz: number): Chunk | undefined {
    const k = chunkKey(cx, cz);
    if (k === this.lastKey) return this.lastChunk ?? undefined;
    const c = this.chunks.get(k);
    this.lastKey = k;
    this.lastChunk = c ?? null;
    return c;
  }

  isLoaded(x: number, z: number): boolean {
    return this.getChunk(x >> 4, z >> 4) !== undefined;
  }

  addChunk(chunk: Chunk) {
    const k = chunkKey(chunk.cx, chunk.cz);
    this.chunks.set(k, chunk);
    this.lastKey = NaN;
    if (this.lightEnabled) this.light.integrateChunk(chunk.cx, chunk.cz, chunk.topSection() * 16 + 16);
    // mark this chunk and border sections of neighbours dirty
    for (let sy = 0; sy < SECTIONS_PER_CHUNK; sy++) this.dirtySections.add(sectionKey(chunk.cx, sy, chunk.cz));
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const n = this.getChunk(chunk.cx + dx, chunk.cz + dz);
      if (!n) continue;
      for (let sy = 0; sy < SECTIONS_PER_CHUNK; sy++) if (n.blocks[sy]) this.dirtySections.add(sectionKey(n.cx, sy, n.cz));
    }
    this.events.emit('chunkLoaded', { chunk });
  }

  removeChunk(cx: number, cz: number) {
    const k = chunkKey(cx, cz);
    const c = this.chunks.get(k);
    if (!c) return;
    this.chunks.delete(k);
    this.lastKey = NaN;
    this.events.emit('chunkUnloaded', { chunk: c });
  }

  // ----------------------------------------------------------------- blocks
  getBlock(x: number, y: number, z: number): number {
    if (y < 0 || y >= WORLD_HEIGHT) return 0;
    const c = this.getChunk(x >> 4, z >> 4);
    if (!c) return 0;
    const s = c.blocks[y >> 4];
    return s === null ? 0 : s[((y & 15) << 8) | ((z & 15) << 4) | (x & 15)];
  }

  getBlockId(x: number, y: number, z: number): number {
    return this.getBlock(x, y, z) >>> 4;
  }

  isSolidFull(x: number, y: number, z: number): boolean {
    return T_FULL_CUBE[this.getBlock(x, y, z) >>> 4] === 1;
  }

  /**
   * Set a block state. Returns false if the chunk isn't loaded or nothing changed.
   */
  setBlock(x: number, y: number, z: number, state: number, flags: number = SetFlags.ALL): boolean {
    if (y < 0 || y >= WORLD_HEIGHT) return false;
    const c = this.getChunk(x >> 4, z >> 4);
    if (!c) return false;
    const lx = x & 15, lz = z & 15;
    const old = c.get(lx, y, lz);
    if (old === state) return false;
    if ((flags & SetFlags.HOOKS) && (old >>> 4) !== (state >>> 4)) {
      behaviorOf(old >>> 4)?.onRemove?.(this, x, y, z, old, state);
    }
    c.set(lx, y, lz, state);
    if (flags & SetFlags.MODIFY) c.modified = true;
    // heightmap (highest light-blocking or liquid block + 1)
    const hi = lz * 16 + lx;
    const blocking = T_OPACITY[state >>> 4] > 0 || T_LIQUID[state >>> 4] > 0;
    if (blocking && y + 1 > c.heightmap[hi]) c.heightmap[hi] = y + 1;
    else if (!blocking && y + 1 === c.heightmap[hi]) {
      let h = y;
      while (h > 0) {
        const s = c.get(lx, h - 1, lz);
        if (T_OPACITY[s >>> 4] > 0 || T_LIQUID[s >>> 4] > 0) break;
        h--;
      }
      c.heightmap[hi] = h;
    }
    if (this.lightEnabled) this.light.onBlockChanged(x, y, z, old, state);
    this.markDirtyBlock(x, y, z);
    if (flags & SetFlags.HOOKS && (old >>> 4) !== (state >>> 4)) {
      behaviorOf(state >>> 4)?.onPlace?.(this, x, y, z, state, old);
    }
    if (flags & SetFlags.NOTIFY) this.notifyNeighbors(x, y, z);
    this.events.emit('blockChanged', { x, y, z, oldState: old, newState: state });
    return true;
  }

  notifyNeighbors(x: number, y: number, z: number) {
    for (const [dx, dy, dz] of NEIGHBORS6) {
      const nx = x + dx, ny = y + dy, nz = z + dz;
      const st = this.getBlock(nx, ny, nz);
      if (st === 0) continue;
      behaviorOf(st >>> 4)?.onNeighborChange?.(this, nx, ny, nz, st, x, y, z);
    }
  }

  /** Mark the section containing (x,y,z) and adjacent sections (if on a border) for remeshing. */
  markDirtyBlock(x: number, y: number, z: number) {
    const cx = x >> 4, cz = z >> 4, sy = y >> 4;
    const lx = x & 15, ly = y & 15, lz = z & 15;
    const ds = this.dirtySections;
    ds.add(sectionKey(cx, sy, cz));
    if (lx === 0) ds.add(sectionKey(cx - 1, sy, cz));
    else if (lx === 15) ds.add(sectionKey(cx + 1, sy, cz));
    if (lz === 0) ds.add(sectionKey(cx, sy, cz - 1));
    else if (lz === 15) ds.add(sectionKey(cx, sy, cz + 1));
    if (ly === 0 && sy > 0) ds.add(sectionKey(cx, sy - 1, cz));
    else if (ly === 15 && sy < SECTIONS_PER_CHUNK - 1) ds.add(sectionKey(cx, sy + 1, cz));
    // diagonal neighbours matter for smooth lighting/AO at corners
    if ((lx === 0 || lx === 15) && (lz === 0 || lz === 15)) ds.add(sectionKey(cx + (lx === 0 ? -1 : 1), sy, cz + (lz === 0 ? -1 : 1)));
  }

  // ----------------------------------------------------------------- light
  getLight(x: number, y: number, z: number): number {
    if (y >= WORLD_HEIGHT) return FULL_SKY;
    if (y < 0) return 0;
    const c = this.getChunk(x >> 4, z >> 4);
    if (!c) return FULL_SKY;
    return c.getLight(x & 15, y, z & 15);
  }
  getSkyLight(x: number, y: number, z: number) {
    return (this.getLight(x, y, z) >>> 12) & 15;
  }
  /** Max of the RGB block light channels. */
  getBlockLight(x: number, y: number, z: number) {
    const l = this.getLight(x, y, z);
    return Math.max((l >>> 8) & 15, (l >>> 4) & 15, l & 15);
  }

  getHeight(x: number, z: number): number {
    const c = this.getChunk(x >> 4, z >> 4);
    return c ? c.heightmap[(z & 15) * 16 + (x & 15)] : 0;
  }

  getBiome(x: number, z: number): number {
    const c = this.getChunk(x >> 4, z >> 4);
    return c ? c.biomes[(z & 15) * 16 + (x & 15)] : 0;
  }

  // ----------------------------------------------------------------- block entities
  getBlockEntity<T = any>(x: number, y: number, z: number): T | undefined {
    const c = this.getChunk(x >> 4, z >> 4);
    return c?.blockEntities.get((y << 8) | ((z & 15) << 4) | (x & 15));
  }
  setBlockEntity(x: number, y: number, z: number, data: any) {
    const c = this.getChunk(x >> 4, z >> 4);
    if (!c) return;
    const k = (y << 8) | ((z & 15) << 4) | (x & 15);
    if (data === undefined || data === null) c.blockEntities.delete(k);
    else c.blockEntities.set(k, data);
    c.modified = true;
  }

  // ----------------------------------------------------------------- ticks
  /** Schedule a block tick `delay` game ticks from now (deduplicated per position+block). */
  scheduleTick(x: number, y: number, z: number, delay: number, prio = 0) {
    const state = this.getBlock(x, y, z);
    const key = `${x},${y},${z},${state >>> 4}`;
    if (this.scheduledKeys.has(key)) return;
    this.scheduledKeys.add(key);
    const item: Scheduled = { x, y, z, state, due: this.tick + Math.max(1, delay), prio, seq: this.seq++ };
    // binary insert (sorted by due, prio, seq)
    const a = this.scheduled;
    let lo = 0, hi = a.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const m = a[mid];
      if (m.due < item.due || (m.due === item.due && (m.prio < item.prio || (m.prio === item.prio && m.seq < item.seq)))) lo = mid + 1;
      else hi = mid;
    }
    a.splice(lo, 0, item);
  }

  hasScheduledTick(x: number, y: number, z: number, id: number) {
    return this.scheduledKeys.has(`${x},${y},${z},${id}`);
  }

  /** Run one game tick of world logic: scheduled ticks and random ticks around the given points. */
  runTick(players: { x: number; z: number }[], randomTickRadiusChunks = 8) {
    this.tick++;
    // scheduled ticks
    let budget = 65536;
    while (this.scheduled.length && this.scheduled[0].due <= this.tick && budget-- > 0) {
      const s = this.scheduled.shift()!;
      const key = `${s.x},${s.y},${s.z},${s.state >>> 4}`;
      this.scheduledKeys.delete(key);
      const cur = this.getBlock(s.x, s.y, s.z);
      if (cur >>> 4 !== s.state >>> 4) continue;
      if (!this.isLoaded(s.x, s.z)) continue;
      behaviorOf(cur >>> 4)?.onScheduledTick?.(this, s.x, s.y, s.z, cur);
    }
    // random ticks
    const seen = new Set<number>();
    const r = randomTickRadiusChunks;
    for (const p of players) {
      const pcx = Math.floor(p.x) >> 4, pcz = Math.floor(p.z) >> 4;
      for (let dz = -r; dz <= r; dz++)
        for (let dx = -r; dx <= r; dx++) {
          const k = chunkKey(pcx + dx, pcz + dz);
          if (seen.has(k)) continue;
          seen.add(k);
          const c = this.chunks.get(k);
          if (!c || c.status !== 'ready') continue;
          for (let sy = 0; sy < SECTIONS_PER_CHUNK; sy++) {
            const sec = c.blocks[sy];
            if (!sec) continue;
            for (let i = 0; i < RANDOM_TICK_SPEED; i++) {
              const idx = this.rng.nextU32() & 4095;
              const st = sec[idx];
              if (st === 0) continue;
              const beh = behaviorOf(st >>> 4);
              if (!beh?.onRandomTick) continue;
              const x = c.cx * 16 + (idx & 15), z = c.cz * 16 + ((idx >> 4) & 15), y = sy * 16 + (idx >> 8);
              beh.onRandomTick(this, x, y, z, st, this.rng);
            }
          }
        }
    }
  }

  /** Iterate block states in an integer AABB (inclusive). */
  forEachBlock(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, fn: (x: number, y: number, z: number, state: number) => void) {
    for (let y = Math.max(0, y0); y <= Math.min(WORLD_HEIGHT - 1, y1); y++)
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) fn(x, y, z, this.getBlock(x, y, z));
  }

  blockDef(state: number) {
    return BLOCKS[state >>> 4];
  }
  isSolid(state: number) {
    return T_SOLID[state >>> 4] === 1;
  }
}

export const NEIGHBORS6: readonly [number, number, number][] = [
  [0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1], [-1, 0, 0], [1, 0, 0],
];
