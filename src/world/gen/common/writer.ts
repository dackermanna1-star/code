/**
 * Chunk-clipped block writer used by features and structures.
 *
 * Features are evaluated for the chunk being generated *and* its neighbours; every write goes
 * through this writer, which silently drops positions outside the target chunk. Reads (`get`) are
 * only meaningful inside the target chunk (-1 outside) — feature *decisions* must never depend on
 * blocks outside the target chunk, only on pure functions (terrain sampler, seeds).
 */
import { TREE_REPLACEABLE as TREE_REPLACEABLE_, LEAF_REPLACEABLE as LEAF_REPLACEABLE_ } from './states';

const TREE_REPLACEABLE = TREE_REPLACEABLE_;
const LEAF_REPLACEABLE = LEAF_REPLACEABLE_;

export interface BlockEntityRecord {
  x: number;
  y: number;
  z: number;
  data: any;
}
export interface EntityRecord {
  type: string;
  x: number;
  y: number;
  z: number;
  data?: any;
}

export class ChunkWriter {
  x0 = 0;
  z0 = 0;
  work: Uint16Array = new Uint16Array(0);
  blockEntities: BlockEntityRecord[] = [];
  entities: EntityRecord[] = [];

  reset(cx: number, cz: number, work: Uint16Array): void {
    this.x0 = cx * 16;
    this.z0 = cz * 16;
    this.work = work;
    this.blockEntities = [];
    this.entities = [];
  }

  inside(x: number, z: number): boolean {
    const lx = x - this.x0, lz = z - this.z0;
    return lx >= 0 && lx < 16 && lz >= 0 && lz < 16;
  }

  /** Does the box [x0,x1]x[z0,z1] intersect the target chunk? */
  intersects(xa: number, za: number, xb: number, zb: number): boolean {
    return xb >= this.x0 && xa <= this.x0 + 15 && zb >= this.z0 && za <= this.z0 + 15;
  }

  get(x: number, y: number, z: number): number {
    const lx = x - this.x0, lz = z - this.z0;
    if (lx < 0 || lx > 15 || lz < 0 || lz > 15 || y < 0 || y > 255) return -1;
    return this.work[(y << 8) | (lz << 4) | lx];
  }

  set(x: number, y: number, z: number, state: number): void {
    const lx = x - this.x0, lz = z - this.z0;
    if (lx < 0 || lx > 15 || lz < 0 || lz > 15 || y < 0 || y > 255) return;
    this.work[(y << 8) | (lz << 4) | lx] = state;
  }

  /** Place a log if the target is air / leaves / plants. */
  log(x: number, y: number, z: number, state: number): void {
    const lx = x - this.x0, lz = z - this.z0;
    if (lx < 0 || lx > 15 || lz < 0 || lz > 15 || y < 0 || y > 255) return;
    const i = (y << 8) | (lz << 4) | lx;
    if (TREE_REPLACEABLE[this.work[i] >>> 4]) this.work[i] = state;
  }

  /** Place leaves if the target is air / plants. */
  leaf(x: number, y: number, z: number, state: number): void {
    const lx = x - this.x0, lz = z - this.z0;
    if (lx < 0 || lx > 15 || lz < 0 || lz > 15 || y < 0 || y > 255) return;
    const i = (y << 8) | (lz << 4) | lx;
    if (LEAF_REPLACEABLE[this.work[i] >>> 4]) this.work[i] = state;
  }

  /** Place if the current block is exactly air (0). */
  air(x: number, y: number, z: number, state: number): void {
    const lx = x - this.x0, lz = z - this.z0;
    if (lx < 0 || lx > 15 || lz < 0 || lz > 15 || y < 0 || y > 255) return;
    const i = (y << 8) | (lz << 4) | lx;
    if (this.work[i] === 0) this.work[i] = state;
  }

  /** Place if the predicate table allows the current block id. */
  replace(x: number, y: number, z: number, state: number, table: Uint8Array): void {
    const lx = x - this.x0, lz = z - this.z0;
    if (lx < 0 || lx > 15 || lz < 0 || lz > 15 || y < 0 || y > 255) return;
    const i = (y << 8) | (lz << 4) | lx;
    if (table[this.work[i] >>> 4]) this.work[i] = state;
  }

  blockEntity(x: number, y: number, z: number, data: any): void {
    if (this.inside(x, z)) this.blockEntities.push({ x, y, z, data });
  }

  entity(type: string, x: number, y: number, z: number, data?: any): void {
    if (this.inside(Math.floor(x), Math.floor(z))) this.entities.push(data === undefined ? { type, x, y, z } : { type, x, y, z, data });
  }
}
