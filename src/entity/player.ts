/**
 * The player: inventory, game modes, hunger/saturation/exhaustion, XP, attack cooldown,
 * sprint/sneak/swim/fly movement and camera effects.
 */
import * as THREE from 'three';
import { LivingEntity } from './living';
import type { DamageSource } from './entity';
import { Inventory, ARMOR, OFFHAND } from '../game/inventory';
import type { ItemStack } from '../game/items/registry';
import { foodTick, xpForLevel, damageExhaustion, type FoodState } from '../game/survival/food';

export type GameMode = 'survival' | 'creative' | 'adventure' | 'spectator';

export class Player extends LivingEntity {
  readonly type = 'player';
  name = 'Steve';
  readonly inventory = new Inventory();
  gameMode: GameMode = 'survival';
  flying = false;
  food = 20;
  saturation = 5;
  exhaustion = 0;
  private foodTimer = 0;
  xpLevel = 0;
  xpProgress = 0;
  xpTotal = 0;
  xpSeed = Math.floor(Math.random() * 1e9);
  /** Ticks since the last attack (attack cooldown). */
  attackTicks = 100;
  sprinting = false;
  sneaking = false;
  swimming = false;
  spawnPoint: THREE.Vector3 | null = null;
  spawnDimension = 'overworld';
  sleeping = false;
  sleepTicks = 0;
  /** Item being used (eating, bow) */
  usingItem: { stack: ItemStack; hand: 'main' | 'off'; ticks: number } | null = null;
  /** Camera feedback */
  readonly cameraShake = new THREE.Vector3();
  landingImpact = 0;
  bobPhase = 0;
  bobAmount = 0;
  stepDistance = 0;
  private lastStepDist = 0;
  /** Smoothed FOV multiplier (sprint, bow, speed). */
  fovMul = 1;
  portalTicks = 0;
  portalCooldown = 0;
  readonly stats: Record<string, number> = {};
  /** Score for death screen */
  score = 0;

  constructor() {
    super();
    this.width = 0.6;
    this.height = 1.8;
    this.eyeHeight = 1.62;
    this.stepHeight = 0.6;
    this.maxHealth = 20;
    this.health = 20;
    this.mass = 75;
  }

  get creative() {
    return this.gameMode === 'creative';
  }
  get spectator() {
    return this.gameMode === 'spectator';
  }
  get mayFly() {
    return this.gameMode === 'creative' || this.gameMode === 'spectator';
  }

  setGameMode(m: GameMode) {
    this.gameMode = m;
    if (!this.mayFly) this.flying = false;
    if (m === 'spectator') { this.flying = true; this.noClip = true; } else this.noClip = false;
  }

  // ------------------------------------------------------------------ armor
  override get armorValue(): number {
    let a = 0;
    for (let i = ARMOR; i < ARMOR + 4; i++) a += this.inventory.get(i)?.item.armor?.defense ?? 0;
    return a;
  }
  override get armorToughness(): number {
    let a = 0;
    for (let i = ARMOR; i < ARMOR + 4; i++) a += this.inventory.get(i)?.item.armor?.toughness ?? 0;
    return a;
  }
  armorPiece(slot: 'feet' | 'legs' | 'chest' | 'head'): ItemStack | null {
    return this.inventory.get(ARMOR + ['feet', 'legs', 'chest', 'head'].indexOf(slot));
  }
  protected override onArmorDamaged(src: DamageSource, amount: number) {
    if (src.type === 'fire' || src.type === 'lava') return;
    const dmg = Math.max(1, Math.floor(amount / 4));
    for (let i = ARMOR; i < ARMOR + 4; i++) {
      const s = this.inventory.get(i);
      if (!s || !s.item.durability) continue;
      this.damageItem(i, dmg);
    }
  }

  /** Damage the item in a slot (Unbreaking hook via game.enchant). Returns true if it broke. */
  damageItem(slot: number, amount = 1): boolean {
    if (this.creative) return false;
    const s = this.inventory.get(slot);
    if (!s || !s.item.durability) return false;
    const unb = s.ench?.unbreaking ?? 0;
    for (let i = 0; i < amount; i++) {
      if (unb > 0 && Math.random() >= 1 / (unb + 1)) continue;
      s.damage++;
    }
    if (s.damage >= s.item.durability) {
      this.inventory.set(slot, null);
      this.game?.events.emit('itemBroke', { player: this, stack: s });
      return true;
    }
    this.inventory.changed();
    return false;
  }

  get mainHand(): ItemStack | null {
    return this.inventory.held;
  }
  get offHand(): ItemStack | null {
    return this.inventory.get(OFFHAND);
  }

  // ------------------------------------------------------------------ damage
  protected override isInvulnerableTo(src: DamageSource): boolean {
    if (src.type === 'void' || src.type === 'kill') return this.creative && src.type !== 'kill' ? src.type !== 'void' : false;
    return this.creative || this.spectator;
  }
  override hurt(src: DamageSource, amount: number): boolean {
    const ok = super.hurt(src, amount);
    if (ok) {
      this.addExhaustion(damageExhaustion(src.type));
      // camera kick toward the hit direction
      const k = Math.min(1, amount / 6);
      this.cameraShake.set((Math.random() - 0.5) * k, (Math.random() - 0.5) * k * 0.5, k);
      if (this.sleeping) this.sleeping = false;
    }
    return ok;
  }

  protected override onLanded(speed: number) {
    this.landingImpact = Math.min(1, Math.max(this.landingImpact, (speed - 6) / 18));
  }

  protected override modifyFallDamage(d: number) {
    const ff = this.armorPiece('feet')?.ench?.feather_falling ?? 0;
    if (ff > 0) d = Math.floor(d * (1 - Math.min(0.8, ff * 0.12)));
    return d;
  }
  override respirationLevel() {
    return this.armorPiece('head')?.ench?.respiration ?? 0;
  }

  // ------------------------------------------------------------------ hunger
  addExhaustion(n: number) {
    if (this.creative || this.spectator) return;
    this.exhaustion = Math.min(40, this.exhaustion + n);
  }
  /** FoodData.eat(nutrition, saturationModifier). */
  eat(hunger: number, saturationMod: number) {
    this.food = Math.min(20, this.food + hunger);
    this.saturation = Math.min(this.food, this.saturation + hunger * saturationMod * 2);
  }
  private tickFood() {
    const g = this.game as any;
    const difficulty = g?.difficulty ?? 'normal';
    const regen = g?.gamerules?.naturalRegeneration ?? true;
    const st: FoodState = { food: this.food, saturation: this.saturation, exhaustion: this.exhaustion, timer: this.foodTimer };
    foodTick(st, {
      health: this.health, maxHealth: this.maxHealth, difficulty, naturalRegeneration: regen,
      heal: (n) => this.heal(n),
      starve: () => this.hurt({ type: 'starve', bypassArmor: true }, 1),
    });
    // (heal/starve do not add exhaustion: starvation damage has 0 food exhaustion)
    this.food = st.food;
    this.saturation = st.saturation;
    this.exhaustion = st.exhaustion;
    this.foodTimer = st.timer;
    if (difficulty === 'peaceful' && regen) {
      if (this.age % 20 === 0 && this.health < this.maxHealth) this.heal(1);
      if (this.age % 10 === 0 && this.food < 20) this.food++;
    }
  }

  // ------------------------------------------------------------------ XP
  static xpForLevel(level: number): number {
    return xpForLevel(level);
  }
  addXp(n: number) {
    this.score += n;
    this.xpTotal += n;
    this.xpProgress += n / Player.xpForLevel(this.xpLevel);
    let leveled = false;
    while (this.xpProgress >= 1) {
      this.xpProgress = (this.xpProgress - 1) * Player.xpForLevel(this.xpLevel);
      this.xpLevel++;
      this.xpProgress /= Player.xpForLevel(this.xpLevel);
      leveled = true;
    }
    if (leveled && this.xpLevel % 5 === 0) this.game?.events.emit('levelUp', { player: this, level: this.xpLevel });
  }
  addLevels(n: number) {
    this.xpLevel = Math.max(0, this.xpLevel + n);
    if (this.xpLevel === 0) this.xpProgress = Math.max(0, this.xpProgress);
    this.xpSeed = Math.floor(Math.random() * 1e9);
  }

  // ------------------------------------------------------------------ attack
  /** Seconds-per-attack derived from the held item's attack speed. */
  attackCooldownTicks(): number {
    const sp = this.mainHand?.item.attackSpeed ?? 4;
    const haste = this.effectLevel('haste'), fatigue = this.effectLevel('mining_fatigue');
    const s = sp * (1 + 0.1 * haste) * (1 - 0.1 * fatigue);
    return 20 / Math.max(0.1, s);
  }
  attackStrength(partial = 0.5): number {
    return Math.max(0, Math.min(1, (this.attackTicks + partial) / this.attackCooldownTicks()));
  }
  resetAttack() {
    this.attackTicks = 0;
  }

  // ------------------------------------------------------------------ ticking
  override tick() {
    super.tick();
    if (this.dead) return;
    this.attackTicks++;
    if (!this.creative && !this.spectator) this.tickFood();
    if (this.portalCooldown > 0) this.portalCooldown--;
    // sprint conditions
    if (this.sprinting && (this.hasEffect('blindness') || this.food <= 6 && !this.creative || this.intent.forward <= 0 || this.sneaking || this.collidedH && !this.inWater)) this.sprinting = false;
    // exhaustion from movement handled in physicsStep via distance
  }

  override movementSpeed(): number {
    let sp = super.movementSpeed();
    if (this.usingItem) sp *= 0.2;
    if (this.swimming) sp = 2.0 * (this.sprinting ? 2.2 : 1);
    return sp;
  }

  override physicsStep(dt: number) {
    if (this.flying && this.mayFly && !this.dead) {
      this.prevPos.copy(this.pos);
      this.prevYaw = this.yaw;
      this.prevPitch = this.pitch;
      this.updateEnvironment();
      const { fx, fz } = this.intentToWorld();
      const sp = 10.92 * (this.sprinting ? 2 : 1) * (this.spectator ? 1.2 : 1);
      const vt = (this.intent.jump ? 1 : 0) - (this.intent.sneak ? 1 : 0);
      this.vel.y += (vt * 7.5 - this.vel.y) * (1 - Math.exp(-8 * dt));
      this.noGravity = true;
      this.travel(dt, fx, fz, sp, false, true);
      this.noGravity = false;
      if (this.onGround && !this.spectator && vt < 0) this.flying = false;
      this.fallDistance = 0;
    } else {
      this.intent.sprint = this.sprinting;
      this.intent.sneak = this.sneaking && !this.flying;
      super.physicsStep(dt);
    }
    // swimming state (sprinting in water)
    this.swimming = this.sprinting && this.eyesInWater;
    // movement exhaustion + footsteps
    const d = Math.hypot(this.pos.x - this.prevPos.x, this.pos.z - this.prevPos.z);
    if (this.onGround || this.inWater) {
      this.stepDistance += d;
      if (!this.flying) this.addExhaustion(d * (this.inWater ? 0.01 : this.sprinting ? 0.1 : 0));
    }
    if (this.stepDistance - this.lastStepDist > (this.sprinting ? 1.9 : 1.6) && this.onGround && !this.sneaking) {
      this.lastStepDist = this.stepDistance;
      this.game?.events.emit('footstep', { entity: this, block: this.blockBelow() });
    }
    // view bob
    const target = this.onGround && !this.flying ? Math.min(1, d / dt / 4.3) : 0;
    this.bobAmount += (target - this.bobAmount) * Math.min(1, dt * 10);
    this.bobPhase += d * 1.8;
    // camera shake decay
    this.cameraShake.multiplyScalar(Math.exp(-dt * 9));
    this.landingImpact *= Math.exp(-dt * 7);
    // FOV
    let fov = 1;
    if (this.sprinting) fov *= 1.12;
    fov *= 1 + 0.05 * this.effectLevel('speed') - 0.04 * this.effectLevel('slowness');
    if (this.usingItem?.stack.item.name === 'bow') fov *= 1 - Math.min(1, this.usingItem.ticks / 20) * 0.15;
    if (this.flying && this.sprinting) fov *= 1.06;
    this.fovMul += (fov - this.fovMul) * Math.min(1, dt * 8);
  }

  protected override onJump() {
    this.addExhaustion(this.sprinting ? 0.2 : 0.05);
    this.game?.events.emit('jump', { entity: this });
  }

  protected override deathRemoveTicks() {
    return Number.MAX_SAFE_INTEGER;
  }

  respawn(x: number, y: number, z: number) {
    this.dead = false;
    this.health = this.maxHealth;
    this.food = 20;
    this.saturation = 5;
    this.exhaustion = 0;
    this.air = this.maxAir;
    this.fireTicks = 0;
    this.effects.clear();
    this.deathTime = 0;
    this.fallDistance = 0;
    this.vel.set(0, 0, 0);
    this.setPos(x, y, z);
  }

  override serialize() {
    return {
      ...super.serialize(),
      inv: this.inventory.serialize(),
      hp: this.health, food: this.food, sat: this.saturation, exh: this.exhaustion,
      xl: this.xpLevel, xp: this.xpProgress, xt: this.xpTotal, xs: this.xpSeed,
      gm: this.gameMode, fly: this.flying, air: this.air, fire: this.fireTicks,
      sp: this.spawnPoint?.toArray(), sd: this.spawnDimension,
      fx: [...this.effects.values()], stats: this.stats, score: this.score,
    };
  }
  override deserialize(o: any) {
    super.deserialize(o);
    this.inventory.deserialize(o.inv);
    this.health = o.hp ?? 20; this.food = o.food ?? 20; this.saturation = o.sat ?? 5; this.exhaustion = o.exh ?? 0;
    this.xpLevel = o.xl ?? 0; this.xpProgress = o.xp ?? 0; this.xpTotal = o.xt ?? 0; this.xpSeed = o.xs ?? this.xpSeed;
    this.setGameMode(o.gm ?? 'survival');
    this.flying = !!o.fly && this.mayFly;
    this.air = o.air ?? 300; this.fireTicks = o.fire ?? 0;
    this.spawnPoint = o.sp ? new THREE.Vector3().fromArray(o.sp) : null;
    this.spawnDimension = o.sd ?? 'overworld';
    for (const e of o.fx ?? []) this.effects.set(e.id, e);
    Object.assign(this.stats, o.stats ?? {});
    this.score = o.score ?? 0;
  }
}
