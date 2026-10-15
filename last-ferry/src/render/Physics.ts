// Physics world for ragdolls, gibs and other loose bodies (cannon-es).
// Gameplay itself does not depend on it: bodies are presentation; the logic
// decides where each corpse lies and the ragdolls are guided there.
//
// Cost notes: the deck is an infinite plane (sphere-plane contacts are the
// cheapest pair cannon-es has; the old box slab sent every contact through
// sphereBox / convex clipping). The pier's edges are handled per part instead:
// a part that is off the planks (or already below them) stops colliding with
// the deck and falls into the sea (see Ragdoll.sync → Physics.groundMask).
import * as CANNON from 'cannon-es';
import { PIER } from '../config/world';
import { DECK_X0 } from './env/Deck';

export const GROUP_GROUND = 1;
/** Ragdolls use 8 rotating group bits so a ragdoll's own parts never collide. */
export const RAGDOLL_BITS = [2, 4, 8, 16, 32, 64, 128, 256];
export const ALL_RAGDOLLS = RAGDOLL_BITS.reduce((a, b) => a | b, 0);
export const GROUP_DEBRIS = 512;

const _imp = new CANNON.Vec3();
const _zero = new CANNON.Vec3();

export class Physics {
  readonly world: CANNON.World;
  /** The deck planks (wet wood). */
  readonly iceMat = new CANNON.Material('deck');
  readonly fleshMat = new CANNON.Material('flesh');
  readonly ground: CANNON.Body;
  private acc = 0;
  private nextBit = 0;
  readonly step = 1 / 60;
  /** Interpolation factor between the last two physics steps (0..1), for rendering. */
  alpha = 1;
  /** Steps taken by the last update (stats). */
  lastSteps = 0;

  constructor() {
    this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -15, 0) });
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.world.allowSleep = true;
    // Ragdolls only need to look right for a second or two; 5 iterations keep
    // the joints together (twist is free, see Ragdoll) at ~60% of the old cost.
    (this.world.solver as CANNON.GSSolver).iterations = 5;
    this.world.quatNormalizeFast = true;
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

    // The pier deck: the plane y = 0 (the planks' top face). Past its edges
    // parts stop colliding with it (groundMask) and fall into the sea.
    this.ground = new CANNON.Body({ mass: 0, material: this.iceMat });
    this.ground.addShape(new CANNON.Plane());
    this.ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.ground.collisionFilterGroup = GROUP_GROUND;
    this.ground.collisionFilterMask = ALL_RAGDOLLS | GROUP_DEBRIS;
    this.world.addBody(this.ground);
  }

  /** True when (x, z) is over the planks (the deck plane collides there). */
  static onDeck(x: number, z: number): boolean {
    return x >= DECK_X0 && x <= PIER.maxX && z >= PIER.minZ && z <= PIER.maxZ;
  }

  /**
   * Keep a body's deck collision in step with where it is: over the planks it
   * lands on them; off the edge (or once it has dropped below the planks) it
   * falls into the sea.
   */
  static groundMask(b: CANNON.Body): void {
    const p = b.position;
    const on = p.y > -0.15 && Physics.onDeck(p.x, p.z);
    const m = b.collisionFilterMask;
    const want = on ? m | GROUP_GROUND : m & ~GROUP_GROUND;
    if (want !== m) b.collisionFilterMask = want;
  }

  /** Next ragdoll collision bit (cycled). */
  takeBit(): number {
    const b = RAGDOLL_BITS[this.nextBit];
    this.nextBit = (this.nextBit + 1) % RAGDOLL_BITS.length;
    return b;
  }

  /** Simulated (dynamic) bodies right now. */
  get bodyCount(): number {
    return this.world.bodies.length - 1;
  }

  update(dt: number): void {
    this.acc += Math.min(dt, 0.1);
    let n = 0;
    // Skip the solver entirely when nothing moves (only the deck is in the world).
    const idle = this.world.bodies.length <= 1;
    while (this.acc >= this.step && n < 3) {
      if (!idle) this.world.step(this.step);
      this.acc -= this.step;
      n++;
    }
    if (n === 3) this.acc = Math.min(this.acc, this.step * 0.5);
    this.lastSteps = n;
    this.alpha = Math.min(1, Math.max(0, this.acc / this.step));
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
      b.applyImpulse(_imp.set(dx * k * b.mass * 0.02, (Math.abs(dy) + 1.2) * k * b.mass * 0.02, dz * k * b.mass * 0.02), _zero);
    }
  }

  /** Remove every body except the deck (new world attached). */
  reset(): void {
    for (const c of [...this.world.constraints]) this.world.removeConstraint(c);
    for (const b of [...this.world.bodies]) if (b !== this.ground) this.world.removeBody(b);
    this.acc = 0;
    this.alpha = 1;
  }
}
