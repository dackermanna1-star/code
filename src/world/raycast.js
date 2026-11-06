// Voxel ray casting (Amanatides & Woo DDA) with support for partial block shapes.
import { BLOCKS, getBoxes } from './blocks.js';

/**
 * Cast a ray through the world.
 * @param world World
 * @param ox,oy,oz origin  @param dx,dy,dz normalized direction  @param maxDist
 * @param filter (id, def) => boolean : which blocks count as hits. Default: anything rendered except air/water.
 * @returns {x,y,z, id, nx,ny,nz, dist, px,py,pz} or null.  (x,y,z) block, n = face normal, p = hit point
 */
export function raycast(world, ox, oy, oz, dx, dy, dz, maxDist, filter = defaultFilter) {
  let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
  const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
  const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  const tDeltaZ = dz !== 0 ? Math.abs(1 / dz) : Infinity;
  let tMaxX = dx !== 0 ? (dx > 0 ? x + 1 - ox : ox - x) * tDeltaX : Infinity;
  let tMaxY = dy !== 0 ? (dy > 0 ? y + 1 - oy : oy - y) * tDeltaY : Infinity;
  let tMaxZ = dz !== 0 ? (dz > 0 ? z + 1 - oz : oz - z) * tDeltaZ : Infinity;
  let nx = 0, ny = 0, nz = 0, t = 0;
  for (let iter = 0; iter < 512 && t <= maxDist; iter++) {
    const id = world.get(x, y, z);
    if (id !== 0) {
      const d = BLOCKS[id];
      if (filter(id, d)) {
        if (d.render === 'cube' || d.render === 'liquid') {
          return { x, y, z, id, nx, ny, nz, dist: t, px: ox + dx * t, py: oy + dy * t, pz: oz + dz * t };
        }
        // partial shapes: test boxes precisely
        const boxes = getBoxes(id, world.getMeta(x, y, z)) || [[0.15, 0, 0.15, 0.85, 0.9, 0.85]];
        let best = null;
        for (const b of boxes) {
          const h = rayBox(ox, oy, oz, dx, dy, dz, x + b[0], y + b[1], z + b[2], x + b[3], y + b[4], z + b[5]);
          if (h && (!best || h.t < best.t)) best = h;
        }
        if (best && best.t <= maxDist) {
          return { x, y, z, id, nx: best.nx, ny: best.ny, nz: best.nz, dist: best.t, px: ox + dx * best.t, py: oy + dy * best.t, pz: oz + dz * best.t };
        }
      }
    }
    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      x += stepX; t = tMaxX; tMaxX += tDeltaX; nx = -stepX; ny = 0; nz = 0;
    } else if (tMaxY < tMaxZ) {
      y += stepY; t = tMaxY; tMaxY += tDeltaY; nx = 0; ny = -stepY; nz = 0;
    } else {
      z += stepZ; t = tMaxZ; tMaxZ += tDeltaZ; nx = 0; ny = 0; nz = -stepZ;
    }
    if (y < -1 || y > world.SY + 1) break;
  }
  return null;
}

function defaultFilter(id, d) {
  return d.render !== 'none' && d.render !== 'liquid';
}
/** Only blocks that stop bullets / sight (solid or opaque). */
export function solidFilter(id, d) {
  return d.solid || d.opaque;
}
/** Blocks that block line of sight (opaque-ish). Glass and fences do not. */
export function sightFilter(id, d) {
  return d.opaque || (d.solid && d.pass === 'opaque' && d.render !== 'cross');
}

/** Ray vs AABB slab test. Returns {t, nx, ny, nz} or null. */
export function rayBox(ox, oy, oz, dx, dy, dz, x0, y0, z0, x1, y1, z1) {
  let tmin = -Infinity, tmax = Infinity, nx = 0, ny = 0, nz = 0;
  const axes = [[ox, dx, x0, x1, 0], [oy, dy, y0, y1, 1], [oz, dz, z0, z1, 2]];
  for (const [o, d, a, b, ax] of axes) {
    if (Math.abs(d) < 1e-9) {
      if (o < a || o > b) return null;
      continue;
    }
    let t1 = (a - o) / d, t2 = (b - o) / d;
    let n = -1;
    if (t1 > t2) { [t1, t2] = [t2, t1]; n = 1; }
    if (t1 > tmin) {
      tmin = t1;
      nx = ax === 0 ? n : 0; ny = ax === 1 ? n : 0; nz = ax === 2 ? n : 0;
    }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (tmax < 0) return null;
  if (tmin < 0) return { t: 0, nx, ny, nz };
  return { t: tmin, nx, ny, nz };
}

/** True if there is a clear line between two points (uses sightFilter). */
export function lineOfSight(world, ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const len = Math.hypot(dx, dy, dz);
  if (len < 0.001) return true;
  const hit = raycast(world, ax, ay, az, dx / len, dy / len, dz / len, len, sightFilter);
  return !hit;
}
