import { describe, it, expect, beforeAll } from 'vitest';
import '../src/world/blocks/blocks';
import { itemByName, tryItem, type ItemStack } from '../src/game/items/registry';
import { registerDevItems } from '../src/debug/devItems';
import { installCrafting, findCraftingRecipe, gridOf, mixLeatherColor, defaultRemainders } from '../src/game/crafting';

const st = (n: string | null, count = 1): ItemStack | null => (n ? { item: itemByName(n), count, damage: 0 } : null);

/** craft(['a','b',null, ...]) on a 3x3 (or 2x2 when 4 entries) grid */
function craft(cells: (string | null)[], w = cells.length === 4 ? 2 : 3) {
  const m = findCraftingRecipe(gridOf(cells.map((c) => st(c)), w));
  return m ? { name: m.result.item.name, count: m.result.count, stack: m.result, recipe: m.recipe } : null;
}
const _ = null;

beforeAll(() => {
  registerDevItems();
  installCrafting();
});

describe('basic wood recipes', () => {
  it('logs -> 4 planks in any slot, 2x2 and 3x3', () => {
    expect(craft(['oak_log', _, _, _])).toMatchObject({ name: 'oak_planks', count: 4 });
    expect(craft([_, _, _, 'birch_log'])).toMatchObject({ name: 'birch_planks', count: 4 });
    expect(craft([_, _, _, _, _, _, _, _, 'spruce_log'])).toMatchObject({ name: 'spruce_planks', count: 4 });
    expect(craft(['crimson_stem', _, _, _])).toMatchObject({ name: 'crimson_planks', count: 4 });
  });
  it('sticks from mixed planks (#planks tag)', () => {
    expect(craft(['oak_planks', _, 'spruce_planks', _])).toMatchObject({ name: 'stick', count: 4 });
    expect(craft([_, 'warped_planks', _, 'cherry_planks'])).toMatchObject({ name: 'stick', count: 4 });
    expect(craft(['oak_planks', 'spruce_planks', _, _])).toBeNull();
  });
  it('crafting table, chest, barrel', () => {
    expect(craft(['oak_planks', 'birch_planks', 'acacia_planks', 'jungle_planks'])?.name).toBe('crafting_table');
    expect(craft(['oak_planks', 'oak_planks', 'oak_planks', 'oak_planks', _, 'spruce_planks', 'oak_planks', 'oak_planks', 'oak_planks'])?.name).toBe('chest');
  });
  it('slabs, stairs, fences, gates, doors, trapdoors, buttons, plates for every wood', () => {
    for (const w of ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak', 'cherry']) {
      const p = `${w}_planks`;
      expect(craft([p, p, p, _, _, _, _, _, _])).toMatchObject({ name: `${w}_slab`, count: 6 });
      expect(craft([p, _, _, p, p, _, p, p, p])).toMatchObject({ name: `${w}_stairs`, count: 4 });
      expect(craft([_, _, p, _, p, p, p, p, p])).toMatchObject({ name: `${w}_stairs`, count: 4 }); // mirrored
      expect(craft([p, 'stick', p, p, 'stick', p, _, _, _])).toMatchObject({ name: `${w}_fence`, count: 3 });
      expect(craft(['stick', p, 'stick', 'stick', p, 'stick', _, _, _])).toMatchObject({ name: `${w}_fence_gate`, count: 1 });
      expect(craft([p, p, _, p, p, _, p, p, _])).toMatchObject({ name: `${w}_door`, count: 3 });
      expect(craft([p, p, p, p, p, p, _, _, _])).toMatchObject({ name: `${w}_trapdoor`, count: 2 });
      expect(craft([p, _, _, _])).toMatchObject({ name: `${w}_button`, count: 1 });
      expect(craft([p, p, _, _])).toMatchObject({ name: `${w}_pressure_plate`, count: 1 });
    }
  });
  it('slab of one wood type needs that wood', () => {
    expect(craft(['oak_planks', 'spruce_planks', 'oak_planks', _, _, _, _, _, _])).toBeNull();
  });
});

describe('tools, weapons, armour', () => {
  const mats: [string, string][] = [['wooden', 'oak_planks'], ['stone', 'cobblestone'], ['iron', 'iron_ingot'], ['golden', 'gold_ingot'], ['diamond', 'diamond']];
  it('every tier', () => {
    for (const [t, m] of mats) {
      expect(craft([m, m, m, _, 'stick', _, _, 'stick', _])?.name).toBe(`${t}_pickaxe`);
      expect(craft([m, m, _, m, 'stick', _, _, 'stick', _])?.name).toBe(`${t}_axe`);
      expect(craft([_, m, m, _, 'stick', m, _, 'stick', _])?.name).toBe(`${t}_axe`); // mirrored
      expect(craft([m, m, _, _, 'stick', _, _, 'stick', _])?.name).toBe(`${t}_hoe`);
      expect(craft([_, m, m, _, 'stick', _, _, 'stick', _])?.name).toBe(`${t}_hoe`);
      expect(craft([_, m, _, _, 'stick', _, _, 'stick', _])?.name).toBe(`${t}_shovel`);
      expect(craft([_, _, m, _, _, m, _, _, 'stick'])?.name).toBe(`${t}_sword`);
    }
  });
  it('stone tools accept blackstone / cobbled deepslate', () => {
    expect(craft(['blackstone', 'cobblestone', 'cobbled_deepslate', _, 'stick', _, _, 'stick', _])?.name).toBe('stone_pickaxe');
  });
  it('pickaxe does not fit the 2x2 grid', () => {
    expect(craft(['iron_ingot', 'iron_ingot', _, 'stick'])).toBeNull();
  });
  it('armour', () => {
    for (const [t, m] of [['leather', 'leather'], ['iron', 'iron_ingot'], ['golden', 'gold_ingot'], ['diamond', 'diamond']]) {
      expect(craft([m, m, m, m, _, m, _, _, _])?.name).toBe(`${t}_helmet`);
      expect(craft([_, _, _, m, m, m, m, _, m])?.name).toBe(`${t}_helmet`);
      expect(craft([m, _, m, m, m, m, m, m, m])?.name).toBe(`${t}_chestplate`);
      expect(craft([m, m, m, m, _, m, m, _, m])?.name).toBe(`${t}_leggings`);
      expect(craft([m, _, m, m, _, m, _, _, _])?.name).toBe(`${t}_boots`);
    }
  });
  it('bow, arrows, fishing rod, shears, flint and steel, bucket', () => {
    expect(craft([_, 'stick', 'string', 'stick', _, 'string', _, 'stick', 'string'])?.name).toBe('bow');
    expect(craft(['flint', _, _, 'stick', _, _, 'feather', _, _])).toMatchObject({ name: 'arrow', count: 4 });
    expect(craft([_, _, 'stick', _, 'stick', 'string', 'stick', _, 'string'])?.name).toBe('fishing_rod');
    expect(craft([_, 'iron_ingot', 'iron_ingot', _])?.name).toBe('shears');
    expect(craft(['iron_ingot', _, _, 'flint'])?.name).toBe('flint_and_steel');
    expect(craft(['iron_ingot', _, 'iron_ingot', _, 'iron_ingot', _, _, _, _])?.name).toBe('bucket');
  });
});

describe('functional blocks', () => {
  it('torch with coal or charcoal', () => {
    expect(craft(['coal', _, 'stick', _])).toMatchObject({ name: 'torch', count: 4 });
    expect(craft([_, 'charcoal', _, 'stick'])).toMatchObject({ name: 'torch', count: 4 });
  });
  it('furnace from any stone crafting material', () => {
    const c = 'cobblestone', d = 'cobbled_deepslate', b = 'blackstone';
    expect(craft([c, d, b, c, _, c, c, c, c])?.name).toBe('furnace');
  });
  it('bookshelf, enchanting table, anvil, brewing stand, cauldron, hopper', () => {
    const p = 'oak_planks', k = 'book';
    expect(craft([p, p, p, k, k, k, p, p, p])?.name).toBe('bookshelf');
    expect(craft([_, 'book', _, 'diamond', 'obsidian', 'diamond', 'obsidian', 'obsidian', 'obsidian'])?.name).toBe('enchanting_table');
    const B = 'iron_block', i = 'iron_ingot';
    expect(craft([B, B, B, _, i, _, i, i, i])?.name).toBe('anvil');
    expect(craft([_, 'blaze_rod', _, 'cobblestone', 'cobblestone', 'cobblestone', _, _, _])?.name).toBe('brewing_stand');
    expect(craft([i, _, i, i, _, i, i, i, i])?.name).toBe('cauldron');
    expect(craft([i, _, i, i, 'chest', i, _, i, _])?.name).toBe('hopper');
  });
  it('smoker, blast furnace, lantern, chain, scaffolding, campfire', () => {
    expect(craft([_, 'oak_log', _, 'birch_log', 'furnace', 'oak_log', _, 'oak_log', _])?.name).toBe('smoker');
    expect(craft(['iron_ingot', 'iron_ingot', 'iron_ingot', 'iron_ingot', 'furnace', 'iron_ingot', 'smooth_stone', 'smooth_stone', 'smooth_stone'])?.name).toBe('blast_furnace');
    const n = 'iron_nugget';
    expect(craft([n, n, n, n, 'torch', n, n, n, n])?.name).toBe('lantern');
    expect(craft([_, n, _, _, 'iron_ingot', _, _, n, _])?.name).toBe('chain');
    expect(craft(['bamboo', 'string', 'bamboo', 'bamboo', _, 'bamboo', 'bamboo', _, 'bamboo'])).toMatchObject({ name: 'scaffolding', count: 6 });
    expect(craft([_, 'stick', _, 'stick', 'coal', 'stick', 'oak_log', 'oak_log', 'oak_log'])?.name).toBe('campfire');
  });
  it('beds and colours', () => {
    const p = 'oak_planks';
    expect(craft(['red_wool', 'red_wool', 'red_wool', p, 'spruce_planks', p, _, _, _])?.name).toBe('red_bed');
    expect(craft(['red_dye', 'white_wool', _, _])?.name).toBe('red_wool');
    expect(craft(['blue_wool', 'yellow_dye', _, _])?.name).toBe('yellow_wool');
    const g = 'glass';
    expect(craft([g, g, g, g, 'lime_dye', g, g, g, g])).toMatchObject({ name: 'lime_stained_glass', count: 8 });
    const t = 'terracotta';
    expect(craft([t, t, t, t, 'cyan_dye', t, t, t, t])).toMatchObject({ name: 'cyan_terracotta', count: 8 });
    expect(craft(['sand', 'gravel', 'red_sand', 'gravel', 'purple_dye', 'sand', 'gravel', 'sand', 'gravel'])).toMatchObject({ name: 'purple_concrete_powder', count: 8 });
    expect(craft(['white_wool', 'white_wool', _, _])).toMatchObject({ name: 'white_carpet', count: 3 });
    expect(craft([g, g, g, g, g, g, _, _, _])).toMatchObject({ name: 'glass_pane', count: 16 });
  });
  it('dyes from flowers and mixing', () => {
    expect(craft(['poppy', _, _, _])?.name).toBe('red_dye');
    expect(craft(['cornflower', _, _, _])?.name).toBe('blue_dye');
    expect(craft(['dandelion', _, _, _])?.name).toBe('yellow_dye');
    expect(craft(['sunflower', _, _, _])).toMatchObject({ name: 'yellow_dye', count: 2 });
    expect(craft(['blue_dye', 'red_dye', _, _])).toMatchObject({ name: 'purple_dye', count: 2 });
    expect(craft(['white_dye', _, 'black_dye', _])).toMatchObject({ name: 'gray_dye', count: 2 });
  });
});

describe('redstone', () => {
  it('components', () => {
    const r = 'redstone', c = 'cobblestone', s = 'stone';
    expect(craft([r, _, 'stick', _])?.name).toBe('redstone_torch');
    expect(craft(['redstone_torch', r, 'redstone_torch', s, s, s, _, _, _])?.name).toBe('repeater');
    expect(craft([_, 'redstone_torch', _, 'redstone_torch', 'quartz', 'redstone_torch', s, s, s])?.name).toBe('comparator');
    const p = 'oak_planks';
    expect(craft([p, p, p, c, 'iron_ingot', c, c, r, c])?.name).toBe('piston');
    expect(craft(['slime_ball', _, 'piston', _])?.name).toBe('sticky_piston');
    expect(craft([c, c, c, r, r, 'quartz', c, c, c])?.name).toBe('observer');
    expect(craft([c, c, c, c, 'bow', c, c, r, c])?.name).toBe('dispenser');
    expect(craft([c, c, c, c, _, c, c, r, c])?.name).toBe('dropper');
    expect(craft(['stick', _, c, _])?.name).toBe('lever');
    expect(craft(['stone', _, _, _])?.name).toBe('stone_button');
    expect(craft(['stone', 'stone', _, _])?.name).toBe('stone_pressure_plate');
    expect(craft(['gold_ingot', 'gold_ingot', _, _])?.name).toBe('light_weighted_pressure_plate');
    expect(craft([_, r, _, r, 'glowstone', r, _, r, _])?.name).toBe('redstone_lamp');
    expect(craft(['glass', 'glass', 'glass', 'quartz', 'quartz', 'quartz', 'oak_slab', 'birch_slab', 'oak_slab'])?.name).toBe('daylight_detector');
    expect(craft([_, r, _, r, 'hay_block', r, _, r, _])?.name).toBe('target');
    const gp = 'gunpowder';
    expect(craft([gp, 'sand', gp, 'red_sand', gp, 'sand', gp, 'sand', gp])?.name).toBe('tnt');
    expect(craft([p, p, p, p, r, p, p, p, p])?.name).toBe('note_block');
    expect(craft([p, p, p, p, 'diamond', p, p, p, p])?.name).toBe('jukebox');
    const i = 'iron_ingot';
    expect(craft([i, _, i, i, 'stick', i, i, _, i])).toMatchObject({ name: 'rail', count: 16 });
    expect(craft(['gold_ingot', _, 'gold_ingot', 'gold_ingot', 'stick', 'gold_ingot', 'gold_ingot', r, 'gold_ingot'])).toMatchObject({ name: 'powered_rail', count: 6 });
  });
});

describe('food, brewing ingredients, minerals', () => {
  it('food', () => {
    expect(craft(['wheat', 'wheat', 'wheat', _, _, _, _, _, _])?.name).toBe('bread');
    expect(craft(['wheat', 'cocoa_beans', 'wheat', _, _, _, _, _, _])).toMatchObject({ name: 'cookie', count: 8 });
    expect(craft(['pumpkin', 'sugar', 'egg', _])?.name).toBe('pumpkin_pie');
    const g = 'gold_ingot', n = 'gold_nugget';
    expect(craft([g, g, g, g, 'apple', g, g, g, g])?.name).toBe('golden_apple');
    expect(craft([n, n, n, n, 'carrot', n, n, n, n])?.name).toBe('golden_carrot');
    expect(craft([n, n, n, n, 'melon_slice', n, n, n, n])?.name).toBe('glistering_melon_slice');
    expect(craft(['bowl', 'red_mushroom', 'brown_mushroom', _])?.name).toBe('mushroom_stew');
    expect(craft(['sugar_cane', _, _, _])?.name).toBe('sugar');
  });
  it('cake leaves empty buckets', () => {
    const m = 'milk_bucket';
    const r = craft([m, m, m, 'sugar', 'egg', 'sugar', 'wheat', 'wheat', 'wheat']);
    expect(r?.name).toBe('cake');
    const grid = gridOf([m, m, m, 'sugar', 'egg', 'sugar', 'wheat', 'wheat', 'wheat'].map((c) => st(c)), 3);
    const rem = defaultRemainders(grid);
    expect(rem.slice(0, 3).map((s: any) => s?.item.name)).toEqual(['bucket', 'bucket', 'bucket']);
  });
  it('brewing ingredients and misc', () => {
    expect(craft(['ender_pearl', 'blaze_powder', _, _])?.name).toBe('ender_eye');
    expect(craft(['blaze_rod', _, _, _])).toMatchObject({ name: 'blaze_powder', count: 2 });
    expect(craft(['slime_ball', 'blaze_powder', _, _])?.name).toBe('magma_cream');
    expect(craft(['spider_eye', 'sugar', 'brown_mushroom', _])?.name).toBe('fermented_spider_eye');
    expect(craft(['gunpowder', 'blaze_powder', 'charcoal', _])).toMatchObject({ name: 'fire_charge', count: 3 });
    expect(craft(['glass', _, 'glass', _, 'glass', _, _, _, _])).toMatchObject({ name: 'glass_bottle', count: 3 });
  });
  it('mineral blocks <-> ingots and nuggets', () => {
    const i = 'iron_ingot';
    expect(craft([i, i, i, i, i, i, i, i, i])?.name).toBe('iron_block');
    expect(craft(['iron_block', _, _, _])).toMatchObject({ name: 'iron_ingot', count: 9 });
    expect(craft(['diamond_block', _, _, _])).toMatchObject({ name: 'diamond', count: 9 });
    expect(craft(['gold_ingot', _, _, _])).toMatchObject({ name: 'gold_nugget', count: 9 });
    const n = 'iron_nugget';
    expect(craft([n, n, n, n, n, n, n, n, n])?.name).toBe('iron_ingot');
    expect(craft(['redstone_block', _, _, _])).toMatchObject({ name: 'redstone', count: 9 });
    expect(craft(['lapis_block', _, _, _])).toMatchObject({ name: 'lapis_lazuli', count: 9 });
  });
  it('stone families', () => {
    const c = 'cobblestone';
    expect(craft([c, c, c, c, c, c, _, _, _])).toMatchObject({ name: 'cobblestone_wall', count: 6 });
    expect(craft([c, _, _, c, c, _, c, c, c])).toMatchObject({ name: 'cobblestone_stairs', count: 4 });
    expect(craft(['stone', 'stone', 'stone', 'stone'])).toMatchObject({ name: 'stone_bricks', count: 4 });
    const b = 'stone_bricks';
    expect(craft([b, b, b, b, b, b, _, _, _])).toMatchObject({ name: 'stone_brick_wall', count: 6 });
    expect(craft(['sand', 'sand', 'sand', 'sand'])?.name).toBe('sandstone');
    expect(craft(['clay_ball', 'clay_ball', 'clay_ball', 'clay_ball'])?.name).toBe('clay');
    expect(craft(['brick', 'brick', 'brick', 'brick'])?.name).toBe('bricks');
  });
  it('compass, clock, map', () => {
    const i = 'iron_ingot', g = 'gold_ingot', p = 'paper';
    expect(craft([_, i, _, i, 'redstone', i, _, i, _])?.name).toBe('compass');
    expect(craft([_, g, _, g, 'redstone', g, _, g, _])?.name).toBe('clock');
    expect(craft([p, p, p, p, 'compass', p, p, p, p])?.name).toBe('map');
  });
});

describe('special recipes', () => {
  it('repair two damaged tools (+5% bonus, keeps curses only)', () => {
    const a: ItemStack = { item: itemByName('iron_pickaxe'), count: 1, damage: 200, ench: { efficiency: 3, vanishing_curse: 1 } };
    const b: ItemStack = { item: itemByName('iron_pickaxe'), count: 1, damage: 150 };
    const m = findCraftingRecipe(gridOf([a, b, null, null], 2))!;
    expect(m.result.item.name).toBe('iron_pickaxe');
    // remaining 50 + 100 + 12 = 162 of 250 -> damage 88
    expect(m.result.damage).toBe(88);
    expect(m.result.ench).toEqual({ vanishing_curse: 1 });
  });
  it('tipped arrows from a lingering potion', () => {
    const a = 'arrow';
    const p: ItemStack = { item: itemByName('lingering_potion'), count: 1, damage: 0, data: { potion: 'swiftness' } };
    const cells = [a, a, a, a, null, a, a, a, a].map((c) => st(c));
    cells[4] = p;
    if (!tryItem('tipped_arrow')) return;
    const m = findCraftingRecipe(gridOf(cells, 3))!;
    expect(m.result).toMatchObject({ count: 8, data: { potion: 'swiftness' } });
    expect(m.result.item.name).toBe('tipped_arrow');
  });
  it('leather armour dyeing mixes colours', () => {
    const m = findCraftingRecipe(gridOf([st('leather_helmet'), st('red_dye'), null, null], 2))!;
    expect(m.result.item.name).toBe('leather_helmet');
    expect(m.result.data?.color).toBe(0xb02e26);
    expect(mixLeatherColor(undefined, ['red', 'yellow'])).toBe(mixLeatherColor(undefined, ['yellow', 'red']));
  });
  it('firework rocket', () => {
    const m = findCraftingRecipe(gridOf([st('paper'), st('gunpowder'), st('gunpowder'), null], 2))!;
    expect(m.result).toMatchObject({ count: 3, data: { flight: 2 } });
  });
});
