/**
 * Farm animals: cow (milking), pig, sheep (16 wool colours, shearing, dyeing, grass eating,
 * wool regrowth), chicken (egg laying, flapping slow fall).
 */
import { Animal } from './animal';
import { Flag, type Goal } from '../ai/goals';
import type { LootEntry } from './mob';
import { mkStack } from './items';
import { BLOCKS, S } from '../../world/blocks/registry';
import { SetFlags } from '../../world/world';
import { DYE_COLORS } from '../../world/blocks/blocks';
import type { ItemStack } from '../../game/items/registry';
import type { AnimState } from '../models/anim/common';

export class Cow extends Animal {
  readonly type = 'cow';
  override sounds = { hurt: 'mob.cow.hurt', death: 'mob.cow.hurt', say: 'mob.cow.say', step: 'mob.cow.step' };
  constructor() {
    super();
    this.maxHealth = this.health = 10;
    this.moveAttr = 0.2;
    this.width = 0.9;
    this.height = 1.4;
    this.eyeHeight = 1.3;
    this.mass = 500;
  }
  modelId(): [string, string] {
    return ['cow', ''];
  }
  isFood(n: string) {
    return n === 'wheat';
  }
  override interact(player: any, stack: ItemStack | null, hand: 'main' | 'off'): boolean {
    if (stack?.item.name === 'bucket' && !this.isBaby) {
      this.exchangeItem(player, hand, mkStack('milk_bucket'));
      this.playSound('mob.cow.say', 0.6, 1.3);
      this.game?.events.emit('milk', { entity: this, player });
      return true;
    }
    return super.interact(player, stack, hand);
  }
  protected override loot(): LootEntry[] {
    return [{ item: 'leather', min: 0, max: 2 }, { item: 'beef', min: 1, max: 3, cooked: 'cooked_beef' }];
  }
}

export class Pig extends Animal {
  readonly type = 'pig';
  override sounds = { hurt: 'mob.pig.hurt', death: 'mob.pig.death', say: 'mob.pig.say', step: 'mob.cow.step' };
  constructor() {
    super();
    this.maxHealth = this.health = 10;
    this.moveAttr = 0.25;
    this.width = 0.9;
    this.height = 0.9;
    this.eyeHeight = 0.75;
    this.mass = 120;
  }
  modelId(): [string, string] {
    return ['pig', ''];
  }
  isFood(n: string) {
    return n === 'carrot' || n === 'potato' || n === 'beetroot';
  }
  protected override loot(): LootEntry[] {
    return [{ item: 'porkchop', min: 1, max: 3, cooked: 'cooked_porkchop' }];
  }
}

/** Minecraft natural wool colour odds. */
export function randomWoolColor(r = Math.random()): number {
  if (r < 0.05) return 15; // black
  if (r < 0.1) return 7; // gray
  if (r < 0.15) return 8; // light gray
  if (r < 0.18) return 12; // brown
  if (r < 0.18164) return 6; // pink
  return 0; // white
}

class EatGrassGoal implements Goal {
  flags = Flag.MOVE | Flag.LOOK | Flag.JUMP;
  timer = 0;
  constructor(readonly sheep: Sheep) {}
  private target(): [number, number, number, 'tall' | 'block'] | null {
    const m = this.sheep, w = m.world;
    const x = Math.floor(m.pos.x), y = Math.floor(m.pos.y + 0.01), z = Math.floor(m.pos.z);
    const here = BLOCKS[w.getBlock(x, y, z) >>> 4]?.name;
    if (here === 'short_grass') return [x, y, z, 'tall'];
    if (BLOCKS[w.getBlock(x, y - 1, z) >>> 4]?.name === 'grass_block') return [x, y - 1, z, 'block'];
    return null;
  }
  canUse() {
    if (Math.random() * (this.sheep.isBaby ? 50 : 1000) >= 1) return false;
    return !!this.target();
  }
  start() {
    this.timer = 40;
    this.sheep.navigation.stop();
    this.sheep.eating = 40;
  }
  stop() {
    this.timer = 0;
    this.sheep.eating = 0;
  }
  canContinueToUse() {
    return this.timer > 0;
  }
  tick() {
    this.timer = Math.max(0, this.timer - 1);
    this.sheep.eating = this.timer;
    if (this.timer !== 4) return;
    const t = this.target();
    if (!t) return;
    const g = this.sheep.game as any;
    if (g?.gamerules?.mobGriefing !== false) {
      if (t[3] === 'tall') this.sheep.world.setBlock(t[0], t[1], t[2], 0, SetFlags.ALL);
      else this.sheep.world.setBlock(t[0], t[1], t[2], S('dirt'), SetFlags.ALL);
    }
    this.sheep.ateGrass();
  }
}

export class Sheep extends Animal {
  readonly type = 'sheep';
  override sounds = { hurt: 'mob.sheep.say', death: 'mob.sheep.say', say: 'mob.sheep.say', step: 'mob.cow.step' };
  color = 0;
  sheared = false;
  eating = 0;
  constructor() {
    super();
    this.maxHealth = this.health = 8;
    this.moveAttr = 0.23;
    this.width = 0.9;
    this.height = 1.3;
    this.eyeHeight = 1.23;
    this.mass = 60;
    this.color = randomWoolColor();
  }
  modelId(): [string, string] {
    return ['sheep', ''];
  }
  isFood(n: string) {
    return n === 'wheat';
  }
  protected override registerGoals() {
    super.registerGoals();
    this.goals.add(5, new EatGrassGoal(this));
  }
  ateGrass() {
    this.sheared = false;
    if (this.isBaby) this.ageUp(60);
    this.updateWool();
  }
  updateWool() {
    if (!this.rig) return;
    const wool = this.rig.slots.wool;
    if (wool) {
      const c = WOOL_LINEAR[this.color] ?? WOOL_LINEAR[0];
      wool.uniforms.u_color.value.setRGB(c[0], c[1], c[2]);
    }
    for (const m of this.rig.meshes) if (m.name.endsWith(':wool')) m.visible = !this.sheared;
  }
  protected override onModelBuilt() {
    this.updateWool();
  }
  override interact(player: any, stack: ItemStack | null, hand: 'main' | 'off'): boolean {
    const name = stack?.item.name;
    if (name === 'shears' && !this.sheared && !this.isBaby) {
      this.sheared = true;
      const n = 1 + Math.floor(Math.random() * 3);
      const w = mkStack(`${DYE_COLORS[this.color]}_wool`, n);
      if (w) this.dropStack(w, 1);
      this.playSound('mob.sheep.shear');
      if (!player.creative) player.damageItem?.(hand === 'main' ? player.inventory.selected : 40, 1);
      this.updateWool();
      this.game?.events.emit('shear', { entity: this, player });
      return true;
    }
    if (name?.endsWith('_dye')) {
      const c = (DYE_COLORS as readonly string[]).indexOf(name.slice(0, -4));
      if (c >= 0 && c !== this.color && !this.sheared) {
        this.color = c;
        this.useItem(player, hand);
        this.updateWool();
        return true;
      }
    }
    return super.interact(player, stack, hand);
  }
  override createChild(partner: Animal) {
    const c = super.createChild(partner) as Sheep | null;
    if (c) c.color = Math.random() < 0.5 ? this.color : (partner as Sheep).color;
    return c;
  }
  protected override loot(): LootEntry[] {
    const l: LootEntry[] = [{ item: 'mutton', min: 1, max: 2, cooked: 'cooked_mutton' }];
    if (!this.sheared) l.push({ item: `${DYE_COLORS[this.color]}_wool`, min: 1, max: 1, looting: 0 });
    return l;
  }
  protected override fillAnim(st: AnimState) {
    st.eating = this.eating;
  }
  protected override saveExtra() {
    return { ...super.saveExtra(), color: this.color, sheared: this.sheared || undefined };
  }
  protected override loadExtra(o: any) {
    super.loadExtra(o);
    this.color = o?.color ?? 0;
    this.sheared = !!o?.sheared;
  }
}

const WOOL_SRGB = [0xe9ecec, 0xf07613, 0xbd44b3, 0x3aafd9, 0xf8c627, 0x70b919, 0xed8dac, 0x3e4447, 0x8e8e86, 0x158991, 0x792aac, 0x35399d, 0x724728, 0x546d1b, 0xa12722, 0x141519];
const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
const WOOL_LINEAR = WOOL_SRGB.map((c) => [lin(((c >> 16) & 255) / 255), lin(((c >> 8) & 255) / 255), lin((c & 255) / 255)]);

export class Chicken extends Animal {
  readonly type = 'chicken';
  override sounds = { hurt: 'mob.chicken.hurt', death: 'mob.chicken.hurt', say: 'mob.chicken.say', step: 'block.grass.step' };
  eggTime = 6000 + Math.floor(Math.random() * 6000);
  constructor() {
    super();
    this.maxHealth = this.health = 4;
    this.moveAttr = 0.25;
    this.width = 0.4;
    this.height = 0.7;
    this.eyeHeight = 0.64;
    this.mass = 2.5;
  }
  modelId(): [string, string] {
    return ['chicken', ''];
  }
  isFood(n: string) {
    return n === 'wheat_seeds' || n === 'melon_seeds' || n === 'pumpkin_seeds' || n === 'beetroot_seeds';
  }
  override tick() {
    super.tick();
    if (this.dead) return;
    if (!this.isBaby && --this.eggTime <= 0) {
      this.playSound('mob.chicken.plop', 1, 1 + (Math.random() - 0.5) * 0.4);
      const e = mkStack('egg');
      if (e) this.dropStack(e, 0.3);
      this.eggTime = 6000 + Math.floor(Math.random() * 6000);
    }
  }
  protected override travelMob(dt: number) {
    super.travelMob(dt);
    // flapping: slow fall
    if (!this.onGround && this.vel.y < -3) this.vel.y = -3;
    this.fallDistance = 0;
  }
  protected override loot(): LootEntry[] {
    return [{ item: 'feather', min: 0, max: 2 }, { item: 'chicken', min: 1, max: 1, cooked: 'cooked_chicken', looting: 0 }];
  }
  protected override saveExtra() {
    return { ...super.saveExtra(), egg: this.eggTime };
  }
  protected override loadExtra(o: any) {
    super.loadExtra(o);
    if (o?.egg) this.eggTime = o.egg;
  }
}
