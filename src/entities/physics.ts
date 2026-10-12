// Entity vs voxel collision. Bodies are axis-aligned boxes anchored at the feet centre.
// Movement is substepped so that no axis moves more than ~0.45 voxels per step (no tunnelling),
// with automatic step-up over small ledges and depenetration when terrain appears inside a body.
import { VoxelWorld } from '../world/world';
import { KIND, Kind, SOLID_COLLIDE, DENSITY, AIR } from '../world/materials';

export interface Body {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  hw: number; // half width (x and z)
  h: number; // height
  onGround: boolean;
  /** fraction of the body inside liquid (0..1) */
  liquid: number;
  /** most common liquid touched */
  liquidMat: number;
  hitWallX: boolean;
  hitWallZ: boolean;
  hitCeiling: boolean;
  stepUp: number; // max voxels to auto-step
  stuck: boolean;
  /** consecutive ticks spent stuck */
  stuckTicks: number;
}

export function makeBody(x: number, y: number, z: number, hw: number, h: number, stepUp = 0): Body {
  return {
    x, y, z, vx: 0, vy: 0, vz: 0, hw, h, onGround: false, liquid: 0, liquidMat: AIR,
    hitWallX: false, hitWallZ: false, hitCeiling: false, stepUp, stuck: false, stuckTicks: 0,
  };
}

const EPS = 1e-4;

/** Diagnostics: how often bodies had to be pushed out of terrain, and how often that failed. */
export const collisionStats = { depenetrations: 0, stuck: 0 };

export function boxCollides(world: VoxelWorld, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): boolean {
  const ix0 = Math.floor(x0), iy0 = Math.floor(y0), iz0 = Math.floor(z0);
  const ix1 = Math.floor(x1 - EPS), iy1 = Math.floor(y1 - EPS), iz1 = Math.floor(z1 - EPS);
  for (let y = iy0; y <= iy1; y++)
    for (let z = iz0; z <= iz1; z++)
      for (let x = ix0; x <= ix1; x++) if (SOLID_COLLIDE[world.get(x, y, z)]) return true;
  return false;
}

function collidesAt(world: VoxelWorld, b: Body, x: number, y: number, z: number): boolean {
  return boxCollides(world, x - b.hw, y, z - b.hw, x + b.hw, y + b.h, z + b.hw);
}

/**
 * Find the nearest free spot for a body within `maxR` voxels (upwards first, then sideways and
 * diagonally, ring by ring) and move it there. Used when spawning and for bodies that stay buried.
 */
export function placeBody(world: VoxelWorld, b: Body, maxR = 10): boolean {
  if (!collidesAt(world, b, b.x, b.y, b.z)) return true;
  for (let r = 1; r <= maxR; r++) {
    for (let dy = r; dy >= -r; dy--) {
      const ring = r - Math.abs(dy);
      // points on the horizontal ring at this height (8 directions)
      const pts: [number, number][] = ring === 0 ? [[0, 0]] : [[ring, 0], [-ring, 0], [0, ring], [0, -ring], [ring, ring], [-ring, ring], [ring, -ring], [-ring, -ring]];
      for (const [dx, dz] of pts) {
        if (!collidesAt(world, b, b.x + dx, b.y + dy, b.z + dz)) {
          b.x += dx;
          b.y += dy;
          b.z += dz;
          b.stuck = false;
          b.stuckTicks = 0;
          return true;
        }
      }
    }
  }
  return false;
}

/** Try to push a body out of solid terrain. Returns true if free afterwards. */
export function depenetrate(world: VoxelWorld, b: Body): boolean {
  if (!collidesAt(world, b, b.x, b.y, b.z)) {
    b.stuck = false;
    b.stuckTicks = 0;
    return true;
  }
  for (let k = 1; k <= 6; k++) {
    const cand: [number, number, number][] = [
      [0, k, 0], [k, 0, 0], [-k, 0, 0], [0, 0, k], [0, 0, -k], [0, -k, 0],
      [k, k, 0], [-k, k, 0], [0, k, k], [0, k, -k],
    ];
    for (const [dx, dy, dz] of cand) {
      if (!collidesAt(world, b, b.x + dx * 0.5, b.y + dy * 0.5, b.z + dz * 0.5)) {
        collisionStats.depenetrations++;
        b.x += dx * 0.5;
        b.y += dy * 0.5;
        b.z += dz * 0.5;
        b.stuck = false;
        return true;
      }
    }
  }
  // still buried: every half second, look further afield
  if (b.stuckTicks++ % 30 === 0 && placeBody(world, b, 10)) {
    collisionStats.depenetrations++;
    return true;
  }
  b.stuck = true;
  collisionStats.stuck++;
  return false;
}

export function moveBody(world: VoxelWorld, b: Body, dt: number): void {
  b.hitWallX = b.hitWallZ = b.hitCeiling = false;
  if (!depenetrate(world, b)) {
    // buried: allow only very slow movement attempts (dig yourself out)
    b.vx *= 0.2;
    b.vz *= 0.2;
    b.vy = Math.max(b.vy, 0) * 0.2;
    return;
  }
  const dx = b.vx * dt, dy = b.vy * dt, dz = b.vz * dt;
  const maxd = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz));
  const steps = Math.max(1, Math.ceil(maxd / 0.45));
  const sx = dx / steps, sy = dy / steps, sz = dz / steps;
  const wasGround = b.onGround;
  b.onGround = false;
  for (let i = 0; i < steps; i++) {
    // Y first (gravity), then horizontal with step-up
    if (sy !== 0) {
      const ny = b.y + sy;
      if (collidesAt(world, b, b.x, ny, b.z)) {
        if (sy < 0) {
          b.y = Math.floor(ny) + 1 + EPS;
          if (collidesAt(world, b, b.x, b.y, b.z)) b.y = ny - sy; // fallback
          b.onGround = true;
        } else {
          b.y = Math.floor(ny + b.h) - b.h - EPS;
          if (collidesAt(world, b, b.x, b.y, b.z)) b.y = ny - sy;
          b.hitCeiling = true;
        }
        b.vy = 0;
      } else b.y = ny;
    }
    if (sx !== 0) moveHoriz(world, b, sx, 0, wasGround || b.onGround);
    if (sz !== 0) moveHoriz(world, b, 0, sz, wasGround || b.onGround);
  }
  // ground probe (standing still on ground)
  if (!b.onGround && b.vy <= 0 && collidesAt(world, b, b.x, b.y - 0.05, b.z)) b.onGround = true;
}

function moveHoriz(world: VoxelWorld, b: Body, sx: number, sz: number, grounded: boolean): void {
  const nx = b.x + sx, nz = b.z + sz;
  if (!collidesAt(world, b, nx, b.y, nz)) {
    b.x = nx;
    b.z = nz;
    return;
  }
  // step up onto small ledges
  if (grounded && b.stepUp > 0) {
    for (let up = 1; up <= b.stepUp; up++) {
      const ty = Math.floor(b.y) + up + EPS;
      if (!collidesAt(world, b, b.x, ty, b.z) && !collidesAt(world, b, nx, ty, nz)) {
        b.y = ty;
        b.x = nx;
        b.z = nz;
        return;
      }
    }
  }
  if (sx !== 0) {
    b.x = sx > 0 ? Math.floor(nx + b.hw) - b.hw - EPS : Math.floor(nx - b.hw) + 1 + b.hw + EPS;
    if (collidesAt(world, b, b.x, b.y, b.z)) b.x = nx - sx;
    b.vx = 0;
    b.hitWallX = true;
  } else {
    b.z = sz > 0 ? Math.floor(nz + b.hw) - b.hw - EPS : Math.floor(nz - b.hw) + 1 + b.hw + EPS;
    if (collidesAt(world, b, b.x, b.y, b.z)) b.z = nz - sz;
    b.vz = 0;
    b.hitWallZ = true;
  }
}

export interface ContactInfo {
  total: number;
  liquid: number;
  gas: number;
  counts: Map<number, number>;
  burning: number;
  topLiquid: number;
}

const contactCounts = new Map<number, number>();
/** Count materials overlapping a body (for damage, stains, buoyancy). */
export function senseBody(world: VoxelWorld, b: Body, out?: ContactInfo): ContactInfo {
  const counts = out?.counts ?? contactCounts;
  counts.clear();
  let total = 0, liquid = 0, gas = 0, burning = 0;
  let best = AIR, bestN = 0;
  const x0 = Math.floor(b.x - b.hw), x1 = Math.floor(b.x + b.hw - EPS);
  const y0 = Math.floor(b.y), y1 = Math.floor(b.y + b.h - EPS);
  const z0 = Math.floor(b.z - b.hw), z1 = Math.floor(b.z + b.hw - EPS);
  for (let y = y0; y <= y1; y++)
    for (let z = z0; z <= z1; z++)
      for (let x = x0; x <= x1; x++) {
        total++;
        const m = world.get(x, y, z);
        if (m === AIR) continue;
        const k = KIND[m];
        if (k === Kind.LIQUID) {
          liquid++;
          const n = (counts.get(m) ?? 0) + 1;
          counts.set(m, n);
          if (n > bestN) {
            bestN = n;
            best = m;
          }
          if (world.getAux(x, y, z) & 0x80) burning++;
        } else if (k === Kind.GAS || k === Kind.FIRE) {
          gas++;
          counts.set(m, (counts.get(m) ?? 0) + 1);
          if (k === Kind.FIRE) burning++;
        } else if (k === Kind.SOLID && (world.getAux(x, y, z) & 0x80)) {
          burning++;
        }
      }
  // also count burning surfaces directly under the feet
  const fy = Math.floor(b.y - 0.5);
  for (let z = z0; z <= z1; z++)
    for (let x = x0; x <= x1; x++) if (world.getAux(x, fy, z) & 0x80) burning++;
  b.liquid = total ? liquid / total : 0;
  b.liquidMat = best;
  const res = out ?? { total, liquid, gas, counts, burning, topLiquid: best };
  res.total = total;
  res.liquid = liquid;
  res.gas = gas;
  res.burning = burning;
  res.topLiquid = best;
  return res;
}

export { DENSITY };
