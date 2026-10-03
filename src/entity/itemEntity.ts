/**
 * Dropped item entity (merging, pickup delay, 5-minute despawn, magnet pickup animation).
 *
 * With `game.physics` (Rapier) available the item is a small rigid body that tumbles, bounces,
 * rolls and slides with per-material friction/restitution, floats in water (buoyancy + drag +
 * flow), and is flung by explosions. Without it, the original Minecraft-style AABB motion is used.
 * Visual model comes from `game.itemModels.create(stack, 'dropped')` if available (its bounds
 * size the collider), else a small coloured cube.
 */
import * as THREE from 'three';
import { Entity } from './entity';
import { stackable, type ItemStack, cloneStack } from '../game/items/registry';
import { createEntityMaterial, setEntityLight } from '../render/entityMaterial';
import { BLOCK_BY_NAME } from '../world/blocks/registry';
import { registerEntity } from './manager';
import { itemPhysShape } from '../physics/materials';
import { GROUP, type PhysBody, type PhysicsWorld } from '../physics/rapierWorld';

const BOX = new THREE.BoxGeometry(0.25, 0.25, 0.25);
const _box = new THREE.Box3();
const _v = new THREE.Vector3();

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
  /** Rigid body (null = AABB fallback physics). */
  body: PhysBody | null = null;
  /** Half extents of the physical shape. */
  readonly half = new THREE.Vector3(0.125, 0.125, 0.125);
  readonly quat = new THREE.Quaternion();
  readonly prevQuat = new THREE.Quaternion();
  /** Child holding the visual, offset so the body centre is the model centre. */
  private visual: THREE.Object3D | null = null;
  /** True once the item became a rigid body (keeps its physical pose while being collected). */
  physical = false;

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
    this.createBody();
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
    const holder = new THREE.Group();
    holder.add(model);
    this.visual = model;
    this.model = holder;
    this.model.userData.entity = this;
    model.userData.entity = this;
  }

  private physicsWorld(): PhysicsWorld | null {
    return ((this.game as any)?.physics as PhysicsWorld | null) ?? null;
  }

  /** Create the rigid body (if Rapier is available). */
  createBody() {
    const pw = this.physicsWorld();
    if (!pw || this.body || !this.stack.item) return;
    const shape = itemPhysShape(this.stack);
    const half = new THREE.Vector3(...shape.half);
    // size the collider from the real visual when another workstream provides item models
    if (this.visual && !this.mat) {
      this.visual.updateMatrixWorld(true);
      _box.setFromObject(this.visual);
      if (!_box.isEmpty()) {
        const s = _box.getSize(_v).multiplyScalar(0.5);
        if (s.x > 0.01 && s.y > 0.003 && s.z > 0.003 && s.x < 0.6 && s.y < 0.6 && s.z < 0.6) {
          half.set(Math.max(0.015, s.x), Math.max(0.015, s.y), Math.max(0.015, s.z));
          const c = _box.getCenter(_v);
          this.visual.position.sub(c);
        }
      }
    }
    this.half.copy(half);
    this.quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI * 2);
    if (shape.kind === 'flat') this.quat.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), (Math.random() - 0.5) * 0.6));
    this.prevQuat.copy(this.quat);
    const c = this.pos.clone().add(new THREE.Vector3(0, this.height / 2, 0));
    const sp = this.vel.length();
    this.body = pw.addBody({
      kind: 'item',
      owner: this,
      position: c,
      rotation: this.quat,
      linvel: this.vel,
      angvel: { x: (Math.random() - 0.5) * (4 + sp), y: (Math.random() - 0.5) * 6, z: (Math.random() - 0.5) * (4 + sp) },
      shape: { type: 'box', half: [half.x, half.y, half.z] },
      mass: shape.mass,
      friction: shape.mat.friction,
      restitution: shape.mat.restitution,
      buoyancy: 1.7,
      group: GROUP.ITEM,
      linearDamping: 0.05,
      angularDamping: shape.kind === 'flat' ? 0.6 : 0.25,
      ccd: sp > 12,
    });
    this.body.userData.sound = shape.kind === 'block' ? BLOCK_BY_NAME.get(this.stack.item.block!)?.sound : shape.mat.density > 5000 ? 'chain' : 'wood';
    this.mass = shape.mass;
    this.physical = true;
  }

  /** Called by the physics world when the body fell out of the world. */
  onPhysicsLost() {
    this.remove();
  }

  override remove() {
    super.remove();
    this.dropBody();
  }

  private dropBody() {
    if (this.body) {
      this.physicsWorld()?.removeBody(this.body);
      this.body = null;
    }
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
    this.prevQuat.copy(this.quat);
    if (this.collector) {
      this.dropBody();
      const t = this.collector.pos;
      this.pos.lerp(new THREE.Vector3(t.x, t.y + 0.8, t.z), Math.min(1, dt * 18));
      this.updateBox();
      return;
    }
    if (!this.body && this.physicsWorld()) this.createBody();
    const b = this.body;
    if (b && !b.removed) {
      // read back the last rigid-body state (stepped after entity physics)
      this.pos.set(b.pos.x, b.pos.y - this.height / 2, b.pos.z);
      this.quat.copy(b.quat);
      b.linvel(this.vel);
      this.updateBox();
      this.updateEnvironment();
      this.onGround = Math.abs(this.vel.y) < 0.05;
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
    const n = Math.min(4, this.stack.count > 32 ? 4 : this.stack.count > 16 ? 3 : this.stack.count > 1 ? 2 : 1);
    this.model.userData.stackVisualCount = n;
    if (this.visual) this.visual.userData.stackVisualCount = n;
    if (this.physical) {
      this.model.position.set(p.x, p.y + this.height / 2, p.z);
      this.model.quaternion.copy(this.prevQuat).slerp(this.quat, alpha);
      if (this.collector) this.model.scale.setScalar(Math.max(0.2, 1 - this.collectTicks * 0.25));
    } else {
      const bob = this.collector ? 0 : Math.sin(this.age / 10 + alpha / 10 + this.bobOffset) * 0.06 + 0.1;
      this.spin += dt * 1.2;
      this.model.position.set(p.x, p.y + bob + 0.125, p.z);
      this.model.rotation.set(0, this.spin, 0);
    }
    const L = this.world.getLight(Math.floor(p.x), Math.floor(p.y + 0.2), Math.floor(p.z));
    if (this.mat) setEntityLight(this.mat, L);
    else this.model.traverse((o: any) => o.material?.uniforms?.u_light && setEntityLight(o.material, L));
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
