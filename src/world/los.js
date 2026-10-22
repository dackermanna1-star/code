// Line of sight: terrain occlusion, solid structures, smoke clouds and forest
// canopy (which attenuates rather than blocks). Returns a visibility factor in
// [0, 1].

import { clamp } from '../core/math.js';

const CANOPY = 13; // metres of foliage above the ground that attenuate sight

export class LineOfSight {
  constructor(map, smoke) {
    this.terrain = map.terrain;
    this.structures = map.structures;
    this.forest = map.forest;
    this.smoke = smoke;
    this.checks = 0;
  }

  // ignoreA/ignoreB: structures the endpoints are standing on/in (rooftops).
  visibility(ax, ay, az, bx, by, bz, ignoreA = null, ignoreB = null) {
    this.checks++;
    if (!this.terrain.lineClear(ax, ay, az, bx, by, bz, 0.25)) return 0;
    if (this.structures.blocksSight(ax, ay, az, bx, by, bz, ignoreA, ignoreB)) return 0;
    let vis = 1;
    if (this.smoke) {
      const od = this.smoke.opticalDepth(ax, ay, az, bx, by, bz);
      if (od > 0) vis *= Math.exp(-od);
      if (vis < 0.05) return 0;
    }
    vis *= this.forestTransmittance(ax, ay, az, bx, by, bz);
    return vis < 0.05 ? 0 : vis;
  }

  forestTransmittance(ax, ay, az, bx, by, bz) {
    const f = this.forest;
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const len = Math.hypot(dx, dz);
    if (len < 12) return 1;
    const step = f.res;
    let sum = 0;
    // Skip the first and last few metres: units at a tree line can see out.
    for (let d = 7; d < len - 7; d += step) {
      const t = d / len;
      const x = ax + dx * t;
      const z = az + dz * t;
      const cx = clamp(Math.floor((x + this.terrain.half) / f.res), 0, f.n - 1);
      const cz = clamp(Math.floor((z + this.terrain.half) / f.res), 0, f.n - 1);
      const dens = f.dens[cz * f.n + cx];
      if (dens < 0.05) continue;
      const above = ay + dy * t - this.terrain.heightAt(x, z);
      if (above > CANOPY) continue;
      sum += dens;
      if (sum > 12) return 0;
    }
    return Math.exp(-sum * 0.32);
  }

  forestDensityAt(x, z) {
    const f = this.forest;
    const cx = clamp(Math.floor((x + this.terrain.half) / f.res), 0, f.n - 1);
    const cz = clamp(Math.floor((z + this.terrain.half) / f.res), 0, f.n - 1);
    return f.dens[cz * f.n + cx];
  }
}
