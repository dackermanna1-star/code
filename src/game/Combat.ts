import * as THREE from 'three';
import type { PartHit } from '../characters/CharacterModel';

export type DamageType = 'blunt' | 'sharp' | 'pierce' | 'fall' | 'crush' | 'force';
export type HitSource = 'melee' | 'thrown' | 'impact' | 'stomp' | 'rage' | 'environment';

export interface HitInfo {
  attacker: Combatant | null;
  damage: number;
  type: DamageType;
  part: number;
  point: THREE.Vector3;
  dir: THREE.Vector3;
  /** knockback impulse (N*s) */
  force: number;
  source: HitSource;
  local?: THREE.Vector3;
  localNormal?: THREE.Vector3;
  face?: number;
  weaponId?: string | null;
  kick?: boolean;
  heavy?: boolean;
  crit?: boolean;
  /** vertical launch factor (uppercuts) */
  lift?: number;
  /** multiplier for voxel carving (0 disables) */
  carve?: number;
  /** extra stagger time */
  stun?: number;
  /** guaranteed knockdown */
  knockdown?: boolean;
  /** can sever limbs / decapitate */
  dismember?: number;
  /** bleed damage per second applied for a few seconds */
  bleed?: number;
  /** ignore blocking (grab punches, stomps) */
  unblockable?: boolean;
}

export interface HitResult {
  damage: number;
  blocked: boolean;
  parried: boolean;
  killed: boolean;
  knockedDown: boolean;
  headDestroyed: boolean;
  decapitated: boolean;
  severed: number;
  part: number;
}

export function emptyResult(part = -1): HitResult {
  return { damage: 0, blocked: false, parried: false, killed: false, knockedDown: false, headDestroyed: false, decapitated: false, severed: -1, part };
}

export interface Combatant {
  readonly id: number;
  readonly isPlayer: boolean;
  readonly name: string;
  alive: boolean;
  /** feet position (world) */
  readonly position: THREE.Vector3;
  headPosition(out: THREE.Vector3): THREE.Vector3;
  chestPosition(out: THREE.Vector3): THREE.Vector3;
  receiveHit(hit: HitInfo): HitResult;
  /** precise hitbox raycast; returns null if missed */
  raycastHitbox(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number, inflate: number): PartHit | null;
  /** true while unable to be hit (dodge i-frames) */
  invulnerable(): boolean;
  /** is the combatant currently able to fight (not ragdolled) */
  readonly upright: boolean;
  readonly radius: number;
}

let nextId = 1;
export function newId(): number {
  return nextId++;
}
