/**
 * Block placement rules: orientation states for every shape, support checks, multi-block
 * placement (doors, beds, tall plants).
 */
import { BLOCKS, BLOCK_BY_NAME, T_FULL_CUBE, T_REPLACEABLE, T_SOLID, stateOf, type BlockDef } from '../world/blocks/registry';
import { behaviorOf, type PlacementContext } from '../world/blocks/behaviors';
import { Dir, DIR_X, DIR_Y, DIR_Z, DIR_OPPOSITE } from '../core/dirs';
import type { World } from '../world/world';

/** Horizontal facing index (S=0,W=1,N=2,E=3) for a Dir. */
const H_OF_DIR = [-1, -1, 2, 0, 1, 3];
/** Dir for a horizontal facing index */
const DIR_OF_H = [Dir.SOUTH, Dir.WEST, Dir.NORTH, Dir.EAST];

function sturdyTop(world: World, x: number, y: number, z: number) {
  const s = world.getBlock(x, y, z);
  if (!s) return false;
  const d = BLOCKS[s >>> 4];
  if (T_FULL_CUBE[s >>> 4]) return true;
  if (d.shape === 'slab') return (s & 15) !== 0;
  if (d.shape === 'stairs') return ((s >> 2) & 1) === 1;
  if (d.shape === 'farmland' || d.shape === 'path' || d.shape === 'fence' || d.shape === 'wall' || d.name === 'glass' || d.tags.includes('stained_glass')) return true;
  return d.solid && d.layer === 'opaque' && d.shape === 'cube';
}
export function sturdyFace(world: World, x: number, y: number, z: number, _face: number) {
  const s = world.getBlock(x, y, z);
  return s !== 0 && T_FULL_CUBE[s >>> 4] === 1;
}

/** Default placement state for a block given the context (or null if not placeable). */
export function placementState(def: BlockDef, ctx: PlacementContext): number | null {
  const id = def.id;
  const face = ctx.face; // face of the clicked block = direction from clicked block to new position
  const pf = ctx.playerFacing; // horizontal facing the player looks toward (S=0,W=1,N=2,E=3)
  const opp = (h: number) => (h + 2) & 3;
  const { world, x, y, z } = ctx;
  const below = world.getBlock(x, y - 1, z);
  const belowName = below ? BLOCKS[below >>> 4].name : 'air';
  switch (def.shape) {
    case 'cube':
    case 'grass_block':
    case 'leaves': {
      if (def.orient === 'axis') {
        const axis = face <= 1 ? 0 : face >= 4 ? 1 : 2;
        return stateOf(id, axis);
      }
      if (def.orient === 'hfacing') return stateOf(id, opp(pf)); // front faces the player
      if (def.orient === 'facing') {
        // observers/dispensers/barrels face the player (pitch decides up/down)
        if (Math.abs(ctx.pitch) > 0.8) return stateOf(id, ctx.pitch > 0 ? Dir.DOWN : Dir.UP);
        return stateOf(id, DIR_OF_H[opp(pf)]);
      }
      if (def.shape === 'leaves') return stateOf(id, 4); // persistent (player placed)
      return stateOf(id, 0);
    }
    case 'piston': {
      if (Math.abs(ctx.pitch) > 0.8) return stateOf(id, ctx.pitch > 0 ? Dir.DOWN : Dir.UP);
      return stateOf(id, DIR_OF_H[opp(pf)]);
    }
    case 'chain':
    case 'end_rod': {
      if (def.shape === 'chain') return stateOf(id, face <= 1 ? 0 : face >= 4 ? 1 : 2);
      return stateOf(id, face);
    }
    case 'slab': {
      const hit = world.getBlock(x, y, z);
      if (hit >>> 4 === id) return stateOf(id, 2); // merging into a double slab handled by caller
      const top = face === Dir.DOWN || (face !== Dir.UP && ctx.hitY > 0.5);
      return stateOf(id, top ? 1 : 0);
    }
    case 'stairs': {
      const upside = face === Dir.DOWN || (face !== Dir.UP && ctx.hitY > 0.5);
      return stateOf(id, pf | (upside ? 4 : 0));
    }
    case 'fence_gate':
      return stateOf(id, pf);
    case 'trapdoor': {
      let h = opp(pf);
      let top = 0;
      if (face >= 2) { h = H_OF_DIR[face]; top = ctx.hitY > 0.5 ? 1 : 0; }
      else top = face === Dir.DOWN ? 1 : 0;
      return stateOf(id, h | (top << 3));
    }
    case 'door': {
      if (!sturdyTop(world, x, y - 1, z)) return null;
      const above = world.getBlock(x, y + 1, z);
      if (above && !T_REPLACEABLE[above >>> 4]) return null;
      return stateOf(id, pf);
    }
    case 'bed': {
      const hx = x + DIR_X[DIR_OF_H[pf]], hz = z + DIR_Z[DIR_OF_H[pf]];
      const head = world.getBlock(hx, y, hz);
      if (head && !T_REPLACEABLE[head >>> 4]) return null;
      if (!sturdyTop(world, x, y - 1, z) || !sturdyTop(world, hx, y - 1, hz)) return null;
      return stateOf(id, pf);
    }
    case 'torch': {
      if (face === Dir.UP || face === Dir.DOWN) {
        if (!sturdyTop(world, x, y - 1, z) && !(belowName.endsWith('fence') || belowName.endsWith('wall'))) {
          // try a wall instead
          for (const d of [Dir.NORTH, Dir.SOUTH, Dir.WEST, Dir.EAST]) if (sturdyFace(world, x - DIR_X[d], y, z - DIR_Z[d], d)) return stateOf(id, d);
          return null;
        }
        return stateOf(id, 1);
      }
      if (!sturdyFace(world, x - DIR_X[face], y, z - DIR_Z[face], face)) return null;
      return stateOf(id, face);
    }
    case 'ladder': {
      if (face < 2) return null;
      if (!sturdyFace(world, x - DIR_X[face], y, z - DIR_Z[face], face)) return null;
      return stateOf(id, H_OF_DIR[face]);
    }
    case 'lever':
    case 'button': {
      // attach: 0 ceiling, 1 floor, 2..5 wall facing N,S,W,E
      let attach: number;
      if (face === Dir.UP) attach = 1;
      else if (face === Dir.DOWN) attach = 0;
      else attach = face; // wall facing direction (2..5)
      const sx = x - DIR_X[face], sy = y - DIR_Y[face], sz = z - DIR_Z[face];
      if (!sturdyFace(world, sx, sy, sz, face)) return null;
      return stateOf(id, attach);
    }
    case 'pressure_plate':
    case 'carpet':
    case 'wire':
    case 'rail':
    case 'repeater':
    case 'comparator':
    case 'daylight_detector':
    case 'flower_pot':
    case 'cake': {
      if (def.shape === 'carpet' ? !below || !T_SOLID[below >>> 4] && BLOCKS[below >>> 4].shape !== 'carpet' : !sturdyTop(world, x, y - 1, z)) {
        if (def.shape !== 'carpet') return null;
      }
      if (def.shape === 'repeater' || def.shape === 'comparator') return stateOf(id, pf);
      if (def.shape === 'rail') return stateOf(id, pf === 1 || pf === 3 ? 1 : 0);
      return stateOf(id, 0);
    }
    case 'cross':
    case 'double_plant':
    case 'crop':
    case 'stem': {
      if (!canPlantSurvive(def, world, x, y, z)) return null;
      if (def.shape === 'double_plant') {
        const above = world.getBlock(x, y + 1, z);
        if (above && !T_REPLACEABLE[above >>> 4]) return null;
      }
      return stateOf(id, 0);
    }
    case 'cactus': {
      if (!canPlantSurvive(def, world, x, y, z)) return null;
      return stateOf(id, 0);
    }
    case 'lily_pad': {
      const b = world.getBlock(x, y - 1, z);
      if (BLOCKS[b >>> 4].liquid !== 1) return null;
      return stateOf(id, 0);
    }
    case 'vine': {
      if (face < 2) return null;
      const bit = [0, 0, 4, 1, 2, 8][DIR_OPPOSITE[face]]; // attached to the wall behind (bits: 1 S, 2 W, 4 N, 8 E)
      return stateOf(id, bit || 1);
    }
    case 'snow_layer': {
      const here = world.getBlock(x, y, z);
      if (here >>> 4 === id) return stateOf(id, Math.min(7, (here & 7) + 1));
      if (!sturdyTop(world, x, y - 1, z) && !BLOCKS[below >>> 4].tags.includes('leaves')) return null;
      return stateOf(id, 0);
    }
    case 'lantern': {
      if (face === Dir.DOWN || (!sturdyTop(world, x, y - 1, z) && world.getBlock(x, y + 1, z))) return stateOf(id, 1);
      return stateOf(id, 0);
    }
    case 'chest':
    case 'anvil':
    case 'end_portal_frame':
    case 'campfire':
      return stateOf(id, opp(pf));
    case 'hopper':
      return stateOf(id, face === Dir.UP || face === Dir.DOWN ? Dir.DOWN : DIR_OPPOSITE[face]);
    default:
      return stateOf(id, 0);
  }
}

/** Plant survival rules (shared by placement and neighbour updates). */
export function canPlantSurvive(def: BlockDef, world: World, x: number, y: number, z: number): boolean {
  const below = world.getBlock(x, y - 1, z);
  if (!below) return false;
  const b = BLOCKS[below >>> 4];
  const n = def.name;
  if (def.shape === 'crop' || def.shape === 'stem') return n === 'nether_wart' ? b.name === 'soul_sand' : b.name === 'farmland';
  if (n === 'sugar_cane') {
    if (b.name === 'sugar_cane') return true;
    if (!['grass_block', 'dirt', 'sand', 'red_sand', 'coarse_dirt', 'podzol', 'mud', 'moss_block'].includes(b.name)) return false;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const s = world.getBlock(x + dx, y - 1, z + dz);
      if (s && BLOCKS[s >>> 4].liquid === 1) return true;
    }
    return false;
  }
  if (n === 'cactus') {
    if (b.name !== 'sand' && b.name !== 'red_sand' && b.name !== 'cactus') return false;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const s = world.getBlock(x + dx, y, z + dz);
      if (s && T_SOLID[s >>> 4]) return false;
    }
    return true;
  }
  if (n === 'dead_bush') return ['sand', 'red_sand', 'terracotta', 'dirt', 'coarse_dirt', 'podzol'].includes(b.name) || b.tags.includes('terracotta');
  if (n.includes('mushroom')) return T_FULL_CUBE[below >>> 4] === 1;
  if (n.includes('fungus') || n.includes('roots')) return ['crimson_nylium', 'warped_nylium', 'soul_soil', 'netherrack', 'grass_block', 'dirt', 'mycelium', 'podzol', 'moss_block'].includes(b.name);
  if (n === 'kelp' || n === 'seagrass') return T_FULL_CUBE[below >>> 4] === 1 || b.name === 'kelp';
  if (n === 'bamboo') return b.name === 'bamboo' || b.tags.includes('dirt') || b.tags.includes('sand') || b.name === 'gravel';
  if (n === 'weeping_vines') return true;
  if (def.shape === 'double_plant' && (def as any) && false) return true;
  // flowers, grass, saplings
  return b.tags.includes('dirt') || b.name === 'farmland' || b.name === 'moss_block' || b.name === 'mud';
}

/**
 * Attempt to place an item's block. Returns true on success.
 * Handles replaceable targets, slab merging, entity collisions (via `blocked`), and multi-block shapes.
 */
export function tryPlace(world: World, def: BlockDef, ctx: PlacementContext, blocked: (x: number, y: number, z: number, state: number) => boolean): number | null {
  const beh = behaviorOf(def.id);
  let state = placementState(def, ctx);
  if (state !== null && beh?.getPlacementState) state = beh.getPlacementState(ctx, state);
  if (state === null) return null;
  const { x, y, z } = ctx;
  const existing = world.getBlock(x, y, z);
  if (def.shape === 'slab' && existing >>> 4 === def.id && (existing & 15) !== 2) {
    // merge into double slab
    state = stateOf(def.id, 2);
  } else if (def.shape === 'snow_layer' && existing >>> 4 === def.id) {
    // stacking handled by placementState
  } else if (existing && !T_REPLACEABLE[existing >>> 4]) return null;
  if (beh?.canSurvive && !beh.canSurvive(world, x, y, z, state)) return null;
  if (BLOCKS[state >>> 4].solid && blocked(x, y, z, state)) return null;
  return state;
}

export function secondaryPlacement(def: BlockDef, state: number, x: number, y: number, z: number): [number, number, number, number][] {
  const out: [number, number, number, number][] = [];
  if (def.shape === 'door') {
    out.push([x, y + 1, z, stateOf(def.id, 8)]); // upper half, hinge left
  } else if (def.shape === 'double_plant') {
    out.push([x, y + 1, z, stateOf(def.id, 8)]);
  } else if (def.shape === 'bed') {
    const pf = state & 3;
    const d = DIR_OF_H[pf];
    out.push([x + DIR_X[d], y, z + DIR_Z[d], stateOf(def.id, pf | 8)]);
  }
  return out;
}

export { BLOCK_BY_NAME };
