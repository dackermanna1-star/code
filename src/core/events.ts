// Core cross-module events. Modules can add more via declaration merging on GameEvents.
import type * as THREE from 'three';
import type { DamageInfo, DamageResult, EntityId, NoiseEvent, SurfaceType, WeaponSlot } from './types';
import type { ICharacter, IDoor, IVehicle, KillRecord, MatchState, PlayerResult } from './contracts';

declare module './EventBus' {
  interface GameEvents {
    /** A combatant took damage (after armor). */
    'combat:damage': { target: ICharacter; info: DamageInfo; result: DamageResult };
    /** A combatant was knocked down (DBNO). */
    'combat:knock': { victim: ICharacter; record: KillRecord };
    /** A combatant was killed / eliminated. */
    'combat:kill': { victim: ICharacter; record: KillRecord };
    /** A character was revived from knocked state. */
    'combat:revive': { target: ICharacter; by: ICharacter };
    /** A weapon fired (for audio, FX, AI hearing, UI). */
    'weapon:fired': {
      shooter: ICharacter;
      weaponId: string;
      origin: THREE.Vector3;
      direction: THREE.Vector3;
      suppressed: boolean;
    };
    'weapon:reload': { shooter: ICharacter; weaponId: string; phase: 'start' | 'end' | 'cancel' };
    'weapon:switch': { character: ICharacter; slot: WeaponSlot | null };
    /** A projectile hit something (world or character). */
    'projectile:hit': {
      shooterId?: EntityId;
      point: THREE.Vector3;
      normal: THREE.Vector3;
      surface: string;
      character?: ICharacter;
      zone?: string;
    };
    /** A bullet passed near a character (for flyby sounds and AI suppression). */
    'projectile:nearMiss': { character: ICharacter; point: THREE.Vector3; shooterId?: EntityId };
    /** AI-audible noise. */
    noise: NoiseEvent;
    'inventory:changed': { character: ICharacter };
    'item:used': { character: ICharacter; itemId: string };
    'item:pickup': { character: ICharacter; itemId: string; count: number };
    'vehicle:enter': { character: ICharacter; vehicle: IVehicle; seat: number };
    'vehicle:exit': { character: ICharacter; vehicle: IVehicle };
    'vehicle:destroyed': { vehicle: IVehicle; attackerId?: EntityId };
    'match:state': { state: MatchState };
    'match:ended': { result: PlayerResult };
    'zone:announce': { phase: number; delay: number };
    'zone:shrinkStart': { phase: number };
    'zone:shrinkEnd': { phase: number };
    'player:spawned': { character: ICharacter };
    /** UI overlay opened/closed. */
    'ui:overlay': { open: boolean; name: string };
    'settings:changed': { section: string };
    /** Character movement sounds (audio + AI hearing derive from these). */
    'character:footstep': { character: ICharacter; surface: SurfaceType; speed: number; position: THREE.Vector3 };
    'character:jump': { character: ICharacter };
    'character:land': { character: ICharacter; impactSpeed: number; surface: SurfaceType };
    'character:stance': { character: ICharacter; from: string; to: string };
    'character:swim': { character: ICharacter; position: THREE.Vector3 };
    'character:parachute': { character: ICharacter; phase: 'jump' | 'open' | 'land' };
    /** Vault over / climb onto an obstacle started (audio: cloth + effort). */
    'character:vault': { character: ICharacter; kind: 'vault' | 'climb'; height: number };
    'door:toggle': { door: IDoor; open: boolean; by?: ICharacter };
    'glass:break': { position: THREE.Vector3 };
    explosion: { position: THREE.Vector3; radius: number; kind: 'frag' | 'vehicle' | 'redzone' | 'molotov' };
    'throwable:bounce': { position: THREE.Vector3; itemId: string };
    'vehicle:collision': { vehicle: IVehicle; impulse: number; position: THREE.Vector3 };
    /** Fired once all systems are installed and the world is ready. */
    'game:ready': {};
  }
}

export {};
