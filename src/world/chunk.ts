import { CHUNK, CHUNK_VOL } from '../config';

/** Local voxel index inside a chunk. y-major so that bottom-up iteration walks memory linearly. */
export function lidx(lx: number, ly: number, lz: number): number {
  return (ly << 8) | (lz << 4) | lx;
}

export class Chunk {
  readonly cx: number;
  readonly cy: number;
  readonly cz: number;
  readonly ox: number;
  readonly oy: number;
  readonly oz: number;
  readonly key: number;
  /** Material id per voxel. */
  mat: Uint8Array;
  /** Per-voxel auxiliary state (burning flag + hp, gas lifetime, ...). Allocated lazily. */
  aux: Uint8Array | null = null;
  /** Per-voxel temperature delta from ambient in °C. Allocated lazily. */
  temp: Int16Array | null = null;
  /** Simulation "already updated this tick" stamps. Allocated when the chunk first becomes active. */
  stamp: Uint8Array | null = null;

  // Simulation activity: region to process this tick (cur) and region accumulated for next tick (next).
  curMinX = 16; curMinY = 16; curMinZ = 16; curMaxX = -1; curMaxY = -1; curMaxZ = -1;
  nextMinX = 16; nextMinY = 16; nextMinZ = 16; nextMaxX = -1; nextMaxY = -1; nextMaxZ = -1;
  inActiveList = false;

  meshDirty = true;
  /** True once the chunk diverges from its procedurally generated contents. */
  modified = false;
  /** Incremented on every voxel change (used by caches such as light emitters). */
  version = 0;
  /** Number of thermally non-ambient voxels (approximate, used to keep chunk awake). */
  hotCount = 0;
  lastTouchedTick = 0;

  constructor(cx: number, cy: number, cz: number, key: number, mat?: Uint8Array) {
    this.cx = cx;
    this.cy = cy;
    this.cz = cz;
    this.ox = cx * CHUNK;
    this.oy = cy * CHUNK;
    this.oz = cz * CHUNK;
    this.key = key;
    this.mat = mat ?? new Uint8Array(CHUNK_VOL);
  }

  ensureAux(): Uint8Array {
    if (!this.aux) this.aux = new Uint8Array(CHUNK_VOL);
    return this.aux;
  }
  ensureTemp(): Int16Array {
    if (!this.temp) this.temp = new Int16Array(CHUNK_VOL);
    return this.temp;
  }

  touchLocal(lx: number, ly: number, lz: number): void {
    const x0 = lx > 0 ? lx - 1 : 0;
    const x1 = lx < 15 ? lx + 1 : 15;
    const y0 = ly > 0 ? ly - 1 : 0;
    const y1 = ly < 15 ? ly + 1 : 15;
    const z0 = lz > 0 ? lz - 1 : 0;
    const z1 = lz < 15 ? lz + 1 : 15;
    if (x0 < this.nextMinX) this.nextMinX = x0;
    if (y0 < this.nextMinY) this.nextMinY = y0;
    if (z0 < this.nextMinZ) this.nextMinZ = z0;
    if (x1 > this.nextMaxX) this.nextMaxX = x1;
    if (y1 > this.nextMaxY) this.nextMaxY = y1;
    if (z1 > this.nextMaxZ) this.nextMaxZ = z1;
  }

  touchAll(): void {
    this.nextMinX = this.nextMinY = this.nextMinZ = 0;
    this.nextMaxX = this.nextMaxY = this.nextMaxZ = 15;
  }

  hasNext(): boolean {
    return this.nextMaxX >= 0;
  }

  /** Move accumulated "next" region into "cur" and reset next. */
  promote(): void {
    this.curMinX = this.nextMinX;
    this.curMinY = this.nextMinY;
    this.curMinZ = this.nextMinZ;
    this.curMaxX = this.nextMaxX;
    this.curMaxY = this.nextMaxY;
    this.curMaxZ = this.nextMaxZ;
    this.nextMinX = this.nextMinY = this.nextMinZ = 16;
    this.nextMaxX = this.nextMaxY = this.nextMaxZ = -1;
  }

  isUniform(): number {
    const m = this.mat;
    const v = m[0];
    for (let i = 1; i < CHUNK_VOL; i++) if (m[i] !== v) return -1;
    return v;
  }
}

export const CHUNK_SIZE = CHUNK;
