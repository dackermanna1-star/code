/**
 * Monster base + undead/arthropod families: zombie (baby, husk, drowned), skeleton (stray),
 * creeper (fuse, charged), spider & cave spider.
 */
import * as THREE from 'three';
import { Mob, type LootEntry } from './mob';
import { Flag, type Goal } from '../ai/goals';
import { AvoidEntityGoal, FleeSunGoal, FloatGoal, HurtByTargetGoal, isPlayer, LeapAtTargetGoal, LookAtPlayerGoal, MeleeAttackGoal, NearestAttackableTargetGoal, RandomLookAroundGoal, RandomStrollGoal } from '../ai/commonGoals';
import { LivingEntity } from '../living';
import type { Entity } from '../entity';
import { ArrowEntity } from '../projectile';
import { mkStack } from './items';
import { explode } from './explosion';
import type { AnimState } from '../models/anim/common';

export abstract class Monster extends Mob {
  override category = 'monster' as const;
  override followRange = 35;
  protected attackPlayersGoals(prio = 2, mustSee = true) {
    this.targets.add(1, new HurtByTargetGoal(this));
    this.targets.add(prio, new NearestAttackableTargetGoal(this, isPlayer, mustSee));
  }
}

// =============================================================================== zombies
export class Zombie extends Monster {
  readonly type: string = 'zombie';
  override mobType = 'undead' as const;
  override sounds = { hurt: 'mob.zombie.hurt', death: 'mob.zombie.death', say: 'mob.zombie.say', step: 'mob.zombie.step' };
  baby = false;
  constructor() {
    super();
    this.maxHealth = this.health = 20;
    this.armor = 2;
    this.attackDamage = 3;
    this.moveAttr = 0.23;
    this.width = 0.6;
    this.height = 1.95;
    this.eyeHeight = 1.74;
    this.burnsInDaylight = true;
    this.mass = 75;
  }
  override get isBaby() {
    return this.baby;
  }
  setBabyZombie(b: boolean) {
    this.baby = b;
    this.moveAttr = b ? 0.23 * 1.5 : 0.23;
    this.width = b ? 0.3 : 0.6;
    this.height = b ? 0.975 : 1.95;
    this.eyeHeight = b ? 0.93 : 1.74;
    this.updateBox();
    this.rig?.setScale(this.visualScale());
  }
  override visualScale() {
    return this.baby ? 0.5 : 1;
  }
  modelId(): [string, string] {
    return ['zombie', 'zombie'];
  }
  protected override registerGoals() {
    this.goals.add(0, new FloatGoal(this));
    this.goals.add(2, new MeleeAttackGoal(this, 1.0, false));
    this.goals.add(5, new FleeSunGoal(this, 1.0));
    this.goals.add(7, new RandomStrollGoal(this, 1.0));
    this.goals.add(8, new LookAtPlayerGoal(this, 8));
    this.goals.add(8, new RandomLookAroundGoal(this));
    this.targets.add(1, new HurtByTargetGoal(this));
    this.targets.add(2, new NearestAttackableTargetGoal(this, isPlayer, true));
    this.targets.add(3, new NearestAttackableTargetGoal(this, (e) => e.type === 'villager' && !(e as Mob).isBaby, false));
    this.targets.add(3, new NearestAttackableTargetGoal(this, (e) => e.type === 'iron_golem', true));
    this.navigation.canOpenDoors = false;
  }
  /** Natural spawn setup: babies (5%), rare weapons. */
  finalizeSpawn(rand = Math.random) {
    if (rand() < 0.05) this.setBabyZombie(true);
    const d = this.difficulty;
    if (rand() < (d === 'hard' ? 0.05 : 0.01)) this.equipment[0] = mkStack(rand() < 0.33 ? 'iron_sword' : 'iron_shovel');
    this.data.dropChance = [0.085, 0.085, 0.085, 0.085, 0.085, 0.085];
  }
  protected override loot(): LootEntry[] {
    return [
      { item: 'rotten_flesh', min: 0, max: 2 },
      { item: 'iron_ingot', chance: 0.025 / 3, lootingChance: 0.01 / 3, playerKill: true },
      { item: 'carrot', chance: 0.025 / 3, lootingChance: 0.01 / 3, playerKill: true },
      { item: 'potato', chance: 0.025 / 3, lootingChance: 0.01 / 3, playerKill: true },
    ];
  }
  override xpReward() {
    return this.baby ? 12 : super.xpReward();
  }
  protected override saveExtra() {
    return { baby: this.baby || undefined };
  }
  protected override loadExtra(o: any) {
    if (o?.baby) this.setBabyZombie(true);
  }
  protected override fillAnim(st: AnimState) {
    st.zombie = true;
  }
}

// =============================================================================== skeletons
export class RangedBowAttackGoal implements Goal {
  flags = 0;
  private seeTime = 0;
  private strafeTime = -1;
  private clockwise = false;
  private backwards = false;
  private attackTime = -1;
  constructor(readonly mob: Skeleton, readonly speed: number, readonly interval: number, readonly radius: number) {
    this.flags = Flag.MOVE | Flag.LOOK;
  }
  canUse() {
    return this.mob.canAttack(this.mob.target) && this.mob.equipment[0]?.item.name === 'bow';
  }
  canContinueToUse() {
    return (this.canUse() || !this.mob.navigation.isDone()) && this.mob.canAttack(this.mob.target);
  }
  start() {
    this.mob.aggressive = true;
  }
  stop() {
    this.mob.aggressive = false;
    this.seeTime = 0;
    this.attackTime = -1;
    this.mob.bowDraw = -1;
  }
  tick() {
    const m = this.mob, t = m.target;
    if (!t) return;
    const d2 = m.pos.distanceToSquared(t.pos);
    const see = m.canSee(t);
    if (see !== this.seeTime > 0) this.seeTime = 0;
    this.seeTime += see ? 1 : -1;
    const r2 = this.radius * this.radius;
    if (d2 <= r2 && this.seeTime >= 20) {
      m.navigation.stop();
      this.strafeTime++;
    } else {
      m.navigation.moveToEntity(t, this.speed, 1);
      this.strafeTime = -1;
    }
    if (this.strafeTime >= 20) {
      if (Math.random() < 0.3) this.clockwise = !this.clockwise;
      if (Math.random() < 0.3) this.backwards = !this.backwards;
      this.strafeTime = 0;
    }
    if (this.strafeTime > -1) {
      if (d2 > r2 * 0.75) this.backwards = false;
      else if (d2 < r2 * 0.25) this.backwards = true;
      m.moveControl.strafe(this.backwards ? -0.5 : 0.5, this.clockwise ? 0.5 : -0.5, 1);
      m.targetYaw = Math.atan2(-(t.pos.x - m.pos.x), -(t.pos.z - m.pos.z));
    }
    m.lookControl.lookAtEntity(t, 30, 30);
    if (m.bowDraw >= 0) {
      if (!see && this.seeTime < -60) m.bowDraw = -1;
      else if (see) {
        m.bowDraw++;
        if (m.bowDraw >= 20) {
          m.shootArrow(t, 1);
          m.bowDraw = -1;
          this.attackTime = this.interval;
        }
      }
    } else if (--this.attackTime <= 0 && this.seeTime >= -60) m.bowDraw = 0;
  }
}

export class Skeleton extends Monster {
  readonly type: string = 'skeleton';
  override mobType = 'undead' as const;
  override sounds = { hurt: 'mob.skeleton.hurt', death: 'mob.skeleton.death', say: 'mob.skeleton.say', step: 'mob.skeleton.step' };
  /** Bow draw ticks (-1 = not drawing). */
  bowDraw = -1;
  constructor() {
    super();
    this.maxHealth = this.health = 20;
    this.moveAttr = 0.25;
    this.width = 0.6;
    this.height = 1.99;
    this.eyeHeight = 1.74;
    this.burnsInDaylight = true;
    this.equipment[0] = mkStack('bow');
    this.mass = 35;
  }
  modelId(): [string, string] {
    return ['skeleton', 'skeleton'];
  }
  protected override registerGoals() {
    const hard = this.difficulty === 'hard';
    this.goals.add(0, new FloatGoal(this));
    this.goals.add(2, new FleeSunGoal(this, 1.0));
    this.goals.add(3, new AvoidEntityGoal(this, (e) => e.type === 'wolf', 6, 1.0, 1.2));
    this.goals.add(4, new RangedBowAttackGoal(this, 1.0, hard ? 20 : 40, 15));
    this.goals.add(4, new MeleeAttackGoal(this, 1.2, false));
    this.goals.add(5, new RandomStrollGoal(this, 1.0));
    this.goals.add(6, new LookAtPlayerGoal(this, 8));
    this.goals.add(6, new RandomLookAroundGoal(this));
    this.attackPlayersGoals();
    this.targets.add(3, new NearestAttackableTargetGoal(this, (e) => e.type === 'iron_golem', true));
  }
  /** Fire an arrow at the target (Minecraft AbstractSkeleton.performRangedAttack). */
  shootArrow(t: LivingEntity, power: number) {
    const g = this.game as any;
    const a = new ArrowEntity();
    a.owner = this;
    const sy = this.pos.y + this.eyeHeight - 0.1;
    const dx = t.pos.x - this.pos.x, dz = t.pos.z - this.pos.z;
    const dy = t.pos.y + t.height / 3 - sy;
    const hd = Math.hypot(dx, dz);
    const dir = new THREE.Vector3(dx, dy + hd * 0.2, dz);
    const diff = ({ peaceful: 0, easy: 1, normal: 2, hard: 3 } as Record<string, number>)[this.difficulty] ?? 2;
    a.setPos(this.pos.x + (dx / (hd || 1)) * 0.4, sy, this.pos.z + (dz / (hd || 1)) * 0.4);
    a.shoot(dir, 1.6 * 20 * power, 14 - diff * 4);
    a.damage = 2 + diff * 0.11 + (Math.random() * 0.25);
    a.pickup = 'disallowed';
    if (this.fireTicks > 0) a.fireTicks = 100;
    this.decorateArrow(a);
    g?.entities?.add(a);
    this.playSound('random.bow', 1, 1 / (Math.random() * 0.4 + 0.8));
    this.swing();
  }
  protected decorateArrow(_a: ArrowEntity) {}
  protected override loot(): LootEntry[] {
    return [{ item: 'bone', min: 0, max: 2 }, { item: 'arrow', min: 0, max: 2 }];
  }
  protected override fillAnim(st: AnimState) {
    st.bowDraw = this.bowDraw >= 0 ? Math.min(1, this.bowDraw / 20) : 0;
  }
}

// =============================================================================== creeper
export const CREEPER_FUSE = 30;

class SwellGoal implements Goal {
  flags = 0;
  constructor(readonly c: Creeper) {
    this.flags = Flag.MOVE;
  }
  canUse() {
    const t = this.c.target;
    return this.c.swellDir > 0 || (!!t && this.c.pos.distanceToSquared(t.pos) < 9);
  }
  start() {
    this.c.navigation.stop();
  }
  stop() {
    this.c.swellDir = -1;
  }
  tick() {
    const c = this.c, t = c.target;
    if (!t || c.pos.distanceToSquared(t.pos) > 49 || !c.canSee(t)) c.swellDir = -1;
    else c.swellDir = 1;
    if (t) c.lookControl.lookAtEntity(t, 30, 30);
  }
}

export class Creeper extends Monster {
  readonly type = 'creeper';
  override sounds = { hurt: 'mob.creeper.hurt', death: 'mob.creeper.death', say: 'mob.creeper.say', step: 'block.grass.step' };
  swell = 0;
  prevSwell = 0;
  swellDir = -1;
  maxSwell = CREEPER_FUSE;
  explosionRadius = 3;
  powered = false;
  ignited = false;
  constructor() {
    super();
    this.maxHealth = this.health = 20;
    this.moveAttr = 0.25;
    this.width = 0.6;
    this.height = 1.7;
    this.eyeHeight = 1.45;
    this.mass = 60;
  }
  modelId(): [string, string] {
    return ['creeper', ''];
  }
  protected override registerGoals() {
    this.goals.add(1, new FloatGoal(this));
    this.goals.add(2, new SwellGoal(this));
    this.goals.add(3, new AvoidEntityGoal(this, (e) => e.type === 'cat' || e.type === 'ocelot', 6, 1.0, 1.2));
    this.goals.add(4, new MeleeAttackGoal(this, 1.0, false));
    this.goals.add(5, new RandomStrollGoal(this, 0.8));
    this.goals.add(6, new LookAtPlayerGoal(this, 8));
    this.goals.add(6, new RandomLookAroundGoal(this));
    this.targets.add(1, new NearestAttackableTargetGoal(this, isPlayer, true));
    this.targets.add(2, new HurtByTargetGoal(this));
  }
  /** Melee "attack" = keep fusing (creepers don't hit). */
  override doHurtTarget(_t: LivingEntity) {
    return true;
  }
  override interact(player: any, stack: any, hand: 'main' | 'off'): boolean {
    if (stack?.item.name === 'flint_and_steel' || stack?.item.name === 'fire_charge') {
      this.ignited = true;
      this.playSound('fire.ignite');
      return true;
    }
    return super.interact(player, stack, hand);
  }
  /** Lightning strike nearby: becomes charged. */
  onLightning() {
    this.powered = true;
    this.fireTicks = Math.max(this.fireTicks, 160);
  }
  override tick() {
    super.tick();
    if (this.dead || this.removed) return;
    this.prevSwell = this.swell;
    if (this.ignited) this.swellDir = 1;
    if (this.swellDir > 0 && this.swell === 0) {
      this.playSound('random.fuse', 1, 0.5);
      this.game?.events.emit('creeperFuse', { entity: this, pos: this.pos.clone() });
    }
    this.swell = Math.max(0, this.swell + this.swellDir);
    if (this.swell >= this.maxSwell) {
      this.swell = this.maxSwell;
      this.explodeCreeper();
    }
  }
  explodeCreeper() {
    if (this.removed || this.dead) return;
    const p = this.pos.clone().setY(this.pos.y + 0.5);
    this.dead = true;
    this.remove();
    explode(this.game, p, this.explosionRadius * (this.powered ? 2 : 1), { source: this, fire: false });
  }
  protected override loot(): LootEntry[] {
    return [{ item: 'gunpowder', min: 0, max: 2 }];
  }
  /** Swell fraction 0..1 for rendering. */
  swelling(alpha: number) {
    return (this.prevSwell + (this.swell - this.prevSwell) * alpha) / (this.maxSwell - 2);
  }
  protected override fillAnim(st: AnimState, alpha: number) {
    const f = Math.min(1, Math.max(0, this.swelling(alpha)));
    st.swell = f;
    st.powered = this.powered;
    // Minecraft white flash: on every other swell step near the end
    const rig = this.rig;
    if (rig) {
      const flash = f > 0 && Math.floor(f * 10) % 2 === 1 ? Math.min(1, f) * 0.85 : 0;
      for (const m of rig.materials) m.uniforms.u_tint.value.set(1, 1, 1, flash);
    }
  }
  protected override saveExtra() {
    return { powered: this.powered || undefined };
  }
  protected override loadExtra(o: any) {
    this.powered = !!o?.powered;
  }
}

// =============================================================================== spiders
export class Spider extends Monster {
  readonly type: string = 'spider';
  override mobType = 'arthropod' as const;
  override sounds = { hurt: 'mob.spider.hurt', death: 'mob.spider.death', say: 'mob.spider.say', step: 'mob.spider.step' };
  constructor() {
    super();
    this.maxHealth = this.health = 16;
    this.moveAttr = 0.3;
    this.attackDamage = 2;
    this.width = 1.4;
    this.height = 0.9;
    this.eyeHeight = 0.65;
    this.navigation.climb = 12;
    this.mass = 40;
  }
  modelId(): [string, string] {
    return ['spider', 'spider'];
  }
  protected override registerGoals() {
    this.goals.add(1, new FloatGoal(this));
    this.goals.add(3, new LeapAtTargetGoal(this, 0.4));
    this.goals.add(4, new MeleeAttackGoal(this, 1.0, true));
    this.goals.add(5, new RandomStrollGoal(this, 0.8));
    this.goals.add(6, new LookAtPlayerGoal(this, 8));
    this.goals.add(6, new RandomLookAroundGoal(this));
    this.targets.add(1, new HurtByTargetGoal(this));
    // spiders only hunt in the dark (or when provoked)
    this.targets.add(2, new (class extends NearestAttackableTargetGoal {
      override canUse() {
        const m = this.mob, g = m.game as any;
        const lit = g?.dimension === 'overworld' && m.world.getSkyLight(Math.floor(m.pos.x), Math.floor(m.pos.y + 0.5), Math.floor(m.pos.z)) > 10 && g?.isDay;
        return !lit && super.canUse();
      }
    })(this, isPlayer, true));
  }
  override updateEnvironment() {
    super.updateEnvironment();
    // climb walls
    if (this.collidedH && !this.dead) this.onClimbable = true;
  }
  protected override loot(): LootEntry[] {
    return [{ item: 'string', min: 0, max: 2 }, { item: 'spider_eye', chance: 1 / 3, looting: 1, playerKill: true }];
  }
  protected override deathFlip() {
    return 2;
  }
  protected override fillAnim(st: AnimState) {
    st.climbing = this.onClimbable && !this.onGround;
  }
}

export type { Entity };
