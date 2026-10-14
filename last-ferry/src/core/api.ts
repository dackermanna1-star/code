// What the presentation may READ from the logic every frame (render, HUD, audio).
// The logic classes in src/core implement these shapes (World exposes them as
// fields/getters). CONTRACT — extend with optional fields only.
import type { DeathKind, WeaponId, ZombieKind } from '../config/ids';
import type { CraneState, EventBus } from './events';

/**
 * Zombie animation states (the rig's AnimInput.state):
 *  walk      ordinary shamble / waddle (shambler, bloater, medic, riot, bigdave)
 *  run       jogger sprint; burning zombies also use 'burn'
 *  crawl     risen crawler dragging itself
 *  rise      a downed body getting up as a crawler (≈1.6 s, from lying on its back to crawling)
 *  stagger   horn / shotgun knock-back (≈ 0.5–2 s)
 *  trip      jogger tripped over a corpse (falls, gets up, ≈ 0.9 s)
 *  burn      on fire: flailing panic run
 *  grab      holding on to the hunter (attacking)
 *  carry     medic carrying the stretcher (arms forward/back holding handles)
 *  carried   patient lying on the stretcher (twitching)
 *  belch     Big Dave belching gas (≈ 1 s)
 *  enrage    Big Dave tearing off his apron (≈ 1.2 s)
 *  spawn     first ≈0.4 s after appearing (rigs may ignore)
 */
export type ZombieState =
  | 'walk'
  | 'run'
  | 'crawl'
  | 'rise'
  | 'stagger'
  | 'trip'
  | 'burn'
  | 'grab'
  | 'carry'
  | 'carried'
  | 'belch'
  | 'enrage'
  | 'spawn';

export interface ZombieView {
  readonly id: number;
  readonly kind: ZombieKind;
  /** Appearance seed (clothes, skin tint, props). Kept when a corpse rises. */
  readonly look: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  /** +1 walking right (normal), -1 walking left. */
  facing: number;
  state: ZombieState;
  stateTicks: number;
  /** Distance walked (m): drives gait cycles so feet don't slide. */
  distance: number;
  life: number;
  maxLife: number;
  isBoss: boolean;
  /** A corpse that got back up (crawler). */
  risen: boolean;
  /** Seconds of burning left (0 = not burning). */
  burning: number;
  /** Riot armour still on (PLATE_* bit flags). */
  plates: number;
  /** Nails stuck in it. */
  nails: number;
  /** Medic: the stretcher it carries ('front' walks ahead). Patient: carried. */
  stretcher?: { id: number; role: 'front' | 'back' | 'patient' };
  /** Big Dave: apron torn off. */
  enraged?: boolean;
  /** Killed (still in the list for the tick it died). */
  dead: boolean;
  /** Removed from the world (dead and handed over, or escaped). */
  removed: boolean;
}

export interface CorpseView {
  readonly id: number;
  /** The zombie this body was (its rig/look). */
  readonly zombieId: number;
  readonly kind: ZombieKind;
  readonly look: number;
  /** Where the body lies (logic is authoritative; the ragdoll is aimed to land here). */
  x: number;
  z: number;
  facing: number;
  readonly deathKind: DeathKind;
  /** Tick at which it will rise, or null if it is permanently dead. */
  risesAt: number | null;
  /** In the 2 s before rising. */
  twitching: boolean;
  /** Seconds of burning left (0 = not burning). */
  burning: number;
  /** Burned out: an ash pile (no longer an obstacle). */
  ash: boolean;
  nails: number;
  /** Gone from the deck (ash removed, sea, gib) — presentation drops it. */
  removed: boolean;
}

export type PlayerState = 'stand' | 'walk' | 'air' | 'stomp' | 'kick' | 'grabbed' | 'dead';
export type WeaponState = 'idle' | 'fire' | 'reload' | 'empty' | 'spin';

export interface WeaponView {
  readonly id: WeaponId;
  state: WeaponState;
  /** Ticks in the current state. */
  ticks: number;
  bullets: number;
  /** 0..1 while reloading. */
  reloadProgress: number;
  /** Outboard: engine spin 0..1; others 0. */
  spin: number;
  /** 0..1 barrel heat (outboard). */
  heat: number;
}

export interface PlayerView {
  readonly id: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  life: number;
  state: PlayerState;
  stateTicks: number;
  distance: number;
  money: number;
  readonly weapon: WeaponView;
  /** Weapons owned (id → bullets in the magazine). */
  readonly owned: ReadonlyMap<WeaponId, { bullets: number }>;
  kills: number;
}

export interface ProjectileView {
  readonly id: number;
  readonly kind: 'flare' | 'shell';
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

export interface GasView {
  readonly id: number;
  x: number;
  z: number;
  radius: number;
  /** Seconds left / total. */
  ttl: number;
  readonly max: number;
}

export interface FireZoneView {
  readonly id: number;
  x: number;
  z: number;
  radius: number;
  ttl: number;
  readonly max: number;
}

export interface CraneView {
  state: CraneState;
  /** Seconds since the state started. */
  stateTime: number;
  /** Crate barricade seconds left while 'down'. */
  barricade: number;
}

export type WorldPhase = 'splash' | 'playing' | 'boss' | 'between' | 'gameover' | 'victory';

/** The world as the presentation sees it. */
export interface WorldView {
  readonly events: EventBus;
  readonly tick: number;
  readonly chapter: number;
  readonly chapterName: string;
  readonly phase: WorldPhase;
  readonly players: readonly PlayerView[];
  readonly zombies: readonly ZombieView[];
  readonly corpses: readonly CorpseView[];
  readonly projectiles: readonly ProjectileView[];
  readonly gas: readonly GasView[];
  readonly fires: readonly FireZoneView[];
  readonly crane: CraneView;
  readonly hornReady: boolean;
  /** Captain's Favour 0..100. */
  readonly favour: number;
  /** Survivors boarded / to board this chapter. */
  readonly boarded: number;
  readonly passengers: number;
  /** 0..1 boss life (null outside boss phases). */
  readonly bossLife: number | null;
  /** 0 (sunset, chapter 1) → 1 (deep night, end of chapter 3). */
  readonly timeOfDay: number;
}
