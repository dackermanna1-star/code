// Events emitted by the game logic. The presentation layer (rendering, audio,
// HUD) subscribes; the logic never depends on presentation.
import type { EnemyType } from '../config/enemies';
import type { WeaponId } from '../config/weapons';

export interface V3 {
  x: number;
  y: number;
  z: number;
}

export type HitPart = 'head' | 'body' | 'cub' | 'shell' | 'leg';

export interface BulletPath {
  from: V3;
  to: V3;
  /** True when the path is a ricochet. */
  ric: boolean;
  /**
   * First person only: the bullet ended in the ice (or, past the floe's edge,
   * the sea) at `to` rather than in a creature or at the end of its range.
   */
  ground?: 'ice' | 'water';
}

export type DeathKind =
  | 'normal'
  | 'headshot'
  | 'headoff'
  | 'gib'
  | 'crawl'
  | 'kick'
  | 'stomp'
  | 'glide'
  | 'blast'
  | 'violent';

export interface GameEvents {
  shot: { playerId: number; weapon: WeaponId; muzzle: V3; paths: BulletPath[] };
  hit: { enemyId: number; type: EnemyType; point: V3; dirX: number; dirZ: number; damage: number; part: HitPart; bullet: boolean };
  ricochet: { point: V3; enemyId: number };
  enemySpawn: { enemyId: number; type: EnemyType; boss: boolean };
  enemyDeath: {
    enemyId: number;
    type: EnemyType;
    kind: DeathKind;
    point: V3;
    dirX: number;
    dirZ: number;
    /** Overkill / energy of the fatal blow, used to scale the reaction. */
    force: number;
    explosion?: V3;
    hadCub?: boolean;
  };
  crawlStart: { enemyId: number };
  cubShotOut: { enemyId: number; point: V3 };
  cubDropped: { activistId: number; cubId: number };
  enemyEscaped: { enemyId: number; type: EnemyType };
  explosion: { pos: V3; radius: number; weapon: WeaponId };
  grenadeBounce: { pos: V3; strength: number };
  shellEject: { playerId: number; weapon: WeaponId; count: number };
  clipDrop: { playerId: number; weapon: WeaponId };
  reloadStart: { playerId: number; weapon: WeaponId };
  reloadEnd: { playerId: number; weapon: WeaponId };
  reloadStep: { playerId: number; weapon: WeaponId; step: number };
  weaponSwitch: { playerId: number; weapon: WeaponId };
  weaponCock: { playerId: number; weapon: WeaponId; step: number };
  buy: { playerId: number; weapon: WeaponId };
  money: { playerId: number; amount: number; pos: V3 };
  niceShot: { playerId: number; n: number };
  playerHurt: { playerId: number; damage: number };
  playerKnocked: { playerId: number };
  playerLaunched: { playerId: number };
  playerJump: { playerId: number };
  playerLand: { playerId: number };
  playerKick: { playerId: number; enemyId: number };
  playerDeath: { playerId: number; by: 'walrus' | 'explosion' };
  walrusCharge: { enemyId: number };
  walrusRush: { enemyId: number };
  walrusDevour: { enemyId: number; playerId: number };
  bearRage: { enemyId: number; level: number };
  enemyPain: { enemyId: number; type: EnemyType };
  turtleHide: { enemyId: number };
  cubSniff: { enemyId: number };
  levelSplash: { num: number; name: string };
  /** A bot teammate says something (speech balloon). */
  say: { playerId: number; text: string };
  levelStart: { num: number };
  bossSpawn: { num: number };
  levelComplete: { num: number };
  gameOver: { reason: 'escape' | 'dead'; enemyId?: number };
  victory: Record<string, never>;
}

export type EventName = keyof GameEvents;
type Handler<K extends EventName> = (e: GameEvents[K]) => void;

export class EventBus {
  private handlers: { [K in EventName]?: Handler<K>[] } = {};

  on<K extends EventName>(name: K, fn: Handler<K>): () => void {
    const list = (this.handlers[name] ??= []) as Handler<K>[];
    list.push(fn);
    return () => {
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    };
  }

  emit<K extends EventName>(name: K, e: GameEvents[K]): void {
    const list = this.handlers[name] as Handler<K>[] | undefined;
    if (!list) return;
    for (const fn of list) fn(e);
  }
}
