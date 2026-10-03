/**
 * Recipe ingredients and item tags. Ingredients reference items by Minecraft id strings and are
 * resolved lazily against the item registry (items registered later by other modules are picked
 * up automatically: resolution is cached per registry size).
 *
 * Ingredient syntax: `'iron_ingot'`, `'#planks'` (tag), or an array of alternatives.
 * Tags resolve from (1) `ItemDef.tags`, (2) the tags of the item's block, (3) TAG_TABLE below.
 */
import { ITEMS, ITEM_BY_NAME, type ItemDef } from '../items/registry';
import { BLOCK_BY_NAME } from '../../world/blocks/registry';

export type Ingredient = string | string[];

const WOODS = ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak', 'mangrove', 'cherry'];
export const ALL_WOODS = [...WOODS, 'bamboo', 'crimson', 'warped'];
export const DYES = ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black'];

/** Extra item tags (Minecraft item tags that are not block tags in this registry). Members may not exist. */
export const TAG_TABLE: Record<string, string[]> = {
  coals: ['coal', 'charcoal'],
  stone_crafting_materials: ['cobblestone', 'blackstone', 'cobbled_deepslate'],
  stone_tool_materials: ['cobblestone', 'blackstone', 'cobbled_deepslate'],
  soul_fire_base_blocks: ['soul_sand', 'soul_soil'],
  fishes: ['cod', 'cooked_cod', 'salmon', 'cooked_salmon', 'pufferfish', 'tropical_fish'],
  wooden_slabs: ALL_WOODS.map((w) => `${w}_slab`),
  wooden_stairs: ALL_WOODS.map((w) => `${w}_stairs`),
  wooden_fences: ALL_WOODS.map((w) => `${w}_fence`),
  wooden_doors: ALL_WOODS.map((w) => `${w}_door`),
  wooden_trapdoors: ALL_WOODS.map((w) => `${w}_trapdoor`),
  wooden_buttons: ALL_WOODS.map((w) => `${w}_button`),
  wooden_pressure_plates: ALL_WOODS.map((w) => `${w}_pressure_plate`),
  logs_that_burn: [...WOODS.flatMap((w) => [`${w}_log`, `${w}_wood`, `stripped_${w}_log`, `stripped_${w}_wood`]), 'bamboo_block', 'stripped_bamboo_block'],
  logs: [...WOODS.flatMap((w) => [`${w}_log`, `${w}_wood`, `stripped_${w}_log`, `stripped_${w}_wood`]), 'crimson_stem', 'warped_stem', 'crimson_hyphae', 'warped_hyphae', 'stripped_crimson_stem', 'stripped_warped_stem', 'stripped_crimson_hyphae', 'stripped_warped_hyphae'],
  planks: ALL_WOODS.map((w) => `${w}_planks`),
  wool: DYES.map((d) => `${d}_wool`),
  wool_carpets: DYES.map((d) => `${d}_carpet`),
  beds: DYES.map((d) => `${d}_bed`),
  terracotta: ['terracotta', ...DYES.map((d) => `${d}_terracotta`)],
  small_flowers: ['dandelion', 'poppy', 'blue_orchid', 'allium', 'azure_bluet', 'red_tulip', 'orange_tulip', 'white_tulip', 'pink_tulip', 'oxeye_daisy', 'cornflower', 'lily_of_the_valley', 'wither_rose', 'torchflower'],
  saplings: [...WOODS.map((w) => `${w}_sapling`), 'mangrove_propagule', 'azalea', 'flowering_azalea'],
  leaves: [...WOODS.map((w) => `${w}_leaves`), 'azalea_leaves', 'flowering_azalea_leaves'],
  sand: ['sand', 'red_sand', 'suspicious_sand'],
  smelts_to_glass: ['sand', 'red_sand'],
  candles: ['candle', ...DYES.map((d) => `${d}_candle`)],
  boats: [...ALL_WOODS.filter((w) => w !== 'crimson' && w !== 'warped' && w !== 'bamboo').map((w) => `${w}_boat`), 'bamboo_raft'],
  stone_bricks: ['stone_bricks', 'mossy_stone_bricks', 'cracked_stone_bricks', 'chiseled_stone_bricks'],
  stone_buttons: ['stone_button', 'polished_blackstone_button'],
  quartz_blocks: ['quartz_block', 'chiseled_quartz_block', 'quartz_pillar', 'quartz_bricks', 'smooth_quartz'],
  arrows: ['arrow', 'tipped_arrow', 'spectral_arrow'],
  decorated_pot_sherds: ['brick'],
  trim_materials: ['iron_ingot', 'copper_ingot', 'gold_ingot', 'lapis_lazuli', 'emerald', 'diamond', 'netherite_ingot', 'redstone', 'quartz', 'amethyst_shard'],
  dyes: DYES.map((d) => `${d}_dye`),
};
for (const w of ALL_WOODS) {
  if (w === 'crimson' || w === 'warped') TAG_TABLE[`${w}_stems`] = [`${w}_stem`, `${w}_hyphae`, `stripped_${w}_stem`, `stripped_${w}_hyphae`];
  else if (w === 'bamboo') TAG_TABLE['bamboo_blocks'] = ['bamboo_block', 'stripped_bamboo_block'];
  else TAG_TABLE[`${w}_logs`] = [`${w}_log`, `${w}_wood`, `stripped_${w}_log`, `stripped_${w}_wood`];
}

/** Register / extend an item tag (other workstreams). */
export function addItemTag(tag: string, items: string[]) {
  const t = (TAG_TABLE[tag] ??= []);
  for (const i of items) if (!t.includes(i)) t.push(i);
  tagCache.clear();
}

let cacheSize = -1;
const tagCache = new Map<string, Set<ItemDef>>();

function refreshCache() {
  if (cacheSize !== ITEMS.length) {
    cacheSize = ITEMS.length;
    tagCache.clear();
  }
}

/** Items carrying a tag. */
export function tagItems(tag: string): Set<ItemDef> {
  refreshCache();
  let s = tagCache.get(tag);
  if (s) return s;
  s = new Set();
  for (const it of ITEMS) {
    if (it.tags.includes(tag)) s.add(it);
    else if (it.block) {
      const b = BLOCK_BY_NAME.get(it.block);
      if (b && b.tags.includes(tag)) s.add(it);
    }
  }
  for (const n of TAG_TABLE[tag] ?? []) {
    const it = ITEM_BY_NAME.get(n);
    if (it) s.add(it);
  }
  tagCache.set(tag, s);
  return s;
}

export function itemHasTag(item: ItemDef, tag: string): boolean {
  return tagItems(tag).has(item);
}

/** Resolve an ingredient to the set of matching items (empty set = unresolvable). */
export function resolveIngredient(ing: Ingredient): Set<ItemDef> {
  const out = new Set<ItemDef>();
  const list = Array.isArray(ing) ? ing : [ing];
  for (const e of list) {
    if (e.startsWith('#')) for (const it of tagItems(e.slice(1))) out.add(it);
    else {
      const it = ITEM_BY_NAME.get(e);
      if (it) out.add(it);
    }
  }
  return out;
}

/** Wood type of a wooden item name (`oak_planks` -> 'oak'). */
export function woodOf(name: string): string | null {
  for (const w of ['dark_oak', ...ALL_WOODS]) if (name.startsWith(w + '_') || name.startsWith('stripped_' + w + '_')) return w;
  return null;
}
