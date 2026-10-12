// The eight creature types, ported from the original behaviour
// (py-sealhunter enemies.py), converted to metres and 50 Hz ticks.
import { FIELD_HALF_W, GAME_GRAVITY, PLAYER, SPD_X, TICK } from '../config/constants';
import { viewHeightAt } from '../config/view';
import { FP, aimDir } from '../config/firstPerson';
import type { EnemyType } from '../config/enemies';
import { Enemy, type DamageInfo, type HitShape } from './Enemy';
import type { DeathKind, HitPart, V3 } from './Events';
import type { World } from './World';

type Opts = { boss?: boolean; z?: number; x?: number; straight?: boolean };

// ---------------------------------------------------------------- Brown seal
export class Seal extends Enemy {
  private speedPx: number;
  private yk = 0;
  private straight: boolean;
  private rerollIn = 0;
  /** Set by the player when kicked or stomped. */
  special: DeathKind | null = null;

  constructor(world: World, opts: Opts = {}) {
    super(world, 'seal', opts);
    this.straight = !!opts.straight;
    this.speedPx = this.randSpeed();
    this.reroll();
  }

  private reroll(): void {
    this.yk = this.straight ? 0 : this.world.rng.range(-0.3, 0.3);
    this.splitSpeed(this.speedPx, this.yk);
    const lvl = Math.max(1, this.world.levelNum);
    this.rerollIn = this.world.rng.int(Math.floor(50 / lvl), 50);
  }

  get crawling(): boolean {
    return this.state === 'startcrawl' || this.state === 'crawl';
  }

  shapes(): HitShape[] {
    if (this.state === 'crawl') {
      return [
        { cx: -0.05, cy: 0.18, a: 0.62, b: 0.18, part: 'body' },
        { cx: 0.55, cy: 0.24, a: 0.16, b: 0.14, part: 'head' },
      ];
    }
    if (this.state === 'startcrawl') {
      const t = Math.min(1, this.stateTicks / 40);
      const l = (a: number, b: number) => a + (b - a) * t;
      return [
        { cx: l(-0.12, -0.05), cy: l(0.3, 0.18), a: l(0.5, 0.62), b: l(0.3, 0.18), part: 'body' },
        { cx: l(0.36, 0.55), cy: l(0.95, 0.24), a: 0.17, b: 0.16, part: 'head' },
      ];
    }
    const bob = Math.sin(this.distance * 4.2) * 0.04;
    return [
      { cx: -0.12, cy: 0.3, a: 0.5, b: 0.3, part: 'body' },
      { cx: 0.2, cy: 0.62 + bob, a: 0.24, b: 0.3, part: 'body' },
      { cx: 0.36, cy: 0.95 + bob, a: 0.17, b: 0.16, part: 'head' },
    ];
  }

  protected think(): void {
    if (this.state === 'walk') {
      this.clampLane(() => this.reroll());
      if (--this.rerollIn <= 0) this.reroll();
    } else if (this.state === 'startcrawl') {
      this.vx = this.vz = 0;
      if (this.stateTicks >= 48) {
        this.setState('crawl');
        this.vx = 0.2 * SPD_X;
      }
    }
  }

  protected onDamaged(info: DamageInfo): void {
    if (this.state === 'walk' && this.life > 0 && this.life <= 10 && info.bullet && info.part !== 'head') {
      this.setState('startcrawl');
      this.vx = this.vz = 0;
      this.world.events.emit('crawlStart', { enemyId: this.id });
    }
  }

  protected deathKind(): DeathKind {
    if (this.special) return this.special;
    if (this.life < -100) return 'gib';
    if (this.crawling) return 'crawl';
    const h = this.lastHit;
    if (h && !h.bullet) return 'blast';
    if (h?.part === 'head') return 'headshot';
    return 'normal';
  }
}

// ---------------------------------------------------------------- Fat seal
export class FatSeal extends Enemy {
  private speed: number;
  constructor(world: World, opts: Opts = {}) {
    super(world, 'fatseal', opts);
    this.speed = this.def.speed[0] * SPD_X;
    this.vx = this.speed;
  }

  shapes(): HitShape[] {
    const bob = this.state === 'walk' ? Math.sin(this.distance * 2.4) * 0.05 : 0;
    return [
      { cx: -0.25, cy: 0.72, a: 1.25, b: 0.72, part: 'body' },
      { cx: 0.55, cy: 1.05 + bob, a: 0.55, b: 0.5, part: 'body' },
      { cx: 1.02, cy: 1.22 + bob, a: 0.42, b: 0.4, part: 'head' },
    ];
  }

  protected think(): void {
    if (this.state === 'walk') {
      if (this.life < this.maxLife && this.stateTicks % 280 === 279) {
        this.setState('stopped');
        this.vx = 0;
      }
    } else if (this.state === 'stopped') {
      if (this.stateTicks >= 150) {
        this.setState('walk');
        this.vx = this.speed;
      } else if (this.life < this.maxLife) {
        this.life += 1; // regenerates 50 HP/s while resting
      }
    }
  }

  protected deathKind(): DeathKind {
    const h = this.lastHit;
    if (h && !h.bullet) return 'blast';
    if (h && h.damage - this.life * 0 + -this.life >= this.maxLife / 2) return 'violent';
    return 'normal';
  }
}

// ---------------------------------------------------------------- Seal cub
export class Cub extends Enemy {
  private speed: number;
  private sniffAt: number;
  constructor(world: World, opts: Opts & { dropped?: boolean; y?: number } = {}) {
    super(world, 'cub', opts);
    this.speed = this.randSpeed() * SPD_X;
    this.vx = this.speed;
    this.sniffAt = 150 + world.rng.int(0, 500);
    if (opts.dropped) {
      this.setState('drop');
      this.y = opts.y ?? 1.0;
      this.vx = 0.4;
    }
  }

  shapes(): HitShape[] {
    const lift = this.state === 'sniff' ? 0.06 * Math.max(0, Math.sin(this.stateTicks * 0.12)) : 0;
    return [
      { cx: -0.05, cy: this.y + 0.21, a: 0.44, b: 0.21, part: 'body' },
      { cx: 0.33, cy: this.y + 0.28 + lift, a: 0.15, b: 0.14, part: 'head' },
    ];
  }

  sniff(): void {
    if (this.alive && this.state === 'walk') {
      this.setState('sniff');
      this.vx = 0;
      this.world.events.emit('cubSniff', { enemyId: this.id });
    }
  }

  protected think(): void {
    if (this.state === 'drop') {
      this.vy -= GAME_GRAVITY * TICK;
      this.y += this.vy * TICK;
      if (this.y <= 0) {
        this.y = 0;
        this.vy = 0;
        if (this.stateTicks > 8) {
          this.setState('walk');
          this.vx = this.speed;
        }
      }
      return;
    }
    if (this.state === 'walk') {
      if (this.stateTicks === this.sniffAt) this.sniff();
      else if (this.isBoss && this.stateTicks % 100 === 99 && this.world.rng.int(0, 2) === 1) this.sniff();
    } else if (this.state === 'sniff' && this.stateTicks >= 148) {
      this.setState('walk');
      this.vx = this.speed;
      this.sniffAt = this.stateTicks + 150 + this.world.rng.int(0, 500);
    }
  }

  protected deathKind(): DeathKind {
    if (this.isBoss || this.life < -5 * this.maxLife) return 'gib';
    const h = this.lastHit;
    if (h && !h.bullet) return 'blast';
    return h?.part === 'head' ? 'headshot' : 'normal';
  }
}

// ---------------------------------------------------------------- Activist
export class Activist extends Enemy {
  hasCub = true;
  private speedPx: number;
  private yk = 0;
  constructor(world: World, opts: Opts = {}) {
    super(world, 'activist', opts);
    this.speedPx = this.randSpeed();
    this.setState('run');
    this.reroll();
  }

  private reroll(): void {
    this.yk = this.world.rng.range(-0.4, 0.4);
    this.splitSpeed(this.speedPx, this.yk);
  }

  shapes(): HitShape[] {
    const bob = Math.abs(Math.sin(this.distance * 2.6)) * 0.05;
    const s: HitShape[] = [
      { cx: 0, cy: 0.45, a: 0.22, b: 0.45, part: 'leg' },
      { cx: 0.02, cy: 1.2 + bob, a: 0.26, b: 0.36, part: 'body' },
      { cx: 0.06, cy: 1.7 + bob, a: 0.14, b: 0.15, part: 'head' },
    ];
    if (this.hasCub) s.push({ cx: 0.3, cy: 1.07 + bob, a: 0.38, b: 0.16, part: 'cub' });
    return s;
  }

  protected think(): void {
    if (this.state === 'run') {
      this.clampLane(() => this.reroll());
      if (this.ticks % 50 === 0) this.reroll();
    } else if (this.state === 'panic') {
      this.vx *= 0.9;
      this.vz *= 0.9;
      this.clampLane();
      if (this.stateTicks >= 45) {
        this.setState('flee');
        this.vx = this.def.speed[1] * SPD_X;
        this.vz = 0;
      }
    }
  }

  bulletContact(part: HitPart, point: V3): 'damage' | 'deflect' {
    if (part === 'cub' && this.hasCub) {
      this.hasCub = false;
      this.canLeave = true;
      if (this.alive) this.setState('panic');
      this.world.events.emit('cubShotOut', { enemyId: this.id, point });
    }
    return 'damage';
  }

  protected deathKind(): DeathKind {
    const h = this.lastHit;
    if (this.life < -1.5 * this.maxLife) return 'gib';
    if (h && !h.bullet) {
      this.hasCub = false;
      return 'blast';
    }
    if (h?.part === 'head') {
      if (h.damage > this.maxLife / 2) return 'headoff';
      return this.world.rng.chance(0.5) ? 'headoff' : 'headshot';
    }
    return 'normal';
  }

  protected onDeath(): void {
    if (this.hasCub) {
      const cub = new Cub(this.world, { x: this.x + 0.35, z: this.z, dropped: true, y: 1.0 });
      this.world.addEnemy(cub, false);
      this.world.events.emit('cubDropped', { activistId: this.id, cubId: cub.id });
    }
  }
}

// ---------------------------------------------------------------- Penguin
export class Penguin extends Enemy {
  private speedPx: number;
  private yk: number;
  private glideAt: number;
  constructor(world: World, opts: Opts = {}) {
    super(world, 'penguin', opts);
    this.speedPx = this.randSpeed();
    this.yk = world.rng.range(-0.3, 0.3);
    this.splitSpeed(this.speedPx, this.yk);
    this.glideAt = world.rng.int(200, 260);
  }

  get gliding(): boolean {
    return this.state === 'glide';
  }

  shapes(): HitShape[] {
    if (this.state === 'glide') {
      const t = Math.min(1, this.stateTicks / 14);
      const l = (a: number, b: number) => a + (b - a) * t;
      return [
        { cx: l(0, -0.1), cy: l(0.6, 0.27), a: l(0.3, 0.66), b: l(0.6, 0.27), part: 'body' },
        { cx: l(0.08, 0.62), cy: l(1.22, 0.32), a: 0.16, b: 0.16, part: 'head' },
      ];
    }
    const sway = Math.sin(this.distance * 3.4) * 0.03;
    return [
      { cx: sway, cy: 0.58, a: 0.3, b: 0.58, part: 'body' },
      { cx: 0.08 + sway, cy: 1.2, a: 0.17, b: 0.17, part: 'head' },
    ];
  }

  protected think(): void {
    this.clampLane(() => {
      this.yk = -this.yk;
      this.splitSpeed(this.speedPx, this.yk);
    });
    if (this.state === 'walk' && this.stateTicks > this.glideAt) {
      this.setState('glide');
      this.speedPx = this.world.rng.range(1.74, 3.14);
      this.splitSpeed(this.speedPx, this.yk);
    }
  }

  protected deathKind(): DeathKind {
    if (this.life < -2 * this.maxLife) return 'gib';
    if (this.state === 'glide') return 'glide';
    const h = this.lastHit;
    if (h && !h.bullet) return 'blast';
    return h?.part === 'head' ? 'headshot' : 'normal';
  }
}

// ---------------------------------------------------------------- Polar bear
export class Bear extends Enemy {
  rage = 0;
  constructor(world: World, opts: Opts = {}) {
    super(world, 'bear', opts);
    this.vx = this.def.speed[0] * SPD_X;
  }

  get running(): boolean {
    return this.vx > 2.5 * SPD_X;
  }

  shapes(): HitShape[] {
    const gait = this.running ? 0.12 : 0.05;
    const bob = Math.sin(this.distance * (this.running ? 1.6 : 2.2)) * gait;
    return [
      { cx: -0.25, cy: 1.32 + bob, a: 1.25, b: 0.62, part: 'body' },
      { cx: 0.85, cy: 0.5, a: 0.3, b: 0.5, part: 'leg' },
      { cx: -1.15, cy: 0.5, a: 0.32, b: 0.5, part: 'leg' },
      { cx: 0.95, cy: 1.35 + bob, a: 0.45, b: 0.45, part: 'body' },
      { cx: 1.5, cy: 1.38 + bob * 1.3, a: 0.36, b: 0.3, part: 'head' },
    ];
  }

  protected think(): void {
    if (this.tickDamage > 0) {
      if (this.tickDamage > 50) this.world.events.emit('enemyPain', { enemyId: this.id, type: 'bear' });
      const [a, b] = this.def.speed;
      const lk = Math.max(0, this.life / this.maxLife);
      const sp = a + (b - a) * (1 - lk) ** 2;
      this.vx = sp * SPD_X;
      const rage = Math.floor((1 - lk) * 4);
      if (rage !== this.rage) {
        this.rage = rage;
        this.world.events.emit('bearRage', { enemyId: this.id, level: rage });
      }
    }
    this.tickDamage = 0;
  }

  protected pressPlayers(): void {
    for (const p of this.world.players) {
      if (!p.alive || p.y > 1.6) continue;
      if (this.overlapsPlayer(p, 0.1, 0.15)) p.launch(this.vx * 2, Math.max(4, (this.vx / SPD_X) * 1.6));
    }
  }

  protected deathKind(): DeathKind {
    const h = this.lastHit;
    return h && !h.bullet ? 'blast' : 'normal';
  }

  /** Death slide speed (original: x_speed += life/500 px/tick). */
  get deathSlide(): number {
    return this.vx + (this.life / 500) * SPD_X;
  }

  protected onDeath(): void {
    this.vx = this.deathSlide;
  }
}

// ---------------------------------------------------------------- Turtle
export class Turtle extends Enemy {
  static readonly HIDE_TICKS = 100;
  static readonly HURT_DAMAGE = 300;
  private hideDamage = Turtle.HURT_DAMAGE;
  private unhideAt = 0;
  private speed: number;
  constructor(world: World, opts: Opts = {}) {
    super(world, 'turtle', opts);
    this.speed = this.def.speed[0] * SPD_X;
    this.vx = this.speed;
  }

  get hidden(): boolean {
    return this.state === 'hidden';
  }

  shapes(): HitShape[] {
    if (this.state === 'hidden' || this.state === 'hide') {
      return [{ cx: -0.15, cy: 0.88, a: 1.5, b: 0.88, part: 'shell' }];
    }
    const t = this.state === 'emerge' ? Math.min(1, this.stateTicks / 16) : 1;
    const step = Math.sin(this.distance * 2.0) * 0.04;
    return [
      { cx: -0.15, cy: 1.02, a: 1.5, b: 0.82, part: 'shell' },
      { cx: 0.95 + step, cy: 0.2, a: 0.3, b: 0.22, part: 'leg' },
      { cx: -1.15 - step, cy: 0.2, a: 0.3, b: 0.22, part: 'leg' },
      { cx: 1.2 + 0.35 * t, cy: 0.8, a: 0.32, b: 0.26, part: 'head' },
    ];
  }

  bulletContact(part: HitPart): 'damage' | 'deflect' {
    if (this.hidden || part === 'shell') return 'deflect';
    return 'damage';
  }

  /**
   * Push from a deflected bullet while hiding, along the bullet's horizontal
   * direction (classic bullets always travel along -x).
   */
  shove(damage: number, dirX = -1, dirZ = 0): void {
    if (this.hidden && this.vx * dirX + this.vz * dirZ < 2 * SPD_X) {
      const k = (damage / 150) * SPD_X;
      this.vx += dirX * k;
      this.vz += dirZ * k;
    }
  }

  protected onDamaged(): void {
    // Damage reaching here bypassed the shell (head, legs or explosion).
  }

  takeDamage(info: DamageInfo): void {
    if (!this.hidden) this.hideDamage -= info.damage;
    super.takeDamage(info);
  }

  /** Is any player's gun line crossing the turtle? */
  private aimedAt(): boolean {
    return this.world.players.some((p) => {
      if (!p.alive) return false;
      // First person: the aim ray passes over the shell (with some margin).
      if (p.aim) return this.rayContact(p.eye(), aimDir(p.aim), FP.range, 0.3) !== null;
      if (p.x < this.x) return false;
      const yEff = viewHeightAt(p.y + PLAYER.muzzleHeight, p.z, this.z);
      return yEff > 0 && yEff < 1.8;
    });
  }

  protected think(): void {
    if (this.state === 'hidden') {
      const f = 2.5 * 0.06 * SPD_X * 50 * TICK; // x_fric 2.5 on ice
      if (this.vx > 0) this.vx = Math.max(0, this.vx - f);
      else if (this.vx < 0) this.vx = Math.min(0, this.vx + f);
      // Sideways slide from first-person ricochets (classic shots never push in depth).
      if (this.vz !== 0) {
        this.vz = this.vz > 0 ? Math.max(0, this.vz - f) : Math.min(0, this.vz + f);
        this.clampLane();
      }
      if (this.ticks >= this.unhideAt) {
        if (this.aimedAt()) this.unhideAt += Turtle.HIDE_TICKS;
        else this.setState('emerge');
      }
    } else if (this.state === 'emerge') {
      this.vx = this.vz = 0;
      if (this.stateTicks >= 16) {
        this.setState('walk');
        this.vx = this.speed;
      }
    } else if (this.alive && this.hideDamage <= 0) {
      this.setState('hidden');
      this.vx = 0;
      this.hideDamage = Turtle.HURT_DAMAGE;
      this.unhideAt = this.ticks + Turtle.HIDE_TICKS;
      this.world.events.emit('turtleHide', { enemyId: this.id });
    }
  }

  protected deathKind(): DeathKind {
    const h = this.lastHit;
    return h && !h.bullet ? 'blast' : 'normal';
  }
}

// ---------------------------------------------------------------- Walrus (final boss)
export class Walrus extends Enemy {
  private eatTicks = 0;
  /** One bite per player per rush. */
  private bitten = new Set<unknown>();
  constructor(world: World, opts: Opts = {}) {
    super(world, 'walrus', opts);
    this.canLeave = true;
    this.vx = this.def.speed[0] * SPD_X;
  }

  shapes(): HitShape[] {
    const lunge = this.state === 'walk' ? Math.sin(this.distance * 1.8) * 0.08 : 0;
    const charge = this.state === 'charge' ? -0.35 : 0;
    return [
      { cx: -0.3, cy: 1.05, a: 1.45, b: 1.05, part: 'body' },
      { cx: 0.6, cy: 1.75 + lunge + charge, a: 0.75, b: 0.75, part: 'body' },
      { cx: 1.05, cy: 2.3 + lunge + charge, a: 0.6, b: 0.58, part: 'head' },
    ];
  }

  private nearestPlayerZ(): number {
    let best = this.z;
    let bd = Infinity;
    for (const p of this.world.players) {
      if (!p.alive) continue;
      const d = Math.abs(p.x - this.x);
      if (d < bd) {
        bd = d;
        best = p.z;
      }
    }
    return best;
  }

  tick(): void {
    this.ticks++;
    this.stateTicks++;
    if (!this.alive) return;
    const dt = TICK;
    switch (this.state) {
      case 'walk': {
        // Lumbering lunges: average ~0.9 px/tick like the original frame steps.
        const phase = (this.ticks % 16) / 16;
        const lunge = phase > 0.25 && phase < 0.75 ? 1.7 : 0.3;
        this.vx = 0.92 * lunge * SPD_X * this.facing;
        const zt = this.nearestPlayerZ();
        this.vz = Math.max(-1.2, Math.min(1.2, (zt - this.z) * 0.8));
        const inField = this.facing > 0 ? this.x > -13.75 : this.x < 13.75;
        if (inField) {
          this.setState('charge');
          this.vx = 0;
          this.world.events.emit('walrusCharge', { enemyId: this.id });
        }
        break;
      }
      case 'charge': {
        // The lane is locked while it scrapes its tusks: the charge is the
        // warning to get out of the way (the original rushed along its row).
        this.vz = 0;
        this.vx = 0;
        if (this.stateTicks >= 60) {
          this.setState('rush');
          this.bitten.clear();
          this.vx = 12 * SPD_X * this.facing;
          this.vz = 0;
          this.world.events.emit('walrusRush', { enemyId: this.id });
        }
        break;
      }
      case 'rush': {
        for (const p of this.world.players) {
          if (this.bitten.has(p)) continue;
          if (p.alive && p.y < 2.2 && this.overlapsPlayer(p, 0.1, 0.0)) {
            this.bitten.add(p);
            p.devour(this);
            this.setState('eat');
            this.eatTicks = 60;
            this.vx = 0;
          }
        }
        if (this.facing > 0 && this.x > FIELD_HALF_W + 3.5) this.turn(-1);
        else if (this.facing < 0 && this.x < -FIELD_HALF_W - 3.5) this.turn(1);
        break;
      }
      case 'eat':
        this.vx = 0;
        if (--this.eatTicks <= 0) {
          this.setState('rush');
          this.vx = 12 * SPD_X * this.facing;
        }
        break;
    }
    this.x += this.vx * dt;
    this.z = Math.max(this.world.laneMin, Math.min(this.world.laneMax, this.z + this.vz * dt));
    this.distance += Math.abs(this.vx * dt) + Math.abs(this.vz * dt);
    this.tickDamage = 0;
  }

  private turn(dir: 1 | -1): void {
    this.facing = dir;
    this.setState('walk');
  }

  protected think(): void {}

  protected deathKind(): DeathKind {
    return 'normal';
  }
}

export function createEnemy(world: World, type: EnemyType, opts: Opts = {}): Enemy {
  switch (type) {
    case 'seal':
      return new Seal(world, opts);
    case 'fatseal':
      return new FatSeal(world, opts);
    case 'activist':
      return new Activist(world, opts);
    case 'cub':
      return new Cub(world, opts);
    case 'penguin':
      return new Penguin(world, opts);
    case 'bear':
      return new Bear(world, opts);
    case 'turtle':
      return new Turtle(world, opts);
    case 'walrus':
      return new Walrus(world, opts);
  }
}


