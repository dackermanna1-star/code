/**
 * Block classes for disasters (built lazily from the block registry):
 *   WEAK      plants, leaves, wood, glass, wool, snow layers ... (burnt by lava, smashed by water)
 *   ERODIBLE  sand, red sand, gravel (moved by water, kept as ground)
 *   STRONG    everything else that is solid (ground)
 * plus helpers to find the ground under trees and vegetation.
 */
import { BLOCKS, T_LIQUID, T_SOLID } from '../../../world/blocks/registry';
import type { World } from '../../../world/world';

export const AIR = 0, WEAK = 1, ERODIBLE = 2, STRONG = 3, LIQUID = 4;

let CLS: Uint8Array | null = null;
let FLAM: Uint8Array | null = null;

const WEAK_TAGS = new Set(['leaves', 'logs', 'planks', 'wooden_stairs', 'wooden_slabs', 'wool', 'stained_glass', 'fences', 'fence_gates', 'doors', 'trapdoors', 'plant', 'crops', 'sapling', 'flowers', 'mushroom', 'buttons', 'pressure_plates']);

function build() {
  const cls = new Uint8Array(4096);
  const flam = new Uint8Array(4096);
  for (const b of BLOCKS) {
    let c = STRONG;
    if (b.isAir) c = AIR;
    else if (b.liquid) c = LIQUID;
    else if (!b.solid || b.replaceable) c = WEAK;
    else if (b.tags.some((t) => WEAK_TAGS.has(t))) c = WEAK;
    else if (b.name.includes('glass') || b.name.includes('_log') || b.name.includes('_wood') || b.name === 'snow' || b.name === 'cactus' || b.name === 'bamboo' || b.name === 'hay_block' || b.name === 'bookshelf') c = WEAK;
    else if (b.sound === 'wood' && b.hardness <= 3) c = WEAK;
    else if (b.name === 'sand' || b.name === 'red_sand' || b.name === 'gravel') c = ERODIBLE;
    if (b.hardness < 0) c = STRONG; // bedrock, barriers ...
    cls[b.id] = c;
    flam[b.id] = b.flammability > 0 || b.fireEncouragement > 0 ? 1 : 0;
  }
  CLS = cls;
  FLAM = flam;
}

/** Class of a block state (AIR / WEAK / ERODIBLE / STRONG / LIQUID). */
export function blockClass(state: number): number {
  if (!CLS) build();
  return CLS![state >>> 4];
}
export function isFlammable(state: number): boolean {
  if (!FLAM) build();
  return FLAM![state >>> 4] === 1;
}
export const isLiquid = (state: number) => T_LIQUID[state >>> 4] !== 0;
export const isSolid = (state: number) => T_SOLID[state >>> 4] === 1;

/**
 * Ground top at a column: highest ERODIBLE/STRONG block (skipping air, liquids, vegetation,
 * trees and buildings' weak parts), scanning down from the heightmap. -1 if none / unloaded.
 */
export function groundTop(world: World, x: number, z: number, maxScan = 80): number {
  if (!world.isLoaded(x, z)) return -1;
  let y = Math.min(255, world.getHeight(x, z) + 1);
  const end = Math.max(0, y - maxScan);
  for (; y >= end; y--) {
    const c = blockClass(world.getBlock(x, y, z));
    if (c === STRONG || c === ERODIBLE) return y;
  }
  return -1;
}

/** Surface of liquid above the ground (y of the top liquid block) or -1 if dry. */
export function liquidTop(world: World, x: number, z: number, ground: number): number {
  let y = ground + 1, top = -1;
  while (y < 256 && isLiquid(world.getBlock(x, y, z))) top = y++;
  return top;
}
