// Dynamic rigid body made of voxels. Each body owns a dense voxel grid in its local frame.
// Local frame: voxel (i,j,k) has its center at ((i+.5,j+.5,k+.5) - com) * VOXEL meters, rotated by `rot`
// and translated by `pos` (pos = world position of the center of mass).

import { Vec3, Quat } from '../engine/math';
import { PAL_DENSITY, PAL_MAT, Mat } from '../world/materials';
import { VOXEL } from '../world/world';

let nextBodyId = 1;

/** edge length (voxels) of the sample buckets of large bodies */
export const SAMPLE_CELL = 8;

export class Body {
  readonly id = nextBodyId++;
  sx: number; sy: number; sz: number;
  vox: Uint8Array;
  count = 0;
  // mass
  mass = 0;
  invMass = 0;
  /** center of mass in grid voxel units */
  com = new Vec3();
  /** local inverse inertia (row-major 3x3) */
  invIL = new Float64Array(9);
  /** world inverse inertia */
  invIW = new Float64Array(9);
  /** rotation matrix (row-major) */
  R = new Float64Array(9);
  // state
  pos = new Vec3();
  rot = new Quat();
  vel = new Vec3();
  ang = new Vec3();
  prevPos = new Vec3();
  prevRot = new Quat();
  // collision samples in grid voxel units (x,y,z per sample) + radius in voxel units
  samples = new Float32Array(0);
  nSamples = 0;
  /** samples bucketed into 8^3-voxel cells (large bodies only): cell start offsets + sample indices */
  sampleCellStart: Int32Array | null = null;
  sampleCellList: Int32Array | null = null;
  sampleCellDims = [0, 0, 0];
  sampleR = 0.5;
  /** bounding sphere radius around COM (meters) */
  radius = 0;
  /** world AABB (meters) */
  aabb = new Float64Array(6);
  // sleep / islands
  sleeping = false;
  sleepTime = 0;
  /** consecutive half-second checks this (small) body spent asleep; see Game.bakeDebris */
  restTicks = 0;
  /** fragment of destroyed material: small debris does not collide with other debris and is baked into the world at rest */
  debris = false;
  island = 0;
  /** frames since the body was created (used to suppress early damage) */
  age = 0;
  // render
  slot = -1;
  meshStart = -1;
  meshAlloc = 0;
  nOp = 0;
  nTr = 0;
  meshDirty = true;
  // gameplay
  explosive = 0;
  /** if true the body is not simulated (e.g. being held) */
  kinematic = false;
  /** accumulated impact damage cooldown */
  damageCooldown = 0;
  /** marks body for structural re-check / split after voxel edits */
  dirtyShape = false;
  removed = false;
  /** user data */
  tag = 0;
  /** cached copy of the world around the body (reused while it stays inside and the world is unchanged) */
  wc: { x0: number; y0: number; z0: number; nx: number; ny: number; nz: number; data: Uint8Array; coarse: Uint8Array; cx: number; cy: number; cz: number; stamp: number } | null = null;
  /** padded copy of the voxel grid + coarse occupancy for fast collision queries (null = rebuild) */
  pvox: Uint8Array | null = null;
  pcoarse: Uint8Array | null = null;
  pcd = [0, 0, 0];
  /** world space sample positions (voxel units), valid for wsStep */
  ws = new Float32Array(0);
  wsStep = -1;
  /** distance-based simulation LOD: frames to skip */
  friction = 0.6;
  restitution = 0.1;
  /** temporary: contact count this step */
  contacts = 0;
  /** seconds since last significant contact (for audio) */
  lastImpactSound = 0;
  /** game: owner flags (held by player etc.) */
  held = false;

  constructor(sx: number, sy: number, sz: number, vox: Uint8Array) {
    this.sx = sx; this.sy = sy; this.sz = sz; this.vox = vox;
  }

  idx(x: number, y: number, z: number): number { return x + this.sx * (z + this.sz * y); }

  get(x: number, y: number, z: number): number {
    if (x < 0 || y < 0 || z < 0 || x >= this.sx || y >= this.sy || z >= this.sz) return 0;
    return this.vox[x + this.sx * (z + this.sz * y)];
  }

  /** Recompute mass, center of mass, inertia. Returns false if empty. */
  computeMass(): boolean {
    const { sx, sy, sz, vox } = this;
    let m = 0, cx = 0, cy = 0, cz = 0, n = 0, expl = 0;
    for (let y = 0; y < sy; y++) for (let z = 0; z < sz; z++) {
      let i = sx * (z + sz * y);
      for (let x = 0; x < sx; x++, i++) {
        const v = vox[i];
        if (!v) continue;
        const d = PAL_DENSITY[v];
        m += d; cx += d * (x + 0.5); cy += d * (y + 0.5); cz += d * (z + 0.5); n++;
        if (PAL_MAT[v] === Mat.Explosive) expl++;
      }
    }
    this.count = n;
    this.explosive = expl;
    if (n === 0 || m <= 0) { this.mass = 0; this.invMass = 0; return false; }
    cx /= m; cy /= m; cz /= m;
    this.com.set(cx, cy, cz);
    // inertia about COM, in kg*m^2
    let ixx = 0, iyy = 0, izz = 0, ixy = 0, ixz = 0, iyz = 0;
    const s2 = VOXEL * VOXEL;
    for (let y = 0; y < sy; y++) for (let z = 0; z < sz; z++) {
      let i = sx * (z + sz * y);
      for (let x = 0; x < sx; x++, i++) {
        const v = vox[i];
        if (!v) continue;
        const d = PAL_DENSITY[v];
        const rx = (x + 0.5 - cx) * VOXEL, ry = (y + 0.5 - cy) * VOXEL, rz = (z + 0.5 - cz) * VOXEL;
        ixx += d * (ry * ry + rz * rz); iyy += d * (rx * rx + rz * rz); izz += d * (rx * rx + ry * ry);
        ixy -= d * rx * ry; ixz -= d * rx * rz; iyz -= d * ry * rz;
      }
    }
    const self = m * s2 / 6; // each voxel's own cube inertia
    ixx += self; iyy += self; izz += self;
    // regularize: avoid extremely thin bodies spinning wildly
    const minI = m * s2 * 0.25;
    ixx = Math.max(ixx, minI); iyy = Math.max(iyy, minI); izz = Math.max(izz, minI);
    invert3(this.invIL, ixx, ixy, ixz, ixy, iyy, iyz, ixz, iyz, izz);
    this.mass = m;
    this.invMass = 1 / m;
    // friction / restitution from dominant material (approx: average over a few voxels)
    return true;
  }

  /**
   * Build collision samples (x, y, z, radius in grid voxel units; stride 4):
   * spheres at surface voxels (coarser blocks for large bodies) plus exposed lattice corners for
   * small bodies so that small boxes rest flat instead of rolling on single spheres.
   */
  buildSamples(): void {
    const { sx, sy, sz, vox } = this;
    const L = this.count > 60000 ? 4 : this.count > 2500 ? 2 : 1;
    const pts: number[] = [];
    const surf = (x: number, y: number, z: number) =>
      !this.get(x - 1, y, z) || !this.get(x + 1, y, z) || !this.get(x, y - 1, z) || !this.get(x, y + 1, z) || !this.get(x, y, z - 1) || !this.get(x, y, z + 1);
    if (L === 1) {
      const exposed = (x: number, y: number, z: number) =>
        (this.get(x - 1, y, z) ? 0 : 1) + (this.get(x + 1, y, z) ? 0 : 1) + (this.get(x, y - 1, z) ? 0 : 1) +
        (this.get(x, y + 1, z) ? 0 : 1) + (this.get(x, y, z - 1) ? 0 : 1) + (this.get(x, y, z + 1) ? 0 : 1);
      const thin = this.count > 64;
      for (let y = 0; y < sy; y++) for (let z = 0; z < sz; z++) for (let x = 0; x < sx; x++) {
        if (!vox[x + sx * (z + sz * y)]) continue;
        const e = exposed(x, y, z);
        if (e === 0) continue;
        // flat face interiors: checkerboard thinning (edges / corners always kept)
        if (thin && e === 1 && ((x + y + z) & 1)) continue;
        pts.push(x + 0.5, y + 0.5, z + 0.5, 0.5);
      }
    } else {
      for (let by = 0; by < sy; by += L) for (let bz = 0; bz < sz; bz += L) for (let bx = 0; bx < sx; bx += L) {
        let n = 0, cx = 0, cy = 0, cz = 0, isSurf = false;
        for (let y = by; y < Math.min(sy, by + L); y++) for (let z = bz; z < Math.min(sz, bz + L); z++) for (let x = bx; x < Math.min(sx, bx + L); x++) {
          if (!vox[x + sx * (z + sz * y)]) continue;
          n++; cx += x + 0.5; cy += y + 0.5; cz += z + 0.5;
          if (!isSurf && surf(x, y, z)) isSurf = true;
        }
        if (n === 0 || !isSurf) continue;
        pts.push(cx / n, cy / n, cz / n, L * 0.5);
      }
    }
    if (this.count <= 400) {
      // exposed lattice corners on edges / convex corners, inset slightly into the solid so that
      // samples never sit exactly on another grid's voxel boundary (ambiguous normals)
      for (let y = 0; y <= sy; y++) for (let z = 0; z <= sz; z++) for (let x = 0; x <= sx; x++) {
        let solid = 0, ix = 0, iy = 0, iz = 0;
        for (let k = 0; k < 8; k++) {
          const dx = (k & 1), dy = (k >> 1) & 1, dz = k >> 2;
          if (this.get(x - 1 + dx, y - 1 + dy, z - 1 + dz)) { solid++; ix += dx - 0.5; iy += dy - 0.5; iz += dz - 0.5; }
        }
        if (solid === 0 || solid > 2) continue;
        // along straight edges keep every other lattice point (convex corners always)
        if (solid === 2 && this.count > 64 && ((x + y + z) & 1)) continue;
        const il = Math.hypot(ix, iy, iz) || 1;
        pts.push(x + (ix / il) * 0.12, y + (iy / il) * 0.12, z + (iz / il) * 0.12, 0.1);
      }
    }
    this.samples = new Float32Array(pts);
    this.nSamples = pts.length / 4;
    this.buildSampleCells();
    this.sampleR = L * 0.5;
    let r2 = 0;
    for (let i = 0; i < pts.length; i += 4) {
      const dx = pts[i] - this.com.x, dy = pts[i + 1] - this.com.y, dz = pts[i + 2] - this.com.z;
      const d = dx * dx + dy * dy + dz * dz;
      if (d > r2) r2 = d;
    }
    this.radius = (Math.sqrt(r2) + this.sampleR + 0.9) * VOXEL;
  }

  /** Bucket the samples of large bodies so a collision pair only visits samples near the other body. */
  buildSampleCells(): void {
    const n = this.nSamples;
    if (n < 256) { this.sampleCellStart = null; this.sampleCellList = null; return; }
    const C = SAMPLE_CELL;
    const nx = (this.sx >> 3) + 1, ny = (this.sy >> 3) + 1, nz = (this.sz >> 3) + 1;
    this.sampleCellDims = [nx, ny, nz];
    const start = new Int32Array(nx * ny * nz + 1);
    const cellOf = (i: number) => {
      const s = this.samples;
      const cx = Math.min(nx - 1, Math.max(0, Math.floor(s[i * 4] / C))), cy = Math.min(ny - 1, Math.max(0, Math.floor(s[i * 4 + 1] / C))), cz = Math.min(nz - 1, Math.max(0, Math.floor(s[i * 4 + 2] / C)));
      return cx + nx * (cz + nz * cy);
    };
    for (let i = 0; i < n; i++) start[cellOf(i) + 1]++;
    for (let c = 0; c < nx * ny * nz; c++) start[c + 1] += start[c];
    const fill = start.slice(0, nx * ny * nz);
    const list = new Int32Array(n);
    for (let i = 0; i < n; i++) list[fill[cellOf(i)]++] = i;
    this.sampleCellStart = start; this.sampleCellList = list;
  }

  /** Update rotation matrix, world inverse inertia and AABB. */
  updateDerived(): void {
    this.rot.toMat3(this.R);
    const R = this.R, I = this.invIL, W = this.invIW;
    // W = R * I * R^T
    const t = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) t[r * 3 + c] = R[r * 3] * I[c] + R[r * 3 + 1] * I[3 + c] + R[r * 3 + 2] * I[6 + c];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) W[r * 3 + c] = t[r * 3] * R[c * 3] + t[r * 3 + 1] * R[c * 3 + 1] + t[r * 3 + 2] * R[c * 3 + 2];
    // AABB from the rotated grid box
    const hx = this.sx * 0.5 * VOXEL, hy = this.sy * 0.5 * VOXEL, hz = this.sz * 0.5 * VOXEL;
    // grid center relative to COM in local meters
    const gx = (this.sx * 0.5 - this.com.x) * VOXEL, gy = (this.sy * 0.5 - this.com.y) * VOXEL, gz = (this.sz * 0.5 - this.com.z) * VOXEL;
    const cx = this.pos.x + R[0] * gx + R[1] * gy + R[2] * gz;
    const cy = this.pos.y + R[3] * gx + R[4] * gy + R[5] * gz;
    const cz = this.pos.z + R[6] * gx + R[7] * gy + R[8] * gz;
    const ex = Math.abs(R[0]) * hx + Math.abs(R[1]) * hy + Math.abs(R[2]) * hz;
    const ey = Math.abs(R[3]) * hx + Math.abs(R[4]) * hy + Math.abs(R[5]) * hz;
    const ez = Math.abs(R[6]) * hx + Math.abs(R[7]) * hy + Math.abs(R[8]) * hz;
    const a = this.aabb;
    a[0] = cx - ex; a[1] = cy - ey; a[2] = cz - ez; a[3] = cx + ex; a[4] = cy + ey; a[5] = cz + ez;
  }

  /** World position of a local grid point (voxel units). */
  gridToWorld(gx: number, gy: number, gz: number, out: Vec3): Vec3 {
    const R = this.R;
    const lx = (gx - this.com.x) * VOXEL, ly = (gy - this.com.y) * VOXEL, lz = (gz - this.com.z) * VOXEL;
    out.x = this.pos.x + R[0] * lx + R[1] * ly + R[2] * lz;
    out.y = this.pos.y + R[3] * lx + R[4] * ly + R[5] * lz;
    out.z = this.pos.z + R[6] * lx + R[7] * ly + R[8] * lz;
    return out;
  }

  /** Local grid coordinates (voxel units) of a world point. */
  worldToGrid(wx: number, wy: number, wz: number, out: Vec3): Vec3 {
    const R = this.R;
    const dx = wx - this.pos.x, dy = wy - this.pos.y, dz = wz - this.pos.z;
    out.x = (R[0] * dx + R[3] * dy + R[6] * dz) * 10 + this.com.x;
    out.y = (R[1] * dx + R[4] * dy + R[7] * dz) * 10 + this.com.y;
    out.z = (R[2] * dx + R[5] * dy + R[8] * dz) * 10 + this.com.z;
    return out;
  }

  /** Velocity of a world point attached to the body. */
  pointVel(wx: number, wy: number, wz: number, out: Vec3): Vec3 {
    const rx = wx - this.pos.x, ry = wy - this.pos.y, rz = wz - this.pos.z;
    out.x = this.vel.x + this.ang.y * rz - this.ang.z * ry;
    out.y = this.vel.y + this.ang.z * rx - this.ang.x * rz;
    out.z = this.vel.z + this.ang.x * ry - this.ang.y * rx;
    return out;
  }

  /** Apply world impulse at world point. */
  applyImpulse(px: number, py: number, pz: number, wx: number, wy: number, wz: number): void {
    if (this.invMass === 0) return;
    this.vel.x += px * this.invMass; this.vel.y += py * this.invMass; this.vel.z += pz * this.invMass;
    const rx = wx - this.pos.x, ry = wy - this.pos.y, rz = wz - this.pos.z;
    const tx = ry * pz - rz * py, ty = rz * px - rx * pz, tz = rx * py - ry * px;
    const W = this.invIW;
    this.ang.x += W[0] * tx + W[1] * ty + W[2] * tz;
    this.ang.y += W[3] * tx + W[4] * ty + W[5] * tz;
    this.ang.z += W[6] * tx + W[7] * ty + W[8] * tz;
  }

  /** render scale (meters per voxel); view models use smaller voxels */
  scale = VOXEL;

  /** 3x4 model rows for rendering: grid coords -> world (includes the voxel scale). */
  modelRows(out: Float32Array | number[], pos: Vec3, rot: Quat): void {
    const m = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    rot.toMat3(m as unknown as Float64Array);
    const s = this.scale;
    const cx = this.com.x, cy = this.com.y, cz = this.com.z;
    for (let r = 0; r < 3; r++) {
      const a = m[r * 3] * s, b = m[r * 3 + 1] * s, c = m[r * 3 + 2] * s;
      out[r * 4] = a; out[r * 4 + 1] = b; out[r * 4 + 2] = c;
      out[r * 4 + 3] = (r === 0 ? pos.x : r === 1 ? pos.y : pos.z) - (a * cx + b * cy + c * cz);
    }
  }

  wake(): void { this.sleeping = false; this.sleepTime = 0; this.restTicks = 0; }

  /** Padded grid for collision queries (built lazily after any voxel change). */
  padded(): Uint8Array {
    if (this.pvox) return this.pvox;
    const PX = this.sx + 2, PY = this.sy + 2, PZ = this.sz + 2;
    const d = new Uint8Array(PX * PY * PZ);
    for (let y = 0; y < this.sy; y++) for (let z = 0; z < this.sz; z++) {
      const si = this.sx * (z + this.sz * y);
      d.set(this.vox.subarray(si, si + this.sx), 1 + PX * (z + 1 + PZ * (y + 1)));
    }
    const cx = (PX + 3) >> 2, cy = (PY + 3) >> 2, cz = (PZ + 3) >> 2;
    const c = new Uint8Array(cx * cy * cz);
    let i = 0;
    for (let y = 0; y < PY; y++) for (let z = 0; z < PZ; z++) for (let x = 0; x < PX; x++, i++) if (d[i]) c[(x >> 2) + cx * ((z >> 2) + cz * (y >> 2))] = 1;
    this.pvox = d; this.pcoarse = c; this.pcd[0] = cx; this.pcd[1] = cy; this.pcd[2] = cz;
    return d;
  }

  /** World-space (voxel units) sample positions for the current transform. */
  worldSamples(step: number): Float32Array {
    if (this.wsStep === step && this.ws.length === this.nSamples * 3) return this.ws;
    if (this.ws.length !== this.nSamples * 3) this.ws = new Float32Array(this.nSamples * 3);
    const R = this.R, s = this.samples, cx = this.com.x, cy = this.com.y, cz = this.com.z;
    const px = this.pos.x * 10, py = this.pos.y * 10, pz = this.pos.z * 10;
    const ws = this.ws;
    for (let i = 0; i < this.nSamples; i++) {
      const lx = s[i * 4] - cx, ly = s[i * 4 + 1] - cy, lz = s[i * 4 + 2] - cz;
      ws[i * 3] = px + R[0] * lx + R[1] * ly + R[2] * lz;
      ws[i * 3 + 1] = py + R[3] * lx + R[4] * ly + R[5] * lz;
      ws[i * 3 + 2] = pz + R[6] * lx + R[7] * ly + R[8] * lz;
    }
    this.wsStep = step;
    return ws;
  }
}

function invert3(out: Float64Array, a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number): void {
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  const inv = det !== 0 ? 1 / det : 0;
  out[0] = A * inv; out[1] = -(b * i - c * h) * inv; out[2] = (b * f - c * e) * inv;
  out[3] = B * inv; out[4] = (a * i - c * g) * inv; out[5] = -(a * f - c * d) * inv;
  out[6] = C * inv; out[7] = -(a * h - b * g) * inv; out[8] = (a * e - b * d) * inv;
}

/** Trim a grid to the bounding box of its solid voxels. Returns [vox, sx, sy, sz, ox, oy, oz] or null if empty. */
export function trimGrid(vox: Uint8Array, sx: number, sy: number, sz: number): [Uint8Array, number, number, number, number, number, number] | null {
  let x0 = sx, y0 = sy, z0 = sz, x1 = -1, y1 = -1, z1 = -1;
  for (let y = 0; y < sy; y++) for (let z = 0; z < sz; z++) {
    let i = sx * (z + sz * y);
    for (let x = 0; x < sx; x++, i++) {
      if (!vox[i]) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (z < z0) z0 = z; if (z > z1) z1 = z;
    }
  }
  if (x1 < 0) return null;
  const nx = x1 - x0 + 1, ny = y1 - y0 + 1, nz = z1 - z0 + 1;
  if (nx === sx && ny === sy && nz === sz) return [vox, sx, sy, sz, 0, 0, 0];
  const out = new Uint8Array(nx * ny * nz);
  for (let y = 0; y < ny; y++) for (let z = 0; z < nz; z++) {
    const si = x0 + sx * ((z + z0) + sz * (y + y0));
    out.set(vox.subarray(si, si + nx), nx * (z + nz * y));
  }
  return [out, nx, ny, nz, x0, y0, z0];
}
