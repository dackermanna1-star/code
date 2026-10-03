/**
 * Items used by mobs (drops, foods, interaction tools). Registered only if missing so the items
 * workstream's definitions always win (registerItem() merges into an existing definition).
 */
import { registerItem, tryItem, stack, type ItemDef, type ItemProps, type ItemStack } from '../../game/items/registry';

export function ensureItem(name: string, props: ItemProps = {}): ItemDef {
  return tryItem(name) ?? registerItem(name, props);
}

const food = (hunger: number, saturation: number, extra: Partial<ItemProps['food']> = {}): ItemProps => ({ category: 'food', food: { hunger, saturation, ...extra } as any });

export function ensureMobItems() {
  ensureItem('rotten_flesh', food(4, 0.1, { effects: [{ effect: 'hunger', duration: 600, amplifier: 0, chance: 0.8 }] }));
  ensureItem('bone', { category: 'ingredients' });
  ensureItem('bone_meal', { category: 'ingredients' });
  ensureItem('arrow', { category: 'combat' });
  ensureItem('tipped_arrow', { category: 'combat' });
  ensureItem('bow', { durability: 384, category: 'combat', maxStack: 1 });
  ensureItem('gunpowder', { category: 'ingredients' });
  ensureItem('string', { category: 'ingredients' });
  ensureItem('spider_eye', food(2, 0.4, { effects: [{ effect: 'poison', duration: 100, amplifier: 0, chance: 1 }] }));
  ensureItem('ender_pearl', { category: 'misc', maxStack: 16 });
  ensureItem('leather', { category: 'ingredients' });
  ensureItem('beef', food(3, 0.3));
  ensureItem('cooked_beef', food(8, 0.8));
  ensureItem('porkchop', food(3, 0.3));
  ensureItem('cooked_porkchop', food(8, 0.8));
  ensureItem('mutton', food(2, 0.3));
  ensureItem('cooked_mutton', food(6, 0.8));
  ensureItem('chicken', food(2, 0.3, { effects: [{ effect: 'hunger', duration: 600, amplifier: 0, chance: 0.3 }] }));
  ensureItem('cooked_chicken', food(6, 0.6));
  ensureItem('feather', { category: 'ingredients' });
  ensureItem('egg', { category: 'misc', maxStack: 16 });
  ensureItem('cod', food(2, 0.1));
  ensureItem('cooked_cod', food(5, 0.6));
  ensureItem('salmon', food(2, 0.1));
  ensureItem('cooked_salmon', food(6, 0.8));
  ensureItem('ink_sac', { category: 'ingredients' });
  ensureItem('slime_ball', { category: 'ingredients' });
  ensureItem('magma_cream', { category: 'brewing' });
  ensureItem('blaze_rod', { category: 'ingredients', fuel: 2400 });
  ensureItem('ghast_tear', { category: 'brewing' });
  ensureItem('gold_nugget', { category: 'ingredients' });
  ensureItem('gold_ingot', { category: 'ingredients' });
  ensureItem('iron_ingot', { category: 'ingredients' });
  ensureItem('copper_ingot', { category: 'ingredients' });
  ensureItem('emerald', { category: 'ingredients' });
  ensureItem('carrot', food(3, 0.6));
  ensureItem('potato', food(1, 0.3));
  ensureItem('wheat', { category: 'ingredients' });
  ensureItem('wheat_seeds', { category: 'ingredients' });
  ensureItem('bucket', { category: 'misc', maxStack: 16 });
  ensureItem('milk_bucket', { category: 'food', maxStack: 1 });
  ensureItem('glass_bottle', { category: 'brewing' });
  ensureItem('glowstone_dust', { category: 'ingredients' });
  ensureItem('redstone', { category: 'redstone' });
  ensureItem('sugar', { category: 'ingredients' });
  ensureItem('trident', { durability: 250, category: 'combat', maxStack: 1, attackDamage: 8, attackSpeed: 1.1 });
  ensureItem('golden_sword', { durability: 32, category: 'combat', maxStack: 1, attackDamage: 3, attackSpeed: 1.6 });
  ensureItem('dragon_breath', { category: 'brewing' });
  ensureItem('saddle', { category: 'transport', maxStack: 1 });
  ensureItem('lead', { category: 'tools' });
  ensureItem('name_tag', { category: 'tools' });
  ensureItem('beetroot', food(1, 0.6));
  ensureItem('beetroot_seeds', { category: 'ingredients' });
  ensureItem('melon_seeds', { category: 'ingredients' });
  ensureItem('pumpkin_seeds', { category: 'ingredients' });
  ensureItem('book', { category: 'misc' });
  ensureItem('paper', { category: 'misc' });
  ensureItem('bread', food(5, 0.6));
  ensureItem('coal', { category: 'ingredients', fuel: 1600 });
  ensureItem('flint', { category: 'ingredients' });
  ensureItem('clay_ball', { category: 'ingredients' });
  ensureItem('ender_eye', { category: 'misc' });
  for (const c of ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black']) ensureItem(`${c}_dye`, { category: 'ingredients' });
}

/** Stack by name (null if the item doesn't exist). */
export function mkStack(name: string, count = 1): ItemStack | null {
  const it = tryItem(name);
  return it && count > 0 ? stack(it, count) : null;
}

export const MEATS = ['beef', 'cooked_beef', 'porkchop', 'cooked_porkchop', 'mutton', 'cooked_mutton', 'chicken', 'cooked_chicken', 'rotten_flesh', 'rabbit', 'cooked_rabbit'];
