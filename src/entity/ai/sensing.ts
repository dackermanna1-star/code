/**
 * Sensing helpers: voxel line of sight, sky visibility, nearest-entity queries.
 */
import { T_FULL_CUBE, T_OPACITY } from '../../world/blocks/registry';
import type { World } from '../../world/world';
import type { Entity } from '../entity';

/** DDA ray through the voxel grid: true if no opaque full block lies between a and b. */
export function lineOfSight(w: World, ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
  let x = Math.floor(ax), y = Math.floor(ay), z = Math.floor(az);
  const ex = Math.floor(bx), ey = Math.floor(by), ez = Math.floor(bz);
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-6) return true;
  const sx = Math.sign(dx), sy = Math.sign(dy), sz = Math.sign(dz);
  const tdx = sx ? Math.abs(len / dx) : Infinity, tdy = sy ? Math.abs(len / dy) : Infinity, tdz = sz ? Math.abs(len / dz) : Infinity;
  let tx: number, ty: number, tz: number;
  tx = sx ? (sx > 0 ? x + 1 - ax : ax - x) * Math.abs(len / dx) : Infinity;
  ty = sy ? (sy > 0 ? y + 1 - ay : ay - y) * Math.abs(len / dy) : Infinity;
  tz = sz ? (sz > 0 ? z + 1 - az : az - z) * Math.abs(len / dz) : Infinity;
  for (let i = 0; i < 256; i++) {
    if (x === ex && y === ey && z === ez) return true;
    if (tx < ty && tx < tz) { if (tx > len) return true; x += sx; tx += tdx; }
    else if (ty < tz) { if (ty > len) return true; y += sy; ty += tdy; }
    else { if (tz > len) return true; z += sz; tz += tdz; }
    const st = w.getBlock(x, y, z);
    if (st !== 0 && T_FULL_CUBE[st >>> 4] && T_OPACITY[st >>> 4] >= 15) return false;
  }
  return true;
}

export function canSee(a: Entity, b: Entity): boolean {
  const ah = (a as any).eyeHeight ?? a.height * 0.85, bh = (b as any).eyeHeight ?? b.height * 0.85;
  return lineOfSight(a.world, a.pos.x, a.pos.y + ah, a.pos.z, b.pos.x, b.pos.y + bh, b.pos.z);
}

/** Sky is visible straight up from the position (sky light 15 at that cell). */
export function seesSky(w: World, x: number, y: number, z: number): boolean {
  return w.getSkyLight(Math.floor(x), Math.floor(y), Math.floor(z)) >= 15;
}
