/**
 * Physical material properties (friction, restitution, density) for terrain and rigid bodies.
 * Worker-safe (pure data derived from the block registry).
 *
 * Terrain colliders are grouped per section into a few "surface classes" (one voxel collider
 * per class), because a Rapier voxel shape carries a single material.
 */
import { BLOCKS, type BlockDef } from '../world/blocks/registry';
import { tryItem, type ItemStack } from '../game/items/registry';

export interface PhysMaterial {
  friction: number;
  restitution: number;
  /** kg/m³ */
  density: number;
}

/** Surface classes for terrain voxel colliders. */
export const enum SurfaceClass {
  DEFAULT = 0,
  SOFT = 1,
  ICE = 2,
  SLIME = 3,
  HONEY = 4,
}
export const SURFACE_CLASS_COUNT = 5;

/** Terrain surface materials per class (combined with body materials: friction Min, restitution Max). */
export const SURFACE_MATERIALS: PhysMaterial[] = [
  { friction: 0.75, restitution: 0.12, density: 2500 }, // stone, wood, metal, glass ...
  { friction: 0.9, restitution: 0.02, density: 1500 }, // dirt, grass, sand, gravel, snow, wool, leaves
  { friction: 0.035, restitution: 0.08, density: 900 }, // ice, packed/blue ice
  { friction: 0.8, restitution: 0.88, density: 1100 }, // slime
  { friction: 1.4, restitution: 0.0, density: 1400 }, // honey
];

const SOFT_SOUNDS = new Set(['grass', 'gravel', 'sand', 'snow', 'wool', 'soul_sand', 'nylium', 'crop', 'plant']);

export function surfaceClassOf(def: BlockDef): SurfaceClass {
  if (def.name === 'slime_block') return SurfaceClass.SLIME;
  if (def.name === 'honey_block') return SurfaceClass.HONEY;
  if (def.friction > 0.9) return SurfaceClass.ICE;
  if (SOFT_SOUNDS.has(def.sound) || def.shape === 'leaves' || def.tags.includes('dirt')) return SurfaceClass.SOFT;
  return SurfaceClass.DEFAULT;
}

const CLASS_CACHE: Int8Array = new Int8Array(4096).fill(-1);
export function surfaceClassOfId(id: number): SurfaceClass {
  let c = CLASS_CACHE[id];
  if (c < 0) c = CLASS_CACHE[id] = surfaceClassOf(BLOCKS[id] ?? BLOCKS[0]);
  return c as SurfaceClass;
}

/** Material of a block when it becomes a physical object (debris, block item). */
export function blockMaterial(def: BlockDef): PhysMaterial {
  const n = def.name;
  if (n === 'slime_block') return { friction: 0.8, restitution: 0.85, density: 1100 };
  if (n === 'honey_block') return { friction: 1.2, restitution: 0.0, density: 1400 };
  if (n === 'tnt') return { friction: 0.6, restitution: 0.12, density: 150 };
  if (def.friction > 0.9) return { friction: 0.04, restitution: 0.1, density: 917 };
  switch (def.sound) {
    case 'wood': case 'stem': case 'ladder': case 'scaffold':
      return { friction: 0.55, restitution: 0.3, density: 650 };
    case 'metal': case 'anvil': case 'chain': case 'lantern':
      return { friction: 0.45, restitution: 0.25, density: 7800 };
    case 'glass':
      return { friction: 0.4, restitution: 0.15, density: 2500 };
    case 'wool':
      return { friction: 0.95, restitution: 0.02, density: 250 };
    case 'grass': case 'plant': case 'crop':
      return def.shape === 'leaves' ? { friction: 0.9, restitution: 0.05, density: 250 } : { friction: 0.85, restitution: 0.06, density: 1350 };
    case 'gravel': case 'sand': case 'soul_sand':
      return { friction: 0.85, restitution: 0.04, density: 1600 };
    case 'snow':
      return { friction: 0.7, restitution: 0.02, density: 500 };
    case 'bone':
      return { friction: 0.6, restitution: 0.3, density: 1900 };
    default:
      return { friction: 0.7, restitution: 0.18, density: 2400 };
  }
}

export type ItemShapeKind = 'block' | 'flat' | 'tool' | 'long';

/** Block shapes whose item is drawn as a flat sprite in Minecraft. */
const SPRITE_BLOCK_SHAPES = new Set(['door', 'torch', 'ladder', 'lever', 'rail', 'wire', 'cross', 'double_plant', 'vine', 'lily_pad', 'button', 'repeater', 'comparator', 'chain', 'end_rod', 'pane', 'fire', 'crop', 'stem']);

/** Approximate physical shape of a dropped item: half extents (m) and material. */
export function itemPhysShape(stack: ItemStack): { kind: ItemShapeKind; half: [number, number, number]; mat: PhysMaterial; mass: number } {
  const it = stack.item;
  const blockName = it?.block;
  const def = blockName ? BLOCKS.find((b) => b.name === blockName) : undefined;
  if (def && it.visual?.kind !== 'sprite' && def.solid && !SPRITE_BLOCK_SHAPES.has(def.shape)) {
    const mat = blockMaterial(def);
    // Minecraft renders dropped blocks at 1/4 scale
    const half: [number, number, number] = [0.125, 0.125, 0.125];
    if (def.shape === 'slab') half[1] = 0.0625;
    if (def.shape === 'carpet' || def.shape === 'pressure_plate') half[1] = 0.02;
    return { kind: 'block', half, mat, mass: clampMass(mat.density * 8 * half[0] * half[1] * half[2] * 0.35) };
  }
  const n = it?.name ?? '';
  const metal = /iron|gold|netherite|chain|bucket|shears|compass|clock|anvil/.test(n);
  const mat: PhysMaterial = metal ? { friction: 0.45, restitution: 0.25, density: 7800 } : { friction: 0.6, restitution: 0.2, density: 900 };
  if (it?.tool || /sword|trident|bow|crossbow|fishing_rod|stick|rod|blaze_rod|bone/.test(n)) {
    // long thin object (tool handle)
    const isTool = !!it?.tool && it.tool.type !== 'sword';
    const half: [number, number, number] = isTool ? [0.16, 0.035, 0.11] : [0.24, 0.025, 0.06];
    return { kind: isTool ? 'tool' : 'long', half, mat, mass: metal ? 1.4 : 0.6 };
  }
  // flat sprite-like item (lies flat on the ground)
  return { kind: 'flat', half: [0.16, 0.018, 0.16], mat, mass: metal ? 0.6 : 0.2 };
}

function clampMass(m: number) {
  return Math.max(0.15, Math.min(6, m));
}

/** Mass helper for an item name (used by combat/pushing). */
export function itemMassByName(name: string): number {
  const it = tryItem(name);
  if (!it) return 1;
  return itemPhysShape({ item: it, count: 1, damage: 0 }).mass;
}
