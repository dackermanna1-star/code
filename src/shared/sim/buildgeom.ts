import { BUILD_PITCH } from '../constants';
import type { PieceType } from '../data/building';

/**
 * Geometry of modular building pieces on the 4-block building grid.
 *
 * A building cell (i, j) spans x = 4i..4i+4, z = 4j..4j+4 and a level whose
 * floor layer is at y = oy. Grid *lines* (x = 4i, z = 4j) hold walls and
 * corner pillars; the 3x3 interior holds the room. Walls are therefore shared
 * between neighbouring cells (west wall of cell i = east wall of cell i-1),
 * rooms are 3x3x3 blocks, and the floor of level k+1 is the ceiling of level k.
 *
 * Each piece occupies:
 *   cells  - voxels filled with the piece's tier block (damage hits the piece)
 *   holes  - voxels inside the footprint deliberately left empty (doorway/window)
 *   frames - derived voxels (floor rings, corner pillars) that exist while any
 *            claiming piece exists; never damaged directly.
 *   slots  - logical sockets the piece occupies (for exclusivity & support)
 */

export type Side = 'w' | 'n';
export type Cell = [number, number, number];

export interface Socket {
  type: PieceType;
  i: number;
  j: number;
  /** Floor layer y of the level. */
  oy: number;
  /** Wall-like pieces & doors. */
  side?: Side;
  /** Stairs rotation 0..3. */
  rot?: number;
}

export interface PieceGeometry {
  cells: Cell[];
  holes: Cell[];
  frames: Cell[];
  slots: string[];
  /** Approximate centre (for reach checks & UI). */
  center: [number, number, number];
}

const P = BUILD_PITCH;
export const slotKey = (i: number, j: number, oy: number, slot: string) => `${i},${j},${oy},${slot}`;
export const WALL_TYPES: ReadonlySet<PieceType> = new Set(['wall', 'doorway', 'window', 'half_wall']);
export const FULL_WALL_TYPES: ReadonlySet<PieceType> = new Set(['wall', 'doorway', 'window']);
export const FLOOR_TYPES: ReadonlySet<PieceType> = new Set(['foundation', 'floor']);

export function socketKey(s: Socket): string {
  return `${s.type}:${s.i},${s.j},${s.oy},${s.side ?? ''},${s.rot ?? 0}`;
}

function floorRing(ox: number, oy: number, oz: number, out: Cell[]) {
  for (let a = 0; a <= P; a++) {
    out.push([ox + a, oy, oz]);
    out.push([ox + a, oy, oz + P]);
  }
  for (let b = 1; b < P; b++) {
    out.push([ox, oy, oz + b]);
    out.push([ox + P, oy, oz + b]);
  }
}

/** Rotate interior local coords (a,b in 1..3) by r quarter turns. */
function rot(a: number, b: number, r: number): [number, number] {
  switch (r & 3) {
    case 0: return [a, b];
    case 1: return [P - b, a];
    case 2: return [P - a, P - b];
    default: return [b, P - a];
  }
}

export function pieceGeometry(s: Socket): PieceGeometry {
  const ox = s.i * P, oz = s.j * P, oy = s.oy;
  const cells: Cell[] = [];
  const holes: Cell[] = [];
  const frames: Cell[] = [];
  const slots: string[] = [];
  let center: [number, number, number] = [ox + P / 2, oy + 0.5, oz + P / 2];

  switch (s.type) {
    case 'foundation':
    case 'floor': {
      for (let b = 1; b < P; b++) for (let a = 1; a < P; a++) cells.push([ox + a, oy, oz + b]);
      floorRing(ox, oy, oz, frames);
      slots.push(slotKey(s.i, s.j, oy, 'floor'));
      break;
    }
    case 'wall':
    case 'doorway':
    case 'window':
    case 'half_wall':
    case 'door': {
      const side = s.side ?? 'w';
      const H = s.type === 'half_wall' ? 1 : 3;
      const at = (t: number, h: number): Cell => (side === 'w' ? [ox, oy + h, oz + t] : [ox + t, oy + h, oz]);
      const isHole = (t: number, h: number) =>
        (s.type === 'doorway' || s.type === 'door') ? t === 2 && (h === 1 || h === 2) : s.type === 'window' ? t === 2 && h === 2 : false;
      if (s.type === 'door') {
        cells.push(at(2, 1), at(2, 2));
        slots.push(slotKey(s.i, s.j, oy, 'door' + side));
      } else {
        for (let h = 1; h <= H; h++) for (let t = 1; t < P; t++) (isHole(t, h) ? holes : cells).push(at(t, h));
        for (let h = 1; h <= H; h++) {
          frames.push(at(0, h));
          frames.push(at(P, h));
        }
        for (let t = 0; t <= P; t++) frames.push(at(t, 0));
        slots.push(slotKey(s.i, s.j, oy, side));
      }
      const c = at(2, 2);
      center = [c[0] + 0.5, c[1], c[2] + 0.5];
      break;
    }
    case 'stairs': {
      const r = s.rot ?? 0;
      const put = (a: number, b: number, y: number) => {
        const [ra, rb] = rot(a, b, r);
        cells.push([ox + ra, y, oz + rb]);
      };
      put(1, 1, oy + 1);
      put(2, 1, oy + 1); put(2, 1, oy + 2);
      put(3, 1, oy + 1); put(3, 1, oy + 2); put(3, 1, oy + 3);
      for (let b = 2; b < P; b++) for (let a = 1; a < P; a++) put(a, b, oy + P);
      // stairwell opening (row b=1 at the upper floor level) stays open
      for (let a = 1; a < P; a++) {
        const [ra, rb] = rot(a, 1, r);
        holes.push([ox + ra, oy + P, oz + rb]);
      }
      floorRing(ox, oy + P, oz, frames);
      slots.push(slotKey(s.i, s.j, oy, 'stair'));
      slots.push(slotKey(s.i, s.j, oy + P, 'floor'));
      center = [ox + P / 2, oy + 2, oz + P / 2];
      break;
    }
  }
  return { cells, holes, frames, slots, center };
}

/**
 * Supporters of a piece for the stability graph: list of [slotKey, factor].
 * A piece's stability = max over existing supporters of (supporter stability * factor).
 * Foundations are grounded (stability 1) and have no supporters.
 */
export function supportersOf(s: Socket): Array<{ slot: string; factor: number; fullWallOnly?: boolean }> {
  const { i, j, oy } = s;
  switch (s.type) {
    case 'foundation':
      return [];
    case 'floor':
      return [
        { slot: slotKey(i, j, oy - P, 'w'), factor: 0.8, fullWallOnly: true },
        { slot: slotKey(i + 1, j, oy - P, 'w'), factor: 0.8, fullWallOnly: true },
        { slot: slotKey(i, j, oy - P, 'n'), factor: 0.8, fullWallOnly: true },
        { slot: slotKey(i, j + 1, oy - P, 'n'), factor: 0.8, fullWallOnly: true },
        { slot: slotKey(i - 1, j, oy, 'floor'), factor: 0.5 },
        { slot: slotKey(i + 1, j, oy, 'floor'), factor: 0.5 },
        { slot: slotKey(i, j - 1, oy, 'floor'), factor: 0.5 },
        { slot: slotKey(i, j + 1, oy, 'floor'), factor: 0.5 },
      ];
    case 'wall':
    case 'doorway':
    case 'window':
    case 'half_wall': {
      const side = s.side ?? 'w';
      const other = side === 'w' ? slotKey(i - 1, j, oy, 'floor') : slotKey(i, j - 1, oy, 'floor');
      return [
        { slot: slotKey(i, j, oy, 'floor'), factor: 1 },
        { slot: other, factor: 1 },
        { slot: slotKey(i, j, oy - P, side), factor: 0.9, fullWallOnly: true },
      ];
    }
    case 'stairs':
      return [{ slot: slotKey(i, j, oy, 'floor'), factor: 0.9 }];
    case 'door':
      return [{ slot: slotKey(i, j, oy, s.side ?? 'w'), factor: 1 }];
  }
}

/** Building cell coordinates for a world position. */
export const buildCellOf = (x: number, z: number): [number, number] => [Math.floor(x / P), Math.floor(z / P)];

/**
 * Resolve a socket for a piece type from an aim ray hit. `hit` is the hit
 * point slightly *outside* the hit face (i.e. in the air in front of it).
 * `levelBase` returns the oy level base for a nearby building (or null).
 * Returns null if no sensible socket exists.
 */
export function resolveSocket(
  type: PieceType,
  hx: number, hy: number, hz: number,
  levelOf: (x: number, y: number, z: number) => number | null,
  rotation = 0,
): Socket | null {
  const i = Math.floor(hx / P), j = Math.floor(hz / P);
  if (type === 'foundation') {
    const lv = levelOf(hx, hy, hz);
    const oy = lv ?? Math.floor(hy);
    return { type, i, j, oy };
  }
  const lv = levelOf(hx, hy, hz);
  if (lv === null) return null;
  if (type === 'floor') {
    return { type, i, j, oy: lv };
  }
  if (type === 'stairs') {
    return { type, i, j, oy: lv, rot: rotation & 3 };
  }
  // wall-like: nearest grid line of the cell
  const fx = hx - i * P, fz = hz - j * P;
  const dW = fx, dE = P - fx, dN = fz, dS = P - fz;
  const m = Math.min(dW, dE, dN, dS);
  if (m === dW) return { type, i, j, oy: lv, side: 'w' };
  if (m === dE) return { type, i: i + 1, j, oy: lv, side: 'w' };
  if (m === dN) return { type, i, j, oy: lv, side: 'n' };
  return { type, i, j: j + 1, oy: lv, side: 'n' };
}
