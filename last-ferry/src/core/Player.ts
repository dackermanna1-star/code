// The Bosun. Movement on wet planks, jump + stomp, kicking crawlers, being
// grabbed, damage and regeneration, money, weapons, horn and cannon inputs.
import { WEAPON_ORDER, type WeaponId, type ZombieKind } from '../config/ids';
import { GRAVITY, HUNTER, PLAYER_MAX_X, PLAYER_MAX_Z, PLAYER_MIN_X, PLAYER_MIN_Z, TICK, TICK_RATE } from '../config/world';
import { MUZZLE_FORWARD, MUZZLE_Z, WEAPONS } from '../config/weapons';
import { FAVOUR, FIRE, HUNTER_RULES, MONEY } from '../config/rules';
import type { PlayerState, PlayerView } from './api';
import type { GameEvents, V3 } from './events';
import { Weapon } from './Weapon';
import type { World } from './World';
import type { Zombie } from './Zombie';

export interface PlayerInput {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  fire: boolean;
  /** Stomp (jump and land on whatever is underneath). Edge-triggered. */
  jump: boolean;
  /** Ferry horn (once per chapter). Edge-triggered. */
  horn: boolean;
  /** Captain's Favour cannon strike. Edge-triggered. */
  cannon: boolean;
}

export const emptyInput = (): PlayerInput => ({ left: false, right: false, up: false, down: false, fire: false, jump: false, horn: false, cannon: false });

export interface PlayerStats {
  shots: number;
  hits: number;
  headshots: number;
  kills: number;
  killsByKind: Partial<Record<ZombieKind, number>>;
  killsByWeapon: Partial<Record<WeaponId | 'other', number>>;
  earned: number;
  niceShots: number;
  bestNiceShot: number;
  stomps: number;
  kicks: number;
  horns: number;
  craneDrops: number;
  cannonStrikes: number;
  damageTaken: number;
  bought: WeaponId[];
}

type HurtSource = GameEvents['playerHurt']['source'];

const ARMED: ReadonlySet<PlayerState> = new Set<PlayerState>(['stand', 'walk', 'air', 'grabbed']);

export class Player implements PlayerView {
  readonly id: number;
  readonly world: World;
  x: number;
  y = 0;
  z: number;
  vx = 0;
  vy = 0;
  vz = 0;
  life: number = HUNTER.life;
  state: PlayerState = 'stand';
  stateTicks = 0;
  distance = 0;
  money = 0;
  kills = 0;
  weapon: Weapon;
  readonly owned = new Map<WeaponId, Weapon>();
  input: PlayerInput = emptyInput();
  /** Driven by core/Bot (attract mode, sims). */
  isBot = false;
  /** Zombies holding on to him. */
  readonly grabbers = new Set<Zombie>();
  lastHurtTick = -100000;
  /** Consecutive headshot kills. */
  headStreak = 0;
  stats: PlayerStats = {
    shots: 0,
    hits: 0,
    headshots: 0,
    kills: 0,
    killsByKind: {},
    killsByWeapon: {},
    earned: 0,
    niceShots: 0,
    bestNiceShot: 0,
    stomps: 0,
    kicks: 0,
    horns: 0,
    craneDrops: 0,
    cannonStrikes: 0,
    damageTaken: 0,
    bought: [],
  };
  private latch = { jump: false, horn: false, cannon: false };
  private hurtAcc: Record<HurtSource, number> = { grab: 0, gas: 0, fire: 0, blast: 0 };
  private hurtReportIn = 0;
  /** Zombie id kicked last (animation). */
  kickTarget = 0;

  constructor(world: World, id: number, x: number, z: number) {
    this.world = world;
    this.id = id;
    this.x = x;
    this.z = z;
    this.weapon = new Weapon(this, 'revolver');
    this.owned.set('revolver', this.weapon);
  }

  get alive(): boolean {
    return this.state !== 'dead';
  }

  get onGround(): boolean {
    return this.y <= 0;
  }

  /** Can shoot in this state. */
  get armed(): boolean {
    return ARMED.has(this.state);
  }

  /** Gun line origin for the current weapon. */
  muzzle(): V3 {
    const id = this.weapon.id;
    return { x: this.x - MUZZLE_FORWARD[id], y: this.y + HUNTER.muzzleHeight, z: this.z + MUZZLE_Z[id] };
  }

  private setState(s: PlayerState): void {
    if (this.state === s) return;
    this.state = s;
    this.stateTicks = 0;
  }

  private edge(key: 'jump' | 'horn' | 'cannon'): boolean {
    const v = this.input[key];
    const e = v && !this.latch[key];
    this.latch[key] = v;
    return e;
  }

  tick(): void {
    if (!this.alive) return;
    this.stateTicks++;
    const w = this.world;
    const inp = this.input;
    const moving = inp.left || inp.right || inp.up || inp.down;

    if (this.edge('horn')) w.pier.blowHorn(this);
    if (this.edge('cannon')) w.pier.callCannon(this);
    const jump = this.edge('jump');

    // --- state machine
    switch (this.state) {
      case 'stand':
      case 'walk':
        if (this.grabbers.size) this.setState('grabbed');
        else this.setState(moving ? 'walk' : 'stand');
        break;
      case 'grabbed':
        if (!this.grabbers.size) this.setState(moving ? 'walk' : 'stand');
        break;
      case 'stomp':
        if (this.stateTicks >= Math.round(HUNTER_RULES.stompSeconds * TICK_RATE)) this.setState(moving ? 'walk' : 'stand');
        break;
      case 'kick':
        if (this.stateTicks >= Math.round(HUNTER_RULES.kickSeconds * TICK_RATE)) this.setState(moving ? 'walk' : 'stand');
        break;
      default:
        break;
    }

    if (jump && this.onGround && this.state !== 'air' && this.state !== 'stomp') {
      this.vy = HUNTER.jumpSpeed;
      this.setState('air');
      w.events.emit('jump', { playerId: this.id });
      this.shakeOff();
    }

    // --- movement: accelerate toward the input on the ground; little air control
    const slowGrab = this.grabbers.size ? HUNTER_RULES.grabbedSpeed : 1;
    const maxX = HUNTER.maxSpeedX * slowGrab;
    const maxZ = HUNTER.maxSpeedZ * slowGrab;
    const control = this.onGround ? (this.state === 'stomp' || this.state === 'kick' ? 0.3 : 1) : 0.25;
    const ax = HUNTER.accel * control * TICK;
    const fr = HUNTER.friction * TICK;
    const wantX = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    const wantZ = (inp.down ? 1 : 0) - (inp.up ? 1 : 0);
    this.vx = drive(this.vx, wantX * maxX, ax, this.onGround ? fr : fr * 0.2);
    this.vz = drive(this.vz, wantZ * maxZ, ax, this.onGround ? fr : fr * 0.2);
    // Grabbers drag him toward the ferry.
    if (this.grabbers.size) this.x += HUNTER_RULES.grabShove * this.grabbers.size * TICK;

    const px = this.x;
    const pz = this.z;
    this.x += this.vx * TICK;
    this.z += this.vz * TICK;
    if (!this.onGround || this.vy > 0) {
      this.y += this.vy * TICK;
      this.vy -= GRAVITY * TICK;
      if (this.y <= 0) {
        this.y = 0;
        this.vy = 0;
        this.land();
      }
    }
    if (this.x < PLAYER_MIN_X) {
      this.x = PLAYER_MIN_X;
      this.vx = Math.max(0, this.vx);
    } else if (this.x > PLAYER_MAX_X) {
      this.x = PLAYER_MAX_X;
      this.vx = Math.min(0, this.vx);
    }
    if (this.z < PLAYER_MIN_Z) {
      this.z = PLAYER_MIN_Z;
      this.vz = Math.max(0, this.vz);
    } else if (this.z > PLAYER_MAX_Z) {
      this.z = PLAYER_MAX_Z;
      this.vz = Math.min(0, this.vz);
    }
    if (this.onGround) this.distance += Math.hypot(this.x - px, this.z - pz);

    if (this.onGround && (this.state === 'stand' || this.state === 'walk')) this.kickCrawlers();

    // --- weapon
    if (this.weapon.update(this.armed && inp.fire)) w.combat.fire(this, this.weapon);

    // --- regeneration and damage reports
    if (this.life < HUNTER.life && w.tick - this.lastHurtTick > HUNTER.regenDelay * TICK_RATE) {
      this.life = Math.min(HUNTER.life, this.life + HUNTER.regen * TICK);
    }
    if (--this.hurtReportIn <= 0) this.flushHurt();
  }

  /** Landing: stomp whatever is underneath (crawlers, downed bodies). */
  private land(): void {
    const w = this.world;
    this.setState('stomp');
    this.vx *= 0.4;
    this.vz *= 0.4;
    let finished = 0;
    const rx = HUNTER_RULES.stompReachX;
    const rz = HUNTER_RULES.stompReachZ;
    for (const zb of w.zombies) {
      if (!zb.alive || !zb.crawling) continue;
      if (Math.abs(zb.x - this.x) > rx || Math.abs(zb.z - this.z) > rz) continue;
      zb.damage({
        damage: zb.life + 1,
        part: 'head',
        point: { x: zb.x + 0.5, y: 0.25, z: zb.z },
        dirX: 0,
        dirZ: 0,
        source: 'stomp',
        player: this,
        weapon: null,
      });
      finished++;
      this.tidy(zb.x, zb.z);
    }
    w.bodies.forEachIn(this.x, this.z, rx, rz, (c) => {
      if (!c.downed) return;
      w.bodies.makePermanent(c, 'stomp');
      finished++;
      this.tidy(c.x, c.z);
    });
    this.stats.stomps++;
    w.events.emit('stomp', { playerId: this.id, x: this.x, z: this.z, killed: finished > 0 });
    w.resolveDeaths();
  }

  private tidy(x: number, z: number): void {
    this.earn(MONEY.tidy, 'tidy', x, 0.3, z);
    this.world.pier.addFavour(FAVOUR.tidy);
  }

  /** Walking into a crawler kicks it away (it does not get up again). */
  private kickCrawlers(): void {
    const w = this.world;
    for (const zb of w.zombies) {
      if (!zb.alive || !zb.crawling) continue;
      if (Math.abs(zb.z - this.z) > 0.55) continue;
      const dx = this.x - zb.x;
      if (dx < -0.3 || dx > 1.05) continue;
      this.setState('kick');
      this.kickTarget = zb.id;
      this.stats.kicks++;
      w.events.emit('kick', { playerId: this.id, zombieId: zb.id });
      zb.damage({
        damage: HUNTER_RULES.kickDamage,
        part: 'body',
        point: { x: zb.x + 0.4, y: 0.3, z: zb.z },
        dirX: -1,
        dirZ: 0,
        source: 'kick',
        player: this,
        weapon: null,
        push: { x: -HUNTER_RULES.kickPush, z: 0 },
      });
      if (zb.life > 0) zb.x -= HUNTER_RULES.kickPush;
      w.resolveDeaths();
      return;
    }
  }

  // ------------------------------------------------------------------ grabs

  addGrabber(z: Zombie): void {
    if (this.grabbers.has(z)) return;
    this.grabbers.add(z);
    if (this.onGround && (this.state === 'stand' || this.state === 'walk')) this.setState('grabbed');
    this.world.events.emit('grab', { zombieId: z.id, playerId: this.id });
  }

  removeGrabber(z: Zombie): void {
    if (!this.grabbers.delete(z)) return;
    this.world.events.emit('release', { zombieId: z.id, playerId: this.id });
  }

  /** Per tick while held. */
  grabTick(z: Zombie): void {
    this.hurtOverTime(z.def.grabDps * TICK, 'grab');
    if (z.burning > 0) this.hurtOverTime(FIRE.hunterDps * TICK, 'fire');
  }

  crawlerBite(_z: Zombie): void {
    this.hurtOverTime(HUNTER_RULES.crawlerBiteDps * TICK, 'grab');
  }

  /** Jumping kicks every grabber off. */
  private shakeOff(): void {
    for (const z of [...this.grabbers]) z.stagger(HUNTER_RULES.shakeOffStagger, HUNTER_RULES.shakeOffPush);
    this.grabbers.clear();
  }

  // ------------------------------------------------------------------ damage

  /** Damage over time (grab, gas, fire): reported in batches. */
  hurtOverTime(amount: number, source: HurtSource): void {
    if (!this.alive || amount <= 0) return;
    this.hurtAcc[source] += amount;
    this.applyDamage(amount);
  }

  /** One-off damage (blasts): reported at once, with a shove. */
  hurt(amount: number, source: HurtSource, fromX?: number, fromZ?: number): void {
    if (!this.alive || amount <= 0) return;
    this.world.events.emit('playerHurt', { playerId: this.id, damage: amount, source });
    if (fromX !== undefined && fromZ !== undefined) {
      const dx = this.x - fromX;
      const dz = this.z - fromZ;
      const l = Math.hypot(dx, dz) || 1;
      this.vx += (dx / l) * 3;
      this.vz += (dz / l) * 3;
    }
    this.applyDamage(amount);
  }

  private applyDamage(amount: number): void {
    this.life -= amount;
    this.stats.damageTaken += amount;
    this.lastHurtTick = this.world.tick;
    if (this.life <= 0) this.die();
  }

  private flushHurt(): void {
    this.hurtReportIn = Math.round(HUNTER_RULES.hurtReportSeconds * TICK_RATE);
    for (const k of Object.keys(this.hurtAcc) as HurtSource[]) {
      const v = this.hurtAcc[k];
      if (v > 0) {
        this.world.events.emit('playerHurt', { playerId: this.id, damage: v, source: k });
        this.hurtAcc[k] = 0;
      }
    }
  }

  private die(): void {
    if (this.world.god || this.world.phase === 'victory') {
      this.life = HUNTER.life;
      return;
    }
    this.flushHurt();
    this.life = 0;
    for (const z of [...this.grabbers]) z.releaseGrab();
    this.setState('dead');
    this.vx = this.vy = this.vz = 0;
    this.weapon.holster();
    this.world.events.emit('playerDeath', { playerId: this.id });
    this.world.onPlayerDeath(this);
  }

  // ------------------------------------------------------------------ money & weapons

  earn(amount: number, reason: GameEvents['money']['reason'], x: number, y: number, z: number): void {
    if (amount === 0) return;
    this.money += amount;
    if (amount > 0) this.stats.earned += amount;
    this.world.events.emit('money', { playerId: this.id, amount, reason, x, y, z });
  }

  has(id: WeaponId): boolean {
    return this.owned.has(id);
  }

  buy(id: WeaponId): boolean {
    if (!this.alive || this.has(id)) return false;
    const def = WEAPONS[id];
    if (this.money < def.price) return false;
    this.money -= def.price;
    this.owned.set(id, new Weapon(this, id));
    this.stats.bought.push(id);
    this.world.events.emit('buy', { playerId: this.id, weapon: id });
    this.switchTo(id);
    return true;
  }

  /** Buy the most expensive weapon we can afford and don't own. */
  buyBest(): boolean {
    for (const id of [...WEAPON_ORDER].reverse()) {
      if (!this.has(id) && this.money >= WEAPONS[id].price) return this.buy(id);
    }
    return false;
  }

  /** Select an owned weapon or buy it (number keys / HUD click). */
  selectOrBuy(id: WeaponId): boolean {
    return this.has(id) ? this.switchTo(id) : this.buy(id);
  }

  switchTo(id: WeaponId): boolean {
    const w = this.owned.get(id);
    if (!w || w === this.weapon || !this.alive) return false;
    this.weapon.holster();
    this.weapon = w;
    this.world.events.emit('weaponSwitch', { playerId: this.id, weapon: id });
    return true;
  }

  /** Cycle through owned weapons in slot order. */
  cycle(dir = 1): boolean {
    const owned = WEAPON_ORDER.filter((id) => this.has(id));
    if (owned.length < 2) return false;
    const i = owned.indexOf(this.weapon.id);
    return this.switchTo(owned[(i + (dir < 0 ? -1 : 1) + owned.length) % owned.length]);
  }

  reload(): boolean {
    if (!this.alive) return false;
    return this.weapon.reload();
  }
}

/** Accelerate toward `target`; past it (recoil, letting go) friction bleeds the excess off. */
function drive(v: number, target: number, acc: number, fric: number): number {
  if (target > 0) return v < target ? Math.min(target, v + acc) : Math.max(target, v - fric);
  if (target < 0) return v > target ? Math.max(target, v - acc) : Math.min(target, v + fric);
  if (v > 0) return Math.max(0, v - fric);
  if (v < 0) return Math.min(0, v + fric);
  return 0;
}
