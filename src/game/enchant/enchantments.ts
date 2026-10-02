/**
 * Enchantment registry (vanilla Java 1.20 data: max level, rarity weight, applicable item
 * categories, treasure/curse flags, incompatibilities, min/max enchanting power per level),
 * item classification, and the vanilla enchantment selection algorithm (EnchantmentHelper)
 * driven by a java.util.Random-compatible LCG.
 *
 * Stack enchantments live in `stack.ench` as `{ id: level }` (ids as below, e.g. `sharpness`).
 * Enchanted books store theirs in `ench` too (item `enchanted_book`).
 */
import type { ItemDef, ItemStack } from '../items/registry';

export type EnchCategory =
  | 'armor' | 'armor_feet' | 'armor_legs' | 'armor_chest' | 'armor_head' | 'weapon' | 'digger' | 'fishing_rod'
  | 'trident' | 'breakable' | 'bow' | 'wearable' | 'crossbow' | 'vanishable';

export interface EnchantmentDef {
  id: string;
  name: string;
  maxLevel: number;
  /** Rarity weight: 10 common, 5 uncommon, 2 rare, 1 very rare. */
  weight: number;
  category: EnchCategory;
  treasure?: boolean;
  curse?: boolean;
  /** Can be found on the enchanting table / random loot (vanilla isDiscoverable). */
  discoverable?: boolean;
  /** Mutually exclusive enchantments (beyond the shared `group`). */
  incompatible?: string[];
  /** Enchantments sharing a group are mutually exclusive (protection, damage ...). */
  group?: string;
  minCost(level: number): number;
  maxCost(level: number): number;
  /** Extra items accepted on the anvil (axes for sharpness, shears for efficiency ...). */
  anvilExtra?: (it: ItemDef) => boolean;
}

const baseMin = (l: number) => 1 + l * 10;

const E: EnchantmentDef[] = [];
const reg = (d: EnchantmentDef) => {
  if (d.discoverable === undefined) d.discoverable = true;
  E.push(d);
};
const prot = (id: string, name: string, w: number, min: number, per: number, cat: EnchCategory = 'armor') =>
  reg({ id, name, maxLevel: 4, weight: w, category: cat, group: id === 'feather_falling' ? undefined : 'protection', minCost: (l) => min + (l - 1) * per, maxCost: (l) => min + (l - 1) * per + per });

// Order follows BuiltInRegistries.ENCHANTMENT (affects table rolls).
prot('protection', 'Protection', 10, 1, 11);
prot('fire_protection', 'Fire Protection', 5, 10, 8);
prot('feather_falling', 'Feather Falling', 5, 5, 6, 'armor_feet');
prot('blast_protection', 'Blast Protection', 2, 5, 8);
prot('projectile_protection', 'Projectile Protection', 5, 3, 6);
reg({ id: 'respiration', name: 'Respiration', maxLevel: 3, weight: 2, category: 'armor_head', minCost: (l) => 10 * l, maxCost: (l) => 10 * l + 30 });
reg({ id: 'aqua_affinity', name: 'Aqua Affinity', maxLevel: 1, weight: 2, category: 'armor_head', minCost: () => 1, maxCost: () => 41 });
reg({ id: 'thorns', name: 'Thorns', maxLevel: 3, weight: 1, category: 'armor_chest', minCost: (l) => 10 + 20 * (l - 1), maxCost: (l) => baseMin(l) + 50, anvilExtra: (it) => !!it.armor });
reg({ id: 'depth_strider', name: 'Depth Strider', maxLevel: 3, weight: 2, category: 'armor_feet', incompatible: ['frost_walker'], minCost: (l) => l * 10, maxCost: (l) => l * 10 + 15 });
reg({ id: 'frost_walker', name: 'Frost Walker', maxLevel: 2, weight: 2, category: 'armor_feet', treasure: true, incompatible: ['depth_strider'], minCost: (l) => l * 10, maxCost: (l) => l * 10 + 15 });
reg({ id: 'binding_curse', name: 'Curse of Binding', maxLevel: 1, weight: 1, category: 'wearable', treasure: true, curse: true, minCost: () => 25, maxCost: () => 50 });
reg({ id: 'soul_speed', name: 'Soul Speed', maxLevel: 3, weight: 1, category: 'armor_feet', treasure: true, discoverable: false, minCost: (l) => l * 10, maxCost: (l) => l * 10 + 15 });
reg({ id: 'swift_sneak', name: 'Swift Sneak', maxLevel: 3, weight: 1, category: 'armor_legs', treasure: true, discoverable: false, minCost: (l) => l * 25, maxCost: (l) => l * 25 + 50 });
const dmg = (id: string, name: string, w: number, min: number, per: number) =>
  reg({ id, name, maxLevel: 5, weight: w, category: 'weapon', group: 'damage', minCost: (l) => min + (l - 1) * per, maxCost: (l) => min + (l - 1) * per + 20, anvilExtra: (it) => it.tool?.type === 'axe' });
dmg('sharpness', 'Sharpness', 10, 1, 11);
dmg('smite', 'Smite', 5, 5, 8);
dmg('bane_of_arthropods', 'Bane of Arthropods', 5, 5, 8);
reg({ id: 'knockback', name: 'Knockback', maxLevel: 2, weight: 5, category: 'weapon', minCost: (l) => 5 + 20 * (l - 1), maxCost: (l) => baseMin(l) + 50 });
reg({ id: 'fire_aspect', name: 'Fire Aspect', maxLevel: 2, weight: 2, category: 'weapon', minCost: (l) => 10 + 20 * (l - 1), maxCost: (l) => baseMin(l) + 50 });
reg({ id: 'looting', name: 'Looting', maxLevel: 3, weight: 2, category: 'weapon', minCost: (l) => 15 + (l - 1) * 9, maxCost: (l) => baseMin(l) + 50 });
reg({ id: 'sweeping_edge', name: 'Sweeping Edge', maxLevel: 3, weight: 2, category: 'weapon', minCost: (l) => 5 + (l - 1) * 9, maxCost: (l) => 5 + (l - 1) * 9 + 15 });
reg({ id: 'efficiency', name: 'Efficiency', maxLevel: 5, weight: 10, category: 'digger', minCost: (l) => 1 + 10 * (l - 1), maxCost: (l) => baseMin(l) + 50, anvilExtra: (it) => it.name === 'shears' });
reg({ id: 'silk_touch', name: 'Silk Touch', maxLevel: 1, weight: 1, category: 'digger', incompatible: ['fortune'], minCost: () => 15, maxCost: (l) => baseMin(l) + 50 });
reg({ id: 'unbreaking', name: 'Unbreaking', maxLevel: 3, weight: 5, category: 'breakable', minCost: (l) => 5 + (l - 1) * 8, maxCost: (l) => baseMin(l) + 50 });
reg({ id: 'fortune', name: 'Fortune', maxLevel: 3, weight: 2, category: 'digger', incompatible: ['silk_touch'], minCost: (l) => 15 + (l - 1) * 9, maxCost: (l) => baseMin(l) + 50 });
reg({ id: 'power', name: 'Power', maxLevel: 5, weight: 10, category: 'bow', minCost: (l) => 1 + (l - 1) * 10, maxCost: (l) => 1 + (l - 1) * 10 + 15 });
reg({ id: 'punch', name: 'Punch', maxLevel: 2, weight: 2, category: 'bow', minCost: (l) => 12 + (l - 1) * 20, maxCost: (l) => 12 + (l - 1) * 20 + 25 });
reg({ id: 'flame', name: 'Flame', maxLevel: 1, weight: 2, category: 'bow', minCost: () => 20, maxCost: () => 50 });
reg({ id: 'infinity', name: 'Infinity', maxLevel: 1, weight: 1, category: 'bow', incompatible: ['mending'], minCost: () => 20, maxCost: () => 50 });
reg({ id: 'luck_of_the_sea', name: 'Luck of the Sea', maxLevel: 3, weight: 2, category: 'fishing_rod', minCost: (l) => 15 + (l - 1) * 9, maxCost: (l) => baseMin(l) + 50 });
reg({ id: 'lure', name: 'Lure', maxLevel: 3, weight: 2, category: 'fishing_rod', minCost: (l) => 15 + (l - 1) * 9, maxCost: (l) => baseMin(l) + 50 });
reg({ id: 'loyalty', name: 'Loyalty', maxLevel: 3, weight: 5, category: 'trident', incompatible: ['riptide'], minCost: (l) => 5 + l * 7, maxCost: () => 50 });
reg({ id: 'impaling', name: 'Impaling', maxLevel: 5, weight: 2, category: 'trident', minCost: (l) => 1 + (l - 1) * 8, maxCost: (l) => 1 + (l - 1) * 8 + 20 });
reg({ id: 'riptide', name: 'Riptide', maxLevel: 3, weight: 2, category: 'trident', incompatible: ['loyalty', 'channeling'], minCost: (l) => 10 + l * 7, maxCost: () => 50 });
reg({ id: 'channeling', name: 'Channeling', maxLevel: 1, weight: 1, category: 'trident', incompatible: ['riptide'], minCost: () => 25, maxCost: () => 50 });
reg({ id: 'multishot', name: 'Multishot', maxLevel: 1, weight: 2, category: 'crossbow', incompatible: ['piercing'], minCost: () => 20, maxCost: () => 50 });
reg({ id: 'quick_charge', name: 'Quick Charge', maxLevel: 3, weight: 5, category: 'crossbow', minCost: (l) => 12 + (l - 1) * 20, maxCost: () => 50 });
reg({ id: 'piercing', name: 'Piercing', maxLevel: 4, weight: 10, category: 'crossbow', incompatible: ['multishot'], minCost: (l) => 1 + (l - 1) * 10, maxCost: () => 50 });
reg({ id: 'mending', name: 'Mending', maxLevel: 1, weight: 2, category: 'breakable', treasure: true, incompatible: ['infinity'], minCost: (l) => l * 25, maxCost: (l) => l * 25 + 50 });
reg({ id: 'vanishing_curse', name: 'Curse of Vanishing', maxLevel: 1, weight: 1, category: 'vanishable', treasure: true, curse: true, minCost: () => 25, maxCost: () => 50 });

export const ENCHANTMENTS: readonly EnchantmentDef[] = E;
export const ENCHANTMENT_BY_ID = new Map<string, EnchantmentDef>(E.map((e) => [e.id, e]));
/** Older / alternative ids accepted when reading stacks. */
export const ENCHANT_ALIASES: Record<string, string> = { sweeping: 'sweeping_edge' };

export function enchantmentDef(id: string): EnchantmentDef | undefined {
  return ENCHANTMENT_BY_ID.get(id) ?? ENCHANTMENT_BY_ID.get(ENCHANT_ALIASES[id] ?? '');
}
export function isCurse(id: string) {
  return !!enchantmentDef(id)?.curse;
}

/** Register an extra enchantment (other workstreams). */
export function registerEnchantment(d: EnchantmentDef) {
  if (d.discoverable === undefined) d.discoverable = true;
  E.push(d);
  ENCHANTMENT_BY_ID.set(d.id, d);
}

export function compatible(a: string, b: string): boolean {
  if (a === b) return false;
  const da = enchantmentDef(a), db = enchantmentDef(b);
  if (!da || !db) return true;
  if (da.group && da.group === db.group) return false;
  if (da.incompatible?.includes(db.id) || db.incompatible?.includes(da.id)) return false;
  return true;
}

// ------------------------------------------------------------------------------------ items
const ARMOR_ENCHANTABILITY: Record<string, number> = { leather: 15, chainmail: 12, iron: 9, golden: 25, gold: 25, diamond: 10, netherite: 15, turtle: 9 };

export function isBook(it: ItemDef) {
  return it.name === 'book';
}

/** Item enchantability (Item.getEnchantmentValue). */
export function enchantability(it: ItemDef): number {
  if (it.enchantability > 0) return it.enchantability;
  if (it.armor) return ARMOR_ENCHANTABILITY[it.armor.material] ?? ARMOR_ENCHANTABILITY[it.name.split('_')[0]] ?? 9;
  const n = it.name;
  if (n === 'book' || n === 'bow' || n === 'crossbow' || n === 'trident' || n === 'fishing_rod') return 1;
  if (n.startsWith('leather_')) return 15;
  if (n.startsWith('chainmail_')) return 12;
  if (n === 'turtle_helmet') return 9;
  return 0;
}

export function armorSlotOf(it: ItemDef): 'head' | 'chest' | 'legs' | 'feet' | null {
  if (it.armor) return it.armor.slot;
  const n = it.name;
  if (n === 'elytra') return 'chest';
  if (n === 'turtle_helmet' || n === 'carved_pumpkin' || n.endsWith('_head') || n.endsWith('_skull')) return 'head';
  if (/_helmet$/.test(n)) return 'head';
  if (/_chestplate$/.test(n)) return 'chest';
  if (/_leggings$/.test(n)) return 'legs';
  if (/_boots$/.test(n)) return 'feet';
  return null;
}

function isArmorItem(it: ItemDef) {
  return !!it.armor || /_(helmet|chestplate|leggings|boots)$/.test(it.name);
}

/** EnchantmentCategory.canEnchant */
export function categoryAccepts(cat: EnchCategory, it: ItemDef): boolean {
  const n = it.name;
  const tool = it.tool?.type;
  switch (cat) {
    case 'armor': return isArmorItem(it);
    case 'armor_head': return isArmorItem(it) && armorSlotOf(it) === 'head';
    case 'armor_chest': return isArmorItem(it) && armorSlotOf(it) === 'chest';
    case 'armor_legs': return isArmorItem(it) && armorSlotOf(it) === 'legs';
    case 'armor_feet': return isArmorItem(it) && armorSlotOf(it) === 'feet';
    case 'weapon': return tool === 'sword';
    case 'digger': return tool === 'pickaxe' || tool === 'axe' || tool === 'shovel' || tool === 'hoe';
    case 'fishing_rod': return n === 'fishing_rod';
    case 'trident': return n === 'trident';
    case 'bow': return n === 'bow';
    case 'crossbow': return n === 'crossbow';
    case 'breakable': return it.durability > 0;
    case 'wearable': return isArmorItem(it) || n === 'elytra' || n === 'carved_pumpkin' || n.endsWith('_head') || n.endsWith('_skull');
    case 'vanishable': return it.durability > 0 || isArmorItem(it) || n === 'compass' || n === 'recovery_compass' || n === 'carved_pumpkin' || n.endsWith('_head') || n.endsWith('_skull') || n === 'elytra';
  }
}

/** Enchantment.canEnchant (anvil applicability; includes axes for sharpness etc.). */
export function canEnchantItem(e: EnchantmentDef, it: ItemDef): boolean {
  return categoryAccepts(e.category, it) || !!e.anvilExtra?.(it);
}

/** Can this stack go into the enchanting table (ItemStack.isEnchantable). */
export function isEnchantable(s: ItemStack): boolean {
  if (isBook(s.item)) return s.count === 1;
  if (s.item.maxStack !== 1 || s.item.durability <= 0 || enchantability(s.item) <= 0) return false;
  return !s.ench || Object.keys(s.ench).length === 0;
}

// ------------------------------------------------------------------------------------ RNG
/** java.util.Random / LegacyRandomSource compatible generator. */
export class JavaRandom {
  private seed = 0n;
  private static readonly MUL = 0x5deece66dn;
  private static readonly MASK = (1n << 48n) - 1n;
  constructor(seed: number | bigint = Date.now()) {
    this.setSeed(seed);
  }
  setSeed(seed: number | bigint) {
    this.seed = (BigInt.asIntN(64, BigInt(seed)) ^ JavaRandom.MUL) & JavaRandom.MASK;
  }
  next(bits: number): number {
    this.seed = (this.seed * JavaRandom.MUL + 0xbn) & JavaRandom.MASK;
    return Number(BigInt.asIntN(32, this.seed >> BigInt(48 - bits)));
  }
  nextInt(bound?: number): number {
    if (bound === undefined) return this.next(32);
    if (bound <= 0) throw new Error('bound must be positive');
    if ((bound & -bound) === bound) return Number((BigInt(bound) * BigInt(this.next(31))) >> 31n);
    let bits: number, val: number;
    do {
      bits = this.next(31);
      val = bits % bound;
    } while (bits - val + (bound - 1) < 0 || bits - val + (bound - 1) > 0x7fffffff);
    return val;
  }
  nextFloat(): number {
    return this.next(24) / (1 << 24);
  }
  nextBoolean(): boolean {
    return this.next(1) !== 0;
  }
}

/** Minimal RNG interface used by selection (JavaRandom or Math.random adapter). */
export interface Rand {
  nextInt(bound: number): number;
  nextFloat(): number;
}
export function mathRand(f: () => number = Math.random): Rand {
  return { nextInt: (b) => Math.floor(f() * b), nextFloat: () => f() };
}

// ------------------------------------------------------------------------------------ selection
export interface EnchInstance {
  id: string;
  level: number;
}

/** EnchantmentHelper.getEnchantmentCost (level requirement of a table slot). */
export function enchantmentCost(rand: Rand, slot: number, bookshelves: number, it: ItemDef): number {
  const e = enchantability(it);
  if (e <= 0) return 0;
  if (bookshelves > 15) bookshelves = 15;
  const j = rand.nextInt(8) + 1 + (bookshelves >> 1) + rand.nextInt(bookshelves + 1);
  if (slot === 0) return Math.max(Math.floor(j / 3), 1);
  return slot === 1 ? Math.floor((j * 2) / 3) + 1 : Math.max(j, bookshelves * 2);
}

/** EnchantmentHelper.getAvailableEnchantmentResults */
export function availableEnchantments(power: number, it: ItemDef, treasure: boolean): EnchInstance[] {
  const out: EnchInstance[] = [];
  const book = isBook(it);
  for (const e of E) {
    if ((e.treasure && !treasure) || !e.discoverable) continue;
    if (!book && !categoryAccepts(e.category, it)) continue;
    for (let l = e.maxLevel; l > 0; l--) {
      if (power >= e.minCost(l) && power <= e.maxCost(l)) {
        out.push({ id: e.id, level: l });
        break;
      }
    }
  }
  return out;
}

function weightedPick(rand: Rand, list: EnchInstance[]): EnchInstance | null {
  let total = 0;
  for (const x of list) total += ENCHANTMENT_BY_ID.get(x.id)!.weight;
  if (total <= 0) return null;
  let i = rand.nextInt(total);
  for (const x of list) {
    i -= ENCHANTMENT_BY_ID.get(x.id)!.weight;
    if (i < 0) return x;
  }
  return null;
}

/** EnchantmentHelper.selectEnchantment */
export function selectEnchantments(rand: Rand, it: ItemDef, level: number, treasure: boolean): EnchInstance[] {
  const out: EnchInstance[] = [];
  const e = enchantability(it);
  if (e <= 0) return out;
  level += 1 + rand.nextInt(Math.floor(e / 4) + 1) + rand.nextInt(Math.floor(e / 4) + 1);
  const f = (rand.nextFloat() + rand.nextFloat() - 1) * 0.15;
  level = Math.max(1, Math.round(level + level * f));
  let avail = availableEnchantments(level, it, treasure);
  if (avail.length) {
    const first = weightedPick(rand, avail);
    if (first) out.push(first);
    while (rand.nextInt(50) <= level) {
      if (out.length) {
        const last = out[out.length - 1];
        avail = avail.filter((x) => compatible(x.id, last.id));
      }
      if (!avail.length) break;
      const p = weightedPick(rand, avail);
      if (p) out.push(p);
      level = Math.floor(level / 2);
    }
  }
  return out;
}

/** Loot function enchant_with_levels. Books become enchanted books. */
export function enchantWithLevels(stack: ItemStack, levels: number, treasure: boolean, rand: Rand, enchantedBook?: ItemDef): ItemStack {
  const list = selectEnchantments(rand, stack.item, levels, treasure);
  let out = stack;
  if (isBook(stack.item) && enchantedBook) out = { item: enchantedBook, count: 1, damage: 0 };
  if (list.length) {
    out.ench = { ...(out.ench ?? {}) };
    for (const x of list) out.ench[x.id] = x.level;
  }
  return out;
}

/** Loot function enchant_randomly: one random applicable enchantment at a random level. */
export function enchantRandomly(stack: ItemStack, rand: Rand, enchantedBook?: ItemDef): ItemStack {
  const book = isBook(stack.item);
  const options = E.filter((e) => e.discoverable && (book || canEnchantItem(e, stack.item)));
  if (!options.length) return stack;
  const e = options[rand.nextInt(options.length)];
  const level = 1 + rand.nextInt(e.maxLevel);
  let out = stack;
  if (book && enchantedBook) out = { item: enchantedBook, count: 1, damage: 0 };
  out.ench = { ...(out.ench ?? {}), [e.id]: level };
  return out;
}

// ------------------------------------------------------------------------------------ helpers
const ROMAN: [number, string][] = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
export function roman(n: number): string {
  if (n <= 0 || n >= 4000) return String(n);
  let s = '';
  for (const [v, r] of ROMAN) while (n >= v) { s += r; n -= v; }
  return s;
}

/** "Sharpness V" / "Mending" (max level 1 shows no numeral, like vanilla). */
export function enchantmentLabel(id: string, level: number): string {
  const d = enchantmentDef(id);
  const name = d?.name ?? id.split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
  if (d && d.maxLevel === 1 && level === 1) return name;
  return `${name} ${roman(level)}`;
}

/** Enchantment level on a stack (0 if absent). */
export function enchLevel(s: ItemStack | null | undefined, id: string): number {
  if (!s?.ench) return 0;
  const v = s.ench[id];
  if (v) return v;
  for (const [alias, real] of Object.entries(ENCHANT_ALIASES)) if (real === id && s.ench[alias]) return s.ench[alias];
  return 0;
}
