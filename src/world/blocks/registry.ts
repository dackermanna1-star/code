/**
 * Block registry: pure data shared by the main thread and workers.
 *
 * A block *state* is a uint16: (id << 4) | meta, where meta is 4 bits of per-block
 * state (orientation, growth stage, power level, ...). Air is state 0.
 *
 * Behaviour (random ticks, use, redstone ...) is NOT stored here; feature modules
 * attach behaviour through `src/world/blocks/behaviors.ts` so that this file stays
 * importable from web workers.
 */

export type RenderLayer = 'none' | 'opaque' | 'cutout' | 'translucent';

export type ToolType = 'pickaxe' | 'axe' | 'shovel' | 'hoe' | 'sword' | 'shears' | 'none';

export type SoundGroup =
  | 'stone' | 'wood' | 'gravel' | 'grass' | 'sand' | 'snow' | 'glass' | 'metal' | 'wool'
  | 'liquid' | 'plant' | 'crop' | 'ladder' | 'netherrack' | 'nether_bricks' | 'soul_sand'
  | 'nylium' | 'stem' | 'bone' | 'slime' | 'deepslate' | 'anvil' | 'lantern' | 'chain'
  | 'scaffold' | 'none';

/**
 * Tinting applied to the albedo of tintable texels.
 *  'grass' / 'foliage' / 'water' use the biome colour of the column;
 *  a number is a constant 0xRRGGBB tint (dyed blocks, spruce/birch leaves ...).
 */
export type Tint = 'none' | 'grass' | 'foliage' | 'water' | number;

export type BlockShape =
  | 'air'
  | 'cube'            // full cube, optional orientation via `orient`
  | 'grass_block'     // cube + biome-tinted top/side overlay + grass tufts on top
  | 'leaves'          // cube (cutout) + foliage fluff cards
  | 'cross'           // two diagonal quads (plants)
  | 'double_plant'    // cross, meta&8 = upper half
  | 'crop'            // # pattern, texture by age
  | 'stem'            // cross, texture by age
  | 'liquid'          // water / lava, meta = level (0 source, 1..7 flowing, |8 falling)
  | 'slab'            // meta 0 bottom, 1 top, 2 double
  | 'stairs'          // meta bits0-1 hfacing (direction the stairs ascend toward), bit2 upside-down
  | 'fence'
  | 'fence_gate'      // bits0-1 hfacing, bit2 open
  | 'wall'
  | 'pane'
  | 'door'            // lower: bits0-1 hfacing, bit2 open, bit3=0 ; upper: bit3=1, bit0 hinge-right, bit1 powered
  | 'trapdoor'        // bits0-1 hfacing, bit2 open, bit3 top-half
  | 'torch'           // meta = Dir the torch points to (1 = standing on floor, 2..5 wall)
  | 'ladder'          // meta = hfacing (direction it faces)
  | 'lever'           // bits0-2 attach (0 ceiling,1 floor,2..5 wall facing N,S,W,E), bit3 powered
  | 'button'          // same as lever, bit3 pressed
  | 'pressure_plate'  // meta = power (0 = up)
  | 'wire'            // redstone dust, meta = power 0..15
  | 'rail'            // meta = rail shape (0 NS,1 EW,2..5 ascending E,W,N,S, 6..9 curves SE,SW,NW,NE); powered/detector/activator: bit3 powered, shapes 0..5
  | 'repeater'        // bits0-1 hfacing (output direction), bits2-3 delay-1
  | 'comparator'      // bits0-1 hfacing, bit2 subtract, bit3 powered
  | 'piston'          // bits0-2 facing (Dir), bit3 extended
  | 'piston_head'     // bits0-2 facing, bit3 sticky
  | 'bed'             // bits0-1 hfacing, bit2 occupied, bit3 head
  | 'chest'           // meta = hfacing
  | 'cactus'
  | 'farmland'        // meta = moisture 0..7
  | 'path'            // dirt path (15/16 tall)
  | 'snow_layer'      // meta = layers-1
  | 'carpet'
  | 'portal'          // nether portal, meta 0 = X axis, 1 = Z axis
  | 'end_portal'
  | 'end_portal_frame'// bits0-1 hfacing, bit2 has eye
  | 'fire'
  | 'lily_pad'
  | 'vine'            // bits: 1 south, 2 west, 4 north, 8 east (attached faces)
  | 'cake'            // meta = bites
  | 'cauldron'        // meta = water level 0..3
  | 'brewing_stand'
  | 'enchanting_table'
  | 'anvil'           // bits0-1 hfacing, bits2-3 damage
  | 'lantern'         // bit0 hanging
  | 'campfire'        // bits0-1 hfacing, bit2 lit(0 = lit, 1 = extinguished)
  | 'hopper'          // meta = facing Dir (0 down, 2..5)
  | 'daylight_detector'
  | 'dragon_egg'
  | 'cobweb'
  | 'chain'
  | 'end_rod'         // meta = facing Dir
  | 'sea_pickle'
  | 'scaffolding'
  | 'flower_pot';

/** Orientation behaviour for cube-like blocks. */
export type Orient = 'none' | 'axis' | 'hfacing' | 'facing';

export interface Faces {
  up: string;
  down: string;
  north: string;
  south: string;
  west: string;
  east: string;
}

export interface DropEntry {
  item: string;
  min?: number;
  max?: number;
  /** Probability 0..1 of this entry dropping at all. */
  chance?: number;
  /** 'ore' = Fortune multiplies, 'uniform' = Fortune adds 0..level. */
  fortune?: 'ore' | 'uniform';
}

export interface DropContext {
  meta: number;
  rand: () => number;
  fortune: number;
  silkTouch: boolean;
  toolType: ToolType;
}

/** 'self' = drops its own item, 'none' = nothing, string = that item x1. */
export type DropSpec = 'self' | 'none' | string | DropEntry[] | ((ctx: DropContext) => { item: string; count: number }[]);

export interface BlockDef {
  id: number;
  name: string;
  displayName: string;
  shape: BlockShape;
  layer: RenderLayer;
  /** Face textures; may depend on meta. Texture names must exist in textureList.ts. */
  tex: Faces | ((meta: number) => Faces);
  orient: Orient;
  /** Has collision volume (full or partial). */
  solid: boolean;
  /** Full opaque cube: culls adjacent faces, fully blocks light, casts AO. */
  fullCube: boolean;
  /** Light opacity 0..15 (15 blocks all light). */
  opacity: number;
  /** Emitted light as 0xRGB nibbles (each 0..15). */
  emission: number;
  /** Seconds-ish hardness as in Minecraft (-1 = unbreakable). */
  hardness: number;
  resistance: number;
  tool: ToolType;
  /** Minimum tool tier for drops when requiresTool (0 wood/gold, 1 stone, 2 iron, 3 diamond, 4 netherite). */
  harvestTier: number;
  requiresTool: boolean;
  sound: SoundGroup;
  tint: Tint;
  friction: number;
  speedFactor: number;
  jumpFactor: number;
  /** Can be replaced by placing a block into it (air, water, tall grass, snow layer ...). */
  replaceable: boolean;
  /** Falls like sand. */
  gravity: boolean;
  climbable: boolean;
  /** 0 none, 1 water, 2 lava */
  liquid: 0 | 1 | 2;
  /** Fire spread chances (Minecraft "encouragement"/"flammability"). */
  fireEncouragement: number;
  flammability: number;
  drops: DropSpec;
  /** Drops itself when mined with Silk Touch. */
  silkTouchable: boolean;
  /** XP dropped when mined (min,max) — ores. */
  xp?: [number, number];
  /** Item produced by this block (pick block / default drop). null = no item. */
  item: string | null;
  /** Whether the block is "air-like" for placement & raycast (air, cave_air, light ...). */
  isAir: boolean;
  /** Whether a raycast can target it (false for air/liquids). */
  targetable: boolean;
  /** Arbitrary feature tags ("logs", "planks", "leaves", "wool", "dirt", "sand", "base_stone", ...). */
  tags: string[];
  /** Material class used by PBR shading defaults & sound/particles. */
  mapColor: number;
}

/** Packed state helpers */
export const stateOf = (id: number, meta = 0) => (id << 4) | (meta & 15);
export const idOf = (state: number) => state >>> 4;
export const metaOf = (state: number) => state & 15;

export const BLOCKS: BlockDef[] = [];
export const BLOCK_BY_NAME = new Map<string, BlockDef>();

/** Fast per-id lookup tables (filled by `finalizeRegistry`). Index = block id. */
export const T_FULL_CUBE = new Uint8Array(4096);
export const T_SOLID = new Uint8Array(4096);
export const T_OPACITY = new Uint8Array(4096);
export const T_EMISSION = new Uint16Array(4096);
export const T_LAYER = new Uint8Array(4096); // 0 none 1 opaque 2 cutout 3 translucent
export const T_LIQUID = new Uint8Array(4096);
export const T_REPLACEABLE = new Uint8Array(4096);
export const T_AIR = new Uint8Array(4096);

const LAYER_CODE: Record<RenderLayer, number> = { none: 0, opaque: 1, cutout: 2, translucent: 3 };

export type BlockProps = Partial<Omit<BlockDef, 'id' | 'name' | 'tex'>> & { tex?: BlockDef['tex'] | string };

export function faces(all: string): Faces {
  return { up: all, down: all, north: all, south: all, west: all, east: all };
}
export function column(side: string, end: string, bottom = end): Faces {
  return { up: end, down: bottom, north: side, south: side, west: side, east: side };
}

function titleCase(name: string) {
  return name
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function registerBlock(name: string, props: BlockProps = {}): BlockDef {
  if (BLOCK_BY_NAME.has(name)) throw new Error(`Duplicate block ${name}`);
  const id = BLOCKS.length;
  const shape = props.shape ?? 'cube';
  const layer = props.layer ?? (shape === 'air' ? 'none' : 'opaque');
  const fullCube = props.fullCube ?? ((shape === 'cube' || shape === 'grass_block') && layer === 'opaque');
  const tex = typeof props.tex === 'string' ? faces(props.tex) : props.tex ?? faces(name);
  const def: BlockDef = {
    id,
    name,
    displayName: props.displayName ?? titleCase(name),
    shape,
    layer,
    tex,
    orient: props.orient ?? 'none',
    solid: props.solid ?? (shape !== 'air' && shape !== 'liquid'),
    fullCube,
    opacity: props.opacity ?? (fullCube ? 15 : 0),
    emission: props.emission ?? 0,
    hardness: props.hardness ?? 1,
    resistance: props.resistance ?? props.hardness ?? 1,
    tool: props.tool ?? 'none',
    harvestTier: props.harvestTier ?? 0,
    requiresTool: props.requiresTool ?? false,
    sound: props.sound ?? 'stone',
    tint: props.tint ?? 'none',
    friction: props.friction ?? 0.6,
    speedFactor: props.speedFactor ?? 1,
    jumpFactor: props.jumpFactor ?? 1,
    replaceable: props.replaceable ?? false,
    gravity: props.gravity ?? false,
    climbable: props.climbable ?? false,
    liquid: props.liquid ?? 0,
    fireEncouragement: props.fireEncouragement ?? 0,
    flammability: props.flammability ?? 0,
    drops: props.drops ?? 'self',
    silkTouchable: props.silkTouchable ?? false,
    xp: props.xp,
    item: props.item === undefined ? name : props.item,
    isAir: props.isAir ?? shape === 'air',
    targetable: props.targetable ?? (shape !== 'air' && shape !== 'liquid'),
    tags: props.tags ?? [],
    mapColor: props.mapColor ?? 0x808080,
  };
  BLOCKS.push(def);
  BLOCK_BY_NAME.set(name, def);
  return def;
}

export function finalizeRegistry() {
  for (const b of BLOCKS) {
    T_FULL_CUBE[b.id] = b.fullCube ? 1 : 0;
    T_SOLID[b.id] = b.solid ? 1 : 0;
    T_OPACITY[b.id] = b.opacity;
    T_EMISSION[b.id] = b.emission;
    T_LAYER[b.id] = LAYER_CODE[b.layer];
    T_LIQUID[b.id] = b.liquid;
    T_REPLACEABLE[b.id] = b.replaceable ? 1 : 0;
    T_AIR[b.id] = b.isAir ? 1 : 0;
  }
}

export function blockByName(name: string): BlockDef {
  const b = BLOCK_BY_NAME.get(name);
  if (!b) throw new Error(`Unknown block '${name}'`);
  return b;
}

/** State for a block name (+meta). Throws on unknown names. */
export function S(name: string, meta = 0): number {
  return stateOf(blockByName(name).id, meta);
}

export function blockOf(state: number): BlockDef {
  return BLOCKS[state >>> 4] ?? BLOCKS[0];
}

export function facesFor(def: BlockDef, meta: number): Faces {
  return typeof def.tex === 'function' ? def.tex(meta) : def.tex;
}

export const rgb = (r: number, g: number, b: number) => ((r & 15) << 8) | ((g & 15) << 4) | (b & 15);
export const emissionR = (e: number) => (e >> 8) & 15;
export const emissionG = (e: number) => (e >> 4) & 15;
export const emissionB = (e: number) => e & 15;
