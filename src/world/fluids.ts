/**
 * Minecraft fluid mechanics for water and lava: sources, flowing levels (1..7), falling
 * fluid (|8), infinite water sources, shortest-path flow toward drops, lava/water reactions.
 * Implemented as block behaviours driven by scheduled ticks.
 */
import { addBehavior } from './blocks/behaviors';
import { BLOCKS, BLOCK_BY_NAME, T_REPLACEABLE, T_LIQUID, T_SOLID, T_FULL_CUBE, S, stateOf } from './blocks/registry';
import type { World } from './world';
import { SetFlags } from './world';

const WATER = BLOCK_BY_NAME.get('water')!.id;
const LAVA = BLOCK_BY_NAME.get('lava')!.id;
const H4: [number, number][] = [[0, -1], [0, 1], [-1, 0], [1, 0]];

function tickDelay(world: World, id: number) {
  if (id === WATER) return 5;
  return world.dimension === 'nether' ? 10 : 30;
}
function dropOff(world: World, id: number) {
  return id === WATER || world.dimension === 'nether' ? 1 : 2;
}
function slopeDist(world: World, id: number) {
  return id === WATER || world.dimension === 'nether' ? 4 : 2;
}

/** Can fluid flow into this state? */
function canReplace(st: number, id: number): boolean {
  if (st === 0) return true;
  const sid = st >>> 4;
  if (sid === id) return (st & 7) !== 0 || (st & 8) !== 0;
  if (T_LIQUID[sid]) return true; // other fluid -> reaction handled elsewhere
  const d = BLOCKS[sid];
  if (d.shape === 'door' || d.shape === 'ladder' || d.name === 'sugar_cane' || d.shape === 'portal' || d.shape === 'end_portal') return false;
  return T_REPLACEABLE[sid] === 1 || (!T_SOLID[sid] && !T_FULL_CUBE[sid] && d.shape !== 'lily_pad');
}

function isSource(st: number, id: number) {
  return st >>> 4 === id && (st & 15) === 0;
}
function levelOf(st: number, id: number): number {
  if (st >>> 4 !== id) return -1;
  return st & 8 ? 8 : st & 7;
}

/** Reactions when lava and water meet. Returns true if the fluid at (x,y,z) was converted. */
function react(world: World, x: number, y: number, z: number, st: number): boolean {
  const id = st >>> 4;
  if (id !== LAVA) return false;
  for (const [dx, dy, dz] of [[0, 1, 0], [0, 0, -1], [0, 0, 1], [-1, 0, 0], [1, 0, 0]] as [number, number, number][]) {
    const n = world.getBlock(x + dx, y + dy, z + dz);
    if (n >>> 4 === WATER) {
      const src = (st & 15) === 0;
      world.setBlock(x, y, z, src ? S('obsidian') : S('cobblestone'), SetFlags.ALL);
      (world as any).systems.fluidFizz?.(x, y, z);
      return true;
    }
  }
  return false;
}

function update(world: World, x: number, y: number, z: number, st: number) {
  const id = st >>> 4;
  if (react(world, x, y, z, st)) return;
  const drop = dropOff(world, id);
  let level = levelOf(st, id);
  // recompute level for non-sources
  if (level !== 0) {
    let best = 99;
    let sources = 0;
    for (const [dx, dz] of H4) {
      const n = world.getBlock(x + dx, y, z + dz);
      const l = levelOf(n, id);
      if (l < 0) continue;
      if (l === 0) sources++;
      const eff = l >= 8 ? 0 : l;
      best = Math.min(best, eff + drop);
    }
    const above = world.getBlock(x, y + 1, z);
    let nl = above >>> 4 === id ? 8 : best;
    if (id === WATER && sources >= 2) {
      const below = world.getBlock(x, y - 1, z);
      if (T_SOLID[below >>> 4] || isSource(below, id)) nl = 0;
    }
    if (nl >= 8 && nl !== 8) {
      world.setBlock(x, y, z, 0, SetFlags.ALL);
      return;
    }
    if (nl !== level) {
      const ns = nl === 8 ? stateOf(id, 8) : stateOf(id, nl);
      world.setBlock(x, y, z, ns, SetFlags.ALL);
      world.scheduleTick(x, y, z, tickDelay(world, id));
      return;
    }
    level = nl;
  }
  // flow down
  const below = world.getBlock(x, y - 1, z);
  if (y > 0 && canReplace(below, id)) {
    if (below >>> 4 === WATER && id === LAVA) {
      world.setBlock(x, y - 1, z, S('stone'), SetFlags.ALL);
      return;
    }
    if (below >>> 4 === LAVA && id === WATER) {
      world.setBlock(x, y - 1, z, (below & 15) === 0 ? S('obsidian') : S('stone'), SetFlags.ALL);
      return;
    }
    if (levelOf(below, id) !== 8) {
      destroyReplaced(world, x, y - 1, z, below);
      world.setBlock(x, y - 1, z, stateOf(id, 8), SetFlags.ALL);
      world.scheduleTick(x, y - 1, z, tickDelay(world, id));
    }
    if (level !== 0) return;
  }
  // horizontal spread
  const eff = level >= 8 ? 0 : level;
  const nl = eff + drop;
  if (nl >= 8) return;
  const dirs = spreadDirs(world, x, y, z, id);
  for (const [dx, dz] of dirs) {
    const nx = x + dx, nz = z + dz;
    const n = world.getBlock(nx, y, nz);
    if (!canReplace(n, id)) continue;
    const cur = levelOf(n, id);
    if (cur >= 0 && cur <= nl && cur !== 8) continue;
    if (n >>> 4 === WATER && id === LAVA) { world.setBlock(nx, y, nz, S('cobblestone'), SetFlags.ALL); continue; }
    if (n >>> 4 === LAVA && id === WATER) { world.setBlock(nx, y, nz, (n & 15) === 0 ? S('obsidian') : S('cobblestone'), SetFlags.ALL); continue; }
    destroyReplaced(world, nx, y, nz, n);
    world.setBlock(nx, y, nz, stateOf(id, nl), SetFlags.ALL);
    world.scheduleTick(nx, y, nz, tickDelay(world, id));
  }
}

function destroyReplaced(world: World, x: number, y: number, z: number, st: number) {
  if (st === 0 || T_LIQUID[st >>> 4]) return;
  (world as any).systems.fluidDestroyed?.(x, y, z, st);
}

/** Directions toward the nearest drop (Minecraft's slope search), or all open directions. */
function spreadDirs(world: World, x: number, y: number, z: number, id: number): [number, number][] {
  const maxD = slopeDist(world, id);
  let best = 1000;
  const res: [number, number][] = [];
  for (const [dx, dz] of H4) {
    const n = world.getBlock(x + dx, y, z + dz);
    if (!canReplace(n, id) || isSource(n, id)) continue;
    const d = holeDistance(world, x + dx, y, z + dz, id, 1, maxD, -dx, -dz);
    if (d < best) { best = d; res.length = 0; }
    if (d === best) res.push([dx, dz]);
  }
  return res;
}

function holeDistance(world: World, x: number, y: number, z: number, id: number, depth: number, maxD: number, fromX: number, fromZ: number): number {
  const below = world.getBlock(x, y - 1, z);
  if (canReplace(below, id)) return depth;
  if (depth >= maxD) return 1000;
  let best = 1000;
  for (const [dx, dz] of H4) {
    if (dx === fromX && dz === fromZ) continue;
    const n = world.getBlock(x + dx, y, z + dz);
    if (!canReplace(n, id) || isSource(n, id)) continue;
    best = Math.min(best, holeDistance(world, x + dx, y, z + dz, id, depth + 1, maxD, -dx, -dz));
  }
  return best;
}

let installed = false;
export function installFluids() {
  if (installed) return;
  installed = true;
  for (const id of [WATER, LAVA]) {
    addBehavior(id, {
      onPlace(world, x, y, z) {
        world.scheduleTick(x, y, z, tickDelay(world, id));
      },
      onNeighborChange(world, x, y, z, st) {
        if (react(world, x, y, z, st)) return;
        world.scheduleTick(x, y, z, tickDelay(world, id));
      },
      onScheduledTick(world, x, y, z, st) {
        update(world, x, y, z, st);
      },
    });
  }
}
