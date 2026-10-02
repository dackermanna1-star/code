/**
 * Living entities: health, damage pipeline, armor, status effects, knockback, drowning,
 * fire, fall damage, death. Mobs and the player extend this.
 */
import * as THREE from 'three';
import { Entity, type DamageSource, type DamageType } from './entity';
import { BLOCKS, T_FULL_CUBE } from '../world/blocks/registry';

export interface StatusEffect {
  id: string;
  amplifier: number;
  /** Remaining ticks (-1 = infinite). */
  duration: number;
  ambient?: boolean;
  showParticles?: boolean;
}

/** Damage modifier hooks (enchantments, difficulty scaling ...). Return the new amount. */
export type DamageModifier = (target: LivingEntity, source: DamageSource, amount: number) => number;
export const DAMAGE_MODIFIERS: DamageModifier[] = [];
/** Called when any living entity takes damage (blood, wounds, sounds, stats). */
export type HurtListener = (target: LivingEntity, source: DamageSource, amount: number) => void;

const BYPASS_ARMOR: DamageType[] = ['fall', 'drown', 'starve', 'void', 'magic', 'wither', 'poison', 'suffocate', 'kill', 'freeze'];

export interface MoveIntent {
  forward: number; // -1..1
  strafe: number; // -1..1 (+ = right)
  jump: boolean;
  sneak: boolean;
  sprint: boolean;
}

export abstract class LivingEntity extends Entity {
  health = 20;
  maxHealth = 20;
  absorption = 0;
  hurtTime = 0;
  hurtDuration = 10;
  invulnerableTime = 0;
  lastDamage = 0;
  deathTime = 0;
  dead = false;
  air = 300;
  maxAir = 300;
  /** Movement speed in blocks/second (walking). */
  walkSpeed = 4.317;
  readonly effects = new Map<string, StatusEffect>();
  readonly intent: MoveIntent = { forward: 0, strafe: 0, jump: false, sneak: false, sprint: false };
  /** Body rotation (rendering), follows movement. */
  bodyYaw = 0;
  prevBodyYaw = 0;
  /** Head yaw for rendering (relative look). */
  headYaw = 0;
  /** Limb swing animation state. */
  limbSwing = 0;
  limbSwingAmount = 0;
  prevLimbSwingAmount = 0;
  /** Arm swing (attack animation) 0..1 progress, -1 idle. */
  swingProgress = -1;
  swingTicks = 0;
  /** Recently applied knockback/impact for animation (world space impulse vector). */
  readonly impact = new THREE.Vector3();
  jumpCooldown = 0;
  lastAttacker: Entity | null = null;
  lastHurtByTick = 0;
  /** Equipment: mainhand, offhand, feet, legs, chest, head (ItemStack | null) */
  readonly equipment: any[] = [null, null, null, null, null, null];
  knockbackResistance = 0;
  static hurtListeners: HurtListener[] = [];
  static deathListeners: ((e: LivingEntity, src: DamageSource) => void)[] = [];

  hasEffect(id: string) {
    return this.effects.has(id);
  }
  effectLevel(id: string): number {
    const e = this.effects.get(id);
    return e ? e.amplifier + 1 : 0;
  }
  addEffect(id: string, duration: number, amplifier = 0, ambient = false) {
    const ex = this.effects.get(id);
    if (ex && (ex.amplifier > amplifier || (ex.amplifier === amplifier && ex.duration > duration))) return;
    this.effects.set(id, { id, duration, amplifier, ambient, showParticles: !ambient });
    this.onEffectAdded(id);
  }
  removeEffect(id: string) {
    if (this.effects.delete(id)) this.onEffectRemoved(id);
  }
  protected onEffectAdded(_id: string) {}
  protected onEffectRemoved(_id: string) {}

  /** Armor points (0-20) — overridden by entities with equipment. */
  get armorValue(): number {
    return 0;
  }
  get armorToughness(): number {
    return 0;
  }

  get alive() {
    return !this.dead && this.health > 0;
  }

  heal(n: number) {
    if (this.dead) return;
    this.health = Math.min(this.maxHealth, this.health + n);
  }

  /** Is the entity immune to this damage right now? */
  protected isInvulnerableTo(_src: DamageSource): boolean {
    return false;
  }

  override hurt(src: DamageSource, amount: number): boolean {
    if (this.dead || amount <= 0) return false;
    if (this.isInvulnerableTo(src)) return false;
    if ((src.type === 'fire' || src.type === 'lava') && this.hasEffect('fire_resistance')) return false;
    // invulnerability frames
    if (this.invulnerableTime > this.hurtDuration / 2 && src.type !== 'void' && src.type !== 'kill') {
      if (amount <= this.lastDamage) return false;
      const diff = amount - this.lastDamage;
      this.lastDamage = amount;
      amount = diff;
    } else {
      this.lastDamage = amount;
      this.invulnerableTime = 20;
      this.hurtTime = this.hurtDuration;
    }
    // armor
    const bypass = src.bypassArmor || BYPASS_ARMOR.includes(src.type);
    if (!bypass) {
      const def = this.armorValue, tough = this.armorToughness;
      const f = Math.min(20, Math.max(def / 5, def - (4 * amount) / (tough + 8)));
      amount *= 1 - f / 25;
      this.onArmorDamaged(src, amount);
    }
    // resistance
    const res = this.effectLevel('resistance');
    if (res > 0 && src.type !== 'void' && src.type !== 'kill') amount *= Math.max(0, 1 - 0.2 * res);
    for (const m of DAMAGE_MODIFIERS) amount = m(this, src, amount);
    if (amount <= 0) return false;
    // absorption
    if (this.absorption > 0) {
      const a = Math.min(this.absorption, amount);
      this.absorption -= a;
      amount -= a;
    }
    this.health -= amount;
    this.lastAttacker = src.attacker ?? this.lastAttacker;
    this.lastHurtByTick = this.age;
    if (src.dir) this.impact.copy(src.dir).multiplyScalar(src.impulse ?? 1);
    for (const l of LivingEntity.hurtListeners) l(this, src, amount);
    this.game?.events.emit('entityHurt', { entity: this, source: src, amount });
    if (this.health <= 0) this.die(src);
    return true;
  }

  protected onArmorDamaged(_src: DamageSource, _amount: number) {}

  /** Minecraft knockback (strength ~0.4 for a normal hit). dir = from attacker toward target. */
  knockback(strength: number, dirX: number, dirZ: number) {
    strength *= 1 - this.knockbackResistance;
    if (strength <= 0) return;
    const l = Math.hypot(dirX, dirZ) || 1;
    // per-tick velocities converted to b/s
    this.vel.x = this.vel.x / 2 + (dirX / l) * strength * 20;
    this.vel.z = this.vel.z / 2 + (dirZ / l) * strength * 20;
    if (this.onGround) this.vel.y = Math.min(0.4 * 20, this.vel.y / 2 + strength * 20);
  }

  die(src: DamageSource) {
    if (this.dead) return;
    this.dead = true;
    this.health = 0;
    this.deathTime = 0;
    for (const l of LivingEntity.deathListeners) l(this, src);
    this.game?.events.emit('entityDeath', { entity: this, source: src });
    this.onDeath(src);
  }
  protected onDeath(_src: DamageSource) {}

  swing() {
    this.swingProgress = 0;
    this.swingTicks = 0;
  }

  override tick() {
    super.tick();
    if (this.hurtTime > 0) this.hurtTime--;
    if (this.invulnerableTime > 0) this.invulnerableTime--;
    if (this.jumpCooldown > 0) this.jumpCooldown--;
    if (this.swingProgress >= 0) {
      this.swingTicks++;
      this.swingProgress = this.swingTicks / 6;
      if (this.swingProgress >= 1) this.swingProgress = -1;
    }
    if (this.dead) {
      this.deathTime++;
      if (this.deathTime >= this.deathRemoveTicks()) this.remove();
      return;
    }
    this.tickEffects();
    this.tickEnvironmentDamage();
  }

  /** Ticks after death before removal (ragdolls may keep the body longer). */
  protected deathRemoveTicks() {
    return 20;
  }

  protected tickEffects() {
    for (const e of [...this.effects.values()]) {
      const lvl = e.amplifier + 1;
      switch (e.id) {
        case 'regeneration': {
          const iv = Math.max(1, 50 >> e.amplifier);
          if (this.age % iv === 0) this.heal(1);
          break;
        }
        case 'poison': {
          const iv = Math.max(1, 25 >> e.amplifier);
          if (this.age % iv === 0 && this.health > 1) this.hurt({ type: 'poison', bypassArmor: true }, 1);
          break;
        }
        case 'wither': {
          const iv = Math.max(1, 40 >> e.amplifier);
          if (this.age % iv === 0) this.hurt({ type: 'wither', bypassArmor: true }, 1);
          break;
        }
        case 'instant_health':
          this.heal(4 << e.amplifier);
          e.duration = 0;
          break;
        case 'instant_damage':
          this.hurt({ type: 'magic', bypassArmor: true }, 6 << e.amplifier);
          e.duration = 0;
          break;
        case 'absorption':
          if (this.absorption <= 0 && e.duration > 0 && !(e as any)._applied) { this.absorption = 4 * lvl; (e as any)._applied = true; }
          break;
      }
      if (e.duration > 0) e.duration--;
      if (e.duration === 0) this.removeEffect(e.id);
    }
  }

  protected tickEnvironmentDamage() {
    // lava / fire
    if (this.inLava) {
      this.fireTicks = Math.max(this.fireTicks, 300);
      this.hurt({ type: 'lava', fire: true }, 4);
    }
    if (this.fireTicks > 0 && this.age % 20 === 0 && !this.inLava) {
      if (this.inWater) this.fireTicks = 0;
      else this.hurt({ type: 'fire', fire: true, bypassArmor: false }, 1);
    }
    // drowning
    if (this.eyesInWater && !this.canBreatheUnderwater()) {
      const resp = this.respirationLevel();
      if (resp === 0 || Math.random() < 1 / (resp + 1)) this.air--;
      if (this.air <= -20) {
        this.air = 0;
        this.hurt({ type: 'drown', bypassArmor: true }, 2);
      }
    } else if (this.air < this.maxAir) this.air = Math.min(this.maxAir, this.air + 4);
    // suffocation
    const hx = Math.floor(this.pos.x), hy = Math.floor(this.pos.y + this.eyeHeight), hz = Math.floor(this.pos.z);
    const st = this.world.getBlock(hx, hy, hz);
    if (st && T_FULL_CUBE[st >>> 4] && !this.noClip && this.age % 10 === 0) this.hurt({ type: 'suffocate', bypassArmor: true }, 1);
    // void
    if (this.pos.y < -64) this.hurt({ type: 'void', bypassArmor: true }, 4);
  }

  canBreatheUnderwater() {
    return this.hasEffect('water_breathing') || this.hasEffect('conduit_power');
  }
  respirationLevel() {
    return 0;
  }

  protected override onFall(dist: number) {
    super.onFall(dist);
    const below = this.blockBelow();
    const name = below ? BLOCKS[below >>> 4].name : '';
    let dmg = Math.ceil(dist - 3 - this.effectLevel('jump_boost'));
    if (this.hasEffect('slow_falling')) dmg = 0;
    if (name === 'hay_block' || name.endsWith('_bed')) dmg = Math.ceil(dmg * 0.2);
    if (name === 'slime_block' || name === 'honey_block' || this.inWater) dmg = 0;
    dmg = this.modifyFallDamage(dmg);
    if (dmg > 0) {
      this.hurt({ type: 'fall', bypassArmor: true, dir: new THREE.Vector3(0, -1, 0), impulse: dist }, dmg);
      this.game?.events.emit('entityFallDamage', { entity: this, distance: dist, damage: dmg });
    }
  }
  /** Feather falling etc. */
  protected modifyFallDamage(d: number) {
    return d;
  }

  /** Converts the move intent into world-space input for travel(). */
  protected intentToWorld(): { fx: number; fz: number } {
    const f = this.intent.forward, s = this.intent.strafe;
    if (f === 0 && s === 0) return { fx: 0, fz: 0 };
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    // forward = (-sin, -cos), right = (cos, -sin)
    let fx = -sin * f + cos * s;
    let fz = -cos * f - sin * s;
    const l = Math.hypot(fx, fz);
    if (l > 1) { fx /= l; fz /= l; }
    return { fx, fz };
  }

  /** Effective speed from attributes/effects. */
  movementSpeed(): number {
    let sp = this.walkSpeed;
    const speed = this.effectLevel('speed'), slow = this.effectLevel('slowness');
    sp *= 1 + 0.2 * speed;
    sp *= Math.max(0, 1 - 0.15 * slow);
    if (this.intent.sprint) sp *= 1.3;
    if (this.intent.sneak) sp *= 0.3;
    return sp;
  }

  jumpVelocity(): number {
    let v = 0.42 * 20 * 1.065;
    const below = this.blockBelow();
    if (below) v *= BLOCKS[below >>> 4].jumpFactor;
    v += this.effectLevel('jump_boost') * 0.1 * 20;
    return v;
  }

  override physicsStep(dt: number) {
    this.prevPos.copy(this.pos);
    this.prevYaw = this.yaw;
    this.prevPitch = this.pitch;
    this.prevBodyYaw = this.bodyYaw;
    this.prevLimbSwingAmount = this.limbSwingAmount;
    this.updateEnvironment();
    if (this.dead) {
      this.travel(dt, 0, 0, 0, false);
      return;
    }
    const { fx, fz } = this.intentToWorld();
    let jump = this.intent.jump;
    if (jump && this.onGround && !this.inWater && !this.inLava && this.jumpCooldown === 0) {
      this.vel.y = this.jumpVelocity();
      if (this.intent.sprint) {
        this.vel.x += -Math.sin(this.yaw) * 0.2 * 20 * 0.5;
        this.vel.z += -Math.cos(this.yaw) * 0.2 * 20 * 0.5;
      }
      this.jumpCooldown = 3;
      this.onJump();
      jump = false;
    }
    this.travel(dt, fx, fz, this.movementSpeed(), jump || (this.intent.jump && (this.inWater || this.inLava || this.onClimbable)), false, this.intent.sneak);
    // body yaw follows movement direction
    const hs = Math.hypot(this.pos.x - this.prevPos.x, this.pos.z - this.prevPos.z);
    if (hs > 0.0025 / 3) {
      const moveYaw = Math.atan2(-(this.pos.x - this.prevPos.x), -(this.pos.z - this.prevPos.z));
      this.bodyYaw = approachAngle(this.bodyYaw, moveYaw, 8 * dt);
    }
    // keep body within 50° of the head
    const diff = wrapAngle(this.yaw - this.bodyYaw);
    if (Math.abs(diff) > 0.87) this.bodyYaw = this.yaw - Math.sign(diff) * 0.87;
    // limb animation
    const speed = hs / dt;
    this.limbSwingAmount += (Math.min(1, speed / 4.3) - this.limbSwingAmount) * Math.min(1, dt * 10);
    this.limbSwing += speed * dt * 1.6;
  }

  protected onJump() {}
}

export function wrapAngle(a: number) {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
}
export function approachAngle(cur: number, target: number, maxStep: number) {
  const d = wrapAngle(target - cur);
  return cur + Math.max(-maxStep, Math.min(maxStep, d));
}
