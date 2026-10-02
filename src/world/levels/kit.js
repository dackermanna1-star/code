// Helpers for building levels. See docs/LEVELS.md for the whole picture.
//
// Levels are endless, so generators work in absolute coordinates: a zone generator fills only
// its own rectangle [zb.x0, zb.x1) x [zb.z0, zb.z1) of a structure that may span many zones,
// using coordinate hashes (hr) instead of the zone's rng whenever neighbours must agree.
import { CF, W, M, env, ceilingLight, lightLattice, findWallSpots, propOnWall, facing, stairs, pmod, freeCell, scatter } from '../gen/common.js';
import { voidAll, FACE, only, cbox, owns, kRange, hr } from '../pocket/e_util.js';
import { levelDoor, findDoorSpot, dimOfLevel, defineLevel } from '../levels.js';
import { vnoise2, fbm2 } from '../../core/rng.js';

export { CF, W, M, env, ceilingLight, lightLattice, findWallSpots, propOnWall, facing, stairs, pmod, freeCell, scatter };
export { voidAll, FACE, only, cbox, owns, kRange, hr, levelDoor, findDoorSpot, dimOfLevel, defineLevel, vnoise2, fbm2 };

// Zone-type flags every level zone should start from: open borders (zones join seamlessly), no
// stairwells, holes or portals from the main building, never picked at random.
export const LEVEL_ZONE = { border: 'open', gate: 'open', allowStairs: false, allowPortals: false, allowHoles: false, weight: () => 0 };

// Open ground under the sky: every cell gets floor h and no ceiling.
export function openGround(zb, mat, h = 0) {
  zb.floor.fill(h);
  zb.ceil.fill(NaN);
  if (mat) zb.fmat.fill(mat);
  zb.flags.fill(0);
}

// Rolling terrain: floor height from height(x, z) at each cell centre (absolute metres), drawn as
// a smooth surface. Keep slopes gentle (< 0.35 m between neighbouring cells) so it can be walked.
export function terrain(zb, height, mat, opts = {}) {
  zb.fill(zb.x0, zb.z0, zb.x1, zb.z1, (x, z, i) => {
    const h = height(x + 0.5, z + 0.5);
    zb.floor[i] = h;
    zb.ceil[i] = opts.ceil ?? NaN;
    if (mat) zb.fmat[i] = typeof mat === 'function' ? mat(x, z, h) : mat;
    zb.flags[i] = (zb.flags[i] & ~CF.VOID) | CF.SMOOTH;
  });
}

// Smooth 0..1 noise in absolute coordinates (scale = feature size in metres).
export const noise = (x, z, scale, seed = 0) => vnoise2(x / scale, z / scale, seed);
export const fbm = (x, z, scale, seed = 0, oct = 3) => fbm2(x / scale, z / scale, seed, oct);

// A sheet of water at height y over [x0, x1) x [z0, z1) (clipped to the zone). You walk on the
// floor underneath it (keep that 0.2-1.2 m below for wading); the surface itself does not collide.
// mat should be a water material (WOBBLE | SCROLL flags); alpha 0.35-0.75.
export function water(zb, x0, z0, x1, z1, y, mat, alpha = 0.55, opts = {}) {
  return cbox(zb, x0, y - 0.02, z0, x1, y, z1, mat, { alpha, collide: false, skip: only(FACE.PY), sub: opts.sub ?? 2, tint: opts.tint });
}

// A pole with a lamp on top (street lamp, path light). Light reaches about rad metres.
export function poleLamp(zb, x, z, h, opts = {}) {
  if (!owns(zb, x, z)) return;
  const y = opts.y ?? zb.getFloor(Math.floor(x), Math.floor(z));
  const base = Number.isFinite(y) ? y : 0;
  const pm = opts.poleMat ?? M.metal_dark;
  zb.box(x - 0.07, base, z - 0.07, x + 0.07, base + h, z + 0.07, pm);
  if (opts.arm !== false) zb.box(x - 0.05, base + h - 0.08, z - 0.05, x + (opts.armX ?? 0.9), base + h, z + 0.05, pm);
  const lx = x + (opts.arm !== false ? (opts.armX ?? 0.9) - 0.15 : 0);
  if (opts.on !== false) {
    zb.box(lx - 0.18, base + h - 0.16, z - 0.12, lx + 0.18, base + h - 0.06, z + 0.12, opts.lampMat ?? M.glow_bulb);
    zb.light(lx, base + h - 0.4, z, { color: opts.color || [1.0, 0.78, 0.45], rad: opts.rad ?? 9, int: opts.int ?? 0.7, ch: opts.ch || 0 });
  } else zb.box(lx - 0.18, base + h - 0.16, z - 0.12, lx + 0.18, base + h - 0.06, z + 0.12, M.metal_dark);
}

// Fill a whole zone with nothing (unreachable void: sky only).
export { voidAll as emptyZone };
