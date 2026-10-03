/**
 * Chest loot tables (simplified vanilla 1.20 tables) and container filling with vanilla's
 * shuffle-and-split distribution. World gen marks chests with `{type:'chest', loot:'<table>'}`;
 * the container system fills them on first open (or when broken).
 *
 * Public API: `LOOT_TABLES`, `registerLootTable`, `resolveLootTable(name)`, `generateLoot`,
 * `fillWithLoot(storage, table, seed)`.
 */
import { ITEM_BY_NAME, type ItemStack } from '../items/registry';
import { enchantRandomly, enchantWithLevels, JavaRandom, type Rand } from '../enchant/enchantments';
import type { SlotStorage } from '../containers/storage';

export interface LootEntry {
  /** Item id, or null for an empty entry. */
  item: string | null;
  weight?: number;
  count?: [number, number];
  enchant?: 'randomly' | { levels: [number, number]; treasure?: boolean };
  /** Durability fraction remaining range (set_damage). */
  damage?: [number, number];
  data?: Record<string, any>;
}
export interface LootPool {
  rolls: [number, number];
  entries: LootEntry[];
}

const e = (item: string | null, weight = 1, count?: [number, number], extra: Partial<LootEntry> = {}): LootEntry => ({ item, weight, count, ...extra });
const book = (weight: number, enchant: LootEntry['enchant'] = 'randomly') => e('book', weight, undefined, { enchant });
const potion = (weight: number, p: string) => e('potion', weight, undefined, { data: { potion: p } });
const pool = (rolls: [number, number] | number, entries: LootEntry[]): LootPool => ({ rolls: typeof rolls === 'number' ? [rolls, rolls] : rolls, entries });
const ench30: LootEntry['enchant'] = { levels: [30, 30], treasure: true };
const ench2039: LootEntry['enchant'] = { levels: [20, 39], treasure: true };

const seeds = (w: number): LootEntry[] => [e('melon_seeds', w, [2, 4]), e('pumpkin_seeds', w, [2, 4]), e('beetroot_seeds', w, [2, 4])];
const horseArmor = (i: number, g: number, d: number): LootEntry[] => [e('iron_horse_armor', i), e('golden_horse_armor', g), e('diamond_horse_armor', d)];

export const LOOT_TABLES: Record<string, LootPool[]> = {
  dungeon: [
    pool([1, 3], [e('saddle', 20), e('golden_apple', 15), e('enchanted_golden_apple', 2), e('music_disc_otherside', 2), e('music_disc_13', 15), e('music_disc_cat', 15), e('name_tag', 20), ...horseArmor(15, 10, 5), book(10)]),
    pool([1, 4], [e('iron_ingot', 10, [1, 4]), e('gold_ingot', 5, [1, 4]), e('bread', 20), e('wheat', 20, [1, 4]), e('bucket', 10), e('redstone', 15, [1, 4]), e('coal', 15, [1, 4]), ...seeds(10)]),
    pool(3, [e('bone', 10, [1, 8]), e('gunpowder', 10, [1, 8]), e('rotten_flesh', 10, [1, 8]), e('string', 10, [1, 8])]),
  ],
  mineshaft: [
    pool(1, [e('golden_apple', 20), e('enchanted_golden_apple', 1), e('name_tag', 30), book(10), e('iron_pickaxe', 5), e(null, 5)]),
    pool([2, 4], [e('iron_ingot', 10, [1, 5]), e('gold_ingot', 5, [1, 3]), e('redstone', 5, [4, 9]), e('lapis_lazuli', 5, [4, 9]), e('diamond', 3, [1, 2]), e('coal', 10, [3, 8]), e('bread', 15, [1, 3]), e('glow_berries', 15, [3, 6]), ...seeds(10)]),
    pool(3, [e('rail', 20, [4, 8]), e('powered_rail', 5, [1, 4]), e('detector_rail', 5, [1, 4]), e('activator_rail', 5, [1, 4]), e('torch', 15, [1, 16])]),
  ],
  desert_pyramid: [
    pool([2, 4], [e('diamond', 5, [1, 3]), e('iron_ingot', 15, [1, 5]), e('gold_ingot', 15, [2, 7]), e('emerald', 15, [1, 3]), e('bone', 25, [4, 6]), e('spider_eye', 25, [1, 3]), e('rotten_flesh', 25, [3, 7]), e('saddle', 20), ...horseArmor(15, 10, 5), book(20), e('golden_apple', 20), e('enchanted_golden_apple', 2), e(null, 15)]),
    pool(4, [e('bone', 10, [1, 8]), e('gunpowder', 10, [1, 8]), e('rotten_flesh', 10, [1, 8]), e('string', 10, [1, 8]), e('sand', 10, [1, 8])]),
  ],
  jungle_temple: [
    pool([2, 6], [e('diamond', 3, [1, 3]), e('iron_ingot', 10, [1, 5]), e('gold_ingot', 15, [2, 7]), e('emerald', 2, [1, 3]), e('bone', 20, [4, 6]), e('rotten_flesh', 16, [3, 7]), e('saddle', 3), ...horseArmor(1, 1, 1), book(1, ench30)]),
  ],
  stronghold_corridor: [
    pool([2, 3], [e('ender_pearl', 10), e('diamond', 3, [1, 3]), e('iron_ingot', 10, [1, 5]), e('gold_ingot', 5, [1, 3]), e('redstone', 5, [4, 9]), e('bread', 15, [1, 3]), e('apple', 15, [1, 3]), e('iron_pickaxe', 5), e('iron_sword', 5), e('iron_chestplate', 5), e('iron_helmet', 5), e('iron_leggings', 5), e('iron_boots', 5), e('golden_apple', 1), e('saddle', 1), ...horseArmor(1, 1, 1), e('music_disc_otherside', 1), book(1, ench30)]),
  ],
  stronghold_crossing: [
    pool([1, 4], [e('iron_ingot', 10, [1, 5]), e('gold_ingot', 5, [1, 3]), e('redstone', 5, [4, 9]), e('coal', 10, [3, 8]), e('bread', 15, [1, 3]), e('apple', 15, [1, 3]), e('iron_pickaxe', 1), book(1, ench30)]),
  ],
  stronghold_library: [
    pool([2, 10], [e('book', 20, [1, 3]), e('paper', 20, [2, 7]), e('map', 1), e('compass', 1), book(10, ench30)]),
  ],
  village_plains: [pool([3, 8], [e('gold_nugget', 1, [1, 3]), e('dandelion', 2), e('poppy', 1), e('potato', 10, [1, 5]), e('bread', 10, [1, 4]), e('apple', 10, [1, 5]), e('book', 1), e('feather', 1), e('emerald', 2, [1, 4]), e('oak_sapling', 5, [1, 2])])],
  village_weaponsmith: [pool([3, 8], [e('diamond', 3, [1, 3]), e('iron_ingot', 10, [1, 5]), e('gold_ingot', 5, [1, 3]), e('bread', 15, [1, 3]), e('apple', 15, [1, 3]), e('iron_pickaxe', 5), e('iron_sword', 5), e('iron_chestplate', 5), e('iron_helmet', 5), e('iron_leggings', 5), e('iron_boots', 5), e('obsidian', 5, [3, 7]), e('oak_sapling', 5, [3, 7]), e('saddle', 3), ...horseArmor(1, 1, 1)])],
  village_toolsmith: [pool([3, 8], [e('diamond', 1, [1, 3]), e('iron_ingot', 5, [1, 5]), e('gold_ingot', 1, [1, 3]), e('bread', 15, [1, 3]), e('iron_pickaxe', 5), e('coal', 1, [1, 3]), e('stick', 20, [1, 3]), e('iron_shovel', 5)])],
  village_armorer: [pool([1, 5], [e('iron_ingot', 2, [1, 3]), e('bread', 4, [1, 4]), e('iron_helmet', 1), e('emerald', 1)])],
  village_temple: [pool([3, 8], [e('redstone', 2, [1, 4]), e('bread', 7, [1, 4]), e('rotten_flesh', 7, [1, 4]), e('lapis_lazuli', 1, [1, 4]), e('gold_ingot', 1, [1, 4]), e('emerald', 1, [1, 4])])],
  village_butcher: [pool([1, 5], [e('emerald', 1), e('porkchop', 6, [1, 3]), e('wheat', 6, [1, 3]), e('beef', 6, [1, 3]), e('mutton', 6, [1, 3]), e('coal', 3, [1, 3])])],
  village_fisher: [pool([1, 5], [e('emerald', 1, [1, 3]), e('cod', 2, [1, 3]), e('salmon', 1, [1, 3]), e('water_bucket', 1, [1, 3]), e('barrel', 1, [1, 3]), e('wheat_seeds', 3, [1, 3]), e('coal', 2, [1, 3])])],
  village_cartographer: [pool([1, 5], [e('map', 10, [1, 3]), e('paper', 15, [1, 5]), e('compass', 5), e('bread', 15, [1, 4]), e('stick', 5, [1, 2])])],
  village_mason: [pool([1, 5], [e('clay_ball', 1, [1, 3]), e('flower_pot', 1), e('stone', 2), e('stone_bricks', 2), e('bread', 4, [1, 4]), e('yellow_dye', 1), e('smooth_stone', 1), e('emerald', 1)])],
  village_shepherd: [pool([1, 5], [e('white_wool', 6, [1, 8]), e('black_wool', 3, [1, 3]), e('gray_wool', 2, [1, 3]), e('brown_wool', 2, [1, 3]), e('light_gray_wool', 2, [1, 3]), e('emerald', 1), e('shears', 1), e('wheat', 6, [1, 6])])],
  village_fletcher: [pool([1, 5], [e('emerald', 1), e('arrow', 2, [1, 3]), e('feather', 6, [1, 3]), e('egg', 2, [1, 3]), e('flint', 6, [1, 3]), e('stick', 6, [1, 3])])],
  village_tannery: [pool([1, 5], [e('leather', 1, [1, 3]), e('leather_chestplate', 2), e('leather_boots', 2), e('leather_helmet', 2), e('bread', 5, [1, 4]), e('leather_leggings', 2), e('saddle', 1), e('emerald', 1, [1, 4])])],
  village_desert: [pool([3, 8], [e('clay_ball', 1), e('green_dye', 1), e('cactus', 10, [1, 4]), e('wheat', 10, [1, 7]), e('bread', 10, [1, 4]), e('book', 1), e('dead_bush', 2, [1, 3]), e('emerald', 1, [1, 3])])],
  village_savanna: [pool([3, 8], [e('gold_nugget', 1, [1, 3]), e('short_grass', 5), e('tall_grass', 5), e('bread', 10, [1, 4]), e('wheat_seeds', 10, [1, 5]), e('emerald', 2, [1, 4]), e('acacia_sapling', 10, [1, 2]), e('saddle', 1), e('torch', 1, [1, 2]), e('bucket', 1)])],
  village_snowy: [pool([3, 8], [e('blue_ice', 1), e('snow_block', 4), e('potato', 10, [1, 7]), e('bread', 10, [1, 4]), e('beetroot_seeds', 10, [1, 5]), e('beetroot_soup', 1), e('furnace', 1), e('emerald', 1, [1, 4]), e('snowball', 10, [1, 7]), e('coal', 5, [1, 4])])],
  village_taiga: [pool([3, 8], [e('iron_nugget', 1, [1, 5]), e('fern', 2), e('large_fern', 2), e('potato', 10, [1, 7]), e('sweet_berries', 5, [1, 7]), e('bread', 10, [1, 4]), e('pumpkin_seeds', 5, [1, 5]), e('pumpkin_pie', 1), e('emerald', 2, [1, 4]), e('spruce_sapling', 5, [1, 5]), e('spruce_sign', 1), e('spruce_log', 10, [1, 5])])],
  nether_fortress: [
    pool([2, 4], [e('diamond', 5, [1, 3]), e('iron_ingot', 5, [1, 5]), e('gold_ingot', 15, [1, 3]), e('golden_sword', 5), e('golden_chestplate', 5), e('flint_and_steel', 5), e('nether_wart', 5, [3, 7]), e('saddle', 10), e('golden_horse_armor', 8), e('iron_horse_armor', 5), e('diamond_horse_armor', 3), e('obsidian', 2, [2, 4])]),
  ],
  end_city: [
    pool([2, 6], [
      e('diamond', 5, [2, 7]), e('iron_ingot', 10, [4, 8]), e('gold_ingot', 15, [2, 7]), e('emerald', 2, [2, 6]), e('beetroot_seeds', 5, [1, 10]), e('saddle', 3), ...horseArmor(1, 1, 1),
      ...['sword', 'boots', 'chestplate', 'leggings', 'helmet', 'pickaxe', 'shovel'].flatMap((t) => [e(`diamond_${t}`, 3, undefined, { enchant: ench2039 }), e(`iron_${t}`, 3, undefined, { enchant: ench2039 })]),
    ]),
  ],
  shipwreck_supply: [
    pool([3, 10], [e('paper', 8, [1, 12]), e('potato', 7, [2, 6]), e('moss_block', 7, [1, 4]), e('poisonous_potato', 7, [2, 6]), e('carrot', 7, [4, 8]), e('wheat', 7, [8, 21]), e('suspicious_stew', 10), e('coal', 6, [2, 8]), e('rotten_flesh', 5, [5, 24]), e('pumpkin', 2, [1, 3]), e('bamboo', 2, [1, 3]), e('gunpowder', 3, [1, 5]), e('tnt', 1, [1, 2]), ...['helmet', 'chestplate', 'leggings', 'boots'].map((t) => e(`leather_${t}`, 3, undefined, { enchant: 'randomly' }))]),
  ],
  shipwreck_map: [
    pool(1, [e('map', 1)]),
    pool(3, [e('compass', 1), e('map', 1), e('clock', 1), e('paper', 20, [1, 10]), e('feather', 10, [1, 5]), e('book', 5, [1, 5])]),
  ],
  shipwreck_treasure: [
    pool([3, 6], [e('iron_ingot', 90, [1, 5]), e('gold_ingot', 10, [1, 5]), e('emerald', 40, [1, 5]), e('diamond', 5), e('experience_bottle', 5)]),
    pool([2, 5], [e('iron_nugget', 50, [1, 10]), e('gold_nugget', 10, [1, 10]), e('lapis_lazuli', 20, [1, 10])]),
  ],
  buried_treasure: [
    pool(1, [e('heart_of_the_sea', 1)]),
    pool([5, 8], [e('iron_ingot', 20, [1, 4]), e('gold_ingot', 10, [1, 4]), e('tnt', 5, [1, 2])]),
    pool([1, 3], [e('emerald', 5, [4, 8]), e('diamond', 5, [1, 2]), e('prismarine_crystals', 5, [1, 5])]),
    pool([0, 1], [e('leather_chestplate', 1), e('iron_sword', 1)]),
    pool(2, [e('cooked_cod', 1, [2, 4]), e('cooked_salmon', 1, [2, 4])]),
    pool([0, 2], [potion(1, 'water_breathing')]),
  ],
  ruined_portal: [
    pool([4, 8], [
      e('obsidian', 40, [1, 2]), e('flint', 40, [1, 4]), e('iron_nugget', 40, [9, 18]), e('flint_and_steel', 40), e('fire_charge', 40), e('golden_apple', 15), e('gold_nugget', 15, [4, 24]),
      ...['sword', 'axe', 'hoe', 'shovel', 'pickaxe', 'boots', 'chestplate', 'helmet', 'leggings'].map((t) => e(`golden_${t}`, 15, undefined, { enchant: 'randomly' })),
      e('glistering_melon_slice', 5, [4, 12]), e('golden_horse_armor', 5), e('light_weighted_pressure_plate', 5), e('golden_carrot', 5, [4, 12]), e('clock', 5), e('gold_ingot', 5, [2, 8]), e('bell', 1), e('enchanted_golden_apple', 1), e('gold_block', 1, [1, 2]),
    ]),
  ],
  igloo: [
    pool([2, 8], [e('apple', 15, [1, 3]), e('coal', 15, [1, 4]), e('gold_nugget', 10, [1, 3]), e('stone_axe', 2), e('rotten_flesh', 10), e('emerald', 1), e('wheat', 10, [2, 3])]),
    pool(1, [e('golden_apple', 1)]),
  ],
  pillager_outpost: [
    pool([0, 1], [e('crossbow', 1)]),
    pool([2, 3], [e('wheat', 7, [3, 5]), e('potato', 5, [2, 5]), e('carrot', 5, [3, 5])]),
    pool([1, 3], [e('dark_oak_log', 1, [2, 3])]),
    pool([2, 3], [e('experience_bottle', 7), e('string', 4, [1, 6]), e('arrow', 4, [2, 7]), e('tripwire_hook', 3, [1, 3]), e('iron_ingot', 3, [1, 3]), book(1)]),
  ],
  woodland_mansion: [
    pool([1, 3], [e('lead', 20), e('golden_apple', 15), e('enchanted_golden_apple', 2), e('music_disc_13', 15), e('music_disc_cat', 15), e('name_tag', 20), e('chainmail_chestplate', 10), e('diamond_hoe', 15), e('diamond_chestplate', 5), book(10)]),
    pool([1, 4], [e('iron_ingot', 10, [1, 4]), e('gold_ingot', 5, [1, 4]), e('bread', 20), e('wheat', 20, [1, 4]), e('bucket', 10), e('redstone', 15, [1, 4]), e('coal', 15, [1, 4]), ...seeds(10)]),
    pool(3, [e('bone', 10, [1, 8]), e('gunpowder', 10, [1, 8]), e('rotten_flesh', 10, [1, 8]), e('string', 10, [1, 8])]),
  ],
  bastion: [
    pool(1, [e('lodestone', 1), e('crossbow', 1), e('golden_apple', 1), e('gold_block', 1)]),
    pool([3, 4], [e('gold_ingot', 1, [1, 6]), e('gold_nugget', 1, [2, 8]), e('iron_ingot', 1, [1, 6]), e('spectral_arrow', 1, [1, 6]), e('string', 1, [1, 6]), e('magma_cream', 1, [2, 6]), e('crying_obsidian', 1, [1, 5]), e('obsidian', 1, [1, 5]), e('gilded_blackstone', 1, [1, 5]), e('chain', 1, [2, 6])]),
  ],
};

/** Aliases for loot ids written by world gen (vanilla resource names). */
const ALIASES: Record<string, string> = {
  simple_dungeon: 'dungeon', abandoned_mineshaft: 'mineshaft', nether_bridge: 'nether_fortress', fortress: 'nether_fortress', end_city_treasure: 'end_city',
  stronghold: 'stronghold_corridor', shipwreck: 'shipwreck_supply', village: 'village_plains', village_plains_house: 'village_plains',
  village_desert_house: 'village_desert', village_savanna_house: 'village_savanna', village_snowy_house: 'village_snowy', village_taiga_house: 'village_taiga',
  igloo_chest: 'igloo', bastion_treasure: 'bastion', bastion_other: 'bastion', bastion_bridge: 'bastion', bastion_hoglin_stable: 'bastion', temple: 'desert_pyramid', jungle_pyramid: 'jungle_temple',
};

export function registerLootTable(name: string, pools: LootPool[]) {
  LOOT_TABLES[name] = pools;
}

export function resolveLootTable(name: string): LootPool[] | null {
  const n = name.replace(/^minecraft:/, '').replace(/^chests\//, '').replace(/\//g, '_');
  if (LOOT_TABLES[n]) return LOOT_TABLES[n];
  if (ALIASES[n] && LOOT_TABLES[ALIASES[n]]) return LOOT_TABLES[ALIASES[n]];
  if (n.startsWith('village_')) return LOOT_TABLES[n.replace(/_house$/, '')] ?? LOOT_TABLES.village_plains;
  if (n.startsWith('stronghold')) return LOOT_TABLES.stronghold_corridor;
  if (n.startsWith('shipwreck')) return LOOT_TABLES.shipwreck_supply;
  if (n.startsWith('bastion')) return LOOT_TABLES.bastion;
  return null;
}

function rint(r: Rand, min: number, max: number) {
  return max <= min ? min : min + r.nextInt(max - min + 1);
}

/** Roll a loot table into stacks (items that are not registered are skipped). */
export function generateLoot(name: string, r: Rand): ItemStack[] {
  const pools = resolveLootTable(name);
  if (!pools) return [];
  const out: ItemStack[] = [];
  const eb = ITEM_BY_NAME.get('enchanted_book');
  for (const p of pools) {
    const rolls = rint(r, p.rolls[0], p.rolls[1]);
    const entries = p.entries.filter((x) => x.item === null || ITEM_BY_NAME.has(x.item));
    const total = entries.reduce((a, x) => a + (x.weight ?? 1), 0);
    if (total <= 0) continue;
    for (let i = 0; i < rolls; i++) {
      let k = r.nextInt(total);
      let pick: LootEntry | null = null;
      for (const x of entries) {
        k -= x.weight ?? 1;
        if (k < 0) { pick = x; break; }
      }
      if (!pick || !pick.item) continue;
      const it = ITEM_BY_NAME.get(pick.item)!;
      let s: ItemStack = { item: it, count: pick.count ? rint(r, pick.count[0], pick.count[1]) : 1, damage: 0 };
      if (s.count <= 0) continue;
      if (pick.data) s.data = JSON.parse(JSON.stringify(pick.data));
      if (pick.damage && it.durability > 0) {
        const f = pick.damage[0] + r.nextFloat() * (pick.damage[1] - pick.damage[0]);
        s.damage = Math.floor(it.durability * (1 - f));
      }
      if (pick.enchant === 'randomly') s = enchantRandomly(s, r, eb);
      else if (pick.enchant) s = enchantWithLevels(s, rint(r, pick.enchant.levels[0], pick.enchant.levels[1]), !!pick.enchant.treasure, r, eb);
      if (s.count > it.maxStack) {
        while (s.count > it.maxStack) {
          out.push({ ...s, count: it.maxStack, ench: s.ench ? { ...s.ench } : undefined });
          s.count -= it.maxStack;
        }
      }
      out.push(s);
    }
  }
  return out;
}

/** Fill a container like LootTable.fill (random empty slots, stacks split across slots). */
export function fillWithLoot(st: SlotStorage, table: string, seed: number): number {
  const r = new JavaRandom(seed);
  const stacks = generateLoot(table, r);
  const empty: number[] = [];
  for (let i = 0; i < st.size; i++) if (!st.get(i)) empty.push(i);
  // shuffle slots
  for (let i = empty.length - 1; i > 0; i--) {
    const j = r.nextInt(i + 1);
    [empty[i], empty[j]] = [empty[j], empty[i]];
  }
  // shuffleAndSplitItems
  const singles: ItemStack[] = [];
  const multi: ItemStack[] = [];
  for (const s of stacks) (s.count > 1 ? multi : singles).push(s);
  while (empty.length - singles.length - multi.length > 0 && multi.length) {
    const s = multi.splice(rint(r, 0, multi.length - 1), 1)[0];
    const n = rint(r, 1, Math.floor(s.count / 2));
    const part: ItemStack = { ...s, count: n, ench: s.ench ? { ...s.ench } : undefined, data: s.data ? JSON.parse(JSON.stringify(s.data)) : undefined };
    s.count -= n;
    (s.count > 1 && r.nextInt(2) === 0 ? multi : singles).push(s);
    (part.count > 1 && r.nextInt(2) === 0 ? multi : singles).push(part);
  }
  const all = [...singles, ...multi];
  for (let i = all.length - 1; i > 0; i--) {
    const j = r.nextInt(i + 1);
    [all[i], all[j]] = [all[j], all[i]];
  }
  let placed = 0;
  for (const s of all) {
    const slot = empty.pop();
    if (slot === undefined) break;
    st.set(slot, s);
    placed++;
  }
  return placed;
}
