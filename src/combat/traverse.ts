import type { Arena, Ladder, Obstacle } from '../world/arena';
import { STEP_UP } from '../world/arena';
import { yawFromDir } from '../core/math';

/**
 * What she can do with the world in front of her: over a low wall, up onto a ledge, over a fence,
 * up or down a ladder, down off an edge, across a gap. Found each frame from where she stands and
 * the way she's heading; done with SPACE (A).
 */
export type MoveKind = 'vault' | 'mantle' | 'climb' | 'fence' | 'lower' | 'jump' | 'drop' | 'ladder' | 'ladderDown';

export interface Traversal {
  kind: MoveKind;
  /** The prompt's verb. */
  label: string;
  /** The move's origin in the world (for ledges: the face sits 0.42 m ahead of it) and heading. */
  ox: number;
  oz: number;
  yaw: number;
  /** How far up (+) or down (-) she ends. */
  rise: number;
  /** Forward travel beyond the authored move (a deep wall to vault, a wide gap). */
  extra: number;
  /** The floor she ends on. */
  endY: number;
  ladder?: Ladder;
  ob?: Obstacle;
}

/** The ledge's face this far ahead of a move's origin (the clips are authored to it). */
export const FACE_D = 0.42;
/** Standard heights the clips are authored for. */
export const CLIP_H = { vault: 1.0, mantle: 1.2, climb: 2.1, fence: 2.0, lower: 1.2, lowerHi: 2.1 };

/** Entry and exit distances of a ray (from x,z along fx,fz) through a box's footprint. */
function rayBox(x: number, z: number, fx: number, fz: number, o: Obstacle): { t0: number; t1: number; nx: number; nz: number } | null {
  let t0 = -Infinity, t1 = Infinity, nx = 0, nz = 0;
  for (const [p, d, mn, mx, ax] of [[x, fx, o.minX, o.maxX, 0], [z, fz, o.minZ, o.maxZ, 1]] as [number, number, number, number, number][]) {
    if (Math.abs(d) < 1e-9) {
      if (p < mn || p > mx) return null;
      continue;
    }
    let a = (mn - p) / d, b = (mx - p) / d;
    let sgn = -1;
    if (a > b) {
      [a, b] = [b, a];
      sgn = 1;
    }
    if (a > t0) {
      t0 = a;
      nx = ax === 0 ? sgn : 0;
      nz = ax === 1 ? sgn : 0;
    }
    t1 = Math.min(t1, b);
  }
  if (t0 > t1) return null;
  return { t0, t1, nx, nz };
}

/** Is there room for her standing at (x, z) on the floor at y (nothing in the way, a floor there)? */
function standable(a: Arena, x: number, z: number, y: number, r = 0.3) {
  const g = a.groundAt(x, z, y + 0.05, 0.1);
  if (Math.abs(g - y) > 0.08) return false;
  const [cx, cz, hit] = a.collide(x, z, r, false, y, 1.7);
  return !hit || Math.hypot(cx - x, cz - z) < 0.05;
}

export function findTraversal(a: Arena, x: number, z: number, y: number, fx: number, fz: number, running: boolean): Traversal | null {
  // ---- ladders: at the foot facing it, or at the top facing the edge
  for (const l of a.ladders) {
    const lx = Math.sin(l.yaw), lz = Math.cos(l.yaw);
    const bx = l.x - lx * 0.36, bz = l.z - lz * 0.36;
    if (Math.abs(y - l.y0) < 0.4 && Math.hypot(x - bx, z - bz) < 0.95 && fx * lx + fz * lz > 0.2) {
      return { kind: 'ladder', label: 'CLIMB', ox: bx, oz: bz, yaw: l.yaw, rise: l.y1 - l.y0, extra: 0, endY: l.y1, ladder: l };
    }
    const tx = l.x + lx * 0.55, tz = l.z + lz * 0.55;
    if (Math.abs(y - l.y1) < 0.4 && Math.hypot(x - tx, z - tz) < 0.95 && fx * -lx + fz * -lz > 0.2) {
      return { kind: 'ladderDown', label: 'CLIMB DOWN', ox: tx, oz: tz, yaw: l.yaw, rise: l.y0 - l.y1, extra: 0, endY: l.y0, ladder: l };
    }
  }
  // ---- ledges, walls and fences ahead
  let best: Traversal | null = null;
  let bestT = Infinity;
  for (const o of a.near(x + fx * 0.8, z + fz * 0.8, 1.4)) {
    if (o.ghost || o.climb === false) continue;
    const y0 = o.y0 ?? 0, top = y0 + o.h, rise = top - y;
    if (y0 > y + 0.3 || rise < STEP_UP + 0.04 || rise > 2.6) continue;
    const hit = rayBox(x, z, fx, fz, o);
    if (!hit || hit.t0 > 1.15 || hit.t0 < -0.05) continue;
    // square up to the face (the moves are authored straight at it)
    const ax = -hit.nx, az = -hit.nz;
    if (fx * ax + fz * az < 0.55) continue;
    const px = x + fx * hit.t0, pz = z + fz * hit.t0;
    const depth = ax !== 0 ? o.maxX - o.minX : o.maxZ - o.minZ;
    const yaw = yawFromDir(ax, az);
    const ox = px - ax * FACE_D, oz = pz - az * FACE_D;
    let t: Traversal | null = null;
    // over it: something low and thin with floor beyond
    if (rise <= 1.35 && depth <= 1.05) {
      const lx = px + ax * (depth + 0.62), lz = pz + az * (depth + 0.62);
      if (standable(a, lx, lz, y)) t = { kind: 'vault', label: 'VAULT', ox, oz, yaw, rise, extra: Math.max(0, depth - 0.3), endY: y, ob: o };
    }
    // up onto it: its top a floor, room to stand
    if (!t && (o.walk || rise > 1.35)) {
      const kind: MoveKind = rise <= 1.6 ? 'mantle' : 'climb';
      const land = kind === 'mantle' ? 0.24 : 0.2;
      const lx = px + ax * land, lz = pz + az * land;
      if (standable(a, lx, lz, top, 0.22)) t = { kind, label: 'CLIMB', ox, oz, yaw, rise, extra: 0, endY: top, ob: o };
    }
    // a fence: thin, not to stand on, floor beyond
    if (!t && !o.walk && depth <= 0.4 && rise > 1.35 && rise <= 2.4) {
      const lx = px + ax * (depth + 0.55), lz = pz + az * (depth + 0.55);
      if (standable(a, lx, lz, y)) t = { kind: 'fence', label: 'CLIMB OVER', ox, oz, yaw, rise, extra: 0, endY: y, ob: o };
    }
    if (t && hit.t0 < bestT) {
      best = t;
      bestT = hit.t0;
    }
  }
  if (best) return best;
  // ---- an edge ahead: down it, or over a gap
  let edge = -1;
  for (let s = 0.15; s <= 1.0; s += 0.08) {
    if (a.groundAt(x + fx * s, z + fz * s, y + 0.05, 0.1) < y - STEP_UP - 0.1) {
      edge = s;
      break;
    }
  }
  if (edge < 0) return null;
  const ex = x + fx * edge, ez = z + fz * edge;
  const yaw = yawFromDir(fx, fz);
  // a gap she can clear running: floor again, near her height, within a running jump
  if (running) {
    for (let s = 0.9; s <= 3.4; s += 0.15) {
      const qx = ex + fx * s, qz = ez + fz * s;
      const g = a.groundAt(qx, qz, y + 0.35, 0.1);
      if (g < y - 1.8 || g > y + 0.35) continue;
      if (!standable(a, qx + fx * 0.35, qz + fz * 0.35, g)) continue;
      // (the authored jump lands 2.6 m on from its take-off, which is 0.45 m before the edge)
      const from = edge - 0.45;
      const total = s + 0.45 + 0.35 + 0.2;
      return { kind: 'jump', label: 'JUMP', ox: x + fx * from, oz: z + fz * from, yaw, rise: g - y, extra: total - 2.6, endY: g, ob: undefined };
    }
  }
  const below = a.groundAt(ex + fx * 0.45, ez + fz * 0.45, y - 0.2, 0.1);
  const h = y - below;
  if (h < STEP_UP + 0.1 || h > 7.5 || below < -20) return null;
  if (h <= 2.4) {
    // down backwards, hands on the edge: she turns to face the wall (the move's origin out over the drop)
    const ix = -fx, iz = -fz;
    const fpx = ex - fx * 0.02, fpz = ez - fz * 0.02;
    if (!standable(a, ex + fx * 0.3, ez + fz * 0.3, below)) return null;
    return { kind: 'lower', label: 'CLIMB DOWN', ox: fpx - ix * FACE_D, oz: fpz - iz * FACE_D, yaw: yawFromDir(ix, iz), rise: -h, extra: 0, endY: below };
  }
  if (!standable(a, ex + fx * 0.5, ez + fz * 0.5, below)) return null;
  return { kind: 'drop', label: 'DROP', ox: ex - fx * 0.32, oz: ez - fz * 0.32, yaw, rise: -h, extra: 0, endY: below };
}
