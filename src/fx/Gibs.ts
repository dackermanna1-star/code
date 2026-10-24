import * as THREE from 'three';
import { RAPIER, GROUPS, BodySync, type RBody } from '../physics/Physics';
import { ctx } from '../game/ctx';
import { events } from '../game/events';
import { rand } from '../core/math';

interface Gib {
  body: RBody;
  sync: BodySync;
  mesh: THREE.Mesh;
  age: number;
  bleed: number;
}

/** Severed limbs / heads as physical chunks. */
export class Gibs {
  private list: Gib[] = [];
  max = 40;

  constructor(private scene: THREE.Scene) {
    ctx.gibs = this;
  }

  spawn(mesh: THREE.Mesh, half: THREE.Vector3, vel: THREE.Vector3, _owner: unknown): void {
    const { world } = ctx.physics;
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(mesh.position.x, mesh.position.y, mesh.position.z)
        .setRotation({ x: mesh.quaternion.x, y: mesh.quaternion.y, z: mesh.quaternion.z, w: mesh.quaternion.w })
        .setLinvel(vel.x, vel.y, vel.z)
        .setAngvel({ x: rand(-10, 10), y: rand(-10, 10), z: rand(-10, 10) })
        .setLinearDamping(0.1)
        .setAngularDamping(0.8)
        .setCcdEnabled(true),
    );
    const col = world.createCollider(
      RAPIER.ColliderDesc.cuboid(half.x * 0.9, half.y * 0.9, half.z * 0.9).setDensity(500).setFriction(0.8).setRestitution(0.15).setCollisionGroups(GROUPS.RAGDOLL),
      body,
    );
    ctx.physics.register(col, { kind: 'debris', material: 'flesh' });
    this.scene.add(mesh);
    const g: Gib = { body, sync: new BodySync(body, mesh), mesh, age: 0, bleed: 3 };
    this.list.push(g);
    if (this.list.length > this.max) {
      const old = this.list.shift()!;
      ctx.physics.removeBody(old.body);
      old.mesh.removeFromParent();
    }
  }

  capture(): void {
    for (const g of this.list) if (!g.body.isSleeping()) g.sync.capture();
  }

  update(dt: number, alpha: number): void {
    for (const g of this.list) {
      g.age += dt;
      g.sync.apply(alpha);
      if (g.bleed > 0) {
        g.bleed -= dt;
        if (Math.random() < dt * 14) events.emit('bleed', { pos: g.mesh.position.clone(), amount: 0.6 * Math.max(0, g.bleed / 3) });
      }
    }
  }

  clear(): void {
    for (const g of this.list) {
      ctx.physics.removeBody(g.body);
      g.mesh.removeFromParent();
    }
    this.list.length = 0;
  }
}
