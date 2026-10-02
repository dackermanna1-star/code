/**
 * Ore veins and stone blobs (Minecraft `OreFeature` algorithm: a line of spheres with random
 * radii). Veins are decided per source chunk with a chunk-seeded RNG; each vein's shape comes from
 * its own seed and per-block randomness from a positional hash, so a vein crossing chunk borders is
 * written identically by every chunk it touches. Height distributions are Minecraft 1.18's, remapped
 * to the 0..255 world (deepslate below y = 8..16, diamonds/redstone near the bottom, coal high,
 * iron in mountains, emeralds in mountain biomes).
 */
import { Rng, seedFor } from '../../../core/rng';
import { ST as ST_, IS_AIR as IS_AIR_ } from '../common/states';
import { hashF as hashF_ } from '../common/noise';
import { BIO } from './biomeSource';

// module-local bindings (avoid namespace getters in hot loops under tsx/vitest)
const ST = ST_;
const IS_AIR = IS_AIR_;
const hashF = hashF_;

/** Vein target modes: ORE = stone-like -> ore / deepslate-like -> deepslate ore; NATURAL = any base
 * stone (blobs); CUSTOM = block ids flagged in `custom`. */
export const Target = { ORE: 0, NATURAL: 1, CUSTOM: 2 } as const;
type Target = (typeof Target)[keyof typeof Target];

export interface OreConf {
  stone: number;
  deep: number;
  size: number;
  /** attempts per chunk (fractional part = probability of one more) */
  count: number;
  /** probability that a chunk gets `count` attempts at all (rarity filter) */
  rarity?: number;
  minY: number;
  maxY: number;
  trapezoid: boolean;
  discard: number;
  target: Target;
  /** target table for Target.CUSTOM (index = block id) */
  custom?: Uint8Array;
  biomes?: Set<number>;
  salt: number;
}

const MOUNTAINS = new Set<number>([BIO.windswept_hills, BIO.windswept_forest, BIO.windswept_gravelly_hills, BIO.windswept_savanna, BIO.meadow, BIO.grove, BIO.snowy_slopes, BIO.jagged_peaks, BIO.frozen_peaks, BIO.stony_peaks, BIO.cherry_grove]);
const BADLANDS = new Set<number>([BIO.badlands, BIO.wooded_badlands, BIO.eroded_badlands]);
const WINDSWEPT = new Set<number>([BIO.windswept_hills, BIO.windswept_forest, BIO.windswept_gravelly_hills]);

let saltN = 0x0e00;
export const ore = (c: Omit<OreConf, 'salt' | 'target'> & { target?: Target }): OreConf => ({ ...c, target: c.target ?? Target.ORE, salt: saltN++ });

export const ORES: OreConf[] = [
  // stone variety blobs (placed first so ores can replace them)
  ore({ stone: ST.dirt, deep: ST.dirt, size: 33, count: 5, minY: 20, maxY: 160, trapezoid: false, discard: 0, target: Target.NATURAL }),
  ore({ stone: ST.gravel, deep: ST.gravel, size: 33, count: 8, minY: 2, maxY: 250, trapezoid: false, discard: 0, target: Target.NATURAL }),
  ore({ stone: ST.granite, deep: ST.granite, size: 64, count: 1, rarity: 1 / 6, minY: 64, maxY: 128, trapezoid: false, discard: 0, target: Target.NATURAL }),
  ore({ stone: ST.granite, deep: ST.granite, size: 64, count: 2, minY: 16, maxY: 60, trapezoid: false, discard: 0, target: Target.NATURAL }),
  ore({ stone: ST.diorite, deep: ST.diorite, size: 64, count: 1, rarity: 1 / 6, minY: 64, maxY: 128, trapezoid: false, discard: 0, target: Target.NATURAL }),
  ore({ stone: ST.diorite, deep: ST.diorite, size: 64, count: 2, minY: 16, maxY: 60, trapezoid: false, discard: 0, target: Target.NATURAL }),
  ore({ stone: ST.andesite, deep: ST.andesite, size: 64, count: 1, rarity: 1 / 6, minY: 64, maxY: 128, trapezoid: false, discard: 0, target: Target.NATURAL }),
  ore({ stone: ST.andesite, deep: ST.andesite, size: 64, count: 2, minY: 16, maxY: 60, trapezoid: false, discard: 0, target: Target.NATURAL }),
  ore({ stone: ST.tuff, deep: ST.tuff, size: 64, count: 2, minY: 0, maxY: 18, trapezoid: false, discard: 0, target: Target.NATURAL }),
  ore({ stone: ST.infestedStone, deep: ST.infestedStone, size: 9, count: 10, minY: 0, maxY: 63, trapezoid: false, discard: 0, biomes: WINDSWEPT }),
  // coal
  ore({ stone: ST.coalOre, deep: ST.dsCoalOre, size: 17, count: 20, minY: 100, maxY: 255, trapezoid: false, discard: 0 }),
  ore({ stone: ST.coalOre, deep: ST.dsCoalOre, size: 17, count: 18, minY: 20, maxY: 150, trapezoid: true, discard: 0.5 }),
  // iron
  ore({ stone: ST.ironOre, deep: ST.dsIronOre, size: 9, count: 45, minY: 90, maxY: 255, trapezoid: true, discard: 0 }),
  ore({ stone: ST.ironOre, deep: ST.dsIronOre, size: 9, count: 10, minY: 8, maxY: 60, trapezoid: true, discard: 0 }),
  ore({ stone: ST.ironOre, deep: ST.dsIronOre, size: 4, count: 10, minY: 0, maxY: 70, trapezoid: false, discard: 0 }),
  // copper
  ore({ stone: ST.copperOre, deep: ST.dsCopperOre, size: 10, count: 14, minY: 20, maxY: 110, trapezoid: true, discard: 0 }),
  // gold
  ore({ stone: ST.goldOre, deep: ST.dsGoldOre, size: 9, count: 4, minY: 0, maxY: 40, trapezoid: true, discard: 0.5 }),
  ore({ stone: ST.goldOre, deep: ST.dsGoldOre, size: 9, count: 0.5, minY: 0, maxY: 8, trapezoid: false, discard: 0.5 }),
  ore({ stone: ST.goldOre, deep: ST.dsGoldOre, size: 9, count: 40, minY: 40, maxY: 140, trapezoid: false, discard: 0, biomes: BADLANDS }),
  // redstone
  ore({ stone: ST.redstoneOre, deep: ST.dsRedstoneOre, size: 8, count: 4, minY: 0, maxY: 20, trapezoid: false, discard: 0 }),
  ore({ stone: ST.redstoneOre, deep: ST.dsRedstoneOre, size: 8, count: 6, minY: -20, maxY: 14, trapezoid: true, discard: 0 }),
  // diamond
  ore({ stone: ST.diamondOre, deep: ST.dsDiamondOre, size: 4, count: 6, minY: -40, maxY: 18, trapezoid: true, discard: 0.5 }),
  ore({ stone: ST.diamondOre, deep: ST.dsDiamondOre, size: 12, count: 1, rarity: 1 / 9, minY: -40, maxY: 18, trapezoid: true, discard: 0.7 }),
  ore({ stone: ST.diamondOre, deep: ST.dsDiamondOre, size: 8, count: 3, minY: -40, maxY: 18, trapezoid: true, discard: 1.0 }),
  // lapis
  ore({ stone: ST.lapisOre, deep: ST.dsLapisOre, size: 7, count: 2, minY: 0, maxY: 50, trapezoid: true, discard: 0 }),
  ore({ stone: ST.lapisOre, deep: ST.dsLapisOre, size: 7, count: 3, minY: 0, maxY: 64, trapezoid: false, discard: 1.0 }),
  // emerald (mountains only)
  ore({ stone: ST.emeraldOre, deep: ST.dsEmeraldOre, size: 3, count: 50, minY: 40, maxY: 255, trapezoid: true, discard: 0, biomes: MOUNTAINS }),
];

const IS_ORE_TARGET = new Uint8Array(4096);
const IS_DEEP_TARGET = new Uint8Array(4096);
const IS_NATURAL = new Uint8Array(4096);
for (const s of [ST.stone, ST.granite, ST.diorite, ST.andesite]) IS_ORE_TARGET[s >>> 4] = 1;
for (const s of [ST.deepslate, ST.tuff]) IS_DEEP_TARGET[s >>> 4] = 1;
for (const s of [ST.stone, ST.granite, ST.diorite, ST.andesite, ST.tuff, ST.deepslate]) IS_NATURAL[s >>> 4] = 1;

/** Trapezoid (triangular when plateau = 0) height sample as in Minecraft. */
function sampleHeight(r: Rng, c: OreConf): number {
  if (!c.trapezoid) return r.range(c.minY, c.maxY);
  const span = c.maxY - c.minY;
  const j = Math.floor(span / 2);
  const k = span - j;
  return c.minY + r.range(0, k) + r.range(0, j);
}

const sph = new Float64Array(64 * 4);

export class OrePlacer {
  constructor(
    readonly seed: number,
    private readonly biomeAt: (x: number, z: number) => number,
    private readonly ores: OreConf[] = ORES,
  ) {}

  /**
   * Place all veins from the 3x3 source chunks that intersect target chunk (cx, cz).
   * `maxSolidY` = highest non-air y in the target chunk (veins entirely above it are skipped).
   */
  place(cx: number, cz: number, work: Uint16Array, maxSolidY = 255): void {
    const x0 = cx * 16, z0 = cz * 16;
    for (const c of this.ores) {
      for (let sz = cz - 1; sz <= cz + 1; sz++)
        for (let sx = cx - 1; sx <= cx + 1; sx++) {
          const r = new Rng(seedFor(this.seed, sx, sz, c.salt));
          if (c.rarity !== undefined && !(r.next() < c.rarity)) continue;
          let n = Math.floor(c.count);
          if (r.next() < c.count - n) n++;
          const f1 = c.size / 8;
          const ii = Math.ceil((c.size / 16 * 2 + 1) / 2);
          const reach = Math.ceil(f1) + ii + 1;
          for (let a = 0; a < n; a++) {
            const ox = sx * 16 + r.int(16);
            const oz = sz * 16 + r.int(16);
            const oy = sampleHeight(r, c);
            const vseed = r.nextU32();
            if (oy < -4 || oy - reach > maxSolidY) continue;
            if (ox + reach < x0 || ox - reach > x0 + 15 || oz + reach < z0 || oz - reach > z0 + 15) continue;
            if (c.biomes && !c.biomes.has(this.biomeAt(ox, oz))) continue;
            this.vein(c, ox, oy, oz, vseed, x0, z0, work);
          }
        }
    }
  }

  private vein(c: OreConf, ox: number, oy: number, oz: number, vseed: number, x0: number, z0: number, work: Uint16Array): void {
    const r = new Rng(vseed);
    const size = c.size;
    const ang = r.next() * Math.PI;
    const f1 = size / 8;
    const ax = ox + Math.sin(ang) * f1, bx = ox - Math.sin(ang) * f1;
    const az = oz + Math.cos(ang) * f1, bz = oz - Math.cos(ang) * f1;
    const ay = oy + r.int(3) - 2, by = oy + r.int(3) - 2;
    for (let k = 0; k < size; k++) {
      const f = k / size;
      const rr = (r.next() * size) / 16;
      sph[k * 4] = ax + (bx - ax) * f;
      sph[k * 4 + 1] = ay + (by - ay) * f;
      sph[k * 4 + 2] = az + (bz - az) * f;
      sph[k * 4 + 3] = ((Math.sin(Math.PI * f) + 1) * rr + 1) / 2;
    }
    for (let a = 0; a < size - 1; a++) {
      if (sph[a * 4 + 3] <= 0) continue;
      for (let b = a + 1; b < size; b++) {
        if (sph[b * 4 + 3] <= 0) continue;
        const dx = sph[a * 4] - sph[b * 4], dy = sph[a * 4 + 1] - sph[b * 4 + 1], dz = sph[a * 4 + 2] - sph[b * 4 + 2], dr = sph[a * 4 + 3] - sph[b * 4 + 3];
        if (dr * dr > dx * dx + dy * dy + dz * dz) {
          if (dr > 0) sph[b * 4 + 3] = -1;
          else sph[a * 4 + 3] = -1;
        }
      }
    }
    const salt = this.seed ^ (c.salt * 0x2f1);
    for (let k = 0; k < size; k++) {
      const rad = sph[k * 4 + 3];
      if (rad < 0) continue;
      const sx = sph[k * 4], sy = sph[k * 4 + 1], sz = sph[k * 4 + 2];
      const xa = Math.max(Math.floor(sx - rad), x0), xb = Math.min(Math.floor(sx + rad), x0 + 15);
      const za = Math.max(Math.floor(sz - rad), z0), zb = Math.min(Math.floor(sz + rad), z0 + 15);
      const ya = Math.max(Math.floor(sy - rad), 1), yb = Math.min(Math.floor(sy + rad), 254);
      if (xa > xb || za > zb || ya > yb) continue;
      for (let x = xa; x <= xb; x++) {
        const dx = (x + 0.5 - sx) / rad;
        if (dx * dx >= 1) continue;
        for (let y = ya; y <= yb; y++) {
          const dy = (y + 0.5 - sy) / rad;
          if (dx * dx + dy * dy >= 1) continue;
          for (let z = za; z <= zb; z++) {
            const dz = (z + 0.5 - sz) / rad;
            if (dx * dx + dy * dy + dz * dz >= 1) continue;
            const i = (y << 8) | ((z - z0) << 4) | (x - x0);
            const s = work[i];
            const id = s >>> 4;
            let out: number;
            if (c.target === Target.NATURAL) {
              if (!IS_NATURAL[id] || s === c.stone) continue;
              out = c.stone;
            } else if (c.target === Target.CUSTOM) {
              if (!c.custom![id] || s === c.stone) continue;
              out = c.stone;
            } else if (IS_ORE_TARGET[id]) out = c.stone;
            else if (IS_DEEP_TARGET[id]) out = c.deep;
            else continue;
            if (c.discard > 0 && (c.discard >= 1 || hashF(x, y, z, salt) < c.discard) && this.exposed(work, x - x0, y, z - z0)) continue;
            work[i] = out;
          }
        }
      }
    }
  }

  private exposed(work: Uint16Array, lx: number, y: number, lz: number): boolean {
    const i = (y << 8) | (lz << 4) | lx;
    if (IS_AIR[work[i + 256] >>> 4] || IS_AIR[work[i - 256] >>> 4]) return true;
    if (lx > 0 && IS_AIR[work[i - 1] >>> 4]) return true;
    if (lx < 15 && IS_AIR[work[i + 1] >>> 4]) return true;
    if (lz > 0 && IS_AIR[work[i - 16] >>> 4]) return true;
    if (lz < 15 && IS_AIR[work[i + 16] >>> 4]) return true;
    return false;
  }
}
