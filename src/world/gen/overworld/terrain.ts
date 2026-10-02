/**
 * Overworld terrain sampler: climate (multi-noise), biomes, and the 3D density function.
 *
 * Like Minecraft 1.18+, the density is evaluated on a coarse grid of "cell corners" — every 4 blocks
 * horizontally (one "quart" column) and every 8 blocks vertically (33 levels for y = 0..256) — and
 * trilinearly interpolated per block. Climate, terrain-shape splines and biomes are evaluated once
 * per quart column. Everything is a pure function of (seed, position) and cached per quart column,
 * so any column's surface can be queried exactly (e.g. for trees in neighbouring chunks) and the
 * results never depend on generation order.
 *
 * Density pipeline per corner (y in blocks):
 *   depth  = compress(offset + jaggedness * halfNegative(jaggedNoise)) + (63.52 - y) / 128
 *   sloped = 4 * quarterNegative(depth * factor) + base3dNoise
 *   D = sloped <= 0          -> sloped                     (open air, no caves)
 *       sloped < 1.5625      -> min(sloped, 5 * entrances)  (near the surface: only cave entrances)
 *       otherwise            -> min(cheese, entrances, spaghetti2d)   (deep caves)
 *   + top/bottom slides; noodle caves are carried in separate interpolated channels.
 */
import { OctaveNoise, RawNoise3, RawNoise2, clamp as clamp_, clampedMap as clampedMap_, hash3i as hash3i_ } from '../common/noise';
import { terrainOffset, terrainFactor, terrainJaggedness, peaksAndValleys } from './terrainShaper';
import { pickOverworldBiome } from './biomeSource';

// module-local bindings (avoid namespace getters in hot loops under tsx/vitest)
const clamp = clamp_;
const clampedMap = clampedMap_;
const hash3i = hash3i_;

export const LEVELS = 33;
export const CELL_H = 8;
export const SEA_Y = 63; // water fills y <= 62

const TOP_SLIDE_START = 228;
const TOP_SLIDE_END = 252;
const BOTTOM_SLIDE_END = 6;
const NOODLE_MIN_Y = 8;
const NOODLE_MAX_Y = 120;
const FORCED = -1;

/** Compresses tall terrain so peaks stay below the 256 world ceiling. */
export function compressOffset(v: number): number {
  return v <= 0.45 ? v : 0.45 + (v - 0.45) * 0.58;
}

/** Bilinear interpolation shared by every code path (bit-identical results). */
export function bilerp(c00: number, c10: number, c01: number, c11: number, fx: number, fz: number): number {
  const a = c00 + fx * (c10 - c00);
  const b = c01 + fx * (c11 - c01);
  return a + fz * (b - a);
}

export class QuartColumn {
  // climate
  C = 0;
  E = 0;
  W = 0;
  PV = 0;
  T = 0;
  H = 0;
  // terrain shape
  offset = 0;
  factor = 1;
  jag = 0;
  base = 0;
  /** Preliminary surface y (no jaggedness / 3D noise). */
  prelim = 64;
  /** Highest computed level; levels above are forced to air. */
  kTop = 0;
  biome = 0;
  // 2D cave parameters
  rar3d = 1;
  rar2d = 1;
  elev = 0;
  thick2d = -1;
  // density channels per level
  readonly d = new Float64Array(LEVELS);
  readonly tog = new Float64Array(LEVELS);
  readonly nth = new Float64Array(LEVELS);
  readonly na = new Float64Array(LEVELS);
  readonly nb = new Float64Array(LEVELS);
  readonly done = new Uint8Array(LEVELS);
  constructor(readonly qx: number, readonly qz: number) {}
}

const qkey = (qx: number, qz: number) => (qx + 0x80000) * 0x100000 + (qz + 0x80000);

function rarity3d(v: number): number {
  return v < -0.5 ? 0.75 : v < 0 ? 1.0 : v < 0.5 ? 1.5 : 2.0;
}
function rarity2d(v: number): number {
  return v < -0.75 ? 0.5 : v < -0.5 ? 0.75 : v < 0.5 ? 1.0 : v < 0.75 ? 2.0 : 3.0;
}

export class OverworldTerrain {
  // climate noises
  private readonly shiftA: OctaveNoise;
  private readonly shiftB: OctaveNoise;
  private readonly contN: OctaveNoise;
  private readonly eroN: OctaveNoise;
  private readonly ridgeN: OctaveNoise;
  private readonly tempN: OctaveNoise;
  private readonly humN: OctaveNoise;
  private readonly jaggedN: OctaveNoise;
  // density noises
  private readonly base3d: OctaveNoise;
  private readonly caveLayer: RawNoise3;
  private readonly caveCheese: OctaveNoise;
  private readonly spag3dRarity: RawNoise2;
  private readonly spag3d1: RawNoise3;
  private readonly spag3d2: RawNoise3;
  private readonly spag3dThick: RawNoise3;
  private readonly caveEntrance: OctaveNoise;
  private readonly spag2dMod: RawNoise2;
  private readonly spag2d: RawNoise3;
  private readonly spag2dElev: RawNoise2;
  private readonly spag2dThick: RawNoise2;
  private readonly noodleToggle: RawNoise3;
  private readonly noodleThick: RawNoise3;
  private readonly noodleA: RawNoise3;
  private readonly noodleB: RawNoise3;

  private readonly cache = new Map<number, QuartColumn>();
  private readonly params = new Float64Array(4);
  private readonly noiseMax: number;
  /** Continentalness bias (more land near spawn is nicer; Minecraft has none). */
  static C_BIAS = 0.0;

  constructor(readonly seed: number) {
    const s = (k: number) => (seed * 31 + k * 0x9e3779b1) | 0;
    this.shiftA = new OctaveNoise(s(1), 1 / 32, [1, 0.5, 0.25], { sigma: 0.35 });
    this.shiftB = new OctaveNoise(s(2), 1 / 32, [1, 0.5, 0.25], { sigma: 0.35 });
    this.contN = new OctaveNoise(s(3), 1 / 2048, [1, 0.5, 0.5, 0.25, 0.125, 0.031, 0.0156], { sigma: 0.37 });
    this.eroN = new OctaveNoise(s(4), 1 / 2048, [1, 0.5, 0, 0.125, 0.0625], { sigma: 0.4 });
    this.ridgeN = new OctaveNoise(s(5), 1 / 512, [1, 1, 0.25], { sigma: 0.42 });
    this.tempN = new OctaveNoise(s(6), 1 / 4096, [1.5, 0, 0.25], { sigma: 0.42 });
    this.humN = new OctaveNoise(s(7), 1 / 1024, [1, 0.5], { sigma: 0.42 });
    this.jaggedN = new OctaveNoise(s(8), 1 / 40, [1, 0.5, 0.25, 0.125, 0.0625], { sigma: 0.42 });

    this.base3d = new OctaveNoise(s(20), 1 / 170, [1, 0.5, 0.25], { sigma: 0.13, yScale: 1.6 });
    this.caveLayer = new RawNoise3(s(21), 1 / 256, 1 / 26);
    this.caveCheese = new OctaveNoise(s(22), 1 / 256, [0.5, 0.5, 0.5, 0.125], { sigma: 0.32, yScale: 1.25 });
    this.spag3dRarity = new RawNoise2(s(23), 1 / 1024);
    this.spag3d1 = new RawNoise3(s(24), 1 / 128, 1 / 112);
    this.spag3d2 = new RawNoise3(s(25), 1 / 128, 1 / 112);
    this.spag3dThick = new RawNoise3(s(26), 1 / 256, 1 / 256);
    this.caveEntrance = new OctaveNoise(s(27), 1 / 171, [0.4, 0.25, 0.25], { sigma: 0.2, yScale: 0.67 });
    this.spag2dMod = new RawNoise2(s(28), 1 / 1024);
    this.spag2d = new RawNoise3(s(29), 1 / 128, 1 / 128);
    this.spag2dElev = new RawNoise2(s(30), 1 / 256);
    this.spag2dThick = new RawNoise2(s(31), 1 / 1024);
    this.noodleToggle = new RawNoise3(s(32), 1 / 256, 1 / 256);
    this.noodleThick = new RawNoise3(s(33), 1 / 256, 1 / 256);
    this.noodleA = new RawNoise3(s(34), 1 / 48, 1 / 48);
    this.noodleB = new RawNoise3(s(35), 1 / 48, 1 / 48);
    this.noiseMax = this.base3d.max3;
  }

  // ------------------------------------------------------------------------------------------
  // climate & quart columns
  // ------------------------------------------------------------------------------------------

  /** Raw climate at a block position (used by quart columns and debugging tools). */
  climateAt(bx: number, bz: number, out: QuartColumn): void {
    const sx = this.shiftA.noise2(bx, bz) * 16;
    const sz = this.shiftB.noise2(bz, bx) * 16;
    const px = bx + sx, pz = bz + sz;
    // cubic tail stretch: simplex sums are more bounded than Minecraft's noise; this lets the
    // rare extremes (mushroom islands at C < -1.05) exist at a Minecraft-like rarity
    const c = this.contN.noise2(px, pz);
    out.C = c + 0.3 * c * c * c + OverworldTerrain.C_BIAS;
    out.E = this.eroN.noise2(px, pz);
    out.W = this.ridgeN.noise2(px, pz);
    out.T = this.tempN.noise2(px, pz);
    out.H = this.humN.noise2(px, pz);
    out.PV = peaksAndValleys(out.W);
  }

  quart(qx: number, qz: number): QuartColumn {
    const k = qkey(qx, qz);
    let c = this.cache.get(k);
    if (c) return c;
    if (this.cache.size > 60000) this.cache.clear();
    c = new QuartColumn(qx, qz);
    const bx = qx * 4, bz = qz * 4;
    this.climateAt(bx, bz, c);
    const p = this.params;
    p[0] = c.C; p[1] = c.E; p[2] = c.W; p[3] = c.PV;
    c.offset = terrainOffset(p);
    c.factor = terrainFactor(p);
    c.jag = terrainJaggedness(p);
    let jn = this.jaggedN.noise2(bx * 1.5, bz * 1.5);
    jn = jn > 0 ? jn : jn * 0.5;
    c.base = compressOffset(c.offset + c.jag * jn);
    c.prelim = 63.52 + 128 * compressOffset(c.offset);
    c.biome = pickOverworldBiome(c.T, c.H, c.C, c.E, c.W);
    // highest level that can be solid: depth*factor + noise > 0  =>  y < 63.52 + 128*(maxBase + noiseMax/factor)
    const maxBase = compressOffset(c.offset + Math.max(0, c.jag) * 1.0);
    const yBound = 63.52 + 128 * (maxBase + this.noiseMax / Math.max(0.3, c.factor));
    c.kTop = Math.max(1, Math.min(LEVELS - 1, Math.ceil(yBound / CELL_H)));
    for (let i = c.kTop + 1; i < LEVELS; i++) {
      c.d[i] = FORCED;
      c.tog[i] = FORCED;
      c.done[i] = 1;
    }
    // 2D cave parameters
    c.rar3d = rarity3d(this.spag3dRarity.at(bx, bz));
    c.rar2d = rarity2d(this.spag2dMod.at(bx, bz));
    c.elev = this.spag2dElev.at(bx, bz) * 3.5;
    c.thick2d = -0.95 - 0.35 * this.spag2dThick.at(bx, bz);
    this.cache.set(k, c);
    return c;
  }

  /** Per-block biome (Minecraft-style fuzzy "voronoi zoom" over quart samples). */
  biomeAt(x: number, z: number): number {
    const i = x - 2, k = z - 2;
    const qx = i >> 2, qz = k >> 2;
    const fx = (i & 3) * 0.25, fz = (k & 3) * 0.25;
    let best = 1e9, bdx = 0, bdz = 0;
    for (let c = 0; c < 4; c++) {
      const dx = c & 1, dz = c >> 1;
      const h = hash3i(qx + dx, 0x1b873593, qz + dz, this.seed);
      const jx = ((h & 1023) / 1024 - 0.5) * 0.9;
      const jz = (((h >>> 10) & 1023) / 1024 - 0.5) * 0.9;
      const ddx = fx - dx + jx, ddz = fz - dz + jz;
      const d = ddx * ddx + ddz * ddz;
      if (d < best) { best = d; bdx = dx; bdz = dz; }
    }
    return this.quart(qx + bdx, qz + bdz).biome;
  }

  // ------------------------------------------------------------------------------------------
  // density
  // ------------------------------------------------------------------------------------------

  private entrances(x: number, y: number, z: number, c: QuartColumn): number {
    const r = c.rar3d;
    const inv = 1 / r;
    const s1 = r * Math.abs(this.spag3d1.atScaled(x, y, z, inv));
    const s2 = r * Math.abs(this.spag3d2.atScaled(x, y, z, inv));
    const thick = -0.085 - 0.0115 * this.spag3dThick.at(x, y, z);
    const spag = clamp(Math.max(s1, s2) + thick, -1, 1);
    const ent = this.caveEntrance.noise3(x, y, z) + 0.37 + clampedMap(y, 12, 40, 0.3, 0);
    return Math.min(ent, spag);
  }

  private spaghetti2d(x: number, y: number, z: number, c: QuartColumn): number {
    const r = c.rar2d;
    const s = r * Math.abs(this.spag2d.atScaled(x, y, z, 1 / r));
    const tm = c.thick2d;
    const et = Math.abs((30 - y) / 8 + c.elev);
    const a0 = et + tm;
    const a = a0 * a0 * a0;
    const b = s + 0.083 * tm;
    return clamp(Math.max(a, b), -1, 1);
  }

  private computeLevel(c: QuartColumn, k: number): void {
    const y = k * CELL_H;
    const x = c.qx * 4, z = c.qz * 4;
    const depth = c.base + (63.52 - y) * (1 / 128);
    let v = depth * c.factor;
    if (v < 0) v *= 0.25;
    const sloped = 4 * v + this.base3d.noise3(x, y, z);
    let D: number;
    if (sloped <= 0) {
      D = sloped;
    } else if (sloped < 1.5625) {
      D = Math.min(sloped, 5 * this.entrances(x, y, z, c));
    } else {
      const layer = 0.45 * this.caveLayer.at(x, y, z);
      const cheese = 4 * layer * layer + clamp(0.2 + this.caveCheese.noise3(x, y, z), -1, 1) + clamp(1.5 - 0.64 * sloped, 0, 0.5);
      D = Math.min(cheese, this.entrances(x, y, z, c), this.spaghetti2d(x, y, z, c));
    }
    if (y > TOP_SLIDE_START) {
      const f = clamp((TOP_SLIDE_END - y) / (TOP_SLIDE_END - TOP_SLIDE_START), 0, 1);
      D = -0.078125 + f * (D + 0.078125);
    }
    if (y < BOTTOM_SLIDE_END) {
      const f = clamp(y / BOTTOM_SLIDE_END, 0, 1);
      D = 0.1171875 + f * (D - 0.1171875);
    }
    c.d[k] = D;
    if (y >= NOODLE_MIN_Y && y <= NOODLE_MAX_Y) {
      c.tog[k] = this.noodleToggle.at(x, y, z);
      c.nth[k] = -0.075 - 0.025 * this.noodleThick.at(x, y, z);
      c.na[k] = this.noodleA.at(x, y, z);
      c.nb[k] = this.noodleB.at(x, y, z);
    } else {
      c.tog[k] = FORCED;
    }
    c.done[k] = 1;
  }

  /** Ensure levels [k0, k1] are computed for a quart column. */
  ensure(c: QuartColumn, k0: number, k1: number): void {
    for (let k = k0; k <= k1; k++) if (c.done[k] === 0) this.computeLevel(c, k);
  }

  /** Ensure all levels of a column. */
  ensureAll(c: QuartColumn): void {
    this.ensure(c, 0, c.kTop);
  }

  /**
   * Per-block solidity from interpolated channels (shared by chunk fill & column queries).
   * `t` in [0,1) is the position inside the cell; a/b are the bottom/top level values.
   */
  static solidAt(t: number, d0: number, d1: number, t0: number, t1: number, h0: number, h1: number, a0: number, a1: number, b0: number, b1: number): boolean {
    const d = d0 + t * (d1 - d0);
    if (d <= 0) return false;
    const tog = t0 + t * (t1 - t0);
    if (tog < 0) return true;
    const th = h0 + t * (h1 - h0);
    const na = Math.abs(a0 + t * (a1 - a0));
    const nb = Math.abs(b0 + t * (b1 - b0));
    return th + 1.5 * (na > nb ? na : nb) > 0;
  }

  /**
   * Exact y of the highest density-solid block in a column (terrain + caves, no features), or -1.
   * Matches the chunk fill bit-for-bit.
   */
  topSolid(x: number, z: number): number {
    const qx = x >> 2, qz = z >> 2;
    const fx = (x & 3) * 0.25, fz = (z & 3) * 0.25;
    const c00 = this.quart(qx, qz), c10 = this.quart(qx + 1, qz), c01 = this.quart(qx, qz + 1), c11 = this.quart(qx + 1, qz + 1);
    const kMax = Math.max(c00.kTop, c10.kTop, c01.kTop, c11.kTop);
    for (let k = kMax - 1; k >= 0; k--) {
      this.ensure(c00, k, k + 1); this.ensure(c10, k, k + 1); this.ensure(c01, k, k + 1); this.ensure(c11, k, k + 1);
      const d0 = bilerp(c00.d[k], c10.d[k], c01.d[k], c11.d[k], fx, fz);
      const d1 = bilerp(c00.d[k + 1], c10.d[k + 1], c01.d[k + 1], c11.d[k + 1], fx, fz);
      if (d0 <= 0 && d1 <= 0) continue;
      const t0 = bilerp(c00.tog[k], c10.tog[k], c01.tog[k], c11.tog[k], fx, fz);
      const t1 = bilerp(c00.tog[k + 1], c10.tog[k + 1], c01.tog[k + 1], c11.tog[k + 1], fx, fz);
      let h0 = 0, h1 = 0, a0 = 0, a1 = 0, b0 = 0, b1 = 0;
      if (t0 >= 0 || t1 >= 0) {
        h0 = bilerp(c00.nth[k], c10.nth[k], c01.nth[k], c11.nth[k], fx, fz);
        h1 = bilerp(c00.nth[k + 1], c10.nth[k + 1], c01.nth[k + 1], c11.nth[k + 1], fx, fz);
        a0 = bilerp(c00.na[k], c10.na[k], c01.na[k], c11.na[k], fx, fz);
        a1 = bilerp(c00.na[k + 1], c10.na[k + 1], c01.na[k + 1], c11.na[k + 1], fx, fz);
        b0 = bilerp(c00.nb[k], c10.nb[k], c01.nb[k], c11.nb[k], fx, fz);
        b1 = bilerp(c00.nb[k + 1], c10.nb[k + 1], c01.nb[k + 1], c11.nb[k + 1], fx, fz);
      }
      for (let j = 7; j >= 0; j--) {
        if (OverworldTerrain.solidAt(j * 0.125, d0, d1, t0, t1, h0, h1, a0, a1, b0, b1)) return k * CELL_H + j;
      }
    }
    return -1;
  }

  /**
   * Fill a chunk's terrain (stone = 1 marker, air = 0) into `solid` (Uint8Array(65536), index
   * y<<8|z<<4|x) and record the top solid y per column. Returns nothing; pure function of input.
   */
  fillChunk(cx: number, cz: number, solid: Uint8Array, top: Int16Array): void {
    const q0x = cx * 4, q0z = cz * 4;
    const cols: QuartColumn[] = [];
    for (let j = 0; j <= 4; j++)
      for (let i = 0; i <= 4; i++) {
        const c = this.quart(q0x + i, q0z + j);
        this.ensureAll(c);
        cols.push(c);
      }
    const vD = new Float64Array(LEVELS), vT = new Float64Array(LEVELS), vH = new Float64Array(LEVELS), vA = new Float64Array(LEVELS), vB = new Float64Array(LEVELS);
    for (let z = 0; z < 16; z++) {
      const qz = z >> 2, fz = (z & 3) * 0.25;
      for (let x = 0; x < 16; x++) {
        const qx = x >> 2, fx = (x & 3) * 0.25;
        const c00 = cols[qz * 5 + qx], c10 = cols[qz * 5 + qx + 1], c01 = cols[(qz + 1) * 5 + qx], c11 = cols[(qz + 1) * 5 + qx + 1];
        const kMax = Math.max(c00.kTop, c10.kTop, c01.kTop, c11.kTop);
        for (let k = 0; k <= kMax; k++) {
          vD[k] = bilerp(c00.d[k], c10.d[k], c01.d[k], c11.d[k], fx, fz);
          vT[k] = bilerp(c00.tog[k], c10.tog[k], c01.tog[k], c11.tog[k], fx, fz);
        }
        let topY = -1;
        const colIdx = (z << 4) | x;
        for (let k = kMax - 1; k >= 0; k--) {
          const d0 = vD[k], d1 = vD[k + 1];
          if (d0 <= 0 && d1 <= 0) continue;
          const t0 = vT[k], t1 = vT[k + 1];
          const base = (k * CELL_H) << 8 | colIdx;
          if (d0 > 0 && d1 > 0 && t0 < 0 && t1 < 0) {
            for (let j = 0; j < 8; j++) solid[base + (j << 8)] = 1;
            if (topY < 0) topY = k * CELL_H + 7;
            continue;
          }
          let h0 = 0, h1 = 0, a0 = 0, a1 = 0, b0 = 0, b1 = 0;
          if (t0 >= 0 || t1 >= 0) {
            h0 = bilerp(c00.nth[k], c10.nth[k], c01.nth[k], c11.nth[k], fx, fz);
            h1 = bilerp(c00.nth[k + 1], c10.nth[k + 1], c01.nth[k + 1], c11.nth[k + 1], fx, fz);
            a0 = bilerp(c00.na[k], c10.na[k], c01.na[k], c11.na[k], fx, fz);
            a1 = bilerp(c00.na[k + 1], c10.na[k + 1], c01.na[k + 1], c11.na[k + 1], fx, fz);
            b0 = bilerp(c00.nb[k], c10.nb[k], c01.nb[k], c11.nb[k], fx, fz);
            b1 = bilerp(c00.nb[k + 1], c10.nb[k + 1], c01.nb[k + 1], c11.nb[k + 1], fx, fz);
          }
          for (let j = 7; j >= 0; j--) {
            if (OverworldTerrain.solidAt(j * 0.125, d0, d1, t0, t1, h0, h1, a0, a1, b0, b1)) {
              solid[base + (j << 8)] = 1;
              if (topY < 0) topY = k * CELL_H + j;
            }
          }
        }
        top[colIdx] = topY;
      }
    }
  }
}
