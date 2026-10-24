// Heightfield terrain. Each grid cell is split into two triangles along the
// (i,j)-(i+1,j+1) diagonal; the render mesh uses the same split so physics and
// visuals agree exactly.

import { Surface } from './surfaces.ts';

export interface TerrainSample {
  h: number;
  nx: number;
  ny: number;
  nz: number;
}

export class Heightfield {
  readonly nx: number; // vertex count along x
  readonly nz: number; // vertex count along z
  readonly cell: number;
  readonly x0: number;
  readonly z0: number;
  readonly heights: Float32Array;
  /** Surface type per material cell (finer grid). */
  readonly matCell: number;
  readonly matNx: number;
  readonly matNz: number;
  readonly materials: Uint8Array;

  constructor(nx: number, nz: number, cell: number, x0: number, z0: number, matCell = 1) {
    this.nx = nx;
    this.nz = nz;
    this.cell = cell;
    this.x0 = x0;
    this.z0 = z0;
    this.heights = new Float32Array(nx * nz);
    this.matCell = matCell;
    this.matNx = Math.ceil(((nx - 1) * cell) / matCell);
    this.matNz = Math.ceil(((nz - 1) * cell) / matCell);
    this.materials = new Uint8Array(this.matNx * this.matNz).fill(Surface.GRASS);
  }

  get width(): number {
    return (this.nx - 1) * this.cell;
  }
  get depth(): number {
    return (this.nz - 1) * this.cell;
  }

  index(i: number, j: number): number {
    return j * this.nx + i;
  }

  getH(i: number, j: number): number {
    if (i < 0) i = 0;
    else if (i >= this.nx) i = this.nx - 1;
    if (j < 0) j = 0;
    else if (j >= this.nz) j = this.nz - 1;
    return this.heights[j * this.nx + i];
  }

  heightAt(x: number, z: number): number {
    const gx = (x - this.x0) / this.cell;
    const gz = (z - this.z0) / this.cell;
    let i = Math.floor(gx), j = Math.floor(gz);
    if (i < 0) i = 0;
    else if (i > this.nx - 2) i = this.nx - 2;
    if (j < 0) j = 0;
    else if (j > this.nz - 2) j = this.nz - 2;
    let fx = gx - i, fz = gz - j;
    if (fx < 0) fx = 0;
    else if (fx > 1) fx = 1;
    if (fz < 0) fz = 0;
    else if (fz > 1) fz = 1;
    const H = this.heights, nx = this.nx;
    const k = j * nx + i;
    const h00 = H[k], h10 = H[k + 1], h01 = H[k + nx], h11 = H[k + nx + 1];
    if (fx > fz) return h00 + fx * (h10 - h00) + fz * (h11 - h10);
    return h00 + fz * (h01 - h00) + fx * (h11 - h01);
  }

  /** Height and unit normal at (x, z). */
  sample(x: number, z: number, out: TerrainSample): TerrainSample {
    const c = this.cell;
    const gx = (x - this.x0) / c;
    const gz = (z - this.z0) / c;
    let i = Math.floor(gx), j = Math.floor(gz);
    if (i < 0) i = 0;
    else if (i > this.nx - 2) i = this.nx - 2;
    if (j < 0) j = 0;
    else if (j > this.nz - 2) j = this.nz - 2;
    let fx = gx - i, fz = gz - j;
    if (fx < 0) fx = 0;
    else if (fx > 1) fx = 1;
    if (fz < 0) fz = 0;
    else if (fz > 1) fz = 1;
    const H = this.heights, nx = this.nx;
    const k = j * nx + i;
    const h00 = H[k], h10 = H[k + 1], h01 = H[k + nx], h11 = H[k + nx + 1];
    let sx: number, sz: number;
    if (fx > fz) {
      sx = h10 - h00;
      sz = h11 - h10;
      out.h = h00 + fx * sx + fz * sz;
    } else {
      sz = h01 - h00;
      sx = h11 - h01;
      out.h = h00 + fz * sz + fx * sx;
    }
    // normal = normalize(-dh/dx, 1, -dh/dz)
    const ddx = sx / c, ddz = sz / c;
    const inv = 1 / Math.sqrt(ddx * ddx + 1 + ddz * ddz);
    out.nx = -ddx * inv;
    out.ny = inv;
    out.nz = -ddz * inv;
    return out;
  }

  surfaceAt(x: number, z: number): number {
    const i = Math.floor((x - this.x0) / this.matCell);
    const j = Math.floor((z - this.z0) / this.matCell);
    if (i < 0 || j < 0 || i >= this.matNx || j >= this.matNz) return Surface.GRASS;
    return this.materials[j * this.matNx + i];
  }

  setSurface(x: number, z: number, s: number): void {
    const i = Math.floor((x - this.x0) / this.matCell);
    const j = Math.floor((z - this.z0) / this.matCell);
    if (i < 0 || j < 0 || i >= this.matNx || j >= this.matNz) return;
    this.materials[j * this.matNx + i] = s;
  }

  /**
   * Ray march against the terrain. Direction normalized. Returns distance or -1.
   */
  raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number, out: TerrainSample): number {
    let f0 = oy - this.heightAt(ox, oz);
    if (f0 < 0) {
      this.sample(ox, oz, out);
      return 0;
    }
    const step = Math.min(this.cell * 0.5, Math.max(0.05, maxT / 8));
    let t0 = 0;
    while (t0 < maxT) {
      const t1 = Math.min(maxT, t0 + step);
      const x = ox + dx * t1, y = oy + dy * t1, z = oz + dz * t1;
      const f1 = y - this.heightAt(x, z);
      if (f1 <= 0) {
        // refine by secant/bisection
        let a = t0, b = t1, fa = f0, fb = f1;
        for (let it = 0; it < 10; it++) {
          const m = a + (b - a) * (fa / (fa - fb));
          const fm = oy + dy * m - this.heightAt(ox + dx * m, oz + dz * m);
          if (Math.abs(fm) < 1e-4) {
            a = b = m;
            break;
          }
          if (fm > 0) {
            a = m;
            fa = fm;
          } else {
            b = m;
            fb = fm;
          }
        }
        const t = (a + b) / 2;
        this.sample(ox + dx * t, oz + dz * t, out);
        return t;
      }
      t0 = t1;
      f0 = f1;
    }
    return -1;
  }
}
