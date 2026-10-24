// Voxel ray casting (Amanatides & Woo DDA) against the static world and dynamic bodies.
import { World } from '../world/world';
import type { Body } from './body';

export class RayHit {
  dist = 0;
  /** hit point (meters) */
  x = 0; y = 0; z = 0;
  /** surface normal (world) */
  nx = 0; ny = 0; nz = 0;
  /** voxel coordinates (world grid or body grid) */
  vx = 0; vy = 0; vz = 0;
  /** palette index of the hit voxel */
  pal = 0;
  /** -1 if the ray started inside the hit voxel */
  face = -1;
  body: Body | null = null;
}

/** Ray in meters against the world voxel grid. Direction must be normalized. */
export function raycastWorld(world: World, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number, hit: RayHit): boolean {
  if (!ddaGrid((x, y, z) => world.get(x, y, z), ox * 10, oy * 10, oz * 10, dx, dy, dz, maxDist * 10, hit, -1e9, -1e9, -1e9, 1e9, 1e9, 1e9)) return false;
  hit.dist /= 10; hit.x /= 10; hit.y /= 10; hit.z /= 10;
  hit.body = null;
  return true;
}

const scratch = new RayHit();

/** DDA through an arbitrary grid; coordinates in voxel units. Results: hit.dist in voxel units, normal in grid frame. */
function ddaGrid(get: (x: number, y: number, z: number) => number, px: number, py: number, pz: number, dx: number, dy: number, dz: number, maxT: number,
  hit: RayHit, bx0: number, by0: number, bz0: number, bx1: number, by1: number, bz1: number): boolean {
  let x = Math.floor(px), y = Math.floor(py), z = Math.floor(pz);
  const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0, stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0, stepZ = dz > 0 ? 1 : dz < 0 ? -1 : 0;
  const tdx = stepX !== 0 ? Math.abs(1 / dx) : Infinity, tdy = stepY !== 0 ? Math.abs(1 / dy) : Infinity, tdz = stepZ !== 0 ? Math.abs(1 / dz) : Infinity;
  let tmx = stepX > 0 ? (x + 1 - px) * tdx : stepX < 0 ? (px - x) * tdx : Infinity;
  let tmy = stepY > 0 ? (y + 1 - py) * tdy : stepY < 0 ? (py - y) * tdy : Infinity;
  let tmz = stepZ > 0 ? (z + 1 - pz) * tdz : stepZ < 0 ? (pz - z) * tdz : Infinity;
  let t = 0, face = -1;
  for (let guard = 0; guard < 20000; guard++) {
    if (x >= bx0 && y >= by0 && z >= bz0 && x < bx1 && y < by1 && z < bz1) {
      const v = get(x, y, z);
      if (v) {
        hit.dist = t;
        hit.x = px + dx * t; hit.y = py + dy * t; hit.z = pz + dz * t;
        hit.vx = x; hit.vy = y; hit.vz = z; hit.pal = v;
        hit.nx = face === 0 ? -stepX : 0; hit.ny = face === 1 ? -stepY : 0; hit.nz = face === 2 ? -stepZ : 0;
        hit.face = face;
        if (face < 0) { hit.nx = -dx; hit.ny = -dy; hit.nz = -dz; }
        return true;
      }
    }
    if (tmx < tmy) {
      if (tmx < tmz) { t = tmx; tmx += tdx; x += stepX; face = 0; }
      else { t = tmz; tmz += tdz; z += stepZ; face = 2; }
    } else {
      if (tmy < tmz) { t = tmy; tmy += tdy; y += stepY; face = 1; }
      else { t = tmz; tmz += tdz; z += stepZ; face = 2; }
    }
    if (t > maxT) return false;
  }
  return false;
}

/** Ray (meters, normalized dir) against one body. Returns hit with world-space values. */
export function raycastBody(b: Body, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number, hit: RayHit): boolean {
  // bounding sphere test
  const cx = b.pos.x - ox, cy = b.pos.y - oy, cz = b.pos.z - oz;
  const tc = cx * dx + cy * dy + cz * dz;
  const d2 = cx * cx + cy * cy + cz * cz - tc * tc;
  if (d2 > b.radius * b.radius) return false;
  if (tc + b.radius < 0 || tc - b.radius > maxDist) return false;
  const R = b.R;
  // ray into grid space (voxel units)
  const gx = (R[0] * -cx + R[3] * -cy + R[6] * -cz) * 10 + b.com.x;
  const gy = (R[1] * -cx + R[4] * -cy + R[7] * -cz) * 10 + b.com.y;
  const gz = (R[2] * -cx + R[5] * -cy + R[8] * -cz) * 10 + b.com.z;
  const ldx = R[0] * dx + R[3] * dy + R[6] * dz, ldy = R[1] * dx + R[4] * dy + R[7] * dz, ldz = R[2] * dx + R[5] * dy + R[8] * dz;
  // clip to grid box
  let t0 = 0, t1 = maxDist * 10, entryAxis = -1;
  const o = [gx, gy, gz], d = [ldx, ldy, ldz], hi = [b.sx, b.sy, b.sz];
  for (let k = 0; k < 3; k++) {
    if (Math.abs(d[k]) < 1e-12) { if (o[k] < 0 || o[k] > hi[k]) return false; continue; }
    let ta = (0 - o[k]) / d[k], tb = (hi[k] - o[k]) / d[k];
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    if (ta > t0) { t0 = ta; entryAxis = k; }
    if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  const s = scratch;
  const eps = 1e-4;
  const sx = gx + ldx * (t0 + eps), sy = gy + ldy * (t0 + eps), sz = gz + ldz * (t0 + eps);
  if (!ddaGrid((x, y, z) => b.get(x, y, z), sx, sy, sz, ldx, ldy, ldz, t1 - t0 + 1, s, 0, 0, 0, b.sx, b.sy, b.sz)) return false;
  const tTot = (t0 + eps + s.dist) / 10;
  if (tTot > maxDist) return false;
  hit.dist = tTot;
  hit.x = ox + dx * tTot; hit.y = oy + dy * tTot; hit.z = oz + dz * tTot;
  // normal: if the first voxel inside the grid box was hit, use the box entry face
  let nx = s.nx, ny = s.ny, nz = s.nz;
  if (s.face < 0) {
    nx = 0; ny = 0; nz = 0;
    const ax = entryAxis >= 0 ? entryAxis : (Math.abs(ldx) > Math.abs(ldy) ? (Math.abs(ldx) > Math.abs(ldz) ? 0 : 2) : (Math.abs(ldy) > Math.abs(ldz) ? 1 : 2));
    if (ax === 0) nx = ldx > 0 ? -1 : 1; else if (ax === 1) ny = ldy > 0 ? -1 : 1; else nz = ldz > 0 ? -1 : 1;
  }
  hit.nx = R[0] * nx + R[1] * ny + R[2] * nz;
  hit.ny = R[3] * nx + R[4] * ny + R[5] * nz;
  hit.nz = R[6] * nx + R[7] * ny + R[8] * nz;
  hit.vx = s.vx; hit.vy = s.vy; hit.vz = s.vz; hit.pal = s.pal;
  hit.body = b;
  return true;
}

/** Ray against world + bodies, nearest hit. */
export function raycastAll(world: World, bodies: Body[], ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number, hit: RayHit, ignore: Body | null = null): boolean {
  let found = false;
  const tmp = new RayHit();
  if (raycastWorld(world, ox, oy, oz, dx, dy, dz, maxDist, tmp)) {
    found = true;
    copyHit(hit, tmp);
    maxDist = hit.dist;
  }
  for (const b of bodies) {
    if (b === ignore) continue;
    if (raycastBody(b, ox, oy, oz, dx, dy, dz, maxDist, tmp)) {
      found = true;
      copyHit(hit, tmp);
      maxDist = tmp.dist;
    }
  }
  return found;
}

function copyHit(d: RayHit, s: RayHit): void {
  d.dist = s.dist; d.x = s.x; d.y = s.y; d.z = s.z; d.nx = s.nx; d.ny = s.ny; d.nz = s.nz;
  d.vx = s.vx; d.vy = s.vy; d.vz = s.vz; d.pal = s.pal; d.body = s.body; d.face = s.face;
}
