/**
 * Block-state helpers for structure building: cached name -> state lookup and rotation of
 * oriented states (stairs, doors, beds, chests, logs, rails, torches ...) by quarter turns.
 *
 * Rotation convention (same as `rotateBoxesY` in blocks/models.ts): one quarter turn is clockwise
 * seen from above, (x, z) -> (-z, x), i.e. south -> west -> north -> east. Horizontal facings
 * (hfacing S=0, W=1, N=2, E=3) therefore rotate by `(h + r) & 3`.
 */
import '../../../blocks/blocks';
import { BLOCKS, BLOCK_BY_NAME, S } from '../../../blocks/registry';

const cache = new Map<string, number>();

/** State of a block by name (throws on unknown names, so typos fail fast in tests). */
export function B(name: string, meta = 0): number {
  const k = meta ? `${name}:${meta}` : name;
  let s = cache.get(k);
  if (s === undefined) {
    s = S(name, meta);
    cache.set(k, s);
  }
  return s;
}

/** True if the block exists in the registry. */
export const hasBlock = (name: string) => BLOCK_BY_NAME.has(name);

/** Horizontal facings (hfacing meta). */
export const SOUTH = 0, WEST = 1, NORTH = 2, EAST = 3;
/** Unit vectors of hfacing values. */
export const HDX = [0, -1, 0, 1];
export const HDZ = [1, 0, -1, 0];
/** 6-way Dir values. */
export const D_DOWN = 0, D_UP = 1, D_NORTH = 2, D_SOUTH = 3, D_WEST = 4, D_EAST = 5;
export const H_OF_DIR = [-1, -1, 2, 0, 1, 3];
export const DIR_OF_H = [3, 4, 2, 5];

// rotation kinds per block id
const R_NONE = 0, R_H2 = 1, R_DIR6 = 2, R_AXIS = 3, R_RAIL = 4, R_RAIL6 = 5, R_DOOR = 6, R_ATTACH = 7, R_TORCH = 8;
const KIND = new Uint8Array(4096);
for (const b of BLOCKS) {
  let k = R_NONE;
  switch (b.shape) {
    case 'stairs': case 'bed': case 'chest': case 'trapdoor': case 'fence_gate': case 'ladder': case 'anvil':
    case 'repeater': case 'comparator': case 'campfire': case 'end_portal_frame':
      k = R_H2; break;
    case 'door': k = R_DOOR; break;
    case 'torch': k = R_TORCH; break;
    case 'lever': case 'button': k = R_ATTACH; break;
    case 'rail': k = b.name === 'rail' ? R_RAIL : R_RAIL6; break;
    case 'end_rod': case 'piston': case 'piston_head': k = R_DIR6; break;
    default:
      if (b.orient === 'hfacing') k = R_H2;
      else if (b.orient === 'facing') k = R_DIR6;
      else if (b.orient === 'axis') k = R_AXIS;
  }
  KIND[b.id] = k;
}

const rotDir = (d: number, r: number) => (d >= 2 && d <= 5 ? DIR_OF_H[(H_OF_DIR[d] + r) & 3] : d);
// rails: 0 NS, 1 EW, 2..5 ascending E, W, N, S, 6..9 curves SE, SW, NW, NE — one clockwise turn
const RAIL_CW = [1, 0, 5, 4, 2, 3, 7, 8, 9, 6];

/** Rotate a block state by `r` clockwise quarter turns. */
export function rotateState(state: number, r: number): number {
  r &= 3;
  if (!r || !state) return state;
  const id = state >>> 4;
  const m = state & 15;
  switch (KIND[id]) {
    case R_H2: return (state & ~3) | ((m + r) & 3);
    case R_DOOR: return m & 8 ? state : (state & ~3) | ((m + r) & 3);
    case R_DIR6: return (state & ~7) | rotDir(m & 7, r);
    case R_ATTACH: return (state & ~7) | rotDir(m & 7, r);
    case R_TORCH: return m >= 2 ? (state & ~15) | rotDir(m, r) : state;
    case R_AXIS: return r & 1 && (m & 3) !== 0 ? (state & ~3) | (3 - (m & 3)) : state;
    case R_RAIL: {
      let s = m;
      for (let i = 0; i < r; i++) s = RAIL_CW[s] ?? s;
      return (state & ~15) | s;
    }
    case R_RAIL6: {
      let s = m & 7;
      for (let i = 0; i < r; i++) s = s < 6 ? RAIL_CW[s] : s;
      return (state & ~7) | s;
    }
    default: return state;
  }
}

// ------------------------------------------------------------------------------------------
// Convenience constructors (local hfacing; the Builder rotates them into the world)
// ------------------------------------------------------------------------------------------

/** Stairs whose tall back side points toward `facing`; `top` = upside down. */
export const stairs = (name: string, facing: number, top = false) => B(name, (facing & 3) | (top ? 4 : 0));
/** Slab: 0 bottom, 1 top, 2 double. */
export const slab = (name: string, half: 0 | 1 | 2 = 0) => B(name, half);
/** Log / pillar with axis 0 = y, 1 = x, 2 = z. */
export const axis = (name: string, a: number) => B(name, a);
/** Wall torch pointing toward hfacing `h` (attached to the block on the opposite side). */
export const wallTorch = (h: number, name = 'torch') => B(name, DIR_OF_H[h & 3]);
