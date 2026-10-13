import type { BlockAccess } from './chunk';
import { blockDef } from './blocks';

export interface RayHit {
  x: number;
  y: number;
  z: number;
  /** Face normal of the hit face. */
  nx: number;
  ny: number;
  nz: number;
  dist: number;
  id: number;
}

/**
 * Voxel DDA traversal (Amanatides & Woo). `filter` decides which blocks stop
 * the ray (default: anything that is not air/liquid).
 */
export function raycastVoxels(
  w: BlockAccess,
  ox: number, oy: number, oz: number,
  dx: number, dy: number, dz: number,
  maxDist: number,
  filter: (id: number) => boolean = defaultFilter,
): RayHit | null {
  const len = Math.hypot(dx, dy, dz);
  if (len === 0) return null;
  dx /= len; dy /= len; dz /= len;
  let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
  const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
  const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  const tDeltaZ = dz !== 0 ? Math.abs(1 / dz) : Infinity;
  let tMaxX = dx !== 0 ? (dx > 0 ? x + 1 - ox : ox - x) * tDeltaX : Infinity;
  let tMaxY = dy !== 0 ? (dy > 0 ? y + 1 - oy : oy - y) * tDeltaY : Infinity;
  let tMaxZ = dz !== 0 ? (dz > 0 ? z + 1 - oz : oz - z) * tDeltaZ : Infinity;
  let nx = 0, ny = 0, nz = 0, t = 0;
  // Check the starting cell too (ray starting inside a block).
  for (let i = 0; i < 512; i++) {
    const id = w.getBlock(x, y, z);
    if (filter(id)) return { x, y, z, nx, ny, nz, dist: t, id };
    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      t = tMaxX; x += stepX; tMaxX += tDeltaX; nx = -stepX; ny = 0; nz = 0;
    } else if (tMaxY < tMaxZ) {
      t = tMaxY; y += stepY; tMaxY += tDeltaY; nx = 0; ny = -stepY; nz = 0;
    } else {
      t = tMaxZ; z += stepZ; tMaxZ += tDeltaZ; nx = 0; ny = 0; nz = -stepZ;
    }
    if (t > maxDist) return null;
  }
  return null;
}

function defaultFilter(id: number) {
  if (id === 0) return false;
  const d = blockDef(id);
  return !d.liquid;
}

/** Ray stops only on blocks that collide (for bullets/line of sight). */
export const solidFilter = (id: number) => blockDef(id).solid;
