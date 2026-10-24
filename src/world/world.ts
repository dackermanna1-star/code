// Chunked sparse voxel world (the static, anchored part of the level).
// 16^3 voxel chunks stored as: empty / uniform / dense byte array / virtual terrain.
// Rendering is organised in 32^3 regions (2x2x2 chunks) which are remeshed when dirty.

import { BEDROCK_Y, Terrain } from './terrain';
import { P, PAL_TRANSPARENT } from './materials';

export const VOXEL = 0.1;
export const INV_VOXEL = 10;
export const CS = 16, CS_SHIFT = 4, CS_MASK = 15, CS3 = 4096;
export const RS = 32, RS_SHIFT = 5;
/** Voxels below this height are considered anchored to the earth. */
export const ANCHOR_Y = 24;

export const enum CK { Empty = 0, Uniform = 1, Dense = 2, Terrain = 3 }

const COLBUF = new Uint8Array(1024);

export class World {
  readonly ncx: number; readonly ncy: number; readonly ncz: number; readonly nchunks: number;
  readonly nrx: number; readonly nry: number; readonly nrz: number; readonly nregions: number;
  readonly kind: Uint8Array;
  readonly uni: Uint8Array;
  readonly data: (Uint8Array | null)[];
  /** Solid voxel count per dense chunk. */
  readonly count: Int32Array;
  readonly regionDirty: Uint8Array;
  readonly dirtyQueue: number[] = [];
  readonly terrain: Terrain;
  /** Boxes (x0,y0,z0,x1,y1,z1 in voxels) modified since last consumed; used for waking bodies etc. */
  changeBoxes: number[] = [];
  /** Number of voxel modifications (stat). */
  edits = 0;
  /** level generation mode: skip dirty tracking (everything is meshed afterwards) */
  bulk = false;
  /** per-chunk modification stamp (for caches of world voxels) */
  readonly stamp: Uint32Array;
  stampCounter = 1;

  constructor(readonly sx: number, readonly sy: number, readonly sz: number, groundHeight: number) {
    this.ncx = sx >> CS_SHIFT; this.ncy = sy >> CS_SHIFT; this.ncz = sz >> CS_SHIFT;
    this.nchunks = this.ncx * this.ncy * this.ncz;
    this.nrx = sx >> RS_SHIFT; this.nry = sy >> RS_SHIFT; this.nrz = sz >> RS_SHIFT;
    this.nregions = this.nrx * this.nry * this.nrz;
    this.kind = new Uint8Array(this.nchunks);
    this.uni = new Uint8Array(this.nchunks);
    this.data = new Array(this.nchunks).fill(null);
    this.count = new Int32Array(this.nchunks);
    this.regionDirty = new Uint8Array(this.nregions);
    this.stamp = new Uint32Array(this.nchunks);
    this.terrain = new Terrain(sx, sz, groundHeight);
  }

  /** Classify chunks against the terrain heightmap. Call after the heightmap is final and before building. */
  initTerrain(): void {
    const t = this.terrain;
    for (let cz = 0; cz < this.ncz; cz++) {
      for (let cx = 0; cx < this.ncx; cx++) {
        const [, mx] = t.rangeIn(cx << 4, cz << 4, (cx << 4) + 15, (cz << 4) + 15);
        for (let cy = 0; cy < this.ncy; cy++) {
          const ci = cx + this.ncx * (cz + this.ncz * cy);
          const y0 = cy << 4;
          this.data[ci] = null;
          this.kind[ci] = y0 < mx || y0 < BEDROCK_Y ? CK.Terrain : CK.Empty;
        }
      }
    }
  }

  chunkIndex(cx: number, cy: number, cz: number): number { return cx + this.ncx * (cz + this.ncz * cy); }
  regionIndex(rx: number, ry: number, rz: number): number { return rx + this.nrx * (rz + this.nrz * ry); }

  inBounds(x: number, y: number, z: number): boolean {
    return x >= 0 && y >= 0 && z >= 0 && x < this.sx && y < this.sy && z < this.sz;
  }

  get(x: number, y: number, z: number): number {
    if ((x | y | z) < 0 || x >= this.sx || y >= this.sy || z >= this.sz) return this.outside(x, y, z);
    const ci = (x >> 4) + this.ncx * ((z >> 4) + this.ncz * (y >> 4));
    const k = this.kind[ci];
    if (k === CK.Dense) return (this.data[ci] as Uint8Array)[(x & 15) | ((z & 15) << 4) | ((y & 15) << 8)];
    if (k === CK.Empty) return 0;
    if (k === CK.Uniform) return this.uni[ci];
    return this.terrain.eval(x, y, z);
  }

  /** Outside the map the original terrain continues (clamped to the border columns); bedrock below. */
  outside(x: number, y: number, z: number): number {
    if (y < 0) return P.bedrock;
    if (y >= this.sy) return 0;
    const cx = x < 0 ? 0 : x >= this.sx ? this.sx - 1 : x;
    const cz = z < 0 ? 0 : z >= this.sz ? this.sz - 1 : z;
    return this.terrain.eval(cx, y, cz);
  }

  /** True if the chunk containing the voxel may contain solid voxels. */
  chunkMayBeSolid(x: number, y: number, z: number): boolean {
    if (y < 0) return true;
    if (y >= this.sy) return false;
    if (x < 0 || z < 0 || x >= this.sx || z >= this.sz) return true; // terrain continues outside the map
    const ci = (x >> 4) + this.ncx * ((z >> 4) + this.ncz * (y >> 4));
    const k = this.kind[ci];
    if (k === CK.Empty) return false;
    if (k === CK.Dense) return this.count[ci] > 0;
    if (k === CK.Uniform) return this.uni[ci] !== 0;
    return true;
  }

  private materialize(ci: number): Uint8Array {
    const k = this.kind[ci];
    const d = new Uint8Array(CS3);
    let n = 0;
    if (k === CK.Uniform) {
      d.fill(this.uni[ci]);
      n = this.uni[ci] ? CS3 : 0;
    } else if (k === CK.Terrain) {
      const cx = ci % this.ncx, rest = (ci / this.ncx) | 0;
      const cz = rest % this.ncz, cy = (rest / this.ncz) | 0;
      const x0 = cx << 4, y0 = cy << 4, z0 = cz << 4;
      const t = this.terrain;
      for (let lz = 0; lz < 16; lz++) for (let lx = 0; lx < 16; lx++) {
        t.fillColumn(x0 + lx, z0 + lz, y0, y0 + 16, d, lx | (lz << 4), 256);
      }
      for (let i = 0; i < CS3; i++) if (d[i]) n++;
    }
    this.data[ci] = d;
    this.kind[ci] = CK.Dense;
    this.count[ci] = n;
    return d;
  }

  /** Sets a voxel, returns the previous value. Marks render regions dirty. */
  set(x: number, y: number, z: number, v: number): number {
    if ((x | y | z) < 0 || x >= this.sx || y >= this.sy || z >= this.sz) return 0;
    const ci = (x >> 4) + this.ncx * ((z >> 4) + this.ncz * (y >> 4));
    let d: Uint8Array;
    if (this.kind[ci] !== CK.Dense) {
      const cur = this.get(x, y, z);
      if (cur === v) return cur;
      d = this.materialize(ci);
    } else d = this.data[ci] as Uint8Array;
    const li = (x & 15) | ((z & 15) << 4) | ((y & 15) << 8);
    const old = d[li];
    if (old === v) return old;
    d[li] = v;
    this.edits++;
    this.stamp[ci] = ++this.stampCounter;
    if (old === 0) this.count[ci]++;
    else if (v === 0) {
      if (--this.count[ci] === 0) { this.kind[ci] = CK.Empty; this.data[ci] = null; }
    }
    if (!this.bulk) this.markDirty(x, y, z);
    return old;
  }

  /** Mark the render regions affected by a change of voxel (x,y,z) (including AO neighbours). */
  markDirty(x: number, y: number, z: number): void {
    const rx0 = Math.max(0, (x - 1) >> RS_SHIFT), rx1 = Math.min(this.nrx - 1, (x + 1) >> RS_SHIFT);
    const ry0 = Math.max(0, (y - 1) >> RS_SHIFT), ry1 = Math.min(this.nry - 1, (y + 1) >> RS_SHIFT);
    const rz0 = Math.max(0, (z - 1) >> RS_SHIFT), rz1 = Math.min(this.nrz - 1, (z + 1) >> RS_SHIFT);
    for (let ry = ry0; ry <= ry1; ry++) for (let rz = rz0; rz <= rz1; rz++) for (let rx = rx0; rx <= rx1; rx++) {
      const ri = rx + this.nrx * (rz + this.nrz * ry);
      if (!this.regionDirty[ri]) { this.regionDirty[ri] = 1; this.dirtyQueue.push(ri); }
    }
  }

  markBoxDirty(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
    const rx0 = Math.max(0, (x0 - 1) >> RS_SHIFT), rx1 = Math.min(this.nrx - 1, (x1 + 1) >> RS_SHIFT);
    const ry0 = Math.max(0, (y0 - 1) >> RS_SHIFT), ry1 = Math.min(this.nry - 1, (y1 + 1) >> RS_SHIFT);
    const rz0 = Math.max(0, (z0 - 1) >> RS_SHIFT), rz1 = Math.min(this.nrz - 1, (z1 + 1) >> RS_SHIFT);
    for (let ry = ry0; ry <= ry1; ry++) for (let rz = rz0; rz <= rz1; rz++) for (let rx = rx0; rx <= rx1; rx++) {
      const ri = rx + this.nrx * (rz + this.nrz * ry);
      if (!this.regionDirty[ri]) { this.regionDirty[ri] = 1; this.dirtyQueue.push(ri); }
    }
  }

  noteChange(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
    this.changeBoxes.push(x0, y0, z0, x1, y1, z1);
  }

  /**
   * Calls fn(x, y, z, v) for every solid voxel in the inclusive box, skipping empty chunks and
   * iterating dense chunk data directly. Safe to modify voxels inside fn (data is read before the call).
   */
  forEachSolid(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, fn: (x: number, y: number, z: number, v: number) => void,
    skipTerrain = false, sphere?: { cx: number; cy: number; cz: number; r: number }, chunkFilter?: (ci: number) => boolean): void {
    x0 = Math.max(0, x0); y0 = Math.max(0, y0); z0 = Math.max(0, z0);
    x1 = Math.min(this.sx - 1, x1); y1 = Math.min(this.sy - 1, y1); z1 = Math.min(this.sz - 1, z1);
    if (x1 < x0 || y1 < y0 || z1 < z0) return;
    const r2 = sphere ? sphere.r * sphere.r : 0;
    for (let cy = y0 >> 4; cy <= y1 >> 4; cy++) {
      const ay = Math.max(y0, cy << 4), by = Math.min(y1, (cy << 4) + 15);
      for (let cz = z0 >> 4; cz <= z1 >> 4; cz++) {
        const az = Math.max(z0, cz << 4), bz = Math.min(z1, (cz << 4) + 15);
        for (let cx = x0 >> 4; cx <= x1 >> 4; cx++) {
          const ax = Math.max(x0, cx << 4), bx = Math.min(x1, (cx << 4) + 15);
          const ci = cx + this.ncx * (cz + this.ncz * cy);
          const k = this.kind[ci];
          if (k === CK.Empty) continue;
          if (sphere) {
            // chunk vs sphere rejection
            const dx = Math.max(ax - sphere.cx, 0, sphere.cx - bx - 1), dy = Math.max(ay - sphere.cy, 0, sphere.cy - by - 1), dz = Math.max(az - sphere.cz, 0, sphere.cz - bz - 1);
            if (dx * dx + dy * dy + dz * dz > r2) continue;
          }
          if (chunkFilter && k !== CK.Terrain && !chunkFilter(ci)) continue;
          if (k === CK.Dense) {
            if (this.count[ci] === 0) continue;
            const d = this.data[ci] as Uint8Array;
            for (let y = ay; y <= by; y++) for (let z = az; z <= bz; z++) {
              let li = (ax & 15) | ((z & 15) << 4) | ((y & 15) << 8);
              for (let x = ax; x <= bx; x++, li++) { const v = d[li]; if (v) fn(x, y, z, v); }
            }
          } else if (k === CK.Uniform) {
            const v = this.uni[ci];
            if (!v) continue;
            for (let y = ay; y <= by; y++) for (let z = az; z <= bz; z++) for (let x = ax; x <= bx; x++) fn(x, y, z, v);
          } else {
            if (skipTerrain) continue;
            const t = this.terrain;
            const col = COLBUF;
            for (let z = az; z <= bz; z++) for (let x = ax; x <= bx; x++) {
              const h = t.height[x + z * this.sx];
              let ya = ay, yb = Math.min(by, h - 1);
              if (sphere) {
                const dx = x + 0.5 - sphere.cx, dz = z + 0.5 - sphere.cz;
                const rem = r2 - dx * dx - dz * dz;
                if (rem <= 0) continue;
                const hh = Math.sqrt(rem);
                ya = Math.max(ya, Math.floor(sphere.cy - hh));
                yb = Math.min(yb, Math.ceil(sphere.cy + hh));
              }
              if (yb < ya) continue;
              t.fillColumn(x, z, ya, yb + 1, col, 0, 1);
              for (let y = ya; y <= yb; y++) { const v = col[y - ya]; if (v) fn(x, y, z, v); }
            }
          }
        }
      }
    }
  }

  /**
   * Copies the box [x0,x0+nx) x [y0,y0+ny) x [z0,z0+nz) into out (x fastest, then z, then y).
   * Works chunk by chunk (bulk row copies for dense chunks, column fills for virtual terrain).
   */
  /**
   * Copies the part [ax, bx) x [ay, by) x [az, bz) of chunk ci (the box must lie inside that chunk) into a
   * grid of row length nx and depth nz whose origin is (x0, y0, z0).
   */
  copyChunkRows(ci: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number, out: Uint8Array,
    x0: number, y0: number, z0: number, nx: number, nz: number): void {
    const k = this.kind[ci], w = bx - ax;
    if (k === CK.Terrain) {
      for (let z = az; z < bz; z++) for (let x = ax; x < bx; x++) this.terrain.fillColumn(x, z, ay, by, out, (x - x0) + nx * ((z - z0) + nz * (ay - y0)), nx * nz);
      return;
    }
    const d = k === CK.Dense ? this.data[ci] as Uint8Array : null, v = k === CK.Uniform ? this.uni[ci] : 0;
    for (let y = ay; y < by; y++) for (let z = az; z < bz; z++) {
      const o = (ax - x0) + nx * ((z - z0) + nz * (y - y0));
      if (d) { const src = (ax & 15) | ((z & 15) << 4) | ((y & 15) << 8); out.set(d.subarray(src, src + w), o); }
      else out.fill(v, o, o + w);
    }
  }

  copyBox(x0: number, y0: number, z0: number, nx: number, ny: number, nz: number, out: Uint8Array): void {
    out.fill(0, 0, nx * ny * nz);
    const x1 = x0 + nx, y1 = y0 + ny, z1 = z0 + nz;
    const sxz = nx * nz;
    for (let cy = y0 >> 4; cy <= (y1 - 1) >> 4; cy++) {
      const ay = Math.max(y0, cy << 4), by = Math.min(y1, (cy << 4) + 16);
      for (let cz = z0 >> 4; cz <= (z1 - 1) >> 4; cz++) {
        const az = Math.max(z0, cz << 4), bz = Math.min(z1, (cz << 4) + 16);
        for (let cx = x0 >> 4; cx <= (x1 - 1) >> 4; cx++) {
          const ax = Math.max(x0, cx << 4), bx = Math.min(x1, (cx << 4) + 16);
          const w = bx - ax;
          if (cx < 0 || cy < 0 || cz < 0 || cx >= this.ncx || cy >= this.ncy || cz >= this.ncz) {
            for (let y = ay; y < by; y++) for (let z = az; z < bz; z++) {
              let o = (ax - x0) + nx * ((z - z0) + nz * (y - y0));
              for (let x = ax; x < bx; x++) out[o++] = this.outside(x, y, z);
            }
            continue;
          }
          const ci = cx + this.ncx * (cz + this.ncz * cy);
          const k = this.kind[ci];
          if (k === CK.Empty) continue;
          if (k === CK.Uniform) {
            const v = this.uni[ci];
            if (!v) continue;
            for (let y = ay; y < by; y++) for (let z = az; z < bz; z++) {
              const o = (ax - x0) + nx * ((z - z0) + nz * (y - y0));
              out.fill(v, o, o + w);
            }
          } else if (k === CK.Dense) {
            const d = this.data[ci] as Uint8Array;
            for (let y = ay; y < by; y++) for (let z = az; z < bz; z++) {
              const src = (ax & 15) | ((z & 15) << 4) | ((y & 15) << 8);
              const o = (ax - x0) + nx * ((z - z0) + nz * (y - y0));
              out.set(d.subarray(src, src + w), o);
            }
          } else {
            const t = this.terrain;
            for (let z = az; z < bz; z++) for (let x = ax; x < bx; x++) {
              t.fillColumn(x, z, ay, by, out, (x - x0) + nx * ((z - z0) + nz * (ay - y0)), sxz);
            }
          }
        }
      }
    }
  }

  /**
   * Copies the voxels of render region (rx,ry,rz) with a pad-voxel border into out ((32+2*pad)^3, x fastest, then z, then y).
   * Returns 0 if the region is empty, 2 if it is solid and fully enclosed (no visible faces), 1 otherwise.
   */
  gatherRegion(rx: number, ry: number, rz: number, out: Uint8Array, pad = 1): number {
    const P2 = RS + 2 * pad;
    const bx = (rx << RS_SHIFT) - pad, by = (ry << RS_SHIFT) - pad, bz = (rz << RS_SHIFT) - pad;
    let anyNonEmpty = false, allTerrain = true;
    for (let cy = ry * 2; cy < ry * 2 + 2; cy++) for (let cz = rz * 2; cz < rz * 2 + 2; cz++) for (let cx = rx * 2; cx < rx * 2 + 2; cx++) {
      const ci = this.chunkIndex(cx, cy, cz);
      const k = this.kind[ci];
      if (k === CK.Terrain || (k === CK.Dense && this.count[ci] > 0) || (k === CK.Uniform && this.uni[ci])) anyNonEmpty = true;
      if (k !== CK.Terrain) allTerrain = false;
    }
    if (!anyNonEmpty) {
      // still need faces if a neighbouring chunk pokes into our border? No: faces belong to the solid voxel's region.
      return 0;
    }
    if (allTerrain) {
      const [mn] = this.terrain.rangeIn(Math.max(0, bx), Math.max(0, bz), Math.min(this.sx - 1, bx + P2 - 1), Math.min(this.sz - 1, bz + P2 - 1));
      if (by + P2 < mn) return 2;
    }
    this.copyBox(bx, by, bz, P2, P2, P2, out);
    // quick check of the interior for any solid voxel
    let solid = 0, trans = 0;
    const n = P2 * P2 * P2;
    for (let i = 0; i < n; i++) { const v = out[i]; if (v) { solid++; trans |= PAL_TRANSPARENT[v]; } }
    if (solid === 0) return 0;
    if (solid === n && !trans) return 2;
    return 1;
  }

  /** Latest modification stamp of the chunks overlapping a voxel box. */
  maxStamp(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): number {
    let m = 0;
    const cx0 = Math.max(0, x0 >> 4), cy0 = Math.max(0, y0 >> 4), cz0 = Math.max(0, z0 >> 4);
    const cx1 = Math.min(this.ncx - 1, x1 >> 4), cy1 = Math.min(this.ncy - 1, y1 >> 4), cz1 = Math.min(this.ncz - 1, z1 >> 4);
    for (let cy = cy0; cy <= cy1; cy++) for (let cz = cz0; cz <= cz1; cz++) {
      let ci = cx0 + this.ncx * (cz + this.ncz * cy);
      for (let cx = cx0; cx <= cx1; cx++, ci++) { const s = this.stamp[ci]; if (s > m) m = s; }
    }
    return m;
  }

  /** Total memory used by dense chunks, in bytes. */
  denseBytes(): number {
    let n = 0;
    for (let i = 0; i < this.nchunks; i++) if (this.kind[i] === CK.Dense) n += CS3;
    return n;
  }
}
