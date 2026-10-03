/**
 * Local-frame block writer for structure pieces.
 *
 * A piece is authored in local coordinates (x right, y up, z "back"; the front of a building is the
 * z = 0 side and faces local north) inside a `sx` x `sz` footprint, then placed in the world at an
 * origin with `rot` clockwise quarter turns. The Builder maps local positions and oriented block
 * states (stairs, doors, beds, chests, torches, logs, rails ...) into the world and writes through
 * the chunk-clipped ChunkWriter, so the same code runs unchanged for every chunk a piece touches.
 */
import type { ChunkWriter } from '../../common/writer';
import { B, rotateState } from './blocks';
import { box, type BlockBox } from '../types';
import { chestData, spawnerData } from './blockEntities';
import { IS_SOLID, IS_LIQUID, IS_PLANT, IS_LEAVES, IS_AIR } from '../../common/states';

/** World box of a `sx` x `sy` x `sz` local piece at origin (ox, oy, oz) with rotation `rot`. */
export function localBox(ox: number, oy: number, oz: number, rot: number, sx: number, sy: number, sz: number): BlockBox {
  const odd = rot & 1;
  const wx = odd ? sz : sx, wz = odd ? sx : sz;
  return box(ox, oy, oz, ox + wx - 1, oy + sy - 1, oz + wz - 1);
}

/** Offset (within the rotated footprint) of local (x, z). */
export function rotOffset(rot: number, sx: number, sz: number, x: number, z: number): [number, number] {
  switch (rot & 3) {
    case 0: return [x, z];
    case 1: return [sz - 1 - z, x];
    case 2: return [sx - 1 - x, sz - 1 - z];
    default: return [z, sx - 1 - x];
  }
}

/**
 * Origin so that local (ax, az) of a `sx` x `sz` piece rotated by `rot` lands on world (wx, wz).
 */
export function originFor(wx: number, wz: number, rot: number, sx: number, sz: number, ax: number, az: number): [number, number] {
  const [dx, dz] = rotOffset(rot, sx, sz, ax, az);
  return [wx - dx, wz - dz];
}

/** Rotation that turns local north (the front) to world hfacing `h`. */
export const rotFacing = (h: number) => (h - 2) & 3;

const REPLACEABLE_SOFT = (s: number) => s === 0 || IS_AIR[s >>> 4] === 1 || IS_PLANT[s >>> 4] === 1 || IS_LEAVES[s >>> 4] === 1;

export class Builder {
  constructor(
    readonly w: ChunkWriter,
    readonly ox: number,
    readonly oy: number,
    readonly oz: number,
    readonly rot: number,
    readonly sx: number,
    readonly sz: number,
  ) {}

  wx(x: number, z: number): number {
    return this.ox + rotOffset(this.rot, this.sx, this.sz, x, z)[0];
  }
  wz(x: number, z: number): number {
    return this.oz + rotOffset(this.rot, this.sx, this.sz, x, z)[1];
  }
  /** World hfacing of a local hfacing. */
  face(h: number): number {
    return (h + this.rot) & 3;
  }

  /** Is local column (x, z) inside the chunk being written? */
  inside(x: number, z: number): boolean {
    const [dx, dz] = rotOffset(this.rot, this.sx, this.sz, x, z);
    return this.w.inside(this.ox + dx, this.oz + dz);
  }

  get(x: number, y: number, z: number): number {
    const [dx, dz] = rotOffset(this.rot, this.sx, this.sz, x, z);
    return this.w.get(this.ox + dx, this.oy + y, this.oz + dz);
  }

  /** Set a local block; oriented states are rotated into the world. */
  set(x: number, y: number, z: number, state: number): void {
    const [dx, dz] = rotOffset(this.rot, this.sx, this.sz, x, z);
    this.w.set(this.ox + dx, this.oy + y, this.oz + dz, rotateState(state, this.rot));
  }

  /** Set only if the current block is air / a plant / leaves (or, with `liquid`, also a fluid). */
  setSoft(x: number, y: number, z: number, state: number, liquid = false): void {
    const cur = this.get(x, y, z);
    if (cur < 0) return;
    if (REPLACEABLE_SOFT(cur) || (liquid && IS_LIQUID[cur >>> 4] === 1)) this.set(x, y, z, state);
  }

  /** Set only if the current block is solid (e.g. randomly decaying walls into existing rock). */
  setIfSolid(x: number, y: number, z: number, state: number): void {
    const cur = this.get(x, y, z);
    if (cur > 0 && IS_SOLID[cur >>> 4] === 1 && IS_LIQUID[cur >>> 4] === 0) this.set(x, y, z, state);
  }

  fill(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, state: number | ((x: number, y: number, z: number) => number)): void {
    const xa = Math.min(x0, x1), xb = Math.max(x0, x1), za = Math.min(z0, z1), zb = Math.max(z0, z1);
    const ya = Math.min(y0, y1), yb = Math.max(y0, y1);
    for (let z = za; z <= zb; z++)
      for (let x = xa; x <= xb; x++) {
        if (!this.inside(x, z)) continue;
        for (let y = ya; y <= yb; y++) this.set(x, y, z, typeof state === 'number' ? state : state(x, y, z));
      }
  }

  /** Box shell: walls (and floor/ceiling) of `state`, interior `inner` (undefined = untouched). */
  shell(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, state: number | ((x: number, y: number, z: number) => number), inner?: number): void {
    this.fill(x0, y0, z0, x1, y1, z1, (x, y, z) => {
      const edge = x === x0 || x === x1 || y === y0 || y === y1 || z === z0 || z === z1;
      if (edge) return typeof state === 'number' ? state : state(x, y, z);
      return inner === undefined ? this.get(x, y, z) : inner;
    });
  }

  /** Clear (air) a local volume. */
  clear(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, airState = 0): void {
    this.fill(x0, y0, z0, x1, y1, z1, airState);
  }

  /**
   * Foundation under local column (x, z): fill `state` from local y `fromY` down until solid
   * ground (non-fluid, non-plant solid block) is reached or `minWorldY` is hit.
   */
  foundation(x: number, z: number, fromY: number, state: number, minWorldY = 1): void {
    if (!this.inside(x, z)) return;
    for (let y = fromY; this.oy + y >= minWorldY; y--) {
      const cur = this.get(x, y, z);
      if (y < fromY && cur > 0 && IS_SOLID[cur >>> 4] === 1 && IS_LIQUID[cur >>> 4] === 0 && IS_LEAVES[cur >>> 4] === 0) break;
      this.set(x, y, z, state);
    }
  }

  /** Clear everything above local y `fromY` in a column up to `toY` (inclusive). */
  clearColumn(x: number, z: number, fromY: number, toY: number): void {
    if (!this.inside(x, z)) return;
    for (let y = fromY; y <= toY; y++) this.set(x, y, z, 0);
  }

  /** Chest with a vanilla loot table id (e.g. 'minecraft:chests/village/village_plains_house'). */
  chest(x: number, y: number, z: number, facing: number, lootTable: string, seed: number, extra?: Record<string, unknown>): void {
    const [dx, dz] = rotOffset(this.rot, this.sx, this.sz, x, z);
    const wx = this.ox + dx, wy = this.oy + y, wz = this.oz + dz;
    if (!this.w.inside(wx, wz)) return;
    this.w.set(wx, wy, wz, rotateState(chestState(facing), this.rot));
    this.w.blockEntity(wx, wy, wz, chestData(lootTable, seed ^ (wx * 73856093) ^ (wy * 19349663) ^ (wz * 83492791), extra));
  }

  /** Barrel / other container block with a loot table (state already chosen by caller). */
  container(x: number, y: number, z: number, state: number, id: string, lootTable: string, seed: number): void {
    const [dx, dz] = rotOffset(this.rot, this.sx, this.sz, x, z);
    const wx = this.ox + dx, wy = this.oy + y, wz = this.oz + dz;
    if (!this.w.inside(wx, wz)) return;
    this.w.set(wx, wy, wz, rotateState(state, this.rot));
    this.w.blockEntity(wx, wy, wz, { ...chestData(lootTable, seed ^ (wx * 73856093) ^ (wy * 19349663) ^ (wz * 83492791)), id, type: id });
  }

  /** Monster spawner for an entity id (e.g. 'zombie', 'blaze', 'silverfish'). */
  spawner(x: number, y: number, z: number, entity: string): void {
    const [dx, dz] = rotOffset(this.rot, this.sx, this.sz, x, z);
    const wx = this.ox + dx, wy = this.oy + y, wz = this.oz + dz;
    if (!this.w.inside(wx, wz)) return;
    this.w.set(wx, wy, wz, SPAWNER());
    this.w.blockEntity(wx, wy, wz, spawnerData(entity));
  }

  /** Generic block entity at a local position. */
  blockEntity(x: number, y: number, z: number, data: any): void {
    const [dx, dz] = rotOffset(this.rot, this.sx, this.sz, x, z);
    this.w.blockEntity(this.ox + dx, this.oy + y, this.oz + dz, data);
  }

  /** Entity at a local block position (centred in the block). */
  entity(type: string, x: number, y: number, z: number, data?: any): void {
    const [dx, dz] = rotOffset(this.rot, this.sx, this.sz, x, z);
    this.w.entity(type, this.ox + dx + 0.5, this.oy + y, this.oz + dz + 0.5, data);
  }
}

const chestState = (facing: number) => B('chest', facing & 3);
const SPAWNER = () => B('spawner');
