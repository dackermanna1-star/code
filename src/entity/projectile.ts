/**
 * Projectiles: ballistic flight with drag/gravity, swept hit tests against entities and
 * blocks. Arrow sticks into blocks and can be picked up. Subclasses: thrown items
 * (snowball, egg, ender pearl, potions), fireballs.
 */
import * as THREE from 'three';
import { Entity, type DamageSource } from './entity';
import { LivingEntity } from './living';
import { registerEntity } from './manager';
import { raycastBlocks } from '../game/interaction';
import { AABB } from '../physics/aabb';
import { createEntityMaterial, setEntityLight } from '../render/entityMaterial';
import { stack as mkStack, tryItem } from '../game/items/registry';

export abstract class Projectile extends Entity {
  owner: Entity | null = null;
  gravity = 20; // b/s^2
  drag = 0.2; // 1/s
  waterDrag = 3;
  stuck = false;
  stuckTicks = 0;
  maxLife = 1200;
  /** Ignore the owner for the first few ticks. */
  protected ignoreOwnerTicks = 5;

  constructor() {
    super();
    this.width = 0.25;
    this.height = 0.25;
    this.mass = 0.05;
  }

  /** Launch toward a direction with a speed (b/s) and inaccuracy (radians-ish). */
  shoot(dir: THREE.Vector3, speed: number, inaccuracy = 0) {
    const d = dir.clone().normalize();
    if (inaccuracy > 0) {
      d.x += (Math.random() - 0.5) * inaccuracy * 0.0075 * 2;
      d.y += (Math.random() - 0.5) * inaccuracy * 0.0075 * 2;
      d.z += (Math.random() - 0.5) * inaccuracy * 0.0075 * 2;
      d.normalize();
    }
    this.vel.copy(d).multiplyScalar(speed);
    this.yaw = Math.atan2(-d.x, -d.z);
    this.pitch = Math.asin(THREE.MathUtils.clamp(d.y, -1, 1));
  }

  override tick() {
    super.tick();
    if (this.ignoreOwnerTicks > 0) this.ignoreOwnerTicks--;
    if (this.stuck) {
      this.stuckTicks++;
      // fall if the block was removed
      const b = this.data.stuckBlock as number[] | undefined;
      if (b && this.world.getBlock(b[0], b[1], b[2]) === 0) {
        this.stuck = false;
        this.vel.set((Math.random() - 0.5) * 0.4, 0, (Math.random() - 0.5) * 0.4);
      }
    }
    if (this.age > this.maxLife) this.remove();
  }

  override physicsStep(dt: number) {
    this.prevPos.copy(this.pos);
    this.prevYaw = this.yaw;
    this.prevPitch = this.pitch;
    if (this.stuck) return;
    this.updateEnvironment();
    const v = this.vel;
    const from = this.pos.clone();
    const step = v.clone().multiplyScalar(dt);
    const len = step.length();
    if (len > 0) {
      // block hit
      const dir = step.clone().divideScalar(len);
      const hit = raycastBlocks(this.game as any, from, dir, len + 0.01);
      // entity hit
      let target: Entity | null = null;
      let tBest = hit ? hit.dist : len;
      const box = new AABB();
      const ents = (this.game as any).entities?.list as Entity[] | undefined;
      if (ents) {
        for (const e of ents) {
          if (e === this || e.removed || !(e instanceof LivingEntity) || (e as LivingEntity).dead) continue;
          if (e === this.owner && this.ignoreOwnerTicks > 0) continue;
          if (e.pos.distanceToSquared(from) > (len + 3) * (len + 3)) continue;
          box.copy(e.box);
          const t = box.grow(0.3).rayIntersect(from.x, from.y, from.z, dir.x, dir.y, dir.z, tBest);
          if (t >= 0 && t < tBest) { tBest = t; target = e; }
        }
      }
      if (target) {
        this.pos.copy(from).addScaledVector(dir, tBest);
        this.updateBox();
        this.onHitEntity(target, dir);
        if (this.removed) return;
      } else if (hit) {
        this.pos.set(hit.px, hit.py, hit.pz).addScaledVector(dir, -0.05);
        this.updateBox();
        this.onHitBlock(hit.x, hit.y, hit.z, hit.face, dir);
        if (this.removed || this.stuck) return;
      } else {
        this.pos.add(step);
        this.updateBox();
      }
    }
    const drag = this.inWater ? this.waterDrag : this.drag;
    v.multiplyScalar(Math.exp(-drag * dt));
    v.y -= this.gravity * dt;
    if (v.lengthSq() > 1e-6) {
      this.yaw = Math.atan2(-v.x, -v.z);
      this.pitch = Math.asin(THREE.MathUtils.clamp(v.y / v.length(), -1, 1));
    }
  }

  protected onHitEntity(_e: Entity, _dir: THREE.Vector3) {
    this.remove();
  }
  protected onHitBlock(x: number, y: number, z: number, _face: number, _dir: THREE.Vector3) {
    this.data.stuckBlock = [x, y, z];
    this.remove();
  }

  override serialize() {
    return { ...super.serialize(), stuck: this.stuck };
  }
}

const ARROW_GEO = (() => {
  const g = new THREE.CylinderGeometry(0.018, 0.018, 0.8, 6);
  g.rotateX(Math.PI / 2);
  return g;
})();
const FLETCH_GEO = new THREE.BoxGeometry(0.11, 0.004, 0.16);
const HEAD_GEO = (() => {
  const g = new THREE.ConeGeometry(0.035, 0.1, 4);
  g.rotateX(-Math.PI / 2);
  return g;
})();

export class ArrowEntity extends Projectile {
  readonly type = 'arrow';
  damage = 2;
  crit = false;
  knockback = 0;
  pickup: 'allowed' | 'creative' | 'disallowed' = 'allowed';
  fireTicksOnHit = 0;
  /** Potion effect carried (tipped arrows). */
  effect: { id: string; duration: number; amplifier: number } | null = null;
  private shaftMat = createEntityMaterial({ color: 0x8a6a42, roughness: 0.75 });
  private headMat = createEntityMaterial({ color: 0x9c9c9c, roughness: 0.35, metalness: 0.9 });
  private fletchMat = createEntityMaterial({ color: 0xeeeeee, roughness: 0.9, side: THREE.DoubleSide });

  constructor() {
    super();
    this.gravity = 20 * 0.05 * 20; // 0.05 b/tick^2
    this.drag = -Math.log(0.99) * 20;
    this.waterDrag = -Math.log(0.6) * 20;
    const g = new THREE.Group();
    const shaft = new THREE.Mesh(ARROW_GEO, this.shaftMat);
    const head = new THREE.Mesh(HEAD_GEO, this.headMat);
    head.position.z = -0.43;
    g.add(shaft, head);
    for (let i = 0; i < 2; i++) {
      const f = new THREE.Mesh(FLETCH_GEO, this.fletchMat);
      f.position.z = 0.32;
      f.rotation.z = (i * Math.PI) / 2;
      g.add(f);
    }
    this.model = g;
  }

  protected override onHitEntity(e: Entity, dir: THREE.Vector3) {
    const speed = this.vel.length() / 20; // b/tick
    let dmg = Math.ceil(speed * this.damage);
    if (this.crit) dmg += Math.floor(Math.random() * (dmg / 2 + 2));
    const src: DamageSource = { type: 'arrow', attacker: this.owner, direct: this, projectile: true, point: this.pos.clone(), dir: dir.clone(), impulse: speed * 0.6, weapon: 'arrow' };
    if (e.hurt(src, dmg)) {
      if (e instanceof LivingEntity) {
        const hv = new THREE.Vector2(this.vel.x, this.vel.z).normalize();
        e.knockback(0.6 * this.knockback + 0.05, hv.x, hv.y);
        if (this.fireTicks > 0 || this.fireTicksOnHit) e.fireTicks = Math.max(e.fireTicks, 100);
        if (this.effect) e.addEffect(this.effect.id, this.effect.duration, this.effect.amplifier);
        (this.game as any).events.emit('arrowHit', { arrow: this, entity: e, damage: dmg });
      }
      this.remove();
    } else {
      // deflect
      this.vel.multiplyScalar(-0.1);
    }
  }

  protected override onHitBlock(x: number, y: number, z: number, face: number, dir: THREE.Vector3) {
    this.stuck = true;
    this.data.stuckBlock = [x, y, z];
    this.vel.set(0, 0, 0);
    this.pos.addScaledVector(dir, 0.25);
    this.updateBox();
    (this.game as any).events.emit('arrowStuck', { arrow: this, x, y, z, face });
  }

  override tick() {
    super.tick();
    if (this.stuck && this.stuckTicks > 1200) this.remove();
    // pickup by player
    const g: any = this.game;
    const p = g.player;
    if (this.stuck && p && !p.dead && this.pickup !== 'disallowed' && p.box.grow(0.5).intersects(this.box)) {
      if (this.pickup === 'allowed' && !p.creative) {
        const it = tryItem('arrow');
        if (it && p.inventory.add(mkStack(it, 1)) === 0) {
          this.remove();
          g.events.emit('itemPickup', { player: p, entity: this, stack: mkStack(it, 1), count: 1 });
        }
      } else this.remove();
    }
  }

  override updateVisual(alpha: number) {
    if (!this.model) return;
    const p = this.renderPos(alpha);
    this.model.position.copy(p);
    this.model.rotation.set(0, 0, 0);
    this.model.rotateY(this.yaw);
    this.model.rotateX(this.pitch);
    const L = this.world.getLight(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z));
    setEntityLight(this.shaftMat, L);
    setEntityLight(this.headMat, L);
    setEntityLight(this.fletchMat, L);
  }

  override serialize() {
    return { ...super.serialize(), dmg: this.damage, pk: this.pickup, sb: this.data.stuckBlock };
  }
  override deserialize(o: any) {
    super.deserialize(o);
    this.damage = o.dmg ?? 2;
    this.pickup = o.pk ?? 'allowed';
    this.stuck = !!o.stuck;
  }
}

registerEntity('arrow', ArrowEntity, 'misc');
