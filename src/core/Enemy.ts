import { ENEMIES, type EnemyDef, type EnemyType } from '../config/enemies';
import { ENEMY_Z_MAX, ENEMY_Z_MIN, ESCAPE_X, SPAWN_X, SPD_X, SPD_Z, TICK } from '../config/constants';
import type { DeathKind, HitPart, V3 } from './Events';
import type { World } from './World';
import type { Player } from './Player';

/** Axis-aligned ellipse in the creature's side plane (x relative to the creature, y absolute height). */
export interface HitShape {
  cx: number;
  cy: number;
  a: number;
  b: number;
  part: HitPart;
}

export interface DamageInfo {
  damage: number;
  part: HitPart;
  point: V3;
  dirX: number;
  dirZ: number;
  bullet: boolean;
  player: Player | null;
  explosion?: V3;
}

let NEXT_ID = 1;

export abstract class Enemy {
  readonly id = NEXT_ID++;
  readonly def: EnemyDef;
  readonly type: EnemyType;
  x = SPAWN_X;
  y = 0;
  z = 0;
  vx = 0;
  vy = 0;
  vz = 0;
  life: number;
  maxLife: number;
  isBoss: boolean;
  bounty: number;
  headshotBonus: number;
  state = 'walk';
  stateTicks = 0;
  ticks = 0;
  /** +1 walking right, -1 walking left (walrus only). */
  facing = 1;
  /** Allowed to leave the right edge without ending the game. */
  canLeave = false;
  /** Distance walked, drives gait animation in the renderer. */
  distance = 0;
  dead = false;
  /** Set when removed from the world (escaped or dead and handed to presentation). */
  removed = false;
  /** Damage taken during the current tick. */
  tickDamage = 0;
  /** Last damage, used to decide the death reaction. */
  lastHit: DamageInfo | null = null;
  /** Player that dealt the fatal blow. */
  killer: Player | null = null;
  protected world: World;

  constructor(world: World, type: EnemyType, opts: { boss?: boolean; z?: number; x?: number } = {}) {
    this.world = world;
    this.type = type;
    this.def = ENEMIES[type];
    this.isBoss = !!opts.boss;
    const lvl = world.levelNum;
    const life = this.isBoss && this.def.bossLife ? this.def.bossLife : this.def.life[0] + this.def.life[1] * lvl;
    this.life = this.maxLife = Math.max(1, life);
    this.bounty = this.def.bounty + (this.isBoss ? this.def.bossBonus : 0);
    this.headshotBonus = this.def.headshotBonus;
    this.z = opts.z ?? world.rng.range(ENEMY_Z_MIN, ENEMY_Z_MAX);
    this.x = opts.x ?? SPAWN_X - this.def.halfLength;
  }

  get alive(): boolean {
    return this.life > 0 && !this.dead;
  }

  /** Side-plane hit shapes for the current pose (facing +x). */
  abstract shapes(): HitShape[];

  setState(s: string): boolean {
    if (this.state === s) return false;
    this.state = s;
    this.stateTicks = 0;
    return true;
  }

  /** Random speed in px/tick from the def range. */
  protected randSpeed(): number {
    const [a, b] = this.def.speed;
    return Math.round(this.world.rng.range(a, b) * 100) / 100;
  }

  /** Called every tick while alive. */
  protected abstract think(): void;

  tick(): void {
    this.ticks++;
    this.stateTicks++;
    if (!this.alive) return;
    this.think();
    const dx = this.vx * TICK;
    const dz = this.vz * TICK;
    this.x += dx;
    this.z += dz;
    this.distance += Math.hypot(dx, dz);
    this.pressPlayers();
    if (this.x - this.def.halfLength > ESCAPE_X) this.escape();
  }

  protected escape(): void {
    this.removed = true;
    this.world.events.emit('enemyEscaped', { enemyId: this.id, type: this.type });
    if (!this.canLeave) this.world.gameOver('escape', this);
  }

  /** Keep within the lane band, re-rolling direction like the original correct_position. */
  protected clampLane(onBounce?: () => void): void {
    if (this.z > ENEMY_Z_MAX) {
      this.z = ENEMY_Z_MAX;
      onBounce?.();
    } else if (this.z < ENEMY_Z_MIN) {
      this.z = ENEMY_Z_MIN;
      onBounce?.();
    }
  }

  /** Footprint overlap with a player (ground plane). */
  overlapsPlayer(p: Player, padX = 0, padZ = 0): boolean {
    return (
      Math.abs(p.x - this.x) < this.def.halfLength + padX &&
      Math.abs(p.z - this.z) < this.def.halfDepth + padZ
    );
  }

  /** Knock players down on contact, like the original press_players. */
  protected pressPlayers(): void {
    if (!this.def.canPress) return;
    for (const p of this.world.players) {
      if (!p.alive || p.y > this.def.height * 0.6) continue;
      if (this.overlapsPlayer(p, 0.05, 0.1)) p.knockDown(this.vx);
    }
  }

  /** Apply damage. Returns true when a bullet should stop here (deflected). */
  takeDamage(info: DamageInfo): void {
    this.life -= info.damage;
    this.tickDamage += info.damage;
    this.lastHit = info;
    if (this.life <= 0 && !this.killer) this.killer = info.player;
    this.world.events.emit('hit', {
      enemyId: this.id,
      type: this.type,
      point: info.point,
      dirX: info.dirX,
      dirZ: info.dirZ,
      damage: info.damage,
      part: info.part,
      bullet: info.bullet,
    });
    this.onDamaged(info);
  }

  /** Hook for per-type reactions to damage (crawl, enrage, hide...). */
  protected onDamaged(_info: DamageInfo): void {}

  /**
   * Bullet contact hook. Return 'stop' to absorb the bullet entirely (no
   * damage, e.g. turtle shell ricochet), otherwise damage is applied.
   */
  bulletContact(_part: HitPart, _point: V3): 'damage' | 'deflect' {
    return 'damage';
  }

  /** Decide the death reaction. Called once when life drops to zero. */
  protected abstract deathKind(): DeathKind;

  /** Called at end of tick when life <= 0. */
  die(): void {
    if (this.dead) return;
    this.dead = true;
    this.vx = this.vz = 0;
    const hit = this.lastHit;
    const kind = this.deathKind();
    this.onDeath(kind);
    this.world.onEnemyKilled(this, kind);
    this.world.events.emit('enemyDeath', {
      enemyId: this.id,
      type: this.type,
      kind,
      point: hit?.point ?? { x: this.x, y: this.def.height * 0.5, z: this.z },
      dirX: hit?.dirX ?? -1,
      dirZ: hit?.dirZ ?? 0,
      force: Math.max(0, -this.life) + (hit?.damage ?? 0),
      explosion: hit?.explosion,
      hadCub: (this as unknown as { hasCub?: boolean }).hasCub,
    });
    this.removed = true;
  }

  protected onDeath(_kind: DeathKind): void {}

  /** Original "WithYSpeed": split a speed into x and depth components. */
  protected splitSpeed(speedPx: number, yk: number): void {
    const ys = yk * speedPx;
    this.vz = ys * SPD_Z;
    this.vx = (speedPx - Math.abs(ys)) * SPD_X * this.facing;
  }

  /** Effective silhouette x-interval at height y (facing applied). */
  silhouetteAt(y: number): { right: number; part: HitPart } | null {
    let best: { right: number; part: HitPart } | null = null;
    for (const s of this.shapes()) {
      const dy = (y - s.cy) / s.b;
      if (dy < -1 || dy > 1) continue;
      const w = s.a * Math.sqrt(1 - dy * dy);
      const right = this.x + (this.facing >= 0 ? s.cx + w : -s.cx + w);
      if (!best || right > best.right) best = { right, part: s.part };
    }
    return best;
  }

  /** Approximate x extent of the body (for broad phase). */
  get left(): number {
    return this.x - this.def.halfLength - 0.5;
  }
  get right(): number {
    return this.x + this.def.halfLength + 0.5;
  }
}
