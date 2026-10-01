// 2D walkability grid (10 cm cells). Facade voxel columns that are solid at
// body height block movement (so door recesses and the dock nook are
// walkable), building masses are solid, and props add their footprints.
import * as THREE from 'three';
import { CV } from './units.js';
import { BLOCKS, facadeToWorld } from './layout.js';
import { G, inGround } from './groundData.js';

export class CollisionGrid {
  constructor() {
    this.cell = 0.1;
    this.x0 = G.x0;
    this.z0 = G.z0;
    this.nx = G.nx;
    this.nz = G.nz;
    this.solid = new Uint8Array(this.nx * this.nz);
    // everything outside the ground regions is solid
    for (let j = 0; j < this.nz; j++)
      for (let i = 0; i < this.nx; i++) {
        const x = this.x0 + (i + 0.5) * this.cell, z = this.z0 + (j + 0.5) * this.cell;
        if (!inGround(x, z)) this.solid[i + j * this.nx] = 1;
      }
  }

  markWorld(x, z) {
    const i = Math.floor((x - this.x0) / this.cell), j = Math.floor((z - this.z0) / this.cell);
    if (i >= 0 && j >= 0 && i < this.nx && j < this.nz) this.solid[i + j * this.nx] = 1;
  }

  /** Rasterize facade voxel columns solid between y0..y1 (absolute meters). */
  addFacade(res, y0 = 0.25, y1 = 1.75) {
    const { grid: g, facade: f, kFront, base } = res;
    const j0 = Math.max(0, Math.floor((y0 - base) / CV)), j1 = Math.min(g.ny, Math.ceil((y1 - base) / CV));
    if (j1 <= 0) return;
    const v = new THREE.Vector3();
    for (let k = 0; k < g.nz; k++)
      for (let i = 0; i < g.nx; i++) {
        let solid = false;
        for (let j = j0; j < j1 && !solid; j++) if (g.data[i + g.nx * (j + g.ny * k)]) solid = true;
        if (!solid) continue;
        const zOut = (k - kFront + 0.5) * CV;
        facadeToWorld(f, (i + 0.5) * CV, 0, zOut, v);
        this.markWorld(v.x, v.z);
        // fill a little more densely (voxels are 6.8 cm, cells 10 cm)
        facadeToWorld(f, (i + 0.5) * CV, 0, zOut + CV * 0.5, v);
        this.markWorld(v.x, v.z);
      }
  }

  /** Add an oriented rectangle footprint (center x,z, half sizes, yaw). */
  addRect(cx, cz, hw, hd, yaw = 0, pad = 0) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const r = Math.hypot(hw, hd) + pad;
    for (let z = cz - r; z <= cz + r; z += this.cell * 0.5)
      for (let x = cx - r; x <= cx + r; x += this.cell * 0.5) {
        const dx = x - cx, dz = z - cz;
        const lx = dx * c - dz * s, lz = dx * s + dz * c;
        if (Math.abs(lx) <= hw + pad && Math.abs(lz) <= hd + pad) this.markWorld(x, z);
      }
  }

  addCircle(cx, cz, r) {
    for (let z = cz - r; z <= cz + r; z += this.cell * 0.5)
      for (let x = cx - r; x <= cx + r; x += this.cell * 0.5) if ((x - cx) ** 2 + (z - cz) ** 2 <= r * r) this.markWorld(x, z);
  }

  blockedAt(x, z) {
    const i = Math.floor((x - this.x0) / this.cell), j = Math.floor((z - this.z0) / this.cell);
    if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) return true;
    return this.solid[i + j * this.nx] === 1;
  }

  /** True if a circle of radius r at (x,z) overlaps a solid cell. */
  circleBlocked(x, z, r) {
    const c = this.cell;
    const i0 = Math.floor((x - r - this.x0) / c), i1 = Math.floor((x + r - this.x0) / c);
    const j0 = Math.floor((z - r - this.z0) / c), j1 = Math.floor((z + r - this.z0) / c);
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) return true;
        if (!this.solid[i + j * this.nx]) continue;
        // closest point of the cell to the circle centre
        const cx0 = this.x0 + i * c, cz0 = this.z0 + j * c;
        const px = Math.max(cx0, Math.min(x, cx0 + c)), pz = Math.max(cz0, Math.min(z, cz0 + c));
        if ((px - x) ** 2 + (pz - z) ** 2 < r * r) return true;
      }
    return false;
  }

  /** Move a circle with sliding; returns the new position. */
  move(x, z, dx, dz, r) {
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / (r * 0.5)));
    const sx = dx / steps, sz = dz / steps;
    for (let s = 0; s < steps; s++) {
      if (!this.circleBlocked(x + sx, z + sz, r)) {
        x += sx;
        z += sz;
        continue;
      }
      if (!this.circleBlocked(x + sx, z, r)) x += sx;
      else if (!this.circleBlocked(x, z + sz, r)) z += sz;
    }
    return { x, z };
  }
}

export { BLOCKS };
