// Voxel construction helpers used by the level generator. All coordinates are voxel units,
// boxes are [min, max) (max exclusive).


/** Anything voxels can be written into (the world or a standalone prop grid). */
export interface VoxelTarget {
  get(x: number, y: number, z: number): number;
  set(x: number, y: number, z: number, v: number): unknown;
}

/** A standalone voxel grid (prop models). x fastest, then z, then y (same layout as bodies). */
export class Grid implements VoxelTarget {
  readonly vox: Uint8Array;
  constructor(readonly sx: number, readonly sy: number, readonly sz: number) { this.vox = new Uint8Array(sx * sy * sz); }
  get(x: number, y: number, z: number): number {
    if (x < 0 || y < 0 || z < 0 || x >= this.sx || y >= this.sy || z >= this.sz) return 0;
    return this.vox[x + this.sx * (z + this.sz * y)];
  }
  set(x: number, y: number, z: number, v: number): void {
    if (x < 0 || y < 0 || z < 0 || x >= this.sx || y >= this.sy || z >= this.sz) return;
    this.vox[x + this.sx * (z + this.sz * y)] = v;
  }
  /** Rotate around Y by 90deg * k (counter-clockwise seen from above). */
  rotY(k: number): Grid {
    k = ((k % 4) + 4) % 4;
    if (k === 0) return this;
    const nx = k % 2 ? this.sz : this.sx, nz = k % 2 ? this.sx : this.sz;
    const g = new Grid(nx, this.sy, nz);
    for (let y = 0; y < this.sy; y++) for (let z = 0; z < this.sz; z++) for (let x = 0; x < this.sx; x++) {
      const v = this.vox[x + this.sx * (z + this.sz * y)];
      if (!v) continue;
      let X: number, Z: number;
      if (k === 1) { X = z; Z = this.sx - 1 - x; }
      else if (k === 2) { X = this.sx - 1 - x; Z = this.sz - 1 - z; }
      else { X = this.sz - 1 - z; Z = x; }
      g.vox[X + nx * (Z + nz * y)] = v;
    }
    return g;
  }
}
import { hash3, Rng } from '../engine/math';
import { variant } from '../world/materials';

export type Paint = number | ((x: number, y: number, z: number) => number);

export const m = (meters: number) => Math.round(meters * 10);

export class Builder {
  rng: Rng;
  /** when true, only writes into empty voxels */
  onlyEmpty = false;
  /** count of voxels written */
  written = 0;
  constructor(readonly world: VoxelTarget, seed = 1337) { this.rng = new Rng(seed); }

  set(x: number, y: number, z: number, p: number): void {
    if (this.onlyEmpty && this.world.get(x, y, z) !== 0) return;
    this.world.set(x, y, z, p);
    this.written++;
  }

  private col(p: Paint, x: number, y: number, z: number): number { return typeof p === 'number' ? p : p(x, y, z); }

  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, p: Paint): void {
    if (x1 < x0) [x0, x1] = [x1, x0];
    if (y1 < y0) [y0, y1] = [y1, y0];
    if (z1 < z0) [z0, z1] = [z1, z0];
    for (let y = y0; y < y1; y++) for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) {
      const c = this.col(p, x, y, z);
      if (c >= 0) this.set(x, y, z, c);
    }
  }

  clear(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
    const oe = this.onlyEmpty; this.onlyEmpty = false;
    for (let y = y0; y < y1; y++) for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) this.world.set(x, y, z, 0);
    this.onlyEmpty = oe;
  }

  /** Four walls of thickness t around [x0,x1)x[z0,z1), from y0 to y1. */
  walls(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, t: number, p: Paint): void {
    this.box(x0, y0, z0, x1, y1, z0 + t, p);
    this.box(x0, y0, z1 - t, x1, y1, z1, p);
    this.box(x0, y0, z0 + t, x0 + t, y1, z1 - t, p);
    this.box(x1 - t, y0, z0 + t, x1, y1, z1 - t, p);
  }

  /** Vertical cylinder (axis Y) centered at (cx, cz) with radius r (voxels). thickness>0 makes it hollow. */
  cylY(cx: number, cz: number, r: number, y0: number, y1: number, p: Paint, thickness = 0, cap = false): void {
    const r2 = r * r, ri = thickness > 0 ? r - thickness : -1, ri2 = ri * ri;
    const R = Math.ceil(r);
    for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
      const d2 = (dx + 0.5) * (dx + 0.5) + (dz + 0.5) * (dz + 0.5);
      if (d2 > r2) continue;
      const shell = ri < 0 || d2 >= ri2;
      for (let y = y0; y < y1; y++) {
        if (!shell && !(cap && (y === y0 || y === y1 - 1))) continue;
        const x = Math.floor(cx) + dx, z = Math.floor(cz) + dz;
        const c = this.col(p, x, y, z);
        if (c >= 0) this.set(x, y, z, c);
      }
    }
  }

  /** Horizontal cylinder along X. */
  cylX(cy: number, cz: number, r: number, x0: number, x1: number, p: Paint, thickness = 0, cap = false): void {
    const r2 = r * r, ri = thickness > 0 ? r - thickness : -1, ri2 = ri * ri;
    const R = Math.ceil(r);
    for (let dy = -R; dy <= R; dy++) for (let dz = -R; dz <= R; dz++) {
      const d2 = (dy + 0.5) * (dy + 0.5) + (dz + 0.5) * (dz + 0.5);
      if (d2 > r2) continue;
      const shell = ri < 0 || d2 >= ri2;
      for (let x = x0; x < x1; x++) {
        if (!shell && !(cap && (x === x0 || x === x1 - 1))) continue;
        const y = Math.floor(cy) + dy, z = Math.floor(cz) + dz;
        const c = this.col(p, x, y, z);
        if (c >= 0) this.set(x, y, z, c);
      }
    }
  }

  /** Horizontal cylinder along Z. */
  cylZ(cx: number, cy: number, r: number, z0: number, z1: number, p: Paint, thickness = 0, cap = false): void {
    const r2 = r * r, ri = thickness > 0 ? r - thickness : -1, ri2 = ri * ri;
    const R = Math.ceil(r);
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const d2 = (dy + 0.5) * (dy + 0.5) + (dx + 0.5) * (dx + 0.5);
      if (d2 > r2) continue;
      const shell = ri < 0 || d2 >= ri2;
      for (let z = z0; z < z1; z++) {
        if (!shell && !(cap && (z === z0 || z === z1 - 1))) continue;
        const y = Math.floor(cy) + dy, x = Math.floor(cx) + dx;
        const c = this.col(p, x, y, z);
        if (c >= 0) this.set(x, y, z, c);
      }
    }
  }

  sphere(cx: number, cy: number, cz: number, r: number, p: Paint, thickness = 0): void {
    const r2 = r * r, ri = thickness > 0 ? r - thickness : -1, ri2 = ri * ri;
    const R = Math.ceil(r);
    for (let dy = -R; dy <= R; dy++) for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
      const d2 = (dx + 0.5) ** 2 + (dy + 0.5) ** 2 + (dz + 0.5) ** 2;
      if (d2 > r2 || (ri >= 0 && d2 < ri2)) continue;
      const x = Math.floor(cx) + dx, y = Math.floor(cy) + dy, z = Math.floor(cz) + dz;
      const c = this.col(p, x, y, z);
      if (c >= 0) this.set(x, y, z, c);
    }
  }

  /** Thick 3D line from a to b (inclusive), square cross-section of size t. */
  line(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, t: number, p: Paint): void {
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
    const n = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz), 1);
    const h0 = Math.floor((t - 1) / 2), h1 = t - 1 - h0;
    for (let i = 0; i <= n; i++) {
      const x = Math.round(x0 + (dx * i) / n), y = Math.round(y0 + (dy * i) / n), z = Math.round(z0 + (dz * i) / n);
      for (let a = -h0; a <= h1; a++) for (let b = -h0; b <= h1; b++) for (let c = -h0; c <= h1; c++) {
        const cc = this.col(p, x + a, y + b, z + c);
        if (cc >= 0) this.set(x + a, y + b, z + c, cc);
      }
    }
  }

  /** I-beam along an axis ('x' | 'y' | 'z'), flanges perpendicular to `web` axis. size = flange width. */
  ibeam(axis: 'x' | 'y' | 'z', ax: number, ay: number, az: number, len: number, size: number, flangeAxis: 'x' | 'y' | 'z', p: Paint): void {
    // cross-section: two flanges (size wide, 1 thick) joined by a web (1 thick)
    for (let i = 0; i < len; i++) {
      for (let a = 0; a < size; a++) for (let b = 0; b < size; b++) {
        const onFlange = b === 0 || b === size - 1;
        const onWeb = a === (size >> 1);
        if (!onFlange && !onWeb) continue;
        // a runs along the flange axis, b along the remaining axis
        let x = ax, y = ay, z = az;
        const add = (ax2: 'x' | 'y' | 'z', v: number) => { if (ax2 === 'x') x += v; else if (ax2 === 'y') y += v; else z += v; };
        add(axis, i);
        add(flangeAxis, a);
        const rest = (['x', 'y', 'z'] as const).find((k) => k !== axis && k !== flangeAxis)!;
        add(rest, b);
        const c = this.col(p, x, y, z);
        if (c >= 0) this.set(x, y, z, c);
      }
    }
  }

  /** Paint helpers ------------------------------------------------------ */
  /** Random shade of a palette group per voxel. */
  static shade(base: number): Paint { return (x, y, z) => variant(base, hash3(x, y, z)); }
  /** Pick per-voxel between palettes with probabilities. */
  static mix(entries: [number, number][]): Paint {
    return (x, y, z) => {
      const h = hash3(x, y, z) / 4294967296;
      let acc = 0;
      for (const [p, w] of entries) { acc += w; if (h < acc) return p; }
      return entries[entries.length - 1][0];
    };
  }
}
