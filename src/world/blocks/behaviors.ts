/**
 * Runtime block behaviour hooks. Feature modules (fluids, farming, redstone, doors, ...)
 * attach behaviour to blocks here; the world and player interaction call into them.
 * Multiple modules may add hooks to the same block: void hooks are chained, value hooks
 * use the first non-undefined result.
 */
import type { World } from '../world';
import type { Rng } from '../../core/rng';
import { BLOCK_BY_NAME, BLOCKS } from './registry';

export interface HitInfo {
  x: number; y: number; z: number;
  /** Face hit (Dir) */
  face: number;
  /** Exact hit point */
  px: number; py: number; pz: number;
}

export interface PlacementContext {
  world: World;
  x: number; y: number; z: number;
  /** The face of the clicked block that was hit (Dir), i.e. placement direction from the clicked block. */
  face: number;
  /** Hit point fraction within the clicked block face. */
  hitX: number; hitY: number; hitZ: number;
  /** Player look yaw/pitch (radians) and horizontal facing the player looks toward. */
  yaw: number; pitch: number; playerFacing: number;
  /** The placer entity (if any). */
  placer?: any;
  sneaking: boolean;
}

export interface BlockBehavior {
  onPlace?(world: World, x: number, y: number, z: number, state: number, oldState: number): void;
  onRemove?(world: World, x: number, y: number, z: number, oldState: number, newState: number): void;
  onNeighborChange?(world: World, x: number, y: number, z: number, state: number, fx: number, fy: number, fz: number): void;
  onRandomTick?(world: World, x: number, y: number, z: number, state: number, rng: Rng): void;
  onScheduledTick?(world: World, x: number, y: number, z: number, state: number): void;
  /** Right click. Return true if the interaction consumed the click (no block placement). */
  onUse?(world: World, x: number, y: number, z: number, state: number, player: any, hit: HitInfo): boolean;
  onAttack?(world: World, x: number, y: number, z: number, state: number, player: any): void;
  /** Entity overlaps the block's cell. */
  onEntityInside?(world: World, x: number, y: number, z: number, state: number, entity: any): void;
  /** Entity stands on top of the block. */
  onEntityStep?(world: World, x: number, y: number, z: number, state: number, entity: any): void;
  onEntityFall?(world: World, x: number, y: number, z: number, state: number, entity: any, distance: number): void;
  /** Can this state survive at the position (support checks). */
  canSurvive?(world: World, x: number, y: number, z: number, state: number): boolean;
  /** Placement state from context (orientation...). Return null to forbid placement. */
  getPlacementState?(ctx: PlacementContext, state: number): number | null;
  /** Redstone: power emitted toward `dir` (Dir from this block to the receiver). */
  getWeakPower?(world: World, x: number, y: number, z: number, state: number, dir: number): number;
  getStrongPower?(world: World, x: number, y: number, z: number, state: number, dir: number): number;
  isRedstoneSource?: boolean;
  getComparatorOutput?(world: World, x: number, y: number, z: number, state: number): number;
}

const table: (BlockBehavior | undefined)[] = new Array(4096);

const VOID_HOOKS = ['onPlace', 'onRemove', 'onNeighborChange', 'onRandomTick', 'onScheduledTick', 'onAttack', 'onEntityInside', 'onEntityStep', 'onEntityFall'] as const;

function merge(a: BlockBehavior, b: BlockBehavior): BlockBehavior {
  const out: any = { ...a };
  for (const k of Object.keys(b) as (keyof BlockBehavior)[]) {
    const fa: any = (a as any)[k];
    const fb: any = (b as any)[k];
    if (fa === undefined || typeof fb !== 'function') {
      out[k] = fb;
    } else if ((VOID_HOOKS as readonly string[]).includes(k)) {
      out[k] = function (this: any, ...args: any[]) {
        fa.apply(this, args);
        fb.apply(this, args);
      };
    } else if (k === 'onUse') {
      out[k] = function (this: any, ...args: any[]) {
        return fa.apply(this, args) || fb.apply(this, args);
      };
    } else {
      out[k] = function (this: any, ...args: any[]) {
        const r = fa.apply(this, args);
        return r !== undefined ? r : fb.apply(this, args);
      };
    }
  }
  return out;
}

/** Attach behaviour to blocks by name, id, tag (`#tag`) or predicate. */
export function addBehavior(target: string | number | string[] | ((name: string) => boolean), behavior: BlockBehavior): void {
  const ids: number[] = [];
  if (typeof target === 'number') ids.push(target);
  else if (typeof target === 'function') {
    for (const b of BLOCKS) if (target(b.name)) ids.push(b.id);
  } else {
    const list = Array.isArray(target) ? target : [target];
    for (const n of list) {
      if (n.startsWith('#')) {
        const tag = n.slice(1);
        for (const b of BLOCKS) if (b.tags.includes(tag)) ids.push(b.id);
      } else {
        const b = BLOCK_BY_NAME.get(n);
        if (!b) throw new Error(`addBehavior: unknown block ${n}`);
        ids.push(b.id);
      }
    }
  }
  for (const id of ids) table[id] = table[id] ? merge(table[id]!, behavior) : { ...behavior };
}

export function behaviorOf(id: number): BlockBehavior | undefined {
  return table[id];
}
