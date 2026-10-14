// Physics world for ragdolls, gibs and other loose bodies (cannon-es).
// Gameplay itself does not depend on it: bodies are presentation; the logic
// decides where each corpse lies and the ragdolls are guided there.
import * as CANNON from 'cannon-es';
import { PIER } from '../config/world';
import { DECK_X0 } from './env/Deck';

export const GROUP_GROUND = 1;
/** Ragdolls use 8 rotating group bits so a ragdoll's own parts never collide. */
export const RAGDOLL_BITS = [2, 4, 8, 16, 32, 64, 128, 256];
export const ALL_RAGDOLLS = RAGDOLL_BITS.reduce((a, b) => a | b, 0);
export const GROUP_DEBRIS = 512;

export class Physics {
  readonly world: CANNON.World;
  /** The deck planks (wet wood). */
  readonly iceMat = new CANNON.Material('deck');
  readonly fleshMat = new CANNON.Material('flesh');
  readonly ground: CANNON.Body;
  private acc = 0;
  private nextBit = 0;
  readonly step = 1 / 60;

  constructor() {
    this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -15, 0) });
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.world.allowSleep = true;
    (this.world.solver as CANNON.GSSolver).iterations = 12;
    this.world.defaultContactMaterial.friction = 0.35;
    this.world.addContactMaterial(
      new CANNON.ContactMaterial(this.iceMat, this.fleshMat, {
        // Wet planks: bodies skid a little, then stop.
        friction: 0.42,
        restitution: 0.03,
        contactEquationStiffness: 1e7,
        contactEquationRelaxation: 4,
      }),
    );
    this.world.addContactMaterial(new CANNON.ContactMaterial(this.fleshMat, this.fleshMat, { friction: 0.6, restitution: 0.02 }));

    // The pier deck: a static slab whose top face is the planks (y = 0). Past
    // its edges bodies fall into the sea.
    this.ground = new CANNON.Body({ mass: 0, material: this.iceMat });
    const x0 = DECK_X0;
    const x1 = PIER.maxX;
    const hz = (PIER.maxZ - PIER.minZ) / 2;
    this.ground.addShape(new CANNON.Box(new CANNON.Vec3((x1 - x0) / 2, 1, hz)), new CANNON.Vec3((x0 + x1) / 2, -1, (PIER.minZ + PIER.maxZ) / 2));
    this.ground.collisionFilterGroup = GROUP_GROUND;
    this.ground.collisionFilterMask = ALL_RAGDOLLS | GROUP_DEBRIS;
    this.world.addBody(this.ground);
  }

  /** Next ragdoll collision bit (cycled). */
  takeBit(): number {
    const b = RAGDOLL_BITS[this.nextBit];
    this.nextBit = (this.nextBit + 1) % RAGDOLL_BITS.length;
    return b;
  }

  update(dt: number): void {
    this.acc += Math.min(dt, 0.1);
    let n = 0;
    while (this.acc >= this.step && n < 4) {
      this.world.step(this.step);
      this.acc -= this.step;
      n++;
    }
    if (n === 4) this.acc = 0;
  }

  /** Radial impulse on every dynamic body near an explosion. */
  blast(x: number, y: number, z: number, radius: number, strength: number): void {
    for (const b of this.world.bodies) {
      if (b.mass === 0) continue;
      const dx = b.position.x - x;
      const dy = b.position.y - y + 0.5;
      const dz = b.position.z - z;
      const d = Math.hypot(dx, dy, dz);
      if (d > radius) continue;
      const k = (strength * (1 - d / radius)) / Math.max(0.3, d);
      b.wakeUp();
      b.applyImpulse(new CANNON.Vec3(dx * k * b.mass * 0.02, (Math.abs(dy) + 1.2) * k * b.mass * 0.02, dz * k * b.mass * 0.02));
    }
  }

  /** Remove every body except the deck (new world attached). */
  reset(): void {
    for (const c of [...this.world.constraints]) this.world.removeConstraint(c);
    for (const b of [...this.world.bodies]) if (b !== this.ground) this.world.removeBody(b);
    this.acc = 0;
  }
}
