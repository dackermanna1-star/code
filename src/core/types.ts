// Shared domain types used across every subsystem.
// Conventions (see docs/ARCHITECTURE.md):
//  - meters, seconds, kilograms; +Y up; world X = east, -Z = north.
//  - yaw: radians, 0 = looking north (-Z), positive = turning left (CCW seen from above),
//    i.e. a direction vector for yaw is (-sin(yaw), 0, -cos(yaw)).
//  - pitch: radians, positive = looking up. Clamp to about ±1.5.
//  - assets face +Z, so a character root uses rotation.y = yaw + PI.
import type * as THREE from 'three';

export type EntityId = number;
export type TeamId = number;

let nextEntityId = 1;
export function newEntityId(): EntityId {
  return nextEntityId++;
}

export type Stance = 'stand' | 'crouch' | 'prone';
export type LifeState = 'alive' | 'knocked' | 'dead';

/** High-level locomotion state, used by animation, audio, AI and UI. */
export type MoveState =
  | 'idle'
  | 'walk'
  | 'run'
  | 'sprint'
  | 'air' // jumping / falling
  | 'swim'
  | 'freefall' // skydiving from the plane
  | 'parachute'
  | 'vehicle'
  | 'plane' // still inside the transport aircraft
  | 'vault'
  | 'knocked'
  | 'dead';

export type SurfaceType =
  | 'grass'
  | 'dirt'
  | 'mud'
  | 'sand'
  | 'gravel'
  | 'rock'
  | 'concrete'
  | 'asphalt'
  | 'tile'
  | 'wood'
  | 'metal'
  | 'glass'
  | 'water'
  | 'foliage'
  | 'fabric'
  | 'flesh';

/** Body hit zones (PUBG-style). Neck counts as head for damage. */
export type HitZone = 'head' | 'neck' | 'chest' | 'stomach' | 'pelvis' | 'arm' | 'hand' | 'leg' | 'foot';

export type DamageType =
  | 'bullet'
  | 'melee'
  | 'explosion'
  | 'fire'
  | 'fall'
  | 'vehicle' // run over / crash
  | 'zone' // blue zone
  | 'drown'
  | 'bleed' // knocked bleed-out
  | 'redzone';

export interface DamageInfo {
  type: DamageType;
  /** Raw amount after weapon falloff but before hit-zone multipliers & armor. */
  amount: number;
  zone?: HitZone;
  attackerId?: EntityId;
  weaponId?: string;
  point?: THREE.Vector3;
  direction?: THREE.Vector3;
  distance?: number;
}

export interface DamageResult {
  /** Health actually removed (after armor/multipliers), 0 if ignored. */
  dealt: number;
  zone?: HitZone;
  helmetHit?: boolean;
  vestHit?: boolean;
  /** Armor piece destroyed by this hit. */
  armorBroken?: 'helmet' | 'vest';
  knocked: boolean;
  killed: boolean;
}

/** A world-space capsule hitbox (segment a→b with radius). */
export interface Hitbox {
  zone: HitZone;
  a: THREE.Vector3;
  b: THREE.Vector3;
  radius: number;
}

export type NoiseKind =
  | 'gunshot'
  | 'gunshot_suppressed'
  | 'footstep'
  | 'vehicle'
  | 'explosion'
  | 'impact' // bullet impact near someone
  | 'door'
  | 'glass'
  | 'reload'
  | 'item' // healing, looting rustle
  | 'voice'
  | 'aircraft';

/** A sound that AI can hear. Audio playback is separate (ctx.audio). */
export interface NoiseEvent {
  kind: NoiseKind;
  position: THREE.Vector3;
  /** Distance in meters at which a listener with average hearing barely notices it. */
  radius: number;
  sourceId?: EntityId;
  teamId?: TeamId;
  /** Optional direction of travel (e.g. a bullet flyby) for ambiguity modeling. */
  direction?: THREE.Vector3;
}

export type WeaponSlot = 'primary1' | 'primary2' | 'pistol' | 'melee' | 'throwable';
export const WEAPON_SLOTS: readonly WeaponSlot[] = ['primary1', 'primary2', 'pistol', 'melee', 'throwable'];

export type WeaponClass = 'ar' | 'smg' | 'dmr' | 'sr' | 'sg' | 'lmg' | 'pistol' | 'melee' | 'throwable';
export type FireMode = 'single' | 'burst' | 'auto';
export type AmmoType = 'ammo_556' | 'ammo_762' | 'ammo_9mm' | 'ammo_45acp' | 'ammo_12g' | 'ammo_300mag';

export type AttachmentSlot = 'muzzle' | 'grip' | 'mag' | 'stock' | 'sight';
export type EquipmentSlot = 'helmet' | 'vest' | 'backpack';

export type MatchMode = 'solo' | 'duo' | 'squad';
export type Perspective = 'tpp' | 'fpp';
export type Difficulty = 'easy' | 'normal' | 'hard' | 'veteran';
export type WeatherKind = 'clear' | 'cloudy' | 'overcast' | 'rain' | 'fog';

export interface Circle2 {
  x: number; // world X
  z: number; // world Z
  radius: number;
}
