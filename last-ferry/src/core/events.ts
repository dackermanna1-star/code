// Events emitted by the game logic (src/core). Presentation (game view, effects,
// audio, HUD) subscribes; the logic never depends on presentation.
//
// CONTRACT shared by every module — extend with optional fields only.
import type { DeathKind, HitPart, WeaponId, ZombieKind } from '../config/ids';

export interface V3 {
  x: number;
  y: number;
  z: number;
}

export interface BulletPath {
  from: V3;
  to: V3;
  /** Ricochet off armour. */
  ric?: boolean;
  /** Nail-gun nail / outboard round etc. are all tracers; 'harpoon' draws a cable. */
  kind?: 'bullet' | 'pellet' | 'nail' | 'harpoon';
}

export type ExplosionKind = 'cannon' | 'gas' | 'crates';
export type NiceSource = 'shot' | 'crane' | 'cannon' | 'gas';
export type CraneState = 'hanging' | 'falling' | 'down' | 'gone';
export type CorpseEndReason = 'ash' | 'gib' | 'stomp' | 'sea' | 'harpoon';
export type ProjectileEndReason = 'target' | 'deck' | 'gas' | 'hook' | 'gone';

export interface GameEvents {
  // --- flow -----------------------------------------------------------------
  chapterSplash: { num: number; name: string; clock: string };
  chapterStart: { num: number };
  bossSpawn: { num: number; name: string };
  /** The chapter's bosses are down but zombies are still alive: mop them up before the pier is held. */
  mopUp: { num: number; left: number };
  /** The pier is clear (bosses down, stragglers mopped up): the chapter is won. */
  chapterComplete: { num: number };
  /** A survivor walks up the gangway (cosmetic queue + counter). */
  boarding: { boarded: number; total: number };
  gameOver: { reason: 'gangway' | 'dead'; zombieId?: number };
  victory: Record<string, never>;

  // --- zombies --------------------------------------------------------------
  spawn: { zombieId: number; kind: ZombieKind; boss: boolean; risen: boolean };
  /** Occasional moan (audio only). */
  groan: { zombieId: number; x: number; z: number; kind: ZombieKind };
  hit: {
    zombieId: number;
    kind: ZombieKind;
    part: HitPart;
    point: V3;
    /** Unit direction the damage travelled (x, z). */
    dirX: number;
    dirZ: number;
    damage: number;
    bullet: boolean;
    playerId: number | null;
    weapon: WeaponId | null;
  };
  /** Riot armour piece shot off (PLATE_* flag). */
  plateOff: { zombieId: number; plate: number; point: V3; dirX: number; dirZ: number };
  /** The bullet glanced off armour. */
  ricochet: { zombieId: number; point: V3 };
  zombieDeath: {
    zombieId: number;
    kind: ZombieKind;
    deathKind: DeathKind;
    boss: boolean;
    risen: boolean;
    /** Where the killing blow landed. */
    point: V3;
    dirX: number;
    dirZ: number;
    /** Strength of the killing blow (≈ damage), drives the ragdoll impulse. */
    force: number;
    /** Corpse left behind (null for gibs / pops / drowning). Its x/z is where the body comes to rest. */
    corpseId: number | null;
    playerId: number | null;
    weapon: WeaponId | null;
  };
  trip: { zombieId: number };
  stagger: { zombieId: number };
  /** Big Dave's gas belch / boss enrage. */
  belch: { zombieId: number; x: number; z: number };
  enrage: { zombieId: number };
  /** Paramedics: the stretcher hit the deck (a medic died). */
  stretcherDrop: {
    zombieId: number;
    x: number;
    z: number;
    /** The stretcher (ZombieView.stretcher.id of the team). */
    stretcherId?: number;
    /** The patient who was on it (gets up as a shambler 1.5 s later), if still alive. */
    patientId?: number;
  };
  grab: { zombieId: number; playerId: number };
  release: { zombieId: number; playerId: number };

  // --- corpses --------------------------------------------------------------
  /** A downed body starts twitching (it will rise in ~2 s). */
  corpseTwitch: { corpseId: number };
  /** A downed body gets up as a crawler (a new zombie with risen = true). */
  corpseRise: { corpseId: number; zombieId: number };
  /** The body will never rise again (headshot after the fact, burned out, nailed, stomped …). */
  corpsePermanent: { corpseId: number; reason: 'nailed' | 'burned' | 'stomp' | 'blast' | 'harpoon' };
  /** The body is gone from the deck (ash, blown apart, kicked into the sea). */
  corpseGone: { corpseId: number; reason: CorpseEndReason };
  /** Logic moved a body (explosion shove, harpoon reel). */
  corpseShoved: { corpseId: number; x: number; z: number };
  /** A nail stuck in a zombie or corpse. */
  nail: { zombieId: number | null; corpseId: number | null; point: V3 };

  // --- fire & gas -------------------------------------------------------------
  ignite: { zombieId: number | null; corpseId: number | null; x: number; z: number };
  extinguish: { zombieId: number | null; corpseId: number | null };
  /** A burning flare / fire patch on the deck. */
  fireZone: { id: number; x: number; z: number; radius: number; ttl: number };
  gas: { id: number; x: number; z: number; radius: number; ttl: number };
  explosion: { x: number; y: number; z: number; radius: number; kind: ExplosionKind };

  // --- hunter -------------------------------------------------------------------
  shot: { playerId: number; weapon: WeaponId; muzzle: V3; paths: BulletPath[] };
  /** Harpoon: the bolt flew from → to and skewered these zombies (in order), reeling them `reel` m. */
  harpoon: { playerId: number; from: V3; to: V3; skewered: number[]; reel: number };
  projectile: { id: number; kind: 'flare' | 'shell'; x: number; y: number; z: number; vx: number; vy: number; vz: number };
  /**
   * A flare or shell is spent. `kind`: which one; `reason`: what it ended on —
   * a zombie ('target'), the deck (a fire patch / the shell's impact), a gas
   * cloud it set off, the crane's hook, or out of play ('gone').
   */
  projectileEnd: { id: number; x: number; y: number; z: number; kind?: 'flare' | 'shell'; reason?: ProjectileEndReason };
  reloadStart: { playerId: number; weapon: WeaponId };
  reloadEnd: { playerId: number; weapon: WeaponId };
  emptyClick: { playerId: number; weapon: WeaponId };
  weaponSwitch: { playerId: number; weapon: WeaponId };
  buy: { playerId: number; weapon: WeaponId };
  /** The outboard's engine: pull-start, idle, run, stop. */
  engine: { playerId: number; state: 'pull' | 'idle' | 'run' | 'stop' };
  jump: { playerId: number };
  stomp: { playerId: number; x: number; z: number; killed: boolean };
  kick: { playerId: number; zombieId: number };
  playerHurt: { playerId: number; damage: number; source: 'grab' | 'gas' | 'fire' | 'blast' };
  playerDeath: { playerId: number };
  /** Money earned (popups); `x,y,z` is where the money came from. */
  money: { playerId: number; amount: number; reason: 'bounty' | 'headshot' | 'nice' | 'tidy'; x: number; y: number; z: number };
  /** 3+ kills at once. `source`: one trigger pull ('shot'), a crane drop, a cannon strike or a gas explosion. */
  niceShot: { playerId: number; n: number; source?: NiceSource };
  headshotStreak: { playerId: number; n: number };

  // --- the pier -------------------------------------------------------------------
  horn: Record<string, never>;
  crane: { state: CraneState; x: number; z: number };
  favour: { value: number; ready: boolean };
  cannonStrike: { targets: V3[] };

  // --- feel -------------------------------------------------------------------------
  /** Presentation time effects requested by the rules (hit-stop, slow motion, shake). */
  hitstop: { ms: number };
  slowmo: { scale: number; seconds: number };
  shake: { amount: number };
}

export type EventName = keyof GameEvents;
type Handler<K extends EventName> = (e: GameEvents[K]) => void;

/**
 * Synchronous publish/subscribe, emitted from inside World.step.
 *
 * Handler isolation: subscribers are presentation (view, audio, HUD), and a
 * bug in one must never abort the logic tick halfway (a zombie dead but not
 * removed, a bounty never paid). Each handler runs in its own try/catch; an
 * error is logged once per event name (with the count kept in `errors`) and
 * the other handlers and the tick carry on. Handler lists are copy-on-write,
 * so subscribing or unsubscribing during an emit neither skips nor adds a
 * handler for that emit (and emit allocates nothing).
 */
export class EventBus {
  private handlers: { [K in EventName]?: Handler<K>[] } = {};
  /** Handler exceptions caught so far, per event name (debug / tests). */
  readonly errors: Partial<Record<EventName, number>> = {};

  on<K extends EventName>(name: K, fn: Handler<K>): () => void {
    const list = (this.handlers[name] ?? []) as Handler<K>[];
    (this.handlers as Record<K, Handler<K>[]>)[name] = [...list, fn];
    let on = true;
    return () => {
      if (!on) return;
      on = false;
      const cur = (this.handlers[name] ?? []) as Handler<K>[];
      const i = cur.indexOf(fn);
      if (i >= 0) (this.handlers as Record<K, Handler<K>[]>)[name] = [...cur.slice(0, i), ...cur.slice(i + 1)];
    };
  }

  emit<K extends EventName>(name: K, e: GameEvents[K]): void {
    const list = this.handlers[name] as Handler<K>[] | undefined;
    if (!list) return;
    for (let i = 0; i < list.length; i++) {
      try {
        list[i](e);
      } catch (err) {
        const n = (this.errors[name] = (this.errors[name] ?? 0) + 1);
        if (n === 1) console.error(`[Last Ferry] a '${name}' handler threw (logged once; the game carries on):`, err);
      }
    }
  }
}
