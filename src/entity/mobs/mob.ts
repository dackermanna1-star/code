/**
 * Mob: AI-driven living entity (Minecraft Mob/PathfinderMob equivalent).
 *
 * - AI at 20 TPS: target selector + goal selector, navigation, move/look/jump controls; the
 *   resulting `intent` + `yaw` drive the shared Minecraft-like physics (LivingEntity).
 * - Sounds (`sounds` for the audio glue + random ambient "say" sounds), loot with Looting,
 *   XP, persistence/despawn flags, equipment & armour, daylight burning for undead.
 * - Visuals: a procedural rig (src/entity/models), animated every frame from an AnimState;
 *   per-frame light, Minecraft hurt flash, wounds (`addWound`), ragdoll bones description
 *   (`model.userData.bones`), tip-over death when no ragdoll system takes over.
 */
import * as THREE from 'three';
import { LivingEntity, wrapAngle } from '../living';
import type { DamageSource, Entity } from '../entity';
import { GoalSelector } from '../ai/goals';
import { LookControl, MoveControl, Navigation } from '../ai/navigation';
import { canSee, seesSky } from '../ai/sensing';
import { setEntityLight } from '../../render/entityMaterial';
import type { Rig } from '../models/rig';
import { newAnimState, type AnimState } from '../models/anim/common';
import { mkStack } from './items';
import type { ItemStack } from '../../game/items/registry';

export type MobType = 'default' | 'undead' | 'arthropod' | 'illager' | 'aquatic';
export type MobCategory = 'monster' | 'creature' | 'ambient' | 'water' | 'misc';

export interface MobSounds {
  hurt?: string;
  death?: string;
  say?: string;
  step?: string;
}

export interface LootEntry {
  item: string;
  min?: number;
  max?: number;
  /** Drop probability (default 1). */
  chance?: number;
  /** Extra chance per Looting level (rare drops: 0.01). */
  lootingChance?: number;
  /** Max extra items per Looting level (default 1 for ranged counts, 0 for fixed). */
  looting?: number;
  /** Only when killed by a player. */
  playerKill?: boolean;
  /** Item dropped instead when the mob was on fire (cooked meat). */
  cooked?: string;
}

/** Global visual/AI switches (debug URL params). */
export const MOB_FLAGS = { freeze: false, pose: '' as string };

const _v = new THREE.Vector3();

export abstract class Mob extends LivingEntity {
  mobType: MobType = 'default';
  category: MobCategory = 'creature';
  sounds: MobSounds = {};
  /** Ticks between ambient sounds (Minecraft getAmbientSoundInterval). */
  ambientInterval = 80;
  private ambientTime = 0;
  /** Minecraft movement speed attribute (b/tick-ish); effective b/s = 43.17 * (attr*mul)^2. */
  moveAttr = 0.25;
  /** Current speed multiplier from the move control. */
  moveMul = 0;
  attackDamage = 2;
  attackKnockback = 0;
  followRange = 16;
  armor = 0;
  fireImmune = false;
  aquatic = false;
  burnsInDaylight = false;
  /** Must never despawn (named, tamed, picked up items ...). */
  persistenceRequired = false;
  noActionTime = 0;
  aiDisabled = false;
  readonly goals = new GoalSelector();
  readonly targets = new GoalSelector();
  readonly navigation: Navigation;
  readonly moveControl: MoveControl;
  readonly lookControl: LookControl;
  jumping = false;
  /** Desired movement yaw (set by the move control, approached in physics). */
  targetYaw = 0;
  turnSpeed = 9; // rad/s
  /** Head yaw in world space (look direction). */
  headYawW = 0;
  maxHeadYaw = 1.31;
  target: LivingEntity | null = null;
  lastHurtByPlayerTick = -1000;
  lastHurtByPlayer: Entity | null = null;
  attackCooldown = 0;
  aggressive = false;
  // ---- visuals
  rig: Rig | null = null;
  readonly anim: AnimState = newAnimState();
  readonly animMem: Record<string, any> = {};
  private visualTime = Math.random() * 100;
  private stepDist = 0;
  private lastBodyYaw = 0;
  private poofed = false;

  constructor() {
    super();
    this.stepHeight = 0.6;
    this.navigation = new Navigation(this);
    this.moveControl = new MoveControl(this);
    this.lookControl = new LookControl(this);
    this.yaw = this.targetYaw = this.headYawW = this.bodyYaw = Math.random() * Math.PI * 2 - Math.PI;
  }

  // ------------------------------------------------------------------ setup
  /** Model name + variant for the visual catalog. */
  abstract modelId(): [string, string];
  /** Register goals (called once in init). */
  protected registerGoals(): void {}
  private goalsRegistered = false;

  override init(game: any, world: any) {
    super.init(game, world);
    if (!this.goalsRegistered) {
      this.goalsRegistered = true;
      this.registerGoals();
    }
    if (game?.renderer && !this.rig) this.buildModel();
  }

  get materials(): THREE.RawShaderMaterial[] {
    return this.rig?.materials ?? [];
  }

  /** Visual scale (babies are smaller). */
  visualScale(): number {
    return 1;
  }

  /** (Re)build the rig. Subclasses may override modelId when their look changes. */
  buildModel() {
    const old = this.model;
    try {
      // lazy import keeps node tests free of model code
      const cat = MODEL_HOOK.createRig;
      if (!cat) return;
      const [model, variant] = this.modelId();
      this.rig?.dispose();
      this.rig = cat(model, variant, this.mass);
      this.model = this.rig.root;
      this.model.userData.entity = this;
      this.rig.setScale(this.visualScale());
      this.onModelBuilt(this.rig);
    } catch (e) {
      console.warn('[mobs] model failed for', this.type, e);
    }
    if (old && old !== this.model) {
      const parent = old.parent;
      old.removeFromParent();
      if (parent && this.model) parent.add(this.model);
    }
  }
  protected onModelBuilt(_rig: Rig) {}

  // ------------------------------------------------------------------ attributes
  override movementSpeed(): number {
    let s = this.moveAttr * this.moveMul;
    s *= 1 + 0.2 * this.effectLevel('speed');
    s *= Math.max(0, 1 - 0.15 * this.effectLevel('slowness'));
    return 43.17 * s * s;
  }
  override get armorValue(): number {
    let a = this.armor;
    for (let i = 2; i < 6; i++) a += this.equipment[i]?.item?.armor?.defense ?? 0;
    return a;
  }
  override get armorToughness(): number {
    let a = 0;
    for (let i = 2; i < 6; i++) a += this.equipment[i]?.item?.armor?.toughness ?? 0;
    return a;
  }
  get difficulty(): string {
    return (this.game as any)?.difficulty ?? 'normal';
  }
  get isBaby(): boolean {
    return false;
  }

  // ------------------------------------------------------------------ targeting helpers
  /** Can this mob attack the entity at all (alive, not creative...). */
  canAttack(e: Entity | null): e is LivingEntity {
    if (!e || e.removed || !(e instanceof LivingEntity) || e.dead || e === this) return false;
    const p = e as any;
    if (p.type === 'player' && (p.creative || p.spectator)) return false;
    return true;
  }
  canSee(e: Entity): boolean {
    return canSee(this, e);
  }
  setTarget(t: LivingEntity | null) {
    this.target = t;
  }
  /** Nearest player within range (null if none). */
  nearestPlayer(range: number): LivingEntity | null {
    const p = (this.game as any)?.player as LivingEntity | undefined;
    if (!p || p.dead || p.removed) return null;
    return p.pos.distanceToSquared(this.pos) <= range * range ? p : null;
  }
  entitiesNear(range: number, pred: (e: Entity) => boolean): Entity[] {
    const list = ((this.game as any)?.entities?.list ?? []) as Entity[];
    const r2 = range * range;
    const out: Entity[] = [];
    for (const e of list) if (e !== this && !e.removed && e.pos.distanceToSquared(this.pos) <= r2 && pred(e)) out.push(e);
    return out;
  }
  distanceToSqr(e: Entity) {
    return this.pos.distanceToSquared(e.pos);
  }

  /** Melee hit (Minecraft doHurtTarget with difficulty scaling vs players). */
  doHurtTarget(t: LivingEntity): boolean {
    let dmg = this.attackDamage;
    if (t.type === 'player') {
      const d = this.difficulty;
      if (d === 'peaceful') dmg = 0;
      else if (d === 'easy') dmg = Math.min(dmg / 2 + 1, dmg);
      else if (d === 'hard') dmg *= 1.5;
    }
    dmg += 3 * this.effectLevel('strength');
    const held = this.equipment[0]?.item;
    if (held?.attackDamage) dmg += held.attackDamage;
    const dir = new THREE.Vector3().subVectors(t.pos, this.pos).setY(0).normalize();
    const ok = t.hurt({ type: 'mob', attacker: this, direct: this, dir: dir.clone().setY(0.2).normalize(), impulse: 0.8 + dmg * 0.08, point: t.pos.clone().setY(t.pos.y + t.height * 0.6), weapon: held?.name ?? 'hand' }, dmg);
    if (ok) {
      t.knockback(0.4 + this.attackKnockback * 0.5, dir.x, dir.z);
      if (this.fireTicks > 0 && Math.random() < 0.3 * (this.difficulty === 'hard' ? 2 : 1)) t.fireTicks = Math.max(t.fireTicks, 40);
      this.onHitTarget(t);
    }
    this.swing();
    return ok;
  }
  protected onHitTarget(_t: LivingEntity) {}

  // ------------------------------------------------------------------ damage & death
  override hurt(src: DamageSource, amount: number): boolean {
    if (this.fireImmune && (src.type === 'fire' || src.type === 'lava')) return false;
    const ok = super.hurt(src, amount);
    if (ok) {
      const a = src.attacker as any;
      if (a && (a.type === 'player' || a.owner?.type === 'player' || a.isTame?.())) {
        this.lastHurtByPlayerTick = this.age;
        this.lastHurtByPlayer = a.type === 'player' ? a : a.owner ?? a;
      }
      this.noActionTime = 0;
    }
    return ok;
  }

  protected override deathRemoveTicks() {
    return this.data.keepBodyTicks ?? 20;
  }

  protected override onDeath(src: DamageSource) {
    const g = this.game as any;
    if (!g) return;
    const killedByPlayer = this.age - this.lastHurtByPlayerTick < 100;
    const player = killedByPlayer ? (this.lastHurtByPlayer as any) : null;
    let looting = 0;
    if (player?.type === 'player') looting = g.enchant?.lootingLevel?.(player) ?? player.mainHand?.ench?.looting ?? 0;
    if (g.gamerules?.doMobLoot !== false) {
      for (const s of this.rollLoot(killedByPlayer, looting)) this.dropStack(s);
      for (let i = 0; i < 6; i++) {
        const e = this.equipment[i] as ItemStack | null;
        if (e && this.data.dropChance?.[i] && Math.random() < this.data.dropChance[i] + looting * 0.01) this.dropStack({ ...e });
      }
    }
    if (killedByPlayer && !this.isBaby) {
      const xp = this.xpReward();
      if (xp > 0) g.spawnXp?.(this.pos.clone().setY(this.pos.y + this.height / 2), xp);
    }
    void src;
  }

  /** Loot table (override). */
  protected loot(): LootEntry[] {
    return [];
  }
  /** Experience dropped when killed by a player. */
  xpReward(): number {
    if (this.category === 'monster') {
      let n = 5;
      for (const e of this.equipment) if (e) n += 1 + Math.floor(Math.random() * 3);
      return n;
    }
    return 1 + Math.floor(Math.random() * 3);
  }

  /** Roll the loot table (exposed for tests). */
  rollLoot(killedByPlayer: boolean, looting: number, rand = Math.random): ItemStack[] {
    const out: ItemStack[] = [];
    for (const e of this.loot()) {
      if (e.playerKill && !killedByPlayer) continue;
      const chance = (e.chance ?? 1) + (e.lootingChance ?? 0) * looting;
      if (rand() >= chance) continue;
      const min = e.min ?? 1, max = e.max ?? min;
      let n = min + Math.floor(rand() * (max - min + 1));
      const lb = e.looting ?? (max > min || e.lootingChance === undefined ? 1 : 0);
      if (looting > 0 && lb > 0 && e.lootingChance === undefined) n += Math.floor(rand() * (looting * lb + 1));
      if (n <= 0) continue;
      const name = e.cooked && this.fireTicks > 0 ? e.cooked : e.item;
      const s = mkStack(name, n);
      if (s) out.push(s);
    }
    return out;
  }

  dropStack(s: ItemStack, yOff = 0.5) {
    const g = this.game as any;
    if (!g?.dropItem || !s) return;
    g.dropItem(s, this.pos.clone().setY(this.pos.y + yOff), new THREE.Vector3((Math.random() - 0.5) * 2, 3 + Math.random() * 1.5, (Math.random() - 0.5) * 2), 10);
  }

  // ------------------------------------------------------------------ despawning
  /** Removed when far from players (monsters, fish, bats). */
  removeWhenFarAway(): boolean {
    return this.category === 'monster' || this.category === 'ambient' || this.category === 'water';
  }
  /** Removed on Peaceful. */
  despawnsInPeaceful(): boolean {
    return this.category === 'monster';
  }

  // ------------------------------------------------------------------ interaction
  /** Right-click by a player. Return true when consumed. */
  interact(player: any, stack: ItemStack | null, hand: 'main' | 'off'): boolean {
    if (stack?.item.name === 'name_tag' && stack.data?.name) {
      this.data.customName = stack.data.name;
      this.persistenceRequired = true;
      if (!player.creative) player.inventory.consumeHeld(1, hand === 'main' ? player.inventory.selected : 40);
      return true;
    }
    return false;
  }

  /** Consume one item from the player's hand (survival). */
  protected useItem(player: any, hand: 'main' | 'off', n = 1) {
    if (player.creative) return;
    player.inventory.consumeHeld(n, hand === 'main' ? player.inventory.selected : 40);
  }
  /** Replace the held item (bucket -> milk bucket). */
  protected exchangeItem(player: any, hand: 'main' | 'off', result: ItemStack | null) {
    if (!result) return;
    const inv = player.inventory;
    const slot = hand === 'main' ? inv.selected : 40;
    const cur = inv.get(slot);
    if (player.creative) {
      if (inv.count(result.item) === 0) inv.add(result);
      return;
    }
    if (cur && cur.count === 1) inv.set(slot, result);
    else {
      inv.consumeHeld(1, slot);
      if (inv.add(result) > 0) (this.game as any).dropItem?.(result, player.pos.clone());
    }
  }

  // ------------------------------------------------------------------ sounds / particles
  playSound(name: string | undefined, volume = 1, pitch = 1) {
    if (!name) return;
    (this.game as any)?.audio?.play?.(name, { pos: { x: this.pos.x, y: this.pos.y + this.height * 0.6, z: this.pos.z }, volume, pitch: pitch * (this.isBaby ? 1.4 : 1) });
  }
  particles(kind: string, count = 1, spread = 0.5, yOff = 0.5) {
    const g = this.game as any;
    if (!g?.particles?.emit) return;
    try {
      g.particles.emit(kind, new THREE.Vector3(this.pos.x, this.pos.y + this.height * yOff, this.pos.z), { count, spread, entity: this });
    } catch { /* optional service */ }
  }

  // ------------------------------------------------------------------ ticking
  override tick() {
    super.tick();
    if (this.dead || this.removed) return;
    if (this.attackCooldown > 0) this.attackCooldown--;
    // ambient sound
    if (this.sounds.say && Math.random() * 1000 < this.ambientTime++) {
      this.ambientTime = -this.ambientInterval;
      this.playSound(this.sounds.say);
    }
    if (this.burnsInDaylight) this.tickSunBurn();
    this.noActionTime++;
    if (this.aiDisabled || MOB_FLAGS.freeze) {
      this.intent.forward = 0; this.intent.strafe = 0; this.intent.jump = false;
      this.moveMul = 0;
      return;
    }
    // far mobs think less often
    const p = (this.game as any)?.player as Entity | undefined;
    const far = p ? p.pos.distanceToSquared(this.pos) > 48 * 48 : false;
    if (far && (this.age + this.id) % 4 !== 0) return;
    this.serverAiStep();
  }

  /** One AI step (Minecraft serverAiStep order). */
  protected serverAiStep() {
    if (this.target && (!this.canAttack(this.target) || this.target.removed)) this.target = null;
    this.targets.tick();
    this.goals.tick();
    this.navigation.tick();
    this.customServerAiStep();
    this.moveControl.tick();
    this.lookControl.tick();
    this.intent.jump = this.jumping;
    this.jumping = false;
  }
  protected customServerAiStep() {}

  /** Undead burn in daylight unless shaded, in water/rain, or wearing a helmet. */
  protected tickSunBurn() {
    const g = this.game as any;
    if (!g || g.dimension !== 'overworld' || !g.isDay || this.inWater || this.isBaby && false) return;
    if (g.weather?.raining && g.weather.rain > 0.2) return;
    const brightness = g.skyLightFactor ?? 1;
    if (brightness < 0.5) return;
    const ex = this.pos.x, ey = this.pos.y + this.eyeHeight, ez = this.pos.z;
    if (!seesSky(this.world, ex, ey, ez)) return;
    if (Math.random() * 30 >= (brightness - 0.4) * 2 * 30) return;
    const helmet = this.equipment[5] as ItemStack | null;
    if (helmet) {
      if (helmet.item.durability) {
        helmet.damage += Math.floor(Math.random() * 2);
        if (helmet.damage >= helmet.item.durability) this.equipment[5] = null;
      }
      return;
    }
    this.fireTicks = Math.max(this.fireTicks, 160);
  }

  // ------------------------------------------------------------------ physics
  override physicsStep(dt: number) {
    if (!this.dead) {
      // turn toward the move direction at a limited rate
      if (this.moveMul > 0 || this.intent.forward !== 0 || this.intent.strafe !== 0) {
        const d = wrapAngle(this.targetYaw - this.yaw);
        const st = this.turnSpeed * dt * (this.moveMul > 0 ? 1 : 0.5);
        this.yaw += Math.max(-st, Math.min(st, d));
      } else {
        // idle: let the body slowly follow the head
        const d = wrapAngle(this.headYawW - this.yaw);
        if (Math.abs(d) > 0.8) this.yaw += Math.sign(d) * Math.min(Math.abs(d) - 0.8, 3 * dt);
      }
    }
    this.travelMob(dt);
    if (!this.dead) this.pushOthers(dt);
    // footsteps
    if (this.onGround && !this.dead) {
      this.stepDist += Math.hypot(this.pos.x - this.prevPos.x, this.pos.z - this.prevPos.z);
      if (this.stepDist > this.stepInterval()) {
        this.stepDist = 0;
        (this.game as any)?.events?.emit('footstep', { entity: this, block: this.blockBelow() });
      }
    }
  }
  /** Movement integration (flying/swimming mobs override). */
  protected travelMob(dt: number) {
    super.physicsStep(dt);
  }
  stepInterval() {
    return 1.4 * Math.max(0.5, this.width + 0.4);
  }

  /** Soft separation from overlapping living entities (Minecraft entity pushing). */
  private pushOthers(dt: number) {
    const ents = (this.game as any)?.entities;
    if (!ents) return;
    const b = this.box;
    for (const e of ents.list as Entity[]) {
      if (e === this || e.removed || !(e instanceof LivingEntity) || (e as LivingEntity).dead || (e as any).noPush) continue;
      if (!e.box.intersects(b)) continue;
      const dx = e.pos.x - this.pos.x, dz = e.pos.z - this.pos.z;
      const d = Math.hypot(dx, dz) || 0.01;
      const k = Math.min(1, ((this.width + e.width) / 2 - d) * 4) * 6 * dt;
      if (k <= 0) continue;
      const mr = this.mass / (this.mass + e.mass);
      if (e.type !== 'player') { e.vel.x += (dx / d) * k * 10 * mr; e.vel.z += (dz / d) * k * 10 * mr; }
      this.vel.x -= (dx / d) * k * 10 * (1 - mr);
      this.vel.z -= (dz / d) * k * 10 * (1 - mr);
    }
  }

  // ------------------------------------------------------------------ visuals
  /** Fill per-mob animation extras (override). */
  protected fillAnim(_st: AnimState, _alpha: number) {}

  override updateVisual(alpha: number, dt: number) {
    const rig = this.rig;
    if (!rig || !this.model) return;
    const g = this.game as any;
    const cam = g?.cameraCtl?.camera?.position as THREE.Vector3 | undefined;
    const p = this.renderPos(alpha, _v);
    const camD2 = cam ? cam.distanceToSquared(p) : 0;
    const ragdoll = this.data.ragdoll === true;
    // materials: light, hurt flash
    const L = this.world.getLight(Math.floor(p.x), Math.floor(p.y + Math.min(1.5, this.height * 0.6)), Math.floor(p.z));
    const hurt = this.dead ? 1 : this.hurtTime > 0 ? Math.min(1, (this.hurtTime + 1 - alpha) / 2) : 0;
    for (const m of rig.materials) {
      setEntityLight(m, L);
      m.uniforms.u_hurt.value = hurt;
    }
    if (ragdoll) return;
    if (camD2 > 128 * 128) { this.model.visible = false; return; }
    this.model.visible = true;
    this.model.position.copy(p);
    let by = this.prevBodyYaw + wrapAngle(this.bodyYaw - this.prevBodyYaw) * alpha;
    this.model.rotation.set(0, by, 0);
    // far mobs animate at a reduced rate
    this.visualTime += dt;
    if (camD2 > 48 * 48 && (g?.renderer?.frame ?? 0) % 3 !== this.id % 3) return;
    const st = this.anim;
    st.time = this.visualTime;
    st.limbSwing = this.limbSwing;
    st.limbAmount = this.prevLimbSwingAmount + (this.limbSwingAmount - this.prevLimbSwingAmount) * alpha;
    st.speed = Math.hypot(this.vel.x, this.vel.z);
    st.headYaw = wrapAngle(this.headYawW - by);
    st.headPitch = this.pitch;
    st.attack = this.swingProgress >= 0 ? Math.min(1, this.swingProgress + alpha / 6) : -1;
    st.onGround = this.onGround;
    st.inWater = this.inWater;
    st.aggressive = this.aggressive || !!this.target;
    st.vy = this.vel.y;
    const dy = wrapAngle(by - this.lastBodyYaw);
    this.lastBodyYaw = by;
    st.turnRate = dt > 0 ? dy / dt : 0;
    st.baby = this.isBaby;
    st.hurt = this.hurtTime > 0 ? this.hurtTime / this.hurtDuration : 0;
    const il = Math.hypot(this.impact.x, this.impact.z);
    if (il > 1e-4) {
      const ix = this.impact.x / Math.max(1, il), iz = this.impact.z / Math.max(1, il);
      const c = Math.cos(by), s = Math.sin(by);
      st.impactX = ix * c - iz * s;
      st.impactZ = ix * s + iz * c;
    }
    this.fillAnim(st, alpha);
    if (MOB_FLAGS.pose) applyPose(st, MOB_FLAGS.pose, this.visualTime);
    rig.resetPose();
    MODEL_HOOK.animate?.(this.modelId()[0], rig, st, dt, this.animMem);
    // Minecraft tip-over death (when no ragdoll system took the body)
    if (this.dead) {
      const f = Math.min(1, Math.sqrt(Math.max(0, (this.deathTime + alpha - 1) / 20) * 1.6));
      rig.body.rotation.z = f * (Math.PI / 2) * this.deathFlip();
      if (this.deathTime >= this.deathRemoveTicks() - 1 && !this.poofed) {
        this.poofed = true;
        this.particles('poof', 20, this.width);
      }
    } else rig.body.rotation.z = 0;
  }
  /** Death tip-over angle multiplier (spiders flip on their back: 2). */
  protected deathFlip() {
    return 1;
  }

  /** Wound API (see models/rig.ts): rest-space position, severity 0..1. */
  addWound(localPos: THREE.Vector3, severity: number) {
    this.rig?.addWound(localPos, severity);
  }
  /** Wound at a world-space point (nearest part). */
  addWoundWorld(worldPos: THREE.Vector3, severity: number) {
    this.rig?.addWoundWorld(worldPos, severity);
  }

  override remove() {
    super.remove();
  }

  // ------------------------------------------------------------------ save
  override serialize(): any {
    return {
      ...super.serialize(),
      hp: this.health, fire: this.fireTicks, air: this.air, pr: this.persistenceRequired || undefined,
      eq: this.equipment.map((s: ItemStack | null) => (s ? { i: s.item.name, c: s.count, d: s.damage } : null)),
      fx: [...this.effects.values()], ex: this.saveExtra(),
    };
  }
  override deserialize(o: any) {
    super.deserialize(o);
    this.health = o.hp ?? this.health;
    this.fireTicks = o.fire ?? 0;
    this.air = o.air ?? this.maxAir;
    this.persistenceRequired = !!o.pr;
    if (Array.isArray(o.eq)) o.eq.forEach((s: any, i: number) => { this.equipment[i] = s ? mkStack(s.i, s.c) : null; if (this.equipment[i] && s.d) this.equipment[i].damage = s.d; });
    for (const e of o.fx ?? []) this.effects.set(e.id, e);
    this.headYawW = this.bodyYaw = this.targetYaw = this.yaw;
    if (o.ex) this.loadExtra(o.ex);
  }
  protected saveExtra(): any {
    return undefined;
  }
  protected loadExtra(_o: any) {}
}

/** Debug pose override (summon &mobpose=walk|attack). */
function applyPose(st: AnimState, pose: string, t: number) {
  if (pose === 'walk' || pose === 'run') {
    const sp = pose === 'run' ? 5.5 : 2.4;
    st.speed = sp;
    st.limbAmount = Math.min(1, sp / 4.3);
    st.limbSwing = t * sp * 1.6;
  } else if (pose === 'attack') {
    st.attack = (t * 1.5) % 1;
    st.aggressive = true;
  }
}

/** Visual hooks installed by the model catalog (keeps node tests free of rendering code). */
export const MODEL_HOOK: {
  createRig: ((model: string, variant: string, mass: number) => Rig) | null;
  animate: ((model: string, rig: Rig, st: AnimState, dt: number, mem: Record<string, any>) => void) | null;
} = { createRig: null, animate: null };
