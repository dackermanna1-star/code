/**
 * Brewing (port of PotionBrewing + BrewingStandBlockEntity): potion mixes, container mixes
 * (potion -> splash via gunpowder, splash -> lingering via dragon's breath), blaze powder fuel
 * (20 brews), 400 tick brew time.
 */
import { ITEM_BY_NAME, type ItemStack } from '../items/registry';
import { potionOf } from './potions';
import type { SlotStorage } from '../containers/storage';

/** [from potion, ingredient item, to potion] */
export const POTION_MIXES: [string, string, string][] = [];
const mix = (from: string, ing: string, to: string) => POTION_MIXES.push([from, ing, to]);

for (const ing of ['glistering_melon_slice', 'ghast_tear', 'rabbit_foot', 'blaze_powder', 'spider_eye', 'sugar', 'magma_cream', 'redstone']) mix('water', ing, 'mundane');
mix('water', 'glowstone_dust', 'thick');
mix('water', 'nether_wart', 'awkward');
mix('awkward', 'golden_carrot', 'night_vision');
mix('night_vision', 'redstone', 'long_night_vision');
mix('night_vision', 'fermented_spider_eye', 'invisibility');
mix('long_night_vision', 'fermented_spider_eye', 'long_invisibility');
mix('invisibility', 'redstone', 'long_invisibility');
mix('awkward', 'magma_cream', 'fire_resistance');
mix('fire_resistance', 'redstone', 'long_fire_resistance');
mix('awkward', 'rabbit_foot', 'leaping');
mix('leaping', 'redstone', 'long_leaping');
mix('leaping', 'glowstone_dust', 'strong_leaping');
mix('leaping', 'fermented_spider_eye', 'slowness');
mix('long_leaping', 'fermented_spider_eye', 'long_slowness');
mix('slowness', 'redstone', 'long_slowness');
mix('slowness', 'glowstone_dust', 'strong_slowness');
mix('awkward', 'turtle_helmet', 'turtle_master');
mix('turtle_master', 'redstone', 'long_turtle_master');
mix('turtle_master', 'glowstone_dust', 'strong_turtle_master');
mix('swiftness', 'fermented_spider_eye', 'slowness');
mix('long_swiftness', 'fermented_spider_eye', 'long_slowness');
mix('awkward', 'sugar', 'swiftness');
mix('swiftness', 'redstone', 'long_swiftness');
mix('swiftness', 'glowstone_dust', 'strong_swiftness');
mix('awkward', 'pufferfish', 'water_breathing');
mix('water_breathing', 'redstone', 'long_water_breathing');
mix('awkward', 'glistering_melon_slice', 'healing');
mix('healing', 'glowstone_dust', 'strong_healing');
mix('healing', 'fermented_spider_eye', 'harming');
mix('strong_healing', 'fermented_spider_eye', 'strong_harming');
mix('harming', 'glowstone_dust', 'strong_harming');
mix('poison', 'fermented_spider_eye', 'harming');
mix('long_poison', 'fermented_spider_eye', 'harming');
mix('strong_poison', 'fermented_spider_eye', 'strong_harming');
mix('awkward', 'spider_eye', 'poison');
mix('poison', 'redstone', 'long_poison');
mix('poison', 'glowstone_dust', 'strong_poison');
mix('awkward', 'ghast_tear', 'regeneration');
mix('regeneration', 'redstone', 'long_regeneration');
mix('regeneration', 'glowstone_dust', 'strong_regeneration');
mix('awkward', 'blaze_powder', 'strength');
mix('strength', 'redstone', 'long_strength');
mix('strength', 'glowstone_dust', 'strong_strength');
mix('water', 'fermented_spider_eye', 'weakness');
mix('weakness', 'redstone', 'long_weakness');
mix('awkward', 'phantom_membrane', 'slow_falling');
mix('slow_falling', 'redstone', 'long_slow_falling');

/** [from item, ingredient, to item] */
export const CONTAINER_MIXES: [string, string, string][] = [
  ['potion', 'gunpowder', 'splash_potion'],
  ['splash_potion', 'dragon_breath', 'lingering_potion'],
];

export function registerPotionMix(from: string, ingredient: string, to: string) {
  POTION_MIXES.push([from, ingredient, to]);
}

const POTION_CONTAINERS = new Set(['potion', 'splash_potion', 'lingering_potion']);
export function isPotionContainer(s: ItemStack | null | undefined): boolean {
  return !!s && POTION_CONTAINERS.has(s.item.name);
}
/** Brewing stand bottle slots accept potions and glass bottles. */
export function isBottleSlotItem(s: ItemStack): boolean {
  return POTION_CONTAINERS.has(s.item.name) || s.item.name === 'glass_bottle';
}
export function isBrewingIngredient(s: ItemStack): boolean {
  const n = s.item.name;
  return POTION_MIXES.some((m) => m[1] === n) || CONTAINER_MIXES.some((m) => m[1] === n);
}
export function isBrewingFuel(s: ItemStack): boolean {
  return s.item.name === 'blaze_powder';
}

/** PotionBrewing.hasMix */
export function hasMix(input: ItemStack, ingredient: ItemStack): boolean {
  if (!isPotionContainer(input)) return false;
  const ing = ingredient.item.name;
  const p = potionOf(input);
  if (CONTAINER_MIXES.some(([from, i, to]) => from === input.item.name && i === ing && ITEM_BY_NAME.has(to))) return true;
  return POTION_MIXES.some(([from, i]) => from === p && i === ing);
}

/** PotionBrewing.mix: the result of brewing one bottle (unchanged if no mix applies). */
export function brewMix(ingredient: ItemStack, input: ItemStack): ItemStack {
  if (!isPotionContainer(input)) return input;
  const ing = ingredient.item.name;
  const p = potionOf(input);
  for (const [from, i, to] of CONTAINER_MIXES) {
    const toItem = ITEM_BY_NAME.get(to);
    if (from === input.item.name && i === ing && toItem) return { item: toItem, count: 1, damage: 0, data: { ...(input.data ?? {}), potion: p } };
  }
  for (const [from, i, to] of POTION_MIXES) {
    if (from === p && i === ing) return { item: input.item, count: 1, damage: 0, data: { ...(input.data ?? {}), potion: to } };
  }
  return input;
}

/** Brewing stand block entity data. */
export interface BrewingData {
  type: 'brewing_stand';
  /** 0-2 bottles, 3 ingredient, 4 fuel */
  items: any[];
  brewTime: number;
  fuel: number;
  /** Item id of the ingredient being brewed. */
  ingredient?: string;
}
export function newBrewingData(): BrewingData {
  return { type: 'brewing_stand', items: [null, null, null, null, null], brewTime: 0, fuel: 0 };
}
export const BREW_TIME = 400;

/** BrewingStandBlockEntity.isBrewable */
export function isBrewable(st: SlotStorage): boolean {
  const ing = st.get(3);
  if (!ing) return false;
  if (!isBrewingIngredient(ing)) return false;
  for (let i = 0; i < 3; i++) {
    const s = st.get(i);
    if (s && hasMix(s, ing)) return true;
  }
  return false;
}

export interface BrewTickResult {
  changed: boolean;
  brewed: boolean;
  /** Leftover container item (dragon's breath bottle) to drop when the ingredient slot is still occupied. */
  dropRemainder: ItemStack | null;
}

/** One 20 TPS brewing stand tick. */
export function tickBrewing(d: BrewingData, st: SlotStorage): BrewTickResult {
  const res: BrewTickResult = { changed: false, brewed: false, dropRemainder: null };
  const fuel = st.get(4);
  if (d.fuel <= 0 && fuel && isBrewingFuel(fuel)) {
    d.fuel = 20;
    fuel.count--;
    if (fuel.count <= 0) st.set(4, null);
    else st.changed(4);
    res.changed = true;
  }
  const brewable = isBrewable(st);
  const ing = st.get(3);
  if (d.brewTime > 0) {
    d.brewTime--;
    if (d.brewTime === 0 && brewable) {
      doBrew(st, res);
      res.brewed = true;
      res.changed = true;
    } else if (!brewable || !ing || ing.item.name !== d.ingredient) {
      d.brewTime = 0;
      res.changed = true;
    }
  } else if (brewable && d.fuel > 0) {
    d.fuel--;
    d.brewTime = BREW_TIME;
    d.ingredient = ing!.item.name;
    res.changed = true;
  }
  return res;
}

function doBrew(st: SlotStorage, res: BrewTickResult) {
  const ing = st.get(3)!;
  for (let i = 0; i < 3; i++) {
    const s = st.get(i);
    if (s) st.set(i, brewMix(ing, s));
  }
  const def = ing.item;
  ing.count--;
  const remainder = def.name === 'dragon_breath' ? ITEM_BY_NAME.get('glass_bottle') : null;
  if (ing.count <= 0) st.set(3, remainder ? { item: remainder, count: 1, damage: 0 } : null);
  else {
    st.changed(3);
    if (remainder) res.dropRemainder = { item: remainder, count: 1, damage: 0 };
  }
}
