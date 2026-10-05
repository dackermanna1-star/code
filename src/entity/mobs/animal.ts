/**
 * Ageable animals: babies (negative age, grow up in 20 minutes; feeding speeds it up), love
 * mode when fed their food, breeding (partner search, baby spawn, XP, cooldowns), following
 * parents, tempting, panicking.
 */
import * as THREE from 'three';
import { Mob } from './mob';
import { Flag, type Goal } from '../ai/goals';
import { FloatGoal, FollowMobGoal, LookAtPlayerGoal, PanicGoal, RandomLookAroundGoal, RandomStrollGoal, TemptGoal } from '../ai/commonGoals';
import { createEntity } from '../manager';
import type { ItemStack } from '../../game/items/registry';
import { BLOCKS } from '../../world/blocks/registry';

export const BABY_AGE = -24000;
export const LOVE_TICKS = 600;
export const BREED_COOLDOWN = 6000;

export abstract class AgeableMob extends Mob {
  /** < 0 baby (ticks until adult), > 0 breeding cooldown. */
  ageTicks = 0;
  override get isBaby() {
    return this.ageTicks < 0;
  }
  setBaby(b: boolean) {
    this.ageTicks = b ? BABY_AGE : 0;
    this.rig?.setScale(this.visualScale());
  }
  override visualScale(): number {
    return this.isBaby ? 0.5 : 1;
  }
  /** Age up by a fraction of the remaining time (feeding babies). */
  ageUp(seconds: number) {
    if (this.ageTicks < 0) {
      this.ageTicks = Math.min(0, this.ageTicks + seconds * 20);
      if (this.ageTicks === 0) this.onGrownUp();
    }
  }
  protected onGrownUp() {
    this.rig?.setScale(this.visualScale());
    this.updateSize();
  }
  protected updateSize() {}
  override tick() {
    super.tick();
    if (this.dead) return;
    if (this.ageTicks < 0) {
      this.ageTicks++;
      if (this.ageTicks === 0) this.onGrownUp();
    } else if (this.ageTicks > 0) this.ageTicks--;
  }
  protected override saveExtra(): any {
    return { age: this.ageTicks };
  }
  protected override loadExtra(o: any) {
    this.ageTicks = o?.age ?? 0;
  }
}

export abstract class Animal extends AgeableMob {
  inLove = 0;
  loveCause: any = null;
  override category = 'creature' as const;

  /** Breeding/tempting food. */
  abstract isFood(name: string): boolean;

  protected override registerGoals() {
    this.goals.add(0, new FloatGoal(this));
    this.goals.add(1, new PanicGoal(this, 2.0));
    this.goals.add(2, new BreedGoal(this, 1.0));
    this.goals.add(3, new TemptGoal(this, 1.25, (n) => this.isFood(n)));
    this.goals.add(4, new FollowMobGoal(this, 1.1, () => this.findParent(), 3, 8));
    this.goals.add(5, new RandomStrollGoal(this, 1.0, 120, true, (x, y, z) => (BLOCKS[this.world.getBlock(x, Math.floor(y) - 1, z) >>> 4]?.name === 'grass_block' ? 10 : 0)));
    this.goals.add(6, new LookAtPlayerGoal(this, 6));
    this.goals.add(7, new RandomLookAroundGoal(this));
  }

  findParent(): Mob | null {
    if (!this.isBaby) return null;
    let best: Mob | null = null, bd = 64;
    for (const e of this.entitiesNear(8, (e) => e.type === this.type)) {
      const a = e as Animal;
      if (a.isBaby) continue;
      const d = a.pos.distanceToSquared(this.pos);
      if (d < bd) { bd = d; best = a; }
    }
    return best;
  }

  canFallInLove() {
    return this.ageTicks === 0 && this.inLove <= 0 && !this.dead;
  }
  setInLove(player: any) {
    this.inLove = LOVE_TICKS;
    this.loveCause = player;
    this.game?.events.emit('loveMode', { entity: this, pos: this.pos.clone(), player });
    this.particles('heart', 7, 0.6, 1);
  }
  isInLove() {
    return this.inLove > 0;
  }
  canMate(o: Animal) {
    return o !== this && o.type === this.type && this.isInLove() && o.isInLove();
  }

  override tick() {
    super.tick();
    if (this.inLove > 0) {
      this.inLove--;
      if (this.inLove % 10 === 0) this.particles('heart', 1, 0.6, 1);
    }
  }

  override interact(player: any, stack: ItemStack | null, hand: 'main' | 'off'): boolean {
    if (stack && this.isFood(stack.item.name)) {
      if (this.canFallInLove()) {
        this.useItem(player, hand);
        this.setInLove(player);
        this.playSound(this.sounds.say);
        return true;
      }
      if (this.isBaby) {
        this.useItem(player, hand);
        this.ageUp(-this.ageTicks / 20 * 0.1);
        this.particles('happy_villager', 5, 0.5, 1);
        return true;
      }
    }
    return super.interact(player, stack, hand);
  }

  /** Create the offspring (override for colour inheritance...). */
  createChild(_partner: Animal): AgeableMob | null {
    const c = createEntity(this.type) as AgeableMob | null;
    return c;
  }

  breedWith(partner: Animal) {
    const g = this.game as any;
    const child = this.createChild(partner);
    this.ageTicks = BREED_COOLDOWN;
    partner.ageTicks = BREED_COOLDOWN;
    this.inLove = 0;
    partner.inLove = 0;
    if (!child) return;
    child.setBaby(true);
    child.persistenceRequired = true;
    child.yaw = child.bodyYaw = child.headYawW = this.yaw;
    if (g?.spawn) g.spawn(child, this.pos.x, this.pos.y, this.pos.z);
    else { child.setPos(this.pos.x, this.pos.y, this.pos.z); g?.entities?.add(child); }
    g?.events?.emit('breed', { pos: this.pos.clone(), parentA: this, parentB: partner, child });
    this.particles('heart', 7, 0.8, 1);
    if (g?.gamerules?.doMobLoot !== false) g?.spawnXp?.(this.pos.clone().setY(this.pos.y + 0.5), 1 + Math.floor(Math.random() * 7));
  }

  protected override saveExtra(): any {
    return { ...super.saveExtra(), love: this.inLove || undefined };
  }
  protected override loadExtra(o: any) {
    super.loadExtra(o);
    this.inLove = o?.love ?? 0;
  }
}

/** Two animals in love find each other, approach and make a baby after 60 ticks. */
export class BreedGoal implements Goal {
  flags = 0;
  partner: Animal | null = null;
  loveTime = 0;
  constructor(readonly mob: Animal, readonly speed: number) {
    this.flags = Flag.MOVE | Flag.LOOK;
  }
  canUse() {
    if (!this.mob.isInLove()) return false;
    this.partner = this.findPartner();
    return !!this.partner;
  }
  canContinueToUse() {
    const p = this.partner;
    return !!p && !p.dead && !p.removed && p.isInLove() && this.loveTime < 60;
  }
  start() {
    this.loveTime = 0;
  }
  stop() {
    this.partner = null;
    this.loveTime = 0;
  }
  tick() {
    const m = this.mob, p = this.partner!;
    m.lookControl.lookAtEntity(p, 10, m.maxHeadYaw * 57);
    m.navigation.moveToEntity(p, this.speed, 1);
    this.loveTime++;
    if (this.loveTime >= 60 && m.pos.distanceToSquared(p.pos) < 9) m.breedWith(p);
  }
  findPartner(): Animal | null {
    let best: Animal | null = null, bd = Infinity;
    for (const e of this.mob.entitiesNear(8, (e) => e.type === this.mob.type)) {
      const a = e as Animal;
      if (!this.mob.canMate(a)) continue;
      const d = a.pos.distanceToSquared(this.mob.pos);
      if (d < bd) { bd = d; best = a; }
    }
    return best;
  }
}

export const tmpV = new THREE.Vector3();
