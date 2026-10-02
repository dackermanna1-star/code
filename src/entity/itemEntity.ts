/**
 * Dropped item entity (bobbing, merging, pickup). Visual model comes from `game.itemModels`
 * if available (3D item meshes), else a small coloured cube.
 */
import * as THREE from 'three';
import { Entity } from './entity';
import { stackable, type ItemStack, cloneStack } from '../game/items/registry';
import { createEntityMaterial, setEntityLight } from '../render/entityMaterial';
import { BLOCK_BY_NAME } from '../world/blocks/registry';
import { registerEntity } from './manager';

const BOX = new THREE.BoxGeometry(0.25, 0.25, 0.25);

export class ItemEntity extends Entity {
  readonly type = 'item';
  stack: ItemStack;
  pickupDelay = 10;
  lifetime = 6000;
  bobOffset = Math.random() * Math.PI * 2;
  /** Set when collected: fly toward this entity before removal. */
  collector: Entity | null = null;
  collectTicks = 0;
  private mat: THREE.RawShaderMaterial | null = null;
  spin = Math.random() * Math.PI * 2;

  constructor(stack?: ItemStack) {
    super();
    this.stack = stack ?? ({} as ItemStack);
    this.width = 0.25;
    this.height = 0.25;
    this.mass = 0.5;
  }

  override init(game: any, world: any) {
    super.init(game, world);
    this.buildModel();
  }

  buildModel() {
    if (this.model) this.model.removeFromParent();
    const g: any = this.game;
    let model: THREE.Object3D | null = null;
    if (g?.itemModels?.create) model = g.itemModels.create(this.stack, 'dropped');
    if (!model) {
      const b = this.stack.item?.block ? BLOCK_BY_NAME.get(this.stack.item.block) : undefined;
      this.mat = createEntityMaterial({ color: b ? b.mapColor : 0xc0c0c0, roughness: 0.6 });
      const m = new THREE.Mesh(BOX, this.mat);
      model = new THREE.Group();
      model.add(m);
    }
    this.model = model;
    this.model.userData.entity = this;
  }

  override tick() {
    super.tick();
    if (this.pickupDelay > 0) this.pickupDelay--;
    if (this.collector) {
      this.collectTicks++;
      if (this.collectTicks > 3) this.remove();
      return;
    }
    if (this.age >= this.lifetime) this.remove();
    // lava destroys items (except fire resistant)
    if (this.inLava && !this.stack.item.fireResistant) {
      this.remove();
      this.game.events.emit('itemBurned', { entity: this });
    }
    // merge with nearby identical stacks
    if (this.age % 10 === 0) {
      const ents: any = (this.game as any).entities;
      if (ents) {
        for (const e of ents.query(this.box.grow(0.5), (o: Entity) => o !== this && o.type === 'item')) {
          const o = e as ItemEntity;
          if (o.removed || o.collector || !stackable(o.stack, this.stack)) continue;
          if (o.stack.count + this.stack.count > this.stack.item.maxStack) continue;
          this.stack.count += o.stack.count;
          this.age = Math.min(this.age, o.age);
          o.remove();
        }
      }
    }
  }

  override physicsStep(dt: number) {
    this.prevPos.copy(this.pos);
    if (this.collector) {
      const t = this.collector.pos;
      this.pos.lerp(new THREE.Vector3(t.x, t.y + 0.8, t.z), Math.min(1, dt * 18));
      this.updateBox();
      return;
    }
    this.updateEnvironment();
    const v = this.vel;
    if (this.inWater) {
      v.multiplyScalar(Math.exp(-3 * dt));
      v.y += (this.fluidDepth > 0.5 ? 6 : -2) * dt;
    } else {
      v.y -= 32 * dt * 0.98;
      v.y *= Math.exp(-0.4 * dt);
      const fr = this.onGround ? Math.exp(-10 * dt) : Math.exp(-0.4 * dt);
      v.x *= fr;
      v.z *= fr;
    }
    this.move(v.x * dt, v.y * dt, v.z * dt);
    if (this.onGround && Math.abs(v.y) < 0.01) v.y = 0;
  }

  override updateVisual(alpha: number, dt: number) {
    if (!this.model) return;
    const p = this.renderPos(alpha);
    const bob = this.collector ? 0 : Math.sin(this.age / 10 + alpha / 10 + this.bobOffset) * 0.06 + 0.1;
    this.spin += dt * 1.2;
    this.model.position.set(p.x, p.y + bob + 0.125, p.z);
    this.model.rotation.set(0, this.spin, 0);
    const n = Math.min(4, this.stack.count > 32 ? 4 : this.stack.count > 16 ? 3 : this.stack.count > 1 ? 2 : 1);
    this.model.userData.stackVisualCount = n;
    if (this.mat) setEntityLight(this.mat, this.world.getLight(Math.floor(p.x), Math.floor(p.y + 0.2), Math.floor(p.z)));
    else this.model.traverse((o: any) => o.material?.uniforms?.u_light && setEntityLight(o.material, this.world.getLight(Math.floor(p.x), Math.floor(p.y + 0.2), Math.floor(p.z))));
  }

  override serialize() {
    return { ...super.serialize(), s: { i: this.stack.item.name, c: this.stack.count, d: this.stack.damage, e: this.stack.ench, x: this.stack.data }, pd: this.pickupDelay, age: this.age };
  }
  override deserialize(o: any) {
    super.deserialize(o);
    const { deserializeStack } = require_items();
    this.stack = deserializeStack(o.s) ?? this.stack;
    this.pickupDelay = o.pd ?? 0;
    this.age = o.age ?? 0;
  }

  static from(stack: ItemStack) {
    return new ItemEntity(cloneStack(stack)!);
  }
}

// lazy import helper (avoids a cycle at module init)
import * as ItemsMod from '../game/items/registry';
function require_items() {
  return ItemsMod;
}

registerEntity('item', ItemEntity, 'misc');
