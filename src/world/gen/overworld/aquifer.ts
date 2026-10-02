/**
 * Simplified Minecraft-style aquifers: decides what fills a cave-air block (air / water / lava /
 * barrier stone). A jittered 16x12x16 grid of aquifer centres each carries a fluid status:
 *  - "global": water up to sea level (used near the surface, so caves under the sea level flood
 *    consistently with oceans and rivers),
 *  - "local": a random water level (or lava when low), forming underground lakes,
 *  - "dry".
 * Where two neighbouring centres disagree, a thin stone barrier is placed between them so fluids
 * never hang in the air. Any cave air below `LAVA_Y` is lava (lava lakes at the bottom).
 * Pure function of (seed, x, y, z).
 */
import { OctaveNoise, RawNoise3, clampedMap as clampedMap_, hash3i as hash3i_ } from '../common/noise';
import type { OverworldTerrain } from './terrain';

const clampedMap = clampedMap_;
const hash3i = hash3i_;

export const FLUID_NONE = 0;
export const FLUID_WATER = 1;
export const FLUID_LAVA = 2;
export const FLUID_BARRIER = 3;

export const LAVA_Y = 8; // cave air with y < LAVA_Y is lava
const SEA_LEVEL = 63;

export class Aquifer {
  private readonly flood: OctaveNoise;
  private readonly spread: RawNoise3;
  private readonly lavaN: RawNoise3;
  private readonly cache = new Map<number, number>();
  // scratch
  private readonly cd = new Float64Array(12);
  private readonly cs = new Int32Array(12);

  constructor(readonly seed: number, private readonly terrain: OverworldTerrain) {
    this.flood = new OctaveNoise(seed ^ 0x3a1c5e, 1 / 128, [1], { sigma: 0.45, yScale: 1.5 });
    this.spread = new RawNoise3(seed ^ 0x51f00d, 1 / 1.5, 1 / 1.5);
    this.lavaN = new RawNoise3(seed ^ 0x7ab1e, 1 / 64, 1 / 64);
  }

  /** Encoded status: level * 4 + type (type 0 = none, 1 = water, 2 = lava). */
  private status(gx: number, gy: number, gz: number): number {
    const key = ((gx + 0x200000) * 64 + (gy + 8)) * 0x400000 + (gz + 0x200000);
    const hit = this.cache.get(key);
    if (hit !== undefined) return hit;
    if (this.cache.size > 50000) this.cache.clear();
    const h = hash3i(gx, gy, gz, this.seed ^ 0x6a09e667);
    const px = gx * 16 + (h % 10), py = gy * 12 + ((h >>> 8) % 9), pz = gz * 16 + ((h >>> 16) % 10);
    const prelim = this.terrain.quart(px >> 2, pz >> 2).prelim;
    let st: number;
    const below = prelim + 8 - py;
    const f = clampedMap(below, 0, 44, 1, 0);
    const fl = this.flood.noise3(px, py, pz);
    const depthOff = fl - (f * -0.3 + (1 - f) * 0.8);
    const eroOff = fl - (f * -0.8 + (1 - f) * 0.4);
    if (py >= prelim - 10 || depthOff > 0) {
      st = SEA_LEVEL * 4 + FLUID_WATER;
    } else if (eroOff > 0) {
      const band = Math.floor(py / 24);
      const c = band * 24 + 12;
      const sp = this.spread.at(gx, band, gz) * 8;
      let level = c + Math.floor(sp / 3) * 3;
      level = Math.min(level, Math.floor(prelim) - 8);
      const lava = level <= 14 && Math.abs(this.lavaN.at(px, py, pz)) > 0.25;
      st = Math.max(0, level) * 4 + (lava ? FLUID_LAVA : FLUID_WATER);
    } else {
      st = FLUID_NONE;
    }
    this.cache.set(key, st);
    return st;
  }

  // per-chunk tables (prepare()): centres and lazily computed statuses for gx/gz in [base, base+2],
  // gy in [-1, 22]
  private gxBase = 0;
  private gzBase = 0;
  private prepared = false;
  private readonly tcx = new Int32Array(216);
  private readonly tcy = new Int32Array(216);
  private readonly tcz = new Int32Array(216);
  private readonly tst = new Int32Array(216);

  /** Precompute the aquifer cells around chunk (cx, cz); fluidAt is fastest inside that chunk. */
  prepare(cx: number, cz: number): void {
    this.gxBase = cx - 1;
    this.gzBase = cz - 1;
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 24; j++)
        for (let k = 0; k < 3; k++) {
          const gx = this.gxBase + i, gy = j - 1, gz = this.gzBase + k;
          const h = hash3i(gx, gy, gz, this.seed ^ 0x6a09e667);
          const n = (i * 24 + j) * 3 + k;
          this.tcx[n] = gx * 16 + (h % 10);
          this.tcy[n] = gy * 12 + ((h >>> 8) % 9);
          this.tcz[n] = gz * 16 + ((h >>> 16) % 10);
          this.tst[n] = -1;
        }
    this.prepared = true;
  }

  private decode(code: number, gx0: number, gy0: number, gz0: number): number {
    const ax = (code / 6) | 0, r = code - ax * 6, ay = (r / 2) | 0, az = r - ay * 2;
    return this.status(gx0 + ax, gy0 + ay, gz0 + az);
  }

  /** What fills cave air at (x, y, z). */
  fluidAt(x: number, y: number, z: number): number {
    if (y < LAVA_Y) return FLUID_LAVA;
    const gx0 = Math.floor((x - 5) / 16), gy0 = Math.floor((y + 1) / 12) - 1, gz0 = Math.floor((z - 5) / 16);
    const ix = gx0 - this.gxBase, iz = gz0 - this.gzBase, iy = gy0 + 1;
    if (this.prepared && ix >= 0 && ix <= 1 && iz >= 0 && iz <= 1 && iy >= 0 && iy <= 21) return this.fluidFast(x, y, z, ix, iy, iz, gx0, gy0, gz0);
    let n = 0;
    for (let ax = 0; ax <= 1; ax++)
      for (let ay = 0; ay <= 2; ay++)
        for (let az = 0; az <= 1; az++) {
          const gx = gx0 + ax, gy = gy0 + ay, gz = gz0 + az;
          const h = hash3i(gx, gy, gz, this.seed ^ 0x6a09e667);
          const dx = gx * 16 + (h % 10) - x, dy = gy * 12 + ((h >>> 8) % 9) - y, dz = gz * 16 + ((h >>> 16) % 10) - z;
          this.cd[n] = dx * dx + dy * dy + dz * dz;
          this.cs[n] = (gx - gx0) * 6 + (gy - gy0) * 2 + (gz - gz0);
          n++;
        }
    return this.resolve(n, y, gx0, gy0, gz0);
  }

  private fluidFast(x: number, y: number, z: number, ix: number, iy: number, iz: number, gx0: number, gy0: number, gz0: number): number {
    // early out: if no candidate cell holds fluid at this height, the answer is "no fluid" (exact)
    let any = false;
    for (let ax = 0; ax <= 1 && !any; ax++)
      for (let ay = 0; ay <= 2 && !any; ay++)
        for (let az = 0; az <= 1; az++) {
          const st = this.cachedStatus(ax * 6 + ay * 2 + az, ix, iy, iz, gx0, gy0, gz0);
          if ((st & 3) !== FLUID_NONE && y < st >> 2) {
            any = true;
            break;
          }
        }
    if (!any) return FLUID_NONE;
    let n = 0;
    for (let ax = 0; ax <= 1; ax++)
      for (let ay = 0; ay <= 2; ay++)
        for (let az = 0; az <= 1; az++) {
          const t = ((ix + ax) * 24 + iy + ay) * 3 + iz + az;
          const dx = this.tcx[t] - x, dy = this.tcy[t] - y, dz = this.tcz[t] - z;
          this.cd[n] = dx * dx + dy * dy + dz * dz;
          this.cs[n] = ax * 6 + ay * 2 + az;
          n++;
        }
    let i1 = 0, i2 = -1;
    for (let i = 1; i < n; i++) {
      if (this.cd[i] < this.cd[i1]) { i2 = i1; i1 = i; }
      else if (i2 < 0 || this.cd[i] < this.cd[i2]) i2 = i;
    }
    const s1 = this.cachedStatus(this.cs[i1], ix, iy, iz, gx0, gy0, gz0);
    const t1 = s1 & 3, l1 = s1 >> 2;
    const f1 = t1 !== FLUID_NONE && y < l1 ? t1 : FLUID_NONE;
    const sim = 1 - Math.abs(this.cd[i2] - this.cd[i1]) / 25;
    if (sim > 0) {
      const s2 = this.cachedStatus(this.cs[i2], ix, iy, iz, gx0, gy0, gz0);
      const t2 = s2 & 3, l2 = s2 >> 2;
      const f2 = t2 !== FLUID_NONE && y < l2 ? t2 : FLUID_NONE;
      if (f1 !== f2 && sim > 0.3) return FLUID_BARRIER;
      if (f1 !== FLUID_NONE && f2 !== FLUID_NONE && l1 !== l2 && sim > 0.3) return FLUID_BARRIER;
    }
    return f1;
  }

  private cachedStatus(code: number, ix: number, iy: number, iz: number, gx0: number, gy0: number, gz0: number): number {
    const ax = (code / 6) | 0, r = code - ax * 6, ay = (r / 2) | 0, az = r - ay * 2;
    const t = ((ix + ax) * 24 + iy + ay) * 3 + iz + az;
    let st = this.tst[t];
    if (st < 0) st = this.tst[t] = this.status(gx0 + ax, gy0 + ay, gz0 + az);
    return st;
  }

  private resolve(n: number, y: number, gx0: number, gy0: number, gz0: number): number {
    let i1 = 0, i2 = -1;
    for (let i = 1; i < n; i++) {
      if (this.cd[i] < this.cd[i1]) { i2 = i1; i1 = i; }
      else if (i2 < 0 || this.cd[i] < this.cd[i2]) i2 = i;
    }
    const s1 = this.decode(this.cs[i1], gx0, gy0, gz0);
    const t1 = s1 & 3, l1 = s1 >> 2;
    const f1 = t1 !== FLUID_NONE && y < l1 ? t1 : FLUID_NONE;
    const sim = 1 - Math.abs(this.cd[i2] - this.cd[i1]) / 25;
    if (sim > 0) {
      const s2 = this.decode(this.cs[i2], gx0, gy0, gz0);
      const t2 = s2 & 3, l2 = s2 >> 2;
      const f2 = t2 !== FLUID_NONE && y < l2 ? t2 : FLUID_NONE;
      if (f1 !== f2 && sim > 0.3) return FLUID_BARRIER;
      if (f1 !== FLUID_NONE && f2 !== FLUID_NONE && l1 !== l2 && sim > 0.3) return FLUID_BARRIER;
    }
    return f1;
  }
}
