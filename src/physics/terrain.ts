/**
 * Terrain → rigid-body collider data (pure, no Rapier dependency): per 16³ section, the unit
 * cubes grouped by surface class (fed to Rapier voxel colliders) and the partial collision boxes
 * of non-cube blocks (slabs, stairs, fences ... fed to cuboid colliders).
 */
import { BLOCKS, T_SOLID } from '../world/blocks/registry';
import { getCollisionBoxes } from '../world/blocks/models';
import { surfaceClassOfId, SURFACE_CLASS_COUNT } from './materials';

/** 0 = no collision, 1 = always a unit cube, 2 = shape depends on state/neighbours. */
const KIND = new Int8Array(4096).fill(-1);
function kindOf(id: number): number {
  let k = KIND[id];
  if (k < 0) {
    const d = BLOCKS[id];
    if (!d || !T_SOLID[id]) k = 0;
    else if (d.shape === 'cube' || d.shape === 'grass_block' || d.shape === 'leaves') k = 1;
    else k = 2;
    KIND[id] = k;
  }
  return k;
}

export type BlockGetter = (x: number, y: number, z: number) => number;

export interface BlockCollision {
  /** 0 none, 1 unit cube voxel, 2 partial boxes */
  kind: 0 | 1 | 2;
  cls: number;
  /** block-local boxes [x0,y0,z0,x1,y1,z1]* for kind 2 */
  boxes: number[] | null;
}

const tmp: number[] = [];

/** Collision of one block state at world position (x,y,z). */
export function blockCollision(state: number, get: BlockGetter, x: number, y: number, z: number): BlockCollision {
  if (state === 0) return { kind: 0, cls: 0, boxes: null };
  const id = state >>> 4;
  const k = kindOf(id);
  if (k === 0) return { kind: 0, cls: 0, boxes: null };
  const cls = surfaceClassOfId(id);
  if (k === 1) return { kind: 1, cls, boxes: null };
  tmp.length = 0;
  getCollisionBoxes(state, (dx, dy, dz) => get(x + dx, y + dy, z + dz), tmp);
  if (tmp.length === 0) return { kind: 0, cls, boxes: null };
  if (tmp.length === 6 && tmp[0] === 0 && tmp[1] === 0 && tmp[2] === 0 && tmp[3] === 1 && tmp[4] === 1 && tmp[5] === 1) return { kind: 1, cls, boxes: null };
  return { kind: 2, cls, boxes: tmp.slice() };
}

export interface SectionColliderData {
  /** Voxel grid coordinates (section-local, 0..15) per surface class. */
  voxels: Int32Array[];
  /** Partial boxes: section-local block index (y<<8|z<<4|x) -> world-space boxes. */
  partial: Map<number, number[]>;
  /** Number of unit voxels. */
  count: number;
}

const coordBuf: number[][] = Array.from({ length: SURFACE_CLASS_COUNT }, () => []);

/**
 * Build collider data for the section with origin (ox,oy,oz). `section` (optional) is the raw
 * Uint16Array of the section for fast access; `get` reads any world block (neighbours).
 */
export function buildSectionData(get: BlockGetter, ox: number, oy: number, oz: number, section?: Uint16Array | null): SectionColliderData {
  for (const b of coordBuf) b.length = 0;
  const partial = new Map<number, number[]>();
  let count = 0;
  if (section !== null) {
    for (let i = 0; i < 4096; i++) {
      const st = section ? section[i] : get(ox + (i & 15), oy + (i >> 8), oz + ((i >> 4) & 15));
      if (st === 0) continue;
      const id = st >>> 4;
      const k = kindOf(id);
      if (k === 0) continue;
      const lx = i & 15, ly = i >> 8, lz = (i >> 4) & 15;
      if (k === 1) {
        coordBuf[surfaceClassOfId(id)].push(lx, ly, lz);
        count++;
        continue;
      }
      const c = blockCollision(st, get, ox + lx, oy + ly, oz + lz);
      if (c.kind === 1) {
        coordBuf[c.cls].push(lx, ly, lz);
        count++;
      } else if (c.kind === 2 && c.boxes) {
        const wb: number[] = [];
        for (let j = 0; j < c.boxes.length; j += 6) {
          wb.push(ox + lx + c.boxes[j], oy + ly + c.boxes[j + 1], oz + lz + c.boxes[j + 2], ox + lx + c.boxes[j + 3], oy + ly + c.boxes[j + 4], oz + lz + c.boxes[j + 5]);
        }
        partial.set(i, wb);
      }
    }
  }
  return { voxels: coordBuf.map((b) => new Int32Array(b)), partial, count };
}

/** Water level helpers for buoyancy: surface height of the fluid column at (x, y, z) or -Infinity. */
export function fluidSurface(get: BlockGetter, x: number, y: number, z: number, liquidId: (state: number) => number): { surface: number; kind: number } {
  const st = get(x, y, z);
  const k = liquidId(st);
  if (!k) return { surface: -Infinity, kind: 0 };
  let top = y;
  for (let i = 0; i < 16; i++) {
    const a = get(x, top + 1, z);
    if (liquidId(a) !== k) break;
    top++;
  }
  const s = get(x, top, z);
  const lvl = s & 7;
  const above = get(x, top + 1, z);
  const h = (s & 8) || liquidId(above) ? 1 : (8 - lvl) / 9;
  return { surface: top + h, kind: k };
}
