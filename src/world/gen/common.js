// Helpers shared by zone generators.
import { W, CF, W_BLOCKS } from '../zonebuilder.js';
import { M } from '../materials.js';

export const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export const pmod = (a, n) => ((a % n) + n) % n;

// prop rotation so the model's front faces (dx, dz)
export function facing(dx, dz) { return Math.atan2(dx, -dz); }

export function flickerChannel(rng, kind) {
  if (kind === 'dying') return rng.int(5, 8);
  if (kind === 'pulse') return rng.int(9, 10);
  if (kind === 'flash') return rng.int(11, 12);
  return rng.int(1, 4);
}

const FIX = {
  panel: { rad: 6.6, int: 0.74 },
  troffer: { rad: 6.8, int: 0.66 },
  tube: { rad: 6.4, int: 0.72 },
  bulb: { rad: 4.6, int: 0.55, color: [1.0, 0.85, 0.62] },
  cage: { rad: 4.2, int: 0.5, color: [1.0, 0.85, 0.6] },
  highbay: { rad: 8, int: 0.8, color: [1.0, 0.95, 0.85] },
};

// Ceiling light fixture + light source. state: 'on' | 'off' | 'flicker' | 'dying' | 'pulse' | 'flash' | 'event'
export function ceilingLight(zb, x, z, kind, state, opts = {}) {
  if (!zb.in(Math.floor(x), Math.floor(z))) return null;
  const i = zb.i(Math.floor(x), Math.floor(z));
  const c = opts.y ?? zb.ceil[i];
  if (Number.isNaN(c)) return null;
  let ch = 0;
  if (state === 'flicker' || state === 'dying' || state === 'pulse' || state === 'flash') ch = flickerChannel(zb.rng, state === 'flicker' ? 'occ' : state);
  if (state === 'event') ch = 13;
  const on = state !== 'off';
  zb.fixture(x, z, kind, on, { ch, rot: opts.rot || 0, y: opts.y, hang: opts.hang, l: opts.l, w: opts.w });
  if (!on) return null;
  const f = FIX[kind] || FIX.panel;
  // the light point sits a little below flush fixtures so the surrounding ceiling still catches some light
  const hang = kind === 'highbay' ? (opts.hang || 1.2) + 0.15 : kind === 'bulb' || kind === 'cage' ? (opts.hang || 0.35) + 0.12 : 0.55;
  return zb.light(x, c - hang, z, { rad: opts.rad ?? f.rad, int: (opts.int ?? f.int) * (opts.mul ?? 1), color: opts.color || f.color, ch });
}

// Lights on a lattice aligned to world coordinates.
export function lightLattice(zb, x0, z0, x1, z1, sx, sz, kind, opts = {}) {
  const r = zb.rng;
  const ox = opts.ox ?? 0, oz = opts.oz ?? 0;
  const startX = x0 + pmod(ox - x0, sx), startZ = z0 + pmod(oz - z0, sz);
  for (let z = startZ; z < z1; z += sz) {
    for (let x = startX; x < x1; x += sx) {
      if (!zb.in(x, z)) continue;
      const i = zb.i(x, z);
      if (zb.solid[i] || Number.isNaN(zb.ceil[i]) || (zb.flags[i] & (CF.HOLE_CEIL | CF.VOID))) continue;
      if (opts.test && !opts.test(x, z)) continue;
      let state = 'on';
      const u = r.next();
      if (u < (opts.fail ?? 0.06)) state = 'off';
      else if (u < (opts.fail ?? 0.06) + (opts.flicker ?? 0.05)) state = r.chance(0.3) ? 'dying' : 'flicker';
      ceilingLight(zb, x + 0.5, z + 0.5, kind, state, { rot: opts.rot, mul: opts.mul, color: opts.color, rad: opts.rad });
    }
  }
}

export function freeCell(zb, x, z) {
  if (!zb.in(x, z)) return false;
  const i = zb.i(x, z);
  return !zb.solid[i] && !Number.isNaN(zb.floor[i]) && !(zb.flags[i] & (CF.VOID | CF.GATE | CF.STAIRS | CF.NOPROPS));
}

// cell is free and has no thin wall on any side (good spot for a free-standing prop)
export function openCell(zb, x, z) {
  if (!freeCell(zb, x, z)) return false;
  if (zb.getWall(x, z, 'W') || zb.getWall(x, z, 'N') || zb.getWall(x + 1, z, 'W') || zb.getWall(x, z + 1, 'N')) return false;
  return true;
}

// Is there a wall face bounding cell (x,z) on side (dx,dz)? Returns {x,z,face} for a decal/prop spot.
export function wallFace(zb, x, z, dx, dz) {
  if (!freeCell(zb, x, z)) return null;
  const nx = x + dx, nz = z + dz;
  let thin = 0;
  if (dx === -1) thin = zb.getWall(x, z, 'W');
  else if (dx === 1) thin = zb.getWall(nx, z, 'W');
  else if (dz === -1) thin = zb.getWall(x, z, 'N');
  else thin = zb.getWall(x, nz, 'N');
  const solidN = zb.in(nx, nz) && zb.solid[zb.i(nx, nz)];
  const full = thin === W.WALL || thin === W.FULL;
  if (!full && !solidN) return null;
  const off = full ? 0.1 : 0;
  const face = dx === -1 ? 'px' : dx === 1 ? 'nx' : dz === -1 ? 'pz' : 'nz';
  const px = dx === 0 ? x + 0.5 : dx < 0 ? x + off : x + 1 - off;
  const pz = dz === 0 ? z + 0.5 : dz < 0 ? z + off : z + 1 - off;
  return { x: px, z: pz, face, dx, dz };
}

// random wall spots in a rect
export function findWallSpots(zb, x0, z0, x1, z1, count, rng) {
  const out = [];
  for (let k = 0; k < count * 8 && out.length < count; k++) {
    const x = rng.int(x0, x1 - 1), z = rng.int(z0, z1 - 1);
    const [dx, dz] = rng.pick(DIRS4);
    const f = wallFace(zb, x, z, dx, dz);
    if (f) out.push(f);
  }
  return out;
}

export function scatter(zb, x0, z0, x1, z1, n, rng, fn) {
  for (let k = 0; k < n; k++) {
    const x = rng.int(x0, x1 - 1), z = rng.int(z0, z1 - 1);
    if (!openCell(zb, x, z)) continue;
    fn(x, z);
  }
}

// mount a prop against a wall face (front facing into the room)
export function propOnWall(zb, f, type, y, opts = {}, depth = 0) {
  const rot = facing(-f.dx, -f.dz);
  return zb.prop(type, f.x - f.dx * depth, y, f.z - f.dz * depth, rot, opts);
}

// carpet / floor stains etc.
export function floorDecal(zb, x, z, tex, size, rng, opts = {}) {
  const y = zb.getFloor(Math.floor(x), Math.floor(z));
  if (Number.isNaN(y)) return;
  zb.decal(x, y, z, 'up', size, size, tex, { rot: rng.range(0, Math.PI * 2), ...opts });
}

export function isBlockingWall(t) { return W_BLOCKS.has(t); }

// Default per-zone environment values (fog / sound) used by the game for ambience
export function env(o) {
  return Object.assign({ fog: [0.36, 0.32, 0.17], fogNear: 4, fogFar: 34, hum: 0.6, hvac: 0.5, reverb: 'room', tone: 'yellow' }, o);
}

export { W, CF, M };
