/**
 * Base classes and helpers for structure pieces authored in a local frame (see builder.ts).
 */
import type { ChunkWriter } from '../../common/writer';
import { hashF, hash3i } from '../../common/noise';
import { Builder, localBox } from './builder';
import type { BlockBox, StructureContext, StructurePiece } from '../types';

export abstract class LocalPiece implements StructurePiece {
  readonly box: BlockBox;
  /**
   * @param ox, oy, oz  world origin of the local (0, 0, 0) corner after rotation
   * @param rot         clockwise quarter turns
   * @param sx, sy, sz  local size
   * @param seed        per-piece seed for positional randomness
   * @param minY        optional lower world y bound (foundations reaching below oy)
   */
  constructor(
    readonly ox: number,
    readonly oy: number,
    readonly oz: number,
    readonly rot: number,
    readonly sx: number,
    readonly sy: number,
    readonly sz: number,
    readonly seed: number,
    minY?: number,
  ) {
    const b = localBox(ox, oy, oz, rot, sx, sy, sz);
    if (minY !== undefined && minY < b.minY) b.minY = Math.max(0, minY);
    this.box = b;
  }

  place(w: ChunkWriter, ctx: StructureContext): void {
    this.build(new Builder(w, this.ox, this.oy, this.oz, this.rot, this.sx, this.sz), ctx);
  }

  abstract build(b: Builder, ctx: StructureContext): void;

  /** Deterministic [0,1) hash of a local position. */
  rnd(x: number, y: number, z: number, salt = 0): number {
    return hashF(x, y, z, (this.seed ^ Math.imul(salt + 1, 0x9e3779b1)) | 0);
  }
  /** Deterministic integer in [0, n) of a local position. */
  rint(x: number, y: number, z: number, n: number, salt = 0): number {
    return (hash3i(x, y, z, (this.seed ^ Math.imul(salt + 7, 0x85ebca6b)) | 0) >>> 0) % n;
  }
}

/** Do two boxes intersect (inclusive)? */
export const boxesIntersect = (a: BlockBox, b: BlockBox) =>
  a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY && a.minZ <= b.maxZ && a.maxZ >= b.minZ;
/** 2D footprint intersection (ignores y). */
export const rectsIntersect = (a: BlockBox, b: BlockBox) => a.minX <= b.maxX && a.maxX >= b.minX && a.minZ <= b.maxZ && a.maxZ >= b.minZ;

/** Terrain statistics over a world rectangle (sampled every `step` blocks plus the corners). */
export function groundStats(ctx: StructureContext, x0: number, z0: number, x1: number, z1: number, step = 2): { min: number; max: number; avg: number; water: number; n: number } {
  let min = 999, max = -999, sum = 0, n = 0, water = 0;
  const xs: number[] = [], zs: number[] = [];
  for (let x = x0; x < x1; x += step) xs.push(x);
  xs.push(x1);
  for (let z = z0; z < z1; z += step) zs.push(z);
  zs.push(z1);
  for (const x of xs)
    for (const z of zs) {
      const h = ctx.heightAt(x, z);
      if (h < min) min = h;
      if (h > max) max = h;
      sum += h;
      n++;
      if (h < 62) water++;
    }
  return { min, max, avg: sum / n, water, n };
}

/** Exact per-column min ground height over a rectangle. */
export function minGround(ctx: StructureContext, x0: number, z0: number, x1: number, z1: number): number {
  let m = 999;
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) m = Math.min(m, ctx.heightAt(x, z));
  return m;
}
