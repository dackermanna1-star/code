/**
 * Per-column terrain transformation for the asteroid impact (pure block logic, unit tested).
 *
 * `processColumn` turns one (x,z) column into its post-impact state:
 *   1. strips everything that is not natural ground: trees, plants, buildings, snow and ice
 *      (and boils away water near the impact);
 *   2. computes the target surface: the crater bowl (inside R), hills shaved toward the impact
 *      level outside it, plus the ejecta blanket thinning with the cube of the distance;
 *   3. carves or fills to that surface;
 *   4. dresses the surface: a melt lining (magma, obsidian, blackstone, basalt) and a lava lake
 *      in the crater; outside, scorched ground (coarse dirt, blackstone, fused sand), ash and
 *      gravel drifts, rubble where buildings stood, and fires (some on netherrack, burning on).
 */
import { BLOCKS, BLOCK_BY_NAME } from '../../../world/blocks/registry';
import { hash3, noise2 } from '../kit';
import { craterProfile, type ImpactPlan } from './crater';

/** Block classes for leveling. */
export const enum Cls {
  Air = 0,
  /** Natural ground (soil, sand, stone, ores ...). */
  Terrain = 1,
  Water = 2,
  Lava = 3,
  /** Trees, leaves, flowers, crops ... */
  Plant = 4,
  /** Everything built or placed (removed by the blast). */
  Struct = 5,
  /** Snow and ice (melted). */
  Melt = 6,
  /** Unbreakable (bedrock, barrier ...). */
  Fixed = 7,
}

const TERRAIN_NAMES = [
  'grass_block', 'dirt', 'coarse_dirt', 'podzol', 'mycelium', 'gravel', 'clay', 'sandstone', 'red_sandstone', 'stone', 'granite', 'diorite',
  'andesite', 'deepslate', 'tuff', 'calcite', 'obsidian', 'crying_obsidian', 'mud', 'moss_block', 'dripstone_block', 'farmland', 'dirt_path', 'netherrack',
  'soul_sand', 'soul_soil', 'basalt', 'smooth_basalt', 'blackstone', 'magma_block', 'amethyst_block', 'budding_amethyst', 'end_stone',
  'infested_stone', 'sand', 'red_sand', 'terracotta', 'raw_iron_block', 'raw_copper_block', 'raw_gold_block',
];
const TERRAIN_TAGS = ['dirt', 'sand', 'base_stone', 'base_stone_nether', 'ore', 'stone_ore', 'deepslate_ore', 'terracotta'];
const PLANT_NAMES = [
  'vine', 'cactus', 'bamboo', 'sugar_cane', 'pumpkin', 'melon', 'lily_pad', 'kelp', 'seagrass', 'sweet_berry_bush', 'brown_mushroom_block',
  'red_mushroom_block', 'mushroom_stem', 'glow_lichen', 'cobweb', 'dead_bush', 'pumpkin_stem', 'melon_stem', 'weeping_vines', 'twisting_vines',
  'sea_pickle', 'chorus_plant', 'chorus_flower', 'crimson_fungus', 'warped_fungus', 'crimson_roots', 'warped_roots', 'nether_wart',
  'short_grass', 'tall_grass', 'fern', 'large_fern', 'brown_mushroom', 'red_mushroom', 'cocoa', 'moss_carpet', 'nether_wart_block', 'warped_wart_block',
  'crimson_stem', 'warped_stem', 'shroomlight',
];
const PLANT_TAGS = ['plant', 'leaves', 'logs', 'sapling', 'flowers', 'crops', 'mushroom', 'small_flowers', 'tall_flowers'];
const MELT_NAMES = ['snow', 'snow_block', 'ice', 'packed_ice', 'blue_ice', 'powder_snow'];
const SOIL_NAMES = ['grass_block', 'dirt', 'podzol', 'mycelium', 'moss_block', 'farmland', 'dirt_path', 'mud', 'coarse_dirt'];

let CLS: Uint8Array | null = null;
let SOIL: Uint8Array | null = null;
let SANDY: Uint8Array | null = null;
let STONY: Uint8Array | null = null;

function buildTables() {
  const n = BLOCKS.length;
  CLS = new Uint8Array(n);
  SOIL = new Uint8Array(n);
  SANDY = new Uint8Array(n);
  STONY = new Uint8Array(n);
  const terrain = new Set(TERRAIN_NAMES), plants = new Set(PLANT_NAMES), melt = new Set(MELT_NAMES), soil = new Set(SOIL_NAMES);
  for (let id = 0; id < n; id++) {
    const d = BLOCKS[id];
    if (!d) continue;
    let c: Cls;
    const tags = d.tags ?? [];
    if (d.isAir || id === 0) c = Cls.Air;
    else if (d.liquid === 1) c = Cls.Water;
    else if (d.liquid === 2) c = Cls.Lava;
    else if (d.hardness < 0) c = Cls.Fixed;
    else if (melt.has(d.name)) c = Cls.Melt;
    else if (terrain.has(d.name) || tags.some((t) => TERRAIN_TAGS.includes(t))) c = Cls.Terrain;
    else if (plants.has(d.name) || d.shape === 'cross' || d.shape === 'leaves' || tags.some((t) => PLANT_TAGS.includes(t))) c = Cls.Plant;
    else c = Cls.Struct;
    CLS[id] = c;
    if (soil.has(d.name)) SOIL[id] = 1;
    if (d.name === 'sand' || d.name === 'red_sand') SANDY[id] = 1;
    if (tags.includes('base_stone') || d.name === 'stone') STONY[id] = 1;
  }
}

/** Leveling class of a block state. */
export function classify(state: number): Cls {
  if (!CLS) buildTables();
  return state === 0 ? Cls.Air : (CLS![state >>> 4] as Cls);
}

interface Mats {
  lava: number; magma: number; obsidian: number; crying: number; blackstone: number; basalt: number; smoothBasalt: number;
  tuff: number; gravel: number; coarse: number; dirt: number; cobble: number; glass: number; fire: number; netherrack: number;
}
let MATS: Mats | null = null;
function st(name: string) {
  const b = BLOCK_BY_NAME.get(name);
  if (!b) throw new Error(`asteroid: unknown block ${name}`);
  return b.id << 4;
}
export function mats(): Mats {
  return (MATS ??= {
    lava: st('lava'), magma: st('magma_block'), obsidian: st('obsidian'), crying: st('crying_obsidian'), blackstone: st('blackstone'),
    basalt: st('basalt'), smoothBasalt: st('smooth_basalt'), tuff: st('tuff'), gravel: st('gravel'), coarse: st('coarse_dirt'),
    dirt: st('dirt'), cobble: st('cobblestone'), glass: st('glass'), fire: st('fire'), netherrack: st('netherrack'),
  });
}

export interface ColumnAccess {
  get(x: number, y: number, z: number): number;
  /** Returns true if the block changed. */
  set(x: number, y: number, z: number, state: number): boolean;
  /** Highest y that may hold a block in this column, or -1 if the column is not loaded. */
  top(x: number, z: number): number;
  /** Called before a built block is removed (clear block entities ...). */
  removing?(x: number, y: number, z: number, state: number): void;
}

export interface ColumnInfo {
  /** Natural ground before the impact (-1: none). */
  ground: number;
  /** Final surface y. */
  surface: number;
  /** Blocks stripped above the ground (trees, buildings ...), and one of their states. */
  removed: number;
  removedState: number;
  /** Water blocks boiled away. */
  evaporated: number;
  /** y of a fire placed on the column (-1: none). */
  fireY: number;
  /** A water column left as it was (beyond the evaporation radius). */
  water: boolean;
  crater: boolean;
}

export function newColumnInfo(): ColumnInfo {
  return { ground: -1, surface: -1, removed: 0, removedState: 0, evaporated: 0, fireY: -1, water: false, crater: false };
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Surface y after shaving hills down toward the impact level. */
export function shavedGround(P: ImpactPlan, ground: number, x: number, z: number, d: number): number {
  const allow = P.G + 6 + 0.12 * Math.max(0, d - P.R) + 3 * noise2(x / 23, z / 23, P.seed + 7);
  if (ground <= allow) return ground;
  const maxCut = Math.max(5, 34 * (1 - d / Math.max(1, P.maxR)));
  return Math.max(Math.floor(allow), ground - Math.floor(maxCut));
}

function lining(P: ImpactPlan, M: Mats, x: number, y: number, z: number, rn: number) {
  const h = hash3(x, y, z, P.seed + 3);
  if (rn < 0.5) return h < 0.34 ? M.magma : h < 0.62 ? M.obsidian : h < 0.82 ? M.blackstone : h < 0.95 ? M.basalt : M.crying;
  if (rn < 0.85) return h < 0.4 ? M.blackstone : h < 0.6 ? M.basalt : h < 0.75 ? M.obsidian : h < 0.9 ? M.smoothBasalt : M.magma;
  return h < 0.35 ? M.blackstone : h < 0.58 ? M.tuff : h < 0.8 ? M.coarse : h < 0.9 ? M.basalt : M.gravel;
}

function ejecta(P: ImpactPlan, M: Mats, x: number, y: number, z: number, rn: number) {
  const h = hash3(x, y, z, P.seed + 4);
  if (rn < 1.3 && h < 0.07) return M.magma;
  return h < 0.3 ? M.gravel : h < 0.48 ? M.cobble : h < 0.68 ? M.coarse : h < 0.86 ? M.blackstone : M.tuff;
}

function scorch(P: ImpactPlan, M: Mats, state: number, x: number, y: number, z: number, rn: number, filled: boolean): number {
  const h = hash3(x, y, z, P.seed + 5);
  if (filled) return rn < 1.4 && h < 0.08 ? M.magma : h < 0.4 ? M.blackstone : h < 0.72 ? M.coarse : h < 0.88 ? M.gravel : M.tuff;
  const id = state >>> 4;
  const near = rn < 2.2, mid = rn < 4;
  if (SOIL![id]) {
    if (near) return h < 0.45 ? M.blackstone : h < 0.85 ? M.coarse : M.gravel;
    if (mid) return h < 0.15 ? M.blackstone : h < 0.85 ? M.coarse : M.gravel;
    return h < 0.78 ? M.coarse : h < 0.9 ? M.dirt : M.gravel;
  }
  if (SANDY![id]) {
    if (near) return h < 0.6 ? M.glass : state; // fused sand
    if (mid && h < 0.12) return M.glass;
    return state;
  }
  if (STONY![id] && near && h < 0.4) return M.blackstone;
  return state;
}

/**
 * Transform the column (x,z). Returns the number of blocks changed, or -1 if the column is not
 * loaded. `info` (optional) receives what happened, for visual effects.
 */
export function processColumn(acc: ColumnAccess, P: ImpactPlan, x: number, z: number, info?: ColumnInfo): number {
  const yTop = acc.top(x, z);
  if (yTop < 0) return -1;
  if (!CLS) buildTables();
  const M = mats();
  let edits = 0;
  const dx = x - P.cx, dz = z - P.cz;
  const d = Math.sqrt(dx * dx + dz * dz);
  const rn = d / (P.R * (1 + 0.07 * noise2(x / 13, z / 13, P.seed)));
  const inCrater = rn < 1;
  const evap = d < P.evapR;
  if (info) {
    info.ground = -1; info.surface = -1; info.removed = 0; info.removedState = 0; info.evaporated = 0; info.fireY = -1; info.water = false; info.crater = inCrater;
  }

  // 1) strip everything above the natural ground
  let ground = -1, removed = 0, built = 0, removedState = 0, evaporated = 0, water = false;
  for (let y = Math.min(255, yTop); y > 0; y--) {
    const s = acc.get(x, y, z);
    if (s === 0) continue;
    const c = CLS![s >>> 4];
    if (c === Cls.Terrain || c === Cls.Fixed || c === Cls.Lava) { ground = y; break; }
    if (c === Cls.Water) {
      if (evap || inCrater) {
        if (acc.set(x, y, z, 0)) { edits++; evaporated++; }
        continue;
      }
      water = true;
      ground = y;
      break;
    }
    if (c === Cls.Struct) acc.removing?.(x, y, z, s);
    if (acc.set(x, y, z, 0)) {
      edits++;
      removed++;
      if (c === Cls.Struct) built++;
      if (c !== Cls.Melt) removedState = s;
    }
  }
  if (info) { info.ground = ground; info.removed = removed; info.removedState = removedState; info.evaporated = evaporated; info.water = water; }
  if (ground < 0 || water) return edits;

  // 2) target surface
  const shaved = shavedGround(P, ground, x, z, d);
  let T: number;
  if (inCrater) {
    const base = P.G + (shaved - P.G) * smooth(0.7, 1, rn);
    T = Math.floor(base + craterProfile(rn, P.D, P.H) + 0.5);
  } else {
    T = shaved + (rn < 3.2 ? Math.floor(craterProfile(rn, P.D, P.H) + hash3(x, 0, z, P.seed + 9) * 0.9) : 0);
  }
  T = Math.max(2, Math.min(250, T));

  // 3) carve or fill
  if (T < ground) {
    for (let y = ground; y > T; y--) {
      const s = acc.get(x, y, z);
      if (s === 0 || CLS![s >>> 4] === Cls.Fixed) continue;
      if (acc.set(x, y, z, 0)) edits++;
    }
  } else if (T > ground) {
    for (let y = ground + 1; y <= T; y++) if (acc.set(x, y, z, ejecta(P, M, x, y, z, rn))) edits++;
  }

  // 4) surface
  let surface = T;
  let fireY = -1;
  if (inCrater) {
    for (let y = Math.max(1, T - 2); y <= T; y++) {
      if (CLS![acc.get(x, y, z) >>> 4] === Cls.Fixed) continue;
      if (acc.set(x, y, z, lining(P, M, x, y, z, rn))) edits++;
    }
    if (T < P.lavaY) {
      for (let y = T + 1; y <= P.lavaY; y++) if (acc.set(x, y, z, M.lava)) edits++;
      // cooling crust floating on the lake
      if (noise2(x / 5, z / 5, P.seed + 11) > 0.42) {
        if (acc.set(x, P.lavaY, z, hash3(x, 1, z, P.seed + 12) < 0.55 ? M.magma : M.obsidian)) edits++;
      }
      surface = P.lavaY;
    }
  } else {
    const top = acc.get(x, T, z);
    if (top && acc.set(x, T, z, scorch(P, M, top, x, T, z, rn, T > ground))) edits++;
    if (acc.get(x, T + 1, z) === 0 && T < 254) {
      const h = hash3(x, 2, z, P.seed + 13);
      const pFire = rn < 3 ? 0.05 : 0.012 + 0.025 * Math.max(0, 1 - d / Math.max(1, P.maxR));
      if (noise2(x / 7, z / 7, P.seed + 14) > 0.45) {
        // ash and gravel drifts
        if (acc.set(x, T + 1, z, h < 0.55 ? M.gravel : M.tuff)) { edits++; surface = T + 1; }
      } else if (built > 0 && h < 0.5) {
        // rubble where a building stood
        if (acc.set(x, T + 1, z, h < 0.2 ? M.cobble : h < 0.35 ? M.gravel : M.blackstone)) { edits++; surface = T + 1; }
      } else if (h < pFire) {
        if (h < pFire * 0.35 && acc.set(x, T, z, M.netherrack)) edits++; // smouldering on
        if (acc.set(x, T + 1, z, M.fire)) { edits++; fireY = T + 1; }
      }
    }
  }
  if (info) { info.surface = surface; info.fireY = fireY; }
  return edits;
}
