import * as THREE from 'three';
import { ctx } from '../game/ctx';
import { events } from '../game/events';
import { PlayerController } from './PlayerController';
import { ViewModel, VM_SCALE } from './ViewModel';
import { type Combatant, type HitInfo, type HitResult, emptyResult, newId, type DamageType } from '../game/Combat';
import type { PartHit } from '../characters/CharacterModel';
import type { Character } from '../characters/Character';
import { P } from '../characters/Rig';
import { clamp, rand, angleDiff, dampTo } from '../core/math';
import { QG, CG, groups, type RBody } from '../physics/Physics';
import type { CombatSystem } from '../game/CombatSystem';
import type { CameraFX } from '../fx/CameraFX';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const PROP_RAY = groups(0xffff, CG.PROP);

/** Weapon-in-hand interface implemented by the weapon system. */
export interface PlayerWeapon {
  id: string;
  name: string;
  damage: number;
  force: number;
  reach: number;
  speed: number;
  type: DamageType;
  twoHanded: boolean;
  heavy: boolean;
  moves: string[];
  arc: [number, number];
  arcPitch: [number, number];
  dismember: number;
  bleed: number;
  carve: number;
  stun: number;
  cleave: number;
  durability: number;
  maxDurability: number;
  carryOnly?: boolean;
  fpObject: THREE.Object3D;
  /** called when a swing connects (returns true if the weapon broke) */
  onHit(point: THREE.Vector3, dir: THREE.Vector3, hard: boolean): boolean;
}

interface AttackState {
  kind: string;
  anim: string;
  damage: number;
  force: number;
  lift: number;
  type: DamageType;
  reach: number;
  inflate: number;
  arc: [number, number];
  arcPitch: [number, number];
  /** height offset of ray origin from eye (kicks) */
  originDrop: number;
  hitStop: number;
  trauma: number;
  heavy: boolean;
  kick: boolean;
  carve: number;
  dismember: number;
  bleed: number;
  stun: number;
  cleave: number;
  window: number;
  activeT: number;
  active: boolean;
  done: boolean;
  hits: Set<Combatant>;
  weapon: PlayerWeapon | null;
  propHit: boolean;
  connected: boolean;
}

const COMBO = ['jabL', 'jabR', 'hookL', 'uppercutR'];

export class Player implements Combatant {
  readonly id = newId();
  readonly isPlayer = true;
  readonly name = 'You';
  readonly ctrl: PlayerController;
  readonly vm: ViewModel;
  alive = true;
  readonly position = new THREE.Vector3();
  readonly radius = 0.32;
  health = 100;
  maxHealth = 100;
  adrenaline = 0;
  rageTimer = 0;
  rageDuration = 12;
  lastDamageTime = -100;
  blocking = false;
  blockStart = -10;
  private blockHeld = 0;
  attack: AttackState | null = null;
  private recovery = 0;
  comboIndex = 0;
  private comboTimer = 0;
  charging = false;
  chargeT = 0;
  private attackHeld = 0;
  kickCooldown = 0;
  weapon: PlayerWeapon | null = null;
  grabbed: Character | null = null;
  grabTime = 0;
  carryingBody: Character | null = null;
  drinkTimer = 0;
  onDrinkDone: (() => void) | null = null;
  kills = 0;
  stats = { punches: 0, hits: 0, kills: 0, headshots: 0, decapitations: 0, headExplosions: 0, damageDealt: 0, damageTaken: 0, blocks: 0, parries: 0, kicks: 0, thrown: 0, bestCombo: 0, objectsBroken: 0 };
  combo = 0;
  comboDecay = 0;
  deathTime = -1;
  invulnTime = 0;
  drunk = 0;
  godMode = false;
  /** hooks set by the game */
  onAttackWhiff: ((heavy: boolean) => void) | null = null;
  camFx!: CameraFX;
  combat!: CombatSystem;

  constructor(spawn: THREE.Vector3, yaw: number) {
    this.ctrl = new PlayerController(spawn);
    this.ctrl.yaw = yaw;
    this.vm = new ViewModel({ skin: '#e2ac84', sleeve: '#4a2c1c', sleeveDark: '#2a180e', pants: '#2b3f66', boot: '#2a1a10' });
    this.vm.setBase('guard');
    this.position.copy(spawn);
  }

  get upright(): boolean {
    return this.alive;
  }

  get raging(): boolean {
    return this.rageTimer > 0;
  }

  invulnerable(): boolean {
    return this.ctrl.iframes > 0 || this.invulnTime > 0 || this.godMode;
  }

  headPosition(out: THREE.Vector3): THREE.Vector3 {
    return this.ctrl.eyePositionPhysics(out);
  }

  chestPosition(out: THREE.Vector3): THREE.Vector3 {
    this.ctrl.eyePositionPhysics(out);
    out.y -= 0.42;
    return out;
  }

  eye(out: THREE.Vector3): THREE.Vector3 {
    return this.ctrl.eyePositionPhysics(out);
  }

  aimDir(out: THREE.Vector3): THREE.Vector3 {
    return this.ctrl.forward(out);
  }

  /** player hit volume: head box + body box approximated as rays vs spheres/capsule */
  raycastHitbox(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number, inflate: number): PartHit | null {
    if (!this.alive) return null;
    const head = this.headPosition(_v);
    const r = 0.24 + inflate;
    // sphere test for head
    let best: PartHit | null = null;
    const test = (center: THREE.Vector3, rad: number, part: number) => {
      _v2.subVectors(center, origin);
      const tca = _v2.dot(dir);
      const d2 = _v2.lengthSq() - tca * tca;
      if (d2 > rad * rad) return;
      const thc = Math.sqrt(rad * rad - d2);
      const t = tca - thc;
      if (t < 0 || t > maxDist) return;
      if (best && t >= best.dist) return;
      best = { part, dist: t, local: new THREE.Vector3(), localNormal: new THREE.Vector3(), world: origin.clone().addScaledVector(dir, t), face: 4 };
    };
    test(head, r, P.HEAD);
    const chest = this.chestPosition(_v3);
    test(chest, 0.34 + inflate, P.TORSO);
    chest.y -= 0.45;
    test(chest, 0.32 + inflate, P.PELVIS);
    return best;
  }

  // ------------------------------------------------------------------ receiving damage
  receiveHit(hit: HitInfo): HitResult {
    const res = emptyResult(hit.part);
    if (!this.alive) return res;
    if (this.invulnerable() && hit.source === 'melee') return res;
    const att = hit.attacker;
    let dmg = hit.damage * (hit.part === P.HEAD ? 1.25 : 1);
    if (this.blocking && att && !hit.unblockable) {
      const yawTo = Math.atan2(-(att.position.x - this.position.x), -(att.position.z - this.position.z));
      const facing = Math.abs(angleDiff(this.ctrl.yaw, yawTo));
      if (facing < 1.2) {
        const now = ctx.time.elapsed;
        const parry = now - this.blockStart < 0.22 && !hit.heavy;
        res.blocked = true;
        res.parried = parry;
        this.stats.blocks++;
        if (parry) {
          this.stats.parries++;
          dmg = 0;
          (att as any).parried?.(this);
          ctx.time.slowMo(0.45, 0.3);
          this.camFx.addTrauma(0.15);
        } else {
          dmg *= this.weapon ? 0.25 : hit.heavy ? 0.45 : 0.18;
          if (this.weapon) this.weapon.onHit(hit.point, hit.dir, false);
          this.camFx.addTrauma(hit.heavy ? 0.3 : 0.12);
          this.camFx.kick(0.6, 0, 0);
          _v.copy(hit.dir).setY(0).normalize().multiplyScalar(hit.heavy ? 3.5 : 1.6);
          this.ctrl.addKnockback(_v);
          if (hit.heavy || hit.kick) {
            // guard broken
            this.blocking = false;
            this.blockHeld = -0.5;
            this.vm.jolt();
          }
        }
        events.emit('block', { target: this, attacker: att, pos: hit.point, parry });
      }
    }
    if (this.raging) dmg *= 0.5;
    if (this.godMode) dmg = 0;
    if (dmg > 0) {
      this.health -= dmg;
      this.stats.damageTaken += dmg;
      this.lastDamageTime = ctx.time.elapsed;
      this.combo = 0;
      if (!res.blocked) {
        this.camFx.addTrauma(clamp(dmg / 30, 0.15, 0.6));
        // snap view away from the blow
        const local = this.toLocal(hit.dir, _v2);
        this.camFx.kick(-local.z * 2.4 + rand(-0.5, 0.5), local.x * 2.0, local.x * 3.0);
        _v.copy(hit.dir).setY(0).normalize().multiplyScalar((hit.force / 85) * 0.8);
        this.ctrl.addKnockback(_v);
        this.vm.jolt();
        this.interruptAttack();
        if (this.drinkTimer > 0) this.cancelDrink();
      }
    }
    res.damage = dmg;
    events.emit('hit', { target: this, hit, result: res });
    if (this.health <= 0 && this.alive) {
      this.health = 0;
      this.die();
      res.killed = true;
    }
    return res;
  }

  private toLocal(dir: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    // camera space (x right, z back)
    const sy = Math.sin(this.ctrl.yaw),
      cy = Math.cos(this.ctrl.yaw);
    return out.set(dir.x * cy - dir.z * sy, dir.y, dir.x * sy + dir.z * cy);
  }

  die(): void {
    this.alive = false;
    this.deathTime = ctx.time.realElapsed;
    this.blocking = false;
    this.attack = null;
    this.releaseGrab();
    this.vm.setBase('hidden');
    events.emit('death', { victim: this, hit: null, cause: 'player' });
    ctx.time.slowMo(2.5, 0.25);
  }

  heal(amount: number): void {
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  addAdrenaline(a: number): void {
    if (this.raging) return;
    this.adrenaline = Math.min(100, this.adrenaline + a);
  }

  // ------------------------------------------------------------------ per-frame logic
  update(dt: number, realDt: number): void {
    const input = ctx.input;
    const c = this.ctrl;
    this.position.set(c.renderCenter.x, c.feetY, c.renderCenter.z);
    this.invulnTime = Math.max(0, this.invulnTime - dt);
    if (!this.alive) {
      this.vm.update(dt);
      return;
    }

    // regen
    if (ctx.time.elapsed - this.lastDamageTime > 5 && this.health < this.maxHealth) this.heal(dt * 2.5);
    if (this.raging) {
      this.rageTimer -= dt;
      if (this.rageTimer <= 0) this.rageTimer = 0;
    }
    if (this.comboDecay > 0) {
      this.comboDecay -= dt;
      if (this.comboDecay <= 0) this.combo = 0;
    }
    this.drunk = Math.max(0, this.drunk - dt * 0.015);
    this.kickCooldown = Math.max(0, this.kickCooldown - dt);
    this.recovery = Math.max(0, this.recovery - dt);
    this.comboTimer = Math.max(0, this.comboTimer - dt);
    if (this.comboTimer <= 0) this.comboIndex = 0;

    // ---- block
    const wantBlock = input.isDown('block') && !this.grabbed && !this.carryingBody && this.drinkTimer <= 0;
    if (wantBlock) this.blockHeld += dt;
    else this.blockHeld = Math.min(0, this.blockHeld + dt);
    const nowBlocking = wantBlock && this.blockHeld > 0.04 && !this.attack;
    if (nowBlocking && !this.blocking) this.blockStart = ctx.time.elapsed;
    this.blocking = nowBlocking;

    // ---- rage
    if (input.wasPressed('rage') && this.adrenaline >= 100 && !this.raging) this.activateRage();

    // ---- drinking
    if (this.drinkTimer > 0) {
      this.drinkTimer -= dt;
      if (this.drinkTimer <= 0) {
        this.onDrinkDone?.();
        this.onDrinkDone = null;
      }
    }

    // ---- attack input
    const attackPressed = input.wasPressed('attack');
    const attackDown = input.isDown('attack');
    if (attackDown) this.attackHeld += dt;
    if (this.grabbed) {
      this.updateGrab(dt);
      if (attackPressed && !this.attack && this.recovery <= 0) this.startGrabPunch();
    } else if (this.carryingBody) {
      this.updateCarryBody(dt);
      if (attackPressed || input.wasPressed('throw')) this.throwBody();
    } else if (this.drinkTimer <= 0) {
      if (!this.weapon || !this.weapon.carryOnly) {
        if (attackPressed && !this.blocking) this.queueAttack();
        // charging (unarmed: hold to wind up a haymaker; weapons: heavy overhead)
        if (this.charging) {
          this.chargeT += dt;
          this.vm.setTremble(clamp(this.chargeT / 0.9, 0, 1));
          this.camFx.rumble = clamp(this.chargeT / 0.9, 0, 1);
          if (!attackDown) this.releaseCharge();
        } else if (attackDown && this.attackHeld > 0.22 && !this.attack && this.recovery <= 0 && !this.blocking) {
          this.beginCharge();
        }
      }
    }
    if (!attackDown) this.attackHeld = 0;

    // ---- kick / stomp
    if (input.wasPressed('kick') && this.kickCooldown <= 0 && !this.attack && this.drinkTimer <= 0) {
      if (this.grabbed) this.kickGrabbed();
      else if (c.pitch < -0.6 && this.findStompTarget()) this.startStomp();
      else this.startKick();
    }

    // ---- active attack
    if (this.attack) this.updateAttack(dt);

    // ---- stance for viewmodel
    if (!this.attack && !this.charging) {
      if (this.blocking) this.vm.setBase('block');
      else if (this.grabbed) this.vm.setBase('grab');
      else if (this.carryingBody) this.vm.setBase('carryHeavy');
      else if (this.weapon) this.vm.setBase(this.weapon.carryOnly ? 'carryHeavy' : this.weapon.twoHanded ? 'carry2h' : 'carry1h');
      else this.vm.setBase('guard');
    }
    // movement modifiers
    let speedScale = 1;
    if (this.blocking) speedScale *= 0.55;
    if (this.charging) speedScale *= 0.7;
    if (this.weapon?.heavy || this.weapon?.carryOnly) speedScale *= 0.82;
    if (this.carryingBody) speedScale *= 0.75;
    if (this.raging) speedScale *= 1.15;
    c.speedScale = speedScale;

    // viewmodel sway from look
    this.vm.bob.phase = c.bobPhase;
    this.vm.bob.amount = c.bobAmount;
    this.vm.update(dt);
    void realDt;
  }

  // ------------------------------------------------------------------ attacks
  private queueAttack(): void {
    if (this.attack && !this.attack.done) {
      // buffered: allow chaining once the hit has happened
      if (this.attack.connected || this.attack.activeT > this.attack.window) this.pendingAttack = true;
      return;
    }
    if (this.recovery > 0.06) {
      this.pendingAttack = true;
      return;
    }
    this.startAttack(false);
  }
  private pendingAttack = false;

  private beginCharge(): void {
    this.charging = true;
    this.chargeT = 0;
    if (!this.weapon) this.vm.play('chargeR');
    else this.vm.play(this.weapon.twoHanded ? 'overhead2h' : 'overhead', { speed: 0.6 });
    this.vm.hold(this.weapon ? (this.weapon.twoHanded ? 0.24 : 0.14) : 0.35);
  }

  private releaseCharge(): void {
    this.charging = false;
    this.vm.setTremble(0);
    this.camFx.rumble = 0;
    const power = clamp(this.chargeT / 0.85, 0.25, 1);
    this.startAttack(true, power);
  }

  private startAttack(charged: boolean, power = 1): void {
    const w = this.weapon;
    const rage = this.raging ? 1 : 0;
    let st: AttackState;
    const base = {
      lift: 0,
      originDrop: 0,
      heavy: false,
      kick: false,
      carve: 1,
      dismember: 0,
      bleed: 0,
      stun: 0,
      cleave: 1,
      window: 0.06,
      activeT: 0,
      active: false,
      done: false,
      hits: new Set<Combatant>(),
      weapon: w,
      propHit: false,
      connected: false,
    };
    if (!w) {
      if (charged) {
        st = {
          ...base,
          kind: 'haymaker',
          anim: 'haymakerR',
          damage: 18 + 26 * power,
          force: 300 + 420 * power,
          type: 'blunt',
          reach: 1.45,
          inflate: 0.1,
          arc: [6, -6],
          arcPitch: [0, 0],
          hitStop: 0.09 + 0.05 * power,
          trauma: 0.3 + 0.2 * power,
          heavy: power > 0.6,
          carve: 1.4,
          dismember: power > 0.9 ? 1.2 : 0,
          stun: 0.4,
        };
        this.comboIndex = 0;
      } else {
        const kind = this.ctrl.crouching || (!this.ctrl.grounded && Math.random() < 0.6) ? 'uppercutR' : COMBO[this.comboIndex % COMBO.length];
        const isHook = kind.startsWith('hook');
        const isUpper = kind.startsWith('uppercut');
        st = {
          ...base,
          kind,
          anim: kind,
          damage: isUpper ? 15 : isHook ? 13 : kind === 'jabR' ? 10 : 8,
          force: isUpper ? 300 : isHook ? 220 : kind === 'jabR' ? 150 : 110,
          lift: isUpper ? 0.9 : 0,
          type: 'blunt',
          reach: isHook ? 1.3 : 1.38,
          inflate: 0.07,
          arc: isHook ? (kind === 'hookL' ? [-22, 14] : [22, -14]) : [0, 0],
          arcPitch: isUpper ? [-8, 6] : [0, 0],
          hitStop: isUpper ? 0.075 : isHook ? 0.06 : 0.04,
          trauma: isUpper ? 0.26 : isHook ? 0.2 : 0.11,
          heavy: false,
          stun: isUpper ? 0.3 : 0,
        };
        this.comboIndex++;
        this.comboTimer = 0.62;
      }
    } else {
      const moves = w.moves;
      const anim = charged ? (w.twoHanded ? 'overhead2h' : 'overhead') : moves[this.comboIndex % moves.length];
      this.comboIndex++;
      this.comboTimer = 0.8;
      const pw = charged ? 1.35 + 0.4 * power : 1;
      st = {
        ...base,
        kind: 'weapon',
        anim,
        damage: w.damage * pw,
        force: w.force * pw,
        type: w.type,
        reach: w.reach,
        inflate: w.type === 'pierce' ? 0.04 : 0.09,
        arc: anim === 'stab' || anim.startsWith('overhead') ? [0, 0] : anim === 'swingB' ? [-w.arc[0], -w.arc[1]] : w.arc,
        arcPitch: anim.startsWith('overhead') ? [22, -18] : w.arcPitch,
        hitStop: w.heavy ? 0.1 : 0.06,
        trauma: w.heavy ? 0.35 : 0.2,
        heavy: w.heavy || charged,
        carve: w.carve,
        dismember: w.dismember * (charged ? 1.4 : 1),
        bleed: w.bleed,
        stun: w.stun,
        cleave: w.cleave,
        window: anim.startsWith('swing') ? 0.09 : 0.06,
      };
    }
    if (rage) {
      st.damage *= 2.3;
      st.force *= 1.8;
      st.carve *= 2.2;
      st.dismember = Math.max(st.dismember, 1.5);
      st.hitStop *= 1.3;
    }
    this.attack = st;
    this.stats.punches++;
    this.pendingAttack = false;
    const speed = (w ? w.speed : 1) * (this.raging ? 1.25 : 1);
    this.vm.play(st.anim, {
      speed,
      onEvent: (n) => {
        if (n === 'hit' && this.attack === st) {
          st.active = true;
          st.activeT = 0;
          this.doHitCheck(st);
        }
      },
    });
    // camera: slight lean into the swing
    const side = st.anim.endsWith('L') ? -1 : 1;
    this.camFx.kick(-0.25, -side * 0.35, side * 0.4);
    events.emit('vocal', { who: this, kind: st.heavy ? 'effort' : 'grunt', pos: this.position, pitch: 1 });
    this.recovery = (w ? 0.42 / w.speed : st.kind === 'haymaker' ? 0.45 : 0.24) / (this.raging ? 1.25 : 1);
  }

  private startKick(): void {
    const rage = this.raging;
    const st: AttackState = {
      kind: 'kick',
      anim: 'kick',
      damage: 11 * (rage ? 2 : 1),
      force: 560 * (rage ? 1.8 : 1),
      lift: 0.35,
      type: 'blunt',
      reach: 1.65,
      inflate: 0.16,
      arc: [-14, 14],
      arcPitch: [-6, -6],
      originDrop: 0.55,
      hitStop: 0.08,
      trauma: 0.32,
      heavy: true,
      kick: true,
      carve: 0.6,
      dismember: 0,
      bleed: 0,
      stun: 0.5,
      cleave: 3,
      window: 0.08,
      activeT: 0,
      active: false,
      done: false,
      hits: new Set(),
      weapon: null,
      propHit: false,
      connected: false,
    };
    this.attack = st;
    this.kickCooldown = 0.62;
    this.stats.kicks++;
    this.vm.play('kick', {
      onEvent: (n) => {
        if (n === 'hit' && this.attack === st) {
          st.active = true;
          this.doHitCheck(st);
        }
      },
    });
    this.camFx.kick(0.3, 0, 0);
    events.emit('vocal', { who: this, kind: 'effort', pos: this.position, pitch: 1 });
    this.recovery = 0.45;
  }

  private stompTarget: Character | null = null;
  private findStompTarget(): boolean {
    this.stompTarget = null;
    const eye = this.eye(_v);
    const dir = this.aimDir(_dir);
    const th = this.combat.rayHit(eye, dir, 2.4, 0.12, (c) => c === this || c.upright);
    if (th) {
      this.stompTarget = th.target as Character;
      return true;
    }
    return false;
  }

  private startStomp(): void {
    const st: AttackState = {
      kind: 'stomp',
      anim: 'stomp',
      damage: 22 * (this.raging ? 2 : 1),
      force: 260,
      lift: -0.5,
      type: 'crush',
      reach: 2.4,
      inflate: 0.14,
      arc: [0, 0],
      arcPitch: [0, 0],
      originDrop: 0,
      hitStop: 0.1,
      trauma: 0.4,
      heavy: true,
      kick: false,
      carve: 2.2,
      dismember: 0.8,
      bleed: 0,
      stun: 0,
      cleave: 1,
      window: 0.05,
      activeT: 0,
      active: false,
      done: false,
      hits: new Set(),
      weapon: null,
      propHit: false,
      connected: false,
    };
    this.attack = st;
    this.kickCooldown = 0.55;
    this.vm.play('stomp', {
      onEvent: (n) => {
        if (n === 'hit' && this.attack === st) {
          st.active = true;
          this.doHitCheck(st);
        }
      },
    });
    this.recovery = 0.45;
  }

  private interruptAttack(): void {
    if (this.attack && !this.attack.connected) {
      this.attack = null;
      this.vm.stop();
    }
    this.charging = false;
    this.vm.setTremble(0);
    this.camFx.rumble = 0;
  }

  private updateAttack(dt: number): void {
    const st = this.attack!;
    if (st.active && !st.done) {
      st.activeT += dt;
      if (st.activeT <= st.window) this.doHitCheck(st);
      else {
        st.done = true;
        if (!st.connected && !st.propHit) {
          this.onAttackWhiff?.(st.heavy);
          const eye = this.eye(_v);
          events.emit('whiff', { attacker: this, pos: eye.clone().addScaledVector(this.aimDir(_dir), 0.8), heavy: st.heavy });
        }
      }
    }
    if (!this.vm.playing || (st.done && this.vm.playing !== st.anim)) {
      this.attack = null;
      if (this.pendingAttack && !this.blocking) {
        this.pendingAttack = false;
        this.startAttack(false);
      }
    } else if (st.done && this.pendingAttack && this.recovery <= 0.05) {
      this.pendingAttack = false;
      this.attack = null;
      this.startAttack(false);
    }
  }

  /** Swept ray test along the attack arc for this frame. */
  private doHitCheck(st: AttackState): void {
    const eye = this.eye(_v3.set(0, 0, 0));
    eye.y -= st.originDrop;
    const c = this.ctrl;
    const t = clamp(st.activeT / Math.max(st.window, 1e-3), 0, 1);
    const rays = st.arc[0] === st.arc[1] ? 5 : 7;
    const yawA = st.arc[0] + (st.arc[1] - st.arc[0]) * Math.max(0, t - 0.34);
    const yawB = st.arc[0] + (st.arc[1] - st.arc[0]) * Math.min(1, t + 0.34);
    const pitchA = st.arcPitch[0] + (st.arcPitch[1] - st.arcPitch[0]) * t;
    const maxTargets = st.cleave;
    const candidates: { target: Combatant; hit: PartHit }[] = [];
    for (let i = 0; i < rays; i++) {
      let yawOff: number;
      let pitchOff = pitchA;
      if (st.arc[0] === st.arc[1]) {
        // aim assist cross pattern
        const pat = [
          [0, 0],
          [3.5, 0],
          [-3.5, 0],
          [0, 3.5],
          [0, -4.5],
        ][i];
        yawOff = pat[0];
        pitchOff += pat[1];
      } else yawOff = yawA + ((yawB - yawA) * i) / (rays - 1);
      _e.set(c.pitch + (pitchOff * Math.PI) / 180, c.yaw + (-yawOff * Math.PI) / 180, 0, 'YXZ');
      _dir.set(0, 0, -1).applyEuler(_e);
      const th = this.combat.rayHit(eye, _dir, st.reach, st.inflate, (cb) => cb === this || st.hits.has(cb));
      if (th) {
        // world occlusion: is there a wall between?
        const wall = ctx.physics.raycast(eye, _dir, th.hit.dist, QG.WORLD);
        if (wall) continue;
        if (!candidates.some((k) => k.target === th.target)) candidates.push({ target: th.target, hit: th.hit });
        else {
          const k = candidates.find((k) => k.target === th.target)!;
          // prefer head hits
          if (th.hit.part === P.HEAD && k.hit.part !== P.HEAD) k.hit = th.hit;
        }
      }
    }
    // magnetism for unarmed jabs: nearest upright enemy in a narrow cone
    if (candidates.length === 0 && st.kind !== 'stomp' && !st.hits.size) {
      this.aimDir(_dir);
      let best: Combatant | null = null;
      let bestScore = Infinity;
      for (const cb of this.combat.list) {
        if (cb === this || !cb.upright || st.hits.has(cb)) continue;
        cb.chestPosition(_v);
        _v2.subVectors(_v, eye);
        const dist = _v2.length();
        if (dist > st.reach + 0.45) continue;
        _v2.multiplyScalar(1 / dist);
        const ang = Math.acos(clamp(_v2.dot(_dir), -1, 1));
        if (ang > 0.36) continue;
        const score = ang * 2 + dist;
        if (score < bestScore) {
          bestScore = score;
          best = cb;
        }
      }
      if (best) {
        best.headPosition(_v);
        const toHead = _v2.subVectors(_v, eye).normalize();
        const useHead = toHead.dot(_dir) > 0.97;
        if (!useHead) best.chestPosition(_v);
        _v2.subVectors(_v, eye);
        const d = _v2.length();
        _v2.normalize();
        const h = best.raycastHitbox(eye, _v2, d + 0.6, 0.15);
        if (h && !ctx.physics.raycast(eye, _v2, h.dist, QG.WORLD)) candidates.push({ target: best, hit: { ...h, local: h.local.clone(), localNormal: h.localNormal.clone(), world: h.world.clone() } });
      }
    }
    candidates.sort((a, b) => a.hit.dist - b.hit.dist);
    for (const cand of candidates) {
      if (st.hits.size >= maxTargets) break;
      st.hits.add(cand.target);
      this.applyHit(st, cand.target, cand.hit);
    }
    // props in the way (only when no character connected this frame)
    if (!st.propHit && candidates.length === 0) {
      this.aimDir(_dir);
      if (st.originDrop > 0) _dir.y -= 0.25;
      _dir.normalize();
      const ph = ctx.physics.sphereCast(eye, _dir, st.kick ? 0.22 : 0.12, st.reach, PROP_RAY);
      if (ph) {
        st.propHit = true;
        const owner = ctx.physics.ownerOf(ph.collider);
        const imp = st.force * (st.kick ? 0.12 : 0.05);
        ctx.props?.hitProp(ph.collider, ph.point, _dir, imp, st.damage, st.weapon ? st.weapon.type : 'blunt', this);
        if (owner) {
          this.camFx.addTrauma(st.trauma * 0.6);
          ctx.time.hitStop(st.hitStop * 0.6);
          if (st.weapon) {
            const broke = st.weapon.onHit(ph.point, _dir, true);
            if (broke) this.weaponBroke();
          }
        }
      } else if (!st.connected) {
        // wall punch
        const wh = ctx.physics.raycast(eye, _dir, st.reach * 0.9, QG.WORLD);
        if (wh && st.activeT <= 0.0001) {
          st.propHit = true;
          events.emit('impact', { pos: wh.point, normal: wh.normal, material: wh.owner?.material ?? 'wood', strength: st.heavy ? 0.8 : 0.4, otherMaterial: st.weapon ? 'wood' : 'flesh' });
          this.camFx.addTrauma(0.15);
          this.camFx.kick(0.6, 0, 0);
          ctx.time.hitStop(0.04);
        }
      }
    }
  }

  private applyHit(st: AttackState, target: Combatant, ph: PartHit): void {
    const eye = this.eye(_v);
    const dir = _v2.subVectors(ph.world, eye).normalize();
    if (st.kick) dir.y = Math.max(dir.y, 0.05);
    const crit = ph.part === P.HEAD && Math.random() < (st.heavy ? 0.25 : 0.12);
    const hit: HitInfo = {
      attacker: this,
      damage: st.damage * (0.9 + Math.random() * 0.2),
      type: st.type,
      part: ph.part,
      point: ph.world.clone(),
      dir: dir.clone(),
      force: st.force,
      source: st.kind === 'stomp' ? 'stomp' : this.raging ? 'rage' : 'melee',
      local: ph.local,
      localNormal: ph.localNormal,
      face: ph.face,
      weaponId: st.weapon?.id ?? null,
      kick: st.kick,
      heavy: st.heavy,
      crit,
      lift: st.lift,
      carve: st.carve,
      stun: st.stun,
      dismember: st.dismember,
      bleed: st.bleed,
      unblockable: st.kind === 'stomp' || st.kind === 'grabPunch',
      knockdown: st.kind === 'haymaker' && st.heavy && Math.random() < 0.5,
    };
    const res = target.receiveHit(hit);
    st.connected = true;
    this.stats.hits++;
    if (ph.part === P.HEAD) this.stats.headshots++;
    this.stats.damageDealt += res.damage;
    this.addAdrenaline(res.damage * 0.35);
    // feedback
    const killBonus = res.killed ? 1 : 0;
    let stop = st.hitStop + killBonus * 0.05;
    if (res.blocked) stop *= 0.6;
    ctx.time.hitStop(stop);
    this.camFx.addTrauma(st.trauma + killBonus * 0.15);
    this.camFx.push(0, 0, st.kick ? 0.0 : -0.05);
    this.camFx.kick(0.45 + (st.heavy ? 0.6 : 0), 0, 0);
    if (st.heavy) this.camFx.fovPunch(-6);
    if (!st.weapon && !res.blocked) this.vm.bloodyKnuckles(res.damage / 10);
    if (res.headDestroyed || res.decapitated) {
      ctx.time.slowMo(0.9, 0.2);
      this.camFx.fovPunch(-10);
    }
    if (!res.blocked) {
      this.combo++;
      this.comboDecay = 2.2;
      this.stats.bestCombo = Math.max(this.stats.bestCombo, this.combo);
    }
    if (st.weapon && !res.parried) {
      const broke = st.weapon.onHit(ph.world, dir, st.heavy);
      if (broke) this.weaponBroke();
    }
    if (res.parried) {
      // got parried: stagger self
      this.recovery = 0.7;
      this.camFx.addTrauma(0.3);
      this.vm.jolt();
    }
  }

  weaponBroke(): void {
    this.stats.objectsBroken++;
    // weapon system replaces/removes this.weapon
  }

  // ------------------------------------------------------------------ grab
  tryGrab(target: Character): boolean {
    if (this.grabbed || this.weapon || !target.alive) return false;
    // easier to grab staggered / hurt / from behind
    const behind = Math.abs(angleDiff(target.yaw, target.yawTo(this.position))) > 2.0;
    const chanceOk = target.stunTimer > 0 || target.healthFrac < 0.45 || behind || target.state === 'gettingUp' || !target.combatMode || Math.random() < 0.35;
    if (!chanceOk) return false;
    this.grabbed = target;
    this.grabTime = 0;
    target.grabbedBy = this;
    target.blocking = false;
    target.animator.stopAction(false);
    target.setExpression('scared', 0);
    this.vm.setBase('grab');
    return true;
  }

  private updateGrab(dt: number): void {
    const t = this.grabbed!;
    this.grabTime += dt;
    if (!t.alive || t.state !== 'active' && t.state !== 'gettingUp') {
      this.releaseGrab();
      return;
    }
    // escape after a while unless badly hurt
    const hold = 2.5 + (1 - t.healthFrac) * 4;
    if (this.grabTime > hold) {
      this.releaseGrab();
      t.stunTimer = 0;
      return;
    }
    if (ctx.input.wasPressed('interact') || ctx.input.wasPressed('drop')) {
      this.releaseGrab();
      return;
    }
    if (ctx.input.wasPressed('throw')) this.throwGrabbed();
  }

  /** called from fixed update: pin the grabbed character in front of us */
  fixedGrab(): void {
    const t = this.grabbed;
    if (!t) return;
    const c = this.ctrl;
    const f = c.flatForward(_v);
    const tp = c.body.translation();
    const target = _v2.set(tp.x + f.x * 0.78, 0, tp.z + f.z * 0.78);
    const cur = t.body.translation();
    const vx = (target.x - cur.x) * 14;
    const vz = (target.z - cur.z) * 14;
    t.body.setLinvel({ x: vx, y: t.body.linvel().y, z: vz }, true);
    t.desiredYaw = Math.atan2(-f.x, -f.z);
    t.stunTimer = Math.max(t.stunTimer, 0.2);
  }

  releaseGrab(): void {
    const t = this.grabbed;
    if (!t) return;
    t.grabbedBy = null;
    this.grabbed = null;
    if (t.alive) t.setExpression('angry', 0);
  }

  private startGrabPunch(): void {
    const st: AttackState = {
      kind: 'grabPunch',
      anim: 'grabPunch',
      damage: 13 * (this.raging ? 2.2 : 1),
      force: 40,
      lift: 0,
      type: 'blunt',
      reach: 1.6,
      inflate: 0.12,
      arc: [0, 0],
      arcPitch: [0, 0],
      originDrop: 0,
      hitStop: 0.06,
      trauma: 0.2,
      heavy: false,
      kick: false,
      carve: 1.3,
      dismember: 0,
      bleed: 0,
      stun: 0.4,
      cleave: 1,
      window: 0.04,
      activeT: 0,
      active: false,
      done: false,
      hits: new Set(),
      weapon: null,
      propHit: false,
      connected: false,
    };
    this.attack = st;
    this.stats.punches++;
    this.vm.play('grabPunch', {
      onEvent: (n) => {
        if (n !== 'hit' || this.attack !== st || !this.grabbed) return;
        st.active = true;
        st.done = true;
        const t = this.grabbed;
        const eye = this.eye(_v);
        t.model.updateMatrices();
        const head = t.model.partCenter(P.HEAD, _v3);
        const dir = _dir.subVectors(head, eye).normalize();
        const h = t.raycastHitbox(eye, dir, 3, 0.1);
        if (h) {
          this.applyHit(st, t, { ...h, local: h.local.clone(), localNormal: h.localNormal.clone(), world: h.world.clone() });
          t.stunTimer = Math.max(t.stunTimer, 0.6);
        }
      },
    });
    this.recovery = 0.22;
  }

  private throwGrabbed(): void {
    const t = this.grabbed!;
    this.releaseGrab();
    const dir = this.aimDir(_dir).clone();
    dir.y = Math.max(dir.y + 0.25, 0.15);
    dir.normalize();
    const force = 900 * (this.raging ? 1.6 : 1);
    t.knockDown(
      { attacker: this, damage: 6, type: 'force', part: P.TORSO, point: t.chestPosition(new THREE.Vector3()), dir, force, source: 'melee' },
      dir.clone().multiplyScalar(force / t.stats.mass),
      P.TORSO,
    );
    t.lastAttacker = this;
    this.stats.thrown++;
    this.camFx.addTrauma(0.25);
    this.camFx.kick(0.4, 0, 0);
    events.emit('vocal', { who: this, kind: 'effort', pos: this.position, pitch: 1 });
    this.vm.play('throwHeavy');
  }

  private kickGrabbed(): void {
    const t = this.grabbed!;
    this.releaseGrab();
    this.startKick();
    t.stunTimer = 0.4;
  }

  // ------------------------------------------------------------------ carrying bodies (ragdolls)
  pickUpBody(c: Character): boolean {
    if (this.weapon || this.grabbed || !c.ragdoll) return false;
    this.carryingBody = c;
    this.vm.setBase('carryHeavy');
    return true;
  }

  private updateCarryBody(_dt: number): void {
    const c = this.carryingBody!;
    if (!c.ragdoll || c.removed) {
      this.carryingBody = null;
      return;
    }
    if (ctx.input.wasPressed('interact') || ctx.input.wasPressed('drop')) this.carryingBody = null;
  }

  fixedCarry(): void {
    const c = this.carryingBody;
    if (!c || !c.ragdoll) return;
    const torso: RBody | null = c.ragdoll.bodies[P.TORSO] ?? c.ragdoll.bodies[P.PELVIS];
    if (!torso) return;
    const eye = this.ctrl.eyePositionPhysics(_v);
    const f = this.aimDir(_dir);
    const target = _v2.copy(eye).addScaledVector(f, 1.0);
    target.y -= 0.35;
    const p = torso.translation();
    const lv = torso.linvel();
    const k = 18;
    torso.setLinvel({ x: (target.x - p.x) * k * 0.9 + lv.x * 0.1, y: (target.y - p.y) * k * 0.9 + lv.y * 0.1, z: (target.z - p.z) * k * 0.9 + lv.z * 0.1 }, true);
    const av = torso.angvel();
    torso.setAngvel({ x: av.x * 0.8, y: av.y * 0.8, z: av.z * 0.8 }, true);
  }

  private throwBody(): void {
    const c = this.carryingBody!;
    this.carryingBody = null;
    if (!c.ragdoll) return;
    const dir = this.aimDir(_dir).clone();
    dir.y += 0.2;
    dir.normalize();
    c.ragdoll.applyImpulseAll(dir.multiplyScalar(650 * (this.raging ? 1.5 : 1)), P.TORSO, 0.3);
    c.lastAttacker = this;
    this.stats.thrown++;
    this.vm.play('throwHeavy');
    events.emit('vocal', { who: this, kind: 'effort', pos: this.position, pitch: 1 });
  }

  // ------------------------------------------------------------------ rage
  activateRage(): void {
    this.rageTimer = this.rageDuration;
    this.adrenaline = 0;
    this.vm.play('rageRoar');
    ctx.time.slowMo(0.8, 0.25);
    this.camFx.addTrauma(0.6);
    this.camFx.fovPunch(12);
    events.emit('vocal', { who: this, kind: 'taunt', pos: this.position, pitch: 0.8 });
    // shockwave
    const near: Combatant[] = [];
    this.combat.nearby(this.position, 4.5, near, (c) => c !== this && c.upright);
    for (const c of near) {
      const d = _v.subVectors(c.position, this.position);
      const dist = Math.max(0.3, d.length());
      d.y = 0;
      d.normalize();
      d.y = 0.35;
      c.receiveHit({ attacker: this, damage: 10, type: 'force', part: P.TORSO, point: c.chestPosition(new THREE.Vector3()), dir: d.clone().normalize(), force: 900 / Math.max(1, dist * 0.6), source: 'rage', knockdown: true, carve: 0 });
    }
    events.emit('noise', { pos: this.position.clone(), radius: 25, kind: 'shout', source: this });
  }

  // ------------------------------------------------------------------ drinks
  startDrink(heal: number, onDone: () => void): void {
    this.drinkTimer = 1.2;
    this.vm.play('drink');
    this.onDrinkDone = () => {
      this.heal(heal);
      this.drunk = Math.min(1, this.drunk + 0.18);
      onDone();
    };
  }

  cancelDrink(): void {
    this.drinkTimer = 0;
    this.onDrinkDone = null;
  }

  // ------------------------------------------------------------------ fixed step
  fixedUpdate(dt: number): void {
    if (!this.alive) {
      this.ctrl.intent.x = this.ctrl.intent.z = 0;
      this.ctrl.intent.sprint = false;
    }
    this.ctrl.fixedUpdate(dt);
    this.fixedGrab();
    this.fixedCarry();
  }

  /** View model placement: attach to camera each frame. */
  attachViewModel(camera: THREE.Camera): void {
    if (this.vm.root.parent !== camera) camera.add(this.vm.root);
    void VM_SCALE;
  }

  // used by NPC AI to know if the player is mid-swing
  get isAttacking(): boolean {
    return !!this.attack && !this.attack.done;
  }

  get isWindingUp(): boolean {
    return this.charging;
  }

  get speed(): number {
    return this.ctrl.horizSpeed;
  }

  smoothHealth = 100;
  updateHud(dt: number): void {
    this.smoothHealth = dampTo(this.smoothHealth, this.health, 6, dt);
  }
}

// avoid unused import warnings for future use
void _q;
