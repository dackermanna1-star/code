import { ENEMIES, type EnemyDef, type EnemyType } from '../config/enemies';
import { SPD_X, SPD_Z, TICK, escapeX, spawnX } from '../config/constants';
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

/**
 * Axis-aligned ellipsoid in world space, the 3D counterpart of a HitShape used
 * by first-person shots: the side-plane ellipse (facing applied) given a depth
 * half-thickness. Semi-axes include the hit tolerance.
 */
export interface HitVolume {
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  rz: number;
  part: HitPart;
}

/** Where a ray enters a creature's hit volumes. */
export interface RayContact {
  /** Distance along the (unit) ray to the entry point; 0 when the origin is inside. */
  t: number;
  part: HitPart;
  /** The volume that was entered (for surface normals). */
  volume: HitVolume;
}

/**
 * Entry distance of the unit ray o + t*d into an ellipsoid, or -1 when it
 * misses or lies entirely behind the origin.
 */
export function rayEllipsoid(o: V3, d: V3, v: HitVolume): number {
  const ox = (o.x - v.x) / v.rx;
  const oy = (o.y - v.y) / v.ry;
  const oz = (o.z - v.z) / v.rz;
  const dx = d.x / v.rx;
  const dy = d.y / v.ry;
  const dz = d.z / v.rz;
  const a = dx * dx + dy * dy + dz * dz;
  const b = ox * dx + oy * dy + oz * dz;
  const c = ox * ox + oy * oy + oz * oz - 1;
  const disc = b * b - a * c;
  if (disc < 0) return -1;
  const s = Math.sqrt(disc);
  const t1 = (-b + s) / a;
  if (t1 < 0) return -1;
  return Math.max(0, (-b - s) / a);
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
  x = 0;
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
    this.z = opts.z ?? world.rng.range(world.laneMin, world.laneMax);
    this.x = opts.x ?? spawnX(this.z, this.def.halfLength);
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
    if (this.x > escapeX(this.z, this.def.halfLength)) this.escape();
  }

  protected escape(): void {
    this.removed = true;
    this.world.events.emit('enemyEscaped', { enemyId: this.id, type: this.type });
    if (!this.canLeave) this.world.gameOver('escape', this);
  }

  /** Keep within the lane band, re-rolling direction like the original correct_position. */
  protected clampLane(onBounce?: () => void): void {
    if (this.z > this.world.laneMax) {
      this.z = this.world.laneMax;
      onBounce?.();
    } else if (this.z < this.world.laneMin) {
      this.z = this.world.laneMin;
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

  /**
   * 3D hit volumes for first-person shots, derived from the side-plane shapes
   * exactly as silhouetteAt places them (facing applied). Each ellipse gets a
   * depth half-thickness of max(a, b) capped at 90% of the creature's
   * footprint half depth (about the models' half width): round parts (heads,
   * cub bundles, necks) come out roughly spherical, long bodies as wide as the
   * creature. `edge` pads every axis.
   */
  hitVolumes(edge = 0): HitVolume[] {
    const hd = this.def.halfDepth * 0.9;
    return this.shapes().map((s) => ({
      x: this.x + (this.facing >= 0 ? s.cx : -s.cx),
      y: s.cy,
      z: this.z,
      rx: s.a + edge,
      ry: s.b + edge,
      rz: Math.min(hd, Math.max(s.a, s.b)) + edge,
      part: s.part,
    }));
  }

  /**
   * First contact of the unit ray o + t*d (0 <= t <= maxT) with this
   * creature's hit volumes, or null. When the origin is inside a volume (a
   * creature right on top of the hunter) it counts as a contact at t = 0 only
   * if the creature's centre lies ahead, so nothing behind the eye is hit.
   */
  rayContact(o: V3, d: V3, maxT: number, edge = 0): RayContact | null {
    let best: RayContact | null = null;
    for (const v of this.hitVolumes(edge)) {
      const t = rayEllipsoid(o, d, v);
      if (t < 0 || t > maxT) continue;
      if (t === 0 && (this.x - o.x) * d.x + (this.def.height * 0.5 - o.y) * d.y + (this.z - o.z) * d.z <= 0) continue;
      if (!best || t < best.t) best = { t, part: v.part, volume: v };
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
