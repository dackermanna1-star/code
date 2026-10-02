/**
 * Block-state constants and per-id lookup tables used by the world generators.
 * Importing this module registers all blocks (side effect of `blocks.ts`).
 */
import '../../blocks/blocks';
import { BLOCKS, BLOCK_BY_NAME, S, T_AIR, T_LIQUID, T_OPACITY, T_REPLACEABLE, T_SOLID, T_FULL_CUBE } from '../../blocks/registry';

/** State for a block that may not exist in older registries (0 = air when missing). */
function SO(name: string, meta = 0): number {
  return BLOCK_BY_NAME.has(name) ? S(name, meta) : 0;
}

export const ST = {
  air: 0,
  caveAir: S('cave_air'),
  stone: S('stone'),
  granite: S('granite'),
  diorite: S('diorite'),
  andesite: S('andesite'),
  tuff: S('tuff'),
  calcite: S('calcite'),
  deepslate: S('deepslate'),
  bedrock: S('bedrock'),
  grass: S('grass_block'),
  dirt: S('dirt'),
  coarseDirt: S('coarse_dirt'),
  podzol: S('podzol'),
  mycelium: S('mycelium'),
  mud: S('mud'),
  sand: S('sand'),
  redSand: S('red_sand'),
  sandstone: S('sandstone'),
  redSandstone: S('red_sandstone'),
  gravel: S('gravel'),
  clay: S('clay'),
  snowLayer: S('snow', 0),
  snowBlock: S('snow_block'),
  powderSnow: SO('powder_snow'),
  ice: S('ice'),
  packedIce: S('packed_ice'),
  blueIce: S('blue_ice'),
  water: S('water', 0),
  lava: S('lava', 0),
  obsidian: S('obsidian'),
  cryingObsidian: S('crying_obsidian'),
  cobblestone: S('cobblestone'),
  mossyCobblestone: S('mossy_cobblestone'),
  mossBlock: S('moss_block'),
  terracotta: S('terracotta'),
  whiteTerracotta: S('white_terracotta'),
  orangeTerracotta: S('orange_terracotta'),
  yellowTerracotta: S('yellow_terracotta'),
  brownTerracotta: S('brown_terracotta'),
  redTerracotta: S('red_terracotta'),
  lightGrayTerracotta: S('light_gray_terracotta'),
  infestedStone: S('infested_stone'),
  dripstoneBlock: S('dripstone_block'),
  glowLichen: S('glow_lichen'),
  amethystBlock: S('amethyst_block'),
  buddingAmethyst: S('budding_amethyst'),
  amethystCluster: S('amethyst_cluster'),
  smoothBasalt: SO('smooth_basalt'),
  // ores
  coalOre: S('coal_ore'),
  ironOre: S('iron_ore'),
  copperOre: S('copper_ore'),
  goldOre: S('gold_ore'),
  redstoneOre: S('redstone_ore'),
  lapisOre: S('lapis_ore'),
  diamondOre: S('diamond_ore'),
  emeraldOre: S('emerald_ore'),
  dsCoalOre: S('deepslate_coal_ore'),
  dsIronOre: S('deepslate_iron_ore'),
  dsCopperOre: S('deepslate_copper_ore'),
  dsGoldOre: S('deepslate_gold_ore'),
  dsRedstoneOre: S('deepslate_redstone_ore'),
  dsLapisOre: S('deepslate_lapis_ore'),
  dsDiamondOre: S('deepslate_diamond_ore'),
  dsEmeraldOre: S('deepslate_emerald_ore'),
  rawIronBlock: S('raw_iron_block'),
  rawCopperBlock: SO('raw_copper_block'),
  // vegetation
  shortGrass: S('short_grass'),
  fern: S('fern'),
  deadBush: S('dead_bush'),
  tallGrassLo: S('tall_grass', 0),
  tallGrassHi: S('tall_grass', 8),
  largeFernLo: S('large_fern', 0),
  largeFernHi: S('large_fern', 8),
  dandelion: S('dandelion'),
  poppy: S('poppy'),
  blueOrchid: S('blue_orchid'),
  allium: S('allium'),
  azureBluet: S('azure_bluet'),
  redTulip: S('red_tulip'),
  orangeTulip: S('orange_tulip'),
  whiteTulip: S('white_tulip'),
  pinkTulip: S('pink_tulip'),
  oxeyeDaisy: S('oxeye_daisy'),
  cornflower: S('cornflower'),
  lilyOfTheValley: S('lily_of_the_valley'),
  sunflower: S('sunflower', 0),
  lilac: S('lilac', 0),
  roseBush: S('rose_bush', 0),
  peony: S('peony', 0),
  brownMushroom: S('brown_mushroom'),
  redMushroom: S('red_mushroom'),
  sugarCane: S('sugar_cane'),
  cactus: S('cactus'),
  pumpkin: S('pumpkin'),
  melon: S('melon'),
  lilyPad: S('lily_pad'),
  kelp: S('kelp'),
  seagrass: S('seagrass'),
  seaPickle: S('sea_pickle'),
  sweetBerryBush: S('sweet_berry_bush', 3),
  bamboo: S('bamboo'),
  // wood
  oakLog: S('oak_log', 0),
  spruceLog: S('spruce_log', 0),
  birchLog: S('birch_log', 0),
  jungleLog: S('jungle_log', 0),
  acaciaLog: S('acacia_log', 0),
  darkOakLog: S('dark_oak_log', 0),
  cherryLog: S('cherry_log', 0),
  oakLeaves: S('oak_leaves'),
  spruceLeaves: S('spruce_leaves'),
  birchLeaves: S('birch_leaves'),
  jungleLeaves: S('jungle_leaves'),
  acaciaLeaves: S('acacia_leaves'),
  darkOakLeaves: S('dark_oak_leaves'),
  cherryLeaves: S('cherry_leaves'),
  mushroomStem: SO('mushroom_stem'),
  brownMushroomBlock: SO('brown_mushroom_block'),
  redMushroomBlock: SO('red_mushroom_block'),
  // structures / misc
  chest: S('chest'),
  spawner: S('spawner'),
  netherrack: S('netherrack'),
  magma: S('magma_block'),
  goldBlock: S('gold_block'),
  ironBars: S('iron_bars'),
  stoneBricks: S('stone_bricks'),
  mossyStoneBricks: S('mossy_stone_bricks'),
  crackedStoneBricks: S('cracked_stone_bricks'),
  sandstoneSlab: S('sandstone_slab', 0),
  sandstoneSlabTop: S('sandstone_slab', 1),
  cutSandstone: S('cut_sandstone'),
  smoothSandstone: S('smooth_sandstone'),
  torch: S('torch', 1),
  fire: S('fire'),
  soulFire: S('soul_fire'),
  // nether
  soulSand: S('soul_sand'),
  soulSoil: S('soul_soil'),
  basalt: S('basalt', 0),
  blackstone: S('blackstone'),
  glowstone: S('glowstone'),
  crimsonNylium: S('crimson_nylium'),
  warpedNylium: S('warped_nylium'),
  crimsonStem: S('crimson_stem', 0),
  warpedStem: S('warped_stem', 0),
  netherWartBlock: S('nether_wart_block'),
  warpedWartBlock: S('warped_wart_block'),
  shroomlight: S('shroomlight'),
  crimsonFungus: S('crimson_fungus'),
  warpedFungus: S('warped_fungus'),
  crimsonRoots: S('crimson_roots'),
  warpedRoots: S('warped_roots'),
  weepingVines: S('weeping_vines'),
  twistingVines: SO('twisting_vines'),
  netherQuartzOre: S('nether_quartz_ore'),
  netherGoldOre: S('nether_gold_ore'),
  ancientDebris: S('ancient_debris'),
  boneBlock: S('bone_block', 0),
  // end
  endStone: S('end_stone'),
  chorusPlant: S('chorus_plant'),
  chorusFlower: S('chorus_flower'),
};

export const AIR = 0;

/** Log state with axis (0 = y, 1 = x, 2 = z). */
export const withAxis = (logState: number, axis: number) => (logState & ~15) | axis;

export const blockId = (state: number) => state >>> 4;

const N = 4096;
function table(pred: (name: string, tags: string[], id: number) => boolean): Uint8Array {
  const t = new Uint8Array(N);
  for (const b of BLOCKS) if (pred(b.name, b.tags, b.id)) t[b.id] = 1;
  return t;
}

/** Block ids that count as "solid ground" for terrain logic (full cubes that are not leaves). */
export const IS_LOG = table((n, tags) => tags.includes('logs') || n === 'mushroom_stem');
export const IS_LEAVES = table((n, tags) => tags.includes('leaves') || n.endsWith('_mushroom_block') || n === 'nether_wart_block' || n === 'warped_wart_block' || n === 'shroomlight');
export const IS_PLANT = table((n, tags) => tags.includes('plant') || n === 'vine' || n === 'snow' || n === 'glow_lichen' || n === 'seagrass' || n === 'kelp' || n === 'sweet_berry_bush');
/** Things a tree trunk / leaf may overwrite. */
export const TREE_REPLACEABLE = table((n, tags, id) => T_AIR[id] === 1 || IS_PLANT[id] === 1 || IS_LEAVES[id] === 1 || T_REPLACEABLE[id] === 1 && T_LIQUID[id] === 0);
export const LEAF_REPLACEABLE = table((n, tags, id) => (T_AIR[id] === 1 || IS_PLANT[id] === 1 || (T_REPLACEABLE[id] === 1 && T_LIQUID[id] === 0)) && IS_LEAVES[id] === 0 && IS_LOG[id] === 0);
/** Soil a tree can grow on. */
export const IS_SOIL = table((n) => n === 'grass_block' || n === 'dirt' || n === 'coarse_dirt' || n === 'podzol' || n === 'mycelium' || n === 'moss_block' || n === 'mud' || n === 'rooted_dirt');
/** Base stones that ore veins / blobs may replace. */
export const IS_STONE_LIKE = table((n) => n === 'stone' || n === 'granite' || n === 'diorite' || n === 'andesite' || n === 'tuff' || n === 'deepslate');
export const IS_SOLID = table((n, tags, id) => T_SOLID[id] === 1 && T_LIQUID[id] === 0);
export const IS_FULL = table((n, tags, id) => T_FULL_CUBE[id] === 1);
/** Heightmap rule: opaque (opacity > 0) or liquid. */
export const BLOCKS_HEIGHTMAP = table((n, tags, id) => T_AIR[id] === 0 && (T_OPACITY[id] > 0 || T_LIQUID[id] > 0));
export const IS_LIQUID = table((n, tags, id) => T_LIQUID[id] > 0);
export const IS_AIR = table((n, tags, id) => T_AIR[id] === 1);
