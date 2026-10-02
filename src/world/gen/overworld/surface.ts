/**
 * Overworld surface rules (simplified port of Minecraft 1.18+ `SurfaceRuleData.overworld()`).
 * Applied per column after terrain + fluids: replaces the top layers of stone with grass/dirt,
 * sand/sandstone, terracotta bands, snow, gravel, mud ... depending on biome, depth below the
 * surface, water, steepness and a few 2D noises. The functions here are pure (deterministic per
 * position), so neighbouring chunks can predict each other's ground blocks exactly.
 */
import { OctaveNoise, RawNoise2, hash2F as hash2F_, hashF as hashF_ } from '../common/noise';
import { ST as ST_ } from '../common/states';
import { BIO as BIO_ } from './biomeSource';
import { Rng } from '../../../core/rng';
import { BIOMES } from '../../biomes';

// module-local bindings (avoid namespace getters in hot loops under tsx/vitest)
const ST = ST_;
const BIO = BIO_;
const hashF = hashF_;
const hash2F = hash2F_;

const SEA = 63;

// biome groups
const N_BIOMES = 256;
const mk = (ids: number[]) => {
  const t = new Uint8Array(N_BIOMES);
  for (const i of ids) t[i] = 1;
  return t;
};
export const IS_BADLANDS = mk([BIO.badlands, BIO.wooded_badlands, BIO.eroded_badlands]);
export const IS_SANDY = mk([BIO.desert, BIO.beach, BIO.snowy_beach, BIO.warm_ocean, BIO.lukewarm_ocean, BIO.deep_lukewarm_ocean]);
export const IS_OCEAN = mk(BIOMES.filter((b) => b.category === 'ocean').map((b) => b.id));
export const IS_RIVER = mk([BIO.river, BIO.frozen_river]);
export const IS_WARM_OCEAN = mk([BIO.warm_ocean, BIO.lukewarm_ocean, BIO.deep_lukewarm_ocean]);
export const IS_FROZEN_OCEAN = mk([BIO.frozen_ocean, BIO.deep_frozen_ocean]);

/** Terracotta band states for badlands (Minecraft `generateBands`). */
function generateBands(seed: number): Uint16Array {
  const rng = new Rng(seed ^ 0xba4d1a);
  const b = new Uint16Array(192).fill(ST.terracotta);
  for (let i = 0; i < 192; i++) {
    i += rng.int(5) + 1;
    if (i < 192) b[i] = ST.orangeTerracotta;
  }
  const makeBands = (base: number, st: number) => {
    const n = rng.range(6, 15);
    for (let j = 0; j < n; j++) {
      const w = base + rng.int(3);
      const s = rng.int(192);
      for (let k = 0; s + k < 192 && k < w; k++) b[s + k] = st;
    }
  };
  makeBands(1, ST.yellowTerracotta);
  makeBands(2, ST.brownTerracotta);
  makeBands(1, ST.redTerracotta);
  const whites = rng.range(9, 15);
  for (let k = 0, j = 0; j < whites && k < 192; k += rng.int(16) + 4) {
    b[k] = ST.whiteTerracotta;
    if (k - 1 > 0 && rng.chance(0.5)) b[k - 1] = ST.lightGrayTerracotta;
    if (k + 1 < 192 && rng.chance(0.5)) b[k + 1] = ST.lightGrayTerracotta;
    j++;
  }
  return b;
}

export class SurfaceRules {
  readonly surfaceN: OctaveNoise;
  private readonly bandOffset: RawNoise2;
  private readonly calciteN: RawNoise2;
  private readonly gravelN: RawNoise2;
  private readonly packedIceN: RawNoise2;
  private readonly iceN: RawNoise2;
  private readonly powderN: RawNoise2;
  private readonly swampN: RawNoise2;
  private readonly diskN: OctaveNoise;
  private readonly clayN: RawNoise2;
  private readonly pillarN: RawNoise2;
  private readonly pillarRoofN: RawNoise2;
  private readonly bergN: OctaveNoise;
  private readonly bergRoofN: RawNoise2;
  private readonly bands: Uint16Array;

  constructor(readonly seed: number) {
    this.surfaceN = new OctaveNoise(seed ^ 0x5a4f, 1 / 64, [1, 0.5, 0.25], { sigma: 0.33 });
    this.bandOffset = new RawNoise2(seed ^ 0xb0ff, 1 / 512);
    this.calciteN = new RawNoise2(seed ^ 0xca1c, 1 / 48);
    this.gravelN = new RawNoise2(seed ^ 0x9a7e, 1 / 32);
    this.packedIceN = new RawNoise2(seed ^ 0x9ace, 1 / 64);
    this.iceN = new RawNoise2(seed ^ 0x1ce1, 1 / 32);
    this.powderN = new RawNoise2(seed ^ 0x90d3, 1 / 48);
    this.swampN = new RawNoise2(seed ^ 0x5a3b, 1 / 16);
    this.diskN = new OctaveNoise(seed ^ 0xd15c, 1 / 24, [1, 0.5], { sigma: 0.35 });
    this.clayN = new RawNoise2(seed ^ 0xc1a7, 1 / 20);
    this.pillarN = new RawNoise2(seed ^ 0x9111a7, 1 / 6);
    this.pillarRoofN = new RawNoise2(seed ^ 0x9e00f, 1 / 24);
    this.bergN = new OctaveNoise(seed ^ 0xbe7, 1 / 40, [1, 0.5], { sigma: 0.35 });
    this.bergRoofN = new RawNoise2(seed ^ 0xbe8, 1 / 18);
    this.bands = generateBands(seed);
  }

  band(x: number, y: number, z: number): number {
    const off = Math.round(this.bandOffset.at(x, z) * 4);
    return this.bands[(((y + off + 192) % 192) + 192) % 192];
  }

  /** Surface depth (number of soil layers below the top block), 0..6. */
  depth(x: number, z: number, sn: number): number {
    return Math.floor(sn * 2.75 * 2.5 + 3 + hash2F(x, z, this.seed ^ 0xde47) * 0.25);
  }

  /**
   * Block for a solid position.
   * @param d stone depth above (0 = floor with air/water directly above)
   * @param waterDepth > 0 if the floor is under water (distance to the water surface), 0 if dry
   * @param below whether the block directly below is solid (for sand/gravel ceilings)
   * @returns state, or 0 to keep the base stone
   */
  rule(biome: number, x: number, y: number, z: number, d: number, surfDepth: number, sn: number, waterDepth: number, steep: boolean, belowSolid: boolean): number {
    const floor = d === 0;
    const under = floor || d <= surfDepth;
    const dry = waterDepth === 0;
    // ------------------------------------------------------------------ badlands
    if (IS_BADLANDS[biome]) {
      if (biome === BIO.wooded_badlands && floor && y >= 90 + Math.round(sn * 8)) {
        if (Math.abs(sn) < 0.022 || sn < -0.075 || sn > 0.066) return ST.coarseDirt;
        return dry ? ST.grass : ST.dirt;
      }
      if (floor) {
        if (y >= 74 + Math.round(sn * 6)) {
          if ((sn > -0.11 && sn < -0.066) || Math.abs(sn) < 0.022) return ST.terracotta;
          return this.band(x, y, z);
        }
        if (dry || waterDepth <= 1) return belowSolid ? ST.redSand : ST.redSandstone;
        return ST.orangeTerracotta;
      }
      if (y >= SEA - 1) return this.band(x, y, z);
      if (under && waterDepth > 0) return ST.whiteTerracotta;
      return 0;
    }
    if (!under && !(IS_SANDY[biome] && d <= surfDepth + 4)) return 0;
    // ------------------------------------------------------------------ deep water floors
    if (waterDepth > 6) {
      if (IS_WARM_OCEAN[biome] || IS_SANDY[biome]) return floor || belowSolid ? ST.sand : ST.sandstone;
      if (IS_RIVER[biome]) return this.riverBed(x, z, floor, belowSolid);
      if (floor) {
        const dn = this.diskN.noise2(x, z);
        if (dn > 0.45) return ST.sand;
        if (dn < -0.55 && this.clayN.at(x, z) > 0.3) return ST.clay;
      }
      return belowSolid ? ST.gravel : ST.stone;
    }
    // ------------------------------------------------------------------ sandy biomes
    if (IS_SANDY[biome]) {
      if (biome === BIO.snowy_beach && floor && dry && y >= SEA) return belowSolid ? ST.sand : ST.sandstone;
      if (d <= surfDepth) return belowSolid ? ST.sand : ST.sandstone;
      return ST.sandstone;
    }
    // ------------------------------------------------------------------ shallow water / rivers
    if (!dry) {
      if (IS_RIVER[biome] || IS_OCEAN[biome] || biome === BIO.stony_shore) return this.riverBed(x, z, floor, belowSolid);
      if (biome === BIO.swamp) return floor ? ST.mud : ST.dirt;
      if (floor) {
        const dn = this.diskN.noise2(x, z);
        if (dn > 0.5) return ST.sand;
        if (dn < -0.55) return ST.gravel;
      }
      if (biome === BIO.mushroom_fields) return ST.dirt;
      if (biome === BIO.frozen_peaks || biome === BIO.jagged_peaks || biome === BIO.stony_peaks) return 0;
      return ST.dirt;
    }
    // ------------------------------------------------------------------ dry land
    switch (biome) {
      case BIO.frozen_peaks:
        if (floor) {
          if (steep) return ST.packedIce;
          const pi = this.packedIceN.at(x, z);
          if (pi > -0.5 && pi < 0.2) return ST.packedIce;
          const ic = this.iceN.at(x, z);
          if (ic > -0.0625 && ic < 0.025) return ST.ice;
          return ST.snowBlock;
        }
        if (steep) return ST.packedIce;
        return d <= 1 ? ST.snowBlock : 0;
      case BIO.snowy_slopes:
        if (steep) return 0;
        if (floor) {
          const p = this.powderN.at(x, z);
          if (p > 0.35 && p < 0.6 && ST.powderSnow) return ST.powderSnow;
          return ST.snowBlock;
        }
        return d <= 1 ? ST.snowBlock : ST.dirt;
      case BIO.jagged_peaks:
        if (steep) return 0;
        return floor || d <= 1 ? ST.snowBlock : 0;
      case BIO.grove:
        if (floor) {
          const p = this.powderN.at(x, z);
          if (p > 0.35 && p < 0.6 && ST.powderSnow) return ST.powderSnow;
          return ST.snowBlock;
        }
        return ST.dirt;
      case BIO.stony_peaks: {
        const c = this.calciteN.at(x, z);
        return c > -0.03 && c < 0.03 + (y - 120) * 0.0004 ? ST.calcite : 0;
      }
      case BIO.stony_shore: {
        const g = this.gravelN.at(x, z);
        if (g > -0.12 && g < 0.12) return belowSolid ? ST.gravel : ST.stone;
        return 0;
      }
      case BIO.windswept_hills:
        if (sn > 0.121) return 0;
        break;
      case BIO.windswept_gravelly_hills:
        if (sn > 0.242) return belowSolid ? ST.gravel : ST.stone;
        if (sn > 0.121) return 0;
        if (sn > -0.121) break;
        return belowSolid ? ST.gravel : ST.stone;
      case BIO.windswept_savanna:
        if (sn > 0.212) return 0;
        if (sn > -0.06 && floor) return ST.coarseDirt;
        break;
      case BIO.old_growth_pine_taiga:
      case BIO.old_growth_spruce_taiga:
        if (floor) {
          if (sn > 0.212) return ST.coarseDirt;
          if (sn > -0.115) return ST.podzol;
        }
        break;
      case BIO.ice_spikes:
        if (floor) return ST.snowBlock;
        break;
      case BIO.mushroom_fields:
        return floor ? ST.mycelium : ST.dirt;
      case BIO.swamp:
        if (floor && y === SEA - 1 && this.swampN.at(x, z) > 0) return ST.water;
        break;
      case BIO.desert:
        return ST.sand;
    }
    // generic mountains: bare stone on very steep slopes above the tree line
    if (steep && y > 125 && (biome === BIO.windswept_hills || biome === BIO.windswept_forest || biome === BIO.meadow)) return 0;
    return floor ? ST.grass : ST.dirt;
  }

  private riverBed(x: number, z: number, floor: boolean, belowSolid: boolean): number {
    const dn = this.diskN.noise2(x, z);
    if (dn > 0.25) return belowSolid ? ST.sand : ST.sandstone;
    if (dn < -0.45) return belowSolid ? ST.gravel : ST.stone;
    if (floor && this.clayN.at(x, z) > 0.55) return ST.clay;
    return ST.dirt;
  }

  /** Eroded-badlands hoodoo height above the surface (0 if none). Pure. */
  hoodooHeight(x: number, z: number, surfY: number): number {
    const p = Math.abs(this.pillarN.at(x, z)) * 8.25;
    const pa = Math.min(p * p * 2.5, Math.ceil(this.pillarRoofN.at(x, z) * 50 + 24));
    if (pa <= 0) return 0;
    const top = 64 + Math.floor(pa);
    return top > surfY ? top - surfY : 0;
  }

  /** Iceberg extension for frozen oceans: returns [bottomY, topY] of ice above sea floor, or null. */
  iceberg(x: number, z: number): number {
    const n = Math.max(0, this.bergN.noise2(x, z) * 1.6 - 0.62);
    if (n <= 0) return 0;
    const roof = Math.abs(this.bergRoofN.at(x, z)) * 1.6;
    const h = Math.floor(Math.min(n * n * 120, Math.ceil(roof * 40) + 14));
    return h;
  }

  /** Deterministic per-block hash in [0,1). */
  rand(x: number, y: number, z: number, salt: number): number {
    return hashF(x, y, z, this.seed ^ salt);
  }
}
