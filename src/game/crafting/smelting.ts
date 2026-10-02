/**
 * Cooking recipes (furnace "smelting", blast furnace "blasting", smoker "smoking", campfire),
 * vanilla XP values and cook times, the fuel table, and the furnace block-entity tick logic
 * (port of AbstractFurnaceBlockEntity.serverTick).
 */
import { ITEMS, ITEM_BY_NAME, type ItemDef, type ItemStack } from '../items/registry';
import { resolveIngredient, itemHasTag, type Ingredient, ALL_WOODS, DYES } from './ingredients';
import { sameItemSameTags } from '../containers/stacks';
import type { SlotStorage } from '../containers/storage';

export type CookingKind = 'smelting' | 'blasting' | 'smoking' | 'campfire';
export type FurnaceKind = 'furnace' | 'blast_furnace' | 'smoker';
/** Which cooking recipe type each furnace block uses. */
export const FURNACE_RECIPE_TYPE: Record<FurnaceKind, CookingKind> = { furnace: 'smelting', blast_furnace: 'blasting', smoker: 'smoking' };

export interface CookingDef {
  input: Ingredient;
  result: string;
  count?: number;
  xp: number;
  /** 'food' recipes also exist for smoker+campfire; 'blasting' recipes also for the blast furnace. */
  cat: 'food' | 'ore' | 'misc';
  id?: string;
}

export interface CookingRecipe {
  id: string;
  kind: CookingKind;
  inputs: Set<ItemDef>;
  result: ItemDef;
  count: number;
  xp: number;
  cookTime: number;
}

const DEFS: CookingDef[] = [];
const def = (input: Ingredient, result: string, xp: number, cat: CookingDef['cat'] = 'misc', id?: string) => DEFS.push({ input, result, xp, cat, id });

// ores & raw metals (also blasting)
for (const [ore, res, xp] of [
  ['iron_ore', 'iron_ingot', 0.7], ['deepslate_iron_ore', 'iron_ingot', 0.7], ['raw_iron', 'iron_ingot', 0.7],
  ['gold_ore', 'gold_ingot', 1], ['deepslate_gold_ore', 'gold_ingot', 1], ['raw_gold', 'gold_ingot', 1], ['nether_gold_ore', 'gold_ingot', 1],
  ['copper_ore', 'copper_ingot', 0.7], ['deepslate_copper_ore', 'copper_ingot', 0.7], ['raw_copper', 'copper_ingot', 0.7],
  ['diamond_ore', 'diamond', 1], ['deepslate_diamond_ore', 'diamond', 1], ['emerald_ore', 'emerald', 1], ['deepslate_emerald_ore', 'emerald', 1],
  ['lapis_ore', 'lapis_lazuli', 0.2], ['deepslate_lapis_ore', 'lapis_lazuli', 0.2], ['redstone_ore', 'redstone', 0.7], ['deepslate_redstone_ore', 'redstone', 0.7],
  ['coal_ore', 'coal', 0.1], ['deepslate_coal_ore', 'coal', 0.1], ['nether_quartz_ore', 'quartz', 0.2], ['ancient_debris', 'netherite_scrap', 2],
] as [string, string, number][]) def(ore, res, xp, 'ore', `${res}_from_smelting_${ore}`);
// tool/armour salvage (also blasting)
def(['iron_pickaxe', 'iron_shovel', 'iron_axe', 'iron_hoe', 'iron_sword', 'iron_helmet', 'iron_chestplate', 'iron_leggings', 'iron_boots', 'iron_horse_armor', 'chainmail_helmet', 'chainmail_chestplate', 'chainmail_leggings', 'chainmail_boots'], 'iron_nugget', 0.1, 'ore');
def(['golden_pickaxe', 'golden_shovel', 'golden_axe', 'golden_hoe', 'golden_sword', 'golden_helmet', 'golden_chestplate', 'golden_leggings', 'golden_boots', 'golden_horse_armor'], 'gold_nugget', 0.1, 'ore');
// food (also smoking + campfire)
for (const [raw, cooked] of [['beef', 'cooked_beef'], ['porkchop', 'cooked_porkchop'], ['mutton', 'cooked_mutton'], ['chicken', 'cooked_chicken'], ['rabbit', 'cooked_rabbit'], ['cod', 'cooked_cod'], ['salmon', 'cooked_salmon'], ['potato', 'baked_potato']]) def(raw, cooked, 0.35, 'food');
def('kelp', 'dried_kelp', 0.1, 'food');
// blocks & misc (furnace only)
def('#smelts_to_glass', 'glass', 0.1);
def('cobblestone', 'stone', 0.1);
def('stone', 'smooth_stone', 0.1);
def('sandstone', 'smooth_sandstone', 0.1);
def('red_sandstone', 'smooth_red_sandstone', 0.1);
def('quartz_block', 'smooth_quartz', 0.1);
def('basalt', 'smooth_basalt', 0.1);
def('stone_bricks', 'cracked_stone_bricks', 0.1);
def('deepslate_bricks', 'cracked_deepslate_bricks', 0.1);
def('deepslate_tiles', 'cracked_deepslate_tiles', 0.1);
def('nether_bricks', 'cracked_nether_bricks', 0.1);
def('polished_blackstone_bricks', 'cracked_polished_blackstone_bricks', 0.1);
def('cobbled_deepslate', 'deepslate', 0.1);
def('clay_ball', 'brick', 0.3);
def('clay', 'terracotta', 0.35);
def('netherrack', 'nether_brick', 0.1);
def('#logs_that_burn', 'charcoal', 0.15);
def('cactus', 'green_dye', 1);
def('sea_pickle', 'lime_dye', 0.1);
def('wet_sponge', 'sponge', 0.15);
def('chorus_fruit', 'popped_chorus_fruit', 0.1);
for (const c of DYES) def(`${c}_terracotta`, `${c}_glazed_terracotta`, 0.1);

export function cookingDefs(): readonly CookingDef[] {
  return DEFS;
}
export function registerCookingRecipe(d: CookingDef) {
  DEFS.push(d);
  compiledAt = -1;
}

const BASE_TIME: Record<CookingKind, number> = { smelting: 200, blasting: 100, smoking: 100, campfire: 600 };

let compiled: Record<CookingKind, CookingRecipe[]> = { smelting: [], blasting: [], smoking: [], campfire: [] };
let compiledAt = -1;
let compiledDefs = -1;
function compile() {
  const n = ITEMS.length;
  if (compiledAt === n && compiledDefs === DEFS.length) return;
  compiledAt = n;
  compiledDefs = DEFS.length;
  compiled = { smelting: [], blasting: [], smoking: [], campfire: [] };
  DEFS.forEach((d, i) => {
    const result = ITEM_BY_NAME.get(d.result);
    const inputs = resolveIngredient(d.input);
    if (!result || !inputs.size) return;
    const id = d.id ?? `${d.result}_from_${Array.isArray(d.input) ? 'group' : d.input}#${i}`;
    const push = (kind: CookingKind) => compiled[kind].push({ id, kind, inputs, result, count: d.count ?? 1, xp: d.xp, cookTime: BASE_TIME[kind] });
    push('smelting');
    if (d.cat === 'ore') push('blasting');
    if (d.cat === 'food') {
      push('smoking');
      push('campfire');
    }
  });
}

/** Find the cooking recipe for an input item. */
export function findCookingRecipe(kind: CookingKind, input: ItemStack | ItemDef | null | undefined): CookingRecipe | null {
  if (!input) return null;
  compile();
  const it = 'item' in input ? input.item : input;
  for (const r of compiled[kind]) if (r.inputs.has(it)) return r;
  return null;
}
export function allCookingRecipes(kind: CookingKind): CookingRecipe[] {
  compile();
  return compiled[kind];
}

// ------------------------------------------------------------------------------------ fuel
const FUEL_BY_NAME: Record<string, number> = {
  lava_bucket: 20000, coal_block: 16000, dried_kelp_block: 4001, blaze_rod: 2400, coal: 1600, charcoal: 1600,
  stick: 100, bowl: 100, bamboo: 50, scaffolding: 50, dead_bush: 100, azalea: 100, flowering_azalea: 100, mangrove_roots: 300,
  crafting_table: 300, cartography_table: 300, fletching_table: 300, smithing_table: 300, loom: 300, bookshelf: 300, chiseled_bookshelf: 300,
  lectern: 300, jukebox: 300, chest: 300, trapped_chest: 300, barrel: 300, composter: 300, daylight_detector: 300, note_block: 300, ladder: 300,
  bow: 300, crossbow: 300, fishing_rod: 300, wooden_pickaxe: 200, wooden_axe: 200, wooden_shovel: 200, wooden_hoe: 200, wooden_sword: 200,
  bamboo_mosaic: 300, bamboo_mosaic_slab: 150, bamboo_mosaic_stairs: 300, bamboo_block: 300, stripped_bamboo_block: 300,
};
/** Burn time in ticks for a furnace (0 = not fuel). Blast furnaces and smokers burn fuel twice as fast. */
export function fuelTicks(s: ItemStack | ItemDef | null | undefined): number {
  if (!s) return 0;
  const it = 'item' in s ? s.item : s;
  const n = it.name;
  if (FUEL_BY_NAME[n] !== undefined) return FUEL_BY_NAME[n];
  // nether woods don't burn
  if (n.startsWith('crimson_') || n.startsWith('warped_') || n.startsWith('stripped_crimson') || n.startsWith('stripped_warped')) return 0;
  if (itemHasTag(it, 'logs') || itemHasTag(it, 'planks') || itemHasTag(it, 'logs_that_burn')) return 300;
  if (itemHasTag(it, 'wooden_slabs')) return 150;
  if (itemHasTag(it, 'wooden_stairs') || itemHasTag(it, 'wooden_fences') || itemHasTag(it, 'fence_gates') || itemHasTag(it, 'wooden_trapdoors') || itemHasTag(it, 'wooden_pressure_plates')) return 300;
  if (n.endsWith('_fence_gate') && ALL_WOODS.some((w) => n.startsWith(w))) return 300;
  if (itemHasTag(it, 'wooden_doors') || n.endsWith('_sign')) return n.endsWith('_hanging_sign') ? 800 : 200;
  if (itemHasTag(it, 'wooden_buttons') || itemHasTag(it, 'saplings') || itemHasTag(it, 'wool')) return 100;
  if (itemHasTag(it, 'wool_carpets')) return 67;
  if (itemHasTag(it, 'boats') || n.endsWith('_chest_boat') || n.endsWith('_raft')) return 1200;
  if (n.endsWith('_banner')) return 300;
  return it.fuel ?? 0;
}
export function isFuel(s: ItemStack | ItemDef | null | undefined): boolean {
  return fuelTicks(s) > 0;
}

// ------------------------------------------------------------------------------------ furnace logic
/** Plain block-entity data of a furnace (stored in world block entities). */
export interface FurnaceData {
  type: FurnaceKind;
  items: any[];
  /** Remaining burn ticks of the current fuel, and its total. */
  burn: number;
  burnMax: number;
  /** Cooking progress and total for the current input. */
  cook: number;
  cookMax: number;
  /** Accumulated (fractional) XP awarded when the output is taken. */
  xp: number;
}

export function newFurnaceData(type: FurnaceKind): FurnaceData {
  return { type, items: [null, null, null], burn: 0, burnMax: 0, cook: 0, cookMax: type === 'furnace' ? 200 : 100, xp: 0 };
}

export const SLOT_INPUT = 0, SLOT_FUEL = 1, SLOT_RESULT = 2;

export interface FurnaceTickResult {
  changed: boolean;
  litChanged: boolean;
  lit: boolean;
  smelted: { input: ItemDef; output: ItemStack } | null;
}

function canBurn(r: CookingRecipe | null, st: SlotStorage): boolean {
  if (!r || !st.get(SLOT_INPUT)) return false;
  const out = st.get(SLOT_RESULT);
  if (!out) return true;
  if (out.item !== r.result || out.damage || out.ench || out.data) return false;
  const max = Math.min(st.maxStackSize ?? 64, out.item.maxStack);
  return out.count + r.count <= max;
}

/** Cook time for the current input (recipe based). */
export function furnaceCookTime(type: FurnaceKind, st: SlotStorage): number {
  const r = findCookingRecipe(FURNACE_RECIPE_TYPE[type], st.get(SLOT_INPUT));
  return r?.cookTime ?? (type === 'furnace' ? 200 : 100);
}

/** One 20 TPS furnace tick (mutates `data` and the storage). */
export function tickFurnace(data: FurnaceData, st: SlotStorage): FurnaceTickResult {
  const kind = FURNACE_RECIPE_TYPE[data.type] ?? 'smelting';
  const wasLit = data.burn > 0;
  let changed = false;
  let smelted: FurnaceTickResult['smelted'] = null;
  if (data.burn > 0) data.burn--;
  const fuel = st.get(SLOT_FUEL);
  const input = st.get(SLOT_INPUT);
  if (data.burn > 0 || (fuel && input)) {
    const r = input ? findCookingRecipe(kind, input) : null;
    if (data.burn <= 0 && canBurn(r, st)) {
      const ticks = fuelTicks(fuel);
      data.burn = data.type === 'furnace' ? ticks : Math.floor(ticks / 2);
      data.burnMax = data.burn;
      if (data.burn > 0) {
        changed = true;
        if (fuel) {
          const def = fuel.item;
          fuel.count--;
          if (fuel.count <= 0) {
            const rem = def.name === 'lava_bucket' ? ITEM_BY_NAME.get('bucket') : null;
            st.set(SLOT_FUEL, rem ? { item: rem, count: 1, damage: 0 } : null);
          } else st.changed(SLOT_FUEL);
        }
      }
    }
    if (data.burn > 0 && canBurn(r, st)) {
      data.cookMax = r!.cookTime;
      data.cook++;
      if (data.cook >= data.cookMax) {
        data.cook = 0;
        data.cookMax = r!.cookTime;
        // burn(): move result, consume input
        const inp = st.get(SLOT_INPUT)!;
        const out = st.get(SLOT_RESULT);
        if (!out) st.set(SLOT_RESULT, { item: r!.result, count: r!.count, damage: 0 });
        else {
          out.count += r!.count;
          st.changed(SLOT_RESULT);
        }
        // wet sponge + empty bucket in the fuel slot -> water bucket
        if (inp.item.name === 'wet_sponge') {
          const f = st.get(SLOT_FUEL);
          const wb = ITEM_BY_NAME.get('water_bucket');
          if (f && f.item.name === 'bucket' && wb) st.set(SLOT_FUEL, { item: wb, count: 1, damage: 0 });
        }
        smelted = { input: inp.item, output: { item: r!.result, count: r!.count, damage: 0 } };
        inp.count--;
        if (inp.count <= 0) st.set(SLOT_INPUT, null);
        else st.changed(SLOT_INPUT);
        data.xp += r!.xp;
        changed = true;
      }
    } else {
      data.cook = 0;
    }
  } else if (data.burn <= 0 && data.cook > 0) {
    data.cook = Math.max(0, Math.min(data.cookMax, data.cook - 2));
  }
  const lit = data.burn > 0;
  return { changed, litChanged: wasLit !== lit, lit, smelted };
}

/** Called when the input slot changes to a different item (vanilla resets progress). */
export function furnaceInputChanged(data: FurnaceData, st: SlotStorage, prev: ItemStack | null) {
  const cur = st.get(SLOT_INPUT);
  const same = !!prev && !!cur && sameItemSameTags(prev, { ...cur, count: prev.count });
  if (!same) {
    data.cookMax = furnaceCookTime(data.type, st);
    data.cook = 0;
  }
}

/** XP to award for `xp` accumulated recipe experience (fraction becomes a probability). */
export function rollFurnaceXp(xp: number, rand = Math.random): number {
  let n = Math.floor(xp);
  const f = xp - n;
  if (f > 0 && rand() < f) n++;
  return n;
}

/** Items accepted by the furnace input slot (anything; vanilla allows any item). */
export function canSmelt(kind: FurnaceKind, s: ItemStack): boolean {
  return !!findCookingRecipe(FURNACE_RECIPE_TYPE[kind], s);
}
