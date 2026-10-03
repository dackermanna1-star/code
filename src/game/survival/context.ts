/**
 * Shared helpers for the survival systems. Block behaviours only receive a `World`, so systems
 * store the active Game here on init.
 */
import * as THREE from 'three';
import type { Game } from '../game';
import type { World } from '../../world/world';
import { BLOCKS } from '../../world/blocks/registry';
import { tryItem, stack as mkStack, type ItemStack } from '../items/registry';

let current: Game | null = null;
export function setSurvivalGame(g: Game) {
  current = g;
}
/** The game, if `world` is the active world (behaviours of unloaded dimensions do nothing). */
export function gameFor(world: World): Game | null {
  return current && current.world === world ? current : null;
}
export function survivalGame(): Game | null {
  return current;
}

export function play(game: Game | null, name: string, x: number, y: number, z: number, volume = 1, pitch?: number) {
  try {
    game?.audio?.play?.(name, { pos: { x, y, z }, volume, pitch });
  } catch {
    /* audio optional */
  }
}

/** Drop the block's loot at a position (as when broken by hand) and remove it. */
export function destroyBlock(world: World, x: number, y: number, z: number, drops = true) {
  const g = gameFor(world);
  if (g) g.breakBlock(x, y, z, drops, null, null);
  else world.setBlock(x, y, z, 0);
}

export function dropStack(game: Game, name: string, count: number, x: number, y: number, z: number) {
  const it = tryItem(name);
  if (!it || count <= 0) return;
  game.dropItem(mkStack(it, count), new THREE.Vector3(x, y, z), undefined, 10);
}

/** Consume one item from the stack used in `hand` (not in creative). */
export function consumeUsed(player: any, stack: ItemStack, hand: 'main' | 'off', n = 1) {
  if (player.creative) return;
  const slot = hand === 'main' ? player.inventory.selected : 40;
  if (player.inventory.get(slot) === stack) player.inventory.consumeHeld(n, slot);
}

/** Damage the tool used in `hand`. */
export function damageUsed(player: any, hand: 'main' | 'off', n = 1) {
  player.damageItem?.(hand === 'main' ? player.inventory.selected : 40, n);
}

export const blockName = (state: number) => BLOCKS[state >>> 4]?.name ?? 'air';

/** Max of sky light (without night darkening) and block light — Minecraft raw brightness. */
export function rawBrightness(world: World, x: number, y: number, z: number) {
  return Math.max(world.getSkyLight(x, y, z), world.getBlockLight(x, y, z));
}

export const H4: readonly [number, number][] = [[0, -1], [0, 1], [-1, 0], [1, 0]];
