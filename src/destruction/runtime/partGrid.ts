// Uniform grid of axis-aligned boxes (part AABBs in island frame) for fast "which parts are
// near this point" queries on large islands (walls, floors with hundreds of parts). PURE.
// Compressed-sparse-row storage: one Int32Array of item indices + per-cell offsets.

import type { Vec3 } from "../../geom/vec.ts";

export interface Box3 {
  min: Vec3;
  max: Vec3;
}

export class PartGrid {
  readonly cell: number;
  readonly count: number;
  private ox: number;
  private oy: number;
  private oz: number;
  private nx: number;
  private ny: number;
  private nz: number;
  private offsets: Int32Array;
  private items: Int32Array;
  /** De-duplication stamps for multi-cell queries. */
  private stamp: Uint32Array;
  private stampId = 0;

  /**
   * @param boxes item AABBs (index = item id)
   * @param margin boxes are inflated by this much (m) so points slightly off a surface still hit
   * @param cellSize optional fixed cell size; default adapts to the item density
   */
  constructor(boxes: readonly Box3[], margin = 0.01, cellSize?: number) {
    this.count = boxes.length;
    let minX = Infinity,
      minY = Infinity,
      minZ = Infinity,
      maxX = -Infinity,
      maxY = -Infinity,
      maxZ = -Infinity;
    let sumDiag = 0;
    for (const b of boxes) {
      minX = Math.min(minX, b.min.x - margin);
      minY = Math.min(minY, b.min.y - margin);
      minZ = Math.min(minZ, b.min.z - margin);
      maxX = Math.max(maxX, b.max.x + margin);
      maxY = Math.max(maxY, b.max.y + margin);
      maxZ = Math.max(maxZ, b.max.z + margin);
      sumDiag += Math.max(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z);
    }
    if (!boxes.length) {
      minX = minY = minZ = 0;
      maxX = maxY = maxZ = 1;
    }
    const sx = Math.max(maxX - minX, 1e-3),
      sy = Math.max(maxY - minY, 1e-3),
      sz = Math.max(maxZ - minZ, 1e-3);
    // Cell ~ typical item size, but keep the total cell count bounded (≤ ~32k).
    let cell = cellSize ?? Math.max(0.05, boxes.length ? (sumDiag / boxes.length) * 0.75 : 1);
    const maxCells = 32768;
    while (Math.ceil(sx / cell) * Math.ceil(sy / cell) * Math.ceil(sz / cell) > maxCells) cell *= 1.25;
    this.cell = cell;
    this.ox = minX;
    this.oy = minY;
    this.oz = minZ;
    this.nx = Math.max(1, Math.ceil(sx / cell));
    this.ny = Math.max(1, Math.ceil(sy / cell));
    this.nz = Math.max(1, Math.ceil(sz / cell));
    const nCells = this.nx * this.ny * this.nz;
    const counts = new Int32Array(nCells + 1);
    // pass 1: count
    for (let i = 0; i < boxes.length; i++) {
      this.forCells(boxes[i], margin, (c) => {
        counts[c + 1]++;
      });
    }
    for (let c = 0; c < nCells; c++) counts[c + 1] += counts[c];
    this.offsets = counts;
    this.items = new Int32Array(counts[nCells]);
    const fill = counts.slice(0, nCells);
    for (let i = 0; i < boxes.length; i++) {
      this.forCells(boxes[i], margin, (c) => {
        this.items[fill[c]++] = i;
      });
    }
    this.stamp = new Uint32Array(boxes.length);
  }

  private forCells(b: Box3, margin: number, fn: (c: number) => void): void {
    const x0 = this.ix(b.min.x - margin),
      x1 = this.ix(b.max.x + margin);
    const y0 = this.iy(b.min.y - margin),
      y1 = this.iy(b.max.y + margin);
    const z0 = this.iz(b.min.z - margin),
      z1 = this.iz(b.max.z + margin);
    for (let z = z0; z <= z1; z++)
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) fn((z * this.ny + y) * this.nx + x);
  }

  private ix(x: number): number {
    const i = Math.floor((x - this.ox) / this.cell);
    return i < 0 ? 0 : i >= this.nx ? this.nx - 1 : i;
  }
  private iy(y: number): number {
    const i = Math.floor((y - this.oy) / this.cell);
    return i < 0 ? 0 : i >= this.ny ? this.ny - 1 : i;
  }
  private iz(z: number): number {
    const i = Math.floor((z - this.oz) / this.cell);
    return i < 0 ? 0 : i >= this.nz ? this.nz - 1 : i;
  }

  /**
   * Items whose (inflated) box touches the cells within `radius` of p (radius 0 = the cell of p).
   * Points outside the grid are clamped to the border cells. Results are appended to `out`
   * (cleared first) without duplicates.
   */
  query(p: Vec3, out: number[], radius = 0): number[] {
    out.length = 0;
    if (this.count === 0) return out;
    if (++this.stampId === 0xffffffff) {
      this.stamp.fill(0);
      this.stampId = 1;
    }
    const sid = this.stampId;
    const x0 = this.ix(p.x - radius),
      x1 = this.ix(p.x + radius);
    const y0 = this.iy(p.y - radius),
      y1 = this.iy(p.y + radius);
    const z0 = this.iz(p.z - radius),
      z1 = this.iz(p.z + radius);
    for (let z = z0; z <= z1; z++)
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const c = (z * this.ny + y) * this.nx + x;
          for (let k = this.offsets[c]; k < this.offsets[c + 1]; k++) {
            const it = this.items[k];
            if (this.stamp[it] === sid) continue;
            this.stamp[it] = sid;
            out.push(it);
          }
        }
    return out;
  }
}
