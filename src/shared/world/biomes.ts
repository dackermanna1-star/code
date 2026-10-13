import { B } from './blocks';

export const enum Biome {
  Ocean = 0,
  Beach = 1,
  Plains = 2,
  Forest = 3,
  BirchForest = 4,
  Taiga = 5,
  Snowy = 6,
  Desert = 7,
  Savanna = 8,
  Swamp = 9,
  Mountains = 10,
  River = 11,
  StoneBeach = 12,
}

export interface BiomeInfo {
  name: string;
  top: number;
  filler: number;
  /** Underwater floor */
  floor: number;
  /** Base air temperature offset (°C) relative to the climate noise. */
  tempOffset: number;
  /** Trees per 4x4 candidate cell (0..1). */
  treeDensity: number;
  mapColor: number;
}

export const BIOMES: Record<number, BiomeInfo> = {
  [Biome.Ocean]: { name: 'Ocean', top: B.sand, filler: B.sand, floor: B.sand, tempOffset: 0, treeDensity: 0, mapColor: 0x2f5fbf },
  [Biome.Beach]: { name: 'Beach', top: B.sand, filler: B.sand, floor: B.sand, tempOffset: 2, treeDensity: 0, mapColor: 0xdbd29b },
  [Biome.StoneBeach]: { name: 'Stony Shore', top: B.gravel, filler: B.stone, floor: B.gravel, tempOffset: -4, treeDensity: 0, mapColor: 0x8a8580 },
  [Biome.Plains]: { name: 'Grasslands', top: B.grass, filler: B.dirt, floor: B.dirt, tempOffset: 0, treeDensity: 0.04, mapColor: 0x6aa84a },
  [Biome.Forest]: { name: 'Forest', top: B.grass, filler: B.dirt, floor: B.dirt, tempOffset: -1, treeDensity: 0.55, mapColor: 0x3f7f2a },
  [Biome.BirchForest]: { name: 'Birch Woods', top: B.grass, filler: B.dirt, floor: B.dirt, tempOffset: -2, treeDensity: 0.45, mapColor: 0x6c9a3c },
  [Biome.Taiga]: { name: 'Taiga', top: B.grass, filler: B.dirt, floor: B.gravel, tempOffset: -6, treeDensity: 0.5, mapColor: 0x2b5532 },
  [Biome.Snowy]: { name: 'Tundra', top: B.snowy_grass, filler: B.dirt, floor: B.gravel, tempOffset: -14, treeDensity: 0.08, mapColor: 0xe6eef0 },
  [Biome.Desert]: { name: 'Desert', top: B.sand, filler: B.sand, floor: B.sand, tempOffset: 12, treeDensity: 0, mapColor: 0xe0cf8a },
  [Biome.Savanna]: { name: 'Dry Steppe', top: B.dry_grass, filler: B.dirt, floor: B.dirt, tempOffset: 7, treeDensity: 0.05, mapColor: 0xa39a4f },
  [Biome.Swamp]: { name: 'Swamp', top: B.swamp_grass, filler: B.mud, floor: B.clay, tempOffset: 3, treeDensity: 0.18, mapColor: 0x4b6b35 },
  [Biome.Mountains]: { name: 'Mountains', top: B.stone, filler: B.stone, floor: B.gravel, tempOffset: -6, treeDensity: 0.06, mapColor: 0x8d8d8d },
  [Biome.River]: { name: 'River', top: B.sand, filler: B.sand, floor: B.gravel, tempOffset: -1, treeDensity: 0, mapColor: 0x3f6fcf },
};
