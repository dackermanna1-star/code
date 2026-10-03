import { describe, it, expect, beforeAll } from 'vitest';
import '../src/world/blocks/blocks';
import { S as state } from '../src/world/blocks/registry';
import { itemByName, type ItemStack } from '../src/game/items/registry';
import { registerDevItems } from '../src/debug/devItems';
import { installCrafting } from '../src/game/crafting';
import { SimpleContainer } from '../src/game/containers/storage';
import { findCookingRecipe, fuelTicks, newFurnaceData, tickFurnace, rollFurnaceXp } from '../src/game/crafting/smelting';
import { JavaRandom, availableEnchantments, compatible, enchantmentLabel, roman, selectEnchantments, enchantability } from '../src/game/enchant/enchantments';
import { countBookshelves, computeOffers, performEnchant } from '../src/game/enchant/table';
import { anvilResult } from '../src/game/enchant/anvil';
import { brewMix, hasMix, newBrewingData, tickBrewing } from '../src/game/brewing/brewing';
import { potionColor, potionDisplayName, effectTooltipLines, formatDuration } from '../src/game/brewing/potions';
import { fillWithLoot, generateLoot } from '../src/game/loot/lootTables';
import { protectionEPF, damageBonus, applyMending, bowPower } from '../src/game/enchant/effects';

const S = (n: string, count = 1, extra: Partial<ItemStack> = {}): ItemStack => ({ item: itemByName(n), count, damage: 0, ...extra });

beforeAll(() => {
  registerDevItems();
  installCrafting();
});

describe('smelting', () => {
  it('recipe types and restrictions', () => {
    expect(findCookingRecipe('smelting', S('raw_iron'))?.result.name).toBe('iron_ingot');
    expect(findCookingRecipe('blasting', S('raw_iron'))?.cookTime).toBe(100);
    expect(findCookingRecipe('smelting', S('raw_iron'))?.cookTime).toBe(200);
    expect(findCookingRecipe('blasting', S('beef'))).toBeNull();
    expect(findCookingRecipe('smoking', S('beef'))?.result.name).toBe('cooked_beef');
    expect(findCookingRecipe('smoking', S('sand'))).toBeNull();
    expect(findCookingRecipe('smelting', S('sand'))?.result.name).toBe('glass');
    expect(findCookingRecipe('smelting', S('cobblestone'))?.result.name).toBe('stone');
    expect(findCookingRecipe('smelting', S('stone'))?.result.name).toBe('smooth_stone');
    expect(findCookingRecipe('smelting', S('clay'))?.result.name).toBe('terracotta');
    expect(findCookingRecipe('smelting', S('clay_ball'))?.result.name).toBe('brick');
    expect(findCookingRecipe('smelting', S('birch_log'))?.result.name).toBe('charcoal');
    expect(findCookingRecipe('smelting', S('crimson_stem'))).toBeNull();
    expect(findCookingRecipe('smelting', S('cactus'))?.result.name).toBe('green_dye');
    expect(findCookingRecipe('smelting', S('kelp'))?.result.name).toBe('dried_kelp');
    expect(findCookingRecipe('smelting', S('netherrack'))?.result.name).toBe('nether_brick');
    expect(findCookingRecipe('smelting', S('wet_sponge'))?.result.name).toBe('sponge');
    expect(findCookingRecipe('blasting', S('iron_sword'))?.result.name).toBe('iron_nugget');
    expect(findCookingRecipe('smelting', S('diamond_ore'))?.xp).toBe(1);
    expect(findCookingRecipe('smelting', S('raw_iron'))?.xp).toBe(0.7);
  });
  it('fuel values', () => {
    expect(fuelTicks(S('coal'))).toBe(1600);
    expect(fuelTicks(S('oak_planks'))).toBe(300);
    expect(fuelTicks(S('oak_slab'))).toBe(150);
    expect(fuelTicks(S('stick'))).toBe(100);
    expect(fuelTicks(S('lava_bucket'))).toBe(20000);
    expect(fuelTicks(S('coal_block'))).toBe(16000);
    expect(fuelTicks(S('blaze_rod'))).toBe(2400);
    expect(fuelTicks(S('crimson_planks'))).toBe(0);
    expect(fuelTicks(S('white_wool'))).toBe(100);
    expect(fuelTicks(S('stone'))).toBe(0);
  });
  it('furnace ticking: burn, cook, lit state, xp', () => {
    const st = new SimpleContainer(3);
    const d = newFurnaceData('furnace');
    st.set(0, S('raw_iron', 3));
    st.set(1, S('coal', 1));
    const r0 = tickFurnace(d, st);
    expect(r0.litChanged && r0.lit).toBe(true);
    expect(st.get(1)).toBeNull();
    expect(d.burn).toBe(1600);
    let smelted = 0;
    for (let i = 1; i < 600; i++) if (tickFurnace(d, st).smelted) smelted++;
    expect(smelted + 0).toBe(3);
    expect(st.get(2)?.count).toBe(3);
    expect(st.get(0)).toBeNull();
    expect(d.xp).toBeCloseTo(2.1);
    expect(d.burn).toBe(1001); // fuel lit on tick 0, decremented on the next 599 ticks
    // burn out -> unlit
    let lit = true;
    for (let i = 0; i < 1002; i++) {
      const r = tickFurnace(d, st);
      if (r.litChanged) lit = r.lit;
    }
    expect(lit).toBe(false);
    expect(rollFurnaceXp(2.1, () => 0.05)).toBe(3);
    expect(rollFurnaceXp(2.1, () => 0.5)).toBe(2);
  });
  it('blast furnace is twice as fast and burns fuel twice as fast; lava bucket leaves a bucket', () => {
    const st = new SimpleContainer(3);
    const d = newFurnaceData('blast_furnace');
    st.set(0, S('raw_gold', 2));
    st.set(1, S('lava_bucket'));
    tickFurnace(d, st);
    expect(d.burn).toBe(10000);
    expect(st.get(1)?.item.name).toBe('bucket');
    for (let i = 1; i < 200; i++) tickFurnace(d, st);
    expect(st.get(2)?.count).toBe(2);
    // blast furnace refuses food
    const d2 = newFurnaceData('blast_furnace');
    const st2 = new SimpleContainer(3);
    st2.set(0, S('beef'));
    st2.set(1, S('coal'));
    tickFurnace(d2, st2);
    expect(d2.burn).toBe(0);
    expect(st2.get(1)?.count).toBe(1);
  });
  it('output slot full blocks cooking, progress decays without fuel', () => {
    const st = new SimpleContainer(3);
    const d = newFurnaceData('furnace');
    st.set(0, S('raw_iron', 1));
    st.set(1, S('coal', 1));
    st.set(2, S('gold_ingot', 1));
    tickFurnace(d, st);
    expect(d.burn).toBe(0);
    st.set(2, null);
    for (let i = 0; i < 50; i++) tickFurnace(d, st);
    expect(d.cook).toBe(50);
  });
});

describe('enchanting', () => {
  it('java random matches java.util.Random', () => {
    // new Random(42): nextInt() = -1170105035, nextInt(10) = 0
    expect(new JavaRandom(42).nextInt()).toBe(-1170105035);
    expect(new JavaRandom(42).nextInt(10)).toBe(0);
    expect(new JavaRandom(42).nextInt(16)).toBe(Math.floor((16 * 1562431130) / 2 ** 31));
  });
  it('roman numerals and labels', () => {
    expect(roman(4)).toBe('IV');
    expect(roman(10)).toBe('X');
    expect(enchantmentLabel('sharpness', 5)).toBe('Sharpness V');
    expect(enchantmentLabel('mending', 1)).toBe('Mending');
    expect(enchantmentLabel('vanishing_curse', 1)).toBe('Curse of Vanishing');
  });
  it('bookshelf counting needs an air gap', () => {
    const blocks = new Map<string, number>();
    const w = { getBlock: (x: number, y: number, z: number) => blocks.get(`${x},${y},${z}`) ?? 0 };
    for (let x = -2; x <= 2; x++) for (let y = 0; y <= 1; y++) for (const z of [-2, 2]) blocks.set(`${x},${y},${z}`, state('bookshelf'));
    expect(countBookshelves(w, 0, 0, 0)).toBe(20);
    blocks.set('0,0,-1', state('stone')); // blocks the 3 shelves (x=-1..1) behind it
    expect(countBookshelves(w, 0, 0, 0)).toBe(17);
    blocks.set('1,1,1', state('torch')); // torches are not power transmitters
    expect(countBookshelves(w, 0, 0, 0)).toBe(16);
    blocks.set('1,1,1', state('short_grass')); // replaceable plants are
    expect(countBookshelves(w, 0, 0, 0)).toBe(17);
  });
  it('offers are deterministic per seed and scale with bookshelves', () => {
    const sword = itemByName('diamond_sword');
    const a = computeOffers(sword, 15, 12345), b = computeOffers(sword, 15, 12345);
    expect(a).toEqual(b);
    expect(a.costs[2]).toBe(30);
    expect(a.costs[0]).toBeGreaterThanOrEqual(1);
    expect(a.costs[0]).toBeLessThanOrEqual(a.costs[1]);
    for (let seed = 0; seed < 50; seed++) {
      const o = computeOffers(sword, 0, seed);
      expect(o.costs[2]).toBeLessThanOrEqual(8);
      for (const c of o.clues) if (c) expect(['sharpness', 'smite', 'bane_of_arthropods', 'knockback', 'fire_aspect', 'looting', 'sweeping_edge', 'unbreaking']).toContain(c.id);
    }
  });
  it('selected enchantments are applicable and mutually compatible', () => {
    const r = new JavaRandom(7);
    for (let i = 0; i < 200; i++) {
      const list = selectEnchantments(r, itemByName('diamond_pickaxe'), 30, false);
      const ids = list.map((x) => x.id);
      for (const id of ids) expect(['efficiency', 'silk_touch', 'fortune', 'unbreaking']).toContain(id);
      expect(ids.includes('silk_touch') && ids.includes('fortune')).toBe(false);
      for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) expect(compatible(ids[a], ids[b])).toBe(true);
    }
    expect(availableEnchantments(30, itemByName('book'), false).some((x) => x.id === 'sharpness')).toBe(true);
    expect(availableEnchantments(30, itemByName('book'), false).some((x) => x.id === 'mending')).toBe(false);
    expect(enchantability(itemByName('golden_helmet'))).toBe(25);
  });
  it('book enchanting yields an enchanted book', () => {
    const r = performEnchant(S('book'), 2, 30, 99);
    expect(r?.item.name).toBe('enchanted_book');
    expect(Object.keys(r!.ench!).length).toBeGreaterThan(0);
  });
});

describe('anvil', () => {
  it('combines equal levels into the next level', () => {
    const r = anvilResult(S('diamond_sword', 1, { ench: { sharpness: 3 } }), S('diamond_sword', 1, { ench: { sharpness: 3 } }), undefined, false);
    expect(r.result?.ench).toEqual({ sharpness: 4 });
    expect(r.cost).toBe(4);
    expect(r.result?.data?.repairCost).toBe(1);
  });
  it('enchanted books halve the rarity multiplier; prior work adds up', () => {
    const book = S('enchanted_book', 1, { ench: { sharpness: 5 } });
    const r = anvilResult(S('iron_sword'), book, undefined, false);
    expect(r.cost).toBe(5);
    const r2 = anvilResult(S('iron_sword', 1, { data: { repairCost: 3 } }), S('enchanted_book', 1, { ench: { mending: 1 }, data: { repairCost: 1 } }), undefined, false);
    // mending rare (weight 2): 4/2 = 2 * 1 + prior 3 + 1
    expect(r2.cost).toBe(6);
    expect(r2.result?.data?.repairCost).toBe(7);
  });
  it('rename costs 1, repair with material uses quarter durability per item', () => {
    const r = anvilResult(S('diamond_sword'), null, 'Excalibur', false);
    expect(r.cost).toBe(1);
    expect(r.result?.data?.name).toBe('Excalibur');
    const m = anvilResult(S('diamond_sword', 1, { damage: 1000 }), S('diamond', 2), undefined, false);
    expect(m.result?.damage).toBe(1000 - 390 * 2);
    expect(m.repairItemCount).toBe(2);
    expect(m.cost).toBe(2);
  });
  it('incompatible enchantments fail; too expensive at 40', () => {
    const bad = anvilResult(S('diamond_sword', 1, { ench: { sharpness: 1 } }), S('enchanted_book', 1, { ench: { smite: 1 } }), undefined, false);
    expect(bad.result).toBeNull();
    const tooMuch = anvilResult(S('diamond_sword', 1, { data: { repairCost: 39 } }), S('enchanted_book', 1, { ench: { unbreaking: 1 } }), undefined, false);
    expect(tooMuch.tooExpensive).toBe(true);
    expect(tooMuch.result).toBeNull();
    const renameCapped = anvilResult(S('diamond_sword', 1, { data: { repairCost: 50 } }), null, 'X', false);
    expect(renameCapped.cost).toBe(39);
    expect(renameCapped.result).not.toBeNull();
    const creative = anvilResult(S('diamond_sword', 1, { data: { repairCost: 39 } }), S('enchanted_book', 1, { ench: { unbreaking: 1 } }), undefined, true);
    expect(creative.result).not.toBeNull();
  });
  it('sharpness applies to axes via anvil but not via mismatched items', () => {
    expect(anvilResult(S('iron_axe'), S('enchanted_book', 1, { ench: { sharpness: 2 } }), undefined, false).result?.ench).toEqual({ sharpness: 2 });
    expect(anvilResult(S('iron_pickaxe'), S('enchanted_book', 1, { ench: { sharpness: 2 } }), undefined, false).result).toBeNull();
  });
});

describe('brewing', () => {
  const P = (p: string, n = 'potion') => S(n, 1, { data: { potion: p } });
  it('conversions', () => {
    expect(brewMix(S('nether_wart'), P('water')).data?.potion).toBe('awkward');
    expect(brewMix(S('sugar'), P('awkward')).data?.potion).toBe('swiftness');
    expect(brewMix(S('redstone'), P('swiftness')).data?.potion).toBe('long_swiftness');
    expect(brewMix(S('glowstone_dust'), P('swiftness')).data?.potion).toBe('strong_swiftness');
    expect(brewMix(S('fermented_spider_eye'), P('swiftness')).data?.potion).toBe('slowness');
    expect(brewMix(S('fermented_spider_eye'), P('healing')).data?.potion).toBe('harming');
    expect(brewMix(S('fermented_spider_eye'), P('night_vision')).data?.potion).toBe('invisibility');
    expect(brewMix(S('fermented_spider_eye'), P('water')).data?.potion).toBe('weakness');
    expect(brewMix(S('glowstone_dust'), P('water')).data?.potion).toBe('thick');
    expect(brewMix(S('sugar'), P('water')).data?.potion).toBe('mundane');
    expect(brewMix(S('turtle_helmet'), P('awkward')).data?.potion).toBe('turtle_master');
    expect(brewMix(S('phantom_membrane'), P('awkward')).data?.potion).toBe('slow_falling');
    const sp = brewMix(S('gunpowder'), P('healing'));
    expect(sp.item.name).toBe('splash_potion');
    expect(sp.data?.potion).toBe('healing');
    expect(brewMix(S('dragon_breath'), P('healing', 'splash_potion')).item.name).toBe('lingering_potion');
    expect(hasMix(P('awkward'), S('nether_wart'))).toBe(false);
  });
  it('brewing stand ticks 400 ticks with blaze powder fuel', () => {
    const st = new SimpleContainer(5);
    const d = newBrewingData();
    st.set(0, P('water'));
    st.set(2, P('water'));
    st.set(3, S('nether_wart', 2));
    st.set(4, S('blaze_powder', 1));
    tickBrewing(d, st);
    expect(d.fuel).toBe(19);
    expect(d.brewTime).toBe(400);
    expect(st.get(4)).toBeNull();
    let brewed = 0;
    for (let i = 0; i < 400; i++) if (tickBrewing(d, st).brewed) brewed++;
    expect(brewed).toBe(1);
    expect(st.get(0)?.data?.potion).toBe('awkward');
    expect(st.get(2)?.data?.potion).toBe('awkward');
    expect(st.get(3)?.count).toBe(1);
  });
  it('removing the ingredient cancels brewing', () => {
    const st = new SimpleContainer(5);
    const d = newBrewingData();
    st.set(0, P('awkward'));
    st.set(3, S('sugar'));
    st.set(4, S('blaze_powder'));
    tickBrewing(d, st);
    st.set(3, null);
    tickBrewing(d, st);
    expect(d.brewTime).toBe(0);
  });
  it('colours, names, tooltips', () => {
    expect(potionColor('swiftness')).toBe(0x7cafc6);
    expect(potionColor('water')).toBe(0x385dc6);
    expect(potionColor('awkward')).toBe(0x385dc6);
    expect(potionDisplayName('potion', 'long_swiftness')).toBe('Potion of Swiftness');
    expect(potionDisplayName('splash_potion', 'healing')).toBe('Splash Potion of Healing');
    expect(potionDisplayName('potion', 'water')).toBe('Water Bottle');
    expect(potionDisplayName('potion', 'awkward')).toBe('Awkward Potion');
    expect(effectTooltipLines(P('long_swiftness'))).toEqual([['Speed (8:00)', '#5555ff']]);
    expect(effectTooltipLines(P('strong_poison'))[0][0]).toBe('Poison II (0:21)');
    expect(formatDuration(3600)).toBe('3:00');
  });
});

describe('loot', () => {
  it('fills deterministically with registered items only', () => {
    const a = new SimpleContainer(27), b = new SimpleContainer(27);
    fillWithLoot(a, 'dungeon', 1234);
    fillWithLoot(b, 'dungeon', 1234);
    const dump = (c: SimpleContainer) => c.slots.map((s) => (s ? `${s.item.name}:${s.count}` : ''));
    expect(dump(a)).toEqual(dump(b));
    expect(a.slots.filter(Boolean).length).toBeGreaterThan(3);
    for (const t of ['mineshaft', 'desert_pyramid', 'stronghold_corridor', 'village_weaponsmith', 'nether_bridge', 'end_city_treasure', 'shipwreck_supply', 'buried_treasure', 'ruined_portal', 'village_plains_house']) {
      const c = new SimpleContainer(27);
      fillWithLoot(c, t, 5);
      expect(c.slots.filter(Boolean).length).toBeGreaterThan(0);
    }
  });
  it('end city gear is enchanted', () => {
    const r = new JavaRandom(3);
    let enchanted = 0;
    for (let i = 0; i < 20; i++) for (const s of generateLoot('end_city', r)) if (s.ench && /diamond_|iron_/.test(s.item.name) && s.item.durability) enchanted++;
    expect(enchanted).toBeGreaterThan(0);
  });
});

describe('enchantment effects', () => {
  it('protection EPF, damage bonuses, mending, bow power', () => {
    const armor = [S('iron_boots', 1, { ench: { protection: 4 } }), S('iron_leggings', 1, { ench: { fire_protection: 4 } }), null, null];
    expect(protectionEPF(armor, { type: 'mob' })).toBe(4);
    expect(protectionEPF(armor, { type: 'fire', fire: true })).toBe(12);
    expect(protectionEPF(armor, { type: 'void' })).toBe(0);
    const sword = S('diamond_sword', 1, { ench: { sharpness: 5, smite: 2 } });
    expect(damageBonus(sword, { type: 'cow' } as any)).toBe(3);
    expect(damageBonus(sword, { type: 'zombie' } as any)).toBe(8);
    expect(damageBonus(S('iron_sword', 1, { ench: { bane_of_arthropods: 2 } }), { type: 'x', mobType: 'arthropod' } as any)).toBe(5);
    const inv = { selected: 0, s: [S('iron_pickaxe', 1, { damage: 30, ench: { mending: 1 } })] as any[], get(i: number) { return this.s[i] ?? null; }, changed() {} };
    const left = applyMending({ inventory: inv }, 10, () => 0);
    expect(inv.s[0].damage).toBe(10);
    expect(left).toBe(0);
    expect(applyMending({ inventory: inv }, 10, () => 0)).toBe(5);
    expect(bowPower(S('bow', 1, { ench: { power: 5 } }))).toBe(3);
  });
});
