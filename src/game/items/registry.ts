/**
 * Item registry & item stacks. Block items are created automatically for every block
 * whose `item` equals its own name. Feature modules register additional items and
 * item behaviours (use, use-on-block, ...).
 */
import { BLOCKS, BLOCK_BY_NAME, type ToolType } from '../../world/blocks/registry';
import '../../world/blocks/blocks';

export type ItemCategory = 'building' | 'natural' | 'functional' | 'redstone' | 'tools' | 'combat' | 'food' | 'ingredients' | 'brewing' | 'transport' | 'misc' | 'spawn_eggs';
export type ArmorSlot = 'head' | 'chest' | 'legs' | 'feet';

export interface ToolSpec {
  type: ToolType;
  /** 0 wood/gold, 1 stone, 2 iron, 3 diamond, 4 netherite */
  tier: number;
  /** Mining speed multiplier on effective blocks (wood 2, stone 4, iron 6, diamond 8, netherite 9, gold 12). */
  speed: number;
}

export interface FoodSpec {
  hunger: number;
  saturation: number;
  alwaysEdible?: boolean;
  /** Ticks to eat (default 32). */
  eatTicks?: number;
  effects?: { effect: string; duration: number; amplifier: number; chance: number }[];
  /** Item left after eating (bowl, bottle). */
  remainder?: string;
}

export interface ArmorSpec {
  slot: ArmorSlot;
  defense: number;
  toughness: number;
  knockbackResistance?: number;
  /** Material id for rendering ('leather','chainmail','iron','gold','diamond','netherite','turtle'). */
  material: string;
}

/** How the item looks (used by the icon/model generators). */
export interface ItemVisual {
  /** 'block' = render the block; 'model' = procedural 3D model id; 'sprite' = painted icon id */
  kind: 'block' | 'model' | 'sprite';
  id: string;
  /** Primary/secondary colours for parameterised visuals (0xRRGGBB). */
  color?: number;
  color2?: number;
}

export interface ItemDef {
  id: number;
  name: string;
  displayName: string;
  maxStack: number;
  /** Max durability (0 = not damageable). */
  durability: number;
  /** Block placed by this item. */
  block?: string;
  tool?: ToolSpec;
  /** Bonus attack damage (total damage = 1 + attackDamage). */
  attackDamage: number;
  /** Attacks per second (Minecraft attack speed attribute; hand = 4). */
  attackSpeed: number;
  food?: FoodSpec;
  armor?: ArmorSpec;
  /** Furnace burn time in ticks. */
  fuel?: number;
  enchantability: number;
  category: ItemCategory;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic';
  visual: ItemVisual;
  tags: string[];
  /** Fire-resistant item entity (netherite). */
  fireResistant?: boolean;
}

export const ITEMS: ItemDef[] = [];
export const ITEM_BY_NAME = new Map<string, ItemDef>();

export type ItemProps = Partial<Omit<ItemDef, 'id' | 'name'>>;

function titleCase(name: string) {
  return name.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

export function registerItem(name: string, p: ItemProps = {}): ItemDef {
  if (ITEM_BY_NAME.has(name)) {
    // allow re-registration to extend an existing (auto block) item
    const ex = ITEM_BY_NAME.get(name)!;
    Object.assign(ex, p);
    return ex;
  }
  const def: ItemDef = {
    id: ITEMS.length,
    name,
    displayName: p.displayName ?? titleCase(name),
    maxStack: p.maxStack ?? (p.durability ? 1 : 64),
    durability: p.durability ?? 0,
    block: p.block,
    tool: p.tool,
    attackDamage: p.attackDamage ?? 0,
    attackSpeed: p.attackSpeed ?? 4,
    food: p.food,
    armor: p.armor,
    fuel: p.fuel,
    enchantability: p.enchantability ?? 0,
    category: p.category ?? 'misc',
    rarity: p.rarity ?? 'common',
    visual: p.visual ?? { kind: p.block ? 'block' : 'sprite', id: p.block ?? name },
    tags: p.tags ?? [],
    fireResistant: p.fireResistant,
  };
  ITEMS.push(def);
  ITEM_BY_NAME.set(name, def);
  return def;
}

export function itemByName(name: string): ItemDef {
  const i = ITEM_BY_NAME.get(name);
  if (!i) throw new Error(`Unknown item '${name}'`);
  return i;
}
export function tryItem(name: string): ItemDef | undefined {
  return ITEM_BY_NAME.get(name);
}

// ---------------------------------------------------------------------------------------
// Block items
const NATURAL = /(ore|log|leaves|sapling|dirt|grass|sand|gravel|stone$|^stone|granite|diorite|andesite|deepslate$|snow|ice|clay|flower|tulip|poppy|dandelion|orchid|allium|bluet|daisy|cornflower|lily|mushroom|cactus|sugar_cane|fern|vine|pumpkin|melon|netherrack|soul|basalt|nylium|end_stone|obsidian|bedrock|moss|mud|kelp|seagrass|bamboo|berry|fungus|roots|amethyst|calcite|tuff|dripstone|podzol|mycelium|wart)/;
const FUNCTIONAL = /(crafting_table|furnace|chest|barrel|enchanting|brewing|cauldron|anvil|smoker|blast|campfire|jukebox|note_block|bed|beacon|spawner|ender_chest|bookshelf|torch|lantern|ladder|scaffolding|flower_pot)/;
const REDSTONE = /(redstone|lever|button|pressure_plate|repeater|comparator|piston|observer|dispenser|dropper|hopper|daylight|target|rail|tnt|lamp|door|trapdoor|fence_gate)/;
for (const b of BLOCKS) {
  if (b.item !== b.name) continue;
  const cat: ItemCategory = REDSTONE.test(b.name) ? 'redstone' : FUNCTIONAL.test(b.name) ? 'functional' : NATURAL.test(b.name) ? 'natural' : 'building';
  registerItem(b.name, {
    displayName: b.displayName,
    block: b.name,
    category: cat,
    maxStack: b.shape === 'bed' || b.name.endsWith('_door') ? (b.shape === 'bed' ? 1 : 64) : 64,
    fuel: b.tags.includes('logs') || b.tags.includes('planks') ? (b.tags.includes('planks') ? 300 : 300) : b.name === 'coal_block' ? 16000 : b.sound === 'wood' && b.flammability > 0 ? 300 : undefined,
    visual: { kind: 'block', id: b.name },
  });
}

// ---------------------------------------------------------------------------------------
// Core tools (feature modules add the rest of the items)
const TIERS: [string, number, number, number, number][] = [
  // name, tier, speed, durability, enchantability
  ['wooden', 0, 2, 59, 15],
  ['stone', 1, 4, 131, 5],
  ['iron', 2, 6, 250, 14],
  ['golden', 0, 12, 32, 22],
  ['diamond', 3, 8, 1561, 10],
  ['netherite', 4, 9, 2031, 15],
];
const SWORD_DMG = [3, 4, 5, 3, 6, 7];
const AXE_DMG = [6, 8, 8, 6, 8, 9];
const AXE_SPD = [0.8, 0.8, 0.9, 1.0, 1.0, 1.0];
const HOE_SPD = [1, 2, 3, 1, 4, 4];
TIERS.forEach(([n, tier, speed, dur, ench], i) => {
  const common = { durability: dur, enchantability: ench, category: 'tools' as ItemCategory, fireResistant: n === 'netherite', tags: [n + '_tools'] };
  registerItem(`${n}_sword`, { ...common, category: 'combat', tool: { type: 'sword', tier, speed: 1.5 }, attackDamage: SWORD_DMG[i] - 1, attackSpeed: 1.6, visual: { kind: 'model', id: 'sword' }, tags: ['swords', n + '_tools'] });
  registerItem(`${n}_pickaxe`, { ...common, tool: { type: 'pickaxe', tier, speed }, attackDamage: [2, 3, 4, 2, 5, 6][i] - 1, attackSpeed: 1.2, visual: { kind: 'model', id: 'pickaxe' }, tags: ['pickaxes', n + '_tools'] });
  registerItem(`${n}_axe`, { ...common, tool: { type: 'axe', tier, speed }, attackDamage: AXE_DMG[i] - 1, attackSpeed: AXE_SPD[i], visual: { kind: 'model', id: 'axe' }, tags: ['axes', n + '_tools'] });
  registerItem(`${n}_shovel`, { ...common, tool: { type: 'shovel', tier, speed }, attackDamage: [2.5, 3.5, 4.5, 2.5, 5.5, 6.5][i] - 1, attackSpeed: 1, visual: { kind: 'model', id: 'shovel' }, tags: ['shovels', n + '_tools'] });
  registerItem(`${n}_hoe`, { ...common, tool: { type: 'hoe', tier, speed }, attackDamage: 0, attackSpeed: HOE_SPD[i], visual: { kind: 'model', id: 'hoe' }, tags: ['hoes', n + '_tools'] });
});
registerItem('shears', { durability: 238, tool: { type: 'shears', tier: 0, speed: 1.5 }, category: 'tools', visual: { kind: 'model', id: 'shears' } });
registerItem('stick', { category: 'ingredients', fuel: 100 });

// ---------------------------------------------------------------------------------------
export interface ItemStack {
  item: ItemDef;
  count: number;
  /** Durability damage taken. */
  damage: number;
  /** Enchantments: id -> level */
  ench?: Record<string, number>;
  /** Arbitrary data (potion type, custom name, map data, written book ...) */
  data?: Record<string, any>;
}

export function stack(item: ItemDef | string, count = 1, damage = 0): ItemStack {
  return { item: typeof item === 'string' ? itemByName(item) : item, count, damage };
}
export function cloneStack(s: ItemStack | null): ItemStack | null {
  if (!s) return null;
  return { item: s.item, count: s.count, damage: s.damage, ench: s.ench ? { ...s.ench } : undefined, data: s.data ? JSON.parse(JSON.stringify(s.data)) : undefined };
}
/** Can two stacks merge? */
export function stackable(a: ItemStack, b: ItemStack): boolean {
  return a.item === b.item && a.item.maxStack > 1 && a.damage === b.damage && JSON.stringify(a.ench ?? null) === JSON.stringify(b.ench ?? null) && JSON.stringify(a.data ?? null) === JSON.stringify(b.data ?? null);
}
export function serializeStack(s: ItemStack | null): any {
  if (!s) return null;
  return { i: s.item.name, c: s.count, d: s.damage || undefined, e: s.ench, x: s.data };
}
export function deserializeStack(o: any): ItemStack | null {
  if (!o) return null;
  const it = ITEM_BY_NAME.get(o.i);
  if (!it) return null;
  return { item: it, count: o.c ?? 1, damage: o.d ?? 0, ench: o.e, data: o.x };
}

/** Block placed by an item (null if none). */
export function blockOfItem(it: ItemDef): number | null {
  if (!it.block) return null;
  const b = BLOCK_BY_NAME.get(it.block);
  return b ? b.id : null;
}

// ---------------------------------------------------------------------------------------
// Item behaviours
import type { HitInfo } from '../../world/blocks/behaviors';

export interface ItemUseContext {
  game: any;
  player: any;
  stack: ItemStack;
  hand: 'main' | 'off';
  /** Block hit (if any) */
  hit: HitInfo | null;
  /** Entity targeted (if any) */
  entity: any | null;
}

export interface ItemBehavior {
  /** Right click on a block. Return true if handled (consumes the click). */
  useOnBlock?(ctx: ItemUseContext): boolean;
  /** Right click on an entity. */
  useOnEntity?(ctx: ItemUseContext): boolean;
  /** Right click in air (or after block/entity use was not handled). Return true if started/handled. */
  use?(ctx: ItemUseContext): boolean;
  /** Called every tick while the use button is held after `use` returned true and `holdUse` is set. */
  useTick?(ctx: ItemUseContext, ticksHeld: number): void;
  /** Use button released (bows, tridents, eating interrupted). */
  release?(ctx: ItemUseContext, ticksHeld: number): void;
  /** If set, holding right click keeps using (eating, drawing a bow, blocking with a shield). */
  holdUse?: boolean | ((ctx: ItemUseContext) => boolean);
  /** Pose of the first-person item while using: 'eat' | 'drink' | 'bow' | 'block' | 'spear' | 'spyglass' */
  usePose?: string;
  /** The item handles both mouse buttons itself (no mining, attacking or block use while held). */
  ownsMouse?: boolean;
  /** Inventory tick (compass, clock, maps). */
  inventoryTick?(game: any, player: any, stack: ItemStack, slot: number): void;
}

const ITEM_BEHAVIORS = new Map<number, ItemBehavior>();
export function addItemBehavior(names: string | string[] | ((def: ItemDef) => boolean), b: ItemBehavior) {
  const defs: ItemDef[] = typeof names === 'function' ? ITEMS.filter(names) : (Array.isArray(names) ? names : [names]).map(itemByName);
  for (const d of defs) {
    const ex = ITEM_BEHAVIORS.get(d.id);
    ITEM_BEHAVIORS.set(d.id, ex ? { ...ex, ...b } : b);
  }
}
export function itemBehavior(it: ItemDef): ItemBehavior | undefined {
  return ITEM_BEHAVIORS.get(it.id);
}
