/**
 * Biome registry (ids are stored in chunks — APPEND ONLY). Worker-safe.
 * Colours follow Minecraft's colormap behaviour (temperature/downfall triangle).
 */
export type Precipitation = 'none' | 'rain' | 'snow';
export type BiomeCategory =
  | 'ocean' | 'river' | 'beach' | 'plains' | 'desert' | 'swamp' | 'forest' | 'taiga' | 'savanna'
  | 'jungle' | 'badlands' | 'mountain' | 'icy' | 'mushroom' | 'underground' | 'nether' | 'the_end';

export interface Biome {
  id: number;
  name: string;
  temperature: number;
  downfall: number;
  category: BiomeCategory;
  precipitation: Precipitation;
  /** 0xRRGGBB overrides (else computed from the colormap). */
  grass?: number;
  foliage?: number;
  water: number;
  /** Underwater fog colour. */
  waterFog: number;
  /** Fog colour (mainly Nether/End). */
  fog?: number;
  dimension: 'overworld' | 'nether' | 'end';
}

export const BIOMES: Biome[] = [];
export const BIOME_BY_NAME = new Map<string, Biome>();

function B(name: string, temperature: number, downfall: number, category: BiomeCategory, opts: Partial<Biome> = {}): Biome {
  const b: Biome = {
    id: BIOMES.length,
    name,
    temperature,
    downfall,
    category,
    precipitation: opts.precipitation ?? (temperature > 1.5 ? 'none' : temperature < 0.15 ? 'snow' : 'rain'),
    water: 0x3f76e4,
    waterFog: 0x050533,
    dimension: 'overworld',
    ...opts,
  };
  BIOMES.push(b);
  BIOME_BY_NAME.set(name, b);
  return b;
}

B('ocean', 0.5, 0.5, 'ocean');
B('deep_ocean', 0.5, 0.5, 'ocean');
B('warm_ocean', 0.5, 0.5, 'ocean', { water: 0x43d5ee, waterFog: 0x041f33 });
B('lukewarm_ocean', 0.5, 0.5, 'ocean', { water: 0x45adf2, waterFog: 0x041633 });
B('cold_ocean', 0.5, 0.5, 'ocean', { water: 0x3d57d6, waterFog: 0x050533 });
B('frozen_ocean', 0.0, 0.5, 'ocean', { water: 0x3938c9, waterFog: 0x050533, precipitation: 'snow' });
B('river', 0.5, 0.5, 'river');
B('frozen_river', 0.0, 0.5, 'river', { water: 0x3938c9, precipitation: 'snow' });
B('beach', 0.8, 0.4, 'beach');
B('snowy_beach', 0.05, 0.3, 'beach', { water: 0x3d57d6 });
B('stony_shore', 0.2, 0.3, 'beach');
B('plains', 0.8, 0.4, 'plains');
B('sunflower_plains', 0.8, 0.4, 'plains');
B('snowy_plains', 0.0, 0.5, 'icy');
B('ice_spikes', 0.0, 0.5, 'icy');
B('desert', 2.0, 0.0, 'desert');
B('swamp', 0.8, 0.9, 'swamp', { grass: 0x6a7039, foliage: 0x6a7039, water: 0x617b64, waterFog: 0x232317 });
B('forest', 0.7, 0.8, 'forest');
B('flower_forest', 0.7, 0.8, 'forest');
B('birch_forest', 0.6, 0.6, 'forest');
B('dark_forest', 0.7, 0.8, 'forest');
B('taiga', 0.25, 0.8, 'taiga');
B('snowy_taiga', -0.5, 0.4, 'taiga', { water: 0x3d57d6, precipitation: 'snow' });
B('old_growth_pine_taiga', 0.3, 0.8, 'taiga');
B('savanna', 2.0, 0.0, 'savanna');
B('savanna_plateau', 2.0, 0.0, 'savanna');
B('jungle', 0.95, 0.9, 'jungle');
B('sparse_jungle', 0.95, 0.8, 'jungle');
B('bamboo_jungle', 0.95, 0.9, 'jungle');
B('badlands', 2.0, 0.0, 'badlands', { grass: 0x90814d, foliage: 0x9e814d });
B('wooded_badlands', 2.0, 0.0, 'badlands', { grass: 0x90814d, foliage: 0x9e814d });
B('meadow', 0.5, 0.8, 'mountain', { water: 0x0e4ecf });
B('grove', -0.2, 0.8, 'mountain', { precipitation: 'snow' });
B('snowy_slopes', -0.3, 0.9, 'mountain', { precipitation: 'snow' });
B('jagged_peaks', -0.7, 0.9, 'mountain', { precipitation: 'snow' });
B('frozen_peaks', -0.7, 0.9, 'mountain', { precipitation: 'snow' });
B('stony_peaks', 1.0, 0.3, 'mountain');
B('windswept_hills', 0.2, 0.3, 'mountain');
B('mushroom_fields', 0.9, 1.0, 'mushroom');
B('cherry_grove', 0.5, 0.8, 'forest', { grass: 0xb6db61, foliage: 0xb6db61, water: 0x5db7ef });
B('dripstone_caves', 0.8, 0.4, 'underground');
B('lush_caves', 0.5, 0.5, 'underground');
B('deep_dark', 0.8, 0.4, 'underground');
// Nether
B('nether_wastes', 2.0, 0.0, 'nether', { dimension: 'nether', precipitation: 'none', fog: 0x330808 });
B('crimson_forest', 2.0, 0.0, 'nether', { dimension: 'nether', precipitation: 'none', fog: 0x330303 });
B('warped_forest', 2.0, 0.0, 'nether', { dimension: 'nether', precipitation: 'none', fog: 0x1a051a });
B('soul_sand_valley', 2.0, 0.0, 'nether', { dimension: 'nether', precipitation: 'none', fog: 0x1b4745 });
B('basalt_deltas', 2.0, 0.0, 'nether', { dimension: 'nether', precipitation: 'none', fog: 0x685f70 });
// End
B('the_end', 0.5, 0.5, 'the_end', { dimension: 'end', precipitation: 'none', fog: 0x0a080c });
B('end_highlands', 0.5, 0.5, 'the_end', { dimension: 'end', precipitation: 'none', fog: 0x0a080c });
B('small_end_islands', 0.5, 0.5, 'the_end', { dimension: 'end', precipitation: 'none', fog: 0x0a080c });
// Appended by the world-generation workstream (Minecraft 1.18+ multi-noise biome variants).
B('deep_lukewarm_ocean', 0.5, 0.5, 'ocean', { water: 0x45adf2, waterFog: 0x041633 });
B('deep_cold_ocean', 0.5, 0.5, 'ocean', { water: 0x3d57d6, waterFog: 0x050533 });
B('deep_frozen_ocean', 0.0, 0.5, 'ocean', { water: 0x3938c9, waterFog: 0x050533, precipitation: 'snow' });
B('windswept_forest', 0.2, 0.3, 'mountain');
B('windswept_gravelly_hills', 0.2, 0.3, 'mountain');
B('windswept_savanna', 2.0, 0.0, 'savanna');
B('old_growth_birch_forest', 0.6, 0.6, 'forest');
B('old_growth_spruce_taiga', 0.25, 0.8, 'taiga');
B('eroded_badlands', 2.0, 0.0, 'badlands', { grass: 0x90814d, foliage: 0x9e814d });

export function biomeByName(name: string): Biome {
  const b = BIOME_BY_NAME.get(name);
  if (!b) throw new Error(`Unknown biome ${name}`);
  return b;
}
export const biomeId = (name: string) => biomeByName(name).id;

function mixTriangle(t: number, d: number, c11: number[], c10: number[], c00: number[]): number {
  const T = Math.min(1, Math.max(0, t));
  const D = Math.min(1, Math.max(0, d)) * T;
  const w11 = D, w10 = T - D, w00 = 1 - T;
  const r = Math.round(w11 * c11[0] + w10 * c10[0] + w00 * c00[0]);
  const g = Math.round(w11 * c11[1] + w10 * c10[1] + w00 * c00[1]);
  const b = Math.round(w11 * c11[2] + w10 * c10[2] + w00 * c00[2]);
  return (r << 16) | (g << 8) | b;
}

/** Minecraft grass colormap approximation. */
export function grassColormap(temperature: number, downfall: number): number {
  return mixTriangle(temperature, downfall, [75, 204, 52], [191, 183, 85], [128, 180, 151]);
}
/** Minecraft foliage colormap approximation. */
export function foliageColormap(temperature: number, downfall: number): number {
  return mixTriangle(temperature, downfall, [31, 191, 1], [174, 164, 42], [96, 161, 123]);
}

export function biomeGrassColor(b: Biome): number {
  if (b.grass !== undefined) return b.grass;
  let c = grassColormap(b.temperature, b.downfall);
  if (b.name === 'dark_forest') c = (((c & 0xfefefe) + 0x28340a) >> 1);
  return c;
}
export function biomeFoliageColor(b: Biome): number {
  if (b.foliage !== undefined) return b.foliage;
  return foliageColormap(b.temperature, b.downfall);
}
