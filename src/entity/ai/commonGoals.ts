/**
 * Common Minecraft AI goals: float, panic, stroll, look at player / around, melee attack,
 * nearest-attackable-target, hurt-by-target (with alerting), avoid entity, tempt, flee sun,
 * leap at target, follow mob.
 */
import * as THREE from 'three';
import { Flag, type Goal } from './goals';
import type { Mob } from '../mobs/mob';
import { LivingEntity } from '../living';
import type { Entity } from '../entity';
import { Pathfinder } from './pathfinder';
import { seesSky } from './sensing';
import { BLOCKS } from '../../world/blocks/registry';

const rnd = (n: number) => Math.floor(Math.random() * n);

/** A random standable position around the mob (Minecraft DefaultRandomPos), scored. */
export function randomPos(mob: Mob, h: number, v: number, opts: { avoidWater?: boolean; away?: THREE.Vector3; toward?: THREE.Vector3; score?: (x: number, y: number, z: number) => number } = {}): THREE.Vector3 | null {
  const pf = new Pathfinder(mob.world, { width: mob.width, height: mob.height, aquatic: mob.aquatic });
  let best: THREE.Vector3 | null = null, bestS = -Infinity;
  for (let i = 0; i < 10; i++) {
    let dx = rnd(2 * h + 1) - h, dz = rnd(2 * h + 1) - h;
    const dy = rnd(2 * v + 1) - v;
    if (opts.away) {
      const ax = mob.pos.x - opts.away.x, az = mob.pos.z - opts.away.z;
      if (dx * ax + dz * az < 0) { dx = -dx; dz = -dz; }
    }
    if (opts.toward) {
      const ax = opts.toward.x - mob.pos.x, az = opts.toward.z - mob.pos.z;
      if (dx * ax + dz * az < 0) { dx = -dx; dz = -dz; }
    }
    const x = Math.floor(mob.pos.x) + dx, z = Math.floor(mob.pos.z) + dz;
    const n = pf.nodeNear(x + 0.5, Math.floor(mob.pos.y) + dy, z + 0.5);
    if (!n) continue;
    const st = mob.world.getBlock(n.x, Math.floor(n.floor + 0.01), n.z);
    const water = BLOCKS[st >>> 4]?.liquid === 1;
    if (opts.avoidWater && water && !mob.inWater) continue;
    let s = Math.random() * 0.5;
    if (opts.score) s += opts.score(n.x, n.floor, n.z);
    if (s > bestS) { bestS = s; best = new THREE.Vector3(n.x + 0.5, n.floor, n.z + 0.5); }
  }
  return best;
}

export class FloatGoal implements Goal {
  flags = 0;
  constructor(readonly mob: Mob) {
    this.flags = Flag.JUMP;
  }
  canUse() {
    return this.mob.inWater && this.mob.fluidDepth > 0.4 || this.mob.inLava;
  }
  tick() {
    if (Math.random() < 0.8) this.mob.jumping = true;
  }
}

export class PanicGoal implements Goal {
  flags = 0;
  private to: THREE.Vector3 | null = null;
  constructor(readonly mob: Mob, readonly speed: number) {
    this.flags = Flag.MOVE;
  }
  shouldPanic() {
    const m = this.mob;
    return (m.age - m.lastHurtByTick < 100 && m.lastAttacker !== null) || m.fireTicks > 0;
  }
  canUse() {
    if (!this.shouldPanic()) return false;
    const m = this.mob;
    this.to = randomPos(m, 5, 4, { away: m.lastAttacker?.pos });
    return !!this.to;
  }
  start() {
    this.mob.navigation.moveTo(this.to!.x, this.to!.y, this.to!.z, this.speed);
    this.mob.data.panic = true;
  }
  stop() {
    this.mob.data.panic = false;
  }
  canContinueToUse() {
    return !this.mob.navigation.isDone();
  }
}

export class RandomStrollGoal implements Goal {
  flags = 0;
  private to: THREE.Vector3 | null = null;
  constructor(readonly mob: Mob, readonly speed: number, readonly interval = 120, readonly avoidWater = true, readonly score?: (x: number, y: number, z: number) => number) {
    this.flags = Flag.MOVE;
  }
  canUse() {
    const m = this.mob;
    if (m.noActionTime >= 100 && m.category === 'monster' && rnd(4) !== 0) return false;
    if (rnd(this.interval) !== 0) return false;
    this.to = randomPos(m, 10, 7, { avoidWater: this.avoidWater, score: this.score });
    return !!this.to;
  }
  start() {
    this.mob.navigation.moveTo(this.to!.x, this.to!.y, this.to!.z, this.speed);
  }
  canContinueToUse() {
    return !this.mob.navigation.isDone();
  }
  stop() {
    this.mob.navigation.stop();
  }
}

export class LookAtPlayerGoal implements Goal {
  flags = 0;
  private look: Entity | null = null;
  private time = 0;
  constructor(readonly mob: Mob, readonly range = 8, readonly prob = 0.02, readonly pred?: (e: Entity) => boolean) {
    this.flags = Flag.LOOK;
  }
  canUse() {
    const m = this.mob;
    if (Math.random() >= this.prob) return false;
    if (m.target) { this.look = m.target; return true; }
    const cands = this.pred ? m.entitiesNear(this.range, this.pred) : [m.nearestPlayer(this.range)].filter(Boolean) as Entity[];
    this.look = cands[0] ?? null;
    return !!this.look;
  }
  start() {
    this.time = 40 + rnd(40);
  }
  canContinueToUse() {
    const l = this.look;
    return !!l && !l.removed && this.time > 0 && l.pos.distanceToSquared(this.mob.pos) < this.range * this.range;
  }
  tick() {
    this.time--;
    if (this.look) this.mob.lookControl.lookAtEntity(this.look);
  }
}

export class RandomLookAroundGoal implements Goal {
  flags = 0;
  private rx = 0;
  private rz = 0;
  private time = 0;
  constructor(readonly mob: Mob) {
    this.flags = Flag.MOVE | Flag.LOOK;
  }
  canUse() {
    return Math.random() < 0.02;
  }
  canContinueToUse() {
    return this.time >= 0;
  }
  start() {
    const a = Math.random() * Math.PI * 2;
    this.rx = Math.cos(a);
    this.rz = Math.sin(a);
    this.time = 20 + rnd(20);
  }
  tick() {
    this.time--;
    const m = this.mob;
    m.lookControl.lookAt(m.pos.x + this.rx, m.pos.y + m.eyeHeight, m.pos.z + this.rz);
  }
}

export class MeleeAttackGoal implements Goal {
  flags = 0;
  private recalc = 0;
  private ticksUntilAttack = 0;
  constructor(readonly mob: Mob, readonly speed: number, readonly followUnseen = false, readonly interval = 20) {
    this.flags = Flag.MOVE | Flag.LOOK;
  }
  canUse() {
    const t = this.mob.target;
    if (!this.mob.canAttack(t)) return false;
    return this.mob.navigation.moveToEntity(t, this.speed, 0.5) || this.inReach(t);
  }
  canContinueToUse() {
    const t = this.mob.target;
    if (!this.mob.canAttack(t)) return false;
    if (!this.followUnseen) return !this.mob.navigation.isDone() || this.inReach(t);
    return t.pos.distanceToSquared(this.mob.pos) < this.mob.followRange ** 2;
  }
  start() {
    this.mob.aggressive = true;
    this.recalc = 0;
    this.ticksUntilAttack = 0;
  }
  stop() {
    this.mob.aggressive = false;
    this.mob.navigation.stop();
  }
  reach(t: LivingEntity) {
    return this.mob.width * 2 * this.mob.width * 2 + t.width;
  }
  inReach(t: LivingEntity) {
    const dx = t.pos.x - this.mob.pos.x, dz = t.pos.z - this.mob.pos.z, dy = t.pos.y - this.mob.pos.y;
    return dx * dx + dz * dz <= this.reach(t) && dy > -1.5 && dy < this.mob.height + 0.5;
  }
  tick() {
    const m = this.mob, t = m.target;
    if (!t) return;
    m.lookControl.lookAtEntity(t, 30, 30);
    const d2 = m.pos.distanceToSquared(t.pos);
    this.recalc = Math.max(0, this.recalc - 1);
    if ((this.followUnseen || m.canSee(t)) && this.recalc <= 0) {
      this.recalc = 4 + rnd(7);
      if (d2 > 1024) this.recalc += 10;
      else if (d2 > 256) this.recalc += 5;
      if (!m.navigation.moveToEntity(t, this.speed, 0.5)) this.recalc += 15;
    }
    // close range: steer straight at the target
    if (d2 < 4) m.moveControl.setWanted(t.pos.x, t.pos.y, t.pos.z, this.speed);
    this.ticksUntilAttack = Math.max(0, this.ticksUntilAttack - 1);
    if (this.inReach(t) && this.ticksUntilAttack <= 0) {
      this.ticksUntilAttack = this.interval;
      m.doHurtTarget(t);
    }
  }
}

export class NearestAttackableTargetGoal implements Goal {
  flags = 0;
  constructor(readonly mob: Mob, readonly pred: (e: Entity) => boolean, readonly mustSee = true, readonly interval = 10, readonly rangeMul = 1) {
    this.flags = Flag.TARGET;
  }
  canUse() {
    const m = this.mob;
    if (this.interval > 0 && rnd(this.interval) !== 0) return false;
    if (m.target && m.canAttack(m.target)) return false;
    const range = m.followRange * this.rangeMul;
    let best: LivingEntity | null = null, bd = range * range;
    for (const e of m.entitiesNear(range, this.pred)) {
      if (!m.canAttack(e)) continue;
      let d = e.pos.distanceToSquared(m.pos);
      // sneaking/invisible players are harder to detect
      const pl = e as any;
      if (pl.sneaking) d /= 0.64;
      if (pl.hasEffect?.('invisibility')) d /= 0.07 * 0.07;
      if (d > bd) continue;
      if (this.mustSee && !m.canSee(e)) continue;
      best = e;
      bd = d;
    }
    if (best) m.setTarget(best);
    return !!best;
  }
  canContinueToUse() {
    const m = this.mob, t = m.target;
    if (!m.canAttack(t)) return false;
    return t.pos.distanceToSquared(m.pos) <= (m.followRange * 1.2) ** 2;
  }
  stop() {
    this.mob.setTarget(null);
  }
}

export class HurtByTargetGoal implements Goal {
  flags = 0;
  private lastHurt = -1;
  constructor(readonly mob: Mob, readonly alert?: (e: Mob) => boolean, readonly ignore?: (e: Entity) => boolean) {
    this.flags = Flag.TARGET;
  }
  canUse() {
    const m = this.mob;
    const a = m.lastAttacker;
    if (!a || m.lastHurtByTick === this.lastHurt || m.age - m.lastHurtByTick > 100) return false;
    if (this.ignore?.(a)) return false;
    return m.canAttack(a);
  }
  start() {
    const m = this.mob;
    this.lastHurt = m.lastHurtByTick;
    const a = m.lastAttacker as LivingEntity;
    m.setTarget(a);
    if (this.alert) for (const o of m.entitiesNear(m.followRange, (e) => this.alert!(e as Mob))) {
      const om = o as Mob;
      if (!om.target && om.canAttack(a)) om.setTarget(a);
    }
  }
  canContinueToUse() {
    const m = this.mob, t = m.target;
    return m.canAttack(t) && t.pos.distanceToSquared(m.pos) < (m.followRange * 1.5) ** 2;
  }
  stop() {
    this.mob.setTarget(null);
  }
}

export class AvoidEntityGoal implements Goal {
  flags = 0;
  private from: Entity | null = null;
  constructor(readonly mob: Mob, readonly pred: (e: Entity) => boolean, readonly dist: number, readonly walk: number, readonly sprint: number) {
    this.flags = Flag.MOVE;
  }
  canUse() {
    const m = this.mob;
    const near = m.entitiesNear(this.dist, this.pred);
    if (!near.length) return false;
    near.sort((a, b) => a.pos.distanceToSquared(m.pos) - b.pos.distanceToSquared(m.pos));
    this.from = near[0];
    const to = randomPos(m, 16, 7, { away: this.from.pos });
    if (!to || to.distanceToSquared(this.from.pos) < this.from.pos.distanceToSquared(m.pos)) return false;
    return m.navigation.moveTo(to.x, to.y, to.z, this.walk);
  }
  canContinueToUse() {
    return !this.mob.navigation.isDone();
  }
  tick() {
    const m = this.mob;
    if (this.from) m.navigation.speed = m.pos.distanceToSquared(this.from.pos) < 49 ? this.sprint : this.walk;
  }
  stop() {
    this.from = null;
  }
}

export class TemptGoal implements Goal {
  flags = 0;
  private player: any = null;
  private calm = 0;
  constructor(readonly mob: Mob, readonly speed: number, readonly items: (name: string) => boolean) {
    this.flags = Flag.MOVE | Flag.LOOK;
  }
  canUse() {
    if (this.calm > 0) { this.calm--; return false; }
    const p = this.mob.nearestPlayer(10) as any;
    if (!p || p.spectator) return false;
    const holding = [p.mainHand, p.offHand].some((s: any) => s && this.items(s.item.name));
    if (!holding) return false;
    this.player = p;
    return true;
  }
  tick() {
    const m = this.mob, p = this.player;
    m.lookControl.lookAtEntity(p, m.maxHeadYaw * 57, 40);
    if (m.pos.distanceToSquared(p.pos) < 6.25) m.navigation.stop();
    else m.navigation.moveToEntity(p, this.speed, 1.5);
  }
  stop() {
    this.player = null;
    this.calm = 100;
    this.mob.navigation.stop();
  }
}

/** Undead seek shade while burning in daylight (FleeSunGoal). */
export class FleeSunGoal implements Goal {
  flags = 0;
  private to: THREE.Vector3 | null = null;
  constructor(readonly mob: Mob, readonly speed: number) {
    this.flags = Flag.MOVE;
  }
  canUse() {
    const m = this.mob, g = m.game as any;
    if (m.target || !g?.isDay || m.fireTicks <= 0) return false;
    if (!seesSky(m.world, m.pos.x, m.pos.y + m.eyeHeight, m.pos.z)) return false;
    this.to = randomPos(m, 10, 3, { score: (x, y, z) => (seesSky(m.world, x + 0.5, y + 1.5, z + 0.5) ? -10 : 10) });
    return !!this.to && !seesSky(m.world, this.to.x, this.to.y + 1.5, this.to.z);
  }
  start() {
    this.mob.navigation.moveTo(this.to!.x, this.to!.y, this.to!.z, this.speed);
  }
  canContinueToUse() {
    return !this.mob.navigation.isDone();
  }
}

export class LeapAtTargetGoal implements Goal {
  flags = 0;
  constructor(readonly mob: Mob, readonly yd: number) {
    this.flags = Flag.JUMP | Flag.MOVE;
  }
  canUse() {
    const m = this.mob, t = m.target;
    if (!t || !m.onGround) return false;
    const d2 = m.pos.distanceToSquared(t.pos);
    return d2 >= 4 && d2 <= 16 && rnd(5) === 0;
  }
  canContinueToUse() {
    return !this.mob.onGround;
  }
  start() {
    const m = this.mob, t = m.target!;
    const dx = t.pos.x - m.pos.x, dz = t.pos.z - m.pos.z;
    const l = Math.hypot(dx, dz) || 1;
    m.vel.x += (dx / l) * 0.4 * 20 * 0.8 + m.vel.x * 0.2;
    m.vel.z += (dz / l) * 0.4 * 20 * 0.8 + m.vel.z * 0.2;
    m.vel.y = this.yd * 20;
    m.data.leaping = true;
  }
  stop() {
    this.mob.data.leaping = false;
  }
}

/** Follow another mob (babies follow parents, fish schools ...). */
export class FollowMobGoal implements Goal {
  flags = 0;
  private leader: Entity | null = null;
  private recalc = 0;
  constructor(readonly mob: Mob, readonly speed: number, readonly find: () => Entity | null, readonly minD = 3, readonly maxD = 16) {
    this.flags = Flag.MOVE;
  }
  canUse() {
    if (rnd(10) !== 0) return false;
    this.leader = this.find();
    if (!this.leader) return false;
    const d2 = this.leader.pos.distanceToSquared(this.mob.pos);
    return d2 > this.minD * this.minD && d2 < this.maxD * this.maxD;
  }
  canContinueToUse() {
    const l = this.leader;
    if (!l || l.removed) return false;
    const d2 = l.pos.distanceToSquared(this.mob.pos);
    return d2 > this.minD * this.minD * 0.5 && d2 < this.maxD * this.maxD * 1.5;
  }
  tick() {
    if (--this.recalc > 0 || !this.leader) return;
    this.recalc = 10;
    this.mob.navigation.moveToEntity(this.leader, this.speed, 1.5);
  }
  stop() {
    this.leader = null;
    this.mob.navigation.stop();
  }
}

export const isPlayer = (e: Entity) => e.type === 'player';
