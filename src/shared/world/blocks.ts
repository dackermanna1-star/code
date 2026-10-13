/**
 * Block registry. IDs are persisted in save files and sent over the wire:
 * NEVER renumber an existing block — only append new ones.
 *
 * Gathering model (see docs/DESIGN.md §Gathering): each block has `hardness`
 * hit points. Tools deal damage per swing; the player receives the block's
 * `yields` proportionally to the damage dealt (Rust-style "resources per
 * hit"), scaled by the tool's gather multiplier for that resource class.
 */

export type BlockShape = 'none' | 'cube' | 'cross' | 'liquid' | 'flat' | 'door_open';
export type ToolClass = 'axe' | 'pick' | 'any' | 'none';
export type SoundMat =
  | 'none' | 'grass' | 'dirt' | 'stone' | 'wood' | 'sand' | 'snow' | 'gravel'
  | 'metal' | 'leaves' | 'water' | 'cloth' | 'glass' | 'plant';

/** Resource class used to pick a tool's gather multiplier. */
export type GatherClass = 'wood' | 'stone' | 'ore' | 'soil' | 'plant' | 'none';

export interface BlockYield {
  item: string;
  /** Total amount for the full block at gather multiplier 1.0. */
  amount: number;
  /** If true the amount is not scaled by the tool's gather multiplier (block items, plants). */
  fixed?: boolean;
}

export interface BlockDef {
  id: number;
  key: string;
  name: string;
  shape: BlockShape;
  /** Collides with entities. */
  solid: boolean;
  /** Fully occludes neighbouring faces and blocks light. */
  opaque: boolean;
  /** Rendered with alpha testing (leaves, fences). */
  cutout?: boolean;
  /** Translucent pass (water, glass). */
  translucent?: boolean;
  /** Gathering hit points. `Infinity` = unbreakable by tools. */
  hardness: number;
  /** HP against explosive damage for non-structure blocks (structure pieces use piece HP). */
  blastHp: number;
  tool: ToolClass;
  gather: GatherClass;
  sound: SoundMat;
  tex: { top: string; side: string; bottom: string };
  mapColor: number;
  yields?: BlockYield[];
  /** Light emission level 0-15. */
  light?: number;
  /** Placement may overwrite this block (plants, water). */
  replaceable?: boolean;
  /** Block is part of a player structure piece (tier index 0..4). */
  structureTier?: number;
  /** Block is a door cell. `open` doors are passable. */
  door?: { tier: number; open: boolean };
  /** Block is a deployable tile-entity (furnace, box ...). Value = deployable kind key. */
  deployable?: string;
  /** Needs a solid block below to exist (plants, sleeping bags). */
  needsSupport?: boolean;
  /** Fluid (affects movement). */
  liquid?: boolean;
  /** Part of a tree (for felling). */
  tree?: 'log' | 'leaves';
}

const defs: BlockDef[] = [];
const byKey = new Map<string, BlockDef>();

type Partial_ = Omit<BlockDef, 'id' | 'tex' | 'blastHp' | 'mapColor' | 'gather' | 'sound' | 'tool' | 'hardness'> & {
  tex?: string | { top?: string; side?: string; bottom?: string; all?: string };
  blastHp?: number;
  mapColor?: number;
  gather?: GatherClass;
  sound?: SoundMat;
  tool?: ToolClass;
  hardness?: number;
};

function reg(id: number, d: Partial_): BlockDef {
  let tex: BlockDef['tex'];
  if (typeof d.tex === 'string' || d.tex === undefined) {
    const t = (d.tex as string | undefined) ?? d.key;
    tex = { top: t, side: t, bottom: t };
  } else {
    const all = d.tex.all ?? d.key;
    tex = { top: d.tex.top ?? all, side: d.tex.side ?? all, bottom: d.tex.bottom ?? d.tex.top ?? all };
  }
  const def: BlockDef = {
    hardness: 10,
    tool: 'any',
    gather: 'none',
    sound: 'stone',
    blastHp: 20,
    mapColor: 0xff00ff,
    ...d,
    id,
    tex,
  } as BlockDef;
  if (defs[id]) throw new Error(`Duplicate block id ${id}`);
  if (byKey.has(def.key)) throw new Error(`Duplicate block key ${def.key}`);
  defs[id] = def;
  byKey.set(def.key, def);
  return def;
}

const cube = { shape: 'cube' as const, solid: true, opaque: true };
const plant = {
  shape: 'cross' as const, solid: false, opaque: false, cutout: true, hardness: 1, blastHp: 1,
  tool: 'any' as const, gather: 'plant' as const, sound: 'plant' as const, replaceable: true, needsSupport: true,
};

// --- Natural terrain -------------------------------------------------------
reg(0, { key: 'air', name: 'Air', shape: 'none', solid: false, opaque: false, hardness: Infinity, blastHp: Infinity, tool: 'none', sound: 'none', replaceable: true, mapColor: 0 });
reg(1, { key: 'bedrock', name: 'Bedrock', ...cube, hardness: Infinity, blastHp: Infinity, tool: 'none', mapColor: 0x333333 });
reg(2, { key: 'stone', name: 'Stone', ...cube, hardness: 60, blastHp: 60, tool: 'pick', gather: 'stone', yields: [{ item: 'stone', amount: 15 }], mapColor: 0x7d7d7d });
reg(3, { key: 'dirt', name: 'Dirt', ...cube, hardness: 15, blastHp: 10, gather: 'soil', sound: 'dirt', yields: [{ item: 'dirt', amount: 1, fixed: true }], mapColor: 0x79553a });
reg(4, { key: 'grass', name: 'Grass Block', ...cube, hardness: 15, blastHp: 10, gather: 'soil', sound: 'grass', tex: { top: 'grass_top', side: 'grass_side', bottom: 'dirt' }, yields: [{ item: 'dirt', amount: 1, fixed: true }], mapColor: 0x5d9b3a });
reg(5, { key: 'sand', name: 'Sand', ...cube, hardness: 12, blastHp: 8, gather: 'soil', sound: 'sand', yields: [{ item: 'sand', amount: 1, fixed: true }], mapColor: 0xdbd29b });
reg(6, { key: 'gravel', name: 'Gravel', ...cube, hardness: 18, blastHp: 12, gather: 'soil', sound: 'gravel', yields: [{ item: 'gravel', amount: 1, fixed: true }], mapColor: 0x8a8580 });
reg(7, { key: 'snow', name: 'Snow', ...cube, hardness: 8, blastHp: 6, gather: 'soil', sound: 'snow', yields: [{ item: 'snow', amount: 1, fixed: true }], mapColor: 0xf2f6f8 });
reg(8, { key: 'ice', name: 'Ice', shape: 'cube', solid: true, opaque: false, translucent: true, hardness: 20, blastHp: 10, sound: 'glass', mapColor: 0x9fc3ef });
reg(9, { key: 'water', name: 'Water', shape: 'liquid', solid: false, opaque: false, translucent: true, liquid: true, hardness: Infinity, blastHp: Infinity, tool: 'none', sound: 'water', replaceable: true, mapColor: 0x2f5fbf });
reg(10, { key: 'clay', name: 'Clay', ...cube, hardness: 18, blastHp: 12, gather: 'soil', sound: 'dirt', yields: [{ item: 'clay', amount: 1, fixed: true }], mapColor: 0x9ea4b0 });
reg(11, { key: 'sandstone', name: 'Sandstone', ...cube, hardness: 45, blastHp: 40, tool: 'pick', gather: 'stone', tex: { top: 'sandstone_top', side: 'sandstone' }, yields: [{ item: 'stone', amount: 10 }], mapColor: 0xd6c58f });
reg(12, { key: 'oak_log', name: 'Oak Log', ...cube, hardness: 40, blastHp: 30, tool: 'axe', gather: 'wood', sound: 'wood', tree: 'log', tex: { top: 'oak_log_top', side: 'oak_log' }, yields: [{ item: 'wood', amount: 12 }], mapColor: 0x6b5332 });
reg(13, { key: 'oak_leaves', name: 'Oak Leaves', shape: 'cube', solid: true, opaque: false, cutout: true, hardness: 4, blastHp: 2, sound: 'leaves', tree: 'leaves', mapColor: 0x3f7f2a });
reg(14, { key: 'pine_log', name: 'Pine Log', ...cube, hardness: 40, blastHp: 30, tool: 'axe', gather: 'wood', sound: 'wood', tree: 'log', tex: { top: 'pine_log_top', side: 'pine_log' }, yields: [{ item: 'wood', amount: 12 }], mapColor: 0x4a3721 });
reg(15, { key: 'pine_leaves', name: 'Pine Needles', shape: 'cube', solid: true, opaque: false, cutout: true, hardness: 4, blastHp: 2, sound: 'leaves', tree: 'leaves', mapColor: 0x2b5532 });
reg(16, { key: 'birch_log', name: 'Birch Log', ...cube, hardness: 36, blastHp: 28, tool: 'axe', gather: 'wood', sound: 'wood', tree: 'log', tex: { top: 'birch_log_top', side: 'birch_log' }, yields: [{ item: 'wood', amount: 11 }], mapColor: 0xd8d4c8 });
reg(17, { key: 'birch_leaves', name: 'Birch Leaves', shape: 'cube', solid: true, opaque: false, cutout: true, hardness: 4, blastHp: 2, sound: 'leaves', tree: 'leaves', mapColor: 0x6c9a3c });
reg(18, { key: 'cactus', name: 'Cactus', ...cube, opaque: false, cutout: true, hardness: 10, blastHp: 6, gather: 'plant', sound: 'plant', tex: { top: 'cactus_top', side: 'cactus_side' }, yields: [{ item: 'cactus_flesh', amount: 2, fixed: true }], mapColor: 0x3b7d2f });
reg(19, { key: 'tall_grass', name: 'Tall Grass', ...plant, mapColor: 0x5d9b3a });
reg(20, { key: 'flower_red', name: 'Red Flower', ...plant, mapColor: 0xc23b2b });
reg(21, { key: 'flower_yellow', name: 'Yellow Flower', ...plant, mapColor: 0xe0c43a });
reg(22, { key: 'hemp', name: 'Wild Hemp', ...plant, yields: [{ item: 'cloth', amount: 8, fixed: true }], mapColor: 0x6fae4a });
reg(23, { key: 'berry_bush', name: 'Berry Bush', ...plant, yields: [{ item: 'berries', amount: 3, fixed: true }], mapColor: 0x8d2f6a });
reg(24, { key: 'mushroom', name: 'Mushroom', ...plant, yields: [{ item: 'mushroom', amount: 1, fixed: true }], mapColor: 0xb86b4b });
reg(25, { key: 'dead_bush', name: 'Dead Bush', ...plant, yields: [{ item: 'wood', amount: 2, fixed: true }], mapColor: 0x8b6b3a });
reg(26, { key: 'metal_ore', name: 'Metal Ore', ...cube, hardness: 90, blastHp: 70, tool: 'pick', gather: 'ore', yields: [{ item: 'metal_ore', amount: 10 }, { item: 'stone', amount: 5 }], mapColor: 0x9a7b62 });
reg(27, { key: 'sulfur_ore', name: 'Sulfur Ore', ...cube, hardness: 90, blastHp: 70, tool: 'pick', gather: 'ore', yields: [{ item: 'sulfur_ore', amount: 10 }, { item: 'stone', amount: 5 }], mapColor: 0xc9b832 });
reg(28, { key: 'rich_ore', name: 'Rich Metal Ore', ...cube, hardness: 150, blastHp: 110, tool: 'pick', gather: 'ore', yields: [{ item: 'rich_ore', amount: 2 }, { item: 'stone', amount: 5 }], mapColor: 0x6a8fa3 });
reg(29, { key: 'snowy_grass', name: 'Snowy Grass', ...cube, hardness: 15, blastHp: 10, gather: 'soil', sound: 'snow', tex: { top: 'snow', side: 'snowy_grass_side', bottom: 'dirt' }, yields: [{ item: 'dirt', amount: 1, fixed: true }], mapColor: 0xe6eef0 });
reg(30, { key: 'mud', name: 'Mud', ...cube, hardness: 14, blastHp: 8, gather: 'soil', sound: 'dirt', yields: [{ item: 'dirt', amount: 1, fixed: true }], mapColor: 0x4d3f30 });
reg(31, { key: 'swamp_grass', name: 'Swamp Grass', ...cube, hardness: 15, blastHp: 10, gather: 'soil', sound: 'grass', tex: { top: 'swamp_grass_top', side: 'swamp_grass_side', bottom: 'dirt' }, yields: [{ item: 'dirt', amount: 1, fixed: true }], mapColor: 0x4b6b35 });
reg(32, { key: 'dry_grass', name: 'Dry Grass', ...cube, hardness: 15, blastHp: 10, gather: 'soil', sound: 'grass', tex: { top: 'dry_grass_top', side: 'dry_grass_side', bottom: 'dirt' }, yields: [{ item: 'dirt', amount: 1, fixed: true }], mapColor: 0xa39a4f });

// --- Player structure tiers (cells of building pieces; HP lives on the piece) ---
const struct = (tier: number) => ({ ...cube, hardness: Infinity, blastHp: Infinity, tool: 'none' as const, structureTier: tier });
reg(40, { key: 'struct_twig', name: 'Twig Frame', ...struct(0), opaque: false, cutout: true, sound: 'wood', mapColor: 0xb08850 });
reg(41, { key: 'struct_wood', name: 'Wood Structure', ...struct(1), sound: 'wood', mapColor: 0x8a6034 });
reg(42, { key: 'struct_stone', name: 'Stone Structure', ...struct(2), sound: 'stone', mapColor: 0x9a9a92 });
reg(43, { key: 'struct_metal', name: 'Sheet Metal Structure', ...struct(3), sound: 'metal', mapColor: 0x7f6a5a });
reg(44, { key: 'struct_armored', name: 'Armored Structure', ...struct(4), sound: 'metal', mapColor: 0x4f5560 });
const door = (tier: number, open: boolean, t: string) => ({
  shape: open ? ('door_open' as const) : ('cube' as const), solid: !open, opaque: false, cutout: open,
  hardness: Infinity, blastHp: Infinity, tool: 'none' as const, door: { tier, open }, tex: t,
  sound: tier === 0 ? ('wood' as const) : ('metal' as const),
});
reg(45, { key: 'door_wood', name: 'Wooden Door', ...door(0, false, 'door_wood'), mapColor: 0x8a6034 });
reg(46, { key: 'door_wood_open', name: 'Wooden Door (open)', ...door(0, true, 'door_wood'), mapColor: 0x8a6034 });
reg(47, { key: 'door_metal', name: 'Sheet Metal Door', ...door(1, false, 'door_metal'), mapColor: 0x7f6a5a });
reg(48, { key: 'door_metal_open', name: 'Sheet Metal Door (open)', ...door(1, true, 'door_metal'), mapColor: 0x7f6a5a });
reg(49, { key: 'door_armored', name: 'Armored Door', ...door(2, false, 'door_armored'), mapColor: 0x4f5560 });
reg(50, { key: 'door_armored_open', name: 'Armored Door (open)', ...door(2, true, 'door_armored'), mapColor: 0x4f5560 });

// --- Deployables (tile entities) -------------------------------------------
const dep = (kind: string) => ({ ...cube, opaque: false, hardness: Infinity, blastHp: Infinity, tool: 'none' as const, deployable: kind, sound: 'wood' as const });
reg(60, { key: 'workbench1', name: 'Workbench Level 1', ...dep('workbench1'), tex: { top: 'workbench1_top', side: 'workbench1_side', bottom: 'planks' }, mapColor: 0x8a6034 });
reg(61, { key: 'workbench2', name: 'Workbench Level 2', ...dep('workbench2'), sound: 'metal', tex: { top: 'workbench2_top', side: 'workbench2_side', bottom: 'metal_plate' }, mapColor: 0x6d6d6d });
reg(62, { key: 'workbench3', name: 'Workbench Level 3', ...dep('workbench3'), sound: 'metal', tex: { top: 'workbench3_top', side: 'workbench3_side', bottom: 'metal_plate' }, mapColor: 0x4a5a6a });
reg(63, { key: 'furnace', name: 'Furnace', ...dep('furnace'), sound: 'stone', light: 12, tex: { top: 'furnace_top', side: 'furnace_side' }, mapColor: 0x6d6d6d });
reg(64, { key: 'campfire', name: 'Campfire', ...dep('campfire'), shape: 'cross', solid: false, cutout: true, light: 14, tex: 'campfire', mapColor: 0xd06a20 });
reg(65, { key: 'small_box', name: 'Small Box', ...dep('small_box'), tex: { top: 'box_top', side: 'box_side' }, mapColor: 0x9a7040 });
reg(66, { key: 'large_box', name: 'Large Box', ...dep('large_box'), tex: { top: 'large_box_top', side: 'large_box_side' }, mapColor: 0x7a5530 });
reg(67, { key: 'claim_totem', name: 'Claim Totem', ...dep('claim_totem'), light: 6, tex: { top: 'totem_top', side: 'totem_side' }, mapColor: 0xd9a441 });
reg(68, { key: 'sleeping_bag', name: 'Sleeping Bag', ...dep('sleeping_bag'), shape: 'flat', solid: false, sound: 'cloth', tex: 'sleeping_bag', needsSupport: true, mapColor: 0x6b8f3a });
reg(69, { key: 'research_table', name: 'Research Table', ...dep('research_table'), sound: 'metal', tex: { top: 'research_top', side: 'research_side', bottom: 'metal_plate' }, mapColor: 0x557799 });
reg(70, { key: 'loot_crate', name: 'Supply Crate', ...dep('loot_crate'), tex: { top: 'crate_top', side: 'crate_side' }, mapColor: 0x8a6a3a });
reg(71, { key: 'military_crate', name: 'Military Crate', ...dep('military_crate'), sound: 'metal', tex: { top: 'mil_crate_top', side: 'mil_crate_side' }, mapColor: 0x3f5a2f });
reg(72, { key: 'barrel', name: 'Rusty Barrel', ...dep('barrel'), sound: 'metal', tex: { top: 'barrel_top', side: 'barrel_side' }, mapColor: 0x8a4a2a });

// --- Points-of-interest / decorative --------------------------------------
reg(80, { key: 'concrete', name: 'Concrete', ...cube, hardness: 400, blastHp: 600, tool: 'pick', gather: 'stone', yields: [{ item: 'stone', amount: 5 }], mapColor: 0xa8a8a0 });
reg(81, { key: 'rusted_metal', name: 'Rusted Metal', ...cube, hardness: 400, blastHp: 600, tool: 'pick', sound: 'metal', yields: [{ item: 'metal_frag', amount: 3 }], mapColor: 0x8a4a2a });
reg(82, { key: 'container_red', name: 'Shipping Container', ...cube, hardness: Infinity, blastHp: Infinity, tool: 'none', sound: 'metal', mapColor: 0xa83a2a });
reg(83, { key: 'container_blue', name: 'Shipping Container', ...cube, hardness: Infinity, blastHp: Infinity, tool: 'none', sound: 'metal', mapColor: 0x2a5aa8 });
reg(84, { key: 'container_teal', name: 'Shipping Container', ...cube, hardness: Infinity, blastHp: Infinity, tool: 'none', sound: 'metal', mapColor: 0x2a9a8a });
reg(85, { key: 'asphalt', name: 'Asphalt', ...cube, hardness: 200, blastHp: 300, tool: 'pick', sound: 'stone', yields: [{ item: 'stone', amount: 3 }], mapColor: 0x3a3a3c });
reg(86, { key: 'steel_beam', name: 'Steel Beam', ...cube, hardness: Infinity, blastHp: Infinity, tool: 'none', sound: 'metal', mapColor: 0x404448 });
reg(87, { key: 'hazard_stripes', name: 'Hazard Plating', ...cube, hardness: Infinity, blastHp: Infinity, tool: 'none', sound: 'metal', mapColor: 0xd8b020 });
reg(88, { key: 'chain_fence', name: 'Chain Fence', shape: 'cube', solid: true, opaque: false, cutout: true, hardness: Infinity, blastHp: Infinity, tool: 'none', sound: 'metal', mapColor: 0x8a8a8a });
reg(89, { key: 'lamp', name: 'Industrial Lamp', ...cube, hardness: Infinity, blastHp: Infinity, tool: 'none', sound: 'glass', light: 15, mapColor: 0xfff0a0 });

// --- Player-placeable decorative blocks ------------------------------------
reg(100, { key: 'planks', name: 'Planks', ...cube, hardness: 30, blastHp: 12, tool: 'axe', gather: 'wood', sound: 'wood', yields: [{ item: 'planks', amount: 1, fixed: true }], mapColor: 0xa7804a });
reg(101, { key: 'cobblestone', name: 'Cobblestone', ...cube, hardness: 50, blastHp: 18, tool: 'pick', gather: 'stone', yields: [{ item: 'cobblestone', amount: 1, fixed: true }], mapColor: 0x6f6f6f });
reg(102, { key: 'bricks', name: 'Bricks', ...cube, hardness: 50, blastHp: 18, tool: 'pick', gather: 'stone', yields: [{ item: 'bricks', amount: 1, fixed: true }], mapColor: 0x9a4a3a });
reg(103, { key: 'glass', name: 'Glass', shape: 'cube', solid: true, opaque: false, translucent: true, hardness: 6, blastHp: 3, sound: 'glass', mapColor: 0xc8e0e8 });
reg(104, { key: 'torch', name: 'Torch', shape: 'cross', solid: false, opaque: false, cutout: true, hardness: 1, blastHp: 1, sound: 'wood', light: 14, needsSupport: true, yields: [{ item: 'torch', amount: 1, fixed: true }], mapColor: 0xffa020 });

export const BLOCKS: readonly BlockDef[] = defs;
export const MAX_BLOCK_ID = defs.length - 1;

export function blockDef(id: number): BlockDef {
  return defs[id] ?? defs[0];
}

export function blockByKey(key: string): BlockDef {
  const d = byKey.get(key);
  if (!d) throw new Error(`Unknown block key '${key}'`);
  return d;
}

/** Dense lookup tables for hot loops (meshing, physics, lighting). */
export const SOLID = new Uint8Array(256);
export const OPAQUE = new Uint8Array(256);
export const LIGHT_EMIT = new Uint8Array(256);
export const LIQUID = new Uint8Array(256);
for (const d of defs) {
  if (!d) continue;
  SOLID[d.id] = d.solid ? 1 : 0;
  OPAQUE[d.id] = d.opaque ? 1 : 0;
  LIGHT_EMIT[d.id] = d.light ?? 0;
  LIQUID[d.id] = d.liquid ? 1 : 0;
}

/** Commonly referenced IDs. */
export const B = {
  air: 0, bedrock: 1, stone: 2, dirt: 3, grass: 4, sand: 5, gravel: 6, snow: 7, ice: 8, water: 9,
  clay: 10, sandstone: 11, oak_log: 12, oak_leaves: 13, pine_log: 14, pine_leaves: 15, birch_log: 16,
  birch_leaves: 17, cactus: 18, tall_grass: 19, flower_red: 20, flower_yellow: 21, hemp: 22,
  berry_bush: 23, mushroom: 24, dead_bush: 25, metal_ore: 26, sulfur_ore: 27, rich_ore: 28,
  snowy_grass: 29, mud: 30, swamp_grass: 31, dry_grass: 32,
  struct_twig: 40, struct_wood: 41, struct_stone: 42, struct_metal: 43, struct_armored: 44,
  door_wood: 45, door_wood_open: 46, door_metal: 47, door_metal_open: 48, door_armored: 49, door_armored_open: 50,
  workbench1: 60, workbench2: 61, workbench3: 62, furnace: 63, campfire: 64, small_box: 65, large_box: 66,
  claim_totem: 67, sleeping_bag: 68, research_table: 69, loot_crate: 70, military_crate: 71, barrel: 72,
  concrete: 80, rusted_metal: 81, container_red: 82, container_blue: 83, container_teal: 84, asphalt: 85,
  steel_beam: 86, hazard_stripes: 87, chain_fence: 88, lamp: 89,
  planks: 100, cobblestone: 101, bricks: 102, glass: 103, torch: 104,
} as const;

export const STRUCT_TIER_BLOCKS = [B.struct_twig, B.struct_wood, B.struct_stone, B.struct_metal, B.struct_armored];
export const DOOR_BLOCKS: Array<{ closed: number; open: number }> = [
  { closed: B.door_wood, open: B.door_wood_open },
  { closed: B.door_metal, open: B.door_metal_open },
  { closed: B.door_armored, open: B.door_armored_open },
];

/** All distinct texture tile names referenced by blocks (client builds the texture array from this). */
export function allTileNames(): string[] {
  const s = new Set<string>();
  for (const d of defs) {
    if (!d || d.shape === 'none') continue;
    s.add(d.tex.top);
    s.add(d.tex.side);
    s.add(d.tex.bottom);
  }
  return [...s].sort();
}
