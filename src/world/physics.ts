import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { Arena } from './arena';

export { RAPIER };

/** Collision group bits. */
export const G = { STATIC: 1, RAGDOLL: 2, CORPSE: 4, PROP: 8, DEBRIS: 16, LIVE: 32 } as const;
export const groups = (member: number, filter: number) => ((member & 0xffff) << 16) | (filter & 0xffff);

export class Physics {
  world!: RAPIER.World;
  private acc = 0;
  readonly step = 1 / 60;
  ready = false;
  stepsLastFrame = 0;
  activeBodies = 0;

  async init(arena: Arena) {
    await RAPIER.init();
    this.world = new RAPIER.World({ x: 0, y: -11.5, z: 0 });
    this.world.timestep = this.step;
    this.world.integrationParameters.numSolverIterations = 4;
    // floor
    const floor = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(60, 0.5, 60).setFriction(0.9).setCollisionGroups(groups(G.STATIC, 0xffff)), floor);
    // obstacles
    for (const o of arena.obstacles) {
      const hx = (o.maxX - o.minX) / 2, hz = (o.maxZ - o.minZ) / 2, hy = o.h / 2;
      const b = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation((o.minX + o.maxX) / 2, hy, (o.minZ + o.maxZ) / 2));
      this.world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setFriction(0.7).setCollisionGroups(groups(G.STATIC, 0xffff)), b);
    }
    this.ready = true;
  }

  /** Fixed-step simulation. Returns number of steps taken. */
  update(dt: number) {
    if (!this.ready) return 0;
    this.acc += Math.min(dt, 0.1);
    let n = 0;
    while (this.acc >= this.step && n < 4) {
      this.world.step();
      this.acc -= this.step;
      n++;
    }
    this.stepsLastFrame = n;
    return n;
  }
}

export const toV = (v: { x: number; y: number; z: number }, out = new THREE.Vector3()) => out.set(v.x, v.y, v.z);
export const toQ = (q: { x: number; y: number; z: number; w: number }, out = new THREE.Quaternion()) => out.set(q.x, q.y, q.z, q.w);
