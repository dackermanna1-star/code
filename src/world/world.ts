// VoxelWorld: chunk storage, voxel access, change tracking and ray casting.
import { CHUNK, WORLD_CX, WORLD_CY, WORLD_CZ, WORLD_X, WORLD_Y, WORLD_Z } from '../config';
import { Chunk, lidx } from './chunk';
import { AIR, BEDROCK, KIND, Kind, SOLID_COLLIDE, UNLOADED, LIFETIME } from './materials';

export interface RayHit {
  hit: boolean;
  x: number;
  y: number;
  z: number;
  nx: number;
  ny: number;
  nz: number;
  dist: number;
  mat: number;
  /** Exact hit point */
  px: number;
  py: number;
  pz: number;
}

/** Bit masks of what stops a ray. */
export const RAY_SOLID = 1; // solids + powders
export const RAY_LIQUID = 2;
export const RAY_GAS = 4;

export function chunkKey(cx: number, cy: number, cz: number): number {
  return (cy * WORLD_CZ + cz) * WORLD_CX + cx;
}

export class VoxelWorld {
  readonly chunks: (Chunk | null)[] = new Array(WORLD_CX * WORLD_CY * WORLD_CZ).fill(null);
  /** Chunks scheduled for simulation next tick. */
  readonly activeSet = new Set<Chunk>();
  /** Chunks needing a mesh rebuild. */
  readonly meshDirty = new Set<Chunk>();
  loadedCount = 0;
  tick = 1;
  /** Called whenever a voxel is changed outside of the simulation's own moves (for stats/debug). */
  changeCount = 0;

  inBounds(x: number, y: number, z: number): boolean {
    return x >= 0 && y >= 0 && z >= 0 && x < WORLD_X && y < WORLD_Y && z < WORLD_Z;
  }

  chunkAt(x: number, y: number, z: number): Chunk | null {
    if ((x | y | z) < 0 || x >= WORLD_X || y >= WORLD_Y || z >= WORLD_Z) return null;
    return this.chunks[((y >> 4) * WORLD_CZ + (z >> 4)) * WORLD_CX + (x >> 4)];
  }

  getChunk(cx: number, cy: number, cz: number): Chunk | null {
    if (cx < 0 || cy < 0 || cz < 0 || cx >= WORLD_CX || cy >= WORLD_CY || cz >= WORLD_CZ) return null;
    return this.chunks[chunkKey(cx, cy, cz)];
  }

  addChunk(c: Chunk): void {
    const prev = this.chunks[c.key];
    if (prev) return;
    this.chunks[c.key] = c;
    this.loadedCount++;
    c.meshDirty = true;
    this.meshDirty.add(c);
    // Neighbours need remeshing because their border faces may now be hidden/visible.
    for (const [dx, dy, dz] of NEIGHBOR_OFFSETS) {
      const n = this.getChunk(c.cx + dx, c.cy + dy, c.cz + dz);
      // a neighbour that was never meshed is already queued; otherwise its border faces changed
      if (n && n.meshedOnce && !n.meshDirty) {
        n.meshDirty = true;
        this.meshDirty.add(n);
      }
    }
    // Let dynamic materials settle after load.
    if (needsInitialSim(c)) this.activateChunk(c);
  }

  removeChunk(c: Chunk): void {
    if (this.chunks[c.key] !== c) return;
    this.chunks[c.key] = null;
    this.loadedCount--;
    this.activeSet.delete(c);
    this.meshDirty.delete(c);
    c.inActiveList = false;
  }

  /** Material at a voxel. Out of world = bedrock, unloaded = UNLOADED (solid). */
  get(x: number, y: number, z: number): number {
    if ((x | y | z) < 0 || x >= WORLD_X || y >= WORLD_Y || z >= WORLD_Z) return BEDROCK;
    const c = this.chunks[((y >> 4) * WORLD_CZ + (z >> 4)) * WORLD_CX + (x >> 4)];
    if (c === null) return UNLOADED;
    return c.mat[((y & 15) << 8) | ((z & 15) << 4) | (x & 15)];
  }

  getAux(x: number, y: number, z: number): number {
    const c = this.chunkAt(x, y, z);
    if (!c || !c.aux) return 0;
    return c.aux[lidx(x & 15, y & 15, z & 15)];
  }

  setAux(x: number, y: number, z: number, v: number): void {
    const c = this.chunkAt(x, y, z);
    if (!c) return;
    c.ensureAux()[lidx(x & 15, y & 15, z & 15)] = v;
    this.touch(x, y, z);
  }

  getTemp(x: number, y: number, z: number): number {
    const c = this.chunkAt(x, y, z);
    if (!c || !c.temp) return 0;
    return c.temp[lidx(x & 15, y & 15, z & 15)];
  }

  /** Add heat (°C delta) to a voxel. Clamped to the int16 range used for storage. */
  addTemp(x: number, y: number, z: number, d: number): void {
    const c = this.chunkAt(x, y, z);
    if (!c) return;
    const i = lidx(x & 15, y & 15, z & 15);
    const t = c.ensureTemp();
    const v = t[i] + d;
    t[i] = v > 3000 ? 3000 : v < -400 ? -400 : v;
    this.touch(x, y, z);
  }

  isSolid(x: number, y: number, z: number): boolean {
    return SOLID_COLLIDE[this.get(x, y, z)] === 1;
  }

  /**
   * Change a voxel (external edit: spells, explosions, generation fixes, potions).
   * Resets aux/temp unless keepState. Marks mesh + simulation activity.
   */
  set(x: number, y: number, z: number, m: number, keepState = false): boolean {
    const c = this.chunkAt(x, y, z);
    if (!c) return false;
    const lx = x & 15,
      ly = y & 15,
      lz = z & 15;
    const i = (ly << 8) | (lz << 4) | lx;
    if (c.mat[i] === m && keepState) return false;
    c.mat[i] = m;
    if (!keepState) {
      if (c.aux) c.aux[i] = LIFETIME[m];
      else if (LIFETIME[m]) c.ensureAux()[i] = LIFETIME[m];
      if (c.temp) c.temp[i] = 0;
    }
    c.modified = true;
    c.version++;
    this.changeCount++;
    this.markMesh(c, lx, ly, lz);
    this.touchChunkLocal(c, lx, ly, lz);
    return true;
  }

  /** Mark chunk (and border neighbours) for remeshing after a change at local coords. */
  markMesh(c: Chunk, lx: number, ly: number, lz: number): void {
    if (!c.meshDirty) {
      c.meshDirty = true;
      this.meshDirty.add(c);
    }
    if (lx === 0) this.markMeshChunk(c.cx - 1, c.cy, c.cz);
    else if (lx === 15) this.markMeshChunk(c.cx + 1, c.cy, c.cz);
    if (ly === 0) this.markMeshChunk(c.cx, c.cy - 1, c.cz);
    else if (ly === 15) this.markMeshChunk(c.cx, c.cy + 1, c.cz);
    if (lz === 0) this.markMeshChunk(c.cx, c.cy, c.cz - 1);
    else if (lz === 15) this.markMeshChunk(c.cx, c.cy, c.cz + 1);
  }

  private markMeshChunk(cx: number, cy: number, cz: number): void {
    const n = this.getChunk(cx, cy, cz);
    if (n && !n.meshDirty) {
      n.meshDirty = true;
      this.meshDirty.add(n);
    }
  }

  /** Wake simulation around a world voxel. */
  touch(x: number, y: number, z: number): void {
    const c = this.chunkAt(x, y, z);
    if (c) this.touchChunkLocal(c, x & 15, y & 15, z & 15);
  }

  touchChunkLocal(c: Chunk, lx: number, ly: number, lz: number): void {
    c.touchLocal(lx, ly, lz);
    if (!c.inActiveList) {
      c.inActiveList = true;
      this.activeSet.add(c);
    }
    if (lx === 0 || lx === 15 || ly === 0 || ly === 15 || lz === 0 || lz === 15) {
      const dx0 = lx === 0 ? -1 : 0,
        dx1 = lx === 15 ? 1 : 0;
      const dy0 = ly === 0 ? -1 : 0,
        dy1 = ly === 15 ? 1 : 0;
      const dz0 = lz === 0 ? -1 : 0,
        dz1 = lz === 15 ? 1 : 0;
      for (let dy = dy0; dy <= dy1; dy++)
        for (let dz = dz0; dz <= dz1; dz++)
          for (let dx = dx0; dx <= dx1; dx++) {
            if (dx === 0 && dy === 0 && dz === 0) continue;
            const n = this.getChunk(c.cx + dx, c.cy + dy, c.cz + dz);
            if (!n) continue;
            n.touchLocal(dx === 0 ? lx : dx < 0 ? 15 : 0, dy === 0 ? ly : dy < 0 ? 15 : 0, dz === 0 ? lz : dz < 0 ? 15 : 0);
            if (!n.inActiveList) {
              n.inActiveList = true;
              this.activeSet.add(n);
            }
          }
    }
  }

  activateChunk(c: Chunk): void {
    c.touchAll();
    if (!c.inActiveList) {
      c.inActiveList = true;
      this.activeSet.add(c);
    }
  }

  /** Wake all simulation within a box (world coords, inclusive). */
  touchBox(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
    for (let cy = Math.max(0, y0 >> 4); cy <= Math.min(WORLD_CY - 1, y1 >> 4); cy++)
      for (let cz = Math.max(0, z0 >> 4); cz <= Math.min(WORLD_CZ - 1, z1 >> 4); cz++)
        for (let cx = Math.max(0, x0 >> 4); cx <= Math.min(WORLD_CX - 1, x1 >> 4); cx++) {
          const c = this.getChunk(cx, cy, cz);
          if (!c) continue;
          const lx0 = Math.max(0, x0 - c.ox), lx1 = Math.min(15, x1 - c.ox);
          const ly0 = Math.max(0, y0 - c.oy), ly1 = Math.min(15, y1 - c.oy);
          const lz0 = Math.max(0, z0 - c.oz), lz1 = Math.min(15, z1 - c.oz);
          c.nextMinX = Math.min(c.nextMinX, lx0);
          c.nextMinY = Math.min(c.nextMinY, ly0);
          c.nextMinZ = Math.min(c.nextMinZ, lz0);
          c.nextMaxX = Math.max(c.nextMaxX, lx1);
          c.nextMaxY = Math.max(c.nextMaxY, ly1);
          c.nextMaxZ = Math.max(c.nextMaxZ, lz1);
          if (!c.inActiveList) {
            c.inActiveList = true;
            this.activeSet.add(c);
          }
        }
  }

  /**
   * Voxel DDA ray cast (Amanatides & Woo). Direction need not be normalised; maxDist in voxels.
   * `mask` selects which material kinds stop the ray.
   */
  raycast(
    ox: number, oy: number, oz: number,
    dx: number, dy: number, dz: number,
    maxDist: number, mask = RAY_SOLID, out?: RayHit,
  ): RayHit {
    const res: RayHit = out ?? { hit: false, x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0, dist: 0, mat: AIR, px: 0, py: 0, pz: 0 };
    const len = Math.hypot(dx, dy, dz) || 1;
    dx /= len;
    dy /= len;
    dz /= len;
    let x = Math.floor(ox),
      y = Math.floor(oy),
      z = Math.floor(oz);
    const stepX = dx > 0 ? 1 : -1,
      stepY = dy > 0 ? 1 : -1,
      stepZ = dz > 0 ? 1 : -1;
    const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
    const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
    const tDeltaZ = dz !== 0 ? Math.abs(1 / dz) : Infinity;
    let tMaxX = dx !== 0 ? (dx > 0 ? x + 1 - ox : ox - x) * tDeltaX : Infinity;
    let tMaxY = dy !== 0 ? (dy > 0 ? y + 1 - oy : oy - y) * tDeltaY : Infinity;
    let tMaxZ = dz !== 0 ? (dz > 0 ? z + 1 - oz : oz - z) * tDeltaZ : Infinity;
    let nx = 0,
      ny = 0,
      nz = 0;
    let t = 0;
    // Check the starting voxel too (rays starting inside geometry hit immediately).
    for (let iter = 0; iter < 4096; iter++) {
      const m = this.get(x, y, z);
      if (stops(m, mask)) {
        res.hit = true;
        res.x = x;
        res.y = y;
        res.z = z;
        res.nx = nx;
        res.ny = ny;
        res.nz = nz;
        res.dist = t;
        res.mat = m;
        res.px = ox + dx * t;
        res.py = oy + dy * t;
        res.pz = oz + dz * t;
        return res;
      }
      if (tMaxX < tMaxY) {
        if (tMaxX < tMaxZ) {
          t = tMaxX;
          x += stepX;
          tMaxX += tDeltaX;
          nx = -stepX; ny = 0; nz = 0;
        } else {
          t = tMaxZ;
          z += stepZ;
          tMaxZ += tDeltaZ;
          nx = 0; ny = 0; nz = -stepZ;
        }
      } else {
        if (tMaxY < tMaxZ) {
          t = tMaxY;
          y += stepY;
          tMaxY += tDeltaY;
          nx = 0; ny = -stepY; nz = 0;
        } else {
          t = tMaxZ;
          z += stepZ;
          tMaxZ += tDeltaZ;
          nx = 0; ny = 0; nz = -stepZ;
        }
      }
      if (t > maxDist) break;
    }
    res.hit = false;
    res.dist = maxDist;
    res.px = ox + dx * maxDist;
    res.py = oy + dy * maxDist;
    res.pz = oz + dz * maxDist;
    res.mat = AIR;
    return res;
  }

  /** True if the straight segment between two points is free of solid voxels. */
  lineOfSight(ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
    const dx = bx - ax,
      dy = by - ay,
      dz = bz - az;
    const d = Math.hypot(dx, dy, dz);
    if (d < 1e-4) return true;
    return !this.raycast(ax, ay, az, dx, dy, dz, d, RAY_SOLID).hit;
  }

  /** Is any solid voxel inside the axis aligned box? */
  boxHasSolid(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): boolean {
    const ix0 = Math.floor(x0),
      iy0 = Math.floor(y0),
      iz0 = Math.floor(z0);
    const ix1 = Math.floor(x1 - 1e-6),
      iy1 = Math.floor(y1 - 1e-6),
      iz1 = Math.floor(z1 - 1e-6);
    for (let y = iy0; y <= iy1; y++)
      for (let z = iz0; z <= iz1; z++)
        for (let x = ix0; x <= ix1; x++) if (SOLID_COLLIDE[this.get(x, y, z)]) return true;
    return false;
  }
}

function stops(m: number, mask: number): boolean {
  const k = KIND[m];
  if (mask & RAY_SOLID && SOLID_COLLIDE[m]) return true;
  if (mask & RAY_LIQUID && k === Kind.LIQUID) return true;
  if (mask & RAY_GAS && (k === Kind.GAS || k === Kind.FIRE)) return true;
  return false;
}

export const NEIGHBOR_OFFSETS: [number, number, number][] = [
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
];

function needsInitialSim(c: Chunk): boolean {
  const m = c.mat;
  for (let i = 0; i < m.length; i++) {
    const k = KIND[m[i]];
    if (k === Kind.LIQUID || k === Kind.GAS || k === Kind.FIRE || k === Kind.POWDER) return true;
  }
  return false;
}

export { CHUNK };
