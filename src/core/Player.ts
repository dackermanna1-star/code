// The hunter. Movement, recoil sliding on the ice, knock-downs, jumping,
// kicking crawling seals and the weapon inventory (original player.py).
import {
  GAME_GRAVITY,
  PLAYER,
  playerXLimit,
  PLAYER_Z_MAX,
  PLAYER_Z_MIN,
  SPD_H,
  TICK,
} from '../config/constants';
import { WEAPONS, WEAPON_ORDER, type WeaponId } from '../config/weapons';
import type { EnemyType } from '../config/enemies';
import type { Enemy } from './Enemy';
import { Seal } from './enemies';
import { Weapon, MUZZLE_FORWARD, MUZZLE_Z } from './Weapon';
import type { World } from './World';
import { FP, aimDir, headingDir, rightDir, type Aim } from '../config/firstPerson';

export type PlayerState = 'stand' | 'walk' | 'jump' | 'fall' | 'sit' | 'getup' | 'kick' | 'air' | 'dead';

export interface PlayerInput {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  fire: boolean;
  jump: boolean;
  /**
   * First-person movement: desired world-space direction on the ice
   * (x, z; length <= 1). When present it replaces left/right/up/down.
   */
  move?: { x: number; z: number };
}

export interface PlayerStats {
  shots: number;
  hits: number;
  headshots: number;
  kills: number;
  killsByType: Partial<Record<EnemyType, number>>;
  killsByWeapon: Partial<Record<WeaponId, number>>;
  moneyEarned: number;
  niceShots: number;
  bestNiceShot: number;
  weaponsBought: WeaponId[];
  distance: number;
}

const WITH_WEAPON: PlayerState[] = ['stand', 'walk', 'air'];

/** Stick deflection below which a first-person move input counts as no movement. */
const MOVE_DEADZONE = 0.05;
/** A move axis counts as pushed (no friction on it) above this share of the input. */
const MOVE_AXIS_MIN = 0.1;

export class Player {
  readonly id: number;
  readonly world: World;
  x: number;
  y = 0;
  z: number;
  vx = 0;
  vy = 0;
  vz = 0;
  life: number = PLAYER.life;
  state: PlayerState = 'stand';
  stateTicks = 0;
  input: PlayerInput = { left: false, right: false, up: false, down: false, fire: false, jump: false };
  /** Computer-controlled teammate (driven by core/Bot from the app). */
  isBot = false;
  /** Display name (bots: the original's AI names). */
  name = 'You';
  /**
   * First-person aim (see config/firstPerson.ts). null = classic mode: the gun
   * line runs left along the lane with the view-consistent hit rule.
   */
  aim: Aim | null = null;
  private jumpLatch = false;
  money = 0;
  readonly weapons = new Map<WeaponId, Weapon>();
  weapon: Weapon;
  /** Gait distance for animation. */
  distance = 0;
  lastHurtTick = -10000;
  /** Enemy this player is kicking (for animation). */
  kickTarget = 0;
  stats: PlayerStats = {
    shots: 0,
    hits: 0,
    headshots: 0,
    kills: 0,
    killsByType: {},
    killsByWeapon: {},
    moneyEarned: 0,
    niceShots: 0,
    bestNiceShot: 0,
    weaponsBought: [],
    distance: 0,
  };

  constructor(world: World, id: number, x: number, z: number) {
    this.world = world;
    this.id = id;
    this.x = x;
    this.z = z;
    this.weapon = new Weapon(this, 'pistol');
    this.weapons.set('pistol', this.weapon);
  }

  get alive(): boolean {
    return this.state !== 'dead';
  }

  /** World position of the active weapon's muzzle (gun line). */
  muzzle(): { x: number; y: number; z: number } {
    const id = this.weapon.id;
    return { x: this.x - MUZZLE_FORWARD[id], y: this.y + PLAYER.muzzleHeight, z: this.z + MUZZLE_Z[id] };
  }

  /** First person: the eye (camera and bullet origin), FP.eyeHeight above the feet. */
  eye(): { x: number; y: number; z: number } {
    return { x: this.x, y: this.y + FP.eyeHeight, z: this.z };
  }

  /**
   * First person: world position of the viewmodel's muzzle (FP.gun offsets
   * from the eye along the aim). Falls back to muzzle() in classic mode.
   */
  aimMuzzle(): { x: number; y: number; z: number } {
    if (!this.aim) return this.muzzle();
    const g = FP.gun;
    const d = aimDir(this.aim);
    const r = rightDir(this.aim.yaw);
    // The view's up vector: (-sin(pitch) * heading, cos(pitch)).
    const h = headingDir(this.aim.yaw);
    const sp = Math.sin(this.aim.pitch);
    const ux = -sp * h.x;
    const uy = Math.cos(this.aim.pitch);
    const uz = -sp * h.z;
    return {
      x: this.x + d.x * g.forward + r.x * g.right - ux * g.down,
      y: this.y + FP.eyeHeight + d.y * g.forward - uy * g.down,
      z: this.z + d.z * g.forward + r.z * g.right - uz * g.down,
    };
  }

  /** Crosshair position in front of the hunter (original cross_xoffset). */
  crosshair(): { x: number; y: number; z: number } {
    const id = this.weapon.id;
    return { x: this.x - MUZZLE_FORWARD[id] - this.weapon.def.crossOffset, y: this.y + PLAYER.muzzleHeight, z: this.z + MUZZLE_Z[id] };
  }

  private setState(s: PlayerState): void {
    if (this.state === s) return;
    this.state = s;
    this.stateTicks = 0;
  }

  get canAct(): boolean {
    return WITH_WEAPON.includes(this.state);
  }

  tick(): void {
    if (!this.alive) return;
    this.stateTicks++;
    const inp = this.input;
    const mv = inp.move;
    const moving = mv ? Math.hypot(mv.x, mv.z) > MOVE_DEADZONE : inp.left || inp.right || inp.up || inp.down;
    const onGround = this.y <= 0;

    // --- state machine (Stopped/Walking/Jump/JumpFall/Sitting/GetUp/InAir)
    switch (this.state) {
      case 'stand':
      case 'walk':
        this.setState(moving ? 'walk' : 'stand');
        if (this.y > 0.6 && (this.aim ? Math.hypot(this.vx, this.vz) : Math.abs(this.vx)) > 3.2) this.setState('air');
        break;
      case 'air':
        if (onGround) this.setState(moving ? 'walk' : 'stand');
        break;
      case 'jump':
        if (this.vy <= 0) this.setState('fall');
        break;
      case 'fall':
        if (onGround) {
          this.vx /= 2;
          this.vz /= 2;
          this.vy = 0;
          this.setState('sit');
          this.world.events.emit('playerLand', { playerId: this.id });
        }
        break;
      case 'sit':
        if (this.stateTicks >= 3) this.setState('getup');
        break;
      case 'getup':
        if (this.stateTicks >= 24) this.setState(moving ? 'walk' : 'stand');
        break;
      case 'kick':
        if (this.stateTicks >= 15) this.setState(moving ? 'walk' : 'stand');
        break;
    }

    // --- jump (edge triggered)
    if (inp.jump && !this.jumpLatch && (this.state === 'walk' || this.state === 'stand') && onGround) {
      this.vy = PLAYER.jumpSpeed;
      this.setState('jump');
      this.world.events.emit('playerJump', { playerId: this.id });
    }
    this.jumpLatch = inp.jump;

    // --- first-person movement: a world-space direction instead of the four keys
    let pushX = false;
    let pushZ = false;
    if (mv) {
      const l = Math.hypot(mv.x, mv.z);
      if (l > MOVE_DEADZONE) {
        const ux = mv.x / l;
        const uz = mv.z / l;
        const k = Math.min(1, l);
        pushX = Math.abs(ux) * k > MOVE_AXIS_MIN;
        pushZ = Math.abs(uz) * k > MOVE_AXIS_MIN;
        if (onGround && this.state === 'walk') {
          // Top speed along the direction lies on the ellipse spanned by the
          // per-axis maxima, so straight runs match the classic keys and any
          // heading or strafe keeps its direction; each axis accelerates with
          // its own classic rate (scaled by its share of the direction).
          const vmax = k / Math.hypot(ux / PLAYER.maxSpeedX, uz / PLAYER.maxSpeedZ);
          if (pushX) this.vx = drive(this.vx, ux * vmax, PLAYER.accX * TICK * Math.abs(ux), PLAYER.fricX * TICK);
          if (pushZ) this.vz = drive(this.vz, uz * vmax, PLAYER.accZ * TICK * Math.abs(uz), PLAYER.fricZ * TICK);
        }
      }
    }

    // --- acceleration (only walking on the ice)
    if (!mv && onGround && this.state === 'walk') {
      const ax = PLAYER.accX * TICK;
      const az = PLAYER.accZ * TICK;
      if (inp.left && this.vx > -PLAYER.maxSpeedX) this.vx -= ax;
      if (inp.right && this.vx < PLAYER.maxSpeedX) this.vx += ax;
      if (inp.up && this.vz > -PLAYER.maxSpeedZ) this.vz -= az;
      if (inp.down && this.vz < PLAYER.maxSpeedZ) this.vz += az;
    }

    // --- integrate
    const px = this.x;
    const pz = this.z;
    this.x += this.vx * TICK;
    this.z += this.vz * TICK;
    this.y += this.vy * TICK;
    if (this.y > 0) {
      this.vy -= GAME_GRAVITY * TICK;
    } else {
      this.y = 0;
      // Bounce a little after big launches (original bouncing factor).
      if (this.vy < -7) this.vy = -this.vy * 0.3;
      else this.vy = 0;
    }
    const d = Math.hypot(this.x - px, this.z - pz);
    this.distance += d;
    this.stats.distance += d;

    // --- ice friction when not pushing on that axis
    if (this.y <= 0) {
      const pushingX = mv ? pushX : inp.left || inp.right;
      const pushingZ = mv ? pushZ : inp.up || inp.down;
      if (!pushingX || this.state !== 'walk') this.vx = approach0(this.vx, PLAYER.fricX * TICK);
      if (!pushingZ || this.state !== 'walk') this.vz = approach0(this.vz, PLAYER.fricZ * TICK);
    }

    // --- field bounds
    const xl = playerXLimit(this.z);
    if (this.x > xl) {
      this.x = xl;
      this.vx = Math.min(0, this.vx);
    }
    if (this.x < -xl) {
      this.x = -xl;
      this.vx = Math.max(0, this.vx);
    }
    if (this.z > PLAYER_Z_MAX) {
      this.z = PLAYER_Z_MAX;
      this.vz = Math.min(0, this.vz);
    }
    if (this.z < PLAYER_Z_MIN) {
      this.z = PLAYER_Z_MIN;
      this.vz = Math.max(0, this.vz);
    }

    this.crawlerContacts();

    // --- fire
    if (this.canAct && inp.fire) {
      if (this.weapon.pull()) this.applyRecoil(this.weapon.def.recoilX, this.weapon.def.recoilUp);
    }
    this.weapon.tick();

    // --- slow regeneration (no health bar in the original HUD; see RESEARCH.md)
    if (this.life < PLAYER.life && this.world.tick - this.lastHurtTick > PLAYER.regenDelay * 50) {
      this.life = Math.min(PLAYER.life, this.life + PLAYER.regen * TICK);
    }
  }

  /** Recoil slide: away from where the gun points (classic: always to the right, +x). */
  applyRecoil(x: number, up: number): void {
    if (this.aim) {
      const h = headingDir(this.aim.yaw);
      this.vx -= h.x * x;
      this.vz -= h.z * x;
    } else {
      this.vx += x;
    }
    if (up > 0) this.vy += up;
  }

  /** Kick or stomp wounded, crawling seals (original HeadKick / KrossatHuvud). */
  private crawlerContacts(): void {
    const falling = this.vy < 0 && this.y < 0.35;
    // First person: "in front" follows the heading (classic: the hunter faces -x).
    const h = this.aim ? headingDir(this.aim.yaw) : null;
    for (const e of this.world.enemies) {
      if (!(e instanceof Seal) || !e.alive || !e.crawling) continue;
      let dx = this.x - e.x;
      if (h) {
        const rx = e.x - this.x;
        const rz = e.z - this.z;
        if (Math.abs(rz * h.x - rx * h.z) > 0.55) continue;
        dx = rx * h.x + rz * h.z;
      } else if (Math.abs(e.z - this.z) > 0.55) continue;
      if (falling && Math.abs(dx) < 0.8) {
        e.special = 'stomp';
        this.finishCrawler(e);
      } else if (this.y <= 0 && (this.state === 'walk' || this.state === 'stand') && dx > -0.2 && dx < 1.1) {
        e.special = 'kick';
        this.setState('kick');
        this.kickTarget = e.id;
        this.world.events.emit('playerKick', { playerId: this.id, enemyId: e.id });
        this.finishCrawler(e);
      }
    }
  }

  private finishCrawler(e: Seal): void {
    e.lastHit = {
      damage: e.life,
      part: 'head',
      point: { x: e.x + 0.5, y: 0.25, z: e.z },
      dirX: this.aim ? -Math.cos(this.aim.yaw) : -1,
      dirZ: this.aim ? Math.sin(this.aim.yaw) : 0,
      bullet: false,
      player: this,
    };
    e.killer = this;
    e.life = 0;
    e.die();
  }

  /** Bowled over by a fat seal / penguin / cub (original press_players). */
  knockDown(enemyVx: number): void {
    if (!this.alive || this.state === 'jump' || this.state === 'fall') return;
    if (this.state !== 'sit' && this.state !== 'getup') this.world.events.emit('playerKnocked', { playerId: this.id });
    this.vx = (this.vx + enemyVx) / 3;
    this.setState('sit');
    this.stateTicks = 0;
  }

  /** Rammed by a polar bear. */
  launch(vx: number, upPx: number): void {
    if (!this.alive) return;
    this.vx = vx;
    this.vy = Math.max(this.vy, Math.min(12, upPx * SPD_H * 0.35));
    this.setState('air');
    this.world.events.emit('playerLaunched', { playerId: this.id });
  }

  /** Eaten by the walrus. */
  devour(walrus: Enemy): void {
    if (!this.alive) return;
    this.world.events.emit('walrusDevour', { enemyId: walrus.id, playerId: this.id });
    this.kill('walrus');
  }

  /** Splash damage from explosions (friendly fire like the original). */
  hurt(damage: number, fromX: number, fromZ: number): void {
    if (!this.alive || damage <= 0) return;
    this.life -= damage;
    this.lastHurtTick = this.world.tick;
    this.world.events.emit('playerHurt', { playerId: this.id, damage });
    const dx = this.x - fromX;
    const dz = this.z - fromZ;
    const l = Math.hypot(dx, dz) || 1;
    const k = (damage / 150) * 3;
    this.vx += (k * dx) / l;
    this.vz += (k * dz) / l;
    if (this.life <= 0) this.kill('explosion');
  }

  private kill(by: 'walrus' | 'explosion'): void {
    if (this.world.god) {
      this.life = PLAYER.life;
      return;
    }
    this.life = 0;
    this.setState('dead');
    this.vx = this.vy = this.vz = 0;
    this.world.events.emit('playerDeath', { playerId: this.id, by });
    this.world.onPlayerDeath(this);
  }

  // ------------------------------------------------------------------ money & weapons
  earn(amount: number): void {
    if (amount === 0) return;
    this.money += amount;
    if (amount > 0) this.stats.moneyEarned += amount;
    this.world.events.emit('money', { playerId: this.id, amount, pos: { x: this.x, y: this.y + PLAYER.height + 0.5, z: this.z } });
  }

  has(id: WeaponId): boolean {
    return this.weapons.has(id);
  }

  /** Can buy/switch now (original: only with a weapon in hand and not mid-shot). */
  private get canSwitch(): boolean {
    return this.canAct && this.weapon.state !== 'fire';
  }

  buy(id: WeaponId): boolean {
    if (!this.canSwitch || this.has(id)) return false;
    const def = WEAPONS[id];
    if (this.money < def.price) return false;
    this.money -= def.price;
    const w = new Weapon(this, id);
    this.weapons.set(id, w);
    this.stats.weaponsBought.push(id);
    this.world.events.emit('buy', { playerId: this.id, weapon: id });
    this.switchTo(id);
    return true;
  }

  /** Buy the most expensive weapon we can afford and don't own (original "buy"). */
  buyBest(): boolean {
    const order = [...WEAPON_ORDER].reverse();
    for (const id of order) {
      if (!this.has(id) && this.money >= WEAPONS[id].price) return this.buy(id);
    }
    return false;
  }

  /** Select an owned weapon or buy it (number keys / HUD click). */
  selectOrBuy(id: WeaponId): boolean {
    if (this.has(id)) return this.switchTo(id);
    return this.buy(id);
  }

  switchTo(id: WeaponId): boolean {
    const w = this.weapons.get(id);
    if (!w || w === this.weapon || !this.canSwitch) return false;
    this.weapon = w;
    this.world.events.emit('weaponSwitch', { playerId: this.id, weapon: id });
    return true;
  }

  /** Cycle through owned weapons in slot order. */
  cycle(dir = 1): boolean {
    const owned = WEAPON_ORDER.filter((id) => this.has(id));
    if (owned.length < 2) return false;
    const i = owned.indexOf(this.weapon.id);
    return this.switchTo(owned[(i + dir + owned.length) % owned.length]);
  }

  reload(): boolean {
    if (!this.canAct) return false;
    return this.weapon.reload();
  }
}

/**
 * Accelerate one velocity axis toward `target` by `acc`; beyond the target
 * speed in its direction, ice friction bleeds off the excess (recoil, turns).
 */
function drive(v: number, target: number, acc: number, fric: number): number {
  if (target > 0) return v < target ? Math.min(target, v + acc) : Math.max(target, v - fric);
  if (target < 0) return v > target ? Math.max(target, v - acc) : Math.min(target, v + fric);
  return approach0(v, fric);
}

function approach0(v: number, step: number): number {
  if (v > 0) return Math.max(0, v - step);
  if (v < 0) return Math.min(0, v + step);
  return 0;
}
