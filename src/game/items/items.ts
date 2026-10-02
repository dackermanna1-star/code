/**
 * Every non-block Minecraft item (Java Edition ~1.20 ids) plus fix-ups of the auto-registered
 * block items (fuel values, stack sizes, creative categories, icon visuals).
 *
 * Pure data: importing this module only registers items (no DOM / GPU work), so it is safe in
 * workers-free unit tests. Behaviours live in `behaviors.ts` (installed by the item system).
 *
 * Values follow Minecraft: food hunger/saturation-modifier/effects (FoodProperties), armor
 * defense/toughness/knockback resistance/durability (ArmorMaterials), enchantability, furnace
 * burn times (AbstractFurnaceBlockEntity.getFuel) and max stack sizes.
 */
import { registerItem, ITEMS, type ItemCategory, type FoodSpec, type ItemProps, type ArmorSlot } from './registry';
import { BLOCK_BY_NAME } from '../../world/blocks/registry';
import { DYE_COLORS, WOOD_TYPES } from '../../world/blocks/blocks';

const sprite = (id: string, color?: number, color2?: number) => ({ kind: 'sprite' as const, id, color, color2 });
const model = (id: string, color?: number, color2?: number) => ({ kind: 'model' as const, id, color, color2 });

function item(name: string, category: ItemCategory, p: ItemProps = {}) {
  return registerItem(name, { category, ...p });
}

// =====================================================================================
// Dyes (DyeColor.textureDiffuseColor)
// =====================================================================================
export const DYE_ITEM_COLORS: Record<string, number> = {
  white: 0xf9fffe, orange: 0xf9801d, magenta: 0xc74ebd, light_blue: 0x3ab3da, yellow: 0xfed83d, lime: 0x80c71f,
  pink: 0xf38baa, gray: 0x474f52, light_gray: 0x9d9d97, cyan: 0x169c9c, purple: 0x8932b8, blue: 0x3c44aa,
  brown: 0x835432, green: 0x5e7c16, red: 0xb02e26, black: 0x1d1d21,
};
for (const c of DYE_COLORS) item(`${c}_dye`, 'ingredients', { visual: sprite('dye', DYE_ITEM_COLORS[c]) });

// =====================================================================================
// Raw materials & ingredients
// =====================================================================================
item('coal', 'ingredients', { fuel: 1600, visual: sprite('coal', 0x2a2a2c) });
item('charcoal', 'ingredients', { fuel: 1600, visual: sprite('coal', 0x3a2e26) });
item('raw_iron', 'ingredients', { visual: sprite('raw_ore', 0xd8af93, 0x8a6a56) });
item('raw_copper', 'ingredients', { visual: sprite('raw_ore', 0xe0835e, 0x8e4a2f) });
item('raw_gold', 'ingredients', { visual: sprite('raw_ore', 0xf8d045, 0xb07a14) });
item('iron_ingot', 'ingredients', { visual: sprite('ingot', 0xd8d8d8) });
item('copper_ingot', 'ingredients', { visual: sprite('ingot', 0xe2875a) });
item('gold_ingot', 'ingredients', { visual: sprite('ingot', 0xf6d23c) });
item('netherite_ingot', 'ingredients', { fireResistant: true, visual: sprite('ingot', 0x4a4246) });
item('netherite_scrap', 'ingredients', { fireResistant: true, visual: sprite('scrap', 0x5a4038) });
item('iron_nugget', 'ingredients', { visual: sprite('nugget', 0xdedede) });
item('gold_nugget', 'ingredients', { visual: sprite('nugget', 0xf8d84a) });
item('diamond', 'ingredients', { visual: sprite('diamond', 0x4aedd9) });
item('emerald', 'ingredients', { visual: sprite('emerald', 0x17dd62) });
item('lapis_lazuli', 'ingredients', { visual: sprite('lapis', 0x2453b8) });
item('quartz', 'ingredients', { visual: sprite('quartz', 0xeee8de) });
item('amethyst_shard', 'ingredients', { visual: sprite('shard', 0xa77be0, 0x6a3fb0) });
item('redstone', 'redstone', { block: 'redstone_wire', visual: sprite('dust', 0xd01010, 0x6e0000) });
item('flint', 'ingredients', { visual: sprite('flint', 0x3c3c40) });
item('clay_ball', 'ingredients', { visual: sprite('clay_ball', 0xa4aab8) });
item('brick', 'ingredients', { visual: sprite('brick', 0xa0503a) });
item('nether_brick', 'ingredients', { visual: sprite('brick', 0x3c1c22) });
item('glowstone_dust', 'ingredients', { visual: sprite('dust', 0xffd75a, 0xb88a1e) });
item('gunpowder', 'ingredients', { visual: sprite('dust', 0x6a6a6a, 0x2e2e2e) });
item('sugar', 'ingredients', { visual: sprite('dust', 0xfafafa, 0xc8c8d0) });
item('blaze_powder', 'brewing', { visual: sprite('dust', 0xffb21a, 0xc44a00) });
item('bone_meal', 'ingredients', { visual: sprite('bone_meal', 0xf2f0e6) });
item('string', 'ingredients', { visual: sprite('string', 0xf2f2f2) });
item('feather', 'ingredients', { visual: sprite('feather', 0xf4f4f4) });
item('leather', 'ingredients', { visual: sprite('hide', 0x9a5a32) });
item('rabbit_hide', 'ingredients', { visual: sprite('hide', 0xc89c6e) });
item('rabbit_foot', 'brewing', { visual: sprite('rabbit_foot', 0xd8b48a) });
item('bone', 'ingredients', { visual: sprite('bone', 0xece6d2) });
item('slime_ball', 'ingredients', { visual: sprite('ball', 0x6bd04e) });
item('magma_cream', 'brewing', { visual: sprite('magma_cream', 0xf08a1a) });
item('blaze_rod', 'ingredients', { fuel: 2400, visual: sprite('rod', 0xffc21a) });
item('ghast_tear', 'brewing', { visual: sprite('tear', 0xdff4f4) });
item('phantom_membrane', 'brewing', { visual: sprite('membrane', 0xc8c4b0) });
item('ender_pearl', 'misc', { maxStack: 16, visual: sprite('ender_pearl', 0x1b6a5c) });
item('ender_eye', 'misc', { visual: sprite('ender_eye', 0x2b8a3a) });
item('paper', 'ingredients', { visual: sprite('paper', 0xf2f0e8) });
item('book', 'ingredients', { visual: sprite('book', 0x7a3b1e) });
item('writable_book', 'tools', { maxStack: 1, visual: sprite('writable_book', 0x7a3b1e) });
item('written_book', 'tools', { maxStack: 16, visual: sprite('written_book', 0x7a3b1e) });
item('enchanted_book', 'tools', { maxStack: 1, rarity: 'uncommon', visual: sprite('enchanted_book', 0x7a2f8a) });
item('prismarine_shard', 'ingredients', { visual: sprite('shard', 0x7fc2b4, 0x3b7a6c) });
item('prismarine_crystals', 'ingredients', { visual: sprite('crystals', 0xd9f2e8) });
item('nautilus_shell', 'ingredients', { visual: sprite('nautilus_shell', 0xe8dcc8) });
item('heart_of_the_sea', 'ingredients', { rarity: 'uncommon', visual: sprite('heart_of_the_sea', 0x2a7ad8) });
item('scute', 'ingredients', { visual: sprite('scute', 0x47a043) });
item('shulker_shell', 'ingredients', { visual: sprite('shulker_shell', 0x956795) });
item('nether_star', 'ingredients', { rarity: 'uncommon', visual: sprite('nether_star', 0xf4f4ff) });
item('echo_shard', 'ingredients', { visual: sprite('shard', 0x0f4a5a, 0x062830) });
item('disc_fragment_5', 'ingredients', { visual: sprite('disc_fragment', 0x2f6c6c) });
item('honeycomb', 'ingredients', { visual: sprite('honeycomb', 0xf5a623) });
item('ink_sac', 'ingredients', { visual: sprite('ink_sac', 0x26232e) });
item('glow_ink_sac', 'ingredients', { visual: sprite('ink_sac', 0x1d8a7e, 0x8ff5d8) });
item('cocoa_beans', 'ingredients', { visual: sprite('cocoa_beans', 0x8a4e22) });
item('wheat', 'ingredients', { visual: sprite('wheat', 0xd8b04a) });
item('egg', 'combat', { maxStack: 16, visual: sprite('egg', 0xe8d6b0) });
item('snowball', 'combat', { maxStack: 16, visual: sprite('snowball', 0xf6f9ff) });
item('fermented_spider_eye', 'brewing', { visual: sprite('fermented_spider_eye', 0xb8545a) });
item('glistering_melon_slice', 'brewing', { visual: sprite('melon_slice', 0xe8443a, 0xf2cc3a) });
item('fire_charge', 'misc', { visual: sprite('fire_charge', 0x3a2418) });
item('firework_rocket', 'misc', { visual: sprite('firework_rocket', 0xc8382e) });
item('firework_star', 'misc', { visual: sprite('firework_star', 0x8a8a8a) });
item('experience_bottle', 'misc', { rarity: 'uncommon', visual: sprite('experience_bottle', 0x9cf05a) });
item('dragon_breath', 'brewing', { rarity: 'uncommon', visual: sprite('bottle', 0xd36ad8) });
item('bamboo', 'natural', { block: 'bamboo', fuel: 50, visual: sprite('bamboo', 0x6a9a2a) });
item('nether_wart', 'brewing', { block: 'nether_wart', visual: sprite('nether_wart', 0x9a1e24) });

// Seeds (place their crop blocks)
item('wheat_seeds', 'natural', { block: 'wheat', visual: sprite('seeds', 0x3f9a2a, 0x7cc23c) });
item('pumpkin_seeds', 'natural', { block: 'pumpkin_stem', visual: sprite('seeds', 0xe0d8a8, 0xbcae78) });
item('melon_seeds', 'natural', { block: 'melon_stem', visual: sprite('seeds', 0x2a2620, 0x4a3e30) });
item('beetroot_seeds', 'natural', { block: 'beetroots', visual: sprite('seeds', 0xb89a6a, 0x8a6a3a) });

// =====================================================================================
// Containers: buckets, bowls, bottles, potions
// =====================================================================================
item('bucket', 'tools', { maxStack: 16, visual: sprite('bucket', 0xc8c8c8) });
item('water_bucket', 'tools', { maxStack: 1, visual: sprite('bucket', 0xc8c8c8, 0x3f76e4) });
item('lava_bucket', 'tools', { maxStack: 1, fuel: 20000, visual: sprite('bucket', 0xc8c8c8, 0xff7a10) });
item('milk_bucket', 'food', { maxStack: 1, visual: sprite('bucket', 0xc8c8c8, 0xf4f4f0) });
item('powder_snow_bucket', 'tools', { maxStack: 1, visual: sprite('bucket', 0xc8c8c8, 0xe8f0ff) });
/** Mob buckets: item -> entity type spawned when emptied. */
export const MOB_BUCKETS: Record<string, string> = {
  cod_bucket: 'cod', salmon_bucket: 'salmon', pufferfish_bucket: 'pufferfish', tropical_fish_bucket: 'tropical_fish', axolotl_bucket: 'axolotl', tadpole_bucket: 'tadpole',
};
const MOB_BUCKET_COLORS: Record<string, number> = { cod_bucket: 0xb59a6a, salmon_bucket: 0xb84a3a, pufferfish_bucket: 0xe8c02a, tropical_fish_bucket: 0xef6915, axolotl_bucket: 0xf0a0c8, tadpole_bucket: 0x5a4030 };
for (const n of Object.keys(MOB_BUCKETS)) item(n, 'tools', { maxStack: 1, visual: sprite('mob_bucket', 0x3f76e4, MOB_BUCKET_COLORS[n]) });
item('bowl', 'ingredients', { fuel: 100, visual: sprite('bowl', 0x8a5a30) });
item('glass_bottle', 'brewing', { visual: sprite('bottle', 0) });

/** Potion colours (MobEffect colours; mixed for multi-effect potions). Keyed by potion id without long_/strong_. */
export const POTION_COLORS: Record<string, number> = {
  water: 0x385dc6, mundane: 0x385dc6, thick: 0x385dc6, awkward: 0x385dc6, uncraftable: 0xf800f8,
  night_vision: 0x1f1fa1, invisibility: 0x7f8392, leaping: 0x22ff4c, fire_resistance: 0xe49a3a, swiftness: 0x7cafc6,
  slowness: 0x5a6c81, turtle_master: 0x755c6a, water_breathing: 0x2e5299, healing: 0xf82423, harming: 0x430a09,
  poison: 0x4e9331, regeneration: 0xcd5cab, strength: 0x932423, weakness: 0x484d48, luck: 0x339900, slow_falling: 0xffefd1,
};
export function potionColor(data?: Record<string, any>): number {
  if (data?.color !== undefined) return data.color;
  const id = String(data?.potion ?? 'water').replace(/^(long_|strong_)/, '');
  return POTION_COLORS[id] ?? 0x385dc6;
}
item('potion', 'brewing', { maxStack: 1, visual: sprite('potion') });
item('splash_potion', 'brewing', { maxStack: 1, visual: sprite('splash_potion') });
item('lingering_potion', 'brewing', { maxStack: 1, visual: sprite('lingering_potion') });

// =====================================================================================
// Food (FoodProperties: nutrition, saturationModifier, effects)
// =====================================================================================
const eff = (effect: string, seconds: number, amplifier = 0, chance = 1) => ({ effect, duration: Math.round(seconds * 20), amplifier, chance });
function food(name: string, hunger: number, saturation: number, extra: Partial<FoodSpec> = {}, p: ItemProps = {}) {
  return item(name, 'food', { food: { hunger, saturation, ...extra }, ...p });
}
food('apple', 4, 0.3, {}, { visual: sprite('apple', 0xd8281e) });
food('golden_apple', 4, 1.2, { alwaysEdible: true, effects: [eff('regeneration', 5, 1), eff('absorption', 120, 0)] }, { rarity: 'rare', visual: sprite('apple', 0xf4c432) });
food('enchanted_golden_apple', 4, 1.2, { alwaysEdible: true, effects: [eff('regeneration', 20, 1), eff('resistance', 300, 0), eff('fire_resistance', 300, 0), eff('absorption', 120, 3)] }, { rarity: 'epic', visual: sprite('apple', 0xf4c432) });
food('bread', 5, 0.6, {}, { visual: sprite('bread', 0xc8862c) });
food('cookie', 2, 0.1, {}, { visual: sprite('cookie', 0xc8803a) });
food('pumpkin_pie', 8, 0.3, {}, { visual: sprite('pumpkin_pie', 0xe08a2a) });
food('carrot', 3, 0.6, {}, { block: 'carrots', category: 'food', visual: sprite('carrot', 0xf08a1a) });
food('golden_carrot', 6, 1.2, {}, { visual: sprite('carrot', 0xf6c63a) });
food('potato', 1, 0.3, {}, { block: 'potatoes', visual: sprite('potato', 0xc8a050) });
food('baked_potato', 5, 0.6, {}, { visual: sprite('baked_potato', 0xd8a040) });
food('poisonous_potato', 2, 0.3, { effects: [eff('poison', 5, 0, 0.6)] }, { visual: sprite('potato', 0xa8b050) });
food('beetroot', 1, 0.6, {}, { visual: sprite('beetroot', 0xa0222e) });
food('beetroot_soup', 6, 0.6, { remainder: 'bowl' }, { maxStack: 1, visual: sprite('stew', 0xa0222e) });
food('mushroom_stew', 6, 0.6, { remainder: 'bowl' }, { maxStack: 1, visual: sprite('stew', 0xa87a50) });
food('rabbit_stew', 10, 0.6, { remainder: 'bowl' }, { maxStack: 1, visual: sprite('stew', 0x9a6a3a, 0xe08a2a) });
food('suspicious_stew', 6, 0.6, { alwaysEdible: true, remainder: 'bowl' }, { maxStack: 1, visual: sprite('stew', 0xb08a50, 0xd83a3a) });
food('melon_slice', 2, 0.3, {}, { visual: sprite('melon_slice', 0xe8443a, 0x4a9a2a) });
food('sweet_berries', 2, 0.1, {}, { block: 'sweet_berry_bush', visual: sprite('berries', 0xc8202e) });
food('glow_berries', 2, 0.1, {}, { visual: sprite('berries', 0xf8a02a, 0xfff07a) });
food('dried_kelp', 1, 0.3, { eatTicks: 16 }, { visual: sprite('dried_kelp', 0x3a4a22) });
food('beef', 3, 0.3, {}, { visual: sprite('steak', 0xc83a3a, 0xf0d0c0) });
food('cooked_beef', 8, 0.8, {}, { displayName: 'Steak', visual: sprite('steak', 0x7a4424, 0xc89a6a) });
food('porkchop', 3, 0.3, {}, { displayName: 'Raw Porkchop', visual: sprite('porkchop', 0xf08a8a, 0xfae0d8) });
food('cooked_porkchop', 8, 0.8, {}, { visual: sprite('porkchop', 0xb87a4a, 0xe8c89a) });
food('chicken', 2, 0.3, { effects: [eff('hunger', 30, 0, 0.3)] }, { displayName: 'Raw Chicken', visual: sprite('drumstick', 0xf2c0b0) });
food('cooked_chicken', 6, 0.6, {}, { visual: sprite('drumstick', 0xc8803a) });
food('mutton', 2, 0.3, {}, { displayName: 'Raw Mutton', visual: sprite('mutton', 0xc8403a, 0xf0e0d0) });
food('cooked_mutton', 6, 0.8, {}, { visual: sprite('mutton', 0x8a4a2a, 0xd8b890) });
food('rabbit', 3, 0.3, {}, { displayName: 'Raw Rabbit', visual: sprite('rabbit_meat', 0xe8a0a0) });
food('cooked_rabbit', 5, 0.6, {}, { visual: sprite('rabbit_meat', 0xb87a3a) });
food('cod', 2, 0.1, {}, { displayName: 'Raw Cod', visual: sprite('fish', 0xb59a6a, 0xd8c8a0) });
food('cooked_cod', 5, 0.6, {}, { visual: sprite('cooked_fish', 0xd8b07a, 0xb07a3a) });
food('salmon', 2, 0.1, {}, { displayName: 'Raw Salmon', visual: sprite('fish', 0xb84a3a, 0x7a8a8a) });
food('cooked_salmon', 6, 0.8, {}, { visual: sprite('cooked_fish', 0xe08a5a, 0xa0522a) });
food('tropical_fish', 1, 0.1, {}, { visual: sprite('tropical_fish', 0xef6915, 0xfff9ef) });
food('pufferfish', 1, 0.1, { effects: [eff('hunger', 15, 2), eff('nausea', 15, 0), eff('poison', 60, 1)] }, { visual: sprite('pufferfish', 0xe8c02a) });
food('rotten_flesh', 4, 0.1, { effects: [eff('hunger', 30, 0, 0.8)] }, { visual: sprite('rotten_flesh', 0x8a6a3a, 0x5a7a2a) });
food('spider_eye', 2, 0.8, { effects: [eff('poison', 5, 0)] }, { visual: sprite('spider_eye', 0xa8222e) });
food('chorus_fruit', 4, 0.3, { alwaysEdible: true }, { category: 'food', visual: sprite('chorus_fruit', 0x8a5a9a) });
food('honey_bottle', 6, 0.1, { eatTicks: 40, remainder: 'glass_bottle' }, { maxStack: 16, visual: sprite('honey_bottle', 0xf5a623) });
registerItem('cake', { maxStack: 1, category: 'food' });

// =====================================================================================
// Tools & utilities
// =====================================================================================
item('flint_and_steel', 'tools', { durability: 64, visual: sprite('flint_and_steel') });
item('fishing_rod', 'tools', { durability: 64, enchantability: 1, fuel: 300, visual: sprite('fishing_rod') });
item('carrot_on_a_stick', 'tools', { durability: 25, enchantability: 1, visual: sprite('on_a_stick', 0xf08a1a) });
item('warped_fungus_on_a_stick', 'tools', { durability: 100, enchantability: 1, visual: sprite('on_a_stick', 0x1aa38a) });
item('compass', 'tools', { visual: sprite('compass') });
item('recovery_compass', 'tools', { visual: sprite('recovery_compass') });
item('clock', 'tools', { visual: sprite('clock') });
item('map', 'tools', { displayName: 'Empty Map', visual: sprite('map') });
item('spyglass', 'tools', { maxStack: 1, visual: sprite('spyglass') });
item('brush', 'tools', { durability: 64, visual: sprite('brush') });
item('lead', 'tools', { visual: sprite('lead') });
item('name_tag', 'tools', { visual: sprite('name_tag') });
item('saddle', 'transport', { maxStack: 1, visual: sprite('saddle') });
item('totem_of_undying', 'combat', { maxStack: 1, rarity: 'uncommon', visual: sprite('totem') });
item('elytra', 'transport', { durability: 432, rarity: 'uncommon', armor: { slot: 'chest', defense: 0, toughness: 0, material: 'elytra' }, visual: sprite('elytra') });
item('armor_stand', 'misc', { maxStack: 16, visual: sprite('armor_stand') });
item('item_frame', 'functional', { visual: sprite('item_frame', 0x8a5a30) });
item('glow_item_frame', 'functional', { visual: sprite('item_frame', 0x3aa0a0) });
item('painting', 'functional', { visual: sprite('painting') });
item('goat_horn', 'tools', { maxStack: 1, visual: sprite('goat_horn') });

// Transport
item('minecart', 'transport', { maxStack: 1, visual: sprite('minecart') });
item('chest_minecart', 'transport', { maxStack: 1, displayName: 'Minecart with Chest', visual: sprite('minecart', 0xa2783a) });
item('furnace_minecart', 'transport', { maxStack: 1, displayName: 'Minecart with Furnace', visual: sprite('minecart', 0x6e6e6e) });
item('hopper_minecart', 'transport', { maxStack: 1, displayName: 'Minecart with Hopper', visual: sprite('minecart', 0x3a3a40) });
item('tnt_minecart', 'transport', { maxStack: 1, displayName: 'Minecart with TNT', visual: sprite('minecart', 0xc8382e) });
const BOAT_WOOD: Record<string, number> = { oak: 0xa2834f, spruce: 0x725431, birch: 0xc5b07b, jungle: 0xa0714a, acacia: 0xa85a32, dark_oak: 0x4a3018, cherry: 0xe6b4b0 };
for (const w of WOOD_TYPES) {
  item(`${w}_boat`, 'transport', { maxStack: 1, fuel: 1200, visual: sprite('boat', BOAT_WOOD[w]) });
  item(`${w}_chest_boat`, 'transport', { maxStack: 1, displayName: `${titleCase(w)} Boat with Chest`, visual: sprite('chest_boat', BOAT_WOOD[w]) });
}
item('bamboo_raft', 'transport', { maxStack: 1, fuel: 1200, visual: sprite('boat', 0xc8b04a) });

// Music discs (label colour)
const DISCS: Record<string, number> = {
  '13': 0xf5c02d, cat: 0x6ac23a, blocks: 0xe0582f, chirp: 0xb52a2a, far: 0x9ed04c, mall: 0x7a54b5, mellohi: 0xd06ad0, stal: 0x303030,
  strad: 0xeeeeee, ward: 0x2e7e3a, '11': 0x2b2b2b, wait: 0x3aa0d8, otherside: 0x37a6a6, '5': 0x4e7b85, pigstep: 0xc0632a, relic: 0x2fb0a0,
};
for (const [d, c] of Object.entries(DISCS)) item(`music_disc_${d}`, 'tools', { maxStack: 1, rarity: 'rare', displayName: 'Music Disc', visual: sprite('music_disc', c) });

// =====================================================================================
// Combat: ranged weapons, ammunition, shield, trident
// =====================================================================================
item('bow', 'combat', { durability: 384, enchantability: 1, fuel: 300, visual: model('bow') });
item('crossbow', 'combat', { durability: 465, enchantability: 1, fuel: 300, visual: sprite('crossbow') });
item('arrow', 'combat', { visual: sprite('arrow') });
item('spectral_arrow', 'combat', { visual: sprite('arrow', 0xf2d24a) });
item('tipped_arrow', 'combat', { visual: sprite('tipped_arrow') });
item('trident', 'combat', { durability: 250, enchantability: 1, attackDamage: 8, attackSpeed: 1.1, rarity: 'rare', tags: ['tridents'], visual: model('trident') });
item('shield', 'combat', { durability: 336, visual: model('shield') });

// Armor (ArmorMaterials: durability multiplier, defense per slot [feet, legs, chest, head], toughness, kb resistance, enchantability)
export interface ArmorMaterialDef { durability: number; defense: [number, number, number, number]; toughness: number; knockback: number; enchantability: number; color: number; fireResistant?: boolean }
export const ARMOR_MATERIALS: Record<string, ArmorMaterialDef> = {
  leather: { durability: 5, defense: [1, 2, 3, 1], toughness: 0, knockback: 0, enchantability: 15, color: 0xa06540 },
  chainmail: { durability: 15, defense: [1, 4, 5, 2], toughness: 0, knockback: 0, enchantability: 12, color: 0x8c8c8c },
  iron: { durability: 15, defense: [2, 5, 6, 2], toughness: 0, knockback: 0, enchantability: 9, color: 0xd8d8d8 },
  golden: { durability: 7, defense: [1, 3, 5, 2], toughness: 0, knockback: 0, enchantability: 25, color: 0xf6d23c },
  diamond: { durability: 33, defense: [3, 6, 8, 3], toughness: 2, knockback: 0, enchantability: 10, color: 0x4aedd9 },
  netherite: { durability: 37, defense: [3, 6, 8, 3], toughness: 3, knockback: 0.1, enchantability: 15, color: 0x4a4246, fireResistant: true },
};
/** ArmorItem.Type health per slot. */
const SLOT_HEALTH: Record<ArmorSlot, number> = { feet: 13, legs: 15, chest: 16, head: 11 };
const SLOT_ITEM: Record<ArmorSlot, string> = { head: 'helmet', chest: 'chestplate', legs: 'leggings', feet: 'boots' };
const SLOT_INDEX: Record<ArmorSlot, number> = { feet: 0, legs: 1, chest: 2, head: 3 };
for (const [mat, m] of Object.entries(ARMOR_MATERIALS)) {
  for (const slot of ['head', 'chest', 'legs', 'feet'] as ArmorSlot[]) {
    item(`${mat}_${SLOT_ITEM[slot]}`, 'combat', {
      durability: SLOT_HEALTH[slot] * m.durability,
      enchantability: m.enchantability,
      fireResistant: m.fireResistant,
      armor: { slot, defense: m.defense[SLOT_INDEX[slot]], toughness: m.toughness, knockbackResistance: m.knockback || undefined, material: mat === 'golden' ? 'gold' : mat },
      visual: sprite(SLOT_ITEM[slot], m.color, mat === 'chainmail' ? 1 : mat === 'leather' ? 2 : undefined),
      tags: ['armor', `${mat}_armor`],
    });
  }
}
item('turtle_helmet', 'combat', { durability: 275, enchantability: 9, armor: { slot: 'head', defense: 2, toughness: 0, material: 'turtle' }, visual: sprite('turtle_helmet', 0x47a043), tags: ['armor'] });
for (const [m, c] of [['leather', 0xa06540], ['iron', 0xd8d8d8], ['golden', 0xf6d23c], ['diamond', 0x4aedd9]] as [string, number][]) {
  item(`${m}_horse_armor`, 'combat', { maxStack: 1, visual: sprite('horse_armor', c) });
}

// =====================================================================================
// Spawn eggs (SpawnEggItem colours)
// =====================================================================================
export const SPAWN_EGG_COLORS: Record<string, [number, number]> = {
  allay: [0x00daff, 0x00adff], axolotl: [0xfbc1e3, 0xa62d74], bat: [0x4c3e30, 0x0f0f0f], bee: [0xedc343, 0x43241b], blaze: [0xf6b201, 0xfff87e],
  camel: [0xfcc369, 0xcb9337], cat: [0xefc88e, 0x957256], cave_spider: [0x0c424e, 0xa80e0e], chicken: [0xa1a1a1, 0xff0000], cod: [0xc1a76a, 0xe5c48b],
  cow: [0x443626, 0xa1a1a1], creeper: [0x0da70b, 0x000000], dolphin: [0x223b4d, 0xf9f9f9], donkey: [0x534539, 0x867566], drowned: [0x8ff1d7, 0x799c65],
  elder_guardian: [0xceccba, 0x747693], enderman: [0x161616, 0x000000], endermite: [0x161616, 0x6e6e6e], evoker: [0x959b9b, 0x1e1c1a], fox: [0xd5b69f, 0xcc6920],
  frog: [0xd07444, 0xffc77c], ghast: [0xf9f9f9, 0xbcbcbc], glow_squid: [0x095656, 0x85f1bc], goat: [0xa5947c, 0x55493e], guardian: [0x5a8272, 0xf17d30],
  hoglin: [0xc66e55, 0x5f6464], horse: [0xc09e7d, 0xeee500], husk: [0x797061, 0xe6cc94], iron_golem: [0xdbcdc2, 0x74a332], llama: [0xc09e7d, 0x995f40],
  magma_cube: [0x340000, 0xfcfc00], mooshroom: [0xa00f10, 0xb7b7b7], mule: [0x1b0200, 0x51331d], ocelot: [0xefde7d, 0x564434], panda: [0xe7e7e7, 0x1b1b22],
  parrot: [0x0da70b, 0xff0000], phantom: [0x43518a, 0x88ff00], pig: [0xf0a5a2, 0xdb635f], piglin: [0x995f40, 0xf9f3a4], piglin_brute: [0x592a10, 0xf9f3a4],
  pillager: [0x532f36, 0x959b9b], polar_bear: [0xf2f2f2, 0x959590], pufferfish: [0xf6b201, 0x37c3f2], rabbit: [0x995f40, 0x734831], ravager: [0x757470, 0x5b5049],
  salmon: [0xa00f10, 0x0e8474], sheep: [0xe7e7e7, 0xffb5b5], shulker: [0x946794, 0x4d3852], silverfish: [0x6e6e6e, 0x303030], skeleton: [0xc1c1c1, 0x494949],
  skeleton_horse: [0x68684f, 0xe5e5d8], slime: [0x51a03e, 0x7ebf6e], snow_golem: [0xd9f2f2, 0x81a4a4], spider: [0x342d27, 0xa80e0e], squid: [0x223b4d, 0x708899],
  stray: [0x617677, 0xddeaea], strider: [0x9c3436, 0x4d494d], tadpole: [0x6d533d, 0x160a00], trader_llama: [0xeaa430, 0x456296], tropical_fish: [0xef6915, 0xfff9ef],
  turtle: [0xe7e7e7, 0x00afaf], vex: [0x7a90a4, 0xe8edf1], villager: [0x563c33, 0xbd8b72], vindicator: [0x959b9b, 0x275e61], wandering_trader: [0x456296, 0xeaa430],
  warden: [0x0f4649, 0x39d6e0], witch: [0x340000, 0x51a03e], wither_skeleton: [0x141414, 0x474d4d], wolf: [0xd7d3d3, 0xceaf96], zoglin: [0xc66e55, 0xe6e6e6],
  zombie: [0x00afaf, 0x799c65], zombie_horse: [0x315234, 0x97c284], zombie_villager: [0x563c33, 0x799c65], zombified_piglin: [0xea9393, 0x4c7129],
};
/** Spawn egg item name -> entity type. */
export const SPAWN_EGGS: Record<string, string> = {};
for (const [type, [a, b]] of Object.entries(SPAWN_EGG_COLORS)) {
  const name = `${type}_spawn_egg`;
  SPAWN_EGGS[name] = type;
  item(name, 'spawn_eggs', { visual: sprite('spawn_egg', a, b) });
}

// =====================================================================================
// Fix-ups of auto-registered block items
// =====================================================================================
function titleCase(name: string) {
  return name.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
const NETHER_WOOD = /^(crimson|warped)_/;
for (const it of ITEMS) {
  const b = it.block ? BLOCK_BY_NAME.get(it.block) : undefined;
  if (!b || it.block !== it.name) continue;
  const n = it.name;
  // Furnace fuel (AbstractFurnaceBlockEntity.getFuel)
  if (NETHER_WOOD.test(n)) it.fuel = undefined;
  else if (b.tags.includes('wooden_slabs')) it.fuel = 150;
  else if (b.tags.includes('buttons') && b.sound === 'wood') it.fuel = 100;
  else if (b.tags.includes('wooden_doors')) it.fuel = 200;
  else if (b.tags.includes('sapling') || b.tags.includes('wool')) it.fuel = 100;
  else if (b.tags.includes('carpets')) it.fuel = 67;
  else if (n === 'ladder' || n === 'bookshelf' || n === 'chest' || n === 'trapped_chest' || n === 'crafting_table' || n === 'barrel' || n === 'jukebox' || n === 'note_block' || n === 'daylight_detector') it.fuel = 300;
  else if (n === 'scaffolding' || n === 'bamboo') it.fuel = 50;
  else if (n === 'coal_block') it.fuel = 16000;
  else if (b.sound === 'wood' && it.fuel === 300 && !b.tags.some((t) => ['logs', 'planks', 'stairs', 'fences', 'fence_gates', 'trapdoors', 'pressure_plates'].includes(t))) it.fuel = undefined;
  // Stack sizes
  if (/_sign$|_banner$|_hanging_sign$/.test(n)) it.maxStack = 16;
  if (b.shape === 'bed' || n === 'cake') it.maxStack = 1;
  // Creative categories (Minecraft creative tabs)
  const shaped = b.shape === 'stairs' || b.shape === 'slab' || b.shape === 'wall';
  if (shaped || b.tags.includes('stone_bricks') || /^(polished_|chiseled_|cut_|smooth_|cracked_)/.test(n) || /_bricks$|_tiles$/.test(n)) it.category = 'building';
  if (/_(wool|carpet|concrete|concrete_powder|terracotta|stained_glass)$/.test(n) || n === 'terracotta' || n === 'glass' || n === 'glass_pane') it.category = 'building';
  if (b.shape === 'bed') it.category = 'functional';
  if (/_(fence_gate|door|trapdoor|button|pressure_plate)$/.test(n)) it.category = /^(iron|stone|light_weighted|heavy_weighted)_/.test(n) ? 'redstone' : 'building';
  if (/^(bedrock|dead_bush|sunflower|lilac|rose_bush|peony|cobweb|sea_pickle|glow_lichen|chorus_plant|farmland|dirt_path|glowstone|shroomlight|crimson_stem|warped_stem)$/.test(n)) it.category = 'natural';
  if (/^(end_portal_frame|end_rod|dragon_egg|barrier|sea_lantern)$/.test(n)) it.category = 'functional';
  if (/^(redstone_torch|lever|tnt|target|redstone_lamp|redstone_block)$/.test(n)) it.category = 'redstone';
}
// Block items whose Minecraft icon is a painted item sprite rather than the block model
registerItem('nether_wart', { category: 'brewing', visual: sprite('nether_wart', 0x9a1e24) });

/** Items with Minecraft's enchantment glint even without enchantments. */
export const ALWAYS_GLINT = new Set(['enchanted_book', 'enchanted_golden_apple', 'experience_bottle', 'nether_star', 'written_book']);
export function hasGlint(stack: { item: { name: string }; ench?: Record<string, number> }): boolean {
  return ALWAYS_GLINT.has(stack.item.name) || (!!stack.ench && Object.keys(stack.ench).length > 0);
}

/** Item names that every crafting/smelting/brewing workstream relies on (checked by tests). */
export const RECIPE_CRITICAL = [
  'stick', 'coal', 'charcoal', 'iron_ingot', 'gold_ingot', 'copper_ingot', 'netherite_ingot', 'netherite_scrap', 'iron_nugget', 'gold_nugget', 'diamond', 'emerald', 'lapis_lazuli',
  'redstone', 'quartz', 'amethyst_shard', 'flint', 'clay_ball', 'brick', 'nether_brick', 'glowstone_dust', 'gunpowder', 'string', 'feather', 'leather', 'paper', 'book',
  'bone', 'bone_meal', 'slime_ball', 'blaze_rod', 'blaze_powder', 'ender_pearl', 'ender_eye', 'ghast_tear', 'magma_cream', 'sugar', 'wheat', 'wheat_seeds', 'egg', 'milk_bucket',
  'bucket', 'water_bucket', 'lava_bucket', 'glass_bottle', 'potion', 'splash_potion', 'lingering_potion', 'bowl', 'raw_iron', 'raw_gold', 'raw_copper', 'nether_wart',
  'fermented_spider_eye', 'spider_eye', 'glistering_melon_slice', 'golden_carrot', 'rabbit_foot', 'phantom_membrane', 'dragon_breath', 'prismarine_crystals', 'prismarine_shard',
  'ink_sac', 'cocoa_beans', 'apple', 'golden_apple', 'carrot', 'potato', 'beef', 'cooked_beef', 'porkchop', 'cooked_porkchop', 'chicken', 'cooked_chicken', 'mutton',
  'cooked_mutton', 'rabbit', 'cooked_rabbit', 'cod', 'cooked_cod', 'salmon', 'cooked_salmon', 'kelp', 'dried_kelp', 'bow', 'arrow', 'shield', 'flint_and_steel', 'compass',
  'clock', 'map', 'name_tag', 'lead', 'saddle', 'fishing_rod', 'shears', 'snowball', 'fire_charge', 'melon_slice', 'pumpkin_seeds', 'melon_seeds', 'beetroot', 'beetroot_seeds',
  ...DYE_COLORS.map((c) => `${c}_dye`),
];

