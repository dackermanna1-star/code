/**
 * DEV/TEST ONLY: registers vanilla items that the item workstream normally provides, so the
 * container/crafting/brewing code can be exercised in unit tests and on the debug page before
 * the branches merge. Never imported by the game itself (the `?screen=` test harness loads it
 * dynamically). Existing registrations are left untouched.
 */
import { registerItem, tryItem, type ItemProps } from '../game/items/registry';

const DYES = ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black'];
const DYE_HEX = [0xf9fffe, 0xf9801d, 0xc74ebd, 0x3ab3da, 0xfed83d, 0x80c71f, 0xf38baa, 0x474f52, 0x9d9d97, 0x169c9c, 0x8932b8, 0x3c44aa, 0x835432, 0x5e7c16, 0xb02e26, 0x1d1d21];

function add(name: string, p: ItemProps = {}) {
  if (tryItem(name)) return;
  registerItem(name, p);
}

let done = false;
export function registerDevItems() {
  if (done) return;
  done = true;
  const ing = (n: string, color?: number, extra: ItemProps = {}) => add(n, { category: 'ingredients', visual: { kind: 'sprite', id: n, color }, ...extra });
  for (const [n, c] of [
    ['coal', 0x2b2b2b], ['charcoal', 0x3a2f25], ['iron_ingot', 0xd8d8d8], ['gold_ingot', 0xf6d33a], ['copper_ingot', 0xd27d4c], ['netherite_ingot', 0x4a3f3f],
    ['netherite_scrap', 0x5a4636], ['diamond', 0x5decf5], ['emerald', 0x17dd62], ['lapis_lazuli', 0x2a52be], ['redstone', 0xd01010], ['quartz', 0xeae5dd],
    ['raw_iron', 0xc9a98e], ['raw_gold', 0xe0b53a], ['raw_copper', 0xc46e4c], ['iron_nugget', 0xcfcfcf], ['gold_nugget', 0xf2d14b], ['flint', 0x3c3c3c],
    ['leather', 0x9c5a32], ['rabbit_hide', 0xc69c6d], ['string', 0xf0f0f0], ['feather', 0xf5f5f5], ['gunpowder', 0x5e5e5e], ['bone', 0xe8e4d4],
    ['bone_meal', 0xf2f0e6], ['paper', 0xf3f1e7], ['book', 0x7b4b2a], ['slime_ball', 0x7ccf5a], ['ender_pearl', 0x1d6f5f], ['ender_eye', 0x3d8a52],
    ['blaze_rod', 0xffc020], ['blaze_powder', 0xffa600], ['magma_cream', 0xf2741b], ['ghast_tear', 0xd9f6f6], ['glowstone_dust', 0xf8d775], ['sugar', 0xfafafa],
    ['spider_eye', 0x8a1d2a], ['fermented_spider_eye', 0x8c4a45], ['glistering_melon_slice', 0xf2c640], ['rabbit_foot', 0xc9a27a], ['phantom_membrane', 0xb9b3a2],
    ['turtle_scute', 0x47a043], ['clay_ball', 0xa4a8b8], ['brick', 0xb3593d], ['nether_brick', 0x4b2228], ['prismarine_shard', 0x5fa392], ['prismarine_crystals', 0xb9dfd2],
    ['amethyst_shard', 0xa477dd], ['echo_shard', 0x0b4d5a], ['honeycomb', 0xf0a52a], ['ink_sac', 0x26232c], ['glow_ink_sac', 0x3bd1c3], ['cocoa_beans', 0x6b3b1d],
    ['popped_chorus_fruit', 0xa080a0], ['nether_star', 0xf6f6e0], ['shulker_shell', 0x956e95], ['nautilus_shell', 0xe2d6c0], ['heart_of_the_sea', 0x2b8bd6],
    ['wheat', 0xd7b44a], ['wheat_seeds', 0x5a9b32], ['beetroot_seeds', 0xc9b48c], ['melon_seeds', 0x3a3a2a], ['pumpkin_seeds', 0xe3d8a6], ['bowl', 0x8a5c33],
    ['stick', 0x8a6a42], ['experience_bottle', 0x9fe86a], ['name_tag', 0xd8c7a0], ['lead', 0xc69c6d], ['saddle', 0x8f5733], ['snowball', 0xffffff], ['egg', 0xe8d9b5],
    ['glass_bottle', 0xcfe8f0], ['firework_star', 0x888888], ['firework_rocket', 0xc04040], ['item_frame', 0x8f6a3a], ['painting', 0xb0703a], ['armor_stand', 0x9a7a4a],
    ['tripwire_hook', 0x9a9a9a], ['minecart', 0x8a8a8a], ['writable_book', 0x7b4b2a], ['written_book', 0x7b4b2a], ['filled_map', 0xd8c89a], ['map', 0xd8c89a],
    ['music_disc_13', 0xe8c040], ['music_disc_cat', 0x60c040], ['music_disc_otherside', 0x3aa0c8], ['iron_horse_armor', 0xd0d0d0], ['golden_horse_armor', 0xf0c040], ['diamond_horse_armor', 0x60e0e0],
    ['dragon_breath', 0xe0a0d0], ['pufferfish', 0xe8c040], ['chorus_fruit', 0x8a5a8a],
  ] as [string, number][]) ing(n, c);
  add('enchanted_book', { maxStack: 1, rarity: 'uncommon', category: 'misc', visual: { kind: 'sprite', id: 'enchanted_book', color: 0x9b2fd0 } });
  for (let i = 0; i < DYES.length; i++) ing(`${DYES[i]}_dye`, DYE_HEX[i]);
  // food
  const food = (n: string, hunger: number, sat: number, color: number, extra: ItemProps = {}) => add(n, { category: 'food', food: { hunger, saturation: sat }, visual: { kind: 'sprite', id: n, color }, ...extra });
  food('apple', 4, 0.3, 0xd2262a); food('golden_apple', 4, 1.2, 0xf4cf3a, { rarity: 'rare' }); food('enchanted_golden_apple', 4, 1.2, 0xf4cf3a, { rarity: 'epic' });
  food('bread', 5, 0.6, 0xc8913f); food('cookie', 2, 0.1, 0xc07b3b); food('pumpkin_pie', 8, 0.3, 0xd38a2e); food('carrot', 3, 0.6, 0xff8c1a); food('potato', 1, 0.3, 0xd8b45c);
  food('baked_potato', 5, 0.6, 0xd59a3f); food('poisonous_potato', 2, 0.3, 0xb8c254); food('beetroot', 1, 0.6, 0x9b1f30); food('beetroot_soup', 6, 0.6, 0x9b1f30, { maxStack: 1 });
  food('mushroom_stew', 6, 0.6, 0xb08a60, { maxStack: 1 }); food('rabbit_stew', 10, 0.6, 0xb07040, { maxStack: 1 }); food('suspicious_stew', 6, 0.6, 0xb08a60, { maxStack: 1 });
  food('melon_slice', 2, 0.3, 0xe23d3d); food('sweet_berries', 2, 0.1, 0xb01b2e); food('glow_berries', 2, 0.1, 0xf0a43a); food('golden_carrot', 6, 1.2, 0xf4cf3a);
  for (const [raw, cooked, c1, c2] of [['beef', 'cooked_beef', 0xc8403a, 0x8a4a2a], ['porkchop', 'cooked_porkchop', 0xf09a9a, 0xc87a4a], ['mutton', 'cooked_mutton', 0xd84a4a, 0x9a5a3a], ['chicken', 'cooked_chicken', 0xf0c0b0, 0xd09a5a], ['rabbit', 'cooked_rabbit', 0xe0a090, 0xb07a4a], ['cod', 'cooked_cod', 0xb0a080, 0xd0b080], ['salmon', 'cooked_salmon', 0xd06050, 0xe08060]] as [string, string, number, number][]) {
    food(raw, 2, 0.3, c1);
    food(cooked, 6, 0.8, c2);
  }
  food('tropical_fish', 1, 0.1, 0xf08030); food('rotten_flesh', 4, 0.1, 0x8a4a3a); food('dried_kelp', 1, 0.3, 0x3a5a2a);
  add('milk_bucket', { maxStack: 1, category: 'food', visual: { kind: 'sprite', id: 'milk_bucket', color: 0xf8f8f8 } });
  // utilities
  const tool = (n: string, durability: number, extra: ItemProps = {}) => add(n, { durability, category: 'tools', visual: { kind: 'model', id: n }, ...extra });
  tool('bow', 384, { category: 'combat', enchantability: 1 }); tool('crossbow', 465, { category: 'combat', enchantability: 1 }); tool('fishing_rod', 64, { enchantability: 1 });
  tool('flint_and_steel', 64); tool('shield', 336, { category: 'combat' }); tool('trident', 250, { category: 'combat', enchantability: 1, attackDamage: 8, attackSpeed: 1.1 }); tool('elytra', 432, { category: 'transport', rarity: 'uncommon' });
  tool('carrot_on_a_stick', 25); tool('brush', 64);
  for (const n of ['arrow', 'spectral_arrow', 'tipped_arrow']) add(n, { category: 'combat', visual: { kind: 'sprite', id: n } });
  for (const n of ['compass', 'clock', 'spyglass']) add(n, { category: 'tools', maxStack: n === 'spyglass' ? 1 : 64, visual: { kind: 'sprite', id: n } });
  add('bucket', { maxStack: 16, category: 'tools', visual: { kind: 'sprite', id: 'bucket' } });
  add('water_bucket', { maxStack: 1, category: 'tools', visual: { kind: 'sprite', id: 'water_bucket' } });
  add('lava_bucket', { maxStack: 1, category: 'tools', fuel: 20000, visual: { kind: 'sprite', id: 'lava_bucket' } });
  for (const n of ['potion', 'splash_potion', 'lingering_potion']) add(n, { maxStack: 1, category: 'brewing', visual: { kind: 'sprite', id: n } });
  for (const w of ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak', 'cherry']) add(`${w}_boat`, { maxStack: 1, category: 'transport', fuel: 1200 });
  // armour
  const SLOTS = ['helmet', 'chestplate', 'leggings', 'boots'] as const;
  const SLOT_KEY = { helmet: 'head', chestplate: 'chest', leggings: 'legs', boots: 'feet' } as const;
  const MATS: [string, number[], number[], number, number, number][] = [
    ['leather', [1, 3, 2, 1], [55, 80, 75, 65], 15, 0, 0x9c5a32], ['chainmail', [2, 5, 4, 1], [165, 240, 225, 195], 12, 0, 0x9a9a9a],
    ['iron', [2, 6, 5, 2], [165, 240, 225, 195], 9, 0, 0xd8d8d8], ['golden', [2, 5, 3, 1], [77, 112, 105, 91], 25, 0, 0xf6d33a],
    ['diamond', [3, 8, 6, 3], [363, 528, 495, 429], 10, 2, 0x5decf5], ['netherite', [3, 8, 6, 3], [407, 592, 555, 481], 15, 3, 0x4a3f3f],
  ];
  for (const [m, def, dur, ench, tough, color] of MATS) {
    SLOTS.forEach((sl, i) => add(`${m}_${sl}`, { durability: dur[i], enchantability: ench, category: 'combat', armor: { slot: SLOT_KEY[sl], defense: def[i], toughness: tough, material: m === 'golden' ? 'gold' : m }, visual: { kind: 'model', id: `${m}_${sl}`, color } }));
  }
  add('turtle_helmet', { durability: 275, enchantability: 9, category: 'combat', armor: { slot: 'head', defense: 2, toughness: 0, material: 'turtle' } });
}
