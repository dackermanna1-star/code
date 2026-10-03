/**
 * Vanilla (Java 1.20) crafting recipes as data. Items are referenced by Minecraft id; recipes
 * whose items are not registered are skipped at compile time (see recipes.ts).
 */
import type { RecipeDef } from './recipes';
import type { Ingredient } from './ingredients';
import { ALL_WOODS, DYES } from './ingredients';

const out: RecipeDef[] = [];
/** Shaped recipe. */
function S(result: string, count: number, pattern: string[], key: Record<string, Ingredient>, id?: string) {
  out.push({ type: 'shaped', result, count, pattern, key, id: id ?? `${result}#s${out.length}` });
}
/** Shapeless recipe. */
function L(result: string, count: number, ingredients: Ingredient[], id?: string) {
  out.push({ type: 'shapeless', result, count, ingredients, id: id ?? `${result}#l${out.length}` });
}
const rep = <T>(x: T, n: number): T[] => Array.from({ length: n }, () => x);

// ------------------------------------------------------------------------------------ wood
const BOAT_WOODS = ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak', 'mangrove', 'cherry'];
for (const w of ALL_WOODS) {
  const planks = `${w}_planks`;
  const nether = w === 'crimson' || w === 'warped';
  if (w === 'bamboo') L(planks, 2, ['#bamboo_blocks'], 'bamboo_planks');
  else L(planks, 4, [nether ? `#${w}_stems` : `#${w}_logs`], planks);
  if (nether) {
    S(`${w}_hyphae`, 3, ['##', '##'], { '#': `${w}_stem` });
    S(`stripped_${w}_hyphae`, 3, ['##', '##'], { '#': `stripped_${w}_stem` });
  } else if (w !== 'bamboo') {
    S(`${w}_wood`, 3, ['##', '##'], { '#': `${w}_log` });
    S(`stripped_${w}_wood`, 3, ['##', '##'], { '#': `stripped_${w}_log` });
  } else {
    S('bamboo_block', 1, ['###', '###', '###'], { '#': 'bamboo' });
  }
  S(`${w}_slab`, 6, ['###'], { '#': planks });
  S(`${w}_stairs`, 4, ['#  ', '## ', '###'], { '#': planks });
  S(`${w}_fence`, 3, ['W#W', 'W#W'], { W: planks, '#': 'stick' });
  S(`${w}_fence_gate`, 1, ['#W#', '#W#'], { W: planks, '#': 'stick' });
  S(`${w}_door`, 3, ['##', '##', '##'], { '#': planks });
  S(`${w}_trapdoor`, 2, ['###', '###'], { '#': planks });
  S(`${w}_pressure_plate`, 1, ['##'], { '#': planks });
  L(`${w}_button`, 1, [planks]);
  S(`${w}_sign`, 3, ['###', '###', ' X '], { '#': planks, X: 'stick' });
  const strippedLog = nether ? `stripped_${w}_stem` : w === 'bamboo' ? 'stripped_bamboo_block' : `stripped_${w}_log`;
  S(`${w}_hanging_sign`, 6, ['X X', '###', '###'], { X: 'chain', '#': strippedLog });
  if (BOAT_WOODS.includes(w)) {
    S(`${w}_boat`, 1, ['# #', '###'], { '#': planks });
    L(`${w}_chest_boat`, 1, ['chest', `${w}_boat`]);
  }
}
S('bamboo_raft', 1, ['# #', '###'], { '#': 'bamboo_planks' });
L('bamboo_chest_raft', 1, ['chest', 'bamboo_raft']);
S('bamboo_mosaic', 1, ['#', '#'], { '#': 'bamboo_slab' });
S('stick', 4, ['#', '#'], { '#': '#planks' }, 'stick');
S('stick', 1, ['#', '#'], { '#': 'bamboo' }, 'stick_from_bamboo_item');
S('crafting_table', 1, ['##', '##'], { '#': '#planks' }, 'crafting_table');
S('chest', 1, ['###', '# #', '###'], { '#': '#planks' }, 'chest');
L('trapped_chest', 1, ['chest', 'tripwire_hook']);
S('barrel', 1, ['PSP', 'P P', 'PSP'], { P: '#planks', S: '#wooden_slabs' });
S('bookshelf', 1, ['###', 'XXX', '###'], { '#': '#planks', X: 'book' });
S('chiseled_bookshelf', 1, ['###', 'XXX', '###'], { '#': '#planks', X: '#wooden_slabs' });
S('lectern', 1, ['SSS', ' B ', ' S '], { S: '#wooden_slabs', B: 'bookshelf' });
S('jukebox', 1, ['###', '#X#', '###'], { '#': '#planks', X: 'diamond' });
S('note_block', 1, ['###', '#X#', '###'], { '#': '#planks', X: 'redstone' });
S('composter', 1, ['# #', '# #', '###'], { '#': '#wooden_slabs' });
S('loom', 1, ['@@', '##'], { '@': 'string', '#': '#planks' });
S('cartography_table', 1, ['@@', '##', '##'], { '@': 'paper', '#': '#planks' });
S('fletching_table', 1, ['@@', '##', '##'], { '@': 'flint', '#': '#planks' });
S('smithing_table', 1, ['@@', '##', '##'], { '@': 'iron_ingot', '#': '#planks' });
S('grindstone', 1, ['I-I', '# #'], { I: 'stick', '-': 'stone_slab', '#': '#planks' });
S('stonecutter', 1, [' I ', '###'], { I: 'iron_ingot', '#': 'stone' });
S('bowl', 4, ['# #', ' # '], { '#': '#planks' });
S('ladder', 3, ['# #', '###', '# #'], { '#': 'stick' });
S('beehive', 1, ['PPP', 'HHH', 'PPP'], { P: '#planks', H: 'honeycomb' });
S('painting', 1, ['###', '#X#', '###'], { '#': 'stick', X: '#wool' });
S('item_frame', 1, ['###', '#X#', '###'], { '#': 'stick', X: 'leather' });
L('glow_item_frame', 1, ['item_frame', 'glow_ink_sac']);
S('armor_stand', 1, ['///', ' / ', '/_/'], { '/': 'stick', _: 'smooth_stone_slab' });
S('flower_pot', 1, ['# #', ' # '], { '#': 'brick' });
S('scaffolding', 6, ['I~I', 'I I', 'I I'], { I: 'bamboo', '~': 'string' });
S('campfire', 1, [' S ', 'SCS', 'LLL'], { S: 'stick', C: '#coals', L: '#logs' });
S('soul_campfire', 1, [' S ', 'SCS', 'LLL'], { S: 'stick', C: '#soul_fire_base_blocks', L: '#logs' });

// ------------------------------------------------------------------------------------ light & utility
S('torch', 4, ['X', '#'], { X: ['coal', 'charcoal'], '#': 'stick' }, 'torch');
S('soul_torch', 4, ['X', '#', 'S'], { X: ['coal', 'charcoal'], '#': 'stick', S: '#soul_fire_base_blocks' });
S('lantern', 1, ['XXX', 'X#X', 'XXX'], { X: 'iron_nugget', '#': 'torch' });
S('soul_lantern', 1, ['XXX', 'X#X', 'XXX'], { X: 'iron_nugget', '#': 'soul_torch' });
S('furnace', 1, ['###', '# #', '###'], { '#': '#stone_crafting_materials' }, 'furnace');
S('smoker', 1, [' # ', '#X#', ' # '], { '#': '#logs', X: 'furnace' });
S('blast_furnace', 1, ['III', 'IXI', '###'], { I: 'iron_ingot', X: 'furnace', '#': 'smooth_stone' });
S('enchanting_table', 1, [' B ', 'D#D', '###'], { B: 'book', D: 'diamond', '#': 'obsidian' });
S('anvil', 1, ['III', ' i ', 'iii'], { I: 'iron_block', i: 'iron_ingot' });
S('brewing_stand', 1, [' B ', '###'], { B: 'blaze_rod', '#': '#stone_crafting_materials' });
S('cauldron', 1, ['# #', '# #', '###'], { '#': 'iron_ingot' });
S('hopper', 1, ['I I', 'ICI', ' I '], { I: 'iron_ingot', C: 'chest' });
S('bucket', 1, ['# #', ' # '], { '#': 'iron_ingot' });
S('shears', 1, [' #', '# '], { '#': 'iron_ingot' });
L('flint_and_steel', 1, ['iron_ingot', 'flint']);
S('compass', 1, [' # ', '#X#', ' # '], { '#': 'iron_ingot', X: 'redstone' });
S('recovery_compass', 1, ['SSS', 'SCS', 'SSS'], { S: 'echo_shard', C: 'compass' });
S('clock', 1, [' # ', '#X#', ' # '], { '#': 'gold_ingot', X: 'redstone' });
S('map', 1, ['###', '#X#', '###'], { '#': 'paper', X: 'compass' });
S('spyglass', 1, [' # ', ' X ', ' X '], { '#': 'amethyst_shard', X: 'copper_ingot' });
S('brush', 1, ['X', '#', 'I'], { X: 'feather', '#': 'copper_ingot', I: 'stick' });
S('fishing_rod', 1, ['  #', ' #X', '# X'], { '#': 'stick', X: 'string' });
S('carrot_on_a_stick', 1, ['# ', ' X'], { '#': 'fishing_rod', X: 'carrot' });
S('warped_fungus_on_a_stick', 1, ['# ', ' X'], { '#': 'fishing_rod', X: 'warped_fungus' });
S('lead', 2, ['~~ ', '~O ', '  ~'], { '~': 'string', O: 'slime_ball' });
L('book', 1, ['paper', 'paper', 'paper', 'leather']);
L('writable_book', 1, ['book', 'ink_sac', 'feather']);
S('paper', 3, ['###'], { '#': 'sugar_cane' });
S('glass_bottle', 3, ['# #', ' # '], { '#': 'glass' });
S('ender_chest', 1, ['###', '#E#', '###'], { '#': 'obsidian', E: 'ender_eye' });
S('beacon', 1, ['GGG', 'GSG', 'OOO'], { G: 'glass', S: 'nether_star', O: 'obsidian' });
S('conduit', 1, ['###', '#X#', '###'], { '#': 'nautilus_shell', X: 'heart_of_the_sea' });
S('respawn_anchor', 1, ['OOO', 'GGG', 'OOO'], { O: 'crying_obsidian', G: 'glowstone' });
S('lodestone', 1, ['SSS', 'S#S', 'SSS'], { S: 'chiseled_stone_bricks', '#': 'netherite_ingot' });
S('end_crystal', 1, ['GGG', 'GEG', 'GTG'], { G: 'glass', E: 'ender_eye', T: 'ghast_tear' });
S('end_rod', 4, ['/', '#'], { '/': 'blaze_rod', '#': 'popped_chorus_fruit' });
S('shulker_box', 1, ['-', '#', '-'], { '-': 'shulker_shell', '#': 'chest' });
S('candle', 1, ['S', 'H'], { S: 'string', H: 'honeycomb' });
S('chain', 1, ['N', 'I', 'N'], { N: 'iron_nugget', I: 'iron_ingot' });
S('lightning_rod', 1, ['#', '#', '#'], { '#': 'copper_ingot' });
S('tinted_glass', 2, [' S ', 'SGS', ' S '], { S: 'amethyst_shard', G: 'glass' });
S('iron_bars', 16, ['###', '###'], { '#': 'iron_ingot' });
S('iron_door', 3, ['##', '##', '##'], { '#': 'iron_ingot' });
S('iron_trapdoor', 1, ['##', '##'], { '#': 'iron_ingot' });
S('minecart', 1, ['# #', '###'], { '#': 'iron_ingot' });
L('chest_minecart', 1, ['chest', 'minecart']);
L('furnace_minecart', 1, ['furnace', 'minecart']);
L('tnt_minecart', 1, ['tnt', 'minecart']);
L('hopper_minecart', 1, ['hopper', 'minecart']);
S('leather_horse_armor', 1, ['X X', 'XXX', 'X X'], { X: 'leather' });

// ------------------------------------------------------------------------------------ combat & tools
S('bow', 1, [' #X', '# X', ' #X'], { '#': 'stick', X: 'string' });
S('crossbow', 1, ['#$#', '@&@', ' # '], { '#': 'stick', $: 'iron_ingot', '@': 'string', '&': 'tripwire_hook' });
S('arrow', 4, ['X', '#', 'Y'], { X: 'flint', '#': 'stick', Y: 'feather' });
S('spectral_arrow', 2, [' # ', '#X#', ' # '], { '#': 'glowstone_dust', X: 'arrow' });
S('shield', 1, ['WoW', 'WWW', ' W '], { W: '#planks', o: 'iron_ingot' });
const TOOL_MATS: [string, Ingredient][] = [['wooden', '#planks'], ['stone', '#stone_tool_materials'], ['iron', 'iron_ingot'], ['golden', 'gold_ingot'], ['diamond', 'diamond']];
for (const [t, m] of TOOL_MATS) {
  S(`${t}_pickaxe`, 1, ['XXX', ' # ', ' # '], { X: m, '#': 'stick' });
  S(`${t}_axe`, 1, ['XX', 'X#', ' #'], { X: m, '#': 'stick' });
  S(`${t}_shovel`, 1, ['X', '#', '#'], { X: m, '#': 'stick' });
  S(`${t}_hoe`, 1, ['XX', ' #', ' #'], { X: m, '#': 'stick' });
  S(`${t}_sword`, 1, ['X', 'X', '#'], { X: m, '#': 'stick' });
}
const ARMOR_MATS: [string, string][] = [['leather', 'leather'], ['iron', 'iron_ingot'], ['golden', 'gold_ingot'], ['diamond', 'diamond']];
for (const [t, m] of ARMOR_MATS) {
  S(`${t}_helmet`, 1, ['XXX', 'X X'], { X: m });
  S(`${t}_chestplate`, 1, ['X X', 'XXX', 'XXX'], { X: m });
  S(`${t}_leggings`, 1, ['XXX', 'X X', 'X X'], { X: m });
  S(`${t}_boots`, 1, ['X X', 'X X'], { X: m });
}
S('turtle_helmet', 1, ['XXX', 'X X'], { X: ['turtle_scute', 'scute'] });

// ------------------------------------------------------------------------------------ redstone
S('redstone_torch', 1, ['X', '#'], { X: 'redstone', '#': 'stick' });
S('lever', 1, ['X', '#'], { X: 'stick', '#': 'cobblestone' });
S('repeater', 1, ['#X#', 'III'], { '#': 'redstone_torch', X: 'redstone', I: 'stone' });
S('comparator', 1, [' # ', '#X#', 'III'], { '#': 'redstone_torch', X: 'quartz', I: 'stone' });
S('piston', 1, ['TTT', '#X#', '#R#'], { T: '#planks', X: 'iron_ingot', '#': '#stone_crafting_materials', R: 'redstone' });
S('sticky_piston', 1, ['S', 'P'], { S: 'slime_ball', P: 'piston' });
S('observer', 1, ['###', 'RRQ', '###'], { '#': '#stone_crafting_materials', R: 'redstone', Q: 'quartz' });
S('dispenser', 1, ['###', '#X#', '#R#'], { '#': '#stone_crafting_materials', X: 'bow', R: 'redstone' });
S('dropper', 1, ['###', '# #', '#R#'], { '#': '#stone_crafting_materials', R: 'redstone' });
S('redstone_lamp', 1, [' R ', 'RGR', ' R '], { R: 'redstone', G: 'glowstone' });
S('daylight_detector', 1, ['GGG', 'QQQ', 'WWW'], { G: 'glass', Q: 'quartz', W: '#wooden_slabs' });
S('target', 1, [' R ', 'RHR', ' R '], { R: 'redstone', H: 'hay_block' });
S('tnt', 1, ['X#X', '#X#', 'X#X'], { X: 'gunpowder', '#': ['sand', 'red_sand'] });
S('tripwire_hook', 2, ['I', 'S', '#'], { I: 'iron_ingot', S: 'stick', '#': '#planks' });
S('rail', 16, ['X X', 'X#X', 'X X'], { X: 'iron_ingot', '#': 'stick' });
S('powered_rail', 6, ['X X', 'X#X', 'XRX'], { X: 'gold_ingot', '#': 'stick', R: 'redstone' });
S('detector_rail', 6, ['X X', 'X#X', 'XRX'], { X: 'iron_ingot', '#': 'stone_pressure_plate', R: 'redstone' });
S('activator_rail', 6, ['XSX', 'X#X', 'XSX'], { X: 'iron_ingot', '#': 'redstone_torch', S: 'stick' });
L('stone_button', 1, ['stone']);
S('stone_pressure_plate', 1, ['##'], { '#': 'stone' });
L('polished_blackstone_button', 1, ['polished_blackstone']);
S('polished_blackstone_pressure_plate', 1, ['##'], { '#': 'polished_blackstone' });
S('light_weighted_pressure_plate', 1, ['##'], { '#': 'gold_ingot' });
S('heavy_weighted_pressure_plate', 1, ['##'], { '#': 'iron_ingot' });

// ------------------------------------------------------------------------------------ minerals
const STORAGE: [string, string, number][] = [
  ['coal_block', 'coal', 9], ['iron_block', 'iron_ingot', 9], ['gold_block', 'gold_ingot', 9], ['diamond_block', 'diamond', 9],
  ['emerald_block', 'emerald', 9], ['lapis_block', 'lapis_lazuli', 9], ['redstone_block', 'redstone', 9], ['netherite_block', 'netherite_ingot', 9],
  ['copper_block', 'copper_ingot', 9], ['raw_iron_block', 'raw_iron', 9], ['raw_gold_block', 'raw_gold', 9], ['raw_copper_block', 'raw_copper', 9],
  ['slime_block', 'slime_ball', 9], ['bone_block', 'bone_meal', 9], ['hay_block', 'wheat', 9], ['dried_kelp_block', 'dried_kelp', 9],
];
for (const [block, item] of STORAGE) {
  S(block, 1, ['###', '###', '###'], { '#': item }, block);
  L(item, 9, [block], `${item}_from_${block}`);
}
S('iron_ingot', 1, ['###', '###', '###'], { '#': 'iron_nugget' }, 'iron_ingot_from_nuggets');
L('iron_nugget', 9, ['iron_ingot']);
S('gold_ingot', 1, ['###', '###', '###'], { '#': 'gold_nugget' }, 'gold_ingot_from_nuggets');
L('gold_nugget', 9, ['gold_ingot']);
L('netherite_ingot', 1, [...rep('netherite_scrap', 4), ...rep('gold_ingot', 4)]);
S('amethyst_block', 1, ['##', '##'], { '#': 'amethyst_shard' });
S('quartz_block', 1, ['##', '##'], { '#': 'quartz' });
S('glowstone', 1, ['##', '##'], { '#': 'glowstone_dust' });
S('melon', 1, ['###', '###', '###'], { '#': 'melon_slice' });
S('nether_wart_block', 1, ['###', '###', '###'], { '#': 'nether_wart' });
S('honey_block', 1, ['##', '##'], { '#': 'honey_bottle' });
L('honey_bottle', 4, ['honey_block', ...rep('glass_bottle', 4)]);
S('honeycomb_block', 1, ['##', '##'], { '#': 'honeycomb' });
S('magma_block', 1, ['##', '##'], { '#': 'magma_cream' });
S('snow_block', 1, ['##', '##'], { '#': 'snowball' });
S('snow', 6, ['###'], { '#': 'snow_block' });
S('clay', 1, ['##', '##'], { '#': 'clay_ball' });
S('bricks', 1, ['##', '##'], { '#': 'brick' });
S('nether_bricks', 1, ['##', '##'], { '#': 'nether_brick' });
S('red_nether_bricks', 1, ['NW', 'WN'], { N: 'nether_brick', W: 'nether_wart' });
S('packed_ice', 1, ['###', '###', '###'], { '#': 'ice' });
S('blue_ice', 1, ['###', '###', '###'], { '#': 'packed_ice' });
S('white_wool', 1, ['##', '##'], { '#': 'string' }, 'white_wool_from_string');
S('leather', 1, ['##', '##'], { '#': 'rabbit_hide' });
S('dripstone_block', 1, ['##', '##'], { '#': 'pointed_dripstone' });
S('moss_carpet', 3, ['##'], { '#': 'moss_block' });
S('coarse_dirt', 4, ['DG', 'GD'], { D: 'dirt', G: 'gravel' });
L('packed_mud', 1, ['mud', 'wheat']);
S('mud_bricks', 4, ['##', '##'], { '#': 'packed_mud' });
L('bone_meal', 3, ['bone'], 'bone_meal_from_bone');

// ------------------------------------------------------------------------------------ stone families
S('stone_bricks', 4, ['##', '##'], { '#': 'stone' });
L('mossy_stone_bricks', 1, ['stone_bricks', 'vine'], 'mossy_stone_bricks_from_vine');
L('mossy_stone_bricks', 1, ['stone_bricks', 'moss_block'], 'mossy_stone_bricks_from_moss');
L('mossy_cobblestone', 1, ['cobblestone', 'vine'], 'mossy_cobblestone_from_vine');
L('mossy_cobblestone', 1, ['cobblestone', 'moss_block'], 'mossy_cobblestone_from_moss');
S('chiseled_stone_bricks', 1, ['#', '#'], { '#': 'stone_brick_slab' });
S('polished_granite', 4, ['##', '##'], { '#': 'granite' });
S('polished_diorite', 4, ['##', '##'], { '#': 'diorite' });
S('polished_andesite', 4, ['##', '##'], { '#': 'andesite' });
L('granite', 1, ['diorite', 'quartz']);
S('diorite', 2, ['CQ', 'QC'], { C: 'cobblestone', Q: 'quartz' });
L('andesite', 2, ['diorite', 'cobblestone']);
S('sandstone', 1, ['##', '##'], { '#': 'sand' });
S('chiseled_sandstone', 1, ['#', '#'], { '#': 'sandstone_slab' });
S('cut_sandstone', 4, ['##', '##'], { '#': 'sandstone' });
S('red_sandstone', 1, ['##', '##'], { '#': 'red_sand' });
S('chiseled_red_sandstone', 1, ['#', '#'], { '#': 'red_sandstone_slab' });
S('cut_red_sandstone', 4, ['##', '##'], { '#': 'red_sandstone' });
S('quartz_pillar', 2, ['#', '#'], { '#': 'quartz_block' });
S('chiseled_quartz_block', 1, ['#', '#'], { '#': 'quartz_slab' });
S('quartz_bricks', 4, ['##', '##'], { '#': 'quartz_block' });
S('purpur_block', 4, ['FF', 'FF'], { F: 'popped_chorus_fruit' });
S('purpur_pillar', 1, ['#', '#'], { '#': 'purpur_slab' });
S('end_stone_bricks', 4, ['##', '##'], { '#': 'end_stone' });
S('prismarine', 1, ['##', '##'], { '#': 'prismarine_shard' });
S('prismarine_bricks', 1, ['###', '###', '###'], { '#': 'prismarine_shard' });
S('dark_prismarine', 1, ['SSS', 'SIS', 'SSS'], { S: 'prismarine_shard', I: 'black_dye' });
S('sea_lantern', 1, ['SCS', 'CCC', 'SCS'], { S: 'prismarine_shard', C: 'prismarine_crystals' });
S('polished_deepslate', 4, ['##', '##'], { '#': 'cobbled_deepslate' });
S('deepslate_bricks', 4, ['##', '##'], { '#': 'polished_deepslate' });
S('deepslate_tiles', 4, ['##', '##'], { '#': 'deepslate_bricks' });
S('chiseled_deepslate', 1, ['#', '#'], { '#': 'cobbled_deepslate_slab' });
S('polished_blackstone', 4, ['##', '##'], { '#': 'blackstone' });
S('polished_blackstone_bricks', 4, ['##', '##'], { '#': 'polished_blackstone' });
S('chiseled_polished_blackstone', 1, ['#', '#'], { '#': 'polished_blackstone_slab' });
S('polished_basalt', 4, ['##', '##'], { '#': 'basalt' });
S('chiseled_nether_bricks', 1, ['#', '#'], { '#': 'nether_brick_slab' });
S('nether_brick_fence', 6, ['W#W', 'W#W'], { W: 'nether_bricks', '#': 'nether_brick' });
S('cut_copper', 4, ['##', '##'], { '#': 'copper_block' });

/** [prefix, base ingredient, has stairs, has wall] */
const STONE_SETS: [string, Ingredient, boolean, boolean][] = [
  ['cobblestone', 'cobblestone', true, true], ['stone', 'stone', true, false], ['stone_brick', 'stone_bricks', true, true],
  ['mossy_cobblestone', 'mossy_cobblestone', true, true], ['mossy_stone_brick', 'mossy_stone_bricks', true, true], ['brick', 'bricks', true, true],
  ['sandstone', ['sandstone', 'chiseled_sandstone', 'cut_sandstone'], true, true], ['red_sandstone', ['red_sandstone', 'chiseled_red_sandstone', 'cut_red_sandstone'], true, true],
  ['smooth_sandstone', 'smooth_sandstone', true, false], ['smooth_red_sandstone', 'smooth_red_sandstone', true, false],
  ['cut_sandstone', 'cut_sandstone', false, false], ['cut_red_sandstone', 'cut_red_sandstone', false, false],
  ['nether_brick', 'nether_bricks', true, true], ['red_nether_brick', 'red_nether_bricks', true, true],
  ['quartz', ['quartz_block', 'chiseled_quartz_block', 'quartz_pillar'], true, false], ['smooth_quartz', 'smooth_quartz', true, false],
  ['purpur', ['purpur_block', 'purpur_pillar'], true, false], ['granite', 'granite', true, true], ['diorite', 'diorite', true, true],
  ['andesite', 'andesite', true, true], ['polished_granite', 'polished_granite', true, false], ['polished_diorite', 'polished_diorite', true, false],
  ['polished_andesite', 'polished_andesite', true, false], ['cobbled_deepslate', 'cobbled_deepslate', true, true], ['polished_deepslate', 'polished_deepslate', true, true],
  ['deepslate_brick', 'deepslate_bricks', true, true], ['deepslate_tile', 'deepslate_tiles', true, true], ['blackstone', 'blackstone', true, true],
  ['polished_blackstone', 'polished_blackstone', true, true], ['polished_blackstone_brick', 'polished_blackstone_bricks', true, true],
  ['prismarine', 'prismarine', true, true], ['prismarine_brick', 'prismarine_bricks', true, false], ['dark_prismarine', 'dark_prismarine', true, false],
  ['end_stone_brick', 'end_stone_bricks', true, true], ['smooth_stone', 'smooth_stone', false, false], ['mud_brick', 'mud_bricks', true, true],
  ['cut_copper', 'cut_copper', true, false], ['tuff', 'tuff', true, true], ['polished_tuff', 'polished_tuff', true, true],
];
for (const [p, base, stairs, wall] of STONE_SETS) {
  S(`${p}_slab`, 6, ['###'], { '#': base });
  if (stairs) S(`${p}_stairs`, 4, ['#  ', '## ', '###'], { '#': base });
  if (wall) S(`${p}_wall`, 6, ['###', '###'], { '#': base });
}

// ------------------------------------------------------------------------------------ colour
const FLOWER_DYES: [string, string, number][] = [
  ['white_dye', 'bone_meal', 1], ['white_dye', 'lily_of_the_valley', 1], ['orange_dye', 'orange_tulip', 1], ['orange_dye', 'torchflower', 1],
  ['magenta_dye', 'allium', 1], ['magenta_dye', 'lilac', 2], ['light_blue_dye', 'blue_orchid', 1], ['yellow_dye', 'dandelion', 1],
  ['yellow_dye', 'sunflower', 2], ['pink_dye', 'pink_tulip', 1], ['pink_dye', 'peony', 2], ['pink_dye', 'pink_petals', 1],
  ['light_gray_dye', 'azure_bluet', 1], ['light_gray_dye', 'oxeye_daisy', 1], ['light_gray_dye', 'white_tulip', 1], ['cyan_dye', 'pitcher_plant', 2],
  ['blue_dye', 'lapis_lazuli', 1], ['blue_dye', 'cornflower', 1], ['brown_dye', 'cocoa_beans', 1], ['red_dye', 'poppy', 1],
  ['red_dye', 'red_tulip', 1], ['red_dye', 'rose_bush', 2], ['red_dye', 'beetroot', 1], ['black_dye', 'ink_sac', 1], ['black_dye', 'wither_rose', 1],
];
for (const [dye, src, n] of FLOWER_DYES) L(dye, n, [src], `${dye}_from_${src}`);
L('orange_dye', 2, ['red_dye', 'yellow_dye'], 'orange_dye_mix');
L('magenta_dye', 2, ['purple_dye', 'pink_dye'], 'magenta_dye_purple_pink');
L('magenta_dye', 3, ['blue_dye', 'red_dye', 'pink_dye'], 'magenta_dye_blue_red_pink');
L('magenta_dye', 4, ['blue_dye', 'red_dye', 'red_dye', 'white_dye'], 'magenta_dye_blue_red_white');
L('light_blue_dye', 2, ['blue_dye', 'white_dye'], 'light_blue_dye_mix');
L('lime_dye', 2, ['green_dye', 'white_dye'], 'lime_dye_mix');
L('pink_dye', 2, ['red_dye', 'white_dye'], 'pink_dye_mix');
L('gray_dye', 2, ['black_dye', 'white_dye'], 'gray_dye_mix');
L('light_gray_dye', 2, ['gray_dye', 'white_dye'], 'light_gray_dye_gray_white');
L('light_gray_dye', 3, ['black_dye', 'white_dye', 'white_dye'], 'light_gray_dye_black_white');
L('cyan_dye', 2, ['blue_dye', 'green_dye'], 'cyan_dye_mix');
L('purple_dye', 2, ['blue_dye', 'red_dye'], 'purple_dye_mix');
for (const c of DYES) {
  const dye = `${c}_dye`;
  S(`${c}_bed`, 1, ['###', 'XXX'], { '#': `${c}_wool`, X: '#planks' }, `${c}_bed`);
  L(`${c}_wool`, 1, [dye, '#wool'], `dye_${c}_wool`);
  L(`${c}_bed`, 1, [dye, '#beds'], `dye_${c}_bed`);
  S(`${c}_carpet`, 3, ['##'], { '#': `${c}_wool` }, `${c}_carpet`);
  S(`${c}_carpet`, 8, ['###', '#$#', '###'], { '#': '#wool_carpets', $: dye }, `dye_${c}_carpet`);
  S(`${c}_stained_glass`, 8, ['###', '#X#', '###'], { '#': 'glass', X: dye });
  S(`${c}_stained_glass_pane`, 16, ['###', '###'], { '#': `${c}_stained_glass` });
  S(`${c}_stained_glass_pane`, 8, ['###', '#$#', '###'], { '#': 'glass_pane', $: dye }, `${c}_stained_glass_pane_from_pane`);
  S(`${c}_terracotta`, 8, ['###', '#X#', '###'], { '#': 'terracotta', X: dye });
  L(`${c}_concrete_powder`, 8, [dye, ...rep('#sand', 4), ...rep('gravel', 4)]);
  S(`${c}_banner`, 1, ['###', '###', ' | '], { '#': `${c}_wool`, '|': 'stick' });
  L(`${c}_candle`, 1, ['candle', dye]);
  L(`${c}_shulker_box`, 1, ['shulker_box', dye]);
}
S('glass_pane', 16, ['###', '###'], { '#': 'glass' });

// ------------------------------------------------------------------------------------ brewing & food
L('ender_eye', 1, ['ender_pearl', 'blaze_powder']);
L('blaze_powder', 2, ['blaze_rod']);
L('magma_cream', 1, ['blaze_powder', 'slime_ball']);
L('fermented_spider_eye', 1, ['spider_eye', 'brown_mushroom', 'sugar']);
S('glistering_melon_slice', 1, ['###', '#X#', '###'], { '#': 'gold_nugget', X: 'melon_slice' });
S('golden_carrot', 1, ['###', '#X#', '###'], { '#': 'gold_nugget', X: 'carrot' });
S('golden_apple', 1, ['###', '#X#', '###'], { '#': 'gold_ingot', X: 'apple' });
L('fire_charge', 3, ['gunpowder', 'blaze_powder', '#coals']);
L('sugar', 1, ['sugar_cane'], 'sugar_from_sugar_cane');
L('sugar', 3, ['honey_bottle'], 'sugar_from_honey_bottle');
S('bread', 1, ['###'], { '#': 'wheat' });
S('cake', 1, ['AAA', 'BEB', 'CCC'], { A: 'milk_bucket', B: 'sugar', C: 'wheat', E: 'egg' });
S('cookie', 8, ['#X#'], { '#': 'wheat', X: 'cocoa_beans' });
L('pumpkin_pie', 1, ['pumpkin', 'sugar', 'egg']);
L('mushroom_stew', 1, ['brown_mushroom', 'red_mushroom', 'bowl']);
L('rabbit_stew', 1, ['baked_potato', 'cooked_rabbit', 'bowl', 'carrot', 'brown_mushroom'], 'rabbit_stew_from_brown_mushroom');
L('rabbit_stew', 1, ['baked_potato', 'cooked_rabbit', 'bowl', 'carrot', 'red_mushroom'], 'rabbit_stew_from_red_mushroom');
L('beetroot_soup', 1, ['bowl', ...rep('beetroot', 6)]);
L('melon_seeds', 1, ['melon_slice']);
L('pumpkin_seeds', 4, ['pumpkin']);
S('jack_o_lantern', 1, ['A', 'B'], { A: 'carved_pumpkin', B: 'torch' });

export const VANILLA_RECIPES: RecipeDef[] = out;
