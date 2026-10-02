/**
 * All block definitions. IDs are assigned in registration order — APPEND ONLY to keep
 * save files compatible. Pure data: safe to import in workers.
 */
import {
  registerBlock as R,
  finalizeRegistry,
  faces,
  column,
  rgb,
  type BlockProps,
  type Faces,
  type DropContext,
} from './registry';

// ---------------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------------
const stone = (p: BlockProps = {}): BlockProps => ({
  hardness: 1.5, resistance: 6, tool: 'pickaxe', requiresTool: true, sound: 'stone', ...p,
});
const wood = (p: BlockProps = {}): BlockProps => ({
  hardness: 2, resistance: 3, tool: 'axe', sound: 'wood', fireEncouragement: 5, flammability: 20, ...p,
});
const plant = (p: BlockProps = {}): BlockProps => ({
  shape: 'cross', layer: 'cutout', solid: false, hardness: 0, resistance: 0, sound: 'grass',
  replaceable: false, fireEncouragement: 60, flammability: 100, tags: ['plant'], ...p,
});
const ore = (name: string, base: string, drop: BlockProps['drops'], tier: number, xp?: [number, number], extra: BlockProps = {}): BlockProps => ({
  ...stone({ hardness: base === 'deepslate' ? 4.5 : 3, resistance: 3 }),
  harvestTier: tier,
  drops: drop,
  silkTouchable: true,
  xp,
  tags: ['ore', base === 'deepslate' ? 'deepslate_ore' : 'stone_ore'],
  sound: base === 'deepslate' ? 'deepslate' : base === 'netherrack' ? 'netherrack' : 'stone',
  ...extra,
});

/** Front texture on the facing side (hfacing meta), `side` elsewhere. */
function frontFaces(front: string, side: string, top: string, bottom = top) {
  return (meta: number): Faces => {
    const f: Faces = { up: top, down: bottom, north: side, south: side, west: side, east: side };
    const h = meta & 3;
    if (h === 0) f.south = front;
    else if (h === 1) f.west = front;
    else if (h === 2) f.north = front;
    else f.east = front;
    return f;
  };
}

/** 6-way facing (meta&7 = Dir): `front` on the facing side, `back` opposite. */
function facingFaces(front: string, side: string, back: string) {
  return (meta: number): Faces => {
    const f: Faces = faces(side);
    const d = meta & 7;
    const keys: (keyof Faces)[] = ['down', 'up', 'north', 'south', 'west', 'east'];
    const opp = [1, 0, 3, 2, 5, 4];
    if (d < 6) {
      f[keys[d]] = front;
      f[keys[opp[d]]] = back;
    }
    return f;
  };
}

const oreDrop = (item: string, min = 1, max = 1) => [{ item, min, max, fortune: 'ore' as const }];

// ---------------------------------------------------------------------------------
// Natural terrain
// ---------------------------------------------------------------------------------
R('air', { shape: 'air', layer: 'none', solid: false, hardness: 0, item: null, sound: 'none', replaceable: true, drops: 'none' });
R('stone', stone({ drops: 'cobblestone', silkTouchable: true, tags: ['base_stone'], mapColor: 0x707070 }));
R('granite', stone({ tags: ['base_stone'], mapColor: 0x976d4d }));
R('polished_granite', stone());
R('diorite', stone({ tags: ['base_stone'], mapColor: 0xbcbcbc }));
R('polished_diorite', stone());
R('andesite', stone({ tags: ['base_stone'], mapColor: 0x888888 }));
R('polished_andesite', stone());
R('grass_block', {
  shape: 'grass_block', tex: { up: 'grass_block_top', down: 'dirt', north: 'grass_block_side', south: 'grass_block_side', west: 'grass_block_side', east: 'grass_block_side' },
  hardness: 0.6, tool: 'shovel', sound: 'grass', tint: 'grass', drops: 'dirt', silkTouchable: true, tags: ['dirt'], mapColor: 0x7fb238,
});
R('dirt', { hardness: 0.5, tool: 'shovel', sound: 'gravel', tags: ['dirt'], mapColor: 0x976d4d });
R('coarse_dirt', { hardness: 0.5, tool: 'shovel', sound: 'gravel', tags: ['dirt'] });
R('podzol', { tex: { up: 'podzol_top', down: 'dirt', north: 'podzol_side', south: 'podzol_side', west: 'podzol_side', east: 'podzol_side' }, hardness: 0.5, tool: 'shovel', sound: 'gravel', drops: 'dirt', silkTouchable: true, tags: ['dirt'] });
R('mycelium', { tex: { up: 'mycelium_top', down: 'dirt', north: 'mycelium_side', south: 'mycelium_side', west: 'mycelium_side', east: 'mycelium_side' }, hardness: 0.6, tool: 'shovel', sound: 'grass', drops: 'dirt', silkTouchable: true, tags: ['dirt'] });
R('cobblestone', stone({ hardness: 2, tags: ['stone_crafting'] }));
R('mossy_cobblestone', stone({ hardness: 2 }));
R('bedrock', { hardness: -1, resistance: 3600000, sound: 'stone', drops: 'none', mapColor: 0x333333 });
R('sand', { hardness: 0.5, tool: 'shovel', sound: 'sand', gravity: true, tags: ['sand'], mapColor: 0xf7e9a3 });
R('red_sand', { hardness: 0.5, tool: 'shovel', sound: 'sand', gravity: true, tags: ['sand'], mapColor: 0xd87f33 });
R('gravel', {
  hardness: 0.6, tool: 'shovel', sound: 'gravel', gravity: true, mapColor: 0x837e7d,
  drops: (c: DropContext) => [{ item: c.rand() < [0.1, 0.14, 0.25, 1][Math.min(3, c.fortune)] ? 'flint' : 'gravel', count: 1 }],
});
R('clay', { hardness: 0.6, tool: 'shovel', sound: 'gravel', drops: [{ item: 'clay_ball', min: 4, max: 4 }], silkTouchable: true, mapColor: 0xa4a8b8 });
R('sandstone', stone({ hardness: 0.8, tex: { up: 'sandstone_top', down: 'sandstone_bottom', north: 'sandstone', south: 'sandstone', west: 'sandstone', east: 'sandstone' }, mapColor: 0xf7e9a3 }));
R('chiseled_sandstone', stone({ hardness: 0.8, tex: column('chiseled_sandstone', 'sandstone_top') }));
R('cut_sandstone', stone({ hardness: 0.8, tex: column('cut_sandstone', 'sandstone_top') }));
R('smooth_sandstone', stone({ hardness: 2, tex: 'sandstone_top' }));
R('red_sandstone', stone({ hardness: 0.8, tex: { up: 'red_sandstone_top', down: 'red_sandstone_bottom', north: 'red_sandstone', south: 'red_sandstone', west: 'red_sandstone', east: 'red_sandstone' }, mapColor: 0xd87f33 }));
R('cut_red_sandstone', stone({ hardness: 0.8, tex: column('cut_red_sandstone', 'red_sandstone_top') }));
R('smooth_red_sandstone', stone({ hardness: 2, tex: 'red_sandstone_top' }));
R('snow', { shape: 'snow_layer', layer: 'opaque', fullCube: false, opacity: 0, tex: 'snow', hardness: 0.1, tool: 'shovel', sound: 'snow', replaceable: true, drops: [{ item: 'snowball', min: 1, max: 1 }], mapColor: 0xffffff });
R('snow_block', { tex: 'snow', hardness: 0.2, tool: 'shovel', sound: 'snow', drops: [{ item: 'snowball', min: 4, max: 4 }], silkTouchable: true, mapColor: 0xffffff });
R('ice', { layer: 'translucent', fullCube: false, opacity: 2, hardness: 0.5, tool: 'pickaxe', sound: 'glass', friction: 0.98, drops: 'none', silkTouchable: true, mapColor: 0xa0a0ff });
R('packed_ice', { hardness: 0.5, tool: 'pickaxe', sound: 'glass', friction: 0.98, drops: 'none', silkTouchable: true });
R('blue_ice', { hardness: 2.8, tool: 'pickaxe', sound: 'glass', friction: 0.989, drops: 'none', silkTouchable: true });
R('obsidian', stone({ hardness: 50, resistance: 1200, harvestTier: 3, mapColor: 0x191919 }));
R('crying_obsidian', stone({ hardness: 50, resistance: 1200, harvestTier: 3, emission: rgb(10, 3, 15) }));
R('water', {
  shape: 'liquid', layer: 'translucent', tex: faces('water_still'), solid: false, opacity: 2, hardness: 100, liquid: 1,
  replaceable: true, item: null, drops: 'none', sound: 'liquid', tint: 'water', targetable: false, mapColor: 0x4040ff,
});
R('lava', {
  shape: 'liquid', layer: 'translucent', tex: faces('lava_still'), solid: false, opacity: 1, hardness: 100, liquid: 2,
  replaceable: true, item: null, drops: 'none', sound: 'liquid', emission: rgb(15, 9, 4), targetable: false, mapColor: 0xff4000,
});
R('deepslate', stone({ hardness: 3, tex: column('deepslate', 'deepslate_top'), orient: 'axis', drops: 'cobbled_deepslate', silkTouchable: true, sound: 'deepslate', tags: ['base_stone'], mapColor: 0x646464 }));
R('cobbled_deepslate', stone({ hardness: 3.5, sound: 'deepslate', tags: ['stone_crafting'] }));
R('tuff', stone({ hardness: 1.5, tags: ['base_stone'] }));
R('calcite', stone({ hardness: 0.75 }));

// Ores
R('coal_ore', ore('coal_ore', 'stone', oreDrop('coal'), 0, [0, 2]));
R('iron_ore', ore('iron_ore', 'stone', oreDrop('raw_iron'), 1));
R('copper_ore', ore('copper_ore', 'stone', oreDrop('raw_copper', 2, 5), 1));
R('gold_ore', ore('gold_ore', 'stone', oreDrop('raw_gold'), 2));
R('redstone_ore', ore('redstone_ore', 'stone', oreDrop('redstone', 4, 5), 2, [1, 5]));
R('lit_redstone_ore', ore('lit_redstone_ore', 'stone', oreDrop('redstone', 4, 5), 2, [1, 5], { emission: rgb(9, 1, 1), item: 'redstone_ore', tex: 'redstone_ore_lit' }));
R('lapis_ore', ore('lapis_ore', 'stone', oreDrop('lapis_lazuli', 4, 9), 1, [2, 5]));
R('diamond_ore', ore('diamond_ore', 'stone', oreDrop('diamond'), 2, [3, 7]));
R('emerald_ore', ore('emerald_ore', 'stone', oreDrop('emerald'), 2, [3, 7]));
R('deepslate_coal_ore', ore('deepslate_coal_ore', 'deepslate', oreDrop('coal'), 0, [0, 2]));
R('deepslate_iron_ore', ore('deepslate_iron_ore', 'deepslate', oreDrop('raw_iron'), 1));
R('deepslate_copper_ore', ore('deepslate_copper_ore', 'deepslate', oreDrop('raw_copper', 2, 5), 1));
R('deepslate_gold_ore', ore('deepslate_gold_ore', 'deepslate', oreDrop('raw_gold'), 2));
R('deepslate_redstone_ore', ore('deepslate_redstone_ore', 'deepslate', oreDrop('redstone', 4, 5), 2, [1, 5]));
R('deepslate_lapis_ore', ore('deepslate_lapis_ore', 'deepslate', oreDrop('lapis_lazuli', 4, 9), 1, [2, 5]));
R('deepslate_diamond_ore', ore('deepslate_diamond_ore', 'deepslate', oreDrop('diamond'), 2, [3, 7]));
R('deepslate_emerald_ore', ore('deepslate_emerald_ore', 'deepslate', oreDrop('emerald'), 2, [3, 7]));
R('nether_quartz_ore', ore('nether_quartz_ore', 'netherrack', oreDrop('quartz'), 0, [2, 5]));
R('nether_gold_ore', ore('nether_gold_ore', 'netherrack', oreDrop('gold_nugget', 2, 6), 0, [0, 1]));

// Mineral storage blocks
R('coal_block', stone({ hardness: 5, resistance: 6, fireEncouragement: 5, flammability: 5 }));
R('iron_block', stone({ hardness: 5, harvestTier: 1, sound: 'metal' }));
R('copper_block', stone({ hardness: 3, harvestTier: 1, sound: 'metal' }));
R('gold_block', stone({ hardness: 3, harvestTier: 2, sound: 'metal' }));
R('redstone_block', stone({ hardness: 5, sound: 'metal' }));
R('lapis_block', stone({ hardness: 3, harvestTier: 1 }));
R('diamond_block', stone({ hardness: 5, harvestTier: 2, sound: 'metal' }));
R('emerald_block', stone({ hardness: 5, harvestTier: 2, sound: 'metal' }));
R('netherite_block', stone({ hardness: 50, resistance: 1200, harvestTier: 3, sound: 'metal' }));
R('raw_iron_block', stone({ hardness: 5, harvestTier: 1 }));
R('raw_gold_block', stone({ hardness: 5, harvestTier: 2 }));
R('quartz_block', stone({ hardness: 0.8, tex: { up: 'quartz_block_top', down: 'quartz_block_top', north: 'quartz_block_side', south: 'quartz_block_side', west: 'quartz_block_side', east: 'quartz_block_side' } }));
R('quartz_pillar', stone({ hardness: 0.8, orient: 'axis', tex: column('quartz_pillar', 'quartz_pillar_top') }));
R('smooth_quartz', stone({ hardness: 2, tex: 'quartz_block_top' }));

// ---------------------------------------------------------------------------------
// Wood
// ---------------------------------------------------------------------------------
export const WOOD_TYPES = ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak', 'cherry'] as const;
const LEAF_TINT: Record<string, BlockProps['tint']> = {
  oak: 'foliage', jungle: 'foliage', acacia: 'foliage', dark_oak: 'foliage', spruce: 0x619961, birch: 0x80a755, cherry: 'none',
};
for (const w of WOOD_TYPES) {
  R(`${w}_log`, wood({ orient: 'axis', tex: column(`${w}_log`, `${w}_log_top`), tags: ['logs'] }));
  R(`${w}_planks`, wood({ tags: ['planks'] }));
  R(`${w}_leaves`, {
    shape: 'leaves', layer: 'cutout', fullCube: false, opacity: 1, hardness: 0.2, tool: 'hoe', sound: 'grass', tint: LEAF_TINT[w],
    fireEncouragement: 30, flammability: 60, tags: ['leaves'],
    drops: (c: DropContext) => {
      if (c.toolType === 'shears') return [{ item: `${w}_leaves`, count: 1 }];
      const out: { item: string; count: number }[] = [];
      const saplingChance = [0.05, 0.0625, 0.083, 0.1][Math.min(3, c.fortune)] * (w === 'jungle' ? 0.5 : 1);
      if (c.rand() < saplingChance) out.push({ item: `${w}_sapling`, count: 1 });
      if (c.rand() < 0.02) out.push({ item: 'stick', count: 1 + Math.floor(c.rand() * 2) });
      if ((w === 'oak' || w === 'dark_oak') && c.rand() < 0.005 * (1 + c.fortune)) out.push({ item: 'apple', count: 1 });
      return out;
    },
  });
  R(`${w}_sapling`, plant({ tags: ['sapling'], sound: 'grass' }));
  R(`${w}_stairs`, wood({ shape: 'stairs', layer: 'opaque', fullCube: false, opacity: 0, tex: `${w}_planks`, tags: ['stairs', 'wooden_stairs'] }));
  R(`${w}_slab`, wood({ shape: 'slab', layer: 'opaque', fullCube: false, opacity: 0, tex: `${w}_planks`, tags: ['slabs', 'wooden_slabs'] }));
  R(`${w}_fence`, wood({ shape: 'fence', layer: 'opaque', fullCube: false, opacity: 0, tex: `${w}_planks`, tags: ['fences', 'wooden_fences'] }));
  R(`${w}_fence_gate`, wood({ shape: 'fence_gate', layer: 'opaque', fullCube: false, opacity: 0, tex: `${w}_planks`, tags: ['fence_gates'] }));
  R(`${w}_door`, wood({ shape: 'door', layer: 'cutout', fullCube: false, opacity: 0, hardness: 3, tex: (m: number) => faces(m & 8 ? `${w}_door_top` : `${w}_door_bottom`), tags: ['doors', 'wooden_doors'] }));
  R(`${w}_trapdoor`, wood({ shape: 'trapdoor', layer: 'cutout', fullCube: false, opacity: 0, hardness: 3, tex: `${w}_trapdoor`, tags: ['trapdoors'] }));
  R(`${w}_button`, wood({ shape: 'button', layer: 'opaque', fullCube: false, solid: false, opacity: 0, hardness: 0.5, tex: `${w}_planks`, tags: ['buttons'] }));
  R(`${w}_pressure_plate`, wood({ shape: 'pressure_plate', layer: 'opaque', fullCube: false, solid: false, opacity: 0, hardness: 0.5, tex: `${w}_planks`, tags: ['pressure_plates'] }));
}

// ---------------------------------------------------------------------------------
// Plants & vegetation
// ---------------------------------------------------------------------------------
R('short_grass', plant({ tint: 'grass', replaceable: true, drops: (c: DropContext) => (c.toolType === 'shears' ? [{ item: 'short_grass', count: 1 }] : c.rand() < 0.125 ? [{ item: 'wheat_seeds', count: 1 }] : []) }));
R('fern', plant({ tint: 'grass', replaceable: true, drops: (c: DropContext) => (c.toolType === 'shears' ? [{ item: 'fern', count: 1 }] : c.rand() < 0.125 ? [{ item: 'wheat_seeds', count: 1 }] : []) }));
R('dead_bush', plant({ replaceable: true, drops: [{ item: 'stick', min: 0, max: 2 }] }));
R('tall_grass', plant({ shape: 'double_plant', tint: 'grass', replaceable: true, tex: (m: number) => faces(m & 8 ? 'tall_grass_top' : 'tall_grass_bottom'), drops: 'none' }));
R('large_fern', plant({ shape: 'double_plant', tint: 'grass', replaceable: true, tex: (m: number) => faces(m & 8 ? 'large_fern_top' : 'large_fern_bottom'), drops: 'none' }));
for (const f of ['dandelion', 'poppy', 'blue_orchid', 'allium', 'azure_bluet', 'red_tulip', 'orange_tulip', 'white_tulip', 'pink_tulip', 'oxeye_daisy', 'cornflower', 'lily_of_the_valley']) {
  R(f, plant({ tags: ['plant', 'flowers', 'small_flowers'] }));
}
for (const f of ['sunflower', 'lilac', 'rose_bush', 'peony']) {
  R(f, plant({ shape: 'double_plant', tex: (m: number) => faces(m & 8 ? `${f}_top` : `${f}_bottom`), tags: ['plant', 'flowers', 'tall_flowers'] }));
}
R('brown_mushroom', plant({ emission: 0, sound: 'grass', tags: ['plant', 'mushroom'] }));
R('red_mushroom', plant({ sound: 'grass', tags: ['plant', 'mushroom'] }));
R('sugar_cane', plant({ tint: 'grass', drops: 'sugar_cane' }));
R('cactus', { shape: 'cactus', layer: 'cutout', fullCube: false, opacity: 0, tex: { up: 'cactus_top', down: 'cactus_bottom', north: 'cactus_side', south: 'cactus_side', west: 'cactus_side', east: 'cactus_side' }, hardness: 0.4, sound: 'wool' });
R('pumpkin', { hardness: 1, tool: 'axe', sound: 'wood', tex: column('pumpkin_side', 'pumpkin_top') });
R('carved_pumpkin', { hardness: 1, tool: 'axe', sound: 'wood', orient: 'hfacing', tex: frontFaces('carved_pumpkin', 'pumpkin_side', 'pumpkin_top') });
R('jack_o_lantern', { hardness: 1, tool: 'axe', sound: 'wood', orient: 'hfacing', tex: frontFaces('jack_o_lantern', 'pumpkin_side', 'pumpkin_top'), emission: rgb(15, 12, 6) });
R('melon', { hardness: 1, tool: 'axe', sound: 'wood', tex: column('melon_side', 'melon_top'), drops: [{ item: 'melon_slice', min: 3, max: 7, fortune: 'uniform' }], silkTouchable: true });
R('vine', plant({ shape: 'vine', tint: 'foliage', climbable: true, replaceable: true, drops: (c: DropContext) => (c.toolType === 'shears' ? [{ item: 'vine', count: 1 }] : []) }));
R('lily_pad', plant({ shape: 'lily_pad', tint: 0x208030, solid: true }));
R('hay_block', { hardness: 0.5, tool: 'hoe', sound: 'grass', orient: 'axis', tex: column('hay_block_side', 'hay_block_top'), fireEncouragement: 60, flammability: 20 });
R('cobweb', { shape: 'cobweb', layer: 'cutout', solid: false, fullCube: false, opacity: 1, hardness: 4, tool: 'sword', requiresTool: true, sound: 'wool', drops: (c: DropContext) => (c.toolType === 'shears' ? [{ item: 'cobweb', count: 1 }] : [{ item: 'string', count: 1 }]), speedFactor: 0.05 });
R('moss_block', { hardness: 0.1, tool: 'hoe', sound: 'grass' });
R('kelp', plant({ tint: 0x40a030, sound: 'grass' }));
R('seagrass', plant({ tint: 0x40a030, replaceable: true, drops: 'none' }));
R('sweet_berry_bush', plant({ shape: 'cross', drops: [{ item: 'sweet_berries', min: 1, max: 3 }] }));
R('bamboo', { shape: 'cross', layer: 'cutout', solid: true, fullCube: false, opacity: 0, hardness: 1, tool: 'axe', sound: 'wood', tex: 'bamboo_stalk' });

// Crops
R('farmland', { shape: 'farmland', layer: 'opaque', fullCube: false, opacity: 0, tex: (m: number) => ({ up: m >= 7 ? 'farmland_moist' : 'farmland', down: 'dirt', north: 'dirt', south: 'dirt', west: 'dirt', east: 'dirt' }), hardness: 0.6, tool: 'shovel', sound: 'gravel', drops: 'dirt' });
R('wheat', plant({ shape: 'crop', tex: (m: number) => faces(`wheat_stage${Math.min(7, m)}`), sound: 'crop',
  drops: (c: DropContext) => (c.meta >= 7 ? [{ item: 'wheat', count: 1 }, { item: 'wheat_seeds', count: 1 + Math.floor(c.rand() * (3 + c.fortune)) }] : [{ item: 'wheat_seeds', count: 1 }]),
  item: 'wheat_seeds', tags: ['plant', 'crops'] }));
R('carrots', plant({ shape: 'crop', tex: (m: number) => faces(`carrots_stage${[0, 0, 1, 1, 2, 2, 2, 3][Math.min(7, m)]}`), sound: 'crop',
  drops: (c: DropContext) => [{ item: 'carrot', count: c.meta >= 7 ? 1 + Math.floor(c.rand() * (4 + c.fortune)) : 1 }], item: 'carrot', tags: ['plant', 'crops'] }));
R('potatoes', plant({ shape: 'crop', tex: (m: number) => faces(`potatoes_stage${[0, 0, 1, 1, 2, 2, 2, 3][Math.min(7, m)]}`), sound: 'crop',
  drops: (c: DropContext) => {
    const d = [{ item: 'potato', count: c.meta >= 7 ? 1 + Math.floor(c.rand() * (4 + c.fortune)) : 1 }];
    if (c.meta >= 7 && c.rand() < 0.02) d.push({ item: 'poisonous_potato', count: 1 });
    return d;
  }, item: 'potato', tags: ['plant', 'crops'] }));
R('beetroots', plant({ shape: 'crop', tex: (m: number) => faces(`beetroots_stage${Math.min(3, m)}`), sound: 'crop',
  drops: (c: DropContext) => (c.meta >= 3 ? [{ item: 'beetroot', count: 1 }, { item: 'beetroot_seeds', count: 1 + Math.floor(c.rand() * 3) }] : [{ item: 'beetroot_seeds', count: 1 }]), item: 'beetroot_seeds', tags: ['plant', 'crops'] }));
R('pumpkin_stem', plant({ shape: 'stem', tex: 'stem', drops: 'none', item: 'pumpkin_seeds', sound: 'crop' }));
R('melon_stem', plant({ shape: 'stem', tex: 'stem', drops: 'none', item: 'melon_seeds', sound: 'crop' }));
R('nether_wart', plant({ shape: 'crop', tex: (m: number) => faces(`nether_wart_stage${[0, 1, 1, 2][Math.min(3, m)]}`), sound: 'crop',
  drops: (c: DropContext) => [{ item: 'nether_wart', count: c.meta >= 3 ? 2 + Math.floor(c.rand() * (3 + c.fortune)) : 1 }], item: 'nether_wart' }));
R('dirt_path', { shape: 'path', layer: 'opaque', fullCube: false, opacity: 0, tex: { up: 'dirt_path_top', down: 'dirt', north: 'dirt_path_side', south: 'dirt_path_side', west: 'dirt_path_side', east: 'dirt_path_side' }, hardness: 0.65, tool: 'shovel', sound: 'grass', drops: 'dirt' });

// ---------------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------------
R('stone_bricks', stone({ tags: ['stone_bricks'] }));
R('mossy_stone_bricks', stone({ tags: ['stone_bricks'] }));
R('cracked_stone_bricks', stone({ tags: ['stone_bricks'] }));
R('chiseled_stone_bricks', stone({ tags: ['stone_bricks'] }));
R('smooth_stone', stone({ hardness: 2 }));
R('bricks', stone({ hardness: 2 }));
R('glass', { layer: 'translucent', fullCube: false, opacity: 0, hardness: 0.3, sound: 'glass', drops: 'none', silkTouchable: true });
R('glass_pane', { shape: 'pane', layer: 'translucent', fullCube: false, opacity: 0, hardness: 0.3, sound: 'glass', tex: 'glass', drops: 'none', silkTouchable: true });
R('iron_bars', stone({ shape: 'pane', layer: 'cutout', fullCube: false, opacity: 0, hardness: 5, sound: 'metal', harvestTier: 0, requiresTool: true }));
R('bookshelf', wood({ hardness: 1.5, tex: column('bookshelf', 'oak_planks'), drops: [{ item: 'book', min: 3, max: 3 }], silkTouchable: true }));
R('ladder', { shape: 'ladder', layer: 'cutout', fullCube: false, opacity: 0, hardness: 0.4, tool: 'axe', sound: 'ladder', climbable: true });
R('torch', { shape: 'torch', layer: 'cutout', solid: false, fullCube: false, opacity: 0, hardness: 0, sound: 'wood', emission: rgb(15, 12, 7) });
R('soul_torch', { shape: 'torch', layer: 'cutout', solid: false, fullCube: false, opacity: 0, hardness: 0, sound: 'wood', emission: rgb(4, 11, 13) });
R('lantern', { shape: 'lantern', layer: 'cutout', fullCube: false, opacity: 0, hardness: 3.5, tool: 'pickaxe', requiresTool: true, sound: 'lantern', emission: rgb(15, 12, 7) });
R('soul_lantern', { shape: 'lantern', layer: 'cutout', fullCube: false, opacity: 0, hardness: 3.5, tool: 'pickaxe', requiresTool: true, sound: 'lantern', emission: rgb(4, 11, 13) });
R('chain', stone({ shape: 'chain', layer: 'cutout', fullCube: false, opacity: 0, hardness: 5, sound: 'chain', orient: 'axis', harvestTier: 0 }));
R('glowstone', { hardness: 0.3, sound: 'glass', emission: rgb(15, 13, 9), drops: [{ item: 'glowstone_dust', min: 2, max: 4, fortune: 'uniform' }], silkTouchable: true });
R('sea_lantern', { hardness: 0.3, sound: 'glass', emission: rgb(13, 15, 15), drops: [{ item: 'prismarine_crystals', min: 2, max: 3 }], silkTouchable: true });
R('shroomlight', { hardness: 1, tool: 'hoe', sound: 'wood', emission: rgb(15, 11, 7) });
R('sponge', { hardness: 0.6, tool: 'hoe', sound: 'grass' });
R('wet_sponge', { hardness: 0.6, tool: 'hoe', sound: 'grass' });
R('tnt', { hardness: 0, sound: 'grass', tex: { up: 'tnt_top', down: 'tnt_bottom', north: 'tnt_side', south: 'tnt_side', west: 'tnt_side', east: 'tnt_side' }, fireEncouragement: 15, flammability: 100 });
R('prismarine', stone({ hardness: 1.5 }));
R('prismarine_bricks', stone({ hardness: 1.5 }));
R('dark_prismarine', stone({ hardness: 1.5 }));
R('purpur_block', stone({ hardness: 1.5 }));
R('purpur_pillar', stone({ hardness: 1.5, orient: 'axis', tex: column('purpur_pillar', 'purpur_pillar_top') }));
R('bone_block', stone({ hardness: 2, orient: 'axis', tex: column('bone_block_side', 'bone_block_top'), sound: 'bone' }));
R('slime_block', { layer: 'translucent', fullCube: false, opacity: 1, hardness: 0, sound: 'slime', jumpFactor: 1, friction: 0.8 });
R('honey_block', { layer: 'translucent', fullCube: false, opacity: 1, hardness: 0, sound: 'slime', speedFactor: 0.4, jumpFactor: 0.5 });
R('mud', { hardness: 0.5, tool: 'shovel', sound: 'gravel', speedFactor: 0.9 });
R('mud_bricks', stone({ hardness: 1.5 }));
R('packed_mud', { hardness: 1, tool: 'pickaxe', sound: 'gravel' });

// Colored block families (single neutral texture tinted with the dye colour)
export const DYE_COLORS = [
  'white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray',
  'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black',
] as const;
export const WOOL_COLORS = [0xe9ecec, 0xf07613, 0xbd44b3, 0x3aafd9, 0xf8c627, 0x70b919, 0xed8dac, 0x3e4447, 0x8e8e86, 0x158991, 0x792aac, 0x35399d, 0x724728, 0x546d1b, 0xa12722, 0x141519];
export const CONCRETE_COLORS = [0xcfd5d6, 0xe06100, 0xa9309f, 0x2389c6, 0xf0af15, 0x5ea818, 0xd5658e, 0x36393d, 0x7d7d73, 0x157788, 0x64209c, 0x2c2e8f, 0x603b1f, 0x495b24, 0x8e2020, 0x080a0f];
export const TERRACOTTA_COLORS = [0xd1b1a1, 0xa15325, 0x95576c, 0x706c8a, 0xba8523, 0x677534, 0xa04d4e, 0x392a23, 0x876a61, 0x575b5b, 0x764656, 0x4a3b5b, 0x4d3323, 0x4c532a, 0x8f3d2e, 0x251610];
R('terracotta', stone({ hardness: 1.25, tex: 'terracotta', tint: 0x985e43, tags: ['terracotta'] }));
DYE_COLORS.forEach((c, i) => {
  R(`${c}_wool`, { hardness: 0.8, tool: 'shears', sound: 'wool', tex: 'wool', tint: WOOL_COLORS[i], fireEncouragement: 30, flammability: 60, tags: ['wool'] });
  R(`${c}_carpet`, { shape: 'carpet', layer: 'opaque', fullCube: false, opacity: 0, hardness: 0.1, sound: 'wool', tex: 'wool', tint: WOOL_COLORS[i], tags: ['carpets'] });
  R(`${c}_concrete`, stone({ hardness: 1.8, tex: 'concrete', tint: CONCRETE_COLORS[i], tags: ['concrete'] }));
  R(`${c}_concrete_powder`, { hardness: 0.5, tool: 'shovel', sound: 'sand', gravity: true, tex: 'concrete_powder', tint: CONCRETE_COLORS[i], tags: ['concrete_powder'] });
  R(`${c}_terracotta`, stone({ hardness: 1.25, tex: 'terracotta', tint: TERRACOTTA_COLORS[i], tags: ['terracotta'] }));
  R(`${c}_stained_glass`, { layer: 'translucent', fullCube: false, opacity: 0, hardness: 0.3, sound: 'glass', tex: 'stained_glass', tint: WOOL_COLORS[i], drops: 'none', silkTouchable: true, tags: ['stained_glass'] });
  R(`${c}_bed`, wood({ shape: 'bed', layer: 'opaque', fullCube: false, opacity: 0, hardness: 0.2, sound: 'wood', tex: 'bed_blanket', tint: WOOL_COLORS[i], tags: ['beds'], drops: (cx: DropContext) => (cx.meta & 8 ? [{ item: `${c}_bed`, count: 1 }] : []) }));
});

// Stone building variants (stairs / slabs / walls)
const STONE_SETS: [string, string][] = [
  ['cobblestone', 'cobblestone'], ['stone', 'stone'], ['stone_brick', 'stone_bricks'], ['mossy_cobblestone', 'mossy_cobblestone'],
  ['mossy_stone_brick', 'mossy_stone_bricks'], ['brick', 'bricks'], ['sandstone', 'sandstone'], ['red_sandstone', 'red_sandstone'],
  ['nether_brick', 'nether_bricks'], ['quartz', 'quartz_block_side'], ['purpur', 'purpur_block'], ['granite', 'granite'],
  ['diorite', 'diorite'], ['andesite', 'andesite'], ['polished_granite', 'polished_granite'], ['polished_diorite', 'polished_diorite'],
  ['polished_andesite', 'polished_andesite'], ['cobbled_deepslate', 'cobbled_deepslate'], ['deepslate_brick', 'deepslate_bricks'],
  ['blackstone', 'blackstone'], ['polished_blackstone_brick', 'polished_blackstone_bricks'], ['prismarine', 'prismarine'], ['end_stone_brick', 'end_stone_bricks'],
  ['smooth_stone', 'smooth_stone'], ['mud_brick', 'mud_bricks'],
];
// (deepslate_bricks / blackstone / end_stone_bricks / nether_bricks are registered further below; textures only need names)
for (const [prefix, tex] of STONE_SETS) {
  const sandTop = prefix === 'sandstone' ? 'sandstone_top' : prefix === 'red_sandstone' ? 'red_sandstone_top' : prefix === 'quartz' ? 'quartz_block_top' : tex;
  const t: Faces = { up: sandTop, down: sandTop, north: tex, south: tex, west: tex, east: tex };
  const sound = prefix.includes('nether') ? 'nether_bricks' : prefix.includes('deepslate') ? 'deepslate' : 'stone';
  if (prefix !== 'smooth_stone') R(`${prefix}_stairs`, stone({ shape: 'stairs', fullCube: false, opacity: 0, tex: t, hardness: 2, sound, tags: ['stairs'] }));
  R(`${prefix}_slab`, stone({ shape: 'slab', fullCube: false, opacity: 0, tex: prefix === 'smooth_stone' ? { up: 'smooth_stone', down: 'smooth_stone', north: 'smooth_stone_slab_side', south: 'smooth_stone_slab_side', west: 'smooth_stone_slab_side', east: 'smooth_stone_slab_side' } : t, hardness: 2, sound, tags: ['slabs'] }));
  if (['cobblestone', 'mossy_cobblestone', 'stone_brick', 'mossy_stone_brick', 'brick', 'sandstone', 'red_sandstone', 'nether_brick', 'granite', 'diorite', 'andesite', 'cobbled_deepslate', 'deepslate_brick', 'blackstone', 'end_stone_brick', 'mud_brick', 'prismarine'].includes(prefix)) {
    R(`${prefix}_wall`, stone({ shape: 'wall', fullCube: false, opacity: 0, tex: t, hardness: 2, sound, tags: ['walls'] }));
  }
}
R('deepslate_bricks', stone({ hardness: 3.5, sound: 'deepslate' }));
R('deepslate_tiles', stone({ hardness: 3.5, sound: 'deepslate' }));
R('polished_deepslate', stone({ hardness: 3.5, sound: 'deepslate' }));
R('chiseled_deepslate', stone({ hardness: 3.5, sound: 'deepslate' }));
R('cracked_deepslate_bricks', stone({ hardness: 3.5, sound: 'deepslate' }));
R('reinforced_deepslate', { hardness: 55, resistance: 1200, sound: 'deepslate', drops: 'none' });

// ---------------------------------------------------------------------------------
// Functional blocks
// ---------------------------------------------------------------------------------
R('crafting_table', wood({ hardness: 2.5, tex: { up: 'crafting_table_top', down: 'oak_planks', north: 'crafting_table_front', south: 'crafting_table_side', west: 'crafting_table_side', east: 'crafting_table_front' } }));
R('furnace', stone({ hardness: 3.5, orient: 'hfacing', tex: frontFaces('furnace_front', 'furnace_side', 'furnace_top') }));
R('lit_furnace', stone({ hardness: 3.5, orient: 'hfacing', tex: frontFaces('furnace_front_on', 'furnace_side', 'furnace_top'), emission: rgb(13, 10, 6), item: 'furnace', drops: 'furnace' }));
R('chest', wood({ shape: 'chest', layer: 'opaque', fullCube: false, opacity: 0, hardness: 2.5, orient: 'hfacing', tex: 'chest' }));
R('trapped_chest', wood({ shape: 'chest', layer: 'opaque', fullCube: false, opacity: 0, hardness: 2.5, orient: 'hfacing', tex: 'chest' }));
R('ender_chest', stone({ shape: 'chest', fullCube: false, opacity: 0, hardness: 22.5, resistance: 600, orient: 'hfacing', tex: 'ender_chest', emission: rgb(4, 2, 7), drops: [{ item: 'obsidian', min: 8, max: 8 }], silkTouchable: true }));
R('barrel', wood({ hardness: 2.5, orient: 'facing', tex: facingFaces('barrel_top', 'barrel_side', 'barrel_bottom') }));
R('enchanting_table', stone({ shape: 'enchanting_table', fullCube: false, opacity: 0, hardness: 5, resistance: 1200, tex: { up: 'enchanting_table_top', down: 'enchanting_table_bottom', north: 'enchanting_table_side', south: 'enchanting_table_side', west: 'enchanting_table_side', east: 'enchanting_table_side' }, emission: rgb(7, 4, 9), harvestTier: 0 }));
R('brewing_stand', stone({ shape: 'brewing_stand', layer: 'cutout', fullCube: false, opacity: 0, hardness: 0.5, tex: { up: 'brewing_stand_base', down: 'brewing_stand_base', north: 'brewing_stand', south: 'brewing_stand', west: 'brewing_stand', east: 'brewing_stand' }, emission: rgb(1, 1, 0), sound: 'metal' }));
R('cauldron', stone({ shape: 'cauldron', layer: 'cutout', fullCube: false, opacity: 0, hardness: 2, tex: { up: 'cauldron_top', down: 'cauldron_bottom', north: 'cauldron_side', south: 'cauldron_side', west: 'cauldron_side', east: 'cauldron_side' }, sound: 'metal' }));
R('anvil', stone({ shape: 'anvil', fullCube: false, opacity: 0, hardness: 5, resistance: 1200, tex: { up: 'anvil_top', down: 'anvil', north: 'anvil', south: 'anvil', west: 'anvil', east: 'anvil' }, sound: 'anvil', gravity: true }));
R('smoker', stone({ hardness: 3.5, orient: 'hfacing', tex: frontFaces('smoker_front', 'smoker_side', 'smoker_top', 'smoker_bottom') }));
R('blast_furnace', stone({ hardness: 3.5, orient: 'hfacing', tex: frontFaces('blast_furnace_front', 'blast_furnace_side', 'blast_furnace_top') }));
R('campfire', wood({ shape: 'campfire', layer: 'cutout', fullCube: false, opacity: 0, hardness: 2, emission: rgb(15, 11, 6), tex: { up: 'campfire_log', down: 'campfire_log', north: 'campfire_log', south: 'campfire_log', west: 'campfire_log', east: 'campfire_log' }, drops: [{ item: 'charcoal', min: 2, max: 2 }], silkTouchable: true }));
R('spawner', stone({ layer: 'cutout', fullCube: false, opacity: 1, hardness: 5, drops: 'none', xp: [15, 43], sound: 'metal', item: null }));
R('jukebox', wood({ hardness: 2, tex: column('jukebox_side', 'jukebox_top') }));
R('note_block', wood({ hardness: 0.8 }));
R('flower_pot', { shape: 'flower_pot', layer: 'cutout', fullCube: false, opacity: 0, hardness: 0, sound: 'stone' });
R('scaffolding', { shape: 'scaffolding', layer: 'cutout', fullCube: false, opacity: 0, hardness: 0, sound: 'scaffold', climbable: true, tex: { up: 'scaffolding_top', down: 'scaffolding_bottom', north: 'scaffolding_side', south: 'scaffolding_side', west: 'scaffolding_side', east: 'scaffolding_side' } });
R('cake', { shape: 'cake', layer: 'opaque', fullCube: false, opacity: 0, hardness: 0.5, sound: 'wool', drops: 'none', tex: { up: 'cake_top', down: 'cake_bottom', north: 'cake_side', south: 'cake_side', west: 'cake_side', east: 'cake_side' } });
R('beacon', { layer: 'translucent', fullCube: false, opacity: 0, hardness: 3, sound: 'glass', emission: rgb(14, 15, 15) });
R('iron_door', stone({ shape: 'door', layer: 'cutout', fullCube: false, opacity: 0, hardness: 5, sound: 'metal', tex: (m: number) => faces(m & 8 ? 'iron_door_top' : 'iron_door_bottom'), harvestTier: 0, tags: ['doors'] }));
R('iron_trapdoor', stone({ shape: 'trapdoor', layer: 'cutout', fullCube: false, opacity: 0, hardness: 5, sound: 'metal', harvestTier: 0, tags: ['trapdoors'] }));
R('nether_brick_fence', stone({ shape: 'fence', fullCube: false, opacity: 0, hardness: 2, tex: 'nether_bricks', sound: 'nether_bricks', tags: ['fences'] }));

// ---------------------------------------------------------------------------------
// Redstone
// ---------------------------------------------------------------------------------
R('redstone_wire', { shape: 'wire', layer: 'cutout', solid: false, fullCube: false, opacity: 0, hardness: 0, sound: 'stone', tex: 'redstone_dust', item: 'redstone', drops: 'redstone' });
R('redstone_torch', { shape: 'torch', layer: 'cutout', solid: false, fullCube: false, opacity: 0, hardness: 0, sound: 'wood', emission: rgb(9, 2, 1) });
R('unlit_redstone_torch', { shape: 'torch', layer: 'cutout', solid: false, fullCube: false, opacity: 0, hardness: 0, sound: 'wood', tex: 'redstone_torch_off', item: 'redstone_torch', drops: 'redstone_torch' });
R('lever', { shape: 'lever', layer: 'cutout', solid: false, fullCube: false, opacity: 0, hardness: 0.5, sound: 'wood', tex: { up: 'lever', down: 'cobblestone', north: 'lever', south: 'lever', west: 'lever', east: 'lever' } });
R('stone_button', stone({ shape: 'button', solid: false, fullCube: false, opacity: 0, hardness: 0.5, requiresTool: false, tex: 'stone', tags: ['buttons'] }));
R('stone_pressure_plate', stone({ shape: 'pressure_plate', solid: false, fullCube: false, opacity: 0, hardness: 0.5, tex: 'stone', tags: ['pressure_plates'] }));
R('light_weighted_pressure_plate', stone({ shape: 'pressure_plate', solid: false, fullCube: false, opacity: 0, hardness: 0.5, tex: 'gold_block', sound: 'metal', tags: ['pressure_plates'] }));
R('heavy_weighted_pressure_plate', stone({ shape: 'pressure_plate', solid: false, fullCube: false, opacity: 0, hardness: 0.5, tex: 'iron_block', sound: 'metal', tags: ['pressure_plates'] }));
R('repeater', { shape: 'repeater', layer: 'cutout', fullCube: false, opacity: 0, hardness: 0, sound: 'stone', tex: { up: 'repeater', down: 'smooth_stone', north: 'smooth_stone_slab_side', south: 'smooth_stone_slab_side', west: 'smooth_stone_slab_side', east: 'smooth_stone_slab_side' } });
R('powered_repeater', { shape: 'repeater', layer: 'cutout', fullCube: false, opacity: 0, hardness: 0, sound: 'stone', emission: rgb(5, 1, 0), item: 'repeater', drops: 'repeater', tex: { up: 'repeater_on', down: 'smooth_stone', north: 'smooth_stone_slab_side', south: 'smooth_stone_slab_side', west: 'smooth_stone_slab_side', east: 'smooth_stone_slab_side' } });
R('comparator', { shape: 'comparator', layer: 'cutout', fullCube: false, opacity: 0, hardness: 0, sound: 'stone', tex: (m: number) => ({ up: m & 8 ? 'comparator_on' : 'comparator', down: 'smooth_stone', north: 'smooth_stone_slab_side', south: 'smooth_stone_slab_side', west: 'smooth_stone_slab_side', east: 'smooth_stone_slab_side' }) });
R('redstone_lamp', { hardness: 0.3, sound: 'glass' });
R('lit_redstone_lamp', { hardness: 0.3, sound: 'glass', tex: 'redstone_lamp_on', emission: rgb(15, 12, 8), item: 'redstone_lamp', drops: 'redstone_lamp' });
R('piston', stone({ shape: 'piston', fullCube: false, opacity: 0, hardness: 1.5, requiresTool: false, orient: 'facing', tex: (m: number) => facingFaces(m & 8 ? 'piston_top_extended' : 'piston_top', 'piston_side', 'piston_bottom')(m) }));
R('sticky_piston', stone({ shape: 'piston', fullCube: false, opacity: 0, hardness: 1.5, requiresTool: false, orient: 'facing', tex: (m: number) => facingFaces(m & 8 ? 'piston_top_extended' : 'piston_top_sticky', 'piston_side', 'piston_bottom')(m) }));
R('piston_head', stone({ shape: 'piston_head', fullCube: false, opacity: 0, hardness: 1.5, requiresTool: false, item: null, drops: 'none', tex: (m: number) => facingFaces(m & 8 ? 'piston_top_sticky' : 'piston_top', 'piston_side', 'piston_top')(m) }));
R('moving_piston', { shape: 'air', layer: 'none', solid: false, fullCube: false, hardness: -1, item: null, drops: 'none', isAir: false, targetable: false });
R('observer', stone({ hardness: 3, orient: 'facing', tex: (m: number) => facingFaces('observer_front', 'observer_side', m & 8 ? 'observer_back_on' : 'observer_back')(m) }));
R('dispenser', stone({ hardness: 3.5, orient: 'facing', tex: facingFaces('dispenser_front', 'furnace_side', 'furnace_top') }));
R('dropper', stone({ hardness: 3.5, orient: 'facing', tex: facingFaces('dropper_front', 'furnace_side', 'furnace_top') }));
R('hopper', stone({ shape: 'hopper', fullCube: false, opacity: 0, hardness: 3, sound: 'metal', harvestTier: 0, tex: { up: 'hopper_top', down: 'hopper_outside', north: 'hopper_outside', south: 'hopper_outside', west: 'hopper_outside', east: 'hopper_outside' } }));
R('daylight_detector', wood({ shape: 'daylight_detector', fullCube: false, opacity: 0, hardness: 0.2, tex: { up: 'daylight_detector_top', down: 'daylight_detector_side', north: 'daylight_detector_side', south: 'daylight_detector_side', west: 'daylight_detector_side', east: 'daylight_detector_side' } }));
R('target', { hardness: 0.5, tool: 'hoe', sound: 'grass', tex: column('target_side', 'target_top') });
R('rail', { shape: 'rail', layer: 'cutout', solid: false, fullCube: false, opacity: 0, hardness: 0.7, tool: 'pickaxe', sound: 'metal', tex: (m: number) => faces(m >= 6 ? 'rail_corner' : 'rail') });
R('powered_rail', { shape: 'rail', layer: 'cutout', solid: false, fullCube: false, opacity: 0, hardness: 0.7, tool: 'pickaxe', sound: 'metal', tex: (m: number) => faces(m & 8 ? 'powered_rail_on' : 'powered_rail') });
R('detector_rail', { shape: 'rail', layer: 'cutout', solid: false, fullCube: false, opacity: 0, hardness: 0.7, tool: 'pickaxe', sound: 'metal', tex: (m: number) => faces(m & 8 ? 'detector_rail_on' : 'detector_rail') });
R('activator_rail', { shape: 'rail', layer: 'cutout', solid: false, fullCube: false, opacity: 0, hardness: 0.7, tool: 'pickaxe', sound: 'metal', tex: (m: number) => faces(m & 8 ? 'activator_rail_on' : 'activator_rail') });

// ---------------------------------------------------------------------------------
// Nether
// ---------------------------------------------------------------------------------
R('netherrack', stone({ hardness: 0.4, sound: 'netherrack', mapColor: 0x700200, tags: ['base_stone_nether'] }));
R('soul_sand', { hardness: 0.5, tool: 'shovel', sound: 'soul_sand', speedFactor: 0.4 });
R('soul_soil', { hardness: 0.5, tool: 'shovel', sound: 'soul_sand' });
R('basalt', stone({ hardness: 1.25, orient: 'axis', tex: column('basalt_side', 'basalt_top') }));
R('polished_basalt', stone({ hardness: 1.25, orient: 'axis', tex: column('polished_basalt_side', 'polished_basalt_top') }));
R('blackstone', stone({ hardness: 1.5, tex: column('blackstone', 'blackstone_top') }));
R('polished_blackstone', stone({ hardness: 2 }));
R('polished_blackstone_bricks', stone({ hardness: 1.5 }));
R('gilded_blackstone', stone({ hardness: 1.5 }));
R('nether_bricks', stone({ hardness: 2, sound: 'nether_bricks' }));
R('red_nether_bricks', stone({ hardness: 2, sound: 'nether_bricks' }));
R('cracked_nether_bricks', stone({ hardness: 2, sound: 'nether_bricks' }));
R('magma_block', stone({ hardness: 0.5, emission: rgb(6, 2, 0) }));
R('nether_portal', { shape: 'portal', layer: 'translucent', solid: false, fullCube: false, opacity: 0, hardness: -1, emission: rgb(9, 3, 15), item: null, drops: 'none', sound: 'glass', targetable: false });
R('crimson_nylium', stone({ hardness: 0.4, sound: 'nylium', drops: 'netherrack', silkTouchable: true, tex: { up: 'crimson_nylium', down: 'netherrack', north: 'crimson_nylium_side', south: 'crimson_nylium_side', west: 'crimson_nylium_side', east: 'crimson_nylium_side' } }));
R('warped_nylium', stone({ hardness: 0.4, sound: 'nylium', drops: 'netherrack', silkTouchable: true, tex: { up: 'warped_nylium', down: 'netherrack', north: 'warped_nylium_side', south: 'warped_nylium_side', west: 'warped_nylium_side', east: 'warped_nylium_side' } }));
R('crimson_stem', wood({ orient: 'axis', tex: column('crimson_stem', 'crimson_stem_top'), sound: 'stem', fireEncouragement: 0, flammability: 0, tags: ['logs'] }));
R('warped_stem', wood({ orient: 'axis', tex: column('warped_stem', 'warped_stem_top'), sound: 'stem', fireEncouragement: 0, flammability: 0, tags: ['logs'] }));
R('crimson_planks', wood({ fireEncouragement: 0, flammability: 0, tags: ['planks'] }));
R('warped_planks', wood({ fireEncouragement: 0, flammability: 0, tags: ['planks'] }));
R('nether_wart_block', { hardness: 1, tool: 'hoe', sound: 'wood' });
R('warped_wart_block', { hardness: 1, tool: 'hoe', sound: 'wood' });
R('crimson_fungus', plant({ sound: 'grass' }));
R('warped_fungus', plant({ sound: 'grass' }));
R('crimson_roots', plant({ replaceable: true }));
R('warped_roots', plant({ replaceable: true }));
R('weeping_vines', plant({ climbable: true }));
R('fire', { shape: 'fire', layer: 'cutout', solid: false, fullCube: false, opacity: 0, hardness: 0, emission: rgb(15, 11, 5), item: null, drops: 'none', replaceable: true, sound: 'none', targetable: false, tex: 'fire' });
R('soul_fire', { shape: 'fire', layer: 'cutout', solid: false, fullCube: false, opacity: 0, hardness: 0, emission: rgb(4, 11, 13), item: null, drops: 'none', replaceable: true, sound: 'none', targetable: false, tex: 'soul_fire' });
R('ancient_debris', stone({ hardness: 30, resistance: 1200, harvestTier: 3, tex: column('ancient_debris_side', 'ancient_debris_top') }));

// ---------------------------------------------------------------------------------
// End
// ---------------------------------------------------------------------------------
R('end_stone', stone({ hardness: 3, resistance: 9, mapColor: 0xdbde9e }));
R('end_stone_bricks', stone({ hardness: 3, resistance: 9 }));
R('end_portal_frame', { shape: 'end_portal_frame', layer: 'opaque', fullCube: false, opacity: 0, hardness: -1, resistance: 3600000, emission: rgb(1, 1, 1), sound: 'glass', tex: { up: 'end_portal_frame_top', down: 'end_stone', north: 'end_portal_frame_side', south: 'end_portal_frame_side', west: 'end_portal_frame_side', east: 'end_portal_frame_side' } });
R('end_portal', { shape: 'end_portal', layer: 'opaque', solid: false, fullCube: false, opacity: 0, hardness: -1, resistance: 3600000, emission: rgb(12, 13, 15), item: null, drops: 'none', sound: 'none', targetable: false });
R('end_gateway', { shape: 'end_portal', layer: 'opaque', solid: false, fullCube: false, opacity: 0, hardness: -1, emission: rgb(15, 15, 15), item: null, drops: 'none', sound: 'none', targetable: false, tex: 'end_portal' });
R('dragon_egg', { shape: 'dragon_egg', layer: 'opaque', fullCube: false, opacity: 0, hardness: 3, resistance: 9, emission: rgb(2, 0, 2), gravity: true });
R('end_rod', { shape: 'end_rod', layer: 'cutout', fullCube: false, opacity: 0, hardness: 0, sound: 'wood', emission: rgb(14, 14, 15), orient: 'facing' });
R('chorus_plant', { layer: 'cutout', fullCube: false, opacity: 0, hardness: 0.4, tool: 'axe', sound: 'wood', drops: [{ item: 'chorus_fruit', min: 0, max: 1 }] });
R('chorus_flower', { layer: 'cutout', fullCube: false, opacity: 0, hardness: 0.4, tool: 'axe', sound: 'wood' });

// ---------------------------------------------------------------------------------
// Technical / misc
// ---------------------------------------------------------------------------------
R('cave_air', { shape: 'air', layer: 'none', solid: false, hardness: 0, item: null, sound: 'none', replaceable: true, drops: 'none', tex: 'stone' });
R('barrier', { layer: 'none', fullCube: false, opacity: 0, hardness: -1, resistance: 3600000, item: 'barrier', drops: 'none', tex: 'glass' });
R('infested_stone', { tex: 'stone', hardness: 0.75, sound: 'stone', drops: 'none', item: 'stone' });
R('sea_pickle', { shape: 'sea_pickle', layer: 'cutout', fullCube: false, opacity: 0, hardness: 0, sound: 'slime', emission: rgb(6, 8, 6) });
R('glow_lichen', plant({ shape: 'vine', emission: rgb(6, 8, 6), replaceable: true, drops: 'none' }));
R('dripstone_block', stone({ hardness: 1.5 }));
R('amethyst_block', stone({ hardness: 1.5, requiresTool: false, sound: 'glass' }));
R('budding_amethyst', stone({ hardness: 1.5, requiresTool: false, sound: 'glass', drops: 'none' }));
R('amethyst_cluster', plant({ hardness: 1.5, sound: 'glass', emission: rgb(5, 3, 7), tool: 'pickaxe', fireEncouragement: 0, flammability: 0, drops: [{ item: 'amethyst_shard', min: 4, max: 4, fortune: 'ore' }] }));

finalizeRegistry();

export {};
