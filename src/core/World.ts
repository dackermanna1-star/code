// The game world: players, enemies, projectiles, levels and the game flow.
// Advanced by `step()` at a fixed 50 ticks per second.
import { ENEMIES } from '../config/enemies';
import { LEVELS } from '../config/levels';
import { FIELD_HALF_W, pxToX, pxToZ } from '../config/constants';
import { Combat } from './Combat';
import type { Enemy } from './Enemy';
import { Cub } from './enemies';
import { EventBus, type DeathKind } from './Events';
import { Level } from './Level';
import { Player } from './Player';
import { Rng } from './Rng';

export type Phase = 'splash' | 'playing' | 'between' | 'gameover' | 'victory';

/** Ticks the level title is shown before spawning starts (original LevelSplash: 104). */
export const SPLASH_TICKS = 104;
/** Pause after a level's bosses die before the next splash. */
const BETWEEN_TICKS = 60;

export interface WorldOptions {
  seed?: number;
  players?: number;
  startLevel?: number;
  /** Starting money (debug / testing). */
  money?: number;
}

export class World {
  readonly events = new EventBus();
  readonly rng: Rng;
  readonly combat: Combat;
  tick = 0;
  phase: Phase = 'splash';
  phaseTicks = 0;
  players: Player[] = [];
  enemies: Enemy[] = [];
  level!: Level;
  levelNum = 1;
  gameOverReason: { reason: 'escape' | 'dead'; enemyType?: string; enemyId?: number } | null = null;
  /** Floe surface test, replaced by the presentation with the real outline. */
  isOnFloe: (x: number, z: number) => boolean = (x, z) => Math.abs(x) < FIELD_HALF_W + 6 && z > -17 && z < 16.5;

  constructor(opts: WorldOptions = {}) {
    this.rng = new Rng(opts.seed);
    this.combat = new Combat(this);
    const n = Math.max(1, Math.min(2, opts.players ?? 1));
    // Original start positions: P1 (620,220), P2 (200,220) in screen px.
    const starts: Array<[number, number]> = [
      [pxToX(560), pxToZ(300)],
      [pxToX(480), pxToZ(340)],
    ];
    for (let i = 0; i < n; i++) this.players.push(new Player(this, i, starts[i][0], starts[i][1]));
    if (opts.money) for (const p of this.players) p.money = opts.money;
    this.loadLevel(opts.startLevel ?? 1);
  }

  get player(): Player {
    return this.players[0];
  }

  get gameEnded(): boolean {
    return this.phase === 'gameover' || this.phase === 'victory';
  }

  private loadLevel(num: number): void {
    this.levelNum = num;
    this.level = new Level(this, LEVELS[num - 1]);
    this.phase = 'splash';
    this.phaseTicks = 0;
    this.events.emit('levelSplash', { num, name: LEVELS[num - 1].name });
  }

  addEnemy(e: Enemy, _fromLevel: boolean): void {
    this.enemies.push(e);
    this.events.emit('enemySpawn', { enemyId: e.id, type: e.type, boss: e.isBoss });
  }

  /** Advance one logic tick. */
  step(): void {
    if (this.gameEnded) return;
    this.tick++;
    this.phaseTicks++;

    if (this.phase === 'splash' && this.phaseTicks >= SPLASH_TICKS) {
      this.phase = 'playing';
      this.phaseTicks = 0;
      this.level.start();
      this.events.emit('levelStart', { num: this.levelNum });
    }

    this.level.tick();
    for (const p of this.players) p.tick();
    for (const e of [...this.enemies]) {
      e.tick();
      e.tickDamage = 0;
      if (this.gameEnded) return;
    }
    this.combat.tick();
    this.resolveDeaths();
    this.enemies = this.enemies.filter((e) => !e.removed);

    if (this.phase === 'playing' && this.level.finished) {
      this.phase = 'between';
      this.phaseTicks = 0;
    }
    if (this.phase === 'between' && this.phaseTicks >= BETWEEN_TICKS) {
      if (this.levelNum >= LEVELS.length) {
        this.phase = 'victory';
        this.events.emit('victory', {});
      } else {
        this.loadLevel(this.levelNum + 1);
      }
    }
  }

  /** Process deaths of enemies whose life dropped to zero. Returns the newly killed. */
  resolveDeaths(): Enemy[] {
    const out: Enemy[] = [];
    for (const e of this.enemies) {
      if (!e.dead && e.life <= 0) {
        e.die();
        out.push(e);
      }
    }
    return out;
  }

  /** Bounty and statistics for a kill (called from Enemy.die). */
  onEnemyKilled(e: Enemy, _kind: DeathKind): void {
    const p = e.killer ?? (e.lastHit?.player as Player | null) ?? null;
    if (!p) return;
    p.earn(e.bounty);
    p.stats.kills++;
    p.stats.killsByType[e.type] = (p.stats.killsByType[e.type] ?? 0) + 1;
    const wid = p.weapon.id;
    p.stats.killsByWeapon[wid] = (p.stats.killsByWeapon[wid] ?? 0) + 1;
  }

  onPlayerDeath(_p: Player): void {
    if (this.players.every((pl) => !pl.alive)) this.gameOver('dead');
  }

  gameOver(reason: 'escape' | 'dead', enemy?: Enemy): void {
    if (this.gameEnded) return;
    this.phase = 'gameover';
    this.gameOverReason = { reason, enemyType: enemy?.type, enemyId: enemy?.id };
    this.events.emit('gameOver', { reason, enemyId: enemy?.id });
  }

  /** A nice shot startles a random seal cub (original "nosa"). */
  startleCub(): void {
    const cubs = this.enemies.filter((e): e is Cub => e instanceof Cub && e.alive);
    if (cubs.length) this.rng.pick(cubs).sniff();
  }

  enemyById(id: number): Enemy | undefined {
    return this.enemies.find((e) => e.id === id);
  }

  /** Human readable reason for the game-over screen. */
  describeGameOver(): string {
    const r = this.gameOverReason;
    if (!r) return '';
    if (r.reason === 'dead') return 'The hunter did not survive.';
    const name = r.enemyType ? ENEMIES[r.enemyType as keyof typeof ENEMIES].name.toLowerCase() : 'creature';
    const article = /^[aeiou]/.test(name) ? 'An' : 'A';
    return `${article} ${name} reached the edge of the floe.`;
  }
}
