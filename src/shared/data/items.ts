import type { GatherClass, ToolClass } from '../world/blocks';
import type { DamageType } from './damage';

/**
 * Item definitions — the single source of truth for every item in the game.
 * Designers tune balance here (or override via server config) without
 * touching systems code. Keys are persisted: never rename an existing key.
 */

export type ItemCategory =
  | 'resource' | 'component' | 'tool' | 'weapon' | 'ammo' | 'explosive' | 'food'
  | 'medical' | 'clothing' | 'construction' | 'deployable' | 'block';

export type WearSlot = 'head' | 'torso' | 'vest' | 'legs' | 'feet' | 'hands';
export const WEAR_SLOTS: WearSlot[] = ['head', 'torso', 'vest', 'legs', 'feet', 'hands'];

export type IconShape =
  | 'pile' | 'ore' | 'ingot' | 'log' | 'cloth' | 'powder' | 'meat' | 'berry' | 'bottle'
  | 'axe' | 'pick' | 'hammer' | 'rock' | 'torch' | 'spear' | 'blade' | 'bow' | 'crossbow'
  | 'pistol' | 'shotgun' | 'rifle' | 'arrow' | 'bullet' | 'shell' | 'grenade' | 'charge'
  | 'shirt' | 'pants' | 'boots' | 'gloves' | 'helmet' | 'vest' | 'bandage' | 'syringe'
  | 'pills' | 'block' | 'plan' | 'door' | 'lock' | 'box' | 'bench' | 'furnace' | 'fire'
  | 'bag' | 'totem' | 'gear' | 'pipe' | 'spring' | 'chip' | 'can' | 'rope' | 'research' | 'mushroom';

export interface ToolStats {
  /** Damage per swing against blocks. */
  damage: number;
  /** Damage multiplier per block tool class. */
  effective: Partial<Record<ToolClass, number>>;
  /** Yield multiplier per resource class. */
  gather: Partial<Record<GatherClass, number>>;
}

export interface WeaponStats {
  kind: 'melee' | 'bow' | 'gun' | 'throw';
  damage: number;
  damageType: DamageType;
  /** Seconds between attacks. */
  interval: number;
  automatic?: boolean;
  range: number;
  magazine?: number;
  ammo?: string[];
  reload?: number;
  /** Cone half-angle (radians) for hip fire. */
  spread?: number;
  /** Additional spread while moving. */
  moveSpread?: number;
  /** Camera kick per shot (radians). */
  recoil?: { pitch: number; yaw: number };
  projectileSpeed?: number;
  gravityScale?: number;
  pellets?: number;
  /** Hearing radius in blocks for the attack sound. */
  loudness: number;
  /** Chance per hit to cause bleeding. */
  bleedChance?: number;
  /** Damage against building pieces (before tier multipliers). Defaults to `damage`. */
  structureDamage?: number;
}

export interface ExplosiveStats {
  /** Damage to players/creatures at the centre. */
  damage: number;
  /** Damage to building pieces / blocks at the centre. */
  structureDamage: number;
  radius: number;
  fuse: number;
  sticky: boolean;
  throwSpeed: number;
  /** Chance the fuse fizzles and must be re-lit. */
  dudChance?: number;
  loudness: number;
}

export interface FoodStats { calories: number; hydration: number; health?: number; poison?: number }
export interface MedicalStats { heal: number; healOverTime?: number; stopBleed?: boolean; radRemove?: number; useTime: number }
export interface ClothingStats {
  slot: WearSlot;
  /** Fraction of damage absorbed (0..1) per type. */
  protection: Partial<Record<DamageType, number>>;
  /** Insulation in °C (+ warms in cold, - makes you hotter). */
  warmth: number;
  /** Radiation protection 0..1. */
  radiation?: number;
}

export interface ItemDef {
  key: string;
  name: string;
  desc: string;
  category: ItemCategory;
  stack: number;
  durability?: number;
  icon: { shape: IconShape; c1: number; c2?: number };
  tool?: ToolStats;
  weapon?: WeaponStats;
  explosive?: ExplosiveStats;
  food?: FoodStats;
  medical?: MedicalStats;
  clothing?: ClothingStats;
  /** Placing this item creates this block (blocks/deployables). */
  placeBlock?: string;
  /** Door item: door tier index into DOOR_BLOCKS. */
  doorTier?: number;
  /** Rarity used by loot tables and research cost. */
  tier?: number;
  /** Smelting: input -> output via furnace. */
  smeltsTo?: string;
  /** Cooking: input -> output via campfire/furnace. */
  cooksTo?: string;
  /** Fuel value in seconds of burn time. */
  fuel?: number;
  /** Light radius when held (torch). */
  heldLight?: number;
}

const ITEMS: ItemDef[] = [];
const add = (d: ItemDef) => ITEMS.push(d);

// --- Raw resources ---------------------------------------------------------
add({ key: 'wood', name: 'Wood', desc: 'Basic building and crafting material. Burns as fuel.', category: 'resource', stack: 1000, icon: { shape: 'log', c1: 0x8a6034, c2: 0xc8a06a }, fuel: 2 });
add({ key: 'stone', name: 'Stones', desc: 'Used for stone tools and construction.', category: 'resource', stack: 1000, icon: { shape: 'pile', c1: 0x8d8d8d, c2: 0x6a6a6a } });
add({ key: 'metal_ore', name: 'Metal Ore', desc: 'Smelt in a furnace to get metal fragments.', category: 'resource', stack: 1000, icon: { shape: 'ore', c1: 0x9a7b62, c2: 0x5e4a3a }, smeltsTo: 'metal_frag' });
add({ key: 'sulfur_ore', name: 'Sulfur Ore', desc: 'Smelt in a furnace to get sulfur.', category: 'resource', stack: 1000, icon: { shape: 'ore', c1: 0xd9c83a, c2: 0x8a7a2a }, smeltsTo: 'sulfur' });
add({ key: 'rich_ore', name: 'Rich Metal Ore', desc: 'Rare dense ore. Smelts into refined metal.', category: 'resource', stack: 100, icon: { shape: 'ore', c1: 0x7ab0c8, c2: 0x3a5a6a }, smeltsTo: 'hq_metal' });
add({ key: 'metal_frag', name: 'Metal Fragments', desc: 'Workhorse metal for tools, weapons and sheet-metal construction.', category: 'resource', stack: 1000, icon: { shape: 'pile', c1: 0xa8a8b0, c2: 0x6a6a72 } });
add({ key: 'hq_metal', name: 'Refined Metal', desc: 'High-grade metal for armored construction and advanced gear.', category: 'resource', stack: 100, icon: { shape: 'ingot', c1: 0xc8d8e8, c2: 0x7a8a9a } });
add({ key: 'sulfur', name: 'Sulfur', desc: 'Key ingredient of gunpowder.', category: 'resource', stack: 1000, icon: { shape: 'powder', c1: 0xf0e040, c2: 0xb0a020 } });
add({ key: 'charcoal', name: 'Charcoal', desc: 'By-product of burning wood. Used in gunpowder.', category: 'resource', stack: 1000, icon: { shape: 'pile', c1: 0x2a2a2a, c2: 0x111111 } });
add({ key: 'cloth', name: 'Cloth', desc: 'Woven plant fibre. Clothing, bandages, sleeping bags.', category: 'resource', stack: 1000, icon: { shape: 'cloth', c1: 0xc8b890, c2: 0x9a8a68 } });
add({ key: 'leather', name: 'Leather', desc: 'Tanned hide from animals.', category: 'resource', stack: 1000, icon: { shape: 'cloth', c1: 0x8a5a3a, c2: 0x5a3a22 } });
add({ key: 'animal_fat', name: 'Animal Fat', desc: 'Rendered into low grade fuel.', category: 'resource', stack: 1000, icon: { shape: 'meat', c1: 0xf0e0b0, c2: 0xc8b080 } });
add({ key: 'bone', name: 'Bone Fragments', desc: 'Harvested from carcasses.', category: 'resource', stack: 1000, icon: { shape: 'pile', c1: 0xeeeee0, c2: 0xb8b8a8 } });
add({ key: 'low_grade_fuel', name: 'Low Grade Fuel', desc: 'Fuel for lights and medical/explosive crafting.', category: 'resource', stack: 500, icon: { shape: 'can', c1: 0xc83a2a, c2: 0x5a1a10 }, fuel: 6 });
add({ key: 'gunpowder', name: 'Gunpowder', desc: 'Crafted from charcoal and sulfur.', category: 'resource', stack: 1000, icon: { shape: 'powder', c1: 0x3a3a3a, c2: 0x1a1a1a } });
add({ key: 'explosive_compound', name: 'Explosive Compound', desc: 'Stabilised high explosive. Needed for breach charges.', category: 'resource', stack: 100, icon: { shape: 'can', c1: 0x3a6a3a, c2: 0xd0c040 } });
add({ key: 'scrap', name: 'Scrap', desc: 'Salvage currency. Spent at research tables and on advanced workbenches.', category: 'resource', stack: 1000, icon: { shape: 'gear', c1: 0xb87333, c2: 0x6a4020 } });

// --- Components (loot) -------------------------------------------------------
add({ key: 'rope', name: 'Rope', desc: 'Component.', category: 'component', stack: 50, icon: { shape: 'rope', c1: 0xb8a070 } });
add({ key: 'metal_pipe', name: 'Metal Pipe', desc: 'Component for firearms.', category: 'component', stack: 20, icon: { shape: 'pipe', c1: 0x7a7a82 } });
add({ key: 'spring', name: 'Metal Spring', desc: 'Component for firearms.', category: 'component', stack: 20, icon: { shape: 'spring', c1: 0x9a9aa8 } });
add({ key: 'gears', name: 'Gears', desc: 'Component for machinery.', category: 'component', stack: 20, icon: { shape: 'gear', c1: 0x8a8a92, c2: 0x5a5a62 } });
add({ key: 'tech_parts', name: 'Tech Parts', desc: 'Salvaged electronics.', category: 'component', stack: 20, icon: { shape: 'chip', c1: 0x2a8a4a, c2: 0xd0c040 } });
add({ key: 'sewing_kit', name: 'Sewing Kit', desc: 'Component for armor.', category: 'component', stack: 20, icon: { shape: 'cloth', c1: 0xd04040, c2: 0xe0e0e0 } });

// --- Placeable blocks (Minecraft-style freeform building & terraforming) ----
const blockItem = (key: string, name: string, c1: number, desc = 'Placeable block. Weak against explosives — use structure pieces for defence.') =>
  add({ key, name, desc, category: 'block', stack: 128, icon: { shape: 'block', c1 }, placeBlock: key });
blockItem('dirt', 'Dirt', 0x79553a);
blockItem('sand', 'Sand', 0xdbd29b);
blockItem('gravel', 'Gravel', 0x8a8580);
blockItem('snow', 'Snow Block', 0xf2f6f8);
blockItem('clay', 'Clay', 0x9ea4b0);
blockItem('planks', 'Planks', 0xa7804a);
blockItem('cobblestone', 'Cobblestone', 0x6f6f6f);
blockItem('bricks', 'Bricks', 0x9a4a3a);
blockItem('glass', 'Glass', 0xc8e0e8);

// --- Tools --------------------------------------------------------------------
add({ key: 'rock', name: 'Rock', desc: 'A rock. Gathers wood and stone slowly. You always start with one.', category: 'tool', stack: 1, durability: 300, icon: { shape: 'rock', c1: 0x8d8d8d },
  tool: { damage: 9, effective: { axe: 1, pick: 1, any: 1 }, gather: { wood: 0.6, stone: 0.6, ore: 0.5, soil: 1, plant: 1 } },
  weapon: { kind: 'melee', damage: 9, damageType: 'melee', interval: 0.8, range: 2.6, loudness: 12 } });
add({ key: 'torch', name: 'Torch', desc: 'Lights the way. Can be placed as a block.', category: 'tool', stack: 8, durability: 400, icon: { shape: 'torch', c1: 0x8a6034, c2: 0xffa020 }, heldLight: 12, placeBlock: 'torch',
  tool: { damage: 3, effective: { any: 1 }, gather: { plant: 1, soil: 0.5 } },
  weapon: { kind: 'melee', damage: 6, damageType: 'melee', interval: 0.8, range: 2.4, loudness: 10 } });
add({ key: 'stone_hatchet', name: 'Stone Hatchet', desc: 'Chops wood much faster than a rock.', category: 'tool', stack: 1, durability: 400, icon: { shape: 'axe', c1: 0x8a6034, c2: 0x8d8d8d },
  tool: { damage: 14, effective: { axe: 1, any: 1, pick: 0.35 }, gather: { wood: 1.0, stone: 0.4, ore: 0.3, soil: 1, plant: 1 } },
  weapon: { kind: 'melee', damage: 12, damageType: 'melee', interval: 0.75, range: 2.6, loudness: 14, bleedChance: 0.2 } });
add({ key: 'stone_pickaxe', name: 'Stone Pickaxe', desc: 'Breaks stone and ore nodes.', category: 'tool', stack: 1, durability: 400, icon: { shape: 'pick', c1: 0x8a6034, c2: 0x8d8d8d },
  tool: { damage: 14, effective: { pick: 1, any: 1, axe: 0.35 }, gather: { stone: 1.0, ore: 1.0, wood: 0.4, soil: 1, plant: 1 } },
  weapon: { kind: 'melee', damage: 12, damageType: 'melee', interval: 0.75, range: 2.6, loudness: 14 } });
add({ key: 'metal_hatchet', name: 'Metal Hatchet', desc: 'Efficient wood cutting tool.', category: 'tool', stack: 1, durability: 700, tier: 1, icon: { shape: 'axe', c1: 0x5a4a3a, c2: 0xb0b0b8 },
  tool: { damage: 22, effective: { axe: 1, any: 1, pick: 0.35 }, gather: { wood: 1.5, stone: 0.5, ore: 0.4, soil: 1, plant: 1 } },
  weapon: { kind: 'melee', damage: 18, damageType: 'melee', interval: 0.7, range: 2.7, loudness: 14, bleedChance: 0.3 } });
add({ key: 'metal_pickaxe', name: 'Metal Pickaxe', desc: 'Efficient mining tool.', category: 'tool', stack: 1, durability: 700, tier: 1, icon: { shape: 'pick', c1: 0x5a4a3a, c2: 0xb0b0b8 },
  tool: { damage: 22, effective: { pick: 1, any: 1, axe: 0.35 }, gather: { stone: 1.5, ore: 1.5, wood: 0.5, soil: 1, plant: 1 } },
  weapon: { kind: 'melee', damage: 18, damageType: 'melee', interval: 0.7, range: 2.7, loudness: 14 } });
add({ key: 'hammer', name: 'Hammer', desc: 'LMB repairs, RMB upgrades the targeted building piece. Middle-click / R demolishes (recently placed only).', category: 'tool', stack: 1, icon: { shape: 'hammer', c1: 0x8a6034, c2: 0x6a6a72 },
  weapon: { kind: 'melee', damage: 5, damageType: 'melee', interval: 0.7, range: 3, loudness: 12 } });
add({ key: 'building_plan', name: 'Building Plan', desc: 'Place building pieces. R cycles the piece, scroll + ALT rotates stairs.', category: 'tool', stack: 1, icon: { shape: 'plan', c1: 0x3a6ab0, c2: 0xe0e0f0 } });

// --- Melee / ranged weapons -------------------------------------------------
add({ key: 'wooden_spear', name: 'Wooden Spear', desc: 'Long reach primitive weapon.', category: 'weapon', stack: 1, durability: 200, icon: { shape: 'spear', c1: 0x8a6034 },
  weapon: { kind: 'melee', damage: 32, damageType: 'melee', interval: 1.0, range: 3.2, loudness: 10, bleedChance: 0.35 } });
add({ key: 'machete', name: 'Machete', desc: 'Fast, bleeding cuts.', category: 'weapon', stack: 1, durability: 400, tier: 1, icon: { shape: 'blade', c1: 0xb0b0b8, c2: 0x3a3a3a },
  weapon: { kind: 'melee', damage: 34, damageType: 'melee', interval: 0.65, range: 2.7, loudness: 10, bleedChance: 0.5 } });
add({ key: 'hunting_bow', name: 'Hunting Bow', desc: 'Silent ranged weapon. Arrows drop over distance.', category: 'weapon', stack: 1, durability: 300, icon: { shape: 'bow', c1: 0x8a6034, c2: 0xe0e0d0 },
  weapon: { kind: 'bow', damage: 42, damageType: 'arrow', interval: 1.0, range: 120, magazine: 1, ammo: ['wooden_arrow'], reload: 0, spread: 0.008, moveSpread: 0.02, projectileSpeed: 52, gravityScale: 1, loudness: 6, bleedChance: 0.5, structureDamage: 5 } });
add({ key: 'crossbow', name: 'Crossbow', desc: 'Hard-hitting bolt thrower. Slow to reload.', category: 'weapon', stack: 1, durability: 400, tier: 1, icon: { shape: 'crossbow', c1: 0x5a4a3a, c2: 0x9a9aa8 },
  weapon: { kind: 'bow', damage: 60, damageType: 'arrow', interval: 0.5, range: 160, magazine: 1, ammo: ['wooden_arrow'], reload: 3.2, spread: 0.004, moveSpread: 0.015, projectileSpeed: 80, gravityScale: 0.8, loudness: 8, bleedChance: 0.5, structureDamage: 8 } });
add({ key: 'pipe_pistol', name: 'Pipe Pistol', desc: 'Crude semi-automatic sidearm.', category: 'weapon', stack: 1, durability: 400, tier: 1, icon: { shape: 'pistol', c1: 0x6a6a72, c2: 0x8a6034 },
  weapon: { kind: 'gun', damage: 30, damageType: 'bullet', interval: 0.22, range: 200, magazine: 8, ammo: ['pistol_ammo'], reload: 2.2, spread: 0.012, moveSpread: 0.02, recoil: { pitch: 0.03, yaw: 0.008 }, projectileSpeed: 260, gravityScale: 0.6, loudness: 110, bleedChance: 0.3, structureDamage: 10 } });
add({ key: 'scrap_shotgun', name: 'Scrap Shotgun', desc: 'Double-barrel close quarters blaster.', category: 'weapon', stack: 1, durability: 300, tier: 1, icon: { shape: 'shotgun', c1: 0x5a5a62, c2: 0x8a6034 },
  weapon: { kind: 'gun', damage: 13, damageType: 'bullet', interval: 0.35, range: 60, magazine: 2, ammo: ['shotgun_shell'], reload: 3.0, spread: 0.075, moveSpread: 0.02, recoil: { pitch: 0.09, yaw: 0.02 }, projectileSpeed: 200, gravityScale: 1, pellets: 9, loudness: 130, bleedChance: 0.3, structureDamage: 4 } });
add({ key: 'lever_rifle', name: 'Lever Rifle', desc: 'Accurate repeating rifle.', category: 'weapon', stack: 1, durability: 500, tier: 2, icon: { shape: 'rifle', c1: 0x5a4a3a, c2: 0x6a6a72 },
  weapon: { kind: 'gun', damage: 46, damageType: 'bullet', interval: 0.55, range: 300, magazine: 6, ammo: ['rifle_ammo'], reload: 3.4, spread: 0.004, moveSpread: 0.03, recoil: { pitch: 0.05, yaw: 0.01 }, projectileSpeed: 420, gravityScale: 0.5, loudness: 160, bleedChance: 0.35, structureDamage: 14 } });
add({ key: 'service_rifle', name: 'Service Rifle', desc: 'Fully-automatic battle rifle. Strong, learnable recoil.', category: 'weapon', stack: 1, durability: 600, tier: 3, icon: { shape: 'rifle', c1: 0x2a2a2e, c2: 0x8a6034 },
  weapon: { kind: 'gun', damage: 40, damageType: 'bullet', interval: 0.133, automatic: true, range: 300, magazine: 30, ammo: ['rifle_ammo'], reload: 4.2, spread: 0.007, moveSpread: 0.04, recoil: { pitch: 0.028, yaw: 0.012 }, projectileSpeed: 380, gravityScale: 0.5, loudness: 170, bleedChance: 0.35, structureDamage: 12 } });
add({ key: 'marksman_rifle', name: 'Marksman Rifle', desc: 'Bolt-action precision rifle.', category: 'weapon', stack: 1, durability: 500, tier: 3, icon: { shape: 'rifle', c1: 0x3a4a3a, c2: 0x2a2a2a },
  weapon: { kind: 'gun', damage: 82, damageType: 'bullet', interval: 1.6, range: 500, magazine: 4, ammo: ['rifle_ammo'], reload: 4.0, spread: 0.0015, moveSpread: 0.05, recoil: { pitch: 0.08, yaw: 0.01 }, projectileSpeed: 650, gravityScale: 0.4, loudness: 190, bleedChance: 0.4, structureDamage: 20 } });

// --- Ammunition ----------------------------------------------------------------
add({ key: 'wooden_arrow', name: 'Wooden Arrow', desc: 'Ammo for bows and crossbows.', category: 'ammo', stack: 64, icon: { shape: 'arrow', c1: 0x8a6034, c2: 0xe0e0d0 } });
add({ key: 'pistol_ammo', name: 'Pistol Rounds', desc: 'Ammo for pistols.', category: 'ammo', stack: 128, tier: 1, icon: { shape: 'bullet', c1: 0xc8a040 } });
add({ key: 'shotgun_shell', name: 'Buckshot Shell', desc: 'Ammo for shotguns.', category: 'ammo', stack: 64, tier: 1, icon: { shape: 'shell', c1: 0xc83a2a, c2: 0xc8a040 } });
add({ key: 'rifle_ammo', name: 'Rifle Rounds', desc: 'Ammo for rifles.', category: 'ammo', stack: 128, tier: 2, icon: { shape: 'bullet', c1: 0xd8b050, c2: 0x8a6a2a } });

// --- Explosives ------------------------------------------------------------------
add({ key: 'tin_grenade', name: 'Tin Grenade', desc: 'Thrown improvised grenade. Short fuse.', category: 'explosive', stack: 10, tier: 1, icon: { shape: 'grenade', c1: 0x8a8a6a },
  explosive: { damage: 70, structureDamage: 18, radius: 3.5, fuse: 3.0, sticky: false, throwSpeed: 16, dudChance: 0.1, loudness: 150 } });
add({ key: 'fuse_charge', name: 'Fuse Charge', desc: 'Sticky satchel of grenades. Cheap but unreliable raid tool.', category: 'explosive', stack: 10, tier: 1, icon: { shape: 'charge', c1: 0x8a6034, c2: 0xc8b890 },
  explosive: { damage: 90, structureDamage: 55, radius: 3.0, fuse: 5.5, sticky: true, throwSpeed: 11, dudChance: 0.15, loudness: 200 } });
add({ key: 'breach_charge', name: 'Breach Charge', desc: 'Military-grade timed breaching explosive.', category: 'explosive', stack: 10, tier: 3, icon: { shape: 'charge', c1: 0x3a5a3a, c2: 0xd04030 },
  explosive: { damage: 180, structureDamage: 275, radius: 3.5, fuse: 10, sticky: true, throwSpeed: 10, loudness: 300 } });

// --- Food -------------------------------------------------------------------------
add({ key: 'berries', name: 'Wild Berries', desc: 'A handful of berries.', category: 'food', stack: 20, icon: { shape: 'berry', c1: 0x8d2f6a, c2: 0x3f7f2a }, food: { calories: 25, hydration: 10 } });
add({ key: 'mushroom', name: 'Mushroom', desc: 'Edible forest mushroom.', category: 'food', stack: 20, icon: { shape: 'mushroom', c1: 0xb86b4b, c2: 0xe0d0b0 }, food: { calories: 20, hydration: 5, health: 1 } });
add({ key: 'cactus_flesh', name: 'Cactus Flesh', desc: 'Watery but not very filling.', category: 'food', stack: 20, icon: { shape: 'berry', c1: 0x3b7d2f, c2: 0x8ab060 }, food: { calories: 5, hydration: 30 } });
add({ key: 'raw_meat', name: 'Raw Meat', desc: 'Cook it first! Eating raw meat poisons you.', category: 'food', stack: 20, icon: { shape: 'meat', c1: 0xc8505a, c2: 0xf0d0d0 }, food: { calories: 20, hydration: 0, poison: 12 }, cooksTo: 'cooked_meat' });
add({ key: 'cooked_meat', name: 'Cooked Meat', desc: 'Filling. Leave it on the fire too long and it burns.', category: 'food', stack: 20, icon: { shape: 'meat', c1: 0x8a4a2a, c2: 0xc8905a }, food: { calories: 90, hydration: 0, health: 4 }, cooksTo: 'burnt_meat' });
add({ key: 'burnt_meat', name: 'Burnt Meat', desc: 'Charred, but edible.', category: 'food', stack: 20, icon: { shape: 'meat', c1: 0x2a2a2a, c2: 0x5a3a2a }, food: { calories: 25, hydration: 0 } });
add({ key: 'canned_beans', name: 'Canned Beans', desc: 'Pre-collapse ration.', category: 'food', stack: 10, icon: { shape: 'can', c1: 0x9a9aa8, c2: 0xc83a2a }, food: { calories: 120, hydration: 20, health: 2 } });
add({ key: 'water_bottle', name: 'Bottled Water', desc: 'Clean drinking water.', category: 'food', stack: 10, icon: { shape: 'bottle', c1: 0x7ab0e8, c2: 0xe0f0ff }, food: { calories: 0, hydration: 100 } });

// --- Medical ------------------------------------------------------------------------
add({ key: 'bandage', name: 'Bandage', desc: 'Stops bleeding and heals a little.', category: 'medical', stack: 10, icon: { shape: 'bandage', c1: 0xe8e0d0, c2: 0xc83a2a }, medical: { heal: 5, stopBleed: true, useTime: 2.0 } });
add({ key: 'medical_syringe', name: 'Medical Syringe', desc: 'Fast heal plus regeneration.', category: 'medical', stack: 5, tier: 1, icon: { shape: 'syringe', c1: 0xe0e0f0, c2: 0x3ac040 }, medical: { heal: 15, healOverTime: 20, stopBleed: true, useTime: 1.2 } });
add({ key: 'large_medkit', name: 'Large Medkit', desc: 'Heals a lot over time.', category: 'medical', stack: 3, tier: 2, icon: { shape: 'box', c1: 0xe0e0e0, c2: 0xc83a2a }, medical: { heal: 10, healOverTime: 80, stopBleed: true, radRemove: 10, useTime: 4 } });
add({ key: 'anti_rad_pills', name: 'Anti-Radiation Pills', desc: 'Purges absorbed radiation.', category: 'medical', stack: 10, tier: 1, icon: { shape: 'pills', c1: 0xd0c040, c2: 0x3a3a3a }, medical: { heal: 0, radRemove: 60, useTime: 1.0 } });

// --- Clothing & armor -------------------------------------------------------------
const wear = (key: string, name: string, slot: ClothingStats['slot'], shape: IconShape, c1: number, prot: ClothingStats['protection'], warmth: number, extra: Partial<ItemDef> = {}, radiation = 0) =>
  add({ key, name, desc: `${slot} clothing.`, category: 'clothing', stack: 1, icon: { shape, c1 }, clothing: { slot, protection: prot, warmth, radiation }, ...extra });
wear('burlap_hood', 'Burlap Hood', 'head', 'helmet', 0xb8a070, { melee: 0.05, bullet: 0.03, arrow: 0.05 }, 2);
wear('burlap_shirt', 'Burlap Shirt', 'torso', 'shirt', 0xb8a070, { melee: 0.06, bullet: 0.04, arrow: 0.06 }, 4);
wear('burlap_trousers', 'Burlap Trousers', 'legs', 'pants', 0x9a8a58, { melee: 0.06, bullet: 0.04, arrow: 0.06 }, 4);
wear('burlap_shoes', 'Burlap Shoes', 'feet', 'boots', 0x8a7a50, { melee: 0.03, bullet: 0.02, arrow: 0.03 }, 2);
wear('hide_gloves', 'Hide Gloves', 'hands', 'gloves', 0x8a5a3a, { melee: 0.03 }, 2);
wear('fur_vest', 'Fur Vest', 'vest', 'vest', 0x9a7a5a, { melee: 0.08, arrow: 0.05 }, 12);
wear('wood_armor', 'Wooden Chestplate', 'vest', 'vest', 0x8a6034, { melee: 0.25, bullet: 0.12, arrow: 0.3, explosive: 0.05 }, 3);
wear('can_helmet', 'Tin Can Helmet', 'head', 'helmet', 0x9a9aa8, { melee: 0.2, bullet: 0.15, arrow: 0.25 }, 1, { tier: 1 });
wear('road_kilt', 'Road Plate Kilt', 'legs', 'pants', 0x5a6a8a, { melee: 0.2, bullet: 0.2, arrow: 0.25, explosive: 0.05 }, -1, { tier: 1 });
wear('metal_chestplate', 'Metal Chestplate', 'vest', 'vest', 0x7a7a82, { melee: 0.35, bullet: 0.35, arrow: 0.45, explosive: 0.15 }, -4, { tier: 2 });
wear('metal_facemask', 'Metal Face Mask', 'head', 'helmet', 0x6a6a72, { melee: 0.4, bullet: 0.45, arrow: 0.5, explosive: 0.1 }, -1, { tier: 2 });
wear('hazmat_suit', 'Hazmat Suit', 'vest', 'vest', 0xd8c020, { melee: 0.1, bullet: 0.08, arrow: 0.1, explosive: 0.05 }, 6, { tier: 2 }, 0.9);

// --- Construction & deployables ----------------------------------------------------
const deploy = (key: string, name: string, desc: string, shape: IconShape, c1: number, block: string, extra: Partial<ItemDef> = {}) =>
  add({ key, name, desc, category: 'deployable', stack: extra.stack ?? 1, icon: { shape, c1 }, placeBlock: block, ...extra });
deploy('workbench1', 'Workbench Level 1', 'Unlocks tier 1 crafting nearby.', 'bench', 0x8a6034, 'workbench1');
deploy('workbench2', 'Workbench Level 2', 'Unlocks tier 2 crafting nearby.', 'bench', 0x6d6d6d, 'workbench2');
deploy('workbench3', 'Workbench Level 3', 'Unlocks tier 3 crafting nearby.', 'bench', 0x4a5a6a, 'workbench3');
deploy('furnace', 'Furnace', 'Smelts ore using wood as fuel.', 'furnace', 0x6d6d6d, 'furnace');
deploy('campfire', 'Campfire', 'Cook food and keep warm. Visible light at night.', 'fire', 0xd06a20, 'campfire');
deploy('small_box', 'Small Box', 'Storage with 12 slots.', 'box', 0x9a7040, 'small_box', { stack: 5 });
deploy('large_box', 'Large Box', 'Storage with 30 slots.', 'box', 0x7a5530, 'large_box', { tier: 1 });
deploy('claim_totem', 'Claim Totem', 'Claims building privilege over your base and holds upkeep resources.', 'totem', 0xd9a441, 'claim_totem');
deploy('sleeping_bag', 'Sleeping Bag', 'Respawn point. Has a cooldown after use.', 'bag', 0x6b8f3a, 'sleeping_bag', { stack: 3 });
deploy('research_table', 'Research Table', 'Spend scrap to learn blueprints of items.', 'research', 0x557799, 'research_table', { tier: 1 });
add({ key: 'wooden_door', name: 'Wooden Door', desc: 'Place in a doorway.', category: 'construction', stack: 1, icon: { shape: 'door', c1: 0x8a6034 }, doorTier: 0 });
add({ key: 'metal_door', name: 'Sheet Metal Door', desc: 'Place in a doorway.', category: 'construction', stack: 1, tier: 1, icon: { shape: 'door', c1: 0x7f6a5a }, doorTier: 1 });
add({ key: 'armored_door', name: 'Armored Door', desc: 'Place in a doorway.', category: 'construction', stack: 1, tier: 2, icon: { shape: 'door', c1: 0x4f5560 }, doorTier: 2 });
add({ key: 'code_lock', name: 'Code Lock', desc: 'Use on a door or box to lock it with a 4-digit code.', category: 'construction', stack: 5, icon: { shape: 'lock', c1: 0x5a5a62, c2: 0x3ac040 } });

export const ITEM_LIST: readonly ItemDef[] = ITEMS;
const map = new Map<string, ItemDef>(ITEMS.map((d) => [d.key, d]));
if (map.size !== ITEMS.length) throw new Error('Duplicate item key');

export function itemDef(key: string): ItemDef {
  const d = map.get(key);
  if (!d) throw new Error(`Unknown item '${key}'`);
  return d;
}
export const isItem = (key: string) => map.has(key);
export const tryItemDef = (key: string) => map.get(key);
