import * as THREE from 'three';
import type { Game } from '../game';
import type { Fighter } from './fighter';
import { B } from '../anim/skeleton';
import { G, groups, RAPIER } from '../world/physics';
import { rand } from '../core/math';

export type WeaponKind = 'knife' | 'club' | 'sword';

const DUR: Record<WeaponKind, number> = { knife: 14, club: 9, sword: 16 };

function buildMesh(kind: WeaponKind): { group: THREE.Group; length: number; half: THREE.Vector3 } {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0xc8ccd2, metalness: 0.9, roughness: 0.28 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a1612, roughness: 0.8 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x8a6034, roughness: 0.75 });
  let length = 0.3;
  if (kind === 'knife') {
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.11, 0.03), dark);
    handle.position.y = 0.0;
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.17, 0.034), steel);
    blade.position.y = 0.14;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.019, 0.05, 4), steel);
    tip.position.y = 0.245;
    tip.scale.set(0.3, 1, 1);
    g.add(handle, blade, tip);
    length = 0.27;
  } else if (kind === 'club') {
    const bat = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.017, 0.82, 10), wood);
    bat.position.y = 0.33;
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.02, 10), wood);
    knob.position.y = -0.08;
    const tape = new THREE.Mesh(new THREE.CylinderGeometry(0.0195, 0.0195, 0.16, 10), dark);
    tape.position.y = -0.0;
    g.add(bat, knob, tape);
    length = 0.82;
  } else {
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.2, 8), dark);
    handle.position.y = -0.02;
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.1), steel);
    guard.position.y = 0.09;
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.007, 0.62, 0.042), steel);
    blade.position.y = 0.41;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.024, 0.08, 4), steel);
    tip.position.y = 0.76;
    tip.scale.set(0.3, 1, 1);
    g.add(handle, guard, blade, tip);
    length = 0.8;
  }
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return { group: g, length, half: new THREE.Vector3(0.03, length / 2, 0.03) };
}

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();

export class Weapon {
  group: THREE.Group;
  length: number;
  half: THREE.Vector3;
  holder: Fighter | null = null;
  body: RAPIER.RigidBody | null = null;
  durability: number;
  broken = false;
  thrown: { target: Fighter | null; t: number } | null = null;
  bloody = 0;

  constructor(public game: Game, public kind: WeaponKind) {
    const m = buildMesh(kind);
    this.group = m.group;
    this.length = m.length;
    this.half = m.half;
    this.durability = DUR[kind];
  }

  /** Attach to a fighter's right hand. */
  attach(f: Fighter) {
    this.detachBody();
    this.holder = f;
    f.weapon = this;
    const hand = f.model.bones[B.handR];
    hand.add(this.group);
    // grip: weapon axis along the thumb direction, centered in the fist
    const u = f.def.restDir[B.handR].clone();
    const v = f.def.restUp[B.handR].clone();
    const thumb = new THREE.Vector3().crossVectors(u, v).multiplyScalar(-1).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), thumb);
    // rotate blade edge to face forward-ish
    this.group.quaternion.copy(q);
    this.group.position.copy(u.multiplyScalar(0.055 * f.scale)).addScaledVector(v, -0.006);
    this.group.scale.setScalar(1 / Math.max(0.5, 1));
  }

  /** Drop into the world as a physics prop (persists forever unless picked up). */
  drop(vel?: THREE.Vector3, spin = 6) {
    const holder = this.holder;
    this.group.updateMatrixWorld(true);
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    this.group.getWorldPosition(pos);
    this.group.getWorldQuaternion(quat);
    this.group.removeFromParent();
    this.game.scene.add(this.group);
    this.group.position.copy(pos);
    this.group.quaternion.copy(quat);
    this.group.scale.setScalar(1);
    if (holder) holder.weapon = null;
    this.holder = null;
    const w = this.game.physics.world;
    // center of mass ~ middle of the weapon
    const desc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(pos.x, Math.max(0.1, pos.y), pos.z)
      .setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w })
      .setLinearDamping(0.2)
      .setAngularDamping(0.8)
      .setCcdEnabled(true);
    if (vel) desc.setLinvel(vel.x, vel.y, vel.z);
    desc.setAngvel({ x: rand(-spin, spin), y: rand(-spin, spin), z: rand(-spin, spin) });
    const b = w.createRigidBody(desc);
    const cd = RAPIER.ColliderDesc.cuboid(this.half.x, this.half.y, this.half.z)
      .setTranslation(0, this.half.y * 0.8, 0)
      .setMass(this.kind === 'club' ? 1.0 : this.kind === 'sword' ? 1.3 : 0.3)
      .setFriction(0.8)
      .setRestitution(0.25)
      .setCollisionGroups(groups(G.PROP, G.STATIC | G.CORPSE | G.RAGDOLL | G.PROP));
    w.createCollider(cd, b);
    this.body = b;
    if (!this.game.weapons.includes(this)) this.game.weapons.push(this);
  }

  private detachBody() {
    if (this.body) {
      this.game.physics.world.removeRigidBody(this.body);
      this.body = null;
    }
  }

  worldPos(out: THREE.Vector3) {
    return this.group.getWorldPosition(out);
  }

  /** Tip of the weapon in world space. */
  tip(out: THREE.Vector3) {
    this.group.updateMatrixWorld(true);
    return out.set(0, this.length * 0.85, 0).applyMatrix4(this.group.matrixWorld);
  }

  /** Use up durability; returns true if it broke. */
  wear(amount = 1): boolean {
    this.durability -= amount;
    if (this.durability <= 0 && !this.broken) {
      this.breakApart();
      return true;
    }
    return false;
  }

  breakApart() {
    this.broken = true;
    const p = new THREE.Vector3();
    this.tip(p);
    const g = this.game;
    if (this.kind === 'club') {
      g.audio.play('wood_break', { pos: p });
      g.fx.woodBurst(p, 10);
    } else {
      g.audio.play('sword_clash', { pos: p });
      g.audio.play('metal_hit', { pos: p, vol: 0.6 });
      g.fx.sparks(p, new THREE.Vector3(0, 1, 0), 24);
    }
    // the handle remains: drop it
    const holder = this.holder;
    this.drop(new THREE.Vector3(rand(-1, 1), 2, rand(-1, 1)), 10);
    // shorten visually (blade/bat broken off)
    this.group.children.forEach((c, i) => {
      if (i > 0) c.scale.set(1, 0.35, 1);
    });
    if (holder) holder.weapon = null;
  }

  update(dt: number) {
    if (this.body) {
      const t = this.body.translation();
      const r = this.body.rotation();
      this.group.position.set(t.x, t.y, t.z);
      this.group.quaternion.set(r.x, r.y, r.z, r.w);
      // settled weapons: freeze body (stays as prop, keeps collision)
    }
    if (this.thrown) {
      this.thrown.t += dt;
      const tg = this.thrown.target;
      if (tg && tg.alive) {
        this.worldPos(_v);
        const c = new THREE.Vector3();
        tg.bodyPoint('chest', c);
        if (_v.distanceTo(c) < 0.55) {
          this.game.onWeaponThrownHit(this, tg);
          this.thrown = null;
        }
      }
      if (this.thrown && this.thrown.t > 1.5) this.thrown = null;
    }
    void _q;
  }

  /** Is this dropped weapon available for pickup? */
  get pickable() {
    return !this.holder && !this.broken && !this.thrown;
  }
}
