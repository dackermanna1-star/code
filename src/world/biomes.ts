// BiomeSystem: the vertical stack of regions from the mountain surface down to the final depths.
// Depth is measured downward from SURFACE_Y. Every biome is followed by a Holy Mountain band.
import { SURFACE_Y } from '../config';

export const BIOME_HEIGHT = 256;
export const HM_HEIGHT = 64;
export const LAYER_HEIGHT = BIOME_HEIGHT + HM_HEIGHT;

export interface BiomeDef {
  id: string;
  name: string; // Finnish-flavoured name like the original
  display: string;
  /** Solid material weights */
  base: string;
  lump: string; // large blobs embedded in the base
  lumpThreshold: number;
  dense: string; // rare very hard pockets
  vein?: string; // thin ore-like veins
  veinThreshold?: number;
  cover?: string; // top surface cover (grass/moss/snow)
  coverChance?: number;
  ceilingCover?: string; // hanging stuff (vines/fungus)
  ceilingChance?: number;
  powderFloor?: string; // loose powder sprinkled on floors (falls when disturbed)
  powderChance?: number;
  /** Cave shape */
  cheese: number; // threshold for big chambers (lower = more open)
  cheeseScale: number;
  tunnelWidth: number;
  flatten: number; // vertical squash of chambers (>1 = flatter)
  /** Liquid pools: weights */
  pools: [string, number][];
  poolChance: number;
  gasPockets?: [string, number][];
  structure: 'mines' | 'coalpits' | 'snow' | 'hiisi' | 'jungle' | 'vault' | 'none';
  enemies: [string, number][];
  enemyDensity: number; // attempts per 32^3 region
  lootTier: number;
  /** Rendering atmosphere */
  ambient: string;
  ambientStrength: number;
  fog: string;
  fogDensity: number;
  music: 'mines' | 'coal' | 'snow' | 'hiisi' | 'jungle' | 'vault';
}

export const BIOMES: BiomeDef[] = [
  {
    id: 'mines', name: 'Kaivos', display: 'Mines',
    base: 'soil', lump: 'rock', lumpThreshold: 0.3, dense: 'denserock', vein: 'goldore', veinThreshold: 0.93,
    cover: 'grass', coverChance: 0.22, ceilingCover: 'vine', ceilingChance: 0.03, powderFloor: 'gravel', powderChance: 0.02,
    cheese: 0.18, cheeseScale: 54, tunnelWidth: 0.11, flatten: 1.5,
    pools: [['water', 6], ['oil', 1.5], ['toxic', 1], ['blood', 0.3]], poolChance: 0.35,
    gasPockets: [['flamgas', 1]],
    structure: 'mines',
    enemies: [['hamis', 4], ['hound_weak', 4], ['shotgunner_weak', 3], ['miner_weak', 2], ['slime_weak', 2], ['stendari', 0.5], ['liekkio', 0.5], ['acidslime', 0.4], ['motherslime', 0.25]],
    enemyDensity: 1.0, lootTier: 1,
    ambient: '#5a4632', ambientStrength: 0.5, fog: '#0a0806', fogDensity: 0.012, music: 'mines',
  },
  {
    id: 'coalpits', name: 'Hiilikaivos', display: 'Coal Pits',
    base: 'darksoil', lump: 'coal', lumpThreshold: 0.28, dense: 'denserock', vein: 'goldore', veinThreshold: 0.9,
    cover: 'grass', coverChance: 0.25, powderFloor: 'ash', powderChance: 0.03,
    cheese: 0.16, cheeseScale: 50, tunnelWidth: 0.12, flatten: 1.3,
    pools: [['oil', 4], ['water', 3], ['toxic', 1.5], ['lava', 0.25]], poolChance: 0.45,
    gasPockets: [['flamgas', 2], ['toxicgas', 0.5]],
    structure: 'coalpits',
    enemies: [['bat', 3], ['miner', 2], ['shotgunner', 2.5], ['firefly', 3], ['slimeshooter', 1.5], ['liekkio', 1], ['stendari', 0.8], ['hound', 1], ['motherslime', 0.6]],
    enemyDensity: 1.15, lootTier: 2,
    ambient: '#5a4a3e', ambientStrength: 0.56, fog: '#060505', fogDensity: 0.014, music: 'coal',
  },
  {
    id: 'snow', name: 'Lumikaivos', display: 'Snowy Depths',
    base: 'snowrock', lump: 'rock', lumpThreshold: 0.25, dense: 'ice', vein: 'ice', veinThreshold: 0.8,
    cover: 'snow', coverChance: 0.9, powderFloor: 'snow', powderChance: 0.12,
    cheese: 0.2, cheeseScale: 60, tunnelWidth: 0.1, flatten: 1.2,
    pools: [['water', 4], ['blood', 0.6], ['whiskey', 0.4], ['slime', 0.5]], poolChance: 0.3,
    structure: 'snow',
    enemies: [['shotgunner', 2], ['sniper', 2], ['grenadier', 2], ['gunner', 2], ['iceskull', 2.5], ['ukko', 0.6], ['tank', 0.6], ['icemage', 0.6]],
    enemyDensity: 1.2, lootTier: 3,
    ambient: '#7088a0', ambientStrength: 0.5, fog: '#0c1218', fogDensity: 0.012, music: 'snow',
  },
  {
    id: 'hiisi', name: 'Hiidenkivi', display: 'Hiisi Base',
    base: 'rock', lump: 'denserock', lumpThreshold: 0.45, dense: 'denserock', vein: 'coal', veinThreshold: 0.85,
    cover: undefined, powderFloor: 'gravel', powderChance: 0.03,
    cheese: 0.22, cheeseScale: 46, tunnelWidth: 0.1, flatten: 1.8,
    pools: [['oil', 3], ['water', 2], ['acid', 1], ['whiskey', 1.5]], poolChance: 0.35,
    gasPockets: [['flamgas', 1.5]],
    structure: 'hiisi',
    enemies: [['shotgunner', 3], ['sniper', 3], ['grenadier', 2.5], ['gunner', 2.5], ['miner', 2], ['tank', 1], ['turret', 1]],
    enemyDensity: 1.35, lootTier: 4,
    ambient: '#6a6058', ambientStrength: 0.58, fog: '#080707', fogDensity: 0.011, music: 'hiisi',
  },
  {
    id: 'jungle', name: 'Maanalainen viidakko', display: 'Underground Jungle',
    base: 'junglesoil', lump: 'rock', lumpThreshold: 0.38, dense: 'denserock', vein: 'fungus', veinThreshold: 0.72,
    cover: 'grass', coverChance: 0.95, ceilingCover: 'vine', ceilingChance: 0.25, powderFloor: undefined,
    cheese: 0.12, cheeseScale: 64, tunnelWidth: 0.12, flatten: 1.0,
    pools: [['water', 5], ['toxic', 2], ['slime', 1], ['healthium', 0.15], ['mana', 0.2]], poolChance: 0.5,
    gasPockets: [['toxicgas', 1]],
    structure: 'jungle',
    enemies: [['hamis', 3], ['hound', 2], ['acidslime', 2.5], ['slimeshooter', 2], ['bat', 2], ['ukko', 1], ['firefly', 1]],
    enemyDensity: 1.4, lootTier: 5,
    ambient: '#3f5a36', ambientStrength: 0.48, fog: '#050a06', fogDensity: 0.013, music: 'jungle',
  },
  {
    id: 'vault', name: 'Holvi', display: 'The Vault',
    base: 'concrete', lump: 'steel', lumpThreshold: 0.4, dense: 'denserock', vein: 'crystal', veinThreshold: 0.88,
    cover: undefined, powderFloor: 'gravel', powderChance: 0.02,
    cheese: 0.24, cheeseScale: 40, tunnelWidth: 0.1, flatten: 2.0,
    pools: [['acid', 3], ['toxic', 3], ['lava', 1], ['teleportatium', 0.4], ['polymorphine', 0.3]], poolChance: 0.45,
    gasPockets: [['toxicgas', 1], ['acidgas', 0.6]],
    structure: 'vault',
    enemies: [['sniper', 2], ['gunner', 2], ['turret', 2], ['tank', 1.5], ['ukko', 1.5], ['icemage', 1], ['acidslime', 1.5], ['stendari', 1]],
    enemyDensity: 1.5, lootTier: 6,
    ambient: '#4e5a6a', ambientStrength: 0.46, fog: '#05070a', fogDensity: 0.012, music: 'vault',
  },
];

export const NUM_LAYERS = BIOMES.length;

/** Enemy types that spawn in mid-air rather than on floors. */
export const FLYING_ENEMIES = new Set(['motherslime', 'bat', 'firefly', 'slime_weak', 'slimeshooter', 'acidslime', 'liekkio', 'grenadier', 'gunner', 'iceskull', 'ukko']);
/** Depth at which the final chamber (the Work) begins. */
export const FINAL_DEPTH = NUM_LAYERS * LAYER_HEIGHT;

export function depthOf(y: number): number {
  return SURFACE_Y - y;
}

/** Biome layer index for a y coordinate (-1 = surface, NUM_LAYERS = final chamber). */
export function layerOf(y: number): number {
  const d = SURFACE_Y - y;
  if (d < 0) return -1;
  const l = Math.floor(d / LAYER_HEIGHT);
  return l >= NUM_LAYERS ? NUM_LAYERS : l;
}

/** Is y inside a Holy Mountain band? Returns layer index or -1. */
export function hmBandOf(y: number): number {
  const d = SURFACE_Y - y;
  if (d < 0) return -1;
  const l = Math.floor(d / LAYER_HEIGHT);
  if (l >= NUM_LAYERS) return -1;
  return d - l * LAYER_HEIGHT >= BIOME_HEIGHT ? l : -1;
}

export function biomeAt(y: number): BiomeDef | null {
  const l = layerOf(y);
  if (l < 0 || l >= NUM_LAYERS) return null;
  return BIOMES[l];
}

/** World y of the top of biome layer i. */
export function layerTopY(i: number): number {
  return SURFACE_Y - i * LAYER_HEIGHT;
}
/** World y range of holy mountain band i: bottom (exclusive) < y <= top (inclusive). */
export function hmBandY(i: number): { top: number; bottom: number } {
  const top = SURFACE_Y - i * LAYER_HEIGHT - BIOME_HEIGHT;
  return { top, bottom: top - HM_HEIGHT };
}

// Holy mountain temple geometry, relative to the band (shared by generator, progression and tests).
export const HM = {
  cx: 128,
  cz: 128,
  roomX0: 104,
  roomX1: 152,
  roomZ0: 112,
  roomZ1: 144,
  wall: 3,
  roomHeight: 20,
  floorOffset: 18, // floor y = band.bottom + floorOffset
  shaftRadius: 6,
  exitX: 146, // exit shaft (down into the next biome) centre
  exitZ: 128,
};

export function hmFloorY(i: number): number {
  return hmBandY(i).bottom + HM.floorOffset;
}
