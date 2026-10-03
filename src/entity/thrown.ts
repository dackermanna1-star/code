/**
 * Thrown item projectiles (Minecraft ThrowableItemProjectile family): snowball, egg, ender
 * pearl, bottle o' enchanting; plus the eye of ender (floats toward a stronghold), the
 * thrown trident (sticks, loyalty return) and typed arrows (spectral / tipped) that return
 * their own item when picked up.
 *
 * Visuals come from `game.itemModels.create(stack, 'thrown')` (G-buffer item models).
 * Other workstreams can extend `ThrownItemEntity` (e.g. splash potions) and override
 * `onImpact`.
 */
import * as THREE from 'three';
import { Entity, type DamageSource } from './entity';
import { LivingEntity } from './living';
import { Projectile, ArrowEntity } from './projectile';
import { registerEntity, createEntity } from './manager';
import { setEntityLight, createEntityMaterial } from '../render/entityMaterial';
import { T_SOLID } from '../world/blocks/registry';
import { stack as mkStack, cloneStack, deserializeStack, serializeStack, type ItemStack } from '../game/items/index';

const FALLBACK_GEO = new THREE.SphereGeometry(0.12, 12, 8);

function lightModel(model: THREE.Object3D, packed: number) {
  model.traverse((o: any) => {
    const m = o.material;
    if (m?.uniforms?.u_light) setEntityLight(m, packed);
  });
}

/** Base class for thrown items. */
export class ThrownItemEntity extends Projectile {
  readonly type: string = 'thrown_item';
  stack: ItemStack;
  protected spinRate = 0;
  protected spinAngle = Math.random() * Math.PI * 2;

  constructor(stack?: ItemStack, type = 'thrown_item', itemName = 'snowball') {
    super();
    (this as any).type = type;
    this.stack = stack ?? mkStack(itemName);
    // ThrowableProjectile: gravity 0.03 b/tick², drag 0.99 per tick, water 0.8 per tick
    this.gravity = 0.03 * 400;
    this.drag = -Math.log(0.99) * 20;
    this.waterDrag = -Math.log(0.8) * 20;
    this.width = 0.25;
    this.height = 0.25;
  }

  override init(game: any, world: any) {
    super.init(game, world);
    this.buildModel();
  }

  protected buildModel() {
    const g: any = this.game;
    let m: THREE.Object3D | null = g?.itemModels?.create?.(this.stack, 'thrown') ?? null;
    if (!m) {
      m = new THREE.Mesh(FALLBACK_GEO, createEntityMaterial({ color: 0xdddddd, roughness: 0.6 }));
    }
    this.model = m;
    this.model.userData.entity = this;
  }

  protected override onHitEntity(e: Entity, dir: THREE.Vector3) {
    this.onImpact(e, this.pos.clone(), dir, null);
    this.remove();
  }

  protected override onHitBlock(x: number, y: number, z: number, face: number, dir: THREE.Vector3) {
    this.onImpact(null, this.pos.clone(), dir, { x, y, z, face });
    this.remove();
  }

  /** Called once on impact (entity or block). */
  protected onImpact(target: Entity | null, pos: THREE.Vector3, dir: THREE.Vector3, block: { x: number; y: number; z: number; face: number } | null) {
    (this.game as any).events.emit('projectileImpact', { entity: this, item: this.stack.item.name, pos, target, block });
    void dir;
  }

  /** Minecraft thrown-projectile hit: `amount` damage (may be 0) + standard knockback. */
  protected hitWith(e: Entity, dir: THREE.Vector3, amount: number) {
    const src: DamageSource = { type: 'projectile', attacker: this.owner, direct: this, projectile: true, point: this.pos.clone(), dir: dir.clone(), impulse: 0.3, weapon: this.stack.item.name };
    if (amount > 0) e.hurt(src, amount);
    if (e instanceof LivingEntity && !e.dead) {
      const h = new THREE.Vector2(this.vel.x, this.vel.z);
      if (h.lengthSq() > 1e-6) h.normalize();
      e.knockback(0.4, h.x, h.y);
      if (amount <= 0) e.hurtTime = Math.max(e.hurtTime, 4);
    }
  }

  override updateVisual(alpha: number, dt: number) {
    if (!this.model) return;
    const p = this.renderPos(alpha);
    this.model.position.copy(p).add(new THREE.Vector3(0, this.height / 2, 0));
    // sprites face the camera (Minecraft renders thrown items as billboards); 3D balls spin
    const cam = (this.game as any).cameraCtl?.camera as THREE.Camera | undefined;
    if (cam && this.model.userData.billboard) this.model.quaternion.copy(cam.quaternion);
    else {
      this.spinAngle += dt * (this.spinRate || 8);
      this.model.rotation.set(this.spinAngle * 0.7, this.spinAngle, 0);
    }
    lightModel(this.model, this.world.getLight(Math.floor(p.x), Math.floor(p.y + 0.1), Math.floor(p.z)));
  }

  override serialize() {
    return { ...super.serialize(), s: serializeStack(this.stack), o: (this.owner as any)?.type === 'player' ? 'player' : undefined };
  }
  override deserialize(o: any) {
    super.deserialize(o);
    this.stack = deserializeStack(o.s) ?? this.stack;
    if (o.o === 'player') this.owner = (this.game as any)?.player ?? null;
  }
}

// ---------------------------------------------------------------------------------------
export class SnowballEntity extends ThrownItemEntity {
  constructor(stack?: ItemStack) {
    super(stack, 'snowball', 'snowball');
  }
  protected override onImpact(target: Entity | null, pos: THREE.Vector3, dir: THREE.Vector3, block: any) {
    if (target) this.hitWith(target, dir, target.type === 'blaze' ? 3 : 0);
    super.onImpact(target, pos, dir, block);
  }
}

export class EggEntity extends ThrownItemEntity {
  constructor(stack?: ItemStack) {
    super(stack, 'egg', 'egg');
  }
  protected override onImpact(target: Entity | null, pos: THREE.Vector3, dir: THREE.Vector3, block: any) {
    if (target) this.hitWith(target, dir, 0);
    // ThrownEgg: 1/8 chance to hatch, 1/32 of those hatch four chicks
    if (Math.random() < 1 / 8) {
      const n = Math.random() < 1 / 32 ? 4 : 1;
      for (let i = 0; i < n; i++) {
        const c: any = createEntity('chicken');
        if (!c) break;
        c.setBaby?.(true);
        c.baby = true;
        c.data.baby = true;
        c.data.age = -24000;
        c.yaw = Math.random() * Math.PI * 2;
        (this.game as any).spawn(c, pos.x, Math.max(pos.y - 0.1, Math.floor(pos.y)), pos.z);
      }
    }
    super.onImpact(target, pos, dir, block);
  }
}

export class EnderPearlEntity extends ThrownItemEntity {
  constructor(stack?: ItemStack) {
    super(stack, 'ender_pearl', 'ender_pearl');
  }
  protected override onImpact(target: Entity | null, pos: THREE.Vector3, dir: THREE.Vector3, block: any) {
    if (target) this.hitWith(target, dir, 0);
    const o = this.owner;
    const g: any = this.game;
    if (o && o instanceof LivingEntity && !o.dead && !o.removed && o.world === this.world) {
      // land at the impact point, nudged out of the hit block
      const to = pos.clone().addScaledVector(dir, -0.2);
      to.y = Math.max(to.y - 0.1, Math.floor(to.y + 0.05));
      for (let i = 0; i < 3; i++) {
        const st = this.world.getBlock(Math.floor(to.x), Math.floor(to.y), Math.floor(to.z));
        const st2 = this.world.getBlock(Math.floor(to.x), Math.floor(to.y + 1), Math.floor(to.z));
        const solid = (s: number) => s !== 0 && T_SOLID[s >>> 4] === 1;
        if (!solid(st) && !solid(st2)) break;
        to.y = Math.floor(to.y) + 1;
      }
      const from = o.pos.clone();
      if (Math.random() < 0.05) {
        const m = createEntity('endermite');
        if (m) g.spawn(m, from.x, from.y, from.z);
      }
      o.setPos(to.x, to.y, to.z);
      o.vel.set(0, 0, 0);
      o.fallDistance = 0;
      o.hurt({ type: 'fall', bypassArmor: true }, 5);
      g.events.emit('enderPearlTeleport', { player: o, entity: o, from, to: to.clone() });
    }
    super.onImpact(target, pos, dir, block);
  }
}

export class ExperienceBottleEntity extends ThrownItemEntity {
  constructor(stack?: ItemStack) {
    super(stack, 'experience_bottle', 'experience_bottle');
    // ThrownExperienceBottle gravity 0.07
    this.gravity = 0.07 * 400;
  }
  protected override onImpact(target: Entity | null, pos: THREE.Vector3, dir: THREE.Vector3, block: any) {
    const g: any = this.game;
    g.events.emit('bottleBreak', { pos: pos.clone(), color: 0x385dc6, item: 'experience_bottle' });
    const n = 3 + Math.floor(Math.random() * 5) + Math.floor(Math.random() * 5);
    g.spawnXp?.(pos.clone(), n);
    super.onImpact(target, pos, dir, block);
  }
}

// ---------------------------------------------------------------------------------------
/** Eye of ender: floats toward a target, then shatters (20%) or drops (80%). */
export class EyeOfEnderEntity extends Entity {
  readonly type = 'eye_of_ender';
  stack: ItemStack = mkStack('ender_eye');
  private tx = 0;
  private ty = 0;
  private tz = 0;
  life = 0;
  surviveAfterDeath = true;
  private spin = 0;

  constructor() {
    super();
    this.width = 0.25;
    this.height = 0.25;
    this.noGravity = true;
    this.persistent = false;
  }

  /** EyeOfEnder.signalTo */
  signalTo(x: number, y: number, z: number) {
    const dx = x - this.pos.x, dz = z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > 12) {
      this.tx = this.pos.x + (dx / d) * 12;
      this.tz = this.pos.z + (dz / d) * 12;
      this.ty = this.pos.y + 8;
    } else {
      this.tx = x;
      this.ty = y;
      this.tz = z;
    }
    this.life = 0;
    this.surviveAfterDeath = Math.random() < 0.8;
  }

  override init(game: any, world: any) {
    super.init(game, world);
    this.model = game?.itemModels?.create?.(this.stack, 'thrown') ?? new THREE.Mesh(FALLBACK_GEO, createEntityMaterial({ color: 0x2b8a3a }));
  }

  override tick() {
    super.tick();
    // per-tick steering (velocity stored in b/s)
    const v = this.vel.clone().multiplyScalar(1 / 20);
    const nx = this.pos.x + v.x, nz = this.pos.z + v.z;
    const dx = this.tx - nx, dz = this.tz - nz;
    const f1 = Math.hypot(dx, dz);
    const f2 = Math.atan2(dz, dx);
    let d5 = THREE.MathUtils.lerp(0.0025, Math.hypot(v.x, v.z), f1);
    let d6 = v.y;
    if (f1 < 1) { d5 *= 0.8; d6 *= 0.8; }
    const j = this.pos.y < this.ty ? 1 : -1;
    this.vel.set(Math.cos(f2) * d5, d6 + (j - d6) * 0.015, Math.sin(f2) * d5).multiplyScalar(20);
    if (++this.life > 80) {
      const g: any = this.game;
      this.remove();
      if (this.surviveAfterDeath) g.dropItem?.(mkStack('ender_eye'), this.pos.clone());
      else g.events.emit('eyeOfEnderShatter', { pos: this.pos.clone() });
    }
  }

  override physicsStep(dt: number) {
    this.prevPos.copy(this.pos);
    this.pos.addScaledVector(this.vel, dt);
    this.updateBox();
  }

  override updateVisual(alpha: number, dt: number) {
    if (!this.model) return;
    const p = this.renderPos(alpha);
    this.spin += dt * 3;
    this.model.position.copy(p);
    const cam = (this.game as any).cameraCtl?.camera as THREE.Camera | undefined;
    if (cam && this.model.userData.billboard) this.model.quaternion.copy(cam.quaternion);
    else this.model.rotation.set(0, this.spin, 0);
    lightModel(this.model, this.world.getLight(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)));
  }
}

// ---------------------------------------------------------------------------------------
/** Thrown trident: arrow-like flight, 8 damage, sticks into blocks, Loyalty returns it. */
export class TridentEntity extends Projectile {
  readonly type = 'trident';
  stack: ItemStack = mkStack('trident');
  damage = 8;
  dealtDamage = false;
  returning = false;
  pickup: 'allowed' | 'creative' = 'allowed';
  private returnTicks = 0;

  constructor(stack?: ItemStack) {
    super();
    if (stack) this.stack = stack;
    this.gravity = 0.05 * 400;
    this.drag = -Math.log(0.99) * 20;
    this.waterDrag = -Math.log(0.99) * 20;
    this.maxLife = 1e9;
  }

  get loyalty() {
    return this.stack.ench?.loyalty ?? 0;
  }

  override init(game: any, world: any) {
    super.init(game, world);
    this.model = game?.itemModels?.create?.(this.stack, 'thrown') ?? new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2).rotateX(Math.PI / 2), createEntityMaterial({ color: 0x5fa8a0, metalness: 0.6, roughness: 0.35 }));
  }

  protected override onHitEntity(e: Entity, dir: THREE.Vector3) {
    if (this.dealtDamage) return;
    this.dealtDamage = true;
    const src: DamageSource = { type: 'projectile', attacker: this.owner, direct: this, projectile: true, point: this.pos.clone(), dir: dir.clone(), impulse: 1.6, weapon: 'trident' };
    let dmg = this.damage;
    const imp = this.stack.ench?.impaling ?? 0;
    if (imp && (e.inWater || (this.game as any).weather?.raining)) dmg += 2.5 * imp;
    if (e.hurt(src, dmg) && e instanceof LivingEntity) {
      const h = new THREE.Vector2(this.vel.x, this.vel.z).normalize();
      e.knockback(0.4, h.x, h.y);
    }
    (this.game as any).events.emit('tridentHit', { entity: this, target: e });
    this.vel.multiplyScalar(-0.01);
    this.vel.y = -2;
  }

  protected override onHitBlock(x: number, y: number, z: number, face: number, dir: THREE.Vector3) {
    this.stuck = true;
    this.data.stuckBlock = [x, y, z];
    this.vel.set(0, 0, 0);
    this.pos.addScaledVector(dir, 0.3);
    this.updateBox();
    (this.game as any).events.emit('tridentStuck', { entity: this, x, y, z, face });
  }

  override tick() {
    super.tick();
    const g: any = this.game;
    const p = g.player;
    const owner = this.owner as any;
    if ((this.dealtDamage || this.stuck) && this.loyalty > 0 && owner && !owner.dead && owner.world === this.world) {
      this.returning = true;
      this.stuck = false;
    }
    if (this.returning && owner) {
      this.returnTicks++;
      const to = new THREE.Vector3(owner.pos.x, owner.pos.y + owner.eyeHeight * 0.8, owner.pos.z).sub(this.pos);
      const sp = 0.05 * this.loyalty * 20;
      this.vel.multiplyScalar(0.95).addScaledVector(to.normalize(), sp * 3);
      if (this.returnTicks === 1) g.events.emit('tridentReturn', { entity: this });
    }
    // pickup
    if ((this.stuck || this.returning || this.age > 20) && p && !p.dead && p.box.grow(this.returning ? 1 : 0.5).intersects(this.box) && (this.owner === p || !this.owner)) {
      if (this.pickup === 'allowed' && !p.creative) {
        if (p.inventory.add(cloneStack(this.stack)!) === 0) {
          this.remove();
          g.events.emit('itemPickup', { player: p, entity: this, stack: this.stack, count: 1 });
        }
      } else this.remove();
    }
  }

  override physicsStep(dt: number) {
    if (this.returning) {
      this.prevPos.copy(this.pos);
      this.pos.addScaledVector(this.vel, dt);
      this.updateBox();
      if (this.vel.lengthSq() > 1e-6) {
        this.yaw = Math.atan2(-this.vel.x, -this.vel.z);
        this.pitch = Math.asin(THREE.MathUtils.clamp(this.vel.y / this.vel.length(), -1, 1));
      }
      return;
    }
    super.physicsStep(dt);
  }

  override updateVisual(alpha: number) {
    if (!this.model) return;
    const p = this.renderPos(alpha);
    this.model.position.copy(p);
    this.model.rotation.set(0, 0, 0);
    this.model.rotateY(this.yaw);
    this.model.rotateX(this.pitch);
    lightModel(this.model, this.world.getLight(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)));
  }

  override serialize() {
    return { ...super.serialize(), s: serializeStack(this.stack), dd: this.dealtDamage, pk: this.pickup };
  }
  override deserialize(o: any) {
    super.deserialize(o);
    this.stack = deserializeStack(o.s) ?? this.stack;
    this.dealtDamage = !!o.dd;
    this.pickup = o.pk ?? 'allowed';
    this.stuck = !!o.stuck;
  }
}

// ---------------------------------------------------------------------------------------
/** Arrow that returns its own item (spectral / tipped) when picked up. */
export class TypedArrowEntity extends ArrowEntity {
  ammo: ItemStack;
  constructor(ammo?: ItemStack, type = 'spectral_arrow') {
    super();
    Object.defineProperty(this, 'type', { value: type, writable: false, configurable: true });
    this.ammo = ammo ?? mkStack(type === 'tipped_arrow' ? 'tipped_arrow' : 'spectral_arrow');
  }
  override tick() {
    const real = this.pickup;
    if (real === 'allowed') this.pickup = 'disallowed';
    super.tick();
    this.pickup = real;
    const g: any = this.game;
    const p = g.player;
    if (this.removed || !this.stuck || real !== 'allowed' || !p || p.dead || p.creative) return;
    if (p.box.grow(0.5).intersects(this.box)) {
      const s = { ...cloneStack(this.ammo)!, count: 1 };
      if (p.inventory.add(s) === 0) {
        this.remove();
        g.events.emit('itemPickup', { player: p, entity: this, stack: s, count: 1 });
      }
    }
  }
  override serialize() {
    return { ...super.serialize(), am: serializeStack(this.ammo) };
  }
  override deserialize(o: any) {
    super.deserialize(o);
    this.ammo = deserializeStack(o.am) ?? this.ammo;
  }
}
class SpectralArrowEntity extends TypedArrowEntity {
  constructor() {
    super(undefined, 'spectral_arrow');
  }
}
class TippedArrowEntity extends TypedArrowEntity {
  constructor() {
    super(undefined, 'tipped_arrow');
  }
}

registerEntity('snowball', SnowballEntity, 'misc');
registerEntity('egg', EggEntity, 'misc');
registerEntity('ender_pearl', EnderPearlEntity, 'misc');
registerEntity('experience_bottle', ExperienceBottleEntity, 'misc');
registerEntity('eye_of_ender', EyeOfEnderEntity, 'misc');
registerEntity('trident', TridentEntity, 'misc');
registerEntity('spectral_arrow', SpectralArrowEntity, 'misc');
registerEntity('tipped_arrow', TippedArrowEntity, 'misc');
