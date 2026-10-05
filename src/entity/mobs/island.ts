/**
 * Tropical island wildlife.
 *
 *  - Crab: scuttles sideways along beaches and shallows (the model turns 90° to its path),
 *    raises and snaps its claws when you come close, pinches back when hurt. Breathes water.
 *  - Snake (green tree boa / banded krait / carpet python): slithers through the jungle; when
 *    you get within 5 blocks it coils, raises its head and hisses; come within 2 (or hit it) and
 *    it strikes with a venomous bite (poison), then slithers off. Sneaking lets you pass.
 *  - Parrot (scarlet / blue-and-gold / green / grey): perches on canopies and beaches, flies
 *    between trees with real flight (steering, climbing, gliding, landing on leaves), takes off
 *    when you approach or when hurt, squawks.
 *  - Sea turtle: crawls slowly on the sand, swims gracefully in the lagoon (its own swim
 *    steering, wanders and surfaces), heads back to the water, breeds with seagrass.
 */
import * as THREE from 'three';
import { Mob, type LootEntry } from './mob';
import { Animal } from './animal';
import { Flag, type Goal } from '../ai/goals';
import { FloatGoal, HurtByTargetGoal, LookAtPlayerGoal, MeleeAttackGoal, PanicGoal, RandomLookAroundGoal, RandomStrollGoal } from '../ai/commonGoals';
import { approachAngle, type LivingEntity } from '../living';
import { BLOCKS, T_LIQUID, T_SOLID } from '../../world/blocks/registry';
import type { AnimState } from '../models/anim/common';
import { SNAKE_VARIANTS, PARROT_VARIANTS } from '../models/defs/island';

const blockName = (m: Mob, x: number, y: number, z: number) => BLOCKS[m.world.getBlock(Math.floor(x), Math.floor(y), Math.floor(z)) >>> 4]?.name ?? 'air';
const isPlayer = (e: any) => e?.type === 'player' && !e.dead && !e.creative && !e.spectator;

function nearestPlayer(m: Mob, range: number): LivingEntity | null {
  const p = (m.game as any)?.player as LivingEntity | undefined;
  if (!p || !isPlayer(p)) return null;
  return p.pos.distanceToSquared(m.pos) < range * range ? p : null;
}

// ================================================================================ crab
/** Back off sideways from a nearby player, claws raised (threat display). */
class CrabThreatGoal implements Goal {
  flags = Flag.MOVE | Flag.LOOK;
  private from: LivingEntity | null = null;
  private t = 0;
  constructor(readonly crab: Crab) {}
  canUse() {
    const p = nearestPlayer(this.crab, 3.5);
    if (!p || (p as any).sneaking) return false;
    this.from = p;
    return true;
  }
  canContinueToUse() {
    return !!this.from && this.from.pos.distanceToSquared(this.crab.pos) < 6 * 6 && this.t < 120;
  }
  start() { this.t = 0; this.crab.threat = true; }
  stop() { this.crab.threat = false; this.from = null; this.crab.navigation.stop(); }
  tick() {
    const c = this.crab, p = this.from!;
    this.t++;
    c.lookControl.lookAtEntity(p, 30, 30);
    const dx = c.pos.x - p.pos.x, dz = c.pos.z - p.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    if (d < 4.5) c.moveControl.setWanted(c.pos.x + (dx / d) * 2, c.pos.y, c.pos.z + (dz / d) * 2, 1.1);
  }
}

export class Crab extends Mob {
  readonly type = 'crab';
  override sounds = { hurt: 'mob.crab.hurt', death: 'mob.crab.hurt', say: 'mob.crab.say' };
  override ambientInterval = 200;
  threat = false;
  private side = 0;
  constructor() {
    super();
    this.maxHealth = this.health = 6;
    this.moveAttr = 0.3;
    this.attackDamage = 2;
    this.width = 0.5;
    this.height = 0.3;
    this.eyeHeight = 0.26;
    this.mass = 1.2;
    this.mobType = 'arthropod';
  }
  modelId(): [string, string] {
    return ['crab', ''];
  }
  override canBreatheUnderwater() {
    return true;
  }
  protected override registerGoals() {
    this.goals.add(1, new MeleeAttackGoal(this, 1.35, false, 14));
    this.goals.add(2, new CrabThreatGoal(this));
    this.goals.add(4, new RandomStrollGoal(this, 0.9, 50, false, (x, y, z) => {
      const n = blockName(this, x, y - 1, z);
      return n === 'sand' ? 10 : n === 'gravel' || n === 'stone' ? 4 : 0;
    }));
    this.goals.add(5, new LookAtPlayerGoal(this, 6));
    this.goals.add(6, new RandomLookAroundGoal(this));
    this.targets.add(1, new HurtByTargetGoal(this));
  }
  protected override fillAnim(st: AnimState) {
    st.aggressive = this.threat || !!this.target;
  }
  override updateVisual(alpha: number, dt: number) {
    super.updateVisual(alpha, dt);
    if (!this.model || this.dead) return;
    // crabs walk sideways: face 90° off the path while moving, turn to face threats
    const moving = Math.hypot(this.vel.x, this.vel.z) > 0.25 && !this.threat && !this.target;
    this.side += ((moving ? Math.PI / 2 : 0) - this.side) * (1 - Math.exp(-dt * 8));
    this.model.rotation.y += this.side;
  }
  protected override loot(): LootEntry[] {
    return [{ item: 'bone_meal', min: 0, max: 1 }];
  }
  override xpReward() {
    return 1 + Math.floor(Math.random() * 2);
  }
}

// ================================================================================ snake
/** Coil, hiss and face a player who comes close; strike if they come closer. */
class SnakeWarnGoal implements Goal {
  flags = Flag.MOVE | Flag.LOOK;
  private p: LivingEntity | null = null;
  private hiss = 0;
  constructor(readonly snake: Snake) {}
  canUse() {
    if (this.snake.calm > 0 || this.snake.target) return false;
    const p = nearestPlayer(this.snake, 5);
    if (!p || (p as any).sneaking) return false;
    this.p = p;
    return true;
  }
  canContinueToUse() {
    return !!this.p && !this.snake.target && this.p.pos.distanceToSquared(this.snake.pos) < 7 * 7 && !(this.p as any).sneaking;
  }
  start() { this.snake.warning = true; this.hiss = 0; this.snake.navigation.stop(); }
  stop() { this.snake.warning = false; this.p = null; }
  tick() {
    const s = this.snake, p = this.p!;
    s.lookControl.lookAtEntity(p, 20, 20);
    s.targetYaw = Math.atan2(-(p.pos.x - s.pos.x), -(p.pos.z - s.pos.z));
    if (--this.hiss <= 0) { s.playSound('mob.snake.hiss', 0.9, 0.9 + Math.random() * 0.2); this.hiss = 30 + Math.floor(Math.random() * 30); }
    if (p.pos.distanceToSquared(s.pos) < 2.1 * 2.1) s.setTarget(p);
  }
}

export class Snake extends Mob {
  readonly type = 'snake';
  override sounds = { hurt: 'mob.snake.hurt', death: 'mob.snake.hurt' };
  variant: string = SNAKE_VARIANTS[Math.floor(Math.random() * SNAKE_VARIANTS.length)];
  warning = false;
  /** Ticks during which the snake will not warn or strike again (after a bite). */
  calm = 0;
  constructor() {
    super();
    this.maxHealth = this.health = 8;
    this.moveAttr = 0.22;
    this.attackDamage = 2;
    this.width = 0.5;
    this.height = 0.25;
    this.eyeHeight = 0.18;
    this.mass = 3;
  }
  modelId(): [string, string] {
    return ['snake', this.variant];
  }
  protected override registerGoals() {
    this.goals.add(0, new FloatGoal(this));
    this.goals.add(1, new MeleeAttackGoal(this, 1.6, false, 22));
    this.goals.add(2, new SnakeWarnGoal(this));
    this.goals.add(4, new RandomStrollGoal(this, 0.8, 90, true));
    this.goals.add(5, new LookAtPlayerGoal(this, 8));
    this.goals.add(6, new RandomLookAroundGoal(this));
    this.targets.add(1, new HurtByTargetGoal(this));
  }
  override tick() {
    super.tick();
    if (this.calm > 0) this.calm--;
  }
  protected override onHitTarget(t: LivingEntity) {
    (t as any).addEffect?.('poison', 20 * 5, 0);
    this.playSound('mob.snake.hiss', 1, 1.25);
    // bite and retreat
    this.calm = 160;
    this.setTarget(null);
  }
  protected override fillAnim(st: AnimState) {
    st.aggressive = this.warning || !!this.target;
  }
  protected override loot(): LootEntry[] {
    return [{ item: 'string', min: 0, max: 1 }];
  }
  protected override saveExtra() {
    return { variant: this.variant };
  }
  protected override loadExtra(o: any) {
    if (o?.variant && (SNAKE_VARIANTS as readonly string[]).includes(o.variant)) this.variant = o.variant;
  }
}

// ================================================================================ parrot
const _t = new THREE.Vector3();

export class Parrot extends Mob {
  readonly type = 'parrot';
  override sounds = { hurt: 'mob.parrot.hurt', death: 'mob.parrot.hurt', say: 'mob.parrot.say' };
  override ambientInterval = 140;
  variant: string = PARROT_VARIANTS[Math.floor(Math.random() * PARROT_VARIANTS.length)];
  flying = false;
  private goal = new THREE.Vector3();
  private landing = false;
  private legs = 0;
  private perchT = 200 + Math.floor(Math.random() * 600);
  private flapT = 0;
  constructor() {
    super();
    this.maxHealth = this.health = 6;
    this.moveAttr = 0.2;
    this.width = 0.4;
    this.height = 0.5;
    this.eyeHeight = 0.42;
    this.mass = 1;
  }
  modelId(): [string, string] {
    return ['parrot', this.variant];
  }
  protected override registerGoals() {
    this.goals.add(5, new LookAtPlayerGoal(this, 8));
    this.goals.add(6, new RandomLookAroundGoal(this));
  }
  override hurt(src: any, amount: number) {
    const r = super.hurt(src, amount);
    if (r && !this.dead) this.takeOff(true);
    return r;
  }
  /** Leave the perch: a few legs of flight, then land somewhere leafy. */
  takeOff(flee = false) {
    if (this.flying) return;
    this.flying = true;
    this.legs = flee ? 2 + Math.floor(Math.random() * 2) : 1 + Math.floor(Math.random() * 3);
    this.vel.y = 3.5;
    this.pickGoal(flee);
    this.playSound('mob.parrot.fly', 0.8, 1);
  }
  private pickGoal(flee = false) {
    const w = this.world;
    const p = (this.game as any)?.player as LivingEntity | undefined;
    const last = this.legs <= 1;
    for (let i = 0; i < 24; i++) {
      const a = Math.random() * Math.PI * 2, r = 6 + Math.random() * 16;
      let x = this.pos.x + Math.cos(a) * r, z = this.pos.z + Math.sin(a) * r;
      if (flee && p) {
        // away from the player
        const dx = this.pos.x - p.pos.x, dz = this.pos.z - p.pos.z, d = Math.hypot(dx, dz) || 1;
        x = this.pos.x + (dx / d) * r + Math.cos(a) * 4;
        z = this.pos.z + (dz / d) * r + Math.sin(a) * 4;
      }
      if (!w.isLoaded(Math.floor(x), Math.floor(z))) continue;
      const top = w.getHeight(Math.floor(x), Math.floor(z));
      const st = w.getBlock(Math.floor(x), top - 1, Math.floor(z));
      const name = BLOCKS[st >>> 4]?.name ?? '';
      if (last) {
        // land on leaves, logs, grass or sand (never water)
        if (T_LIQUID[st >>> 4] || !T_SOLID[st >>> 4]) continue;
        if (!(name.endsWith('_leaves') || name.endsWith('_log') || name === 'grass_block' || name === 'sand' || name === 'podzol')) continue;
        this.goal.set(Math.floor(x) + 0.5, top + 0.02, Math.floor(z) + 0.5);
        this.landing = true;
        return;
      }
      this.goal.set(x, top + 3 + Math.random() * 7, z);
      this.landing = false;
      return;
    }
    // nowhere to go: drop onto whatever solid ground is below, or keep searching from higher up
    const bx = Math.floor(this.pos.x), bz = Math.floor(this.pos.z);
    for (let y = Math.floor(this.pos.y); y > Math.floor(this.pos.y) - 40 && y > 1; y--) {
      const st = w.getBlock(bx, y - 1, bz);
      if (T_LIQUID[st >>> 4]) break;
      if (T_SOLID[st >>> 4]) { this.goal.set(bx + 0.5, y + 0.02, bz + 0.5); this.landing = true; this.legs = 1; return; }
    }
    this.goal.set(this.pos.x + (Math.random() - 0.5) * 16, this.pos.y + 2, this.pos.z + (Math.random() - 0.5) * 16);
    this.landing = false;
    this.legs = 2;
  }
  protected override customServerAiStep() {
    if (this.flying) {
      this.noActionTime = 0;
      return;
    }
    // perched: take off when a player comes close, when in water, or after a while
    const p = nearestPlayer(this, 4);
    if ((p && !(p as any).sneaking) || this.inWater || --this.perchT <= 0) {
      this.perchT = 300 + Math.floor(Math.random() * 900);
      this.takeOff(!!p);
    }
  }
  protected override travelMob(dt: number) {
    if (!this.flying || this.dead) { super.travelMob(dt); return; }
    this.prevPos.copy(this.pos);
    this.prevYaw = this.yaw;
    this.prevPitch = this.pitch;
    this.prevBodyYaw = this.bodyYaw;
    this.prevLimbSwingAmount = this.limbSwingAmount;
    this.updateEnvironment();
    const to = _t.copy(this.goal).sub(this.pos);
    const d = to.length();
    if (d < (this.landing ? 0.45 : 1.6)) {
      if (this.landing) {
        this.flying = false;
        this.vel.set(0, 0, 0);
        this.perchT = 300 + Math.floor(Math.random() * 900);
        return this.finishStep(dt);
      }
      this.legs--;
      this.pickGoal();
    }
    // cruise at ~7 b/s, slow down to land; climb over obstacles
    const speed = this.landing ? Math.min(7, 1.2 + d * 0.9) : 7;
    to.multiplyScalar(speed / Math.max(d, 1e-3));
    const k = 1 - Math.exp(-2.6 * dt);
    this.vel.x += (to.x - this.vel.x) * k;
    this.vel.z += (to.z - this.vel.z) * k;
    this.vel.y += (to.y - this.vel.y) * k + Math.sin(this.age * 0.4) * 0.6 * dt;
    if (this.collidedH) this.vel.y = Math.max(this.vel.y, 3);
    this.move(this.vel.x * dt, this.vel.y * dt, this.vel.z * dt);
    if (this.onGround && this.landing && d < 1.5) this.flying = false;
    // wing beats sound now and then
    if ((this.flapT -= dt) <= 0) { this.flapT = 1.2 + Math.random() * 1.5; if (this.vel.y > -0.5) this.playSound('mob.parrot.fly', 0.35, 0.9 + Math.random() * 0.3); }
    this.finishStep(dt);
  }
  private finishStep(dt: number) {
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (hs > 0.3) {
      const yaw = Math.atan2(-this.vel.x, -this.vel.z);
      this.bodyYaw = approachAngle(this.bodyYaw, yaw, 7 * dt);
      this.yaw = this.bodyYaw;
      this.targetYaw = this.yaw;
      this.headYawW = approachAngle(this.headYawW, this.yaw, 7 * dt);
    }
    this.limbSwingAmount += (0 - this.limbSwingAmount) * Math.min(1, dt * 10);
    this.fallDistance = 0;
  }
  protected override fillAnim(st: AnimState) {
    st.flying = this.flying;
    st.vy = this.vel.y;
  }
  protected override loot(): LootEntry[] {
    return [{ item: 'feather', min: 1, max: 2 }];
  }
  protected override saveExtra() {
    return { variant: this.variant };
  }
  protected override loadExtra(o: any) {
    if (o?.variant && (PARROT_VARIANTS as readonly string[]).includes(o.variant)) this.variant = o.variant;
  }
}

// ================================================================================ sea turtle
export class SeaTurtle extends Animal {
  readonly type = 'sea_turtle';
  override sounds = { hurt: 'mob.turtle.hurt', death: 'mob.turtle.hurt', say: 'mob.turtle.say' };
  override ambientInterval = 400;
  private swimGoal = new THREE.Vector3();
  private swimT = 0;
  constructor() {
    super();
    this.maxHealth = this.health = 30;
    this.moveAttr = 0.1;
    this.width = 1.0;
    this.height = 0.42;
    this.eyeHeight = 0.32;
    this.mass = 140;
  }
  modelId(): [string, string] {
    return ['sea_turtle', ''];
  }
  isFood(n: string) {
    return n === 'seagrass';
  }
  override canBreatheUnderwater() {
    return true;
  }
  override visualScale(): number {
    return this.isBaby ? 0.3 : 1;
  }
  protected override registerGoals() {
    super.registerGoals();
    this.goals.removeWhere((g) => g instanceof FloatGoal || g instanceof RandomStrollGoal || g instanceof PanicGoal);
    this.goals.add(1, new PanicGoal(this, 1.6));
    // on land: wander, preferring the sand near the water
    this.goals.add(5, new RandomStrollGoal(this, 1.0, 80, false, (x, y, z) => {
      const n = blockName(this, x, y - 1, z);
      return n === 'sand' ? 8 : n === 'water' ? 12 : 0;
    }));
  }
  protected override customServerAiStep() {
    // on land long enough: head back to the sea
    if (!this.inWater && Math.random() < 0.004 && this.navigation.isDone()) {
      const w = this.world;
      for (let i = 0; i < 20; i++) {
        const a = Math.random() * Math.PI * 2, r = 4 + Math.random() * 14;
        const x = Math.floor(this.pos.x + Math.cos(a) * r), z = Math.floor(this.pos.z + Math.sin(a) * r);
        const top = w.getHeight(x, z);
        if (T_LIQUID[w.getBlock(x, top - 1, z) >>> 4]) { this.navigation.moveTo(x + 0.5, top, z + 0.5, 1.2); break; }
      }
    }
  }
  protected override travelMob(dt: number) {
    if (!this.inWater || this.dead || !this.fluidDepth || this.fluidDepth < 0.6) { super.travelMob(dt); return; }
    // swimming: steer toward a wander point in the water; neutral buoyancy
    this.prevPos.copy(this.pos);
    this.prevYaw = this.yaw;
    this.prevPitch = this.pitch;
    this.prevBodyYaw = this.bodyYaw;
    this.prevLimbSwingAmount = this.limbSwingAmount;
    this.updateEnvironment();
    if ((this.swimT -= dt) <= 0 || this.pos.distanceToSquared(this.swimGoal) < 1.5) this.pickSwimGoal();
    const to = _t.copy(this.swimGoal).sub(this.pos);
    const d = to.length() || 1;
    const speed = this.isBaby ? 1.6 : 2.4;
    to.multiplyScalar(speed / d);
    const k = 1 - Math.exp(-1.2 * dt);
    this.vel.x += (to.x - this.vel.x) * k;
    this.vel.y += (to.y - this.vel.y) * k;
    this.vel.z += (to.z - this.vel.z) * k;
    if (this.collidedH) this.vel.y = Math.max(this.vel.y, 1.5);
    this.move(this.vel.x * dt, this.vel.y * dt, this.vel.z * dt);
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (hs > 0.2) {
      this.bodyYaw = approachAngle(this.bodyYaw, Math.atan2(-this.vel.x, -this.vel.z), 1.8 * dt);
      this.yaw = this.bodyYaw;
      this.targetYaw = this.yaw;
      this.headYawW = approachAngle(this.headYawW, this.yaw, 3 * dt);
    }
    this.limbSwingAmount += (Math.min(1, hs / 3) - this.limbSwingAmount) * Math.min(1, dt * 5);
    this.limbSwing += hs * dt * 1.6;
  }
  private pickSwimGoal() {
    const w = this.world;
    this.swimT = 6 + Math.random() * 8;
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2, r = 5 + Math.random() * 12;
      const x = Math.floor(this.pos.x + Math.cos(a) * r), z = Math.floor(this.pos.z + Math.sin(a) * r);
      if (!w.isLoaded(x, z)) continue;
      // find the water column there: floor .. surface
      let surf = -1, floor = -1;
      for (let y = Math.min(250, Math.floor(this.pos.y) + 8); y > 1; y--) {
        const st = w.getBlock(x, y, z);
        const liq = T_LIQUID[st >>> 4] === 1;
        if (liq && surf < 0) surf = y;
        if (surf >= 0 && !liq) { floor = y + 1; break; }
      }
      if (surf < 0 || floor < 0 || surf - floor < 1) continue;
      // mostly mid-water, sometimes up to breathe at the surface
      const y = Math.random() < 0.25 ? surf + 0.2 : floor + 0.5 + Math.random() * Math.max(0, surf - floor - 1);
      this.swimGoal.set(x + 0.5, y, z + 0.5);
      return;
    }
    this.swimGoal.set(this.pos.x, this.pos.y + 1, this.pos.z);
  }
  protected override loot(): LootEntry[] {
    return [{ item: 'seagrass', min: 0, max: 2 }];
  }
}
