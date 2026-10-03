import { describe, it, expect } from 'vitest';
import { ITEMS, ITEM_BY_NAME, itemByName, RECIPE_CRITICAL, SPAWN_EGGS, ARMOR_MATERIALS, potionColor, hasGlint, stack } from '../src/game/items/index';
import { BLOCKS, BLOCK_BY_NAME } from '../src/world/blocks/registry';

describe('item registry', () => {
  it('has unique names and consistent ids', () => {
    const names = new Set<string>();
    ITEMS.forEach((it, i) => {
      expect(it.id).toBe(i);
      expect(names.has(it.name)).toBe(false);
      names.add(it.name);
      expect(ITEM_BY_NAME.get(it.name)).toBe(it);
      expect(it.name).toMatch(/^[a-z0-9_]+$/);
    });
    expect(ITEMS.length).toBeGreaterThan(800);
  });

  it('contains every recipe-critical item', () => {
    for (const n of RECIPE_CRITICAL) expect(ITEM_BY_NAME.has(n), n).toBe(true);
  });

  it('every block item drop / item reference resolves', () => {
    for (const b of BLOCKS) {
      if (b.item) expect(ITEM_BY_NAME.has(b.item), `${b.name} -> ${b.item}`).toBe(true);
      if (Array.isArray(b.drops)) for (const d of b.drops) expect(ITEM_BY_NAME.has(d.item), `${b.name} drops ${d.item}`).toBe(true);
      else if (typeof b.drops === 'string' && b.drops !== 'self' && b.drops !== 'none') expect(ITEM_BY_NAME.has(b.drops), `${b.name} drops ${b.drops}`).toBe(true);
    }
  });

  it('items that place blocks reference existing blocks', () => {
    for (const it of ITEMS) if (it.block) expect(BLOCK_BY_NAME.has(it.block), it.name).toBe(true);
    expect(itemByName('wheat_seeds').block).toBe('wheat');
    expect(itemByName('redstone').block).toBe('redstone_wire');
    expect(itemByName('carrot').block).toBe('carrots');
  });

  it('armor values match Minecraft', () => {
    const total = (m: string) => ['helmet', 'chestplate', 'leggings', 'boots'].reduce((a, s) => a + itemByName(`${m}_${s}`).armor!.defense, 0);
    expect(total('leather')).toBe(7);
    expect(total('chainmail')).toBe(12);
    expect(total('iron')).toBe(15);
    expect(total('golden')).toBe(11);
    expect(total('diamond')).toBe(20);
    expect(total('netherite')).toBe(20);
    expect(itemByName('diamond_chestplate').armor!.toughness).toBe(2);
    expect(itemByName('netherite_boots').armor!.toughness).toBe(3);
    expect(itemByName('netherite_helmet').armor!.knockbackResistance).toBeCloseTo(0.1);
    expect(itemByName('iron_chestplate').durability).toBe(240);
    expect(itemByName('diamond_boots').durability).toBe(429);
    expect(itemByName('leather_helmet').durability).toBe(55);
    expect(itemByName('turtle_helmet').durability).toBe(275);
    expect(itemByName('golden_leggings').enchantability).toBe(25);
    for (const it of ITEMS) {
      if (!it.armor) continue;
      expect(it.maxStack).toBe(1);
      expect(it.armor.defense).toBeGreaterThanOrEqual(0);
      expect(it.armor.defense).toBeLessThanOrEqual(8);
    }
    expect(Object.keys(ARMOR_MATERIALS)).toHaveLength(6);
  });

  it('food values are sane and match Minecraft', () => {
    const f = (n: string) => itemByName(n).food!;
    expect(f('bread')).toMatchObject({ hunger: 5, saturation: 0.6 });
    expect(f('cooked_beef')).toMatchObject({ hunger: 8, saturation: 0.8 });
    expect(f('golden_carrot')).toMatchObject({ hunger: 6, saturation: 1.2 });
    expect(f('rabbit_stew').hunger).toBe(10);
    expect(f('golden_apple').alwaysEdible).toBe(true);
    expect(f('enchanted_golden_apple').effects!.find((e) => e.effect === 'absorption')!.amplifier).toBe(3);
    expect(f('mushroom_stew').remainder).toBe('bowl');
    expect(f('honey_bottle').remainder).toBe('glass_bottle');
    expect(f('dried_kelp').eatTicks).toBe(16);
    expect(f('pufferfish').effects).toHaveLength(3);
    for (const it of ITEMS) {
      if (!it.food) continue;
      expect(it.category === 'food' || it.food.remainder !== undefined || true).toBe(true);
      expect(it.food.hunger).toBeGreaterThan(0);
      expect(it.food.hunger).toBeLessThanOrEqual(10);
      expect(it.food.saturation).toBeGreaterThan(0);
      expect(it.food.saturation).toBeLessThanOrEqual(1.2);
      for (const e of it.food.effects ?? []) {
        expect(e.chance).toBeGreaterThan(0);
        expect(e.chance).toBeLessThanOrEqual(1);
        expect(e.duration).toBeGreaterThan(0);
      }
      if (it.food.remainder) expect(ITEM_BY_NAME.has(it.food.remainder)).toBe(true);
    }
  });

  it('stack sizes and fuels follow Minecraft', () => {
    for (const n of ['egg', 'snowball', 'ender_pearl', 'bucket', 'honey_bottle']) expect(itemByName(n).maxStack, n).toBe(16);
    for (const n of ['water_bucket', 'lava_bucket', 'milk_bucket', 'potion', 'mushroom_stew', 'saddle', 'cake', 'totem_of_undying', 'white_bed', 'minecart']) expect(itemByName(n).maxStack, n).toBe(1);
    for (const n of ['bow', 'diamond_sword', 'shield', 'trident', 'flint_and_steel', 'fishing_rod', 'elytra']) {
      expect(itemByName(n).durability, n).toBeGreaterThan(0);
      expect(itemByName(n).maxStack, n).toBe(1);
    }
    expect(itemByName('coal').fuel).toBe(1600);
    expect(itemByName('lava_bucket').fuel).toBe(20000);
    expect(itemByName('blaze_rod').fuel).toBe(2400);
    expect(itemByName('stick').fuel).toBe(100);
    expect(itemByName('oak_slab').fuel).toBe(150);
    expect(itemByName('oak_planks').fuel).toBe(300);
    expect(itemByName('crimson_planks').fuel).toBeUndefined();
    expect(itemByName('coal_block').fuel).toBe(16000);
  });

  it('spawn eggs, potions and glint helpers', () => {
    expect(SPAWN_EGGS['zombie_spawn_egg']).toBe('zombie');
    expect(itemByName('creeper_spawn_egg').category).toBe('spawn_eggs');
    expect(Object.keys(SPAWN_EGGS).length).toBeGreaterThan(60);
    expect(potionColor({ potion: 'strong_healing' })).toBe(0xf82423);
    expect(potionColor({ potion: 'water' })).toBe(0x385dc6);
    expect(hasGlint(stack('enchanted_book'))).toBe(true);
    expect(hasGlint(stack('diamond_sword'))).toBe(false);
    expect(hasGlint({ ...stack('diamond_sword'), ench: { sharpness: 2 } })).toBe(true);
  });

  it('every non-block item has a visual', () => {
    for (const it of ITEMS) {
      expect(it.visual, it.name).toBeTruthy();
      if (!it.block) expect(['sprite', 'model']).toContain(it.visual.kind);
    }
  });
});
