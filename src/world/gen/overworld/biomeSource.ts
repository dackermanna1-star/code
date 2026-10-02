/**
 * Overworld multi-noise biome selection — a direct decision-tree port of Minecraft 1.18+
 * `OverworldBiomeBuilder` (surface biomes). Inputs are the climate parameters
 * temperature (T), humidity (H), continentalness (C), erosion (E) and weirdness (W).
 */
import { biomeId } from '../../biomes';

const id = (name: string) => biomeId(name);

export const BIO = {
  mushroom_fields: id('mushroom_fields'),
  deep_frozen_ocean: id('deep_frozen_ocean'),
  deep_cold_ocean: id('deep_cold_ocean'),
  deep_ocean: id('deep_ocean'),
  deep_lukewarm_ocean: id('deep_lukewarm_ocean'),
  warm_ocean: id('warm_ocean'),
  frozen_ocean: id('frozen_ocean'),
  cold_ocean: id('cold_ocean'),
  ocean: id('ocean'),
  lukewarm_ocean: id('lukewarm_ocean'),
  snowy_plains: id('snowy_plains'),
  plains: id('plains'),
  forest: id('forest'),
  taiga: id('taiga'),
  old_growth_spruce_taiga: id('old_growth_spruce_taiga'),
  flower_forest: id('flower_forest'),
  birch_forest: id('birch_forest'),
  dark_forest: id('dark_forest'),
  savanna: id('savanna'),
  jungle: id('jungle'),
  desert: id('desert'),
  ice_spikes: id('ice_spikes'),
  snowy_taiga: id('snowy_taiga'),
  old_growth_pine_taiga: id('old_growth_pine_taiga'),
  sunflower_plains: id('sunflower_plains'),
  old_growth_birch_forest: id('old_growth_birch_forest'),
  sparse_jungle: id('sparse_jungle'),
  bamboo_jungle: id('bamboo_jungle'),
  meadow: id('meadow'),
  savanna_plateau: id('savanna_plateau'),
  badlands: id('badlands'),
  wooded_badlands: id('wooded_badlands'),
  eroded_badlands: id('eroded_badlands'),
  cherry_grove: id('cherry_grove'),
  windswept_gravelly_hills: id('windswept_gravelly_hills'),
  windswept_hills: id('windswept_hills'),
  windswept_forest: id('windswept_forest'),
  windswept_savanna: id('windswept_savanna'),
  stony_shore: id('stony_shore'),
  swamp: id('swamp'),
  beach: id('beach'),
  snowy_beach: id('snowy_beach'),
  river: id('river'),
  frozen_river: id('frozen_river'),
  jagged_peaks: id('jagged_peaks'),
  frozen_peaks: id('frozen_peaks'),
  stony_peaks: id('stony_peaks'),
  snowy_slopes: id('snowy_slopes'),
  grove: id('grove'),
} as const;

const NONE = -1;

const OCEANS = [
  [BIO.deep_frozen_ocean, BIO.deep_cold_ocean, BIO.deep_ocean, BIO.deep_lukewarm_ocean, BIO.warm_ocean],
  [BIO.frozen_ocean, BIO.cold_ocean, BIO.ocean, BIO.lukewarm_ocean, BIO.warm_ocean],
];
const MIDDLE = [
  [BIO.snowy_plains, BIO.snowy_plains, BIO.snowy_plains, BIO.snowy_taiga, BIO.taiga],
  [BIO.plains, BIO.plains, BIO.forest, BIO.taiga, BIO.old_growth_spruce_taiga],
  [BIO.flower_forest, BIO.plains, BIO.forest, BIO.birch_forest, BIO.dark_forest],
  [BIO.savanna, BIO.savanna, BIO.forest, BIO.jungle, BIO.jungle],
  [BIO.desert, BIO.desert, BIO.desert, BIO.desert, BIO.desert],
];
const MIDDLE_VARIANT = [
  [BIO.ice_spikes, NONE, BIO.snowy_taiga, NONE, NONE],
  [NONE, NONE, NONE, NONE, BIO.old_growth_pine_taiga],
  [BIO.sunflower_plains, NONE, NONE, BIO.old_growth_birch_forest, NONE],
  [NONE, NONE, BIO.plains, BIO.sparse_jungle, BIO.bamboo_jungle],
  [NONE, NONE, NONE, NONE, NONE],
];
const PLATEAU = [
  [BIO.snowy_plains, BIO.snowy_plains, BIO.snowy_plains, BIO.snowy_taiga, BIO.snowy_taiga],
  [BIO.meadow, BIO.meadow, BIO.forest, BIO.taiga, BIO.old_growth_spruce_taiga],
  [BIO.meadow, BIO.meadow, BIO.meadow, BIO.meadow, BIO.dark_forest],
  [BIO.savanna_plateau, BIO.savanna_plateau, BIO.forest, BIO.forest, BIO.jungle],
  [BIO.badlands, BIO.badlands, BIO.badlands, BIO.wooded_badlands, BIO.wooded_badlands],
];
const PLATEAU_VARIANT = [
  [BIO.ice_spikes, NONE, NONE, NONE, NONE],
  [BIO.cherry_grove, NONE, BIO.meadow, BIO.meadow, BIO.old_growth_pine_taiga],
  [BIO.cherry_grove, BIO.cherry_grove, BIO.forest, BIO.birch_forest, NONE],
  [NONE, NONE, NONE, NONE, NONE],
  [BIO.eroded_badlands, BIO.eroded_badlands, NONE, NONE, NONE],
];
const SHATTERED = [
  [BIO.windswept_gravelly_hills, BIO.windswept_gravelly_hills, BIO.windswept_hills, BIO.windswept_forest, BIO.windswept_forest],
  [BIO.windswept_gravelly_hills, BIO.windswept_gravelly_hills, BIO.windswept_hills, BIO.windswept_forest, BIO.windswept_forest],
  [BIO.windswept_hills, BIO.windswept_hills, BIO.windswept_hills, BIO.windswept_forest, BIO.windswept_forest],
  [NONE, NONE, NONE, NONE, NONE],
  [NONE, NONE, NONE, NONE, NONE],
];

export const tempIndex = (T: number) => (T < -0.45 ? 0 : T < -0.15 ? 1 : T < 0.2 ? 2 : T < 0.55 ? 3 : 4);
export const humIndex = (H: number) => (H < -0.35 ? 0 : H < -0.1 ? 1 : H < 0.1 ? 2 : H < 0.3 ? 3 : 4);
export const erosionIndex = (E: number) => (E < -0.78 ? 0 : E < -0.375 ? 1 : E < -0.2225 ? 2 : E < 0.05 ? 3 : E < 0.45 ? 4 : E < 0.55 ? 5 : 6);

function middle(i: number, j: number, neg: boolean): number {
  if (neg) return MIDDLE[i][j];
  const v = MIDDLE_VARIANT[i][j];
  return v === NONE ? MIDDLE[i][j] : v;
}
function badlands(j: number, neg: boolean): number {
  if (j < 2) return neg ? BIO.badlands : BIO.eroded_badlands;
  return j < 3 ? BIO.badlands : BIO.wooded_badlands;
}
const middleOrBadlandsIfHot = (i: number, j: number, neg: boolean) => (i === 4 ? badlands(j, neg) : middle(i, j, neg));
function plateau(i: number, j: number, neg: boolean): number {
  if (!neg) {
    const v = PLATEAU_VARIANT[i][j];
    if (v !== NONE) return v;
  }
  return PLATEAU[i][j];
}
function peak(i: number, j: number, neg: boolean): number {
  if (i <= 2) return neg ? BIO.jagged_peaks : BIO.frozen_peaks;
  return i === 3 ? BIO.stony_peaks : badlands(j, neg);
}
function slopeB(i: number, j: number, neg: boolean): number {
  if (i >= 3) return plateau(i, j, neg);
  return j <= 1 ? BIO.snowy_slopes : BIO.grove;
}
const middleOrBadlandsIfHotOrSlopeIfCold = (i: number, j: number, neg: boolean) => (i === 0 ? slopeB(i, j, neg) : middleOrBadlandsIfHot(i, j, neg));
const maybeWindsweptSavanna = (i: number, j: number, neg: boolean, fallback: number) => (i > 1 && j < 4 && !neg ? BIO.windswept_savanna : fallback);
const beach = (i: number) => (i === 0 ? BIO.snowy_beach : i === 4 ? BIO.desert : BIO.beach);
const shatteredCoast = (i: number, j: number, neg: boolean) => maybeWindsweptSavanna(i, j, neg, !neg ? middle(i, j, neg) : beach(i));
function shattered(i: number, j: number, neg: boolean): number {
  const v = SHATTERED[i][j];
  return v === NONE ? middle(i, j, neg) : v;
}

const SLICE_MID = 0, SLICE_HIGH = 1, SLICE_PEAKS = 2, SLICE_LOW = 3, SLICE_VALLEY = 4;

/** Weirdness slice: returns [kind, negative]. */
function weirdnessSlice(W: number): number {
  // encode kind*2 + (neg ? 1 : 0)
  const a = W;
  let kind: number;
  if (a < -0.93333334) kind = SLICE_MID;
  else if (a < -0.7666667) kind = SLICE_HIGH;
  else if (a < -0.56666666) kind = SLICE_PEAKS;
  else if (a < -0.4) kind = SLICE_HIGH;
  else if (a < -0.26666668) kind = SLICE_MID;
  else if (a < -0.05) kind = SLICE_LOW;
  else if (a < 0.05) kind = SLICE_VALLEY;
  else if (a < 0.26666668) kind = SLICE_LOW;
  else if (a < 0.4) kind = SLICE_MID;
  else if (a < 0.56666666) kind = SLICE_HIGH;
  else if (a < 0.7666667) kind = SLICE_PEAKS;
  else if (a < 0.93333334) kind = SLICE_HIGH;
  else kind = SLICE_MID;
  const neg = kind !== SLICE_VALLEY && W < 0;
  return kind * 2 + (neg ? 1 : 0);
}

/** Continentalness class for inland biomes: 0 coast, 1 near inland, 2 mid inland, 3 far inland. */
function inlandClass(C: number): number {
  return C < -0.11 ? 0 : C < 0.03 ? 1 : C < 0.3 ? 2 : 3;
}

export function pickOverworldBiome(T: number, H: number, C: number, E: number, W: number): number {
  if (C < -1.05) return BIO.mushroom_fields;
  const i = tempIndex(T);
  if (C < -0.455) return OCEANS[0][i];
  if (C < -0.19) return OCEANS[1][i];
  const j = humIndex(H);
  const c = inlandClass(C);
  const e = erosionIndex(E);
  const sl = weirdnessSlice(W);
  const kind = sl >> 1;
  const neg = (sl & 1) === 1;
  switch (kind) {
    case SLICE_PEAKS:
      switch (e) {
        case 0: return peak(i, j, neg);
        case 1: return c <= 1 ? middleOrBadlandsIfHotOrSlopeIfCold(i, j, neg) : peak(i, j, neg);
        case 2: return c <= 1 ? middle(i, j, neg) : plateau(i, j, neg);
        case 3: return c <= 1 ? middle(i, j, neg) : c === 2 ? middleOrBadlandsIfHot(i, j, neg) : plateau(i, j, neg);
        case 4: return middle(i, j, neg);
        case 5: return c <= 1 ? maybeWindsweptSavanna(i, j, neg, shattered(i, j, neg)) : shattered(i, j, neg);
        default: return middle(i, j, neg);
      }
    case SLICE_HIGH:
      switch (e) {
        case 0: return c === 0 ? middle(i, j, neg) : c === 1 ? slopeB(i, j, neg) : peak(i, j, neg);
        case 1: return c === 0 ? middle(i, j, neg) : c === 1 ? middleOrBadlandsIfHotOrSlopeIfCold(i, j, neg) : slopeB(i, j, neg);
        case 2: return c <= 1 ? middle(i, j, neg) : plateau(i, j, neg);
        case 3: return c <= 1 ? middle(i, j, neg) : c === 2 ? middleOrBadlandsIfHot(i, j, neg) : plateau(i, j, neg);
        case 4: return middle(i, j, neg);
        case 5: return c <= 1 ? maybeWindsweptSavanna(i, j, neg, middle(i, j, neg)) : shattered(i, j, neg);
        default: return middle(i, j, neg);
      }
    case SLICE_MID:
      if (c === 0 && e <= 2) return BIO.stony_shore;
      if (c >= 1 && e === 6 && i >= 1) return BIO.swamp; // (mangrove swamps for hot climates map to swamp)
      switch (e) {
        case 0: return slopeB(i, j, neg);
        case 1: return c <= 2 ? middleOrBadlandsIfHotOrSlopeIfCold(i, j, neg) : i === 0 ? slopeB(i, j, neg) : plateau(i, j, neg);
        case 2: return c === 1 ? middle(i, j, neg) : c === 2 ? middleOrBadlandsIfHot(i, j, neg) : plateau(i, j, neg);
        case 3: return c <= 1 ? middle(i, j, neg) : middleOrBadlandsIfHot(i, j, neg);
        case 4: return neg && c === 0 ? beach(i) : middle(i, j, neg);
        case 5: return c === 0 ? shatteredCoast(i, j, neg) : c === 1 ? maybeWindsweptSavanna(i, j, neg, middle(i, j, neg)) : shattered(i, j, neg);
        default: return c === 0 ? (neg ? beach(i) : middle(i, j, neg)) : middle(i, j, neg);
      }
    case SLICE_LOW:
      if (c === 0 && e <= 2) return BIO.stony_shore;
      if (c >= 1 && e === 6 && i >= 1) return BIO.swamp;
      switch (e) {
        case 0:
        case 1: return c === 1 ? middleOrBadlandsIfHot(i, j, neg) : middleOrBadlandsIfHotOrSlopeIfCold(i, j, neg);
        case 2: return c === 1 ? middle(i, j, neg) : middleOrBadlandsIfHot(i, j, neg);
        case 3: return c === 0 ? beach(i) : c === 1 ? middle(i, j, neg) : middleOrBadlandsIfHot(i, j, neg);
        case 4: return c === 0 ? beach(i) : middle(i, j, neg);
        case 5: return c === 0 ? shatteredCoast(i, j, neg) : c === 1 ? maybeWindsweptSavanna(i, j, neg, middle(i, j, neg)) : middle(i, j, neg);
        default: return c === 0 ? beach(i) : middle(i, j, neg);
      }
    default: {
      // valleys (rivers)
      const river = i === 0 ? BIO.frozen_river : BIO.river;
      if (e <= 1) return c <= 1 ? river : middleOrBadlandsIfHot(i, j, false);
      if (e <= 5) return river;
      if (c === 0) return river;
      return i === 0 ? BIO.frozen_river : BIO.swamp;
    }
  }
}
