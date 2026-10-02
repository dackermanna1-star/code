/**
 * StructureManager: finds the structure starts relevant to a chunk, writes the pieces that
 * intersect it, answers footprint queries (to keep trees out of buildings) and locates structures.
 * Starts are pure functions of (seed, type, start chunk) and cached.
 */
import { Rng } from '../../../core/rng';
import type { DimensionId } from '../generator';
import type { ChunkWriter } from '../common/writer';
import { structureTypesFor } from './registry';
import { regionCandidate, regionsFor, startSeed } from './placement';
import { boxIntersectsChunk, type StructureContext, type StructureStart, type StructureType } from './types';

export class StructureManager {
  private readonly types: StructureType[];
  private readonly cache = new Map<string, StructureStart | null>();
  private readonly nearCache = new Map<number, StructureStart[]>();

  constructor(readonly dimension: DimensionId, readonly ctx: StructureContext) {
    this.types = structureTypesFor(dimension);
  }

  get hasTypes(): boolean {
    return this.types.length > 0;
  }

  /** The (cached) start of `type` at a start chunk, or null. */
  startAt(t: StructureType, chunkX: number, chunkZ: number): StructureStart | null {
    const key = `${t.id}:${chunkX}:${chunkZ}`;
    if (this.cache.has(key)) return this.cache.get(key)!;
    if (this.cache.size > 20000) this.cache.clear();
    const start = t.generate(this.ctx, chunkX, chunkZ, new Rng(startSeed(this.ctx.seed, t.placement, chunkX, chunkZ)));
    this.cache.set(key, start);
    return start;
  }

  /** All starts whose bounding box intersects chunk (cx, cz), in write order. */
  startsFor(cx: number, cz: number): StructureStart[] {
    const k = (cx + 0x400000) * 0x800000 + (cz + 0x400000);
    const hit = this.nearCache.get(k);
    if (hit) return hit;
    if (this.nearCache.size > 4096) this.nearCache.clear();
    const out: StructureStart[] = [];
    for (const t of this.types) {
      const p = t.placement;
      const R = t.maxReach;
      const [rx0, rz0, rx1, rz1] = regionsFor(p, cx - R, cz - R, cx + R, cz + R);
      for (let rz = rz0; rz <= rz1; rz++)
        for (let rx = rx0; rx <= rx1; rx++) {
          const c = regionCandidate(this.ctx.seed, p, rx, rz);
          if (!c) continue;
          if (Math.abs(c[0] - cx) > R || Math.abs(c[1] - cz) > R) continue;
          const s = this.startAt(t, c[0], c[1]);
          if (s && boxIntersectsChunk(s.box, cx, cz)) out.push(s);
        }
    }
    this.nearCache.set(k, out);
    return out;
  }

  /** Write all structure pieces intersecting the writer's chunk. */
  place(cx: number, cz: number, w: ChunkWriter): void {
    for (const s of this.startsFor(cx, cz))
      for (const p of s.pieces) if (boxIntersectsChunk(p.box, cx, cz)) p.place(w, this.ctx);
  }

  /** True if a vegetation-clearing structure covers the column. Pure. */
  blocksColumn(x: number, z: number): boolean {
    if (!this.types.length) return false;
    for (const s of this.startsFor(Math.floor(x / 16), Math.floor(z / 16))) {
      if (!s.clearsVegetation) continue;
      const b = s.box;
      if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) return true;
    }
    return false;
  }

  /** Nearest start of a type around (x, z), searching up to `maxRegions` regions away. */
  locate(id: string, x: number, z: number, maxRegions = 64): { x: number; y: number; z: number } | null {
    const t = this.types.find((tt) => tt.id === id);
    if (!t) return null;
    const p = t.placement;
    const crx = Math.floor(Math.floor(x / 16) / p.spacing), crz = Math.floor(Math.floor(z / 16) / p.spacing);
    const found: StructureStart[] = [];
    let bestD = Infinity;
    for (let ring = 0; ring <= maxRegions; ring++) {
      for (let dz = -ring; dz <= ring; dz++)
        for (let dx = -ring; dx <= ring; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
          const c = regionCandidate(this.ctx.seed, p, crx + dx, crz + dz);
          if (!c) continue;
          const s = this.startAt(t, c[0], c[1]);
          if (!s) continue;
          const d = (s.x - x) * (s.x - x) + (s.z - z) * (s.z - z);
          if (d < bestD) {
            bestD = d;
            found[0] = s;
          }
        }
      // a candidate in ring r is at least (r - 1) * spacing chunks away; stop once nothing closer can exist
      if (found.length && Math.sqrt(bestD) < (ring - 1) * p.spacing * 16) break;
    }
    const best = found[0];
    return best ? { x: best.x, y: best.y, z: best.z } : null;
  }
}
