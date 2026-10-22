// Heightmap terrain: elevation, surface material and burn marks on a regular
// grid. Provides height/normal queries, ray casts for line of sight and
// projectiles, and deformation (craters) with dirty-chunk tracking for the
// renderer.

import { clamp } from '../core/math.js';

export const MAT = {
  GRASS: 0,
  DIRT: 1,
  ROCK: 2,
  SAND: 3,
  ROAD: 4,
  FIELD: 5,
  CONCRETE: 6,
  MUD: 7,
  FOREST: 8,
  DRYGRASS: 9,
};

export class Terrain {
  constructor(size = 2048, res = 2, chunkSize = 128) {
    this.size = size;
    this.half = size / 2;
    this.res = res;
    this.n = Math.round(size / res) + 1;
    this.h = new Float32Array(this.n * this.n);
    this.mat = new Uint8Array(this.n * this.n);
    this.scorch = new Uint8Array(this.n * this.n);
    this.chunkSize = chunkSize;
    this.chunksPerSide = Math.round(size / chunkSize);
    this.dirtyChunks = new Set();
    this.waterLevel = -1000;
    this.minHeight = 0;
    this.maxHeight = 0;
  }

  idx(ix, iz) {
    return iz * this.n + ix;
  }

  // Grid coordinates (fractional) of a world position.
  gx(x) {
    return (x + this.half) / this.res;
  }

  gz(z) {
    return (z + this.half) / this.res;
  }

  worldX(ix) {
    return ix * this.res - this.half;
  }

  worldZ(iz) {
    return iz * this.res - this.half;
  }

  inBounds(x, z, margin = 0) {
    return x >= -this.half + margin && x <= this.half - margin && z >= -this.half + margin && z <= this.half - margin;
  }

  sample(ix, iz) {
    const n = this.n - 1;
    ix = ix < 0 ? 0 : ix > n ? n : ix;
    iz = iz < 0 ? 0 : iz > n ? n : iz;
    return this.h[iz * this.n + ix];
  }

  heightAt(x, z) {
    let fx = (x + this.half) / this.res;
    let fz = (z + this.half) / this.res;
    const max = this.n - 1.0001;
    fx = fx < 0 ? 0 : fx > max ? max : fx;
    fz = fz < 0 ? 0 : fz > max ? max : fz;
    const ix = fx | 0;
    const iz = fz | 0;
    const tx = fx - ix;
    const tz = fz - iz;
    const i = iz * this.n + ix;
    const h = this.h;
    // Match the render mesh triangulation (diagonal from (0,0) to (1,1)).
    if (tx > tz) {
      return h[i] + (h[i + 1] - h[i]) * tx + (h[i + this.n + 1] - h[i + 1]) * tz;
    }
    return h[i] + (h[i + this.n + 1] - h[i + this.n]) * tx + (h[i + this.n] - h[i]) * tz;
  }

  normalAt(x, z, out) {
    const e = this.res;
    const hl = this.heightAt(x - e, z);
    const hr = this.heightAt(x + e, z);
    const hd = this.heightAt(x, z - e);
    const hu = this.heightAt(x, z + e);
    out.x = hl - hr;
    out.y = 2 * e;
    out.z = hd - hu;
    const l = Math.hypot(out.x, out.y, out.z);
    out.x /= l;
    out.y /= l;
    out.z /= l;
    return out;
  }

  // Slope as rise over run (0 = flat, 1 = 45 degrees).
  slopeAt(x, z) {
    const e = this.res;
    const dx = (this.heightAt(x + e, z) - this.heightAt(x - e, z)) / (2 * e);
    const dz = (this.heightAt(x, z + e) - this.heightAt(x, z - e)) / (2 * e);
    return Math.hypot(dx, dz);
  }

  materialAt(x, z) {
    const ix = clamp(Math.round(this.gx(x)), 0, this.n - 1);
    const iz = clamp(Math.round(this.gz(z)), 0, this.n - 1);
    return this.mat[iz * this.n + ix];
  }

  isWater(x, z) {
    return this.heightAt(x, z) < this.waterLevel;
  }

  // First intersection of segment a->b with the ground, as t in [0,1], or -1.
  // `step` is the coarse march distance in metres.
  segmentHit(ax, ay, az, bx, by, bz, step = 3) {
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-6) return ay < this.heightAt(ax, az) ? 0 : -1;
    if (ay < this.heightAt(ax, az)) return 0;
    const steps = Math.max(1, Math.ceil(len / step));
    let prevT = 0;
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const y = ay + dy * t;
      if (y < this.heightAt(ax + dx * t, az + dz * t)) {
        // Refine by bisection between prevT and t.
        let lo = prevT;
        let hi = t;
        for (let k = 0; k < 8; k++) {
          const m = (lo + hi) * 0.5;
          if (ay + dy * m < this.heightAt(ax + dx * m, az + dz * m)) hi = m;
          else lo = m;
        }
        return hi;
      }
      prevT = t;
    }
    return -1;
  }

  // Line of sight over terrain between two points: returns true if clear.
  // Uses adaptive steps: large strides while the ray is well above ground.
  lineClear(ax, ay, az, bx, by, bz, clearance = 0.3) {
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const len = Math.hypot(dx, dz);
    if (len < 1) return true;
    let d = 2;
    const end = len - 2;
    while (d < end) {
      const t = d / len;
      const x = ax + dx * t;
      const z = az + dz * t;
      const gap = ay + dy * t - this.heightAt(x, z) - clearance;
      if (gap < 0) return false;
      d += gap > 12 ? Math.min(gap * 0.7, 40) : gap > 4 ? 4 : 2.5;
    }
    return true;
  }

  // Dig a crater: bowl of `depth` with a slight rim. Returns true if changed.
  crater(x, z, radius, depth) {
    const rim = radius * 1.35;
    const r0 = Math.max(0, Math.floor(this.gx(x - rim)));
    const r1 = Math.min(this.n - 1, Math.ceil(this.gx(x + rim)));
    const c0 = Math.max(0, Math.floor(this.gz(z - rim)));
    const c1 = Math.min(this.n - 1, Math.ceil(this.gz(z + rim)));
    let changed = false;
    for (let iz = c0; iz <= c1; iz++) {
      for (let ix = r0; ix <= r1; ix++) {
        const wx = this.worldX(ix);
        const wz = this.worldZ(iz);
        const d = Math.hypot(wx - x, wz - z);
        if (d > rim) continue;
        const i = iz * this.n + ix;
        let delta;
        if (d < radius) {
          const k = 1 - (d / radius) * (d / radius);
          delta = -depth * k * k + depth * 0.18 * (1 - k);
        } else {
          const k = (d - radius) / (rim - radius);
          delta = depth * 0.18 * (1 - k) * (1 - k);
        }
        // Don't dig through hard surfaces as deeply.
        const m = this.mat[i];
        if (m === MAT.CONCRETE || m === MAT.ROAD) delta *= 0.35;
        this.h[i] += delta;
        if (d < radius * 1.1 && m !== MAT.CONCRETE && m !== MAT.ROAD) this.mat[i] = MAT.MUD;
        changed = true;
      }
    }
    if (changed) this.markDirty(x - rim, z - rim, x + rim, z + rim);
    return changed;
  }

  burn(x, z, radius, amount) {
    const r0 = Math.max(0, Math.floor(this.gx(x - radius)));
    const r1 = Math.min(this.n - 1, Math.ceil(this.gx(x + radius)));
    const c0 = Math.max(0, Math.floor(this.gz(z - radius)));
    const c1 = Math.min(this.n - 1, Math.ceil(this.gz(z + radius)));
    for (let iz = c0; iz <= c1; iz++) {
      for (let ix = r0; ix <= r1; ix++) {
        const d = Math.hypot(this.worldX(ix) - x, this.worldZ(iz) - z) / radius;
        if (d >= 1) continue;
        const i = iz * this.n + ix;
        const add = amount * (1 - d * d) * (0.75 + 0.25 * Math.sin(ix * 12.9898 + iz * 78.233));
        this.scorch[i] = Math.min(255, this.scorch[i] + add);
      }
    }
    this.markDirty(x - radius, z - radius, x + radius, z + radius);
  }

  markDirty(x0, z0, x1, z1) {
    const cs = this.chunkSize;
    const n = this.chunksPerSide;
    // Include a sample of margin: chunk edge vertices are shared.
    const cx0 = clamp(Math.floor((x0 + this.half - this.res) / cs), 0, n - 1);
    const cx1 = clamp(Math.floor((x1 + this.half + this.res) / cs), 0, n - 1);
    const cz0 = clamp(Math.floor((z0 + this.half - this.res) / cs), 0, n - 1);
    const cz1 = clamp(Math.floor((z1 + this.half + this.res) / cs), 0, n - 1);
    for (let cz = cz0; cz <= cz1; cz++) {
      for (let cx = cx0; cx <= cx1; cx++) this.dirtyChunks.add(cz * n + cx);
    }
  }

  computeRange() {
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < this.h.length; i++) {
      const v = this.h[i];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    this.minHeight = lo;
    this.maxHeight = hi;
  }
}
